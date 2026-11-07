// Verrous des pushes de `notify-call` et de l'accusé de réception des APPELS
// (supabase/functions/_shared/appels.js, 2026-11-07). Le fichier éprouvé est CELUI
// que Deno déploie. `node --test tests/unit/appels.test.mjs`.
// Réinjections éprouvées (chacune rougit au moins un test) : mesurer tous les
// appels → ② et ⑥ ; ignorer le tirage reçu → ② ; un pid par appareil → ① ; la
// note AVANT la fin des envois → ① ; le nom ou l'identifiant d'appel dans la note
// → ① ; une note sans appareil accepté → ④ ; une note refusée tue → ⑤ ; mesurer
// une notification sociale → ③ ; rendre le pid à l'appelant → ① et ⑦ ; un
// envoi direct qui contourne pousserAppareils → ⑦ ; un aléa prévisible
// (Math.random) → ⑥ ; l'adresse jamais passée par notify-call → ⑦ ; la garde des
// appels coupés retirée → ⑦. Revue du 2026-11-07 (verrous renforcés) : le refus du
// blocage retiré, le plafond déplacé après l'envoi, le refus du lien métier retiré,
// un tirage pris dans la requête, l'interrupteur des appels ouvert → ⑦.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pousserAppareils, tirer } from "../../supabase/functions/_shared/appels.js";
import { EVT_ENVOI, UID_APPELS, GENRE_APPEL, ECHANTILLON_APPELS, appelMesure } from "../../supabase/functions/_shared/reception.js";

const ACK = { u: "https://njkiyoklssvefstljemx.supabase.co", k: "sb_publishable_Abc123_def-456XYZ" };
const RE_UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Ce que notify-call met dans une push d'appel : du texte d'AUTRUI (nom, emoji) et
// un identifiant d'appel choisi par l'appelant — rien de tout cela n'entre dans une note.
const APPEL = { type: "call", callId: "c_<img src=x>", kind: "video", from: "11111111-1111-4111-8111-111111111111", name: "Léa <b>", emoji: "🎸" };
const NOTIF = { type: "notif", text: "Léa a aimé ta publication", emoji: "❤️", kind: "like" };
const OPTIONS_APPEL = { TTL: 45, urgency: "high" };
const abonnements = (n) => Array.from({ length: n }, (_, i) => ({ endpoint: "https://fcm.googleapis.com/fcm/send/" + i, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/" + i, keys: { p256dh: "x", auth: "y" } } }));

/** Faux client service_role : garde chaque insertion, dans l'ordre d'une séquence partagée. */
function fauxAdmin(sequence = [], { erreur = null, leve = false } = {}) {
  const ecrits = [];
  return {
    ecrits,
    from(nom) {
      return {
        insert(ligne) {
          sequence.push("note");
          ecrits.push({ nom, ligne });
          if (leve) throw new Error("injoignable");
          return Promise.resolve({ error: erreur });
        },
      };
    },
  };
}
/** Faux web-push : l'envoi se TERMINE plus tard, comme un vrai ; `refus` = { index: statusCode }. */
function fauxEnvoi(sequence = [], refus = {}) {
  const envois = [];
  const envoyer = async (subscription, corps, options) => {
    const i = Number(String(subscription.endpoint).split("/").pop());
    envois.push({ i, corps, charge: JSON.parse(corps), options });
    await new Promise((r) => setTimeout(r, 5));
    sequence.push("fin " + i);
    if (refus[i]) { const e = new Error("refus"); e.statusCode = refus[i]; throw e; }
  };
  return { envoyer, envois };
}
const notesDe = (admin) => admin.ecrits.filter((e) => e.nom === "analytics_events" && e.ligne && e.ligne.event === EVT_ENVOI);

test("① un appel MESURÉ : le même pid aléatoire et l'adresse sur chaque appareil, la charge d'appel intacte, la note APRÈS la fin des envois — pids et nombres seulement, sous systeme:appels ; le pid ne sort pas", async () => {
  const sequence = [];
  const admin = fauxAdmin(sequence);
  const { envoyer, envois } = fauxEnvoi(sequence);
  const r = await pousserAppareils({ admin, envoyer, abonnements: abonnements(2), charge: APPEL, options: OPTIONS_APPEL, accuse: ACK, tirage: 0 });
  assert.deepEqual(r, { sent: 2, morts: [] }, "ni le pid ni « mesuré » ne sortent : notify-call ne peut pas les rendre à l'appelant");
  assert.equal(envois.length, 2);
  const pid = envois[0].charge.pid;
  assert.match(pid, RE_UUID4);
  for (const e of envois) {
    assert.equal(e.charge.pid, pid, "UN pid par appel, partagé par ses appareils : la question est « la sonnerie s'est-elle affichée quelque part ? »");
    assert.deepEqual(e.charge.ack, ACK);
    const { pid: _p, ack: _a, ...reste } = e.charge;
    assert.deepEqual(reste, APPEL, "l'interface d'appel reçoit exactement ce qu'elle recevait");
    assert.deepEqual(e.options, OPTIONS_APPEL);
  }
  const notes = notesDe(admin);
  assert.equal(notes.length, 1, "une note par appel mesuré");
  assert.deepEqual(notes[0].ligne, { user_id: UID_APPELS, event: EVT_ENVOI, properties: { genre: GENRE_APPEL, pids: [pid], acceptes: 2 } });
  const texte = JSON.stringify(notes[0].ligne);
  for (const x of ["Léa", "🎸", "c_", "img", "video", APPEL.from]) assert.ok(!texte.includes(x), "rien de l'appelant dans la note : " + x);
  assert.deepEqual(sequence, ["fin 0", "fin 1", "note"], "la note suit la FIN des envois : elle ne retarde jamais la sonnerie");
  // Deux appels, deux pid : jamais dérivés de l'appel.
  const { envoyer: e2, envois: v2 } = fauxEnvoi();
  await pousserAppareils({ admin: fauxAdmin(), envoyer: e2, abonnements: abonnements(1), charge: APPEL, options: OPTIONS_APPEL, accuse: ACK, tirage: 0 });
  assert.notEqual(v2[0].charge.pid, pid);
});

test("② un appel NON tiré, ou sans adresse d'accusé : la charge d'avant, octet pour octet, et aucune note", async () => {
  for (const cas of [{ tirage: 0.5, accuse: ACK }, { tirage: 0.1, accuse: ACK }, { tirage: 0, accuse: null }]) {
    const admin = fauxAdmin();
    const { envoyer, envois } = fauxEnvoi();
    const r = await pousserAppareils({ admin, envoyer, abonnements: abonnements(2), charge: APPEL, options: OPTIONS_APPEL, ...cas });
    assert.equal(r.sent, 2);
    for (const e of envois) assert.equal(e.corps, JSON.stringify(APPEL), JSON.stringify(cas));
    assert.equal(notesDe(admin).length, 0, JSON.stringify(cas));
  }
});

test("③ une notification sociale ne porte JAMAIS d'accusé — même tirée, même avec une adresse : charge identique, aucune note", async () => {
  const admin = fauxAdmin();
  const { envoyer, envois } = fauxEnvoi();
  const r = await pousserAppareils({ admin, envoyer, abonnements: abonnements(3), charge: NOTIF, options: { TTL: 3600, urgency: "normal" }, accuse: ACK, tirage: 0 });
  assert.deepEqual(r, { sent: 3, morts: [] });
  for (const e of envois) {
    assert.equal(e.corps, JSON.stringify(NOTIF));
    assert.deepEqual(e.options, { TTL: 3600, urgency: "normal" });
  }
  assert.equal(notesDe(admin).length, 0);
  // `kind` absent : JSON.stringify l'omet, comme l'ancienne charge.
  const { envoyer: e2, envois: v2 } = fauxEnvoi();
  await pousserAppareils({ admin, envoyer: e2, abonnements: abonnements(1), charge: { type: "notif", text: "x", emoji: "🔔", kind: undefined }, options: {}, accuse: ACK, tirage: 0 });
  assert.equal(v2[0].corps, '{"type":"notif","text":"x","emoji":"🔔"}');
});

test("④ refus du service de notification : 404/410 rendent l'abonnement mort, un 500 non ; `acceptes` ne compte que les appareils acceptés ; aucun accepté → aucune note", async () => {
  const admin = fauxAdmin();
  const { envoyer } = fauxEnvoi([], { 0: 410, 1: 500, 3: 404 });
  const r = await pousserAppareils({ admin, envoyer, abonnements: abonnements(4), charge: APPEL, options: OPTIONS_APPEL, accuse: ACK, tirage: 0 });
  assert.deepEqual(r, { sent: 1, morts: ["https://fcm.googleapis.com/fcm/send/0", "https://fcm.googleapis.com/fcm/send/3"] });
  assert.equal(notesDe(admin)[0].ligne.properties.acceptes, 1);
  const personne = fauxAdmin();
  const { envoyer: e2 } = fauxEnvoi([], { 0: 500, 1: 410 });
  const r2 = await pousserAppareils({ admin: personne, envoyer: e2, abonnements: abonnements(2), charge: APPEL, options: OPTIONS_APPEL, accuse: ACK, tirage: 0 });
  assert.equal(r2.sent, 0);
  assert.equal(notesDe(personne).length, 0, "un appel qu'aucun service n'a accepté n'est pas une question de réception");
  // Aucun abonnement : rien n'est envoyé, rien n'est noté.
  const vide = fauxAdmin();
  assert.deepEqual(await pousserAppareils({ admin: vide, envoyer: e2, abonnements: [], charge: APPEL, options: OPTIONS_APPEL, accuse: ACK, tirage: 0 }), { sent: 0, morts: [] });
  assert.equal(vide.ecrits.length, 0);
});

test("⑤ la note refusée (débit de 120/min, panne) ou injoignable est DITE, avec son code, et ne casse rien : l'appel est parti", async () => {
  const dits = [];
  const refusee = fauxAdmin([], { erreur: { code: "P0001", message: "rate limit: max 120 insertions/minute sur analytics_events" } });
  const { envoyer } = fauxEnvoi();
  const r = await pousserAppareils({ admin: refusee, envoyer, abonnements: abonnements(2), charge: APPEL, options: OPTIONS_APPEL, accuse: ACK, tirage: 0, journal: (m) => dits.push(m) });
  assert.equal(r.sent, 2);
  assert.deepEqual(dits, ["notify-call : note d'envoi refusée P0001"], "le refus est lu dans `{ error }` : le SDK ne lève pas");
  assert.ok(!dits[0].includes("rate limit"), "le code, jamais le message (il peut porter des valeurs)");
  const injoignable = fauxAdmin([], { leve: true });
  const r2 = await pousserAppareils({ admin: injoignable, envoyer, abonnements: abonnements(1), charge: APPEL, options: OPTIONS_APPEL, accuse: ACK, tirage: 0, journal: (m) => dits.push(m) });
  assert.equal(r2.sent, 1);
  assert.equal(dits[1], "notify-call : note d'envoi injoignable");
  // Une note acceptée ne se dit pas.
  const tue = [];
  await pousserAppareils({ admin: fauxAdmin(), envoyer, abonnements: abonnements(1), charge: APPEL, options: OPTIONS_APPEL, accuse: ACK, tirage: 0, journal: (m) => tue.push(m) });
  assert.deepEqual(tue, []);
});

test("⑥ le tirage vient du SERVEUR (aléa cryptographique, dans [0, 1)) : un appel sur ECHANTILLON_APPELS est mesuré, sans tirage fourni comme avec", async () => {
  let mesures = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const x = tirer();
    assert.ok(x >= 0 && x < 1, String(x));
    if (appelMesure(x)) mesures++;
  }
  const attendu = 1 / ECHANTILLON_APPELS;
  assert.ok(Math.abs(mesures / N - attendu) < 0.02, `${mesures} sur ${N} : un sur ${ECHANTILLON_APPELS} attendu`);
  // Le chemin par défaut (notify-call ne fournit pas de tirage).
  let notes = 0;
  const M = 2000;
  const admin = { from: () => ({ insert: () => { notes++; return Promise.resolve({ error: null }); } }) };
  for (let i = 0; i < M; i++) await pousserAppareils({ admin, envoyer: async () => {}, abonnements: abonnements(1), charge: APPEL, options: OPTIONS_APPEL, accuse: ACK });
  assert.ok(Math.abs(notes / M - attendu) < 0.05, `${notes} appels mesurés sur ${M}`);
  const src = fs.readFileSync("supabase/functions/_shared/appels.js", "utf8");
  assert.match(src, /crypto\.getRandomValues\(a\)/);
  assert.doesNotMatch(src, /Math\.random/, "un aléa prévisible laisserait deviner quels appels sont jugés");
  assert.match(src, /tirage = tirer\(\)/, "le tirage par défaut est celui du serveur, jamais un champ de la requête");
});

test("⑦ câblage de notify-call : toute push par pousserAppareils, l'adresse par adresseAccuse, les refus d'avant intacts et AVANT l'envoi ; la réponse ne porte ni pid ni « mesuré »", () => {
  const src = fs.readFileSync("supabase/functions/notify-call/index.ts", "utf8");
  assert.match(src, /import \{ adresseAccuse \} from "\.\.\/_shared\/reception\.js";/);
  assert.match(src, /import \{ APPELS_ACTIFS, pousserAppareils \} from "\.\.\/_shared\/appels\.js";/);
  assert.match(src, /const ACCUSE = adresseAccuse\(\(n\) => Deno\.env\.get\(n\)\)\.accuse;/);
  const envoi = src.indexOf("await pousserAppareils({");
  assert.ok(envoi > 0, "l'envoi passe par le module éprouvé");
  assert.match(src.slice(envoi, envoi + 400), /admin, abonnements: subs, charge, options: \{ TTL: ttl, urgency \}, accuse: ACCUSE,/);
  assert.match(src.slice(envoi, envoi + 400), /envoyer: \(s: any, c: string, o: any\) => envoyerPushBorne\(\(a: any, b: string, d: any\) => webpush\.sendNotification\(a, b, d\), s, c, o\),/);
  assert.equal(src.split("webpush.sendNotification(").length - 1, 1, "aucun envoi direct ne contourne pousserAppareils");
  // Chaque refus d'avant reste un RETOUR, une seule fois, AVANT tout envoi : la porte
  // d'authentification, le plafond, le pilote (appels coupés), soi-même, le blocage, le
  // lien métier, l'absence d'appareil. (Épingler le `return` lui-même : la première
  // version ne regardait que la position d'un mot, et retirer le refus du blocage en
  // gardant sa lecture passait au vert — revue du 2026-11-07.)
  const refus = [
    'if (userErr || !userData?.user) return json({ error: "Non authentifié" }, 401);',
    "if (!verdict.ok) return reponsePlafond(verdict, corsHeaders);",
    'if (type === "call" && !APPELS_ACTIFS) return json({ ok: false, code: "appels_desactives"',
    'if (toUserId === fromUid) return json({ ok: true, sent: 0, note: "soi-même" });',
    'if (blocErr || (bloc && bloc.length)) return json({ ok: true, sent: 0, note: "aucun appareil abonné" });',
    'if (!lien.ok) return json({ ok: true, sent: 0, note: "aucun appareil abonné" });',
    'if (!decision.ok) return json({ ok: true, sent: 0, note: "aucun appareil abonné" });',
    'if (!subs.length) return json({ ok: true, sent: 0, note: "aucun appareil abonné" });',
  ];
  for (const r of refus) {
    assert.equal(src.split(r).length - 1, 1, "le refus existe, une fois : " + r);
    assert.ok(src.indexOf(r) < envoi, "refus avant l'envoi : " + r);
  }
  // L'appel ne passe AUCUN tirage : celui du serveur (`tirer`) s'applique, jamais un champ de la requête.
  const bloc = src.slice(envoi, src.indexOf("});", envoi));
  assert.doesNotMatch(bloc, /tirage/);
  // Le pilote reste sans appels : l'interrupteur, une seule source (_shared/appels.js), toujours false.
  assert.match(fs.readFileSync("supabase/functions/_shared/appels.js", "utf8"), /^export const APPELS_ACTIFS = false;$/m, "ce lot ne rouvre aucun appel");
  assert.doesNotMatch(src, /const APPELS_ACTIFS\s*=/, "notify-call ne redéfinit pas l'interrupteur : une seule source");
  // La réponse : `sent` seulement.
  assert.match(src, /const \{ sent, morts \} = await pousserAppareils\(\{/);
  assert.match(src.slice(envoi), /return json\(\{ ok: true, sent \}\);/);
  for (const m of src.matchAll(/json\(\{[^)]*\}/g)) assert.doesNotMatch(m[0], /\bpid\b|mesur|ack/, "aucune réponse ne porte l'accusé : " + m[0]);
  // La charge d'appel est celle que sw.js sait afficher.
  assert.match(src, /: \{ type: "call", callId, kind: kind \|\| "voice", from: fromUid, name: idn\.name, emoji: idn\.emoji \};/);
});
