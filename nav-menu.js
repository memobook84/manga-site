(function () {
  // 現在のページに対応するヘッダーナビにactiveクラスを付与。
  // ※ 通常はHTML側に class="nav-link active" を直接書いてある。
  //    このファイルは </body> 直前で動くため、ここで初めて付けると
  //    「下線なしでヘッダーが描かれる → あとから下線が出る」というちらつきになる。
  //    下線を最初の1フレーム目から確定させるのが目的なので、HTMLの静的指定が本体で、
  //    ここは静的指定の無いページ向けの保険（classList.add なので二重でも無害）。
  const path = location.pathname.toLowerCase();
  const file = path.split('/').pop() || 'index.html';

  document.querySelectorAll('.header-nav .nav-link').forEach((link) => {
    const href = (link.getAttribute('href') || '').toLowerCase().split('/').pop();
    if (!href) return;
    if (href === file || (file === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // activeを当てた後の次フレームでトランジションを解禁（初回チラつき防止）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.body.classList.add('nav-ready'));
  });

  // --- ナビゲーション先の先読み（Speculation Rules API） ---
  // 「ヘッダーのリンクを押すと一瞬白くなってから切り替わる」対策の本命。
  // eagerness:"moderate" ＝ リンクにホバー/触れた時点で裏側でレンダリングまで
  // 終わらせておくので、クリック時は出来上がった画面に差し替わるだけになる。
  // 対象はヘッダー/ボトム/メニューのナビだけに絞る。作品カードまで含めると
  // 楽天APIを空振りで叩く回数が増えるため。
  // 非対応ブラウザ（Safari/Firefox）はこのブロックごと無視されるだけで害はない。
  if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
    const NAV_SELECTOR = [
      'header .nav-link',
      'header h1 a',
      '.header-logo',
      '.bottom-nav-item',
      '#navMenuOverlay a',
    ].join(', ');

    const rules = document.createElement('script');
    rules.type = 'speculationrules';
    rules.textContent = JSON.stringify({
      prerender: [
        {
          where: {
            and: [
              { href_matches: '/*' },
              { selector_matches: NAV_SELECTOR },
              { not: { href_matches: '/api/*' } },
              { not: { selector_matches: '[target]' } },
              { not: { selector_matches: '[rel~=nofollow]' } },
            ],
          },
          eagerness: 'moderate',
        },
      ],
    });
    document.body.appendChild(rules);
  }

  const overlay = document.createElement('div');
  overlay.id = 'navMenuOverlay';
  function popupItem(href, title) {
    const isCurrent = href.slice(1).toLowerCase() === file;
    return `<a href="${href}" class="nav-menu-item${isCurrent ? ' current' : ''}">${title}</a>`;
  }

  // 2カラム構成（左＝さがす／右＝サイト情報）。上端に紫のバーが入るカード型
  overlay.innerHTML = `
    <div id="navMenuPopup">
      <div class="nav-menu-cols">
        <div class="nav-menu-col">
          <div class="nav-menu-head">さがす</div>
          ${popupItem('/home.html', 'ホーム')}
          ${popupItem('/new-releases.html', '新刊')}
          ${popupItem('/ranking.html', 'ランキング')}
          ${popupItem('/follow.html', 'ブックマーク')}
          ${popupItem('/free.html', 'フリー漫画')}
          <div class="nav-menu-sep"></div>
          ${popupItem('/index.html', 'ピックアップ')}
          ${popupItem('/blog.html', 'ブログ')}
        </div>
        <div class="nav-menu-col nav-menu-col-sub">
          <div class="nav-menu-head">サイト情報</div>
          ${popupItem('/qr.html', 'QRコード')}
          ${popupItem('/profile.html', '管理人紹介')}
          ${popupItem('/about.html', '運営者情報')}
          ${popupItem('/privacy.html', 'プライバシーポリシー')}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const popup = document.getElementById('navMenuPopup');

  // ポップアップをメニューボタンの真下・右寄せで配置
  function position() {
    const btn = document.getElementById('navMenuBtn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();

    // しっぽは上に約10px飛び出すので、ヘッダーの下端より下に収まる位置に開く。
    // （ボタン基準だけだとヘッダーの下パディングにしっぽが食い込む）
    const header = btn.closest('header');
    const headerBottom = header ? header.getBoundingClientRect().bottom : rect.bottom;
    popup.style.top = Math.max(rect.bottom + 12, headerBottom + 12) + 'px';

    // CSSの right は「スクロールバーを含まない」幅が基準（＝clientWidth）。
    // window.innerWidth はスクロールバーを含むので、それで計算すると
    // バーの幅ぶん（約15px）左にずれる。
    const viewportW = document.documentElement.clientWidth;

    const rightOffset = Math.max(8, viewportW - rect.right);
    popup.style.right = rightOffset + 'px';

    // しっぽの先端をアイコンの中心に合わせる。
    // ボタンには左右パディングがあるので、中心はボタンの箱ではなく
    // アイコン（.nav-caret）の実寸から取る。
    const icon = btn.querySelector('.nav-caret') || btn;
    const iconRect = icon.getBoundingClientRect();
    const iconCenterFromRight = viewportW - (iconRect.left + iconRect.width / 2);
    // しっぽ(14px)の半分を引いて「中心」を合わせる
    const ARROW_HALF = 7;
    popup.style.setProperty(
      '--arrow-right',
      (iconCenterFromRight - rightOffset - ARROW_HALF) + 'px'
    );
  }

  function open() {
    const btn = document.getElementById('navMenuBtn');
    position();
    overlay.classList.add('active');
    if (btn) btn.classList.add('open');
  }
  function close() {
    const btn = document.getElementById('navMenuBtn');
    overlay.classList.remove('active');
    if (btn) btn.classList.remove('open');
  }
  function isOpen() {
    return overlay.classList.contains('active');
  }

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });

  document.addEventListener('click', function (e) {
    const btn = document.getElementById('navMenuBtn');
    if (btn && btn.contains(e.target)) {
      isOpen() ? close() : open();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  // 開いている間にスクロール/リサイズしたら位置を追従（大きくずれたら閉じる）
  window.addEventListener('resize', function () {
    if (isOpen()) position();
  });
  window.addEventListener('scroll', function () {
    if (isOpen()) close();
  }, { passive: true });

  // ===== ボトムナビ：アクティブアイコンを塗りつぶし表示 =====
  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) {
    const activeIcon = bottomNav.querySelector('.bottom-nav-item.active i');
    if (activeIcon) activeIcon.classList.replace('ph-light', 'ph-fill');

    // 現在のページのアイテムはタップしても遷移しない
    bottomNav.querySelectorAll('.bottom-nav-item.active').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
      });
    });
  }

  // ===== モバイル: 収納型の検索バー =====
  // ヘッダーには虫眼鏡アイコンだけを置き、タップでヘッダー直下に
  // 検索パネルを開く。.search-box のDOMはそのまま使うので、
  // 各ページの検索処理（.search-box input / button を参照）は無改修。
  const headerContainer = document.querySelector('.header-container');
  const searchBox = headerContainer && headerContainer.querySelector('.search-box');
  if (headerContainer && searchBox) {
    const searchToggle = document.createElement('button');
    searchToggle.type = 'button';
    searchToggle.className = 'header-search-toggle';
    searchToggle.setAttribute('aria-label', '検索');
    searchToggle.setAttribute('aria-expanded', 'false');
    // アイコンは Ionicons 4 の ios-search（react-icons の io/IoIosSearch）。
    // CDNを増やさずに済むよう、SVGを直接埋め込んでいる。
    searchToggle.innerHTML =
      '<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">' +
      '<path d="M443.5 420.2L336.7 312.4c20.9-26.2 33.5-59.4 33.5-95.5 0-84.5-68.5-153-153.1-153S64 132.5 64 217s68.5 153 153.1 153c36.6 0 70.1-12.8 96.5-34.2l106.1 107.1c3.2 3.4 7.6 5.1 11.9 5.1 4.1 0 8.2-1.5 11.3-4.5 6.6-6.3 6.8-16.7.6-23.3zm-226.4-83.1c-32.1 0-62.3-12.5-85-35.2-22.7-22.7-35.2-52.9-35.2-84.9 0-32.1 12.5-62.3 35.2-84.9 22.7-22.7 52.9-35.2 85-35.2s62.3 12.5 85 35.2c22.7 22.7 35.2 52.9 35.2 84.9 0 32.1-12.5 62.3-35.2 84.9-22.7 22.7-52.9 35.2-85 35.2z"/>' +
      '</svg>';
    headerContainer.appendChild(searchToggle);

    const searchBackdrop = document.createElement('div');
    searchBackdrop.className = 'search-backdrop';
    document.body.appendChild(searchBackdrop);

    const searchInput = searchBox.querySelector('input');
    let openScrollY = 0;

    function openSearch() {
      openScrollY = window.scrollY;
      document.body.classList.add('search-open');
      searchToggle.setAttribute('aria-expanded', 'true');
      // パネルのフェードインが始まってからフォーカス（iOSのちらつき対策）
      if (searchInput) setTimeout(function () { searchInput.focus(); }, 80);
    }
    function closeSearch() {
      if (!document.body.classList.contains('search-open')) return;
      document.body.classList.remove('search-open');
      searchToggle.setAttribute('aria-expanded', 'false');
      if (searchInput) searchInput.blur();
    }

    searchToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      document.body.classList.contains('search-open') ? closeSearch() : openSearch();
    });
    searchBackdrop.addEventListener('click', closeSearch);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSearch();
    });
    // スクロールでヘッダーごと隠れる場合があるので閉じる。
    // ただしフォーカス時のキーボード表示でも scroll が飛ぶため、
    // 開いた直後の微小なスクロールは無視する。
    window.addEventListener('scroll', function () {
      if (!document.body.classList.contains('search-open')) return;
      if (Math.abs(window.scrollY - openScrollY) > 40) closeSearch();
    }, { passive: true });
    // 検索を実行したらパネルを閉じる
    if (searchInput) {
      searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') closeSearch();
      });
    }
    const searchButton = searchBox.querySelector('button');
    if (searchButton) {
      searchButton.addEventListener('click', function () {
        // 各ページの検索ハンドラが走った後に閉じる
        setTimeout(closeSearch, 0);
      });
    }

    // 自前の検索処理を持たないページでは、検索結果ページへ遷移させる。
    // database.js を読むページ（home / search-results）はグローバルに
    // performSearch を持つので、その有無で二重登録を避ける
    if (typeof performSearch !== 'function') {
      const gotoSearch = function () {
        const q = searchInput ? searchInput.value.trim() : '';
        if (!q) return;
        location.href = '/search-results.html?search=' + encodeURIComponent(q);
      };
      if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
          if (e.key === 'Enter') gotoSearch();
        });
      }
      if (searchButton) searchButton.addEventListener('click', gotoSearch);
    }
  }

  // ===== モバイル: メニューポップアップ（ボトムナビ Menu） =====
  // menu.html へ遷移せず、その場でリスト型のポップアップを開く。
  if (bottomNav) {
    // ボトムナビのランキングと同じ王冠（Lucide の crown）。
    // Phosphor に同じ形が無いので、ここだけインラインSVGで持つ
    const CROWN_SVG =
      '<svg class="mm-icon lucide-crown" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/>' +
      '<path d="M5 21h14"/></svg>';

    // [パス, ラベル, アイコン]。アイコンは Phosphor のクラス名か 'crown'。
    // 'sep' は行ではなくグループの区切りライン。
    // Phosphor は全ページで読んでいる @phosphor-icons/web の regular（.ph）を使う
    const MENU_ITEMS = [
      ['/home.html', 'ホーム', 'ph-house'],
      ['/new-releases.html', '新刊', 'ph-sparkle'],
      ['/ranking.html', 'ランキング', 'crown'],
      ['/follow.html', 'ブックマーク', 'ph-bookmark-simple'],
      ['/free.html', 'フリー漫画', 'ph-gift'],
      'sep',
      ['/index.html', 'ピックアップ', 'ph-fire'],
      ['/blog.html', 'ブログ', 'ph-note-pencil'],
      'sep',
      ['/qr.html', 'QRコード', 'ph-qr-code'],
      ['/profile.html', '管理人紹介', 'ph-user-circle'],
      ['/about.html', '運営者情報', 'ph-info'],
      ['/privacy.html', 'プライバシーポリシー', 'ph-shield-check'],
    ];

    const mmOverlay = document.createElement('div');
    mmOverlay.id = 'mobileMenuOverlay';
    mmOverlay.innerHTML = `
      <div class="mm-backdrop"></div>
      <div class="mm-wrap">
        <nav class="mm-card">
          ${MENU_ITEMS.map(function (item) {
            if (item === 'sep') return '<div class="mm-sep"></div>';
            const isCurrent = item[0].slice(1).toLowerCase() === file;
            const icon = item[2] === 'crown'
              ? CROWN_SVG
              : `<i class="ph ${item[2]} mm-icon" aria-hidden="true"></i>`;
            return `<a href="${item[0]}" class="mm-row${isCurrent ? ' current' : ''}">
              ${icon}
              <span class="mm-label">${item[1]}</span>
              <i class="ph ph-caret-right mm-value" aria-hidden="true"></i>
            </a>`;
          }).join('')}
          <div class="mm-sep"></div>
          <button type="button" class="mm-row mm-close">
            <i class="ph ph-x mm-icon" aria-hidden="true"></i>
            <span class="mm-label">閉じる</span>
          </button>
        </nav>
      </div>
    `;
    document.body.appendChild(mmOverlay);

    let mmScrollY = 0;
    function openMobileMenu() {
      // 背面ページのスクロールを固定（iOSはoverflow:hiddenだけでは止まらない）
      mmScrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = -mmScrollY + 'px';
      document.body.style.width = '100%';
      mmOverlay.classList.add('active');
    }
    function closeMobileMenu() {
      if (!mmOverlay.classList.contains('active')) return;
      mmOverlay.classList.remove('active');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, mmScrollY);
    }

    mmOverlay.querySelector('.mm-backdrop').addEventListener('click', closeMobileMenu);
    mmOverlay.querySelector('.mm-close').addEventListener('click', closeMobileMenu);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMobileMenu();
    });

    function toggleMobileMenu(e) {
      e.preventDefault();
      e.stopPropagation();
      mmOverlay.classList.contains('active') ? closeMobileMenu() : openMobileMenu();
    }

    // PWA（standalone）はボトムナビの「Menu」から開く
    const menuItem = bottomNav.querySelector('.bottom-nav-item[data-page="menu"]');
    if (menuItem) menuItem.addEventListener('click', toggleMobileMenu);

    // ブラウザ表示のスマホはボトムナビを出さない（CSSで display:none）ので、
    // ヘッダー右の渦巻きボタンがナビの入口になる。
    // ボタンは常に作っておき、出す／出さないはCSSの
    // (display-mode: browser) メディアクエリに任せる（検索トグルと同じ方式）
    if (headerContainer) {
      const menuToggle = document.createElement('button');
      menuToggle.type = 'button';
      menuToggle.className = 'header-menu-toggle';
      menuToggle.setAttribute('aria-label', 'メニュー');
      // Game Icons の flower-twirl（react-icons の GiFlowerTwirl / lorc 作）。
      // 元のSVGは黒い背景の四角が1枚目のpathに入っているので、
      // react-icons と同じくそれは省いて中身のpathだけ使う。
      // 色はCSSの fill:currentColor に任せるため fill 属性は付けない
      menuToggle.innerHTML =
        '<svg viewBox="0 0 512 512" aria-hidden="true">' +
        '<path d="M277.15 15.205C156.242 16.415 55.302 138.49 97.855 259.738c.236-.898.495-1.78.74-2.672 2.014-44.925 29.754-87.052 72.382-111.033C240.472 96.4 349.52 103.243 482.07 207.91 441.497 139.717 395.89 98.6 331.764 64.86c25.326 1.366 52.64 1.44 83.797 6.826-44.575-40.27-92.906-56.936-138.41-56.48zM125.822 52.412c-137.746 41.46-140.07 297.526-7.592 355.668-26.982-5.33-52.944-14.213-75.92-26.867 70.023 139.78 335.9 106.928 329.42-81.266-17.214 37.204-52.435 67.6-97.572 79.705-35.122 9.42-70.577 6.236-100.363-6.76-98.026-39.283-154.31-188.008-47.97-320.48h-.003zm123.96 91.914c-12.187-.084-24.737 1.472-37.323 4.848-67.128 18.003-107.523 80.338-91.952 138.502 7.036 26.283 24.393 47.58 47.498 61.373 17.175 6.946 35.95 9.88 54.303 8.15 50.952-4.81 95.722-48.554 90.434-100.952-3.738-37.02-35.686-69.512-73.648-65.363-26.23 2.867-49.247 25.63-46.123 52.295 2.097 17.902 17.716 33.58 35.705 31.297h.002c11.602-1.472 21.745-11.662 20.197-23.002-.194-1.424-.618-2.803-1.21-4.096-2.036 2.385-4.785 4.204-8.044 5.077-8.567 2.296-17.376-2.79-19.672-11.357-2.294-8.568 2.79-17.373 11.36-19.668.49-.132.984-.235 1.477-.32l-.002-.01c.044-.007.087-.01.13-.016h.005c17.875-2.566 32.265 11.716 34.47 27.86h-.003c3.123 22.877-15.39 41.404-36.358 44.064-29.462 3.737-53.413-20.335-56.614-47.656-4.464-38.11 26.966-69.14 62.65-73.042 3.085-.337 6.134-.493 9.14-.478 45.104.222 80.722 38.92 85.126 82.54 4.628 45.855-21.593 85.602-59.184 106.435 65.427-18.976 104.47-80.37 89.12-137.714-12.652-47.26-58.668-78.407-111.485-78.77zm79.74 5.326c23.968 16.104 42.048 39.66 49.798 68.612.908 3.39 1.65 6.79 2.243 10.187 26.737 85.357-5.167 199.845-63.8 261.392C379.27 473.715 425.278 417.11 441.6 353.756c12.557 44.178 15.743 89.788 7.02 128.187 93.862-152.582 29.32-296.865-119.097-332.29z"/>' +
        '</svg>';
      headerContainer.appendChild(menuToggle);
      menuToggle.addEventListener('click', toggleMobileMenu);
    }
  }


})();
