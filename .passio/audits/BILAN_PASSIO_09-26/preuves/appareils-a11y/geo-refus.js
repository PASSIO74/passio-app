const { chromium } = require("/home/user/passio-app/node_modules/@playwright/test");
const { GATE_KEY, GATE_TOKEN } = require("/home/user/passio-app/tests/e2e/gate-helper.js");
const { onboardedState } = require("/home/user/passio-app/tests/e2e/app-helper.js");
const BASE = "http://127.0.0.1:8112";
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: [] });
  await ctx.route(/\/rest\/v1\/(posts|stories|events|notifications)\?/, (r) => r.request().method() === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : r.continue());
  const page = await ctx.newPage();
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  await page.addInitScript(([k, t, st]) => { sessionStorage.setItem(k, t); sessionStorage.setItem("passio_pwa_dismissed", "1"); if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st)); }, [GATE_KEY, GATE_TOKEN, onboardedState(2)]);
  await page.addInitScript(() => {
    window.__geo = 0;
    const deny = (ok, err) => { window.__geo++; setTimeout(() => err && err({ code: 1, PERMISSION_DENIED: 1, message: "User denied Geolocation" }), 10); };
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: deny, watchPosition: deny, clearWatch() {} }, configurable: true });
  });
  await page.goto(BASE + "/index.html");
  await page.waitForFunction(() => document.getElementById("screen-feed").classList.contains("active"));
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); window.__toasts = []; const o = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return o.apply(this, arguments); }; });
  // 1. ouverture IRL par le clic sur l'onglet (comme un utilisateur)
  await page.locator('#appNavV2 [data-screen="irl"]').click();
  await page.waitForTimeout(2000);
  const a = await page.evaluate(() => ({ appels: window.__geo, ville: (document.getElementById("irlUserCityName") || {}).textContent, loc: irlUserLocation, err: irlUserLocationError, skipOnce: window._passioIrlSkipGeoOnce, toasts: window.__toasts.slice(), visible: !!document.querySelector("#screen-irl.active") }));
  // 2. appel direct
  await page.evaluate(() => { window.__toasts = []; requestUserLocation(); });
  await page.waitForTimeout(1200);
  const b = await page.evaluate(() => ({ appels: window.__geo, ville: (document.getElementById("irlUserCityName") || {}).textContent, loc: irlUserLocation, err: irlUserLocationError, toasts: window.__toasts.slice(), titreIrl: (document.querySelector("#screen-irl .irl-city, #irlCityBtn, [onclick*='openIrlCitySelector']") || {}).textContent }));
  // 3. redemande ? (5 renders)
  await page.evaluate(() => { for (let i = 0; i < 5; i++) renderIRL(); requestUserLocation(); });
  await page.waitForTimeout(500);
  const c = await page.evaluate(() => window.__geo);
  await page.screenshot({ path: "captures/perm-geo-refusee_irl-direct.png" });
  // 4. check-in avec GPS refusé
  const d = await page.evaluate(async () => {
    window.__toasts = [];
    const ev = allEvents().find((e) => typeof eventLatLng === "function" && eventLatLng(e));
    if (!ev) return { info: "aucun événement géolocalisé" };
    try { checkInEvent(ev.id); } catch (e) { return { err: e.message }; }
    await new Promise((r) => setTimeout(r, 800));
    return { id: ev.id, toasts: window.__toasts.slice(), pointe: (state.user.checkedInEvents || []).includes(ev.id), appels: window.__geo };
  });
  console.log(JSON.stringify({ ouvertureOnglet: a, appelDirect: b, appelsApres5Renders: c, checkin: d }, null, 1));
  await browser.close();
})();
