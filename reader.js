// 漫画ビューア
//
// 右綴じ（右から左へ読む）。PCは見開き2ページ、スマホは1ページ。
//   画面の左をタップ → 次へ   画面の右をタップ → 前へ   真ん中 → バーの出し入れ
//   キーボードは ← が次、→ が前（紙の本をめくる向きに合わせる）
//
// 読むページは data/reader/<slug>-<巻>.json から取る。
// URLは reader.html?slug=black-jack-ni-yoroshiku&vol=1&page=1
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var slug = params.get('slug') || '';
  var volume = parseInt(params.get('vol') || '1', 10);
  var startPage = parseInt(params.get('page') || '1', 10);

  var el = {
    stage: document.getElementById('rdStage'),
    spread: document.getElementById('rdSpread'),
    loading: document.getElementById('rdLoading'),
    series: document.getElementById('rdSeries'),
    pageNum: document.getElementById('rdPageNum'),
    pageTotal: document.getElementById('rdPageTotal'),
    slider: document.getElementById('rdSlider'),
    credit: document.getElementById('rdCredit'),
    back: document.getElementById('rdBack'),
    zoneNext: document.getElementById('rdZoneNext'),
    zonePrev: document.getElementById('rdZonePrev'),
    spreadToggle: document.getElementById('rdSpreadToggle'),
    hint: document.getElementById('rdHint'),
  };

  var book = null;         // { pages, basePath, ... }
  var current = 1;         // 1始まり。見開きのときは「右ページ」の番号
  var spreadOn = true;     // 見開きにするか（PCのみ）
  var chromeTimer = null;
  var currentLayer = null; // いま表示している紙面のレイヤー
  var turning = false;     // めくるアニメーションの最中か

  // めくりの長さ。reader.css の .rd-spread.rd-sliding と揃えること
  var TURN_MS = 460;
  // スワイプで離した後の残り。指が大半を運んでいるので短くする
  // （reader.css の .rd-spread.rd-sliding-fast と揃えること）
  var DRAG_MS = 200;

  function isWide() {
    return window.matchMedia('(min-width: 769px)').matches
      || window.matchMedia('(max-width: 768px) and (orientation: landscape)').matches;
  }

  function useSpread() {
    return spreadOn && isWide();
  }

  // 見開きの組み方。
  // 1ページ目（表紙）は単独で見せる。以降は 2-3, 4-5 … と偶数始まりで綴じる。
  // これは紙の右綴じ本と同じ並びになる
  function spreadFor(page) {
    if (!useSpread()) return [page];
    if (page <= 1) return [1];
    var right = page % 2 === 0 ? page : page - 1;
    var left = right + 1;
    return left <= book.pageCount ? [right, left] : [right];
  }

  function pageUrl(nth) {
    return book.basePath + book.pages[nth - 1];
  }

  // ノンブル（紙面の隅に入れるページ番号）を左右どちら側に置くか。
  // 右綴じなので 1ページ目（表紙）と偶数ページが右、奇数ページが左に来る。
  // 紙の本と同じで、番号は綴じ側ではなく外側の下隅に入れる
  function pageSide(nth) {
    return (nth === 1 || nth % 2 === 0) ? 'right' : 'left';
  }

  function buildLayer(group) {
    var layer = document.createElement('div');
    layer.className = 'rd-spread' + (group.length === 1 ? ' is-single' : '');

    // 寸法属性を必ず付ける。無いと width:auto がデコード完了まで 0 になり、
    // 紙面が描かれず背景の黒が一瞬見える（戻るときに目立つ）。
    // 属性があれば縦横比が先に決まるので、白い紙面の箱がすぐ出る
    var size = book.size;
    var dim = size ? ' width="' + size.width + '" height="' + size.height + '"' : '';

    // 番号を紙面の隅に重ねるので、1枚ずつ包んで位置の基準を作る
    layer.innerHTML = group.map(function (nth) {
      return '<div class="rd-page-wrap">' +
        '<img class="rd-page"' + dim + ' src="' + pageUrl(nth) +
        '" alt="' + nth + 'ページ" draggable="false">' +
        '<span class="rd-nombre is-' + pageSide(nth) + '">' + nth + '</span>' +
        '</div>';
    }).join('');
    return layer;
  }

  // dir: +1 = 読み進む, -1 = 戻る, 0/未指定 = アニメーションなしで差し替え。
  // 右綴じなので、進むと新しい紙面が左から入って右へ流れる（紙の本をめくる向き）
  // ページ番号・スライダー・タップ領域の状態を現在位置に合わせる。
  // 紙面そのものは作り直さないので、スワイプで紙面を差し替えた後にも使える
  function syncChrome() {
    var group = spreadFor(current);
    el.pageNum.textContent = group.length > 1 ? group[0] + '-' + group[1] : String(group[0]);
    el.slider.value = String(group[0]);
    // 端まで来たらタップ領域ごと無効化する（矢印もCSS側で出なくなる）
    el.zoneNext.disabled = group.indexOf(book.pageCount) !== -1;
    el.zonePrev.disabled = current <= 1;
    preload(group);
  }

  function render(dir) {
    var group = spreadFor(current);
    syncChrome();

    var next = buildLayer(group);

    // 連打やスライダー操作のときは滑らせずに即差し替える
    if (!dir || turning) {
      el.stage.replaceChild(next, currentLayer);
      currentLayer = next;
      return;
    }

    turning = true;
    var enter = dir > 0 ? '-100%' : '100%';
    var exit = dir > 0 ? '100%' : '-100%';

    next.style.transform = 'translateX(' + enter + ')';
    el.stage.appendChild(next);

    // 位置を確定させてからトランジションを開始する（挟まないと初期位置から動かない）
    void next.offsetWidth;

    next.classList.add('rd-sliding');
    currentLayer.classList.add('rd-sliding');
    next.style.transform = 'translateX(0)';
    currentLayer.style.transform = 'translateX(' + exit + ')';

    var old = currentLayer;
    currentLayer = next;

    setTimeout(function () {
      if (old.parentNode) old.parentNode.removeChild(old);
      next.classList.remove('rd-sliding');
      next.style.transform = '';
      turning = false;
    }, TURN_MS + 40);
  }

  // 前後どちらにも先読みする。進む側だけだと、戻ったときに
  // デコードが間に合わず紙面が一瞬出ないことがある。
  // 参照を持っておかないと読み込み中に回収されうるので配列に残す
  var preloaded = [];

  function preload(group) {
    var first = group[0];
    var last = group[group.length - 1];
    var targets = [];

    for (var i = 1; i <= 4; i++) {
      if (last + i <= book.pageCount) targets.push(last + i);
      if (first - i >= 1) targets.push(first - i);
    }

    targets.forEach(function (nth) {
      var img = new Image();
      if (book.size) {
        img.width = book.size.width;
        img.height = book.size.height;
      }
      img.src = pageUrl(nth);
      preloaded.push(img);
    });

    // 際限なく溜めない。直近ぶんだけ残せば十分
    if (preloaded.length > 24) preloaded.splice(0, preloaded.length - 24);
  }

  function go(page, dir) {
    var max = book.pageCount;
    var next = Math.min(Math.max(page, 1), max);
    if (next === current) return;
    var moved = next > current ? 1 : -1;
    current = next;
    render(dir === 0 ? 0 : (dir || moved));
    saveProgress();
  }

  // 進んだ先／戻った先の先頭ページ。行き止まりなら null
  function nextPage() {
    var group = spreadFor(current);
    if (group.indexOf(book.pageCount) !== -1) return null;
    return current === 1 && useSpread() ? 2 : current + group.length;
  }

  function prevPage() {
    if (current <= 1) return null;
    if (useSpread()) return current - 2 <= 1 ? 1 : current - 2;
    return current - 1;
  }

  function step(dir) {
    // dir: +1 = 次へ（読み進む）, -1 = 前へ
    var target = dir > 0 ? nextPage() : prevPage();
    if (target !== null) go(target, dir > 0 ? 1 : -1);
  }

  // ===== バーの出し入れ =====
  // 出したバーが自分で引っ込むまでの時間。スライダーを掴んだり
  // ページ番号を確かめたりする間は消えないよう、少し長めに取っている
  var CHROME_MS = 5000;

  function showChrome(autoHide) {
    document.body.classList.remove('rd-chrome-hidden');
    clearTimeout(chromeTimer);
    if (autoHide) chromeTimer = setTimeout(hideChrome, CHROME_MS);
  }

  function hideChrome() {
    document.body.classList.add('rd-chrome-hidden');
    clearTimeout(chromeTimer);
  }

  function toggleChrome() {
    if (document.body.classList.contains('rd-chrome-hidden')) showChrome(true);
    else hideChrome();
  }

  // ===== 進捗の保存 =====
  function progressKey() {
    return 'readerProgress:' + slug + ':' + volume;
  }

  function saveProgress() {
    try { localStorage.setItem(progressKey(), String(current)); } catch (e) { /* 保存できなくても読める */ }
  }

  function loadProgress() {
    try {
      var v = parseInt(localStorage.getItem(progressKey()) || '', 10);
      return isNaN(v) ? null : v;
    } catch (e) { return null; }
  }

  // ===== 操作 =====
  el.zoneNext.addEventListener('click', function () { step(1); });
  el.zonePrev.addEventListener('click', function () { step(-1); });

  // 真ん中（タップ領域の外）でバーを出し入れする。
  // スワイプの直後は click も飛んでくるので、そのときは無視する
  var swipedAt = 0;
  el.stage.addEventListener('click', function (e) {
    if (e.target === el.zoneNext || e.target === el.zonePrev) return;
    if (Date.now() - swipedAt < 400) return;
    toggleChrome();
  });

  el.back.addEventListener('click', function () {
    if (history.length > 1) history.back();
    else location.href = '/detail.html?title=' + encodeURIComponent((book && book.series) || '');
  });

  el.spreadToggle.addEventListener('click', function (e) {
    e.stopPropagation();
    spreadOn = !spreadOn;
    el.spreadToggle.classList.toggle('is-on', spreadOn);
    try { localStorage.setItem('readerSpread', spreadOn ? '1' : '0'); } catch (err) { /* 既定のままで動く */ }
    // 見開きの切り替えはページ移動ではないので滑らせない
    render(0);
    showChrome(true);
  });

  // つまみを動かしている間は1コマずつ滑らせても意味がないので即差し替える
  el.slider.addEventListener('input', function () {
    go(parseInt(el.slider.value, 10), 0);
    showChrome(true);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { step(1); showChrome(true); }
    else if (e.key === 'ArrowRight') { step(-1); showChrome(true); }
    else if (e.key === 'Escape') el.back.click();
  });

  // ===== スワイプ =====
  // 指に紙面を追従させる。離してから動かす方式だと、スワイプした瞬間に
  // 何も起きない間があって「滑らかでない」と感じるため。
  // 右綴じなので「指を左→右（dx>0）」で次へ進む＝紙面が右へ送られる
  var drag = null;

  function stageWidth() {
    return el.stage.offsetWidth || window.innerWidth || 1;
  }

  function setLayerX(layer, px) {
    if (layer) layer.style.transform = 'translateX(' + px + 'px)';
  }

  el.stage.addEventListener('touchstart', function (e) {
    if (turning || e.touches.length !== 1) return;
    var t = e.touches[0];
    drag = {
      x: t.clientX,
      y: t.clientY,
      time: Date.now(),
      axis: null,      // 'x' | 'y' — 最初の動きで決めて、以後ぶれさせない
      w: stageWidth(),
      nextLayer: null, // 進んだ先の紙面（左側に控える）
      prevLayer: null, // 戻った先の紙面（右側に控える）
      built: false,
    };
  }, { passive: true });

  // 隣の紙面を実際に作って左右に並べる。指を動かし始めた時点で1度だけ
  function buildNeighbors() {
    // 直前のスワイプの戻しアニメーションが残っていると指に追従しないので剥がす
    currentLayer.classList.remove('rd-sliding', 'rd-sliding-fast');

    var n = nextPage();
    var p = prevPage();

    if (n !== null) {
      drag.nextLayer = buildLayer(spreadFor(n));
      setLayerX(drag.nextLayer, -drag.w);
      el.stage.appendChild(drag.nextLayer);
    }
    if (p !== null) {
      drag.prevLayer = buildLayer(spreadFor(p));
      setLayerX(drag.prevLayer, drag.w);
      el.stage.appendChild(drag.prevLayer);
    }
    drag.built = true;
  }

  el.stage.addEventListener('touchmove', function (e) {
    if (!drag || e.touches.length !== 1) return;
    var t = e.touches[0];
    var dx = t.clientX - drag.x;
    var dy = t.clientY - drag.y;

    // 1本指の操作はすべてこちらで引き受ける。縦に流すと書類ごとバウンスして
    // 紙面が上下に揺れるため（CSSの touch-action と二重に押さえる）。
    // 2本指のときは何もしないので、ピンチでの拡大は効く
    if (e.cancelable) e.preventDefault();

    if (!drag.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (drag.axis === 'x') buildNeighbors();
    }
    if (drag.axis !== 'x') return;

    // 行き止まりの向きには movement を鈍らせて、端であることを手触りで伝える
    if ((dx > 0 && !drag.nextLayer) || (dx < 0 && !drag.prevLayer)) dx *= 0.25;

    drag.dx = dx;
    setLayerX(currentLayer, dx);
    setLayerX(drag.nextLayer, dx - drag.w);
    setLayerX(drag.prevLayer, dx + drag.w);
  }, { passive: false });

  el.stage.addEventListener('touchend', function () {
    if (!drag) return;
    var d = drag;
    drag = null;

    if (d.axis !== 'x') return;
    swipedAt = Date.now();   // 直後の click（バー開閉）を抑える

    var dx = d.dx || 0;
    var elapsed = Math.max(Date.now() - d.time, 1);
    var velocity = Math.abs(dx) / elapsed;          // px/ms
    // 距離が足りなくても、速く弾けばめくる
    var commit = Math.abs(dx) > d.w * 0.18 || velocity > 0.45;

    var target = dx > 0 ? d.nextLayer : d.prevLayer;
    if (commit && target) {
      finishDrag(d, dx > 0 ? 1 : -1);
    } else {
      cancelDrag(d);
    }
  }, { passive: true });

  el.stage.addEventListener('touchcancel', function () {
    if (drag) { cancelDrag(drag); drag = null; }
  }, { passive: true });

  // めくり切る。指がすでに大半を運んでいるので、残りは短く詰める
  function finishDrag(d, dir) {
    var keep = dir > 0 ? d.nextLayer : d.prevLayer;
    var drop = dir > 0 ? d.prevLayer : d.nextLayer;
    var out = dir > 0 ? d.w : -d.w;

    turning = true;
    [currentLayer, keep].forEach(function (l) { l.classList.add('rd-sliding-fast'); });
    setLayerX(currentLayer, out);
    setLayerX(keep, 0);

    var old = currentLayer;
    currentLayer = keep;
    if (drop && drop.parentNode) drop.parentNode.removeChild(drop);

    current = dir > 0 ? nextPage() : prevPage();
    // ここで render を呼ぶと紙面を作り直してしまうので、表示まわりだけ更新する
    syncChrome();
    saveProgress();

    setTimeout(function () {
      if (old.parentNode) old.parentNode.removeChild(old);
      keep.classList.remove('rd-sliding-fast');
      keep.style.transform = '';
      turning = false;
    }, DRAG_MS + 30);
  }

  // しきい値に届かなかったので元の位置へ戻す
  function cancelDrag(d) {
    [currentLayer, d.nextLayer, d.prevLayer].forEach(function (l) {
      if (l) l.classList.add('rd-sliding-fast');
    });
    setLayerX(currentLayer, 0);
    setLayerX(d.nextLayer, -d.w);
    setLayerX(d.prevLayer, d.w);

    setTimeout(function () {
      [d.nextLayer, d.prevLayer].forEach(function (l) {
        if (l && l.parentNode) l.parentNode.removeChild(l);
      });
      currentLayer.classList.remove('rd-sliding-fast');
      currentLayer.style.transform = '';
    }, DRAG_MS + 30);
  }

  // 画面を回した／広げたときに、見開きの可否とボタンの出し分けを合わせ直す
  window.addEventListener('resize', function () {
    if (!book) return;
    el.spreadToggle.hidden = !isWide();
    render(0);
  });

  // ===== 起動 =====
  function boot(meta) {
    book = meta;
    // 作品ページ・単行本ページと同じ「作品名（巻数）」の表記に揃える
    const label = (meta.series || meta.slug) + '（' + meta.volume + '）';
    el.series.textContent = label;
    el.pageTotal.textContent = String(meta.pageCount);
    el.slider.max = String(meta.pageCount);
    document.title = label + ' - ATLAS COMIC';

    // 二次利用フリーの作品なので、作品名と著者名の明記は必須
    if (meta.credit) {
      el.credit.innerHTML = meta.source
        ? meta.credit + '　<a href="' + meta.source + '" target="_blank" rel="noopener noreferrer">配布元</a>'
        : meta.credit;
    }

    try {
      if (localStorage.getItem('readerSpread') === '0') spreadOn = false;
    } catch (e) { /* 既定の見開きのままにする */ }
    el.spreadToggle.hidden = !isWide();
    el.spreadToggle.classList.toggle('is-on', spreadOn);

    var saved = loadProgress();
    current = startPage > 1 ? startPage : (saved || 1);
    current = Math.min(Math.max(current, 1), meta.pageCount);

    el.loading.hidden = true;
    currentLayer = el.spread;
    render(0);

    try {
      if (!localStorage.getItem('readerHintSeen')) {
        el.hint.hidden = false;
        el.hint.addEventListener('click', function () {
          el.hint.hidden = true;
          try { localStorage.setItem('readerHintSeen', '1'); } catch (e) { /* 毎回出るだけ */ }
        });
      }
    } catch (e) { /* ヒントを出せなくても読める */ }

    showChrome(true);
  }

  function fail(msg) {
    el.loading.textContent = msg;
    el.loading.hidden = false;
    el.series.textContent = '読み込めませんでした';
  }

  if (!slug) {
    fail('作品が指定されていません。');
    return;
  }

  fetch('/data/reader/' + slug + '-' + String(volume).padStart(2, '0') + '.json')
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(String(r.status))); })
    .then(boot)
    .catch(function (err) {
      console.error('ページ一覧の読み込みに失敗:', err);
      fail('この巻はまだ読めません。');
    });
})();
