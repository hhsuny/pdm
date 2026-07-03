// modal.js — Generic modal dialogs (confirm, prompt, PIN, alert)
import { escapeHtml } from '../utils.js';

const _modals = [];

export const modal = {
  /**
   * Show a confirmation dialog. Returns Promise<boolean>.
   */
  confirm({ title, message, confirmText = '确认', cancelText = '取消', danger = false }) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal-panel">
          <div class="glass-card p-6 max-w-sm w-[calc(100vw-40px)]">
            ${title ? `<h3 class="text-lg font-semibold mb-2">${escapeHtml(title)}</h3>` : ''}
            <p class="text-sm text-secondary mb-6">${escapeHtml(message)}</p>
            <div class="flex gap-3 justify-end">
              <button class="btn-secondary text-sm" data-action="cancel">${escapeHtml(cancelText)}</button>
              <button class="${danger ? 'btn-danger' : 'btn-primary'} text-sm" data-action="confirm">${escapeHtml(confirmText)}</button>
            </div>
          </div>
        </div>`;

      document.body.appendChild(backdrop);

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) { resolve(false); backdrop.remove(); }
        if (e.target.closest('[data-action="cancel"]')) { resolve(false); backdrop.remove(); }
        if (e.target.closest('[data-action="confirm"]')) { resolve(true); backdrop.remove(); }
      });

      _modals.push(backdrop);
    });
  },

  /**
   * Show a prompt dialog. Returns Promise<string|null>.
   */
  prompt({ title, message, placeholder = '', defaultValue = '' }) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal-panel">
          <div class="glass-card p-6 max-w-sm w-[calc(100vw-40px)]">
            ${title ? `<h3 class="text-lg font-semibold mb-2">${escapeHtml(title)}</h3>` : ''}
            ${message ? `<p class="text-sm text-secondary mb-3">${escapeHtml(message)}</p>` : ''}
            <input type="text" class="input-field mb-4" id="modal-prompt-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" autofocus>
            <div class="flex gap-3 justify-end">
              <button class="btn-secondary text-sm" data-action="cancel">取消</button>
              <button class="btn-primary text-sm" data-action="confirm">确认</button>
            </div>
          </div>
        </div>`;

      document.body.appendChild(backdrop);
      setTimeout(() => backdrop.querySelector('#modal-prompt-input')?.focus(), 200);

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) { resolve(null); backdrop.remove(); }
        if (e.target.closest('[data-action="cancel"]')) { resolve(null); backdrop.remove(); }
        if (e.target.closest('[data-action="confirm"]')) {
          const val = backdrop.querySelector('#modal-prompt-input')?.value || '';
          resolve(val); backdrop.remove();
        }
      });

      backdrop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = backdrop.querySelector('#modal-prompt-input')?.value || '';
          resolve(val); backdrop.remove();
        }
      });
    });
  },

  /**
   * Show an alert dialog. Returns Promise<void>.
   */
  alert({ title, message }) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal-panel">
          <div class="glass-card p-6 max-w-sm w-[calc(100vw-40px)]">
            ${title ? `<h3 class="text-lg font-semibold mb-2">${escapeHtml(title)}</h3>` : ''}
            <p class="text-sm text-secondary mb-6">${escapeHtml(message)}</p>
            <div class="flex justify-end">
              <button class="btn-primary text-sm" data-action="confirm">知道了</button>
            </div>
          </div>
        </div>`;

      document.body.appendChild(backdrop);

      const dismiss = () => { resolve(); backdrop.remove(); };
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) dismiss();
        if (e.target.closest('[data-action="confirm"]')) dismiss();
      });
    });
  },

  /**
   * Show a PIN input dialog (4 digits). Returns Promise<string|null>.
   */
  pin({ title = '请输入 PIN 码' }) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal-panel">
          <div class="glass-card p-6 max-w-sm w-[calc(100vw-40px)] text-center">
            <h3 class="text-lg font-semibold mb-4">${escapeHtml(title)}</h3>
            <div class="flex justify-center gap-3 mb-4" id="modal-pin-container">
              ${[0,1,2,3].map(i => `<input type="password" class="pin-input" maxlength="1" pattern="[0-9]" inputmode="numeric" id="mpin-${i}">`).join('')}
            </div>
            <div class="flex gap-3 justify-center">
              <button class="btn-secondary text-sm" data-action="cancel">取消</button>
              <button class="btn-primary text-sm" data-action="confirm">确认</button>
            </div>
          </div>
        </div>`;

      document.body.appendChild(backdrop);

      const inputs = backdrop.querySelectorAll('.pin-input');
      inputs.forEach((inp, i) => {
        inp.addEventListener('input', (e) => {
          if (e.target.value.length === 1 && i < 3) inputs[i + 1].focus();
        });
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !e.target.value && i > 0) inputs[i - 1].focus();
        });
      });
      setTimeout(() => inputs[0]?.focus(), 300);

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) { resolve(null); backdrop.remove(); }
        if (e.target.closest('[data-action="cancel"]')) { resolve(null); backdrop.remove(); }
        if (e.target.closest('[data-action="confirm"]')) {
          const pin = Array.from(inputs).map(i => i.value).join('');
          resolve(pin); backdrop.remove();
        }
      });
    });
  }
};
