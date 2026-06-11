// 左→右スワイプで前のページに戻る（モバイル共通ジェスチャー）
// 独自のスワイプ処理を持つページ（detail / volume / series-volumes）と
// トップページ（index）には読み込まないこと
(function () {
    if (!window.matchMedia('(max-width: 768px)').matches) return;

    const pageEl = document.querySelector('main, .blog-container, .blog-post-container, .legal-content');
    if (!pageEl) return;

    const ease = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    let leaving = false;

    // ボトムナビから直接行くハブページには戻るボタンを出さない（スワイプ戻るのみ有効）
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const noButtonPages = ['database.html', 'follow.html', 'home.html'];
    const showButton = !noButtonPages.includes(file);

    // 左上の戻るボタンを自動生成（detail.htmlのpage-back-btnと同デザイン）
    const style = document.createElement('style');
    style.textContent = `
        .page-back-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            position: absolute;
            top: 72px;
            left: 14px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.92);
            color: #1a1a1a;
            border: 1px solid var(--color-border, #e5e1dc);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            z-index: 90;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
            transition: transform 0.15s ease;
        }
        .page-back-btn:active {
            transform: scale(0.9);
        }
    `;
    if (showButton) {
        document.head.appendChild(style);

        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'page-back-btn';
        backBtn.setAttribute('aria-label', '戻る');
        backBtn.innerHTML = '<i class="ph-bold ph-arrow-left" style="font-size:20px"></i>';
        document.body.appendChild(backBtn);
        backBtn.addEventListener('click', () => slideBack());
    }

    // bfcache復帰時にスタイルをリセット
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
            leaving = false;
            pageEl.style.transition = 'none';
            pageEl.style.transform = '';
            pageEl.style.opacity = '';
        }
    });

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
                window.location.href = 'index.html';
            }
        }, 250);
    }

    let touchStartX = 0;
    let touchStartY = 0;
    let tracking = false;
    let swiping = false;
    let lastTouchX = 0;
    let lastTouchTime = 0;
    let velocityX = 0;

    function isOverlayOpen() {
        return document.querySelector('#navMenuOverlay.active, .range-modal-overlay.active, .video-modal-overlay.active');
    }

    document.addEventListener('touchstart', (e) => {
        if (leaving || isOverlayOpen()) { tracking = false; return; }
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

        if (dx > 60 || velocityX > 0.4) {
            slideBack();
        } else {
            pageEl.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease';
            pageEl.style.transform = '';
            pageEl.style.opacity = '';
        }
    }, { passive: true });
})();
