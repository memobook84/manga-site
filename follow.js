// フォローした作品を取得
function getFollowedManga() {
    const stored = localStorage.getItem('followedManga');
    return stored ? JSON.parse(stored) : [];
}


// フォローした作品を表示
function displayFollowedManga() {
    const followedManga = getFollowedManga();
    const grid = document.getElementById('followed-manga-grid');
    const emptyMessage = document.getElementById('empty-message');
    const followCount = document.getElementById('follow-count');

    followCount.textContent = `${followedManga.length}作品`;

    if (followedManga.length === 0) {
        grid.style.display = 'none';
        emptyMessage.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    emptyMessage.style.display = 'none';
    grid.innerHTML = '';

    followedManga.forEach((manga) => {
        const mangaItem = document.createElement('div');
        mangaItem.className = 'followed-manga-item';

        const safeTitle = (manga.title || '').replace(/"/g, '&quot;');
        const imageHtml = manga.imageUrl
            ? `<img src="${manga.imageUrl}" alt="${safeTitle}" loading="lazy"
                 onerror="this.outerHTML='<div class=\\'manga-placeholder\\' style=\\'background-color:${manga.color || '#666'};width:150px;height:225px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;text-align:center;padding:10px;\\'>${safeTitle}</div>'">`
            : `<div class="manga-placeholder" style="background-color:${manga.color || '#666'};width:150px;height:225px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;text-align:center;padding:10px;">${safeTitle}</div>`;

        mangaItem.innerHTML = `
            <div class="fav-card-cover">
                ${imageHtml}
            </div>
            <div class="fav-card-body">
                <div class="fav-card-titlerow">
                    <h3 class="fav-title"></h3>
                </div>
                <a class="fav-author-link" data-act="author"></a>
            </div>
        `;

        // テキストは textContent で安全に挿入
        mangaItem.querySelector('.fav-title').textContent = manga.title || '';
        const authorEl = mangaItem.querySelector('.fav-author-link');
        if (manga.author) {
            authorEl.textContent = manga.author;
        } else {
            authorEl.style.display = 'none';
        }

        const goDetail = () => {
            if (manga.isbn) {
                window.location.href = `detail.html?isbn=${manga.isbn}&title=${encodeURIComponent(manga.title)}`;
            } else {
                window.location.href = `detail.html?id=${manga.id}`;
            }
        };

        mangaItem.addEventListener('click', (e) => {
            const actEl = e.target.closest('[data-act]');
            const act = actEl ? actEl.dataset.act : null;
            if (act === 'remove') {
                e.stopPropagation();
                unfollowManga(manga.id, manga.isbn);
            } else if (act === 'author') {
                e.stopPropagation();
                if (manga.author) window.location.href = 'author.html?name=' + encodeURIComponent(manga.author);
            } else {
                goDetail();
            }
        });

        grid.appendChild(mangaItem);
    });
}

// フォローを解除
function unfollowManga(mangaId, isbn) {
    let followedManga = getFollowedManga();
    followedManga = followedManga.filter(m => {
        if (isbn && m.isbn) return m.isbn !== isbn;
        return m.id !== mangaId;
    });
    localStorage.setItem('followedManga', JSON.stringify(followedManga));
    displayFollowedManga();
}

// ページ読み込み時に実行
window.addEventListener('DOMContentLoaded', displayFollowedManga);
