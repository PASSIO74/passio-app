// Résume les mesures automatiques des fiches de capture du domaine (lecture seule).
"use strict";
const fs = require("fs"), path = require("path");
const dir = path.resolve(__dirname, "..", "..", "donnees", "captures", "irl-decouvrir");
const j = require(path.resolve(__dirname, "..", "..", "donnees", "domaines", "parcours.json"));
const c = j.constats.find((x) => x.id === "PCS-C06");
console.log("PCS-C06 :", c && c.titre, "|", c && c.proposition);
for (const f of fs.readdirSync(dir).filter((x) => /--m390\.json$/.test(x)).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); const m = d.mesures || {};
  const s = ((m.cibles && m.cibles.sous44) || []).filter((x) => !x.enLigne).slice(0, 5).map((x) => (x.texte || x.nom || x.sel || "?").toString().slice(0, 24) + " " + Math.round(x.largeur || x.w || 0) + "x" + Math.round(x.hauteur || x.h || 0));
  const k = ((m.contraste && m.contraste.sousSeuil) || []).slice(0, 3).map((x) => (x.texte || "").slice(0, 24) + " " + x.ratio);
  console.log(f.replace("--m390.json", ""), "| <44:", s.join(" ; "), "| contraste:", k.join(" ; "), "| js:", d.erreurs.js.length, "| sansNom:", (m.sansNom || []).length);
}
