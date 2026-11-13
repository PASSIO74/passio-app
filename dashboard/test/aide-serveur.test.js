// ═══════════════════════════════════════════════════════════════════════════
// L'AIDE DE TEST `demarrerServeur` — un serveur ne se dit prêt que s'il écoute LUI-MÊME.
//
// Le 12/11 (PR #866), deux serveurs de test tirés au sort sur le même port parmi 250 : le
// second mourait (EADDRINUSE), mais l'aide le disait prêt, parce que le PREMIER répondait à
// /api/health. Les neuf mots de passe faux du test F-02 bloquaient alors 5 minutes le serveur
// partagé de `audit-2026-11-06.test.js`, et sept tests tombaient en 429, sans rapport avec la
// PR. Reproduit à coup sûr avant la correction : deux `demarrerServeur({ port })` sur le même
// port rendaient la même adresse, et une connexion valide recevait 429.
//
// L'« occupant » ci-dessous imite ce serveur partagé : il répond 200 à tout ce qu'on lui envoie.
// Chaque exercice libère ce qu'il a ouvert, MÊME quand l'aide se trompe : un serveur ou un
// occupant oublié garde le processus de test en vie, et le fichier ne finit jamais.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { demarrerServeur, portLibre, MDP } from "./aide-serveur.js";

const DELAI = { timeout: 60_000 };

function occupant() {
  const recues = [];
  const s = http.createServer((req, res) => {
    recues.push(req.url);
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  return new Promise((ok) => s.listen(0, "127.0.0.1", () => ok({
    port: s.address().port, recues,
    fermer: () => new Promise((f) => { s.closeAllConnections?.(); s.close(() => f()); }),
  })));
}

const connexion = (base, user, password) => fetch(base + "/api/login", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user, password }),
});

test("un port imposé déjà pris : l'aide REFUSE de se dire prête — jamais la poignée de celui qui répond à sa place", DELAI, async () => {
  const o = await occupant();
  let s = null;
  try {
    await assert.rejects(async () => { s = await demarrerServeur({ port: o.port }); }, (e) => {
      assert.match(e.message, new RegExp(`n'a pas pu écouter sur le port ${o.port}`));
      assert.match(e.message, /EADDRINUSE/);
      return true;
    });
    assert.deepEqual(o.recues, [], "aucune requête ne doit partir vers l'occupant");
  } finally { s?.arreter(); await o.fermer(); }
});

test("un port pris entre son choix et l'écoute : l'aide en reprend un autre, et rien n'arrive à l'occupant", DELAI, async () => {
  const o = await occupant();
  let s = null, choix = 0;
  try {
    s = await demarrerServeur({ choisirPort: async () => (++choix === 1 ? o.port : portLibre()) });
    assert.equal(choix, 2);
    assert.notEqual(s.port, o.port);
    assert.ok(await s.cookieDe("admin_test"));
    assert.deepEqual(o.recues, [], "aucune requête ne doit partir vers l'occupant");
  } finally { s?.arreter(); await o.fermer(); }
});

test("deux serveurs sans port imposé : deux ports, et les échecs de connexion de l'un ne bloquent pas l'autre", DELAI, async () => {
  let a = null, b = null;
  try {
    a = await demarrerServeur();
    b = await demarrerServeur();
    assert.notEqual(a.port, b.port);
    for (let k = 0; k < 9; k++) await connexion(b.base, "admin_test", "faux");
    assert.equal((await connexion(b.base, "admin_test", MDP)).status, 429, "le second est bien bloqué");
    assert.equal((await connexion(a.base, "admin_test", MDP)).status, 200, "le premier ne l'est pas");
  } finally { a?.arreter(); b?.arreter(); }
});
