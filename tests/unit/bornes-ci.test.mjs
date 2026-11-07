// ═══════════════════════════════════════════════════════════════════════════
// LES INSTALLATIONS PLAYWRIGHT ET LES JOBS QUI LES PORTENT ONT UNE BORNE.
//
// Le 2026-11-06 (PR #726, run 42174403472), la tranche 1/6 de `test-local` est
// restée 52 min dans « Installer Playwright » : `apt-get update` ne recevait plus
// rien du miroir. Aucun job de deploy.yml qui installe Playwright n'avait de
// borne, sauf `test-webkit` : 360 min par défaut, la PR et le déploiement de
// `main` tenus avec. Il a fallu annuler le run à la main.
//
// Ce test lit deploy.yml TEL QU'IL EST (lecteur YAML du dépôt) et tient trois
// choses :
//   ① chaque étape qui installe Playwright borne CHAQUE essai par `timeout`, en
//     fait deux, échoue après deux échecs, et porte un `timeout-minutes` qui ne
//     coupe jamais sa propre boucle ; les quatre copies n'ont pas dérivé ;
//   ② chaque job qui l'installe porte un `timeout-minutes` qui dépasse celui de
//     l'étape et couvre le pire SAIN : deux essais au pire + le reste du job au
//     pire MESURÉ — une borne vient d'une mesure, jamais d'un chiffre rond ;
//   ③ le bloc `run:` RÉEL, exécuté contre un faux `npx` (figé, en échec, ou qui
//     réussit) et le VRAI `timeout` raccourci : un essai figé est coupé, ses
//     survivants (`apt-get`, `dpkg`) achevés, l'essai relancé ; deux échecs
//     rendent l'étape rouge.
// La relance du job (« Re-run failed jobs ») est documentée dans le runbook ④.
// Ce que GitHub fait d'une étape ou d'un job hors délai, que `timeout` ne joint
// pas l'apt-get lancé par sudo, et qu'APT garde les paquets qu'un essai coupé
// avait tirés en entier, c'est le banc de la fiche qui l'a mesuré sur un vrai
// runner : docs/journal/telemetrie-pilotage-sentinelle.md, « UNE INSTALLATION FIGÉE ».
//
// MUTATIONS : ⑤ les rejoue une par une sur le texte réel.
// ═══════════════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "./lib/yaml-mini.mjs";
import "./lib/bash-windows.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8").split("\r\n").join("\n");
const DEPLOY = lire(".github/workflows/deploy.yml");

// Pire durée HORS INSTALLATION de chaque job, en minutes : API Actions, 35 derniers
// runs verts de `main` (2026-11-03 18:43 → 2026-11-06 08:30 UTC). Un job qui se
// met à installer Playwright sans mesure ici rougit : on mesure avant de borner.
const HORS_INSTALLATION_PIRE = { "test-prod": 6.2, "test-local": 13.8, "test-webkit": 7.9, "gates-artefact": 0.8 };
const MARGE = 2; // minutes au-dessus du pire sain
const JOBS_ATTENDUS = ["gates-artefact", "test-local", "test-prod", "test-webkit"];
const ESSAI_RE = /\btimeout --kill-after=(\d+)s (\d+)m npx playwright install --with-deps (chromium|webkit)\b/;

const entier = (v) => (/^\d+$/.test(String(v ?? "")) ? Number(v) : null);

/** Tout ce qui ne va pas dans les bornes d'installation d'un workflow. */
function auditer(texte) {
  const doc = parse(texte);
  const defauts = [];
  const vus = [];
  const formes = new Map();
  for (const [id, j] of Object.entries(doc.jobs || {})) {
    const etapes = (j.steps || []).filter((s) => /playwright install/.test(String(s.run || "")));
    if (!etapes.length) continue;
    vus.push(id);
    const J = entier(j["timeout-minutes"]);
    if (J === null) defauts.push(`${id} : aucun timeout-minutes de job — le défaut de GitHub est 360 min`);
    const reste = HORS_INSTALLATION_PIRE[id];
    if (reste === undefined) defauts.push(`${id} : aucune mesure de durée hors installation — mesurer avant de borner`);
    for (const s of etapes) {
      const ou = `${id} › ${s.name || "(étape sans nom)"}`;
      const run = String(s.run);
      const S = entier(s["timeout-minutes"]);
      if (S === null) defauts.push(`${ou} : aucun timeout-minutes d'étape`);
      for (const l of run.split("\n").filter((x) => /playwright install/.test(x))) {
        if (!ESSAI_RE.test(l)) defauts.push(`${ou} : un appel à playwright install n'est pas borné par timeout : ${l.trim()}`);
      }
      const essais = /^\s*for essai in ([\d ]+); do$/m.exec(run);
      const n = essais ? essais[1].trim().split(/\s+/).length : 1;
      if (n < 2) defauts.push(`${ou} : un seul essai — une installation figée n'est pas relancée`);
      if (!/then exit 0; fi/.test(run)) defauts.push(`${ou} : un essai réussi ne termine pas l'étape (then exit 0)`);
      // `timeout` ne joint pas l'apt-get lancé par sudo (banc du 06/11) : sans ces
      // deux lignes, le second essai meurt sur « Could not get lock ».
      for (const nom of ["apt-get", "dpkg"]) {
        if (!new RegExp(`^\\s*sudo pkill -KILL -x ${nom} \\|\\| true$`, "m").test(run)) defauts.push(`${ou} : le ${nom} survivant d'un essai coupé n'est pas achevé — il garde le verrou APT`);
      }
      if (/pkill[^\n]*\s-f\b/.test(run)) defauts.push(`${ou} : pkill -f compare la ligne de commande — il atteindrait sudo ou le shell de l'étape ; par nom (-x) seulement`);
      if (!/^\s*sudo dpkg --configure -a \|\| true$/m.test(run)) defauts.push(`${ou} : pas de réparation dpkg entre deux essais`);
      if (!/\n\s*exit 1\s*$/.test(run)) defauts.push(`${ou} : ne finit pas par exit 1 — deux échecs passeraient pour un succès`);
      const m = ESSAI_RE.exec(run);
      if (!m) continue;
      const boucle = n * (Number(m[2]) + Number(m[1]) / 60);
      if (S !== null && S < boucle + 1) defauts.push(`${ou} : la borne d'étape (${S} min) coupe sa propre boucle (${boucle} min au pire, plus le npm install)`);
      if (S !== null && S > 30) defauts.push(`${ou} : borne d'étape de ${S} min — au-delà de 30, ce n'est plus un filet`);
      if (J !== null && S !== null && J <= S) defauts.push(`${id} : la borne du job (${J}) doit dépasser celle de l'étape (${S}) — c'est l'étape, plus précise, qui doit parler`);
      if (reste !== undefined && J !== null && J < boucle + reste + MARGE) defauts.push(`${id} : borne de job ${J} min < pire sain ${(boucle + reste).toFixed(1)} min + ${MARGE} de marge`);
      if (J !== null && J > 60) defauts.push(`${id} : borne de job de ${J} min — au-delà d'une heure elle ne borne plus rien`);
      const forme = run.replace(/--with-deps (chromium|webkit)/g, "--with-deps <navigateur>");
      formes.set(forme, [...(formes.get(forme) || []), id]);
    }
  }
  if (formes.size > 1) defauts.push(`les étapes d'installation ont dérivé (${[...formes.values()].map((v) => v.join("+")).join(" ≠ ")}) : une seule forme, quatre copies`);
  return { vus: vus.sort(), defauts };
}

const etapeReelle = (texte, job) => parse(texte).jobs[job].steps.find((s) => /playwright install/.test(String(s.run || "")));

test("① ② deploy.yml réel : les quatre jobs qui installent Playwright sont bornés, eux et leur installation", () => {
  const { vus, defauts } = auditer(DEPLOY);
  assert.deepEqual(defauts, []);
  assert.deepEqual(vus, JOBS_ATTENDUS);
  // Le navigateur reste celui de chaque job (webkit-ci.test.mjs tient le reste de test-webkit).
  assert.match(etapeReelle(DEPLOY, "test-webkit").run, /--with-deps webkit/);
  for (const j of ["test-prod", "test-local", "gates-artefact"]) assert.match(etapeReelle(DEPLOY, j).run, /--with-deps chromium/);
});

// ── ③ Le bloc réel, joué contre un faux npx et le vrai `timeout` raccourci ──────
const VRAI_TIMEOUT = execFileSync("bash", ["-c", "command -v timeout"], { encoding: "utf8" }).trim();
const VRAI_SLEEP = execFileSync("bash", ["-c", "command -v sleep"], { encoding: "utf8" }).trim();
const BAC = fs.mkdtempSync(path.join(os.tmpdir(), "bornes-ci-"));
const LOG = path.join(BAC, "journal.txt");
fs.mkdirSync(path.join(BAC, "bin"));
const faux = {
  npm: 'echo "npm $*" >> "$LOG"\nexit 0',
  sudo: 'echo "sudo $*" >> "$LOG"\nexit 0',
  // Le délai entre les `pkill` et la réparation est journalisé, pas attendu.
  sleep: 'echo "sleep $*" >> "$LOG"\nexit 0',
  // Le faux timeout journalise SES arguments (la borne réelle), puis délègue au VRAI
  // timeout : c'est le vrai qui coupe l'essai figé, avec une borne de 0,3 s.
  // SCENARIO="fige,ok" : comportement du n-ième appel. `fige` ne rend jamais la main.
  // ⚠️ L'ESSAI SE COMPTE ICI, ET SEUL `fige` EST BORNÉ COURT (2026-11-07). Tout se
  // faisait dans le faux `npx`, donc sous les 0,3 s : sur Windows, démarrer un bash
  // sous charge les dépasse. Six exécutions en parallèle : 18 rouges sur 18, jusqu'à
  // un essai `ok` coupé, ou un essai tué avant d'avoir été compté.
  timeout: [
    'echo "timeout $*" >> "$LOG"',
    'shift 2',
    'n=$(( $(cat "$COMPTEUR" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$COMPTEUR"',
    'IFS=, read -ra plan <<< "$SCENARIO"; export QUOI="${plan[$((n-1))]:-ok}"',
    'echo "$* :: essai $n :: $QUOI" >> "$LOG"',
    'if [ "$QUOI" = fige ]; then borne=0.3s; else borne=20s; fi',
    'exec "$VRAI_TIMEOUT" --kill-after=1s "$borne" "$@"',
  ].join("\n"),
  npx: 'case "$QUOI" in ok) exit 0 ;; echec) exit 1 ;; fige) exec "$VRAI_SLEEP" 30 ;; esac',
};
for (const [nom, corps] of Object.entries(faux)) {
  fs.writeFileSync(path.join(BAC, "bin", nom), "#!/usr/bin/env bash\n" + corps + "\n");
  fs.chmodSync(path.join(BAC, "bin", nom), 0o755);
}

/** Joue le bloc `run:` réel sous `bash -e` (le shell par défaut d'un `run:` sans `shell:`). */
function jouer(script, scenario) {
  fs.writeFileSync(LOG, "");
  const compteur = path.join(BAC, "compteur");
  fs.rmSync(compteur, { force: true });
  fs.writeFileSync(path.join(BAC, "etape.sh"), script);
  const debut = Date.now();
  const r = spawnSync("bash", ["-e", path.join(BAC, "etape.sh")], {
    encoding: "utf8",
    timeout: 20000,
    env: {
      ...process.env,
      PATH: path.join(BAC, "bin").replace(/^([A-Za-z]):/, (x, d) => "/" + d.toLowerCase()) + path.delimiter + process.env.PATH,
      LOG, COMPTEUR: compteur, SCENARIO: scenario, VRAI_TIMEOUT, VRAI_SLEEP,
    },
  });
  const lignes = fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean);
  return { code: r.status, sortie: String(r.stdout || "") + String(r.stderr || ""), lignes, ms: Date.now() - debut };
}
const compte = (lignes, motif) => lignes.filter((l) => motif.test(l)).length;

test("③ bac : le timeout délégué est celui de GNU coreutils", () => {
  assert.match(execFileSync("bash", ["-c", "timeout --version"], { encoding: "utf8" }), /coreutils/);
});

test("③ un essai qui réussit termine l'étape : un seul appel, la borne réelle passée à timeout", () => {
  const r = jouer(etapeReelle(DEPLOY, "test-local").run, "ok");
  assert.equal(r.code, 0, r.sortie);
  assert.deepEqual(r.lignes, [
    "npm install --no-save @playwright/test",
    "timeout --kill-after=30s 10m npx playwright install --with-deps chromium",
    "npx playwright install --with-deps chromium :: essai 1 :: ok",
  ]);
  assert.doesNotMatch(r.sortie, /::warning|::error/);
});

for (const job of JOBS_ATTENDUS) {
  test(`③ ${job} : un essai FIGÉ est coupé par timeout puis relancé, et le second réussit`, () => {
    const r = jouer(etapeReelle(DEPLOY, job).run, "fige,ok");
    assert.equal(r.code, 0, r.sortie);
    assert.equal(compte(r.lignes, /^npx /), 2);
    // Entre les deux essais, dans cet ordre : achever les survivants, laisser le
    // noyau rendre leurs verrous, réparer dpkg.
    const entre = r.lignes.slice(r.lignes.findIndex((l) => / essai 1 /.test(l)) + 1, r.lignes.findIndex((l) => / essai 2 /.test(l)));
    assert.deepEqual(entre.filter((l) => !/^timeout /.test(l)), [
      "sudo pkill -KILL -x apt-get",
      "sudo pkill -KILL -x dpkg",
      "sleep 2",
      "sudo dpkg --configure -a",
    ]);
    assert.match(r.sortie, /::warning title=Installation Playwright::essai 1\/2/);
    assert.ok(r.ms < 10000, `l'essai figé a été attendu au lieu d'être coupé (${r.ms} ms)`);
  });
}

test("③ deux échecs : l'étape est ROUGE, après exactement deux essais, et dit quoi faire", () => {
  for (const scenario of ["echec,echec", "fige,fige", "fige,echec"]) {
    const r = jouer(etapeReelle(DEPLOY, "test-local").run, scenario);
    assert.equal(r.code, 1, `${scenario} : ${r.sortie}`);
    assert.equal(compte(r.lignes, /^npx /), 2, scenario);
    assert.match(r.sortie, /::error title=Installation Playwright impossible::.*Re-run failed jobs/, scenario);
    assert.ok(r.ms < 10000, `${scenario} : ${r.ms} ms`);
  }
});

test("③ un premier échec franc est relancé aussi", () => {
  const r = jouer(etapeReelle(DEPLOY, "test-local").run, "echec,ok");
  assert.equal(r.code, 0, r.sortie);
  assert.equal(compte(r.lignes, /^npx /), 2);
});

test("④ le runbook dit quoi faire quand les deux essais ont échoué : relancer le job, pas toucher au code", () => {
  const runbook = lire("docs/RUNBOOK_MOIS_DE_TEST.md");
  const ligne = runbook.split("\n").find((l) => l.includes("Installation Playwright impossible"));
  assert.ok(ligne, "le runbook doit nommer l'annotation « Installation Playwright impossible »");
  assert.match(ligne, /Re-run failed jobs/);
  assert.match(ligne, /gh run rerun <id> --failed/);
});

test("⑤ MUTATIONS rejouées sur le texte réel : chacune rougit, en nommant le bon défaut", () => {
  const muter = (avant, apres, texte = DEPLOY) => {
    const t = texte.replace(avant, apres);
    assert.notEqual(t, texte, `la mutation doit s'appliquer : ${avant}`);
    return t;
  };
  const rouge = (texte, motif) => {
    const { defauts } = auditer(texte);
    assert.ok(defauts.some((d) => motif.test(d)), `attendu ${motif}, lu : ${JSON.stringify(defauts)}`);
  };
  // Le défaut d'origine : plus aucune borne de job.
  rouge(muter("    timeout-minutes: 40\n", ""), /^test-local : aucun timeout-minutes de job/);
  // Une étape sans filet (la première copie, celle de test-prod).
  rouge(muter("        timeout-minutes: 25\n", ""), /^test-prod › Installer Playwright : aucun timeout-minutes d'étape/);
  // L'essai rendu illimité : le figement du 06/11 revient, borné par l'étape seule.
  rouge(muter("if timeout --kill-after=30s 10m npx playwright install --with-deps chromium; then", "if npx playwright install --with-deps chromium; then"),
    /n'est pas borné par timeout/);
  // Plus de relance.
  rouge(muter("for essai in 1 2; do", "for essai in 1; do"), /un seul essai/);
  // Deux échecs passés pour un succès : sans `exit 1`, l'étape finit sur l'echo, vert.
  rouge(muter(/\n {10}exit 1\n/, "\n"), /ne finit pas par exit 1/);
  rouge(muter("            sudo dpkg --configure -a || true\n", ""), /pas de réparation dpkg/);
  // Le défaut trouvé par le banc v1 : sans achever l'apt-get survivant, le second essai meurt sur le verrou.
  rouge(muter("            sudo pkill -KILL -x apt-get || true\n", ""), /le apt-get survivant d'un essai coupé n'est pas achevé/);
  rouge(muter("sudo pkill -KILL -x apt-get", "sudo pkill -KILL -f apt-get"), /pkill -f compare la ligne de commande/);
  // Bornes mal posées.
  rouge(muter("    timeout-minutes: 40\n", "    timeout-minutes: 30\n"), /^test-local : borne de job 30 min < pire sain 34\.8/);
  rouge(muter("    timeout-minutes: 40\n", "    timeout-minutes: 360\n"), /^test-local : borne de job de 360 min/);
  rouge(muter("        timeout-minutes: 25\n", "        timeout-minutes: 15\n"), /coupe sa propre boucle/);
  rouge(muter("    timeout-minutes: 30\n", "    timeout-minutes: 25\n"), /^test-prod : la borne du job \(25\) doit dépasser celle de l'étape \(25\)/);
  // Une copie qui dérive.
  rouge(muter("2 en échec ou figé", "2 a échoué"), /les étapes d'installation ont dérivé/);
  // Un nouveau job qui installe Playwright sans borne ni mesure.
  const nouveau = DEPLOY.replace(/\n {2}smoke:\n/, "\n  autre-suite:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx playwright install --with-deps chromium\n\n  smoke:\n");
  assert.notEqual(nouveau, DEPLOY);
  rouge(nouveau, /^autre-suite : aucun timeout-minutes de job/);
  rouge(nouveau, /^autre-suite › \(étape sans nom\) : un appel à playwright install n'est pas borné par timeout/);
  rouge(nouveau, /^autre-suite : aucune mesure de durée hors installation/);
});

test("⑤ la réparation qui « marche » sans `exit 1` passe pour verte : le bac le voit aussi", () => {
  const sansExit = etapeReelle(DEPLOY, "test-local").run.replace(/\n\s*exit 1\s*$/, "\n");
  assert.notEqual(sansExit, etapeReelle(DEPLOY, "test-local").run);
  assert.equal(jouer(sansExit, "echec,echec").code, 0, "sans exit 1, deux échecs rendent l'étape verte : c'est le défaut que ① interdit");
});
