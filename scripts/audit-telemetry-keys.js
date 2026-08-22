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
 * Deux occurrences vécues :
 *   - PERF-IOS (2026-08-22) : « feed_cards » percutait « card ». Rattrapé à la
 *     relecture, par chance.
 *   - #9 Passion Intelligence (2026-08-22) : « passion_ctx » percutait « pass ».
 *     Fusionné et déployé en production avant d'être vu. C'est ce défaut qui a
 *     motivé ce script.
 *
 * Ce script relève les clés de meta réellement écrites dans js/ et échoue si
 * l'une d'elles ne survit pas au filtre.
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

function chargerDenyKey() {
  const src = fs.readFileSync(TELEMETRY, "utf8");
  const m = src.match(/var\s+DENY_KEY\s*=\s*(\/(?:\\.|[^/\\])+\/[a-z]*)\s*;/);
  if (!m) {
    console.error("ÉCHEC — DENY_KEY introuvable dans js/telemetry.js.");
    console.error("Le filtre a été renommé ou déplacé : cet audit ne protège plus rien.");
    process.exit(1);
  }
  const corps = m[1].slice(1, m[1].lastIndexOf("/"));
  const drapeaux = m[1].slice(m[1].lastIndexOf("/") + 1);
  return new RegExp(corps, drapeaux);
}

// Relève les littéraux d'objet passés en `meta:` ou en 2e argument de tel.action.
function relever(src, fichier) {
  const trouvees = [];
  const motifs = [
    /\btel\.action\(\s*["'`][^"'`]+["'`]\s*,\s*\{([^{}]*)\}/g,
    /\bmeta\s*:\s*\{([^{}]*)\}/g,
  ];
  for (const motif of motifs) {
    let m;
    while ((m = motif.exec(src)) !== null) {
      const corps = m[1];
      const ligne = src.slice(0, m.index).split("\n").length;
      const cles = corps.match(/(^|[,{\s])([A-Za-z_$][\w$]*)\s*:/g) || [];
      for (const brut of cles) {
        const cle = brut.replace(/[,{\s:]/g, "");
        if (cle) trouvees.push({ cle, fichier, ligne });
      }
    }
  }
  return trouvees;
}

const DENY_KEY = chargerDenyKey();
const fichiers = fs.readdirSync(path.join(root, "js"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => path.join("js", f));

let total = 0;
const jetees = [];
for (const rel of fichiers) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  for (const t of relever(src, rel)) {
    total++;
    if (DENY_KEY.test(t.cle)) jetees.push(t);
  }
}

if (jetees.length) {
  console.error("ÉCHEC — " + jetees.length + " clé(s) de télémétrie seront JETÉES en silence par scrubMeta :\n");
  for (const t of jetees) {
    console.error("  " + t.fichier + ":" + t.ligne + "  →  " + t.cle);
  }
  console.error("\nL'événement partira, sa charge utile n'arrivera jamais au centre de pilotage.");
  console.error("Renomme la clé. NE modifie PAS DENY_KEY pour faire passer l'audit :");
  console.error("c'est une frontière de confidentialité, pas un réglage de confort.");
  process.exit(1);
}

console.log("OK — " + total + " clé(s) de télémétrie relevée(s) dans " + fichiers.length +
  " fichiers, toutes survivent au filtre PII.");
