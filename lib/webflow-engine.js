/**
 * Webflow IX2 & Interaction Engine
 * Location: lib/webflow-engine.js
 */

class WebflowEngine {
  static getClientHydrationScript() {
    return `
<script>
/** 🪞 Carbon-Copy Telemetry Neutralizer & Router Hook **/
(function() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function() { window.dataLayer.push(arguments); };
  window.fbq = window.fbq || function() {};
  window.hj = window.hj || function() {};
  window.grecaptcha = {
    ready: function(cb) { if (cb) setTimeout(cb, 10); },
    execute: function() { return Promise.resolve('mock-token'); },
    render: function() { return 'mock-id'; },
    reset: function() {},
    getResponse: function() { return 'mock-token'; }
  };
  window.Sentry = { init: function() {}, captureException: function() {}, captureMessage: function() {} };

  var _fetch = window.fetch;
  window.fetch = function(url, opts) {
    if (typeof url === 'string') {
      if (url.startsWith('/api/')) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, status: 200, message: "Local Mirror Mock" }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        }));
      }
      if (url.startsWith('/') && !url.startsWith('/mirror/')) {
        var m = window.location.pathname.match(/\\/mirror\\/[^\\/]+/);
        if (m) url = m[0] + url;
      }
    }
    return _fetch ? _fetch.call(this, url, opts) : Promise.resolve(new Response(''));
  };

  function wakeUpPage() {
    document.documentElement.classList.remove('lenis-stopped');
    document.body.style.overflow = '';

    // Auto-dismiss stuck preloaders
    var preloaders = document.querySelectorAll('.preloader, .loader, [class*="preloader" i], [class*="loader-wrapper" i]');
    preloaders.forEach(function(el) {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      setTimeout(function() { el.style.display = 'none'; }, 400);
    });

    // Reboot Webflow IX2 interactions if present
    if (window.Webflow && window.Webflow.require) {
      try {
        var ix2 = window.Webflow.require('ix2');
        if (ix2 && ix2.init) ix2.init();
      } catch(e) {}
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    wakeUpPage();
    setTimeout(wakeUpPage, 300);
    setTimeout(wakeUpPage, 1000);

    // Smooth Anchor Scrolling
    document.querySelectorAll('a[href*="#"]').forEach(function(a) {
      a.addEventListener('click', function(e) {
        var href = a.getAttribute('href') || '';
        var hashIdx = href.indexOf('#');
        if (hashIdx !== -1) {
          var hash = href.slice(hashIdx + 1);
          var target = document.getElementById(hash) || document.querySelector('[data-anchor="' + hash + '"]');
          if (target) {
            e.preventDefault();
            document.body.classList.remove('-isMenuOpen', '-hideLogo');
            var menu = document.querySelector('.o-menu, [data-module-menu]');
            if (menu) { menu.setAttribute('aria-hidden', 'true'); menu.style.display = 'none'; }
            target.scrollIntoView({ behavior: 'smooth' });
            if (history.pushState) history.pushState(null, null, '#' + hash);
          }
        }
      });
    });

    // Interactive Mobile Menu Toggles
    document.querySelectorAll('.o-header_menuButton, [data-action*="Menu"], [aria-label="Menu"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        var isOpen = document.body.classList.contains('-isMenuOpen');
        var menu = document.querySelector('.o-menu, [data-module-menu]');
        if (!isOpen) {
          document.body.classList.add('-isMenuOpen', '-hideLogo');
          if (menu) { menu.setAttribute('aria-hidden', 'false'); menu.style.display = 'flex'; }
        } else {
          document.body.classList.remove('-isMenuOpen', '-hideLogo');
          if (menu) { menu.setAttribute('aria-hidden', 'true'); menu.style.display = 'none'; }
        }
      });
    });

    document.querySelectorAll('.o-menu_overlay, [data-action="close"], .o-header_menuButton .-close').forEach(function(el) {
      el.addEventListener('click', function() {
        document.body.classList.remove('-isMenuOpen', '-hideLogo', '-isWhatsAppPopinOpened');
        var menu = document.querySelector('.o-menu, [data-module-menu]');
        if (menu) { menu.setAttribute('aria-hidden', 'true'); menu.style.display = 'none'; }
      });
    });
  });

  window.addEventListener('load', function() {
    wakeUpPage();
    setTimeout(wakeUpPage, 500);
  });
})();
</script>
`;
  }
}

module.exports = WebflowEngine;
