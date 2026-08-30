// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL D'AUDIT — « aucune correction, aucun déploiement sans traçabilité ».
//
// C'est la seule mémoire de ce que le pilotage a FAIT : qui a lancé quoi, qui a
// supprimé quel compte, qui a appliqué quel correctif. Deux choses doivent
// tenir, et la seconde compte plus que la première :
//
//   1. le journal lui-même — ordre, bornes, filtres, forme des entrées ;
//   2. le fait que les gestes sensibles y écrivent VRAIMENT. Un journal
//      impeccable dans lequel personne n'écrit ne trace rien, et c'est
//      indiscernable d'un dépôt où il ne s'est rien passé.
//
// ⚠️ `DASH_DATA_DIR` est détourné vers un dossier temporaire AVANT tout import :
// sans ça, ce test écrirait dans le vrai journal d'audit de Benjamin.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "passio-audit-test-"));
process.env.DASH_DATA_DIR = TMP;
process.env.DASH_ALLOW_MUTATIONS = "true";
process.env.DASH_ENV = "development";
process.on("exit", () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

const { audit, listAudit } = await import("../server/audit.js");
const { config } = await import("../server/config.js");
const sessions = await import("../server/sessions.js");
const { _setAdminForTests } = await import("../server/ingest.js");
const { remove } = await import("../server/testusers.js");

assert.equal(config.dataDir, TMP, "le journal de test doit être isolé");

test("une entrée porte un identifiant, un horodatage, un acteur et ses détails", () => {
  const e = audit("essai", { a: 1 }, "benjamin");
  assert.match(e.id, /^au_/);
  assert.ok(e.ts > 0);
  assert.equal(e.action, "essai");
  assert.equal(e.actor, "benjamin");
  assert.deepEqual(e.details, { a: 1 });
  assert.equal(listAudit(1)[0].id, e.id, "la plus récente vient en tête");
});

test("l'acteur peut être absent — on ne perd pas l'entrée pour autant", () => {
  // Les actions de la sentinelle et des routines n'ont pas d'humain derrière.
  const e = audit("automatique", {});
  assert.equal(e.actor, null);
  assert.equal(listAudit(1)[0].action, "automatique");
});

test("filtres par action et par acteur, et plafond de lecture", () => {
  audit("filtre_a", {}, "lea");
  audit("filtre_a", {}, "benjamin");
  audit("filtre_b", {}, "lea");

  const parAction = listAudit(300, { action: "filtre_a" });
  assert.ok(parAction.length >= 2);
  assert.ok(parAction.every((i) => i.action === "filtre_a"));

  const parActeur = listAudit(300, { action: "filtre_a", actor: "lea" });
  assert.equal(parActeur.length, 1);
  assert.equal(parActeur[0].actor, "lea");

  assert.equal(listAudit(2).length, 2, "le plafond de lecture doit être respecté");
});

// ─── Ce que ça sert à prouver ────────────────────────────────────────────────
test("les gestes sensibles laissent réellement une trace", async () => {
  const trace = (action) => listAudit(500, { action });

  // ① Ouvrir et piloter une campagne de test.
  const s = sessions.create({ name: "Traçabilité" }, "benjamin");
  assert.equal(trace("test_session_create").some((e) => e.details.id === s.id), true);
  sessions.control(s.id, "start", "benjamin");
  assert.equal(trace("test_session_start").some((e) => e.details.id === s.id), true);
  sessions.addBug(s.id, { title: "Ça casse" }, "benjamin");
  assert.equal(trace("test_session_bug").some((e) => e.details.id === s.id), true);

  // ② Supprimer un compte jetable — le geste le plus destructeur du pilotage.
  //    Sans trace ici, une suppression serait strictement invisible après coup.
  _setAdminForTests({
    auth: { admin: {
      getUserById: async (id) => ({ data: { user: { id, email: "alpha@passio-e2e.test" } } }),
      deleteUser: async () => ({ error: null }),
    } },
  });
  await remove("u_e2e1", "benjamin");
  const suppression = trace("test_user_delete").find((e) => e.details.userId === "u_e2e1");
  assert.ok(suppression, "une suppression de compte doit laisser une trace");
  assert.equal(suppression.actor, "benjamin", "…et dire QUI l'a demandée");
  assert.equal(suppression.details.email, "alpha@passio-e2e.test");
});

test("un refus n'est pas enregistré comme une action effectuée", () => {
  // La nuance qui rend le journal lisible : on doit pouvoir répondre « ce compte
  // a-t-il été supprimé ? » par oui ou non, sans démêler des tentatives.
  const avant = listAudit(500, { action: "test_user_delete" }).length;
  assert.equal(sessions.control("ts_inexistante", "end", "benjamin"), null);
  assert.equal(listAudit(500, { action: "test_user_delete" }).length, avant);
  assert.equal(
    listAudit(500, { action: "test_session_end" }).some((e) => e.details.id === "ts_inexistante"),
    false, "une action sur une session inexistante ne doit pas être journalisée");
});
