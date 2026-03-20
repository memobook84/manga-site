// 現在のページ状態
let currentPage = 1;
let totalPages = 1;
let isLoading = false;
let currentKeyword = '';
let currentFilter = null; // { type: 'publisher'|'genre'|'ranking', value: string }

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

// ランキングセクションを生成
function createRankingSection(rankingItems, startRank, title) {
    const section = document.createElement('div');
    section.className = 'ranking-section';
    section.style.gridColumn = '1 / -1';

    let html = `<div class="ranking-header"><h2 class="ranking-title">${title}</h2></div>`;
    html += '<div class="ranking-grid">';

    rankingItems.forEach((item, index) => {
        const imageHtml = createImageElement(item, 280);
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
            window.location.href = `detail.html?title=${encodeURIComponent(seriesTitle)}`;
        });
    });

    return section;
}

// 漫画データを表示する関数
function displayMangaItems(items) {
    const gridContainer = document.querySelector('.manga-grid');
    gridContainer.innerHTML = '';

    if (!items || items.length === 0) {
        gridContainer.innerHTML = '<p style="text-align:center;grid-column:1/-1;padding:40px;color:var(--color-text-sub);">作品が見つかりませんでした</p>';
        return;
    }

    // ランキング埋め込みは一旦無効化（Popularページに独立）
    const insertRanking = false;
    const insertAt1 = 18; // 3段目の後（1〜5位）
    const insertAt2 = 36; // 6段目の後（6〜10位）

    // ランキングデータを事前取得
    const rankingPromise = insertRanking ? fetchRanking() : Promise.resolve(null);

    items.forEach((item, index) => {
        const mangaItem = document.createElement('div');
        mangaItem.className = 'manga-item';

        const imageHtml = createImageElement(item);

        mangaItem.innerHTML = `
            ${imageHtml}
            <h3>${item.displayTitle || item.title}</h3>
        `;

        mangaItem.addEventListener('click', () => {
            const seriesTitle = item.displayTitle || item.title;
            window.location.href = `detail.html?title=${encodeURIComponent(seriesTitle)}`;
        });

        gridContainer.appendChild(mangaItem);

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
        }
        // ranking: データは既に売上順なのでそのまま
    }

    cachedFilteredData = filtered;
    cachedFilterKey = filterKey;
    return filtered;
}

// JSONキャッシュからページデータを取得
async function fetchFromJson(page) {
    const needsFilter = currentFilter &&
        (currentFilter.type === 'publisher' || currentFilter.type === 'genre');

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
        return data.items;
    }
}

// APIからデータを取得（検索時のみ使用）
async function fetchFromApi(page = 1, keyword = '') {
    if (isLoading) return;
    isLoading = true;
    showSkeleton();

    try {
        if (keyword) {
            // 検索時: 既存の /api/search をリアルタイムで使用
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
    if (!container) return;

    if (totalPages <= 1) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.textContent = '← 前へ';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchFromApi(currentPage, currentKeyword);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    container.appendChild(prevBtn);

    const pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    pageInfo.textContent = `${currentPage} / ${totalPages}`;
    container.appendChild(pageInfo);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.textContent = '次へ →';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            fetchFromApi(currentPage, currentKeyword);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    container.appendChild(nextBtn);
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

function performSearch() {
    const searchInput = document.querySelector('.search-box input');
    const keyword = searchInput.value.trim();
    currentKeyword = keyword;
    currentPage = 1;

    if (!keyword) {
        fetchFromApi(1);
        return;
    }

    fetchFromApi(1, keyword);
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
