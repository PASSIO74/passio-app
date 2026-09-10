#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// MIGRATION DE DELTA — seulement ce que la production n'a pas encore
// ──────────────────────────────────────────────────────────────────────────
// `migration_passions_plat.sql` est le miroir COMPLET du référentiel : à 2 000
// passions il pèse 539 Ko, à 5 000 il en pèsera ~1,3 Mo. Or l'écriture en base
// passe par le canal ③ d'ADR-012 — psql ou l'éditeur SQL — c'est-à-dire, en
// pratique, un copier-coller. Un fichier de 1,3 Mo n'est pas collable.
//
// Ce script émet donc UNIQUEMENT les passions absentes d'une liste d'ids déjà
// présents en production, plus les relations qui les concernent.
//
// ⚠️ IL NE REMPLACE PAS LE MIROIR COMPLET, il le complète. Le miroir reste la
//    référence rejouable de zéro ; le delta est le geste du jour.
// ⚠️ IL EST ADDITIF ET IDEMPOTENT comme le miroir : même `on conflict do
//    update`, même protection de `status = 'archived'` et de `source =
//    'legacy'` — rejouer un delta ne peut rien détruire.
// ⚠️ LES IDS DE PRODUCTION SONT UNE ENTRÉE, JAMAIS UNE DEVINETTE. On les lit
//    (canal ① d'ADR-012, lecture seule) et on les passe ici. Générer un delta
//    contre une liste supposée produirait un fichier qui OUBLIE des passions,
//    silencieusement — le défaut de famille de ce dépôt.
//
// ⚠️ UN DELTA QUI NE REGARDE QUE LES IDS RATE TOUTES LES MODIFICATIONS, et le
//    lot du 2026-09-10 l'a prouvé : il n'ajoutait AUCUNE passion, il posait des
//    alias sur 871 lignes existantes. En mode `--ids`, le générateur rendait
//    donc « rien à écrire » — un fichier vide, parfaitement satisfait de
//    lui-même, pendant que la recherche SERVEUR (`rechercher_passions` lit la
//    colonne `aliases`) serait restée sur l'ancien état. Le mode `--etat` compare
//    une EMPREINTE par ligne et rattrape les modifications.
//
//   usage : node scripts/generer-delta-passions.js --ids fichier.txt [--sortie x.sql]
//           (fichier.txt : les ids déjà en base, séparés par virgules ou retours)
//           node scripts/generer-delta-passions.js --etat fichier.tsv [--sortie x.sql]
//           (fichier.tsv : « id<TAB>empreinte » par ligne, tel que rendu par la
//            requête SQL affichée quand le fichier manque — canal ① lecture seule)
// ══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { charger } = require("./referentiel-passions.js");

function arg(nom, defaut) {
  const i = process.argv.indexOf(nom);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
}

const fichierIds = arg("--ids", null);
const fichierEtat = arg("--etat", null);
if (!fichierIds && !fichierEtat) {
  console.error("⛔ --ids <fichier> ou --etat <fichier> est obligatoire.");
  console.error("");
  console.error("   --ids  : les ids DÉJÀ en production (n'émet que les passions NOUVELLES).");
  console.error("            select string_agg(id, ',' order by id) from public.passions;");
  console.error("");
  console.error("   --etat : « id<TAB>empreinte » par ligne (émet AUSSI les lignes MODIFIÉES).");
  console.error("            select id || chr(9) || md5(");
  console.error("              label || '|' || normalized_label || '|' ||");
  console.error("              array_to_string(aliases, ',') || '|' || is_broad::text || '|' ||");
  console.error("              popularity::text || '|' || sort_order::text || '|' || emoji || '|' || color");
  console.error("            ) from public.passions order by id;");
  process.exit(1);
}

const { passions, relations } = charger();

// L'empreinte couvre EXACTEMENT les colonnes que la migration écrit, et dans le
// même ordre : une colonne oubliée ici, c'est une modification qui ne partirait
// jamais — le défaut que le mode `--etat` existe pour fermer.
function empreinte(p) {
  return crypto.createHash("md5").update([
    p.label, p.normalized_label, (p.aliases || []).join(","),
    p.is_broad ? "true" : "false", String(p.popularity), String(p.sort_order),
    p.emoji, p.color,
  ].join("|")).digest("hex");
}

let connus, nouvelles, motif;
if (fichierEtat) {
  const etat = new Map();
  fs.readFileSync(fichierEtat, "utf8").split(/\r?\n/).forEach(function (ligne) {
    const [id, emp] = ligne.split(/\t/);
    if (id && emp) etat.set(id.trim(), emp.trim());
  });
  connus = new Set(etat.keys());
  nouvelles = passions.filter(p => etat.get(p.id) !== empreinte(p));
  motif = "nouvelles ou modifiées";
} else {
  connus = new Set(
    fs.readFileSync(fichierIds, "utf8").split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
  );
  nouvelles = passions.filter(p => !connus.has(p.id));
  motif = "nouvelles";
}

if (!nouvelles.length) {
  console.log("Rien à écrire : la production est déjà à jour sur les " + passions.length + " passions.");
  process.exit(0);
}

// ⚠️ LES RELATIONS NE SUIVENT QUE LES PASSIONS VRAIMENT NOUVELLES, jamais les
// MODIFIÉES. Une passion dont on change les alias garde exactement les mêmes
// liens : les émettre quand même produisait 1 984 lignes de `passion_relations`
// parfaitement inutiles pour un lot qui n'en changeait aucune — 200 Ko de SQL
// à coller pour rien, et un fichier dont on ne peut plus relire ce qu'il fait.
const idsNouveaux = new Set(nouvelles.filter(p => !connus.has(p.id)).map(p => p.id));
// Une relation part dans le delta dès qu'UNE de ses deux extrémités est neuve :
// rattacher une passion nouvelle à une racine ancienne (`broader` repointé sur
// `interiorite-philosophie`) crée un lien dont la SOURCE seule est nouvelle,
// et l'inverse `narrower` dont seule la CIBLE l'est. N'en garder qu'un des
// deux sens laisserait la suggestion boiteuse dans une direction.
const relaNeuves = relations.filter(
  r => idsNouveaux.has(r.source_passion_id) || idsNouveaux.has(r.target_passion_id)
);
// …mais jamais une relation dont une extrémité n'existe NULLE PART : la clé
// étrangère la refuserait et ferait échouer toute la transaction.
const toutesLesIds = new Set(passions.map(p => p.id));
const relaSures = relaNeuves.filter(
  r => (connus.has(r.source_passion_id) || toutesLesIds.has(r.source_passion_id)) &&
       (connus.has(r.target_passion_id) || toutesLesIds.has(r.target_passion_id))
);

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const tabAlias = a => (a && a.length ? "ARRAY[" + a.map(q).join(",") + "]::text[]" : "'{}'::text[]");
const PAQUET = 200;

const date = new Date().toISOString().slice(0, 10);
const sortie = arg("--sortie", path.join("migrations", "delta_passions_" + date + ".sql"));

let out = "";
out += "-- ═══════════════════════════════════════════════════════════════════════════\n";
out += "-- DELTA DU RÉFÉRENTIEL DES PASSIONS — " + date + "\n";
out += "--\n";
out += "--   " + nouvelles.length + " passions " + motif + " · " + relaSures.length + " relations\n";
out += "--   (la production en connaissait " + connus.size + " ; le référentiel en compte " + passions.length + ")\n";
out += "--\n";
out += "-- ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.\n";
out += "--    Générateur : node scripts/generer-delta-passions.js --ids <ids-prod.txt>\n";
out += "--\n";
out += "-- ⚠️ CE DELTA NE CRÉE AUCUNE TABLE, AUCUNE POLICY, AUCUNE FONCTION. Il suppose\n";
out += "--    `migration_passions_plat.sql` DÉJÀ appliquée (elle l'est depuis le\n";
out += "--    2026-09-01). S'il devait servir sur une base neuve, appliquer le miroir\n";
out += "--    complet d'abord.\n";
out += "--\n";
out += "-- ⚠️ ADDITIF ET IDEMPOTENT : aucun DROP, aucun DELETE. Une passion ARCHIVÉE\n";
out += "--    par la modération le RESTE (le `case` sur status), et les identifiants\n";
out += "--    historiques gardent `source = 'legacy'`.\n";
out += "--\n";
out += "-- ⚠️ UNE SEULE TRANSACTION : une erreur au milieu n'applique rien du tout.\n";
out += "-- ═══════════════════════════════════════════════════════════════════════════\n\n";
out += "begin;\n\n";

const CONFLIT =
  "on conflict (id) do update set\n" +
  "  label = excluded.label,\n" +
  "  normalized_label = excluded.normalized_label,\n" +
  "  aliases = excluded.aliases,\n" +
  "  status = case when public.passions.status = 'archived' then public.passions.status else excluded.status end,\n" +
  "  source = case when public.passions.source = 'legacy' then 'legacy' else excluded.source end,\n" +
  "  is_broad = excluded.is_broad,\n" +
  "  popularity = excluded.popularity,\n" +
  "  sort_order = excluded.sort_order,\n" +
  "  emoji = excluded.emoji,\n" +
  "  color = excluded.color,\n" +
  "  updated_at = now();\n\n";

for (let i = 0; i < nouvelles.length; i += PAQUET) {
  const lot = nouvelles.slice(i, i + PAQUET);
  out += "insert into public.passions\n";
  out += "  (id, label, normalized_label, aliases, status, source, is_broad, popularity, sort_order, emoji, color)\n";
  out += "values\n";
  out += lot.map(p => "  (" + [
    q(p.id), q(p.label), q(p.normalized_label), tabAlias(p.aliases),
    "'active'", q(p.source || "curated"), p.is_broad ? "true" : "false",
    p.popularity, p.sort_order, q(p.emoji), q(p.color),
  ].join(", ") + ")").join(",\n") + "\n";
  out += CONFLIT;
}

for (let i = 0; i < relaSures.length; i += PAQUET) {
  const lot = relaSures.slice(i, i + PAQUET);
  out += "insert into public.passion_relations (source_passion_id, target_passion_id, relation_type, weight)\n";
  out += "values\n";
  out += lot.map(r => "  (" + [
    q(r.source_passion_id), q(r.target_passion_id), q(r.relation_type), r.weight,
  ].join(", ") + ")").join(",\n") + "\n";
  out += "on conflict (source_passion_id, target_passion_id, relation_type) do nothing;\n\n";
}

// ⚠️ LE VERDICT DOIT PROUVER CE QUE CE DELTA-LÀ FAIT, pas seulement que la table
// existe. Compter les passions actives ne dit RIEN d'un delta de MODIFICATION :
// le total ne bouge pas d'une ligne quand on change 959 jeux d'alias, donc le
// verdict aurait affiché « OK » sur une base où rien n'aurait été écrit. On
// recompte donc, ligne à ligne, l'empreinte ATTENDUE contre celle réellement en
// base — la même formule que celle qui a servi à choisir ces lignes.
out += "-- ── Verdict ────────────────────────────────────────────────────────────────\n";
out += "-- Recompte l'empreinte de chaque ligne écrite et la compare à l'attendu.\n";
out += "with attendu(id, emp) as (values\n";
out += nouvelles.map(p => "  (" + q(p.id) + ", " + q(empreinte(p)) + ")").join(",\n") + "\n";
out += "),\n";
out += "reel as (\n";
out += "  select p.id, md5(\n";
out += "    p.label || '|' || p.normalized_label || '|' ||\n";
out += "    array_to_string(p.aliases, ',') || '|' || p.is_broad::text || '|' ||\n";
out += "    p.popularity::text || '|' || p.sort_order::text || '|' || p.emoji || '|' || p.color\n";
out += "  ) as emp\n";
out += "  from public.passions p\n";
out += ")\n";
out += "select\n";
out += "  count(*) as lignes_attendues,\n";
out += "  count(*) filter (where r.emp is distinct from a.emp) as lignes_non_conformes,\n";
out += "  (select count(*) from public.passions where status = 'active') as passions_actives,\n";
out += "  case when count(*) filter (where r.emp is distinct from a.emp) = 0\n";
out += "       then 'OK' else 'ECHEC' end as verdict\n";
out += "  from attendu a left join reel r using (id);\n\n";
out += "commit;\n";

fs.writeFileSync(sortie, out, "utf8");
console.log("Delta écrit : " + sortie);
console.log("  " + nouvelles.length + " passions · " + relaSures.length + " relations · " +
            (Buffer.byteLength(out) / 1024).toFixed(1) + " Ko");
