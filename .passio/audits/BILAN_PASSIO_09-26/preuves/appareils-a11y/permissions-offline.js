// Permissions refusées + PWA hors-ligne — ÉMULATION Chromium. Usage : PASSIO_PORT=8112 node permissions-offline.js
const path = require("path");
const fs = require("fs");
const { chromium } = require("/home/user/passio-app/node_modules/@playwright/test");
const { GATE_KEY, GATE_TOKEN } = require("/home/user/passio-app/tests/e2e/gate-helper.js");
const { onboardedState } = require("/home/user/passio-app/tests/e2e/app-helper.js");
const PORT = process.env.PASSIO_PORT || 8112;
const BASE = "http://127.0.0.1:" + PORT;
const OUT = __dirname;
const MOTIF_TABLES = /\/rest\/v1\/(posts|stories|events|notifications)\?/;

const REFUS_INIT = () => {
  window.__perm = { geo: 0, gum: 0, notif: 0, share: 0 };
  const denyGeo = (ok, err) => { window.__perm.geo++; setTimeout(() => err && err({ code: 1, PERMISSION_DENIED: 1, message: "User denied Geolocation" }), 10); };
  try { Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: denyGeo, watchPosition: denyGeo, clearWatch() {} }, configurable: true }); } catch (e) {}
  const gum = () => { window.__perm.gum++; const e = new DOMException("Permission denied", "NotAllowedError"); return Promise.reject(e); };
  try { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = gum; else Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: gum, enumerateDevices: async () => [] }, configurable: true }); } catch (e) {}
  try {
    const N = function () { throw new DOMException("denied", "NotAllowedError"); };
    N.permission = "denied"; N.requestPermission = () => { window.__perm.notif++; return Promise.resolve("denied"); };
    Object.defineProperty(window, "Notification", { value: N, configurable: true, writable: true });
  } catch (e) {}
  try { Object.defineProperty(navigator, "share", { value: () => { window.__perm.share++; return Promise.reject(new DOMException("Permission denied", "NotAllowedError")); }, configurable: true }); } catch (e) {}
  try { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new DOMException("denied", "NotAllowedError")) }, configurable: true }); } catch (e) {}
};

async function boot(page, opts = {}) {
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  await page.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
  }, [GATE_KEY, GATE_TOKEN, onboardedState(2)]);
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(BASE + "/index.html");
  await page.waitForFunction(() => { const el = document.getElementById("screen-feed"); return el && el.classList.contains("active"); }, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const l = document.getElementById("landing"); if (l) l.classList.remove("active");
    window.supaPublishPostWithRetry = async () => false; window.supaSetPostLike = async () => ({ ok: true, error: null });
    window.supaAddComment = () => {}; window.supaInsertNotif = () => {}; window.supaUpsertProfile = async () => {};
    window.__toasts = [];
    const orig = window.toast; window.toast = function (m, k) { window.__toasts.push(String(m)); return orig && orig.apply(this, arguments); };
  });
}

async function main() {
  const browser = await chromium.launch();
  const res = { methode: "ÉMULATION Chromium — refus simulés par remplacement des API (addInitScript), aucun appareil réel" };
  // ── PERMISSIONS REFUSÉES
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: [] });
    await ctx.route(MOTIF_TABLES, (r) => r.request().method() === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : r.continue());
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(e.message));
    await boot(page, { init: REFUS_INIT });
    const p = {};
    // GPS : ouvrir IRL
    await page.evaluate(() => goTo("irl")); await page.waitForTimeout(2500);
    p.geo = await page.evaluate(() => ({ appels: window.__perm.geo, ville: (document.getElementById("irlUserCityName") || {}).textContent, irlUserLocation: typeof irlUserLocation !== "undefined" ? irlUserLocation : null, irlUserLocationError: typeof irlUserLocationError !== "undefined" ? irlUserLocationError : null, toasts: window.__toasts.slice() }));
    // re-ouvrir IRL 3 fois : redemande en boucle ?
    for (let i = 0; i < 3; i++) { await page.evaluate(() => { goTo("feed"); }); await page.waitForTimeout(200); await page.evaluate(() => goTo("irl")); await page.waitForTimeout(600); }
    p.geoApresRetours = await page.evaluate(() => window.__perm.geo);
    await page.screenshot({ path: path.join(OUT, "captures", "perm-geo-refusee_irl.png") });
    // check-in GPS refusé : pointer arrivée
    p.checkin = await page.evaluate(async () => {
      window.__toasts = [];
      const ev = (typeof allEvents === "function" ? allEvents() : [])[0];
      if (!ev) return { info: "aucun événement" };
      const fn = window.checkInEvent || window.irlCheckIn || window.confirmArrival;
      return { fonctions: Object.keys(window).filter((k) => /checkin|checkIn/i.test(k)).slice(0, 8) };
    });
    // Caméra refusée : composer bobine (meOpen)
    p.camera = await page.evaluate(async () => {
      window.__toasts = [];
      const fns = Object.keys(window).filter((k) => /^meOpen|^openMediaEditor|^meStartCamera/.test(k));
      try { if (typeof meOpen === "function") meOpen("bobine"); else if (typeof meStartCamera === "function") { meState.mode = "bobine"; await meStartCamera(); } } catch (e) { return { err: e.message, fns }; }
      await new Promise((r) => setTimeout(r, 1200));
      const ed = document.getElementById("mediaEditor");
      const ph = document.getElementById("mePlaceholder");
      return { fns, gum: window.__perm.gum, editorClass: ed && ed.className, placeholderVisible: !!(ph && !ph.classList.contains("hidden")), placeholderTitre: (document.getElementById("mePhTitle") || {}).textContent, toasts: window.__toasts.slice() };
    });
    await page.screenshot({ path: path.join(OUT, "captures", "perm-camera-refusee_editeur.png") });
    await page.evaluate(() => { try { meClose && meClose(); } catch (e) {} try { closeCurrentOverlay && closeCurrentOverlay(); } catch (e) {} });
    // Micro refusé : vocal messagerie
    p.micro = await page.evaluate(async () => {
      window.__toasts = [];
      try { if (typeof startVoiceRecord === "function") await startVoiceRecord(); } catch (e) { return { err: e.message }; }
      await new Promise((r) => setTimeout(r, 500));
      return { gum: window.__perm.gum, toasts: window.__toasts.slice() };
    });
    // Appel : startCall
    p.appel = await page.evaluate(async () => {
      window.__toasts = [];
      const fns = Object.keys(window).filter((k) => /^startCall|^callStart|^placeCall/.test(k));
      try { if (typeof startCall === "function") await startCall({ id: "u_tiers", name: "Tiers" }, "audio"); } catch (e) { return { fns, err: e.message }; }
      await new Promise((r) => setTimeout(r, 800));
      return { fns, gum: window.__perm.gum, toasts: window.__toasts.slice() };
    });
    // Notifications refusées
    p.notif = await page.evaluate(async () => {
      window.__toasts = [];
      for (let i = 0; i < 3; i++) { try { await requestCallNotifications(); } catch (e) {} }
      return { requestPermissionAppels: window.__perm.notif, permission: Notification.permission, toasts: window.__toasts.slice() };
    });
    // Partage refusé
    p.partage = await page.evaluate(async () => {
      window.__toasts = [];
      try { partagerOuCopier({ title: "PASSIO", text: "Test", url: location.href }, "Lien copié"); } catch (e) { return { err: e.message }; }
      await new Promise((r) => setTimeout(r, 600));
      return { share: window.__perm.share, toasts: window.__toasts.slice() };
    });
    p.pageErrors = errs.slice(0, 8);
    p.appUtilisable = await page.evaluate(() => { goTo("feed"); return document.getElementById("screen-feed").classList.contains("active") && document.querySelectorAll("#feedList .post-card, #feedList article, #feedList > *").length > 0; });
    res.permissions = p;
    await ctx.close();
  }
  // ── HORS-LIGNE
  {
    // (a) premier lancement sans réseau : rien n'est en cache
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await ctx.newPage();
    await ctx.setOffline(true);
    let first;
    try { await page.goto(BASE + "/index.html", { timeout: 8000 }); first = { ok: true, title: await page.title() }; } catch (e) { first = { ok: false, erreur: e.message.split("\n")[0].slice(0, 120) }; }
    await ctx.setOffline(false);
    res.horsLigne = { premierLancementSansReseau: first };
    // (b) charger en ligne, laisser le SW s'installer, puis couper
    await page.addInitScript(([k, t, st]) => { sessionStorage.setItem(k, t); sessionStorage.setItem("passio_pwa_dismissed", "1"); if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st)); }, [GATE_KEY, GATE_TOKEN, onboardedState(1)]);
    await page.goto(BASE + "/index.html");
    await page.waitForTimeout(4000);
    const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); const c = await caches.keys(); const keys = r ? await (await caches.open(c[0] || "x")).keys() : []; return { registre: !!r, controller: !!navigator.serviceWorker.controller, active: !!(r && r.active), caches: c, entrees: keys.map((k) => new URL(k.url).pathname + new URL(k.url).search).slice(0, 30) }; });
    res.horsLigne.swApresPremierChargement = sw;
    // recharger une fois pour être contrôlé
    await page.reload(); await page.waitForTimeout(3000);
    res.horsLigne.controllerApresReload = await page.evaluate(() => !!navigator.serviceWorker.controller);
    await ctx.setOffline(true);
    let second;
    try {
      await page.reload({ timeout: 15000 });
      await page.waitForTimeout(3500);
      second = await page.evaluate(() => ({ title: document.title, feedActive: !!(document.getElementById("screen-feed") && document.getElementById("screen-feed").classList.contains("active")), gateVisible: !!(document.getElementById("accessGate") && getComputedStyle(document.getElementById("accessGate")).display !== "none"), bodyExtrait: document.body.innerText.slice(0, 120), offlineBanner: (document.getElementById("offlineBanner") || {}).style && document.getElementById("offlineBanner").style.display, nbCartes: document.querySelectorAll("#feedList > *").length, appJsOk: typeof goTo === "function", cssOk: getComputedStyle(document.body).margin !== "" && !!document.querySelector(".app-shell") && getComputedStyle(document.querySelector(".app-shell")).maxWidth }));
      await page.screenshot({ path: path.join(OUT, "captures", "hors-ligne_second-lancement.png") });
    } catch (e) { second = { erreur: e.message.split("\n")[0].slice(0, 150) }; }
    res.horsLigne.secondLancementSansReseau = second;
    // événement offline en cours de session → bannière ?
    await ctx.setOffline(false); await page.reload(); await page.waitForTimeout(3000);
    await ctx.setOffline(true); await page.waitForTimeout(800);
    res.horsLigne.banniereSurEvenementOffline = await page.evaluate(() => { const b = document.getElementById("offlineBanner"); return b ? { display: b.style.display, texte: b.innerText.trim().slice(0, 80) } : null; });
    await ctx.setOffline(false); await page.waitForTimeout(800);
    res.horsLigne.banniereApresOnline = await page.evaluate(() => (document.getElementById("offlineBanner") || {}).style.display);
    // display-mode standalone détecté ?
    res.horsLigne.standaloneDetection = await page.evaluate(() => ({ platformStandalone: window.PassioPlatform ? (PassioPlatform.isStandalone || PassioPlatform.standalone || null) : "PassioPlatform absent", matchMedia: matchMedia("(display-mode: standalone)").matches }));
    await ctx.close();
  }
  // manifest
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const r = await page.request.get(BASE + "/manifest.json");
  const man = await r.json();
  res.manifest = { status: r.status(), name: man.name, short_name: man.short_name, display: man.display, start_url: man.start_url, scope: man.scope, theme_color: man.theme_color, background_color: man.background_color, orientation: man.orientation, icons: man.icons.map((i) => i.src + " " + i.sizes + " " + i.purpose) };
  for (const i of ["icon-192.png", "icon-512.png", "sw.js"]) { const rr = await page.request.get(BASE + "/" + i); res.manifest[i] = rr.status(); }
  await ctx.close();
  fs.writeFileSync(path.join(OUT, "permissions-offline.json"), JSON.stringify(res, null, 1));
  await browser.close();
  console.log("OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
