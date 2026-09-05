const { chromium } = require("/home/user/passio-app/node_modules/playwright");
const fs = require("fs"); const OUT = __dirname; const BASE = "http://127.0.0.1:8120";
const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESK = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const R = [];
async function run(nom, ua, dismissed) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", isMobile: true, hasTouch: true, userAgent: ua });
  await ctx.route("**/*", (r) => /supabase|jsdelivr|unpkg|cdnjs|netlify|googleapis|gstatic/i.test(r.request().url()) ? r.abort() : r.continue());
  await ctx.addInitScript(([d]) => { sessionStorage.setItem("passio_gate_v1", "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f"); if (d) sessionStorage.setItem("passio_pwa_dismissed", "1");
    window.__tLoad = null; window.addEventListener("load", () => { window.__tLoad = performance.now(); }); }, [dismissed]);
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(String(e.message).slice(0,120)));
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  // sonde : moment où l'overlay passe en display flex
  const tShown = await page.evaluate(() => new Promise(res => { const ov = document.getElementById("pwa-overlay"); if (!ov) return res("absent"); const t0 = performance.now(); const iv = setInterval(() => { if (getComputedStyle(ov).display !== "none") { clearInterval(iv); res({ apresLoad_ms: Math.round(performance.now() - (window.__tLoad || t0)) }); } else if (performance.now() - t0 > 5000) { clearInterval(iv); res("non affiche en 5 s"); } }, 20); }));
  const s = await page.evaluate(() => { const ov = document.getElementById("pwa-overlay"); const cs = ov ? getComputedStyle(ov) : null; const r = ov ? ov.getBoundingClientRect() : null;
    return { display: cs && cs.display, position: cs && cs.position, z: cs && cs.zIndex, rect: r && { w: r.width, h: r.height }, texte: ov ? ov.innerText.replace(/\s+/g, " ").trim().slice(0, 160) : null,
      racineFirstRun: document.documentElement.className, ecranActif: (document.querySelector(".screen.active") || {}).id, carteBienvenue: !!document.getElementById("frWelcome"),
      elementAuCentre: (() => { const e = document.elementFromPoint(195, 600); return e ? (e.id || e.className || e.tagName) : null; })() }; });
  await page.screenshot({ path: OUT + "/" + nom + ".png" });
  // fermeture puis nouvelle session (nouveau contexte = sessionStorage vierge)
  let apresFermeture = null;
  if (s.display !== "none") { await page.click("#pwa-overlay .pwa-btn-skip"); await page.waitForTimeout(500);
    apresFermeture = await page.evaluate(() => ({ display: getComputedStyle(document.getElementById("pwa-overlay")).display, session: sessionStorage.getItem("passio_pwa_dismissed"), local: localStorage.getItem("passio_pwa_dismissed") })); }
  R.push({ nom, ua: ua.slice(0, 30), dismissedPose: dismissed, tShown, etat: s, apresFermeture, pageerrors: errs });
  await browser.close();
}
(async () => {
  await run("A-ios-safari-sans-dismissed", IOS, false);
  await run("B-ios-safari-avec-dismissed", IOS, true);
  await run("C-ios-safari-nouvelle-session", IOS, false);
  await run("D-desktop-chrome-sans-dismissed", DESK, false);
  fs.writeFileSync(OUT + "/repro.json", JSON.stringify(R, null, 2)); console.log(JSON.stringify(R, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
