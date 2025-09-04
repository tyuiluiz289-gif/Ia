const CACHE_NAME = 'ava-gpt-cache-v1';
const ASSETS = [
  '/web/index.html',
  '/web/manifest.webmanifest',
  '/web/icons/icon-192.png',
  '/web/icons/icon-512.png',
  '/js/chat-core.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return resp;
      }).catch(() => {
        // Offline fallback to index
        if (req.mode === 'navigate') {
          return caches.match('/web/index.html');
        }
      });
    })
  );
});