// 現在のページ状態
let currentPage = 1;
let totalPages = 1;
let isLoading = false;
let currentKeyword = '';

// スケルトンUI表示
function showSkeleton(count = 30) {
    const gridContainer = document.querySelector('.manga-grid');
    gridContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'manga-item skeleton';
        skeleton.innerHTML = `
            <div class="skeleton-image"></div>
            <div class="skeleton-title"></div>
            <div class="skeleton-author"></div>
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

// APIレスポンスのアイテムをシリーズ単位にグループ化
function groupBySeries(items) {
    items = filterByPublisher(items);
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
        // 最新刊を除外
        const nonLatest = sorted.length > 1 ? sorted.slice(1) : sorted;
        const withCover = nonLatest.filter(v => v.hasRealCover);
        const pool = withCover.length > 0 ? withCover : nonLatest;
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

// 漫画データを表示する関数
function displayMangaItems(items) {
    const gridContainer = document.querySelector('.manga-grid');
    gridContainer.innerHTML = '';

    if (!items || items.length === 0) {
        gridContainer.innerHTML = '<p style="text-align:center;grid-column:1/-1;padding:40px;color:var(--color-text-sub);">作品が見つかりませんでした</p>';
        return;
    }

    items.forEach(item => {
        const mangaItem = document.createElement('div');
        mangaItem.className = 'manga-item';

        const imageHtml = createImageElement(item);

        mangaItem.innerHTML = `
            ${imageHtml}
            <h3>${item.displayTitle || item.title}</h3>
            <p class="author">${item.author}</p>
        `;

        mangaItem.addEventListener('click', () => {
            // 作品ページへ遷移（シリーズ名で検索）
            const seriesTitle = item.displayTitle || item.title;
            window.location.href = `detail.html?title=${encodeURIComponent(seriesTitle)}`;
        });

        gridContainer.appendChild(mangaItem);
    });
}

// APIからデータを取得（複数ページ取得して作品数を確保）
async function fetchFromApi(page = 1, keyword = '') {
    isLoading = true;
    showSkeleton();

    try {
        let allItems = [];

        if (keyword) {
            // 検索時は1ページのみ
            const response = await fetch(`/api/search?keyword=${encodeURIComponent(keyword)}&page=${page}&hits=30`);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();
            const adapted = adaptApiResponse(data);
            allItems = adapted.items;
            totalPages = adapted.pageCount;
            currentPage = adapted.page;
        } else {
            // トップページは5ページ分取得（出版社フィルタで減るため多めに）
            const startPage = (page - 1) * 5 + 1;
            const fetches = [1, 2, 3, 4, 5].map(i =>
                fetch(`/api/books?genre=001001&hits=30&page=${startPage + i - 1}&sort=sales`)
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null)
            );
            const results = await Promise.all(fetches);

            let apiTotalPages = 1;
            results.forEach(data => {
                if (data) {
                    const adapted = adaptApiResponse(data);
                    allItems = allItems.concat(adapted.items);
                    apiTotalPages = adapted.pageCount;
                }
            });
            // 5ページずつ消費するのでページ数を調整
            totalPages = Math.ceil(apiTotalPages / 5);
            currentPage = page;
        }

        // シリーズ単位にグループ化
        const series = groupBySeries(allItems);

        // カバーがない作品は追加検索で表紙を取得
        const needsCover = series.filter(s => s._needsCover);
        if (needsCover.length > 0) {
            const coverFetches = needsCover.map(s =>
                fetch(`/api/books?keyword=${encodeURIComponent(s.displayTitle)}&hits=10`)
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null)
            );
            const coverResults = await Promise.all(coverFetches);
            coverResults.forEach((data, i) => {
                if (!data || !data.items) return;
                const adapted = adaptApiResponse(data);
                // 実カバーがある巻を探す
                const withCover = adapted.items.filter(v => v.hasRealCover);
                if (withCover.length > 0) {
                    const pick = withCover[Math.floor(Math.random() * withCover.length)];
                    // 元のシリーズ情報を保持してカバーだけ差し替え
                    needsCover[i].imageUrl = pick.imageUrl;
                    needsCover[i].hasRealCover = true;
                    needsCover[i]._needsCover = false;
                }
            });
        }

        displayMangaItems(series);
        updatePagination();
    } catch (err) {
        console.warn('API取得失敗、フォールバックデータを使用:', err);
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

// ページ読み込み時に実行
window.addEventListener('DOMContentLoaded', () => {
    setupSearch();
    fetchFromApi(1);
});
