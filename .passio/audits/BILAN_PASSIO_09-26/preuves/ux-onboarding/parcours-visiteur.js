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
  // Attente de la carte de bienvenue : quand apparaît-elle ?
  let carteA = null;
  for (let i = 0; i < 60; i++) { if (await page.$("#frWelcome")) { carteA = Date.now() - t0; break; } await page.waitForTimeout(200); }
  log("01 fil visiteur (entrée directe)", Object.assign({ carteBienvenue_apres_ms: carteA }, await etat(page)));
  await snap(page, "01-fil-visiteur");
  const supaReal = await page.evaluate(() => window._supaReal);
  log("prémisse SDK coupé", { _supaReal: supaReal });

  // Une bulle de tour posée par-dessus la carte ? (ne doit pas)
  await page.waitForTimeout(1500);
  log("02 pas de bulle tant que la carte parle", { tip: (await etat(page)).tip });

  // Fermer la carte par « Explorer d'abord » → première indication (decouvrir)
  await page.click("#frWelcome .fr-welcome-alt");
  await page.waitForTimeout(1200);
  const e3 = await etat(page);
  log("03 après « Explorer d'abord »", { carte: e3.carteBienvenue, tip: e3.tip, bienvenueFermeeSession: e3.bienvenueFermeeSession });
  await snap(page, "02-tip-decouvrir");
  // Compris → une autre bulle suit-elle spontanément ?
  if (e3.tip) { await page.click(".fr-tip .fr-tip-ok"); }
  await page.waitForTimeout(2500);
  log("04 après « Compris » (attente 2,5 s)", { tip: (await etat(page)).tip, tour: (await etat(page)).prefs && (await etat(page)).prefs.tour });

  // Aide au geste « passions » : tap sur la bulle « Suivis » du rail
  const tuiles = await page.$$eval("#profileStrip [onclick], #profileStrip button, #profileStrip .passion-tile, #profileStrip > *", (els) => els.map((e) => e.textContent.trim()).slice(0, 8));
  log("rail du haut (visiteur)", { tuiles });
  const premiere = await page.$("#profileStrip > *");
  if (premiere) { await premiere.click(); await page.waitForTimeout(900); }
  const e5 = await etat(page);
  log("05 aide « passions » après tap sur le rail", { tip: e5.tip });
  await snap(page, "03-aide-passions");
  if (e5.tip) await page.click(".fr-tip .fr-tip-ok");
  // Envies
  const envieVisible = await page.evaluate(() => { const s = document.getElementById("feedIntentSelector") || document.getElementById("moodSelector"); return !!(s && s.offsetParent) ? [...s.querySelectorAll("button,[role=button],.mood-chip")].map(b => b.textContent.trim()) : null; });
  log("sélecteur d'envies visible ?", { boutons: envieVisible });
  if (envieVisible) { await page.evaluate(() => { const s = document.getElementById("feedIntentSelector") || document.getElementById("moodSelector"); const b = [...s.querySelectorAll("button,[role=button]")].find(x => x.offsetParent); if (b) b.click(); }); await page.waitForTimeout(900); }
  const e6 = await etat(page);
  log("06 aide « envies »", { tip: e6.tip });
  await snap(page, "04-aide-envies");
  if (e6.tip) await page.click(".fr-tip .fr-tip-ok");
  // Stories : « Ta story » → pas de caméra pour un visiteur
  const stories = await page.$$eval("#storiesRowFeed > *", (els) => els.map((e) => e.textContent.trim().slice(0, 30)).slice(0, 6));
  log("rangée stories", { stories });
  const st = await page.$("#storiesRowFeed > *");
  if (st) { await st.click(); await page.waitForTimeout(900); }
  const e7 = await etat(page);
  log("07 tap « Ta story » (visiteur)", { tip: e7.tip, mediaEditorOuvert: e7.mediaEditorOuvert, modal: e7.modalTexte, perms: await page.evaluate(() => window.__perms) });
  await snap(page, "05-aide-stories");
  if (e7.tip) await page.click(".fr-tip .fr-tip-ok");
  if (e7.modalOuverte) await page.evaluate(() => closeModal());

  // NAV : Rencontrer
  await page.click('.app-nav-v2 [data-v2-key="meet"]');
  await page.waitForTimeout(1300);
  const e8 = await etat(page);
  log("08 Rencontrer", { ecran: e8.ecranActif, nbNavActifs: e8.nbNavActifs, nav: e8.navV2, tip: e8.tip, perms: await page.evaluate(() => window.__perms) });
  await snap(page, "06-rencontrer");
  if (e8.tip) await page.click(".fr-tip .fr-tip-ok");
  // Vue Filtre
  const filtreBtn = await page.$("#irlToolsBtn");
  const filtreLabel = filtreBtn ? await filtreBtn.evaluate((b) => (b.getAttribute("aria-label") || b.textContent).trim()) : null;
  log("bouton filtre", { filtreLabel, present: !!filtreBtn });
  if (filtreBtn) {
    await filtreBtn.click(); await page.waitForTimeout(800);
    const vue = await page.evaluate(() => ({ vue: document.documentElement.getAttribute("data-v4a5-vue") || (document.querySelector("[data-v4a5-vue]") || {}).getAttribute?.("data-v4a5-vue"), titres: [...document.querySelectorAll("#screen-irl h2, #screen-irl h3, #screen-irl .v4a5-titre, #screen-irl [class*=titre]")].map(h => h.textContent.trim()).slice(0, 12), pied: (document.querySelector(".v4a5-pied, [class*=v4a5][class*=pied], [class*=footer]") || {}).innerText }));
    log("09 vue Filtre", vue);
    await snap(page, "07-rencontrer-filtre");
    // fermer : bouton retour ou Escape
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);
    const apres = await page.evaluate(() => ({ vue: document.documentElement.getAttribute("data-v4a5-vue"), ctxOpen: !!(window.ContextualTools && ContextualTools.isOpen()) }));
    log("09b après Échap", apres);
    if (apres.ctxOpen) { await page.evaluate(() => ContextualTools.close()); }
  }
  // Vue Carte (UI-4A3 onglets ?)
  const onglets = await page.$$eval("[data-v4a3-onglet]", (els) => els.map((e) => ({ id: e.getAttribute("data-v4a3-onglet"), label: e.textContent.trim(), visible: !!e.offsetParent })));
  log("onglets liste/carte", { onglets });
  const carteOng = await page.$('[data-v4a3-onglet="carte"]');
  if (carteOng) { await carteOng.click(); await page.waitForTimeout(1500); log("10 vue Carte", { vue: await page.evaluate(() => document.querySelector("[data-v4a3-vue]") && document.querySelector("[data-v4a3-vue]").getAttribute("data-v4a3-vue")), perms: await page.evaluate(() => window.__perms) }); await snap(page, "08-rencontrer-carte"); const l = await page.$('[data-v4a3-onglet="liste"]'); if (l) await l.click(); }
  // Participer à une activité (visiteur) → gate « rejoindre »
  const ev = await page.$("#eventList .event-card, #eventList [onclick*=openEventDetails], #eventList > *");
  if (ev) { await ev.click(); await page.waitForTimeout(800); const e10 = await etat(page); log("11 fiche activité (visiteur)", { eventDetail: e10.eventDetailAffiche, hash: e10.hash, tip: e10.tip }); await snap(page, "09-fiche-activite"); const cta = await page.$("#eventDetailCta button, #eventDetailPage .btn.primary"); if (cta) { const lbl = await cta.textContent(); await cta.click(); await page.waitForTimeout(700); const e11 = await etat(page); log("12 CTA fiche → gate ?", { cta: lbl.trim(), modal: e11.modalTexte }); await snap(page, "10-gate-rejoindre"); if (e11.modalOuverte) await page.evaluate(() => closeModal()); } await page.evaluate(() => { try { closeEventDetails(); } catch (e) { try { closeCurrentOverlay(); } catch (_) {} } }); await page.waitForTimeout(400); }

  // NAV : Créer
  await page.click('.app-nav-v2 [data-v2-key="create"]');
  await page.waitForTimeout(800);
  const sheet = await page.evaluate(() => { const s = document.querySelector("#v2CreateSheet"); return s ? { visible: !!s.offsetParent, items: [...s.querySelectorAll("button,[role=button],.v2-sheet-item")].map(b => b.textContent.replace(/\s+/g, " ").trim()) } : null; });
  log("13 feuille Créer", Object.assign({ sheet }, { nbNavActifs: (await etat(page)).nbNavActifs }));
  await snap(page, "11-creer-feuille");
  const item = await page.$("#v2CreateSheet .v2-sheet-item, #v2CreateSheet button:not([aria-label*=Fermer])");
  if (item) { await item.click(); await page.waitForTimeout(800); const e13 = await etat(page); log("14 premier choix Créer (visiteur)", { modal: e13.modalTexte, ecran: e13.ecranActif, mediaEditor: e13.mediaEditorOuvert, perms: await page.evaluate(() => window.__perms) }); await snap(page, "12-gate-publier"); if (e13.modalOuverte) await page.click("#modalBackdrop .fr-gate-stay").catch(() => page.evaluate(() => closeModal())); }
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });

  // NAV : Messages
  await page.click('.app-nav-v2 [data-v2-key="messages"]');
  await page.waitForTimeout(1200);
  const e14 = await etat(page);
  const msgTexte = await page.evaluate(() => (document.getElementById("screen-messages") || {}).innerText.replace(/\s+/g, " ").trim().slice(0, 300));
  log("15 Messages (visiteur)", { ecran: e14.ecranActif, nbNavActifs: e14.nbNavActifs, tip: e14.tip, texte: msgTexte });
  await snap(page, "13-messages-visiteur");
  if (e14.tip) await page.click(".fr-tip .fr-tip-ok");

  // NAV : Profil
  await page.click('.app-nav-v2 [data-v2-key="profile"]');
  await page.waitForTimeout(1200);
  const e15 = await etat(page);
  const profTexte = await page.evaluate(() => (document.getElementById("mainProfileCard") || {}).innerText.replace(/\s+/g, " ").trim().slice(0, 300));
  log("16 Profil (visiteur)", { ecran: e15.ecranActif, nbNavActifs: e15.nbNavActifs, tip: e15.tip, texte: profTexte });
  await snap(page, "14-profil-visiteur");
  if (e15.tip) await page.click(".fr-tip .fr-tip-ok");
  // Onglets du profil
  const ptabs = await page.$$eval("#screen-profiles .profile-tab", (els) => els.map((e) => ({ tab: e.getAttribute("data-tab"), label: e.textContent.trim(), pressed: e.getAttribute("aria-pressed"), visible: !!e.offsetParent })));
  const v8tabs = await page.evaluate(() => [...document.querySelectorAll('#screen-profiles [role="tab"], #screen-profiles .v8-tab, #screen-profiles [data-v8-onglet], #screen-profiles .v9-tab')].map(e => ({ label: e.textContent.trim(), visible: !!e.offsetParent, sel: e.getAttribute("aria-selected") })));
  log("onglets profil", { ptabs, v8tabs });
  // stat « passions » → page Mes passions (visiteur)
  await page.evaluate(() => { try { ouvrirGestionPassions(); } catch (e) { window.__err = String(e); } });
  await page.waitForTimeout(800);
  const pm = await page.evaluate(() => { const b = document.getElementById("passionManager"); return { hidden: b ? b.hidden : null, classe: (document.getElementById("screen-profiles") || {}).className, texte: b ? b.innerText.replace(/\s+/g, " ").trim().slice(0, 400) : null, err: window.__err }; });
  log("17 page Mes passions (visiteur)", pm);
  await snap(page, "15-mes-passions-visiteur");
  await page.evaluate(() => { try { closePassionManager(); } catch (e) {} });

  // Rechercher (loupe)
  await page.click('.app-topbar [aria-label="Explorer"]');
  await page.waitForTimeout(1200);
  const e16 = await etat(page);
  const exTabs = await page.$$eval(".explore-tab", (els) => els.map((e) => ({ label: e.textContent.trim(), active: e.classList.contains("active"), visible: !!e.offsetParent })));
  const exTitre = await page.evaluate(() => [...document.querySelectorAll("#screen-explore .section-title, #screen-explore h1, #screen-explore h2")].map(h => h.textContent.trim()).slice(0, 5));
  log("18 Rechercher", { ecran: e16.ecranActif, nbNavActifs: e16.nbNavActifs, nav: e16.navV2.filter(n => n.active), exTabs, exTitre, count: await page.evaluate(() => (document.getElementById("explorePassionsCount") || {}).textContent) });
  await snap(page, "16-rechercher");

  // Paramètres
  await page.click('.app-topbar [aria-label="Paramètres"]');
  await page.waitForTimeout(500);
  await page.evaluate(() => { const s = document.querySelector("#devPanel .settings-section"); if (s) toggleSettingsSection(s); });
  await page.waitForTimeout(300);
  const params = await page.evaluate(() => [...document.querySelectorAll("#devPanel button")].map(b => ({ label: b.textContent.trim(), visible: !!b.offsetParent })));
  log("19 Paramètres (visiteur)", { boutons: params });
  await snap(page, "17-parametres-visiteur");
  // « Voir l'onboarding » depuis un visiteur : y a-t-il une sortie ?
  await page.evaluate(() => { const b = [...document.querySelectorAll("#devPanel button")].find(b => /Voir l'onboarding/.test(b.textContent)); if (b) b.click(); });
  await page.waitForTimeout(800);
  const e17 = await etat(page);
  log("20 « Voir l'onboarding » (visiteur)", { onboardingActif: e17.onboardingActif, onbStep: e17.onbStep, sortieExploration: e17.sortieExploration, ecran: e17.ecranActif, prefsOnboarded: await page.evaluate(() => state && state.onboarded) });
  await snap(page, "18-voir-onboarding-visiteur");
  // Retour arrière navigateur : sort-on de l'onboarding ?
  await page.goBack().catch(() => {}); await page.waitForTimeout(700);
  const e17b = await etat(page);
  log("20b après history.back()", { onboardingActif: e17b.onboardingActif, ecran: e17b.ecranActif, racine: e17b.racineFirstRun });
  if (e17b.onboardingActif) { await page.evaluate(() => { document.getElementById("onboarding").classList.remove("active"); goTo("feed"); }); }

  // Retour au fil : bulle « creer » ?
  await page.click('.app-nav-v2 [data-v2-key="discover"]');
  await page.waitForTimeout(1500);
  const e18 = await etat(page);
  log("21 retour Fil : bulle « creer » ?", { tip: e18.tip, carte: !!e18.carteBienvenue, tour: e18.prefs && e18.prefs.tour });
  await snap(page, "19-tip-creer");
  if (e18.tip) await page.click(".fr-tip .fr-tip-ok");

  // Like sur un post → gate « aimer »
  const like = await page.$("#feedList .post [onclick*=toggleLike], #feedList .post .post-like, #feedList .post button[aria-label*=aime]");
  if (like) { await like.click(); await page.waitForTimeout(600); }
  const e19 = await etat(page);
  log("22 like (visiteur) → gate", { modal: e19.modalTexte, likeTrouve: !!like });
  await snap(page, "20-gate-aimer");
  // Double clic sur « Créer mon compte »
  if (e19.modalOuverte) {
    await page.evaluate(() => { const b = document.querySelector("#modalBackdrop .btn.primary"); b.click(); b.click(); });
    await page.waitForTimeout(700);
  }
  const e20 = await etat(page);
  const authMsg = await page.evaluate(() => (document.getElementById("authMsg") || {}).textContent);
  const onglet = await page.evaluate(() => ({ signin: document.getElementById("authTabSignin").classList.contains("active"), signup: document.getElementById("authTabSignup").classList.contains("active"), submit: document.getElementById("authSubmitBtn").textContent }));
  log("23 formulaire après double clic « Créer mon compte »", { onboardingActif: e20.onboardingActif, onbStep: e20.onbStep, sortieExploration: e20.sortieExploration, nbSorties: await page.$$eval("#frBackToExplore", (e) => e.length), authMsg, onglet, modalEncore: e20.modalOuverte });
  await snap(page, "21-auth-splash-visiteur");
  // Étapes de l'onboarding (émulation directe, aucun compte créé)
  await page.evaluate(() => showOnbStep("age")); await page.waitForTimeout(300);
  log("24 étape âge", { texte: await page.evaluate(() => document.querySelector('[data-onb-step="age"]').innerText.replace(/\s+/g, " ").trim()) });
  await snap(page, "22-onb-age");
  await page.evaluate(() => showOnbStep("name")); await page.waitForTimeout(300);
  log("25 étape prénom", { texte: await page.evaluate(() => document.querySelector('[data-onb-step="name"]').innerText.replace(/\s+/g, " ").trim()) });
  await snap(page, "23-onb-prenom");
  await page.evaluate(() => { showOnbStep("passions"); try { renderPassionGrid(); } catch (e) {} }); await page.waitForTimeout(400);
  log("26 étape passions", { titre: await page.evaluate(() => document.getElementById("onbPassionsTitle").textContent), texte: await page.evaluate(() => document.getElementById("onbPassionsText").textContent), nbTuiles: await page.$$eval("#passionGrid > *", (e) => e.length), rechercheVisible: await page.evaluate(() => !!document.getElementById("onbPassionSearch").offsetParent) });
  await snap(page, "24-onb-passions");
  await page.evaluate(() => showOnbStep("splash"));
  // « ← Continuer à explorer »
  await page.click("#frBackToExplore");
  await page.waitForTimeout(1500);
  const e21 = await etat(page);
  log("27 après « Continuer à explorer »", { ecran: e21.ecranActif, racine: e21.racineFirstRun, onboardingActif: e21.onboardingActif, carte: !!e21.carteBienvenue, tip: e21.tip, nbFeedCards: await page.$$eval("#feedList .post", (e) => e.length) });
  await snap(page, "25-retour-exploration");

  // Panneau de personnalisation (passions + spécialités)
  await page.evaluate(() => PassioFirstRun.ouvrirPersonnalisation("audit"));
  await page.waitForTimeout(600);
  const pan = await page.evaluate(() => { const m = document.getElementById("modalBackdrop"); return { texte: m.innerText.replace(/\s+/g, " ").trim().slice(0, 300), nbTuiles: document.querySelectorAll("#frGrid > *").length, valider: (document.getElementById("frValider") || {}).textContent }; });
  log("28 panneau passions", pan);
  await snap(page, "26-panneau-passions");
  await page.evaluate(() => PassioFirstRun.basculerPassion("sport"));
  await page.waitForTimeout(400);
  const specs = await page.evaluate(() => ({ specs: (document.getElementById("frSpecs") || {}).innerText.replace(/\s+/g, " ").trim().slice(0, 300), valider: (document.getElementById("frValider") || {}).textContent }));
  log("29 spécialités après « Sport »", specs);
  await snap(page, "27-panneau-specialites");
  await page.evaluate(() => { try { PassioFirstRun.basculerSpecialite("cyclisme"); } catch (e) {} });
  await page.evaluate(() => PassioFirstRun.validerPersonnalisation());
  await page.waitForTimeout(1500);
  const e22 = await etat(page);
  const rail = await page.$$eval("#profileStrip > *", (els) => els.map((e) => e.textContent.trim()).slice(0, 8));
  log("30 après validation : rail, prefs, carte", { rail, prefs: e22.prefs, carte: e22.carteBienvenue, actives: await page.evaluate(() => [...(window._activeFeedPassions || [])]) });
  await snap(page, "28-fil-personnalise");

  // Rechargement : ce qui revient
  await page.reload(); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(3500);
  const e23 = await etat(page);
  log("31 après rechargement (même session)", { carte: e23.carteBienvenue, tip: e23.tip, rail: await page.$$eval("#profileStrip > *", (els) => els.map((e) => e.textContent.trim()).slice(0, 8)), tour: e23.prefs && e23.prefs.tour, perms: await page.evaluate(() => window.__perms) });
  await snap(page, "29-rechargement");
  // Nouvelle « visite » : sessionStorage de fermeture effacé
  await page.evaluate(() => sessionStorage.removeItem("passio_first_run_bienvenue_fermee"));
  await page.reload(); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(3500);
  const e24 = await etat(page);
  log("32 nouvelle visite (fermeture de session oubliée)", { carte: e24.carteBienvenue, tip: e24.tip });
  await snap(page, "30-nouvelle-visite");

  // Redirections goTo et liens profonds
  const redir = await page.evaluate(() => { const r = {}; ["wallet", "shop", "cdv", "bobines", "inconnu"].forEach(s => { try { goTo(s); r[s] = { ecran: (document.querySelector(".screen.active") || {}).id || null, nb: document.querySelectorAll(".screen.active").length, hash: location.hash }; } catch (e) { r[s] = "ERR " + e.message; } }); goTo("feed"); return r; });
  log("33 goTo redirigés", redir);
  // Retour arrière : goTo irl puis history.back()
  await page.evaluate(() => goTo("irl")); await page.waitForTimeout(500);
  await page.goBack(); await page.waitForTimeout(700);
  const e25 = await etat(page);
  log("34 goTo(irl) puis back", { ecran: e25.ecranActif, nbNavActifs: e25.nbNavActifs, hash: e25.hash });
  // Liens profonds
  for (const h of ["#irl-event-e1", "#reel=inexistant", "#irl-event-<img src=x onerror=alert(1)>", "#wallet", "#cdv"]) {
    await page.goto(BASE + "/index.html" + h); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(3500);
    const e = await etat(page);
    log("35 lien profond " + h, { ecran: e.ecranActif, nb: e.nbEcransActifs, eventDetail: e.eventDetailAffiche, reels: e.reelsOuvert, hash: e.hash, carte: !!e.carteBienvenue, tip: e.tip, modal: e.modalTexte });
    if (h === "#irl-event-e1") await snap(page, "31-lien-profond-irl-event");
    if (h === "#reel=inexistant") await snap(page, "32-lien-profond-reel-inexistant");
  }

  J.permissions = await page.evaluate(() => window.__perms);
  J.duree_ms = Date.now() - t0;
  fs.writeFileSync(OUT + "/parcours-visiteur.json", JSON.stringify(J, null, 2));
  console.log("ERREURS CONSOLE", J.erreursConsole.length, "PERMS", J.permissions.length, "RESEAU BLOQUE", J.reseauBloque);
  await browser.close();
})().catch((e) => { console.error("ECHEC", e); fs.writeFileSync(OUT + "/parcours-visiteur.json", JSON.stringify(Object.assign(J, { echec: String(e) }), null, 2)); process.exit(1); });
