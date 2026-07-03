// context-menu.js — Right-click context menu builder

let _current = null;

export const contextMenu = {
  /**
   * Show a context menu at position (x, y).
   * @param {number} x - clientX
   * @param {number} y - clientY
   * @param {Array} items - [{ label, action, danger?, separator? }]
   */
  show(x, y, items) {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = '0px';
    menu.style.top = '0px';

    menu.innerHTML = items.map(item => {
      if (item.separator) return '<div class="context-menu-divider"></div>';
      return `<button class="context-menu-item ${item.danger ? 'danger' : ''}">
        ${escapeHtml(item.label)}</button>`;
    }).join('');

    document.body.appendChild(menu);

    // Position — clamp to viewport edges
    const rect = menu.getBoundingClientRect();
    let posX = x;
    let posY = y;
    if (x + rect.width > window.innerWidth) posX = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) posY = window.innerHeight - rect.height - 8;
    menu.style.left = posX + 'px';
    menu.style.top = posY + 'px';

    // Bind actions
    let idx = 0;
    menu.querySelectorAll('.context-menu-item').forEach(btn => {
      const item = items[idx++];
      if (item && item.action) {
        btn.addEventListener('click', () => {
          item.action();
          this.hide();
        });
      }
    });

    _current = menu;

    // Close on outside click or Escape
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) { this.hide(); document.removeEventListener('click', closeHandler); }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);

    const escHandler = (e) => {
      if (e.key === 'Escape') { this.hide(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  },

  hide() {
    if (_current) { _current.remove(); _current = null; }
  }
};

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
