// Sonde 06b — compte connecté SANS conversation serveur : ce que montre la liste, ce que propose
// « Nouveau message », recherche sans accent, choix d'un personnage d'exemple, demande de notification.
"use strict";
const base = require("../jeu/base");
module.exports = async ({ page, photo, serveur, GENS }) => {
  const out = {};
  const toasts = async () => page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
  try {
    await page.evaluate(() => goTo("messages"));
    await page.waitForTimeout(1500);
    await photo("liste-compte-neuf");
    out.liste = await page.evaluate(() => ({ cartes: [...document.querySelectorAll("#messageList .msg-card")].map((c) => c.querySelector(".msg-name").textContent + " | " + [...c.querySelectorAll(".msg-passion")].map((x) => x.textContent).join("|")), vide: getComputedStyle(document.getElementById("messagesEmpty")).display, nav: (document.querySelector(".nav-msg-badge") || {}).textContent || null }));
    await page.locator(".v6a-plus").tap();
    await page.waitForTimeout(200);
    await page.locator("#v6aMenu .v6a-menu-item").first().tap();
    await page.waitForTimeout(600);
    await photo("nouveau-message-compte-neuf");
    out.suggestions = await page.evaluate(() => [...document.querySelectorAll("#_nmResults ._nm-row")].map((l) => l.getAttribute("data-name") + "|" + l.getAttribute("data-uid")));
    // Recherche sans accent : « lea » alors que la personne s'appelle « Léa »
    const chercher = async (q) => { await page.locator("#_nmSearch").fill(q); await page.waitForTimeout(1000); return page.evaluate(() => [...document.querySelectorAll("#_nmResults ._nm-row")].map((l) => l.getAttribute("data-name") + "|" + l.getAttribute("data-uid")).concat([document.getElementById("_nmResults").innerText.slice(0, 60)])); };
    out.rechercheLeaSansAccent = await chercher("lea f");
    await photo("recherche-lea-sans-accent");
    out.rechercheLeaAvecAccent = await chercher("léa f");
    out.rechercheInesSansAccent = await chercher("ines");
    out.rechercheInesAvecAccent = await chercher("inès");
    out.rechercheUneLettre = await chercher("m");
    await photo("recherche-une-lettre");
    out.rechercheMoi = await chercher("camille");
    out.requetes = serveur.journal.filter((r) => r.table === "profiles" && r.m === "GET" && /ilike/.test(r.url)).map((r) => decodeURIComponent(r.url).slice(0, 140));
    // Choisir un PERSONNAGE D'EXEMPLE proposé à côté des vraies personnes
    await page.locator("#_nmSearch").fill("tom");
    await page.waitForTimeout(1000);
    await page.locator('#_nmResults ._nm-row[data-uid="u_tom"]').tap();
    await page.waitForTimeout(1500);
    await photo("conversation-avec-exemple");
    out.exempleChoisi = await page.evaluate(() => { const fp = document.getElementById("conv-fullpage"); const id = fp.getAttribute("data-conv-id"); const c = getConversations().find((x) => x.id === id); return { ouverte: fp.classList.contains("active"), id, demo: _estConvDemo(c), nom: (document.querySelector(".conv-fp-name") || {}).textContent }; });
    out.exempleEnBase = { conv: serveur.t.conversations.length, membres: serveur.t.conv_members.map((m) => m.user_id) };
    await page.locator("#convFpInput").fill("Bonjour Tom");
    await page.locator("#convFpSendBtn").tap();
    await page.waitForTimeout(800);
    out.ecrireExemple = (await toasts()).slice(-1);
    await page.locator("#convFpHead .conv-fp-back").tap();
    await page.waitForTimeout(700);
    await photo("liste-apres-exemple");
    out.listeApres = await page.evaluate(() => [...document.querySelectorAll("#messageList .msg-card")].map((c) => c.querySelector(".msg-name").textContent + " | " + [...c.querySelectorAll(".msg-passion")].map((x) => x.textContent).join("|") + " | " + c.querySelector(".msg-preview").textContent));
    // Écrire à une vraie personne jamais contactée → la première conversation
    await page.locator(".v6a-plus").tap();
    await page.waitForTimeout(200);
    await page.locator("#v6aMenu .v6a-menu-item").first().tap();
    await page.waitForTimeout(500);
    await page.locator("#_nmSearch").fill("malik");
    await page.waitForTimeout(1000);
    await page.locator("#_nmResults ._nm-row").first().tap();
    await page.waitForTimeout(1800);
    await photo("premiere-conversation");
    out.premiere = await page.evaluate(() => ({ ouverte: document.getElementById("conv-fullpage").classList.contains("active"), nom: (document.querySelector(".conv-fp-name") || {}).textContent, fil: document.getElementById("convFpThread").innerText.slice(0, 200), notifDemandee: window.__notifDemandes || 0, toasts: (window.__toasts || []).map((t) => t.msg) }));
    await page.locator("#convFpHead .conv-fp-back").tap();
    await page.waitForTimeout(800);
    await photo("liste-apres-premiere");
    out.listeApresPremiere = await page.evaluate(() => [...document.querySelectorAll("#messageList .msg-card")].map((c) => c.querySelector(".msg-name").textContent + " | " + [...c.querySelectorAll(".msg-passion")].map((x) => x.textContent).join("|") + " | " + c.querySelector(".msg-preview").textContent + " | " + c.querySelector(".msg-time").textContent));
  } catch (e) { out.erreur = String((e && e.stack) || e).split(/\n/).slice(0, 5).join(" | "); }
  return out;
};
module.exports.demarrage = {
  mode: "compte",
  peupler: (srv, ctx) => { base.peupler(srv, ctx); },
  // Permission de notification « jamais demandée » : la demande native n'est pas observable sans
  // tête ; on la remplace par un témoin qui compte les appels et répond « accordée ».
  avantBoot: async (page) => {
    await page.addInitScript(() => {
      try {
        window.__notifDemandes = 0;
        const N = function () {};
        N.permission = "default";
        N.requestPermission = function () { window.__notifDemandes++; N.permission = "granted"; return Promise.resolve("granted"); };
        Object.defineProperty(window, "Notification", { configurable: true, get: function () { return N; } });
      } catch (e) {}
    });
  },
};
