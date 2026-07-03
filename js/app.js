// app.js — Application bootstrap
import { router } from './router.js';
import { state } from './state.js';
import { loadSync } from './storage.js';
import { toast } from './components/toast.js';
import { sidebar } from './components/sidebar.js';
import { backup } from './backup.js';
import { authModule } from './modules/auth.js';
import { homeModule } from './modules/home.js';
import { pomodoroModule } from './modules/pomodoro.js';
import { scheduleModule } from './modules/schedule.js';
import { diaryModule } from './modules/diary.js';
import { financeModule } from './modules/finance.js';
import { habitsModule } from './modules/habits.js';
import { reviewModule } from './modules/review.js';
import { tagsModule } from './modules/tags.js';
import { sync } from './sync.js';
import { db } from './db.js';
import { hashPassword } from './crypto.js';
import { modal } from './components/modal.js';
import { globalSearch } from './components/global-search.js';

// ============================================================
// Theme
// ============================================================
function initTheme() {
  const settings = loadUserSettings();
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (settings?.theme === 'dark' || (!settings?.theme && prefersDark)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const s = loadUserSettings();
    if (!s?.theme || s.theme === 'auto') {
      document.documentElement.classList.toggle('dark', e.matches);
    }
  });
}

function loadUserSettings() {
  const uid = state.userId;
  if (!uid) return null;
  return loadSync(`pdm_settings_${uid}`);
}

// ============================================================
// Keyboard Shortcuts
// ============================================================
function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;

    if (e.code === 'Space' && !isInput && state.currentModule === 'pomodoro') {
      e.preventDefault();
      state.emit('pomodoro:space');
      return;
    }

    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key === 'k') { e.preventDefault(); state.emit('search:open'); return; }
    if (mod && e.key === 'n') {
      e.preventDefault();
      if (state.currentModule === 'schedule') state.emit('schedule:new');
      else { router.navigate('/schedule?date=' + state.currentDate); setTimeout(() => state.emit('schedule:new'), 300); }
      return;
    }
    if (mod && e.key === 'b') {
      e.preventDefault();
      if (state.currentModule === 'finance') state.emit('finance:quickBill');
      else { router.navigate('/finance'); setTimeout(() => state.emit('finance:quickBill'), 300); }
      return;
    }
    if (mod && e.key === 'h') {
      e.preventDefault();
      if (state.currentModule === 'habits') state.emit('habit:quickCheck');
      else { router.navigate('/habits'); setTimeout(() => state.emit('habit:quickCheck'), 300); }
      return;
    }
  });

  // Arrow keys for date nav (separate listener to avoid conflict with above)
  document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
    if (isInput) return;
    if (document.querySelector('.modal-backdrop')) return;
    if (e.key === 'ArrowLeft') {
      const d = new Date(state.currentDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      state.setCurrentDate(d.toISOString().split('T')[0]);
    } else if (e.key === 'ArrowRight') {
      const d = new Date(state.currentDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      state.setCurrentDate(d.toISOString().split('T')[0]);
    }
  });
}

// ============================================================
// Register Routes
// ============================================================
function initRoutes() {
  // Auth guard
  router.guard(/^\/(?!login|register|settings|export).*$/, () => {
    if (!state.isLoggedIn) { router.navigate('/login'); return false; }
    return true;
  });

  // Auth
  router.on('/login', authModule);
  router.on('/register', authModule);

  // Home
  router.on('/home', homeModule);

  // Pomodoro
  router.on('/pomodoro', pomodoroModule);
  router.on('/pomodoro/stats', pomodoroModule); // pomodoro module handles its own sub-views

  // Schedule
  router.on('/schedule', scheduleModule);

  // Diary
  router.on('/diary', diaryModule);

  // Finance (handles sub-routes internally via params)
  router.on('/finance', financeModule);
  router.on('/finance/accounts', financeModule);
  router.on('/finance/bills', financeModule);
  router.on('/finance/budget', financeModule);
  router.on('/finance/trades', financeModule);

  // Habits
  router.on('/habits', habitsModule);

  // Review
  router.on('/review', reviewModule);

  // Tags
  router.on('/tags', tagsModule);

  // Settings & Export — handled as simple render functions inline
  const settingsExport = createSettingsExportModule();
  router.on('/settings', settingsExport);
  router.on('/export', settingsExport);

  // Quick bill (iOS Shortcut)
  router.on('/quick-bill', {
    render: async (params, container) => {
      financeModule.renderQuickBill(params, container);
    },
    destroy() {}
  });
}

// Settings & Export inline module
function createSettingsExportModule() {
  return {
    async render(params, container) {
      const path = router.getCurrentPath();
      const uid = state.userId;
      const settings = loadSync(`pdm_settings_${uid}`) || {};

      if (!state.isLoggedIn) {
        // Not logged in — show simplified sync recovery page
        container.innerHTML = `
          <div class="p-6 lg:p-10 max-w-lg mx-auto fade-in">
            <div class="glass-card p-8 text-center">
              <div class="text-4xl mb-4">📱</div>
              <h2 class="text-lg font-semibold mb-2">从云端恢复</h2>
              <p class="text-sm text-secondary mb-6">如果你在电脑上已经注册并开启了同步，<br>输入同一个 GitHub Token 来拉取账号数据。</p>
              <input type="password" class="input-field mb-3" id="setting-gh-token" placeholder="粘贴 GitHub Token (ghp_...)">
              <button class="btn-primary w-full" id="btn-setup-sync">连接并拉取数据</button>
              <p class="text-xs text-secondary mt-4">拉取完成后，用电脑上相同的用户名密码注册即可</p>
              <button class="btn-ghost text-sm mt-2" data-nav="/login">← 返回登录</button>
            </div>
          </div>`;
        bindSettingsEvents(container);
        return;
      }

      if (path === '/export') {
        container.innerHTML = `
          <div class="p-6 lg:p-10 max-w-2xl mx-auto fade-in">
            <h2 class="text-xl font-semibold mb-6">💾 数据管理</h2>
            <div class="glass-card p-6 mb-4">
              <h3 class="font-semibold mb-2">📥 导出数据</h3>
              <p class="text-sm text-secondary mb-4">将所有数据导出为 JSON 文件，可保存到本地作为备份。</p>
              <button class="btn-primary" id="btn-export">下载备份文件</button>
            </div>
            <div class="glass-card p-6 mb-4">
              <h3 class="font-semibold mb-2">📤 导入数据</h3>
              <p class="text-sm text-secondary mb-4">从之前导出的 JSON 备份文件恢复数据。注意：会覆盖当前数据。</p>
              <input type="file" accept=".json" class="input-field mb-3" id="file-import">
              <button class="btn-secondary" id="btn-import" disabled>导入并恢复</button>
            </div>
            <div class="glass-card p-6">
              <h3 class="font-semibold mb-2">🔄 从浏览器恢复</h3>
              <p class="text-sm text-secondary mb-4">如果 localStorage 被清空但 IndexedDB 中仍有数据，可从浏览器内置存储恢复。</p>
              <button class="btn-secondary" id="btn-recover">从 IndexedDB 恢复</button>
            </div>
          </div>`;
        bindExportEvents(container);
      } else {
        const hasSync = !!(settings.githubToken && settings.gistId);
        container.innerHTML = `
          <div class="p-6 lg:p-10 max-w-2xl mx-auto fade-in">
            <h2 class="text-xl font-semibold mb-6">⚙️ 设置</h2>
            <div class="glass-card p-6 mb-4">
              <h3 class="font-semibold mb-3">🎨 主题</h3>
              <select class="input-field" id="setting-theme">
                <option value="auto" ${!settings.theme||settings.theme==='auto'?'selected':''}>跟随系统</option>
                <option value="light" ${settings.theme==='light'?'selected':''}>浅色</option>
                <option value="dark" ${settings.theme==='dark'?'selected':''}>深色</option>
              </select>
            </div>
            <div class="glass-card p-6 mb-4">
              <h3 class="font-semibold mb-3">🍅 番茄钟</h3>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="text-xs text-secondary">专注时长（分钟）</label><input type="number" class="input-field" id="setting-focus" value="${settings.pomodoroFocusMin||25}" min="5" max="120"></div>
                <div><label class="text-xs text-secondary">休息时长（分钟）</label><input type="number" class="input-field" id="setting-break" value="${settings.pomodoroBreakMin||5}" min="1" max="60"></div>
              </div>
            </div>
            <div class="glass-card p-6 mb-4">
              <h3 class="font-semibold mb-3">🔐 金融 PIN 码</h3>
              <button class="btn-secondary text-sm" id="btn-change-pin">${settings.financePinHash?'修改 PIN 码':'设置 PIN 码'}</button>
            </div>
            <div class="glass-card p-6 mb-4">
              <h3 class="font-semibold mb-3">☁️ GitHub Gist 同步</h3>
              <p class="text-sm text-secondary mb-3">通过 GitHub Gist 实现手机与电脑数据实时同步。需要创建 GitHub Personal Access Token（仅 gist 权限）。</p>
              ${hasSync
                ? `<p class="text-sm text-[#34C759] mb-2">✅ 已配置同步</p>
                   <p class="text-xs text-secondary mb-3">状态：<span id="sync-status-text">${sync.status === 'synced' ? '🟢 已同步' : sync.status === 'pending' ? '🟡 同步中' : '🔴 错误'}</span></p>
                   <button class="btn-secondary text-sm" id="btn-sync-now">🔄 立即同步</button>
                   <button class="btn-danger text-sm ml-2" id="btn-disconnect-sync">断开同步</button>`
                : `<input type="password" class="input-field mb-2" id="setting-gh-token" placeholder="粘贴 GitHub Token (ghp_...)">
                   <button class="btn-primary text-sm" id="btn-setup-sync">连接并开始同步</button>`
              }
            </div>
            <div class="glass-card p-6">
              <h3 class="font-semibold mb-2">关于</h3>
              <p class="text-sm text-secondary">个人每日管理系统 v1.0<br>纯前端 · 数据本地存储 · PWA 离线可用</p>
            </div>
          </div>`;
        bindSettingsEvents(container);
      }
    },
    destroy() {}
  };
}

// Settings events
function bindSettingsEvents(container) {
  container.addEventListener('change', (e) => {
    if (e.target.id === 'setting-theme') {
      const val = e.target.value;
      document.documentElement.classList.toggle('dark', val === 'dark' || (val === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches));
      db.saveSettings({ theme: val });
    }
  });
  container.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-change-pin') {
      const pin = await modal.pin({ title: '输入新 PIN 码（4位数字）' });
      if (pin && pin.length === 4) {
        const hash = await hashPassword(pin);
        await db.saveSettings({ financePinHash: hash });
        state.emit('toast:show', { message: 'PIN 码已更新', type: 'success' });
      }
    }
    if (e.target.id === 'btn-setup-sync') {
      const token = document.getElementById('setting-gh-token').value.trim();
      if (!token) { state.emit('toast:show', { message: '请输入 GitHub Token', type: 'warning' }); return; }
      e.target.disabled = true; e.target.textContent = '连接中...';
      try {
        await sync.setup(token);
        state.emit('toast:show', { message: '同步已配置！数据将在后台自动同步', type: 'success' });
        const path = router.getCurrentPath();
        if (path === '/settings') { const c = document.getElementById('content'); c && createSettingsExportModule().render({}, c); }
      } catch (err) {
        state.emit('toast:show', { message: err.message, type: 'error' });
      }
      e.target.disabled = false; e.target.textContent = '连接并开始同步';
    }
    if (e.target.id === 'btn-sync-now') {
      e.target.disabled = true; e.target.textContent = '同步中...';
      await sync.pull();
      await sync.push();
      state.emit('toast:show', { message: '同步完成', type: 'success' });
      e.target.disabled = false; e.target.textContent = '🔄 立即同步';
    }
    if (e.target.id === 'btn-disconnect-sync') {
      await sync.disconnect();
      state.emit('toast:show', { message: '同步已断开', type: 'info' });
      const path = router.getCurrentPath();
      if (path === '/settings') { const c = document.getElementById('content'); c && createSettingsExportModule().render({}, c); }
    }
  });
  // Save pomodoro settings on blur
  container.addEventListener('blur', (e) => {
    if (e.target.id === 'setting-focus') {
      db.saveSettings({ pomodoroFocusMin: parseInt(e.target.value) || 25 });
    }
    if (e.target.id === 'setting-break') {
      db.saveSettings({ pomodoroBreakMin: parseInt(e.target.value) || 5 });
    }
  }, true);
}

// Export events
async function bindExportEvents(container) {
  const { backup } = await import('./backup.js');
  container.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-export') backup.downloadBackup();
    if (e.target.id === 'btn-recover') {
      const count = await backup.recoverFromIDB();
      if (count === 0) state.emit('toast:show', { message: '未发现可恢复的数据', type: 'info' });
    }
  });
  container.addEventListener('change', async (e) => {
    if (e.target.id === 'file-import') {
      const btn = document.getElementById('btn-import');
      btn.disabled = !e.target.files?.length;
    }
  });
  container.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-import') {
      const fileInput = document.getElementById('file-import');
      const file = fileInput.files?.[0];
      if (!file) return;
      e.target.disabled = true; e.target.textContent = '导入中...';
      const { backup } = await import('./backup.js');
      await backup.restoreFromFile(file);
      e.target.disabled = false; e.target.textContent = '导入并恢复';
    }
  });
}

// ============================================================
// Mobile sidebar
// ============================================================
function initSidebarToggle() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="toggle-sidebar"]');
    if (btn) {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebar-overlay').classList.toggle('sidebar-overlay-visible');
    }
    if (e.target.closest('[data-action="close-sidebar"]')) {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('sidebar-overlay-visible');
    }
    const navLink = e.target.closest('[data-nav]');
    if (navLink) {
      router.navigate(navLink.dataset.nav);
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('sidebar-overlay-visible');
    }
  });
}

// ============================================================
// Boot
// ============================================================
async function init() {
  initTheme();
  initShortcuts();
  initSidebarToggle();
  initRoutes();

  // Init global components
  toast.init();
  sidebar.init();
  backup.init();
  sync.init();
  globalSearch.init();

  // Data change → mark sync dirty
  ['pomodoro:completed', 'pomodoro:breakCompleted', 'schedule:updated', 'diary:updated', 'finance:updated', 'habit:updated'].forEach(ev => {
    state.on(ev, () => sync.markDirty());
  });

  // Restore session
  const hasSession = state.restoreSession();

  if (hasSession) {
    if (window.location.hash === '' || window.location.hash === '#/' || window.location.hash === '#/login' || window.location.hash === '#/register') {
      router.navigate('/home');
    }
  }

  router.resolve();

  // Register PWA (after state is available)
  import('./pwa.js').then(({ initPWA }) => initPWA(state)).catch(() => {});
}

init().catch(console.error);
