// URLパラメータを取得
function getVolumeParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        seriesId: params.get('seriesId') ? parseInt(params.get('seriesId')) : null,
        volumeNum: params.get('volumeNum') ? parseInt(params.get('volumeNum')) : null,
        isbn: params.get('isbn') || null,
        title: params.get('title') ? decodeURIComponent(params.get('title')) : null,
        series: params.get('series') ? decodeURIComponent(params.get('series')) : null,
    };
}

// タイトルから巻数を抽出
function extractVolumeNum(title) {
    if (!title) return null;
    let m = title.match(/[\s\u3000]+(\d+)$/);
    if (m) return parseInt(m[1]);
    m = title.match(/[（(](\d+)[）)]$/);
    if (m) return parseInt(m[1]);
    m = title.match(/第(\d+)巻?$/);
    if (m) return parseInt(m[1]);
    m = title.match(/(\d+)巻$/);
    if (m) return parseInt(m[1]);
    return null;
}

// 巻の詳細を表示（メイン処理）
async function displayVolumeDetail() {
    const { seriesId, volumeNum, isbn, title, series } = getVolumeParams();

    let volume = null;

    // APIから取得を試みる
    if (isbn) {
        volume = await fetchVolumeByIsbn(isbn);
    } else if (title) {
        volume = await fetchVolumeByTitle(title);
    }

    // APIで取得できなかった場合、ローカルデータベースからフォールバック
    if (!volume && seriesId !== null) {
        const manga = mangaDatabase.find(m => m.id === seriesId);
        if (manga) {
            const vNum = volumeNum || 1;
            volume = buildLocalVolume(manga, vNum);
        }
    }

    if (!volume) {
        document.getElementById('volume-title').textContent = '作品が見つかりません';
        return;
    }

    // ページタイトルを更新
    document.title = `${volume.title} - THE MANGA STORE`;

    // 画像を表示（スワイプ矢印・購入ボタンを保持）
    const volumeImageContainer = document.querySelector('.volume-image');
    const arrows = volumeImageContainer.querySelectorAll('.swipe-arrow');
    const buyBtn = document.getElementById('buy-amazon');
    volumeImageContainer.innerHTML = createDetailImageElement(volume);
    arrows.forEach(arrow => volumeImageContainer.appendChild(arrow));
    if (buyBtn) volumeImageContainer.appendChild(buyBtn);

    document.getElementById('volume-title').textContent = volume.title;
    document.getElementById('volume-number').textContent = volume.volumeLabel || '';

    // 著者名をリンクとして設定
    const authorLink = document.getElementById('volume-author');
    authorLink.textContent = volume.author;
    authorLink.href = `author.html?name=${encodeURIComponent(volume.author)}`;

    document.getElementById('volume-publisher').textContent = volume.publisher || '-';
    document.getElementById('volume-label').textContent = volume.label || volume.seriesName || '-';
    document.getElementById('volume-genre').textContent = volume.genre || '-';
    document.getElementById('volume-date').textContent = volume.firstReleaseDate || '-';
    document.getElementById('volume-price').textContent = volume.price || '-';
    document.getElementById('volume-isbn').textContent = volume.isbn || '-';
    document.getElementById('volume-synopsis').textContent = volume.description || 'この巻の情報はありません。';

    // SEO: 動的にmeta/OGPを更新
    const seoDesc = `${volume.title}（${volume.author}）。${(volume.description || '').substring(0, 80)}`;
    updateSEOMeta({
        title: `${volume.title} - ATLAS COMIC`,
        description: seoDesc,
        image: volume.imageUrl || 'https://manga-site-three.vercel.app/icon-512.png',
    });

    // 購入ボタンのリンクを設定
    document.getElementById('buy-amazon').href = getAmazonBuyUrl(volume);

    // 作品ページに戻るリンクを設定
    const seriesName = series || extractSeriesName(volume.title) || volume.title;
    document.getElementById('back-to-series').href = `detail.html?title=${encodeURIComponent(seriesName)}`;

    // 前後巻ナビゲーションを設定
    setupVolumeSlider(seriesName, isbn, title);
}

// シリーズの全巻を取得して前後ナビゲーションを構築
async function setupVolumeSlider(seriesName, currentIsbn, currentTitle) {
    if (!seriesName) return;

    let allVolumes = [];
    try {
        let page = 1;
        while (true) {
            const data = await cachedFetch(`/api/search?keyword=${encodeURIComponent(seriesName)}&hits=30&page=${page}`);
            const adapted = adaptApiResponse(data);
            allVolumes = allVolumes.concat(adapted.items);
            if (page >= (data.pageCount || 1) || page >= 5) break;
            page++;
            await new Promise(r => setTimeout(r, 400));
        }
    } catch (err) {
        console.warn('シリーズ取得失敗:', err);
        return;
    }

    // シリーズ名でフィルタリング
    const filtered = allVolumes.filter(v => {
        const vSeries = extractSeriesName(v.title);
        return vSeries === seriesName;
    });
    const volumes = filtered.length > 0 ? filtered : allVolumes;

    // 巻数を抽出してソート（シリーズ一覧用に1巻でも処理）
    const withVolNum = volumes.map(vol => ({
        ...vol,
        volNum: extractVolumeNum(vol.title),
    }));

    withVolNum.sort((a, b) => {
        if (a.volNum !== null && b.volNum !== null) return a.volNum - b.volNum;
        if (a.volNum !== null) return -1;
        if (b.volNum !== null) return 1;
        return (a.title || '').localeCompare(b.title || '');
    });

    // 現在の巻を特定
    let currentIndex = -1;
    if (currentIsbn) {
        currentIndex = withVolNum.findIndex(v => v.isbn === currentIsbn);
    }
    if (currentIndex === -1 && currentTitle) {
        currentIndex = withVolNum.findIndex(v => v.title === currentTitle);
    }
    if (currentIndex === -1) return;

    // シリーズ一覧を描画
    renderSeriesList(withVolNum, currentIndex, seriesName);

    // PC用前後ナビ
    const pcNavWrap = document.querySelector('.pc-nav-arrows');
    const pcPrev = document.getElementById('pc-prev-volume');
    const pcNext = document.getElementById('pc-next-volume');
    if (pcNavWrap) pcNavWrap.style.display = 'flex';
    if (pcPrev) {
        pcPrev.disabled = currentIndex === 0;
        pcPrev.addEventListener('click', () => {
            if (currentIndex > 0) navigateToVolume(withVolNum[currentIndex - 1], seriesName);
        });
    }
    if (pcNext) {
        pcNext.disabled = currentIndex === withVolNum.length - 1;
        pcNext.addEventListener('click', () => {
            if (currentIndex < withVolNum.length - 1) navigateToVolume(withVolNum[currentIndex + 1], seriesName);
        });
    }

    if (withVolNum.length <= 1) return;

    // スライダーUIを表示
    const slider = document.getElementById('volume-slider');
    slider.style.display = 'flex';

    const prevBtn = document.getElementById('prev-volume');
    const nextBtn = document.getElementById('next-volume');
    const prevLabel = document.getElementById('prev-label');
    const nextLabel = document.getElementById('next-label');
    const positionLabel = document.getElementById('volume-position');

    // 位置表示
    const currentVol = withVolNum[currentIndex];
    const currentNum = currentVol.volNum;
    positionLabel.textContent = currentNum !== null
        ? `${currentNum} / ${withVolNum.length}巻`
        : `${currentIndex + 1} / ${withVolNum.length}`;

    // 前の巻
    if (currentIndex > 0) {
        const prev = withVolNum[currentIndex - 1];
        prevBtn.disabled = false;
        prevLabel.textContent = prev.volNum !== null ? `${prev.volNum}巻` : '前の巻';
        prevBtn.addEventListener('click', () => {
            navigateToVolume(prev, seriesName);
        });
    }

    // 次の巻
    if (currentIndex < withVolNum.length - 1) {
        const next = withVolNum[currentIndex + 1];
        nextBtn.disabled = false;
        nextLabel.textContent = next.volNum !== null ? `${next.volNum}巻` : '次の巻';
        nextBtn.addEventListener('click', () => {
            navigateToVolume(next, seriesName);
        });
    }

    // スワイプナビゲーション（スライド演出付き）
    const pageEl = document.querySelector('.volume-main');
    let touchStartX = 0;
    let touchStartY = 0;
    let tracking = false;
    let swiping = false;

    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < withVolNum.length - 1;

    // スワイプ矢印：前後の巻がない方向は非表示
    const arrowPrev = document.getElementById('swipe-arrow-prev');
    const arrowNext = document.getElementById('swipe-arrow-next');
    if (!hasPrev && arrowPrev) arrowPrev.classList.add('swipe-hidden');
    if (!hasNext && arrowNext) arrowNext.classList.add('swipe-hidden');

    let lastTouchX = 0;
    let lastTouchTime = 0;
    let velocityX = 0;

    // ページ入場アニメーション
    const swipeDir = sessionStorage.getItem('swipeDir');
    if (swipeDir) {
        sessionStorage.removeItem('swipeDir');
        const fromX = swipeDir === 'next' ? window.innerWidth : -window.innerWidth;
        pageEl.style.transition = 'none';
        pageEl.style.transform = `translateX(${fromX}px)`;
        pageEl.style.opacity = '0';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                pageEl.style.transition = 'transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.32s ease';
                pageEl.style.transform = '';
                pageEl.style.opacity = '';
            });
        });
    }

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        lastTouchX = touchStartX;
        lastTouchTime = Date.now();
        velocityX = 0;
        tracking = true;
        swiping = false;
        pageEl.style.transition = 'none';
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;

        if (!swiping && Math.abs(dx) > 8) {
            if (Math.abs(dy) > Math.abs(dx) * 1.2) {
                tracking = false;
                return;
            }
            swiping = true;
        }
        if (!swiping) return;

        e.preventDefault();

        const now = Date.now();
        const dt = now - lastTouchTime;
        if (dt > 0) velocityX = (e.touches[0].clientX - lastTouchX) / dt;
        lastTouchX = e.touches[0].clientX;
        lastTouchTime = now;

        let move = dx;
        if ((dx > 0 && !hasPrev) || (dx < 0 && !hasNext)) {
            move = dx * 0.2;
        }
        pageEl.style.transform = `translateX(${move}px)`;
        pageEl.style.opacity = Math.max(0.4, 1 - Math.abs(move) / window.innerWidth * 0.6);
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;

        const dx = e.changedTouches[0].clientX - touchStartX;
        const isFlick = Math.abs(velocityX) > 0.4;
        const shouldNavigate = swiping && (Math.abs(dx) > 60 || isFlick);

        const ease = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

        if (shouldNavigate && dx < 0 && hasNext) {
            pageEl.style.transition = `transform 0.28s ${ease}, opacity 0.28s ease`;
            pageEl.style.transform = `translateX(${-window.innerWidth}px)`;
            pageEl.style.opacity = '0';
            sessionStorage.setItem('swipeDir', 'next');
            setTimeout(() => navigateToVolume(withVolNum[currentIndex + 1], seriesName), 250);
        } else if (shouldNavigate && dx > 0 && hasPrev) {
            pageEl.style.transition = `transform 0.28s ${ease}, opacity 0.28s ease`;
            pageEl.style.transform = `translateX(${window.innerWidth}px)`;
            pageEl.style.opacity = '0';
            sessionStorage.setItem('swipeDir', 'prev');
            setTimeout(() => navigateToVolume(withVolNum[currentIndex - 1], seriesName), 250);
        } else {
            pageEl.style.transition = `transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease`;
            pageEl.style.transform = '';
            pageEl.style.opacity = '';
        }
        swiping = false;
    }, { passive: true });
}

// 指定した巻のページに遷移
function navigateToVolume(vol, seriesName) {
    const params = new URLSearchParams();
    if (vol.isbn) params.set('isbn', vol.isbn);
    params.set('title', vol.title);
    if (seriesName) params.set('series', seriesName);
    window.location.href = `volume.html?${params.toString()}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const m = dateStr.match(/(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})/);
    if (!m) return dateStr;
    return `${m[1]}/${String(m[2]).padStart(2,'0')}/${String(m[3]).padStart(2,'0')}`;
}

function renderSeriesList(volumes, currentIndex, seriesName) {
    const section = document.getElementById('series-list-section');
    const grid = document.getElementById('series-list-grid');
    if (!section || !grid) return;

    grid.innerHTML = '';
    volumes.forEach((vol, i) => {
        const item = document.createElement('div');
        item.className = 'volume-item' + (i === currentIndex ? ' current-volume' : '');

        const imageHtml = createImageElement(vol, 280);
        const volLabel = vol.volNum !== null ? `${vol.volNum}巻` : vol.title;

        item.innerHTML = `
            ${imageHtml}
            <div class="volume-info">
                <div class="volume-number">${volLabel}</div>
                <div class="volume-date">${formatDate(vol.firstReleaseDate)}</div>
            </div>
        `;

        if (i !== currentIndex) {
            item.addEventListener('click', () => navigateToVolume(vol, seriesName));
        }

        grid.appendChild(item);
    });

    section.style.display = 'block';
}

// ISBNでAPIから取得
async function fetchVolumeByIsbn(isbn) {
    try {
        const data = await cachedFetch(`/api/books?isbn=${isbn}`);
        const adapted = adaptApiResponse(data);
        return adapted.items[0] || null;
    } catch (err) {
        console.warn('ISBN検索失敗:', err);
        return null;
    }
}

// タイトルでAPIから取得
async function fetchVolumeByTitle(title) {
    try {
        const data = await cachedFetch(`/api/search?keyword=${encodeURIComponent(title)}&hits=1`);
        const adapted = adaptApiResponse(data);
        return adapted.items[0] || null;
    } catch (err) {
        console.warn('タイトル検索失敗:', err);
        return null;
    }
}

// ローカルデータからボリューム情報を構築（フォールバック）
function buildLocalVolume(manga, volumeNum) {
    const dateMatch = (manga.firstReleaseDate || '').match(/(\d+)年(\d+)月/);
    const startYear = dateMatch ? parseInt(dateMatch[1]) : 2020;
    const startMonth = dateMatch ? parseInt(dateMatch[2]) : 1;

    const monthsElapsed = (volumeNum - 1) * 3;
    const year = startYear + Math.floor((startMonth - 1 + monthsElapsed) / 12);
    const month = ((startMonth - 1 + monthsElapsed) % 12) + 1;

    const basePrice = 440;
    const variation = (volumeNum % 3) * 20;

    return {
        id: manga.id,
        title: manga.title,
        volumeLabel: `${volumeNum}巻`,
        author: manga.author,
        publisher: manga.publisher,
        label: manga.label,
        seriesName: manga.label || '',
        genre: manga.genre,
        firstReleaseDate: `${year}年${month}月`,
        description: `${manga.title}の第${volumeNum}巻。`,
        imageUrl: '',
        price: `¥${basePrice + variation}（税込）`,
        priceRaw: basePrice + variation,
        isbn: '',
        itemUrl: '',
        color: manga.color,
    };
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
window.addEventListener('DOMContentLoaded', displayVolumeDetail);
