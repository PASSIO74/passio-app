// MOD-01 — le plan d'une décision de modération, éprouvé sans réseau.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { planRetrait, planSuspension, planLevee, texteSuspension, notificationPourCible, texteDecision, notificationPourSignalant, statutApresAction, SUSPENSION_JOURS_MAX } = require("../../scripts/lib/moderation-decision.js");

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

test("⑧ MOD-01 : suspendre un compte = ban GoTrue en heures, borné à un entier de jours ; un uuid seulement", () => {
  const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const p = planSuspension(U, 7).plan;
  assert.deepEqual(p, { methode: "PUT", chemin: "auth/v1/admin/users/" + U, corps: { ban_duration: "168h" }, jours: 7, libelle: "compte suspendu 7 jours" });
  assert.equal(planSuspension(U, 1).plan.libelle, "compte suspendu 1 jour");
  assert.match(planSuspension("u_abc", 7).raison, /uuid/);
  assert.match(planSuspension(U, 0).raison, /entre 1 et/);
  assert.match(planSuspension(U, 2.5).raison, /entre 1 et/);
  assert.match(planSuspension(U, SUSPENSION_JOURS_MAX + 1).raison, /entre 1 et/);
  assert.equal(planSuspension(U, "7").plan.jours, 7);          // --jours arrive en chaîne : la lib convertit
  assert.match(planSuspension(U, "7.5").raison, /entre 1 et/);
  assert.deepEqual(planLevee(U).plan.corps, { ban_duration: "none" });
  assert.match(planLevee("").raison, /uuid/);
  assert.equal(planRetrait("user", U).plan, null);
  assert.match(planRetrait("user", U).raison, /suspendre/);
});

test("⑨ MOD-01 : la personne suspendue reçoit les motifs (DSA art. 17), le signalant la décision (art. 16) — tous deux bornés", () => {
  const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const n = notificationPourCible(U, 7, "harcèlement répété");
  assert.equal(n.user_id, U); assert.equal(n.kind, "moderation"); assert.equal(n.from_id, null);
  assert.equal(n.content, "Ton compte est suspendu 7 jours. Motif : harcèlement répété. Pour contester : passioadmin@gmail.com");
  assert.equal(notificationPourCible("u_visiteur", 7, ""), null);
  assert.ok(texteSuspension(3, "x".repeat(500)).length <= 200);
  assert.equal(texteDecision("suspension", ""), "Ton signalement a été examiné : le compte a été suspendu.");
  assert.equal(statutApresAction("suspension"), "handled");
});
