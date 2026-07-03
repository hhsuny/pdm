// Service Worker — offline cache for PWA
const CACHE_NAME = 'pdm-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/utils.js',
  '/js/storage.js',
  '/js/crypto.js',
  '/js/state.js',
  '/js/router.js',
  '/js/app.js',
  '/js/pwa.js',
  '/js/db.js',
  '/js/backup.js',
  '/js/sync.js',
  '/js/file-storage.js',
  '/js/components/sidebar.js',
  '/js/components/modal.js',
  '/js/components/toast.js',
  '/js/components/context-menu.js',
  '/js/components/global-search.js',
  '/js/modules/auth.js',
  '/js/modules/home.js',
  '/js/modules/pomodoro.js',
  '/js/modules/schedule.js',
  '/js/modules/diary.js',
  '/js/modules/finance.js',
  '/js/modules/habits.js',
  '/js/modules/review.js',
  '/js/modules/tags.js',
  '/js/charts/pie-chart.js',
  '/js/charts/line-chart.js',
  '/js/charts/bar-chart.js',
  '/js/charts/heatmap.js',
  'https://cdn.tailwindcss.com'
];

// Install — cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll incomplete:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch — stale-while-revalidate for navigation, cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip browser extensions and external APIs
  if (url.origin !== location.origin && !url.href.includes('cdn.tailwindcss.com')) return;

  if (event.request.mode === 'navigate') {
    // Stale-while-revalidate for HTML
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetched = fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetched;
      })
    );
  } else {
    // Cache-first for JS, CSS, CDN
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});
