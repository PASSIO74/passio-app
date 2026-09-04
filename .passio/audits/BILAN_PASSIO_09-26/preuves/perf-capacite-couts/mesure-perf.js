// Mesures de performance PASSIO — ÉMULATION Chromium (jamais un appareil réel).
// Cible : build de production reproduit (dist minifié comme deploy.yml, servi en
// brotli par http-server -b -g sur 127.0.0.1:8110). Toute requête hors 127.0.0.1
// est ABANDONNÉE (proxy sans issue : jsdelivr/unpkg/supabase/fonts) — donc le SDK
// supabase-js (CDN) et les données serveur ne font PAS partie de la mesure.
// Usage : node mesure-perf.js  → mesures-perf.json (+ soak mémoire 5 min).
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("/home/user/passio-app/node_modules/@playwright/test");
const { GATE_KEY, GATE_TOKEN } = require("/home/user/passio-app/tests/e2e/gate-helper");
const { onboardedState } = require("/home/user/passio-app/tests/e2e/app-helper");

const BASE = "http://127.0.0.1:" + (process.env.PASSIO_PORT || 8110);
const OUT = path.join(__dirname, "mesures-perf.json");
const SOAK_MS = parseInt(process.env.SOAK_MS || "300000", 10);
const RUNS = 3;
const SCENARIOS = [
  { name: "sans_bridage", cpu: 1, net: null },
  { name: "slow3g_cpu4", cpu: 4, net: { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 } },
];

const median = (a) => { const s = a.filter((x) => typeof x === "number" && isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = (x) => (typeof x === "number" ? Math.round(x * 10) / 10 : x);

async function newPage(browser, sc, transfer) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  if (sc.net) await cdp.send("Network.emulateNetworkConditions", sc.net);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: sc.cpu });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    transfer.aborted.push(u.slice(0, 80));
    return route.abort();
  });
  page.on("response", (resp) => {
    try {
      const h = resp.headers();
      const len = parseInt(h["content-length"] || "0", 10);
      transfer.responses.push({ url: resp.url().replace(BASE, ""), status: resp.status(), enc: h["content-encoding"] || "", bytes: len, type: (h["content-type"] || "").split(";")[0] });
    } catch (e) {}
  });
  page.on("pageerror", (e) => transfer.pageErrors.push(String(e.message).slice(0, 160)));
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    window.__perf = { fcp: null, lcp: null, longtasks: [], appReady: null, screenFeedActive: null };
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name === "first-contentful-paint") window.__perf.fcp = e.startTime; })).observe({ type: "paint", buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__perf.lcp = e.startTime; })).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__perf.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]); })).observe({ type: "longtask", buffered: true });
    } catch (e) {}
    window.addEventListener("passio:app-ready", () => { window.__perf.appReady = performance.now(); }, { once: true });
  }, [GATE_KEY, GATE_TOKEN, onboardedState(1)]);
  return { ctx, page, cdp };
}

const raf2 = "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))";

async function measureNav(page, screen) {
  return page.evaluate(async (s) => {
    const t = performance.now();
    goTo(s);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - t;
  }, screen);
}

async function snapshot(page, label) {
  return page.evaluate((label) => {
    const lt = window.__perf.longtasks;
    return {
      label,
      domNodes: document.getElementsByTagName("*").length,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null,
      longtasks_n: lt.length,
      longtasks_total_ms: lt.reduce((a, b) => a + b[1], 0),
      longtasks_max_ms: lt.reduce((a, b) => Math.max(a, b[1]), 0),
    };
  }, label);
}

async function runOnce(browser, sc, idx, doSoak) {
  const transfer = { responses: [], aborted: [], pageErrors: [] };
  const { ctx, page } = await newPage(browser, sc, transfer);
  const res = { scenario: sc.name, run: idx };
  const t0 = Date.now();
  await page.goto(BASE + "/index.html", { waitUntil: "commit" });
  await page.waitForFunction(() => { const el = document.getElementById("screen-feed"); return el && el.classList.contains("active"); }, null, { timeout: 180000 });
  res.screenFeedActive_wall_ms = Date.now() - t0;
  await page.waitForFunction(() => document.querySelector("#feedList .post"), null, { timeout: 180000 }).catch(() => {});
  res.firstFeedCard_wall_ms = Date.now() - t0;
  await page.waitForTimeout(sc.net ? 4000 : 2500);
  Object.assign(res, await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] || {};
    return {
      fcp_ms: window.__perf.fcp, lcp_ms: window.__perf.lcp, appReady_ms: window.__perf.appReady,
      domContentLoaded_ms: nav.domContentLoadedEventEnd || null, load_ms: nav.loadEventEnd || null,
      responseStart_ms: nav.responseStart || null,
    };
  }));
  res.boot = await snapshot(page, "apres_boot");
  res.transfer = {
    requests: transfer.responses.length,
    bytes_total: transfer.responses.reduce((a, b) => a + b.bytes, 0),
    files: transfer.responses.map((r) => r.url.replace(/\?.*$/, "") + " " + r.status + " " + r.enc + " " + r.bytes),
    aborted_external: [...new Set(transfer.aborted.map((u) => u.replace(/^https?:\/\/([^/]+).*/, "$1")))],
  };

  // Navigation entre écrans (jusqu'au 2e frame)
  res.nav = {};
  for (const s of ["profiles", "irl", "messages", "explore", "feed"]) {
    res.nav[s] = r1(await measureNav(page, s));
    await page.waitForTimeout(300);
  }

  // Conversation longue : 500 messages injectés dans conv_lea
  res.conv = await page.evaluate(async () => {
    const convs = getConversations();
    const c = convs.find((x) => x.id === "conv_lea");
    if (!c) return { error: "conv_lea absente" };
    const base = Date.now() - 600 * 60000;
    for (let i = 0; i < 500; i++) c.messages.push({ id: "perf_m_" + i, from: i % 2 ? "me" : "them", text: "Message de mesure numéro " + i + " — " + "lorem ipsum ".repeat(1 + (i % 5)), at: base + i * 60000 });
    c.lastAt = Date.now();
    saveConversationsNow();
    goTo("messages");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const t = performance.now();
    await openConversation("conv_lea");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const dt = performance.now() - t;
    const panel = document.getElementById("conv-fullpage") || document.body;
    const shown = panel.querySelectorAll(".msg, .message, [data-msg-id], .bubble").length;
    return { open_ms: Math.round(dt * 10) / 10, messages_in_conv: c.messages.length, panel_nodes: panel.getElementsByTagName("*").length, bubbles_found: shown, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null };
  });
  await page.evaluate(() => { try { closeConversation(); } catch (e) {} });

  // Recherche de passion : chargement du référentiel (163 Ko) + chercherAsync
  res.passions = await page.evaluate(async () => {
    if (!window.PassioPassions) return { error: "PassioPassions absent" };
    const t = performance.now();
    let charge = null, err = null;
    try { await PassioPassions.charger(); charge = performance.now() - t; } catch (e) { err = String(e && e.message); }
    const t2 = performance.now();
    let n = null;
    try { const r = await PassioPassions.chercherAsync("guitare"); n = Array.isArray(r) ? r.length : (r && r.length) || null; } catch (e) { err = (err || "") + " / " + String(e && e.message); }
    const t3 = performance.now();
    let n2 = null; try { const r = await PassioPassions.chercherAsync("photo argentique"); n2 = Array.isArray(r) ? r.length : null; } catch (e) {}
    return { charger_ms: charge, chercher_guitare_ms: Math.round((t3 - t2) * 10) / 10, resultats: n, chercher_2_ms: Math.round((performance.now() - t3) * 10) / 10, resultats_2: n2, taille: PassioPassions.taille ? PassioPassions.taille() : null, err };
  });

  // Carte : init MapLibre (CDN unpkg abandonné → on mesure le chemin d'échec)
  res.map = await page.evaluate(async () => {
    goTo("irl");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const t = performance.now();
    let status = "n/a";
    try {
      if (typeof ensureLeaflet !== "function") return { status: "ensureLeaflet absent" };
      await Promise.race([ensureLeaflet().then(() => { status = "chargée"; }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout 15 s")), 15000))]);
    } catch (e) { status = "échec: " + String(e && e.message || e).slice(0, 80); }
    return { ensureLeaflet_ms: Math.round((performance.now() - t) * 10) / 10, status, maplibre: typeof window.maplibregl };
  });

  // Fil long : 500 publications dans state.supabasePosts
  res.feed500 = await page.evaluate(async () => {
    goTo("feed");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const passion = (state.user.profiles[0] || {}).passion || "musique";
    const arr = [];
    const now = Date.now();
    for (let i = 0; i < 500; i++) arr.push({ id: "perf_p_" + i, authorId: "u_perf_" + (i % 40), authorName: "Auteur " + (i % 40), authorEmoji: "✨", authorColor: "#7c3aed", passion, mood: ["creation", "learn", "irl", "all"][i % 4], type: "text", text: "Publication de mesure numéro " + i + ". " + "Texte de remplissage ".repeat(1 + (i % 6)), createdAt: now - i * 90000, likes: i % 50, liked: false, comments: [], fromSupabase: true });
    state.supabasePosts = arr;
    window._feedDomSig = null; window._feedRefreshSig = null;
    const list = document.getElementById("feedList");
    if (list) { list._lastHtml = null; list._fwSigs = null; }
    window._lastHtml = null;
    const out = { heapBefore: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null };
    window._feedRenderLimit = 20;
    let t = performance.now(); renderFeed(); out.render20_sync_ms = Math.round((performance.now() - t) * 10) / 10;
    await new Promise((r) => setTimeout(r, 1500));
    out.cards_after_20 = document.querySelectorAll("#feedList .post").length;
    window._feedDomSig = null; if (list) { list._lastHtml = null; }
    window._feedRenderLimit = 500;
    t = performance.now(); renderFeed(); out.render500_sync_ms = Math.round((performance.now() - t) * 10) / 10;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.render500_to_frame_ms = Math.round((performance.now() - t) * 10) / 10;
    await new Promise((r) => setTimeout(r, 4000));
    out.cards_after_500 = document.querySelectorAll("#feedList .post").length;
    out.domNodes = document.getElementsByTagName("*").length;
    out.feedList_nodes = list ? list.getElementsByTagName("*").length : null;
    out.heapAfter = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null;
    out.allFeedPosts_n = allFeedPosts().length;
    return out;
  });
  res.after_all = await snapshot(page, "fin_de_run");
  res.pageErrors = transfer.pageErrors.slice(0, 10);

  if (doSoak) {
    const soak = { samples: [], duration_ms: SOAK_MS };
    const screens = ["feed", "profiles", "irl", "messages", "explore"];
    const tStart = Date.now();
    let i = 0, lastSample = 0;
    soak.samples.push(await snapshot(page, "t+0s"));
    while (Date.now() - tStart < SOAK_MS) {
      const s = screens[i % screens.length];
      await page.evaluate(async (s) => { goTo(s); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, s).catch(() => {});
      if (i % 12 === 5) await page.evaluate(async () => { try { await openConversation("conv_lea"); await new Promise((r) => setTimeout(r, 300)); closeConversation(); } catch (e) {} }).catch(() => {});
      if (i % 12 === 9) await page.evaluate(async () => { try { const l = document.querySelector(".app-main") || document.scrollingElement; l.scrollTop = 3000; await new Promise((r) => setTimeout(r, 200)); l.scrollTop = 0; } catch (e) {} }).catch(() => {});
      await page.waitForTimeout(800);
      i++;
      if (Date.now() - lastSample > 30000) { lastSample = Date.now(); soak.samples.push(await snapshot(page, "t+" + Math.round((Date.now() - tStart) / 1000) + "s")); }
    }
    soak.samples.push(await snapshot(page, "t+" + Math.round((Date.now() - tStart) / 1000) + "s_fin"));
    soak.navigations = i;
    res.soak = soak;
    try { await page.evaluate(() => goTo("feed")); await page.screenshot({ path: path.join(__dirname, "capture-fil-500.jpg"), type: "jpeg", quality: 35 }); } catch (e) {}
  }
  await ctx.close();
  return res;
}

(async () => {
  const browser = await chromium.launch();
  const all = { date: new Date().toISOString(), sha: "c8cb8e99", methode: "émulation Chromium headless (Playwright), viewport 390×844 DPR2 isMobile, CDP Emulation.setCPUThrottlingRate + Network.emulateNetworkConditions ; cible dist minifié (terser/html-minifier-terser/clean-css) servi en brotli par http-server -b -g ; requêtes hors 127.0.0.1 abandonnées (SDK supabase-js, MapLibre, fonts, Supabase EXCLUS de la mesure) ; état onboardé injecté ; médiane de 3", runs: [], medianes: {} };
  for (const sc of SCENARIOS) {
    for (let i = 0; i < RUNS; i++) {
      const doSoak = sc.name === "sans_bridage" && i === 0 && SOAK_MS > 0;
      const t = Date.now();
      try {
        const r = await runOnce(browser, sc, i + 1, doSoak);
        r.wall_ms = Date.now() - t;
        all.runs.push(r);
        console.log(sc.name, "run", i + 1, "ok", Math.round((Date.now() - t) / 1000) + "s", "FCP", r1(r.fcp_ms), "LCP", r1(r.lcp_ms), "appReady", r1(r.appReady_ms), "1re carte", r.firstFeedCard_wall_ms);
      } catch (e) {
        all.runs.push({ scenario: sc.name, run: i + 1, error: String(e && e.message).slice(0, 300) });
        console.log(sc.name, "run", i + 1, "ERREUR", e && e.message);
      }
      fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
    }
  }
  // Médianes par scénario
  for (const sc of SCENARIOS) {
    const rs = all.runs.filter((r) => r.scenario === sc.name && !r.error);
    const pick = (f) => median(rs.map(f));
    all.medianes[sc.name] = {
      n: rs.length,
      fcp_ms: r1(pick((r) => r.fcp_ms)), lcp_ms: r1(pick((r) => r.lcp_ms)), appReady_ms: r1(pick((r) => r.appReady_ms)),
      domContentLoaded_ms: r1(pick((r) => r.domContentLoaded_ms)), load_ms: r1(pick((r) => r.load_ms)),
      screenFeedActive_wall_ms: pick((r) => r.screenFeedActive_wall_ms), firstFeedCard_wall_ms: pick((r) => r.firstFeedCard_wall_ms),
      boot_longtasks_n: pick((r) => r.boot.longtasks_n), boot_longtasks_max_ms: pick((r) => r.boot.longtasks_max_ms), boot_longtasks_total_ms: pick((r) => r.boot.longtasks_total_ms),
      boot_domNodes: pick((r) => r.boot.domNodes), boot_heapMB: pick((r) => r.boot.heapMB),
      nav: Object.fromEntries(["profiles", "irl", "messages", "explore", "feed"].map((s) => [s, r1(pick((r) => r.nav[s]))])),
      conv_open_500msg_ms: r1(pick((r) => r.conv.open_ms)), conv_panel_nodes: pick((r) => r.conv.panel_nodes),
      passions_charger_ms: r1(pick((r) => r.passions.charger_ms)), passions_chercher_ms: r1(pick((r) => r.passions.chercher_guitare_ms)),
      map_ensureLeaflet_ms: r1(pick((r) => r.map.ensureLeaflet_ms)), map_status: rs[0] && rs[0].map.status,
      feed500_render20_sync_ms: r1(pick((r) => r.feed500.render20_sync_ms)), feed500_render500_sync_ms: r1(pick((r) => r.feed500.render500_sync_ms)), feed500_render500_to_frame_ms: r1(pick((r) => r.feed500.render500_to_frame_ms)),
      feed500_cards: pick((r) => r.feed500.cards_after_500), feed500_domNodes: pick((r) => r.feed500.domNodes), feed500_heapAfterMB: pick((r) => r.feed500.heapAfter),
      transfer_bytes_total: pick((r) => r.transfer.bytes_total), transfer_requests: pick((r) => r.transfer.requests),
    };
  }
  fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
  console.log(JSON.stringify(all.medianes, null, 2));
  await browser.close();
})();
