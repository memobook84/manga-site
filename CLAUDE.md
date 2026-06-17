# CLAUDE.md - ATLAS COMIC

## ルール
- コンテキストがいっぱいになりそうになったら `/compact` コマンドを実行してください
- 進捗報告は `進捗報告.md` に追記すること（このファイルには書かない）
- TODOの管理は `TODO.md` で行うこと

## 基本情報
- パス: `C:\Users\memob\Desktop\manga-site`
- 本番URL: https://manga-site-three.vercel.app
- GitHub: https://github.com/memobook84/manga-site
- デプロイ: `npx vercel --prod --yes`
- API: 楽天ブックスAPI + Google Books API（カバーフォールバック）

## 構成ファイル
- `index.html` / `search.js` / `search.css` — 検索ページ（Pickup）
- `home.html` / `database.js` / `style.css` — ホーム（正式トップ＝Databaseカタログ。ルート「/」とPWA起動先）
- `menu.html` — メニューページ（旧 home.html のメニューを移設）
- `database.html` — `home.html` へのリダイレクトスタブ（旧リンク・ブックマーク互換用）
- `script.js` / `home-portal.css` / `home-portal.js` — 旧Pickup用CSS/JS
- `detail.html` / `detail.js` / `detail.css` — 作品（シリーズ）ページ
- `volume.html` / `volume.js` / `volume.css` — 単行本ページ
- `author.html` / `author.js` / `author.css` — 著者ページ
- `new-releases.html` / `new-releases.js` / `new-releases.css` — 新刊ページ
- `ranking.html` / `ranking.js` / `ranking.css` — Popularページ
- `follow.html` / `follow.js` / `follow.css` — Favoritesページ
- `recommend.html` / `recommend.js` / `recommend.css` — おすすめ漫画ページ
- `series-volumes.html` / `series-volumes.js` / `series-volumes.css` — 全巻一覧ページ（作品ページから左スワイプで遷移）
- `privacy.html` / `about.html` / `legal.css` — 法的ページ
- `rakuten-adapter.js` — API変換・画像生成・共通関数
- `manga-data.js` — 漫画データ
- `lightning.js` — 雷エフェクト
- `splash.js` — スプラッシュアニメーション
- `api/books.js` — 楽天BooksBook API
- `api/search.js` — 楽天検索API
- `api/cover.js` — Google Books カバー取得API
- `api/author.js` — 著者検索API
- `scripts/collect.js` — データ収集バッチ
- `data/manga-all.json` — 全シリーズJSON
- `data/pages/page-{N}.json` — ページ分割JSON
- `data/meta.json` — メタ情報

## 技術メモ
- 表紙画像: `object-fit:contain; object-position:bottom;` で下寄せ（高さ240px）
- extractSeriesName()は rakuten-adapter.js に配置（両ページで共有）
- 出版社フィルタ: 集英社・小学館・講談社のみ掲載
- hasRealCover検出: noimage、no_image、/0000/ パターン
- フォント: ヘッダータイトル = Montserrat 700、ピックアップ見出し = Michroma、サイドバー見出し = Archivo Black 900
- ヘッダータイトル色: #D8052E
- アプリアイコンとヘッダーロゴ/ファビコンは別画像（黒背景/白背景）
- ボトムナビ: モバイルのみ表示、サブページにはBackボタン付き
- ダークモード: ホームページのみ実装、localStorage保持、head内早期適用
- スプラッシュ: sessionStorage制御で同一セッション内1回のみ表示（index.html と home.html=ホーム に設置）
- スワイプナビ: volume.htmlで左右スワイプによる巻移動（指を右→左に動かす＝次の巻、左→右に動かす＝前の巻。ユーザーの言う「右にスワイプ＝次」は“ページが右に進む”の意）
- ページスライド遷移（モバイル）: ホーム（home.html＝Databaseカタログ）→detail.htmlは右からスライドイン。detail.htmlは左→右スワイプで戻る、右→左スワイプでseries-volumes.html（全巻一覧）へ（上部の左右ページ送り矢印ボタンは廃止＝スワイプのみ）。一覧から左→右スワイプで作品ページに戻る。sessionStorageフラグ（detailSlideIn/volumesSlideIn）で入場演出を制御
- スワイプ戻る（モバイル共通）: swipe-back.js で左→右スワイプ＝戻るを全ページ標準化。組み込み対象外は index.html（トップ）と独自スワイプ持ちの detail/volume/series-volumes
- 戻り演出: スターウォーズ風ワイプ。紫(#4B2C82)の面＋白い発光エッジ（ワイプ線）が左→右へ画面を横切って現在ページを覆い history.back()。遷移先（swipe-back.js を読むページ）では sessionStorage フラグ `swWipe`（1.6秒以内有効）を見て、覆った状態から同方向に走り抜けて新ページをリビール＝連続したワイプになる。指ドラッグ中はワイプ線が指に追従、しきい値（60px / 速度0.4）未満は左へ引っ込む
- クイックビュー: detail.htmlのシリーズ一覧で巻カバーをホバー（タッチ端末は常時表示）するとNetflix風の丸ボタンが出現、クリックで簡易ポップアップ（表紙・発売日・価格・レーベル・あらすじ・巻ページリンク・巻位置カウンター）。モバイルはポップアップを左右スワイプで前後の巻に切替（指を右→左＝次、左→右＝前。巻ページと同じ向き）。下スワイプで閉じる（90px超で確定、未満はバウンスで復帰）。アクセントカラーはテーマ紫 #4B2C82（ホバー #371F63）、表示中は背面スクロールをtouchmove preventDefaultで固定
- ホーム: 正式ホームは `home.html`（Databaseカタログの内容）。ルート「/」は home.html へリダイレクト（vercel.json）、PWAの start_url も /home.html。ヘッダーロゴ/サイトタイトル/BASEリンクは全ページ home.html。旧 database.html は home.html へのリダイレクト（vercel.json の /database.html→/home.html ＋ ファイル自体も meta refresh スタブ）。index.html（検索ページ＝Pickup）はナビのPickupリンク等から到達（※リライトは静的index.htmlが優先され効かないためリダイレクト必須）
- メニュー: 旧 home.html のメニューは menu.html に移設。ボトムナビ「Menu」は /menu.html
- ヘッダーナビ（PC）: Pickup / Blog / Favs ＋ メニューボタン（旧「BASE」リンクは廃止）。ロゴ・サイトタイトル押下で home.html（ホーム）へ
- ボトムナビ（モバイル）: 戻る / Home(家アイコン ph-house→/home.html) / Pickup(🔥→/index.html) / Favorites / Menu。※内部の data-page は歴史的経緯で Home アイテム＝`database`、Pickup アイテム＝`home`（アクティブ判定のJSフックなので表示ラベルとは別物）
