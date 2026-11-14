#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AUDIT DES WORKFLOWS — ce qui ne doit pas revenir dans .github/workflows (audit de sécurité 2026-11-06).
//
// Gate statique, sans réseau, inscrit dans `npm run verif`. Chaque règle a un résultat réel derrière :
//   · une installation npm hors lockfile (2026-11-14) : `npm install netlify-cli@27.1.2` figeait la CLI, pas ses
//     ~1 120 dépendances — le déploiement de production a rougi sur une dépendance publiée une minute plus tôt,
//     et une version malveillante serait entrée aussi vite, avec le jeton. En CI, on installe par
//     `npm ci --ignore-scripts` sur un lockfile versionné. Sont refusés :
//       - `npm install` et ses alias, `update`, `dedupe`, `audit fix`, `init`/`create` ;
//       - `npm ci`, `npm install-ci-test` et `npm rebuild` sans `--ignore-scripts` lu avec certitude ;
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
// Les actions composites du dépôt (.github/actions/**, et tout `uses: ./…`, la racine `./` comprise) passent par
// les mêmes règles.
//
// CE QUE LA GATE LIT (deux relectures adverses du 14/11). Une forme qu'elle ne sait pas lire n'est jamais admise :
// elle est REFUSÉE, avec ce qu'il faut écrire à la place.
//   · Le YAML passe par le lecteur fermé du dépôt (scripts/lib/yaml-workflow.js) : une ancre, un alias, une
//     étiquette, un scalaire simple ou cité sur plusieurs lignes, une collection en ligne imbriquée, un indicateur
//     d'indentation explicite rendent la gate rouge (« YAML que la gate ne lit pas »).
//   · TOUTE valeur du fichier est lue comme du shell — les `run:`, mais aussi `with:` (une action de relance qui
//     lance une commande) et `env:` (une commande posée dans une variable) — sauf un `name:`, qui n'est qu'un
//     libellé. Chaque valeur est lue ligne logique par ligne logique (un « \ » final continue la ligne, sauf dans un
//     commentaire) ; un `run:` l'est aussi d'un seul tenant (une chaîne entre guillemets sur plusieurs lignes), le
//     corps de ses here-docs mis à part. Le script de `bash -c`, `sh -c`… et d'`eval` est relu.
//   · npm : la sous-commande doit suivre `npm`. Une option placée AVANT elle est refusée : sa valeur, un raccourci
//     (`--reg`, `-C`), une abréviation (`--prefi`) ou un `--` déplacent la sous-commande, et la gate ne rejoue pas
//     l'analyseur d'options de npm.
//   · `--ignore-scripts` n'est lu que sous la forme `--ignore-scripts` (ou `=true`), avant tout `--`, hors de portée
//     d'une option qui prendrait le mot suivant pour valeur. Toute autre forme qui le touche (négation, abréviation,
//     autre valeur, majuscules) est refusée.
//   · npx et npm exec : devant l'outil, seules `--yes`/`-y` (refusées), `--no`, `--no-yes`, `--no-install`,
//     `--yes=false`, `-q` et `--quiet` sont lues ; une autre option est refusée, elle pourrait prendre l'outil pour
//     sa valeur. Pour `npm exec`, npm lit ses options jusqu'à `--`, après l'outil aussi : elles sont lues pareil.
// SES LIMITES : une indirection par variable (`npm "$X"` est refusé, `N=npm; $N install` et `bash -c "$S"`
// passent) ; un autre interpréteur (`node -e`, `python -c`) ; un `npx <outil>` SANS version ni `--yes` passe,
// alors que npm suppose `--yes` hors terminal : seul le lockfile installé juste avant le rend sûr (c'est le cas de
// `npx playwright`). Le corps d'un here-doc est lu comme du shell, ligne à ligne : un faux positif s'y règle en
// reformulant. C'est un filet contre le retour des formes qu'on a vues et de leurs variantes, pas un analyseur
// complet de YAML ni de shell.
//
// Résoudre un refus : corriger le workflow. Une action nouvelle s'épingle par SHA, l'étiquette en
// commentaire : `gh api repos/<action>/git/ref/tags/<tag>`. Aucune exception n'est prévue ici.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { lireYaml, ErreurYaml } = require("./lib/yaml-workflow.js");

const RACINE = path.join(__dirname, "..");
const DOSSIER = path.join(RACINE, ".github", "workflows");
const ACTIONS = path.join(RACINE, ".github", "actions");

// ── Les sous-commandes de npm et leurs alias (npm 11.13 : lib/utils/cmd-list.js, relevés le 14/11) ─────────────
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
// Ce que fait la commande, une fois résolue.
const HORS_LOCKFILE = new Set(["install", "install-test", "update", "dedupe", "init"]);
const EXECUTE_LES_SCRIPTS = new Set(["ci", "install-ci-test", "rebuild"]);
const OUTILS_NON_NPM = ["pnpm", "pnpx", "yarn", "bun", "bunx"];
// Les options BOOLÉENNES pures de npm (type Boolean dans @npmcli/config 11.13, relevé le 14/11) admises juste devant
// `--ignore-scripts` : nopt ne prend pour leur valeur qu'un `true` ou un `false` qui les suit, jamais un drapeau.
const BOOLEENS_SURS = new Set(
  ["audit", "fund", "progress", "prefer-offline", "prefer-online", "offline", "legacy-peer-deps", "strict-peer-deps", "dry-run", "foreground-scripts"]
    .flatMap((o) => [`--${o}`, `--no-${o}`]),
);
// Devant l'outil de npx / npm exec, les SEULES options lues (et ce qu'elles disent de `--yes`). Toute autre option
// pourrait prendre l'outil pour sa valeur : npx consomme le mot qui suit une option qu'il ne sait pas booléenne
// (bin/npx-cli.js), et `npx --reg <registre> outil@x` lance outil@x.
const OPTIONS_OUTIL = {
  "--yes": "oui", "-y": "oui", "--yes=true": "oui",
  "--no": "non", "--no-yes": "non", "--no-install": "non", "--yes=false": "non",
  "-q": "neutre", "--quiet": "neutre",
};
// Les shells dont le script `-c` est relu.
const SHELLS = ["bash", "sh", "dash", "zsh", "ksh", "ash", "mksh"];

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

/**
 * Découpe du shell en commandes, puis en mots, comme le shell les lit ; rend aussi où commence le premier
 * commentaire du texte (hors substitution), -1 s'il n'y en a pas :
 *   · les guillemets délimitent les mots — `echo "npm install"` est UN mot pour echo, pas une installation ;
 *   · `;`, `&&`, `||`, `|`, `&`, `(`, `)` et le saut de ligne, hors guillemets, séparent les commandes ;
 *   · un `#` en début de mot ouvre un commentaire, jusqu'à la fin de SA ligne ;
 *   · « \ » suivi d'un saut de ligne continue la ligne (hors guillemets simples), sans rien ajouter au mot ;
 *   · `$( … )` (hors guillemets simples, y compris DANS des guillemets doubles) et les accents graves sont des
 *     commandes à part, lues elles aussi ; dans la commande qui les contient, ils ne sont qu'un mot (`<( … )` et
 *     un sous-shell collé `(npm …)` se lisent par les parenthèses, qui séparent) ;
 *   · `${…}` et `${{ … }}` restent dans leur mot ; `{`, `}` isolés ne sont pas des mots.
 * Un découpage aux accolades coupait `npm ci --prefix "${RUNNER_TEMP}/x" --ignore-scripts` avant le drapeau.
 */
function lexer(source) {
  const toutes = [];
  let commentaire = -1;
  const lire = (texte, racine) => {
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
      const m = mots.filter((x) => !["{", "}"].includes(x));
      if (m.length) cmds.push(m);
      mots = [];
    };
    /** Lit une substitution équilibrée à partir de l'indice qui suit sa `(` ; rend l'indice après la `)`. */
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
      lire(texte.slice(debut, j), false);
      return j + 1;
    };
    while (i < texte.length) {
      const c = texte[i];
      if (c === "#" && !dansMot) {
        if (racine && commentaire < 0) commentaire = i;
        const j = texte.indexOf("\n", i);
        i = j < 0 ? texte.length : j;
        continue;
      }
      if (c === "\n") {
        finCommande();
        i++;
        continue;
      }
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
            if (texte[i + 1] !== "\n") mot += texte[i + 1];
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
            lire(texte.slice(i + 1, fin), false);
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
        lire(texte.slice(i + 1, fin), false);
        mot += "`…`";
        dansMot = true;
        i = fin + 1;
        continue;
      }
      if (c === "\\" && i + 1 < texte.length) {
        if (texte[i + 1] !== "\n") {
          mot += texte[i + 1];
          dansMot = true;
        }
        i += 2;
        continue;
      }
      if (c === ";" || c === "|" || c === "&" || c === "(" || c === ")") {
        finCommande();
        i += (c === ";" || c === "|" || c === "&") && texte[i + 1] === c ? 2 : 1;
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
  lire(source, true);
  return { cmds: toutes, commentaire };
}
const commandes = (texte) => lexer(texte).cmds;
const estOutil = (mot, nom) => mot === nom || mot.endsWith("/" + nom);

/**
 * Les commandes d'un texte, et celles qu'il fait lancer par un shell : le script de `bash -c '…'`, `sh -ec "…"`,
 * et ce qu'`eval` reçoit, sont relus (trois niveaux au plus). Un script passé par variable (`bash -c "$S"`) ne
 * l'est pas : c'est une des limites dites en tête.
 */
function commandesProfondes(texte, profondeur = 0) {
  const sortie = [];
  for (const m of commandes(texte)) {
    sortie.push(m);
    if (profondeur >= 3) continue;
    for (let k = 0; k < m.length; k++) {
      if (!SHELLS.some((s) => estOutil(m[k], s))) continue;
      let avecC = false;
      for (let j = k + 1; j < m.length; j++) {
        const x = m[j];
        if (/^[-+][oO]$|^--(?:rcfile|init-file)$/.test(x)) {
          j++;
          continue;
        }
        if (/^-[A-Za-z]+$/.test(x)) {
          if (x.includes("c")) avecC = true;
          continue;
        }
        if (/^[-+]/.test(x)) continue;
        if (avecC) sortie.push(...commandesProfondes(x, profondeur + 1));
        break;
      }
    }
    const iEval = m.findIndex((x) => estOutil(x, "eval"));
    if (iEval >= 0 && iEval + 1 < m.length) sortie.push(...commandesProfondes(m.slice(iEval + 1).join(" "), profondeur + 1));
  }
  return sortie;
}

/**
 * Les lignes logiques d'un texte de shell, comme bash les réunit : un « \ » qui est le DERNIER caractère de la
 * ligne (non échappé) s'efface avec le saut de ligne, et la ligne suivante s'y colle (`npm c\` puis `i`, c'est
 * `npm ci`) ; suivi d'une espace, il n'échappe que l'espace. Pas dans un commentaire (une ligne de commentaire
 * comprise) : `npm ci --ignore-scripts # x \` puis `npm install left-pad` sont deux commandes, et la jonction
 * faite avant la coupe du commentaire avalait la seconde.
 */
function lignesLogiques(lignes) {
  const sortie = [];
  const code = (x) => {
    const k = lexer(x).commentaire;
    return k < 0 ? x : x.slice(0, k);
  };
  const continuee = (x) => /(?:^|[^\\])(?:\\\\)*\\$/.test(x);
  for (let i = 0; i < lignes.length; i++) {
    const debut = lignes[i].n;
    let l = lignes[i].l;
    let c = code(l);
    while (continuee(c) && i + 1 < lignes.length) {
      i++;
      l = c.slice(0, -1) + lignes[i].l;
      c = code(l);
    }
    sortie.push({ n: debut, l });
  }
  return sortie;
}

/** Le script sans le corps de ses here-docs (relu ligne à ligne, lui) : pour la lecture d'un seul tenant. */
function sansHereDocs(texte) {
  const lignes = texte.split("\n");
  const sortie = [];
  for (let i = 0; i < lignes.length; i++) {
    sortie.push(lignes[i]);
    const fins = [...lignes[i].matchAll(/(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/g)].map((m) => ({ tab: m[1] === "-", mot: m[3] }));
    for (const f of fins) {
      i++;
      while (i < lignes.length && (f.tab ? lignes[i].replace(/^\t+/, "") : lignes[i]).trim() !== f.mot) i++;
    }
  }
  return sortie.join("\n");
}

/**
 * `--ignore-scripts` lu avec certitude : `{ actif, forme }`. N'est lue que la forme `--ignore-scripts` (ou
 * `--ignore-scripts=true`), avant tout `--`, précédée de la sous-commande, d'un mot qui n'est pas une option, d'une
 * option à `=` ou d'un booléen pur (une option à valeur la prendrait pour sa valeur : `--prefix --ignore-scripts`),
 * et sans un `false` derrière elle (nopt le lui prend). Toute autre forme qui la touche — négation (`--no-…`, en
 * majuscules aussi), abréviation (`--ig`), autre valeur (`=1`, `=false`) — est une lecture incertaine. Dans
 * l'environnement, seule `npm_config_ignore_scripts=true` compte ; la ligne de commande l'emporte sur lui.
 */
function ignoreScripts(avant, options) {
  let env;
  for (const a of avant) {
    const e = /^npm_config_ignore[_-]scripts=(.*)$/i.exec(a);
    if (e) env = e[1];
  }
  let cli = false;
  for (let k = 0; k < options.length; k++) {
    const x = options[k];
    if (!x.startsWith("-")) continue;
    const nom = x.replace(/^-+/, "").split("=")[0].toLowerCase().replace(/^(?:no-)+/, "");
    if (nom.length < 2 || !"ignore-scripts".startsWith(nom)) continue;
    if (x !== "--ignore-scripts" && x !== "--ignore-scripts=true") return { actif: false, forme: x };
    const prec = k > 0 ? options[k - 1] : null;
    if (prec !== null && prec.startsWith("-") && !prec.includes("=") && !BOOLEENS_SURS.has(prec)) return { actif: false, forme: `${prec} ${x}` };
    if (x === "--ignore-scripts" && options[k + 1] === "false") return { actif: false, forme: `${x} false` };
    cli = true;
  }
  if (cli) return { actif: true };
  if (env === undefined) return { actif: false };
  if (env === "true") return { actif: true };
  return { actif: false, forme: `npm_config_ignore_scripts=${env}` };
}

/**
 * L'outil de `npx` ou de `npm exec`, et ce qui le fait télécharger. Devant l'outil, seules les options
 * d'OPTIONS_OUTIL sont lues ; pour `npm exec`, npm lit ses options jusqu'à `--`, après l'outil aussi.
 */
function auditerOutil(nom, mots, { npmExec }) {
  const d = [];
  let spec;
  for (let j = 0; j < mots.length; j++) {
    const x = mots[j];
    if (x === "--") {
      if (spec === undefined) spec = mots[j + 1];
      break;
    }
    if (!x.startsWith("-")) {
      if (spec === undefined) spec = x;
      if (!npmExec) break; // npx : ce qui suit l'outil est à l'outil
      continue;
    }
    if (x === "-p" || x === "--package" || x.startsWith("--package=") || x.startsWith("-p=")) {
      d.push(`\`${nom} --package\` installe un paquet hors lockfile`);
      break;
    }
    const sens = OPTIONS_OUTIL[x];
    if (sens === undefined) {
      d.push(`\`${nom} ${x}\` : option que la gate ne lit pas${spec === undefined ? " devant l'outil (elle pourrait le prendre pour sa valeur)" : ""} — écrire \`${nom} <outil>\``);
      break;
    }
    if (sens === "oui") d.push(`\`${nom} --yes\` installe la dernière version publiée`);
    if (!x.includes("=") && /^(?:true|false|null)$/.test(mots[j + 1] || "")) {
      d.push(`\`${nom} ${x} ${mots[j + 1]}\` : valeur séparée que la gate ne lit pas`);
      break;
    }
  }
  if (spec !== undefined && /[$`]/.test(spec)) d.push(`\`${nom} ${spec}\` : outil variable, que la gate ne lit pas`);
  else if (specTelechargee(spec)) d.push(`\`${nom} ${spec}\` télécharge l'outil hors lockfile`);
  return d;
}

/** Défauts d'une commande du shell (une liste de mots) : npm, npx, et les outils d'installation hors npm. */
function auditerCommande(m) {
  const d = [];
  const autre = m.find((x) => OUTILS_NON_NPM.some((o) => estOutil(x, o)));
  if (autre) d.push(`\`${autre.split("/").pop()}\` : le dépôt n'installe que par npm (\`npm ci --ignore-scripts\` sur un lockfile)`);

  const iNpx = m.findIndex((x) => estOutil(x, "npx"));
  if (iNpx >= 0) d.push(...auditerOutil("npx", m.slice(iNpx + 1), { npmExec: false }));

  const iNpm = m.findIndex((x) => estOutil(x, "npm"));
  if (iNpm < 0) return d;
  const args = m.slice(iNpm + 1);
  if (!args.length) return d;
  if (args[0].startsWith("-")) {
    // Rien que des options (`npm --version`) : aucune sous-commande ne tourne.
    if (args.some((x) => !x.startsWith("-"))) {
      d.push(`\`npm ${args.join(" ")}\` : une option précède la sous-commande — sa valeur, un raccourci, une abréviation ou un \`--\` déplacent la sous-commande, que la gate ne lit donc pas : écrire \`npm <sous-commande> [options]\``);
    }
    return d;
  }
  if (/[$`]/.test(args[0])) {
    d.push(`\`npm ${args[0]}\` : sous-commande variable, que la gate ne lit pas`);
    return d;
  }
  const sous = commandeNpm(args[0]);
  if (!sous) return d; // npm refuse une sous-commande inconnue : rien ne tourne
  const reste = args.slice(1);
  const fin = reste.findIndex((x) => /^-{2,}$/.test(x));
  const options = fin < 0 ? reste : reste.slice(0, fin);
  if (HORS_LOCKFILE.has(sous)) {
    if (options.includes("--no-save")) d.push("`npm install --no-save` ignore le lockfile");
    else d.push(`\`npm ${sous}\` installe hors lockfile (la dernière version publiée de chaque dépendance) — en CI, \`npm ci --ignore-scripts\` sur un lockfile versionné`);
  } else if (EXECUTE_LES_SCRIPTS.has(sous)) {
    const lu = ignoreScripts(m.slice(0, iNpm), options);
    if (!lu.actif) {
      const forme = lu.forme ? ` lu avec certitude (forme non lue : \`${lu.forme}\`)` : "";
      d.push(`\`npm ${sous}\` sans \`--ignore-scripts\`${forme} — les scripts d'installation de chaque paquet tourneraient sur le runner`);
    }
  } else if (sous === "exec") {
    d.push(...auditerOutil(`npm ${args[0]}`, reste, { npmExec: true }));
  } else if (sous === "audit" && options.includes("fix")) {
    d.push("`npm audit fix` réécrit l'arbre hors lockfile relu");
  }
  return d;
}

/**
 * Les commandes d'un texte de shell, situées par leur ligne dans le texte (1 = première) : lu ligne logique par
 * ligne logique, et, si `entier`, aussi d'un seul tenant (`tenant`) — une chaîne entre guillemets sur plusieurs
 * lignes cache, à la lecture par ligne, ce qui suit sa fermeture ; le corps des here-docs reste à la lecture par ligne.
 */
function commandesDuShell(texte, { entier }) {
  const sortie = [];
  const lignes = texte.split("\n").map((l, i) => ({ n: i + 1, l }));
  for (const { n, l } of lignesLogiques(lignes)) for (const mots of commandesProfondes(l)) sortie.push({ n, mots, tenant: false });
  if (entier) for (const mots of commandesProfondes(sansHereDocs(texte))) sortie.push({ n: 1, mots, tenant: true });
  return sortie;
}

/** Les défauts d'un texte de shell, situés comme ses commandes ; la lecture d'un seul tenant n'ajoute que du neuf. */
function defautsDuShell(texte, { entier }) {
  const sortie = [];
  const vus = new Set();
  for (const { n, mots, tenant } of commandesDuShell(texte, { entier })) {
    for (const d of auditerCommande(mots)) {
      if (tenant && vus.has(d)) continue;
      vus.add(d);
      sortie.push({ n, d: tenant ? `${d} (lecture du script d'un seul tenant)` : d });
    }
  }
  return sortie;
}

/** Chaque chaîne de l'arbre YAML, avec son chemin de clés, dans l'ordre du document. */
function parcourir(noeud, chemin, visite) {
  if (typeof noeud === "string") visite(noeud, chemin);
  else if (Array.isArray(noeud)) noeud.forEach((x, i) => parcourir(x, chemin.concat(i), visite));
  else if (noeud && typeof noeud === "object") for (const k of Object.keys(noeud)) parcourir(noeud[k], chemin.concat(k), visite);
}

/** Les `run:` qui ne sont pas une chaîne (hors `defaults: run:`, un mapping légitime) : GitHub n'en lit aucun. */
function runsNonChaines(noeud, chemin = [], sortie = []) {
  if (Array.isArray(noeud)) noeud.forEach((x, i) => runsNonChaines(x, chemin.concat(i), sortie));
  else if (noeud && typeof noeud === "object") {
    for (const k of Object.keys(noeud)) {
      if (k === "run" && typeof noeud[k] !== "string" && chemin[chemin.length - 1] !== "defaults") sortie.push(chemin.concat(k).join("."));
      runsNonChaines(noeud[k], chemin.concat(k), sortie);
    }
  }
  return sortie;
}

/** Les lignes du fichier qui sont le contenu d'un scalaire en bloc (`|`, `>`) : une clé ne s'y cherche pas. */
function lignesDeBloc(lignes) {
  const dedans = new Array(lignes.length).fill(false);
  for (let i = 0; i < lignes.length; i++) {
    if (dedans[i]) continue;
    const m = /^(\s*)(?:-\s+)?(?:[^\s#'"][^:#]*?|"[^"]*"|'[^']*')\s*:\s+[|>][-+]?\s*(?:#.*)?$/.exec(lignes[i]) || /^(\s*)-\s+[|>][-+]?\s*(?:#.*)?$/.exec(lignes[i]);
    if (!m) continue;
    for (let j = i + 1; j < lignes.length; j++) {
      if (lignes[j].trim() === "") {
        dedans[j] = true;
        continue;
      }
      if (lignes[j].length - lignes[j].trimStart().length <= m[1].length) break;
      dedans[j] = true;
    }
  }
  return dedans;
}
const echapperRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Situe une valeur dans le fichier : la ligne de sa clé, cherchée À PARTIR DE LA DERNIÈRE TROUVÉE (ligne et
 * colonne : plusieurs clés d'un `{ … }` en ligne se suivent sur la même ligne), en forme bloc (`clé:` en début de
 * ligne) comme en ligne (`{ clé: …`), hors contenu de bloc ; et si la valeur est un bloc littéral `|` (sa ligne n
 * est alors la ligne de la clé + n). Un élément de séquence, ou une clé introuvable, se cherche par le début de sa
 * valeur, sans déplacer le curseur ; sinon `?`. Un curseur qui reculait faisait dériver toutes les lignes suivantes.
 */
function localisateur(lignes) {
  const bloc = lignesDeBloc(lignes);
  let ligneCur = 0;
  let colCur = 0;
  return (cle, valeur, dansSequence) => {
    if (typeof cle === "string" && !dansSequence) {
      const c = echapperRe(cle);
      const re = new RegExp(`(^\\s*(?:-\\s+)?|[{,]\\s*)(?:${c}|"${c}"|'${c}')\\s*:(?=\\s|$)`, "g");
      for (let i = ligneCur; i < lignes.length; i++) {
        if (bloc[i]) continue;
        re.lastIndex = i === ligneCur ? colCur : 0;
        const m = re.exec(lignes[i]);
        if (!m) continue;
        ligneCur = i;
        colCur = m.index + m[0].length;
        return { ligne: i + 1, litteral: m.index === 0 && /:\s+\|[-+]?\s*(?:#.*)?$/.test(lignes[i]) };
      }
    }
    const debut = (String(valeur).split("\n").find((l) => l.trim()) || "").trim().slice(0, 40);
    if (!debut) return { ligne: null, litteral: false };
    let k = lignes.findIndex((l, i) => i >= ligneCur && l.includes(debut));
    if (k < 0) k = lignes.findIndex((l) => l.includes(debut));
    return { ligne: k >= 0 ? k + 1 : null, litteral: false };
  };
}

/**
 * Lit un workflow (ou une action composite) par le lecteur YAML fermé et rend, pour chaque chaîne (sauf un `name:`),
 * ses commandes de shell : `{ ligne, mots, run }`. Lève ErreurYaml sur une forme que le lecteur ne prend pas.
 */
function chainesDuWorkflow(texte) {
  const doc = lireYaml(texte);
  const lignes = texte.split(/\r?\n/);
  const situer = localisateur(lignes);
  const sortie = [];
  parcourir(doc, [], (valeur, chemin) => {
    const cle = [...chemin].reverse().find((x) => typeof x === "string");
    if (cle === "name" && typeof chemin[chemin.length - 1] === "string") return;
    const { ligne, litteral } = situer(cle, valeur, typeof chemin[chemin.length - 1] === "number");
    sortie.push({ valeur, chemin, cle, ligne, litteral, run: cle === "run" && chemin[chemin.length - 1] === "run" });
  });
  return { doc, chaines: sortie };
}

/**
 * Toutes les commandes de shell d'un workflow, lues comme la gate les lit : `{ ligne, mots }`. Le banc
 * outils-ci-figes s'en sert pour la CLI de Netlify. Lève ErreurYaml sur une forme que le lecteur ne prend pas.
 */
function commandesDuWorkflow(texte) {
  const sortie = [];
  for (const { valeur, ligne, litteral, run } of chainesDuWorkflow(texte).chaines) {
    for (const { n, mots } of commandesDuShell(valeur, { entier: run })) sortie.push({ ligne: ligne === null ? null : litteral ? ligne + n : ligne, mots });
  }
  return sortie;
}

/** Règles sur un texte de workflow : rend la liste des défauts, sans lire le disque. */
function auditerWorkflow(nom, texte) {
  const defauts = [];
  let lu;
  try {
    lu = chainesDuWorkflow(texte);
  } catch (e) {
    if (!(e instanceof ErreurYaml)) throw e;
    return [`${nom}:${e.ligne ?? "?"} : YAML que la gate ne lit pas (${e.message.replace(/ \(ligne \d+\)$/, "")}) — une forme qu'elle ne lit pas n'est jamais admise : l'écrire sans ancre, alias ni étiquette, un script en bloc \`|\``];
  }
  for (const chemin of runsNonChaines(lu.doc)) defauts.push(`${nom}:? : \`${chemin}\` n'est pas une chaîne — forme que la gate ne lit pas`);
  for (const { valeur, cle, ligne, litteral, run } of lu.chaines) {
    const ou = (n) => `${nom}:${ligne === null ? "?" : litteral ? ligne + n : ligne}`;
    if (cle === "uses" && !valeur.startsWith("./") && !/@[0-9a-f]{40}$/.test(valeur)) defauts.push(`${ou(0)} : action non épinglée par SHA (${valeur})`);
    if (cle === "version" && /^latest$/i.test(valeur.trim())) defauts.push(`${ou(0)} : \`version: latest\` n'est pas figé`);
    for (const { n, d } of defautsDuShell(valeur, { entier: run })) defauts.push(`${ou(n)} : ${d}`);
    if (run) {
      // Une interpolation d'événement ne doit jamais entrer dans le texte d'un `run:`, bloc ou ligne.
      valeur.split("\n").forEach((l, i) => {
        if (/^\s*#/.test(l)) return;
        const e = /\$\{\{\s*(github\.event\.(?!number\b)[^}]*?|github\.head_ref)\s*\}\}/.exec(l);
        if (e && !/\.number\b|\.id\b/.test(e[1])) defauts.push(`${ou(i + 1)} : \`${e[1].trim()}\` interpolé dans un run: (passer par env:)`);
      });
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
    const parcourirDisque = (rel) => {
      for (const e of fs.readdirSync(path.join(racine, rel), { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) parcourirDisque(r);
        else tous.push(r);
      }
    };
    parcourirDisque("");
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

/**
 * Les actions composites lues : tout action.yml sous .github/actions/, et celles que les workflows citent par
 * `uses: ./…` — `uses: ./` désigne l'action.yml de la racine (la forme même de la documentation de GitHub).
 */
function actionsComposites(textes, { actions, racine }) {
  const trouves = new Set();
  if (fs.existsSync(actions)) {
    const parcourirDisque = (abs) => {
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const a = path.join(abs, e.name);
        if (e.isDirectory()) parcourirDisque(a);
        else if (/^action\.ya?ml$/.test(e.name)) trouves.add(path.relative(racine, a).split(path.sep).join("/"));
      }
    };
    parcourirDisque(actions);
  }
  for (const t of textes) {
    const locales = new Set();
    for (const m of t.matchAll(/^\s*(?:-\s*)?uses:\s*['"]?\.\/([^\s@#'"]*)/gm)) locales.add(m[1]);
    try {
      parcourir(lireYaml(t), [], (v, chemin) => {
        if (chemin[chemin.length - 1] === "uses" && v.startsWith("./")) locales.add(v.slice(2).trim());
      });
    } catch {
      // illisible : la gate le refuse déjà, au fichier lui-même
    }
    for (const local of locales) {
      for (const f of ["action.yml", "action.yaml"]) {
        const rel = path.posix.join(local.replace(/\/+$/, "") || ".", f);
        if (rel.startsWith("..")) continue;
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
  console.log(`✓ audit-workflows : ${fichiers.length} workflows et ${composites.length} action(s) composite(s) lus en entier — aucune installation npm ou npx hors lockfile, aucun outil d'installation hors npm, aucune action flottante, aucune injection, canal de l'agent sans jeton personnel`);
}

module.exports = {
  auditerWorkflow, auditerCanalAgent, auditerDepot, auditerFichiersDetournants, auditerCommande, commandes,
  commandesProfondes, lignesLogiques, defautsDuShell, chainesDuWorkflow, commandesDuWorkflow, actionsComposites,
  fichiersDuDepot, commandeNpm,
};
