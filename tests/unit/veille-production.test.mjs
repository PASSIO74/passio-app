// Verrous de `verdictVeille` et de ses signaux (scripts/veille-production.mjs) —
// fonctions PURES : aucun réseau, aucun secret. Les fixtures reprennent les
// mesures réelles de production du 2026-09-11 → 09-18 (carte mesures-prod) :
// moyenne horaire Paris, silence du 09-17 10h→18h, 5 comptes créés en 14 j.
// Chaque verrou nomme la MUTATION qui le fait rougir (éprouvée à la main).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  verdictVeille, signalFlux, signalInscriptions, signalErreurs, signalApi, signalDeploiement,
  signalCrons, signalBase, signalJetons, heureParis, mediane, estSelectSeul, tousInconnus, SQL,
  signalPurgeCourte, PURGE_COURTE_MAX_S,
  SILENCE_WARN_H, SILENCE_WARN_WEEKEND_H, SILENCE_ALERT_H, SEUILS_CRONS, runPlusRecent, echecsPlanifies,
  signalScan, SCAN,
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

test("flux : les heures de nuit ne comptent jamais comme silence (03 h Paris, nuit vide, veille pleine = ok) ; mais 0 canari = ALERTE à toute heure", () => {
  // Mutation : retirer `if (!estActive(q.heure)) break;` → les 6 h de nuit vides (21h→02h) comptent → warn → rougit.
  const nuit = Date.parse("2026-09-17T01:00:00Z"); // 03:00 Paris, jeudi
  const vides = [...clesEntre("2026-09-16", 21, 23), ...clesEntre("2026-09-17", 0, 2)];
  const s = signalFlux({ heures: histogramme(nuit, { vides }), canaris2h: 8 }, nuit);
  assert.equal(s.etat, "ok");
  assert.match(s.texte, /trafic courant non évalué/);
  const c = signalFlux({ heures: histogramme(nuit, { vides }), canaris2h: 0 }, nuit);
  assert.equal(c.etat, "alert");
  assert.match(c.texte, /chaîne d'ingestion/);
});

test("flux : un silence de 8 h qui ferme la journée (13h→20h) reste une ALERTE à 21 h 10, 22 h 30 et 07 h le lendemain (l'issue tient jusqu'au premier passage actif)", () => {
  // Mutation : rétablir la garde de nuit `if (p.heure < HEURE_DEBUT || p.heure > HEURE_FIN) return { etat, … }` → 22h30 rend ok → rougit.
  const lendemain7h = Date.parse("2026-09-18T05:00:00Z"); // 07:00 Paris vendredi
  const heures = histogramme(lendemain7h, { vides: clesEntre("2026-09-17", 13, 20) });
  for (const [quand, iso] of [["21h10", "2026-09-17T19:10:00Z"], ["22h30", "2026-09-17T20:30:00Z"], ["07h00", "2026-09-18T05:00:00Z"]]) {
    const s = signalFlux({ heures, canaris2h: 8 }, Date.parse(iso));
    assert.equal(s.etat, "alert", quand);
    assert.match(s.texte, /8 h actives consécutives/, quand);
  }
  assert.match(signalFlux({ heures, canaris2h: 8 }, Date.parse("2026-09-17T20:30:00Z")).texte, /fin de la dernière plage active, le 2026-09-17/);
  // Au premier passage actif du lendemain (10 h : l'heure 09 h est pleine et non vide), la série est celle du jour : ok.
  assert.equal(signalFlux({ heures: histogramme(Date.parse("2026-09-18T08:10:00Z"), { vides: clesEntre("2026-09-17", 13, 20) }), canaris2h: 8 }, Date.parse("2026-09-18T08:10:00Z")).etat, "ok");
  // Si le trafic a REPRIS avant la nuit (silence 10h→17h, lignes 18h-20h), le retour au vert à 22 h 30 est légitime : le silence est fini.
  const repris = histogramme(lendemain7h, { vides: clesEntre("2026-09-17", 10, 17) });
  assert.equal(signalFlux({ heures: repris, canaris2h: 8 }, Date.parse("2026-09-17T16:10:00Z")).etat, "alert");
  assert.equal(signalFlux({ heures: repris, canaris2h: 8 }, Date.parse("2026-09-17T20:30:00Z")).etat, "ok");
});

test("flux : un jour ouvré, une journée < 100 lignes face à une médiane > 500 est une ALERTE à 21 h, et encore à 23 h et à 07 h le lendemain", () => {
  // Mutation : `total < JOURNEE_MIN_LIGNES` inversé, ou la garde médiane retirée, ou `p.heure < HEURE_DEBUT ? now - 24 * H : null` → `null` (07 h rend ok) → rougit.
  const now = Date.parse("2026-09-17T19:00:00Z"); // 21:00 Paris jeudi
  const jourVide = clesEntre("2026-09-17", 0, 23);
  const profilFaible = Object.fromEntries(Object.keys(PROFIL).map((h) => [h, 1])); // 24 lignes/jour
  const lendemain7h = Date.parse("2026-09-18T05:00:00Z");
  const heures = histogramme(lendemain7h, { vides: [] }).map((x) => (jourVide.includes(x.h) ? { h: x.h, n: x.n > 0 ? 3 : 0 } : x)); // ≈ 60 lignes le 09-17
  const s = signalFlux({ heures, canaris2h: 8 }, now);
  assert.equal(s.etat, "alert");
  assert.match(s.texte, /journée ouvrée quasi vide/);
  assert.match(s.texte, /journée du 2026-09-17/);
  assert.equal(signalFlux({ heures, canaris2h: 8 }, Date.parse("2026-09-17T21:00:00Z")).etat, "alert", "23 h");
  const matin = signalFlux({ heures, canaris2h: 8 }, lendemain7h);
  assert.equal(matin.etat, "alert", "07 h le lendemain : c'est la veille qui est jugée");
  assert.match(matin.texte, /journée du 2026-09-17/);
  // À 10 h le lendemain, la journée n'est plus jugée : ok.
  assert.equal(signalFlux({ heures, canaris2h: 8 }, Date.parse("2026-09-18T08:00:00Z")).etat, "ok");
  // Le WEEK-END n'est pas une journée ouvrée (constat B-T08) : samedi 21 h faible face à une médiane ouvrée > 500 = pas d'alerte,
  // ni dimanche 07 h (c'est le samedi qui est jugé) ; mais samedi 07 h juge le VENDREDI, jour ouvré : alerte.
  // Mutation : `!estWeekend(pj.jour) &&` retiré → le samedi passe alert → rougit.
  const samedi21h = Date.parse("2026-09-19T19:00:00Z");
  const dimanche7h = Date.parse("2026-09-20T05:00:00Z");
  const weekendVide = [...clesEntre("2026-09-18", 0, 23), ...clesEntre("2026-09-19", 0, 23)];
  const heuresWe = histogramme(dimanche7h, { vides: [] }).map((x) => (weekendVide.includes(x.h) ? { h: x.h, n: x.n > 0 ? 3 : 0 } : x));
  const samedi = signalFlux({ heures: heuresWe, canaris2h: 8 }, samedi21h);
  assert.notEqual(samedi.etat, "alert", "samedi 21 h");
  assert.doesNotMatch(samedi.texte, /journée ouvrée quasi vide/);
  assert.notEqual(signalFlux({ heures: heuresWe, canaris2h: 8 }, dimanche7h).etat, "alert", "dimanche 07 h");
  const samedi7h = signalFlux({ heures: heuresWe, canaris2h: 8 }, Date.parse("2026-09-19T05:00:00Z"));
  assert.equal(samedi7h.etat, "alert", "samedi 07 h : le vendredi est jugé");
  assert.match(samedi7h.texte, /journée du 2026-09-18/);
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
  // Bord du « < 50 % » (constat B-T06) : 2 sur 3 (67 %) et 2 sur 4 (50 % exact) restent ok ; 1 sur 3 (33 %) est warn.
  // Mutation : `< 0.5` → `< 1` : « 3 créés, 2 confirmés » passe warn → rougit.
  assert.equal(signalInscriptions({ crees24h: 0, confirmes24h: 0, crees7j: 3, confirmes7j: 2, nonConfirmesAnciens: 1 }).etat, "ok");
  assert.equal(signalInscriptions({ crees24h: 0, confirmes24h: 0, crees7j: 4, confirmes7j: 2, nonConfirmesAnciens: 2 }).etat, "ok");
  assert.equal(signalInscriptions({ crees24h: 0, confirmes24h: 0, crees7j: 3, confirmes7j: 1, nonConfirmesAnciens: 2 }).etat, "warn");
});

test("erreurs : 12 erreurs sur 3 appareils face à une médiane 0 = ATTENTION ; 12 sur 1 appareil = rien", () => {
  // Mutation : `app >= 2` retiré → le poste de test seul déclenche → rougit.
  const heures = [{ h: "2026-09-13T07", n: 2, appareils: 1 }, { h: "2026-09-15T09", n: 1, appareils: 1 }, { h: "2026-09-16T15", n: 1, appareils: 1 }];
  assert.equal(signalErreurs({ heures, derniereHeure: 12, appareils: 3 }).etat, "warn");
  assert.equal(signalErreurs({ heures, derniereHeure: 12, appareils: 1 }).etat, "ok");
  assert.equal(signalErreurs({ heures, derniereHeure: 9, appareils: 3 }).etat, "ok");
  // Médiane NON nulle (3 erreurs/h sur 168 h, constat B-T05) : 12 < 5 × 3 reste ok, 15 = 5 × 3 est warn.
  // Mutation : `n >= 5 * med` retiré → « 12 sur 3 appareils » passe warn → rougit.
  const chargees = Array.from({ length: 168 }, (_, i) => ({ h: `2026-09-${String(11 + Math.floor(i / 24)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}`, n: 3, appareils: 2 }));
  assert.equal(signalErreurs({ heures: chargees, derniereHeure: 12, appareils: 3 }).etat, "ok");
  assert.equal(signalErreurs({ heures: chargees, derniereHeure: 15, appareils: 3 }).etat, "warn");
});

test("api : 5 × 5xx sur 2 appareils = ALERTE ; 25 refus 401/403 sur 3 appareils = ATTENTION, sur 2 = rien", () => {
  // Mutation : `n("appRefus") >= 3` → `>= 2` → le cas « sur 2 » passe warn → rougit.
  assert.equal(signalApi({ n5xx: 5, app5xx: 2, nRefus: 0, appRefus: 0 }).etat, "alert");
  assert.equal(signalApi({ n5xx: 5, app5xx: 1, nRefus: 0, appRefus: 0 }).etat, "ok");
  assert.equal(signalApi({ n5xx: 0, app5xx: 0, nRefus: 25, appRefus: 3 }).etat, "warn");
  assert.equal(signalApi({ n5xx: 0, app5xx: 0, nRefus: 25, appRefus: 2 }).etat, "ok");
  // Le réel de 7 j (50 × 401 étalés) ne dépasse jamais 20 en une heure.
  assert.equal(signalApi({ n5xx: 0, app5xx: 0, nRefus: 7, appRefus: 4 }).etat, "ok");
  // Bords des seuils (constat B-T07) : 4 × 5xx sur 2 appareils et 19 refus sur 3 appareils restent ok.
  // Mutation : `n("n5xx") >= 5` → `>= 1` (4 passe alert), ou `n("nRefus") >= 20` → `>= 8` (19 passe warn) → rougit.
  assert.equal(signalApi({ n5xx: 4, app5xx: 2, nRefus: 0, appRefus: 0 }).etat, "ok");
  assert.equal(signalApi({ n5xx: 0, app5xx: 0, nRefus: 19, appRefus: 3 }).etat, "ok");
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
  // deploy.yml n'a pas de workflow_dispatch (constat B-03) : le geste est « rejouer le run » ou « commit vide », jamais `gh workflow run deploy.yml`.
  // Mutation : geste rétabli à `gh workflow run deploy.yml --ref main` → rougit.
  assert.match(bloque.geste, /gh run rerun <id>/);
  assert.match(bloque.geste, /git commit --allow-empty/);
  assert.doesNotMatch(bloque.geste, /gh workflow run deploy\.yml/);
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
  // Les conclusions planifiées (2026-11-12) : le dernier passage planifié a réussi.
  const reussi = (h) => ({ suite: 0, lus: 5, vus: 5, dernier: { conclusion: "success", le: il_y_a(h) }, dernierSucces: { le: il_y_a(h) } });
  const sain = {
    "sentinelle-autonome": { state: "active", dernierRunFin: il_y_a(7), planifies: reussi(7) },
    "sentinelle-distante": { state: "active", dernierRunFin: il_y_a(5), planifies: reussi(5) },
    "disponibilite": { state: "active", dernierRunFin: il_y_a(5.5), planifies: reussi(5.5) },
    "sauvegarde": { state: "active", dernierRunFin: il_y_a(29), planifies: reussi(29) },
    "moderation-alerte": { state: "active", dernierRunFin: il_y_a(30), planifies: reussi(30) },
  };
  assert.equal(signalCrons(sain, now).etat, "ok", signalCrons(sain, now).texte);
  assert.equal(signalCrons({ ...sain, "sentinelle-autonome": { state: "active", dernierRunFin: il_y_a(30), planifies: reussi(7) } }, now).etat, "alert");
  assert.equal(signalCrons({ ...sain, "sentinelle-autonome": { state: "active", dernierRunFin: il_y_a(10), planifies: reussi(7) } }, now).etat, "warn");
  const desactive = signalCrons({ ...sain, "sauvegarde": { state: "disabled_inactivity", dernierRunFin: il_y_a(2) } }, now);
  assert.equal(desactive.etat, "alert");
  assert.match(desactive.texte, /DÉSACTIVÉ/);
  assert.match(desactive.geste, /Enable workflow/);
  assert.equal(signalCrons({ ...sain, "sauvegarde": { state: "active", dernierRunFin: il_y_a(40), planifies: reussi(29) } }, now).etat, "warn");
  // Le scan de sécurité n'est plus un cron : il a son signal (signalScan).
  assert.deepEqual(Object.keys(SEUILS_CRONS), ["sentinelle-autonome", "sentinelle-distante", "disponibilite", "sauvegarde", "moderation-alerte"]);
  // Un cron non mesuré ne passe pas pour sain.
  const partiel = { ...sain }; delete partiel.disponibilite;
  assert.equal(signalCrons(partiel, now).etat, "unknown");
  // Une lecture refusée (403 sans `actions: read`, constat B-01) se lit avec son code HTTP, pas « aucun run terminé ».
  // Mutation : la branche `if (x.erreur)` retirée → texte « aucun run terminé » sans le 403 → rougit.
  const refuse = signalCrons({ ...sain, disponibilite: { erreur: "HTTP 403 sur api.github.com/repos/x/y/actions/workflows/disponibilite.yml" } }, now);
  assert.equal(refuse.etat, "unknown");
  assert.match(refuse.texte, /disponibilite : lecture en échec \(HTTP 403/);
  assert.doesNotMatch(refuse.texte, /disponibilite : aucun run terminé/);
});

test("crons (2026-11-12) : echecsPlanifies compte les passages PLANIFIÉS en échec DE SUITE — triés par l'heure du PASSAGE, annulés, sautés et autres événements à part, le premier succès arrête ; un run lu deux fois compte une fois", () => {
  // Mutation : retirer le filtre `r.event !== "schedule"` → l'échec d'une PR compte → rougit.
  // Mutation : `else break` retiré → les échecs d'avant un succès comptent → rougit.
  // Mutation : le filtre `skipped` retiré → un passage sauté arrête le compte → rougit.
  // Mutation : trier par `run_started_at` → une relance d'un ancien passage remonte en tête → rougit.
  const T = Date.parse("2026-11-12T12:00:00Z");
  let id = 100;
  const run = (event, conclusion, h, status = "completed", extra = {}) => ({ id: id++, event, status, conclusion, created_at: new Date(T - h * H).toISOString(), updated_at: new Date(T - h * H + 60e3).toISOString(), ...extra });
  const vide = { suite: 0, lus: 0, vus: 0, dernier: null, dernierSucces: null };
  assert.deepEqual(echecsPlanifies([]), vide);
  assert.deepEqual(echecsPlanifies(null), vide);
  // Dans le désordre : le tri est fait ici.
  const deux = echecsPlanifies([run("schedule", "success", 30), run("schedule", "failure", 2), run("schedule", "failure", 10)]);
  assert.deepEqual([deux.suite, deux.lus, deux.vus, deux.dernier.conclusion], [2, 3, 3, "failure"]);
  assert.equal(deux.dernierSucces.le, new Date(T - 30 * H + 60e3).toISOString());
  // Un succès entre deux échecs : le compte s'arrête au premier succès.
  assert.equal(echecsPlanifies([run("schedule", "failure", 1), run("schedule", "success", 5), run("schedule", "failure", 9)]).suite, 1);
  // Les PR, les relances à la main, les passages annulés, sautés ou en cours ne tranchent pas.
  const melange = echecsPlanifies([run("pull_request", "failure", 0.5), run("workflow_dispatch", "success", 0.7), run("schedule", "cancelled", 1),
    run("schedule", "skipped", 1.5), run("schedule", null, 0.2, "in_progress"), run("schedule", "timed_out", 3), run("schedule", "startup_failure", 6), run("schedule", "success", 12)]);
  assert.deepEqual([melange.suite, melange.lus, melange.vus, melange.dernier.conclusion], [2, 3, 5, "timed_out"], "deux passages cassés ; l'annulé et le sauté vus, pas comptés");
  assert.equal(echecsPlanifies([run("schedule", "skipped", 1), run("schedule", "failure", 3), run("schedule", "success", 9)]).suite, 1, "un passage sauté n'arrête pas le compte");
  assert.equal(echecsPlanifies([run("schedule", "success", 1)]).suite, 0);
  // Une RELANCE (`gh run rerun`) d'un vieux passage : `run_started_at` récent, `created_at` d'origine — elle reste à sa place.
  const relance = echecsPlanifies([run("schedule", "success", 48, "completed", { run_started_at: new Date(T - 0.5 * H).toISOString(), updated_at: new Date(T - 0.4 * H).toISOString() }), run("schedule", "failure", 24)]);
  assert.equal(relance.suite, 1, "le passage le plus récent (24 h) a cassé, la relance d'il y a 48 h ne le cache pas");
  // Le même run lu dans deux listes (une réplique en retard) : une fois, dans sa version la plus récente.
  const enRetard = { id: 7, event: "schedule", status: "completed", conclusion: "failure", created_at: new Date(T - 3 * H).toISOString(), updated_at: new Date(T - 2.9 * H).toISOString() };
  const frais = { ...enRetard, conclusion: "success", updated_at: new Date(T - 1 * H).toISOString() };
  const double = echecsPlanifies([enRetard, frais, run("schedule", "success", 27)]);
  assert.deepEqual([double.suite, double.vus, double.dernierSucces.le], [0, 2, frais.updated_at]);
});

test("crons (2026-11-12) : un passage planifié EN ÉCHEC n'est plus un passage frais — la sauvegarde et la modération alertent dès le premier, la disponibilité au deuxième, la santé distante au troisième ; la Sentinelle autonome reste une attention ; illisible = inconnu", () => {
  // Mutation : `if (p.suite >= seuilEchecs) reagir(…)` → jamais → la sauvegarde ratée reste « attention » → rougit.
  // Mutation : `echecs: 1` → `echecs: 2` sur la sauvegarde → rougit.
  // Mutation : la branche `if (!p)` retirée → des conclusions non mesurées passent pour saines → rougit.
  // Mutation : `conclusions: "warn"` retiré de la Sentinelle autonome → deux échecs alertent → rougit.
  const now = Date.parse("2026-11-12T12:00:00Z");
  const il_y_a = (h) => new Date(now - h * H).toISOString();
  const reussi = { suite: 0, lus: 5, vus: 5, dernier: { conclusion: "success", le: il_y_a(5) }, dernierSucces: { le: il_y_a(5) } };
  // n échecs de suite (le dernier il y a 3 h), le succès d'avant il y a 4 h : seule la règle des échecs parle.
  const echecs = (n, conclusion = "failure") => ({ suite: n, lus: 5, vus: 5, dernier: { conclusion, le: il_y_a(3) }, dernierSucces: { le: il_y_a(4) } });
  const sain = Object.fromEntries(Object.keys(SEUILS_CRONS).map((k) => [k, { state: "active", dernierRunFin: il_y_a(2), planifies: reussi }]));
  assert.equal(signalCrons(sain, now).etat, "ok", signalCrons(sain, now).texte);
  // La sauvegarde de la nuit a CASSÉ : son âge est frais (2 h), l'ancien signal disait « ok ».
  const sauvegarde = signalCrons({ ...sain, sauvegarde: { state: "active", dernierRunFin: il_y_a(2), planifies: echecs(1) } }, now);
  assert.equal(sauvegarde.etat, "alert");
  assert.match(sauvegarde.texte, /sauvegarde : 1 passage\(s\) planifié\(s\) en échec de suite \(dernier : failure le 2026-11-12 09:00 UTC\) — seuil 1/);
  assert.match(sauvegarde.geste, /journal de l'étape en échec/);
  assert.equal(signalCrons({ ...sain, "moderation-alerte": { state: "active", dernierRunFin: il_y_a(2), planifies: echecs(1) } }, now).etat, "alert");
  // Toutes les heures : un échec passager est une ATTENTION, deux de suite une alerte.
  assert.equal(signalCrons({ ...sain, disponibilite: { state: "active", dernierRunFin: il_y_a(2), planifies: echecs(1) } }, now).etat, "warn");
  assert.equal(signalCrons({ ...sain, disponibilite: { state: "active", dernierRunFin: il_y_a(2), planifies: echecs(2, "startup_failure") } }, now).etat, "alert");
  // La Sentinelle autonome : le pilotage dit déjà son arrêt, avec son « Régler » — ses échecs ne font qu'une attention.
  for (const n of [1, 2, 5]) {
    const s = signalCrons({ ...sain, "sentinelle-autonome": { state: "active", dernierRunFin: il_y_a(2), planifies: echecs(n) } }, now);
    assert.equal(s.etat, "warn", n + " échec(s) : " + s.texte);
    if (n >= 2) assert.match(s.texte, /attention seulement : le pilotage le dit déjà/);
  }
  // … mais un cron qui ne tourne plus du tout reste une alerte, comme avant.
  assert.equal(signalCrons({ ...sain, "sentinelle-autonome": { state: "active", dernierRunFin: il_y_a(30), planifies: echecs(2) } }, now).etat, "alert");
  // La santé distante échoue EXPRÈS quand la santé est mauvaise (et ouvre son issue) : deux échecs ne doublent pas l'alerte, trois oui.
  const distante2 = signalCrons({ ...sain, "sentinelle-distante": { state: "active", dernierRunFin: il_y_a(2), planifies: echecs(2) } }, now);
  assert.equal(distante2.etat, "warn");
  assert.match(distante2.texte, /\(alerte à 3\)/);
  assert.equal(signalCrons({ ...sain, "sentinelle-distante": { state: "active", dernierRunFin: il_y_a(2), planifies: echecs(3) } }, now).etat, "alert");
  // Une alerte d'âge garde la main sur le geste ; l'échec planifié s'ajoute au texte.
  const lesDeux = signalCrons({ ...sain, sauvegarde: { state: "active", dernierRunFin: il_y_a(60), planifies: echecs(2) } }, now);
  assert.equal(lesDeux.etat, "alert");
  assert.match(lesDeux.texte, /sauvegarde : dernier run il y a 60 h/);
  assert.match(lesDeux.texte, /sauvegarde : 2 passage\(s\) planifié\(s\) en échec/);
  assert.match(lesDeux.geste, /relancer à la main/);
  // Conclusions non mesurées, ou illisibles : jamais « ok ».
  const sansConclusion = { ...sain }; sansConclusion.sauvegarde = { state: "active", dernierRunFin: il_y_a(2) };
  assert.equal(signalCrons(sansConclusion, now).etat, "unknown");
  assert.match(signalCrons(sansConclusion, now).texte, /sauvegarde : conclusions planifiées non mesurées/);
  const illisible = signalCrons({ ...sain, sauvegarde: { state: "active", dernierRunFin: il_y_a(2), planifies: { erreur: "HTTP 502 sur api.github.com" } } }, now);
  assert.equal(illisible.etat, "unknown");
  assert.match(illisible.texte, /conclusions planifiées illisibles \(HTTP 502/);
  // Aucun passage planifié terminé lu : on ne sait pas — jamais « ok ».
  assert.equal(signalCrons({ ...sain, sauvegarde: { state: "active", dernierRunFin: il_y_a(2), planifies: { suite: 0, lus: 0, vus: 0, dernier: null, dernierSucces: null } } }, now).etat, "unknown");
});

test("crons (2026-11-12, contre-revue de #863) : un passage BLOQUÉ jusqu'à son délai finit « annulé » — l'âge du dernier passage planifié RÉUSSI le rattrape ; aucun succès parmi les passages vus = la réaction", () => {
  // Mutation : la règle du dernier succès retirée → trois nuits de sauvegarde bloquée rendent « ok » → rougit.
  // Mutation : `p.vus > (p.suite || 0)` → `false` → dix passages annulés rendent « ok » → rougit.
  const now = Date.parse("2026-11-12T12:00:00Z");
  const il_y_a = (h) => new Date(now - h * H).toISOString();
  let id = 1;
  const passe = (conclusion, h) => ({ id: id++, event: "schedule", status: "completed", conclusion, created_at: il_y_a(h), updated_at: il_y_a(h - 0.5) });
  const reussi = echecsPlanifies([passe("success", 5)]);
  const sain = Object.fromEntries(Object.keys(SEUILS_CRONS).map((k) => [k, { state: "active", dernierRunFin: il_y_a(2), planifies: reussi }]));
  // Trois nuits : la sauvegarde dépasse ses 30 min, GitHub conclut `cancelled`. L'âge du dernier RUN reste frais (2 h).
  const bloquee = echecsPlanifies([passe("cancelled", 3), passe("cancelled", 27), passe("cancelled", 51), passe("success", 75)]);
  assert.equal(bloquee.suite, 0, "le compte ne voit rien : l'annulé est sauté");
  const s = signalCrons({ ...sain, sauvegarde: { state: "active", dernierRunFin: il_y_a(2), planifies: bloquee } }, now);
  assert.equal(s.etat, "alert", s.texte);
  assert.match(s.texte, /sauvegarde : dernier passage planifié réussi il y a 74\.5 h \(> 54 h\)/);
  assert.match(s.geste, /bloquée jusqu'à son délai/);
  // Une seule nuit bloquée : le succès d'avant a 26,5 h — rien à dire encore ; deux nuits : attention.
  assert.equal(signalCrons({ ...sain, sauvegarde: { state: "active", dernierRunFin: il_y_a(2), planifies: echecsPlanifies([passe("cancelled", 3), passe("success", 27)]) } }, now).etat, "ok");
  assert.equal(signalCrons({ ...sain, sauvegarde: { state: "active", dernierRunFin: il_y_a(2), planifies: echecsPlanifies([passe("cancelled", 3), passe("cancelled", 27), passe("success", 51)]) } }, now).etat, "warn");
  // Dix passages annulés, aucun succès en vue : la réaction, et le texte dit pourquoi.
  const dix = echecsPlanifies(Array.from({ length: 10 }, (_, k) => passe("cancelled", 3 + 24 * k)));
  const d = signalCrons({ ...sain, sauvegarde: { state: "active", dernierRunFin: il_y_a(2), planifies: dix } }, now);
  assert.equal(d.etat, "alert");
  assert.match(d.texte, /aucun passage planifié réussi parmi les 10 derniers \(10 annulé\(s\) ou sauté\(s\)/);
  // La Sentinelle autonome : la même règle, plafonnée à l'attention.
  assert.equal(signalCrons({ ...sain, "sentinelle-autonome": { state: "active", dernierRunFin: il_y_a(2), planifies: dix } }, now).etat, "warn");
  // Tous les passages vus sont des échecs : la règle des échecs de suite juge seule (la disponibilité, à 1 sur 2 : attention).
  assert.equal(signalCrons({ ...sain, disponibilite: { state: "active", dernierRunFin: il_y_a(2), planifies: echecsPlanifies([passe("failure", 1)]) } }, now).etat, "warn");
});

test("crons (2026-11-12, contre-revue de #863) : l'état ne fait que MONTER — une attention ou une lecture manquée plus loin dans la liste ne rabaisse jamais une alerte", () => {
  // Mutation : `if (ORDRE[e] > ORDRE[etat])` → `if (true)` → l'attention de la disponibilité efface l'alerte de la santé distante → rougit.
  const now = Date.parse("2026-11-12T12:00:00Z");
  const il_y_a = (h) => new Date(now - h * H).toISOString();
  const reussi = { suite: 0, lus: 5, vus: 5, dernier: { conclusion: "success", le: il_y_a(5) }, dernierSucces: { le: il_y_a(5) } };
  const sain = Object.fromEntries(Object.keys(SEUILS_CRONS).map((k) => [k, { state: "active", dernierRunFin: il_y_a(2), planifies: reussi }]));
  // La santé distante (2ᵉ de la liste) en alerte d'âge ; la disponibilité (3ᵉ) en attention, ou sans conclusions, ou illisible.
  const distanteMuette = { state: "active", dernierRunFin: il_y_a(40), planifies: reussi };
  const unEchec = { suite: 1, lus: 5, vus: 5, dernier: { conclusion: "failure", le: il_y_a(1) }, dernierSucces: { le: il_y_a(2) } };
  for (const [quoi, dispo] of [["attention", { state: "active", dernierRunFin: il_y_a(2), planifies: unEchec }], ["sans conclusions", { state: "active", dernierRunFin: il_y_a(2) }],
    ["illisible", { erreur: "HTTP 502" }], ["non mesurée", undefined]]) {
    const m = { ...sain, "sentinelle-distante": distanteMuette, disponibilite: dispo };
    if (!dispo) delete m.disponibilite;
    assert.equal(signalCrons(m, now).etat, "alert", quoi + " : " + signalCrons(m, now).texte);
  }
});

test("scan (contre-revue de #863) : le scan de sécurité est un signal À PART qui ne dépasse JAMAIS l'attention — son tri est à Benjamin, aucune [VEILLE] ne le fait « Régler » par un agent ; il ne cache plus une sauvegarde ratée", () => {
  // Mutation : `etat: "warn"` → `"alert"` sur un passage en échec → rougit.
  // Mutation : `{ cle: "scan", … }` retiré de verdictVeille → rougit.
  const now = Date.parse("2026-11-16T12:00:00Z");
  const il_y_a = (h) => new Date(now - h * H).toISOString();
  const ok = { state: "active", dernierRunFin: il_y_a(1), planifies: { suite: 0, lus: 4, vus: 4, dernier: { conclusion: "success", le: il_y_a(6) }, dernierSucces: { le: il_y_a(6) } } };
  assert.equal(signalScan(ok, now).etat, "ok");
  assert.match(signalScan(ok, now).texte, /securite : dernier passage planifié réussi il y a 0\.3 j/);
  // Le lundi 09/11 rejoué : gitleaks a trouvé, le passage planifié a échoué ; les PR gardent l'âge frais.
  const echec = { ...ok, planifies: { suite: 1, lus: 4, vus: 4, dernier: { conclusion: "failure", le: il_y_a(7 * 24 - 1) }, dernierSucces: { le: il_y_a(14 * 24) } } };
  const s = signalScan(echec, now);
  assert.equal(s.etat, "warn");
  assert.match(s.texte, /securite : dernier passage planifié en échec \(failure le 2026-11-09 13:00 UTC\) — à trier par Benjamin \(Actions > « Sécurité de la chaîne »/);
  assert.match(s.geste, /gitleaks-results\.sarif/);
  assert.match(s.geste, /jamais par un agent/);
  assert.match(s.geste, /\.gitleaksignore/);
  assert.match(s.geste, /RÉVOQUE d'abord, puis s'y inscrit aussi/);
  assert.match(s.geste, /npm audit/);
  // Aucun succès en vue, succès trop vieux (un lundi manqué), workflow désactivé : attention, jamais plus.
  const cas = {
    "aucun succès": { ...ok, planifies: { suite: 0, lus: 0, vus: 3, dernier: null, dernierSucces: null } },
    "succès de 9 j": { ...ok, planifies: { suite: 0, lus: 2, vus: 2, dernier: { conclusion: "success", le: il_y_a(9 * 24) }, dernierSucces: { le: il_y_a(9 * 24) } } },
    "désactivé": { ...ok, state: "disabled_inactivity" },
    "dix échecs": { ...ok, planifies: { suite: 10, lus: 10, vus: 10, dernier: { conclusion: "failure", le: il_y_a(2) }, dernierSucces: null } },
  };
  for (const [quoi, m] of Object.entries(cas)) assert.equal(signalScan(m, now).etat, "warn", quoi + " : " + signalScan(m, now).texte);
  // Illisible ou non mesuré : inconnu, jamais « ok ».
  assert.equal(signalScan(undefined, now).etat, "unknown");
  assert.equal(signalScan({ erreur: "HTTP 403" }, now).etat, "unknown");
  assert.equal(signalScan({ ...ok, planifies: { erreur: "HTTP 502" } }, now).etat, "unknown");
  assert.equal(signalScan({ ...ok, planifies: undefined }, now).etat, "unknown");
  assert.equal(signalScan({ ...ok, planifies: { suite: 0, lus: 0, vus: 0, dernier: null, dernierSucces: null } }, now).etat, "unknown");
  // Dans le verdict : le scan seul en échec n'ouvre AUCUNE issue ; une sauvegarde ratée en même temps fait son titre à elle.
  const reussi = { suite: 0, lus: 5, vus: 5, dernier: { conclusion: "success", le: il_y_a(5) }, dernierSucces: { le: il_y_a(5) } };
  const crons = Object.fromEntries(Object.keys(SEUILS_CRONS).map((k) => [k, { state: "active", dernierRunFin: il_y_a(2), planifies: reussi }]));
  const seul = verdictVeille({ crons, scan: echec }, now);
  assert.equal(seul.alerte, false, seul.resume);
  assert.match(seul.resume, /\[ATTENTION\] scan — securite : dernier passage planifié en échec/);
  const avecSauvegarde = verdictVeille({ crons: { ...crons, sauvegarde: { state: "active", dernierRunFin: il_y_a(2), planifies: { ...reussi, suite: 1, dernier: { conclusion: "failure", le: il_y_a(3) }, dernierSucces: { le: il_y_a(27) } } } }, scan: echec }, now);
  assert.equal(avecSauvegarde.titre, "[VEILLE] 1 alerte(s) : crons");
  assert.match(avecSauvegarde.corps, /- \*\*crons\*\* : Actions > le workflow nommé > son dernier passage planifié/);
  assert.doesNotMatch(avecSauvegarde.corps, /## Ce que tu fais[\s\S]*\*\*scan\*\* :/, "le scan n'a pas de geste à faire faire");
});

test("crons et scan (2026-11-12) : la mesure lit les passages PLANIFIÉS à part — `event=schedule` —, y joint ceux de la première liste par identifiant, et une lecture refusée se note, sans perdre l'âge", () => {
  // Mutation : la requête sans `event=schedule` → rougit.
  const source = fs.readFileSync("scripts/veille-production.mjs", "utf8");
  const mesure = source.slice(source.indexOf("async function mesurerWorkflow"), source.indexOf("export async function mesurerBase"));
  assert.match(mesure, /\/runs\?event=schedule&per_page=10`/);
  assert.match(mesure, /out\.planifies = echecsPlanifies\(\[\.\.\.\(\(runs && runs\.workflow_runs\) \|\| \[\]\), \.\.\.\(\(sched && sched\.workflow_runs\) \|\| \[\]\)\]\);/);
  assert.match(mesure, /catch \(e\) \{ out\.planifies = enErreur\(e\); \}/, "une lecture des passages planifiés refusée se note, et l'âge déjà lu reste");
  assert.match(mesure, /export async function mesurerScan\(env\) \{\s*return mesurerWorkflow\(env, SCAN\.workflow\);/);
  assert.match(source, /scan: await mesure\(\(\) => mesurerScan\(env\)\),/);
  // Le scan : `securite.yml`, son passage du lundi ; chaque workflow surveillé existe.
  assert.equal(SCAN.workflow, "securite");
  assert.ok(fs.readFileSync(".github/workflows/securite.yml", "utf8").includes('cron: "11 5 * * 1"'), "prémisse : securite.yml passe le lundi");
  assert.ok(fs.readFileSync(".github/workflows/securite.yml", "utf8").includes("gitleaks"), "prémisse : le scan des secrets est gitleaks");
  for (const nom of [...Object.keys(SEUILS_CRONS), SCAN.workflow]) assert.ok(fs.existsSync(".github/workflows/" + nom + ".yml"), "chaque workflow surveillé existe : " + nom);
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

test("jetons : un jeton NON LU (statut 0 = réseau muet, 503, 429, absent) n'est jamais « ok » : le signal passe `unknown`, l'alerte l'emporte", () => {
  // Mutation : `lu = (x) => !!x && x.statut >= 200 && x.statut < 300` → `lu = () => true` (statut 0 passe ok) → rougit.
  const ok = { github: { statut: 200, joursRestants: 70 }, supabase: { statut: 200 }, netlify: { statut: 200 } };
  const muet = signalJetons({ github: { statut: 0 }, supabase: { statut: 0 }, netlify: { statut: 0 } });
  assert.equal(muet.etat, "unknown");
  assert.doesNotMatch(muet.texte, /: ok/);
  assert.match(muet.texte, /NETLIFY_AUTH_TOKEN : non lisible \(HTTP 0\)/);
  const netlify0 = signalJetons({ ...ok, netlify: { statut: 0 } });
  assert.equal(netlify0.etat, "unknown");
  assert.doesNotMatch(netlify0.texte, /NETLIFY_AUTH_TOKEN : ok/);
  assert.match(netlify0.texte, /SUPABASE_ACCESS_TOKEN : ok/);
  assert.equal(signalJetons({ ...ok, supabase: { statut: 503 } }).etat, "unknown");
  assert.equal(signalJetons({ ...ok, supabase: { statut: 429 } }).etat, "unknown");
  assert.equal(signalJetons({ ...ok, github: undefined }).etat, "unknown");
  // Une alerte l'emporte sur un « non lu ».
  assert.equal(signalJetons({ ...ok, github: { statut: 401 }, netlify: { statut: 0 } }).etat, "alert");
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
    crons: Object.fromEntries(Object.keys(SEUILS_CRONS).map((k) => [k, { state: "active", dernierRunFin: new Date(now - H).toISOString(), planifies: { suite: 0, lus: 3, vus: 3, dernier: { conclusion: "success", le: new Date(now - H).toISOString() }, dernierSucces: { le: new Date(now - H).toISOString() } } }])),
    scan: { state: "active", dernierRunFin: new Date(now - H).toISOString(), planifies: { suite: 0, lus: 2, vus: 2, dernier: { conclusion: "success", le: new Date(now - 30 * H).toISOString() }, dernierSucces: { le: new Date(now - 30 * H).toISOString() } } },
    base: { anonStatus: 200, octets: 1024 ** 3, purgePlanifiee: true },
    jetons: { github: { statut: 200, joursRestants: 70 }, supabase: { statut: 200 }, netlify: { statut: 200 } },
    battement: { ligne: { created_at: new Date(now - 5 * 60e3).toISOString(), properties: { lectures: { sante: "ok", signalements: "ok", github: "ok", parcours: "ok" } } }, n24: 96 },
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
  // Neuf signaux depuis le 2026-11-06 (le battement de la veille du pilotage) ; dix depuis le 12/11 : le scan de sécurité, à part.
  assert.equal(rouge.signaux.length, 10);
});

test("verdictVeille : une mesure en échec rend `unknown` avec sa raison (bornée), jamais « ok »", () => {
  // Mutation : `inconnu()` rend null sur `erreur` → le signal passe ok → rougit.
  const v = verdictVeille({ flux: { erreur: "HTTP 401 sur api.supabase.com/database/query " + "x".repeat(300) } }, Date.parse("2026-09-18T12:00:00Z"));
  const flux = v.signaux.find((s) => s.cle === "flux");
  assert.equal(flux.etat, "unknown");
  assert.match(flux.texte, /lecture en échec \(HTTP 401/);
  assert.ok(flux.texte.length < 200);
  assert.equal(v.alerte, false);
  // Une mesure ABSENTE (clé manquante, lecteur qui rend undefined) est `unknown` aussi (constat B-T02).
  // Mutation : branche `!m` de inconnu() → `etat: "ok"` → rougit.
  const v2 = verdictVeille({}, Date.parse("2026-09-18T12:00:00Z"));
  assert.ok(v2.signaux.every((s) => s.etat === "unknown"), v2.resume);
  assert.equal(signalBase(undefined).etat, "unknown");
  assert.equal(signalFlux(undefined, Date.parse("2026-09-18T12:00:00Z")).etat, "unknown");
  // Et « tout inconnu » est la sortie 2 du script (lecteur muet), pas un verdict.
  // Mutation : `every` → `some` dans tousInconnus → le verdict à un seul signal en échec passe pour muet → rougit.
  assert.equal(tousInconnus(v2), true);
  assert.equal(tousInconnus(v), true); // seul `flux` est fourni, en échec : tout est inconnu
  assert.equal(tousInconnus(verdictVeille({ base: { anonStatus: 200, octets: 1, purgePlanifiee: true } }, Date.parse("2026-09-18T12:00:00Z"))), false);
  assert.equal(tousInconnus({ signaux: [] }), false);
});

test("estSelectSeul : SELECT et WITH … SELECT passent ; DML, DDL, enchaînement par `;`, commentaires et ordres hors ancre sont refusés — et toutes les requêtes du script passent", () => {
  // Mutation : retirer `s.includes(";")` → « select 1; drop table x » passe → rougit.
  assert.equal(estSelectSeul("select count(*) from telemetry_events"), true);
  assert.equal(estSelectSeul("with x as (select 1) select * from x;"), true);
  assert.equal(estSelectSeul("select 1; drop table telemetry_events"), false);
  assert.equal(estSelectSeul("select 1; select pg_sleep(10)"), false); // deux ordres, même inoffensifs
  assert.equal(estSelectSeul("delete from telemetry_events"), false);
  assert.equal(estSelectSeul("select purge_telemetry(7) -- ok\n; create table t()"), false);
  assert.equal(estSelectSeul("SELECT 1 FROM t WHERE x = 'update'"), false); // conservateur : le mot suffit à refuser
  assert.equal(estSelectSeul(""), false);
  // L'ancre `^(select|with)` (constat B-T01) : un ordre sans mot DML/DDL mais qui n'est pas un SELECT est refusé.
  // Mutation : `if (!/^(select|with)\b/i.test(s)) return false;` retiré → « show all », « values (1) », « begin » passent → rougit.
  for (const q of ["show all", "values (1)", "begin", "checkpoint", "discard all", "analyze telemetry_events", "explain analyze select 1"]) assert.equal(estSelectSeul(q), false, q);
  assert.equal(estSelectSeul("set role postgres"), false);
  assert.equal(estSelectSeul("lock table telemetry_events in access exclusive mode"), false);
  assert.equal(estSelectSeul("refresh materialized view x"), false);
  assert.equal(estSelectSeul("reindex table telemetry_events"), false);
  assert.equal(estSelectSeul("truncate telemetry_events"), false);
  // Les commentaires masquaient un `;` que PostgreSQL exécute (constat B-T01) : ils sont refusés d'emblée.
  // Mutation : retrait des commentaires AVANT le contrôle du `;` (ancienne forme) → cette requête passe → rougit.
  assert.equal(estSelectSeul("select 1 /* -- */ ; drop table telemetry_events --"), false);
  assert.equal(estSelectSeul("select 1 -- commentaire"), false);
  assert.equal(estSelectSeul("select 1 /* c */"), false);
  for (const [k, q] of Object.entries(SQL)) assert.equal(estSelectSeul(q), true, `SQL.${k}`);
  // Aucune requête ne sélectionne une colonne nominative.
  for (const [k, q] of Object.entries(SQL)) assert.doesNotMatch(q, /select\s+email\b|,\s*email\b\s*(,|from)|\bas\s+email\b/i, `SQL.${k} ne doit pas rendre d'e-mail`);
  // Le comptage des appareils en erreur exclut le synthétique, comme le comptage des lignes (constat mineur).
  // Mutation : `(meta->>'synthetic') is null` retiré du sous-select distinct device_id → rougit.
  assert.equal((SQL.erreursDerniereHeure.match(/synthetic/g) || []).length, 2);
  // ⚠️ LE FLUX SE COMPTE EN POIDS, PAS EN LIGNES. Depuis le 2026-09-19 une lecture
  // `api` en HTTP 200 sur dix est gardée et porte `meta.ech` : un `count(*)` ferait
  // mesurer à ce signal L'ÉCHANTILLONNAGE au lieu de l'usage, et son seuil
  // « journée ouvrée quasi vide » pourrait se déclencher sur une production saine.
  // Même contrat que `poidsEvenement` (dashboard/server/store.js) : valeur absurde
  // → 1, poids borné à 1000. Mutation : remettre `count(*)` → ce cas rougit.
  assert.match(SQL.fluxHeures, /meta->>'ech'/, "fluxHeures doit lire l'estampille d'échantillonnage");
  assert.doesNotMatch(SQL.fluxHeures, /count\(\*\)/, "fluxHeures ne doit plus compter des LIGNES");
  assert.match(SQL.fluxHeures, /least\(/, "le poids venu du client doit être borné");
  assert.match(SQL.fluxHeures, /else 1 end/, "une valeur absurde retombe à 1");
});

// 2026-11-02 (audit G) : depuis la migration croissance du 01/11, la purge de la télémétrie
// s'appelle `purge_telemetrie_paliers` et `purge_telemetry_7j` est retirée. La requête ne
// connaissait que `purge_telemetry%` : la veille écrivait « aucune purge telemetry planifiée »
// (ATTENTION) à chaque passage, sur une base qui en avait une — mesuré sur le [TABLEAU] #504 et
// confirmé en base (canal ①) : ancienne requête → false, requête corrigée → true.
// Mutation éprouvée : revenir à `jobname like 'purge_telemetry%'` seul → le cas ② rougit.
test("purgePlanifiee reconnaît les DEUX noms de la purge (purge_telemetry_7j, purge_telemetrie_paliers) et ignore la purge des compteurs de débit", () => {
  // Rejoue le `like` de PostgreSQL sur des noms de cron.job, pour éprouver le MOTIF sans base.
  const like = (nom, motif) => new RegExp("^" + motif.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i").test(nom);
  const motifs = [...SQL.purgePlanifiee.matchAll(/jobname like '([^']+)'/g)].map((m) => m[1]);
  assert.ok(motifs.length >= 2, "la requête doit porter au moins deux motifs de nom : " + JSON.stringify(motifs));
  const planifiee = (jobs) => jobs.some((j) => motifs.some((m) => like(j, m)));
  assert.equal(planifiee(["purge_telemetry_7j", "purge_client_errors"]), true, "① ouverture publique (11/09)");
  assert.equal(planifiee(["purge_telemetrie_paliers", "purge_telemetrie_debit", "agreger_croissance"]), true, "② croissance (01/11) — l'état réel de la production au 02/11");
  assert.equal(planifiee(["purge_telemetrie_debit", "purge_client_errors", "passio_purge_analytics"]), false, "③ la purge des COMPTEURS de débit n'est pas une purge de la télémétrie");
  assert.equal(planifiee([]), false, "④ aucun job → aucune purge");
  assert.equal(estSelectSeul(SQL.purgePlanifiee), true);
});

// 2026-11-07 (revue adversariale de la purge courte) : pg_cron ne dit rien d'une tâche
// qui échoue. Une `purge_analytics_courte` cassée laisserait analytics_events repartir vers
// 13 mois de lignes `edge_*` en silence. La veille lit sa dernière exécution.
// Mutations éprouvées : ignorer `failed` → ③ rougit ; ignorer l'âge → ④ rougit ; laisser une
// tâche absente en information → ① rougit (depuis le 08/11, la migration est appliquée en
// production : une tâche disparue est une purge retirée ou cassée).
test("purge courte : absente, en échec ou plus de 3 h sans exécution = ATTENTION ; jamais une alerte", () => {
  const Go = 1024 ** 3;
  const base = (purgeCourte) => signalBase({ anonStatus: 200, octets: 1 * Go, purgePlanifiee: true, purgeCourte });
  // ① appliquée le 08/11 : une tâche absente est une ATTENTION, et le geste dit comment la rétablir.
  const absente = base({ taches: 0, statut: null, ageS: null });
  assert.equal(absente.etat, "warn");
  assert.match(absente.texte, /purge courte d'analytics_events absente ou désactivée dans cron\.job/);
  assert.match(absente.geste, /migration_purge_analytics_courte_2026-11-07\.sql/);
  // Le TEXTE porte la migration à rejouer : une ATTENTION n'affiche jamais son geste
  // (seul le corps d'une issue d'ALERTE le fait).
  assert.match(absente.texte, /migration_purge_analytics_courte_2026-11-07\.sql/);
  // « Désactivée » compte comme absente : la mesure ne compte que les tâches ACTIVES
  // (contre-revue de #782, N2 — sans ce verrou, seule la règle des 3 h la rattrapait).
  assert.match(SQL.purgeCourte, /jobname = 'purge_analytics_courte' and active\)/);
  // ② installée, à jour ; ou planifiée, pas encore exécutée (juste après l'application).
  assert.equal(base({ taches: 1, statut: "succeeded", ageS: 600 }).etat, "ok");
  assert.match(base({ taches: 1, statut: "succeeded", ageS: 600 }).texte, /purge courte : à jour/);
  assert.match(base({ taches: 1, statut: null, ageS: null }).texte, /pas encore exécutée/);
  // ③ la dernière exécution a échoué : ATTENTION, et le geste dit où lire l'erreur.
  const echec = base({ taches: 1, statut: "failed", ageS: 300 });
  assert.equal(echec.etat, "warn");
  assert.match(echec.texte, /dernière exécution en échec — Integrations › Cron › purge_analytics_courte/);
  assert.match(echec.geste, /purge_analytics_courte/);
  // ④ deux passages manqués : ATTENTION ; à la limite, pas encore.
  assert.equal(base({ taches: 1, statut: "succeeded", ageS: PURGE_COURTE_MAX_S + 60 }).etat, "warn");
  assert.match(base({ taches: 1, statut: "succeeded", ageS: 4 * 3600 }).texte, /aucune exécution depuis 4 h — Integrations › Cron › purge_analytics_courte/);
  assert.equal(base({ taches: 1, statut: "succeeded", ageS: PURGE_COURTE_MAX_S }).etat, "ok");
  assert.equal(PURGE_COURTE_MAX_S, 3 * 3600, "horaire : deux passages manqués");
  // ⑤ une ATTENTION de la purge ne masque pas une ALERTE de la base, et n'en crée jamais.
  assert.equal(signalBase({ anonStatus: 503, octets: 1 * Go, purgePlanifiee: true, purgeCourte: { taches: 1, statut: "failed", ageS: 1 } }).etat, "alert");
  for (const m of [{ taches: 1, statut: "failed", ageS: 1 }, { taches: 1, statut: "succeeded", ageS: 99 * 3600 }]) assert.notEqual(signalPurgeCourte(m).etat, "alert");
  // ⑥ non mesurée (lecture en échec) ou d'une forme inattendue : rien n'est dit sur elle, le reste parle.
  assert.equal(signalPurgeCourte(null), null);
  assert.equal(signalPurgeCourte({ taches: NaN }), null);
  assert.equal(base(null).etat, "ok");
  // ⑦ un statut hors de la liste de pg_cron ne part pas dans le texte.
  assert.doesNotMatch(signalPurgeCourte({ taches: 1, statut: "<b>x</b>", ageS: 60 }).texte, /<b>/);
  // ⑧ la requête : un SELECT seul, sur le nom de la tâche que la migration pose.
  assert.equal(estSelectSeul(SQL.purgeCourte), true);
  assert.equal((SQL.purgeCourte.match(/jobname = 'purge_analytics_courte'/g) || []).length, 3);
  const migration = fs.readFileSync("migrations/migration_purge_analytics_courte_2026-11-07.sql", "utf8");
  assert.match(migration, /cron\.schedule\('purge_analytics_courte', '23 \* \* \* \*',/, "le nom et l'horaire que la veille surveille");
});

// 2026-10-05 : la veille a vu sentinelle-distante « sans run depuis 58,8 h »
// alors que le dernier datait de 2 h — `per_page=1` filtré renvoyait un vieux
// run. Mutation éprouvée : runPlusRecent → `runs[0]` rougit ce test.
test("runPlusRecent : le plus récent selon sa date, quel que soit l'ordre servi, et la garde filtre", () => {
  const runs = [
    { id: "vieux", created_at: "2026-10-02T20:50:00Z", status: "completed" },
    { id: "encours", created_at: "2026-10-05T07:30:00Z", status: "in_progress" },
    { id: "recent", created_at: "2026-10-05T05:40:54Z", status: "completed" },
    { id: "milieu", created_at: "2026-10-04T23:10:37Z", status: "completed" },
  ];
  assert.equal(runPlusRecent(runs, (r) => r.status === "completed").id, "recent");
  assert.equal(runPlusRecent(runs).id, "encours");
  assert.equal(runPlusRecent([]), null);
  assert.equal(runPlusRecent(undefined), null);
});

// ─── Le chien de garde extérieur : le battement de la veille du pilotage (2026-11-06) ───
// Mutation éprouvée à la main : `signalBattement` qui rend « ok » sur un battement
// périmé → ce test rougit.
import { signalBattement, SQL as SQL_VEILLE } from "../../scripts/veille-production.mjs";
test("SQL du battement : SELECT seuls, sur la marque système uniquement", () => {
  assert.match(SQL_VEILLE.battement, /event = 'pilotage_battement' and user_id = 'systeme:pilotage'/);
  assert.match(SQL_VEILLE.battements24h, /interval '24 hours'/);
});
test("signalBattement : périmé = ALERTE avec le geste ; absent = attention ; lecture en échec = inconnu", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const lectures = { sante: "ok", signalements: "ok", github: "ok", parcours: "ok" };
  const perime = signalBattement({ ligne: { created_at: new Date(now - 3 * 3600e3).toISOString(), properties: { lectures } }, n24: 60 }, now);
  assert.equal(perime.etat, "alert");
  assert.match(perime.texte, /la veille ne tourne plus/);
  assert.match(perime.geste, /pilotage_veille/);
  assert.equal(signalBattement({ ligne: null, n24: 0 }, now).etat, "warn");
  assert.equal(signalBattement({ ligne: { created_at: new Date(now - 5 * 60e3).toISOString(), properties: { lectures: { ...lectures, github: "ko" } } }, n24: 96 }, now).etat, "warn");
  const vivant = signalBattement({ ligne: { created_at: new Date(now - 5 * 60e3).toISOString(), properties: { lectures } }, n24: 96 }, now);
  assert.equal(vivant.etat, "ok");
  assert.match(vivant.texte, /96\/96 battements/);
  assert.equal(signalBattement({ erreur: "HTTP 500" }, now).etat, "unknown");
  assert.equal(signalBattement(undefined, now).etat, "unknown");
});
