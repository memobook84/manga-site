// アニメ化情報の収集バッチ
//
// data/manga-all.json の各シリーズを AniList で引き、
// 「アニメ化されているか」と「そのアニメの和名」だけを data/anime.json に落とす。
// 作品ページ（detail.html）の「アニメ」欄と Prime Video 導線がこれを使う。
//
//   node scripts/collect-anime.js            全件
//   node scripts/collect-anime.js --limit 50 先頭50件だけ（動作確認用）
//
// AniList は APIキー不要・レート制限 30req/分。
// 1リクエストに10件をエイリアスで相乗りさせ、2.2秒間隔で回して約5分。

const fs = require('fs');
const path = require('path');
const { normalizeSearchKey } = require('../search-normalize.js');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'manga-all.json');
const OUT = path.join(ROOT, 'data', 'anime.json');

// 索引のキーは detail.js が引く時とまったく同じ作り方にしないと引けない。
// あちらは normalizeSearchKey(extractSeriesName(title)) で引くので、
// extractSeriesName を rakuten-adapter.js から現物のまま持ってくる。
// ファイル全体を require すると window/document を触る初期化まで走ってしまうため、
// 関数定義のところだけ切り出して評価している
const extractSeriesName = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'rakuten-adapter.js'), 'utf8');
  const m = src.match(/function extractSeriesName\(title\)\s*\{[\s\S]*?\n\}/);
  if (!m) throw new Error('rakuten-adapter.js から extractSeriesName を取り出せませんでした');
  return new Function(`${m[0]}; return extractSeriesName;`)();
})();

const ENDPOINT = 'https://graphql.anilist.co';
const BATCH = 10;      // 1リクエストに載せる作品数
const INTERVAL = 2200; // ms。30req/分に収める

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Media を直接引くと1件でもヒットしないと HTTP 404 になり、
// 相乗りさせた他の作品まで巻き添えで null になる。
// Page でラップすると空配列が返るだけで済むのでこちらを使う。
const FIELDS = `media(search:$s%i, type:MANGA){
  title{ native romaji english }
  relations{ edges{ relationType node{
    type
    format
    popularity
    title{ native romaji }
    startDate{ year }
  }}}
}`;

function buildQuery(n) {
  const vars = Array.from({ length: n }, (_, i) => `$s${i}:String`).join(',');
  const body = Array.from({ length: n }, (_, i) =>
    `m${i}:Page(perPage:1){${FIELDS.replace('%i', i)}}`
  ).join('\n');
  return `query(${vars}){\n${body}\n}`;
}

async function request(titles) {
  const query = buildQuery(titles.length);
  const variables = {};
  titles.forEach((t, i) => { variables[`s${i}`] = t; });

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429) {
      const wait = (Number(res.headers.get('retry-after')) || 60) + 1;
      console.log(`  レート制限。${wait}秒待機`);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok && res.status !== 404) {
      console.log(`  HTTP ${res.status}。5秒後に再試行`);
      await sleep(5000);
      continue;
    }
    const json = await res.json();
    return json.data || {};
  }
  return {};
}

// AniList の検索はあいまいなので、返ってきた作品名が
// 問い合わせたタイトルと同じキーに正規化される時だけ採用する。
// これを外すと「K2」で無関係の作品を拾って、誤ったアニメを案内してしまう。
function isSameWork(queryTitle, media) {
  const key = normalizeSearchKey(queryTitle);
  if (!key) return false;
  return ['native', 'romaji', 'english']
    .map((k) => media.title[k])
    .filter(Boolean)
    .some((t) => normalizeSearchKey(t) === key);
}

// 本編らしさの順位。TVシリーズを最優先し、劇場版・OVAは後回しにする
const FORMAT_RANK = { TV: 0, ONA: 0, TV_SHORT: 1, MOVIE: 2, OVA: 3, SPECIAL: 3 };

function pickAnime(media) {
  const animes = (media.relations.edges || [])
    .map((e) => e.node)
    .filter((n) => n.type === 'ANIME' && n.format !== 'MUSIC')
    // 「呪術廻戦PV」のような宣伝映像がエントリになっていることがある。
    // これを本編として案内すると検索が空振りするので落とす
    .filter((n) => !/\bPV\b|ＰＶ|予告|ティザー/i.test(n.title.native || n.title.romaji || ''));

  const adaptations = (media.relations.edges || [])
    .filter((e) => e.node.type === 'ANIME' && e.relationType === 'ADAPTATION');
  if (adaptations.length === 0 || animes.length === 0) return null;

  // 形式で絞ったうえで人気順。「ONE PIECE」でOVAではなくTV本編を引くのが目的。
  // 発表年が古い順だと、本編より前に出たOVAや読切アニメを掴んでしまう
  const main = animes.slice().sort((a, b) => {
    const fa = FORMAT_RANK[a.format] !== undefined ? FORMAT_RANK[a.format] : 4;
    const fb = FORMAT_RANK[b.format] !== undefined ? FORMAT_RANK[b.format] : 4;
    return fa - fb || (b.popularity || 0) - (a.popularity || 0);
  })[0];

  return {
    title: main.title.native || main.title.romaji,
    year: main.startDate.year || null,
    count: adaptations.length,
  };
}

(async () => {
  const all = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const series = all.slice(0, Math.min(all.length, LIMIT));
  console.log(`対象: ${series.length}件 / バッチ${BATCH}件 = ${Math.ceil(series.length / BATCH)}リクエスト`);

  const out = {};
  let found = 0, mismatched = 0, noHit = 0;

  for (let i = 0; i < series.length; i += BATCH) {
    const chunk = series.slice(i, i + BATCH);
    const titles = chunk.map((x) => extractSeriesName(x.displayTitle || x.title));
    const data = await request(titles);

    chunk.forEach((item, k) => {
      const queryTitle = titles[k];
      const media = (data[`m${k}`] && data[`m${k}`].media || [])[0];
      if (!media) { noHit++; return; }
      if (!isSameWork(queryTitle, media)) { mismatched++; return; }

      const anime = pickAnime(media);
      if (!anime) return;

      out[normalizeSearchKey(queryTitle)] = anime;
      found++;
    });

    const done = Math.min(i + BATCH, series.length);
    process.stdout.write(`\r  ${done}/${series.length}  アニメ化 ${found}件`);
    if (done < series.length) await sleep(INTERVAL);
  }

  console.log('');
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
  console.log(`\n===== 完了 =====`);
  console.log(`アニメ化あり : ${found}件 (${(found / series.length * 100).toFixed(1)}%)`);
  console.log(`別作品と判定 : ${mismatched}件（あいまい検索の誤ヒットを除外）`);
  console.log(`AniList未収録: ${noHit}件`);
  console.log(`出力: data/anime.json (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
})();
