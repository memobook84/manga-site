// Blog list page — Apple Style Card Layout
(function() {
    var grid = document.getElementById('blogGrid');
    if (!grid) return;

    var categoryColors = {
        'ランキング': '#D8052E',
        'おすすめ': '#2E7D32',
        'まとめ': '#1565C0',
        '特集': '#6A1B9A',
        'レビュー': '#E65100'
    };

    fetch('data/blog/posts.json?_=' + Date.now())
        .then(function(res) { return res.json(); })
        .then(function(posts) {
            posts.sort(function(a, b) {
                return b.date.localeCompare(a.date);
            });

            var html = '';
            posts.forEach(function(post) {
                var color = categoryColors[post.category] || '#86868b';
                html += '<a href="blog-post.html?id=' + post.id + '" class="blog-card">' +
                    '<div class="blog-card-body">' +
                        '<span class="blog-card-cat" style="color:' + color + ';">' + post.category + '</span>' +
                        '<h3 class="blog-card-title">' + post.title + '</h3>' +
                        '<p class="blog-card-desc">' + post.description + '</p>' +
                        '<span class="blog-card-date">' + post.date + '</span>' +
                    '</div>' +
                '</a>';
            });
            grid.innerHTML = html;
        });
})();
