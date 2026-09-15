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
function fauxAdmin(donnees, erreurs = {}, opts = {}) {
  const appels = [];
  return {
    appels,
    from(table) {
      let col = null, debut = 0, fin = PAGE - 1, ordreRefuse = null;
      const b = {
        select() { return b; }, eq(c, v) { col = c; appels.push(table + "." + c + "=" + v); return b; },
        order(colonne) { if ((opts.sansColonnes || {})[table] && opts.sansColonnes[table].includes(colonne)) ordreRefuse = colonne; return b; },
        range(a, z) { debut = a; fin = z; return b; },
        then(res) {
          if (erreurs[table]) return Promise.resolve({ data: null, error: { message: erreurs[table] } }).then(res);
          if (ordreRefuse) { const c = ordreRefuse; ordreRefuse = null; return Promise.resolve({ data: null, error: { message: "column " + table + "." + c + " does not exist" } }).then(res); }
          const tout = donnees[table + "." + col] || [];
          return Promise.resolve({ data: tout.slice(debut, fin + 1), error: null }).then(res);
        },
      };
      return b;
    },
    storage: { from() { return { list: async (prefixe, o) => { if ((opts.storageErreurs || []).includes(prefixe)) return { data: null, error: { message: "list refusée" } }; const tout = (donnees["storage:" + prefixe] || []).map((n) => ({ name: n })); const off = (o && o.offset) || 0; return { data: tout.slice(off, off + ((o && o.limit) || 1000)), error: null }; }, getPublicUrl: (chemin) => ({ data: { publicUrl: "https://cdn/" + chemin } }) }; } },
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

// ── ASTRA-14 (contre-revue Astra, 2026-09-15) : l'incomplétude se dit, toujours.
test("④ ASTRA-14 (RÉINJECTION) : sans colonne created_at, cinq pages pleines → tronqué DIT, plus jamais 5 000 lignes muettes", async () => {
  const beaucoup = Array.from({ length: PLAFOND_PAR_TABLE + 10 }, (_, i) => ({ id: "l" + i }));
  const admin = fauxAdmin({ "post_likes.user_id": beaucoup }, {}, { sansColonnes: { post_likes: ["created_at"] } });
  const d = await exporterCompte(admin, "moi", null);
  // Sur le code du 14/09 : 5 000 lignes, tronquees = [], aucune erreur — un export incomplet présenté comme complet.
  assert.equal(d.tables.post_likes.length, PLAFOND_PAR_TABLE);
  assert.deepEqual(d.tronquees, ["post_likes"]);
  assert.equal(d.bilan.complet, false);
  assert.deepEqual(d.bilan.tables_tronquees, ["post_likes"]);
  // Sans created_at NI id : l'ordre n'est pas stable, et l'export le dit.
  const admin2 = fauxAdmin({ "post_likes.user_id": beaucoup.slice(0, PAGE + 1) }, {}, { sansColonnes: { post_likes: ["created_at", "id"] } });
  const d2 = await exporterCompte(admin2, "moi", null);
  assert.equal(d2.tables.post_likes.length, PAGE + 1);
  assert.deepEqual(d2.bilan.tables_sans_ordre_stable, ["post_likes"]);
});

test("⑤ ASTRA-14 : le listing Storage est paginé au-delà de 1 000 et ses erreurs sont nommées", async () => {
  const noms = Array.from({ length: 1003 }, (_, i) => "p" + i + ".jpg");
  const admin = fauxAdmin({ "storage:photos/moi": noms }, {}, { storageErreurs: ["avatars/moi"] });
  const d = await exporterCompte(admin, "moi", null);
  // Sur le code du 14/09 : 1 000 médias listés, l'erreur d'`avatars` avalée, bilan absent.
  assert.equal(d.medias.filter((m) => m.chemin.startsWith("photos/moi/")).length, 1003);
  assert.ok(d.erreurs.some((e) => e.startsWith("content/avatars : list refusée")), JSON.stringify(d.erreurs));
  assert.equal(d.bilan.complet, false);
  assert.equal(d.bilan.medias, 1003);
});

test("⑥ un export sans manque est dit COMPLET, avec ses comptes", async () => {
  const admin = fauxAdmin({ "posts.author_id": [{ id: "p1" }, { id: "p2" }], "storage:photos/moi": ["a.jpg"] });
  const d = await exporterCompte(admin, "moi", { email: "x@y" });
  assert.equal(d.bilan.complet, true);
  assert.equal(d.bilan.lignes, 2);
  assert.equal(d.bilan.medias, 1);
  assert.deepEqual(d.bilan.erreurs, []);
});
