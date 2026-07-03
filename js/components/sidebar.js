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
      <!-- Header: User Info -->
      <div class="p-5">
        <div class="flex items-center gap-3 mb-1">
          <div class="w-10 h-10 rounded-full bg-[var(--color-blue)] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            ${user ? user.username.charAt(0).toUpperCase() : '?'}
          </div>
          <div class="min-w-0">
            <p class="font-semibold text-sm truncate">${user ? user.username : '未登录'}</p>
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

        <div class="sidebar-link text-[#FF3B30] hover:text-[#FF3B30]" data-action="logout">
          <span class="text-lg">🚪</span>
          <span>退出登录</span>
        </div>
      </div>

      <!-- Mobile: hamburger toggle at top of content -->
      <div class="lg:hidden fixed top-4 left-4 z-20">
        <button class="btn-icon w-10 h-10 glass-card-subtle" data-action="toggle-sidebar" aria-label="菜单">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/>
          </svg>
        </button>
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

    // Logout handler
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="logout"]')) {
        state.destroySession();
        router.navigate('/login');
      }
    });
  },

  refresh() {
    this._render();
  },

  destroy() {
    this._cleanup.forEach(fn => fn());
    this._cleanup = [];
  }
};
