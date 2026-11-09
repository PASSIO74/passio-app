// ═══════════════════════════════════════════════════════════════════════════
// notify-call EXÉCUTÉE : les chemins du gestionnaire, de bout en bout (2026-11-09)
// — notification, appel (appels coupés ET allumés), relais `ice`, et les refus :
// session, plafond, destinataire, blocage, lien, réservation, abonnés, VAPID.
//
// LE DÉFAUT QUI L'A FAIT ÉCRIRE : de #753 (07/11) au 2026-11-09, le chemin des
// notifications sociales lisait `uid`, jamais déclaré — une ReferenceError, donc
// un 500 pour TOUTE push sociale. Aucun banc ne l'a vu : la CI ne fait pas de
// `deno check`, et les suites de `_shared` testent chaque module seul, jamais le
// site d'appel. Les lectures de source (`appels.test.mjs` ⑦ ⑫) vérifient un ordre,
// pas qu'un chemin S'EXÉCUTE.
//
// Ici, le VRAI `index.ts` : types retirés par Node (`stripTypeScriptTypes`), ses
// imports remplacés par des doublures (Supabase, web-push, modules partagés),
// `Deno.serve` capturé, le tout exécuté en mode strict comme un module ES. Puis le
// gestionnaire reçoit de vraies `Request`. Une variable non déclarée, un argument
// oublié, une branche qui lève : le chemin rougit.
// Les modules partagés ne sont NI importés NI chargés (ils ont leurs suites) : ce
// banc éprouve le câblage du gestionnaire, et rien d'autre — et il ne charge aucun
// module par un chemin calculé (gate `edge-functions-verrous`).
// ═══════════════════════════════════════════════════════════════════════════
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const SOURCE = fs.readFileSync("supabase/functions/notify-call/index.ts", "utf8");
const MOI = "11111111-1111-4111-8111-111111111111";
const LUI = "22222222-2222-4222-8222-222222222222";

// État du banc, relu par les doublures à chaque appel.
const banc = {
  user: null, env: {}, tables: {}, appels: [], fetch: null, journaux: [],
  plafond: { ok: true }, lien: { ok: true }, decision: null, reserve: true, morts: [],
};

function constructeur(table) {
  const q = {};
  for (const m of ["select", "eq", "or", "limit", "in", "delete", "update", "gte", "lte", "is", "order", "insert"]) {
    q[m] = (...args) => { banc.appels.push({ table, m, args }); return q; };
  }
  q.then = (ok, ko) => Promise.resolve(banc.tables[table] || { data: [], error: null }).then(ok, ko);
  return q;
}

// Les doublures. `APPELS_ACTIFS` change d'un chargement à l'autre : le gestionnaire
// est chargé DEUX fois — appels coupés (le pilote) et appels allumés — pour que le
// chemin d'appel APRÈS l'interrupteur s'exécute aussi.
const MODULES_DE = (appelsActifs) => ({
  "https://esm.sh/@supabase/supabase-js@2.118.0": {
    createClient: () => ({
      auth: { getUser: async () => (banc.user ? { data: { user: banc.user }, error: null } : { data: { user: null }, error: { message: "jeton" } }) },
      from: (table) => constructeur(table),
    }),
  },
  "npm:web-push@3.6.7": { default: { setVapidDetails() {}, sendNotification: async () => ({ statusCode: 201 }) } },
  "../_shared/push-sur.js": { endpointPushSur: () => true, envoyerPushBorne: (f, s, c, o) => f(s, c, o), MAX_ABONNEMENTS_LUS: 10 },
  "../_shared/plafond.js": {
    verifierPlafondEnBase: async () => banc.plafond,
    reponsePlafond: () => new Response(JSON.stringify({ error: "plafond" }), { status: 429 }),
  },
  "../_shared/lien-metier.js": {
    identiteAppelant: async () => ({ name: "Moi", emoji: "🙂" }),
    lienAppel: async (...args) => { banc.appels.push({ table: "lienAppel", args }); return banc.lien; },
    autoriserPushNotif: async (...args) => { banc.appels.push({ table: "autoriserPushNotif", args }); return banc.decision; },
    reserverPush: async (...args) => { banc.appels.push({ table: "reserverPush", args }); return banc.reserve; },
  },
  "../_shared/reception.js": { adresseAccuse: () => ({ accuse: null }), TTL_NOTIFS_MS: 3600 * 1000 },
  "../_shared/appels.js": {
    APPELS_ACTIFS: appelsActifs,
    pousserAppareils: async (o) => { banc.appels.push({ table: "pousserAppareils", args: [o.charge, o.options] }); return { sent: o.abonnements.length, morts: banc.morts }; },
    serveursIceDepuisCloudflare: (r) => (r && Array.isArray(r.iceServers) ? r.iceServers : []),
    TTL_ICE_S: 21600,
  },
  "../_shared/revision.js": { REVISION: "banc" },
});

const gestionnaires = {};

function charger(appelsActifs) {
  const modules = MODULES_DE(appelsActifs);
  let js = stripTypeScriptTypes(SOURCE, { mode: "strip" });
  const vus = [];
  js = js.replace(/^import\s+(.+?)\s+from\s+"([^"]+)";[ \t]*$/gm, (_, clause, origine) => {
    vus.push(origine);
    const c = clause.trim();
    return c.startsWith("{")
      ? `const ${c} = globalThis.__bancNotify.module(${JSON.stringify(origine)});`
      : `const ${c} = globalThis.__bancNotify.module(${JSON.stringify(origine)}).default;`;
  });
  // Tout import a sa doublure : un import neuf sans doublure doit rougir ICI, pas en production.
  assert.deepEqual(vus.filter((o) => !(o in modules)), [], "import sans doublure");
  assert.doesNotMatch(js, /^\s*import\s/m, "un import n'a pas été remplacé");
  assert.doesNotMatch(js, /^\s*export\s/m, "un export : le banc devrait charger un vrai module");
  let gestionnaire = null;
  globalThis.__bancNotify = { module: (o) => modules[o] };
  globalThis.Deno = {
    env: { get: (n) => banc.env[n] },
    serve: (h) => { gestionnaire = h; },
  };
  // Mode strict, comme un module ES : la lecture d'une variable jamais déclarée lève.
  new Function('"use strict";\n' + js)();
  assert.equal(typeof gestionnaire, "function", "Deno.serve a reçu le gestionnaire");
  return gestionnaire;
}

before(() => {
  gestionnaires.pilote = charger(false);
  gestionnaires.allumes = charger(true);
});

async function appeler(corps, { auth = true, appels = false } = {}) {
  const g = appels ? gestionnaires.allumes : gestionnaires.pilote;
  const r = await g(new Request("https://banc.example/functions/v1/notify-call", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer jeton-du-banc" } : {}) },
    body: JSON.stringify(corps),
  }));
  return { status: r.status, cache: r.headers.get("Cache-Control"), corps: await r.json() };
}

const ABONNES = { data: [{ endpoint: "https://fcm.googleapis.com/fcm/send/x", subscription: {} }], error: null };
const PERSONNE = { data: [], error: null };

function remettre({ user = { id: MOI }, env = {}, tables = { blocks: PERSONNE, push_subscriptions: ABONNES } } = {}) {
  banc.user = user;
  banc.env = {
    SUPABASE_URL: "https://banc.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
    VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", ...env,
  };
  banc.tables = tables;
  banc.appels = [];
  banc.journaux = [];
  banc.fetch = null;
  banc.plafond = { ok: true };
  banc.lien = { ok: true };
  banc.decision = { ok: true, id: "n_banc", texte: "Moi a aimé ta publication", kind: "like" };
  banc.reserve = true;
  banc.morts = [];
}
const pousse = () => banc.appels.filter((a) => a.table === "pousserAppareils");
const RIEN = { ok: true, sent: 0, note: "aucun appareil abonné" };

// Les journaux de la fonction (console.error) : relus, jamais affichés.
const consoleError = console.error;
console.error = (...a) => { banc.journaux.push(a.join(" ")); };
globalThis.fetch = async (url, init) => {
  banc.appels.push({ table: "fetch", args: [String(url), init] });
  if (!banc.fetch) throw new Error("fetch inattendu : " + url);
  return banc.fetch(String(url), init);
};
process.on("exit", () => { console.error = consoleError; });

test("① une notification sociale S'EXÉCUTE jusqu'à l'envoi — la réservation porte l'appelant authentifié (l'ancien `uid` levait une ReferenceError)", async () => {
  remettre({ tables: {
    blocks: { data: [], error: null },
    push_subscriptions: { data: [{ endpoint: "https://fcm.googleapis.com/fcm/send/x", subscription: {} }], error: null },
  } });
  const r = await appeler({ type: "notif", toUserId: LUI });
  assert.equal(r.status, 200, JSON.stringify(r.corps));
  assert.deepEqual(r.corps, { ok: true, sent: 1 });
  const reservation = banc.appels.find((a) => a.table === "reserverPush");
  assert.ok(reservation, "la réservation a eu lieu");
  assert.equal(reservation.args[1], "n_banc");
  assert.equal(reservation.args[2], LUI);
  assert.equal(reservation.args[5], MOI, "le budget d'un émetteur se compte sur l'appelant authentifié");
  const envoi = banc.appels.find((a) => a.table === "pousserAppareils");
  assert.equal(envoi.args[0].text, "Moi a aimé ta publication", "le texte vient du serveur, jamais du corps");
});

test("② un appel pendant le pilote : 503 appels_desactives, rien n'est poussé", async () => {
  remettre();
  const r = await appeler({ type: "call", toUserId: LUI, callId: "c_banc", kind: "voice" });
  assert.equal(r.status, 503);
  assert.equal(r.corps.code, "appels_desactives");
  assert.equal(banc.appels.filter((a) => a.table === "pousserAppareils").length, 0);
});

test("③ `ice`, relais coupé (secrets absents) : liste vide, `configure: false`, jamais en cache, Cloudflare jamais appelé", async () => {
  remettre();
  const r = await appeler({ type: "ice" });
  assert.equal(r.status, 200);
  assert.equal(r.cache, "no-store");
  assert.deepEqual(r.corps, { ok: true, iceServers: [], configure: false });
  assert.equal(banc.appels.filter((a) => a.table === "fetch").length, 0);
});

test("④ `ice`, relais en place : Cloudflare reçoit la clé et le jeton NETTOYÉS (espace, retour à la ligne), la réponse porte la liste et la durée", async () => {
  remettre({ env: { TURN_CF_KEY_ID: " cle0123456789abcdef\n", TURN_CF_API_TOKEN: "jeton-secret-du-banc\n" } });
  const relais = { urls: ["turn:turn.cloudflare.com:3478?transport=udp"], username: "u", credential: "c" };
  banc.fetch = async () => new Response(JSON.stringify({ iceServers: [relais] }), { status: 201 });
  const r = await appeler({ type: "ice" });
  assert.equal(r.status, 200);
  assert.equal(r.cache, "no-store");
  assert.deepEqual(r.corps, { ok: true, iceServers: [relais], ttl: 21600, configure: true });
  const [url, init] = banc.appels.find((a) => a.table === "fetch").args;
  assert.equal(url, "https://rtc.live.cloudflare.com/v1/turn/keys/cle0123456789abcdef/credentials/generate-ice-servers");
  assert.equal(init.headers.Authorization, "Bearer jeton-secret-du-banc");
  assert.deepEqual(JSON.parse(init.body), { ttl: 21600 });
});

test("⑤ `ice`, Cloudflare en panne : un REPLI prévu (200, `turn_indisponible`), journalisé avec le statut — jamais le jeton", async () => {
  remettre({ env: { TURN_CF_KEY_ID: "cle0123456789abcdef", TURN_CF_API_TOKEN: "jeton-secret-du-banc" } });
  banc.fetch = async () => new Response("oups", { status: 503 });
  const r = await appeler({ type: "ice" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corps, { ok: false, iceServers: [], configure: true, code: "turn_indisponible" });
  assert.ok(banc.journaux.some((j) => /Cloudflare a répondu 503/.test(j)), banc.journaux.join(" | "));
  // Une exception (réseau, abandon) : même repli, le nom de l'erreur seulement.
  remettre({ env: { TURN_CF_KEY_ID: "cle0123456789abcdef", TURN_CF_API_TOKEN: "jeton-secret-du-banc" } });
  banc.fetch = async () => { throw Object.assign(new Error("connexion refusée jeton-secret-du-banc"), { name: "TypeError" }); };
  const r2 = await appeler({ type: "ice" });
  assert.equal(r2.status, 200);
  assert.equal(r2.corps.code, "turn_indisponible");
  assert.ok(banc.journaux.some((j) => /relais TURN : TypeError/.test(j)), banc.journaux.join(" | "));
  for (const j of banc.journaux) assert.doesNotMatch(j, /jeton-secret-du-banc|cle0123456789abcdef/);
});

test("⑥ `ice`, identifiant de clé hors forme : coupé ET journalisé (`cle_invalide`), Cloudflare jamais appelé", async () => {
  remettre({ env: { TURN_CF_KEY_ID: "clé avec espaces", TURN_CF_API_TOKEN: "jeton-secret-du-banc" } });
  const r = await appeler({ type: "ice" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corps, { ok: false, iceServers: [], configure: false, code: "cle_invalide" });
  assert.ok(banc.journaux.some((j) => /TURN_CF_KEY_ID hors forme/.test(j)));
  for (const j of banc.journaux) assert.doesNotMatch(j, /clé avec espaces|jeton-secret-du-banc/);
  assert.equal(banc.appels.filter((a) => a.table === "fetch").length, 0);
});

test("⑦ `ice`, session anonyme : rien (`compte_requis`), Cloudflare jamais appelé", async () => {
  remettre({ user: { id: MOI, is_anonymous: true }, env: { TURN_CF_KEY_ID: "cle0123456789abcdef", TURN_CF_API_TOKEN: "jeton-secret-du-banc" } });
  const r = await appeler({ type: "ice" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corps, { ok: false, iceServers: [], code: "compte_requis" });
  assert.equal(banc.appels.filter((a) => a.table === "fetch").length, 0);
});

test("⑧ sans session : 401, avant toute lecture du corps", async () => {
  remettre({ user: null });
  const r = await appeler({ type: "ice" }, { auth: false });
  assert.equal(r.status, 401);
  assert.equal(banc.appels.filter((a) => a.table === "fetch").length, 0);
});

// ─── Les autres chemins (relecture du 2026-11-09 : le banc n'exécutait que 8 chemins,
// et une variable non déclarée dans `lienAppel(…)` restait verte) ──────────────────

test("⑨ appels ALLUMÉS : un appel va jusqu'à l'envoi — lien vérifié sur l'appelant authentifié, charge d'appel, urgence haute", async () => {
  remettre();
  const r = await appeler({ type: "call", toUserId: LUI, callId: "c_banc", kind: "video" }, { appels: true });
  assert.equal(r.status, 200, JSON.stringify(r.corps));
  assert.deepEqual(r.corps, { ok: true, sent: 1 });
  const lien = banc.appels.find((a) => a.table === "lienAppel");
  assert.ok(lien, "le lien métier est vérifié");
  assert.equal(lien.args[1], MOI);
  assert.equal(lien.args[2], LUI);
  const [charge, options] = pousse()[0].args;
  assert.deepEqual(charge, { type: "call", callId: "c_banc", kind: "video", from: MOI, name: "Moi", emoji: "🙂" });
  assert.deepEqual(options, { TTL: 45, urgency: "high" });
});

test("⑩ appels ALLUMÉS : sans `callId`, 400 ; sans lien commun, la réponse d'un blocage — rien n'est poussé", async () => {
  remettre();
  const sans = await appeler({ type: "call", toUserId: LUI }, { appels: true });
  assert.equal(sans.status, 400);
  remettre();
  banc.lien = { ok: false };
  const r = await appeler({ type: "call", toUserId: LUI, callId: "c_banc" }, { appels: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corps, RIEN);
  assert.equal(pousse().length, 0);
});

test("⑪ blocage dans un sens ou l'autre — et une ERREUR de lecture du blocage — : la même réponse qu'aucun abonné, rien n'est poussé", async () => {
  remettre({ tables: { blocks: { data: [{ blocker_id: LUI }], error: null }, push_subscriptions: ABONNES } });
  const bloque = await appeler({ type: "notif", toUserId: LUI });
  assert.deepEqual(bloque.corps, RIEN);
  remettre({ tables: { blocks: { data: null, error: { message: "panne" } }, push_subscriptions: ABONNES } });
  const panne = await appeler({ type: "notif", toUserId: LUI });
  assert.deepEqual(panne.corps, RIEN);
  assert.equal(pousse().length, 0);
});

test("⑫ notification refusée par le lien métier, ou réservation refusée (budget du destinataire) : rien n'est poussé", async () => {
  remettre();
  banc.decision = { ok: false, raison: "aucune ligne" };
  assert.deepEqual((await appeler({ type: "notif", toUserId: LUI })).corps, RIEN);
  assert.equal(banc.appels.filter((a) => a.table === "reserverPush").length, 0, "pas de réservation sans lien");
  remettre();
  banc.reserve = false;
  assert.deepEqual((await appeler({ type: "notif", toUserId: LUI })).corps, RIEN);
  assert.equal(pousse().length, 0);
});

test("⑬ aucun abonnement chez le destinataire : rien n'est poussé", async () => {
  remettre({ tables: { blocks: PERSONNE, push_subscriptions: PERSONNE } });
  assert.deepEqual((await appeler({ type: "notif", toUserId: LUI })).corps, RIEN);
  assert.equal(pousse().length, 0);
});

test("⑭ VAPID absent : 500 explicite, rien n'est poussé", async () => {
  remettre({ env: { VAPID_PUBLIC_KEY: "" } });
  const r = await appeler({ type: "notif", toUserId: LUI });
  assert.equal(r.status, 500);
  assert.deepEqual(r.corps, { error: "VAPID non configuré" });
  assert.equal(pousse().length, 0);
});

test("⑮ plafond dépassé : 429, avant même la lecture du corps et le lien métier", async () => {
  remettre();
  banc.plafond = { ok: false };
  const r = await appeler({ type: "notif", toUserId: LUI });
  assert.equal(r.status, 429);
  assert.equal(banc.appels.filter((a) => a.table === "autoriserPushNotif").length, 0);
});

test("⑯ destinataire hors forme : 400 (rien n'entre dans un filtre) ; soi-même : rien", async () => {
  remettre();
  assert.equal((await appeler({ type: "notif", toUserId: "a,b)" })).status, 400);
  remettre();
  assert.deepEqual((await appeler({ type: "notif", toUserId: MOI })).corps, { ok: true, sent: 0, note: "soi-même" });
  assert.equal(pousse().length, 0);
});

test("⑰ abonnements morts (404/410) : supprimés APRÈS l'envoi, par leur adresse", async () => {
  remettre();
  banc.morts = ["https://fcm.googleapis.com/fcm/send/x"];
  const r = await appeler({ type: "notif", toUserId: LUI });
  assert.deepEqual(r.corps, { ok: true, sent: 1 });
  const suppression = banc.appels.filter((a) => a.table === "push_subscriptions");
  assert.ok(suppression.some((a) => a.m === "delete"), "une suppression part");
  assert.ok(suppression.some((a) => a.m === "in" && a.args[0] === "endpoint" && a.args[1][0] === banc.morts[0]));
});
