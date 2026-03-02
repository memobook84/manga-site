// ランキングページロジック - Amazon Charts風

async function displayRanking() {
    var container = document.querySelector('.ranking-container');
    container.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-text-sub);">ランキングを読み込み中...</p>';

    try {
        var response = await fetch('/api/books?genre=001001&hits=30&sort=sales');
        if (!response.ok) throw new Error('API error: ' + response.status);
        var data = await response.json();
        var adapted = adaptApiResponse(data);
        var series = groupBySeries(adapted.items);

        if (series.length === 0) {
            container.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-text-sub);">ランキングデータが見つかりませんでした。</p>';
            return;
        }

        renderRanking(series, container);
        upgradeCovers();
    } catch (err) {
        console.warn('ランキング取得失敗:', err);
        container.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-text-sub);">ランキングの読み込みに失敗しました。しばらくしてからもう一度お試しください。</p>';
    }
}

// シリーズ集約
function groupBySeries(items) {
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

    // トップ3: カード型
    html += '<div class="ranking-top3">';
    for (var i = 0; i < Math.min(3, seriesList.length); i++) {
        var s = seriesList[i];
        var item = s.representative;
        var coverHtml = createImageElement(item, 200);
        var titleEncoded = encodeURIComponent(s.seriesName);

        html += '<div class="ranking-top3-item" onclick="window.location.href=\'detail.html?title=' + titleEncoded + '\'">'
              + '<div class="ranking-top3-number">' + (i + 1) + '</div>'
              + '<div class="ranking-top3-cover">' + coverHtml + '</div>'
              + '<div class="ranking-top3-title">' + escapeHtml(s.seriesName) + '</div>'
              + '<div class="ranking-top3-author">' + escapeHtml(s.author || '') + '</div>'
              + '</div>';
    }
    html += '</div>';

    // 4位以降: リスト型
    if (seriesList.length > 3) {
        html += '<div class="ranking-list">';
        for (var j = 3; j < seriesList.length; j++) {
            var s2 = seriesList[j];
            var item2 = s2.representative;
            var coverHtml2 = createImageElement(item2, 140);
            var titleEncoded2 = encodeURIComponent(s2.seriesName);

            html += '<div class="ranking-list-item" onclick="window.location.href=\'detail.html?title=' + titleEncoded2 + '\'">'
                  + '<div class="ranking-list-number">' + (j + 1) + '</div>'
                  + '<div class="ranking-list-cover">' + coverHtml2 + '</div>'
                  + '<div class="ranking-list-info">'
                  + '<div class="ranking-list-title">' + escapeHtml(s2.seriesName) + '</div>'
                  + '<div class="ranking-list-author">' + escapeHtml(s2.author || '') + '</div>'
                  + '</div>'
                  + '</div>';
        }
        html += '</div>';
    }

    container.innerHTML = html;
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

window.addEventListener('DOMContentLoaded', displayRanking);
