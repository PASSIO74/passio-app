// Verrous des accusés de réception (supabase/functions/_shared/reception.js).
// Le fichier testé est CELUI que Deno charge en production. `node --test tests/unit/`.
// Mutations éprouvées à la main : compter un accusé de pid inconnu → ② rougit ;
// juger « non reçue » avant le délai → ③ rougit ; compter un rappel en attente
// dans le dénominateur → ⑤ rougit ; une adresse d'accusé hors forme → ⑦ rougit.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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


// ─── Les APPELS (notify-call, 2026-11-07) ────────────────────────────────────
// Un appel sur ECHANTILLON_APPELS porte un accusé (_shared/appels.js) ; le taux se
// juge comme celui des rappels, à part. Réinjections éprouvées : le taux des appels
// compté sur le genre « rappel » → ⑯ rougit ; l'attente comptée au dénominateur →
// ⑯ rougit ; `tronqueAppels` ignoré → ⑯ rougit ; le plafond des appels qui rend les
// rappels partiels → ⑯ rougit ; un échantillon de 1 sur 4 → ⑰ rougit ; un tirage
// accepté hors de [0, 1) → ⑰ rougit ; le plafond de 300 notes du premier jet → ⑰
// rougit ; l'interrupteur des appels ignoré → ⑯ rougit.
import { appelMesure, GENRE_APPEL, UID_APPELS, ECHANTILLON_APPELS, FENETRE_APPELS_MS, MIN_APPELS, NOTES_APPELS_MAX, NOTES_RAPPELS_MAX } from "../../supabase/functions/_shared/reception.js";

test("⑯ appels : un taux sur 24 h qui se DIT échantillon, l'attente hors du dénominateur, « trop peu » sous 5, « partiel » sur une lecture plafonnée — jamais mêlé aux rappels ni à l'alerte", () => {
  const pids = Array.from({ length: 8 }, (_, i) => `66666666-6666-4666-8666-${String(i).padStart(12, "0")}`);
  /** Une note telle que pousserAppareils l'écrit : UN pid par appel, partagé par les appareils. */
  const appel = (il_y_a, pid, acceptes = 1) => ({ created_at: iso(T - il_y_a), properties: { genre: GENRE_APPEL, pids: [pid], acceptes } });
  const envois = [
    ...pids.slice(0, 6).map((p) => appel(3 * 3600e3, p, 2)),
    appel(2 * 60e3, pids[6]),                  // dans le délai d'accusé : en attente
    appel(FENETRE_APPELS_MS + 60e3, pids[7]),  // hors des 24 h : pas compté
  ];
  // 5 des 6 appels jugeables accusés — le premier par ses DEUX appareils : un appel, un reçu.
  const accuses = [...pids.slice(0, 5).map((p) => accuse(p, 3 * 3600e3 - 3000)), accuse(pids[0], 3 * 3600e3 - 1000), accuse(pids[7], 60e3)];
  const b = bilanReception({ envois, accuses, maintenant: T });
  assert.deepEqual(b.appels, { etat: "mesure", envoyes: 6, recus: 5, enAttente: 1, taux: 5 / 6, echantillon: ECHANTILLON_APPELS, actifs: true });
  assert.equal(b.rappels.envoyes, 0, "un appel n'est pas un rappel");
  assert.equal(b.derniereAlerte.etat, "aucune", "ni une alerte");
  // Un genre ne compte jamais pour l'autre : des rappels accusés ne font aucun appel reçu.
  const croise = bilanReception({ envois: [{ created_at: iso(T - 3600e3), properties: { genre: "rappel", pids: pids.slice(0, 6) } }], accuses: pids.slice(0, 6).map((p) => accuse(p, 3500e3)), maintenant: T });
  assert.equal(croise.appels.envoyes, 0);
  assert.equal(croise.rappels.recus, 6);
  // Trop peu : jamais un taux, et l'échantillon reste dit.
  const peu = bilanReception({ envois: pids.slice(0, MIN_APPELS - 1).map((p) => appel(3600e3, p)), accuses: pids.slice(0, 4).map((p) => accuse(p, 3500e3)), maintenant: T });
  assert.equal(peu.appels.etat, "insuffisant");
  assert.equal(peu.appels.taux, undefined, "jamais un taux sur trop peu");
  assert.equal(peu.appels.echantillon, ECHANTILLON_APPELS, "l'écran dit que c'est un échantillon");
  assert.equal(bilanReception({ envois: pids.slice(0, MIN_APPELS).map((p) => appel(3600e3, p)), maintenant: T }).appels.etat, "mesure", "dès MIN_APPELS jugeables, un taux — même nul");
  // Partiel : la lecture des appels a touché un plafond — pas de taux ; ni l'alerte ni les rappels n'en sont touchés.
  const rappelsMesures = { created_at: iso(T - 2 * 3600e3), properties: { genre: "rappel", pids: ["77777777-7777-4777-8777-000000000001", "77777777-7777-4777-8777-000000000002", "77777777-7777-4777-8777-000000000003", "77777777-7777-4777-8777-000000000004", "77777777-7777-4777-8777-000000000005"] } };
  const part = bilanReception({ envois: [alerte(30 * 60e3), rappelsMesures, ...envois], accuses: [accuse(P1, 29 * 60e3), ...accuses], maintenant: T, tronqueAppels: true });
  assert.equal(part.appels.etat, "partiel");
  assert.equal(part.appels.taux, undefined, "jamais un taux sur une lecture incomplète");
  assert.equal(part.tronque, true);
  assert.equal(part.derniereAlerte.etat, "recue");
  assert.equal(part.rappels.etat, "mesure", "le plafond des appels ne rend pas les rappels partiels");
  assert.equal(bilanReception({ maintenant: T }).appels.etat, "insuffisant");
  assert.equal(bilanReception({ maintenant: T }).tronque, false);
  // Appels COUPÉS (pilote) : le bilan le dit, pour que l'écran ne montre pas « 0 appel mesuré » sans raison.
  assert.equal(bilanReception({ maintenant: T, appelsActifs: false }).appels.actifs, false);
  assert.equal(bilanReception({ maintenant: T }).appels.actifs, true);
});

/** P(X > k) pour X ~ Binomiale(n, p) : somme exacte, en logarithmes. */
function queueBinomiale(n, p, k) {
  let logC = 0, s = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) logC += Math.log((n - i + 1) / i);
    if (i > k) s += Math.exp(logC + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return s;
}

test("⑰ un appel sur ECHANTILLON_APPELS est mesuré, sur un tirage de [0, 1) ; en loi binomiale, la lecture ne tronque presque jamais au haut de l'hypothèse 100 000 inscrits, et un taux existe 9 jours sur 10 dès 80 appels par jour", () => {
  assert.equal(GENRE_APPEL, "appel");
  assert.equal(UID_APPELS, "systeme:appels");
  assert.ok(!/^[0-9a-f]{8}-/.test(UID_APPELS), "jamais un uuid : aucun client n'écrit sous cet auteur (analytics_insert_own : user_id = auth.uid())");
  assert.equal(ECHANTILLON_APPELS, 10);
  assert.equal(MIN_APPELS, 5);
  assert.equal(FENETRE_APPELS_MS, 24 * 3600e3);
  for (const x of [0, 0.05, 0.0999]) assert.equal(appelMesure(x), true, String(x));
  for (const x of [0.1, 0.5, 0.9999, 1, -0.01, NaN, Infinity, "0", null, undefined]) assert.equal(appelMesure(x), false, String(x));
  // Les chiffres du § 3.7 (docs/AUTONOMIE_EXPLOITATION.md) : à 100 000 inscrits, 20 000 à
  // 30 000 actifs par jour (PASSIO_100K_AUTONOMIE.md § 4) ; un appel par jour pour 5 à
  // 10 % d'entre eux → 1 000 à 3 000 appels par jour.
  // Le nombre d'appels mesurés d'un jour suit une loi binomiale : une MOYENNE au
  // plafond le dépasse un jour sur deux (premier jet : 300 notes lues, 300 attendues
  // à 3 000 appels — « partiel » 49 % des jours ; revue du 2026-11-07).
  const p = 1 / ECHANTILLON_APPELS;
  assert.ok(queueBinomiale(3000, p, NOTES_APPELS_MAX) < 1e-6, "à 3 000 appels par jour, la lecture n'est presque jamais partielle");
  assert.ok(queueBinomiale(3600, p, NOTES_APPELS_MAX) < 0.02, "à 3 600 (20 % au-dessus), moins de 2 jours sur 100");
  assert.ok(queueBinomiale(3000, p, 300) > 0.4, "le banc voit le défaut du premier jet : 300 notes ne suffisaient pas");
  // « Un taux » = au moins MIN_APPELS appels mesurés et jugeables.
  assert.ok(queueBinomiale(80, p, MIN_APPELS - 1) >= 0.9, "à 80 appels par jour, un taux 9 jours sur 10");
  assert.ok(queueBinomiale(50, p, MIN_APPELS - 1) < 0.6, "à 50 par jour, à peine plus d'un jour sur deux : la doc ne promet pas « dès 50 »");
  assert.equal(NOTES_RAPPELS_MAX, 300, "la lecture des rappels ne bouge pas");
  // Le plafond par appelant de notify-call (lu dans la fonction déployée) : au plus 20 notes par heure et par appelant.
  const src = fs.readFileSync("supabase/functions/notify-call/index.ts", "utf8");
  const parHeure = Number((/const PLAFOND = \{ parMinute: \d+, parHeure: (\d+) \};/.exec(src) || [])[1]);
  assert.ok(parHeure > 0 && parHeure / ECHANTILLON_APPELS <= 20, "un appelant pèse au plus 20 notes par heure");
  assert.equal(NOTES_APPELS_MAX, 400);
});

// ─── Les NOTIFICATIONS SOCIALES (notify-call, 2026-11-07) ─────────────────────
// Une push sociale sur ECHANTILLON_NOTIFS porte un accusé (_shared/appels.js) ; le
// taux se juge à part, STRICTEMENT après le délai, et une lecture limitée par le
// volume dit depuis quand au lieu de se dire « partielle ». Réinjections éprouvées :
// juger les notifications au genre « appel » → ⑱ rougit ; les juger sans `strict`
// (un accusé rapide compté avant le délai) → ⑱ rougit ; `tronqueNotifs` ignoré →
// ⑱ rougit ; une lecture limitée rendue « partielle » → ⑱ rougit ; `depuis` pris
// sur la plus RÉCENTE note, ou sur une note d'un autre genre → ⑱ rougit ; un taux
// de 1 sur 10 → ⑲ rougit ; un plafond de lecture au-delà d'une page PostgREST →
// ⑲ rougit.
import { notifMesuree, GENRE_NOTIF, UID_NOTIFS, ECHANTILLON_NOTIFS, FENETRE_NOTIFS_MS, MIN_NOTIFS, NOTES_NOTIFS_MAX } from "../../supabase/functions/_shared/reception.js";

test("⑱ notifications sociales : un taux à part, jugé APRÈS le délai même accusé, « trop peu » sous 5, « partiel » sur un paquet plein — et une lecture LIMITÉE par le volume dit depuis quand, sans se dire partielle", () => {
  const pids = Array.from({ length: 10 }, (_, i) => `88888888-8888-4888-8888-${String(i).padStart(12, "0")}`);
  /** Une note telle que pousserAppareils l'écrit : UN pid par notification, son genre d'une liste fermée. */
  const notif = (il_y_a, pid, kind = "like") => ({ created_at: iso(T - il_y_a), properties: { genre: GENRE_NOTIF, pids: [pid], acceptes: 2, kind } });
  const envois = [
    ...pids.slice(0, 6).map((p) => notif(3 * 3600e3, p)),
    notif(2 * 60e3, pids[6], "message"),           // 2 min, DÉJÀ accusée : attend quand même (strict)
    notif(3 * 60e3, pids[7], "follow"),            // 3 min, pas d'accusé : attend
    notif(FENETRE_NOTIFS_MS + 60e3, pids[8]),     // hors des 24 h : pas comptée
  ];
  const accuses = [...pids.slice(0, 5).map((p) => accuse(p, 3 * 3600e3 - 2000)), accuse(pids[0], 3 * 3600e3 - 1000), accuse(pids[6], 60e3), accuse(pids[8], 60e3)];
  const b = bilanReception({ envois, accuses, maintenant: T });
  assert.deepEqual(b.notifs, { etat: "mesure", envoyes: 6, recus: 5, enAttente: 2, taux: 5 / 6, echantillon: ECHANTILLON_NOTIFS }, "l'accusé de 2 min ne compte pas encore : sur une fenêtre de quelques heures, compter les rapides et taire les lents gonflerait le taux");
  assert.equal(b.accusesIgnores, 0, "un accusé de notification sociale envoyée n'est pas ignoré");
  // Le même motif sous le genre « appel » compte l'accusé rapide (règle d'avant, inchangée pour les appels).
  const commeAppels = bilanReception({ envois: envois.map((e) => ({ ...e, properties: { ...e.properties, genre: GENRE_APPEL } })), accuses, maintenant: T });
  assert.deepEqual([commeAppels.appels.recus, commeAppels.appels.enAttente], [6, 1], "la règle des appels n'a pas bougé");
  // Jamais mêlé : des notes sociales ne font ni rappels, ni appels, ni alerte — et l'inverse.
  assert.equal(b.rappels.envoyes, 0);
  assert.equal(b.appels.envoyes, 0);
  assert.equal(b.derniereAlerte.etat, "aucune");
  const appelsSeuls = bilanReception({ envois: pids.slice(0, 6).map((p) => ({ created_at: iso(T - 3600e3), properties: { genre: GENRE_APPEL, pids: [p], acceptes: 1 } })), accuses: pids.slice(0, 6).map((p) => accuse(p, 3500e3)), maintenant: T });
  assert.equal(appelsSeuls.notifs.envoyes, 0);
  assert.equal(appelsSeuls.appels.recus, 6);
  // Trop peu : jamais un taux, et l'échantillon reste dit.
  const peu = bilanReception({ envois: pids.slice(0, MIN_NOTIFS - 1).map((p) => notif(3600e3, p)), accuses: pids.slice(0, 4).map((p) => accuse(p, 3500e3)), maintenant: T });
  assert.equal(peu.notifs.etat, "insuffisant");
  assert.equal(peu.notifs.taux, undefined);
  assert.equal(peu.notifs.echantillon, ECHANTILLON_NOTIFS);
  assert.equal(bilanReception({ envois: pids.slice(0, MIN_NOTIFS).map((p) => notif(3600e3, p)), maintenant: T }).notifs.etat, "mesure", "dès MIN_NOTIFS jugeables, un taux — même nul");
  // Partiel : un paquet d'accusés plein (un pid noyé) — pas de taux ; ni l'alerte, ni les rappels, ni les appels n'en sont touchés.
  const rappels5 = { created_at: iso(T - 2 * 3600e3), properties: { genre: "rappel", pids: ["77777777-7777-4777-8777-000000000001", "77777777-7777-4777-8777-000000000002", "77777777-7777-4777-8777-000000000003", "77777777-7777-4777-8777-000000000004", "77777777-7777-4777-8777-000000000005"] } };
  const part = bilanReception({ envois: [alerte(30 * 60e3), rappels5, ...envois], accuses: [accuse(P1, 29 * 60e3), ...accuses], maintenant: T, tronqueNotifs: true });
  assert.equal(part.notifs.etat, "partiel");
  assert.equal(part.notifs.taux, undefined, "jamais un taux sur une lecture incomplète");
  assert.equal(part.tronque, true);
  assert.equal(part.derniereAlerte.etat, "recue");
  assert.equal(part.rappels.etat, "mesure", "le plafond des notifications ne rend pas les rappels partiels");
  // LIMITÉE par le volume : un taux, sur les notes lues, et l'heure de la plus ancienne — jamais « partiel ».
  const autres = [{ created_at: iso(T - 20 * 3600e3), properties: { genre: GENRE_APPEL, pids: [P3], acceptes: 1 } }, notif(FENETRE_NOTIFS_MS + 3600e3, pids[9])];
  const lim = bilanReception({ envois: [...envois, ...autres], accuses, maintenant: T, notifsLimitees: true });
  assert.equal(lim.notifs.etat, "mesure");
  assert.equal(lim.notifs.taux, 5 / 6);
  assert.equal(lim.notifs.depuis, iso(T - 3 * 3600e3), "la plus ANCIENNE note sociale de la fenêtre — ni un appel plus vieux, ni une note hors des 24 h");
  assert.equal(lim.tronque, false, "une fenêtre raccourcie n'est pas une lecture partielle : les accusés de ces notes sont tous lus");
  assert.equal(b.notifs.depuis, undefined, "lecture complète : pas de « depuis »");
  // Sans rien : « trop peu », rien de tronqué.
  assert.equal(bilanReception({ maintenant: T }).notifs.etat, "insuffisant");
  assert.equal(bilanReception({ maintenant: T, notifsLimitees: true }).notifs.depuis, undefined, "aucune note : aucune heure inventée");
  assert.equal(bilanReception({ maintenant: T }).tronque, false);
});

test("⑲ une notification sociale sur ECHANTILLON_NOTIFS : en loi binomiale, au haut de l'hypothèse 100 000 inscrits, aucune note refusée par le plafond de 120/min même à 1 500 pushes/min, 3 h de soirée dans la lecture ; un taux 9 jours sur 10 dès 158 pushes par jour", () => {
  assert.equal(GENRE_NOTIF, "notif");
  assert.equal(UID_NOTIFS, "systeme:notifs");
  assert.ok(!/^[0-9a-f]{8}-/.test(UID_NOTIFS), "jamais un uuid : aucun client n'écrit sous cet auteur");
  assert.notEqual(UID_NOTIFS, UID_APPELS, "un auteur par genre : `trg_rate_limit` compte par auteur, et un genre ne mange pas le plafond de l'autre");
  assert.equal(ECHANTILLON_NOTIFS, 20);
  assert.equal(MIN_NOTIFS, 5);
  assert.equal(FENETRE_NOTIFS_MS, 24 * 3600e3);
  assert.equal(NOTES_NOTIFS_MAX, 999);
  assert.ok(NOTES_NOTIFS_MAX + 1 <= 1000, "la lecture prend UNE note de plus, dans UNE page : PostgREST n'en rend pas plus de 1 000 (max-rows)");
  for (const x of [0, 0.0499]) assert.equal(notifMesuree(x), true, String(x));
  for (const x of [0.05, 0.5, 1, -0.01, NaN, "0", null]) assert.equal(notifMesuree(x), false, String(x));
  // L'HYPOTHÈSE du § 3.8 (docs/AUTONOMIE_EXPLOITATION.md) : 20 000 à 30 000 actifs par jour
  // (PASSIO_100K_AUTONOMIE.md § 4), 1 à 4 notifications par actif et par jour, 30 à 60 %
  // vers un destinataire abonné → 6 000 à 72 000 pushes sociales par jour.
  const p = 1 / ECHANTILLON_NOTIFS;
  // ① Pourquoi la lecture prend les plus récentes : à ce taux, 24 h ne tiennent pas dans une page au haut de l'hypothèse…
  assert.ok(queueBinomiale(72000, p, NOTES_NOTIFS_MAX) > 0.99, "au haut, la lecture est LIMITÉE presque tous les jours : le bilan dit depuis quand");
  assert.ok(queueBinomiale(6000, p, NOTES_NOTIFS_MAX) < 1e-6, "au bas, les 24 h sont lues en entier");
  // …et un taux qui les tiendrait (1 sur 100) ne donnerait rien pendant le pilote.
  assert.ok(queueBinomiale(790, 0.01, MIN_NOTIFS - 1) < 0.9, "1 sur 100 : pas de taux 9 jours sur 10 sous ~800 pushes par jour");
  // ② Le plafond qui ne se rattrape pas : `trg_rate_limit`, 120 notes par minute sous `systeme:notifs`.
  //    Pointe extrême : 1 500 pushes sociales en une minute (5 000 connectés, § 4, une push toutes les 3 min chacun).
  assert.ok(queueBinomiale(1500, p, 119) < 1e-6, "aucune note refusée, même en pointe extrême");
  assert.ok(queueBinomiale(1000, 1 / 10, 119) > 0.01, "1 sur 10 perdrait des notes plus d'une minute de pointe sur cent");
  // ③ La fenêtre : au soir du haut de l'hypothèse (6 000 pushes par heure), les 999 dernières couvrent 3 h.
  assert.ok(1 - queueBinomiale(18000, p, NOTES_NOTIFS_MAX) >= 0.999, "3 h de soirée dans la lecture");
  assert.ok(1 - queueBinomiale(18000, 1 / 18, NOTES_NOTIFS_MAX) < 0.6, "1 sur 18 n'y tient plus qu'un soir sur deux : 20 est le plus petit dénominateur qui tient");
  // ④ La contrepartie : « un taux » = au moins MIN_NOTIFS mesurées et jugeables dans la journée.
  assert.ok(queueBinomiale(158, p, MIN_NOTIFS - 1) >= 0.9, "dès 158 pushes sociales par jour, un taux 9 jours sur 10");
  assert.ok(queueBinomiale(157, p, MIN_NOTIFS - 1) < 0.9, "pas dès 157 : la doc dit 158, pas moins");
  assert.ok(queueBinomiale(50, p, MIN_NOTIFS - 1) < 0.15, "à 50 par jour, presque jamais un taux : l'écran dit « trop peu »");
  // ⑤ La première preuve : P(au moins une note en k pushes) = 1 − (1 − p)^k — 45 pushes pour 90 %.
  assert.ok(1 - (1 - p) ** 45 >= 0.9 && 1 - (1 - p) ** 44 < 0.9);
  // ⑥ Le plafond par émetteur de notify-call (lu dans la fonction déployée) : au plus 10 notes par heure et par émetteur.
  const src = fs.readFileSync("supabase/functions/notify-call/index.ts", "utf8");
  const parHeure = Number((/const PLAFOND = \{ parMinute: \d+, parHeure: (\d+) \};/.exec(src) || [])[1]);
  assert.ok(parHeure > 0 && parHeure / ECHANTILLON_NOTIFS <= 10, "un émetteur pèse au plus 10 notes par heure");
});
