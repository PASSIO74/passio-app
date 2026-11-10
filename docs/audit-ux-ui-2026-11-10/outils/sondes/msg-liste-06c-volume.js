// Sonde 06c — liste volumineuse (46 conversations) : pagination, recherche, position de défilement.
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-liste");
module.exports = async ({ page, photo, banc }) => {
  const out = {};
  try {
    const t0 = Date.now();
    await page.evaluate(() => goTo("messages"));
    await jeu.attendreListe(page, 10);
    out.delaiListe = Date.now() - t0;
    await page.waitForTimeout(500);
    out.debut = await page.evaluate(() => ({ cartes: document.querySelectorAll("#messageList .msg-card").length, total: getConversations().length, hauteurListe: document.getElementById("messageList").scrollHeight, bouton: (document.querySelector('#messageList button[onclick="_loadMoreConvs()"]') || {}).textContent || null }));
    await page.evaluate(() => { document.getElementById("appMain").scrollTop = 99999; });
    await page.waitForTimeout(400);
    await photo("bas-de-liste-30");
    out.boutonPlus = await page.evaluate(() => { const b = document.querySelector('#messageList button[onclick="_loadMoreConvs()"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { texte: b.textContent, w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y) }; });
    const avant = await page.evaluate(() => document.getElementById("appMain").scrollTop);
    await page.locator('#messageList button[onclick="_loadMoreConvs()"]').tap();
    await page.waitForTimeout(500);
    out.apresPlus = await page.evaluate(() => ({ cartes: document.querySelectorAll("#messageList .msg-card").length, scrollTop: document.getElementById("appMain").scrollTop, bouton: !!document.querySelector('#messageList button[onclick="_loadMoreConvs()"]') }));
    out.apresPlus.scrollAvant = avant;
    await photo("apres-voir-plus");
    // Ouvrir une conversation en bas de liste puis revenir : la position est-elle gardée ?
    const avantOuverture = await page.evaluate(() => document.getElementById("appMain").scrollTop);
    await page.locator("#messageList .msg-card").nth(38).tap();
    await page.waitForTimeout(900);
    await page.locator("#convFpHead .conv-fp-back").tap();
    await page.waitForTimeout(800);
    out.retour = await page.evaluate(() => ({ scrollTop: document.getElementById("appMain").scrollTop, cartes: document.querySelectorAll("#messageList .msg-card").length }));
    out.retour.scrollAvant = avantOuverture;
    await photo("retour-de-conversation");
    // Changer d'onglet puis revenir : la limite de pagination est-elle gardée ?
    await page.evaluate(() => goTo("feed"));
    await page.waitForTimeout(500);
    await page.evaluate(() => goTo("messages"));
    await page.waitForTimeout(700);
    out.retourOnglet = await page.evaluate(() => ({ scrollTop: document.getElementById("appMain").scrollTop, cartes: document.querySelectorAll("#messageList .msg-card").length }));
    // Recherche
    await page.evaluate(() => { document.getElementById("appMain").scrollTop = 0; });
    const chercher = async (q) => { await page.locator("#convGlobalSearch").fill(q); await page.waitForTimeout(450); return page.evaluate(() => ({ cartes: [...document.querySelectorAll("#messageList .msg-card")].map((c) => c.querySelector(".msg-name").textContent + " → " + c.querySelector(".msg-preview").textContent.slice(0, 60)), vide: getComputedStyle(document.getElementById("messagesEmpty")).display, titreVide: document.querySelector("#messagesEmpty .empty-title").textContent, texteVide: document.querySelector("#messagesEmpty .empty-text").textContent, focus: document.activeElement && document.activeElement.id })); };
    await page.locator("#convGlobalSearch").tap();
    out.rechercheNom = await chercher("malik");
    await photo("recherche-nom");
    out.rechercheTexte = await chercher("capodastre");      // mot présent dans un message ANCIEN de Léa (pas le dernier)
    await photo("recherche-texte-ancien");
    out.rechercheTexteDernier = await chercher("accueil");  // mot du DERNIER message de Malik
    await photo("recherche-texte-dernier");
    out.rechercheSansAccent = await chercher("ines");
    out.rechercheAvecAccent = await chercher("inès");
    out.rechercheGroupe = await chercher("grimpe");
    out.rechercheVide = await chercher("zzzz");
    await photo("recherche-aucun-resultat");
    out.champ = await page.evaluate(() => { const i = document.getElementById("convGlobalSearch"); return { type: i.type, effacer: !!i.parentElement.querySelector("button, .clear, [aria-label*='ffacer']"), aria: i.getAttribute("aria-label"), enterkeyhint: i.getAttribute("enterkeyhint"), inputmode: i.getAttribute("inputmode"), valeur: i.value }; });
    // Quitter l'écran avec une recherche en cours puis revenir : la recherche persiste-t-elle ?
    await page.evaluate(() => goTo("feed"));
    await page.waitForTimeout(400);
    await page.evaluate(() => goTo("messages"));
    await page.waitForTimeout(600);
    out.rechercheApresRetour = await page.evaluate(() => ({ valeur: document.getElementById("convGlobalSearch").value, requete: window._msgSearchQuery, cartes: document.querySelectorAll("#messageList .msg-card").length, vide: getComputedStyle(document.getElementById("messagesEmpty")).display }));
    await photo("recherche-persistante");
    // Clavier simulé pendant une recherche
    await page.locator("#convGlobalSearch").fill("on");
    await page.waitForTimeout(400);
    const rendre = await banc.simulerClavier(page, 300);
    await photo("recherche-clavier");
    await rendre();
  } catch (e) { out.erreur = String((e && e.stack) || e).split(/\n/).slice(0, 5).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peuplerVolume(srv, ctx); } };
