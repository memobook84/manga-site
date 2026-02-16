const https = require('https');

const RAKUTEN_BOOK = 'https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404';
const RAKUTEN_TOTAL = 'https://openapi.rakuten.co.jp/services/api/BooksTotal/Search/20170404';
const APP_ID = 'baf572c9-8b33-407f-84de-79088be6b58a';
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

function mapItem(item) {
  return {
    title: item.title || '',
    author: item.author || '',
    publisher: item.publisherName || '',
    label: item.seriesName || '',
    genre: item.booksGenreId || '',
    firstReleaseDate: item.salesDate || '',
    description: item.itemCaption || '',
    imageUrl: (item.largeImageUrl || item.mediumImageUrl || '').replace('http://', 'https://'),
    price: item.itemPrice || 0,
    isbn: item.isbn || '',
    itemUrl: item.itemUrl || '',
    seriesName: item.seriesName || '',
  };
}

module.exports = async function handler(req, res) {
  const { keyword, page = '1', hits = '30' } = req.query;

  if (!keyword) {
    return res.status(400).json({ error: 'keyword parameter is required' });
  }

  const accessKey = (process.env.RAKUTEN_APP_ID || '').trim();
  if (!accessKey) {
    return res.status(500).json({ error: 'RAKUTEN_APP_ID not configured' });
  }

  // まずBooksBook APIでtitle検索（コミックジャンル）
  const bookParams = new URLSearchParams({
    applicationId: APP_ID,
    accessKey: accessKey,
    formatVersion: '2',
    title: keyword,
    booksGenreId: '001001',
    hits: String(Math.min(parseInt(hits), 30)),
    page: page,
  });

  try {
    let data = await rakutenFetch(`${RAKUTEN_BOOK}?${bookParams}`);

    // BooksBookで結果がない場合、BooksTotal（keyword検索）にフォールバック
    if (!data.Items || data.Items.length === 0) {
      const totalParams = new URLSearchParams({
        applicationId: APP_ID,
        accessKey: accessKey,
        formatVersion: '2',
        keyword: keyword,
        booksGenreId: '001',
        hits: String(Math.min(parseInt(hits), 30)),
        page: page,
      });
      data = await rakutenFetch(`${RAKUTEN_TOTAL}?${totalParams}`);
    }

    if (data.errors) {
      return res.status(502).json({ error: data.errors });
    }

    // BooksTotal returns Items[].Item, BooksBook returns Items[] directly (formatVersion=2)
    const items = (data.Items || []).map(item => {
      const i = item.Item || item;
      return mapItem(i);
    });

    res.status(200).json({
      items: items,
      totalCount: data.count || 0,
      page: data.page || 1,
      pageCount: data.pageCount || 1,
    });
  } catch (err) {
    console.error('Rakuten API error:', err);
    res.status(502).json({ error: 'Failed to fetch from Rakuten API' });
  }
};
