// ═══════════════════════════════════════════════════════════════════════════
// LES PAQUETS NPM ET DENO QUI TOURNENT AVEC UN SECRET EN CI VIENNENT D'UN LOCKFILE OU D'UNE EMPREINTE, JAMAIS
// DE « LA DERNIÈRE » VERSION PUBLIÉE (2026-11-14). Pas Node (correctif de la 22 non figé, setup-node) ni Chromium
// (révision figée, archive vérifiée par sa seule taille) : restes ouverts, dits dans la fiche du journal.
//
// Le 2026-11-14 à 11:29 UTC, le déploiement de production a rougi sur « Installer netlify-cli »
// (run 43588829557) : npm E404 sur fast-json-stringify 7.3.6, publiée une minute plus tôt et pas
// encore servie. `npm install netlify-cli@27.1.2` figeait la CLI, pas ses ~1 120 dépendances : une
// version malveillante fraîche serait entrée aussi vite, et cette CLI tourne avec NETLIFY_AUTH_TOKEN,
// APRÈS le contrôle « Artefact identique ». La CLI, elle, téléchargeait en plus à chaque déploiement le
// dernier Deno publié, sans empreinte, pour regrouper les fonctions de bord — avec le jeton dans son
// environnement. Même défaut dans controle-realtime.yml : supabase-js installé par `npm install
// <paquet>@<version>` (tout l'arbre racine libre), puis la clé service_role.
//
// Ce test tient :
//   ① les lockfiles que la CI installe (racine, dashboard, .github/netlify-cli) : chaque archive est
//     l'archive CANONIQUE de son paquet sur registry.npmjs.org (nom et version de l'entrée), avec son
//     empreinte sha512 ; un paquet `inBundle` est déclaré par son parent ; la racine du lockfile est le
//     package.json et l'`overrides` y produit son effet ; les outils qui reçoivent un secret
//     (netlify-cli, @supabase/supabase-js) sont épinglés à une version EXACTE ; les binaires Linux du
//     runner sont dans le lockfile ;
//   ② deploy.yml : les jobs `deploy` et `preview` installent netlify-cli par `npm ci --ignore-scripts`
//     sur ce lockfile, puis Deno par version et empreinte, par les MÊMES blocs, sans secret, AVANT
//     l'étape qui exécute la CLI — la plage principale de chaque copie d'edge-bundler accepte ce Deno (son pont
//     hérité, Deno 1.x dans deno-cli-v1, ne prend jamais le PATH : son piège le fait échouer fermé) ;
//     et dans les workflows et actions composites que lit la gate : aucune ligne non commentée ne porte
//     `netlify-cli@` (une version en dur, même posée dans une variable), et aucune commande — lue comme la gate la
//     lit : toute valeur du YAML hors libellés, d'un seul tenant aussi, le script d'un shell relu — ne nomme
//     `netlify` ou `netlify-cli` comme mot. Hors de portée : un nom de CLI recomposé (variable, accolades,
//     expression `${{ }}`) ; un shell nourri par un tube est refusé par la gate, pas ici ;
//   ③ ces blocs `run:` RÉELS, joués contre de faux outils : la copie et `npm ci` sur les fichiers du
//     dépôt ; une archive Deno à la mauvaise empreinte ROUGIT sans rien poser sur le PATH ; la bonne
//     pose Deno sur le PATH et bloque tout téléchargement ; l'étape d'envoi exécute la CLI installée ;
//   ④ controle-realtime.yml : `npm ci --ignore-scripts` avant le contrôle, rien d'autre ; Dependabot
//     surveille .github/netlify-cli ; ce banc est dans `npm run verif` ;
//   ⑤ MUTATIONS rejouées sur les textes réels : chacune rougit, en nommant le bon défaut.
// La règle générale — aucune installation hors lockfile dans un workflow — vit dans
// scripts/audit-workflows.js. D'où viennent ces versions, comment les monter : .github/netlify-cli/README.md.
// ═══════════════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { parse } from "./lib/yaml-mini.mjs";
import "./lib/bash-windows.mjs";

const { commandesDuWorkflow, actionsComposites } = createRequire(import.meta.url)("../../scripts/audit-workflows.js");

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8").split("\r\n").join("\n");
/** Tous les workflows et les actions composites que la gate lit, par chemin. */
const lireWorkflows = () => {
  const noms = fs.readdirSync(path.join(RACINE, ".github/workflows")).filter((f) => /\.ya?ml$/.test(f)).map((f) => `.github/workflows/${f}`);
  const textes = noms.map(lire);
  const composites = actionsComposites(textes, { actions: path.join(RACINE, ".github/actions"), racine: RACINE });
  return Object.fromEntries([...noms, ...composites].map((f) => [f, lire(f)]));
};
const reel = () => ({
  workflows: lireWorkflows(),
  netlifyPkg: lire(".github/netlify-cli/package.json"),
  netlifyLock: lire(".github/netlify-cli/package-lock.json"),
  racinePkg: lire("package.json"),
  racineLock: lire("package-lock.json"),
  dashboardPkg: lire("dashboard/package.json"),
  dashboardLock: lire("dashboard/package-lock.json"),
  deploy: lire(".github/workflows/deploy.yml"),
  controle: lire(".github/workflows/controle-realtime.yml"),
  dependabot: lire(".github/dependabot.yml"),
});

const REGISTRE = "https://registry.npmjs.org/";
const EXACTE = /^\d+\.\d+\.\d+$/;
const SHA512 = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
// Les binaires que le runner (Linux x64) exécute : sans eux dans le lockfile, `npm ci` n'installerait rien
// pour cette plateforme, et l'outil irait chercher son binaire ailleurs (le repli d'esbuild télécharge).
const BINAIRES_LINUX = ["@esbuild/linux-x64", "@img/sharp-linux-x64", "@img/sharp-libvips-linux-x64", "@netlify/local-functions-proxy-linux-x64"];
// La plage de Deno qu'accepte chaque version d'@netlify/edge-bundler présente dans le lockfile, LUE dans son
// dist/node/bridge.js (DENO_VERSION_RANGE) le 2026-11-14. Hors de la plage, edge-bundler téléchargerait un
// autre Deno ; l'étape Deno l'en empêche, et le déploiement échouerait. Une version absente ici rougit le
// banc : la lire dans le paquet, l'inscrire, et vérifier que le Deno figé y entre.
const PLAGE_DENO_PAR_EDGE_BUNDLER = { "15.1.1": "^2.4.2", "16.0.4": "^2.4.2", "16.2.0": "^2.4.2" };

const nomDeCle = (cle) => cle.slice(cle.lastIndexOf("node_modules/") + "node_modules/".length);
const archiveCanonique = (nom, version) => `${REGISTRE}${nom}/-/${nom.split("/").pop()}-${version}.tgz`;

/** ① Défauts d'un lockfile : provenance et empreinte de chaque archive, accord avec package.json, épinglages. */
function auditerLockfile(nom, pkgTexte, lockTexte, epingles = []) {
  const d = [];
  let pkg, lock;
  try {
    pkg = JSON.parse(pkgTexte);
    lock = JSON.parse(lockTexte);
  } catch (e) {
    return [`${nom} : JSON illisible (${e.message})`];
  }
  if (lock.lockfileVersion !== 3) d.push(`${nom} : lockfileVersion ${lock.lockfileVersion}, 3 attendu`);
  const paquets = lock.packages || {};
  const tete = paquets[""] || {};
  for (const champ of ["dependencies", "devDependencies", "optionalDependencies"]) {
    if (JSON.stringify(tete[champ] || {}) !== JSON.stringify(pkg[champ] || {})) {
      d.push(`${nom} : ${champ} de la racine du lockfile ≠ package.json — npm ci refuserait, ou installerait autre chose`);
    }
  }
  // npm n'écrit PAS l'`overrides` dans le lockfile. `npm ci` refuse (EUSAGE) un overrides que le lockfile contredit,
  // mais seulement au déploiement ; ce banc le voit dès `npm run verif`, en lisant son EFFET : chaque copie du
  // paquet forcé porte la version forcée. Un overrides RETIRÉ passe sans bruit, sans effet sur l'arbre installé.
  for (const [p, v] of Object.entries(pkg.overrides || {})) {
    if (typeof v !== "string") continue;
    const copies = Object.entries(paquets).filter(([cle]) => cle && nomDeCle(cle) === p);
    if (!copies.length) d.push(`${nom} : l'overrides force ${p}@${v}, que le lockfile n'installe nulle part`);
    for (const [cle, e] of copies) if (e.version !== v) d.push(`${nom} : l'overrides force ${p}@${v}, le lockfile installe ${cle}@${e.version}`);
  }
  for (const [p, champ] of epingles) {
    const v = (pkg[champ] || {})[p];
    if (!EXACTE.test(String(v))) d.push(`${nom} : ${p} n'est pas épinglé à une version exacte dans package.json (${champ} : ${v})`);
    const installe = paquets[`node_modules/${p}`];
    if (!installe || installe.version !== v) d.push(`${nom} : le lockfile installe ${p}@${installe && installe.version} au lieu de ${v}`);
  }
  for (const [cle, e] of Object.entries(paquets)) {
    if (!cle) continue;
    if (e.link) {
      d.push(`${nom} : ${cle} est un lien local (link) — hors du registre`);
      continue;
    }
    const p = nomDeCle(cle);
    if (e.name !== undefined && e.name !== p) d.push(`${nom} : ${cle} est un alias de ${e.name} — un autre paquet sous ce nom`);
    if (e.inBundle) {
      // Livré DANS l'archive de son parent (bundleDependencies) : couvert par l'empreinte du parent — à condition
      // que le parent le déclare.
      const parent = paquets[cle.slice(0, cle.lastIndexOf("/node_modules/"))] || {};
      const livre = parent.bundleDependencies === true || (Array.isArray(parent.bundleDependencies) && parent.bundleDependencies.includes(p));
      if (!livre) d.push(`${nom} : ${cle} se dit livré par son parent (inBundle), que le parent ne déclare pas`);
      continue;
    }
    if (e.resolved !== archiveCanonique(p, e.version)) d.push(`${nom} : ${cle} vient de ${e.resolved}, pas de l'archive canonique ${archiveCanonique(p, e.version)} — hors de ${REGISTRE}, ou un autre paquet`);
    if (!SHA512.test(String(e.integrity))) d.push(`${nom} : ${cle} sans empreinte sha512 (${e.integrity})`);
  }
  return d;
}

/** Les binaires Linux et les plages Deno du lockfile de netlify-cli. */
function auditerArbreNetlify(lockTexte, versionDeno) {
  const d = [];
  const paquets = JSON.parse(lockTexte).packages || {};
  for (const b of BINAIRES_LINUX) if (!paquets[`node_modules/${b}`]) d.push(`.github/netlify-cli : ${b} absent du lockfile — le runner Linux n'aurait pas ce binaire`);
  const copies = Object.entries(paquets).filter(([cle]) => cle && nomDeCle(cle) === "@netlify/edge-bundler");
  if (!copies.length) d.push(".github/netlify-cli : aucune copie d'@netlify/edge-bundler — le banc ne sait plus quel Deno la CLI accepte");
  for (const [cle, e] of copies) {
    const plage = PLAGE_DENO_PAR_EDGE_BUNDLER[e.version];
    if (!plage) d.push(`${cle}@${e.version} : plage Deno inconnue — la lire dans son dist/node/bridge.js (DENO_VERSION_RANGE) et l'inscrire au banc`);
    else if (versionDeno && !satisfaitCaret(versionDeno, plage)) d.push(`${cle}@${e.version} accepte Deno ${plage}, pas ${versionDeno} — elle en téléchargerait un autre`);
  }
  return d;
}

function satisfaitCaret(version, plage) {
  const v = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const p = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(plage);
  if (!v || !p) return false;
  const [a, b] = [v.slice(1).map(Number), p.slice(1).map(Number)];
  if (a[0] !== b[0] || b[0] === 0) return false;
  for (let i = 1; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

const ligneDeCode = (run) => String(run || "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const estInstallNetlify = (s) => /netlify-cli/.test(String(s.run || "")) && ligneDeCode(s.run).some((l) => /^npm\b/.test(l));
const estInstallDeno = (s) => /^DENO_VERSION=/m.test(ligneDeCode(s.run).join("\n"));
const estEnvoi = (s) => /"\$NETLIFY_BIN" deploy\b/.test(String(s.run || ""));
const valeur = (code, nom) => {
  const m = new RegExp(`^${nom}="([^"]*)"$`).exec(code.find((l) => l.startsWith(`${nom}=`)) || "");
  return m ? m[1] : null;
};

/** ② Défauts des installations de netlify-cli et de Deno dans deploy.yml. */
function auditerDeploy(texte) {
  const d = [];
  const doc = parse(texte);
  const formes = { "netlify-cli": new Map(), Deno: new Map() };
  let versionDeno = null;
  for (const id of ["deploy", "preview"]) {
    const etapes = (doc.jobs && doc.jobs[id] && doc.jobs[id].steps) || [];
    if (!etapes.length) {
      d.push(`${id} : job introuvable`);
      continue;
    }
    const iNetlify = etapes.findIndex(estInstallNetlify);
    const iDeno = etapes.findIndex(estInstallDeno);
    const iEnvoi = etapes.findIndex(estEnvoi);
    if (iEnvoi < 0) d.push(`${id} : l'étape qui exécute « netlify deploy » est introuvable`);
    if (iNetlify < 0) d.push(`${id} : aucune étape n'installe netlify-cli`);
    if (iDeno < 0) d.push(`${id} : aucune étape n'installe Deno — la CLI téléchargerait le dernier publié, sans empreinte, et l'exécuterait avec le jeton`);
    for (const [quoi, i] of [["netlify-cli", iNetlify], ["Deno", iDeno]]) {
      if (i < 0) continue;
      if (iEnvoi >= 0 && iEnvoi < i) d.push(`${id} : ${quoi} est installé APRÈS l'étape qui exécute la CLI`);
      if (JSON.stringify(etapes[i].env || {}).includes("secrets.")) d.push(`${id} : l'étape d'installation de ${quoi} porte un secret — un script de tiers le lirait`);
      if (!ligneDeCode(etapes[i].run).includes("set -euo pipefail")) d.push(`${id} : l'installation de ${quoi} n'a pas « set -euo pipefail » — une marche ratée laisserait la suite continuer`);
    }
    if (iNetlify >= 0) {
      const s = etapes[iNetlify];
      const code = ligneDeCode(s.run);
      const ci = code.filter((l) => /^npm ci\b/.test(l));
      if (ci.length !== 1) d.push(`${id} : ${ci.length} appel(s) à « npm ci » — un seul attendu`);
      else {
        if (!/ --prefix "\$RUNNER_NETLIFY"( |$)/.test(ci[0])) d.push(`${id} : « npm ci » ne vise pas le dossier où le lockfile est copié`);
        if (!/ --ignore-scripts( |$)/.test(ci[0])) d.push(`${id} : « npm ci » sans --ignore-scripts — les scripts d'installation de ~1 120 paquets tourneraient`);
      }
      if (code.some((l) => /\bnpm\b/.test(l) && !/^npm ci\b/.test(l))) d.push(`${id} : un appel à npm autre que « npm ci » — hors lockfile`);
      if (code.some((l) => /\bnpx\b/.test(l))) d.push(`${id} : npx installe la dernière version publiée`);
      const cp = code.find((l) => /^cp /.test(l)) || "";
      for (const f of ["package.json", "package-lock.json"]) {
        if (!cp.includes(`"$GITHUB_WORKSPACE/.github/netlify-cli/${f}"`)) d.push(`${id} : ${f} n'est pas copié depuis .github/netlify-cli/ — le lockfile du dépôt ne serait pas celui installé`);
      }
      if (!/ "\$RUNNER_NETLIFY\/"$/.test(cp)) d.push(`${id} : la copie ne va pas dans "$RUNNER_NETLIFY/"`);
      if (/\s-r\b|\s-R\b|\/\.\s|\*/.test(cp)) d.push(`${id} : la copie prend un dossier entier — un .npmrc ou un npm-shrinkwrap.json y entrerait`);
      if (!code.includes('RUNNER_NETLIFY="${RUNNER_TEMP:-/tmp}/netlify-cli"')) d.push(`${id} : RUNNER_NETLIFY a changé de place`);
      if (!code.includes('rm -rf "$GITHUB_WORKSPACE/.netlify"')) d.push(`${id} : un .netlify/ du dépôt resterait sous la CLI — ses fonctions internes seraient regroupées et exécutées avec le jeton`);
      formes["netlify-cli"].set(String(s.run), [...(formes["netlify-cli"].get(String(s.run)) || []), id]);
    }
    if (iDeno >= 0) {
      const s = etapes[iDeno];
      const code = ligneDeCode(s.run);
      const version = valeur(code, "DENO_VERSION");
      const empreinte = valeur(code, "DENO_ZIP_SHA256");
      if (!EXACTE.test(String(version))) d.push(`${id} : DENO_VERSION n'est pas une version exacte (${version})`);
      else versionDeno = version;
      if (!/^[0-9a-f]{64}$/.test(String(empreinte))) d.push(`${id} : DENO_ZIP_SHA256 n'est pas une empreinte sha256 (${empreinte})`);
      const telechargement = code.find((l) => /^curl /.test(l)) || "";
      if (!telechargement.includes('"https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-x86_64-unknown-linux-gnu.zip"')) {
        d.push(`${id} : Deno n'est pas pris dans la release GitHub de DENO_VERSION`);
      }
      if (!/ --fail( |$)/.test(telechargement)) d.push(`${id} : curl sans --fail — une page d'erreur passerait pour l'archive`);
      if (!code.includes('echo "${DENO_ZIP_SHA256}  ${DENO_BIN_DIR}/deno.zip" | sha256sum --check --strict -')) d.push(`${id} : l'empreinte de l'archive Deno n'est pas vérifiée`);
      const iVerif = code.findIndex((l) => /sha256sum --check/.test(l));
      const iUnzip = code.findIndex((l) => /^unzip /.test(l));
      const iPath = code.indexOf('echo "$DENO_BIN_DIR" >> "$GITHUB_PATH"');
      if (iPath < 0) d.push(`${id} : Deno n'est pas posé sur le PATH — la CLI en téléchargerait un autre`);
      if (iVerif < 0 || iUnzip < iVerif || iPath < iVerif) d.push(`${id} : l'archive Deno est ouverte ou posée sur le PATH AVANT d'être vérifiée`);
      for (const piege of ["deno-cli", "deno-cli-v1"]) {
        if (!code.includes(`: > "$CONFIG_NETLIFY/${piege}"`)) d.push(`${id} : rien n'empêche edge-bundler de télécharger un Deno dans ${piege}`);
      }
      if (!code.includes('CONFIG_NETLIFY="${XDG_CONFIG_HOME:-$HOME/.config}/netlify"')) d.push(`${id} : les pièges ne sont pas là où edge-bundler télécharge`);
      formes.Deno.set(String(s.run), [...(formes.Deno.get(String(s.run)) || []), id]);
    }
    if (iEnvoi >= 0 && !String(etapes[iEnvoi].run).includes('NETLIFY_BIN="${RUNNER_TEMP:-/tmp}/netlify-cli/node_modules/.bin/netlify"')) {
      d.push(`${id} : la CLI exécutée n'est pas celle que l'étape d'installation a posée`);
    }
  }
  for (const [quoi, f] of Object.entries(formes)) {
    if (f.size > 1) d.push(`les installations de ${quoi} ont dérivé (${[...f.values()].map((v) => v.join("+")).join(" ≠ ")}) : un seul bloc, deux copies`);
  }
  return { defauts: d, versionDeno };
}

/**
 * ② Aucune commande des workflows et actions composites que lit la gate ne lance la CLI autrement que par
 * "$NETLIFY_BIN" — la gate, elle, ne voit pas un `npx netlify-cli` sans version. Deux règles, parce qu'aucune ne
 * suffit seule (relecture du delta, 14/11) : une ligne non commentée qui porte `netlify-cli@` (version en dur, même
 * posée dans une variable puis lancée par `npx "$CLI"`) ; une commande — lue comme la gate la lit : toute valeur du
 * YAML hors libellés, d'un seul tenant aussi, le script d'un shell relu — qui nomme `netlify` ou `netlify-cli` comme
 * mot. La règle d'avant ne lisait que deploy.yml, et seulement les mots de ses scripts : `bash -c 'npx netlify-cli
 * deploy'`, ou la même ligne dans veille-production.yml (dont l'étape Verdict porte le jeton), passaient. Ce qu'elle
 * ne voit pas : un nom recomposé (variable, accolades, expression `${{ }}`) ; un shell nourri par un tube, que la gate
 * refuse, elle, dans `npm run verif`.
 */
function auditerCliNetlify(textes) {
  const d = [];
  for (const [nom, texte] of Object.entries(textes)) {
    texte.split("\n").forEach((l, i) => {
      if (!/^\s*#/.test(l) && /netlify-cli@/.test(l)) d.push(`${nom}:${i + 1} : netlify-cli installé par version en dur : ${l.trim()}`);
    });
    let cmds;
    try {
      cmds = commandesDuWorkflow(texte);
    } catch (e) {
      d.push(`${nom} : illisible pour la gate (${e.message}) — rien n'y est certifié`);
      continue;
    }
    for (const { ligne, mots } of cmds) {
      if (mots.some((x) => /^(?:netlify|netlify-cli)(?:@.*)?$/.test(x))) d.push(`${nom}:${ligne ?? "?"} : la CLI est lancée autrement que par "$NETLIFY_BIN" (${mots.join(" ")}) — hors du lockfile figé`);
    }
  }
  return d;
}

/** ④ Défauts de l'installation de controle-realtime.yml. */
function auditerControle(texte) {
  const d = [];
  const etapes = (parse(texte).jobs?.controler?.steps) || [];
  const iScript = etapes.findIndex((s) => /scripts\/controle-realtime\.mjs/.test(String(s.run || "")));
  const iCi = etapes.findIndex((s) => ligneDeCode(s.run).some((l) => /^npm ci\b/.test(l)));
  if (iScript < 0) d.push("controle-realtime.yml : l'étape qui lance scripts/controle-realtime.mjs est introuvable");
  if (iCi < 0 || (iScript >= 0 && iCi > iScript)) d.push("controle-realtime.yml : aucun « npm ci » avant le contrôle — le client Supabase ne viendrait pas du lockfile");
  else if (!ligneDeCode(etapes[iCi].run).some((l) => /^npm ci\b.* --ignore-scripts( |$)/.test(l))) {
    d.push("controle-realtime.yml : « npm ci » sans --ignore-scripts — des scripts de tiers tourneraient sur le runner qui reçoit la clé service_role");
  }
  for (const s of etapes) {
    if (ligneDeCode(s.run).some((l) => /\bnpm\b/.test(l) && !/^npm (ci|run)\b/.test(l))) d.push(`controle-realtime.yml : « ${s.name} » appelle npm hors de « npm ci » / « npm run »`);
  }
  return d;
}

/** ④ Dependabot surveille le lockfile de netlify-cli, avec la politique des autres lockfiles npm. */
function auditerDependabot(texte) {
  const maj = (parse(texte).updates || []).find((u) => u["package-ecosystem"] === "npm" && u.directory === "/.github/netlify-cli");
  if (!maj) return ["dependabot.yml : /.github/netlify-cli n'est pas surveillé — aucun avis de sécurité sur l'arbre de la CLI"];
  const d = [];
  if (String(maj["open-pull-requests-limit"]) !== "0") d.push("dependabot.yml : /.github/netlify-cli doit rester en mises à jour de sécurité seulement (open-pull-requests-limit: 0)");
  // Le délai (cooldown) ne vaut que pour les mises à jour de VERSION, coupées ici : c'est une cohérence avec les autres
  // entrées, pas une protection. Les PR de sécurité arrivent sans délai, et se vérifient à la main (README).
  if (String((maj.cooldown || {})["default-days"]) !== "7") d.push("dependabot.yml : /.github/netlify-cli ne suit pas la politique des autres lockfiles npm (cooldown 7)");
  return d;
}

const LOCKFILES = (f) => [
  ...auditerLockfile(".github/netlify-cli", f.netlifyPkg, f.netlifyLock, [["netlify-cli", "dependencies"]]),
  ...auditerLockfile("racine", f.racinePkg, f.racineLock, [["@supabase/supabase-js", "devDependencies"]]),
  ...auditerLockfile("dashboard", f.dashboardPkg, f.dashboardLock),
];
/** Les workflows lus par la règle de la CLI : ceux du dépôt, deploy.yml et controle-realtime.yml tels que la mutation les a faits. */
const workflowsDe = (f) => ({ ...f.workflows, ".github/workflows/deploy.yml": f.deploy, ".github/workflows/controle-realtime.yml": f.controle });
const TOUT = (f) => {
  const deploy = auditerDeploy(f.deploy);
  return [
    ...LOCKFILES(f), ...deploy.defauts, ...auditerCliNetlify(workflowsDe(f)), ...auditerArbreNetlify(f.netlifyLock, deploy.versionDeno),
    ...auditerControle(f.controle), ...auditerDependabot(f.dependabot),
  ];
};

test("① les trois lockfiles que la CI installe : archives canoniques du registre npm, sha512, épinglages exacts", () => {
  assert.deepEqual(LOCKFILES(reel()), []);
  // Ce que le lockfile de netlify-cli fige, et que la production installe depuis le 2026-11-14.
  const lock = JSON.parse(reel().netlifyLock);
  assert.equal(lock.packages["node_modules/netlify-cli"].version, JSON.parse(reel().netlifyPkg).dependencies["netlify-cli"]);
  assert.equal(lock.packages["node_modules/@netlify/build"].version, "36.4.7", "l'arbre éprouvé en production depuis le 9/09");
  // Le seul paquet du contrôle Realtime pris dans node_modules est celui que la racine épingle.
  assert.match(lire("scripts/controle-realtime.mjs"), /from "@supabase\/supabase-js"/);
});

test("② deploy.yml : netlify-cli par npm ci --ignore-scripts, Deno par version et empreinte, mêmes blocs dans deploy et preview, avant l'envoi", () => {
  const { defauts, versionDeno } = auditerDeploy(reel().deploy);
  assert.deepEqual(defauts, []);
  assert.deepEqual(auditerArbreNetlify(reel().netlifyLock, versionDeno), []);
  // La CLI n'est lancée, dans aucun workflow ni action composite, autrement que par "$NETLIFY_BIN".
  const f = reel();
  assert.ok(Object.keys(f.workflows).length >= 15, "tous les workflows et l'action composite sont lus : " + Object.keys(f.workflows).join(", "));
  assert.deepEqual(auditerCliNetlify(workflowsDe(f)), []);
});

test("④ controle-realtime, Dependabot et `npm run verif` tiennent leur part", () => {
  assert.deepEqual(auditerControle(reel().controle), []);
  assert.deepEqual(auditerDependabot(reel().dependabot), []);
  assert.ok(JSON.parse(reel().racinePkg).scripts.verif.includes("node --test tests/unit/outils-ci-figes.test.mjs"), "le banc doit tourner dans npm run verif");
});

// ── ③ Les blocs `run:` réels, joués contre de faux outils ──────────────────
const posix = (p) => p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (x, dr) => "/" + dr.toLowerCase());
const etapeDe = (texte, job, quoi) => parse(texte).jobs[job].steps.find(quoi);

/** Prépare un bac : un faux dépôt, un RUNNER_TEMP, un HOME, un dossier de faux outils, un journal. */
const BACS = [];
test.after(() => {
  for (const b of BACS) fs.rmSync(b, { recursive: true, force: true });
});

function bac(outils) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "outils-ci-figes-"));
  BACS.push(racine);
  const d = { racine, ws: path.join(racine, "ws"), tmp: path.join(racine, "runner-temp"), home: path.join(racine, "home"), bin: path.join(racine, "bin"), vu: path.join(racine, "vu") };
  for (const x of [d.ws, d.tmp, d.home, d.bin, d.vu]) fs.mkdirSync(x, { recursive: true });
  d.log = path.join(racine, "journal.txt");
  d.githubPath = path.join(racine, "github-path.txt");
  fs.writeFileSync(d.log, "");
  fs.writeFileSync(d.githubPath, "");
  for (const [nom, corps] of Object.entries(outils)) {
    fs.writeFileSync(path.join(d.bin, nom), "#!/usr/bin/env bash\n" + corps + "\n");
    fs.chmodSync(path.join(d.bin, nom), 0o755);
  }
  return d;
}

function jouer(d, script, envEnPlus = {}) {
  fs.writeFileSync(path.join(d.racine, "etape.sh"), script);
  const env = { ...process.env, PATH: posix(d.bin) + path.delimiter + process.env.PATH, LOG: posix(d.log), VU: posix(d.vu), GITHUB_WORKSPACE: posix(d.ws), RUNNER_TEMP: posix(d.tmp), HOME: posix(d.home), GITHUB_PATH: posix(d.githubPath), ...envEnPlus };
  delete env.XDG_CONFIG_HOME;
  const r = spawnSync("bash", ["-e", path.join(d.racine, "etape.sh")], { encoding: "utf8", timeout: 20000, env });
  return { code: r.status, sortie: String(r.stdout || "") + String(r.stderr || ""), lignes: fs.readFileSync(d.log, "utf8").split("\n").filter(Boolean) };
}

// Le faux npm note ses arguments, recopie ce qu'il trouve dans le dossier --prefix (ce que `npm ci` y lirait),
// et y pose une fausse CLI à l'endroit où npm poserait la vraie.
const FAUX_NPM = [
  'echo "npm $*" >> "$LOG"',
  'p=""; while [ $# -gt 0 ]; do if [ "$1" = --prefix ]; then p="$2"; fi; shift; done',
  'for f in package.json package-lock.json; do if [ -f "$p/$f" ]; then cp "$p/$f" "$VU/"; fi; done',
  'mkdir -p "$p/node_modules/.bin"',
  'printf "%s\\n" "#!/usr/bin/env bash" "echo \\"netlify \\$*\\" >> \\"\\$LOG\\"" > "$p/node_modules/.bin/netlify"',
  'chmod +x "$p/node_modules/.bin/netlify"',
].join("\n");

function jouerNetlify({ avecLock = true } = {}) {
  const f = reel();
  const d = bac({ npm: FAUX_NPM });
  fs.mkdirSync(path.join(d.ws, ".github", "netlify-cli"), { recursive: true });
  fs.writeFileSync(path.join(d.ws, ".github", "netlify-cli", "package.json"), f.netlifyPkg);
  if (avecLock) fs.writeFileSync(path.join(d.ws, ".github", "netlify-cli", "package-lock.json"), f.netlifyLock);
  // Une fonction « interne » versionnée sous .netlify/ : l'étape doit la retirer avant toute installation.
  fs.mkdirSync(path.join(d.ws, ".netlify", "edge-functions"), { recursive: true });
  fs.writeFileSync(path.join(d.ws, ".netlify", "edge-functions", "interne.js"), "export default () => new Response('banc');\n");
  const r = jouer(d, etapeDe(f.deploy, "deploy", estInstallNetlify).run);
  const lu = (nom) => (fs.existsSync(path.join(d.vu, nom)) ? fs.readFileSync(path.join(d.vu, nom), "utf8") : null);
  return { ...r, d, f, lu };
}

test("③ netlify-cli : le bloc réel copie le package.json et le lockfile du dépôt, puis appelle npm ci dessus, une fois", () => {
  const r = jouerNetlify();
  assert.equal(r.code, 0, r.sortie);
  assert.deepEqual(r.lignes, [`npm ci --prefix ${posix(r.d.tmp)}/netlify-cli --ignore-scripts --no-audit --no-fund`]);
  assert.equal(r.lu("package.json"), r.f.netlifyPkg);
  assert.equal(r.lu("package-lock.json"), r.f.netlifyLock);
  assert.ok(!fs.existsSync(path.join(r.d.ws, ".netlify")), "le .netlify/ du dépôt doit avoir disparu avant la CLI");
});

test("③ netlify-cli : sans lockfile dans le dépôt, l'étape est ROUGE et npm n'est jamais appelé", () => {
  const r = jouerNetlify({ avecLock: false });
  assert.notEqual(r.code, 0, "une étape verte installerait sans lockfile");
  assert.deepEqual(r.lignes, []);
  assert.match(r.sortie, /package-lock\.json/, "le journal du job nomme le fichier manquant");
});

test("③ l'étape d'envoi exécute la CLI que l'installation a posée, et elle seule", () => {
  const r = jouerNetlify();
  assert.equal(r.code, 0, r.sortie);
  fs.writeFileSync(r.d.log, "");
  const envoi = etapeDe(r.f.deploy, "deploy", estEnvoi).run;
  const e = jouer(r.d, envoi, { NETLIFY_AUTH_TOKEN: "jeton-de-banc", NETLIFY_SITE_ID: "site-de-banc" });
  assert.equal(e.code, 0, e.sortie);
  assert.deepEqual(e.lignes, ["netlify --version", `netlify deploy --prod --dir ${posix(r.d.ws)}/dist --site site-de-banc`]);
});

// Deno : un faux curl écrit l'archive demandée (son contenu vient du banc), un faux unzip pose un faux deno.
const FAUX_DENO_OUTILS = {
  curl: ['out=""; url=""; while [ $# -gt 0 ]; do case "$1" in --output) out="$2"; shift ;; http*) url="$1" ;; esac; shift; done', 'echo "curl $url" >> "$LOG"', 'printf "%s" "$CONTENU" > "$out"'].join("\n"),
  unzip: ['echo "unzip $*" >> "$LOG"', 'dir=""; while [ $# -gt 0 ]; do if [ "$1" = -d ]; then dir="$2"; fi; shift; done', 'printf "%s\\n" "#!/usr/bin/env bash" "echo deno 2.9.8" > "$dir/deno"', 'chmod +x "$dir/deno"'].join("\n"),
};

function jouerDeno({ empreinteJuste }) {
  const f = reel();
  const contenu = "archive de banc";
  let run = etapeDe(f.deploy, "deploy", estInstallDeno).run;
  if (empreinteJuste) {
    const juste = crypto.createHash("sha256").update(contenu).digest("hex");
    run = run.replace(/^(\s*)DENO_ZIP_SHA256="[0-9a-f]{64}"$/m, (x, ind) => `${ind}DENO_ZIP_SHA256="${juste}"`);
    assert.match(run, new RegExp(juste), "le banc doit pouvoir poser l'empreinte de son archive");
  }
  const d = bac(FAUX_DENO_OUTILS);
  const r = jouer(d, run, { CONTENU: contenu });
  const config = path.join(d.home, ".config", "netlify");
  return { ...r, d, chemin: fs.readFileSync(d.githubPath, "utf8"), pieges: ["deno-cli", "deno-cli-v1"].map((p) => fs.existsSync(path.join(config, p)) && fs.statSync(path.join(config, p)).isFile()) };
}

test("③ Deno : une archive à la mauvaise empreinte ROUGIT l'étape, sans rien ouvrir ni poser sur le PATH", () => {
  const r = jouerDeno({ empreinteJuste: false });
  assert.notEqual(r.code, 0, "une archive non vérifiée passerait");
  assert.equal(r.chemin, "", "rien ne doit être posé sur le PATH");
  assert.ok(!r.lignes.some((l) => l.startsWith("unzip")), "l'archive ne doit pas être ouverte");
  assert.deepEqual(r.lignes, ["curl https://github.com/denoland/deno/releases/download/v2.9.8/deno-x86_64-unknown-linux-gnu.zip"]);
});

test("③ Deno : l'archive vérifiée est posée sur le PATH, et tout téléchargement d'edge-bundler est rendu impossible", () => {
  const r = jouerDeno({ empreinteJuste: true });
  assert.equal(r.code, 0, r.sortie);
  assert.equal(r.chemin.trim(), `${posix(r.d.tmp)}/deno`);
  assert.match(r.sortie, /deno 2\.9\.8/, "le Deno posé répond");
  assert.deepEqual(r.pieges, [true, true], "deno-cli et deno-cli-v1 doivent être des FICHIERS, là où edge-bundler créerait ses dossiers");
});

// ── ⑤ Mutations rejouées sur les textes réels ─────────────────────────────
/** Remplace une cible qui doit exister exactement `n` fois (sinon la mutation ne mute rien). */
function remplacer(texte, de, vers, n = 1) {
  const vu = texte.split(de).length - 1;
  if (vu !== n) throw new Error(`cible trouvée ${vu} fois au lieu de ${n} : ${de.slice(0, 80)}`);
  return texte.split(de).join(vers);
}
/** Remplace la DERNIÈRE occurrence (celle du job preview). */
function remplacerDerniere(texte, de, vers) {
  const i = texte.lastIndexOf(de);
  if (i < 0) throw new Error(`cible absente : ${de.slice(0, 80)}`);
  return texte.slice(0, i) + vers + texte.slice(i + de.length);
}
/** Retire, `n` fois exactement, l'étape qui commence par `debut` (jusqu'à l'étape suivante). */
function retirerEtapes(texte, debut, n) {
  const vu = texte.split(debut).length - 1;
  if (vu !== n) throw new Error(`étape trouvée ${vu} fois au lieu de ${n}`);
  let i;
  while ((i = texte.indexOf(debut)) >= 0) {
    const suite = texte.indexOf("\n      - name:", i + debut.length);
    if (suite < 0) throw new Error("étape sans suivante");
    texte = texte.slice(0, i) + texte.slice(suite + 1);
  }
  return texte;
}
const NPM_CI = 'npm ci --prefix "$RUNNER_NETLIFY" --ignore-scripts --no-audit --no-fund';
const COPIE = 'cp "$GITHUB_WORKSPACE/.github/netlify-cli/package.json" "$GITHUB_WORKSPACE/.github/netlify-cli/package-lock.json" "$RUNNER_NETLIFY/"';
const NOM_INSTALL = "      - name: Installer netlify-cli depuis son lockfile (sans le jeton dans l'environnement)\n        run: |";
const NOM_DENO = "      - name: Installer Deno, version et empreinte figées (sans le jeton dans l'environnement)\n        run: |";
const avecLock = (f, muter) => {
  const lock = JSON.parse(f.netlifyLock);
  muter(lock);
  return { ...f, netlifyLock: JSON.stringify(lock, null, 2) + "\n" };
};
const premiereCle = (lock) => Object.keys(lock.packages).find((k) => k && !lock.packages[k].inBundle);
/** Insère une étape (son corps, sans tiret) juste avant l'étape d'envoi du job `deploy`. */
const avantEnvoi = (deploy, corps) => remplacer(deploy, "      - name: Deploy to Netlify\n", `      - name: Étape ajoutée\n${corps}\n      - name: Deploy to Netlify\n`);

const MUTATIONS = [
  {
    nom: "retour à `npm install netlify-cli@27.1.2` (deploy et preview)",
    muter: (f) => ({ ...f, deploy: remplacer(f.deploy, NPM_CI, 'npm install --prefix "$RUNNER_NETLIFY" --no-audit --no-fund netlify-cli@27.1.2', 2) }),
    attendu: /npm ci|version en dur/,
  },
  { nom: "--ignore-scripts retiré des deux copies", muter: (f) => ({ ...f, deploy: remplacer(f.deploy, " --ignore-scripts --no-audit", " --no-audit", 2) }), attendu: /ignore-scripts/ },
  { nom: "--ignore-scripts retiré de l'aperçu seulement", muter: (f) => ({ ...f, deploy: remplacerDerniere(f.deploy, " --ignore-scripts --no-audit", " --no-audit") }), attendu: /ignore-scripts|ont dérivé/ },
  {
    nom: "le lockfile n'est plus copié",
    muter: (f) => ({ ...f, deploy: remplacer(f.deploy, COPIE, 'cp "$GITHUB_WORKSPACE/.github/netlify-cli/package.json" "$RUNNER_NETLIFY/"', 2) }),
    attendu: /package-lock\.json n'est pas copié/,
  },
  {
    nom: "le dossier entier est copié (un .npmrc y entrerait)",
    muter: (f) => ({ ...f, deploy: remplacer(f.deploy, COPIE, COPIE.replace("cp ", "cp -r \"$GITHUB_WORKSPACE/.github/netlify-cli/.\" "), 2) }),
    attendu: /dossier entier/,
  },
  {
    nom: "la CLI lancée par npx, sans version, dans une étape à jeton (la gate ne le voit pas)",
    muter: (f) => ({
      ...f,
      deploy: remplacer(f.deploy, "      - name: Deploy to Netlify\n", "      - name: Envoi parallèle\n        env:\n          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}\n        run: npx netlify-cli deploy --prod --dir dist\n\n      - name: Deploy to Netlify\n"),
    }),
    attendu: /lancée autrement que par "\$NETLIFY_BIN" \(npx netlify-cli deploy/,
  },
  // Relecture du delta (14/11) : la règle d'avant ne lisait que deploy.yml, et seulement les mots de ses scripts.
  {
    nom: "la CLI par `bash -c` (un seul mot pour une lecture qui ne relit pas le script)",
    muter: (f) => ({ ...f, deploy: avantEnvoi(f.deploy, "        env:\n          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}\n        run: bash -c 'npx netlify-cli deploy --prod --dir dist'\n") }),
    attendu: /deploy\.yml:\d+ : la CLI est lancée autrement que par "\$NETLIFY_BIN" \(npx netlify-cli deploy/,
  },
  {
    nom: "la CLI par `eval`",
    muter: (f) => ({ ...f, deploy: avantEnvoi(f.deploy, '        env:\n          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}\n        run: eval "npx netlify-cli deploy --prod --dir dist"\n') }),
    attendu: /la CLI est lancée autrement que par "\$NETLIFY_BIN" \(npx netlify-cli deploy/,
  },
  {
    nom: "une version en dur posée dans une variable, lancée par `npx \"$CLI\"`",
    muter: (f) => ({ ...f, deploy: avantEnvoi(f.deploy, '        env:\n          CLI: netlify-cli@27.1.2\n        run: npx "$CLI" deploy --prod --dir dist\n') }),
    attendu: /netlify-cli installé par version en dur : CLI: netlify-cli@27\.1\.2/,
  },
  {
    nom: "la forme de l'incident dans une chaîne passée à bash, sous `timeout`",
    muter: (f) => ({ ...f, deploy: avantEnvoi(f.deploy, '        run: timeout 10m bash -c "npx --yes netlify-cli@27.1.2 deploy --prod --dir dist"\n') }),
    attendu: /lancée autrement que par "\$NETLIFY_BIN" \(npx --yes netlify-cli@27\.1\.2 deploy/,
  },
  {
    nom: "la CLI par une action de relance (`with: command:`), hors de tout run:",
    muter: (f) => ({ ...f, deploy: avantEnvoi(f.deploy, "        uses: nick-fields/retry@ce71cc2ab81d554ebbe88c79ab5975992d79ba08\n        with:\n          command: npx netlify-cli deploy --prod --dir dist\n") }),
    attendu: /la CLI est lancée autrement que par "\$NETLIFY_BIN" \(npx netlify-cli deploy/,
  },
  // Relecture du 15/11 : les formes que la lecture d'avant ne relisait pas.
  {
    nom: "la CLI par `bash -eo pipefail -c` (les options de GitHub lui-même)",
    muter: (f) => ({ ...f, deploy: avantEnvoi(f.deploy, "        env:\n          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}\n        run: bash -eo pipefail -c 'npx netlify-cli deploy --prod --dir dist'\n") }),
    attendu: /deploy\.yml:\d+ : la CLI est lancée autrement que par "\$NETLIFY_BIN" \(npx netlify-cli deploy/,
  },
  {
    nom: "la CLI posée dans un `env: name:`, lancée par `$name`",
    muter: (f) => ({ ...f, deploy: avantEnvoi(f.deploy, "        env:\n          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}\n          name: npx netlify-cli deploy --prod --dir dist\n        run: $name\n") }),
    attendu: /la CLI est lancée autrement que par "\$NETLIFY_BIN" \(npx netlify-cli deploy/,
  },
  {
    nom: "la CLI par une here-string donnée à bash",
    muter: (f) => ({ ...f, deploy: avantEnvoi(f.deploy, "        env:\n          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}\n        run: bash <<< 'npx netlify-cli deploy --prod --dir dist'\n") }),
    attendu: /la CLI est lancée autrement que par "\$NETLIFY_BIN" \(npx netlify-cli deploy/,
  },
  {
    nom: "la CLI derrière une chaîne ouverte sur deux lignes, dans `with: command:` (lecture d'un seul tenant)",
    muter: (f) => ({ ...f, deploy: avantEnvoi(f.deploy, '        uses: nick-fields/retry@ce71cc2ab81d554ebbe88c79ab5975992d79ba08\n        with:\n          command: |\n            echo "x\n            #" ; npx netlify-cli deploy --prod --dir dist\n') }),
    attendu: /la CLI est lancée autrement que par "\$NETLIFY_BIN" \(npx netlify-cli deploy/,
  },
  {
    nom: "la CLI dans l'action composite du dépôt",
    muter: (f) => {
      const nom = ".github/actions/claude-auth-guard/action.yml";
      return { ...f, workflows: { ...f.workflows, [nom]: remplacer(f.workflows[nom], "  steps:\n", "  steps:\n    - shell: bash\n      run: npx netlify-cli deploy --prod --dir dist\n") } };
    },
    attendu: /claude-auth-guard\/action\.yml:\d+ : la CLI est lancée autrement que par "\$NETLIFY_BIN" \(npx netlify-cli deploy/,
  },
  {
    nom: "la CLI par npx dans un AUTRE workflow : veille-production.yml (son étape Verdict porte le jeton)",
    muter: (f) => {
      const nom = ".github/workflows/veille-production.yml";
      const piege = "\n  piege:\n    runs-on: ubuntu-latest\n    steps:\n      - env:\n          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}\n        run: npx netlify-cli api listSites\n";
      return { ...f, workflows: { ...f.workflows, [nom]: f.workflows[nom].replace(/\n*$/, "\n") + piege } };
    },
    attendu: /veille-production\.yml:\d+ : la CLI est lancée autrement que par "\$NETLIFY_BIN" \(npx netlify-cli api listSites\)/,
  },
  { nom: "le .netlify/ du dépôt n'est plus retiré", muter: (f) => ({ ...f, deploy: remplacer(f.deploy, '          rm -rf "$GITHUB_WORKSPACE/.netlify"\n', "", 2) }), attendu: /un \.netlify\/ du dépôt resterait/ },
  {
    nom: "le jeton posé sur l'étape d'installation",
    muter: (f) => ({ ...f, deploy: remplacer(f.deploy, NOM_INSTALL, NOM_INSTALL.replace("        run: |", "        env:\n          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}\n        run: |"), 2) }),
    attendu: /netlify-cli porte un secret/,
  },
  {
    nom: "l'aperçu dérive (une option en plus dans preview seulement)",
    muter: (f) => ({ ...f, deploy: remplacerDerniere(f.deploy, NPM_CI, NPM_CI + " --prefer-online") }),
    attendu: /installations de netlify-cli ont dérivé/,
  },
  { nom: "Deno : étape retirée des deux jobs", muter: (f) => ({ ...f, deploy: retirerEtapes(f.deploy, NOM_DENO, 2) }), attendu: /aucune étape n'installe Deno/ },
  { nom: "Deno : version en plage", muter: (f) => ({ ...f, deploy: remplacer(f.deploy, 'DENO_VERSION="2.9.8"', 'DENO_VERSION="2.x"', 2) }), attendu: /DENO_VERSION n'est pas une version exacte/ },
  { nom: "Deno : version hors de la plage d'edge-bundler", muter: (f) => ({ ...f, deploy: remplacer(f.deploy, 'DENO_VERSION="2.9.8"', 'DENO_VERSION="3.0.0"', 2) }), attendu: /accepte Deno \^2\.4\.2, pas 3\.0\.0/ },
  { nom: "Deno : empreinte tronquée", muter: (f) => ({ ...f, deploy: remplacer(f.deploy, 'c4609"', 'c46"', 2) }), attendu: /n'est pas une empreinte sha256/ },
  {
    nom: "Deno : pris au dernier publié (dl.deno.land)",
    muter: (f) => ({ ...f, deploy: remplacer(f.deploy, "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/", "https://dl.deno.land/release/v${DENO_VERSION}/", 2) }),
    attendu: /pas pris dans la release GitHub/,
  },
  {
    nom: "Deno : empreinte non vérifiée",
    muter: (f) => ({ ...f, deploy: remplacer(f.deploy, '          echo "${DENO_ZIP_SHA256}  ${DENO_BIN_DIR}/deno.zip" | sha256sum --check --strict -\n', "", 2) }),
    attendu: /n'est pas vérifiée/,
  },
  {
    nom: "Deno : pas sur le PATH",
    muter: (f) => ({ ...f, deploy: remplacer(f.deploy, '          echo "$DENO_BIN_DIR" >> "$GITHUB_PATH"\n', "", 2) }),
    attendu: /pas posé sur le PATH/,
  },
  { nom: "Deno : piège deno-cli retiré", muter: (f) => ({ ...f, deploy: remplacer(f.deploy, '          : > "$CONFIG_NETLIFY/deno-cli"\n', "", 2) }), attendu: /télécharger un Deno dans deno-cli$/ },
  {
    nom: "Deno : le jeton posé sur l'étape",
    muter: (f) => ({ ...f, deploy: remplacer(f.deploy, NOM_DENO, NOM_DENO.replace("        run: |", "        env:\n          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}\n        run: |"), 2) }),
    attendu: /Deno porte un secret/,
  },
  {
    nom: "edge-bundler monté vers une version que le banc ne connaît pas",
    muter: (f) => avecLock(f, (l) => (l.packages["node_modules/@netlify/edge-bundler"].version = "16.3.0")),
    attendu: /16\.3\.0 : plage Deno inconnue/,
  },
  { nom: "un binaire Linux retiré du lockfile", muter: (f) => avecLock(f, (l) => delete l.packages["node_modules/@esbuild/linux-x64"]), attendu: /@esbuild\/linux-x64 absent/ },
  { nom: "netlify-cli en plage (^27.1.2)", muter: (f) => ({ ...f, netlifyPkg: remplacer(f.netlifyPkg, '"netlify-cli": "27.1.2"', '"netlify-cli": "^27.1.2"') }), attendu: /version exacte/ },
  { nom: "le lockfile installe une autre version de la CLI", muter: (f) => avecLock(f, (l) => (l.packages["node_modules/netlify-cli"].version = "27.1.3")), attendu: /installe netlify-cli@27\.1\.3/ },
  {
    nom: "une archive servie hors du registre npm",
    muter: (f) => avecLock(f, (l) => (l.packages[premiereCle(l)].resolved = "https://registre.example.com/paquet-1.0.0.tgz")),
    attendu: /pas de l'archive canonique/,
  },
  {
    nom: "une archive du registre, mais d'UN AUTRE paquet (injection par lockfile)",
    muter: (f) => avecLock(f, (l) => (l.packages["node_modules/esbuild"].resolved = "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz")),
    attendu: /node_modules\/esbuild vient de https:\/\/registry\.npmjs\.org\/left-pad/,
  },
  { nom: "un alias (un autre paquet sous ce nom)", muter: (f) => avecLock(f, (l) => (l.packages["node_modules/esbuild"].name = "esbuild-piege")), attendu: /est un alias de esbuild-piege/ },
  { nom: "une archive sans empreinte", muter: (f) => avecLock(f, (l) => delete l.packages[premiereCle(l)].integrity), attendu: /sans empreinte sha512/ },
  { nom: "une empreinte sha1", muter: (f) => avecLock(f, (l) => (l.packages[premiereCle(l)].integrity = "sha1-2jmj7l5rSw0yVb/vlWAYkK/YBwk=")), attendu: /sans empreinte sha512/ },
  {
    nom: "un paquet qui se dit livré par un parent qui ne le déclare pas",
    muter: (f) => avecLock(f, (l) => (l.packages["node_modules/@parcel/watcher-wasm"].bundleDependencies = [])),
    attendu: /se dit livré par son parent/,
  },
  { nom: "un lien local dans le lockfile", muter: (f) => avecLock(f, (l) => (l.packages["node_modules/paquet-local"] = { resolved: "outils/paquet-local", link: true })), attendu: /lien local/ },
  {
    nom: "le lockfile n'applique plus l'overrides (@netlify/build 36.4.8 au lieu de 36.4.7)",
    muter: (f) => avecLock(f, (l) => (l.packages["node_modules/@netlify/build"].version = "36.4.8")),
    attendu: /l'overrides force @netlify\/build@36\.4\.7, le lockfile installe/,
  },
  {
    nom: "une dépendance ajoutée au package.json sans régénérer le lockfile",
    muter: (f) => ({ ...f, netlifyPkg: remplacer(f.netlifyPkg, '"netlify-cli": "27.1.2"', '"netlify-cli": "27.1.2",\n    "left-pad": "1.3.0"') }),
    attendu: /dependencies de la racine du lockfile ≠ package\.json/,
  },
  {
    nom: "contrôle Realtime : retour à `npm install @supabase/supabase-js@2.58.0`",
    muter: (f) => ({ ...f, controle: remplacer(f.controle, "        run: npm ci --ignore-scripts --no-audit --no-fund", "        run: npm install --no-audit --no-fund --ignore-scripts --no-package-lock @supabase/supabase-js@2.58.0") }),
    attendu: /aucun « npm ci »|hors de « npm ci »/,
  },
  { nom: "contrôle Realtime : npm ci sans --ignore-scripts", muter: (f) => ({ ...f, controle: remplacer(f.controle, "        run: npm ci --ignore-scripts --no-audit --no-fund", "        run: npm ci --no-audit --no-fund") }), attendu: /sans --ignore-scripts/ },
  {
    nom: "supabase-js en plage à la racine (^2.58.0)",
    muter: (f) => ({ ...f, racinePkg: remplacer(f.racinePkg, '"@supabase/supabase-js": "2.58.0"', '"@supabase/supabase-js": "^2.58.0"') }),
    attendu: /supabase-js n'est pas épinglé à une version exacte/,
  },
  { nom: "Dependabot ne surveille plus la CLI", muter: (f) => ({ ...f, dependabot: remplacer(f.dependabot, "directory: /.github/netlify-cli", "directory: /.github/autre") }), attendu: /n'est pas surveillé/ },
];

test("⑤ MUTATIONS rejouées sur les textes réels : chacune rougit, en nommant le bon défaut", () => {
  assert.deepEqual(TOUT(reel()), [], "le dépôt réel doit passer avant de muter");
  for (const m of MUTATIONS) {
    const defauts = TOUT(m.muter(reel()));
    assert.ok(defauts.some((x) => m.attendu.test(x)), `${m.nom} : non vu — défauts rendus : ${JSON.stringify(defauts).slice(0, 600)}`);
  }
});
