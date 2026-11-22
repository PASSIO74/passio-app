// Sonde 10 — chargement (squelette), hors ligne, reconnexion, serveur en erreur.
// · Squelette : il n'apparaît que si AUCUNE conversation n'est connue localement et que la première
//   lecture serveur n'est pas revenue → stockage local vide + première lecture de `conv_members`
//   retenue 30 s par une route posée après celle du faux serveur (donc consultée avant elle).
// · Hors ligne : `context.setOffline(true)` ne coupe pas les réponses servies par une route ; la même
//   route refuse donc toute requête Supabase (`internetdisconnected`) tant que le drapeau est levé.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-liste");
const etat = { horsLigne: false, retenue: null };
module.exports = async ({ page, photo, context, serveur }) => {
  const out = {};
  const toasts = async () => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  const couper = async (oui) => { etat.horsLigne = oui; await context.setOffline(oui); await page.evaluate((o) => window.dispatchEvent(new Event(o ? "offline" : "online")), oui); };
  try {
    await page.evaluate(() => goTo("messages"));
    await page.waitForTimeout(500);
    await photo("squelette");
    out.squelette = await page.evaluate(() => { const l = document.getElementById("messageList"); const s = document.querySelector(".msg-skel-row"); return { lignes: document.querySelectorAll(".msg-skel-row").length, cartes: document.querySelectorAll("#messageList .msg-card").length, vide: getComputedStyle(document.getElementById("messagesEmpty")).display, netLoaded: !!window._convNetLoaded, ariaBusy: l.getAttribute("aria-busy"), ariaHiddenLigne: s ? s.getAttribute("aria-hidden") : null, texteAnnonce: l.innerText.trim(), animation: s ? getComputedStyle(s.querySelector(".skeleton")).animationName : null, hauteurLigne: s ? Math.round(s.getBoundingClientRect().height) : null }; });
    // Le filet de 8 s : au-delà, l'écran bascule sur « Aucune conversation » alors que la lecture n'est PAS revenue
    await page.waitForTimeout(8600);
    await photo("squelette-apres-8s");
    out.apres8s = await page.evaluate(() => ({ lignes: document.querySelectorAll(".msg-skel-row").length, vide: getComputedStyle(document.getElementById("messagesEmpty")).display, titre: document.querySelector("#messagesEmpty .empty-title").textContent, texte: document.querySelector("#messagesEmpty .empty-text").textContent }));
    // On relâche la lecture retenue : la liste arrive
    if (etat.retenue) etat.retenue();
    await jeu.attendreListe(page, 5).catch(() => {});
    await page.waitForTimeout(500);
    out.apresChargement = await page.evaluate(() => ({ lignes: document.querySelectorAll(".msg-skel-row").length, cartes: document.querySelectorAll("#messageList .msg-card").length, vide: getComputedStyle(document.getElementById("messagesEmpty")).display }));
    await photo("liste-arrivee");
    // ── Hors ligne ──
    await couper(true);
    await page.waitForTimeout(800);
    await photo("hors-ligne-liste");
    out.horsLigne = await page.evaluate(() => { const b = document.getElementById("offlineBanner"); const r = b.getBoundingClientRect(); const tb = document.querySelector(".topbar, #topbar, header"); return { banniere: getComputedStyle(b).display, texte: b.innerText.trim(), y: Math.round(r.y), h: Math.round(r.height), z: getComputedStyle(b).zIndex, topbarY: tb ? Math.round(tb.getBoundingClientRect().y) : null, enLigne: navigator.onLine, cartes: document.querySelectorAll("#messageList .msg-card").length, boutonFermer: (function () { const x = b.querySelector("button"); const rr = x.getBoundingClientRect(); return { w: Math.round(rr.width), h: Math.round(rr.height), aria: x.getAttribute("aria-label") }; })(), sousLaBanniere: (function () { const e = document.elementFromPoint(innerWidth - 30, 30); return e ? (e.id || e.className || e.tagName) : null; })() }; });
    // Hors ligne : chercher une personne qui n'est pas dans mes conversations
    await page.locator(".v6a-plus").tap(); await page.waitForTimeout(250);
    await page.locator("#v6aMenu .v6a-menu-item").first().tap(); await page.waitForTimeout(500);
    await page.locator("#_nmSearch").fill("nino"); await page.waitForTimeout(1800);
    await photo("hors-ligne-recherche");
    out.horsLigneRecherche = await page.evaluate(() => document.getElementById("_nmResults").innerText);
    await page.evaluate(() => { try { closeModal(); } catch (e) {} });
    await page.waitForTimeout(300);
    // Hors ligne : créer un groupe
    await page.locator(".v6a-plus").tap(); await page.waitForTimeout(250);
    await page.locator("#v6aMenu .v6a-menu-item").nth(1).tap(); await page.waitForTimeout(600);
    await page.locator("#groupName").fill("Essai hors ligne");
    await page.locator("#modalContent .group-passion-option").first().tap();
    await page.locator("#modalContent .group-user-option").first().tap();
    await page.locator("#modalContent button", { hasText: "Créer le groupe" }).tap();
    await page.waitForTimeout(3000);
    out.groupeHorsLigne = { toasts: (await toasts()).slice(-2), local: await page.evaluate(() => { const g = getConversations().find((c) => c.groupName === "Essai hors ligne"); return g ? { prefixe: g.id.slice(0, 9) } : null; }), enBase: serveur.t.conversations.filter((c) => c.group_name === "Essai hors ligne").length, modale: await page.evaluate(() => document.getElementById("modalBackdrop").classList.contains("active")) };
    await photo("hors-ligne-groupe-cree");
    // ── Reconnexion ──
    await couper(false);
    await page.waitForTimeout(3000);
    out.reconnexion = { banniere: await page.evaluate(() => getComputedStyle(document.getElementById("offlineBanner")).display), groupeEnBase: serveur.t.conversations.filter((c) => c.group_name === "Essai hors ligne").length, toasts: (await toasts()).slice(-2) };
    await photo("reconnexion");
    // ── Serveur en erreur 500 sur la recherche de personnes ──
    serveur.pannes.push({ table: "profiles", methode: "GET", status: 500, body: { message: "panne simulée" } });
    await page.locator(".v6a-plus").tap(); await page.waitForTimeout(250);
    await page.locator("#v6aMenu .v6a-menu-item").first().tap(); await page.waitForTimeout(500);
    await page.locator("#_nmSearch").fill("nino"); await page.waitForTimeout(1800);
    await photo("recherche-serveur-en-erreur");
    out.rechercheErreur = await page.evaluate(() => document.getElementById("_nmResults").innerText);
    serveur.pannes.length = 0;
    // ── Création de conversation refusée par le serveur (500) ──
    await page.locator("#_nmSearch").fill("nin"); await page.waitForTimeout(1500);
    await page.locator("#_nmSearch").fill("nino"); await page.waitForTimeout(1800);
    serveur.pannes.push({ table: "conversations", methode: "POST", status: 500, body: { message: "panne simulée" } });
    const ligne = page.locator("#_nmResults ._nm-row").first();
    if (await ligne.count()) {
      await ligne.tap();
      await page.waitForTimeout(2200);
      out.creationRefusee = await page.evaluate(() => { const fp = document.getElementById("conv-fullpage"); return { ouverte: fp.classList.contains("active"), id: fp.getAttribute("data-conv-id"), toasts: (window.__toasts || []).map((t) => t.msg).slice(-2), nom: (document.querySelector(".conv-fp-name") || {}).textContent }; });
      await photo("conversation-apres-refus-serveur");
    } else out.creationRefusee = "personne introuvable";
    serveur.pannes.length = 0;
  } catch (e) { out.erreur = String((e && e.stack) || e).split(/\n/).slice(0, 5).join(" | "); }
  return out;
};
module.exports.demarrage = {
  mode: "compte",
  stockage: { passio_conversations_v1: "[]" },
  peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerVolume(srv, ctx); },
  avantBoot: async (page) => {
    let dejaRetenue = false;
    await page.route(/supabase\.co/, async (route) => {
      const u = route.request().url();
      if (etat.horsLigne) return route.abort("internetdisconnected");
      if (!dejaRetenue && /\/rest\/v1\/conv_members/.test(u) && route.request().method() === "GET") {
        dejaRetenue = true;
        await new Promise((r) => { etat.retenue = r; setTimeout(r, 40000); });
      }
      return route.fallback();
    });
  },
};
