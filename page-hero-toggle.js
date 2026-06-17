/* ページタイトル（.page-hero = 見出し＋説明文）の表示/非表示トグル
   全ページ共通。localStorageで状態を保持し、右下のフローティングボタンで切替。
   チラ見え防止のため、html要素へのクラス付与はヘッダー解析中に即時実行する。 */
(function () {
    var KEY = 'hidePageHero';

    // --- スタイル注入 ---
    var css =
        'html.hide-page-hero .page-hero{display:none !important;}' +
        '#pageHeroToggle{position:fixed;z-index:300;right:16px;bottom:16px;width:44px;height:44px;' +
        'border-radius:50%;border:1px solid rgba(0,0,0,.15);background:#fff;color:#4B2C82;' +
        'display:flex;align-items:center;justify-content:center;cursor:pointer;' +
        'box-shadow:0 4px 14px rgba(0,0,0,.18);transition:transform .15s ease,background .15s ease;}' +
        '#pageHeroToggle:hover{transform:scale(1.08);background:#F2EEFB;}' +
        '#pageHeroToggle svg{width:22px;height:22px;}' +
        '@media (max-width:768px){#pageHeroToggle{bottom:74px;width:40px;height:40px;}}';
    var style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);

    // --- 早期にクラス適用（チラ見え防止） ---
    if (localStorage.getItem(KEY) === 'true') {
        document.documentElement.classList.add('hide-page-hero');
    }

    // 目アイコン: 表示中=eye（押すと隠す）／非表示中=eye-slash（押すと表示）
    function icon(hidden) {
        if (hidden) {
            return '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M53.92 34.62a8 8 0 1 0-11.84 10.76l19.24 21.17C25 88.84 9.38 123.2 8.69 124.76a8 8 0 0 0 0 6.5c.35.79 8.82 19.57 27.65 38.4C61.43 194.74 93.12 208 128 208a127.1 127.1 0 0 0 52.07-10.83l22 24.21a8 8 0 1 0 11.84-10.76ZM128 168a40 40 0 0 1-38.05-52.61l51.06 56.17A40.2 40.2 0 0 1 128 168Zm119.31-36.74c-.42.94-10.55 23.37-33.36 43.8a8 8 0 0 1-11.16-11.45A130 130 0 0 0 231.31 128a127.6 127.6 0 0 0-23.84-30.21C185.67 76.69 158 64 128 64a132.4 132.4 0 0 0-19.94 1.5 8 8 0 1 1-2.4-15.82A148.6 148.6 0 0 1 128 48c34.88 0 66.57 13.26 91.66 38.35 18.83 18.83 27.3 37.62 27.65 38.41a8 8 0 0 1 0 6.5Z"/></svg>';
        }
        return '<svg viewBox="0 0 256 256" fill="currentColor"><path d="M247.31 124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57 61.26 162.88 48 128 48S61.43 61.26 36.34 86.35C17.51 105.18 9 124 8.69 124.76a8 8 0 0 0 0 6.5c.35.79 8.82 19.57 27.65 38.4C61.43 194.74 93.12 208 128 208s66.57-13.26 91.66-38.34c18.83-18.83 27.3-37.61 27.65-38.4a8 8 0 0 0 0-6.5ZM128 168a40 40 0 1 1 40-40 40 40 0 0 1-40 40Z"/></svg>';
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!document.querySelector('.page-hero')) return;
        var btn = document.createElement('button');
        btn.id = 'pageHeroToggle';
        btn.setAttribute('aria-label', 'ページタイトルの表示／非表示');
        var render = function () {
            btn.innerHTML = icon(document.documentElement.classList.contains('hide-page-hero'));
        };
        render();
        btn.addEventListener('click', function () {
            var on = document.documentElement.classList.toggle('hide-page-hero');
            localStorage.setItem(KEY, on);
            render();
        });
        document.body.appendChild(btn);
    });
})();
