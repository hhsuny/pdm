// pomodoro.js — Pomodoro Timer Module
import { state } from '../state.js';
import { db } from '../db.js';
import { router } from '../router.js';
import { today, formatDuration, niceDate, addDays, getWeekDates } from '../utils.js';

// Audio Context (lazy init)
let audioCtx = null;
let noiseCtx = null;
let noiseNodes = [];

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// ============================================================
// Timer Logic
// ============================================================
const TimerState = { IDLE: 'idle', FOCUS: 'focus', BREAK: 'break', PAUSED: 'paused' };

class PomodoroTimer {
  constructor() {
    this.state = TimerState.IDLE;
    this.startedAt = null;
    this.elapsedBeforePause = 0; // seconds accumulated before current pause
    this.totalSeconds = 25 * 60;
    this.tickInterval = null;
    this.onTick = null;
    this.onComplete = null;
  }

  get remainingSeconds() {
    if (this.state === TimerState.IDLE) return this.totalSeconds;
    if (this.state === TimerState.PAUSED) return this.totalSeconds - this.elapsedBeforePause;
    const elapsed = this.elapsedBeforePause + Math.floor((Date.now() - this.startedAt) / 1000);
    return Math.max(0, this.totalSeconds - elapsed);
  }

  get elapsedSeconds() {
    if (this.state === TimerState.IDLE) return 0;
    if (this.state === TimerState.PAUSED) return this.elapsedBeforePause;
    return this.elapsedBeforePause + Math.floor((Date.now() - this.startedAt) / 1000);
  }

  get isRunning() { return this.state === TimerState.FOCUS || this.state === TimerState.BREAK; }

  start(sessionType, durationMin) {
    this.state = sessionType === 'break' ? TimerState.BREAK : TimerState.FOCUS;
    this.totalSeconds = durationMin * 60;
    this.elapsedBeforePause = 0;
    this.startedAt = Date.now();
    this._startTick();
  }

  pause() {
    if (!this.isRunning) return;
    this.elapsedBeforePause += Math.floor((Date.now() - this.startedAt) / 1000);
    this.state = TimerState.PAUSED;
    this._stopTick();
  }

  resume() {
    if (this.state !== TimerState.PAUSED) return;
    // Re-determine session type from previous state
    // We track it by just looking at what the total was set to
    this.startedAt = Date.now();
    this.state = TimerState.FOCUS; // simplified; the _sessionType tracks this externally
    this._startTick();
  }

  reset() {
    this.state = TimerState.IDLE;
    this.startedAt = null;
    this.elapsedBeforePause = 0;
    this._stopTick();
  }

  _startTick() {
    this._stopTick();
    this.tickInterval = setInterval(() => {
      const remaining = this.remainingSeconds;
      if (this.onTick) this.onTick(remaining, this.totalSeconds);
      if (remaining <= 0) {
        this._stopTick();
        if (this.onComplete) this.onComplete();
      }
    }, 250); // 4x per second for smoother display
  }

  _stopTick() {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
  }

  destroy() { this._stopTick(); }
}

// ============================================================
// White Noise Generator
// ============================================================
function createWhiteNoise(type) {
  stopWhiteNoise();
  const ctx = getAudioCtx();
  noiseCtx = ctx;
  noiseNodes = [];

  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const gain = ctx.createGain();
  gain.gain.value = 0.08;

  const filter = ctx.createBiquadFilter();

  switch (type) {
    case 'rain':
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      gain.gain.value = 0.1;
      break;
    case 'fan':
      filter.type = 'bandpass';
      filter.frequency.value = 400;
      filter.Q.value = 0.5;
      gain.gain.value = 0.06;
      break;
    case 'cafe':
      filter.type = 'lowpass';
      filter.frequency.value = 2000;
      gain.gain.value = 0.05;
      break;
    default:
      filter.type = 'lowpass';
      filter.frequency.value = 1000;
  }

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(0);

  noiseNodes = [source, filter, gain];
}

function stopWhiteNoise() {
  try { noiseNodes.forEach(n => { try { n.disconnect(); } catch {} }); } catch {}
  noiseNodes = [];
  noiseCtx = null;
}

function setNoiseVolume(vol) {
  if (noiseNodes.length >= 3) {
    noiseNodes[2].gain.value = vol;
  }
}

// ============================================================
// Sound Effects
// ============================================================
function playCompletionSound(isFocus = true) {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const notes = isFocus ? [523.25, 659.25, 783.99] : [783.99, 659.25]; // C5-E5-G5 or G5-E5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, now + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + i * 0.15);
    osc.stop(now + i * 0.15 + 0.5);
  });
}

// ============================================================
// Module
// ============================================================
export const pomodoroModule = {
  _timer: null,
  _sessionType: 'focus',
  _focusMin: 25,
  _breakMin: 5,
  _completedFocus: 0,
  _completedBreak: 0,
  _cleanup: [],
  _view: 'timer', // 'timer' | 'stats'
  _noiseType: null,

  async render(params, container) {
    this.destroy();
    this._timer = new PomodoroTimer();
    const path = router.getCurrentPath();
    this._view = path === '/pomodoro/stats' ? 'stats' : 'timer';

    // Load settings
    const settings = db.getSettings();
    this._focusMin = settings.pomodoroFocusMin || 25;
    this._breakMin = settings.pomodoroBreakMin || 5;
    this._noiseType = settings.whiteNoiseType || null;

    // Load today's counts
    const todayStats = await db.getPomodorosForDate(state.currentDate);
    this._completedFocus = todayStats.filter(p => p.sessionType === 'focus' && !p.interrupted).length;
    this._completedBreak = todayStats.filter(p => p.sessionType === 'break' && !p.interrupted).length;

    // Timer callbacks
    this._timer.onTick = (rem, total) => {
      this._updateDisplay(rem, total);
    };
    this._timer.onComplete = () => {
      this._onComplete();
    };

    if (this._view === 'stats') {
      await this._renderStats(container);
    } else {
      container.innerHTML = this._buildTimerHTML();
      this._bindTimerEvents(container);
      this._updateDisplay(this._timer.totalSeconds, this._timer.totalSeconds);
    }

    // Listen for space key
    const onSpace = () => this._toggleTimer();
    state.on('pomodoro:space', onSpace);
    this._cleanup.push(() => state.off('pomodoro:space', onSpace));

    // Listen for date changes
    const onDate = async () => {
      const s = await db.getPomodorosForDate(state.currentDate);
      this._completedFocus = s.filter(p => p.sessionType === 'focus' && !p.interrupted).length;
      this._completedBreak = s.filter(p => p.sessionType === 'break' && !p.interrupted).length;
      this._updateCounts();
    };
    state.on('date:changed', onDate);
    this._cleanup.push(() => state.off('date:changed', onDate));
  },

  _buildTimerHTML() {
    const totalSecs = this._sessionType === 'break' ? this._breakMin * 60 : this._focusMin * 60;
    const statusLabel = this._timer.isRunning
      ? (this._sessionType === 'break' ? '休息中' : '专注中')
      : '准备开始';
    return `
      <div class="p-6 lg:p-10 max-w-lg mx-auto">
        <div class="flex items-center justify-between mb-6">
          <button class="btn-ghost text-sm" data-action="toggle-view">📊 统计</button>
          <button class="btn-ghost text-sm" data-action="fullscreen">⛶ 沉浸</button>
        </div>
        <div class="glass-card p-10 text-center">
          <!-- Session Type Toggle -->
          <div class="flex justify-center gap-2 mb-6">
            <button class="btn-secondary text-sm ${this._sessionType==='focus'?'!bg-[var(--color-blue)] !text-white':''}" data-action="set-focus">🍅 专注</button>
            <button class="btn-secondary text-sm ${this._sessionType==='break'?'!bg-[var(--color-blue)] !text-white':''}" data-action="set-break">☕ 休息</button>
          </div>
          <!-- Timer Display -->
          <div class="text-7xl lg:text-8xl font-bold font-mono tracking-tight mb-2" id="pomodoro-display">${this._fmtTime(totalSecs)}</div>
          <p class="text-secondary text-sm mb-8" id="pomodoro-status">${statusLabel}</p>
          <!-- Controls -->
          <div class="flex justify-center gap-4">
            <button class="btn-primary text-lg px-8 py-3" id="pomodoro-start-btn" data-action="toggle">▶ 开始</button>
            <button class="btn-ghost text-sm" data-action="reset" id="pomodoro-reset-btn">↺ 重置</button>
          </div>
          <!-- Today Counts -->
          <div class="flex justify-center gap-6 mt-6 pt-6 border-t border-[var(--color-border)]">
            <div><span class="font-bold text-lg" id="focus-count">${this._completedFocus}</span><p class="text-xs text-secondary">专注</p></div>
            <div><span class="font-bold text-lg" id="break-count">${this._completedBreak}</span><p class="text-xs text-secondary">休息</p></div>
          </div>
          <!-- White Noise -->
          <div class="mt-4">
            <select class="input-field text-sm w-auto inline-block" data-action="noise-select">
              <option value="">🔇 无白噪音</option>
              <option value="rain" ${this._noiseType==='rain'?'selected':''}>🌧️ 雨声</option>
              <option value="fan" ${this._noiseType==='fan'?'selected':''}>🌀 风扇</option>
              <option value="cafe" ${this._noiseType==='cafe'?'selected':''}>☕ 咖啡馆</option>
            </select>
          </div>
        </div>
      </div>`;
  },

  _bindTimerEvents(container) {
    container.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="toggle"]')) this._toggleTimer();
      if (e.target.closest('[data-action="reset"]')) this._resetTimer();
      if (e.target.closest('[data-action="set-focus"]')) this._setSessionType('focus');
      if (e.target.closest('[data-action="set-break"]')) this._setSessionType('break');
      if (e.target.closest('[data-action="fullscreen"]')) this._toggleFullscreen();
      if (e.target.closest('[data-action="toggle-view"]')) router.navigate('/pomodoro/stats');
    });

    container.addEventListener('change', (e) => {
      if (e.target.closest('[data-action="noise-select"]')) {
        const type = e.target.value;
        this._noiseType = type;
        db.saveSettings({ whiteNoiseType: type });
        if (type) createWhiteNoise(type); else stopWhiteNoise();
      }
    });
  },

  _toggleTimer() {
    if (this._timer.isRunning) {
      // Pause
      this._timer.pause();
      this._sessionType = this._sessionType;
      document.getElementById('pomodoro-start-btn').textContent = '▶ 继续';
      document.getElementById('pomodoro-status').textContent = '已暂停';
    } else if (this._timer.state === TimerState.PAUSED) {
      // Resume
      this._timer.resume();
      this._timer.state = this._sessionType === 'break' ? TimerState.BREAK : TimerState.FOCUS;
      document.getElementById('pomodoro-start-btn').textContent = '⏸ 暂停';
      document.getElementById('pomodoro-status').textContent = this._sessionType === 'break' ? '休息中' : '专注中';
    } else {
      // Start
      const min = this._sessionType === 'break' ? this._breakMin : this._focusMin;
      this._timer.start(this._sessionType, min);
      document.getElementById('pomodoro-start-btn').textContent = '⏸ 暂停';
      document.getElementById('pomodoro-status').textContent = this._sessionType === 'break' ? '休息中' : '专注中';

      // Auto-start white noise if configured
      if (this._noiseType && !noiseNodes.length) {
        createWhiteNoise(this._noiseType);
      }
    }
  },

  _resetTimer() {
    this._timer.reset();
    if (this._sessionType === 'break' && this._timer.elapsedBeforePause > 0) {
      // Record interrupted break
      db.addPomodoro({
        date: today(), durationMin: this._breakMin, sessionType: 'break',
        completedAt: new Date().toISOString(), interrupted: true
      });
    } else if (this._sessionType === 'focus' && this._timer.elapsedBeforePause > 0) {
      db.addPomodoro({
        date: today(), durationMin: this._focusMin, sessionType: 'focus',
        completedAt: new Date().toISOString(), interrupted: true
      });
    }
    this._timer.elapsedBeforePause = 0;
    const totalSecs = this._sessionType === 'break' ? this._breakMin * 60 : this._focusMin * 60;
    this._updateDisplay(totalSecs, totalSecs);
    document.getElementById('pomodoro-start-btn').textContent = '▶ 开始';
    document.getElementById('pomodoro-status').textContent = '准备开始';
    stopWhiteNoise();
  },

  async _onComplete() {
    const isFocus = this._sessionType === 'focus';
    playCompletionSound(isFocus);

    // Record to db
    await db.addPomodoro({
      date: today(),
      durationMin: isFocus ? this._focusMin : this._breakMin,
      sessionType: this._sessionType,
      completedAt: new Date().toISOString(),
      interrupted: false
    });

    if (isFocus) {
      this._completedFocus++;
      // Auto-switch to break
      this._sessionType = 'break';
      this._timer.start('break', this._breakMin);
      state.emit('pomodoro:completed', { date: today(), duration: this._focusMin });
    } else {
      this._completedBreak++;
      // Auto-switch to focus
      this._sessionType = 'focus';
      this._timer.start('focus', this._focusMin);
      state.emit('pomodoro:breakCompleted', { date: today(), duration: this._breakMin });
    }

    // Refresh UI
    const container = document.getElementById('content');
    if (container && state.currentModule === 'pomodoro') {
      container.innerHTML = this._buildTimerHTML();
      this._bindTimerEvents(container);
    }
    this._updateCounts();
  },

  _setSessionType(type) {
    if (this._timer.isRunning || this._timer.state === TimerState.PAUSED) return;
    this._sessionType = type;
    const totalSecs = type === 'break' ? this._breakMin * 60 : this._focusMin * 60;
    this._updateDisplay(totalSecs, totalSecs);
    document.getElementById('pomodoro-status').textContent = '准备开始';

    // Refresh UI
    const container = document.getElementById('content');
    if (container) {
      container.innerHTML = this._buildTimerHTML();
      this._bindTimerEvents(container);
    }
  },

  _updateDisplay(remainingSecs, totalSecs) {
    const el = document.getElementById('pomodoro-display');
    if (el) el.textContent = this._fmtTime(remainingSecs);
    // Update tab title
    const icon = this._sessionType === 'break' ? '☕' : '🍅';
    const label = this._sessionType === 'break' ? '休息' : '专注';
    document.title = `${icon} ${this._fmtTime(remainingSecs)} - ${label}`;
  },

  _updateCounts() {
    const fc = document.getElementById('focus-count');
    const bc = document.getElementById('break-count');
    if (fc) fc.textContent = this._completedFocus;
    if (bc) bc.textContent = this._completedBreak;
  },

  _fmtTime(secs) {
    const m = Math.floor(Math.max(0, secs) / 60);
    const s = Math.floor(Math.max(0, secs) % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  _toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  },

  async _renderStats(container) {
    const todayStr = state.currentDate;
    const weekDates = getWeekDates(todayStr);
    const weekStart = weekDates[0];
    const weekEnd = weekDates[6];
    const monthStart = todayStr.substring(0, 7) + '-01';
    const lastDay = new Date(parseInt(todayStr.substring(0,4)), parseInt(todayStr.substring(5,7)), 0).getDate();
    const monthEnd = todayStr.substring(0, 7) + '-' + String(lastDay).padStart(2,'0');

    const [todayData, weekData, monthData] = await Promise.all([
      db.getPomodorosForDate(todayStr),
      db.getPomodoroStatsForRange(weekStart, weekEnd),
      db.getPomodoroStatsForRange(monthStart, monthEnd)
    ]);

    const todayFocus = todayData.filter(p => p.sessionType === 'focus' && !p.interrupted).length;
    const todayBreak = todayData.filter(p => p.sessionType === 'break' && !p.interrupted).length;
    const todayInterrupted = todayData.filter(p => p.interrupted).length;
    const todayFocusMin = todayData.filter(p => p.sessionType === 'focus').reduce((s, p) => s + (p.durationMin || 0), 0);

    // Weekly bar chart data
    const weekBars = [];
    for (const d of weekDates) {
      const items = weekData.filter(p => p.date === d);
      weekBars.push({
        label: d.substring(5),
        focus: items.filter(p => p.sessionType === 'focus' && !p.interrupted).length,
        interrupted: items.filter(p => p.interrupted).length
      });
    }

    const monthFocus = monthData.filter(p => p.sessionType === 'focus' && !p.interrupted).length;
    const monthTotalMin = monthData.filter(p => p.sessionType === 'focus').reduce((s, p) => s + (p.durationMin || 0), 0);
    const distinctDays = new Set(monthData.filter(p => p.sessionType === 'focus' && !p.interrupted).map(p => p.date)).size;

    // Recent history
    const recent = [...monthData].sort((a, b) => b.completedAt?.localeCompare(a.completedAt) || b.date.localeCompare(a.date)).slice(0, 30);

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-3xl mx-auto fade-in">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold">🍅 番茄统计</h2>
          <button class="btn-ghost text-sm" data-action="toggle-view">⏱ 计时器</button>
        </div>
        <!-- Today Summary -->
        <div class="glass-card-subtle p-5 mb-4">
          <h3 class="text-sm font-semibold text-secondary mb-3">今日 ${niceDate(todayStr)}</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div><span class="text-2xl font-bold text-[var(--color-blue)]">${todayFocus}</span><p class="text-xs text-secondary">专注完成</p></div>
            <div><span class="text-2xl font-bold">${todayBreak}</span><p class="text-xs text-secondary">休息完成</p></div>
            <div><span class="text-2xl font-bold">${formatDuration(todayFocusMin)}</span><p class="text-xs text-secondary">专注时长</p></div>
            <div><span class="text-2xl font-bold ${todayInterrupted?'text-[#FF9500]':''}">${todayInterrupted}</span><p class="text-xs text-secondary">中断次数</p></div>
          </div>
        </div>
        <!-- Weekly Chart -->
        <div class="glass-card-subtle p-5 mb-4">
          <h3 class="text-sm font-semibold text-secondary mb-3">本周 ${weekStart} ~ ${weekEnd}</h3>
          <div class="flex items-end gap-1 h-32" id="week-bars">
            ${weekBars.map(b => `
              <div class="flex-1 flex flex-col items-center justify-end h-full">
                <div class="w-full rounded-t-md bg-[var(--color-blue)]" style="height:${Math.min(b.focus*12,95)}%"></div>
                <span class="text-[10px] text-secondary mt-1">${b.label}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <!-- Month Summary -->
        <div class="glass-card-subtle p-5 mb-4">
          <h3 class="text-sm font-semibold text-secondary mb-3">本月概览</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
            <div><span class="text-2xl font-bold">${monthFocus}</span><p class="text-xs text-secondary">总专注次数</p></div>
            <div><span class="text-2xl font-bold">${formatDuration(monthTotalMin)}</span><p class="text-xs text-secondary">总专注时长</p></div>
            <div><span class="text-2xl font-bold">${distinctDays}</span><p class="text-xs text-secondary">专注天数</p></div>
          </div>
        </div>
        <!-- Recent History -->
        <div class="glass-card-subtle p-5">
          <h3 class="text-sm font-semibold text-secondary mb-3">最近记录</h3>
          <div class="space-y-2" id="pomodoro-history">
            ${recent.length === 0 ? '<p class="text-sm text-secondary text-center">暂无记录</p>' : recent.map(p => `
              <div class="flex items-center justify-between text-sm py-1 border-b border-[var(--color-border)]">
                <span>${p.date} ${new Date(p.completedAt).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'})}</span>
                <span>${p.interrupted ? '❌' : p.sessionType === 'focus' ? '🍅' : '☕'} ${p.sessionType === 'focus' ? '专注' : '休息'} ${p.durationMin}分钟</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>`;

    container.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="toggle-view"]')) router.navigate('/pomodoro');
    });
  },

  destroy() {
    if (this._timer) { this._timer.destroy(); this._timer = null; }
    stopWhiteNoise();
    document.title = '个人管理';
    this._cleanup.forEach(fn => fn());
    this._cleanup = [];
  }
};

// Export TimerState for external reference
export { TimerState };
