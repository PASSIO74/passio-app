#!/usr/bin/env node
"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// AUCUNE TABLE NE NAÎT SANS QU'ON DISE CE QU'ELLE DEVIENT — ASTRA-27
//
// LE DÉFAUT QUI MOTIVE CETTE GATE. `public.call_invites` est née le 15/09 avec
// MSG-01. Ses colonnes `from_id` et `to_id` sont du `text` SANS clé étrangère :
// rien, côté base, ne l'emportait avec le compte. Elle n'est entrée ni dans
// `TABLES_COMPTE` (purge) ni dans l'export qui en dérive — et **personne ne
// pouvait le voir** : aucune gate ne comparait les tables du dépôt à la liste.
// Le mode d'échec est le pire qui soit : « supprimer mon compte » répondait
// `ok`, et les données restaient.
//
// CE QUE FAIT CETTE GATE. Elle lit les `create table public.<nom>` de
// `migrations/` et de `migrations/SCHEMA_PROD_REFERENCE.sql`, repère celles qui
// portent une colonne d'identité de compte, et EXIGE que chaque couple
// (table, colonne) soit soit dans `TABLES_COMPTE`, soit dans la liste
// d'exceptions ci-dessous — **avec sa raison écrite**.
//
// ⚠️ UNE EXCEPTION SE DIT, ELLE NE SE DEVINE PAS. Un couple absent des deux
// listes fait ROUGIR la gate en nommant le fichier où la table est créée. On
// ne se tait jamais « par défaut » : le défaut, c'est de demander une décision.
//
// ⚠️ CETTE GATE LIT LE DÉPÔT, PAS LA BASE. Une table créée à la main dans
// l'éditeur SQL lui échappe — comme elle échappe au journal des migrations
// (ASTRA-33 §3). C'est une limite, elle est écrite ici, et elle ne s'efface pas
// en la taisant : le contrôle qui la couvrirait est une comparaison à l'état
// mesuré, qui demande un accès en lecture à la production.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("node:fs");
const path = require("node:path");

const RACINE = path.join(__dirname, "..");

// Les noms de colonne qui désignent un compte PASSIO. Volontairement larges :
// mieux vaut une question de trop qu'une table oubliée.
const COLONNES_COMPTE = /^(user_id|author_id|from_id|to_id|owner_id|uid|auth_uid|follower_id|following_id|blocker_id|blocked_id|added_by|reporter_id|created_by|organizer_id|handled_by|target_user_id)$/;

// ⚠️ CHAQUE EXCEPTION PORTE SA RAISON. Elles reprennent, mot pour mot, les
// décisions déjà écrites dans `purge-compte.js` — les répéter ici serait les
// faire diverger, alors elles y RENVOIENT.
const EXCEPTIONS = {
  "reports.reporter_id": "trace de modération d'un tiers : ne disparaît pas avec le signaleur (purge-compte.js) — à confirmer côté juridique",
  "reports.target_id": "idem : la cible d'un signalement traité reste dans la trace",
  "reports.handled_by": "identité de l'opérateur de modération, pas une donnée du compte visé",
  "passions.created_by": "objet PARTAGÉ qui survit à son créateur : l'identifiant y est orphelin, pas une donnée lisible",
  "conversations.created_by": "idem",
  "events.organizer_id": "idem",
  "moderation_actions.target_id": "journal de modération : sa raison d'être est de survivre à la décision",
  "migrations_appliquees.cible": "n'est pas un compte (référence de projet)",
  // ASTRA-25 : la barrière elle-même. La purger serait la LEVER — or elle doit
  // survivre à la purge réussie (un jeton déjà émis reste signé valide). Elle
  // n'est effacée que si la purge échoue (`leverBarriere`, purge-compte.js).
  // Ce qui reste est un uuid orphelin sans échéance : rétention À DÉCIDER,
  // écrite dans migration_barriere_suppression_2026-09-15.sql.
  "comptes_en_suppression.user_id": "barrière de suppression : la purger la lèverait (purge-compte.js) — elle doit survivre au succès ; rétention de l'uuid orphelin à décider",
  "reports.target_id": "polymorphe (publication, rencontre, compte…) : ce n'est pas un identifiant de compte en soi",
};

function fichiersSql() {
  const d = path.join(RACINE, "migrations");
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith(".sql")).map((f) => path.join(d, f));
}

// ⚠️ LE RÉFÉRENTIEL DE PROD N'EST PAS DU DDL — ET C'EST LÀ QUE VIVENT LES TABLES
// LES PLUS ANCIENNES. `migrations/SCHEMA_PROD_REFERENCE.sql` ne contient AUCUN
// `create table` : c'est une DESCRIPTION en commentaires (« -- <table> » puis
// « --   <colonne>  <type> »). Sans ce lecteur, la gate ne voyait que les tables
// nées d'une migration du dépôt — donc elle aurait laissé passer `reports`,
// `passions`, `moderation_actions`… Un contrôle qui ne voit qu'une partie du
// schéma donne un vert qui vaut pour cette partie, et pour elle seule.
function tablesDuReferentiel(fichier) {
  if (!fs.existsSync(fichier)) return [];
  const out = [];
  let table = null, colonnes = [];
  const pousser = () => { if (table && colonnes.length) out.push({ table, colonnes: [...new Set(colonnes)], fichier: path.basename(fichier) }); };
  for (const ligne of fs.readFileSync(fichier, "utf8").split("\n")) {
    const entete = /^--\s([a-z_][a-z0-9_]*)\s*$/.exec(ligne);
    if (entete) { pousser(); table = entete[1]; colonnes = []; continue; }
    const col = /^--\s{2,}([a-z_][a-z0-9_]*)\s{2,}/.exec(ligne);
    if (col && table && COLONNES_COMPTE.test(col[1])) colonnes.push(col[1]);
    else if (!col && !/^--/.test(ligne) && ligne.trim()) { pousser(); table = null; colonnes = []; }
  }
  pousser();
  return out;
}

// Repère `create table [if not exists] public.<nom> ( … )` et rend ses colonnes.
function tablesDeclarees(sql, fichier) {
  const out = [];
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const nom = m[1];
    // Corps de la déclaration : on avance jusqu'à la parenthèse fermante.
    let i = m.index + m[0].length, profondeur = 1;
    for (; i < sql.length && profondeur > 0; i++) {
      if (sql[i] === "(") profondeur++;
      else if (sql[i] === ")") profondeur--;
    }
    const corps = sql.slice(m.index + m[0].length, i - 1);
    const colonnes = corps.split(",").map((l) => (l.trim().split(/\s+/)[0] || "").replace(/"/g, "").toLowerCase())
      .filter((c) => COLONNES_COMPTE.test(c));
    if (colonnes.length) out.push({ table: nom, colonnes: [...new Set(colonnes)], fichier: path.basename(fichier) });
  }
  return out;
}

function lireTablesCompte() {
  const f = path.join(RACINE, "supabase", "functions", "_shared", "purge-compte.js");
  const src = fs.readFileSync(f, "utf8");
  const bloc = src.slice(src.indexOf("export const TABLES_COMPTE"), src.indexOf("];", src.indexOf("export const TABLES_COMPTE")));
  const paires = new Set();
  const re = /\[\s*"([a-z_]+)"\s*,\s*"([a-z_]+)"\s*\]/g;
  let m;
  while ((m = re.exec(bloc))) paires.add(m[1] + "." + m[2]);
  return paires;
}

function auditer() {
  const connues = lireTablesCompte();
  const vues = new Map();
  const declarees = [];
  for (const f of fichiersSql()) declarees.push(...tablesDeclarees(fs.readFileSync(f, "utf8"), f));
  declarees.push(...tablesDuReferentiel(path.join(RACINE, "migrations", "SCHEMA_PROD_REFERENCE.sql")));
  for (const t of declarees) {
    for (const c of t.colonnes) {
      const cle = t.table + "." + c;
      if (!vues.has(cle)) vues.set(cle, t.fichier);
    }
  }
  const oublis = [];
  for (const [cle, fichier] of vues) {
    if (connues.has(cle)) continue;
    if (EXCEPTIONS[cle]) continue;
    oublis.push({ cle, fichier });
  }
  // ⚠️ UNE EXCEPTION QUE LA GATE NE VOIT PAS N'EST PAS UNE EXCEPTION MORTE :
  // c'est la LIMITE de la gate qui se montre. Elle ne lit que le dépôt — les
  // `create table` des migrations et le référentiel décrit. Une table créée à
  // la main dans l'éditeur SQL, ou antérieure à ces fichiers, lui échappe. On
  // le dit à chaque exécution plutôt que de laisser croire à un vert total.
  const horsVue = Object.keys(EXCEPTIONS).filter((c) => !vues.has(c) && !connues.has(c));
  return { connues, vues, oublis, horsVue };
}

module.exports = { auditer, tablesDeclarees, tablesDuReferentiel, EXCEPTIONS, COLONNES_COMPTE };

if (require.main === module) {
  const { vues, oublis, horsVue } = auditer();
  console.log(`audit des tables de compte : ${vues.size} couple(s) (table, colonne) déclaré(s) dans migrations/`);
  for (const { cle, fichier } of oublis) {
    console.error(`❌ ${cle} n'est NI dans TABLES_COMPTE NI dans les exceptions (déclarée dans ${fichier}).`);
    console.error(`   Décider : la purger et l'exporter (l'ajouter à TABLES_COMPTE), ou écrire pourquoi elle survit (EXCEPTIONS de scripts/audit-tables-compte.js).`);
  }
  if (horsVue.length) {
    console.log(`ℹ ${horsVue.length} exception(s) portent sur des couples que cette gate NE VOIT PAS (table antérieure aux migrations, ou créée à la main) :`);
    for (const c of horsVue) console.log(`    ${c}`);
    console.log("  Ce n'est pas un vert de plus : c'est la portée de la gate, qui lit le dépôt et non la base.");
  }
  if (oublis.length) process.exit(1);
  console.log(`✅ les ${vues.size} couples VISIBLES DEPUIS LE DÉPÔT sont purgés, exportés, ou dispensés avec leur raison.`);
}
