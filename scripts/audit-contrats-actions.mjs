#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * PASSIO — Garde des contrats d'action (2026-11-06, gate de `npm run verif`).
 *
 * Le pilotage du nuage juge les parcours à partir des flux que l'app émet
 * (`tel.flowStart` → `step "saved"` → `flowEnd`) et d'un registre unique,
 * `supabase/functions/_shared/contrats-actions.js`. Un flux n'est jugeable que
 * si TROIS choses sont vraies, et chacune a déjà été fausse en production :
 *
 *  ① SON IDENTIFIANT EST GARDÉ. `tel.flowStart("cint")` sans affectation ouvre
 *     un flux que rien ne peut fermer : mesuré le 2026-11-03 (une réaction
 *     enregistrée, son flux réduit à son début), et c'était déjà le défaut du
 *     RSVP le 2026-09-18. Toute occurrence de `flowStart(` doit être la
 *     partie droite d'une affectation (`cid = tel.flowStart(…)`).
 *  ② SON ACTION A UN CONTRAT. Une action sans contrat n'est jugée par
 *     personne : elle compte « hors contrat » au pilotage. Le premier argument
 *     doit être un littéral, ou un ternaire de littéraux — tous sous contrat.
 *  ③ LE CONTRAT EST VRAI. Registre valide (`validerContrats`, coupures dans la
 *     liste blanche), chaque émetteur déclaré porte bien son flux, chaque
 *     verrou (test) existe, chaque contrat CRITIQUE a au moins un émetteur.
 *
 * Ce que la garde NE prouve PAS, et le dit : qu'un `cid` gardé soit fermé sur
 * TOUS les chemins (le banc navigateur tests/e2e/parcours-flux.spec.js le
 * mesure pour les parcours corrigés) ; qu'un parcours non instrumenté n'existe
 * pas (ils sont recensés dans PARCOURS_NON_INSTRUMENTES, et le pilotage les
 * affiche « non instrumentés »).
 *
 *   node scripts/audit-contrats-actions.mjs          → verdict lisible, code 1 si faute
 *   node scripts/audit-contrats-actions.mjs --json   → couverture statique en JSON
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRATS, PARCOURS_NON_INSTRUMENTES, validerContrats } from "../supabase/functions/_shared/contrats-actions.js";
import { COUPURES_AUTORISEES } from "../supabase/functions/_shared/reglages.js";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Retire les commentaires `//` de fin de ligne et les lignes de commentaire, sans toucher aux chaînes. */
export function sansCommentaires(src) {
  return String(src).split("\n").map((ligne) => {
    const t = ligne.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return "";
    let dans = null;
    for (let i = 0; i < ligne.length; i++) {
      const c = ligne[i];
      if (dans) { if (c === "\\") { i++; continue; } if (c === dans) dans = null; continue; }
      if (c === '"' || c === "'" || c === "`") { dans = c; continue; }
      if (c === "/" && ligne[i + 1] === "/") return ligne.slice(0, i);
    }
    return ligne;
  }).join("\n");
}

/** Le premier argument d'un appel dont la parenthèse ouvrante est en `debut` (exclus). */
function premierArgument(src, debut) {
  let prof = 0, dans = null;
  for (let i = debut; i < src.length && i < debut + 400; i++) {
    const c = src[i];
    if (dans) { if (c === "\\") { i++; continue; } if (c === dans) dans = null; continue; }
    if (c === '"' || c === "'" || c === "`") { dans = c; continue; }
    if (c === "(" || c === "[" || c === "{") prof++;
    else if (c === ")" || c === "]" || c === "}") { if (prof === 0) return src.slice(debut, i); prof--; }
    else if (c === "," && prof === 0) return src.slice(debut, i);
  }
  return src.slice(debut, debut + 400);
}

/**
 * Analyse PURE : { fichier → source } et le registre → { fautes, emetteurs }.
 * `emetteurs` : action → fichiers qui l'émettent.
 */
export function analyser(sources, contrats = CONTRATS) {
  const fautes = [];
  const emetteurs = {};
  const appel = /(?:^|[^\w$.])((?:window\.)?(?:tel|Telemetry|PassioTelemetry)\s*\.\s*flowStart)\s*\(/g;
  for (const [fichier, brut] of Object.entries(sources)) {
    const src = sansCommentaires(brut);
    let m;
    appel.lastIndex = 0;
    while ((m = appel.exec(src))) {
      const debutAppel = m.index + m[0].indexOf(m[1]);
      const ligne = src.slice(0, debutAppel).split("\n").length;
      const ou = `${fichier}:${ligne}`;
      // ① l'identifiant est-il gardé ? Ce qui précède l'appel doit finir par une affectation.
      const avant = src.slice(Math.max(0, debutAppel - 160), debutAppel).replace(/\s+$/, "");
      if (!/[^=!<>]=$/.test(avant)) fautes.push(`${ou} : flux ouvert dont l'identifiant n'est pas gardé — rien ne pourra le fermer (écrire \`cid = tel.flowStart(…)\` et le régler par \`tel.settle(cid, …)\`)`);
      // ② l'action a-t-elle un contrat ?
      const arg = premierArgument(src, m.index + m[0].length);
      const litteraux = [...arg.matchAll(/"([^"\\]*)"|'([^'\\]*)'/g)].map((x) => x[1] != null ? x[1] : x[2]);
      if (!litteraux.length) { fautes.push(`${ou} : action non littérale (« ${arg.trim().slice(0, 60)} ») — le contrat ne peut pas être vérifié`); continue; }
      for (const a of litteraux) {
        if (!Object.hasOwn(contrats, a)) fautes.push(`${ou} : action « ${a} » sans contrat dans supabase/functions/_shared/contrats-actions.js`);
        (emetteurs[a] = emetteurs[a] || []).includes(fichier) || emetteurs[a].push(fichier);
      }
    }
  }
  for (const c of Object.values(contrats)) {
    const vus = emetteurs[c.id] || [];
    for (const f of c.emetteurs || []) if (!vus.includes(f)) fautes.push(`contrat ${c.id} : l'émetteur déclaré ${f} ne porte aucun \`flowStart("${c.id}")\``);
    if (c.criticite === "critique" && !vus.length) fautes.push(`contrat ${c.id} (critique) : aucun émetteur dans js/ — un parcours critique non instrumenté se déclare dans PARCOURS_NON_INSTRUMENTES, pas sous contrat`);
  }
  return { fautes, emetteurs };
}

function lireSources() {
  const dir = path.join(RACINE, "js");
  const out = {};
  for (const nom of fs.readdirSync(dir)) {
    if (!nom.endsWith(".js") || nom === "telemetry.js") continue;   // telemetry.js DÉFINIT flowStart
    out["js/" + nom] = fs.readFileSync(path.join(dir, nom), "utf8");
  }
  return out;
}

function principal() {
  const fautes = [];
  fautes.push(...validerContrats(CONTRATS, COUPURES_AUTORISEES));
  const ids = new Set(Object.keys(CONTRATS));
  for (const x of PARCOURS_NON_INSTRUMENTES) if (ids.has(x.id)) fautes.push(`« ${x.id} » est à la fois sous contrat et déclaré non instrumenté`);
  for (const c of Object.values(CONTRATS)) for (const v of c.verrous) if (!fs.existsSync(path.join(RACINE, v))) fautes.push(`contrat ${c.id} : verrou absent ${v}`);
  const r = analyser(lireSources());
  fautes.push(...r.fautes);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ contrats: ids.size, critiques: Object.values(CONTRATS).filter((c) => c.criticite === "critique").length,
      nonInstrumentes: PARCOURS_NON_INSTRUMENTES.map((x) => x.id), emetteurs: r.emetteurs, fautes }, null, 2));
  } else if (fautes.length) {
    console.error(`❌ Contrats d'action : ${fautes.length} faute(s)`);
    for (const f of fautes) console.error("  - " + f);
  } else {
    console.log(`✅ Contrats d'action : ${ids.size} contrats, ${Object.keys(r.emetteurs).length} actions émises, chaque flux gardé et sous contrat.`);
  }
  process.exit(fautes.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) principal();
