// Verrous des accusés de réception (supabase/functions/_shared/reception.js).
// Le fichier testé est CELUI que Deno charge en production. `node --test tests/unit/`.
// Mutations éprouvées à la main : compter un accusé de pid inconnu → ② rougit ;
// juger « non reçue » avant le délai → ③ rougit ; compter un rappel en attente
// dans le dénominateur → ⑤ rougit ; une adresse d'accusé hors forme → ⑦ rougit.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bilanReception, ligneReception, descripteurAccuse, avecAccuse, pidValide, pidNeuf, serviceDe, pidsEnvoi, essaiDu, heureParis,
  DELAI_ACCUSE_MS, JUGEMENT_MAX_MS, MIN_RAPPELS, EVT_ENVOI, TYPE_ACCUSE, ACTION_ACCUSE, SERVICES, PAQUET_RAPPELS, ESSAI_INTERVALLE_MS, FENETRE_ESSAI,
} from "../../supabase/functions/_shared/reception.js";

const T = Date.parse("2026-11-06T21:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
/** Une alerte telle que sonnerPilote la note : un pid PAR APPAREIL. */
const alerte = (il_y_a, appareils = [[P1, "chrome", true]], mesure = "ok") => ({ created_at: iso(T - il_y_a),
  properties: { genre: "pilotage", mesure, acceptes: appareils.filter((a) => a[2]).length, appareils: appareils.map(([pid, service, accepte]) => ({ pid, service, accepte })) } });
const accuse = (pid, il_y_a) => ({ pid, received_at: iso(T - il_y_a) });

test("① noms et formes : un pid est un uuid ; un pid neuf l'est ; les constantes ne bougent pas en silence", () => {
  assert.equal(EVT_ENVOI, "push_envoye");
  assert.equal(TYPE_ACCUSE, "push");
  assert.equal(ACTION_ACCUSE, "recu");
  assert.ok(pidValide(P1));
  assert.ok(pidValide(pidNeuf()));
  assert.notEqual(pidNeuf(), pidNeuf());
  for (const x of [null, "", "abc", P1 + "x", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".toUpperCase(), 42]) assert.equal(pidValide(x), false, String(x));
});

test("② « reçue » PAR APPAREIL : l'accusé de chaque pid envoyé compte, avec son délai ; un accusé de pid INCONNU ne compte pour rien", () => {
  const b = bilanReception({ envois: [alerte(30 * 60e3, [[P1, "chrome", true], [P2, "edge", true]])],
    accuses: [accuse(P2, 30 * 60e3 - 4000), accuse(P3, 60e3), { pid: "pas-un-uuid", received_at: iso(T) }], maintenant: T });
  assert.equal(b.derniereAlerte.etat, "recue");
  assert.equal(b.derniereAlerte.recus, 1);
  assert.equal(b.derniereAlerte.acceptes, 2);
  assert.equal(b.derniereAlerte.delaiMs, 4000);
  assert.deepEqual(b.derniereAlerte.appareils, [{ service: "chrome", recu: false, delaiMs: null }, { service: "edge", recu: true, delaiMs: 4000 }],
    "on sait LEQUEL s'est tu : le PC qui accuse ne cache plus le téléphone muet");
  assert.equal(b.accusesIgnores, 2, "un pid que nous n'avons pas envoyé n'est la preuve de rien");
  // Dix accusés du même appareil : un appareil, jamais « reçue sur 10 ».
  const trop = bilanReception({ envois: [alerte(30 * 60e3)], accuses: Array.from({ length: 10 }, (_, i) => accuse(P1, 20 * 60e3 - i)), maintenant: T });
  assert.equal(trop.derniereAlerte.recus, 1);
  // Un appareil REFUSÉ par le service de notification n'est pas attendu.
  const refus = bilanReception({ envois: [alerte(30 * 60e3, [[P1, "chrome", true], [P2, "apple", false]])], accuses: [accuse(P1, 29 * 60e3)], maintenant: T });
  assert.equal(refus.derniereAlerte.acceptes, 1);
  assert.equal(refus.derniereAlerte.appareils.length, 1);
});

test("③ sans accusé : « en attente » pendant le délai, « non reçue » après, « ancienne » au-delà de 48 h — jamais perdue faute de télémétrie", () => {
  assert.equal(bilanReception({ envois: [alerte(DELAI_ACCUSE_MS - 1000)], maintenant: T }).derniereAlerte.etat, "en_attente");
  assert.equal(bilanReception({ envois: [alerte(DELAI_ACCUSE_MS + 1000)], maintenant: T }).derniereAlerte.etat, "non_recue");
  assert.equal(bilanReception({ envois: [alerte(JUGEMENT_MAX_MS + 1000)], maintenant: T }).derniereAlerte.etat, "ancienne");
  assert.equal(bilanReception({ envois: [alerte(DELAI_ACCUSE_MS + 1000, [[P1, "chrome", false]])], maintenant: T }).derniereAlerte.etat, "aucun_appareil");
  assert.equal(bilanReception({ maintenant: T }).derniereAlerte.etat, "aucune");
});

test("④ c'est la DERNIÈRE alerte qui est jugée, pas la première reçue", () => {
  const b = bilanReception({ envois: [alerte(5 * 3600e3, [[P1, "chrome", true]]), alerte(30 * 60e3, [[P2, "chrome", true]])], accuses: [accuse(P1, 5 * 3600e3 - 3000)], maintenant: T });
  assert.equal(b.derniereAlerte.etat, "non_recue", "l'alerte d'il y a 5 h a été reçue, celle d'il y a 30 min non");
});

test("⑤ rappels : un taux sur 24 h, les envois encore dans le délai attendent hors du dénominateur, « trop peu » sous le minimum", () => {
  const pids = Array.from({ length: 8 }, (_, i) => `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`);
  const envois = [
    { created_at: iso(T - 2 * 3600e3), properties: { genre: "rappel", pids: pids.slice(0, 6), acceptes: 6 } },
    { created_at: iso(T - 2 * 60e3), properties: { genre: "rappel", pids: pids.slice(6), acceptes: 2 } },
    { created_at: iso(T - 30 * 3600e3), properties: { genre: "rappel", pids: ["44444444-4444-4444-8444-444444444444"], acceptes: 1 } },
  ];
  const accuses = pids.slice(0, 5).map((p) => accuse(p, 2 * 3600e3 - 5000));
  const b = bilanReception({ envois, accuses, maintenant: T });
  assert.deepEqual(b.rappels, { etat: "mesure", envoyes: 6, recus: 5, enAttente: 2, taux: 5 / 6 }, "hors des 24 h : pas compté ; dans le délai : en attente");
  const peu = bilanReception({ envois: [{ created_at: iso(T - 3600e3), properties: { genre: "rappel", pids: pids.slice(0, MIN_RAPPELS - 1) } }], maintenant: T });
  assert.equal(peu.rappels.etat, "insuffisant");
  assert.equal(peu.rappels.taux, undefined, "jamais un taux sur trop peu");
});

test("⑥ la ligne « À faire » : seulement pour une alerte non reçue ou sans appareil — jamais pour une alerte reçue, en attente ou ancienne", () => {
  const nr = ligneReception(bilanReception({ envois: [alerte(DELAI_ACCUSE_MS + 1000)], maintenant: T }));
  assert.match(nr.titre, /aucun appareil/);
  assert.match(nr.reference, /ne sait pas encore accuser/, "la cause bénigne connue est dite");
  assert.ok(ligneReception(bilanReception({ envois: [alerte(DELAI_ACCUSE_MS + 1000, [[P1, "chrome", false]])], maintenant: T })));
  for (const etat of ["recue", "en_attente", "ancienne", "aucune"]) {
    assert.equal(ligneReception({ derniereAlerte: { etat, le: iso(T), acceptes: 1, recus: 1 } }), null, etat);
  }
  assert.equal(ligneReception(null), null);
});

test("⑦ l'adresse de l'accusé : l'URL d'un projet Supabase et une clé de forme JWT, sinon RIEN — et la charge ne change pas sans elle", () => {
  const cle = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl";
  assert.deepEqual(descripteurAccuse("https://njkiyoklssvefstljemx.supabase.co/", cle), { u: "https://njkiyoklssvefstljemx.supabase.co", k: cle });
  for (const u of ["", "http://njkiyoklssvefstljemx.supabase.co", "https://evil.example", "https://njkiyoklssvefstljemx.supabase.co.evil.example", "https://njkiyoklssvefstljemx.supabase.co/rest"]) {
    assert.equal(descripteurAccuse(u, cle), null, u);
  }
  assert.equal(descripteurAccuse("https://njkiyoklssvefstljemx.supabase.co", "pas une clé"), null);
  const ack = descripteurAccuse("https://njkiyoklssvefstljemx.supabase.co", cle);
  assert.deepEqual(avecAccuse({ type: "pilotage", titre: "x" }, P1, ack), { type: "pilotage", titre: "x", pid: P1, ack });
  assert.deepEqual(avecAccuse({ type: "pilotage" }, P1, null), { type: "pilotage" }, "sans adresse, pas de pid");
  assert.deepEqual(avecAccuse({ type: "pilotage" }, "x", ack), { type: "pilotage" }, "un pid hors forme ne part pas");
});

test("⑧ une lecture des rappels qui touche un plafond (un pid NOYÉ de faux accusés) ne donne PAS de taux — et ne touche pas l'alerte", () => {
  const pids = Array.from({ length: 8 }, (_, i) => `55555555-5555-4555-8555-${String(i).padStart(12, "0")}`);
  const envois = [alerte(30 * 60e3), { created_at: iso(T - 2 * 3600e3), properties: { genre: "rappel", pids } }];
  const b = bilanReception({ envois, accuses: [accuse(P1, 29 * 60e3), ...pids.map((p) => accuse(p, 3600e3))], maintenant: T, tronqueRappels: true });
  assert.equal(b.rappels.etat, "partiel");
  assert.equal(b.rappels.taux, undefined, "jamais un taux sur une lecture incomplète");
  assert.equal(b.tronque, true);
  assert.equal(b.derniereAlerte.etat, "recue", "l'alerte se lit par SES pid : le flot sur un rappel ne la noie pas");
  assert.equal(bilanReception({ maintenant: T }).tronque, false);
  assert.ok(PAQUET_RAPPELS <= 20, "un pid noyé n'aveugle que son paquet");
});

test("⑨ « non mesurée » : une alerte partie sans adresse d'accusé, ou sans abonnements lisibles, le DIT — ni reçue, ni perdue, jamais calme", () => {
  for (const raison of ["sans_adresse", "abonnements_illisibles"]) {
    const b = bilanReception({ envois: [alerte(DELAI_ACCUSE_MS + 1000, [], raison)], maintenant: T });
    assert.deepEqual(b.derniereAlerte, { le: iso(T - DELAI_ACCUSE_MS - 1000), etat: "non_mesuree", raison });
    const l = ligneReception(b);
    assert.match(l.titre, /n'a pas pu être mesurée/);
    assert.match(l.reference, raison === "sans_adresse" ? /pas d'adresse d'accusé utilisable/ : /abonnements/);
  }
});

test("⑩ la famille du service d'un abonnement, lue dans l'hôte de son adresse — jamais qui ; toute famille a son libellé", () => {
  assert.equal(serviceDe("https://fcm.googleapis.com/fcm/send/abc"), "chrome");
  assert.equal(serviceDe("https://wns2-par02p.notify.windows.com/w/?token=x"), "edge");
  assert.equal(serviceDe("https://web.push.apple.com/QAbc"), "apple");
  assert.equal(serviceDe("https://updates.push.services.mozilla.com/wpush/v2/x"), "firefox");
  for (const x of ["https://fcm.googleapis.com.evil.example/x", "pas une url", null, "https://exemple.org/push"]) assert.equal(serviceDe(x), "autre", String(x));
  for (const k of ["chrome", "edge", "apple", "firefox", "autre"]) assert.equal(typeof SERVICES[k], "string");
  // Les pid d'une note : un par appareil ACCEPTÉ ou non (tous attendus pour la lecture), un par rappel.
  assert.deepEqual(pidsEnvoi(alerte(0, [[P1, "chrome", true], [P2, "edge", false]])), [P1, P2]);
  assert.deepEqual(pidsEnvoi({ properties: { genre: "rappel", pids: [P1, "x", P2] } }), [P1, P2]);
});

// ─── L'essai des alertes (2026-11-07) ───────────────────────────────────────
// Mutations éprouvées à la main : l'heure UTC au lieu de Paris → ⑪ rougit ;
// un intervalle de 6 jours → ⑪ rougit ; la fenêtre ouverte la nuit → ⑪ rougit.
test("⑪ l'essai est dû de JOUR à Paris (hiver comme été), seulement sans note d'envoi depuis 7 jours", () => {
  assert.equal(heureParis(Date.parse("2026-11-07T08:01:00Z")), 9, "hiver : UTC+1");
  assert.equal(heureParis(Date.parse("2026-07-07T07:30:00Z")), 9, "été : UTC+2");
  assert.equal(heureParis(Date.parse("2026-11-07T23:30:00Z")), 0, "minuit vaut 0, jamais 24");
  const jour = Date.parse("2026-11-07T10:00:00Z");   // 11 h à Paris
  assert.equal(essaiDu({ maintenant: jour }), true, "jamais d'alerte notée : un essai");
  assert.equal(essaiDu({ maintenant: jour, derniereNote: { created_at: new Date(jour - ESSAI_INTERVALLE_MS + 60e3).toISOString() } }), false, "une note de moins de 7 jours : rien");
  assert.equal(essaiDu({ maintenant: jour, derniereNote: { created_at: new Date(jour - ESSAI_INTERVALLE_MS).toISOString() } }), true, "7 jours sans note : un essai");
  assert.equal(essaiDu({ maintenant: jour, derniereNote: { created_at: "illisible" } }), true, "une date illisible ne fait pas taire l'essai");
  for (const iso of ["2026-11-07T07:59:00Z", "2026-11-07T19:00:00Z", "2026-11-07T23:30:00Z", "2026-07-07T06:59:00Z", "2026-07-07T18:00:00Z"]) {
    assert.equal(essaiDu({ maintenant: Date.parse(iso) }), false, "la nuit, jamais : " + iso);
  }
  assert.equal(essaiDu({ maintenant: Date.parse("2026-11-07T18:59:00Z") }), true, "19 h 59 à Paris : encore le jour");
  assert.deepEqual(FENETRE_ESSAI, { debut: 9, fin: 20 });
});

test("⑫ un essai se juge comme une alerte, et le dit : « l'essai de tes alertes n'est arrivé sur aucun appareil »", () => {
  const essai = { ...alerte(DELAI_ACCUSE_MS + 1000), properties: { ...alerte(DELAI_ACCUSE_MS + 1000).properties, essai: true } };
  const b = bilanReception({ envois: [essai], maintenant: T });
  assert.equal(b.derniereAlerte.etat, "non_recue");
  assert.equal(b.derniereAlerte.essai, true);
  const l = ligneReception(b);
  assert.match(l.titre, /^L'essai de tes alertes n'est arrivé sur aucun appareil/);
  assert.match(l.reference, /une vraie alerte ne te parviendrait pas non plus/);
  const recu = bilanReception({ envois: [essai], accuses: [accuse(P1, DELAI_ACCUSE_MS)], maintenant: T });
  assert.equal(recu.derniereAlerte.etat, "recue");
  assert.equal(recu.derniereAlerte.essai, true);
  assert.equal(ligneReception(recu), null);
  assert.equal(bilanReception({ envois: [alerte(60e3)], maintenant: T }).derniereAlerte.essai, undefined, "une vraie alerte n'est pas un essai");
});

// ─── L'adresse d'accusé avec les NOUVELLES clés (2026-11-07) ─────────────────
// Mesuré : le premier essai (08:10) est parti « sans_adresse » vers deux appareils
// qui l'ont accepté — aucun ne pouvait l'accuser. Réinjections éprouvées : la
// publiable refusée → ⑬ rougit ; la publiable préférée au JWT (les service workers
// d'avant ne l'acceptent pas) → ⑬ rougit ; sans révision → ⑭ rougit (aucun
// réessai) ; réessai à chaque passage → ⑭ rougit ; une forme inconnue relue → ⑮ rougit.
import { adresseAccuse, formeCle, diagAdresse } from "../../supabase/functions/_shared/reception.js";
test("⑬ adresseAccuse : l'ancienne clé (JWT) d'abord, sinon la publiable (JSON par nom, ou SUPABASE_ANON_KEY) ; l'URL lue ou déduite du projet ; un diagnostic en FORMES", () => {
  const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2ln";
  const PUB = "sb_publishable_Abc123_def-456XYZ";
  const URL0 = "https://njkiyoklssvefstljemx.supabase.co";
  const avec = (env) => adresseAccuse((n) => env[n]);
  // L'ancienne forme : comme avant.
  assert.deepEqual(avec({ SUPABASE_URL: URL0, SUPABASE_ANON_KEY: JWT }), { accuse: { u: URL0, k: JWT }, diag: { url: "ok", anon: "jwt", publiables: "absente", cle: "jwt" } });
  // La fonction reçoit la publiable dans SUPABASE_ANON_KEY : elle sert.
  assert.deepEqual(avec({ SUPABASE_URL: URL0, SUPABASE_ANON_KEY: PUB }).accuse, { u: URL0, k: PUB });
  // …ou par SUPABASE_PUBLISHABLE_KEYS, `default` d'abord, sinon un autre nom.
  assert.equal(avec({ SUPABASE_URL: URL0, SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ web: "x", default: PUB }) }).accuse.k, PUB);
  assert.equal(avec({ SUPABASE_URL: URL0, SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ web: PUB }) }).accuse.k, PUB);
  // Les deux : le JWT d'abord — les service workers d'avant ce lot ne connaissent que lui.
  assert.equal(avec({ SUPABASE_URL: URL0, SUPABASE_ANON_KEY: JWT, SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }) }).accuse.k, JWT);
  // L'URL déduite du projet (DENO_DEPLOYMENT_ID = <ref>_<fonction>_<version>).
  const deduite = avec({ DENO_DEPLOYMENT_ID: "njkiyoklssvefstljemx_6847b773-0504-48bc-b532-1e14f8f540c0_30", SUPABASE_ANON_KEY: JWT });
  assert.equal(deduite.accuse.u, URL0); assert.equal(deduite.diag.url, "deduite");
  assert.equal(avec({ SUPABASE_URL: "http://kong:8000", SUPABASE_ANON_KEY: JWT }).accuse, null, "une URL interne n'est jamais une adresse d'accusé");
  // Rien d'utilisable : null, et le diagnostic dit quoi.
  const rien = avec({ SUPABASE_ANON_KEY: "sb_secret_Abc123_def-456XYZ", SUPABASE_PUBLISHABLE_KEYS: "pas du json" });
  assert.equal(rien.accuse, null);
  assert.deepEqual(rien.diag, { url: "absente", anon: "forme", publiables: "forme", cle: "absente" });
  assert.equal(adresseAccuse(() => { throw new Error("env"); }).accuse, null, "un environnement illisible n'est pas une adresse");
  // Jamais une valeur dans le diagnostic.
  for (const env of [{ SUPABASE_URL: URL0, SUPABASE_ANON_KEY: JWT }, { SUPABASE_URL: URL0, SUPABASE_ANON_KEY: PUB }]) {
    const t = JSON.stringify(avec(env).diag);
    assert.ok(!t.includes(JWT) && !t.includes(PUB) && !t.includes("supabase.co"), t);
  }
  assert.equal(formeCle(JWT), "jwt"); assert.equal(formeCle(PUB), "publiable"); assert.equal(formeCle(""), "absente"); assert.equal(formeCle("sb_secret_x"), "forme");
  // descripteurAccuse admet désormais la publiable, jamais une clé secrète.
  assert.deepEqual(descripteurAccuse(URL0, PUB), { u: URL0, k: PUB });
  assert.equal(descripteurAccuse(URL0, "sb_secret_Abc123_def-456XYZ"), null);
});

test("⑭ essaiDu : une mesure IMPOSSIBLE se réessaie UNE fois par révision servie — de jour, jamais en boucle ; une mesure faite attend 7 jours", () => {
  const MIDI = Date.parse("2026-11-07T11:00:00Z"); // 12 h à Paris
  const NUIT = Date.parse("2026-11-07T01:00:00Z");
  const note = (mesure, revision, il) => ({ created_at: new Date(MIDI - il).toISOString(), properties: { genre: "pilotage", mesure, ...(revision ? { revision } : {}) } });
  assert.equal(essaiDu({ derniereNote: note("sans_adresse", null, 3600e3), maintenant: MIDI, revision: "411cddd6f9" }), true, "la note d'avant ne porte pas de révision : l'essai repart");
  assert.equal(essaiDu({ derniereNote: note("sans_adresse", "411cddd6f9", 3600e3), maintenant: MIDI, revision: "411cddd6f9" }), false, "même révision : pas de boucle");
  assert.equal(essaiDu({ derniereNote: note("sans_adresse", "411cddd6f9", 3600e3), maintenant: MIDI, revision: "be5dc76aaa" }), true, "nouvelle révision : UN essai");
  assert.equal(essaiDu({ derniereNote: note("ok", "411cddd6f9", 3600e3), maintenant: MIDI, revision: "be5dc76aaa" }), false, "mesurée : 7 jours");
  assert.equal(essaiDu({ derniereNote: note("sans_adresse", null, 3600e3), maintenant: MIDI, revision: null }), false, "révision inconnue : jamais de réessai");
  assert.equal(essaiDu({ derniereNote: note("sans_adresse", null, 3600e3), maintenant: NUIT, revision: "be5dc76aaa" }), false, "la nuit, jamais");
});

test("⑮ une alerte non mesurée dit POURQUOI, en formes connues seulement ; le texte hostile d'une note ne passe pas", () => {
  const T = Date.parse("2026-11-07T08:30:00Z");
  const env = { created_at: "2026-11-07T08:10:05Z", properties: { genre: "pilotage", essai: true, mesure: "sans_adresse", acceptes: 2,
    adresse: { url: "ok", anon: "publiable", publiables: "absente", cle: "<img src=x>", autre: "eyJ.secret.x" } } };
  const b = bilanReception({ envois: [env], maintenant: T });
  assert.equal(b.derniereAlerte.etat, "non_mesuree");
  assert.deepEqual(b.derniereAlerte.adresse, { url: "ok", anon: "publiable", publiables: "absente" });
  const l = ligneReception(b);
  assert.match(l.reference, /clé anon : publiable/);
  assert.ok(!/img|secret/.test(l.reference));
  assert.equal(diagAdresse(null), null); assert.equal(diagAdresse({ x: "y" }), null);
});

