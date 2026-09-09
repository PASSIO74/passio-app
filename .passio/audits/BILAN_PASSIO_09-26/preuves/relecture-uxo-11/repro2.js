const { chromium } = require("/home/user/passio-app/node_modules/playwright");
const fs = require("fs");
const OUT = __dirname, BASE = "http://127.0.0.1:8120";
const GATE_TOKEN = "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f";
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await ctx.addInitScript((tok) => {
    try { sessionStorage.setItem("passio_gate_v1", tok); } catch (_) {}
    window.__probe = { controllerAtStart: !!(navigator.serviceWorker && navigator.serviceWorker.controller), msgs: [], toasts: [] };
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", e => { window.__probe.msgs.push(e.data && e.data.type); });
    const mo = new MutationObserver(() => { document.querySelectorAll(".toast").forEach(t => { const s = t.textContent.trim(); if (!window.__probe.toasts.includes(s)) window.__probe.toasts.push(s); }); });
    document.addEventListener("DOMContentLoaded", () => mo.observe(document.body, { childList: true, subtree: true }));
  }, GATE_TOKEN);
  const res = {};
  for (const visite of ["premiere", "seconde", "troisieme"]) {
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    // attendre le toast jusqu'à 8 s, capture dès qu'il est visible
    let shot = false;
    for (let i = 0; i < 40; i++) {
      const vis = await page.evaluate(() => [...document.querySelectorAll(".toast")].some(t => t.offsetParent && /Mise à jour/.test(t.textContent)));
      if (vis && !shot) { await page.screenshot({ path: OUT + "/repro-" + visite + "-toast.png" }); shot = true; break; }
      await wait(200);
    }
    await wait(1500);
    res[visite] = await page.evaluate(() => Object.assign({}, window.__probe, { controllerNow: !!navigator.serviceWorker.controller }));
    res[visite].captureToast = shot;
    console.log(visite, JSON.stringify(res[visite]));
  }
  fs.writeFileSync(OUT + "/repro.json", JSON.stringify(res, null, 1));
  await browser.close();
})().catch(e => { console.error("ERR", e); process.exit(1); });
