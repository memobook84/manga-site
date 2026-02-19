// 検索ページロジック
(function () {
    const searchPage = document.getElementById('searchPage');
    const searchForm = document.getElementById('searchForm');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const searchResults = document.getElementById('searchResults');
    const resultsGrid = document.getElementById('resultsGrid');
    const resultsInfo = document.getElementById('resultsInfo');
    const resultsLoading = document.getElementById('resultsLoading');

    let currentQuery = '';

    // URLパラメータから初期検索
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get('q');
    if (initialQuery) {
        searchInput.value = initialQuery;
        searchClear.hidden = false;
        performSearch(initialQuery);
    }

    // フォーム送信
    searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const q = searchInput.value.trim();
        if (q) performSearch(q);
    });

    // Enter キーでも検索
    searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const q = searchInput.value.trim();
            if (q) performSearch(q);
        }
    });

    // クリアボタン
    searchClear.addEventListener('click', function () {
        searchInput.value = '';
        searchClear.hidden = true;
        searchInput.focus();
    });

    // 入力時にクリアボタン表示切替
    searchInput.addEventListener('input', function () {
        searchClear.hidden = !searchInput.value;
    });

    async function performSearch(query) {
        currentQuery = query;

        // URL更新（履歴に追加）
        const url = new URL(window.location);
        url.searchParams.set('q', query);
        window.history.pushState({}, '', url);

        // UI状態を「結果あり」に
        searchPage.classList.add('has-results');
        searchResults.hidden = false;
        resultsLoading.hidden = false;
        resultsGrid.innerHTML = '';
        resultsInfo.textContent = `「${query}」を検索中...`;

        try {
            const resp = await fetch(`/api/search?keyword=${encodeURIComponent(query)}&hits=30`);
            if (!resp.ok) throw new Error('API error');
            const data = await resp.json();

            // 同じクエリかチェック（連打対策）
            if (query !== currentQuery) return;

            const adapted = adaptApiResponse(data);
            const series = groupBySeries(adapted.items);

            resultsLoading.hidden = true;

            if (series.length === 0) {
                resultsInfo.textContent = `「${query}」の検索結果はありません`;
                resultsGrid.innerHTML = '<p style="text-align:center;color:var(--color-text-sub);padding:40px 0;">該当する作品が見つかりませんでした。別のキーワードで検索してみてください。</p>';
                return;
            }

            resultsInfo.textContent = `「${query}」の検索結果（${series.length}シリーズ）`;
            renderResults(series);

            // カバー画像アップグレード
            upgradeCovers();
        } catch (err) {
            if (query !== currentQuery) return;
            resultsLoading.hidden = true;
            resultsInfo.textContent = `検索中にエラーが発生しました`;
            resultsGrid.innerHTML = '<p style="text-align:center;color:var(--color-text-sub);padding:40px 0;">しばらくしてからもう一度お試しください。</p>';
        }
    }

    // シリーズ集約（script.jsのgroupBySeriesと同等）
    function groupBySeries(items) {
        // 特装版・限定版等を除外
        items = items.filter(function (item) {
            var t = item.title || '';
            return !/特装版|限定版|特別版|豪華版|ペーパークラフト付|描き下ろし|同梱版|セット|BOX/.test(t);
        });

        var seriesMap = new Map();

        items.forEach(function (item) {
            var seriesKey = extractSeriesName(item.title);
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

        var result = [];
        seriesMap.forEach(function (series) {
            var sorted = series.volumes.slice().sort(function (a, b) {
                var dateA = a.firstReleaseDate || '';
                var dateB = b.firstReleaseDate || '';
                if (dateA !== dateB) return dateB.localeCompare(dateA);
                return 0;
            });
            // 最新2巻を除外してカバーありを優先
            var skipCount = Math.min(2, Math.max(0, sorted.length - 1));
            var nonLatest = sorted.length > skipCount ? sorted.slice(skipCount) : sorted;
            var withCover = nonLatest.filter(function (v) { return v.hasRealCover; });
            var allWithCover = sorted.filter(function (v) { return v.hasRealCover; });
            var pool = withCover.length > 0 ? withCover :
                       allWithCover.length > 0 ? allWithCover : nonLatest;
            var representative = pool[Math.floor(Math.random() * pool.length)];

            result.push({
                seriesName: series.seriesName,
                author: series.author,
                representative: representative,
                volumeCount: sorted.length,
            });
        });

        return result;
    }

    function renderResults(seriesList) {
        var html = '';
        seriesList.forEach(function (s) {
            var item = s.representative;
            var coverHtml = createImageElement(item, 240);
            var titleEncoded = encodeURIComponent(s.seriesName);

            html += '<div class="manga-item" onclick="window.location.href=\'detail.html?title=' + titleEncoded + '\'">'
                  + coverHtml
                  + '<h3>' + escapeHtml(s.seriesName) + '</h3>'
                  + '<p class="author">' + escapeHtml(s.author || '') + '</p>'
                  + '</div>';
        });
        resultsGrid.innerHTML = html;
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ブラウザの戻る・進むに対応
    window.addEventListener('popstate', function () {
        var p = new URLSearchParams(window.location.search);
        var q = p.get('q');
        if (q) {
            searchInput.value = q;
            searchClear.hidden = false;
            performSearch(q);
        } else {
            searchPage.classList.remove('has-results');
            searchResults.hidden = true;
            searchInput.value = '';
            searchClear.hidden = true;
        }
    });
})();
