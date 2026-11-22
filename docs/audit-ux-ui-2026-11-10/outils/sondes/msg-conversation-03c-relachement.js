// Sonde 03c — la feuille d'actions s'ouvre SOUS le doigt encore posé : qu'y a-t-il
// sous le doigt à ce moment-là, et que fait le relâchement ?
"use strict";
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
module.exports = async ({ page, banc, photo, GENS }) => {
  const out = { cas: [] };
  try {
    await jeu.routes(page);
    await jeu.entrer(page, GENS.lea.nom);
    const sousLeDoigt = (sel) => page.evaluate((s) => {
      const b = document.querySelector(s).getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const e = document.elementFromPoint(x, y);
      const item = e && e.closest ? e.closest(".csetting-item, span[onclick^='_reactAndClose']") : null;
      const feuille = document.querySelector("#modalBackdrop.active .modal, #modalBackdrop.active #modalContent");
      return { doigt: { x: Math.round(x), y: Math.round(y) }, element: e ? (e.id || e.className || e.tagName).toString().slice(0, 50) : null, action: item ? item.innerText.replace(/\s+/g, " ").trim() : null, hautFeuille: feuille ? Math.round(feuille.getBoundingClientRect().top) : null };
    }, sel);
    for (const id of ["m_lea_22", "m_lea_21", "m_lea_19"]) {
      await jeu.filPret(page); await jeu.enBas(page);
      const n0 = await page.evaluate((c) => getConversations().find((x) => x.id === c).messages.length, jeu.IDS.lea);
      const main = await banc.appuiMaintenu(page, jeu.bulle(id));
      await page.waitForTimeout(750);
      const s = await sousLeDoigt(jeu.bulle(id));
      if (id === "m_lea_22") await photo("feuille-sous-le-doigt");
      await main.relacher();
      await page.waitForTimeout(800);
      const apres = await page.evaluate((c) => ({ feuilleOuverte: document.getElementById("modalBackdrop").classList.contains("active"), n: getConversations().find((x) => x.id === c).messages.length, reponse: !!document.getElementById("convReplyBar"), toasts: (window.__toasts || []).map((t) => t.msg).slice(-1) }), jeu.IDS.lea);
      out.cas.push({ bulle: id, sousLeDoigt: s, apresRelachement: { feuilleOuverte: apres.feuilleOuverte, messagesRetires: n0 - apres.n, barreReponse: apres.reponse, toast: apres.toasts[0] || null } });
      await page.evaluate(() => { try { closeModal(); } catch (e) {} try { _cancelReply(); } catch (e) {} });
      await page.waitForTimeout(500);
    }
    // Variante : relâché après un glissement (ce que fait un doigt qui « sort » de la bulle)
    await jeu.filPret(page); await jeu.enBas(page);
    const main = await banc.appuiMaintenu(page, jeu.bulle("m_lea_21"));
    await page.waitForTimeout(750);
    await main.glisser(0, -220);
    await page.waitForTimeout(80);
    await main.relacher();
    await page.waitForTimeout(600);
    out.glisseAvantRelachement = await page.evaluate(() => ({ feuilleOuverte: document.getElementById("modalBackdrop").classList.contains("active") }));
    await photo("feuille-ouverte");
  } catch (e) { out.ERREUR = String(e && e.message).split("\n").slice(0, 3).join(" | "); }
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
