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
- `index.html` / `search.js` / `search.css` — 検索ページ（トップ）
- `home.html` / `script.js` / `style.css` — Pickupページ
- `home-portal.css` / `home-portal.js` — ピックアップ専用CSS/JS
- `detail.html` / `detail.js` / `detail.css` — 作品（シリーズ）ページ
- `volume.html` / `volume.js` / `volume.css` — 単行本ページ
- `author.html` / `author.js` / `author.css` — 著者ページ
- `new-releases.html` / `new-releases.js` / `new-releases.css` — 新刊ページ
- `ranking.html` / `ranking.js` / `ranking.css` — Popularページ
- `follow.html` / `follow.js` / `follow.css` — Favoritesページ
- `recommend.html` / `recommend.js` / `recommend.css` — おすすめ漫画ページ
- `database.html` / `database.js` — Databaseページ
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
- スプラッシュ: sessionStorage制御で同一セッション内1回のみ表示
- スワイプナビ: volume.htmlで左右スワイプによる巻移動
- ナビ構成: Pickup / Database / Popular / Favorites
