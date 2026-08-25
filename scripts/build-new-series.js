// 新しく始まった作品（＝1巻が最近出たシリーズ）を data/new-series.json に書き出す。
// ホーム（home.html）の「新着作品」列がこれを読む。
//
// 自分では収集しない。build-search-index.js が集めた巻データを使い回すだけなので、
// このスクリプトは楽天APIを1回も叩かない。呼ばれ方は2通りある:
//
//   1. build-search-index.js の main() から writeNewSeries() を直接呼ぶ（CIはこちら）
//      メモリ上の全シリーズを渡せるので、まだ1巻しか出ていない新連載も拾える
//
//   2. node scripts/build-new-series.js        （ローカル確認・手動生成用）
//      data/series/*.json から組み立てる。シャードは2巻以上のシリーズしか
//      焼かれない（build-search-index.js の writeSeriesFiles 参照）ので、
//      1巻ものが丸ごと落ちる。件数が少なければまずこれを疑う
//
// 「新刊（new-releases.html）」との違い:
//   新刊  = 最近出た “巻”。2巻でも100巻でも載る
//   新着作品 = 最近始まった “作品”。1巻の発売日で並べる

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(DATA_DIR, 'new-series.json');
const SERIES_DIR = path.join(DATA_DIR, 'series');

// 楽天の画像URLの共通接頭辞。search-index.json と同じく切り落として持つ
const COVER_BASE = 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/';

// ホームのカタログと同じ掲載基準にそろえる（database.js の ALLOWED_PUBLISHERS）
const ALLOWED_PUBLISHERS = ['集英社', '小学館', '講談社'];

const LIMIT = parseInt(process.env.NEW_SERIES_LIMIT || '24', 10);

// 再刊・別装版を「新作」として出さないための除外パターン。
// 愛蔵版や分冊版は1巻の発売日が最近になるので、弾かないと
// 何十年も前の作品が新着の先頭に並んでしまう
const REISSUE_RE = new RegExp([
    '愛蔵版', '新装版', '完全版', '文庫版', '新装', '復刻', '決定版',
    '特装版', '合本版', '分冊版', '総集編', '傑作選', 'セレクション',
    '定本', '全集', '画集', 'ファンブック', '公式ガイド', 'アンソロジー',
    'カラー版', 'オールカラー', '廉価版', '永久保存版', 'コンビニ',
].join('|'));

// "2022年10月28日頃" / "2026年3月上旬" → "20221028"。
// 日が無いものは月初として扱う（並べ替えの粒度としては十分）
function dateKey(str) {
    const m = (str || '').match(/(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
    if (!m) return '';
    return m[1] + String(m[2]).padStart(2, '0') + String(m[3] || '01').padStart(2, '0');
}

function todayKey() {
    const n = new Date();
    return String(n.getFullYear()) +
        String(n.getMonth() + 1).padStart(2, '0') +
        String(n.getDate()).padStart(2, '0');
}

// CLAUDE.md の hasRealCover 判定と同じ規則（noimage / no_image / 0000）
function hasRealCover(cover) {
    if (!cover) return false;
    return !/noimage|no_image/i.test(cover) && !/(^|\/)0000\//.test(cover);
}

// 重複排除用のゆるいキー。表記ゆれまでは吸収しない
function dedupeKey(title) {
    return (title || '').replace(/[\s　・]/g, '').toLowerCase();
}

// records の各要素は { title, author, publisher, genre, cover, isbn, volumes }。
// volumes は build-search-index.js が作る配列
//   [巻数, タイトル, ISBN, 発売日, 表紙パス, 価格, レーベル, あらすじ]
function pickNewSeries(records, opts) {
    const limit = (opts && opts.limit) || LIMIT;
    const today = (opts && opts.today) || todayKey();
    const rows = [];
    const seen = new Set();

    (records || []).forEach(rec => {
        const title = (rec.title || '').trim();
        if (!title) return;
        if (ALLOWED_PUBLISHERS.indexOf(rec.publisher) === -1) return;
        if (REISSUE_RE.test(title)) return;

        const vols = rec.volumes || [];
        if (!vols.length) return;

        // 「巻番号が1の巻」ではなく発売日の最小値を1巻の発売日とみなす。
        // 巻番号が取れない巻（番外編・上下巻など）があるため
        let first = '';
        vols.forEach(v => {
            const k = dateKey(v[3]);
            if (k && (!first || k < first)) first = k;
        });
        if (!first) return;
        // 1巻がまだ発売前のものは「新刊（発売予定）」の担当なので出さない
        if (first > today) return;

        const key = dedupeKey(title);
        if (seen.has(key)) return;
        seen.add(key);

        // 表紙は「実カバーがある一番古い巻」＝なるべく1巻のもの。
        // 無ければシリーズ代表の表紙、それも無ければ諦める
        let cover = '';
        let isbn = '';
        let coverDate = '';
        vols.forEach(v => {
            const cp = v[4] || '';
            if (!hasRealCover(cp)) return;
            const k = dateKey(v[3]);
            if (!cover || (k && (!coverDate || k < coverDate))) {
                cover = cp;
                isbn = v[2] || '';
                coverDate = k;
            }
        });
        if (!cover && hasRealCover(rec.cover)) {
            cover = rec.cover;
            isbn = rec.isbn || '';
        }
        if (!cover) return;

        rows.push({
            title: title,
            author: rec.author || '',
            publisher: rec.publisher || '',
            cover: cover,
            isbn: isbn,
            firstDate: `${first.slice(0, 4)}-${first.slice(4, 6)}-${first.slice(6, 8)}`,
            sortKey: first,
            volumeCount: vols.length,
        });
    });

    rows.sort((a, b) =>
        b.sortKey.localeCompare(a.sortKey) || a.title.localeCompare(b.title, 'ja')
    );
    return rows.slice(0, limit);
}

function writeNewSeries(records, opts) {
    const rows = pickNewSeries(records, opts);
    const out = {
        generatedAt: new Date().toISOString(),
        count: rows.length,
        coverBase: COVER_BASE,
        fields: ['title', 'author', 'publisher', 'cover', 'isbn', 'firstDate', 'volumeCount'],
        items: rows.map(r => [
            r.title, r.author, r.publisher, r.cover, r.isbn, r.firstDate, r.volumeCount,
        ]),
    };

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(out), 'utf8');
    return { count: rows.length, kb: Math.round(fs.statSync(OUT_FILE).size / 1024) };
}

// 手動実行用: data/series/*.json から records を組み立てる
function readShards() {
    if (!fs.existsSync(SERIES_DIR)) return [];
    const out = [];
    fs.readdirSync(SERIES_DIR)
        .filter(f => f.endsWith('.json'))
        .forEach(f => {
            let obj;
            try {
                obj = JSON.parse(fs.readFileSync(path.join(SERIES_DIR, f), 'utf8'));
            } catch (e) {
                console.warn(`読み飛ばし: data/series/${f} (${e.message})`);
                return;
            }
            Object.keys(obj).forEach(k => {
                const s = obj[k];
                out.push({
                    title: s.t || '',
                    author: s.a || '',
                    publisher: s.p || '',
                    genre: s.g || '',
                    cover: '',
                    isbn: '',
                    volumes: s.v || [],
                });
            });
        });
    return out;
}

module.exports = { pickNewSeries, writeNewSeries, COVER_BASE };

if (require.main === module) {
    const records = readShards();
    if (!records.length) {
        console.error('data/series/*.json が見つかりません。先に build-search-index.js を走らせてください');
        process.exit(1);
    }
    const { count, kb } = writeNewSeries(records);
    console.log(`新着作品: ${count}件 → data/new-series.json (${kb}KB)`);
    console.log('※ シャード経由なので1巻しか出ていない新連載は含まれません');
}
