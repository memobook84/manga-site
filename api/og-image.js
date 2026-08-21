const https = require('https');

// 表紙を取りに行ってよい配信元。ここに無いホストは弾く。
// 「公式の無料連載サイトだけを見に行く」という保証と、
// 任意のURLを踏ませないための安全弁（SSRF対策）を兼ねている。
const ALLOWED_HOSTS = new Set([
  // 集英社
  'shonenjumpplus.com',
  'rookie.shonenjump.com',
  'tonarinoyj.jp',
  'youngjump.jp',
  // 講談社
  'pocket.shonenmagazine.com',
  'comic-days.com',
  'magcomi.com',
  // 小学館
  'www.sunday-webry.com',
  'sunday-webry.com',
  'urasunday.com',
]);

const MAX_REDIRECTS = 3;
// og:image は <head> にあるので全部読む必要はない。
// 連載ページは本文が重いので、頭だけ読んで打ち切る。
const MAX_BYTES = 256 * 1024;

function isAllowed(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch (e) {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(u.hostname)) return null;
  return u;
}

function fetchHead(url, depth) {
  return new Promise((resolve, reject) => {
    if (depth > MAX_REDIRECTS) return reject(new Error('too many redirects'));

    const req = https.get(
      url,
      {
        headers: {
          // 素のNode UAだと弾く配信元があるため、通常のブラウザとして名乗る
          'User-Agent':
            'Mozilla/5.0 (compatible; AtlasComicBot/1.0; +https://manga-site-three.vercel.app/)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja,en;q=0.8',
        },
      },
      (res) => {
        const status = res.statusCode || 0;

        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          const next = isAllowed(new URL(res.headers.location, url).toString());
          if (!next) return reject(new Error('redirect to disallowed host'));
          return resolve(fetchHead(next.toString(), depth + 1));
        }

        if (status !== 200) {
          res.resume();
          return reject(new Error('upstream status ' + status));
        }

        let html = '';
        let bytes = 0;
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          bytes += Buffer.byteLength(chunk);
          html += chunk;
          if (bytes >= MAX_BYTES || html.includes('</head>')) {
            res.destroy();
          }
        });
        res.on('close', () => resolve(html));
        res.on('end', () => resolve(html));
        res.on('error', reject);
      }
    );

    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('upstream timeout')));
  });
}

function metaContent(html, property) {
  // property と content の並び順はサイトによって前後するので両方拾う
  const patterns = [
    new RegExp('<meta[^>]+property=["\']' + property + '["\'][^>]*content=["\']([^"\']*)["\']', 'i'),
    new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*property=["\']' + property + '["\']', 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1];
  }
  return '';
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

module.exports = async function handler(req, res) {
  const target = req.query && req.query.url;

  if (!target) {
    return res.status(400).json({ error: 'url parameter is required' });
  }

  const allowed = isAllowed(target);
  if (!allowed) {
    return res.status(403).json({ error: 'この配信元には対応していません' });
  }

  try {
    const html = await fetchHead(allowed.toString(), 0);
    const image = decodeEntities(metaContent(html, 'og:image'));
    const title = decodeEntities(metaContent(html, 'og:title'));

    if (!image) {
      return res.status(404).json({ error: 'og:image not found' });
    }

    // 表紙はそう頻繁に差し替わらないので長めにキャッシュしてよい
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ image, title, source: allowed.hostname });
  } catch (err) {
    console.error('og-image error:', allowed.hostname, err.message);
    return res.status(502).json({ error: 'Failed to fetch OGP data' });
  }
};
