// ランキングページロジック

async function displayRanking() {
    const grid = document.getElementById('ranking-grid');
    grid.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-text-sub);">ランキングを読み込み中...</p>';

    try {
        const response = await fetch('/api/books?genre=001001&hits=30&sort=sales');
        if (!response.ok) throw new Error('API error: ' + response.status);
        const data = await response.json();
        const adapted = adaptApiResponse(data);
        const series = groupBySeries(adapted.items);

        if (series.length === 0) {
            grid.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-text-sub);">ランキングデータが見つかりませんでした。</p>';
            return;
        }

        renderRanking(series, grid);
        upgradeCovers();
    } catch (err) {
        console.warn('ランキング取得失敗:', err);
        grid.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-text-sub);">ランキングの読み込みに失敗しました。しばらくしてからもう一度お試しください。</p>';
    }
}

// シリーズ集約（search.jsと同等）
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

function renderRanking(seriesList, container) {
    var html = '';
    seriesList.forEach(function (s, index) {
        var item = s.representative;
        var coverHtml = createImageElement(item, 240);
        var titleEncoded = encodeURIComponent(s.seriesName);

        html += '<div class="ranking-item" onclick="window.location.href=\'detail.html?title=' + titleEncoded + '\'">'
              + '<span class="ranking-number">' + (index + 1) + '</span>'
              + '<div class="ranking-card">'
              + coverHtml
              + '<h3>' + escapeHtml(s.seriesName) + '</h3>'
              + '<p class="author">' + escapeHtml(s.author || '') + '</p>'
              + '</div>'
              + '</div>';
    });
    container.innerHTML = html;
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

window.addEventListener('DOMContentLoaded', displayRanking);
