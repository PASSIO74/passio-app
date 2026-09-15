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

// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-38 — « suspension levée » annoncé malgré une relecture impossible.
//
// Chaque cas REPRODUIT d'abord le code d'AVANT (deux lignes, à l'octet près) et
// EXIGE que la décision corrigée en diverge.
// ═══════════════════════════════════════════════════════════════════════════
const { verdictRelectureSuspension } = require("../../scripts/lib/moderation-decision.js");
const UID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUTRE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T = new Date("2026-09-15T12:00:00Z");

// AVANT : `.then(x => x.json()).catch(() => null)` puis
//         `const encore = relu && relu.banned_until && …futur`
//         `if (encore) sortir(…)`  → sinon, succès annoncé.
const leveAvant = (relu) => !(relu && relu.banned_until && new Date(relu.banned_until).getTime() > T.getTime());

test("ASTRA-38 ① une erreur RÉSEAU annonçait la levée", () => {
  assert.equal(leveAvant(null), true, "reproduction : `relu = null` valait « levée »");
  const v = verdictRelectureSuspension({ reseau: "fetch failed" }, UID, "levee", T);
  assert.equal(v.verifie, false);
  assert.match(v.motif, /relecture impossible/);
});

test("ASTRA-38 ② un HTTP 403/500 avec un corps JSON d'erreur annonçait la levée", () => {
  const corpsErreur = { message: "forbidden" };
  assert.equal(leveAvant(corpsErreur), true, "reproduction : pas de `banned_until`, donc « levée »");
  for (const status of [403, 500, 404]) {
    const v = verdictRelectureSuspension({ ok: false, status, corps: corpsErreur }, UID, "levee", T);
    assert.equal(v.verifie, false, "HTTP " + status);
    assert.match(v.motif, new RegExp("HTTP " + status));
  }
});

test("ASTRA-38 ③ la réponse d'un AUTRE compte n'est pas une preuve", () => {
  const autre = { id: AUTRE };
  assert.equal(leveAvant(autre), true, "reproduction : l'identité n'était jamais comparée");
  const v = verdictRelectureSuspension({ ok: true, status: 200, corps: autre }, UID, "levee", T);
  assert.equal(v.verifie, false);
  assert.match(v.motif, /AUTRE compte/);
});

test("ASTRA-38 ④ un corps illisible ou sans `id` n'est pas une preuve", () => {
  for (const corps of [undefined, null, [], "texte", { message: "x" }]) {
    const v = verdictRelectureSuspension({ ok: true, status: 200, corps }, UID, "levee", T);
    assert.equal(v.verifie, false, JSON.stringify(corps));
  }
});

test("ASTRA-38 ⑤ une levée RÉELLE est vérifiée et conforme", () => {
  const v = verdictRelectureSuspension({ ok: true, status: 200, corps: { id: UID, banned_until: null } }, UID, "levee", T);
  assert.deepEqual([v.verifie, v.conforme], [true, true]);
  // Une borne DÉJÀ passée vaut levée : GoTrue laisse parfois la valeur en place.
  const passee = verdictRelectureSuspension({ ok: true, status: 200, corps: { id: UID, banned_until: "2020-01-01T00:00:00Z" } }, UID, "levee", T);
  assert.deepEqual([passee.verifie, passee.conforme], [true, true]);
});

test("ASTRA-38 ⑥ une suspension qui tient encore est vérifiée et NON conforme", () => {
  const v = verdictRelectureSuspension({ ok: true, status: 200, corps: { id: UID, banned_until: "2099-01-01T00:00:00Z" } }, UID, "levee", T);
  assert.equal(v.verifie, true, "on a bien lu — c'est le résultat qui n'est pas celui attendu");
  assert.equal(v.conforme, false);
  assert.match(v.motif, /tient encore/);
});

test("ASTRA-38 ⑦ le sens SUSPENDRE partage la même décision, y compris sur l'identité", () => {
  const ok = verdictRelectureSuspension({ ok: true, status: 200, corps: { id: UID, banned_until: "2099-01-01T00:00:00Z" } }, UID, "suspendu", T);
  assert.deepEqual([ok.verifie, ok.conforme], [true, true]);
  assert.equal(ok.jusqu, "2099-01-01T00:00:00Z");
  const pasPose = verdictRelectureSuspension({ ok: true, status: 200, corps: { id: UID, banned_until: null } }, UID, "suspendu", T);
  assert.deepEqual([pasPose.verifie, pasPose.conforme], [true, false]);
  // AVANT : ce chemin échouait FERMÉ par direction, mais ne lisait ni `r.ok`
  // ni l'identité — une relecture d'un autre compte SUSPENDU l'aurait verdi.
  const autreSuspendu = verdictRelectureSuspension({ ok: true, status: 200, corps: { id: AUTRE, banned_until: "2099-01-01T00:00:00Z" } }, UID, "suspendu", T);
  assert.equal(autreSuspendu.verifie, false, "le bon compte, ou rien");
});
