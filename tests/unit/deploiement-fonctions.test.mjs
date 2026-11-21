// ═══════════════════════════════════════════════════════════════════════════
// UN PUSH NE DÉPLOIE QUE LES FONCTIONS EN RETARD, ET UNE FONCTION RETENUE NE
// RETIENT PLUS LES AUTRES (2026-11-21).
//
// CE QUI S'EST PASSÉ. Le 19/11 à 10:43 UTC, le pilote ouvre les médias protégés
// (`reglages_distants.medias_proteges = {"actif": true}`). Le manifeste des
// prérequis exigeait encore, pour `private-media`, « réglage à false » — le
// contrôle de la PRÉPARATION du serveur de médias (ADR-014, étape 1). Le
// workflow vérifiant les six fonctions à chaque push, tout déploiement était
// retenu EN ENTIER : le 20/11, le push c6efb27, qui ne changeait qu'un module
// emporté par `pilotage`, a rougi (run 44831711346) — et personne ne l'a vu.
//
// CE QUE CE BANC TIENT. Il joue le job RÉEL de `.github/workflows/edge-functions.yml`,
// étape par étape, sous `bash -e`, comme le runner : les `if:` et les `env:` sont
// évalués par le lecteur d'expressions du dépôt, les sorties d'étape et
// `$GITHUB_ENV` circulent. Les scripts du job tournent TELS QU'ILS SONT, dans un
// dépôt git jetable (une copie des fonctions, des scripts et du manifeste, avec
// ses propres commits). Seuls trois bords sont faux : la CLI `supabase` et
// `curl` (deux scripts qui journalisent), et le réseau (`tests/unit/lib/
// faux-monde-fonctions.mjs`, chargé par NODE_OPTIONS — aucun crochet de test
// dans le code de production).
//   ① ② la sélection : seules les fonctions qu'un changement concerne ; ce
//       qui n'est attribuable à personne (config, carte d'imports) les concerne toutes ;
//   ③ la retenue partielle, dite et expliquée, puis le rattrapage ;
//   ④ private-media ouverte se redéploie ; la fumée exige l'état lu en base ;
//   ⑤ une cible illisible arrête tout ; ⑥ rien en retard, rien ne part — mais
//       tout ce qui est servi est éprouvé ; ⑥ bis une fumée rouge RESTE rouge au
//       run relancé et au push suivant (relecture adverse du 21/11) ;
//   ⑦ à la demande ; ⑧ le doute déploie ; ⑨ un run ancien ne fait rien reculer ;
//   ⑩ les réinjections : chaque défaut d'avant, remis dans le workflow, se voit ;
//   ⑪ à ⑮ les scripts, fonction par fonction, et l'accord des listes.
// ⚠️ Ce fichier tourne AVANT `supabase functions deploy` (étape « Verrous » du
// workflow) : ce qui décide de ce qui part s'éprouve avant de partir.
// ═══════════════════════════════════════════════════════════════════════════
import "./lib/bash-windows.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "./lib/yaml-mini.mjs";
import { evaluer, decide } from "./lib/expression-github.mjs";
import { selectionner, changementsQuiConcernent, lireRevisionServie, comparateurGit, lireFonctions, etablirSelection } from "../../scripts/fonctions-a-deployer.mjs";
import { lireObjet, sqlPrerequis, etatsLus, dresserPlan } from "../../scripts/verifier-prerequis-fonctions.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8").split("\r\n").join("\n");
const WORKFLOW = lire(".github/workflows/edge-functions.yml");
const MANIFESTE = ".passio/deploiement/prerequis-fonctions.json";
const FONCTIONS = ["ask-ai", "delete-account", "export-account", "notify-call", "pilotage", "private-media"];
const SHARED = "supabase/functions/_shared/";
const PROD = "njkiyoklssvefstljemx";
const PRECHARGE = pathToFileURL(path.join(RACINE, "tests/unit/lib/faux-monde-fonctions.mjs")).href;
const FICHIER_WORKFLOW = ".github/workflows/edge-functions.yml";
const COPIES = ["supabase/functions", "scripts/fonctions-a-deployer.mjs", "scripts/verifier-prerequis-fonctions.mjs", "scripts/fumee-private-media.mjs", "scripts/lib/lecteur-imports.mjs", MANIFESTE, FICHIER_WORKFLOW];
const FONCTION_ETAT = /\b(?:always|failure|cancelled|success)\s*\(/;

// ── Le monde jetable : un dépôt git, un état servi, une fausse CLI ──────────
const BACS = [];
process.on("exit", () => { for (const b of BACS) fs.rmSync(b, { recursive: true, force: true }); });
const posix = (p) => p.replace(/^([A-Za-z]):/, (x, d) => "/" + d.toLowerCase());

function git(monde, ...args) {
  const r = spawnSync("git", ["-c", "user.name=banc", "-c", "user.email=banc@passio.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "-c", "core.autocrlf=false", ...args], { cwd: monde.depot, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")} : ${r.stderr}`);
  return r.stdout.trim();
}

function nouveauMonde() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "deploiement-fonctions-"));
  BACS.push(base);
  const monde = { base, depot: path.join(base, "depot"), etat: path.join(base, "etat"), bin: path.join(base, "bin"), resume: path.join(base, "resume.md"), n: 0 };
  for (const d of [monde.depot, path.join(monde.etat, "servies"), path.join(monde.etat, "cli-echec"), path.join(monde.etat, "porte-ouverte"), monde.bin]) fs.mkdirSync(d, { recursive: true });
  for (const f of COPIES) fs.cpSync(path.join(RACINE, f), path.join(monde.depot, f), { recursive: true });
  // La fausse CLI : journalise, et « sert » la révision écrite dans le bundle (ce que lit la fumée).
  fs.writeFileSync(path.join(monde.bin, "supabase"), [
    "#!/usr/bin/env bash",
    'echo "$*" >> "$PASSIO_FAUX_MONDE/cli.log"',
    'if [ "${1:-} ${2:-}" = "functions deploy" ]; then',
    '  if [ -e "$PASSIO_FAUX_MONDE/cli-echec/$3" ]; then echo "fausse CLI : déploiement de $3 refusé" >&2; exit 1; fi',
    '  sed -n \'s/^export const REVISION = "\\(.*\\)";$/\\1/p\' supabase/functions/_shared/revision.js > "$PASSIO_FAUX_MONDE/servies/$3"',
    "fi",
    "exit 0",
  ].join("\n") + "\n");
  // Le faux curl de la fumée : 200 à OPTIONS, 401 à POST, et la révision servie en en-tête. Il note qui il
  // éprouve ; `porte-ouverte/<fonction>` simule une fonction qui répond 200 SANS jeton (la porte ne tient plus).
  fs.writeFileSync(path.join(monde.bin, "curl"), [
    "#!/usr/bin/env bash",
    'url=""; tete=0; post=0',
    'for a in "$@"; do case "$a" in -sI) tete=1 ;; POST) post=1 ;; https://*) url="$a" ;; esac; done',
    'f="${url##*/}"',
    'rev="$(cat "$PASSIO_FAUX_MONDE/servies/$f" 2>/dev/null || true)"',
    'if [ "$tete" = 1 ]; then echo "$f" >> "$PASSIO_FAUX_MONDE/fumee.log"; printf \'HTTP/2 200\\r\\nx-passio-revision: %s\\r\\n\\r\\n\' "$rev"; exit 0; fi',
    'if [ "$post" = 1 ] && [ -e "$PASSIO_FAUX_MONDE/porte-ouverte/$f" ]; then printf 200; exit 0; fi',
    'if [ "$post" = 1 ]; then printf 401; else printf 200; fi',
  ].join("\n") + "\n");
  for (const f of ["supabase", "curl"]) fs.chmodSync(path.join(monde.bin, f), 0o755);
  git(monde, "init", "-q", "-b", "main");
  git(monde, "add", "-A");
  git(monde, "commit", "-q", "-m", "A");
  monde.A = git(monde, "rev-parse", "HEAD");
  servir(monde, Object.fromEntries(FONCTIONS.map((f) => [f, monde.A])));
  // Par défaut : la cible a tout, et les médias protégés sont OUVERTS — l'état de la production depuis le 19/11.
  scenario(monde, { absents: [], reglage: true });
  return monde;
}
const scenario = (monde, s) => fs.writeFileSync(path.join(monde.etat, "scenario.json"), JSON.stringify(s));
function servir(monde, revisions) {
  for (const [f, rev] of Object.entries(revisions)) {
    if (rev === null) fs.rmSync(path.join(monde.etat, "servies", f), { force: true });
    else fs.writeFileSync(path.join(monde.etat, "servies", f), rev + "\n");
  }
}
const servie = (monde, f) => { try { return fs.readFileSync(path.join(monde.etat, "servies", f), "utf8").trim(); } catch (_e) { return null; } };
/** Un commit de plus : chaque fichier nommé reçoit une ligne. Rend son SHA. */
function modifier(monde, fichiers, message = "changement") {
  for (const f of fichiers) fs.appendFileSync(path.join(monde.depot, f), `\n// ${message} ${++monde.n}\n`);
  git(monde, "add", "-A");
  git(monde, "commit", "-q", "-m", message);
  return git(monde, "rev-parse", "HEAD");
}

/**
 * Le job `deployer`, joué comme le runner : chaque étape `run:` sous `bash -e`, dans l'ordre ; un `if:`
 * faux la saute ; après un échec, plus rien ne tourne (aucune étape n'a de fonction d'état — vérifié).
 */
function jouerJob(monde, { evenement = "push", fonction = "", cible = "production", workflow = WORKFLOW } = {}) {
  for (const f of ["cli.log", "specs.log", "reseau.log", "fumee.log"]) fs.rmSync(path.join(monde.etat, f), { force: true });
  fs.writeFileSync(monde.resume, "");
  const doc = parse(workflow);
  const job = doc.jobs.deployer;
  const sha = git(monde, "rev-parse", "HEAD");
  const ctx = {
    github: { event_name: evenement, sha, ref: "refs/heads/main", event: { inputs: evenement === "workflow_dispatch" ? { fonction, cible } : {} } },
    secrets: { SUPABASE_ACCESS_TOKEN: "jeton-synthetique" },
    steps: {},
  };
  const texte = (v) => (v === null || v === undefined ? "" : String(v));
  const interpoler = (t) => String(t).replace(/\$\{\{([\s\S]*?)\}\}/g, (_x, e) => texte(evaluer(e.trim(), ctx)));
  const envWorkflow = Object.fromEntries(Object.entries(doc.env || {}).map(([k, v]) => [k, interpoler(v)]));
  const persistant = {};   // ce que les étapes écrivent dans $GITHUB_ENV
  const etapes = [];
  let sortie = "";
  let echec = false;
  job.steps.forEach((s, i) => {
    const nom = s.name || s.uses || `étape ${i + 1}`;
    assert.ok(s.if === undefined || !FONCTION_ETAT.test(String(s.if)), `« ${nom} » : une fonction d'état dans un if: — ce banc ne la joue pas`);
    if (s.uses) return;
    if (echec) { etapes.push({ nom, etat: "non jouée" }); return; }
    if (s.if !== undefined && !decide(String(s.if).replace(/^\$\{\{|\}\}$/g, "").trim(), ctx)) { etapes.push({ nom, etat: "sautée" }); return; }
    const sorties = path.join(monde.base, `sorties-${i}.txt`), envEcrit = path.join(monde.base, `env-${i}.txt`), script = path.join(monde.base, `etape-${i}.sh`);
    fs.writeFileSync(sorties, "");
    fs.writeFileSync(envEcrit, "");
    fs.writeFileSync(script, interpoler(s.run));
    const r = spawnSync("bash", ["-e", script], {
      cwd: monde.depot, encoding: "utf8", timeout: 60000,
      env: {
        PATH: [posix(monde.bin), posix(path.dirname(process.execPath)), process.env.PATH].join(path.delimiter),
        HOME: monde.base, USERPROFILE: monde.base,   // jamais le jeton d'un poste (~/.supabase/access-token)
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        ...envWorkflow, ...persistant,
        ...Object.fromEntries(Object.entries(s.env || {}).map(([k, v]) => [k, interpoler(v)])),
        GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: evenement, GITHUB_SHA: sha,
        GITHUB_OUTPUT: sorties, GITHUB_ENV: envEcrit, GITHUB_STEP_SUMMARY: monde.resume,
        PASSIO_FAUX_MONDE: monde.etat, NODE_OPTIONS: "--import=" + PRECHARGE,
      },
    });
    sortie += `── ${nom} ──\n${r.stdout || ""}${r.stderr || ""}`;
    const paires = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    if (s.id) ctx.steps[s.id] = { outputs: paires(sorties) };
    Object.assign(persistant, paires(envEcrit));
    etapes.push({ nom, etat: r.status === 0 ? "réussie" : "en échec" });
    if (r.status !== 0) echec = true;
  });
  const lignes = (f) => { try { return fs.readFileSync(path.join(monde.etat, f), "utf8").split("\n").filter(Boolean); } catch (_e) { return []; } };
  const cli = lignes("cli.log");
  const sale = git(monde, "status", "--porcelain");
  // Le runner jette son espace de travail : la révision écrite dans le bundle ne survit pas au job (un
  // commit du banc qui l'emporterait mettrait les six fonctions en retard — revision.js est dans chaque clôture).
  git(monde, "checkout", "-q", "--", ".");
  return {
    sale,
    code: echec ? 1 : 0, sha, etapes, sortie, cli,
    deployees: cli.filter((l) => l.startsWith("functions deploy ")).map((l) => l.split(" ")[2]),
    specs: lignes("specs.log"), reseau: lignes("reseau.log"),
    // Ce que la fumée a éprouvé : par curl (les cinq), ou par la lecture des capacités (private-media).
    eprouvees: [...new Set([...lignes("fumee.log"), ...(lignes("reseau.log").some((l) => /^GET .*\/private-media\/capabilities$/.test(l)) ? ["private-media"] : [])])].sort(),
    resume: fs.readFileSync(monde.resume, "utf8"),
    etat: (nom) => (etapes.find((e) => e.nom.startsWith(nom)) || {}).etat,
    sorties: Object.fromEntries(Object.entries(ctx.steps).map(([k, v]) => [k, v.outputs])),
  };
}
const SPEC_REGLAGE = "reglage:medias_proteges.actif:booleen";
// Un prérequis que private-media est SEULE à exiger (les trois registres, export-account les exige aussi).
const ABSENT_MEDIAS = "function:public.media_resoudre(text,text,uuid,text)";
const SPEC_PILOTAGE = "table:public.telemetry_events";

// ── ① ② La sélection ────────────────────────────────────────────────────────
test("① le 20/11 rejoué : un module emporté par pilotage seul change, médias protégés OUVERTS — pilotage part, les cinq autres ne sont ni vérifiées ni déployées, le run est vert", () => {
  const m = nouveauMonde();
  const B = modifier(m, [SHARED + "politique-autonomie.js"]);
  const r = jouerJob(m);
  assert.equal(r.code, 0, r.sortie);
  assert.deepEqual(r.deployees, ["pilotage"]);
  assert.deepEqual(r.cli, [`functions deploy pilotage --project-ref ${PROD} --yes`]);
  // Vérifiée : pilotage seule. Aucun prérequis de private-media n'a été demandé à la cible.
  assert.ok(r.specs.includes(SPEC_PILOTAGE), "prémisse : les prérequis de pilotage sont lus");
  assert.ok(!r.specs.includes(SPEC_REGLAGE) && !r.specs.some((s) => /media_/.test(s)), "private-media n'est pas vérifiée : le changement ne la concerne pas");
  assert.equal(r.sorties.selection.concernees, "pilotage");
  assert.equal(r.sorties.selection.a_jour, "ask-ai delete-account export-account notify-call private-media");
  assert.equal(servie(m, "pilotage"), B);
  for (const f of FONCTIONS.filter((x) => x !== "pilotage")) assert.equal(servie(m, f), m.A, f + " sert toujours sa version");
  assert.match(r.resume, /\*\*pilotage\*\* : à déployer — sert [0-9a-f]{7} ; changé depuis : supabase\/functions\/_shared\/politique-autonomie\.js/);
  assert.match(r.resume, /\*\*private-media\*\* : à jour/);
  assert.match(r.resume, /- Déployées : pilotage\n- Déjà à jour \(non redéployées, éprouvées quand même\) : ask-ai delete-account export-account notify-call private-media\n- Retenues \(un prérequis SQL obligatoire manque\) : aucune/);
  assert.equal(r.etat("Verdict"), "sautée");
  // Non redéployées, les cinq autres sont ÉPROUVÉES quand même, à la révision qu'elles servent.
  assert.deepEqual(r.eprouvees, FONCTIONS);
  assert.equal(r.sorties.selection.servies, FONCTIONS.filter((f) => f !== "pilotage").map((f) => `${f}=${m.A}`).join(" "));
  assert.match(r.sortie, new RegExp(`✅ pilotage \\(déployée\\) : OPTIONS 200, POST sans jeton 401, révision servie = ${B}`));
  assert.match(r.sortie, new RegExp(`✅ ask-ai \\(à jour, non redéployée\\) : OPTIONS 200, POST sans jeton 401, révision servie = ${m.A}`));
  assert.match(r.sortie, new RegExp(`✅ private-media \\(à jour, non redéployée\\) : contrat des capacités, état du réglage et révision servie = ${m.A}`));
  assert.equal(r.sorties.retenue.etat_medias_proteges_actif, "true", "l'état du réglage est lu même quand private-media n'est pas vérifiée");
});

test("② un push qui touche _shared déploie les fonctions qui l'emportent, et elles seules — par la clôture des imports, jusqu'au module importé par un module", () => {
  const m = nouveauMonde();
  modifier(m, [SHARED + "plafond.js"]);
  let r = jouerJob(m);
  assert.equal(r.code, 0, r.sortie);
  assert.deepEqual(r.deployees, ["ask-ai", "export-account", "notify-call", "pilotage"]);
  // contrats-actions.js n'est importé par aucun index.ts : parcours.js l'emporte, pour pilotage seule.
  modifier(m, [SHARED + "contrats-actions.js"]);
  r = jouerJob(m);
  assert.deepEqual(r.deployees, ["pilotage"]);
  // Le code propre d'une fonction ; sa documentation, elle, n'entre dans aucun bundle.
  modifier(m, ["supabase/functions/delete-account/index.ts"]);
  assert.deepEqual(jouerJob(m).deployees, ["delete-account"]);
  modifier(m, ["supabase/functions/private-media/README.md"]);
  r = jouerJob(m);
  assert.equal(r.code, 0, r.sortie);
  assert.deepEqual(r.deployees, []);
  assert.equal(r.sorties.selection.concernees, "");
});

test("② ce qui n'est attribuable à personne concerne TOUTES les fonctions : un supabase/config.toml, une carte d'imports à la racine des fonctions, une donnée de _shared — jamais « personne »", () => {
  // Deux cas joués de bout en bout ; les autres formes de « commun » sont classées une à une en ⑪.
  for (const commun of ["supabase/config.toml", "supabase/functions/deno.json"]) {
    const m = nouveauMonde();
    modifier(m, [commun]);
    const r = jouerJob(m);
    assert.equal(r.code, 0, commun + "\n" + r.sortie);
    assert.deepEqual(r.deployees, FONCTIONS, commun + " : on ne sait pas qui le lit, les six partent");
    assert.match(r.resume, new RegExp("\\*\\*ask-ai\\*\\* : à déployer — sert [0-9a-f]{7} ; changé depuis : " + commun.replace(/[.]/g, "\\.")), commun);
    // Parties, elles servent ce commit : le run suivant n'a plus rien à faire.
    assert.deepEqual(jouerJob(m).deployees, [], commun);
  }
  // Le workflow porte la FAÇON de déployer (--no-verify-jwt, la version de la CLI) : le changer redéploie les six.
  let m = nouveauMonde();
  modifier(m, [FICHIER_WORKFLOW]);
  let r = jouerJob(m);
  assert.deepEqual(r.deployees, FONCTIONS, "un drapeau de déploiement changé ne peut pas attendre le prochain changement de code");
  assert.match(r.resume, /\*\*private-media\*\* : à déployer — sert [0-9a-f]{7} ; changé depuis : \.github\/workflows\/edge-functions\.yml/);
  // Le reste, hors de supabase/, ne concerne aucune fonction : ni un script du job, ni le manifeste.
  m = nouveauMonde();
  const manifesteDuMonde = path.join(m.depot, MANIFESTE);
  fs.writeFileSync(manifesteDuMonde, fs.readFileSync(manifesteDuMonde, "utf8").replace('"_commentaire": "', '"_commentaire": "(banc) '));
  modifier(m, ["scripts/fumee-private-media.mjs", "scripts/lib/lecteur-imports.mjs"]);
  assert.match(git(m, "show", "--stat", "--format=", "HEAD"), /prerequis-fonctions\.json/, "prémisse : le manifeste a bien changé dans ce commit");
  r = jouerJob(m);
  assert.equal(r.code, 0, r.sortie);
  assert.deepEqual(r.deployees, []);
  assert.deepEqual(r.eprouvees, FONCTIONS);
});

// ── ③ La retenue partielle ──────────────────────────────────────────────────
test("③ private-media retenue : les autres fonctions concernées partent et sont éprouvées, private-media reste celle d'avant, le run rougit APRÈS en nommant l'objet et la migration — puis le run suivant la rattrape", () => {
  const m = nouveauMonde();
  const B = modifier(m, [SHARED + "plafond.js", SHARED + "medias-proteges.js"]);
  scenario(m, { absents: [ABSENT_MEDIAS], reglage: true });
  let r = jouerJob(m);
  assert.deepEqual(r.deployees, ["ask-ai", "export-account", "notify-call", "pilotage"], r.sortie);
  assert.equal(r.sorties.retenue.deployables, "ask-ai export-account notify-call pilotage");
  assert.equal(r.sorties.retenue.retenues, "private-media");
  assert.equal(r.etat("Retenue"), "réussie", "la retenue d'UNE fonction n'arrête plus l'étape");
  assert.equal(r.etat("Test de fumée"), "réussie");
  assert.equal(r.etat("Verdict"), "en échec");
  assert.equal(r.code, 1, "une fonction retenue ne passe pas pour un succès");
  assert.equal(servie(m, "private-media"), m.A, "la version en service de private-media reste celle d'avant");
  assert.equal(servie(m, "pilotage"), B);
  // Visible et expliquée : sur la page du run (annotations) et dans son résumé.
  assert.match(r.sortie, /::warning title=Fonction retenue — private-media::manque sur la cible : function:public\.media_resoudre\(text,text,uuid,text\) — migration à appliquer d'abord : migrations\/migration_medias_proteges_go_2026-11-16\.sql/);
  assert.match(r.sortie, /::error title=Fonction\(s\) retenue\(s\)::private-media — un prérequis SQL obligatoire manque sur la cible/);
  assert.match(r.resume, /- ❌ \*\*private-media\*\* : RETENUE — manque : `function:public\.media_resoudre\(text,text,uuid,text\)`\n {2}- à faire : appliquer `migrations\/migration_medias_proteges_go_2026-11-16\.sql` \(canal ③, avec preuve de revue\), puis relancer ce workflow — il rattrape la fonction\.\n {2}- pourquoi elle attend : /);
  assert.match(r.resume, /- Retenues \(un prérequis SQL obligatoire manque\) : private-media/);
  // Le rattrapage : la migration appliquée, le même commit rejoué ne concerne plus que private-media.
  scenario(m, { absents: [], reglage: true });
  r = jouerJob(m);
  assert.equal(r.code, 0, r.sortie);
  assert.deepEqual(r.cli, [`functions deploy private-media --project-ref ${PROD} --yes --no-verify-jwt`]);
  assert.equal(servie(m, "private-media"), B);
});

test("③ l'interrupteur des médias doit être POSÉ (un booléen), ouvert ou fermé : absent ou autre chose, private-media est retenue — seule", () => {
  for (const [reglage, attendu] of [[true, 0], [false, 0], [null, 1], ["true", 1]]) {
    const m = nouveauMonde();
    modifier(m, [SHARED + "medias-proteges.js", SHARED + "politique-autonomie.js"]);
    scenario(m, { absents: [], reglage });
    const r = jouerJob(m);
    assert.equal(r.code, attendu, JSON.stringify(reglage) + "\n" + r.sortie);
    assert.deepEqual(r.deployees, attendu ? ["pilotage"] : ["pilotage", "private-media"], JSON.stringify(reglage));
    if (attendu) assert.match(r.resume, /\*\*private-media\*\* : RETENUE — manque : `reglage:medias_proteges\.actif:booleen`/);
  }
});

// ── ④ private-media, ouverte ────────────────────────────────────────────────
test("④ private-media se redéploie pendant qu'elle sert : la fumée exige l'état du réglage LU en base, ouvert ou fermé — un courtier qui dit autre chose rougit", () => {
  for (const reglage of [true, false]) {
    const m = nouveauMonde();
    const B = modifier(m, ["supabase/functions/private-media/index.ts"]);
    scenario(m, { absents: [], reglage });
    const r = jouerJob(m);
    assert.equal(r.code, 0, `réglage ${reglage}\n${r.sortie}`);
    assert.deepEqual(r.cli, [`functions deploy private-media --project-ref ${PROD} --yes --no-verify-jwt`]);
    assert.equal(r.sorties.retenue.etat_medias_proteges_actif, String(reglage));
    assert.match(r.sortie, new RegExp(`"status":"PRIVATE_MEDIA_VERIFIED".*"uploads_enabled":${reglage},"reads_enabled":${reglage}`));
    assert.equal(servie(m, "private-media"), B);
    // La divergence, dans les deux sens : la coupure posée et un courtier « ouvert », ou l'inverse.
    modifier(m, ["supabase/functions/private-media/index.ts"]);
    scenario(m, { absents: [], reglage, courtierDit: !reglage });
    const d = jouerJob(m);
    assert.equal(d.etat("Test de fumée"), "en échec", `réglage ${reglage}, courtier ${!reglage}`);
    assert.equal(d.code, 1);
    assert.match(d.sortie, /private_media_smoke_refused/);
  }
});

// ── ⑤ ⑥ Les bords ───────────────────────────────────────────────────────────
test("⑤ une cible ILLISIBLE n'est pas une retenue partielle : rien ne part, pas même les fonctions sans prérequis", () => {
  const m = nouveauMonde();
  modifier(m, [SHARED + "plafond.js"]);
  scenario(m, { cibleIllisible: true });
  const r = jouerJob(m);
  assert.equal(r.code, 1);
  assert.equal(r.etat("Retenue"), "en échec");
  assert.deepEqual(r.cli, []);
  assert.match(r.sortie, /NON VÉRIFIABLE, le déploiement est retenu/);
  for (const f of FONCTIONS) assert.equal(servie(m, f), m.A);
});

test("⑥ rien n'est en retard : rien n'est vérifié ni déployé — mais l'état des réglages est lu et les six fonctions servies sont éprouvées ; le run est vert et le dit", () => {
  const m = nouveauMonde();
  const r = jouerJob(m);
  assert.equal(r.code, 0, r.sortie);
  assert.deepEqual(r.cli, []);
  assert.deepEqual(r.specs, ["etat:medias_proteges.actif"], "aucun prérequis n'est demandé : seul l'état du réglage, pour la fumée");
  assert.equal(r.sorties.retenue.deployables, "");
  assert.equal(r.sorties.retenue.retenues, "");
  assert.equal(r.sorties.retenue.etat_medias_proteges_actif, "true");
  for (const nom of ["Révision", "Déployer", "Verdict"]) assert.equal(r.etat(nom), "sautée", nom);
  for (const nom of ["Retenue", "Test de fumée", "Trace"]) assert.equal(r.etat(nom), "réussie", nom);
  assert.deepEqual(r.eprouvees, FONCTIONS, "ce qui est servi est éprouvé à chaque passage");
  assert.match(r.sortie, /aucune fonction en retard sur ce commit : rien à déployer/);
  assert.match(r.sortie, /aucune fonction à vérifier : seuls les réglages sont lus/);
  assert.match(r.resume, /- Déployées : aucune\n- Déjà à jour \(non redéployées, éprouvées quand même\) : ask-ai delete-account export-account notify-call pilotage private-media/);
  assert.equal(r.sale, "", "la révision n'est pas écrite dans le bundle quand rien ne part");
  // Une cible illisible n'est pas une cible calme, même sans rien à déployer : la fumée de private-media a besoin de l'état.
  scenario(m, { cibleIllisible: true });
  const illisible = jouerJob(m);
  assert.equal(illisible.code, 1);
  assert.equal(illisible.etat("Retenue"), "en échec");
  assert.deepEqual(illisible.eprouvees, []);
});

test("⑥ bis une fumée rouge RESTE rouge : la fonction déployée sert « ce commit », le run relancé puis le push suivant la disent à jour — et l'éprouvent quand même ; réparée, le run reverdit", () => {
  // Une porte qui ne tient plus : pilotage répond 200 à un POST sans jeton.
  const m = nouveauMonde();
  const B = modifier(m, ["supabase/functions/pilotage/index.ts"]);
  fs.writeFileSync(path.join(m.etat, "porte-ouverte", "pilotage"), "");
  let r = jouerJob(m);
  assert.deepEqual(r.deployees, ["pilotage"]);
  assert.equal(r.etat("Test de fumée"), "en échec");
  assert.match(r.sortie, /❌ pilotage \(déployée\) : OPTIONS 200 \(attendu 200\), POST sans jeton 200 \(attendu 401\)/);
  assert.equal(r.code, 1);
  assert.equal(servie(m, "pilotage"), B, "prémisse : la fonction cassée EST en service, à ce commit");
  // Le même run, relancé sans rien réparer : rien n'est en retard — et le rouge tient.
  r = jouerJob(m);
  assert.deepEqual(r.deployees, []);
  assert.equal(r.sorties.selection.concernees, "");
  assert.match(r.sortie, /❌ pilotage \(à jour, non redéployée\) : OPTIONS 200 \(attendu 200\), POST sans jeton 200 \(attendu 401\)/);
  assert.equal(r.code, 1, "relancé, le run ne verdit pas tant que la porte est ouverte");
  // Un push sans rapport : la fonction touchée part, pilotage reste rouge.
  modifier(m, ["supabase/functions/ask-ai/index.ts"]);
  r = jouerJob(m);
  assert.deepEqual(r.deployees, ["ask-ai"]);
  assert.equal(r.code, 1, "un push sans rapport ne fait pas disparaître le rouge");
  assert.deepEqual(r.eprouvees, FONCTIONS, "les autres sont éprouvées jusqu'au bout : une fonction rouge n'arrête pas la fumée des suivantes");
  // La porte refermée : vert.
  fs.rmSync(path.join(m.etat, "porte-ouverte", "pilotage"));
  assert.equal(jouerJob(m).code, 0);
  // Le courtier : un état divergent du réglage tient rouge de la même façon, déployé ou non.
  const c = nouveauMonde();
  modifier(c, ["supabase/functions/private-media/index.ts"]);
  scenario(c, { absents: [], reglage: true, courtierDit: false });
  assert.equal(jouerJob(c).code, 1);
  const relance = jouerJob(c);
  assert.deepEqual(relance.deployees, []);
  assert.match(relance.sortie, /❌ private-media \(à jour, non redéployée\) : la fumée du courtier refuse \(contrat, état du réglage « true » ou révision [0-9a-f]{40}\)/);
  assert.equal(relance.code, 1);
  scenario(c, { absents: [], reglage: true });
  assert.equal(jouerJob(c).code, 0);
});

test("⑥ ter une sélection MUETTE ne passe pas pour « rien à faire » : sans son témoin, la retenue arrête le job", () => {
  const m = nouveauMonde();
  modifier(m, [SHARED + "plafond.js"]);
  const muette = muter(WORKFLOW, 'node scripts/fonctions-a-deployer.mjs --cible "$SUPABASE_URL"', "true");
  const r = jouerJob(m, { workflow: muette });
  assert.equal(r.etat("Retenue"), "en échec");
  assert.match(r.sortie, /La sélection n'a rien rendu — on ne sait pas ce qui est en retard : déploiement RETENU/);
  assert.deepEqual(r.cli, []);
  assert.deepEqual(r.specs, [], "la cible n'est pas lue : le jeton ne sert pas");
  assert.equal(r.code, 1);
});

// ── ⑦ À la demande ──────────────────────────────────────────────────────────
test("⑦ à la demande (« Run workflow ») : la fonction nommée, ou toutes — sans lire ce qui est servi ; une fonction inconnue ou une cible hors liste n'atteint aucun secret", () => {
  const m = nouveauMonde();
  let r = jouerJob(m, { evenement: "workflow_dispatch", fonction: "pilotage" });
  assert.equal(r.code, 0, r.sortie);
  assert.deepEqual(r.deployees, ["pilotage"]);
  assert.deepEqual(r.reseau, [`POST api.supabase.com/v1/projects/${PROD}/database/query`], "aucune révision servie n'est lue : la demande décide");
  assert.equal(r.sale, "M supabase/functions/_shared/revision.js", "prémisse : la révision est écrite dans le bundle avant le déploiement");
  r = jouerJob(m, { evenement: "workflow_dispatch" });
  assert.equal(r.code, 0, r.sortie);
  assert.deepEqual(r.deployees, FONCTIONS);
  assert.deepEqual(r.cli, FONCTIONS.map((f) => `functions deploy ${f} --project-ref ${PROD} --yes` + (f === "private-media" ? " --no-verify-jwt" : "")));
  for (const f of FONCTIONS) assert.equal(servie(m, f), r.sha);
  // Le staging, seulement à la demande : l'autre projet, jamais la production.
  r = jouerJob(m, { evenement: "workflow_dispatch", fonction: "ask-ai", cible: "staging" });
  assert.deepEqual(r.cli, ["functions deploy ask-ai --project-ref fcksxofaelcdmmifnwjo --yes"]);
  for (const mauvais of [{ fonction: "inconnue" }, { fonction: "pilotage; echo injecte" }, { fonction: "pilotage", cible: "ailleurs" }]) {
    r = jouerJob(m, { evenement: "workflow_dispatch", ...mauvais });
    assert.equal(r.code, 1, JSON.stringify(mauvais));
    assert.deepEqual(r.cli, []);
    assert.deepEqual(r.specs, [], "la cible n'est pas lue : le jeton ne sert pas");
    assert.doesNotMatch(r.sortie, /^injecte$/m);
  }
});

// ── ⑧ ⑨ Ce qu'on ne sait pas, et ce qui est plus récent ─────────────────────
test("⑧ le doute déploie : une révision « dev », absente, un commit hors de l'historique ou une fonction injoignable ne se lisent jamais « à jour »", () => {
  const m = nouveauMonde();
  servir(m, { "ask-ai": "dev", "delete-account": null, "export-account": "f".repeat(40) });
  scenario(m, { absents: [], reglage: true, injoignables: ["notify-call"] });
  const r = jouerJob(m);
  assert.deepEqual(r.deployees, ["ask-ai", "delete-account", "export-account", "notify-call"], r.sortie);
  assert.match(r.resume, /\*\*ask-ai\*\* : à déployer — révision servie illisible \(un déploiement fait hors de ce workflow\)/);
  assert.match(r.resume, /\*\*delete-account\*\* : à déployer — aucune révision servie \(HTTP 200\)/);
  assert.match(r.resume, /\*\*export-account\*\* : à déployer — sert fffffff, un commit absent de l'historique de celui-ci/);
  assert.match(r.resume, /\*\*notify-call\*\* : à déployer — fonction injoignable : révision servie non lue/);
  assert.match(r.resume, /\*\*pilotage\*\* : à jour/);
  assert.match(r.resume, /\*\*private-media\*\* : à jour/);
  assert.equal(r.code, 0, r.sortie);
  for (const f of r.deployees) assert.equal(servie(m, f), r.sha, f + " sert désormais ce commit : le doute est levé");
});

test("⑨ un run ANCIEN relancé ne fait pas reculer une fonction : servie plus récente que ce commit, elle est tenue pour à jour", () => {
  const m = nouveauMonde();
  const B = modifier(m, [SHARED + "plafond.js"]);
  const C = modifier(m, [SHARED + "plafond.js"]);
  servir(m, Object.fromEntries(FONCTIONS.map((f) => [f, C])));
  git(m, "checkout", "-q", "--detach", B);   // le run de B, relancé après le déploiement de C
  const r = jouerJob(m);
  assert.equal(r.sha, B);
  assert.equal(r.code, 0, r.sortie);
  assert.deepEqual(r.cli, []);
  assert.match(r.resume, /\*\*pilotage\*\* : à jour — sert [0-9a-f]{7}, plus récent que ce commit : un run ancien ne la fait pas reculer/);
  for (const f of FONCTIONS) assert.equal(servie(m, f), C);
});

// ── ⑩ Les réinjections : chaque défaut d'avant, remis dans le workflow, se voit ─
function muter(texte, avant, apres) {
  assert.equal(texte.split(avant).length - 1, 1, `la mutation doit s'appliquer une fois : ${JSON.stringify(avant)}`);
  return texte.replace(avant, () => apres);
}

test("⑩ réinjections : sans --partiel, une retenue retient TOUT ; la sélection remplacée par « toutes », un push vérifie les six ; sans « Verdict », la retenue passe pour un succès", () => {
  // Sans --partiel : le défaut du 20/11 — une fonction retenue, et rien ne part.
  const sansPartiel = muter(WORKFLOW, '--fonctions "$CONCERNEES" --projet "$PROJECT_REF" --partiel', '--fonctions "$CONCERNEES" --projet "$PROJECT_REF"');
  let m = nouveauMonde();
  modifier(m, [SHARED + "plafond.js", SHARED + "medias-proteges.js"]);
  scenario(m, { absents: [ABSENT_MEDIAS], reglage: true });
  let r = jouerJob(m, { workflow: sansPartiel });
  assert.equal(r.etat("Retenue"), "en échec");
  assert.deepEqual(r.cli, [], "sans --partiel, les quatre fonctions en règle ne partent pas : ③ rougirait");
  // La sélection retirée : un push vérifie et déploie les six, quel que soit le changement.
  const sansSelection = muter(WORKFLOW, 'node scripts/fonctions-a-deployer.mjs --cible "$SUPABASE_URL"', "node scripts/fonctions-a-deployer.mjs --toutes");
  m = nouveauMonde();
  modifier(m, [SHARED + "politique-autonomie.js"]);
  r = jouerJob(m, { workflow: sansSelection });
  assert.deepEqual(r.deployees, FONCTIONS, "sans sélection, les six partent : ① rougirait");
  assert.ok(r.specs.includes(SPEC_REGLAGE));
  // Le verdict retiré : la retenue ne se voit plus dans la couleur du run.
  const debut = WORKFLOW.indexOf("      - name: Verdict — ");
  assert.ok(debut > 0 && WORKFLOW.indexOf("      - name: ", debut + 1) < 0, "prémisse : « Verdict » est la dernière étape");
  const sansVerdict = WORKFLOW.slice(0, WORKFLOW.lastIndexOf("\n\n", debut) + 1);   // l'étape et le commentaire qui la précède
  assert.ok(!sansVerdict.includes("- name: Verdict"));
  m = nouveauMonde();
  modifier(m, [SHARED + "plafond.js", SHARED + "medias-proteges.js"]);
  scenario(m, { absents: [ABSENT_MEDIAS], reglage: true });
  assert.equal(jouerJob(m, { workflow: sansVerdict }).code, 0, "sans « Verdict », une fonction retenue rendrait le run vert : ③ rougirait");
});

test("⑩ réinjection : la CLI qui refuse une fonction arrête le déploiement — la fumée et la trace ne disent pas « déployée » ce qui ne l'est pas", () => {
  const m = nouveauMonde();
  modifier(m, [SHARED + "plafond.js"]);
  fs.writeFileSync(path.join(m.etat, "cli-echec", "export-account"), "");
  const r = jouerJob(m);
  assert.equal(r.code, 1);
  assert.equal(r.etat("Déployer"), "en échec");
  assert.deepEqual(r.deployees, ["ask-ai", "export-account"], "l'étape s'arrête à la première fonction refusée");
  assert.equal(r.etat("Test de fumée"), "non jouée");
  // Le run suivant rattrape ce qui n'est pas parti : l'état servi, pas le diff du push.
  fs.rmSync(path.join(m.etat, "cli-echec", "export-account"));
  const suite = jouerJob(m);
  assert.equal(suite.code, 0, suite.sortie);
  assert.deepEqual(suite.deployees, ["export-account", "notify-call", "pilotage"]);
  // ask-ai est partie au premier run, que la panne a arrêté AVANT la fumée : le second l'éprouve, à jour.
  assert.match(suite.sortie, /✅ ask-ai \(à jour, non redéployée\) : OPTIONS 200, POST sans jeton 401/);
  assert.deepEqual(suite.eprouvees, FONCTIONS);
});

// ── ⑪ La sélection, fonction par fonction ───────────────────────────────────
test("⑪ selectionner : à jour, à déployer, incertaine, descendante, documentation seule, fichier commun, dossier d'une autre", () => {
  const noms = ["a", "b", "c", "d", "e", "f", "g"];
  const F = (n, f = "index.ts") => `supabase/functions/${n}/${f}`;
  const clotures = new Map(noms.map((n) => [n, [F(n), SHARED + "revision.js", ...(n === "g" ? [SHARED + "g-seul.js"] : [])]]));
  const R = Object.fromEntries(noms.map((n, i) => [n, String(i + 1).repeat(40)]));
  const servies = new Map(noms.map((n) => [n, n === "c" ? { revision: null, raison: "fonction injoignable : révision servie non lue" } : { revision: R[n] }]));
  // Ce que git rend pour chaque révision servie : TOUT ce qui a changé sous supabase/ depuis.
  const reponses = {
    [R.a]: { relation: "comparable", changes: [F("b"), SHARED + "g-seul.js"] },   // le dossier d'une autre, un module qu'elle n'emporte pas
    [R.b]: { relation: "comparable", changes: [F("b")] },
    [R.d]: { relation: "descendante", changes: [F("d")] },
    [R.e]: { relation: "comparable", changes: [F("e", "README.md"), F("a")] },
    [R.f]: { relation: "absente", changes: [] },
    [R.g]: { relation: "comparable", changes: [SHARED + "g-seul.js"] },
  };
  const demandes = [];
  const comparer = (rev) => { demandes.push(rev); return reponses[rev]; };
  const l = selectionner({ noms, clotures, servies, comparer, incertaines: new Map() });
  assert.deepEqual(l.map((x) => [x.fonction, x.etat]), [["a", "a_jour"], ["b", "a_deployer"], ["c", "a_deployer"], ["d", "a_jour"], ["e", "a_jour"], ["f", "a_deployer"], ["g", "a_deployer"]]);
  assert.equal(demandes.length, 6, "sans révision, rien à comparer");
  assert.deepEqual(l.find((x) => x.fonction === "g").changes, [SHARED + "g-seul.js"]);
  // Une clôture incalculable n'est jamais lue « rien d'autre n'est emporté ».
  const i = selectionner({ noms: ["a"], clotures, servies, comparer, incertaines: new Map([["a", [F("a") + " : import() ou require() au chemin calculé"]]]) });
  assert.equal(i[0].etat, "a_deployer");
  assert.match(i[0].motif, /ne se calcule pas \(supabase\/functions\/a\/index\.ts : import\(\) ou require\(\) au chemin calculé\)/);
  // Une fonction que personne n'a lue.
  assert.equal(selectionner({ noms: ["z"], clotures, servies, comparer })[0].etat, "a_deployer");
  // Une révision servie très ancienne : le motif nomme les premiers fichiers, puis leur nombre.
  const beaucoup = selectionner({ noms: ["a"], clotures, servies, comparer: () => ({ relation: "comparable", changes: Array.from({ length: 30 }, (_x, k) => F("a", `m${String(k).padStart(2, "0")}.ts`)) }) })[0];
  assert.equal(beaucoup.changes.length, 30);
  assert.match(beaucoup.motif, /changé depuis : supabase\/functions\/a\/m00\.ts, .*m03\.ts … \(30 fichiers\)$/);
  // Le classement d'un fichier changé, cas par cas — le doute concerne.
  const pour = (fn, f) => changementsQuiConcernent(fn, [f], { noms, clotures }).length === 1;
  assert.deepEqual([pour("a", F("a")), pour("a", F("a", "aide/x.ts")), pour("a", SHARED + "revision.js")], [true, true, true]);
  assert.deepEqual([pour("a", F("b")), pour("a", SHARED + "g-seul.js"), pour("a", F("a", "README.md")), pour("a", "supabase/NOTES.MD")], [false, false, false, false]);
  for (const commun of ["supabase/config.toml", "supabase/functions/deno.json", SHARED + "donnees.json", SHARED + "sous/dossier.txt", "supabase/functions/ancienne-fonction/index.ts", "supabase/migrations/x.sql"]) {
    assert.equal(pour("a", commun), true, commun + " : attribuable à personne, donc à toutes");
  }
  // Un dossier dont le nom PROLONGE celui d'une fonction n'est pas le sien (« a » et « a-bis »).
  assert.equal(changementsQuiConcernent("a", ["supabase/functions/a-bis/index.ts"], { noms: ["a", "a-bis"], clotures }).length, 0);
});

test("⑪ comparateurGit et etablirSelection sur un vrai dépôt : la clôture réelle, le commit absent, la descendance ; lireRevisionServie ne rend qu'un SHA", async () => {
  const m = nouveauMonde();
  const { noms, clotures, incertaines } = lireFonctions(m.depot);
  assert.deepEqual(noms, FONCTIONS);
  assert.equal(incertaines.size, 0);
  assert.deepEqual(clotures.get("ask-ai"), [SHARED + "plafond.js", SHARED + "revision.js", "supabase/functions/ask-ai/index.ts"]);
  assert.deepEqual(comparateurGit(m.depot)(m.A), { relation: "comparable", changes: [] });
  // Un nom de fichier accentué, un script hors de supabase/ : git rend le premier tel quel, pas le second.
  fs.writeFileSync(path.join(m.depot, SHARED + "réglé.js"), "export const x = 1;\n");
  const B = modifier(m, [SHARED + "reception.js", "scripts/fumee-private-media.mjs"]);
  const comparer = comparateurGit(m.depot);   // un comparateur par run : HEAD y est lu une fois
  assert.deepEqual(comparer(m.A).changes, [SHARED + "reception.js", SHARED + "réglé.js"]);
  assert.deepEqual(changementsQuiConcernent("ask-ai", comparer(m.A).changes, { noms, clotures }), []);
  assert.deepEqual(changementsQuiConcernent("pilotage", comparer(m.A).changes, { noms, clotures }), [SHARED + "reception.js"]);
  assert.equal(comparer("0".repeat(40)).relation, "absente");
  assert.equal(comparer("HEAD; echo x").relation, "absente", "seul un SHA se compare");
  assert.equal(comparer(B).relation, "comparable");
  assert.deepEqual(comparer(B).changes, []);
  git(m, "checkout", "-q", "--detach", m.A);
  assert.equal(comparateurGit(m.depot)(B).relation, "descendante");
  git(m, "checkout", "-q", "main");
  // Le chemin entier, par un faux réseau : reception.js est emporté par notify-call et pilotage.
  const fetchFn = async (url, init) => {
    assert.equal(init.method, "OPTIONS");
    assert.equal(init.redirect, "error");
    assert.ok(!init.headers, "aucun jeton ne part vers la fonction");
    return new Response(null, { status: 200, headers: { "X-Passio-Revision": m.A } });
  };
  const s = await etablirSelection({ mode: "etat", cible: `https://${PROD}.supabase.co`, racine: m.depot, fetchFn });
  assert.deepEqual(s.lignes.filter((l) => l.etat === "a_deployer").map((l) => l.fonction), ["notify-call", "pilotage"]);
  await assert.rejects(etablirSelection({ mode: "etat", cible: "https://exemple.invalid", racine: m.depot, fetchFn }), /cible : --cible/);
  await assert.rejects(etablirSelection({ mode: "fonction", fonction: "constructor", racine: m.depot }), /fonction inconnue : constructor/);
  // Une fonction neuve dont un import ne se lit pas : incertaine, donc à déployer.
  fs.mkdirSync(path.join(m.depot, "supabase/functions/neuve"));
  fs.writeFileSync(path.join(m.depot, "supabase/functions/neuve/index.ts"), 'const m = await import("../_shared/" + nom + ".js");\n');
  const avecNeuve = await etablirSelection({ mode: "etat", cible: `https://${PROD}.supabase.co`, racine: m.depot, fetchFn });
  assert.match(avecNeuve.lignes.find((l) => l.fonction === "neuve").motif, /ne se calcule pas/);
  // Un spécificateur NU (résolu par une carte d'imports vers _shared) : le lecteur ne le suit pas — il le DIT,
  // au lieu de ranger le module visé parmi « ceux qu'elle n'emporte pas » (relecture adverse du 21/11).
  fs.writeFileSync(path.join(m.depot, "supabase/functions/neuve/index.ts"), 'import { x } from "@partage/croissance.js";\nimport w from "npm:web-push@3.6.7";\nimport { c } from "https://esm.sh/@supabase/supabase-js@2.118.0";\nimport fs from "node:fs";\n');
  const nue = lireFonctions(m.depot).incertaines.get("neuve");
  assert.equal(nue.length, 1, "un paquet npm:, une URL et node: ne rendent rien incertain");
  assert.match(nue[0], /importe « @partage\/croissance\.js », ni relatif ni paquet — résolu par une carte d'imports/);
  fs.writeFileSync(path.join(m.depot, "supabase/functions/neuve/index.ts"), 'import { x } from "/absolu/x.js";\n');
  assert.equal(lireFonctions(m.depot).incertaines.get("neuve").length, 1, "un chemin absolu non plus ne se suit pas");
  assert.equal(lireFonctions().incertaines.size, 0, "le dépôt réel n'a aucun spécificateur nu");
  // Le workflow est comparé avec supabase/ : c'est lui qui dit COMMENT déployer.
  fs.rmSync(path.join(m.depot, "supabase/functions/neuve"), { recursive: true });
  const avantWorkflow = git(m, "rev-parse", "HEAD");
  modifier(m, [FICHIER_WORKFLOW, "scripts/fumee-private-media.mjs"]);
  assert.deepEqual(comparateurGit(m.depot)(avantWorkflow).changes, [FICHIER_WORKFLOW]);
  // lireRevisionServie : un SHA, ou rien — jamais « dev », jamais un texte libre.
  const avec = (entetes, status = 200) => async () => new Response(null, { status, headers: entetes });
  assert.deepEqual(await lireRevisionServie("https://x", "f", avec({ "x-passio-revision": m.A })), { revision: m.A, raison: null });
  assert.equal((await lireRevisionServie("https://x", "f", avec({ "x-passio-revision": "dev" }))).revision, null);
  // Des en-têtes VALIDES qui ne sont pas un SHA seul : l'expression est ancrée des deux côtés. (Un en-tête
  // contenant un saut de ligne ne prouvait rien : `new Response` le refuse, et c'est le « injoignable » qui répondait.)
  for (const faux of [m.A + " ::error::texte libre", m.A + "a", m.A.slice(1), m.A.toUpperCase(), "x" + m.A, m.A + "; rm -rf"]) {
    const r = await lireRevisionServie("https://x", "f", avec({ "x-passio-revision": faux }));
    assert.deepEqual(r, { revision: null, raison: "révision servie illisible (un déploiement fait hors de ce workflow)" }, faux);
  }
  assert.equal((await lireRevisionServie("https://x", "f", avec({ "x-passio-revision": "  " + m.A + " " }))).revision, m.A, "des espaces autour ne changent rien");
  assert.match((await lireRevisionServie("https://x", "f", avec({}, 503))).raison, /aucune révision servie \(HTTP 503\)/);
  assert.match((await lireRevisionServie("https://x", "f", async () => { throw new TypeError("fetch failed"); })).raison, /injoignable/);
});

// ── ⑫ ⑬ Le vérificateur ─────────────────────────────────────────────────────
const manifeste = JSON.parse(lire(MANIFESTE)).fonctions;

test("⑫ le manifeste : private-media exige un interrupteur POSÉ, plus un interrupteur fermé — « actif=false » n'est plus un prérequis lisible", () => {
  const pm = manifeste["private-media"];
  assert.equal(pm.obligatoire, true);
  assert.ok(pm.objets.includes(SPEC_REGLAGE));
  assert.ok(!Object.values(manifeste).some((d) => (d.objets || []).some((s) => /=false|=true/.test(s))), "aucune fonction ne dépend de la VALEUR d'un réglage");
  assert.deepEqual(lireObjet(SPEC_REGLAGE), { genre: "reglage_booleen", cle: "medias_proteges", champ: "actif" });
  assert.throws(() => lireObjet("reglage:medias_proteges.actif=false"), /prérequis illisible/);
  assert.throws(() => lireObjet("reglage:medias_proteges.actif:booleen; drop table x"), /prérequis illisible/);
  const sql = sqlPrerequis(pm.objets);
  assert.ok(sql.startsWith("set transaction read only;\n"));
  // La table n'est nommée que dans une requête évaluée À L'EXÉCUTION, derrière to_regclass : une cible sans
  // `reglages_distants` n'y fait pas échouer toute la lecture (banc PostgreSQL : prerequis-fonctions ③ ter).
  const garde = (test) => "\\(\\(case when to_regclass\\('public\\.reglages_distants'\\) is null then false else \\(xpath\\('/row/v/text\\(\\)', query_to_xml\\('select exists \\(select 1 from public\\.reglages_distants where cle = ''medias_proteges'' and " + test + "\\) as v', false, true, ''\\)\\)\\)\\[1\\]::text = 'true' end\\)\\) as present";
  assert.match(sql, new RegExp("select 'reglage:medias_proteges\\.actif:booleen' as spec, " + garde("jsonb_typeof\\(valeur->''actif''\\) = ''boolean''")));
  assert.match(sql, new RegExp("select 'etat:medias_proteges\\.actif' as spec, " + garde("valeur->''actif'' = ''true''::jsonb") + ";$"));
  assert.doesNotMatch(sql, /'false'::jsonb|''false''/);
  assert.doesNotMatch(sql.replace(/query_to_xml\('(?:[^']|'')*'/g, ""), /reglages_distants(?!'\) is null)/, "hors de la requête différée, la table n'est nommée que par to_regclass");
  assert.deepEqual(etatsLus(pm.objets), ["etat:medias_proteges.actif"]);
  assert.deepEqual(etatsLus(manifeste.pilotage.objets), []);
  // Les états se lisent aussi SANS les prérequis de la fonction : la CI lit ceux de tout le manifeste à chaque passage.
  assert.match(sqlPrerequis(manifeste.pilotage.objets, ["etat:medias_proteges.actif"]), /select 'etat:medias_proteges\.actif' as spec, /);
  assert.equal(sqlPrerequis([], []), "set transaction read only;\nselect null::text as spec, null::boolean as present where false;");
});

test("⑫ dresserPlan : obligatoire absent → retenue ; facultatif absent → dégradée, déployable ; l'état d'un réglage est LU, jamais deviné", () => {
  const noms = ["delete-account", "notify-call", "private-media"];
  const tout = new Map(noms.flatMap((f) => manifeste[f].objets).map((s) => [s, true]));
  tout.set("etat:medias_proteges.actif", true);
  let p = dresserPlan(manifeste, noms, tout);
  assert.deepEqual([p.deployables, p.retenues, p.etats], [noms, [], { "medias_proteges.actif": true }]);
  const sans = new Map(tout);
  sans.set("function:public.media_resoudre(text,text,uuid,text)", false);
  sans.set("function:public.notifier_mentions(text,text,text[])", false);
  sans.set("etat:medias_proteges.actif", false);
  p = dresserPlan(manifeste, noms, sans);
  assert.deepEqual(p.deployables, ["delete-account", "notify-call"]);
  assert.deepEqual(p.retenues, ["private-media"]);
  assert.equal(p.etats["medias_proteges.actif"], false);
  assert.deepEqual(p.resume.map((r) => r.etat), ["prérequis présents", "dégradée (facultatif absent)", "RETENUE"]);
  assert.deepEqual(p.resume[2].manquants, ["function:public.media_resoudre(text,text,uuid,text)"]);
  assert.deepEqual(dresserPlan(manifeste, ["pilotage"], new Map(manifeste.pilotage.objets.map((s) => [s, true]))).etats, {}, "pas de réglage exigé : aucun état lu");
});

/** Le vérificateur réel, en ligne de commande, sur un résultat déjà lu (`--json`). */
function verifier(args, lignes, env = {}) {
  const bac = fs.mkdtempSync(path.join(os.tmpdir(), "prerequis-"));
  BACS.push(bac);
  const sorties = path.join(bac, "sorties.txt"), resume = path.join(bac, "resume.md"), json = path.join(bac, "lignes.json");
  fs.writeFileSync(sorties, "");
  fs.writeFileSync(resume, "");
  fs.writeFileSync(json, JSON.stringify(lignes));
  const r = spawnSync(process.execPath, [path.join(RACINE, "scripts/verifier-prerequis-fonctions.mjs"), ...args, "--json", json], {
    encoding: "utf8", cwd: RACINE,
    env: { PATH: process.env.PATH, HOME: bac, USERPROFILE: bac, GITHUB_OUTPUT: sorties, GITHUB_STEP_SUMMARY: resume, ...env },
  });
  return { code: r.status, sortie: (r.stdout || "") + (r.stderr || ""), sorties: fs.readFileSync(sorties, "utf8"), resume: fs.readFileSync(resume, "utf8") };
}
// Ce que rend la cible : les prérequis des fonctions demandées, et les états de TOUT le manifeste (mode partiel).
const ETATS_MANIFESTE = etatsLus(Object.values(manifeste).flatMap((d) => d.objets || []));
const catalogue = (noms, absents = [], etat = true) => [
  ...[...new Set(noms.flatMap((f) => manifeste[f].objets))].map((spec) => ({ spec, present: !absents.includes(spec) })),
  ...ETATS_MANIFESTE.map((spec) => ({ spec, present: etat })),
];

test("⑬ le vérificateur en ligne de commande : --partiel sort en 0 et écrit le plan ; sans lui, code 1 comme avant ; une cible qui ne répond pas à tout est NON VÉRIFIABLE", () => {
  // La production du 21/11, lue par le connecteur en lecture seule : tout est présent, le réglage est à true.
  let r = verifier(["--fonctions", FONCTIONS.join(" "), "--partiel"], catalogue(FONCTIONS));
  assert.equal(r.code, 0, r.sortie);
  assert.equal(r.sorties, `deployables=${FONCTIONS.join(" ")}\nretenues=\netat_medias_proteges_actif=true\n`);
  assert.match(r.sortie, /✅ private-media : prérequis présents/);
  assert.match(r.sortie, /réglage medias_proteges\.actif lu sur la cible : true/);
  // Une retenue : dite, le plan écrit, code 0 — c'est le job qui tranche, après le déploiement des autres.
  const absent = "function:public.media_reserver(text,text,jsonb,uuid)";
  r = verifier(["--fonctions", "pilotage private-media", "--partiel"], catalogue(["pilotage", "private-media"], [absent], false), { GITHUB_ACTIONS: "true" });
  assert.equal(r.code, 0, r.sortie);
  assert.equal(r.sorties, "deployables=pilotage\nretenues=private-media\netat_medias_proteges_actif=false\n");
  assert.match(r.sortie, /❌ private-media : RETENUE — manque : function:public\.media_reserver\(text,text,jsonb,uuid\)/);
  assert.match(r.sortie, /RETENUE PARTIELLE : private-media ne part\(ent\) pas — pilotage part\(ent\)\. Le run finira ROUGE après le déploiement des autres/);
  assert.match(r.sortie, /^::warning title=Fonction retenue — private-media::/m);
  // Sans --partiel : le contrat d'avant, que les bancs SQL et un contrôle à la main emploient.
  r = verifier(["--fonctions", "pilotage private-media"], catalogue(["pilotage", "private-media"], [absent]));
  assert.equal(r.code, 1);
  assert.equal(r.sorties, "", "sans --partiel, aucun plan n'est écrit");
  assert.match(r.sortie, /déploiement RETENU : une fonction exige une migration que la cible n'a pas/);
  assert.equal(verifier(["--fonctions", "pilotage private-media"], catalogue(["pilotage", "private-media"])).code, 0);
  // La cible n'a pas répondu pour l'état du réglage : on ne devine pas « fermé ».
  r = verifier(["--fonctions", "private-media", "--partiel"], catalogue(["private-media"]).filter((l) => !l.spec.startsWith("etat:")));
  assert.equal(r.code, 2);
  assert.match(r.sortie, /la cible n'a pas répondu pour « etat:medias_proteges\.actif » : NON VÉRIFIABLE/);
  assert.equal(r.sorties, "");
  // …ni « absent » pour un prérequis sans réponse : une réponse tronquée n'est pas une retenue partielle.
  r = verifier(["--fonctions", "pilotage private-media", "--partiel"], catalogue(["pilotage", "private-media"]).filter((l) => l.spec !== "table:public.media_assets"));
  assert.equal(r.code, 2);
  assert.match(r.sortie, /la cible n'a pas répondu pour « table:public\.media_assets » : NON VÉRIFIABLE/);
  assert.equal(r.sorties, "", "aucun plan : pilotage ne part pas sur une lecture incomplète");
  r = verifier(["--fonctions", "pilotage", "--partiel"], { message: "une erreur de l'API, pas des lignes" });
  assert.equal(r.code, 2);
  assert.equal(r.sorties, "");
  // Rien n'est en retard (`--fonctions ""`) : AUCUNE fonction — jamais « toutes » —, mais l'état est lu pour la fumée.
  assert.deepEqual(ETATS_MANIFESTE, ["etat:medias_proteges.actif"]);
  r = verifier(["--fonctions", "", "--partiel"], catalogue([], [], false));
  assert.equal(r.code, 0, r.sortie);
  assert.equal(r.sorties, "deployables=\nretenues=\netat_medias_proteges_actif=false\n");
  assert.doesNotMatch(r.sortie, /prérequis présents|RETENUE/);
  // …et pilotage seule : l'état du réglage, qu'elle n'exige pas, est lu quand même (private-media sera éprouvée).
  r = verifier(["--fonctions", "pilotage", "--partiel"], catalogue(["pilotage"]));
  assert.equal(r.sorties, "deployables=pilotage\nretenues=\netat_medias_proteges_actif=true\n");
  r = verifier(["--fonctions", "pilotage", "--partiel"], catalogue(["pilotage"]).filter((l) => !l.spec.startsWith("etat:")));
  assert.equal(r.code, 2, "sans l'état, NON VÉRIFIABLE : la fumée n'aurait rien à comparer");
  // Sans --partiel, une liste absente garde son sens d'avant : tout le manifeste (contrôle à la main).
  r = verifier([], catalogue(FONCTIONS));
  assert.equal(r.code, 0, r.sortie);
  for (const f of FONCTIONS) assert.match(r.sortie, new RegExp("✅ " + f + " : prérequis présents"));
  // Une fonction hors manifeste — un nom de propriété héritée compris — ne se déploie pas.
  for (const nom of ["inconnue", "constructor", "toString", "__proto__", "pilotage\nretenues="]) {
    r = verifier(["--fonctions", nom, "--partiel"], []);
    assert.equal(r.code, 2, JSON.stringify(nom));
    assert.equal(r.sorties, "");
  }
});

test("⑬ bis appelés à travers un lien symbolique, les trois scripts du job AGISSENT : aucun ne sort en 0 sans avoir rien fait", (t) => {
  // La garde « lancé en direct » comparait deux URL : par un lien, elle ne se reconnaissait pas, le script ne
  // faisait rien et sortait en 0 — une sélection muette (« rien à faire »), une fonction inconnue admise, une
  // fumée verte sans une requête. Elle compare désormais des chemins RÉELS (relecture adverse du 21/11).
  const bac = fs.mkdtempSync(path.join(os.tmpdir(), "lien-"));
  BACS.push(bac);
  const lien = path.join(bac, "depot");
  try { fs.symlinkSync(RACINE, lien, "dir"); } catch (e) { t.skip("pas de lien symbolique ici (" + e.code + ")"); return; }
  const lancer = (script, args = [], env = {}) => spawnSync(process.execPath, [path.join(lien, "scripts", script), ...args], { encoding: "utf8", cwd: bac, env: { PATH: process.env.PATH, HOME: bac, USERPROFILE: bac, ...env } });
  const selection = lancer("fonctions-a-deployer.mjs", ["--fonction", "pilotage"]);
  assert.equal(selection.status, 0, selection.stderr);
  assert.match(selection.stdout, /1 fonction\(s\) à vérifier puis déployer : pilotage/);
  assert.equal(lancer("fonctions-a-deployer.mjs", ["--fonction", "inconnue"]).status, 2);
  const retenue = lancer("verifier-prerequis-fonctions.mjs", ["--fonctions", "fonction-inconnue", "--partiel"]);
  assert.equal(retenue.status, 2, "une fonction hors manifeste n'est pas admise en silence");
  assert.match(retenue.stderr, /fonction inconnue du manifeste/);
  const fumee = lancer("fumee-private-media.mjs");
  assert.equal(fumee.status, 1, "une fumée sans cible ni état refuse — elle ne se tait pas");
  assert.match(fumee.stderr, /private_media_smoke_refused/);
});

// ── ⑭ ⑮ L'accord des listes, et la forme du job ─────────────────────────────
test("⑭ une seule liste de fonctions : les dossiers, le manifeste et les deux listes fermées du workflow nomment les mêmes", () => {
  const dossiers = fs.readdirSync(path.join(RACINE, "supabase/functions"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && fs.existsSync(path.join(RACINE, "supabase/functions", e.name, "index.ts"))).map((e) => e.name).sort();
  assert.deepEqual(dossiers, FONCTIONS);
  assert.deepEqual(lireFonctions().noms, FONCTIONS);
  assert.deepEqual(Object.keys(manifeste).sort(), FONCTIONS);
  const listes = [...WORKFLOW.matchAll(/ in (?:''\|)?([a-z|-]+)\) ;; \*\) echo "::error::Fonction inconnue\."; exit 1 ;; esac/g)].map((x) => x[1].split("|").sort());
  assert.equal(listes.length, 2, "la demande manuelle (Sélection) et le déploiement (Déployer)");
  for (const l of listes) assert.deepEqual(l, FONCTIONS);
});

test("⑮ la forme du job : la sélection et la retenue précèdent le déploiement, le jeton ne va qu'à la retenue et au déploiement, l'historique est cloné, le verdict clôt", () => {
  const doc = parse(WORKFLOW);
  const etapes = doc.jobs.deployer.steps;
  const rang = (debut) => { const i = etapes.findIndex((s) => String(s.name || s.uses).startsWith(debut)); assert.ok(i >= 0, debut); return i; };
  const ordre = ["Cible", "actions/checkout@", "Sélection", "Retenue", "Révision", "Déployer", "Test de fumée", "Trace", "Verdict"].map(rang);
  assert.deepEqual(ordre, [...ordre].sort((a, b) => a - b));
  assert.equal(rang("Verdict"), etapes.length - 1);
  assert.equal(String(etapes[rang("actions/checkout@")].with["fetch-depth"]), "0", "sans historique, toute révision servie serait « absente » : tout partirait à chaque push");
  assert.equal(String(etapes[rang("actions/checkout@")].with["persist-credentials"]), "false");
  const avecJeton = etapes.filter((s) => /secrets\./.test(JSON.stringify(s.env || {}))).map((s) => s.name.split(" ")[0]);
  assert.deepEqual(avecJeton, ["Retenue", "Déployer"]);
  // Ce qui DÉPLOIE dépend du plan ; ce qui LIT et ÉPROUVE tourne à chaque passage — sans fonction d'état.
  for (const nom of ["Révision", "Déployer"]) assert.equal(etapes[rang(nom)].if, "steps.retenue.outputs.deployables != ''", nom);
  assert.equal(etapes[rang("Verdict")].if, "steps.retenue.outputs.retenues != ''");
  for (const nom of ["Cible", "Sélection", "Retenue", "Test de fumée", "Trace"]) assert.equal(etapes[rang(nom)].if, undefined, nom);
  // La fumée reçoit ce que la sélection a lu (les révisions servies) et ce que la retenue a lu (l'état du réglage).
  assert.deepEqual(etapes[rang("Test de fumée")].env, { MEDIAS_ACTIFS: "${{ steps.retenue.outputs.etat_medias_proteges_actif }}", SERVIES: "${{ steps.selection.outputs.servies }}" });
  assert.equal(etapes[rang("Retenue")].env.SELECTION, "${{ steps.selection.outputs.selection }}");
  // Le déclencheur : le manifeste et les scripts du job relancent la sélection.
  const chemins = doc.on.push.paths;
  // …et tout supabase/ : ce que la sélection compare est ce qui déclenche (un config.toml seul relance) ;
  // les verrous aussi : le correctif d'une suite qui a rougi le workflow doit pouvoir le reverdir.
  for (const f of ["supabase/**", "tests/unit/**", FICHIER_WORKFLOW, MANIFESTE, "scripts/fonctions-a-deployer.mjs", "scripts/verifier-prerequis-fonctions.mjs", "scripts/fumee-private-media.mjs", "scripts/lib/lecteur-imports.mjs"]) assert.ok(chemins.includes(f), f);
});
