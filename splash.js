(function () {
    function run() {
        if (sessionStorage.getItem('splashShown')) {
            var el = document.getElementById('splashOverlay');
            if (el) el.remove();
            return;
        }
        sessionStorage.setItem('splashShown', '1');

        var overlay = document.getElementById('splashOverlay');
        var title = overlay && overlay.querySelector('.splash-title');
        if (!overlay || !title) return;

        var canvas = document.getElementById('splashCanvas');
        if (canvas) canvas.style.display = 'none';

        document.body.style.overflow = 'hidden';

        title.classList.add('splash-glitch');
        title.setAttribute('data-text', title.textContent.trim());
        overlay.classList.add('splash-text-visible');

        var holdMs = 2400;
        var fadeMs = 700;

        setTimeout(function () {
            overlay.classList.add('splash-fadeout');
            setTimeout(function () {
                overlay.remove();
                document.body.style.overflow = '';
            }, fadeMs);
        }, holdMs);
    }

    // ナビの先読み（Speculation Rules / nav-menu.js）でこのページが裏で
    // レンダリングされている間は何もしない。ここで走らせてしまうと
    // 実際には表示されないまま splashShown を立ててしまい、
    // 本当に開いた時にスプラッシュが出なくなる。
    // 表に出た（＝先読みが採用された）タイミングで初めて実行する。
    if (document.prerendering) {
        document.addEventListener('prerenderingchange', run, { once: true });
    } else {
        run();
    }
})();
