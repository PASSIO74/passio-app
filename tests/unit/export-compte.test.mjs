// EXP-08 — l'export d'un compte : ce qu'il prend, ce qu'il laisse, ce qu'il dit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tablesExport, exporterCompte, EXCLUS_EXPORT, PLAFOND_PAR_TABLE, PAGE } from "../../supabase/functions/_shared/export-compte.js";
import { TABLES_COMPTE } from "../../supabase/functions/_shared/purge-compte.js";

test("① les données d'autrui et les traces techniques ne partent pas ; le reste suit la liste de purge", () => {
  const cles = tablesExport().map(([t, c]) => t + "." + c);
  for (const x of EXCLUS_EXPORT) assert.ok(!cles.includes(x), x + " doit être écarté");
  assert.ok(cles.includes("posts.author_id")); assert.ok(cles.includes("conv_messages.from_id")); assert.ok(cles.includes("profiles.id"));
  assert.ok(cles.includes("follows.follower_id") && !cles.includes("follows.following_id"));
  assert.ok(cles.includes("blocks.blocker_id") && !cles.includes("blocks.blocked_id"));
  assert.equal(cles.length, TABLES_COMPTE.length - EXCLUS_EXPORT.size);
});

// Faux client admin : chaque table rend ce qu'on lui a préparé, paginé.
function fauxAdmin(donnees, erreurs = {}) {
  const appels = [];
  return {
    appels,
    from(table) {
      let col = null, debut = 0, fin = PAGE - 1;
      const b = {
        select() { return b; }, eq(c, v) { col = c; appels.push(table + "." + c + "=" + v); return b; },
        order() { return b; },
        range(a, z) { debut = a; fin = z; return b; },
        then(res) {
          if (erreurs[table]) return Promise.resolve({ data: null, error: { message: erreurs[table] } }).then(res);
          const tout = donnees[table + "." + col] || [];
          return Promise.resolve({ data: tout.slice(debut, fin + 1), error: null }).then(res);
        },
      };
      return b;
    },
    storage: { from() { return { list: async (prefixe) => ({ data: (donnees["storage:" + prefixe] || []).map((n) => ({ name: n })), error: null }), getPublicUrl: (chemin) => ({ data: { publicUrl: "https://cdn/" + chemin } }) }; } },
  };
}

test("② l'export ne lit QUE le compte demandé et rend ses tables, ses médias, son identité", async () => {
  const admin = fauxAdmin({ "posts.author_id": [{ id: "p1", created_at: "2026-01-01" }], "profiles.id": [{ id: "moi", username: "Moi" }], "storage:photos/moi": ["a.jpg"] });
  const d = await exporterCompte(admin, "moi", { email: "moi@x.fr" });
  assert.equal(d.format, "passio-export/1");
  assert.deepEqual(d.tables.posts, [{ id: "p1", created_at: "2026-01-01" }]);
  assert.deepEqual(d.tables.profiles, [{ id: "moi", username: "Moi" }]);
  assert.deepEqual(d.medias, [{ seau: "content", chemin: "photos/moi/a.jpg", url: "https://cdn/photos/moi/a.jpg" }]);
  assert.equal(d.compte.email, "moi@x.fr");
  assert.ok(admin.appels.every((a) => a.endsWith("=moi")), "aucune lecture sous un autre identifiant");
  assert.deepEqual(d.erreurs, []);
});

test("③ une table illisible est NOMMÉE, elle ne fait pas échouer l'export ; une table pleine est paginée et bornée", async () => {
  const beaucoup = Array.from({ length: PLAFOND_PAR_TABLE + 10 }, (_, i) => ({ id: "m" + i }));
  const admin = fauxAdmin({ "conv_messages.from_id": beaucoup }, { stories: "permission denied" });
  const d = await exporterCompte(admin, "moi", null);
  assert.ok(d.erreurs.some((e) => /stories\.author_id : permission denied/.test(e)));
  assert.equal(d.tables.conv_messages.length, PLAFOND_PAR_TABLE);
  assert.deepEqual(d.tronquees, ["conv_messages"]);
});
