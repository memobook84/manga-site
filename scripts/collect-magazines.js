// 連載誌（掲載誌）の収集バッチ
//
// 楽天ブックスAPIにはレーベル（ジャンプコミックス等）までしか無く、
// 「どの雑誌で連載されたか」は取れない。そこで Wikidata の
// 「掲載誌（P1433）」を引き、作品名 → 連載誌 の索引を data/magazines.json に落とす。
// 作品ページ（detail.html）の「連載誌」欄がこれを使う。
//
//   node scripts/collect-magazines.js
//
// Wikidata は APIキー不要。作品ごとに問い合わせるのではなく
// 「連載誌が登録された日本の漫画」を数回のクエリで丸ごと取り、手元で突き合わせる
// （約7500作品・数十秒）。取得に失敗した時は既存の data/magazines.json を書き換えない。

const fs = require('fs');
const path = require('path');
const { normalizeSearchKey } = require('../search-normalize.js');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'data', 'search-index.json');
const CATALOG = path.join(ROOT, 'data', 'manga-all.json');
const OUT = path.join(ROOT, 'data', 'magazines.json');

// detail.js は normalizeSearchKey(extractSeriesName(title)) で引くので、
// collect-anime.js と同じく rakuten-adapter.js から現物を切り出して使う
const extractSeriesName = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'rakuten-adapter.js'), 'utf8');
  const m = src.match(/function extractSeriesName\(title\)\s*\{[\s\S]*?\n\}/);
  if (!m) throw new Error('rakuten-adapter.js から extractSeriesName を取り出せませんでした');
  return new Function(`${m[0]}; return extractSeriesName;`)();
})();

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'atlas-comic-magazines/1.0 (https://manga-site-three.vercel.app)';

// 日本の連載漫画（Q21198342）と日本の漫画（Q8274）
const MANGA_TYPES = 'wd:Q21198342 wd:Q8274';
const MANGA_MAGAZINE_TYPE = 'Q15296520'; // 漫画雑誌

// Wikidata に出版社が登録されていない連載誌の補完。
// これが無いと出版社の照合ができず、少年ジャンプ+ 連載の作品（SPY×FAMILY 等）が落ちる
const MAGAZINE_PUBLISHER_FALLBACK = {
  '少年ジャンプ+': '集英社',
  'ジャンプスクエア': '集英社',
  'となりのヤングジャンプ': '集英社',
  'マガジンポケット': '講談社',
  'コミックDAYS': '講談社',
  'サンデーうぇぶり': '小学館',
  '裏サンデー': '小学館',
  'マンガワン': '小学館',
};

// 子会社・旧社名は親と同じ出版社として扱う（楽天と Wikidata で名義が揃わないため）
const PUBLISHER_GROUPS = {
  '集英社': ['集英社', 'ホーム社', '集英社クリエイティブ'],
  '小学館': ['小学館', '小学館クリエイティブ', '小学館集英社プロダクション'],
  '講談社': ['講談社'],
  'KADOKAWA': ['KADOKAWA', '角川書店', '角川グループパブリッシング', 'アスキー・メディアワークス',
    'メディアワークス', 'メディアファクトリー', 'エンターブレイン', '富士見書房'],
  'スクウェア・エニックス': ['スクウェア・エニックス', 'エニックス'],
};
const PUBLISHER_CANON = new Map();
for (const [canon, names] of Object.entries(PUBLISHER_GROUPS)) {
  for (const n of names) PUBLISHER_CANON.set(normalizeSearchKey(n), canon);
}
function canonPublisher(name) {
  const key = normalizeSearchKey(String(name || '').replace(/^株式会社|株式会社$/g, ''));
  return PUBLISHER_CANON.get(key) || key;
}

// Wikidata に掲載誌が登録されていない作品の手当て（巻数の多い有名作から順に）。
// キーは作品名（normalizeSearchKey 前でよい）。誌名は Wikidata の表記に揃える。
// 複数の学年誌にまたがるドラえもん等は、1誌に決められないので載せていない
const MANUAL = {
  '僕のヒーローアカデミア': ['週刊少年ジャンプ'],
  'BORUTO-ボルト-': ['週刊少年ジャンプ', 'Vジャンプ'],
  'キャプテン翼': ['週刊少年ジャンプ'],
  'STEEL BALL RUN スティール・ボール・ラン': ['週刊少年ジャンプ', 'ウルトラジャンプ'],
  '終わりのセラフ': ['ジャンプスクエア'],
  'To LOVEるーとらぶるー ダークネス': ['ジャンプスクエア'],
  'HIGH SCORE': ['りぼん'],
  '嘘喰い': ['週刊ヤングジャンプ'],
  'DINERダイナー': ['週刊ヤングジャンプ'],
  'TOUGH 龍を継ぐ男': ['週刊ヤングジャンプ'],
  'ラジエーションハウス': ['グランドジャンプ'],
  'MAJOR': ['週刊少年サンデー'],
  'BE BLUES！〜青になれ〜': ['週刊少年サンデー'],
  'KING GOLF': ['週刊少年サンデー'],
  'らんま1/2': ['週刊少年サンデー'],
  '信長協奏曲': ['ゲッサン'],
  'ジャジャ': ['月刊サンデージェネックス'],
  'からかい上手の（元）高木さん': ['マンガワン'],
  'スーパーマリオくん': ['月刊コロコロコミック'],
  'ドラベース ドラえもん超野球(スーパーベースボール)外伝': ['月刊コロコロコミック'],
  '土竜（モグラ）の唄': ['週刊ヤングサンデー', 'ビッグコミックスピリッツ'],
  '闇金ウシジマくん': ['ビッグコミックスピリッツ'],
  'あさひなぐ': ['ビッグコミックスピリッツ'],
  '重版出来！': ['ビッグコミックスピリッツ'],
  '新九郎、奔る！': ['ビッグコミックスピリッツ'],
  '美味しんぼ': ['ビッグコミックスピリッツ'],
  'ギャラリーフェイク': ['ビッグコミックスピリッツ'],
  'あぶさん': ['ビッグコミックオリジナル'],
  '黄昏流星群': ['ビッグコミックオリジナル'],
  '風の大地': ['ビッグコミックオリジナル'],
  '正直不動産': ['ビッグコミック'],
  'H2': ['週刊少年サンデー'],
  'ちはやふる': ['BE・LOVE'],
  '宇宙兄弟': ['モーニング'],
  'インベスターZ': ['モーニング'],
  'バトルスタディーズ': ['モーニング'],
  'フラジャイル': ['月刊アフタヌーン'],
  'ダイヤのA act2': ['週刊少年マガジン'],
  'ACMA：GAME': ['週刊少年マガジン'],
  '1日外出録ハンチョウ': ['週刊ヤングマガジン'],
  'ドラゴン桜': ['モーニング'],
  'BASTARD!!': ['週刊少年ジャンプ', 'ウルトラジャンプ'],
  'カラダ探し': ['少年ジャンプ+'],
  'テラフォーマーズ': ['週刊ヤングジャンプ'],
  'サラリーマン金太郎': ['週刊ヤングジャンプ'],
  '甘い生活 2nd season': ['週刊ヤングジャンプ'],
  '初めて恋をした日に読む話': ['Cookie'],
  '今日から俺は！！': ['週刊少年サンデー'],
  '天は赤い河のほとり': ['少女コミック'],
  '総務部総務課 山口六平太': ['ビッグコミック'],
  '空母いぶきGREAT GAME': ['ビッグコミック'],
  '忘却のサチコ': ['ビッグコミック'],
  '卑弥呼 -真説・邪馬台国伝-': ['ビッグコミックオリジナル'],
  'なんと！ でんぢゃらすじーさん': ['月刊コロコロコミック'],
  'Splatoon': ['月刊コロコロコミック'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'query=' + encodeURIComponent(query),
    });
    const text = await res.text();
    if (res.ok && text) {
      try { return JSON.parse(text).results.bindings; } catch (e) { /* 途中で切れた応答。下で再試行 */ }
    }
    const wait = res.status === 429 ? (Number(res.headers.get('retry-after')) || 60) : 10 * attempt;
    console.log(`  HTTP ${res.status}。${wait}秒後に再試行 (${attempt}/4)`);
    await sleep(wait * 1000);
  }
  throw new Error('Wikidata への問い合わせに失敗しました');
}

const qid = (uri) => uri.replace('http://www.wikidata.org/entity/', '');

// ID の一覧を 300 件ずつ VALUES に並べて問い合わせ、結果を連結する
async function sparqlByIds(ids, build) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 300) {
    const values = ids.slice(i, i + 300).map((id) => `wd:${id}`).join(' ');
    rows.push(...await sparql(build(values)));
  }
  return rows;
}

async function fetchWikidata() {
  // 1. 作品と連載誌（開始日があれば並べ替えに使う）。非推奨ランクの記述は除く
  const links = await sparql(`SELECT ?item ?mag ?start WHERE {
    VALUES ?type { ${MANGA_TYPES} }
    ?item wdt:P31 ?type ; p:P1433 ?st .
    ?st ps:P1433 ?mag ; wikibase:rank ?rank .
    FILTER(?rank != wikibase:DeprecatedRank)
    OPTIONAL { ?st pq:P580 ?start }
  }`);
  console.log(`  作品×連載誌: ${links.length}件`);

  // 2. 作品名（ラベルと別名）。楽天側が「DRAGON BALL」のように英字表記で、
  //    Wikidata の日本語名が「ドラゴンボール」の作品があるので英語名も拾う
  const names = await sparql(`SELECT ?item ?l WHERE {
    VALUES ?type { ${MANGA_TYPES} }
    ?item wdt:P31 ?type ; wdt:P1433 [] .
    { ?item rdfs:label ?l } UNION { ?item skos:altLabel ?l }
    FILTER(lang(?l) = "ja" || lang(?l) = "en")
  }`);
  console.log(`  作品名: ${names.length}件`);

  // 3. 作品そのものの出版社（ID だけ。名前は 5 でまとめて引く）
  const itemPubs = await sparql(`SELECT ?item ?pub WHERE {
    VALUES ?type { ${MANGA_TYPES} }
    ?item wdt:P31 ?type ; wdt:P1433 [] ; wdt:P123 ?pub .
  }`);

  // 4. 連載誌の出版社と、漫画雑誌として登録されているか。
  //    連載誌を副問い合わせで集めてラベルまで結合すると 60 秒で打ち切られるので、
  //    1 で得た連載誌の ID を VALUES に並べて分割して引く
  const magIds = [...new Set(links.map((b) => qid(b.mag.value)))];
  const magPubs = await sparqlByIds(magIds, (v) => `SELECT ?mag ?pub WHERE { VALUES ?mag { ${v} } ?mag wdt:P123 ?pub . }`);
  const mangaMags = await sparqlByIds(magIds, (v) => `SELECT ?mag WHERE { VALUES ?mag { ${v} } ?mag wdt:P31 wd:${MANGA_MAGAZINE_TYPE} . }`);
  // 創刊日。連載の開始日が登録されていない作品で、誌の並び順の代わりに使う
  const magInception = await sparqlByIds(magIds, (v) => `SELECT ?mag ?since WHERE { VALUES ?mag { ${v} } ?mag wdt:P571 ?since . }`);
  console.log(`  連載誌: ${magIds.length}誌`);

  // 5. 連載誌と出版社の日本語名
  const pubIds = [...itemPubs, ...magPubs].map((b) => qid(b.pub.value));
  const labelRows = await sparqlByIds([...new Set([...magIds, ...pubIds])],
    (v) => `SELECT ?x ?l WHERE { VALUES ?x { ${v} } ?x rdfs:label ?l . FILTER(lang(?l) = "ja") }`);
  const label = new Map(labelRows.map((b) => [qid(b.x.value), b.l.value]));

  const magazines = new Map(); // qid → { label, pubs:Set, isMangaMagazine, since }
  for (const id of magIds) {
    // 日本語名の無い誌は表示できないので使わない
    if (label.has(id)) magazines.set(id, { label: label.get(id), pubs: new Set(), isMangaMagazine: false, since: '' });
  }
  for (const b of magInception) {
    const m = magazines.get(qid(b.mag.value));
    if (m && (!m.since || b.since.value < m.since)) m.since = b.since.value;
  }
  for (const b of magPubs) {
    const m = magazines.get(qid(b.mag.value));
    const name = label.get(qid(b.pub.value));
    if (m && name) m.pubs.add(canonPublisher(name));
  }
  for (const b of mangaMags) {
    const m = magazines.get(qid(b.mag.value));
    if (m) m.isMangaMagazine = true;
  }
  for (const m of magazines.values()) {
    if (m.pubs.size === 0 && MAGAZINE_PUBLISHER_FALLBACK[m.label]) {
      m.pubs.add(canonPublisher(MAGAZINE_PUBLISHER_FALLBACK[m.label]));
    }
  }

  const items = new Map(); // qid → { names:Set, pubs:Set, mags: Map(magQid → start) }
  const getItem = (id) => {
    if (!items.has(id)) items.set(id, { names: new Set(), pubs: new Set(), mags: new Map() });
    return items.get(id);
  };
  for (const b of links) {
    const it = getItem(qid(b.item.value));
    const magId = qid(b.mag.value);
    const start = b.start ? b.start.value : '';
    const prev = it.mags.get(magId);
    if (prev === undefined || (start && (!prev || start < prev))) it.mags.set(magId, start);
  }
  for (const b of names) getItem(qid(b.item.value)).names.add(b.l.value);
  for (const b of itemPubs) {
    const name = label.get(qid(b.pub.value));
    if (name) getItem(qid(b.item.value)).pubs.add(canonPublisher(name));
  }

  return { items, magazines };
}

// 「BORUTO-ボルト- -NARUTO NEXT GENERATIONS-」「薬屋のひとりごと〜猫猫の後宮謎解き手帳〜」
// のような副題付きの名前から、副題の前だけを取り出す。完全一致で見つからない時の第2候補に使う
// 楽天側の「銀魂ーぎんたまー」「BORUTO-ボルトー」のような末尾の読みもここで外す
function headOf(name) {
  const head = String(name).split(/[\s　]+[-－‐〜～~:：]|[〜～]|[：:]/)[0];
  // 副題で切った結果が短すぎる（「DRAGON」等）と別作品に当たるので捨てる。
  // 読みを外した結果は短くてよい（「銀魂ーぎんたまー」→「銀魂」）
  if (normalizeSearchKey(head).length < 4) return '';
  return normalizeSearchKey(head.replace(/(?:[-－‐][ぁ-んァ-ヴー]+|ー[ぁ-ん]+)[-－‐ー]$/, ''));
}

// 「DRAGON BALL 完全版」「H2〔小学館文庫〕」「新装版　頭文字D」のような版違いから元の作品名を取り出す。
// 版違いは元の連載誌をそのまま引き継ぐ
const EDITION = '完全版|新装版|愛蔵版|ワイド版|文庫版|新書版|カラー版|デラックス版|復刻版|豪華版|総集編';
function editionBaseOf(title) {
  const base = String(title)
    .replace(/[\s　]*〔[^〕]*〕$/, '')
    .replace(new RegExp(`[\\s　]*[（(]?(?:${EDITION})[）)]?$`), '')
    .replace(new RegExp(`^(?:${EDITION})[\\s　]+`), '')
    .trim();
  return base !== title ? base : '';
}

// サイト側の作品一覧（検索インデックス＋カタログ）。キー → 出版社の集合
function loadSiteSeries() {
  const series = new Map(); // key → { title, pubs:Set }
  const add = (title, publisher) => {
    const name = extractSeriesName(title || '');
    const key = normalizeSearchKey(name);
    if (!key) return;
    if (!series.has(key)) series.set(key, { title: name, pubs: new Set() });
    if (publisher) series.get(key).pubs.add(canonPublisher(publisher));
  };
  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  const T = index.fields.indexOf('title');
  const P = index.fields.indexOf('publisher');
  for (const row of index.items) add(row[T], row[P]);
  for (const s of JSON.parse(fs.readFileSync(CATALOG, 'utf8'))) add(s.displayTitle || s.title, s.publisher);
  return series;
}

function pickMagazines(site, candidates, magazines, { strict }) {
  const sitePubs = site.pubs;
  const pubMatches = (pubs) => [...pubs].some((p) => sitePubs.has(p));

  // 出版社が一致する根拠（作品の出版社 or 連載誌の出版社）がある候補を優先する。
  // 根拠が1つも無い候補は、完全一致かつ候補が1つだけの時に限って採る
  const evidence = (it) => {
    const pubs = new Set(it.pubs);
    for (const id of it.mags.keys()) for (const p of (magazines.get(id)?.pubs || [])) pubs.add(p);
    if (pubs.size === 0) return 'unknown';
    return pubMatches(pubs) ? 'match' : 'mismatch';
  };
  const graded = candidates.map((it) => ({ it, ev: evidence(it) }));
  let chosen = graded.filter((g) => g.ev === 'match').map((g) => g.it);
  if (chosen.length === 0 && !strict && graded.length === 1 && graded[0].ev === 'unknown') {
    chosen = [graded[0].it];
  }
  if (chosen.length === 0) return null;

  // 連載誌は「出版社が一致する誌」と「出版社不明だが漫画雑誌として登録されている誌」だけ残す。
  // 海外版（週刊少年ジャンプ (米国)）や配信ストア（ブックライブ）はここで落ちる
  // 並べ替えの基準は連載開始日。登録されていなければ誌の創刊日で代用する
  // （チェンソーマンは両誌とも開始日が無く、創刊の古い週刊少年ジャンプ → 少年ジャンプ+ になる）
  const picked = new Map(); // label → 並べ替え用の日付
  for (const it of chosen) {
    for (const [id, start] of it.mags) {
      const m = magazines.get(id);
      if (!m) continue;
      const ok = m.pubs.size ? pubMatches(m.pubs) : m.isMangaMagazine;
      if (!ok) continue;
      const when = start || m.since || '9999';
      const prev = picked.get(m.label);
      if (prev === undefined || when < prev) picked.set(m.label, when);
    }
  }
  if (picked.size === 0) return null;
  return [...picked.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([label]) => label)
    .slice(0, 3);
}

(async () => {
  console.log('Wikidata から連載誌を取得中…');
  const { items, magazines } = await fetchWikidata();

  // Wikidata 側の索引: 完全一致キー → 作品、副題を除いたキー → 作品
  const byKey = new Map();
  const byHead = new Map();
  const push = (map, key, it) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(it);
  };
  for (const it of items.values()) {
    for (const n of it.names) {
      // 「キングダム (漫画)」のような曖昧さ回避の括弧は外す
      const name = n.replace(/[\s　]*[（(][^）)]*[）)]$/, '');
      push(byKey, normalizeSearchKey(name), it);
      push(byHead, headOf(name), it);
    }
  }

  const siteSeries = loadSiteSeries();
  console.log(`サイト側の作品: ${siteSeries.size}件`);

  const manual = new Map(Object.entries(MANUAL).map(([title, mags]) => [normalizeSearchKey(title), mags]));

  const out = {};
  let exact = 0, loose = 0, manualHits = 0;
  for (const [key, site] of siteSeries) {
    const base = editionBaseOf(site.title);
    const baseKey = base ? normalizeSearchKey(base) : '';

    // 手動の対応表が最優先（版違いも元の作品の分を引き継ぐ）
    const m = manual.get(key) || (baseKey && manual.get(baseKey));
    if (m) { out[key] = m; manualHits++; continue; }

    let mags = byKey.has(key) ? pickMagazines(site, [...byKey.get(key)], magazines, { strict: false }) : null;
    if (mags) { exact++; } else {
      // 完全一致が無ければ、副題・読み・版の表記を外して探す。
      // 誤爆しやすいので出版社の一致を必須にする
      const cands = new Set([
        ...(byHead.get(key) || []),
        ...(byKey.get(headOf(site.title)) || []),
        ...(baseKey ? [...(byKey.get(baseKey) || []), ...(byHead.get(baseKey) || []), ...(byKey.get(headOf(base)) || [])] : []),
      ]);
      if (cands.size) mags = pickMagazines(site, [...cands], magazines, { strict: true });
      if (mags) loose++;
    }
    if (mags) out[key] = mags;
  }
  // カタログに無い表記で開かれても引けるよう、対応表のキーそのものも入れておく
  for (const [key, mags] of manual) if (!out[key]) out[key] = mags;

  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
  const total = Object.keys(out).length;
  console.log('\n===== 完了 =====');
  console.log(`連載誌あり: ${total}件 / ${siteSeries.size}件（完全一致 ${exact}・副題/版を除いて一致 ${loose}・手動 ${manualHits}）`);
  console.log(`出力: data/magazines.json (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
