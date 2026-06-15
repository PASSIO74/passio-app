#!/usr/bin/env node
// Audit de performance (proxy Lighthouse) — mesure des métriques réelles de
// chargement de l'app DERRIÈRE le gate, en état onboardé. Sans dépendance au
// CLI Lighthouse (qui mesurerait l'écran de code, pas l'app).
// Usage : npm run serve (port 8080) puis `node scripts/perf-audit.js`.
const { chromium } = require("@playwright/test");
const { GATE_TOKEN, GATE_KEY } = require("../tests/e2e/gate-helper");

const STATE = {
  onboarded: true, landingSeen: true, tourSeen: true,
  user: { name: "Perf QA", birthYear: 1995, isMinor: false, score: 0, passia: 0,
    currentProfileId: "pp_0",
    profiles: [{ id: "pp_0", name: "Perf QA", passion: "musique", emoji: "🎵", bio: "", color: "#7c3aed", createdAt: 1 }],
    drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [],
    following: [], savedCarnets: [], general: { username: "Perf QA" } },
  userPosts: [], userEvents: [], transactions: [], notifications: [], quests: [],
  currentMood: "all", selectedFeedPassions: [],
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // Mesurer le poids transféré
  let totalBytes = 0, jsBytes = 0, cssBytes = 0, imgBytes = 0, reqCount = 0;
  page.on("response", async (resp) => {
    try {
      const h = resp.headers();
      const len = parseInt(h["content-length"] || "0", 10);
      const type = (h["content-type"] || "");
      reqCount++;
      totalBytes += len;
      if (type.includes("javascript")) jsBytes += len;
      else if (type.includes("css")) cssBytes += len;
      else if (type.includes("image")) imgBytes += len;
    } catch (e) {}
  });

  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
  }, [GATE_KEY, GATE_TOKEN, STATE]);

  const t0 = Date.now();
  await page.goto("http://127.0.0.1:8080/index.html", { waitUntil: "load" });
  await page.waitForFunction(() => {
    const el = document.getElementById("screen-feed");
    return el && el.classList.contains("active");
  }, null, { timeout: 20000 });
  const appReady = Date.now() - t0;

  // Navigation Timing + paint
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] || {};
    const paints = {};
    performance.getEntriesByType("paint").forEach((p) => { paints[p.name] = Math.round(p.startTime); });
    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      loadEvent: Math.round(nav.loadEventEnd || 0),
      firstPaint: paints["first-paint"] || null,
      firstContentfulPaint: paints["first-contentful-paint"] || null,
      domNodes: document.getElementsByTagName("*").length,
    };
  });

  await browser.close();

  const kb = (b) => (b / 1024).toFixed(1) + " Ko";
  console.log("\n=== Audit performance PASSIO (mobile 390×844, local non-compressé) ===");
  console.log("First Contentful Paint : " + (metrics.firstContentfulPaint ?? "?") + " ms");
  console.log("DOMContentLoaded       : " + metrics.domContentLoaded + " ms");
  console.log("Load event             : " + metrics.loadEvent + " ms");
  console.log("App prête (feed actif) : " + appReady + " ms");
  console.log("Nœuds DOM              : " + metrics.domNodes);
  console.log("Requêtes               : " + reqCount);
  console.log("Transfert total        : " + kb(totalBytes) + " (non compressé ; ~4× moins en brotli prod)");
  console.log("  dont JS              : " + kb(jsBytes));
  console.log("  dont CSS             : " + kb(cssBytes));
  console.log("  dont images          : " + kb(imgBytes));
  console.log("\nNote : en prod, Netlify sert en brotli (~201 Ko doc principal mesuré).");
})();
