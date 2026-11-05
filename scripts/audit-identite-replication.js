#!/usr/bin/env node
/**
 * GATE — l'identité de réplication des tables de R25 ne se perd pas en silence.
 *
 * POURQUOI ELLE EXISTE. `migrations/migration_realtime_identite_opaque_2026-11-03.sql`
 * (R25) met conv_members, notifications, conv_reads et post_likes en
 * `replica identity using index <table>_rid_key` : le temps réel ne publie
 * plus d'un DELETE que `rid`, un nombre tiré au hasard. Ces quatre index sont
 * un POINT UNIQUE DE DÉFAILLANCE : une identité USING INDEX dont l'index
 * disparaît vaut NOTHING, et PostgreSQL REFUSE alors tout UPDATE et tout
 * DELETE d'une table publiée (« does not have a replica identity and
 * publishes deletes » — mesuré au banc de R25). Supprimer la colonne `rid`
 * emporte l'index : même effet. Or l'avis « unused index » de Supabase les
 * signalera toujours (0 lecture, c'est voulu), et ce dépôt a déjà retiré des
 * index sur ce seul critère (F-05, `migration_index_realtime_2026-11-03.sql`).
 * La panne ne se verrait qu'en production, à la première suppression.
 *
 * CE QU'ELLE REFUSE (exit 1, fichier et ligne nommés) :
 *   ① JAMAIS DISPENSABLE — supprimer l'index qui porte l'identité d'une des
 *      quatre tables alors que l'identité de la table EST encore cet index :
 *      `drop index …`, `alter table <table> drop constraint …` (devenu
 *      l'index d'une contrainte, il ne se supprime plus que par elle), ou
 *      `alter table <table> drop column rid` (la colonne emporte l'index).
 *      L'index visé est `<table>_rid_key` sous le nom qu'il porte À CET
 *      INSTANT du flux (un renommage ②, plus haut dans le même flux, est
 *      suivi), ou celui qu'une instruction précédente a donné pour identité à
 *      la table. Le même fichier doit d'abord lui en rendre une, par `replica
 *      identity default`, `full` ou `using index <un autre index>`.
 *      (`nothing` n'en est pas une : la table publiée refuserait de même ses
 *      UPDATE et DELETE ; une identité CALCULÉE, ou une action calculée sur la
 *      table, non plus : rien ne prouve qu'elle a été rendue.) L'état se suit
 *      instruction par instruction :
 *      rendre l'identité APRÈS la suppression, ou la reposer sur l'index entre
 *      les deux, ne compte pas. Une table hors des quatre n'a pas d'index
 *      rid : sa colonne `rid` se supprime sans rien demander.
 *   ② DISPENSABLE PAR LE MARQUEUR —
 *      · tout `alter table … replica identity` sur une des cinq tables de R25
 *        (les quatre, plus comment_interactions, qu'elle a remise en DEFAULT :
 *        en FULL, un filtre `user_id=eq.<victime>` reconnaît chaque effacement
 *        de la victime ; et le retrait en direct, R37, lit `old.id` — une
 *        identité qui ne publierait plus `id` le rendrait muet) ;
 *      · sur toute table PUBLIÉE — `scripts/realtime-publication.json`, plus
 *        les tables que le FICHIER ajoute lui-même à `supabase_realtime`
 *        (`alter publication … add|set table`, `create publication … for
 *        table` ; `tables in schema public`, `for all tables` ou une table
 *        calculée : toutes celles de public) — `replica identity full`, le
 *        conseil courant pour « recevoir l'ancienne ligne », et `replica
 *        identity using index <idx>` : le WAL d'un DELETE porte alors les
 *        colonnes de l'index, et un filtre sur l'une d'elles reconnaît chaque
 *        effacement — l'oracle que R25 a fermé ;
 *      · toute retouche de l'index qui porte l'identité d'une des quatre
 *        tables : `alter index … <table>_rid_key` (un `rename to` surtout ;
 *        `alter table <index> rename to` aussi, PostgreSQL l'accepte), en
 *        faire l'index d'une contrainte (`add constraint … using index`, qui le
 *        RENOMME au nom de la contrainte) ou renommer cette contrainte : sous
 *        un autre nom, sa suppression dans un fichier suivant échapperait à ① ;
 *      · défaire l'une des quatre tables : `drop table`, `alter table … rename
 *        to` ou `set schema`, `alter index <table> rename to` (une table
 *        recréée sous ce nom revient en identité DEFAULT, sans rid ni garde :
 *        la fuite rouvre), `rename column rid` (la garde ne trouve plus `rid` :
 *        tout INSERT est refusé) ;
 *      · toucher à la garde `trg_rid_opaque` : `drop trigger`, `alter trigger`,
 *        `create or replace trigger trg_rid_opaque` (une clause WHEN la
 *        désarme sans la retirer), `alter table <une des quatre> disable
 *        trigger trg_rid_opaque|all|user` ou `enable replica trigger …` (elle
 *        ne tire plus), `create or replace function`, `alter function|routine`
 *        ou `drop function|routine public.rid_opaque_garde`.
 *      La migration R25 elle-même en est exemptée.
 *   ③ DISPENSABLE PAR LE MARQUEUR — ce que la gate ne sait pas lire : une de
 *      ces instructions dont la table, l'index, le déclencheur ou la fonction
 *      est CALCULÉ (`execute format('… %I …')`, concaténation) ; un `alter
 *      table` d'une des cinq tables de R25, nommée en toutes lettres, dont
 *      l'ACTION se calcule (`execute format('alter table public.post_likes
 *      %s', …)`, `'… ' || …`) ; une identité calculée sur une table publiée.
 *      La gate ne peut pas prouver qu'elle épargne les `<table>_rid_key` et la
 *      garde, donc elle le dit au lieu de se taire. Un `drop index` calculé
 *      (une purge d'index « inutilisés » en boucle) est exactement le défaut
 *      gardé.
 *
 * LE MARQUEUR — une ligne de commentaire, dans le fichier, AVEC sa raison :
 *     -- audit-identite-replication: assumé — <raison, 15 caractères au moins>
 * Il lève ② et ③ pour ce fichier, jamais ① : il n'existe pas de bonne raison
 * de supprimer l'index qui porte l'identité d'une table publiée.
 *
 * CE QU'ELLE LIT. Le SQL que le dépôt APPLIQUE : `migrations/` (récursif —
 * `parties/` comprise), `.passio/migrations/` (en attente), les `.sql` de
 * `scripts/` et de `supabase/`. Deux flux par fichier, suivis séparément :
 * le SQL exécuté (commentaires retirés), et le retour arrière écrit en
 * `--|` (convention du dépôt : « exécutable tel quel en ôtant --| »). Le
 * contenu des chaînes et des corps `$$…$$` est lu comme du SQL — c'est là que
 * vit le SQL dynamique : une phrase qui ÉCRIT une suppression d'index dans une
 * chaîne se reformule. `alter table [if exists] [only] <table> [*]` : la forme
 * descendante `*` se lit comme la table seule.
 * Le pré-filtre ne retient que les fichiers où paraît l'un des MOTS `table`,
 * `index`, `trigger`, `function`, `routine` ou `publication` — des mots seuls,
 * jamais des paires : un commentaire entre deux mots (`drop/**\/index`) est
 * retiré avant l'analyse, qui lit alors `drop index`.
 * Hors périmètre, délibérément : `tests/` (les bancs cassent l'identité pour
 * prouver le verdict), et `migrations/SCHEMA_PROD_REFERENCE.sql`, photographie
 * GÉNÉRÉE de la production (`scripts/schema-baseline.js`) qui décrit et ne
 * s'applique pas. Un retour arrière écrit en commentaire ordinaire (`-- …`)
 * n'est pas lu : l'écrire en `--|`.
 *
 * La gate ne lit pas la base : l'état réel se mesure au canal ① d'ADR-012
 * (`relreplident`, `indisreplident`), et le verdict de R25 le relit.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const RACINES_SQL = ["migrations", ".passio/migrations", "scripts", "supabase"];
const HORS_PERIMETRE = new Set(["migrations/SCHEMA_PROD_REFERENCE.sql"]);
const MIGRATION_R25 = "migrations/migration_realtime_identite_opaque_2026-11-03.sql";
const TABLES_RID = ["conv_members", "notifications", "conv_reads", "post_likes"];
const TABLES_R25 = [...TABLES_RID, "comment_interactions"];
const GARDE_DECLENCHEUR = "trg_rid_opaque";
const GARDE_FONCTION = "rid_opaque_garde";
const MARQUEUR = /^[ \t]*--[ \t]*audit-identite-replication[ \t]*:[ \t]*assum(?:é|e)e?[ \t]*[—–-]+[ \t]*(\S[^\n]{14,})$/imu;
// Pré-filtre (texte brut, commentaires compris) : chaque instruction gardée
// porte l'un de ces MOTS. Des mots seuls, jamais des paires : un commentaire
// posé entre deux mots (`drop/**/index`) est retiré avant l'analyse, qui lit
// alors `drop index` — une paire `drop\s+index` aurait laissé le fichier hors
// de l'analyse.
const PRE_FILTRE = /table|index|trigger|function|routine|publication/i;

const IDENT = '(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)';
const NOM_LITTERAL = new RegExp(`^(?:(${IDENT})\\s*\\.\\s*)?(${IDENT})$`);
// Un nom laissé à une variable : repère de `format()` (`%I`, `%1$s`, `%-10L`…), chaîne refermée, paramètre `$1`.
const REPERE_FORMAT = "%(?:\\d+\\$)?-?(?:\\d+|\\*(?:\\d+\\$)?)?[sIL]";
const RE_REPERE = new RegExp("^" + REPERE_FORMAT);
const CALCULE = `(?:${REPERE_FORMAT}|'|\\$\\d)`;
const INCONNU = "\u0000nom inconnu"; // un index renommé vers un nom calculé : plus aucun nom écrit ne le désigne

/**
 * Retire les commentaires (`--…`, `/* … *\/` imbriqués) en gardant chaque fin
 * de ligne — les numéros de ligne restent ceux du fichier. Chaînes, identifiants
 * entre guillemets et corps `$tag$…$tag$` sont gardés ; un corps dollar est
 * relu comme du SQL (ses propres commentaires retirés), borné à SA balise de
 * fin, que PostgreSQL trouve sans rien savoir de ce qu'il contient.
 */
function sansCommentaires(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "-" && d === "-") {
      while (i < n && src[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && d === "*") {
      let prof = 0;
      while (i < n) {
        if (src[i] === "/" && src[i + 1] === "*") { prof++; out += "  "; i += 2; continue; }
        if (src[i] === "*" && src[i + 1] === "/") { prof--; out += "  "; i += 2; if (prof === 0) break; continue; }
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    if (c === "'") {
      const echap = i > 0 && /[eE]/.test(src[i - 1]) && !/[A-Za-z0-9_$]/.test(src[i - 2] || "");
      out += c; i++;
      while (i < n) {
        if (echap && src[i] === "\\") { out += src[i] + (src[i + 1] || ""); i += 2; continue; }
        if (src[i] === "'" && src[i + 1] === "'") { out += "''"; i += 2; continue; }
        out += src[i];
        if (src[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '"') {
      out += c; i++;
      while (i < n) { out += src[i]; if (src[i] === '"') { i++; break; } i++; }
      continue;
    }
    if (c === "$" && !/[A-Za-z0-9_$]/.test(src[i - 1] || "")) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(src.slice(i, i + 80));
      if (m) {
        const balise = m[0];
        const fin = src.indexOf(balise, i + balise.length);
        const corps = fin === -1 ? src.slice(i + balise.length) : src.slice(i + balise.length, fin);
        out += balise + sansCommentaires(corps) + (fin === -1 ? "" : balise);
        i = fin === -1 ? n : fin + balise.length;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/** Le retour arrière en `--|` : ces lignes seules, préfixe ôté, les autres vidées (mêmes numéros de ligne). */
function fluxRetourArriere(src) {
  return src.split("\n").map((l) => (/^--\|/.test(l) ? "   " + l.slice(3) : "")).join("\n");
}

/** Découpe en instructions sur `;` — y compris dans les chaînes et les corps : le SQL dynamique et le plpgsql s'y écrivent. */
function instructions(code) {
  const out = [];
  let debut = 0, ligne = 1, ligneTexte = 1, vu = false;
  for (let i = 0; i <= code.length; i++) {
    const ch = code[i];
    if (i === code.length || ch === ";") {
      if (vu) out.push({ texte: code.slice(debut, i).replace(/\s+/g, " ").trim(), ligne: ligneTexte });
      debut = i + 1;
      vu = false;
      continue;
    }
    // La ligne d'une instruction est celle de son premier caractère visible.
    if (!vu && !/\s/.test(ch)) { vu = true; ligneTexte = ligne; }
    if (ch === "\n") ligne++;
  }
  return out;
}

/** Un nom écrit en toutes lettres → { schema, nom } en minuscules ; calculé → null. */
function nomLitteral(jeton) {
  const m = NOM_LITTERAL.exec(jeton);
  if (!m) return null;
  const sans = (x) => (x.startsWith('"') ? x.slice(1, -1) : x.toLowerCase());
  return { schema: m[1] ? sans(m[1]) : "public", nom: sans(m[2]) };
}

/** Les éléments d'une liste, séparés par les virgules de premier niveau. */
function elements(s) {
  const out = [];
  let prof = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") prof++;
    else if (ch === ")") prof--;
    if (ch === "," && prof === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// La fin d'un nom pris dans une chaîne d'execute : `…_rid_key'`, `…%I')`, `…_rid_key$q$`.
const finDeChaine = (x) => x.replace(/(?:\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)?[')]*$/, "");
/** Le nom d'un jeton tel qu'une chaîne d'execute peut le refermer ; calculé → null. */
const nomDe = (jeton) => nomLitteral(finDeChaine(jeton));

/**
 * L'ACTION d'un `alter table` écrit DANS une chaîne (SQL dynamique) se
 * calcule-t-elle ? Un repère de `format()` avant la fin de la chaîne, ou la
 * chaîne refermée puis concaténée (`… ' || x`). Lue comme la SUITE de la
 * chaîne : en SQL statique, la première apostrophe OUVRE une chaîne, et ce
 * qui la suit n'est pas un `||` — `default ('x' || …)` n'est pas calculé.
 */
function actionCalculee(action) {
  for (let i = 0; i < action.length; i++) {
    const c = action[i];
    if (c === "%") {
      if (action[i + 1] === "%") { i++; continue; }
      if (RE_REPERE.test(action.slice(i, i + 16))) return true;
      continue;
    }
    if (c === "'") {
      if (action[i + 1] === "'") { i++; continue; }
      return /^\s*\|\|/.test(action.slice(i + 1));
    }
    if (c === "$" && !/[A-Za-z0-9_$]/.test(action[i - 1] || "")) {
      const m = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(action.slice(i, i + 80));
      if (m) return /^\s*\|\|/.test(action.slice(i + m[0].length));
    }
  }
  return false;
}

/** Une liste de noms dans une chaîne d'execute s'arrête à l'apostrophe qui la ferme ; si elle COMMENCE par elle, elle se concatène : null. */
function listeEcrite(liste) {
  const q = liste.indexOf("'");
  if (q === -1) return liste;
  return liste.slice(0, q).trim() ? liste.slice(0, q) : null;
}

/** `rename to <nom>` en tête d'action : le nouveau nom, null s'il se calcule, undefined sans renommage. */
function renommage(action) {
  const r = /^rename\s+to\s+(\S+)/i.exec(action.trim());
  if (!r) return undefined;
  const n = nomDe(r[1]);
  return n ? n.nom : null;
}

const RE_ALTER = /^alter\s+(table|index)\s+(?:if\s+exists\s+)?(?:only\s+)?(\S+)\s*(.*)$/i;
// `drop [column] [if exists] <colonne>` en tête d'action (pas `drop constraint`).
const RE_DROP_COLONNE = /^drop\s+(?!constraint\b)(?:column\s+)?(?:if\s+exists\s+)?(\S+)/i;
// Derrière une table CALCULÉE : ce qui pourrait toucher l'identité, l'index rid, la colonne rid, la table ou sa garde.
const SENSIBLE_CALCULE = new RegExp([
  "replica\\s+identity",
  "using\\s+index",
  `\\bdrop\\s+(?!constraint\\b)(?:column\\s+)?(?:if\\s+exists\\s+)?(?:"?rid"?(?![A-Za-z0-9_$])|${CALCULE})`,
  `\\bdrop\\s+constraint\\s+(?:if\\s+exists\\s+)?(?:"?[A-Za-z0-9_$]*_rid_key\\b|${CALCULE})`,
  "\\brename\\s+to\\b",
  "\\bset\\s+schema\\b",
  `\\brename\\s+(?:column\\s+|constraint\\s+)?(?:"?rid"?\\s+to\\b|"?[A-Za-z0-9_$]*_rid_key\\b|${CALCULE})`,
  `\\b(?:disable|enable\\s+replica)\\s+trigger\\s+(?:"?${GARDE_DECLENCHEUR}\\b|all\\b|user\\b|${CALCULE})`,
].join("|"), "i");
// Les instructions gardées, dans l'ORDRE du texte : un renommage plus haut change le nom d'une suppression plus bas.
const RE_GESTE = /\b(?:alter\s+(?:table|index|trigger|function|routine)|drop\s+(?:index|table|trigger|function|routine)|create\s+or\s+replace\s+(?:(?:constraint\s+)?trigger|function))\b/gi;
const RE_PUBLICATION = /\b(?:alter\s+publication\s+(\S+)\s+(?:add|set)|create\s+publication\s+(\S+)\s+for)\b/gi;

/**
 * Les éléments d'une action d'`alter table` sur une table nommée en toutes
 * lettres. `calculee` : l'action entière est déjà dite calculée (③) — un
 * élément calculé ne se redit pas.
 */
function actionsDeTable(table, action, calculee) {
  const out = [];
  const rid = TABLES_RID.includes(table);
  const calcule = (x, ordre = 1) => { if (!calculee) out.push({ ordre, type: "calcule", genre: "nom", quoi: `alter table ${table} ${x.slice(0, 40)}`, table }); };
  for (const x of elements(action)) {
    let r;
    if ((r = /^replica\s+identity\s+(default|full|nothing)\b/i.exec(x))) { out.push({ ordre: 0, type: "identite", table, sorte: r[1].toLowerCase() }); continue; }
    if ((r = /^replica\s+identity\s+using\s+index\s+(\S+)/i.exec(x))) {
      const idx = nomDe(r[1]);
      if (!idx) calcule(x, 0);
      else out.push({ ordre: 0, type: "identite", table, sorte: "index", index: idx.nom });
      continue;
    }
    if (/^replica\s+identity\b/i.test(x)) { if (!calculee) out.push({ ordre: 0, type: "identite", table, sorte: "calculee", quoi: `alter table ${table} ${x.slice(0, 40)}` }); continue; }
    if (!rid) continue;
    if ((r = /^drop\s+constraint\s+(?:if\s+exists\s+)?(\S+)/i.exec(x))) {
      const c = nomDe(r[1]);
      if (c) out.push({ ordre: 2, type: "suppression", table, index: c.nom, quoi: `alter table ${table} drop constraint ${c.nom}` });
      else calcule(x);
      continue;
    }
    if ((r = RE_DROP_COLONNE.exec(x))) {
      const col = nomDe(r[1]);
      if (!col) calcule(x);
      else if (col.nom === "rid") out.push({ ordre: 2, type: "suppression", table, colonne: true, quoi: `alter table ${table} drop column rid` });
      continue;
    }
    if ((r = /^add\s+(?:constraint\s+(\S+)\s+)?(?:unique|primary\s+key)\s+using\s+index\s+(\S+)/i.exec(x))) {
      const idx = nomDe(r[2]);
      const c = r[1] ? nomDe(r[1]) : undefined;
      if (!idx) { calcule(x); continue; }
      // `add constraint <c> … using index` RENOMME l'index au nom de la contrainte ; sans nom, il garde le sien.
      out.push({ ordre: 1, type: "retouche", table, index: idx.nom, nouveau: c === undefined ? undefined : c ? c.nom : null, quoi: `alter table ${table} ${x.slice(0, 60)}` });
      continue;
    }
    if ((r = /^rename\s+constraint\s+(\S+)\s+to\s+(\S+)/i.exec(x))) {
      const a = nomDe(r[1]);
      const b = nomDe(r[2]);
      // Renommer la contrainte d'un index renomme l'index.
      if (!a) calcule(x);
      else out.push({ ordre: 1, type: "retouche", table, index: a.nom, nouveau: b ? b.nom : null, quoi: `alter table ${table} rename constraint ${a.nom} to ${b ? b.nom : r[2]}` });
      continue;
    }
    if (/^(?:rename\s+to|set\s+schema)\b/i.test(x)) {
      out.push({ ordre: 1, type: "structure", table, quoi: `alter table ${table} ${x.slice(0, 50)}`, pourquoi: "la table quitte son nom : une table recréée sous ce nom revient en identité DEFAULT, sans rid ni garde trg_rid_opaque, et le temps réel republie ses clés à chaque DELETE" });
      continue;
    }
    if ((r = /^rename\s+(?:column\s+)?(\S+)\s+to\b/i.exec(x))) {
      const col = nomDe(r[1]);
      if (!col) calcule(x);
      else if (col.nom === "rid") out.push({ ordre: 1, type: "structure", table, quoi: `alter table ${table} ${x.slice(0, 50)}`, pourquoi: `la garde ${GARDE_DECLENCHEUR} ne trouve plus rid : tout INSERT de la table est REFUSÉ (« record "new" has no field "rid" »)` });
      continue;
    }
    if ((r = /^(?:disable|enable\s+replica)\s+trigger\s+(\S+)/i.exec(x))) {
      const t = finDeChaine(r[1]);
      const n = nomLitteral(t);
      if (/^(?:all|user)$/i.test(t) || (n && n.nom === GARDE_DECLENCHEUR)) out.push({ ordre: 1, type: "garde", quoi: `alter table ${table} ${x.slice(0, 50)}` });
      else if (!n) calcule(x);
    }
  }
  return out;
}

/**
 * Les gestes gardés d'une instruction, dans l'ordre du texte :
 *   identite    — `alter table <t> replica identity …` ;
 *   suppression — un index, une contrainte ou la colonne rid retirés (la table, ou le nom de l'index) ;
 *   retouche    — un index retouché ou renommé (`alter index`, `alter table <index>`, contrainte sur l'index) ;
 *   structure   — une des quatre tables défaite (supprimée, renommée, déplacée, sa colonne rid renommée) ;
 *   garde       — le déclencheur trg_rid_opaque ou sa fonction touchés ;
 *   calcule     — une cible que la gate ne sait pas lire.
 * Les noms d'index se résolvent dans `analyser`, contre l'état du flux.
 */
function gestes(texte) {
  const out = [];
  for (const m of texte.matchAll(RE_GESTE)) {
    const suite = texte.slice(m.index);
    const motCle = m[0].toLowerCase().replace(/\s+/g, " ");
    if (motCle === "alter table" || motCle === "alter index") {
      const a = RE_ALTER.exec(suite);
      if (!a) continue;
      const verbe = `alter ${a[1].toLowerCase()}`;
      let jeton = a[2], action = a[3];
      // Une chaîne d'execute refermée juste après le nom (`…post_likes'`, `…post_likes$q$`) :
      // ce qui suit est hors de la chaîne — concaténé, ou argument d'un format.
      const q = /'|\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(jeton);
      if (q && q.index > 0) { action = jeton.slice(q.index) + " " + action; jeton = jeton.slice(0, q.index); }
      // La forme descendante : `alter table <t> * …` (ou `<t>*`) se lit comme `<t>`.
      if (jeton.length > 1 && jeton.endsWith("*")) jeton = jeton.slice(0, -1);
      action = action.replace(/^\*\s*/, "");
      if (verbe === "alter index" && /^all$/i.test(jeton)) continue; // `alter index all in tablespace …`
      const cible = nomLitteral(jeton);
      if (!cible) {
        if (verbe === "alter index" || SENSIBLE_CALCULE.test(action)) out.push({ type: "calcule", genre: "nom", quoi: `${verbe} ${a[2]} ${action.slice(0, 40)}` });
        continue;
      }
      if (cible.schema !== "public") continue;
      if (TABLES_RID.includes(cible.nom) && verbe === "alter index") {
        // PostgreSQL accepte `alter index <table> rename to …` : c'est la TABLE qui change de nom.
        if (renommage(action) !== undefined) out.push({ type: "structure", table: cible.nom, quoi: `alter index ${cible.nom} ${action.slice(0, 40)}`, pourquoi: "la table quitte son nom : une table recréée sous ce nom revient en identité DEFAULT, sans rid ni garde trg_rid_opaque, et le temps réel republie ses clés à chaque DELETE" });
        continue;
      }
      if (!TABLES_R25.includes(cible.nom)) {
        // L'objet peut être l'index qui porte une identité (PostgreSQL accepte `alter table <index> rename to …`) :
        // `analyser` le reconnaît à son nom du moment.
        out.push({ type: "retouche", index: cible.nom, nouveau: renommage(action), quoi: `${verbe} ${cible.nom} ${action.slice(0, 40)}` });
        if (verbe === "alter index") continue;
      }
      // (g) une des cinq tables, nommée en toutes lettres, dont l'action se calcule.
      const calculee = TABLES_R25.includes(cible.nom) && actionCalculee(action);
      const faits = actionsDeTable(cible.nom, action, calculee);
      // Placé APRÈS les identités écrites du même alter : la partie calculée a pu
      // en reposer une autre — l'identité de la table devient inconnue.
      if (calculee) faits.push({ ordre: 0.5, type: "calcule", genre: "action", quoi: `alter table ${cible.nom} ${action.slice(0, 40)}`, table: cible.nom });
      // Une table publiée hors R25 dont l'action calculée parle d'identité, sans en écrire une (ni la dire déjà calculée).
      else if (actionCalculee(action) && /replica\s+identity/i.test(action) && !faits.some((f) => f.type === "identite" || f.type === "calcule")) {
        faits.push({ ordre: 0, type: "identite", table: cible.nom, sorte: "calculee", quoi: `alter table ${cible.nom} ${action.slice(0, 40)}` });
      }
      // Un même `alter table` est ATOMIQUE : l'identité qu'il rend vaut pour la
      // colonne ou l'index qu'il retire, dans quelque ordre que ses actions s'écrivent.
      faits.forEach((f, i) => { f.rang = i; });
      faits.sort((x, y) => x.ordre - y.ordre || x.rang - y.rang);
      for (const { ordre, rang, ...f } of faits) out.push(f);
      continue;
    }
    if (motCle === "drop index" || motCle === "drop table") {
      // `alter publication … drop table` retire une table de la publication, pas de la base.
      if (motCle === "drop table" && /\balter\s+publication\s+\S+\s+$/i.test(texte.slice(0, m.index))) continue;
      const d = /^drop\s+(?:index|table)\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(.*)$/i.exec(suite);
      if (!d) continue;
      // Dans une chaîne d'execute, la liste s'arrête à l'apostrophe qui la ferme :
      // ce qui suit (`, 'arg'` d'un format, `|| nom`) n'est pas un nom.
      // Une liste qui COMMENCE à l'apostrophe se concatène : nom calculé.
      const liste = listeEcrite(d[1]);
      if (liste === null) { out.push({ type: "calcule", genre: "nom", quoi: `${motCle} ${d[1].slice(0, 40)}` }); continue; }
      for (let el of elements(liste)) {
        el = finDeChaine(el.replace(/\s+(cascade|restrict)\b.*$/i, "")).trim();
        if (!el) continue;
        const n = nomLitteral(el);
        if (!n) { out.push({ type: "calcule", genre: "nom", quoi: `${motCle} ${el}` }); continue; }
        if (n.schema !== "public") continue;
        if (motCle === "drop index") out.push({ type: "suppression", index: n.nom, quoi: `drop index ${n.nom}` });
        else if (TABLES_RID.includes(n.nom)) out.push({ type: "structure", table: n.nom, quoi: `drop table ${n.nom}`, pourquoi: "une table recréée sous ce nom revient en identité DEFAULT, sans rid ni garde trg_rid_opaque, et le temps réel republie ses clés à chaque DELETE" });
      }
      continue;
    }
    if (/trigger$/.test(motCle)) {
      // `drop trigger [if exists] <nom> on …`, `alter trigger <nom> on …`, `create or replace [constraint] trigger <nom> …`
      const d = /^(?:drop\s+trigger\s+(?:if\s+exists\s+)?|alter\s+trigger\s+|create\s+or\s+replace\s+(?:constraint\s+)?trigger\s+)(\S+)/i.exec(suite);
      if (!d) continue;
      const n = nomDe(d[1]);
      if (!n) out.push({ type: "calcule", genre: "nom", quoi: `${motCle} ${d[1].slice(0, 40)}` });
      else if (n.nom === GARDE_DECLENCHEUR) out.push({ type: "garde", quoi: `${motCle} ${GARDE_DECLENCHEUR}` });
      continue;
    }
    // Fonctions : `create or replace function <nom>(…`, `alter function|routine <nom>…`, `drop function|routine [if exists] <nom>(…)[, …]`.
    if (motCle.startsWith("drop ")) {
      const d = /^drop\s+(?:function|routine)\s+(?:if\s+exists\s+)?(.*)$/i.exec(suite);
      if (!d) continue;
      const liste = listeEcrite(d[1]);
      if (liste === null) { out.push({ type: "calcule", genre: "nom", quoi: `${motCle} ${d[1].slice(0, 40)}` }); continue; }
      for (let el of elements(liste)) {
        el = finDeChaine(el.replace(/\s+(cascade|restrict)\b.*$/i, "").replace(/\s*\(.*$/, "")).trim();
        if (!el) continue;
        const n = nomLitteral(el);
        if (!n) out.push({ type: "calcule", genre: "nom", quoi: `${motCle} ${el}` });
        else if (n.schema === "public" && n.nom === GARDE_FONCTION) out.push({ type: "garde", quoi: `${motCle} public.${GARDE_FONCTION}` });
      }
      continue;
    }
    const f = /^(?:alter\s+(?:function|routine)|create\s+or\s+replace\s+function)\s+([^\s(]+)/i.exec(suite);
    if (!f) continue;
    const n = nomDe(f[1]);
    if (!n) out.push({ type: "calcule", genre: "nom", quoi: `${motCle} ${f[1].slice(0, 40)}` });
    else if (n.schema === "public" && n.nom === GARDE_FONCTION) out.push({ type: "garde", quoi: `${motCle} public.${GARDE_FONCTION}` });
  }
  return out;
}

/**
 * Les tables qu'une instruction ajoute à `supabase_realtime` : `alter
 * publication … add|set table …`, `create publication … for table …`.
 * `toutes` : `tables in schema public`, `for all tables`, un nom calculé — la
 * gate ne sait pas lesquelles, elle les compte toutes.
 */
function publications(texte) {
  const tables = new Set();
  let toutes = false;
  for (const m of texte.matchAll(RE_PUBLICATION)) {
    const pub = nomDe(m[1] || m[2]);
    if (pub && pub.nom !== "supabase_realtime") continue;
    const reste = texte.slice(m.index + m[0].length);
    if (/^\s*\(/.test(reste)) continue; // `set (publish = …)` : des paramètres, aucune table
    if (/^\s*all\s+tables\b/i.test(reste)) { toutes = true; continue; }
    const liste = listeEcrite(reste);
    if (liste === null) { toutes = true; continue; }
    let genre = "table";
    for (let x of elements(liste)) {
      let r;
      if ((r = /^tables\s+in\s+schema\s+(.*)$/i.exec(x))) { genre = "schema"; x = r[1]; }
      else if ((r = /^table\s+(.*)$/i.exec(x))) { genre = "table"; x = r[1]; }
      x = x.replace(/\s+with\s*\(.*$/i, "").trim();
      const jeton = x.replace(/^only\s+/i, "").split(/[\s(]/)[0].replace(/\*$/, "");
      const n = nomDe(jeton);
      if (genre === "schema") { if (!n || n.nom === "public" || /^current_schema$/i.test(jeton)) toutes = true; continue; }
      if (!n) { toutes = true; continue; }
      if (n.schema === "public") tables.add(n.nom);
    }
  }
  return { tables, toutes };
}

const leMarqueur = "Si c'est voulu : le marqueur « -- audit-identite-replication: assumé — <raison> ».";

/**
 * Analyse un fichier. `publiees` : tables de la publication ; `estR25` : la
 * migration R25 elle-même. Rend { refus: [{ligne, motif}], gestes, marqueur, identites }.
 */
function analyser(src, { publiees = new Set(), estR25 = false } = {}) {
  const refus = [];
  const marque = MARQUEUR.exec(src);
  const dispense = estR25 || !!marque;
  let nGestes = 0;
  const vus = { identites: [] };
  const flux = [["exécuté", sansCommentaires(src)], ["retour arrière --|", sansCommentaires(fluxRetourArriere(src))]].map(([nom, code]) => [nom, instructions(code)]);
  // (d) La publication du FICHIER : celle du dépôt, plus ce que le fichier lui
  // ajoute (l'un ou l'autre flux, en quelque ordre que ce soit).
  const publieesFichier = new Set(publiees);
  let toutesPubliees = false;
  for (const [, ins] of flux) {
    for (const i of ins) {
      const p = publications(i.texte);
      p.tables.forEach((t) => publieesFichier.add(t));
      toutesPubliees = toutesPubliees || p.toutes;
    }
  }
  const estPubliee = (t) => toutesPubliees || publieesFichier.has(t);
  for (const [nomFlux, ins] of flux) {
    // L'identité de chaque table au fil du flux — au départ, son index rid (l'état
    // de production après R25) : "default" | "full" | "nothing" | "inconnue" | { index }.
    // Et le nom que porte À CET INSTANT l'index rid de chaque table (un renommage le change).
    const etat = Object.fromEntries(TABLES_RID.map((t) => [t, { index: t + "_rid_key" }]));
    const nomRid = Object.fromEntries(TABLES_RID.map((t) => [t, t + "_rid_key"]));
    const identiteIndex = (t) => (typeof etat[t] === "object" ? etat[t].index : null);
    // La table dont `nom` est l'index rid ou l'index d'identité, à cet instant (restreinte à `table` si donnée).
    const tableDe = (nom, table) => (table ? [table] : TABLES_RID).find((t) => TABLES_RID.includes(t) && (nomRid[t] === nom || identiteIndex(t) === nom));
    const decrire = (t) => (etat[t] === "nothing" ? "vaut NOTHING"
      : etat[t] === "inconnue" ? "est CALCULÉE (rien ne prouve qu'elle a été rendue)"
      : identiteIndex(t) === INCONNU ? "EST son index rid, renommé vers un nom CALCULÉ"
      : "EST " + identiteIndex(t));
    for (const i of ins) {
      for (const g of gestes(i.texte)) {
        const ou = nomFlux === "exécuté" ? `ligne ${i.ligne}` : `ligne ${i.ligne} (${nomFlux})`;
        const refuser = (motif) => refus.push({ ligne: i.ligne, motif: `${ou} — ${motif}` });
        if (g.type === "identite") {
          nGestes++;
          vus.identites.push({ flux: nomFlux, ...g });
          const libelle = g.sorte === "index" ? "using index " + g.index : g.sorte;
          if (g.sorte === "calculee") {
            if (!dispense && (TABLES_R25.includes(g.table) || estPubliee(g.table))) {
              refuser(`« ${g.quoi.slice(0, 80)} » : identité de réplication CALCULÉE sur une table ${TABLES_R25.includes(g.table) ? "de R25" : "PUBLIÉE"}, la gate ne peut pas prouver qu'elle n'est ni FULL ni un index qui parle. Écrire l'identité en toutes lettres, ou le marqueur « -- audit-identite-replication: assumé — <raison> ».`);
            }
          } else if (!dispense && TABLES_R25.includes(g.table)) {
            refuser(`« alter table ${g.table} replica identity ${libelle} » change l'identité de réplication d'une table de R25 : le temps réel republierait des clés à tout abonné, ou refuserait ses UPDATE et DELETE. ${leMarqueur}`);
          } else if (!dispense && g.sorte === "full" && estPubliee(g.table)) {
            refuser(`« alter table ${g.table} replica identity full » sur une table PUBLIÉE : la RLS ne s'applique pas à un DELETE, et un filtre sur n'importe quelle colonne (user_id=eq.<victime>) reconnaît alors chaque effacement — l'oracle que R25 a fermé. ${leMarqueur}`);
          } else if (!dispense && g.sorte === "index" && estPubliee(g.table)) {
            refuser(`« alter table ${g.table} replica identity using index ${g.index} » sur une table PUBLIÉE : le WAL d'un DELETE porte alors les colonnes de cet index, la RLS ne s'y applique pas, et un filtre sur l'une d'elles (user_id=eq.<victime>) reconnaît chaque effacement — l'oracle que R25 a fermé. ${leMarqueur}`);
          }
          if (TABLES_RID.includes(g.table)) etat[g.table] = g.sorte === "index" ? { index: g.index } : g.sorte === "calculee" ? "inconnue" : g.sorte;
        } else if (g.type === "suppression") {
          // Un index (par son nom du moment), une contrainte de la table, ou la colonne rid (qui emporte l'index rid).
          const t = g.colonne ? g.table : tableDe(g.index, g.table);
          // Une table hors des quatre n'a pas d'index rid : sa colonne rid se supprime sans rien demander.
          if (!t || !TABLES_RID.includes(t)) continue;
          nGestes++;
          const vise = g.colonne ? nomRid[t] : g.index;
          const rendue = etat[t] === "default" || etat[t] === "full" || (typeof etat[t] === "object" && etat[t].index !== vise);
          if (!rendue) {
            refuser(`« ${g.quoi} » alors que l'identité de réplication de public.${t} ${decrire(t)} : tout UPDATE et tout DELETE de cette table publiée serait REFUSÉ. Rendre d'abord une identité, dans ce fichier et AVANT : « alter table public.${t} replica identity default; ». Aucun marqueur ne lève ce refus.`);
          }
        } else if (g.type === "retouche") {
          const t = tableDe(g.index, g.table);
          if (!t) continue;
          nGestes++;
          if (!dispense) {
            refuser(`« ${g.quoi} » retouche ${g.index}, l'index qui porte l'identité de réplication de public.${t} : sous un autre nom, ou devenu celui d'une contrainte, sa suppression dans un fichier suivant échapperait à la gate — et tout UPDATE et tout DELETE de la table serait REFUSÉ. ${leMarqueur}`);
          }
          if (g.nouveau !== undefined) {
            const nouveau = g.nouveau === null ? INCONNU : g.nouveau;
            if (nomRid[t] === g.index) nomRid[t] = nouveau;
            if (identiteIndex(t) === g.index) etat[t] = { index: nouveau };
          }
        } else if (g.type === "structure") {
          nGestes++;
          if (!dispense) refuser(`« ${g.quoi} » défait public.${g.table}, table de R25 : ${g.pourquoi}. ${leMarqueur}`);
        } else if (g.type === "garde") {
          nGestes++;
          if (!dispense) refuser(`« ${g.quoi} » touche à la garde ${GARDE_DECLENCHEUR} (rid n'est écrit que par la base) : désarmée, un appelant PLANTE le rid d'une notification qu'il ne lit pas et apprend l'instant où elle est effacée (R25 ③). ${leMarqueur}`);
        } else if (g.type === "calcule") {
          nGestes++;
          if (g.table && TABLES_RID.includes(g.table)) etat[g.table] = "inconnue";
          if (!dispense) {
            const [quoi, pronom, ecrire] = g.genre === "action"
              ? ["ACTION CALCULÉE sur une table de R25", "qu'elle", "l'action"]
              : ["table, index, déclencheur ou fonction CALCULÉ", "qu'il", "le nom"];
            refuser(`« ${g.quoi.slice(0, 80)} » : ${quoi}, la gate ne peut pas prouver ${pronom} épargne les index *_rid_key et la garde ${GARDE_DECLENCHEUR} (identité de réplication de R25). Écrire ${ecrire} en toutes lettres, ou le marqueur « -- audit-identite-replication: assumé — <raison> ».`);
          }
        }
      }
    }
  }
  return { refus, gestes: nGestes, marqueur: marque ? marque[1].trim() : null, identites: vus.identites };
}

function fichiersSql() {
  const out = [];
  for (const r of RACINES_SQL) {
    const abs = path.join(RACINE, r);
    if (!fs.existsSync(abs)) continue;
    (function descendre(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const complet = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".git") descendre(complet); }
        else if (e.name.endsWith(".sql")) out.push(complet);
      }
    })(abs);
  }
  return out.map((f) => path.relative(RACINE, f).split(path.sep).join("/")).filter((f) => !HORS_PERIMETRE.has(f)).sort();
}

function auditer() {
  const erreurs = [];
  const publiees = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, "realtime-publication.json"), "utf8")).publiees);
  const fichiers = fichiersSql();
  let lus = 0, gestesVus = 0;
  const marques = [];
  // La gate et R25 doivent parler des mêmes index : sinon elle garderait des noms morts.
  if (!fichiers.includes(MIGRATION_R25)) {
    erreurs.push(`${MIGRATION_R25} introuvable : la gate ne sait plus quels index portent l'identité de réplication. Mettre à jour MIGRATION_R25 et TABLES_RID (scripts/audit-identite-replication.js).`);
  }
  for (const f of fichiers) {
    const src = fs.readFileSync(path.join(RACINE, f), "utf8");
    lus++;
    if (!PRE_FILTRE.test(src)) continue;
    const r = analyser(src, { publiees, estR25: f === MIGRATION_R25 });
    gestesVus += r.gestes;
    if (r.marqueur) marques.push(`${f} (« ${r.marqueur.slice(0, 70)} »)`);
    for (const x of r.refus) erreurs.push(`${f}:${x.motif}`);
    if (f === MIGRATION_R25) {
      for (const t of TABLES_RID) {
        if (!r.identites.some((g) => g.flux === "exécuté" && g.table === t && g.sorte === "index" && g.index === t + "_rid_key")) {
          erreurs.push(`${f} ne pose plus « replica identity using index ${t}_rid_key » : la gate et R25 ne parlent plus des mêmes index. Mettre à jour TABLES_RID (scripts/audit-identite-replication.js).`);
        }
      }
    }
  }
  return { erreurs, lus, gestesVus, marques };
}

module.exports = { analyser, sansCommentaires, fluxRetourArriere, instructions, gestes, publications, actionCalculee, nomLitteral, MARQUEUR, PRE_FILTRE, TABLES_RID, TABLES_R25, MIGRATION_R25 };

if (require.main === module) {
  const { erreurs, lus, gestesVus, marques } = auditer();
  if (erreurs.length) {
    console.error("❌ identité de réplication des tables de R25 : refus\n");
    erreurs.forEach((e, i) => console.error(`  ${i + 1}. ${e}\n`));
    process.exit(1);
  }
  console.log(
    `OK — identité de réplication gardée : ${lus} fichiers SQL lus (${RACINES_SQL.join(", ")} ; hors tests/ et la photographie générée), ` +
    `${gestesVus} instruction(s) sensible(s) vérifiée(s) ; aucun des ${TABLES_RID.length} index *_rid_key n'est supprimé sans identité rendue` +
    (marques.length ? ` ; marqueur assumé dans : ${marques.join(", ")}` : "") + ".",
  );
}
