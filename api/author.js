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

// ひらがな→ローマ字（ヘボン式）。英語版Wikipediaが無い著者向けのフォールバック用。
// 長音（おう/うう）は名前表記の慣例に合わせてマクロンを使わず母音1文字にまとめる
const KANA_TABLE = [
  ['きゃ', 'kya'], ['きゅ', 'kyu'], ['きょ', 'kyo'],
  ['しゃ', 'sha'], ['しゅ', 'shu'], ['しょ', 'sho'],
  ['ちゃ', 'cha'], ['ちゅ', 'chu'], ['ちょ', 'cho'],
  ['にゃ', 'nya'], ['にゅ', 'nyu'], ['にょ', 'nyo'],
  ['ひゃ', 'hya'], ['ひゅ', 'hyu'], ['ひょ', 'hyo'],
  ['みゃ', 'mya'], ['みゅ', 'myu'], ['みょ', 'myo'],
  ['りゃ', 'rya'], ['りゅ', 'ryu'], ['りょ', 'ryo'],
  ['ぎゃ', 'gya'], ['ぎゅ', 'gyu'], ['ぎょ', 'gyo'],
  ['じゃ', 'ja'], ['じゅ', 'ju'], ['じょ', 'jo'],
  ['びゃ', 'bya'], ['びゅ', 'byu'], ['びょ', 'byo'],
  ['ぴゃ', 'pya'], ['ぴゅ', 'pyu'], ['ぴょ', 'pyo'],
  ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
  ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
  ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['ゐ', 'i'], ['ゑ', 'e'], ['を', 'o'], ['ん', 'n'],
  ['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go'],
  ['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo'],
  ['だ', 'da'], ['ぢ', 'ji'], ['づ', 'zu'], ['で', 'de'], ['ど', 'do'],
  ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo'],
  ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po'],
  ['ぁ', 'a'], ['ぃ', 'i'], ['ぅ', 'u'], ['ぇ', 'e'], ['ぉ', 'o'],
  ['ゃ', 'ya'], ['ゅ', 'yu'], ['ょ', 'yo'], ['ー', ''],
];

function kanaToRomaji(kana) {
  let out = '';
  let i = 0;
  while (i < kana.length) {
    // 促音（っ）は次の子音を重ねる
    if (kana[i] === 'っ') {
      const rest = kanaToRomaji(kana.slice(i + 1));
      return out + (rest ? rest[0] + rest : '');
    }
    const hit = KANA_TABLE.find(([k]) => kana.startsWith(k, i));
    if (!hit) return '';  // 未知の文字が混ざったら変換をあきらめる
    out += hit[1];
    i += hit[0].length;
  }
  // 長音の整理：おう→o、うう→u（えい は ei のまま残す）
  return out.replace(/ou/g, 'o').replace(/uu/g, 'u').replace(/oo/g, 'o');
}

function capitalize(word) {
  return word ? word[0].toUpperCase() + word.slice(1) : '';
}

// Wikipediaの導入文「尾田 栄一郎（おだ えいいちろう、1975年…」から読みを拾ってローマ字化。
// 姓・名の順を英語版に合わせて「名 姓」に入れ替える
function romajiFromExtract(extract) {
  const m = (extract || '').match(/[（(]\s*([ぁ-ゖ\s　・]+?)\s*[、,）)]/);
  if (!m) return '';
  const parts = m[1].split(/[\s　・]+/).filter(Boolean).map(kanaToRomaji);
  if (parts.some((p) => !p)) return '';
  if (parts.length === 2) return `${capitalize(parts[1])} ${capitalize(parts[0])}`;
  return parts.map(capitalize).join(' ');
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

    // MediaWiki API でより詳しい情報を取得（全セクション、最大1500文字）。
    // 併せて英語版へのリンク（langlinks）も引く＝英語版の記事名がそのままローマ字表記になる
    const wikiTitle = summary.title || cleanName;
    const extractUrl = `https://ja.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=extracts|langlinks&explaintext=1&exchars=1500&lllang=en&format=json`;
    let longExtract = '';
    let romaji = '';
    try {
      const extractData = await fetchJson(extractUrl);
      const pages = extractData.query?.pages || {};
      for (const pid of Object.keys(pages)) {
        if (pid !== '-1') {
          longExtract = pages[pid].extract || '';
          const enTitle = pages[pid].langlinks?.[0]?.['*'] || '';
          // 「Kazuo Koike (manga artist)」のような曖昧さ回避の括弧は落とす
          romaji = enTitle.replace(/\s*\([^)]*\)\s*$/, '').trim();
        }
      }
    } catch {
      // フォールバック：REST APIの要約を使用
    }

    // 英語版が無い著者は、導入文のかな読みからローマ字を組み立てる
    if (!romaji) {
      romaji = romajiFromExtract(longExtract || summary.extract || '');
    }

    const result = {
      romaji,
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
