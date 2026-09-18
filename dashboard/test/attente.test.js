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
//   · recopier `it.depuis` sans `enMs` (ISO gardé tel quel)       → « depuis en millisecondes »
//   · `disponibilite: "P0"` → "P3" dans PRIORITE_CHAINE           → « site en panne = P0 »
//   · JETON_P0_MAX_J = 2 (seuil du P0)                           → « jeton : seuil »
//   · JETON_P1_MAX_J = 5 (seuil du P1)                           → « jeton : seuil »
//   · P0 → P1 pour ≤ 1 j (niveau)                                → « jeton : niveau »
//   · clé `jeton:sentinelle` renommée                            → « jeton : clé »
//   · « expire aujourd'hui » remplacé par « expire dans 0 j »    → « jeton : aujourd'hui »
//   · VEILLE_MUETTE_MIN = 240 (seuil des 6 h)                     → « veille muette »
//   · clé `tableau:veille:age` renommée, ou P2 → P1               → « veille muette »
//   · jours du jeton non corrigés de l'âge du tableau (ageJ = 0)  → « jeton : âge du tableau »
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

test("depuis en millisecondes : un item GitHub (ISO) et une alerte (nombre) portent le même type, et le tri les compare", () => {
  // D1-C3 : app.js fait `Date.now() - depuis` → « depuis NaNj » pour tout item GitHub.
  const chaine = { attente: [{ type: "humain", numero: 12, titre: "x", depuis: iso(NOW - 3 * H), url: "u" }], chaine: { etat: "vit" }, crons: {} };
  const alerts = [{ id: "a1", level: "high", acknowledged: false, title: "a", ts: NOW - H }];
  const s = attenteSnapshot({ chaine, alerts }, NOW);
  const gh = s.items.find((i) => i.key === "gh:humain:12");
  assert.equal(typeof gh.depuis, "number");
  assert.equal(gh.depuis, NOW - 3 * H);
  assert.equal(typeof s.items.find((i) => i.key === "al:a1").depuis, "number");
  assert.deepEqual(s.items.map((i) => i.key), ["gh:humain:12", "al:a1"], "même priorité P1 : le plus ancien (GitHub, 3 h) d'abord");
  const sansDate = attenteSnapshot({ chaine: { attente: [{ type: "humain", numero: 1, titre: "x", depuis: "pas une date", url: "u" }], chaine: { etat: "vit" }, crons: {} } }, NOW);
  assert.equal(sansDate.items[0].depuis, null, "une date illisible devient null, jamais NaN");
});

test("site en panne = P0 : une issue disponibilite passe devant tout le reste", () => {
  const chaine = { attente: [
    { type: "humain", numero: 1, titre: "h", depuis: iso(NOW - 50 * H), url: "u1" },
    { type: "disponibilite", numero: 2, titre: "[DISPONIBILITÉ] site en panne", depuis: iso(NOW - H), url: "u2" },
  ], chaine: { etat: "vit" }, crons: {} };
  const s = attenteSnapshot({ chaine, alerts: [{ id: "a", level: "high", acknowledged: false, title: "a", ts: NOW - 80 * H }] }, NOW);
  assert.equal(s.items[0].key, "gh:disponibilite:2");
  assert.equal(s.items[0].priorite, "P0");
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

// ─── Lot F : les comptes rendus (jeton de la chaîne, veille muette) ─────────
const GESTE_JETON = "github.com/settings/tokens → régénérer le jeton, puis Settings > Secrets and variables > Actions > SENTINELLE_TOKEN ; sans lui la chaîne de réparation s'arrête";
const veilleAvec = (jours, ageH = 1) => ({ veille: { majLe: iso(NOW - ageH * H), ageMin: ageH * 60, etat: "ok", lignes: [], jetons: { SENTINELLE_TOKEN: jours, SUPABASE_ACCESS_TOKEN: "ok", NETLIFY_AUTH_TOKEN: "ok" } }, digest: null, sentinelle: { ouvertes: [], fermees7j: [] } });
const jeton = (jours) => attenteSnapshot({ comptesRendus: veilleAvec(jours) }, NOW).items.find((i) => i.key === "jeton:sentinelle") || null;

test("jeton : seuil — 21 j → rien, 4 j → rien, 3 j → P1, 2 j → P1, 1 j → P0, 0 j → P0 ; null (sans date) → rien", () => {
  assert.equal(jeton(21), null, "à 21 j la veille porte déjà son [ATTENTION] sous 14 j : rien ici");
  assert.equal(jeton(4), null);
  assert.equal(jeton(3).priorite, "P1");
  assert.equal(jeton(2).priorite, "P1");
  assert.equal(jeton(1).priorite, "P0", "un jour avant : le rappel demandé");
  assert.equal(jeton(0).priorite, "P0");
  assert.equal(jeton(null), null, "sans date d'expiration lisible : rien à rappeler");
  assert.equal(attenteSnapshot({ comptesRendus: { veille: null, digest: null } }, NOW).items.length, 0, "sans tableau de veille : rien");
  assert.equal(attenteSnapshot({ comptesRendus: { veille: { majLe: iso(NOW - H), jetons: null } } }, NOW).items.length, 0, "jetons absents : rien");
});

test("jeton : niveau, clé, aujourd'hui — titre, detail (le geste exact), cible #exploitation et depuis = la mesure", () => {
  const un = jeton(1);
  assert.equal(un.key, "jeton:sentinelle");
  assert.equal(un.priorite, "P0");
  assert.equal(un.titre, "Renouveler SENTINELLE_TOKEN — expire dans 1 j");
  assert.equal(un.detail, GESTE_JETON);
  assert.equal(un.cible, "#exploitation");
  assert.equal(un.depuis, NOW - H, "depuis = la date du tableau (millisecondes)");
  assert.equal(jeton(0).titre, "Renouveler SENTINELLE_TOKEN — expire aujourd'hui", "aujourd'hui");
  assert.equal(jeton(3).titre, "Renouveler SENTINELLE_TOKEN — expire dans 3 j");
  // P0 passe devant une alerte high non acquittée (P1) : c'est bien un P0.
  const s = attenteSnapshot({ comptesRendus: veilleAvec(1), alerts: [{ id: "a", level: "high", acknowledged: false, title: "a", ts: NOW - 50 * H }] }, NOW);
  assert.equal(s.items[0].key, "jeton:sentinelle");
  assert.ok(s.sourcesLues.includes("comptesRendus"));
});

test("jeton : âge du tableau — « 3 j » lu sur un tableau de 2 j → P0 « expire dans 1 j » ; « 1 j » sur 47 h → « aujourd'hui » ; « 21 j » sur 2 j → rien ; sous 24 h, rien ne change", () => {
  // Le cron est servi 4 à 23× moins souvent qu'annoncé : un tableau en retard ne doit pas repousser le rappel.
  const lu = (jours, ageH) => attenteSnapshot({ comptesRendus: veilleAvec(jours, ageH) }, NOW).items.find((i) => i.key === "jeton:sentinelle") || null;
  assert.equal(lu(3, 48).priorite, "P0", "3 j lus il y a 2 j = 1 j réel");
  assert.equal(lu(3, 48).titre, "Renouveler SENTINELLE_TOKEN — expire dans 1 j");
  assert.equal(lu(1, 47).titre, "Renouveler SENTINELLE_TOKEN — expire aujourd'hui", "1 j lu il y a 47 h : le jeton expire aujourd'hui");
  assert.equal(lu(0, 72).titre, "Renouveler SENTINELLE_TOKEN — expire aujourd'hui", "jamais négatif");
  assert.equal(lu(21, 48), null, "19 j réels : rien");
  assert.equal(lu(4, 30).priorite, "P1", "4 j lus il y a 30 h = 3 j réels → P1");
  assert.equal(lu(3, 23).priorite, "P1", "sous 24 h, aucun jour retranché");
  assert.equal(lu(3, 23).titre, "Renouveler SENTINELLE_TOKEN — expire dans 3 j");
});

// Mutation : retirer `&& src.comptesRendus.perime !== true` → rougit (un cache périmé accuserait le cron).
test("veille muette : un tableau âgé de 7 h servi depuis un cache GitHub PÉRIMÉ ne pose pas l'item (la panne de lecture est portée ailleurs)", () => {
  const cr = veilleAvec(21, 7); cr.perime = true;
  assert.equal(attenteSnapshot({ comptesRendus: cr }, NOW).items.find((i) => i.key === "tableau:veille:age"), undefined);
  cr.perime = false;
  assert.ok(attenteSnapshot({ comptesRendus: cr }, NOW).items.find((i) => i.key === "tableau:veille:age"), "lecture fraîche : l'item revient");
});

test("veille muette : tableau de veille âgé de 7 h → P2 `tableau:veille:age` ; 5 h → rien ; 6 h pile → rien ; l'âge se recalcule depuis majLe", () => {
  const sept = attenteSnapshot({ comptesRendus: veilleAvec(21, 7) }, NOW).items.find((i) => i.key === "tableau:veille:age");
  assert.ok(sept, "7 h : la veille ne s'est pas exprimée");
  assert.equal(sept.priorite, "P2");
  assert.equal(sept.titre, "La veille ne s'est pas exprimée depuis 7 h");
  assert.equal(sept.detail, "cron servi 4 à 23× moins souvent qu'annoncé ; au-delà de 6 h, ouvrir Actions › Veille de production");
  assert.equal(sept.cible, "#exploitation");
  assert.equal(sept.depuis, NOW - 7 * H);
  assert.equal(attenteSnapshot({ comptesRendus: veilleAvec(21, 5) }, NOW).items.length, 0, "5 h : rien");
  assert.equal(attenteSnapshot({ comptesRendus: veilleAvec(21, 6) }, NOW).items.length, 0, "6 h pile : pas encore");
  // Le mémo de comptesRendus a 5 min : l'âge vient de majLe et de `now`, pas d'un ageMin figé.
  const perime = attenteSnapshot({ comptesRendus: veilleAvec(21, 7) }, NOW + 2 * H).items.find((i) => i.key === "tableau:veille:age");
  assert.equal(perime.titre, "La veille ne s'est pas exprimée depuis 9 h");
  const sansMajLe = attenteSnapshot({ comptesRendus: { veille: { majLe: null, ageMin: 500, jetons: {} } } }, NOW).items.find((i) => i.key === "tableau:veille:age");
  assert.ok(sansMajLe, "sans majLe lisible, ageMin fait foi");
  assert.equal(attenteSnapshot({ comptesRendus: { veille: { majLe: null, ageMin: null, jetons: {} } } }, NOW).items.length, 0, "âge inconnu : on n'accuse pas");
});
