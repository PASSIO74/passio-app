// Parcours COMPTE EXISTANT (état local onboardé, aucun compte réel, SDK coupé) + liens profonds à boot FRAIS.
const { chromium } = require("/home/user/passio-app/node_modules/playwright");
const fs = require("fs");
const OUT = __dirname;
const BASE = "http://127.0.0.1:" + (process.env.PASSIO_PORT || 8101);
const GATE_KEY = "passio_gate_v1";
const GATE_TOKEN = "67a2ba44e8c09efc9e9e9d60690ef7cd1e3069d072231a1834b30ec1fc50390f";
const J = { etapes: [], erreursConsole: [], permissions: [] };
const t0 = Date.now();
function log(nom, data) { J.etapes.push(Object.assign({ t_ms: Date.now() - t0, etape: nom }, data || {})); console.log(nom, JSON.stringify(data || {})); }
async function snap(page, nom) { await page.screenshot({ path: OUT + "/" + nom + ".png" }); }
function etatOnboarde() {
  return {
    onboarded: true, landingSeen: true, tourSeen: true,
    user: { name: "Compte audit", birthYear: 1990, isMinor: false, currentProfileId: "pp_0",
      profiles: [{ id: "pp_0", name: "Compte audit", passion: "musique", emoji: "🎸", bio: "", color: "#7c3aed", createdAt: 1 }],
      drafts: [], likedPosts: [], joinedEvents: [], seenStories: [], customPassions: [], following: [], general: { username: "Compte audit" } },
    userPosts: [], userEvents: [], notifications: [], currentMood: "all", selectedFeedPassions: ["musique"],
  };
}
async function etat(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const tip = q(".fr-tip"), hint = q(".passio-hint"), modal = q("#modalBackdrop"), onb = q("#onboarding");
    return {
      hash: location.hash, racineFirstRun: document.documentElement.classList.contains("passio-first-run"),
      ecranActif: (q(".screen.active") || {}).id || null, nbEcransActifs: document.querySelectorAll(".screen.active").length,
      nbNavActifs: document.querySelectorAll(".app-nav-v2 .nav-item.active").length,
      tip: tip ? { id: tip.getAttribute("data-fr-tip"), texte: tip.innerText.replace(/\s+/g, " ").trim() } : null,
      hint: hint ? { id: hint.getAttribute("data-hint"), texte: hint.innerText.replace(/\s+/g, " ").trim() } : null,
      modalOuverte: !!(modal && modal.classList.contains("active")),
      modalTexte: modal && modal.classList.contains("active") ? modal.innerText.replace(/\s+/g, " ").trim().slice(0, 300) : null,
      onboardingActif: !!(onb && onb.classList.contains("active")), onbStep: (q(".onb-step.active") || { getAttribute: () => null }).getAttribute("data-onb-step"),
      landingActif: !!(q("#landing") && q("#landing").classList.contains("active")),
      tourActif: !!(q("#tourOverlay") && q("#tourOverlay").classList.contains("active")),
      eventDetailAffiche: !!(q("#eventDetailPage") && getComputedStyle(q("#eventDetailPage")).display !== "none"),
      reelsOuvert: !!(q("#reelsOverlay") && (q("#reelsOverlay").classList.contains("active") || q("#reelsOverlay").classList.contains("open"))) || !!(window.reelsState && window.reelsState.open),
      hintsVus: (() => { try { return JSON.parse(localStorage.getItem("passio_mvp_state_v1")).hintsVus; } catch (e) { return null; } })(),
      sortieExploration: !!(q("#frBackToExplore") && q("#frBackToExplore").offsetParent),
    };
  });
}
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", isMobile: true, hasTouch: true });
  await ctx.route("**/*", (route) => /supabase|jsdelivr|unpkg|cdnjs|netlify|googleapis|gstatic/i.test(route.request().url()) ? route.abort() : route.continue());
  await ctx.addInitScript(([k, t, st]) => {
    sessionStorage.setItem(k, t); sessionStorage.setItem("passio_pwa_dismissed", "1");
    if (!localStorage.getItem("passio_mvp_state_v1")) localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st));
    window.__perms = [];
    try { const g = navigator.geolocation; const o = g.getCurrentPosition.bind(g); g.getCurrentPosition = function () { window.__perms.push("geo"); return o.apply(g, arguments); };
      const n = Notification.requestPermission.bind(Notification); Notification.requestPermission = function () { window.__perms.push("notif"); return n(); };
      const m = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = function (c) { window.__perms.push("media"); return m(c); }; } catch (e) {}
  }, [GATE_KEY, GATE_TOKEN, etatOnboarde()]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => J.erreursConsole.push("PAGEERROR " + String(e).slice(0, 300)));

  await page.goto(BASE + "/index.html"); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(3500);
  let hintA = null; for (let i = 0; i < 40; i++) { if (await page.$(".passio-hint")) { hintA = Date.now() - t0; break; } await page.waitForTimeout(200); }
  const e1 = await etat(page);
  log("A1 fil compte existant", Object.assign({ hint_apres_ms: hintA, rail: await page.$$eval("#profileStrip > *", (els) => els.map((e) => e.textContent.trim()).slice(0, 8)), nbCards: await page.$$eval("#feedList .post", (e) => e.length), carte: !!(await page.$("#frWelcome")) }, e1));
  await snap(page, "40-fil-compte");
  // Landing active (aucune session : SDK injoignable) : ce que voit un compte local sans session
  log("A1b landing active sans session ?", { landing: e1.landingActif, boutons: await page.evaluate(() => [...document.querySelectorAll("#landing button")].filter(b => b.offsetParent).map(b => b.textContent.trim())), promesses: await page.evaluate(() => [...document.querySelectorAll("#landing .landing-feature, #landing li, #landing [class*=feature]")].map(x => x.textContent.replace(/\s+/g, " ").trim()).slice(0, 12)), hintSousLanding: !!e1.hint });
  if (e1.landingActif) { await page.evaluate(() => { const b = [...document.querySelectorAll("#landing button")].find(b => /Se connecter/.test(b.textContent)); if (b) b.click(); }); await page.waitForTimeout(600); const l = await etat(page); log("A1c « Se connecter » depuis la landing (compte local)", { onboardingActif: l.onboardingActif, onbStep: l.onbStep, sortie: l.sortieExploration, landing: l.landingActif }); await snap(page, "40b-landing-se-connecter"); await page.evaluate(() => { document.getElementById("onboarding").classList.remove("active"); document.getElementById("landing").classList.remove("active"); document.body.classList.add("screen-feed-active"); try { renderEverything(); } catch (e) {} goTo("feed"); }); await page.waitForTimeout(800); log("A1d (artefact d'audit) landing retirée à la main, comme app-helper.js le fait", {}); }
  // Le hint « feed_auteur » : fermeture, persistance
  if (await page.$(".passio-hint-ok")) { await page.click(".passio-hint-ok"); await page.waitForTimeout(300); }
  await page.reload(); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(3500);
  await page.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); });
  const e2 = await etat(page);
  log("A2 après rechargement : le hint revient-il ?", { hint: e2.hint, hintsVus: e2.hintsVus, tourActif: e2.tourActif });
  // Auteur → profil visité → hint profil_visite
  const auteur = await page.$("#feedList .post .post-author");
  if (auteur) { await auteur.click(); await page.waitForTimeout(1200); const e = await etat(page); log("A3 profil visité (compte)", { modal: e.modalTexte ? e.modalTexte.slice(0, 120) : null, hint: e.hint, actions: await page.evaluate(() => (document.getElementById("visitedProfileActions") || {}).innerText) }); await snap(page, "41-profil-visite-hint"); await page.evaluate(() => { try { closeModal(); } catch (e) {} }); }
  // Profil (compte) : onglets, hint second_profil
  await page.click('.app-nav-v2 [data-v2-key="profile"]'); await page.waitForTimeout(1200);
  const e4 = await etat(page);
  log("A4 profil (compte)", { hint: e4.hint, tabs: await page.evaluate(() => [...document.querySelectorAll('#screen-profiles [role="tab"]')].map(t => ({ label: t.textContent.trim(), sel: t.getAttribute("aria-selected"), visible: !!t.offsetParent }))), texte: await page.evaluate(() => document.getElementById("mainProfileCard").innerText.replace(/\s+/g, " ").trim().slice(0, 250)), rail: await page.$$eval("#v9ProfilePassions > *", (els) => els.map((e) => e.textContent.trim()).slice(0, 8)).catch(() => null) });
  await snap(page, "42-profil-compte");
  // Onglet Activité
  await page.evaluate(() => { const t = [...document.querySelectorAll('#screen-profiles [role="tab"]')].find(t => /Activit/.test(t.textContent)); if (t) t.click(); }); await page.waitForTimeout(600);
  log("A5 onglet Activité (compte vide)", { texte: await page.evaluate(() => { const p = document.querySelector('#screen-profiles [role="tabpanel"]:not([hidden])') || document.getElementById("profileEvents"); return p ? p.innerText.replace(/\s+/g, " ").trim().slice(0, 200) : null; }), tabs: await page.evaluate(() => [...document.querySelectorAll('#screen-profiles [role="tab"]')].map(t => t.getAttribute("aria-selected"))) });
  await snap(page, "43-profil-activite-vide");
  // Page Mes passions (compte)
  await page.evaluate(() => ouvrirGestionPassions()); await page.waitForTimeout(800);
  log("A6 page Mes passions (compte)", await page.evaluate(() => ({ texte: document.getElementById("passionManager").innerText.replace(/\s+/g, " ").trim().slice(0, 500), quota: document.querySelector("[data-passion-quota]") && document.querySelector("[data-passion-quota]").getAttribute("data-passion-quota"), porte: (document.getElementById("nouveauProfilLien") || {}).outerHTML ? document.getElementById("nouveauProfilLien").outerHTML.slice(0, 250) : null })));
  await snap(page, "44-mes-passions-compte");
  // Onglet Profil de la barre pendant la page ouverte → revient-on au profil ?
  await page.click('.app-nav-v2 [data-v2-key="profile"]'); await page.waitForTimeout(500);
  log("A6b onglet Profil pendant la page", { pageOuverte: await page.evaluate(() => !document.getElementById("passionManager").hidden) });
  // Messages (compte) : état vide ou démo ?
  await page.click('.app-nav-v2 [data-v2-key="messages"]'); await page.waitForTimeout(1000);
  log("A7 Messages (compte)", { texte: await page.evaluate(() => document.getElementById("screen-messages").innerText.replace(/\s+/g, " ").trim().slice(0, 300)), nbConvs: await page.$$eval("#screen-messages [onclick*=openConv], #convList > *", (e) => e.length) });
  await snap(page, "45-messages-compte");
  // IRL (compte) : géoloc ?
  await page.evaluate(() => window.__perms = []);
  await page.click('.app-nav-v2 [data-v2-key="meet"]'); await page.waitForTimeout(1500);
  log("A8 Rencontrer (compte) : permissions demandées ?", { perms: await page.evaluate(() => window.__perms), texteHaut: await page.evaluate(() => document.getElementById("screen-irl").innerText.replace(/\s+/g, " ").trim().slice(0, 200)) });
  await snap(page, "46-rencontrer-compte");
  // Paramètres (compte)
  await page.click('.app-topbar [aria-label="Paramètres"]'); await page.waitForTimeout(400);
  await page.evaluate(() => { const s = document.querySelector("#devPanel .settings-section"); toggleSettingsSection(s); }); await page.waitForTimeout(200);
  log("A9 Paramètres (compte) section Compte", { boutons: await page.evaluate(() => [...document.querySelectorAll("#devPanel .settings-section.open button, #devPanel > div:last-child button")].map(b => ({ label: b.textContent.trim(), visible: !!b.offsetParent }))) });
  await snap(page, "47-parametres-compte");
  // « Voir l'onboarding » pour un compte
  await page.evaluate(() => resetOnboarding()); await page.waitForTimeout(800);
  const e10 = await etat(page);
  log("A10 « Voir l'onboarding » (compte)", { onboardingActif: e10.onboardingActif, onbStep: e10.onbStep, sortie: e10.sortieExploration, ecran: e10.ecranActif, onboarded: await page.evaluate(() => state.onboarded), texte: await page.evaluate(() => document.querySelector(".onb-step.active").innerText.replace(/\s+/g, " ").trim().slice(0, 120)) });
  await snap(page, "48-voir-onboarding-compte");
  await page.goBack().catch(() => {}); await page.waitForTimeout(600);
  log("A10b back", { onboardingActif: (await etat(page)).onboardingActif });
  // Rechargement après « Voir l'onboarding » : où retombe-t-on ?
  await page.reload(); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(3500);
  const e11 = await etat(page);
  log("A11 rechargement après « Voir l'onboarding »", { ecran: e11.ecranActif, onboardingActif: e11.onboardingActif, landing: e11.landingActif, racineFirstRun: e11.racineFirstRun, carte: !!(await page.$("#frWelcome")), onboarded: await page.evaluate(() => state && state.onboarded), profils: await page.evaluate(() => state && state.user.profiles.length) });
  await snap(page, "49-apres-voir-onboarding-reload");
  // Remettre l'état onboardé pour la suite
  await page.evaluate((st) => { localStorage.setItem("passio_mvp_state_v1", JSON.stringify(st)); }, etatOnboarde());
  await page.reload(); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(3000);
  await page.evaluate(() => { const l = document.getElementById("landing"); if (l) l.classList.remove("active"); });
  // Tour démo historique : inventaire des étapes
  await page.evaluate(() => startTour()); await page.waitForTimeout(1000);
  const etapes = [];
  for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => ({ actif: document.getElementById("tourOverlay").classList.contains("active"), label: (document.getElementById("tourStepLabel") || {}).textContent, texte: (document.getElementById("tourOverlay") || {}).innerText.replace(/\s+/g, " ").trim().slice(0, 400), bouton: (document.getElementById("tourNextBtn") || {}).textContent, ecran: (document.querySelector(".screen.active") || {}).id }));
    etapes.push(s); if (!s.actif) break;
    if (i === 0) await snap(page, "50-tour-demo-1"); if (i === 3) await snap(page, "51-tour-demo-4");
    await page.evaluate(() => tourNext()); await page.waitForTimeout(600);
  }
  log("A12 Tour démo (historique)", { etapes, skipVisible: await page.evaluate(() => { const b = [...document.querySelectorAll("#tourOverlay button")].map(b => b.textContent.trim()); return b; }) });
  // « Afficher le pitch » : sortie ?
  await page.evaluate(() => { try { showPitchLanding(); } catch (e) { window.__err = String(e); } }); await page.waitForTimeout(800);
  const e13 = await etat(page);
  log("A13 « Afficher le pitch »", { landing: e13.landingActif, boutons: await page.evaluate(() => [...document.querySelectorAll("#landing button, #landing [onclick]")].filter(b => b.offsetParent).map(b => b.textContent.replace(/\s+/g, " ").trim().slice(0, 40)).slice(0, 12)), err: await page.evaluate(() => window.__err) });
  await snap(page, "52-pitch-landing");
  // Retour depuis le pitch : chaque bouton
  await page.evaluate(() => { const b = [...document.querySelectorAll("#landing button, #landing [onclick]")].find(b => b.offsetParent && /Entrer|Commencer|Découvrir|Retour|Fermer|Continuer/i.test(b.textContent)); window.__btn = b ? b.textContent.trim() : null; if (b) b.click(); }); await page.waitForTimeout(800);
  const e14 = await etat(page);
  log("A14 sortie du pitch", { bouton: await page.evaluate(() => window.__btn), landing: e14.landingActif, onboarding: e14.onboardingActif, ecran: e14.ecranActif });

  // Liens profonds à boot FRAIS (cache-busting)
  let n = 0;
  for (const h of ["#irl-event-e1", "#reel=inexistant", "#irl-event-%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E", "#wallet", "#cdv", "#reel=reel_seed_cuisine_1"]) {
    await page.goto(BASE + "/index.html?a=" + (++n) + h); await page.waitForFunction(() => typeof window.PassioFirstRun !== "undefined"); await page.waitForTimeout(3500);
    const e = await etat(page);
    log("A15 lien profond (compte, boot frais) " + h, { ecran: e.ecranActif, nb: e.nbEcransActifs, eventDetail: e.eventDetailAffiche, reels: e.reelsOuvert, reelsDom: await page.evaluate(() => { const r = document.getElementById("reelsOverlay") || document.querySelector("[id*=reel][class*=overlay], .reels-overlay"); return r ? { id: r.id, cls: r.className, vis: getComputedStyle(r).display } : null; }), hash: e.hash, modal: e.modalTexte ? e.modalTexte.slice(0, 100) : null, navActifs: e.nbNavActifs });
    if (h.startsWith("#reel=reel_seed")) await snap(page, "53-lien-profond-reel-compte");
  }
  J.permissions = await page.evaluate(() => window.__perms);
  fs.writeFileSync(OUT + "/parcours-compte.json", JSON.stringify(J, null, 2));
  console.log("PAGEERRORS", J.erreursConsole.length, JSON.stringify(J.erreursConsole.slice(0, 5)));
  await browser.close();
})().catch((e) => { console.error("ECHEC", e); fs.writeFileSync(OUT + "/parcours-compte.json", JSON.stringify(Object.assign(J, { echec: String(e) }), null, 2)); process.exit(1); });
