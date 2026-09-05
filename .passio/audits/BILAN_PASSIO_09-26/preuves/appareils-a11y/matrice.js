// Matrice appareils × écrans — BILAN PASSIO 09/26, domaine appareils-a11y.
// ÉMULATION Chromium uniquement (aucun appareil réel). Lecture seule, serveur local 8112.
const path = require("path");
const fs = require("fs");
const { chromium } = require("/home/user/passio-app/node_modules/@playwright/test");
const { bootOnboarded } = require("/home/user/passio-app/tests/e2e/app-helper.js");

const OUT = __dirname;
const BASE = "http://127.0.0.1:" + (process.env.PASSIO_PORT || 8112);
const VIEWPORTS = [
  [320, 568], [360, 740], [390, 844], [412, 915], [430, 932],
  [768, 1024], [1024, 768], [1280, 800], [1440, 900],
];
const ONLY = process.env.ONLY_VP ? process.env.ONLY_VP.split(",") : null;
const SCREENS = ["feed", "profiles", "irl", "messages", "explore", "studio", "mespassions", "filtre"];

// ─── mesures dans la page ───────────────────────────────────────────────────
const MESURES = () => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const sel = (el) => {
    if (!el) return "";
    let s = el.tagName.toLowerCase();
    if (el.id) return s + "#" + el.id;
    if (el.className && typeof el.className === "string") s += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    const oc = el.getAttribute && el.getAttribute("onclick"); if (oc) s += "[onclick=" + oc.slice(0, 28) + "]";
    const al = el.getAttribute && el.getAttribute("aria-label"); if (al) s += "[aria-label=" + al.slice(0, 20) + "]";
    if (!el.id && !oc && !al) { const t = (el.textContent || "").trim().slice(0, 18); if (t) s += "{" + t + "}"; }
    return s;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) return false;
    const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(cx, cy);
    if (!top) return false;
    return el === top || el.contains(top) || top.contains(el);
  };
  const out = {};
  out.innerWidth = vw; out.innerHeight = vh;
  out.scrollWidth = document.documentElement.scrollWidth;
  out.bodyScrollWidth = document.body.scrollWidth;
  out.debordementH = document.documentElement.scrollWidth > vw || document.body.scrollWidth > vw;
  // éléments qui dépassent à droite (pour localiser un débordement)
  out.depassent = [];
  if (out.debordementH) {
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed") { out.depassent.push(sel(el) + " right=" + Math.round(r.right)); if (out.depassent.length > 8) break; }
    }
  }
  const nav = [...document.querySelectorAll("#appNavV2, #appNav")].find((n) => n.getBoundingClientRect().height > 0) || document.getElementById("appNav");
  const navR = nav ? nav.getBoundingClientRect() : null;
  out.navVisible = !!navR && navR.height > 0 && navR.bottom <= vh + 0.5 && navR.top >= 0 && getComputedStyle(nav).display !== "none" && getComputedStyle(nav).visibility !== "hidden";
  out.navRect = navR ? { top: Math.round(navR.top), bottom: Math.round(navR.bottom), h: Math.round(navR.height) } : null;
  const shell = document.querySelector(".app-shell");
  const sr = shell ? shell.getBoundingClientRect() : null;
  out.shell = sr ? { left: Math.round(sr.left), width: Math.round(sr.width), height: Math.round(sr.height) } : null;
  out.appVh = document.documentElement.style.getPropertyValue("--app-vh");
  out.screenActif = (document.querySelector(".screen.active") || {}).id || null;
  // bouton principal : nav "Créer" ou premier .btn.primary visible
  const cta = document.querySelector(".nav-v2-cta") || document.querySelector(".nav-cta");
  const prim = [...document.querySelectorAll(".btn.primary, button.primary, .v4a5-footer button, #v4a5Done")].find(visible);
  out.boutonPrincipal = { navCreer: cta ? visible(cta) : null, btnPrimary: prim ? sel(prim) : null };
  // cibles tactiles
  const clickables = [...document.querySelectorAll("button, a[href], [role=button], [onclick], input[type=checkbox], input[type=radio], select, [role=tab], [tabindex='0']")].filter(visible);
  out.nbCliquablesVisibles = clickables.length;
  const petites = clickables.map((el) => { const r = el.getBoundingClientRect(); return { s: sel(el), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((x) => x.w < 44 || x.h < 44);
  out.nbCibles_moins44 = petites.length;
  out.nbCibles_moins24 = petites.filter((x) => x.w < 24 || x.h < 24).length;
  out.pires10 = petites.sort((a, b) => (a.w * a.h) - (b.w * b.h)).slice(0, 10);
  // champs < 16 px
  out.champs_moins16 = [...document.querySelectorAll("input, textarea, select")].filter(visible)
    .map((el) => ({ s: sel(el), fs: parseFloat(getComputedStyle(el).fontSize) })).filter((x) => x.fs < 16);
  out.nbChampsVisibles = [...document.querySelectorAll("input, textarea, select")].filter(visible).length;
  // img sans alt
  out.imgSansAlt = [...document.querySelectorAll("img")].filter((i) => visible(i) && !i.hasAttribute("alt")).map(sel);
  out.nbImgVisibles = [...document.querySelectorAll("img")].filter(visible).length;
  // titres
  out.titres = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible).map((h) => h.tagName + ":" + (h.textContent || "").trim().slice(0, 30));
  // boutons icône seule sans nom accessible
  const nomAcc = (el) => (el.getAttribute("aria-label") || "").trim() || (el.getAttribute("aria-labelledby") || "").trim() || (el.getAttribute("title") || "").trim()
    || [...el.querySelectorAll("img[alt]")].map((i) => i.alt).join("").trim() || [...el.querySelectorAll("svg title")].map((t) => t.textContent).join("").trim();
  out.iconesSansNom = [...document.querySelectorAll("button, a[href], [role=button]")].filter(visible)
    .filter((el) => (el.textContent || "").replace(/[\s​]/g, "").length === 0 && !nomAcc(el)).map(sel).slice(0, 15);
  out.nbIconesSansNom = [...document.querySelectorAll("button, a[href], [role=button]")].filter(visible)
    .filter((el) => (el.textContent || "").replace(/[\s​]/g, "").length === 0 && !nomAcc(el)).length;
  // contrastes
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const bgOf = (el) => {
    let e = el; const layers = [];
    while (e && e !== document.documentElement) {
      const cs = getComputedStyle(e); const c = parse(cs.backgroundColor);
      const hasImg = cs.backgroundImage && cs.backgroundImage !== "none";
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      if (hasImg && !(c && c.a >= 1)) { return { c: null, img: true }; }
      e = e.parentElement;
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
    return { c: bg, img: false };
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const SAMPLE = ".muted, .post-author-meta, .post-mood-tag, .post-passion-tag, [class*=badge], .pill, .btn.primary, .nav-label, .v2-sheet-item, .psel-tile, .profile-tile-label, .event-meta, .event-card-meta, small, .hint, .sub, .msg-time, .msg-preview, .conv-time, .topbar-chip, .feed-intent-btn, .tab, .explore-tab, .v4a5-chip, .v4a5-case, [class*=lavis], .passions-page-sub, .card-sub, .meta, .time, .story-name, .cnt, .count, label, .btn.ghost, .btn.secondary, .irl-filter-chip, .chip";
  const seen = new Set(); const contr = [];
  for (const el of document.querySelectorAll(SAMPLE)) {
    if (!visible(el)) continue;
    // ne garder que les éléments dont le texte est direct
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    if (!txt) continue;
    const cs = getComputedStyle(el); const fg0 = parse(cs.color); if (!fg0) continue;
    const bg = bgOf(el); if (bg.img || !bg.c) { contr.push({ s: sel(el), txt: txt.slice(0, 20), ratio: null, note: "fond image/dégradé" }); continue; }
    const fg = fg0.a < 1 ? blend(fg0, bg.c) : fg0;
    const fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight, 10) || 400;
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const r = ratio(fg, bg.c);
    const key = sel(el) + "|" + cs.color + "|" + cs.fontSize; if (seen.has(key)) continue; seen.add(key);
    contr.push({ s: sel(el), txt: txt.slice(0, 20), ratio: Math.round(r * 100) / 100, fs, fw, large, seuil: large ? 3 : 4.5, ok: r >= (large ? 3 : 4.5), fg: cs.color, bg: `rgb(${Math.round(bg.c.r)},${Math.round(bg.c.g)},${Math.round(bg.c.b)})` });
  }
  out.contrastes = contr;
  out.contrastesKO = contr.filter((c) => c.ratio !== null && !c.ok);
  out.lang = document.documentElement.lang;
  return out;
};

async function goScreen(page, s) {
  if (s === "mespassions") {
    await page.evaluate(() => { goTo("profiles"); });
    await page.waitForTimeout(400);
    await page.evaluate(() => { if (typeof openPassionManager === "function") openPassionManager(); });
  } else if (s === "filtre") {
    await page.evaluate(() => { goTo("irl"); });
    await page.waitForTimeout(500);
    const b = page.locator("#irlToolsBtn");
    if (await b.count()) { try { await b.click({ timeout: 4000 }); } catch (e) { await page.evaluate(() => { const b = document.getElementById("irlToolsBtn"); b && b.click(); }); } }
  } else {
    await page.evaluate((s) => { goTo(s); }, s);
  }
  await page.waitForTimeout(900);
}

async function shot(page, name) {
  const p = path.join(OUT, name + ".jpg");
  await page.screenshot({ path: p, type: "jpeg", quality: 45 });
  const size = fs.statSync(p).size;
  if (size > 300 * 1024) { await page.screenshot({ path: p, type: "jpeg", quality: 25 }); }
  return path.basename(p) + " (" + Math.round(fs.statSync(p).size / 1024) + " Ko)";
}

async function focusEtClavier(page) {
  // Tab ×10 : focus visible ?
  await page.evaluate(() => { goTo("feed"); document.body.focus(); });
  await page.waitForTimeout(300);
  const tabs = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    tabs.push(await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return { s: "body" };
      const cs = getComputedStyle(el);
      const sel = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : "");
      const r = el.getBoundingClientRect();
      return { s: sel, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow !== "none", focusVisible: el.matches(":focus-visible"), dansViewport: r.top >= 0 && r.bottom <= innerHeight && r.width > 0 };
    }));
  }
  // Entrée / Espace sur [role=button] (nav IRL puis nav Fil)
  await page.evaluate(() => { const n = (document.querySelector('#appNavV2 [data-screen="irl"]') || document.querySelector('.nav-item[data-screen="irl"]')); n && n.focus(); });
  await page.keyboard.press("Enter"); await page.waitForTimeout(400);
  const apresEntree = await page.evaluate(() => (document.querySelector(".screen.active") || {}).id);
  await page.evaluate(() => { const n = (document.querySelector('#appNavV2 [data-screen="feed"]') || document.querySelector('.nav-item[data-screen="feed"]')); n && n.focus(); });
  await page.keyboard.press(" "); await page.waitForTimeout(400);
  const apresEspace = await page.evaluate(() => (document.querySelector(".screen.active") || {}).id);
  // Échap ferme une modale ?
  await page.evaluate(() => { if (typeof openPassionPaywall === "function") { try { openPassionPaywall(); } catch (e) {} } });
  await page.waitForTimeout(300);
  const modaleOuverte = await page.evaluate(() => document.getElementById("modalBackdrop").classList.contains("active"));
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  const modaleApresEchap = await page.evaluate(() => document.getElementById("modalBackdrop").classList.contains("active"));
  // focus piégé dans la modale ? (Tab depuis la modale reste-t-il dedans ?)
  await page.evaluate(() => { if (typeof openPassionPaywall === "function") { try { openPassionPaywall(); } catch (e) {} } });
  await page.waitForTimeout(300);
  const piege = [];
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); piege.push(await page.evaluate(() => { const el = document.activeElement; return !!(el && el.closest && el.closest("#modalBackdrop")); })); }
  const focusInitialModale = piege[0];
  await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  return { tabs, entreeSurNavIrl: apresEntree, espaceSurNavFeed: apresEspace, modaleOuverte, modaleFermeeParEchap: modaleOuverte && !modaleApresEchap, focusResteDansModale: piege.every(Boolean), focusPremierTabDansModale: focusInitialModale };
}

(async () => {
  const browser = await chromium.launch();
  const rapport = { date: new Date().toISOString(), base: BASE, methode: "ÉMULATION Chromium (Playwright) — aucun appareil réel", matrice: [], focus: null, reducedMotion: null, zoom: null, paysage: null, desktop: null, permissions: null, pwa: null, erreursJS: {} };
  for (const [w, h] of VIEWPORTS) {
    const key = w + "x" + h;
    if (ONLY && !ONLY.includes(key)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "fr-FR", baseURL: BASE, deviceScaleFactor: 1, hasTouch: w < 700, isMobile: w < 700 });
    const page = await ctx.newPage();
    const errs = { js: [], console: [], network: [] };
    try {
      await bootOnboarded(page, errs, 3);
      for (const s of SCREENS) {
        try {
          await goScreen(page, s);
          const m = await page.evaluate(MESURES);
          m.capture = await shot(page, key + "-" + s);
          m.viewport = key; m.ecran = s;
          rapport.matrice.push(m);
        } catch (e) { rapport.matrice.push({ viewport: key, ecran: s, erreur: String(e).slice(0, 200) }); }
        // refermer ce qui a été ouvert
        await page.evaluate(() => { try { closeModal(); } catch (e) {} try { if (typeof closeCurrentOverlay === "function") closeCurrentOverlay(); } catch (e) {} });
      }
      if (key === "390x844") {
        rapport.focus = await focusEtClavier(page);
        // reduced motion
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.evaluate(() => { goTo("irl"); goTo("feed"); });
        await page.waitForTimeout(200);
        const animReduce = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => { const cs = getComputedStyle(el); return cs.animationName !== "none" && cs.animationDuration !== "0s"; }).map((el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + (typeof el.className === "string" ? el.className.split(" ")[0] : "") + ":" + getComputedStyle(el).animationName).slice(0, 20));
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.evaluate(() => { goTo("irl"); goTo("feed"); });
        await page.waitForTimeout(50);
        const animNormal = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => { const cs = getComputedStyle(el); return cs.animationName !== "none" && cs.animationDuration !== "0s"; }).length);
        rapport.reducedMotion = { animationsActivesSousReduce: animReduce, nbAnimationsActivesSansPreference: animNormal };
        // zoom 200 % (CSS zoom) et texte 200 %
        const zoom = {};
        for (const s of ["feed", "profiles", "irl", "studio"]) {
          await goScreen(page, s);
          await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
          await page.waitForTimeout(300);
          const m = await page.evaluate(MESURES);
          zoom["zoom200_" + s] = { debordementH: m.debordementH, scrollWidth: m.scrollWidth, navVisible: m.navVisible, navRect: m.navRect, boutonPrincipal: m.boutonPrincipal, capture: await shot(page, key + "-zoom200-" + s) };
          await page.evaluate(() => { document.documentElement.style.zoom = ""; });
        }
        for (const s of ["feed", "irl"]) {
          await goScreen(page, s);
          await page.evaluate(() => { document.body.style.fontSize = "200%"; document.querySelectorAll(".app-shell *").forEach((el) => { const cs = getComputedStyle(el); if (cs.fontSize) el.style.fontSize = (parseFloat(cs.fontSize) * 2) + "px"; }); });
          await page.waitForTimeout(400);
          const m = await page.evaluate(MESURES);
          zoom["texte200_" + s] = { debordementH: m.debordementH, scrollWidth: m.scrollWidth, depassent: m.depassent, navVisible: m.navVisible, navRect: m.navRect, capture: await shot(page, key + "-texte200-" + s) };
          await page.evaluate(() => { document.body.style.fontSize = ""; document.querySelectorAll(".app-shell *").forEach((el) => { el.style.fontSize = ""; }); });
        }
        rapport.zoom = zoom;
      }
    } catch (e) { rapport.matrice.push({ viewport: key, erreur: "boot: " + String(e).slice(0, 300) }); }
    rapport.erreursJS[key] = errs;
    await ctx.close();
  }
  // Paysage mobile 844×390
  if (!ONLY || ONLY.includes("844x390")) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, locale: "fr-FR", baseURL: BASE, hasTouch: true, isMobile: true });
    const page = await ctx.newPage(); const errs = { js: [], console: [], network: [] };
    const pays = {};
    try {
      await bootOnboarded(page, errs, 3);
      for (const s of ["feed", "irl", "studio", "messages"]) {
        await goScreen(page, s);
        const m = await page.evaluate(MESURES);
        pays[s] = { debordementH: m.debordementH, navVisible: m.navVisible, navRect: m.navRect, shell: m.shell, appVh: m.appVh, boutonPrincipal: m.boutonPrincipal, nbCibles_moins44: m.nbCibles_moins44, capture: await shot(page, "844x390-" + s) };
      }
    } catch (e) { pays.erreur = String(e).slice(0, 200); }
    rapport.paysage = pays; rapport.erreursJS["844x390"] = errs; await ctx.close();
  }
  // Desktop souris : hover + centrage
  if (!ONLY || ONLY.includes("1280x800")) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "fr-FR", baseURL: BASE });
    const page = await ctx.newPage(); const errs = { js: [], console: [], network: [] };
    const d = {};
    try {
      await bootOnboarded(page, errs, 3);
      d.shell = await page.evaluate(() => { const r = document.querySelector(".app-shell").getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width), right: Math.round(innerWidth - r.right), centre: Math.abs(r.left - (innerWidth - r.right)) < 2 }; });
      const avant = await page.evaluate(() => { const n = (document.querySelector('#appNavV2 [data-screen="irl"]') || document.querySelector('.nav-item[data-screen="irl"]')); const cs = getComputedStyle(n); return { bg: cs.backgroundColor, color: cs.color, cursor: cs.cursor }; });
      await page.hover('#appNavV2 [data-screen="irl"]'); await page.waitForTimeout(300);
      const apres = await page.evaluate(() => { const n = (document.querySelector('#appNavV2 [data-screen="irl"]') || document.querySelector('.nav-item[data-screen="irl"]')); const cs = getComputedStyle(n); return { bg: cs.backgroundColor, color: cs.color, cursor: cs.cursor }; });
      d.hoverNav = { avant, apres, change: JSON.stringify(avant) !== JSON.stringify(apres) };
      const btn = page.locator(".post .post-action, .post button, .post [role=button]").first();
      if (await btn.count()) {
        const b1 = await btn.evaluate((el) => { const cs = getComputedStyle(el); return cs.backgroundColor + "|" + cs.color + "|" + cs.cursor + "|" + cs.transform; });
        await btn.hover(); await page.waitForTimeout(300);
        const b2 = await btn.evaluate((el) => { const cs = getComputedStyle(el); return cs.backgroundColor + "|" + cs.color + "|" + cs.cursor + "|" + cs.transform; });
        d.hoverPostAction = { avant: b1, apres: b2, change: b1 !== b2 };
      }
      d.cursorPointerSurRoleButton = await page.evaluate(() => [...document.querySelectorAll('[role=button], [onclick]')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => getComputedStyle(el).cursor).reduce((a, c) => { a[c] = (a[c] || 0) + 1; return a; }, {}));
    } catch (e) { d.erreur = String(e).slice(0, 200); }
    rapport.desktop = d; await ctx.close();
  }
  // Permissions refusées
  if (!ONLY || ONLY.includes("perm")) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", baseURL: BASE, hasTouch: true, isMobile: true, permissions: [] });
    const page = await ctx.newPage(); const errs = { js: [], console: [], network: [] };
    await page.addInitScript(() => {
      window.__perm = { geo: 0, gum: 0, notif: 0, share: 0 };
      const err = (name, msg) => { const e = new Error(msg); e.name = name; return e; };
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = function (ok, ko) { window.__perm.geo++; setTimeout(() => ko && ko({ code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1 }), 20); };
        navigator.geolocation.watchPosition = function (ok, ko) { window.__perm.geo++; setTimeout(() => ko && ko({ code: 1, message: "User denied Geolocation" }), 20); return 1; };
      }
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = function () { window.__perm.gum++; return Promise.reject(err("NotAllowedError", "Permission denied")); };
      }
      if (window.Notification) {
        try { Object.defineProperty(Notification, "permission", { get: () => "denied", configurable: true }); } catch (e) {}
        Notification.requestPermission = function () { window.__perm.notif++; return Promise.resolve("denied"); };
      }
      navigator.share = function () { window.__perm.share++; return Promise.reject(err("NotAllowedError", "Permission denied")); };
      navigator.clipboard = navigator.clipboard || {};
      navigator.clipboard.writeText = () => Promise.resolve();
    });
    const P = {};
    try {
      await bootOnboarded(page, errs, 3);
      await page.evaluate(() => { window.__toasts = []; const t0 = window.toast; window.toast = function (m, ty) { window.__toasts.push(String(m)); return t0.apply(this, arguments); }; });
      // géoloc : écran IRL
      await page.evaluate(() => { goTo("irl"); });
      await page.waitForTimeout(1200);
      await page.evaluate(() => { try { if (typeof requestUserLocation === "function") requestUserLocation(); } catch (e) {} });
      await page.waitForTimeout(800);
      P.geolocIRL = await page.evaluate(() => ({ appels: window.__perm.geo, titreVille: (document.getElementById("irlUserCityName") || {}).textContent, toasts: window.__toasts.slice(), ecran: (document.querySelector(".screen.active") || {}).id, messageVisible: !!document.querySelector("[class*=geo], [class*=location-denied], [class*=permission]") }));
      P.geolocIRL.capture = await shot(page, "perm-geoloc-irl");
      // redemande en boucle ? aller-retour ×3
      for (let i = 0; i < 3; i++) { await page.evaluate(() => { goTo("feed"); goTo("irl"); }); await page.waitForTimeout(400); }
      await page.evaluate(() => { try { requestUserLocation(); requestUserLocation(); } catch (e) {} });
      await page.waitForTimeout(300);
      P.geolocRedemandes = await page.evaluate(() => window.__perm.geo);
      // check-in avec GPS refusé : la fonction fait confiance (inspection app-07:3466) — mesure de l'appel
      // caméra : éditeur média
      await page.evaluate(() => { window.__toasts = []; try { if (typeof meOpen === "function") meOpen("story"); } catch (e) { window.__meOpenErr = String(e); } });
      await page.waitForTimeout(1500);
      P.camera = await page.evaluate(() => { const ed = document.getElementById("mediaEditor"); const ph = document.getElementById("mePlaceholder"); return { appelsGUM: window.__perm.gum, meOpenErr: window.__meOpenErr || null, editeurOuvert: !!ed && getComputedStyle(ed).display !== "none", classes: ed ? ed.className : null, placeholderVisible: !!ph && !ph.classList.contains("hidden") && ph.getBoundingClientRect().height > 0, placeholderTexte: ph ? ph.textContent.replace(/\s+/g, " ").trim().slice(0, 120) : null, loaderVisible: (() => { const l = document.querySelector(".me-cam-loading"); return !!l && getComputedStyle(l).display !== "none" && l.getBoundingClientRect().height > 0; })(), toasts: window.__toasts.slice(), messageRefusExplicite: /cam[ée]ra|autoris/i.test((ph && ph.textContent) || "") }; });
      P.camera.capture = await shot(page, "perm-camera");
      await page.evaluate(() => { try { if (typeof meClose === "function") meClose(); } catch (e) {} try { if (typeof closeCurrentOverlay === "function") closeCurrentOverlay(); } catch (e) {} });
      // micro : vocal messagerie
      await page.evaluate(() => { window.__toasts = []; try { startVoiceRecord(); } catch (e) { window.__voiceErr = String(e); } });
      await page.waitForTimeout(600);
      P.microMessagerie = await page.evaluate(() => ({ appelsGUM: window.__perm.gum, toasts: window.__toasts.slice(), err: window.__voiceErr || null, isRecording: !!window._isRecording }));
      // micro : studio audio
      await page.evaluate(() => { window.__toasts = []; goTo("studio"); });
      await page.waitForTimeout(500);
      await page.evaluate(() => { try { if (typeof toggleAudioRecord === "function") toggleAudioRecord(); else if (typeof startAudioRecording === "function") startAudioRecording(); else window.__studioAudio = "fonction introuvable"; } catch (e) { window.__studioAudio = String(e); } });
      await page.waitForTimeout(600);
      P.microStudio = await page.evaluate(() => ({ appelsGUM: window.__perm.gum, toasts: window.__toasts.slice(), note: window.__studioAudio || null }));
      // notifications
      await page.evaluate(() => { window.__toasts = []; });
      await page.evaluate(() => { try { requestCallNotifications(); } catch (e) { window.__notifErr = String(e); } });
      await page.waitForTimeout(400);
      P.notifications = await page.evaluate(() => ({ appelsRequest: window.__perm.notif, permission: Notification.permission, toasts: window.__toasts.slice(), err: window.__notifErr || null, note: "Notification.permission==='denied' → requestCallNotifications retourne SANS message (app-05:1155)" }));
      // partage
      await page.evaluate(() => { window.__toasts = []; try { partagerOuCopier({ title: "PASSIO", url: location.href }, "Lien copié"); } catch (e) { window.__shareErr = String(e); } });
      await page.waitForTimeout(500);
      P.partage = await page.evaluate(() => ({ appelsShare: window.__perm.share, toasts: window.__toasts.slice(), err: window.__shareErr || null }));
      // appel vocal : micro refusé
      await page.evaluate(() => { window.__toasts = []; });
      const callFn = await page.evaluate(() => typeof startCall === "function" ? "startCall" : (typeof _callStart === "function" ? "_callStart" : null));
      P.appel = { fonction: callFn, note: "Inspection app-05:845 : catch → toast « Caméra/micro refusé » + fermeture UI" };
      P.appUtilisable = await page.evaluate(() => { goTo("feed"); return (document.querySelector(".screen.active") || {}).id === "screen-feed" && document.querySelectorAll("#feedList .post").length > 0; });
    } catch (e) { P.erreur = String(e).slice(0, 300); }
    rapport.permissions = P; rapport.erreursJS["perm"] = errs; await ctx.close();
  }
  // PWA : hors-ligne
  if (!ONLY || ONLY.includes("pwa")) {
    const pwa = {};
    // 1er lancement hors-ligne (aucun SW)
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: BASE });
      await ctx.setOffline(true);
      const page = await ctx.newPage();
      try { await page.goto(BASE + "/index.html", { timeout: 8000 }); pwa.premierLancementHorsLigne = { resultat: "page chargée ?", titre: await page.title(), texte: (await page.evaluate(() => document.body.innerText.slice(0, 120))) }; }
      catch (e) { pwa.premierLancementHorsLigne = { resultat: "ERREUR NAVIGATEUR (page d'erreur Chromium, rien de PASSIO)", erreur: String(e).split("\n")[0].slice(0, 160) }; }
      await ctx.close();
    }
    // 2e lancement : SW installé puis hors-ligne
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: BASE, serviceWorkers: "allow" });
      const page = await ctx.newPage(); const errs = { js: [], console: [], network: [] };
      try {
        await bootOnboarded(page, errs, 1);
        const sw = await page.evaluate(async () => { if (!("serviceWorker" in navigator)) return { support: false }; const reg = await navigator.serviceWorker.getRegistration(); await new Promise((r) => setTimeout(r, 2500)); const reg2 = await navigator.serviceWorker.getRegistration(); return { support: true, enregistre: !!reg2, actif: !!(reg2 && reg2.active), controller: !!navigator.serviceWorker.controller, scope: reg2 && reg2.scope, standalone: matchMedia("(display-mode: standalone)").matches, caches: await caches.keys() }; });
        pwa.serviceWorker = sw;
        // naviguer sur les écrans pour peupler le cache runtime, puis hors-ligne
        await page.evaluate(() => { goTo("irl"); goTo("profiles"); goTo("feed"); });
        await page.waitForTimeout(1500);
        pwa.cacheContenu = await page.evaluate(async () => { const ks = await caches.keys(); const out = {}; for (const k of ks) { const c = await caches.open(k); out[k] = (await c.keys()).map((r) => new URL(r.url).pathname).slice(0, 40); } return out; });
        await ctx.setOffline(true);
        await page.reload({ waitUntil: "load", timeout: 15000 }).catch((e) => { pwa.rechargementHorsLigneErreur = String(e).slice(0, 160); });
        await page.waitForTimeout(3500);
        pwa.secondLancementHorsLigne = await page.evaluate(() => ({ titre: document.title, feedActif: !!document.querySelector("#screen-feed.active"), nbPosts: document.querySelectorAll("#feedList .post").length, gateVisible: !!document.querySelector("#accessGate, .access-gate, #gate") && getComputedStyle(document.querySelector("#accessGate, .access-gate, #gate")).display !== "none", texteDebut: document.body.innerText.replace(/\s+/g, " ").slice(0, 160), stylesAppliques: getComputedStyle(document.body).margin === "0px" && !!document.querySelector(".app-shell") && getComputedStyle(document.querySelector(".app-shell")).display === "flex", appJsCharge: typeof goTo === "function" }));
        pwa.secondLancementHorsLigne.capture = await shot(page, "pwa-offline-2e-lancement");
        // bandeau hors-ligne ?
        pwa.indicateurHorsLigne = await page.evaluate(() => { const c = [...document.querySelectorAll("[class*=offline], [id*=offline], [class*=hors-ligne]")].filter((e) => e.getBoundingClientRect().height > 0); return c.map((e) => e.className + ":" + e.textContent.trim().slice(0, 60)); });
      } catch (e) { pwa.erreur2 = String(e).slice(0, 300); }
      pwa.erreursJS = errs; await ctx.close();
    }
    rapport.pwa = pwa;
  }
  fs.writeFileSync(path.join(OUT, "matrice.json"), JSON.stringify(rapport, null, 1));
  // synthèse lisible
  const lignes = ["viewport | écran | débord.H | nav visible | CTA nav | cibles<44 (<24) / cliquables | champs<16 | img sans alt | contrastes KO | icônes sans nom | capture"];
  for (const m of rapport.matrice) {
    if (m.erreur) { lignes.push(`${m.viewport} | ${m.ecran || "-"} | ERREUR ${m.erreur}`); continue; }
    lignes.push(`${m.viewport} | ${m.ecran} | ${m.debordementH ? "OUI sw=" + m.scrollWidth : "non"} | ${m.navVisible ? "oui" : "NON " + JSON.stringify(m.navRect)} | ${m.boutonPrincipal.navCreer} | ${m.nbCibles_moins44} (${m.nbCibles_moins24}) / ${m.nbCliquablesVisibles} | ${m.champs_moins16.length}/${m.nbChampsVisibles} | ${m.imgSansAlt.length}/${m.nbImgVisibles} | ${m.contrastesKO.length}/${m.contrastes.length} | ${m.nbIconesSansNom} | ${m.capture}`);
  }
  fs.writeFileSync(path.join(OUT, "matrice.txt"), lignes.join("\n"));
  console.log(lignes.join("\n"));
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
