// フォローした作品を取得
function getFollowedManga() {
    const stored = localStorage.getItem('followedManga');
    return stored ? JSON.parse(stored) : [];
}


// 楽天が「書影準備中」に返すテンプレート画像（ISBN名の .gif）。
// 中身は書名を並べただけの版面なので表紙としては使えない。
// rakuten-adapter.js の isRakutenNoCover と同じ判定（このページは adapter を読み込まない）
function isTemplateCover(url) {
    if (!url) return false;
    const filename = String(url).split('?')[0].split('/').pop();
    return /^\d{10,13}\.gif$/i.test(filename);
}

// 巻の一覧から、実際に表紙が出せる最初の巻の書影を返す。
// 一覧は巻順に並んでいるので、たいてい1巻の表紙になる
function pickVolumeCover(volumes) {
    if (!Array.isArray(volumes)) return null;
    const hit = volumes.find((v) =>
        v && v.imageUrl && v.hasRealCover !== false && !isTemplateCover(v.imageUrl)
    );
    return hit ? hit.imageUrl : null;
}

// 登録した巻の書影が使えなかったときは、同じ作品の他の巻から表紙を借りる。
// まず焼いてある巻データ（data/series）を見て、無ければ検索APIに聞く
async function findSeriesCover(manga) {
    const title = manga.title || '';
    if (!title) return null;

    try {
        if (typeof loadSeriesVolumes === 'function') {
            const cover = pickVolumeCover(await loadSeriesVolumes(title));
            if (cover) return cover;
        }
    } catch {}

    try {
        const name = (typeof extractSeriesName === 'function' && extractSeriesName(title)) || title;
        const resp = await fetch(`/api/search?keyword=${encodeURIComponent(name)}`);
        if (!resp.ok) return null;
        const data = await resp.json();
        return pickVolumeCover(data.items);
    } catch {}

    return null;
}

// 表紙が見つかれば差し替える。見つからなければ白紙のカバーのまま
async function repairFavCover(card, manga, safeTitle) {
    const coverUrl = await findSeriesCover(manga);
    if (!coverUrl) return;
    const frame = card.querySelector('.fav-card-cover');
    if (!frame) return;
    frame.innerHTML = `<img src="${coverUrl}" alt="${safeTitle}" loading="lazy"
                         onerror="favCoverFallback(this)">`;
}

// 表紙が無い（または読み込めなかった）ときの白紙カバー。
// 他ページの .manga-cover-placeholder と同じ見た目にそろえてある
function favPlaceholderHtml() {
    return `<div class="manga-cover-placeholder">
                <div class="cover-spine"></div>
                <span class="cover-mark-text">ATLAS COMIC</span>
            </div>`;
}

function favCoverFallback(img) {
    img.outerHTML = favPlaceholderHtml();
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

    // 保存は追加順（古い順）なので、新しく登録したものが上に来るよう反転して並べる。
    // slice() で複製してから reverse（元の配列は保存順のまま保つ）
    followedManga.slice().reverse().forEach((manga) => {
        const mangaItem = document.createElement('div');
        mangaItem.className = 'followed-manga-item';

        const safeTitle = (manga.title || '').replace(/"/g, '&quot;');
        const hasCover = !!manga.imageUrl && !isTemplateCover(manga.imageUrl);
        const imageHtml = hasCover
            ? `<img src="${manga.imageUrl}" alt="${safeTitle}" loading="lazy"
                 onerror="favCoverFallback(this)">`
            : favPlaceholderHtml();

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

        // 白紙で出した分だけ、あとから同じ作品の他の巻の表紙を探しに行く
        // （ブックマークそのものは消さない）
        if (!hasCover) {
            repairFavCover(mangaItem, manga, safeTitle);
        }
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
