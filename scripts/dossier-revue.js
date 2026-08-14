#!/usr/bin/env node
/**
 * Générateur de DOSSIER DE REVUE — PASSIO
 * =======================================
 *
 * Prépare un paquet auto-suffisant destiné à une revue INDÉPENDANTE et EN LECTURE SEULE
 * par un second modèle (ChatGPT, Gemini, Codex…), sans jamais lui donner d'accès au dépôt,
 * à la branche principale ni à la production.
 *
 * Le dossier contient : la spécification, le diff git, les fichiers concernés en entier,
 * les tests réellement exécutés AVEC leurs résultats bruts, les migrations touchées,
 * les conventions du projet, et les risques auto-détectés (pièges connus PASSIO).
 *
 * Usage :
 *   node scripts/dossier-revue.js --titre "Isolation inter-comptes au logout"
 *   node scripts/dossier-revue.js --titre "..." --spec docs/spec-truc.md --base origin/main --tests
 *
 * Options :
 *   --titre  <texte>   Titre du changement soumis à revue           (requis)
 *   --spec   <fichier> Fichier de spécification à inclure           (sinon: gabarit à remplir)
 *   --base   <ref>     Référence git de comparaison                 (défaut: auto)
 *   --tests            Lance AUSSI la suite Playwright (lente)      (défaut: audits rapides seuls)
 *   --sortie <dossier> Dossier de sortie                            (défaut: .passio/reviews/<date>-<slug>)
 *
 * GARANTIES (à ne pas casser) :
 *   - Ce script est en LECTURE SEULE sur le dépôt. Il n'écrit QUE dans son dossier de sortie.
 *   - Aucun accès production : pas de Supabase, pas de réseau, pas de git push/commit/checkout.
 *   - Il ne masque jamais un échec de test : un test rouge est rapporté rouge.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RACINE = path.resolve(__dirname, "..");
const TAILLE_MAX_FICHIER = 2 * 1024 * 1024; // 2 Mo — au-delà on note et on n'inclut pas
const TAILLE_MAX_BUNDLE = 600 * 1024; // 600 Ko pour le fichier unique à coller dans un chat

/* ------------------------------------------------------------------ *
 * Utilitaires
 * ------------------------------------------------------------------ */

function lireArgs(argv) {
  const args = { tests: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tests") args.tests = true;
    else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
  }
  return args;
}

/** Exécute une commande et capture SA VÉRITÉ : code de sortie + sortie brute. */
function exec(cmd, argv, opts) {
  const r = spawnSync(cmd, argv, {
    cwd: RACINE,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  return {
    commande: [cmd, ...argv].join(" "),
    code: r.status,
    ok: r.status === 0,
    sortie: [r.stdout || "", r.stderr || ""].join("").trim(),
    erreur: r.error ? String(r.error.message) : null,
  };
}

function git(...argv) {
  return exec("git", argv);
}

function slug(s) {
  return String(s || "revue")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "revue";
}

function ecrire(dossier, nomFichier, contenu) {
  const cible = path.join(dossier, nomFichier);
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.writeFileSync(cible, contenu, "utf8");
  return cible;
}

/* ------------------------------------------------------------------ *
 * Détection des pièges connus PASSIO dans les lignes AJOUTÉES du diff
 * (référence : CLAUDE.md « Invariants critiques » + docs/PIEGES_CONNUS.md)
 * ------------------------------------------------------------------ */

/**
 * Portées : un piège ne vaut que là où l'invariant s'applique.
 *  - APP     : les fichiers applicatifs qui partagent le même `window` (js/app-*.js).
 *  - CLIENT  : tout code exécuté dans un navigateur (app + SPA du dashboard).
 *  - SUPA    : tout code qui parle à Supabase (client ou serveur).
 * Les modules Node (scripts/, dashboard/server/, tests/) sont hors périmètre des pièges
 * liés au DOM et aux globals partagés — les y signaler ne produirait que du bruit.
 */
const PORTEES = {
  APP: (f) => /^js\/app-\d+.*\.js$/.test(f),
  CLIENT: (f) => /^js\/.*\.js$/.test(f) || /^dashboard\/public\/.*\.js$/.test(f) || /\.html$/.test(f),
  SUPA: (f) => /^js\/.*\.js$/.test(f) || /^dashboard\/(server|public)\/.*\.js$/.test(f),
};

const PIEGES = [
  {
    id: "timestamp-Z",
    portee: "SUPA",
    motif: /new Date\s*\([^)]*\+\s*["']Z["']/,
    gravite: "haute",
    libelle: "Concaténation `+ \"Z\"` sur un timestamp Supabase",
    pourquoi:
      "La prod mélange colonnes `timestamp` et `timestamptz` : ce pattern donne « Invalid Date » sur les timestamptz. Utiliser `supaTs(s)` (app-02).",
  },
  {
    id: "recherche-post",
    portee: "APP",
    motif: /(seed\.posts\.find|userPosts\.find|supabasePosts\.find)/,
    gravite: "haute",
    libelle: "Recherche de post sans `findPostAnywhere`",
    pourquoi:
      "`seed.posts.find || userPosts.find` oublie les vrais posts réseau (supabasePosts). Toujours `findPostAnywhere(id)`.",
  },
  {
    id: "catch-muet",
    portee: "APP",
    motif: /catch\s*\([^)]*\)\s*\{\s*(return\s*(\[\]|\{\}|null|false|)\s*;?\s*)?\}/,
    gravite: "haute",
    libelle: "Catch large sans log (masque les ReferenceError)",
    pourquoi:
      "Un `catch(e){return [];}` a masqué un ReferenceError pendant 6 jours (bug diagLog, fil vide). Ne pas envelopper un chemin critique sans log.",
  },
  {
    id: "supabase-authstate",
    portee: "SUPA",
    motif: /onAuthStateChange\s*\(/,
    gravite: "haute",
    libelle: "Modification autour de `onAuthStateChange`",
    pourquoi:
      "Toute requête Supabase DANS `onAuthStateChange` provoque un deadlock. Différer via `setTimeout(...,0)`.",
  },
  {
    id: "base64-db",
    portee: "SUPA",
    motif: /(data:image\/[a-z]+;base64|data:audio\/[a-z]+;base64|data:video\/[a-z]+;base64)/,
    gravite: "haute",
    libelle: "Données base64 potentiellement écrites en base",
    pourquoi: "Jamais de base64 en DB : passer par Supabase Storage.",
  },
  {
    id: "innerhtml-non-echappe",
    portee: "CLIENT",
    motif: /innerHTML\s*(\+?=)\s*[`"']?[^;]*\$\{(?!\s*(escapeHtml|escapeJsArg|safeUrlAttr|Number|parseInt))/,
    gravite: "haute",
    libelle: "Interpolation dans `innerHTML` sans helper d'échappement visible",
    pourquoi:
      "XSS stocké. 3 helpers selon le CONTEXTE : `escapeHtml` (texte), `escapeJsArg` (arg JS dans onclick), `safeUrlAttr` (URL d'autrui).",
  },
  {
    id: "onclick-inline",
    portee: "CLIENT",
    motif: /onclick\s*=\s*["']/,
    gravite: "moyenne",
    libelle: "Handler `onclick` inline ajouté",
    pourquoi:
      "Doit référencer une fonction globale EXISTANTE (7 fonctions fantômes trouvées le 2026-06-10). Vérifié par `npm run audit:handlers`.",
  },
  {
    id: "global-top-level",
    portee: "APP",
    motif: /^\s*(function\s+[A-Za-z_$][\w$]*\s*\(|window\.[A-Za-z_$][\w$]*\s*=\s*new\s+(Set|Map)\b)/,
    gravite: "moyenne",
    libelle: "Nouveau global top-level (fonction ou Set/Map sur window)",
    pourquoi:
      "17 scripts partagent `window` : une redéclaration écrase en silence. Ne jamais nommer un Set d'état comme une fonction. Filet : `npm run audit:globals`.",
  },
  {
    id: "guards-rendu",
    portee: "APP",
    motif: /(feedList|storiesRowFeed|profileStrip)\s*\)?\s*\.innerHTML/,
    gravite: "moyenne",
    libelle: "Écriture directe dans un conteneur de rendu",
    pourquoi:
      "Écrire dans `#feedList`/`#storiesRowFeed`/`#profileStrip` sans invalider `_feedDomSig`/`_lastHtml` fait sauter le prochain render.",
  },
  {
    id: "hauteur-viewport",
    portee: "CLIENT",
    motif: /100dvh|100vh/,
    gravite: "moyenne",
    libelle: "Hauteur viewport en dur",
    pourquoi: "Jamais 100dvh/100vh : utiliser la variable `--app-vh` mesurée en JS.",
  },
  {
    id: "alert",
    portee: "CLIENT",
    motif: /\balert\s*\(/,
    gravite: "basse",
    libelle: "`alert()` utilisé",
    pourquoi: "Convention projet : toasts via `toast()`, jamais `alert()`.",
  },
  {
    id: "embed-profiles",
    portee: "SUPA",
    motif: /select\s*\([^)]*profiles\s*\(/,
    gravite: "moyenne",
    libelle: "Embed `profiles(...)` dans un select Supabase",
    pourquoi: "Un embed sans FK réelle renvoie 400. Vérifier le schéma RÉEL de prod.",
  },
];

function detecterRisques(diff) {
  const trouves = [];
  let horsPortee = 0; // motifs vus mais écartés car l'invariant ne s'applique pas à ce fichier
  let fichierCourant = "?";
  let ligneCourante = 0;

  for (const ligne of diff.split(/\r?\n/)) {
    if (ligne.startsWith("+++ b/")) {
      fichierCourant = ligne.slice(6);
      continue;
    }
    const entete = ligne.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (entete) {
      ligneCourante = parseInt(entete[1], 10) - 1;
      continue;
    }
    if (ligne.startsWith("-")) continue;
    if (!ligne.startsWith("+")) {
      ligneCourante++;
      continue;
    }
    ligneCourante++;
    const code = ligne.slice(1);
    for (const p of PIEGES) {
      if (!p.motif.test(code)) continue;
      const dansPortee = PORTEES[p.portee];
      if (dansPortee && !dansPortee(fichierCourant)) {
        horsPortee++;
        continue;
      }
      trouves.push({
        piege: p,
        fichier: fichierCourant,
        ligne: ligneCourante,
        extrait: code.trim().slice(0, 200),
      });
    }
  }
  trouves.horsPortee = horsPortee;
  return trouves;
}

/* ------------------------------------------------------------------ *
 * Programme principal
 * ------------------------------------------------------------------ */

function main() {
  const args = lireArgs(process.argv.slice(2));

  if (!args.titre) {
    console.error(
      "\n  Titre manquant.\n\n  Usage : node scripts/dossier-revue.js --titre \"Ce que fait le changement\"\n" +
        "          [--spec fichier.md] [--base origin/main] [--tests] [--sortie dossier]\n"
    );
    process.exit(2);
  }

  const dansGit = git("rev-parse", "--is-inside-work-tree");
  if (!dansGit.ok) {
    console.error("  Pas dans un dépôt git.");
    process.exit(2);
  }

  const branche = (git("rev-parse", "--abbrev-ref", "HEAD").sortie || "?").trim();
  const head = (git("rev-parse", "--short", "HEAD").sortie || "?").trim();

  // Base de comparaison : explicite > merge-base avec origin/main (hors main) > HEAD
  let base = args.base;
  if (!base) {
    if (branche !== "main" && git("rev-parse", "--verify", "origin/main").ok) {
      const mb = git("merge-base", "origin/main", "HEAD");
      base = mb.ok ? mb.sortie.trim() : "HEAD";
    } else {
      base = "HEAD";
    }
  }

  const horodatage = new Date();
  const dateIso = horodatage.toISOString().slice(0, 10);
  const nomDossier = `${dateIso}-${slug(args.titre)}`;
  const sortie = path.resolve(RACINE, args.sortie || path.join(".passio", "reviews", nomDossier));
  fs.mkdirSync(sortie, { recursive: true });

  console.log(`\n  Dossier de revue — PASSIO`);
  console.log(`  branche ${branche} @ ${head}  •  base de comparaison : ${base}\n`);

  /* --- 1. Diff (inclut les modifications non commitées) --- */
  const diffRes = git("diff", base, "--");
  const diff = diffRes.sortie;
  const stat = git("diff", "--stat", base, "--").sortie;
  ecrire(sortie, "diff.patch", diff ? diff + "\n" : "(aucune différence)\n");

  const fichiersTouches = (git("diff", "--name-only", base, "--").sortie || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`  ${fichiersTouches.length} fichier(s) touché(s)`);

  /* --- 2. Copie intégrale des fichiers concernés (contexte complet, pas des hunks) --- */
  const notesFichiers = [];
  for (const f of fichiersTouches) {
    const src = path.join(RACINE, f);
    if (!fs.existsSync(src)) {
      notesFichiers.push(`- \`${f}\` — supprimé dans le changement (absent du disque)`);
      continue;
    }
    const taille = fs.statSync(src).size;
    if (taille > TAILLE_MAX_FICHIER) {
      notesFichiers.push(`- \`${f}\` — ${(taille / 1024 / 1024).toFixed(1)} Mo, non inclus (trop volumineux)`);
      continue;
    }
    const dest = path.join(sortie, "fichiers", f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    notesFichiers.push(`- \`${f}\` — ${(taille / 1024).toFixed(0)} Ko`);
  }

  /* --- 3. Conventions du projet (pour que le relecteur ait les invariants) --- */
  const conventions = [];
  for (const f of ["CLAUDE.md", "docs/PIEGES_CONNUS.md"]) {
    const src = path.join(RACINE, f);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.join(sortie, "conventions"), { recursive: true });
      fs.copyFileSync(src, path.join(sortie, "conventions", path.basename(f)));
      conventions.push(f);
    }
  }

  /* --- 4. Migrations touchées --- */
  const migrations = fichiersTouches.filter((f) => /^migrations\/|\.sql$/i.test(f));

  /* --- 5. Tests RÉELLEMENT exécutés — résultats bruts, échecs compris --- */
  console.log(`  Exécution des vérifications…`);
  const verifs = [];

  const jsTouches = fichiersTouches.filter((f) => f.endsWith(".js") && fs.existsSync(path.join(RACINE, f)));
  for (const f of jsTouches) {
    process.stdout.write(`    node --check ${f} … `);
    const r = exec("node", ["--check", f]);
    console.log(r.ok ? "ok" : "ÉCHEC");
    verifs.push({ nom: `Syntaxe — ${f}`, ...r });
  }

  for (const [nom, argv] of [
    ["Audit des globals (collisions window)", ["run", "audit:globals"]],
    ["Audit des handlers onclick", ["run", "audit:handlers"]],
  ]) {
    process.stdout.write(`    ${nom} … `);
    const r = exec("npm", argv);
    console.log(r.ok ? "ok" : "ÉCHEC");
    verifs.push({ nom, ...r });
  }

  if (args.tests) {
    process.stdout.write(`    Suite Playwright (npm test) … `);
    const r = exec("npm", ["test"], { timeout: 20 * 60 * 1000 });
    console.log(r.ok ? "ok" : "ÉCHEC");
    verifs.push({ nom: "Suite end-to-end Playwright", ...r });
  } else {
    verifs.push({
      nom: "Suite end-to-end Playwright",
      commande: "npm test",
      code: null,
      ok: null,
      sortie: "NON EXÉCUTÉE — relancer avec --tests. Ne pas considérer ce changement comme validé de bout en bout.",
      erreur: null,
    });
  }

  const echecs = verifs.filter((v) => v.ok === false);
  const nonExecutes = verifs.filter((v) => v.ok === null);

  ecrire(
    sortie,
    "tests.md",
    [
      `# Tests exécutés — ${args.titre}`,
      ``,
      `Généré le ${horodatage.toISOString()} • branche \`${branche}\` @ \`${head}\``,
      ``,
      `| Vérification | Résultat | Code de sortie |`,
      `| --- | --- | --- |`,
      ...verifs.map(
        (v) =>
          `| ${v.nom} | ${v.ok === true ? "VERT" : v.ok === false ? "**ROUGE**" : "non exécutée"} | ${
            v.code === null ? "—" : v.code
          } |`
      ),
      ``,
      `## Sorties brutes`,
      ``,
      ...verifs.flatMap((v) => [
        `### ${v.nom}`,
        ``,
        `Commande : \`${v.commande}\``,
        ``,
        "```",
        (v.sortie || "(aucune sortie)").slice(0, 20000),
        "```",
        v.erreur ? `\nErreur d'exécution : ${v.erreur}\n` : "",
        ``,
      ]),
    ].join("\n")
  );

  /* --- 6. Risques auto-détectés --- */
  const risques = detecterRisques(diff);
  const parGravite = { haute: [], moyenne: [], basse: [] };
  for (const r of risques) parGravite[r.piege.gravite].push(r);

  ecrire(
    sortie,
    "RISQUES.md",
    [
      `# Risques auto-détectés — ${args.titre}`,
      ``,
      `Détection **mécanique** par motif sur les lignes AJOUTÉES du diff, à partir des invariants`,
      `de \`CLAUDE.md\` et des 56 fiches de \`docs/PIEGES_CONNUS.md\`.`,
      ``,
      `⚠️ Ces signalements sont des **pistes, pas des verdicts** : un motif peut être un faux positif`,
      `(ex. \`onclick\` sur une fonction qui existe bel et bien). L'absence de signalement ne prouve rien.`,
      ``,
      `Chaque piège a une **portée** : les invariants du DOM et des globals partagés ne valent que`,
      `pour \`js/app-*.js\`, pas pour les modules Node de \`scripts/\` ou \`dashboard/server/\`.`,
      risques.horsPortee
        ? `${risques.horsPortee} correspondance(s) de motif ont été écartées à ce titre.`
        : `Aucune correspondance écartée pour cause de portée.`,
      ``,
      risques.length === 0
        ? `Aucun motif de piège connu détecté dans les lignes ajoutées.`
        : `**${risques.length} signalement(s)** : ${parGravite.haute.length} haute, ${parGravite.moyenne.length} moyenne, ${parGravite.basse.length} basse.`,
      ``,
      ...["haute", "moyenne", "basse"].flatMap((g) =>
        parGravite[g].length === 0
          ? []
          : [
              `## Gravité ${g}`,
              ``,
              ...parGravite[g].map((r) =>
                [
                  `### ${r.piege.libelle}`,
                  `\`${r.fichier}\` ligne ~${r.ligne}`,
                  ``,
                  "```js",
                  r.extrait,
                  "```",
                  ``,
                  `**Pourquoi c'est un piège ici** : ${r.piege.pourquoi}`,
                  ``,
                ].join("\n")
              ),
            ]
      ),
    ].join("\n")
  );

  /* --- 7. Spécification --- */
  let spec;
  if (args.spec && fs.existsSync(path.join(RACINE, args.spec))) {
    spec = fs.readFileSync(path.join(RACINE, args.spec), "utf8");
  } else {
    spec = [
      `# Spécification — ${args.titre}`,
      ``,
      `> Gabarit à compléter avant d'envoyer le dossier en revue.`,
      `> Un relecteur sans le contexte ne peut pas juger un diff : dis-lui ce que le code`,
      `> DEVAIT faire, sinon il ne pourra vérifier que la forme.`,
      ``,
      `## Problème / besoin`,
      ``,
      `À compléter.`,
      ``,
      `## Comportement attendu`,
      ``,
      `À compléter (du point de vue de l'utilisateur, pas du code).`,
      ``,
      `## Périmètre volontairement exclu`,
      ``,
      `À compléter — ce qu'on a sciemment décidé de NE PAS faire.`,
      ``,
      `## Risques connus / points d'attention`,
      ``,
      `À compléter — inclure les doutes honnêtes, pas seulement ce dont on est sûr.`,
      ``,
    ].join("\n");
  }
  ecrire(sortie, "SPEC.md", spec);

  /* --- 8. Index du dossier (le mandat du relecteur) --- */
  const index = [
    `# Dossier de revue — ${args.titre}`,
    ``,
    `**Projet** : PASSIO (réseau social des passions — PWA vanilla JS + Supabase)`,
    `**Généré le** : ${horodatage.toISOString()}`,
    `**Branche** : \`${branche}\` @ \`${head}\` — comparé à \`${base}\``,
    ``,
    `---`,
    ``,
    `## Mandat du relecteur`,
    ``,
    `Tu interviens en **revue indépendante et en LECTURE SEULE**. Tu n'as, et ne dois avoir,`,
    `aucun accès au dépôt, à la branche principale ni à la production.`,
    ``,
    `Ce qu'on attend de toi, dans cet ordre :`,
    ``,
    `1. **Effets de bord** — ce que le changement casse ailleurs, hors de son périmètre apparent.`,
    `2. **Failles** — XSS, fuite de données entre comptes, RLS contournable, PII exposée.`,
    `3. **Tests manquants** — les cas qui ne sont couverts par AUCUN test listé dans \`tests.md\`.`,
    `4. **Incohérences architecturales** — écarts vis-à-vis de \`conventions/CLAUDE.md\`.`,
    ``,
    `Ce qu'on n'attend PAS : de la reformulation de style, des préférences personnelles,`,
    `ni une réécriture. Si tu n'as pas assez d'information pour trancher, **dis-le** plutôt`,
    `que de supposer — les fichiers complets sont dans \`fichiers/\`.`,
    ``,
    `Contraintes non négociables du projet (détail dans \`conventions/\`) : vanilla JS sans`,
    `framework ni bundler, pas de modules ES, 17 scripts partagent le même \`window\`,`,
    `HTML généré par template literals avec échappement obligatoire.`,
    ``,
    `---`,
    ``,
    `## Contenu du dossier`,
    ``,
    `| Fichier | Contenu |`,
    `| --- | --- |`,
    `| \`SPEC.md\` | Ce que le changement devait faire |`,
    `| \`diff.patch\` | Le diff git complet |`,
    `| \`fichiers/\` | Les fichiers concernés **en entier** (contexte complet) |`,
    `| \`tests.md\` | Les vérifications lancées et leurs résultats bruts |`,
    `| \`RISQUES.md\` | Pièges connus PASSIO détectés mécaniquement dans le diff |`,
    `| \`conventions/\` | \`CLAUDE.md\` + les 56 fiches de pièges connus |`,
    migrations.length ? `| \`migrations\` | ${migrations.length} fichier(s) SQL touché(s) — voir ci-dessous |` : ``,
    `| \`DOSSIER-COMPLET.md\` | Tout le dossier en un seul fichier, à coller dans un chat |`,
    ``,
    `---`,
    ``,
    `## État des vérifications`,
    ``,
    echecs.length
      ? `> ⛔ **${echecs.length} vérification(s) en ÉCHEC** : ${echecs.map((v) => v.nom).join(", ")}.\n> Le changement n'est pas prêt à être fusionné en l'état.`
      : `> Toutes les vérifications exécutées sont vertes.`,
    ``,
    nonExecutes.length
      ? `> ⚠️ **${nonExecutes.length} non exécutée(s)** : ${nonExecutes
          .map((v) => v.nom)
          .join(", ")}. Ne pas conclure à une validation de bout en bout.`
      : ``,
    ``,
    `| Vérification | Résultat |`,
    `| --- | --- |`,
    ...verifs.map((v) => `| ${v.nom} | ${v.ok === true ? "VERT" : v.ok === false ? "**ROUGE**" : "non exécutée"} |`),
    ``,
    `---`,
    ``,
    `## Fichiers modifiés (${fichiersTouches.length})`,
    ``,
    "```",
    stat || "(aucun)",
    "```",
    ``,
    ...notesFichiers,
    ``,
    migrations.length
      ? [`## Migrations SQL touchées`, ``, ...migrations.map((m) => `- \`${m}\``), ``,
         `⚠️ Le schéma RÉEL de prod ne correspond pas toujours aux fichiers \`migrations/\` du dépôt.`,
         `Toute conclusion sur la base doit être vérifiée sur \`information_schema\`, pas sur ces fichiers.`, ``].join("\n")
      : ``,
    `---`,
    ``,
    `## Risques auto-détectés`,
    ``,
    risques.length === 0
      ? `Aucun motif de piège connu dans les lignes ajoutées (détection mécanique — ne prouve rien).`
      : `${risques.length} signalement(s) — ${parGravite.haute.length} haute, ${parGravite.moyenne.length} moyenne, ${parGravite.basse.length} basse. Détail dans \`RISQUES.md\`.`,
    ``,
  ]
    .filter((l) => l !== ``)
    .join("\n");

  ecrire(sortie, "README.md", index + "\n");

  /* --- 9. Bundle en un seul fichier, à coller tel quel dans un chat --- */
  const morceaux = [
    index,
    `\n\n---\n\n# SPÉCIFICATION\n\n${spec}`,
    `\n\n---\n\n# TESTS\n\nVoir le tableau ci-dessus. Sorties brutes complètes dans \`tests.md\` du dossier.`,
    `\n\n---\n\n# RISQUES AUTO-DÉTECTÉS\n\n${fs.readFileSync(path.join(sortie, "RISQUES.md"), "utf8")}`,
    `\n\n---\n\n# DIFF\n\n\`\`\`diff\n${diff || "(aucune différence)"}\n\`\`\``,
  ];
  let bundle = morceaux.join("");
  if (bundle.length > TAILLE_MAX_BUNDLE) {
    bundle =
      bundle.slice(0, TAILLE_MAX_BUNDLE) +
      `\n\n[… TRONQUÉ à ${TAILLE_MAX_BUNDLE / 1024} Ko. Le dossier complet est sur disque : ${sortie} …]\n`;
  }
  ecrire(sortie, "DOSSIER-COMPLET.md", bundle);

  /* --- Rapport final --- */
  const relatif = path.relative(RACINE, sortie);
  console.log(`\n  Dossier écrit : ${relatif}`);
  console.log(`    • ${fichiersTouches.length} fichier(s) copié(s) en entier`);
  console.log(`    • ${risques.length} risque(s) auto-détecté(s)`);
  console.log(`    • ${verifs.filter((v) => v.ok === true).length} vérification(s) verte(s), ${echecs.length} rouge(s), ${nonExecutes.length} non exécutée(s)`);
  console.log(`\n  À coller dans le chat du relecteur : ${path.join(relatif, "DOSSIER-COMPLET.md")}\n`);

  if (echecs.length) {
    console.log(`  ⛔ ${echecs.length} vérification(s) en échec — dossier généré quand même, échecs inclus.\n`);
    process.exit(1);
  }
}

main();
