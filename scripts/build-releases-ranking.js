#!/usr/bin/env node
// ランキング（ranking.html）とスケジュール（new-releases.html）のデータを前もって作るバッチ。
//
//   node scripts/build-releases-ranking.js
//
// 書き出すもの:
//   data/ranking.json       売上順（楽天 sort=sales）の上位3ページ＝最大90巻
//   data/new-releases.json  集英社・小学館・講談社の、62日前〜発売予定までの巻
//
// 以前は2つのページがブラウザから楽天APIを直接呼んでいた。
// ・表示が遅い（スケジュールは12回を順番に＋毎回0.25秒待ち）
// ・スケジュールは「発売日が新しい順」を出版社ごとに8ページまでしか読まず、
//   2か月先の予約商品だけで上限に達して「発売中」タブが空になっていた
// 毎朝このバッチで作っておき、ページはこのファイルを1つ読むだけにする。
//
// 環境変数（build-search-index.js と同じ）:
//   RAKUTEN_APP_ID  楽天アプリID（直接叩く場合は必須）
//   API_BASE        指定すると楽天ではなく自前の /api/books 経由で取得する
//   DELAY_MS        リクエスト間隔（既定1200ms。楽天は1秒1回まで）

const https = require('https');
const fs = require('fs');
const path = require('path');

const RAKUTEN_BASE = 'https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404';
const APP_ID = (process.env.RAKUTEN_APP_ID || '').trim();
const REFERER = 'https://manga-site-three.vercel.app';
const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
const DELAY_MS = parseInt(process.env.DELAY_MS || '1200', 10);
const HITS = 30;

const DATA_DIR = path.join(__dirname, '..', 'data');
const RANKING_FILE = path.join(DATA_DIR, 'ranking.json');
const RELEASES_FILE = path.join(DATA_DIR, 'new-releases.json');

// ranking.js の RANKING_PAGES と同じ
const RANKING_PAGES = 3;

// new-releases.js の NR_PUBLISHERS と同じ
const PUBLISHERS = ['集英社', '小学館', '講談社'];
// ページ側は「今日から60日前まで」を発売中に載せる。
// バッチが1日止まっても欠けないよう、2日ぶん多めにさかのぼっておく
const DAYS_BACK = 62;
// 楽天は1つの検索条件につき100ページが上限
const MAX_PAGES = 100;

// 自前API経由の時は、日付をクエリに足してCDNのキャッシュを毎日取り直す
// （/api/* は12時間キャッシュされるので、足さないと前日の結果が混ざる）
const RUN_KEY = new Date().toISOString().slice(0, 10).replace(/-/g, '');

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function getJson(url, headers) {
    const mod = url.startsWith('https:') ? https : require('http');
    return new Promise((resolve, reject) => {
        const req = mod.get(url, { headers: headers || {} }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { reject(new Error(`JSON parse error (${res.statusCode}): ` + data.slice(0, 160))); }
            });
        });
        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

// 楽天の生データ／自前APIのどちらでも、/api/books と同じ形にそろえる。
// あらすじ（description）はどちらのページも使わないので持たない
function toItem(item) {
    const raw = item.largeImageUrl || item.mediumImageUrl || item.imageUrl || '';
    const imageUrl = raw.replace('http://', 'https://').replace(/\?_ex=\d+x\d+/, '');
    return {
        title: item.title || '',
        author: item.author || '',
        publisher: item.publisherName || item.publisher || '',
        label: item.seriesName || item.label || '',
        genre: item.booksGenreId || item.genre || '',
        firstReleaseDate: item.salesDate || item.firstReleaseDate || '',
        imageUrl: imageUrl,
        // api/books.js の resolveImageUrl と同じ判定
        hasRealCover: !!imageUrl && !/noimage|no_image|\/0000\//.test(imageUrl),
        price: item.itemPrice || item.price || 0,
        isbn: item.isbn || '',
        itemUrl: item.itemUrl || '',
        seriesName: item.seriesName || '',
    };
}

// 1ページ取得。失敗（楽天に断られた等）は例外にして、呼び出し側で待ってやり直す
async function fetchPageOnce({ publisher, sort, page }) {
    if (API_BASE) {
        const qs = new URLSearchParams({ genre: '001001', hits: String(HITS), page: String(page), sort, _: RUN_KEY });
        if (publisher) qs.set('publisher', publisher);
        const { status, body } = await getJson(`${API_BASE}/api/books?${qs}`);
        if (status !== 200 || body.error || !Array.isArray(body.items)) {
            throw new Error(`api ${status} ${JSON.stringify(body.error || '').slice(0, 120)}`);
        }
        return { items: body.items.map(toItem), pageCount: body.pageCount || 1 };
    }
    const params = new URLSearchParams({
        applicationId: APP_ID,
        accessKey: APP_ID,
        formatVersion: '2',
        booksGenreId: '001001',
        hits: String(HITS),
        page: String(page),
        sort,
    });
    if (publisher) params.set('publisherName', publisher);
    const { status, body } = await getJson(`${RAKUTEN_BASE}?${params}`, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': REFERER,
        'Origin': REFERER,
        'Accept': 'application/json',
    });
    if (status !== 200 || body.error || body.errors || !Array.isArray(body.Items)) {
        throw new Error(`rakuten ${status} ${JSON.stringify(body.error || body.errors || '').slice(0, 120)}`);
    }
    return { items: body.Items.map(toItem), pageCount: body.pageCount || 1 };
}

async function fetchPage(opts) {
    for (let attempt = 1; ; attempt++) {
        try {
            const res = await fetchPageOnce(opts);
            await sleep(DELAY_MS);
            return res;
        } catch (err) {
            if (attempt >= 4) throw err;
            console.log(`  やり直し ${attempt}回目 (${opts.publisher || '全体'} p${opts.page}): ${err.message}`);
            await sleep(DELAY_MS * 3 * attempt);
        }
    }
}

// "2026年07月04日" / "2026年07月上旬" → その日の0時（ローカル時刻）。
// new-releases.js の parseSalesDate と同じく、上旬=5 / 中旬=15 / 下旬=25（表記なしは15）
function releaseTime(str) {
    const m = (str || '').match(/(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
    if (!m) return null;
    const y = parseInt(m[1], 10);
    // 「3099年」などのダミー日付
    if (y > new Date().getFullYear() + 1) return null;
    const part = str.includes('上旬') ? 5 : str.includes('下旬') ? 25 : 15;
    return new Date(y, parseInt(m[2], 10) - 1, m[3] ? parseInt(m[3], 10) : part).getTime();
}

async function buildRanking() {
    const items = [];
    const seen = new Set();
    for (let page = 1; page <= RANKING_PAGES; page++) {
        const res = await fetchPage({ sort: 'sales', page });
        res.items.forEach(item => {
            // ページ境界で同じ巻が重複することがあるのでISBNで弾く（ranking.js と同じ）
            const key = item.isbn || item.title;
            if (!key || seen.has(key)) return;
            seen.add(key);
            items.push(item);
        });
    }
    // 1件も無いのは取得の失敗。空のファイルで上書きしない
    if (items.length === 0) throw new Error('ランキングが0件');
    return items;
}

async function buildReleases() {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - DAYS_BACK * 86400000;
    const items = [];
    const seen = new Set();

    for (const publisher of PUBLISHERS) {
        let count = 0;
        let reached = false;
        for (let page = 1; page <= MAX_PAGES; page++) {
            const res = await fetchPage({ publisher, sort: '-releaseDate', page });
            let oldest = null;
            res.items.forEach(item => {
                const t = releaseTime(item.firstReleaseDate);
                if (t === null) return;
                if (oldest === null || t < oldest) oldest = t;
                if (t < cutoff) return;
                if (item.isbn) {
                    if (seen.has(item.isbn)) return;
                    seen.add(item.isbn);
                }
                items.push(item);
                count++;
            });
            // 発売日の新しい順に並んでいるので、下限より古い巻が出てきたら取り終わり
            if (oldest !== null && oldest < cutoff) { reached = true; break; }
            if (page >= res.pageCount || res.items.length === 0) break;
        }
        console.log(`  ${publisher}: ${count}巻${reached ? '' : '（下限まで届かず）'}`);
        // 下限まで届かなかった＝途中で切れている。欠けたデータで上書きしない
        if (!reached) throw new Error(`${publisher} の新刊を${DAYS_BACK}日前までさかのぼれなかった`);
    }
    return items;
}

function writeJson(file, items) {
    const out = { updatedAt: new Date().toISOString(), items };
    fs.writeFileSync(file, JSON.stringify(out));
    console.log(`書き出し: ${path.relative(process.cwd(), file)}（${items.length}件）`);
}

async function main() {
    if (!APP_ID && !API_BASE) {
        console.error('RAKUTEN_APP_ID か API_BASE のどちらかが必要です');
        process.exit(1);
    }
    console.log(`取得元: ${API_BASE ? API_BASE + '/api/books' : '楽天API'}`);

    // 片方が失敗しても、もう片方は書き出す（失敗した方は前日のファイルのまま）
    let failed = false;

    console.log('ランキング…');
    try { writeJson(RANKING_FILE, await buildRanking()); }
    catch (err) { failed = true; console.error('ランキング失敗:', err.message); }

    console.log('スケジュール…');
    try { writeJson(RELEASES_FILE, await buildReleases()); }
    catch (err) { failed = true; console.error('スケジュール失敗:', err.message); }

    if (failed) process.exit(1);
}

main();
