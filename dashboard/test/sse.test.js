// ═══════════════════════════════════════════════════════════════════════════
// FLUX TEMPS RÉEL (SSE) — le tuyau par lequel TOUT arrive à l'écran.
//
// Chaque panneau du pilotage — événements, alertes, diagnostics de la
// sentinelle, sortie des tests — passe par `broadcast`. Deux modes de panne, et
// aucun ne se voit depuis le navigateur :
//
//   1. UNE CONNEXION MORTE QUI RESTE INSCRITE. Un onglet fermé, un portable qui
//      s'endort : si le client n'est pas retiré, le `Set` enfle sans fin (fuite
//      mémoire d'un serveur censé tourner des semaines) et le décompte de
//      clients affiché en Observation devient faux.
//   2. UN CLIENT QUI FAIT TOMBER LES AUTRES. `res.write` peut lever sur une
//      socket morte. Sans capture, la boucle s'arrête au premier cadavre et les
//      navigateurs SUIVANTS ne reçoivent plus rien — un dashboard figé, sans
//      erreur, qui ressemble à « il ne se passe rien ».
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { addClient, broadcast, clientCount } from "../server/sse.js";

/** Faux `res` : retient ce qui lui est écrit, et sait mourir sur commande. */
function faireClient({ mort = false } = {}) {
  const c = {
    ecrits: [],
    ferme: null,
    write(s) { if (c.mort) throw new Error("socket fermée"); c.ecrits.push(s); return true; },
    on(ev, fn) { if (ev === "close") c.ferme = fn; },
    mort,
  };
  return c;
}

test("le cadre SSE est bien formé (type, données, ligne vide finale)", () => {
  const c = faireClient();
  addClient(c);
  const n = broadcast("sentinel", { id: "sd_1", verdict: "defect" });
  assert.equal(n, 1);
  assert.equal(c.ecrits.length, 1);
  const [ligneType, ligneData, ...reste] = c.ecrits[0].split("\n");
  assert.equal(ligneType, "event: sentinel");
  assert.deepEqual(JSON.parse(ligneData.replace(/^data: /, "")), { id: "sd_1", verdict: "defect" });
  assert.deepEqual(reste, ["", ""], "un cadre SSE se termine par une ligne vide");
  c.ferme();
});

test("un client fermé est retiré : pas de fuite dans le décompte", () => {
  const avant = clientCount();
  const c = faireClient();
  addClient(c);
  assert.equal(clientCount(), avant + 1);
  c.ferme();   // ce que le serveur HTTP émet quand l'onglet se ferme
  assert.equal(clientCount(), avant,
    "sans désinscription, le Set enfle indéfiniment et Observation ment sur " +
    "le nombre de navigateurs connectés.");
});

test("un client mort n'empêche pas les autres de recevoir", () => {
  const avant = clientCount();
  const a = faireClient();
  const mort = faireClient({ mort: true });
  const b = faireClient();
  [a, mort, b].forEach(addClient);
  assert.equal(clientCount(), avant + 3);

  const n = broadcast("event", { x: 1 });
  assert.equal(n, 2, "les deux clients vivants doivent être servis");
  assert.equal(a.ecrits.length, 1);
  assert.equal(b.ecrits.length, 1, "le client APRÈS le mort doit être servi aussi");
  assert.equal(clientCount(), avant + 2, "le client mort doit être retiré à la volée");

  a.ferme(); b.ferme();
  assert.equal(clientCount(), avant);
});

test("sans aucun client, la diffusion ne lève pas et rend 0", () => {
  // Cas normal la nuit : personne n'a le dashboard ouvert, l'ingestion continue.
  assert.equal(clientCount(), 0);
  assert.equal(broadcast("event", { x: 1 }), 0);
});
