#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AUDIT DES WORKFLOWS — ce qui ne doit pas revenir dans .github/workflows (audit de sécurité 2026-11-06).
//
// Gate statique, sans réseau, inscrit dans `npm run verif`. Chaque règle a un résultat réel derrière :
//   · une installation npm hors lockfile (2026-11-14) : `npm install netlify-cli@27.1.2` figeait la CLI, pas ses
//     ~1 120 dépendances — le déploiement de production a rougi sur une dépendance publiée une minute plus tôt,
//     et une version malveillante serait entrée aussi vite, avec le jeton. En CI, on installe par
//     `npm ci --ignore-scripts` sur un lockfile versionné. Sont refusés :
//       - `npm install` et ses alias, `update`, `dedupe`, `init`/`create`, `link <paquet>`, `audit fix` ;
//       - `npm ci`, `install-ci-test`, `rebuild`, `uninstall`, `prune`, `edit` et `link` sans `--ignore-scripts`
//         lu avec certitude ;
//       - `npx` et `npm exec` qui téléchargent : `--yes`, `--package`, un outil versionné (`outil@x`) ou hors
//         registre (git, URL, archive, `org/dépôt`) ; `npm pack`, `cache` et `diff` d'un paquet hors registre ;
//       - pnpm, yarn, bun, bunx, pnpx : le dépôt n'installe que par npm.
//     Chaque sous-commande de npm 11.13 est rangée dans CLASSE_NPM, et une épreuve vérifie qu'aucune n'y manque ;
//   · un fichier qui détournerait `npm ci` ou l'envoi : un `npm-shrinkwrap.json` (il prime sur package-lock.json),
//     un `.npmrc` (registre, scripts, jetons), ou un `.netlify/` à la racine (la CLI y prend des fonctions
//     « internes », les regroupe et exécute leur code avec le jeton), suivis par git ;
//   · une action sans SHA, ou un binaire en `version: latest`, qui reçoit un secret ;
//   · du texte d'un événement interpolé dans un `run:` (injection shell : edge-functions.yml) ;
//   · un jeton personnel dans une étape qui exécute le code du dépôt, dans le job de l'agent :
//     l'agent venait d'y écrire, et `node scripts/…` lançait ce qu'il avait laissé (E-02) ;
//   · une auto-fusion dans le canal de l'agent : du texte d'un inconnu jusqu'à la production (E-01) ;
//   · un shell de l'agent CI sur `git log`, `git diff`, `git show` (`--output=` écrit un fichier).
// Les actions composites du dépôt passent par les mêmes règles : celles de .github/actions/**, et celles que cite
// un `uses: ./…` (la racine `./` comprise), d'un workflow ou d'une action composite déjà lue.
//
// CE QUE LA GATE LIT (relectures adverses des 14 et 15/11) :
//   · Le YAML passe par le lecteur fermé du dépôt (scripts/lib/yaml-workflow.js) : une ancre, un alias, une
//     étiquette, un scalaire simple ou cité sur plusieurs lignes, une collection en ligne imbriquée, un indicateur
//     d'indentation explicite, un saut de ligne autre que LF ou CRLF la rendent rouge (« YAML que la gate ne lit
//     pas »).
//   · Toute valeur du fichier est lue comme du shell — `run:`, mais aussi `with:` (une action de relance lance une
//     commande), `env:` et une matrice (une commande posée là, qu'un `$CMD` ou un `${{ matrix.x }}` lance) — sauf
//     les libellés que GitHub n'exécute jamais : le nom du workflow, d'un job ou d'une étape, `run-name`, les
//     `description` (estLibelle). Un `name:` sous `env:`, `with:` ou dans une matrice est une valeur comme une autre.
//   · Chaque valeur est lue deux fois, et les deux lectures comptent : ligne logique par ligne logique (un « \ »
//     final continue la ligne, hors commentaire) ; puis d'un seul tenant, comme bash la lit — guillemets sur
//     plusieurs lignes, here-docs, redirections (le mot visé par `>` n'est pas un argument).
//   · Le script passé à un shell est relu : `bash -c`/`sh -c` quelles que soient les options (`-eo pipefail -c`),
//     `eval`, une here-string (`bash <<< '…'`), un here-doc donné à un shell, la commande de `npm explore`. Un shell
//     qui lit son script sur un tube (`… | bash`, `curl … | sh`) est REFUSÉ : ce script-là ne se lit pas.
//   · npm : chaque mot `npm` d'une commande est jugé (`env -C d npm install`, `npm exec -- npm ci`). La
//     sous-commande doit le suivre : une option placée avant elle est refusée (sa valeur, un raccourci, une
//     abréviation ou un `--` la déplacent, et la gate ne rejoue pas l'analyseur d'options de npm) ; une
//     sous-commande variable, en expression ou en accolades aussi.
//   · `--ignore-scripts` n'est lu que sous la forme `--ignore-scripts` (ou `=true`), écrite en clair, avant tout
//     `--`, hors de portée d'une option qui prendrait le mot suivant pour valeur. Une forme qui le touche
//     (négation, abréviation, autre valeur, majuscules, variable ou accolades dans le nom) est refusée.
//   · npx et npm exec : devant l'outil, seules `--yes`/`-y` (refusées), `--no-install`, `--yes=false`, `-q` et
//     `--quiet` sont lues, et `--no`/`--no-yes` pour `npm exec` (npx, lui, prend l'outil pour leur valeur) ; une
//     autre option est refusée. `xargs` devant npm ou npx est refusé : il fabrique leurs arguments.
// SES LIMITES. C'est un filet contre le retour, par mégarde ou par habitude, des formes d'installation qu'on a
// vues et de leurs variantes naturelles — pas une barrière contre un auteur de workflow qui voudrait la contourner :
// celui-là a déjà la main sur la CI, et c'est la revue qui le voit. Elle ne voit pas :
//   · une commande recomposée : par variable (`N=npm; $N install`, `bash -c "$S"`), par expansion d'accolades
//     (`{npm,} install`), par une expression `${{ … }}` que GitHub évalue avant bash (seule celle qui n'est qu'un
//     texte cité, `${{ 'npm' }}`, est remplacée par ce texte, comme GitHub le fait) ;
//   · un autre interpréteur (`node -e`, `python -c`), un script lu dans un fichier (`bash x.sh`, les scripts de
//     package.json lancés par `npm run`), un shell nourri par une substitution de processus (`tee >(bash)`) ;
//   · un `npx <outil>` SANS version ni `--yes` : npm suppose `--yes` hors terminal, et seul le lockfile installé
//     juste avant le rend sûr (c'est le cas de `npx playwright`).
// Elle refuse aussi parfois à tort : le corps d'un here-doc qui n'est pas donné à un shell est lu comme du shell,
// ligne à ligne ; une prose (un `prompt:`, un `body:`, un script de github-script) qui cite une commande npm aussi,
// guillemets YAML compris ; un motif de `case` qui nomme yarn, pnpm ou bun. Un tel refus se règle en reformulant :
// une commande citée entre guillemets doubles (`"npm ci"`) est un seul mot pour le shell.
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
// Ce que fait chaque sous-commande, une fois résolue (lu dans les sources de npm 11.13, le 15/11) :
//   hors    : installe hors lockfile (la dernière version publiée) ;
//   scripts : réifie node_modules (depuis le lockfile) ou relance des paquets : leurs scripts tournent, sauf
//             `--ignore-scripts` — `uninstall` et `prune` réinstallent l'arbre, `edit` finit par `rebuild` ;
//   link    : `link <paquet>` l'installe depuis le registre (hors) ; `link` seul lance les scripts du projet lié ;
//   exec    : lance un outil (npx) ; explore : lance une commande dans le dossier d'un paquet (relue) ;
//   audit   : `audit fix` réécrit l'arbre ; spec : une spécification hors registre fait cloner et préparer le
//             paquet, ses scripts compris ;
//   neutre  : n'installe rien, et ne lance que les scripts du projet lui-même (`run`, `test`, `version`…).
const CLASSE_NPM = {
  install: "hors", "install-test": "hors", update: "hors", dedupe: "hors", init: "hors",
  ci: "scripts", "install-ci-test": "scripts", rebuild: "scripts", uninstall: "scripts", prune: "scripts", edit: "scripts",
  link: "link", exec: "exec", explore: "explore", audit: "audit", pack: "spec", cache: "spec", diff: "spec",
  access: "neutre", adduser: "neutre", bugs: "neutre", completion: "neutre", config: "neutre", deprecate: "neutre",
  "dist-tag": "neutre", docs: "neutre", doctor: "neutre", explain: "neutre", "find-dupes": "neutre", fund: "neutre",
  get: "neutre", help: "neutre", "help-search": "neutre", ll: "neutre", login: "neutre", logout: "neutre", ls: "neutre",
  org: "neutre", outdated: "neutre", owner: "neutre", ping: "neutre", pkg: "neutre", prefix: "neutre", profile: "neutre",
  publish: "neutre", query: "neutre", repo: "neutre", restart: "neutre", root: "neutre", run: "neutre", sbom: "neutre",
  search: "neutre", set: "neutre", shrinkwrap: "neutre", star: "neutre", stars: "neutre", start: "neutre", stop: "neutre",
  team: "neutre", test: "neutre", token: "neutre", trust: "neutre", undeprecate: "neutre", unpublish: "neutre",
  unstar: "neutre", version: "neutre", view: "neutre", whoami: "neutre",
};
const OUTILS_NON_NPM = ["pnpm", "pnpx", "yarn", "bun", "bunx"];
// Les options BOOLÉENNES pures de npm (type Boolean dans @npmcli/config 11.13, relevé le 14/11) admises juste devant
// `--ignore-scripts` : nopt ne prend pour leur valeur qu'un `true` ou un `false` qui les suit, jamais un drapeau.
const BOOLEENS_SURS = new Set(
  ["audit", "fund", "progress", "prefer-offline", "prefer-online", "offline", "legacy-peer-deps", "strict-peer-deps", "dry-run", "foreground-scripts"]
    .flatMap((o) => [`--${o}`, `--no-${o}`]),
);
// Devant l'outil de npx / npm exec, les SEULES options lues (et ce qu'elles disent de `--yes`). Toute autre option
// pourrait prendre l'outil pour sa valeur : npx consomme le mot qui suit une option qu'il ne range pas parmi ses
// booléens (bin/npx-cli.js) — `npx --reg <registre> outil@x` lance outil@x, et `npx --no outil --package=…` aussi
// (le raccourci `--no` devient `--no-yes`, que npx ne range pas parmi ses booléens). `npm exec`, lui, passe par nopt,
// qui lit `--no`/`--no-yes` comme des booléens.
const OPTIONS_OUTIL = {
  "--yes": "oui", "-y": "oui", "--yes=true": "oui",
  "--no-install": "non", "--yes=false": "non",
  "-q": "neutre", "--quiet": "neutre",
};
const OPTIONS_EXEC = { ...OPTIONS_OUTIL, "--no": "non", "--no-yes": "non" };
// Les shells dont le script est relu, et les enveloppes qui lancent une commande telle quelle (`sudo bash`).
const SHELLS = ["bash", "sh", "dash", "zsh", "ksh", "ash", "mksh"];
const ENVELOPPES = ["env", "sudo", "doas", "timeout", "nice", "nohup", "stdbuf", "time", "command", "exec", "setsid", "ionice", "chrt", "taskset", "unbuffer", "builtin"];

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

/** Une spécification hors du registre npm : git, URL, raccourci `org/dépôt` (GitHub). */
const specHorsRegistre = (spec) =>
  /^(?:git\+|git:|github:|gitlab:|bitbucket:|gist:|https?:)/.test(spec) || /^[^@./~$\-][^/\s:]*\/[^/\s]+$/.test(spec);
/** Une spécification d'outil qui fait télécharger : versionnée, ou hors du registre (git, URL, archive, org/dépôt). */
function specTelechargee(spec) {
  if (!spec) return false;
  return /^(?:@[^/@\s]+\/)?[^/@\s]+@.+$/.test(spec) || specHorsRegistre(spec) || /^file:/.test(spec) || /\.(?:tgz|tar\.gz)$/.test(spec);
}

// ── Le shell, comme bash le lit ────────────────────────────────────────────────────────────────────────────────
const CTRL = (n) => String.fromCharCode(n);
const ECHAPPEMENTS_ANSI = { a: CTRL(7), b: CTRL(8), e: CTRL(27), E: CTRL(27), f: CTRL(12), n: "\n", r: CTRL(13), t: "\t", v: CTRL(11), "\\": "\\", "'": "'", '"': '"', "?": "?" };
/** Le texte d'un `$'…'` à partir de l'indice qui suit `$'`, décodé comme bash le décode ; et l'indice qui suit sa fermeture. */
function ansiC(texte, i) {
  let valeur = "";
  while (i < texte.length && texte[i] !== "'") {
    if (texte[i] !== "\\" || i + 1 >= texte.length) {
      valeur += texte[i++];
      continue;
    }
    const n = texte[i + 1];
    let m;
    if (Object.prototype.hasOwnProperty.call(ECHAPPEMENTS_ANSI, n)) {
      valeur += ECHAPPEMENTS_ANSI[n];
      i += 2;
    } else if ((m = /^[0-7]{1,3}/.exec(texte.slice(i + 1, i + 4)))) {
      valeur += String.fromCharCode(parseInt(m[0], 8) & 0xff);
      i += 1 + m[0].length;
    } else if (n === "x" && (m = /^[0-9A-Fa-f]{1,2}/.exec(texte.slice(i + 2, i + 4)))) {
      valeur += String.fromCharCode(parseInt(m[0], 16));
      i += 2 + m[0].length;
    } else if ((n === "u" || n === "U") && (m = (n === "u" ? /^[0-9A-Fa-f]{1,4}/ : /^[0-9A-Fa-f]{1,8}/).exec(texte.slice(i + 2, i + 10)))) {
      const point = parseInt(m[0], 16);
      if (point <= 0x10ffff) valeur += String.fromCodePoint(point);
      i += 2 + m[0].length;
    } else if (n === "c" && i + 2 < texte.length) {
      valeur += CTRL(texte.charCodeAt(i + 2) & 0x1f);
      i += 3;
    } else {
      valeur += "\\" + n;
      i += 2;
    }
  }
  return { valeur, fin: Math.min(i + 1, texte.length) };
}
/** L'indice du `"` qui ferme des guillemets doubles ouverts juste avant `j` (ou la fin du texte). */
function finGuillemets(texte, j) {
  for (; j < texte.length; j++) {
    const c = texte[j];
    if (c === "\\") j++;
    else if (c === '"') return j;
    else if (c === "$" && texte[j + 1] === "(") j = finSubstitution(texte, j + 2);
    else if (c === "`") {
      const k = texte.indexOf("`", j + 1);
      j = k < 0 ? texte.length : k;
    }
  }
  return texte.length;
}
/**
 * L'indice de la `)` qui ferme une substitution ouverte juste avant `debut` (ou la fin du texte) : guillemets,
 * `$'…'`, « \ », commentaires et sous-substitutions sautés ; dans un `case … esac`, la `)` d'un motif ne ferme rien.
 */
function finSubstitution(texte, debut) {
  let prof = 1;
  let cas = 0;
  let debutMot = true;
  for (let j = debut; j < texte.length; j++) {
    const c = texte[j];
    if (c === "\\") {
      j++;
      debutMot = false;
      continue;
    }
    if (c === "'") {
      const k = texte.indexOf("'", j + 1);
      j = k < 0 ? texte.length : k;
      debutMot = false;
      continue;
    }
    if (c === "$" && texte[j + 1] === "'") {
      j = ansiC(texte, j + 2).fin - 1;
      debutMot = false;
      continue;
    }
    if (c === '"') {
      j = finGuillemets(texte, j + 1);
      debutMot = false;
      continue;
    }
    if (c === "`") {
      const k = texte.indexOf("`", j + 1);
      j = k < 0 ? texte.length : k;
      debutMot = false;
      continue;
    }
    if (debutMot && c === "#") {
      const k = texte.indexOf("\n", j);
      j = k < 0 ? texte.length : k - 1;
      continue;
    }
    if (debutMot && /^case[ \t\n]/.test(texte.slice(j, j + 5))) cas++;
    if (debutMot && /^esac(?![^ \t\n;&|)])/.test(texte.slice(j, j + 5)) && cas > 0) cas--;
    if (c === "(") prof++;
    else if (c === ")" && !(cas > 0 && prof === 1) && --prof === 0) return j;
    debutMot = /[ \t\n;&|()]/.test(c);
  }
  return texte.length;
}

/**
 * Découpe du shell en commandes, puis en mots, comme bash les lit. Rend `{ cmds, commentaire }` : chaque commande
 * est une liste de mots qui porte aussi `ligne` (celle de son premier mot, 1 = première du texte), `redirs` (ses
 * redirections : `{ op, cible, corps }`, le corps étant celui d'un here-doc) et `tube` (elle lit, par `|`, la sortie
 * de la précédente) ; `commentaire` est la position du premier commentaire du texte (hors substitution), -1 sinon.
 *   · seuls l'espace, la tabulation et le saut de ligne séparent les mots (un blanc Unicode est une lettre, pour
 *     bash) ; les guillemets délimitent — `echo "npm install"` est UN mot pour echo, pas une installation ;
 *   · `;`, `&`, `|`, `(`, `)` et le saut de ligne séparent les commandes ; `<` et `>` ouvrent une redirection, dont
 *     le mot visé n'est pas un argument (`npm ci > --ignore-scripts` écrit dans un fichier nommé ainsi) ;
 *   · un here-doc (`<<MOT`, `<<-MOT`, `<<'MOT'`, `<<\MOT`, tout mot) prend les lignes qui suivent la sienne jusqu'à
 *     MOT, ou jusqu'à la fin comme bash ; un `<<` dans un commentaire ou entre guillemets n'en ouvre aucun ;
 *   · un `#` en début de mot ouvre un commentaire, jusqu'à la fin de SA ligne ;
 *   · « \ » suivi d'un saut de ligne continue la ligne, sans rien ajouter au mot ; entre guillemets doubles, « \ »
 *     ne s'efface que devant $ ` " \ ; `$'…'` se décode comme bash le décode ;
 *   · `$( … )`, `<( … )`, `>( … )` et les accents graves sont des commandes à part, lues elles aussi ; dans la
 *     commande qui les contient, ils ne sont qu'un mot ;
 *   · `${…}` et `${{ … }}` (texte que GitHub remplace avant bash) restent un seul mot ; `{`, `}` isolés ne sont pas
 *     des mots.
 */
function lexer(source) {
  const toutes = [];
  let commentaire = -1;
  const lire = (texte, racine, ligneBase) => {
    const cmds = [];
    let mots = [];
    let redirs = [];
    let mot = "";
    let dansMot = false;
    let cible = null;
    let enAttente = [];
    let tube = false;
    let ligne = ligneBase;
    let ligneCmd = null;
    let i = 0;
    const debut = () => {
      if (ligneCmd === null) ligneCmd = ligne;
    };
    const lignesEntre = (a, b) => {
      let n = 0;
      for (let k = a; k < b && k < texte.length; k++) if (texte[k] === "\n") n++;
      return n;
    };
    const sauter = (j) => {
      ligne += lignesEntre(i, j);
      i = j;
    };
    const finMot = () => {
      if (dansMot) {
        if (cible) {
          cible.cible = mot;
          if (cible.op === "<<" || cible.op === "<<-") enAttente.push(cible);
          cible = null;
        } else mots.push(mot);
      }
      mot = "";
      dansMot = false;
    };
    const finCommande = (suivanteEnTube) => {
      finMot();
      cible = null;
      const m = mots.filter((x) => x !== "{" && x !== "}");
      if (m.length || redirs.length) {
        m.ligne = ligneCmd === null ? ligne : ligneCmd;
        m.redirs = redirs;
        m.tube = tube;
        cmds.push(m);
        tube = suivanteEnTube;
      } else tube = tube || suivanteEnTube; // `a |` puis un saut de ligne : la suite lit toujours le tube
      mots = [];
      redirs = [];
      ligneCmd = null;
    };
    /** Les corps des here-docs en attente : les lignes qui suivent, jusqu'à leur mot — ou jusqu'à la fin, comme bash. */
    const corpsHereDocs = () => {
      for (const h of enAttente) {
        const corps = [];
        while (i < texte.length) {
          let j = texte.indexOf("\n", i);
          if (j < 0) j = texte.length;
          const l = texte.slice(i, j);
          i = Math.min(j + 1, texte.length);
          ligne++;
          if ((h.op === "<<-" ? l.replace(/^\t+/, "") : l) === h.cible) break;
          corps.push(l);
        }
        h.corps = corps.join("\n");
      }
      enAttente = [];
    };
    /** Une substitution dont le texte commence à `debutSub` : lue à part ; rend l'indice qui suit sa `)`. */
    const substitution = (debutSub) => {
      const f = finSubstitution(texte, debutSub);
      lire(texte.slice(debutSub, f), false, ligne + lignesEntre(i, debutSub));
      return Math.min(f + 1, texte.length);
    };
    while (i < texte.length) {
      const c = texte[i];
      const s = texte[i + 1];
      if (c === "#" && !dansMot) {
        if (racine && commentaire < 0) commentaire = i;
        const j = texte.indexOf("\n", i);
        i = j < 0 ? texte.length : j;
        continue;
      }
      if (c === "\n") {
        finCommande(false);
        i++;
        ligne++;
        corpsHereDocs();
        continue;
      }
      if (c === " " || c === "\t") {
        finMot();
        i++;
        continue;
      }
      if (c === "\\" && s === "\n") {
        i += 2;
        ligne++;
        continue;
      }
      if (c === ";" || c === "|" || (c === "&" && s !== ">") || c === "(" || c === ")") {
        let pas = 1;
        let suivanteEnTube = false;
        if (c === "|") {
          if (s === "|") pas = 2;
          else {
            suivanteEnTube = true;
            if (s === "&") pas = 2;
          }
        } else if ((c === ";" || c === "&") && s === c) pas = 2;
        finCommande(suivanteEnTube);
        i += pas;
        continue;
      }
      debut();
      if (c === "\\") {
        if (s !== undefined) {
          mot += s;
          dansMot = true;
        }
        i += 2;
        continue;
      }
      if ((c === "<" || c === ">") && s === "(") {
        const j = substitution(i + 2);
        sauter(j);
        mot += c + "(…)";
        dansMot = true;
        continue;
      }
      if (c === "<" || c === ">" || c === "&") {
        if (dansMot && /^[0-9]+$/.test(mot)) {
          mot = "";
          dansMot = false;
        } else finMot();
        const op = /^(?:<<<|<<-|<<|<>|<&|<|>>|>\||>&|>|&>>|&>)/.exec(texte.slice(i, i + 3))[0];
        i += op.length;
        const r = { op };
        redirs.push(r);
        cible = r;
        continue;
      }
      if (c === "'") {
        const j = texte.indexOf("'", i + 1);
        const fin = j < 0 ? texte.length : j;
        mot += texte.slice(i + 1, fin);
        dansMot = true;
        sauter(Math.min(fin + 1, texte.length));
        continue;
      }
      if (c === "$" && s === "'") {
        const { valeur, fin } = ansiC(texte, i + 2);
        mot += valeur;
        dansMot = true;
        sauter(fin);
        continue;
      }
      if (c === "$" && s === '"') {
        i++; // `$"…"` : une chaîne traduite, des guillemets doubles pour le reste
        continue;
      }
      if (c === '"') {
        dansMot = true;
        let j = i + 1;
        while (j < texte.length && texte[j] !== '"') {
          const x = texte[j];
          if (x === "\\" && j + 1 < texte.length) {
            const n = texte[j + 1];
            if (n !== "\n") mot += "$`\"\\".includes(n) ? n : "\\" + n;
            j += 2;
            continue;
          }
          if (x === "$" && texte[j + 1] === "(") {
            const f = finSubstitution(texte, j + 2);
            lire(texte.slice(j + 2, f), false, ligne + lignesEntre(i, j));
            mot += "$(…)";
            j = Math.min(f + 1, texte.length);
            continue;
          }
          if (x === "`") {
            const k = texte.indexOf("`", j + 1);
            const f = k < 0 ? texte.length : k;
            lire(texte.slice(j + 1, f), false, ligne + lignesEntre(i, j));
            mot += "`…`";
            j = Math.min(f + 1, texte.length);
            continue;
          }
          mot += x;
          j++;
        }
        sauter(Math.min(j + 1, texte.length));
        continue;
      }
      if (c === "$" && s === "(") {
        const j = substitution(i + 2);
        sauter(j);
        mot += "$(…)";
        dansMot = true;
        continue;
      }
      if (c === "$" && s === "{") {
        let prof = 0;
        let j = i + 1;
        for (; j < texte.length; j++) {
          const x = texte[j];
          if (x === "\\") j++;
          else if (x === "'") {
            const k = texte.indexOf("'", j + 1);
            j = k < 0 ? texte.length : k;
          } else if (x === '"') j = finGuillemets(texte, j + 1);
          else if (x === "{") prof++;
          else if (x === "}" && --prof === 0) break;
        }
        const fin = Math.min(j + 1, texte.length);
        mot += texte.slice(i, fin);
        dansMot = true;
        sauter(fin);
        continue;
      }
      if (c === "`") {
        const k = texte.indexOf("`", i + 1);
        const f = k < 0 ? texte.length : k;
        lire(texte.slice(i + 1, f), false, ligne);
        mot += "`…`";
        dansMot = true;
        sauter(Math.min(f + 1, texte.length));
        continue;
      }
      mot += c;
      dansMot = true;
      i++;
    }
    finCommande(false);
    toutes.push(...cmds);
  };
  lire(String(source), true, 1);
  return { cmds: toutes, commentaire };
}
const commandes = (texte) => lexer(texte).cmds;
const estOutil = (mot, nom) => mot === nom || mot.endsWith("/" + nom);
const estShell = (mot) => SHELLS.some((s) => estOutil(mot, s));

/**
 * Les options d'un shell lancé au mot `k` de `m`, comme bash les lit : un groupe d'options courtes (`-eo`) consomme
 * un mot par `o` ou `O` qu'il porte (`-eo pipefail -c '…'`), `--rcfile`/`--init-file` en consomment un, `--` ou `-`
 * les terminent. Rend `{ c, s, mot }` : `-c` (le mot `mot` est le script), `-s` (le script vient de l'entrée
 * standard), et l'indice du premier mot qui n'est pas une option (-1 s'il n'y en a pas : le script vient alors de
 * l'entrée standard).
 */
function optionsDuShell(m, k) {
  let c = false;
  let s = false;
  let j = k + 1;
  for (; j < m.length; j++) {
    const x = m[j];
    if (x === "--" || x === "-") {
      j++;
      break;
    }
    if (x === "--rcfile" || x === "--init-file") {
      j++;
      continue;
    }
    if (x.startsWith("--")) continue;
    if (/^[-+][A-Za-z]+$/.test(x)) {
      for (const lettre of x.slice(1)) {
        if (lettre === "o" || lettre === "O") j++;
        else if (x[0] === "-" && lettre === "c") c = true;
        else if (x[0] === "-" && lettre === "s") s = true;
      }
      continue;
    }
    break;
  }
  return { c, s, mot: j < m.length ? j : -1 };
}

/**
 * Les commandes d'un texte, et celles qu'il fait lancer par un shell, relues (trois niveaux au plus) : le script de
 * `bash -c '…'` (quelles que soient les options), d'`eval`, d'une here-string ou d'un here-doc donnés à un shell qui
 * lit son entrée, et la commande de `npm explore <paquet> -- …`. Une commande relue est située à la ligne de celle
 * qui la lance (celle d'un corps de here-doc, à sa propre ligne). Un script passé par variable (`bash -c "$S"`)
 * n'est pas relu : c'est une des limites dites en tête.
 */
function commandesProfondes(texte, profondeur = 0) {
  const sortie = [];
  for (const m of commandes(texte)) {
    sortie.push(m);
    if (profondeur >= 3) continue;
    const relire = (script, decalage) => {
      for (const x of commandesProfondes(script, profondeur + 1)) {
        x.ligne = m.ligne + decalage + (x.ligne - 1);
        sortie.push(x);
      }
    };
    for (let k = 0; k < m.length; k++) {
      if (!estShell(m[k])) continue;
      const { c, s, mot } = optionsDuShell(m, k);
      if (c) {
        if (mot >= 0) relire(m[mot], 0);
      } else if (mot < 0 || s) {
        for (const r of m.redirs) {
          if (r.op === "<<<" && r.cible !== undefined) relire(r.cible, 0);
          if ((r.op === "<<" || r.op === "<<-") && r.corps !== undefined) relire(r.corps, 1);
        }
      }
    }
    const iEval = m.findIndex((x) => estOutil(x, "eval"));
    if (iEval >= 0 && iEval + 1 < m.length) relire(m.slice(iEval + 1).join(" "), 0);
    // `npm explore <paquet> [--] <commande…>` : npm la lance par un shell, dans le dossier du paquet (explore.js).
    for (let k = 0; k + 1 < m.length; k++) {
      if (!estOutil(m[k], "npm") || commandeNpm(m[k + 1]) !== "explore") continue;
      const reste = m.slice(k + 2);
      const fin = reste.indexOf("--");
      const script = fin >= 0 ? reste.slice(fin + 1) : reste.filter((x) => !x.startsWith("-")).slice(1);
      if (script.length) relire(script.join(" "), 0);
    }
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

/**
 * `--ignore-scripts` lu avec certitude : `{ actif, forme }`. N'est lue que la forme `--ignore-scripts` (ou
 * `--ignore-scripts=true`), avant tout `--`, précédée de la sous-commande, d'un mot qui n'est pas une option, d'une
 * option à `=` ou d'un booléen pur (une option à valeur la prendrait pour sa valeur : `--prefix --ignore-scripts`),
 * et sans un `false` derrière elle (nopt le lui prend). Toute autre forme qui la touche — négation (`--no-…`, en
 * majuscules aussi), abréviation (`--ig`), autre valeur (`=1`, `=false`) — est une lecture incertaine, comme une
 * option dont le nom porte une variable ou des accolades (`--ignore-scripts${X?}=false`, `--{x,no-ignore-scripts}`) :
 * le shell ou npm en font une autre option. Dans l'environnement, seule `npm_config_ignore_scripts=true` compte ; la
 * ligne de commande l'emporte sur lui.
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
    if (/[$`{}]/.test(x.split("=")[0])) return { actif: false, forme: x };
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
 * d'OPTIONS_OUTIL (d'OPTIONS_EXEC pour `npm exec`) sont lues ; pour `npm exec`, npm lit ses options jusqu'à `--`,
 * après l'outil aussi.
 */
function auditerOutil(nom, mots, { npmExec }) {
  const d = [];
  const lues = npmExec ? OPTIONS_EXEC : OPTIONS_OUTIL;
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
    const sens = lues[x];
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

/** Défauts du mot `npm` placé à l'indice `i` de la commande `m`. */
function auditerNpm(m, i) {
  const d = [];
  const args = m.slice(i + 1);
  if (!args.length) return d;
  if (args[0].startsWith("-")) {
    // Rien que des options (`npm --version`) : aucune sous-commande ne tourne.
    if (args.some((x) => !x.startsWith("-"))) {
      d.push(`\`npm ${args.join(" ")}\` : une option précède la sous-commande — sa valeur, un raccourci, une abréviation ou un \`--\` déplacent la sous-commande, que la gate ne lit donc pas : écrire \`npm <sous-commande> [options]\``);
    }
    return d;
  }
  if (/[$`{}]/.test(args[0])) {
    d.push(`\`npm ${args[0]}\` : sous-commande variable (ou expression, ou accolades), que la gate ne lit pas`);
    return d;
  }
  const sous = commandeNpm(args[0]);
  if (!sous) return d; // pas une sous-commande de npm : npm la refuse (« Unknown command »), ou ce mot `npm` n'en lance pas
  const reste = args.slice(1);
  const fin = reste.findIndex((x) => /^-{2,}$/.test(x));
  const options = fin < 0 ? reste : reste.slice(0, fin);
  const classe = CLASSE_NPM[sous];
  const positionnels = options.filter((x) => !x.startsWith("-"));
  if (classe === "hors" || (classe === "link" && positionnels.length)) {
    if (sous === "install" && options.includes("--no-save")) d.push("`npm install --no-save` ignore le lockfile");
    else d.push(`\`npm ${sous}\` installe hors lockfile (la dernière version publiée de chaque dépendance) — en CI, \`npm ci --ignore-scripts\` sur un lockfile versionné`);
  } else if (classe === "scripts" || classe === "link") {
    const lu = ignoreScripts(m.slice(0, i), options);
    if (!lu.actif) {
      const forme = lu.forme ? ` lu avec certitude (forme non lue : \`${lu.forme}\`)` : "";
      d.push(`\`npm ${sous}\` sans \`--ignore-scripts\`${forme} — les scripts d'installation de chaque paquet tourneraient sur le runner`);
    }
  } else if (classe === "exec") {
    d.push(...auditerOutil(`npm ${args[0]}`, reste, { npmExec: true }));
  } else if (classe === "audit") {
    if (reste.includes("fix")) d.push("`npm audit fix` réécrit l'arbre hors lockfile relu");
  } else if (classe === "spec") {
    const vues = reste.flatMap((x) => (x.startsWith("--diff=") ? [x.slice(7)] : x.startsWith("-") ? [] : [x]));
    const hors = vues.find(specHorsRegistre);
    if (hors) d.push(`\`npm ${sous} ${hors}\` : un paquet hors registre est cloné puis préparé, ses scripts compris`);
  }
  return d;
}

/** Défauts d'une commande du shell (une liste de mots) : npm, npx, et les outils d'installation hors npm. */
function auditerCommande(m) {
  const d = [];
  const autre = m.find((x) => OUTILS_NON_NPM.some((o) => estOutil(x, o)));
  if (autre) d.push(`\`${autre.split("/").pop()}\` : le dépôt n'installe que par npm (\`npm ci --ignore-scripts\` sur un lockfile)`);
  // Chaque mot npm ou npx est jugé : `env -C d npm install`, `sudo -u x npm ci`, `npm exec -- npm ci`.
  for (let i = 0; i < m.length; i++) {
    if (estOutil(m[i], "npx")) d.push(...auditerOutil("npx", m.slice(i + 1), { npmExec: false }));
    else if (estOutil(m[i], "npm")) d.push(...auditerNpm(m, i));
  }
  const iXargs = m.findIndex((x) => estOutil(x, "xargs"));
  const fabrique = iXargs < 0 ? undefined : m.slice(iXargs + 1).find((x) => estOutil(x, "npm") || estOutil(x, "npx"));
  if (fabrique) d.push(`\`xargs … ${fabrique}\` : les arguments viennent de l'entrée standard, la gate ne les lit pas`);
  // Un shell qui lit son script sur un tube : `… | bash`, `curl … | sudo sh`, `… | bash -s`.
  if (m.tube) {
    const k0 = m.findIndex((x) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(x));
    const premier = k0 < 0 ? "" : m[k0];
    const k = estShell(premier) ? k0 : ENVELOPPES.includes(premier.split("/").pop()) ? m.findIndex((x, j) => j > k0 && estShell(x)) : -1;
    if (k >= 0) {
      const { c, s, mot } = optionsDuShell(m, k);
      const entree = m.redirs.some((r) => /^(?:<|<<|<<-|<<<|<>)$/.test(r.op));
      if (!c && (mot < 0 || s) && !entree) d.push(`\`| ${m.slice(k0, k + 1).join(" ")}\` : un shell qui lit son script sur un tube n'est pas relu — écrire les commandes dans le run:`);
    }
  }
  return [...new Set(d)];
}

/** Une expression `${{ '…' }}` qui n'est qu'un texte cité : GitHub la remplace par ce texte avant bash ; la gate aussi. */
const avecTextesGitHub = (texte) => texte.replace(/\$\{\{\s*'((?:[^']|'')*)'\s*\}\}/g, (_, s) => s.replace(/''/g, "'"));

/**
 * Les commandes d'un texte de shell, situées par leur ligne dans le texte (1 = première) : lu ligne logique par
 * ligne logique, puis d'un seul tenant (`tenant`) — une chaîne entre guillemets sur plusieurs lignes cache, à la
 * lecture par ligne, ce qui suit sa fermeture ; un here-doc, à la lecture d'un seul tenant, n'est relu que donné à un
 * shell.
 */
function commandesDuShell(source) {
  const sortie = [];
  const texte = avecTextesGitHub(source);
  const lignes = texte.split("\n").map((l, i) => ({ n: i + 1, l }));
  for (const { n, l } of lignesLogiques(lignes)) for (const mots of commandesProfondes(l)) sortie.push({ n, mots, tenant: false });
  for (const mots of commandesProfondes(texte)) sortie.push({ n: mots.ligne, mots, tenant: true });
  return sortie;
}

/** Les défauts d'un texte de shell, situés comme ses commandes ; la lecture d'un seul tenant n'ajoute que du neuf. */
function defautsDuShell(texte) {
  const sortie = [];
  const vus = new Set();
  for (const { n, mots, tenant } of commandesDuShell(texte)) {
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

/**
 * Un libellé, que GitHub affiche et n'exécute jamais : le nom du workflow, d'un job, d'une étape (d'une action
 * composite aussi), `run-name`, et les `description` (de l'action, de ses entrées et sorties, des entrées d'un
 * déclencheur). Toute autre valeur — un `name:` sous `env:`, `with:` ou dans une matrice compris — est du shell.
 */
function estLibelle(chemin) {
  const n = chemin.length;
  const [a, b, c, d, e] = chemin;
  if (n === 1) return ["name", "run-name", "description", "author"].includes(a);
  if (a === "jobs" && n === 3) return c === "name";
  if (a === "jobs" && n === 5) return c === "steps" && typeof d === "number" && e === "name";
  if (a === "runs" && n === 4) return b === "steps" && typeof c === "number" && d === "name";
  if ((a === "inputs" || a === "outputs") && n === 3) return c === "description";
  if (a === "on" && n === 5) return ["inputs", "outputs", "secrets"].includes(c) && e === "description";
  return false;
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

/**
 * Les lignes du fichier qui sont le contenu d'un scalaire en bloc (`|`, `>`) : une clé ne s'y cherche pas. Le bloc
 * finit à la première ligne qui n'est pas plus indentée que sa CLÉ — derrière `- run: |`, la colonne de `run`, pas
 * celle du tiret : les clés sœurs (`shell:`, `env:`) n'en font pas partie.
 */
function lignesDeBloc(lignes) {
  const dedans = new Array(lignes.length).fill(false);
  const retrait = (l) => l.length - l.replace(/^ +/, "").length;
  for (let i = 0; i < lignes.length; i++) {
    if (dedans[i]) continue;
    const m = /^( *)((?:-[ \t]+)?)(?:[^\s#'"][^:#]*?|"[^"]*"|'[^']*')[ \t]*:[ \t]+[|>][-+]?[ \t]*(?:#.*)?$/.exec(lignes[i]);
    const seul = m ? null : /^( *)-[ \t]+[|>][-+]?[ \t]*(?:#.*)?$/.exec(lignes[i]);
    if (!m && !seul) continue;
    const bord = m ? m[1].length + m[2].length : seul[1].length;
    for (let j = i + 1; j < lignes.length; j++) {
      if (/^[ \t]*$/.test(lignes[j])) {
        dedans[j] = true;
        continue;
      }
      if (retrait(lignes[j]) <= bord) break;
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
 * Lit un workflow (ou une action composite) par le lecteur YAML fermé et rend `{ doc, chaines }` : l'arbre, et
 * chaque chaîne de l'arbre, `{ valeur, chemin, cle, ligne, litteral, libelle, run }` — `ligne` celle de sa clé,
 * `litteral` si c'est un bloc `|` (sa ligne n est alors ligne + n), `libelle` si estLibelle, `run` si c'est un
 * `run:`. Lève ErreurYaml sur une forme que le lecteur ne prend pas.
 */
function chainesDuWorkflow(texte) {
  const doc = lireYaml(texte);
  const lignes = texte.split(/\r?\n/);
  const situer = localisateur(lignes);
  const sortie = [];
  parcourir(doc, [], (valeur, chemin) => {
    const cle = [...chemin].reverse().find((x) => typeof x === "string");
    const { ligne, litteral } = situer(cle, valeur, typeof chemin[chemin.length - 1] === "number");
    sortie.push({ valeur, chemin, cle, ligne, litteral, libelle: estLibelle(chemin), run: cle === "run" && chemin[chemin.length - 1] === "run" });
  });
  return { doc, chaines: sortie };
}

/**
 * Toutes les commandes de shell d'un workflow, lues comme la gate les lit (toute valeur sauf un libellé) :
 * `{ ligne, mots }`. Le banc outils-ci-figes s'en sert pour la CLI de Netlify. Lève ErreurYaml sur une forme que le
 * lecteur ne prend pas.
 */
function commandesDuWorkflow(texte) {
  const sortie = [];
  for (const { valeur, ligne, litteral, libelle } of chainesDuWorkflow(texte).chaines) {
    if (libelle) continue;
    for (const { n, mots } of commandesDuShell(valeur)) sortie.push({ ligne: ligne === null ? null : litteral ? ligne + n : ligne, mots });
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
    return [`${nom}:${e.ligne ?? "?"} : YAML que la gate ne lit pas (${e.message.replace(/ \(ligne \d+\)$/, "")}) — une forme que son lecteur ne prend pas est refusée : l'écrire sans ancre, alias ni étiquette, un script en bloc \`|\``];
  }
  for (const chemin of runsNonChaines(lu.doc)) defauts.push(`${nom}:? : \`${chemin}\` n'est pas une chaîne — forme que la gate ne lit pas`);
  for (const { valeur, cle, ligne, litteral, libelle, run } of lu.chaines) {
    const ou = (n) => `${nom}:${ligne === null ? "?" : litteral ? ligne + n : ligne}`;
    if (cle === "uses" && !valeur.startsWith("./") && !/@[0-9a-f]{40}$/.test(valeur)) defauts.push(`${ou(0)} : action non épinglée par SHA (${valeur})`);
    if (cle === "version" && /^latest$/i.test(valeur.trim())) defauts.push(`${ou(0)} : \`version: latest\` n'est pas figé`);
    if (!libelle) for (const { n, d } of defautsDuShell(valeur)) defauts.push(`${ou(n)} : ${d}`);
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
 * Les actions composites lues : tout action.yml sous .github/actions/, et celles que cite un `uses: ./…` — d'un
 * workflow, ou d'une action composite déjà trouvée (jusqu'à ce qu'il n'en vienne plus) ; GitHub résout ce chemin
 * depuis la racine du dépôt, et `uses: ./` désigne l'action.yml de la racine.
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
  const citees = (t) => {
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
  };
  for (const t of textes) citees(t);
  const lues = new Set();
  for (let nouvelle = true; nouvelle; ) {
    nouvelle = false;
    for (const rel of [...trouves]) {
      if (lues.has(rel)) continue;
      lues.add(rel);
      nouvelle = true;
      citees(fs.readFileSync(path.join(racine, rel), "utf8"));
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
  console.log(`✓ audit-workflows : ${fichiers.length} workflows et ${composites.length} action(s) composite(s) lus — aucune installation npm ou npx hors lockfile reconnue, aucun outil d'installation hors npm, aucune action flottante, aucune injection, canal de l'agent sans jeton personnel`);
}

module.exports = {
  auditerWorkflow, auditerCanalAgent, auditerDepot, auditerFichiersDetournants, auditerCommande, commandes, lexer,
  commandesProfondes, lignesLogiques, defautsDuShell, chainesDuWorkflow, commandesDuWorkflow, actionsComposites,
  fichiersDuDepot, commandeNpm, estLibelle, COMMANDES_NPM, CLASSE_NPM,
};
