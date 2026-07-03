// review.js — Weekly/Monthly Review Module
import { state } from '../state.js';
import { db } from '../db.js';
import { today, niceDate, getWeekDates, getWeekPeriod, formatYearMonth, formatCurrency, formatDuration, niceMonth } from '../utils.js';

export const reviewModule = {
  _cleanup: [],

  async render(params, container) {
    this.destroy();
    const isWeek = !params.type || params.type === 'week';
    const dateStr = state.currentDate;

    if (isWeek) {
      await this._renderWeekReview(dateStr, container);
    } else {
      await this._renderMonthReview(dateStr, container);
    }
  },

  async _renderWeekReview(dateStr, container) {
    const weekDates = getWeekDates(dateStr);
    const startDate = weekDates[0];
    const endDate = weekDates[6];
    const period = getWeekPeriod(dateStr);

    // Gather all data for the week
    const pomData = await db.getPomodoroStatsForRange(startDate, endDate);
    const focusCount = pomData.filter(p => p.sessionType === 'focus' && !p.interrupted).length;
    const focusMin = pomData.filter(p => p.sessionType === 'focus').reduce((s, p) => s + (p.durationMin || 0), 0);

    let scheduleTotal = 0, scheduleDone = 0;
    const tagCounts = {};
    for (const d of weekDates) {
      const items = await db.getSchedule(d);
      scheduleTotal += items.length;
      scheduleDone += items.filter(i => i.done).length;
      items.forEach(i => (i.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    }
    const scheduleRate = scheduleTotal > 0 ? Math.round(scheduleDone / scheduleTotal * 100) : 0;
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const txs = await db.getTransactionsForRange(startDate, endDate);
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
    const topExpense = txs.filter(t => t.type === 'expense').sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];

    const habitLogs = await db.getHabitLogsForRange(startDate, endDate);
    const habitDays = new Set(habitLogs.filter(l => l.done).map(l => l.date)).size;

    // Check for existing review
    const existingReview = await db.getReview(`week_${period}`);

    const moodSummary = this._getMoodSummary(dateStr, weekDates);

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-3xl mx-auto fade-in">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold">📊 周报</h2>
          <button class="btn-ghost text-sm" data-action="toggle-month">📅 月报</button>
        </div>
        <p class="text-sm text-secondary mb-6">${startDate} ~ ${endDate}（第${period.split('-W')[1]}周）</p>

        <!-- Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="glass-card-subtle p-4 text-center"><span class="text-2xl font-bold">${focusCount}</span><p class="text-xs text-secondary">番茄专注</p></div>
          <div class="glass-card-subtle p-4 text-center"><span class="text-2xl font-bold">${scheduleRate}%</span><p class="text-xs text-secondary">日程完成率</p></div>
          <div class="glass-card-subtle p-4 text-center"><span class="text-2xl font-bold">${habitDays}</span><p class="text-xs text-secondary">打卡天数</p></div>
          <div class="glass-card-subtle p-4 text-center"><span class="text-2xl font-bold text-[#FF3B30]">${formatCurrency(expense)}</span><p class="text-xs text-secondary">总支出</p></div>
        </div>

        <!-- Details -->
        <div class="glass-card-subtle p-5 mb-4">
          <h3 class="text-sm font-semibold mb-3">🍅 专注</h3>
          <p class="text-sm">本周完成 <strong>${focusCount}</strong> 次专注，累计 <strong>${formatDuration(focusMin)}</strong></p>
        </div>

        <div class="glass-card-subtle p-5 mb-4">
          <h3 class="text-sm font-semibold mb-3">📋 日程</h3>
          <p class="text-sm">共 ${scheduleTotal} 项，完成 ${scheduleDone} 项（${scheduleRate}%）</p>
          ${topTags.length > 0 ? `<p class="text-xs text-secondary mt-1">高频标签：${topTags.map(([t,n]) => `<span class="tag">${t} ×${n}</span>`).join(' ')}</p>` : ''}
        </div>

        <div class="glass-card-subtle p-5 mb-4">
          <h3 class="text-sm font-semibold mb-3">💰 财务</h3>
          <p class="text-sm">收入 ${formatCurrency(income)} · 支出 ${formatCurrency(expense)} · 结余 ${formatCurrency(income - expense)}</p>
          ${topExpense ? `<p class="text-xs text-secondary mt-1">最大支出：${formatCurrency(topExpense.amount)}（${topExpense.category} - ${topExpense.notes || topExpense.merchant || ''}）</p>` : ''}
        </div>

        <div class="glass-card-subtle p-5 mb-4">
          <h3 class="text-sm font-semibold mb-3">📝 总结</h3>
          <textarea class="w-full bg-transparent border-none outline-none resize-none text-sm min-h-[100px]" id="review-content"
            placeholder="写下本周的总结与感悟...">${existingReview?.content || ''}</textarea>
          <button class="btn-primary text-sm mt-2" data-action="save-review" data-period="week_${period}">💾 保存总结</button>
        </div>
      </div>`;

    container.addEventListener('click', async (e) => {
      if (e.target.closest('[data-action="toggle-month"]')) {
        this.render({ type: 'month' }, container);
      }
      if (e.target.closest('[data-action="save-review"]')) {
        const periodKey = e.target.closest('[data-action="save-review"]').dataset.period;
        const content = document.getElementById('review-content').value;
        await db.saveReview(periodKey, { type: 'week', period: periodKey, content });
        state.emit('toast:show', { message: '总结已保存', type: 'success' });
      }
    });
  },

  async _renderMonthReview(dateStr, container) {
    const ym = dateStr.substring(0, 7);
    const stats = await db.getMonthlyFinanceStats(ym);
    const habitLogs = await db.getHabitLogsForRange(ym + '-01', ym + '-31');

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-3xl mx-auto fade-in">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold">📅 月报</h2>
          <button class="btn-ghost text-sm" data-action="toggle-week">📊 周报</button>
        </div>
        <p class="text-sm text-secondary mb-6">${niceMonth(ym)}</p>
        <div class="glass-card-subtle p-5 mb-4">
          <h3 class="text-sm font-semibold mb-3">💰 财务摘要</h3>
          <p class="text-sm">收入 ${formatCurrency(stats.income)} · 支出 ${formatCurrency(stats.expense)} · 结余 ${formatCurrency(stats.net)}</p>
          ${Object.keys(stats.byCategory).length > 0 ? `
            <div class="mt-2 text-xs">${Object.entries(stats.byCategory).sort((a,b)=>b[1]-a[1]).map(([cat,amt]) =>
              `<span class="tag mb-1">${cat} ${formatCurrency(amt)}</span>`
            ).join(' ')}</div>
          ` : ''}
        </div>
        <div class="glass-card-subtle p-5 mb-4">
          <h3 class="text-sm font-semibold mb-3">📝 总结</h3>
          <textarea class="w-full bg-transparent border-none outline-none resize-none text-sm min-h-[100px]" id="review-content" placeholder="写下本月的总结..."></textarea>
          <button class="btn-primary text-sm mt-2" data-action="save-review" data-period="month_${ym}">💾 保存总结</button>
        </div>
      </div>`;

    container.addEventListener('click', async (e) => {
      if (e.target.closest('[data-action="toggle-week"]')) {
        this.render({ type: 'week' }, container);
      }
      if (e.target.closest('[data-action="save-review"]')) {
        await db.saveReview(e.target.closest('[data-action="save-review"]').dataset.period, {
          type: 'month', content: document.getElementById('review-content').value
        });
        state.emit('toast:show', { message: '总结已保存', type: 'success' });
      }
    });
  },

  _getMoodSummary(dateStr, weekDates) {
    // Simplified — could load diaries for the week
    return null;
  },

  destroy() {
    this._cleanup.forEach(fn => fn());
    this._cleanup = [];
  }
};
