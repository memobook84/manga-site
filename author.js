// 著者の略歴データ（フォールバック用）
const authorBiosFallback = {
    '尾田栄一郎': '1975年1月1日生まれ、熊本県出身。1997年に『ONE PIECE』の連載を開始。世界中で愛される国民的漫画家として、数々の記録を打ち立てている。',
    '吾峠呼世晴': '福岡県出身の漫画家。2016年から2020年まで『鬼滅の刃』を週刊少年ジャンプにて連載。独特の世界観と心に残る名言で、社会現象を巻き起こした。',
    '芥見下々': '岩手県出身の漫画家。2018年より『呪術廻戦』を週刊少年ジャンプにて連載中。ダークファンタジーとバトルアクションを融合させた作風で人気を誇る。',
    '遠藤達哉': '茨城県出身の漫画家。2019年より『SPY×FAMILY』を少年ジャンプ+にて連載中。スパイ×殺し屋×超能力者という異色の家族を描いたホームコメディ。',
    '藤本タツキ': '秋田県出身の漫画家。2019年から『チェンソーマン』を連載。斬新な発想と予測不可能な展開で、新世代のカリスマ的存在。',
    '堀越耕平': '愛知県出身の漫画家。2014年より『僕のヒーローアカデミア』を連載中。王道ヒーロー漫画として国内外で絶大な人気を誇る。'
};

// URLパラメータから著者名を取得
function getAuthorNameFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('name') || '';
}

// 著者の詳細を表示（メイン処理）
async function displayAuthorDetail() {
    const authorName = decodeURIComponent(getAuthorNameFromUrl());

    const nameEl = document.getElementById('author-name');
    const romajiEl = document.getElementById('author-romaji');

    if (!authorName) {
        nameEl.textContent = '著者が指定されていません';
        return;
    }

    // ページタイトルを更新
    document.title = `${authorName} - THE MANGA STORE`;
    nameEl.textContent = authorName;

    // Wikipedia APIから著者情報を取得
    const cleanName = authorName.replace(/[\s\u3000]+/g, '');
    let bio = authorBiosFallback[authorName] || authorBiosFallback[cleanName] || '';
    try {
        const wikiResp = await fetch(`/api/author?name=${encodeURIComponent(authorName)}`);
        if (wikiResp.ok) {
            const wikiData = await wikiResp.json();
            if (wikiData.extract) {
                bio = wikiData.extract;
            }
            if (wikiData.romaji && romajiEl) {
                romajiEl.textContent = wikiData.romaji;
            }
        }
    } catch (err) {
        console.warn('Wikipedia情報取得失敗:', err);
    }

    if (!bio) {
        bio = `${cleanName}による作品。`;
    }

    const bioEl = document.getElementById('author-bio');
    bioEl.innerHTML = '';

    // Wikipediaのextractをセクション分けして整形表示
    const sections = bio.split(/\n+/);
    sections.forEach(section => {
        const trimmed = section.trim();
        if (!trimmed) return;
        // セクション見出し（== xxx ==）を検出
        const headingMatch = trimmed.match(/^=+\s*(.+?)\s*=+$/);
        if (headingMatch) {
            const h = document.createElement('strong');
            h.textContent = headingMatch[1];
            h.style.cssText = 'display:block;margin-top:16px;margin-bottom:6px;font-size:15px;';
            bioEl.appendChild(h);
        } else {
            const p = document.createElement('p');
            p.textContent = trimmed;
            p.style.cssText = 'margin:0 0 8px 0;';
            bioEl.appendChild(p);
        }
    });

    // APIから著者の作品を取得
    let works = await fetchAuthorWorks(authorName);

    // APIで取得できなかった場合、ローカルデータベースからフォールバック
    if (!works || works.length === 0) {
        const localWorks = mangaDatabase.filter(m => m.author === authorName);
        works = localWorks.map((m, i) => ({
            ...m,
            imageUrl: '',
            isbn: '',
            itemUrl: '',
            seriesName: m.label || '',
        }));
    }

    // SEO: 動的にmeta/OGPを更新
    const workTitles = works.slice(0, 3).map(w => w.title).join('、');
    const seoDesc = `${authorName}の作品一覧。${workTitles}など${works.length}作品を掲載。`;
    updateSEOMeta({
        title: `${authorName} - ATLAS COMIC`,
        description: seoDesc,
    });

    if (works.length === 0) {
        document.getElementById('author-works-grid').innerHTML = '<p class="author-works-empty">作品が見つかりませんでした</p>';
        return;
    }

    // 作品一覧を表示
    displayAuthorWorks(works);

}

// 著者名の表記ゆれ吸収（楽天は「尾田 栄一郎」のように姓名の間に空白が入る）
function normalizeAuthorName(name) {
    return (name || '').replace(/[\s　]/g, '');
}

// APIから著者の作品を検索。
// タイトル検索だと著者名がタイトルに入っている本しか当たらないので、
// 楽天の author 検索を使う（例: 尾田栄一郎 → title検索7件 / author検索204件）
const AUTHOR_MAX_PAGES = 4;

async function fetchAuthorWorks(authorName) {
    const target = normalizeAuthorName(authorName);
    const works = [];
    const seen = new Set();
    try {
        for (let page = 1; page <= AUTHOR_MAX_PAGES; page++) {
            const data = await cachedFetch(`/api/search?author=${encodeURIComponent(authorName)}&hits=30&page=${page}`);
            const adapted = adaptApiResponse(data);
            adapted.items.forEach(item => {
                // 共著（「岩崎 優次/芥見 下々」）も拾えるよう、空白を除いた部分一致で判定
                if (!item.author || !normalizeAuthorName(item.author).includes(target)) return;
                const t = item.title || '';
                if (/セット|全巻|BOX|ボックス|合本|一括/i.test(t)) return;
                const key = item.isbn || t;
                if (seen.has(key)) return;
                seen.add(key);
                works.push(item);
            });
            if (page >= (data.pageCount || 1)) break;
        }
        return works;
    } catch (err) {
        console.warn('著者検索失敗:', err);
        return works.length ? works : null;
    }
}

// 著者の作品一覧を表示（シリーズ単位でグループ化）
function displayAuthorWorks(works) {
    const worksGrid = document.getElementById('author-works-grid');
    worksGrid.innerHTML = '';

    // シリーズ名でグループ化し、代表（1巻目 or 先頭）と巻数を集計する
    const seriesMap = new Map();
    works.forEach(item => {
        const seriesName = extractSeriesName(item.title) || item.title;
        if (!seriesMap.has(seriesName)) {
            seriesMap.set(seriesName, { seriesName, item, volumeCount: 1 });
            return;
        }
        const entry = seriesMap.get(seriesName);
        entry.volumeCount++;
        // より小さい巻数のものを代表にする
        const extractNum = t => { const m = t.match(/(\d+)[巻\s　）)]/); return m ? parseInt(m[1]) : null; };
        const currentNum = extractNum(entry.item.title);
        const itemNum = extractNum(item.title);
        if (itemNum !== null && (currentNum === null || itemNum < currentNum)) {
            entry.item = item;
        }
    });

    // 検索結果と同じ並び：ヒットした巻数が多いシリーズを上に。
    // 同数ならタイトル順で並びを安定させる
    const seriesList = [...seriesMap.values()].sort((a, b) =>
        b.volumeCount - a.volumeCount ||
        a.seriesName.localeCompare(b.seriesName, 'ja')
    );

    seriesList.forEach(({ seriesName, item }) => {
        const workItem = document.createElement('div');
        workItem.className = 'work-item';

        const imageHtml = createImageElement(item);

        workItem.innerHTML = `
            ${imageHtml}
            <h3>${seriesName}</h3>
        `;

        workItem.addEventListener('click', () => {
            window.location.href = `detail.html?title=${encodeURIComponent(seriesName)}`;
        });

        worksGrid.appendChild(workItem);
    });
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

// ページ読み込み時に実行
window.addEventListener('DOMContentLoaded', displayAuthorDetail);
