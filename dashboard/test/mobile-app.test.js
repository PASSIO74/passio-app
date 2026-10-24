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
import { dureeSessionHeures, adressesTelephone } from "../server/auth.js";
import { config } from "../server/config.js";

test("rester connecté : seul `true` explicite allonge la session, et jamais au-delà de rememberDays", () => {
  assert.equal(dureeSessionHeures(undefined), config.sessionHours);
  assert.equal(dureeSessionHeures(false), config.sessionHours);
  assert.equal(dureeSessionHeures("true"), config.sessionHours, "une chaîne n'est pas une demande");
  assert.equal(dureeSessionHeures(1), config.sessionHours, "un nombre n'est pas une demande");
  assert.equal(dureeSessionHeures(true), config.rememberDays > 0 ? config.rememberDays * 24 : config.sessionHours);
  assert.ok(config.rememberDays <= 90, "plafond de 90 jours");
});

test("adresses pour le téléphone : IPv4 privées et Tailscale seulement", () => {
  const faux = {
    lo: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
    wifi: [{ family: "IPv4", address: "192.168.1.20", internal: false }, { family: "IPv6", address: "fe80::1", internal: false }],
    eth: [{ family: 4, address: "10.0.0.5", internal: false }],
    tail: [{ family: "IPv4", address: "100.101.102.103", internal: false }],
    pub: [{ family: "IPv4", address: "82.64.1.2", internal: false }, { family: "IPv4", address: "169.254.3.4", internal: false }],
    docker: [{ family: "IPv4", address: "172.17.0.1", internal: false }],
  };
  assert.deepEqual(adressesTelephone(faux, 4610), [
    "http://192.168.1.20:4610/mobile.html",
    "http://10.0.0.5:4610/mobile.html",
    "http://100.101.102.103:4610/mobile.html",
    "http://172.17.0.1:4610/mobile.html",
  ]);
});
