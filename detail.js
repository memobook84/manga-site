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

// "2026年04月03日" → "2026/4/3"（ゼロ埋めしない）。
// 日が無いデータは "2026/4"、月も無ければ "2026" になる
function formatMetaDate(dateStr) {
    if (!dateStr) return '';
    const m = String(dateStr).match(/(\d{4})[年\-\/]?(?:(\d{1,2})[月\-\/]?)?(?:(\d{1,2})日?)?/);
    if (!m) return dateStr;
    return [m[1], m[2], m[3]]
        .filter(Boolean)
        .map(n => String(parseInt(n, 10)))
        .join('/');
}

// 漫画の詳細を表示（メイン処理 — シリーズページ）
async function displayMangaDetail() {
    const { title } = getDetailParams();

    if (!title) {
        document.getElementById('manga-title').textContent = '漫画が見つかりません';
        return;
    }

    // まず焼いてあるキャッシュ（data/series/）から巻一覧を読む。
    // 無ければ従来どおりタイトルで全巻を検索する
    let allVolumes = (typeof loadSeriesVolumes === 'function')
        ? await loadSeriesVolumes(title)
        : null;

    if (!allVolumes) {
        allVolumes = [];
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
    }

    if (allVolumes.length === 0) {
        document.getElementById('manga-title').textContent = '漫画が見つかりません';
        return;
    }

    // シリーズ名でフィルタリング（関連ない作品を除外）。
    // 楽天は同じ作品でも「よつばと!」「よつばと！」のように全角半角が混ざるので、
    // 文字列そのままではなく正規化キーで突き合わせる
    const seriesName = extractSeriesName(title);
    const seriesKey = normalizeSearchKey(seriesName);
    const filtered = allVolumes.filter(v => {
        return normalizeSearchKey(extractSeriesName(v.title)) === seriesKey;
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

    // 最新刊の発売日。"2026年04月03日" とゼロ埋めされた形式なので
    // 日付に変換しなくても文字列比較でそのまま新しい順に選べる
    const dated = volumes.filter(v => v.firstReleaseDate);
    const latestDate = dated.length
        ? dated.reduce((a, b) => (a.firstReleaseDate > b.firstReleaseDate ? a : b)).firstReleaseDate
        : '';
    document.getElementById('manga-latest-date').textContent = formatMetaDate(latestDate) || '-';

    // 価格帯: 巻によって定価が違うことがあるので最安〜最高で示す。
    // 全巻同じ価格なら範囲にせず1つだけ出す
    const prices = volumes.map(v => Number(v.price)).filter(p => p > 0);
    const priceEl = document.getElementById('manga-price-range');
    if (prices.length) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        priceEl.textContent = min === max
            ? `¥${min.toLocaleString()}`
            : `¥${min.toLocaleString()}〜¥${max.toLocaleString()}`;
    } else {
        priceEl.textContent = '-';
    }
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
    // フレーム内に置いている浮きボタン類は innerHTML で消えるので退避して戻す
    const followBtn = imageContainer.querySelector('#follow-button');
    const imageHtml = createDetailImageElement({
        ...coverVol,
        title: displaySeriesName,
    });
    if (frame) {
        frame.innerHTML = imageHtml;
        if (badge) frame.appendChild(badge);
        if (followBtn) {
            frame.appendChild(followBtn);
            revealWhenCoverSized(frame, followBtn);
        }
    }

    // シリーズ別の動画リンク（正規化: 記号・スペースを除去して比較）
    const normalize = (s) => (s || '').toLowerCase().replace(/[\s　×x*✕✖_\-－―]/g, '');
    const videoLinks = [
        { match: 'spyfamily', url: 'https://www.youtube.com/watch?v=U_rWZK_8vUY' },
        { match: 'スパイファミリー', url: 'https://www.youtube.com/watch?v=U_rWZK_8vUY' },
    ];
    // ※YouTube再生バッジは一旦非表示（videoLinksのデータは残してある）
    const SHOW_VIDEO_BADGE = false;
    if (badge) {
        const key = normalize(displaySeriesName);
        const hit = videoLinks.find(v => normalize(v.match) === key);
        if (SHOW_VIDEO_BADGE && hit) {
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
    const sortedVolumes = displayVolumesList(volumes, displaySeriesName);

    // カートボタンの設定
    setupCartButtons(sortedVolumes, displaySeriesName);

    // 表紙がない画像をGoogle Books APIでアップグレード
    upgradeCovers();
}

// シリーズ一覧の1マスの実表示幅から、必要な表紙の解像度を出す。
// 280固定だと PC で常に _ex=640x640（1枚あたり86KB）を引いていたが、
// 6列グリッドの1マスは約150px幅しかなく、ONE PIECE（111巻）では9.3MBになっていた。
// 列数はブレークポイントで変わる（6列→5列→3列）ので、値ではなく実測から出す。
// ※モバイル(≤768px)は createImageElement 内の gridCoverHeight() が
//   ウィンドウ幅から算出し直すため、ここで渡した値は使われない
function volumeCoverHeight(grid) {
    const FALLBACK = 280;
    if (!grid) return FALLBACK;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    const width = grid.getBoundingClientRect().width;
    if (!cols || !width) return FALLBACK;
    // 表紙は新書判（112:176）。CSS側の .volume-item img と同じ比率で高さに直す
    return Math.round((width / cols) * (176 / 112));
}

// 巻一覧を表示（巻数でソート、volume.htmlへリンク）
function displayVolumesList(volumes, seriesName) {
    const volumesGrid = document.getElementById('volumes-grid');
    volumesGrid.innerHTML = '';
    const coverHeight = volumeCoverHeight(volumesGrid);

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

    withVolNum.forEach((vol, volIndex) => {
        const volumeItem = document.createElement('div');
        volumeItem.className = 'volume-item';

        const imageHtml = createImageElement(vol, coverHeight);
        const baseName = seriesName || extractSeriesName(vol.title) || vol.title || '';
        const volumeLabel = vol.volumeNum !== null ? `${baseName}（${vol.volumeNum}巻）` : (vol.title || baseName);

        volumeItem.innerHTML = `
            <div class="volume-cover-wrap">
                ${imageHtml}
                <button type="button" class="volume-quick-btn" aria-label="クイックビュー">
                    <i class="ph-bold ph-caret-down" style="font-size:17px"></i>
                </button>
            </div>
            <div class="volume-info">
                <div class="volume-number">${volumeLabel}</div>
            </div>
        `;

        volumeItem.addEventListener('click', () => {
            if (vol.isbn) {
                const seriesName = extractSeriesName(vol.title) || '';
                window.location.href = `volume.html?isbn=${vol.isbn}&title=${encodeURIComponent(vol.title)}&series=${encodeURIComponent(seriesName)}`;
            }
        });

        // ホバー/タップで出るボタン → 簡易ポップアップ（クイックビュー）
        const quickBtn = volumeItem.querySelector('.volume-quick-btn');
        quickBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openQuickView(withVolNum, seriesName, volIndex);
        });

        volumesGrid.appendChild(volumeItem);
    });

    return withVolNum;
}

// ===== クイックビュー（シリーズ一覧の巻ホバー → 簡易ポップアップ） =====
function ensureQuickViewModal() {
    let overlay = document.getElementById('quickview-modal');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'quickview-modal';
    overlay.className = 'quickview-overlay';
    overlay.innerHTML = `
        <div class="quickview-content" role="dialog" aria-modal="true">
            <button type="button" class="quickview-close" aria-label="閉じる">
                <i class="ph-bold ph-x" style="font-size:16px"></i>
            </button>
            <div class="quickview-cover">
                <div class="quickview-cover-img"></div>
                <span class="quickview-vol-tag" hidden></span>
            </div>
            <div class="quickview-info">
                <h3 class="quickview-title"></h3>
                <dl class="quickview-meta"></dl>
                <p class="quickview-desc"></p>
                <div class="quickview-actions">
                    <a class="quickview-link" href="#">
                        <span>View Volume</span>
                        <i class="ph-bold ph-arrow-right" style="font-size:14px"></i>
                    </a>
                    <a class="quickview-buy" href="#" target="_blank" rel="noopener noreferrer"
                       aria-label="Amazonで購入" title="Amazonで購入">
                        <i class="fa-brands fa-amazon"></i>
                    </a>
                </div>
                <div class="quickview-swipe-hint">
                    <i class="ph-bold ph-caret-left" style="font-size:11px"></i>
                    <span>スワイプで前後の巻へ</span>
                    <i class="ph-bold ph-caret-right" style="font-size:11px"></i>
                </div>
            </div>
            <button type="button" class="quickview-nav quickview-prev" aria-label="前の巻"></button>
            <button type="button" class="quickview-nav quickview-next" aria-label="次の巻"></button>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeQuickView();
    });
    // ポップアップ表示中は背面ページのスクロールを完全に止める
    // （body overflow:hidden だけではiOSのタッチスクロールを防げない）
    overlay.addEventListener('touchmove', (e) => {
        e.preventDefault();
    }, { passive: false });
    overlay.querySelector('.quickview-close').addEventListener('click', closeQuickView);
    // 左右ボタン（PCのみ表示）。モバイルのスワイプと同じ slideQuickView を呼ぶ
    overlay.querySelector('.quickview-prev').addEventListener('click', () => slideQuickView(-1));
    overlay.querySelector('.quickview-next').addEventListener('click', () => slideQuickView(1));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeQuickView();
    });
    setupQuickViewSwipe(overlay);
    return overlay;
}

// クイックビューの状態（巻リスト・シリーズ名・現在の巻）
let qvState = null;
// 巻の切り替え／閉じるアニメーション中フラグ。スワイプと左右ボタンで共有する
let qvAnimating = false;

// 前後の巻へ切り替える共通処理。dir: 1 = 次の巻 / -1 = 前の巻
// 端に達しているときや、アニメーション中は何もしない
function slideQuickView(dir) {
    if (!qvState || qvAnimating) return;
    const nextIndex = qvState.index + dir;
    if (nextIndex < 0 || nextIndex >= qvState.volumes.length) return;

    const overlay = ensureQuickViewModal();
    const content = overlay.querySelector('.quickview-content');
    qvAnimating = true;

    // 進む向きへ滑らせて消し、中身を差し替えてから反対側から滑り込ませる
    const outX = dir > 0 ? -window.innerWidth * 0.55 : window.innerWidth * 0.55;
    content.style.transition = 'transform 0.18s ease-in, opacity 0.18s ease-in';
    content.style.transform = `translateX(${outX}px)`;
    content.style.opacity = '0';
    setTimeout(() => {
        qvState.index = nextIndex;
        renderQuickView();
        content.style.transition = 'none';
        content.style.transform = `translateX(${-outX}px)`;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                content.style.transition = 'transform 0.24s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.24s ease';
                content.style.transform = '';
                content.style.opacity = '';
                setTimeout(() => {
                    content.style.transition = '';
                    qvAnimating = false;
                }, 260);
            });
        });
    }, 180);
}

function openQuickView(volumes, seriesName, index) {
    qvState = { volumes, seriesName, index };
    const overlay = ensureQuickViewModal();
    renderQuickView();
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function renderQuickView() {
    if (!qvState) return;
    const overlay = ensureQuickViewModal();
    const vol = qvState.volumes[qvState.index];

    const baseName = qvState.seriesName || extractSeriesName(vol.title) || vol.title || '';
    const volumeLabel = vol.volumeNum !== null && vol.volumeNum !== undefined
        ? `${baseName}（${vol.volumeNum}）`
        : (vol.title || baseName);

    overlay.querySelector('.quickview-cover-img').innerHTML = createImageElement(vol, 400);
    overlay.querySelector('.quickview-title').textContent = volumeLabel;

    // 表紙左下のタグ＝巻位置カウンター（例: 1 / 17）
    const volTag = overlay.querySelector('.quickview-vol-tag');
    volTag.textContent = `${qvState.index + 1} / ${qvState.volumes.length}`;
    volTag.hidden = false;

    // 前後ボタンは端の巻で無効化
    overlay.querySelector('.quickview-prev').disabled = qvState.index === 0;
    overlay.querySelector('.quickview-next').disabled = qvState.index >= qvState.volumes.length - 1;

    // Release / Price / Label は非表示にした（2026-08-05・ユーザー指示）。
    // 復活させる場合は下の3行のコメントを戻すだけ。削除しないこと。
    // （空になった .quickview-meta は detail.css の :empty で消える）
    const metaRows = [
        // ['Release', formatQuickViewDate(vol.firstReleaseDate)],
        // ['Price', vol.price],
        // ['Label', vol.label],
    ].filter(([, v]) => v);
    overlay.querySelector('.quickview-meta').innerHTML = metaRows
        .map(([k, v]) => `<div class="quickview-meta-row"><dt>${k}</dt><dd>${v}</dd></div>`)
        .join('');

    const desc = (vol.description || '').trim();
    const descEl = overlay.querySelector('.quickview-desc');
    descEl.textContent = desc || 'この巻のストーリー情報はありません。';
    descEl.classList.toggle('quickview-desc-empty', !desc);

    const link = overlay.querySelector('.quickview-link');
    if (vol.isbn) {
        const series = extractSeriesName(vol.title) || '';
        link.href = `volume.html?isbn=${vol.isbn}&title=${encodeURIComponent(vol.title)}&series=${encodeURIComponent(series)}`;
        link.hidden = false;
    } else {
        link.hidden = true;
    }

    // Amazon購入リンク（ISBNがあればISBN検索、なければタイトル検索）
    const buyLink = overlay.querySelector('.quickview-buy');
    buyLink.href = getAmazonBuyUrl(vol);
}

function closeQuickView() {
    const overlay = document.getElementById('quickview-modal');
    if (!overlay || !overlay.classList.contains('active')) return;
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    // スワイプ途中で閉じた場合に備えてリセット
    const content = overlay.querySelector('.quickview-content');
    content.style.transition = '';
    content.style.transform = '';
    content.style.opacity = '';
}

// クイックビューのスワイプ操作
// 左右スワイプ＝前後の巻へ（指を右→左＝次の巻、左→右＝前の巻）
// 下スワイプ＝ポップアップを閉じる
function setupQuickViewSwipe(overlay) {
    const content = overlay.querySelector('.quickview-content');
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let mode = null; // 'horizontal' | 'down' | null

    content.addEventListener('touchstart', (e) => {
        if (qvAnimating) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
        mode = null;
        content.style.transition = 'none';
    }, { passive: true });

    content.addEventListener('touchmove', (e) => {
        if (!tracking || !qvState) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;

        if (!mode && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            if (Math.abs(dy) > Math.abs(dx) * 1.2) {
                // 縦ジェスチャー: 下方向のみ「閉じる」として追従
                if (dy > 0) {
                    mode = 'down';
                } else {
                    tracking = false;
                    return;
                }
            } else {
                mode = 'horizontal';
            }
        }
        if (!mode) return;

        e.preventDefault();

        if (mode === 'down') {
            const move = Math.max(0, dy);
            content.style.transform = `translateY(${move}px)`;
            content.style.opacity = String(Math.max(0.4, 1 - move / 420));
            return;
        }

        const hasNext = qvState.index < qvState.volumes.length - 1;
        const hasPrev = qvState.index > 0;
        let move = dx;
        if ((dx > 0 && !hasPrev) || (dx < 0 && !hasNext)) {
            move = dx * 0.25;
        }
        content.style.transform = `translateX(${move}px)`;
        content.style.opacity = String(Math.max(0.5, 1 - Math.abs(move) / 320));
    }, { passive: false });

    content.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const endMode = mode;
        mode = null;
        if (!qvState) return;

        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;

        // 下スワイプ: 一定量を超えたら閉じる
        if (endMode === 'down') {
            if (dy > 90) {
                qvAnimating = true;
                content.style.transition = 'transform 0.22s ease-in, opacity 0.22s ease-in';
                content.style.transform = `translateY(${window.innerHeight * 0.5}px)`;
                content.style.opacity = '0';
                setTimeout(() => {
                    closeQuickView();
                    qvAnimating = false;
                }, 210);
            } else {
                content.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease';
                content.style.transform = '';
                content.style.opacity = '';
            }
            return;
        }

        const hasNext = qvState.index < qvState.volumes.length - 1;
        const hasPrev = qvState.index > 0;
        const goNext = endMode === 'horizontal' && dx < -60 && hasNext;
        const goPrev = endMode === 'horizontal' && dx > 60 && hasPrev;

        if (goNext || goPrev) {
            // 切り替えの演出は左右ボタンと共通
            slideQuickView(goNext ? 1 : -1);
        } else {
            content.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease';
            content.style.transform = '';
            content.style.opacity = '';
        }
    }, { passive: true });
}

function formatQuickViewDate(dateStr) {
    if (!dateStr) return '';
    const m = String(dateStr).match(/(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})/);
    if (!m) return dateStr;
    return `${m[1]}/${String(m[2]).padStart(2, '0')}/${String(m[3]).padStart(2, '0')}`;
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

// Amazon 検索URL生成（シリーズ名で全巻を一覧させる）
function buildAmazonSearchUrl(seriesName) {
    const q = (seriesName || '').trim();
    if (!q) return null;
    // i=stripbooks で書籍カテゴリに絞る
    return `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}&i=stripbooks&tag=atlascomic-22`;
}

function openAmazonSearch(seriesName) {
    const url = buildAmazonSearchUrl(seriesName);
    if (!url) {
        alert('検索できる作品名が取得できませんでした。');
        return;
    }
    window.open(url, '_blank', 'noopener');
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

    // 右上のボタンはメニューを開かず、Amazonでシリーズ名を検索して全巻を一覧させる。
    // （以前は「全巻カートに入れる」だった。メニュー .volumes-actions は hidden のまま使わない）
    if (toggleBtn) {
        toggleBtn.removeAttribute('aria-expanded');
        toggleBtn.setAttribute('aria-label', 'Amazonで全巻を検索');
        toggleBtn.title = 'Amazonで全巻を検索';
        toggleBtn.onclick = () => openAmazonSearch(seriesName);
    }
    if (actions) actions.setAttribute('hidden', '');
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

    // テンキー
    const keypad = document.getElementById('range-keypad');
    let activeInput = fromInput;
    function setActive(inp) {
        activeInput = inp;
        if (fromInput) fromInput.classList.toggle('range-field-active', inp === fromInput);
        if (toInput) toInput.classList.toggle('range-field-active', inp === toInput);
    }
    if (fromInput) fromInput.addEventListener('focus', () => setActive(fromInput));
    if (toInput) toInput.addEventListener('focus', () => setActive(toInput));
    setActive(fromInput);

    if (keypad) {
        keypad.addEventListener('click', (e) => {
            const btn = e.target.closest('.keypad-btn');
            if (!btn || !activeInput) return;
            const key = btn.dataset.key;
            const cur = activeInput.value || '';
            if (key === 'clear') {
                activeInput.value = '';
            } else if (key === 'back') {
                activeInput.value = cur.slice(0, -1);
            } else {
                const next = (cur === '0' ? '' : cur) + key;
                activeInput.value = next.slice(0, 4);
            }
            activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

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

// 表紙フレームの高さが決まってから、下端に置いたボタンを出す。
// img は height:auto なので読み込み前は高さ0で、bottom:0 のボタンが
// タイトル付近に一瞬出てしまう。load イベントではなく実寸を見ているのは、
// 書影エラー→Google Books 再取得→プレースホルダー差し替えのどの経路でも
// 「高さが付いた時点」で一度だけ出したいため
function revealWhenCoverSized(frame, btn) {
    const show = () => btn.classList.add('is-ready');
    const sized = () => frame.offsetHeight > 40;

    if (sized()) { show(); return; }
    if (typeof ResizeObserver === 'undefined') { show(); return; }

    const ro = new ResizeObserver(() => {
        if (sized()) { ro.disconnect(); show(); }
    });
    ro.observe(frame);
    // 高さが付かないまま終わってもボタンは必ず出す
    setTimeout(() => { ro.disconnect(); show(); }, 3000);
}

// フォロー機能
function setupFollowButton(manga) {
    const followButton = document.getElementById('follow-button');
    if (!followButton) return;
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
    const followed = button.classList.contains('followed');
    const textEl = button.querySelector('.follow-button-text');
    if (textEl) {
        textEl.textContent = followed ? 'Bookmarked' : 'Bookmark';
    }
    // アイコンのみの丸ボタンなので、状態はラベルで伝える
    const label = followed ? 'ブックマーク済み' : 'ブックマーク';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    const iconEl = button.querySelector('.follow-icon');
    if (iconEl) {
        // 未登録＝細線（ph-light）、登録済＝塗りつぶし（ph-fill）
        if (button.classList.contains('followed')) {
            iconEl.classList.remove('ph-light');
            iconEl.classList.add('ph-fill');
        } else {
            iconEl.classList.remove('ph-fill');
            iconEl.classList.add('ph-light');
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

// ===== モバイル: ページスライド遷移 =====
// Database等から来たときは右からスライドイン、
// 左上の矢印ボタン or 左→右スワイプで右へスライドアウトして戻る
// 右→左スワイプで全巻一覧ページ（series-volumes.html）へ進む
function setupSlideNavigation() {
    const pageEl = document.querySelector('.detail-main');
    if (!pageEl) return;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const ease = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

    // bfcache復帰時（全巻一覧から戻ってきた時など）にスタイルをリセット
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
            leaving = false;
            pageEl.style.transition = 'none';
            pageEl.style.transform = '';
            pageEl.style.opacity = '';
        }
    });

    // 入場アニメーション（右からスライドイン）
    // どのページから作品をクリックしても発動。戻る/進む・リロードでは発動しない
    const navEntry = performance.getEntriesByType('navigation')[0];
    const isFreshNav = navEntry ? navEntry.type === 'navigate' : true;
    const hasFlag = !!sessionStorage.getItem('detailSlideIn');
    sessionStorage.removeItem('detailSlideIn');
    if (isMobile && (hasFlag || isFreshNav)) {
        pageEl.style.transition = 'none';
        pageEl.style.transform = `translateX(${window.innerWidth}px)`;
        pageEl.style.opacity = '0';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                pageEl.style.transition = `transform 0.42s ${ease}, opacity 0.42s ease`;
                pageEl.style.transform = '';
                pageEl.style.opacity = '';
            });
        });
    }

    // 退場アニメーション（右へスライドアウトして戻る）
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
                window.location.href = 'home.html';
            }
        }, 250);
    }

    // 進むアニメーション（左へスライドアウトして全巻一覧へ）
    function slideForward() {
        if (leaving) return;
        const { title } = getDetailParams();
        if (!title) return;
        leaving = true;
        pageEl.style.transition = `transform 0.28s ${ease}, opacity 0.28s ease`;
        pageEl.style.transform = `translateX(${-window.innerWidth}px)`;
        pageEl.style.opacity = '0';
        sessionStorage.setItem('volumesSlideIn', '1');
        setTimeout(() => {
            window.location.href = `series-volumes.html?title=${encodeURIComponent(title)}`;
        }, 250);
    }

    if (!isMobile) return;

    // 左→右スワイプで戻る
    let touchStartX = 0;
    let touchStartY = 0;
    let tracking = false;
    let swiping = false;
    let lastTouchX = 0;
    let lastTouchTime = 0;
    let velocityX = 0;

    function isModalOpen() {
        return document.querySelector('.range-modal-overlay.active, .video-modal-overlay.active, .quickview-overlay.active');
    }

    document.addEventListener('touchstart', (e) => {
        if (isModalOpen() || leaving) { tracking = false; return; }
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
            // 縦スクロール優勢はスワイプ対象外
            if (Math.abs(dy) > Math.abs(dx) * 1.2) {
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

        pageEl.style.transform = `translateX(${dx}px)`;
        pageEl.style.opacity = Math.max(0.4, 1 - Math.abs(dx) / window.innerWidth * 0.6);
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!tracking || leaving) return;
        tracking = false;
        if (!swiping) return;

        const dx = e.changedTouches[0].clientX - touchStartX;

        if (dx > 60 || velocityX > 0.4) {
            // 左→右: 戻る
            slideBack();
        } else if (dx < -60 || velocityX < -0.4) {
            // 右→左: 全巻一覧へ進む
            slideForward();
        } else {
            // 閾値未満なら元の位置に戻す
            pageEl.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease';
            pageEl.style.transform = '';
            pageEl.style.opacity = '';
        }
    }, { passive: true });
}

// ※ 以前はモバイルだけ「ストーリー → 作品情報」の順に DOM を入れ替えていたが、
//    作品情報を先に見せる方針になったので廃止。PC・モバイルとも HTML の記述順
//    （作品情報 → ストーリー）のまま表示する

window.addEventListener('DOMContentLoaded', () => {
    displayMangaDetail();
    setupSlideNavigation();
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
