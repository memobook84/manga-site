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

    if (!authorName) {
        document.getElementById('author-name').textContent = '著者が指定されていません';
        return;
    }

    // ページタイトルを更新
    document.title = `${authorName} - THE MANGA STORE`;
    document.getElementById('author-name').textContent = authorName;

    // Wikipedia APIから著者情報を取得
    const cleanName = authorName.replace(/[\s\u3000]+/g, '');
    let bio = authorBiosFallback[authorName] || authorBiosFallback[cleanName] || '';
    let wikipediaUrl = '';
    try {
        const wikiResp = await fetch(`/api/author?name=${encodeURIComponent(authorName)}`);
        if (wikiResp.ok) {
            const wikiData = await wikiResp.json();
            if (wikiData.extract) {
                bio = wikiData.extract;
            }
            if (wikiData.description) {
                document.getElementById('author-name').textContent = `${authorName}`;
                const descEl = document.getElementById('author-description');
                if (descEl) descEl.textContent = wikiData.description;
            }
            wikipediaUrl = wikiData.wikipediaUrl || '';
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

    if (wikipediaUrl) {
        const wikiLink = document.createElement('a');
        wikiLink.href = wikipediaUrl;
        wikiLink.target = '_blank';
        wikiLink.rel = 'noopener noreferrer';
        wikiLink.textContent = 'Wikipedia で詳しく見る →';
        wikiLink.style.cssText = 'display:inline-block;margin-top:12px;color:var(--color-link);font-size:13px;text-decoration:none;border-bottom:1px solid var(--color-link);';
        bioEl.appendChild(wikiLink);
    }

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

    if (works.length === 0) {
        document.getElementById('author-works-count').textContent = '作品数: 0作品';
        document.getElementById('representative-works').innerHTML = '<li>作品が見つかりませんでした</li>';
        return;
    }

    document.getElementById('author-works-count').textContent = `作品数: ${works.length}作品`;

    // 代表作品リストを表示
    const representativeWorksList = document.getElementById('representative-works');
    representativeWorksList.innerHTML = '';
    works.slice(0, 3).forEach(work => {
        const li = document.createElement('li');
        li.textContent = work.title;
        representativeWorksList.appendChild(li);
    });

    // 作品一覧を表示
    displayAuthorWorks(works);

}

// APIから著者の作品を検索
async function fetchAuthorWorks(authorName) {
    try {
        const response = await fetch(`/api/search?keyword=${encodeURIComponent(authorName)}&hits=30`);
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        const adapted = adaptApiResponse(data);
        // 著者名でフィルタリング（API結果が著者名以外にもマッチする可能性があるため）
        return adapted.items.filter(item =>
            item.author && item.author.includes(authorName)
        );
    } catch (err) {
        console.warn('著者検索失敗:', err);
        return null;
    }
}

// 著者の作品一覧を表示
function displayAuthorWorks(works) {
    const worksGrid = document.getElementById('author-works-grid');
    worksGrid.innerHTML = '';

    works.forEach(item => {
        const workItem = document.createElement('div');
        workItem.className = 'work-item';

        const imageHtml = createImageElement(item);

        workItem.innerHTML = `
            ${imageHtml}
            <h3>${item.title}</h3>
        `;

        workItem.addEventListener('click', () => {
            if (item.isbn) {
                window.location.href = `detail.html?isbn=${item.isbn}&title=${encodeURIComponent(item.title)}`;
            } else {
                window.location.href = `detail.html?id=${item.id}`;
            }
        });

        worksGrid.appendChild(workItem);
    });
}

// ページ読み込み時に実行
window.addEventListener('DOMContentLoaded', displayAuthorDetail);
