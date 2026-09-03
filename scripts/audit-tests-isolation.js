#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// AUDIT — UNE SUITE QUI NAVIGUE ELLE-MÊME DOIT POSER SON ISOLATION
// ──────────────────────────────────────────────────────────────────────────
// POURQUOI CE BANC EXISTE. Six correctifs d'isolation en quatre jours (#247,
// #249, #252, #255, #258, #259), et CHACUN a rendu `main` rouge puis fait
// SAUTER le job « Déploiement production » — donc bloqué la mise en ligne de
// tout le monde, pas seulement de son auteur.
//
// La cause est toujours la même : un test mesure son chemin PLUS quelque chose
// qu'il ne possède pas — les publications de production, les stories, les
// événements, les notifications, le canal temps réel. `bootOnboarded` pose
// désormais l'isolation PAR DÉFAUT (`app-helper.js`), mais son commentaire dit
// lui-même où le remède s'arrête :
//
//     « LA PORTÉE EST L'APPEL, PAS LE FICHIER. Une suite qui boote aussi par un
//       helper maison (son propre `goto`) garde ce chemin-là exposé : il doit
//       poser `sansDonneesDistantes` lui-même. »
//
// Trois suites avaient été corrigées à la main ce jour-là. Rien ne garantissait
// qu'il n'en restait pas — ni que la prochaine ne rouvrirait pas le trou. Ce
// banc répond à la question mécaniquement, à chaque `npm run verif`, en 200 ms.
//
// ⚠️ CE BANC NE JUGE PAS LE CONTENU D'UN TEST. Il vérifie UNE chose : un spec
// qui appelle `page.goto(` lui-même et qui touche l'application (et non le seul
// gate, ni l'artefact `dist`) doit poser `sansDonneesDistantes` — ou déclarer
// explicitement qu'il gère le réseau lui-même (`sansIsolationDesDonnees`), ou
// figurer au socle avec sa RAISON écrite.
//
// Le socle (`scripts/tests-isolation-socle.json`) est une liste BLANCHE et
// motivée, sur le modèle de `scripts/echappement-socle.json` : on n'y entre pas
// pour faire taire le banc, on y entre parce que l'exposition est voulue et
// qu'on écrit pourquoi.
// ══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");

const DOSSIER = path.join(__dirname, "..", "tests", "e2e");
const SOCLE = path.join(__dirname, "tests-isolation-socle.json");

// Le spec touche-t-il l'APPLICATION ? Un banc sur le gate, sur l'artefact `dist`
// ou sur une page nue n'a aucune donnée distante à isoler.
const MARQUEURS_APP = [
  "#feedList", "#storiesRowFeed", "#eventList", "#notifList", "#profileStrip",
  "#screen-", "goTo(", "state.user", "state.seed", "renderFeed(", "renderStories(",
  "bootOnboarded",
];

function lireSocle() {
  try { return JSON.parse(fs.readFileSync(SOCLE, "utf8")); } catch (e) { return {}; }
}

function main() {
  const socle = lireSocle();
  const fichiers = fs.readdirSync(DOSSIER).filter((f) => f.endsWith(".spec.js")).sort();
  const exposes = [];
  const socleInutile = [];
  let navigants = 0;

  for (const f of fichiers) {
    const src = fs.readFileSync(path.join(DOSSIER, f), "utf8");
    if (!/page\.goto\(/.test(src)) continue;              // ne navigue pas lui-même
    navigants++;

    // ⚠️ ON EXIGE UN APPEL, PAS UN IMPORT — et ce banc a failli naître avec le
    // défaut qu'il traque. Sa première version testait l'IDENTIFIANT sur le
    // fichier entier : la ligne `require("./app-helper")` suffisait donc à le
    // satisfaire, et une suite qui importe l'isolation sans jamais l'appeler
    // serait passée au vert. Vérifié par réinjection — le banc n'avait rien vu.
    // On retire donc les lignes d'import avant de chercher un APPEL.
    const sansImports = src.replace(/^.*require\(["'][^"']*["']\).*$/gm, "");
    const isole = /sansDonneesDistantes\s*\(|sansIsolationDesDonnees/.test(sansImports);
    const toucheApp = MARQUEURS_APP.some((m) => src.includes(m));

    if (isole || !toucheApp) {
      // ⚠️ Un socle qui protège un fichier DÉJÀ correct est un mensonge qui
      // dormira jusqu'au jour où il masquera une vraie exposition.
      if (socle[f] && isole) socleInutile.push(f);
      continue;
    }
    if (socle[f]) continue;                               // exposition déclarée et motivée
    exposes.push(f);
  }

  console.log(`Specs qui naviguent eux-mêmes : ${navigants} · socle : ${Object.keys(socle).length} entrée(s)`);

  if (socleInutile.length) {
    console.log("\n⚠️  Entrées de socle DEVENUES INUTILES (le fichier pose son isolation) :");
    socleInutile.forEach((f) => console.log(`   · ${f} — à retirer de ${path.basename(SOCLE)}`));
  }

  if (!exposes.length) {
    console.log("OK — toute suite qui navigue elle-même pose son isolation (ou l'assume au socle).");
    process.exit(socleInutile.length && process.argv.includes("--ci") ? 1 : 0);
  }

  console.log(`\n❌ ${exposes.length} suite(s) naviguent vers l'application SANS isolation des données distantes :\n`);
  exposes.forEach((f) => console.log(`   · tests/e2e/${f}`));
  console.log(`
Leur verdict dépend donc du CONTENU DE LA PRODUCTION : elles peuvent rougir sur
une PR sans rapport avec son diff, et faire sauter le déploiement pour tout le
monde. Deux issues, jamais une troisième :

  · poser \`await sansDonneesDistantes(page)\` AVANT le \`page.goto\` du helper
    maison (import depuis ./app-helper) ;
  · ou, si la suite gère le réseau elle-même, l'inscrire dans
    ${path.basename(SOCLE)} avec la RAISON écrite.
`);
  process.exit(1);
}

main();
