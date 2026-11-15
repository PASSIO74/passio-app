#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// RÉINJECTIONS de la gate des workflows (scripts/audit-workflows.js, scripts/lib/yaml-workflow.js) — 2026-11-15.
//
// Un test qui reste vert quand on remet le défaut ne garde rien. Les règles de la gate listées ci-dessous sont
// retirées tour à tour dans une COPIE (un dossier temporaire : rien n'est muté dans la copie de travail), et
// tests/unit/audit-workflows.test.mjs, rejoué sur cette copie, doit ROUGIR. Sortie 0 si toutes rougissent, 1 sinon
// — une cible introuvable compte comme un échec : la réinjection ne décrit plus le code.
//
//   node scripts/reinjections-audit-workflows.mjs          # ~2 min
//
// Hors de `npm run verif` (une suite par réinjection). La liste n'est pas TOUTE la gate : une relecture adverse en a
// trouvé d'autres, ajoutées ensuite, et en trouvera encore. Pas ici, délibérément : la table des échappements simples
// de `$'…'` et la ligne d'une commande relue (elle ne sert qu'au message). Rien ici ne touche un réseau.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const G = "scripts/audit-workflows.js";
const Y = "scripts/lib/yaml-workflow.js";
const R = String.raw;

// [nom, [[fichier, cible, remplacement], …]]
const M = [
  // Le lexeur et les lignes logiques.
  ["L01 la continuation se lit dans un commentaire", [[G, "while (continuee(c) && i + 1 < lignes.length) {", "while (continuee(l) && i + 1 < lignes.length) {"]]],
  ["L02 « \\ » suivi d'une espace continue la ligne", [[G, R`const continuee = (x) => /(?:^|[^\\])(?:\\\\)*\\$/.test(x);`, R`const continuee = (x) => /\\\s*$/.test(x);`]]],
  ["L03 la continuation ajoute une espace", [[G, "l = c.slice(0, -1) + lignes[i].l;", 'l = c.slice(0, -1) + " " + lignes[i].l;']]],
  ["L04 # n'ouvre plus de commentaire", [[G, 'if (c === "#" && !dansMot) {', "if (false) {"]]],
  ["L05 un commentaire court jusqu'à la fin du texte", [[G, "i = j < 0 ? texte.length : j;", "i = texte.length;"]]],
  ["L06 le saut de ligne ne sépare plus", [[G, "        finCommande(false);\n        i++;\n        ligne++;\n        corpsHereDocs();", "        finMot();\n        i++;\n        ligne++;\n        corpsHereDocs();"]]],
  ["L07 les parenthèses ne séparent plus", [[G, 'if (c === ";" || c === "|" || (c === "&" && s !== ">") || c === "(" || c === ")") {', 'if (c === ";" || c === "|" || (c === "&" && s !== ">")) {']]],
  ["L08 un blanc Unicode sépare les mots", [[G, R`if (c === " " || c === "\t") {`, R`if (c !== "\n" && /\s/.test(c)) {`]]],
  ["L09 le tube se perd au saut de ligne", [[G, "} else tube = tube || suivanteEnTube;", "} else tube = suivanteEnTube;"]]],
  ["L10 la cible d'une redirection est un argument", [[G, "        redirs.push(r);\n        cible = r;", "        redirs.push(r);\n        cible = null;"]]],
  ["L11 un descripteur (`2>`) reste un argument", [[G, '        if (dansMot && !cite && /^[0-9]+$/.test(mot)) {\n          mot = "";\n          dansMot = false;\n        } else finMot();', "        finMot();"]]],
  ["L12 un here-doc n'est pas attendu : son corps est lu comme du code", [[G, 'if (cible.op === "<<" || cible.op === "<<-") enAttente.push(cible);', "void 0;"]]],
  ["L13 un here-doc ne se ferme que sur EOF", [[G, R`if ((h.op === "<<-" ? l.replace(/^\t+/, "") : l) === h.cible) break;`, R`if ((h.op === "<<-" ? l.replace(/^\t+/, "") : l) === "EOF") break;`]]],
  ["L14 `<<-` ne retire pas les tabulations", [[G, R`if ((h.op === "<<-" ? l.replace(/^\t+/, "") : l) === h.cible) break;`, "if (l === h.cible) break;"]]],
  ["L15 `$'…'` n'est pas lu", [[G, `if (c === "$" && s === "'") {`, "if (false) {"]]],
  ["L16 `$'…'` : l'hexadécimal n'est pas décodé", [[G, R`} else if (n === "x" && (m = /^[0-9A-Fa-f]{1,2}/.exec(texte.slice(i + 2, i + 4)))) {`, "} else if (false) {"]]],
  ["L17 substitution : la `)` d'un motif de case la ferme", [[G, R`else if (c === ")" && !(cas > 0 && prof === 1) && --prof === 0) return j;`, R`else if (c === ")" && --prof === 0) return j;`]]],
  ["L18 substitution : « \\ » n'échappe rien", [[G, R`      mot += c + (texte[j + 1] ?? "");
      j++;
      continue;`, R`      mot += c;
      continue;`]]],
  ["L19 `${{ 'texte' }}` n'est pas remplacé", [[G, "const avecTextesGitHub = (texte) => texte.replace(", "const avecTextesGitHub = (texte) => texte || texte.replace("]]],
  ["L20 substitution : le corps d'un here-doc n'est pas sauté", [[G, "      if (d.mot) enAttente.push({ tab, mot: d.mot });", "      void d;"]]],
  ["L21 substitution : `case` compte hors de la position de commande", [[G, '      if (commande && mot === "case") cas++;', '      if (mot === "case") cas++;']]],
  ["L22 `(( … ))` n'est pas lu à part (un `<<` y ouvre un here-doc)", [[G, 'if (c === "(" && s === "(" && !dansMot && mots.every((x) => RESERVES.has(x) || x === "for")) {', "if (false) {"]]],
  ["L23 dans `[[ … ]]`, `|` et `(` séparent", [[G, '            else if (mot === "[[" && reserve) crochets = true;', "            else if (false) crochets = true;"]]],
  ["L24 un motif de case est un tube", [[G, "        if (c === \"|\") {\n          finMot();\n          i++;\n          continue;\n        }", "        void 0;"]]],
  ["L25 les motifs d'un case sont jugés comme des commandes", [[G, "  if (m.motif) return []; // les motifs d'un `case` : bash ne les exécute pas", "  void 0;"]]],
  ["L26 une ligne lue seule n'a pas le contexte du case", [[G, "commandesProfondes(l, 0, { motif: motifs.has(n) })", "commandesProfondes(l, 0, { motif: false })"]]],
  ["L27 un `${…}` de bash avale sa substitution (lu d'un seul mot)", [[G, 'if (c === "$" && s === "{" && texte[i + 2] === "{") {', 'if (c === "$" && s === "{") {']]],
  ["L28 un `]]` collé à `&&` ne ferme pas la condition", [[G, '      const fermeCrochets = dansMot && !cite && mot === "]]";', "      const fermeCrochets = false;"]]],
  ["L29 un `${{` jamais fermé avale la suite", [[G, "        if (j < texte.length) {\n          const fin = j + 1;", "        if (true) {\n          const fin = j + 1;"]]],
  // Ce qu'un shell lance.
  ["S01 le script de `bash -c` n'est plus relu", [[G, "      if (c) {\n        if (mot >= 0) relire(m[mot], 0);", "      if (c) {\n        if (false) relire(m[mot], 0);"]]],
  ["S02 `-eo` ne consomme pas `pipefail`", [[G, 'if (lettre === "o" || lettre === "O") j++;', "if (false) j++;"]]],
  ["S03 une here-string donnée à un shell n'est pas relue", [[G, 'if (r.op === "<<<" && r.cible !== undefined) relire(r.cible, 0);', "void 0;"]]],
  ["S04 un here-doc donné à un shell n'est pas relu", [[G, 'if ((r.op === "<<" || r.op === "<<-") && r.corps !== undefined) relire(r.corps, 1);', "void 0;"]]],
  ["S05 eval n'est plus relu", [[G, "if (iEval >= 0 && iEval + 1 < m.length) relire(", "if (false) relire("]]],
  ["S06 la commande de `npm explore` n'est plus relue", [[G, 'if (script.length) relire(script.join(" "), 0);', "void 0;"]]],
  ["S07 un shell sur un tube est admis", [[G, "  if (m.tube) {", "  if (false) {"]]],
  ["S08 xargs devant npm ou npx est admis", [[G, "  d.push(...auditerXargs(m));", "  void 0;"]]],
  ["S09 xargs : une sous-commande non neutre est admise", [[G, '  if (classe && classe !== "neutre") return [', '  if (false) return [']]],
  ["S10 xargs : la chaîne de remplacement est ignorée", [[G, "  const porte = (x) => remp !== null && x.includes(remp);", "  const porte = (x) => false;"]]],
  ["S11 le `-c` de su, flock, sg, script n'est pas relu", [[G, 'const RELAIS_C = ["su", "runuser", "sg", "flock", "script"];', "const RELAIS_C = [];"]]],
  ["S12 `-s` est ignoré", [[G, '        else if (x[0] === "-" && lettre === "s") s = true;', "        else if (false) s = true;"]]],
  ["S13 une affectation devant le shell masque le tube", [[G, "    const k0 = m.findIndex((x) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(x));", "    const k0 = 0;"]]],
  ["S14 `--rcfile` ne prend pas sa valeur", [[G, '    if (x === "--rcfile" || x === "--init-file") {\n      j++;', '    if (x === "--rcfile" || x === "--init-file") {\n      void 0;']]],
  ["S15 la relecture s'arrête au premier niveau", [[G, "    if (profondeur >= 3 || m.motif) continue;", "    if (profondeur >= 1 || m.motif) continue;"]]],
  ["S16 `npm explore` sans `--` n'est pas relu", [[G, '      const script = fin >= 0 ? reste.slice(fin + 1) : reste.filter((x) => !x.startsWith("-")).slice(1);', "      const script = fin >= 0 ? reste.slice(fin + 1) : [];"]]],
  ["S17 les accents graves entre guillemets ne sont pas relus", [[G, '            lire(texte.slice(j + 1, f), false, ligne + lignesEntre(i, j));\n            mot += "`…`";', '            mot += "`…`";']]],
  ["S18 `$\"…\"` n'est pas lu comme des guillemets", [[G, '      if (c === "$" && s === \'"\') {\n        i++;', '      if (false) {\n        i++;']]],
  // npm.
  ["N01 seul le premier mot npm est jugé", [[G, 'else if (estOutil(m[i], "npm")) d.push(...auditerNpm(m, i));', 'else if (estOutil(m[i], "npm")) { d.push(...auditerNpm(m, i)); break; }']]],
  ["N02 une option avant la sous-commande est admise", [[G, 'if (args.some((x) => !x.startsWith("-"))) {', "if (false) {"]]],
  ["N03 une sous-commande variable est admise", [[G, "if (/[$`{}]/.test(args[0])) {", "if (false) {"]]],
  ["N04 une sous-commande à accolades est admise", [[G, "if (/[$`{}]/.test(args[0])) {", "if (/[$`]/.test(args[0])) {"]]],
  ["N05 `link <paquet>` n'est pas une installation", [[G, 'if (classe === "hors" || (classe === "link" && positionnels.length)) {', 'if (classe === "hors") {']]],
  ["N06 uninstall, prune et edit sont neutres", [[G, 'uninstall: "scripts", prune: "scripts", edit: "scripts",', 'uninstall: "neutre", prune: "neutre", edit: "neutre",']]],
  ["N07 `audit fix` n'est lu qu'avant `--`", [[G, 'if (reste.includes("fix"))', 'if (options.includes("fix"))']]],
  ["N08 `audit fix` est admis", [[G, '} else if (classe === "audit") {', "} else if (false) {"]]],
  ["N09 un paquet hors registre est admis", [[G, "if (hors) d.push(", "if (false) d.push("]]],
  ["N10 la valeur d'une option est prise pour une spécification", [[G, "        if (OPTIONS_A_VALEUR.has(x)) k++;", "        void 0;"]]],
  ["N11 un protocole en majuscules n'est pas reconnu", [[G, "  (/^(?:git\\+)?[a-z]+:/i.test(spec) && !/^(?:npm|file):/i.test(spec)) ||", "  (/^(?:git\\+)?[a-z]+:/.test(spec) && !/^(?:npm|file):/i.test(spec)) ||"]]],
  ["N12 un protocole hors de la liste n'est pas reconnu (sourcehut:)", [[G, "  (/^(?:git\\+)?[a-z]+:/i.test(spec) && !/^(?:npm|file):/i.test(spec)) ||", "  /^(?:git\\+|git:|github:|gitlab:|bitbucket:|gist:|https?:)/i.test(spec) ||"]]],
  ["N13 `git@hôte:` n'est pas reconnu", [[G, "  /^[^@\\s]+@[^:/\\s]+:/.test(spec) ||", "  false ||"]]],
  ["N14 `publish` est neutre", [[G, 'diff: "spec", publish: "spec",', 'diff: "spec", publish: "neutre",']]],
  // --ignore-scripts.
  ["I01 toute forme de --ignore-scripts est admise", [[G, 'if (x !== "--ignore-scripts" && x !== "--ignore-scripts=true") return { actif: false, forme: x };', "void 0;"]]],
  ["I02 le mot précédent n'est pas vérifié", [[G, 'if (prec !== null && prec.startsWith("-") && !prec.includes("=") && !BOOLEENS_SURS.has(prec))', "if (false)"]]],
  ["I03 `--ignore-scripts false` est admis", [[G, 'if (x === "--ignore-scripts" && options[k + 1] === "false")', "if (false)"]]],
  ["I04 les booléens sûrs sont vidés", [[G, '["audit", "fund", "progress", "prefer-offline", "prefer-online", "offline", "legacy-peer-deps", "strict-peer-deps", "dry-run", "foreground-scripts"]', "[]"]]],
  ["I05 environnement : toute valeur est admise", [[G, 'if (env === "true") return { actif: true };', "if (env !== undefined) return { actif: true };"]]],
  ["I06 l'environnement est ignoré", [[G, "    const e = /^npm_config_ignore[_-]scripts=(.*)$/i.exec(avant[k]);", "    const e = null;"]]],
  ["I09 une affectation retirée avant npm (`env -i`, `sudo`) compte", [[G, '    const garde = avant.slice(k + 1).every((x) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(x) || x === "env");', "    const garde = true;"]]],
  ["I07 un nom d'option variable est admis", [[G, 'if (/[$`{}]/.test(x.split("=")[0])) return { actif: false, forme: x };', "void 0;"]]],
  ["I08 le drapeau compte après `--`", [[G, "const options = fin < 0 ? reste : reste.slice(0, fin);", "const options = reste;"]]],
  // npx et npm exec.
  ["X01 npx : une option inconnue est admise", [[G, "if (sens === undefined) {", "if (false) {"]]],
  ["X02 npx : --yes est neutre", [[G, '"--yes": "oui", "-y": "oui", "--yes=true": "oui",', '"--yes": "neutre", "-y": "neutre", "--yes=true": "neutre",']]],
  ["X03 npx : une valeur séparée est admise", [[G, 'if (!x.includes("=") && /^(?:true|false|null)$/.test(mots[j + 1] || "")) {', "if (false) {"]]],
  ["X04 npx : --package n'est pas nommé", [[G, 'if (x === "-p" || x === "--package" || x.startsWith("--package=") || x.startsWith("-p=")) {', "if (false) {"]]],
  ["X05 npm exec : les options après l'outil sont ignorées", [[G, "if (!npmExec) break; // npx", "break; // npx"]]],
  ["X06 un outil variable est admis", [[G, "if (spec !== undefined && /[$`{}]/.test(spec))", "if (false)"]]],
  ["X09 un outil à accolades (`{}` de xargs) est admis", [[G, "if (spec !== undefined && /[$`{}]/.test(spec))", "if (spec !== undefined && /[$`]/.test(spec))"]]],
  ["X07 npx lit `--no` comme un booléen", [[G, '  "--no-install": "non", "--yes=false": "non",\n  "-q": "neutre", "--quiet": "neutre",', '  "--no": "non", "--no-yes": "non", "--no-install": "non", "--yes=false": "non",\n  "-q": "neutre", "--quiet": "neutre",']]],
  ["X08 `npx --no -- outil` est refusé", [[G, '    const sens = lues[x] ?? ((x === "--no" || x === "--no-yes") && mots[j + 1] === "--" ? "non" : undefined);', "    const sens = lues[x];"]]],
  // Le workflow.
  ["W01 seuls les run: sont lus", [[G, "if (!libelle) for (const { n, d } of defautsDuShell(valeur))", "if (!libelle && run) for (const { n, d } of defautsDuShell(valeur))"]]],
  ["W02 toute clé `name` est un libellé", [[G, "function estLibelle(chemin) {\n  const n = chemin.length;", 'function estLibelle(chemin) {\n  if (chemin[chemin.length - 1] === "name") return true;\n  const n = chemin.length;']]],
  ["W03 aucun libellé", [[G, "function estLibelle(chemin) {\n  const n = chemin.length;", "function estLibelle(chemin) {\n  return false;\n  const n = chemin.length;"]]],
  ["W04 un run: qui n'est pas une chaîne passe", [[G, "for (const chemin of runsNonChaines(lu.doc))", "for (const chemin of [])"]]],
  ["W05 pas de lecture d'un seul tenant", [[G, "  for (const mots of tenant) sortie.push({ n: mots.ligne, mots, tenant: true });", ""]]],
  ["W08 une `default:` d'entrée est un libellé", [[G, '  if ((a === "inputs" || a === "outputs") && n === 3) return c === "description";', '  if ((a === "inputs" || a === "outputs") && n === 3) return c === "description" || c === "default";']]],
  ["W06 un YAML illisible est avalé", [[G, "lu = chainesDuWorkflow(texte);", "lu = (() => { try { return chainesDuWorkflow(texte); } catch { return { doc: {}, chaines: [] }; } })();"]]],
  ["W07 l'interpolation n'est cherchée qu'en 1re ligne", [[G, R`      valeur.split("\n").forEach((l, i) => {`, R`      valeur.split("\n").slice(0, 1).forEach((l, i) => {`]]],
  // Les actions composites.
  ["A01 `uses: ./` (la racine) n'est pas lu", [[G, R`uses:\s*['"]?\.\/([^\s@#'"]*)/gm`, R`uses:\s*['"]?\.\/([^\s@#'"]+)/gm`], [G, 'if (chemin[chemin.length - 1] === "uses" && v.startsWith("./")) locales.add(v.slice(2).trim());', 'if (false) locales.add("");']]],
  ["A02 la découverte YAML des `uses: ./` est retirée", [[G, 'if (chemin[chemin.length - 1] === "uses" && v.startsWith("./")) locales.add(v.slice(2).trim());', "void 0;"]]],
  ["A03 une action citée par une action n'est pas suivie", [[G, '      citees(fs.readFileSync(path.join(racine, rel), "utf8"));', "      void 0;"]]],
  // Le localisateur.
  ["P01 une clé en ligne est ignorée (dérive)", [[G, "|[{,]\\\\s*)(?:${c}", ")(?:${c}"]]],
  ["P02 le curseur est figé", [[G, "        ligneCur = i;\n        colCur = m.index + m[0].length;", "        void i;"]]],
  ["P03 un bloc est borné au tiret, pas à la clé", [[G, "const bord = m ? m[1].length + m[2].length : seul[1].length;", "const bord = m ? m[1].length : seul[1].length;"]]],
  ["P04 un défaut d'un seul tenant est situé à la 1re ligne", [[G, "sortie.push({ n: mots.ligne, mots, tenant: true })", "sortie.push({ n: 1, mots, tenant: true })"]]],
  // Le lecteur YAML.
  ["Y01 le pliage d'avant (tout joint par une espace)", [[Y, R`let s = plie ? replier(corps) : corps.join("\n");`, R`let s = plie ? corps.join(" ").replace(/  +/g, " ") : corps.join("\n");`]]],
  ["Y02 la ligne qui suit une ligne plus indentée lui est jointe", [[Y, R`else s += "\n".repeat(vides + 1);`, R`else s += plusIndentee ? "\n".repeat(vides + 1) : " ";`]]],
  ["Y03 un indicateur d'indentation est accepté", [[Y, "if (/^[|>](?:[-+]?[0-9]|[0-9][-+]?)$/.test(indic)) throw", "if (false) throw"], [Y, "if (!/^[|>][-+]?$/.test(indic)) throw", "if (!/^[|>][-+]?[0-9]?$/.test(indic)) throw"]]],
  ["Y04 un saut de ligne exotique est lu", [[Y, 'if (s) throw new ErreurYaml("saut de ligne', 'if (false) throw new ErreurYaml("saut de ligne']]],
  ["Y05 tout blanc Unicode est un blanc", [[Y, R`const blanc = (c) => c === " " || c === "\t";`, R`const blanc = (c) => /\s/.test(c);`]]],
  ["Y06 le trim() de JavaScript", [[Y, R`const sansBlancs = (s) => s.replace(/^[ \t]+|[ \t]+$/g, "");`, "const sansBlancs = (s) => s.trim();"]]],
  ["Y07 une virgule coupe un scalaire cité", [[Y, R`if ((c === "'" || c === '"') && /(?:^[ \t]*|:[ \t]+)$/.test(cur)) { q = c; cur += c; continue; }`, "void 0;"]]],
  ["Y08 une paire `clé: valeur` d'une séquence en ligne est lue comme un texte", [[Y, "    if (sequence && /:(?:[ \\t]|$)/.test(", "    if (false && /:(?:[ \\t]|$)/.test("]]],
];

const bac = fs.mkdtempSync(path.join(os.tmpdir(), "reinjections-audit-workflows-"));
try {
  for (const rel of [G, Y, "tests/unit/audit-workflows.test.mjs", ".github/workflows", ".github/actions"]) {
    fs.mkdirSync(path.dirname(path.join(bac, rel)), { recursive: true });
    fs.cpSync(path.join(DEPOT, rel), path.join(bac, rel), { recursive: true });
  }
  const jouer = () => spawnSync(process.execPath, ["--test", "--test-reporter=tap", "tests/unit/audit-workflows.test.mjs"], { cwd: bac, encoding: "utf8" });
  const temoin = jouer();
  if (temoin.status !== 0) {
    console.error("✗ le témoin (gate intacte) n'est pas vert :\n" + temoin.stdout.slice(-2000));
    process.exitCode = 1;
  } else {
    let echecs = 0;
    for (const [nom, remplacements] of M) {
      const originaux = new Map();
      try {
        for (const [rel, cible, vers] of remplacements) {
          const f = path.join(bac, rel);
          if (!originaux.has(f)) originaux.set(f, fs.readFileSync(f, "utf8"));
          const t = fs.readFileSync(f, "utf8");
          const n = t.split(cible).length - 1;
          if (n !== 1) throw new Error(`cible trouvée ${n} fois : ${cible.slice(0, 70)}`);
          fs.writeFileSync(f, t.split(cible).join(vers));
        }
        const r = jouer();
        const rouges = [...new Set((r.stdout.match(/^not ok \d+ - (.*)$/gm) || []).map((l) => l.replace(/^not ok \d+ - /, "").slice(0, 48)))];
        if (r.status === 0) echecs++;
        console.log(`${r.status === 0 ? "✗ SURVIT" : "✓ rougit"} — ${nom}${r.status === 0 ? "" : " ⟵ " + rouges.slice(0, 2).join(" | ")}`);
      } catch (e) {
        echecs++;
        console.log(`✗ ERREUR — ${nom} : ${e.message}`);
      } finally {
        for (const [f, t] of originaux) fs.writeFileSync(f, t);
      }
    }
    console.log(`\n${M.length} réinjections : ${M.length - echecs} rougissent, ${echecs} survivent ou ne trouvent plus leur cible`);
    if (echecs) process.exitCode = 1;
  }
} finally {
  fs.rmSync(bac, { recursive: true, force: true });
}
