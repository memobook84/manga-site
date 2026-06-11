(function () {
  // 現在のページに対応するヘッダーナビにactiveクラスを付与
  const path = location.pathname.toLowerCase();
  const file = path.split('/').pop() || 'index.html';
  // ホバー時に日本語表記へロール切替するためのラベル対応表
  const jaLabels = {
    'index.html': 'ピックアップ',
    'blog.html': 'ブログ',
    'database.html': 'データベース',
    'ranking.html': '人気',
    'new-releases.html': '新刊',
    'follow.html': 'お気に入り',
  };

  document.querySelectorAll('.header-nav .nav-link').forEach((link) => {
    const href = (link.getAttribute('href') || '').toLowerCase().split('/').pop();
    if (!href) return;
    if (href === file || (file === '' && href === 'index.html')) {
      link.classList.add('active');
    }
    const ja = jaLabels[href];
    if (ja) {
      const en = link.textContent.trim();
      link.innerHTML =
        '<span class="nav-roll">' +
        '<span class="nav-roll-en">' + en + '</span>' +
        '<span class="nav-roll-ja">' + ja + '</span>' +
        '</span>';
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
        <li><a href="/database.html">Database</a></li>
        <li><a href="/ranking.html">Popular</a></li>
        <li><a href="/new-releases.html">New Releases</a></li>
        <li><a href="/follow.html">Favorites</a></li>
      </ul>
      <div class="nav-popup-section-title">Info</div>
      <ul class="nav-popup-list">
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

  // ===== ボトムナビ：ルーペ風スライドインジケーター =====
  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) {
    const loupe = document.createElement('span');
    loupe.className = 'bottom-nav-loupe';
    bottomNav.prepend(loupe);

    function moveLoupe(target, animate) {
      if (!target) {
        loupe.classList.remove('visible');
        return;
      }
      const navRect = bottomNav.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const x = rect.left - navRect.left + rect.width / 2;
      if (!animate) loupe.classList.add('no-anim');
      loupe.style.transform = 'translateX(' + x + 'px)';
      loupe.classList.add('visible');
      if (!animate) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            loupe.classList.remove('no-anim');
          });
        });
      }
    }

    // 初期位置（アニメーションなしで現在のactiveへ）
    moveLoupe(bottomNav.querySelector('.bottom-nav-item.active'), false);

    // タップ → ルーペが滑らかにスライド → 移動完了後にページ遷移
    bottomNav.querySelectorAll('.bottom-nav-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        if (item.dataset.page === 'back') return;
        if (item.classList.contains('active')) {
          e.preventDefault();
          return;
        }
        const href = item.getAttribute('href');
        if (!href || href.indexOf('javascript') === 0) return;
        e.preventDefault();

        bottomNav.querySelectorAll('.bottom-nav-item.active').forEach(function (a) {
          a.classList.remove('active');
        });
        item.classList.add('active');
        moveLoupe(item, true);

        // スライド完了を待ってから遷移（transitionendが来ない場合のフォールバック付き）
        let navigated = false;
        function go() {
          if (navigated) return;
          navigated = true;
          window.location.href = href;
        }
        loupe.addEventListener('transitionend', function (ev) {
          if (ev.propertyName === 'transform') go();
        }, { once: true });
        setTimeout(go, 500);
      });
    });

    window.addEventListener('resize', function () {
      moveLoupe(bottomNav.querySelector('.bottom-nav-item.active'), false);
    });
  }

})();
