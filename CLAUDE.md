# CLAUDE.md - manga-site プロジェクト

## ルール
- コンテキストがいっぱいになりそうになったら `/compact` コマンドを実行してください

## 基本情報
- パス: `C:\Users\memob\Desktop\manga-site`
- 本番URL: https://manga-site-three.vercel.app
- GitHub: https://github.com/memobook84/manga-site
- デプロイ: `npx vercel --prod --yes`
- API: 楽天ブックスAPI + Google Books API（カバーフォールバック）

## 構成ファイル
- `index.html` / `search.js` / `search.css` — 検索ページ（トップ）
- `home.html` / `script.js` / `style.css` — ホームページ
- `detail.html` / `detail.js` / `detail.css` — 作品（シリーズ）ページ
- `volume.html` / `volume.js` / `volume.css` — 単行本ページ
- `author.html` / `author.js` / `author.css` — 著者ページ
- `new-releases.html` / `new-releases.js` / `new-releases.css` — 新刊ページ
- `ranking.html` — ランキングページ
- `follow.html` — フォローページ
- `recommend.html` / `recommend.js` / `recommend.css` — おすすめ漫画ページ（5ジャンル×10作品）
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
- `manifest.json` — PWAマニフェスト
- `sw.js` — Service Worker
- `icon-192.png`, `icon-512.png` — PWAアイコン
- `logo.png`, `favicon.png` — ロゴ/ファビコン

## 技術メモ
- 表紙画像: `object-fit:contain; object-position:bottom;` で下寄せ（高さ240px）
- extractSeriesName()は rakuten-adapter.js に配置（両ページで共有）
- 出版社フィルタ: 集英社・小学館・講談社のみ掲載
- hasRealCover検出: noimage、no_image、/0000/ パターン（ISBN番号ファイル名は除外済み）
- フォント: ヘッダータイトル = Montserrat 700、ピックアップ見出し = Michroma、サイドバー見出し = Archivo Black 900
- ヘッダータイトル色: #D8052E
- アプリアイコンとヘッダーロゴ/ファビコンは別画像（黒背景/白背景）
- ボトムナビ: モバイルのみ表示、サブページにはBackボタン付き
- ダークモード: ホームページのみ実装、localStorage保持、head内早期適用
- スプラッシュ: sessionStorage制御で同一セッション内1回のみ表示
- スワイプナビ: volume.htmlで左右スワイプによる巻移動

## 未対応・TODO
- **APIキーのハードコード問題**: `api/search.js`, `api/books.js`, `scripts/collect.js`にAPP_IDが直書き
  - `process.env.RAKUTEN_APP_ID`のみに統一し、ハードコード削除が必要
- **Amazon Associates対応**:
  - プライバシーポリシーページ作成
  - アフィリエイト開示テキスト追加
  - 運営者情報ページ作成
  - Amazon Associate tag統合（`?tag=yourtag-22`）
  - おすすめページのレビュー内容をカスタマイズ

## 進捗報告 — 2026/02/16

### 実施内容
1. **ナビゲーションフロー改修**: トップ→作品ページ→単行本ページの3階層
2. **サイドバー追加**: 出版社・ジャンル・Discoverフィルタ
3. **ヘッダーデザイン刷新**: ロゴ追加、色#9C2020、ピル型ナビリンク
4. **表紙画像取得強化**: 3段階フォールバック、最新2巻除外、10ページ取得
5. **トップページUI調整**: カード枠、画像下寄せ、タイトル一列揃え

## 進捗報告 — 2026/02/17

### 実施内容
1. **JSONキャッシュ化**: 楽天APIからの毎回取得を廃止し、事前収集したJSONファイルに切替
2. **ランダム表紙表示**: シリーズごとに最大10件のcoverCandidatesを保存
3. **ドラえもん関連除外**: collect.jsのフィルタで74タイトルを除外
4. **画像サイズ調整**: 280px → 240pxに縮小
5. **PWA化**: manifest.json、sw.js追加、全HTMLにPWAメタタグ追加
6. **ボトムナビ追加**: モバイル（768px以下）にHome/New/Followナビバー
7. **ロゴ変更**: 赤い盾型ロゴに差し替え
8. **フォント変更**: Archivo Black 900
9. **ヘッダータイトル色変更**: #D8052E
10. **サイドバー調整**: アイコン非表示、文字色を黒に統一

## 進捗報告 — 2026/03/03

### 実施内容
1. **スプラッシュアニメーション追加**: Netflix風の起動演出
2. **ロゴ変更**: 赤い盾型エンブレム（羊モチーフ）
3. **検索ページ背景を黒に変更**
4. **サイト名変更**: 「Book Store」→「COMIC STORE」
5. **ダブルタップズーム無効化**
6. **スマホ用スワイプナビゲーション**: volume.htmlで左右スワイプ
7. **スワイプ矢印インジケーター**
8. **購入ボタン・フォローボタンデザイン変更**: 薄グレー統一
9. **ダークモード実装（ホームページのみ）**
10. **ページネーションデザイン変更**: Apple風ミニマル

## 進捗報告 — 2026/03/07

### 実施内容
1. **おすすめ漫画ページ作成**: `recommend.html` / `recommend.css` / `recommend.js`
   - 5ジャンル（バトル・アクション、スポーツ、ファンタジー、ミステリー・サスペンス、恋愛・ラブコメ）
   - 各ジャンル10作品、プレースホルダーレビュー付き
   - Amazon Associates審査対策としてのオリジナルコンテンツ
2. **全ページにRecommendナビリンク追加**

## 進捗報告 — 2026/03/09

### 実施内容
1. **サイト名変更**: 「COMIC STORE」→「ATLAS COMIC」
2. **ナビゲーション構成変更**: Pickup / Database / Popular / Favorites の4つに再構成
   - Home → Pickup にリネーム（アイコン: ph-star）
   - New Release をナビから非表示
   - Ranking → Popular にリネーム
   - Follow → Favorites にリネーム（アイコン: ph-heart）
3. **Favoriteボタン改修（detail.html）**: グレー→赤（#e0245e）のカラー切り替え、アイコンをph-heartに変更
4. **各ページのサブタイトルから末尾の「。」を削除**
5. **フォント変更**:
   - ヘッダータイトル: Archivo Black 900 → Montserrat 700
   - ピックアップ見出し（EDITOR'S PICK）: Zilla Slab → Michroma 48px
