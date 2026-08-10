// 検索用の文字列正規化（ブラウザ・Node双方から使う）
//
// 検索語とインデックス側のタイトルを「同じ関数」に通してから比較するのが肝。
// ここを揃えるだけで「ＳＰＹ×ＦＡＭＩＬＹ」「ｽﾊﾟｲﾌｧﾐﾘｰ」「spy family」が
// すべて同じキーに落ちる。
//
//   ONE PIECE      → onepiece
//   ＳＰＹ×ＦＡＭＩＬＹ → spyfamily
//   ワンピース      → わんぴす
//   ｽﾊﾟｲﾌｧﾐﾘｰ      → すぱいふあみり
(function (root) {
    'use strict';

    // カタカナ→ひらがな（「ワンピース」と「わんぴーす」を同一視するため）
    function katakanaToHiragana(str) {
        return str.replace(/[ァ-ヶ]/g, function (ch) {
            return String.fromCharCode(ch.charCodeAt(0) - 0x60);
        });
    }

    function normalizeSearchKey(str) {
        if (!str) return '';
        var s = String(str);
        // 全角英数→半角、半角カナ→全角カナ、合成文字の統一
        if (typeof s.normalize === 'function') s = s.normalize('NFKC');
        s = s.toLowerCase();
        s = katakanaToHiragana(s);
        // 濁点・半濁点は結合文字として残ることがあるので落とす
        s = s.replace(/[゙゚゛゜]/g, '');
        // 長音・中黒・記号・空白はすべて除去（表記ゆれの最大の原因）
        s = s.replace(/[ー〜~・･,、。.．!！?？:：;；'"’”`｀^￣＿_\-–—+＋*＊/／\\|｜()（）\[\]【】{}〈〉《》「」『』<>＜＞#＃$＄%％&＆@＠×✕✖x‐']/g, '');
        s = s.replace(/[\s　]/g, '');
        return s;
    }

    // 「月華美刃（げっかびじん）」のような括弧内の読みガナを別名として拾う
    function extractKanaAlias(title) {
        if (!title) return '';
        var m = String(title).match(/[（(]([ぁ-んァ-ヴー・\s　]{2,})[）)]/);
        return m ? m[1] : '';
    }

    // 正規化キーからファイル名を作る（data/series/ の置き場所を決めるのに使う）。
    // 日本語のままファイル名にすると環境差でハマるので、ASCII 16桁に潰す。
    // FNV-1a を2系統回して64bit相当にしているので、実用上ぶつからない
    function hashKey(str) {
        var h1 = 0x811c9dc5;
        var h2 = 0xcbf29ce4;
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
            h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
        }
        return ('0000000' + h1.toString(16)).slice(-8) + ('0000000' + h2.toString(16)).slice(-8);
    }

    // シリーズのキャッシュは256個の「まとめファイル」に分けて置く。
    // 1シリーズ1ファイル（8千個）にすると vercel dev がファイル監視で詰まり、
    // 1リクエスト2秒かかる状態になったため、ハッシュ先頭2桁でまとめている。
    // 1ファイルあたり約55KB（gzipで15KB程度）で、開いた作品の分だけ取得する。
    function seriesBucketPath(normKey) {
        return 'data/series/' + hashKey(normKey).slice(0, 2) + '.json';
    }

    var api = {
        normalizeSearchKey: normalizeSearchKey,
        katakanaToHiragana: katakanaToHiragana,
        extractKanaAlias: extractKanaAlias,
        hashKey: hashKey,
        seriesBucketPath: seriesBucketPath,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.normalizeSearchKey = normalizeSearchKey;
        root.extractKanaAlias = extractKanaAlias;
        root.hashKey = hashKey;
        root.seriesBucketPath = seriesBucketPath;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
