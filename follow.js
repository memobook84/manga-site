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

    followedManga.forEach(manga => {
        const mangaItem = document.createElement('div');
        mangaItem.className = 'followed-manga-item';

        // 実画像またはプレースホルダー
        let imageHtml;
        if (manga.imageUrl) {
            imageHtml = `<img src="${manga.imageUrl}" alt="${manga.title}"
                          style="width:100%;height:320px;object-fit:contain;background:#f5f3f0;"
                          onerror="this.parentElement.innerHTML='<div class=\\'manga-placeholder\\' style=\\'background-color:${manga.color || '#666'};height:280px;\\'><span class=\\'manga-placeholder-text\\'>${manga.title}</span></div>'"
                          loading="lazy">`;
        } else {
            imageHtml = `<div class="manga-placeholder" style="background-color: ${manga.color || '#666'}; height: 280px;">
                <span class="manga-placeholder-text">${manga.title}</span>
            </div>`;
        }

        mangaItem.innerHTML = `
            <button class="unfollow-button" data-id="${manga.id}" aria-label="フォロー解除">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
            </button>
            ${imageHtml}
            <div class="manga-info">
                <h3>${manga.title}</h3>
                <p class="author">${manga.author}</p>
            </div>
        `;

        mangaItem.addEventListener('click', (e) => {
            if (!e.target.closest('.unfollow-button')) {
                if (manga.isbn) {
                    window.location.href = `detail.html?isbn=${manga.isbn}&title=${encodeURIComponent(manga.title)}`;
                } else {
                    window.location.href = `detail.html?id=${manga.id}`;
                }
            }
        });

        const unfollowButton = mangaItem.querySelector('.unfollow-button');
        unfollowButton.addEventListener('click', (e) => {
            e.stopPropagation();
            unfollowManga(manga.id, manga.isbn);
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
