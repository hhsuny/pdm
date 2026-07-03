// habits.js — Habit Tracker Module
import { state } from '../state.js';
import { db } from '../db.js';
import { router } from '../router.js';
import { today, niceDate, uuid, formatYearMonth, addDays } from '../utils.js';

const HABIT_COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5856D6', '#FF2D55', '#5AC8FA'];

export const habitsModule = {
  _cleanup: [],

  async render(params, container) {
    this.destroy();
    const habits = await db.getHabits();
    const todayLogs = await db.getHabitLogsForDate(state.currentDate);
    const todayDone = new Set(todayLogs.filter(l => l.done).map(l => l.habitId));

    // Get heatmap data (last 12 weeks)
    const endDate = today();
    const startDate = addDays(endDate, -83); // 12 weeks
    const allLogs = await db.getHabitLogsForRange(startDate, endDate);

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-3xl mx-auto fade-in">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold">✅ 习惯打卡</h2>
          <div class="flex gap-2">
            <button class="btn-secondary text-sm" data-action="add-habit">+ 新习惯</button>
            <button class="btn-ghost text-sm" data-action="check-all">☑ 全部打卡</button>
          </div>
        </div>

        <!-- Today's Date -->
        <p class="text-sm text-secondary mb-4">${niceDate(state.currentDate)}</p>

        <!-- Habit List -->
        <div class="space-y-3 mb-6" id="habit-list">
          ${habits.length === 0
            ? `<div class="glass-card-subtle p-8 text-center text-secondary text-sm">还没有习惯，点击「+ 新习惯」创建</div>`
            : habits.map(h => `
              <div class="glass-card-subtle p-4 flex items-center gap-3">
                <button class="w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all ${todayDone.has(h.id) ? 'bg-[var(--color-blue)] scale-110' : 'bg-[var(--color-border)]'}"
                  data-action="toggle-habit" data-id="${h.id}">
                  ${h.icon || '✅'}
                </button>
                <div class="flex-1">
                  <span class="font-medium text-sm">${h.name}</span>
                  <span class="text-xs text-secondary ml-2">目标 ${h.goalPerWeek || 7}次/周</span>
                </div>
                <button class="btn-icon text-sm" data-action="delete-habit" data-id="${h.id}">🗑</button>
              </div>
            `).join('')
          }
        </div>

        <!-- Heatmap -->
        <div class="glass-card-subtle p-5 mb-4">
          <h3 class="text-sm font-semibold mb-3">🔥 打卡热力图（近3个月）</h3>
          <div class="overflow-x-auto">
            <div class="flex gap-0.5" id="heatmap-container">
              <!-- Rendered by canvas or div grid -->
              ${this._renderHeatmap(allLogs, startDate, endDate)}
            </div>
          </div>
          <div class="flex items-center gap-2 mt-3 text-xs text-secondary">
            <span>少</span>
            <span class="inline-block w-3 h-3 rounded-sm bg-[var(--color-border)]"></span>
            <span class="inline-block w-3 h-3 rounded-sm bg-[var(--color-blue)] opacity-30"></span>
            <span class="inline-block w-3 h-3 rounded-sm bg-[var(--color-blue)] opacity-60"></span>
            <span class="inline-block w-3 h-3 rounded-sm bg-[var(--color-blue)]"></span>
            <span>多</span>
          </div>
        </div>

        <!-- Stats -->
        ${habits.length > 0 ? `
          <div class="glass-card-subtle p-5">
            <h3 class="text-sm font-semibold mb-3">📊 统计</h3>
            <div class="grid grid-cols-2 gap-3">
              ${habits.map(h => {
                const hLogs = allLogs.filter(l => l.habitId === h.id && l.done);
                const streak = this._calcStreak(allLogs, h.id);
                return `
                  <div class="p-3 rounded-xl bg-[var(--color-border)]">
                    <span class="text-lg">${h.icon||'✅'}</span> <span class="text-sm font-medium">${h.name}</span>
                    <div class="text-xs text-secondary mt-1">总打卡 ${hLogs.length} 天 · 连续 ${streak} 天</div>
                  </div>`;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Add Form -->
        <div class="hidden mt-4" id="habit-form-section">
          <div class="glass-card p-4">
            <input type="text" class="input-field mb-2" id="habit-name" placeholder="习惯名称" maxlength="20">
            <input type="text" class="input-field mb-2" id="habit-icon" placeholder="emoji图标" maxlength="2" value="✅">
            <input type="number" class="input-field mb-2" id="habit-goal" placeholder="每周目标次数" value="7" min="1" max="7">
            <div class="flex gap-2">
              <button class="btn-primary text-sm" data-action="save-habit">保存</button>
              <button class="btn-ghost text-sm" data-action="cancel-habit">取消</button>
            </div>
          </div>
        </div>
      </div>`;

    this._bindEvents(container);

    // Listen for quick check shortcut
    const onQuick = () => this._checkAll();
    state.on('habit:quickCheck', onQuick);
    this._cleanup.push(() => state.off('habit:quickCheck', onQuick));
  },

  _renderHeatmap(allLogs, startDate, endDate) {
    // Simple div-based heatmap (7 rows x ~12 cols for weeks)
    const doneDates = new Map();
    for (const log of allLogs) {
      if (log.done) doneDates.set(log.date, (doneDates.get(log.date) || 0) + 1);
    }
    const maxCount = Math.max(1, ...doneDates.values());

    let html = '<div class="flex flex-col gap-0.5">';
    const daysOfWeek = ['一', '二', '三', '四', '五', '六', '日'];
    for (let dow = 0; dow < 7; dow++) {
      html += '<div class="flex gap-0.5">';
      let d = new Date(startDate + 'T00:00:00');
      // Adjust to first occurrence of this day-of-week
      while (d.getDay() !== (dow + 1) % 7 && d <= new Date(endDate)) {
        d.setDate(d.getDate() + 1);
      }
      while (d <= new Date(endDate + 'T00:00:00')) {
        const ds = d.toISOString().split('T')[0];
        const count = doneDates.get(ds) || 0;
        const intensity = count === 0 ? '' : count / maxCount < 0.33 ? 'opacity-30' : count / maxCount < 0.66 ? 'opacity-60' : '';
        html += `<div class="heatmap-cell ${intensity ? `bg-[var(--color-blue)] ${intensity}` : 'bg-[var(--color-border)]'}" title="${ds}: ${count}次"></div>`;
        d.setDate(d.getDate() + 7);
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  },

  _calcStreak(allLogs, habitId) {
    const doneSet = new Set(allLogs.filter(l => l.habitId === habitId && l.done).map(l => l.date));
    let streak = 0;
    let d = new Date(today() + 'T00:00:00');
    while (doneSet.has(d.toISOString().split('T')[0])) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  },

  _bindEvents(container) {
    container.addEventListener('click', async (e) => {
      if (e.target.closest('[data-action="add-habit"]')) {
        document.getElementById('habit-form-section').classList.remove('hidden');
      }
      if (e.target.closest('[data-action="cancel-habit"]')) {
        document.getElementById('habit-form-section').classList.add('hidden');
      }
      if (e.target.closest('[data-action="save-habit"]')) {
        const name = document.getElementById('habit-name').value.trim();
        if (!name) return;
        const habits = await db.getHabits();
        habits.push({
          id: uuid(), name,
          icon: document.getElementById('habit-icon').value || '✅',
          goalPerWeek: parseInt(document.getElementById('habit-goal').value) || 7,
          createdAt: new Date().toISOString()
        });
        await db.saveHabits(habits);
        this.render({}, container);
      }
      if (e.target.closest('[data-action="toggle-habit"]')) {
        const id = e.target.closest('[data-action="toggle-habit"]').dataset.id;
        const todayLogs = await db.getHabitLogsForDate(state.currentDate);
        const existing = todayLogs.find(l => l.habitId === id);
        await db.setHabitLog(id, state.currentDate, existing ? !existing.done : true);
        state.emit('habit:updated', {});
        this.render({}, container);
      }
      if (e.target.closest('[data-action="delete-habit"]')) {
        const id = e.target.closest('[data-action="delete-habit"]').dataset.id;
        const habits = await db.getHabits();
        await db.saveHabits(habits.filter(h => h.id !== id));
        this.render({}, container);
      }
      if (e.target.closest('[data-action="check-all"]')) {
        this._checkAll().then(() => this.render({}, container));
      }
    });
  },

  async _checkAll() {
    const habits = await db.getHabits();
    const todayLogs = await db.getHabitLogsForDate(state.currentDate);
    for (const h of habits) {
      const existing = todayLogs.find(l => l.habitId === h.id);
      if (!existing || !existing.done) {
        await db.setHabitLog(h.id, state.currentDate, true);
      }
    }
    state.emit('habit:updated', {});
    state.emit('toast:show', { message: `${habits.length} 个习惯已全部打卡`, type: 'success' });
  },

  destroy() {
    this._cleanup.forEach(fn => fn());
    this._cleanup = [];
  }
};
