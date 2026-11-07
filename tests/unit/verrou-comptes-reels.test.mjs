// ═══════════════════════════════════════════════════════════════════════════
// LE VERROU DES SUITES À COMPTES RÉELS FAIT LA QUEUE : IL N'ÉVINCE PERSONNE.
//
// `passio-e2e-prod` est un groupe de concurrence GitHub. Sans `queue: max`, un
// groupe ne garde qu'UN job en attente, et tout nouvel entrant annule celui qui
// patiente, quelle que soit son origine. Un job de PR annulait ainsi la suite
// production d'un run de `main` : `smoke` rouge, déploiement sauté, code vert.
// Mesuré le 2026-11-04 : 14 suites évincées sur 64, dont 4 de `main`.
//
// C'est l'ARRIVANT qui décide : un seul entrant sans la clé annule le job qui
// attend, même si celui-ci la porte. La règle vaut donc pour TOUS les entrants.
//
// Ce test lit les workflows TELS QU'ILS SONT, avec le lecteur YAML du dépôt. Il
// prouve que chaque entrant porte la clé ; que GitHub l'honore au niveau d'un job
// et entre plusieurs runs, c'est le banc de la fiche qui l'a mesuré :
// docs/journal/telemetrie-pilotage-sentinelle.md, « LE VERROU ÉVINÇAIT `main` ».
//
// MUTATIONS : ⑤ les rejoue une par une sur le texte réel, pour qu'un lecteur
// devenu aveugle rougisse ici plutôt que de rester vert sur tout.
// ═══════════════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "./lib/yaml-mini.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOSSIER = path.join(RACINE, ".github", "workflows");
const VERROU = "passio-e2e-prod";
const MARQUEUR = "PASSIO_E2E_PROD";
const GROUPE_DU_RUN = "${{ github.event_name == 'push' && 'passio-deploy-main' || format('passio-ci-pr-{0}', github.event.pull_request.number) }}";

const reels = () => Object.fromEntries(
  fs.readdirSync(DOSSIER).filter((f) => /\.ya?ml$/.test(f)).sort()
    .map((f) => [f, fs.readFileSync(path.join(DOSSIER, f), "utf8").split("\r\n").join("\n")]),
);

/** Les lignes qui agissent : un commentaire explique le verrou, il n'y entre pas. */
const lignesDeCode = (texte) => texte.split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .map((l) => l.replace(/\s+#.*$/, ""));

/**
 * Tous les entrants du verrou, et ce qui ne va pas chez chacun.
 * ⚠️ Un fichier que le lecteur refuse (scalaire plié)
 * n'est toléré que s'il ne nomme ni le verrou ni le marqueur : on ne conclut jamais
 * « aucun entrant » de ce qu'on n'a pas su lire.
 */
function auditer(fichiers) {
  const entrants = [];
  const defauts = [];
  for (const [f, texte] of Object.entries(fichiers)) {
    const code = lignesDeCode(texte);
    const nomme = code.filter((l) => l.includes(VERROU)).length;
    if (!nomme && !code.some((l) => l.includes(MARQUEUR))) continue;
    let doc;
    try { doc = parse(texte); } catch (e) { defauts.push(`${f} : illisible (${e.message})`); continue; }

    const portes = doc.concurrency ? [["(workflow)", doc.concurrency]] : [];
    for (const [job, j] of Object.entries(doc.jobs || {})) if (j && j.concurrency) portes.push([job, j.concurrency]);

    const tenants = new Set();
    for (const [ou, bloc] of portes) {
      const groupe = typeof bloc === "string" ? bloc : String(bloc.group ?? "");
      if (!groupe.includes(VERROU)) continue;
      const id = `${f}:${ou}`;
      entrants.push(id);
      tenants.add(ou);
      if (typeof bloc === "string") { defauts.push(`${id} : bloc en flux, le lecteur ne le déplie pas : l'écrire en lignes`); continue; }
      if (bloc.group !== VERROU) defauts.push(`${id} : groupe non constant (${bloc.group}) : la purge et le quota exigent un seul groupe, sinon deux suites se chevauchent`);
      if (bloc.queue !== "max") defauts.push(`${id} : \`queue: max\` manque : sans elle, cet entrant annule le job qui attend, même si celui-ci la porte`);
      if (bloc["cancel-in-progress"] !== "false") defauts.push(`${id} : \`cancel-in-progress\` doit rester false : une suite interrompue abandonne ses comptes, et GitHub refuse le workflow avec \`queue: max\``);
    }
    if (tenants.size !== nomme) defauts.push(`${f} : ${nomme} ligne(s) nomment le verrou pour ${tenants.size} entrant(s) lu(s)`);

    // Le marqueur autorise une purge PAR MOTIF : sans le verrou, elle efface les
    // comptes de la suite qui le tient (l'incident du 2026-09-01).
    const pose = (env) => !!env && typeof env === "object" && MARQUEUR in env;
    const posePar = (s) => pose(s.env) || lignesDeCode(String(s.run || "")).some((l) => l.includes(`${MARQUEUR}=`));
    for (const [job, j] of Object.entries(doc.jobs || {})) {
      if (!j) continue;
      if (!pose(j.env) && !(j.steps || []).some(posePar)) continue;
      if (!tenants.has(job) && !tenants.has("(workflow)")) defauts.push(`${f}:${job} : pose ${MARQUEUR} sans tenir le verrou`);
    }
  }
  return { entrants, defauts };
}

/** Ce qui fait qu'une PR ne peut plus faire sauter un déploiement, au-delà de la clé. */
function auditerDeploiement(texte) {
  const defauts = [];
  const doc = parse(texte);
  const c = doc.concurrency || {};
  if (c.group !== GROUPE_DU_RUN) defauts.push(`groupe du run modifié (${c.group}) : un run de \`main\` ne doit partager son groupe avec aucune PR`);
  if (c.queue === "max") defauts.push("`queue: max` au niveau du run : chaque commit intermédiaire de `main` serait rejoué et déployé tour à tour");
  // La sortie facile : retirer la suite des barrières ferait « marcher » le déploiement.
  for (const job of ["deploy", "smoke"]) {
    const needs = String((doc.jobs[job] || {}).needs || "");
    if (!/(^|[\s,[])test-prod($|[\s,\]])/.test(needs)) defauts.push(`${job} n'attend plus test-prod : le déploiement perdrait sa barrière`);
  }
  return defauts;
}

test("① tout entrant du verrou porte `queue: max`, un groupe constant et `cancel-in-progress: false`", () => {
  const { entrants, defauts } = auditer(reels());
  assert.deepEqual(defauts, []);
  for (const attendu of ["deploy.yml:test-prod", "sentinelle-distante.yml:health", "controle-realtime.yml:(workflow)"]) {
    assert.ok(entrants.includes(attendu), `${attendu} doit tenir le verrou (entrants lus : ${entrants.join(", ")})`);
  }
});

test("② un job qui purge les comptes par motif tient le verrou", () => {
  const { defauts } = auditer({ "x.yml": `name: x\non: push\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx playwright test\n        env:\n          ${MARQUEUR}: "1"\n` });
  assert.equal(defauts.length, 1, "le lecteur doit voir le marqueur posé sur une étape");
  assert.match(defauts[0], /x\.yml:j : pose PASSIO_E2E_PROD sans tenir le verrou/);
});

test("③ au niveau du run : `main` a son groupe, reste en `single`, et le déploiement attend toujours la suite", () => {
  assert.deepEqual(auditerDeploiement(reels()["deploy.yml"]), []);
});

test("④ un fichier illisible qui nomme le verrou rougit ; un fichier illisible qui ne le nomme pas est sans objet", () => {
  const plie = "name: x\non: push\njobs:\n  j:\n    if: >\n      true\n";
  assert.deepEqual(auditer({ "x.yml": plie }).defauts, []);
  const r = auditer({ "x.yml": `${plie}    concurrency:\n      group: ${VERROU}\n` });
  assert.equal(r.defauts.length, 1);
  assert.match(r.defauts[0], /x\.yml : illisible/);
});

test("⑤ MUTATIONS rejouées sur le texte réel : chacune rougit, en nommant le bon entrant", () => {
  const vrai = reels();
  const muter = (f, avant, apres) => {
    const texte = typeof avant === "string" ? vrai[f].replace(avant, () => apres) : vrai[f].replace(avant, apres);
    assert.notEqual(texte, vrai[f], `la mutation doit s'appliquer à ${f} : ${avant}`);
    return { ...vrai, [f]: texte };
  };
  const sansCle = (f) => muter(f, /(group: passio-e2e-prod\n\s+cancel-in-progress: false\n)\s+queue: max\n/, "$1");
  const rouge = (fichiers, motif) => {
    const { defauts } = auditer(fichiers);
    assert.ok(defauts.some((d) => motif.test(d)), `attendu ${motif}, lu : ${JSON.stringify(defauts)}`);
  };

  // Le défaut d'origine, sur chacun des trois entrants.
  rouge(sansCle("deploy.yml"), /deploy\.yml:test-prod : `queue: max` manque/);
  rouge(sansCle("sentinelle-distante.yml"), /sentinelle-distante\.yml:health : `queue: max` manque/);
  rouge(sansCle("controle-realtime.yml"), /controle-realtime\.yml:\(workflow\) : `queue: max` manque/);

  // La fausse bonne idée : un groupe par déclencheur fait chevaucher `main` et les PR.
  rouge(muter("deploy.yml", "      group: passio-e2e-prod", "      group: ${{ github.event_name == 'push' && 'passio-e2e-prod-main' || 'passio-e2e-prod' }}"),
    /deploy\.yml:test-prod : groupe non constant/);

  // GitHub refuse `queue: max` avec `cancel-in-progress: true` : plus aucun run.
  rouge(muter("deploy.yml", /(group: passio-e2e-prod\n\s+cancel-in-progress: )false/, "$1true"),
    /deploy\.yml:test-prod : `cancel-in-progress` doit rester false/);

  // Sortir du verrou en gardant la purge : les deux formes de l'incident du 2026-09-01.
  rouge(muter("deploy.yml", "      group: passio-e2e-prod", "      group: passio-e2e-ailleurs"),
    /deploy\.yml:test-prod : pose PASSIO_E2E_PROD sans tenir le verrou/);
  rouge(muter("deploy.yml", "    name: Suites navigateur (${{ matrix.shard }}/6)\n    runs-on: ubuntu-latest\n",
    `    name: Suites navigateur (\${{ matrix.shard }}/6)\n    runs-on: ubuntu-latest\n    env:\n      ${MARQUEUR}: "1"\n`),
  /deploy\.yml:test-local : pose PASSIO_E2E_PROD sans tenir le verrou/);

  // Un bloc en flux que le lecteur ne déplie pas ne doit pas passer pour conforme.
  rouge(muter("deploy.yml", /concurrency:\n\s+group: passio-e2e-prod\n\s+cancel-in-progress: false\n\s+queue: max\n/, "concurrency: { group: passio-e2e-prod, cancel-in-progress: false, queue: max }\n"),
    /deploy\.yml:test-prod : bloc en flux/);

  // Le niveau du run : le défaut du 2026-08-30, la file sur les commits, la barrière retirée.
  const deploiement = (avant, apres) => {
    const texte = vrai["deploy.yml"].replace(avant, () => apres);
    assert.notEqual(texte, vrai["deploy.yml"], `la mutation doit s'appliquer : ${avant}`);
    return auditerDeploiement(texte);
  };
  assert.match(deploiement(`  group: ${GROUPE_DU_RUN}`, "  group: passio-ci").join(), /groupe du run modifié/);
  assert.match(deploiement(`  group: ${GROUPE_DU_RUN}\n  cancel-in-progress: false\n`, `  group: ${GROUPE_DU_RUN}\n  cancel-in-progress: false\n  queue: max\n`).join(), /`queue: max` au niveau du run/);
  assert.match(deploiement("needs: [governance, audits, test-prod, test-local, gates-artefact, test-webkit]", "needs: [governance, audits, test-local, gates-artefact, test-webkit]").join(), /deploy n'attend plus test-prod/);
  assert.match(deploiement("needs: [audits, test-prod, test-local, gates-artefact, test-webkit]", "needs: [audits, test-local, gates-artefact, test-webkit]").join(), /smoke n'attend plus test-prod/);
});
