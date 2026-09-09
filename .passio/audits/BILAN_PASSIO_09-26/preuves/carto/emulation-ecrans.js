// Émulation Chromium (jamais un appareil réel) : parcourt les 6 écrans + Bobines + page « Mes passions »,
// compte les commandes visibles, capture chaque écran, et vérifie « Tour démo » sous le shim MapLibre.
// Usage : PASSIO_PORT=8100 node emulation-ecrans.js  (cwd = racine du dépôt, serveur http déjà lancé)
const { chromium } = require("/home/user/passio-app/node_modules/playwright");
const path = require("path");
const fs = require("fs");
const { bootOnboarded } = require("/home/user/passio-app/tests/e2e/app-helper.js");
const OUT = __dirname;
const PORT = process.env.PASSIO_PORT || 8100;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", baseURL: "http://127.0.0.1:" + PORT });
  const page = await ctx.newPage();
  const errors = { js: [], console: [], network: [] };
  await bootOnboarded(page, errors, 3);
  await page.waitForTimeout(1500);
  const rapport = { sha: "c8cb8e99", port: PORT, ecrans: {}, nav: null, overlays: {}, tour: null, globals: null, storage: null, erreurs: null };

  rapport.nav = await page.evaluate(() => Array.from(document.querySelectorAll("#appNav .nav-item, #appNavV2 .nav-item")).map((n) => ({ nav: n.parentElement.id, screen: n.dataset.screen, action: n.getAttribute("data-v2-action"), label: n.textContent.trim(), visible: !!n.offsetParent })));
  rapport.topbar = await page.evaluate(() => Array.from(document.querySelectorAll(".topbar [onclick], .topbar [role=button]")).map((n) => ({ aria: n.getAttribute("aria-label"), onclick: n.getAttribute("onclick"), visible: !!n.offsetParent })));

  const ecrans = ["feed", "profiles", "studio", "explore", "irl", "messages"];
  for (const s of ecrans) {
    await page.evaluate((s) => goTo(s), s);
    await page.waitForTimeout(900);
    const mesure = await page.evaluate((s) => {
      const actif = document.querySelector(".screen.active");
      const sec = document.getElementById("screen-" + s);
      const vis = (sel, root) => Array.from(root.querySelectorAll(sel)).filter((n) => n.offsetParent !== null);
      const cmds = vis("[onclick],button,[role=button],a[href]", sec);
      const champs = vis("input,textarea,select", sec);
      const fns = new Set();
      cmds.forEach((n) => { const oc = n.getAttribute("onclick") || ""; const m = oc.match(/([A-Za-z_$][\w$.]*)\s*\(/g); if (m) m.forEach((x) => fns.add(x.replace(/\s*\($/, ""))); });
      return { actifId: actif && actif.id, attendu: "screen-" + s, ok: !!actif && actif.id === "screen-" + s, commandesVisibles: cmds.length, champsVisibles: champs.length, fonctionsOnclick: [...fns].sort(), noeudsTotal: sec.querySelectorAll("*").length, ctxPage: (document.getElementById("ctxToolsRoot") || {}).dataset ? document.getElementById("ctxToolsRoot").dataset.ctxPage : null };
    }, s);
    rapport.ecrans[s] = mesure;
    await page.screenshot({ path: path.join(OUT, `ecran-${s}.jpg`), type: "jpeg", quality: 35 });
  }

  // Bobines : l'entrée de nav ouvre le viewer, pas un écran.
  await page.evaluate(() => goTo("feed"));
  await page.waitForTimeout(300);
  const navBobinesVisible = await page.evaluate(() => { const n = document.querySelector("#appNav .nav-item[data-screen=bobines]"); return { present: !!n, visible: !!(n && n.offsetParent), display: n && getComputedStyle(n).display }; });
  await page.evaluate(() => { const n = document.querySelector("#appNav .nav-item[data-screen=bobines]"); if (n && n.offsetParent) n.click(); else openReels(); });
  await page.waitForTimeout(1200);
  rapport.overlays.bobines = await page.evaluate(() => { const v = document.getElementById("reelsViewer"); return { present: !!v, classe: v && v.className, ariaHidden: v && v.getAttribute("aria-hidden"), visible: !!(v && v.offsetParent), zIndex: v && getComputedStyle(v).zIndex, cartes: v ? v.querySelectorAll(".reel, .reel-card, [data-reel-id]").length : 0 }; });
  rapport.overlays.bobines.navItem = navBobinesVisible;
  await page.screenshot({ path: path.join(OUT, "overlay-bobines.jpg"), type: "jpeg", quality: 35 });
  await page.evaluate(() => { try { closeReels(); } catch (e) {} });
  await page.waitForTimeout(300);

  // Page « Mes passions » (plein écran dans #screen-profiles)
  await page.evaluate(() => { goTo("profiles"); openPassionManager(); });
  await page.waitForTimeout(700);
  rapport.overlays.passionManager = await page.evaluate(() => { const pm = document.getElementById("passionManager"); const sp = document.getElementById("screen-profiles"); return { visible: !!(pm && pm.offsetParent), classeEcran: sp && sp.className, freresMasques: Array.from(sp.children).filter((c) => c !== pm && c.offsetParent === null).length, freresTotal: sp.children.length - 1, portes: Array.from(pm.querySelectorAll("[onclick],[role=button],button")).filter((n) => n.offsetParent).map((n) => (n.id || n.className.split(" ")[0]) + "→" + (n.getAttribute("onclick") || "").slice(0, 60)) }; });
  await page.screenshot({ path: path.join(OUT, "overlay-mes-passions.jpg"), type: "jpeg", quality: 35 });
  await page.evaluate(() => { try { closeCurrentOverlay(); } catch (e) {} });

  // Feuilles basses et panneaux créés en JS
  rapport.overlays.dynamiques = await page.evaluate(() => ["v2CreateSheet", "v3PassioSheet", "modalBackdrop", "conv-fullpage", "irlFiltersPanel", "reelCommentsPanel", "tourOverlay", "devPanel", "convEmojiPanel", "vliveOverlay", "profileDotsMenu", "ctxToolsRoot", "postDetailPage", "storyViewer", "notifPanel"].map((id) => { const el = document.getElementById(id); return id + ":" + (el ? (el.offsetParent ? "visible" : "présent-masqué") : "ABSENT"); }));
  // « Créer » (nav-cta) ouvre la feuille V2 ?
  await page.evaluate(() => goTo("feed"));
  await page.evaluate(() => { const c = document.querySelector('#appNavV2 [data-v2-action="create"]') || document.querySelector("#appNav .nav-item[data-screen=studio]"); c.click(); });
  await page.waitForTimeout(700);
  rapport.overlays.creer = await page.evaluate(() => { const sh = document.getElementById("v2CreateSheet"); const st = document.getElementById("screen-studio"); return { feuilleVisible: !!(sh && sh.offsetParent), studioActif: !!(st && st.classList.contains("active")), items: sh ? Array.from(sh.querySelectorAll(".v2-sheet-item, [data-create], button")).filter((n) => n.offsetParent).map((n) => n.textContent.trim().replace(/\s+/g, " ").slice(0, 40)) : [] }; });
  await page.screenshot({ path: path.join(OUT, "overlay-creer.jpg"), type: "jpeg", quality: 35 });
  await page.keyboard.press("Escape");
  await page.evaluate(() => { try { closeCurrentOverlay(); } catch (e) {} });

  // Tour démo (panneau dev) : startTour() sous le shim MapLibre (L.tileLayer / L.marker)
  const avant = errors.js.length;
  rapport.tour = await page.evaluate(async () => { try { startTour(); await new Promise((r) => setTimeout(r, 2500)); const ov = document.getElementById("tourOverlay"); const map = document.getElementById("tourMap"); return { ouvert: !!(ov && ov.classList.contains("active")), mapEnfants: map ? map.children.length : -1, L: typeof L, mapShim: !!(window.L && String(L.map).includes("MapShim")), erreur: null }; } catch (e) { return { erreur: String(e) }; } });
  rapport.tour.erreursJsPendantTour = errors.js.slice(avant);
  await page.screenshot({ path: path.join(OUT, "overlay-tour.jpg"), type: "jpeg", quality: 35 });

  rapport.globals = await page.evaluate(() => { const ks = Object.keys(window); return { fonctionsWindow: ks.filter((k) => { try { return typeof window[k] === "function" && !/^(webkit|on)/.test(k); } catch (e) { return false; } }).length, clesWindowTotal: ks.length, passioNamespaces: ks.filter((k) => /^Passio|^PASSIO|^ContextualTools|^tel$/.test(k)) }; });
  rapport.storage = await page.evaluate(() => ({ localStorage: Object.keys(localStorage).sort(), sessionStorage: Object.keys(sessionStorage).sort() }));
  rapport.erreurs = { js: errors.js.slice(0, 20), console: errors.console.slice(0, 20), networkCount: errors.network.length, networkSample: errors.network.slice(0, 5) };
  fs.writeFileSync(path.join(OUT, "emulation-ecrans.json"), JSON.stringify(rapport, null, 2));
  console.log(JSON.stringify(rapport, null, 1));
  await browser.close();
})().catch((e) => { console.error("ECHEC", e); process.exit(1); });
