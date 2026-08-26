/* Hero lanyard - a 3D ID badge on a strap, with hand-rolled Verlet physics.
 *
 * three.js renders, meshline draws the strap, and the physics is solved here.
 * There is no physics engine: Rapier's compat build inlines its WASM as base64
 * and cost 758KB on the wire, which was most of this hero's weight and hit
 * Safari hardest. The rig below reproduces its behaviour in about 80 lines.
 *
 * The rig, matching the well known react-three-fiber lanyard: a pinned anchor,
 * a rope of point masses, then the card carried by four points - three corners
 * (top-left, top-right, bottom-centre) forming a rigid triangle, plus a fourth
 * held off the card plane. The triangle alone fixes orientation only up to a
 * reflection, so without that fourth point the card can invert through itself
 * and pop inside out. With it the card genuinely twists in 3D rather than
 * merely swinging.
 *
 * The card face is drawn to an offscreen 2D canvas and used as a texture, so
 * the badge is generated from images/img.jpg rather than a downloaded model.
 *
 * The preloader is dismissed by an inline script in index.html, never from
 * here, so a failed module load cannot trap the page behind the overlay.
 *
 * The three.js imports are DYNAMIC and deliberately so. A static `import` in a
 * module script blocks DOMContentLoaded until every dependency has downloaded
 * and evaluated, and script.js does all of its work inside a DOMContentLoaded
 * handler - so static imports left the typewriter, nav, mobile menu and
 * counters dead until the 3D stack arrived. Loading them on `load` instead
 * keeps the page interactive throughout.
 */

const canvas = document.getElementById('lanyard-canvas');
const fallback = document.querySelector('.lanyard-fallback');

/* Any failure at all - no WebGL, CDN blocked, WASM refused - drops back to
   the plain photo rather than leaving an empty hole in the hero. */
function giveUp(err) {
    console.warn('[lanyard] falling back to static photo:', err);
    if (canvas) canvas.style.display = 'none';
    if (fallback) fallback.hidden = false;
}

/* ---- card dimensions, in world units and in texture pixels ---- */
const CARD_W = 1.6, CARD_H = 2.25, CARD_D = 0.02;
const TEX_W = 512, TEX_H = 720;

/* ---- the card face, drawn once to an offscreen canvas ---- */
function drawCardFace(photo) {
    const c = document.createElement('canvas');
    c.width = TEX_W;
    c.height = TEX_H;
    const x = c.getContext('2d');
    const S = TEX_W / 188;          // the artwork was authored at 188 units wide

    const bg = x.createLinearGradient(0, 0, TEX_W, TEX_H);
    bg.addColorStop(0, '#f7f8fa');
    bg.addColorStop(1, '#dfe3e8');
    x.fillStyle = bg;
    x.fillRect(0, 0, TEX_W, TEX_H);

    // punch hole
    x.fillStyle = '#0b0f14';
    x.beginPath();
    x.ellipse(TEX_W / 2, 15 * S, 13 * S, 5 * S, 0, 0, Math.PI * 2);
    x.fill();

    // photo well
    const px = 12 * S, py = 28 * S, pw = TEX_W - 24 * S, ph = TEX_H - 96 * S;
    x.save();
    roundRect(x, px, py, pw, ph, 7 * S);
    x.clip();
    if (photo) {
        const s = Math.max(pw / photo.width, ph / photo.height);
        const dw = photo.width * s, dh = photo.height * s;
        if (x.filter !== undefined) x.filter = 'grayscale(1) contrast(1.08)';
        x.drawImage(photo, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
        if (x.filter !== undefined) x.filter = 'none';
    } else {
        const pg = x.createLinearGradient(px, py, px, py + ph);
        pg.addColorStop(0, '#3a4048');
        pg.addColorStop(1, '#14181d');
        x.fillStyle = pg;
        x.fillRect(px, py, pw, ph);
    }
    x.restore();
    x.strokeStyle = 'rgba(0,0,0,.14)';
    x.lineWidth = 1 * S;
    roundRect(x, px, py, pw, ph, 7 * S);
    x.stroke();

    // identity block
    x.textAlign = 'left';
    x.fillStyle = '#0b0f14';
    x.font = '700 ' + (13 * S) + 'px Inter,sans-serif';
    x.fillText('PUSHPENDER S. RATHORE', 13 * S, TEX_H - 48 * S);
    x.fillStyle = '#5b6675';
    x.font = '500 ' + (9.5 * S) + "px 'JetBrains Mono',monospace";
    x.fillText('SECURITY RESEARCHER', 13 * S, TEX_H - 33 * S);
    x.fillStyle = '#8b97a6';
    x.font = '500 ' + (8 * S) + "px 'JetBrains Mono',monospace";
    x.fillText('GSoC 2026 · METASPLOIT', 13 * S, TEX_H - 20 * S);

    // accent rule
    const ag = x.createLinearGradient(13 * S, 0, TEX_W - 13 * S, 0);
    ag.addColorStop(0, '#9fef00');
    ag.addColorStop(1, '#00d4ff');
    x.fillStyle = ag;
    x.fillRect(13 * S, TEX_H - 13 * S, TEX_W - 26 * S, 2.5 * S);

    return c;
}

/* ---- the strap texture: a repeating printed wordmark ----
   meshline maps uv.x ALONG the line and uv.y ACROSS its width, so this has to
   be drawn lengthwise: 512 along the strap, 64 across it. Drawn the other way
   round the wordmark ends up squashed and the edge stitching bands the strap. */
function drawBandTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 64;
    const x = c.getContext('2d');

    // Kept well above the near-black hero background, or the strap reads as a
    // thin dark line and the printed wordmark is invisible.
    const g = x.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#1b222a');
    g.addColorStop(0.5, '#4b5762');
    g.addColorStop(1, '#1b222a');
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 64);

    // stitched edges, running the length of the strap
    x.strokeStyle = 'rgba(159,239,0,.55)';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(0, 7); x.lineTo(512, 7);
    x.moveTo(0, 57); x.lineTo(512, 57);
    x.stroke();

    x.fillStyle = 'rgba(240,246,252,.92)';
    x.font = "700 20px 'JetBrains Mono',monospace";
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('PUSHPENDER · GSoC 2026', 128, 34);
    x.fillText('PUSHPENDER · GSoC 2026', 384, 34);

    return c;
}

function roundRect(x, rx, ry, w, h, r) {
    x.beginPath();
    x.moveTo(rx + r, ry);
    x.arcTo(rx + w, ry, rx + w, ry + h, r);
    x.arcTo(rx + w, ry + h, rx, ry + h, r);
    x.arcTo(rx, ry + h, rx, ry, r);
    x.arcTo(rx, ry, rx + w, ry, r);
    x.closePath();
}

/* A rounded slab for the card. ExtrudeGeometry hands back UVs in shape space,
   so they are remapped to 0..1 for the face texture. */
function makeCardGeometry(THREE) {
    const r = 0.08, w = CARD_W, h = CARD_H;
    const s = new THREE.Shape();
    const x0 = -w / 2, y0 = -h / 2;
    s.moveTo(x0 + r, y0);
    s.lineTo(x0 + w - r, y0);
    s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    s.lineTo(x0 + w, y0 + h - r);
    s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    s.lineTo(x0 + r, y0 + h);
    s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);

    const geo = new THREE.ExtrudeGeometry(s, {
        depth: CARD_D,
        bevelEnabled: true,
        bevelThickness: 0.006,
        bevelSize: 0.006,
        bevelSegments: 2,
        curveSegments: 12,
    });
    geo.center();

    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
    }
    uv.needsUpdate = true;
    return geo;
}

async function loadPhoto(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);   // card still renders, just without the photo
        img.src = src;
    });
}

/* ================================================================
   Verlet solver
   ================================================================ */
const GRAV = 40;          // world units per second squared, matching the old engine
const DAMP = 0.985;       // velocity retained per step
const ITER = 32;          // constraint relaxation passes per step

function makeSolver() {
    const points = [];
    const links = [];

    function pt(x, y, z, pinned) {
        const p = { x, y, z, px: x, py: y, pz: z, pinned: !!pinned };
        points.push(p);
        return p;
    }

    // rest length is measured from wherever the points currently are
    function link(a, b) {
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        links.push({ a, b, d });
    }

    let held = null;

    function integrate(dt) {
        const g = GRAV * dt * dt;
        for (const p of points) {
            if (p.pinned || p === held) continue;
            const vx = (p.x - p.px) * DAMP;
            const vy = (p.y - p.py) * DAMP;
            const vz = (p.z - p.pz) * DAMP;
            p.px = p.x; p.py = p.y; p.pz = p.z;
            p.x += vx; p.y += vy - g; p.z += vz;
        }
    }

    function solve() {
        for (let k = 0; k < ITER; k++) {
            for (const c of links) {
                const a = c.a, b = c.b;
                const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
                const d = Math.hypot(dx, dy, dz) || 1e-6;
                const f = ((d - c.d) / d) * 0.5;
                const ox = dx * f, oy = dy * f, oz = dz * f;
                const aFixed = a.pinned || a === held;
                const bFixed = b.pinned || b === held;
                if (aFixed && bFixed) continue;
                // when one end is immovable the other takes the whole correction
                if (!aFixed) {
                    const s = bFixed ? 2 : 1;
                    a.x += ox * s; a.y += oy * s; a.z += oz * s;
                }
                if (!bFixed) {
                    const s = aFixed ? 2 : 1;
                    b.x -= ox * s; b.y -= oy * s; b.z -= oz * s;
                }
            }
        }
    }

    // Shortest rest-length path from the pinned anchor to `target`, over the
    // link graph. This is how far the grabbed point can travel before the strap
    // would have to stretch, so the drag can be clamped to it (see step()).
    // The graph is tiny, so a plain relaxation to a fixed point is plenty.
    function reach(target) {
        const anchor = points.find((p) => p.pinned);
        if (!anchor) return Infinity;
        const dist = new Map(points.map((p) => [p, Infinity]));
        dist.set(anchor, 0);
        for (let k = 0; k < points.length; k++) {
            let changed = false;
            for (const c of links) {
                const da = dist.get(c.a), db = dist.get(c.b);
                if (da + c.d < db - 1e-9) { dist.set(c.b, da + c.d); changed = true; }
                if (db + c.d < da - 1e-9) { dist.set(c.a, db + c.d); changed = true; }
            }
            if (!changed) break;
        }
        return dist.get(target);
    }

    return {
        pt, link, integrate, solve, reach,
        hold: (p) => { held = p; },
        get held() { return held; },
    };
}

async function main() {
    if (!canvas) return;

    // Fetched in parallel, and only now - see the note at the top of the file.
    const [THREE, meshline, roomEnv] = await Promise.all([
        import('three'),
        import('meshline'),
        import('three/addons/environments/RoomEnvironment.js'),
    ]);
    const { MeshLineGeometry, MeshLineMaterial } = meshline;
    const { RoomEnvironment } = roomEnv;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const photo = await loadPhoto('images/img.jpg');

    /* ---- renderer / scene / camera ---- */
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    // Framing is driven from here: at fov 25 the visible height is
    // 2*z*tan(12.5deg), so z 9.2 shows ~4.1 units and the 2.25-tall card fills
    // over half of it.
    const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 100);
    camera.position.set(0, 0.15, 9.2);
    camera.lookAt(0, 0.15, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-3, 4, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fef00, 1.1);
    rim.position.set(4, 1, 3);
    scene.add(rim);
    const cyan = new THREE.DirectionalLight(0x00d4ff, 0.9);
    cyan.position.set(-4, -1, 2);
    scene.add(cyan);

    /* ---- the rig ----
       Laid out at rest so every link's rest length is simply its initial
       length. Anchor at y=4, a 3-unit rope, then the card hanging below. */
    const S = makeSolver();
    const ANCHOR_Y = 4, ROPE_LEN = 3, ROPE_SEGS = 12;
    const CLIP_GAP = 0.32;                     // clip to the card's top edge

    const rope = [];
    for (let i = 0; i <= ROPE_SEGS; i++) {
        rope.push(S.pt(0, ANCHOR_Y - (ROPE_LEN * i) / ROPE_SEGS, 0, i === 0));
    }
    for (let i = 0; i < rope.length - 1; i++) S.link(rope[i], rope[i + 1]);

    const clip = rope[rope.length - 1];
    const cy = clip.y - CLIP_GAP - CARD_H / 2;  // card centre at rest
    const TL = S.pt(-CARD_W / 2, cy + CARD_H / 2, 0);
    const TR = S.pt(CARD_W / 2, cy + CARD_H / 2, 0);
    const BC = S.pt(0, cy - CARD_H / 2, 0);
    // held off the card plane purely to lock chirality, never drawn
    const NZ = S.pt(0, cy, 0.5);

    S.link(clip, TL); S.link(clip, TR);         // strap splits to both corners
    S.link(TL, TR); S.link(TL, BC); S.link(TR, BC);   // rigid triangle
    S.link(NZ, TL); S.link(NZ, TR); S.link(NZ, BC);   // stops it inverting

    /* ---- card mesh ---- */
    const faceTex = new THREE.CanvasTexture(drawCardFace(photo));
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const faceMat = new THREE.MeshPhysicalMaterial({
        map: faceTex, roughness: 0.28, metalness: 0.05,
        clearcoat: 0.85, clearcoatRoughness: 0.2,
    });
    const edgeMat = new THREE.MeshPhysicalMaterial({
        color: 0xcdd4db, roughness: 0.45, metalness: 0.1, clearcoat: 0.5,
    });
    const cardMesh = new THREE.Mesh(makeCardGeometry(THREE), [faceMat, edgeMat]);
    scene.add(cardMesh);

    const metal = new THREE.MeshStandardMaterial({
        color: 0xb9c1c9, roughness: 0.25, metalness: 1,
    });
    const clipGroup = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.032, 12, 28), metal);
    bar.position.y = CARD_H / 2 + 0.1;
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), metal);
    clamp.position.y = CARD_H / 2 + 0.015;
    clipGroup.add(bar, clamp);
    cardMesh.add(clipGroup);

    /* ---- strap ---- */
    const bandTex = new THREE.CanvasTexture(drawBandTexture());
    bandTex.colorSpace = THREE.SRGBColorSpace;
    bandTex.wrapS = bandTex.wrapT = THREE.RepeatWrapping;

    const bandGeo = new MeshLineGeometry();
    const bandMat = new MeshLineMaterial({
        map: bandTex, useMap: 1, color: new THREE.Color(0xffffff),
        transparent: true, depthTest: false,
        // With sizeAttenuation on (the default) meshline offsets the strap edge
        // in clip space, so lineWidth is NOT in world units. Tuned by eye
        // against the 1.6-wide card at camera z 9.2.
        lineWidth: 1.5,
        repeat: new THREE.Vector2(-2, 1),
        resolution: new THREE.Vector2(1, 1),
    });
    // meshline defines property setters for every uniform except opacity, so
    // the constructor value lands on the base Material and never reaches the
    // shader. Set the uniform directly.
    bandMat.uniforms.opacity.value = 0.95;

    const bandMesh = new THREE.Mesh(bandGeo, bandMat);
    bandMesh.renderOrder = -1;
    scene.add(bandMesh);

    const curve = new THREE.CatmullRomCurve3(rope.map(() => new THREE.Vector3()));
    curve.curveType = 'chordal';

    /* ---- pointer drag ---- */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const vec = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const target = new THREE.Vector3();
    const ringWorld = new THREE.Vector3();
    let dragging = false;
    let heldReach = Infinity;   // how far the grabbed point may leave the anchor

    function setPointer(e) {
        const r = canvas.getBoundingClientRect();
        pointer.set(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            -((e.clientY - r.top) / r.height) * 2 + 1
        );
    }

    // where the pointer ray meets the plane the card floats on
    function pointerWorld(out) {
        vec.set(pointer.x, pointer.y, 0.5).unproject(camera);
        dir.copy(vec).sub(camera.position).normalize();
        return out.copy(vec.add(dir.multiplyScalar(camera.position.length())));
    }

    canvas.addEventListener('pointerdown', (e) => {
        setPointer(e);
        raycaster.setFromCamera(pointer, camera);
        if (!raycaster.intersectObject(cardMesh, false).length) return;  // else let the page scroll

        pointerWorld(target);
        // grab whichever corner is nearest the pointer
        let best = TL, bd = Infinity;
        for (const p of [TL, TR, BC]) {
            const d = Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z);
            if (d < bd) { bd = d; best = p; }
        }
        S.hold(best);
        // Cap the drag just short of full extension, so the strap can never be
        // pulled past its own length and rubber-band (0.98 keeps it off the
        // singular, dead-straight pose).
        heldReach = S.reach(best) * 0.98;
        dragging = true;
        canvas.classList.add('is-grabbing');
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    canvas.addEventListener('pointermove', (e) => {
        setPointer(e);
        if (dragging) e.preventDefault();
    });

    function release(e) {
        if (!dragging) return;
        dragging = false;
        S.hold(null);
        canvas.classList.remove('is-grabbing');
        if (e && e.pointerId !== undefined && canvas.hasPointerCapture(e.pointerId)) {
            canvas.releasePointerCapture(e.pointerId);
        }
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    /* ---- resize ---- */
    function resize() {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        renderer.setSize(r.width, r.height, false);
        camera.aspect = r.width / r.height;
        camera.updateProjectionMatrix();
        bandMat.uniforms.resolution.value.set(r.width, r.height);
    }
    new ResizeObserver(resize).observe(canvas);
    resize();

    /* ---- rig -> mesh ---- */
    const ex = new THREE.Vector3(), ey = new THREE.Vector3(), ez = new THREE.Vector3();
    const mid = new THREE.Vector3(), basis = new THREE.Matrix4();

    function syncVisuals() {
        // card frame from the three corners: +X along the top edge, +Y up the
        // card, +Z their cross product
        ex.set(TR.x - TL.x, TR.y - TL.y, TR.z - TL.z).normalize();
        mid.set((TL.x + TR.x) / 2, (TL.y + TR.y) / 2, (TL.z + TR.z) / 2);
        ey.set(mid.x - BC.x, mid.y - BC.y, mid.z - BC.z);
        ey.addScaledVector(ex, -ey.dot(ex)).normalize();   // orthogonalise
        ez.crossVectors(ex, ey);

        basis.makeBasis(ex, ey, ez);
        cardMesh.quaternion.setFromRotationMatrix(basis);
        cardMesh.position.set(
            (mid.x + BC.x) / 2, (mid.y + BC.y) / 2, (mid.z + BC.z) / 2
        );

        for (let i = 0; i < rope.length; i++) {
            curve.points[i].set(rope[i].x, rope[i].y, rope[i].z);
        }
        // Thread the strap down through the ring to the clamp, rather than
        // ending it at the ring centre, so the band always meets the badge
        // instead of separating from it when the card swings. Ending it at the
        // clamp (not the ring) also tucks the cut end under the metal: the band
        // draws behind the clip (renderOrder -1, depthTest off), so the ring and
        // clamp cover the join at every angle instead of exposing it mid-drag.
        // The card transform is set just above; refresh its world matrix before
        // reading the clamp off it.
        cardMesh.updateMatrixWorld(true);
        clamp.getWorldPosition(ringWorld);
        curve.points[curve.points.length - 1].copy(ringWorld);
        bandGeo.setPoints(curve.getPoints(32));
    }

    // Walk the strap from the pinned anchor and pull in any segment that has
    // been stretched past its rest length. Real webbing does not stretch, so
    // this keeps the strap a fixed length under a hard drag instead of letting
    // it rubber-band. The anchor is fixed and the clip is never the held point,
    // so a single top-down pass is stable.
    const SEG_REST = ROPE_LEN / ROPE_SEGS;
    function constrainStrap() {
        for (let i = 1; i < rope.length; i++) {
            const a = rope[i - 1], b = rope[i];
            if (b.pinned || b === S.held) continue;
            const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
            const d = Math.hypot(dx, dy, dz);
            if (d > SEG_REST) {
                const s = (d - SEG_REST) / d;
                b.x -= dx * s; b.y -= dy * s; b.z -= dz * s;
            }
        }
    }

    function step(dt) {
        if (dragging) {
            const h = S.held;
            if (h) {
                pointerWorld(target);
                // Keep the grabbed point within the strap's reach of the anchor,
                // so the rope is always satisfiable and cannot balloon.
                const a = rope[0];
                const dx = target.x - a.x, dy = target.y - a.y, dz = target.z - a.z;
                const d = Math.hypot(dx, dy, dz);
                if (d > heldReach) {
                    const s = heldReach / d;
                    target.set(a.x + dx * s, a.y + dy * s, a.z + dz * s);
                }
                // leave the previous position alone so releasing throws the card
                h.px = h.x; h.py = h.y; h.pz = h.z;
                h.x = target.x; h.y = target.y; h.z = target.z;
            }
        }
        S.integrate(dt);
        S.solve();
        constrainStrap();
        syncVisuals();
    }

    /* ---- loop ---- */
    const STEP = 1 / 60;
    if (reduce) {
        for (let i = 0; i < 300; i++) step(STEP);   // settle, then hold still
        renderer.render(scene, camera);
        return;
    }

    let last = 0, acc = 0;
    function frame(now) {
        requestAnimationFrame(frame);
        if (!last) last = now;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        acc += dt;
        let guard = 0;
        while (acc >= STEP && guard++ < 5) { step(STEP); acc -= STEP; }
        renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
}

/* Held until `load` so the 3D stack never competes with the page's own CSS,
   fonts and script.js. If load already fired, start straight away. */
if (document.readyState === 'complete') {
    main().catch(giveUp);
} else {
    window.addEventListener('load', () => { main().catch(giveUp); }, { once: true });
}
