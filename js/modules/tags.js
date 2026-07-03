// tags.js — Unified Tags Module
import { state } from '../state.js';
import { db } from '../db.js';
import { router } from '../router.js';
import { niceDate, formatCurrency, escapeHtml } from '../utils.js';

export const tagsModule = {
  _cleanup: [],
  _tagData: [],

  async render(params, container) {
    this.destroy();
    const tagName = decodeURIComponent(container.dataset.tag || '');

    if (tagName) {
      await this._renderTagDetail(tagName, container);
    } else {
      await this._renderTagList(container);
    }
  },

  async _renderTagList(container) {
    const tags = await db.getUnifiedTags();
    const entries = Object.entries(tags).sort((a, b) => b[1] - a[1]);

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-3xl mx-auto fade-in">
        <h2 class="text-xl font-semibold mb-6">🏷️ 统一标签</h2>
        <p class="text-sm text-secondary mb-4">以下标签来自日程、日记和账单，点击可查看详情</p>
        ${entries.length === 0
          ? `<div class="glass-card-subtle p-8 text-center text-secondary text-sm">暂无标签。在日程、日记或账单中添加标签后，这里会自动聚合。</div>`
          : `<div class="flex flex-wrap gap-3">
              ${entries.map(([name, count]) => `
                <div class="glass-card clickable p-4 cursor-pointer text-center min-w-[100px]" data-action="view-tag" data-tag="${escapeHtml(name)}">
                  <span class="text-2xl font-bold">${count}</span>
                  <p class="text-sm">#${escapeHtml(name)}</p>
                </div>
              `).join('')}
            </div>`
        }
      </div>`;

    container.addEventListener('click', (e) => {
      const tagBtn = e.target.closest('[data-action="view-tag"]');
      if (tagBtn) {
        const tag = tagBtn.dataset.tag;
        container.dataset.tag = tag;
        this._renderTagDetail(tag, container);
      }
    });
  },

  async _renderTagDetail(tagName, container) {
    const results = await db.searchAll(tagName);
    // Filter results that actually contain this tag
    const tagged = results.filter(r => {
      if (r.type === 'schedule') return r.data.tags?.includes(tagName) || r.data.content?.includes(tagName);
      if (r.type === 'diary') return r.data.tags?.includes(tagName) || r.data.content?.includes(tagName);
      if (r.type === 'finance') return r.data.category === tagName || r.data.notes?.includes(tagName) || r.data.merchant?.includes(tagName);
      return false;
    });

    // Analysis
    const scheduleItems = tagged.filter(r => r.type === 'schedule');
    const financeItems = tagged.filter(r => r.type === 'finance');
    const totalExpense = financeItems.filter(r => r.data.type === 'expense').reduce((s, r) => s + (r.data.amount || 0), 0);

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-3xl mx-auto fade-in">
        <div class="flex items-center gap-3 mb-6">
          <button class="btn-ghost text-sm" data-action="back-tags">← 返回</button>
          <h2 class="text-xl font-semibold">#${escapeHtml(tagName)}</h2>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <div class="glass-card-subtle p-4 text-center"><span class="text-2xl font-bold">${tagged.length}</span><p class="text-xs text-secondary">总记录</p></div>
          <div class="glass-card-subtle p-4 text-center"><span class="text-2xl font-bold">${scheduleItems.length}</span><p class="text-xs text-secondary">日程</p></div>
          ${totalExpense > 0 ? `<div class="glass-card-subtle p-4 text-center"><span class="text-2xl font-bold">${formatCurrency(totalExpense)}</span><p class="text-xs text-secondary">支出</p></div>` : ''}
        </div>

        <!-- Records -->
        <div class="space-y-2">
          ${tagged.length === 0
            ? '<p class="text-secondary text-sm text-center py-8">未找到相关记录</p>'
            : tagged.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(r => `
              <div class="glass-card-subtle p-3 text-sm">
                ${r.type === 'schedule'
                  ? `<span class="tag">📋 日程</span> <span class="text-xs text-secondary">${r.date}</span> <span>${escapeHtml(r.data.content?.substring(0, 60))}</span>`
                  : r.type === 'diary'
                  ? `<span class="tag">📝 日记</span> <span class="text-xs text-secondary">${r.date}</span> <span>${escapeHtml(r.data.content?.substring(0, 60))}</span>`
                  : `<span class="tag">💰 ${r.data.type === 'expense' ? '支出' : r.data.type === 'income' ? '收入' : '转账'}</span>
                     <span class="text-xs text-secondary">${r.date}</span>
                     <span>${formatCurrency(r.data.amount)} ${r.data.category||''}</span>`
                }
              </div>
            `).join('')
          }
        </div>
      </div>`;

    container.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="back-tags"]')) {
        container.dataset.tag = '';
        this._renderTagList(container);
      }
    });
  },

  destroy() {
    this._cleanup.forEach(fn => fn());
    this._cleanup = [];
  }
};
