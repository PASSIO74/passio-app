#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AUDIT DES WORKFLOWS — ce qui ne doit pas revenir dans .github/workflows (audit de sécurité 2026-11-06).
//
// Gate statique, sans réseau, inscrit dans `npm run verif`. Chaque règle a un résultat réel derrière :
//   · un outil non figé qui écrit ce qui part en production (`npx --yes`, `npm install --no-save`) ;
//   · TOUTE installation hors lockfile (2026-11-14) : `npm install netlify-cli@27.1.2` figeait la CLI,
//     pas ses ~1 120 dépendances — le déploiement de production a rougi sur une dépendance publiée une
//     minute plus tôt, et une version malveillante serait entrée aussi vite, avec le jeton. En CI, on
//     installe par `npm ci --ignore-scripts` sur un lockfile versionné, rien d'autre : ni `npm install`
//     (ni ses alias, ni `update`, `dedupe`, `audit fix`, `init`/`create`), ni `npx`/`npm exec` qui
//     téléchargent (`--yes`, `-y`, `--package`, `outil@version`), ni `npm ci` qui exécute les scripts
//     d'installation des paquets sur le runner ;
//   · un fichier qui détournerait `npm ci` : un `npm-shrinkwrap.json` (il prime sur package-lock.json)
//     ou un `.npmrc` (registre, scripts, jetons), suivis par git n'importe où dans le dépôt ;
//   · un `.netlify/` versionné à la racine : la CLI y prend des fonctions « internes », les regroupe et
//     exécute leur code (extraction de config) avec le jeton, hors du contrôle d'empreinte de dist/ ;
//   · une action sans SHA, ou un binaire en `version: latest`, qui reçoit un secret ;
//   · du texte d'un événement interpolé dans un `run:` (injection shell : edge-functions.yml) ;
//   · un jeton personnel dans une étape qui exécute le code du dépôt, dans le job de l'agent :
//     l'agent venait d'y écrire, et `node scripts/…` lançait ce qu'il avait laissé (E-02) ;
//   · une auto-fusion dans le canal de l'agent : du texte d'un inconnu jusqu'à la production (E-01) ;
//   · un shell de l'agent CI sur `git log`, `git diff`, `git show` (`--output=` écrit un fichier).
// Les actions composites du dépôt (.github/actions/**/action.yml) passent par les mêmes règles.
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

// ── Les commandes npm et npx, lues comme le shell les lit ─────────────────────
// Une ligne (les lignes continuées par « \ » réunies) est coupée en commandes, puis en mots, par `commandes`
// plus bas : guillemets, substitutions `$( … )` et accents graves compris. La SOUS-COMMANDE de `npm` est le premier mot qui est un nom de commande de npm : ses
// options, et leurs valeurs, peuvent précéder (`npm --prefix "$D" install x`), et `npm run i` reste un
// `run`. Une commande de npm absente de ces listes n'est pas jugée.
const HORS_LOCKFILE = new Set([
  "install", "i", "in", "ins", "inst", "insta", "instal", "isnt", "isnta", "isntal", "isntall", "add",
  "it", "install-test", "update", "up", "upgrade", "udpate", "dedupe", "ddp", "init", "create", "innit",
]);
const CI = new Set(["ci", "clean-install", "ic", "install-clean", "isntall-clean", "cit", "clean-install-test", "sit", "install-ci-test"]);
const EXEC = new Set(["exec", "x"]);
const NEUTRES = new Set([
  "run", "run-script", "rum", "urn", "test", "t", "tst", "start", "stop", "restart", "audit", "ls", "list",
  "la", "ll", "view", "info", "show", "v", "pack", "publish", "version", "config", "get", "set", "cache",
  "help", "outdated", "explain", "why", "query", "sbom", "fund", "doctor", "prefix", "root", "whoami", "ping",
  "search", "uninstall", "un", "remove", "rm", "r", "unlink", "link", "ln", "pkg", "prune", "rebuild", "rb",
  "shrinkwrap", "diff", "docs", "repo", "bugs", "owner", "token", "access", "login", "logout", "dist-tag",
]);
const OUTIL_VERSIONNE = /^(?:@[^/@\s]+\/)?[^/@\s]+@.+$/; // `outil@1.2.3`, `@portee/outil@^2`

/** Les lignes logiques d'un texte : commentaires retirés, lignes continuées par « \ » réunies. */
function lignesLogiques(lignes) {
  const sortie = [];
  for (let i = 0; i < lignes.length; i++) {
    if (/^\s*#/.test(lignes[i])) continue;
    const debut = i;
    let l = lignes[i].replace(/\s+#.*$/, "");
    while (/\\\s*$/.test(l) && i + 1 < lignes.length) {
      i++;
      l = l.replace(/\\\s*$/, " ") + lignes[i].replace(/\s+#.*$/, "");
    }
    sortie.push({ n: debut + 1, l });
  }
  return sortie;
}

/**
 * Découpe une ligne de shell en commandes, puis en mots, comme le shell les lit :
 *   · les guillemets délimitent les mots — `echo "npm install"` est UN mot pour echo, pas une installation ;
 *   · `;`, `&&`, `||`, `|`, `&` hors guillemets séparent les commandes ;
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

/** Défauts des commandes npm / npx d'une commande du shell (une liste de mots). */
function auditerCommande(m) {
  const d = [];
  const iNpx = m.findIndex((x) => estOutil(x, "npx"));
  if (iNpx >= 0) {
    for (let j = iNpx + 1; j < m.length; j++) {
      const x = m[j];
      if (!x.startsWith("-")) {
        if (OUTIL_VERSIONNE.test(x)) d.push(`\`npx ${x}\` télécharge l'outil hors lockfile`);
        break;
      }
      if (x === "--yes" || x === "-y") d.push("`npx --yes` installe la dernière version publiée");
      if (x === "-p" || x === "--package" || x.startsWith("--package=")) d.push("`npx --package` installe un paquet hors lockfile");
      if (x === "-p" || x === "--package") j++;
    }
  }
  const iNpm = m.findIndex((x) => estOutil(x, "npm"));
  if (iNpm < 0) return d;
  const reste = m.slice(iNpm + 1);
  const k = reste.findIndex((x) => HORS_LOCKFILE.has(x) || CI.has(x) || EXEC.has(x) || NEUTRES.has(x));
  if (k < 0) return d;
  const sous = reste[k];
  const apres = reste.slice(k + 1);
  if (HORS_LOCKFILE.has(sous)) {
    if (reste.includes("--no-save")) d.push("`npm install --no-save` ignore le lockfile");
    else d.push(`\`npm ${sous}\` installe hors lockfile (la dernière version publiée de chaque dépendance) — en CI, \`npm ci --ignore-scripts\` sur un lockfile versionné`);
  } else if (CI.has(sous)) {
    const sansScripts = reste.some((x) => x === "--ignore-scripts" || x === "--ignore-scripts=true");
    if (!sansScripts) d.push(`\`npm ${sous}\` sans \`--ignore-scripts\` — les scripts d'installation de chaque paquet tourneraient sur le runner`);
  } else if (EXEC.has(sous)) {
    for (let j = 0; j < apres.length; j++) {
      const x = apres[j];
      if (x === "--") {
        if (j + 1 < apres.length && OUTIL_VERSIONNE.test(apres[j + 1])) d.push(`\`npm ${sous} -- ${apres[j + 1]}\` télécharge l'outil hors lockfile`);
        break;
      }
      if (!x.startsWith("-")) {
        if (OUTIL_VERSIONNE.test(x)) d.push(`\`npm ${sous} ${x}\` télécharge l'outil hors lockfile`);
        break;
      }
      if (x === "--yes" || x === "-y") d.push(`\`npm ${sous} --yes\` installe la dernière version publiée`);
      if (x === "-p" || x === "--package" || x.startsWith("--package=")) d.push(`\`npm ${sous} --package\` installe un paquet hors lockfile`);
      if (x === "-p" || x === "--package") j++;
    }
  } else if (sous === "audit" && apres.find((x) => !x.startsWith("-")) === "fix") {
    d.push("`npm audit fix` réécrit l'arbre hors lockfile relu");
  }
  return d;
}

/** Règles sur un texte de workflow : rend la liste des défauts, sans lire le disque. */
function auditerWorkflow(nom, texte) {
  const defauts = [];
  const lignes = texte.split(/\r?\n/);
  lignes.forEach((brute, i) => {
    if (/^\s*#/.test(brute)) return;
    const l = brute.replace(/\s+#.*$/, "");
    const ou = `${nom}:${i + 1}`;
    if (/^\s*version:\s*latest\b/.test(l)) defauts.push(`${ou} : \`version: latest\` n'est pas figé`);
    const m = /^\s*(?:-\s*)?uses:\s*([^\s]+)/.exec(l);
    if (m && !m[1].startsWith("./") && !/@[0-9a-f]{40}$/.test(m[1])) defauts.push(`${ou} : action non épinglée par SHA (${m[1]})`);
  });
  for (const { n, l } of lignesLogiques(lignes)) {
    for (const c of commandes(l)) for (const d of auditerCommande(c)) defauts.push(`${nom}:${n} : ${d}`);
  }

  // Une interpolation d'événement ne doit jamais entrer dans le texte d'un `run:`.
  let enRun = null;
  lignes.forEach((brute, i) => {
    const indent = brute.length - brute.trimStart().length;
    if (enRun !== null && brute.trim() && indent <= enRun) enRun = null;
    if (enRun !== null && !/^\s*#/.test(brute)) {
      const m = /\$\{\{\s*(github\.event\.(?!number\b)[^}]*?|github\.head_ref)\s*\}\}/.exec(brute);
      if (m && !/\.number\b|\.id\b/.test(m[1])) defauts.push(`${nom}:${i + 1} : \`${m[1].trim()}\` interpolé dans un run: (passer par env:)`);
    }
    const r = /^(\s*)(?:-\s*)?run:\s*[|>]/.exec(brute);
    if (r) enRun = r[1].length;
  });
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

/** Les actions composites du dépôt : .github/actions/<nom>/action.yml (ou .yaml). */
function actionsComposites(dossier) {
  if (!fs.existsSync(dossier)) return [];
  const trouves = [];
  const parcourir = (rel) => {
    for (const e of fs.readdirSync(path.join(dossier, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) parcourir(r);
      else if (/^action\.ya?ml$/.test(e.name)) trouves.push(r);
    }
  };
  parcourir("");
  return trouves;
}

function auditerDepot(dossier = DOSSIER, { actions = ACTIONS, racine = RACINE } = {}) {
  const fichiers = fs.readdirSync(dossier).filter((f) => /\.ya?ml$/.test(f));
  const defauts = [];
  for (const f of fichiers) {
    const t = fs.readFileSync(path.join(dossier, f), "utf8");
    defauts.push(...auditerWorkflow(f, t));
    if (f === "claude-code.yml") defauts.push(...auditerCanalAgent(t));
  }
  const composites = actionsComposites(actions);
  for (const a of composites) defauts.push(...auditerWorkflow(`actions/${a}`, fs.readFileSync(path.join(actions, a), "utf8")));
  defauts.push(...auditerFichiersDetournants(fichiersDuDepot(racine)));
  return { defauts, fichiers, composites };
}

if (require.main === module) {
  const { defauts, fichiers, composites } = auditerDepot();
  if (defauts.length) {
    console.error(`✗ audit-workflows : ${defauts.length} défaut(s)\n` + defauts.map((d) => "  " + d).join("\n"));
    process.exit(1);
  }
  console.log(`✓ audit-workflows : ${fichiers.length} workflows et ${composites.length} action(s) composite(s), aucune installation hors lockfile, aucune action flottante, aucune injection, canal de l'agent sans jeton personnel`);
}

module.exports = { auditerWorkflow, auditerCanalAgent, auditerDepot, auditerFichiersDetournants, auditerCommande, commandes, lignesLogiques };
