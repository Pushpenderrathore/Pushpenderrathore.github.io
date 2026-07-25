/* Hero lanyard - a 3D ID badge on a strap, with real rigid-body physics.
 *
 * three.js for rendering, Rapier for the physics, meshline for the strap.
 * The rig matches the well known react-three-fiber lanyard: a fixed anchor,
 * three rope-jointed segments, then a spherical joint into the card, so the
 * card swings and twists rather than merely rotating in plane.
 *
 * The card face is drawn to an offscreen 2D canvas and used as a texture, so
 * the badge is generated from images/img.jpg rather than a downloaded model.
 *
 * The preloader is dismissed by an inline script in index.html, never from
 * here, so a failed module load cannot trap the page behind the overlay.
 */

import * as THREE from 'three';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as RAPIER from '@dimforge/rapier3d-compat';

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

/* ---- the strap texture: a repeating printed wordmark ---- */
function drawBandTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const x = c.getContext('2d');

    // Kept well above the near-black hero background, or the strap reads as a
    // thin dark line and the printed wordmark is invisible.
    const g = x.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, '#20272f');
    g.addColorStop(0.5, '#49555f');
    g.addColorStop(1, '#20272f');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 256);

    x.strokeStyle = 'rgba(159,239,0,.65)';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(6, 0); x.lineTo(6, 256);
    x.moveTo(58, 0); x.lineTo(58, 256);
    x.stroke();

    x.save();
    x.translate(32, 128);
    x.rotate(-Math.PI / 2);
    x.fillStyle = 'rgba(240,246,252,.92)';
    x.font = "600 15px 'JetBrains Mono',monospace";
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('PUSHPENDER  ·  GSoC 2026', 0, 0);
    x.restore();

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
function makeCardGeometry() {
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

async function main() {
    if (!canvas) return;

    await RAPIER.init();

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const photo = await loadPhoto('images/img.jpg');

    /* ---- renderer / scene / camera ---- */
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    // Close enough that the badge reads as the subject of the column. Framing
    // is driven from here: at fov 25 the visible height is 2*z*tan(12.5deg),
    // so z 9.2 shows ~4.1 units and the 2.25-tall card fills over half of it.
    const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 100);
    camera.position.set(0, 0.15, 9.2);
    camera.lookAt(0, 0.15, 0);

    // image-based lighting, so the card and clip actually have reflections
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

    /* ---- physics rig ---- */
    const world = new RAPIER.World({ x: 0, y: -40, z: 0 });
    world.timestep = 1 / 60;

    const ANCHOR_Y = 4;
    function body(x, y, z, fixed) {
        const desc = fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic();
        desc.setTranslation(x, y, z).setLinearDamping(4).setAngularDamping(4).setCanSleep(true);
        return world.createRigidBody(desc);
    }

    const fixed = body(0, ANCHOR_Y, 0, true);
    const j1 = body(0.5, ANCHOR_Y, 0);
    const j2 = body(1.0, ANCHOR_Y, 0);
    const j3 = body(1.5, ANCHOR_Y, 0);
    const card = body(2.0, ANCHOR_Y, 0);

    [j1, j2, j3].forEach((b) => world.createCollider(RAPIER.ColliderDesc.ball(0.1), b));
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(CARD_W / 2, CARD_H / 2, 0.01), card
    );

    const O = { x: 0, y: 0, z: 0 };
    world.createImpulseJoint(RAPIER.JointData.rope(1, O, O), fixed, j1, true);
    world.createImpulseJoint(RAPIER.JointData.rope(1, O, O), j1, j2, true);
    world.createImpulseJoint(RAPIER.JointData.rope(1, O, O), j2, j3, true);
    world.createImpulseJoint(
        RAPIER.JointData.spherical(O, { x: 0, y: CARD_H / 2 + 0.32, z: 0 }), j3, card, true
    );

    /* ---- card mesh ---- */
    const faceTex = new THREE.CanvasTexture(drawCardFace(photo));
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const faceMat = new THREE.MeshPhysicalMaterial({
        map: faceTex,
        roughness: 0.28,
        metalness: 0.05,
        clearcoat: 0.85,
        clearcoatRoughness: 0.2,
    });
    const edgeMat = new THREE.MeshPhysicalMaterial({
        color: 0xcdd4db, roughness: 0.45, metalness: 0.1, clearcoat: 0.5,
    });

    const cardMesh = new THREE.Mesh(makeCardGeometry(), [faceMat, edgeMat]);
    scene.add(cardMesh);

    // metal clip, parented to the card so it rides along
    const metal = new THREE.MeshStandardMaterial({
        color: 0xb9c1c9, roughness: 0.25, metalness: 1,
    });
    const clip = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.032, 12, 28), metal);
    bar.position.y = CARD_H / 2 + 0.1;
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), metal);
    clamp.position.y = CARD_H / 2 + 0.015;
    clip.add(bar, clamp);
    cardMesh.add(clip);

    /* ---- strap ---- */
    const bandTex = new THREE.CanvasTexture(drawBandTexture());
    bandTex.colorSpace = THREE.SRGBColorSpace;
    bandTex.wrapS = bandTex.wrapT = THREE.RepeatWrapping;

    const bandGeo = new MeshLineGeometry();
    const bandMat = new MeshLineMaterial({
        map: bandTex,
        useMap: 1,
        color: new THREE.Color(0xffffff),
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        lineWidth: 0.42,
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

    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    ]);
    curve.curveType = 'chordal';

    /* ---- pointer drag ---- */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const vec = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const euler = new THREE.Euler();
    const quat = new THREE.Quaternion();
    let dragOffset = null;

    function setPointer(e, rect) {
        pointer.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
    }

    // where the pointer ray meets the plane the card is floating on
    function pointerWorld() {
        vec.set(pointer.x, pointer.y, 0.5).unproject(camera);
        dir.copy(vec).sub(camera.position).normalize();
        return vec.add(dir.multiplyScalar(camera.position.length()));
    }

    canvas.addEventListener('pointerdown', (e) => {
        const rect = canvas.getBoundingClientRect();
        setPointer(e, rect);
        raycaster.setFromCamera(pointer, camera);
        if (!raycaster.intersectObject(cardMesh, false).length) return;  // else let the page scroll

        const t = card.translation();
        dragOffset = pointerWorld().clone().sub(new THREE.Vector3(t.x, t.y, t.z));
        card.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        canvas.classList.add('is-grabbing');
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        setPointer(e, rect);
        if (dragOffset) e.preventDefault();
    });

    function release(e) {
        if (!dragOffset) return;
        dragOffset = null;
        card.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
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

    /* ---- per-frame sync ---- */
    // j1/j2 are lerped toward their true positions so the strap reads as cloth
    // rather than a stiff chain of segments.
    const lerped = new Map([[j1, new THREE.Vector3()], [j2, new THREE.Vector3()]]);
    lerped.forEach((v, b) => {
        const t = b.translation();
        v.set(t.x, t.y, t.z);
    });

    const MIN_SPEED = 10, MAX_SPEED = 50;

    function syncVisuals(delta) {
        const ct = card.translation(), cr = card.rotation();
        cardMesh.position.set(ct.x, ct.y, ct.z);
        cardMesh.quaternion.set(cr.x, cr.y, cr.z, cr.w);

        lerped.forEach((v, b) => {
            const t = b.translation();
            vec.set(t.x, t.y, t.z);
            const d = Math.max(0.1, Math.min(1, v.distanceTo(vec)));
            v.lerp(vec, Math.min(1, delta * (MIN_SPEED + d * (MAX_SPEED - MIN_SPEED))));
        });

        const t3 = j3.translation(), tf = fixed.translation();
        curve.points[0].set(t3.x, t3.y, t3.z);
        curve.points[1].copy(lerped.get(j2));
        curve.points[2].copy(lerped.get(j1));
        curve.points[3].set(tf.x, tf.y, tf.z);
        bandGeo.setPoints(curve.getPoints(32));

        // bleed off spin around Y so the card settles facing forward
        const av = card.angvel();
        quat.set(cr.x, cr.y, cr.z, cr.w);
        euler.setFromQuaternion(quat, 'YXZ');
        card.setAngvel({ x: av.x, y: av.y - euler.y * 0.25, z: av.z }, true);
    }

    function step(delta) {
        if (dragOffset) {
            const p = pointerWorld();
            [card, j1, j2, j3].forEach((b) => b.wakeUp());
            card.setNextKinematicTranslation({
                x: p.x - dragOffset.x,
                y: p.y - dragOffset.y,
                z: p.z - dragOffset.z,
            });
        }
        world.step();
        syncVisuals(delta);
    }

    /* ---- loop ---- */
    if (reduce) {
        for (let i = 0; i < 300; i++) step(1 / 60);   // settle, then hold still
        renderer.render(scene, camera);
        return;
    }

    let last = 0, acc = 0;
    const STEP = 1 / 60;
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

main().catch(giveUp);
