// Blog list page — Category Section Layout
(function() {
    var container = document.getElementById('blogContainer');
    if (!container) return;

    var categoryColors = {
        'ランキング': '#1d1d1f',
        'おすすめ': '#1d1d1f',
        'まとめ': '#1d1d1f',
        '特集': '#1d1d1f',
        'レビュー': '#1d1d1f'
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
                    '<div class="blog-category-label-inner">' +
                        '<i class="ph-bold ' + icon + '" style="font-size: 20px;"></i>' +
                        '<span class="blog-category-name">' + cat + '</span>' +
                        '<span class="blog-category-count">' + catPosts.length + '件</span>' +
                    '</div>' +
                '</div>';

                // 右カードグリッド
                html += '<div class="blog-category-cards">';
                catPosts.forEach(function(post) {
                    var descHtml = '';
                    if (post.bullets && post.bullets.length) {
                        descHtml = '<ul class="blog-card-bullets">';
                        post.bullets.forEach(function(b) {
                            descHtml += '<li>' + b + '</li>';
                        });
                        descHtml += '</ul>';
                    } else {
                        descHtml = '<p class="blog-card-desc">' + post.description + '</p>';
                    }
                    html += '<a href="blog-post.html?id=' + post.id + '" class="blog-card">' +
                        '<div class="blog-card-tag-area">' +
                            '<span class="blog-card-tag">' +
                                '<i class="ph-bold ' + icon + '"></i> ' + post.category +
                            '</span>' +
                        '</div>' +
                        '<div class="blog-card-body">' +
                            '<h3 class="blog-card-title">' + post.title.replace(/\n/g, '<br>') + '</h3>' +
                            descHtml +
                        '</div>' +
                    '</a>';
                });
                html += '</div>';

                html += '</section>';
            });

            container.innerHTML = html;
        });
})();
