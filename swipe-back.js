// 左→右スワイプで前のページに戻る（モバイル共通ジェスチャー）
// 戻り演出：ページ自体が指に追従して右へスライドするだけのシンプルな動き。
// （※以前のスターウォーズ風の発光エッジ／宇宙グラデ／リビール光線は廃止）
// 独自のスワイプ処理を持つページ（detail / volume / series-volumes）と
// トップページ（index）には読み込まないこと
(function () {
    if (!window.matchMedia('(max-width: 768px)').matches) return;

    const bodyEl = document.body;
    if (!bodyEl) return;

    // 「戻れる」場合だけスワイプバックを有効化する。
    // アプリ内（同一オリジン）から遷移してきて履歴がある時のみ。
    // 直接URL / QR / 共有リンク / PWA起動 / 外部サイトからの着地は無効
    // （= スワイプしても何も起きない。index.html へ飛ばすフォールバックはしない）
    function canGoBack() {
        if (history.length <= 1) return false;
        const ref = document.referrer;
        if (!ref) return false;
        try {
            return new URL(ref).origin === location.origin;
        } catch (e) {
            return false;
        }
    }
    if (!canGoBack()) return;

    const W = () => window.innerWidth;
    let leaving = false;

    // ボトムナビから直接行くハブページには戻るボタンを出さない（スワイプ戻るのみ有効）
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const noButtonPages = ['home.html', 'menu.html', 'follow.html'];
    const showButton = !noButtonPages.includes(file);

    // ===== スタイル =====
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
    document.head.appendChild(style);

    function setPageX(px) {
        if (px) {
            bodyEl.style.transform = `translateX(${px}px)`;
        } else {
            bodyEl.style.transform = '';
        }
    }
    function resetSlide() {
        bodyEl.style.transition = 'none';
        setPageX(0);
        bodyEl.style.willChange = '';
    }

    // ===== 戻るボタン =====
    if (showButton) {
        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'page-back-btn';
        backBtn.setAttribute('aria-label', '戻る');
        backBtn.innerHTML = '<i class="ph-bold ph-arrow-left" style="font-size:20px"></i>';
        document.body.appendChild(backBtn);
        backBtn.addEventListener('click', () => slideBack());
    }

    // ===== 戻り：ページを右へ滑らせて history.back() =====
    function slideBack(fromX) {
        if (leaving) return;
        leaving = true;
        bodyEl.style.willChange = 'transform';
        const startX = (typeof fromX === 'number') ? Math.max(0, fromX) : 0;
        bodyEl.style.transition = 'none';
        setPageX(startX);
        void bodyEl.offsetWidth; // reflow
        const dur = 0.3;
        bodyEl.style.transition = `transform ${dur}s cubic-bezier(0.4, 0, 0.2, 1)`;
        setPageX(W()); // ページを画面右外へ送り出す
        setTimeout(() => {
            history.back();
        }, dur * 1000 * 0.9);
    }

    // bfcache復帰時：状態リセット
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
            leaving = false;
            resetSlide();
        }
    });

    // ===== タッチでページを指に追従 =====
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
            bodyEl.style.willChange = 'transform';
            bodyEl.style.transition = 'none';
        }

        const now = Date.now();
        if (now - lastTouchTime > 0) {
            velocityX = (e.touches[0].clientX - lastTouchX) / (now - lastTouchTime);
        }
        lastTouchX = e.touches[0].clientX;
        lastTouchTime = now;

        const move = Math.max(0, dx);
        setPageX(move); // ページが指に追従
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!tracking || leaving) return;
        tracking = false;
        if (!swiping) return;

        const dx = e.changedTouches[0].clientX - touchStartX;
        const move = Math.max(0, dx);

        if (dx > 60 || velocityX > 0.4) {
            slideBack(move); // 現在位置から右へ送り出して遷移
        } else {
            // しきい値未満：ページを元の位置へ戻す
            bodyEl.style.transition = 'transform 0.25s ease';
            setPageX(0);
            setTimeout(() => { if (!leaving) resetSlide(); }, 260);
        }
    }, { passive: true });
})();
