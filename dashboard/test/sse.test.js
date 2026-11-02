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
import { addClient, broadcast, clientCount, peutRecevoir, CAPACITE_PAR_TYPE } from "../server/sse.js";
import { can, capsFor } from "../server/auth.js";

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
  addClient(c, "admin");
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

// ─── Le flux porte les frontières des routes (audit du 2026-11-02) ───────────
// `/api/sentinel*` exige `claude` ; un diagnostic cite du code du dépôt et le
// résultat d'une réparation. Avant ce lot, `broadcast("sentinel", record)`
// l'écrivait à TOUS les abonnés de `/api/stream` — un `observer` recevait par
// la bande ce que la route lui refusait.

test("un diagnostic de la sentinelle n'est écrit qu'aux sessions qui ont la capacité `claude`", () => {
  const admin = faireClient(), dev = faireClient(), testeur = faireClient(), observateur = faireClient(), sansRole = faireClient();
  addClient(admin, "admin"); addClient(dev, "developer"); addClient(testeur, "tester"); addClient(observateur, "observer"); addClient(sansRole);
  const n = broadcast("sentinel", { id: "sd_2", analysis: "code du dépôt", repair: { branch: "sentinelle/x" } });
  assert.equal(n, 2, "admin et developer seulement");
  assert.equal(admin.ecrits.length, 1);
  assert.equal(dev.ecrits.length, 1);
  assert.equal(testeur.ecrits.length, 0, "tester n'a pas `claude` : rien");
  assert.equal(observateur.ecrits.length, 0, "observer n'a pas `claude` : rien");
  assert.equal(sansRole.ecrits.length, 0, "sans rôle connu : échec fermé");
  // Ce qui n'est réservé à aucune capacité arrive à tout le monde, comme avant.
  assert.equal(broadcast("event", { x: 1 }), 5);
  assert.equal(broadcast("alert", { x: 1 }), 5);
  assert.equal(broadcast("ping", { x: 1 }), 5);
  [admin, dev, testeur, observateur, sansRole].forEach((c) => c.ferme());
  assert.equal(clientCount(), 0);
});

test("chaque type réservé suit la capacité de SA route : la table est cohérente avec la matrice des rôles", () => {
  // Les types `sentinel*` suivent `claude` (routes /api/sentinel*), `test` suit `tests` (POST /api/tests/run).
  for (const t of ["sentinel", "sentinel_state", "sentinel_repair", "sentinel_autopilot", "sentinel_production", "sentinel_recurrence"]) {
    assert.equal(CAPACITE_PAR_TYPE[t], "claude", t);
  }
  assert.equal(CAPACITE_PAR_TYPE.test, "tests");
  // `peutRecevoir` dit exactement ce que `can` dit, rôle par rôle.
  for (const role of ["admin", "developer", "tester", "observer"]) {
    for (const [type, cap] of Object.entries(CAPACITE_PAR_TYPE)) assert.equal(peutRecevoir(role, type), can(role, cap), role + " / " + type);
    assert.equal(peutRecevoir(role, "event"), true, "un type libre reste lisible par " + role);
  }
  assert.equal(peutRecevoir(null, "sentinel"), false, "pas de rôle = pas de secret");
  assert.equal(peutRecevoir(null, "event"), true);
  assert.ok(capsFor("observer").includes("view") && !capsFor("observer").includes("claude"));
});
