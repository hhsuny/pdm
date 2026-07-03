// pwa.js — PWA registration & update handling

let _state = null;

export function initPWA(stateInstance) {
  _state = stateInstance;
  registerSW();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          if (_state) {
            _state.emit('toast:show', {
              message: '有新版本可用，刷新页面即可更新',
              type: 'info',
              action: {
                label: '刷新',
                fn: () => newWorker.postMessage({ type: 'SKIP_WAITING' })
              }
            });
          }
        }
      });
    });
  }).catch((err) => {
    console.warn('[PWA] SW registration failed:', err);
  });
}
