#!/usr/bin/env node
"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// GATE DES RÉSIDUS — « un résidu devenu traitable doit être réexaminé, et ça
// doit se voir » (cinquième contre-revue Astra, mandat §9, 2026-09-15).
//
// Lit `.passio/residus/registre-residus.json`, l'évalue contre le dépôt
// (scripts/lib/registre-residus.js) et imprime chaque résidu avec sa condition
// de réexamen. Rouge (code 1) si :
//   · le registre est invalide (champ manquant, état hors liste, dépendance
//     vers un résidu inconnu…) ;
//   · un résidu dont la condition est satisfaite est encore « en_attente » —
//     par exemple la table dont il dépend vient d'être déclarée par une PR ;
//   · un résidu est « fermé » sans ses quatre états à « oui ».
// `--json` rend l'évaluation complète (le pilotage la lit) ; `--ci` ne change
// rien au verdict, il rappelle que l'échec est voulu en CI.
// Aucun réseau, aucune base : ce que le dépôt montre, rien de plus — et un
// objet « déclaré » n'est pas un objet « en service ».
// ═══════════════════════════════════════════════════════════════════════════
const path = require("node:path");
const R = require("./lib/registre-residus.js");

const args = process.argv.slice(2);
const json = args.includes("--json");
const racine = path.resolve(__dirname, "..");
const iDate = args.indexOf("--aujourdhui");
const aujourdhui = iDate >= 0 ? args[iDate + 1] : undefined;

let registre;
try {
  registre = R.lireRegistreDepot(racine);
} catch (e) {
  if (json) { console.log(JSON.stringify({ ok: false, erreurs: e.erreurs || [e.message] }, null, 2)); process.exit(1); }
  console.error("❌ registre des résidus invalide (" + R.CHEMIN_REGISTRE + ") :");
  for (const l of e.erreurs || [e.message]) console.error("   · " + l);
  process.exit(1);
}

const bilan = R.evaluer(registre, R.sondeDepot(racine, { aujourdhui }));
const ok = bilan.ecarts.length === 0;

if (json) {
  console.log(JSON.stringify(Object.assign({ ok }, bilan), null, 2));
  process.exit(ok ? 0 : 1);
}

console.log(`Registre des résidus (${R.CHEMIN_REGISTRE}, mis à jour le ${bilan.mis_a_jour_le}, évalué au ${bilan.aujourdhui})`);
console.log(`  ${bilan.total} résidus, ${bilan.ouverts} ouverts, ${bilan.traitables.length} traitables, ${bilan.non_mesurables.length} à condition manuelle`);
for (const l of bilan.lignes) {
  const cond = l.condition.satisfaite === true ? "✔ condition satisfaite" : l.condition.satisfaite === false ? "· condition non satisfaite" : "? condition manuelle";
  const etats = R.CLES_ETATS.map((k) => `${k}=${l.etats[k]}`).join(" ");
  console.log(`  ${l.ecarts.length ? "❌" : l.traitable && l.statut !== "ferme" ? "🟠" : "  "} ${l.id} [${l.gravite}] ${l.titre}`);
  console.log(`       statut ${l.statut} — ${cond} : ${l.condition.detail}`);
  console.log(`       ${etats}`);
  for (const e of l.ecarts) console.log(`       ⚠ ${e}`);
}
if (!ok) {
  console.error(`\n❌ ${bilan.ecarts.length} écart(s) entre le registre et le dépôt — mettre le registre à jour (réexamen explicite), pas le contrôle.`);
  process.exit(1);
}
console.log(`\n✅ registre cohérent : aucun résidu traitable oublié, aucune fermeture sans mesure de la cible.`);
