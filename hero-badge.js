/* Hero ID badge: tilts toward the pointer, or with the device when it has
   motion sensors (phones, tablets). Pure CSS transforms, no WebGL.
   Laptops and MacBooks do not expose a motion sensor to web pages, so there
   the pointer tilt is the only input. */
(function () {
    var badge = document.getElementById('id-badge');
    if (!badge) return;
    var card = badge.querySelector('.id-card');
    var glare = badge.querySelector('.id-glare');
    var btn = document.getElementById('id-motion-btn');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var MAX = 14;            // degrees of tilt at full lean
    var sensing = false;     // true once real sensor readings arrive
    var baseBeta = null;     // how the device was held at the start = neutral

    function clamp(v) { return Math.max(-1, Math.min(1, v)); }

    function setTilt(nx, ny) {
        badge.classList.add('is-tilting');
        badge.style.setProperty('--ry', (nx * MAX).toFixed(2) + 'deg');
        badge.style.setProperty('--rx', (-ny * MAX).toFixed(2) + 'deg');
        glare.style.setProperty('--gx', ((nx + 1) * 50) + '%');
        glare.style.setProperty('--gy', ((ny + 1) * 50) + '%');
    }

    function rest() {
        badge.classList.remove('is-tilting');
        badge.style.removeProperty('--rx');
        badge.style.removeProperty('--ry');
    }

    /* ---- pointer (mouse / trackpad / pen) ---- */
    var zone = document.querySelector('.home-image');
    if (zone && !reduce) {
        zone.addEventListener('pointermove', function (e) {
            if (sensing || e.pointerType === 'touch') return;
            var r = card.getBoundingClientRect();
            setTilt(clamp(((e.clientX - r.left) / r.width) * 2 - 1),
                    clamp(((e.clientY - r.top) / r.height) * 2 - 1));
        }, { passive: true });
        zone.addEventListener('pointerleave', function () { if (!sensing) rest(); });
    }

    /* ---- device motion ---- */
    function onOrientation(e) {
        // desktop browsers fire one event with all-null readings: ignore it
        if (e.gamma === null || e.beta === null || reduce) return;
        if (baseBeta === null) baseBeta = e.beta;
        sensing = true;
        // gamma: left/right lean (-90..90); beta: front/back lean (-180..180)
        var nx = clamp(e.gamma / 30);
        var ny = clamp((e.beta - baseBeta) / 30);
        setTilt(nx, ny);
        if (btn) btn.hidden = true;
    }

    function listen() {
        window.addEventListener('deviceorientation', onOrientation, true);
    }

    if (typeof window.DeviceOrientationEvent === 'undefined') return;

    // Listening is harmless without permission (no events arrive), so always
    // attach. iOS additionally needs a tap before it will send any readings.
    listen();
    var needsPermission = typeof window.DeviceOrientationEvent.requestPermission === 'function';
    if (needsPermission && btn && !reduce && window.matchMedia('(pointer: coarse)').matches) {
        btn.hidden = false;
        btn.addEventListener('click', function () {
            window.DeviceOrientationEvent.requestPermission().then(function (s) {
                if (s === 'granted') { btn.hidden = true; }
                else { btn.textContent = 'Motion access was declined'; }
            }).catch(function () { btn.hidden = true; });
        });
    }

    // re-centre the neutral pose when the page comes back into view
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) baseBeta = null;
    });
})();
