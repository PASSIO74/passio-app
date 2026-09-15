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
      if (/^(do|create\s+(or\s+replace\s+)?(function|procedure))\b/i.test(t) && /\bexecute\s+(format|'|\$)/i.test(t) && /\b(create|alter)\s+table\b/i.test(t)) dynamiques.push({ fichier, extrait: t.slice(0, 80) });
    }
  }
  return { tables, indeterminees, dynamiques };
}

module.exports = { ordres, schemaResultant, elements };
