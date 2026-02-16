const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'MangaSite/1.0 (https://manga-site-three.vercel.app)',
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

module.exports = async function handler(req, res) {
  const { name } = req.query;

  if (!name) {
    return res.status(400).json({ error: 'name parameter is required' });
  }

  // 楽天APIの著者名にはスペースが含まれるが、Wikipediaにはスペースなし
  // 半角スペース・全角スペースを除去して検索
  const cleanName = name.replace(/[\s\u3000]+/g, '');

  try {
    // Wikipedia REST API で著者の要約を取得（スペースなし）
    let summaryUrl = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanName)}`;
    let summary = await fetchJson(summaryUrl);

    // スペースなしで見つからなければ、元の名前で再試行
    if (summary.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found' && cleanName !== name) {
      summaryUrl = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
      summary = await fetchJson(summaryUrl);
    }

    // Wikipedia検索APIでも試す
    if (summary.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
      const searchUrl = `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanName + ' 漫画家')}&srlimit=1&format=json`;
      try {
        const searchData = await fetchJson(searchUrl);
        const results = searchData.query?.search || [];
        if (results.length > 0) {
          const foundTitle = results[0].title;
          summaryUrl = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(foundTitle)}`;
          summary = await fetchJson(summaryUrl);
        }
      } catch {
        // 検索失敗は無視
      }
    }

    if (summary.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
      return res.status(404).json({ error: 'Author not found on Wikipedia' });
    }

    // MediaWiki API でより詳しい情報を取得（全セクション、最大1500文字）
    const wikiTitle = summary.title || cleanName;
    const extractUrl = `https://ja.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=extracts&explaintext=1&exchars=1500&format=json`;
    let longExtract = '';
    try {
      const extractData = await fetchJson(extractUrl);
      const pages = extractData.query?.pages || {};
      for (const pid of Object.keys(pages)) {
        if (pid !== '-1') {
          longExtract = pages[pid].extract || '';
        }
      }
    } catch {
      // フォールバック：REST APIの要約を使用
    }

    const result = {
      title: summary.title || name,
      description: summary.description || '',
      extract: longExtract || summary.extract || '',
      thumbnail: summary.thumbnail ? {
        url: (summary.thumbnail.source || '').replace('http://', 'https://'),
        width: summary.thumbnail.width || 0,
        height: summary.thumbnail.height || 0,
      } : null,
      wikipediaUrl: summary.content_urls?.desktop?.page || `https://ja.wikipedia.org/wiki/${encodeURIComponent(name)}`,
    };

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(result);
  } catch (err) {
    console.error('Wikipedia API error:', err);
    res.status(502).json({ error: 'Failed to fetch from Wikipedia API' });
  }
};
