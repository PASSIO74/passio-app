import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { optionsBanc, emailCapacite, DOMAINE_CAPACITE, STAGING_REF, LIMITES, Budget, comptesPourPalier, abonnements,
  partenaire, actionPrevue, pausePrevue, statistiques, verdictPalier, Sondes } from "../../scripts/lib/charge-realiste.mjs";
import { executer } from "../../scripts/charge-realiste.mjs";

const cible = ["--projet", STAGING_REF];
test("le sélecteur réel de purge E2E ignore les comptes du domaine capacité, même pendant la CI", async () => {
  const campagne = "capacite_1789931280746_b9ae922b";
  const email = emailCapacite(campagne, 199);
  assert.equal(email, `${campagne}_199@passio-capacite.test`);
  assert.equal(DOMAINE_CAPACITE, "passio-capacite.test");
  assert.throws(() => emailCapacite(campagne, 200), /IDENTITE_CAPACITE/);
  assert.throws(() => emailCapacite("une_autre_campagne", 0), /IDENTITE_CAPACITE/);
  const source = readFileSync(new URL("../../scripts/purge-e2e-rest.js", import.meta.url), "utf8");
  const comptesSource = readFileSync(new URL("../e2e/compte-e2e.js", import.meta.url), "utf8");
  const domaine = /const DOMAINE_E2E = "([^"]+)"/.exec(comptesSource)?.[1];
  const debut = source.indexOf("async function comptesE2E(cfg)"), fin = source.indexOf("/** Filtre PostgREST", debut);
  assert.ok(domaine && debut >= 0 && fin > debut, "le sélecteur doit être extrait, jamais remplacer sa règle par une copie");
  let appels = 0;
  // Seulement la fonction de sélection du vrai script, jamais son IIFE de
  // suppression. fetch est local et rend trois fixtures, sans aucun réseau.
  const selection = await runInNewContext(source.slice(debut, fin) + '\ncomptesE2E({ url: "https://test.invalid" });', {
    DOMAINE_E2E: domaine, entetes: () => ({}),
    fetch: async () => { appels++; return { ok: true, json: async () => ({ users: [
      { id: "capacite", email }, { id: "e2e", email: `e2e_test@${domaine}` },
      { id: "autre", email: "personne@example.test" },
    ] }) }; },
  });
  assert.deepEqual(Array.from(selection), ["e2e"]);
  assert.equal(appels, 1);
});

test("la production, les autres projets et les plafonds excessifs sont refusés avant tout réseau", async () => {
  for (const ref of ["njkiyoklssvefstljemx", "aaaaaaaaaaaaaaaaaaaa", "", STAGING_REF + ".evil"]) {
    assert.throws(() => optionsBanc(["--projet", ref]), /CIBLE_|VALEUR_/);
  }
  for (const args of [["--paliers", "201"], ["--paliers", "25,25"], ["--paliers", "100,50"],
    ["--duree", "180"], ["--duree", "161"], ["--duree", "0"], ["--duree", "NaN"], ["--executer"], ["--scenario", "prod"]]) {
    assert.throws(() => optionsBanc([...cible, ...args]));
  }
  await assert.rejects(executer({ ...optionsBanc(cible), projet: "njkiyoklssvefstljemx" }), /CIBLE_/);
  assert.equal(optionsBanc([...cible, "--duree", "160"]).duree, 160);
});

test("le mode plan et le plan de prévol ne lisent aucune clé et n'appellent pas fetch", async () => {
  const original = globalThis.fetch; let appels = 0;
  globalThis.fetch = async () => { appels++; throw new Error("RESEAU_INTERDIT"); };
  try {
    const plan = await executer(optionsBanc(cible));
    assert.equal(plan.plan, true); assert.equal(plan.comptesDistincts, 200);
    assert.deepEqual(plan.pages, [60, 20]);
    const prevol = await executer(optionsBanc([...cible, "--prevol"]));
    assert.equal(prevol.comptesDistincts, 2); assert.equal(appels, 0);
  } finally { globalThis.fetch = original; }
});

test("200 personnes exigent 200 identités ; impossible de recycler un pool de 100 comptes", () => {
  const cent = Array.from({ length: 100 }, (_, i) => ({ id: `personne_${i}` }));
  assert.throws(() => comptesPourPalier(cent, 200), /COMPTES_NON_DISTINCTS/);
  assert.throws(() => comptesPourPalier([...cent, ...cent], 200), /COMPTES_NON_DISTINCTS/);
  const deuxCents = Array.from({ length: 200 }, (_, i) => ({ id: `personne_${i}` }));
  assert.equal(new Set(comptesPourPalier(deuxCents, 200).map(c => c.id)).size, 200);
});

test("les partenaires de messagerie sont distincts et connectés même au palier impair 25", () => {
  for (const taille of [2, 25, 50, 100, 200]) for (let i = 0; i < taille; i++) {
    const autre = partenaire(i, taille);
    assert.notEqual(autre, i); assert.ok(autre >= 0 && autre < taille);
  }
  assert.equal(partenaire(24, 25), 0);
});

test("les 12 handlers V3 sont séparés des tables et filtrent les données personnelles", () => {
  const subscriptions = abonnements("compte-test");
  assert.equal(subscriptions.length, 12);
  assert.equal(new Set(subscriptions.map(s => s.table)).size, 10);
  assert.equal(subscriptions.some(s => ["conv_messages", "telemetry_events"].includes(s.table)), false);
  for (const table of ["conv_members", "notifications"]) assert.equal(subscriptions.find(s => s.table === table).filter, "user_id=eq.compte-test");
});

test("les scénarios comparés ont les mêmes pauses ; la lecture ne produit pas d'écriture mesurée", () => {
  const ecritures = new Set(["message", "publier", "aimer", "historique"]);
  const observees = new Set();
  for (let i = 0; i < 200; i++) for (let t = 0; t < 12; t++) {
    const pause = pausePrevue(123, i, t);
    assert.ok(pause >= 5000 && pause <= 10000);
    assert.equal(pause, pausePrevue(123, i, t));
    assert.ok(!ecritures.has(actionPrevue(i, t, "lecture")));
    observees.add(actionPrevue(i, t));
  }
  for (const action of ecritures) assert.ok(observees.has(action));
});

test("un seul budget cumule préparation, variantes et paliers, avec réserve nettoyage séparée", () => {
  let now = 0; const b = new Budget({ ...LIMITES, octets: 100, messagesRealtime: 10, requetes: 5 }, () => now);
  b.compter({ octets: 40, requetes: 1 }); b.compter({ octets: 59, requetes: 1 });
  assert.equal(b.resume().octets, 99);
  assert.throws(() => b.compter({ octets: 1 }), /BUDGET_OCTETS/);
  assert.throws(() => b.verifier(), /BUDGET_OCTETS/);
  const rt = new Budget({ ...LIMITES, messagesRealtime: 2 }); rt.compter({ messagesRealtime: 1 });
  assert.throws(() => rt.compter({ messagesRealtime: 1 }), /BUDGET_REALTIME/);
  const temps = new Budget({ ...LIMITES, dureeCampagneMs: 10 }, () => now); now = 10;
  assert.throws(() => temps.verifier(), /BUDGET_DUREE/);
  assert.equal(LIMITES.octets + LIMITES.octetsNettoyage, 200_000_000);
});

test("le p95 toutes tentatives révèle les erreurs lentes, le vide ne donne pas un palier vert", () => {
  const m = statistiques([{ ok: true, ms: 10, octets: 100 }, { ok: false, ms: 12000, motif: "HTTP_503", octets: 30 }]);
  assert.equal(m.p95Ms, 12000); assert.equal(m.p95SuccesMs, 10); assert.equal(m.tauxErreur, .5); assert.equal(m.octets, 130);
  const vide = statistiques([]);
  assert.equal(vide.p95Ms, null); assert.equal(vide.tauxErreur, null);
  assert.equal(verdictPalier({ http: vide, parcours: vide, realtime: vide, connectes: 25, attendus: 25, termine: true }).ok, false);
  const bon = statistiques([{ ok: true, ms: 20 }]);
  assert.equal(verdictPalier({ http: bon, parcours: bon, realtime: vide, connectes: 25, attendus: 25, termine: true }).ok, false);
  assert.equal(verdictPalier({ http: bon, parcours: bon, realtime: vide, connectes: 25, attendus: 25, termine: true, scenario: "lecture" }).ok, true);
  assert.equal(verdictPalier({ http: bon, parcours: bon, realtime: bon, connectes: 24, attendus: 25, termine: true }).ok, false);
});

test("la sonde armée avant POST capte une livraison précoce sans stocker le fanout étranger", async () => {
  let now = 10; const sondes = new Sondes({ delai: 100, maintenant: () => now });
  const probe = sondes.armer("dest:message:1"); now = 15;
  sondes.recevoir("autre:message:1"); assert.equal(sondes.attentes.size, 1);
  sondes.recevoir("dest:message:1");
  assert.deepEqual(await probe.promise, { ok: true, motif: null, ms: 5 });
  assert.equal(sondes.attentes.size, 0);
  const annulee = sondes.armer("dest:message:2"); annulee.annuler();
  assert.equal((await annulee.promise).motif, "ECRITURE_ECHOUEE");
  const fermee = sondes.armer("dest:message:3"); sondes.fermer();
  assert.equal((await fermee.promise).motif, "REALTIME_FERME");
});

test("recevoir des posts ne valide pas une messagerie qui n'a pas été exercée sous charge", () => {
  const bon = statistiques([{ ok: true, ms: 20 }]), vide = statistiques([]);
  const base = { http: bon, parcours: bon, realtime: bon, connectes: 25, attendus: 25, termine: true };
  const sansMessage = verdictPalier({ ...base, messages: vide });
  assert.equal(sansMessage.ok, false);
  assert.ok(sansMessage.motifs.includes("MESSAGERIE_SOUS_CHARGE_NON_VALIDEE"));
  assert.equal(verdictPalier({ ...base, messages: bon }).ok, true);
  const lent = statistiques([{ ok: true, ms: 2100 }]);
  assert.ok(verdictPalier({ ...base, messages: lent }).motifs.includes("P95_MESSAGES_SUP_2000_MS"));
});

test("un broadcast absent expire et reste une erreur, sans faux succès HTTP", async () => {
  const sondes = new Sondes({ delai: 5 });
  const result = await sondes.armer("dest:message:absent").promise;
  assert.equal(result.ok, false); assert.equal(result.motif, "REALTIME_TIMEOUT");
  assert.equal(sondes.attentes.size, 0);
});
