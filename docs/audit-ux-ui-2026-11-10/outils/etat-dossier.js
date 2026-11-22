#!/usr/bin/env node
// État d'avancement du dossier d'audit, domaine par domaine (lecture seule).
//   node docs/audit-ux-ui-2026-11-10/outils/etat-dossier.js
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const AUDIT = path.resolve(__dirname, "..");
const ls = (rel) => { try { return fs.readdirSync(path.join(AUDIT, rel)); } catch (e) { return []; } };
const DOMAINES = ["entree", "fil", "recherche", "profils", "creation", "bobines", "irl-decouvrir", "irl-fiche", "msg-liste", "msg-conversation", "partage", "transverse", "socle", "parcours"];

console.log("Date : " + new Date().toLocaleString("fr-FR") + " — mémoire libre : " + (os.freemem() / 2 ** 30).toFixed(2) + " Go");
console.log("domaine".padEnd(18) + "mission scénario jeu sondes  fiches avant après  registre constats rapport");
for (const d of DOMAINES) {
  const fiches = ls("donnees/captures/" + d).filter((f) => f.endsWith(".json"));
  const imgs = ls("captures/" + d);
  let reg = "-", cons = "-";
  try { const j = JSON.parse(fs.readFileSync(path.join(AUDIT, "donnees", "domaines", d + ".json"), "utf8")); reg = (j.registre || []).length; cons = (j.constats || []).length; } catch (e) { if (fs.existsSync(path.join(AUDIT, "donnees", "domaines", d + ".json"))) reg = cons = "JSON invalide"; }
  let rapport = "-";
  try { rapport = Math.round(fs.statSync(path.join(AUDIT, "rapports", d + ".md")).size / 1024) + " Ko"; } catch (e) {}
  const oui = (rel) => (fs.existsSync(path.join(AUDIT, rel)) ? "oui" : " - ");
  console.log(d.padEnd(18) + oui("outils/missions/" + d + ".md").padEnd(8) + oui("outils/scenarios/" + d + ".js").padEnd(9) + oui("outils/jeu/" + d + ".js").padEnd(4)
    + String(ls("outils/sondes").filter((f) => f.startsWith(d + "-")).length).padStart(5) + String(fiches.length).padStart(8)
    + String(imgs.filter((f) => /--avant\.webp$/.test(f)).length).padStart(6) + String(imgs.filter((f) => /--apres\.webp$/.test(f)).length).padStart(6)
    + String(reg).padStart(10) + String(cons).padStart(9) + String(rapport).padStart(8));
}
const echecs = ls("donnees/echecs");
if (echecs.length) console.log("Écrans d'échec enregistrés : " + echecs.join(", "));
const protos = ls("prototypes").filter((f) => f.endsWith(".html"));
console.log("Prototypes : " + (protos.join(", ") || "aucun") + " — fiches : " + ls("donnees/prototypes").length);
