const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PAGES_DIR = path.join(DATA_DIR, 'pages');

const replacements = [
  ['ソード・シ\uFFFDルド', 'ソード・シールド'],
  ['漂\uFFFD\uFFFD記', '漂流記'],
  ['ストロ\uFFFD・エッジ', 'ストロボ・エッジ'],
  ['思\uFFFD、思われ', '思い、思われ'],
  ['ゴールデンカム\uFFFD', 'ゴールデンカムイ'],
  ['ダイヤモ\uFFFDド', 'ダイヤモンド'],
];

function fixContent(content) {
  let fixed = content;
  for (const [broken, correct] of replacements) {
    while (fixed.includes(broken)) {
      fixed = fixed.split(broken).join(correct);
    }
  }
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

// 残りの確認
const verify = JSON.parse(fs.readFileSync(allPath, 'utf8'));
const broken = verify.filter(i => i.title && i.title.includes('\uFFFD'));
console.log('残りの文字化け:', broken.length);
broken.forEach(b => console.log(' -', b.title));
