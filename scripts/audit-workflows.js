#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AUDIT DES WORKFLOWS — ce qui ne doit pas revenir dans .github/workflows (audit de sécurité 2026-11-06).
//
// Gate statique, sans réseau, inscrit dans `npm run verif`. Chaque règle a un résultat réel derrière :
//   · une installation npm hors lockfile dans un script `run:` (2026-11-14) : `npm install netlify-cli@27.1.2`
//     figeait la CLI, pas ses ~1 120 dépendances — le déploiement de production a rougi sur une dépendance
//     publiée une minute plus tôt, et une version malveillante serait entrée aussi vite, avec le jeton. En CI,
//     on installe par `npm ci --ignore-scripts` sur un lockfile versionné. Sont refusés, lus comme npm 11.13
//     les lit (sous-commande, alias, abréviations, options à valeur, valeur EFFECTIVE de --ignore-scripts) :
//       - `npm install` et ses alias, `update`, `dedupe`, `audit fix`, `init`/`create` ;
//       - `npm ci`, `npm install-ci-test` et `npm rebuild` sans `--ignore-scripts` effectif ;
//       - `npx` et `npm exec` qui téléchargent : `--yes`, `--package`, un outil versionné (`outil@x`) ou hors
//         registre (git, URL, archive, `org/dépôt`) ;
//       - pnpm, yarn, bun, bunx, pnpx : le dépôt n'installe que par npm ;
//   · un fichier qui détournerait `npm ci` ou l'envoi : un `npm-shrinkwrap.json` (il prime sur package-lock.json),
//     un `.npmrc` (registre, scripts, jetons), ou un `.netlify/` à la racine (la CLI y prend des fonctions
//     « internes », les regroupe et exécute leur code avec le jeton), suivis par git ;
//   · une action sans SHA, ou un binaire en `version: latest`, qui reçoit un secret ;
//   · du texte d'un événement interpolé dans un `run:` (injection shell : edge-functions.yml) ;
//   · un jeton personnel dans une étape qui exécute le code du dépôt, dans le job de l'agent :
//     l'agent venait d'y écrire, et `node scripts/…` lançait ce qu'il avait laissé (E-02) ;
//   · une auto-fusion dans le canal de l'agent : du texte d'un inconnu jusqu'à la production (E-01) ;
//   · un shell de l'agent CI sur `git log`, `git diff`, `git show` (`--output=` écrit un fichier).
// Les actions composites du dépôt (.github/actions/**, et tout `uses: ./…`) passent par les mêmes règles.
//
// CE QUE LA GATE LIT, ET SES LIMITES (relecture adverse du 14/11). Seul le shell des scripts `run:` est lu (pas
// un `name:`), découpé comme le shell le découpe (guillemets, `$( … )`, accents graves, groupes, commentaires).
// Elle ne connaît que npm et npx (npm 11.13) ; le corps d'un here-doc est lu comme du shell ; un `npx <outil>`
// SANS version ni `--yes` passe, alors que npm suppose `--yes` hors terminal : seul le lockfile installé juste
// avant le rend sûr (c'est le cas de `npx playwright`). Ce n'est pas un analyseur de shell complet : c'est un
// filet contre le retour des formes qu'on a vues, et de leurs variantes évidentes.
//
// Résoudre un refus : corriger le workflow. Une action nouvelle s'épingle par SHA, l'étiquette en
// commentaire : `gh api repos/<action>/git/ref/tags/<tag>`. Aucune exception n'est prévue ici.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RACINE = path.join(__dirname, "..");
const DOSSIER = path.join(RACINE, ".github", "workflows");
const ACTIONS = path.join(RACINE, ".github", "actions");

// ── npm tel qu'il se lit (npm 11.13 : lib/utils/cmd-list.js et @npmcli/config, relevés le 14/11) ─────────────
const COMMANDES_NPM = (
  "access adduser audit bugs cache ci completion config dedupe deprecate diff dist-tag docs doctor edit exec " +
  "explain explore find-dupes fund get help help-search init install install-ci-test install-test link ll login " +
  "logout ls org outdated owner pack ping pkg prefix profile prune publish query rebuild repo restart root run " +
  "sbom search set shrinkwrap star stars start stop team test token trust undeprecate uninstall unpublish unstar " +
  "update version view whoami"
).split(" ");
const ALIAS_NPM = {
  author: "owner", home: "docs", issues: "bugs", info: "view", show: "view", find: "search", add: "install",
  unlink: "uninstall", remove: "uninstall", rm: "uninstall", r: "uninstall", un: "uninstall", rb: "rebuild",
  list: "ls", ln: "link", create: "init", i: "install", it: "install-test", cit: "install-ci-test", u: "update",
  up: "update", c: "config", s: "search", se: "search", tst: "test", t: "test", ddp: "dedupe", v: "view",
  "run-script": "run", "clean-install": "ci", "clean-install-test": "install-ci-test", x: "exec", why: "explain",
  la: "ll", verison: "version", ic: "ci", innit: "init", in: "install", ins: "install", inst: "install",
  insta: "install", instal: "install", isnt: "install", isnta: "install", isntal: "install", isntall: "install",
  "install-clean": "ci", "isntall-clean": "ci", hlep: "help", "dist-tags": "dist-tag", upgrade: "update",
  udpate: "update", rum: "run", sit: "install-ci-test", urn: "run", ogr: "org", "add-user": "adduser",
};
// Options qui prennent TOUJOURS une valeur (leur type n'admet pas de booléen) : la valeur est le mot suivant.
const OPTIONS_A_VALEUR = new Set(
  (
    "_auth access allow-git also audit-level auth-type before ca cache cache-max cache-min cafile call cert cidr cpu " +
    "depth diff diff-dst-prefix diff-src-prefix diff-unified editor expect-result-count expires fetch-retries " +
    "fetch-retry-factor fetch-retry-maxtimeout fetch-retry-mintimeout fetch-timeout git globalconfig heading " +
    "https-proxy include init-author-email init-author-name init-author-url init-license init-module init-type " +
    "init-version init.author.email init.author.name init.author.url init.license init.module init.version " +
    "install-strategy key libc local-address location lockfile-version loglevel logs-dir logs-max maxsockets message " +
    "min-release-age name node-gyp node-options noproxy omit only orgs orgs-permission os otp pack-destination " +
    "package packages packages-and-scopes-permission password prefix preid provenance-file proxy registry " +
    "replace-registry-host save-prefix sbom-format sbom-type scope scopes script-shell searchexclude searchlimit " +
    "searchopts searchstaleness shell tag tag-version-prefix token-description umask user-agent userconfig viewer " +
    "which workspace"
  ).split(" "),
);
// Raccourcis de npm : vers une option (nom), ou complets (null : ils ne prennent aucun mot de plus).
const RACCOURCIS_NPM = {
  C: "prefix", w: "workspace", c: "call", L: "location", m: "message", reg: "registry", "enjoy-by": "before",
  y: "yes", n: "no-yes", no: "no-yes", d: null, dd: null, ddd: null, q: null, quiet: null, s: null, silent: null,
  verbose: null, g: null, f: null, D: null, E: null, S: null, O: null, P: null, B: null, a: null, l: null, p: null,
};
// Ce que fait la commande, une fois résolue.
const HORS_LOCKFILE = new Set(["install", "install-test", "update", "dedupe", "init"]);
const EXECUTE_LES_SCRIPTS = new Set(["ci", "install-ci-test", "rebuild"]);
const OUTILS_NON_NPM = ["pnpm", "pnpx", "yarn", "bun", "bunx"];
// Options propres à npx qui prennent une valeur (npm 11.13, bin/npx-cli.js).
const OPTIONS_A_VALEUR_NPX = new Set(["package", "p", "cache", "userconfig", "call", "c", "shell", "npm", "node-arg", "n"]);

/** Comme `deref` de npm : camelCase en tirets, commande exacte, alias exact, sinon préfixe unique. */
function commandeNpm(mot) {
  if (!mot) return undefined;
  let c = /[A-Z]/.test(mot) ? mot.replace(/([A-Z])/g, (m) => "-" + m.toLowerCase()) : mot;
  if (COMMANDES_NPM.includes(c)) return c;
  if (ALIAS_NPM[c]) return ALIAS_NPM[c];
  const candidats = [...COMMANDES_NPM, ...Object.keys(ALIAS_NPM)].filter((n) => n.startsWith(c));
  let a = candidats.length === 1 ? candidats[0] : undefined;
  while (a && ALIAS_NPM[a]) a = ALIAS_NPM[a];
  return a;
}

const FAUX = new Set(["false", "0", "no", "null", ""]);

/**
 * Lit les mots qui suivent `npm` comme nopt : options (dans l'ordre, avec leur valeur) et positionnels, `--` compris.
 * Une option à valeur prend le mot suivant ; un booléen prend un `true` / `false` qui le suit.
 */
function lireOptionsNpm(mots) {
  const jetons = [];
  for (let j = 0; j < mots.length; j++) {
    const x = mots[j];
    if (x === "--") {
      jetons.push({ fin: true });
      for (const r of mots.slice(j + 1)) jetons.push({ mot: r, apresFin: true });
      break;
    }
    if (x.length < 2 || !x.startsWith("-")) {
      jetons.push({ mot: x });
      continue;
    }
    let [cle, ...v] = x.replace(/^-+/, "").split("=");
    let valeur = v.length ? v.join("=") : undefined;
    if (!x.startsWith("--")) {
      if (!(cle in RACCOURCIS_NPM)) continue; // drapeaux courts groupés ou inconnus : booléens
      if (RACCOURCIS_NPM[cle] === null) continue;
      cle = RACCOURCIS_NPM[cle];
    }
    if (cle.startsWith("no-")) {
      jetons.push({ option: cle.slice(3), valeur: "false" });
      continue;
    }
    if (valeur === undefined) {
      if (OPTIONS_A_VALEUR.has(cle)) valeur = mots[++j];
      else if (mots[j + 1] === "true" || mots[j + 1] === "false") valeur = mots[++j];
      else valeur = "true";
    }
    jetons.push({ option: cle, valeur });
  }
  return jetons;
}

/** Une spécification d'outil qui fait télécharger : versionnée, ou hors du registre (git, URL, archive, org/dépôt). */
function specTelechargee(spec) {
  if (!spec) return false;
  return (
    /^(?:@[^/@\s]+\/)?[^/@\s]+@.+$/.test(spec) ||
    /^(?:git\+|git:|github:|gitlab:|bitbucket:|gist:|https?:|file:)/.test(spec) ||
    /\.(?:tgz|tar\.gz)$/.test(spec) ||
    /^[^@./~$][^/\s]*\/[^/\s]+$/.test(spec)
  );
}
const ouiActif = (valeur) => !FAUX.has(String(valeur).toLowerCase());

/** Le shell d'un script `run:` : lignes réunies (« \ » de continuation), lignes de commentaire écartées. */
function lignesLogiques(lignes) {
  const sortie = [];
  for (let i = 0; i < lignes.length; i++) {
    if (/^\s*#/.test(lignes[i].l)) continue;
    const debut = lignes[i].n;
    let l = lignes[i].l;
    while (/\\\s*$/.test(l) && i + 1 < lignes.length) {
      i++;
      l = l.replace(/\\\s*$/, " ") + lignes[i].l;
    }
    sortie.push({ n: debut, l });
  }
  return sortie;
}

/**
 * Découpe une ligne de shell en commandes, puis en mots, comme le shell les lit :
 *   · les guillemets délimitent les mots — `echo "npm install"` est UN mot pour echo, pas une installation ;
 *   · `;`, `&&`, `||`, `|`, `&` hors guillemets séparent les commandes ; un `#` en début de mot ouvre un commentaire ;
 *   · `$( … )` (hors guillemets simples, y compris DANS des guillemets doubles) et les accents graves sont des
 *     commandes à part, lues elles aussi ; dans la commande qui les contient, ils ne sont qu'un mot ;
 *   · `${…}` et `${{ … }}` restent dans leur mot ; `(`, `)`, `{`, `}` isolés (groupes) ne sont pas des mots.
 * Un découpage aux parenthèses et aux accolades coupait `npm ci --prefix "${RUNNER_TEMP}/x" --ignore-scripts`
 * avant le drapeau, et refusait à tort un `npm ci` correct.
 */
function commandes(ligne) {
  const toutes = [];
  const lire = (texte) => {
    const cmds = [];
    let mots = [];
    let mot = "";
    let dansMot = false;
    let i = 0;
    const finMot = () => {
      if (dansMot) mots.push(mot);
      mot = "";
      dansMot = false;
    };
    const finCommande = () => {
      finMot();
      const m = mots.filter((x) => !["(", ")", "{", "}"].includes(x));
      if (m.length) cmds.push(m);
      mots = [];
    };
    /** Lit une substitution `$(` … `)` équilibrée à partir de l'indice après `$(` ; rend l'indice après `)`. */
    const substitution = (debut) => {
      let prof = 1;
      let j = debut;
      let q = null;
      for (; j < texte.length; j++) {
        const c = texte[j];
        if (q) {
          if (c === q) q = null;
          continue;
        }
        if (c === "'" || c === '"') q = c;
        else if (c === "(") prof++;
        else if (c === ")" && --prof === 0) break;
      }
      lire(texte.slice(debut, j));
      return j + 1;
    };
    while (i < texte.length) {
      const c = texte[i];
      if (c === "#" && !dansMot) break;
      if (c === "'") {
        const j = texte.indexOf("'", i + 1);
        const fin = j < 0 ? texte.length : j;
        mot += texte.slice(i + 1, fin);
        dansMot = true;
        i = fin + 1;
        continue;
      }
      if (c === '"') {
        i++;
        dansMot = true;
        while (i < texte.length && texte[i] !== '"') {
          if (texte[i] === "\\" && i + 1 < texte.length) {
            mot += texte[i + 1];
            i += 2;
            continue;
          }
          if (texte[i] === "$" && texte[i + 1] === "(") {
            i = substitution(i + 2);
            mot += "$(…)";
            continue;
          }
          if (texte[i] === "`") {
            const j = texte.indexOf("`", i + 1);
            const fin = j < 0 ? texte.length : j;
            lire(texte.slice(i + 1, fin));
            mot += "`…`";
            i = fin + 1;
            continue;
          }
          mot += texte[i++];
        }
        i++;
        continue;
      }
      if (c === "$" && texte[i + 1] === "(") {
        i = substitution(i + 2);
        mot += "$(…)";
        dansMot = true;
        continue;
      }
      if (c === "`") {
        const j = texte.indexOf("`", i + 1);
        const fin = j < 0 ? texte.length : j;
        lire(texte.slice(i + 1, fin));
        mot += "`…`";
        dansMot = true;
        i = fin + 1;
        continue;
      }
      if (c === "\\" && i + 1 < texte.length) {
        mot += texte[i + 1];
        dansMot = true;
        i += 2;
        continue;
      }
      if (c === ";" || c === "|" || c === "&") {
        finCommande();
        i += texte[i + 1] === c ? 2 : 1;
        continue;
      }
      if (/\s/.test(c)) {
        finMot();
        i++;
        continue;
      }
      mot += c;
      dansMot = true;
      i++;
    }
    finCommande();
    toutes.push(...cmds);
  };
  lire(ligne);
  return toutes;
}
const estOutil = (mot, nom) => mot === nom || mot.endsWith("/" + nom);

/** Défauts d'une commande du shell (une liste de mots) : npm, npx, et les outils d'installation hors npm. */
function auditerCommande(m) {
  const d = [];
  const autre = m.find((x) => OUTILS_NON_NPM.some((o) => estOutil(x, o)));
  if (autre) d.push(`\`${autre.split("/").pop()}\` : le dépôt n'installe que par npm (\`npm ci --ignore-scripts\` sur un lockfile)`);

  // npx — comme bin/npx-cli.js : options jusqu'au premier positionnel (ou `--`), puis l'outil.
  const iNpx = m.findIndex((x) => estOutil(x, "npx"));
  if (iNpx >= 0) {
    let spec;
    for (let j = iNpx + 1; j < m.length; j++) {
      const x = m[j];
      if (x === "--") {
        spec = m[j + 1];
        break;
      }
      if (x.length < 2 || !x.startsWith("-")) {
        spec = x;
        break;
      }
      let [cle, ...v] = x.replace(/^-+/, "").split("=");
      if (cle === "p") cle = "package";
      if (cle === "y") cle = "yes";
      if ((cle === "yes" && ouiActif(v.length ? v.join("=") : "true")) || cle === "package") {
        d.push(cle === "yes" ? "`npx --yes` installe la dernière version publiée" : "`npx --package` installe un paquet hors lockfile");
      }
      if (!v.length && (OPTIONS_A_VALEUR_NPX.has(cle) || OPTIONS_A_VALEUR.has(cle))) j++;
    }
    if (specTelechargee(spec)) d.push(`\`npx ${spec}\` télécharge l'outil hors lockfile`);
  }

  const iNpm = m.findIndex((x) => estOutil(x, "npm"));
  if (iNpm < 0) return d;
  const jetons = lireOptionsNpm(m.slice(iNpm + 1));
  const positionnels = jetons.filter((t) => t.mot !== undefined && !t.apresFin).map((t) => t.mot);
  const sous = commandeNpm(positionnels[0]);
  if (!sous) return d;
  const options = jetons.filter((t) => t.option);
  if (HORS_LOCKFILE.has(sous)) {
    if (options.some((o) => o.option === "save" && !ouiActif(o.valeur))) d.push("`npm install --no-save` ignore le lockfile");
    else d.push(`\`npm ${sous}\` installe hors lockfile (la dernière version publiée de chaque dépendance) — en CI, \`npm ci --ignore-scripts\` sur un lockfile versionné`);
  } else if (EXECUTE_LES_SCRIPTS.has(sous)) {
    // La valeur EFFECTIVE : l'environnement d'abord (NPM_CONFIG_IGNORE_SCRIPTS=…), puis chaque occurrence, la dernière l'emporte.
    let sansScripts = false;
    for (const a of m.slice(0, iNpm)) {
      const e = /^npm_config_ignore[_-]scripts=(.*)$/i.exec(a);
      if (e) sansScripts = ouiActif(e[1]);
    }
    for (const o of options) if (o.option === "ignore-scripts") sansScripts = ouiActif(o.valeur);
    if (!sansScripts) d.push(`\`npm ${sous}\` sans \`--ignore-scripts\` — les scripts d'installation de chaque paquet tourneraient sur le runner`);
  } else if (sous === "exec") {
    // npm exec : les options valent jusqu'à `--` ; l'outil est le premier positionnel après la commande, ou après `--`.
    if (options.some((o) => o.option === "yes" && ouiActif(o.valeur))) d.push("`npm exec --yes` installe la dernière version publiée");
    if (options.some((o) => o.option === "package")) d.push("`npm exec --package` installe un paquet hors lockfile");
    const apresFin = jetons.filter((t) => t.apresFin).map((t) => t.mot);
    const spec = positionnels[1] !== undefined ? positionnels[1] : apresFin[0];
    if (specTelechargee(spec)) d.push(`\`npm exec ${spec}\` télécharge l'outil hors lockfile`);
  } else if (sous === "audit" && positionnels[1] === "fix") {
    d.push("`npm audit fix` réécrit l'arbre hors lockfile relu");
  }
  return d;
}

/** Les scripts `run:` d'un workflow ou d'une action : [{ n, lignes: [{ n, l }], brutes: [{ n, l }] }]. */
function scriptsRun(lignes) {
  const scripts = [];
  for (let i = 0; i < lignes.length; i++) {
    const m = /^(\s*)(-\s+)?run:(?:\s+(.*))?$/.exec(lignes[i]);
    if (!m) continue;
    const colonne = m[1].length + (m[2] ? m[2].length : 0);
    const valeur = (m[3] || "").trim();
    const bloc = /^([|>])[-+0-9]*(?:\s+#.*)?$/.exec(valeur);
    if (bloc) {
      const contenu = [];
      let j = i + 1;
      for (; j < lignes.length; j++) {
        const l = lignes[j];
        if (l.trim() === "") {
          contenu.push({ n: j + 1, l: "" });
          continue;
        }
        if (l.length - l.trimStart().length <= colonne) break;
        contenu.push({ n: j + 1, l });
      }
      while (contenu.length && contenu[contenu.length - 1].l === "") contenu.pop();
      let shell = contenu;
      if (bloc[1] === ">") {
        // Scalaire replié : des lignes non vides consécutives forment une seule ligne, jointes par une espace.
        shell = [];
        for (const x of contenu) {
          if (x.l.trim() === "") shell.push({ n: x.n, l: "" });
          else if (shell.length && shell[shell.length - 1].l.trim() !== "") shell[shell.length - 1].l += " " + x.l.trim();
          else shell.push({ n: x.n, l: x.l.trim() });
        }
      }
      scripts.push({ n: i + 1, lignes: shell, brutes: contenu });
      i = j - 1;
    } else if (valeur) {
      let v = valeur;
      const simple = /^'((?:[^']|'')*)'/.exec(v);
      const double = /^"((?:[^"\\]|\\.)*)"/.exec(v);
      if (simple) v = simple[1].replace(/''/g, "'");
      else if (double) v = double[1].replace(/\\(.)/g, "$1");
      else v = v.replace(/\s+#.*$/, "");
      scripts.push({ n: i + 1, lignes: [{ n: i + 1, l: v }], brutes: [{ n: i + 1, l: lignes[i] }] });
    }
  }
  return scripts;
}

/** Règles sur un texte de workflow : rend la liste des défauts, sans lire le disque. */
function auditerWorkflow(nom, texte) {
  const defauts = [];
  const lignes = texte.split(/\r?\n/);
  lignes.forEach((brute, i) => {
    if (/^\s*#/.test(brute)) return;
    const l = brute.replace(/\s+#.*$/, "");
    const ou = `${nom}:${i + 1}`;
    if (/^\s*version:\s*['"]?latest['"]?\s*$/.test(l)) defauts.push(`${ou} : \`version: latest\` n'est pas figé`);
    const m = /^\s*(?:-\s*)?uses:\s*([^\s]+)/.exec(l);
    if (m && !m[1].startsWith("./") && !/@[0-9a-f]{40}$/.test(m[1])) defauts.push(`${ou} : action non épinglée par SHA (${m[1]})`);
  });
  for (const script of scriptsRun(lignes)) {
    for (const { n, l } of lignesLogiques(script.lignes)) {
      for (const c of commandes(l)) for (const d of auditerCommande(c)) defauts.push(`${nom}:${n} : ${d}`);
    }
    // Une interpolation d'événement ne doit jamais entrer dans le texte d'un `run:`, bloc ou ligne.
    for (const { n, l } of script.brutes) {
      if (/^\s*#/.test(l)) continue;
      const e = /\$\{\{\s*(github\.event\.(?!number\b)[^}]*?|github\.head_ref)\s*\}\}/.exec(l);
      if (e && !/\.number\b|\.id\b/.test(e[1])) defauts.push(`${nom}:${n} : \`${e[1].trim()}\` interpolé dans un run: (passer par env:)`);
    }
  }
  return defauts;
}

/** Règles propres au job de l'agent de `claude-code.yml`. */
function auditerCanalAgent(texte) {
  const defauts = [];
  const iPublier = texte.indexOf("id: publier");
  if (iPublier < 0) return ["claude-code.yml : marche `publier` introuvable"];
  const finEnv = texte.indexOf("        run: |", iPublier);
  const envPublier = texte.slice(iPublier, finEnv).split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n");
  if (/secrets\.SENTINELLE_TOKEN/.test(envPublier)) defauts.push("claude-code.yml : `publier` porte un jeton personnel et exécute scripts/ dans le runner de l'agent (E-02)");
  if (!/JETON_PERSONNEL:\s*non\b/.test(envPublier)) defauts.push("claude-code.yml : `publier` doit rester sans jeton personnel, donc sans auto-fusion (E-01)");
  const tools = /--allowedTools "([^"]*)"/.exec(texte);
  if (!tools) defauts.push("claude-code.yml : liste --allowedTools introuvable");
  else for (const interdit of ["git log", "git diff", "git show", "git remote", "gh issue", "gh pr", "cat:", "git commit:", "Write,", "Edit,"]) {
    if (tools[1].includes(interdit)) defauts.push(`claude-code.yml : l'agent CI ne doit pas avoir \`${interdit}\` (E-03)`);
  }
  if (!/git clean -fdxq/.test(texte)) defauts.push("claude-code.yml : les audits doivent tourner sur un arbre remis au commit contrôlé (E-02)");
  return defauts;
}

/** Les fichiers suivis par git (à défaut de git, ceux du disque hors node_modules/ et .git/). */
function fichiersDuDepot(racine) {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: racine, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean);
  } catch {
    const tous = [];
    const parcourir = (rel) => {
      for (const e of fs.readdirSync(path.join(racine, rel), { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) parcourir(r);
        else tous.push(r);
      }
    };
    parcourir("");
    return tous;
  }
}

/**
 * Aucun fichier du dépôt ne détourne une installation ou un envoi : ni npm-shrinkwrap.json, ni .npmrc (n'importe
 * où), ni rien sous .netlify/ à la racine (la CLI y lit des fonctions qu'elle regroupe et exécute avec le jeton).
 */
function auditerFichiersDetournants(fichiers) {
  const raison = (f) => {
    if (/^\.netlify\//.test(f)) return "un .netlify/ versionné entre dans les paquets de fonctions de la CLI, exécuté avec le jeton";
    if (/(?:^|\/)npm-shrinkwrap\.json$/i.test(f)) return "un npm-shrinkwrap.json prime sur package-lock.json";
    if (/(?:^|\/)\.npmrc$/i.test(f)) return "un .npmrc change le registre, les scripts ou les jetons de npm";
    return null;
  };
  return fichiers.filter(raison).map((f) => `${f} : ${raison(f)} — retirer le fichier`);
}

/** Les actions composites lues : tout action.yml sous .github/actions/, et celles que les workflows citent (`uses: ./…`). */
function actionsComposites(textes, { actions, racine }) {
  const trouves = new Set();
  if (fs.existsSync(actions)) {
    const parcourir = (abs) => {
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const a = path.join(abs, e.name);
        if (e.isDirectory()) parcourir(a);
        else if (/^action\.ya?ml$/.test(e.name)) trouves.add(path.relative(racine, a).split(path.sep).join("/"));
      }
    };
    parcourir(actions);
  }
  for (const t of textes) {
    for (const m of t.matchAll(/^\s*(?:-\s*)?uses:\s*\.\/([^\s@#'"]+)/gm)) {
      for (const f of ["action.yml", "action.yaml"]) {
        const rel = path.posix.join(m[1].replace(/\/+$/, ""), f);
        if (fs.existsSync(path.join(racine, rel))) trouves.add(rel);
      }
    }
  }
  return [...trouves].sort();
}

function auditerDepot(dossier = DOSSIER, { actions = ACTIONS, racine = RACINE } = {}) {
  const fichiers = fs.readdirSync(dossier).filter((f) => /\.ya?ml$/.test(f));
  const defauts = [];
  const textes = [];
  for (const f of fichiers) {
    const t = fs.readFileSync(path.join(dossier, f), "utf8");
    textes.push(t);
    defauts.push(...auditerWorkflow(f, t));
    if (f === "claude-code.yml") defauts.push(...auditerCanalAgent(t));
  }
  const composites = actionsComposites(textes, { actions, racine });
  for (const a of composites) defauts.push(...auditerWorkflow(a, fs.readFileSync(path.join(racine, a), "utf8")));
  defauts.push(...auditerFichiersDetournants(fichiersDuDepot(racine)));
  return { defauts, fichiers, composites };
}

if (require.main === module) {
  const { defauts, fichiers, composites } = auditerDepot();
  if (defauts.length) {
    console.error(`✗ audit-workflows : ${defauts.length} défaut(s)\n` + defauts.map((d) => "  " + d).join("\n"));
    process.exit(1);
  }
  console.log(`✓ audit-workflows : ${fichiers.length} workflows et ${composites.length} action(s) composite(s) — aucune installation npm ou npx hors lockfile reconnue, aucun outil d'installation hors npm, aucune action flottante, aucune injection, canal de l'agent sans jeton personnel`);
}

module.exports = { auditerWorkflow, auditerCanalAgent, auditerDepot, auditerFichiersDetournants, auditerCommande, commandes, lignesLogiques, scriptsRun, fichiersDuDepot, commandeNpm };
