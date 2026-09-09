// (a) première visite SANS le drapeau passio_pwa_dismissed ; (b) aide « stories » vs visionneuse.
const { chromium } = require("/home/user/passio-app/node_modules/playwright");
const fs = require("fs");
const OUT = __dirname; const BASE = "http://127.0.0.1:" + (process.env.PASSIO_PORT || 8101);
const J = { etapes: [] }; const t0 = Date.now();
function log(n, d) { J.etapes.push(Object.assign({ t_ms: Date.now() - t0, etape: n }, d || {})); console.log(n, JSON.stringify(d || {})); }
(async () => {
  const browser = await chromium.launch();
  for (const variante of ["sans-pwa-dismissed", "avec-pwa-dismissed"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
    await ctx.route("**/*", (r) => /supabase|jsdelivr|unpkg|cdnjs|netlify|googleapis|gstatic/i.test(r.request().url()) ? r.abort() : r.continue());
    await ctx.addInitScript(([v]) => { sessionStorage.setItem("passio_gate_v1", "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f"); if (v === "avec-pwa-dismissed") sessionStorage.setItem("passio_pwa_dismissed", "1"); }, [variante]);
    const page = await ctx.newPage();
    await page.goto(BASE + "/index.html"); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(4000);
    const s = await page.evaluate(() => { const ov = [...document.querySelectorAll("body > *")].filter(el => { const cs = getComputedStyle(el); return cs.position === "fixed" && cs.display !== "none" && el.getBoundingClientRect().height > 300; }).map(el => ({ id: el.id, cls: String(el.className).slice(0, 40), z: getComputedStyle(el).zIndex, texte: el.innerText.replace(/\s+/g, " ").trim().slice(0, 200) })); return { overlays: ov, carte: !!document.getElementById("frWelcome"), toasts: [...document.querySelectorAll(".toast")].map(t => t.textContent.trim()) }; });
    log("V " + variante + " (UA iPhone Safari)", s);
    await page.screenshot({ path: OUT + "/70-premiere-visite-" + variante + ".png" });
    if (variante === "avec-pwa-dismissed") {
      // (b) tap sur une story de démonstration → visionneuse ; l'aide « stories » se pose-t-elle par-dessus ?
      await page.evaluate(() => { const b = document.querySelector("#frWelcome .fr-welcome-alt"); if (b) b.click(); }); await page.waitForTimeout(1000);
      await page.evaluate(() => { try { PassioFirstRun.fermerBulle(); } catch (e) {} });
      const st = (await page.$$("#storiesRowFeed > *"))[1];
      if (st) { await st.click(); await page.waitForTimeout(1200); }
      const r = await page.evaluate(() => { const v = document.getElementById("storyViewer"); const tip = document.querySelector(".fr-tip"); return { viewerActif: !!(v && v.classList.contains("active")), viewerZ: v ? getComputedStyle(v).zIndex : null, tip: tip ? { id: tip.getAttribute("data-fr-tip"), z: getComputedStyle(tip).zIndex, rect: tip.getBoundingClientRect().toJSON() } : null, tourPrefs: JSON.parse(localStorage.getItem("passio_first_run_v1")).tour }; });
      log("B tap story « Léa » (visiteur) : visionneuse + aide stories", r);
      await page.screenshot({ path: OUT + "/71-aide-stories-sur-visionneuse.png" });
    }
    await ctx.close();
  }
  fs.writeFileSync(OUT + "/parcours-visiteur-3.json", JSON.stringify(J, null, 2));
  await browser.close();
})().catch((e) => { console.error("ECHEC", e); process.exit(1); });
