// Blog list page
(function() {
    var grid = document.getElementById('blogGrid');
    if (!grid) return;

    fetch('data/blog/posts.json')
        .then(function(res) { return res.json(); })
        .then(function(posts) {
            posts.sort(function(a, b) {
                var aRank = a.category === 'ランキング' ? 0 : 1;
                var bRank = b.category === 'ランキング' ? 0 : 1;
                if (aRank !== bRank) return aRank - bRank;
                return b.date.localeCompare(a.date);
            });
            grid.innerHTML = posts.map(function(post) {
                return '<a href="blog-post.html?id=' + post.id + '" class="blog-card">' +
                    '<div class="blog-card-body">' +
                        '<div class="blog-card-meta">' +
                            '<span class="blog-card-category">' + post.category + '</span>' +
                        '</div>' +
                        '<h3 class="blog-card-title">' + post.title + '</h3>' +
                        '<p class="blog-card-desc">' + post.description + '</p>' +
                    '</div>' +
                '</a>';
            }).join('');
        });
})();
