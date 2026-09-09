// Complément de mesures (2e passe) — ÉMULATION Chromium, jamais un appareil réel.
// Corrige deux limites de la 1re passe : `performance.memory` est QUANTIFIÉ en
// headless (9,5 Mo constant) → on lit le tas via CDP Performance.getMetrics ;
// et le référentiel des passions était déjà chargé quand on le mesurait → on
// mesure ici fetch + parse du JSON à froid (cache HTTP désactivé) et la recherche.
// Ajoute : nombre réel de bulles rendues pour 500 messages (fenêtre CONV_PAGE=40),
// et un soak de 5 min avec tas précis + GC forcé à la fin (fuite ou pas).
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("/home/user/passio-app/node_modules/@playwright/test");
const { GATE_KEY, GATE_TOKEN } = require("/home/user/passio-app/tests/e2e/gate-helper");
const { onboardedState } = require("/home/user/passio-app/tests/e2e/app-helper");

const BASE = "http://127.0.0.1:" + (process.env.PASSIO_PORT || 8110);
const OUT = path.join(__dirname, "mesures-perf-2.json");
const SOAK_MS = parseInt(process.env.SOAK_MS || "300000", 10);
const RUNS = 3;
const r1 = (x) => (typeof x === "number" ? Math.round(x * 10) / 10 : x);
const median = (a) => { const s = a.filter((x) => typeof x === "number" && isFinite(x)).sort((x, y) => x - y); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function metrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const g = (n) => { const m = metrics.find((x) => x.name === n); return m ? m.value : null; };
  return { heapUsedMB: r1(g("JSHeapUsedSize") / 1048576), heapTotalMB: r1(g("JSHeapTotalSize") / 1048576), nodes: g("Nodes"), listeners: g("JSEventListeners"), documents: g("Documents"), layoutCount: g("LayoutCount"), styleRecalc: g("RecalcStyleCount") };
}

async function newPage(browser, cpu) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Performance.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const errors = [];
  await page.route("**/*", (route) => (route.request().url().startsWith(BASE) ? route.continue() : route.abort()));
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    window.__lt = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: "longtask", buffered: true }); } catch (e) {}
    window.addEventListener("passio:app-ready", () => { window.__appReady = performance.now(); }, { once: true });
  }, [GATE_KEY, GATE_TOKEN, onboardedState(1)]);
  return { ctx, page, cdp, errors };
}

async function runOnce(browser, cpu, idx, doSoak) {
  const { ctx, page, cdp, errors } = await newPage(browser, cpu);
  const res = { cpu, run: idx };
  await page.goto(BASE + "/index.html", { waitUntil: "commit" });
  await page.waitForFunction(() => window.__appReady && document.querySelector("#feedList .post"), null, { timeout: 120000 });
  await page.waitForTimeout(2000);
  res.appReady_ms = r1(await page.evaluate(() => window.__appReady));
  res.boot = await metrics(cdp);

  // Référentiel des passions à froid : fetch (cache HTTP coupé) + JSON.parse, puis recherche.
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  res.passions = await page.evaluate(async () => {
    const out = { dejaCharge: !!(window.PassioPassions && PassioPassions.pret && PassioPassions.pret()) };
    const t0 = performance.now();
    const r = await fetch("/data/passions-v1.json", { cache: "no-store" });
    const txt = await r.text();
    out.fetch_ms = r1(performance.now() - t0);
    out.octets = txt.length;
    const t1 = performance.now();
    const j = JSON.parse(txt);
    out.parse_ms = r1(performance.now() - t1);
    out.entrees = Array.isArray(j) ? j.length : (j.passions ? j.passions.length : Object.keys(j).length);
    const ent = performance.getEntriesByName(location.origin + "/data/passions-v1.json").pop();
    if (ent) { out.transfer_bytes = ent.transferSize; out.encoded_bytes = ent.encodedBodySize; out.resource_ms = r1(ent.duration); }
    if (window.PassioPassions) {
      const t2 = performance.now(); await PassioPassions.charger(); out.charger_ms = r1(performance.now() - t2);
      for (const q of ["guitare", "photo argentique", "aquascaping", "zzzz"]) { const t = performance.now(); const rr = await PassioPassions.chercherAsync(q); out["chercher_" + q.replace(/\W/g, "_") + "_ms"] = r1(performance.now() - t); out["n_" + q.replace(/\W/g, "_")] = Array.isArray(rr) ? rr.length : null; }
      out.taille = PassioPassions.taille();
    }
    function r1(x) { return Math.round(x * 10) / 10; }
    return out;
  });
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });

  // Conversation de 500 messages : bulles réellement rendues, temps d'ouverture, page suivante.
  res.conv = await page.evaluate(async () => {
    const r1 = (x) => Math.round(x * 10) / 10;
    const convs = getConversations(); const c = convs.find((x) => x.id === "conv_lea"); if (!c) return { error: "conv_lea absente" };
    const base = Date.now() - 600 * 60000;
    for (let i = 0; i < 500; i++) c.messages.push({ id: "perf_m_" + i, from: i % 2 ? "me" : "them", text: "Message de mesure numéro " + i + " — " + "lorem ipsum ".repeat(1 + (i % 5)), at: base + i * 60000 });
    saveConversationsNow();
    goTo("messages"); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const t = performance.now(); await openConversation("conv_lea"); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const open_ms = r1(performance.now() - t);
    const thread = document.getElementById("convFpThread");
    const out = { open_ms, messages: c.messages.length, bulles_rendues: thread ? thread.children.length : null, thread_nodes: thread ? thread.getElementsByTagName("*").length : null };
    // Page précédente (scroll infini vers le haut) : on simule la 2e page.
    if (thread) { c._convPage = 2; const t2 = performance.now(); renderConvFpThread(c, "Léa"); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); out.page2_render_ms = r1(performance.now() - t2); out.bulles_page2 = thread.children.length; }
    // Tout afficher (13 pages) : coût d'un fil entièrement déroulé.
    if (thread) { c._convPage = 13; const t3 = performance.now(); renderConvFpThread(c, "Léa"); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); out.all_render_ms = r1(performance.now() - t3); out.bulles_all = thread.children.length; out.thread_nodes_all = thread.getElementsByTagName("*").length; }
    try { closeConversation(); } catch (e) {}
    return out;
  });
  res.after_conv = await metrics(cdp);

  // Fil de 500 publications : tas précis avant/après.
  res.feed500 = await page.evaluate(async () => {
    const r1 = (x) => Math.round(x * 10) / 10;
    goTo("feed"); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const passion = (state.user.profiles[0] || {}).passion || "musique"; const now = Date.now(); const arr = [];
    for (let i = 0; i < 500; i++) arr.push({ id: "perf_p_" + i, authorId: "u_perf_" + (i % 40), authorName: "Auteur " + (i % 40), authorEmoji: "✨", authorColor: "#7c3aed", passion, mood: ["creation", "learn", "irl", "all"][i % 4], type: "text", text: "Publication de mesure numéro " + i + ". " + "Texte de remplissage ".repeat(1 + (i % 6)), createdAt: now - i * 90000, likes: i % 50, liked: false, comments: [], fromSupabase: true });
    state.supabasePosts = arr; window._feedDomSig = null; window._feedRefreshSig = null; const list = document.getElementById("feedList"); if (list) { list._lastHtml = null; list._fwSigs = null; } window._lastHtml = null;
    window._feedRenderLimit = 500; const t = performance.now(); renderFeed(); const sync = r1(performance.now() - t);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const frame = r1(performance.now() - t);
    await new Promise((r) => setTimeout(r, 3000));
    return { render500_sync_ms: sync, render500_to_frame_ms: frame, cards: document.querySelectorAll("#feedList .post").length, longtasks: window.__lt.slice() };
  });
  res.after_feed500 = await metrics(cdp);
  await cdp.send("HeapProfiler.enable"); await cdp.send("HeapProfiler.collectGarbage");
  res.after_feed500_gc = await metrics(cdp);

  if (doSoak) {
    const soak = { duration_ms: SOAK_MS, samples: [] };
    const screens = ["feed", "profiles", "irl", "messages", "explore"];
    const t0 = Date.now(); let i = 0, last = 0;
    soak.samples.push(Object.assign({ t: 0 }, await metrics(cdp)));
    while (Date.now() - t0 < SOAK_MS) {
      const s = screens[i % screens.length];
      await page.evaluate(async (s) => { goTo(s); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, s).catch(() => {});
      if (i % 10 === 4) await page.evaluate(async () => { try { await openConversation("conv_lea"); await new Promise((r) => setTimeout(r, 250)); closeConversation(); } catch (e) {} }).catch(() => {});
      if (i % 10 === 7) await page.evaluate(async () => { try { const l = document.querySelector(".app-main") || document.scrollingElement; l.scrollTop = 4000; await new Promise((r) => setTimeout(r, 150)); l.scrollTop = 0; } catch (e) {} }).catch(() => {});
      if (i % 10 === 9) await page.evaluate(() => { try { openPost && openPost(state.supabasePosts[3].id); } catch (e) {} try { closeModal && closeModal(); } catch (e) {} }).catch(() => {});
      await page.waitForTimeout(700); i++;
      if (Date.now() - last > 30000) { last = Date.now(); soak.samples.push(Object.assign({ t: Math.round((Date.now() - t0) / 1000) }, await metrics(cdp))); }
    }
    soak.navigations = i;
    soak.fin_avant_gc = await metrics(cdp);
    await cdp.send("HeapProfiler.collectGarbage");
    soak.fin_apres_gc = await metrics(cdp);
    soak.longtasks = await page.evaluate(() => { const lt = window.__lt; return { n: lt.length, total_ms: lt.reduce((a, b) => a + b[1], 0), max_ms: lt.reduce((a, b) => Math.max(a, b[1]), 0), sup100: lt.filter((x) => x[1] > 100).length }; });
    res.soak = soak;
  }
  res.pageErrors = errors.slice(0, 10);
  await ctx.close();
  return res;
}

(async () => {
  const browser = await chromium.launch();
  const all = { date: new Date().toISOString(), sha: "c8cb8e99", methode: "émulation Chromium headless (Playwright 1.60), 390×844 DPR2 isMobile ; tas JS via CDP Performance.getMetrics (précis, non quantifié) ; GC forcé via HeapProfiler.collectGarbage ; dist minifié servi en brotli sur 127.0.0.1:8110 ; requêtes externes abandonnées (SDK supabase-js, MapLibre, fonts exclus)", runs: [], medianes: {} };
  for (const cpu of [1, 4]) {
    for (let i = 0; i < RUNS; i++) {
      const t = Date.now();
      try { const r = await runOnce(browser, cpu, i + 1, cpu === 1 && i === 0 && SOAK_MS > 0); r.wall_s = Math.round((Date.now() - t) / 1000); all.runs.push(r); console.log("cpu×" + cpu, "run", i + 1, "ok", r.wall_s + "s", "heapBoot", r.boot.heapUsedMB, "pass fetch", r.passions.fetch_ms, "parse", r.passions.parse_ms, "conv", r.conv.open_ms, "bulles", r.conv.bulles_rendues, "feed500", r.feed500.render500_to_frame_ms, "heap500", r.after_feed500.heapUsedMB); }
      catch (e) { all.runs.push({ cpu, run: i + 1, error: String(e && e.message).slice(0, 300) }); console.log("cpu×" + cpu, "run", i + 1, "ERREUR", e && e.message); }
      fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
    }
  }
  for (const cpu of [1, 4]) {
    const rs = all.runs.filter((r) => r.cpu === cpu && !r.error); const pick = (f) => median(rs.map((r) => { try { return f(r); } catch (e) { return null; } }));
    all.medianes["cpu_x" + cpu] = { n: rs.length, appReady_ms: pick((r) => r.appReady_ms), boot_heapUsedMB: pick((r) => r.boot.heapUsedMB), boot_nodes: pick((r) => r.boot.nodes), boot_listeners: pick((r) => r.boot.listeners),
      passions_fetch_ms: pick((r) => r.passions.fetch_ms), passions_parse_ms: pick((r) => r.passions.parse_ms), passions_transfer_bytes: pick((r) => r.passions.transfer_bytes), passions_chercher_guitare_ms: pick((r) => r.passions.chercher_guitare_ms), passions_chercher_aquascaping_ms: pick((r) => r.passions.chercher_aquascaping_ms), passions_taille: pick((r) => r.passions.taille),
      conv_open_ms: pick((r) => r.conv.open_ms), conv_bulles_rendues: pick((r) => r.conv.bulles_rendues), conv_page2_ms: pick((r) => r.conv.page2_render_ms), conv_all_ms: pick((r) => r.conv.all_render_ms), conv_bulles_all: pick((r) => r.conv.bulles_all), conv_thread_nodes_all: pick((r) => r.conv.thread_nodes_all),
      feed500_render_to_frame_ms: pick((r) => r.feed500.render500_to_frame_ms), feed500_cards: pick((r) => r.feed500.cards), feed500_heapUsedMB: pick((r) => r.after_feed500.heapUsedMB), feed500_heap_apres_gc_MB: pick((r) => r.after_feed500_gc.heapUsedMB), feed500_nodes: pick((r) => r.after_feed500.nodes), feed500_listeners: pick((r) => r.after_feed500.listeners) };
  }
  fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
  console.log(JSON.stringify(all.medianes, null, 2));
  const s = all.runs.find((r) => r.soak); if (s) console.log("SOAK", JSON.stringify({ nav: s.soak.navigations, debut: s.soak.samples[0], fin_avant_gc: s.soak.fin_avant_gc, fin_apres_gc: s.soak.fin_apres_gc, longtasks: s.soak.longtasks }));
  await browser.close();
})();
