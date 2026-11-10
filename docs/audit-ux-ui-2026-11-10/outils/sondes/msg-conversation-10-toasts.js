// Sonde 10 — les toasts sont-ils VISIBLES quand la conversation est ouverte ?
// `.toast-stack` est en z-index 200, `#conv-fullpage` en z-index 1200, dans la même coque.
// Mesure : ordre d'empilement (elementFromPoint après avoir rendu le toast « touchable »
// le temps de la mesure) + capture SANS l'option qui fige les animations (les captures du
// banc avancent les animations à leur fin, donc l'effacement du toast : il y est toujours
// invisible, ce n'est pas une preuve).
"use strict";
const path = require("path");
const os = require("os");
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
module.exports = async ({ page, GENS }) => {
  const out = {};
  try {
    await jeu.routes(page);
    const mesure = async (nom) => {
      await page.evaluate(() => toast("Toast de contrôle de l'audit"));
      await page.waitForTimeout(500);
      const f = path.join(os.tmpdir(), "passio-audit-sondes", "msg-conversation-10-" + nom + ".png");
      await page.screenshot({ path: f });      // animations laissées telles quelles
      const r = await page.evaluate(() => {
        const t = [...document.querySelectorAll("#toastStack .toast")].pop(); if (!t) return { toast: false };
        const st = document.getElementById("toastStack"); const b = t.getBoundingClientRect();
        const z = (e) => getComputedStyle(e).zIndex;
        const anc = st.style.pointerEvents; st.style.pointerEvents = "auto";
        const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        st.style.pointerEvents = anc;
        return { toast: true, boite: { y: Math.round(b.top), h: Math.round(b.height) }, opacite: getComputedStyle(t).opacity, zPile: z(st), zConversation: z(document.getElementById("conv-fullpage")), parentPile: st.parentElement.className, parentConv: document.getElementById("conv-fullpage").parentElement.className, auDessus: e ? (e.id || e.className || e.tagName).toString().slice(0, 50) : null, toastAuPremierPlan: !!e && (e === t || t.contains(e)) };
      });
      r.image = f; return r;
    };
    await page.evaluate(() => goTo("messages")); await page.waitForTimeout(1200);
    out.surLaListe = await mesure("liste");
    await page.waitForTimeout(3200);
    await jeu.entrer(page, GENS.ines.nom);
    out.dansLaConversation = await mesure("conversation");
    await page.waitForTimeout(3200);
    // La feuille d'actions (modale) par-dessus la conversation
    await page.evaluate(() => openModal('<div class="modal-handle"></div><div class="modal-title">Fenêtre de contrôle</div>')); await page.waitForTimeout(500);
    out.sousUneModale = await mesure("modale");
  } catch (e) { out.ERREUR = String(e && e.message).split("\n").slice(0, 3).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
