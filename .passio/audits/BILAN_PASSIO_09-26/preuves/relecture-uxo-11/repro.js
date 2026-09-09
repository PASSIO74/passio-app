// Reproduction UXO-11 — appareil VIERGE, SW autorisé, gate posé, attendre le toast.
const { chromium } = require("/home/user/passio-app/node_modules/playwright");
const fs = require("fs");
const OUT = __dirname;
const BASE = "http://127.0.0.1:8120";
const GATE_TOKEN = "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f";
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  // attendre le serveur
  for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + "/index.html"); if (r.ok) break; } catch (_) {} await wait(500); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const swMsgs = [];
  await page.addInitScript((tok) => {
    try { sessionStorage.setItem("passio_gate_v1", tok); } catch (_) {}
    // sonde : contrôleur AVANT tout enregistrement + messages SW reçus
    window.__probe = { controllerAtStart: !!(navigator.serviceWorker && navigator.serviceWorker.controller), msgs: [], toasts: [] };
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", e => { window.__probe.msgs.push({ t: performance.now(), type: e.data && e.data.type }); });
    const mo = new MutationObserver(() => { document.querySelectorAll(".toast").forEach(t => { const s = t.textContent.trim(); if (!window.__probe.toasts.includes(s)) window.__probe.toasts.push(s); }); });
    document.addEventListener("DOMContentLoaded", () => mo.observe(document.body, { childList: true, subtree: true }));
  }, GATE_TOKEN);
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await wait(4000);
  const p1 = await page.evaluate(() => Object.assign({}, window.__probe, { controllerNow: !!navigator.serviceWorker.controller, toastVisible: [...document.querySelectorAll(".toast")].map(t => ({ txt: t.textContent.trim(), vis: !!t.offsetParent })) }));
  await page.screenshot({ path: OUT + "/repro-01-premiere-visite.png" });
  console.log("PREMIERE VISITE:", JSON.stringify(p1, null, 1));
  // seconde navigation (SW déjà contrôleur, même version → pas d'activate attendu)
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await wait(4000);
  const p2 = await page.evaluate(() => Object.assign({}, window.__probe, { controllerNow: !!navigator.serviceWorker.controller }));
  console.log("SECONDE VISITE:", JSON.stringify(p2, null, 1));
  fs.writeFileSync(OUT + "/repro.json", JSON.stringify({ premiere: p1, seconde: p2 }, null, 1));
  await browser.close();
})().catch(e => { console.error("ERR", e); process.exit(1); });
