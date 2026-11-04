#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// SCHÉMA EXÉCUTABLE DE LA PRODUCTION — le DDL qui reconstruit la structure
// sur une base VIDE, lu dans le catalogue Postgres par l'API de gestion
// (canal ③ d'ADR-012, même endpoint que `appliquer-migration.mjs`).
//
//   node scripts/schema-executable.js [sortie.sql] [--projet <ref>]
//   → défaut : .passio/sauvegardes/schema-<date>.sql (hors git : c'est une
//     PHOTOGRAPHIE, elle se régénère ; le dépôt garde le générateur)
//
// Pourquoi il existe (EXP-01, contre-revue Astra) : `SCHEMA_PROD_REFERENCE.sql`
// est une DESCRIPTION, pas un DDL — et « le schéma n'est pas reconstructible à
// partir du dépôt » était l'un des trois bloquants intacts. Rejoué sur le
// projet « PASSIO staging » le 2026-09-14, il rend une base STRUCTURELLEMENT
// IDENTIQUE à la production : 16 compteurs d'objets égaux (tables, colonnes,
// policies, triggers, fonctions, index, contraintes, RLS, vues, cron,
// realtime, seaux, privilèges de table et de colonne, EXECUTE anon et
// authenticated), mêmes avertissements `get_advisors`. Puis
// `scripts/restaurer-donnees.js` y a reversé une archive : 0 écart.
//
// ⚠️ CE QUE L'EXERCICE A APPRIS, et qu'une reconstruction « aux tables et
// aux policies » ne sait pas — chaque point ci-dessous a été VU manquer :
//   · les SÉQUENCES d'une colonne `serial` avant les tables (sans elle, le
//     `default nextval(…)` de la table échoue), puis rattachées à leur colonne
//     (OWNED BY) — mais JAMAIS une séquence d'IDENTITÉ : elle naît avec sa
//     colonne (`client_errors.id` et `migrations_appliquees.id` sont des
//     identités, pas des serial ; voir la section « Séquences ») ;
//   · les PRIVILÈGES de table ET de colonne pour `anon`/`authenticated` :
//     `events.address` et `events.contact` ne sont privés QUE par un GRANT
//     de colonnes — une base reconstruite sans eux rend l'adresse d'un
//     rendez-vous lisible sans compte ;
//   · l'EXECUTE des fonctions, PUBLIC compris : Supabase donne EXECUTE à
//     PUBLIC à la création, un `revoke … from anon` seul ne ferme rien —
//     `is_conv_member` (l'oracle du 11/09) redevenait appelable sans compte ;
//   · les VUES avec leurs options (`security_invoker`), sinon trois erreurs
//     `security_definer_view` réapparaissent ;
//   · les tâches CRON (purges de télémétrie) ;
//   · le bloc « ajouter une contrainte » doit avaler `invalid_table_definition`
//     (« multiple primary keys ») pour être rejouable, pas seulement
//     `duplicate_object` ;
//   · l'IDENTITÉ DE RÉPLICATION et les PRIVILÈGES DE SÉQUENCE (revue
//     indépendante du 2026-11-03, risque R25) : sans eux, une base
//     reconstruite remettait toute table en identité DEFAULT — la clé
//     primaire, que le temps réel publie à chaque DELETE — et rendait `rwU` à
//     anon/authenticated sur chaque séquence, alors que `--verifier` disait
//     « contenu identique ». Banc : tests/sql/schema-executable-identite.test.sh.
// Ordre d'exécution = ordre du tableau ETAPES : une fonction avant la policy
// qui l'appelle, une table avant sa clé étrangère, un index avant l'identité
// de réplication qui le désigne, PUBLIC révoqué avant les grants nominatifs.
// LECTURE SEULE sur le projet source.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);
const iRef = args.indexOf("--projet");
const REF = iRef !== -1 ? args[iRef + 1] : "njkiyoklssvefstljemx";
const SORTIE = args.find((a, i) => !a.startsWith("--") && (i === 0 || args[i - 1] !== "--projet"))
  || path.join(__dirname, "..", ".passio", "sauvegardes", `schema-${new Date().toISOString().slice(0, 10)}.sql`);

function lireJeton() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const p = path.join(os.homedir(), ".supabase", "access-token");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : null;
}

async function requete(jeton, sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const litt = (s) => `'${String(s).replace(/'/g, "''")}'`;
const SANS_EXTENSION = "p.oid not in (select objid from pg_depend where deptype='e')";

const ETAPES = [
  { titre: "Garde — aucune table partitionnée ni étrangère dans public (le DDL de reprise ne sait pas les rendre)",
    // ⚠️ Contre-revue finale de R25 (2026-11-04). La section « Tables » ne rend
    // que les tables ordinaires (relkind 'r') : un parent PARTITIONNÉ ('p') ou
    // une table ÉTRANGÈRE ('f') n'était pas rendu, et le DDL échouait plus loin —
    // contraintes, `OWNED BY` d'un serial, droits d'une séquence d'identité —,
    // à la reprise, c'est-à-dire trop tard. Le générateur REFUSE donc d'écrire un
    // DDL qu'il sait faux : la sauvegarde de la nuit le dit en rouge. Aucune en
    // production le 2026-11-04 (canal ① : 0 'p', 0 'f', 52 'r').
    sql: `select c.relname, c.relkind::text k from pg_class c
           where c.relnamespace='public'::regnamespace and c.relkind in ('p','f') order by 1`,
    rendu: (r) => {
      if (r.length) throw new Error("DDL de reprise impossible : public porte " + r.map((x) => `${x.relname} (${x.k === "p" ? "partitionnée" : "étrangère"})`).join(", ") + " — scripts/schema-executable.js ne sait pas les rendre ; l'étendre avant de compter sur la reprise.");
      return [];
    } },

  { titre: "Extensions",
    sql: `select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname not in ('plpgsql') order by 1`,
    rendu: (r) => r.map((x) => `create extension if not exists ${ident(x.extname)} with schema ${ident(x.nspname)};`) },

  { titre: "Séquences (avant les tables qui les référencent) — hors séquences d'identité",
    // ⚠️ Une séquence d'IDENTITÉ (`generated … as identity`, pg_depend
    // deptype 'i') NAÎT AVEC SA COLONNE. La créer ici d'abord, c'était prendre
    // son nom : la colonne en recevait une seconde, `<table>_<col>_seq1`, et la
    // première restait orpheline, avec les droits par défaut de Supabase. Les
    // deux séquences de la production (canal ①, 2026-11-04) sont des
    // identités : chaque reconstruction les doublait. Restent ici les
    // séquences autonomes et celles des colonnes `serial`.
    sql: `select s.sequencename, s.data_type, s.start_value, s.increment_by from pg_sequences s
           where s.schemaname='public'
             and not exists (select 1 from pg_depend d where d.classid='pg_class'::regclass and d.deptype='i'
                               and d.objid=format('%I.%I', s.schemaname, s.sequencename)::regclass)
           order by 1`,
    rendu: (r) => r.map((x) => `create sequence if not exists public.${ident(x.sequencename)} as ${x.data_type} start ${x.start_value} increment ${x.increment_by};`) },

  { titre: "Tables et colonnes",
    sql: `select c.relname as tbl, a.attname as col, format_type(a.atttypid, a.atttypmod) as typ, a.attnotnull as nn,
                 pg_get_expr(d.adbin, d.adrelid) as defaut, a.attidentity as ident, a.attgenerated as gen
            from pg_attribute a join pg_class c on c.oid=a.attrelid
            left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
           where c.relnamespace='public'::regnamespace and c.relkind='r' and a.attnum>0 and not a.attisdropped
           order by c.relname, a.attnum`,
    rendu: (r) => {
      const t = new Map();
      for (const x of r) {
        if (!t.has(x.tbl)) t.set(x.tbl, []);
        const gen = x.gen === "s" ? ` generated always as (${x.defaut}) stored`
          : x.ident ? ` generated ${x.ident === "a" ? "always" : "by default"} as identity`
          : x.defaut ? ` default ${x.defaut}` : "";
        t.get(x.tbl).push(`  ${ident(x.col)} ${x.typ}${gen}${x.nn ? " not null" : ""}`);
      }
      // ⚠️ RES-14 (21/10/2026, mesuré sur le staging) : `create table if not
      // exists` SAUTE une table déjà là, avec ses colonnes d'avant. Une cible
      // dont le schéma a dérivé (staging semé le 14/09, `notifications.origine`
      // ajoutée depuis) recevait alors la contrainte CHECK d'une colonne
      // absente, et toute la transaction tombait. Chaque colonne est donc aussi
      // reposée par `add column if not exists` : sans effet sur une base à jour.
      return [...t].map(([n, cols]) => `create table if not exists public.${ident(n)} (\n${cols.join(",\n")}\n);\n`
        + cols.map((c) => `alter table public.${ident(n)} add column if not exists ${c.trim()};`).join("\n"));
    } },

  { titre: "Séquences rattachées à leur colonne (serial : OWNED BY)",
    // Créée seule plus haut, la séquence d'un `serial` n'appartenait à rien :
    // `pg_get_serial_sequence` la disait NULL, et `restaurer-donnees.js`, qui
    // recale PAR ELLE les séquences après le chargement, la sautait — la
    // première insertion suivante repartait de 1 et percutait une clé
    // restaurée. Aucune colonne `serial` en production le 2026-11-04 ; la
    // première qui naîtra sera rendue juste.
    sql: `select s.relname seq, t.relname tbl, a.attname col
            from pg_class s
            join pg_depend d on d.classid='pg_class'::regclass and d.objid=s.oid and d.deptype='a'
                            and d.refclassid='pg_class'::regclass and d.refobjsubid>0
            join pg_class t on t.oid=d.refobjid
            join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid
           where s.relnamespace='public'::regnamespace and s.relkind='S' order by 1`,
    rendu: (r) => r.map((x) => `alter sequence public.${ident(x.seq)} owned by public.${ident(x.tbl)}.${ident(x.col)};`) },

  { titre: "Clés primaires, uniques, CHECK et étrangères",
    sql: `select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def, contype from pg_constraint
           where connamespace='public'::regnamespace and contype in ('p','u','f','c')
           order by case contype when 'p' then 1 when 'u' then 2 when 'c' then 3 else 4 end, 1, 2`,
    // `add constraint … if not exists` n'existe pas : le bloc avale les trois
    // erreurs d'une contrainte déjà là (duplicate_object, duplicate_table, et
    // invalid_table_definition pour « multiple primary keys »).
    rendu: (r) => r.map((x) => `do $$ begin\n  alter table ${x.tbl} add constraint ${ident(x.conname)} ${x.def};\nexception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;`) },

  { titre: "Index (hors ceux portés par une contrainte)",
    sql: `select pi.indexdef from pg_indexes pi where pi.schemaname='public'
             and not exists (select 1 from pg_constraint con where con.conname=pi.indexname and con.connamespace='public'::regnamespace)
           order by pi.tablename, pi.indexname`,
    rendu: (r) => r.map((x) => x.indexdef.replace(/^CREATE INDEX /i, "create index if not exists ").replace(/^CREATE UNIQUE INDEX /i, "create unique index if not exists ") + ";") },

  { titre: "Identité de réplication — ce qu'un UPDATE ou un DELETE publie au temps réel",
    // ⚠️ R25 (revue indépendante du 2026-11-03). Sans cette section, une base
    // reconstruite remettait EN SILENCE chaque table en identité DEFAULT, la
    // clé primaire : `migration_realtime_identite_opaque_2026-11-03.sql` ferme
    // la fuite par `replica identity using index <table>_rid_key` (un DELETE ne
    // publie plus que `rid`), et la reconstruction la rouvrait — conversation
    // et compte de chaque départ, publiés à tout abonné. TOUTES les tables sont
    // rendues, DEFAULT compris : sur une cible déjà semée, une identité qui a
    // dérivé revient à celle de la source (comme les privilèges : retirés puis
    // rendus). Après les index, puisque USING INDEX en désigne un.
    sql: `select c.relname tbl, c.relreplident::text ri, ic.relname idx
            from pg_class c
            left join pg_index i on i.indrelid=c.oid and i.indisreplident
            left join pg_class ic on ic.oid=i.indexrelid
           where c.relnamespace='public'::regnamespace and c.relkind='r' order by 1`,
    // 'i' sans index marqué : l'index a été supprimé, et PostgreSQL se conduit
    // alors en NOTHING (il refuse UPDATE et DELETE d'une table publiée). On
    // rend ce comportement, pas un `using index` sans nom qui ferait tomber
    // toute la transaction.
    rendu: (r) => r.map((x) => `alter table public.${ident(x.tbl)} replica identity ${
      x.ri === "f" ? "full" : x.ri === "n" ? "nothing" : x.ri === "i" ? (x.idx ? `using index ${ident(x.idx)}` : "nothing") : "default"};`) },

  { titre: "Fonctions (hors extensions) — source exacte, SECURITY DEFINER et search_path compris",
    sql: `select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prokind='f' and ${SANS_EXTENSION} order by p.proname`,
    // `check_function_bodies` coupé le temps de la section : les fonctions
    // sortent par ordre alphabétique et certaines s'appellent entre elles.
    rendu: (r) => ["set local check_function_bodies = off;"].concat(r.map((x) => x.def.trim().replace(/;?$/, ";"))) },

  { titre: "Vues (options security_invoker comprises)",
    sql: `select c.relname table_name, pg_get_viewdef(c.oid, true) def, coalesce(array_to_string(c.reloptions, ', '), '') opts
            from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v' order by 1`,
    rendu: (r) => r.map((x) => `create or replace view public.${ident(x.table_name)}${x.opts ? ` with (${x.opts})` : ""} as\n${x.def.trim()}`) },

  { titre: "Déclencheurs",
    sql: `select pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid=t.tgrelid
           where not t.tgisinternal and c.relnamespace='public'::regnamespace order by c.relname, t.tgname`,
    rendu: (r) => r.map((x) => `do $$ begin\n  ${x.def};\nexception when duplicate_object then null; end $$;`) },

  { titre: "RLS activée — sans quoi les policies ne s'appliquent PAS",
    sql: `select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity order by relname`,
    rendu: (r) => r.map((x) => `alter table public.${ident(x.relname)} enable row level security;`) },

  { titre: "Policies RLS (public, storage et realtime) — la frontière de confiance",
    sql: `select schemaname, tablename, policyname, cmd, permissive, array_to_string(roles, ',') as roles, qual, with_check
            from pg_policies where schemaname in ('public','storage','realtime') order by schemaname, tablename, policyname`,
    rendu: (r) => r.map((x) =>
      `drop policy if exists ${ident(x.policyname)} on ${x.schemaname}.${ident(x.tablename)};\n`
      + `create policy ${ident(x.policyname)} on ${x.schemaname}.${ident(x.tablename)}\n`
      + `  as ${x.permissive === "PERMISSIVE" ? "permissive" : "restrictive"}\n  for ${x.cmd.toLowerCase()} to ${x.roles}\n`
      + (x.qual ? `  using (${x.qual})\n` : "") + (x.with_check ? `  with check (${x.with_check})\n` : "") + ";") },

  { titre: "Privilèges de TABLE pour anon/authenticated — retirés puis rendus tels qu'en prod",
    sql: `select c.relname tbl, r.rolname role, string_agg(distinct g.privilege_type, ',' order by g.privilege_type) privs
            from pg_class c cross join (values ('anon'),('authenticated')) r(rolname)
            left join information_schema.role_table_grants g on g.table_schema='public' and g.table_name=c.relname and g.grantee=r.rolname
           where c.relnamespace='public'::regnamespace and c.relkind in ('r','v') group by 1,2 order by 1,2`,
    rendu: (r) => r.map((x) => `revoke all on public.${ident(x.tbl)} from ${x.role};` + (x.privs ? `\ngrant ${x.privs.toLowerCase()} on public.${ident(x.tbl)} to ${x.role};` : "")) },

  { titre: "Privilèges de COLONNE (là où la table n'est pas accordée entière)",
    sql: `select cp.table_name tbl, cp.grantee role, cp.privilege_type priv, string_agg(quote_ident(cp.column_name), ', ' order by cp.column_name) cols
            from information_schema.column_privileges cp
           where cp.table_schema='public' and cp.grantee in ('anon','authenticated')
             and not exists (select 1 from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=cp.table_name and g.grantee=cp.grantee and g.privilege_type=cp.privilege_type)
           group by 1,2,3 order by 1,2,3`,
    rendu: (r) => r.map((x) => `grant ${x.priv.toLowerCase()} (${x.cols}) on public.${ident(x.tbl)} to ${x.role};`) },

  { titre: "Privilèges de SÉQUENCE pour anon/authenticated — retirés puis rendus tels qu'en prod",
    // ⚠️ R25 : les droits par défaut de Supabase donnent `rwU` (USAGE, SELECT,
    // UPDATE) à anon et authenticated sur toute séquence NEUVE. La migration
    // R25 les retire aux séquences de `rid` (son verdict l'exige) : une base
    // reconstruite les rendait. Une séquence d'IDENTITÉ est désignée par SA
    // COLONNE (`pg_get_serial_sequence`, à l'exécution) : son nom n'est pas une
    // donnée de la source — une table renommée garde l'ancien, la cible en
    // donne un neuf. Absente de la cible, c'est une erreur : un droit qu'on
    // n'a pas su poser ne se tait pas.
    sql: `select c.relname seq, r.rolname role,
                 concat_ws(', ', case when has_sequence_privilege(r.rolname, c.oid, 'USAGE') then 'usage' end,
                                 case when has_sequence_privilege(r.rolname, c.oid, 'SELECT') then 'select' end,
                                 case when has_sequence_privilege(r.rolname, c.oid, 'UPDATE') then 'update' end) privs,
                 t.relname id_tbl, a.attname id_col
            from pg_class c cross join (values ('anon'),('authenticated')) r(rolname)
            left join pg_depend d on d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='i' and d.refclassid='pg_class'::regclass
            left join pg_class t on t.oid=d.refobjid
            left join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid
           where c.relnamespace='public'::regnamespace and c.relkind='S' order by 1, 2`,
    rendu: (r) => r.map((x) => {
      if (!x.id_tbl) return `revoke all on sequence public.${ident(x.seq)} from ${x.role};`
        + (x.privs ? `\ngrant ${x.privs} on sequence public.${ident(x.seq)} to ${x.role};` : "");
      const colonne = `public.${ident(x.id_tbl)}.${ident(x.id_col)}`;
      return `do $$ declare s text := pg_get_serial_sequence(${litt(`public.${ident(x.id_tbl)}`)}, ${litt(x.id_col)}); begin\n`
        + `  if s is null then raise exception '%', ${litt(`aucune séquence d'identité pour ${colonne} sur la cible`)}; end if;\n`
        + `  execute 'revoke all on sequence ' || s || ' from ${x.role}';\n`
        + (x.privs ? `  execute 'grant ${x.privs} on sequence ' || s || ' to ${x.role}';\n` : "")
        + "end $$;";
    }) },

  { titre: "EXECUTE sur les fonctions — PUBLIC révoqué, puis anon/authenticated tels qu'en prod",
    sql: `select p.oid::regprocedure::text sig, r.rolname role, has_function_privilege(r.rolname, p.oid, 'EXECUTE') ok
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values ('anon'),('authenticated')) r(rolname)
           where n.nspname='public' and p.prokind='f' and ${SANS_EXTENSION} order by 1,2`,
    rendu: (r) => r.map((x) => `revoke execute on function ${x.sig} from public;\n${x.ok ? "grant" : "revoke"} execute on function ${x.sig} ${x.ok ? "to" : "from"} ${x.role};`) },

  { titre: "Publication realtime — ce qui est diffusé en direct",
    sql: `select pubname, schemaname, tablename from pg_publication_tables where pubname='supabase_realtime' order by schemaname, tablename`,
    rendu: (r) => r.map((x) => `do $$ begin\n  alter publication ${ident(x.pubname)} add table ${x.schemaname}.${ident(x.tablename)};\nexception when duplicate_object then null; end $$;`) },

  { titre: "Seaux de stockage",
    sql: `select id, name, public, file_size_limit from storage.buckets order by name`,
    rendu: (r) => r.map((x) => `insert into storage.buckets (id, name, public, file_size_limit)\n  values (${litt(x.id)}, ${litt(x.name)}, ${x.public}, ${x.file_size_limit === null ? "null" : x.file_size_limit})\n  on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit;`) },

  { titre: "Tâches cron",
    sql: `select jobname, schedule, command from cron.job order by jobname`,
    rendu: (r) => r.map((x) => `do $$ begin if not exists (select 1 from cron.job where jobname=${litt(x.jobname)}) then perform cron.schedule(${litt(x.jobname)}, ${litt(x.schedule)}, ${litt(x.command)}); end if; end $$;`) },
];

async function main() {
  const jeton = lireJeton();
  if (!jeton) { console.error("aucun jeton : `supabase login` sur ce poste, ou SUPABASE_ACCESS_TOKEN."); process.exit(2); }
  const out = [
    "-- " + "═".repeat(73),
    `-- SCHÉMA EXÉCUTABLE DE ${REF} — lu dans le catalogue le ${new Date().toISOString()}`,
    "-- Généré par `node scripts/schema-executable.js` — ne pas éditer à la main.",
    "-- Structure seule : aucune donnée, aucun compte (schéma auth), aucun fichier",
    "-- du Storage, aucun réglage d'authentification ni secret du projet.",
    "-- Une transaction, rejouable sur une base vide comme sur une base déjà semée.",
    "-- " + "═".repeat(73), "", "begin;", "",
  ];
  let n = 0;
  for (const e of ETAPES) {
    const lignes = e.rendu(await requete(jeton, e.sql));
    n += lignes.length;
    out.push(`-- ${"─".repeat(70)}`, `-- ${e.titre} (${lignes.length})`, `-- ${"─".repeat(70)}`, lignes.length ? lignes.join("\n\n") : "--   (aucun objet — vérifié, pas supposé)", "");
    process.stderr.write(`… ${e.titre} : ${lignes.length}\n`);
  }
  out.push("commit;", "");
  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, out.join("\n"), "utf8");
  console.log(`${SORTIE} — ${n} instructions, ${ETAPES.length} sections`);
}

if (require.main === module) main().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
module.exports = { ETAPES };
