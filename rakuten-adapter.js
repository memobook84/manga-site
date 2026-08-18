// 楽天APIレスポンスをサイト内データ形式に変換するアダプター

// APIレスポンスのlocalStorageキャッシュ。
// 楽天ウェブサービスは「価格・販売可能情報の保存は24時間まで」と定めており、
// レスポンスには price が含まれるので、以前の7日間では超過していた。
// CDN側（vercel.json の /api/ は s-maxage 12時間 + swr 1時間）と積み上がるため、
// 手元は8時間にして最悪ケースを 13 + 8 = 21時間に収めている。
const CACHE_TTL = 8 * 60 * 60 * 1000;

// TTLを縮めても、既存ブラウザには旧キーで最大7日分のキャッシュが残っている。
// バージョンを上げると初回アクセス時にまとめて破棄される
const CACHE_VERSION = 'v3';
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
// 楽天が「書影準備中」に返すテンプレート画像かどうか。
// 実在する書影は .jpg で配信されるのに対し、未入稿の本は ISBN名の .gif が返る
// （中身は 1004x1172 の共通テンプレート＝著者名と書名を並べただけの版面）。
// これを本物として扱うと、実表紙の列に文字だけのコマが混ざってしまう
function isRakutenNoCover(url) {
  if (!url) return false;
  const filename = String(url).split('?')[0].split('/').pop();
  return /^\d{10,13}\.gif$/i.test(filename);
}

function createImageElement(item, height = 320) {
  const safeTitle = (item.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const safeAuthor = (item.author || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const isbn = item.isbn || '';
  const dataIsbn = isbn ? `data-isbn="${isbn}"` : '';
  const noCover = isRakutenNoCover(item.imageUrl);
  const needsUpgrade = (!item.hasRealCover && !noCover && isbn) ? 'data-needs-upgrade="1"' : '';
  const size = pickRakutenSize(height);
  const sizedUrl = withRakutenSize(item.imageUrl, size);
  // 先頭6枚は eager + 高優先度、それ以降は lazy
  const idx = __imgIndex++;
  const loadAttrs = idx < 6
    ? `loading="eager" fetchpriority="high" decoding="async"`
    : `loading="lazy" decoding="async"`;

  // 書影準備中のテンプレートは表示せず、その場で白いカバーを描く。
  // ここでGoogle Booksに問い合わせると1件2秒以上かかるうえ、
  // 新刊はまず登録が無い（＝待った末に結局この白いカバーになる）ので引かない
  if (noCover) {
    return createPlaceholderHtml(item.title, item.author, item.color, height);
  }

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

// 表紙が無い本の代替カバー。
// 以前は作品ごとの色(color)で塗り、高さをインラインで指定していたが、
// インラインは各ページのCSS（ランキングの70x98pxなど）に勝ってしまい、
// 一覧の中で1枚だけ縦に伸びる原因になっていた。
// 見た目はすべてCSS（.manga-cover-placeholder）に任せる。
// 書名と著者名を刷っていた版は実表紙の列で文字だけのコマとして目立ったため、
// いまは白紙の中央に「ATLAS COMIC」の文字を横一行で置くだけにしている
// （以前の丸いマーク画像 /no-cover.png は廃止）。
// 引数の title / author / color / height は呼び出し側の互換のために残してあるが使っていない
function createPlaceholderHtml(title, author, color, height) {
  return `<div class="manga-cover-placeholder">
            <div class="cover-spine"></div>
            <span class="cover-mark-text">ATLAS COMIC</span>
          </div>`;
}

// 詳細ページ（作品・単行本）の大きいカバー用。一覧と同じ白紙＋文字
function createDetailPlaceholderHtml() {
  return `<div class="manga-detail-placeholder">
            <span class="cover-mark-text">ATLAS COMIC</span>
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
  const noCover = isRakutenNoCover(item.imageUrl);
  const needsUpgrade = (!item.hasRealCover && !noCover && isbn) ? 'data-needs-upgrade="1"' : '';
  const imgStyle = "width:100%;height:auto;";
  const sizedUrl = withRakutenSize(item.imageUrl, 800);

  // 書影準備中のテンプレートは表示せず、その場でプレースホルダーに落とす
  // （Google Booksへの問い合わせは待ち時間の割に当たらないので行わない）
  if (noCover) {
    return createDetailPlaceholderHtml();
  }

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
  return createDetailPlaceholderHtml();
}

// 詳細ページ画像エラー時のハンドラ
// ※差し替えは outerHTML（img 自身）で行うこと。parentElement.innerHTML だと
//   作品ページの表紙フレームに同居しているブックマークボタン・動画バッジまで消える
async function handleDetailImageError(img, title, color) {
  const isbn = img.dataset.isbn;
  if (img.dataset.gbTried) {
    img.outerHTML = createDetailPlaceholderHtml();
    return;
  }
  if (isbn) {
    img.dataset.gbTried = '1';
    if (coverCache[isbn]) { img.src = coverCache[isbn]; return; }
    if (coverCache[isbn] === false) {
      img.outerHTML = createDetailPlaceholderHtml();
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
  img.outerHTML = createDetailPlaceholderHtml();
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
    // 「SPY×FAMILY 17巻 描き下ろし◯◯付き特装版」のような特典付き版
    name = name.replace(/[\s　]+\d+巻[\s　].*版$/, '');
    // 「月華美刃（第4集）」「ゴルゴ13（158巻）」
    name = name.replace(/[\s　]*[（(]第?\d+[巻集][）)]$/, '');
    // 「月華美刃（げっかびじん）1」— 読みガナの直後に空白なしで巻数が付く形
    name = name.replace(/([）)])[\s　]*\d+$/, '$1');
    // 読みガナだけの括弧は落として、括弧なしの巻と同じシリーズに寄せる
    name = name.replace(/[\s　]*[（(][ぁ-んァ-ヴー・\s　]+[）)]$/, '');
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
  const chevron = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"` +
    ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

  // 現在ページを中心に最大3個の番号を並べる
  const WINDOW = 3;
  let start = Math.max(1, currentPage - Math.floor(WINDOW / 2));
  const end = Math.min(totalPages, start + WINDOW - 1);
  start = Math.max(1, end - WINDOW + 1);

  const atFirst = currentPage <= 1;
  const atLast = currentPage >= totalPages;

  let html =
    `<button class="page-btn page-nav" data-action="prev" ${atFirst ? 'disabled' : ''}` +
    ` aria-label="前のページ">${chevron('M15 18l-6-6 6-6')}</button>`;
  for (let p = start; p <= end; p++) {
    const isCurrent = p === currentPage;
    html +=
      `<button class="page-btn page-num${isCurrent ? ' is-current' : ''}" data-page="${p}"` +
      `${isCurrent ? ' aria-current="page"' : ''}>${p}</button>`;
  }
  html +=
    `<button class="page-btn page-nav" data-action="next" ${atLast ? 'disabled' : ''}` +
    ` aria-label="次のページ">${chevron('M9 18l6-6-6-6')}</button>`;
  container.innerHTML = html;

  container.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let next;
      if (btn.dataset.page) next = parseInt(btn.dataset.page, 10);
      else if (btn.dataset.action === 'prev') next = currentPage - 1;
      else next = currentPage + 1;
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
