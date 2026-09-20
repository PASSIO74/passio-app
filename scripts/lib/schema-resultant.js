"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// LE SCHÉMA RÉSULTANT DES MIGRATIONS (ASTRA-54, cinquième contre-revue Astra,
// 2026-09-15) — pour la gate des tables portant un identifiant de compte.
//
// LE DÉFAUT : `audit-tables-compte.js` repérait `create table public.<nom> (…)`
// par une expression régulière. `CREATE TABLE public.new_data(user_id text)`
// était vu ; `CREATE TABLE x (id …)` SUIVI de `ALTER TABLE x ADD user_id` ne
// l'était pas ; `"public".x` (schéma entre guillemets) échappait aussi. Une
// gate qui lit des mots et non un schéma laisse passer les formes qu'elle n'a
// pas prévues.
//
// ICI : les fichiers SQL sont découpés en ORDRES (hors chaînes, hors
// dollar-quotes, hors commentaires), puis REJOUÉS dans l'ordre des fichiers
// pour construire l'état final : `create table` (schéma nu, quoté, absent ;
// `if not exists` ; corps avec contraintes), `alter table … add [column] [if
// not exists]`, `drop column`, `rename column`, `rename to`, `drop table`.
// Ce qui n'est pas déterminable — `create table … as select`, `like`,
// `inherits` — est NOMMÉ comme indéterminé, pas ignoré. La gate rougit dessus.
//
// ⚠️ CE QUE CE MODÈLE NE VOIT PAS, et qui se dit : une table créée HORS du
// dépôt (à la main, dans le tableau de bord) — c'est la limite « lit le dépôt,
// pas la base » de la gate ; et du SQL construit dynamiquement (`execute
// format(…)`) qu'un `do $$ … $$` peut porter — il est nommé dans `dynamiques`.
// ═══════════════════════════════════════════════════════════════════════════

/** Découpe un texte SQL en ordres, sans les commentaires ; respecte '…', "…", $tag$…$tag$. */
function ordres(sql) {
  const out = [];
  let cur = "", i = 0;
  const s = String(sql).replace(/\r\n/g, "\n");
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === "-" && d === "-") { while (i < s.length && s[i] !== "\n") i++; cur += " "; continue; }
    if (c === "/" && d === "*") { const fin = s.indexOf("*/", i + 2); i = fin < 0 ? s.length : fin + 2; cur += " "; continue; }
    if (c === "'" ) { let j = i + 1; while (j < s.length) { if (s[j] === "'" && s[j + 1] === "'") { j += 2; continue; } if (s[j] === "'") break; j++; } cur += s.slice(i, j + 1); i = j + 1; continue; }
    if (c === '"') { let j = i + 1; while (j < s.length && s[j] !== '"') j++; cur += s.slice(i, j + 1); i = j + 1; continue; }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i));
      if (m) { const tag = m[0]; const fin = s.indexOf(tag, i + tag.length); const j = fin < 0 ? s.length : fin + tag.length; cur += s.slice(i, j); i = j; continue; }
    }
    if (c === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const ident = (x) => String(x || "").replace(/"/g, "").toLowerCase();
// `[schema.]nom`, chaque partie nue ou entre guillemets.
const RE_NOM = `(?:("?[A-Za-z_][A-Za-z0-9_]*"?)\\s*\\.\\s*)?("?[A-Za-z_][A-Za-z0-9_]*"?)`;
function nomTable(m1, m2) { return { schema: m1 ? ident(m1) : "public", table: ident(m2) }; }

/** Sépare le corps d'un `create table` en éléments de premier niveau (virgules hors parenthèses). */
function elements(corps) {
  const out = []; let cur = "", prof = 0;
  for (const c of corps) { if (c === "(") prof++; else if (c === ")") prof--; if (c === "," && prof === 0) { out.push(cur); cur = ""; } else cur += c; }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
const CONTRAINTE = /^(constraint|primary\s+key|unique|foreign\s+key|check|exclude|like)\b/i;

/**
 * Rejoue les fichiers (dans l'ordre donné) et rend :
 * { tables: Map<"schema.table", { colonnes: Set, fichiers: Set }>, indeterminees: [{table, motif, fichier}], dynamiques: [{fichier}] }
 */
function schemaResultant(fichiers) {
  const tables = new Map();
  const indeterminees = [];
  const dynamiques = [];
  const cle = (n) => n.schema + "." + n.table;
  const obtenir = (n, fichier) => { const k = cle(n); if (!tables.has(k)) tables.set(k, { colonnes: new Set(), fichiers: new Set() }); tables.get(k).fichiers.add(fichier); return tables.get(k); };
  for (const { fichier, sql } of fichiers) {
    for (const o of ordres(sql)) {
      const t = o.replace(/\s+/g, " ");
      let m;
      // ⚠️ ASTRA-63 (sixième contre-revue, 16/09) — LES SYNTAXES SUPPORTÉES SONT
      // BORNÉES, ET CE QUI EST HORS BORNE ROUGIT AU LIEU DE SE TAIRE :
      //   · `create table … of <type>` (table typée : colonnes dans le type) ;
      //   · `create table … partition of …` (colonnes du parent) ;
      //   · `alter table … set schema …` (une table qui entre dans `public` ou
      //     en sort n'est plus suivie) ;
      //   · un `create table` / `alter table` porté par un bloc `do $$…$$` ou
      //     un corps de fonction : ce qui s'y AJOUTE (create, add column) est
      //     modélisé de façon ADDITIVE (plus de couples à couvrir, jamais
      //     moins) ; ce qui s'y RETIRE ou s'y déplace (drop, rename, set
      //     schema) et le SQL construit (`execute format`) sont INDÉTERMINÉS.
      // La vérité du schéma se lit dans le catalogue de la base construite
      // (`scripts/lib/tables-compte-catalogue.js`, banc PostgreSQL) — ce
      // lecteur ne remplace pas cette lecture, il refuse de la contrefaire.
      if ((m = new RegExp(`^create\\s+(?:temp|temporary|unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${RE_NOM}\\s+(of|partition\\s+of)\\b`, "i").exec(t))) {
        if (/^create\s+temp/i.test(t)) continue;
        const n = nomTable(m[1], m[2]); obtenir(n, fichier);
        indeterminees.push({ table: cle(n), motif: "create table … " + m[3].toLowerCase().replace(/\s+/g, " ") + " : colonnes portées par le type ou le parent, non déterminables", fichier });
        continue;
      }
      if ((m = new RegExp(`^alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${RE_NOM}\\s+set\\s+schema\\s+("?[A-Za-z_][A-Za-z0-9_]*"?)`, "i").exec(t))) {
        const n = nomTable(m[1], m[2]); const vers = ident(m[3]);
        obtenir(n, fichier);
        indeterminees.push({ table: cle(n), motif: "alter table … set schema " + vers + " : déplacement de schéma non suivi (la table " + (vers === "public" ? "entre dans" : "sort de") + " public)", fichier });
        if (vers === "public") obtenir({ schema: "public", table: n.table }, fichier);
        continue;
      }
      if ((m = new RegExp(`^create\\s+(?:temp|temporary|unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${RE_NOM}\\s*(\\(|as\\b|like\\b)`, "i").exec(t))) {
        if (/^create\s+temp/i.test(t)) continue;                       // une table temporaire n'est pas un schéma
        const n = nomTable(m[1], m[2]);
        if (m[3].toLowerCase() !== "(") { indeterminees.push({ table: cle(n), motif: "create table … " + m[3].toLowerCase() + " : colonnes non déterminables", fichier }); obtenir(n, fichier); continue; }
        // corps entre la parenthèse ouvrante et sa fermante
        const debut = t.indexOf("(", m.index + m[0].length - 1);
        let prof = 0, fin = debut;
        for (; fin < t.length; fin++) { if (t[fin] === "(") prof++; else if (t[fin] === ")") { prof--; if (prof === 0) break; } }
        const corps = t.slice(debut + 1, fin);
        const tb = obtenir(n, fichier);
        for (const el of elements(corps)) {
          if (CONTRAINTE.test(el)) { if (/^like\b/i.test(el)) indeterminees.push({ table: cle(n), motif: "like : colonnes héritées non déterminables", fichier }); continue; }
          const col = /^("?[A-Za-z_][A-Za-z0-9_]*"?)\s/.exec(el + " ");
          if (col) tb.colonnes.add(ident(col[1]));
        }
        if (/\binherits\s*\(/i.test(t)) indeterminees.push({ table: cle(n), motif: "inherits : colonnes héritées non déterminables", fichier });
        continue;
      }
      if ((m = new RegExp(`^alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${RE_NOM}\\s+(.*)$`, "i").exec(t))) {
        const n = nomTable(m[1], m[2]);
        const reste = m[3];
        // plusieurs actions séparées par des virgules de premier niveau
        for (const action of elements(reste)) {
          let a;
          if ((a = /^add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s/i.exec(action + " ")) && !/^add\s+(constraint|primary|unique|foreign|check|exclude)\b/i.test(action)) obtenir(n, fichier).colonnes.add(ident(a[1]));
          else if ((a = /^drop\s+(?:column\s+)?(?:if\s+exists\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)/i.exec(action)) && !/^drop\s+constraint\b/i.test(action)) { if (tables.has(cle(n))) tables.get(cle(n)).colonnes.delete(ident(a[1])); }
          else if ((a = /^rename\s+(?:column\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s+to\s+("?[A-Za-z_][A-Za-z0-9_]*"?)/i.exec(action))) { const tb = obtenir(n, fichier); if (tb.colonnes.has(ident(a[1]))) { tb.colonnes.delete(ident(a[1])); tb.colonnes.add(ident(a[2])); } }
          else if ((a = /^rename\s+to\s+("?[A-Za-z_][A-Za-z0-9_]*"?)/i.exec(action))) { const k = cle(n); const tb = tables.get(k) || { colonnes: new Set(), fichiers: new Set() }; tables.delete(k); tb.fichiers.add(fichier); tables.set(n.schema + "." + ident(a[1]), tb); }
        }
        continue;
      }
      if ((m = new RegExp(`^drop\\s+table\\s+(?:if\\s+exists\\s+)?(.+)$`, "i").exec(t))) {
        for (const part of m[1].split(",")) { const p = new RegExp(`^\\s*${RE_NOM}`).exec(part.replace(/\s+(cascade|restrict)\s*$/i, "")); if (p) tables.delete(cle(nomTable(p[1], p[2]))); }
        continue;
      }
      if (/^(do|create\s+(or\s+replace\s+)?(function|procedure))\b/i.test(t) && /\b(create|alter|drop)\s+table\b/i.test(t)) {
        // Le corps : entre les dollar-quotes (ou tout l'ordre à défaut).
        const dq = /\$([A-Za-z_][A-Za-z0-9_]*)?\$([\s\S]*)\$\1\$/.exec(o);
        const corps = (dq ? dq[2] : o).replace(/\r\n/g, "\n");
        // Le SQL CONSTRUIT (`execute format(…)`, `execute '…'`) : indéterminé
        // seulement s'il peut changer les COLONNES ou l'existence d'une table
        // (`create table`, `drop table`, `alter table … add|drop|rename|set
        // schema`). Un `alter table … validate constraint` construit ne touche
        // pas au schéma des colonnes : nommé, pas rouge.
        // ⚠️ `ALTER PUBLICATION … ADD/DROP/SET TABLE` N'EST PAS DU DDL DE TABLE.
        // Il ajoute ou retire une table d'une PUBLICATION de réplication
        // logique : ni colonne, ni contrainte, ni existence de la table ne
        // bougent. Le motif brut `drop\s+table` l'attrapait pourtant, et la
        // gate refusait `migration_realtime_telemetry_2026-09-20.sql` — une
        // migration qui ne touche aucune table — en réclamant « un identifiant
        // de compte » sur une table qu'elle n'avait pas lue. **Un faux positif
        // sur une gate de sécurité coûte plus qu'un trou : il pousse à écrire
        // la migration autrement pour lui plaire, ou à l'inscrire au socle.**
        // On neutralise donc cette forme AVANT de chercher le DDL de table.
        const sansPublication = corps.replace(
          /\balter\s+publication\s+[a-z0-9_".]+\s+(add|drop|set)\s+table\b/gi,
          " alter publication … ",
        );
        const construit = /\bexecute\b[\s\S]*?\b(create\s+table|drop\s+table|alter\s+table[^;]*?\b(add|drop|rename|set\s+schema)\b)/i.test(sansPublication);
        if (/\bexecute\b/i.test(sansPublication) && /\b(create|alter|drop)\s+table\b/i.test(sansPublication)) dynamiques.push({ fichier, extrait: t.slice(0, 80) });
        if (construit) indeterminees.push({ table: "public.(bloc)", motif: "SQL construit (execute …) portant create/drop table ou alter table add/drop/rename/set schema : non modélisable — " + t.slice(0, 50).replace(/\s+/g, " "), fichier });
        // Ordres DDL ÉCRITS EN CLAIR dans le corps : rejoués de façon additive.
        for (const so of ordres(corps)) {
          const st = so.replace(/\s+/g, " ");
          let mm;
          if ((mm = new RegExp(`^create\\s+(?:temp|temporary|unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${RE_NOM}\\s*\\(`, "i").exec(st)) && !/^create\s+temp/i.test(st)) {
            const n = nomTable(mm[1], mm[2]);
            const debut = st.indexOf("(", mm.index + mm[0].length - 1);
            let prof = 0, fin = debut;
            for (; fin < st.length; fin++) { if (st[fin] === "(") prof++; else if (st[fin] === ")") { prof--; if (prof === 0) break; } }
            const tb = obtenir(n, fichier);
            for (const el of elements(st.slice(debut + 1, fin))) { if (CONTRAINTE.test(el)) continue; const col = /^("?[A-Za-z_][A-Za-z0-9_]*"?)\s/.exec(el + " "); if (col) tb.colonnes.add(ident(col[1])); }
            continue;
          }
          if ((mm = new RegExp(`^alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${RE_NOM}\\s+(.*)$`, "i").exec(st))) {
            const n = nomTable(mm[1], mm[2]);
            for (const action of elements(mm[3])) {
              let a;
              if ((a = /^add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s/i.exec(action + " ")) && !/^add\s+(constraint|primary|unique|foreign|check|exclude)\b/i.test(action)) obtenir(n, fichier).colonnes.add(ident(a[1]));
              else if (/^(drop|rename|set\s+schema)\b/i.test(action)) indeterminees.push({ table: cle(n), motif: "dans un bloc do/fonction : « " + action.slice(0, 40) + " » (retrait, renommage ou déplacement conditionnel) non modélisable", fichier });
            }
            continue;
          }
          if (/^drop\s+table\b/i.test(st)) indeterminees.push({ table: "public.(bloc)", motif: "drop table dans un bloc do/fonction : conditionnel, non modélisable — " + st.slice(0, 50), fichier });
        }
      }
    }
  }
  return { tables, indeterminees, dynamiques };
}

module.exports = { ordres, schemaResultant, elements };
