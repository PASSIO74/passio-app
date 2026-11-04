#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_passion_requests_recursion_2026-11-04.sql
# (42P17 « infinite recursion detected in policy for relation passion_requests »)
# Version 2, après la contre-revue du 2026-11-04 (sécurité, exactitude, valeur
# du banc : SEC-01/02/04, EXP-01/03, VB-01 à VB-10).
#
# PostgreSQL jetable, socle = la PRODUCTION du 2026-11-04 : `passion_requests`
# (colonnes, contraintes, index, droits de table), ses deux policies, ses deux
# déclencheurs, et ce qu'ils appellent — `passion_request_auto_creer`,
# `creer_passion` (deux formes), `passion_plier`, `unaccent_immutable`,
# `user_passions` et sa synchronisation vers `profiles`, la barrière de
# suppression — recopiés de pg_get_functiondef (canal ①) et contrôlés par
# empreinte (md5 du corps, fins de ligne normalisées : la production porte des
# CRLF, fichiers appliqués depuis un poste Windows). La WITH CHECK de production
# est posée PAR LE RETOUR ARRIÈRE de la migration : le socle EST la production
# (empreinte du déparsage, md5 b820957d…), et le retour arrière la rend à
# l'octet près.
#
# LES RÔLES DE LA PRODUCTION (EXP-03) : l'amorçage est `supabase_admin`, et
# `postgres` — qui bâtit le socle et applique la migration — n'est PAS
# superutilisateur : BYPASSRLS, membre d'anon, authenticated et service_role
# (ADMIN, INHERIT, SET), search_path « "$user", public, extensions » (pg_roles,
# pg_auth_members, pg_db_role_setting, 2026-11-04). La migration est appliquée
# par `psql -f` (instruction par instruction), ET en UNE requête simple
# (`psql -c`, la forme de l'API de gestion et de l'éditeur SQL), en LF et en CRLF.
#
# On MESURE D'ABORD le défaut : la requête même de PostgREST — sa forme est
# attestée par un témoin externe, `pg_stat_statements` de production (md5
# daa27ef6…, 785 caractères), que le banc retrouve —, préparée sous
# `authenticated` comme sous `anon`, lève 42P17 au PARSE ; puis la correction
# naïve (policy SELECT rendue à `auth.uid()` nu) : plus de 42P17, mais aucune
# demande conforme ne passe, un oracle de suppression rouvre, et `created_at`
# du client vide la limite. Le verdict de la migration, RÉINJECTÉ sur la
# production, rougit ; et le garde-fou du catalogue y REFUSE la migration.
# Puis on applique, on rejoue, on éprouve le comportement sous les vrais rôles
# (concurrence, connexion restée ouverte, fenêtre de 24 h, doublons, visiteur
# avec une creer_passion qui dériverait), l'absence de trace du décor, le
# garde-fou fermé sur échec (dérives du catalogue : rien n'est appliqué, la base
# reste celle d'avant), le retour arrière (empreintes ET défaut revenu), et des
# mutations de comportement — l'empreinte de la garde recalculée, comme le
# ferait un développeur : le garde-fou REFUSE chacune en nommant EXACTEMENT les
# lignes qui la visent ; sans lui, le tableau ne rougit que celles-là (vecteur
# des 23 lignes, O = OK, E = ECHEC) et le banc voit la garde mutée à l'œuvre.
# Une seule mutation échappe au verdict, et le banc le dit : le verrou retiré
# (une session seule ne voit pas une course) — la concurrence du § ③ l'attrape.
#
# CE QUE CE BANC NE PROUVE PAS, dit tel quel (VB-08, EXP-03) :
#   · la production est en PostgreSQL 17.6 ; ce banc tourne sur la version
#     installée (16 ici, aucun binaire 17 sur le poste) — l'équivalence est
#     analytique (réécrivain, ordre des déclencheurs, WITH CHECK après les
#     BEFORE, droits) ; les droits se comparent HORS MAINTAIN (propre à la 17) ;
#   · `profiles` n'y a pas ses déclencheurs de production (trg_propager_identite,
#     zz_barriere_suppression) : le verdict n'écrit dans aucune ligne de profiles ;
#   · aucun PostgREST : la correspondance SQLSTATE → HTTP (401 pour anon) vient
#     d'une mesure de production consignée dans js/app-02-state-utils.js ;
#   · le rôle et le search_path exacts de la session de l'API de gestion sont
#     ceux des précédents appliqués par le même outil, pas une mesure.
#
#   bash tests/sql/migration-passion-requests-recursion.test.sh
#
# Prérequis : PostgreSQL 16+ (binaires serveur, pg_stat_statements), python3.
# Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_passion_requests_recursion_2026-11-04.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v python3 >/dev/null || { echo "❌ python3 introuvable (mutations du banc)"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

# ── Empreintes mesurées en production le 2026-11-04 (canal ①) ──────────────
# Policies : md5 de pg_get_expr, search_path « "$user", public ».
MD5_WC_INSERT_PROD=b820957dd9d3a9a0fd6afa2128f1a71a
MD5_QUAL_SELECT_PROD=100a0f66aba7ecd4089717fbbdb9fefd
# Fonctions : md5(prosrc), CRLF → LF.
declare -A MD5_PROD=(
  ["auth.uid()"]=cdef18c69c4f4cbbced2eaf81e628b49
  ["public.suppression_de_mon_compte()"]=60aa519cc72bc4ebfd95d7f7bea17553
  ["public.refuser_ecriture_compte_en_suppression()"]=8ea40f715280c2867524dab576ab32b8
  ["public.unaccent_immutable(text)"]=53459bf193d871ebce6ffdd86e3acbe5
  ["public.passion_plier(text)"]=2fa9a319ffd002fc0338e0e708cf54cb
  ["public.passions_recherche_calculer(text,text[])"]=fce1a82b41673f0477dd8611fd0fa14f
  ["public.trg_passions_recherche()"]=4f0d3e81ad6a713050177433e6902b58
  ["public.sync_profil_passions(text)"]=b3c822a81ba072085787a27aea1177cf
  ["public.trg_sync_profil_passions()"]=5809fafac37c44cd086e5a53b7bc04ec
  ["public.creer_passion(text,text,text[])"]=88975eeaf66297bdfd51b7d4cf14fc49
  ["public.creer_passion(text,text)"]=a6882163774c79b1121277f48cac9980
  ["public.passion_request_auto_creer()"]=b6649fc280c14d20c28880edcada2604
)
# Témoin externe de la forme de la requête (VB-09) : `extensions.pg_stat_statements`
# de production ne connaît qu'UNE forme d'INSERT PostgREST sur passion_requests —
# constantes normalisées, 785 caractères, md5 ci-dessous (2 appels, rôle authenticated).
MD5_PGSS_PROD=daa27ef69523d836d159fd50b234d9d2
LONGUEUR_PGSS_PROD=785

# La requête même de PostgREST, relevée dans postgres_logs (162 fois en 24 h,
# une seule forme) : `supa.from("passion_requests").insert({...})`.
PGRST="$(cat <<'SQL'
WITH pgrst_source AS (INSERT INTO "public"."passion_requests"("label", "normalized_label", "status", "user_id") SELECT "pgrst_body"."label", "pgrst_body"."normalized_label", "pgrst_body"."status", "pgrst_body"."user_id" FROM (SELECT $1 AS json_data) pgrst_payload, LATERAL (SELECT "label", "normalized_label", "status", "user_id" FROM json_to_record(pgrst_payload.json_data) AS _("label" text, "normalized_label" text, "status" text, "user_id" text) ) pgrst_body  RETURNING 1) SELECT '' AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, array[]::text[] AS header, ''::text AS body, nullif(current_setting('response.headers', true), '') AS response_headers, nullif(current_setting('response.status', true), '') AS response_status, '' AS response_inserted FROM (SELECT * FROM pgrst_source) _postgrest_t
SQL
)"

PORT=$(( 6580 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"
  SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"
  SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"; }
trap nettoyer EXIT

# pg_stat_statements se charge au démarrage (témoin externe) ; s'il manque, le
# serveur démarre sans lui et le témoin le DIT (❌), le reste du banc tourne.
PRECHARGE=""
[ -f "$PGBIN/../lib/pg_stat_statements.so" ] && PRECHARGE="-c shared_preload_libraries=pg_stat_statements"
lancer "initdb -D '$BASE/data' -A trust -U supabase_admin" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses= $PRECHARGE\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do
  psql -h "$BASE" -p "$PORT" -U supabase_admin -d postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }
  sleep 0.5
done
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

DB=demandes
SQLDIR="$BASE/sql"; mkdir -p "$SQLDIR"; chmod 755 "$SQLDIR"

# ── Les helpers. Une sortie de psql n'est un succès que si psql l'a dit (VB-07) ──
QA()   { psql -h "$BASE" -p "$PORT" -U supabase_admin -d "$1" -X -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
QD()   { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
Q()    { QD "$DB" "$1"; }
# Le préambule d'une identité CLIENTE (PostgREST : set local role, puis les claims du jeton).
PRE() {
  case "$1" in
    anon)          printf '%s' "set local role anon; set local request.jwt.claims = '{\"role\": \"anon\"}';" ;;
    service_role)  printf '%s' "set local role service_role; set local request.jwt.claims = '{\"role\": \"service_role\"}';" ;;
    authenticated) printf '%s' "set local role authenticated; set local request.jwt.claim.sub = '$2'; set local request.jwt.claims = '{\"sub\": \"$2\", \"role\": \"authenticated\"}';" ;;
    *)             printf '%s' "do \$\$ begin raise exception 'rôle inconnu du banc : $1'; end \$\$;" ;;
  esac
}
# Exécute du SQL sous une identité CLIENTE. Rend « OK », « <SQLSTATE> <message> »
# de la première erreur, ou « ECHEC_PSQL … » : connexion impossible, FATAL, ou
# sortie non nulle sans ERROR — jamais « OK » sans que psql ait réussi.
SOUS() {  # $1 base, $2 rôle (authenticated | anon | service_role), $3 sub, $4 SQL
  local sortie code=0
  sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -q -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "$(PRE "$2" "$3") $4" 2>&1)" || code=$?
  if printf '%s\n' "$sortie" | grep -q '^ERROR:'; then
    printf '%s\n' "$sortie" | grep -m1 '^ERROR:' | sed -E 's/^ERROR: +([0-9A-Z]{5}): /\1 /'
  elif [ "$code" -ne 0 ] || printf '%s\n' "$sortie" | grep -qE '(^|: )(FATAL|PANIC):|psql: error'; then
    printf 'ECHEC_PSQL (sortie %s) %s\n' "$code" "$(printf '%s' "$sortie" | head -1)"
  else
    echo OK
  fi
}
# Une LECTURE sous authenticated : sa sortie, ou « ECHEC_PSQL … ».
LIT() {  # $1 base, $2 sub, $3 SQL
  local sortie code=0
  sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -q -v ON_ERROR_STOP=1 -c "$(PRE authenticated "$2") $3" 2>&1)" || code=$?
  if [ "$code" -ne 0 ] || printf '%s\n' "$sortie" | grep -qE '^(ERROR|FATAL|PANIC):|psql: error'; then
    printf 'ECHEC_PSQL (sortie %s) %s\n' "$code" "$(printf '%s' "$sortie" | head -1)"
  else
    printf '%s\n' "$sortie"
  fi
}
# Une demande par la requête de PostgREST, PRÉPARÉE puis exécutée (le défaut vit au PARSE).
DEPOT() {  # $1 base, $2 rôle, $3 sub, $4 libellé, $5 user_id, [$6 statut]
  local n
  n="$(QD "$1" "select public.passion_plier('$4');")" || { printf 'ECHEC_PSQL (pli) %s\n' "$(printf '%s' "$n" | head -1)"; return 0; }
  SOUS "$1" "$2" "$3" "prepare pgrst(json) as $PGRST; execute pgrst('{\"label\": \"$4\", \"normalized_label\": \"$n\", \"status\": \"${6:-pending}\", \"user_id\": \"$5\"}');"
}
# Applique un fichier (migration, mutation) à une base, instruction par instruction
# (psql -f) : rend le tableau de verdict, une ligne « contrôle§valeur » par contrôle,
# ou l'erreur qui a tout arrêté (VERBOSITY verbose : son SQLSTATE).
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -F '§' -q -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -f "$2" 2>&1; }
# …ou en UNE requête simple, la forme de l'API de gestion et de l'éditeur SQL.
APPLIQUER_REQUETE() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -F '§' -q -v VERBOSITY=verbose -c "$(cat "$2")" 2>&1; }
compte_verdict() { printf '%s/%s' "$(printf '%s\n' "$1" | grep -c '§OK$' || true)" "$(printf '%s\n' "$1" | grep -c '§ECHEC' || true)"; }
# Le vecteur des lignes du verdict, dans l'ordre : O = OK, E = ECHEC.
vecteur() { printf '%s\n' "$1" | grep '§' | awk -F'§' '{ v = $NF; if (v ~ /^OK$/) printf "O"; else if (v ~ /^ECHEC/) printf "E"; else printf "?" }'; }
# La valeur de la ligne n° $2 du verdict.
ligne() { printf '%s\n' "$1" | grep '§' | sed -n "${2}p" | awk -F'§' '{ print $NF }'; }
# Une migration REFUSÉE par son garde-fou : « REFUSEE <SQLSTATE> lignes <n,…> », sinon « APPLIQUEE ».
REFUS() {
  local e
  e="$(printf '%s\n' "$1" | grep -m1 'ERROR: ' || true)"
  if [ -z "$e" ]; then echo APPLIQUEE; return 0; fi
  printf 'REFUSEE %s lignes %s\n' "$(printf '%s' "$e" | grep -oE 'ERROR: +[0-9A-Z]{5}' | grep -oE '[0-9A-Z]{5}$' || echo '?')" \
    "$(printf '%s' "$e" | grep -oE 'Lignes en échec : [0-9,]+' | grep -oE '[0-9,]+$' || echo '-')"
}
# Le retour arrière de la migration (les lignes « --| »).
RETOUR_ARRIERE() { sed -n -e 's/^--| //p' -e 's/^--|$//p' "$MIGRATION"; }
MD5_FONCTION() { QD "${2:-$DB}" "select coalesce((select md5(replace(prosrc, chr(13) || chr(10), chr(10))) from pg_proc where oid = to_regprocedure('$1')), '-');"; }
MD5_POLICY() {  # $1 nom, [$2 base] — md5 du déparsage de la WITH CHECK (insert) ou du USING (select)
  QD "${2:-$DB}" "select md5(coalesce(pg_get_expr(polwithcheck, polrelid), pg_get_expr(polqual, polrelid))) from pg_policy where polrelid = 'public.passion_requests'::regclass and polname = '$1';"
}
# Droits de table, hors MAINTAIN (droit propre à PostgreSQL 17 : la production le porte, le banc 16 non).
DROITS_TABLE() { QD "${1:-$DB}" "select string_agg(a.grantee::regrole::text || ':' || a.privilege_type || ':' || a.is_grantable::text, ',' order by a.grantee::regrole::text, a.privilege_type)
                                  from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid = 'public.passion_requests'::regclass and a.privilege_type <> 'MAINTAIN';"; }
DECLENCHEURS() { QD "${1:-$DB}" "select string_agg(tgname::text || ':' || tgtype::text || ':' || tgenabled::text, ',' order by tgname collate \"C\") from pg_trigger where tgrelid = 'public.passion_requests'::regclass and not tgisinternal;"; }
# L'état de la base vis-à-vis du correctif : « <md5 WITH CHECK d'insert>|<garde(s)>|<md5 de la fonction de garde> ».
ETAT() { printf '%s|%s|%s' "$(MD5_POLICY passion_requests_insert_own "$1")" \
  "$(QD "$1" "select count(*) from pg_trigger where tgrelid = 'public.passion_requests'::regclass and tgname like '%passion_requests_garde';")" \
  "$(MD5_FONCTION "public.passion_requests_garde()" "$1")"; }
INCHANGEE="$MD5_WC_INSERT_PROD|0|-"
nouvelle_base() { QD postgres "create database $1 template socle" >/dev/null; }

A=aaaaaaaa-0000-4000-8000-000000000001    # dépose
B=bbbbbbbb-0000-4000-8000-000000000002    # un autre compte
V=cccccccc-0000-4000-8000-000000000003    # compte visé, EN SUPPRESSION
W=dddddddd-0000-4000-8000-000000000004    # compte visé, ordinaire
E=eeeeeeee-0000-4000-8000-000000000005    # antidate, normalized_label fourni
F=ffffffff-0000-4000-8000-000000000006    # un nom NOUVEAU
G=a0a0a0a0-0000-4000-8000-000000000007    # concurrence
H=b0b0b0b0-0000-4000-8000-000000000008    # limite contournée (correction naïve)
I=c0c0c0c0-0000-4000-8000-000000000009    # limite tenue (correction naïve)
J=a1a1a1a1-0000-4000-8000-0000000000aa    # connexion restée ouverte (verrou)
K=abababab-0000-4000-8000-00000000000b    # fenêtre de 24 h
C=c1c1c1c1-0000-4000-8000-00000000000c    # doublons
L=d1d1d1d1-0000-4000-8000-00000000000d    # le nouveau client : il LIT la ligne écrite
REFUS_RLS='42501 new row violates row-level security policy for table "passion_requests"'
REFUS_RLS_UP='42501 new row violates row-level security policy for table "user_passions"'
REFUS_DOUBLON='23505 duplicate key value violates unique constraint "passion_requests_unique_par_personne"'
RECURSION='42P17 infinite recursion detected in policy for relation "passion_requests"'
TOUT_VERT="$(printf 'O%.0s' $(seq 1 23))"

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }
different() { if [ "$2" != "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     les deux valent : %s\n' "$1" "$2"; fi; }

# ── LES RÔLES DE LA PRODUCTION (EXP-03) ─────────────────────────────────────
psql -h "$BASE" -p "$PORT" -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role postgres login nosuperuser bypassrls createrole createdb inherit;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant anon, authenticated, service_role to postgres with admin true, inherit true, set true;
alter role postgres set search_path to "$user", public, extensions;
create database socle owner postgres;
SQL

# ── LE SOCLE : la production du 2026-11-04, bâti par `postgres` ─────────────
psql -h "$BASE" -p "$PORT" -U postgres -d socle -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema auth;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
-- Les droits par défaut du projet (pg_default_acl, propriétaire postgres, schéma
-- public) : toute fonction neuve est exécutable par anon, authenticated,
-- service_role — et PUBLIC. Toute table : arwd pour les rôles clients (C-03).
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;

CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

-- Les tables, colonnes de production (pg_attribute, pg_constraint, 2026-11-04).
create table public.passions (
  id text primary key, emoji text not null default '✨', label text not null, color text,
  sort_order integer not null default 0, normalized_label text, aliases text[] not null default '{}'::text[],
  status text not null default 'active', source text not null default 'legacy', is_broad boolean not null default false,
  popularity integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid, recherche text,
  constraint passions_source_chk check (source = any (array['legacy'::text, 'curated'::text, 'imported'::text, 'user_suggested'::text])),
  constraint passions_status_chk check (status = any (array['active'::text, 'archived'::text, 'pending'::text])));
create table public.user_passions (
  user_id text not null, passion_id text not null references public.passions(id) on delete cascade,
  position integer not null default 0, archived boolean not null default false, created_at timestamptz not null default now(),
  primary key (user_id, passion_id));
create table public.passion_quotas (user_id uuid primary key, creations_max integer, note text, created_at timestamptz not null default now());
create table public.profiles (id text primary key, passions jsonb);
create table public.comptes_en_suppression (
  user_id text primary key, demandee_le timestamptz not null default now(), motif text, statut text not null default 'en_cours',
  jeton uuid, tentatives integer not null default 0, tentative_debut timestamptz, tentative_fin timestamptz,
  purge_terminee_le timestamptz, supprimee_le timestamptz, derniere_erreur jsonb, tentative_vivante boolean not null default false,
  check (statut = any (array['en_cours'::text, 'echec'::text, 'purgee'::text, 'supprimee'::text])));
create table public.passion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  label text not null,
  normalized_label text not null,
  status text not null default 'pending',
  resolved_passion_id text references public.passions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint passion_requests_status_chk check (status in ('pending', 'approved', 'rejected', 'duplicate')),
  constraint passion_requests_label_chk check (char_length(label) between 2 and 60));
create unique index passion_requests_unique_par_personne on public.passion_requests (user_id, normalized_label);
create index passion_requests_user_idx on public.passion_requests (user_id);
create index passion_requests_statut_idx on public.passion_requests (status, created_at desc);
create index passion_requests_resolved_idx on public.passion_requests (resolved_passion_id);
-- La barrière : aucun droit client, lecture seule pour service_role (relacl mesuré).
revoke all on public.comptes_en_suppression from anon, authenticated, service_role;
grant select on public.comptes_en_suppression to service_role;

alter table public.passions enable row level security;
alter table public.user_passions enable row level security;
alter table public.passion_quotas enable row level security;
alter table public.profiles enable row level security;
alter table public.comptes_en_suppression enable row level security;
alter table public.passion_requests enable row level security;

-- Les fonctions, définitions de PRODUCTION (pg_get_functiondef, 2026-11-04 ; CRLF → LF).
CREATE OR REPLACE FUNCTION public.suppression_de_mon_compte()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when auth.uid() is null then false          -- postgres, service_role, purge, restauration
    else exists (select 1 from public.comptes_en_suppression c
                  where c.user_id = (auth.uid())::text
                    and c.statut in ('en_cours', 'purgee', 'supprimee'))
  end
$function$;
CREATE OR REPLACE FUNCTION public.refuser_ecriture_compte_en_suppression()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  col   text;
  val   text;
  ligne jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    val := ligne ->> col;
    if val is not null and exists (
         select 1 from public.comptes_en_suppression c
          where c.user_id = val and c.statut in ('en_cours', 'purgee', 'supprimee'))
    then
      raise exception 'new row violates row-level security policy for table "%"', tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.unaccent_immutable(txt text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
  select translate(
    lower(txt),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ',
    'aaaaaaceeeeiiiinooooouuuuyyoa'
  );
$function$;
CREATE OR REPLACE FUNCTION public.passion_plier(p_texte text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select btrim(regexp_replace(
    public.unaccent_immutable(coalesce(p_texte, '')), '[^a-z0-9]+', ' ', 'g'));
$function$;
CREATE OR REPLACE FUNCTION public.passions_recherche_calculer(p_label text, p_aliases text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select trim(regexp_replace(
    public.unaccent_immutable(coalesce(p_label, '')) || ' ' ||
    coalesce((select string_agg(public.unaccent_immutable(a), ' ') from unnest(coalesce(p_aliases, '{}'::text[])) a), ''),
    '[^a-z0-9 ]+', ' ', 'g'));
$function$;
CREATE OR REPLACE FUNCTION public.trg_passions_recherche()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.recherche := public.passions_recherche_calculer(new.label, new.aliases);
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.sync_profil_passions(p_uid text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.profiles pr
     set passions = coalesce((
           select jsonb_agg(
                    jsonb_build_object(
                      'id',       p.id,
                      'label',    p.label,
                      'emoji',    p.emoji,
                      'color',    coalesce(p.color, '#7c3aed'),
                      'bio',      coalesce(anc->>'bio', ''),
                      'archived', up.archived,
                      'coverUrl', anc->'coverUrl',
                      'photoUrl', anc->'photoUrl'
                    )
                    order by up.position, p.label)
             from public.user_passions up
             join public.passions p on p.id = up.passion_id
             left join lateral (
                    select e
                      from jsonb_array_elements(coalesce(pr.passions, '[]'::jsonb)) e
                     where e->>'id' = up.passion_id
                     limit 1
                  ) a(anc) on true
            where up.user_id = p_uid
         ), '[]'::jsonb)
   where pr.id = p_uid;
end $function$;
CREATE OR REPLACE FUNCTION public.trg_sync_profil_passions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.sync_profil_passions(coalesce(new.user_id, old.user_id));
  return null;
end $function$;
CREATE OR REPLACE FUNCTION public.creer_passion(p_label text, p_emoji text, p_aliases text[])
 RETURNS TABLE(id text, label text, emoji text, color text, cree boolean, aliases text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_brut    text := regexp_replace(btrim(coalesce(p_label, '')), '\s+', ' ', 'g');
  v_norme   text;
  v_slug    text;
  v_essai   text;
  v_i       int := 1;
  v_emoji   text;
  v_exist   public.passions%rowtype;
  v_total   int;
  v_max     int;
  v_a       text;
  v_an      text;
  v_gardes  text[] := '{}';
  v_plies   text[] := '{}';
begin
  if v_uid is null then
    raise exception 'auth_requise' using errcode = '42501';
  end if;

  v_brut  := left(v_brut, 60);
  v_norme := public.passion_plier(v_brut);

  if char_length(v_norme) < 2 or char_length(v_norme) > 60 then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;
  if v_norme !~ '[a-z]' then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;
  if array_length(regexp_split_to_array(v_norme, ' '), 1) > 6 then
    raise exception 'nom_trop_long' using errcode = '22023';
  end if;
  if v_brut ~* '(https?:|www\.|@|\.[a-z]{2,4}/)' then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;
  if v_brut ~ '[<>&"\\`]' then
    raise exception 'nom_invalide' using errcode = '22023';
  end if;

  -- ── Déjà là ? On rend l'existante ───────────────────────────────────────
  -- ⚠️ Le LIBELLÉ seul est interrogé ici, et les alias de l'EXISTANT. Les
  -- alias PROPOSÉS n'entrent pas dans ce test : voir l'en-tête.
  select * into v_exist from public.passions p
   where p.normalized_label = v_norme
      or exists (select 1 from unnest(p.aliases) a
                  where public.passion_plier(a) = v_norme)
   order by (p.status = 'active') desc, p.popularity desc
   limit 1;

  if found then
    if v_exist.status <> 'active' then
      raise exception 'nom_indisponible' using errcode = '22023';
    end if;
    return query select v_exist.id, v_exist.label, v_exist.emoji, v_exist.color,
                        false, v_exist.aliases;
    return;
  end if;

  -- ── Plafond de créations par compte ─────────────────────────────────────
  -- `passion_quotas` : aucune ligne = le défaut (3) ; une ligne à NULL =
  -- illimité. On tranche sur `found`, JAMAIS sur un coalesce de la valeur —
  -- sinon la table donnerait l'illimité à tout le monde par le seul fait
  -- d'exister.
  -- ⚠️ ASTRA-04 (2026-09-15) : le plafond se lisait puis s'insérait SANS
  -- sérialisation — deux créations simultanées du même compte lisaient toutes
  -- deux « 2 sur 3 » et passaient toutes deux. Un verrou consultatif par compte,
  -- tenu jusqu'à la fin de la transaction, met la seconde en attente derrière
  -- la première : elle relit alors « 3 sur 3 » et est refusée. Le verrou est
  -- par COMPTE (hashtext de l'uid) : deux comptes différents ne s'attendent pas.
  perform pg_advisory_xact_lock(hashtext('creer_passion:' || v_uid::text));
  select q.creations_max into v_max from public.passion_quotas q where q.user_id = v_uid;
  if not found then v_max := 3; end if;
  if v_max is not null then
    select count(*) into v_total from public.passions where created_by = v_uid;
    if v_total >= v_max then
      raise exception 'quota_creation' using errcode = '53400';
    end if;
  end if;

  -- ── Identifiant ─────────────────────────────────────────────────────────
  v_slug  := replace(v_norme, ' ', '-');
  v_essai := v_slug;
  while exists (select 1 from public.passions p where p.id = v_essai) loop
    v_i := v_i + 1;
    v_essai := v_slug || '-' || v_i::text;
    if v_i > 50 then
      raise exception 'nom_indisponible' using errcode = '22023';
    end if;
  end loop;

  -- ── Emoji ───────────────────────────────────────────────────────────────
  v_emoji := btrim(coalesce(p_emoji, ''));
  if v_emoji = '' or char_length(v_emoji) > 4 or v_emoji ~ '[a-zA-Z0-9<>&"''/\\]' then
    v_emoji := '✨';
  end if;

  -- ── Alias : on garde ce qui sert, on écarte le reste ────────────────────
  -- Cinq au plus. Au-delà, ce n'est plus un synonyme, c'est du référencement.
  foreach v_a in array coalesce(p_aliases, '{}'::text[]) loop
    exit when cardinality(v_gardes) >= 5;
    v_a  := left(regexp_replace(btrim(coalesce(v_a, '')), '\s+', ' ', 'g'), 60);
    v_an := public.passion_plier(v_a);

    continue when char_length(v_an) < 2;          -- vide ou trop court
    continue when v_an !~ '[a-z]';                -- « 2025 » n'aide personne
    continue when v_a ~ '[<>&"\\`]';              -- même refus que le libellé
    continue when v_a ~* '(https?:|www\.|@|\.[a-z]{2,4}/)';
    continue when v_an = v_norme;                 -- l'alias de son propre nom
    continue when v_an = any (v_plies);           -- doublon dans la liste
    -- ⚠️ LE CONTRÔLE QUI COMPTE : un alias qui est déjà le LIBELLÉ ou l'ALIAS
    -- d'une autre passion ferait remonter deux entrées pour le même mot.
    continue when exists (
      select 1 from public.passions p
       where p.normalized_label = v_an
          or exists (select 1 from unnest(p.aliases) x
                      where public.passion_plier(x) = v_an));

    v_gardes := v_gardes || v_a;
    v_plies  := v_plies  || v_an;
  end loop;

  insert into public.passions
    (id, label, emoji, color, sort_order, normalized_label, aliases,
     status, source, is_broad, popularity, created_by)
  values
    (v_essai,
     upper(left(v_brut, 1)) || substr(v_brut, 2),
     v_emoji, '#7c3aed', 5000, v_norme, v_gardes,
     'active', 'user_suggested', false, 0, v_uid);

  update public.passion_requests r
     set status = 'approved'
   where r.normalized_label = v_norme and r.status = 'pending';

  return query
    select p.id, p.label, p.emoji, p.color, true, p.aliases
      from public.passions p where p.id = v_essai;
end $function$;
CREATE OR REPLACE FUNCTION public.creer_passion(p_label text, p_emoji text DEFAULT NULL::text)
 RETURNS TABLE(id text, label text, emoji text, color text, cree boolean, aliases text[])
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from public.creer_passion(p_label, p_emoji, null::text[]);
$function$;
CREATE OR REPLACE FUNCTION public.passion_request_auto_creer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_p   record;
  v_pos int;
begin
  -- creer_passion() garde ses garde-fous : nom valide, déduplication
  -- (accents / casse / alias), 5 créations / 24 h, 30 au total.
  -- Si le nom existe déjà, elle renvoie la passion existante.
  select * into v_p from public.creer_passion(new.label, null);

  select coalesce(max(up.position), -1) + 1 into v_pos
    from public.user_passions up
   where up.user_id = new.user_id;

  insert into public.user_passions (user_id, passion_id, position, archived)
  values (new.user_id, v_p.id, v_pos, false)
  on conflict (user_id, passion_id) do update set archived = false;
  -- trg_user_passions_sync répercute dans profiles.passions

  new.status              := 'approved';
  new.resolved_passion_id := v_p.id;
  new.updated_at          := now();
  return new;
end $function$;

-- Les droits d'EXÉCUTION mesurés (proacl, 2026-11-04).
revoke all on function public.suppression_de_mon_compte() from public;
revoke all on function public.refuser_ecriture_compte_en_suppression() from public, anon, authenticated;
revoke all on function public.sync_profil_passions(text) from public, anon, authenticated;
revoke all on function public.trg_sync_profil_passions() from public, anon, authenticated;
revoke all on function public.passion_request_auto_creer() from public, anon, authenticated;
revoke all on function public.creer_passion(text, text, text[]) from public, anon;
revoke all on function public.creer_passion(text, text) from public, anon;
revoke all on function public.passion_plier(text) from public, anon;

-- Les policies de production (pg_get_expr, 2026-11-04). passion_requests_insert_own
-- naît ici avec une WITH CHECK neutre : c'est le RETOUR ARRIÈRE de la migration qui
-- lui donne celle de production (contrôlée par empreinte en ⓪).
create policy passions_select_all on public.passions for select using (true);
create policy user_passions_select_all on public.user_passions for select using (true);
create policy user_passions_insert_own on public.user_passions for insert
  with check ((user_id = ((select auth.uid()))::text) and (not public.suppression_de_mon_compte()));
create policy user_passions_update_own on public.user_passions for update using ((user_id = ((select auth.uid()))::text))
  with check ((user_id = ((select auth.uid()))::text) and (not public.suppression_de_mon_compte()));
create policy user_passions_delete_own on public.user_passions for delete using ((user_id = ((select auth.uid()))::text));
create policy passion_quotas_select_own on public.passion_quotas for select using ((user_id = (select auth.uid())));
create policy passion_requests_select_own on public.passion_requests for select using ((user_id = ((select auth.uid()))::text));
create policy passion_requests_insert_own on public.passion_requests for insert with check (true);

-- Les déclencheurs de production (pg_get_triggerdef, 2026-11-04).
create trigger trg_passions_recherche before insert or update of label, aliases on public.passions
  for each row execute function public.trg_passions_recherche();
create trigger trg_user_passions_sync after insert or delete or update on public.user_passions
  for each row execute function public.trg_sync_profil_passions();
create trigger zz_barriere_suppression before insert or update on public.user_passions
  for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');
create trigger zz_barriere_suppression before insert or update on public.passion_quotas
  for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');
create trigger trg_passion_request_auto before insert on public.passion_requests
  for each row execute function public.passion_request_auto_creer();
create trigger zz_barriere_suppression before insert or update on public.passion_requests
  for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');

-- Le référentiel du banc : des passions comme la production en porte 5 010.
insert into public.passions (id, label, normalized_label, status, source)
select v.id, v.label, public.passion_plier(v.label), 'active', 'legacy'
  from (values ('musique', 'Musique'), ('photo', 'Photo'), ('cuisine', 'Cuisine'), ('voyage', 'Voyage'),
               ('jardinage', 'Jardinage'), ('danse', 'Danse'), ('yoga', 'Yoga'), ('tricot', 'Tricot'),
               ('escalade', 'Escalade'), ('lecture', 'Lecture')) v(id, label);
SQL
# La WITH CHECK de PRODUCTION : posée par le retour arrière de la migration.
RETOUR_ARRIERE > "$SQLDIR/retour.sql"; chmod 644 "$SQLDIR/retour.sql"
PGOPTIONS="-c client_min_messages=warning" psql -h "$BASE" -p "$PORT" -U postgres -d socle -X -q -v ON_ERROR_STOP=1 -f "$SQLDIR/retour.sql" >/dev/null
for base in "$DB" naive; do nouvelle_base "$base"; done

# Deux dérives de catalogue, réutilisées plus bas (fonctions recréées depuis leur
# propre définition, un fragment remplacé).
DERIVE_CREER_PASSION="do \$x\$ begin execute replace(pg_get_functiondef('public.creer_passion(text,text,text[])'::regprocedure),
  E'if v_uid is null then\n    raise exception ''auth_requise'' using errcode = ''42501'';\n  end if;', ''); end \$x\$;"
DERIVE_AUTO="do \$x\$ begin execute replace(pg_get_functiondef('public.passion_request_auto_creer()'::regprocedure),
  'garde ses garde-fous', 'garde ses gardes'); end \$x\$;"
DERIVE_BARRIERE="do \$x\$ begin execute replace(pg_get_functiondef('public.refuser_ecriture_compte_en_suppression()'::regprocedure),
  'using errcode = ''42501'';', 'using errcode = ''42501'', hint = ''dérive'';'); end \$x\$;"

echo "── ⓪ LE SOCLE EST LA PRODUCTION, ET LE BANC NE MENT PAS ─────────────"
for f in "${!MD5_PROD[@]}"; do
  verifier "$f : la définition de production, à l'octet (md5 du corps)" "${MD5_PROD[$f]}" "$(MD5_FONCTION "$f")"
done
verifier "passion_requests_insert_own (WITH CHECK posée par le RETOUR ARRIÈRE) se déparse comme en production (md5)" "$MD5_WC_INSERT_PROD" "$(MD5_POLICY passion_requests_insert_own)"
verifier "passion_requests_select_own se déparse comme en production (md5)" "$MD5_QUAL_SELECT_PROD" "$(MD5_POLICY passion_requests_select_own)"
verifier "…et la WITH CHECK de production lit bien sa propre table (la sous-requête du défaut)" "t" \
  "$(Q "select pg_get_expr(polwithcheck, polrelid) like '%FROM passion_requests r%' from pg_policy where polname = 'passion_requests_insert_own';")"
verifier "droits de table ÉQUIVALENTS à la production (aclexplode, hors MAINTAIN — propre à la 17) : anon et authenticated arwd, postgres et service_role tout" \
  "anon:DELETE:false,anon:INSERT:false,anon:SELECT:false,anon:UPDATE:false,authenticated:DELETE:false,authenticated:INSERT:false,authenticated:SELECT:false,authenticated:UPDATE:false,postgres:DELETE:false,postgres:INSERT:false,postgres:REFERENCES:false,postgres:SELECT:false,postgres:TRIGGER:false,postgres:TRUNCATE:false,postgres:UPDATE:false,service_role:DELETE:false,service_role:INSERT:false,service_role:REFERENCES:false,service_role:SELECT:false,service_role:TRIGGER:false,service_role:TRUNCATE:false,service_role:UPDATE:false" \
  "$(DROITS_TABLE)"
verifier "deux déclencheurs, dans l'ordre de leurs noms : trg_passion_request_auto (BEFORE INSERT), zz_barriere_suppression (BEFORE INSERT OR UPDATE)" \
  "trg_passion_request_auto:7:O,zz_barriere_suppression:23:O" "$(DECLENCHEURS)"
verifier "le rôle de la migration est celui de la production (EXP-03) : postgres, NI superutilisateur, BYPASSRLS, membre (SET) d'anon, authenticated, service_role" \
  "f|t|anon,authenticated,service_role" \
  "$(Q "select case when r.rolsuper then 't' else 'f' end || '|' || case when r.rolbypassrls then 't' else 'f' end || '|' || (select string_agg(m.roleid::regrole::text, ',' order by m.roleid::regrole::text) from pg_auth_members m where m.member = r.oid and m.set_option) from pg_roles r where r.rolname = current_user;")"
verifier "…et son search_path de production : « \"\$user\", public, extensions »" '"$user", public, extensions' "$(Q "show search_path;")"
if grep -qF -- "$PGRST" "$MIGRATION"; then ok=$((ok+1)); echo "  ✅ la requête de PostgREST du verdict de la migration est celle de ce banc, à l'octet (que ce soit la forme de PRODUCTION, c'est le témoin ci-dessous qui le dit)"; else ko=$((ko+1)); echo "  ❌ la requête de PostgREST du verdict diffère de celle du banc"; fi
temoin() {  # la requête du banc, préparée puis exécutée, telle que pg_stat_statements la normalise : « md5|longueur »
  [ -n "$PRECHARGE" ] || { echo "pg_stat_statements absent de ce PostgreSQL"; return 0; }
  QA postgres "create database temoin owner postgres" >/dev/null || { echo "base témoin impossible"; return 0; }
  QA temoin "create schema extensions; create extension pg_stat_statements with schema extensions;" >/dev/null || { echo "extension pg_stat_statements impossible"; return 0; }
  QD temoin "create table public.passion_requests (label text, normalized_label text, status text, user_id text);" >/dev/null
  printf 'PREPARE pgrst(json) AS %s;\nEXECUTE pgrst(%s);\n' "$PGRST" "'{\"label\": \"a\", \"normalized_label\": \"a\", \"status\": \"pending\", \"user_id\": \"u\"}'" > "$SQLDIR/temoin.sql"
  chmod 644 "$SQLDIR/temoin.sql"
  psql -h "$BASE" -p "$PORT" -U postgres -d temoin -X -q -v ON_ERROR_STOP=1 -f "$SQLDIR/temoin.sql" >/dev/null 2>&1 || { echo "requête du témoin en échec"; return 0; }
  QA temoin "select md5(substr(query, length('PREPARE pgrst(json) AS ') + 1)) || '|' || length(substr(query, length('PREPARE pgrst(json) AS ') + 1))
               from extensions.pg_stat_statements where query like 'PREPARE pgrst(json) AS WITH pgrst_source%';"
}
verifier "témoin EXTERNE (VB-09) : pg_stat_statements normalise la requête du banc EXACTEMENT comme la seule forme d'INSERT relevée en production (md5, longueur)" \
  "$MD5_PGSS_PROD|$LONGUEUR_PGSS_PROD" "$(temoin)"
contient "le banc lui-même (VB-07) : SOUS sur une base INEXISTANTE ne rend pas « OK »" "^ECHEC_PSQL" "$(SOUS base_inexistante authenticated "$A" "select 1;")"
contient "…DEPOT non plus" "^ECHEC_PSQL" "$(DEPOT base_inexistante authenticated "$A" "Musique" "$A")"
contient "…LIT non plus" "^ECHEC_PSQL" "$(LIT base_inexistante "$A" "select 1;")"
verifier "…et une erreur SQL rend son SQLSTATE et son message" "22012 division by zero" "$(SOUS "$DB" authenticated "$A" "select 1/0;")"
DROITS_AVANT="$(DROITS_TABLE)"

echo "── ① LE DÉFAUT, MESURÉ AVANT, sur la production ─────────────────────"
verifier "la requête de PostgREST, PRÉPARÉE sous authenticated : 42P17 au PARSE (avant toute ligne)" "$RECURSION" \
  "$(SOUS "$DB" authenticated "$A" "prepare pgrst(json) as $PGRST;")"
verifier "…l'INSERT directe aussi" "$RECURSION" \
  "$(SOUS "$DB" authenticated "$A" "insert into public.passion_requests (user_id, label, normalized_label) values ('$A', 'Musique', 'musique');")"
verifier "…et sous anon (le visiteur des suites e2e) : 42P17 aussi" "$RECURSION" "$(DEPOT "$DB" anon "" "Musique" "u_visiteur")"
verifier "une LECTURE ne lève rien (la policy SELECT n'est récursive que développée DEPUIS la WITH CHECK)" "OK" \
  "$(SOUS "$DB" authenticated "$A" "select count(*) from public.passion_requests;")"
verifier "rien n'est écrit" "0" "$(Q "select count(*) from public.passion_requests;")"

# LA CORRECTION NAÏVE : la policy SELECT rendue à `auth.uid()` nu (migration_passions_plat.sql).
QD naive "alter policy passion_requests_select_own on public.passion_requests using (user_id = auth.uid()::text);" >/dev/null
verifier "correction naïve : plus de 42P17… mais la demande CONFORME est refusée (trg_passion_request_auto pose « approved » AVANT la WITH CHECK)" "$REFUS_RLS" \
  "$(DEPOT naive authenticated "$A" "Musique" "$A")"
verifier "…et rien n'est écrit" "0" "$(QD naive "select count(*) from public.passion_requests;")"
QD naive "insert into public.comptes_en_suppression (user_id, statut) values ('$V', 'en_cours');" >/dev/null
oracle_v="$(DEPOT naive authenticated "$B" "Photo" "$V")"
oracle_w="$(DEPOT naive authenticated "$B" "Photo" "$W")"
verifier "correction naïve : au nom d'un compte EN SUPPRESSION, le refus nomme « user_passions » (trg_passion_request_auto a écrit pour lui)" "$REFUS_RLS_UP" "$oracle_v"
verifier "…au nom d'un compte ordinaire, il nomme « passion_requests »" "$REFUS_RLS" "$oracle_w"
different "…L'ORACLE : deux refus différents, un compte connecté apprend qui supprime son compte" "$oracle_v" "$oracle_w"
# LE TROU DE LA LIMITE : déclencheur automatique coupé (la WITH CHECK seule juge), created_at du client.
QD naive "alter table public.passion_requests disable trigger trg_passion_request_auto;" >/dev/null
for lib in Musique Photo Cuisine Voyage Jardinage Danse; do
  SOUS naive authenticated "$H" "insert into public.passion_requests (user_id, label, normalized_label, created_at) values ('$H', '$lib', lower('$lib'), '2000-01-01');" >/dev/null
done
verifier "…et la limite : six demandes ANTIDATÉES (created_at écrit par le client) passent toutes" "6" \
  "$(QD naive "select count(*) from public.passion_requests where user_id = '$H';")"
for lib in Musique Photo Cuisine Voyage Jardinage; do
  SOUS naive authenticated "$I" "insert into public.passion_requests (user_id, label, normalized_label) values ('$I', '$lib', lower('$lib'));" >/dev/null
done
verifier "…quand la 6ᵉ honnête, elle, est refusée : la limite ne tenait que si l'on ne mentait pas sur l'heure" "$REFUS_RLS" \
  "$(SOUS naive authenticated "$I" "insert into public.passion_requests (user_id, label, normalized_label) values ('$I', 'Danse', 'danse');")"

# RÉINJECTION : la migration SANS sa correction (garde et policy ôtées), sur la production.
python3 -I - "$MIGRATION" "$SQLDIR/reinjecte.sql" "$SQLDIR/reinjecte_sans_gardefou.sql" <<'PY'
import sys
s = open(sys.argv[1], encoding="utf-8").read()
d1 = s.index("-- ── ① LA GARDE"); d3 = s.index("-- ── ③ LE COMPORTEMENT")
d5 = s.index("-- ── ⑤ FERMÉ SUR ÉCHEC"); dv = s.index("-- ── Verdict ──")
open(sys.argv[2], "w", encoding="utf-8").write(s[:d1] + s[d3:])
open(sys.argv[3], "w", encoding="utf-8").write(s[:d1] + s[d3:d5] + s[dv:])
PY
chmod 644 "$SQLDIR/reinjecte.sql" "$SQLDIR/reinjecte_sans_gardefou.sql"
nouvelle_base reinjecte; nouvelle_base reinjecte_vue
sortie_r="$(APPLIQUER reinjecte "$SQLDIR/reinjecte.sql" || true)"
verifier "réinjection (la migration SANS sa correction, sur la production) : son garde-fou la REFUSE (55000) — le comportement mesuré (2 à 14), la policy (17), la garde (19) et sa fonction (20)" \
  "REFUSEE 55000 lignes 2,3,4,5,6,7,8,9,10,11,12,13,14,17,19,20" "$(REFUS "$sortie_r")"
verifier "…et RIEN n'est appliqué : la base est celle d'avant (WITH CHECK de production, aucune garde)" "$INCHANGEE" "$(ETAT reinjecte)"
sortie_r="$(APPLIQUER reinjecte_vue "$SQLDIR/reinjecte_sans_gardefou.sql" || true)"
verifier "réinjection, garde-fou ôté pour LIRE le tableau : le comportement (2 à 14) et le catalogue du correctif (17, 19, 20) ROUGISSENT ; restent verts la mesure (1), les verrous (15), l'absence de trace (16), la policy SELECT (18), ce que le correctif suppose (21), la RLS (22), les droits (23)" \
  "OEEEEEEEEEEEEEOOEOEEOOO" "$(vecteur "$sortie_r")"

echo "── ② APPLICATION (fichier, puis requête unique, LF et CRLF), VERDICT, REJEU ──"
sortie="$(APPLIQUER "$DB" "$MIGRATION")" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -8; exit 1; }
printf '%s\n' "$sortie" | grep '§' | sed 's/^/     │ /'
verifier "le tableau de verdict rend 23 OK et 0 ECHEC (psql -f, instruction par instruction)" "23/0" "$(compte_verdict "$sortie")"
verifier "…dans l'ordre : comportement 1 à 16, catalogue 17 à 23" "$TOUT_VERT" "$(vecteur "$sortie")"
sortie2="$(APPLIQUER "$DB" "$MIGRATION")" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -8; exit 1; }
verifier "rejeu : toujours 23 OK, 0 ECHEC" "23/0" "$(compte_verdict "$sortie2")"
sortie_c="$(APPLIQUER_REQUETE "$DB" "$MIGRATION" || true)"
verifier "rejeu en UNE requête simple (psql -c : la forme de l'API de gestion et de l'éditeur SQL) : 23 OK, 0 ECHEC" "23/0" "$(compte_verdict "$sortie_c")"
python3 -I - "$MIGRATION" "$SQLDIR/crlf.sql" <<'PY'
import sys
s = open(sys.argv[1], encoding="utf-8").read().replace("\r\n", "\n")
open(sys.argv[2], "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
PY
chmod 644 "$SQLDIR/crlf.sql"
nouvelle_base crlf
sortie_crlf="$(APPLIQUER_REQUETE crlf "$SQLDIR/crlf.sql" || true)"
verifier "le fichier en CRLF (un poste Windows), en UNE requête, sur une base neuve : 23 OK, 0 ECHEC" "23/0" "$(compte_verdict "$sortie_crlf")"
verifier "…et le CRLF a bien atteint le serveur : le corps stocké de la garde porte des CR (son empreinte normalise les fins de ligne)" "t" \
  "$(QD crlf "select position(chr(13) in prosrc) > 0 from pg_proc where oid = 'public.passion_requests_garde()'::regprocedure;")"
verifier "rejeu : une seule garde, une seule fonction, deux policies (rien ne s'empile)" "1|1|2" \
  "$(Q "select (select count(*) from pg_trigger where tgrelid = 'public.passion_requests'::regclass and tgname = 'aa_passion_requests_garde') || '|' || (select count(*) from pg_proc where proname = 'passion_requests_garde') || '|' || (select count(*) from pg_policy where polrelid = 'public.passion_requests'::regclass);")"
verifier "trois déclencheurs, la garde en tête : aa_passion_requests_garde, trg_passion_request_auto, zz_barriere_suppression" \
  "aa_passion_requests_garde:7:O,trg_passion_request_auto:7:O,zz_barriere_suppression:23:O" "$(DECLENCHEURS)"
verifier "droits d'exécution de la garde : postgres et service_role seuls (ni PUBLIC, ni anon, ni authenticated)" "postgres,service_role" \
  "$(Q "select string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text) from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.passion_requests_garde()'::regprocedure;")"
verifier "les droits de TABLE n'ont pas bougé (aclexplode)" "$DROITS_AVANT" "$(DROITS_TABLE)"
verifier "aucune fonction de la production n'a bougé (empreintes)" "${MD5_PROD["public.passion_request_auto_creer()"]}|${MD5_PROD["public.creer_passion(text,text,text[])"]}|${MD5_PROD["public.creer_passion(text,text)"]}|${MD5_PROD["public.refuser_ecriture_compte_en_suppression()"]}|${MD5_PROD["public.suppression_de_mon_compte()"]}" \
  "$(MD5_FONCTION "public.passion_request_auto_creer()")|$(MD5_FONCTION "public.creer_passion(text,text,text[])")|$(MD5_FONCTION "public.creer_passion(text,text)")|$(MD5_FONCTION "public.refuser_ecriture_compte_en_suppression()")|$(MD5_FONCTION "public.suppression_de_mon_compte()")"
{ cat "$MIGRATION"; echo "select 'catalogue=' || coalesce(to_regclass('pg_temp.passio_pr_catalogue')::text, 'absente');"; } > "$SQLDIR/apres_commit.sql"; chmod 644 "$SQLDIR/apres_commit.sql"
verifier "la table temporaire du catalogue ne survit pas au commit, dans la session même (on commit drop)" "catalogue=absente" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -v ON_ERROR_STOP=1 -f "$SQLDIR/apres_commit.sql" 2>&1 | grep '^catalogue=')"

echo "── ③ LE COMPORTEMENT, SOUS LES VRAIS RÔLES (la requête de PostgREST) ──"
Q "insert into public.profiles (id, passions) values ('$A', '[]'::jsonb);" >/dev/null
for lib in Musique Photo Cuisine Voyage Jardinage; do
  verifier "A dépose « $lib » : passe" "OK" "$(DEPOT "$DB" authenticated "$A" "$lib" "$A")"
done
verifier "A dépose une 6ᵉ demande en 24 h : REFUSÉE (42501)" "$REFUS_RLS" "$(DEPOT "$DB" authenticated "$A" "Danse" "$A")"
contient "…avec l'indice du quota (le refus dit lequel, à son seul auteur)" "quota : 5 demandes" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -v VERBOSITY=verbose -c "$(PRE authenticated "$A") insert into public.passion_requests (user_id, label, normalized_label) values ('$A', 'Yoga', 'yoga');" 2>&1 || true)"
verifier "les cinq demandes de A : approuvées et résolues par trg_passion_request_auto, la bonne passion chacune" "5|5" \
  "$(Q "select count(*) || '|' || count(*) filter (where status = 'approved' and resolved_passion_id = normalized_label) from public.passion_requests where user_id = '$A';")"
verifier "…ses passions rattachées (user_passions), et répercutées dans profiles.passions" "5|5" \
  "$(Q "select (select count(*) from public.user_passions where user_id = '$A') || '|' || (select jsonb_array_length(passions) from public.profiles where id = '$A');")"
verifier "A lit ses cinq demandes ; B n'en lit aucune (la policy SELECT n'a pas changé)" "5|0" \
  "$(LIT "$DB" "$A" "select count(*) from public.passion_requests;")|$(LIT "$DB" "$B" "select count(*) from public.passion_requests;")"
verifier "E dépose une demande ANTIDATÉE (2000-01-01), à identifiant ET normalized_label choisis : passe — A est au plafond, le quota est PAR COMPTE (VB-04)…" "OK" \
  "$(SOUS "$DB" authenticated "$E" "insert into public.passion_requests (id, user_id, label, normalized_label, status, created_at, updated_at) values ('eeeeeeee-0000-4000-8000-00000000e0e0', '$E', 'Yoga', '<b>choisi</b>', 'pending', '2000-01-01', '2000-01-01');")"
verifier "…mais l'heure, l'identifiant ET normalized_label sont ceux du serveur (SEC-02 : passion_plier du libellé)" "t|t|t|yoga" \
  "$(Q "select (created_at > now() - interval '1 minute') || '|' || (updated_at > now() - interval '1 minute') || '|' || (id <> 'eeeeeeee-0000-4000-8000-00000000e0e0') || '|' || normalized_label from public.passion_requests where user_id = '$E';" | sed 's/true/t/g; s/false/f/g')"
verifier "E dépose « Photo » déguisée en « yoga » (normalized_label fourni) : ni doublon ni passe-droit — c'est SA demande, repliée par le serveur, et elle compte" "OK|photo,yoga" \
  "$(SOUS "$DB" authenticated "$E" "insert into public.passion_requests (user_id, label, normalized_label) values ('$E', 'Photo', 'yoga');")|$(Q "select string_agg(normalized_label, ',' order by normalized_label) from public.passion_requests where user_id = '$E';")"
Q "insert into public.comptes_en_suppression (user_id, statut) values ('$V', 'en_cours');" >/dev/null
garde_v="$(DEPOT "$DB" authenticated "$B" "Photo" "$V")"
garde_w="$(DEPOT "$DB" authenticated "$B" "Photo" "$W")"
verifier "B dépose au nom d'un compte EN SUPPRESSION : refusé (42501, « passion_requests »)" "$REFUS_RLS" "$garde_v"
verifier "B dépose au nom d'un compte ordinaire : le MÊME refus — l'oracle est fermé" "$garde_v" "$garde_w"
verifier "B dépose à son nom avec status « approved » : refusé" "$REFUS_RLS" "$(DEPOT "$DB" authenticated "$B" "Tricot" "$B" approved)"
verifier "B dépose à son nom avec un resolved_passion_id : refusé" "$REFUS_RLS" \
  "$(SOUS "$DB" authenticated "$B" "insert into public.passion_requests (user_id, label, normalized_label, resolved_passion_id) values ('$B', 'Tricot', 'tricot', 'tricot');")"
verifier "…B n'a aucune demande" "0" "$(Q "select count(*) from public.passion_requests where user_id = '$B';")"
verifier "un compte EN SUPPRESSION ne dépose pas pour lui-même non plus (barrière, inchangée)" "42501" \
  "$(DEPOT "$DB" authenticated "$V" "Lecture" "$V" | cut -c1-5)"
visiteur_v="$(DEPOT "$DB" anon "" "Musique" "$V")"
visiteur_w="$(DEPOT "$DB" anon "" "Musique" "$W")"
verifier "un VISITEUR (anon) au nom d'un compte EN SUPPRESSION : refusé PAR LA GARDE (42501, le message d'un refus RLS — plus 500, plus « auth_requise » de creer_passion)" "$REFUS_RLS" "$visiteur_v"
verifier "…au nom d'un compte ordinaire : le MÊME refus, message compris (VB-03)" "$visiteur_v" "$visiteur_w"
verifier "…sous ignore-duplicates aussi, et pour un identifiant de visiteur (u_…)" "$REFUS_RLS|$REFUS_RLS" \
  "$(SOUS "$DB" anon "" "insert into public.passion_requests (user_id, label, normalized_label) values ('$W', 'Musique', 'musique') on conflict (user_id, normalized_label) do nothing;")|$(DEPOT "$DB" anon "" "Musique" "u_visiteur")"
verifier "…et rien n'a été écrit pour aucun d'eux (ni demande, ni passion rattachée)" "0|0" \
  "$(Q "select (select count(*) from public.passion_requests where user_id in ('$V', '$W', 'u_visiteur')) || '|' || (select count(*) from public.user_passions where user_id in ('$V', '$W', 'u_visiteur'));")"
verifier "F dépose un nom NOUVEAU : passe, la passion naît (user_suggested, created_by F) et la demande la désigne" "OK|1|1" \
  "$(DEPOT "$DB" authenticated "$F" "Aquaponie urbaine" "$F")|$(Q "select count(*) from public.passions where normalized_label = 'aquaponie urbaine' and source = 'user_suggested' and created_by = '$F';")|$(Q "select count(*) from public.passion_requests where user_id = '$F' and status = 'approved' and resolved_passion_id = 'aquaponie-urbaine';")"
verifier "le NOUVEAU client lit la ligne écrite (INSERT … RETURNING, la forme de .select(\"status,resolved_passion_id\")) : « approved » et la passion — la policy SELECT, qui juge aussi la ligne rendue, ne relance pas de 42P17" \
  "approved|lecture" "$(LIT "$DB" "$L" "insert into public.passion_requests (user_id, label, normalized_label, status) values ('$L', 'Lecture', 'lecture', 'pending') returning status || '|' || resolved_passion_id;" | grep -v '^INSERT ')"
verifier "une écriture d'ADMINISTRATION (sans session, rôle « none », auto coupé le temps d'une transaction) n'est pas jugée : statut et date gardés" "approved|2000-01-01" \
  "$(Q "begin; alter table public.passion_requests disable trigger trg_passion_request_auto;
        insert into public.passion_requests (user_id, label, normalized_label, status, created_at) values ('admin-banc', 'Admin', 'admin', 'approved', '2000-01-01');
        select status || '|' || created_at::date from public.passion_requests where user_id = 'admin-banc'; rollback;" | tail -1)"
verifier "service_role SANS identité n'est pas jugé par la garde non plus : le refus vient de creer_passion (auth_requise), comme avant ce lot" "42501 auth_requise" \
  "$(DEPOT "$DB" service_role "" "Musique" "srv-banc")"
# CONCURRENCE : G a quatre demandes ; deux dépôts SIMULTANÉS de la 5ᵉ — un seul passe.
concurrence() {  # $1 base ; rend « nombre de lignes de G | réponses triées »
  for lib in Musique Photo Cuisine Voyage; do DEPOT "$1" authenticated "$G" "$lib" "$G" >/dev/null; done
  ( SOUS "$1" authenticated "$G" "prepare pgrst(json) as $PGRST; execute pgrst('{\"label\": \"Jardinage\", \"normalized_label\": \"jardinage\", \"status\": \"pending\", \"user_id\": \"$G\"}'); select pg_sleep(1.5);" > "$BASE/c1_$1.txt" ) &
  sleep 0.4
  ( SOUS "$1" authenticated "$G" "prepare pgrst(json) as $PGRST; execute pgrst('{\"label\": \"Danse\", \"normalized_label\": \"danse\", \"status\": \"pending\", \"user_id\": \"$G\"}');" > "$BASE/c2_$1.txt" ) &
  wait
  printf '%s|%s' "$(QD "$1" "select count(*) from public.passion_requests where user_id = '$G';")" \
    "$(cat "$BASE/c1_$1.txt" "$BASE/c2_$1.txt" | cut -c1-5 | sort | paste -sd',')"
}
verifier "concurrence : deux dépôts simultanés de la 5ᵉ — l'un passe, l'autre attend le verrou du compte puis est refusé ; cinq lignes" "5|42501,OK" "$(concurrence "$DB")"
# CONNEXION RESTÉE OUVERTE (VB-02) : le pool de PostgREST garde ses connexions.
fuite() {  # $1 base ; la 1ʳᵉ connexion reste OUVERTE 3 s après son commit ; rend la réponse du 2ᵉ dépôt du même compte, sur une autre connexion (lock_timeout 1 s)
  local r2
  ( psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -q -c "begin; $(PRE authenticated "$J") insert into public.passion_requests (user_id, label, normalized_label) values ('$J', 'Musique', 'musique'); commit; select pg_sleep(3);" > "$BASE/f1_$1.txt" 2>&1 ) &
  sleep 0.5
  r2="$(SOUS "$1" authenticated "$J" "set local lock_timeout = '1s'; insert into public.passion_requests (user_id, label, normalized_label) values ('$J', 'Photo', 'photo');")"
  wait
  printf '%s' "$r2"
}
verifier "connexion restée ouverte après son commit (VB-02) : le dépôt suivant du MÊME compte, sur une autre connexion, passe — le verrou est de TRANSACTION, il ne fuit pas d'un dépôt à l'autre" "OK" "$(fuite "$DB")"
# LA FENÊTRE DE 24 H (VB-01) : amorcée déclencheurs coupés, comme une restauration.
fenetre() {  # $1 base ; K : quatre demandes reculées de 23 h 30, une de 24 h 30 ; rend « la suivante|la 6ᵉ de la fenêtre »
  QD "$1" "begin; alter table public.passion_requests disable trigger user;
    insert into public.passion_requests (user_id, label, normalized_label, status, created_at)
      select '$K', l, lower(l), 'approved', now() - interval '23 hours 30 minutes' from unnest(array['Musique', 'Photo', 'Cuisine', 'Voyage']) l;
    insert into public.passion_requests (user_id, label, normalized_label, status, created_at)
      values ('$K', 'Danse', 'danse', 'approved', now() - interval '24 hours 30 minutes');
    alter table public.passion_requests enable trigger user; commit;" >/dev/null
  printf '%s|%s' "$(DEPOT "$1" authenticated "$K" "Yoga" "$K")" "$(DEPOT "$1" authenticated "$K" "Tricot" "$K")"
}
verifier "fenêtre de 24 h (VB-01) : quatre demandes à −23 h 30 comptent, une à −24 h 30 ne compte plus — la suivante passe, la 6ᵉ de la fenêtre est refusée" "OK|$REFUS_RLS" "$(fenetre "$DB")"
# DOUBLONS (SEC-01) : ON CONFLICT DO NOTHING n'écarte une ligne qu'APRÈS les déclencheurs BEFORE.
doublon() {  # $1 base ; rend « 1ʳᵉ|ignore-duplicates|PostgREST|rangée ?|demandes de C »
  local r1 r2 r3
  r1="$(DEPOT "$1" authenticated "$C" "Escalade" "$C")"
  SOUS "$1" authenticated "$C" "update public.user_passions set archived = true where user_id = '$C';" >/dev/null
  r2="$(SOUS "$1" authenticated "$C" "insert into public.passion_requests (user_id, label, normalized_label) values ('$C', 'Escalade', 'une autre forme') on conflict (user_id, normalized_label) do nothing;")"
  r3="$(DEPOT "$1" authenticated "$C" "Escalade" "$C")"
  printf '%s|%s|%s|%s|%s' "$r1" "$r2" "$r3" \
    "$(QD "$1" "select string_agg(archived::text, ',') from public.user_passions where user_id = '$C';")" \
    "$(QD "$1" "select count(*) from public.passion_requests where user_id = '$C';")"
}
verifier "doublon (SEC-01) : C dépose « Escalade » et la range ; redéposée sous ON CONFLICT DO NOTHING (ignore-duplicates, normalized_label de son choix) → 23505 AVANT tout effet (elle reste rangée) ; par la requête de PostgREST → 23505 ; une seule demande" \
  "OK|$REFUS_DOUBLON|$REFUS_DOUBLON|true|1" "$(doublon "$DB")"
# LA GARDE NE DÉPEND PLUS DE creer_passion (VB-03) : une dérive APRÈS application.
nouvelle_base derive
APPLIQUER derive "$MIGRATION" >/dev/null
QD derive "$DERIVE_CREER_PASSION" >/dev/null
different "dérive simulée APRÈS application : creer_passion n'exige plus de compte (auth_requise ôtée — son empreinte change)" \
  "${MD5_PROD["public.creer_passion(text,text,text[])"]}" "$(MD5_FONCTION 'public.creer_passion(text,text,text[])' derive)"
QD derive "insert into public.comptes_en_suppression (user_id, statut) values ('$V', 'en_cours');" >/dev/null
verifier "…un visiteur au nom d'un compte EN SUPPRESSION puis d'un compte ordinaire : deux refus de la GARDE, identiques — l'oracle ne rouvre pas (VB-03)" \
  "$REFUS_RLS|$REFUS_RLS|0" "$(DEPOT derive anon "" "Photo" "$V")|$(DEPOT derive anon "" "Photo" "$W")|$(QD derive "select count(*) from public.user_passions where user_id in ('$V', '$W');")"

echo "── ④ LE DÉCOR DU VERDICT NE LAISSE AUCUNE TRACE ─────────────────────"
verifier "aucune demande, passion rattachée, passion synthétique ni marqueur du verdict (quatre exécutions)" "0|0|0|0" \
  "$(Q "select (select count(*) from public.passion_requests where user_id like '00000000-0000-4000-8000-0000000042%') || '|' || (select count(*) from public.user_passions where user_id like '00000000-0000-4000-8000-0000000042%')
        || '|' || (select count(*) from public.passions where id like 'zz-verdict-pr-%') || '|' || (select count(*) from public.comptes_en_suppression where user_id like '00000000-0000-4000-8000-0000000042%');")"
{ echo "begin;"; sed -n '/^-- ── ③ LE COMPORTEMENT/,/^\$verdict\$;$/p' "$MIGRATION";
  echo "select 'role=' || current_user || '|sub=' || coalesce(current_setting('request.jwt.claim.sub', true), '') || '|mesure=' || (current_setting('passio.verdict_passion_requests', true) <> '') || '|verrous=' || (select count(*) from pg_locks where locktype = 'advisory' and pid = pg_backend_pid());";
  echo "rollback;"; } > "$SQLDIR/bloc3.sql"; chmod 644 "$SQLDIR/bloc3.sql"
verifier "le rôle et l'identité que le décor pose ne lui survivent pas, ni ses verrous consultatifs ; la mesure, si" "role=postgres|sub=|mesure=true|verrous=0" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -tA -q -v ON_ERROR_STOP=1 -f "$SQLDIR/bloc3.sql" 2>&1 | grep '^role=')"

echo "── ⑤ FERMÉ SUR ÉCHEC (SEC-04) : une base qui n'est pas celle que le correctif suppose, ou un comportement MESURÉ en échec → RIEN n'est appliqué ──"
# Chaque refus nomme ses lignes : celles du catalogue que la dérive touche, et
# celles du comportement qu'elle fait mentir (le décor a mesuré, ligne 1 OK).
deriver() {  # $1 nom, $2 SQL de la dérive (sous postgres, AVANT la migration), [$3 fichier] ; rend la sortie de l'application
  nouvelle_base "d_$1"
  QD "d_$1" "$2" >/dev/null
  APPLIQUER "d_$1" "${3:-$MIGRATION}" || true
}
refusee() {  # $1 libellé, $2 base, $3 sortie de l'application, $4 lignes attendues
  verifier "$1 : REFUSÉE (55000, lignes $4) — et la base est celle d'avant (WITH CHECK de production, aucune garde)" \
    "REFUSEE 55000 lignes $4|$INCHANGEE" "$(REFUS "$3")|$(ETAT "$2")"
}
s_d="$(deriver avant_aa "create function public.journal_demandes() returns trigger language plpgsql as \$\$ begin return new; end \$\$;
  create trigger a0_journal before insert on public.passion_requests for each row execute function public.journal_demandes();")"
refusee "D1 un déclencheur BEFORE INSERT trié AVANT « aa_ » (a0_journal)" d_avant_aa "$s_d" 19
s_d="$(deriver auto "$DERIVE_AUTO")"
refusee "D2 passion_request_auto_creer a changé (un commentaire)" d_auto "$s_d" 21
s_d="$(deriver creer "$DERIVE_CREER_PASSION")"
refusee "D3 creer_passion(text,text,text[]) a changé (auth_requise ôtée)" d_creer "$s_d" 21
s_d="$(deriver barriere "$DERIVE_BARRIERE")"
refusee "D4 la barrière de suppression a changé" d_barriere "$s_d" 21
s_d="$(deriver auto_coupe "alter table public.passion_requests disable trigger trg_passion_request_auto;")"
refusee "D5 trg_passion_request_auto désactivé (21) — et le comportement le dit : rien n'est résolu ni rattaché (4, 8)" d_auto_coupe "$s_d" "4,8,21"
s_d="$(deriver sans_rls "alter table public.passion_requests disable row level security;")"
refusee "D6 RLS désactivée sur passion_requests (22) — et chacun lit les demandes des autres (8, 13)" d_sans_rls "$s_d" "8,13,22"
s_d="$(deriver troisieme "create policy passion_requests_tout_lire on public.passion_requests for select using (true);")"
refusee "D7 une troisième policy sur passion_requests (18) — qui ouvre la lecture (8, 13)" d_troisieme "$s_d" "8,13,18"
verifier "…et la production refusée reste FERMÉE, comme avant (42P17) : rien n'est à moitié ouvert" "$RECURSION" "$(DEPOT d_avant_aa authenticated "$A" "Musique" "$A")"
s_d="$(deriver colonne "grant update (status) on public.passion_requests to authenticated;")"
verifier "D8 un droit de COLONNE (ligne 23, d'information) : la migration PASSE, seule la ligne 23 le dit" "APPLIQUEE|$(printf 'O%.0s' $(seq 1 22))E" \
  "$(REFUS "$s_d")|$(vecteur "$s_d")"
muter() {   # $1 nom, $2 texte à remplacer, $3 remplaçant, [$4 « tout »], [$5 « empreinte »], [$6 « sans_gardefou »] ; applique sur une base neuve ; rend la sortie
  python3 -I - "$MIGRATION" "$SQLDIR/m_$1.sql" "$2" "$3" "${4:-}" "${5:-}" "${6:-}" <<'PY'
import hashlib, re, sys
src, dst, avant, apres, tout, empreinte, sans_gardefou = sys.argv[1:8]
s = open(src, encoding="utf-8").read()
n = s.count(avant)
assert (n >= 1 if tout else n == 1), "mutation introuvable ou ambiguë : " + avant
s = s.replace(avant, apres)
if sans_gardefou:
    # Pour LIRE le comportement d'une garde mutée, appliquée : le garde-fou ⑤ ôté.
    d = s.index("-- ── ⑤ FERMÉ SUR ÉCHEC"); f = s.index("-- ── Verdict ──")
    s = s[:d] + s[f:]
if empreinte:
    # Comme le ferait un développeur : l'empreinte du NOUVEAU corps de la garde, recalculée.
    d = s.index("create or replace function public.passion_requests_garde()")
    a = s.index("as $fn$", d) + len("as $fn$")
    f = s.index("$fn$;", a)
    h = hashlib.md5(s[a:f].replace("\r\n", "\n").encode("utf-8")).hexdigest()
    s, k = re.subn(r"(md5\(replace\(p\.prosrc, chr\(13\) \|\| chr\(10\), chr\(10\)\)\) = ')[0-9a-f]{32}('\n +and p\.proacl is not null)",
                   lambda m: m.group(1) + h + m.group(2), s)
    assert k == 1, "empreinte de la garde introuvable"
open(dst, "w", encoding="utf-8").write(s)
PY
  chmod 644 "$SQLDIR/m_$1.sql"
  nouvelle_base "m_$1"
  APPLIQUER "m_$1" "$SQLDIR/m_$1.sql" || true
}
s_m="$(muter corps_seul "  if recentes >= 5 then" "  if recentes >= 6 then")"
refusee "F1 corps de la garde changé SANS son empreinte (20) — 6 au lieu de 5, que le comportement voit aussi (4 à 7)" m_corps_seul "$s_m" "4,5,6,7,20"
s_m="$(muter anon "revoke all on function public.passion_requests_garde() from public, anon, authenticated;" "revoke all on function public.passion_requests_garde() from public, anon, authenticated;
grant execute on function public.passion_requests_garde() to anon;")"
refusee "F2 garde exécutable par anon — hygiène des droits (VB-10 : une fonction de déclencheur ne s'appelle pas directement, 0A000)" m_anon "$s_m" 20
s_m="$(muter ordre "aa_passion_requests_garde" "zy_passion_requests_garde" tout)"
refusee "F3 garde APRÈS trg_passion_request_auto (renommée zy_ : 19) — elle voit « approved » et refuse tout dépôt conforme, l'oracle rouvre, le visiteur tombe sur creer_passion" \
  m_ordre "$s_m" "3,4,5,6,7,8,9,10,12,14,19"
s_m="$(muter recursion "  with check ((user_id = ((select auth.uid()))::text) and (not public.suppression_de_mon_compte()));" \
  "  with check (((user_id = (( SELECT auth.uid() AS uid))::text) AND (status = 'pending'::text) AND (resolved_passion_id IS NULL) AND (( SELECT count(*) AS count FROM public.passion_requests r WHERE ((r.user_id = (( SELECT auth.uid() AS uid))::text) AND (r.created_at > (now() - '24:00:00'::interval)))) < 5) AND (NOT public.suppression_de_mon_compte())));")"
refusee "F4 récursion remise (la WITH CHECK de production : 17) — tout dépôt mesuré lève 42P17 (2 à 14)" m_recursion "$s_m" "2,3,4,5,6,7,8,9,10,11,12,13,14,17"
s_m="$(muter barriere " and (not public.suppression_de_mon_compte()));" ");")"
refusee "F5 barrière de suppression ôtée de la policy" m_barriere "$s_m" 17
s_m="$(muter invoker "language plpgsql
security definer
set search_path to ''" "language plpgsql
security invoker
set search_path to ''")"
refusee "F6 garde en SECURITY INVOKER" m_invoker "$s_m" 20

echo "── ⑥ RETOUR ARRIÈRE : l'état exact d'avant, puis la migration rejouée ──"
PGOPTIONS="-c client_min_messages=warning" psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -X -q -v ON_ERROR_STOP=1 -f "$SQLDIR/retour.sql" >/dev/null
verifier "retour : passion_requests_insert_own se déparse À L'OCTET comme en production (md5)" "$MD5_WC_INSERT_PROD" "$(MD5_POLICY passion_requests_insert_own)"
verifier "retour : passion_requests_select_own aussi (elle n'a jamais bougé)" "$MD5_QUAL_SELECT_PROD" "$(MD5_POLICY passion_requests_select_own)"
verifier "retour : la garde et sa fonction sont parties ; les déclencheurs de production restent" "trg_passion_request_auto:7:O,zz_barriere_suppression:23:O|-" \
  "$(DECLENCHEURS)|$(MD5_FONCTION "public.passion_requests_garde()")"
verifier "retour : les droits de table sont ceux d'avant" "$DROITS_AVANT" "$(DROITS_TABLE)"
verifier "retour : les demandes déposées entre-temps restent (rien n'est effacé)" "5" "$(Q "select count(*) from public.passion_requests where user_id = '$A';")"
verifier "retour : le défaut est REVENU — c'est bien l'état d'avant (42P17)" "$RECURSION" "$(DEPOT "$DB" authenticated "$B" "Escalade" "$B")"
sortie3="$(APPLIQUER "$DB" "$MIGRATION")" || true
verifier "la migration se rejoue après un retour arrière : 23 OK, 0 ECHEC" "23/0" "$(compte_verdict "$sortie3")"

echo "── ⑦ MUTATIONS DE COMPORTEMENT — l'empreinte de la garde recalculée, comme le ferait un développeur : le verdict nomme EXACTEMENT les lignes qui les visent, et REFUSE ──"
vec_sauf() { local v="$TOUT_VERT" p; for p in "$@"; do v="${v:0:$((p-1))}E${v:$p}"; done; printf '%s' "$v"; }
# Une mutation de la garde, deux fois : avec le garde-fou (elle doit être REFUSÉE,
# lignes nommées, base intacte), puis sans lui (« _sg ») quand le banc doit voir
# la garde mutée À L'ŒUVRE.
M_LIMITE=("  if recentes >= 5 then" "  if false then")
M_HEURE=("  new.created_at       := pg_catalog.now();
" "")
M_PLI=("  new.normalized_label := public.passion_plier(new.label);
" "")
M_DOUBLON=("  if exists (select 1 from public.passion_requests r
              where r.user_id = moi and r.normalized_label = new.normalized_label) then
    raise exception 'duplicate key value violates unique constraint \"passion_requests_unique_par_personne\"'
      using errcode = '23505';
  end if;
" "")
M_PROPRIETAIRE=("  if new.user_id is distinct from moi
     or new.status" "  if new.status")
M_INTENTION=("     or new.status is distinct from 'pending'
     or new.resolved_passion_id is not null then" " then")
M_VISITEUR=("    if pg_catalog.current_setting('role', true) in ('anon', 'authenticated') then
      raise exception 'new row violates row-level security policy for table \"passion_requests\"'
        using errcode = '42501';
    end if;
" "")
M_GLOBAL=("   where r.user_id = moi
     and r.created_at > pg_catalog.now()" "   where r.created_at > pg_catalog.now()")
M_FENETRE25=("pg_catalog.now() - interval '24 hours';" "pg_catalog.now() - interval '25 hours';")
M_FENETRE1=("pg_catalog.now() - interval '24 hours';" "pg_catalog.now() - interval '1 hour';")
M_VERROU=("  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('passion_requests:' || moi));
" "")
M_SESSION=("pg_catalog.pg_advisory_xact_lock(" "pg_catalog.pg_advisory_lock(")

s_m="$(muter limite "${M_LIMITE[0]}" "${M_LIMITE[1]}" "" empreinte)"
refusee "M1 « limite retirée » : 4 (n = 5), 5 (la 6ᵉ), 6 (A n'est plus au plafond), 7 (la fenêtre)" m_limite "$s_m" "4,5,6,7"
s_m="$(muter heure "${M_HEURE[0]}" "${M_HEURE[1]}" "" empreinte)"
refusee "M2 « created_at du client gardé » : 4, 5, 6 (l'antidate vide la limite) et 10 (l'heure du serveur)" m_heure "$s_m" "4,5,6,10"
s_m="$(muter pli "${M_PLI[0]}" "${M_PLI[1]}" "" empreinte)"
refusee "M3 « normalized_label du client gardé » (SEC-02) : 8 (le doublon déguisé passe) et 9 (le pli du serveur)" m_pli "$s_m" "8,9"
s_m="$(muter doublon "${M_DOUBLON[0]}" "${M_DOUBLON[1]}" "" empreinte)"
refusee "M4 « doublon non refusé » (SEC-01) : 8 (ignore-duplicates : la passion ressort, sans demande)" m_doublon "$s_m" "8"
s_m="$(muter doublon_sg "${M_DOUBLON[0]}" "${M_DOUBLON[1]}" "" empreinte sans_gardefou)"
verifier "…sans garde-fou, le tableau ne rougit QUE la 8" "$(vec_sauf 8)" "$(vecteur "$s_m")"
verifier "…et le banc le voit aussi : sous ignore-duplicates le conflit « passe », la passion rangée ressort (archived = false)" \
  "OK|OK|$REFUS_DOUBLON|false|1" "$(doublon m_doublon_sg)"
s_m="$(muter proprietaire "${M_PROPRIETAIRE[0]}" "${M_PROPRIETAIRE[1]}" "" empreinte)"
refusee "M5 « le propriétaire n'est plus jugé par la garde » : 12 (aucun oracle) — la policy refuse encore, trop tard" m_proprietaire "$s_m" "12"
s_m="$(muter intention "${M_INTENTION[0]}" "${M_INTENTION[1]}" "" empreinte)"
refusee "M6 « statut et résolution non jugés » : 13" m_intention "$s_m" "13"
s_m="$(muter visiteur "${M_VISITEUR[0]}" "${M_VISITEUR[1]}" "" empreinte)"
refusee "M7 « le visiteur n'est plus refusé par la garde » : 14 (le refus vient alors de creer_passion : auth_requise)" m_visiteur "$s_m" "14"
s_m="$(muter visiteur_sg "${M_VISITEUR[0]}" "${M_VISITEUR[1]}" "" empreinte sans_gardefou)"
verifier "…sans garde-fou, le tableau ne rougit QUE la 14" "$(vec_sauf 14)" "$(vecteur "$s_m")"
QD m_visiteur_sg "$DERIVE_CREER_PASSION" >/dev/null
QD m_visiteur_sg "insert into public.comptes_en_suppression (user_id, statut) values ('$V', 'en_cours');" >/dev/null
verifier "…et si creer_passion dérivait ensuite, l'ORACLE rouvrirait pour un visiteur : « user_passions » pour le compte en suppression, « passion_requests » pour l'autre (la garde autonome l'empêche, § ③)" \
  "$REFUS_RLS_UP|$REFUS_RLS" "$(DEPOT m_visiteur_sg anon "" "Photo" "$V")|$(DEPOT m_visiteur_sg anon "" "Photo" "$W")"
s_m="$(muter global "${M_GLOBAL[0]}" "${M_GLOBAL[1]}" "" empreinte)"
refusee "M8 « comptage global » (VB-04) : 6 (quota PAR COMPTE), 7 et 8" m_global "$s_m" "6,7,8"
s_m="$(muter fenetre25 "${M_FENETRE25[0]}" "${M_FENETRE25[1]}" "" empreinte)"
refusee "M9 « fenêtre de 25 h » (VB-01) : 7" m_fenetre25 "$s_m" "7"
s_m="$(muter fenetre25_sg "${M_FENETRE25[0]}" "${M_FENETRE25[1]}" "" empreinte sans_gardefou)"
verifier "…et le banc le voit aussi, garde mutée appliquée : la demande à −24 h 30 compte, la suivante est déjà refusée" "$REFUS_RLS|$REFUS_RLS" "$(fenetre m_fenetre25_sg)"
s_m="$(muter fenetre1 "${M_FENETRE1[0]}" "${M_FENETRE1[1]}" "" empreinte)"
refusee "M10 « fenêtre d'une heure » : 7" m_fenetre1 "$s_m" "7"
s_m="$(muter fenetre1_sg "${M_FENETRE1[0]}" "${M_FENETRE1[1]}" "" empreinte sans_gardefou)"
verifier "…et le banc le voit aussi : les demandes à −23 h 30 ne comptent plus, la 6ᵉ passe" "OK|OK" "$(fenetre m_fenetre1_sg)"
s_m="$(muter verrou "${M_VERROU[0]}" "${M_VERROU[1]}" "" empreinte)"
verifier "M11 « verrou retiré » : le verdict, une seule session, NE LE VOIT PAS — la migration PASSE, 23 OK…" "APPLIQUEE|$TOUT_VERT" "$(REFUS "$s_m")|$(vecteur "$s_m")"
verifier "…le banc, si, par le COMPORTEMENT : deux dépôts simultanés de la 5ᵉ passent tous deux, SIX lignes" "6|OK,OK" "$(concurrence m_verrou)"
s_m="$(muter verrou_session "${M_SESSION[0]}" "${M_SESSION[1]}" "" empreinte)"
refusee "M12 « verrou de SESSION » (VB-02) : 15 (les verrous survivent au décor)" m_verrou_session "$s_m" "15"
s_m="$(muter verrou_session_sg "${M_SESSION[0]}" "${M_SESSION[1]}" "" empreinte sans_gardefou)"
contient "…et le banc le voit aussi, garde mutée appliquée : la connexion restée ouverte garde le verrou, le dépôt suivant du même compte attend puis tombe (55P03)" "^55P03" "$(fuite m_verrou_session_sg)"
s_m="$(muter decor_garde "    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';" "    null;")"
refusee "M13 « le décor n'est pas annulé » : 15 (ses verrous restent) et 16 (ses lignes restent)" m_decor_garde "$s_m" "15,16"
verifier "…et le refus emporte le décor avec lui : rien n'en est resté (passions synthétiques, demandes, marqueur)" "0|0|0" \
  "$(QD m_decor_garde "select (select count(*) from public.passions where id like 'zz-verdict-pr-%') || '|' || (select count(*) from public.passion_requests where user_id like '00000000-0000-4000-8000-0000000042%') || '|' || (select count(*) from public.comptes_en_suppression where user_id like '00000000-0000-4000-8000-0000000042%');")"
s_m="$(muter decor_garde_sg "    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';" "    null;" "" "" sans_gardefou)"
verifier "…alors que SANS garde-fou il serait VALIDÉ en base (8 passions synthétiques, 12 demandes, 1 marqueur) : le contrôle n'est pas décoratif" "8|12|1" \
  "$(QD m_decor_garde_sg "select (select count(*) from public.passions where id like 'zz-verdict-pr-%') || '|' || (select count(*) from public.passion_requests where user_id like '00000000-0000-4000-8000-0000000042%') || '|' || (select count(*) from public.comptes_en_suppression where user_id like '00000000-0000-4000-8000-0000000042%');")"
s_m="$(muter decor_casse "values (ids[i], lib[i], nor[i], 'active', 'curated');" "values (ids[i], lib[i], nor[i], 'active', 'inconnue');")"
verifier "M14 « le décor casse » (contrainte de production) : la mesure (1) et tout le comportement (2 à 14) ROUGISSENT — aucun OK sans mesure" "$(vec_sauf 1 2 3 4 5 6 7 8 9 10 11 12 13 14)" "$(vecteur "$s_m")"
verifier "…la ligne 1 dit la cause (23514)" "23514" "$(ligne "$s_m" 1 | grep -oE '23514' | head -1)"
verifier "…et la panne du décor ne BLOQUE pas (rien n'a été mesuré) : la migration est passée, garde en place, policy corrigée" "APPLIQUEE|1|t" \
  "$(REFUS "$s_m")|$(QD m_decor_casse "select count(*) from pg_trigger where tgname = 'aa_passion_requests_garde';")|$(QD m_decor_casse "select pg_get_expr(polwithcheck, polrelid) not like '%FROM%' from pg_policy where polname = 'passion_requests_insert_own';")"
s_m="$(muter decor_role "    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', a, true);" "    perform set_config('request.jwt.claim.sub', a, true);")"
verifier "M15 « décor hors rôle client » (VB-05) : la ligne 1 le DIT (A, C, K relevés sous postgres) — mesure non fiable, donc non bloquante —, et 8 rougit par effet de bord (postgres voit toutes les lignes)" \
  "APPLIQUEE|$(vec_sauf 1 8)" "$(REFUS "$s_m")|$(vecteur "$s_m")"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
