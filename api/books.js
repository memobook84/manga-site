const https = require('https');

const RAKUTEN_BASE = 'https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404';
const APP_ID = process.env.RAKUTEN_APP_ID || '';
const REFERER = 'https://manga-site-three.vercel.app';

function rakutenFetch(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': REFERER,
        'Origin': REFERER,
        'Accept': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function resolveImageUrl(item) {
  const raw = item.largeImageUrl || item.mediumImageUrl || '';
  if (!raw) return { imageUrl: '', hasRealCover: false };
  // _ex パラメータを除去し、クライアント側で用途別サイズを付与する
  const url = raw.replace('http://', 'https://').replace(/\?_ex=\d+x\d+/, '');
  const isPlaceholder =
    url.includes('noimage') ||
    url.includes('no_image') ||
    url.includes('/0000/') ||
    !raw;
  const hasRealCover = !isPlaceholder;
  return { imageUrl: url, hasRealCover };
}

function mapItem(item) {
  const { imageUrl, hasRealCover } = resolveImageUrl(item);
  return {
    title: item.title || '',
    author: item.author || '',
    publisher: item.publisherName || '',
    label: item.seriesName || '',
    genre: item.booksGenreId || '',
    firstReleaseDate: item.salesDate || '',
    description: item.itemCaption || '',
    imageUrl: imageUrl,
    hasRealCover: hasRealCover,
    price: item.itemPrice || 0,
    isbn: item.isbn || '',
    itemUrl: item.itemUrl || '',
    seriesName: item.seriesName || '',
  };
}

module.exports = async function handler(req, res) {
  const { genre = '001001', hits = '30', page = '1', isbn, sort = 'sales', keyword } = req.query;

  const accessKey = (process.env.RAKUTEN_APP_ID || '').trim();
  if (!accessKey) {
    return res.status(500).json({ error: 'RAKUTEN_APP_ID not configured' });
  }

  const params = new URLSearchParams({
    applicationId: APP_ID,
    accessKey: accessKey,
    formatVersion: '2',
    booksGenreId: genre,
    hits: String(Math.min(parseInt(hits), 30)),
    page: page,
    sort: sort,
  });

  if (isbn) {
    params.set('isbn', isbn);
    params.delete('booksGenreId');
    params.delete('sort');
  }

  if (keyword) {
    params.set('title', keyword);
  }

  try {
    const data = await rakutenFetch(`${RAKUTEN_BASE}?${params}`);

    if (data.errors) {
      return res.status(502).json({ error: data.errors });
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({
      items: (data.Items || []).map(mapItem),
      totalCount: data.count || 0,
      page: data.page || 1,
      pageCount: data.pageCount || 1,
    });
  } catch (err) {
    console.error('Rakuten API error:', err);
    res.status(502).json({ error: 'Failed to fetch from Rakuten API' });
  }
};
