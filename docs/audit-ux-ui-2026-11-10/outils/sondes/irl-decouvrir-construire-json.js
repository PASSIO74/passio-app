// Construit donnees/domaines/irl-decouvrir.json à partir de tables lisibles (registre + constats).
// node docs/audit-ux-ui-2026-11-10/outils/sondes/irl-decouvrir-construire-json.js
"use strict";
const fs = require("fs");
const path = require("path");
const AUDIT = path.resolve(__dirname, "..", "..");
const D = require("./irl-decouvrir-contenu.js");
const out = path.join(AUDIT, "donnees", "domaines", "irl-decouvrir.json");
const capt = path.join(AUDIT, "donnees", "captures", "irl-decouvrir");
// Contrôles : identifiants croisés, captures présentes.
const ids = new Set(D.registre.map((r) => r.id));
const cids = new Set(D.constats.map((c) => c.id));
const pb = [];
for (const r of D.registre) {
  for (const p of r.problemes) if (!cids.has(p)) pb.push(r.id + " → constat inconnu " + p);
  if (r.visuel !== "aucun" && !fs.existsSync(path.join(capt, r.id + "--m390.json"))) pb.push(r.id + " : pas de fiche m390");
  if (r.visuel === "avant-apres") { const f = JSON.parse(fs.readFileSync(path.join(capt, r.id + "--m390.json"), "utf8")); if (!f.apres) pb.push(r.id + " : pas d'après"); }
}
for (const c of D.constats) {
  for (const s of c.surfaces) if (!ids.has(s)) pb.push(c.id + " → surface inconnue " + s);
  for (const v of c.visuels) if (!fs.existsSync(path.join(capt, v + "--m390.json"))) pb.push(c.id + " → visuel absent " + v);
}
fs.writeFileSync(out, JSON.stringify(D.json(), null, 2) + "\n");
JSON.parse(fs.readFileSync(out, "utf8"));
const n = (f) => D.registre.filter(f).length;
console.log("écrit", out);
console.log({ inventoriees: D.registre.length, observe: n((r) => r.observation === "observe"), simule: n((r) => r.observation === "simule"), code: n((r) => r.observation === "code"), inaccessible: n((r) => r.observation === "inaccessible"),
  avantApres: n((r) => r.visuel === "avant-apres"), aConserver: n((r) => r.verdict === "a-conserver"),
  P: ["P0", "P1", "P2", "P3"].map((p) => p + ":" + D.constats.filter((c) => c.priorite === p).length).join(" ") });
if (pb.length) { console.log("PROBLÈMES :\n" + pb.join("\n")); process.exitCode = 1; }
