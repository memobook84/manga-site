// 作品ページ・全巻一覧ページ用の巻データキャッシュ読み込み。
//
// data/series/xx/xxxxxxxx.json に焼いてある巻一覧を読む。
// 無ければ null を返すので、呼び出し側は今まで通りAPIで取得する
// （APIの処理は消していないので、いつでも元に戻せる）。
//
// 依存: search-normalize.js（normalizeSearchKey / seriesCachePath）
//       rakuten-adapter.js（adaptItem）

// false にすると全ページが即座にAPI取得へ戻る（切り戻し用スイッチ）
const USE_SERIES_CACHE = true;

// 楽天の表紙URLの共通接頭辞。キャッシュ側は後ろだけ持っている
const SERIES_COVER_BASE = 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/';

// 一度読んだまとめファイルは使い回す（同じバケットの作品なら再取得しない）
const __bucketCache = {};

async function loadBucket(path) {
    if (__bucketCache[path] !== undefined) return __bucketCache[path];
    try {
        const res = await fetch('/' + path);
        __bucketCache[path] = res.ok ? await res.json() : null;
    } catch (err) {
        __bucketCache[path] = null;
    }
    return __bucketCache[path];
}

// シリーズ名から巻一覧を取得。
// 戻り値は adaptApiResponse().items と同じ形（そのまま既存処理に流せる）
async function loadSeriesVolumes(seriesTitle) {
    if (!USE_SERIES_CACHE) return null;
    if (typeof normalizeSearchKey !== 'function' || typeof seriesBucketPath !== 'function') return null;

    const key = normalizeSearchKey(extractSeriesName(seriesTitle) || seriesTitle);
    if (!key) return null;

    const bucket = await loadBucket(seriesBucketPath(key));
    if (!bucket) return null;

    const data = bucket[key];      // 未収録の作品 → APIに任せる
    if (!data || !Array.isArray(data.v) || data.v.length === 0) return null;

    // [巻数, タイトル, ISBN, 発売日, 表紙パス, 価格, レーベル, あらすじ]
    return data.v.map((row, i) => {
        const cover = row[4] || '';
        const raw = {
            title: row[1] || '',
            author: data.a || '',
            publisher: data.p || '',
            label: row[6] || '',
            genre: data.g || '',
            firstReleaseDate: row[3] || '',
            description: row[7] || '',
            // 楽天以外から持ってきた表紙は絶対URL（http〜）か
            // サイト内のパス（/covers/〜）で書いてあるので、そのまま通す
            imageUrl: cover
                ? ((cover.indexOf('http') === 0 || cover.indexOf('/') === 0)
                    ? cover
                    : SERIES_COVER_BASE + cover)
                : '',
            hasRealCover: !!cover,
            price: row[5] || 0,
            isbn: row[2] || '',
            itemUrl: '',
            seriesName: row[6] || '',
        };
        return (typeof adaptItem === 'function') ? adaptItem(raw, i) : raw;
    });
}
