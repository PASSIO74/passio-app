// Verrous de `verdictVeille` et de ses signaux (scripts/veille-production.mjs) —
// fonctions PURES : aucun réseau, aucun secret. Les fixtures reprennent les
// mesures réelles de production du 2026-09-11 → 09-18 (carte mesures-prod) :
// moyenne horaire Paris, silence du 09-17 10h→18h, 5 comptes créés en 14 j.
// Chaque verrou nomme la MUTATION qui le fait rougir (éprouvée à la main).
import test from "node:test";
import assert from "node:assert/strict";
import {
  verdictVeille, signalFlux, signalInscriptions, signalErreurs, signalApi, signalDeploiement,
  signalCrons, signalBase, signalJetons, heureParis, mediane, estSelectSeul, SQL,
  SILENCE_WARN_H, SILENCE_WARN_WEEKEND_H, SILENCE_ALERT_H, SEUILS_CRONS,
} from "../../scripts/veille-production.mjs";

const H = 3600_000;
// Moyenne lignes/heure Paris mesurée sur 7 j (F10) : la forme réelle du trafic.
const PROFIL = { 0: 0, 1: 0, 2: 11, 3: 0, 4: 0, 5: 0, 6: 45, 7: 116, 8: 21, 9: 151, 10: 207, 11: 208, 12: 594,
  13: 362, 14: 208, 15: 131, 16: 106, 17: 184, 18: 50, 19: 319, 20: 99, 21: 76, 22: 11, 23: 15 };

/**
 * Histogramme horaire sur 9 jours autour de `now`, selon le profil mesuré, avec
 * des trous imposés : `vides` = liste de clés Paris "AAAA-MM-JJTHH" mises à 0.
 */
function histogramme(now, { vides = [], profil = PROFIL, jours = 9 } = {}) {
  const heures = [];
  for (let t = now - jours * 24 * H; t <= now; t += H) {
    const p = heureParis(t);
    heures.push({ h: p.cle, n: vides.includes(p.cle) ? 0 : profil[p.heure] });
  }
  return heures;
}
const clesEntre = (date, de, a) => Array.from({ length: a - de + 1 }, (_, i) => `${date}T${String(de + i).padStart(2, "0")}`);

// Jeudi 2026-09-17, 18:00 Paris (16:00 UTC) : la fin du silence réel 10h→18h.
const JEUDI_18H = Date.parse("2026-09-17T16:00:00Z");
// Samedi 2026-09-19, 15:00 Paris.
const SAMEDI_15H = Date.parse("2026-09-19T13:00:00Z");

test("heureParis : minuit Paris est l'heure 0 du jour suivant, le samedi est 6", () => {
  // Mutation : `JOURS[p.weekday]` remplacé par `new Date(ms).getUTCDay()` → 22:30 UTC donne vendredi (5) → rougit.
  const p = heureParis(Date.parse("2026-09-18T22:30:00Z"));
  assert.equal(p.heure, 0);
  assert.equal(p.date, "2026-09-19");
  assert.equal(p.jour, 6);
  assert.equal(p.cle, "2026-09-19T00");
  assert.equal(heureParis(JEUDI_18H).heure, 18);
  assert.equal(heureParis(JEUDI_18H).jour, 4);
});

test("mediane : impaire, paire, vide", () => {
  // Mutation : rendre v[m] pour une liste paire → 3 au lieu de 2,5 → rougit.
  assert.equal(mediane([3, 1, 2]), 2);
  assert.equal(mediane([4, 1, 2, 3]), 2.5);
  assert.equal(mediane([]), 0);
});

test("flux : le silence réel du 09-17 (10h→18h, 8 h actives) est une ALERTE à 18 h", () => {
  // Mutation : `vides++` retiré, ou SILENCE_ALERT_H porté à 9 → rougit.
  const heures = histogramme(JEUDI_18H, { vides: clesEntre("2026-09-17", 10, 17) });
  const s = signalFlux({ heures, canaris2h: 8 }, JEUDI_18H);
  assert.equal(s.etat, "alert");
  assert.match(s.texte, new RegExp(`${SILENCE_ALERT_H} h actives consécutives`));
  assert.ok(s.geste, "un signal en alerte porte un geste");
});

test("flux : 4 h vides un jour ouvré = ATTENTION ; 4 h vides un samedi = rien (seuil 6 h le week-end)", () => {
  // Mutation : utiliser SILENCE_WARN_H le week-end aussi → le samedi passe warn → rougit.
  const jeudi = signalFlux({ heures: histogramme(JEUDI_18H, { vides: clesEntre("2026-09-17", 14, 17) }), canaris2h: 8 }, JEUDI_18H);
  assert.equal(jeudi.etat, "warn");
  assert.match(jeudi.texte, new RegExp(`${SILENCE_WARN_H} h actives consécutives`));
  const samedi = signalFlux({ heures: histogramme(SAMEDI_15H, { vides: clesEntre("2026-09-19", 11, 14) }), canaris2h: 8 }, SAMEDI_15H);
  assert.equal(samedi.etat, "ok");
  const samedi6 = signalFlux({ heures: histogramme(SAMEDI_15H, { vides: clesEntre("2026-09-19", 9, 14) }), canaris2h: 8 }, SAMEDI_15H);
  assert.equal(samedi6.etat, "warn");
  assert.match(samedi6.texte, new RegExp(`${SILENCE_WARN_WEEKEND_H} h actives`));
});

test("flux : un silence d'hier soir ne s'ajoute pas à ce matin (la nuit coupe la série)", () => {
  // Mutation : retirer `if (!estActive(q.heure)) break;` → la série traverse la nuit, 26 h vides = alert → rougit.
  const now = Date.parse("2026-09-17T09:00:00Z"); // 11:00 Paris, jeudi
  const vides = [...clesEntre("2026-09-16", 9, 23), ...clesEntre("2026-09-17", 0, 10)];
  const s = signalFlux({ heures: histogramme(now, { vides }), canaris2h: 8 }, now);
  assert.equal(s.etat, "ok");
});

test("flux : jamais évalué la nuit (03 h Paris), même avec des heures vides ; mais 0 canari = ALERTE à toute heure", () => {
  // Mutation : retirer la garde `p.heure < HEURE_DEBUT` → la nuit vide devient un silence → rougit.
  const nuit = Date.parse("2026-09-17T01:00:00Z"); // 03:00 Paris
  const s = signalFlux({ heures: [], canaris2h: 8 }, nuit);
  assert.equal(s.etat, "ok");
  assert.match(s.texte, /non évalué/);
  const c = signalFlux({ heures: [], canaris2h: 0 }, nuit);
  assert.equal(c.etat, "alert");
  assert.match(c.texte, /chaîne d'ingestion/);
});

test("flux : à 21 h un jour ouvré, une journée < 100 lignes face à une médiane > 500 est une ALERTE", () => {
  // Mutation : `aujourdhui < JOURNEE_MIN_LIGNES` inversé, ou la garde médiane retirée → rougit.
  const now = Date.parse("2026-09-17T19:00:00Z"); // 21:00 Paris jeudi
  const jourVide = clesEntre("2026-09-17", 0, 21);
  const profilFaible = Object.fromEntries(Object.keys(PROFIL).map((h) => [h, 1])); // 24 lignes/jour
  const heures = histogramme(now, { vides: [] }).map((x) => (jourVide.includes(x.h) ? { h: x.h, n: x.n > 0 ? 3 : 0 } : x)); // ≈ 60 lignes
  const s = signalFlux({ heures, canaris2h: 8 }, now);
  assert.equal(s.etat, "alert");
  assert.match(s.texte, /journée ouvrée quasi vide/);
  // Même journée faible, mais les jours précédents l'étaient aussi (médiane < 500) : pas d'alerte.
  const calme = signalFlux({ heures: histogramme(now, { profil: profilFaible }), canaris2h: 8 }, now);
  assert.notEqual(calme.etat, "alert");
});

test("inscriptions : 3 créés en 24 h et 0 confirmé = ALERTE ; 1 sur 4 en 7 j = ATTENTION ; 2 créés sans confirmation = rien (plancher absolu)", () => {
  // Mutation : `n("crees24h") >= 3` → `>= 1` : le cas « 2 créés » passe alert → rougit.
  const alerte = signalInscriptions({ crees24h: 3, confirmes24h: 0, crees7j: 5, confirmes7j: 2, nonConfirmesAnciens: 0 });
  assert.equal(alerte.etat, "alert");
  assert.match(alerte.geste, /Brevo/);
  const warn = signalInscriptions({ crees24h: 0, confirmes24h: 0, crees7j: 4, confirmes7j: 1, nonConfirmesAnciens: 3 });
  assert.equal(warn.etat, "warn");
  assert.match(warn.texte, /3 compte\(s\) créé\(s\) depuis plus de 24 h jamais confirmé/);
  const rien = signalInscriptions({ crees24h: 2, confirmes24h: 0, crees7j: 2, confirmes7j: 0, nonConfirmesAnciens: 0 });
  assert.equal(rien.etat, "ok");
  // Le cas réel du 09-16 (1 confirmé sur 2 créés) ne crie pas.
  assert.equal(signalInscriptions({ crees24h: 2, confirmes24h: 1, crees7j: 2, confirmes7j: 1, nonConfirmesAnciens: 1 }).etat, "ok");
});

test("erreurs : 12 erreurs sur 3 appareils face à une médiane 0 = ATTENTION ; 12 sur 1 appareil = rien", () => {
  // Mutation : `app >= 2` retiré → le poste de test seul déclenche → rougit.
  const heures = [{ h: "2026-09-13T07", n: 2, appareils: 1 }, { h: "2026-09-15T09", n: 1, appareils: 1 }, { h: "2026-09-16T15", n: 1, appareils: 1 }];
  assert.equal(signalErreurs({ heures, derniereHeure: 12, appareils: 3 }).etat, "warn");
  assert.equal(signalErreurs({ heures, derniereHeure: 12, appareils: 1 }).etat, "ok");
  assert.equal(signalErreurs({ heures, derniereHeure: 9, appareils: 3 }).etat, "ok");
});

test("api : 5 × 5xx sur 2 appareils = ALERTE ; 25 refus 401/403 sur 3 appareils = ATTENTION, sur 2 = rien", () => {
  // Mutation : `n("appRefus") >= 3` → `>= 2` → le cas « sur 2 » passe warn → rougit.
  assert.equal(signalApi({ n5xx: 5, app5xx: 2, nRefus: 0, appRefus: 0 }).etat, "alert");
  assert.equal(signalApi({ n5xx: 5, app5xx: 1, nRefus: 0, appRefus: 0 }).etat, "ok");
  assert.equal(signalApi({ n5xx: 0, app5xx: 0, nRefus: 25, appRefus: 3 }).etat, "warn");
  assert.equal(signalApi({ n5xx: 0, app5xx: 0, nRefus: 25, appRefus: 2 }).etat, "ok");
  // Le réel de 7 j (50 × 401 étalés) ne dépasse jamais 20 en une heure.
  assert.equal(signalApi({ n5xx: 0, app5xx: 0, nRefus: 7, appRefus: 4 }).etat, "ok");
});

test("deploiement : run main rouge = ALERTE avec le lien ; main en avance > 90 min sans run = bloqué ; 30 min = normal ; en cours = ok", () => {
  // Mutation : `ageMin > DEPLOIEMENT_RETARD_MIN` → `>=` avec 90 exact, ou la branche `enCours` retirée → rougit.
  const now = Date.parse("2026-09-17T12:00:00Z");
  const sha = "3b9462451234567890abcdef1234567890abcdef";
  const ancien = "c2f306891234567890abcdef1234567890abcdef";
  const rouge = signalDeploiement({ commitServi: ancien, mainHead: sha, mainHeadDate: new Date(now - 20 * 60_000).toISOString(),
    dernierRun: { status: "completed", conclusion: "failure", head_sha: sha, updated_at: "", html_url: "https://github.com/x/y/actions/runs/1" }, enCours: false }, now);
  assert.equal(rouge.etat, "alert");
  assert.match(rouge.texte, /actions\/runs\/1/);
  const bloque = signalDeploiement({ commitServi: ancien, mainHead: sha, mainHeadDate: new Date(now - 120 * 60_000).toISOString(),
    dernierRun: { status: "completed", conclusion: "success", head_sha: ancien }, enCours: false }, now);
  assert.equal(bloque.etat, "alert");
  assert.match(bloque.texte, /déploiement bloqué/);
  const normal = signalDeploiement({ commitServi: ancien, mainHead: sha, mainHeadDate: new Date(now - 30 * 60_000).toISOString(),
    dernierRun: { status: "completed", conclusion: "success", head_sha: ancien }, enCours: false }, now);
  assert.equal(normal.etat, "ok");
  const enCours = signalDeploiement({ commitServi: ancien, mainHead: sha, mainHeadDate: new Date(now - 200 * 60_000).toISOString(),
    dernierRun: { status: "completed", conclusion: "success", head_sha: ancien }, enCours: true }, now);
  assert.equal(enCours.etat, "ok");
  assert.equal(signalDeploiement({ commitServi: sha, mainHead: sha, mainHeadDate: null, dernierRun: null, enCours: false }, now).etat, "ok");
  assert.equal(signalDeploiement({ commitServi: null, mainHead: sha, mainHeadDate: null, dernierRun: null, enCours: false }, now).etat, "unknown");
});

test("crons : les seuils tolèrent la desserte réelle (sentinelle 5-7 h) ; 30 h = ALERTE ; désactivé = ALERTE ; sauvegarde à 40 h = ATTENTION", () => {
  // Mutation : `/^disabled/` → `/^enabled/` → le workflow désactivé passe ok → rougit.
  const now = Date.parse("2026-09-18T12:00:00Z");
  const il_y_a = (h) => new Date(now - h * H).toISOString();
  const sain = {
    "sentinelle-autonome": { state: "active", dernierRunFin: il_y_a(7) },
    "sentinelle-distante": { state: "active", dernierRunFin: il_y_a(5) },
    "disponibilite": { state: "active", dernierRunFin: il_y_a(5.5) },
    "sauvegarde": { state: "active", dernierRunFin: il_y_a(29) },
    "moderation-alerte": { state: "active", dernierRunFin: il_y_a(30) },
  };
  assert.equal(signalCrons(sain, now).etat, "ok");
  assert.equal(signalCrons({ ...sain, "sentinelle-autonome": { state: "active", dernierRunFin: il_y_a(30) } }, now).etat, "alert");
  assert.equal(signalCrons({ ...sain, "sentinelle-autonome": { state: "active", dernierRunFin: il_y_a(10) } }, now).etat, "warn");
  const desactive = signalCrons({ ...sain, "sauvegarde": { state: "disabled_inactivity", dernierRunFin: il_y_a(2) } }, now);
  assert.equal(desactive.etat, "alert");
  assert.match(desactive.texte, /DÉSACTIVÉ/);
  assert.match(desactive.geste, /Enable workflow/);
  assert.equal(signalCrons({ ...sain, "sauvegarde": { state: "active", dernierRunFin: il_y_a(40) } }, now).etat, "warn");
  assert.equal(Object.keys(SEUILS_CRONS).length, 5);
  // Un cron non mesuré ne passe pas pour sain.
  const partiel = { ...sain }; delete partiel.disponibilite;
  assert.equal(signalCrons(partiel, now).etat, "unknown");
});

test("base : anon ≠ 200 = ALERTE ; 6,5 Go = ATTENTION ; 7,8 Go = ALERTE ; purge absente = ATTENTION", () => {
  // Mutation : `go > BASE_ALERT_GO` → `go > 8` → 7,8 Go passe warn → rougit.
  const Go = 1024 ** 3;
  assert.equal(signalBase({ anonStatus: 200, octets: 1.2 * Go, purgePlanifiee: true }).etat, "ok");
  assert.equal(signalBase({ anonStatus: 401, octets: 1.2 * Go, purgePlanifiee: true }).etat, "alert");
  assert.equal(signalBase({ anonStatus: 200, octets: 6.5 * Go, purgePlanifiee: true }).etat, "warn");
  assert.equal(signalBase({ anonStatus: 200, octets: 7.8 * Go, purgePlanifiee: true }).etat, "alert");
  const purge = signalBase({ anonStatus: 200, octets: 1 * Go, purgePlanifiee: false });
  assert.equal(purge.etat, "warn");
  assert.match(purge.texte, /aucune purge/);
});

test("jetons : 401 GitHub = ALERTE ; 10 j = ATTENTION ; 2 j = ALERTE ; Netlify 401 = ALERTE", () => {
  // Mutation : `j < JETON_ALERT_J` → `j < 0` → 2 j passe warn → rougit.
  const ok = { github: { statut: 200, joursRestants: 70 }, supabase: { statut: 200 }, netlify: { statut: 200 } };
  assert.equal(signalJetons(ok).etat, "ok");
  assert.equal(signalJetons({ ...ok, github: { statut: 401, joursRestants: null } }).etat, "alert");
  assert.equal(signalJetons({ ...ok, github: { statut: 200, joursRestants: 10 } }).etat, "warn");
  const bientot = signalJetons({ ...ok, github: { statut: 200, joursRestants: 2 } });
  assert.equal(bientot.etat, "alert");
  assert.match(bientot.geste, /settings\/tokens/);
  assert.equal(signalJetons({ ...ok, netlify: { statut: 401 } }).etat, "alert");
  assert.equal(signalJetons({ ...ok, supabase: { statut: 401 } }).etat, "alert");
});

test("verdictVeille : des ATTENTION seules n'ouvrent pas d'issue ; une ALERTE donne titre, gestes et tous les signaux", () => {
  // Mutation : `alerte = enAlerte.length > 0` → `signaux.some(warn|alert)` → le cas warn ouvre une issue → rougit.
  const now = Date.parse("2026-09-18T12:00:00Z");
  const base = {
    flux: { heures: histogramme(now), canaris2h: 8 },
    inscriptions: { crees24h: 0, confirmes24h: 0, crees7j: 2, confirmes7j: 2, nonConfirmesAnciens: 0 },
    erreurs: { heures: [], derniereHeure: 0, appareils: 0 },
    api: { n5xx: 0, app5xx: 0, nRefus: 0, appRefus: 0 },
    deploiement: { commitServi: "a", mainHead: "a", mainHeadDate: null, dernierRun: null, enCours: false },
    crons: Object.fromEntries(Object.keys(SEUILS_CRONS).map((k) => [k, { state: "active", dernierRunFin: new Date(now - H).toISOString() }])),
    base: { anonStatus: 200, octets: 1024 ** 3, purgePlanifiee: true },
    jetons: { github: { statut: 200, joursRestants: 70 }, supabase: { statut: 200 }, netlify: { statut: 200 } },
  };
  const vert = verdictVeille(base, now);
  assert.equal(vert.alerte, false);
  assert.equal(vert.titre, "");
  assert.equal(vert.corps, "");
  assert.ok(vert.signaux.every((s) => s.etat === "ok"), vert.resume);

  const warn = verdictVeille({ ...base, jetons: { ...base.jetons, github: { statut: 200, joursRestants: 10 } } }, now);
  assert.equal(warn.alerte, false);
  assert.match(warn.resume, /\[ATTENTION\] jetons/);

  const rouge = verdictVeille({ ...base, base: { anonStatus: 503, octets: 1024 ** 3, purgePlanifiee: true },
    jetons: { ...base.jetons, netlify: { statut: 401 } } }, now);
  assert.equal(rouge.alerte, true);
  assert.equal(rouge.titre, "[VEILLE] 2 alerte(s) : base, jetons");
  assert.match(rouge.corps, /## Ce que tu fais/);
  assert.match(rouge.corps, /status\.supabase\.com/);
  assert.match(rouge.corps, /NETLIFY_AUTH_TOKEN/);
  assert.match(rouge.corps, /\[ok\] \*\*flux\*\*/);
  assert.equal(rouge.signaux.length, 8);
});

test("verdictVeille : une mesure en échec rend `unknown` avec sa raison (bornée), jamais « ok »", () => {
  // Mutation : `inconnu()` rend null sur `erreur` → le signal passe ok → rougit.
  const v = verdictVeille({ flux: { erreur: "HTTP 401 sur api.supabase.com/database/query " + "x".repeat(300) } }, Date.parse("2026-09-18T12:00:00Z"));
  const flux = v.signaux.find((s) => s.cle === "flux");
  assert.equal(flux.etat, "unknown");
  assert.match(flux.texte, /lecture en échec \(HTTP 401/);
  assert.ok(flux.texte.length < 200);
  assert.equal(v.alerte, false);
});

test("estSelectSeul : SELECT et WITH … SELECT passent ; DML, DDL et enchaînement par `;` sont refusés — et toutes les requêtes du script passent", () => {
  // Mutation : retirer `s.includes(";")` → « select 1; drop table x » passe → rougit.
  assert.equal(estSelectSeul("select count(*) from telemetry_events"), true);
  assert.equal(estSelectSeul("with x as (select 1) select * from x;"), true);
  assert.equal(estSelectSeul("select 1; drop table telemetry_events"), false);
  assert.equal(estSelectSeul("select 1; select pg_sleep(10)"), false); // deux ordres, même inoffensifs
  assert.equal(estSelectSeul("delete from telemetry_events"), false);
  assert.equal(estSelectSeul("select purge_telemetry(7) -- ok\n; create table t()"), false);
  assert.equal(estSelectSeul("SELECT 1 FROM t WHERE x = 'update'"), false); // conservateur : le mot suffit à refuser
  assert.equal(estSelectSeul(""), false);
  for (const [k, q] of Object.entries(SQL)) assert.equal(estSelectSeul(q), true, `SQL.${k}`);
  // Aucune requête ne sélectionne une colonne nominative.
  for (const [k, q] of Object.entries(SQL)) assert.doesNotMatch(q, /select\s+email\b|,\s*email\b\s*(,|from)|\bas\s+email\b/i, `SQL.${k} ne doit pas rendre d'e-mail`);
});
