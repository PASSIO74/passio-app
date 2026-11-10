// Sonde — OUVERTURE D'UN LIEN PAR UN VISITEUR (appareil vierge, aucune session).
//
// Le mode `visiteur` du banc sert un projet Supabase VIDE : un lien vers un vrai
// contenu y serait toujours « introuvable ». Cette sonde branche donc, AVANT le
// démarrage, le faux serveur en mémoire du banc (policies recopiées) sur la page
// du visiteur : le rôle `anon` y lit ce qu'un visiteur lit en production
// (publications des comptes publics, profils, activités) et rien d'autre.
// Les médias fictifs sont servis sous la forme d'URL du seau public `content`.
//   LIEN="?inv=<uuid>#post-pa_lea_1" node …/sonde.js …/partage-09-liens-visiteur.js
//   GESTE=aimer|suivre|rejoindre|invitation  (ce que le visiteur tente ensuite)
"use strict";
const fs = require("fs");
const path = require("path");
const banc = require("../banc");
const base = require("../jeu/base");
const jeu = require("../jeu/partage");
const LIEN = process.env.LIEN || "";
const GESTE = process.env.GESTE || "";

const MEDIAS = path.join(__dirname, "..", "medias");
const media = (nom) => "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/audit/" + nom;

async function brancherVisiteur(page) {
  const srv = new banc.FauxServeur();
  srv.compte(banc.MOI.id, banc.MOI.nom, { emoji: "🎧" });
  base.peupler(srv, { MOI: banc.MOI, GENS: banc.GENS, media });
  jeu.peupler(srv, { MOI: banc.MOI, GENS: banc.GENS, media });
  await srv.brancher(page);
  // Posée APRÈS (donc prioritaire) : les médias fictifs, servis depuis le disque.
  await page.route(/supabase\.co\/storage\/v1\/object\/public\/content\/audit\//, (route) => {
    const nom = route.request().url().split("/audit/")[1].split("?")[0];
    const f = path.join(MEDIAS, path.basename(nom));
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: /\.webm$/.test(f) ? "video/webm" : "image/jpeg", body: fs.readFileSync(f) });
  });
  page.__srv = srv;
  return srv;
}

const etat = () => {
  const vis = (id) => { const e = document.getElementById(id); return !!(e && e.style.display && e.style.display !== "none"); };
  const act = (id) => { const e = document.getElementById(id); return !!(e && e.classList.contains("active")); };
  const pd = document.querySelector("#postDetailContent .post[data-postid]");
  const rv = document.getElementById("reelsViewer");
  let prefs = null; try { prefs = JSON.parse(localStorage.getItem("passio_first_run_v1") || "null"); } catch (e) {}
  return {
    url: location.search + location.hash,
    landing: act("landing"), onboarding: act("onboarding"),
    ecran: (document.querySelector(".screen.active") || {}).id,
    publication: vis("postDetailPage") ? (pd && pd.getAttribute("data-postid")) : null,
    fiche: vis("eventDetailPage") ? (document.querySelector("#eventDetailPage .event-detail-title, #eventDetailPage h1, #eventDetailPage h2") || {}).innerText : null,
    modale: act("modalBackdrop") ? document.getElementById("modalContent").innerText.replace(/\s+/g, " ").slice(0, 160) : null,
    bobines: rv.classList.contains("open"),
    toasts: Array.from(document.querySelectorAll("#toastStack .toast")).map((t) => t.innerText),
    bienvenue: !!document.querySelector(".fr-welcome, #frWelcome, .fr-bienvenue"),
    bulle: (document.querySelector(".fr-tip") || {}).innerText || null,
    invitation: localStorage.getItem("passio_invitation_v1"),
    lienArrivee: localStorage.getItem("passio_lien_arrivee_v1"),
    retour: prefs && prefs.retour,
    supaReel: !!window._supaReal,
  };
};

module.exports = async ({ page, photo }) => {
  const out = { lien: LIEN, geste: GESTE };
  // Journal des toasts (le banc ne l'installe qu'en mode compte).
  await page.evaluate(() => { if (!window.__toasts) { window.__toasts = []; const _t = window.toast; window.toast = function (m, ty) { window.__toasts.push({ t: Date.now(), msg: String(m), type: ty || "info" }); return _t.apply(this, arguments); }; } });
  out.a_3s = await page.evaluate(etat);
  await photo("a-3s");
  // Attendre l'arrivée ou le verdict (jusqu'à 14 s de plus).
  const t0 = Date.now();
  let e = out.a_3s;
  while (Date.now() - t0 < 14000 && !(e.publication || e.fiche || e.modale || e.bobines) && !(await page.evaluate(() => (window.__toasts || []).some((t) => /introuvable|non trouvé|disponible/.test(t.msg))))) {
    await page.waitForTimeout(400);
    e = await page.evaluate(etat);
  }
  out.attenteMs = Date.now() - t0;
  out.b_arrivee = e;
  out.journalToasts = await page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  await page.waitForTimeout(500);
  await photo("b-arrivee");

  if (GESTE === "aimer" && e.publication) {
    await page.locator("#postDetailContent .post-actions .post-action").first().click();
    await page.waitForTimeout(700);
    out.c_gate = await page.evaluate(etat);
    await photo("c-gate");
    await page.locator("#modalContent button", { hasText: "Créer mon compte" }).click();
    await page.waitForTimeout(900);
    out.d_auth = await page.evaluate(etat);
    out.d_authInvite = await page.evaluate(() => { const a = document.getElementById("authInvite"); const m = document.getElementById("authMsg"); return { invite: a ? { visible: a.style.display, texte: a.innerText } : null, msg: m ? m.innerText : null, publicationDessous: (() => { const p = document.getElementById("postDetailPage"); return p && p.style.display; })() }; });
    await photo("d-auth");
    // Fin d'inscription SIMULÉE : le crochet que `onbFinish` appelle, sans aucun compte.
    out.e_avantCrochet = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("passio_first_run_v1") || "{}"); return p.retour; });
    await page.evaluate(() => { const b = document.getElementById("frBackToExplore"); if (b) b.remove(); const o = document.getElementById("onboarding"); if (o) o.classList.remove("active"); try { closePost(); } catch (e) {} try { PassioFirstRun.apresAuthentification(); } catch (e) { window.__errCrochet = String(e); } });
    await page.waitForTimeout(1800);
    out.f_apresCrochet = await page.evaluate(etat);
    out.f_err = await page.evaluate(() => window.__errCrochet || null);
    out.f_toasts = await page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
    await photo("f-apres-inscription-simulee");
  }
  if (GESTE === "rejoindre" && e.fiche) {
    const cta = page.locator("#eventDetailCta button, #eventDetailPage .v4b-cta button, #eventDetailPage button").filter({ hasText: /participe|Rejoindre|Je viens/ }).first();
    out.c_cta = await cta.count();
    if (out.c_cta) { await cta.click(); await page.waitForTimeout(800); out.c_gate = await page.evaluate(etat); await photo("c-gate"); }
    await page.evaluate(() => { const b = Array.from(document.querySelectorAll("#modalContent button")).find((x) => /Créer mon compte/.test(x.innerText)); if (b) b.click(); });
    await page.waitForTimeout(900);
    out.d_auth = await page.evaluate(etat);
    await photo("d-auth");
    out.e_retour = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("passio_first_run_v1") || "{}"); return p.retour; });
    await page.evaluate(() => { const b = document.getElementById("frBackToExplore"); if (b) b.remove(); const o = document.getElementById("onboarding"); if (o) o.classList.remove("active"); try { closeEventDetail(); } catch (e) {} try { goTo("feed"); } catch (e) {} try { PassioFirstRun.apresAuthentification(); } catch (e) { window.__errCrochet = String(e); } });
    await page.waitForTimeout(2500);
    out.f_apresCrochet = await page.evaluate(etat);
    out.f_toasts = await page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
    await photo("f-apres-inscription-simulee");
  }
  if (GESTE === "invitation") {
    // Toucher le toast d'invitation s'il est encore là, sinon ouvrir l'inscription par la carte.
    const t = page.locator("#toastStack .toast.clickable").first();
    out.c_toastCliquable = await t.count();
    if (out.c_toastCliquable) await t.click(); else await page.evaluate(() => PassioFirstRun.allerInscription("invitation"));
    await page.waitForTimeout(900);
    out.d_auth = await page.evaluate(etat);
    out.d_authInvite = await page.evaluate(() => { const a = document.getElementById("authInvite"); const non = document.getElementById("authInviteNon"); const r = non ? non.getBoundingClientRect() : null; const ra = a ? a.getBoundingClientRect() : null; return { visible: a && a.style.display, texte: a && a.innerText, hauteur: ra && Math.round(ra.height), non: r ? [Math.round(r.width), Math.round(r.height)] : null, fs: a && getComputedStyle(a).fontSize, onglet: (document.querySelector("#authTabSignup.active, #authTabSignin.active") || {}).id }; });
    await photo("d-auth-invitation");
    // Onglet « Connexion » : l'annonce doit disparaître.
    await page.evaluate(() => switchAuthTab("signin"));
    await page.waitForTimeout(300);
    out.e_connexion = await page.evaluate(() => { const a = document.getElementById("authInvite"); return a && a.style.display; });
    await photo("e-auth-connexion");
    await page.evaluate(() => switchAuthTab("signup"));
    await page.waitForTimeout(300);
    const non = page.locator("#authInviteNon");
    if (await non.count()) { await non.click(); await page.waitForTimeout(400); out.f_apresRefus = await page.evaluate(() => ({ visible: (document.getElementById("authInvite") || {}).style.display, invitation: localStorage.getItem("passio_invitation_v1") })); await photo("f-apres-ne-pas-suivre"); }
  }
  return out;
};
module.exports.demarrage = { mode: "visiteur", query: LIEN.split("#")[0], hash: LIEN.indexOf("#") > -1 ? LIEN.slice(LIEN.indexOf("#")) : "", avantBoot: async (page) => { await brancherVisiteur(page); } };
module.exports.brancherVisiteur = brancherVisiteur;
module.exports.media = media;
