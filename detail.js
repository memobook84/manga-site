// URLパラメータを取得
function getDetailParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        title: params.get('title') ? decodeURIComponent(params.get('title')) : null,
    };
}

// タイトルから巻数を抽出
function extractVolumeNumber(title) {
    if (!title) return null;
    // "ONE PIECE 114" → 114
    let m = title.match(/[\s　]+(\d+)$/);
    if (m) return parseInt(m[1]);
    // "名探偵コナン（108）" → 108
    m = title.match(/[（(](\d+)[）)]$/);
    if (m) return parseInt(m[1]);
    // "xxx 第3巻" → 3
    m = title.match(/第(\d+)巻?$/);
    if (m) return parseInt(m[1]);
    // "xxx 3巻" → 3
    m = title.match(/(\d+)巻$/);
    if (m) return parseInt(m[1]);
    return null;
}

// "2026年04月03日" → "2026/4/3"（ゼロ埋めしない）。
// 日が無いデータは "2026/4"、月も無ければ "2026" になる
function formatMetaDate(dateStr) {
    if (!dateStr) return '';
    const m = String(dateStr).match(/(\d{4})[年\-\/]?(?:(\d{1,2})[月\-\/]?)?(?:(\d{1,2})日?)?/);
    if (!m) return dateStr;
    return [m[1], m[2], m[3]]
        .filter(Boolean)
        .map(n => String(parseInt(n, 10)))
        .join('/');
}

// 遷移元（home.html の goToDetail）が先読み用に置いていった表紙を読む。
// detail.html の <head> のインラインscriptが同じものを見て preload を撃っている。
// タイトルが一致しない＝別の作品から来た古い残骸なので無視する
function readStashedDetailCover(seriesTitle) {
    try {
        const raw = sessionStorage.getItem('detailCover');
        if (!raw) return null;
        const c = JSON.parse(raw);
        return (c && c.isbn && c.title === seriesTitle) ? c : null;
    } catch (e) {
        return null;
    }
}

// 漫画の詳細を表示（メイン処理 — シリーズページ）
async function displayMangaDetail() {
    const { title } = getDetailParams();

    // クイックビューを開いた瞬間に「読む」の有無を判定できるよう、先に読ませておく
    loadReaderIndex();

    if (!title) {
        document.getElementById('manga-title').textContent = '漫画が見つかりません';
        return;
    }

    // まず焼いてあるキャッシュ（data/series/）から巻一覧を読む。
    // 無ければ従来どおりタイトルで全巻を検索する
    let allVolumes = (typeof loadSeriesVolumes === 'function')
        ? await loadSeriesVolumes(title)
        : null;

    if (!allVolumes) {
        allVolumes = [];
        try {
            let page = 1;
            while (true) {
                const data = await cachedFetch(`/api/search?keyword=${encodeURIComponent(title)}&hits=30&page=${page}`);
                const adapted = adaptApiResponse(data);
                allVolumes = allVolumes.concat(adapted.items);
                if (page >= (data.pageCount || 1) || page >= 5) break;
                page++;
                await new Promise(r => setTimeout(r, 400));
            }
        } catch (err) {
            console.warn('シリーズ検索失敗:', err);
            document.getElementById('manga-title').textContent = '漫画が見つかりません';
            return;
        }
    }

    if (allVolumes.length === 0) {
        document.getElementById('manga-title').textContent = '漫画が見つかりません';
        return;
    }

    // シリーズ名でフィルタリング（関連ない作品を除外）。
    // 楽天は同じ作品でも「よつばと!」「よつばと！」のように全角半角が混ざるので、
    // 文字列そのままではなく正規化キーで突き合わせる
    const seriesName = extractSeriesName(title);
    const seriesKey = normalizeSearchKey(seriesName);
    const filtered = allVolumes.filter(v => {
        return normalizeSearchKey(extractSeriesName(v.title)) === seriesKey;
    });
    const volumes = filtered.length > 0 ? filtered : allVolumes;

    // --- シリーズ情報を集約 ---

    // タイトル
    const displaySeriesName = seriesName || title;
    document.title = `${displaySeriesName} - THE MANGA STORE`;
    document.getElementById('manga-title').textContent = displaySeriesName;

    // 著者・出版社・レーベル: 最初の巻から取得
    const firstVol = volumes[0];
    const authorContainer = document.getElementById('manga-author');
    const authorStr = firstVol.author || '-';
    const authors = authorStr.split(/[\/／、,]/).map(a => a.trim()).filter(a => a);
    if (authors.length > 0 && authorStr !== '-') {
        authorContainer.innerHTML = authors.map((name, i) => {
            const link = `<a href="author.html?name=${encodeURIComponent(name)}" class="author-link">${name}</a>`;
            return (i < authors.length - 1) ? link + ' / ' : link;
        }).join('');
    } else {
        authorContainer.textContent = '-';
    }

    document.getElementById('manga-publisher').textContent = firstVol.publisher || '-';
    document.getElementById('manga-label').textContent = firstVol.label || firstVol.seriesName || '-';
    document.getElementById('manga-genre').textContent = firstVol.genre || '-';

    // 巻数表示
    document.getElementById('manga-date').textContent = `${volumes.length}巻`;

    // 最新刊の発売日。"2026年04月03日" とゼロ埋めされた形式なので
    // 日付に変換しなくても文字列比較でそのまま新しい順に選べる
    const dated = volumes.filter(v => v.firstReleaseDate);
    const latestDate = dated.length
        ? dated.reduce((a, b) => (a.firstReleaseDate > b.firstReleaseDate ? a : b)).firstReleaseDate
        : '';
    document.getElementById('manga-latest-date').textContent = formatMetaDate(latestDate) || '-';

    // 初刊（1巻）の発売日。巻数の付いた巻があるなら「1巻」の巻だけを見る
    // （1巻が楽天に無い作品で、2巻の日付を初刊として出さないため。その場合は「-」）。
    // 巻数が1つも付いていない単巻作品などは、一番古い日付をそのまま使う。
    // 新装版の1巻が混ざっても、古い方を取るので元の1巻の日付になる
    const oldest = (list) => list.length
        ? list.reduce((a, b) => (a.firstReleaseDate < b.firstReleaseDate ? a : b)).firstReleaseDate
        : '';
    const hasNumbered = volumes.some(v => extractVolumeNumber(v.title) !== null);
    const firstDate = hasNumbered
        ? oldest(dated.filter(v => extractVolumeNumber(v.title) === 1))
        : oldest(dated);
    document.getElementById('manga-first-date').textContent = formatMetaDate(firstDate) || '-';

    // 連載誌欄・アニメ欄。索引の取得を待たせたくないので await しない
    setupMagazineRow(displaySeriesName);
    setupAnimeRow(displaySeriesName);

    // あらすじ: descriptionが空でない最初の巻から取得
    const withDescription = volumes.find(v => v.description && v.description.trim() !== '');
    document.getElementById('manga-description').textContent =
        (withDescription ? withDescription.description : '') || 'ストーリー情報がありません。';

    // 表紙画像: 実カバーがある巻から選択（最新巻除外）。
    // ただし遷移元が既にサイコロを振って <head> で先読みしている場合は、
    // その巻をそのまま使う。ここで引き直すと先読みした1枚が捨てられ、
    // 結局2枚落とすことになる（＝先読みの意味が無くなる）
    // 照合は displaySeriesName ではなくURLの title で行う。
    // <head> 側のインラインscriptも同じ値で判定しているので、両者の結論が必ず揃う
    const stashedCover = readStashedDetailCover(title);
    const stashedVol = stashedCover
        ? volumes.find(v => v.isbn && v.isbn === stashedCover.isbn)
        : null;

    const sortedByDate = [...volumes].sort((a, b) => {
        const dateA = a.firstReleaseDate || '';
        const dateB = b.firstReleaseDate || '';
        return dateB.localeCompare(dateA);
    });
    const nonLatest = sortedByDate.length > 1 ? sortedByDate.slice(1) : sortedByDate;
    const withCover = nonLatest.filter(v => v.hasRealCover);
    const coverPool = withCover.length > 0 ? withCover : nonLatest;
    // 先読みがある場合、URLは必ず stash 側を正とする。
    // data/pages と data/series は別バッチで焼いているので、同じISBNでも
    // 楽天のリビジョン付きファイル名（_1_2 → _1_5 など）がずれることがある（実測で約1割）。
    // 巻の付随情報は引き当てた巻から取りつつ、画像URLだけは preload したものに揃える
    const randomVol = coverPool[Math.floor(Math.random() * coverPool.length)];
    const coverVol = stashedCover
        ? {
            ...(stashedVol || randomVol),
            imageUrl: stashedCover.url,
            isbn: stashedCover.isbn,
            hasRealCover: stashedCover.hasRealCover,
          }
        : randomVol;

    // 表紙は1・2・3巻の3冊を並べて見せる（実験中）。並べ方は COVER_TRIO_LAYOUT で切り替える
    //   'split' … 左に1巻を大きく、右に2巻・3巻を1巻の半分の大きさで縦に2つ
    //   'flow'  … 中央＝1巻を手前に全部見せ、左＝2巻・右＝3巻を後ろから半分ずつのぞかせる
    //             （2026-11-25 に試した横並び。戻す時は 'flow' にするだけ）
    // 3巻まで出ていない作品や、1〜3巻のどれかに実カバーが無い作品は、
    // 上で決めた1冊だけを従来どおり出す
    const COVER_TRIO_LAYOUT = 'flow';
    const pickVolume = (n) => {
        const list = volumes.filter(v => v.hasRealCover && extractVolumeNumber(v.title) === n);
        // 新装版・特装版などで同じ巻数が複数ある時は、いちばん古い＝元の版を使う
        return list.length
            ? list.reduce((a, b) =>
                ((a.firstReleaseDate || '') <= (b.firstReleaseDate || '') ? a : b))
            : null;
    };
    // 遷移元で先読みした巻が1〜3巻に含まれていれば、その1枚は先読みしたURLを使う（二重取得を避ける）
    const withStashedUrl = (v) => (stashedCover && v.isbn && v.isbn === stashedCover.isbn)
        ? { ...v, imageUrl: stashedCover.url }
        : v;
    const [vol1, vol2, vol3] = [1, 2, 3].map(pickVolume);
    const hasTrio = !!(vol1 && vol2 && vol3);
    const covers = !hasTrio
        ? [{ vol: coverVol, pos: '' }]
        : COVER_TRIO_LAYOUT === 'split'
            ? [
                { vol: withStashedUrl(vol1), pos: 'is-main' },
                { vol: withStashedUrl(vol2), pos: 'is-sub' },
                { vol: withStashedUrl(vol3), pos: 'is-sub' },
              ]
            : [
                { vol: withStashedUrl(vol2), pos: 'is-left' },
                { vol: withStashedUrl(vol1), pos: 'is-center' },
                { vol: withStashedUrl(vol3), pos: 'is-right' },
              ];

    const imageContainer = document.querySelector('.detail-image');
    const frame = imageContainer.querySelector('.detail-cover-frame');
    const badge = imageContainer.querySelector('.detail-image-badge');
    // フレーム内に置いている浮きボタン類は innerHTML で消えるので退避して戻す
    const followBtn = imageContainer.querySelector('#follow-button');
    const imageHtml = covers.map(({ vol, pos }) =>
        `<div class="cover-layer${pos ? ` ${pos}` : ''}">${createDetailImageElement({
            ...vol,
            title: displaySeriesName,
        })}</div>`).join('');
    if (frame) {
        frame.innerHTML = imageHtml;
        frame.classList.toggle('is-flow', hasTrio && COVER_TRIO_LAYOUT !== 'split');
        frame.classList.toggle('is-split', hasTrio && COVER_TRIO_LAYOUT === 'split');
        if (badge) frame.appendChild(badge);
        if (followBtn) {
            frame.appendChild(followBtn);
            revealWhenCoverSized(frame, followBtn);
        }
    }

    // シリーズ別の動画リンク（正規化: 記号・スペースを除去して比較）
    const normalize = (s) => (s || '').toLowerCase().replace(/[\s　×x*✕✖_\-－―]/g, '');
    const videoLinks = [
        { match: 'spyfamily', url: 'https://www.youtube.com/watch?v=U_rWZK_8vUY' },
        { match: 'スパイファミリー', url: 'https://www.youtube.com/watch?v=U_rWZK_8vUY' },
    ];
    // ※YouTube再生バッジは一旦非表示（videoLinksのデータは残してある）
    const SHOW_VIDEO_BADGE = false;
    if (badge) {
        const key = normalize(displaySeriesName);
        const hit = videoLinks.find(v => normalize(v.match) === key);
        if (SHOW_VIDEO_BADGE && hit) {
            badge.dataset.videoUrl = hit.url;
            badge.hidden = false;
            badge.onclick = () => openVideoModal(hit.url);
        } else {
            badge.hidden = true;
            badge.onclick = null;
        }
    }

    // フォローボタンの設定
    setupFollowButton({
        ...firstVol,
        title: displaySeriesName,
    });

    // SEO: 動的にmeta/OGPを更新
    const seoDesc = `${displaySeriesName}（${authorStr}）のあらすじ・巻一覧。${(withDescription ? withDescription.description : '').substring(0, 80)}`;
    updateSEOMeta({
        title: `${displaySeriesName} - ATLAS COMIC`,
        description: seoDesc,
        image: coverVol.imageUrl || 'https://manga-site-three.vercel.app/icon-512.png',
    });

    // --- 巻一覧を表示 ---
    const sortedVolumes = displayVolumesList(volumes, displaySeriesName);

    // カートボタンの設定
    setupCartButtons(sortedVolumes, displaySeriesName);

    // 表紙がない画像をGoogle Books APIでアップグレード
    upgradeCovers();
}

// シリーズ一覧の1マスの実表示幅から、必要な表紙の解像度を出す。
// 列数はブレークポイントで変わる（5列→4列→3列）ので、値ではなく実測から出す。
//
// 旧実装は「グリッド全幅 ÷ 列数」で割っていたが、これは column-gap を無視していた。
// PCは 5列 gap 40px なので、実セル幅 188px を 220px と見積もり、
// pickRakutenSize が _ex=800 を選んでいた（＝直したつもりで 640 より悪化していた）。
// getComputedStyle は普通 1fr を解決済みのpx値（"188px 188px ..."）で返すので、
// 1列目の値がそのまま1マスの実幅になる。px で返らない環境のために
// 「全幅 − gap合計 ÷ 列数」のフォールバックも持たせる
function volumeCoverHeight(grid) {
    const FALLBACK = 280;
    if (!grid) return FALLBACK;
    const cs = getComputedStyle(grid);
    const tracks = cs.gridTemplateColumns.split(' ').filter(Boolean);

    let cellWidth = parseFloat(tracks[0]);
    if (!(cellWidth > 0)) {
        const cols = tracks.length || 1;
        const gap = parseFloat(cs.columnGap) || 0;
        const width = grid.getBoundingClientRect().width;
        if (!width) return FALLBACK;
        cellWidth = (width - gap * (cols - 1)) / cols;
    }
    if (!(cellWidth > 0)) return FALLBACK;

    // 表紙は新書判（112:176）。CSS側の .volume-item img と同じ比率で高さに直す
    return Math.round(cellWidth * (176 / 112));
}

// 「読む」のアイコン（Font Awesome 5 solid の book-open ＝ react-icons の FaBookOpen）。
// 単行本ページ（volume.html）の読むボタンと同じ絵にそろえてある。
// 一覧のアイコンリンクとクイックビューの「読む」ボタンの2箇所で使い回す
const READ_ICON_SVG = '<svg viewBox="0 0 576 512" aria-hidden="true"><path d="M542.22 32.05c-54.8 3.11-163.72 14.43-230.96 55.59-4.64 2.84-7.27 7.89-7.27 13.17v363.87c0 11.55 12.63 18.85 23.28 13.49 69.18-34.82 169.23-44.32 218.7-46.92 16.89-.89 30.02-14.43 30.02-30.66V62.75c.01-17.71-15.35-31.74-33.77-30.7zM264.73 87.64C197.5 46.48 88.58 35.17 33.78 32.05 15.36 31.01 0 45.04 0 62.75V400.6c0 16.24 13.13 29.78 30.02 30.66 49.49 2.6 149.59 12.11 218.77 46.95 10.62 5.35 23.21-1.94 23.21-13.46V100.63c0-5.29-2.62-10.14-7.27-12.99z"/></svg>';

// 巻一覧を表示（巻数でソート、volume.htmlへリンク）
function displayVolumesList(volumes, seriesName) {
    const volumesGrid = document.getElementById('volumes-grid');
    volumesGrid.innerHTML = '';
    const coverHeight = volumeCoverHeight(volumesGrid);

    if (volumes.length === 0) {
        volumesGrid.innerHTML = '<p style="text-align:center;grid-column:1/-1;padding:20px;color:var(--color-text-sub);">巻情報が見つかりませんでした</p>';
        return;
    }

    // 巻数を抽出してソート
    const withVolNum = volumes.map(vol => ({
        ...vol,
        volumeNum: extractVolumeNumber(vol.title),
    }));

    withVolNum.sort((a, b) => {
        if (a.volumeNum !== null && b.volumeNum !== null) return a.volumeNum - b.volumeNum;
        if (a.volumeNum !== null) return -1;
        if (b.volumeNum !== null) return 1;
        return (a.title || '').localeCompare(b.title || '');
    });

    withVolNum.forEach((vol, volIndex) => {
        const volumeItem = document.createElement('div');
        volumeItem.className = 'volume-item';

        const imageHtml = createImageElement(vol, coverHeight);
        const baseName = seriesName || extractSeriesName(vol.title) || vol.title || '';
        const volumeLabel = vol.volumeNum !== null ? `${baseName}（${vol.volumeNum}巻）` : (vol.title || baseName);

        // 「読む」アイコンリンクの判定に使う。readers.json がまだ届いていない場合に
        // 後から付け直せるよう、巻数とシリーズ名をDOMに持たせておく
        volumeItem.dataset.readKey = baseName;
        if (vol.volumeNum !== null) volumeItem.dataset.volNum = vol.volumeNum;

        volumeItem.innerHTML = `
            <div class="volume-cover-wrap">
                ${imageHtml}
                <a class="volume-read-link" href="#" hidden
                   aria-label="この巻を読む" title="読む">
                    ${READ_ICON_SVG}
                </a>
                <button type="button" class="volume-quick-btn" aria-label="クイックビュー">
                    <i class="ph-bold ph-caret-down" style="font-size:17px"></i>
                </button>
            </div>
            <div class="volume-info">
                <div class="volume-number">${volumeLabel}</div>
            </div>
        `;

        volumeItem.addEventListener('click', () => {
            if (vol.isbn) {
                const seriesName = extractSeriesName(vol.title) || '';
                window.location.href = `volume.html?isbn=${vol.isbn}&title=${encodeURIComponent(vol.title)}&series=${encodeURIComponent(seriesName)}`;
            }
        });

        // ホバー/タップで出るボタン → 簡易ポップアップ（クイックビュー）
        const quickBtn = volumeItem.querySelector('.volume-quick-btn');
        quickBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openQuickView(withVolNum, seriesName, volIndex);
        });

        // 「読む」はカードのクリック（巻ページへ）に食われないよう伝播を止める
        volumeItem.querySelector('.volume-read-link').addEventListener('click', (e) => {
            e.stopPropagation();
        });

        volumesGrid.appendChild(volumeItem);
    });

    // ビューアで読める巻に「読む」アイコンリンクを出す。
    // readers.json は非同期なので、間に合わなかった場合は届いてからもう一度当てる
    applyReadLinks(volumesGrid);
    if (!readerIndex) loadReaderIndex().then(() => applyReadLinks(volumesGrid));

    return withVolNum;
}

// 一覧の各巻に「読む」アイコンリンクを出す／消す。
// 索引（readers.json）が未読込のうちは何もしない＝リンクは hidden のまま
function applyReadLinks(grid) {
    if (!grid || !readerIndex) return;
    grid.querySelectorAll('.volume-item').forEach((item) => {
        const link = item.querySelector('.volume-read-link');
        if (!link) return;
        const raw = item.dataset.volNum;
        const volNum = raw === undefined || raw === '' ? null : Number(raw);
        const url = readerUrlFor(item.dataset.readKey || '', volNum);
        if (url) {
            link.href = url;
            link.hidden = false;
        } else {
            link.hidden = true;
        }
    });
}

// ===== クイックビュー（シリーズ一覧の巻ホバー → 簡易ポップアップ） =====
// クイックビュー1枚ぶん（巻1冊のポップアップ）。
// 前の巻・表示中の巻・次の巻の3枚を作って .quickview-track に横に並べる
function createQuickViewPanel() {
    const panel = document.createElement('div');
    panel.className = 'quickview-content';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.innerHTML = `
            <button type="button" class="quickview-close" aria-label="閉じる">
                <i class="ph-bold ph-x" style="font-size:16px"></i>
            </button>
            <div class="quickview-cover">
                <div class="quickview-cover-img"></div>
                <span class="quickview-vol-tag" hidden></span>
            </div>
            <div class="quickview-info">
                <h3 class="quickview-title"></h3>
                <dl class="quickview-meta"></dl>
                <p class="quickview-desc"></p>
                <div class="quickview-actions">
                    <!-- 公式に無料公開されている巻だけ renderQuickView が出す -->
                    <a class="quickview-read" href="#" hidden>
                        ${READ_ICON_SVG}
                        <span>読む</span>
                    </a>
                    <a class="quickview-link" href="#">
                        <span>View Volume</span>
                        <i class="ph-bold ph-arrow-right" style="font-size:14px"></i>
                    </a>
                    <a class="quickview-buy" href="#" target="_blank" rel="noopener noreferrer"
                       aria-label="Amazonで購入" title="Amazonで購入">
                        <i class="fa-brands fa-amazon"></i>
                    </a>
                </div>
                <div class="quickview-swipe-hint">
                    <i class="ph-bold ph-caret-left" style="font-size:11px"></i>
                    <span>スワイプで前後の巻へ</span>
                    <i class="ph-bold ph-caret-right" style="font-size:11px"></i>
                </div>
            </div>
            <button type="button" class="quickview-nav quickview-prev" aria-label="前の巻"></button>
            <button type="button" class="quickview-nav quickview-next" aria-label="次の巻"></button>
    `;
    return panel;
}

function ensureQuickViewModal() {
    let overlay = document.getElementById('quickview-modal');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'quickview-modal';
    overlay.className = 'quickview-overlay';
    // 前の巻・表示中の巻・次の巻の3枚を横に並べ、真ん中の1枚を画面中央に置く。
    // 左右の2枚は画面の端で見切れて「前後にも巻がある」ことを見せる
    const track = document.createElement('div');
    track.className = 'quickview-track';
    for (let i = 0; i < 3; i++) track.appendChild(createQuickViewPanel());
    overlay.appendChild(track);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        const panel = e.target.closest('.quickview-content');
        // 背景（ポップアップの外・ポップアップ同士の隙間）を押したら閉じる
        if (!panel) {
            closeQuickView();
            return;
        }
        // 見切れている前後の巻を押したら、その巻へ切り替える（中のリンクは開かない）
        if (!panel.classList.contains('is-current')) {
            e.preventDefault();
            slideQuickView(panel === track.firstElementChild ? -1 : 1);
            return;
        }
        if (e.target.closest('.quickview-close')) closeQuickView();
        // 左右ボタン（PCのみ表示）。モバイルのスワイプと同じ slideQuickView を呼ぶ
        else if (e.target.closest('.quickview-prev')) slideQuickView(-1);
        else if (e.target.closest('.quickview-next')) slideQuickView(1);
    });
    // ポップアップ表示中は背面ページのスクロールを完全に止める
    // （body overflow:hidden だけではiOSのタッチスクロールを防げない）
    overlay.addEventListener('touchmove', (e) => {
        e.preventDefault();
    }, { passive: false });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeQuickView();
    });
    setupQuickViewSwipe(overlay);
    return overlay;
}

// クイックビューの状態（巻リスト・シリーズ名・現在の巻）
let qvState = null;
// 巻の切り替え／閉じるアニメーション中フラグ。スワイプと左右ボタンで共有する
let qvAnimating = false;

// 前後の巻へ切り替える共通処理。dir: 1 = 次の巻 / -1 = 前の巻
// 端に達しているときや、アニメーション中は何もしない。
// スワイプ途中から呼ばれた時は、指を離した位置からそのまま送る
function slideQuickView(dir) {
    if (!qvState || qvAnimating) return;
    const nextIndex = qvState.index + dir;
    if (nextIndex < 0 || nextIndex >= qvState.volumes.length) return;

    const track = ensureQuickViewModal().querySelector('.quickview-track');
    const panels = Array.from(track.children);
    // 1枚ぶんの送り幅＝隣のパネルとの左端の差（パネル幅＋隙間）
    const step = panels[2].offsetLeft - panels[1].offsetLeft;
    qvAnimating = true;

    // 隣の巻を中央へ送り込む。明るさの入れ替えも同時に始める
    markQuickViewCurrent(panels[1 + dir]);
    track.style.transition = 'transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    track.style.transform = `translateX(${-dir * step}px)`;

    setTimeout(() => {
        // 送り終えたら、反対の端のパネルを進んだ側の端へ回して次の隣の巻を描き、帯の位置を戻す。
        // 中央に来たパネルは描き直さずそのまま使うので、表紙のちらつきは出ない
        qvState.index = nextIndex;
        if (dir > 0) {
            track.appendChild(panels[0]);
            renderQuickViewPanel(panels[0], nextIndex + 1);
        } else {
            track.insertBefore(panels[2], panels[0]);
            renderQuickViewPanel(panels[2], nextIndex - 1);
        }
        track.style.transition = 'none';
        track.style.transform = '';
        // 戻した位置を確定させてから次の操作を受ける（続けて送った時に戻しが飛ばされないように）
        void track.offsetWidth;
        track.style.transition = '';
        qvAnimating = false;
    }, 330);
}

// data/readers.json（どの作品のどの巻がビューアで読めるか）。
// 巻を切り替えるたびに取りに行かないよう、一度読んだら使い回す
let readerIndex = null;

async function loadReaderIndex() {
    if (readerIndex) return readerIndex;
    try {
        const res = await fetch('/data/readers.json');
        readerIndex = res.ok ? await res.json() : {};
    } catch (err) {
        readerIndex = {};   // 索引が無い＝読める巻が無い、として扱う
    }
    return readerIndex;
}

// その巻がビューアで読めるならURLを返す。読めなければ null
function readerUrlFor(seriesTitle, volNum) {
    if (!readerIndex || typeof normalizeSearchKey !== 'function') return null;
    if (volNum === null || volNum === undefined) return null;
    const rec = readerIndex[normalizeSearchKey(seriesTitle)];
    if (!rec || !Array.isArray(rec.volumes) || rec.volumes.indexOf(volNum) === -1) return null;
    return `reader.html?slug=${encodeURIComponent(rec.slug)}&vol=${volNum}`;
}

function openQuickView(volumes, seriesName, index) {
    qvState = { volumes, seriesName, index };
    const overlay = ensureQuickViewModal();
    renderQuickView();
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    // 索引がまだ無ければ読み込んでから描き直す（開くのを待たせない）。
    // 巻を送っている途中に描き直すと3枚の並びが崩れるので、送り終わるまで待つ
    if (!readerIndex) loadReaderIndex().then(function redraw() {
        if (qvAnimating) setTimeout(redraw, 350);
        else renderQuickView();
    });
}

// 3枚のパネルに 前の巻・表示中の巻・次の巻 を描く
function renderQuickView() {
    if (!qvState) return;
    const panels = Array.from(ensureQuickViewModal().querySelector('.quickview-track').children);
    panels.forEach((panel, i) => renderQuickViewPanel(panel, qvState.index - 1 + i));
    markQuickViewCurrent(panels[1]);
}

// 中央に置くパネルだけを明るく・操作できるようにし、左右の見切れる2枚は読み上げからも外す
function markQuickViewCurrent(current) {
    current.parentElement.querySelectorAll('.quickview-content').forEach(panel => {
        const isCurrent = panel === current;
        panel.classList.toggle('is-current', isCurrent);
        if (isCurrent) panel.removeAttribute('aria-hidden');
        else panel.setAttribute('aria-hidden', 'true');
    });
}

// 1枚のパネルに index 番目の巻を描く。最初の巻の前・最後の巻の後は空き枠（場所だけ取って見せない）
function renderQuickViewPanel(panel, index) {
    const vol = qvState.volumes[index];
    panel.classList.toggle('is-empty', !vol);
    if (!vol) return;

    const baseName = qvState.seriesName || extractSeriesName(vol.title) || vol.title || '';
    const volumeLabel = vol.volumeNum !== null && vol.volumeNum !== undefined
        ? `${baseName}（${vol.volumeNum}）`
        : (vol.title || baseName);

    panel.querySelector('.quickview-cover-img').innerHTML = createImageElement(vol, 400);
    panel.querySelector('.quickview-title').textContent = volumeLabel;

    // 表紙左下のタグ＝巻位置カウンター（例: 1 / 17）
    const volTag = panel.querySelector('.quickview-vol-tag');
    volTag.textContent = `${index + 1} / ${qvState.volumes.length}`;
    volTag.hidden = false;

    // 前後ボタンは端の巻で無効化
    panel.querySelector('.quickview-prev').disabled = index === 0;
    panel.querySelector('.quickview-next').disabled = index >= qvState.volumes.length - 1;

    // Release / Price / Label は非表示にした（2026-08-05・ユーザー指示）。
    // 発売日だけ戻した（2026-11-22・ユーザー指示）。見出しは作品情報に合わせて日本語、
    // 日付も作品情報の「初刊」「最新刊」と同じ書式（2026/4/3。日の無いデータは 2014/4）。
    // 2026-11-25 に見出しを外して日付だけにし、価格・レーベルも見出し無しで戻した（ユーザー指示）。
    // 見出しを空にした行は dt を作らず、detail.css でタイトル直下に「日付 · 価格 · レーベル」と並ぶ。
    // （空になった .quickview-meta は detail.css の :empty で消える）
    const metaRows = [
        ['', formatMetaDate(vol.firstReleaseDate)],
        ['', vol.price],
        ['', vol.label],
    ].filter(([, v]) => v);
    panel.querySelector('.quickview-meta').innerHTML = metaRows
        .map(([k, v]) => `<div class="quickview-meta-row">${k ? `<dt>${k}</dt>` : ''}<dd>${v}</dd></div>`)
        .join('');

    const desc = (vol.description || '').trim();
    const descEl = panel.querySelector('.quickview-desc');
    descEl.textContent = desc || 'この巻のストーリー情報はありません。';
    descEl.classList.toggle('quickview-desc-empty', !desc);

    const link = panel.querySelector('.quickview-link');
    if (vol.isbn) {
        const series = extractSeriesName(vol.title) || '';
        link.href = `volume.html?isbn=${vol.isbn}&title=${encodeURIComponent(vol.title)}&series=${encodeURIComponent(series)}`;
        link.hidden = false;
    } else {
        link.hidden = true;
    }

    // 公式に無料公開されている巻だけ「読む」を出す
    const readLink = panel.querySelector('.quickview-read');
    const readUrl = readerUrlFor(baseName, vol.volumeNum);
    if (readUrl) {
        readLink.href = readUrl;
        readLink.hidden = false;
    } else {
        readLink.hidden = true;
    }

    // Amazon購入リンク（ISBNがあればISBN検索、なければタイトル検索）
    const buyLink = panel.querySelector('.quickview-buy');
    buyLink.href = getAmazonBuyUrl(vol);
}

function closeQuickView() {
    const overlay = document.getElementById('quickview-modal');
    if (!overlay || !overlay.classList.contains('active')) return;
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    // スワイプ途中で閉じた場合に備えてリセット
    const track = overlay.querySelector('.quickview-track');
    track.style.transition = '';
    track.style.transform = '';
    track.style.opacity = '';
}

// クイックビューのスワイプ操作
// 左右スワイプ＝前後の巻へ（指を右→左＝次の巻、左→右＝前の巻）。
//   3枚並んだ帯ごと指に追従させるので、見切れていた隣の巻がそのまま中央へ出てくる
// 下スワイプ＝ポップアップを閉じる
// 見切れている隣の巻や背景の上から始めても動かせるよう、オーバーレイ全体で受ける
function setupQuickViewSwipe(overlay) {
    const track = overlay.querySelector('.quickview-track');
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let mode = null; // 'horizontal' | 'down' | null

    overlay.addEventListener('touchstart', (e) => {
        if (qvAnimating) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
        mode = null;
        track.style.transition = 'none';
    }, { passive: true });

    overlay.addEventListener('touchmove', (e) => {
        if (!tracking || !qvState) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;

        if (!mode && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            if (Math.abs(dy) > Math.abs(dx) * 1.2) {
                // 縦ジェスチャー: 下方向のみ「閉じる」として追従
                if (dy > 0) {
                    mode = 'down';
                } else {
                    tracking = false;
                    return;
                }
            } else {
                mode = 'horizontal';
            }
        }
        if (!mode) return;

        e.preventDefault();

        if (mode === 'down') {
            const move = Math.max(0, dy);
            track.style.transform = `translateY(${move}px)`;
            track.style.opacity = String(Math.max(0.4, 1 - move / 420));
            return;
        }

        const hasNext = qvState.index < qvState.volumes.length - 1;
        const hasPrev = qvState.index > 0;
        let move = dx;
        if ((dx > 0 && !hasPrev) || (dx < 0 && !hasNext)) {
            move = dx * 0.25;
        }
        track.style.transform = `translateX(${move}px)`;
    }, { passive: false });

    overlay.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const endMode = mode;
        mode = null;
        if (!qvState) return;

        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;

        // 下スワイプ: 一定量を超えたら閉じる
        if (endMode === 'down') {
            if (dy > 90) {
                qvAnimating = true;
                track.style.transition = 'transform 0.22s ease-in, opacity 0.22s ease-in';
                track.style.transform = `translateY(${window.innerHeight * 0.5}px)`;
                track.style.opacity = '0';
                setTimeout(() => {
                    closeQuickView();
                    qvAnimating = false;
                }, 210);
            } else {
                track.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease';
                track.style.transform = '';
                track.style.opacity = '';
            }
            return;
        }

        const hasNext = qvState.index < qvState.volumes.length - 1;
        const hasPrev = qvState.index > 0;
        const goNext = endMode === 'horizontal' && dx < -60 && hasNext;
        const goPrev = endMode === 'horizontal' && dx > 60 && hasPrev;

        if (goNext || goPrev) {
            // 切り替えの演出は左右ボタンと共通
            slideQuickView(goNext ? 1 : -1);
        } else {
            track.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease';
            track.style.transform = '';
            track.style.opacity = '';
        }
    }, { passive: true });
}


// ISBN-13 → ASIN(ISBN-10) 変換（978始まりのみ）
function isbn13ToAsin(isbn13) {
    if (!isbn13) return null;
    const s = String(isbn13).replace(/[^0-9X]/gi, '');
    if (s.length === 10) return s;
    if (s.length !== 13 || !s.startsWith('978')) return null;
    const core = s.substring(3, 12);
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(core[i], 10) * (10 - i);
    const check = (11 - (sum % 11)) % 11;
    return core + (check === 10 ? 'X' : String(check));
}

// Amazon カート追加URL生成
function buildAmazonCartUrl(volumes) {
    const tag = 'atlascomic-22';
    const params = [`AssociateTag=${tag}`];
    let idx = 1;
    for (const v of volumes) {
        const asin = isbn13ToAsin(v.isbn);
        if (!asin) continue;
        params.push(`ASIN.${idx}=${asin}`);
        params.push(`Quantity.${idx}=1`);
        idx++;
        if (idx > 10) break; // Amazonの上限
    }
    if (idx === 1) return null;
    return `https://www.amazon.co.jp/gp/aws/cart/add.html?${params.join('&')}`;
}

// ===== 連載誌（data/magazines.json）=====
// scripts/collect-magazines.js が Wikidata の「掲載誌」から作った索引。
// キーは normalizeSearchKey 済みの作品名で、値は連載誌名の配列（連載開始の早い順）。
// 楽天APIにはレーベルまでしか無いので、連載誌はこの索引でしか分からない
let magazineIndex = null;

async function loadMagazineIndex() {
    if (magazineIndex) return magazineIndex;
    try {
        const res = await fetch('/data/magazines.json');
        magazineIndex = res.ok ? await res.json() : {};
    } catch (err) {
        magazineIndex = {};   // 索引が無い＝連載誌欄を出さない、として扱う
    }
    return magazineIndex;
}

// メタ欄の「連載誌」行。連載誌が分かる作品でだけ出す。
// 移籍した作品（チェンソーマン等）は「週刊少年ジャンプ / 少年ジャンプ+」のように並べる
async function setupMagazineRow(seriesName) {
    const item = document.getElementById('manga-magazine-item');
    const valueEl = document.getElementById('manga-magazine');
    if (!item || !valueEl || typeof normalizeSearchKey !== 'function') return;

    const index = await loadMagazineIndex();
    const magazines = index[normalizeSearchKey(seriesName)];
    if (!Array.isArray(magazines) || magazines.length === 0) return;

    valueEl.textContent = magazines.join(' / ');
    item.hidden = false;
}

// ===== アニメ化情報（data/anime.json）=====
// scripts/collect-anime.js が AniList から作った索引。
// キーは normalizeSearchKey 済みの作品名で、値は { title, year, count }。
// アニメ化されている作品しか入っていないので、引けなければ「アニメ化なし」
let animeIndex = null;

async function loadAnimeIndex() {
    if (animeIndex) return animeIndex;
    try {
        const res = await fetch('/data/anime.json');
        animeIndex = res.ok ? await res.json() : {};
    } catch (err) {
        animeIndex = {};   // 索引が無い＝アニメ欄を出さない、として扱う
    }
    return animeIndex;
}

// アニメ欄の一覧に出す配信サービス。ディープリンクは公式に取得する手段が無い
// （配信APIはどこも公開されていない）ので、各サービスの検索にアニメ名を渡している。
// Prime Video だけは Amazon の検索を映像カテゴリ（i=instant-video）に絞り、
// アソシエイトタグを付けて他のAmazon導線と同じ扱いにしている。
// q は encodeURIComponent 済みのアニメ名。
// icon は各サービスのファビコン（64px）を service-icons/ に置いたもの
const ANIME_SERVICES = [
    { name: 'Prime Video', icon: 'prime-video', sponsored: true,
      url: q => `https://www.amazon.co.jp/s?k=${q}&i=instant-video&tag=atlascomic-22` },
    { name: 'Netflix',       icon: 'netflix',       url: q => `https://www.netflix.com/search?q=${q}` },
    { name: 'U-NEXT',        icon: 'u-next',        url: q => `https://video.unext.jp/freeword?query=${q}` },
    { name: 'dアニメストア', icon: 'd-anime-store', url: q => `https://animestore.docomo.ne.jp/animestore/sch_pc?searchKey=${q}` },
    { name: 'ABEMA',         icon: 'abema',         url: q => `https://abema.tv/search?q=${q}` },
    { name: 'Hulu',          icon: 'hulu',          url: q => `https://www.hulu.jp/search?q=${q}` },
];

// メタ欄の「アニメ」行。アニメ化されている作品でだけ出す。
// 値のアニメ名を押すと、配信サービスの一覧が下に開く
async function setupAnimeRow(seriesName) {
    const item = document.getElementById('manga-anime-item');
    const toggle = document.getElementById('manga-anime-toggle');
    const titleEl = document.getElementById('manga-anime-title');
    const menu = document.getElementById('manga-anime-menu');
    if (!item || !toggle || !titleEl || !menu || typeof normalizeSearchKey !== 'function') return;

    const index = await loadAnimeIndex();
    const anime = index[normalizeSearchKey(seriesName)];
    const title = (anime?.title || '').trim();
    if (!title) return;

    const q = encodeURIComponent(title);
    for (const service of ANIME_SERVICES) {
        const a = document.createElement('a');
        a.className = 'anime-menu-link';
        a.href = service.url(q);
        a.target = '_blank';
        a.rel = service.sponsored ? 'noopener noreferrer sponsored' : 'noopener noreferrer';
        a.title = service.name;

        // アイコンだけ並べる（名前の文字は出さない）ので、サービス名は alt に持たせる
        const logo = document.createElement('img');
        logo.className = 'anime-menu-logo';
        logo.src = `/service-icons/${service.icon}.png`;
        logo.alt = service.name;
        logo.width = 22;
        logo.height = 22;
        a.appendChild(logo);
        menu.appendChild(a);
    }

    // 原作名とアニメ名が違うことがあるので、実際に検索する名前をそのまま出す
    titleEl.textContent = title;
    item.hidden = false;

    const setOpen = (open) => {
        menu.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(menu.hidden));
    // サービスを選んだら閉じる（別タブで開くので、戻った時に開きっぱなしにしない）
    menu.addEventListener('click', (e) => {
        if (e.target.closest('a')) setOpen(false);
    });
    // 欄の外を押す／Escで閉じる
    document.addEventListener('click', (e) => {
        if (!menu.hidden && !item.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !menu.hidden) {
            setOpen(false);
            toggle.focus();
        }
    });
}

// Amazon 検索URL生成（シリーズ名で全巻を一覧させる）
function buildAmazonSearchUrl(seriesName) {
    const q = (seriesName || '').trim();
    if (!q) return null;
    // i=stripbooks で書籍カテゴリに絞る
    return `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}&i=stripbooks&tag=atlascomic-22`;
}

// 外部サイトを新しいタブで開く。
// window.open は使わない。第3引数を渡すとブラウザが「タブ」ではなく
// 「ポップアップウィンドウ」の要求と解釈してブロックすることがあり、
// iOSでホーム画面から起動したPWA（standalone）ではそもそも無反応になるため。
// 実体のある <a> を作ってクリックさせれば、どちらの環境でも通常のリンクとして開く
function openExternal(url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function openAmazonCart(volumes, label) {
    const url = buildAmazonCartUrl(volumes);
    if (!url) {
        alert('カートに入れられる巻が見つかりませんでした。');
        return;
    }
    openExternal(url);
}

function setupCartButtons(sortedVolumes, seriesName) {
    const toggleBtn = document.getElementById('cart-toggle-btn');
    const actions = document.getElementById('volumes-actions');
    const allBtn = document.getElementById('cart-all-btn');
    const rangeBtn = document.getElementById('cart-range-btn');

    // 右上のリンクはメニューを開かず、Amazonでシリーズ名を検索して全巻を一覧させる。
    // （以前は「全巻カートに入れる」だった。メニュー .volumes-actions は hidden のまま使わない）
    // 作品名が取れないと検索しようがないので、そのときはリンクごと出さない
    if (toggleBtn) {
        toggleBtn.removeAttribute('aria-expanded');
        toggleBtn.setAttribute('aria-label', 'Amazonで全巻を検索');
        toggleBtn.title = 'Amazonで全巻を検索';
        const searchUrl = buildAmazonSearchUrl(seriesName);
        if (searchUrl) {
            toggleBtn.href = searchUrl;
            toggleBtn.hidden = false;
        } else {
            toggleBtn.removeAttribute('href');
            toggleBtn.hidden = true;
        }
    }
    if (actions) actions.setAttribute('hidden', '');
    const modal = document.getElementById('range-modal');
    const closeBtn = document.getElementById('range-modal-close');
    const fromInput = document.getElementById('range-from');
    const toInput = document.getElementById('range-to');
    const submitBtn = document.getElementById('range-submit');
    const sub = document.getElementById('range-modal-sub');

    const numbered = sortedVolumes.filter(v => v.volumeNum !== null && v.isbn);
    const minVol = numbered.length ? numbered[0].volumeNum : 1;
    const maxVol = numbered.length ? numbered[numbered.length - 1].volumeNum : 1;

    if (allBtn) {
        allBtn.onclick = () => openAmazonCart(sortedVolumes.filter(v => v.isbn), seriesName);
    }

    if (rangeBtn && modal && fromInput && toInput) {
        rangeBtn.onclick = () => {
            fromInput.min = minVol;
            fromInput.max = maxVol;
            toInput.min = minVol;
            toInput.max = maxVol;
            fromInput.value = minVol;
            toInput.value = maxVol;
            if (sub) sub.textContent = `${seriesName}（${minVol}〜${maxVol}巻）`;
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        };
    }

    function closeRangeModal() {
        if (!modal) return;
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (closeBtn) closeBtn.onclick = closeRangeModal;
    if (modal) modal.onclick = (e) => { if (e.target === modal) closeRangeModal(); };

    // テンキー
    const keypad = document.getElementById('range-keypad');
    let activeInput = fromInput;
    function setActive(inp) {
        activeInput = inp;
        if (fromInput) fromInput.classList.toggle('range-field-active', inp === fromInput);
        if (toInput) toInput.classList.toggle('range-field-active', inp === toInput);
    }
    if (fromInput) fromInput.addEventListener('focus', () => setActive(fromInput));
    if (toInput) toInput.addEventListener('focus', () => setActive(toInput));
    setActive(fromInput);

    if (keypad) {
        keypad.addEventListener('click', (e) => {
            const btn = e.target.closest('.keypad-btn');
            if (!btn || !activeInput) return;
            const key = btn.dataset.key;
            const cur = activeInput.value || '';
            if (key === 'clear') {
                activeInput.value = '';
            } else if (key === 'back') {
                activeInput.value = cur.slice(0, -1);
            } else {
                const next = (cur === '0' ? '' : cur) + key;
                activeInput.value = next.slice(0, 4);
            }
            activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    if (submitBtn) {
        submitBtn.onclick = () => {
            const from = parseInt(fromInput.value, 10);
            const to = parseInt(toInput.value, 10);
            if (isNaN(from) || isNaN(to) || from > to) {
                alert('正しい範囲を入力してください。');
                return;
            }
            const picked = numbered.filter(v => v.volumeNum >= from && v.volumeNum <= to);
            if (picked.length === 0) {
                alert('指定範囲に該当する巻がありません。');
                return;
            }
            openAmazonCart(picked, seriesName);
            closeRangeModal();
        };
    }
}

// 表紙フレームの高さが決まってから、下端に置いたボタンを出す。
// img は height:auto なので読み込み前は高さ0で、bottom:0 のボタンが
// タイトル付近に一瞬出てしまう。load イベントではなく実寸を見ているのは、
// 書影エラー→Google Books 再取得→プレースホルダー差し替えのどの経路でも
// 「高さが付いた時点」で一度だけ出したいため
function revealWhenCoverSized(frame, btn) {
    const show = () => btn.classList.add('is-ready');
    const sized = () => frame.offsetHeight > 40;

    if (sized()) { show(); return; }
    if (typeof ResizeObserver === 'undefined') { show(); return; }

    const ro = new ResizeObserver(() => {
        if (sized()) { ro.disconnect(); show(); }
    });
    ro.observe(frame);
    // 高さが付かないまま終わってもボタンは必ず出す
    setTimeout(() => { ro.disconnect(); show(); }, 3000);
}

// フォロー機能
function setupFollowButton(manga) {
    const followButton = document.getElementById('follow-button');
    if (!followButton) return;
    const followedManga = getFollowedManga();

    const isFollowed = followedManga.some(m => m.title === manga.title);
    if (isFollowed) {
        followButton.classList.add('followed');
    }
    updateFollowButtonText(followButton);

    followButton.addEventListener('click', () => {
        toggleFollow(manga, followButton);
    });
}

function updateFollowButtonText(button) {
    const followed = button.classList.contains('followed');
    const textEl = button.querySelector('.follow-button-text');
    if (textEl) {
        textEl.textContent = followed ? 'Bookmarked' : 'Bookmark';
    }
    // アイコンのみのリボンなので、状態はラベルで伝える。
    // ＋ とチェックの出し分けは .followed を見てCSS側がやる
    const label = followed ? 'ブックマーク済み' : 'ブックマーク';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.setAttribute('aria-pressed', followed ? 'true' : 'false');
}

function toggleFollow(manga, button) {
    let followedManga = getFollowedManga();
    const index = followedManga.findIndex(m => m.title === manga.title);

    if (index > -1) {
        followedManga.splice(index, 1);
        button.classList.remove('followed');
    } else {
        followedManga.push({
            id: manga.id || manga.isbn,
            isbn: manga.isbn || '',
            title: manga.title,
            author: manga.author,
            imageUrl: manga.imageUrl || '',
            color: manga.color || '#666',
        });
        button.classList.add('followed');
        // 追加したときだけリボンを跳ねさせる（外すときは静かに戻す）
        button.classList.remove('just-added');
        void button.offsetWidth; // アニメーションを再生し直すためリフローを挟む
        button.classList.add('just-added');
    }

    updateFollowButtonText(button);
    localStorage.setItem('followedManga', JSON.stringify(followedManga));
}

function getFollowedManga() {
    const stored = localStorage.getItem('followedManga');
    return stored ? JSON.parse(stored) : [];
}

// SEO: meta description / OGPタグを動的に更新
function updateSEOMeta(info) {
    const desc = info.description || '';
    const title = info.title || '';
    const image = info.image || 'https://manga-site-three.vercel.app/icon-512.png';
    const url = window.location.href;

    document.querySelector('meta[name="description"]').setAttribute('content', desc);
    document.querySelector('meta[property="og:title"]').setAttribute('content', title);
    document.querySelector('meta[property="og:description"]').setAttribute('content', desc);
    document.querySelector('meta[property="og:image"]').setAttribute('content', image);
    document.querySelector('meta[property="og:url"]').setAttribute('content', url);
    document.querySelector('meta[name="twitter:title"]').setAttribute('content', title);
    document.querySelector('meta[name="twitter:description"]').setAttribute('content', desc);
    document.querySelector('meta[name="twitter:image"]').setAttribute('content', image);
}

// YouTube動画モーダル
function extractYouTubeId(url) {
    if (!url) return '';
    const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
    return m ? m[1] : '';
}

function openVideoModal(url) {
    const modal = document.getElementById('video-modal');
    const iframe = document.getElementById('video-modal-iframe');
    const id = extractYouTubeId(url);
    if (!modal || !iframe || !id) return;
    iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeVideoModal() {
    const modal = document.getElementById('video-modal');
    const iframe = document.getElementById('video-modal-iframe');
    if (!modal || !iframe) return;
    iframe.src = '';
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// ===== モバイル: ページスライド遷移 =====
// Database等から来たときは右からスライドイン、
// 左上の矢印ボタン or 左→右スワイプで右へスライドアウトして戻る
// 右→左スワイプで全巻一覧ページ（series-volumes.html）へ進む
function setupSlideNavigation() {
    const pageEl = document.querySelector('.detail-main');
    if (!pageEl) return;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const ease = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

    // bfcache復帰時（全巻一覧から戻ってきた時など）にスタイルをリセット
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
            leaving = false;
            pageEl.style.transition = 'none';
            pageEl.style.transform = '';
            pageEl.style.opacity = '';
        }
    });

    // 入場アニメーション（右からスライドイン）
    // どのページから作品をクリックしても発動。戻る/進む・リロードでは発動しない
    const navEntry = performance.getEntriesByType('navigation')[0];
    const isFreshNav = navEntry ? navEntry.type === 'navigate' : true;
    const hasFlag = !!sessionStorage.getItem('detailSlideIn');
    sessionStorage.removeItem('detailSlideIn');
    if (isMobile && (hasFlag || isFreshNav)) {
        pageEl.style.transition = 'none';
        pageEl.style.transform = `translateX(${window.innerWidth}px)`;
        pageEl.style.opacity = '0';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                pageEl.style.transition = `transform 0.42s ${ease}, opacity 0.42s ease`;
                pageEl.style.transform = '';
                pageEl.style.opacity = '';
            });
        });
    }

    // 退場アニメーション（右へスライドアウトして戻る）
    let leaving = false;
    function slideBack() {
        if (leaving) return;
        leaving = true;
        pageEl.style.transition = `transform 0.28s ${ease}, opacity 0.28s ease`;
        pageEl.style.transform = `translateX(${window.innerWidth}px)`;
        pageEl.style.opacity = '0';
        setTimeout(() => {
            if (history.length > 1) {
                history.back();
            } else {
                window.location.href = 'home.html';
            }
        }, 250);
    }

    // 進むアニメーション（左へスライドアウトして全巻一覧へ）
    function slideForward() {
        if (leaving) return;
        const { title } = getDetailParams();
        if (!title) return;
        leaving = true;
        pageEl.style.transition = `transform 0.28s ${ease}, opacity 0.28s ease`;
        pageEl.style.transform = `translateX(${-window.innerWidth}px)`;
        pageEl.style.opacity = '0';
        sessionStorage.setItem('volumesSlideIn', '1');
        setTimeout(() => {
            window.location.href = `series-volumes.html?title=${encodeURIComponent(title)}`;
        }, 250);
    }

    if (!isMobile) return;

    // 左→右スワイプで戻る
    let touchStartX = 0;
    let touchStartY = 0;
    let tracking = false;
    let swiping = false;
    let lastTouchX = 0;
    let lastTouchTime = 0;
    let velocityX = 0;

    function isModalOpen() {
        return document.querySelector('.range-modal-overlay.active, .video-modal-overlay.active, .quickview-overlay.active');
    }

    document.addEventListener('touchstart', (e) => {
        if (isModalOpen() || leaving) { tracking = false; return; }
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        lastTouchX = touchStartX;
        lastTouchTime = Date.now();
        velocityX = 0;
        tracking = true;
        swiping = false;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!tracking || leaving) return;
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;

        if (!swiping) {
            if (Math.abs(dx) <= 8) return;
            // 縦スクロール優勢はスワイプ対象外
            if (Math.abs(dy) > Math.abs(dx) * 1.2) {
                tracking = false;
                return;
            }
            swiping = true;
            pageEl.style.transition = 'none';
        }

        const now = Date.now();
        if (now - lastTouchTime > 0) {
            velocityX = (e.touches[0].clientX - lastTouchX) / (now - lastTouchTime);
        }
        lastTouchX = e.touches[0].clientX;
        lastTouchTime = now;

        pageEl.style.transform = `translateX(${dx}px)`;
        pageEl.style.opacity = Math.max(0.4, 1 - Math.abs(dx) / window.innerWidth * 0.6);
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!tracking || leaving) return;
        tracking = false;
        if (!swiping) return;

        const dx = e.changedTouches[0].clientX - touchStartX;

        if (dx > 60 || velocityX > 0.4) {
            // 左→右: 戻る
            slideBack();
        } else if (dx < -60 || velocityX < -0.4) {
            // 右→左: 全巻一覧へ進む
            slideForward();
        } else {
            // 閾値未満なら元の位置に戻す
            pageEl.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease';
            pageEl.style.transform = '';
            pageEl.style.opacity = '';
        }
    }, { passive: true });
}

// ※ スマホだけ「ストーリー → 作品情報」の順に見せている。DOM は入れ替えず、
//    detail.css の @media (max-width: 768px) で order を付け直している
//    （JSで入れ替えると表示の途中で順番が変わって見えるため）

window.addEventListener('DOMContentLoaded', () => {
    displayMangaDetail();
    setupSlideNavigation();
    const modal = document.getElementById('video-modal');
    const closeBtn = document.getElementById('video-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeVideoModal);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeVideoModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closeVideoModal();
        const rangeModal = document.getElementById('range-modal');
        if (rangeModal && rangeModal.classList.contains('active')) {
            rangeModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
});
