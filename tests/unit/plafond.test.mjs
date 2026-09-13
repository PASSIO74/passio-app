// Verrous du plafond des Edge Functions (supabase/functions/_shared/plafond.js).
// Aucun réseau, aucun secret : le client service_role est un FAUX qui rejoue
// les lignes qu'on lui donne et note ce qu'on lui écrit. Le fichier testé est
// CELUI que Deno charge en production, pas une copie. `node --test tests/unit/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictDepuisComptes, verifierPlafondEnBase, reponsePlafond } from "../../supabase/functions/_shared/plafond.js";

const T0 = Date.parse("2026-09-12T20:00:00Z");
const s = (n) => T0 + n * 1000;
const P = { parMinute: 3, parHeure: 5 };

/**
 * Faux client supabase-js : `lignes` = horodatages (ms) des appels déjà
 * acceptés ; `ecrits` reçoit chaque insert ; `panne` force une erreur.
 */
function fauxAdmin({ lignes = [], panne = null } = {}) {
  const ecrits = [];
  const filtres = {};
  const requete = {
    select() { return requete; },
    eq(col, val) { filtres[col] = val; return requete; },
    gt(col, val) { filtres[col + ">"] = val; return requete; },
    order() { return requete; },
    limit() {
      if (panne === "lecture") return Promise.resolve({ data: null, error: { message: "panne" } });
      const depuis = Date.parse(filtres["created_at>"]);
      const data = lignes.filter((t) => t > depuis).sort((a, b) => a - b).map((t) => ({ created_at: new Date(t).toISOString() }));
      return Promise.resolve({ data, error: null });
    },
    insert(ligne) {
      ecrits.push(ligne);
      return Promise.resolve({ error: panne === "ecriture" ? { message: "panne" } : null });
    },
  };
  return { client: { from: (t) => { filtres.table = t; return requete; } }, ecrits, filtres };
}

test("① verdict pur : sous les deux plafonds, ça passe", () => {
  assert.deepEqual(verdictDepuisComptes({ minute: 2, heure: 4 }, P, T0), { ok: true });
});

test("② verdict pur : plafond minute atteint → délai jusqu'à la sortie du plus ancien", () => {
  const v = verdictDepuisComptes({ minute: 3, heure: 3, plusAncienMinuteMs: s(-30) }, P, T0);
  assert.equal(v.ok, false);
  assert.equal(v.retryAfterS, 30);
});

test("③ verdict pur : plafond horaire atteint → il prime, délai jusqu'à la sortie du plus ancien de l'heure", () => {
  const v = verdictDepuisComptes({ minute: 0, heure: 5, plusAncienHeureMs: s(-600) }, P, T0);
  assert.equal(v.ok, false);
  assert.equal(v.retryAfterS, 3000);
});

test("④ en base : sous le plafond, l'appel est ACCEPTÉ et sa ligne est ÉCRITE avec le bon événement", async () => {
  const { client, ecrits, filtres } = fauxAdmin({ lignes: [s(-10), s(-20)] });
  const v = await verifierPlafondEnBase(client, "u1", "ask-ai", P, T0);
  assert.equal(v.ok, true);
  assert.equal(ecrits.length, 1);
  assert.equal(ecrits[0].user_id, "u1");
  assert.equal(ecrits[0].event, "edge_ask-ai");
  assert.equal(filtres.table, "analytics_events");
  assert.equal(filtres.user_id, "u1");
  assert.equal(filtres.event, "edge_ask-ai");
});

test("⑤ en base : le 4ᵉ appel de la minute est REFUSÉ et n'écrit RIEN — insister ne repousse pas la fenêtre", async () => {
  const { client, ecrits } = fauxAdmin({ lignes: [s(-5), s(-10), s(-15)] });
  const v = await verifierPlafondEnBase(client, "u1", "ask-ai", P, T0);
  assert.equal(v.ok, false);
  assert.equal(v.retryAfterS, 45); // le plus ancien (−15 s) sort à +45 s
  assert.equal(ecrits.length, 0);
});

test("⑥ en base : des appels étalés sur l'heure butent sur le plafond horaire même si la minute est vide", async () => {
  const { client, ecrits } = fauxAdmin({ lignes: [s(-600), s(-1200), s(-1800), s(-2400), s(-3000)] });
  const v = await verifierPlafondEnBase(client, "u1", "notify-call", P, T0);
  assert.equal(v.ok, false);
  assert.equal(v.retryAfterS, 600); // −3000 s sort de l'heure à +600 s
  assert.equal(ecrits.length, 0);
});

test("⑦ en base : les lignes de plus d'une heure ne comptent plus", async () => {
  const { client } = fauxAdmin({ lignes: [s(-3601), s(-3700), s(-4000), s(-5000), s(-6000)] });
  const v = await verifierPlafondEnBase(client, "u1", "ask-ai", P, T0);
  assert.equal(v.ok, true);
});

test("⑧ en base : une PANNE de lecture ou d'écriture REFUSE l'appel (fail-closed), jamais ne le laisse passer", async () => {
  const lecture = fauxAdmin({ panne: "lecture" });
  assert.equal((await verifierPlafondEnBase(lecture.client, "u1", "ask-ai", P, T0)).ok, false);
  const ecriture = fauxAdmin({ panne: "ecriture" });
  assert.equal((await verifierPlafondEnBase(ecriture.client, "u1", "ask-ai", P, T0)).ok, false);
});

test("⑨ la réponse de refus est un 429 avec Retry-After, CORS et le délai en JSON", async () => {
  const r = reponsePlafond({ retryAfterS: 42 }, { "Access-Control-Allow-Origin": "*" });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("Retry-After"), "42");
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
  const corps = await r.json();
  assert.equal(corps.retry_after_s, 42);
  assert.match(corps.error, /Trop d'appels/);
});

test("⑩ RÉINJECTION — une boucle de 1 000 appels d'ask-ai n'en fait passer que 8 (contre 1 000 avant)", async () => {
  const reel = { parMinute: 8, parHeure: 60 };
  const lignes = [];
  const { client, ecrits } = fauxAdmin({ lignes });
  let passes = 0;
  for (let i = 0; i < 1000; i++) {
    const t = s(i * 0.05);
    const v = await verifierPlafondEnBase(client, "boucle", "ask-ai", reel, t);
    if (v.ok) { passes++; lignes.push(t); }
  }
  assert.equal(passes, 8);
  assert.equal(ecrits.length, 8);
});
