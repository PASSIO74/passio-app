// Sonde 11 — extrait le balisage RÉEL de la conversation (base du prototype « messagerie »).
// Écrit dans le dossier temporaire des sondes : la carte de la liste, l'en-tête, quelques
// bulles typiques (texte reçu/envoyé, vocal reçu, document reçu), la barre de saisie et le
// menu « + », nettoyés de leurs gestionnaires (on*="…").
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const base = require("../jeu/base");
const jeu = require("../jeu/msg-conversation");
module.exports = async ({ page, GENS }) => {
  const dossier = path.join(os.tmpdir(), "passio-audit-sondes", "html");
  fs.mkdirSync(dossier, { recursive: true });
  const propre = (h) => h.replace(/\son[a-z]+="[^"]*"/gi, "").replace(/\son[a-z]+='[^']*'/gi, "");
  const out = { fichiers: [] };
  await jeu.routes(page);
  await page.evaluate(() => goTo("messages")); await page.waitForTimeout(1200);
  const ecrire = async (nom, sel) => {
    const h = await page.evaluate((s) => [...document.querySelectorAll(s)].slice(0, 1).map((e) => e.outerHTML).join("\n"), sel);
    const f = path.join(dossier, "msgconv-" + nom + ".html");
    fs.writeFileSync(f, propre(h || "")); out.fichiers.push({ nom, octets: (h || "").length, f });
  };
  await ecrire("carte-liste", "#messageList .msg-card");
  await jeu.entrer(page, GENS.lea.nom);
  await ecrire("entete", "#convFpHead");
  for (const [n, id] of [["texte-recu", "m_lea_01"], ["texte-envoye", "m_lea_02"], ["vocal-recu", "m_lea_10"], ["doc-recu", "m_lea_12"], ["dernier", "m_lea_22"]]) await ecrire(n, '.conv-bubble-wrap[data-mid="' + id + '"]');
  await ecrire("separateur", "#convFpThread > div:not(.conv-bubble-wrap)");
  await ecrire("barre", "#conv-fullpage .conv-toolbar");
  out.classes = await page.evaluate(() => ({ html: document.documentElement.className, body: document.body.className, fp: document.getElementById("conv-fullpage").className, fil: document.getElementById("convFpThread").className }));
  return out;
};
module.exports.demarrage = { mode: "compte", peupler: (srv, ctx) => { base.peupler(srv, ctx); jeu.peupler(srv, ctx); } };
