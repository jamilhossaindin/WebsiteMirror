/**
 * Universal Asset Pipeline & Module Storage Engine
 * Location: lib/asset-pipeline.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const mime = require('mime-types');

class AssetPipeline {
  constructor(mirrorDir, origin) {
    this.mirrorDir = mirrorDir;
    this.assetsDir = path.join(mirrorDir, '_assets');
    this.origin = origin;
    this.assetMap = new Map(); // Absolute URL -> Local filename
    this.inFlight = new Map(); // Absolute URL -> Promise
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(this.assetsDir)) {
      fs.mkdirSync(this.assetsDir, { recursive: true });
    }
  }

  /**
   * Sniff the actual content type from buffer magic bytes / text patterns.
   * Returns a reliable extension or null if indeterminate.
   */
  sniffContentType(buffer, urlHint = '') {
    if (!buffer || buffer.length === 0) return null;

    // Check binary magic bytes first
    const head = buffer.slice(0, 16);

    // PNG
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) return 'png';
    // JPEG
    if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return 'jpg';
    // GIF
    if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return 'gif';
    // WebP (RIFF....WEBP)
    if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
        head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'webp';
    // AVIF / HEIF (ftyp box)
    if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
      const brand = buffer.slice(8, 12).toString('ascii');
      if (brand.startsWith('avif') || brand.startsWith('avis')) return 'avif';
      return 'mp4'; // could be mp4/heif
    }
    // WOFF2
    if (head[0] === 0x77 && head[1] === 0x4F && head[2] === 0x46 && head[3] === 0x32) return 'woff2';
    // WOFF
    if (head[0] === 0x77 && head[1] === 0x4F && head[2] === 0x46 && head[3] === 0x46) return 'woff';
    // OTF / TTF
    if (head[0] === 0x00 && head[1] === 0x01 && head[2] === 0x00 && head[3] === 0x00) return 'ttf';
    if (head[0] === 0x4F && head[1] === 0x54 && head[2] === 0x54 && head[3] === 0x4F) return 'otf';
    // MP4 (ftyp with isom/mp4 brands — already handled above)
    // SVG
    const textHead = buffer.slice(0, Math.min(512, buffer.length)).toString('utf8').trim();
    if (textHead.startsWith('<?xml') || textHead.startsWith('<svg')) return 'svg';
    // WASM
    if (head[0] === 0x00 && head[1] === 0x61 && head[2] === 0x73 && head[3] === 0x6D) return 'wasm';

    // Text-based content sniffing
    const sample = buffer.slice(0, Math.min(2048, buffer.length)).toString('utf8');

    // JSON
    if (/^\s*[\[{]/.test(sample) && !/(function|import |export |require\()/.test(sample)) {
      try { JSON.parse(buffer.toString('utf8')); return 'json'; } catch {}
    }

    // CSS
    if (/^\s*(@charset|@import|@font-face|@media|@keyframes|@layer|:root|html\s*\{|body\s*\{|\*\s*\{|\.[\w-]+\s*\{|#[\w-]+\s*\{)/m.test(sample)) return 'css';

    // JavaScript / ES Modules
    if (/(^|\n)\s*(["']use strict["']|import\s+|export\s+(default\s+)?|const\s+|let\s+|var\s+|function\s+|class\s+|window\.|document\.|module\.exports|\(\s*\(\)\s*=>|\(\s*function\s*\()/.test(sample)) {
      // Check URL hint for .mjs
      if (/\.mjs(\?|$)/i.test(urlHint)) return 'mjs';
      return 'js';
    }

    // HTML
    if (/^\s*<!doctype\s+html|^\s*<html/i.test(sample)) return 'html';

    return null;
  }

  getFilename(absoluteUrl, contentType = '', buffer = null) {
    const cleanUrl = absoluteUrl.split('#')[0];
    if (this.assetMap.has(cleanUrl)) {
      return this.assetMap.get(cleanUrl);
    }

    let basename = '';
    try {
      const pathname = new URL(cleanUrl).pathname;
      basename = path.basename(pathname);
    } catch {}

    let ext = null;

    // 1. Try content-type header (but filter out unreliable ones)
    if (contentType) {
      const ct = contentType.split(';')[0].trim().toLowerCase();
      // Map specific content-types to extensions explicitly
      const ctMap = {
        'application/javascript': 'js',
        'text/javascript': 'js',
        'application/x-javascript': 'js',
        'application/ecmascript': 'mjs',
        'text/ecmascript': 'mjs',
        'text/css': 'css',
        'text/html': 'html',
        'application/json': 'json',
        'application/wasm': 'wasm',
        'font/woff2': 'woff2',
        'font/woff': 'woff',
        'font/ttf': 'ttf',
        'font/otf': 'otf',
        'application/font-woff2': 'woff2',
        'application/font-woff': 'woff',
        'image/svg+xml': 'svg',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/avif': 'avif',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'audio/mpeg': 'mp3',
      };
      ext = ctMap[ct] || mime.extension(ct);
    }

    // 2. Try URL extension (but reject purely numeric extensions like .57)
    if (!ext || ext === 'bin') {
      try {
        const pExt = path.extname(basename).replace('.', '').toLowerCase();
        if (pExt && pExt.length <= 5 && !pExt.includes('/') && !/^\d+$/.test(pExt)) {
          ext = pExt;
        }
      } catch {}
    }

    // 3. Sniff content from buffer if still unknown
    if ((!ext || ext === 'bin') && buffer) {
      const sniffed = this.sniffContentType(buffer, cleanUrl);
      if (sniffed) ext = sniffed;
    }

    // 4. Last resort: check URL patterns
    if (!ext || ext === 'bin') {
      if (/\.mjs(\?|$)/i.test(cleanUrl)) ext = 'mjs';
      else if (/\.(js|cjs)(\?|$)/i.test(cleanUrl)) ext = 'js';
      else if (/\.css(\?|$)/i.test(cleanUrl)) ext = 'css';
      else if (/\.woff2(\?|$)/i.test(cleanUrl)) ext = 'woff2';
      else if (/\.woff(\?|$)/i.test(cleanUrl)) ext = 'woff';
      else if (/\.ttf(\?|$)/i.test(cleanUrl)) ext = 'ttf';
    }

    if (!ext) ext = 'bin';
    if (ext === 'jpeg') ext = 'jpg';

    // Preserve original filename if meaningful, but fix the extension
    let filename;
    if (basename && basename.length > 3 && basename.includes('.') && !basename.startsWith('.')) {
      // Fix the extension if the original one was bad
      const origExt = path.extname(basename).replace('.', '').toLowerCase();
      if (origExt && (/^\d+$/.test(origExt) || origExt === 'bin')) {
        // Replace bad extension with the correct one
        filename = basename.replace(/\.[^.]+$/, `.${ext}`);
      } else {
        filename = basename;
      }
    } else {
      const hash = crypto.createHash('sha1').update(cleanUrl).digest('hex').slice(0, 16);
      filename = `${hash}.${ext}`;
    }

    // Deduplicate filenames — different URLs can have the same basename
    if ([...this.assetMap.values()].includes(filename) && !this.assetMap.has(cleanUrl)) {
      const hash = crypto.createHash('sha1').update(cleanUrl).digest('hex').slice(0, 8);
      const extWithDot = path.extname(filename);
      const base = filename.slice(0, -extWithDot.length);
      filename = `${base}_${hash}${extWithDot}`;
    }

    this.assetMap.set(cleanUrl, filename);
    return filename;
  }

  saveBuffer(absoluteUrl, buffer, contentType = '') {
    if (!buffer || buffer.length === 0) return null;
    const cleanUrl = absoluteUrl.split('#')[0];
    const filename = this.getFilename(cleanUrl, contentType, buffer);
    const filePath = path.join(this.assetsDir, filename);

    const ct = (contentType || '').toLowerCase();
    const isCSS = ct.includes('css') || /\.css(\?|$)/i.test(cleanUrl);
    const isJS = ct.includes('javascript') || ct.includes('ecmascript') || /\.(js|mjs|cjs)(\?|$)/i.test(cleanUrl);

    if (isCSS) {
      let cssText = buffer.toString('utf8');
      // Synchronous rewrite — replaces known assets only (async pass happens later)
      cssText = this.rewriteCss(cssText, cleanUrl);
      fs.writeFileSync(filePath, cssText, 'utf8');
    } else if (isJS) {
      let jsText = buffer.toString('utf8');
      jsText = this.rewriteJsModules(jsText, cleanUrl);
      fs.writeFileSync(filePath, jsText, 'utf8');
    } else {
      fs.writeFileSync(filePath, buffer);
    }

    return filename;
  }

  /**
   * Synchronous CSS rewriter — rewrites url() references that are already in assetMap.
   */
  rewriteCss(css, baseCssUrl) {
    return css.replace(/url\(\s*(['"]?)([^'"\)\s]+)\1\s*\)/gi, (match, quote, raw) => {
      if (/^(data:|#|blob:)/.test(raw)) return match;
      try {
        const abs = new URL(raw, baseCssUrl).href.split('#')[0];
        const filename = this.assetMap.get(abs);
        if (filename) return `url(${quote}${filename}${quote})`;
      } catch {}
      return match;
    });
  }

  /**
   * Async CSS rewriter — downloads missing url() assets (fonts, images) before rewriting.
   * Call this after the initial crawl to fix CSS files that reference external resources.
   */
  async rewriteCssAsync(css, baseCssUrl) {
    // 1. Collect all url() references
    const urlRegex = /url\(\s*(['"]?)([^'"\)\s]+)\1\s*\)/gi;
    const toDownload = [];
    let match;

    while ((match = urlRegex.exec(css)) !== null) {
      const raw = match[2];
      if (/^(data:|#|blob:)/.test(raw)) continue;
      try {
        const abs = new URL(raw, baseCssUrl).href.split('#')[0];
        if (!this.assetMap.has(abs)) {
          toDownload.push(abs);
        }
      } catch {}
    }

    // 2. Download all missing assets in parallel
    if (toDownload.length > 0) {
      const CHUNK = 20;
      for (let i = 0; i < toDownload.length; i += CHUNK) {
        const chunk = toDownload.slice(i, i + CHUNK);
        await Promise.allSettled(chunk.map(u => this.downloadAsset(u, baseCssUrl)));
      }
    }

    // 3. Now rewrite all url() references (all should be in assetMap now)
    return css.replace(/url\(\s*(['"]?)([^'"\)\s]+)\1\s*\)/gi, (m, quote, raw) => {
      if (/^(data:|#|blob:)/.test(raw)) return m;
      try {
        const abs = new URL(raw, baseCssUrl).href.split('#')[0];
        const filename = this.assetMap.get(abs);
        if (filename) return `url(${quote}${filename}${quote})`;
      } catch {}
      return m;
    });
  }

  /**
   * Re-process all saved CSS files in _assets/ to fix url() references
   * that couldn't be resolved during the initial synchronous save.
   */
  async fixAllCssFiles() {
    const cssFiles = [];
    // Scan assetMap for CSS entries
    for (const [absUrl, filename] of this.assetMap) {
      if (/\.css$/i.test(filename)) {
        cssFiles.push({ absUrl, filename });
      }
    }

    for (const { absUrl, filename } of cssFiles) {
      const filePath = path.join(this.assetsDir, filename);
      if (!fs.existsSync(filePath)) continue;

      const cssText = fs.readFileSync(filePath, 'utf8');
      if (!cssText.includes('url(')) continue;

      const fixed = await this.rewriteCssAsync(cssText, absUrl);
      if (fixed !== cssText) {
        fs.writeFileSync(filePath, fixed, 'utf8');
      }
    }
  }

  rewriteJsModules(jsText, baseJsUrl) {
    // 1. Rewrite Webpack / Vite / Next.js public paths
    let text = jsText
      .replace(/__webpack_require__\.p\s*=\s*["'][^"']+["']/g, '__webpack_require__.p = "./_assets/"')
      .replace(/publicPath:\s*["'][^"']+["']/g, 'publicPath: "./_assets/"')
      .replace(/baseURL:\s*["'][^"']+["']/g, 'baseURL: "./"');

    // 2. Rewrite Framer & ES Module Static Imports / Exports
    // e.g. import ... from "https://framerusercontent.com/modules/..." -> from "./xxx.mjs"
    text = text.replace(
      /(import|export)\s+([\s\S]*?from\s+)?['"](https:\/\/[^'"]+)['"]/g,
      (match, statement, middle, fullUrl) => {
        const cleanAbs = fullUrl.split('#')[0];
        let filename = this.assetMap.get(cleanAbs);
        if (!filename) {
          try {
            filename = path.basename(new URL(cleanAbs).pathname);
          } catch {}
        }
        if (filename) {
          return `${statement} ${middle || ''}\"./${filename}\"`;
        }
        return match;
      }
    );

    // 3. Rewrite Dynamic Imports
    text = text.replace(
      /import\s*\(\s*['"](https:\/\/[^'"]+)['"]\s*\)/g,
      (match, fullUrl) => {
        const cleanAbs = fullUrl.split('#')[0];
        let filename = this.assetMap.get(cleanAbs);
        if (!filename) {
          try {
            filename = path.basename(new URL(cleanAbs).pathname);
          } catch {}
        }
        if (filename) {
          return `import("./${filename}")`;
        }
        return match;
      }
    );

    return text;
  }

  async downloadAsset(rawUrl, referer = this.origin) {
    if (!rawUrl || /^(data:|blob:|javascript:|mailto:|tel:|#)/.test(rawUrl)) return null;

    let absolute;
    try {
      absolute = new URL(rawUrl, referer).href.split('#')[0];
    } catch {
      return null;
    }

    if (this.assetMap.has(absolute)) {
      return this.assetMap.get(absolute);
    }

    if (this.inFlight.has(absolute)) {
      return this.inFlight.get(absolute);
    }

    const promise = (async () => {
      try {
        const resp = await axios.get(absolute, {
          responseType: 'arraybuffer',
          timeout: 8000,
          maxContentLength: 150 * 1024 * 1024,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': referer,
            'Accept': '*/*',
          },
          validateStatus: (s) => s < 400,
        });

        const ct = (resp.headers['content-type'] || '').toLowerCase();
        const buf = Buffer.from(resp.data);
        return this.saveBuffer(absolute, buf, ct);
      } catch (err) {
        return null;
      } finally {
        this.inFlight.delete(absolute);
      }
    })();

    this.inFlight.set(absolute, promise);
    return promise;
  }

  getManifest() {
    return {
      assetCount: this.assetMap.size,
      assetMap: Object.fromEntries(this.assetMap),
    };
  }
}

module.exports = AssetPipeline;
