/**
 * Universal Portable Link & Asset Rewriter
 * Location: lib/rewriter.js
 */

const cheerio = require('cheerio');
const path = require('path');
const WebflowEngine = require('./webflow-engine');

class Rewriter {
  /**
   * Async version of rewriteHtml that downloads missing assets referenced
   * in <style> blocks before rewriting them.
   */
  static async rewriteHtmlAsync(html, pageUrl, origin, apexDomain, mirrorDir, assetPipeline, thisFilePath) {
    const $ = cheerio.load(html, { decodeEntities: false });

    $('base').remove();

    // 1. Strip SRI Security and CSP tags
    $('*').removeAttr('integrity');
    $('*').removeAttr('crossorigin');
    $('*').removeAttr('nonce');
    $('meta[http-equiv="Content-Security-Policy"]').remove();

    // 2. Remove third-party telemetry / trackers
    $('script').each((_, el) => {
      const src = $(el).attr('src') || '';
      const content = $(el).html() || '';
      const isTracker =
        /googletagmanager|google-analytics|fbevents|hotjar|sentry|recaptcha|datadog|clarity/i.test(src) ||
        /gtag\(|dataLayer\.push|fbq\(|hj\(|grecaptcha/i.test(content);
      if (isTracker) {
        $(el).remove();
      }
    });

    const pageDir = path.dirname(thisFilePath);
    const relToRoot = path.relative(pageDir, mirrorDir).replace(/\\/g, '/');
    const rootPrefix = relToRoot ? (relToRoot.endsWith('/') ? relToRoot : relToRoot + '/') : './';
    const assetsPrefix = rootPrefix + '_assets/';

    const rewriteUrlAttr = (el, attr, isLink = false) => {
      const val = $(el).attr(attr);
      if (!val || /^(data:|blob:|javascript:|mailto:|tel:|#)/.test(val)) return;

      try {
        const abs = new URL(val, pageUrl);

        if (isLink) {
          if (this.isInternalDomain(abs.hostname, origin, apexDomain)) {
            const targetFile = this.pageUrlToFilePath(abs.href, origin, mirrorDir);
            let relPath = path.relative(pageDir, targetFile).replace(/\\/g, '/');
            if (!relPath.startsWith('.')) relPath = './' + relPath;
            $(el).attr(attr, relPath + (abs.hash || ''));
          }
          return;
        }

        const cleanAbs = abs.href.split('#')[0];
        const filename = assetPipeline.assetMap.get(cleanAbs);
        if (filename) {
          $(el).attr(attr, assetsPrefix + filename);
        }
      } catch {}
    };

    const rewriteSrcset = (el, attr) => {
      const val = $(el).attr(attr);
      if (!val) return;
      const parts = val.split(',').map(item => {
        const [src, desc] = item.trim().split(/\s+/);
        if (!src || src.startsWith('data:')) return item;
        try {
          const abs = new URL(src, pageUrl).href.split('#')[0];
          const filename = assetPipeline.assetMap.get(abs);
          return filename ? (desc ? `${assetsPrefix}${filename} ${desc}` : `${assetsPrefix}${filename}`) : item;
        } catch {
          return item;
        }
      });
      $(el).attr(attr, parts.join(', '));
    };

    // Standard Tags — skip canonical, og:url, and similar meta links
    $('link[href]').each((_, el) => {
      const rel = ($(el).attr('rel') || '').toLowerCase();
      // Skip tags that should NOT be rewritten to asset paths
      if (rel.includes('dns-prefetch') || rel.includes('preconnect')) return;
      if (rel.includes('canonical')) return; // Don't rewrite canonical links
      rewriteUrlAttr(el, 'href');
    });

    // Don't rewrite og:url, twitter:url — these are metadata about the original site
    // (they reference the original URL which is correct for SEO purposes)

    $('script[src]').each((_, el) => rewriteUrlAttr(el, 'src'));
    $('img[src]').each((_, el) => rewriteUrlAttr(el, 'src'));
    $('img[srcset]').each((_, el) => rewriteSrcset(el, 'srcset'));
    $('source[src]').each((_, el) => rewriteUrlAttr(el, 'src'));
    $('source[srcset]').each((_, el) => rewriteSrcset(el, 'srcset'));

    // Lazy Loading & Framer Data Attributes
    $('[data-src]').each((_, el) => rewriteUrlAttr(el, 'data-src'));
    $('[data-srcset]').each((_, el) => rewriteSrcset(el, 'data-srcset'));
    $('[data-bg]').each((_, el) => rewriteUrlAttr(el, 'data-bg'));
    $('[data-bg-hidpi]').each((_, el) => rewriteUrlAttr(el, 'data-bg-hidpi'));
    $('[data-poster]').each((_, el) => rewriteUrlAttr(el, 'data-poster'));
    $('[data-framer-src]').each((_, el) => rewriteUrlAttr(el, 'data-framer-src'));
    $('[data-framer-srcset]').each((_, el) => rewriteSrcset(el, 'data-framer-srcset'));

    // Video, Audio & Poster
    $('video[src], audio[src], video[poster]').each((_, el) => {
      if ($(el).attr('src')) rewriteUrlAttr(el, 'src');
      if ($(el).attr('poster')) rewriteUrlAttr(el, 'poster');
    });

    // Links & Forms
    $('a[href]').each((_, el) => rewriteUrlAttr(el, 'href', true));
    $('form[action]').each((_, el) => rewriteUrlAttr(el, 'action', true));

    // Inline CSS styles on elements
    $('[style]').each((_, el) => {
      const s = $(el).attr('style') || '';
      if (s.includes('url(')) {
        $(el).attr(
          'style',
          s.replace(/url\(\s*(['"]?)([^'"\)\s]+)\1\s*\)/gi, (match, quote, raw) => {
            if (/^(data:|#|blob:)/.test(raw)) return match;
            try {
              const abs = new URL(raw, pageUrl).href.split('#')[0];
              const filename = assetPipeline.assetMap.get(abs);
              if (filename) return `url(${quote}${assetsPrefix}${filename}${quote})`;
            } catch {}
            return match;
          })
        );
      }
    });

    // ═══════════════════════════════════════════════════════════════════
    // ASYNC: Download & rewrite all url() inside <style> blocks
    // This catches Google Fonts, Framer CDN fonts, and background images
    // that the original sync rewriter missed because they weren't in assetMap
    // ═══════════════════════════════════════════════════════════════════
    const styleElements = $('style');
    for (let i = 0; i < styleElements.length; i++) {
      const el = styleElements.eq(i);
      let c = el.html();
      if (!c || !c.includes('url(')) continue;

      // Use the async rewriter which downloads missing assets first
      const rewritten = await assetPipeline.rewriteCssAsync(c, pageUrl);

      // Now rewrite the paths to use assetsPrefix (since CSS is inline in HTML, not in _assets/)
      const finalCss = rewritten.replace(/url\(\s*(['"]?)([^'"\)\s]+)\1\s*\)/gi, (match, quote, raw) => {
        if (/^(data:|#|blob:)/.test(raw)) return match;
        // If it's a bare filename (no path separators) — it was already rewritten to a local filename
        if (!raw.includes('/') && !raw.startsWith('http')) {
          return `url(${quote}${assetsPrefix}${raw}${quote})`;
        }
        // If it's still an absolute URL, try to map it
        try {
          const abs = new URL(raw, pageUrl).href.split('#')[0];
          const filename = assetPipeline.assetMap.get(abs);
          if (filename) return `url(${quote}${assetsPrefix}${filename}${quote})`;
        } catch {}
        return match;
      });

      el.html(finalCss);
    }

    // Clean layout freeze classes
    $('html').removeClass('lenis-stopped');
    $('body').removeClass('-isMenuOpen -isWhatsAppPopinOpened -hideLogo');
    $('body').css('overflow', '');
    $('.o-menu, [data-module-menu]').attr('aria-hidden', 'true').css('display', 'none');

    // Prepend Hydration & Routing Shim
    $('head').prepend(WebflowEngine.getClientHydrationScript());

    return $.html();
  }

  static pageUrlToFilePath(pageUrl, origin, mirrorDir) {
    const crypto = require('crypto');
    const u = new URL(pageUrl);
    let pathname = decodeURIComponent(u.pathname);

    let querySuffix = '';
    if (u.search && u.search !== '?') {
      const qHash = crypto.createHash('md5').update(u.search).digest('hex').slice(0, 8);
      querySuffix = `__q_${qHash}`;
    }

    if (pathname === '/' || pathname === '') {
      return path.join(mirrorDir, querySuffix ? `index${querySuffix}.html` : 'index.html');
    }

    if (pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    if (path.extname(pathname) === '') {
      pathname = pathname + (querySuffix ? `/index${querySuffix}.html` : '/index.html');
    } else if (querySuffix) {
      const ext = path.extname(pathname);
      pathname = pathname.slice(0, -ext.length) + querySuffix + ext;
    }

    if (pathname.startsWith('/')) pathname = pathname.slice(1);
    const safePath = pathname.replace(/[?*:<>|"\\]/g, '_');
    return path.join(mirrorDir, safePath);
  }

  static isInternalDomain(testHost, origin, apexDomain) {
    if (!testHost) return false;
    testHost = testHost.toLowerCase();
    const origHost = new URL(origin).hostname.toLowerCase();

    if (testHost === origHost) return true;
    if (testHost.replace(/^www\./, '') === origHost.replace(/^www\./, '')) return true;
    if (apexDomain && (testHost === apexDomain || testHost.endsWith('.' + apexDomain))) return true;

    return false;
  }
}

module.exports = Rewriter;
