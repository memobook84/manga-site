/* 隠しコマンド：スプラッシュのタイトル「ATLAS COMIC」を押すと流れる約1分のモーションビデオ
   『THE ATLAS EXPEDITION ― アトラス探検記』

   ・絵はすべて canvas にその場で描く（動画ファイルは使わない）。音楽と効果音も Web Audio でその場で合成する
   ・画風は「ライン・クレール」（均一な墨の輪郭線＋グラデーションを使わないベタ塗り）の冒険漫画風。
     キャラクター・乗り物・地名はすべてこのサイトのオリジナル（実在の作品のキャラクターは出さない）
   ・各シーンの絵は「時刻 t の純粋な関数」。粒子（煙・泡・雪）も状態を持たず t から計算するので、
     最後のコマ割りページでは同じ関数をコマの中にもう一度描ける
   ・時計は音声の時計（AudioContext.currentTime）。映像と音楽がずれない。音が使えない時は performance.now()
   ・splash.js が必要になった時だけ読み込む（普段の表示には一切影響しない）

   構成（120BPM・1小節2秒。場面の切れ目は小節の頭にそろえてある）
     0– 6s  タイトル（古地図の上にタイトルが叩きつけられる）
     6–14s  港町ルーメン・夜明け（汽船の出航）
    14–18s  地図：ルーメン → サハラン砂漠（船）
    18–28s  砂漠の上空（複葉機 → エンジン不調 → 墜落 → 砂から顔を出す）
    28–32s  地図：サハラン → ヒマラン山脈（列車）
    32–40s  雪山の夜行列車（オーロラと月）
    40–44s  地図：ヒマラン → 深海アビス（潜水艇）
    44–52s  深海（沈没船と宝箱）
    52–62s  フィナーレ（ここまでの場面がコマになって漫画のページに並び、ロゴが叩きつけられる） */
(function () {
    'use strict';

    var W = 1600, H = 900;      // 絵の座標系（16:9）。画面には縦横比を保って収める
    var TOTAL = 62;
    var INK = '#100B06';        // 墨（サイトのヘッダーと同じ黒）
    var LINE = 3.2;             // 輪郭線の太さ（全場面で共通＝ライン・クレールの均一な線）
    var PAPER = '#F7EBD0';
    var RED = '#D8252E';
    var YELLOW = '#F9D342';
    var CREAM = '#FBF8F2';
    var FONT_COMIC = "'Luckiest Guy', 'Montserrat', sans-serif";
    var FONT_JP = "'Noto Sans JP', sans-serif";

    var TAU = Math.PI * 2;

    /* ========== 数学 ========== */
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function lerp(a, b, p) { return a + (b - a) * p; }
    function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
    function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }
    function easeInCubic(p) { return p * p * p; }
    function easeInOut(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
    function easeOutBack(p) { var k = 1.70158; return 1 + (k + 1) * Math.pow(p - 1, 3) + k * Math.pow(p - 1, 2); }
    // 0..1 の決まった乱数（同じ i には毎回同じ値）。粒子を状態なしで描くのに使う
    function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    /* ========== 描画の道具 ==========
       c は「いま描いている canvas の context」。フレームごとに差し替える */
    var c;

    function ink(w) {
        c.lineWidth = w === undefined ? LINE : w;
        c.strokeStyle = INK;
        c.lineJoin = 'round';
        c.lineCap = 'round';
    }
    // 直前に作ったパスを塗って墨線で囲む。w=0 なら線なし
    function paint(fill, w) {
        if (fill) { c.fillStyle = fill; c.fill(); }
        if (w !== 0) { ink(w); c.stroke(); }
    }
    function circle(x, y, r) { c.beginPath(); c.arc(x, y, Math.max(r, 0.01), 0, TAU); }
    function oval(x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), rot || 0, 0, TAU); }
    function rrect(x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
    }
    function poly(pts, open) {
        c.beginPath();
        c.moveTo(pts[0], pts[1]);
        for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
        if (!open) c.closePath();
    }
    // 点列を通るなめらかな閉じた形（中点を結ぶ2次曲線）
    function smoothClosed(pts) {
        var n = pts.length / 2;
        c.beginPath();
        c.moveTo((pts[0] + pts[2]) / 2, (pts[1] + pts[3]) / 2);
        for (var i = 1; i <= n; i++) {
            var x = pts[(i % n) * 2], y = pts[(i % n) * 2 + 1];
            var nx = pts[((i + 1) % n) * 2], ny = pts[((i + 1) % n) * 2 + 1];
            c.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
        }
        c.closePath();
    }
    // 地形：上端が f(x) の帯を bottom まで塗る
    function terrain(f, x0, x1, bottom, fill, w, step) {
        step = step || 16;
        c.beginPath();
        c.moveTo(x0, bottom);
        for (var x = x0; x <= x1 + step; x += step) c.lineTo(x, f(Math.min(x, x1)));
        c.lineTo(x1, bottom);
        c.closePath();
        if (fill) { c.fillStyle = fill; c.fill(); }
        if (w !== 0) {
            // 輪郭は上端の稜線だけに引く（下や左右の辺は画面の外）
            c.beginPath();
            c.moveTo(x0, f(x0));
            for (x = x0; x <= x1 + step; x += step) c.lineTo(x, f(Math.min(x, x1)));
            ink(w);
            c.stroke();
        }
    }
    // 円の集まり（雲・煙・砂ぼこり）を、外側だけ墨線で囲んだ1つの形として描く。
    // 先に太い線で全部の円をなぞり、上から塗りを重ねると内側の線が消えて外周だけが残る。
    // （透明度で消すと内側の線が透けるので、消える時は円を縮める）
    function puffs(list, fill, w) {
        w = w === undefined ? LINE : w;
        c.beginPath();
        for (var i = 0; i < list.length; i += 3) {
            if (list[i + 2] <= 0.5) continue;
            c.moveTo(list[i] + list[i + 2], list[i + 1]);
            c.arc(list[i], list[i + 1], list[i + 2], 0, TAU);
        }
        if (w) { c.lineWidth = w * 2; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke(); }
        c.fillStyle = fill;
        c.fill();
    }
    // 漫画の星（キラッ）
    function sparkle(x, y, r, rot, fill) {
        c.save();
        c.translate(x, y);
        c.rotate(rot || 0);
        c.beginPath();
        for (var i = 0; i < 8; i++) {
            var rr = i % 2 ? r * 0.28 : r;
            var a = i * TAU / 8 - Math.PI / 2;
            if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.closePath();
        paint(fill || '#FFF6C8', r > 14 ? LINE * 0.8 : LINE * 0.6);
        c.restore();
    }
    function star5(x, y, r, rot, fill) {
        c.save();
        c.translate(x, y);
        c.rotate(rot || 0);
        c.beginPath();
        for (var i = 0; i < 10; i++) {
            var rr = i % 2 ? r * 0.45 : r;
            var a = i * TAU / 10 - Math.PI / 2;
            if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.closePath();
        paint(fill || YELLOW, LINE * 0.8);
        c.restore();
    }

    /* ========== 文字 ========== */
    // 漫画の描き文字：墨の影 → 太い墨のふち → 塗り
    function comicText(str, x, y, size, fill, rot, shadow) {
        c.save();
        c.translate(x, y);
        if (rot) c.rotate(rot);
        c.font = size + 'px ' + FONT_COMIC;
        c.textAlign = 'center';
        c.textBaseline = 'alphabetic';
        c.lineJoin = 'round';
        c.miterLimit = 2;
        c.lineWidth = size * 0.17;
        c.strokeStyle = INK;
        var sh = shadow === undefined ? size * 0.075 : shadow;
        if (sh) {
            c.fillStyle = INK;
            c.strokeText(str, sh, sh);
            c.fillText(str, sh, sh);
        }
        c.strokeText(str, 0, 0);
        c.fillStyle = fill;
        c.fillText(str, 0, 0);
        c.restore();
    }

    // 擬音（BWOOOO! など）。ポンと飛び出して、1文字ずつ揺れて、縮んで消える
    function sfx(str, x, y, size, t, t0, dur, fill, rot) {
        var a = t - t0;
        if (a < 0 || a > dur) return;
        var s = easeOutBack(seg(a, 0, 0.3)) * (1 - easeInCubic(seg(a, dur - 0.25, dur)));
        if (s <= 0.002) return;
        c.save();
        c.translate(x, y);
        c.rotate(rot || 0);
        c.scale(s, s);
        c.font = size + 'px ' + FONT_COMIC;
        var gap = size * 0.02;
        var widths = [], total = 0;
        for (var i = 0; i < str.length; i++) { widths.push(c.measureText(str[i]).width); total += widths[i] + gap; }
        var px = -total / 2;
        for (i = 0; i < str.length; i++) {
            var wob = Math.sin(a * 8 + i * 1.7) * 0.05 + (i % 2 ? 0.07 : -0.07);
            var dy = Math.sin(a * 6 + i * 1.3) * size * 0.03 + (i % 2 ? -1 : 1) * size * 0.05;
            comicText(str[i], px + widths[i] / 2, dy, size, fill || YELLOW, wob);
            px += widths[i] + gap;
        }
        c.restore();
    }

    // ナレーションの黄色い箱（冒険漫画のコマの左上に出るあれ）。1文字ずつ打ち出す
    function caption(lines, x, y, t, t0, t1) {
        if (inPanel || t < t0 || t > t1) return;
        var pin = easeOutCubic(seg(t, t0, t0 + 0.45));
        var alpha = 1 - seg(t, t1 - 0.3, t1);
        c.save();
        c.globalAlpha = alpha;
        c.font = '700 30px ' + FONT_JP;
        var lh = 44, padX = 22, padY = 16, w = 0;
        for (var i = 0; i < lines.length; i++) w = Math.max(w, c.measureText(lines[i]).width);
        var bw = w + padX * 2, bh = lines.length * lh + padY * 2 - 6;
        c.translate(x - (1 - pin) * 50, y);
        c.rotate(-0.012);
        c.fillStyle = INK;
        c.fillRect(7, 7, bw, bh);
        c.beginPath();
        c.rect(0, 0, bw, bh);
        paint('#F9E27D', LINE);
        var shown = Math.floor((t - t0 - 0.25) / 0.05);
        c.fillStyle = INK;
        c.textBaseline = 'top';
        c.textAlign = 'left';
        for (i = 0; i < lines.length && shown > 0; i++) {
            c.fillText(lines[i].slice(0, shown), padX, padY + i * lh);
            shown -= lines[i].length;
        }
        c.restore();
    }

    // ふきだし。tx,ty はしっぽの先
    function bubble(text, x, y, tx, ty, t, t0, t1, size, jp) {
        if (t < t0 || t > t1) return;
        var s = easeOutBack(seg(t, t0, t0 + 0.25)) * (1 - seg(t, t1 - 0.15, t1));
        if (s <= 0.002) return;
        size = size || 44;
        c.save();
        c.translate(x, y);
        c.scale(s, s);
        c.font = jp ? '700 ' + size + 'px ' + FONT_JP : size + 'px ' + FONT_COMIC;
        var w = c.measureText(text).width;
        var rx = w / 2 + size * 0.7, ry = size * 0.95;
        var ax = (tx - x) / s, ay = (ty - y) / s;
        var ang = Math.atan2(ay, ax);
        // 本体としっぽを1つの形として：しっぽ → 本体の順に線、最後にまとめて塗る
        c.beginPath();
        c.moveTo(Math.cos(ang - 0.35) * rx * 0.8, Math.sin(ang - 0.35) * ry * 0.8);
        c.lineTo(ax, ay);
        c.lineTo(Math.cos(ang + 0.35) * rx * 0.8, Math.sin(ang + 0.35) * ry * 0.8);
        c.closePath();
        c.moveTo(rx, 0);
        c.ellipse(0, 0, rx, ry, 0, 0, TAU);
        c.lineWidth = LINE * 2;
        c.strokeStyle = INK;
        c.lineJoin = 'round';
        c.stroke();
        c.fillStyle = '#fff';
        c.fill();
        c.fillStyle = INK;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, 0, jp ? 2 : size * 0.1);
        c.restore();
    }

    /* ========== 画面効果 ========== */
    // アイリス（丸く閉じる／開く）。r は穴の半径。外側を墨で塗る
    function iris(cx, cy, r) {
        if (r > 2200) return;
        c.save();
        c.beginPath();
        c.rect(-20, -20, W + 40, H + 40);
        c.moveTo(cx + Math.max(r, 0.01), cy);
        c.arc(cx, cy, Math.max(r, 0.01), 0, TAU, true);
        c.fillStyle = INK;
        c.fill('evenodd');
        c.restore();
    }
    // 印刷した紙のようなごく薄いざらつき（最初に1回だけ作る）
    var grain = null;
    function makeGrain() {
        var g = document.createElement('canvas');
        g.width = g.height = 180;
        var gx = g.getContext('2d');
        var img = gx.createImageData(180, 180);
        for (var i = 0; i < img.data.length; i += 4) {
            var v = 200 + Math.floor(hash(i * 0.37) * 55);
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = 255;
        }
        gx.putImageData(img, 0, 0);
        return g;
    }
    function paperGrain() {
        if (!grain) return;
        c.save();
        c.globalCompositeOperation = 'multiply';
        c.globalAlpha = 0.16;
        c.fillStyle = c.createPattern(grain, 'repeat');
        c.fillRect(0, 0, W, H);
        c.restore();
    }

    /* ========== 音楽と効果音（Web Audio でその場で合成） ==========
       120BPM。楽譜は「秒」で書いてある（1拍＝0.5秒、1小節＝2秒）。
       全部の音を最初に作ると一瞬固まるので、出来事の一覧を時刻順に持っておき、
       再生中に「1.2秒先まで」を少しずつ予約していく */
    function Score(ac) {
        var master = ac.createGain();
        master.gain.value = 0.72;
        var comp = ac.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 12;
        comp.ratio.value = 3.5;
        comp.attack.value = 0.004;
        comp.release.value = 0.25;
        // コンプレッサーは立ち上がりの速い音（爆発・ティンパニ）を一瞬通すので、その後ろでも下げて音割れを防ぐ
        var out = ac.createGain();
        out.gain.value = 0.95;
        master.connect(comp);
        comp.connect(out);
        out.connect(ac.destination);

        // ホールの残響（減衰するノイズをインパルス応答にする）
        var rev = ac.createConvolver();
        var len = Math.floor(ac.sampleRate * 2.4);
        var ir = ac.createBuffer(2, len, ac.sampleRate);
        for (var ch = 0; ch < 2; ch++) {
            var d = ir.getChannelData(ch);
            for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
        }
        rev.buffer = ir;
        var revIn = ac.createGain();
        revIn.gain.value = 0.3;
        revIn.connect(rev);
        rev.connect(master);
        var bus = ac.createGain();
        bus.connect(master);
        bus.connect(revIn);
        // 残響に送らない低音用（キック・ベースに残響がかかると濁る）
        var dry = ac.createGain();
        dry.connect(master);

        // ソナーのこだま用
        var echo = ac.createDelay(1);
        echo.delayTime.value = 0.38;
        var fb = ac.createGain();
        fb.gain.value = 0.38;
        echo.connect(fb);
        fb.connect(echo);
        echo.connect(bus);

        var noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        var nd = noise.getChannelData(0);
        for (i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

        /* ---- 部品 ---- */
        function osc(type, f, t, dur, detune) {
            var o = ac.createOscillator();
            o.type = type;
            o.frequency.setValueAtTime(f, t);
            if (detune) o.detune.value = detune;
            o.start(t);
            o.stop(t + dur + 0.1);
            return o;
        }
        function gain(dest) {
            var g = ac.createGain();
            g.gain.value = 0;
            g.connect(dest || bus);
            return g;
        }
        // 立ち上がり a → 少し下がって sus → hold 秒で離す → r 秒で消える
        function adsr(g, t, a, sus, hold, r, peak) {
            var p = g.gain;
            hold = Math.max(hold, a + 0.03);
            p.setValueAtTime(0.0001, t);
            p.linearRampToValueAtTime(peak, t + a);
            p.linearRampToValueAtTime(peak * sus, t + Math.min(hold, a + 0.14));
            p.setValueAtTime(peak * sus, t + hold);
            p.linearRampToValueAtTime(0.0001, t + hold + r);
        }
        function decay(g, t, peak, len) {
            g.gain.setValueAtTime(Math.max(peak, 0.0002), t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        }
        function lowpass(f, q) {
            var b = ac.createBiquadFilter();
            b.type = 'lowpass';
            b.frequency.value = Math.min(f, 14000);
            b.Q.value = q || 0.7;
            return b;
        }
        function filter(type, f, q) {
            var b = ac.createBiquadFilter();
            b.type = type;
            b.frequency.value = f;
            if (q) b.Q.value = q;
            return b;
        }
        function noiseSrc(t, dur) {
            var s = ac.createBufferSource();
            s.buffer = noise;
            s.loop = true;
            s.start(t, Math.random() * 1.5);
            s.stop(t + dur + 0.1);
            return s;
        }
        function vibrato(o, t, rate, depth) {
            var l = ac.createOscillator(), lg = ac.createGain();
            l.frequency.value = rate;
            lg.gain.setValueAtTime(0, t);
            lg.gain.linearRampToValueAtTime(depth, t + 0.35);
            l.connect(lg);
            lg.connect(o.frequency);
            l.start(t);
            l.stop(t + 6);
        }

        /* ---- 楽器 ----
           ダークでノリのいいポップ（低く歪んだベース＋指パッチン＋すき間の多いビート）の音色 */
        // ベースを歪ませる曲線（tanh）。SOFT＝少しざらつく／HARD＝ドロップ用にしっかり歪む
        function distCurve(k) {
            var n = 2048, cv = new Float32Array(n);
            for (var j = 0; j < n; j++) { var x = j / (n - 1) * 2 - 1; cv[j] = Math.tanh(x * k) / Math.tanh(k); }
            return cv;
        }
        var CURVE_SOFT = distCurve(2.2), CURVE_HARD = distCurve(6);
        function strings(m, t, dur, vol) {
            var f = midi(m), g = gain(), lp = lowpass(Math.min(f * 4, 2600), 0.5);
            [-11, 0, 10].forEach(function (dt) { osc('sawtooth', f, t, dur + 0.8, dt).connect(lp); });
            lp.connect(g);
            adsr(g, t, Math.min(0.35, dur * 0.4), 1, dur, 0.6, vol || 0.04);
        }
        function chord(ms, t, dur, vol, fn) { ms.forEach(function (m) { (fn || strings)(m, t, dur, vol); }); }
        function glock(m, t, vol, len) {
            var f = midi(m), g = gain(), g2 = gain();
            osc('sine', f, t, len || 1.4).connect(g);
            osc('sine', f * 2.76, t, 0.4).connect(g2);
            decay(g, t, vol || 0.05, len || 1.4);
            decay(g2, t, (vol || 0.05) * 0.3, 0.3);
        }
        // 四角波2本を少しずらした、はじくようなシンセ。bright でフィルターを開く
        function synth(m, t, dur, vol, bright) {
            var f = midi(m), g = gain(), lp = lowpass(f * 6, 3);
            lp.frequency.setValueAtTime(Math.min(f * (bright ? 12 : 6), 14000), t);
            lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.4, 200), t + Math.max(0.15, dur));
            osc('square', f, t, dur + 0.1, -9).connect(lp);
            osc('square', f, t, dur + 0.1, 9).connect(lp);
            lp.connect(g);
            adsr(g, t, 0.005, 0.55, dur, 0.08, vol || 0.05);
        }
        // 歪ませたサブベース。glideTo があると後半で音程がすべる（ドロップや「テープが止まる」表現に使う）
        function sub(m, t, dur, vol, glideTo, hard) {
            var f = midi(m), g = gain(dry), lp = lowpass(f * (hard ? 7 : 5), 2), ws = ac.createWaveShaper();
            ws.curve = hard ? CURVE_HARD : CURVE_SOFT;
            var o = osc('sawtooth', f, t, dur + 0.1), o2 = osc('sine', f, t, dur + 0.1);
            if (glideTo) {
                [o, o2].forEach(function (x) {
                    x.frequency.setValueAtTime(f, t + dur * 0.5);
                    x.frequency.exponentialRampToValueAtTime(midi(glideTo), t + dur);
                });
            }
            var og = ac.createGain();
            og.gain.value = 0.4;
            o.connect(og);
            og.connect(lp);
            o2.connect(lp);
            lp.connect(ws);
            ws.connect(g);
            adsr(g, t, 0.008, 0.85, dur, 0.05, vol || 0.2);
        }
        function kick(t, vol) {
            var g = gain(dry), o = osc('sine', 160, t, 0.5);
            o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
            o.connect(g);
            decay(g, t, vol || 0.5, 0.42);
            var cg = gain(dry), hp = filter('highpass', 3000);
            noiseSrc(t, 0.03).connect(hp);
            hp.connect(cg);
            decay(cg, t, (vol || 0.5) * 0.2, 0.015);
        }
        // 指パッチン：乾いた一瞬のノイズ＋残響に多めに送る
        function snap(t, vol) {
            var g = gain(), bp = filter('bandpass', 2500, 3.2);
            noiseSrc(t, 0.08).connect(bp);
            bp.connect(g);
            decay(g, t, vol || 0.3, 0.05);
            var g2 = gain(revIn), bp2 = filter('bandpass', 1400, 1.5);
            noiseSrc(t, 0.12).connect(bp2);
            bp2.connect(g2);
            decay(g2, t, (vol || 0.3) * 0.9, 0.1);
        }
        function clap(t, vol) {
            [0, 0.011, 0.022].forEach(function (dd, j) {
                var g = gain(), bp = filter('bandpass', 1500, 1.1);
                noiseSrc(t + dd, 0.2).connect(bp);
                bp.connect(g);
                decay(g, t + dd, (vol || 0.28) * (j === 2 ? 1 : 0.6), j === 2 ? 0.16 : 0.02);
            });
        }
        function hat(t, vol, open) {
            var g = gain(), hp = filter('highpass', 7600);
            noiseSrc(t, 0.3).connect(hp);
            hp.connect(g);
            decay(g, t, vol || 0.05, open ? 0.22 : 0.035);
        }
        function cymbal(t, vol, len) {
            var g = gain(), hp = filter('highpass', 5200);
            noiseSrc(t, len || 1.1).connect(hp);
            hp.connect(g);
            decay(g, t, vol || 0.2, Math.min(len || 1.1, 1.1));
        }
        function swell(t0, t1, vol) {
            var g = gain(), hp = filter('highpass', 4200);
            noiseSrc(t0, t1 - t0 + 0.1).connect(hp);
            hp.connect(g);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(vol || 0.12, t1);
            g.gain.linearRampToValueAtTime(0.0001, t1 + 0.06);
        }
        // だんだん細かくなる連打（盛り上げ）。step0 → step1 秒間隔へ詰めていく
        function build(t0, t1, v0, v1, fn, step0, step1) {
            var t = t0;
            while (t < t1) {
                var p = (t - t0) / (t1 - t0);
                (fn || clap)(t, lerp(v0, v1, p));
                t += lerp(step0 || 0.25, step1 || 0.0625, p * p);
            }
        }
        function whoosh(t, dur, vol) {
            var g = gain(), bp = filter('bandpass', 260, 1.4);
            bp.frequency.setValueAtTime(260, t);
            bp.frequency.exponentialRampToValueAtTime(2800, t + dur);
            noiseSrc(t, dur).connect(bp);
            bp.connect(g);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(vol || 0.2, t + dur * 0.65);
            g.gain.linearRampToValueAtTime(0.0001, t + dur);
        }

        /* ---- 効果音 ---- */
        function shipHorn(t, dur) {
            var g = gain(), lp = lowpass(800, 2);
            [43, 50, 55].forEach(function (m, k) {
                var o = osc('sawtooth', midi(m) * 0.97, t, dur + 0.5, k * 5);
                o.frequency.linearRampToValueAtTime(midi(m), t + 0.15);
                o.connect(lp);
            });
            lp.connect(g);
            adsr(g, t, 0.12, 0.9, dur, 0.5, 0.13);
        }
        function engine(t0, tSput, t1, vol) {
            var o = osc('sawtooth', 58, t0, t1 - t0);
            var o2 = osc('square', 29, t0, t1 - t0);
            var am = ac.createGain();
            am.gain.value = 0.55;
            var lfo = ac.createOscillator(), lg = ac.createGain();
            lfo.type = 'square';
            lfo.frequency.value = 24;
            lg.gain.value = 0.45;
            lfo.connect(lg);
            lg.connect(am.gain);
            lfo.start(t0);
            lfo.stop(t1 + 0.1);
            var lp = lowpass(650, 1.5);
            o.connect(lp);
            o2.connect(lp);
            lp.connect(am);
            var g = gain();
            am.connect(g);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(vol, t0 + 0.6);
            g.gain.setValueAtTime(vol, tSput);
            // エンジンの息つき：鳴ったり止まったりしながら回転が落ちていく
            for (var k = 0, t = tSput; t < t1; k++, t += 0.19) {
                var on = hash(k * 3.1) > 0.4;
                g.gain.setValueAtTime(on ? vol * (1 - (t - tSput) / (t1 - tSput) * 0.5) : 0.0001, t);
                o.frequency.setValueAtTime(58 - (t - tSput) * 12, t);
                lfo.frequency.setValueAtTime(24 - (t - tSput) * 7, t);
            }
            g.gain.setValueAtTime(0.0001, t1);
        }
        function slideWhistle(t, dur) {
            var g = gain(), o = osc('sine', 1500, t, dur + 0.1);
            o.frequency.exponentialRampToValueAtTime(260, t + dur);
            vibrato(o, t, 7, 25);
            o.connect(g);
            adsr(g, t, 0.05, 0.9, dur - 0.05, 0.05, 0.07);
        }
        function boom(t) {
            var g = gain(), lp = lowpass(420, 0.8);
            noiseSrc(t, 1.1).connect(lp);
            lp.connect(g);
            decay(g, t, 0.55, 1.1);
            var sg = gain(), o = osc('sine', 90, t, 1);
            o.frequency.exponentialRampToValueAtTime(32, t + 0.8);
            o.connect(sg);
            decay(sg, t, 0.5, 0.9);
        }
        function boing(t) {
            var g = gain(), o = osc('triangle', 200, t, 0.5);
            o.frequency.exponentialRampToValueAtTime(620, t + 0.12);
            vibrato(o, t + 0.1, 16, 40);
            o.connect(g);
            decay(g, t, 0.12, 0.45);
        }
        function sadTrombone(t) {
            [58, 57, 56, 55].forEach(function (m, k) {
                var st = t + k * 0.3, dur = k === 3 ? 0.9 : 0.24;
                var f = midi(m), g = gain(), lp = lowpass(f * 2, 3);
                var o = osc('sawtooth', f, st, dur + 0.2);
                if (k === 3) vibrato(o, st + 0.1, 6.5, 6);
                o.connect(lp);
                lp.frequency.setValueAtTime(f * 1.2, st);
                lp.frequency.linearRampToValueAtTime(f * 3.2, st + 0.12);
                lp.frequency.linearRampToValueAtTime(f * 1.4, st + dur);
                lp.connect(g);
                adsr(g, st, 0.04, 0.85, dur, 0.1, 0.11);
            });
        }
        function trainWhistle(t, dur) {
            var g = gain(), lp = lowpass(3200, 0.8);
            [71, 75, 78].forEach(function (m) {
                var o = osc('triangle', midi(m) * 0.9, t, dur + 0.4);
                o.frequency.linearRampToValueAtTime(midi(m), t + 0.2);
                o.connect(lp);
            });
            var bp = filter('bandpass', 1700, 2);
            noiseSrc(t, dur + 0.3).connect(bp);
            bp.connect(lp);
            lp.connect(g);
            adsr(g, t, 0.15, 0.85, dur, 0.35, 0.07);
        }
        function ping(t) {
            var g = gain(echo);
            osc('sine', 1320, t, 1.5).connect(g);
            decay(g, t, 0.09, 1.4);
            var g2 = gain();
            osc('sine', 1320, t, 1.5).connect(g2);
            decay(g2, t, 0.07, 1.2);
        }
        function blub(t) {
            var g = gain(), o = osc('sine', 380 + hash(t * 13) * 300, t, 0.1);
            o.frequency.exponentialRampToValueAtTime(900 + hash(t * 7) * 400, t + 0.07);
            o.connect(g);
            decay(g, t, 0.035, 0.08);
        }

        /* ---- 楽譜 ----
           ダークでノリのいいポップ（ニ短調・120BPM）。低く歪んだベースのリフ＋指パッチン＋すき間の多いビート。
           深海の場面で重いスローなビートに切り替わり（ドロップ）、フィナーレでもとのノリに戻る。
           メロディーもベースのフレーズもこのサイトのための書き下ろし（既存の曲の引用はしていない） */
        var ev = [];
        function at(t, fn) { ev.push({ t: t, fn: fn }); }
        // 拍（0.5秒）で書いた音符を秒に直して並べる。n = [拍, 音高, 長さ(拍), すべり先]
        function notes(t0, list, fn, vol, extra) {
            list.forEach(function (n) {
                at(t0 + n[0] * 0.5, function (T) { fn(n[1], T, n[2] * 0.5 * 0.94, vol, n[3] || extra); });
            });
        }
        function up(list, k) { return list.map(function (n) { return [n[0], n[1] + k, n[2], n[3]]; }); }
        function times(t0, beats, fn) { beats.forEach(function (b) { at(t0 + b * 0.5, fn); }); }
        var k, bar;

        // ベースのリフ（1小節）。D2=38 A1=33 C2=36 C#2=37 F2=41 Bb1=34
        var RIFF_A = [[0, 38, 0.5], [0.75, 38, 0.25], [1.5, 33, 0.5], [2, 36, 0.5], [2.75, 37, 0.25], [3, 38, 0.5], [3.5, 41, 0.5, 38]];
        var RIFF_B = [[0, 38, 0.5], [0.75, 38, 0.25], [1.5, 33, 0.5], [2, 36, 0.75], [3, 34, 0.5], [3.5, 33, 0.5]];
        // 砂漠用（F# と Eb で異国の響きに）
        var RIFF_D = [[0, 38, 0.5], [0.75, 38, 0.25], [1.5, 39, 0.5], [2, 38, 0.5], [2.75, 36, 0.25], [3, 38, 0.5], [3.5, 42, 0.5, 38]];
        // 上に乗るシンセのフック（2小節）
        var HOOK = [[0.5, 69, 0.25], [1, 72, 0.5], [1.75, 74, 0.25], [2.5, 77, 0.5], [3, 76, 0.25], [3.5, 74, 0.5],
            [4.5, 69, 0.25], [5, 72, 0.25], [5.5, 74, 0.5], [6.5, 72, 0.5], [7, 70, 0.5], [7.5, 69, 0.5]];
        var HOOK_D = [[0.5, 74, 0.25], [1, 75, 0.5], [1.5, 74, 0.25], [2, 72, 0.5], [2.5, 70, 0.5], [3, 69, 1],
            [4.5, 66, 0.25], [5, 67, 0.5], [5.5, 69, 0.5], [6, 70, 0.5], [6.5, 69, 0.5], [7, 66, 1]];

        // ビート1小節ぶん。full＝ノリの基本形 / snaps＝キック抜き / half＝半分の速さに感じる重いビート
        function beat(t0, kind, v) {
            v = v || 1;
            if (kind === 'full') {
                times(t0, [0, 0.75, 2, 2.5], function (T) { kick(T, 0.5 * v); });
                times(t0, [1, 3], function (T) { snap(T, 0.3 * v); });
                for (var j = 0; j < 8; j++) (function (j) { at(t0 + j * 0.25, function (T) { hat(T, (j % 2 ? 0.05 : 0.025) * v); }); })(j);
                at(t0 + 1.75, function (T) { hat(T, 0.04 * v, true); });
            } else if (kind === 'snaps') {
                times(t0, [1, 3], function (T) { snap(T, 0.28 * v); });
                for (j = 0; j < 8; j++) (function (j) { at(t0 + j * 0.25, function (T) { hat(T, (j % 2 ? 0.04 : 0.02) * v); }); })(j);
            } else if (kind === 'half') {
                at(t0, function (T) { kick(T, 0.55 * v); });
                at(t0 + 1.25, function (T) { kick(T, 0.35 * v); });
                at(t0 + 1, function (T) { clap(T, 0.28 * v); snap(T, 0.18 * v); });
                for (j = 0; j < 16; j++) (function (j) { at(t0 + j * 0.125, function (T) { hat(T, (j % 4 === 2 ? 0.04 : 0.018) * v); }); })(j);
                // 最後の拍は3連で細かく刻む
                for (j = 0; j < 6; j++) (function (j) { at(t0 + 1.5 + j * (0.5 / 6), function (T) { hat(T, 0.03 * v); }); })(j);
            }
        }
        // 2小節ぶんのノリ（ビート＋ベース＋フック）
        function groove(t0, riffs, hook, hookVol, lead) {
            beat(t0, 'full');
            beat(t0 + 2, 'full');
            notes(t0, riffs[0], sub, 0.22);
            notes(t0 + 2, riffs[1], sub, 0.22);
            if (hook) {
                notes(t0, hook, synth, hookVol || 0.05);
                if (lead) notes(t0, up(hook, 12), synth, lead, true);
            }
        }
        // 地図の場面（4秒）：1小節目はキック抜き → 2小節目は連打で盛り上げて、次の場面の頭で爆発
        function mapLeg(t0, dropNext) {
            beat(t0, 'snaps');
            notes(t0, RIFF_A, sub, 0.18);
            at(t0 + 2, function (T) {
                build(T, T + (dropNext ? 1.4 : 1.8), 0.05, 0.26, clap, 0.25, 0.0625);
                sub(38, T, 1.7, 0.16, 50);
                swell(T, T + 1.8, 0.14);
            });
            at(t0 + 2.9, function (T) { whoosh(T, 1.1, 0.2); });
            at(t0 + 2, function (T) { chord([62, 65, 69], T, 1.9, 0.02); });
        }

        // 0–6s タイトル：鼓動のようなキック → 2s で全員ドン → 3語に合わせて3発 → リフだけで走り出す
        at(0.1, function (T) { swell(T, T + 1.9, 0.12); chord([50, 57, 62], T, 1.9, 0.025); });
        [0.4, 0.62, 1.4, 1.62].forEach(function (t, j) { at(t, function (T) { kick(T, j % 2 ? 0.22 : 0.32); }); });
        at(2.0, function (T) { kick(T, 0.6); clap(T, 0.3); cymbal(T, 0.2, 1.1); sub(38, T, 0.55, 0.26, 0, true); chord([62, 65, 69, 74], T, 0.3, 0.05, synth); });
        [2.6, 3.1].forEach(function (t) { at(t, function (T) { kick(T, 0.5); snap(T, 0.32); sub(38, T, 0.2, 0.22); }); });
        at(3.6, function (T) { kick(T, 0.6); clap(T, 0.3); cymbal(T, 0.14, 1); sub(33, T, 0.35, 0.24, 38, true); });
        beat(4, 'snaps');
        notes(4, RIFF_A, sub, 0.2);
        at(5.4, function (T) { swell(T, T + 0.6, 0.12); });

        // 6–14s 港：ノリの本体。9s で汽笛
        at(6, function (T) { cymbal(T, 0.12, 1); });
        groove(6, [RIFF_A, RIFF_B], HOOK, 0.05);
        groove(10, [RIFF_A, RIFF_B], HOOK, 0.055, 0.02);
        [[[50, 57, 62, 65], 6], [[46, 58, 62, 65], 8], [[50, 57, 62, 65], 10], [[45, 57, 61, 64], 12]].forEach(function (b) {
            at(b[1], function (T) { chord(b[0], T, 2, 0.018); });
        });
        at(9.0, function (T) { shipHorn(T, 1.4); });

        // 14–18s 地図
        mapLeg(14);

        // 18–28s 砂漠：異国風のリフとフック → 24s エンジン不調でビートがよろける → 25.2s 落下 → 26s 墜落
        at(18.0, function (T) { cymbal(T, 0.14, 1.1); engine(T, T + 5.5, T + 7.2, 0.06); });
        groove(18, [RIFF_D, RIFF_D], HOOK_D, 0.05);
        beat(22, 'full');
        notes(22, RIFF_D, sub, 0.22);
        notes(22, HOOK_D.slice(0, 6), synth, 0.05);
        // よろけるビートと、テープが止まるように沈むベース
        at(24.0, function (T) {
            sub(38, T, 1.15, 0.22, 26);
            [0, 0.25, 0.5, 0.625, 0.75, 0.8125, 0.875].forEach(function (d, j) { snap(T + d, 0.28 - j * 0.03); });
        });
        at(25.2, function (T) { slideWhistle(T, 0.8); });
        at(26.0, function (T) { boom(T); kick(T, 0.7); sub(33, T, 0.9, 0.26, 26, true); cymbal(T, 0.22, 1.1); });
        at(26.8, function (T) { boing(T); });
        [27.0, 27.3, 27.6].forEach(function (t, j) { at(t, function (T) { glock(93 - j * 3, T, 0.04, 0.6); }); });
        at(27.0, function (T) { sadTrombone(T); });

        // 28–32s 地図
        mapLeg(28);

        // 32–40s 雪山の夜行列車：半分の速さに感じるビート＋長いベース＋夜のシンセ。34.4s 汽笛
        at(32, function (T) { cymbal(T, 0.1, 1); });
        [[38, [50, 57, 62, 65], 34], [34, [46, 58, 62, 65], 41], [41, [48, 57, 60, 65], 36], [36, [48, 55, 60, 64], 38]].forEach(function (b, j) {
            beat(32 + j * 2, 'half', 0.9);
            at(32 + j * 2, function (T) { sub(b[0], T, 1.9, 0.2, b[2]); chord(b[1], T, 2, 0.02); });
        });
        notes(32, [[0, 74, 1.5], [2, 72, 0.5], [2.5, 69, 1.5], [4, 70, 1.5], [6, 69, 2], [8, 72, 1.5], [10, 74, 0.5], [10.5, 77, 1.5], [12, 76, 4]], synth, 0.035);
        at(34.4, function (T) { trainWhistle(T, 1.2); });
        [32.7, 33.9, 36.2, 37.5, 38.8].forEach(function (t, j) { at(t, function (T) { glock([81, 86, 89, 88, 84][j], T, 0.03, 1.2); }); });

        // 40–44s 地図（最後は一瞬の無音 → 深海でドロップ）
        mapLeg(40, true);

        // 44–52s 深海：ドロップ。重く歪んだ808ベースが音程をすべらせる、スローで暗いビート
        [[38, 38], [34, 34], [31, 33], [33, 38]].forEach(function (b, j) {
            var t0 = 44 + j * 2;
            beat(t0, 'half', 1.1);
            notes(t0, [[0, b[0], 1.5], [1.75, b[0], 0.25], [2.5, b[0] + 3, 1.5, b[1]]], function (m, T, dd, v, g) { sub(m, T, dd, v, g, true); }, 0.26);
        });
        [[[50, 57, 62, 65], [74, 77, 81, 86]], [[46, 58, 62, 65], [74, 77, 82, 86]], [[43, 58, 62, 67], [74, 79, 82, 86]], [[45, 57, 61, 64], [73, 76, 81, 85]]].forEach(function (b, j) {
            at(44 + j * 2, function (T) { chord(b[0], T, 2, 0.022); });
            [0, 1, 2, 3, 2, 1, 0, 1].forEach(function (n, i2) { at(44 + j * 2 + i2 * 0.25, function (T) { glock(b[1][n], T, 0.018, 0.9); }); });
        });
        at(44, function (T) { kick(T, 0.7); cymbal(T, 0.2, 1.1); });
        [45.2, 48.2].forEach(function (t) { at(t, function (T) { ping(T); }); });
        for (k = 0; k < 14; k++) (function (t) { at(t, function (T) { blub(T); }); })(44.3 + hash(k * 5.3) * 7);
        at(50.0, function (T) { [74, 77, 81, 86, 89, 93, 98].forEach(function (m, j) { glock(m, T + j * 0.07, 0.045, 1.4); }); swell(T + 0.3, T + 2, 0.14); });
        at(51.0, function (T) { build(T, T + 0.95, 0.06, 0.26, clap, 0.125, 0.04); });

        // 52–62s フィナーレ：ノリが全開で戻る。56s からロゴの文字に合わせてシンセが駆け上がる
        at(52, function (T) { cymbal(T, 0.24, 1.1); });
        groove(52, [RIFF_A, RIFF_B], HOOK, 0.055, 0.025);
        groove(56, [RIFF_A, RIFF_B], HOOK, 0.06, 0.03);
        [[[50, 57, 62, 65], 52], [[46, 58, 62, 65], 54], [[50, 57, 62, 65], 56], [[45, 57, 61, 64], 58]].forEach(function (b) {
            at(b[1], function (T) { chord(b[0], T, 2, 0.022); });
        });
        [62, 65, 69, 74, 77, 81, 86, 89, 93, 98].forEach(function (m, j) { at(56 + j * 0.125, function (T) { synth(m, T, 0.1, 0.03, true); }); });
        at(58.9, function (T) { build(T, T + 1.05, 0.05, 0.24, snap, 0.125, 0.045); swell(T, T + 1.05, 0.12); });
        // 60s 最後の一発。ベースはテープが止まるように沈んで終わる
        at(60.0, function (T) {
            kick(T, 0.7);
            clap(T, 0.3);
            cymbal(T, 0.28, 1.1);
            sub(38, T, 1.8, 0.26, 26, true);
            chord([62, 65, 69, 72, 76], T, 0.5, 0.045, synth);
            chord([50, 57, 62, 65], T, 1.8, 0.03);
        });
        at(61.0, function (T) { snap(T, 0.25); });

        ev.sort(function (a, b) { return a.t - b.t; });

        var t0 = 0, idx = 0, muted = false;
        return {
            start: function (at0) { t0 = at0; idx = 0; },
            // 再生位置 now（秒）から 1.2 秒先までを予約する
            pump: function (now) {
                while (idx < ev.length && ev[idx].t < now + 1.2) {
                    var e = ev[idx++];
                    if (e.t >= now - 0.05) e.fn(t0 + e.t);
                }
            },
            setMuted: function (m) {
                muted = m;
                master.gain.setTargetAtTime(m ? 0 : 0.72, ac.currentTime, 0.05);
            },
            isMuted: function () { return muted; },
            fadeOut: function (sec) {
                master.gain.cancelScheduledValues(ac.currentTime);
                master.gain.setValueAtTime(master.gain.value, ac.currentTime);
                master.gain.linearRampToValueAtTime(0, ac.currentTime + sec);
            }
        };
    }

    /* ========== 主人公（このサイトのオリジナル） ==========
       若い探検家。茶色のハンチング帽、カーキの上着、紺のズボン、たなびく赤いマフラー */
    var SKIN = '#F6D2B0', CAP = '#7A5230', HAIR = '#4A2F1C', COAT = '#C9A45C', PANTS = '#3E4F66', SCARF = '#D8252E';

    // マフラーの端：根元 (x,y) から後ろ（dir=-1 で左）へ波打ちながら流れる帯
    function scarfTail(x, y, len, t, dir, width) {
        var n = 10, top = [], bot = [];
        for (var i = 0; i <= n; i++) {
            var p = i / n;
            var px = x + dir * len * p;
            var py = y + Math.sin(t * 11 - p * 5) * len * 0.16 * p + p * len * 0.12;
            var w = width * (1 - p * 0.45);
            top.push(px, py - w / 2);
            bot.unshift(px, py + w / 2);
        }
        poly(top.concat(bot));
        paint(SCARF, LINE * 0.8);
    }

    // 顔だけ（操縦席・潜水艇の窓・砂から顔を出す場面）。o.cap: 'cap' | 'aviator'、o.face: 'smile' | 'shock' | 'dizzy'
    function drawHead(x, y, r, t, o) {
        o = o || {};
        c.save();
        c.translate(x, y);
        if (o.angle) c.rotate(o.angle);
        var lw = Math.max(1.2, LINE * Math.min(1, r / 22));
        // 後ろ髪
        circle(-r * 0.55, r * 0.05, r * 0.5);
        paint(HAIR, lw);
        circle(0, 0, r);
        paint(SKIN, lw);
        // 耳
        circle(-r * 0.25, r * 0.08, r * 0.2);
        paint(SKIN, lw * 0.8);
        // 目・鼻・口（右向きの横顔寄り）
        c.fillStyle = INK;
        if (o.face === 'dizzy') {
            c.lineWidth = lw * 0.8;
            c.strokeStyle = INK;
            c.beginPath();
            c.arc(r * 0.42, -r * 0.1, r * 0.14, 0, TAU * 0.8);
            c.stroke();
        } else {
            circle(r * 0.45, -r * 0.12, r * (o.face === 'shock' ? 0.13 : 0.09));
            c.fill();
        }
        c.beginPath();
        c.moveTo(r * 0.92, -r * 0.05);
        c.quadraticCurveTo(r * 1.15, r * 0.12, r * 0.9, r * 0.2);
        ink(lw * 0.8);
        c.stroke();
        c.beginPath();
        if (o.face === 'shock') {
            oval(r * 0.55, r * 0.5, r * 0.12, r * 0.17);
            c.fill();
        } else {
            c.moveTo(r * 0.35, r * 0.45);
            c.quadraticCurveTo(r * 0.6, r * 0.62, r * 0.78, r * 0.42);
            c.stroke();
        }
        if (o.cap === 'aviator') {
            // 革の飛行帽＋額にゴーグル
            c.beginPath();
            c.arc(0, 0, r * 1.06, Math.PI * 0.92, Math.PI * 2.02);
            c.lineTo(r * 0.75, -r * 0.35);
            c.quadraticCurveTo(0, -r * 0.55, -r * 0.55, r * 0.55);
            c.closePath();
            paint('#6B4A2E', lw);
            oval(r * 0.25, -r * 0.62, r * 0.28, r * 0.22, -0.2);
            paint('#BFE3F2', lw * 0.9);
            oval(r * 0.72, -r * 0.5, r * 0.22, r * 0.2, -0.2);
            paint('#BFE3F2', lw * 0.9);
        } else {
            // ハンチング帽
            c.beginPath();
            c.moveTo(-r * 1.02, -r * 0.2);
            c.quadraticCurveTo(-r * 0.9, -r * 1.25, r * 0.35, -r * 1.12);
            c.quadraticCurveTo(r * 1.0, -r * 0.95, r * 1.35, -r * 0.45);
            c.quadraticCurveTo(r * 0.6, -r * 0.42, r * 0.2, -r * 0.5);
            c.quadraticCurveTo(-r * 0.5, -r * 0.45, -r * 1.02, -r * 0.2);
            c.closePath();
            paint(CAP, lw);
        }
        c.restore();
    }

    // 全身。x,y は足元、s は大きさ（1 で身長およそ110）。o.wave: 手を振る、o.facing: 1 右向き / -1 左向き
    function drawHero(x, y, s, t, o) {
        o = o || {};
        c.save();
        c.translate(x, y);
        c.scale(s * (o.facing || 1), s);
        var lw = LINE / Math.max(s, 0.3);
        lw = Math.min(lw, LINE * 1.6);
        // 靴とズボン
        oval(-8, -2, 10, 5);
        paint('#3A2A1E', lw);
        oval(10, -2, 10, 5);
        paint('#3A2A1E', lw);
        rrect(-14, -40, 11, 38, 3);
        paint(PANTS, lw);
        rrect(3, -40, 11, 38, 3);
        paint(PANTS, lw);
        // マフラーのしっぽ（体の後ろ）
        scarfTail(-4, -80, 34, t, -1, 8);
        // 上着
        poly([-18, -80, 16, -80, 19, -34, -19, -34]);
        paint(COAT, lw);
        c.beginPath();
        c.moveTo(-19, -44);
        c.lineTo(19, -44);
        ink(lw * 0.8);
        c.stroke();
        // 振っていない方の腕
        c.save();
        c.translate(-14, -76);
        c.rotate(0.15);
        rrect(-5, 0, 10, 34, 4);
        paint(COAT, lw);
        circle(0, 37, 5.5);
        paint(SKIN, lw * 0.8);
        c.restore();
        // 手を振る腕
        c.save();
        c.translate(14, -76);
        c.rotate(o.wave ? -2.3 + Math.sin(t * 9) * 0.45 : -0.15);
        rrect(-5, 0, 10, 34, 4);
        paint(COAT, lw);
        circle(0, 37, 5.5);
        paint(SKIN, lw * 0.8);
        c.restore();
        // 首のマフラー
        rrect(-13, -86, 26, 9, 4);
        paint(SCARF, lw * 0.9);
        drawHeadRaw(0, -100, 15, lw);
        c.restore();
    }
    // 全身用の頭（線の太さを外から渡す）
    function drawHeadRaw(x, y, r, lw) {
        var save = LINE;
        LINE = lw;
        drawHead(x, y, r, 0, { cap: 'cap' });
        LINE = save;
    }

    /* ========== 乗り物 ========== */
    // 汽船。x,y は喫水線の中央、船首は右
    function drawShip(x, y, s, t) {
        c.save();
        c.translate(x, y);
        c.rotate(Math.sin(t * 1.3) * 0.012);
        c.scale(s, s);
        // マスト（後ろ）と索具
        c.beginPath();
        c.moveTo(-225, -70); c.lineTo(-222, -238);
        c.moveTo(200, -70); c.lineTo(192, -262);
        ink(LINE);
        c.stroke();
        c.beginPath();
        c.moveTo(192, -258); c.lineTo(300, -95);
        c.moveTo(192, -258); c.lineTo(-222, -234);
        c.moveTo(-222, -234); c.lineTo(-280, -70);
        ink(LINE * 0.5);
        c.stroke();
        // 旗（はためく）
        var fl = [];
        for (var i = 0; i <= 6; i++) fl.push(-222 - i * 9, -236 + Math.sin(t * 8 - i * 0.9) * 3 * i / 6);
        for (i = 6; i >= 0; i--) fl.push(-222 - i * 9, -212 + Math.sin(t * 8 - i * 0.9) * 3 * i / 6);
        poly(fl);
        paint(RED, LINE * 0.7);
        circle(-248, -224, 5);
        paint(YELLOW, LINE * 0.5);
        // 煙突
        [-120, -35].forEach(function (fx) {
            poly([fx - 20, -128, fx + 18, -128, fx + 10, -226, fx - 30, -226]);
            paint(RED, LINE);
            poly([fx - 28, -226, fx + 10, -226, fx + 12, -206, fx - 26, -206]);
            paint('#262B36', LINE);
        });
        // 甲板の上の船室
        rrect(-185, -132, 320, 64, 6);
        paint('#F4EFE3', LINE);
        for (i = 0; i < 9; i++) {
            rrect(-170 + i * 33, -118, 20, 18, 3);
            paint('#7EC0D8', LINE * 0.6);
        }
        rrect(40, -176, 116, 46, 5);
        paint('#F4EFE3', LINE);
        for (i = 0; i < 4; i++) {
            rrect(52 + i * 25, -166, 16, 16, 2);
            paint('#7EC0D8', LINE * 0.6);
        }
        // 救命ボート
        oval(-150, -140, 34, 9);
        paint('#F4EFE3', LINE * 0.8);
        oval(-60, -140, 30, 9);
        paint('#F4EFE3', LINE * 0.8);
        // 船体
        c.beginPath();
        c.moveTo(-282, -72);
        c.lineTo(248, -72);
        c.quadraticCurveTo(290, -80, 312, -100);
        c.lineTo(276, 8);
        c.lineTo(-246, 8);
        c.quadraticCurveTo(-276, -20, -282, -72);
        c.closePath();
        paint('#262B36', LINE);
        c.beginPath();
        c.moveTo(-276, -56);
        c.lineTo(290, -56);
        c.lineWidth = 5;
        c.strokeStyle = '#E8E2D0';
        c.stroke();
        for (i = 0; i < 12; i++) {
            circle(-220 + i * 40, -32, 6);
            paint('#F6E7A8', LINE * 0.6);
        }
        // 船首に立って手を振る主人公
        drawHero(232, -72, 0.52, t, { wave: true });
        c.restore();
    }

    // 複葉機。x,y は胴体の中央、機首は右。o.prop: 1=全開（円盤に見える）〜0=止まりかけ、o.tilt: 機首の上下
    function drawPlane(x, y, s, t, o) {
        o = o || {};
        var prop = o.prop === undefined ? 1 : o.prop;
        c.save();
        c.translate(x, y);
        c.rotate(o.tilt || 0);
        c.scale(s, s);
        // 奥の支柱
        c.beginPath();
        c.moveTo(-52, -66); c.lineTo(-44, 20);
        c.moveTo(56, -66); c.lineTo(64, 20);
        ink(LINE * 0.8);
        c.stroke();
        // 尾翼
        poly([-150, -12, -140, -62, -112, -62, -104, -14]);
        paint('#2F74B5', LINE);
        oval(-132, -4, 34, 8);
        paint('#2F74B5', LINE);
        // 車輪
        c.beginPath();
        c.moveTo(18, 18); c.lineTo(22, 58);
        c.moveTo(42, 18); c.lineTo(26, 58);
        ink(LINE);
        c.stroke();
        circle(24, 60, 15);
        paint('#2A2A2A', LINE);
        circle(24, 60, 5);
        paint('#B9B9B9', LINE * 0.6);
        // 下の翼
        rrect(-72, 14, 156, 15, 7);
        paint('#2F74B5', LINE);
        // 胴体
        c.beginPath();
        c.moveTo(-152, -12);
        c.quadraticCurveTo(-60, -30, 70, -27);
        c.quadraticCurveTo(108, -24, 110, -2);
        c.quadraticCurveTo(108, 20, 70, 22);
        c.quadraticCurveTo(-60, 18, -152, 4);
        c.closePath();
        paint('#F1E4C3', LINE);
        poly([-148, -5, 108, -8, 109, 2, -148, 2]);
        paint(RED, 0);
        // 操縦席と主人公（マフラーが後ろへ流れる）
        scarfTail(-18, -30, 70 + Math.sin(t * 3) * 6, t * 1.4, -1, 11);
        drawHead(-6, -46, 17, t, { cap: 'aviator', face: o.face });
        oval(-8, -26, 30, 7);
        paint('#3A2A1E', LINE * 0.8);
        // エンジンのカバー
        circle(106, -2, 21);
        paint('#B9B9B9', LINE);
        circle(122, -2, 7);
        paint(RED, LINE * 0.8);
        // 上の翼と胴体をつなぐ支柱
        c.beginPath();
        c.moveTo(-20, -66); c.lineTo(-12, -26);
        c.moveTo(20, -66); c.lineTo(28, -26);
        ink(LINE * 0.8);
        c.stroke();
        // 上の翼
        rrect(-86, -82, 170, 17, 8);
        paint('#2F74B5', LINE);
        c.beginPath();
        c.moveTo(-60, -73); c.lineTo(62, -73);
        c.lineWidth = 3;
        c.strokeStyle = RED;
        c.stroke();
        // プロペラ：回転が速いと半透明の円盤、遅いと羽根が見える
        if (prop > 0.55) {
            c.save();
            c.globalAlpha = 0.28;
            oval(128, -2, 9, 60);
            c.fillStyle = '#E4E4E4';
            c.fill();
            c.restore();
            c.beginPath();
            c.ellipse(128, -2, 9, 60, 0, -1.2 + t * 7 % 1, -0.6 + t * 7 % 1);
            ink(LINE * 0.6);
            c.stroke();
        } else {
            var ang = t * (4 + prop * 30);
            var k = Math.cos(ang);
            poly([126, -2, 132, -2 - 58 * k, 124, -2 - 58 * k]);
            paint('#8A5A2B', LINE * 0.8);
            poly([126, -2, 132, -2 + 58 * k, 124, -2 + 58 * k]);
            paint('#8A5A2B', LINE * 0.8);
        }
        c.restore();
    }

    // 蒸気機関車＋客車3両。x,y はレールの上（機関車の先頭）。右向きに描いて dir=-1 で左向きに反転する
    function drawTrain(x, y, s, t, dir) {
        c.save();
        c.translate(x, y);
        c.scale(s * (dir || 1), s);
        var spin = t * 9;
        // 客車（後ろから描く）
        for (var k = 3; k >= 1; k--) {
            var cx = -k * 205 - 40;
            rrect(cx, -118, 190, 92, 8);
            paint('#7A2E2E', LINE);
            rrect(cx - 6, -128, 202, 14, 7);
            paint('#D9CFC0', LINE);
            for (var w = 0; w < 4; w++) {
                rrect(cx + 14 + w * 44, -104, 30, 34, 4);
                paint('#FFD76A', LINE * 0.7);
            }
            if (k === 2) {
                // 窓の中の主人公の影（帽子つき）
                c.save();
                rrect(cx + 58, -104, 30, 34, 4);
                c.clip();
                c.fillStyle = '#3A2A1E';
                circle(cx + 73, -82, 9);
                c.fill();
                c.beginPath();
                c.moveTo(cx + 62, -88); c.quadraticCurveTo(cx + 72, -100, cx + 86, -90);
                c.lineTo(cx + 62, -86);
                c.fill();
                c.fillRect(cx + 63, -74, 22, 12);
                c.fillStyle = SCARF;
                c.fillRect(cx + 64, -76, 20, 4);
                c.restore();
            }
            [cx + 34, cx + 156].forEach(function (wx) {
                circle(wx, -18, 13);
                paint('#2A2A2A', LINE);
                circle(wx, -18, 3);
                paint('#8C8C8C', 0);
            });
            c.beginPath();
            c.moveTo(cx + 190, -48); c.lineTo(cx + 205, -48);
            ink(LINE * 1.4);
            c.stroke();
        }
        // 機関車の運転室
        rrect(-40, -146, 76, 120, 6);
        paint('#8A2E2B', LINE);
        rrect(-50, -156, 96, 14, 6);
        paint('#2E2F36', LINE);
        rrect(-26, -132, 44, 34, 4);
        paint('#FFD76A', LINE * 0.7);
        // ボイラー
        rrect(30, -100, 170, 62, 10);
        paint('#2E2F36', LINE);
        [70, 120, 165].forEach(function (bx) {
            c.beginPath();
            c.moveTo(bx, -100); c.lineTo(bx, -38);
            c.lineWidth = 4;
            c.strokeStyle = '#C9A45C';
            c.stroke();
        });
        oval(110, -104, 20, 14);
        paint('#C9A45C', LINE);
        // 煙突
        poly([160, -100, 184, -100, 190, -148, 154, -148]);
        paint('#2E2F36', LINE);
        rrect(150, -156, 44, 12, 4);
        paint('#2E2F36', LINE);
        // 前面・排障器・前照灯
        rrect(196, -106, 22, 72, 5);
        paint('#1F2026', LINE);
        poly([205, -30, 240, -2, 196, -2]);
        paint(RED, LINE);
        circle(212, -118, 11);
        paint('#FFE58A', LINE);
        // 動輪（回る）と連結棒
        [60, 118, 176].forEach(function (wx) {
            circle(wx, -24, 24);
            paint('#B8322E', LINE);
            c.beginPath();
            for (var sp = 0; sp < 4; sp++) {
                var a = spin + sp * Math.PI / 4;
                c.moveTo(wx + Math.cos(a) * 22, -24 + Math.sin(a) * 22);
                c.lineTo(wx - Math.cos(a) * 22, -24 - Math.sin(a) * 22);
            }
            ink(LINE * 0.6);
            c.stroke();
            circle(wx, -24, 5);
            paint('#2E2F36', LINE * 0.6);
        });
        var rx = Math.cos(spin) * 12, ry = Math.sin(spin) * 12;
        rrect(60 + rx - 6, -24 + ry - 4, 128, 8, 4);
        paint('#C8C8C8', LINE * 0.7);
        c.restore();
    }

    // 潜水艇。x,y は船体の中央、前は右
    function drawSub(x, y, s, t) {
        c.save();
        c.translate(x, y);
        c.rotate(Math.sin(t * 0.9) * 0.03);
        c.scale(s, s);
        // 後ろのスクリュー
        c.beginPath();
        c.moveTo(-150, 0); c.lineTo(-182, 0);
        ink(LINE);
        c.stroke();
        var k = Math.cos(t * 14);
        oval(-184, -26 * k * 0.5 - 0, 8, 26 * Math.abs(k) + 2);
        paint('#C9A45C', LINE * 0.8);
        oval(-184, 26 * k * 0.5, 8, 26 * Math.abs(Math.sin(t * 14)) + 2);
        paint('#C9A45C', LINE * 0.8);
        // ひれ
        poly([-120, -40, -160, -72, -150, -30]);
        paint('#E0A800', LINE);
        poly([-120, 40, -160, 72, -150, 30]);
        paint('#E0A800', LINE);
        // 司令塔と潜望鏡
        c.beginPath();
        c.moveTo(12, -94); c.lineTo(12, -134); c.lineTo(34, -134);
        ink(LINE * 1.6);
        c.stroke();
        rrect(-40, -96, 86, 50, 10);
        paint('#F5C518', LINE);
        // 船体
        oval(0, 0, 160, 58);
        paint('#F5C518', LINE);
        c.beginPath();
        c.ellipse(0, 0, 160, 58, 0, 0.2, Math.PI - 0.2);
        c.lineWidth = 6;
        c.strokeStyle = '#E0A800';
        c.stroke();
        for (var i = 0; i < 7; i++) {
            circle(-110 + i * 30, -30 + Math.abs(i - 3) * 3, 3);
            paint('#E0A800', 0);
        }
        // 前照灯
        oval(158, 18, 10, 14);
        paint('#FFF3B0', LINE);
        // 丸窓と、中から外をのぞく主人公
        circle(80, -8, 30);
        paint('#8FA3AE', LINE);
        c.save();
        circle(80, -8, 22);
        c.fillStyle = '#BFE3F2';
        c.fill();
        c.clip();
        drawHead(78, 2, 17, t, { cap: 'cap', face: t > 6 ? 'shock' : 'smile' });
        c.restore();
        circle(80, -8, 22);
        ink(LINE * 0.8);
        c.stroke();
        c.save();
        c.globalAlpha = 0.5;
        c.beginPath();
        c.arc(80, -8, 15, -2.4, -1.6);
        c.lineWidth = 4;
        c.strokeStyle = '#fff';
        c.stroke();
        c.restore();
        c.restore();
    }

    /* ========== 古地図 ==========
       架空の世界（3200×1800）。大陸は乱数ではなく決まった式で作るので毎回同じ形 */
    var MAP = null;
    function buildMap() {
        function blob(cx, cy, R, seed, n, sx, sy) {
            var pts = [];
            for (var i = 0; i < n; i++) {
                var a = i / n * TAU;
                var r = R * (1 + 0.2 * Math.sin(3 * a + seed) + 0.11 * Math.sin(7 * a + seed * 2.3) + 0.06 * Math.sin(13 * a + seed * 4.1));
                pts.push(cx + Math.cos(a) * r * (sx || 1.25), cy + Math.sin(a) * r * (sy || 0.85));
            }
            return pts;
        }
        MAP = {
            lands: [
                { pts: blob(700, 620, 330, 1.3, 72), fill: '#E9D3A1' },   // 西の大陸（ルーメン港）
                { pts: blob(1330, 1210, 350, 2.7, 72), fill: '#F0C987' }, // 砂漠の大陸
                { pts: blob(2170, 620, 410, 4.2, 80), fill: '#DCE0B8' },  // 山の大陸
                { pts: blob(2850, 1520, 100, 5.1, 30), fill: '#E9D3A1' },
                { pts: blob(380, 1380, 120, 6.3, 30), fill: '#E9D3A1' },
                { pts: blob(1840, 1580, 80, 7.7, 24), fill: '#E9D3A1' },
                { pts: blob(2980, 330, 130, 8.9, 30), fill: '#DCE0B8' }
            ],
            // 経由地：ルーメン港 → サハラン砂漠 → ヒマラン山脈 → 深海アビス
            stops: [[990, 560], [1300, 1140], [2080, 610], [2600, 1330]],
            names: ['ルーメン港', 'サハラン砂漠', 'ヒマラン山脈', '深海アビス'],
            icons: ['ship', 'train', 'sub']
        };
    }
    // 航路の i 本目（i→i+1）の上の点。ゆるく弧を描く
    function routePt(i, p) {
        var a = MAP.stops[i], b = MAP.stops[i + 1];
        var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        var dx = b[0] - a[0], dy = b[1] - a[1];
        var qx = mx - dy * 0.28, qy = my + dx * 0.28;
        var u = 1 - p;
        return [u * u * a[0] + 2 * u * p * qx + p * p * b[0], u * u * a[1] + 2 * u * p * qy + p * p * b[1]];
    }
    // 日本語の描き文字（墨のふち取り）
    function jpText(str, x, y, size, fill, align) {
        c.save();
        c.font = '700 ' + size + 'px ' + FONT_JP;
        c.textAlign = align || 'center';
        c.textBaseline = 'middle';
        c.lineJoin = 'round';
        c.lineWidth = size * 0.22;
        c.strokeStyle = INK;
        c.strokeText(str, x, y);
        c.fillStyle = fill;
        c.fillText(str, x, y);
        c.restore();
    }
    function compass(x, y, r, rot) {
        c.save();
        c.translate(x, y);
        circle(0, 0, r);
        paint('#F3E3BD', LINE);
        circle(0, 0, r * 0.82);
        ink(LINE * 0.5);
        c.stroke();
        c.rotate(rot);
        for (var i = 0; i < 8; i++) {
            var long = i % 2 === 0, len = long ? r * 0.78 : r * 0.45;
            c.save();
            c.rotate(i * TAU / 8);
            poly([0, -len, len * 0.16, 0, -len * 0.16, 0]);
            paint(i === 0 ? RED : long ? '#F7F0DC' : '#C9B78C', LINE * 0.6);
            c.restore();
        }
        circle(0, 0, r * 0.08);
        paint(INK, 0);
        c.restore();
    }
    // 乗り物のアイコン（地図の上を進む）。画面上でおよそ size px
    function vehicleIcon(type, x, y, size, t) {
        var saveLine = LINE;
        c.save();
        c.translate(x, y);
        oval(0, size * 0.18, size * 0.55, size * 0.12);
        c.fillStyle = 'rgba(16,11,6,0.25)';
        c.fill();
        if (type === 'ship') { LINE = 1.8 / (size / 620); drawShip(0, size * 0.1, size / 620, t); }
        if (type === 'train') { LINE = 1.8 / (size / 1000); drawTrain(size * 0.35, size * 0.12, size / 1000, t, 1); }
        if (type === 'sub') { LINE = 1.8 / (size / 380); drawSub(0, 0, size / 380, t); }
        LINE = saveLine;
        c.restore();
    }

    // 地図を描く。(cx,cy) を画面の中央に、zoom 倍で。prog は航路の進み（0〜3。1で1本目が引き終わる）
    function drawMap(cx, cy, zoom, t, prog, showIcon) {
        var i, j, x, y;
        c.save();
        c.fillStyle = '#A9D6E5';
        c.fillRect(0, 0, W, H);
        c.translate(W / 2, H / 2);
        c.scale(zoom, zoom);
        c.translate(-cx, -cy);
        var px = 1 / zoom;   // 画面の1px
        // 経緯線（点線）
        c.save();
        c.setLineDash([10 * px, 8 * px]);
        c.lineWidth = 1.4 * px;
        c.strokeStyle = 'rgba(16,11,6,0.28)';
        c.beginPath();
        for (x = 0; x <= 3200; x += 200) { c.moveTo(x, -200); c.lineTo(x, 2000); }
        for (y = 0; y <= 1800; y += 200) { c.moveTo(-200, y); c.lineTo(3400, y); }
        c.stroke();
        c.restore();
        // 海の波のしるし
        c.beginPath();
        for (i = 0; i < 70; i++) {
            x = hash(i * 3.3) * 3200;
            y = hash(i * 7.7) * 1800;
            c.moveTo(x, y);
            c.quadraticCurveTo(x + 14, y - 10, x + 28, y);
            c.quadraticCurveTo(x + 42, y + 10, x + 56, y);
        }
        c.lineWidth = 2.2 * px;
        c.strokeStyle = '#6FAFC6';
        c.stroke();
        // 陸（外側に薄い色の縁取りを重ねて古地図らしく）
        MAP.lands.forEach(function (l) {
            smoothClosed(l.pts);
            c.lineWidth = 16 * px;
            c.strokeStyle = '#C3E3EC';
            c.stroke();
            paint(l.fill, LINE * px);
        });
        // 森（西の大陸）
        for (i = 0; i < 16; i++) {
            x = 480 + hash(i * 2.1) * 420;
            y = 520 + hash(i * 5.9) * 240;
            c.beginPath();
            c.moveTo(x, y + 18); c.lineTo(x, y + 30);
            ink(2 * px);
            c.stroke();
            circle(x, y + 8, 14);
            paint('#7DB26A', 2 * px);
        }
        // 砂丘（砂漠の大陸）
        c.beginPath();
        for (i = 0; i < 14; i++) {
            x = 1080 + hash(i * 4.4) * 440;
            y = 1060 + hash(i * 6.1) * 300;
            c.moveTo(x, y);
            c.quadraticCurveTo(x + 30, y - 22, x + 60, y);
        }
        ink(2.2 * px);
        c.stroke();
        // 山（山の大陸）
        for (i = 0; i < 15; i++) {
            x = 1860 + hash(i * 3.7) * 560;
            y = 480 + hash(i * 8.3) * 300;
            var hh = 44 + hash(i * 1.9) * 30;
            poly([x - hh * 0.8, y, x, y - hh, x + hh * 0.8, y]);
            paint('#A9A48A', 2.2 * px);
            poly([x - hh * 0.28, y - hh * 0.65, x, y - hh, x + hh * 0.28, y - hh * 0.65, x + hh * 0.1, y - hh * 0.55]);
            paint('#FFFFFF', 1.6 * px);
        }
        // 深海の「×」
        var ab = MAP.stops[3];
        c.beginPath();
        c.moveTo(ab[0] - 22, ab[1] - 22); c.lineTo(ab[0] + 22, ab[1] + 22);
        c.moveTo(ab[0] + 22, ab[1] - 22); c.lineTo(ab[0] - 22, ab[1] + 22);
        c.lineWidth = 7 * px;
        c.strokeStyle = RED;
        c.lineCap = 'round';
        c.stroke();
        // 航路（赤い点線）
        c.save();
        c.setLineDash([0.1, 17 * px]);
        c.lineCap = 'round';
        c.lineWidth = 8 * px;
        c.strokeStyle = RED;
        c.beginPath();
        for (i = 0; i < 3; i++) {
            var pr = clamp(prog - i, 0, 1);
            if (pr <= 0) break;
            for (j = 0; j <= 40; j++) {
                var q = routePt(i, pr * j / 40);
                if (j === 0) c.moveTo(q[0], q[1]); else c.lineTo(q[0], q[1]);
            }
        }
        c.stroke();
        c.restore();
        // 経由地の印と地名（文字は画面上で同じ大きさに保つ）
        for (i = 0; i < 4; i++) {
            var st = MAP.stops[i];
            var reached = prog >= i - 0.001;
            circle(st[0], st[1], 11 * px);
            paint(reached ? RED : '#F7F0DC', 2.4 * px);
            c.save();
            c.translate(st[0], st[1] - 34 * px);
            c.scale(px, px);
            jpText(MAP.names[i], 0, 0, 26, reached ? CREAM : '#E8DCC0');
            c.restore();
        }
        // 進んでいる乗り物
        if (showIcon && prog > 0 && prog < 3) {
            var leg = Math.min(Math.floor(prog), 2);
            var pt = routePt(leg, prog - leg);
            c.save();
            c.translate(pt[0], pt[1]);
            c.scale(px, px);
            vehicleIcon(MAP.icons[leg], 0, -30, 110, t);
            c.restore();
        }
        c.restore();
    }

    /* ========== 場面：タイトル（0–6s） ========== */
    // 文字が上から落ちてきて tArrive ぴったりに着地する（着地でつぶれて戻る＋衝撃線）
    function slamWord(str, x, y, size, fill, t, tArrive, quiet) {
        var fall = 0.26;
        var a = t - (tArrive - fall);
        if (a < 0) return;
        var p = seg(a, 0, fall), sx, sy, dy = 0;
        if (p < 1) {
            var e = easeInCubic(p);
            sx = sy = lerp(2.4, 1, e);
            dy = lerp(-160, 0, e);
        } else {
            var b = a - fall;
            var sq = Math.exp(-b * 9) * Math.cos(b * 26) * 0.14;
            sx = 1 + sq;
            sy = 1 - sq;
            if (b < 0.22 && !quiet) {
                // 衝撃線
                c.save();
                c.translate(x, y - size * 0.35);
                var len = size * (0.7 + b * 3);
                for (var i = 0; i < 12; i++) {
                    var ang = i / 12 * TAU + 0.2;
                    var r0 = size * 1.1 + b * 400;
                    c.beginPath();
                    c.moveTo(Math.cos(ang) * r0 * 1.9, Math.sin(ang) * r0 * 0.7);
                    c.lineTo(Math.cos(ang) * (r0 * 1.9 + len), Math.sin(ang) * (r0 * 0.7 + len * 0.4));
                    ink(LINE * 1.2);
                    c.stroke();
                }
                c.restore();
            }
        }
        c.save();
        c.globalAlpha = seg(a, 0, 0.08);
        c.translate(x, y + dy);
        c.scale(sx, sy);
        comicText(str, 0, 0, size, fill);
        c.restore();
    }
    function sunburst(x, y, r, rot, alpha) {
        c.save();
        c.translate(x, y);
        c.rotate(rot);
        c.globalAlpha = alpha;
        c.fillStyle = '#F9E27D';
        c.beginPath();
        for (var i = 0; i < 24; i += 2) {
            var a0 = i / 24 * TAU, a1 = (i + 1) / 24 * TAU;
            c.moveTo(0, 0);
            c.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
            c.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
            c.closePath();
        }
        c.fill();
        c.restore();
    }
    function sceneTitle(t) {
        var z = lerp(0.47, 0.54, easeInOut(seg(t, 0, 6)));
        drawMap(lerp(1650, 1600, seg(t, 0, 6)), 930, z, t, 0, false);
        // タイトルの後ろを少し暗く
        c.fillStyle = 'rgba(16,11,6,' + (0.42 * easeOutCubic(seg(t, 1.6, 2.1))) + ')';
        c.fillRect(0, 0, W, H);
        var burst = easeOutBack(seg(t, 2.0, 2.5));
        if (burst > 0) sunburst(800, 450, 1300 * burst, t * 0.12, 0.28);
        compass(1440, 760, 86 * easeOutBack(seg(t, 0.6, 1.2)), t * 0.3);
        // ATLAS COMIC PRESENTS
        var pa = seg(t, 0.9, 1.5);
        if (pa > 0) {
            c.save();
            c.globalAlpha = pa;
            comicText('ATLAS COMIC PRESENTS', 800, 208 - (1 - easeOutCubic(pa)) * 30, 34, CREAM, 0, 3);
            c.restore();
        }
        slamWord('THE', 800, 318, 64, CREAM, t, 2.6);
        slamWord('ATLAS', 800, 500, 200, RED, t, 3.1);
        slamWord('EXPEDITION', 800, 628, 118, YELLOW, t, 3.6);
        var sa = seg(t, 4.2, 4.8);
        if (sa > 0) {
            c.save();
            c.globalAlpha = sa;
            jpText('〜 アトラス探検記 〜', 800, 718 + (1 - easeOutCubic(sa)) * 20, 40, CREAM);
            c.restore();
        }
    }

    /* ========== 場面：地図の移動（14–18s / 28–32s / 40–44s） ========== */
    function sceneMapLeg(leg, t) {
        var a = MAP.stops[leg], b = MAP.stops[leg + 1];
        var p = easeInOut(seg(t, 0.4, 2.9));
        var prog = leg + p;
        var tip = routePt(leg, p);
        var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        // カメラ：はじめは2点の中間を引きで → 乗り物を追う → 目的地へ突っ込む
        var follow = easeInOut(seg(t, 0.2, 1.4));
        var cx = lerp(mid[0], tip[0], follow * 0.6), cy = lerp(mid[1], tip[1], follow * 0.6);
        var dive = easeInCubic(seg(t, 2.95, 3.85));
        cx = lerp(cx, b[0], dive);
        cy = lerp(cy, b[1], dive);
        var zoom = lerp(0.95, 1.15, seg(t, 0, 2.9)) * lerp(1, 5, dive);
        drawMap(cx, cy, zoom, t, prog, t < 3.05);
        // 目的地の名前がポンと出る
        var la = seg(t, 2.75, 3.05);
        if (la > 0 && t < 3.7) {
            var s = easeOutBack(la);
            c.save();
            c.translate(W / 2, 150);
            c.scale(s, s);
            c.rotate(-0.03);
            rrect(-250, -52, 500, 104, 8);
            c.fillStyle = INK;
            c.save();
            c.translate(8, 8);
            c.fill();
            c.restore();
            paint('#F9E27D', LINE);
            jpText(MAP.names[leg + 1], 0, 2, 52, CREAM);
            c.restore();
        }
        compass(1470, 780, 70, t * 0.4 + leg);
    }

    /* ========== 背景の小物 ========== */
    function cloud(x, y, s, fill) {
        puffs([x, y, 40 * s, x + 45 * s, y - 20 * s, 48 * s, x + 95 * s, y - 6 * s, 38 * s, x + 132 * s, y + 8 * s, 26 * s,
            x - 38 * s, y + 10 * s, 26 * s, x + 50 * s, y + 14 * s, 34 * s], fill || '#FFF8EA', LINE * Math.min(1, s + 0.3));
    }
    // 画面の横幅＋余白でくり返し流れる位置
    function wrapX(x, span) { span = span || W + 500; return ((x % span) + span) % span - 250; }
    function seagull(x, y, s, t, ph) {
        var f = Math.sin(t * 9 + ph);
        c.beginPath();
        c.moveTo(x - 24 * s, y - 4 * s + f * 12 * s);
        c.quadraticCurveTo(x - 11 * s, y - 16 * s, x, y);
        c.quadraticCurveTo(x + 11 * s, y - 16 * s, x + 24 * s, y - 4 * s + f * 12 * s);
        ink(LINE * 0.9);
        c.stroke();
    }
    // 煙・砂ぼこりの粒。spawn 秒ごとに生まれ、life 秒で縮んで消える。pos(生まれた時刻, 年齢) → [x, y, r]
    function particles(t, from, to, spawn, life, pos) {
        var list = [];
        var i0 = Math.max(0, Math.ceil((t - life - from) / spawn));
        for (var i = i0; ; i++) {
            var born = from + i * spawn;
            if (born > t || born > to) break;
            var age = t - born;
            if (age > life) continue;
            var q = pos(born, age, i);
            if (q) list.push(q[0], q[1], q[2] * (1 - easeInCubic(seg(age, life * 0.7, life))));
        }
        return list;
    }

    /* ========== 場面：港町ルーメン・夜明け（6–14s） ========== */
    function sceneSea(t) {
        var cam = t * 40;
        var i, x;
        // 空はベタ塗りの帯
        c.fillStyle = '#FCE6B8';
        c.fillRect(0, 0, W, H);
        c.fillStyle = '#F9D69C';
        c.fillRect(0, 400, W, 200);
        circle(1130, 470, 200);
        c.fillStyle = '#FDEFC9';
        c.fill();
        circle(1130, 470, 122);
        paint('#F9C74F', LINE);
        for (i = 0; i < 4; i++) cloud(wrapX(180 + i * 470 - cam * 0.12), 120 + (i % 2) * 90, 0.8 + (i % 3) * 0.2);
        // 遠くの港町（船が進むと左へ流れていく）
        c.save();
        c.translate(-cam * 0.5, 0);
        var hz = 568;
        [[20, 120, 90], [120, 80, 150], [210, 110, 110], [330, 70, 190], [410, 120, 120], [540, 90, 80]].forEach(function (b, k) {
            rrect(b[0], hz - b[2], b[1], b[2] + 10, 2);
            paint(k % 2 ? '#D9A077' : '#CB8E68', LINE * 0.7);
            poly([b[0] - 6, hz - b[2], b[0] + b[1] / 2, hz - b[2] - 34, b[0] + b[1] + 6, hz - b[2]]);
            paint('#B5654A', LINE * 0.7);
            for (var w = 0; w < 3; w++) {
                rrect(b[0] + 14 + w * (b[1] - 28) / 3, hz - b[2] + 22, 12, 16, 2);
                paint('#F6E7A8', LINE * 0.4);
            }
        });
        // 教会の丸屋根
        rrect(350, hz - 250, 34, 70, 3);
        paint('#CB8E68', LINE * 0.7);
        c.beginPath();
        c.arc(367, hz - 250, 24, Math.PI, 0);
        c.closePath();
        paint('#6FA37A', LINE * 0.7);
        // 灯台（光がゆっくり回る）
        poly([640, hz, 660, hz - 190, 690, hz - 190, 710, hz]);
        paint('#F4EFE3', LINE * 0.8);
        poly([646, hz - 60, 704, hz - 60, 700, hz - 100, 650, hz - 100]);
        paint(RED, LINE * 0.6);
        rrect(652, hz - 222, 46, 32, 4);
        paint('#FFE58A', LINE * 0.8);
        poly([646, hz - 222, 675, hz - 250, 704, hz - 222]);
        paint(RED, LINE * 0.8);
        var ba = Math.sin(t * 1.4);
        c.save();
        c.globalAlpha = 0.22 * Math.abs(ba);
        c.fillStyle = '#FFF3B0';
        poly([675, hz - 206, 675 + 700 * ba, hz - 250, 675 + 700 * ba, hz - 160]);
        c.fill();
        c.restore();
        c.restore();
        // 海の帯（奥から3本）
        var bands = [[585, 5, 70, '#3F8FB5'], [628, 7, 90, '#4E9CC0'], [675, 9, 110, '#3F8FB5'], [722, 11, 130, '#57A6C8'], [800, 14, 160, '#2F7AA2']];
        function wave(k) {
            var b = bands[k];
            terrain(function (xx) {
                return b[0] + Math.sin((xx + cam * (0.4 + k * 0.3)) / b[2] + t * (0.8 + k * 0.2)) * b[1];
            }, -20, W + 20, H + 20, b[3], k < 2 ? LINE * 0.6 : LINE * 0.9, 20);
        }
        wave(0); wave(1); wave(2);
        // カモメ
        for (i = 0; i < 3; i++) seagull(wrapX(300 + i * 260 + t * 70 - cam * 0.2), 250 + i * 40 + Math.sin(t * 1.3 + i) * 14, 1 - i * 0.15, t, i * 2);
        // 船と煙
        var sx = 520 + t * 12, sy = 724 + Math.sin(t * 1.6) * 5, s = 0.95;
        var smoke = [];
        [-130, -45].forEach(function (fx, k) {
            smoke = smoke.concat(particles(t, -3 + k * 0.17, 99, 0.34, 3.4, function (born, age) {
                return [sx + fx * s - age * 70 - age * age * 9, sy - 230 * s - age * 58 - age * age * 4, 16 + age * 17];
            }));
        });
        puffs(smoke, '#EFE9DF');
        drawShip(sx, sy, s, t);
        // 船首の白波と航跡
        var foam = [];
        for (i = 0; i < 9; i++) {
            var fx2 = sx + 290 * s - i * 70 - ((t * 60 + i * 30) % 70);
            foam.push(fx2, sy + 8 + Math.sin(t * 5 + i) * 3, 12 + (i === 0 ? 10 : 0) - i * 0.8);
        }
        foam.push(sx + 300 * s, sy - 4, 16);
        puffs(foam, '#FFFFFF', LINE * 0.8);
        wave(3); wave(4);
        // 波頭の白い巻き
        c.beginPath();
        for (i = 0; i < 12; i++) {
            x = wrapX(i * 170 - cam * 1.4 - t * 30, W + 300);
            var y = 812 + Math.sin(i * 1.7) * 30;
            c.moveTo(x, y);
            c.quadraticCurveTo(x + 18, y - 16, x + 36, y - 4);
        }
        c.lineWidth = 5;
        c.strokeStyle = '#E8F4FA';
        c.stroke();
        caption(['港町ルーメン、夜明け——', '若き探検家アトラスの旅が、いま始まる。'], 56, 48, t, 0.7, 7.4);
        sfx('BWOOOO!', sx - 90, 300, 92, t, 3.0, 1.7, YELLOW, -0.1);
    }
    function seaFocus(t) { return [520 + t * 12 + 232 * 0.95, 724 - 125 * 0.95]; }

    /* ========== 場面：砂漠の上空（18–28s） ========== */
    // カメラ（右へ飛ぶ飛行機を追う）。墜落の直前から止まる
    function desertCam(t) {
        if (t < 7.2) return t * 260;
        var u = Math.min(t - 7.2, 1);
        return 260 * 7.2 + 260 * (u - u * u / 2);
    }
    // 飛行機の位置と傾き（画面座標）
    function planeAt(t) {
        var x = 560 + Math.sin(t * 0.8) * 40, y = 330 + Math.sin(t * 1.3) * 22, tilt = Math.cos(t * 1.3) * 0.05, s = 1;
        if (t < 1.1) x = lerp(-320, x, easeOutCubic(seg(t, 0, 1.1)));
        if (t > 5.5) {
            var w = seg(t, 5.5, 7.2);
            tilt += Math.sin(t * 10) * 0.1 * w + 0.12 * w;
            y += 40 * w;
        }
        if (t > 7.2) {
            var d = easeInCubic(seg(t, 7.2, 8.05));
            var x0 = 560 + Math.sin(7.2 * 0.8) * 40, y0 = 330 + Math.sin(7.2 * 1.3) * 22 + 40;
            x = lerp(x0, 1190, d);
            y = lerp(y0, 800, d);
            tilt = lerp(0.15, 0.95, easeInOut(seg(t, 7.2, 7.8)));
            s = lerp(1, 0.75, d);
        }
        return { x: x, y: y, tilt: tilt, s: s };
    }
    function camel(x, y, s, t, ph) {
        c.save();
        c.translate(x, y);
        c.scale(s, s);
        var step = Math.sin(t * 6 + ph);
        c.beginPath();
        [[-26, step], [-14, -step], [18, -step], [30, step]].forEach(function (l) {
            c.moveTo(l[0], -30);
            c.lineTo(l[0] + l[1] * 6, 0);
        });
        ink(LINE * 1.4);
        c.stroke();
        oval(0, -40, 40, 16);
        paint('#9C6A3A', LINE);
        oval(-4, -56, 16, 14);
        paint('#9C6A3A', LINE);
        poly([34, -42, 50, -74, 60, -72, 46, -38]);
        paint('#9C6A3A', LINE);
        oval(62, -74, 12, 7);
        paint('#9C6A3A', LINE);
        // 乗っている人
        rrect(-12, -86, 16, 24, 5);
        paint('#F4EFE3', LINE * 0.8);
        circle(-4, -92, 8);
        paint('#F4EFE3', LINE * 0.8);
        c.restore();
    }
    function sceneDesert(t) {
        var cam = desertCam(t);
        var i;
        c.fillStyle = '#8ED0EE';
        c.fillRect(0, 0, W, H);
        c.fillStyle = '#7CC4E8';
        c.fillRect(0, 0, W, 170);
        circle(1320, 150, 110);
        c.fillStyle = '#C4E9F7';
        c.fill();
        circle(1320, 150, 68);
        paint('#FFF4B8', LINE);
        for (i = 0; i < 3; i++) cloud(wrapX(300 + i * 600 - cam * 0.06), 110 + i * 50, 0.6 + i * 0.15, '#FFFFFF');
        // 遠くの台地（平らな頂上）
        terrain(function (x) {
            var xw = x + cam * 0.12;
            var h = clamp(Math.sin(xw / 170) * 1.6 - 0.35, 0, 1) + clamp(Math.sin(xw / 83 + 1) * 1.4 - 0.9, 0, 1) * 0.5;
            return 520 - 95 * h;
        }, -20, W + 20, H, '#E2A66A', LINE * 0.7, 6);
        // 中くらいの砂丘とラクダの隊商
        function midF(x) { var xw = x + cam * 0.35; return 600 + Math.sin(xw / 260) * 30 + Math.sin(xw / 97) * 10; }
        terrain(midF, -20, W + 20, H, '#EDC07F', LINE * 0.8, 12);
        for (i = 0; i < 4; i++) {
            var cx = wrapX(900 + i * 95 - cam * 0.35 + t * 22, 3200);
            camel(cx, midF(cx) + 4, 0.55, t, i);
        }
        // 飛行機と、エンジン不調の黒い煙
        var smoke = particles(t, 5.5, 8.0, 0.16, 1.6, function (born, age) {
            var p = planeAt(born);
            var nx = p.x + Math.cos(p.tilt) * 110 * p.s, ny = p.y + Math.sin(p.tilt) * 110 * p.s;
            return [nx - age * 200 * (born < 7.2 ? 1 : 0.4), ny - age * 60, 12 + age * 22];
        });
        puffs(smoke, '#4A4540');
        var pl = planeAt(t);
        if (t < 8.1) {
            drawPlane(pl.x, pl.y, pl.s, t, { prop: t < 5.5 ? 1 : lerp(0.5, 0.05, seg(t, 5.5, 7.4)), tilt: pl.tilt, face: t > 5.8 ? 'shock' : 'smile' });
        }
        // 砂から顔を出す主人公（手前の砂丘の後ろから）と、突き刺さった尾翼
        if (t > 8.5) {
            c.save();
            c.translate(1262, 772);
            c.rotate(0.5);
            poly([-10, 30, 0, -62, 30, -62, 38, 30]);
            paint('#2F74B5', LINE);
            c.restore();
            var hy = lerp(840, 722, easeOutBack(seg(t, 8.75, 9.1)));
            drawHead(1180, hy, 36, t, { cap: 'aviator', face: 'dizzy', angle: -0.18 + Math.sin(t * 5) * 0.05 });
        }
        // 手前の砂丘（2段）
        terrain(function (x) { var xw = x + cam * 0.7; return 740 + Math.sin(xw / 310 + 1) * 34 + Math.sin(xw / 120) * 10; }, -20, W + 20, H, '#E3A55C', LINE, 10);
        c.beginPath();
        for (i = 0; i < 14; i++) {
            var rx = wrapX(i * 140 - cam * 0.7, W + 400), ry = 800 + (i % 3) * 30;
            c.moveTo(rx, ry);
            c.quadraticCurveTo(rx + 25, ry - 10, rx + 50, ry);
        }
        ink(LINE * 0.6);
        c.stroke();
        terrain(function (x) { var xw = x + cam; return 850 + Math.sin(xw / 400 + 2) * 36; }, -20, W + 20, H + 10, '#D48D45', LINE, 10);
        // 墜落の砂ぼこり
        if (t > 8.0 && t < 10) {
            var dust = [];
            var g = easeOutCubic(seg(t, 8.0, 8.6)), sh = 1 - easeInCubic(seg(t, 9.0, 9.8));
            for (i = 0; i < 14; i++) {
                var ang = Math.PI + i / 13 * Math.PI;
                var dist = (70 + hash(i * 2.2) * 110) * g;
                dust.push(1185 + Math.cos(ang) * dist * 1.5, 740 + Math.sin(ang) * dist * 0.9, (38 + hash(i * 4.1) * 44) * g * sh);
            }
            puffs(dust, '#F3D39B');
        }
        // 目を回した頭の上をまわる星
        if (t > 9.0) {
            for (i = 0; i < 3; i++) {
                var a = t * 5 + i * TAU / 3;
                star5(1180 + Math.cos(a) * 62, 652 + Math.sin(a) * 14, 13, t * 3, YELLOW);
            }
        }
        caption(['サハラン砂漠の上空——'], 56, 48, t, 0.6, 5.0);
        sfx('BRRRRM!', 330, 250, 70, t, 1.0, 1.6, CREAM, -0.08);
        sfx('PUTT! PUTT!', pl.x + 90, pl.y - 110, 54, t, 5.6, 1.5, CREAM, 0.1);
        bubble('?!', pl.x - 60, pl.y - 170, pl.x - 20, pl.y - 70, t, 5.9, 7.1, 46);
        sfx('KA-BOOM!', 1150, 560, 128, t, 8.03, 1.3, '#FF9A1F', -0.07);
        bubble('やれやれ…', 1400, 540, 1225, 680, t, 9.05, 10, 34, true);
    }
    function desertFocus(t) { return [1180, 712]; }

    /* ========== 場面：雪山の夜行列車（32–40s） ========== */
    // 山並み：peaks = [[x, 高さ], ...]。頂上に雪（下端がギザギザの白）
    function range(baseY, peaks, fill, snow, lw) {
        c.beginPath();
        c.moveTo(-40, H + 20);
        c.lineTo(-40, baseY);
        peaks.forEach(function (p, k) {
            var prev = k ? peaks[k - 1][0] : -40;
            c.lineTo((prev + p[0]) / 2, baseY - p[1] * 0.35);
            c.lineTo(p[0], baseY - p[1]);
        });
        c.lineTo(W + 40, baseY);
        c.lineTo(W + 40, H + 20);
        c.closePath();
        paint(fill, lw);
        peaks.forEach(function (p, k) {
            var prev = k ? peaks[k - 1][0] : -40;
            var ex = (prev + p[0]) / 2, ey = baseY - p[1] * 0.35;
            var q = 0.3;
            var lx = lerp(p[0], ex, q), ly = lerp(baseY - p[1], ey, q);
            var rx = p[0] + (p[0] - lx), ry = ly;
            poly([p[0], baseY - p[1], rx, ry, p[0] + (rx - p[0]) * 0.4, ry + 14, p[0], ry - 4, p[0] - (p[0] - lx) * 0.45, ry + 12, lx, ly]);
            paint(snow, lw * 0.8);
        });
    }
    function pine(x, y, h, fill) {
        poly([x, y - h, x + h * 0.32, y - h * 0.45, x + h * 0.18, y - h * 0.45, x + h * 0.4, y, x - h * 0.4, y, x - h * 0.18, y - h * 0.45, x - h * 0.32, y - h * 0.45]);
        paint(fill, LINE);
        poly([x, y - h, x + h * 0.16, y - h * 0.72, x, y - h * 0.66, x - h * 0.16, y - h * 0.72]);
        paint('#F2F6FB', LINE * 0.7);
    }
    var TWINKLES = [0.7, 1.9, 4.2, 5.5, 6.8];   // グロッケンが鳴る時刻（場面の中の秒）
    function sceneMountain(t) {
        var cam = t * 22;
        var i, x, y;
        c.fillStyle = '#1C2B4F';
        c.fillRect(0, 0, W, H);
        // 星（ゆっくり瞬く）。グロッケンが鳴る瞬間だけ1つずつ大きくきらめく
        for (i = 0; i < 70; i++) {
            x = wrapX(hash(i * 1.3) * (W + 500) - cam * 0.05);
            y = hash(i * 2.9) * 420;
            circle(x, y, 1.6 + hash(i * 5.1) * 1.6 * (0.8 + 0.2 * Math.sin(t * 2 + i)));
            c.fillStyle = '#F2EBC9';
            c.fill();
        }
        TWINKLES.forEach(function (tt, k) {
            var a = t - tt;
            if (a > 0 && a < 1.1) sparkle(220 + k * 280, 90 + (k % 2) * 120, 22 * Math.sin(a / 1.1 * Math.PI), a * 2, '#FFF6C8');
        });
        // オーロラ（半透明の帯がゆらぐ。線は引かない）
        [['rgba(95,224,176,0.20)', 170, 46], ['rgba(120,200,255,0.16)', 215, 36], ['rgba(170,120,255,0.12)', 250, 28]].forEach(function (a, k) {
            c.beginPath();
            for (x = -20; x <= W + 20; x += 20) c.lineTo(x, a[1] + Math.sin(x / 230 + t * 0.6 + k) * 34);
            for (x = W + 20; x >= -20; x -= 20) c.lineTo(x, a[1] + a[2] + Math.sin(x / 190 + t * 0.5 + k * 2) * 26 + Math.sin(x / 70 + t) * 8);
            c.closePath();
            c.fillStyle = a[0];
            c.fill();
        });
        // 月
        circle(1250, 175, 84);
        paint('#F6EFD2', LINE);
        [[1225, 150, 16], [1280, 200, 12], [1262, 138, 8]].forEach(function (k) { circle(k[0], k[1], k[2]); c.fillStyle = '#E6DCB5'; c.fill(); });
        // 山並み（奥 → 手前）
        c.save();
        c.translate(-cam * 0.15, 0);
        range(560, [[80, 230], [300, 330], [520, 250], [760, 380], [1000, 280], [1240, 350], [1480, 260], [1720, 320]], '#3C4F7A', '#DCE6F2', LINE * 0.7);
        c.restore();
        c.save();
        c.translate(-cam * 0.3, 0);
        range(610, [[160, 200], [420, 260], [700, 190], [980, 280], [1300, 210], [1600, 250]], '#2E3F66', '#E8EFF7', LINE * 0.8);
        c.restore();
        // 石造りの高架橋（アーチの穴は谷の暗い色）
        var deck = 594;
        c.save();
        c.translate(-cam * 0.6 % 220, 0);
        c.beginPath();
        c.rect(-240, deck, W + 480, H - deck + 20);
        paint('#6B6F86', LINE);
        for (x = -240; x < W + 240; x += 220) {
            c.beginPath();
            c.moveTo(x + 40, H + 20);
            c.lineTo(x + 40, 700);
            c.arc(x + 130, 700, 90, Math.PI, 0);
            c.lineTo(x + 220, H + 20);
            c.closePath();
            paint('#16213D', LINE);
        }
        c.beginPath();
        for (x = -240; x < W + 240; x += 44) { c.moveTo(x, deck + 12); c.lineTo(x + 22, deck + 12); }
        ink(LINE * 0.5);
        c.stroke();
        c.restore();
        c.beginPath();
        c.moveTo(-20, deck); c.lineTo(W + 20, deck);
        ink(LINE * 1.4);
        c.stroke();
        // 列車（右から左へ）と前照灯・煙
        var s = 0.62, tx = 1560 - t * 150;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = 'rgba(255,229,138,0.16)';
        poly([tx - 212 * s, deck - 118 * s, tx - 212 * s - 620, deck - 220, tx - 212 * s - 620, deck + 20]);
        c.fill();
        c.restore();
        var smoke = particles(t, -3, 99, 0.2, 2.6, function (born, age) {
            var bx = 1560 - born * 150 - 172 * s;
            return [bx + age * 60, deck - 150 * s - age * 70 + age * age * 6, 12 + age * 16];
        });
        puffs(smoke, '#E8EEF6');
        drawTrain(tx, deck, s, t, -1);
        // 雪
        c.fillStyle = '#F2F6FB';
        for (i = 0; i < 90; i++) {
            x = wrapX(hash(i * 3.7) * (W + 500) + Math.sin(t * 1.3 + i) * 18 - t * 26);
            y = (hash(i * 9.1) * (H + 40) + t * (40 + hash(i) * 50)) % (H + 40) - 20;
            circle(x, y, 1.8 + hash(i * 2.3) * 2.4);
            c.fill();
        }
        // 手前の雪をかぶった松
        c.save();
        c.translate(-cam * 1.2, 0);
        pine(40, H + 30, 320, '#16213D');
        pine(170, H + 50, 240, '#1A2748');
        pine(1520, H + 40, 300, '#16213D');
        pine(1660, H + 60, 260, '#1A2748');
        c.restore();
        caption(['三日後——', 'ヒマラン山脈を越える夜行列車。'], 56, 48, t, 0.6, 5.6);
        sfx('WHOOOO!', tx - 60, deck - 230, 76, t, 2.45, 1.5, '#E8EEF6', -0.08);
    }
    function mountainFocus(t) { var s = 0.62, tx = 1560 - t * 150; return [tx + 392 * s - 12, 594 - 87 * s]; }

    /* ========== 場面：深海（44–52s） ========== */
    function fish(x, y, s, dir, fill, t, ph) {
        c.save();
        c.translate(x, y);
        c.scale(s * dir, s);
        var wag = Math.sin(t * 12 + ph) * 0.3;
        poly([-18, 0, -34, -12 + wag * 10, -34, 12 + wag * 10]);
        paint(fill, LINE * 0.8);
        oval(0, 0, 22, 12);
        paint(fill, LINE * 0.8);
        circle(10, -3, 2.6);
        c.fillStyle = INK;
        c.fill();
        c.restore();
    }
    function kelp(x, base, h, t, ph) {
        var n = 12, L = [], R = [];
        for (var i = 0; i <= n; i++) {
            var p = i / n;
            var cx = x + Math.sin(t * 1.2 + ph + p * 3) * 22 * p;
            var w = 14 * (1 - p * 0.7);
            L.push(cx - w, base - h * p);
            R.unshift(cx + w, base - h * p);
        }
        poly(L.concat(R));
        paint('#3E8E5E', LINE * 0.9);
    }
    function deepDepth(t) { return easeInOut(seg(t, 0, 3.2)) * 900; }
    function subAt(t) {
        return { x: lerp(-260, 600, easeOutCubic(seg(t, 0.2, 3.6))) + Math.sin(t * 0.7) * 10, y: 380 + Math.sin(t * 1.1) * 10 };
    }
    var CHEST = [930, 0];
    function sceneDeep(t) {
        var d = deepDepth(t);
        var i, x, y;
        var cols = ['#7FD0E6', '#2A8CA8', '#1F6F8F', '#175872', '#10405A', '#0B2C40', '#081F2E'];
        for (i = 0; i < cols.length; i++) {
            c.fillStyle = cols[i];
            c.fillRect(0, i === 0 ? -10 : 110 + (i - 1) * 260 - d, W, H + 400);
        }
        // 水面（はじめだけ見える）
        terrain(function (xx) { return 110 - d + Math.sin(xx / 60 + t * 2) * 6; }, -20, W + 20, 140 - d, null, LINE * 0.8, 16);
        // 光の筋
        c.save();
        c.globalAlpha = 0.07 * (1 - seg(d, 500, 900) * 0.6);
        c.fillStyle = '#FFFFFF';
        for (i = 0; i < 6; i++) {
            x = 150 + i * 260 + Math.sin(t * 0.5 + i) * 40;
            poly([x, 100 - d, x + 70, 100 - d, x + 330, H, x + 170, H]);
            c.fill();
        }
        c.restore();
        // 海底：岩・海藻・沈没船・宝箱
        var bed = 1560 - d;
        CHEST[1] = bed - 28;
        terrain(function (xx) { return bed + Math.sin(xx / 170) * 14; }, -20, W + 20, H + 1000, '#2F4A5C', LINE, 16);
        c.save();
        c.translate(1270, bed - 20);
        c.rotate(-0.14);
        c.beginPath();
        c.moveTo(-230, -120);
        c.quadraticCurveTo(-200, 30, 0, 40);
        c.quadraticCurveTo(200, 30, 240, -130);
        c.lineTo(160, -110);
        c.lineTo(120, -150);
        c.lineTo(40, -115);
        c.lineTo(-60, -140);
        c.lineTo(-140, -108);
        c.closePath();
        paint('#5A3E2B', LINE);
        c.beginPath();
        for (i = 1; i < 4; i++) { c.moveTo(-220 + i * 10, -120 + i * 38); c.quadraticCurveTo(0, -80 + i * 40, 230 - i * 12, -128 + i * 38); }
        ink(LINE * 0.6);
        c.stroke();
        c.beginPath();
        c.moveTo(20, -120); c.lineTo(-120, -420);
        ink(LINE * 2.2);
        c.stroke();
        poly([-100, -380, 0, -330, -40, -250, -118, -300]);
        paint('#C9B79A', LINE * 0.8);
        c.restore();
        [[160, 60, 34], [300, 40, 24], [1500, 70, 36], [720, 36, 22]].forEach(function (r) {
            oval(r[0], bed - 6, r[1], r[2]);
            paint('#3A4A5A', LINE);
        });
        [[90, 300], [140, 360], [230, 260], [1560, 330], [1480, 280]].forEach(function (k, j) { kelp(k[0], bed + 10, k[1], t, j); });
        // 宝箱（50s＝場面の6秒でふたが開く）
        var open = easeOutBack(seg(t, 6.0, 6.35));
        c.save();
        c.translate(CHEST[0], CHEST[1]);
        rrect(-56, -10, 112, 58, 6);
        paint('#8A5A2B', LINE);
        [-34, 34].forEach(function (bx) { c.beginPath(); c.rect(bx - 6, -10, 12, 58); paint('#E8B530', LINE * 0.7); });
        if (open > 0) {
            oval(0, -10, 50, 12);
            paint('#FFE27A', LINE * 0.8);
        }
        c.save();
        c.translate(-56, -10);
        c.rotate(-open * 1.9);
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(0, -26);
        c.quadraticCurveTo(56, -54, 112, -26);
        c.lineTo(112, 0);
        c.closePath();
        paint('#9C6A35', LINE);
        c.restore();
        rrect(-9, -4, 18, 20, 3);
        paint('#E8B530', LINE * 0.7);
        c.restore();
        // 魚の群れ
        for (i = 0; i < 7; i++) {
            x = wrapX(t * 90 + i * 34 + hash(i) * 40, W + 600);
            fish(x, 260 + Math.sin(t * 1.5 + i * 0.8) * 26 + (i % 3) * 22 + (500 - d * 0.4), 0.9, 1, '#F4A259', t, i);
        }
        for (i = 0; i < 6; i++) {
            x = wrapX(1500 - t * 70 - i * 40, W + 600);
            fish(x, 620 + Math.sin(t * 1.2 + i) * 20 + (i % 2) * 26 + (300 - d * 0.35), 0.75, -1, '#F6D55C', t, i + 3);
        }
        // 潜水艇・探照灯・泡
        var sb = subAt(t);
        var lamp = [sb.x + 158 * 0.95, sb.y + 18 * 0.95];
        var beam = seg(t, 3.0, 3.3);
        if (beam > 0) {
            var aim = Math.atan2(CHEST[1] - lamp[1], CHEST[0] - lamp[0]) + Math.sin(t * 0.8) * 0.05 * (1 - seg(t, 5, 6));
            c.save();
            c.globalCompositeOperation = 'lighter';
            c.globalAlpha = 0.2 * beam;
            c.fillStyle = '#FFF3B0';
            c.translate(lamp[0], lamp[1]);
            c.rotate(aim);
            poly([0, -8, 900, -170, 900, 170, 0, 8]);
            c.fill();
            c.restore();
        }
        var bub = particles(t, 0, 99, 0.12, 2.2, function (born, age, k) {
            var p = subAt(born);
            return [p.x - 180 * 0.95 - age * 20 + Math.sin(age * 6 + k) * 8, p.y - age * 120, 3 + hash(k) * 5 + age * 2];
        });
        for (i = 0; i < bub.length; i += 3) {
            circle(bub[i], bub[i + 1], bub[i + 2]);
            paint('rgba(207,239,255,0.35)', LINE * 0.5);
        }
        drawSub(sb.x, sb.y, 0.95, t);
        // ソナー（45.2s / 48.2s）
        [1.2, 4.2].forEach(function (tp) {
            var a = t - tp;
            if (a > 0 && a < 1.6) {
                c.save();
                c.globalAlpha = 1 - a / 1.6;
                for (var k = 0; k < 3; k++) {
                    var r = a * 420 - k * 40;
                    if (r > 0) { circle(sb.x + 60, sb.y - 60, r); c.lineWidth = 2.5; c.strokeStyle = '#BFE3F2'; c.stroke(); }
                }
                c.restore();
            }
        });
        // 宝の光がひろがって、画面が紙の色になる（そのままフィナーレへ）
        if (t > 6.0) {
            var g = seg(t, 6.0, 7.0);
            c.save();
            c.globalCompositeOperation = 'lighter';
            [1, 0.66, 0.4].forEach(function (k) {
                circle(CHEST[0], CHEST[1] - 20, (120 + g * 380) * k);
                c.fillStyle = 'rgba(255,214,106,0.16)';
                c.fill();
            });
            c.restore();
            for (i = 0; i < 9; i++) {
                var a2 = t - 6.0 - i * 0.12;
                if (a2 > 0) sparkle(CHEST[0] + Math.sin(i * 2.4) * 120 * a2, CHEST[1] - 30 - a2 * 170, 18 * (1 - seg(a2, 0.8, 1.4)), a2 * 3, '#FFF6C8');
            }
            circle(CHEST[0], CHEST[1] - 20, easeInCubic(seg(t, 6.9, 8.0)) * 2100);
            c.fillStyle = PAPER;
            c.fill();
        }
        caption(['そして——', '深海アビス、水深一万メートル。'], 56, 48, t, 0.6, 5.3);
        sfx('PING!', sb.x + 60, sb.y - 170, 50, t, 4.2, 1.4, '#BFE3F2', -0.05);
        bubble('!!', sb.x + 170, sb.y - 150, sb.x + 90, sb.y - 50, t, 6.05, 7.3, 50);
    }

    /* ========== 場面：フィナーレ（52–62s） ==========
       ここまでの場面がコマになって漫画のページに並び、赤いリボンの上に「ATLAS COMIC」が叩きつけられる */
    var inPanel = false;   // コマの中ではナレーションの箱を出さない
    var PANELS = [
        [70, 60, 820, 370, function (a) { drawMap(1680, 960, 0.5, a, 3, false); }],
        [910, 60, 620, 370, function (a) { sceneSea(3.1 + a * 0.6); }],
        [70, 450, 470, 390, function (a) { sceneDesert(2.4 + a * 0.5); }],
        [560, 450, 480, 390, function (a) { sceneMountain(3.2 + a * 0.5); }],
        [1060, 450, 470, 390, function (a) { sceneDeep(Math.min(5.9, 4.4 + a * 0.3)); }]
    ];
    function ribbon(x, y, w, h) {
        [-1, 1].forEach(function (s) {
            var ex = x + s * w / 2;
            poly([ex - s * 20, y - h * 0.15, ex + s * 100, y - h * 0.15, ex + s * 62, y + h * 0.2 + 16, ex + s * 100, y + h * 0.62, ex - s * 20, y + h * 0.62]);
            paint('#A8141E', LINE * 1.2);
        });
        rrect(x - w / 2, y - h / 2, w, h, 6);
        paint(RED, LINE * 1.3);
        c.save();
        c.setLineDash([12, 9]);
        c.beginPath();
        c.moveTo(x - w / 2 + 18, y - h / 2 + 15); c.lineTo(x + w / 2 - 18, y - h / 2 + 15);
        c.moveTo(x - w / 2 + 18, y + h / 2 - 15); c.lineTo(x + w / 2 - 18, y + h / 2 - 15);
        c.strokeStyle = 'rgba(251,248,242,0.55)';
        c.lineWidth = 3;
        c.stroke();
        c.restore();
    }
    // 中央ぞろえの黄色い箱（1文字ずつ打ち出す）
    function centerBox(text, cx, cy, t, t0) {
        if (t < t0) return;
        var pin = easeOutBack(seg(t, t0, t0 + 0.35));
        c.save();
        c.font = '700 40px ' + FONT_JP;
        var w = c.measureText(text).width + 60, h = 78;
        c.translate(cx, cy);
        c.scale(pin, pin);
        c.rotate(-0.015);
        c.fillStyle = INK;
        c.fillRect(-w / 2 + 8, -h / 2 + 8, w, h);
        c.beginPath();
        c.rect(-w / 2, -h / 2, w, h);
        paint('#F9E27D', LINE);
        var n = Math.floor((t - t0 - 0.2) / 0.06);
        if (n > 0) {
            c.fillStyle = INK;
            c.textAlign = 'left';
            c.textBaseline = 'middle';
            c.fillText(text.slice(0, n), -w / 2 + 30, 2);
        }
        c.restore();
    }
    function sceneFinale(t) {
        c.fillStyle = PAPER;
        c.fillRect(0, 0, W, H);
        var zo = easeInOut(seg(t, 3.2, 4.2));
        c.save();
        c.translate(W / 2, H / 2);
        c.scale(lerp(1, 0.9, zo), lerp(1, 0.9, zo));
        c.rotate(-0.025 * zo);
        c.translate(-W / 2, -H / 2);
        PANELS.forEach(function (p, i) {
            var a = t - i * 0.5;
            if (a < 0) return;
            var e = easeOutBack(seg(a, 0, 0.45));
            var w = p[2], h = p[3];
            c.save();
            c.translate(p[0] + w / 2, p[1] + h / 2);
            var s = lerp(1.25, 1, e);
            c.scale(s, s);
            c.rotate((1 - e) * (i % 2 ? 0.08 : -0.08));
            c.globalAlpha = seg(a, 0, 0.15);
            c.fillStyle = INK;
            c.fillRect(-w / 2 + 10, -h / 2 + 10, w, h);
            c.save();
            c.beginPath();
            c.rect(-w / 2, -h / 2, w, h);
            c.clip();
            var k = Math.max(w / W, h / H);
            c.scale(k, k);
            c.translate(-W / 2, -H / 2);
            inPanel = true;
            p[4](a);
            inPanel = false;
            c.restore();
            c.beginPath();
            c.rect(-w / 2, -h / 2, w, h);
            ink(6);
            c.stroke();
            c.restore();
        });
        c.restore();
        // ロゴ（60s の最後の和音でもう一度はずむ）
        var pulse = t > 8 ? 1 + Math.exp(-(t - 8) * 5) * Math.cos((t - 8) * 18) * 0.07 : 1;
        if (t > 8) sunburst(800, 440, 1500 * easeOutBack(seg(t, 8, 8.5)), t * 0.2, 0.3);
        c.save();
        c.translate(800, 440);
        c.scale(pulse, pulse);
        c.translate(-800, -440);
        var ra = easeOutCubic(seg(t, 3.6, 4.1));
        if (ra > 0) ribbon(800, 440, 1260 * ra, 190);
        var word = 'ATLAS COMIC', size = 150;
        c.font = size + 'px ' + FONT_COMIC;
        var ws = [], total = 0, i;
        for (i = 0; i < word.length; i++) { ws.push(c.measureText(word[i]).width); total += ws[i]; }
        var x = 800 - total / 2, n = 0;
        for (i = 0; i < word.length; i++) {
            if (word[i] !== ' ') slamWord(word[i], x + ws[i] / 2, 440 + size * 0.36, size, CREAM, t, 4.0 + (n++) * 0.125, true);
            x += ws[i];
        }
        c.restore();
        centerBox('つぎの冒険は、ページの中に。', 800, 640, t, 5.4);
        if (t > 8) {
            for (i = 0; i < 10; i++) {
                var a2 = t - 8 - i * 0.05;
                var ang = i / 10 * TAU;
                if (a2 > 0) sparkle(800 + Math.cos(ang) * (420 + a2 * 260), 440 + Math.sin(ang) * (150 + a2 * 120), 22 * (1 - seg(a2, 0.6, 1.2)), a2 * 4, '#FFF6C8');
            }
        }
        c.fillStyle = 'rgba(16,11,6,' + easeInCubic(seg(t, 9.0, 10)) + ')';
        c.fillRect(0, 0, W, H);
    }

    /* ========== 進行表 ========== */
    function center() { return [W / 2, H / 2]; }
    var SCENES = [
        { a: 0, b: 6, draw: sceneTitle, open: 0.9, close: 0.6, focus: function () { return [800, 440]; } },
        { a: 6, b: 14, draw: sceneSea, open: 0.7, close: 0.7, focus: seaFocus },
        { a: 14, b: 18, draw: function (t) { sceneMapLeg(0, t); }, open: 0.6, close: 0.4, focus: center },
        { a: 18, b: 28, draw: sceneDesert, open: 0.7, close: 0.7, focus: desertFocus },
        { a: 28, b: 32, draw: function (t) { sceneMapLeg(1, t); }, open: 0.6, close: 0.4, focus: center },
        { a: 32, b: 40, draw: sceneMountain, open: 0.7, close: 0.7, focus: mountainFocus },
        { a: 40, b: 44, draw: function (t) { sceneMapLeg(2, t); }, open: 0.6, close: 0.4, focus: center },
        { a: 44, b: 52, draw: sceneDeep, open: 0.7, close: 0, focus: center },
        { a: 52, b: TOTAL, draw: sceneFinale, open: 0, close: 0, focus: center }
    ];
    // 時刻 t（秒）の1コマを描く。ctx は W×H の座標系に合わせてあること
    function renderAt(ctx, t) {
        c = ctx;
        if (!MAP) buildMap();
        var sc = SCENES[SCENES.length - 1];
        for (var i = 0; i < SCENES.length; i++) if (t < SCENES[i].b) { sc = SCENES[i]; break; }
        var lt = t - sc.a, dur = sc.b - sc.a;
        c.save();
        c.beginPath();
        c.rect(0, 0, W, H);
        c.clip();
        c.save();
        sc.draw(lt);
        c.restore();
        if (sc.open && lt < sc.open) iris(W / 2, H / 2, easeInCubic(seg(lt, 0, sc.open)) * 1900);
        if (sc.close && lt > dur - sc.close) {
            var f = sc.focus(lt);
            iris(f[0], f[1], (1 - easeOutCubic(seg(lt, dur - sc.close, dur))) * 1900);
        }
        paperGrain();
        c.restore();
    }

    /* ========== 再生 ========== */
    function play(opts) {
        opts = opts || {};
        if (!MAP) buildMap();
        if (!grain) grain = makeGrain();

        var root = document.createElement('div');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'THE ATLAS EXPEDITION');
        root.style.cssText = 'position:fixed;inset:0;z-index:10002;background:' + INK + ';opacity:0;transition:opacity .5s ease;touch-action:none;' +
            // クリックで画面の一部が青く選択されないように
            '-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;';
        var cv = document.createElement('canvas');
        cv.style.cssText = 'position:absolute;display:block;';
        root.appendChild(cv);
        var btnCss = 'position:absolute;bottom:max(16px, env(safe-area-inset-bottom));padding:8px 14px;border-radius:999px;' +
            'border:1px solid rgba(251,248,242,.35);background:rgba(16,11,6,.55);color:' + CREAM + ';' +
            "font:700 12px/1 'Montserrat',sans-serif;letter-spacing:.12em;cursor:pointer;opacity:.75;";
        var skip = document.createElement('button');
        skip.type = 'button';
        skip.textContent = 'SKIP ▶▶';
        skip.style.cssText = btnCss + 'right:16px;';
        var snd = document.createElement('button');
        snd.type = 'button';
        snd.style.cssText = btnCss + 'left:16px;';
        root.appendChild(skip);
        root.appendChild(snd);
        document.body.appendChild(root);
        requestAnimationFrame(function () { root.style.opacity = '1'; });

        var ctx = cv.getContext('2d');
        var k = 1;
        function resize() {
            var vw = window.innerWidth, vh = window.innerHeight;
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            var s = Math.min(vw / W, vh / H);
            var cw = W * s, ch = H * s;
            cv.style.width = cw + 'px';
            cv.style.height = ch + 'px';
            cv.style.left = (vw - cw) / 2 + 'px';
            cv.style.top = (vh - ch) / 2 + 'px';
            cv.width = Math.round(cw * dpr);
            cv.height = Math.round(ch * dpr);
            k = cv.width / W;
        }
        resize();
        window.addEventListener('resize', resize);

        var ac = opts.audioContext || null, score = null, startAt = 0, perf0 = 0;
        var done = false, raf = 0, timer = 0;
        function clock() { return score ? ac.currentTime - startAt : (performance.now() - perf0) / 1000; }
        function frame() {
            if (done) return;
            var t = clock();
            if (score) score.pump(t);
            if (t >= TOTAL) { finish(); return; }
            ctx.setTransform(k, 0, 0, k, 0, 0);
            renderAt(ctx, Math.max(0, t));
            raf = requestAnimationFrame(frame);
        }
        function finish() {
            if (done) return;
            done = true;
            cancelAnimationFrame(raf);
            clearInterval(timer);
            window.removeEventListener('resize', resize);
            window.removeEventListener('keydown', onKey);
            if (score) score.fadeOut(0.45);
            root.style.opacity = '0';
            setTimeout(function () {
                root.remove();
                if (ac && ac.close) ac.close().catch(function () {});
                if (opts.onEnd) opts.onEnd();
            }, 520);
        }
        function onKey(e) { if (e.key === 'Escape') finish(); }
        skip.addEventListener('click', finish);
        window.addEventListener('keydown', onKey);
        function label() { snd.textContent = score && score.isMuted() ? '♪ SOUND OFF' : '♪ SOUND ON'; }
        snd.addEventListener('click', function () {
            if (!score) return;
            score.setMuted(!score.isMuted());
            label();
        });

        // フォントの読み込みを待ってから始める（最大1.5秒）
        var fonts = document.fonts ? Promise.all([
            document.fonts.load('40px "Luckiest Guy"'),
            document.fonts.load('700 30px "Noto Sans JP"', 'アトラス探検記')
        ]).catch(function () {}) : Promise.resolve();
        var wait = new Promise(function (r) { setTimeout(r, 1500); });
        Promise.race([fonts, wait]).then(function () {
            var resume = ac && ac.state !== 'running' && ac.resume ? ac.resume().catch(function () {}) : Promise.resolve();
            return Promise.race([resume, new Promise(function (r) { setTimeout(r, 400); })]);
        }).then(function () {
            if (done) return;
            if (ac && ac.state === 'running') {
                try {
                    score = Score(ac);
                    startAt = ac.currentTime + 0.12;
                    score.start(startAt);
                } catch (e) { score = null; }
            }
            if (!score) snd.style.display = 'none';
            label();
            perf0 = performance.now();
            timer = setInterval(function () { if (score && !done) score.pump(clock()); }, 200);
            frame();
        });
        return { stop: finish };
    }

    // renderAt / _Score は動作確認用（コマ単位の描画と、音のオフライン合成）
    window.AtlasAdventure = { play: play, renderAt: renderAt, W: W, H: H, TOTAL: TOTAL, _Score: Score };
})();
