#!/usr/bin/env node
// 検索用インデックスを構築するバッチ。
//
//   node scripts/build-search-index.js
//
// 楽天ブックスAPIのコミックジャンル（001001）を出版社ごとに舐めて、
// 巻をシリーズ単位にまとめ、data/search-index.json を書き出す。
// collect.js（ホームのカタログ用）とは別物で、こちらは出版社を絞らず
// 「あらゆるコミック」を対象にする。
//
// 環境変数:
//   RAKUTEN_APP_ID  楽天アプリID（直接叩く場合は必須）
//   API_BASE        指定すると楽天ではなく自前の /api/books 経由で取得する。
//                   ローカル開発サーバ（http://localhost:3000）や本番URLを渡せば、
//                   手元に楽天のキーが無くても収集できる
//   MAX_PAGES       出版社あたりの最大ページ数（既定100 = 3000冊）
//   DELAY_MS        リクエスト間隔（既定1200ms）

const https = require('https');
const fs = require('fs');
const path = require('path');
const { normalizeSearchKey, extractKanaAlias, seriesBucketPath } = require('../search-normalize.js');

const RAKUTEN_BASE = 'https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404';
const APP_ID = (process.env.RAKUTEN_APP_ID || '').trim();
const REFERER = 'https://manga-site-three.vercel.app';

const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '100', 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || '1200', 10);
const HITS = 30;
const FRESH = process.env.FRESH === '1';           // 1なら既存インデックスを捨てて作り直す
const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean);

// 楽天は「1つの検索条件につき最大100ページ（3000件）」で頭打ちになる。
// 大手出版社はこれに当たるので、上限に達した版元だけジャンル別にも舐めて取りこぼしを埋める
const SUB_GENRES = [
    '001001001', '001001002', '001001003', '001001004', '001001005',
    '001001006', '001001007', '001001008', '001001009',
];
const CAP_BOOKS = MAX_PAGES * HITS;

// 楽天の画像URLはこの接頭辞が共通なので、インデックスでは切り落として持つ
const COVER_BASE = 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/';

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(DATA_DIR, 'search-index.json');

// コミックを多く出している版元。ここを増やすほど検索の網羅性が上がる
const PUBLISHERS = [
    '集英社', '小学館', '講談社', 'KADOKAWA', '角川書店', '白泉社', '秋田書店',
    'スクウェア・エニックス', '少年画報社', '双葉社', '芳文社', '竹書房',
    '徳間書店', '新潮社', '日本文芸社', 'リイド社', '一迅社', 'マッグガーデン',
    'コアミックス', '幻冬舎コミックス', 'ホーム社', 'フレックスコミックス',
    'ジャイブ', '太田出版', 'ブシロード', 'イースト・プレス', 'エンターブレイン',
    'メディアファクトリー', '朝日新聞出版', '小学館クリエイティブ',
];

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// 自前API（http/https どちらでも）からJSONを取る
function httpGetJson(url) {
    const mod = url.startsWith('https:') ? https : require('http');
    return new Promise((resolve, reject) => {
        const req = mod.get(url, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 160))); }
            });
        });
        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function rakutenFetch(url) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const req = https.request({
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
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 160))); }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
    });
}

// rakuten-adapter.js の extractSeriesName() と同じ規則
function extractSeriesName(title) {
    if (!title) return '';
    let name = title;
    name = name.replace(/[\s　]+\d+[\s　]+劇場版.*$/, '');
    name = name.replace(/[\s　]+YONA MEMORIAL.*$/, '');
    name = name.replace(/[\s　]*[（(][^）)]*特装版[^）)]*[）)]$/, '');
    name = name.replace(/[\s　]*[（(][^）)]*限定版[^）)]*[）)]$/, '');
    name = name.replace(/[\s　]+\d+[\s　]+-[^-]+-$/, '');
    name = name.replace(/[\s　]+\d+$/, '');
    name = name.replace(/[（(]\d+[）)]$/, '');
    name = name.replace(/[\s　]+第?\d+巻?$/, '');
    name = name.replace(/[\s　]+\d+巻$/, '');
    name = name.replace(/[\s　]+\d+巻[\s　].*版$/, '');
    name = name.replace(/[\s　]*[（(]第?\d+[巻集][）)]$/, '');
    name = name.replace(/([）)])[\s　]*\d+$/, '$1');
    name = name.replace(/[\s　]*[（(][ぁ-んァ-ヴー・\s　]+[）)]$/, '');
    return name.trim();
}

// detail.js の extractVolumeNumber() と同等（巻数で並べ替えるため）
function extractVolumeNumber(title) {
    if (!title) return null;
    let m = title.match(/[\s　]+(\d+)$/);
    if (m) return parseInt(m[1]);
    m = title.match(/[（(](\d+)[）)]$/);
    if (m) return parseInt(m[1]);
    m = title.match(/第(\d+)巻?$/);
    if (m) return parseInt(m[1]);
    m = title.match(/(\d+)巻$/);
    if (m) return parseInt(m[1]);
    return null;
}

function coverPath(imageUrl) {
    if (!imageUrl) return '';
    const url = imageUrl.replace('http://', 'https://').replace(/\?_ex=\d+x\d+/, '');
    if (url.includes('noimage') || url.includes('no_image') || url.includes('/0000/')) return '';
    return url.startsWith(COVER_BASE) ? url.slice(COVER_BASE.length) : url;
}

// 楽天のデータには文字化け（U+FFFD）が混ざることがあるので落とす。
// 残すと同じ作品が別シリーズとして二重登録される
function cleanText(str) {
    return str ? String(str).replace(/�+/g, '').trim() : '';
}

// 楽天生レスポンス / 自前API のどちらの形でも同じ形に揃える
function toBook(item) {
    return {
        title: cleanText(item.title),
        author: cleanText(item.author),
        publisher: cleanText(item.publisherName || item.publisher),
        isbn: item.isbn || '',
        date: item.salesDate || item.firstReleaseDate || '',
        imageUrl: item.largeImageUrl || item.mediumImageUrl || item.imageUrl || '',
        price: item.itemPrice || item.price || 0,
        label: cleanText(item.seriesName || item.label),
        genre: item.booksGenreId || item.genre || '',
        description: cleanText(item.itemCaption || item.description),
    };
}

// 1ページ分を取得（楽天直 or 自前API経由）
async function fetchPage(publisher, page, genre) {
    const genreId = genre || '001001';
    if (API_BASE) {
        const qs = new URLSearchParams({
            genre: genreId,
            publisher: publisher,
            hits: String(HITS),
            page: String(page),
            sort: 'sales',
        });
        const res = await httpGetJson(`${API_BASE}/api/books?${qs}`);
        if (res.error) throw new Error(JSON.stringify(res.error));
        return { items: (res.items || []).map(toBook), pageCount: res.pageCount || 1 };
    }
    const params = new URLSearchParams({
        applicationId: APP_ID,
        accessKey: APP_ID,
        formatVersion: '2',
        booksGenreId: genreId,
        publisherName: publisher,
        hits: String(HITS),
        page: String(page),
        sort: 'sales',
    });
    const data = await rakutenFetch(`${RAKUTEN_BASE}?${params}`);
    if (data.errors) throw new Error(JSON.stringify(data.errors));
    return { items: (data.Items || []).map(toBook), pageCount: data.pageCount || 1 };
}

// --- 収集 ---
const seriesMap = new Map();
const seenIsbn = new Set();   // 同じ本を二度数えない（出版社×ジャンルで重複して取れるため）
let bookCount = 0;

function addBook(book) {
    const title = book.title || '';
    if (!title) return;
    // 特典付き・セット物はシリーズ代表に混ぜない
    if (/セット|全巻|ボックス|合本|一括/.test(title)) return;
    if (book.isbn) {
        if (seenIsbn.has(book.isbn)) return;
        seenIsbn.add(book.isbn);
    }

    const key = extractSeriesName(title);
    if (!key) return;
    const normKey = normalizeSearchKey(key);
    if (!normKey) return;

    bookCount++;
    let s = seriesMap.get(normKey);
    // 前回インデックス由来のレコードは、今回の集計と混ざらないよう一度リセットする
    // （前回の巻数は prevCount に退避し、書き出し時に多い方を採用）
    if (s && s.fromPrev) {
        s.prevCount = s.volumeCount;
        s.volumeCount = 0;
        s.fromPrev = false;
    }
    if (!s) {
        s = {
            title: key,
            author: book.author || '',
            publisher: book.publisher || '',
            volumeCount: 0,
            cover: '',
            coverDate: '',
            isbn: '',
            aliases: new Set(),
            latestDate: '',
            genre: '',
            volumes: [],   // 作品ページ用に各巻も保持する
        };
        seriesMap.set(normKey, s);
    }
    s.volumeCount++;
    if (!s.volumes) s.volumes = [];   // 前回インデックス由来のレコード用
    s.volumes.push([
        extractVolumeNumber(title),
        title,
        book.isbn || '',
        book.date || '',
        coverPath(book.imageUrl),
        book.price || 0,
        book.label || '',
        book.description || '',
    ]);
    if (!s.genre && book.genre) s.genre = book.genre;

    // タイトル中の読みガナは検索の別名として使える
    const kana = extractKanaAlias(title);
    if (kana) s.aliases.add(kana);

    // 表紙は「実カバーがある一番古い巻」を優先（新刊は未登録が多い）
    const cp = coverPath(book.imageUrl);
    const date = book.date || '';
    if (cp && (!s.cover || (date && s.coverDate && date < s.coverDate))) {
        s.cover = cp;
        s.coverDate = date;
        s.isbn = book.isbn || '';
    }
    if (date > s.latestDate) s.latestDate = date;
    if (!s.author && book.author) s.author = book.author;
    if (!s.publisher && book.publisher) s.publisher = book.publisher;
}

async function crawlPublisher(publisher, genre) {
    let added = 0;
    let errors = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
        try {
            const { items, pageCount } = await fetchPage(publisher, page, genre);
            errors = 0;
            items.forEach(addBook);
            added += items.length;
            if (page >= pageCount || items.length === 0) break;
            await sleep(DELAY_MS);
        } catch (err) {
            errors++;
            if (errors >= 3) {
                console.log(` [${publisher} p${page} 中断: ${err.message}]`);
                break;
            }
            await sleep(DELAY_MS * 3);
        }
    }
    return added;
}

// 既存インデックスを読み込んで土台にする。
// これがあるので実行は「積み増し」になり、途中で止めても前回分を失わない
function loadExisting() {
    if (FRESH || !fs.existsSync(OUT_FILE)) return 0;
    try {
        const prev = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
        (prev.items || []).forEach(row => {
            const title = row[0] || '';
            const key = normalizeSearchKey(title);
            if (!key || seriesMap.has(key)) return;
            seriesMap.set(key, {
                title: title,
                author: row[1] || '',
                publisher: row[2] || '',
                volumeCount: row[3] || 0,
                cover: row[4] || '',
                coverDate: '',
                isbn: row[5] || '',
                aliases: new Set(row[6] ? row[6].split('|').filter(Boolean) : []),
                latestDate: '',
                fromPrev: true,
            });
        });
        return seriesMap.size;
    } catch (e) {
        console.warn('既存インデックスの読み込みに失敗（新規作成します）:', e.message);
        return 0;
    }
}

function writeIndex() {
    // 巻数が多い順＝主要作品が先。同数はタイトル順で安定させる
    // 前回の巻数と今回の集計は、多い方を採用（部分実行で数が減らないように）
    const list = [...seriesMap.values()].map(s => Object.assign({}, s, {
        volumeCount: Math.max(s.volumeCount, s.prevCount || 0),
    })).sort((a, b) =>
        b.volumeCount - a.volumeCount || a.title.localeCompare(b.title, 'ja')
    );

    const out = {
        generatedAt: new Date().toISOString(),
        count: list.length,
        bookCount: bookCount,
        coverBase: COVER_BASE,
        // items の各要素の並び
        fields: ['title', 'author', 'publisher', 'volumeCount', 'cover', 'isbn', 'aliases'],
        items: list.map(s => [
            s.title,
            s.author,
            s.publisher,
            s.volumeCount,
            s.cover,
            s.isbn,
            s.aliases.size ? [...s.aliases].join('|') : '',
        ]),
    };

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(out), 'utf8');
    const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
    return { count: list.length, kb };
}

// 作品ページ用に、シリーズごとの巻一覧を data/series/xx.json へ書き出す。
// 1シリーズ1ファイルにすると8千個になり vercel dev が詰まるので、
// ハッシュ先頭2桁で256個のまとめファイルにする。
// 1巻しかないもの（ファンブック等）はAPIで十分速いので焼かない
function writeSeriesFiles() {
    const buckets = {};
    seriesMap.forEach((s, normKey) => {
        if (!s.volumes || s.volumes.length < 2) return;

        // 巻数順に並べる。巻数が取れないものは末尾へ（発売日順）
        const vols = [...s.volumes].sort((a, b) => {
            if (a[0] !== null && b[0] !== null) return a[0] - b[0];
            if (a[0] === null && b[0] === null) return (a[3] || '').localeCompare(b[3] || '');
            return a[0] === null ? 1 : -1;
        });

        const rel = seriesBucketPath(normKey);
        (buckets[rel] = buckets[rel] || {})[normKey] = {
            t: s.title,
            a: s.author,
            p: s.publisher,
            g: s.genre || '',
            u: new Date().toISOString().slice(0, 10),
            v: vols,
        };
    });

    let files = 0;
    let bytes = 0;
    let series = 0;
    Object.keys(buckets).forEach(rel => {
        const abs = path.join(__dirname, '..', rel);
        const dir = path.dirname(abs);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const json = JSON.stringify(buckets[rel]);
        fs.writeFileSync(abs, json, 'utf8');
        files++;
        bytes += json.length;
        series += Object.keys(buckets[rel]).length;
    });
    return { files, series, mb: Math.round(bytes / 1048576 * 10) / 10 };
}

async function main() {
    if (!APP_ID && !API_BASE) {
        console.error('RAKUTEN_APP_ID か API_BASE のどちらかが必要です');
        process.exit(1);
    }
    if (API_BASE) console.log(`取得元: ${API_BASE}/api/books`);

    const targets = ONLY.length ? ONLY : PUBLISHERS;
    const carried = loadExisting();
    if (carried) console.log(`既存インデックスを引き継ぎ: ${carried}シリーズ`);
    console.log(`検索インデックス構築: 出版社${targets.length}社 / 最大${MAX_PAGES}ページ`);
    const started = Date.now();

    for (let i = 0; i < targets.length; i++) {
        const pub = targets[i];
        process.stdout.write(`[${i + 1}/${targets.length}] ${pub} ... `);
        const n = await crawlPublisher(pub);
        console.log(`${n}冊 (シリーズ累計 ${seriesMap.size})`);

        // 上限（100ページ）に達した版元は取りこぼしているので、ジャンル別にも舐める
        if (n >= CAP_BOOKS) {
            for (const genre of SUB_GENRES) {
                const g = await crawlPublisher(pub, genre);
                if (g > 0) console.log(`      └ ${genre}: ${g}冊 (累計 ${seriesMap.size})`);
                writeIndex();
            }
        }
        // 途中で止めても使えるよう、出版社ごとに書き出す
        writeIndex();
    }

    const { count, kb } = writeIndex();
    const series = writeSeriesFiles();
    const min = Math.round((Date.now() - started) / 60000);
    console.log(`\n完了: ${count}シリーズ / ${bookCount}冊 → data/search-index.json (${kb}KB, ${min}分)`);
    console.log(`作品ページ用キャッシュ: ${series.series}シリーズ / ${series.files}ファイル / ${series.mb}MB → data/series/`);
}

main().catch(err => {
    console.error('失敗:', err.message);
    process.exit(1);
});
