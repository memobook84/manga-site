// Blog list page — Category Section Layout
(function() {
    var container = document.getElementById('blogContainer');
    if (!container) return;

    var categoryColors = {
        'ランキング': '#D8052E',
        'おすすめ': '#2E7D32',
        'まとめ': '#1565C0',
        '特集': '#6A1B9A',
        'レビュー': '#E65100'
    };

    var categoryIcons = {
        'ランキング': 'ph-trophy',
        'おすすめ': 'ph-star',
        'まとめ': 'ph-list-bullets',
        '特集': 'ph-flag-banner',
        'レビュー': 'ph-pen'
    };

    var categoryOrder = ['レビュー', 'ランキング', 'おすすめ', '特集'];

    fetch('data/blog/posts.json?_=' + Date.now())
        .then(function(res) { return res.json(); })
        .then(function(posts) {
            // カテゴリーごとにグループ化
            var grouped = {};
            posts.forEach(function(post) {
                var cat = post.category;
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(post);
            });

            // 各グループ内を日付降順ソート
            Object.keys(grouped).forEach(function(cat) {
                grouped[cat].sort(function(a, b) {
                    return b.date.localeCompare(a.date);
                });
            });

            // 定義順 + 未定義カテゴリーを末尾に
            var orderedKeys = categoryOrder.filter(function(c) { return grouped[c]; });
            Object.keys(grouped).forEach(function(c) {
                if (orderedKeys.indexOf(c) === -1) orderedKeys.push(c);
            });

            var html = '';
            orderedKeys.forEach(function(cat) {
                var color = categoryColors[cat] || '#86868b';
                var icon = categoryIcons[cat] || 'ph-tag';
                var catPosts = grouped[cat];

                html += '<section class="blog-category-section">';

                // 左ラベル
                html += '<div class="blog-category-label">' +
                    '<div class="blog-category-label-inner" style="border-left: 3px solid ' + color + ';">' +
                        '<i class="ph-bold ' + icon + '" style="font-size: 20px; color: ' + color + ';"></i>' +
                        '<span class="blog-category-name">' + cat + '</span>' +
                        '<span class="blog-category-count">' + catPosts.length + '件</span>' +
                    '</div>' +
                '</div>';

                // 右カードグリッド
                html += '<div class="blog-category-cards">';
                catPosts.forEach(function(post) {
                    html += '<a href="blog-post.html?id=' + post.id + '" class="blog-card">' +
                        '<div class="blog-card-tag-area">' +
                            '<span class="blog-card-tag">' + post.category + ' <i class="ph-bold ' + icon + '"></i></span>' +
                        '</div>' +
                        '<div class="blog-card-body">' +
                            '<h3 class="blog-card-title">' + post.title.replace(/\n/g, '<br>') + '</h3>' +
                            '<p class="blog-card-desc">' + post.description + '</p>' +
                        '</div>' +
                    '</a>';
                });
                html += '</div>';

                html += '</section>';
            });

            container.innerHTML = html;
        });
})();
