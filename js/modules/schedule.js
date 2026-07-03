// schedule.js — Free Timeline Schedule Module
import { state } from '../state.js';
import { db } from '../db.js';
import { router } from '../router.js';
import { niceDate, addDays, uuid, escapeHtml, debounce } from '../utils.js';

export const scheduleModule = {
  _date: null,
  _cleanup: [],
  _saveDebounced: null,

  async render(params, container) {
    this.destroy();
    this._date = params.date || state.currentDate;

    const items = await db.getSchedule(this._date);
    const templates = await db.getTemplates();
    const allTags = this._collectTags(items);

    this._saveDebounced = debounce(async (items) => {
      await db.saveSchedule(this._date, items);
      state.emit('schedule:updated', { date: this._date });
    }, 500);

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-3xl mx-auto fade-in">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <button class="btn-icon" data-action="prev-day" title="前一天">◀</button>
            <span class="font-semibold text-lg date-nav-today" data-action="today">${niceDate(this._date)}</span>
            <button class="btn-icon" data-action="next-day" title="后一天">▶</button>
          </div>
          <div class="flex gap-2">
            <button class="btn-secondary text-sm" data-action="new-item">+ 新事项</button>
            <button class="btn-ghost text-sm" data-action="templates">📋 模板</button>
          </div>
        </div>

        <!-- Tag Filter -->
        ${allTags.length > 0 ? `
          <div class="flex flex-wrap gap-2 mb-4" id="tag-filters">
            <span class="tag cursor-pointer active" data-tag="">全部</span>
            ${allTags.map(t => `<span class="tag cursor-pointer" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}

        <!-- Carry-forward Banner -->
        ${items.length === 0 ? await this._carryForwardBanner() : ''}

        <!-- Timeline -->
        <div class="space-y-3" id="schedule-list">
          ${items.length === 0
            ? `<div class="glass-card-subtle p-8 text-center text-secondary text-sm">暂无日程，点击「+ 新事项」添加</div>`
            : items.map((item, i) => this._itemHTML(item, i)).join('')
          }
        </div>

        <!-- Add Item Form -->
        <div class="glass-card-subtle p-4 mt-4 hidden" id="add-item-form">
          <input type="time" class="input-field mb-2 w-auto" id="item-time" value="${this._nowTime()}">
          <input type="text" class="input-field mb-2" id="item-content" placeholder="事项内容..." maxlength="200">
          <input type="text" class="input-field mb-2" id="item-tags" placeholder="标签（逗号分隔）如：工作,学习">
          <div class="flex gap-2">
            <button class="btn-primary text-sm" data-action="save-item">保存</button>
            <button class="btn-ghost text-sm" data-action="cancel-item">取消</button>
          </div>
        </div>

        <!-- Templates Modal (rendered inline) -->
        <div class="hidden mt-4" id="templates-section">
          <div class="glass-card p-5">
            <h3 class="font-semibold mb-3">📋 活动模板</h3>
            ${templates.length === 0 ? '<p class="text-sm text-secondary">暂无模板。保存当前日程为模板，下次一键加载。</p>' : ''}
            <div class="space-y-2">
              ${templates.map(t => `
                <div class="flex items-center justify-between p-2 rounded-xl hover:bg-[var(--color-border)]">
                  <span class="text-sm font-medium">${escapeHtml(t.name)}</span>
                  <div class="flex gap-1">
                    <button class="btn-ghost text-xs" data-action="load-template" data-id="${t.id}">加载</button>
                    <button class="btn-ghost text-xs text-[#FF3B30]" data-action="delete-template" data-id="${t.id}">删除</button>
                  </div>
                </div>
              `).join('')}
            </div>
            <button class="btn-secondary text-sm mt-3" data-action="save-as-template">💾 保存当前为模板</button>
          </div>
        </div>
      </div>`;

    this._bindEvents(container);

    // Listen for date changes
    const onDate = ({ date }) => {
      if (state.currentModule === 'schedule') {
        this._date = date;
        this.render({ date }, document.getElementById('content'));
      }
    };
    state.on('date:changed', onDate);
    this._cleanup.push(() => state.off('date:changed', onDate));

    // Listen for "new" from global shortcut
    const onNew = () => {
      const form = document.getElementById('add-item-form');
      if (form) { form.classList.remove('hidden'); document.getElementById('item-content')?.focus(); }
    };
    state.on('schedule:new', onNew);
    this._cleanup.push(() => state.off('schedule:new', onNew));
  },

  _itemHTML(item, index) {
    return `
      <div class="glass-card-subtle p-4 flex items-start gap-3 group ${item.done ? 'opacity-50' : ''}" data-id="${item.id}">
        <button class="mt-1 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${item.done ? 'bg-[var(--color-blue)] border-[var(--color-blue)]' : 'border-[var(--color-border-elevated)]'}" data-action="toggle-done" data-id="${item.id}">
          ${item.done ? '<span class="text-white text-xs">✓</span>' : ''}
        </button>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-mono text-secondary">${item.time || '--:--'}</span>
            <span contenteditable="true" class="flex-1 text-sm outline-none border-b border-transparent focus:border-[var(--color-blue)]" data-action="edit-content" data-id="${item.id}">${escapeHtml(item.content)}</span>
          </div>
          ${item.tags && item.tags.length > 0 ? `
            <div class="flex flex-wrap gap-1 mt-1">${item.tags.map(t => `<span class="tag text-[10px]">${escapeHtml(t)}</span>`).join('')}</div>
          ` : ''}
        </div>
        <button class="btn-icon text-sm opacity-0 group-hover:opacity-100 transition-opacity" data-action="delete-item" data-id="${item.id}">🗑</button>
      </div>`;
  },

  _bindEvents(container) {
    // Date nav
    container.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="prev-day"]')) state.setCurrentDate(addDays(this._date, -1));
      if (e.target.closest('[data-action="next-day"]')) state.setCurrentDate(addDays(this._date, 1));
      if (e.target.closest('[data-action="today"]')) state.setCurrentDate(new Date().toISOString().split('T')[0]);

      // New item
      if (e.target.closest('[data-action="new-item"]')) {
        document.getElementById('add-item-form').classList.remove('hidden');
        document.getElementById('item-content').focus();
      }

      // Cancel
      if (e.target.closest('[data-action="cancel-item"]')) {
        document.getElementById('add-item-form').classList.add('hidden');
      }

      // Save item
      if (e.target.closest('[data-action="save-item"]')) this._saveNewItem();

      // Toggle done
      if (e.target.closest('[data-action="toggle-done"]')) {
        this._toggleDone(e.target.closest('[data-action="toggle-done"]').dataset.id);
      }

      // Delete
      if (e.target.closest('[data-action="delete-item"]')) {
        this._deleteItem(e.target.closest('[data-action="delete-item"]').dataset.id);
      }

      // Templates
      if (e.target.closest('[data-action="templates"]')) {
        document.getElementById('templates-section').classList.toggle('hidden');
      }
      if (e.target.closest('[data-action="save-as-template"]')) this._saveTemplate();
      if (e.target.closest('[data-action="load-template"]')) {
        this._loadTemplate(e.target.closest('[data-action="load-template"]').dataset.id);
      }
      if (e.target.closest('[data-action="delete-template"]')) {
        db.deleteTemplate(e.target.closest('[data-action="delete-template"]').dataset.id);
        this.render({ date: this._date }, container);
      }

      // Tag filter
      if (e.target.closest('[data-tag]')) {
        const tag = e.target.closest('[data-tag]').dataset.tag;
        this._filterByTag(tag, container);
      }
    });

    // Enter key in add form
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'item-content') {
        e.preventDefault();
        this._saveNewItem();
      }
    });

    // Content editable blur = save
    container.addEventListener('blur', async (e) => {
      if (e.target.closest('[data-action="edit-content"]')) {
        const id = e.target.closest('[data-action="edit-content"]').dataset.id;
        const content = e.target.textContent.trim();
        const items = await db.getSchedule(this._date);
        const idx = items.findIndex(i => i.id === id);
        if (idx >= 0) { items[idx].content = content; await db.saveSchedule(this._date, items); }
      }
    }, true);
  },

  async _saveNewItem() {
    const time = document.getElementById('item-time').value || this._nowTime();
    const content = document.getElementById('item-content').value.trim();
    if (!content) return;

    const tagsStr = document.getElementById('item-tags').value.trim();
    const tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

    const items = await db.getSchedule(this._date);
    items.push({
      id: uuid(), time, content, done: false, tags,
      createdAt: new Date().toISOString()
    });
    items.sort((a, b) => a.time.localeCompare(b.time));

    await db.saveSchedule(this._date, items);
    if (tags.length) await db.updateTagCounts(tags);
    state.emit('schedule:updated', { date: this._date });

    // Re-render
    this.render({ date: this._date }, document.getElementById('content'));
  },

  async _toggleDone(id) {
    const items = await db.getSchedule(this._date);
    const idx = items.findIndex(i => i.id === id);
    if (idx >= 0) { items[idx].done = !items[idx].done; await db.saveSchedule(this._date, items); }
    this.render({ date: this._date }, document.getElementById('content'));
  },

  async _deleteItem(id) {
    const items = await db.getSchedule(this._date);
    await db.saveSchedule(this._date, items.filter(i => i.id !== id));
    this.render({ date: this._date }, document.getElementById('content'));
  },

  async _saveTemplate() {
    const items = await db.getSchedule(this._date);
    if (items.length === 0) {
      state.emit('toast:show', { message: '当前没有日程可以保存为模板', type: 'warning' });
      return;
    }
    const name = prompt('模板名称：', `${niceDate(this._date)}的日程`);
    if (!name) return;
    await db.saveTemplate({ id: uuid(), name, items: items.map(i => ({ time: i.time, content: i.content, tags: i.tags || [] })), createdAt: new Date().toISOString() });
    state.emit('toast:show', { message: '模板已保存', type: 'success' });
    this.render({ date: this._date }, document.getElementById('content'));
  },

  async _loadTemplate(templateId) {
    const templates = await db.getTemplates();
    const t = templates.find(t => t.id === templateId);
    if (!t) return;

    const existing = await db.getSchedule(this._date);
    const newItems = t.items.map(i => ({ id: uuid(), time: i.time, content: i.content, done: false, tags: i.tags || [], createdAt: new Date().toISOString() }));
    await db.saveSchedule(this._date, [...existing, ...newItems].sort((a, b) => a.time.localeCompare(b.time)));
    state.emit('toast:show', { message: `已加载模板「${t.name}」(${newItems.length}项)`, type: 'success' });
    this.render({ date: this._date }, document.getElementById('content'));
  },

  async _filterByTag(tag, container) {
    const items = await db.getSchedule(this._date);
    const filtered = tag ? items.filter(i => i.tags?.includes(tag)) : items;
    const list = document.getElementById('schedule-list');
    if (list) {
      list.innerHTML = filtered.length === 0
        ? `<div class="glass-card-subtle p-8 text-center text-secondary text-sm">该标签下暂无事项</div>`
        : filtered.map((item, i) => this._itemHTML(item, i)).join('');
      this._bindEvents(container);
    }
    // Update active tag style
    document.querySelectorAll('[data-tag]').forEach(el => {
      el.classList.toggle('active', el.dataset.tag === tag || (el.dataset.tag === '' && !tag));
    });
  },

  async _carryForwardBanner() {
    const yesterday = addDays(this._date, -1);
    const prevItems = await db.getSchedule(yesterday);
    const unfinished = prevItems.filter(i => !i.done);
    if (unfinished.length === 0) return '';
    return `
      <div class="glass-card-subtle p-4 mb-4 border-l-4 border-[#FF9500]">
        <p class="text-sm mb-2">📌 昨天有 ${unfinished.length} 项未完成</p>
        <button class="btn-secondary text-xs" data-action="carry-forward">一键顺延到今天</button>
      </div>`;
  },

  _collectTags(items) {
    const set = new Set();
    items.forEach(i => (i.tags || []).forEach(t => set.add(t)));
    return [...set];
  },

  _nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  destroy() {
    this._cleanup.forEach(fn => fn());
    this._cleanup = [];
  }
};
