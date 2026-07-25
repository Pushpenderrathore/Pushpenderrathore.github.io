/* Hero lanyard — a Verlet-rope ID badge that hangs, swings and rotates.
   No dependencies. The preloader is dismissed by an inline script in index.html
   so that a failed load of this file can never trap the page behind the overlay. */
(function () {
    'use strict';

    var canvas = document.getElementById('lanyard-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var CARD_W = 188, CARD_H = 262, CLIP_H = 20;
    var GRAV = 1500, DAMP = 0.982, ITER = 20;

    var W = 0, H = 0, dpr = 1;
    var P = [], C = [], rope = [], TL, TR, BC, anchor;

    function pt(x, y, pinned) {
        var p = { x: x, y: y, px: x, py: y, pinned: !!pinned };
        P.push(p);
        return p;
    }

    function con(a, b, stiff) {
        C.push({ a: a, b: b, d: Math.hypot(a.x - b.x, a.y - b.y), s: stiff === undefined ? 1 : stiff });
    }

    function build() {
        P = []; C = []; rope = [];
        var ax = W * 0.52, ropeLen = Math.min(H * 0.36, 230), N = 14;
        anchor = pt(ax, -10, true);
        rope.push(anchor);
        for (var i = 1; i <= N; i++) rope.push(pt(ax, -10 + ropeLen * i / N));
        for (var j = 0; j < rope.length - 1; j++) con(rope[j], rope[j + 1]);

        var clip = rope[rope.length - 1], top = clip.y + CLIP_H;
        TL = pt(ax - CARD_W / 2, top);
        TR = pt(ax + CARD_W / 2, top);
        BC = pt(ax, top + CARD_H);
        con(clip, TL); con(clip, TR);        // clip splits to both corners
        con(TL, TR);                         // rigid top edge
        con(TL, BC); con(TR, BC);            // rigid triangle, so the card really rotates
    }

    function resize() {
        var r = canvas.getBoundingClientRect();
        if (!r.width) return;
        W = r.width; H = r.height;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        build();
    }

    /* ---- physics ---- */
    function integrate(dt) {
        for (var i = 0; i < P.length; i++) {
            var p = P[i];
            if (p.pinned || p === grabbed) continue;
            var vx = (p.x - p.px) * DAMP, vy = (p.y - p.py) * DAMP;
            p.px = p.x; p.py = p.y;
            p.x += vx; p.y += vy + GRAV * dt * dt;
        }
    }

    function solve() {
        for (var k = 0; k < ITER; k++) {
            for (var i = 0; i < C.length; i++) {
                var c = C[i], a = c.a, b = c.b;
                var dx = b.x - a.x, dy = b.y - a.y;
                var d = Math.hypot(dx, dy) || 1e-6;
                var f = ((d - c.d) / d) * 0.5 * c.s;
                var ox = dx * f, oy = dy * f;
                var aFixed = a.pinned || a === grabbed, bFixed = b.pinned || b === grabbed;
                if (!aFixed) { a.x += ox * (bFixed ? 2 : 1); a.y += oy * (bFixed ? 2 : 1); }
                if (!bFixed) { b.x -= ox * (aFixed ? 2 : 1); b.y -= oy * (aFixed ? 2 : 1); }
            }
        }
    }

    /* ---- card geometry ---- */
    function cardAxes() {
        var ex = TR.x - TL.x, ey = TR.y - TL.y;
        var len = Math.hypot(ex, ey) || 1;
        ex /= len; ey /= len;
        var nx = -ey, ny = ex;                                  // perpendicular
        if ((BC.x - TL.x) * nx + (BC.y - TL.y) * ny < 0) { nx = -nx; ny = -ny; }
        return { ex: ex, ey: ey, nx: nx, ny: ny, ang: Math.atan2(ey, ex) };
    }

    /* ---- pointer / drag ---- */
    var grabbed = null, target = { x: 0, y: 0 };

    function local(e) {
        var r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function insideCard(m) {
        var a = cardAxes();
        var dx = m.x - TL.x, dy = m.y - TL.y;
        var u = dx * a.ex + dy * a.ey;          // along the top edge
        var v = dx * a.nx + dy * a.ny;          // down the card
        return u >= -12 && u <= CARD_W + 12 && v >= -CLIP_H && v <= CARD_H + 12;
    }

    canvas.addEventListener('pointerdown', function (e) {
        var m = local(e);
        if (!insideCard(m)) return;             // anywhere else, let the page scroll
        var best = null, bd = Infinity;
        [TL, TR, BC].forEach(function (p) {
            var d = Math.hypot(p.x - m.x, p.y - m.y);
            if (d < bd) { bd = d; best = p; }
        });
        grabbed = best;
        target = m;
        canvas.classList.add('is-grabbing');
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    canvas.addEventListener('pointermove', function (e) {
        if (!grabbed) return;
        target = local(e);
        e.preventDefault();
    });

    function release(e) {
        if (!grabbed) return;
        grabbed = null;
        canvas.classList.remove('is-grabbing');
        if (e && e.pointerId !== undefined && canvas.hasPointerCapture(e.pointerId)) {
            canvas.releasePointerCapture(e.pointerId);
        }
    }

    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    /* ---- photo ---- */
    var photo = new Image();
    var photoReady = false;
    photo.onload = function () { photoReady = true; };
    photo.src = 'images/img.jpg';

    /* ---- render ---- */
    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function drawStrap() {
        var pts = rope;
        ctx.lineJoin = ctx.lineCap = 'round';

        ctx.strokeStyle = '#15191f'; ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 15;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(159,239,0,.16)'; ctx.lineWidth = 2;
        ctx.stroke();

        // printed wordmark, sampled along the tangent at three points
        ctx.save();
        ctx.fillStyle = 'rgba(230,237,243,.30)';
        ctx.font = '600 8px ' + "'JetBrains Mono',monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        [3, 7, 11].forEach(function (i) {
            var a = pts[i], b = pts[i + 1];
            if (!b) return;
            var ang = Math.atan2(b.y - a.y, b.x - a.x);
            ctx.save();
            ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
            ctx.rotate(ang - Math.PI / 2);
            ctx.fillText('PUSHPENDER', 0, 0);
            ctx.restore();
        });
        ctx.restore();
    }

    function drawClip() {
        var clip = rope[rope.length - 1];
        var a = cardAxes();
        ctx.save();
        ctx.translate(clip.x, clip.y);
        ctx.rotate(a.ang);
        var g = ctx.createLinearGradient(-9, 0, 9, 0);
        g.addColorStop(0, '#6d7681');
        g.addColorStop(.45, '#d5dce3');
        g.addColorStop(.55, '#aab3bd');
        g.addColorStop(1, '#5c646e');
        ctx.fillStyle = g;
        roundRect(-9, -3, 18, CLIP_H + 8, 4); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        roundRect(-4, 4, 8, 9, 3); ctx.fill();
        ctx.restore();
    }

    function drawCard() {
        var a = cardAxes();
        ctx.save();
        ctx.translate(TL.x, TL.y);
        ctx.rotate(a.ang);

        ctx.shadowColor = 'rgba(0,0,0,.6)';
        ctx.shadowBlur = 34;
        ctx.shadowOffsetY = 16;
        var bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
        bg.addColorStop(0, '#f7f8fa');
        bg.addColorStop(1, '#dfe3e8');
        ctx.fillStyle = bg;
        roundRect(0, 0, CARD_W, CARD_H, 12); ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

        // punch hole
        ctx.fillStyle = '#0b0f14';
        ctx.beginPath();
        ctx.ellipse(CARD_W / 2, 15, 13, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // photo well
        var px = 12, py = 28, pw = CARD_W - 24, ph = CARD_H - 96;
        ctx.save();
        roundRect(px, py, pw, ph, 7);
        ctx.clip();
        if (photoReady) {
            var s = Math.max(pw / photo.width, ph / photo.height);
            var dw = photo.width * s, dh = photo.height * s;
            if (ctx.filter !== undefined) ctx.filter = 'grayscale(1) contrast(1.08)';
            ctx.drawImage(photo, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
            if (ctx.filter !== undefined) ctx.filter = 'none';
        } else {
            var pg = ctx.createLinearGradient(px, py, px, py + ph);
            pg.addColorStop(0, '#3a4048');
            pg.addColorStop(1, '#14181d');
            ctx.fillStyle = pg;
            ctx.fillRect(px, py, pw, ph);
            ctx.fillStyle = 'rgba(255,255,255,.16)';
            ctx.beginPath();
            ctx.arc(px + pw / 2, py + ph * .38, pw * .19, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(px + pw / 2, py + ph * 1.02, pw * .34, ph * .34, 0, Math.PI, 0);
            ctx.fill();
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(0,0,0,.14)';
        ctx.lineWidth = 1;
        roundRect(px, py, pw, ph, 7);
        ctx.stroke();

        // identity block
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0b0f14';
        ctx.font = '700 13px Inter,sans-serif';
        ctx.fillText('PUSHPENDER S. RATHORE', 13, CARD_H - 48);
        ctx.fillStyle = '#5b6675';
        ctx.font = '500 9.5px ' + "'JetBrains Mono',monospace";
        ctx.fillText('SECURITY RESEARCHER', 13, CARD_H - 33);
        ctx.fillStyle = '#8b97a6';
        ctx.font = '500 8px ' + "'JetBrains Mono',monospace";
        ctx.fillText('GSoC 2026 · METASPLOIT', 13, CARD_H - 20);

        // accent rule
        var ag = ctx.createLinearGradient(13, 0, CARD_W - 13, 0);
        ag.addColorStop(0, '#9fef00');
        ag.addColorStop(1, '#00d4ff');
        ctx.fillStyle = ag;
        ctx.fillRect(13, CARD_H - 13, CARD_W - 26, 2.5);

        ctx.restore();
    }

    function render() {
        ctx.clearRect(0, 0, W, H);
        drawStrap();
        drawCard();
        drawClip();
    }

    /* ---- loop ---- */
    var acc = 0, last = 0, STEP = 1 / 60;

    function frame(now) {
        if (!last) last = now;
        var dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        if (grabbed) {
            grabbed.px = grabbed.x; grabbed.py = grabbed.y;
            grabbed.x = target.x; grabbed.y = target.y;
        }
        acc += dt;
        var guard = 0;
        while (acc >= STEP && guard++ < 5) { integrate(STEP); solve(); acc -= STEP; }
        render();
        requestAnimationFrame(frame);
    }

    var ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    if (reduce) {
        for (var i = 0; i < 260; i++) { integrate(STEP); solve(); }   // settle, then hold
        render();
    } else {
        requestAnimationFrame(frame);
    }
})();
