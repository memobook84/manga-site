# -*- coding: utf-8 -*-
"""配布PDFをビューア用のWebP画像とページ一覧JSONに変換する。

使い方:
    python scripts/pdf-to-reader.py <PDFパス> <作品スラッグ> <巻数> [--meta-only]
    例) python scripts/pdf-to-reader.py "C:/.../001bj.pdf" black-jack-ni-yoroshiku 1

    --meta-only を付けると画像は作り直さず、ページ一覧JSONだけ書き直す。
    作品名やクレジットを直したときに使う（209ページの再変換を待たずに済む）。

作品名・著者・クレジットは data/manual-series.json の readerSlug が一致する
作品から引く。ビューアはクレジットを必ず表示するので、ここは空にしないこと。

出力:
    manga/<スラッグ>/vol-NN/pNNN.webp
    data/reader/<スラッグ>-NN.json

必要なもの: PyMuPDF(fitz) と Pillow

なぜラスタライズしているか:
    PDFに埋め込まれたJPEGを取り出す方が速いが、この配布データは209ページ中
    198ページしか画像を持っていない（残りは図形や文字だけのページ）。
    ページ単位で描画すれば、どのページも同じ条件で1枚に落とせる。

品質設定の根拠:
    元は1414x2000。網点が多くWebPが効きにくいので、幅と品質を振って実測した。
    幅900/品質65 で1ページ平均178KB（1巻36MB前後）。文字も網点も潰れない。
    幅1000/品質72 だと1巻50MBまで増え、見た目の差はほとんど無かった。
"""
import io
import json
from collections import Counter
import os
import sys

import fitz
from PIL import Image

WIDTH = 900
QUALITY = 65
# method=6 が最小になるが209ページだと遅い。4でもサイズはほぼ同じ
WEBP_METHOD = 4

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)

    pdf_path, slug, volume = sys.argv[1], sys.argv[2], int(sys.argv[3])
    meta_only = '--meta-only' in sys.argv

    # --meta-only はPDFを開かない。開くと「渡したPDFのページ数」で
    # 既存画像を切り詰めてしまう（別の巻のPDFを渡した時に実際に起きた）
    if not meta_only and not os.path.exists(pdf_path):
        print('PDFが見つかりません:', pdf_path)
        sys.exit(1)

    vol_dir = os.path.join(ROOT, 'manga', slug, 'vol-%02d' % volume)
    json_dir = os.path.join(ROOT, 'data', 'reader')
    os.makedirs(vol_dir, exist_ok=True)
    os.makedirs(json_dir, exist_ok=True)

    if meta_only:
        # ディスクにある画像そのものを正とする
        doc = None
        existing_names = sorted(f for f in os.listdir(vol_dir) if f.endswith('.webp'))
        total = len(existing_names)
        if total == 0:
            print('画像が1枚もありません:', vol_dir)
            sys.exit(1)
        print('%s の画像%d枚からページ一覧を作り直します' % (os.path.basename(vol_dir), total))
    else:
        doc = fitz.open(pdf_path)
        total = doc.page_count
        print('%s → %dページを変換します（幅%d / 品質%d）' % (os.path.basename(pdf_path), total, WIDTH, QUALITY))

    pages = []
    sizes = Counter()
    written_bytes = 0

    for i in range(total):
        name = existing_names[i] if meta_only else ('p%03d.webp' % (i + 1))

        # JSONだけ作り直すときは、既にある画像の寸法を読むだけにする
        if meta_only:
            path = os.path.join(vol_dir, name)
            with Image.open(path) as existing:
                sizes[existing.size] += 1
            pages.append(name)
            written_bytes += os.path.getsize(path)
            continue

        page = doc[i]
        zoom = WIDTH / page.rect.width
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)

        # 漫画本文はモノクロなので、色が乗っていないページはグレースケールで持つ
        if not _is_colorish(im):
            im = im.convert('L')

        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=QUALITY, method=WEBP_METHOD)
        data = buf.getvalue()

        with open(os.path.join(vol_dir, name), 'wb') as f:
            f.write(data)

        pages.append(name)
        sizes[(im.width, im.height)] += 1
        written_bytes += len(data)

        if (i + 1) % 20 == 0 or i + 1 == total:
            print('  %d/%d  (%.1f MB)' % (i + 1, total, written_bytes / 1048576))

    info = _series_info(slug)

    meta = {
        'slug': slug,
        # 二次利用フリーの作品は作品名と著者名の明記が利用条件。
        # ビューアはここを読んで必ず画面に出す
        'series': info.get('title', ''),
        'author': info.get('author', ''),
        'credit': info.get('credit', ''),
        'source': info.get('source', ''),
        'volume': volume,
        'direction': 'rtl',
        'pageCount': len(pages),
        'basePath': '/manga/%s/vol-%02d/' % (slug, volume),
        # 表示側が読み込み前にページの箱を確保するための寸法。
        # 巻によっては1pxだけ違うページが混ざるが、そこで None にすると
        # ビューアが縦横比を決められず、デコードが終わるまで背景の黒が見えてしまう。
        # 実害の無い差なので最頻値を代表値として渡す
        'size': _dominant_size(sizes),
        'pages': pages,
    }

    out_json = os.path.join(json_dir, '%s-%02d.json' % (slug, volume))
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, separators=(',', ':'))

    print('\n完了')
    print('  画像 : %s (%d枚 / %.1f MB)' % (vol_dir, len(pages), written_bytes / 1048576))
    print('  一覧 : %s' % out_json)
    dom = _dominant_size(sizes)
    if len(sizes) == 1:
        print('  寸法 : 揃っている %dx%d' % (dom['width'], dom['height']))
    else:
        detail = ', '.join('%dx%d(%d枚)' % (w, h, n) for (w, h), n in sizes.most_common())
        print('  寸法 : ばらつきあり [%s] → 代表値 %dx%d を使用' % (detail, dom['width'], dom['height']))


def _dominant_size(sizes):
    """いちばん多い寸法を代表値として返す。1pxのばらつきは無視してよい"""
    if not sizes:
        return None
    (w, h), _ = sizes.most_common(1)[0]
    return {'width': w, 'height': h}


def _series_info(slug):
    """data/manual-series.json から readerSlug が一致する作品の情報を引く"""
    path = os.path.join(ROOT, 'data', 'manual-series.json')
    if not os.path.exists(path):
        print('  注意: data/manual-series.json が無いのでクレジットは空になります')
        return {}
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    for s in data.get('series', []):
        if s.get('readerSlug') == slug:
            return s
    print('  注意: readerSlug="%s" の作品が manual-series.json にありません（クレジットが空になります）' % slug)
    return {}


def _is_colorish(im):
    """カラーページかどうか。RGBの差が大きい画素の割合で判定する"""
    small = im.resize((80, 110))
    px = list(small.getdata())
    colored = sum(1 for (r, g, b) in px if max(r, g, b) - min(r, g, b) > 28)
    return colored / len(px) > 0.02


if __name__ == '__main__':
    main()
