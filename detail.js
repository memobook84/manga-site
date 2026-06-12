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
    const sortedVolumes = displayVolumesList(volumes, displaySeriesName);

    // カートボタンの設定
    setupCartButtons(sortedVolumes, displaySeriesName);

    // 表紙がない画像をGoogle Books APIでアップグレード
    upgradeCovers();
}

// 巻一覧を表示（巻数でソート、volume.htmlへリンク）
function displayVolumesList(volumes, seriesName) {
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

    withVolNum.forEach((vol, volIndex) => {
        const volumeItem = document.createElement('div');
        volumeItem.className = 'volume-item';

        const imageHtml = createImageElement(vol, 280);
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
                <div class="quickview-eyebrow">
                    <span>Quick View</span>
                    <span class="quickview-counter"></span>
                </div>
                <h3 class="quickview-title"></h3>
                <dl class="quickview-meta"></dl>
                <p class="quickview-desc"></p>
                <a class="quickview-link" href="#">
                    <span>View Volume</span>
                    <i class="ph-bold ph-arrow-right" style="font-size:14px"></i>
                </a>
                <div class="quickview-swipe-hint">
                    <i class="ph-bold ph-caret-left" style="font-size:11px"></i>
                    <span>スワイプで前後の巻へ</span>
                    <i class="ph-bold ph-caret-right" style="font-size:11px"></i>
                </div>
            </div>
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
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeQuickView();
    });
    setupQuickViewSwipe(overlay);
    return overlay;
}

// クイックビューの状態（巻リスト・シリーズ名・現在の巻）
let qvState = null;

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
        ? `${baseName}（${vol.volumeNum}巻）`
        : (vol.title || baseName);

    overlay.querySelector('.quickview-cover-img').innerHTML = createImageElement(vol, 400);
    overlay.querySelector('.quickview-title').textContent = volumeLabel;
    overlay.querySelector('.quickview-counter').textContent =
        `${qvState.index + 1} / ${qvState.volumes.length}`;

    // VOL.タグ（巻数があるときのみ表示）
    const volTag = overlay.querySelector('.quickview-vol-tag');
    if (vol.volumeNum !== null && vol.volumeNum !== undefined) {
        volTag.textContent = `VOL.${String(vol.volumeNum).padStart(2, '0')}`;
        volTag.hidden = false;
    } else {
        volTag.hidden = true;
    }

    const metaRows = [
        ['Release', formatQuickViewDate(vol.firstReleaseDate)],
        ['Price', vol.price],
        ['Label', vol.label],
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

// クイックビューの左右スワイプで前後の巻へ（右スワイプ＝次の巻、左スワイプ＝前の巻）
function setupQuickViewSwipe(overlay) {
    const content = overlay.querySelector('.quickview-content');
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let swiping = false;
    let animating = false;

    content.addEventListener('touchstart', (e) => {
        if (animating) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
        swiping = false;
        content.style.transition = 'none';
    }, { passive: true });

    content.addEventListener('touchmove', (e) => {
        if (!tracking || !qvState) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;

        if (!swiping && Math.abs(dx) > 8) {
            if (Math.abs(dy) > Math.abs(dx) * 1.2) {
                tracking = false;
                return;
            }
            swiping = true;
        }
        if (!swiping) return;

        e.preventDefault();

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
        const wasSwiping = swiping;
        swiping = false;
        if (!qvState) return;

        const dx = e.changedTouches[0].clientX - startX;
        const hasNext = qvState.index < qvState.volumes.length - 1;
        const hasPrev = qvState.index > 0;
        const goNext = wasSwiping && dx < -60 && hasNext;
        const goPrev = wasSwiping && dx > 60 && hasPrev;

        if (goNext || goPrev) {
            animating = true;
            const outX = goNext ? -window.innerWidth * 0.55 : window.innerWidth * 0.55;
            content.style.transition = 'transform 0.18s ease-in, opacity 0.18s ease-in';
            content.style.transform = `translateX(${outX}px)`;
            content.style.opacity = '0';
            setTimeout(() => {
                qvState.index += goNext ? 1 : -1;
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
                            animating = false;
                        }, 260);
                    });
                });
            }, 180);
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
                window.location.href = 'database.html';
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

    const backBtn = document.getElementById('page-back-btn');
    if (backBtn) backBtn.addEventListener('click', slideBack);

    const forwardBtn = document.getElementById('page-forward-btn');
    if (forwardBtn) forwardBtn.addEventListener('click', slideForward);

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
