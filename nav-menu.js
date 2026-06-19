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
  overlay.innerHTML = `
    <div id="navMenuPopup">
      <div class="nav-popup-section-title">Browse</div>
      <ul class="nav-popup-list">
        <li><a href="/index.html">Pickup</a></li>
        <li><a href="/blog.html">Blog</a></li>
        <li><a href="/home.html">Database</a></li>
        <li><a href="/ranking.html">Popular</a></li>
        <li><a href="/new-releases.html">New Releases</a></li>
        <li><a href="/follow.html">Favorites</a></li>
      </ul>
      <div class="nav-popup-section-title">Info</div>
      <ul class="nav-popup-list">
        <li><a href="/qr.html">QRコード</a></li>
        <li><a href="/profile.html">About Me</a></li>
        <li><a href="/about.html">運営者情報</a></li>
        <li><a href="/privacy.html">プライバシーポリシー</a></li>
      </ul>
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

})();
