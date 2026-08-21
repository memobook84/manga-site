#!/usr/bin/env node
// ビューアのページ画像をどこから配信するかを切り替える。
//
// 使用方法:
//   node scripts/reader-basepath.js                      … 現在の設定を表示するだけ
//   node scripts/reader-basepath.js https://img.example.com/
//                                                        … 外部ストレージ（R2など）に向ける
//   node scripts/reader-basepath.js --local              … サイト内の /manga/ に戻す
//
// なぜこれで済むか:
//   reader.js がページ画像のURLを組み立てるのは pageUrl() の1箇所だけで、
//   `basePath + ファイル名` という形になっている。したがって
//   data/reader/*.json の basePath を差し替えるだけで配信元を移せる。
//
// 注意:
//   manga/ は .gitignore と .vercelignore の両方で除外してある。
//   外部に上げないまま --local に戻すと、本番ではページ画像が404になる。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const READER_DIR = path.join(ROOT, 'data', 'reader');

function localPath(slug, volume) {
  return '/manga/' + slug + '/vol-' + String(volume).padStart(2, '0') + '/';
}

// 外部ホスト側は manga/ の「中身」を配信ルートに置く前提。
// Cloudflare Pages に manga フォルダを上げると、その中身がルートになるので
// URLは https://xxx.pages.dev/<slug>/vol-NN/... となり /manga/ は付かない。
function remotePath(origin, slug, volume) {
  // 末尾のスラッシュを整えてから組み立てる（二重スラッシュを避ける）
  return origin.replace(/\/+$/, '') + '/' + slug + '/vol-' + String(volume).padStart(2, '0') + '/';
}

function main() {
  if (!fs.existsSync(READER_DIR)) {
    console.log('data/reader/ がありません');
    return;
  }

  const arg = process.argv[2];
  const files = fs.readdirSync(READER_DIR).filter((f) => f.endsWith('.json'));

  if (!files.length) {
    console.log('data/reader/ に巻がありません');
    return;
  }

  // 引数なし → 現状を出すだけ
  if (!arg) {
    console.log('現在の配信元:\n');
    files.sort().forEach((f) => {
      const meta = JSON.parse(fs.readFileSync(path.join(READER_DIR, f), 'utf8'));
      console.log('  ' + f.padEnd(34) + meta.basePath);
    });
    console.log('\n切り替えるには:');
    console.log('  node scripts/reader-basepath.js https://img.example.com/   （外部ストレージへ）');
    console.log('  node scripts/reader-basepath.js --local                    （サイト内へ戻す）');
    return;
  }

  const toLocal = arg === '--local';
  if (!toLocal && !/^https:\/\//.test(arg)) {
    console.error('https:// で始まるURLか --local を指定してください');
    process.exit(1);
  }

  let changed = 0;
  files.sort().forEach((f) => {
    const abs = path.join(READER_DIR, f);
    const meta = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const next = toLocal
      ? localPath(meta.slug, meta.volume)
      : remotePath(arg, meta.slug, meta.volume);

    if (meta.basePath === next) {
      console.log('  ' + f.padEnd(34) + '変更なし');
      return;
    }
    meta.basePath = next;
    fs.writeFileSync(abs, JSON.stringify(meta), 'utf8');
    console.log('  ' + f.padEnd(34) + next);
    changed++;
  });

  console.log('\n' + changed + '件を書き換えました');
  if (!toLocal) {
    console.log('※ 画像を実際にアップロードしてから、ブラウザで1巻開いて確認すること');
  } else {
    console.log('※ manga/ はデプロイに含まれないので、この状態で本番に出すと画像が404になる');
  }
}

main();
