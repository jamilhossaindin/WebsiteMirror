/**
 * Rebuilt Ultra-Fidelity Website Cloner Server
 * Location: server.js
 */

const path = require('path');
module.paths.push(
  path.join(__dirname, 'node_modules'),
  path.join(__dirname, 'website-mirror', 'node_modules'),
  path.join(__dirname, '..', 'node_modules')
);

const express = require('express');
const axios = require('axios');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

const CrawlerCluster = require('./lib/crawler-cluster');

const app = express();
const PORT = 4000;
const MIRRORS = path.join(__dirname, 'mirrors');
if (!fs.existsSync(MIRRORS)) fs.mkdirSync(MIRRORS, { recursive: true });

const USER_EXPORT_DIR = path.join(os.homedir(), 'Downloads', 'Compressed', 'Copy Website');
if (!fs.existsSync(USER_EXPORT_DIR)) fs.mkdirSync(USER_EXPORT_DIR, { recursive: true });

const jobs = {};

app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// EMBEDDED SINGLE-FILE UI DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
const EMBEDDED_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Website Cloner & Mirror — Framer, Webflow & Modern Web Engine</title>
  <meta name="description" content="Ultra-fidelity website cloner for Framer, Webflow, Next.js, and modern dynamic web apps with ES module resolution, responsive multi-breakpoint capture, and offline ZIP export.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg:           #07070d;
      --bg-card:      rgba(255,255,255,0.04);
      --bg-card-hi:   rgba(255,255,255,0.07);
      --bg-input:     rgba(255,255,255,0.055);
      --border:       rgba(255,255,255,0.08);
      --border-hi:    rgba(255,255,255,0.18);
      --text:         #f2f2fa;
      --text-2:       #a2a2bc;
      --text-3:       rgba(162,162,188,0.55);
      --accent:       #7c6fff;
      --accent-2:     #a78bfa;
      --accent-3:     #34d399;
      --danger:       #f87171;
      --warn:         #fbbf24;
      --grad:         linear-gradient(135deg, #7c6fff, #a78bfa);
      --grad-green:   linear-gradient(135deg, #34d399, #059669);
      --glow:         rgba(124,111,255,0.22);
      --font:         'Inter', system-ui, sans-serif;
      --mono:         'JetBrains Mono', monospace;
      --r-sm:         8px;
      --r:            14px;
      --r-xl:         22px;
      --t:            0.18s cubic-bezier(0.4,0,0.2,1);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }

    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    body::before {
      content: '';
      position: fixed; inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
      pointer-events: none;
      z-index: 0;
    }

    .orbs { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
    .orb  { position: absolute; border-radius: 50%; filter: blur(95px); animation: float 24s ease-in-out infinite; }
    .orb-1 { width:650px;height:650px;background:radial-gradient(#2f1e82,transparent 70%);top:-220px;left:-220px; }
    .orb-2 { width:520px;height:520px;background:radial-gradient(#1c0c52,transparent 70%);bottom:-160px;right:-160px;animation-delay:-8s; }
    .orb-3 { width:380px;height:380px;background:radial-gradient(#083020,transparent 70%);top:42%;left:60%;animation-delay:-16s; }
    @keyframes float { 0%,100%{transform:translate(0,0)} 33%{transform:translate(28px,-22px)} 66%{transform:translate(-20px,26px)} }

    .wrap { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; padding: 0 28px; }

    header { padding: 32px 0 0; display: flex; align-items: center; justify-content: space-between; }
    .logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
    .logo-icon {
      width: 40px; height: 40px; background: var(--grad); border-radius: 12px;
      display: flex; align-items: center; justify-content: center; color: white;
      box-shadow: 0 4px 18px var(--glow);
    }
    .logo-name { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
    .logo-name span { background: var(--grad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }

    .header-badge {
      font-size: 11.5px; font-weight: 600; color: var(--accent-3);
      background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.2);
      border-radius: 999px; padding: 5px 14px; display: flex; align-items: center; gap: 6px;
    }
    .live-dot { width:6px;height:6px;background:var(--accent-3);border-radius:50%;animation:pulse 1.8s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }

    .hero { padding: 50px 0 36px; text-align: center; }
    .hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600;
      color: var(--accent-2); letter-spacing: 0.07em; text-transform: uppercase;
      background: rgba(124,111,255,0.1); border: 1px solid rgba(124,111,255,0.2);
      border-radius: 999px; padding: 5px 14px; margin-bottom: 20px;
    }
    .hero-title { font-size: clamp(34px, 5.5vw, 56px); font-weight: 800; letter-spacing: -0.04em; line-height: 1.1; margin-bottom: 14px; }
    .hero-title .grad { background: var(--grad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .hero-sub { font-size: 15.5px; color: var(--text-2); line-height: 1.65; max-width: 680px; margin: 0 auto 30px; }

    .mirror-card {
      background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--r-xl);
      padding: 26px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.02), 0 24px 60px rgba(0,0,0,0.45);
      transition: border-color var(--t);
    }
    .mirror-card:focus-within { border-color: rgba(124,111,255,0.35); }

    .input-label { font-size: 11.5px; font-weight: 600; color: var(--text-3); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 10px; }
    .url-row {
      display: flex; align-items: center; background: var(--bg-input);
      border: 1.5px solid var(--border); border-radius: var(--r); padding: 0 10px 0 14px; gap: 10px;
      transition: border-color var(--t), box-shadow var(--t); margin-bottom: 16px;
    }
    .url-row:focus-within { border-color: rgba(124,111,255,0.55); box-shadow: 0 0 0 3px rgba(124,111,255,0.12); }
    .url-icon { color: var(--text-3); flex-shrink: 0; }
    #url-input { flex: 1; background: none; border: none; outline: none; color: var(--text); font-family: var(--mono); font-size: 14px; padding: 15px 0; min-width: 0; }
    #url-input::placeholder { color: var(--text-3); }

    .options-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px; margin-bottom: 18px; padding-top: 4px;
    }
    .opt-box {
      background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: var(--r-sm);
      padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px;
    }
    .opt-box-left { display: flex; flex-direction: column; gap: 2px; }
    .opt-box-title { font-size: 12.5px; font-weight: 600; color: var(--text); }
    .opt-box-sub { font-size: 11px; color: var(--text-3); }
    .opt-input {
      background: var(--bg-input); border: 1px solid var(--border-hi); border-radius: 6px;
      color: var(--text); font-family: var(--mono); font-size: 12.5px; padding: 5px 8px; width: 75px; text-align: center; outline: none;
    }
    .opt-input:focus { border-color: var(--accent); }
    .toggle-check { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; }

    .mirror-btn {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;
      background: var(--grad); border: none; border-radius: var(--r); color: white;
      font-family: var(--font); font-size: 15.5px; font-weight: 700; padding: 15px 24px; cursor: pointer;
      letter-spacing: -0.01em; transition: box-shadow var(--t), transform var(--t), opacity var(--t);
      box-shadow: 0 4px 22px var(--glow); position: relative; overflow: hidden;
    }
    .mirror-btn:hover { box-shadow: 0 6px 30px rgba(124,111,255,0.5); transform: translateY(-1px); }
    .mirror-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; box-shadow: none !important; }

    .suggestions { display: flex; align-items: center; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
    .sug-label { font-size: 12px; color: var(--text-3); }
    .chip {
      background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 999px;
      color: var(--text-2); font-family: var(--mono); font-size: 11.5px; padding: 4px 12px; cursor: pointer;
      transition: background var(--t), border-color var(--t), color var(--t);
    }
    .chip:hover { background: rgba(124,111,255,0.12); border-color: rgba(124,111,255,0.3); color: var(--accent-2); }

    .progress-panel {
      background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--r-xl);
      padding: 24px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); margin-top: 20px;
      animation: slideIn .3s ease;
    }
    @keyframes slideIn { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }

    .progress-top { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:16px; }
    .progress-status { display:flex; align-items:center; gap:12px; }
    .pulse-dot { width:11px;height:11px;border-radius:50%;background:var(--accent);flex-shrink:0;animation:pulse 1.5s ease-in-out infinite; }
    .pulse-dot.done { background:var(--accent-3); animation:none; }
    .pulse-dot.error { background:var(--danger); animation:none; }
    .status-title { font-size:15px; font-weight:600; }
    .status-url { font-size:12px; color:var(--text-2); font-family:var(--mono); margin-top:2px; word-break:break-all; }

    .stats-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
    .stat-box { background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 12px 14px; text-align: center; }
    .stat-num { font-family: var(--mono); font-size: 26px; font-weight: 700; line-height: 1; }
    .stat-num.pages { color: var(--accent-2); }
    .stat-num.disc { color: var(--warn); }
    .stat-num.assets { color: var(--accent-3); }
    .stat-lbl { font-size: 11px; color: var(--text-3); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; }

    .bar-track { background: rgba(255,255,255,0.06); border-radius:999px; height:5px; overflow:hidden; margin-bottom:14px; }
    .bar { height:100%; border-radius:999px; background:var(--grad); width:0%; transition:width .4s ease; }
    .bar.indeterminate { width:35%; animation: indeterminate 1.6s ease-in-out infinite; }
    @keyframes indeterminate { 0%{margin-left:-35%} 100%{margin-left:100%} }

    .terminal {
      background: #020208; border: 1px solid rgba(255,255,255,0.06); border-radius: var(--r);
      padding: 14px 16px; height: 210px; overflow-y: auto; font-family: var(--mono);
      font-size: 12px; line-height: 1.7; color: #8892a4;
    }
    .terminal::-webkit-scrollbar { width: 5px; }
    .terminal::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
    .log-info { color: #8892a4; }
    .log-success { color: #4ade80; }
    .log-warn { color: #fbbf24; }
    .log-error { color: #f87171; }

    /* ════ PREVIEW STUDIO ════ */
    .preview-studio {
      margin-top: 24px;
      background: #0a0a14;
      border: 1px solid var(--border-hi);
      border-radius: var(--r-xl);
      overflow: hidden;
      box-shadow: 0 30px 80px rgba(0,0,0,0.65);
      animation: slideIn .4s ease;
    }

    .studio-header {
      background: #05050b;
      border-bottom: 1px solid var(--border);
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }

    .studio-title-group { display: flex; align-items: center; gap: 10px; }
    .fidelity-badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(52,211,153,0.15); border: 1px solid rgba(52,211,153,0.3);
      color: var(--accent-3); font-size: 11.5px; font-weight: 700;
      padding: 4px 10px; border-radius: 999px; letter-spacing: 0.02em;
    }

    .device-switcher {
      display: flex; align-items: center; background: rgba(255,255,255,0.06);
      border: 1px solid var(--border); border-radius: var(--r-sm); padding: 2px;
      gap: 2px;
    }

    .dev-btn {
      background: none; border: none; color: var(--text-2); font-size: 12px; font-weight: 600;
      padding: 6px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px;
      transition: background var(--t), color var(--t); font-family: var(--font);
    }
    .dev-btn:hover { color: var(--text); }
    .dev-btn.active { background: var(--accent); color: white; box-shadow: 0 2px 8px var(--glow); }

    .page-selector-group { display: flex; align-items: center; gap: 8px; }
    .page-select {
      background: rgba(255,255,255,0.08); border: 1px solid var(--border-hi);
      color: var(--text); font-family: var(--mono); font-size: 12px;
      padding: 6px 12px; border-radius: var(--r-sm); outline: none; cursor: pointer;
      max-width: 320px;
    }
    .page-select option { background: #0b0b16; color: #fff; }

    .mode-switcher {
      display: flex; background: rgba(255,255,255,0.05); border: 1px solid var(--border);
      border-radius: var(--r-sm); padding: 2px;
    }
    .mode-btn {
      background: none; border: none; color: var(--text-2); font-size: 12px; font-weight: 600;
      padding: 5px 12px; border-radius: 6px; cursor: pointer; transition: background var(--t), color var(--t);
    }
    .mode-btn.active { background: rgba(255,255,255,0.14); color: white; }

    .studio-viewport {
      background: #020205;
      padding: 20px 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 600px;
      overflow-x: auto;
    }

    .frame-container {
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.1);
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      width: 100%;
      height: 620px;
    }

    #preview-frame {
      width: 100%;
      height: 100%;
      border: none;
      background: white;
    }

    .studio-footer {
      background: #05050b;
      border-top: 1px solid var(--border);
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 14px;
    }

    .dest-hint { font-size: 12px; color: var(--text-3); font-family: var(--mono); }
    .dest-hint span { color: var(--accent-3); font-weight: 600; }

    .studio-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

    .btn-download {
      display: inline-flex; align-items: center; gap: 8px;
      background: var(--grad-green); color: white; font-family: var(--font);
      font-size: 14px; font-weight: 700; padding: 10px 20px; border-radius: var(--r);
      text-decoration: none; border: none; cursor: pointer; transition: box-shadow var(--t), transform var(--t);
      box-shadow: 0 4px 16px rgba(52,211,153,0.3);
    }
    .btn-download:hover { box-shadow: 0 6px 24px rgba(52,211,153,0.5); transform: translateY(-1px); }

    .btn-open-folder {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(255,255,255,0.08); border: 1px solid var(--border-hi);
      color: var(--text); font-family: var(--font); font-size: 13.5px; font-weight: 600;
      padding: 10px 18px; border-radius: var(--r); cursor: pointer;
      transition: background var(--t), border-color var(--t);
    }
    .btn-open-folder:hover { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); }

    .btn-new-tab {
      display: inline-flex; align-items: center; gap: 6px;
      background: none; border: 1px solid var(--border); color: var(--text-2);
      font-size: 13px; font-weight: 600; padding: 10px 14px; border-radius: var(--r);
      text-decoration: none; cursor: pointer; transition: color var(--t), border-color var(--t);
    }
    .btn-new-tab:hover { color: white; border-color: var(--border-hi); }

    .history-section { margin-top: 40px; margin-bottom: 60px; }
    .history-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .section-title { font-size: 13px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.07em; }
    .btn-clear-history {
      font-size: 11.5px; font-weight: 600; color: var(--danger); background: rgba(248,113,113,0.1);
      border: 1px solid rgba(248,113,113,0.25); border-radius: 6px; padding: 4px 10px; cursor: pointer;
      transition: background var(--t), border-color var(--t);
    }
    .btn-clear-history:hover { background: rgba(248,113,113,0.2); }
    .history-grid { display: flex; flex-direction: column; gap: 8px; }
    .history-card {
      background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--r);
      padding: 14px 16px; display: flex; align-items: center; gap: 14px; text-decoration: none;
      transition: background var(--t), border-color var(--t);
    }
    .history-card:hover { background: var(--bg-card-hi); border-color: var(--border-hi); }
    .hc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .hc-dot.done { background: var(--accent-3); }
    .hc-dot.error { background: var(--danger); }
    .hc-dot.running { background: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
    .hc-info { flex: 1; min-width: 0; }
    .hc-domain { font-size: 13.5px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hc-meta { font-size: 11.5px; color: var(--text-3); margin-top: 2px; font-family: var(--mono); }
    .hc-open {
      font-size: 12px; font-weight: 600; color: var(--accent-2); background: rgba(124,111,255,0.1);
      border: 1px solid rgba(124,111,255,0.2); border-radius: 6px; padding: 4px 10px; white-space: nowrap;
    }

    [hidden] { display: none !important; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
  </style>
</head>
<body>
<div class="orbs">
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
</div>

<div class="wrap">
  <header>
    <a href="/" class="logo">
      <div class="logo-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15H9V8h2v9zm4 0h-2V8h2v9z" opacity=".3"/>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
          <path d="M9 8h2v9H9zm4 0h2v9h-2z"/>
        </svg>
      </div>
      <span class="logo-name">Website<span>Mirror</span></span>
    </a>
    <div class="header-badge">
      <div class="live-dot"></div>
      Framer & Modern Web 100% Engine
    </div>
  </header>

  <section class="hero">
    <div class="hero-eyebrow">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
      Framer, Webflow & Modern Web Cloner
    </div>
    <h1 class="hero-title">
      Clone every single page.<br>
      <span class="grad">100% Complete Assets & Offline ZIP.</span>
    </h1>
    <p class="hero-sub">
      Recursively resolves Framer ES modules, Webflow IX2 interactions, dynamic SPA routes, fonts, and media — producing an identical offline replica.
    </p>
  </section>

  <!-- Mirror Card -->
  <div class="mirror-card" id="mirror-card">
    <div class="input-label">Website URL to clone completely</div>
    <div class="url-row" id="url-row">
      <span class="url-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      </span>
      <input
        id="url-input"
        type="url"
        placeholder="https://example.framer.ai or https://example.com"
        autocomplete="off" autocorrect="off" spellcheck="false"
      >
    </div>

    <!-- Enhanced Crawler Options -->
    <div class="options-grid">
      <div class="opt-box">
        <div class="opt-box-left">
          <span class="opt-box-title">Max Pages Limit</span>
          <span class="opt-box-sub">Pages to crawl</span>
        </div>
        <input type="number" class="opt-input" id="max-pages" value="1000" min="1" max="5000">
      </div>

      <div class="opt-box">
        <div class="opt-box-left">
          <span class="opt-box-title">Concurrent Workers</span>
          <span class="opt-box-sub">Parallel crawler tabs</span>
        </div>
        <input type="number" class="opt-input" id="concurrency" value="3" min="1" max="6">
      </div>

      <div class="opt-box">
        <div class="opt-box-left">
          <span class="opt-box-title">Deep Menu Trigger</span>
          <span class="opt-box-sub">Expand nav/tabs for hidden links</span>
        </div>
        <input type="checkbox" class="toggle-check" id="deep-interact" checked>
      </div>

      <div class="opt-box">
        <div class="opt-box-left">
          <span class="opt-box-title">Include Subdomains</span>
          <span class="opt-box-sub">Crawl www & lang subdomains</span>
        </div>
        <input type="checkbox" class="toggle-check" id="include-subdomains" checked>
      </div>
    </div>

    <button class="mirror-btn" id="mirror-btn">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M13 7h-2v5l4.28 2.54.72-1.21-3-1.79z"/>
      </svg>
      <span id="mirror-btn-text">Start 100% Comprehensive Clone</span>
    </button>

    <div class="suggestions">
      <span class="sug-label">Try:</span>
      <span class="chip" data-url="https://asdasdsaaer.framer.ai">asdasdsaaer.framer.ai (Framer)</span>
      <span class="chip" data-url="https://designizy.webflow.io">designizy.webflow.io (Webflow)</span>
      <span class="chip" data-url="https://nuestudio-nextjs.vercel.app">nuestudio-nextjs.vercel.app (Next.js)</span>
    </div>
  </div>

  <!-- Progress panel -->
  <div class="progress-panel" id="progress-panel" hidden>
    <div class="progress-top">
      <div class="progress-status">
        <div class="pulse-dot" id="pulse-dot"></div>
        <div>
          <div class="status-title" id="status-title">Initializing deep scanner…</div>
          <div class="status-url" id="status-url"></div>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-strip">
      <div class="stat-box">
        <div class="stat-num pages" id="stat-pages">0</div>
        <div class="stat-lbl">Pages Mirrored</div>
      </div>
      <div class="stat-box">
        <div class="stat-num disc" id="stat-discovered">0</div>
        <div class="stat-lbl">Routes Discovered</div>
      </div>
      <div class="stat-box">
        <div class="stat-num assets" id="stat-assets">0</div>
        <div class="stat-lbl">Assets Saved</div>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="bar-track"><div class="bar indeterminate" id="progress-bar"></div></div>

    <!-- Terminal log -->
    <div class="terminal" id="terminal">
      <div class="log-info">▶ Ready to mirror…</div>
    </div>
  </div>

  <!-- PREVIEW STUDIO -->
  <div class="preview-studio" id="preview-studio" hidden>
    <div class="studio-header">
      <div class="studio-title-group">
        <div class="fidelity-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          100% Cloned · Interactive Live Preview
        </div>
        <div class="mode-switcher">
          <button class="mode-btn active" id="mode-cloned-btn">Cloned Preview</button>
          <button class="mode-btn" id="mode-orig-btn">Original Site</button>
        </div>
      </div>

      <div class="device-switcher">
        <button class="dev-btn active" data-width="100%" title="Desktop View">🖥️ Desktop</button>
        <button class="dev-btn" data-width="1200px" title="Laptop View">💻 Laptop</button>
        <button class="dev-btn" data-width="768px" title="Tablet View">📱 Tablet</button>
        <button class="dev-btn" data-width="375px" title="Mobile View">📱 Mobile</button>
      </div>

      <div class="page-selector-group">
        <label style="font-size:12px;color:var(--text-3);font-weight:600;">Page:</label>
        <select class="page-select" id="page-select">
          <option value="/">/ (Homepage)</option>
        </select>
      </div>
    </div>

    <div class="studio-viewport">
      <div class="frame-container" id="frame-container">
        <iframe id="preview-frame" src="about:blank"></iframe>
      </div>
    </div>

    <div class="studio-footer">
      <div>
        <div style="font-size:14px;font-weight:700;margin-bottom:2px;" id="preview-domain-text">Website Cloned</div>
        <div class="dest-hint">Saved to: <span>C:\\Users\\jamil\\Downloads\\Compressed\\Copy Website\\</span></div>
      </div>
      <div class="studio-actions">
        <a class="btn-download" id="studio-download-btn" href="#">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3a1 1 0 0 1 1 1v8.585l2.293-2.292a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L11 12.585V4a1 1 0 0 1 1-1Z"/>
            <path d="M4 15a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2a1 1 0 1 1 2 0v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2a1 1 0 0 1 1-1Z"/>
          </svg>
          Download Multi-Page ZIP
        </a>
        <button class="btn-open-folder" id="btn-open-folder">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Open Saved Folder
        </button>
        <a class="btn-new-tab" id="studio-newtab-btn" href="#" target="_blank">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/></svg>
          Open Full Tab
        </a>
      </div>
    </div>
  </div>

  <section class="history-section">
    <div class="history-header">
      <div class="section-title">Recent Mirrors</div>
      <button class="btn-clear-history" id="btn-clear-history" title="Delete all cloned websites and reset history">Clear All Clones</button>
    </div>
    <div class="history-grid" id="history-grid">
      <div style="font-size:13px;color:var(--text-3);padding:16px 0;">Loading recent mirrors…</div>
    </div>
  </section>
</div>

<script>
const urlInput          = document.getElementById('url-input');
const maxPagesInput     = document.getElementById('max-pages');
const concurrencyInput  = document.getElementById('concurrency');
const deepInteractInput = document.getElementById('deep-interact');
const subdomainsInput   = document.getElementById('include-subdomains');
const mirrorBtn         = document.getElementById('mirror-btn');
const mirrorBtnTxt      = document.getElementById('mirror-btn-text');
const progressPanel     = document.getElementById('progress-panel');
const statusTitle       = document.getElementById('status-title');
const statusUrl         = document.getElementById('status-url');
const pulseDot          = document.getElementById('pulse-dot');
const statPages         = document.getElementById('stat-pages');
const statDisc          = document.getElementById('stat-discovered');
const statAssets        = document.getElementById('stat-assets');
const progressBar       = document.getElementById('progress-bar');
const terminal          = document.getElementById('terminal');
const historyGrid       = document.getElementById('history-grid');

const previewStudio     = document.getElementById('preview-studio');
const previewFrame      = document.getElementById('preview-frame');
const frameContainer    = document.getElementById('frame-container');
const pageSelect        = document.getElementById('page-select');
const studioDownloadBtn = document.getElementById('studio-download-btn');
const studioNewTabBtn   = document.getElementById('studio-newtab-btn');
const btnOpenFolder     = document.getElementById('btn-open-folder');
const previewDomainText = document.getElementById('preview-domain-text');
const modeClonedBtn     = document.getElementById('mode-cloned-btn');
const modeOrigBtn       = document.getElementById('mode-orig-btn');

let currentSafeDir = '';
let currentOriginalUrl = '';
let currentMode = 'cloned';

document.querySelectorAll('.dev-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dev-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    frameContainer.style.width = btn.dataset.width;
  });
});

pageSelect.addEventListener('change', () => {
  updatePreviewUrl(pageSelect.value);
});

modeClonedBtn.addEventListener('click', () => {
  currentMode = 'cloned';
  modeClonedBtn.classList.add('active');
  modeOrigBtn.classList.remove('active');
  updatePreviewUrl(pageSelect.value);
});

modeOrigBtn.addEventListener('click', () => {
  currentMode = 'original';
  modeOrigBtn.classList.add('active');
  modeClonedBtn.classList.remove('active');
  updatePreviewUrl(pageSelect.value);
});

function updatePreviewUrl(pagePath = '/') {
  if (currentMode === 'cloned') {
    const cleanPath = pagePath.startsWith('/') ? pagePath : '/' + pagePath;
    const finalUrl = \`/mirror/\${currentSafeDir}\${cleanPath.endsWith('/') || cleanPath.includes('.') ? cleanPath : cleanPath + '/'}\`;
    previewFrame.src = finalUrl;
    studioNewTabBtn.href = finalUrl;
  } else {
    try {
      const origBase = new URL(currentOriginalUrl).origin;
      const cleanPath = pagePath.startsWith('/') ? pagePath : '/' + pagePath;
      const finalUrl = origBase + cleanPath;
      previewFrame.src = finalUrl;
      studioNewTabBtn.href = finalUrl;
    } catch {
      previewFrame.src = currentOriginalUrl;
    }
  }
}

btnOpenFolder.addEventListener('click', async () => {
  try { await fetch('/api/open-folder', { method: 'POST' }); } catch {}
});

let historyStore = [];

async function loadHistory() {
  try {
    const r = await fetch('/api/jobs');
    if (r.ok) {
      historyStore = await r.json();
      renderHistory();
    }
  } catch {}
}

function renderHistory() {
  if (!historyStore.length) {
    historyGrid.innerHTML = '<div style="font-size:13px;color:var(--text-3);padding:16px 0;">No mirrors yet — start your first one above.</div>';
    return;
  }
  historyGrid.innerHTML = historyStore.slice(0, 15).map(h => \`
    <a class="history-card" href="/mirror/\${h.safeDir}/" target="_blank" rel="noopener">
      <div class="hc-dot \${h.status}"></div>
      <div class="hc-info">
        <div class="hc-domain">\${h.domain}</div>
        <div class="hc-meta">\${h.pages} pages · \${h.assets} assets · \${h.status}</div>
      </div>
      \${h.status === 'done' ? \`<span class="hc-open">Preview →</span>\` : ''}
    </a>
  \`).join('');
}

loadHistory();

const btnClearHistory = document.getElementById('btn-clear-history');
if (btnClearHistory) {
  btnClearHistory.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clean all cloned website data and history?')) return;
    try {
      const res = await fetch('/api/clear-history', { method: 'POST' });
      if (res.ok) {
        historyStore = [];
        renderHistory();
      }
    } catch (err) {
      alert('Error clearing data: ' + err.message);
    }
  });
}

document.querySelectorAll('.chip').forEach(c => {
  c.addEventListener('click', () => {
    urlInput.value = c.dataset.url;
    urlInput.focus();
  });
});

urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') startMirror(); });
mirrorBtn.addEventListener('click', startMirror);

async function startMirror() {
  let rawUrl = urlInput.value.trim();
  if (!rawUrl) { shake(document.getElementById('url-row')); return; }
  if (!rawUrl.startsWith('http')) rawUrl = 'https://' + rawUrl;
  try { new URL(rawUrl); } catch { shake(document.getElementById('url-row')); return; }

  const maxPages = parseInt(maxPagesInput.value) || 1000;
  const concurrency = parseInt(concurrencyInput.value) || 3;
  const deepInteract = deepInteractInput.checked;
  const includeSubdomains = subdomainsInput.checked;

  terminal.innerHTML = '';
  statPages.textContent  = '0';
  statDisc.textContent   = '0';
  statAssets.textContent = '0';
  progressBar.className  = 'bar indeterminate';
  progressBar.style.width = '';
  pulseDot.className     = 'pulse-dot';
  statusTitle.textContent = 'Scanning routes & sitemaps…';
  statusUrl.textContent   = rawUrl;

  progressPanel.hidden = false;
  previewStudio.hidden = true;
  mirrorBtn.disabled   = true;
  mirrorBtnTxt.textContent = 'Mirroring in progress…';

  appendLog(\`▶ Starting deep mirror: \${rawUrl}\`);

  let jobId, safeDir, domain;
  try {
    const resp = await fetch('/api/mirror', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: rawUrl, maxPages, concurrency, deepInteract, includeSubdomains }),
    });
    if (!resp.ok) throw new Error('Server error ' + resp.status);
    const data = await resp.json();
    jobId   = data.jobId;
    safeDir = data.safeDir;
    domain  = data.domain;
    currentSafeDir = safeDir;
    currentOriginalUrl = rawUrl;
    statusTitle.textContent = \`Mirroring \${domain}…\`;
    historyStore.unshift({ domain, safeDir, status: 'running', pages: 0, assets: 0 });
    renderHistory();
  } catch (err) {
    appendLog('❌ ' + err.message, 'error');
    mirrorBtn.disabled = false;
    mirrorBtnTxt.textContent = 'Start Mirroring';
    return;
  }

  const evtSrc = new EventSource('/api/progress/' + jobId);

  evtSrc.onmessage = (e) => {
    const data = JSON.parse(e.data);

    if (data.type === 'DONE') {
      evtSrc.close();
      progressBar.className = 'bar';
      progressBar.style.width = '100%';
      mirrorBtn.disabled = false;
      mirrorBtnTxt.textContent = 'Start 100% Comprehensive Clone';

      const pages  = data.pages  || parseInt(statPages.textContent)  || 0;
      const assets = data.assets || parseInt(statAssets.textContent) || 0;

      const h = historyStore.find(h => h.safeDir === safeDir);
      if (h) { h.status = data.status; h.pages = pages; h.assets = assets; }
      renderHistory();

      if (data.status === 'done') {
        pulseDot.className     = 'pulse-dot done';
        statusTitle.textContent = '100% Mirror Complete & Ready!';

        currentSafeDir = data.safeDir || safeDir;
        currentOriginalUrl = data.originalUrl || rawUrl;
        previewDomainText.textContent = \`\${data.domain || domain} (\${pages} pages · \${assets} assets)\`;
        studioDownloadBtn.href = \`/api/download/\${data.safeDir || safeDir}\`;

        pageSelect.innerHTML = '';
        if (data.pagesList && data.pagesList.length) {
          data.pagesList.forEach(p => {
            try {
              const u = new URL(p.url);
              const opt = document.createElement('option');
              const pathDisplay = (u.pathname || '/') + (u.search || '');
              opt.value = pathDisplay;
              opt.textContent = \`\${pathDisplay} (\${p.status === 'ok' ? '✓' : 'x'})\`;
              pageSelect.appendChild(opt);
            } catch {}
          });
        } else {
          pageSelect.innerHTML = \`<option value="/">/ (Homepage)</option>\`;
        }

        updatePreviewUrl(pageSelect.value || '/');
        previewStudio.hidden = false;
        previewStudio.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        pulseDot.className     = 'pulse-dot error';
        statusTitle.textContent = 'Mirror finished with warnings';
      }
      return;
    }

    if (data.type === 'progress') {
      if (data.pages      !== undefined) statPages.textContent  = data.pages;
      if (data.discovered !== undefined) statDisc.textContent   = data.discovered;
      if (data.assets     !== undefined) statAssets.textContent = data.assets;
      if (data.discovered > 0 && data.pages >= 0) {
        const pct = Math.min((data.pages / Math.max(data.discovered, 1)) * 95, 95);
        progressBar.className = 'bar';
        progressBar.style.width = pct + '%';
      }
      return;
    }

    if (data.message) {
      appendLog(data.message, data.type || 'info');
    }
  };

  evtSrc.onerror = () => {
    evtSrc.close();
    appendLog('⚠️ Stream connection closed.', 'info');
  };
}

function appendLog(msg, type = 'info') {
  const div = document.createElement('div');
  div.className = 'log-' + type;
  div.textContent = msg;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

function shake(el) {
  el.style.animation = 'none'; el.offsetHeight;
  el.style.animation = 'shake .35s ease';
  el.addEventListener('animationend', () => el.style.animation = '', { once: true });
}

const ss = document.createElement('style');
ss.textContent = '@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}';
document.head.appendChild(ss);
</script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(EMBEDDED_HTML);
});

app.get('/index.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(EMBEDDED_HTML);
});

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Mirror Server with Transparent Fallback & On-Demand Proxy
// ─────────────────────────────────────────────────────────────────────────────
app.use('/mirror', async (req, res, next) => {
  const parts = req.path.replace(/^\//, '').split('/');
  const safeDir = parts[0];
  if (!safeDir) return next();

  const mirrorDir = path.join(MIRRORS, safeDir);
  if (!fs.existsSync(mirrorDir)) return next();

  const manifestPath = path.join(mirrorDir, '_manifest.json');
  let manifest = { origin: '', assetMap: {} };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {}
  }

  const subPath = parts.slice(1).join('/');
  const ext = path.extname(subPath).toLowerCase();
  const isStaticFile = !!ext && !['.html', '.htm'].includes(ext);

  const candidates = [
    path.join(mirrorDir, subPath),
    path.join(mirrorDir, '_assets', subPath),
    path.join(mirrorDir, '_assets', path.basename(subPath)),
    path.join(mirrorDir, subPath, 'index.html'),
    path.join(mirrorDir, subPath + '.html'),
    path.join(mirrorDir, subPath + '/index.html'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      const fileExt = path.extname(c).toLowerCase();
      let ct = mime.lookup(fileExt) || (fileExt === '.js' || fileExt === '.mjs' ? 'application/javascript' : 'application/octet-stream');

      // Sniff .bin files to serve the correct MIME type
      if (fileExt === '.bin' || ct === 'application/octet-stream') {
        try {
          const buf = fs.readFileSync(c);
          const head = buf.slice(0, Math.min(512, buf.length)).toString('utf8');
          if (/^\s*(["']use strict|import\s|export\s|const\s|let\s|var\s|function\s|class\s|window\.|document\.|module\.|\/\*|\/\/|\(\s*function|\(\s*\(\))/m.test(head)) {
            ct = 'application/javascript';
          } else if (/^\s*(\{|\[)/.test(head)) {
            ct = 'application/json';
          } else if (/^\s*(@charset|@import|@font-face|@media|:root|html\s*\{|body\s*\{)/m.test(head)) {
            ct = 'text/css';
          } else if (/^\s*(<!doctype|<html|<head|<body)/i.test(head)) {
            ct = 'text/html; charset=utf-8';
          }
        } catch {}
      }

      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.sendFile(c);
    }
  }

  // Transparent Fallback Proxy for Framer/Webflow dynamic chunks
  if (subPath) {
    const proxyTargets = [];
    if (manifest.origin) {
      if (subPath.startsWith('http')) {
        proxyTargets.push(subPath);
      } else {
        proxyTargets.push(new URL(subPath, manifest.origin).href);
      }
    }
    // Also try Framer CDN endpoints if on a Framer site
    if (subPath.includes('.js') || subPath.includes('.mjs')) {
      proxyTargets.push(`https://framerusercontent.com/modules/${path.basename(subPath)}`);
      proxyTargets.push(`https://framerusercontent.com/${subPath}`);
    } else if (isStaticFile) {
      proxyTargets.push(`https://framerusercontent.com/images/${path.basename(subPath)}`);
      proxyTargets.push(`https://framerusercontent.com/assets/${path.basename(subPath)}`);
    }

    for (const targetUrl of proxyTargets) {
      try {
        const resp = await axios.get(targetUrl, {
          responseType: 'arraybuffer',
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          validateStatus: (s) => s < 400,
        });

        if (resp.status < 400 && resp.data) {
          const ct = resp.headers['content-type'] || mime.lookup(ext) || 'application/octet-stream';
          res.setHeader('Content-Type', ct);
          const cachedFile = path.join(mirrorDir, '_assets', path.basename(subPath));
          fs.writeFileSync(cachedFile, Buffer.from(resp.data));
          return res.send(Buffer.from(resp.data));
        }
      } catch {}
    }
  }

  // If a script or stylesheet wasn't found, do not return index.html (which breaks strict MIME type checking)
  if (isStaticFile) {
    if (ext === '.js' || ext === '.mjs') {
      res.setHeader('Content-Type', 'application/javascript');
      return res.send('/* Fallback empty module */\nexport default {};');
    }
    return res.status(404).send('Asset not found');
  }

  const rootIndex = path.join(mirrorDir, 'index.html');
  if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }

  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/mirror — Start Full Carbon-Copy Mirror Job
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/mirror', (req, res) => {
  const {
    url: targetUrl,
    maxPages = 1000,
    concurrency = 3,
    deepInteract = true,
    includeSubdomains = true,
  } = req.body;

  if (!targetUrl) return res.status(400).json({ error: 'url required' });

  let parsed;
  try {
    parsed = new URL(targetUrl.startsWith('http') ? targetUrl : 'https://' + targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const jobId = uuidv4();
  const domain = parsed.hostname.replace(/^www\./, '');
  const shortId = jobId.slice(0, 6);
  const safeDir = `${domain.replace(/[^a-z0-9.-]/gi, '_')}_${shortId}`;
  const mirrorDir = path.join(MIRRORS, safeDir);
  const mirrorBase = `/mirror/${safeDir}`;

  fs.mkdirSync(mirrorDir, { recursive: true });

  const job = {
    id: jobId,
    url: parsed.href,
    domain,
    safeDir,
    mirrorDir,
    mirrorBase,
    status: 'running',
    startTime: Date.now(),
    pages: [],
    discovered: 0,
    assets: 0,
    logs: [],
    _pending: [],
  };

  jobs[jobId] = job;

  const cluster = new CrawlerCluster(
    {
      url: parsed.href,
      maxPages,
      concurrency,
      deepInteract,
      includeSubdomains,
      mirrorDir,
      userExportDir: USER_EXPORT_DIR,
      jobId,
    },
    (message, type = 'info') => {
      const e = { type, message, ts: Date.now() };
      job.logs.push(e);
      job._pending.push(e);
      console.log(`[${jobId.slice(0, 6)}] ${message}`);
    },
    (progress) => {
      job.discovered = progress.discovered;
      job.assets = progress.assets;
      job._pending.push({
        type: 'progress',
        pages: progress.pages,
        discovered: progress.discovered,
        assets: progress.assets,
      });
    }
  );

  cluster
    .run()
    .then((result) => {
      job.status = 'done';
      job.pages = result.pages;
      job.assets = result.assetsCount;
      job.zipPath = result.zipPath;
      job.userExportPath = result.userExportPath;
    })
    .catch((err) => {
      job.status = 'error';
      job.logs.push({ type: 'error', message: `Fatal error: ${err.message}`, ts: Date.now() });
      job._pending.push({ type: 'error', message: `Fatal error: ${err.message}`, ts: Date.now() });
    });

  res.json({ jobId, domain, safeDir });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/open-folder
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/open-folder', (req, res) => {
  exec(`explorer "${USER_EXPORT_DIR}"`);
  res.json({ ok: true, path: USER_EXPORT_DIR });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/download/:id
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/download/:id', (req, res) => {
  const id = req.params.id;
  let zipPath = null;
  let filename = 'mirror.zip';

  if (jobs[id] && jobs[id].zipPath && fs.existsSync(jobs[id].zipPath)) {
    zipPath = jobs[id].zipPath;
    filename = `${jobs[id].domain}_complete_mirror.zip`;
  } else {
    const candidates = [
      path.join(MIRRORS, `${id}.zip`),
      path.join(MIRRORS, id, `${id}.zip`),
      path.join(USER_EXPORT_DIR, `${id}.zip`),
    ];

    if (fs.existsSync(MIRRORS)) {
      const files = fs.readdirSync(MIRRORS);
      for (const f of files) {
        if (f.endsWith('.zip') && (f.includes(id) || f.startsWith(id))) {
          candidates.push(path.join(MIRRORS, f));
        }
      }
    }

    if (fs.existsSync(USER_EXPORT_DIR)) {
      const files = fs.readdirSync(USER_EXPORT_DIR);
      for (const f of files) {
        if (f.endsWith('.zip') && (f.includes(id) || f.startsWith(id))) {
          candidates.push(path.join(USER_EXPORT_DIR, f));
        }
      }
    }

    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        zipPath = c;
        filename = path.basename(c);
        break;
      }
    }
  }

  if (!zipPath || !fs.existsSync(zipPath)) {
    return res.status(404).send('ZIP archive not ready yet.');
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const stream = fs.createReadStream(zipPath);
  stream.pipe(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/progress/:jobId
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/progress/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (d) => res.write(`data: ${JSON.stringify(d)}\n\n`);
  job.logs.forEach(send);

  const getDonePayload = () => ({
    type: 'DONE',
    status: job.status,
    jobId: req.params.jobId,
    pages: job.pages.length,
    pagesList: job.pages,
    assets: job.assets,
    safeDir: job.safeDir,
    originalUrl: job.url,
    domain: job.domain,
    userExportPath: job.userExportPath,
  });

  if (job.status === 'done' || job.status === 'error') {
    send(getDonePayload());
    return res.end();
  }

  const iv = setInterval(() => {
    job._pending.splice(0).forEach(send);
    if (job.status === 'done' || job.status === 'error') {
      send(getDonePayload());
      clearInterval(iv);
      res.end();
    }
  }, 120);

  req.on('close', () => clearInterval(iv));
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/jobs — Load Active & Historical Mirrors
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/jobs', (_req, res) => {
  const list = Object.values(jobs).map((j) => ({
    id: j.id,
    domain: j.domain,
    safeDir: j.safeDir,
    status: j.status,
    pages: j.pages.length,
    discovered: j.discovered,
    assets: j.assets,
    startTime: j.startTime,
  }));

  if (fs.existsSync(MIRRORS)) {
    const dirs = fs.readdirSync(MIRRORS);
    for (const d of dirs) {
      const fullDir = path.join(MIRRORS, d);
      if (fs.statSync(fullDir).isDirectory()) {
        if (!list.some((item) => item.safeDir === d)) {
          const manifestPath = path.join(fullDir, '_manifest.json');
          let pages = 0;
          let assets = 0;
          let domain = d.split('_')[0];
          if (fs.existsSync(manifestPath)) {
            try {
              const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
              pages = m.pagesCount || (m.pagesList ? m.pagesList.length : 0);
              assets = m.assetsCount || 0;
              if (m.origin) domain = new URL(m.origin).hostname.replace(/^www\./, '');
            } catch {}
          }
          list.push({
            id: d,
            domain,
            safeDir: d,
            status: 'done',
            pages,
            discovered: pages,
            assets,
            startTime: fs.statSync(fullDir).mtimeMs,
          });
        }
      }
    }
  }

  list.sort((a, b) => b.startTime - a.startTime);
  res.json(list);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/clear-history — Delete all cloned websites and reset history
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/clear-history', (req, res) => {
  for (const k of Object.keys(jobs)) {
    delete jobs[k];
  }
  if (fs.existsSync(MIRRORS)) {
    try {
      const files = fs.readdirSync(MIRRORS);
      for (const f of files) {
        fs.rmSync(path.join(MIRRORS, f), { recursive: true, force: true });
      }
    } catch (err) {
      console.error('Error clearing mirrors directory:', err);
    }
  }
  res.json({ ok: true, message: 'All clone data cleared' });
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIp();

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🪞 Carbon-Copy Website Mirror online:`);
    console.log(`   🏠 Local:   http://localhost:${PORT}`);
    console.log(`   🌐 Network: http://${localIp}:${PORT}`);
    console.log(`   📁 Mirrors: ${MIRRORS}`);
    console.log(`   💾 Export:  ${USER_EXPORT_DIR}\n`);
  });
}

module.exports = app;

