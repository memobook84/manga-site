// ===== Home Portal JS =====

// 今月のピックアップ（仮データ）
const pickupData = [
    {
        title: 'カグラバチ',
        comment: 'ジャンプ次世代の看板作品。妖刀を巡る復讐劇と圧倒的な戦闘描写で、連載開始から一気にトップへ駆け上がった注目のバトル漫画。',
        adminComment: '正直、1話目で「あ、これヤバいやつだ」って鳥肌立ちました。刀のバトル描写がとにかくかっこいい。呪術廻戦ロスの人、これ読んでください。',
        badge: 'HOT',
        coverUrl: null // APIから自動取得
    },
    {
        title: '正反対な君と僕',
        comment: '2026年アニメ化で話題沸騰。等身大の青春や恋愛をリアルに描き、読むと心がじんわり温かくなる新世代ラブコメの決定版。',
        adminComment: '読むと「あー青春ってこういうのだよな」ってなる。派手な展開はないのに毎回ニヤニヤが止まらない。電車の中で読むのは危険です。',
        badge: 'ANIME化',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/1251/9784088831251_1_2.jpg?_ex=800x800'
    },
    {
        title: '本なら売るほど',
        comment: '「このマンガがすごい！2026」オトコ編第1位。本屋を舞台に「本の役割」を問いかける、今最も注目されている話題作。',
        adminComment: '本好きとして刺さりすぎた。「売れない本に価値はないのか」っていうテーマが重いけど、読後感は不思議と温かい。本屋に行きたくなります。',
        badge: 'No.1',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/1070/9784047381070_1_24.jpg?_ex=800x800'
    },
    {
        title: 'さむわんへるつ',
        comment: '週刊少年ジャンプの新星ラジオラブコメ。深夜ラジオを通じて紡がれる、生徒会長と不思議な少女の青春模様が心に響く。',
        adminComment: '深夜ラジオっていう設定がもう好き。ヒロインの声が聞こえてきそうなくらいセリフ回しが上手い。ジャンプでこの空気感出せるのすごい。',
        badge: 'NEW',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/8150/9784088848150_1_15.jpg?_ex=800x800'
    },
    {
        title: '妹は知っている',
        comment: 'マンガ大賞2026ノミネート。兄妹の秘密と絆を描く、講談社発の注目サスペンス。',
        adminComment: '「妹が何を知っているのか」が気になって一気読みしました。ページめくるたびに不穏さが増していく感じ、好きな人はハマると思う。',
        badge: '大賞候補',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/7887/9784065387887_1_2.jpg?_ex=800x800'
    },
    {
        title: 'ガチアクタ',
        comment: '講談社の新世代ダークファンタジーバトル。ゴミ処理人の少年が「掃除屋」として裏社会に挑む、圧巻のアクション。',
        adminComment: '画力おかしい（褒めてる）。ゴミ処理×バトルっていう設定の時点で勝ちだと思う。泥臭い主人公が好きな人に全力でおすすめしたい。',
        badge: 'BATTLE',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/9229/9784065279229_1_3.jpg?_ex=800x800'
    },
    {
        title: '邪神の弁当屋さん',
        comment: 'マンガ大賞2026ノミネート。謹慎処分を受けた神が人間界で弁当屋を営む、心に沁みるファンタジー。弁当に込められた罪と愛の物語。',
        adminComment: '設定だけ聞くとギャグっぽいけど、めちゃくちゃ泣ける。弁当を通じて人を救う話なんだけど、自分もなんか救われた気持ちになりました。',
        badge: '大賞候補',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/8557/9784065378557_1_2.jpg?_ex=800x800'
    },
    {
        title: '魔男のイチ',
        comment: '次にくるマンガ大賞2025第1位＆マンガ大賞2026ノミネート。「約束のネバーランド」作画・宇佐崎しろが描く新世代ダークファンタジー。',
        adminComment: '宇佐崎しろ先生の絵が進化しすぎてて震える。ネバランとは全然違う方向性なのに、やっぱり引き込まれる。「次にくる」どころかもう来てます。',
        badge: '受賞',
        coverUrl: null
    },
    {
        title: '半分姉弟',
        comment: '「このマンガがすごい！2026」オンナ編第1位。血の繋がらない姉弟の微妙な距離感を丁寧に描く、新感覚ヒューマンドラマ。',
        adminComment: '二人の距離感が絶妙すぎてもどかしい。「家族って何だろう」って考えさせられる。静かな作品だけど、読んだ後しばらく頭から離れなかった。',
        badge: 'No.1',
        coverUrl: null
    },
    {
        title: '怪獣を解剖する',
        comment: 'マンガ大賞2026ノミネート。倒された怪獣を解剖して生態を解き明かす、知的好奇心を刺激する唯一無二のSFドラマ。',
        adminComment: '「怪獣を倒した後どうするの？」って視点が天才すぎる。解剖シーンがリアルで気持ち悪いのに目が離せない。こういう発想の漫画もっと増えてほしい。',
        badge: '大賞候補',
        coverUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/4217/9784047384217_1_25.jpg?_ex=800x800'
    },
    {
        title: 'おかえり水平線',
        comment: 'マンガ大賞2026ノミネート。銭湯を舞台に、隠し子の登場で揺れる高校生たちの日常を繊細に描くジャンプ＋発の青春群像劇。',
        adminComment: '銭湯の湯気越しに見える人間関係がリアルでいい。重いテーマなのに読み味は優しい。ジャンプ＋ってこういう作品が読めるからやめられない。',
        badge: '大賞候補',
        coverUrl: null
    },
    {
        title: 'RIOT',
        comment: 'マンガ大賞2026ノミネート。田舎町の高校生がZINE（自主制作誌）作りに没頭する、静かで熱いカルチャー青春漫画。',
        adminComment: '「何かを作りたい」って衝動を思い出させてくれる作品。田舎の閉塞感とZINEの自由さの対比がたまらない。創作やってる人は絶対読んでほしい。',
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
                    <div class="admin-comment">
                        <div class="admin-header">
                            <span class="admin-icon"><svg viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg></span>
                            <span class="admin-label">管理人</span>
                        </div>
                        <div class="admin-divider"></div>
                        <p>${item.adminComment}</p>
                    </div>
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
