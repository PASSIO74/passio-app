const { chromium } = require("/home/user/passio-app/node_modules/playwright");
const BASE = "http://127.0.0.1:8120";
const GATE_TOKEN = "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f";
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", isMobile: true, hasTouch: true });
  await ctx.route("**/*", (route) => /supabase|jsdelivr|unpkg|cdnjs|netlify|googleapis|gstatic/i.test(route.request().url()) ? route.abort() : route.continue());
  await ctx.addInitScript((t) => { sessionStorage.setItem("passio_gate_v1", t); sessionStorage.setItem("passio_pwa_dismissed", "1"); }, GATE_TOKEN);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto(BASE + "/index.html"); await page.waitForTimeout(3500);
  const etat = () => page.evaluate(() => ({
    onbActif: document.getElementById("onboarding").classList.contains("active"),
    onbStep: (document.querySelector(".onb-step.active")||{}).getAttribute ? document.querySelector(".onb-step.active").getAttribute("data-onb-step") : null,
    ecran: (document.querySelector(".screen.active")||{}).id || null,
    sortie: !!(document.getElementById("frBackToExplore") && document.getElementById("frBackToExplore").offsetParent),
    boutonsOnb: [...document.querySelectorAll("#onboarding .onb-step.active button, #onboarding > button")].filter(b=>b.offsetParent).map(b=>b.textContent.trim()),
    onboarded: window.state && state.onboarded, racine: document.documentElement.classList.contains("passio-first-run"),
    stored: (()=>{try{return JSON.parse(localStorage.getItem("passio_mvp_state_v1")).onboarded}catch(e){return "ERR"}})(),
  }));
  console.log("0 boot", JSON.stringify(await etat()));
  await page.click('.app-nav-v2 [data-v2-key="meet"]'); await page.waitForTimeout(600);
  await page.click('.app-nav-v2 [data-v2-key="discover"]'); await page.waitForTimeout(600);
  console.log("0b history.length", await page.evaluate(() => history.length));
  await page.click('.app-topbar [aria-label="Paramètres"]'); await page.waitForTimeout(400);
  await page.click('#devPanel .settings-section-header:has-text("Compte")'); await page.waitForTimeout(300);
  const btn = page.locator('#devPanel button', { hasText: "Voir l'onboarding" });
  console.log("1 bouton visible visiteur:", await btn.isVisible());
  await btn.click(); await page.waitForTimeout(800);
  console.log("2 après clic", JSON.stringify(await etat()));
  await page.screenshot({ path: __dirname + "/apres-clic.png" });
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  console.log("3 après Escape", JSON.stringify(await etat()));
  await page.evaluate(() => history.back()); await page.waitForTimeout(700); console.log("4a url", page.url());
  console.log("4 après back", JSON.stringify(await etat()));
  await page.evaluate(() => closeCurrentOverlay()); await page.waitForTimeout(300);
  console.log("5 après closeCurrentOverlay()", JSON.stringify(await etat()));
  await page.reload(); await page.waitForTimeout(3500);
  console.log("6 après reload", JSON.stringify(await etat()));
  console.log("pageerrors", errs);
  await browser.close();
})();
