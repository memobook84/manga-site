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

    // タイトルで全巻を検索（複数ページ対応）
    let allVolumes = [];
    try {
        let page = 1;
        while (true) {
            const data = await cachedFetch(`/api/search?keyword=${encodeURIComponent(title)}&hits=30&page=${page}`);
            const adapted = adaptApiResponse(data);
            allVolumes = allVolumes.concat(adapted.items);
            if (page >= (data.pageCount || 1) || page >= 5) break;
            page++;
            await new Promise(r => setTimeout(r, 400));
        }
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
    const frame = imageContainer.querySelector('.detail-cover-frame');
    const badge = imageContainer.querySelector('.detail-image-badge');
    const imageHtml = createDetailImageElement({
        ...coverVol,
        title: displaySeriesName,
    });
    if (frame) {
        frame.innerHTML = imageHtml;
        if (badge) frame.appendChild(badge);
    }

    // シリーズ別の動画リンク（正規化: 記号・スペースを除去して比較）
    const normalize = (s) => (s || '').toLowerCase().replace(/[\s　×x*✕✖_\-－―]/g, '');
    const videoLinks = [
        { match: 'spyfamily', url: 'https://www.youtube.com/watch?v=U_rWZK_8vUY' },
        { match: 'スパイファミリー', url: 'https://www.youtube.com/watch?v=U_rWZK_8vUY' },
    ];
    if (badge) {
        const key = normalize(displaySeriesName);
        const hit = videoLinks.find(v => normalize(v.match) === key);
        if (hit) {
            badge.dataset.videoUrl = hit.url;
            badge.hidden = false;
            badge.onclick = () => openVideoModal(hit.url);
        } else {
            badge.hidden = true;
            badge.onclick = null;
        }
    }

    // フォローボタンの設定
    setupFollowButton({
        ...firstVol,
        title: displaySeriesName,
    });

    // SEO: 動的にmeta/OGPを更新
    const seoDesc = `${displaySeriesName}（${authorStr}）のあらすじ・巻一覧。${(withDescription ? withDescription.description : '').substring(0, 80)}`;
    updateSEOMeta({
        title: `${displaySeriesName} - ATLAS COMIC`,
        description: seoDesc,
        image: coverVol.imageUrl || 'https://manga-site-three.vercel.app/icon-512.png',
    });

    // --- 巻一覧を表示 ---
    const sortedVolumes = displayVolumesList(volumes);

    // カートボタンの設定
    setupCartButtons(sortedVolumes, displaySeriesName);

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
        const formatDate = (d) => {
            if (!d) return '';
            const m = d.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
            return m ? `${m[1]}/${parseInt(m[2],10)}/${parseInt(m[3],10)}` : d;
        };

        volumeItem.innerHTML = `
            ${imageHtml}
            <div class="volume-info">
                <div class="volume-number">${volumeLabel}</div>
                <div class="volume-date">${formatDate(vol.firstReleaseDate)}</div>
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

    return withVolNum;
}

// ISBN-13 → ASIN(ISBN-10) 変換（978始まりのみ）
function isbn13ToAsin(isbn13) {
    if (!isbn13) return null;
    const s = String(isbn13).replace(/[^0-9X]/gi, '');
    if (s.length === 10) return s;
    if (s.length !== 13 || !s.startsWith('978')) return null;
    const core = s.substring(3, 12);
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(core[i], 10) * (10 - i);
    const check = (11 - (sum % 11)) % 11;
    return core + (check === 10 ? 'X' : String(check));
}

// Amazon カート追加URL生成
function buildAmazonCartUrl(volumes) {
    const tag = 'atlascomic-22';
    const params = [`AssociateTag=${tag}`];
    let idx = 1;
    for (const v of volumes) {
        const asin = isbn13ToAsin(v.isbn);
        if (!asin) continue;
        params.push(`ASIN.${idx}=${asin}`);
        params.push(`Quantity.${idx}=1`);
        idx++;
        if (idx > 10) break; // Amazonの上限
    }
    if (idx === 1) return null;
    return `https://www.amazon.co.jp/gp/aws/cart/add.html?${params.join('&')}`;
}

function openAmazonCart(volumes, label) {
    const url = buildAmazonCartUrl(volumes);
    if (!url) {
        alert('カートに入れられる巻が見つかりませんでした。');
        return;
    }
    window.open(url, '_blank', 'noopener');
}

function setupCartButtons(sortedVolumes, seriesName) {
    const toggleBtn = document.getElementById('cart-toggle-btn');
    const actions = document.getElementById('volumes-actions');
    const allBtn = document.getElementById('cart-all-btn');
    const rangeBtn = document.getElementById('cart-range-btn');

    if (toggleBtn && actions) {
        toggleBtn.onclick = () => {
            const open = actions.hasAttribute('hidden');
            if (open) {
                actions.removeAttribute('hidden');
                toggleBtn.setAttribute('aria-expanded', 'true');
            } else {
                actions.setAttribute('hidden', '');
                toggleBtn.setAttribute('aria-expanded', 'false');
            }
        };
    }
    const modal = document.getElementById('range-modal');
    const closeBtn = document.getElementById('range-modal-close');
    const fromInput = document.getElementById('range-from');
    const toInput = document.getElementById('range-to');
    const submitBtn = document.getElementById('range-submit');
    const sub = document.getElementById('range-modal-sub');

    const numbered = sortedVolumes.filter(v => v.volumeNum !== null && v.isbn);
    const minVol = numbered.length ? numbered[0].volumeNum : 1;
    const maxVol = numbered.length ? numbered[numbered.length - 1].volumeNum : 1;

    if (allBtn) {
        allBtn.onclick = () => openAmazonCart(sortedVolumes.filter(v => v.isbn), seriesName);
    }

    if (rangeBtn && modal && fromInput && toInput) {
        rangeBtn.onclick = () => {
            fromInput.min = minVol;
            fromInput.max = maxVol;
            toInput.min = minVol;
            toInput.max = maxVol;
            fromInput.value = minVol;
            toInput.value = maxVol;
            if (sub) sub.textContent = `${seriesName}（${minVol}〜${maxVol}巻）`;
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        };
    }

    function closeRangeModal() {
        if (!modal) return;
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (closeBtn) closeBtn.onclick = closeRangeModal;
    if (modal) modal.onclick = (e) => { if (e.target === modal) closeRangeModal(); };

    if (submitBtn) {
        submitBtn.onclick = () => {
            const from = parseInt(fromInput.value, 10);
            const to = parseInt(toInput.value, 10);
            if (isNaN(from) || isNaN(to) || from > to) {
                alert('正しい範囲を入力してください。');
                return;
            }
            const picked = numbered.filter(v => v.volumeNum >= from && v.volumeNum <= to);
            if (picked.length === 0) {
                alert('指定範囲に該当する巻がありません。');
                return;
            }
            openAmazonCart(picked, seriesName);
            closeRangeModal();
        };
    }
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
        textEl.textContent = button.classList.contains('followed') ? 'Favorited' : 'Favorite';
    }
    const iconEl = button.querySelector('.follow-icon');
    if (iconEl) {
        if (button.classList.contains('followed')) {
            iconEl.classList.remove('ph-bold');
            iconEl.classList.add('ph-fill');
        } else {
            iconEl.classList.remove('ph-fill');
            iconEl.classList.add('ph-bold');
        }
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

// YouTube動画モーダル
function extractYouTubeId(url) {
    if (!url) return '';
    const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
    return m ? m[1] : '';
}

function openVideoModal(url) {
    const modal = document.getElementById('video-modal');
    const iframe = document.getElementById('video-modal-iframe');
    const id = extractYouTubeId(url);
    if (!modal || !iframe || !id) return;
    iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeVideoModal() {
    const modal = document.getElementById('video-modal');
    const iframe = document.getElementById('video-modal-iframe');
    if (!modal || !iframe) return;
    iframe.src = '';
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

window.addEventListener('DOMContentLoaded', () => {
    displayMangaDetail();
    const modal = document.getElementById('video-modal');
    const closeBtn = document.getElementById('video-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeVideoModal);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeVideoModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closeVideoModal();
        const rangeModal = document.getElementById('range-modal');
        if (rangeModal && rangeModal.classList.contains('active')) {
            rangeModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
});
