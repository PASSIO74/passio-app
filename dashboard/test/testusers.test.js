// ═══════════════════════════════════════════════════════════════════════════
// COMPTES DE TEST — le module qui SUPPRIME des comptes avec la clé service_role.
//
// C'est la fonction la plus destructrice du centre de pilotage : `remove()`
// appelle `auth.admin.deleteUser`, qui efface un compte et tout ce qui pend à
// son `auth.uid()`. Rien ne la couvrait. Elle repose sur trois verrous, dans
// cet ordre, et chacun est figé ici :
//
//   1. les mutations doivent être autorisées (hors production) ;
//   2. Supabase doit être configuré ;
//   3. ⚠️ l'e-mail est RELU côté serveur à partir de l'identifiant reçu, et
//      doit correspondre au motif jetable. Le client envoie un id, jamais un
//      verdict : c'est le seul verrou qui protège un compte RÉEL, et le seul
//      dont l'échec serait irréversible.
//
// Le troisième point est ce qui rend ce fichier utile. Les deux premiers
// refusent tôt et bruyamment ; celui-là décide, en silence, entre « je supprime
// un compte jetable » et « je supprime le compte de quelqu'un ».
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// ⚠️ `import` est hissé : l'environnement doit être posé AVANT le chargement de
// `config.js`, donc les modules sont importés dynamiquement (cf. git.test.js).
process.env.DASH_ALLOW_MUTATIONS = "true";
process.env.DASH_ENV = "development";
const { _setAdminForTests } = await import("../server/ingest.js");
const { list, remove } = await import("../server/testusers.js");

/** Client Supabase factice : enregistre ce qu'on lui demande de supprimer. */
function faireAdmin(comptes) {
  const suppressions = [];
  return {
    suppressions,
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: comptes }, error: null }),
        getUserById: async (id) => ({ data: { user: comptes.find((u) => u.id === id) || null } }),
        deleteUser: async (id) => { suppressions.push(id); return { error: null }; },
      },
    },
  };
}

const REELS = [
  { id: "u_ben", email: "contact@ladamemetallerie.com" },
  { id: "u_lea", email: "lea@gmail.com" },
  // Pièges : ces adresses CONTIENNENT le motif sans être des comptes jetables.
  { id: "u_piege1", email: "ben+passio-e2e@gmail.com" },
  { id: "u_piege2", email: "x@passio-e2e.test.evil.com" },
  { id: "u_piege3", email: "x@sub.passio-e2e.test" },
  { id: "u_piege4", email: "passio-e2e.test@gmail.com" },
];
const JETABLES = [
  { id: "u_e2e1", email: "alpha@passio-e2e.test" },
  { id: "u_e2e2", email: "BETA@PASSIO-E2E.TEST" },   // la casse ne protège rien
];

test("sans client Supabase, la liste le dit au lieu de mentir", async () => {
  _setAdminForTests(null);
  const r = await list();
  assert.equal(r.configured, false);
  assert.deepEqual(r.users, []);
});

test("la liste ne montre QUE les comptes jetables", async () => {
  _setAdminForTests(faireAdmin([...REELS, ...JETABLES]));
  const r = await list();
  assert.equal(r.configured, true);
  assert.deepEqual(r.users.map((u) => u.id).sort(), ["u_e2e1", "u_e2e2"]);
  // Un compte réel affiché ici serait à un clic de la suppression.
  for (const u of r.users) assert.match(u.email, /@passio-e2e\.test$/i);
});

test("SUPPRESSION : un compte réel est refusé, même si son id est fourni", async () => {
  const admin = faireAdmin([...REELS, ...JETABLES]);
  _setAdminForTests(admin);
  for (const u of REELS) {
    await assert.rejects(() => remove(u.id, "benjamin"), (e) => {
      assert.equal(e.code, 403, `mauvais code pour ${u.email}`);
      return true;
    }, `compte réel accepté à la suppression : ${u.email}`);
  }
  assert.deepEqual(admin.suppressions, [],
    "deleteUser a été appelé sur un compte réel — c'est irréversible.");
});

test("SUPPRESSION : le verdict vient de la BASE, jamais de l'appelant", async () => {
  // Le cas qui compte vraiment : l'identifiant est celui d'un compte réel, mais
  // l'appelant prétend le contraire. Si `remove` faisait confiance à ce qu'on
  // lui passe plutôt que de relire l'e-mail, le compte partirait.
  const admin = faireAdmin([...REELS, ...JETABLES]);
  _setAdminForTests(admin);
  await assert.rejects(
    () => remove("u_ben", "benjamin", { email: "alpha@passio-e2e.test" }), (e) => e.code === 403);
  assert.deepEqual(admin.suppressions, []);
});

test("SUPPRESSION : un identifiant inconnu est refusé, pas ignoré", async () => {
  const admin = faireAdmin([...REELS, ...JETABLES]);
  _setAdminForTests(admin);
  // getUserById rend `null` → e-mail vide → aucun motif → refus. Un `deleteUser`
  // lancé « au cas où » sur un id inconnu serait une suppression à l'aveugle.
  await assert.rejects(() => remove("u_inexistant", "benjamin"), (e) => e.code === 403);
  assert.deepEqual(admin.suppressions, []);
});

test("SUPPRESSION : un vrai compte jetable est bien supprimé", async () => {
  // Le contre-test : sans lui, tout ce fichier resterait vert avec un `remove`
  // qui refuse TOUT — un verrou qui bloque tout ne prouve rien.
  const admin = faireAdmin([...REELS, ...JETABLES]);
  _setAdminForTests(admin);
  assert.deepEqual(await remove("u_e2e1", "benjamin"), { deleted: "u_e2e1" });
  assert.deepEqual(admin.suppressions, ["u_e2e1"]);
  // …y compris en majuscules : le motif est insensible à la casse à dessein.
  await remove("u_e2e2", "benjamin");
  assert.deepEqual(admin.suppressions, ["u_e2e1", "u_e2e2"]);
});

test("SUPPRESSION : sans Supabase, refus AVANT toute tentative", async () => {
  _setAdminForTests(null);
  await assert.rejects(() => remove("u_e2e1", "benjamin"), (e) => e.code === 400);
});

test("SUPPRESSION : mutations coupées = refus, dans un processus neuf", () => {
  // `config.js` ne lit l'environnement qu'au chargement : le verrou par défaut
  // ne peut se vérifier que dans un processus à part.
  const code = `
    const { _setAdminForTests } = await import("./server/ingest.js");
    const { remove } = await import("./server/testusers.js");
    let supprime = false;
    _setAdminForTests({ auth: { admin: {
      getUserById: async () => ({ data: { user: { id: "u", email: "a@passio-e2e.test" } } }),
      deleteUser: async () => { supprime = true; return { error: null }; },
    } } });
    try { await remove("u", "t"); console.log("PASSE"); }
    catch (e) { if (e.code !== 403) console.log("MAUVAIS_CODE:" + e.code); }
    if (supprime) console.log("SUPPRESSION_EFFECTUEE");
    console.log("FIN");
  `;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    encoding: "utf8",
    env: { ...process.env, DASH_ALLOW_MUTATIONS: "", DASH_ENV: "development" },
  }).trim();
  assert.equal(out, "FIN", out);
});
