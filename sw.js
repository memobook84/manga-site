const CACHE_NAME = 'bookstore-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/rakuten-adapter.js',
  '/manga-data.js',
  '/favicon.png',
  '/logo.png',
];

// インストール時に静的アセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ネットワーク優先、失敗時にキャッシュを返す
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API呼び出しはキャッシュしない
  if (url.pathname.startsWith('/api/')) return;

  // データJSONはキャッシュ優先（大きいため）
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // その他はネットワーク優先
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
