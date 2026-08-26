// 現在のページ状態
let currentPage = 1;
let totalPages = 1;
let isLoading = false;
let currentKeyword = '';
let currentFilter = null; // { type: 'publisher'|'genre'|'label'|'ranking', value: string }

// キャッシュ済み全データ（フィルタ用）
let cachedAllData = null;
let cachedFilteredData = null;
let cachedFilterKey = '';

const ITEMS_PER_PAGE = 60;

// スケルトンUI表示
function showSkeleton(count = 60) {
    const gridContainer = document.querySelector('.manga-grid');
    gridContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'manga-item skeleton';
        skeleton.innerHTML = `
            <div class="skeleton-image"></div>
            <div class="skeleton-title"></div>
        `;
        gridContainer.appendChild(skeleton);
    }
}

// 詳細ページへ遷移（モバイルはスライドイン演出付き）
function goToDetail(seriesTitle) {
    if (window.matchMedia('(max-width: 768px)').matches) {
        sessionStorage.setItem('detailSlideIn', '1');
    }
    window.location.href = `detail.html?title=${encodeURIComponent(seriesTitle)}`;
}

// 掲載対象の出版社
const ALLOWED_PUBLISHERS = ['集英社', '小学館', '講談社'];

function filterByPublisher(items) {
    return items.filter(item =>
        ALLOWED_PUBLISHERS.some(pub => (item.publisher || '').includes(pub))
    );
}

// APIレスポンスのアイテムをシリーズ単位にグループ化（検索時に使用）
function groupBySeries(items, publisherFilter) {
    if (publisherFilter) {
        items = items.filter(item => (item.publisher || '').includes(publisherFilter));
    } else {
        items = filterByPublisher(items);
    }

    // 特装版・限定版・セット等を除外
    items = items.filter(item => {
        const t = item.title || '';
        return !/特装版|限定版|特別版|豪華版|ペーパークラフト付|描き下ろし|同梱版|セット|BOX/.test(t);
    });

    const seriesMap = new Map();

    items.forEach(item => {
        const seriesKey = extractSeriesName(item.title);
        if (!seriesKey) return;

        if (!seriesMap.has(seriesKey)) {
            seriesMap.set(seriesKey, {
                seriesName: seriesKey,
                author: item.author,
                volumes: [],
            });
        }
        seriesMap.get(seriesKey).volumes.push(item);
    });

    // 各シリーズから代表アイテムを選択
    const result = [];
    seriesMap.forEach(series => {
        // 発売日で降順ソート（最新が先頭）
        const sorted = [...series.volumes].sort((a, b) => {
            const dateA = a.firstReleaseDate || '';
            const dateB = b.firstReleaseDate || '';
            if (dateA !== dateB) return dateB.localeCompare(dateA);
            const numA = parseInt((a.title || '').match(/\d+/)?.[0]) || 0;
            const numB = parseInt((b.title || '').match(/\d+/)?.[0]) || 0;
            return numB - numA;
        });
        // 最新2巻を除外（新刊はカバー画像が未登録の場合が多い）
        const skipCount = Math.min(2, Math.max(0, sorted.length - 1));
        const nonLatest = sorted.length > skipCount ? sorted.slice(skipCount) : sorted;
        const withCover = nonLatest.filter(v => v.hasRealCover);
        // カバーありの古い巻を優先、なければ全非最新巻、最終手段で全巻
        const allWithCover = sorted.filter(v => v.hasRealCover);
        const pool = withCover.length > 0 ? withCover :
                     allWithCover.length > 0 ? allWithCover : nonLatest;
        const representative = pool[Math.floor(Math.random() * pool.length)];

        result.push({
            ...representative,
            title: series.seriesName,
            _needsCover: !representative.hasRealCover,
            displayTitle: series.seriesName,
            author: series.author,
            volumeCount: series.volumes.length,
        });
    });

    return result;
}

// 売れ筋ランキングのキャッシュ
let cachedRanking = null;

// 売れ筋ランキングを取得
async function fetchRanking() {
    if (cachedRanking) return cachedRanking;
    try {
        const response = await fetch('/api/books?genre=001001&hits=30&sort=sales');
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        const adapted = adaptApiResponse(data);
        // シリーズ単位に集約して上位5件
        const series = groupBySeries(adapted.items);
        cachedRanking = series.slice(0, 10);
        return cachedRanking;
    } catch (err) {
        console.warn('ランキング取得失敗:', err);
        return null;
    }
}

// ホーム（home.html＝Databaseカタログ）だけ表紙の取得解像度を落とす。
//
// 表示枠は248pxなのに _ex=640（表示の2.6倍）を落としていた。1枚59KB×59枚＝約3.5MB。
// しかも楽天のサムネCDNはHTTP/1.1なので1ホスト6接続しか張れず、59枚が6枚ずつ
// 約10波に分かれて順番待ちする。その結果、全部揃うまで実測23秒かかっていた。
// _ex=320（1枚19KB）にすると4.3秒＝5.5倍速。248px表示なので劣化は分からない。
//
// ※ database.js は search-results.html とも共有しているため、
//    body クラス（両方 page-database）では絞れずパスで判定する。
//    他ページは undefined を返して従来通り pickRakutenSize() に任せる
function homeCoverSize() {
    const p = location.pathname;
    return (p === '/' || /\/home\.html$/i.test(p)) ? 320 : undefined;
}

// ランキングセクションを生成
function createRankingSection(rankingItems, startRank, title) {
    const section = document.createElement('div');
    section.className = 'ranking-section';
    section.style.gridColumn = '1 / -1';

    let html = `<div class="ranking-header"><h2 class="ranking-title">${title}</h2></div>`;
    html += '<div class="ranking-grid">';

    rankingItems.forEach((item, index) => {
        const imageHtml = createImageElement(item, 280, homeCoverSize());
        html += `
            <div class="ranking-item" data-index="${index}">
                <span class="ranking-number">${startRank + index}</span>
                <div class="ranking-card">
                    ${imageHtml}
                    <h3>${item.displayTitle || item.title}</h3>
                </div>
            </div>
        `;
    });

    html += '</div>';
    section.innerHTML = html;

    // クリックイベント
    section.querySelectorAll('.ranking-item').forEach((el, i) => {
        el.addEventListener('click', () => {
            const item = rankingItems[i];
            const seriesTitle = item.displayTitle || item.title;
            goToDetail(seriesTitle);
        });
    });

    return section;
}

// ===== 新着作品（data/new-series.json）=====
// 1巻が最近出たシリーズ。scripts/build-new-series.js が毎日のバッチで焼く。
// 「新刊ページ＝最近出た “巻”」に対して、こちらは「最近始まった “作品”」。
//
// database.js は search-results.html とも共有しているので、
// ホーム（/ か /home.html）以外では何もしない
let newSeriesCache = null;
let newSeriesRendered = false;

function isHomePage() {
    const p = location.pathname;
    return p === '/' || /\/home\.html$/i.test(p);
}

async function loadNewSeries() {
    if (newSeriesCache) return newSeriesCache;
    try {
        const res = await fetch('/data/new-series.json');
        newSeriesCache = res.ok ? await res.json() : { items: [] };
    } catch (err) {
        newSeriesCache = { items: [] };   // 焼けていない＝新着欄を出さない
    }
    return newSeriesCache;
}

// 新着を出す段数。24件なら12件ずつの2段になる
const NEW_SERIES_ROWS = 2;

// 1段ぶんの横スクロール枠を組み立てる。段ごとに独立して送れるよう、
// それぞれが自分の矢印を持つ
function buildNewSeriesRow(chunk, offset, base) {
    const viewport = document.createElement('div');
    viewport.className = 'new-series-viewport';
    viewport.innerHTML = `
        <button type="button" class="new-series-nav prev" aria-label="前の作品へ" hidden>
            <i class="ph-bold ph-caret-left" aria-hidden="true"></i>
        </button>
        <div class="new-series-row"></div>
        <button type="button" class="new-series-nav next" aria-label="次の作品へ" hidden>
            <i class="ph-bold ph-caret-right" aria-hidden="true"></i>
        </button>
    `;

    const row = viewport.querySelector('.new-series-row');
    chunk.forEach((r, i) => {
        // fields: title, author, publisher, cover, isbn, firstDate, volumeCount
        const item = {
            title: r[0],
            author: r[1],
            imageUrl: r[3] ? base + r[3] : '',
            isbn: r[4] || '',
            hasRealCover: true,
            color: generateColor(r[0] || '', offset + i),
        };

        const card = document.createElement('div');
        card.className = 'new-series-item';
        card.innerHTML = `
            <div class="db-cover-frame">${createImageElement(item, 280, homeCoverSize())}</div>
            <h3>${r[0]}</h3>
        `;
        card.addEventListener('click', () => goToDetail(r[0]));
        row.appendChild(card);
    });

    return viewport;
}

async function renderNewSeries() {
    const section = document.getElementById('new-series');
    const rows = document.getElementById('new-series-rows');
    if (!section || !rows) return;

    const data = await loadNewSeries();
    // JSONは発売日の新しい順で焼いてあるが、毎回おなじ顔ぶれがおなじ順で
    // 並ぶのを避けるため表示時にシャッフルする（ホーム1ページ目と同じ扱い）。
    // 日付順に戻したい時はこの行を data.items || [] に戻すだけでよい
    const items = shuffled(data.items || []);
    if (!items.length) return;

    const base = data.coverBase || '';
    rows.innerHTML = '';

    const per = Math.ceil(items.length / NEW_SERIES_ROWS);
    for (let r = 0; r < NEW_SERIES_ROWS; r++) {
        const chunk = items.slice(r * per, (r + 1) * per);
        if (!chunk.length) break;
        rows.appendChild(buildNewSeriesRow(chunk, r * per, base));
    }

    newSeriesRendered = true;
    // 幅を測るので、表示してからボタンを組む（hidden のままだと clientWidth が0）
    section.hidden = false;
    rows.querySelectorAll('.new-series-viewport').forEach(setupNewSeriesNav);
}

// 送りのカーブ。1回目は「そっと動き出してふわっと止まる」easeInOutCubic。
// 送っている最中にもう一度押された時だけ easeOutCubic に切り替える
// （easeInOutCubic は出だしの速度が0なので、動いている途中で入れ直すと
//   その瞬間だけ止まって見える）
const NS_EASE_IN_OUT = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const NS_EASE_OUT = t => 1 - Math.pow(1 - t, 3);

// 送る距離が長いほど少しだけ長くかける。短い送りが間延びしないよう上限つき
function newSeriesDuration(dist) {
    return Math.min(880, 420 + Math.abs(dist) * 0.28);
}

function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 左右の送りボタン。1回で「見えている幅ぶん」送る。
// 端まで来たらそちら側のボタンを引っ込める（スマホはCSSで非表示）
function setupNewSeriesNav(viewport) {
    const row = viewport.querySelector('.new-series-row');
    const prev = viewport.querySelector('.new-series-nav.prev');
    const next = viewport.querySelector('.new-series-nav.next');
    if (!row || !prev || !next) return;

    // ボタンの縦位置を表紙の中心に合わせる。表紙の高さは画面幅と
    // 実際の画像の縦横比で変わるので、CSSに固定値を書かず都度測る。
    // .db-cover-frame の offsetParent は .new-series-viewport（position:relative）
    function placeNav() {
        const frame = row.querySelector('.db-cover-frame');
        if (!frame || !frame.offsetHeight) return;
        const top = `${frame.offsetTop + frame.offsetHeight / 2}px`;
        prev.style.top = top;
        next.style.top = top;
    }

    function step() {
        // 端に半端な1枚が残らないよう、カード幅の倍数に丸めて送る
        const card = row.querySelector('.new-series-item');
        if (!card) return row.clientWidth;
        const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
        const unit = card.getBoundingClientRect().width + gap;
        return Math.max(unit, Math.floor(row.clientWidth / unit) * unit);
    }

    // scrollWidth / clientWidth を読むとレイアウトが走る。送っている間は
    // 毎フレーム呼ばれるので、値は持っておいて幅が変わった時だけ測り直す
    let maxCache = -1;
    function maxScroll() {
        if (maxCache < 0) maxCache = row.scrollWidth - row.clientWidth;
        return maxCache;
    }

    function setHidden(el, v) {
        if (el.hidden !== v) el.hidden = v;
    }

    function sync() {
        // 端の判定は小数の誤差が出るので1pxの余裕を見る
        const max = maxScroll();
        const hasOverflow = max > 1;
        setHidden(prev, !hasOverflow || row.scrollLeft <= 1);
        setHidden(next, !hasOverflow || row.scrollLeft >= max - 1);
    }

    // --- 送りのアニメーション ---
    // ブラウザ標準の scrollBy({behavior:'smooth'}) はカーブも時間も固定で
    // 止まり際が硬いので、自前で1フレームずつ scrollLeft を動かす。
    // CSS 側の scroll-behavior:smooth は二重がけになるため .new-series-row から外してある
    let raf = 0;
    let goal = null; // 連打を積み増すための「いまの目標位置」

    function stopGlide() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        goal = null;
        // スナップを戻す（送っている間だけ切っている）
        row.style.scrollSnapType = '';
    }

    function glide(delta) {
        const from = row.scrollLeft;
        // 連打は「いまの目標」から積む。現在位置から積むと、まだ動いている
        // ぶんだけ食われて1回ぶんに満たない量しか進まない
        const to = Math.max(0, Math.min(maxScroll(), (goal === null ? from : goal) + delta));
        const dist = to - from;
        if (Math.abs(dist) < 1) return;

        if (prefersReducedMotion()) {
            stopGlide();
            row.scrollLeft = to;
            sync();
            return;
        }

        // 動いている途中で押し直された時は、速度が途切れないカーブを使う
        const ease = raf ? NS_EASE_OUT : NS_EASE_IN_OUT;
        const dur = newSeriesDuration(dist);
        const start = performance.now();

        if (raf) cancelAnimationFrame(raf);
        goal = to;
        // proximity スナップが効いたままだと、止まり際にもう一度引っぱられて跳ねる
        row.style.scrollSnapType = 'none';

        const tick = now => {
            const t = Math.min(1, (now - start) / dur);
            row.scrollLeft = from + dist * ease(t);
            if (t < 1) {
                raf = requestAnimationFrame(tick);
                return;
            }
            raf = 0;
            goal = null;
            row.style.scrollSnapType = '';
        };
        raf = requestAnimationFrame(tick);
    }

    prev.addEventListener('click', () => glide(-step()));
    next.addEventListener('click', () => glide(step()));
    // 指やホイールで触られたら、送りの途中でもそちらに譲る
    ['pointerdown', 'touchstart', 'wheel'].forEach(type => {
        row.addEventListener(type, stopGlide, { passive: true });
    });

    // スクロール中は表示の出し入れだけ。位置の測り直しまではしない
    row.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', () => { maxCache = -1; placeNav(); sync(); });
    // 表紙が読み込まれると列の幅と高さが変わるので、載ってから測り直す
    row.querySelectorAll('img').forEach(img => {
        if (!img.complete) {
            img.addEventListener('load', () => { maxCache = -1; placeNav(); sync(); }, { once: true });
        }
    });
    placeNav();
    sync();
}

// 一覧の状態に合わせて新着欄を出し入れする。
// 出すのは「ホーム・1ページ目・フィルタなし・検索なし」の時だけ。
// 下のグリッドの見出し（話題の作品）も同じ条件で一緒に出し入れする。
// 2ページ目以降や絞り込み中は中身が入れ替わるので、見出しだけ残さない
function updateNewSeries() {
    const section = document.getElementById('new-series');
    const gridHeader = document.getElementById('grid-header');

    const show = isHomePage() && currentPage === 1 && !currentFilter && !currentKeyword;
    if (gridHeader) gridHeader.hidden = !show;

    if (!section) return;
    if (!show) {
        section.hidden = true;
        return;
    }
    if (newSeriesRendered) {
        section.hidden = false;
        return;
    }
    renderNewSeries();
}

// 漫画データを表示する関数
function displayMangaItems(items) {
    const gridContainer = document.querySelector('.manga-grid');
    gridContainer.innerHTML = '';

    if (!items || items.length === 0) {
        gridContainer.innerHTML = '<p style="text-align:center;grid-column:1/-1;padding:40px;color:var(--color-text-sub);">作品が見つかりませんでした</p>';
        updateNewSeries();
        return;
    }

    // ランキング埋め込みは一旦無効化（Popularページに独立）
    const insertRanking = false;
    const insertAt1 = 18; // 3段目の後（1〜5位）
    const insertAt2 = 36; // 6段目の後（6〜10位）

    // ランキングデータを事前取得
    const rankingPromise = insertRanking ? fetchRanking() : Promise.resolve(null);

    // 6件ずつ .manga-strip で束ねる。スマホではこの束が
    // 「1段6冊・3冊ずつ横スワイプ」の単位になる（60件＝10段）。
    // PC・タブレットでは .manga-strip を display:contents にしてあるので
    // 束は無かったことになり、従来どおりグリッドへそのまま流れる。
    // 検索結果ページ（search-results.html）は対象外
    const STRIP_SIZE = 6;
    const useStrips = isHomePage();
    let strip = null;

    items.forEach((item, index) => {
        const mangaItem = document.createElement('div');
        mangaItem.className = 'manga-item';

        const imageHtml = createImageElement(item, 320, homeCoverSize());

        mangaItem.innerHTML = `
            <div class="db-cover-frame">${imageHtml}</div>
            <h3>${item.displayTitle || item.title}</h3>
        `;

        mangaItem.addEventListener('click', () => {
            const seriesTitle = item.displayTitle || item.title;
            goToDetail(seriesTitle);
        });

        if (useStrips) {
            if (index % STRIP_SIZE === 0) {
                strip = document.createElement('div');
                strip.className = 'manga-strip';
                gridContainer.appendChild(strip);
            }
            strip.appendChild(mangaItem);
        } else {
            gridContainer.appendChild(mangaItem);
        }

        // 18作品目の後にランキング1〜5位を挿入
        if (insertRanking && index === insertAt1 - 1) {
            const placeholder = document.createElement('div');
            placeholder.className = 'ranking-section';
            placeholder.style.gridColumn = '1 / -1';
            gridContainer.appendChild(placeholder);

            rankingPromise.then(ranking => {
                if (ranking && ranking.length >= 5) {
                    const section = createRankingSection(ranking.slice(0, 5), 1, '売れ筋ランキング');
                    placeholder.replaceWith(section);
                } else {
                    placeholder.remove();
                }
            });
        }

        // 36作品目の後にランキング6〜10位を挿入
        if (insertRanking && index === insertAt2 - 1) {
            const placeholder2 = document.createElement('div');
            placeholder2.className = 'ranking-section';
            placeholder2.style.gridColumn = '1 / -1';
            gridContainer.appendChild(placeholder2);

            rankingPromise.then(ranking => {
                if (ranking && ranking.length > 5) {
                    const section = createRankingSection(ranking.slice(5, 10), 6, '売れ筋ランキング');
                    placeholder2.replaceWith(section);
                } else {
                    placeholder2.remove();
                }
            });
        }
    });

    updateNewSeries();
}

// レーベル名の表記ゆれを吸収（中黒・全角/半角スペースを除去）
function normalizeLabel(label) {
    return (label || '').replace(/[・\s　]/g, '');
}

// フィルタキーを生成（キャッシュ判定用）
function getFilterKey() {
    if (!currentFilter) return 'all';
    return `${currentFilter.type}:${currentFilter.value}`;
}

// 全データを取得してフィルタ・ページネーション（出版社/ジャンルフィルタ時）
async function loadAllDataAndFilter() {
    if (!cachedAllData) {
        const response = await fetch('/data/manga-all.json');
        if (!response.ok) throw new Error(`JSON fetch error: ${response.status}`);
        cachedAllData = await response.json();
    }
    return cachedAllData;
}

// フィルタ済みデータを取得（キャッシュ付き）
async function getFilteredData() {
    const filterKey = getFilterKey();

    if (cachedFilteredData && cachedFilterKey === filterKey) {
        return cachedFilteredData;
    }

    const allData = await loadAllDataAndFilter();
    let filtered = allData;

    if (currentFilter) {
        if (currentFilter.type === 'publisher') {
            filtered = allData.filter(item =>
                (item.publisher || '').includes(currentFilter.value)
            );
        } else if (currentFilter.type === 'genre') {
            const genreId = currentFilter.value;
            filtered = allData.filter(item => {
                const itemGenreId = item.genreId || '';
                return itemGenreId.startsWith(genreId);
            });
        } else if (currentFilter.type === 'label') {
            // 前方一致で判定する。includes だと「ジャンプコミックス」が
            // 「ヤングジャンプコミックス」まで拾ってしまうため。
            // 「ジャンプ・コミックス」「モーニング　KC」のような
            // 中黒・空白ゆれは正規化して吸収する
            const target = normalizeLabel(currentFilter.value);
            filtered = allData.filter(item =>
                normalizeLabel(item.label).startsWith(target)
            );
        }
        // ranking: データは既に売上順なのでそのまま
    }

    cachedFilteredData = filtered;
    cachedFilterKey = filterKey;
    return filtered;
}

// 配列をシャッフルした新しい配列を返す（Fisher-Yates）。
// 元の配列は書き換えない
function shuffled(items) {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// JSONキャッシュからページデータを取得
async function fetchFromJson(page) {
    const needsFilter = currentFilter &&
        (currentFilter.type === 'publisher' ||
         currentFilter.type === 'genre' ||
         currentFilter.type === 'label');

    if (needsFilter) {
        // フィルタ時: 全データからフィルタしてページネーション
        const filtered = await getFilteredData();
        totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
        currentPage = page;
        const start = (page - 1) * ITEMS_PER_PAGE;
        return filtered.slice(start, start + ITEMS_PER_PAGE);
    } else {
        // フィルタなし: ページ別JSONを直接fetch
        const response = await fetch(`/data/pages/page-${page}.json`);
        if (!response.ok) throw new Error(`Page JSON fetch error: ${response.status}`);
        const data = await response.json();
        totalPages = data.totalPages;
        currentPage = data.page;
        // 1ページ目だけ並び順をシャッフルする。毎回おなじ顔ぶれが
        // おなじ順で並ぶのを避けるのが目的。
        // ※シャッフルするのは「page-1.json の60件の中だけ」。
        //   他ページから作品を持ってこないので、2ページ目以降との
        //   重複や抜けは起きない
        return page === 1 ? shuffled(data.items) : data.items;
    }
}

// 自前インデックスによる検索。描画まで済めば true、
// 使えなかった（未生成・0件）場合は false を返して呼び出し元をAPIに回す。
let indexSearchCache = { keyword: '', results: null };

async function searchFromIndex(keyword, page) {
    if (typeof searchSeriesIndex !== 'function') return false;

    let results;
    try {
        // 同じキーワードのページ送りでは検索し直さない
        if (indexSearchCache.keyword === keyword && indexSearchCache.results) {
            results = indexSearchCache.results;
        } else {
            results = await searchSeriesIndex(keyword);
            indexSearchCache = { keyword: keyword, results: results };
        }
    } catch (err) {
        console.warn('検索インデックスが使えないためAPI検索にフォールバック:', err.message);
        return false;
    }

    if (!results || results.length === 0) return false;

    // 出版社サイドバーで絞り込み中ならそれも反映
    const publisherFilter = (currentFilter && currentFilter.type === 'publisher') ? currentFilter.value : null;
    const filtered = publisherFilter
        ? results.filter(r => (r.publisher || '').includes(publisherFilter))
        : results;

    if (filtered.length === 0) return false;

    // ページングはクライアント側で行う
    totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;

    displayMangaItems(filtered.slice(start, start + ITEMS_PER_PAGE));
    updatePagination();
    upgradeCovers();
    return true;
}

// APIからデータを取得（検索時のみ使用）
async function fetchFromApi(page = 1, keyword = '') {
    if (isLoading) return;
    isLoading = true;
    showSkeleton();

    try {
        if (keyword) {
            // 検索時: まず自前の検索インデックスを引く（APIを叩かない）
            const fromIndex = await searchFromIndex(keyword, page);
            if (fromIndex) {
                isLoading = false;
                return;
            }

            // インデックスに無い／読めない場合だけ、従来どおりAPIで検索
            const response = await fetch(`/api/search?keyword=${encodeURIComponent(keyword)}&page=${page}&hits=30`);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();
            const adapted = adaptApiResponse(data);
            const allItems = adapted.items;
            totalPages = adapted.pageCount;
            currentPage = adapted.page;

            // 出版社フィルタ
            const publisherFilter = (currentFilter && currentFilter.type === 'publisher') ? currentFilter.value : null;
            const series = groupBySeries(allItems, publisherFilter);

            // ヒットした巻数が多いシリーズを上に（長期連載＝人気作の近似）。
            // 同数ならタイトル順で並びを安定させる
            series.sort((a, b) =>
                (b.volumeCount || 0) - (a.volumeCount || 0) ||
                (a.title || '').localeCompare(b.title || '', 'ja')
            );

            displayMangaItems(series);
            updatePagination();
            upgradeCovers();
        } else {
            // トップページ: JSONキャッシュから読み込み
            const items = await fetchFromJson(page);

            // adaptItemでcolor等を付与、JSON固有フィールドを維持
            const adapted = items.map((item, i) => {
                // 候補画像からランダムに選択
                if (item.coverCandidates && item.coverCandidates.length > 0) {
                    const pick = item.coverCandidates[Math.floor(Math.random() * item.coverCandidates.length)];
                    item.imageUrl = pick.imageUrl;
                    item.isbn = pick.isbn;
                    item.hasRealCover = pick.hasRealCover;
                }
                const base = adaptItem(item, i);
                base.displayTitle = item.displayTitle || item.title;
                if (item.genre && !item.genre.startsWith('001')) {
                    base.genre = item.genre;
                }
                return base;
            });
            displayMangaItems(adapted);
            updatePagination();
            upgradeCovers();
        }
    } catch (err) {
        console.warn('データ取得失敗、フォールバックデータを使用:', err);
        fallbackDisplay(keyword);
    } finally {
        isLoading = false;
    }
}

// フォールバック表示（manga-data.jsから）
function fallbackDisplay(keyword = '') {
    let items = mangaDatabase;
    if (keyword) {
        items = mangaDatabase.filter(m =>
            m.title.toLowerCase().includes(keyword.toLowerCase()) ||
            m.author.toLowerCase().includes(keyword.toLowerCase())
        );
    }

    const adapted = items.map((m, i) => ({
        ...m,
        imageUrl: '',
        price: '',
        priceRaw: 0,
        isbn: '',
        itemUrl: '',
        seriesName: m.label || '',
        displayTitle: m.title,
    }));

    totalPages = 1;
    currentPage = 1;
    displayMangaItems(adapted);
    updatePagination();
}

// ページネーション更新
function updatePagination() {
    const container = document.getElementById('pagination');
    renderPagination(container, currentPage, totalPages, (next) => {
        currentPage = next;
        fetchFromApi(currentPage, currentKeyword);
    // ホームは番号を出さず前後の矢印だけにする。
    // 検索結果ページ（search-results.html）は従来どおり番号を出す
    }, isHomePage() ? { numbers: false } : undefined);
}

// 検索機能
function setupSearch() {
    const searchInput = document.querySelector('.search-box input');
    const searchButton = document.querySelector('.search-box button');

    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

// 検索結果は専用ページ（search-results.html）で表示する。
// このページ自体が検索結果ページの場合も、新しいキーワードで開き直す。
function performSearch() {
    const searchInput = document.querySelector('.search-box input');
    const keyword = searchInput.value.trim();
    if (!keyword) return;
    location.href = '/search-results.html?search=' + encodeURIComponent(keyword);
}

// サイドバーのフィルタ機能
function setupSidebar() {
    const sidebarLinks = document.querySelectorAll('.sidebar-link[data-filter]');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const filterType = link.dataset.filter;
            const filterValue = link.dataset.value;

            // 同じフィルタをクリックしたら解除
            if (currentFilter && currentFilter.type === filterType && currentFilter.value === filterValue) {
                currentFilter = null;
                link.classList.remove('active');
            } else {
                // 全リンクのactiveを解除してから設定
                sidebarLinks.forEach(l => l.classList.remove('active'));
                currentFilter = { type: filterType, value: filterValue };
                link.classList.add('active');
            }

            currentPage = 1;
            currentKeyword = '';
            const searchInput = document.querySelector('.search-box input');
            if (searchInput) searchInput.value = '';
            fetchFromApi(1);
        });
    });
}

// ページ読み込み時に実行
window.addEventListener('DOMContentLoaded', () => {
    setupSearch();
    setupSidebar();

    // URLの?search=パラメータから検索を実行
    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get('search');
    if (searchParam) {
        const searchInput = document.querySelector('.search-box input');
        if (searchInput) searchInput.value = searchParam;
        currentKeyword = searchParam;
        fetchFromApi(1, searchParam);
    } else {
        fetchFromApi(1);
    }
});
