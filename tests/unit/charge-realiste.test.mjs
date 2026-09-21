import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { optionsBanc, emailCapacite, DOMAINE_CAPACITE, STAGING_REF, LIMITES, Budget, comptesPourPalier, abonnements,
  partenaire, actionPrevue, pausePrevue, decalageInitial, statistiques, verdictPalier, Sondes,
  postPourLike, aimerEtRetirer, delaiFixture, DisponibiliteRealtime,
  PROFIL_REALTIME, LIKES_VISIBLES, compteurHead, pauseCompteurs, familleFrameRealtime, verdictAvecCompteurs } from "../../scripts/lib/charge-realiste.mjs";
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

test("les dix handlers V3 retirent uniquement les deux likes et gardent les filtres personnels", () => {
  const subscriptions = abonnements("compte-test");
  assert.equal(subscriptions.length, 10);
  assert.equal(new Set(subscriptions.map(s => s.table)).size, 9);
  const legacy = abonnements("compte-test", "legacy12");
  assert.equal(legacy.length, 12);
  assert.deepEqual(subscriptions, legacy.filter(s => s.table !== "post_likes"));
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
    assert.equal(etat.systemes.ok, 1); assert.equal(etat.handlers, 10);
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

test("system error invalide le CDC même si le canal reste ouvert et tous les bindings doivent correspondre", () => {
  const etat = new DisponibiliteRealtime(uidReady);
  for (const m of [joinDB, joinUser, systemReady]) etat.observer(m);
  etat.observer({ ...systemReady, payload: { extension: "postgres_changes", status: "error" } });
  assert.equal(etat.pret, false); assert.equal(etat.erreur, "REALTIME_CDC_ERREUR");
  assert.equal(etat.systemes.error, 1);
  const faux = structuredClone(joinDB); faux.payload.response.postgres_changes[0].table = "table_fausse";
  const invalide = new DisponibiliteRealtime(uidReady); invalide.observer(faux);
  assert.equal(invalide.erreur, "REALTIME_HANDLERS_NON_CONFIRMES");
});

test("le contrat du banc correspond aux bindings V3 réellement créés et aux constantes du produit", () => {
  const source = readFileSync(new URL("../../js/app-08-ui-modals-tour.js", import.meta.url), "utf8");
  const debut = source.indexOf("function _creerCanalDb(prive)"), fin = source.indexOf("// ---- FOLLOW / UNFOLLOW ----", debut);
  assert.ok(debut >= 0 && fin > debut);
  const observes = [];
  const channel = { on(type, binding) { assert.equal(type, "postgres_changes"); observes.push(JSON.parse(JSON.stringify(binding))); return this; }, subscribe() { return this; } };
  const ctx = { MY_UID: "contrat-uid", window: { PASSIO_REALTIME_V3: true }, supa: { channel: () => channel } };
  const creer = runInNewContext(source.slice(debut, fin) + "\n_creerCanalDb;", ctx);
  creer(true);
  assert.deepEqual(observes, abonnements("contrat-uid"), "le banc doit échouer si son profil diverge du vrai canal produit");
  const likes = readFileSync(new URL("../../js/app-03-posts-vlogs.js", import.meta.url), "utf8");
  for (const [nom, valeur] of [["POST_LIKE_REFRESH_MS", LIKES_VISIBLES.fraicheurMs],
    ["POST_LIKE_REFRESH_JITTER_MS", LIKES_VISIBLES.jitterMs], ["POST_LIKE_REFRESH_MAX_POSTS", LIKES_VISIBLES.maximum]]) {
    const declaration = likes.match(new RegExp(`const ${nom} = (\\d+);`));
    assert.ok(declaration, `autorité produit manquante : ${nom}`); assert.equal(Number(declaration[1]), valeur);
  }
});

test("legacy12 reste consultable hors ligne mais aucune exécution ne peut le choisir", async () => {
  assert.equal(optionsBanc(cible).profilRealtime, PROFIL_REALTIME);
  const plan = await executer(optionsBanc([...cible, "--profil-realtime", "legacy12"]));
  assert.equal(plan.plan, true); assert.equal(plan.profilRealtime, "legacy12");
  assert.throws(() => optionsBanc([...cible, "--profil-realtime", "legacy12", "--executer", "--sortie", "interdit.json"]), /LEGACY12_HORS_LIGNE/);
  assert.throws(() => optionsBanc([...cible, "--profil-realtime", "9"]), /PROFIL_REALTIME_INVALIDE/);
  const legacy = new DisponibiliteRealtime(uidReady, "legacy12");
  for (const message of [joinDB, joinUser, systemReady]) legacy.observer(message);
  assert.equal(legacy.pret, false, "dix bindings ne suffisent pas pour le contrat legacy douze");
  const actuel = new DisponibiliteRealtime(uidReady);
  const trop = structuredClone(joinDB);
  trop.payload.response.postgres_changes = abonnements(uidReady, "legacy12").map((a, id) => ({ ...a, id }));
  actuel.observer(trop); assert.equal(actuel.erreur, "REALTIME_HANDLERS_NON_CONFIRMES");
});

test("HEAD exige un total exact, y compris zéro ; succès vide ou total inconnu ne passent pas", () => {
  for (const [range, n] of [["*/0", 0], ["0-0/1", 1], ["0-999/1234", 1234], ["*/42", 42]]) {
    assert.equal(compteurHead(200, range), n); assert.equal(compteurHead(206, range), n);
  }
  for (const range of [null, "", "0-0/*", "0-1/-1", "0-1/1.5", "count=12", "*/9007199254740992"]) {
    assert.throws(() => compteurHead(200, range), /HEAD_COMPTE_INVALIDE/);
  }
  for (const status of [204, 400, 401, 403, 429, 500]) assert.throws(() => compteurHead(status, "*/1"), new RegExp(`HTTP_${status}`));
});

test("le vrai chemin HEAD porte le JWT lecteur, compte son appel et refuse un en-tête absent", async () => {
  const source = readFileSync(new URL("../../scripts/charge-realiste.mjs", import.meta.url), "utf8");
  const debut = source.indexOf("async function requete("), fin = source.indexOf("async function cadencer(", debut);
  let status = 200, range = "*/7"; const appels = [], mesures = [], budget = new Budget();
  const ctx = { performance, AbortController, setTimeout, clearTimeout, Buffer, compteurHead,
    phase: "mesure", stage: { taille: 25, page: 20 }, debut: Date.now(), arret: null,
    base: "https://staging.example.test", cleAnon: "anon-factice", cleService: "service-factice", controleurs: new Set(), mesures,
    octets: x => Buffer.byteLength(x), compter: q => budget.compter(q), attendreTableau: () => ({}),
    motifSur: e => e.message, URLSearchParams,
    fetch: async (url, opt) => { appels.push({ url, opt }); return new Response(null, { status, headers: range ? { "content-range": range } : {} }); },
  };
  const lire = runInNewContext(source.slice(debut, fin) + "\ncompterLikes;", ctx);
  assert.equal(await lire({ jwt: "lecteur-factice" }, "post-test"), 7);
  assert.equal(appels[0].opt.method, "HEAD");
  assert.equal(appels[0].opt.headers.Authorization, "Bearer lecteur-factice");
  assert.equal(appels[0].opt.headers.Prefer, "count=exact");
  const url = new URL(appels[0].url);
  assert.equal(url.searchParams.get("post_id"), "eq.post-test"); assert.equal(url.searchParams.get("select"), "post_id");
  assert.equal(budget.requetes, 1); assert.equal(mesures[0].ok, true); assert.equal(mesures[0].compteur, 7);
  assert.equal(mesures[0].octets, 0, "corps vide ne signifie ni requête ni en-têtes gratuits");
  range = null; await assert.rejects(lire({ jwt: "lecteur-factice" }, "post-test"), /HEAD_COMPTE_INVALIDE/);
  status = 403; await assert.rejects(lire({ jwt: "lecteur-factice" }, "post-test"), /HTTP_403/);
  assert.equal(budget.requetes, 3); assert.equal(mesures[1].ok, false); assert.equal(mesures[2].status, 403);
  assert.equal(ctx.controleurs.size, 0);
});

test("le vrai prévol maintient un like jusqu'à lecture du destinataire puis restaure le compteur", async () => {
  const source = readFileSync(new URL("../../scripts/charge-realiste.mjs", import.meta.url), "utf8");
  const debut = source.indexOf("async function prevolCompteurLikes()"), fin = source.indexOf("async function palier(", debut);
  const comptes = [{ id: "auteur", index: 0, jwt: "jwt-auteur" }, { id: "destinataire", index: 1, jwt: "jwt-destinataire" }];
  const journal = new Map(), etapes = []; let count = 1, invisible = false;
  const ctx = { comptes, postsFixture: [{ id: "fixture" }], postPourLike, mutationsLikes: journal,
    sauvegarder: () => {}, attendreTableau: () => ({}),
    compterLikes: async (compte, post) => { assert.equal(compte, comptes[1]); assert.equal(post, "fixture"); etapes.push(`HEAD:${count}`); return invisible ? 1 : count; },
    inserer: async (nom, table, cle, opt) => { assert.equal(opt.jwt, "jwt-auteur"); assert.equal(table, "post_likes"); assert.ok(journal.has("fixture:auteur")); count++; etapes.push("INSERT"); },
    rest: async (nom, table, params, opt) => { assert.equal(opt.methode, "DELETE"); assert.equal(opt.jwt, "jwt-auteur"); assert.equal(params.post_id, "eq.fixture"); assert.equal(params.user_id, "eq.auteur"); count--; etapes.push("DELETE"); return [{}]; },
  };
  const prevol = runInNewContext(source.slice(debut, fin) + "\nprevolCompteurLikes;", ctx);
  const result = await prevol();
  assert.deepEqual(etapes, ["HEAD:1", "INSERT", "HEAD:2", "DELETE", "HEAD:1"]);
  assert.deepEqual([result.avant, result.ajoute, result.retire], [1, 2, 1]); assert.equal(journal.size, 0);
  invisible = true; await assert.rejects(prevol(), /COMPTEUR_AJOUT_NON_VISIBLE/);
  assert.equal(count, 1); assert.equal(journal.size, 0, "le finally retire aussi l'ajout si sa visibilité est refusée");
});

test("les frames distinguent table/opération, broadcast et protocole sans journaliser de payload", () => {
  assert.equal(familleFrameRealtime({ event: "postgres_changes", payload: { data: { table: "posts", type: "INSERT", record: { secret: "interdit" } } } }), "postgres_changes:posts:INSERT");
  assert.equal(familleFrameRealtime({ event: "postgres_changes", payload: { data: { table: "post_likes", type: "DELETE" } } }), "postgres_changes:post_likes:DELETE");
  assert.equal(familleFrameRealtime({ event: "broadcast", payload: { event: "INSERT" } }), "broadcast:INSERT");
  assert.equal(familleFrameRealtime({ event: "phx_reply" }), "protocole:phx_reply");
});

test("les HEAD rapides ne diluent pas un p95 historique rouge ; leur propre coût est aussi bloquant", () => {
  const bon = statistiques([{ ok: true, ms: 50 }]), lent = statistiques([{ ok: true, ms: 1001 }]), vide = statistiques([]);
  const base = { http: bon, parcours: bon, realtime: bon, messages: bon, connectes: 25, attendus: 25, termine: true };
  assert.equal(verdictAvecCompteurs(base, bon, bon).ok, true);
  assert.ok(verdictAvecCompteurs({ ...base, http: lent }, bon, bon).motifs.includes("P95_HTTP_SUP_1000_MS"));
  assert.ok(verdictAvecCompteurs(base, lent, bon).motifs.includes("P95_COMPTEURS_SUP_1000_MS"));
  assert.ok(verdictAvecCompteurs(base, bon, lent).motifs.includes("P95_COMPTEURS_SUP_1000_MS"));
  assert.ok(verdictAvecCompteurs(base, vide, vide).motifs.includes("COMPTEURS_VISIBLES_NON_EXERCES"));
  assert.ok(verdictAvecCompteurs({ ...base, posts: statistiques([{ ok: true, ms: 2001 }]) }, bon, bon).motifs.includes("P95_PUBLICATIONS_SUP_2000_MS"));
  assert.ok(verdictAvecCompteurs({ ...base, posts: vide }, bon, bon).motifs.includes("PUBLICATIONS_SOUS_CHARGE_NON_VALIDEES"));
});

test("le vrai minuteur lit au plus trois compteurs séquentiels et garde 15–16,5 s entre débuts", async () => {
  const source = readFileSync(new URL("../../scripts/charge-realiste.mjs", import.meta.url), "utf8");
  const debut = source.indexOf("async function cycleCompteursVisibles("), fin = source.indexOf("function convPour(", debut);
  let now = 0, enVol = 0, maximumEnVol = 0; const appels = [], mesures = [];
  const ctx = { LIKES_VISIBLES, pauseCompteurs, decalageInitial, o: { graine: 20260920 }, arret: null,
    phase: "mesure", stage: { taille: 25, page: 20 }, mesures, performance: { now: () => now },
    sleep: async ms => { assert.ok(ms >= 0); now += ms; }, motifSur: e => e.message,
    stop: motif => { ctx.arret = motif; },
    compterLikes: async (compte, id) => {
      enVol++; maximumEnVol = Math.max(maximumEnVol, enVol); appels.push({ id, now });
      await Promise.resolve(); now += 10; enVol--; return 1;
    },
  };
  const surveiller = runInNewContext(source.slice(debut, fin) + "\nsurveillerCompteurs;", ctx);
  const compte = { index: 0, postsVisibles: ["p1", "p2", "p3", "p4", "p5"] };
  await surveiller(compte, 0, 60000);
  assert.equal(maximumEnVol, 1); assert.ok(appels.length >= 9);
  assert.equal(mesures.length * 3, appels.length);
  assert.deepEqual([...new Set(appels.map(a => a.id))], ["p1", "p2", "p3"]);
  for (let i = 3; i < appels.length; i += 3) {
    const ecart = appels[i].now - appels[i - 3].now;
    assert.ok(ecart >= 15000 && ecart <= 16500);
  }
  assert.ok(appels.every(a => a.now < 60000));
  const avant = appels.length; ctx.compterLikes = async () => { throw new Error("HTTP_403"); };
  now = 0; await surveiller(compte, 0, 60000);
  assert.equal(ctx.arret, "HTTP_403"); assert.equal(appels.length, avant);
  assert.equal(mesures.at(-1).ok, false); assert.equal(mesures.at(-1).lectures, 0);
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
