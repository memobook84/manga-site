#!/usr/bin/env node
// 「別レーベルの版が正巻の座に収まっている」巻を、APIから取り直した正しい版に差し替える。
//
//   API_BASE=http://localhost:3001 node scripts/fix-wrong-editions.js
//
// 背景:
// fill-series-gaps.js が ISBN違い＝別物として無条件に足していたため、
// 本来の巻が取れなかったシリーズで別版が代わりに入っている。
// （例: ONE PIECE の2巻が「集英社ジャンプリミックス」版になっている）
//
// dedupe-series-editions.js は「同じ巻番号に正しい版も居る」場合の重複を消すだけなので、
// 正しい版が手元に無いこちらのケースは、APIから取り直すしかない。
//
// 方針:
//   - 見つかった時だけ差し替える。見つからなければ元のまま残す（欠番を作らない）
//   - 主レーベルを断定できないシリーズ（レーベルが拮抗）は最初から対象外
//
// 環境変数:
//   API_BASE   /api/search を持つURL ※必須
//   DELAY_MS   リクエスト間隔（既定1000ms）
//   MAX_PAGES  1シリーズあたりの最大ページ数（既定15）
//   LIMIT      処理するシリーズ数の上限（分割実行用）
//   OFFSET     何件目から処理するか（分割実行用）
//   DRY_RUN    1 なら書き換えず件数だけ出す

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { normalizeSearchKey } = require('../search-normalize.js');

const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
const DELAY_MS = parseInt(process.env.DELAY_MS || '1000', 10);
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '15', 10);
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const OFFSET = parseInt(process.env.OFFSET || '0', 10);
const DRY_RUN = process.env.DRY_RUN === '1';
// 動作確認用。指定するとそのキーのシリーズだけを処理する（例: ONLY=onepiece）
const ONLY = process.env.ONLY || '';

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

// --- fill-series-gaps.js と同じ規則（重複しているが、片方を直しても他方が壊れないよう独立させている）

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

function normLabel(s) {
    return String(s || '')
        .replace(/[\s　・･\-–—ー]/g, '')
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .toLowerCase();
}

function mainLabel(rows) {
    const count = {};
    rows.forEach(r => {
        const l = normLabel(r[6]);
        if (!l) return;
        count[l] = (count[l] || 0) + 1;
    });
    const ranked = Object.keys(count).sort((a, b) => count[b] - count[a]);
    if (ranked.length === 0) return null;
    if (count[ranked[0]] < 2) return null;
    if (ranked.length > 1 && count[ranked[0]] === count[ranked[1]]) return null;
    return ranked[0];
}

// シリーズ名で検索し、主レーベルの巻だけを 巻番号→行 で返す
async function fetchCorrectVolumes(seriesTitle, key, main) {
    const found = {};
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
            if (normLabel(it.label || it.seriesName) !== main) return;
            const num = extractVolumeNumber(title);
            if (num === null) return;
            if (found[num]) return;   // 同じ巻番号は先に見つかったものを使う
            found[num] = [
                num,
                title,
                it.isbn || '',
                it.firstReleaseDate || '',
                coverPath(it.imageUrl),
                it.price || 0,
                cleanText(it.label || it.seriesName),
                cleanText(it.description),
            ];
        });
        if (page >= (data.pageCount || 1)) break;
        await sleep(DELAY_MS);
    }
    return found;
}

async function main() {
    if (!API_BASE) {
        console.error('API_BASE が必要です（例: API_BASE=http://localhost:3001）');
        process.exit(1);
    }

    const bucketFiles = fs.readdirSync(SERIES_DIR).filter(f => f.endsWith('.json'));
    const buckets = {};
    const targets = [];

    // 「主レーベルと違う版が、その巻番号の唯一の行になっている」シリーズを洗い出す
    bucketFiles.forEach(f => {
        const b = JSON.parse(fs.readFileSync(path.join(SERIES_DIR, f), 'utf8'));
        buckets[f] = b;
        Object.keys(b).forEach(key => {
            const rows = b[key].v || [];
            if (!rows.length) return;
            const main = mainLabel(rows);
            if (main === null) return;

            const covered = {};
            rows.forEach(r => {
                if (r[0] === null || r[0] === undefined) return;
                if (normLabel(r[6]) === main) covered[r[0]] = true;
            });

            const badNums = [];
            rows.forEach(r => {
                if (r[0] === null || r[0] === undefined) return;
                if (normLabel(r[6]) === main) return;
                if (covered[r[0]]) return;   // 正しい版が既にある＝dedupe側の担当
                if (badNums.indexOf(r[0]) === -1) badNums.push(r[0]);
            });

            if (badNums.length) {
                targets.push({ file: f, key: key, title: b[key].t, main: main, nums: badNums });
            }
        });
    });

    const filtered = ONLY ? targets.filter(t => t.key === ONLY) : targets;
    const slice = filtered.slice(OFFSET, LIMIT ? OFFSET + LIMIT : undefined);
    const totalBad = slice.reduce((s, t) => s + t.nums.length, 0);
    console.log(`対象シリーズ: ${filtered.length}件 / 今回処理: ${slice.length}件（差し替え候補 ${totalBad}巻）`);
    if (DRY_RUN) {
        slice.slice(0, 10).forEach(t => console.log(`  ${t.title} → ${t.nums.join(',')}巻（主=${t.main}）`));
        console.log('DRY_RUN のため終了');
        return;
    }

    let replaced = 0;
    let missed = 0;
    const touched = new Set();

    for (let i = 0; i < slice.length; i++) {
        const t = slice[i];
        const entry = buckets[t.file][t.key];

        let correct;
        try {
            correct = await fetchCorrectVolumes(t.title, t.key, t.main);
        } catch (e) {
            console.log(`  取得失敗: ${t.title}`);
            await sleep(DELAY_MS);
            continue;
        }

        t.nums.forEach(num => {
            const good = correct[num];
            if (!good) { missed++; return; }   // 見つからない → 元のまま残す
            const idx = entry.v.findIndex(r => r[0] === num && normLabel(r[6]) !== t.main);
            if (idx === -1) return;
            entry.v[idx] = good;
            replaced++;
            touched.add(t.file);
        });

        if ((i + 1) % 25 === 0) {
            console.log(`  ${i + 1}/${slice.length} … ${replaced}巻を差し替え / ${missed}巻は見つからず`);
            touched.forEach(f => {
                fs.writeFileSync(path.join(SERIES_DIR, f), JSON.stringify(buckets[f]), 'utf8');
            });
            touched.clear();
        }
        await sleep(DELAY_MS);
    }

    touched.forEach(f => {
        fs.writeFileSync(path.join(SERIES_DIR, f), JSON.stringify(buckets[f]), 'utf8');
    });

    console.log(`=== 完了: ${replaced}巻を差し替え / ${missed}巻は正しい版が見つからず元のまま ===`);
}

main();
