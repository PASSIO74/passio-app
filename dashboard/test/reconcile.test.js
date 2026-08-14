// Tests de la réconciliation d'intégrité — en particulier la distinction entre
// contenu de DÉMO (local, normal) et VRAIS orphelins (données perdues).
// Le catalogue de règles est vérifié structurellement ; l'accès Supabase est
// hors périmètre ici (testé en conditions réelles via /api/reconcile).
import { test } from "node:test";
import assert from "node:assert/strict";
// SEED_ID vient du module lui-même : pas de copie du motif ici, sinon les deux
// dérivent en silence et le test finit par valider une règle qui n'existe plus.
import { RULES, SEED_ID, buildReconcilePrompt } from "../server/reconcile.js";

test("les identifiants de démo sont reconnus (pas des anomalies)", () => {
  const seeds = ["u_lea", "u_karim", "p1", "p14", "pm1", "e2", "e35",
    "p_vlog_marrakech", "pac_podcast", "reel_seed_cuisine_1", "photo", "podcast", "me"];
  for (const s of seeds) assert.ok(SEED_ID.test(s), `${s} devrait être classé démo`);
});

test("les vrais identifiants générés ne sont PAS classés démo", () => {
  const reals = [
    "xjsaxbll7mqfnx04m", "xeivl4iozmqsegcg7",
    "reel_xycob3o9lmqwlk8fn", "reel_xmnlkg5cfmqwlmtsv",
    "be85fb9f-a3ca-4ded-80a4-b9da22e4a0a0",
    "msg_x9f2k", "u2",
  ];
  for (const r of reals) assert.ok(!SEED_ID.test(r), `${r} ne doit PAS être classé démo`);
});

test("« reel_seed_x » est démo mais « reel_<base36> » est réel (pas de confusion)", () => {
  assert.ok(SEED_ID.test("reel_seed_musique_1"));
  assert.ok(!SEED_ID.test("reel_xs62syuyzmqxczqt7"));
});

test("chaque règle déclare id, libellé, gravité, impact et une mesure", () => {
  assert.ok(RULES.length >= 8, "au moins 8 règles d'intégrité");
  const ids = new Set();
  for (const r of RULES) {
    assert.ok(r.id && typeof r.id === "string", "id manquant");
    assert.ok(!ids.has(r.id), "id dupliqué : " + r.id);
    ids.add(r.id);
    assert.ok(r.label && r.label.length > 3, "libellé manquant : " + r.id);
    assert.ok(["error", "warn"].includes(r.severity), "gravité invalide : " + r.id);
    assert.ok(r.impact && r.impact.length > 20, "impact non expliqué : " + r.id);
    assert.equal(typeof r.run, "function", "mesure manquante : " + r.id);
  }
});

test("les invariants projet critiques sont couverts", () => {
  const ids = RULES.map((r) => r.id);
  // Jamais de base64 en DB (messages ET publications), bobine sans média invisible.
  assert.ok(ids.includes("base64_messages"));
  assert.ok(ids.includes("base64_posts"));
  assert.ok(ids.includes("bobines_sans_media"));
  // Un message rattaché à une conversation absente n'atteindra jamais personne.
  assert.ok(ids.includes("messages_orphelins"));
});

test("le prompt de réparation exige une SIMULATION avant toute écriture", () => {
  const p = buildReconcilePrompt({
    label: "Bobines sans média", count: 7, distinct: 7,
    impact: "Une bobine sans URL Storage est invisible.", samples: ["reel_a", "reel_b"], partial: false,
  });
  assert.match(p, /simulation/i);
  assert.match(p, /idempotent/i);
  assert.match(p, /Bobines sans média/);
  assert.match(p, /reel_a/);
  // Ne doit jamais encourager une suppression aveugle.
  assert.match(p, /jamais supprimer une donnée récupérable/i);
});

test("un RÉSIDU (sans récidive) oriente vers le nettoyage, pas vers un correctif de code", () => {
  const p = buildReconcilePrompt({
    label: "Bobines sans média", status: "residue", count: 7,
    impact: "Une bobine sans URL Storage est invisible.",
    lastAt: Date.now() - 38 * 86400_000, recentCount: 0, samples: [],
  });
  assert.match(p, /il y a 38 jour\(s\)/);
  assert.match(p, /RÉSIDU/);
  assert.match(p, /déjà corrigé/i);
  // Doit exiger de vérifier l'historique git AVANT de proposer un correctif.
  assert.match(p, /git log -S/);
});

test("une anomalie ACTIVE ne porte pas la mention « résidu »", () => {
  const p = buildReconcilePrompt({
    label: "Messages sans conversation", status: "error", count: 3,
    impact: "Le message n'atteindra jamais son destinataire.",
    lastAt: Date.now() - 3600_000, recentCount: 3, samples: [],
  });
  assert.match(p, /il y a 0 jour\(s\)/);
  assert.ok(!/RÉSIDU/.test(p), "ne doit pas être présenté comme un résidu");
});

test("une anomalie non datable ne présume rien (ni résidu, ni récidive)", () => {
  const p = buildReconcilePrompt({
    label: "J'aime sans publication", status: "warn", count: 2,
    impact: "Compteurs faussés par un j'aime orphelin.", lastAt: null, samples: [],
  });
  assert.ok(!/Dernière occurrence/.test(p));
  assert.ok(!/RÉSIDU/.test(p));
});

test("une analyse partielle est signalée comme minorant dans le prompt", () => {
  const p = buildReconcilePrompt({
    label: "X", count: 5000, impact: "…………………………………………", samples: [], partial: true,
  });
  assert.match(p, /PARTIELLE/);
  assert.match(p, /minorant/);
});
