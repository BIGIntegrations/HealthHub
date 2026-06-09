// Health Hub Service Worker v1.0
const CACHE_NAME = 'healthhub-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jsqr/1.4.0/jsQR.min.js'
];

// Install — cache all core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache local assets immediately, external ones best-effort
      const local = ASSETS.filter(a => a.startsWith('/'));
      const external = ASSETS.filter(a => !a.startsWith('/'));
      return cache.addAll(local).then(() =>
        Promise.allSettled(external.map(url =>
          fetch(url).then(r => cache.put(url, r)).catch(() => {})
        ))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first for local assets, network-first for external
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;

  if (isLocal) {
    // Cache first — serve from cache, update in background
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  } else {
    // Network first for external (fonts, CDN), fallback to cache
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
  }
});
