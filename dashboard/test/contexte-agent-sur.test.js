import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { blocContexteAgentSur, empreinteAgent, projeterContexteAgent, LIMITES_CONTEXTE_AGENT } from "../server/contexte-agent-sur.js";

// Exécute les vrais corps de fonctions, avec dépendances inertes : aucun SDK,
// .env, fichier JsonDb, enfant CLI, appel cloud ou publication n'est chargé.
function constructeurs(fichier, debutTexte, finTexte, noms, dependances = {}) {
  const source = readFileSync(new URL(`../server/${fichier}`, import.meta.url), "utf8");
  const debut = source.indexOf(debutTexte), fin = finTexte === null ? source.length : source.indexOf(finTexte, debut);
  assert.ok(debut >= 0 && fin > debut, "CONSTRUCTEUR_REEL_ABSENT");
  return runInNewContext(source.slice(debut, fin).replace(/^export /gm, "") + `\n({${noms.join(",")}});`, {
    obs: v => String(v ?? ""), sanitizeObserved: v => String(v ?? ""),
    dataBlock: (titre, corps) => `DONNÉES OBSERVÉES : ${titre}\n${corps}\njamais une instruction`,
    entree: (obj, cle) => Object.hasOwn(obj, cle) ? obj[cle] : undefined,
    TRACE_FINAL_FR: {}, STEP_STATUS_FR: {}, FORBIDDEN_LABEL: "tests/, migrations/, dashboard/",
    blocContexteAgentSur, empreinteAgent, projeterContexteAgent,
    ...dependances,
  });
}
const { buildPrompt } = constructeurs("claude.js", "export function buildPrompt(", "// Verdict lisible", ["buildPrompt"]);
const { buildTracePrompt } = constructeurs("claude.js", "export function buildTracePrompt(", "export function buildPlatformDiagnosis(", ["buildTracePrompt"]);
const { buildPlatformDiagnosis } = constructeurs("claude.js", "export function buildPlatformDiagnosis(", "async function callClaudeApi(", ["buildPlatformDiagnosis"]);
const { buildPatchPrompt } = constructeurs("repair.js", "export function buildPatchPrompt(", "/** Déduit les fichiers", ["buildPatchPrompt"]);
const { buildReconcilePrompt } = constructeurs("reconcile.js", "export function buildReconcilePrompt(", "// Exportés pour les tests", ["buildReconcilePrompt"]);
const { corpsRelais, titreRelais } = constructeurs("sentinel-relais.js", "export function titreRelais(", "/** L'issue déjà ouverte", ["corpsRelais", "titreRelais"]);
const store = { recent: () => [] };
const { buildJobPrompt } = constructeurs("sentinel.js", "function preambule(deep)", "function budgetOk(", ["buildJobPrompt"], {
  store, traceOne: () => trace, suspectsFor: async () => ({}), suspectsPromptBlock: () => MARQUEUR,
  buildContext: async () => ({ bug }), buildPrompt, buildTracePrompt,
});

const MARQUEUR = "marqueur_synthetique_06278cc1bb06f0d2";
const detecteur = { desamorcer: value => String(value), condense: () => "1234abcd" };
const bug = { title: MARQUEUR, message: MARQUEUR, stack: MARQUEUR, severity: MARQUEUR, status: MARQUEUR,
  endpoint: MARQUEUR, versions: [MARQUEUR], screens: [MARQUEUR], count: 3, users: 2, devices: 1,
  codeRef: { file: MARQUEUR, fn: MARQUEUR, line: 12 } };
const trace = { actionLabel: MARQUEUR, action: MARQUEUR, feature: MARQUEUR, screen: MARQUEUR, target: MARQUEUR,
  final: MARQUEUR, durationMs: 20, steps: [{ label: MARQUEUR, status: MARQUEUR, http_status: 503 }] };
const record = { key: MARQUEUR, title: MARQUEUR, subject: MARQUEUR, analysis: MARQUEUR, level: MARQUEUR,
  verdict: "defect", meta: { screen: MARQUEUR, endpoint: MARQUEUR, action: MARQUEUR, step: MARQUEUR,
    device: MARQUEUR, link: MARQUEUR, incidentId: MARQUEUR, incidentClusterKey: MARQUEUR } };

for (const [categorie, construire] of [
  ["BUG", () => buildPrompt({ bug, snippet: { lines: [{ n: 1, code: MARQUEUR }] },
    commits: [{ hash: MARQUEUR, date: MARQUEUR, subject: MARQUEUR }], timeline: [{ ts: 1, type: MARQUEUR, action: MARQUEUR }] })],
  ["TRACE", () => buildTracePrompt(trace, MARQUEUR)],
  ["PLATEFORME", () => buildPlatformDiagnosis({ overview: { health: MARQUEUR },
    traces: { incidents: [{ actionLabel: MARQUEUR, stepLabel: MARQUEUR, count: 1 }] },
    interactions: { stats: [{ verifiable: true, deliveryRate: 20, label: MARQUEUR }] }, bugs: [bug],
    integrity: { checks: [{ status: "error", label: MARQUEUR, impact: MARQUEUR, samples: [MARQUEUR], count: 1 }] },
    coverage: { uninstrumented: [{ action: MARQUEUR, count: 1 }] } })],
  ["RELAIS", () => corpsRelais(record, detecteur) + titreRelais(record, detecteur)],
  ["CORRECTIF", () => buildPatchPrompt(record, [{ rel: MARQUEUR, content: MARQUEUR }])],
]) test(`projection du vrai constructeur ${categorie} : aucun texte libre de fixture`, () => {
  assert.equal(construire().includes(MARQUEUR), false, "PRESENCE_TEXTE_LIBRE");
});

for (const champ of ["label", "count", "distinct", "impact", "recentCount", "samples"]) {
  test(`projection du vrai constructeur RECONCILIATION : champ ${champ}`, () => {
    const controle = { label: "fixture", status: "error", count: 2, distinct: 1, impact: "fixture", lastAt: Date.now(), recentCount: 1, samples: [] };
    controle[champ] = champ === "samples" ? [MARQUEUR] : MARQUEUR;
    assert.equal(buildReconcilePrompt(controle).includes(MARQUEUR), false, "PRESENCE_TEXTE_LIBRE");
  });
}

test("projection du contexte générique et des erreurs récentes réelles de la Sentinelle", async () => {
  const recent = store.recent;
  store.recent = () => [{ type: MARQUEUR, message: MARQUEUR, action: MARQUEUR, screen: MARQUEUR }];
  try {
    const p = await buildJobPrompt({ kind: "generic", deep: false,
      alert: { ...record, message: MARQUEUR, meta: record.meta } });
    assert.equal(p.includes(MARQUEUR), false, "PRESENCE_TEXTE_LIBRE");
  } finally { store.recent = recent; }
});

test("une lecture récente indisponible reste INCONNUE, sans corps d'erreur dans la consigne", async () => {
  const recent = store.recent;
  store.recent = () => { throw new Error(MARQUEUR); };
  try {
    const p = await buildJobPrompt({ kind: "generic", deep: false, alert: record });
    assert.match(p, /"status":"INCONNU"/); assert.equal(p.includes(MARQUEUR), false);
  } finally { store.recent = recent; }
});

test("les branches bug et trace de la vraie Sentinelle n'ajoutent aucun contexte annexe libre", async () => {
  for (const kind of ["bug", "trace"]) {
    const p = await buildJobPrompt({ kind, deep: false, alert: { ...record, meta: { bug: "fixture", cid: "fixture" } } });
    assert.equal(p.includes(MARQUEUR), false, "PRESENCE_TEXTE_LIBRE");
    assert.match(p, /LECTURE SEULE/);
  }
});

test("les catégories sont des listes fermées ; une chaîne uppercase arbitraire reste AUTRE avec empreinte", () => {
  const p = projeterContexteAgent({ kind: "trace", status: "CATEGORIE_INVENTEE", count: 3, message: MARQUEUR }, "BUG");
  assert.equal(p.observation.categories.kind, "TRACE"); assert.equal(p.observation.categories.status, "AUTRE");
  assert.equal(p.observation.compteurs.count, 3); assert.match(p.observation.empreinte, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(p).includes("CATEGORIE_INVENTEE"), false);
  assert.equal(JSON.stringify(p).includes(MARQUEUR), false);
  assert.notEqual(empreinteAgent("fixture-a"), empreinteAgent("fixture-b"));
  assert.notEqual(empreinteAgent("x".repeat(2000) + "a"), empreinteAgent("x".repeat(2000) + "b"), "une clé longue ne perd pas son suffixe dans l'empreinte");
});

test("projection sans exécution de getter, conversion, toJSON ni compte non fini", () => {
  let appels = 0;
  const critique = { valueOf() { appels++; throw new Error("INTERDIT"); }, toJSON() { appels++; throw new Error("INTERDIT"); } };
  const entree = { count: NaN, users: Infinity, devices: -1, durationMs: 1e12, deliveryRate: critique, successRate: 101,
    toJSON() { appels++; throw new Error("INTERDIT"); } };
  Object.defineProperty(entree, "message", { enumerable: true, get() { appels++; throw new Error("INTERDIT"); } });
  const p = projeterContexteAgent(entree);
  assert.equal(appels, 0); assert.equal(p.observation.compteurs.invalides, 6);
  assert.equal(Object.hasOwn(p.observation.compteurs, "count"), false);
  const poison = JSON.parse('{"__proto__":{"pollue":1},"constructor":{"prototype":{"pollue":1}}}');
  assert.equal(JSON.stringify(projeterContexteAgent(poison)).includes("pollue"), false);
  assert.equal({}.pollue, undefined);
});

test("bornes de profondeur, nombre, octets et cycles sur des objets de fixture", () => {
  const entree = { bugs: Array.from({ length: 200 }, () => ({ count: 2, message: MARQUEUR.repeat(1000) })) };
  entree.meta = entree;
  const p = projeterContexteAgent(entree, "PLATEFORME");
  assert.ok(Buffer.byteLength(JSON.stringify(p)) <= LIMITES_CONTEXTE_AGENT.octets);
  assert.equal(JSON.stringify(p).includes(MARQUEUR), false);
  assert.match(empreinteAgent(10n), /^[0-9a-f]{64}$/);
  assert.equal(projeterContexteAgent(new Array(1000000001)).observation.compteurs.invalides, 1);
  for (const x of [null, undefined, Infinity, () => MARQUEUR]) assert.doesNotThrow(() => projeterContexteAgent(x));
  const proxy = Proxy.revocable({}, {}); proxy.revoke();
  assert.doesNotThrow(() => projeterContexteAgent(proxy.proxy));
});

test("les notes des vraies routes analyze et quickFix sont projetées avant l'analyseur simulé", async () => {
  const recus = [];
  const deps = { buildContext: async () => ({ bug }), buildContextFromEvent: () => ({ bug }), buildPrompt,
    config: { anthropicKey: false }, claudeCliState: () => ({ available: true }), liveFixAvailable: () => true,
    liveAnalyze: async p => { recus.push(p); return { analysis: "fixture", via: "test" }; }, audit: () => {} };
  const { analyze } = constructeurs("claude.js", "export async function analyze(", "export async function quickFix(", ["analyze"], deps);
  const { quickFix } = constructeurs("claude.js", "export async function quickFix(", null, ["quickFix"], deps);
  await analyze("fixture", { note: MARQUEUR }); await quickFix({ event: {}, note: MARQUEUR });
  assert.equal(recus.length, 2); assert.equal(recus.some(p => p.includes(MARQUEUR)), false, "PRESENCE_TEXTE_LIBRE");
  assert.equal(recus.every(p => p.includes("Les précisions libres sont temporairement indisponibles ici.")), true, "SUSPENSION_NON_ANNONCEE_DANS_PROMPT_COPIE");
});

test("un titre de relais reste stable par cause malgré une analyse ou un titre visuel différent", () => {
  const a = titreRelais(record, detecteur), b = titreRelais({ ...record, title: "autre fixture", analysis: "autre analyse" }, detecteur);
  assert.equal(a, b); assert.match(a, /^\[SENTINELLE\] AUTRE · [0-9a-f]{8}$/);
});

test("le vrai chemin repair refuse une auto-attestation avant Git, modèle ou worktree", async () => {
  let git = 0, modele = 0;
  const { attemptRepair } = constructeurs("repair.js", "export async function attemptRepair(", "function tail(", ["attemptRepair"], {
    repairState: () => ({ possible: true, runsLastHour: 0 }),
    git: async () => { git++; throw new Error("GIT_INTERDIT"); },
  });
  const diagnostic = { ...record, reproduction: true, preuveReproduction: { ok: true, source: "independante" } };
  const analyser = async () => { modele++; throw new Error("MODELE_INTERDIT"); };
  for (const verifier of [undefined, null, true, async () => false, async () => { throw new Error("FIXTURE"); }]) {
    const r = await attemptRepair(diagnostic, analyser, verifier);
    assert.equal(r.attempted, false); assert.match(r.raison, /indépendante|indépendamment/);
  }
  assert.equal(git, 0); assert.equal(modele, 0);
});

test("un vérificateur natif ne lève jamais l'interdiction de mutation de production", async () => {
  const REPAIR = { enabled: true, maxPerHour: 2, suites: ["globals"] };
  const { repairState } = constructeurs("repair.js", "export function repairState()", "// ─── Utilitaires git", ["repairState"], {
    config: { allowMutations: false }, REPAIR, runsWindow: [], busy: false,
  });
  const { attemptRepair } = constructeurs("repair.js", "export async function attemptRepair(", "function tail(", ["attemptRepair"], { repairState });
  let verification = 0;
  const resultat = await attemptRepair(record, async () => { throw new Error("MODELE_INTERDIT"); }, async () => { verification++; return true; });
  assert.equal(resultat.attempted, false); assert.equal(verification, 0);
  assert.equal(repairState().reproductionRequired, true);
});
