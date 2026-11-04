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
// retour arrière en `--|`, SQL calculé) rendrait « OK » sur ce défaut exact.
// Chaque forme a donc ici son cas ROUGE, et chaque sortie légitime son cas VERT.
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
const refus = (sql, options) => analyser(sql, options).refus;

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
  // au 2026-11-04 ; R25 porte 18 instructions sensibles (5 identités exécutées,
  // et dans son retour arrière 5 identités, 4 suppressions d'index, 4 de colonne).
  assert.ok(Number(lus[1]) >= 130, "moins de fichiers lus qu'il n'en existe : " + sortie);
  assert.ok(Number(vus[1]) >= 18, "la gate ne voit plus les instructions de R25 : " + sortie);
});

test("② R25 elle-même : ses 18 instructions sensibles lues, son retour arrière rend l'identité AVANT de supprimer", () => {
  const r = analyser(R25, { estR25: true });
  assert.deepEqual(r.refus, []);
  assert.equal(r.gestes, 18);
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
