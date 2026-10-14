// Open the <details> that matches the URL hash so TOC links expand their task.
// Also wires up the Expand all / Collapse all toolbar.
(function () {
  function openTarget() {
    var hash = location.hash && location.hash.slice(1);
    if (!hash) return;
    var el = document.getElementById(hash);
    if (el && el.tagName === 'DETAILS') {
      el.open = true;
      setTimeout(function () {
        el.scrollIntoView({ block: 'start', behavior: 'instant' });
      }, 0);
    }
  }

  function setAll(open) {
    document.querySelectorAll('details.task').forEach(function (d) {
      d.open = open;
    });
  }

  function wireToolbar() {
    var expand = document.getElementById('wu-expand-all');
    var collapse = document.getElementById('wu-collapse-all');
    if (expand) expand.addEventListener('click', function () { setAll(true); });
    if (collapse) collapse.addEventListener('click', function () { setAll(false); });
  }

  function init() {
    openTarget();
    wireToolbar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('hashchange', openTarget);
})();
