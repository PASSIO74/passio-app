// ═══════════════════════════════════════════════════════════════════════════
// COMPTES & CRÉATIONS — la seule surface du pilotage qui réunit du PII.
//
// `accounts()` est le SEUL endroit de tout PASSIO où le numéro de téléphone et
// les informations de connexion (e-mail, dernière connexion, confirmation) sont
// rassemblés : le numéro vit dans `auth.users.user_metadata`, jamais lisible
// côté client, lu ici avec la clé service_role. Trois choses doivent donc tenir,
// et aucune n'était couverte :
//
//   1. les comptes exclus (jetables e2e, comptes internes) ne remontent JAMAIS ;
//   2. la pagination de `auth.users` va au bout — sinon, passé 1 000 comptes,
//      les suivants perdent e-mail et téléphone EN SILENCE, ce qui ressemble à
//      « ces gens n'ont pas renseigné de numéro » plutôt qu'à un défaut ;
//   3. une panne d'`auth` dégrade sans faire tomber la liste des profils.
//
// `signups()` sert d'indicateur commercial : ses fenêtres et sa série de 14
// jours sont figées ici, ainsi que son cache — un panneau rafraîchi souvent ne
// doit pas rejouer la requête à chaque coup d'œil.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { _setAdminForTests } from "../server/ingest.js";
import { store } from "../server/store.js";
import { accounts } from "../server/accounts.js";
import { signups } from "../server/signups.js";

const jours = (n) => new Date(Date.now() - n * 86400000).toISOString();

/**
 * Client factice. `profiles` et `auth.users` sont volontairement DÉSALIGNÉS :
 * un profil sans compte auth, un compte auth sans profil, un exclu des deux
 * côtés — c'est l'état réel d'une base après des purges de comptes de test.
 */
function faireAdmin({ profils, authUsers, perPage = 1000, authKo = false }) {
  let appelsAuth = 0;
  return {
    get appelsAuth() { return appelsAuth; },
    from: () => ({
      select: () => ({
        order: () => ({ limit: async () => ({ data: profils, error: null }) }),
      }),
    }),
    auth: {
      admin: {
        listUsers: async ({ page }) => {
          appelsAuth++;
          if (authKo) return { data: null, error: { message: "auth indisponible" } };
          const debut = (page - 1) * perPage;
          return { data: { users: authUsers.slice(debut, debut + perPage) }, error: null };
        },
      },
    },
  };
}

test("un compte exclu ne remonte jamais, quelle que soit sa source", async () => {
  store.setTestUids(["u_e2e"]);
  _setAdminForTests(faireAdmin({
    profils: [
      { id: "u_ben", username: "Ben", avatar_url: null, created_at: jours(10) },
      { id: "u_e2e", username: "Testeur jetable", avatar_url: null, created_at: jours(1) },
      { id: "u_orphelin", username: "Sans compte auth", avatar_url: null, created_at: jours(2) },
    ],
    // ⚠️ `u_ben` est placé au-delà de la PREMIÈRE page de 1 000 : sans pagination
    // correcte, il perdrait e-mail et téléphone en silence — ce qui à l'écran
    // ressemble à « cette personne n'a rien renseigné », pas à un défaut.
    authUsers: [
      ...Array.from({ length: 1000 }, (_, i) => ({ id: `bourrage_${i}`, user_metadata: {} })),
      { id: "u_ben", email: "ben@x.fr", user_metadata: { phone: "0600000000" },
        created_at: jours(10), last_sign_in_at: jours(0), email_confirmed_at: jours(10) },
      { id: "u_e2e", email: "alpha@passio-e2e.test", user_metadata: {}, created_at: jours(1) },
    ],
  }));

  const r = await accounts();
  assert.equal(r.configured, true);
  assert.deepEqual(r.users.map((u) => u.id), ["u_ben", "u_orphelin"]);

  const ben = r.users[0];
  assert.equal(ben.phone, "0600000000", "le numéro vient de user_metadata, pas de profiles");
  assert.equal(ben.email, "ben@x.fr");
  assert.equal(ben.emailConfirmed, true);
  assert.equal(r.withPhone, 1);

  // Un profil sans compte auth reste listé, avec des champs vides : le disparaître
  // ferait mentir le total, l'inventer ferait mentir la fiche.
  const orphelin = r.users[1];
  assert.equal(orphelin.name, "Sans compte auth");
  assert.equal(orphelin.email, null);
  assert.equal(orphelin.phone, null);
  assert.equal(orphelin.emailConfirmed, false);
});

test("une panne d'auth dégrade la fiche sans faire tomber la liste", () => {
  // Processus à part : `accounts()` garde son résultat 30 s, on ne peut donc pas
  // lui présenter deux bases différentes dans la même exécution. C'est une
  // contrainte du cache, pas un choix de style.
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", `
    const { _setAdminForTests } = await import("./server/ingest.js");
    const { accounts } = await import("./server/accounts.js");
    _setAdminForTests({
      from: () => ({ select: () => ({ order: () => ({ limit: async () => ({
        data: [{ id: "u1", username: "Ben", created_at: "2026-01-01T00:00:00Z" }], error: null }) }) }) }),
      auth: { admin: { listUsers: async () => ({ data: null, error: { message: "auth HS" } }) } },
    });
    const r = await accounts();
    console.log(JSON.stringify({ n: r.users.length, nom: r.users[0]?.name,
      email: r.users[0]?.email, tel: r.users[0]?.phone, err: r.error || null }));
  `], { encoding: "utf8", env: process.env }).trim();

  const r = JSON.parse(out);
  assert.equal(r.n, 1, "les profils restent listés quand auth ne répond pas");
  assert.equal(r.nom, "Ben");
  assert.equal(r.email, null, "aucune information de connexion inventée");
  assert.equal(r.tel, null);
  assert.equal(r.err, null, "une panne d'auth n'est pas une panne de la liste");
});

test("le résultat est mis en cache : un second appel ne réinterroge pas Supabase", async () => {
  const admin = faireAdmin({ profils: [], authUsers: [] });
  _setAdminForTests(admin);
  const a = await accounts();
  const avant = admin.appelsAuth;
  const b = await accounts();
  assert.equal(admin.appelsAuth, avant, "le cache de 30 s ne tient plus");
  assert.equal(a, b, "le cache doit rendre le même objet");
});

test("sans Supabase, on annonce « non configuré » plutôt qu'une liste vide", async () => {
  _setAdminForTests(null);
  const r = await accounts();
  assert.equal(r.configured, false);
  assert.deepEqual(r.users, []);
  // Nuance qui compte : « pas branché » et « aucun compte » se ressemblent à
  // l'écran, et l'un des deux est une panne.
});

test("créations de compte : fenêtres et série de 14 jours", async () => {
  store.setTestUids(["u_e2e"]);
  _setAdminForTests(faireAdmin({
    profils: [
      { id: "a", created_at: new Date(Date.now() - 3600_000).toISOString() },  // aujourd'hui
      { id: "b", created_at: jours(3) },                                        // semaine
      { id: "c", created_at: jours(20) },                                       // mois
      { id: "d", created_at: jours(200) },                                      // hors fenêtres
      { id: "u_e2e", created_at: jours(1) },                                    // exclu
      { id: "e", created_at: null },                                            // sans date
      { id: "f", created_at: "pas-une-date" },                                  // date illisible
    ],
    authUsers: [],
  }));

  const r = await signups();
  assert.equal(r.configured, true);
  assert.equal(r.total, 5, "total = profils datés, hors comptes exclus");
  assert.equal(r.today, 1);
  assert.equal(r.week, 2);
  assert.equal(r.month, 3);
  assert.equal(r.series.length, 14);
  assert.equal(r.series.at(-1).n, 1, "le dernier point de la série est aujourd'hui");
  assert.equal(r.series.reduce((s, p) => s + p.n, 0), 2, "seuls a et b tombent dans les 14 jours");
});
