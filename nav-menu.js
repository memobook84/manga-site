(function () {
  // 現在のページに対応するヘッダーナビにactiveクラスを付与
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
    // 'sep' は行ではなく区切りライン（ピックアップ／ブログの上に入れる）
    const MENU_ITEMS = [
      ['/home.html', 'ホーム'],
      ['/new-releases.html', '新刊'],
      ['/ranking.html', 'ランキング'],
      ['/follow.html', 'ブックマーク'],
      'sep',
      ['/index.html', 'ピックアップ'],
      ['/blog.html', 'ブログ'],
      ['/qr.html', 'QRコード'],
      ['/profile.html', '管理人紹介'],
      ['/about.html', '運営者情報'],
      ['/privacy.html', 'プライバシーポリシー'],
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
            return `<a href="${item[0]}" class="mm-row${isCurrent ? ' current' : ''}">
              <span class="mm-label">${item[1]}</span>
              <span class="mm-value">›</span>
            </a>`;
          }).join('')}
        </nav>
        <button type="button" class="mm-close">
          <i class="ph-bold ph-x" style="font-size:13px"></i>
          <span>Close</span>
        </button>
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

    const menuItem = bottomNav.querySelector('.bottom-nav-item[data-page="menu"]');
    if (menuItem) {
      menuItem.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        mmOverlay.classList.contains('active') ? closeMobileMenu() : openMobileMenu();
      });
    }
  }

  // ===== 収納型ボトムナビ（スマホブラウザ表示のみ、PWAは通常ナビ） =====
  // 表示/非表示はCSSの (display-mode: browser) メディアクエリが制御。
  // PWA（standalone）ではボタン自体を生成しない。
  if (bottomNav && window.matchMedia('(display-mode: browser)').matches) {
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'bottom-nav-fab';
    fab.setAttribute('aria-label', 'ナビゲーションを開く');
    // 閉じている時は Font Awesome 6 の jet-fighter-up
    // （react-icons の FaJetFighterUp）、開いている時は×。
    // 両方入れておき、切り替えは .open クラスでCSSに任せる
    fab.innerHTML =
      '<svg class="fab-icon" viewBox="0 0 512 512" aria-hidden="true">' +
      '<path d="M270.7 9.7C268.2 3.8 262.4 0 256 0s-12.2 3.8-14.7 9.7L197.2 112.6c-3.4 8-5.2 16.5-5.2 25.2v77l-144 84V280c0-13.3-10.7-24-24-24s-24 10.7-24 24v56 32 24c0 13.3 10.7 24 24 24s24-10.7 24-24v-8H192v32.7L133.5 468c-3.5 3-5.5 7.4-5.5 12v16c0 8.8 7.2 16 16 16h96V448c0-8.8 7.2-16 16-16s16 7.2 16 16v64h96c8.8 0 16-7.2 16-16V480c0-4.6-2-9-5.5-12L320 416.7V384H464v8c0 13.3 10.7 24 24 24s24-10.7 24-24V368 336 280c0-13.3-10.7-24-24-24s-24 10.7-24 24v18.8l-144-84v-77c0-8.7-1.8-17.2-5.2-25.2L270.7 9.7z"/>' +
      '</svg><i class="ph-bold ph-x"></i>';
    document.body.appendChild(fab);

    function closeFabNav() {
      bottomNav.classList.remove('fab-open');
      fab.classList.remove('open');
    }

    fab.addEventListener('click', function (e) {
      e.stopPropagation();
      const opened = bottomNav.classList.toggle('fab-open');
      fab.classList.toggle('open', opened);
    });

    // ナビ外タップ・Escape・ナビ項目タップで閉じる
    document.addEventListener('click', function (e) {
      if (bottomNav.classList.contains('fab-open') && !bottomNav.contains(e.target)) {
        closeFabNav();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeFabNav();
    });
    bottomNav.querySelectorAll('.bottom-nav-item').forEach(function (item) {
      item.addEventListener('click', closeFabNav);
    });
  }

})();
