// ═══════════════════════════════════════════════════════════════════════════
// SESSIONS ET ADRESSES DU POSTE (auth.js) — ce qui reste du Pilot mobile.
//
// La page téléphone du PC est RETIRÉE (2026-10-23, test/mobile-pilot.test.js) :
// le téléphone ouvre le pilotage en ligne. Restent ici les verrous de ce que
// `server/auth.js` fait toujours : la durée de session « rester connecté » et
// les adresses du poste qu'il annonce (elles mènent désormais au renvoi).
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { dureeSessionHeures } from "../server/auth.js";
import { config } from "../server/config.js";

test("rester connecté : seul `true` explicite allonge la session, et jamais au-delà de rememberDays", () => {
  assert.equal(dureeSessionHeures(undefined), config.sessionHours);
  assert.equal(dureeSessionHeures(false), config.sessionHours);
  assert.equal(dureeSessionHeures("true"), config.sessionHours, "une chaîne n'est pas une demande");
  assert.equal(dureeSessionHeures(1), config.sessionHours, "un nombre n'est pas une demande");
  assert.equal(dureeSessionHeures(true), config.rememberDays > 0 ? config.rememberDays * 24 : config.sessionHours);
  assert.ok(config.rememberDays <= 90, "plafond de 90 jours");
});
