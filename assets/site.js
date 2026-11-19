/* LANOVA Sports — marketing site behaviour. */
(function () {
  // Address of the private club workspace (app server). The buttons switch from "Request access" to
  // "Sign in / Subscribe" only when that server answers /healthz with billing configured; otherwise (not deployed yet,
  // down, or unreachable) the pages keep the e-mail "Request access" path.
  var APP = (window.LANOVA_APP_URL !== undefined ? window.LANOVA_APP_URL : 'https://lake-intelligence-production.up.railway.app').replace(/\/$/, '');

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

  // Sign-in / subscribe links follow the app server once it is confirmed live.
  function useApp(on, health) {
    var loginReady = !!(health && health.ok);
    document.querySelectorAll('[data-app-path]').forEach(function (el) {
      if (on || loginReady) {
        var route = el.getAttribute('data-app-path');
        var path = route.split(/[?#]/, 1)[0].replace(/\/+$/, '');
        if (path === '/signup' && (!health || health.signup !== true)) { route = route.replace(/^\/signup\/*/, '/login'); el.textContent = 'Sign in / Subscribe'; }
        el.setAttribute('href', APP + route);
        if (on) el.removeAttribute('hidden');
      }
    });
    document.querySelectorAll('[data-app-ready]').forEach(function (el) { el.hidden = !(el.getAttribute('data-app-auth') !== null ? loginReady : on); });
    document.querySelectorAll('[data-app-pending]').forEach(function (el) { el.hidden = !!(el.getAttribute('data-app-auth') !== null ? loginReady : on); });
    // Self-service sign-up is offered only when the server reports it open and live billing ready.
    var signupOpen = !!(on && health && health.signup === true);
    document.querySelectorAll('[data-app-signup]').forEach(function (el) { el.hidden = !signupOpen; });
    document.querySelectorAll('[data-app-private]').forEach(function (el) { el.hidden = signupOpen; });
  }
  useApp(false);
  if (APP && window.fetch && document.querySelector('[data-app-path],[data-app-ready]')) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 4000);
    fetch(APP + '/healthz', {mode: 'cors', credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined})
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (h) { clearTimeout(timer); useApp(!!(h && h.ok && (h.billing === 'live' || (window.LANOVA_ALLOW_TEST_BILLING === true && h.billing === 'test'))), h); }) // not 'off', 'unverified' or 'misconfigured'
      .catch(function () { clearTimeout(timer); });
  }

  // Conversion measurement — PREPARED, OFF. Aggregated, cookieless counters (visit, demo, clicks on offers): no cookie,
  // no local storage, no identifier; the server keeps daily totals only and stores no IP address or user agent. Turn on
  // only after the privacy notice (legal.html#privacy) has been updated and the founder has validated it: set
  // METRICS_ENABLED to true here AND METRICS_ENABLED=true on the app server.
  var METRICS_ENABLED = false;
  function track(event) {
    if (!METRICS_ENABLED || !APP || !navigator.sendBeacon) return;
    var q = new URLSearchParams(location.search || ''), ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) { ref = ''; }
    var body = {event: event, page: here || '/', ref: ref === location.hostname ? '' : ref,
      utm_source: (q.get('utm_source') || '').slice(0, 40), utm_medium: (q.get('utm_medium') || '').slice(0, 40), utm_campaign: (q.get('utm_campaign') || '').slice(0, 40)};
    try { navigator.sendBeacon(APP + '/api/beacon', new Blob([JSON.stringify(body)], {type: 'text/plain'})); } catch (e) { /* measurement must never break the page */ }
  }
  track('page_view');
  if (METRICS_ENABLED && document.addEventListener) document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-track]') : null;
    if (el) track('cta:' + el.getAttribute('data-track'));
  });

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

