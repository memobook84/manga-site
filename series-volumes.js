// 全巻一覧ページ — シリーズの単行本を縦リストで表示

// URLパラメータを取得
function getSeriesParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        title: params.get('title') ? decodeURIComponent(params.get('title')) : null,
    };
}

// タイトルから巻数を抽出（detail.jsと同じロジック）
function extractVolumeNumber(title) {
    if (!title) return null;
    let m = title.match(/[\s　]+(\d+)$/);
    if (m) return parseInt(m[1]);
    m = title.match(/[（(](\d+)[）)]$/);
    if (m) return parseInt(m[1]);
    m = title.match(/第(\d+)巻?$/);
    if (m) return parseInt(m[1]);
    m = title.match(/(\d+)巻$/);
    if (m) return parseInt(m[1]);
    return null;
}

// 全巻リストを表示（メイン処理）
async function displaySeriesVolumes() {
    const { title } = getSeriesParams();
    const listEl = document.getElementById('series-volumes-list');

    if (!title) {
        document.getElementById('sv-series-title').textContent = '作品が見つかりません';
        return;
    }

    listEl.innerHTML = '<p class="sv-message">読み込み中...</p>';

    // タイトルで全巻を検索（detail.jsと同じ取得方法 — キャッシュ済みなら即時）
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
        document.getElementById('sv-series-title').textContent = '作品が見つかりません';
        listEl.innerHTML = '<p class="sv-message">巻情報を取得できませんでした</p>';
        return;
    }

    // シリーズ名でフィルタリング
    const seriesName = extractSeriesName(title);
    const filtered = allVolumes.filter(v => extractSeriesName(v.title) === seriesName);
    const volumes = filtered.length > 0 ? filtered : allVolumes;

    if (volumes.length === 0) {
        document.getElementById('sv-series-title').textContent = '作品が見つかりません';
        listEl.innerHTML = '<p class="sv-message">巻情報が見つかりませんでした</p>';
        return;
    }

    const displaySeriesName = seriesName || title;
    document.title = `${displaySeriesName} 全巻一覧 - ATLAS COMIC`;
    document.getElementById('sv-series-title').textContent = displaySeriesName;
    document.getElementById('sv-volume-count').textContent = `全${volumes.length}巻`;

    // 巻数でソート
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

    // リスト描画
    listEl.innerHTML = '';
    withVolNum.forEach(vol => {
        const item = document.createElement('div');
        item.className = 'series-vol-item';

        const imageHtml = createImageElement(vol, 280);
        const volumeLabel = vol.volumeNum !== null ? `第${vol.volumeNum}巻` : (vol.title || '');

        item.innerHTML = `
            <div class="sv-cover">${imageHtml}</div>
            <div class="sv-meta">
                <h3 class="sv-title">${displaySeriesName}</h3>
                <p class="sv-volume">${volumeLabel}</p>
            </div>
            <div class="sv-chevron"><i class="ph-bold ph-caret-right" style="font-size:18px"></i></div>
        `;

        item.addEventListener('click', () => {
            if (vol.isbn) {
                const sName = extractSeriesName(vol.title) || '';
                window.location.href = `volume.html?isbn=${vol.isbn}&title=${encodeURIComponent(vol.title)}&series=${encodeURIComponent(sName)}`;
            }
        });

        listEl.appendChild(item);
    });

    // 表紙がない画像をGoogle Books APIでアップグレード
    upgradeCovers();
}

// ===== モバイル: ページスライド遷移 =====
// 作品ページから来たときは右からスライドイン、
// 左上の矢印ボタン or 左→右スワイプで右へスライドアウトして作品ページに戻る
function setupSlideNavigation() {
    const pageEl = document.querySelector('.series-volumes-main');
    if (!pageEl) return;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const ease = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

    // bfcache復帰時にスタイルをリセット
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
            leaving = false;
            pageEl.style.transition = 'none';
            pageEl.style.transform = '';
            pageEl.style.opacity = '';
        }
    });

    // 入場アニメーション（右からスライドイン）
    if (isMobile && sessionStorage.getItem('volumesSlideIn')) {
        sessionStorage.removeItem('volumesSlideIn');
        pageEl.style.transition = 'none';
        pageEl.style.transform = `translateX(${window.innerWidth}px)`;
        pageEl.style.opacity = '0';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                pageEl.style.transition = `transform 0.32s ${ease}, opacity 0.32s ease`;
                pageEl.style.transform = '';
                pageEl.style.opacity = '';
            });
        });
    }

    // 退場アニメーション（右へスライドアウトして作品ページに戻る）
    let leaving = false;
    function slideBack() {
        if (leaving) return;
        leaving = true;
        pageEl.style.transition = `transform 0.28s ${ease}, opacity 0.28s ease`;
        pageEl.style.transform = `translateX(${window.innerWidth}px)`;
        pageEl.style.opacity = '0';
        setTimeout(() => {
            if (history.length > 1) {
                history.back();
            } else {
                const { title } = getSeriesParams();
                window.location.href = title ? `detail.html?title=${encodeURIComponent(title)}` : 'database.html';
            }
        }, 250);
    }

    const backBtn = document.getElementById('page-back-btn');
    if (backBtn) backBtn.addEventListener('click', slideBack);

    if (!isMobile) return;

    // 左→右スワイプで戻る
    let touchStartX = 0;
    let touchStartY = 0;
    let tracking = false;
    let swiping = false;
    let lastTouchX = 0;
    let lastTouchTime = 0;
    let velocityX = 0;

    document.addEventListener('touchstart', (e) => {
        if (leaving) { tracking = false; return; }
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        lastTouchX = touchStartX;
        lastTouchTime = Date.now();
        velocityX = 0;
        tracking = true;
        swiping = false;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!tracking || leaving) return;
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;

        if (!swiping) {
            if (Math.abs(dx) <= 8) return;
            // 縦スクロール優勢、または右→左方向はスワイプ対象外
            if (Math.abs(dy) > Math.abs(dx) * 1.2 || dx < 0) {
                tracking = false;
                return;
            }
            swiping = true;
            pageEl.style.transition = 'none';
        }

        const now = Date.now();
        if (now - lastTouchTime > 0) {
            velocityX = (e.touches[0].clientX - lastTouchX) / (now - lastTouchTime);
        }
        lastTouchX = e.touches[0].clientX;
        lastTouchTime = now;

        const move = Math.max(0, dx);
        pageEl.style.transform = `translateX(${move}px)`;
        pageEl.style.opacity = Math.max(0.4, 1 - move / window.innerWidth * 0.6);
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!tracking || leaving) return;
        tracking = false;
        if (!swiping) return;

        const dx = e.changedTouches[0].clientX - touchStartX;
        const isFlick = velocityX > 0.4;

        if (dx > 60 || isFlick) {
            slideBack();
        } else {
            pageEl.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease';
            pageEl.style.transform = '';
            pageEl.style.opacity = '';
        }
    }, { passive: true });
}

window.addEventListener('DOMContentLoaded', () => {
    setupSlideNavigation();
    displaySeriesVolumes();
});
