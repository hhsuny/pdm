// toast.js — Floating notification queue
import { state } from '../state.js';

const _queue = [];
let _visible = false;

export const toast = {
  init() {
    // Listen for toast events from anywhere
    state.on('toast:show', (opts) => {
      this.show(opts.message, opts.type, opts.duration, opts.action);
    });
  },

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'info'|'success'|'error'|'warning'} type
   * @param {number} duration - ms, default 3000
   * @param {{label: string, fn: Function}} action - optional action button
   */
  show(message, type = 'info', duration = 3000, action = null) {
    const root = document.getElementById('toast-root');
    if (!root) return;

    const el = document.createElement('div');
    el.className = `toast-item toast-${type} flex items-center gap-3 slide-up`;
    el.innerHTML = `
      <span class="flex-1">${message}</span>
      ${action ? `<button class="btn-ghost text-xs font-semibold text-[var(--color-blue)]" data-toast-action>${action.label}</button>` : ''}
    `;

    if (action) {
      el.querySelector('[data-toast-action]').addEventListener('click', () => {
        action.fn();
        this._dismiss(el);
      });
    }

    root.appendChild(el);
    this._queue.push(el);

    if (!_visible) {
      this._showNext();
    }

    // Auto-dismiss
    setTimeout(() => this._dismiss(el), duration);
  },

  _showNext() {
    _visible = true;
    // all toasts stack visually, no need to manage visibility
  },

  _dismiss(el) {
    if (!el || !el.parentNode) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
    el.style.transition = 'all 200ms ease-out';
    setTimeout(() => {
      if (el.parentNode) el.remove();
      const idx = this._queue.indexOf(el);
      if (idx >= 0) this._queue.splice(idx, 1);
    }, 200);
  }
};
