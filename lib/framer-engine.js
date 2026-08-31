/**
 * Specialized Framer Engine for 100% Comprehensive Fidelity
 * Location: lib/framer-engine.js
 */

const axios = require('axios');

class FramerEngine {
  constructor(assetPipeline, origin, logger = (() => {})) {
    this.pipeline = assetPipeline;
    this.origin = origin;
    this.logger = logger;
    this.discoveredFramerRoutes = new Set();
    this.scannedModules = new Set();
  }

  isFramerSite(html = '', pageUrl = '') {
    if (pageUrl.includes('.framer.app') || pageUrl.includes('.framer.ai') || pageUrl.includes('.framer.website') || pageUrl.includes('.framer.media') || pageUrl.includes('framer.com')) {
      return true;
    }
    return (
      html.includes('framerusercontent.com') ||
      html.includes('data-framer-name') ||
      html.includes('data-framer-component-type') ||
      html.includes('__framer_manifest__') ||
      html.includes('framerSiteManifest') ||
      html.includes('framer-custom-module')
    );
  }

  async extractFramerRoutesAndModules(page, initialHtml) {
    const discovered = await page.evaluate(() => {
      const routes = new Set();
      const moduleUrls = new Set();

      // 1. Inspect window.__framer_manifest__ or framerSiteManifest
      const manifest = window.__framer_manifest__ || window.framerSiteManifest || window.__framer_site_manifest__;
      if (manifest && manifest.routes) {
        Object.keys(manifest.routes).forEach((r) => {
          if (r && !r.startsWith('/_') && !r.includes(':') && !r.includes('*')) {
            routes.add(r);
          }
        });
      }

      // 2. Scan all script tags with type="module" or src containing framerusercontent
      document.querySelectorAll('script[src], link[rel="modulepreload"]').forEach((el) => {
        const src = el.src || el.getAttribute('href');
        if (src && (src.includes('framerusercontent.com') || src.includes('/modules/') || src.includes('.mjs') || src.includes('.js'))) {
          moduleUrls.add(src);
        }
      });

      // 3. Scan inline scripts for route declarations & collection paths
      document.querySelectorAll('script').forEach((s) => {
        const text = s.textContent || '';
        if (text.includes('framerusercontent.com/modules/')) {
          const modMatches = text.match(/https:\/\/framerusercontent\.com\/modules\/[a-zA-Z0-9_\-\.\/]+\.(?:js|mjs)/g) || [];
          modMatches.forEach((m) => moduleUrls.add(m));
        }

        if (text.includes('routes:') || text.includes('collection:')) {
          const routeMatches = text.match(/["'](\/[a-zA-Z0-9_\-\/]{2,})["']/g) || [];
          routeMatches.forEach((r) => {
            const clean = r.replace(/['"]/g, '');
            if (!clean.startsWith('/_assets') && !clean.startsWith('/api') && !clean.includes('.')) {
              routes.add(clean);
            }
          });
        }
      });

      return {
        routes: [...routes],
        modules: [...moduleUrls],
      };
    }).catch(() => ({ routes: [], modules: [] }));

    if (discovered.modules.length > 0) {
      this.logger(`   🧩 Framer Engine: Deep-tracing ${discovered.modules.length} ES module roots…`);
    }

    // Parallel trace for top-level ES modules
    const modPromises = discovered.modules.map((modUrl) => this.traceAndDownloadModule(modUrl, 0));
    await Promise.allSettled(modPromises);

    const fullRoutes = [];
    for (const r of discovered.routes) {
      try {
        const full = new URL(r, this.origin).href;
        this.discoveredFramerRoutes.add(full);
        fullRoutes.push(full);
      } catch {}
    }

    if (fullRoutes.length > 0) {
      this.logger(`   🧭 Framer Engine: Found ${fullRoutes.length} dynamic routes in bundle!`, 'success');
    }

    return {
      routes: fullRoutes,
      modulesCount: this.scannedModules.size,
    };
  }

  async traceAndDownloadModule(modUrl, depth = 0) {
    if (!modUrl || this.scannedModules.has(modUrl) || depth > 20) return;
    this.scannedModules.add(modUrl);

    try {
      const resp = await axios.get(modUrl, {
        responseType: 'text',
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
        validateStatus: (s) => s < 400,
      });

      const jsText = (resp.data || '').toString();
      this.pipeline.saveBuffer(modUrl, Buffer.from(jsText, 'utf8'), 'application/javascript');

      const subModules = new Set();

      // Resolve both absolute AND relative imports (e.g. from "./BvyOYDKED.BV0d_ee3.mjs")
      const importMatches = jsText.match(/(?:from|import)\s*['"]([^'"]+)['"]/g) || [];
      importMatches.forEach((m) => {
        const extract = m.match(/['"]([^'"]+)['"]/);
        if (extract && extract[1]) {
          const rawPath = extract[1];
          if (rawPath.startsWith('http')) {
            subModules.add(rawPath);
          } else if (rawPath.startsWith('.') || rawPath.startsWith('/')) {
            try {
              const resolved = new URL(rawPath, modUrl).href;
              subModules.add(resolved);
            } catch {}
          }
        }
      });

      const dynMatches = jsText.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g) || [];
      dynMatches.forEach((m) => {
        const extract = m.match(/['"]([^'"]+)['"]/);
        if (extract && extract[1]) {
          const rawPath = extract[1];
          if (rawPath.startsWith('http')) {
            subModules.add(rawPath);
          } else if (rawPath.startsWith('.') || rawPath.startsWith('/')) {
            try {
              const resolved = new URL(rawPath, modUrl).href;
              subModules.add(resolved);
            } catch {}
          }
        }
      });

      // Find nested assets (images, fonts, wasm, framercms) inside Framer modules
      const assetMatches =
        jsText.match(
          /https:\/\/(?:framerusercontent\.com|cdn\.framer\.com)\/[a-zA-Z0-9_\-\.\/]+\.(?:png|jpe?g|gif|webp|avif|svg|woff2?|ttf|eot|mp4|webm|css|json|wasm|framercms)/gi
        ) || [];
      for (const a of assetMatches) {
        this.pipeline.downloadAsset(a, modUrl);
      }

      // Also download relative framercms chunks
      const cmsMatches = jsText.match(/\.\/[a-zA-Z0-9_\-\.]+\.framercms/g) || [];
      for (const cm of cmsMatches) {
        try {
          const resolvedCms = new URL(cm, modUrl).href;
          this.pipeline.downloadAsset(resolvedCms, modUrl);
        } catch {}
      }

      // Parallelize sub-module downloads with max depth limit
      const subPromises = [...subModules].map((sm) => this.traceAndDownloadModule(sm, depth + 1));
      await Promise.allSettled(subPromises);
    } catch {}
  }
}

module.exports = FramerEngine;
