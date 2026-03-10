// 管理人おすすめ漫画データ
const recommendData = [
    {
        genre: 'バトル・アクション',
        icon: '<i class="ph-bold ph-boxing-glove" style="font-size:20px"></i>',
        works: [
            {
                title: 'ONE PIECE',
                review: '冒険漫画の最高傑作。海賊王を目指すルフィと仲間たちの壮大な物語は、笑いあり涙ありの王道エンターテイメント。伏線回収の見事さは漫画史に残るレベル。',
                recommend: '王道の冒険・友情ものが好きな人'
            },
            {
                title: '呪術廻戦',
                review: '呪いという独自の設定をベースにした本格バトル漫画。五条悟をはじめとするキャラクターの魅力が圧倒的。戦闘シーンの迫力と頭脳戦の緊張感が両立している。',
                recommend: 'ダークな世界観のバトルが好きな人'
            },
            {
                title: 'チェンソーマン',
                review: '藤本タツキの天才的センスが光る作品。予測不能な展開の連続で、ページをめくる手が止まらない。従来の少年漫画の枠を超えた衝撃作。',
                recommend: '型破りな作品を求めている人'
            },
            {
                title: '鬼滅の刃',
                review: '家族の絆と鬼殺の使命を描いた大ヒット作。炭治郎の優しさと強さに心を打たれる。全23巻で完結しており、一気読みに最適。',
                recommend: '完結済みの名作を読みたい人'
            },
            {
                title: '僕のヒーローアカデミア',
                review: 'アメコミと少年漫画を見事に融合させたヒーロー作品。個性豊かなキャラクターと熱い展開の連続。デクの成長物語として王道の面白さがある。',
                recommend: 'ヒーローものが好きな人'
            },
            {
                title: 'HUNTER×HUNTER',
                review: '冨樫義博が描く究極の頭脳バトル漫画。念能力のシステムは漫画史上最も完成された能力設定の一つ。特にキメラアント編は漫画の到達点。',
                recommend: '頭脳戦・心理戦が好きな人'
            },
            {
                title: 'NARUTO',
                review: '落ちこぼれ忍者ナルトが火影を目指す成長物語。忍術バトルの迫力と、孤独から絆を見つけていくテーマが胸を打つ。世界中で愛される作品。',
                recommend: '努力と成長の物語が好きな人'
            },
            {
                title: 'BLEACH',
                review: 'オシャレすぎる死神バトル漫画。久保帯人のセンスが爆発したキャラデザインとセリフ回しは唯一無二。卍解のかっこよさは異常。',
                recommend: 'スタイリッシュなバトルが好きな人'
            },
            {
                title: 'キングダム',
                review: '春秋戦国時代の中国を舞台にした歴史バトル漫画。大規模な戦争シーンの迫力と、信の真っすぐな生き様に熱くなる。歴史好きにもおすすめ。',
                recommend: '歴史もの・戦争ものが好きな人'
            },
            {
                title: 'ドラゴンボール',
                review: 'バトル漫画の原点にして頂点。鳥山明が生み出した戦闘表現は、後の全てのバトル漫画に影響を与えた。シンプルだからこそ面白い、不朽の名作。',
                recommend: '漫画の原点に触れたい人'
            }
        ]
    },
    {
        genre: 'スポーツ',
        icon: '<i class="ph-bold ph-baseball-helmet" style="font-size:20px"></i>',
        works: [
            {
                title: 'ブルーロック',
                review: 'サッカー×デスゲームという斬新な設定。世界一のストライカーを生み出すための異色のプロジェクトが熱い。個人技と駆け引きの描写が秀逸。',
                recommend: 'サッカー好き、心理戦が好きな人'
            },
            {
                title: 'ハイキュー!!',
                review: 'バレーボール漫画の決定版。チームスポーツの魅力を余すことなく描き切った傑作。負けた側にもドラマがあるのがこの作品の凄さ。',
                recommend: 'チームスポーツの感動を味わいたい人'
            },
            {
                title: 'SLAM DUNK',
                review: '日本にバスケブームを巻き起こした伝説的作品。不良少年・桜木花道の成長と、湘北メンバーとの絆。山王戦は漫画史に残る名勝負。',
                recommend: 'スポーツ漫画の最高峰を読みたい人'
            },
            {
                title: 'アオアシ',
                review: 'Jユースを舞台にしたリアルサッカー漫画。戦術理解とサッカーIQの描写が圧巻。サッカーの見方が変わる知的な作品。',
                recommend: 'リアルなサッカー漫画を求める人'
            },
            {
                title: 'ダイヤのA',
                review: '高校野球の熱さを凝縮した作品。エースを目指す沢村栄純の泥臭い努力と成長が胸を打つ。ライバルたちとの切磋琢磨も見どころ。',
                recommend: '野球好き、努力の物語が好きな人'
            },
            {
                title: '弱虫ペダル',
                review: 'オタク少年がロードレースの世界に飛び込む異色作。自転車レースの駆け引きと坂道の隠れた才能が開花していく過程がアツい。',
                recommend: '意外なスポーツに興味がある人'
            },
            {
                title: 'キャプテン翼',
                review: 'サッカー漫画の元祖。世界中のプロサッカー選手に影響を与えた伝説的作品。大空翼の必殺シュートは少年の夢そのもの。',
                recommend: 'サッカーの原点に触れたい人'
            },
            {
                title: 'MAJOR',
                review: '茂野吾郎の野球人生を幼少期からプロまで描いた大河ドラマ。父子の絆、ライバルとの戦い、挫折と復活。野球漫画の王道。',
                recommend: '一人の選手の人生を追いたい人'
            },
            {
                title: 'テニスの王子様',
                review: 'テニスを超えたテニス漫画。個性的なキャラクターと必殺技の数々は少年漫画ならでは。読み始めたら止まらないエンタメ性がある。',
                recommend: '派手な演出のスポーツ漫画が好きな人'
            },
            {
                title: 'BLUE GIANT',
                review: 'ジャズに全てを懸ける青年の物語。音が聞こえてくるような圧倒的な画力と、主人公の情熱に心を揺さぶられる。スポーツではないが、同じ熱さがある。',
                recommend: '音楽に情熱を感じたい人'
            }
        ]
    },
    {
        genre: 'ファンタジー',
        icon: '<i class="ph-bold ph-magic-wand" style="font-size:20px"></i>',
        works: [
            {
                title: '葬送のフリーレン',
                review: '魔王を倒した後の世界を描く、静かで美しいファンタジー。エルフの魔法使いフリーレンが「人を知ること」を学んでいく旅路に心が温まる。',
                recommend: '穏やかで深みのある物語が好きな人'
            },
            {
                title: 'ダンジョン飯',
                review: 'ダンジョンのモンスターを料理して食べるという発想が天才的。緻密な世界設定とグルメ描写、そしてシリアスなストーリーが見事に融合。',
                recommend: 'ユニークな設定の作品が好きな人'
            },
            {
                title: 'メイドインアビス',
                review: '可愛い絵柄からは想像できないハードな冒険譚。深淵の穴「アビス」の神秘と恐怖を描く世界観は唯一無二。度肝を抜かれる展開の連続。',
                recommend: '冒険のロマンと覚悟を求める人'
            },
            {
                title: '鋼の錬金術師',
                review: '錬金術と兄弟の絆を描いた完璧なファンタジー。ストーリー構成、キャラクター、テーマ性、全てが高水準。完結済み漫画の最高傑作の一つ。',
                recommend: '完成度の高い物語を求める人'
            },
            {
                title: 'ヴィンランド・サガ',
                review: 'ヴァイキングを題材にした壮大な歴史ファンタジー。復讐から平和へ、トルフィンの精神的成長が圧巻。暴力とは何か、本当の強さとは何かを問いかける。',
                recommend: '重厚なテーマの作品が好きな人'
            },
            {
                title: 'ベルセルク',
                review: 'ダークファンタジーの金字塔。ガッツの過酷な運命と、それでも剣を振るい続ける姿は圧倒的。三浦建太郎の画力は人類の到達点。',
                recommend: 'ダークで壮大な物語を求める人'
            },
            {
                title: '進撃の巨人',
                review: '巨人が人類を脅かす世界という衝撃的な設定。物語が進むにつれて明かされる真実は想像の遥か上を行く。最終話まで見届けるべき作品。',
                recommend: '衝撃的な展開を求める人'
            },
            {
                title: 'SPY×FAMILY',
                review: 'スパイ×殺し屋×超能力者の偽装家族コメディ。シリアスな設定なのにほっこりする、絶妙なバランス感覚。アーニャの可愛さは正義。',
                recommend: '家族の温かさとコメディを楽しみたい人'
            },
            {
                title: '約束のネバーランド',
                review: '孤児院の子供たちが過酷な運命に立ち向かう脱出劇。序盤の衝撃と緊張感は息を飲むほど。頭脳戦とサバイバルの融合が見事。',
                recommend: 'サスペンスフルな展開が好きな人'
            },
            {
                title: 'Dr.STONE',
                review: '文明が滅びた世界を科学の力で復興させるという斬新な設定。科学の面白さを漫画で伝える手腕が素晴らしい。知的好奇心を刺激される。',
                recommend: '科学・ものづくりに興味がある人'
            }
        ]
    },
    {
        genre: 'ミステリー・サスペンス',
        icon: '<i class="ph-bold ph-binoculars" style="font-size:20px"></i>',
        works: [
            {
                title: 'デスノート',
                review: 'ノートに名前を書かれた人間が死ぬ——。夜神月とLの頭脳戦は漫画史上最高の心理戦。緊張感が最初から最後まで途切れない完璧なサスペンス。',
                recommend: '頭脳戦・心理戦が好きな人'
            },
            {
                title: 'ミステリと言う勿れ',
                review: '整くんの独特な語り口で事件と人の心を解きほぐしていく。ミステリーでありながら、人生の真理を突く言葉の数々が刺さる。読後感が良い。',
                recommend: '人間ドラマ重視のミステリーが好きな人'
            },
            {
                title: 'MONSTER',
                review: '浦沢直樹の最高傑作の一つ。天才外科医テンマと怪物ヨハンの追跡劇。ヨーロッパを舞台にしたスケールの大きいサスペンスに引き込まれる。',
                recommend: '本格的なサスペンスを求める人'
            },
            {
                title: '20世紀少年',
                review: '「ともだち」の正体を巡るミステリー。少年時代の記憶と現在が交錯するストーリー構成が秀逸。浦沢直樹の描く不気味さは読む者を離さない。',
                recommend: '壮大なスケールのミステリーが好きな人'
            },
            {
                title: '僕だけがいない街',
                review: 'タイムリープ×殺人事件という組み合わせが絶妙。過去に戻って事件を防ごうとする主人公の奮闘に手に汗握る。全9巻で完結、一気読み推奨。',
                recommend: 'タイムリープものが好きな人'
            },
            {
                title: '東京喰種',
                review: '人間と喰種の境界で揺れる主人公の苦悩を描いたダークサスペンス。石田スイの繊細な心理描写と残酷な世界観が独特の魅力を放つ。',
                recommend: 'ダークな心理描写が好きな人'
            },
            {
                title: 'PLUTO',
                review: '手塚治虫の「鉄腕アトム」を浦沢直樹がリメイク。ロボットと人間の境界を問う哲学的テーマと、ミステリーとしての完成度が両立した傑作。',
                recommend: 'SFとミステリーの融合を楽しみたい人'
            },
            {
                title: '薬屋のひとりごと',
                review: '後宮を舞台にした中華風ミステリー。毒と薬の知識で事件を解く猫猫の推理が痛快。歴史ロマンとミステリーの融合が新鮮。',
                recommend: '中華風の世界観が好きな人'
            },
            {
                title: '暗殺教室',
                review: '謎の超生物を暗殺するという異色の学園ミステリー。ユーモアと感動のバランスが絶妙で、最後は必ず泣ける。教育漫画としても秀逸。',
                recommend: '笑いと感動を同時に味わいたい人'
            },
            {
                title: '寄生獣',
                review: '右手に寄生した生物ミギーとの共生を描くSFサスペンス。「人間とは何か」という問いを突きつける哲学的作品。今読んでも全く色褪せない。',
                recommend: 'SFと哲学的テーマが好きな人'
            }
        ]
    },
    {
        genre: '恋愛・ラブコメ',
        icon: '<i class="ph-bold ph-confetti" style="font-size:20px"></i>',
        works: [
            {
                title: 'かぐや様は告らせたい',
                review: '天才たちの恋愛頭脳戦。告白したら負けという設定から繰り広げられるコメディが最高に面白い。ギャグとシリアスの切り替えが見事。',
                recommend: 'ラブコメの最高峰を読みたい人'
            },
            {
                title: '五等分の花嫁',
                review: '五つ子ヒロインの誰と結ばれるのか——。それぞれ個性的な五つ子の魅力と、花嫁が誰かを推理する楽しさが同時に味わえる。',
                recommend: 'ヒロインレースを楽しみたい人'
            },
            {
                title: '推しの子',
                review: '芸能界の光と闇を描くサスペンス×ラブストーリー。アイドル、俳優、YouTuber、現代のエンタメ業界をリアルに描写。予想外の展開の連続。',
                recommend: '芸能界の裏側に興味がある人'
            },
            {
                title: 'めぞん一刻',
                review: '高橋留美子が描く大人のラブストーリー。一刻館の住人たちとのドタバタ劇と、響子さんへの一途な恋。ラブコメの永遠の名作。',
                recommend: '大人の恋愛漫画を読みたい人'
            },
            {
                title: 'ちはやふる',
                review: '競技かるたに青春を懸ける少女の物語。スポーツ漫画のような熱さと、繊細な恋愛描写が同居する唯一無二の作品。千早の情熱に胸が熱くなる。',
                recommend: '青春と恋愛を同時に味わいたい人'
            },
            {
                title: 'のだめカンタービレ',
                review: 'クラシック音楽を題材にした爆笑ラブコメ。天才だけど変態なのだめと、完璧主義の千秋のコンビが最高。音楽の魅力も伝わる名作。',
                recommend: '音楽×コメディを楽しみたい人'
            },
            {
                title: '3月のライオン',
                review: '孤独な天才棋士の再生の物語。将棋の世界と、あかり達との温かい日常が対比的に描かれる。羽海野チカの繊細な表現力が光る。',
                recommend: '心に沁みる物語を求める人'
            },
            {
                title: 'タッチ',
                review: 'あだち充の代表作。野球と恋愛を軸にした青春物語。双子の兄弟と幼馴染の三角関係。「南を甲子園に連れてって」は永遠の名セリフ。',
                recommend: '青春の甘酸っぱさを味わいたい人'
            },
            {
                title: 'うる星やつら',
                review: '高橋留美子が生み出したドタバタSFラブコメの元祖。ラムちゃんの「ダーリン」は日本中を虜にした。今読んでもテンポの良さに脱帽。',
                recommend: 'SFコメディが好きな人'
            },
            {
                title: 'BEASTARS',
                review: '肉食獣と草食獣が共存する世界の学園ドラマ。種族間の恋愛タブーに切り込む社会派作品。レゴシとハルの関係性に目が離せない。',
                recommend: '社会派の恋愛作品に興味がある人'
            }
        ]
    }
];

// おすすめページを表示
async function displayRecommendations() {
    const container = document.getElementById('recommend-container');
    container.innerHTML = '';

    // ジャンルナビゲーション
    const genreNav = document.createElement('div');
    genreNav.className = 'genre-nav';
    recommendData.forEach((genre, i) => {
        const btn = document.createElement('a');
        btn.href = `#genre-${i}`;
        btn.className = 'genre-nav-item';
        btn.innerHTML = `${genre.icon}<span>${genre.genre}</span>`;
        genreNav.appendChild(btn);
    });
    container.appendChild(genreNav);

    // 各ジャンルセクション
    for (let gi = 0; gi < recommendData.length; gi++) {
        const genre = recommendData[gi];
        const section = document.createElement('div');
        section.className = 'genre-section';
        section.id = `genre-${gi}`;

        let html = `<h2 class="genre-title">${genre.icon}<span>${genre.genre}</span></h2>`;
        html += '<div class="works-list">';

        for (let wi = 0; wi < genre.works.length; wi++) {
            const work = genre.works[wi];
            const rank = wi + 1;
            const titleEncoded = encodeURIComponent(work.title);

            html += `
                <div class="work-item" data-title="${work.title}">
                    <div class="work-rank">${rank}</div>
                    <a href="detail.html?title=${titleEncoded}" class="work-cover-link">
                        <div class="work-cover" data-search-title="${work.title}"></div>
                    </a>
                    <div class="work-content">
                        <h3 class="work-title">
                            <a href="detail.html?title=${titleEncoded}">${work.title}</a>
                        </h3>
                        <p class="work-review">${work.review}</p>
                        <p class="work-recommend"><span class="recommend-label">こんな人に</span>${work.recommend}</p>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        section.innerHTML = html;
        container.appendChild(section);
    }
}

// 表紙画像を検索して取得
async function fetchCover(title) {
    // まずタイトルのみで検索（「タイトル 1」だとヒットしないケースが多い）
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

// 表紙画像を取得して表示（1件ずつ順番に処理）
async function loadCovers() {
    const covers = document.querySelectorAll('.work-cover[data-search-title]');
    for (const el of covers) {
        const title = el.dataset.searchTitle;
        const url = await fetchCover(title);
        if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = title;
            img.loading = 'lazy';
            el.appendChild(img);
        }
        await new Promise(r => setTimeout(r, 350));
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('recommend-container');
    if (!container) return; // home.htmlなど、recommend-containerがないページではスキップ
    await displayRecommendations();
    loadCovers();
});
