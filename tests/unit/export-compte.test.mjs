// EXP-08 — l'export d'un compte : ce qu'il prend, ce qu'il laisse, ce qu'il dit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tablesExport, exporterCompte, EXCLUS_EXPORT, PLAFOND_PAR_TABLE, PAGE, RPC_EXPORT } from "../../supabase/functions/_shared/export-compte.js";
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
// ⚠️ ASTRA-44 : `rpc(export_compte_instantane)` rend une COPIE de `donnees` prise
// à l'appel — c'est ce qu'un snapshot est ; ce que le faux ne refait pas, c'est
// la garantie STABLE elle-même (mesurée sur PostgreSQL réel par
// tests/sql/migration-export-instantane.test.sh). `opts.instantane = "absente"`
// joue la migration non appliquée : la lecture retombe sur les pages.
function fauxAdmin(donnees, erreurs = {}, opts = {}) {
  const appels = [];
  return {
    appels,
    rpc(nom, args) {
      return {
        then(res) {
          appels.push("rpc:" + nom + "=" + (args && args.p_uid));
          if (nom !== RPC_EXPORT || opts.instantane === "absente") return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public." + nom + " in the schema cache" } }).then(res);
          // Une table illisible fait LEVER la fonction SQL (une seule transaction) :
          // tout l'instantané échoue, et l'export retombe sur les pages, qui nomment la table.
          if (opts.instantane === "panne" || Object.keys(erreurs).length) return Promise.resolve({ data: null, error: { message: "panne instantané" } }).then(res);
          const plafond = args.p_plafond || PLAFOND_PAR_TABLE;
          const tables = {};
          for (const [t, c] of tablesExport()) {
            if (erreurs[t]) continue;                         // table illisible : absente du dossier
            const tout = (donnees[t + "." + c] || []).map((l) => ({ ...l }));
            const sans = (opts.sansColonnes || {})[t] || [];
            const cles = ["created_at", "id"].filter((k) => !sans.includes(k));
            tout.sort((x, y) => { for (const k of cles) { const a = String(x[k] ?? ""), z = String(y[k] ?? ""); if (a !== z) return a < z ? -1 : 1; } return 0; });
            tables[t + "." + c] = { lignes: tout.slice(0, plafond), attendu: tout.length, tronque: tout.length > plafond, ordre: cles.join(", ") || null, ordre_total: cles.includes("id") };
          }
          return Promise.resolve({ data: { instantane: "742:742:", prise_le: "2026-09-15T18:00:00Z", plafond, tables, absentes: [] }, error: null }).then(res);
        },
      };
    },
    from(table) {
      let col = null, debut = 0, fin = PAGE - 1, ordreRefuse = null, cles = [], veutCompte = false;
      const b = {
        select(_sel, o) { veutCompte = Boolean(o && o.count); return b; },
        eq(c, v) { col = c; appels.push(table + "." + c + "=" + v); return b; },
        order(colonne) { cles.push(colonne); if ((opts.sansColonnes || {})[table] && opts.sansColonnes[table].includes(colonne)) ordreRefuse = colonne; return b; },
        range(a, z) { debut = a; fin = z; return b; },
        then(res) {
          if (erreurs[table]) return Promise.resolve({ data: null, error: { message: erreurs[table] } }).then(res);
          if (ordreRefuse) { const c = ordreRefuse; ordreRefuse = null; return Promise.resolve({ data: null, error: { message: "column " + table + "." + c + " does not exist" } }).then(res); }
          const tout = donnees[table + "." + col] || [];
          // ⚠️ LE FAUX SERVEUR REND UN ORDRE QUI DÉPEND DES CLÉS DEMANDÉES —
          // c'est tout l'objet d'ASTRA-28. Trier sur `created_at` seul quand les
          // dates sont égales laisse PostgreSQL libre : le banc modélise ce
          // désordre par `opts.melange`, appliqué à chaque page. Trier sur
          // `(created_at, id)` est TOTAL : le mélange n'a plus de prise.
          let ordonne = tout.slice();
          const total = cles[cles.length - 1] === "id";
          if (cles.length) {
            ordonne.sort((x, y) => { for (const c of cles) { const a = String(x[c] ?? ""), z = String(y[c] ?? ""); if (a !== z) return a < z ? -1 : 1; } return 0; });
          }
          if (!total && opts.melange) ordonne = opts.melange(ordonne, debut);
          const page = ordonne.slice(debut, fin + 1);
          const compte = veutCompte ? tout.length : undefined;
          // `opts.entrePages` : ce que le monde fait ENTRE deux pages (ASTRA-44).
          if (opts.entrePages) opts.entrePages(table);
          return Promise.resolve({ data: page, error: null, count: compte }).then(res);
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
  const admin = fauxAdmin({ "post_likes.user_id": beaucoup }, {}, { sansColonnes: { post_likes: ["created_at"] }, instantane: "absente" });
  const d = await exporterCompte(admin, "moi", null);
  // Sur le code du 14/09 : 5 000 lignes, tronquees = [], aucune erreur — un export incomplet présenté comme complet.
  assert.equal(d.tables.post_likes.length, PLAFOND_PAR_TABLE);
  assert.deepEqual(d.tronquees, ["post_likes"]);
  assert.equal(d.bilan.complet, false);
  assert.deepEqual(d.bilan.tables_tronquees, ["post_likes"]);
  // Sans created_at NI id : l'ordre n'est pas stable, et l'export le dit.
  const admin2 = fauxAdmin({ "post_likes.user_id": beaucoup.slice(0, PAGE + 1) }, {}, { sansColonnes: { post_likes: ["created_at", "id"] }, instantane: "absente" });
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

// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-28 (quatrième contre-revue, 15/09/2026) — L'EXPORT ENCORE FAUSSEMENT
// COMPLET. Les deux reproductions d'Astra, jouées telles quelles.
// ═══════════════════════════════════════════════════════════════════════════

test("ASTRA-28 ① 1001 lignes sans created_at NI id : `complet` ne peut plus être vrai", async () => {
  // Reproduction : `tables_sans_ordre_stable` était CALCULÉ, RAPPORTÉ… et
  // n'entrait PAS dans `bilan.complet`. Une table paginée au hasard sortait
  // « complète » — c'est le premier des deux constats.
  const lignes = Array.from({ length: PAGE + 1 }, (_, i) => ({ v: i }));
  const admin = fauxAdmin({ "post_likes.user_id": lignes }, {}, { sansColonnes: { post_likes: ["created_at", "id"] }, instantane: "absente" });
  const d = await exporterCompte(admin, "moi", null);
  assert.equal(d.tables.post_likes.length, PAGE + 1);
  assert.deepEqual(d.bilan.tables_sans_ordre_stable, ["post_likes"], "la table est nommée, comme avant");
  assert.equal(d.bilan.complet, false, "…et elle empêche désormais `complet`");
  assert.match(d.bilan.raisons_ordre_non_total.post_likes, /aucun ordre/);
});

test("ASTRA-28 ② deux pages de dates ÉGALES : un identifiant était omis, et `complet` disait vrai", async () => {
  // La reproduction d'Astra : 1001 lignes de MÊME `created_at`. Trié sur
  // `created_at` seul, l'ordre entre ex æquo est libre — le faux serveur le
  // modélise en tournant la page d'un cran, ce que fait un plan qui change.
  // Résultat mesuré sur le code d'avant : 1001 lignes rendues, 1000 identifiants
  // distincts — un doublon, donc un OMIS — et `complet: true`.
  const lignes = Array.from({ length: PAGE + 1 }, (_, i) => ({ id: "l" + String(i).padStart(4, "0"), created_at: "2026-01-01T00:00:00Z" }));
  // Le désordre entre ex æquo, modélisé fidèlement : le plan choisi pour la
  // page 1 n'est pas celui de la page 2. Ici, page 2 lit la liste INVERSÉE.
  const melange = (tout, debut) => (debut === 0 ? tout.slice() : tout.slice().reverse());

  // (a) Le comportement d'AVANT : ordre sur `created_at` SEUL, donc non total.
  const avant = [];
  for (let debut = 0; debut < lignes.length; debut += PAGE) {
    avant.push(...melange(lignes, debut).slice(debut, debut + PAGE));
  }
  const distinctsAvant = new Set(avant.map((l) => l.id));
  assert.equal(avant.length, PAGE + 1, "reproduction : 1001 lignes rendues");
  assert.equal(distinctsAvant.size, PAGE, "reproduction : 1000 identifiants distincts — un doublon, donc un OMIS");
  assert.ok(!distinctsAvant.has("l" + String(PAGE).padStart(4, "0")), "reproduction : c'est la dernière ligne qui manque");

  // (b) Le comportement APRÈS : l'ordre `(created_at, id)` est TOTAL, le
  // mélange n'a plus de prise, et le compte exact du serveur est confronté.
  const admin = fauxAdmin({ "post_likes.user_id": lignes }, {}, { melange });
  const d = await exporterCompte(admin, "moi", null);
  const ids = d.tables.post_likes.map((l) => l.id);
  assert.equal(ids.length, PAGE + 1, "toutes les lignes sont là");
  assert.equal(new Set(ids).size, PAGE + 1, "et toutes distinctes — aucun identifiant omis");
  assert.deepEqual(d.bilan.incoherences_de_pagination, []);
  assert.deepEqual(d.bilan.tables_sans_ordre_stable, []);
  assert.equal(d.bilan.complet, true);
});

test("ASTRA-28 ③ un doublon ou un compte serveur divergent est une INCOHÉRENCE, jamais un export complet", async () => {
  // Une écriture concurrente pendant l'export : le serveur en annonce plus que
  // ce qu'on obtient. On ne peut pas jurer avoir tout pris — on le dit.
  const lignes = Array.from({ length: 3 }, (_, i) => ({ id: "l" + i, created_at: "2026-01-0" + i }));
  const admin = fauxAdmin({ "post_likes.user_id": lignes }, {}, { instantane: "absente" });
  // On truque le compte exact : le serveur annonce 5, on en obtient 3.
  const vraiFrom = admin.from.bind(admin);
  admin.from = (t) => { const b = vraiFrom(t); const vraiThen = b.then.bind(b); b.then = (res) => vraiThen((r) => res({ ...r, count: r.count == null ? r.count : 5 })); return b; };
  const d = await exporterCompte(admin, "moi", null);
  assert.equal(d.bilan.complet, false);
  assert.ok(d.bilan.incoherences_de_pagination.some((x) => /annonce 5 ligne\(s\), 3 obtenue\(s\)/.test(x)), JSON.stringify(d.bilan.incoherences_de_pagination));
});

test("ASTRA-28 ④ une table TRONQUÉE n'est pas déclarée incohérente — elle est déjà dite tronquée", async () => {
  const beaucoup = Array.from({ length: PLAFOND_PAR_TABLE + 10 }, (_, i) => ({ id: "m" + String(i).padStart(5, "0"), created_at: "2026-01-01" }));
  const admin = fauxAdmin({ "conv_messages.from_id": beaucoup });
  const d = await exporterCompte(admin, "moi", null);
  assert.deepEqual(d.tronquees, ["conv_messages"]);
  assert.deepEqual(d.bilan.incoherences_de_pagination, [], "le plafond n'est pas une incohérence : il est annoncé");
  assert.equal(d.bilan.complet, false, "…mais il empêche toujours `complet`");
});

// ── ASTRA-44 (cinquième contre-revue, 2026-09-15) : compte exact sans instantané cohérent.
test("ASTRA-44 ① REPRODUCTION : une ligne déjà lue disparaît et une autre naît entre deux pages → une ligne restée présente en permanence est OMISE, et l'export se dit complet", async () => {
  // 1 001 lignes triées (created_at, id) ; après la première page, le compte
  // supprime `r0000` (déjà lue) et ajoute `r9999` (en fin). La seconde page,
  // lue par position, commence une ligne trop loin : `r1000` (présente avant,
  // pendant et après) manque ; le compte exact final (1 001) et le nombre
  // d'identifiants distincts (1 001) coïncident — aucune incohérence détectée.
  const lignes = Array.from({ length: PAGE + 1 }, (_, i) => ({ id: "r" + String(i).padStart(4, "0"), created_at: "2026-01-01" }));
  const donnees = { "posts.author_id": lignes };
  let pages = 0;
  const admin = fauxAdmin(donnees, {}, {
    entrePages(table) {
      pages++;
      if (table === "posts" && pages === 1) {
        donnees["posts.author_id"] = donnees["posts.author_id"].filter((l) => l.id !== "r0000").concat([{ id: "r9999", created_at: "2026-01-01" }]);
      }
    },
  });
  const d = await exporterCompte(admin, "moi", null);
  const ids = new Set(d.tables.posts.map((l) => l.id));
  // Ce qu'un export honnête doit garantir : tout ce qui a été présent du début
  // à la fin y est. Ici `r1000` n'a jamais bougé.
  assert.ok(ids.has("r1000"), "r1000, présente en permanence, doit être dans l'export — ids : " + d.tables.posts.length + ", distincts : " + ids.size);
  // Et s'il ne peut pas le garantir, il ne se dit pas complet.
  if (!ids.has("r1000")) assert.equal(d.bilan.complet, false);
});

test("ASTRA-44 ② sans la fonction d'instantané (migration non appliquée) : lecture par pages, `complet` JAMAIS vrai, la raison est nommée", async () => {
  const admin = fauxAdmin({ "posts.author_id": [{ id: "p1" }] }, {}, { instantane: "absente" });
  const d = await exporterCompte(admin, "moi", null);
  assert.deepEqual(d.tables.posts, [{ id: "p1" }], "les données sortent quand même (portabilité)");
  assert.equal(d.bilan.instantane, null);
  assert.equal(d.bilan.complet, false, "un compte absent ne certifie rien");
  assert.ok(d.bilan.erreurs.some((e) => /instantané : fonction absente \(migration non appliquée\)/.test(e)), JSON.stringify(d.bilan.erreurs));
  const panne = await exporterCompte(fauxAdmin({ "posts.author_id": [{ id: "p1" }] }, {}, { instantane: "panne" }), "moi", null);
  assert.equal(panne.bilan.complet, false);
  assert.ok(panne.bilan.erreurs.some((e) => /instantané : panne instantané/.test(e)));
});

test("ASTRA-44 ③ sous instantané : le dossier porte le snapshot et l'heure de prise, et `complet` est possible", async () => {
  const admin = fauxAdmin({ "posts.author_id": [{ id: "p1", created_at: "2026-01-01" }], "storage:photos/moi": ["a.jpg"] });
  const d = await exporterCompte(admin, "moi", null);
  assert.deepEqual(d.bilan.instantane, { snapshot: "742:742:", prise_le: "2026-09-15T18:00:00Z", plafond: PLAFOND_PAR_TABLE });
  assert.equal(d.bilan.complet, true);
  assert.ok(admin.appels[0].startsWith("rpc:" + RPC_EXPORT + "=moi"), "l'instantané est demandé en premier, pour le bon compte");
  // Un compte tronqué sous instantané reste dit tronqué, et empêche `complet`.
  const beaucoup = Array.from({ length: PLAFOND_PAR_TABLE + 1 }, (_, i) => ({ id: "m" + String(i).padStart(5, "0") }));
  const t = await exporterCompte(fauxAdmin({ "conv_messages.from_id": beaucoup }), "moi", null);
  assert.deepEqual(t.bilan.tables_tronquees, ["conv_messages"]);
  assert.equal(t.bilan.complet, false);
  assert.equal(t.tables.conv_messages.length, PLAFOND_PAR_TABLE);
});

test("ASTRA-44 ④ COUVERTURE : la liste de la fonction SQL est EXACTEMENT tablesExport() (contrôle indépendant de la migration)", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../../migrations/migration_export_instantane_2026-09-15.sql", import.meta.url), "utf8");
  const bloc = sql.slice(sql.indexOf("paires   text[][] := array["), sql.indexOf("];", sql.indexOf("paires   text[][] := array[")));
  const paires = [...bloc.matchAll(/\['([a-z_]+)', '([a-z_]+)'\]/g)].map((m) => m[1] + "." + m[2]);
  const attendues = tablesExport().map(([t, c]) => t + "." + c);
  assert.deepEqual(paires.filter((p) => !attendues.includes(p)), [], "dans la fonction mais pas dans tablesExport()");
  assert.deepEqual(attendues.filter((p) => !paires.includes(p)), [], "dans tablesExport() mais pas dans la fonction");
  assert.equal(paires.length, attendues.length);
});
