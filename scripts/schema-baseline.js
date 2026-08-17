#!/usr/bin/env node
/**
 * SCHÉMA DE RÉFÉRENCE — photographie la structure RÉELLE de la production.
 *
 * Pourquoi ce script plutôt que `supabase db dump` : `db dump` exige Docker,
 * et il laisse un fichier de 0 octet quand Docker est absent — un échec
 * SILENCIEUX, le pire genre pour une sauvegarde (mesuré le 2026-08-16).
 * Ici chaque requête est lue, et un résultat vide est écrit comme tel.
 *
 * Le dépôt n'est PAS la source de vérité du schéma : les migrations décrivent
 * ce qu'on a voulu, la base décrit ce qui est. Ce fichier sert à :
 *   ① comparer d'une date à l'autre (`git diff` sur la sortie) ;
 *   ② semer une base de non-production identique à la prod ;
 *   ③ répondre « quelles colonnes existent vraiment ? » sans interroger la prod.
 *
 * LECTURE SEULE. Aucune écriture, aucune donnée : structure uniquement.
 *   node scripts/schema-baseline.js [chemin de sortie]
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SORTIE = process.argv[2] || path.join("migrations", "SCHEMA_PROD_REFERENCE.sql");

const TMP = path.join(require("os").tmpdir(), `passio-schema-${process.pid}.sql`);

function requete(sql) {
  // La requête part par FICHIER (`-f`), pas en argument : elle contient des
  // apostrophes et des `*`, que l'interpréteur de commandes Windows mangerait.
  fs.writeFileSync(TMP, sql, "utf8");
  // ⚠️ Windows : `supabase` est un `.cmd`, et Node refuse de lancer un `.cmd`
  // directement (EINVAL) — il faut passer par l'interpréteur. Sur les autres
  // plateformes l'exécutable se lance tel quel.
  const brut = process.platform === "win32"
    ? execFileSync(process.env.ComSpec || "cmd.exe",
        // Chemin SANS guillemets : `supabase` est ici une enveloppe `.cmd` npm,
        // qui ne les ôte pas — ils arrivaient littéralement à la CLI (« open
        // "C:\…" : syntaxe incorrecte »). D'où le fichier temporaire placé dans
        // un répertoire sans espace, condition de cette simplification.
        ["/d", "/c", `supabase db query --linked -o json -f ${TMP}`],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    : execFileSync("supabase",
        ["db", "query", "--linked", "-o", "json", "-f", TMP],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // La CLI préfixe « Initialising login role... » et suffixe des avis de mise à
  // jour : on isole l'objet JSON, sinon JSON.parse casse sur du bruit humain.
  const debut = brut.indexOf("{");
  const fin = brut.lastIndexOf("}");
  if (debut < 0 || fin < 0) throw new Error("réponse illisible : " + brut.slice(0, 200));
  return JSON.parse(brut.slice(debut, fin + 1)).rows || [];
}

/** Une section = un titre + des lignes déjà mises en forme. Un vide est DIT. */
function section(titre, lignes) {
  const barre = "-- " + "═".repeat(73);
  const corps = lignes.length ? lignes.join("\n")
    : "--   (aucun objet de ce type — vérifié, pas supposé)";
  return `${barre}\n-- ${titre}\n${barre}\n${corps}\n`;
}

const BLOCS = [
  { titre: "TABLES ET COLONNES (schéma public)", sql: `
      select table_name, ordinal_position, column_name, data_type,
             is_nullable, coalesce(column_default,'') as defaut
        from information_schema.columns
       where table_schema='public'
       order by table_name, ordinal_position`,
    format: (rows) => {
      const parTable = new Map();
      for (const r of rows) {
        if (!parTable.has(r.table_name)) parTable.set(r.table_name, []);
        // Le TYPE est ce qui compte le plus ici : la prod mélange `timestamp`
        // et `timestamptz`, et `id` est TEXT — deux pièges maison qui se lisent
        // dans cette colonne et nulle part ailleurs.
        parTable.get(r.table_name).push(
          `--   ${r.column_name.padEnd(28)} ${r.data_type}`
          + `${r.is_nullable === "NO" ? " NOT NULL" : ""}`
          + `${r.defaut ? " default " + r.defaut : ""}`);
      }
      return [...parTable.entries()].map(([t, cols]) => `-- ${t}\n${cols.join("\n")}`);
    } },

  { titre: "CLÉS PRIMAIRES, ÉTRANGÈRES ET UNIQUES", sql: `
      select conrelid::regclass::text as tbl, conname,
             pg_get_constraintdef(oid) as def
        from pg_constraint
       where connamespace='public'::regnamespace and contype in ('p','f','u')
       order by 1, 2`,
    format: (r) => r.map((x) => `--   ${x.tbl}.${x.conname} : ${x.def}`) },

  { titre: "INDEX", sql: `
      select indexdef from pg_indexes
       where schemaname='public' order by tablename, indexname`,
    format: (r) => r.map((x) => `${x.indexdef};`) },

  { titre: "POLICIES RLS (public ET storage) — la frontière de confiance", sql: `
      select schemaname, tablename, policyname, cmd,
             coalesce(qual,'-') as using_expr, coalesce(with_check,'-') as check_expr
        from pg_policies
       where schemaname in ('public','storage')
       order by schemaname, tablename, cmd, policyname`,
    format: (r) => r.map((x) =>
      `--   [${x.cmd.padEnd(6)}] ${x.schemaname}.${x.tablename} · ${x.policyname}\n`
      + `--       using  : ${x.using_expr}\n`
      + `--       check  : ${x.check_expr}`) },

  { titre: "RLS ACTIVÉE ? — une table sans RLS est ouverte à tous", sql: `
      select relname, relrowsecurity as rls
        from pg_class where relnamespace='public'::regnamespace and relkind='r'
       order by relname`,
    format: (r) => r.map((x) =>
      `--   ${x.rls ? "RLS " : "⚠️ SANS RLS "}${x.relname}`) },

  { titre: "FONCTIONS (dont les SECURITY DEFINER, qui contournent la RLS)", sql: `
      select p.proname, pg_get_function_identity_arguments(p.oid) as args,
             p.prosecdef as secdef
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' order by p.proname`,
    format: (r) => r.map((x) =>
      `--   ${x.secdef ? "SECURITY DEFINER " : ""}${x.proname}(${x.args})`) },

  { titre: "DÉCLENCHEURS", sql: `
      select tgrelid::regclass::text as tbl, tgname
        from pg_trigger
       where not tgisinternal and tgrelid::regclass::text not like 'pg\\_%'
       order by 1, 2`,
    format: (r) => r.map((x) => `--   ${x.tbl} → ${x.tgname}`) },

  { titre: "PUBLICATION REALTIME — ce qui est diffusé en direct", sql: `
      select pubname, schemaname, tablename
        from pg_publication_tables order by pubname, schemaname, tablename`,
    format: (r) => r.map((x) => `--   ${x.pubname} : ${x.schemaname}.${x.tablename}`) },

  { titre: "SEAUX DE STOCKAGE", sql: `
      select name, public, coalesce(file_size_limit,-1) as taille_max,
             coalesce(allowed_mime_types::text,'(aucune liste)') as types
        from storage.buckets order by name`,
    format: (r) => r.map((x) =>
      `--   ${x.name} · ${x.public ? "PUBLIC" : "privé"}`
      + ` · taille max ${x.taille_max < 0 ? "AUCUNE" : x.taille_max + " o"}`
      + ` · types ${x.types}`) },
];

const morceaux = [
  `-- ${"═".repeat(73)}`,
  `-- SCHÉMA RÉEL DE LA PRODUCTION — photographie du ${new Date().toISOString().slice(0, 10)}`,
  "--",
  "-- Généré par `node scripts/schema-baseline.js`. NE PAS ÉDITER À LA MAIN :",
  "-- ce fichier décrit ce qui EST, pas ce qu'on voudrait. Pour voir ce qui a",
  "-- changé depuis la dernière photographie : régénérer, puis `git diff`.",
  "--",
  "-- Il ne contient AUCUNE donnée — structure et règles d'accès uniquement.",
  `-- ${"═".repeat(73)}`, "",
];

let echecs = 0;
for (const b of BLOCS) {
  process.stderr.write(`… ${b.titre}\n`);
  try {
    morceaux.push(section(b.titre, b.format(requete(b.sql))));
  } catch (e) {
    echecs++;
    // Un bloc en échec est ÉCRIT comme échec. Le silence produirait une
    // photographie incomplète qu'on croirait complète — exactement le défaut
    // du `db dump` de 0 octet.
    morceaux.push(section(b.titre + " — ⚠️ NON RÉCUPÉRÉ",
      [`--   ÉCHEC : ${String(e.message).split("\n")[0]}`]));
  }
}

try { fs.unlinkSync(TMP); } catch (_) {}
fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
fs.writeFileSync(SORTIE, morceaux.join("\n"), "utf8");
console.log(`${SORTIE} — ${BLOCS.length - echecs}/${BLOCS.length} blocs récupérés`);
if (echecs) { console.error(`${echecs} bloc(s) en échec : la photographie est INCOMPLÈTE.`); process.exit(1); }
