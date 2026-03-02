const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PAGES_DIR = path.join(DATA_DIR, 'pages');

function fixContent(content) {
  let fixed = content;
  // Multiple U+FFFD patterns - replace with correct characters
  fixed = fixed.replace(/シ\uFFFD{2,4}ルド/g, 'シールド');
  fixed = fixed.replace(/漂\uFFFD{2,6}記/g, '漂流記');
  fixed = fixed.replace(/ストロ\uFFFD{2,6}・エッジ/g, 'ストロボ・エッジ');
  fixed = fixed.replace(/思\uFFFD{2,6}、思われ/g, '思い、思われ');
  fixed = fixed.replace(/カムイ\uFFFD{1,4}/g, 'カムイ');
  fixed = fixed.replace(/ダイヤモ\uFFFD{2,6}ド/g, 'ダイヤモンド');
  // Catch any remaining lone U+FFFD
  fixed = fixed.replace(/\uFFFD+/g, '');
  return fixed;
}

// manga-all.json
const allPath = path.join(DATA_DIR, 'manga-all.json');
let allData = fs.readFileSync(allPath, 'utf8');
allData = fixContent(allData);
fs.writeFileSync(allPath, allData);
console.log('manga-all.json 修正済み');

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
const broken = verify.filter(i => i.title && i.title.includes('\uFFFD'));
console.log('残りの文字化け:', broken.length);

// 修正されたタイトルを確認
const check = ['シールド', 'ストロボ', 'カムイ', 'ダイヤモンド', '漂流記', '思い、思われ'];
check.forEach(keyword => {
  const found = verify.find(i => i.title && i.title.includes(keyword));
  if (found) console.log('OK:', found.title);
});
