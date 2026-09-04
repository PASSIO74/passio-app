// Parcours VISITEUR (émulation Chromium 390×844) — audit ux-onboarding, lecture seule.
// Sortie : captures + journal JSON dans le dossier de preuves.
const { chromium } = require("/home/user/passio-app/node_modules/playwright");
const fs = require("fs");
const OUT = __dirname;
const BASE = "http://127.0.0.1:" + (process.env.PASSIO_PORT || 8101);
const GATE_KEY = "passio_gate_v1";
const GATE_TOKEN = "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f";
const J = { etapes: [], erreursConsole: [], permissions: [], reseauBloque: 0 };
const t0 = Date.now();
function log(nom, data) { J.etapes.push(Object.assign({ t_ms: Date.now() - t0, etape: nom }, data || {})); console.log(nom, JSON.stringify(data || {})); }

async function snap(page, nom) { await page.screenshot({ path: OUT + "/" + nom + ".png", fullPage: false }); }
async function etat(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const vis = (el) => !!(el && el.offsetParent);
    const navV2 = [...document.querySelectorAll(".app-nav-v2 .nav-item")].map(n => ({ key: n.getAttribute("data-v2-key"), label: n.textContent.trim(), active: n.classList.contains("active"), ariaCurrent: n.getAttribute("aria-current") }));
    const tip = q(".fr-tip");
    const hint = q(".passio-hint");
    const modal = q("#modalBackdrop");
    const onb = q("#onboarding");
    const carte = q("#frWelcome");
    return {
      hash: location.hash,
      racineFirstRun: document.documentElement.classList.contains("passio-first-run"),
      ecranActif: (q(".screen.active") || {}).id || null,
      nbEcransActifs: document.querySelectorAll(".screen.active").length,
      nbNavActifs: document.querySelectorAll(".app-nav-v2 .nav-item.active").length,
      navV2,
      carteBienvenue: carte ? carte.innerText.replace(/\s+/g, " ").trim() : null,
      tip: tip ? { id: tip.getAttribute("data-fr-tip"), texte: tip.innerText.replace(/\s+/g, " ").trim() } : null,
      hint: hint ? { id: hint.getAttribute("data-hint"), texte: hint.innerText.replace(/\s+/g, " ").trim() } : null,
      modalOuverte: !!(modal && modal.classList.contains("active")),
      modalTexte: modal && modal.classList.contains("active") ? (q("#modalBackdrop").innerText || "").replace(/\s+/g, " ").trim().slice(0, 400) : null,
      onboardingActif: !!(onb && onb.classList.contains("active")),
      onbStep: (q(".onb-step.active") || {}).getAttribute ? (q(".onb-step.active") || {}).getAttribute("data-onb-step") : null,
      sortieExploration: vis(q("#frBackToExplore")),
      mediaEditorOuvert: !!(q("#mediaEditor") && q("#mediaEditor").classList.contains("open")),
      eventDetailAffiche: !!(q("#eventDetailPage") && getComputedStyle(q("#eventDetailPage")).display !== "none"),
      reelsOuvert: !!(window.reelsState && window.reelsState.open),
      prefs: (() => { try { return JSON.parse(localStorage.getItem("passio_first_run_v1") || "null"); } catch (e) { return "ERR"; } })(),
      bienvenueFermeeSession: sessionStorage.getItem("passio_first_run_bienvenue_fermee"),
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.route("**/*", (route) => {
    const url = route.request().url();
    if (/supabase|jsdelivr|unpkg|cdnjs|netlify|googleapis|gstatic/i.test(url)) { J.reseauBloque++; return route.abort(); }
    return route.continue();
  });
  await ctx.addInitScript(([k, t]) => {
    sessionStorage.setItem(k, t);
    sessionStorage.setItem("passio_pwa_dismissed", "1");
    window.__perms = [];
    try {
      const g = navigator.geolocation;
      if (g) {
        const o = g.getCurrentPosition.bind(g);
        g.getCurrentPosition = function () { window.__perms.push({ quoi: "geolocation.getCurrentPosition", pile: (new Error()).stack.split("\n").slice(2, 5).join(" | ") }); return o.apply(g, arguments); };
        const w = g.watchPosition.bind(g);
        g.watchPosition = function () { window.__perms.push({ quoi: "geolocation.watchPosition" }); return w.apply(g, arguments); };
      }
      if (window.Notification && Notification.requestPermission) {
        const o = Notification.requestPermission.bind(Notification);
        Notification.requestPermission = function () { window.__perms.push({ quoi: "Notification.requestPermission" }); return o.apply(Notification, arguments); };
      }
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const o = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = function (c) { window.__perms.push({ quoi: "getUserMedia", c: JSON.stringify(c) }); return o(c); };
      }
    } catch (e) {}
  }, [GATE_KEY, GATE_TOKEN]);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") J.erreursConsole.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => J.erreursConsole.push("PAGEERROR " + String(e).slice(0, 300)));


  await page.goto(BASE + "/index.html");
  await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined", null, { timeout: 20000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => { const b = document.querySelector("#frWelcome .fr-welcome-alt"); if (b) b.click(); });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { try { PassioFirstRun.abandonnerTour(); } catch (e) {} });

  // Messages : les conversations de démonstration sont-elles étiquetées ?
  await page.click('.app-nav-v2 [data-v2-key="messages"]'); await page.waitForTimeout(1000);
  const msg = await page.evaluate(() => ({ nbConvs: document.querySelectorAll("#screen-messages .conv-item, #convList > *, #screen-messages [onclick*=openConv]").length, texte: document.getElementById("screen-messages").innerText.replace(/\s+/g, " ").trim().slice(0, 500), exemple: /exemple|démo|demo/i.test(document.getElementById("screen-messages").innerText) }));
  log("M1 Messages visiteur : conversations de démo", msg);
  const conv = await page.$("#screen-messages [onclick*=openConv], #convList > *");
  if (conv) { await conv.click(); await page.waitForTimeout(900); const c = await page.evaluate(() => { const fp = document.getElementById("conv-fullpage"); return { ouverte: !!(fp && fp.classList.contains("active")), texte: fp ? fp.innerText.replace(/\s+/g, " ").trim().slice(0, 300) : null, modal: (document.getElementById("modalBackdrop") || {}).className }; }); log("M2 ouverture d'une conversation de démo (visiteur)", c); await snap(page, "33-conv-demo-visiteur"); await page.evaluate(() => { try { closeConvFullpage(); } catch (e) { try { closeCurrentOverlay(); } catch (_) {} } }); }

  // Feuille Créer : chaque entrée, pour un visiteur
  const items = await page.evaluate(() => { openCreateSheet && 0; return 0; }).catch(() => 0);
  await page.click('.app-nav-v2 [data-v2-key="create"]'); await page.waitForTimeout(600);
  const libs = await page.$$eval("#v2CreateSheet .v2-sheet-item", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  const rect = await page.evaluate(() => { const s = document.getElementById("v2CreateSheet"); const r = s.getBoundingClientRect(); return { open: s.classList.contains("open"), hidden: s.hidden, h: r.height, top: r.top }; });
  log("C0 feuille Créer", { libs, rect });
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  for (let i = 0; i < libs.length; i++) {
    await page.evaluate(() => window.__perms = []);
    await page.click('.app-nav-v2 [data-v2-key="create"]'); await page.waitForTimeout(500);
    const it = (await page.$$("#v2CreateSheet .v2-sheet-item"))[i];
    if (!it) continue;
    await it.click(); await page.waitForTimeout(900);
    const e = await etat(page);
    const perms = await page.evaluate(() => window.__perms);
    const live = await page.evaluate(() => ({ vlive: !!(document.getElementById("vliveOverlay") && document.getElementById("vliveOverlay").classList.contains("active")), audio: !!(document.getElementById("audioRecorder") && document.getElementById("audioRecorder").classList.contains("active")), anyOverlay: [...document.querySelectorAll("body > .active, body > [class*=overlay].active")].map(x => x.id || x.className).slice(0, 5) }));
    log("C" + (i + 1) + " Créer → « " + libs[i] + " » (visiteur)", { ecran: e.ecranActif, modal: e.modalTexte ? e.modalTexte.slice(0, 80) : null, mediaEditor: e.mediaEditorOuvert, perms, live });
    await snap(page, "34-creer-" + (i + 1));
    await page.evaluate(() => { try { closeModal(); } catch (e) {} try { if (typeof meClose === "function") meClose(); } catch (e) {} try { closeCurrentOverlay(); } catch (e) {} });
    await page.evaluate(() => goTo("feed")); await page.waitForTimeout(400);
  }

  // Fiche activité : CTA « + Rejoindre » pour un visiteur
  await page.evaluate(() => goTo("irl")); await page.waitForTimeout(900);
  await page.evaluate(() => { try { openEventDetails("e1"); } catch (e) { window.__err = String(e); } }); await page.waitForTimeout(800);
  const ctas = await page.$$eval("#eventDetailCta button", (els) => els.map((b) => ({ label: b.textContent.trim(), disabled: b.disabled })));
  log("E1 fiche e1 (visiteur) : CTA", { ctas, etiquette: await page.evaluate(() => (document.getElementById("eventDetailPage") || {}).innerText.match(/Exemple[^\n]*/) ? document.getElementById("eventDetailPage").innerText.match(/Exemple[^\n]*/)[0] : null) });
  await snap(page, "09-fiche-activite-visiteur");
  const cta = await page.$("#eventDetailCta button:not([disabled])");
  if (cta) { await cta.click(); await page.waitForTimeout(700); const e = await etat(page); log("E2 tap CTA → ", { modal: e.modalTexte, toast: await page.evaluate(() => [...document.querySelectorAll(".toast, #toastHost > *, [class*=toast]")].map(t => t.textContent.trim()).filter(Boolean).slice(0, 3)) }); await snap(page, "10-gate-rejoindre"); await page.evaluate(() => { try { closeModal(); } catch (e) {} }); }
  await page.evaluate(() => { try { closeEventDetails(); } catch (e) { try { closeCurrentOverlay(); } catch (_) {} } });
  await page.evaluate(() => goTo("feed")); await page.waitForTimeout(500);

  // Like → gate « aimer » ; double clic « Créer mon compte »
  const like = await page.$('#feedList .post .post-action[data-action="like"]');
  await like.click(); await page.waitForTimeout(600);
  const e19 = await etat(page);
  log("L1 like (visiteur) → gate", { modal: e19.modalTexte, ctxPrefs: e19.prefs && e19.prefs.retour });
  await snap(page, "20-gate-aimer");
  await page.evaluate(() => { const b = document.querySelector("#modalBackdrop .btn.primary"); b.click(); b.click(); });
  await page.waitForTimeout(800);
  const e20 = await etat(page);
  log("L2 après double clic « Créer mon compte »", { onboardingActif: e20.onboardingActif, onbStep: e20.onbStep, sortieExploration: e20.sortieExploration, nbSorties: await page.$$eval("#frBackToExplore", (e) => e.length), authMsg: await page.evaluate(() => document.getElementById("authMsg").textContent), onglet: await page.evaluate(() => ({ signin: document.getElementById("authTabSignin").classList.contains("active"), signup: document.getElementById("authTabSignup").classList.contains("active"), submit: document.getElementById("authSubmitBtn").textContent, phone: !!document.getElementById("authPhoneWrap").offsetParent })), modalEncore: e20.modalOuverte, texte: await page.evaluate(() => document.querySelector('[data-onb-step="splash"]').innerText.replace(/\s+/g, " ").trim().slice(0, 400)) });
  await snap(page, "21-auth-splash-visiteur");
  // Soumettre vide → message ?
  await page.click("#authSubmitBtn"); await page.waitForTimeout(500);
  log("L3 soumission vide", { authMsg: await page.evaluate(() => document.getElementById("authMsg").textContent), toasts: await page.evaluate(() => [...document.querySelectorAll(".toast, [class*=toast]")].map(t => t.textContent.trim()).filter(Boolean).slice(0, 3)) });
  // Étapes suivantes (émulation directe)
  await page.evaluate(() => showOnbStep("age")); await page.waitForTimeout(300);
  log("O1 étape âge", { texte: await page.evaluate(() => document.querySelector('[data-onb-step="age"]').innerText.replace(/\s+/g, " ").trim()), retourVisible: await page.evaluate(() => !!document.querySelector('[data-onb-step="age"] .onb-footer .btn.ghost').offsetParent) });
  await snap(page, "22-onb-age");
  await page.fill("#birthYear", "2015"); await page.click('[data-onb-step="age"] .btn.primary'); await page.waitForTimeout(400);
  log("O1b année 2015 (11 ans)", { step: (await etat(page)).onbStep, toasts: await page.evaluate(() => [...document.querySelectorAll(".toast, [class*=toast]")].map(t => t.textContent.trim()).filter(Boolean).slice(0, 3)) });
  await page.evaluate(() => showOnbStep("name")); await page.waitForTimeout(300);
  log("O2 étape prénom", { texte: await page.evaluate(() => document.querySelector('[data-onb-step="name"]').innerText.replace(/\s+/g, " ").trim()) });
  await snap(page, "23-onb-prenom");
  await page.evaluate(() => { showOnbStep("passions"); try { renderPassionGrid(); } catch (e) {} }); await page.waitForTimeout(400);
  log("O3 étape passions", { titre: await page.evaluate(() => document.getElementById("onbPassionsTitle").textContent), texte: await page.evaluate(() => document.getElementById("onbPassionsText").textContent), nbTuiles: await page.$$eval("#passionGrid > *", (e) => e.length), rechercheVisible: await page.evaluate(() => !!document.getElementById("onbPassionSearch").offsetParent), starter: await page.evaluate(() => (document.getElementById("onbStarter") || {}).innerText), grille: await page.$$eval("#passionGrid > *", (e) => e.map(x => x.textContent.trim()).slice(0, 10)) });
  await snap(page, "24-onb-passions");
  await page.evaluate(() => showOnbStep("splash"));
  await page.click("#frBackToExplore"); await page.waitForTimeout(1500);
  const e21 = await etat(page);
  log("L4 après « ← Continuer à explorer »", { ecran: e21.ecranActif, racine: e21.racineFirstRun, onboardingActif: e21.onboardingActif, carte: !!e21.carteBienvenue, tip: e21.tip, nbFeedCards: await page.$$eval("#feedList .post", (e) => e.length), retourPrefs: e21.prefs && e21.prefs.retour });
  await snap(page, "25-retour-exploration");

  // Panneau de personnalisation
  await page.evaluate(() => PassioFirstRun.ouvrirPersonnalisation("audit")); await page.waitForTimeout(600);
  log("P1 panneau passions", await page.evaluate(() => { const m = document.getElementById("modalBackdrop"); return { texte: m.innerText.replace(/\s+/g, " ").trim().slice(0, 300), nbTuiles: document.querySelectorAll("#frGrid > *").length, valider: (document.getElementById("frValider") || {}).textContent }; }));
  await snap(page, "26-panneau-passions");
  await page.evaluate(() => PassioFirstRun.basculerPassion("sport")); await page.waitForTimeout(400);
  log("P2 spécialités après « Sport »", await page.evaluate(() => ({ specs: (document.getElementById("frSpecs") || {}).innerText.replace(/\s+/g, " ").trim().slice(0, 300), valider: (document.getElementById("frValider") || {}).textContent })));
  await snap(page, "27-panneau-specialites");
  await page.evaluate(() => { try { PassioFirstRun.basculerSpecialite("cyclisme"); } catch (e) {} PassioFirstRun.validerPersonnalisation(); }); await page.waitForTimeout(1500);
  const e22 = await etat(page);
  log("P3 après validation", { rail: await page.$$eval("#profileStrip > *", (els) => els.map((e) => e.textContent.trim()).slice(0, 8)), prefs: e22.prefs, carte: e22.carteBienvenue, actives: await page.evaluate(() => [...(window._activeFeedPassions || [])]), toasts: await page.evaluate(() => [...document.querySelectorAll(".toast, [class*=toast]")].map(t => t.textContent.trim()).filter(Boolean).slice(0, 3)) });
  await snap(page, "28-fil-personnalise");

  // Rechargement (même session) puis nouvelle visite
  await page.reload(); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(3500);
  const e23 = await etat(page);
  log("R1 après rechargement (même session)", { carte: e23.carteBienvenue, tip: e23.tip, rail: await page.$$eval("#profileStrip > *", (els) => els.map((e) => e.textContent.trim()).slice(0, 8)), tour: e23.prefs && e23.prefs.tour, perms: await page.evaluate(() => window.__perms) });
  await snap(page, "29-rechargement");
  await page.evaluate(() => sessionStorage.removeItem("passio_first_run_bienvenue_fermee"));
  await page.reload(); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(3500);
  const e24 = await etat(page);
  log("R2 nouvelle visite", { carte: e24.carteBienvenue, tip: e24.tip });
  await snap(page, "30-nouvelle-visite");
  // « Revoir les repères » depuis Paramètres
  await page.evaluate(() => { const b = document.querySelector("#frWelcome .fr-welcome-alt"); if (b) b.click(); }); await page.waitForTimeout(300);
  await page.evaluate(() => { try { PassioFirstRun.fermerBulle(); } catch (e) {} PassioFirstRun.relancerTour(); }); await page.waitForTimeout(1200);
  log("R3 « Revoir les repères »", { tip: (await etat(page)).tip, tour: (await etat(page)).prefs.tour });
  await page.evaluate(() => { try { PassioFirstRun.fermerBulle(); } catch (e) {} });

  // Redirections goTo et retour arrière
  log("G1 goTo redirigés", await page.evaluate(() => { const r = {}; ["wallet", "shop", "cdv", "bobines", "inconnu"].forEach(s => { try { goTo(s); r[s] = { ecran: (document.querySelector(".screen.active") || {}).id || null, nb: document.querySelectorAll(".screen.active").length, hash: location.hash, navActifs: document.querySelectorAll(".app-nav-v2 .nav-item.active").length }; } catch (e) { r[s] = "ERR " + e.message; } }); goTo("feed"); return r; }));
  await page.evaluate(() => goTo("irl")); await page.waitForTimeout(500);
  await page.goBack(); await page.waitForTimeout(700);
  const e25 = await etat(page);
  log("G2 goTo(irl) puis history.back()", { ecran: e25.ecranActif, nbNavActifs: e25.nbNavActifs, navActif: e25.navV2.filter(n => n.active).map(n => n.key), hash: e25.hash });
  // Modale ouverte puis back
  await page.evaluate(() => openModal('<div class="modal-title">Test</div>')); await page.waitForTimeout(300);
  await page.goBack(); await page.waitForTimeout(600);
  const e26 = await etat(page);
  log("G3 modale puis back", { modal: e26.modalOuverte, ecran: e26.ecranActif });

  // Liens profonds
  for (const h of ["#irl-event-e1", "#reel=inexistant", "#irl-event-%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E", "#wallet", "#cdv", "#post-p1"]) {
    await page.goto(BASE + "/index.html" + h); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(3500);
    const e = await etat(page);
    log("D lien profond " + h, { ecran: e.ecranActif, nb: e.nbEcransActifs, eventDetail: e.eventDetailAffiche, reels: e.reelsOuvert, hash: e.hash, carte: !!e.carteBienvenue, tip: e.tip, modal: e.modalTexte ? e.modalTexte.slice(0, 120) : null, navActifs: e.nbNavActifs });
    if (h === "#irl-event-e1") await snap(page, "31-lien-profond-irl-event");
    if (h === "#reel=inexistant") await snap(page, "32-lien-profond-reel-inexistant");
  }
  // Bobine par lien profond réel : premier id de buildReels
  const reelId = await page.evaluate(() => { try { const r = buildReels(); return r && r[0] && r[0].id; } catch (e) { return "ERR " + e.message; } });
  if (reelId && !String(reelId).startsWith("ERR")) { await page.goto(BASE + "/index.html#reel=" + reelId); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(3500); const e = await etat(page); log("D lien profond #reel=<réel>", { reelId, reels: e.reelsOuvert, ecran: e.ecranActif, hash: e.hash, tip: e.tip, carte: !!e.carteBienvenue }); await snap(page, "35-lien-profond-reel"); await page.evaluate(() => { try { closeReels(); } catch (e) {} }); await page.waitForTimeout(800); const e2 = await etat(page); log("D après fermeture de la bobine", { ecran: e2.ecranActif, hash: e2.hash, carte: !!e2.carteBienvenue, tip: e2.tip }); }

  J.permissions = await page.evaluate(() => window.__perms);
  J.duree_ms = Date.now() - t0;
  fs.writeFileSync(OUT + "/parcours-visiteur-2.json", JSON.stringify(J, null, 2));
  console.log("ERREURS CONSOLE", J.erreursConsole.length, JSON.stringify(J.erreursConsole.slice(0, 5)), "PERMS", J.permissions.length, "RESEAU BLOQUE", J.reseauBloque);
  await browser.close();
})().catch((e) => { console.error("ECHEC", e); fs.writeFileSync(OUT + "/parcours-visiteur-2.json", JSON.stringify(Object.assign(J, { echec: String(e) }), null, 2)); process.exit(1); });
