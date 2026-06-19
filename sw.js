const CACHE_NAME = 'healthhub-v93';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './apple-touch-icon.png',
  './icon-192x192.png',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/jsqr/1.4.0/jsQR.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      const local = ASSETS.filter(a => a.startsWith('./'));
      const external = ASSETS.filter(a => !a.startsWith('./'));
      return cache.addAll(local).then(() =>
        Promise.allSettled(external.map(url =>
          fetch(url).then(r => cache.put(url, r)).catch(() => {})
        ))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Allow the page to tell a waiting SW to take over immediately
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

function isHTMLnav(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept') && request.headers.get('accept').includes('text/html'));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  // CRITICAL: never intercept non-GET requests. AI API calls (Gemini/Claude/Groq)
  // are POSTs — they must hit the network directly, or the SW can return null and
  // break them ("Returned response is null").
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isLocal = url.origin === self.location.origin;
  const isCachedExternal = ASSETS.includes(req.url);
  // Only handle our own origin + the few external assets we explicitly cache.
  // Everything else (3rd-party GETs) passes straight through to the network.
  if (!isLocal && !isCachedExternal) return;

  // NETWORK-FIRST for navigations and the app's own code/HTML.
  if (isLocal && (isHTMLnav(req) || url.pathname.endsWith('index.html') || url.pathname.endsWith('/'))) {
    event.respondWith(
      fetch(req).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // CACHE-FIRST for our known assets (icons, fonts, libraries) — these rarely change.
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
