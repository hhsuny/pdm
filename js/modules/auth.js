// auth.js — Login / Register / Logout module
import { state } from '../state.js';
import { db } from '../db.js';
import { router } from '../router.js';
import { escapeHtml } from '../utils.js';

export const authModule = {
  _cleanup: [],

  async render(params, container) {
    this.destroy();
    const mode = router.getCurrentPath() === '/register' ? 'register' : 'login';

    container.innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-6">
        <div class="w-full max-w-md">
          <!-- Logo / Header -->
          <div class="text-center mb-10 fade-in">
            <div class="text-6xl mb-4">📋</div>
            <h1 class="text-2xl font-bold tracking-tight">个人每日管理</h1>
            <p class="text-secondary text-sm mt-2">${mode === 'login' ? '欢迎回来' : '创建新账号'}</p>
          </div>

          <!-- Form Card -->
          <div class="glass-card p-8 fade-in">
            ${mode === 'login' ? this._loginForm() : this._registerForm()}
          </div>

          <!-- Toggle Mode -->
          <p class="text-center text-sm text-secondary mt-6">
            ${mode === 'login'
              ? '还没有账号？<a class="text-[var(--color-blue)] cursor-pointer hover:underline" data-action="go-register">注册</a>'
              : '已有账号？<a class="text-[var(--color-blue)] cursor-pointer hover:underline" data-action="go-login">登录</a>'
            }
          </p>
        </div>
      </div>`;

    this._bindEvents(container);
  },

  _loginForm() {
    return `
      <form id="login-form" class="space-y-5">
        <div>
          <label class="block text-sm font-medium mb-2">用户名</label>
          <input type="text" name="username" class="input-field" placeholder="请输入用户名" autocomplete="username" required>
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">密码</label>
          <input type="password" name="password" class="input-field" placeholder="请输入密码" autocomplete="current-password" required>
        </div>
        <p id="login-error" class="text-[#FF3B30] text-sm hidden"></p>
        <button type="submit" class="btn-primary w-full text-base py-3">登录</button>
      </form>`;
  },

  _registerForm() {
    return `
      <form id="register-form" class="space-y-5">
        <div>
          <label class="block text-sm font-medium mb-2">用户名</label>
          <input type="text" name="username" class="input-field" placeholder="请输入用户名" autocomplete="username" required minlength="2" maxlength="20">
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">密码</label>
          <input type="password" name="password" class="input-field" placeholder="请输入密码（至少6位）" autocomplete="new-password" required minlength="6">
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">确认密码</label>
          <input type="password" name="confirmPassword" class="input-field" placeholder="请再次输入密码" autocomplete="new-password" required>
        </div>
        <p id="register-error" class="text-[#FF3B30] text-sm hidden"></p>
        <button type="submit" class="btn-primary w-full text-base py-3">注册</button>
      </form>`;
  },

  _bindEvents(container) {
    // Login form
    const loginForm = container.querySelector('#login-form');
    if (loginForm) {
      const handler = async (e) => {
        e.preventDefault();
        const errorEl = container.querySelector('#login-error');
        const btn = loginForm.querySelector('button[type="submit"]');
        errorEl.classList.add('hidden');
        btn.disabled = true;
        btn.textContent = '登录中...';

        try {
          const username = loginForm.username.value.trim();
          const password = loginForm.password.value;
          if (!username || !password) throw new Error('请填写用户名和密码');

          const user = await db.loginUser(username, password);
          state.setCurrentUser(user);
          state.emit('toast:show', { message: `欢迎，${user.username}！`, type: 'success' });
          router.navigate('/home');
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.classList.remove('hidden');
        } finally {
          btn.disabled = false;
          btn.textContent = '登录';
        }
      };
      loginForm.addEventListener('submit', handler);
      this._cleanup.push(() => loginForm.removeEventListener('submit', handler));
    }

    // Register form
    const regForm = container.querySelector('#register-form');
    if (regForm) {
      const handler = async (e) => {
        e.preventDefault();
        const errorEl = container.querySelector('#register-error');
        const btn = regForm.querySelector('button[type="submit"]');
        errorEl.classList.add('hidden');
        btn.disabled = true;
        btn.textContent = '注册中...';

        try {
          const username = regForm.username.value.trim();
          const password = regForm.password.value;
          const confirm = regForm.confirmPassword.value;

          if (!username || !password) throw new Error('请填写用户名和密码');
          if (username.length < 2) throw new Error('用户名至少2个字符');
          if (password.length < 6) throw new Error('密码至少6位');
          if (password !== confirm) throw new Error('两次密码输入不一致');

          const user = await db.createUser(username, password);
          state.setCurrentUser(user);
          state.emit('toast:show', { message: `注册成功！欢迎，${user.username}！`, type: 'success' });
          router.navigate('/home');
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.classList.remove('hidden');
        } finally {
          btn.disabled = false;
          btn.textContent = '注册';
        }
      };
      regForm.addEventListener('submit', handler);
      this._cleanup.push(() => regForm.removeEventListener('submit', handler));
    }

    // Toggle links
    container.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="go-register"]')) {
        router.navigate('/register');
      }
      if (e.target.closest('[data-action="go-login"]')) {
        router.navigate('/login');
      }
    });
  },

  destroy() {
    this._cleanup.forEach(fn => fn());
    this._cleanup = [];
  }
};
