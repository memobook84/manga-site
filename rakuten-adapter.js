// 楽天APIレスポンスをサイト内データ形式に変換するアダプター

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

// ジャンルIDをジャンル名に変換
function resolveGenre(genreId) {
  if (!genreId) return '';
  // 複数ジャンルの場合、最初のものを使用
  const firstGenre = genreId.split('/')[0];
  return genreMap[firstGenre] || 'コミック';
}

// APIレスポンスのアイテムをサイト内形式に変換
function adaptItem(item, index) {
  return {
    id: item.isbn || `api-${index}`,
    title: item.title || '',
    author: item.author || '',
    publisher: item.publisher || '',
    label: item.label || item.seriesName || '',
    genre: resolveGenre(item.genre),
    firstReleaseDate: item.firstReleaseDate || '',
    description: item.description || '',
    imageUrl: item.imageUrl || '',
    hasRealCover: item.hasRealCover !== false,
    price: item.price ? `¥${Number(item.price).toLocaleString()}（税込）` : '',
    priceRaw: item.price || 0,
    isbn: item.isbn || '',
    itemUrl: item.itemUrl || '',
    seriesName: item.seriesName || item.label || '',
    // プレースホルダー用のカラー（画像がない場合のフォールバック）
    color: generateColor(item.title || '', index),
  };
}

// タイトルからカラーを生成（フォールバック用）
function generateColor(title, index) {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#F06292', '#66BB6A',
    '#FFA726', '#8D6E63', '#7E57C2', '#29B6F6', '#26A69A', '#D4AF37',
  ];
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash + index) % colors.length];
}

// APIレスポンス全体を変換
function adaptApiResponse(response) {
  return {
    items: (response.items || []).map((item, i) => adaptItem(item, i)),
    totalCount: response.totalCount || 0,
    page: response.page || 1,
    pageCount: response.pageCount || 1,
  };
}

// 画像表示用のHTML要素を生成（実画像 or デザインプレースホルダー）
function createImageElement(item, height = 320) {
  if (item.imageUrl && item.hasRealCover) {
    return `<img src="${item.imageUrl}" alt="${item.title}"
              style="width:100%;height:${height}px;object-fit:contain;background:#f5f3f0;"
              onerror="this.outerHTML=createPlaceholderHtml('${item.title.replace(/'/g, "\\'")}','${item.author.replace(/'/g, "\\'")}','${item.color}',${height})"
              loading="lazy">`;
  }
  return createPlaceholderHtml(item.title, item.author, item.color, height);
}

function createPlaceholderHtml(title, author, color, height) {
  return `<div class="manga-cover-placeholder" style="height:${height}px;background:linear-gradient(145deg, ${color} 0%, ${adjustColor(color, -40)} 100%);">
            <div class="cover-spine"></div>
            <div class="cover-content">
              <div class="cover-title">${title}</div>
              <div class="cover-author">${author}</div>
            </div>
          </div>`;
}

function adjustColor(hex, amount) {
  hex = hex.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.substr(0,2),16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.substr(2,2),16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.substr(4,2),16) + amount));
  return '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('');
}

// 詳細ページ用の大きい画像要素を生成
function createDetailImageElement(item) {
  if (item.imageUrl && item.hasRealCover) {
    return `<img src="${item.imageUrl}" alt="${item.title}"
              style="width:300px;height:420px;object-fit:contain;background:#f5f3f0;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);"
              onerror="this.parentElement.innerHTML='<div class=\\'manga-detail-placeholder\\' style=\\'background-color:${item.color};\\' ><span class=\\'manga-placeholder-text\\'>${item.title}</span></div>'"
              loading="lazy">`;
  }
  return `<div class="manga-detail-placeholder" style="background-color: ${item.color};">
            <span class="manga-placeholder-text">${item.title}</span>
          </div>`;
}

// タイトルからシリーズ名を抽出（巻数・特装版等を除去）
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

// 購入リンクの生成
function getRakutenBuyUrl(item) {
  if (item.itemUrl) return item.itemUrl;
  if (item.isbn) return `https://books.rakuten.co.jp/search?isbn=${item.isbn}`;
  return `https://books.rakuten.co.jp/search?sitem=${encodeURIComponent(item.title)}`;
}

function getAmazonBuyUrl(item) {
  if (item.isbn) return `https://www.amazon.co.jp/dp/${item.isbn}`;
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(item.title)}`;
}

// Google Books APIから高品質カバー画像を非同期取得してアップグレード
const coverCache = {};
async function upgradeCovers() {
  const images = document.querySelectorAll('img[data-isbn]');
  // 5件ずつバッチ処理（レート制限対策）
  const batch = [];
  for (const img of images) {
    const isbn = img.dataset.isbn;
    if (!isbn || coverCache[isbn] === false) continue;
    if (coverCache[isbn]) {
      img.src = coverCache[isbn];
      continue;
    }
    batch.push(img);
  }
  for (let i = 0; i < batch.length; i += 5) {
    const chunk = batch.slice(i, i + 5);
    await Promise.all(chunk.map(async (img) => {
      const isbn = img.dataset.isbn;
      try {
        const resp = await fetch(`/api/cover?isbn=${isbn}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.coverUrl) {
            coverCache[isbn] = data.coverUrl;
            img.src = data.coverUrl;
          } else {
            coverCache[isbn] = false;
          }
        } else {
          coverCache[isbn] = false;
        }
      } catch {
        coverCache[isbn] = false;
      }
    }));
    // バッチ間に200ms待機
    if (i + 5 < batch.length) await new Promise(r => setTimeout(r, 200));
  }
}
