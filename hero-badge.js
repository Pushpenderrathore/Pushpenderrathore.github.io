/* Hero ID badge: tilts toward the pointer. Pure CSS transforms, no WebGL.
   The CSS idle sway runs until the pointer is over the hero, then this takes
   over; it hands back to the sway when the pointer leaves. */
(function () {
    var badge = document.getElementById('id-badge');
    if (!badge) return;
    var card = badge.querySelector('.id-card');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var MAX = 12;   // degrees of tilt at the edge of the card

    function clamp(v) { return Math.max(-1, Math.min(1, v)); }

    function onMove(e) {
        if (reduce) return;
        var r = card.getBoundingClientRect();
        var nx = clamp(((e.clientX - r.left) / r.width) * 2 - 1);
        var ny = clamp(((e.clientY - r.top) / r.height) * 2 - 1);
        badge.classList.add('is-tilting');
        badge.style.setProperty('--ry', (nx * MAX).toFixed(2) + 'deg');
        badge.style.setProperty('--rx', (-ny * MAX).toFixed(2) + 'deg');
        card.querySelector('.id-glare').style.setProperty('--gx', ((nx + 1) * 50) + '%');
        card.querySelector('.id-glare').style.setProperty('--gy', ((ny + 1) * 50) + '%');
    }

    function onLeave() {
        badge.classList.remove('is-tilting');
        badge.style.removeProperty('--rx');
        badge.style.removeProperty('--ry');
    }

    var zone = document.querySelector('.home-image');
    if (!zone) return;
    zone.addEventListener('pointermove', onMove, { passive: true });
    zone.addEventListener('pointerleave', onLeave);
})();
