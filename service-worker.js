const CACHE_NAME = 'mis-finanzas-cache-v1';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === 'GET' && (url.origin === location.origin) && !url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.match(request).then(resp => {
        if (resp) return resp;
        return fetch(request).then(networkResp => {
          const clone = networkResp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return networkResp;
        }).catch(() => caches.match('/index.html'));
      })
    );
  }
});
