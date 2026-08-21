/* ATLAS COMIC Service Worker

   ページ遷移のたびに一瞬白く／暗くなる問題への対策。
   旧実装は「全リクエストをネットワーク優先」だったため、遷移のたびに
   CSS・JSまで含めた全ファイルがネットワーク往復を待たされ、
   最初の描画が始まるまで画面が空白になっていた。用途別に分ける。

   - ナビゲーション(HTML) : Navigation Preload ＋ ネットワーク優先（失敗時キャッシュ）
   - 静的アセット(CSS/JS/画像/フォント) : キャッシュ優先＋裏で更新（stale-while-revalidate）
   - /data/ のJSON        : ネットワーク優先（新刊・検索インデックスをすぐ反映）
   - /api/ と別オリジン    : SWを通さず素通し（挟むとかえって遅くなる）
*/

const VERSION = 'v18';
const STATIC_CACHE = 'atlas-static-' + VERSION;
const PAGE_CACHE = 'atlas-pages-' + VERSION;
const CURRENT_CACHES = [STATIC_CACHE, PAGE_CACHE];

// ローカル開発ではSWを完全に素通しにする。
// 編集したてのCSS/JSがキャッシュから返ると開発中に混乱するため
const IS_LOCAL =
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1';

// 初回訪問で温めておくシェル。addAll は1つでも404だと install ごと失敗するので
// 個別に add して失敗は握りつぶす
const PRECACHE = [
  '/home.html',
  '/index.html',
  '/menu.html',
  '/ranking.html',
  '/style.css',
  '/home-portal.css',
  '/ranking.css',
  '/rakuten-adapter.js',
  '/manga-data.js',
  '/database.js',
  '/ranking.js',
  '/nav-menu.js',
  '/page-hero-toggle.js',
  '/favicon.png?v=5',
  '/header-logo.png',
];

const STATIC_RE = /\.(?:css|js|mjs|png|jpg|jpeg|gif|svg|webp|avif|ico|woff2?|ttf|otf)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // SWの起動を待たずに本体のHTMLリクエストを先に飛ばしてもらう。
      // これがないとSWがスリープしていた場合、遷移のたびに起動待ちが挟まる
      if (!IS_LOCAL && self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (e) {
          /* 非対応ブラウザは無視 */
        }
      }
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => CURRENT_CACHES.indexOf(k) === -1).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (IS_LOCAL) return;

  const url = new URL(req.url);

  // 別オリジン（Googleフォント/jsDelivr/unpkg/画像CDN）はSWを挟まない。
  // 挟むとSWスレッド経由になり、初回描画がむしろ遅れる
  if (url.origin !== self.location.origin) return;

  // APIはキャッシュしない
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  if (url.pathname.startsWith('/data/')) {
    event.respondWith(networkFirst(req, PAGE_CACHE));
    return;
  }

  if (STATIC_RE.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
  }
});

// HTMLのページ遷移。preloadResponse があればそれを使う（SW起動待ちを飛ばせる）
async function handleNavigate(event) {
  const req = event.request;
  try {
    const preloaded = await event.preloadResponse;
    const res = preloaded || (await fetch(req));
    if (res && res.ok) put(PAGE_CACHE, req, res.clone());
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw e;
  }
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res && res.ok) put(cacheName, req, res.clone());
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw e;
  }
}

// キャッシュがあれば即返し、裏でこっそり最新に差し替える。
// 遷移時にネットワークを待たないのでフラッシュが起きない
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networking = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  if (cached) {
    networking.catch(() => {}); // 裏の更新が失敗しても表示には影響させない
    return cached;
  }
  return networking;
}

function put(cacheName, req, res) {
  caches
    .open(cacheName)
    .then((cache) => cache.put(req, res))
    .catch(() => {});
}
