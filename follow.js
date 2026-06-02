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

    followedManga.forEach((manga, idx) => {
        const mangaItem = document.createElement('div');
        mangaItem.className = 'followed-manga-item';

        const imageHtml = manga.imageUrl
            ? `<img src="${manga.imageUrl}" alt="${manga.title}" loading="lazy"
                 onerror="this.outerHTML='<div class=\\'manga-placeholder\\' style=\\'background-color:${manga.color || '#666'};width:100px;height:140px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;text-align:center;padding:6px;\\'>${manga.title}</div>'">`
            : `<div class="manga-placeholder" style="background-color:${manga.color || '#666'};width:100px;height:140px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;text-align:center;padding:6px;">${manga.title}</div>`;

        mangaItem.innerHTML = `
            <div class="fav-rank">
                <div class="fav-rank-num">${idx + 1}</div>
            </div>
            <div class="fav-cover">
                ${imageHtml}
            </div>
            <div class="fav-meta">
                <div class="fav-tag">FAVORITE</div>
                <h3 class="fav-title">${manga.title}</h3>
                <p class="fav-author">BY ${(manga.author || '-').toUpperCase()}</p>
            </div>
            <div class="fav-actions">
                <button class="fav-action" data-act="detail" aria-label="詳細">
                    <i class="ph-bold ph-book-open" style="font-size:16px"></i>
                </button>
                <button class="fav-action danger" data-act="remove" aria-label="削除">
                    <i class="ph-bold ph-x" style="font-size:16px"></i>
                </button>
                <button class="fav-action" data-act="share" aria-label="共有">
                    <i class="ph-bold ph-share-fat" style="font-size:16px"></i>
                </button>
            </div>
            <div class="fav-panel">
                <div class="fav-panel-icon">
                    <i class="ph-fill ph-heart" style="font-size:20px;color:#fff"></i>
                </div>
                <div class="fav-panel-label">FAVORITED</div>
            </div>
        `;

        const goDetail = () => {
            if (manga.isbn) {
                window.location.href = `detail.html?isbn=${manga.isbn}&title=${encodeURIComponent(manga.title)}`;
            } else {
                window.location.href = `detail.html?id=${manga.id}`;
            }
        };

        mangaItem.addEventListener('click', (e) => {
            const btn = e.target.closest('.fav-action');
            if (!btn) { goDetail(); return; }
            e.stopPropagation();
            const act = btn.dataset.act;
            if (act === 'detail') goDetail();
            else if (act === 'remove') unfollowManga(manga.id, manga.isbn);
            else if (act === 'share' && navigator.share) {
                navigator.share({ title: manga.title, url: location.origin + `/detail.html?isbn=${manga.isbn || ''}&title=${encodeURIComponent(manga.title)}` }).catch(()=>{});
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
