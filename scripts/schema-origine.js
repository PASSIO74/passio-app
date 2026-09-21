#!/usr/bin/env node
/**
 * ORIGINE — reconstruit un fichier SQL EXÉCUTABLE qui recrée le schéma de la
 * production dans une base vide.
 *
 * Pourquoi il existe, et pourquoi il n'est pas `pg_dump` : ce poste n'a ni
 * `pg_dump`, ni `psql`, ni Docker — donc ni `supabase db dump` (qui exige
 * Docker et laisse un fichier de 0 octet quand il manque). Le seul canal
 * disponible vers la production est l'API de gestion, en SQL. On reconstruit
 * donc le DDL depuis le catalogue Postgres.
 *
 * Pourquoi une ORIGINE plutôt qu'une réconciliation des 59 migrations :
 * `supabase_migrations.schema_migrations` de la production ne contient que 3
 * entrées. La chaîne de migrations n'existe pas — 95 % du schéma a été posé à
 * la main. Rendre rejouables 59 fichiers jamais exécutés dans l'ordre, dont
 * certains décrivent des états abandonnés, reconstituerait un passé dont
 * personne n'a besoin. On CONSTATE l'état actuel, on en fait le point zéro, et
 * tout changement ultérieur devient une migration numérotée.
 *
 * ⚠️ CE FICHIER N'EST PAS UNE SAUVEGARDE. Il recrée la STRUCTURE, jamais les
 * données, et il ne couvre pas ce qui vit hors du schéma `public` : comptes
 * (`auth`), objets déposés dans le Storage, secrets du projet. Ce qu'il ne sait
 * pas reproduire est ÉCRIT dans sa sortie plutôt que passé sous silence.
 *
 * LECTURE SEULE sur la production.
 *   node scripts/schema-origine.js [chemin de sortie]
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SORTIE = process.argv[2] || path.join("migrations", "00_ORIGINE_PROD.sql");
const TMP = path.join(os.tmpdir(), `passio-origine-${process.pid}.sql`);

function requete(sql) {
  fs.writeFileSync(TMP, sql, "utf8");
  // Windows : `supabase` est une enveloppe `.cmd` (Node refuse de la lancer
  // directement) qui ne retire PAS les guillemets d'un chemin — d'où le passage
  // par l'interpréteur, sans guillemets, avec un dossier temporaire sans espace.
  const brut = process.platform === "win32"
    ? execFileSync(process.env.ComSpec || "cmd.exe",
        ["/d", "/c", `supabase db query --linked -o json -f ${TMP}`],
        { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 })
    : execFileSync("supabase", ["db", "query", "--linked", "-o", "json", "-f", TMP],
        { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  const a = brut.indexOf("{"), b = brut.lastIndexOf("}");
  if (a < 0) throw new Error("réponse illisible : " + brut.slice(0, 200));
  return JSON.parse(brut.slice(a, b + 1)).rows || [];
}

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const litt = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ── Les étapes, DANS L'ORDRE D'EXÉCUTION. C'est tout l'enjeu du fichier :
//    une fonction doit exister avant la policy qui l'appelle, une table avant
//    sa clé étrangère. L'ordre ci-dessous est celui qui se rejoue.
const ETAPES = [
  { titre: "Extensions", sql: `
      select e.extname, n.nspname from pg_extension e
        join pg_namespace n on n.oid=e.extnamespace
       where e.extname not in ('plpgsql') order by 1`,
    rendu: (r) => r.map((x) =>
      `create extension if not exists ${ident(x.extname)} with schema ${ident(x.nspname)};`) },

  { titre: "Tables et colonnes", sql: `
      select c.relname as tbl, a.attname as col,
             format_type(a.atttypid, a.atttypmod) as typ,
             a.attnotnull as nn, pg_get_expr(d.adbin, d.adrelid) as defaut
        from pg_attribute a
        join pg_class c on c.oid=a.attrelid
        left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
       where c.relnamespace='public'::regnamespace and c.relkind='r'
         and a.attnum>0 and not a.attisdropped
       order by c.relname, a.attnum`,
    rendu: (r) => {
      const t = new Map();
      for (const x of r) {
        if (!t.has(x.tbl)) t.set(x.tbl, []);
        t.get(x.tbl).push(`  ${ident(x.col)} ${x.typ}`
          + (x.defaut ? ` default ${x.defaut}` : "") + (x.nn ? " not null" : ""));
      }
      return [...t].map(([n, cols]) =>
        `create table if not exists public.${ident(n)} (\n${cols.join(",\n")}\n);`);
    } },

  { titre: "Clés primaires, uniques et étrangères", sql: `
      select conrelid::regclass::text as tbl, conname,
             pg_get_constraintdef(oid) as def, contype
        from pg_constraint
       where connamespace='public'::regnamespace and contype in ('p','u','f','c')
       order by case contype when 'p' then 1 when 'u' then 2 when 'c' then 3 else 4 end, 1, 2`,
    rendu: (r) => r.map((x) =>
      // `add constraint … if not exists` n'existe pas : le bloc rend l'étape
      // rejouable sans échouer sur une base déjà à jour.
      `do $$ begin\n  alter table ${x.tbl} add constraint ${ident(x.conname)} ${x.def};\n`
      + `exception when duplicate_table or duplicate_object then null; end $$;`) },

  { titre: "Index (hors ceux portés par une contrainte)", sql: `
      select pi.indexdef from pg_indexes pi
       where pi.schemaname='public'
         and not exists (select 1 from pg_constraint con
                          where con.conname=pi.indexname
                            and con.connamespace='public'::regnamespace)
       order by pi.tablename, pi.indexname`,
    rendu: (r) => r.map((x) =>
      x.indexdef.replace(/^CREATE INDEX /i, "create index if not exists ")
                .replace(/^CREATE UNIQUE INDEX /i, "create unique index if not exists ") + ";") },

  { titre: "Fonctions — source exacte, SECURITY DEFINER compris", sql: `
      select pg_get_functiondef(p.oid) as def
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prokind='f' order by p.proname`,
    // `check_function_bodies` désactivé le temps de la section : les fonctions
    // sortent par ordre alphabétique et certaines s'appellent entre elles
    // (`comment_target_visible` appelle `post_is_visible`, qui vient après).
    // Postgres valide le corps d'une fonction SQL À SA CRÉATION : sans cette
    // ligne le rejeu casse sur « function does not exist ». Mesuré au premier
    // rejeu réel sur une base vierge — c'est précisément ce que la preuve
    // devait révéler. Un tri topologique serait plus élégant et plus fragile ;
    // c'est aussi ce que fait `pg_dump`.
    rendu: (r) => ["set local check_function_bodies = off;"]
      .concat(r.map((x) => x.def.trim().replace(/;?$/, ";"))) },

  { titre: "Déclencheurs", sql: `
      select pg_get_triggerdef(t.oid) as def
        from pg_trigger t join pg_class c on c.oid=t.tgrelid
       where not t.tgisinternal and c.relnamespace='public'::regnamespace
       order by c.relname, t.tgname`,
    rendu: (r) => r.map((x) =>
      `do $$ begin\n  ${x.def};\nexception when duplicate_object then null; end $$;`) },

  { titre: "RLS activée — sans quoi les policies ci-dessous ne s'appliquent PAS", sql: `
      select relname from pg_class
       where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity
       order by relname`,
    rendu: (r) => r.map((x) => `alter table public.${ident(x.relname)} enable row level security;`) },

  { titre: "Policies RLS (public et storage) — la frontière de confiance", sql: `
      select schemaname, tablename, policyname, cmd, permissive,
             array_to_string(roles, ',') as roles, qual, with_check
        from pg_policies where schemaname in ('public','storage')
       order by schemaname, tablename, policyname`,
    rendu: (r) => r.map((x) =>
      `drop policy if exists ${ident(x.policyname)} on ${x.schemaname}.${ident(x.tablename)};\n`
      + `create policy ${ident(x.policyname)} on ${x.schemaname}.${ident(x.tablename)}\n`
      + `  as ${x.permissive === "PERMISSIVE" ? "permissive" : "restrictive"}\n`
      + `  for ${x.cmd.toLowerCase()} to ${x.roles}\n`
      + (x.qual ? `  using (${x.qual})\n` : "")
      + (x.with_check ? `  with check (${x.with_check})\n` : "").replace(/\n$/, "\n")
      + ";") },

  { titre: "Publication realtime — ce qui est diffusé en direct", sql: `
      select pubname, schemaname, tablename from pg_publication_tables
       where pubname='supabase_realtime' order by schemaname, tablename`,
    rendu: (r) => r.map((x) =>
      `do $$ begin\n  alter publication ${ident(x.pubname)} add table ${x.schemaname}.${ident(x.tablename)};\n`
      + `exception when duplicate_object then null; end $$;`) },

  { titre: "Seaux de stockage", sql: `
      select id, name, public, file_size_limit, allowed_mime_types::text as types
        from storage.buckets order by name`,
    rendu: (r) => r.map((x) =>
      `insert into storage.buckets (id, name, public, file_size_limit)\n`
      + `  values (${litt(x.id)}, ${litt(x.name)}, ${x.public}, ${x.file_size_limit === null ? "null" : x.file_size_limit})\n`
      + `  on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit;`
      + (x.types && x.types !== "null" ? `\n-- types autorisés en production : ${x.types}` : "")) },
];

const D = new Date().toISOString().slice(0, 10);
const out = [
  "-- " + "═".repeat(73),
  `-- ORIGINE DU SCHÉMA PASSIO — constatée en production le ${D}`,
  "--",
  "-- Point zéro de la chaîne de migrations. Les fichiers antérieurs de",
  "-- `migrations/` sont de l'ARCHIVE : la production n'en avait enregistré que",
  "-- 3 sur 59, le reste ayant été appliqué à la main. Ne pas les rejouer.",
  "--",
  "-- Rejouable sur une base VIDE pour obtenir la même structure qu'en prod.",
  "-- Généré par `npm run schema:origine` — ne pas éditer à la main.",
  "--",
  "-- ⚠️ CE QU'IL NE CONTIENT PAS, et qu'aucune relecture ne doit supposer :",
  "--   · aucune DONNÉE (structure seule) ;",
  "--   · les COMPTES (schéma `auth`) — ils ne sont pas dans `public` ;",
  "--   · les FICHIERS déposés dans le Storage (les seaux sont créés vides) ;",
  "--   · les secrets, réglages d'authentification et fournisseurs du projet.",
  "-- Une base semée avec ce fichier est donc structurellement identique à la",
  "-- production, et vide. Ce n'est PAS une sauvegarde.",
  "-- " + "═".repeat(73), "",
  "begin;", "",
];

let echecs = 0;
for (const e of ETAPES) {
  process.stderr.write(`… ${e.titre}\n`);
  try {
    const lignes = e.rendu(requete(e.sql));
    out.push(`-- ${"─".repeat(70)}`, `-- ${e.titre} (${lignes.length})`, `-- ${"─".repeat(70)}`);
    out.push(lignes.length ? lignes.join("\n\n") : "--   (aucun objet — vérifié, pas supposé)", "");
  } catch (err) {
    echecs++;
    // Un échec est ÉCRIT, et le fichier reste inutilisable tant qu'il subsiste :
    // une origine incomplète qu'on croirait complète est pire que pas d'origine.
    out.push(`-- ${"─".repeat(70)}`, `-- ${e.titre} — ⚠️ NON RÉCUPÉRÉ`,
      `--   ÉCHEC : ${String(err.message).split("\n")[0]}`,
      "do $$ begin raise exception 'ORIGINE INCOMPLÈTE : bloc « " + e.titre + " » non récupéré'; end $$;", "");
  }
}
out.push("commit;", "");

try { fs.unlinkSync(TMP); } catch (_) {}
fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
fs.writeFileSync(SORTIE, out.join("\n"), "utf8");
console.log(`${SORTIE} — ${ETAPES.length - echecs}/${ETAPES.length} étapes`);
if (echecs) { console.error(`${echecs} étape(s) en échec : l'origine est INCOMPLÈTE.`); process.exit(1); }
