// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LA GATE DES INDEX *_rid_key SAIT-ELLE LIRE CE QU'ELLE GARDE ?
//
// ⚠️ POURQUOI CE BANC EXISTE. `scripts/audit-identite-replication.js` garde une
// panne qui ne se voit qu'en PRODUCTION : R25 met quatre tables publiées en
// `replica identity using index <table>_rid_key` ; supprimer l'un de ces index
// (l'avis « unused index » de Supabase les signale toujours, et ce dépôt a déjà
// retiré des index sur ce seul critère, F-05) fait REFUSER à PostgreSQL tout
// UPDATE et tout DELETE de la table. Une gate qui cesserait de LIRE une forme
// d'écriture (nom entre guillemets, liste de plusieurs index, `drop column`,
// `drop constraint`, index renommé, retour arrière en `--|`, SQL calculé,
// table descendante `*`, table ajoutée à la publication, garde `trg_rid_opaque`)
// rendrait « OK » sur ce défaut exact.
// Chaque forme a donc ici son cas ROUGE, et chaque sortie légitime son cas VERT.
// Les comportements de PostgreSQL que les règles supposent (un index renommé
// garde l'identité, `add constraint … using index` le renomme, `alter index
// <table> rename to` renomme la table, `enable replica trigger` désarme la
// garde…) ont été mesurés sur un PostgreSQL 16 jetable, R25 appliquée, le
// 2026-11-04.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const RACINE = fileURLToPath(new URL("../..", import.meta.url));
const require = createRequire(import.meta.url);
const gate = require("../../scripts/audit-identite-replication.js");
const R25 = readFileSync(join(RACINE, gate.MIGRATION_R25), "utf8");
const PUBLIEES = new Set(JSON.parse(readFileSync(join(RACINE, "scripts/realtime-publication.json"), "utf8")).publiees);
const analyser = (sql, options = {}) => gate.analyser(sql, { publiees: PUBLIEES, ...options });
const MARQUE = "-- audit-identite-replication: assumé — retour arrière de R25 décidé en revue du 2026-11-04\n";
// Tout SQL que l'analyse REFUSE doit passer le pré-filtre : `auditer` n'analyse
// jamais un fichier qu'il écarte — un refus hors pré-filtre serait un refus
// que la gate réelle ne rendrait pas. Chaque cas rouge de ce banc le vérifie.
const refus = (sql, options) => {
  const r = analyser(sql, options).refus;
  if (r.length) assert.ok(gate.PRE_FILTRE.test(sql), "refusé par l'analyse, mais le pré-filtre écarterait ce fichier : " + sql);
  return r;
};

// Rejoue la gate sur un dépôt FABRIQUÉ : même script, arborescence minimale.
// La gate résout ses racines depuis son `__dirname` : il suffit de la copier
// dans le `scripts/` du faux dépôt.
function surDepotFabrique(fichiers, { r25 = R25 } = {}) {
  const dossier = mkdtempSync(join(tmpdir(), "gate-ident-"));
  try {
    mkdirSync(join(dossier, "scripts"), { recursive: true });
    writeFileSync(join(dossier, "scripts/audit-identite-replication.js"), readFileSync(join(RACINE, "scripts/audit-identite-replication.js"), "utf8"));
    writeFileSync(join(dossier, "scripts/realtime-publication.json"), readFileSync(join(RACINE, "scripts/realtime-publication.json"), "utf8"));
    const tous = { ...(r25 === null ? {} : { [gate.MIGRATION_R25]: r25 }), ...fichiers };
    for (const [chemin, contenu] of Object.entries(tous)) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    try {
      return { code: 0, sortie: execFileSync("node", [join(dossier, "scripts/audit-identite-replication.js")], { encoding: "utf8", stdio: "pipe" }) };
    } catch (e) {
      return { code: e.status, sortie: (e.stdout || "") + (e.stderr || "") };
    }
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

test("① le dépôt réel passe, et la gate le dit avec des COMPTES — pas un simple « OK »", () => {
  let sortie;
  try { sortie = execFileSync("node", [join(RACINE, "scripts/audit-identite-replication.js")], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { assert.fail("la gate refuse le dépôt réel :\n" + (e.stdout || "") + (e.stderr || "")); }
  const lus = /(\d+) fichiers SQL lus/.exec(sortie);
  const vus = /(\d+) instruction\(s\) sensible\(s\)/.exec(sortie);
  assert.ok(lus && vus, "la gate ne dit plus ce qu'elle a lu : " + sortie);
  // ⚠️ LES NOMBRES SONT L'ASSERTION. 124 migrations + 7 parties + .passio + scripts
  // au 2026-11-04 ; R25 porte 28 instructions sensibles (voir ②), et c'est la
  // seule du dépôt à en porter.
  assert.ok(Number(lus[1]) >= 130, "moins de fichiers lus qu'il n'en existe : " + sortie);
  assert.ok(Number(vus[1]) >= 28, "la gate ne voit plus les instructions de R25 : " + sortie);
});

test("② R25 elle-même : ses 28 instructions sensibles lues, son retour arrière rend l'identité AVANT de supprimer", () => {
  const r = analyser(R25, { estR25: true });
  assert.deepEqual(r.refus, []);
  // Exécutées : 5 identités, et 5 gestes de garde (4 `drop trigger if exists
  // trg_rid_opaque` avant de la reposer, son `create or replace function`).
  // Retour arrière : 5 identités, 5 gestes de garde (4 `drop trigger`, le
  // `drop function`), 4 suppressions d'index, 4 de colonne.
  assert.equal(r.gestes, 28);
  for (const t of gate.TABLES_RID) {
    assert.ok(r.identites.some((g) => g.flux === "exécuté" && g.table === t && g.sorte === "index" && g.index === t + "_rid_key"), t);
    assert.ok(r.identites.some((g) => g.flux !== "exécuté" && g.table === t && g.sorte === "default"), t + " (retour arrière)");
  }
  // Le même retour arrière, l'identité de post_likes rendue APRÈS la
  // suppression de son index : la gate le refuse — R25 ou pas.
  const ident = "--| alter table public.post_likes replica identity default;\n";
  const index = "--| drop index if exists public.post_likes_rid_key;\n";
  assert.ok(R25.includes(ident) && R25.includes(index), "le retour arrière de R25 a changé de forme : adapter ce cas");
  const r2 = analyser(R25.replace(ident, "").replace(index, index + ident), { estR25: true });
  assert.equal(r2.refus.length, 1, JSON.stringify(r2.refus, null, 1));
  assert.match(r2.refus[0].motif, /retour arrière --\|.*drop index post_likes_rid_key.*EST post_likes_rid_key/);
});

test("③ JAMAIS DISPENSABLE : supprimer un *_rid_key, ou la colonne rid, sans identité rendue — refusé, ligne nommée", () => {
  const cas = [
    ["drop index if exists public.notifications_rid_key;", "notifications_rid_key"],
    ["drop index if exists public.idx_autre, public.post_likes_rid_key cascade;", "post_likes_rid_key"],
    ['DROP INDEX IF EXISTS "public"."conv_members_rid_key";', "conv_members_rid_key"],
    ["drop index concurrently if exists conv_reads_rid_key;", "conv_reads_rid_key"],
    ['alter table only "public"."notifications" drop column if exists "rid";', "drop column rid"],
    ["alter table public.post_likes drop rid;", "drop column rid"],
    ["\n\n\ndrop index public.conv_members_rid_key;", "conv_members_rid_key"],
  ];
  for (const [sql, mot] of cas) {
    const r = refus(sql);
    assert.equal(r.length, 1, sql + " → " + JSON.stringify(r));
    assert.ok(r[0].motif.includes(mot) && /Aucun marqueur ne lève ce refus/.test(r[0].motif), r[0].motif);
  }
  assert.equal(refus("\n\n\ndrop index public.conv_members_rid_key;")[0].ligne, 4);
  // …le marqueur n'y change rien, et R25 non plus.
  assert.equal(refus(MARQUE + "drop index public.conv_members_rid_key;").length, 1);
  assert.equal(refus("drop index public.conv_members_rid_key;", { estR25: true }).length, 1);
  // …un autre index, un autre schéma : rien à dire.
  assert.deepEqual(refus("drop index if exists public.passions_trgm_idx; drop index autre.notifications_rid_key;"), []);
  assert.deepEqual(refus("alter table public.post_likes drop column rid_ancien; alter table public.post_likes drop constraint rid_cle;"), []);
});

test("④ L'ORDRE compte : l'identité rendue APRÈS, reposée sur l'index rid entre-temps, NOTHING, ou celle d'une autre table ne valent pas", () => {
  const apres = refus(MARQUE + "drop index public.post_likes_rid_key;\nalter table public.post_likes replica identity default;");
  assert.equal(apres.length, 1);
  assert.equal(apres[0].ligne, 2);
  assert.equal(refus(MARQUE + "alter table public.conv_reads replica identity default;\nalter table public.conv_reads replica identity using index conv_reads_rid_key;\ndrop index public.conv_reads_rid_key;").length, 1);
  assert.match(refus(MARQUE + "alter table public.notifications replica identity nothing;\ndrop index public.notifications_rid_key;")[0].motif, /vaut NOTHING/);
  assert.equal(refus(MARQUE + "alter table public.conv_reads replica identity default;\ndrop index public.post_likes_rid_key;").length, 1);
});

test("⑤ l'identité rendue d'abord (default, full, un autre index, ou dans le même alter) : la suppression passe", () => {
  assert.deepEqual(refus(MARQUE + "alter table public.conv_members replica identity default;\ndrop index if exists public.conv_members_rid_key;\nalter table public.conv_members drop column if exists rid;"), []);
  assert.deepEqual(refus(MARQUE + "alter table public.notifications replica identity full; drop index public.notifications_rid_key;"), []);
  assert.deepEqual(refus(MARQUE + "create unique index cr_autre on public.conv_reads (conv_id, user_id);\nalter table public.conv_reads replica identity using index cr_autre;\ndrop index public.conv_reads_rid_key;"), []);
  assert.deepEqual(refus(MARQUE + "alter table public.post_likes drop column rid, replica identity default;"), []);
});

test("⑥ le MARQUEUR, et lui seul, autorise un changement d'identité sur une table de R25, ou FULL sur une table publiée", () => {
  const r25 = refus("alter table public.conv_members replica identity full;");
  assert.equal(r25.length, 1);
  assert.match(r25[0].motif, /table de R25/);
  assert.equal(refus("alter table public.comment_interactions replica identity full;").length, 1);
  assert.equal(refus("alter table public.notifications replica identity using index notifications_rid_key;").length, 1);
  const publiee = refus("alter table public.posts replica identity full;");
  assert.equal(publiee.length, 1);
  assert.match(publiee[0].motif, /table PUBLIÉE/);
  assert.deepEqual(refus("alter table public.posts replica identity default;"), []);
  assert.deepEqual(refus("alter table public.follows replica identity full;"), []);
  for (const sql of ["alter table public.conv_members replica identity full;", "alter table public.posts replica identity full;"]) {
    assert.deepEqual(refus(MARQUE + sql), [], sql);
    assert.deepEqual(refus(sql, { estR25: true }), [], sql);
  }
  // Un marqueur sans raison, ou une raison de trois mots, n'est pas un marqueur.
  assert.equal(refus("-- audit-identite-replication: assumé —\nalter table public.posts replica identity full;").length, 1);
  assert.equal(refus("-- audit-identite-replication: assumé — ok\nalter table public.posts replica identity full;").length, 1);
  assert.equal(analyser(MARQUE).marqueur, "retour arrière de R25 décidé en revue du 2026-11-04");
});

test("⑦ ce qu'elle ne sait pas lire, elle le DIT : table ou index calculé → refusé sans marqueur", () => {
  const cas = [
    "do $$ begin execute format('drop index if exists public.%I', 'notifications_rid_key'); end $$;",
    "do $$ declare r record; begin for r in select indexname from pg_indexes where schemaname = 'public' loop execute 'drop index public.' || r.indexname; end loop; end $$;",
    "do $$ declare t text; begin foreach t in array array['posts'] loop execute format('alter table public.%I replica identity full', t); end loop; end $$;",
    "do $fn$ begin execute 'alter table ' || quote_ident('conv_members') || ' drop column rid'; end $fn$;",
    "do $$ begin execute format('alter table public.conv_members drop column %I', 'rid'); end $$;",
    "do $$ begin execute format('alter table public.post_likes replica identity using index %I', 'autre'); end $$;",
  ];
  for (const sql of cas) {
    const r = refus(sql);
    assert.equal(r.length, 1, sql + " → " + JSON.stringify(r));
    assert.match(r[0].motif, /CALCULÉ/);
    assert.deepEqual(refus(MARQUE + sql), [], sql);
  }
  // Écrit en toutes lettres DANS la chaîne d'un execute : lu, et jugé comme tel.
  assert.equal(refus("do $$ begin execute 'drop index public.notifications_rid_key'; end $$;").length, 1);
  assert.deepEqual(refus(MARQUE + "do $$ begin execute 'alter table public.notifications replica identity default'; execute 'drop index public.notifications_rid_key'; end $$;"), []);
});

test("⑧ le retour arrière en --| est un flux À PART, lu comme du SQL", () => {
  const r = refus(MARQUE + "--| drop index if exists public.notifications_rid_key;\n--| alter table public.notifications replica identity default;");
  assert.equal(r.length, 1);
  assert.match(r[0].motif, /retour arrière --\|/);
  // L'identité rendue par le flux EXÉCUTÉ ne couvre pas le retour arrière, et inversement.
  assert.equal(refus(MARQUE + "alter table public.notifications replica identity default;\n--| drop index public.notifications_rid_key;").length, 1);
  assert.equal(refus(MARQUE + "--| alter table public.notifications replica identity default;\ndrop index public.notifications_rid_key;").length, 1);
  assert.deepEqual(refus(MARQUE + "--| alter table public.notifications replica identity default;\n--| drop index public.notifications_rid_key;"), []);
});

test("⑨ un commentaire n'est pas une instruction ; une chaîne l'est (le SQL dynamique y vit)", () => {
  assert.deepEqual(refus("-- drop index public.notifications_rid_key;\n--   alter table public.conv_members drop column rid;"), []);
  assert.deepEqual(refus("/* drop index public.notifications_rid_key; /* imbriqué */ toujours commenté : drop index public.post_likes_rid_key; */ select 1;"), []);
  assert.deepEqual(refus("do $$ begin -- drop index public.post_likes_rid_key;\n  perform 1; end $$;"), []);
  // `--` dans une chaîne n'ouvre pas de commentaire : l'instruction qui suit est lue.
  assert.equal(refus("select '-- pas un commentaire'; drop index public.conv_reads_rid_key;").length, 1);
  assert.equal(refus("select $$ -- $$; drop index public.conv_reads_rid_key;").length, 1);
  assert.equal(refus("select E'l\\'index -- toujours une chaîne'; drop index public.conv_reads_rid_key;").length, 1);
  // Le prix, assumé et écrit dans l'en-tête de la gate : une PHRASE qui écrit
  // la suppression dans une chaîne se reformule.
  assert.equal(refus("comment on index public.x is 'ne jamais drop index public.notifications_rid_key';").length, 1);
});

test("⑩ le périmètre : migrations/ (parties comprises), .passio/migrations/, scripts/ — pas tests/, ni la photographie générée", () => {
  const casse = "drop index if exists public.notifications_rid_key;\n";
  for (const chemin of ["migrations/migration_purge_index_2026-12-01.sql", "migrations/parties/partie-99.sql", ".passio/migrations/EN_ATTENTE-purge.sql", "scripts/gabarits/socle.sql", "supabase/migrations/0001.sql"]) {
    const r = surDepotFabrique({ [chemin]: casse });
    assert.equal(r.code, 1, chemin + " : " + r.sortie);
    assert.ok(r.sortie.includes(chemin + ":ligne 1"), r.sortie);
  }
  for (const chemin of ["tests/sql/banc.sql", "migrations/SCHEMA_PROD_REFERENCE.sql", "docs/exemple.sql"]) {
    const r = surDepotFabrique({ [chemin]: casse });
    assert.equal(r.code, 0, chemin + " : " + r.sortie);
  }
});

test("⑪ la gate et R25 parlent des MÊMES index : R25 absente, ou qui ne pose plus une identité *_rid_key — la gate rougit", () => {
  const sans = surDepotFabrique({}, { r25: R25.replace("alter table public.post_likes replica identity using index post_likes_rid_key;\n", "") });
  assert.equal(sans.code, 1, sans.sortie);
  assert.match(sans.sortie, /ne pose plus « replica identity using index post_likes_rid_key »/);
  const absente = surDepotFabrique({}, { r25: null });
  assert.equal(absente.code, 1, absente.sortie);
  assert.match(absente.sortie, /introuvable/);
  assert.equal(surDepotFabrique({}).code, 0);
});

test("⑫ la gate tourne dans `npm run verif`, et ce banc aussi — une gate lancée nulle part ne protège rien", () => {
  const verif = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf8")).scripts.verif;
  assert.match(verif, /node scripts\/audit-identite-replication\.js(\s|$)/);
  assert.match(verif, /node --test tests\/unit\/audit-identite-replication\.test\.mjs/);
});

test("⑬ la colonne rid d'une table HORS des quatre se supprime sans rien demander — aucun refus, aucun geste", () => {
  // Avant le correctif : « Aucun marqueur ne lève ce refus », même après
  // `replica identity default` — une table hors des quatre n'a pas d'état d'identité suivi.
  for (const sql of [
    "alter table public.posts drop column rid;",
    "alter table public.posts drop column if exists rid cascade;",
    "alter table public.posts replica identity default;\nalter table public.posts drop column rid;",
    'alter table "public"."follows" drop "rid";',
  ]) assert.deepEqual(refus(sql), [], sql);
  assert.equal(analyser("alter table public.posts drop column rid;").gestes, 0);
  // La lecture elle-même n'en fait pas une suppression (le contrôle de l'état, lui, ne suit que les quatre).
  assert.deepEqual(gate.gestes("alter table public.posts drop column rid").filter((g) => g.type === "suppression"), []);
  // …et pour les quatre, ① tient toujours.
  assert.equal(refus(MARQUE + "alter table public.notifications drop column rid;").length, 1);
});

test("⑭ l'index rid RETOUCHÉ ou renommé : refusé sans marqueur — renommé, son nouveau nom reste gardé par ①", () => {
  const cas = [
    "alter index public.notifications_rid_key rename to notif_rid;",
    "alter index if exists notifications_rid_key rename to notif_rid;",
    'ALTER INDEX "public"."conv_members_rid_key" RENAME TO cm_rid;',
    // PostgreSQL accepte `alter table <index> rename to …` : le même renommage.
    "alter table public.conv_reads_rid_key rename to cr_rid;",
    "alter index public.post_likes_rid_key set (fillfactor = 70);",
    "do $$ begin execute 'alter index public.post_likes_rid_key rename to ' || v_nom; end $$;",
  ];
  for (const sql of cas) {
    const r = refus(sql);
    assert.equal(r.length, 1, sql + " → " + JSON.stringify(r));
    assert.match(r[0].motif, /retouche \w+_rid_key, l'index qui porte l'identité de réplication de public\.\w+/);
    assert.deepEqual(refus(MARQUE + sql), [], sql);
    assert.deepEqual(refus(sql, { estR25: true }), [], sql);
  }
  // Marqueur posé, le renommage passe — mais l'index renommé porte TOUJOURS
  // l'identité (mesuré) : le supprimer sous son nouveau nom reste ①.
  const apres = refus(MARQUE + "alter index public.notifications_rid_key rename to notif_rid;\ndrop index public.notif_rid;");
  assert.equal(apres.length, 1);
  assert.equal(apres[0].ligne, 3);
  assert.match(apres[0].motif, /« drop index notif_rid » .*EST notif_rid.*Aucun marqueur ne lève ce refus/);
  assert.equal(refus(MARQUE + "alter table public.conv_reads_rid_key rename to cr_rid;\nalter table public.conv_reads drop column rid;").length, 1);
  // Renommé vers un nom CALCULÉ : plus aucun nom écrit ne le désigne, et la colonne qui l'emporte reste gardée.
  assert.match(refus(MARQUE + "do $$ begin execute 'alter index public.notifications_rid_key rename to ' || v_nom; end $$;\nalter table public.notifications drop column rid;")[0].motif, /renommé vers un nom CALCULÉ/);
  // L'identité rendue d'abord, l'index renommé se supprime.
  assert.deepEqual(refus(MARQUE + "alter index public.notifications_rid_key rename to notif_rid;\nalter table public.notifications replica identity default;\ndrop index public.notif_rid;"), []);
  // Un autre index, un autre schéma : rien à dire. Un index CALCULÉ : dit comme tel.
  assert.deepEqual(refus("alter index public.passions_trgm_idx rename to passions_trgm;\nalter index autre.notifications_rid_key rename to x;"), []);
  assert.match(refus("do $$ begin execute format('alter index public.%I rename to %I', 'a', 'b'); end $$;")[0].motif, /CALCULÉ/);
});

test("⑮ l'index rid devenu CONTRAINTE : `drop constraint` le supprime (①), `add constraint … using index` le retouche (②)", () => {
  for (const sql of ["alter table public.post_likes drop constraint post_likes_rid_key;", "alter table if exists public.conv_reads drop constraint if exists conv_reads_rid_key cascade;"]) {
    const r = refus(MARQUE + sql);
    assert.equal(r.length, 1, sql + " → " + JSON.stringify(r));
    assert.match(r[0].motif, /« alter table \w+ drop constraint (\w+_rid_key) » .*EST \1 .*Aucun marqueur ne lève ce refus/);
  }
  assert.deepEqual(refus(MARQUE + "alter table public.post_likes replica identity default;\nalter table public.post_likes drop constraint post_likes_rid_key;"), []);
  assert.deepEqual(refus(MARQUE + "alter table public.post_likes drop constraint post_likes_rid_key, replica identity default;"), []);
  for (const sql of [
    "alter table public.post_likes add constraint pl_rid unique using index post_likes_rid_key;",
    "alter table public.conv_reads add unique using index conv_reads_rid_key;",
    "alter table public.notifications add constraint n_rid primary key using index notifications_rid_key deferrable;",
  ]) {
    const r = refus(sql);
    assert.equal(r.length, 1, sql + " → " + JSON.stringify(r));
    assert.match(r[0].motif, /retouche \w+_rid_key/);
    assert.deepEqual(refus(MARQUE + sql), [], sql);
  }
  // L'index prend le nom de la contrainte (mesuré), et renommer la contrainte le renomme encore : la gate suit.
  const renomme = refus(MARQUE + "alter table public.post_likes add constraint pl_rid unique using index post_likes_rid_key;\nalter table public.post_likes rename constraint pl_rid to pl_rid2;\nalter table public.post_likes drop constraint pl_rid2;");
  assert.equal(renomme.length, 1);
  assert.match(renomme[0].motif, /drop constraint pl_rid2 » .*EST pl_rid2/);
  // Sans nom de contrainte, l'index garde le sien : `drop constraint <table>_rid_key` le retire.
  assert.equal(refus(MARQUE + "alter table public.conv_reads add unique using index conv_reads_rid_key;\nalter table public.conv_reads drop constraint conv_reads_rid_key;").length, 1);
  // Une autre contrainte, l'index d'une autre table : rien à dire.
  assert.deepEqual(refus("alter table public.notifications drop constraint if exists notifications_origine_check;\nalter table public.posts add constraint p_u unique using index posts_u;"), []);
});

test("⑯ défaire une des quatre tables (supprimée, renommée, déplacée, sa colonne rid renommée) : refusé sans marqueur", () => {
  const cas = [
    ["drop table if exists public.conv_members;", /« drop table conv_members »/],
    ["drop table public.posts_archive, public.notifications cascade;", /« drop table notifications »/],
    ['DROP TABLE "public"."post_likes";', /« drop table post_likes »/],
    ["alter table public.post_likes rename to post_likes_old;", /la table quitte son nom/],
    ["alter table if exists public.conv_reads set schema archive;", /la table quitte son nom/],
    // `alter index <table> rename to …` renomme la TABLE (mesuré).
    ["alter index public.notifications rename to notifications_old;", /la table quitte son nom/],
    ["alter table public.notifications rename column rid to rid2;", /ne trouve plus rid : tout INSERT/],
    ["alter table public.conv_members rename rid to identifiant;", /ne trouve plus rid : tout INSERT/],
  ];
  for (const [sql, motif] of cas) {
    const r = refus(sql);
    assert.equal(r.length, 1, sql + " → " + JSON.stringify(r));
    assert.match(r[0].motif, motif);
    assert.match(r[0].motif, /défait public\.\w+, table de R25/);
    assert.deepEqual(refus(MARQUE + sql), [], sql);
    assert.deepEqual(refus(sql, { estR25: true }), [], sql);
  }
  // Une autre table, une autre colonne, et `alter publication … drop table` (qui ne supprime rien) : rien à dire.
  assert.deepEqual(refus([
    "drop table if exists public.passion_requests;",
    "alter table public.posts rename to posts_old;",
    "alter table public.notifications rename column body to corps;",
    "alter publication supabase_realtime drop table public.notifications;",
    "do $$ begin execute 'alter publication supabase_realtime drop table public.post_likes'; end $$;",
  ].join("\n")), []);
  assert.match(refus("do $$ begin execute format('drop table if exists public.%I', 'x'); end $$;")[0].motif, /CALCULÉ/);
});

test("⑰ une table que le FICHIER ajoute à supabase_realtime y est publiée — avant ou après, en --| compris", () => {
  const full = "alter table public.follows replica identity full;";
  assert.deepEqual(refus(full), [], "follows n'est pas publiée : FULL y est libre");
  for (const ajout of [
    "alter publication supabase_realtime add table public.follows;",
    "ALTER PUBLICATION supabase_realtime ADD TABLE follows;",
    "alter publication supabase_realtime add table public.posts_archive, table public.follows;",
    "alter publication supabase_realtime add table only public.events, public.follows (id, follower_id);",
    "alter publication supabase_realtime set table public.follows;",
    "create publication supabase_realtime for table public.follows;",
    "DO $$ BEGIN\n  ALTER PUBLICATION supabase_realtime ADD TABLE follows;\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "--| alter publication supabase_realtime add table public.follows;",
    // Toutes celles de public : un schéma entier, toutes les tables, ou un nom calculé.
    "alter publication supabase_realtime add tables in schema public;",
    "create publication supabase_realtime for all tables;",
    "do $$ begin execute format('alter publication supabase_realtime add table public.%I', 'follows'); end $$;",
  ]) {
    for (const sql of [ajout + "\n" + full, full + "\n" + ajout]) {
      const r = refus(sql);
      assert.equal(r.length, 1, sql + " → " + JSON.stringify(r));
      assert.match(r[0].motif, /« alter table follows replica identity full » sur une table PUBLIÉE/);
      assert.deepEqual(refus(MARQUE + sql), [], sql);
    }
  }
  // Une autre publication, ou les paramètres de celle-ci : rien n'est ajouté.
  assert.deepEqual(refus("alter publication autre add table public.follows;\n" + full), []);
  assert.deepEqual(refus("alter publication supabase_realtime set (publish = 'insert, update');\n" + full), []);
  assert.deepEqual(refus("alter publication supabase_realtime add tables in schema autre;\n" + full), []);
  // Les migrations du dépôt qui publient (`ALTER PUBLICATION supabase_realtime ADD TABLE …`) : lues, et sans refus.
  for (const [f, tables] of [
    ["migrations/supabase_tables.sql", ["posts", "conv_messages", "notifications", "conv_members"]],
    ["migrations/migration_video_lives.sql", ["video_lives"]],
    ["migrations/migration_comment_interactions.sql", ["comment_interactions"]],
    ["migrations/migration_conv_reads.sql", ["conv_reads"]],
  ]) {
    const src = readFileSync(join(RACINE, f), "utf8");
    const lues = new Set();
    for (const i of gate.instructions(gate.sansCommentaires(src))) gate.publications(i.texte).tables.forEach((t) => lues.add(t));
    for (const t of tables) assert.ok(lues.has(t), `${f} : ${t} n'est plus lue comme publiée`);
    assert.deepEqual(analyser(src).refus, [], f);
  }
});

test("⑱ `replica identity using index` sur une table PUBLIÉE : refusé sans marqueur — le WAL d'un DELETE porte les colonnes de l'index", () => {
  for (const sql of [
    "create unique index posts_auteur on public.posts (user_id, id);\nalter table public.posts replica identity using index posts_auteur;",
    "alter table public.conv_messages replica identity using index conv_messages_conv_auteur;",
    "alter publication supabase_realtime add table public.follows;\nalter table public.follows replica identity using index follows_paire;",
  ]) {
    const r = refus(sql);
    assert.equal(r.length, 1, sql + " → " + JSON.stringify(r));
    assert.match(r[0].motif, /replica identity using index \w+ » sur une table PUBLIÉE : le WAL d'un DELETE porte alors les colonnes de cet index/);
    assert.deepEqual(refus(MARQUE + sql), [], sql);
  }
  // Non publiée : libre. Une des quatre sur son propre index rid : la règle des tables de R25, un refus et un seul.
  assert.deepEqual(refus("alter table public.follows replica identity using index follows_paire;"), []);
  const r25 = refus("alter table public.conv_members replica identity using index conv_members_rid_key;");
  assert.equal(r25.length, 1);
  assert.match(r25[0].motif, /table de R25/);
});

test("⑲ la forme descendante `<table> *` se lit comme la table seule", () => {
  for (const [avec, sans] of [
    ["alter table public.posts * replica identity full;", "alter table public.posts replica identity full;"],
    ["alter table public.posts* replica identity full;", "alter table public.posts replica identity full;"],
    ["alter table if exists public.comment_interactions * replica identity full;", "alter table public.comment_interactions replica identity full;"],
    ["alter table public.notifications * drop column rid;", "alter table public.notifications drop column rid;"],
  ]) {
    const a = refus(avec), b = refus(sans);
    assert.equal(a.length, 1, avec + " → " + JSON.stringify(a));
    assert.equal(a[0].motif, b[0].motif, avec);
  }
});

test("⑳ une des cinq tables, nommée en toutes lettres, dont l'ACTION se calcule : dite CALCULÉE (③) — et son identité devient inconnue", () => {
  for (const sql of [
    "do $$ begin execute format('alter table public.post_likes %s', 'drop column rid'); end $$;",
    "do $$ begin execute format('alter table public.notifications %1$s', v_action); end $$;",
    "do $$ begin execute 'alter table public.comment_interactions ' || 'replica identity full'; end $$;",
    "do $$ begin execute 'alter table public.conv_reads' || v_action; end $$;",
    "do $$ begin execute format($q$alter table public.conv_members %s$q$, v_action); end $$;",
    "do $$ begin execute format('alter table public.notifications drop constraint %I', v_nom); end $$;",
  ]) {
    const r = refus(sql);
    assert.equal(r.length, 1, sql + " → " + JSON.stringify(r));
    assert.match(r[0].motif, /ACTION CALCULÉE sur une table de R25/);
    assert.deepEqual(refus(MARQUE + sql), [], sql);
  }
  // Le marqueur lève ③, jamais ① : après une action calculée, rien ne prouve que l'identité a été rendue.
  const apres = refus(MARQUE + "do $$ begin execute format('alter table public.notifications %s', 'replica identity default'); end $$;\ndrop index public.notifications_rid_key;");
  assert.equal(apres.length, 1);
  assert.match(apres[0].motif, /est CALCULÉE.*Aucun marqueur ne lève ce refus/);
  // Une identité écrite, suivie d'une partie calculée du même alter : la partie calculée a pu en reposer une autre.
  assert.equal(refus(MARQUE + "do $$ begin execute 'alter table public.notifications replica identity default, ' || v_suite; end $$;\ndrop index public.notifications_rid_key;").length, 1);
  // Une table PUBLIÉE hors R25 dont l'identité se calcule : dite aussi ; non publiée, libre.
  assert.match(refus("do $$ begin execute 'alter table public.posts replica identity ' || v_mode; end $$;")[0].motif, /identité de réplication CALCULÉE sur une table PUBLIÉE/);
  assert.match(refus("do $$ begin execute format('alter table public.posts %s', 'replica identity full'); end $$;")[0].motif, /identité de réplication CALCULÉE sur une table PUBLIÉE/);
  assert.deepEqual(refus("do $$ begin execute 'alter table public.follows replica identity ' || v_mode; end $$;"), []);
  // Un geste, un refus : l'index calculé d'une identité n'est pas dit deux fois.
  for (const sql of ["do $$ begin execute format('alter table public.posts replica identity using index %I', v_idx); end $$;", "do $$ begin execute format('alter table public.post_likes replica identity using index %I', v_idx); end $$;"]) {
    assert.equal(refus(sql).length, 1, sql);
  }
  // Un `||` ou un `%` d'une expression STATIQUE n'est pas une action calculée — R25 écrit ainsi le défaut de rid.
  const defautR25 = /alter table public\.conv_members add column if not exists rid bigint not null\n\s+default [^;]+;/.exec(R25);
  assert.ok(defautR25, "le défaut de rid a changé de forme dans R25 : adapter ce cas");
  assert.deepEqual(refus(defautR25[0]), []);
  assert.equal(analyser(defautR25[0]).gestes, 0);
  assert.deepEqual(refus("alter table public.notifications add constraint c check (id like 'n\\_%' and length(id) % 2 = 0);"), []);
});

test("㉑ la garde trg_rid_opaque et sa fonction : la supprimer, la désarmer ou la redéfinir — refusé sans marqueur, hors R25", () => {
  for (const sql of [
    "drop trigger if exists trg_rid_opaque on public.notifications;",
    'DROP TRIGGER "trg_rid_opaque" ON public.conv_members CASCADE;',
    "alter trigger trg_rid_opaque on public.post_likes rename to garde;",
    "create or replace trigger trg_rid_opaque before insert or update of rid on public.notifications for each row when (false) execute function public.rid_opaque_garde();",
    "alter table public.notifications disable trigger trg_rid_opaque;",
    "alter table public.conv_members disable trigger all;",
    "alter table only public.conv_reads disable trigger user;",
    "alter table public.post_likes enable replica trigger trg_rid_opaque;",
    "create or replace function public.rid_opaque_garde() returns trigger language plpgsql as $$ begin return new; end $$;",
    "drop function if exists public.rid_opaque_garde();",
    "drop function if exists public.autre(text), rid_opaque_garde() cascade;",
    "drop routine public.rid_opaque_garde;",
    "alter function public.rid_opaque_garde() rename to garde_renommee;",
    "alter routine public.rid_opaque_garde() security invoker;",
  ]) {
    const r = refus(sql);
    assert.equal(r.length, 1, sql + " → " + JSON.stringify(r));
    assert.match(r[0].motif, /touche à la garde trg_rid_opaque/);
    assert.deepEqual(refus(MARQUE + sql), [], sql);
    assert.deepEqual(refus(sql, { estR25: true }), [], sql);
  }
  // Ce qui ne la touche pas : un autre déclencheur, une autre fonction, une
  // autre table, `enable [always] trigger` (elle tire), une création simple.
  assert.deepEqual(refus([
    "drop trigger if exists zz_barriere_suppression on public.notifications;",
    "create or replace function public.follows_notifier() returns trigger language plpgsql as $$ begin return new; end $$;",
    "alter table public.posts disable trigger user;",
    "alter table public.post_likes enable always trigger trg_rid_opaque;",
    "alter table public.post_likes enable trigger trg_rid_opaque;",
    "create trigger trg_rid_opaque before insert on public.nouvelle for each row execute function public.rid_opaque_garde();",
  ].join("\n")), []);
  // Un déclencheur ou une fonction CALCULÉ : dit comme tel.
  assert.match(refus("do $$ begin execute format('drop trigger if exists %I on public.notifications', v_nom); end $$;")[0].motif, /CALCULÉ/);
  assert.match(refus("do $$ begin execute 'drop function if exists ' || v_signature; end $$;")[0].motif, /CALCULÉ/);
});

test("㉒ le pré-filtre trie sur des MOTS : un fichier qui ne porte qu'un geste neuf, ou un commentaire entre deux mots, est LU", () => {
  const seuls = {
    "migrations/a_renomme.sql": "alter index public.notifications_rid_key rename to n_rid;\n",
    "migrations/b_contrainte.sql": "alter table public.post_likes drop constraint post_likes_rid_key;\n",
    "migrations/c_table.sql": "drop table if exists public.conv_members;\n",
    "migrations/d_renomme_table.sql": "alter table public.conv_reads rename to cr_old;\n",
    "migrations/e_garde.sql": "drop trigger if exists trg_rid_opaque on public.notifications;\n",
    "migrations/f_fonction.sql": "drop function if exists public.rid_opaque_garde();\n",
    "migrations/g_publication.sql": "alter publication supabase_realtime add table public.follows;\nalter table public.follows replica identity full;\n",
    // L'analyse retire le commentaire et lit `drop index` : un pré-filtre sur la paire de mots l'aurait écarté.
    "migrations/h_commentaire.sql": "drop/* le pré-filtre ne s'y arrête pas */index public.notifications_rid_key;\n",
    "migrations/i_calcule.sql": "do $$ begin execute format('alter table public.post_likes %s', v_action); end $$;\n",
  };
  const r = surDepotFabrique(seuls);
  assert.equal(r.code, 1, r.sortie);
  for (const f of Object.keys(seuls)) assert.ok(r.sortie.includes(f + ":ligne "), f + " n'a pas été lu :\n" + r.sortie);
  assert.equal((r.sortie.match(/^\s+\d+\. /gm) || []).length, Object.keys(seuls).length, r.sortie);
  // Ce qu'il écarte ne porte aucun des mots d'une instruction gardée.
  assert.equal(gate.PRE_FILTRE.test("insert into public.x values (1);\nupdate public.y set z = 2;"), false);
});

test("㉓ un nom refermé par une balise dollar (`execute $q$drop index …_rid_key$q$`) se lit comme le nom seul", () => {
  const r = refus("do $$ begin execute $q$drop index public.notifications_rid_key$q$; end $$;");
  assert.equal(r.length, 1);
  assert.match(r[0].motif, /« drop index notifications_rid_key »/);
  assert.match(refus("do $$ begin execute $q$alter table public.post_likes$q$ || v_action; end $$;")[0].motif, /ACTION CALCULÉE/);
});

test("㉔ l'index qui PORTE l'identité, quel que soit son nom : le supprimer est ① ; reconstruire l'index rid passe", () => {
  // L'identité reposée sur un autre index, puis CET index supprimé : la table vaudrait NOTHING.
  const autre = refus(MARQUE + "create unique index cr_autre on public.conv_reads (conv_id, user_id);\nalter table public.conv_reads replica identity using index cr_autre;\ndrop index public.cr_autre;");
  assert.equal(autre.length, 1);
  assert.match(autre[0].motif, /« drop index cr_autre » .*EST cr_autre/);
  // Reconstruction (mesurée : le DELETE passe) — l'ancien renommé, un neuf sous
  // le nom d'origine, l'identité sur le neuf, l'ancien supprimé.
  const reconstruit = MARQUE + "alter index public.conv_reads_rid_key rename to conv_reads_rid_ancien;\ncreate unique index conv_reads_rid_key on public.conv_reads (rid);\nalter table public.conv_reads replica identity using index conv_reads_rid_key;\ndrop index public.conv_reads_rid_ancien;";
  assert.deepEqual(refus(reconstruit), []);
  // …le neuf porte l'identité : le supprimer à son tour est ①.
  assert.equal(refus(reconstruit + "\ndrop index public.conv_reads_rid_key;").length, 1);
});
