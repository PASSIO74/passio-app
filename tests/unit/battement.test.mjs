// Battement de la veille (2026-11-06) : une preuve de TRAVAIL, lue par le
// téléphone et par le chien de garde extérieur (veille-production, GitHub).
// Mutation éprouvée à la main : `resumerBattement` qui rend « vivant » sans
// regarder l'âge → ② rougit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contenuBattement, resumerBattement, BATTEMENT_PERIME_MS, BATTEMENTS_ATTENDUS_24H, LECTURES_BATTEMENT } from "../../supabase/functions/_shared/battement.js";

const T = Date.parse("2026-11-06T12:00:00Z");
const ok = { status: "fulfilled", value: {} };
const ko = { status: "rejected", reason: new Error("HTTP 401") };

test("① le contenu dit ce que la veille a lu et décidé, en codes fermés", () => {
  const c = contenuBattement({
    lectures: { sante: ok, signalements: ok, github: ko, parcours: ok },
    verdict: { couleur: "orange" }, sonne: false,
    gestes: { delestage: { niveau: 0 }, reveil: { raison: "politique:pause" }, retour: { inactif: true }, canari: { emis: true }, x: { erreur: "boom\nsecret" } },
    politique: { version: 1, mode: "applique", valide: true },
    parcours: { parcours: [{ etat: "panne", juges: 4 }, { etat: "sain", juges: 9 }], tronque: false },
    revision: "abc1234", dureeMs: 812.4,
  });
  assert.deepEqual(c.lectures, { sante: "ok", signalements: "ok", github: "ko", parcours: "ok" });
  assert.deepEqual(c.gestes, { delestage: "niveau:0", reveil: "politique:pause", retour: "inactif", canari: "fait", x: "erreur:boom secret" });
  assert.equal(c.voyant, "orange");
  assert.deepEqual(c.parcours, { panne: 1, degrade: 0, juges: 13, tronque: false });
  assert.equal(c.dureeMs, 812);
  assert.equal(JSON.stringify(c).includes("\n"), false, "aucun retour à la ligne : pas de texte libre recopié");
});

test("② absent, périmé, incomplet, vivant — jamais sain sans fraîcheur", () => {
  assert.equal(resumerBattement(null, 0, T).etat, "jamais");
  const vieux = resumerBattement({ created_at: new Date(T - BATTEMENT_PERIME_MS - 60e3).toISOString(), properties: { lectures: { sante: "ok", signalements: "ok", github: "ok", parcours: "ok" } } }, 3, T);
  assert.equal(vieux.etat, "arrete");
  assert.equal(vieux.frais, false);
  assert.match(vieux.raisons[0], /alertes du téléphone sont muettes/);
  const incomplet = resumerBattement({ created_at: new Date(T - 5 * 60e3).toISOString(), properties: { lectures: { sante: "ok", signalements: "ok", github: "ko", parcours: "ok" } } }, 90, T);
  assert.equal(incomplet.etat, "incomplet");
  assert.deepEqual(incomplet.lecturesKo, ["github"]);
  const polKo = resumerBattement({ created_at: new Date(T - 5 * 60e3).toISOString(), properties: { lectures: Object.fromEntries(LECTURES_BATTEMENT.map((k) => [k, "ok"])), politique: { valide: false } } }, 90, T);
  assert.equal(polKo.etat, "incomplet");
  const vivant = resumerBattement({ created_at: new Date(T - 5 * 60e3).toISOString(), properties: { lectures: Object.fromEntries(LECTURES_BATTEMENT.map((k) => [k, "ok"])) } }, 95, T);
  assert.equal(vivant.etat, "vivant");
  assert.equal(vivant.battements24h, 95);
  assert.equal(vivant.attendus24h, BATTEMENTS_ATTENDUS_24H);
});

test("③ une horodate sans fuseau (timestamp) est lue en UTC ; illisible = arrêtée", () => {
  const naif = new Date(T - 5 * 60e3).toISOString().replace("T", " ").replace("Z", "");
  const r = resumerBattement({ created_at: naif, properties: { lectures: Object.fromEntries(LECTURES_BATTEMENT.map((k) => [k, "ok"])) } }, null, T);
  assert.equal(r.etat, "vivant");
  assert.equal(Math.round(r.ageMs / 60e3), 5);
  assert.equal(resumerBattement({ created_at: "n'importe quoi", properties: {} }, null, T).etat, "arrete");
});

test("④ des rappels en échec rendent la veille « incomplète » — ils dormaient dans rappels_echec, que rien ne lisait ; un battement d'avant, sans la clé, n'en dit rien", () => {
  const ok = Object.fromEntries(LECTURES_BATTEMENT.map((k) => [k, "ok"]));
  const ko = resumerBattement({ created_at: new Date(T - 5 * 60e3).toISOString(), properties: { lectures: { ...ok, rappels: "ko" } } }, 96, T);
  assert.equal(ko.etat, "incomplet");
  assert.ok(ko.raisons.some((r) => /rappels d'activité ont échoué/.test(r)));
  assert.equal(resumerBattement({ created_at: new Date(T - 5 * 60e3).toISOString(), properties: { lectures: { ...ok, rappels: "ok" } } }, 96, T).etat, "vivant");
  assert.equal(resumerBattement({ created_at: new Date(T - 5 * 60e3).toISOString(), properties: { lectures: ok } }, 96, T).etat, "vivant");
});
