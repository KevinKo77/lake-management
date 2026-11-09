/* LANOVA Sports — marketing site behaviour. */
(function () {
  // Address of the private club workspace (app server). Empty until the server is deployed:
  // pages then show "request access" instead of a sign-in button.
  window.LANOVA_APP_URL = window.LANOVA_APP_URL || '';

  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  var here = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  document.querySelectorAll('.nav a').forEach(function (a) {
    var target = new URL(a.getAttribute('href'), location.href).pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    if (target === here) a.setAttribute('aria-current', 'page');
  });

  // Sign-in / subscribe links follow LANOVA_APP_URL when it is configured.
  var app = window.LANOVA_APP_URL;
  document.querySelectorAll('[data-app-path]').forEach(function (el) {
    if (app) { el.setAttribute('href', app.replace(/\/$/, '') + el.getAttribute('data-app-path')); el.removeAttribute('hidden'); }
  });
  document.querySelectorAll('[data-app-ready]').forEach(function (el) { el.hidden = !app; });
  document.querySelectorAll('[data-app-pending]').forEach(function (el) { el.hidden = !!app; });

  // Demo request form: composes an email (no data is sent to any server).
  var form = document.getElementById('demo-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = new FormData(form);
      var subject = 'LANOVA Sports demo request — ' + (f.get('club') || '');
      var body = 'Name: ' + f.get('name') + '\nRole: ' + f.get('role') + '\nClub / organisation: ' + f.get('club') + '\nCountry: ' + f.get('country') + '\nEmail: ' + f.get('email') + '\n\nWhat would you like to see?\n' + (f.get('message') || '');
      location.href = 'mailto:kevin@lake-am.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    });
  }

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, {threshold: 0.12, rootMargin: '0px 0px -40px 0px'});
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }
})();
