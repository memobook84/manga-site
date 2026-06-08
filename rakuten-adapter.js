// 楽天APIレスポンスをサイト内データ形式に変換するアダプター

// APIレスポンスのlocalStorageキャッシュ（7日間有効）
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

const CACHE_VERSION = 'v2';
async function cachedFetch(url) {
    const key = `api_cache_${CACHE_VERSION}_` + url;
    // 旧バージョンキャッシュの一括削除（初回のみ）
    if (!sessionStorage.getItem('cache_purged_' + CACHE_VERSION)) {
        try {
            Object.keys(localStorage).forEach(k => {
                if (k.startsWith('api_cache_') && !k.startsWith(`api_cache_${CACHE_VERSION}_`)) {
                    localStorage.removeItem(k);
                }
            });
            sessionStorage.setItem('cache_purged_' + CACHE_VERSION, '1');
        } catch(e) {}
    }
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const { data, ts } = JSON.parse(cached);
            if (Date.now() - ts < CACHE_TTL) return data;
            localStorage.removeItem(key);
        }
    } catch(e) {}
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    try {
        localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch(e) {
        // localStorageが満杯の場合は古いキャッシュを削除して再試行
        clearOldCache();
        try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch(e2) {}
    }
    return data;
}

function clearOldCache() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(`api_cache_${CACHE_VERSION}_`));
    keys.sort((a, b) => {
        try { return JSON.parse(localStorage.getItem(a)).ts - JSON.parse(localStorage.getItem(b)).ts; } catch(e) { return 0; }
    });
    keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
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

// ジャンルIDをジャンル名に変換
function resolveGenre(genreId) {
  if (!genreId) return '';
  // 複数ジャンルの場合、最初のものを使用
  const firstGenre = genreId.split('/')[0];
  return genreMap[firstGenre] || 'コミック';
}

// APIレスポンスのアイテムをサイト内形式に変換
function cleanText(str) {
  return str ? str.replace(/\uFFFD+/g, '') : '';
}

function adaptItem(item, index) {
  return {
    id: item.isbn || `api-${index}`,
    title: cleanText(item.title),
    author: cleanText(item.author),
    publisher: cleanText(item.publisher),
    label: cleanText(item.label || item.seriesName),
    genre: resolveGenre(item.genre),
    firstReleaseDate: item.firstReleaseDate || '',
    description: cleanText(item.description),
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

// 表示高さから楽天 _ex サイズを決定（retina対応で2倍、刻みを固定）
function pickRakutenSize(height) {
  const target = Math.round(height * 2);
  const steps = [240, 320, 480, 640, 800];
  for (const s of steps) if (target <= s) return s;
  return 800;
}

function withRakutenSize(url, size) {
  if (!url) return url;
  if (!/thumbnail\.image\.rakuten\.co\.jp/.test(url)) return url;
  const base = url.replace(/\?_ex=\d+x\d+/, '');
  return base + (base.includes('?') ? '&' : '?') + `_ex=${size}x${size}`;
}

// グローバルカウンタ（ファーストビュー画像判定用）
let __imgIndex = 0;
function resetImagePriority() { __imgIndex = 0; }

// 画像表示用のHTML要素を生成（常にimg要素を生成し、Google Books APIでフォールバック）
function createImageElement(item, height = 320) {
  const safeTitle = (item.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const safeAuthor = (item.author || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const isbn = item.isbn || '';
  const dataIsbn = isbn ? `data-isbn="${isbn}"` : '';
  const needsUpgrade = (!item.hasRealCover && isbn) ? 'data-needs-upgrade="1"' : '';
  const size = pickRakutenSize(height);
  const sizedUrl = withRakutenSize(item.imageUrl, size);
  // 先頭6枚は eager + 高優先度、それ以降は lazy
  const idx = __imgIndex++;
  const loadAttrs = idx < 6
    ? `loading="eager" fetchpriority="high" decoding="async"`
    : `loading="lazy" decoding="async"`;

  if (item.imageUrl) {
    return `<img src="${sizedUrl}" alt="${item.title}"
              ${dataIsbn} ${needsUpgrade}
              onerror="handleImageError(this,'${safeTitle}','${safeAuthor}','${item.color}',${height})"
              ${loadAttrs}>`;
  }
  if (isbn) {
    return `<img src="" alt="${item.title}"
              ${dataIsbn} data-needs-upgrade="1"
              onerror="handleImageError(this,'${safeTitle}','${safeAuthor}','${item.color}',${height})"
              ${loadAttrs}>`;
  }
  return createPlaceholderHtml(item.title, item.author, item.color, height);
}

// 画像読み込みエラー時のハンドラ（Google Books APIにフォールバック）
async function handleImageError(img, title, author, color, height) {
  const isbn = img.dataset.isbn;
  // Google Booksで既にトライ済みならプレースホルダーに
  if (img.dataset.gbTried) {
    img.outerHTML = createPlaceholderHtml(title, author, color, height);
    return;
  }
  if (isbn) {
    img.dataset.gbTried = '1';
    // キャッシュチェック
    if (coverCache[isbn]) {
      img.src = coverCache[isbn];
      return;
    }
    if (coverCache[isbn] === false) {
      img.outerHTML = createPlaceholderHtml(title, author, color, height);
      return;
    }
    try {
      const resp = await fetch(`/api/cover?isbn=${isbn}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.coverUrl) {
          coverCache[isbn] = data.coverUrl;
          img.src = data.coverUrl;
          return;
        }
      }
    } catch {}
    coverCache[isbn] = false;
  }
  img.outerHTML = createPlaceholderHtml(title, author, color, height);
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
  const safeTitle = (item.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const isbn = item.isbn || '';
  const dataIsbn = isbn ? `data-isbn="${isbn}"` : '';
  const needsUpgrade = (!item.hasRealCover && isbn) ? 'data-needs-upgrade="1"' : '';
  const imgStyle = "width:100%;height:auto;";
  const sizedUrl = withRakutenSize(item.imageUrl, 800);

  if (item.imageUrl) {
    return `<img src="${sizedUrl}" alt="${item.title}"
              ${dataIsbn} ${needsUpgrade}
              style="${imgStyle}"
              onerror="handleDetailImageError(this,'${safeTitle}','${item.color}')"
              loading="eager" fetchpriority="high" decoding="async">`;
  }
  if (isbn) {
    return `<img src="" alt="${item.title}"
              ${dataIsbn} data-needs-upgrade="1"
              style="${imgStyle}"
              onerror="handleDetailImageError(this,'${safeTitle}','${item.color}')"
              loading="eager" fetchpriority="high" decoding="async">`;
  }
  return `<div class="manga-detail-placeholder" style="background-color: ${item.color};">
            <span class="manga-placeholder-text">${item.title}</span>
          </div>`;
}

// 詳細ページ画像エラー時のハンドラ
async function handleDetailImageError(img, title, color) {
  const isbn = img.dataset.isbn;
  if (img.dataset.gbTried) {
    img.parentElement.innerHTML = `<div class="manga-detail-placeholder" style="background-color:${color};"><span class="manga-placeholder-text">${title}</span></div>`;
    return;
  }
  if (isbn) {
    img.dataset.gbTried = '1';
    if (coverCache[isbn]) { img.src = coverCache[isbn]; return; }
    if (coverCache[isbn] === false) {
      img.parentElement.innerHTML = `<div class="manga-detail-placeholder" style="background-color:${color};"><span class="manga-placeholder-text">${title}</span></div>`;
      return;
    }
    try {
      const resp = await fetch(`/api/cover?isbn=${isbn}&zoom=0`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.coverUrl) { coverCache[isbn] = data.coverUrl; img.src = data.coverUrl; return; }
      }
    } catch {}
    coverCache[isbn] = false;
  }
  img.parentElement.innerHTML = `<div class="manga-detail-placeholder" style="background-color:${color};"><span class="manga-placeholder-text">${title}</span></div>`;
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
  const tag = 'atlascomic-22';
  if (item.isbn) return `https://www.amazon.co.jp/s?k=${item.isbn}&tag=${tag}`;
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(item.title)}&tag=${tag}`;
}

// Google Books APIから高品質カバー画像を非同期取得してアップグレード
const coverCache = {};
async function upgradeCovers() {
  // data-needs-upgrade属性を持つ画像を優先的にアップグレード
  const images = document.querySelectorAll('img[data-isbn][data-needs-upgrade]');
  const batch = [];
  for (const img of images) {
    const isbn = img.dataset.isbn;
    if (!isbn || coverCache[isbn] === false) continue;
    if (coverCache[isbn]) {
      img.src = coverCache[isbn];
      img.removeAttribute('data-needs-upgrade');
      continue;
    }
    batch.push(img);
  }
  // 8件ずつバッチ処理（Google Books は十分高速なので待機なし）
  for (let i = 0; i < batch.length; i += 8) {
    const chunk = batch.slice(i, i + 8);
    await Promise.all(chunk.map(async (img) => {
      const isbn = img.dataset.isbn;
      try {
        const data = await cachedFetch(`/api/cover?isbn=${isbn}`);
          if (data.coverUrl) {
            // 画像URLが実際に読み込めるか事前確認してからsrcを差し替える
            await new Promise(resolve => {
              const tester = new Image();
              tester.onload = () => {
                coverCache[isbn] = data.coverUrl;
                img.src = data.coverUrl;
                img.removeAttribute('data-needs-upgrade');
                resolve();
              };
              tester.onerror = () => {
                coverCache[isbn] = false;
                resolve();
              };
              tester.src = data.coverUrl;
            });
          } else {
            coverCache[isbn] = false;
          }
      } catch {
        coverCache[isbn] = false;
      }
    }));
  }
}

// 共通ページネーションレンダラー（紫テーマ）
function renderPagination(container, currentPage, totalPages, onChange) {
  if (!container) return;
  if (totalPages <= 1) { container.style.display = 'none'; return; }
  container.style.display = 'flex';
  const icons = {
    first: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="6" width="2" height="12"/><path d="M19 6l-7 6 7 6V6z"/></svg>',
    prev:  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 6l-7 6 7 6V6z"/></svg>',
    next:  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 6l7 6-7 6V6z"/></svg>',
    last:  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 6l7 6-7 6V6z"/><rect x="17" y="6" width="2" height="12"/></svg>',
  };
  const atFirst = currentPage <= 1;
  const atLast = currentPage >= totalPages;
  container.innerHTML = `
    <button class="page-btn" data-action="first" ${atFirst ? 'disabled' : ''} aria-label="最初のページ">${icons.first}</button>
    <button class="page-btn" data-action="prev"  ${atFirst ? 'disabled' : ''} aria-label="前のページ">${icons.prev}</button>
    <div class="page-current-pill">
      <span class="page-current">${currentPage}</span>
      <span class="page-of">of ${totalPages}</span>
    </div>
    <button class="page-btn" data-action="next" ${atLast ? 'disabled' : ''} aria-label="次のページ">${icons.next}</button>
    <button class="page-btn" data-action="last" ${atLast ? 'disabled' : ''} aria-label="最後のページ">${icons.last}</button>
  `;
  container.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      let next = currentPage;
      if (action === 'first') next = 1;
      else if (action === 'prev') next = currentPage - 1;
      else if (action === 'next') next = currentPage + 1;
      else if (action === 'last') next = totalPages;
      if (next !== currentPage && next >= 1 && next <= totalPages) {
        onChange(next);
        window.scrollTo(0, 0);
      }
    });
  });
}

// ヘッダー：下スクロールで隠れ、上スクロールで再表示
(function() {
  let lastY = 0;
  window.addEventListener('scroll', () => {
    const header = document.querySelector('header');
    if (!header) return;
    const currentY = window.scrollY;
    if (currentY > lastY && currentY > 80) {
      header.classList.add('header-hidden');
    } else {
      header.classList.remove('header-hidden');
    }
    lastY = currentY;
  }, { passive: true });
})();
