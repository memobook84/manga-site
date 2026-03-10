// ===== Home Portal JS =====

// 今月のピックアップ（仮データ）
const pickupData = [
    {
        title: 'カグラバチ',
        comment: 'ジャンプ次世代の看板作品。妖刀を巡る復讐劇と圧倒的な戦闘描写で、連載開始から一気にトップへ駆け上がった注目のバトル漫画。',
        badge: 'HOT',
        coverUrl: null // APIから自動取得
    },
    {
        title: '正反対な君と僕',
        comment: '2026年アニメ化で話題沸騰。等身大の青春や恋愛をリアルに描き、読むと心がじんわり温かくなる新世代ラブコメの決定版。',
        badge: 'ANIME化',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/1251/9784088831251_1_2.jpg?_ex=800x800'
    },
    {
        title: '本なら売るほど',
        comment: '「このマンガがすごい！2026」オトコ編第1位。本屋を舞台に「本の役割」を問いかける、今最も注目されている話題作。',
        badge: 'No.1',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/1070/9784047381070_1_24.jpg?_ex=800x800'
    },
    {
        title: 'さむわんへるつ',
        comment: '週刊少年ジャンプの新星ラジオラブコメ。深夜ラジオを通じて紡がれる、生徒会長と不思議な少女の青春模様が心に響く。',
        badge: 'NEW',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/8150/9784088848150_1_15.jpg?_ex=800x800'
    },
    {
        title: '妹は知っている',
        comment: 'マンガ大賞2026ノミネート。兄妹の秘密と絆を描く、講談社発の注目サスペンス。',
        badge: '大賞候補',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/7887/9784065387887_1_2.jpg?_ex=800x800'
    },
    {
        title: 'ガチアクタ',
        comment: '講談社の新世代ダークファンタジーバトル。ゴミ処理人の少年が「掃除屋」として裏社会に挑む、圧巻のアクション。',
        badge: 'BATTLE',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/9229/9784065279229_1_3.jpg?_ex=800x800'
    },
    {
        title: '邪神の弁当屋さん',
        comment: 'マンガ大賞2026ノミネート。謹慎処分を受けた神が人間界で弁当屋を営む、心に沁みるファンタジー。弁当に込められた罪と愛の物語。',
        badge: '大賞候補',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/8557/9784065378557_1_2.jpg?_ex=800x800'
    },
    {
        title: '魔男のイチ',
        comment: '次にくるマンガ大賞2025第1位＆マンガ大賞2026ノミネート。「約束のネバーランド」作画・宇佐崎しろが描く新世代ダークファンタジー。',
        badge: '受賞',
        coverUrl: null
    },
    {
        title: '半分姉弟',
        comment: '「このマンガがすごい！2026」オンナ編第1位。血の繋がらない姉弟の微妙な距離感を丁寧に描く、新感覚ヒューマンドラマ。',
        badge: 'No.1',
        coverUrl: null
    },
    {
        title: '怪獣を解剖する',
        comment: 'マンガ大賞2026ノミネート。倒された怪獣を解剖して生態を解き明かす、知的好奇心を刺激する唯一無二のSFドラマ。',
        badge: '大賞候補',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/4217/9784047384217_1_25.jpg?_ex=800x800'
    },
    {
        title: 'おかえり水平線',
        comment: 'マンガ大賞2026ノミネート。銭湯を舞台に、隠し子の登場で揺れる高校生たちの日常を繊細に描くジャンプ＋発の青春群像劇。',
        badge: '大賞候補',
        coverUrl: null
    },
    {
        title: 'RIOT',
        comment: 'マンガ大賞2026ノミネート。田舎町の高校生がZINE（自主制作誌）作りに没頭する、静かで熱いカルチャー青春漫画。',
        badge: '大賞候補',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/0998/9784098630998_1_29.jpg?_ex=800x800'
    }
];

// 表紙画像を取得
async function fetchCoverForTitle(title) {
    try {
        const resp = await fetch(`/api/search?keyword=${encodeURIComponent(title)}&hits=5`);
        if (resp.ok) {
            const data = await resp.json();
            if (data.items && data.items.length > 0) {
                const withCover = data.items.find(it => it.imageUrl && it.hasRealCover);
                if (withCover) return withCover.imageUrl;
                const withImg = data.items.find(it => it.imageUrl);
                if (withImg) return withImg.imageUrl;
            }
        }
    } catch {}
    return null;
}

// ===== ピックアップセクション =====
async function renderPickup() {
    const container = document.getElementById('pickup-grid');
    if (!container) return;

    let html = '';
    pickupData.forEach(item => {
        const titleEncoded = encodeURIComponent(item.title);
        html += `
            <a href="detail.html?title=${titleEncoded}" class="pickup-card">
                <div class="pickup-cover" data-pickup-title="${item.title}"></div>
                <div class="pickup-info">
                    <span class="pickup-badge">${item.badge}</span>
                    <h3>${item.title}</h3>
                    <p>${item.comment}</p>
                </div>
            </a>
        `;
    });
    container.innerHTML = html;

    // 表紙を設定（coverUrlがあればそれを使用、なければAPIから取得）
    for (const item of pickupData) {
        const el = container.querySelector(`.pickup-cover[data-pickup-title="${item.title}"]`);
        if (!el) continue;
        const url = item.coverUrl || await fetchCoverForTitle(item.title);
        if (url) {
            el.innerHTML = `<img src="${url}" alt="${item.title}" loading="lazy">`;
        }
        if (!item.coverUrl) await new Promise(r => setTimeout(r, 300));
    }
}

// ===== 初期化 =====
window.addEventListener('DOMContentLoaded', () => {
    renderPickup();
});
