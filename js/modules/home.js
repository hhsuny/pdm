// home.js — Dashboard home page
import { state } from '../state.js';
import { router } from '../router.js';
import { db } from '../db.js';
import { niceDate, formatCurrency, formatDuration } from '../utils.js';

export const homeModule = {
  _cleanup: [],

  async render(params, container) {
    this.destroy();
    const dateStr = state.currentDate;
    const stats = await db.getDayStats(dateStr);
    const diary = await db.getDiary(dateStr);
    const accounts = await db.getAccounts();
    const totalAssets = accounts.reduce((s, a) => s + (a.balance || 0), 0);
    const habits = await db.getHabits();
    const habitLogs = await db.getHabitLogsForDate(dateStr);

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-5xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between mb-8 fade-in">
          <div>
            <h1 class="text-2xl lg:text-3xl font-bold tracking-tight">${niceDate(dateStr)}</h1>
            <p class="text-secondary text-sm mt-1">欢迎回来，${state.currentUser?.username || ''}</p>
          </div>
          <div class="flex gap-2">
            <button class="btn-secondary text-sm" data-action="quick-pomodoro">🍅 开始专注</button>
          </div>
        </div>

        <!-- Summary Cards Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8" id="card-grid">
          ${this._pomodoroCard(stats)}
          ${this._scheduleCard(stats)}
          ${this._diaryCard(stats, diary)}
          ${this._financeCard(stats, totalAssets)}
          ${this._habitsCard(habits, habitLogs)}
          ${this._quickActionsCard()}
        </div>
      </div>`;

    this._bindEvents(container);
    this._listenDate();
  },

  _pomodoroCard(stats) {
    const p = stats.pomodoros;
    return `
      <div class="glass-card clickable p-5 cursor-pointer" data-nav="/pomodoro">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-2xl">🍅</span>
          <h3 class="font-semibold">番茄钟</h3>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div><span class="text-2xl font-bold">${p.focusCompleted}</span><p class="text-xs text-secondary">专注完成</p></div>
          <div><span class="text-2xl font-bold">${p.breakCompleted}</span><p class="text-xs text-secondary">休息完成</p></div>
        </div>
        <p class="text-xs text-secondary mt-2">累计 ${formatDuration(p.totalFocusMin)}</p>
      </div>`;
  },

  _scheduleCard(stats) {
    const s = stats.schedule;
    return `
      <div class="glass-card clickable p-5 cursor-pointer" data-nav="/schedule">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-2xl">📋</span>
          <h3 class="font-semibold">日程</h3>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-bold">${s.done}/${s.total}</span>
          <span class="text-xs text-secondary">项已完成</span>
        </div>
        ${s.total > 0 ? `
          <div class="mt-2 progress-track"><div class="progress-fill" style="width:${s.rate}%"></div></div>
          <p class="text-xs text-secondary mt-1">完成率 ${s.rate}%</p>
        ` : '<p class="text-xs text-secondary mt-2">今日暂无日程</p>'}
      </div>`;
  },

  _diaryCard(stats, diary) {
    const hasDiary = diary && diary.content;
    const mood = diary?.mood || '';
    return `
      <div class="glass-card clickable p-5 cursor-pointer" data-nav="/diary">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-2xl">📝</span>
          <h3 class="font-semibold">日记</h3>
        </div>
        ${hasDiary
          ? `<p class="text-sm text-secondary line-clamp-2">${diary.content.substring(0, 80)}...</p>
             ${mood ? `<p class="text-lg mt-1">${mood}</p>` : ''}`
          : `<p class="text-sm text-secondary">今天还没写日记</p>
             <button class="btn-secondary text-xs mt-2" data-nav="/diary">现在写</button>`
        }
      </div>`;
  },

  _financeCard(stats, totalAssets) {
    const f = stats.finance;
    return `
      <div class="glass-card clickable p-5 cursor-pointer" data-nav="/finance">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-2xl">💰</span>
          <h3 class="font-semibold">金融</h3>
        </div>
        <p class="text-2xl font-bold">${formatCurrency(totalAssets)}</p>
        <div class="flex gap-4 mt-1 text-xs">
          <span class="text-[#34C759]">收入 ${formatCurrency(f.income)}</span>
          <span class="text-[#FF3B30]">支出 ${formatCurrency(f.expense)}</span>
        </div>
      </div>`;
  },

  _habitsCard(habits, logs) {
    const total = habits.length;
    const done = logs.filter(l => l.done).length;
    return `
      <div class="glass-card clickable p-5 cursor-pointer" data-nav="/habits">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-2xl">✅</span>
          <h3 class="font-semibold">习惯</h3>
        </div>
        ${total > 0
          ? `<div class="flex items-baseline gap-2">
               <span class="text-2xl font-bold">${done}/${total}</span>
               <span class="text-xs text-secondary">今日打卡</span>
             </div>
             <div class="mt-2 progress-track"><div class="progress-fill" style="width:${total > 0 ? (done/total*100) : 0}%"></div></div>`
          : `<p class="text-sm text-secondary">还没有习惯，去创建一个吧</p>`
        }
      </div>`;
  },

  _quickActionsCard() {
    return `
      <div class="glass-card p-5">
        <h3 class="font-semibold mb-3">⚡ 快捷操作</h3>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn-secondary text-xs py-2" data-action="quick-pomodoro">🍅 番茄钟</button>
          <button class="btn-secondary text-xs py-2" data-action="quick-schedule">📋 新日程</button>
          <button class="btn-secondary text-xs py-2" data-action="quick-bill">💰 记一笔</button>
          <button class="btn-secondary text-xs py-2" data-action="quick-habits">✅ 打卡</button>
        </div>
      </div>`;
  },

  _bindEvents(container) {
    container.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) { router.navigate(nav.dataset.nav); return; }

      if (e.target.closest('[data-action="quick-pomodoro"]')) router.navigate('/pomodoro');
      if (e.target.closest('[data-action="quick-schedule"]')) router.navigate('/schedule');
      if (e.target.closest('[data-action="quick-bill"]')) router.navigate('/finance');
      if (e.target.closest('[data-action="quick-habits"]')) router.navigate('/habits');
    });
  },

  _listenDate() {
    const onDate = () => {
      const container = document.getElementById('content');
      if (container && state.currentModule === 'home') this.render({}, container);
    };
    state.on('date:changed', onDate);
    this._cleanup.push(() => state.off('date:changed', onDate));
  },

  destroy() {
    this._cleanup.forEach(fn => fn());
    this._cleanup = [];
  }
};
