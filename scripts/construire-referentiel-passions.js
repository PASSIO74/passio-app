#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// CONSTRUCTION DU RÉFÉRENTIEL — deux sorties, une seule source
// ──────────────────────────────────────────────────────────────────────────
//   data/passions-v1.json                       → chargé À LA DEMANDE par le
//                                                 navigateur (jamais dans le
//                                                 bundle principal)
//   migrations/migration_passions_plat.sql      → le MIROIR serveur, additif
//                                                 et idempotent
//
// ⚠️ LES 1 900 PASSIONS NE DOIVENT JAMAIS ENTRER DANS `app.js`. `scripts/build.js`
// inline TOUT `<script src="js/…">` : un fichier JS de référentiel finirait
// donc dans le monolithe, sur le chemin critique du démarrage, pour une donnée
// dont 99 % des sessions n'ont pas besoin. D'où un JSON, chargé au premier
// usage réel de la recherche — et copié dans `dist/` par `scripts/build.js`.
//
// ⚠️ LE JSON EST VOLONTAIREMENT COMPACT (tableaux positionnels, pas d'objets
// nommés) : le même contenu en objets `{id: …, label: …}` pèse près du triple,
// et ce fichier est téléchargé sur un réseau mobile.
//
// ⚠️ LA MIGRATION EST UN MIROIR, PAS UNE SOURCE. Ne jamais l'éditer à la main :
// `npm run passions:construire` la régénère, et `npm run passions:verifier`
// échoue si les deux ont divergé.
// ══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { charger, CANONIQUES } = require("./referentiel-passions.js");

const RACINE = path.join(__dirname, "..");
const SORTIE_JSON = path.join(RACINE, "data", "passions-v1.json");
const SORTIE_SQL = path.join(RACINE, "migrations", "migration_passions_plat.sql");

// `--verifier` : ne rien écrire, seulement comparer aux fichiers versionnés.
// ⚠️ C'est ce mode que la CI lance. Sans lui, une modification de
// `data/passions/*.js` sans régénération laisserait le JSON du navigateur et la
// migration SQL décrire un référentiel qui n'existe plus — et personne ne le
// verrait avant la production.
const VERIFIER = process.argv.indexOf("--verifier") >= 0;

const ref = charger();
const { passions, relations } = ref;

// ── 1. Le JSON du navigateur ───────────────────────────────────────────────
// Format positionnel : [ id, label, emoji, color, aliases[], broader|null,
//                        popularity, is_broad(0|1) ]
const lignes = passions.map(p => [
  p.id, p.label, p.emoji, p.color, p.aliases, p.broader, p.popularity, p.is_broad ? 1 : 0,
]);
// Seules les relations LATÉRALES voyagent : `broader` est déjà dans chaque
// ligne, et renvoyer `narrower` reviendrait à transporter deux fois l'arbre.
const laterales = relations
  .filter(r => r.relation_type === "related" && r.source_passion_id < r.target_passion_id)
  .map(r => [r.source_passion_id, r.target_passion_id, r.weight]);

const paquet = {
  schema: 1,
  version: "v1",
  genere_par: "scripts/construire-referentiel-passions.js",
  champs: ["id", "label", "emoji", "color", "aliases", "broader", "popularity", "is_broad"],
  canoniques: CANONIQUES,
  passions: lignes,
  related: laterales,
};
const json = JSON.stringify(paquet);

// ── 2. Le miroir SQL ───────────────────────────────────────────────────────
function lit(s) { return "'" + String(s == null ? "" : s).replace(/'/g, "''") + "'"; }
function litTab(arr) {
  if (!arr || !arr.length) return "'{}'::text[]";
  return "ARRAY[" + arr.map(lit).join(",") + "]::text[]";
}

const empreinte = crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);

const gabarit = fs.readFileSync(path.join(__dirname, "gabarits", "migration_passions_plat.sql.tpl"), "utf8");

// Les lignes du référentiel, par paquets de 200 : un seul INSERT de 1 900
// lignes dépasse allègrement ce que l'éditeur SQL de Supabase avale d'un coup.
const PAQUET = 200;
let inserts = "";
for (let i = 0; i < passions.length; i += PAQUET) {
  const bloc = passions.slice(i, i + PAQUET).map(function (p) {
    return "  (" + [
      lit(p.id), lit(p.label), lit(p.normalized_label), litTab(p.aliases),
      "'active'", lit(CANONIQUES.indexOf(p.id) >= 0 ? "legacy" : "curated"),
      p.is_broad ? "true" : "false", String(p.popularity), String(p.sort_order),
      lit(p.emoji), lit(p.color),
    ].join(", ") + ")";
  }).join(",\n");
  inserts += "insert into public.passions\n"
    + "  (id, label, normalized_label, aliases, status, source, is_broad, popularity, sort_order, emoji, color)\n"
    + "values\n" + bloc + "\n"
    + "on conflict (id) do update set\n"
    + "  label = excluded.label,\n"
    + "  normalized_label = excluded.normalized_label,\n"
    + "  aliases = excluded.aliases,\n"
    + "  status = case when public.passions.status = 'archived' then public.passions.status else excluded.status end,\n"
    + "  source = case when public.passions.source = 'legacy' then 'legacy' else excluded.source end,\n"
    + "  is_broad = excluded.is_broad,\n"
    + "  popularity = excluded.popularity,\n"
    + "  sort_order = excluded.sort_order,\n"
    + "  emoji = excluded.emoji,\n"
    + "  color = excluded.color,\n"
    + "  updated_at = now();\n\n";
}

let rels = "";
for (let i = 0; i < relations.length; i += PAQUET * 2) {
  const bloc = relations.slice(i, i + PAQUET * 2).map(function (r) {
    return "  (" + [lit(r.source_passion_id), lit(r.target_passion_id), lit(r.relation_type), String(r.weight)].join(", ") + ")";
  }).join(",\n");
  rels += "insert into public.passion_relations (source_passion_id, target_passion_id, relation_type, weight)\n"
    + "values\n" + bloc + "\n"
    + "on conflict (source_passion_id, target_passion_id, relation_type) do update set weight = excluded.weight;\n\n";
}

const sql = gabarit
  .replace(/%%EMPREINTE%%/g, empreinte)
  .replace(/%%NB_PASSIONS%%/g, String(passions.length))
  .replace(/%%NB_ALIAS%%/g, String(passions.reduce((a, p) => a + p.aliases.length, 0)))
  .replace(/%%NB_RELATIONS%%/g, String(relations.length))
  .replace("%%INSERTS_PASSIONS%%", inserts.trimEnd())
  .replace("%%INSERTS_RELATIONS%%", rels.trimEnd());

if (VERIFIER) {
  const ecarts = [];
  function compare(chemin, attendu) {
    const actuel = fs.existsSync(chemin) ? fs.readFileSync(chemin, "utf8") : null;
    if (actuel === null) ecarts.push(path.relative(RACINE, chemin) + " : ABSENT");
    else if (actuel !== attendu) ecarts.push(path.relative(RACINE, chemin) + " : DIVERGE de la source");
  }
  compare(SORTIE_JSON, json + "\n");
  compare(SORTIE_SQL, sql);
  if (ecarts.length) {
    console.error("❌ Le référentiel construit ne correspond plus aux fichiers versionnés :");
    ecarts.forEach(e => console.error("   · " + e));
    console.error("   Lancer `npm run passions:construire`, puis committer le résultat.");
    process.exit(1);
  }
  console.log("✅ data/passions-v1.json et migrations/migration_passions_plat.sql sont à jour ("
    + passions.length + " passions, empreinte " + empreinte + ").");
  process.exit(0);
}

fs.mkdirSync(path.dirname(SORTIE_JSON), { recursive: true });
fs.writeFileSync(SORTIE_JSON, json + "\n");
fs.writeFileSync(SORTIE_SQL, sql);

console.log("data/passions-v1.json            : " + passions.length + " passions, "
  + (Buffer.byteLength(json) / 1024).toFixed(1) + " Ko (non compressé)");
console.log("migrations/migration_passions_plat.sql : " + (Buffer.byteLength(sql) / 1024).toFixed(1) + " Ko");
console.log("empreinte du référentiel         : " + empreinte);
