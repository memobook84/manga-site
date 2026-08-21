// 無料で読める漫画ページ
// data/free-manga.json を読み、公式サイトへのリンクカードを並べる。
// 作品本体はホストせず、リンク先の公式サイトで読んでもらう。
(function () {
  const DATA_URL = '/data/free-manga.json';

  const gridEl = document.getElementById('freeGrid');
  const tabsEl = document.getElementById('freeTabs');
  const moreEl = document.getElementById('freeMore');
  const countEl = document.getElementById('freeCount');

  // 全作品を一度に描くと300枚以上になるので、少しずつ足していく
  const PAGE_SIZE = 24;

  let platforms = {};
  let works = [];
  let activePlatform = 'all';
  let shown = PAGE_SIZE;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function platformName(key) {
    return (platforms[key] && platforms[key].name) || key;
  }

  // 表紙が未設定／読み込み失敗のときは公式ページのOGP画像を取りに行く。
  // 画像は保存せず、公式CDNのURLをその場で表示するだけ。
  function fillCoverFromOgp(imgEl, work) {
    if (imgEl.dataset.ogpTried === '1') {
      showCoverFallback(imgEl, work);
      return;
    }
    imgEl.dataset.ogpTried = '1';

    fetch('/api/og-image?url=' + encodeURIComponent(work.url))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('ogp ' + r.status)); })
      .then(function (data) {
        if (data && data.image) {
          imgEl.src = data.image;
        } else {
          showCoverFallback(imgEl, work);
        }
      })
      .catch(function () { showCoverFallback(imgEl, work); });
  }

  // 画像が最後まで取れなかったカードは、タイトル文字だけの表紙にする
  function showCoverFallback(imgEl, work) {
    const holder = imgEl.parentElement;
    if (!holder) return;
    holder.classList.add('is-fallback');
    holder.innerHTML = '<span class="fc-fallback-title">' + escapeHtml(work.title) + '</span>';
  }

  // カードは「表紙 → タイトル → 作者 → 配信元」の3行だけ。
  // あらすじ・タグ・最新話・無料表記は一覧では出さず、リンク先の公式サイトに任せる。
  function cardHtml(work) {
    return (
      '<a class="fc-card" href="' + escapeHtml(work.url) + '"' +
      ' target="_blank" rel="noopener noreferrer"' +
      ' data-id="' + escapeHtml(work.id) + '">' +
        // 表紙は枠いっぱいに詰める（object-fit:cover）。余白もぼかし背景も出さない
        '<div class="fc-cover">' +
          '<img class="fc-cover-img" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"' +
          (work.cover ? ' src="' + escapeHtml(work.cover) + '"' : '') + '>' +
        '</div>' +
        '<div class="fc-body">' +
          '<h3 class="fc-title">' + escapeHtml(work.title) + '</h3>' +
          '<p class="fc-author">' + escapeHtml(work.author || '') + '</p>' +
          '<p class="fc-meta">' +
            '<span class="fc-platform">' + escapeHtml(platformName(work.platform)) + '</span>' +
          '</p>' +
        '</div>' +
      '</a>'
    );
  }

  function currentList() {
    return activePlatform === 'all'
      ? works
      : works.filter(function (w) { return w.platform === activePlatform; });
  }

  function render() {
    const list = currentList();

    if (countEl) {
      countEl.textContent = list.length ? list.length + '作品' : '';
    }

    // 配信元タブで絞り込み中は、全カードに同じ配信元名が並ぶだけなので隠す
    gridEl.classList.toggle('is-single-platform', activePlatform !== 'all');

    if (!list.length) {
      gridEl.innerHTML = '<p class="free-empty">この配信元の作品はまだ登録されていません。</p>';
      moreEl.innerHTML = '';
      return;
    }

    const visible = list.slice(0, shown);
    gridEl.innerHTML = visible.map(cardHtml).join('');

    moreEl.innerHTML = list.length > visible.length
      ? '<button type="button" class="free-more-btn">もっと見る（残り' + (list.length - visible.length) + '作品）</button>'
      : '';

    // 表紙の読み込み失敗（URL変更・CDN差し替え）をOGP取得で拾う
    gridEl.querySelectorAll('.fc-cover .fc-cover-img').forEach(function (img) {
      const id = img.closest('.fc-card').dataset.id;
      const work = works.find(function (w) { return w.id === id; });
      if (!work) return;

      img.addEventListener('error', function () { fillCoverFromOgp(img, work); });
      if (!img.getAttribute('src')) fillCoverFromOgp(img, work);
    });
  }

  function renderTabs() {
    const keys = Object.keys(platforms).filter(function (k) {
      return works.some(function (w) { return w.platform === k; });
    });

    const buttons = [['all', 'すべて']].concat(
      keys.map(function (k) { return [k, platformName(k)]; })
    );

    tabsEl.innerHTML = buttons.map(function (b) {
      const isActive = b[0] === activePlatform;
      return '<button type="button" class="free-tab' + (isActive ? ' active' : '') + '"' +
        ' data-platform="' + escapeHtml(b[0]) + '" role="tab"' +
        ' aria-selected="' + (isActive ? 'true' : 'false') + '">' +
        escapeHtml(b[1]) + '</button>';
    }).join('');
  }

  tabsEl.addEventListener('click', function (e) {
    const btn = e.target.closest('.free-tab');
    if (!btn) return;
    activePlatform = btn.dataset.platform;
    shown = PAGE_SIZE;
    renderTabs();
    render();
  });

  moreEl.addEventListener('click', function (e) {
    if (!e.target.closest('.free-more-btn')) return;
    shown += PAGE_SIZE;
    render();
  });

  gridEl.innerHTML = '<p class="free-empty">読み込み中…</p>';

  fetch(DATA_URL)
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('data ' + r.status)); })
    .then(function (data) {
      platforms = data.platforms || {};
      works = Array.isArray(data.works) ? data.works : [];
      renderTabs();
      render();
    })
    .catch(function (err) {
      console.error('free-manga.json の読み込みに失敗:', err);
      gridEl.innerHTML = '<p class="free-empty">作品リストを読み込めませんでした。時間をおいて再度お試しください。</p>';
    });
})();

// 見出し横の「!」で、リンク集である旨の断り書きを開閉する
(function () {
  const btn = document.getElementById('freeInfoBtn');
  const note = document.getElementById('freeNotice');
  if (!btn || !note) return;

  function setOpen(open) {
    note.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    setOpen(note.hidden);
  });

  // 吹き出しの中を押しただけで閉じないように、外側の押下だけ拾う
  note.addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });
})();
