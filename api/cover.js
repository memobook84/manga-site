const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
    }).on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  const { isbn } = req.query;

  if (!isbn) {
    return res.status(400).json({ error: 'isbn parameter is required' });
  }

  try {
    const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`);

    if (data.items && data.items.length > 0) {
      const vol = data.items[0];
      const links = vol.volumeInfo?.imageLinks || {};
      // zoom=0で最大サイズ画像を取得
      const volumeId = vol.id;
      const coverUrl = `https://books.google.com/books/content?id=${volumeId}&printsec=frontcover&img=1&zoom=0&source=gbs_api`;

      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
      return res.status(200).json({
        coverUrl: coverUrl,
        thumbnail: (links.thumbnail || '').replace('http://', 'https://'),
        volumeId: volumeId,
      });
    }

    res.status(404).json({ error: 'Cover not found' });
  } catch (err) {
    console.error('Google Books API error:', err);
    res.status(502).json({ error: 'Failed to fetch from Google Books API' });
  }
};
