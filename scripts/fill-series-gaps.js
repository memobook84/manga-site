#!/usr/bin/env node
// 作品ページ用キャッシュ（data/series/*.json）の巻の穴を埋めるバッチ。
//
//   API_BASE=http://localhost:3000 node scripts/fill-series-gaps.js
//
// build-search-index.js は「出版社ごとに売れている順」で集めるため、
// 旧巻や地味な巻を取りこぼす（例: カグラバチが10〜12巻しか入らない）。
// ここでは巻番号に穴があるシリーズだけを対象に、タイトル検索を
// 打ち切りなしで回して、取れた巻をキャッシュに足し込む。
//
// 環境変数:
//   API_BASE   /api/search を持つURL（ローカル or 本番）※必須
//   DELAY_MS   リクエスト間隔（既定1000ms）
//   MAX_PAGES  1シリーズあたりの最大ページ数（既定15）
//   LIMIT      処理するシリーズ数の上限（分割実行用。既定は無制限）
//   OFFSET     何件目から処理するか（分割実行用。既定0）

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { normalizeSearchKey, seriesBucketPath } = require('../search-normalize.js');

const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
const DELAY_MS = parseInt(process.env.DELAY_MS || '1000', 10);
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '15', 10);
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const OFFSET = parseInt(process.env.OFFSET || '0', 10);

const COVER_BASE = 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/';
const SERIES_DIR = path.join(__dirname, '..', 'data', 'series');

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function getJson(url) {
    const mod = url.startsWith('https:') ? https : http;
    return new Promise((resolve, reject) => {
        const req = mod.get(url, res => {
            let d = '';
            res.on('data', c => { d += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(d)); }
                catch (e) { reject(new Error('JSON parse error')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

// rakuten-adapter.js / build-search-index.js と同じ規則
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

function cleanText(s) {
    return s ? String(s).replace(/�+/g, '').trim() : '';
}

// 巻番号に穴があるか（1から始まっていない／途中が抜けている）
function hasGap(rows) {
    const nums = [];
    rows.forEach(r => {
        if (typeof r[0] === 'number' && r[0] > 0 && nums.indexOf(r[0]) === -1) nums.push(r[0]);
    });
    if (nums.length === 0) return false;   // 巻番号が無いシリーズは対象外
    let min = nums[0];
    let max = nums[0];
    nums.forEach(n => { if (n < min) min = n; if (n > max) max = n; });
    return min > 1 || (max - min + 1 !== nums.length);
}

// タイトル検索を打ち切りなしで回す
async function fetchAllVolumes(seriesTitle, key) {
    const rows = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `${API_BASE}/api/search?keyword=${encodeURIComponent(seriesTitle)}&hits=30&page=${page}`;
        let data;
        try {
            data = await getJson(url);
        } catch (e) {
            break;
        }
        if (data.error) break;
        (data.items || []).forEach(it => {
            const title = cleanText(it.title);
            if (!title) return;
            if (/セット|全巻|ボックス|合本|一括/.test(title)) return;
            if (normalizeSearchKey(extractSeriesName(title)) !== key) return;
            rows.push([
                extractVolumeNumber(title),
                title,
                it.isbn || '',
                it.firstReleaseDate || '',
                coverPath(it.imageUrl),
                it.price || 0,
                cleanText(it.label || it.seriesName),
                cleanText(it.description),
            ]);
        });
        if (page >= (data.pageCount || 1)) break;
        await sleep(DELAY_MS);
    }
    return rows;
}

async function main() {
    if (!API_BASE) {
        console.error('API_BASE が必要です（例: API_BASE=http://localhost:3000）');
        process.exit(1);
    }

    const bucketFiles = fs.readdirSync(SERIES_DIR).filter(f => f.endsWith('.json'));

    // 穴のあるシリーズを洗い出す
    const targets = [];
    const buckets = {};
    bucketFiles.forEach(f => {
        const p = path.join(SERIES_DIR, f);
        const b = JSON.parse(fs.readFileSync(p, 'utf8'));
        buckets[f] = b;
        Object.keys(b).forEach(key => {
            if (hasGap(b[key].v)) targets.push({ file: f, key: key, title: b[key].t });
        });
    });

    const slice = targets.slice(OFFSET, LIMIT ? OFFSET + LIMIT : undefined);
    console.log(`穴のあるシリーズ: ${targets.length}件 / 今回処理: ${slice.length}件`);

    let filled = 0;
    let added = 0;
    const touched = new Set();

    for (let i = 0; i < slice.length; i++) {
        const t = slice[i];
        const entry = buckets[t.file][t.key];
        const before = entry.v.length;

        const rows = await fetchAllVolumes(t.title, t.key);
        if (rows.length === 0) continue;

        // ISBNで重複を除いて足し込む
        const seen = {};
        entry.v.forEach(v => { if (v[2]) seen[v[2]] = true; });
        rows.forEach(r => {
            if (r[2] && seen[r[2]]) return;
            if (r[2]) seen[r[2]] = true;
            entry.v.push(r);
        });

        // 巻数順に並べ直す（番号なしは末尾）
        entry.v.sort((a, b) => {
            if (a[0] !== null && b[0] !== null) return a[0] - b[0];
            if (a[0] === null && b[0] === null) return (a[3] || '').localeCompare(b[3] || '');
            return a[0] === null ? 1 : -1;
        });

        if (entry.v.length > before) {
            filled++;
            added += entry.v.length - before;
            touched.add(t.file);
        }

        if ((i + 1) % 50 === 0) {
            console.log(`  ${i + 1}/${slice.length} … ${filled}作品に${added}巻追加`);
            touched.forEach(f => {
                fs.writeFileSync(path.join(SERIES_DIR, f), JSON.stringify(buckets[f]), 'utf8');
            });
            touched.clear();
        }
        await sleep(DELAY_MS);
    }

    // 残りを書き出し
    touched.forEach(f => {
        fs.writeFileSync(path.join(SERIES_DIR, f), JSON.stringify(buckets[f]), 'utf8');
    });

    console.log(`\n完了: ${filled}作品に合計${added}巻を追加しました`);
}

main().catch(e => {
    console.error('失敗:', e.message);
    process.exit(1);
});
