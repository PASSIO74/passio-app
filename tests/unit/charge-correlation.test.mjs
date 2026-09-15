// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-37 — le banc de charge perdait les événements reçus TROP TÔT.
//
// Chaque cas REPRODUIT d'abord le mécanisme d'AVANT (l'attente enregistrée
// après la réponse HTTP, et l'événement sans attente jeté en silence) et EXIGE
// que le corrélateur en diverge.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Correlateur } = require("../../scripts/lib/charge-correlation.js");

// Le mécanisme d'AVANT, en dix lignes : une Map, l'attente posée APRÈS la
// réponse, et un `if (a)` qui jette tout le reste.
function bancAvant() {
  const attentes = new Map();
  return {
    recevoir(id) { const a = attentes.get(id); if (a) { attentes.delete(id); a(true); } /* sinon : RIEN */ },
    attendre(id) { return new Promise((res) => attentes.set(id, res)); },
  };
}

// Un faux minuteur : le test contrôle le temps, il ne l'attend pas.
function horlogerie() {
  const prevus = [];
  return {
    minuteur: (fn, ms) => { const h = { fn, ms, annule: false }; prevus.push(h); return h; },
    annulerMinuteur: (h) => { if (h) h.annule = true; },
    ecouler() { for (const h of prevus.splice(0)) if (!h.annule) h.fn(); },
  };
}

test("① l'événement arrivé AVANT la réponse HTTP était perdu — il est désormais compté", async () => {
  // AVANT : l'événement arrive, aucune attente n'est posée → il est jeté.
  const avant = bancAvant();
  avant.recevoir("p1");                       // l'événement, en avance
  let resolu = false;
  avant.attendre("p1").then(() => { resolu = true; });   // l'attente, après coup
  await new Promise((r) => setImmediate(r));
  assert.equal(resolu, false, "reproduction : l'attente ne se résout jamais → « non reçu en 10 s »");

  // APRÈS : le tampon des arrivées précoces le retient.
  const h = horlogerie();
  const c = new Correlateur(h);
  assert.equal(c.recevoir("p1", 140), "en_avance");
  const r = await c.armer("p1", 100, { acteur: "u1" });
  assert.deepEqual([r.ok, r.ms, r.precoce], [true, 40, true]);
  assert.equal(c.resume().precoces, 1, "et il est DIT précoce — ce n'est pas la même chose qu'un reçu après");
});

test("② un événement reçu après l'armement est reçu, avec sa latence", async () => {
  const h = horlogerie();
  const c = new Correlateur(h);
  const p = c.armer("p2", 1000, { acteur: "u2" });
  assert.equal(c.recevoir("p2", 1250), "recu");
  const r = await p;
  assert.deepEqual([r.ok, r.ms, r.precoce], [true, 250, false]);
});

test("③ un événement jamais reçu expire, et l'expiration est comptée", async () => {
  const h = horlogerie();
  const c = new Correlateur(h);
  const p = c.armer("p3", 0, { acteur: "u3" });
  h.ecouler();
  const r = await p;
  assert.equal(r.ok, false);
  assert.match(r.motif, /non reçu/);
  assert.equal(c.resume().expires, 1);
});

test("④ un événement que le banc n'attendait pas est un ORPHELIN nommé, jamais un silence", () => {
  const h = horlogerie();
  const c = new Correlateur(h);
  c.recevoir("inconnu", 10);
  const r = c.cloturer();
  assert.equal(r.orphelins, 1);
  // ⚠️ Un orphelin n'est pas une erreur du serveur : c'est un événement hors
  // périmètre du banc. Le taire ferait disparaître un signal ; le compter comme
  // un échec ferait mentir la mesure.
  assert.equal(r.expires, 0);
  assert.ok(c.evenements.some((e) => e.etat === "orphelin" && e.id === "inconnu"));
});

test("⑤ le TAUX se calcule sur ce qui a été ARMÉ, jamais sur ce qui a été reçu", async () => {
  const h = horlogerie();
  const c = new Correlateur(h);
  const a = c.armer("a", 0), b = c.armer("b", 0), d = c.armer("d", 0);
  c.recevoir("a", 100); c.recevoir("b", 200);
  h.ecouler();
  await Promise.all([a, b, d]);
  const r = c.resume();
  assert.deepEqual([r.armes, r.recus, r.expires], [3, 2, 1]);
  assert.equal(Math.round(r.taux_reception * 100), 67, "2 reçus sur 3 ARMÉS — « p95 des seuls reçus » n'est pas « p95 de livraison »");
  assert.equal(r.complet, true, "reçus + expirés = armés : rien n'a disparu entre les deux");
});

test("⑥ chaque événement garde son acteur et son état — les échecs ne sont pas jetés", async () => {
  const h = horlogerie();
  const c = new Correlateur(h);
  const p1 = c.armer("x", 0, { acteur: "u1", palier: 25 });
  const p2 = c.armer("y", 0, { acteur: "u2", palier: 25 });
  c.recevoir("x", 30);
  h.ecouler();
  await Promise.all([p1, p2]);
  const etats = Object.fromEntries(c.evenements.map((e) => [e.id, e.etat]));
  assert.deepEqual(etats, { x: "recu", y: "non_recu" });
  assert.equal(c.evenements.find((e) => e.id === "y").acteur, "u2", "un échec conserve son acteur : sans lui on ne peut rien recouper");
  assert.ok(c.evenements.every((e) => e.palier === 25));
});

test("⑦ un doublon est compté, pas confondu avec un second reçu", () => {
  const h = horlogerie();
  const c = new Correlateur(h);
  c.recevoir("z", 10);
  assert.equal(c.recevoir("z", 20), "doublon");
  assert.equal(c.bilan.doublons, 1);
});

test("⑧ à la fermeture, une attente en cours est un échec NOMMÉ, jamais une promesse pendante", async () => {
  const h = horlogerie();
  const c = new Correlateur(h);
  const p = c.armer("w", 0, { acteur: "u9" });
  const r = c.cloturer();
  const v = await p;
  assert.equal(v.ok, false);
  assert.match(v.motif, /canal fermé/);
  assert.equal(r.expires, 1);
});
