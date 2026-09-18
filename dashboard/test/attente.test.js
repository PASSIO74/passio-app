// ═══════════════════════════════════════════════════════════════════════════
// CE QUI T'ATTEND — verrous de l'agrégateur pur `attenteSnapshot`.
//
// Défaut mesuré (2026-09-18) : aucune vue ne consolidait les gestes humains ;
// l'Accueil disait « Tout fonctionne bien » pendant qu'un correctif vérifié
// attendait sa fusion, que la CLI était tombée et qu'une issue `humain` était
// ouverte sur GitHub.
//
// Mutations éprouvées (chacune rougit le test nommé) :
//   · compter un correctif déjà fusionné (audit ignoré)        → « fusionné n'attend plus »
//   · lister les alertes warn                                   → « alertes »
//   · incident high ouvert depuis 2 h compté                    → « incidents > 72 h »
//   · tri par priorité retiré                                   → « tri »
//   · CLI indisponible avec clé API comptée                      → « CLI »
//   · sourcesLues / état vide confondus                          → « vide honnête »
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { attenteSnapshot } from "../server/attente.js";

const H = 3_600_000;
const NOW = Date.parse("2026-09-18T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

test("vide honnête : sans aucune source, rien n'attend et les sources lues sont nommées", () => {
  const s = attenteSnapshot({}, NOW);
  assert.deepEqual(s.items, []);
  assert.equal(s.count, 0);
  assert.deepEqual(s.sourcesLues, []);
  assert.equal(s.machines7j.diagnostics, 0);
  assert.equal(s.machines7j.enquetesGithubFermees, null, "GitHub non lu : null, pas 0");
});

test("chaîne GitHub : issues et PR en attente deviennent des items avec priorité, lien et depuis ; chaîne morte et cron désactivé aussi", () => {
  const chaine = {
    attente: [
      { type: "humain", numero: 12, titre: "[SENTINELLE] x", depuis: iso(NOW - 3 * H), url: "https://github.com/x/12" },
      { type: "correctif_pr", numero: 40, titre: "fix", depuis: iso(NOW - 5 * H), url: "https://github.com/x/40", autoMerge: false },
      { type: "pr_ouverte", numero: 41, titre: "feat", depuis: iso(NOW - H), url: "https://github.com/x/41" },
    ],
    chaine: { etat: "morte", cause: "sentinelle autonome sans run depuis 30 h" },
    crons: { "disponibilite.yml": { label: "Disponibilité", etat: "desactive", texte: "workflow disabled_inactivity" } },
  };
  const s = attenteSnapshot({ chaine }, NOW);
  const cles = s.items.map((i) => i.key);
  assert.ok(cles.includes("gh:humain:12") && cles.includes("gh:correctif_pr:40") && cles.includes("gh:pr_ouverte:41"));
  assert.ok(cles.includes("gh:chaine:morte") && cles.includes("gh:cron:disponibilite.yml"));
  const pr = s.items.find((i) => i.key === "gh:correctif_pr:40");
  assert.equal(pr.priorite, "P1", "un correctif sans auto-merge attend un clic humain");
  assert.equal(pr.cible, "https://github.com/x/40");
  assert.match(pr.detail, /#40 — fix/);
  assert.equal(s.items.find((i) => i.key === "gh:pr_ouverte:41").priorite, "P3");
});

test("sentinelle locale : un correctif vérifié attend sa fusion ; fusionné (audit) n'attend plus ; un refus récent est un P3", () => {
  const diagnostics = [
    { id: "d1", ts: NOW - 2 * H, title: "A", repair: { ok: true, branch: "sentinelle/a" } },
    { id: "d2", ts: NOW - 2 * H, title: "B", repair: { ok: true, branch: "sentinelle/b" } },
    { id: "d3", ts: NOW - 2 * H, title: "C", repair: { attempted: true, ok: false, raison: "patch refusé" } },
    { id: "d4", ts: NOW - 10 * 24 * H, title: "D", repair: { attempted: true, ok: false, raison: "vieux" } },
    { id: "d5", ts: NOW - 2 * H, title: "E", repair: { ok: true, branch: "sentinelle/e", production: { published: true } } },
  ];
  const audit = [{ ts: NOW - H, action: "sentinel_repair_merged", details: { branch: "sentinelle/b" } }];
  const s = attenteSnapshot({ diagnostics, audit }, NOW);
  const cles = s.items.map((i) => i.key);
  assert.ok(cles.includes("sent:merge:d1"));
  assert.ok(!cles.includes("sent:merge:d2"), "fusionné n'attend plus");
  assert.ok(!cles.includes("sent:merge:d5"), "publié en PR n'attend plus le clic local");
  assert.equal(s.items.find((i) => i.key === "sent:refus:d3").priorite, "P3");
  assert.ok(!cles.includes("sent:refus:d4"), "un refus vieux de 10 jours n'est plus une attente");
  assert.equal(s.machines7j.correctifsFusionnes, 1);
});

test("incidents > 72 h high/critical seulement ; alertes high/critical non acquittées seulement", () => {
  const incidents = [
    { id: "i1", status: "open", severity: "high", lastSeenAt: iso(NOW - 80 * H), signal: { title: "Clic sans effet" } },
    { id: "i2", status: "open", severity: "high", lastSeenAt: iso(NOW - 2 * H), signal: { title: "récent" } },
    { id: "i3", status: "open", severity: "warn", lastSeenAt: iso(NOW - 200 * H), signal: { title: "warn" } },
    { id: "i4", status: "closed", severity: "critical", lastSeenAt: iso(NOW - 200 * H), signal: { title: "clos" } },
  ];
  const alerts = [
    { id: "a1", level: "critical", acknowledged: false, title: "crit", ts: NOW - H },
    { id: "a2", level: "high", acknowledged: true, title: "ack", ts: NOW - H },
    { id: "a3", level: "warn", acknowledged: false, title: "warn", ts: NOW - H },
  ];
  const s = attenteSnapshot({ incidents, alerts }, NOW);
  assert.deepEqual(s.items.map((i) => i.key), ["al:a1", "inc:i1"]);
  assert.equal(s.items[0].priorite, "P0");
});

test("le poste : disque bas, CLI tombée (sauf clé API), superviseur ≥ 3 relances, stockage en échec ; modération ouverte", () => {
  const src = {
    disk: { checked: true, low: true, freeGb: 2.5, thresholdGb: 10, since: NOW - H },
    cli: { checked: true, available: false, installed: true, reason: "logged_out", since: NOW - 2 * H },
    supervise: { supervised: true, restarts: 4 },
    storage: { available: false, failing: [{ name: "alerts" }] },
    exploitation: { moderation: { ouverts: 2, plusAncienOuvert: iso(NOW - 100 * H) }, verdicts: { moderation: { etat: "alert", texte: "2 signalement(s) en attente, le plus ancien depuis 100 h" } } },
  };
  const s = attenteSnapshot(src, NOW);
  const par = Object.fromEntries(s.items.map((i) => [i.key, i]));
  assert.equal(par["poste:disk"].priorite, "P1"); assert.match(par["poste:disk"].detail, /2\.5 Go/);
  assert.equal(par["poste:cli"].priorite, "P1"); assert.match(par["poste:cli"].titre, /Connecter-Claude/);
  assert.equal(par["poste:supervise"].priorite, "P2");
  assert.equal(par["poste:storage"].priorite, "P1");
  assert.equal(par["mod:ouverts"].priorite, "P1", "modération en alert = P1");
  const avecCle = attenteSnapshot({ cli: src.cli, apiKey: true }, NOW);
  assert.ok(!avecCle.items.some((i) => i.key === "poste:cli"), "avec une clé API, la sentinelle analyse encore : la CLI n'est pas un blocage");
  const quota = attenteSnapshot({ cli: { ...src.cli, reason: "quota" } }, NOW);
  assert.equal(quota.items[0].priorite, "P2", "une limite d'usage se lève seule : P2");
});

test("tri : P0 avant P1 avant P2 avant P3, et à priorité égale le plus ancien d'abord", () => {
  const alerts = [
    { id: "b", level: "high", acknowledged: false, title: "b", ts: NOW - H },
    { id: "a", level: "high", acknowledged: false, title: "a", ts: NOW - 5 * H },
    { id: "c", level: "critical", acknowledged: false, title: "c", ts: NOW },
  ];
  const s = attenteSnapshot({ alerts, disk: { checked: true, low: true, freeGb: 1, thresholdGb: 10, since: NOW - 50 * H }, supervise: { supervised: true, restarts: 3 } }, NOW);
  assert.deepEqual(s.items.map((i) => i.key), ["al:c", "poste:disk", "al:a", "al:b", "poste:supervise"]);
  assert.deepEqual(s.parPriorite, { P0: 1, P1: 3, P2: 1 });
});

test("machines 7 j : comptages depuis l'audit (fenêtre 7 j) et depuis la chaîne", () => {
  const audit = [
    { ts: NOW - H, action: "sentinel_diagnose", details: { ok: true } },
    { ts: NOW - 2 * H, action: "sentinel_diagnose", details: { ok: false } },
    { ts: NOW - 10 * 24 * H, action: "sentinel_diagnose", details: { ok: true } },
    { ts: NOW - H, action: "sentinel_repair_ready", details: {} },
    { ts: NOW - H, action: "run_tests_auto", details: {} },
  ];
  const chaine = { fermees7j: [{ numero: 1 }, { numero: 2 }], runs: { "sauvegarde.yml": { dernierSucces: { quand: iso(NOW - 20 * H) } }, "veille-production.yml": { dernierSucces: { quand: iso(NOW - 10 * 24 * H) } } }, chaine: { etat: "vit" }, attente: [], crons: {} };
  const s = attenteSnapshot({ audit, chaine }, NOW);
  assert.equal(s.machines7j.diagnostics, 2); assert.equal(s.machines7j.diagnosticsOk, 1);
  assert.equal(s.machines7j.correctifsVerifies, 1); assert.equal(s.machines7j.testsAuto, 1);
  assert.equal(s.machines7j.enquetesGithubFermees, 2);
  assert.equal(s.machines7j.sauvegardeOk, 1); assert.equal(s.machines7j.veilleOk, 0);
  assert.equal(s.machines7j.chaine, "vit");
});
