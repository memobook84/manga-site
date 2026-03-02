(function () {
    // sessionStorageで同一セッション内1回のみ
    if (sessionStorage.getItem('splashShown')) {
        var el = document.getElementById('splashOverlay');
        if (el) el.remove();
        return;
    }
    sessionStorage.setItem('splashShown', '1');

    var overlay = document.getElementById('splashOverlay');
    var canvas = document.getElementById('splashCanvas');
    if (!overlay || !canvas) return;

    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // ページスクロール禁止
    document.body.style.overflow = 'hidden';

    // --- 雷描画ロジック（lightning.jsから抽出） ---
    function createBolt(x, y, angle, length, depth) {
        var segments = [];
        var curX = x;
        var curY = y;
        var segLen = length / (12 + Math.random() * 8);

        for (var i = 0; i < 20 && curY < canvas.height; i++) {
            var nextX = curX + Math.sin(angle) * segLen + (Math.random() - 0.5) * 30;
            var nextY = curY + Math.cos(angle) * segLen + Math.random() * segLen * 0.5;
            segments.push({ x1: curX, y1: curY, x2: nextX, y2: nextY });

            if (depth < 2 && Math.random() < 0.3) {
                var branchAngle = angle + (Math.random() - 0.5) * 1.2;
                var branchLen = length * (0.3 + Math.random() * 0.2);
                var branch = createBolt(curX, curY, branchAngle, branchLen, depth + 1);
                segments = segments.concat(branch);
            }

            curX = nextX;
            curY = nextY;
        }
        return segments;
    }

    function drawBolt(segments, alpha, lineWidth) {
        ctx.save();
        ctx.strokeStyle = 'rgba(216, 5, 46, ' + (alpha * 0.3) + ')';
        ctx.lineWidth = lineWidth + 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(216, 5, 46, ' + (alpha * 0.5) + ')';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        for (var i = 0; i < segments.length; i++) {
            ctx.moveTo(segments[i].x1, segments[i].y1);
            ctx.lineTo(segments[i].x2, segments[i].y2);
        }
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = 'rgba(216, 5, 46, ' + alpha + ')';
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(255, 80, 80, ' + alpha + ')';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        for (var j = 0; j < segments.length; j++) {
            ctx.moveTo(segments[j].x1, segments[j].y1);
            ctx.lineTo(segments[j].x2, segments[j].y2);
        }
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 200, 200, ' + (alpha * 0.7) + ')';
        ctx.lineWidth = Math.max(1, lineWidth - 1);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (var k = 0; k < segments.length; k++) {
            ctx.moveTo(segments[k].x1, segments[k].y1);
            ctx.lineTo(segments[k].x2, segments[k].y2);
        }
        ctx.stroke();
        ctx.restore();
    }

    // --- 雷連射アニメーション ---
    var bolts = [];
    var boltCount = 0;
    var maxBolts = 4;
    var spawnDelay = 80;
    var startTime = performance.now();

    function spawnSplashBolt() {
        var x = canvas.width * 0.2 + Math.random() * canvas.width * 0.6;
        bolts.push({
            segments: createBolt(x, -10, 0, canvas.height * 0.8, 0),
            life: 1.0,
            decay: 0.015 + Math.random() * 0.01,
            lineWidth: 2 + Math.random() * 1.5
        });
        boltCount++;
    }

    var lastSpawnTime = 0;

    function animateBolts(time) {
        var elapsed = time - startTime;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 雷を連射（200ms〜600ms の間）
        if (elapsed > 200 && boltCount < maxBolts && time - lastSpawnTime > spawnDelay) {
            spawnSplashBolt();
            lastSpawnTime = time;
        }

        // 雷描画・更新
        for (var i = bolts.length - 1; i >= 0; i--) {
            var bolt = bolts[i];
            var alpha = bolt.life;
            // フリッカー
            if (bolt.life > 0.5) {
                alpha *= (Math.random() > 0.3) ? 1 : 0.3;
            }
            drawBolt(bolt.segments, alpha, bolt.lineWidth);
            bolt.life -= bolt.decay;
            if (bolt.life <= 0) {
                bolts.splice(i, 1);
            }
        }

        // 800ms: ロゴフェードイン
        if (elapsed >= 800) {
            overlay.classList.add('splash-logo-visible');
        }

        // 1200ms: テキストフェードイン
        if (elapsed >= 1200) {
            overlay.classList.add('splash-text-visible');
        }

        // 2500ms: フェードアウト開始
        if (elapsed >= 2500) {
            overlay.classList.add('splash-fadeout');
        }

        // 3000ms: 完了、DOM削除
        if (elapsed >= 3200) {
            overlay.remove();
            document.body.style.overflow = '';
            return;
        }

        requestAnimationFrame(animateBolts);
    }

    requestAnimationFrame(animateBolts);
})();
