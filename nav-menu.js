(function () {
  const overlay = document.createElement('div');
  overlay.id = 'navMenuOverlay';
  overlay.innerHTML = `
    <div id="navMenuPopup">
      <button id="navMenuClose"><i class="ph-bold ph-x"></i></button>
      <div class="nav-popup-section-title">Browse</div>
      <ul class="nav-popup-list">
        <li><a href="/index.html"><i class="ph-bold ph-star"></i> Pickup</a></li>
        <li><a href="/blog.html"><i class="ph-bold ph-newspaper"></i> Blog</a></li>
        <li><a href="/database.html"><i class="ph-bold ph-database"></i> Database</a></li>
        <li><a href="/ranking.html"><i class="ph-bold ph-chart-bar"></i> Popular</a></li>
        <li><a href="/new-releases.html"><i class="ph-bold ph-sparkle"></i> New Releases</a></li>
        <li><a href="/follow.html"><i class="ph-bold ph-heart"></i> Favorites</a></li>
      </ul>
      <div class="nav-popup-section-title">Info</div>
      <ul class="nav-popup-list">
        <li><a href="/profile.html"><i class="ph-bold ph-user"></i> About Me</a></li>
        <li><a href="/about.html"><i class="ph-bold ph-info"></i> 運営者情報</a></li>
        <li><a href="/privacy.html"><i class="ph-bold ph-shield"></i> プライバシーポリシー</a></li>
      </ul>
    </div>
  `;
  document.body.appendChild(overlay);

  function open() {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });
  document.getElementById('navMenuClose').addEventListener('click', close);

  document.addEventListener('click', function (e) {
    const btn = document.getElementById('navMenuBtn');
    if (btn && btn.contains(e.target)) open();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();
