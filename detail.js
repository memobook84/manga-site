// URLパラメータを取得
function getDetailParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        title: params.get('title') ? decodeURIComponent(params.get('title')) : null,
    };
}

// タイトルから巻数を抽出
function extractVolumeNumber(title) {
    if (!title) return null;
    // "ONE PIECE 114" → 114
    let m = title.match(/[\s　]+(\d+)$/);
    if (m) return parseInt(m[1]);
    // "名探偵コナン（108）" → 108
    m = title.match(/[（(](\d+)[）)]$/);
    if (m) return parseInt(m[1]);
    // "xxx 第3巻" → 3
    m = title.match(/第(\d+)巻?$/);
    if (m) return parseInt(m[1]);
    // "xxx 3巻" → 3
    m = title.match(/(\d+)巻$/);
    if (m) return parseInt(m[1]);
    return null;
}

// 漫画の詳細を表示（メイン処理 — シリーズページ）
async function displayMangaDetail() {
    const { title } = getDetailParams();

    if (!title) {
        document.getElementById('manga-title').textContent = '漫画が見つかりません';
        return;
    }

    // タイトルで全巻を検索
    let allVolumes = [];
    try {
        const response = await fetch(`/api/search?keyword=${encodeURIComponent(title)}&hits=30`);
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        const adapted = adaptApiResponse(data);
        allVolumes = adapted.items;
    } catch (err) {
        console.warn('シリーズ検索失敗:', err);
        document.getElementById('manga-title').textContent = '漫画が見つかりません';
        return;
    }

    if (allVolumes.length === 0) {
        document.getElementById('manga-title').textContent = '漫画が見つかりません';
        return;
    }

    // シリーズ名でフィルタリング（関連ない作品を除外）
    const seriesName = extractSeriesName(title);
    const filtered = allVolumes.filter(v => {
        const vSeries = extractSeriesName(v.title);
        return vSeries === seriesName;
    });
    const volumes = filtered.length > 0 ? filtered : allVolumes;

    // --- シリーズ情報を集約 ---

    // タイトル
    const displaySeriesName = seriesName || title;
    document.title = `${displaySeriesName} - THE MANGA STORE`;
    document.getElementById('manga-title').textContent = displaySeriesName;

    // 著者・出版社・レーベル: 最初の巻から取得
    const firstVol = volumes[0];
    const authorContainer = document.getElementById('manga-author');
    const authorStr = firstVol.author || '-';
    const authors = authorStr.split(/[\/／、,]/).map(a => a.trim()).filter(a => a);
    if (authors.length > 0 && authorStr !== '-') {
        authorContainer.innerHTML = authors.map((name, i) => {
            const link = `<a href="author.html?name=${encodeURIComponent(name)}" class="author-link">${name}</a>`;
            return (i < authors.length - 1) ? link + ' / ' : link;
        }).join('');
    } else {
        authorContainer.textContent = '-';
    }

    document.getElementById('manga-publisher').textContent = firstVol.publisher || '-';
    document.getElementById('manga-label').textContent = firstVol.label || firstVol.seriesName || '-';
    document.getElementById('manga-genre').textContent = firstVol.genre || '-';

    // 巻数表示
    document.getElementById('manga-date').textContent = `${volumes.length}巻`;

    // あらすじ: descriptionが空でない最初の巻から取得
    const withDescription = volumes.find(v => v.description && v.description.trim() !== '');
    document.getElementById('manga-description').textContent =
        (withDescription ? withDescription.description : '') || 'ストーリー情報がありません。';

    // 表紙画像: 実カバーがある巻から選択（最新巻除外）
    const sortedByDate = [...volumes].sort((a, b) => {
        const dateA = a.firstReleaseDate || '';
        const dateB = b.firstReleaseDate || '';
        return dateB.localeCompare(dateA);
    });
    const nonLatest = sortedByDate.length > 1 ? sortedByDate.slice(1) : sortedByDate;
    const withCover = nonLatest.filter(v => v.hasRealCover);
    const coverPool = withCover.length > 0 ? withCover : nonLatest;
    const coverVol = coverPool[Math.floor(Math.random() * coverPool.length)];

    const imageContainer = document.querySelector('.detail-image');
    const followButtonEl = document.getElementById('follow-button');
    imageContainer.innerHTML = createDetailImageElement({
        ...coverVol,
        title: displaySeriesName,
    });
    if (followButtonEl) {
        imageContainer.appendChild(followButtonEl);
    }

    // フォローボタンの設定
    setupFollowButton({
        ...firstVol,
        title: displaySeriesName,
    });

    // SEO: 動的にmeta/OGPを更新
    const seoDesc = `${displaySeriesName}（${authorStr}）のあらすじ・巻一覧。${(withDescription ? withDescription.description : '').substring(0, 80)}`;
    updateSEOMeta({
        title: `${displaySeriesName} - Book Store`,
        description: seoDesc,
        image: coverVol.imageUrl || 'https://manga-site-three.vercel.app/icon-512.png',
    });

    // --- 巻一覧を表示 ---
    displayVolumesList(volumes);

    // 表紙がない画像をGoogle Books APIでアップグレード
    upgradeCovers();
}

// 巻一覧を表示（巻数でソート、volume.htmlへリンク）
function displayVolumesList(volumes) {
    const volumesGrid = document.getElementById('volumes-grid');
    volumesGrid.innerHTML = '';

    if (volumes.length === 0) {
        volumesGrid.innerHTML = '<p style="text-align:center;grid-column:1/-1;padding:20px;color:var(--color-text-sub);">巻情報が見つかりませんでした</p>';
        return;
    }

    // 巻数を抽出してソート
    const withVolNum = volumes.map(vol => ({
        ...vol,
        volumeNum: extractVolumeNumber(vol.title),
    }));

    withVolNum.sort((a, b) => {
        if (a.volumeNum !== null && b.volumeNum !== null) return a.volumeNum - b.volumeNum;
        if (a.volumeNum !== null) return -1;
        if (b.volumeNum !== null) return 1;
        return (a.title || '').localeCompare(b.title || '');
    });

    withVolNum.forEach(vol => {
        const volumeItem = document.createElement('div');
        volumeItem.className = 'volume-item';

        const imageHtml = createImageElement(vol, 280);
        const volumeLabel = vol.volumeNum !== null ? `${vol.volumeNum}巻` : vol.title;

        volumeItem.innerHTML = `
            ${imageHtml}
            <div class="volume-info">
                <div class="volume-number">${volumeLabel}</div>
                <div class="volume-date">${vol.firstReleaseDate || ''}</div>
            </div>
        `;

        volumeItem.addEventListener('click', () => {
            if (vol.isbn) {
                const seriesName = extractSeriesName(vol.title) || '';
                window.location.href = `volume.html?isbn=${vol.isbn}&title=${encodeURIComponent(vol.title)}&series=${encodeURIComponent(seriesName)}`;
            }
        });

        volumesGrid.appendChild(volumeItem);
    });
}

// フォロー機能
function setupFollowButton(manga) {
    const followButton = document.getElementById('follow-button');
    const followedManga = getFollowedManga();

    const isFollowed = followedManga.some(m => m.title === manga.title);
    if (isFollowed) {
        followButton.classList.add('followed');
    }
    updateFollowButtonText(followButton);

    followButton.addEventListener('click', () => {
        toggleFollow(manga, followButton);
    });
}

function updateFollowButtonText(button) {
    const textEl = button.querySelector('.follow-button-text');
    if (textEl) {
        textEl.textContent = button.classList.contains('followed') ? 'フォロー中' : 'フォロー';
    }
}

function toggleFollow(manga, button) {
    let followedManga = getFollowedManga();
    const index = followedManga.findIndex(m => m.title === manga.title);

    if (index > -1) {
        followedManga.splice(index, 1);
        button.classList.remove('followed');
    } else {
        followedManga.push({
            id: manga.id || manga.isbn,
            isbn: manga.isbn || '',
            title: manga.title,
            author: manga.author,
            imageUrl: manga.imageUrl || '',
            color: manga.color || '#666',
        });
        button.classList.add('followed');
    }

    updateFollowButtonText(button);
    localStorage.setItem('followedManga', JSON.stringify(followedManga));
}

function getFollowedManga() {
    const stored = localStorage.getItem('followedManga');
    return stored ? JSON.parse(stored) : [];
}

// SEO: meta description / OGPタグを動的に更新
function updateSEOMeta(info) {
    const desc = info.description || '';
    const title = info.title || '';
    const image = info.image || 'https://manga-site-three.vercel.app/icon-512.png';
    const url = window.location.href;

    document.querySelector('meta[name="description"]').setAttribute('content', desc);
    document.querySelector('meta[property="og:title"]').setAttribute('content', title);
    document.querySelector('meta[property="og:description"]').setAttribute('content', desc);
    document.querySelector('meta[property="og:image"]').setAttribute('content', image);
    document.querySelector('meta[property="og:url"]').setAttribute('content', url);
    document.querySelector('meta[name="twitter:title"]').setAttribute('content', title);
    document.querySelector('meta[name="twitter:description"]').setAttribute('content', desc);
    document.querySelector('meta[name="twitter:image"]').setAttribute('content', image);
}

// ページ読み込み時に実行
window.addEventListener('DOMContentLoaded', displayMangaDetail);
