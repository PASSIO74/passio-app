const { chromium } = require("@playwright/test");
const { bootOnboarded } = require("/home/user/passio-app/tests/e2e/app-helper.js");
const P = "/tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad/preuves/relecture-uxo05/";
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:8120", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = { js: [], console: [], network: [], page: [] };
  page.on("pageerror", e => errors.page.push(String(e)));
  await bootOnboarded(page, errors, 1);
  const r = {};
  r.avant = await page.evaluate(() => ({ landing: document.getElementById("landing").classList.contains("active"), onboarded: !!state.onboarded }));
  await page.evaluate(() => { window.MY_UID = "11111111-2222-4333-8444-555555555555"; showPitchLanding(); });
  await page.waitForTimeout(300);
  r.apres = await page.evaluate(() => ({ landing: document.getElementById("landing").classList.contains("active"),
    boutonsVisibles: [...document.querySelectorAll("#landing button, #landing [onclick]")].filter(b => b.offsetParent).map(b => b.textContent.replace(/\s+/g," ").trim().slice(0,40)),
    boutonsTous: [...document.querySelectorAll("#landing button, #landing [onclick]")].map(b => (b.getAttribute("onclick")||"")+" | "+b.textContent.replace(/\s+/g," ").trim().slice(0,30)) }));
  await page.screenshot({ path: P + "pitch-connecte.png" });
  r.histAvantPitch = await page.evaluate(() => history.length);
  // pousser une entrée artificielle pour que le geste retour reste dans la page, puis back
  await page.evaluate(() => { history.pushState({ relecture: 1 }, ""); });
  await page.goBack().catch(()=>{});
  await page.waitForTimeout(400);
  r.back = await page.evaluate(() => ({ landing: document.getElementById("landing").classList.contains("active"), url: location.href }));
  // popstate synthétique (comme un retour matériel) pour exercer le handler app-02:2177
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate", { state: null })));
  await page.waitForTimeout(200);
  r.popstateSynth = await page.evaluate(() => document.getElementById("landing").classList.contains("active"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  r.escape = await page.evaluate(() => document.getElementById("landing").classList.contains("active"));
  r.closeOverlay = await page.evaluate(() => { try { return { rc: closeCurrentOverlay(), landing: document.getElementById("landing").classList.contains("active") }; } catch(e) { return String(e); } });
  await page.click("#landing button:has-text('Se connecter')");
  await page.waitForTimeout(400);
  r.seConnecter = await page.evaluate(() => ({ landing: document.getElementById("landing").classList.contains("active"), onboarding: document.getElementById("onboarding").classList.contains("active"), onbStep: (typeof onbSteps!=="undefined" && onbSteps[onbStepIdx]), authFormVisible: !!(document.querySelector("#authEmail, #onbAuthEmail, input[type=email]")||{}).offsetParent, onboardedEncore: !!state.onboarded, myUid: window.MY_UID }));
  await page.screenshot({ path: P + "pitch-se-connecter.png" });
  r.errors = errors;
  console.log("RESULT " + JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
