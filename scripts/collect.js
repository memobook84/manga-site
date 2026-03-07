#!/usr/bin/env node
// 楽天APIから漫画データを収集してJSONファイルに保存するバッチスクリプト
// 使用方法: node scripts/collect.js

const https = require('https');
const fs = require('fs');
const path = require('path');

// --- 設定 ---
const RAKUTEN_BASE = 'https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404';
const APP_ID = process.env.RAKUTEN_APP_ID || '';
const REFERER = 'https://manga-site-three.vercel.app';

const GENRES = ['001001001', '001001002', '001001003']; // 少年, 少女, 青年
const GENRE_NAMES = { '001001001': '少年漫画', '001001002': '少女漫画', '001001003': '青年漫画' };
const PUBLISHERS = ['集英社', '小学館', '講談社'];
const MAX_PAGES_PER_GENRE = 100; // 各ジャンル最大100ページ（3000件）
const HITS_PER_PAGE = 30;
const DELAY_MS = 1200; // リクエスト間のディレイ（レートリミット対策）
const ITEMS_PER_PAGE = 60; // 分割JSON1ページあたりのタイトル数
const ACCESS_KEY = process.env.RAKUTEN_APP_ID || '';

const DATA_DIR = path.join(__dirname, '..', 'data');
const PAGES_DIR = path.join(DATA_DIR, 'pages');

// --- ユーティリティ ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rakutenFetch(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
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
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

// api/books.jsのmapItem()と同等
function resolveImageUrl(item) {
  const raw = item.largeImageUrl || item.mediumImageUrl || '';
  if (!raw) return { imageUrl: '', hasRealCover: false };
  const url = raw.replace('http://', 'https://');
  const sized = url.includes('?_ex=') ? url.replace(/\?_ex=\d+x\d+/, '?_ex=800x800') : url + '?_ex=800x800';
  const isPlaceholder =
    url.includes('noimage') ||
    url.includes('no_image') ||
    url.includes('/0000/') ||
    !raw;
  return { imageUrl: sized, hasRealCover: !isPlaceholder };
}

function mapItem(item) {
  const { imageUrl, hasRealCover } = resolveImageUrl(item);
  return {
    title: item.title || '',
    author: item.author || '',
    publisher: item.publisherName || '',
    label: item.seriesName || '',
    genre: item.booksGenreId || '',
    firstReleaseDate: item.salesDate || '',
    description: item.itemCaption || '',
    imageUrl,
    hasRealCover,
    price: item.itemPrice || 0,
    isbn: item.isbn || '',
    itemUrl: item.itemUrl || '',
    seriesName: item.seriesName || '',
  };
}

// rakuten-adapter.jsのextractSeriesName()と同等
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
  name = name.trim();
  return name;
}

// ジャンルIDからジャンル名へのマッピング
const genreMap = {
  '001001001': '少年漫画',
  '001001002': '少女漫画',
  '001001003': '青年漫画',
  '001001004': 'レディースコミック',
  '001001005': 'BL（ボーイズラブ）',
  '001001006': 'TL（ティーンズラブ）',
  '001001007': '4コマ',
  '001001008': '学習まんが',
  '001001009': 'その他',
};

function resolveGenre(genreId) {
  if (!genreId) return '';
  const firstGenre = genreId.split('/')[0];
  // 完全一致を試みた後、前方一致で親ジャンルを検索
  if (genreMap[firstGenre]) return genreMap[firstGenre];
  for (const [key, name] of Object.entries(genreMap)) {
    if (firstGenre.startsWith(key)) return name;
  }
  return 'コミック';
}

// --- データ収集 ---
async function fetchGenre(genreId) {
  const items = [];
  let consecutiveErrors = 0;

  for (let page = 1; page <= MAX_PAGES_PER_GENRE; page++) {
    const params = new URLSearchParams({
      applicationId: APP_ID,
      formatVersion: '2',
      booksGenreId: genreId,
      hits: String(HITS_PER_PAGE),
      page: String(page),
      sort: 'sales',
    });
    if (ACCESS_KEY) params.set('accessKey', ACCESS_KEY);

    try {
      process.stdout.write(`  ジャンル ${GENRE_NAMES[genreId]} ページ ${page}/${MAX_PAGES_PER_GENRE}...`);
      const data = await rakutenFetch(`${RAKUTEN_BASE}?${params}`);

      if (data.errors) {
        console.log(` エラー: ${JSON.stringify(data.errors)}`);
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          console.log(`  3回連続エラー、このジャンルをスキップ`);
          break;
        }
        await sleep(DELAY_MS * 2);
        continue;
      }

      consecutiveErrors = 0;
      const pageItems = (data.Items || []).map(mapItem);

      // 対象出版社のみフィルタ
      const filtered = pageItems.filter(item =>
        PUBLISHERS.some(pub => (item.publisher || '').includes(pub))
      );

      items.push(...filtered);
      console.log(` ${filtered.length}件 (累計: ${items.length}件)`);

      // 最終ページに達したら終了
      const pageCount = data.pageCount || 1;
      if (page >= pageCount) {
        console.log(`  最終ページ到達 (${pageCount}ページ)`);
        break;
      }

      await sleep(DELAY_MS);
    } catch (err) {
      console.log(` 失敗: ${err.message}`);
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        console.log(`  3回連続エラー、このジャンルをスキップ`);
        break;
      }
      await sleep(DELAY_MS * 3);
    }
  }

  return items;
}

// --- シリーズ集約 ---
function groupBySeries(items) {
  // 特装版・限定版・セット等を除外
  items = items.filter(item => {
    const t = item.title || '';
    if (/特装版|限定版|特別版|豪華版|ペーパークラフト付|描き下ろし|同梱版|セット|BOX/.test(t)) return false;
    if (/ドラえもん/.test(t)) return false;
    return true;
  });

  const seriesMap = new Map();

  items.forEach(item => {
    const seriesKey = extractSeriesName(item.title);
    if (!seriesKey) return;

    if (!seriesMap.has(seriesKey)) {
      seriesMap.set(seriesKey, {
        seriesName: seriesKey,
        author: item.author,
        publisher: item.publisher,
        genre: item.genre,
        volumes: [],
      });
    }
    seriesMap.get(seriesKey).volumes.push(item);
  });

  // 各シリーズから代表アイテムを選択
  const result = [];
  seriesMap.forEach(series => {
    // 発売日で降順ソート
    const sorted = [...series.volumes].sort((a, b) => {
      const dateA = a.firstReleaseDate || '';
      const dateB = b.firstReleaseDate || '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      const numA = parseInt((a.title || '').match(/\d+/)?.[0]) || 0;
      const numB = parseInt((b.title || '').match(/\d+/)?.[0]) || 0;
      return numB - numA;
    });

    // 最新2巻を除外
    const skipCount = Math.min(2, Math.max(0, sorted.length - 1));
    const nonLatest = sorted.length > skipCount ? sorted.slice(skipCount) : sorted;
    const withCover = nonLatest.filter(v => v.hasRealCover);
    const allWithCover = sorted.filter(v => v.hasRealCover);
    const pool = withCover.length > 0 ? withCover :
                 allWithCover.length > 0 ? allWithCover : nonLatest;
    const representative = pool[Math.floor(Math.random() * pool.length)];

    // カバーあり候補を最大10件保存（フロント側でランダム選択用）
    const candidates = pool.slice(0, 10).map(v => ({
      imageUrl: v.imageUrl,
      isbn: v.isbn,
      hasRealCover: v.hasRealCover,
    }));

    result.push({
      title: series.seriesName,
      displayTitle: series.seriesName,
      author: series.author,
      publisher: series.publisher,
      genre: resolveGenre(series.genre),
      genreId: series.genre,
      imageUrl: representative.imageUrl,
      hasRealCover: representative.hasRealCover,
      isbn: representative.isbn,
      itemUrl: representative.itemUrl,
      price: representative.price,
      firstReleaseDate: representative.firstReleaseDate,
      label: representative.label,
      seriesName: representative.seriesName,
      volumeCount: series.volumes.length,
      coverCandidates: candidates,
    });
  });

  return result;
}

// --- メイン処理 ---
async function main() {
  if (!ACCESS_KEY) {
    console.error('エラー: 環境変数 RAKUTEN_APP_ID が設定されていません。');
    console.error('使用方法: RAKUTEN_APP_ID=xxxxx node scripts/collect.js');
    process.exit(1);
  }

  console.log('=== 漫画データ収集開始 ===');
  console.log(`対象出版社: ${PUBLISHERS.join(', ')}`);
  console.log(`対象ジャンル: ${GENRES.map(g => GENRE_NAMES[g]).join(', ')}`);
  console.log();

  // 全ジャンルからデータ収集
  let allItems = [];
  for (const genre of GENRES) {
    console.log(`[${GENRE_NAMES[genre]}] 収集開始...`);
    const items = await fetchGenre(genre);
    console.log(`[${GENRE_NAMES[genre]}] 完了: ${items.length}件\n`);
    allItems = allItems.concat(items);
  }

  console.log(`\n合計取得アイテム数: ${allItems.length}`);

  // シリーズ単位に集約
  const series = groupBySeries(allItems);
  console.log(`シリーズ数（重複除外後）: ${series.length}`);

  // 出版社別の内訳
  for (const pub of PUBLISHERS) {
    const count = series.filter(s => (s.publisher || '').includes(pub)).length;
    console.log(`  ${pub}: ${count}タイトル`);
  }

  // ジャンル別の内訳
  for (const genre of GENRES) {
    const genreName = GENRE_NAMES[genre];
    const count = series.filter(s => s.genre === genreName).length;
    console.log(`  ${genreName}: ${count}タイトル`);
  }

  // ディレクトリ確認
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PAGES_DIR)) fs.mkdirSync(PAGES_DIR, { recursive: true });

  // manga-all.json 出力
  const allPath = path.join(DATA_DIR, 'manga-all.json');
  fs.writeFileSync(allPath, JSON.stringify(series, null, 0));
  const allSize = (fs.statSync(allPath).size / 1024 / 1024).toFixed(2);
  console.log(`\n${allPath} に出力 (${allSize} MB, ${series.length}タイトル)`);

  // ページ別分割JSON出力
  // 既存のページファイルを削除
  const existingPages = fs.readdirSync(PAGES_DIR).filter(f => f.startsWith('page-'));
  existingPages.forEach(f => fs.unlinkSync(path.join(PAGES_DIR, f)));

  const totalPageCount = Math.ceil(series.length / ITEMS_PER_PAGE);
  for (let i = 0; i < totalPageCount; i++) {
    const pageItems = series.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE);
    const pagePath = path.join(PAGES_DIR, `page-${i + 1}.json`);
    fs.writeFileSync(pagePath, JSON.stringify({
      items: pageItems,
      page: i + 1,
      totalPages: totalPageCount,
      totalCount: series.length,
      itemsPerPage: ITEMS_PER_PAGE,
    }, null, 0));
  }
  console.log(`${PAGES_DIR} に ${totalPageCount} ページ分のJSONを出力`);

  // メタ情報
  const metaPath = path.join(DATA_DIR, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalSeries: series.length,
    totalPages: totalPageCount,
    itemsPerPage: ITEMS_PER_PAGE,
    publishers: PUBLISHERS,
    genres: GENRES.map(g => ({ id: g, name: GENRE_NAMES[g] })),
  }, null, 2));
  console.log(`${metaPath} にメタ情報を出力`);

  console.log('\n=== 収集完了 ===');
}

main().catch(err => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
