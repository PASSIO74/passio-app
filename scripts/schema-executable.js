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

// ⚠️ UNE PANNE PASSAGÈRE NE DOIT PAS COÛTER L'ARCHIVE DE LA NUIT (vérification
// finale de R25, 2026-11-04). Dans sauvegarde.yml, l'étape du schéma précède
// Vérifier, Chiffrer et Déposer : un seul 429 ou 5xx de l'API de gestion
// faisait échouer le générateur, donc sauter le dépôt, données comprises.
// L'API plafonne vers 60 appels par minute (429 « ThrottlerException »,
// docs/RECUPERATION.md), le générateur en fait 20, et la veille partage le
// jeton. Même politique que restaurer-donnees.js : deux reprises sur un 429
// (fenêtre suivante, 61 s), une sur un 5xx ou une panne réseau (5 s). Ce sont
// des SELECT de catalogue : les rejouer est sans effet. Tout autre refus
// (400, 401, 403…) n'est pas passager : il lève aussitôt.
// Verrou : tests/unit/schema-executable-requete.test.mjs.
const PAUSES = { trop: 61000, panne: 5000 };

async function requete(jeton, sql, {
  fetchFn = globalThis.fetch,
  attendre = (ms) => new Promise((r) => setTimeout(r, ms)),
  journal = (m) => process.stderr.write(m + "\n"),
} = {}) {
  let trop = 0, panne = 0;
  for (;;) {
    let r;
    try {
      r = await fetchFn(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method: "POST", headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
      });
    } catch (e) {
      if (panne++ < 1) { journal(`   (réseau : ${e.message} — nouvel essai dans ${PAUSES.panne / 1000} s)`); await attendre(PAUSES.panne); continue; }
      throw e;
    }
    const t = await r.text();
    if (r.ok) return JSON.parse(t);
    if (r.status === 429 && trop++ < 2) { journal(`   (429 : pause ${PAUSES.trop / 1000} s)`); await attendre(PAUSES.trop); continue; }
    if (r.status >= 500 && panne++ < 1) { journal(`   (HTTP ${r.status} : nouvel essai dans ${PAUSES.panne / 1000} s)`); await attendre(PAUSES.panne); continue; }
    throw new Error(`HTTP ${r.status} ${t.slice(0, 300)}`);
  }
}

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const litt = (s) => `'${String(s).replace(/'/g, "''")}'`;
const SANS_EXTENSION = "p.oid not in (select objid from pg_depend where deptype='e')";
// Liste fermée : les deux schémas applicatifs privés sont reconstruits, jamais
// les tables du Vault ni un schéma découvert au hasard dans le catalogue.
const SCHEMAS = ["public", "rencontres_prive", "passio_realtime_budget"];
const SCHEMAS_SQL = SCHEMAS.map(litt).join(",");
const NAMESPACES_SQL = `select oid from pg_namespace where nspname in (${SCHEMAS_SQL})`;
const ROLES_SQL = `(values ('PUBLIC', 0::oid), ('anon', (select oid from pg_roles where rolname='anon')),
  ('authenticated', (select oid from pg_roles where rolname='authenticated')),
  ('service_role', (select oid from pg_roles where rolname='service_role'))) r(rolname, oid)`;
const nomObjet = (x, cle) => `${ident(x.sch || "public")}.${ident(x[cle])}`;
const nomRole = (r) => String(r).toUpperCase() === "PUBLIC" ? "public" : ident(r);
const rendreAcl = (objet, x) => `revoke all on ${objet} from ${nomRole(x.role)};`
  + (x.privs ? `\ngrant ${x.privs.toLowerCase()} on ${objet} to ${nomRole(x.role)};` : "")
  + (x.grantables ? `\ngrant ${x.grantables.toLowerCase()} on ${objet} to ${nomRole(x.role)} with grant option;` : "");

// Le DDL porte aussi un état structuré, couvert par schema_sha256 dans l'archive.
// NULL (aucune restriction MIME) et [] (aucun type admis) restent distincts.
const MARQUEUR_SEAUX = "-- PASSIO_SEAUX_V1 ";
function metadataSeaux(document) {
  const exact = (o, cles) => o && typeof o === "object" && !Array.isArray(o)
    && Object.keys(o).sort().join(",") === [...cles].sort().join(",");
  if (!exact(document, ["version", "seaux"]) || document.version !== 1 || !Array.isArray(document.seaux)) {
    throw new Error("Métadonnées de seaux inconnues ou invalides");
  }
  const ids = new Set();
  const seaux = document.seaux.map((b) => {
    if (!exact(b, ["id", "name", "public", "file_size_limit", "allowed_mime_types"])
      || typeof b.id !== "string" || !b.id || typeof b.name !== "string" || !b.name
      || ids.has(b.id) || typeof b.public !== "boolean"
      || (b.file_size_limit !== null && (!Number.isSafeInteger(b.file_size_limit) || b.file_size_limit < 0))
      || (b.allowed_mime_types !== null && (!Array.isArray(b.allowed_mime_types)
        || b.allowed_mime_types.some((v) => typeof v !== "string" || !/^[a-z0-9!#$&^_.+-]+\/(?:[a-z0-9!#$&^_.+-]+|\*)$/i.test(v))))) {
      throw new Error("Configuration de seau invalide ou incomplète");
    }
    ids.add(b.id);
    return { id: b.id, name: b.name, public: b.public, file_size_limit: b.file_size_limit,
      allowed_mime_types: b.allowed_mime_types === null ? null : [...b.allowed_mime_types] };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return { version: 1, seaux };
}
function rendreSeaux(lignes) {
  const m = metadataSeaux({ version: 1, seaux: lignes });
  return [MARQUEUR_SEAUX + JSON.stringify(m), ...m.seaux.map((x) => {
    const mime = x.allowed_mime_types === null ? "null"
      : `array[${x.allowed_mime_types.map(litt).join(", ")}]::text[]`;
    return `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\n`
      + `  values (${litt(x.id)}, ${litt(x.name)}, ${x.public}, ${x.file_size_limit === null ? "null" : x.file_size_limit}, ${mime})\n`
      + "  on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;";
  })];
}

const ETAPES = [
  { titre: "Garde — aucune table partitionnée ni étrangère dans les schémas applicatifs (le DDL de reprise ne sait pas les rendre)",
    // ⚠️ Contre-revue finale de R25 (2026-11-04). La section « Tables » ne rend
    // que les tables ordinaires (relkind 'r') : un parent PARTITIONNÉ ('p') ou
    // une table ÉTRANGÈRE ('f') n'était pas rendu, et le DDL échouait plus loin —
    // contraintes, `OWNED BY` d'un serial, droits d'une séquence d'identité —,
    // à la reprise, c'est-à-dire trop tard. Le DDL le DIT donc, en tête : sa
    // première instruction LÈVE à l'application, en nommant la table — la reprise
    // s'arrête avant d'avoir rien posé. Le générateur n'échoue PAS : un échec
    // ici faisait sauter le chiffrement et le dépôt de la nuit, données comprises
    // (contre-revue finale) ; il signale le défaut au journal du workflow
    // (`::warning`, voir main). Aucune en production le 2026-11-04 (canal ① :
    // 0 'p', 0 'f', 52 'r').
    sql: `select c.relnamespace::regnamespace::text sch, c.relname, c.relkind::text k from pg_class c
           where c.relnamespace in (${NAMESPACES_SQL}) and c.relkind in ('p','f') order by 1,2`,
    rendu: (r) => {
      if (!r.length) return [];
      const quoi = r.map((x) => `${x.sch && x.sch !== "public" ? x.sch + "." : ""}${x.relname} (${x.k === "p" ? "partitionnée" : "étrangère"})`).join(", ");
      return [`do $$ begin raise exception '%', ${litt(`DDL de reprise INCOMPLET : ${quoi} — scripts/schema-executable.js ne sait pas les rendre. Recréer ce schéma à la main, puis restaurer les données sans l'option schéma.`)}; end $$;`];
    } },

  { titre: "Extensions",
    sql: `select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname not in ('plpgsql') order by 1`,
    rendu: (r) => r.map((x) => `create extension if not exists ${ident(x.extname)} with schema ${ident(x.nspname)};`) },

  { titre: "Schémas applicatifs — liste fermée, avant leurs tables",
    sql: `select nspname from pg_namespace where nspname in (${SCHEMAS_SQL}) order by nspname`,
    rendu: (r) => r.map((x) => `create schema if not exists ${ident(x.nspname)};`) },

  { titre: "Privilèges de SCHÉMA — PUBLIC, anon, authenticated et service_role",
    sql: `select n.nspname sch, r.rolname role,
                 string_agg(a.privilege_type, ',' order by a.privilege_type) filter (where not a.is_grantable) privs,
                 string_agg(a.privilege_type, ',' order by a.privilege_type) filter (where a.is_grantable) grantables
            from pg_namespace n cross join ${ROLES_SQL}
            left join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a on a.grantee=r.oid
           where n.nspname in (${SCHEMAS_SQL}) group by 1,2 order by 1,2`,
    rendu: (r) => r.map((x) => rendreAcl(`schema ${ident(x.sch)}`, x)) },

  { titre: "Séquences (avant les tables qui les référencent) — hors séquences d'identité",
    // ⚠️ Une séquence d'IDENTITÉ (`generated … as identity`, pg_depend
    // deptype 'i') NAÎT AVEC SA COLONNE. La créer ici d'abord, c'était prendre
    // son nom : la colonne en recevait une seconde, `<table>_<col>_seq1`, et la
    // première restait orpheline, avec les droits par défaut de Supabase. Les
    // deux séquences de la production (canal ①, 2026-11-04) sont des
    // identités : chaque reconstruction les doublait. Restent ici les
    // séquences autonomes et celles des colonnes `serial`.
    sql: `select s.schemaname sch, s.sequencename, s.data_type, s.start_value, s.increment_by from pg_sequences s
           where s.schemaname in (${SCHEMAS_SQL})
             and not exists (select 1 from pg_depend d where d.classid='pg_class'::regclass and d.deptype='i'
                               and d.objid=format('%I.%I', s.schemaname, s.sequencename)::regclass)
           order by 1,2`,
    rendu: (r) => r.map((x) => `create sequence if not exists ${nomObjet(x, "sequencename")} as ${x.data_type} start ${x.start_value} increment ${x.increment_by};`) },

  { titre: "Tables et colonnes",
    sql: `select c.relnamespace::regnamespace::text sch, c.relname as tbl, a.attname as col, format_type(a.atttypid, a.atttypmod) as typ, a.attnotnull as nn,
                 pg_get_expr(d.adbin, d.adrelid) as defaut, a.attidentity as ident, a.attgenerated as gen
            from pg_attribute a join pg_class c on c.oid=a.attrelid
            left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
           where c.relnamespace in (${NAMESPACES_SQL}) and c.relkind='r' and a.attnum>0 and not a.attisdropped
           order by c.relnamespace::regnamespace::text, c.relname, a.attnum`,
    rendu: (r) => {
      const t = new Map();
      for (const x of r) {
        const nom = nomObjet(x, "tbl");
        if (!t.has(nom)) t.set(nom, []);
        const gen = x.gen === "s" ? ` generated always as (${x.defaut}) stored`
          : x.ident ? ` generated ${x.ident === "a" ? "always" : "by default"} as identity`
          : x.defaut ? ` default ${x.defaut}` : "";
        t.get(nom).push(`  ${ident(x.col)} ${x.typ}${gen}${x.nn ? " not null" : ""}`);
      }
      // ⚠️ RES-14 (21/10/2026, mesuré sur le staging) : `create table if not
      // exists` SAUTE une table déjà là, avec ses colonnes d'avant. Une cible
      // dont le schéma a dérivé (staging semé le 14/09, `notifications.origine`
      // ajoutée depuis) recevait alors la contrainte CHECK d'une colonne
      // absente, et toute la transaction tombait. Chaque colonne est donc aussi
      // reposée par `add column if not exists` : sans effet sur une base à jour.
      return [...t].map(([n, cols]) => `create table if not exists ${n} (\n${cols.join(",\n")}\n);\n`
        + cols.map((c) => `alter table ${n} add column if not exists ${c.trim()};`).join("\n"));
    } },

  { titre: "Séquences rattachées à leur colonne (serial : OWNED BY)",
    // Créée seule plus haut, la séquence d'un `serial` n'appartenait à rien :
    // `pg_get_serial_sequence` la disait NULL, et `restaurer-donnees.js`, qui
    // recale PAR ELLE les séquences après le chargement, la sautait — la
    // première insertion suivante repartait de 1 et percutait une clé
    // restaurée. Aucune colonne `serial` en production le 2026-11-04 ; la
    // première qui naîtra sera rendue juste.
    sql: `select s.relnamespace::regnamespace::text sch, s.relname seq, t.relnamespace::regnamespace::text table_schema, t.relname tbl, a.attname col
            from pg_class s
            join pg_depend d on d.classid='pg_class'::regclass and d.objid=s.oid and d.deptype='a'
                            and d.refclassid='pg_class'::regclass and d.refobjsubid>0
            join pg_class t on t.oid=d.refobjid
            join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid
           where s.relnamespace in (${NAMESPACES_SQL}) and s.relkind='S' order by 1,2`,
    rendu: (r) => r.map((x) => `alter sequence ${nomObjet(x, "seq")} owned by ${ident(x.table_schema || "public")}.${ident(x.tbl)}.${ident(x.col)};`) },

  { titre: "Clés primaires, uniques, CHECK et étrangères",
    sql: `select format('%I.%I', n.nspname, c.relname) as tbl, con.conname, pg_get_constraintdef(con.oid) as def, con.contype,
                 con.confrelid::regclass::text ref_nom,
                 case when con.contype='f' then format('%I.%I', rn.nspname, rc.relname) end ref_qualifie
            from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
            left join pg_class rc on rc.oid=con.confrelid left join pg_namespace rn on rn.oid=rc.relnamespace
           where con.connamespace in (${NAMESPACES_SQL}) and con.contype in ('p','u','f','c')
           order by case contype when 'p' then 1 when 'u' then 2 when 'c' then 3 else 4 end, 1, 2`,
    // `add constraint … if not exists` n'existe pas : le bloc avale les trois
    // erreurs d'une contrainte déjà là (duplicate_object, duplicate_table, et
    // invalid_table_definition pour « multiple primary keys »).
    rendu: (r) => r.map((x) => {
      const definition = x.contype === "f" ? x.def.replace("REFERENCES " + x.ref_nom, "REFERENCES " + x.ref_qualifie) : x.def;
      return `do $$ begin\n  alter table ${x.tbl} add constraint ${ident(x.conname)} ${definition};\nexception when duplicate_table or duplicate_object or invalid_table_definition then null; end $$;`;
    }) },

  { titre: "Index (hors ceux portés par une contrainte)",
    sql: `select pi.indexdef from pg_indexes pi where pi.schemaname in (${SCHEMAS_SQL})
             and not exists (select 1 from pg_constraint con where con.conname=pi.indexname and con.connamespace=to_regnamespace(pi.schemaname))
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
    sql: `select c.relnamespace::regnamespace::text sch, c.relname tbl, c.relreplident::text ri, ic.relname idx
            from pg_class c
            left join pg_index i on i.indrelid=c.oid and i.indisreplident
            left join pg_class ic on ic.oid=i.indexrelid
           where c.relnamespace in (${NAMESPACES_SQL}) and c.relkind='r' order by 1,2`,
    // 'i' sans index marqué : l'index a été supprimé, et PostgreSQL se conduit
    // alors en NOTHING (il refuse UPDATE et DELETE d'une table publiée). On
    // rend ce comportement, pas un `using index` sans nom qui ferait tomber
    // toute la transaction.
    rendu: (r) => r.map((x) => `alter table ${nomObjet(x, "tbl")} replica identity ${
      x.ri === "f" ? "full" : x.ri === "n" ? "nothing" : x.ri === "i" ? (x.idx ? `using index ${ident(x.idx)}` : "nothing") : "default"};`) },

  { titre: "Fonctions (hors extensions) — source exacte, SECURITY DEFINER et search_path compris",
    sql: `select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname in (${SCHEMAS_SQL}) and p.prokind='f' and ${SANS_EXTENSION} order by n.nspname, p.proname`,
    // `check_function_bodies` coupé le temps de la section : les fonctions
    // sortent par ordre alphabétique et certaines s'appellent entre elles.
    rendu: (r) => ["set local check_function_bodies = off;"].concat(r.map((x) => x.def.trim().replace(/;?$/, ";"))) },

  { titre: "Vues (options security_invoker comprises)",
    sql: `select c.relnamespace::regnamespace::text sch, c.relname table_name, pg_get_viewdef(c.oid, true) def, coalesce(array_to_string(c.reloptions, ', '), '') opts
            from pg_class c where c.relnamespace in (${NAMESPACES_SQL}) and c.relkind='v' order by 1,2`,
    rendu: (r) => r.map((x) => `create or replace view ${nomObjet(x, "table_name")}${x.opts ? ` with (${x.opts})` : ""} as\n${x.def.trim()}`) },

  { titre: "Déclencheurs",
    sql: `select pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid=t.tgrelid
           where not t.tgisinternal and c.relnamespace in (${NAMESPACES_SQL}) order by c.relnamespace::regnamespace::text, c.relname, t.tgname`,
    rendu: (r) => r.map((x) => `do $$ begin\n  ${x.def};\nexception when duplicate_object then null; end $$;`) },

  { titre: "RLS activée — sans quoi les policies ne s'appliquent PAS",
    sql: `select relnamespace::regnamespace::text sch, relname, relrowsecurity rls, relforcerowsecurity force
            from pg_class where relnamespace in (${NAMESPACES_SQL}) and relkind='r' order by 1,2`,
    rendu: (r) => r.map((x) => `alter table ${nomObjet(x, "relname")} ${x.rls ? "enable" : "disable"} row level security;\n`
      + `alter table ${nomObjet(x, "relname")} ${x.force ? "force" : "no force"} row level security;`) },

  { titre: "Policies RLS (public, storage et realtime) — la frontière de confiance",
    sql: `select schemaname, tablename, policyname, cmd, permissive, array_to_string(roles, ',') as roles, qual, with_check
            from pg_policies where schemaname in (${SCHEMAS_SQL},'storage','realtime') order by schemaname, tablename, policyname`,
    rendu: (r) => r.map((x) =>
      `drop policy if exists ${ident(x.policyname)} on ${ident(x.schemaname)}.${ident(x.tablename)};\n`
      + `create policy ${ident(x.policyname)} on ${ident(x.schemaname)}.${ident(x.tablename)}\n`
      + `  as ${x.permissive === "PERMISSIVE" ? "permissive" : "restrictive"}\n  for ${x.cmd.toLowerCase()} to ${x.roles}\n`
      + (x.qual ? `  using (${x.qual})\n` : "") + (x.with_check ? `  with check (${x.with_check})\n` : "") + ";") },

  { titre: "Privilèges de TABLE — PUBLIC, anon, authenticated et service_role",
    sql: `select c.relnamespace::regnamespace::text sch, c.relname tbl, r.rolname role,
                 string_agg(a.privilege_type, ',' order by a.privilege_type) filter (where not a.is_grantable) privs,
                 string_agg(a.privilege_type, ',' order by a.privilege_type) filter (where a.is_grantable) grantables
            from pg_class c cross join ${ROLES_SQL}
            left join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a on a.grantee=r.oid
           where c.relnamespace in (${NAMESPACES_SQL}) and c.relkind in ('r','v') group by 1,2,3 order by 1,2,3`,
    rendu: (r) => r.map((x) => rendreAcl(nomObjet(x, "tbl"), x)) },

  { titre: "Privilèges de COLONNE — reset explicite, y compris une cible qui a dérivé",
    // REVOKE sur la table ne retire pas les droits accordés à ses colonnes.
    // Lire aussi les colonnes sans ACL pour pouvoir fermer une dérive de cible.
    sql: `select c.relnamespace::regnamespace::text sch, c.relname tbl, a.attname col, r.rolname role,
                 coalesce(jsonb_agg(jsonb_build_object('priv', g.privilege_type, 'grantable', g.is_grantable)
                   order by g.privilege_type) filter (where g.privilege_type is not null), '[]'::jsonb) grants
            from pg_class c join pg_attribute a on a.attrelid=c.oid
            cross join ${ROLES_SQL}
            left join lateral aclexplode(a.attacl) g on g.grantee=r.oid
           where c.relnamespace in (${NAMESPACES_SQL}) and c.relkind in ('r','v')
             and a.attnum>0 and not a.attisdropped group by 1,2,3,4 order by 1,2,4,3`,
    rendu: (r) => {
      const groupes = new Map();
      for (const x of r) {
        const cle = JSON.stringify([x.sch, x.tbl, x.role]);
        if (!groupes.has(cle)) groupes.set(cle, { x, cols: [], grants: new Map() });
        const g = groupes.get(cle); g.cols.push(ident(x.col));
        for (const p of x.grants) {
          const cleGrant = JSON.stringify([p.priv, p.grantable]);
          if (!g.grants.has(cleGrant)) g.grants.set(cleGrant, { p, cols: [] });
          g.grants.get(cleGrant).cols.push(ident(x.col));
        }
      }
      return [...groupes.values()].map(({ x, cols, grants }) =>
        `revoke all (${cols.join(", ")}) on ${nomObjet(x, "tbl")} from ${nomRole(x.role)};`
        + [...grants.values()].map((g) => `\ngrant ${g.p.priv.toLowerCase()} (${g.cols.join(", ")}) on ${nomObjet(x, "tbl")} to ${nomRole(x.role)}${g.p.grantable ? " with grant option" : ""};`).join(""));
    } },

  { titre: "Privilèges de SÉQUENCE pour anon/authenticated — retirés puis rendus tels qu'en prod",
    // ⚠️ R25 : les droits par défaut de Supabase donnent `rwU` (USAGE, SELECT,
    // UPDATE) à anon et authenticated sur toute séquence NEUVE. La PREMIÈRE
    // version de R25 (rid d'identité séquentielle, jamais appliquée) les
    // retirait aux séquences de `rid` ; la version appliquée n'a plus aucune
    // séquence. Mais tout droit de séquence RESSERRÉ revenait en silence avec
    // une base reconstruite. Une séquence d'IDENTITÉ est désignée par SA
    // COLONNE (`pg_get_serial_sequence`, à l'exécution) : son nom n'est pas une
    // donnée de la source — une table renommée garde l'ancien, la cible en
    // donne un neuf. Absente de la cible, c'est une erreur : un droit qu'on
    // n'a pas su poser ne se tait pas.
    sql: `select c.relnamespace::regnamespace::text sch, c.relname seq, r.rolname role,
                 string_agg(g.privilege_type, ',' order by g.privilege_type) filter (where not g.is_grantable) privs,
                 string_agg(g.privilege_type, ',' order by g.privilege_type) filter (where g.is_grantable) grantables,
                 t.relnamespace::regnamespace::text table_schema, t.relname id_tbl, a.attname id_col
            from pg_class c cross join ${ROLES_SQL}
            left join pg_depend d on d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='i' and d.refclassid='pg_class'::regclass
            left join pg_class t on t.oid=d.refobjid
            left join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid
            left join lateral aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) g on g.grantee=r.oid
           where c.relnamespace in (${NAMESPACES_SQL}) and c.relkind='S' group by 1,2,3,6,7,8 order by 1,2,3`,
    rendu: (r) => r.map((x) => {
      if (!x.id_tbl) return rendreAcl(`sequence ${nomObjet(x, "seq")}`, x);
      const table = `${ident(x.table_schema || "public")}.${ident(x.id_tbl)}`;
      const colonne = `${table}.${ident(x.id_col)}`;
      return `do $$ declare s text := pg_get_serial_sequence(${litt(table)}, ${litt(x.id_col)}); begin\n`
        + `  if s is null then raise exception '%', ${litt(`aucune séquence d'identité pour ${colonne} sur la cible`)}; end if;\n`
        + `  execute 'revoke all on sequence ' || s || ' from ${nomRole(x.role)}';\n`
        + (x.privs ? `  execute 'grant ${x.privs.toLowerCase()} on sequence ' || s || ' to ${nomRole(x.role)}';\n` : "")
        + (x.grantables ? `  execute 'grant ${x.grantables.toLowerCase()} on sequence ' || s || ' to ${nomRole(x.role)} with grant option';\n` : "")
        + "end $$;";
    }) },

  { titre: "EXECUTE sur les fonctions — ACL PUBLIC et trois rôles préservées",
    sql: `select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) sig, r.rolname role,
                 string_agg(a.privilege_type, ',' order by a.privilege_type) filter (where not a.is_grantable) privs,
                 string_agg(a.privilege_type, ',' order by a.privilege_type) filter (where a.is_grantable) grantables
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join ${ROLES_SQL}
            left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on a.grantee=r.oid
           where n.nspname in (${SCHEMAS_SQL}) and p.prokind='f' and ${SANS_EXTENSION} group by 1,2 order by 1,2`,
    rendu: (r) => r.map((x) => rendreAcl(`function ${x.sig}`, x)) },

  { titre: "Publication realtime — ce qui est diffusé en direct",
    sql: `select pubname, schemaname, tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname in (${SCHEMAS_SQL}) order by schemaname, tablename`,
    rendu: (r) => r.map((x) => `do $$ begin\n  alter publication ${ident(x.pubname)} add table ${x.schemaname}.${ident(x.tablename)};\nexception when duplicate_object then null; end $$;`) },

  { titre: "Seaux de stockage",
    sql: `select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by name`,
    rendu: rendreSeaux },

  { titre: "Tâches cron — une tâche qui APPELLE un projet n'est recopiée que sur lui",
    sql: `select jobname, schedule, command from cron.job order by jobname`,
    rendu: (r) => r.map(rendreTacheCron) },
];

// Une tâche cron qui appelle un projet Supabase (`https://<ref>.supabase.co`,
// par pg_net) n'est recopiée que sur CE projet, déclaré par `passio.projet`
// (`select set_config('passio.projet', '<ref>', true);` en tête de la
// transaction). Sans cette garde, la restauration du 2026-10-21 (RES-14) a
// installé sur le staging la veille du pilotage AVEC l'URL de la production :
// deux veilles par tick pendant seize jours, un rappel d'activité envoyé deux
// fois au même compte (mesuré le 2026-11-06). Une reprise vers un autre projet
// la SAUTE et le dit (notice) : la recréer avec l'URL de la cible est un geste
// délibéré. Les autres tâches (purges en SQL) sont recopiées comme avant.
const RE_PROJET_APPELE = /https:\/\/([a-z0-9]{20})\.supabase\.co/g;
function projetsAppeles(commande) {
  return [...new Set([...String(commande || "").matchAll(RE_PROJET_APPELE)].map((m) => m[1]))];
}
function rendreTacheCron(x) {
  const deja = `exists (select 1 from cron.job where jobname=${litt(x.jobname)})`;
  const planifier = `perform cron.schedule(${litt(x.jobname)}, ${litt(x.schedule)}, ${litt(x.command)});`;
  const refs = projetsAppeles(x.command);
  if (!refs.length) return `do $cron$ begin if not ${deja} then ${planifier} end if; end $cron$;`;
  const ici = "coalesce(current_setting('passio.projet', true), '')";
  const surCeProjet = refs.map((ref) => `${ici} = ${litt(ref)}`).join(" and ");
  const avis = litt(`tâche cron ${x.jobname} NON recopiée : elle appelle le projet ${refs.join(" et ")}, et ce projet se déclare « % » (passio.projet). La recréer avec l'URL de la cible.`);
  return `do $cron$ begin if not (${surCeProjet}) then raise notice ${avis}, ${ici}; elsif not ${deja} then ${planifier} end if; end $cron$;`;
}

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
    // La garde a parlé : le DDL lèvera à la reprise. Le dire au journal du workflow
    // (annotation GitHub), sans faire échouer la sauvegarde des données.
    if (e === ETAPES[0] && lignes.length) console.log(`::warning title=DDL de reprise incomplet::${lignes[0].replace(/\s+/g, " ").slice(0, 400)}`);
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
module.exports = { ETAPES, requete, PAUSES, projetsAppeles, rendreTacheCron, MARQUEUR_SEAUX, metadataSeaux };
