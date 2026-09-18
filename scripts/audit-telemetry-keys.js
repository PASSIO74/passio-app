#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * PASSIO — Audit des clés de télémétrie face au filtre PII.
 *
 * js/telemetry.js protège la vie privée par une liste NOIRE de noms de clés
 * (DENY_KEY). Une clé qui la percute n'est pas signalée : elle est SILENCIEUSEMENT
 * ignorée par scrubMeta. L'événement part, sa charge utile n'arrive jamais, et
 * rien dans les tests unitaires ne s'en aperçoit — ils stubbent tel.track et
 * observent l'APPEL, pas ce qui survit au filtre.
 *
 * Trois occurrences vécues :
 *   - PERF-IOS (2026-08-22) : « feed_cards » percutait « card ». Rattrapé à la
 *     relecture, par chance.
 *   - #9 Passion Intelligence (2026-08-22) : « passion_ctx » percutait « pass ».
 *     Fusionné et déployé en production avant d'être vu. C'est ce défaut qui a
 *     motivé ce script.
 *   - LOT E (2026-09-18) : `passion` (publish_post/publish_reel) et `authorId`
 *     (rt_recv post) étaient jetées depuis des semaines, AUDIT VERT : le premier
 *     argument de ces appels est un ternaire, et l'audit n'acceptait qu'un
 *     littéral. C'est ce défaut qui a motivé l'analyseur d'arguments ci-dessous.
 *
 * Ce script relève les clés de meta réellement écrites dans js/ et échoue si
 * l'une d'elles ne survit pas au filtre. Il relève :
 *   - tout appel `tel.<méthode>(…)` / `window.tel.<méthode>(…)` /
 *     `PassioTelemetry.<méthode>(…)` dont un argument est un objet littéral,
 *     QUEL QUE SOIT le premier argument (littéral, ternaire, variable) ;
 *   - les wrappers maison `tel(`, `track(`, `_passionsPageTel(` ;
 *   - les littéraux `meta: {…}` (tel.track, tel.error, tel.api…).
 * `settle` est volontairement HORS liste : son 4e argument est une erreur dont
 * `message`/`code` sont RENOMMÉS par settle lui-même (→ detail/rc) ; les relever
 * ferait rougir l'audit sur un usage correct.
 *
 * ⚠️ La regex n'est PAS recopiée ici : elle est LUE dans js/telemetry.js. Une
 * copie dériverait au premier durcissement du filtre, et l'audit deviendrait
 * vert sur le défaut qu'il existe pour attraper.
 * ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const TELEMETRY = path.join(root, "js", "telemetry.js");

// Méthodes de l'objet Telemetry dont un argument objet est une meta d'appelant.
// `settle` exclu (voir en-tête) ; `nav`/`api`/`error` n'ont pas de meta directe
// (celle de `error`/`api` passe par `meta: {…}`, relevé à part).
const METHODES = ["action", "recv", "click", "perf", "flowStart", "step", "flowEnd"];
// Wrappers maison qui délèguent à tel.action(nom, meta).
const WRAPPERS = ["tel", "track", "_passionsPageTel"];

function chargerDenyKeyDepuis(src) {
  const m = src.match(/var\s+DENY_KEY\s*=\s*(\/(?:\\.|[^/\\])+\/[a-z]*)\s*;/);
  if (!m) return null;
  const corps = m[1].slice(1, m[1].lastIndexOf("/"));
  const drapeaux = m[1].slice(m[1].lastIndexOf("/") + 1);
  return new RegExp(corps, drapeaux);
}

function chargerDenyKey() {
  const re = chargerDenyKeyDepuis(fs.readFileSync(TELEMETRY, "utf8"));
  if (!re) {
    console.error("ÉCHEC — DENY_KEY introuvable dans js/telemetry.js.");
    console.error("Le filtre a été renommé ou déplacé : cet audit ne protège plus rien.");
    process.exit(1);
  }
  return re;
}

// Découpe la liste d'arguments qui commence à `src[i]` (juste APRÈS la
// parenthèse ouvrante) en arguments de premier niveau. Respecte les chaînes,
// les gabarits, les parenthèses/crochets/accolades imbriqués. Rend
// { args: [texte…], fin } ou null si la parenthèse n'est jamais fermée.
function decouperArguments(src, i) {
  const args = [];
  let prof = 0, deb = i, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === "\\") { i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { q = c; continue; }
    if (c === "(" || c === "[" || c === "{") { prof++; continue; }
    if (c === ")" || c === "]" || c === "}") {
      if (prof === 0) { args.push(src.slice(deb, i)); return { args, fin: i }; }
      prof--; continue;
    }
    if (c === "," && prof === 0) { args.push(src.slice(deb, i)); deb = i + 1; }
  }
  return null;
}

// Clés de PREMIER niveau d'un objet littéral `{ … }` : `k: v`, raccourci `k`,
// `"k": v`. Les spreads et les clés calculées sont ignorés (non décidables ici).
function clesObjet(texte) {
  const t = texte.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return [];
  const corps = t.slice(1, -1);
  const entrees = decouperArguments(corps + ")", 0);
  if (!entrees) return [];
  const cles = [];
  for (const e of entrees.args) {
    const s = e.trim();
    if (!s || s.startsWith("...") || s.startsWith("[")) continue;
    const m = s.match(/^(?:["']([^"']+)["']|([A-Za-z_$][\w$]*))\s*(?::|$)/);
    if (m) cles.push(m[1] || m[2]);
  }
  return cles;
}

// Relève les clés d'objets littéraux passés aux méthodes tel.* et aux wrappers,
// ainsi que les littéraux `meta: {…}`. Rend [{ cle, fichier, ligne, appel }].
function relever(src, fichier) {
  const trouvees = [];
  const ligneDe = (idx) => src.slice(0, idx).split("\n").length;
  const pousser = (cles, idx, appel) => {
    for (const cle of cles) trouvees.push({ cle, fichier, ligne: ligneDe(idx), appel });
  };

  // 1) Méthodes tel.* : tout argument objet littéral, quel que soit le premier.
  const motifMethode = new RegExp(
    "\\b(?:tel|window\\.tel|PassioTelemetry|window\\.PassioTelemetry)\\.(" + METHODES.join("|") + ")\\(", "g");
  let m;
  while ((m = motifMethode.exec(src)) !== null) {
    const d = decouperArguments(src, m.index + m[0].length);
    if (!d) continue;
    for (const a of d.args) pousser(clesObjet(a), m.index, "tel." + m[1]);
  }

  // 2) Wrappers maison : `tel(nom, meta)`, `track(nom, meta)`, `_passionsPageTel(nom, meta)`.
  //    Absence de `.` devant : `tel.track(` ne doit pas être pris pour le wrapper
  //    `track(`. Et EXACTEMENT deux arguments, le second étant l'objet : la
  //    fonction interne `track(type, action, fields)` de telemetry.js en a trois
  //    et son 3e argument porte des COLONNES d'événement (message, status…),
  //    pas une meta — les relever ferait rougir l'audit sur le filtre lui-même.
  const motifWrapper = new RegExp("(^|[^.\\w$])(" + WRAPPERS.join("|") + ")\\(", "g");
  while ((m = motifWrapper.exec(src)) !== null) {
    const d = decouperArguments(src, m.index + m[0].length);
    if (!d || d.args.length !== 2) continue;
    pousser(clesObjet(d.args[1]), m.index + m[1].length, m[2] + "(");
  }

  // 3) Littéraux `meta: {…}` (tel.track, tel.error, tel.api, linkCreate…).
  const motifMeta = /\bmeta\s*:\s*\{/g;
  while ((m = motifMeta.exec(src)) !== null) {
    const d = decouperArguments(src, m.index + m[0].length - 1);
    if (!d) continue;
    // decouperArguments a lu jusqu'à l'accolade fermante : on reconstitue l'objet.
    pousser(clesObjet("{" + src.slice(m.index + m[0].length, d.fin) + "}"), m.index, "meta:");
  }

  return trouvees;
}

// Clés jetées parmi celles relevées (fonction pure, testée par mutation).
function jeteesParmi(trouvees, denyKey) {
  return trouvees.filter((t) => denyKey.test(t.cle));
}

function main() {
  const DENY_KEY = chargerDenyKey();
  const fichiers = fs.readdirSync(path.join(root, "js"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join("js", f));

  let total = 0;
  const jetees = [];
  for (const rel of fichiers) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    const t = relever(src, rel);
    total += t.length;
    jetees.push(...jeteesParmi(t, DENY_KEY));
  }

  if (jetees.length) {
    console.error("ÉCHEC — " + jetees.length + " clé(s) de télémétrie seront JETÉES en silence par scrubMeta :\n");
    for (const t of jetees) {
      console.error("  " + t.fichier + ":" + t.ligne + "  →  " + t.cle + "  (" + t.appel + ")");
    }
    console.error("\nL'événement partira, sa charge utile n'arrivera jamais au centre de pilotage.");
    console.error("Renomme la clé. NE modifie PAS DENY_KEY pour faire passer l'audit :");
    console.error("c'est une frontière de confidentialité, pas un réglage de confort.");
    process.exit(1);
  }

  console.log("OK — " + total + " clé(s) de télémétrie relevée(s) dans " + fichiers.length +
    " fichiers, toutes survivent au filtre PII.");
}

if (require.main === module) main();

module.exports = { relever, clesObjet, decouperArguments, jeteesParmi, chargerDenyKeyDepuis, chargerDenyKey, METHODES, WRAPPERS };
