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
  function popupCard(href, cls, title) {
    return `<a href="${href}" class="nav-popup-card ${cls}">
      <span class="npc-title">${title}</span>
      <span class="npc-art"></span>
      <span class="npc-author">Atlas Comic</span>
    </a>`;
  }

  overlay.innerHTML = `
    <div id="navMenuPopup">
      <div class="nav-popup-grid">
        ${popupCard('/index.html', 'npc-pickup', 'ピック<br>アップ')}
        ${popupCard('/home.html', 'npc-database', 'データ<br>ベース')}
        ${popupCard('/ranking.html', 'npc-ranking', 'ランキング')}
        ${popupCard('/new-releases.html', 'npc-new', '新刊')}
        ${popupCard('/blog.html', 'npc-blog', 'ブログ')}
        ${popupCard('/follow.html', 'npc-fav', 'お気に入り')}
        ${popupCard('/qr.html', 'npc-qr', 'QRコード')}
        ${popupCard('/profile.html', 'npc-profile', '管理人紹介')}
        ${popupCard('/about.html', 'npc-about', '運営者情報')}
        ${popupCard('/privacy.html', 'npc-privacy', 'プライバシー<br>ポリシー')}
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
    popup.style.top = (rect.bottom + 8) + 'px';
    popup.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
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

  // ===== 収納型ボトムナビ（スマホブラウザ表示のみ、PWAは通常ナビ） =====
  // 表示/非表示はCSSの (display-mode: browser) メディアクエリが制御。
  // PWA（standalone）ではボタン自体を生成しない。
  if (bottomNav && window.matchMedia('(display-mode: browser)').matches) {
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'bottom-nav-fab';
    fab.setAttribute('aria-label', 'ナビゲーションを開く');
    fab.innerHTML = '<i class="ph-bold ph-list"></i>';
    document.body.appendChild(fab);

    function closeFabNav() {
      bottomNav.classList.remove('fab-open');
      fab.classList.remove('open');
      fab.querySelector('i').className = 'ph-bold ph-list';
    }

    fab.addEventListener('click', function (e) {
      e.stopPropagation();
      const opened = bottomNav.classList.toggle('fab-open');
      fab.classList.toggle('open', opened);
      fab.querySelector('i').className = opened ? 'ph-bold ph-x' : 'ph-bold ph-list';
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
