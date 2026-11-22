// Sonde — VISITEUR ARRIVÉ PAR UN LIEN : « Créer mon compte » montre-t-il le
// formulaire ? Le lien ouvre une page plein écran (publication z-index 200,
// fiche d'activité 200, lecteur de bobines 9999) ; la fenêtre « Crée ton compte
// pour… » s'affiche au-dessus (10001) ; son bouton ouvre `#onboarding`.
// On mesure CE QUI EST AU PREMIER PLAN après ce geste, à cinq points de l'écran.
//   LIEN="#post-pa_lea_1" | "#irl-event-ev_par_lea" | "#reel=pa_lea_2" | "#user-<uuid>"
//   PORTE=gate (défaut : geste engageant puis « Créer mon compte ») | toast (toucher « X t'invite »)
"use strict";
const path = require("path");
const os = require("os");
const v = require("./partage-09-liens-visiteur");
const LIEN = process.env.LIEN || "#post-pa_lea_1";
const PORTE = process.env.PORTE || "gate";

const premierPlan = () => {
  const pts = [[195, 120], [195, 300], [195, 480], [195, 660], [60, 400]];
  const racine = (e) => { let n = e; while (n && n !== document.body) { if (n.id && /^(onboarding|postDetailPage|eventDetailPage|reelsViewer|modalBackdrop|landing|appMain|screen-feed)$/.test(n.id)) return n.id; if (n.classList && n.classList.contains("app-shell")) return "app-shell"; n = n.parentElement; } return e ? (e.id || e.tagName) : "rien"; };
  const z = (id) => { const e = document.getElementById(id); if (!e) return null; const c = getComputedStyle(e); return { z: c.zIndex, pos: c.position, display: c.display, active: e.classList.contains("active") || e.classList.contains("open") }; };
  return {
    auPremierPlan: pts.map(([x, y]) => racine(document.elementFromPoint(x, y))),
    plans: { onboarding: z("onboarding"), publication: z("postDetailPage"), fiche: z("eventDetailPage"), bobines: z("reelsViewer"), modale: z("modalBackdrop") },
    formulaireVisible: (() => { const f = document.querySelector("#onboarding input[type='email'], #onboarding #authEmail, #onboarding input"); if (!f) return null; const r = f.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], auDessus: top ? racine(top) : null, atteignable: top === f || (top && f.contains(top)) }; })(),
    hash: location.hash,
  };
};

module.exports = async ({ page, vue }) => {
  const out = { lien: LIEN, porte: PORTE };
  const dossier = path.join(os.tmpdir(), "passio-audit-sondes");
  const nomLien = LIEN.replace(/[^a-z]+/gi, "-").slice(0, 18);
  const vraiePhoto = async (nom) => { const f = path.join(dossier, "partage-10--" + vue + "-" + nomLien + "-" + PORTE + "-" + nom + ".png"); await page.screenshot({ path: f }); console.log("image (animations actives) : " + f); };
  await page.waitForTimeout(2500);
  out.arrivee = await page.evaluate(premierPlan);
  await vraiePhoto("1-arrivee");
  if (PORTE === "toast") {
    const t = page.locator("#toastStack .toast.clickable").first();
    out.toast = await t.count();
    if (!out.toast) { await page.evaluate(() => { const i = JSON.parse(localStorage.getItem("passio_invitation_v1") || "null"); if (i) { i.accueillie = false; localStorage.setItem("passio_invitation_v1", JSON.stringify(i)); accueillirInvitation(); } }); await page.waitForTimeout(900); }
    await vraiePhoto("2-toast");
    await page.locator("#toastStack .toast.clickable").first().click();
  } else {
    // Geste engageant, selon l'écran d'arrivée.
    if (/^#post-/.test(LIEN)) await page.locator("#postDetailContent .post-actions .post-action").first().click();
    else if (/^#irl-event-/.test(LIEN)) await page.locator("#eventDetailPage button").filter({ hasText: /participe|Rejoindre|Je viens/ }).first().click();
    else if (/^#reel=/.test(LIEN)) await page.locator(".reel-item .reel-action-btn[aria-label='Aimer']").first().click();
    else if (/^#user-/.test(LIEN)) await page.locator("#modalContent button").filter({ hasText: /^Suivre|Suivre$/ }).first().click();
    await page.waitForTimeout(800);
    out.gate = await page.evaluate(() => ({ ouverte: document.getElementById("modalBackdrop").classList.contains("active"), texte: document.getElementById("modalContent").innerText.replace(/\s+/g, " ").slice(0, 120) }));
    await vraiePhoto("2-gate");
    await page.locator("#modalContent button", { hasText: "Créer mon compte" }).click();
  }
  await page.waitForTimeout(1200);
  out.apres = await page.evaluate(premierPlan);
  await vraiePhoto("3-apres-creer-mon-compte");
  // Le visiteur ferme la page (retour) : découvre-t-il le formulaire dessous ?
  await page.goBack().catch(() => {});
  await page.waitForTimeout(900);
  out.apresRetour = await page.evaluate(premierPlan);
  await vraiePhoto("4-apres-retour");
  return out;
};
module.exports.demarrage = { mode: "visiteur", query: LIEN.split("#")[0], hash: LIEN.indexOf("#") > -1 ? LIEN.slice(LIEN.indexOf("#")) : "", avantBoot: async (page) => { await v.brancherVisiteur(page); } };
