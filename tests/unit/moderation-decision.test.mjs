// MOD-01 — le plan d'une décision de modération, éprouvé sans réseau.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { planRetrait, texteDecision, notificationPourSignalant, statutApresAction } = require("../../scripts/lib/moderation-decision.js");

test("① une publication se supprime, une rencontre s'ANNULE (jamais supprimée)", () => {
  assert.deepEqual(planRetrait("post", "p1").plan, { methode: "DELETE", chemin: "posts?id=eq.p1", libelle: "publication supprimée" });
  const ev = planRetrait("event", "ev1").plan;
  assert.equal(ev.methode, "PATCH");
  assert.equal(ev.chemin, "events?id=eq.ev1");
  assert.equal(ev.corps.status, "cancelled");
});

test("② un commentaire `ec_…` vise event_comments, les autres post_comments (l'erreur du 12/09)", () => {
  assert.match(planRetrait("comment", "ec_42").plan.chemin, /^event_comments\?/);
  assert.match(planRetrait("comment", "c_42").plan.chemin, /^post_comments\?/);
});

test("③ story et message se suppriment ; l'identifiant est encodé", () => {
  assert.equal(planRetrait("story", "s 1").plan.chemin, "stories?id=eq.s%201");
  assert.equal(planRetrait("message", "m&1").plan.chemin, "conv_messages?id=eq.m%261");
});

test("④ compte et passion : pas de plan, et la raison est dite", () => {
  const u = planRetrait("user", "u1"); assert.equal(u.plan, null); assert.match(u.raison, /suspendre/);
  const p = planRetrait("passion", "x"); assert.equal(p.plan, null); assert.match(p.raison, /passions-moderation/);
  assert.equal(planRetrait("post", "").plan, null);
  assert.equal(planRetrait("autre", "x").plan, null);
});

test("⑤ le texte de décision nomme la décision, jamais la cible, et reste borné", () => {
  assert.match(texteDecision("retrait"), /retiré/);
  assert.match(texteDecision("rejet"), /aucune infraction/);
  assert.match(texteDecision("note", "Merci."), /examiné\. Merci\./);
  assert.ok(texteDecision("retrait", "x".repeat(400)).length <= 200);
});

test("⑥ le signalant est prévenu s'il a un compte (uuid), jamais un placeholder u_…", () => {
  const n = notificationPourSignalant({ id: "r_1", reporter_id: "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31" }, "retrait", "");
  assert.equal(n.kind, "moderation");
  assert.equal(n.user_id, "3f2a9c64-5b71-4e2d-8a10-9c7b6d5e4f31");
  assert.equal(n.id, "n_mod_r_1");
  assert.equal(n.ref_id, "r_1");
  assert.equal(notificationPourSignalant({ id: "r_2", reporter_id: "u_visiteur" }, "retrait"), null);
  assert.equal(notificationPourSignalant({ id: "r_3", reporter_id: null }, "retrait"), null);
});

test("⑦ statut après action : rejet → dismissed, retrait/note → handled", () => {
  assert.equal(statutApresAction("rejet"), "dismissed");
  assert.equal(statutApresAction("retrait"), "handled");
  assert.equal(statutApresAction("note"), "handled");
});
