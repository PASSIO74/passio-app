import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { optionsBanc, emailCapacite, DOMAINE_CAPACITE, STAGING_REF, LIMITES, Budget, comptesPourPalier, abonnements,
  partenaire, actionPrevue, pausePrevue, statistiques, verdictPalier, Sondes,
  postPourLike, aimerEtRetirer, delaiFixture, DisponibiliteRealtime } from "../../scripts/lib/charge-realiste.mjs";
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

test("page 20 seule reste une variante dans le plan exécutable, les autres séquences sont refusées", async () => {
  assert.deepEqual(optionsBanc(cible).pages, [60, 20]);
  assert.deepEqual(optionsBanc([...cible, "--pages", "60,20"]).pages, [60, 20]);
  const original = globalThis.fetch; let appels = 0;
  globalThis.fetch = async () => { appels++; throw new Error("RESEAU_INTERDIT"); };
  try {
    const plan = await executer(optionsBanc([...cible, "--pages", "20", "--paliers", "200", "--duree", "90"]));
    assert.equal(plan.plan, true);
    assert.deepEqual(plan.pages, [20]);
    assert.deepEqual(plan.paliers, [200]);
    assert.deepEqual(plan.limites, LIMITES);
    assert.equal(plan.comptesDistincts, 200);
    assert.equal(appels, 0);
  } finally { globalThis.fetch = original; }
  for (const pages of ["60", "20,60", "20,20", "60,20,20", "10", "020", "20 ", "60, 20"]) {
    assert.throws(() => optionsBanc([...cible, "--pages", pages]), /PAGES_INVALIDES/);
  }
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

const uidReady = "user-ready";
const joinDB = { topic: "realtime:realtime:db", event: "phx_reply", ref: "1", payload: { status: "ok", response: {
  postgres_changes: abonnements(uidReady).map((a, id) => ({ ...a, id })),
} } };
const joinUser = { topic: `realtime:user:${uidReady}`, event: "phx_reply", ref: "2", payload: { status: "ok" } };
const systemReady = { topic: "realtime:realtime:db", event: "system", payload: { extension: "postgres_changes", status: "ok" } };

test("les deux phx_reply ne donnent pas CDC prêt ; system peut précéder ou suivre les réponses", () => {
  for (const ordre of [[joinDB, joinUser, systemReady], [systemReady, joinDB, joinUser], [joinUser, systemReady, joinDB]]) {
    const etat = new DisponibiliteRealtime(uidReady);
    assert.equal(etat.observer(ordre[0]), false);
    assert.equal(etat.observer(ordre[1]), false);
    assert.equal(etat.observer(ordre[2]), true);
    assert.equal(etat.systemes.ok, 1); assert.equal(etat.handlers, 12);
  }
});

test("un signal d'un autre topic ou d'une ancienne socket ne valide pas la nouvelle connexion", () => {
  const ancien = new DisponibiliteRealtime(uidReady), nouveau = new DisponibiliteRealtime(uidReady);
  for (const m of [joinDB, joinUser, systemReady]) ancien.observer(m);
  nouveau.observer(joinDB); nouveau.observer(joinUser);
  nouveau.observer({ ...systemReady, topic: joinUser.topic });
  assert.equal(ancien.pret, true); assert.equal(nouveau.pret, false);
  assert.equal(nouveau.expirer(), "REALTIME_CDC_NON_PRET");
  assert.equal(nouveau.observer(systemReady), false, "une échéance expirée ne devient pas verte tardivement");
});

test("system error invalide le CDC même si le canal reste ouvert et les 12 bindings doivent correspondre", () => {
  const etat = new DisponibiliteRealtime(uidReady);
  for (const m of [joinDB, joinUser, systemReady]) etat.observer(m);
  etat.observer({ ...systemReady, payload: { extension: "postgres_changes", status: "error" } });
  assert.equal(etat.pret, false); assert.equal(etat.erreur, "REALTIME_CDC_ERREUR");
  assert.equal(etat.systemes.error, 1);
  const faux = structuredClone(joinDB); faux.payload.response.postgres_changes[0].table = "table_fausse";
  const invalide = new DisponibiliteRealtime(uidReady); invalide.observer(faux);
  assert.equal(invalide.erreur, "REALTIME_12_HANDLERS_NON_CONFIRMES");
});

test("un like mesuré restaure exactement les fixtures ; un échec de DELETE laisse sa clé au journal", async () => {
  const posts = Array.from({ length: 120 }, (_, i) => ({ id: `post_${i}` }));
  for (const n of [25, 50, 100, 200]) {
    const base = new Set(posts.map((p, i) => `${p.id}:compte_${(i + 1) % n}`));
    const avant = [...base].sort(), journal = new Map();
    for (let i = 0; i < n; i += 4) for (let tour = 0; tour < 24; tour++) {
      const cle = { post_id: postPourLike(posts, i, tour, n), user_id: `compte_${i}` };
      await aimerEtRetirer(cle, journal,
        async c => { const k = `${c.post_id}:${c.user_id}`; assert.ok(!base.has(k), "ne jamais supprimer ensuite un like de fixture"); base.add(k); },
        async c => { assert.equal(base.delete(`${c.post_id}:${c.user_id}`), true); });
    }
    assert.deepEqual([...base].sort(), avant); assert.equal(journal.size, 0);
    const residu = { post_id: posts[0].id, user_id: "un_acteur" };
    await assert.rejects(aimerEtRetirer(residu, journal,
      async c => base.add(`${c.post_id}:${c.user_id}`), async () => { throw new Error("DELETE_REFUSE"); }), /DELETE_REFUSE/);
    assert.deepEqual([...journal.values()], [residu]);
  }
});

test("la vraie réinitialisation ne réécrit aucun like intact et conserve l'empreinte du fil", async () => {
  const source = readFileSync(new URL("../../scripts/charge-realiste.mjs", import.meta.url), "utf8");
  const debut = source.indexOf("async function reinitialiser()"), fin = source.indexOf("async function prevol()", debut);
  assert.ok(debut >= 0 && fin > debut);
  const appels = [], mutationsLikes = new Map(), data = { posts: ["fixture_1"], likes: 1, commentaires: 1, reactions: 1, profils: 1 };
  const ctx = { mutationsPosts: new Set(), mutationsLikes, convs: [], comptes: [{ id: "acteur" }, { id: "fixture_auteur" }], createHash,
    postsFixture: [{ id: "fixture_1" }], fixtureLikes: [{ post_id: "fixture_1", user_id: "fixture_auteur" }],
    liste: ids => `in.(${ids.join(",")})`, attendreTableau: () => ({}),
    rest: async () => ctx.fixtureLikes,
    changerPhase: () => {}, fil: async () => data,
    supprimer: async (...args) => { appels.push(args); return []; },
    inserer: async () => { throw new Error("REINSERTION_FIXTURE_INTERDITE"); },
  };
  const reset = runInNewContext(source.slice(debut, fin) + "\nreinitialiser;", ctx);
  const avant = await reset(), apres = await reset();
  assert.equal(avant, apres); assert.equal(appels.length, 0);
  mutationsLikes.set("fixture_1:acteur", { post_id: "fixture_1", user_id: "acteur" });
  assert.equal(await reset(), avant);
  assert.equal(appels.length, 1); assert.equal(appels[0][1], "post_likes");
  assert.equal(appels[0][2].post_id, "eq.fixture_1"); assert.equal(appels[0][2].user_id, "eq.acteur");
  assert.equal(mutationsLikes.size, 0);
  ctx.fixtureLikes[0].user_id = "un_autre_compte";
  await assert.rejects(reset(), /JEU_LIKES_FIXTURE_MODIFIE/, "un simple compte total identique ne suffit pas");
});

test("la vraie suppression conserve le scope et utilise chaque clé composite ; lecture refusée ou trop large interdit DELETE", async () => {
  const source = readFileSync(new URL("../../scripts/charge-realiste.mjs", import.meta.url), "utf8");
  const debut = source.indexOf("async function supprimer(nom, table, params, min = 0)"), fin = source.indexOf("async function obtenirCles()", debut);
  assert.ok(debut >= 0 && fin > debut);
  for (const [table, cle] of [["post_likes", { post_id: "post_campagne", user_id: "acteur" }],
    ["conv_reads", { conv_id: "conv_campagne", user_id: "acteur" }]]) {
    const appels = [], sourceRows = [cle]; let erreurLecture = false;
    const ctx = { attendreTableau: () => ({}),
      cadencer: async (...args) => appels.push({ cadence: args }),
      rest: async (nom, cibleTable, params, opt = {}) => {
        appels.push({ methode: opt.methode || "GET", table: cibleTable, params });
        if (opt.methode === "DELETE") return [cle];
        if (erreurLecture) throw new Error("LECTURE_REFUSEE");
        return sourceRows;
      },
    };
    const supprimer = runInNewContext(source.slice(debut, fin) + "\nsupprimer;", ctx);
    const colonne = Object.keys(cle)[0], scope = { [colonne]: `in.(${cle[colonne]},autre_fixture)`, created_at: "gte.2026-09-20" };
    await supprimer("nettoyage", table, scope);
    assert.equal(appels[0].methode, "GET"); assert.equal(appels[0].params[colonne], scope[colonne]);
    assert.equal(appels[0].params.created_at, scope.created_at);
    assert.deepEqual(Array.from(appels[1].cadence), [table, "DELETE"]);
    const deletion = appels[2]; assert.equal(deletion.methode, "DELETE");
    assert.equal(deletion.params[colonne], `eq.${cle[colonne]}`);
    assert.equal(deletion.params.user_id, "eq.acteur"); assert.equal(deletion.params.created_at, scope.created_at);
    appels.length = 0; sourceRows.length = 1000; sourceRows.fill(cle);
    await assert.rejects(supprimer("nettoyage", table, scope), /NETTOYAGE_PERIMETRE_TROP_GRAND/);
    assert.equal(appels.filter(a => a.methode === "DELETE").length, 0);
    appels.length = 0; erreurLecture = true;
    await assert.rejects(supprimer("nettoyage", table, scope), /LECTURE_REFUSEE/);
    assert.equal(appels.filter(a => a.methode === "DELETE").length, 0);
  }
});

test("la cadence hors mesure prévoit le fanout de deux générations et ne réécrit pas les limites serveur", () => {
  assert.equal(delaiFixture("post_likes", "POST", 0), 50);
  for (const n of [25, 50, 100, 200]) {
    const intervalle = delaiFixture("post_likes", "DELETE", n);
    assert.ok(1000 / intervalle <= 20);
    assert.ok(2 * n * 1000 / intervalle <= 80);
    assert.equal(delaiFixture("conv_reads", "DELETE", n), intervalle);
  }
  assert.equal(delaiFixture("posts", "DELETE", 200), 50, "le chemin V3 écoute INSERT sur posts, pas DELETE");
});
