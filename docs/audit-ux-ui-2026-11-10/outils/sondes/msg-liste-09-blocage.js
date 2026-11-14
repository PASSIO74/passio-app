// Sonde 09 — bloquer depuis une conversation, liste des comptes bloqués, écrire à un compte bloqué,
// se choisir soi-même dans « Nouveau message ».
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-liste");
module.exports = async ({ page, photo, GENS, MOI, serveur }) => {
  const out = { dialogues: [] };
  page.on("dialog", async (d) => { out.dialogues.push({ type: d.type(), message: d.message() }); await d.accept().catch(() => {}); });
  const toasts = async () => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  const item = (texte) => page.locator("#convSettingsContent .csetting-item", { hasText: texte }).first();
  try {
    await page.evaluate(() => goTo("messages"));
    await jeu.attendreListe(page, 5);
    // Bloquer Léa (2 non-lus) depuis sa conversation
    await page.locator('#messageList .msg-card:has(.msg-name:has-text("Inès Moreau"))').tap();
    await page.waitForTimeout(800);
    await page.locator('#convFpHead .conv-action-btn[title="Paramètres"]').tap();
    await page.waitForTimeout(450);
    await page.evaluate(() => { document.getElementById("convSettingsContent").scrollTop = 9999; });
    await item("Bloquer").tap();
    await page.waitForTimeout(1200);
    await photo("apres-blocage");
    out.blocage = await page.evaluate(() => ({ conv: document.getElementById("conv-fullpage").classList.contains("active"), dansListe: [...document.querySelectorAll("#messageList .msg-name")].some((n) => /Inès Moreau/.test(n.textContent)), toasts: (window.__toasts || []).map((t) => t.msg), toastVisible: (document.querySelector(".toast, #toast, .toast-container") || {}).innerText || null, bloques: state.user.blocked, nav: (document.querySelector(".nav-msg-badge") || {}).textContent }));
    out.blocageEnBase = serveur.t.blocks.map((b) => (b.blocker_id === MOI.id ? "moi" : b.blocker_id) + "→" + (b.blocked_id === GENS.ines.id ? "Inès" : b.blocked_id));
    // La chercher dans « Nouveau message »
    await page.locator(".v6a-plus").tap(); await page.waitForTimeout(200);
    await page.locator("#v6aMenu .v6a-menu-item").first().tap(); await page.waitForTimeout(500);
    await page.locator("#_nmSearch").fill("inès"); await page.waitForTimeout(1000);
    out.rechercheBloquee = await page.evaluate(() => [...document.querySelectorAll("#_nmResults ._nm-row")].map((l) => l.getAttribute("data-name") + "|" + l.getAttribute("data-uid")));
    await photo("recherche-compte-bloque");
    await page.locator('#_nmResults ._nm-row[data-uid="' + GENS.ines.id + '"]').tap();
    await page.waitForTimeout(900);
    out.ecrireABloquee = { toasts: (await toasts()).slice(-1), conv: await page.evaluate(() => document.getElementById("conv-fullpage").classList.contains("active")), modale: await page.evaluate(() => document.getElementById("modalBackdrop").classList.contains("active")) };
    await photo("ecrire-a-bloquee");
    // Liste des comptes bloqués : ··· → Personnalisation → Comptes bloqués (vrais gestes)
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    await page.waitForTimeout(300);
    out.cheminBloques = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Comptes bloqués/.test(x.textContent)); return b ? { section: (b.closest(".settings-section").querySelector(".settings-section-header span") || {}).textContent, panneau: (b.closest("[id]") || {}).id } : null; });
    await page.evaluate(() => openBlockedList());
    await page.waitForTimeout(500);
    await photo("comptes-bloques");
    out.listeBloques = await page.evaluate(() => { const c = document.getElementById("modalContent"); const b = [...c.querySelectorAll("button")].find((x) => /Débloquer/.test(x.textContent)); return { texte: c.innerText, bouton: b ? { w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), fs: getComputedStyle(b).fontSize } : null }; });
    await page.locator("#modalContent button", { hasText: "Débloquer" }).tap();
    await page.waitForTimeout(1000);
    await photo("apres-deblocage");
    out.deblocage = { toasts: (await toasts()).slice(-1), texte: await page.evaluate(() => document.getElementById("modalContent").innerText), enBase: serveur.t.blocks.length };
    await page.locator("#modalContent button", { hasText: "OK" }).tap();
    await page.waitForTimeout(500);
    out.apresDeblocage = await page.evaluate(() => ({ dansListe: [...document.querySelectorAll("#messageList .msg-name")].some((n) => /Inès Moreau/.test(n.textContent)), ecran: (document.querySelector(".screen.active") || {}).id }));
    // Se choisir soi-même
    await page.locator(".v6a-plus").tap(); await page.waitForTimeout(200);
    await page.locator("#v6aMenu .v6a-menu-item").first().tap(); await page.waitForTimeout(500);
    await page.locator("#_nmSearch").fill("camille a"); await page.waitForTimeout(1000);
    out.moiDansRecherche = await page.evaluate(() => [...document.querySelectorAll("#_nmResults ._nm-row")].map((l) => l.getAttribute("data-name") + "|" + l.getAttribute("data-uid")));
    await photo("moi-dans-recherche");
    const moi = page.locator('#_nmResults ._nm-row[data-uid="' + MOI.id + '"]');
    if (await moi.count()) {
      const convAvant = serveur.t.conversations.length;
      await moi.tap();
      await page.waitForTimeout(1800);
      await photo("conversation-avec-moi");
      out.conversationAvecMoi = await page.evaluate(() => ({ ouverte: document.getElementById("conv-fullpage").classList.contains("active"), nom: (document.querySelector(".conv-fp-name") || {}).textContent, toasts: (window.__toasts || []).map((t) => t.msg).slice(-1) }));
      out.conversationAvecMoi.convCreees = serveur.t.conversations.length - convAvant;
    }
  } catch (e) { out.erreur = String((e && e.stack) || e).split(/\n/).slice(0, 5).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerQuelques(srv, ctx); } };
