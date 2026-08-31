/**
 * Universal Website Cloner & Stealth Crawler Engine
 * Location: lib/crawler-cluster.js
 */

let puppeteer = null;
try {
  const puppeteerExtra = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteerExtra.use(StealthPlugin());
  puppeteer = puppeteerExtra;
} catch {
  try {
    puppeteer = require('puppeteer');
  } catch {
    puppeteer = null;
  }
}

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const AssetPipeline = require('./asset-pipeline');
const FramerEngine = require('./framer-engine');
const Rewriter = require('./rewriter');

class CrawlerCluster {
  constructor(options, logger, progressCallback) {
    this.startUrl = options.url;
    this.maxPages = Math.max(1, parseInt(options.maxPages) || 1000);
    this.concurrency = Math.min(6, Math.max(1, parseInt(options.concurrency) || 3));
    this.deepInteract = options.deepInteract !== false;
    this.includeSubdomains = options.includeSubdomains !== false;
    this.mirrorDir = options.mirrorDir;
    this.userExportDir = options.userExportDir;
    this.jobId = options.jobId;

    this.base = new URL(this.startUrl);
    this.origin = this.base.origin;
    this.apexDomain = this.getApexDomain(this.base.hostname);

    this.logger = logger || (() => {});
    this.pipeline = new AssetPipeline(this.mirrorDir, this.origin);
    this.framer = new FramerEngine(this.pipeline, this.origin, this.logger);
    this.onProgress = progressCallback || (() => {});

    this.visited = new Set();
    this.queue = [];
    this.pagesCaptured = [];
    this.isAborted = false;
  }

  getApexDomain(hostname) {
    const parts = hostname.toLowerCase().split('.');
    if (parts.length <= 2) return hostname;
    if (parts.length >= 3 && ['co', 'com', 'org', 'net', 'edu', 'gov'].includes(parts[parts.length - 2])) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  }

  normalizeUrl(u) {
    try {
      const p = new URL(u);
      p.hash = '';
      const cleanPath = p.pathname === '/' ? '/' : p.pathname.replace(/\/$/, '');
      return p.origin + cleanPath + (p.search || '');
    } catch {
      return u;
    }
  }

  async run() {
    this.logger(`🚀 Initializing Carbon-Copy Mirror Engine for: ${this.startUrl}`);
    this.logger(`⚡ Mode: ${this.concurrency} Workers | Max Pages: ${this.maxPages}`);

    const initialNorm = this.normalizeUrl(this.startUrl);
    this.visited.add(initialNorm);
    this.queue.push(initialNorm);

    // Discover Sitemaps
    this.logger('🔎 Scanning all sitemap endpoints (sitemap.xml, wp-sitemap, robots.txt)…');
    const sitemapUrls = await this.discoverSitemaps();
    if (sitemapUrls.length > 0) {
      this.logger(`📋 Discovered ${sitemapUrls.length} pages from sitemaps!`, 'success');
      for (const u of sitemapUrls) {
        const norm = this.normalizeUrl(u);
        if (!this.visited.has(norm)) {
          this.visited.add(norm);
          this.queue.push(norm);
        }
      }
    }
    this.notify();

    let browser = null;
    const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

    if (!isServerless && puppeteer) {
      try {
        this.logger(`🌐 Launching Stealth Browser Cluster (${this.concurrency} workers)…`);
        browser = await puppeteer.launch({
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--allow-running-insecure-content',
            '--window-size=1920,1080',
            '--ignore-certificate-errors',
          ],
        });
      } catch (err) {
        this.logger(`⚠️ Headless Browser unavailable: ${err.message}. Switching to High-Speed Direct Engine…`, 'info');
        browser = null;
      }
    }

    if (browser) {
      return this.runBrowserCluster(browser);
    } else {
      this.logger(`⚡ Running High-Speed Universal Cloud Engine…`, 'info');
      return this.runHttpCluster();
    }
  }

  async runBrowserCluster(browser) {
    try {
      let processedCount = 0;

      const runWorker = async (workerId) => {
        while (this.queue.length > 0 && processedCount < this.maxPages && !this.isAborted) {
          const pageUrl = this.queue.shift();
          if (!pageUrl) break;
          processedCount++;
          const currentIdx = processedCount;

          this.logger(`📄 [${currentIdx}/${this.visited.size}] [W${workerId}] Capturing: ${pageUrl}`);

          try {
            const { internalLinks } = await this.capturePageWithBrowser(browser, pageUrl, workerId);

            let newRoutes = 0;
            for (const link of internalLinks) {
              const norm = this.normalizeUrl(link);
              if (!this.visited.has(norm)) {
                this.visited.add(norm);
                this.queue.push(norm);
                newRoutes++;
              }
            }

            this.pagesCaptured.push({ url: pageUrl, status: 'ok' });
            this.notify();

            if (newRoutes > 0) {
              this.logger(`   ✨ [W${workerId}] Saved ${pageUrl} (+${newRoutes} new routes found! Queue: ${this.queue.length})`, 'success');
            } else {
              this.logger(`   ✨ [W${workerId}] Saved ${pageUrl} (Assets: ${this.pipeline.assetMap.size} | Queue: ${this.queue.length})`, 'success');
            }
          } catch (err) {
            this.logger(`   ⚠️ [W${workerId}] Failed page ${pageUrl}: ${err.message}`, 'warn');
            this.pagesCaptured.push({ url: pageUrl, status: 'error' });
            this.notify();
          }
        }
      };

      const workers = [];
      for (let w = 1; w <= this.concurrency; w++) {
        workers.push(runWorker(w));
      }

      await Promise.all(workers);
      return this.finalizeMirror();
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  async runHttpCluster() {
    let processedCount = 0;

    const runWorker = async (workerId) => {
      while (this.queue.length > 0 && processedCount < this.maxPages && !this.isAborted) {
        const pageUrl = this.queue.shift();
        if (!pageUrl) break;
        processedCount++;
        const currentIdx = processedCount;

        this.logger(`📄 [${currentIdx}/${this.visited.size}] [W${workerId}] Fetching & Parsing: ${pageUrl}`);

        try {
          const { internalLinks } = await this.capturePageWithHttp(pageUrl, workerId);

          let newRoutes = 0;
          for (const link of internalLinks) {
            const norm = this.normalizeUrl(link);
            if (!this.visited.has(norm)) {
              this.visited.add(norm);
              this.queue.push(norm);
              newRoutes++;
            }
          }

          this.pagesCaptured.push({ url: pageUrl, status: 'ok' });
          this.notify();

          if (newRoutes > 0) {
            this.logger(`   ✨ [W${workerId}] Saved ${pageUrl} (+${newRoutes} new routes found! Queue: ${this.queue.length})`, 'success');
          } else {
            this.logger(`   ✨ [W${workerId}] Saved ${pageUrl} (Assets: ${this.pipeline.assetMap.size} | Queue: ${this.queue.length})`, 'success');
          }
        } catch (err) {
          this.logger(`   ⚠️ [W${workerId}] Failed page ${pageUrl}: ${err.message}`, 'warn');
          this.pagesCaptured.push({ url: pageUrl, status: 'error' });
          this.notify();
        }
      }
    };

    const workers = [];
    for (let w = 1; w <= this.concurrency; w++) {
      workers.push(runWorker(w));
    }

    await Promise.all(workers);
    return this.finalizeMirror();
  }

  async capturePageWithHttp(pageUrl, workerId) {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    const resp = await axios.get(pageUrl, {
      headers,
      timeout: 25000,
      validateStatus: (s) => s < 400,
    });

    const html = (resp.data || '').toString();
    const $ = cheerio.load(html);
    const internalLinks = new Set();
    const assetUrls = new Set();

    const pushLink = (href) => {
      if (!href || typeof href !== 'string') return;
      href = href.trim();
      if (/^(javascript:|mailto:|tel:|data:|blob:|#)/i.test(href)) return;
      try {
        const parsed = new URL(href, pageUrl);
        const hostname = parsed.hostname.toLowerCase();
        const origHost = new URL(this.origin).hostname.toLowerCase();

        const isMatch =
          hostname === origHost ||
          (this.includeSubdomains && (hostname === this.apexDomain || hostname.endsWith('.' + this.apexDomain))) ||
          hostname.replace(/^www\./, '') === origHost.replace(/^www\./, '');

        if (isMatch) {
          parsed.hash = '';
          if (!/\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|eot|mp4|webm|mp3|wav|zip|pdf|json|wasm)$/i.test(parsed.pathname)) {
            internalLinks.add(parsed.href);
          }
        }
      } catch {}
    };

    const pushAsset = (u) => {
      if (!u || typeof u !== 'string') return;
      u = u.trim();
      if (/^(javascript:|mailto:|tel:|data:|blob:|#)/i.test(u)) return;
      try {
        const abs = new URL(u, pageUrl).href.split('#')[0];
        assetUrls.add(abs);
      } catch {}
    };

    // Extract links
    $('a[href], area[href]').each((_, el) => pushLink($(el).attr('href')));
    $('link[rel="canonical"][href], link[rel="alternate"][href]').each((_, el) => pushLink($(el).attr('href')));
    $('[data-href], [data-url], [data-link], [data-route], [to], [routerlink]').each((_, el) => {
      pushLink($(el).attr('data-href') || $(el).attr('data-url') || $(el).attr('data-link') || $(el).attr('data-route') || $(el).attr('to') || $(el).attr('routerlink'));
    });

    // Extract assets
    $('link[href]').each((_, el) => pushAsset($(el).attr('href')));
    $('script[src]').each((_, el) => pushAsset($(el).attr('src')));
    $('img[src], video[src], audio[src], source[src], track[src], object[data], embed[src], iframe[src]').each((_, el) => {
      pushAsset($(el).attr('src') || $(el).attr('data') || $(el).attr('poster'));
    });
    $('[data-src], [data-lazy], [data-poster], [data-bg], [data-bg-hidpi], [data-framer-src]').each((_, el) => {
      pushAsset($(el).attr('data-src') || $(el).attr('data-lazy') || $(el).attr('data-poster') || $(el).attr('data-bg') || $(el).attr('data-framer-src'));
    });
    $('img[srcset], source[srcset], [data-srcset], [data-framer-srcset]').each((_, el) => {
      const ss = $(el).attr('srcset') || $(el).attr('data-srcset') || $(el).attr('data-framer-srcset') || '';
      ss.split(',').forEach((p) => pushAsset(p.trim().split(/\s+/)[0]));
    });
    $('svg image, svg use').each((_, el) => {
      pushAsset($(el).attr('href') || $(el).attr('xlink:href'));
    });

    // Framer Regex Module & Asset Sweeper
    const framerMatches = html.match(/https:\/\/[a-z0-9.-]+\.framerusercontent\.com\/[^\s"'>)]+/gi) || [];
    framerMatches.forEach((m) => pushAsset(m));

    // Download assets
    const missing = [...assetUrls].filter((u) => !this.pipeline.assetMap.has(u));
    const CHUNK = 25;
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunk = missing.slice(i, i + CHUNK);
      await Promise.allSettled(chunk.map((u) => this.pipeline.downloadAsset(u, pageUrl)));
    }

    // Rewrite and save HTML
    const thisFilePath = Rewriter.pageUrlToFilePath(pageUrl, this.origin, this.mirrorDir);
    const rewrittenHtml = await Rewriter.rewriteHtmlAsync(
      html,
      pageUrl,
      this.origin,
      this.apexDomain,
      this.mirrorDir,
      this.pipeline,
      thisFilePath
    );

    fs.mkdirSync(path.dirname(thisFilePath), { recursive: true });
    fs.writeFileSync(thisFilePath, rewrittenHtml, 'utf8');

    return { internalLinks: [...internalLinks] };
  }

  async capturePageWithBrowser(browser, pageUrl, workerId) {
    const page = await browser.newPage();
    const inFlightBodyFetches = [];
    let cdp = null;

    try {
      cdp = await page.target().createCDPSession();
      await cdp.send('Network.enable', { maxTotalBufferSize: 500000000, maxResourceBufferSize: 100000000 });

      cdp.on('Network.responseReceived', (params) => {
        const resp = params.response;
        if (!resp || !resp.url || resp.url.startsWith('data:') || resp.url.startsWith('blob:')) return;
        if (this.pipeline.assetMap.has(resp.url)) return;
        if (resp.status >= 400) return;
        if (resp.url === pageUrl && (resp.mimeType || '').includes('html')) return;

        const bodyPromise = cdp
          .send('Network.getResponseBody', { requestId: params.requestId })
          .then((bodyData) => {
            if (!bodyData || !bodyData.body) return;
            const buf = bodyData.base64Encoded ? Buffer.from(bodyData.body, 'base64') : Buffer.from(bodyData.body, 'utf8');
            this.pipeline.saveBuffer(resp.url, buf, resp.mimeType || '');
          })
          .catch(() => {});

        inFlightBodyFetches.push(bodyPromise);
      });
    } catch {}

    page.on('response', async (response) => {
      try {
        const respUrl = response.url();
        if (!respUrl || respUrl.startsWith('data:') || respUrl.startsWith('blob:')) return;
        if (this.pipeline.assetMap.has(respUrl)) return;
        if (response.status() >= 400) return;
        const ct = (response.headers()['content-type'] || '').toLowerCase();
        if (respUrl === pageUrl && ct.includes('html')) return;

        const buffer = await response.buffer().catch(() => null);
        if (!buffer || buffer.length === 0) return;
        this.pipeline.saveBuffer(respUrl, buffer, ct);
      } catch {}
    });

    try {
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      );

      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() =>
        page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 35000 })
      );

      await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve())).catch(() => {});

      const pristineInitialHtml = await page.content();

      if (this.framer.isFramerSite(pristineInitialHtml, pageUrl)) {
        const framerRes = await this.framer.extractFramerRoutesAndModules(page, pristineInitialHtml);
        for (const fr of framerRes.routes) {
          const norm = this.normalizeUrl(fr);
          if (!this.visited.has(norm)) {
            this.visited.add(norm);
            this.queue.push(norm);
          }
        }
      }

      const breakpoints = [
        { width: 1440, height: 900 },
        { width: 810, height: 1080 },
        { width: 390, height: 844 },
        { width: 1920, height: 1080 },
      ];

      for (const bp of breakpoints) {
        await page.setViewport(bp);
        await this.delay(150);
      }

      if (this.deepInteract) {
        await page.evaluate(() => {
          const interactive = document.querySelectorAll(
            '.w-nav-button, .o-header_menuButton, [aria-label*="menu" i], [aria-label*="navigation" i], [data-action*="menu" i], .hamburger, .menu-toggle, .navbar-toggler, .w-dropdown-toggle, [data-toggle="dropdown"], [data-framer-name*="Menu" i], [data-framer-name*="Nav" i]'
          );
          interactive.forEach((el) => {
            try {
              el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
              el.click();
            } catch {}
          });
        }).catch(() => {});
        await this.delay(300);
      }

      await this.smoothDeepScroll(page);
      await this.delay(400);

      const internalLinks = await page.evaluate((evalOrigin, evalApex, evalSubdomains) => {
        const links = new Set();
        function checkAndAdd(u) {
          if (!u || typeof u !== 'string') return;
          u = u.trim();
          if (/^(javascript:|mailto:|tel:|data:|blob:|#)/i.test(u)) return;

          try {
            const parsed = new URL(u, window.location.href);
            const hostname = parsed.hostname.toLowerCase();
            const origHost = new URL(evalOrigin).hostname.toLowerCase();

            const isMatch =
              hostname === origHost ||
              (evalSubdomains && (hostname === evalApex || hostname.endsWith('.' + evalApex))) ||
              hostname.replace(/^www\./, '') === origHost.replace(/^www\./, '');

            if (isMatch) {
              parsed.hash = '';
              if (!/\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|eot|mp4|webm|mp3|wav|zip|pdf|json|wasm)$/i.test(parsed.pathname)) {
                links.add(parsed.href);
              }
            }
          } catch {}
        }

        document.querySelectorAll('a[href], area[href]').forEach((a) => {
          checkAndAdd(a.getAttribute('href') || a.href);
        });

        document.querySelectorAll('link[rel="canonical"][href], link[rel="alternate"][href]').forEach((l) => {
          checkAndAdd(l.getAttribute('href') || l.href);
        });

        document.querySelectorAll('[data-href], [data-url], [data-link], [data-route], [data-target], [to], [routerlink]').forEach((el) => {
          checkAndAdd(
            el.getAttribute('data-href') ||
            el.getAttribute('data-url') ||
            el.getAttribute('data-link') ||
            el.getAttribute('data-route') ||
            el.getAttribute('data-target') ||
            el.getAttribute('to') ||
            el.getAttribute('routerlink')
          );
        });

        return [...links];
      }, this.origin, this.apexDomain, this.includeSubdomains);

      const domAssetUrls = await page.evaluate(() => {
        const urls = new Set();
        const push = (v) => {
          if (!v || typeof v !== 'string' || v.startsWith('data:') || v.startsWith('blob:') || v.startsWith('javascript:') || v.startsWith('mailto:') || v.startsWith('#')) return;
          try {
            const abs = new URL(v, window.location.href).href.split('#')[0];
            urls.add(abs);
          } catch {}
        };

        document.querySelectorAll('link[href]').forEach((el) => push(el.href || el.getAttribute('href')));
        document.querySelectorAll('script[src]').forEach((el) => push(el.src || el.getAttribute('src')));
        document.querySelectorAll('img[src], video[src], audio[src], source[src], track[src], object[data], embed[src], iframe[src]').forEach((el) => {
          push(el.src || el.getAttribute('src') || el.getAttribute('data') || el.getAttribute('poster'));
        });

        document.querySelectorAll('[data-src], [data-lazy], [data-poster], [data-bg], [data-bg-hidpi], [data-framer-src]').forEach((el) => {
          push(el.getAttribute('data-src') || el.getAttribute('data-lazy') || el.getAttribute('data-poster') || el.getAttribute('data-bg') || el.getAttribute('data-bg-hidpi') || el.getAttribute('data-framer-src'));
        });

        document.querySelectorAll('img[srcset], source[srcset], [data-srcset], [data-framer-srcset]').forEach((el) => {
          const ss = el.getAttribute('srcset') || el.getAttribute('data-srcset') || el.getAttribute('data-framer-srcset') || '';
          ss.split(',').forEach((p) => push(p.trim().split(/\s+/)[0]));
        });

        document.querySelectorAll('svg image, svg use').forEach((el) => {
          push(el.getAttribute('href') || el.getAttribute('xlink:href'));
        });

        return [...urls];
      });

      await Promise.allSettled(inFlightBodyFetches);

      const missing = domAssetUrls.filter((u) => !this.pipeline.assetMap.has(u));
      const CHUNK = 25;
      for (let i = 0; i < missing.length; i += CHUNK) {
        const chunk = missing.slice(i, i + CHUNK);
        await Promise.allSettled(chunk.map((u) => this.pipeline.downloadAsset(u, pageUrl)));
      }

      const finalHtml = await page.content();
      const thisFilePath = Rewriter.pageUrlToFilePath(pageUrl, this.origin, this.mirrorDir);
      const rewrittenHtml = await Rewriter.rewriteHtmlAsync(
        finalHtml,
        pageUrl,
        this.origin,
        this.apexDomain,
        this.mirrorDir,
        this.pipeline,
        thisFilePath
      );

      fs.mkdirSync(path.dirname(thisFilePath), { recursive: true });
      fs.writeFileSync(thisFilePath, rewrittenHtml, 'utf8');

      return { internalLinks };
    } finally {
      if (cdp) await cdp.detach().catch(() => {});
      await page.close();
    }
  }

  async finalizeMirror() {
    this.logger('🔧 Re-processing CSS files for missing font/image references…');
    await this.pipeline.fixAllCssFiles();

    const manifestData = {
      origin: this.origin,
      apexDomain: this.apexDomain,
      startUrl: this.startUrl,
      timestamp: Date.now(),
      pagesCount: this.pagesCaptured.length,
      assetsCount: this.pipeline.assetMap.size,
      pagesList: this.pagesCaptured,
      assetMap: Object.fromEntries(this.pipeline.assetMap),
    };
    fs.writeFileSync(path.join(this.mirrorDir, '_manifest.json'), JSON.stringify(manifestData, null, 2), 'utf8');

    this.logger('📦 Packaging complete multi-page ZIP archive…');
    const zipName = `${this.base.hostname.replace(/[^a-z0-9.-]/gi, '_')}_mirror_${this.jobId.slice(0, 6)}.zip`;
    const zipPath = path.join(path.dirname(this.mirrorDir), `${path.basename(this.mirrorDir)}.zip`);
    const userZipPath = path.join(this.userExportDir, zipName);

    await this.packageZip(this.mirrorDir, zipPath);
    try { fs.copyFileSync(zipPath, userZipPath); } catch {}

    this.logger(`\n🎉 100% Carbon-Copy Mirror Complete!`, 'success');
    this.logger(`   📄 Total Pages Cloned: ${this.pagesCaptured.length}`, 'success');
    this.logger(`   📦 Total Assets: ${this.pipeline.assetMap.size}`, 'success');
    this.logger(`   📁 Saved To: ${userZipPath}`, 'success');

    return {
      pages: this.pagesCaptured,
      assetsCount: this.pipeline.assetMap.size,
      zipPath,
      userZipPath,
    };
  }

  async discoverSitemaps() {
    const urls = new Set();
    const sitemapTargets = [
      `${this.origin}/sitemap.xml`,
      `${this.origin}/sitemap_index.xml`,
      `${this.origin}/sitemap-index.xml`,
      `${this.origin}/sitemap-pages.xml`,
      `${this.origin}/sitemap-posts.xml`,
      `${this.origin}/page-sitemap.xml`,
      `${this.origin}/post-sitemap.xml`,
      `${this.origin}/wp-sitemap.xml`,
      `${this.origin}/robots.txt`,
    ];

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };

    for (const target of sitemapTargets) {
      try {
        const resp = await axios.get(target, { timeout: 6000, headers, validateStatus: (s) => s < 400 });
        const text = (resp.data || '').toString();

        const locMatches = text.match(/<loc>([^<]+)<\/loc>/gi) || [];
        for (const m of locMatches) {
          const u = m.replace(/<\/?loc>/gi, '').trim();
          try {
            const parsed = new URL(u);
            if (Rewriter.isInternalDomain(parsed.hostname, this.origin, this.apexDomain)) {
              urls.add(u);
            }
          } catch {}
        }
      } catch {}
    }

    return [...urls];
  }

  async smoothDeepScroll(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let y = 0;
        const step = 600;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          y += step;
          window.dispatchEvent(new Event('scroll'));
          window.dispatchEvent(new Event('resize'));

          if (y >= document.body.scrollHeight + 1200) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            window.dispatchEvent(new Event('scroll'));
            resolve();
          }
        }, 40);

        setTimeout(() => {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }, 5000);
      });
    }).catch(() => {});
  }

  notify() {
    this.onProgress({
      pages: this.pagesCaptured.length,
      discovered: this.visited.size,
      assets: this.pipeline.assetMap.size,
    });
  }

  async packageZip(srcDir, zipPath) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', reject);
      output.on('close', resolve);
      archive.pipe(output);
      archive.directory(srcDir, false);
      archive.finalize();
    });
  }

  delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}

module.exports = CrawlerCluster;
