// 左→右スワイプで前のページに戻る（モバイル共通ジェスチャー）
// 戻り演出はスターウォーズ風ワイプ（紫の面＋白い発光エッジが左→右に画面を横切る）
// 独自のスワイプ処理を持つページ（detail / volume / series-volumes）と
// トップページ（index）には読み込まないこと
(function () {
    if (!window.matchMedia('(max-width: 768px)').matches) return;

    const pageEl = document.querySelector('main, .blog-container, .blog-post-container, .legal-content');
    if (!pageEl) return;

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
        /* スターウォーズ風ワイプ */
        .sw-wipe {
            position: fixed;
            inset: 0;
            z-index: 100000;
            pointer-events: none;
            background: #4B2C82;
            transform: translateX(-100%);
            display: none;
            will-change: transform;
        }
        .sw-wipe.show { display: block; }
        /* 右端＝ワイプの境界線（白い発光エッジ） */
        .sw-wipe::after {
            content: '';
            position: absolute;
            top: 0;
            right: -2px;
            width: 3px;
            height: 100%;
            background: #ffffff;
            box-shadow: 0 0 22px 6px rgba(124, 92, 196, 0.95), 0 0 8px 2px rgba(255, 255, 255, 0.95);
        }
    `;
    document.head.appendChild(style);

    // ===== ワイプ用オーバーレイ =====
    const wipe = document.createElement('div');
    wipe.className = 'sw-wipe';
    document.body.appendChild(wipe);

    function setWipeX(px) {
        wipe.style.transform = `translateX(${px}px)`;
    }
    function resetWipe() {
        wipe.style.transition = 'none';
        setWipeX(-W());
        wipe.classList.remove('show');
    }

    // ===== 戻るボタン =====
    if (showButton) {
        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'page-back-btn';
        backBtn.setAttribute('aria-label', '戻る');
        backBtn.innerHTML = '<i class="ph-bold ph-arrow-left" style="font-size:20px"></i>';
        document.body.appendChild(backBtn);
        backBtn.addEventListener('click', () => wipeBack());
    }

    // ===== 戻り（カバー）ワイプ → history.back() =====
    function wipeBack(fromX) {
        if (leaving) return;
        leaving = true;
        wipe.classList.add('show');
        const startX = (typeof fromX === 'number') ? fromX : -W();
        wipe.style.transition = 'none';
        setWipeX(startX);
        void wipe.offsetWidth; // reflow
        const dur = 0.32;
        wipe.style.transition = `transform ${dur}s linear`;
        setWipeX(0); // 完全に覆う
        // 遷移先でリビール（同方向に走り抜け）させるためのフラグ
        try { sessionStorage.setItem('swWipe', String(Date.now())); } catch (e) {}
        setTimeout(() => {
            if (history.length > 1) {
                history.back();
            } else {
                window.location.href = 'index.html';
            }
        }, dur * 1000 * 0.9);
    }

    // ===== 到着時のリビール（覆った状態 → 右へ走り抜けて新ページを出す）=====
    function revealWipe() {
        wipe.classList.add('show');
        wipe.style.transition = 'none';
        setWipeX(0);
        void wipe.offsetWidth; // reflow
        requestAnimationFrame(() => {
            wipe.style.transition = 'transform 0.36s linear';
            setWipeX(W());
            setTimeout(resetWipe, 380);
        });
    }
    function maybeReveal() {
        try {
            const t = parseInt(sessionStorage.getItem('swWipe') || '0', 10);
            sessionStorage.removeItem('swWipe');
            if (t && (Date.now() - t) < 1600) revealWipe();
        } catch (e) {}
    }
    // 通常ロード時のリビール判定
    maybeReveal();

    // bfcache復帰時：状態リセット＋リビール判定
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
            leaving = false;
            resetWipe();
            maybeReveal();
        }
    });

    // ===== タッチでワイプ線を指に追従 =====
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
            wipe.classList.add('show');
            wipe.style.transition = 'none';
        }

        const now = Date.now();
        if (now - lastTouchTime > 0) {
            velocityX = (e.touches[0].clientX - lastTouchX) / (now - lastTouchTime);
        }
        lastTouchX = e.touches[0].clientX;
        lastTouchTime = now;

        const move = Math.max(0, dx);
        setWipeX(move - W()); // 右端（ワイプ線）が指の位置に来る
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!tracking || leaving) return;
        tracking = false;
        if (!swiping) return;

        const dx = e.changedTouches[0].clientX - touchStartX;
        const move = Math.max(0, dx);

        if (dx > 60 || velocityX > 0.4) {
            wipeBack(move - W()); // 現在位置から覆い切って遷移
        } else {
            // しきい値未満：ワイプ線を左へ引っ込める
            wipe.style.transition = 'transform 0.25s ease';
            setWipeX(-W());
            setTimeout(() => { if (!leaving) wipe.classList.remove('show'); }, 260);
        }
    }, { passive: true });
})();
