/* スプラッシュ（index.html / home.html）。同一セッションで1回だけ。
   長さは従来どおり 表示2.4秒 ＋ フェード0.7秒 ＝ 3.1秒。

   ロゴ「ATLAS COMIC」が1文字ずつ上からドーンと叩きつけられるだけのシンプルな演出。
   ・点滅なし・画面を揺らさない。動きは減速して止まる
   ・OSの「視差効果を減らす」（prefers-reduced-motion）が有効なら、動かさずにロゴを出すだけ
   ・タップ／クリック／キー操作でいつでも飛ばせる（その場でフェード）
   ・隠しコマンド：スプラッシュ中にタイトル「ATLAS COMIC」そのものを押すと、約1分のモーションビデオ
     『THE ATLAS EXPEDITION』（adventure.js）が流れる。見終わる／スキップするとそのままサイトへ
   ※コマ割り・集中線・アイリスアウト入りの版も作ったが、シンプルにしてほしいとのことで外した */
(function () {
    var HOLD_MS = 2400;
    var FADE_MS = 700;
    var SLAM_START = 250;   // 最初の文字が落ち始めるまで
    var SLAM_STAGGER = 40;  // 文字ごとのずれ
    var SLAM_MS = 560;      // 1文字が落ちて着地するまで

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

        document.body.style.overflow = 'hidden';

        var reduce = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduce && Element.prototype.animate) slam(title);
        overlay.classList.add('splash-visible');

        var ended = false;
        function fadeOut() {
            if (ended) return;
            ended = true;
            overlay.classList.add('splash-fadeout');
            window.removeEventListener('keydown', fadeOut);
            setTimeout(function () {
                overlay.remove();
                document.body.style.overflow = '';
            }, FADE_MS);
        }
        var holdTimer = setTimeout(fadeOut, HOLD_MS);
        overlay.addEventListener('pointerdown', fadeOut);
        window.addEventListener('keydown', fadeOut);

        // 隠しコマンド。押した瞬間に自動フェードを止めて adventure.js を読み込む。
        // 音を鳴らす許可はユーザー操作の中でしか下りないので、AudioContext はここで作っておく
        var secretAc = null, secretOn = false;
        title.addEventListener('pointerdown', function (e) {
            e.stopPropagation();   // 背景の「押したら閉じる」には渡さない
            if (ended || secretOn) return;
            secretOn = true;
            clearTimeout(holdTimer);
            window.removeEventListener('keydown', fadeOut);
            var AC = window.AudioContext || window.webkitAudioContext;
            try { secretAc = AC ? new AC() : null; } catch (err) { secretAc = null; }
            unlockAudio(secretAc);
            loadAdventure(function (ok) {
                if (!ok || !window.AtlasAdventure) {
                    if (secretAc && secretAc.close) secretAc.close().catch(function () {});
                    fadeOut();
                    return;
                }
                window.AtlasAdventure.play({ audioContext: secretAc, onEnd: fadeOut });
            });
        });
        // iOS は pointerdown だけでは音の許可が下りないことがあるので、指を離した時（click）にもう一度起こす
        title.addEventListener('click', function (e) {
            e.stopPropagation();
            unlockAudio(secretAc);
        });
    }

    // 無音を1回鳴らして音声を使える状態にする（主に iOS 向け）
    function unlockAudio(ac) {
        if (!ac) return;
        try {
            var src = ac.createBufferSource();
            src.buffer = ac.createBuffer(1, 1, 22050);
            src.connect(ac.destination);
            src.start(0);
            if (ac.resume) ac.resume().catch(function () {});
        } catch (e) { /* 音が出なくても映像は流す */ }
    }

    function loadAdventure(cb) {
        if (window.AtlasAdventure) { cb(true); return; }
        var s = document.createElement('script');
        s.src = '/adventure.js';
        s.onload = function () { cb(true); };
        s.onerror = function () { cb(false); };
        document.head.appendChild(s);
    }

    // ロゴを1文字ずつに分けて、上から大きく落として着地させる
    function slam(title) {
        var text = title.textContent.trim();
        title.setAttribute('aria-label', text);
        title.textContent = '';
        var i = 0;
        text.split('').forEach(function (ch) {
            var s = document.createElement('span');
            s.className = 'splash-letter';
            s.setAttribute('aria-hidden', 'true');
            s.textContent = ch === ' ' ? ' ' : ch;
            title.appendChild(s);
            if (ch === ' ') return;
            var r = (i % 2 ? 1 : -1) * (6 + (i * 37 % 7));   // 文字ごとに少しだけ傾けて落とす
            s.animate([
                { opacity: 0, transform: 'translateY(-0.55em) scale(1.9) rotate(' + r + 'deg)', offset: 0, easing: 'cubic-bezier(.3,0,.6,1)' },
                { opacity: 1, transform: 'translateY(0.05em) scale(0.9) rotate(' + (-r * 0.25) + 'deg)', offset: 0.5, easing: 'cubic-bezier(.3,0,.4,1)' },
                { opacity: 1, transform: 'translateY(-0.02em) scale(1.05) rotate(0deg)', offset: 0.75, easing: 'ease-in-out' },
                { opacity: 1, transform: 'none', offset: 1 }
            ], { duration: SLAM_MS, delay: SLAM_START + i * SLAM_STAGGER, fill: 'both' });
            i++;
        });
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
