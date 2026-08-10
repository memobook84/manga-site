// data/series/*.json から「別レーベルの重複巻」を取り除く。
//
// fill-series-gaps.js が ISBN違い＝別物として無条件に足していたため、
// 同じ巻番号に文庫版・リミックス版などが並んでいるシリーズがある。
// （例: ジョジョの奇妙な冒険 → 各巻に ジャンプコミックス と 集英社文庫 が2件ずつ）
//
// ここで消すのは「同じ巻番号に主レーベルの巻がちゃんと居る」場合だけ。
// 主レーベルの巻が居ないもの（別版が唯一の巻になっている）は欠番になるので触らない。
// それらは fill-series-gaps.js の再取得側で直す。
//
// 使い方:
//   node scripts/dedupe-series-editions.js          … 変更せず件数だけ表示
//   node scripts/dedupe-series-editions.js --apply  … 実際に書き換える

const fs = require('fs');
const path = require('path');

const SERIES_DIR = path.join(__dirname, '..', 'data', 'series');
const APPLY = process.argv.includes('--apply');

// レーベル名の表記ゆれを吸収する。
// 「ジャンプ・コミックス」と「ジャンプコミックス」を別物と見ないための正規化で、
// 中黒・空白・長音を落とし、全角英数を半角に寄せる
function normLabel(s) {
    return String(s || '')
        .replace(/[\s　・･\-–—ー]/g, '')
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .toLowerCase();
}

// そのシリーズの「本来のレーベル」を決める。
// 最多のレーベルが2件以上あり、かつ2位を上回っている時だけ採用する。
// 拮抗している（1対1など）シリーズは判断材料が足りないので null を返して見送る
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

let seriesTouched = 0;
let rowsRemoved = 0;
let seriesSkipped = 0;
const samples = [];

const files = fs.readdirSync(SERIES_DIR).filter(f => f.endsWith('.json'));

files.forEach(file => {
    const full = path.join(SERIES_DIR, file);
    const bucket = JSON.parse(fs.readFileSync(full, 'utf8'));
    let changed = false;

    Object.keys(bucket).forEach(key => {
        const entry = bucket[key];
        const rows = entry.v || [];
        if (rows.length === 0) return;

        const main = mainLabel(rows);
        if (main === null) { seriesSkipped++; return; }

        // 主レーベルの巻が存在する巻番号を集める
        const covered = {};
        rows.forEach(r => {
            if (r[0] === null || r[0] === undefined) return;
            if (normLabel(r[6]) === main) covered[r[0]] = true;
        });

        const kept = rows.filter(r => {
            if (r[0] === null || r[0] === undefined) return true;   // 巻番号なしは触らない
            if (normLabel(r[6]) === main) return true;              // 主レーベルは残す
            if (!covered[r[0]]) return true;                        // 代わりが居ないなら残す
            return false;                                           // 重複した別版 → 落とす
        });

        const removed = rows.length - kept.length;
        if (removed > 0) {
            if (samples.length < 8) {
                samples.push(`${entry.t}: ${removed}件（主レーベル=${main}）`);
            }
            entry.v = kept;
            rowsRemoved += removed;
            seriesTouched++;
            changed = true;
        }
    });

    if (changed && APPLY) {
        fs.writeFileSync(full, JSON.stringify(bucket), 'utf8');
    }
});

console.log(APPLY ? '=== 適用しました ===' : '=== 確認のみ（--apply で実際に書き換え）===');
console.log(`対象シリーズ: ${seriesTouched}件`);
console.log(`削除した巻  : ${rowsRemoved}件`);
console.log(`判定を見送り: ${seriesSkipped}件（レーベルが拮抗していて主レーベルを決められない）`);
console.log('--- 例 ---');
samples.forEach(s => console.log('  ' + s));
