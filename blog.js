// Blog list page
(function() {
    var grid = document.getElementById('blogGrid');
    if (!grid) return;

    var categoryColors = {
        'ランキング': '#D8052E',
        'おすすめ': '#2D6A4F',
        'まとめ': '#1D3557',
        '特集': '#6D4C91'
    };

    fetch('data/blog/posts.json')
        .then(function(res) { return res.json(); })
        .then(function(posts) {
            posts.sort(function(a, b) {
                var aRank = a.category === 'ランキング' ? 0 : 1;
                var bRank = b.category === 'ランキング' ? 0 : 1;
                if (aRank !== bRank) return aRank - bRank;
                return b.date.localeCompare(a.date);
            });

            var html = '';
            posts.forEach(function(post, i) {
                var color = categoryColors[post.category] || '#2B2B2B';
                var isFeatured = i === 0;
                var cls = 'blog-card' + (isFeatured ? ' blog-card--featured' : '');

                html += '<a href="blog-post.html?id=' + post.id + '" class="' + cls + '" style="--card-accent:' + color + '">' +
                    '<div class="blog-card-accent"></div>' +
                    '<div class="blog-card-body">' +
                        '<span class="blog-card-category" style="background:' + color + '">' + post.category + '</span>' +
                        '<h3 class="blog-card-title">' + post.title + '</h3>' +
                        '<p class="blog-card-desc">' + post.description + '</p>' +
                        '<span class="blog-card-arrow">Read more &rarr;</span>' +
                    '</div>' +
                '</a>';
            });
            grid.innerHTML = html;
        });
})();
