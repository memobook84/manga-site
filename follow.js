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
            ${imageHtml}
            <div class="manga-info">
                <h3>${manga.title}</h3>
                <p class="author">${manga.author}</p>
            </div>
        `;

        mangaItem.addEventListener('click', () => {
            if (manga.isbn) {
                window.location.href = `detail.html?isbn=${manga.isbn}&title=${encodeURIComponent(manga.title)}`;
            } else {
                window.location.href = `detail.html?id=${manga.id}`;
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
