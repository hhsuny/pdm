// diary.js — Daily Diary Module with mood tracking
import { state } from '../state.js';
import { db } from '../db.js';
import { router } from '../router.js';
import { niceDate, addDays, formatCurrency, formatDuration, debounce } from '../utils.js';

const MOODS = [
  { emoji: '😊', label: '开心' },
  { emoji: '😌', label: '平静' },
  { emoji: '😐', label: '一般' },
  { emoji: '😢', label: '难过' },
  { emoji: '😡', label: '生气' },
  { emoji: '🤩', label: '超棒' },
  { emoji: '😴', label: '疲惫' },
  { emoji: '🤔', label: '思考' },
];

export const diaryModule = {
  _date: null,
  _cleanup: [],
  _saveDebounced: null,

  async render(params, container) {
    this.destroy();
    this._date = params.date || state.currentDate;
    const diary = await db.getDiary(this._date) || {};
    const stats = await db.getDayStats(this._date);

    this._saveDebounced = debounce(async (data) => {
      await db.saveDiary(this._date, data);
      state.emit('diary:updated', { date: this._date });
    }, 800);

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-3xl mx-auto fade-in">
        <!-- Date Navigation -->
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <button class="btn-icon" data-action="prev-day">◀</button>
            <span class="font-semibold text-lg date-nav-today" data-action="today">${niceDate(this._date)}</span>
            <button class="btn-icon" data-action="next-day">▶</button>
          </div>
          <button class="btn-ghost text-sm" data-action="search-diary">🔍 搜索</button>
        </div>

        <!-- Mood Selector -->
        <div class="glass-card-subtle p-4 mb-4">
          <p class="text-xs text-secondary mb-3">今日心情</p>
          <div class="flex flex-wrap gap-2" id="mood-selector">
            ${MOODS.map(m => `
              <button class="emoji-btn ${diary.mood === m.emoji ? 'selected' : ''}" data-action="set-mood" data-mood="${m.emoji}" title="${m.label}">${m.emoji}</button>
            `).join('')}
          </div>
        </div>

        <!-- Diary Content -->
        <div class="glass-card p-5 mb-4">
          <textarea class="w-full bg-transparent border-none outline-none resize-none text-sm leading-relaxed min-h-[200px]"
            placeholder="今天发生了什么？..."
            id="diary-content"
          >${diary.content || ''}</textarea>
        </div>

        <!-- Tags -->
        <div class="glass-card-subtle p-4 mb-4">
          <p class="text-xs text-secondary mb-2">标签</p>
          <input type="text" class="input-field" id="diary-tags"
            placeholder="输入标签，逗号分隔（如：工作,学习,感悟）"
            value="${(diary.tags || []).join(', ')}">
        </div>

        <!-- Auto Stats -->
        <div class="glass-card-subtle p-5">
          <h3 class="text-sm font-semibold text-secondary mb-4">📊 今日数据摘要</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <span class="text-xl font-bold">${stats.pomodoros.focusCompleted}</span>
              <p class="text-xs text-secondary">番茄专注</p>
            </div>
            <div>
              <span class="text-xl font-bold">${stats.schedule.done}/${stats.schedule.total}</span>
              <p class="text-xs text-secondary">日程完成</p>
            </div>
            <div>
              <span class="text-xl font-bold">${formatCurrency(stats.finance.expense)}</span>
              <p class="text-xs text-secondary">今日支出</p>
            </div>
            <div>
              <span class="text-xl font-bold">${stats.habits.completed}/${stats.habits.total}</span>
              <p class="text-xs text-secondary">习惯打卡</p>
            </div>
          </div>
        </div>

        <!-- Search Overlay -->
        <div class="hidden mt-4" id="diary-search-section">
          <div class="glass-card p-5">
            <input type="text" class="input-field mb-3" id="diary-search-input" placeholder="搜索日记关键词...">
            <div id="diary-search-results"></div>
          </div>
        </div>
      </div>`;

    this._bindEvents(container);

    // Listen for date changes
    const onDate = ({ date }) => {
      if (state.currentModule === 'diary') {
        this._date = date;
        this.render({ date }, document.getElementById('content'));
      }
    };
    state.on('date:changed', onDate);
    this._cleanup.push(() => state.off('date:changed', onDate));
  },

  _bindEvents(container) {
    // Date nav
    container.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="prev-day"]')) state.setCurrentDate(addDays(this._date, -1));
      if (e.target.closest('[data-action="next-day"]')) state.setCurrentDate(addDays(this._date, 1));
      if (e.target.closest('[data-action="today"]')) state.setCurrentDate(new Date().toISOString().split('T')[0]);

      // Mood
      if (e.target.closest('[data-action="set-mood"]')) {
        const mood = e.target.closest('[data-action="set-mood"]').dataset.mood;
        this._setMood(mood, container);
      }

      // Search toggle
      if (e.target.closest('[data-action="search-diary"]')) {
        document.getElementById('diary-search-section').classList.toggle('hidden');
        document.getElementById('diary-search-input')?.focus();
      }
    });

    // Auto-save on input
    const contentEl = container.querySelector('#diary-content');
    if (contentEl) {
      const onInput = () => this._autoSave();
      contentEl.addEventListener('input', onInput);
      this._cleanup.push(() => contentEl.removeEventListener('input', onInput));
    }

    const tagsEl = container.querySelector('#diary-tags');
    if (tagsEl) {
      const onTags = () => this._autoSave();
      tagsEl.addEventListener('input', onTags);
      tagsEl.addEventListener('blur', onTags);
      this._cleanup.push(() => {
        tagsEl.removeEventListener('input', onTags);
        tagsEl.removeEventListener('blur', onTags);
      });
    }

    // Search
    const searchInput = container.querySelector('#diary-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', debounce(async (e) => {
        const q = e.target.value.trim();
        if (q.length < 1) { document.getElementById('diary-search-results').innerHTML = ''; return; }
        const results = await db.searchAll(q);
        const diaryResults = results.filter(r => r.type === 'diary');
        const el = document.getElementById('diary-search-results');
        el.innerHTML = diaryResults.length === 0
          ? '<p class="text-sm text-secondary">未找到相关日记</p>'
          : diaryResults.map(r => `
            <div class="p-3 rounded-xl hover:bg-[var(--color-border)] cursor-pointer text-sm" data-action="go-date" data-date="${r.date}">
              <span class="font-medium">${niceDate(r.date)}</span>
              <span class="text-secondary ml-2">${r.data.content?.substring(0, 60)}...</span>
            </div>
          `).join('');
        // Re-bind go-date
        document.querySelectorAll('[data-action="go-date"]').forEach(el => {
          el.onclick = () => { state.setCurrentDate(el.dataset.date); document.getElementById('diary-search-section').classList.add('hidden'); };
        });
      }, 300));
    }
  },

  async _autoSave() {
    const content = document.getElementById('diary-content')?.value || '';
    const tagsStr = document.getElementById('diary-tags')?.value || '';
    const tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
    const moodEl = document.querySelector('[data-action="set-mood"].selected');
    const mood = moodEl?.dataset.mood || '';

    const existing = await db.getDiary(this._date) || {};
    await db.saveDiary(this._date, { ...existing, content, mood, tags });
  },

  async _setMood(mood, container) {
    // Update UI
    container.querySelectorAll('[data-action="set-mood"]').forEach(el => {
      el.classList.toggle('selected', el.dataset.mood === mood);
    });

    const content = document.getElementById('diary-content')?.value || '';
    const tagsStr = document.getElementById('diary-tags')?.value || '';
    const tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
    const existing = await db.getDiary(this._date) || {};
    await db.saveDiary(this._date, { ...existing, content, mood, tags });
  },

  destroy() {
    this._cleanup.forEach(fn => fn());
    this._cleanup = [];
  }
};
