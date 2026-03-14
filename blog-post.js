// Blog post detail page
(function() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    if (!id) {
        window.location.href = 'blog.html';
        return;
    }

    var titleEl = document.getElementById('blogPostTitle');
    var metaEl = document.getElementById('blogPostMeta');
    var bodyEl = document.getElementById('blogPostBody');

    fetch('data/blog/posts.json')
        .then(function(res) { return res.json(); })
        .then(function(posts) {
            var post = posts.find(function(p) { return p.id === id; });
            if (!post) {
                window.location.href = 'blog.html';
                return;
            }

            document.title = post.title + ' - ATLAS COMIC Blog';
            titleEl.textContent = post.title;
            metaEl.innerHTML =
                '<span class="blog-post-category">' + post.category + '</span>' +
                '<span class="blog-post-date">' + post.date + '</span>';

            return fetch('data/blog/' + id + '.html');
        })
        .then(function(res) {
            if (!res || !res.ok) throw new Error('not found');
            return res.text();
        })
        .then(function(html) {
            bodyEl.innerHTML = html;
        })
        .catch(function() {
            bodyEl.innerHTML = '<p>記事の読み込みに失敗しました。</p>';
        });
})();
