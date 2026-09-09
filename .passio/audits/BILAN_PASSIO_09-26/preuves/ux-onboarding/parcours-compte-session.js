// Parcours COMPTE CONNECTÉ (SDK Supabase remplacé par un client FACTICE hors réseau : session présente,
// aucune requête ne part). Mesure : boot sans landing, liens profonds, « Voir l'onboarding », « Afficher le pitch ».
const { chromium } = require("/home/user/passio-app/node_modules/playwright");
const fs = require("fs");
const OUT = __dirname;
const BASE = "http://127.0.0.1:" + (process.env.PASSIO_PORT || 8101);
const GATE_KEY = "passio_gate_v1";
const GATE_TOKEN = "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f";
const UID = "11111111-2222-4333-8444-555555555555";
const J = { etapes: [], erreurs: [], requetesSortantes: [] };
const t0 = Date.now();
function log(nom, data) { J.etapes.push(Object.assign({ t_ms: Date.now() - t0, etape: nom }, data || {})); console.log(nom, JSON.stringify(data || {})); }
async function snap(page, nom) { await page.screenshot({ path: OUT + "/" + nom + ".png" }); }
function etatOnboarde() {
  return { onboarded: true, landingSeen: true, tourSeen: true,
    user: { name: "Compte audit", birthYear: 1990, isMinor: false, currentProfileId: "pp_0",
      profiles: [{ id: "pp_0", name: "Compte audit", passion: "musique", emoji: "🎸", bio: "", color: "#7c3aed", createdAt: 1 }],
      drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [], following: [], general: { username: "Compte audit" } },
    userPosts: [], userEvents: [], notifications: [], currentMood: "all", selectedFeedPassions: ["musique"] };
}
async function etat(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const tip = q(".fr-tip"), hint = q(".passio-hint"), modal = q("#modalBackdrop"), onb = q("#onboarding");
    return { hash: location.hash, racineFirstRun: document.documentElement.classList.contains("passio-first-run"),
      ecranActif: (q(".screen.active") || {}).id || null, nbEcransActifs: document.querySelectorAll(".screen.active").length,
      nbNavActifs: document.querySelectorAll(".app-nav-v2 .nav-item.active").length,
      tip: tip ? tip.getAttribute("data-fr-tip") : null, hint: hint ? hint.getAttribute("data-hint") : null,
      modalOuverte: !!(modal && modal.classList.contains("active")), modalTexte: modal && modal.classList.contains("active") ? modal.innerText.replace(/\s+/g, " ").trim().slice(0, 200) : null,
      onboardingActif: !!(onb && onb.classList.contains("active")), onbStep: (q(".onb-step.active") || { getAttribute: () => null }).getAttribute("data-onb-step"),
      landingActif: !!(q("#landing") && q("#landing").classList.contains("active")),
      eventDetailAffiche: !!(q("#eventDetailPage") && getComputedStyle(q("#eventDetailPage")).display !== "none"),
      reelsOuvert: !!(window.reelsState && window.reelsState.open) || !!(q("#reelsViewer") && q("#reelsViewer").classList.contains("active")),
      supaReal: window._supaReal, myUid: (typeof MY_UID !== "undefined") ? MY_UID : null, onboarded: window.state && state.onboarded };
  });
}
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", isMobile: true, hasTouch: true });
  await ctx.route("**/*", (route) => { const u = route.request().url(); if (/supabase|jsdelivr|unpkg|cdnjs|netlify|googleapis|gstatic/i.test(u)) { J.requetesSortantes.push(u.slice(0, 120)); return route.abort(); } return route.continue(); });
  await ctx.addInitScript(([k, t, st, uid]) => {
    sessionStorage.setItem(k, t); sessionStorage.setItem("passio_pwa_dismissed", "1");
    if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    if (!localStorage.getItem("passio_uid")) localStorage.setItem("passio_uid", uid);
    // Client FACTICE : le socle noop de l'application (_buildNoopSupa) + une session présente.
    window.supabase = { createClient: function () {
      var s = (typeof _buildNoopSupa === "function") ? _buildNoopSupa() : {};
      var sess = { user: { id: uid, email: "audit@example.invalid", user_metadata: {} }, access_token: "x", refresh_token: "y", expires_at: Math.floor(Date.now() / 1000) + 3600 };
      s.auth = Object.assign({}, s.auth || {}, {
        getSession: async function () { return { data: { session: sess }, error: null }; },
        getUser: async function () { return { data: { user: sess.user }, error: null }; },
        onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
        signOut: async function () { return { error: null }; },
        updateUser: async function () { return { data: {}, error: null }; },
        refreshSession: async function () { return { data: { session: sess }, error: null }; },
      });
      return s;
    } };
  }, [GATE_KEY, GATE_TOKEN, etatOnboarde(), UID]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => J.erreurs.push("PAGEERROR " + String(e).slice(0, 300)));

  await page.goto(BASE + "/index.html"); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(4500);
  const e1 = await etat(page);
  log("S1 boot compte connecté (client factice)", Object.assign({ nbCards: await page.$$eval("#feedList .post", (e) => e.length), rail: await page.$$eval("#profileStrip > *", (els) => els.map((e) => e.textContent.trim()).slice(0, 6)), carte: !!(await page.$("#frWelcome")) }, e1));
  await snap(page, "60-fil-compte-session");
  if (!e1.supaReal) { log("PRÉMISSE CASSÉE : client factice non construit", {}); }
  // Messages : les conversations de démonstration pour un compte connecté ?
  await page.click('.app-nav-v2 [data-v2-key="messages"]'); await page.waitForTimeout(1000);
  log("S2 Messages (compte connecté)", { texte: await page.evaluate(() => document.getElementById("screen-messages").innerText.replace(/\s+/g, " ").trim().slice(0, 200)), nbConvs: await page.$$eval("#screen-messages [onclick*=openConv], #convList > *", (e) => e.length), badgeNav: await page.evaluate(() => { const b = document.querySelector('.app-nav-v2 [data-v2-key="messages"] .nav-v2-badge, .app-nav-v2 [data-v2-key="messages"] [class*=badge]'); return b ? b.textContent.trim() : null; }) });
  await snap(page, "61-messages-compte-session");
  // « Voir l'onboarding » puis rechargement : où retombe-t-on ?
  await page.evaluate(() => resetOnboarding()); await page.waitForTimeout(600);
  const e3 = await etat(page);
  log("S3 « Voir l'onboarding » (connecté)", { onboardingActif: e3.onboardingActif, onbStep: e3.onbStep, ecran: e3.ecranActif, onboarded: e3.onboarded });
  await page.reload(); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(4500);
  const e4 = await etat(page);
  log("S4 rechargement après « Voir l'onboarding » (connecté)", { ecran: e4.ecranActif, onboardingActif: e4.onboardingActif, landing: e4.landingActif, racineFirstRun: e4.racineFirstRun, onboarded: e4.onboarded, carte: !!(await page.$("#frWelcome")) });
  await snap(page, "62-apres-voir-onboarding-session");
  // « Afficher le pitch » (Paramètres → Démo) pour un compte connecté : y a-t-il un retour ?
  await page.evaluate(() => showPitchLanding()); await page.waitForTimeout(600);
  const e5 = await etat(page);
  log("S5 « Afficher le pitch » (connecté)", { landing: e5.landingActif, boutons: await page.evaluate(() => [...document.querySelectorAll("#landing button, #landing [onclick]")].filter(b => b.offsetParent).map(b => b.textContent.replace(/\s+/g, " ").trim().slice(0, 40))), scrollable: await page.evaluate(() => { const l = document.getElementById("landing"); return l.scrollHeight > l.clientHeight; }) });
  await snap(page, "63-pitch-connecte");
  await page.goBack().catch(() => {}); await page.waitForTimeout(500);
  log("S5b back depuis le pitch", { landing: (await etat(page)).landingActif });
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  log("S5c Échap depuis le pitch", { landing: (await etat(page)).landingActif });
  // « Se connecter » depuis le pitch alors qu'on est connecté
  await page.evaluate(() => exitLandingAsAuth("signin")); await page.waitForTimeout(500);
  const e6 = await etat(page);
  log("S5d « Se connecter » depuis le pitch (connecté)", { onboardingActif: e6.onboardingActif, onbStep: e6.onbStep, landing: e6.landingActif, myUid: e6.myUid });
  await snap(page, "64-pitch-se-connecter-connecte");
  // Liens profonds à boot FRAIS, compte connecté
  let n = 0;
  for (const h of ["#irl-event-e1", "#reel=reel_seed_cuisine_1", "#reel=inexistant", "#irl-event-inexistant", "#irl-event-%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E", "#wallet", "#shop", "#cdv", "#profil-inexistant", "#post-p1"]) {
    await page.goto(BASE + "/index.html?s=" + (++n) + h); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(4500);
    const e = await etat(page);
    log("S6 lien profond (connecté, boot frais) " + h, { ecran: e.ecranActif, nb: e.nbEcransActifs, eventDetail: e.eventDetailAffiche, reels: e.reelsOuvert, hash: e.hash, modal: e.modalTexte ? e.modalTexte.slice(0, 100) : null, navActifs: e.nbNavActifs, landing: e.landingActif, hint: e.hint });
    if (h === "#reel=reel_seed_cuisine_1") await snap(page, "65-lien-profond-reel-session");
    if (h === "#irl-event-e1") await snap(page, "66-lien-profond-event-session");
  }
  // Fermer la bobine ouverte par lien profond : où revient-on ?
  await page.goto(BASE + "/index.html?s=" + (++n) + "#reel=reel_seed_cuisine_1"); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(4500);
  await page.evaluate(() => { try { closeCurrentOverlay(); } catch (e) {} }); await page.waitForTimeout(800);
  const e7 = await etat(page);
  log("S7 fermeture de la bobine ouverte par lien profond", { ecran: e7.ecranActif, reels: e7.reelsOuvert, hash: e7.hash, nb: e7.nbEcransActifs });
  // Retour arrière depuis un écran profond (IRL → fiche → back → back)
  await page.evaluate(() => goTo("irl")); await page.waitForTimeout(500);
  await page.evaluate(() => openEventDetails("e1")); await page.waitForTimeout(600);
  await page.goBack(); await page.waitForTimeout(600);
  const e8 = await etat(page);
  await page.goBack(); await page.waitForTimeout(600);
  const e9 = await etat(page);
  log("S8 IRL → fiche → back → back", { apresBack1: { ecran: e8.ecranActif, fiche: e8.eventDetailAffiche, hash: e8.hash }, apresBack2: { ecran: e9.ecranActif, fiche: e9.eventDetailAffiche, hash: e9.hash, navActifs: e9.nbNavActifs } });
  fs.writeFileSync(OUT + "/parcours-compte-session.json", JSON.stringify(J, null, 2));
  console.log("PAGEERRORS", J.erreurs.length, JSON.stringify(J.erreurs.slice(0, 5)), "REQ SORTANTES BLOQUEES", J.requetesSortantes.length);
  await browser.close();
})().catch((e) => { console.error("ECHEC", e); fs.writeFileSync(OUT + "/parcours-compte-session.json", JSON.stringify(Object.assign(J, { echec: String(e) }), null, 2)); process.exit(1); });
