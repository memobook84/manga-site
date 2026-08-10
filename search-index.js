// 自前の検索インデックス（data/search-index.json）を使った作品検索。
//
// 楽天APIを叩かず、あらかじめ収集したシリーズ一覧をブラウザ内で引く。
// インデックスは検索が必要になった時点で初めて読み込む（遅延ロード）。
//
// 依存: search-normalize.js（normalizeSearchKey）

const SEARCH_INDEX_URL = '/data/search-index.json';

let __searchIndex = null;       // { coverBase, records: [...] }
let __searchIndexPromise = null;

// インデックスを読み込み、検索用の正規化キーを付けて保持する。
// 正規化はJSONに焼かずここで計算する（ファイルサイズを小さく保つため）
async function loadSearchIndex() {
    if (__searchIndex) return __searchIndex;
    if (__searchIndexPromise) return __searchIndexPromise;

    __searchIndexPromise = (async () => {
        const res = await fetch(SEARCH_INDEX_URL);
        if (!res.ok) throw new Error('search index ' + res.status);
        const data = await res.json();

        const records = (data.items || []).map(row => {
            const title = row[0] || '';
            const author = row[1] || '';
            const aliases = row[6] ? row[6].split('|') : [];
            return {
                title: title,
                author: author,
                publisher: row[2] || '',
                volumeCount: row[3] || 0,
                cover: row[4] || '',
                isbn: row[5] || '',
                normTitle: normalizeSearchKey(title),
                normAuthor: normalizeSearchKey(author),
                normAliases: aliases.map(normalizeSearchKey).filter(Boolean),
            };
        });

        __searchIndex = { coverBase: data.coverBase || '', records: records, generatedAt: data.generatedAt };
        return __searchIndex;
    })();

    try {
        return await __searchIndexPromise;
    } catch (err) {
        // 読み込めなければ呼び出し側がAPI検索にフォールバックする
        __searchIndexPromise = null;
        throw err;
    }
}

// 1件のスコアを出す。大きいほど上位。0は不一致
function scoreRecord(rec, q) {
    const t = rec.normTitle;
    if (t === q) return 1000;
    // 巻数が多い＝本編である可能性が高いので、派生本より少し上に出す
    const volumeBonus = Math.min(rec.volumeCount, 50) * 2;
    if (t.startsWith(q)) {
        // 余計な語が少ないほど「そのもの」に近い
        return 700 - Math.min(t.length - q.length, 200) + volumeBonus;
    }
    if (t.includes(q)) {
        return 400 - Math.min(t.length - q.length, 200) + volumeBonus;
    }
    for (let i = 0; i < rec.normAliases.length; i++) {
        const a = rec.normAliases[i];
        if (a === q) return 650;
        if (a.startsWith(q)) return 450;
        if (a.includes(q)) return 250;
    }
    if (rec.normAuthor && rec.normAuthor.includes(q)) return 120;
    return 0;
}

// 別名辞書（search-aliases.js）を引いて、検索語を実タイトルに読み替える。
// 「ワンピ」→「ONE PIECE」のように前方一致でも効かせる
let __aliasPairs = null;

function expandQuery(q) {
    const queries = [q];
    if (typeof SEARCH_ALIASES !== 'object' || q.length < 2) return queries;

    if (!__aliasPairs) {
        __aliasPairs = Object.keys(SEARCH_ALIASES).map(k => [
            normalizeSearchKey(k),
            normalizeSearchKey(SEARCH_ALIASES[k]),
        ]).filter(p => p[0] && p[1]);
    }

    __aliasPairs.forEach(pair => {
        if (pair[0] === q || pair[0].startsWith(q)) {
            if (queries.indexOf(pair[1]) === -1) queries.push(pair[1]);
        }
    });
    return queries;
}

// 検索本体。displayMangaItems() がそのまま描画できる形で返す
async function searchSeriesIndex(query, options) {
    const opts = options || {};
    const q = normalizeSearchKey(query);
    if (!q) return [];

    const index = await loadSearchIndex();
    const queries = expandQuery(q);
    const hits = [];

    for (let i = 0; i < index.records.length; i++) {
        const rec = index.records[i];
        let score = scoreRecord(rec, queries[0]);
        // 別名経由のヒットは、直接一致より一段下に置く
        for (let k = 1; k < queries.length; k++) {
            const s = scoreRecord(rec, queries[k]) * 0.9;
            if (s > score) score = s;
        }
        if (score > 0) hits.push({ rec: rec, score: score });
    }

    // スコア順 → 巻数が多い順（長期連載＝主要作品の近似）
    hits.sort((a, b) =>
        b.score - a.score ||
        b.rec.volumeCount - a.rec.volumeCount ||
        a.rec.title.localeCompare(b.rec.title, 'ja')
    );

    const limited = opts.limit ? hits.slice(0, opts.limit) : hits;
    return limited.map((h, i) => seriesToDisplayItem(h.rec, index.coverBase, i));
}

// インデックスのレコードを、既存の描画関数が期待する形に変換
function seriesToDisplayItem(rec, coverBase, index) {
    const imageUrl = rec.cover
        ? (rec.cover.startsWith('http') ? rec.cover : coverBase + rec.cover)
        : '';
    return {
        title: rec.title,
        displayTitle: rec.title,
        author: rec.author,
        publisher: rec.publisher,
        volumeCount: rec.volumeCount,
        imageUrl: imageUrl,
        isbn: rec.isbn,
        hasRealCover: !!imageUrl,
        // 表紙が無いときのプレースホルダー色（rakuten-adapter.js と同じ生成規則）
        color: (typeof generateColor === 'function') ? generateColor(rec.title, index || 0) : '#7E57C2',
        _fromIndex: true,
    };
}
