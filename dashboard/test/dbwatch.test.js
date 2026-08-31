// ═══════════════════════════════════════════════════════════════════════════
// SUPERVISION BASE — ce module lit la production avec la clé service_role.
//
// Il n'écrit rien, mais il LIT tout ce qu'il veut : la clé service_role ignore
// les policies RLS. Sa seule garantie de confidentialité est donc dans sa forme :
// une liste blanche de tables, et des COMPTES DE LIGNES uniquement — jamais le
// contenu d'une ligne. Rien ne le vérifiait.
//
// Deux invariants figés ici :
//   1. aucune table hors de la liste blanche n'est interrogée, et chaque requête
//      est un comptage `head: true` — donc aucune ligne ne remonte ;
//   2. une table absente ou refusée rend `null` pour ELLE SEULE : le panneau
//      dégrade table par table au lieu de tomber en entier. Une erreur sur
//      `analytics_events` ne doit pas effacer le compte des profils.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { _setAdminForTests } from "../server/ingest.js";
import { store, normalize } from "../server/store.js";
import { overview } from "../server/dbwatch.js";

/** Faux client : note ce qui est demandé, et à quelles tables. */
function faireAdmin({ nombres = {}, cassees = [] } = {}) {
  const demandes = [];
  return {
    demandes,
    from(table) {
      return {
        select(colonnes, options) {
          demandes.push({ table, colonnes, options });
          if (cassees.includes(table)) return Promise.resolve({ count: null, error: { message: "refusé" } });
          return Promise.resolve({ count: nombres[table] ?? 0, error: null });
        },
      };
    },
  };
}

test("sans Supabase, on annonce « non configuré »", async () => {
  _setAdminForTests(null);
  assert.deepEqual(await overview(), { configured: false });
});

test("liste blanche : aucune table hors périmètre, et RIEN que des comptages", async () => {
  const admin = faireAdmin({ nombres: { profiles: 42, posts: 7 } });
  _setAdminForTests(admin);
  const r = await overview();

  const attendues = [
    "profiles", "posts", "post_comments", "post_likes", "conv_messages",
    "conversations", "notifications", "events", "event_attendees",
    "telemetry_events", "client_errors", "analytics_events",
  ];
  assert.deepEqual(admin.demandes.map((d) => d.table).sort(), [...attendues].sort(),
    "la liste des tables interrogées doit être exactement la liste blanche");

  for (const d of admin.demandes) {
    assert.equal(d.options?.head, true,
      `${d.table} : sans head:true, ce sont les LIGNES qui remonteraient, pas leur nombre`);
    assert.equal(d.options?.count, "exact");
  }
  assert.equal(r.counts.profiles, 42);
  assert.equal(r.counts.posts, 7);
});

test("une table refusée rend null pour elle seule, sans emporter les autres", async () => {
  _setAdminForTests(faireAdmin({ nombres: { profiles: 5 }, cassees: ["analytics_events", "client_errors"] }));
  const r = await overview();
  assert.equal(r.configured, true);
  assert.equal(r.counts.analytics_events, null);
  assert.equal(r.counts.client_errors, null);
  assert.equal(r.counts.profiles, 5, "une table absente ne doit pas effacer les autres");
});

test("activité : seules les requêtes REST récentes comptent", async () => {
  const now = Date.now();
  const ev = (extra) => store.add(normalize({
    event_id: "db_" + Math.random().toString(36).slice(2), env: "production", type: "api",
    received_at: new Date(extra.ts || now).toISOString(), ...extra,
  }));
  ev({ endpoint: "/rest/v1/posts", duration_ms: 100 });
  ev({ endpoint: "/rest/v1/posts", duration_ms: 3000 });                    // lente
  ev({ endpoint: "/rest/v1/posts", duration_ms: 50, status: "error" });     // en échec
  ev({ endpoint: "/auth/v1/token", duration_ms: 9000 });                    // pas la base
  ev({ endpoint: "/rest/v1/posts", duration_ms: 9000, ts: now - 60 * 60_000 }); // trop vieille

  _setAdminForTests(faireAdmin());
  const a = (await overview()).activity;
  assert.equal(a.dbCalls15m, 3, "seules les 3 requêtes REST des 15 dernières minutes comptent");
  assert.equal(a.slowQueries, 1);
  assert.equal(a.failedQueries, 1);
  assert.equal(a.successRate, 67);
});
