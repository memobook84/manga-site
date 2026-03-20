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

    fetch('data/blog/posts.json?_=' + Date.now())
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
                '<span class="blog-post-category">' + post.category + '</span>';

            return fetch('data/blog/' + id + '.html?_=' + Date.now());
        })
        .then(function(res) {
            if (!res || !res.ok) throw new Error('not found');
            return res.text();
        })
        .then(function(html) {
            bodyEl.innerHTML = html;
            loadMangaCovers(bodyEl);
        })
        .catch(function() {
            bodyEl.innerHTML = '<p>記事の読み込みに失敗しました。</p>';
        });

    // h2/h3から漫画タイトルを抽出して表紙画像を追加
    function loadMangaCovers(container) {
        var headings = container.querySelectorAll('h2, h3');
        var items = [];
        headings.forEach(function(h) {
            var text = h.textContent;
            // 「1位：タイトル」「第1位：タイトル」「1. タイトル」パターン
            var match = text.match(/(?:第?\d+位[：:]?\s*|^\d+\.\s*)(.+)$/);
            if (!match) return;
            var title = match[1].trim();
            if (!title || title === 'まとめ') return;

            // h2の次のpを探す
            var nextP = h.nextElementSibling;
            if (!nextP || nextP.tagName !== 'P') return;

            items.push({ heading: h, paragraph: nextP, title: title });
        });

        // 順番に画像を取得して挿入
        (function processNext(i) {
            if (i >= items.length) return;
            var item = items[i];
            fetchCover(item.title).then(function(url) {
                if (url) {
                    // wrapperで囲む
                    var wrapper = document.createElement('div');
                    wrapper.className = 'blog-manga-item';

                    var imgLink = document.createElement('a');
                    imgLink.href = 'detail.html?title=' + encodeURIComponent(item.title);
                    imgLink.className = 'blog-manga-cover';
                    var img = document.createElement('img');
                    img.src = url;
                    img.alt = item.title;
                    img.loading = 'lazy';
                    imgLink.appendChild(img);

                    var textDiv = document.createElement('div');
                    textDiv.className = 'blog-manga-text';

                    // h2とpをwrapperに移動
                    item.heading.parentNode.insertBefore(wrapper, item.heading);
                    wrapper.appendChild(imgLink);
                    textDiv.appendChild(item.heading);
                    textDiv.appendChild(item.paragraph);
                    wrapper.appendChild(textDiv);
                }
                setTimeout(function() { processNext(i + 1); }, 300);
            });
        })(0);
    }

    function fetchCover(title) {
        return fetch('/api/search?keyword=' + encodeURIComponent(title) + '&hits=5')
            .then(function(resp) {
                if (!resp.ok) return null;
                return resp.json();
            })
            .then(function(data) {
                if (!data || !data.items || data.items.length === 0) return null;
                var withCover = data.items.find(function(it) { return it.imageUrl && it.hasRealCover; });
                if (withCover) return withCover.imageUrl;
                var withImg = data.items.find(function(it) { return it.imageUrl; });
                return withImg ? withImg.imageUrl : null;
            })
            .catch(function() { return null; });
    }
})();
