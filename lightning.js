(function () {
    var canvas = document.getElementById('lightningCanvas');
    var toggle = document.getElementById('lightningToggle');
    if (!canvas || !toggle) return;
    var ctx = canvas.getContext('2d');

    var enabled = localStorage.getItem('lightning') === 'on';
    var animId = null;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // UI状態を反映
    function updateUI() {
        if (enabled) {
            toggle.classList.add('active');
            canvas.style.display = '';
        } else {
            toggle.classList.remove('active');
            canvas.style.display = 'none';
        }
    }
    updateUI();

    // トグルボタン（OFF→ON: 2秒以内に3回タップ、ON→OFF: 1回タップ）
    var tapTimes = [];

    function turnOn() {
        enabled = true;
        localStorage.setItem('lightning', 'on');
        updateUI();
        activeBolts = [];
        lastSpawn = 0;
        animId = requestAnimationFrame(animate);
    }

    function turnOff() {
        enabled = false;
        localStorage.setItem('lightning', 'off');
        updateUI();
        if (animId) cancelAnimationFrame(animId);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    toggle.addEventListener('click', function () {
        if (enabled) {
            // ONのときは1回で即OFF
            turnOff();
            tapTimes = [];
        } else {
            // OFFのときは2秒以内に3回タップでON
            var now = Date.now();
            tapTimes.push(now);
            // 2秒より古いタップを除去
            tapTimes = tapTimes.filter(function (t) { return now - t < 2000; });
            if (tapTimes.length >= 3) {
                turnOn();
                tapTimes = [];
            }
        }
    });

    // 雷の枝を生成
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

    // 雷を描画
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

    var activeBolts = [];

    function spawnBolt() {
        var x = Math.random() * canvas.width;
        var bolt = {
            segments: createBolt(x, -10, 0, canvas.height * 0.8, 0),
            life: 1.0,
            decay: 0.02 + Math.random() * 0.03,
            flicker: Math.random() < 0.5,
            lineWidth: 1.5 + Math.random() * 1.5,
        };
        activeBolts.push(bolt);
    }

    var lastSpawn = 0;
    var nextInterval = 800 + Math.random() * 2000;

    function animate(time) {
        if (!enabled) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (time - lastSpawn > nextInterval) {
            spawnBolt();
            lastSpawn = time;
            nextInterval = 800 + Math.random() * 2000;
        }

        for (var i = activeBolts.length - 1; i >= 0; i--) {
            var bolt = activeBolts[i];
            var alpha = bolt.life;

            if (bolt.flicker && bolt.life > 0.5) {
                alpha *= (Math.random() > 0.3) ? 1 : 0.2;
            }

            drawBolt(bolt.segments, alpha, bolt.lineWidth);
            bolt.life -= bolt.decay;

            if (bolt.life <= 0) {
                activeBolts.splice(i, 1);
            }
        }

        animId = requestAnimationFrame(animate);
    }

    // デフォルトOFFなので、ONの場合のみ開始
    if (enabled) {
        animId = requestAnimationFrame(animate);
    }
})();
