// global-search.js — Ctrl+K global fuzzy search overlay
import { state } from '../state.js';
import { db } from '../db.js';
import { router } from '../router.js';
import { niceDate, formatCurrency, escapeHtml, debounce } from '../utils.js';

let _overlay = null;

export const globalSearch = {
  init() {
    state.on('search:open', () => this.open());
  },

  open() {
    if (_overlay) return;
    _overlay = document.createElement('div');
    _overlay.className = 'modal-backdrop flex items-start justify-center pt-[15vh]';
    _overlay.innerHTML = `
      <div class="glass-card w-full max-w-lg mx-4 p-4" onclick="event.stopPropagation()">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-secondary text-lg">🔍</span>
          <input type="text" class="flex-1 bg-transparent border-none outline-none text-lg" id="search-input" placeholder="搜索日程、日记、账单...">
          <span class="text-xs text-secondary bg-[var(--color-border)] px-2 py-0.5 rounded-md">ESC</span>
        </div>
        <div id="search-results" class="max-h-80 overflow-y-auto">
          <p class="text-sm text-secondary text-center py-4">输入关键词开始搜索</p>
        </div>
      </div>`;

    document.body.appendChild(_overlay);

    const input = _overlay.querySelector('#search-input');
    setTimeout(() => input.focus(), 100);

    const doSearch = debounce(async (q) => {
      const results = await db.searchAll(q);
      const resultsEl = _overlay.querySelector('#search-results');
      if (results.length === 0) {
        resultsEl.innerHTML = '<p class="text-sm text-secondary text-center py-4">未找到相关结果</p>';
        return;
      }
      resultsEl.innerHTML = results.map(r => {
        let icon, label;
        if (r.type === 'schedule') { icon = '📋'; label = r.data.content?.substring(0, 80); }
        else if (r.type === 'diary') { icon = '📝'; label = r.data.content?.substring(0, 80); }
        else { icon = '💰'; label = `${r.data.type==='expense'?'-':'+'}${formatCurrency(r.data.amount)} ${r.data.notes||r.data.merchant||''}`; }
        return `
          <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--color-border)] cursor-pointer search-result-item"
               data-type="${r.type}" data-date="${r.date}" data-id="${r.data.id||''}">
            <span>${icon}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm truncate">${escapeHtml(label)}</p>
              <p class="text-xs text-secondary">${niceDate(r.date)}</p>
            </div>
          </div>`;
      }).join('');

      // Bind clicks
      _overlay.querySelectorAll('.search-result-item').forEach(el => {
        el.addEventListener('click', () => {
          const type = el.dataset.type;
          const date = el.dataset.date;
          state.setCurrentDate(date);
          if (type === 'schedule') router.navigate('/schedule?date=' + date);
          else if (type === 'diary') router.navigate('/diary?date=' + date);
          else router.navigate('/finance/bills');
          globalSearch.close();
        });
      });
    }, 300);

    input.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (q.length >= 1) doSearch(q);
      else _overlay.querySelector('#search-results').innerHTML = '<p class="text-sm text-secondary text-center py-4">输入关键词开始搜索</p>';
    });

    _overlay.addEventListener('click', (e) => {
      if (e.target === _overlay) this.close();
    });

    const escHandler = (e) => {
      if (e.key === 'Escape') { this.close(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  },

  close() {
    if (_overlay) { _overlay.remove(); _overlay = null; }
  }
};
