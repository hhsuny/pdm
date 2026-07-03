// sidebar.js — Left navigation sidebar
import { state } from '../state.js';
import { router } from '../router.js';
import { niceDate } from '../utils.js';

const NAV_ITEMS = [
  { path: '/home', label: '首页', icon: '🏠' },
  { path: '/pomodoro', label: '番茄钟', icon: '🍅' },
  { path: '/schedule', label: '日程', icon: '📋' },
  { path: '/diary', label: '日记', icon: '📝' },
  { path: '/finance', label: '金融', icon: '💰' },
  { path: '/habits', label: '习惯', icon: '✅' },
  { path: '/review', label: '回顾', icon: '📊' },
  { path: '/tags', label: '标签', icon: '🏷️' },
];

const BOTTOM_ITEMS = [
  { path: '/settings', label: '设置', icon: '⚙️' },
  { path: '/export', label: '数据', icon: '💾' },
];

export const sidebar = {
  _cleanup: [],

  init() {
    this._render();
    this._listen();
  },

  _render() {
    const nav = document.getElementById('sidebar');
    if (!nav) return;

    const user = state.currentUser;
    const currentPath = router.getCurrentPath();

    nav.innerHTML = `
      <!-- Header: Date Display -->
      <div class="p-5">
        <div class="flex items-center gap-3">
          <div class="text-2xl">📋</div>
          <div>
            <p class="font-semibold text-sm">个人管理</p>
            <p class="text-xs text-secondary">${niceDate(state.currentDate)}</p>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto px-2 pb-2">
        ${NAV_ITEMS.map(item => `
          <div class="sidebar-link ${currentPath.startsWith(item.path) ? 'active' : ''}" data-nav="${item.path}">
            <span class="text-lg">${item.icon}</span>
            <span>${item.label}</span>
          </div>
        `).join('')}
      </nav>

      <!-- Bottom Nav -->
      <div class="px-2 pb-4 border-t border-[var(--color-border)] pt-2">
        ${BOTTOM_ITEMS.map(item => `
          <div class="sidebar-link ${currentPath.startsWith(item.path) ? 'active' : ''}" data-nav="${item.path}">
            <span class="text-lg">${item.icon}</span>
            <span>${item.label}</span>
          </div>
        `).join('')}

      </div>
`;
  },

  _listen() {
    // Re-render on auth change or route change
    const onAuth = () => this._render();
    const onRoute = () => this._render();
    const onDate = () => this._render();

    state.on('auth:changed', onAuth);
    state.on('date:changed', onDate);
    this._cleanup.push(() => state.off('auth:changed', onAuth));
    this._cleanup.push(() => state.off('date:changed', onDate));

    // Watch hash changes
    const onHash = () => this._render();
    window.addEventListener('hashchange', onHash);
    this._cleanup.push(() => window.removeEventListener('hashchange', onHash));

    // No logout needed — single user mode
  },

  refresh() {
    this._render();
  },

  destroy() {
    this._cleanup.forEach(fn => fn());
    this._cleanup = [];
  }
};
