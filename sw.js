// Service Worker — offline cache for PWA
const CACHE_NAME = 'pdm-v1';
const BASE = self.location.pathname.replace(/\/sw\.js$/, '');
const ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/css/app.css',
  BASE + '/js/utils.js',
  BASE + '/js/storage.js',
  BASE + '/js/crypto.js',
  BASE + '/js/state.js',
  BASE + '/js/router.js',
  BASE + '/js/app.js',
  BASE + '/js/pwa.js',
  BASE + '/js/db.js',
  BASE + '/js/backup.js',
  BASE + '/js/sync.js',
  BASE + '/js/file-storage.js',
  BASE + '/js/components/sidebar.js',
  BASE + '/js/components/modal.js',
  BASE + '/js/components/toast.js',
  BASE + '/js/components/context-menu.js',
  BASE + '/js/components/global-search.js',
  BASE + '/js/modules/auth.js',
  BASE + '/js/modules/home.js',
  BASE + '/js/modules/pomodoro.js',
  BASE + '/js/modules/schedule.js',
  BASE + '/js/modules/diary.js',
  BASE + '/js/modules/finance.js',
  BASE + '/js/modules/habits.js',
  BASE + '/js/modules/review.js',
  BASE + '/js/modules/tags.js',
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
