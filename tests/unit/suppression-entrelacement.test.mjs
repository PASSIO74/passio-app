// ASTRA-56 (sixième contre-revue, 2026-09-16) — L'ENTRELACEMENT DE DEUX
// TENTATIVES DE SUPPRESSION, rejoué avec les VRAIES fonctions applicatives
// (`traiterSuppression` → `purgerCompte`) et un MODÈLE des transitions SQL
// (`fauxAdmin({ barriere: "modele", modele: "v2" | "v3" })`).
//
// Le contre-exemple d'Astra, tel quel :
//   A termine la purge et place le marqueur à `purgee` ; A attend encore la
//   suppression Auth. B reprend immédiatement ce marqueur. B échoue à attendre
//   les écritures en vol et place le marqueur à `echec`. La protection contre
//   les écritures disparaît. Une nouvelle ligne `user_state` est écrite avant
//   la fin Auth de A. A termine Auth, mais son ancien jeton ne peut plus
//   finaliser le marqueur. Le handler annonce néanmoins 200, ok:true,
//   garantie:"barriere". Résultat : marqueur réel `echec`, une ligne restante.
//
// Ici, DÉTERMINISTE : la suppression Auth de A est une promesse que le test
// tient ouverte le temps de jouer B et l'écriture, puis relâche.
//   ① modèle v2 (le texte du 15/09) + handler corrigé : le marqueur finit bien
//      en `echec` avec une ligne restante (le défaut SQL est là) — mais le
//      handler ne prononce PLUS `garantie` : il rend l'état réel, code distinct ;
//   ② modèle v3 : B n'obtient rien (tentative vivante), l'écriture est refusée,
//      A finalise : 200, garantie, marqueur `supprimee`, zéro ligne ;
//   ③ tentative INTERROMPUE (A meurt après `purgee`, 15 min passent) : B reprend,
//      termine (Auth déjà parti pour A), et A, revenu tard, ne prononce rien ;
//   ④ ÉCHEC AUTH : A rend 500 `auth_non_supprime`, la protection reste, la
//      tentative est terminée → B reprend AUSSITÔT et finit ; l'écriture entre
//      les deux est refusée ;
//   ⑤ reprise après `auth_echec` qui échoue en vol : la protection est
//      CONSERVÉE (jamais `echec` après une purge), et la réponse dit que les
//      données sont déjà parties ;
//   ⑥ `deleteUser` sur un utilisateur déjà absent est une reprise, pas un échec.
import { test } from "node:test";
import assert from "node:assert/strict";
import { traiterSuppression, MESSAGE_DONNEES_PURGEES } from "../../supabase/functions/_shared/suppression-compte.js";
import { fauxAdmin, U } from "./lib/faux-admin-purge.mjs";

const JA = "aaaaaaaa-1111-4111-8111-111111111111";
const JB = "bbbbbbbb-2222-4222-8222-222222222222";
const tick = () => new Promise((r) => setImmediate(r));

/** Une suppression Auth que le test tient OUVERTE jusqu'à `relacher(resultat)`. */
function authTenue() {
  const etat = { appelee: false, relacher: null };
  const supprimerAuth = () => { etat.appelee = true; return new Promise((resolve) => { etat.relacher = (error = null) => resolve({ error }); }); };
  return { etat, supprimerAuth, async attendreAppel() { for (let i = 0; i < 200 && !etat.appelee; i++) await tick(); assert.ok(etat.appelee, "A a atteint deleteUser"); } };
}
const authImmediate = (error = null) => async () => ({ error });

// Le scénario commun : A purge et attend Auth ; B tente pendant ce temps et
// ÉCHOUE en vol (2e appel d'`attendre_ecritures_en_vol`) ; un client écrit.
async function entrelacer(modele) {
  const admin = fauxAdmin({
    tables: { user_state: [{ user_id: U }], profiles: [{ id: U }] },
    barriere: "modele", modele,
    enVol: (n) => (n === 2 ? { en_vol_initial: 1, restantes: 1, attendu_ms: 5000 } : { en_vol_initial: 0, restantes: 0, attendu_ms: 0 }),
  });
  const authA = authTenue();
  const pA = traiterSuppression(admin, U, { supprimerAuth: authA.supprimerAuth, jeton: JA });
  await authA.attendreAppel();
  assert.equal(admin.marqueur().statut, "purgee", "A a purgé et attend Auth");
  const rB = await traiterSuppression(admin, U, { supprimerAuth: authImmediate(), jeton: JB });
  const ecriture = admin.ecrire("user_state", { user_id: U, blob: "tardif" });
  authA.etat.relacher(null);
  const rA = await pA;
  return { admin, rA, rB, ecriture };
}

test("① AVANT (modèle v2) : B reprend `purgee`, échoue, lève la protection ; une ligne passe ; A ne peut plus finaliser — et le handler NE PRONONCE PAS `garantie`", async () => {
  const { admin, rA, rB, ecriture } = await entrelacer("v2");
  // Le défaut SQL, reproduit : B a obtenu le marqueur d'une tentative vivante…
  assert.equal(rB.status, 409);
  assert.equal(rB.body.code, "en_vol");
  assert.equal(admin.marqueur().statut, "echec", "…et son échec a LEVÉ la protection");
  assert.equal(ecriture.ok, true, "une ligne user_state est écrite pendant que A attend Auth");
  assert.equal(admin._t.user_state.length, 1, "résultat : une ligne restante");
  // Le handler corrigé : A a supprimé Auth, mais la finalisation est refusée
  // (jeton repris) — aucun 200, aucune garantie, l'état RÉEL est rendu.
  assert.equal(rA.status, 500);
  assert.equal(rA.body.ok, false);
  assert.equal(rA.body.code, "finalisation_refusee");
  assert.equal(rA.body.garantie, undefined, "jamais `garantie` sur un état supposé");
  assert.equal(rA.body.auth_supprimee, true);
  assert.equal(rA.body.marqueur, "echec", "l'état rendu est celui lu en base, pas `purgee` supposé");
  assert.equal(rA.body.motif, "jeton_perime");
});

test("② APRÈS (modèle v3) : une tentative vivante n'est pas reprise, l'écriture est refusée, A finalise avec garantie", async () => {
  const { admin, rA, rB, ecriture } = await entrelacer("v3");
  assert.deepEqual([rB.status, rB.body.code], [409, "deja_en_cours"], "B n'obtient rien : A est vivante (Auth en cours)");
  assert.ok(rB.body.notes.some((n) => /vivante/.test(n)), "et la raison est dite");
  assert.equal(ecriture.ok, false, "l'écriture est refusée (trigger) : la protection n'a pas bougé pendant que A attendait Auth");
  assert.equal(ecriture.code, "42501");
  assert.equal(admin._t.user_state.length, 0, "zéro ligne restante");
  assert.deepEqual([rA.status, rA.body.ok, rA.body.garantie, rA.body.marqueur], [200, true, "barriere", "supprimee"]);
  assert.equal(admin.marqueur().statut, "supprimee");
  assert.equal(admin.marqueur().tentative_vivante, false);
  // B n'a jamais appelé `attendre_ecritures_en_vol` : un seul appel, celui de A.
  assert.equal(admin._a.filter((x) => x.nom === "attendre_ecritures_en_vol").length, 1);
});

test("③ tentative INTERROMPUE : A meurt après `purgee` ; 15 min plus tard B reprend et finit ; A revenue tard ne prononce rien", async () => {
  let t0 = Date.now();
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, barriere: "modele", modele: "v3", horloge: () => t0 });
  const authA = authTenue();
  const pA = traiterSuppression(admin, U, { supprimerAuth: authA.supprimerAuth, jeton: JA });
  await authA.attendreAppel();
  // Trop tôt : B n'obtient rien.
  const tot = await traiterSuppression(admin, U, { supprimerAuth: authImmediate(), jeton: JB });
  assert.equal(tot.body.code, "deja_en_cours");
  assert.equal(admin.ecrire("user_state", { user_id: U }).ok, false, "protégé pendant ce temps");
  // 16 minutes passent : la tentative de A est réputée morte.
  t0 += 16 * 60 * 1000;
  const rB = await traiterSuppression(admin, U, { supprimerAuth: authImmediate(), jeton: JB });
  assert.deepEqual([rB.status, rB.body.ok, rB.body.garantie, rB.body.marqueur], [200, true, "barriere", "supprimee"]);
  assert.ok(rB.body.notes.some((n) => /déjà été purgées/.test(n)), "B sait qu'il reprend une purge faite");
  // A revient : son deleteUser trouve un utilisateur déjà absent (B l'a supprimé) — c'est une reprise, pas un échec…
  authA.etat.relacher({ message: "User not found", status: 404 });
  const rA = await pA;
  // …mais SON jeton ne peut plus finaliser : aucune garantie prononcée, état réel rendu.
  assert.deepEqual([rA.status, rA.body.code, rA.body.garantie, rA.body.marqueur, rA.body.protection], [500, "finalisation_refusee", undefined, "supprimee", true]);
  assert.equal(admin.marqueur().statut, "supprimee");
  assert.equal(admin.marqueur().jeton, JB, "le marqueur est à B, qui a fini");
});

test("④ ÉCHEC AUTH : 500 auth_non_supprime, protection conservée, tentative TERMINÉE → B reprend aussitôt et finit", async () => {
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, barriere: "modele", modele: "v3" });
  const rA = await traiterSuppression(admin, U, { supprimerAuth: authImmediate({ message: "GoTrue indisponible" }), jeton: JA });
  assert.deepEqual([rA.status, rA.body.code, rA.body.donnees_purgees, rA.body.barriere, rA.body.marqueur], [500, "auth_non_supprime", true, "conservee", "purgee"]);
  const m = admin.marqueur();
  assert.deepEqual([m.statut, m.tentative_vivante, m.derniere_erreur], ["purgee", false, { auth: "GoTrue indisponible" }]);
  assert.equal(admin.ecrire("user_state", { user_id: U }).ok, false, "aucune écriture entre les deux tentatives");
  const rB = await traiterSuppression(admin, U, { supprimerAuth: authImmediate(), jeton: JB });
  assert.deepEqual([rB.status, rB.body.ok, rB.body.garantie, rB.body.marqueur], [200, true, "barriere", "supprimee"], "reprise sans attendre 15 min");
  assert.equal(admin.marqueur().tentatives, 2);
  assert.equal(admin._t.user_state.length, 0);
});

test("⑤ reprise après `auth_echec` qui échoue en vol : JAMAIS `echec` après une purge — protection conservée, données dites parties", async () => {
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] }, barriere: "modele", modele: "v3",
    enVol: (n) => (n === 2 ? { en_vol_initial: 1, restantes: 1, attendu_ms: 5000 } : { en_vol_initial: 0, restantes: 0, attendu_ms: 0 }) });
  await traiterSuppression(admin, U, { supprimerAuth: authImmediate({ message: "panne" }), jeton: JA });
  const rB = await traiterSuppression(admin, U, { supprimerAuth: authImmediate(), jeton: JB });
  assert.deepEqual([rB.status, rB.body.code, rB.body.donnees_purgees, rB.body.barriere, rB.body.marqueur], [409, "en_vol", true, "conservee", "purgee"]);
  assert.equal(rB.body.error, MESSAGE_DONNEES_PURGEES.en_vol, "le message ne dit pas « rien n'a été supprimé »");
  assert.equal(admin.marqueur().statut, "purgee");
  assert.equal(admin.ecrire("user_state", { user_id: U }).ok, false, "toujours protégé");
  // Et la tentative de B est terminée : une troisième reprend aussitôt.
  const rC = await traiterSuppression(admin, U, { supprimerAuth: authImmediate(), jeton: "cccccccc-3333-4333-8333-333333333333" });
  assert.deepEqual([rC.status, rC.body.marqueur], [200, "supprimee"]);
});

test("⑥ `deleteUser` sur un utilisateur déjà absent = reprise d'une suppression interrompue après Auth, pas un échec", async () => {
  const admin = fauxAdmin({ tables: {}, barriere: "modele", modele: "v3" });
  const r = await traiterSuppression(admin, U, { supprimerAuth: authImmediate({ message: "User not found", status: 404 }), jeton: JA });
  assert.deepEqual([r.status, r.body.ok, r.body.garantie, r.body.marqueur], [200, true, "barriere", "supprimee"]);
  assert.ok(r.body.notes.some((n) => /déjà absent/.test(n)));
});

test("⑦ MUTATION : un handler qui prononce `garantie` quand la finalisation est refusée rougit ici (①, ③)", async () => {
  // Le modèle v2 laisse la finalisation de A échouer (①) ; si le handler
  // rendait 200 + garantie dans ce cas, le test ① serait rouge. Ici : la même
  // situation, forcée par `terminerRefuse`, avec le faux docile.
  const admin = fauxAdmin({ tables: { user_state: [{ user_id: U }] } });
  admin._a; // journal
  const r = await traiterSuppression(admin, U, { supprimerAuth: authImmediate(), jeton: JA, marquer: async () => ({ ok: false, motif: "jeton_perime", statut: "echec", protection: false }) });
  assert.deepEqual([r.status, r.body.ok, r.body.garantie, r.body.code, r.body.marqueur, r.body.protection], [500, false, undefined, "finalisation_refusee", "echec", false]);
});
