#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// DÉCOUPER UNE MIGRATION EN MORCEAUX COLLABLES (2026-09-10)
// ──────────────────────────────────────────────────────────────────────────
// L'écriture de STRUCTURE passe par le canal ③ d'ADR-012 : psql ou l'éditeur
// SQL de Supabase — c'est-à-dire, en pratique, un copier-coller. À 5 001
// passions, `migration_passions_plat.sql` pèse 1,45 Mo : ce n'est pas collable.
//
// `generer-delta-passions.js` répond au cas « la production a presque tout,
// il manque quelques lignes ». Il ne répond PAS à celui-ci : `sort_order` est
// un index GLOBAL (`p.sort_order = i + 1` dans referentiel-passions.js), donc
// insérer 2 913 entrées décale la valeur de PRESQUE TOUTES les lignes déjà en
// base. Un delta « ce qui a changé » vaudrait alors le miroir entier — le
// découpage est la seule réponse honnête.
//
// ⚠️ ON NE COUPE JAMAIS AU MILIEU D'UNE INSTRUCTION. Le fichier contient des
//    blocs `$$ … $$` (corps de fonctions) qui contiennent eux-mêmes des `;` :
//    couper sur un `;` naïf produirait un morceau syntaxiquement valide en
//    apparence et FAUX à l'exécution. Le découpage suit un analyseur qui
//    connaît les chaînes simples et le dollar-quoting.
//
// ⚠️ CHAQUE MORCEAU EST SA PROPRE TRANSACTION, et c'est un CHANGEMENT DE
//    GARANTIE qu'il faut dire : le miroir entier est un `begin; … commit;`
//    unique, donc tout ou rien. Découpé, un échec au morceau 4 laisse les
//    morceaux 1 à 3 appliqués. Ce n'est pas grave ICI, et seulement ici :
//    le miroir est ADDITIF et IDEMPOTENT (`on conflict do update`, protection
//    de `status='archived'` et de `source='legacy'`), donc reprendre au
//    morceau qui a échoué suffit. Ne pas réutiliser ce découpeur sur une
//    migration qui, elle, aurait besoin de l'atomicité.
//
// ⚠️ LA VÉRIFICATION EST LE CŒUR DE L'OUTIL, pas un supplément : les morceaux
//    sont relus, réassemblés, et la liste d'instructions obtenue est comparée
//    à celle du fichier d'origine. Un découpeur qui perdrait une instruction
//    en silence serait pire que pas de découpeur — on croirait avoir tout
//    appliqué.
//
// ⚠️ LES PARTIES SONT UN MIROIR DE MIROIR, donc elles DÉRIVENT. Le banc SQL
//    les régénère avant de mesurer : il ne verrait donc jamais que les parties
//    COMMITÉES sont périmées. `--verifier` ferme ce trou en 40 ms, et il est
//    appelé par `npm run passions:verifier` — la 8e gate. Sans lui, on colle
//    l'ANCIENNE version en croyant appliquer la nouvelle.
//
//   usage : node scripts/decouper-migration-passions.js [fichier.sql]
//                  [--sortie <dossier>] [--taille <octets>] [--verifier]
// ══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("fs");
const path = require("path");

function arg(nom, defaut) {
  const i = process.argv.indexOf(nom);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
}

const source = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2]
  : "migrations/migration_passions_plat.sql";
const dossier = arg("--sortie", "migrations/parties");
const TAILLE_MAX = parseInt(arg("--taille", "250000"), 10);
const VERIFIER = process.argv.includes("--verifier");

if (!fs.existsSync(source)) {
  console.error("⛔ Fichier introuvable : " + source);
  process.exit(1);
}
const sql = fs.readFileSync(source, "utf8");

// ── Découpe en instructions de premier niveau ──────────────────────────────
// L'analyseur ne connaît que ce dont ce fichier a besoin : commentaires de
// ligne, chaînes simple-quote (avec '' comme échappement) et dollar-quoting
// ($$ ou $tag$). C'est volontairement étroit : un analyseur SQL complet ici
// serait du code qu'on ne saurait pas éprouver.
function instructions(texte) {
  const out = [];
  let debut = 0, i = 0;
  const n = texte.length;
  while (i < n) {
    const c = texte[i];
    if (c === "-" && texte[i + 1] === "-") {              // commentaire de ligne
      const fin = texte.indexOf("\n", i);
      i = fin < 0 ? n : fin + 1;
      continue;
    }
    if (c === "/" && texte[i + 1] === "*") {              // commentaire de bloc
      const fin = texte.indexOf("*/", i + 2);
      i = fin < 0 ? n : fin + 2;
      continue;
    }
    if (c === "'") {                                      // chaîne
      i++;
      while (i < n) {
        if (texte[i] === "'" && texte[i + 1] === "'") { i += 2; continue; }
        if (texte[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "$") {                                      // dollar-quoting
      const m = /^\$[A-Za-z_]*\$/.exec(texte.slice(i));
      if (m) {
        const balise = m[0];
        const fin = texte.indexOf(balise, i + balise.length);
        i = fin < 0 ? n : fin + balise.length;
        continue;
      }
    }
    if (c === ";") {
      out.push(texte.slice(debut, i + 1));
      debut = i + 1;
      i++;
      continue;
    }
    i++;
  }
  const reste = texte.slice(debut);
  if (reste.trim()) out.push(reste);                      // queue de commentaires
  return out;
}

const brutes = instructions(sql);
function attendu_instructions() {
  return utiles.length;
}

// `begin;` / `commit;` du miroir : chaque morceau porte les siens.
const utiles = brutes.filter((s) => {
  const t = s.trim().toLowerCase();
  return t !== "begin;" && t !== "commit;";
});

// ── Répartition en morceaux ────────────────────────────────────────────────
const morceaux = [];
let courant = [];
let taille = 0;
for (const st of utiles) {
  const o = Buffer.byteLength(st, "utf8");
  if (courant.length && taille + o > TAILLE_MAX) {
    morceaux.push(courant);
    courant = [];
    taille = 0;
  }
  courant.push(st);
  taille += o;
}
if (courant.length) morceaux.push(courant);

// ── Contenu attendu de chaque partie ───────────────────────────────────────
const base = path.basename(source, ".sql");
const total = morceaux.length;
const attendus = [];
morceaux.forEach(function (st, k) {
  const num = String(k + 1).padStart(2, "0");
  const nom = path.join(dossier, "partie-" + num + ".sql");
  const entete =
    "-- ═══════════════════════════════════════════════════════════════════\n" +
    "-- " + base + " — PARTIE " + (k + 1) + " / " + total + "\n" +
    "-- ───────────────────────────────────────────────────────────────────\n" +
    "-- Coller les parties DANS L'ORDRE, une par une, en attendant que chacune\n" +
    "-- réponde avant de passer à la suivante.\n" +
    "-- Chaque partie est sa propre transaction et le miroir est IDEMPOTENT :\n" +
    "-- si une partie échoue, corriger puis la relancer, sans reprendre depuis\n" +
    "-- la première.\n" +
    "-- ═══════════════════════════════════════════════════════════════════\n" +
    "begin;\n";
  attendus.push({ nom: nom, contenu: entete + st.join("") + "\ncommit;\n" });
});

// ── Mode --verifier : on ne touche à rien, on compare ─────────────────────
if (VERIFIER) {
  const presentes = fs.existsSync(dossier)
    ? fs.readdirSync(dossier).filter((f) => /^partie-\d+\.sql$/.test(f)).sort()
    : [];
  const problemes = [];
  if (presentes.length !== attendus.length) {
    problemes.push(presentes.length + " partie(s) sur le disque, " + attendus.length + " attendue(s)");
  }
  for (const a of attendus) {
    if (!fs.existsSync(a.nom)) { problemes.push(path.basename(a.nom) + " manquante"); continue; }
    if (fs.readFileSync(a.nom, "utf8") !== a.contenu) problemes.push(path.basename(a.nom) + " périmée");
  }
  if (problemes.length) {
    console.error("");
    console.error("❌ Les parties de " + dossier + "/ ne correspondent PLUS au miroir :");
    problemes.forEach((x) => console.error("   · " + x));
    console.error("");
    console.error("   Remède : node scripts/decouper-migration-passions.js");
    console.error("   (une partie périmée fait appliquer l'ANCIENNE version, en silence)");
    process.exit(1);
  }
  console.log("✅ Les " + total + " parties de " + dossier + "/ sont à jour ("
    + attendu_instructions() + " instructions).");
  process.exit(0);
}

// ── Écriture ───────────────────────────────────────────────────────────────
fs.mkdirSync(dossier, { recursive: true });
for (const f of fs.readdirSync(dossier)) {
  if (/^partie-\d+\.sql$/.test(f)) fs.unlinkSync(path.join(dossier, f));
}
const ecrits = [];
for (const a of attendus) { fs.writeFileSync(a.nom, a.contenu); ecrits.push(a.nom); }

// ── Vérification : rien n'a été perdu ni réordonné ─────────────────────────
// ⚠️ On compare les INSTRUCTIONS, pas les octets : les morceaux portent en plus
//    leur en-tête, leur `begin;` et leur `commit;`. Comparer les octets rendrait
//    un faux rouge permanent et le contrôle finirait par être ignoré.
// ⚠️ L'en-tête ajouté par ce script est un COMMENTAIRE, et un commentaire se
//    colle à l'instruction qui le suit : le relire tel quel ferait échouer la
//    comparaison sur la première instruction de chaque partie — un rouge dû à
//    l'outil, pas au contenu. On relit donc à partir du `begin;` que l'en-tête
//    précède, et jusqu'au `commit;` final.
const relues = [];
for (const nom of ecrits) {
  const brut = fs.readFileSync(nom, "utf8");
  const debut = brut.indexOf("begin;\n");
  const fin = brut.lastIndexOf("\ncommit;\n");
  if (debut < 0 || fin < 0) {
    console.error("❌ " + nom + " ne porte pas son begin;/commit; — découpage abandonné.");
    process.exit(1);
  }
  const corps = brut.slice(debut + "begin;\n".length, fin);
  for (const st of instructions(corps)) relues.push(st);
}
const attendu = utiles.map((s) => s.trim()).filter(Boolean);
const obtenu = relues.map((s) => s.trim()).filter(Boolean);

let ecart = -1;
for (let i = 0; i < Math.max(attendu.length, obtenu.length); i++) {
  if (attendu[i] !== obtenu[i]) { ecart = i; break; }
}

console.log("");
console.log("── Découpage de " + source + " ────────────────────────");
console.log("  instructions      : " + attendu.length);
console.log("  parties écrites   : " + total + " dans " + dossier + "/");
ecrits.forEach(function (nom, k) {
  const o = fs.statSync(nom).size;
  console.log("    " + path.basename(nom) + "  " + String(Math.round(o / 1024)).padStart(4) + " Ko  ·  "
    + morceaux[k].length + " instruction(s)");
});
console.log("");
if (ecart >= 0) {
  console.error("❌ VÉRIFICATION ÉCHOUÉE : divergence à l'instruction " + (ecart + 1) + ".");
  console.error("   attendu : " + String(attendu[ecart]).slice(0, 120));
  console.error("   obtenu  : " + String(obtenu[ecart]).slice(0, 120));
  process.exit(1);
}
console.log("✅ Vérifié : les " + total + " parties rendent EXACTEMENT les "
  + attendu.length + " instructions du fichier d'origine, dans le même ordre.");
console.log("");
