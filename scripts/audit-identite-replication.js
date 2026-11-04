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
 *   ① JAMAIS DISPENSABLE — `drop index … <table>_rid_key`, ou `alter table
 *      <table> drop column rid`, alors que l'identité de la table EST encore
 *      cet index : le même fichier doit d'abord lui en rendre une, par
 *      `replica identity default`, `full` ou `using index <un autre index>`.
 *      (`nothing` n'en est pas une : la table publiée refuserait de même ses
 *      UPDATE et DELETE.) L'état se suit instruction par instruction : rendre
 *      l'identité APRÈS la suppression, ou la reposer sur `<table>_rid_key`
 *      entre les deux, ne compte pas.
 *   ② DISPENSABLE PAR LE MARQUEUR — tout `alter table … replica identity` sur
 *      une des cinq tables de R25 (les quatre, plus comment_interactions,
 *      qu'elle a remise en DEFAULT : en FULL, un filtre `user_id=eq.<victime>`
 *      reconnaît chaque effacement de la victime), et `replica identity full`
 *      sur TOUTE table publiée (`scripts/realtime-publication.json`) — c'est
 *      le conseil courant pour « recevoir l'ancienne ligne », et c'est
 *      l'oracle que R25 a fermé. La migration R25 elle-même en est exemptée.
 *   ③ DISPENSABLE PAR LE MARQUEUR — une de ces instructions dont la table ou
 *      l'index est CALCULÉ (`execute format('… %I …')`, concaténation) : la
 *      gate ne peut pas prouver qu'elle épargne les `<table>_rid_key`, donc
 *      elle le dit au lieu de se taire. Un `drop index` calculé (une purge
 *      d'index « inutilisés » en boucle) est exactement le défaut gardé.
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
 * chaîne se reformule.
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
const MARQUEUR = /^[ \t]*--[ \t]*audit-identite-replication[ \t]*:[ \t]*assum(?:é|e)e?[ \t]*[—–-]+[ \t]*(\S[^\n]{14,})$/imu;
// Pré-filtre (texte brut, commentaires compris) : un fichier qui ne contient
// aucun de ces mots ne porte aucune instruction gardée.
const PRE_FILTRE = /replica\s+identity|drop\s+index|drop\s+(?:column\s+)?(?:if\s+exists\s+)?"?rid\b/i;

const IDENT = '(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)';
const NOM_LITTERAL = new RegExp(`^(?:(${IDENT})\\s*\\.\\s*)?(${IDENT})$`);

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

const RE_ALTER = /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(\S+)\s*(.*)$/i;
const RE_DROP_INDEX = /\bdrop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(.*)$/i;
// `drop [column] [if exists] <colonne>` en tête d'action (pas `drop constraint`).
const RE_DROP_COLONNE = /^drop\s+(?!constraint\b)(?:column\s+)?(?:if\s+exists\s+)?(\S+)/i;
// Derrière une table CALCULÉE : ce qui pourrait toucher l'identité ou la colonne rid.
const SENSIBLE_CALCULE = /replica\s+identity|\bdrop\s+(?!constraint\b)(?:column\s+)?(?:if\s+exists\s+)?(?:"?rid"?(?![A-Za-z0-9_$])|%[ILs]|'|\$\d)/i;
// La fin d'un nom pris dans une chaîne d'execute : `…_rid_key'`, `…%I')`.
const finDeChaine = (x) => x.replace(/[')]+$/, "");

/** Les gestes gardés d'une instruction : identité changée, index rid supprimé, colonne rid supprimée, cible calculée. */
function gestes(texte) {
  const out = [];
  // `alter table` : on repart de CHAQUE occurrence (une chaîne d'execute peut en porter plusieurs).
  for (const m of texte.matchAll(/\balter\s+table\b/gi)) {
    const a = RE_ALTER.exec(texte.slice(m.index));
    if (!a) continue;
    const cible = nomLitteral(a[1]);
    if (!cible) {
      if (SENSIBLE_CALCULE.test(a[2])) out.push({ type: "calcule", quoi: `alter table ${a[1]} ${a[2].slice(0, 40)}` });
      continue;
    }
    if (cible.schema !== "public") continue;
    const sensibles = [];
    for (const x of elements(a[2])) {
      if (/^replica\s+identity\b/i.test(x)) { sensibles.push(x); continue; }
      const d = RE_DROP_COLONNE.exec(x);
      if (!d) continue;
      const col = nomLitteral(finDeChaine(d[1]));
      if (!col) { if (TABLES_RID.includes(cible.nom)) out.push({ type: "calcule", quoi: `alter table ${cible.nom} ${x.slice(0, 40)}` }); }
      else if (col.nom === "rid") sensibles.push(x);
    }
    // Un même `alter table` est ATOMIQUE : l'identité qu'il rend vaut pour la
    // colonne qu'il retire, dans quelque ordre que ses actions s'écrivent.
    sensibles.sort((x, y) => Number(/^drop\b/i.test(x)) - Number(/^drop\b/i.test(y)));
    for (const x of sensibles) {
      let r;
      if ((r = /^replica\s+identity\s+(default|full|nothing)\b/i.exec(x))) out.push({ type: "identite", table: cible.nom, sorte: r[1].toLowerCase() });
      else if ((r = /^replica\s+identity\s+using\s+index\s+(\S+)/i.exec(x))) {
        const idx = nomLitteral(finDeChaine(r[1]));
        if (!idx) out.push({ type: "calcule", quoi: `alter table ${cible.nom} replica identity using index ${r[1]}` });
        else out.push({ type: "identite", table: cible.nom, sorte: "index", index: idx.nom });
      } else if (/^drop\b/i.test(x)) out.push({ type: "suppression", table: cible.nom, quoi: `alter table ${cible.nom} drop column rid` });
    }
  }
  for (const m of texte.matchAll(/\bdrop\s+index\b/gi)) {
    const d = RE_DROP_INDEX.exec(texte.slice(m.index));
    if (!d) continue;
    // Dans une chaîne d'execute, la liste s'arrête à l'apostrophe qui la ferme :
    // ce qui suit (`, 'arg'` d'un format, `|| nom`) n'est pas un nom d'index.
    // Une liste qui COMMENCE à l'apostrophe se concatène : nom calculé.
    let liste = d[1];
    const q = liste.indexOf("'");
    if (q !== -1) {
      if (!liste.slice(0, q).trim()) { out.push({ type: "calcule", quoi: `drop index ${liste.slice(0, 40)}` }); continue; }
      liste = liste.slice(0, q);
    }
    for (let el of elements(liste)) {
      el = finDeChaine(el.replace(/\s+(cascade|restrict)\b.*$/i, "")).trim();
      if (!el) continue;
      const idx = nomLitteral(el);
      if (!idx) { out.push({ type: "calcule", quoi: `drop index ${el}` }); continue; }
      const t = TABLES_RID.find((x) => idx.nom === x + "_rid_key");
      if (t && idx.schema === "public") out.push({ type: "suppression", table: t, quoi: `drop index ${idx.nom}` });
    }
  }
  return out;
}

/**
 * Analyse un fichier. `publiees` : tables de la publication ; `estR25` : la
 * migration R25 elle-même. Rend { refus: [{ligne, motif}], gestes, marqueur }.
 */
function analyser(src, { publiees = new Set(), estR25 = false } = {}) {
  const refus = [];
  const marque = MARQUEUR.exec(src);
  const dispense = estR25 || !!marque;
  let nGestes = 0;
  const vus = { identites: [] };
  for (const [flux, code] of [["exécuté", sansCommentaires(src)], ["retour arrière --|", sansCommentaires(fluxRetourArriere(src))]]) {
    // Ce que chaque table a pour identité, au fil du flux : au départ, son index rid (l'état de production après R25).
    const etat = Object.fromEntries(TABLES_RID.map((t) => [t, "index_rid"]));
    for (const ins of instructions(code)) {
      for (const g of gestes(ins.texte)) {
        nGestes++;
        const ou = flux === "exécuté" ? `ligne ${ins.ligne}` : `ligne ${ins.ligne} (${flux})`;
        if (g.type === "identite") {
          vus.identites.push({ flux, ...g });
          if (!dispense && TABLES_R25.includes(g.table)) {
            refus.push({ ligne: ins.ligne, motif: `${ou} — « alter table ${g.table} replica identity ${g.sorte === "index" ? "using index " + g.index : g.sorte} » change l'identité de réplication d'une table de R25 : le temps réel republierait des clés à tout abonné, ou refuserait ses UPDATE et DELETE. Si c'est voulu : le marqueur « -- audit-identite-replication: assumé — <raison> ».` });
          } else if (!dispense && g.sorte === "full" && publiees.has(g.table)) {
            refus.push({ ligne: ins.ligne, motif: `${ou} — « alter table ${g.table} replica identity full » sur une table PUBLIÉE : la RLS ne s'applique pas à un DELETE, et un filtre sur n'importe quelle colonne (user_id=eq.<victime>) reconnaît alors chaque effacement — l'oracle que R25 a fermé. Si c'est voulu : le marqueur « -- audit-identite-replication: assumé — <raison> ».` });
          }
          if (TABLES_RID.includes(g.table)) etat[g.table] = g.sorte === "index" ? (g.index === g.table + "_rid_key" ? "index_rid" : "autre index") : g.sorte;
        } else if (g.type === "suppression") {
          if (!["default", "full", "autre index"].includes(etat[g.table])) {
            refus.push({ ligne: ins.ligne, motif: `${ou} — « ${g.quoi} » alors que l'identité de réplication de public.${g.table} ${etat[g.table] === "nothing" ? "vaut NOTHING" : "EST " + g.table + "_rid_key"} : tout UPDATE et tout DELETE de cette table publiée serait REFUSÉ. Rendre d'abord une identité, dans ce fichier et AVANT : « alter table public.${g.table} replica identity default; ». Aucun marqueur ne lève ce refus.` });
          }
        } else if (g.type === "calcule" && !dispense) {
          refus.push({ ligne: ins.ligne, motif: `${ou} — « ${g.quoi.slice(0, 80)} » : table ou index CALCULÉ, la gate ne peut pas prouver qu'il épargne les index *_rid_key (identité de réplication de R25). Écrire le nom en toutes lettres, ou le marqueur « -- audit-identite-replication: assumé — <raison> ».` });
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

module.exports = { analyser, sansCommentaires, fluxRetourArriere, instructions, gestes, nomLitteral, MARQUEUR, TABLES_RID, TABLES_R25, MIGRATION_R25 };

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
