#!/usr/bin/env node
// data/manual-series.json の作品を、収集バッチの成果物に流し込む。
// 使用方法: node scripts/apply-manual-series.js
//
// なぜ必要か:
//   build-search-index.js は楽天APIの結果だけを見て data/series/*.json と
//   data/search-index.json をまるごと書き直す。楽天のカタログに無い作品
//   （絶版・自主流通など）を data/series/ に直接足しても、次の実行で消える。
//   そこで「手で入れた作品」は manual-series.json に置き、バッチの直後に
//   このスクリプトで上書きし直す。GitHub Actions でも同じ順番で走らせる。

const fs = require('fs');
const path = require('path');
const { normalizeSearchKey, seriesBucketPath } = require('../search-normalize.js');

const ROOT = path.join(__dirname, '..');
const MANUAL_FILE = path.join(ROOT, 'data', 'manual-series.json');
const INDEX_FILE = path.join(ROOT, 'data', 'search-index.json');
const READER_DIR = path.join(ROOT, 'data', 'reader');
const READERS_FILE = path.join(ROOT, 'data', 'readers.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  if (!fs.existsSync(MANUAL_FILE)) {
    console.log('data/manual-series.json が無いので何もしません');
    return;
  }

  const manual = readJson(MANUAL_FILE);
  const list = Array.isArray(manual.series) ? manual.series : [];
  if (!list.length) {
    console.log('登録された作品がありません');
    return;
  }

  let seriesApplied = 0;
  let indexApplied = 0;

  // --- 1. 作品ページ用の巻一覧（data/series/xx.json） ---
  // バケット単位でまとめてから書く（同じファイルを何度も開かないため）
  const byBucket = {};
  for (const s of list) {
    const key = normalizeSearchKey(s.title);
    if (!key) {
      console.warn(`  スキップ: タイトルからキーを作れません（${s.title}）`);
      continue;
    }
    const rel = seriesBucketPath(key);
    (byBucket[rel] = byBucket[rel] || []).push({ key, s });
  }

  for (const [rel, entries] of Object.entries(byBucket)) {
    const abs = path.join(ROOT, rel);
    let bucket = {};
    if (fs.existsSync(abs)) {
      try {
        bucket = readJson(abs);
      } catch (e) {
        console.warn(`  ${rel} を読めなかったので新規作成します: ${e.message}`);
      }
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
    }

    for (const { key, s } of entries) {
      const vols = (s.volumes || []).slice().sort((a, b) => (a.vol || 0) - (b.vol || 0));
      bucket[key] = {
        t: s.title,
        a: s.author || '',
        p: s.publisher || '',
        g: s.genre || '',
        u: new Date().toISOString().slice(0, 10),
        // [巻数, タイトル, ISBN, 発売日, 表紙, 価格, レーベル, あらすじ]
        v: vols.map((v) => [
          v.vol,
          s.title + '（' + v.vol + '）',
          v.isbn || '',
          v.date || '',
          v.cover || '',
          v.price || 0,
          s.label || '',
          v.description || '',
        ]),
      };
      seriesApplied++;
      console.log(`  ${rel} ← ${s.title}（${vols.length}巻）`);
    }

    fs.writeFileSync(abs, JSON.stringify(bucket), 'utf8');
  }

  // --- 2. 検索インデックス（data/search-index.json） ---
  // 同じタイトルの行があれば差し替え、無ければ追加する
  if (fs.existsSync(INDEX_FILE)) {
    const index = readJson(INDEX_FILE);
    const items = Array.isArray(index.items) ? index.items : [];

    for (const s of list) {
      const key = normalizeSearchKey(s.title);
      const vols = (s.volumes || []).slice().sort((a, b) => (a.vol || 0) - (b.vol || 0));
      const first = vols[0] || {};
      const row = [
        s.title,
        s.author || '',
        s.publisher || '',
        vols.length,
        first.cover || '',
        first.isbn || '',
        '',
      ];

      const at = items.findIndex((r) => normalizeSearchKey(r[0] || '') === key);
      if (at >= 0) items[at] = row;
      else items.push(row);
      indexApplied++;
    }

    // 巻数が多い順＝主要作品が先。バッチ側の並びに合わせる
    items.sort((a, b) => (b[3] || 0) - (a[3] || 0) || String(a[0]).localeCompare(String(b[0]), 'ja'));
    index.items = items;
    index.count = items.length;
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index), 'utf8');
  } else {
    console.warn('  data/search-index.json が無いので検索インデックスへの反映は省略');
  }

  // --- 3. ビューアの索引（data/readers.json） ---
  buildReaderIndex();

  console.log(`\n手動登録を反映: 作品ページ${seriesApplied}件 / 検索インデックス${indexApplied}件`);
}

// data/reader/<slug>-<巻>.json を集めて「どの作品のどの巻が読めるか」を作る。
// 作品ページ（detail.js）はこれを見てビューアへの導線を出す。
// タイトルの正規化はここ（Node側）でやる。表示側と同じ normalizeSearchKey を通すので、
// 「ブラック・ジャックによろしく」のような表記ゆれでも一致する。
function buildReaderIndex() {
  if (!fs.existsSync(READER_DIR)) {
    console.log('  data/reader/ が無いのでビューア索引は作りません');
    return;
  }

  const files = fs.readdirSync(READER_DIR).filter((f) => f.endsWith('.json'));
  const bySlug = new Map();

  for (const f of files) {
    let meta;
    try {
      meta = readJson(path.join(READER_DIR, f));
    } catch (e) {
      console.warn(`  ${f} を読めませんでした: ${e.message}`);
      continue;
    }
    if (!meta.slug || !meta.series) continue;

    let rec = bySlug.get(meta.slug);
    if (!rec) {
      rec = { slug: meta.slug, series: meta.series, volumes: [] };
      bySlug.set(meta.slug, rec);
    }
    if (!rec.volumes.includes(meta.volume)) rec.volumes.push(meta.volume);
  }

  const out = {};
  for (const rec of bySlug.values()) {
    rec.volumes.sort((a, b) => a - b);
    out[normalizeSearchKey(rec.series)] = {
      slug: rec.slug,
      volumes: rec.volumes,
    };
  }

  fs.writeFileSync(READERS_FILE, JSON.stringify(out), 'utf8');
  const total = Object.values(out).reduce((n, r) => n + r.volumes.length, 0);
  console.log(`  data/readers.json ← ${Object.keys(out).length}作品 / ${total}巻`);
}

main();
