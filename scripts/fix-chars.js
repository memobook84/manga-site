const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PAGES_DIR = path.join(DATA_DIR, 'pages');

// U+FFFD U+FFFD を正しい文字に置換するマップ
const fixes = [
  ['\uFFFD\uFFFD\u30FC\u30ED\u30FC\u30A2\u30AB\u30C7\u30DF\u30A2', 'ヒーローアカデミア'],
];

function fixContent(content) {
  let fixed = content;
  // まず全てのU+FFFDペアを探す
  fixed = fixed.replace(/僕の\uFFFD\uFFFD/g, '僕のヒ');
  return fixed;
}

// manga-all.json
const allPath = path.join(DATA_DIR, 'manga-all.json');
let allData = fs.readFileSync(allPath, 'utf8');
const hadIssue = allData.includes('\uFFFD');
allData = fixContent(allData);
fs.writeFileSync(allPath, allData);
console.log('manga-all.json:', hadIssue ? '修正済み' : '問題なし');

// pages/*.json
const files = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.json'));
files.forEach(f => {
  const filePath = path.join(PAGES_DIR, f);
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('\uFFFD')) {
    content = fixContent(content);
    fs.writeFileSync(filePath, content);
    console.log(f, '修正済み');
  }
});

// 確認
const verify = JSON.parse(fs.readFileSync(allPath, 'utf8'));
const hero = verify.find(item => item.title && item.title.includes('アカデミア'));
if (hero) console.log('確認:', hero.title);
