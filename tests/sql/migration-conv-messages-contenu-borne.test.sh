#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_conv_messages_contenu_borne_2026-11-07.sql
# (« jamais de base64 en base » devient une règle du serveur : 20 000 caractères
# au plus dans conv_messages.content, et jamais une data-URL dans l'`url` d'une
# enveloppe)
#
# PostgreSQL jetable. Socle = la PRODUCTION du 2026-11-08, après les lots de
# sécurité 1 à 3 de #753 (canal ① :
# pg_get_functiondef, pg_policies, pg_get_triggerdef, relacl, proacl ; fins de
# ligne CRLF ramenées à LF), CONTRÔLÉE PAR EMPREINTE en ⓪ — corps des fonctions
# du chemin d'écriture de conv_messages (md5 de prosrc) et empreintes des
# policies et des déclencheurs de conv_messages (celles du verdict, ligne 17).
# Les rôles de la production : `postgres` (qui bâtit le socle et applique la
# migration) n'est PAS superutilisateur, a BYPASSRLS, est membre (SET) d'anon,
# authenticated et service_role ; auth.uid() lit `request.jwt.claim.sub` PUIS
# `request.jwt.claims`.
#
#   ⓪ le socle est la production (empreintes)
#   ① AVANT (le défaut, ROUGE) : un membre écrit une enveloppe à data-URL, 300 000
#      caractères, une photo de 700 Ko en base64 — tout passe la borne du lot 2
#      (1 Mio), qui ne refuse qu'au-delà ; et il ne réécrit plus rien (la policy
#      d'UPDATE est retirée depuis le lot 2)
#   ② le verdict de la migration, réinjecté sur cet état, ROUGIT — et le
#      garde-fou refuse (55000) sans rien laisser
#   ③ l'application : fichier ; requête unique (le chemin de l'API de gestion,
#      `appliquer-migration.mjs`) ; fins de ligne CRLF (un poste Windows) —
#      17 OK et l'information ; puis le rejeu, identique
#   ④ APRÈS, hors verdict, requête par requête sous les rôles (comme PostgREST) :
#      la PIRE enveloppe de texte du client, recalculée comme `JSON.stringify` la
#      construit, passe ; le message d'erreur nomme la contrainte (ce que lit
#      `_motRefusContenu`) ; un refus ne renvoie pas la ligne (RLS) ; un autre
#      membre lit toujours ; service_role refusé, à l'insertion comme à l'UPDATE ;
#      la marge dite telle quelle
#   ⑤ une ligne déjà hors borne en base : la migration échoue (23514), rien
#      n'est appliqué
#   ⑥ VERROU : une transaction qui tient conv_messages fait échouer la migration
#      en 5 s (55P03), sans rien appliquer ; et une fois le verrou PRIS, une
#      attente qui suit (realtime.messages tenue ailleurs) ne le prolonge que de
#      200 ms — RÉINJECTION : sans cette seconde borne, plus de 12 s
#   ⑦ RETOUR ARRIÈRE : le catalogue de conv_messages revient à l'identique, le
#      trou se rouvre ; puis la migration se rejoue
#   ⑧ MUTATIONS : chaque correctif affaibli fait REFUSER la migration (fermée
#      sur échec) en nommant les lignes du verdict qui le gardent — et rien
#      n'est appliqué
#   ⑨ la barrière de l'outil (sa fonction pure, la commande refuse la CI) lit une
#      transaction et le PREREQUIS-CLIENT ; le client de #751 porte la chaîne
#
# CE QUE CE BANC NE PROUVE PAS, dit tel quel :
#   · la production est en PostgreSQL 17.6 ; ce banc tourne sur la version
#     installée (16 ici). Les empreintes des policies et des déclencheurs
#     (déparsage) sont identiques sur les deux — mesurées en production et ici,
#     en ⓪ ; la définition des contraintes est comparée blancs ramenés à un seul ;
#   · aucun PostgREST ni Realtime : leurs requêtes sont simulées (rôle,
#     `request.jwt.claims`) ; `realtime.send` est FACTICE (il écrit dans
#     realtime.messages et consigne la poussée) ;
#   · profiles, conversations, conv_members et blocks n'ont pas leurs policies
#     (le décor est posé sans session, et seules les fonctions SECURITY DEFINER
#     les lisent) ; conversations n'a pas sa clé étrangère vers passions ;
#   · des gardes des lots de sécurité sur ces tables, le banc rejoue celles que
#     le décor traverse (aa_conv_members_garde, trg_debit_compte,
#     trg_rate_limit de conversations, aa_ligne_bornee, aa_profiles_figes,
#     ab_debit_octets, les CHECK d'identifiant, de textes et de nom de compte) ;
#     pas trg_debit_maj ni trg_propager_identite (UPDATE de profils, que rien ici
#     ne fait), ni profiles_color_forme et profiles_emoji_forme (colonnes que le
#     décor laisse à leur défaut).
#
#   bash tests/sql/migration-conv-messages-contenu-borne.test.sh
#
# Prérequis : PostgreSQL 16+ (binaires serveur ; pg_input_is_valid), python3, node.
# Tourne en CI (« Bancs SQL non nommés », scripts/bancs-sql-restants.sh).
# Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_conv_messages_contenu_borne_2026-11-07.sql"
CLIENT="$RACINE/js/app-04-comments-shop.js"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v python3 >/dev/null || { echo "❌ python3 introuvable (mutations et enveloppes du banc)"; exit 1; }
command -v node >/dev/null || { echo "❌ node introuvable (barrière de l'outil d'application)"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

# ── Empreintes mesurées en production le 2026-11-08 (canal ①), APRÈS les lots ──
# de sécurité 1 à 3 (#753, appliqués le 07/11 à 16:49 UTC) : rate_limit_insert,
# suppression_de_mon_compte ont changé ; debit_compter, debit_octets_par_compte et
# les gardes des tables du décor sont nouveaux.
# Fonctions : md5(prosrc), CRLF → LF.
declare -A MD5_PROD=(
  ["auth.uid()"]=cdef18c69c4f4cbbced2eaf81e628b49
  ["public.blocage_entre(text,text)"]=ea5a3f4cb0a42c7bec89a509b697f960
  ["public.broadcast_conv_message_to_users()"]=5005a9173dd873d1d2db13ce9bdd7afd
  ["public.conv_1a1_bloquee(text)"]=e11c1f65048997f233cc9a4f9eabbb1a
  ["public.diffuser_ajout_membre()"]=e897ec03269346b97577bd14aa2008e5
  ["public.identifiants_figes()"]=283686cca23a670e2a00145a50561ce7
  ["public.is_blocked_with(text)"]=25b7ca8e81031951cb241316f7cfdd64
  ["public.is_conv_member(text,text)"]=814ad66c9ba408db34f3435b2a559788
  ["public.rate_limit_insert()"]=bde1063b111dde81f500a1c33d2a0aed
  ["public.debit_compter(text,text,integer)"]=a583c8701d380effbb9d94d2b9e20f31
  ["public.debit_octets_par_compte()"]=96bfbe987d9b7f8c81812b6e42600421
  ["public.debit_par_compte()"]=d4097ac615be8d08972ac2d2dc9fd8fd
  ["public.conv_members_garde()"]=4c505e05ccda0de4b4890a20c264271e
  ["public.profiles_figes()"]=58ac52a49dfc3e241404cf9571cd3003
  ["public.ligne_bornee()"]=d53795ba5c21bfb25f1f0ba571c03bee
  ["public.passion_plier(text)"]=2fa9a319ffd002fc0338e0e708cf54cb
  ["public.unaccent_immutable(text)"]=53459bf193d871ebce6ffdd86e3acbe5
  ["public.refuser_ecriture_compte_en_suppression()"]=8ea40f715280c2867524dab576ab32b8
  ["public.rid_opaque_garde()"]=4bf585c53ddb2b44e4b70a46e8b780cc
  ["public.suppression_de_mon_compte()"]=18b5fa41cbcdd4ee61c95766e4bc2957
)
# Policies et déclencheurs de conv_messages, `public.` ôté (la ligne 17 du verdict).
MD5_POLICIES_PROD=8bf26134d964e77fbb026cb835a55a36
MD5_DECLENCHEURS_PROD=fc9c5e6003124899df79751fe836488e

PORT=$(( 6300 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"
  SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"
  SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
VERROU_PID=""
nettoyer() {
  [ -n "$VERROU_PID" ] && kill "$VERROU_PID" >/dev/null 2>&1 || true
  lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"
}
trap nettoyer EXIT

lancer "initdb -D '$BASE/data' -A trust -U supabase_admin" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses= -c timezone=UTC\" -l '$BASE/pg.log' start" >/dev/null 2>&1
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

SQLDIR="$BASE/sql"; mkdir -p "$SQLDIR"; chmod 755 "$SQLDIR"

# ── Les helpers. Une sortie de psql n'est un succès que si psql l'a dit ──
QA() { psql -h "$BASE" -p "$PORT" -U supabase_admin -d "$1" -X -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
QD() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
# Une requête sous une identité CLIENTE, dans UNE transaction (ADR-012 : le rôle
# et sa requête partent ensemble). Rend la sortie, ou « ERREUR|<SQLSTATE>|<contrainte>|<message> »
# — le SQLSTATE et la contrainte sont LUS (VERBOSITY verbose), jamais devinés.
# `RLIGNE=1` ajoute « |DETAIL » si l'erreur renvoie la ligne refusée.
ROLE_SQL() {   # $1 base, $2 préambule de rôle, $3 requête
  # Un refus est une MESURE, pas une panne du banc : la sortie de psql est lue
  # telle quelle, son code de retour ne fait pas tomber `set -e`.
  local sortie
  sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -q -v VERBOSITY=verbose -c "begin; $2 $3 commit;" 2>&1 || true)"
  printf '%s' "$sortie" | python3 -c '
import re, sys
s = sys.stdin.read()
m = re.search(r"ERROR:\s+([0-9A-Z]{5}):\s*(.*)", s)
if not m:
    sys.stdout.write(s.strip()); sys.exit(0)
c = re.search(r"CONSTRAINT NAME:\s+(\S+)", s)
d = "|DETAIL" if re.search(r"DETAIL:\s+Failing row contains", s) else ""
sys.stdout.write("ERREUR|" + m.group(1) + "|" + (c.group(1) if c else "") + "|" + m.group(2).strip() + d)'
}
PRE() {
  case "$1" in
    authenticated) printf '%s' "set local role authenticated; set local request.jwt.claim.sub = '$2'; set local request.jwt.claims = '{\"sub\": \"$2\", \"role\": \"authenticated\"}';" ;;
    service_role)  printf '%s' "set local role service_role; set local request.jwt.claims = '{\"role\": \"service_role\"}';" ;;
    *)             printf '%s' "do \$\$ begin raise exception 'rôle inconnu du banc : $1'; end \$\$;" ;;
  esac
}
AUTH() { ROLE_SQL "$1" "$(PRE authenticated "$2")" "$3"; }      # $1 base, $2 sub, $3 requête
SERVICE() { ROLE_SQL "$1" "$(PRE service_role)" "$2"; }
# Applique un fichier à une base : rend le tableau de verdict, une ligne « contrôle§valeur ».
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -F '§' -q -v ON_ERROR_STOP=1 -f "$2" 2>&1; }
compte_verdict() { printf '%s/%s' "$(printf '%s\n' "$1" | grep -c '§OK$' || true)" "$(printf '%s\n' "$1" | grep -c '§ECHEC' || true)"; }
refusees() { printf '%s\n' "$1" | grep -oE 'Lignes en échec : [0-9,]+' | head -1 | sed 's/Lignes en échec : //'; }
contient_tous() {  # « oui » si chaque numéro de $2 (séparés par des virgules) est dans la liste $1
  python3 -c 'import sys; a=set(sys.argv[1].split(",")); b=set(x for x in sys.argv[2].split(",") if x); print("oui" if b <= a else "non")' "$1" "$2"
}
RETOUR_ARRIERE() { sed -n -e 's/^--| //p' -e 's/^--|$//p' "$MIGRATION"; }
VERDICT_SEUL() { awk '/^-- ── ③ LE COMPORTEMENT/{p=1} /^commit;$/{p=0} p' "$MIGRATION"; }
# Les contraintes de CETTE migration, et elles seules (les deux du lot de sécurité sont là avant, et restent).
CHECKS() { QD "$1" "select count(*) from pg_constraint where conrelid = 'public.conv_messages'::regclass and contype = 'c' and conname in ('conv_messages_content_len_check', 'conv_messages_content_url_data_check');"; }
# Le catalogue de conv_messages : colonnes, contraintes, policies, déclencheurs, droits, RLS, identité.
CATALOGUE() {
  QD "$1" "select md5(
    (select string_agg(attname || ':' || format_type(atttypid, atttypmod) || ':' || attnotnull, ',' order by attnum) from pg_attribute where attrelid = 'public.conv_messages'::regclass and attnum > 0 and not attisdropped)
    || '#' || coalesce((select string_agg(conname || ':' || pg_get_constraintdef(oid), ',' order by conname) from pg_constraint where conrelid = 'public.conv_messages'::regclass), '')
    || '#' || (select string_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), ',' order by policyname) from pg_policies where tablename = 'conv_messages')
    || '#' || (select string_agg(pg_get_triggerdef(oid), ',' order by tgname) from pg_trigger where tgrelid = 'public.conv_messages'::regclass and not tgisinternal)
    || '#' || (select relacl::text || relrowsecurity::text || relreplident::text from pg_class where oid = 'public.conv_messages'::regclass));"
}

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$(printf '%s' "$3" | head -c 600)"; fi; }
# ⚠️ Jamais `printf | grep -q` : sous `pipefail`, grep qui sort au premier motif
# fait échouer printf (SIGPIPE) et le test rougit sur un texte qui CONTIENT le motif.
contient() { if grep -qF -- "$2" <<< "$3"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu (fragment) : %s\n     obtenu : %s\n' "$1" "$2" "$(printf '%s' "$3" | tail -3 | head -c 600)"; fi; }

A=11111111-1111-4111-8111-111111111111   # membre, écrit
B=22222222-2222-4222-8222-222222222222   # l'autre membre
S=33333333-3333-4333-8333-333333333333   # auteur des messages déjà en base
C1=conv_banc_cmb_1; C0=conv_banc_cmb_0

# ── LES RÔLES DE LA PRODUCTION ──────────────────────────────────────────────
psql -h "$BASE" -p "$PORT" -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role postgres login nosuperuser bypassrls createrole createdb inherit;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant anon, authenticated, service_role to postgres with admin true, inherit true, set true;
alter role postgres set search_path to "$user", public, extensions;
create database socle owner postgres;
SQL

# ── LE SOCLE : la production du 2026-11-07, bâtie par `postgres` ────────────
# (`client_min_messages` : la publication avertit que `wal_level` n'est pas
# logique — ce banc ne décode pas le WAL, l'avertissement n'apprend rien.)
PGOPTIONS='-c client_min_messages=error' psql -h "$BASE" -p "$PORT" -U postgres -d socle -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema auth;
create schema realtime;
create schema banc;
grant usage on schema public, auth, realtime to anon, authenticated, service_role;
-- Les droits par défaut du projet (pg_default_acl, propriétaire postgres, schéma
-- public) : toute fonction neuve est exécutable par anon, authenticated,
-- service_role — et PUBLIC.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- ⚠️ « select » est suivi d'un ESPACE en fin de ligne : c'est le corps de
-- production, à l'octet (l'empreinte de ⓪ le vérifie) — un éditeur qui ôte les
-- blancs de fin de ligne fait rougir ⓪, et c'est voulu.
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
grant execute on function auth.uid() to anon, authenticated, service_role;

-- ── Tables (colonnes de production, 2026-11-07) ──
create table public.profiles (id text primary key, username text not null, emoji text default '✨', color text default '#8b5cf6',
  passion_id text, bio text, created_at timestamp default now(), avatar_url text, cover_url text, passions jsonb default '[]'::jsonb,
  is_private boolean not null default false, rs_links jsonb);
create table public.conversations (id text primary key, is_group boolean default false, group_name text, passion_id text,
  created_by text, created_at timestamp default now(), description text);
create table public.conv_members (conv_id text not null references public.conversations(id), user_id text not null references public.profiles(id),
  rid bigint not null default (((('x'::text || substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 17, 16)))::bit(64))::bigint & '9007199254740991'::bigint),
  primary key (conv_id, user_id));
create table public.conv_messages (id text not null primary key, conv_id text references public.conversations(id), from_id text references public.profiles(id),
  content text, created_at timestamp default now());
create table public.blocks (blocker_id text not null, blocked_id text not null, created_at timestamptz default now(), primary key (blocker_id, blocked_id));
create table public.comptes_en_suppression (user_id text primary key, statut text not null default 'en_cours');
-- Lue par suppression_de_mon_compte (lots de sécurité : compte suspendu).
create table auth.users (id uuid primary key, banned_until timestamptz);
-- Les compteurs de débit des lots de sécurité (debit_compter, debit_octets_par_compte).
create table public.debit_ecritures (minute timestamptz not null, table_nom text not null, source text not null, n integer not null,
  primary key (minute, table_nom, source));
create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text not null, extension text not null default 'broadcast',
  payload jsonb, event text, private boolean default false, inserted_at timestamp not null default now());
-- Ce que la base a POUSSÉ (realtime.send factice) : une ligne par poussée.
create table banc.poussees (topic text, event text, quand timestamptz default clock_timestamp());

-- Droits de table (relacl de production, 2026-11-07).
revoke all on public.profiles, public.conversations, public.conv_members, public.conv_messages, public.blocks,
  public.comptes_en_suppression from anon, authenticated, service_role;
grant select, insert, update, delete on public.profiles, public.blocks to anon, authenticated;
grant select, update, delete on public.conversations, public.conv_members, public.conv_messages to anon;
grant select, insert, update, delete on public.conversations, public.conv_members, public.conv_messages to authenticated;
grant all on public.profiles, public.conversations, public.conv_members, public.conv_messages, public.blocks to service_role;
grant select on public.comptes_en_suppression to service_role;
revoke all on public.debit_ecritures from anon, authenticated, service_role;
grant all on public.debit_ecritures to service_role;
grant select, insert, update on realtime.messages to anon, authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conv_members enable row level security;
alter table public.conv_messages enable row level security;
alter table public.blocks enable row level security;
alter table public.comptes_en_suppression enable row level security;
alter table public.debit_ecritures enable row level security;
alter table realtime.messages enable row level security;

-- ── Fonctions : définitions de PRODUCTION (pg_get_functiondef, 2026-11-07 ; CRLF → LF) ──
-- realtime.send FACTICE : la forme de production (topic posé en local, ligne dans
-- realtime.messages, une panne n'est qu'un avertissement), et la poussée consignée.
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language plpgsql as $fn$
begin
  begin
    execute format('SET LOCAL realtime.topic TO %L', topic);
    insert into realtime.messages (payload, event, topic, private, extension) values (payload, event, topic, private, 'broadcast');
    insert into banc.poussees (topic, event) values (topic, event);
  exception when others then
    raise warning 'WarnSendingBroadcastMessage: %', sqlerrm;
  end;
end $fn$;
CREATE OR REPLACE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$function$;

create or replace function public.is_conv_member(_conv_id text, _uid text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  -- C-02 / R41 (2026-11-06) : avec une session, l'appartenance ne se lit que
  -- sur l'appelant ; sans session (postgres, service_role, déclencheur hors
  -- requête cliente), inchangée. L'appelant est contrôlé AVANT la lecture : sur
  -- autrui, conv_members n'est pas lu ; et l'égalité vient en tête : les
  -- policies, qui passent l'appelant, n'évaluent auth.uid() qu'une fois.
  -- migrations/migration_discussions_activite_2026-11-06.sql
  select (_uid = (auth.uid())::text or auth.uid() is null)
     and exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid)
$fn$;
CREATE OR REPLACE FUNCTION public.is_blocked_with(_other text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL
      OR _other IS NULL
      OR _other = (auth.uid())::text
      THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.blocks b
       WHERE (b.blocker_id = (auth.uid())::text AND b.blocked_id = _other)
          OR (b.blocker_id = _other AND b.blocked_id = (auth.uid())::text)
    )
  END
$function$;
CREATE OR REPLACE FUNCTION public.conv_1a1_bloquee(_conv_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.conv_members m
    join public.conversations c on c.id = m.conv_id
    where m.conv_id = _conv_id
      and coalesce(c.is_group, false) = false
      and m.user_id <> (select auth.uid())::text
      and public.is_blocked_with(m.user_id));
$function$;
CREATE OR REPLACE FUNCTION public.blocage_entre(_a text, _b text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when _a is null or _b is null or _a = _b then false
    else exists (
      select 1 from public.blocks b
       where (b.blocker_id = _a and b.blocked_id = _b)
          or (b.blocker_id = _b and b.blocked_id = _a)
    )
  end
$function$;
CREATE OR REPLACE FUNCTION public.suppression_de_mon_compte()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when auth.uid() is null then false
    else exists (select 1 from public.comptes_en_suppression c
                  where c.user_id = (auth.uid())::text and c.statut in ('en_cours','purgee','supprimee'))
      or exists (select 1 from auth.users u
                  where u.id = auth.uid() and u.banned_until is not null and u.banned_until > now())
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
CREATE OR REPLACE FUNCTION public.diffuser_ajout_membre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.user_id is null
     or new.user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object(
        'table', 'conv_members',
        'operation', 'INSERT',
        'record', jsonb_build_object('conv_id', new.conv_id, 'user_id', new.user_id)
      ),
      'conv_members:INSERT',
      'user:' || new.user_id,
      true
    );
  exception when others then
    raise warning 'diffuser_ajout_membre : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION public.rid_opaque_garde()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- `rid` n'appartient qu'à la base. Un INSERT reçoit TOUJOURS une valeur
  -- aléatoire neuve — l'expression du défaut de colonne, recopiée : une valeur
  -- fournie par l'appelant (client, upsert, PostgREST) est ignorée, aucun
  -- appelant ne connaît le rid d'une ligne qu'il ne lit pas. Un UPDATE ne le
  -- change jamais.
  if tg_op = 'INSERT' then
    new.rid := (('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991);
  else
    new.rid := old.rid;
  end if;
  return new;
end
$function$;
CREATE OR REPLACE FUNCTION public.rate_limit_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare user_col text := TG_ARGV[0]; max_per_min int := TG_ARGV[1]::int; uid text;
begin
  NEW.created_at := now();
  execute format('select ($1).%I', user_col) into uid using NEW;
  if uid is null then return NEW; end if;
  perform public.debit_compter(TG_TABLE_NAME, uid, max_per_min);
  return NEW;
end $function$;
CREATE OR REPLACE FUNCTION public.debit_compter(p_table text, p_source text, p_plafond integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v integer;
begin
  insert into public.debit_ecritures as d (minute, table_nom, source, n)
  values (date_trunc('minute', now()), p_table, p_source, 1)
  on conflict (minute, table_nom, source) do update set n = d.n + 1
  returning d.n into v;
  if v > p_plafond then
    raise exception 'rate limit: max % insertions/minute sur %', p_plafond, p_table using errcode = 'P0001';
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.debit_octets_par_compte()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare moi text := (auth.uid())::text; v integer;
begin
  if moi is null then return new; end if;
  insert into public.debit_ecritures as d (minute, table_nom, source, n)
  values (pg_catalog.date_trunc('minute', pg_catalog.now()), 'octets', moi, pg_catalog.octet_length(pg_catalog.to_jsonb(new)::text))
  on conflict (minute, table_nom, source) do update set n = d.n + excluded.n
  returning d.n into v;
  if v > tg_argv[0]::integer then
    raise exception 'trop de données écrites en une minute' using errcode = 'P0001';
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.debit_par_compte()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare moi text := (auth.uid())::text;
begin
  if moi is null then return new; end if;
  perform public.debit_compter(tg_table_name, moi, tg_argv[0]::int);
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.conv_members_garde()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare moi text := (auth.uid())::text; c record; autres integer;
begin
  if moi is null then return new; end if;              -- service_role, purge, restauration
  select id, is_group, created_by into c from public.conversations where id = new.conv_id;
  if not found or c.created_by is distinct from moi then return new; end if;  -- FK et RLS tranchent
  perform 1 from public.conversations where id = new.conv_id for update;      -- ajouts concurrents
  select count(*) into autres from public.conv_members m
   where m.conv_id = new.conv_id and m.user_id <> new.user_id;
  if coalesce(c.is_group, false) then
    if left(c.id, 6) <> 'evgrp_' and autres >= 256 then
      raise exception 'new row violates row-level security policy for table "conv_members"'
        using errcode = '42501', hint = 'groupe complet';
    end if;
    return new;
  end if;
  if autres >= 2 or (new.user_id <> moi and not exists (
        select 1 from public.conv_members m where m.conv_id = new.conv_id and m.user_id = moi)) then
    raise exception 'new row violates row-level security policy for table "conv_members"'
      using errcode = '42501', hint = 'conversation privée : deux membres, créateur compris';
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.profiles_figes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then new.created_at := now();
  else new.created_at := old.created_at; new.id := old.id;
  end if;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.ligne_bornee()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if pg_catalog.current_setting('role', true) in ('anon', 'authenticated')
     and pg_catalog.octet_length(pg_catalog.to_jsonb(new)::text) > tg_argv[0]::integer then
    raise exception 'ligne trop volumineuse sur %', tg_table_name using errcode = '22001';
  end if;
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
CREATE OR REPLACE FUNCTION public.identifiants_figes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare col text; avant text; apres text;
begin
  foreach col in array TG_ARGV loop
    execute format('select ($1).%I::text, ($2).%I::text', col, col) into avant, apres using old, new;
    if avant is distinct from apres then
      raise exception '% : la colonne % ne se modifie pas', TG_TABLE_NAME, col using errcode = '42501';
    end if;
  end loop;
  return new;
end $function$;
CREATE OR REPLACE FUNCTION public.broadcast_conv_message_to_users()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'realtime'
AS $function$
DECLARE
  m RECORD;
BEGIN
  FOR m IN SELECT user_id FROM public.conv_members WHERE conv_id = NEW.conv_id LOOP
    -- ⚠️ LE COUPLE EXPLICITE (auteur, destinataire), et aucun état de session :
    -- voir l'en-tête pour ce que l'autre aide perd sur les chemins serveur.
    IF NOT public.blocage_entre(NEW.from_id, m.user_id) THEN
      PERFORM realtime.broadcast_changes(
        'user:' || m.user_id,
        TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Les droits d'EXÉCUTION mesurés (proacl, 2026-11-07).
revoke all on function public.is_conv_member(text, text), public.is_blocked_with(text), public.conv_1a1_bloquee(text) from public, anon;
revoke all on function public.blocage_entre(text, text), public.broadcast_conv_message_to_users(), public.diffuser_ajout_membre(),
  public.rid_opaque_garde(), public.refuser_ecriture_compte_en_suppression(), public.rate_limit_insert(),
  public.identifiants_figes() from public, anon, authenticated;
revoke all on function public.suppression_de_mon_compte() from public;
revoke all on function public.debit_compter(text, text, integer), public.debit_octets_par_compte(), public.debit_par_compte(),
  public.conv_members_garde(), public.profiles_figes(), public.ligne_bornee() from public, anon, authenticated;
revoke all on function public.passion_plier(text) from public, anon;

-- ── Policies de conv_messages : textes de PRODUCTION (pg_policies, 2026-11-07) ──
create policy "Suppression propre" on public.conv_messages for delete
  using (from_id = ((select auth.uid()))::text);
create policy conv_messages_insert_member on public.conv_messages for insert to authenticated
  with check ((from_id = ((select auth.uid()))::text) and public.is_conv_member(conv_id, ((select auth.uid()))::text)
              and (not public.conv_1a1_bloquee(conv_id)) and (not public.suppression_de_mon_compte()));
create policy conv_messages_select_member on public.conv_messages for select to authenticated
  using (public.is_conv_member(conv_id, ((select auth.uid()))::text) and (not public.is_blocked_with(from_id)));

-- ── Déclencheurs (pg_get_triggerdef, 2026-11-07) ──
create trigger broadcast_conv_message_users_trigger after insert on public.conv_messages
  for each row execute function public.broadcast_conv_message_to_users();
create trigger trg_identifiants_figes before update on public.conv_messages
  for each row execute function public.identifiants_figes('conv_id', 'from_id');
create trigger trg_rate_limit before insert on public.conv_messages
  for each row execute function public.rate_limit_insert('from_id', '60');
create trigger zz_barriere_suppression before insert or update on public.conv_messages
  for each row execute function public.refuser_ecriture_compte_en_suppression('from_id');
create trigger trg_diffuser_ajout_membre after insert on public.conv_members
  for each row execute function public.diffuser_ajout_membre();
create trigger trg_rid_opaque before insert or update of rid on public.conv_members
  for each row execute function public.rid_opaque_garde();
create trigger zz_barriere_suppression before insert or update on public.conv_members
  for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');
create trigger zz_barriere_suppression before insert or update on public.profiles
  for each row execute function public.refuser_ecriture_compte_en_suppression('id');
-- Lots de sécurité 1 à 3 (canal ①, 08/11).
create trigger ab_debit_octets before insert or update on public.conv_messages
  for each row execute function public.debit_octets_par_compte('4194304');
create trigger aa_conv_members_garde before insert on public.conv_members
  for each row execute function public.conv_members_garde();
create trigger trg_debit_compte before insert on public.conv_members
  for each row execute function public.debit_par_compte('60');
create trigger trg_rate_limit before insert on public.conversations
  for each row execute function public.rate_limit_insert('created_by', '10');
create trigger aa_ligne_bornee before insert or update on public.profiles
  for each row execute function public.ligne_bornee('262144');
create trigger aa_profiles_figes before insert or update on public.profiles
  for each row execute function public.profiles_figes();
create trigger ab_debit_octets before insert or update on public.profiles
  for each row execute function public.debit_octets_par_compte('4194304');
alter table public.conv_messages
  add constraint conv_messages_id_forme check (id ~ '^[A-Za-z0-9_-]{1,120}$'::text),
  add constraint conv_messages_content_borne check (octet_length(content) <= 1048576);
alter table public.conversations
  add constraint conversations_id_forme check (id ~ '^[A-Za-z0-9_-]{1,120}$'::text),
  add constraint conversations_textes_bornes check ((char_length(group_name) <= 200) and (char_length(description) <= 2000));
alter table public.profiles
  add constraint profiles_bio_borne check (char_length(bio) <= 1000),
  add constraint profiles_urls_forme check (((avatar_url is null) or (avatar_url ~ '^(https://|data:image/)'::text))
                                            and ((cover_url is null) or (cover_url ~ '^(https://|data:image/)'::text))),
  add constraint profiles_username_forme check (((char_length(username) >= 1) and (char_length(username) <= 40))
      and (username !~ '[[:cntrl:]]'::text)
      and (public.passion_plier(username) !~ '\m(passio|moderation|moderateur|administrateur|admin|support|securite)\M'::text));

create publication supabase_realtime for table public.conv_messages;
SQL

# Le décor du banc (hors verdict) et trois messages DÉJÀ en base, de la forme de
# ceux de production (enveloppes JSON de 230 à 550 caractères).
QD socle "
insert into public.profiles (id, username) values ('$A', 'banc_a'), ('$B', 'banc_b'), ('$S', 'banc_s');
insert into public.conversations (id, is_group, created_by) values ('$C1', false, '$A'), ('$C0', false, '$S');
insert into public.conv_members (conv_id, user_id) values ('$C1', '$A'), ('$C1', '$B'), ('$C0', '$S'), ('$C0', '$B');
insert into public.conv_messages (id, conv_id, from_id, content) values
  ('msg_banc_t', '$C0', '$S', '{\"type\":\"text\",\"text\":\"Salut, on se voit samedi ?\",\"sp\":{\"n\":\"banc_s\",\"e\":\"✨\",\"c\":\"#8b5cf6\",\"pid\":\"p_banc\",\"ph\":\"https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/banc/s.jpg\"}}'),
  ('msg_banc_g', '$C0', '$S', '{\"type\":\"gif\",\"url\":\"https://media.tenor.com/bancbancbanc/tenor.gif\",\"text\":\"🎬 GIF\",\"sp\":{\"n\":\"banc_s\",\"e\":\"✨\",\"c\":\"#8b5cf6\",\"pid\":\"p_banc\",\"ph\":null}}'),
  ('msg_banc_m', '$C0', '$S', '{\"type\":\"media\",\"filename\":\"IMG_20261012_181502.jpg\",\"fileType\":\"image/jpeg\",\"url\":\"https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/attachments/attachments/$C0/1760285702000_k3j2h1g0f_IMG_20261012_181502.jpg\",\"text\":\"[MEDIA] IMG_20261012_181502.jpg\",\"sp\":{\"n\":\"banc_s\",\"e\":\"✨\",\"c\":\"#8b5cf6\",\"pid\":\"p_banc\",\"ph\":\"https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/banc/s.jpg\"}}');
" >/dev/null
COPIE() { QA postgres "create database $1 template socle owner postgres;" >/dev/null; }

# ═══ ⓪ LE SOCLE EST LA PRODUCTION ═══════════════════════════════════════════
echo "⓪ le socle est la production du 2026-11-07 (empreintes)"
for f in "${!MD5_PROD[@]}"; do
  verifier "corps de $f" "${MD5_PROD[$f]}" \
    "$(QD socle "select coalesce((select md5(replace(prosrc, chr(13) || chr(10), chr(10))) from pg_proc where oid = to_regprocedure('$f')), 'absente');")"
done
verifier "policies de conv_messages (pg_policies, \`public.\` ôté)" "$MD5_POLICIES_PROD" \
  "$(QD socle "select md5(string_agg(policyname || '|' || cmd || '|' || permissive || '|' || array_to_string(roles, ',') || '|' || replace(coalesce(qual, ''), 'public.', '') || '|' || replace(coalesce(with_check, ''), 'public.', ''), '#' order by policyname)) from pg_policies where schemaname = 'public' and tablename = 'conv_messages';")"
verifier "déclencheurs de conv_messages (pg_get_triggerdef, \`public.\` ôté)" "$MD5_DECLENCHEURS_PROD" \
  "$(QD socle "select md5(string_agg(replace(pg_get_triggerdef(t.oid), 'public.', '') || '|' || t.tgenabled::text, '#' order by t.tgname)) from pg_trigger t where t.tgrelid = 'public.conv_messages'::regclass and not t.tgisinternal;")"
verifier "aucune contrainte de cette migration sur conv_messages (l'état mesuré)" "0" "$(CHECKS socle)"
verifier "…mais les deux du lot de sécurité, à la définition de la production" \
  "conv_messages_content_borne:CHECK ((octet_length(content) <= 1048576))|conv_messages_id_forme:CHECK ((id ~ '^[A-Za-z0-9_-]{1,120}\$'::text))" \
  "$(QD socle "select string_agg(conname || ':' || pg_get_constraintdef(oid), '|' order by conname) from pg_constraint where conrelid = 'public.conv_messages'::regclass and contype = 'c';")"
verifier "le décor du banc : un membre écrit un message ordinaire sous son rôle" "1" \
  "$(AUTH socle "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_banc_0', '$C1', '$A', '{\"type\":\"text\",\"text\":\"ok\"}') returning 1;")"
QD socle "delete from public.conv_messages where id = 'msg_banc_0'; delete from realtime.messages; delete from banc.poussees;" >/dev/null
CATALOGUE_AVANT="$(CATALOGUE socle)"

# ═══ ① AVANT : LE DÉFAUT ═════════════════════════════════════════════════════
echo "① AVANT (le défaut) : rien ne borne le contenu"
COPIE avant
PHOTO="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
verifier "un membre écrit une enveloppe média à data-URL — ACCEPTÉE" "1" \
  "$(AUTH avant "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_av_d', '$C1', '$A', '{\"type\":\"media\",\"url\":\"data:image/png;base64,$PHOTO\",\"text\":\"[MEDIA] p.png\"}') returning 1;")"
verifier "…300 000 caractères — ACCEPTÉS" "1" \
  "$(AUTH avant "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_av_l', '$C1', '$A', repeat('A', 300000)) returning 1;")"
verifier "…et une photo d'environ 700 Ko en base64 : la borne du lot 2 (1 Mio en octets) la laisse passer — ACCEPTÉE" "1" \
  "$(AUTH avant "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_av_p', '$C1', '$A', '{\"type\":\"media\",\"url\":\"data:image/jpeg;base64,' || repeat('A', 700000) || '\"}') returning 1;")"
verifier "…au-delà de 1 Mio, le lot 2 refuse (23514, conv_messages_content_borne)" "ERREUR|23514|conv_messages_content_borne" \
  "$(AUTH avant "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_av_g', '$C1', '$A', repeat('A', 1048577)) returning 1;" | cut -d'|' -f1-3)"
verifier "…et l'auteur ne réécrit plus son message : aucune policy d'UPDATE depuis le lot 2 (0 ligne)" "" \
  "$(AUTH avant "$A" "update public.conv_messages set content = '{\"type\":\"text\",\"text\":\"x\"}' where id = 'msg_av_l' returning 1;")"

# ═══ ② LE VERDICT RÉINJECTÉ SUR L'ÉTAT D'AVANT ═════════════════════════════
echo "② le verdict, sans les contraintes, rougit — et le garde-fou refuse"
{ echo "begin;"; VERDICT_SEUL; echo "commit;"; } > "$SQLDIR/verdict_seul.sql"
chmod 644 "$SQLDIR/verdict_seul.sql"
v_avant="$(APPLIQUER avant "$SQLDIR/verdict_seul.sql" || true)"
contient "refus fermé (55000), rien n'est appliqué" "object_not_in_prerequisite_state" "$(psql -h "$BASE" -p "$PORT" -U postgres -d avant -X -tA -q -v VERBOSITY=verbose -v ON_ERROR_STOP=1 -f "$SQLDIR/verdict_seul.sql" 2>&1 | sed -n 's/.*ERROR:  55000.*/object_not_in_prerequisite_state/p' | head -1)"
verifier "lignes nommées : les refus (6 à 12) et les contraintes (14 à 16)" "oui" "$(contient_tous "$(refusees "$v_avant")" "6,7,8,9,10,11,12,14,15,16")"
verifier "…mais pas la mesure, l'acceptation des enveloppes du client, ni l'absence de reste (1 à 5, 13)" "oui" \
  "$(python3 -c 'import sys; a=set(sys.argv[1].split(",")); print("oui" if not (a & {"1","2","3","4","5","13"}) else "non")' "$(refusees "$v_avant")")"
verifier "aucune trace du verdict refusé (décor, poussées)" "0|0" \
  "$(QD avant "select (select count(*) from public.profiles where id like '00000000-0000-4000-8000-00000000cb0_') || '|' || (select count(*) from realtime.messages where topic like 'user:00000000-0000-4000-8000-00000000cb0_');")"

# ═══ ③ L'APPLICATION ═════════════════════════════════════════════════════════
echo "③ l'application : fichier, requête unique, CRLF — puis le rejeu"
COPIE apres
v1="$(APPLIQUER apres "$MIGRATION" || true)"
verifier "fichier : 17 OK, 0 ECHEC" "17/0" "$(compte_verdict "$v1")"
contient "l'information : 3 messages déjà en base, aucune enveloppe à data-URL" "§3 ; " "$v1"
contient "…0 enveloppe à data-URL" " ; 0" "$(printf '%s\n' "$v1" | grep '^information')"
verifier "les deux contraintes sont posées" "2" "$(CHECKS apres)"
v2="$(APPLIQUER apres "$MIGRATION" || true)"
verifier "rejeu : 17 OK, 0 ECHEC" "17/0" "$(compte_verdict "$v2")"
verifier "rejeu : toujours deux contraintes, pas quatre" "2" "$(CHECKS apres)"
COPIE api
cp "$MIGRATION" "$SQLDIR/requete_unique.sql"; chmod 644 "$SQLDIR/requete_unique.sql"
r_api="$(psql -h "$BASE" -p "$PORT" -U postgres -d api -X -tA -q -v ON_ERROR_STOP=1 -c "$(cat "$SQLDIR/requete_unique.sql")" 2>&1 || true)"
verifier "requête unique (le chemin de l'API de gestion) : validée, deux contraintes" "2" "$(CHECKS api)"
COPIE crlf
sed 's/$/\r/' "$MIGRATION" > "$SQLDIR/crlf.sql"; chmod 644 "$SQLDIR/crlf.sql"
v_crlf="$(APPLIQUER crlf "$SQLDIR/crlf.sql" || true)"
verifier "fins de ligne CRLF (un poste Windows) : 17 OK" "17/0" "$(compte_verdict "$v_crlf")"

# ═══ ④ APRÈS, HORS VERDICT, REQUÊTE PAR REQUÊTE ══════════════════════════════
echo "④ après : sous les rôles, requête par requête (comme PostgREST)"
# La PIRE enveloppe de texte du client, construite comme `JSON.stringify` la construit
# (sendMessageFp : `_withSenderMeta(txt)` puis `rt` ; MSG_TEXTE_MAX = 5 000 ; nom de 40,
# photo https ; aperçu de réponse de 80) — et son pendant de caractères de contrôle.
python3 - "$SQLDIR" <<'PY'
import json, sys
d = sys.argv[1]
def env(texte):
    sp = {"n": '"' * 40, "e": "✨", "c": "#8b5cf6", "pid": "p_" + "y" * 30,
          "ph": "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/" + "p" * 400 + ".jpg"}
    o = {"type": "text", "text": texte, "sp": sp, "rt": {"id": "msg_" + "x" * 40, "t": "\\" * 80, "n": '"' * 40}}
    return json.dumps(o, separators=(",", ":"), ensure_ascii=False)
for nom, texte in (("pire", '"' * 5000), ("controle", "\u0001" * 5000)):
    s = env(texte)
    open(f"{d}/{nom}.txt", "w", encoding="utf-8").write(s)
    open(f"{d}/{nom}.len", "w").write(str(len(s)))
PY
chmod 644 "$SQLDIR"/*.txt
pire_len="$(cat "$SQLDIR/pire.len")"; ctrl_len="$(cat "$SQLDIR/controle.len")"
lit_fichier() { python3 -c 'import sys; s=open(sys.argv[1], encoding="utf-8").read(); print("$fichier$" + s + "$fichier$")' "$1"; }
verifier "la PIRE enveloppe de texte du client ($pire_len caractères) passe, sous le rôle client" "1" \
  "$(AUTH apres "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_ap_pire', '$C1', '$A', $(lit_fichier "$SQLDIR/pire.txt")) returning 1;")"
verifier "…et elle reste sous 11 000 caractères (la marge annoncée dans l'en-tête et dans le client)" "oui" \
  "$([ "$pire_len" -lt 11000 ] && echo oui || echo "non ($pire_len)")"
r_ctrl="$(AUTH apres "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_ap_ctrl', '$C1', '$A', $(lit_fichier "$SQLDIR/controle.txt")) returning 1;")"
verifier "la marge, dite telle quelle : 5 000 caractères de CONTRÔLE ($ctrl_len une fois échappés) sont refusés — pas un message humain" \
  "ERREUR|23514|conv_messages_content_len_check" "$(printf '%s' "$r_ctrl" | cut -d'|' -f1-3)"
r_d="$(AUTH apres "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_ap_d', '$C1', '$A', '{\"type\":\"media\",\"url\":\"data:image/png;base64,$PHOTO\"}') returning 1;")"
verifier "une enveloppe à data-URL : 23514, et le MESSAGE nomme la contrainte (ce que lit _motRefusContenu)" \
  "ERREUR|23514|conv_messages_content_url_data_check|new row for relation \"conv_messages\" violates check constraint \"conv_messages_content_url_data_check\"" "$r_d"
r_l="$(AUTH apres "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_ap_l', '$C1', '$A', repeat('A', 300000)) returning 1;")"
verifier "300 000 caractères : 23514, conv_messages_content_len_check — sans renvoyer la ligne (RLS : pas de « Failing row contains »)" \
  "ERREUR|23514|conv_messages_content_len_check|new row for relation \"conv_messages\" violates check constraint \"conv_messages_content_len_check\"" "$r_l"
verifier "l'auteur ne réécrit rien (aucune policy d'UPDATE) : 0 ligne" "" \
  "$(AUTH apres "$A" "update public.conv_messages set content = '{\"type\":\"media\",\"url\":\"data:image/png;base64,$PHOTO\"}' where id = 'msg_ap_pire' returning 1;")"
verifier "service_role, qui garde l'UPDATE : réécrire en data-URL, 23514" "ERREUR|23514|conv_messages_content_url_data_check" \
  "$(SERVICE apres "update public.conv_messages set content = '{\"type\":\"media\",\"url\":\"data:image/png;base64,$PHOTO\"}' where id = 'msg_ap_pire' returning 1;" | cut -d'|' -f1-3)"
verifier "service_role (scripts, purge, restauration) : 23514 aussi" "ERREUR|23514|conv_messages_content_url_data_check" \
  "$(SERVICE apres "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_ap_s', '$C1', '$A', '{\"type\":\"media\",\"url\":\"data:image/png;base64,$PHOTO\"}') returning 1;" | cut -d'|' -f1-3)"
# La forme échappée : le motif brut ne la voit pas, la lecture jsonb, si. Écrite par
# python (chr(92)), jamais par un outil qui décode les échappements « \uXXXX » en
# écrivant : vécu le 07/11, le cas du verdict était devenu un « data: » en clair, et
# rien n'avait rougi.
ECHAPPE_SQL="'{\"type\":\"media\",\"url\":\"\\u0064ata:image/png;base64,AAAA\"}'"
verifier "la forme échappée porte bien sa barre oblique inverse (« \u0064ata: »)" "t" \
  "$(QD apres "select position(chr(92) || 'u0064ata:' in $ECHAPPE_SQL) > 0;")"
verifier "…le motif brut ne la voit pas ; la lecture jsonb, si (c'est elle qui refuse)" "false|true" \
  "$(QD apres "select ($ECHAPPE_SQL ~ '\"url\"[[:space:]]*:[[:space:]]*\"[[:space:][:cntrl:]]*[Dd][Aa][Tt][Aa]:')::text || '|' || (((($ECHAPPE_SQL)::jsonb) ->> 'url') ~* '^[[:space:][:cntrl:]]*data:')::text;")"
verifier "…et l'écriture est refusée (23514, conv_messages_content_url_data_check)" "ERREUR|23514|conv_messages_content_url_data_check" \
  "$(AUTH apres "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_ap_e', '$C1', '$A', $ECHAPPE_SQL) returning 1;" | cut -d'|' -f1-3)"
verifier "l'autre membre lit toujours la conversation (la lecture n'est pas touchée)" "1" \
  "$(AUTH apres "$B" "select count(*) from public.conv_messages where conv_id = '$C1';")"

# ═══ ⑤ UNE LIGNE DÉJÀ HORS BORNE EN BASE ═════════════════════════════════════
echo "⑤ une ligne déjà hors borne : la migration échoue, rien n'est appliqué"
COPIE sale
QD sale "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_sale', '$C0', '$S', '{\"type\":\"media\",\"url\":\"data:image/png;base64,$PHOTO\"}');" >/dev/null
r_sale="$(APPLIQUER sale "$MIGRATION" || true)"
contient "l'ajout de la contrainte échoue sur la ligne existante, et le dit" "check constraint \"conv_messages_content_url_data_check\" of relation \"conv_messages\" is violated by some row" "$r_sale"
verifier "rien n'est appliqué, la ligne est intacte" "0|1" "$(CHECKS sale)|$(QD sale "select count(*) from public.conv_messages where id = 'msg_sale';")"

# ═══ ⑥ LE VERROU ═════════════════════════════════════════════════════════════
echo "⑥ verrou : une transaction tient conv_messages"
COPIE verrou
psql -h "$BASE" -p "$PORT" -U postgres -d verrou -X -q -c "begin; lock table public.conv_messages in access share mode; select pg_sleep(20); commit;" >/dev/null 2>&1 &
VERROU_PID=$!
sleep 1
debut=$(date +%s)
r_verrou="$(psql -h "$BASE" -p "$PORT" -U postgres -d verrou -X -tA -q -v VERBOSITY=verbose -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1 || true)"
duree=$(( $(date +%s) - debut ))
contient "la migration échoue sur le délai de verrou (55P03)" "55P03" "$r_verrou"
verifier "…en moins de 10 s, sans mettre la table en file derrière elle" "oui" "$([ "$duree" -lt 10 ] && echo oui || echo "non (${duree} s)")"
kill "$VERROU_PID" >/dev/null 2>&1 || true; wait "$VERROU_PID" 2>/dev/null || true; VERROU_PID=""
verifier "rien n'est appliqué" "0" "$(CHECKS verrou)"
# Le verrou PRIS, une attente APRÈS lui le prolonge : quelqu'un tient realtime.messages
# (où écrivent les poussées du verdict, par `realtime.send`, qui avale 55P03).
attente_tenue() {   # $1 base, $2 fichier : rend « <durée en s>|<verdict> » ; la migration est coupée à 15 s
  local pid debut r
  psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -q -c "begin; lock table realtime.messages in share mode; select pg_sleep(25); commit;" >/dev/null 2>&1 &
  pid=$!
  sleep 1
  debut=$(date +%s)
  r="$(timeout 15 psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -X -tA -F '§' -q -v ON_ERROR_STOP=1 -f "$2" 2>&1 || true)"
  printf '%s|%s' "$(( $(date +%s) - debut ))" "$(compte_verdict "$r")"
  QA postgres "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$1' and pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  kill "$pid" >/dev/null 2>&1 || true; wait "$pid" 2>/dev/null || true
}
COPIE tenue
r_tenue="$(attente_tenue tenue "$MIGRATION")"
verifier "realtime.messages tenue par une autre session : la migration passe quand même (17 OK)" "17/0" "${r_tenue#*|}"
verifier "…et garde conv_messages fermée moins de 10 s (200 ms par attente une fois le verrou pris ; mesuré : ${r_tenue%%|*} s)" "oui" \
  "$([ "${r_tenue%%|*}" -lt 10 ] && echo oui || echo "non (${r_tenue%%|*} s)")"
python3 - "$MIGRATION" "$SQLDIR/sans_seconde_borne.sql" <<'PY'
import sys
s = open(sys.argv[1], encoding="utf-8").read()
t = s.replace("set local lock_timeout = '200ms';", "", 1)
assert t != s
open(sys.argv[2], "w", encoding="utf-8").write(t)
PY
chmod 644 "$SQLDIR/sans_seconde_borne.sql"
COPIE tenue2
r_tenue2="$(attente_tenue tenue2 "$SQLDIR/sans_seconde_borne.sql")"
verifier "RÉINJECTION — sans la seconde borne, conv_messages reste fermée plus de 12 s (5 s par attente avalée)" "oui" \
  "$([ "${r_tenue2%%|*}" -ge 12 ] && echo oui || echo "non (${r_tenue2%%|*} s, ${r_tenue2#*|})")"

# ═══ ⑦ LE RETOUR ARRIÈRE ═════════════════════════════════════════════════════
echo "⑦ retour arrière, puis réapplication"
RETOUR_ARRIERE > "$SQLDIR/retour.sql"; chmod 644 "$SQLDIR/retour.sql"
verifier "le retour arrière est une transaction" "begin;|commit;" "$(head -1 "$SQLDIR/retour.sql")|$(tail -1 "$SQLDIR/retour.sql")"
APPLIQUER apres "$SQLDIR/retour.sql" >/dev/null
verifier "le catalogue de conv_messages revient À L'IDENTIQUE (colonnes, contraintes, policies, déclencheurs, droits, RLS, identité)" \
  "$CATALOGUE_AVANT" "$(CATALOGUE apres)"
verifier "le trou se rouvre : une data-URL repasse" "1" \
  "$(AUTH apres "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('msg_ra_d', '$C1', '$A', '{\"type\":\"media\",\"url\":\"data:image/png;base64,$PHOTO\"}') returning 1;")"
QD apres "delete from public.conv_messages where id = 'msg_ra_d';" >/dev/null
v3="$(APPLIQUER apres "$MIGRATION" || true)"
verifier "réapplication après retour arrière : 17 OK" "17/0" "$(compte_verdict "$v3")"

# ═══ ⑧ LES MUTATIONS ═════════════════════════════════════════════════════════
echo "⑧ mutations : chaque correctif affaibli fait REFUSER la migration, sans rien appliquer"
muter() {   # $1 nom, $2 python : transforme `s`
  python3 - "$MIGRATION" "$SQLDIR/mut_$1.sql" "$2" <<'PY'
import sys
src, dst, code = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src, encoding="utf-8").read()
avant = s
exec(code)
if s == avant:
    raise SystemExit("mutation sans effet : " + dst)
open(dst, "w", encoding="utf-8").write(s)
PY
  chmod 644 "$SQLDIR/mut_$1.sql"
}
essayer() {   # $1 nom, $2 lignes attendues (au moins)
  local base="m_$1" r
  COPIE "$base"
  r="$(APPLIQUER "$base" "$SQLDIR/mut_$1.sql" || true)"
  verifier "mutation « $1 » : refusée, lignes ⊇ {$2}" "oui" "$(contient_tous "$(refusees "$r")" "$2")"
  verifier "mutation « $1 » : rien n'est appliqué" "0" "$(CHECKS "$base")"
}
DEB_URL="  drop constraint if exists conv_messages_content_url_data_check,"
muter sans_url_data "
i = s.index(',\n$DEB_URL')
j = s.index('end));', i) + len('end))')
s = s[:i] + s[j:]
"
essayer sans_url_data "7,8,9,11,12,15,16"
muter borne_2000 "s = s.replace('check (content is null or char_length(content) <= 20000)', 'check (content is null or char_length(content) <= 2000)')"
essayer borne_2000 "3,6,14"
muter sans_jsonb "
i = s.index('      and case when pg_input_is_valid(content, \'jsonb\')')
j = s.index('end));', i)
s = s[:i] + s[j + len('end'):]
"
essayer sans_jsonb "8,15"
muter sans_brut "s = s.replace('''      content !~ '\"url\"[[:space:]]*:[[:space:]]*\"[[:space:][:cntrl:]]*[Dd][Aa][Tt][Aa]:'\n      and case''', '''      case''')"
essayer sans_brut "9,15"
muter cast_nu "
i = s.index('case when pg_input_is_valid(content, \'jsonb\')')
j = s.index('end));', i)
s = s[:i] + \"coalesce((content::jsonb ->> 'url') !~* '^[[:space:][:cntrl:]]*data:', true)\" + ')' + s[j + len('end)'):]
"
# (la ligne 9 reste verte : la forme brute refuse avant que la conversion ne soit tentée)
essayer cast_nu "2,5,15"
muter nul_refuse "s = s.replace('check (content is null or char_length(content) <= 20000)', 'check (content is not null and char_length(content) <= 20000)')"
essayer nul_refuse "2,14"
muter sans_role "s = s.replace(\"      if t.qui = 'a' then\n        execute 'set local role authenticated';\", \"      if t.qui = 'a' then\n        null;\")"
essayer sans_role "1"

# ═══ ⑨ LA BARRIÈRE DE L'OUTIL ET LE CLIENT ══════════════════════════════════
echo "⑨ la barrière d'application lit le prérequis client ; le client le porte"
# ⚠️ PAS la commande `appliquer-migration.mjs --verifier` : elle REFUSE de tourner en CI
# (`GITHUB_ACTIONS`, ADR-012) — et c'est voulu, ce banc ne la contourne pas. On lit
# ce qu'elle lit : la forme d'une transaction (sa règle, recopiée) et le prérequis
# client par la fonction PURE de la barrière (`prerequisClient`, règle ④).
r_bar="$(cd "$RACINE" && node -e '
const fs = require("fs");
const BAR = require("./scripts/lib/barriere-migration.js");
const sql = fs.readFileSync(process.argv[1], "utf8");
const corps = sql.replace(/--[^\n]*/g, "").trim().toLowerCase();
console.log((corps.startsWith("begin;") && corps.endsWith("commit;") && !/\bvacuum\b/.test(corps) ? "transaction" : "PAS une transaction")
  + "|" + JSON.stringify(BAR.prerequisClient(sql)));
' "$MIGRATION" 2>&1 || true)"
verifier "la barrière de l'outil lit une transaction, et le prérequis client" 'transaction|["conv_messages:contenu-borne"]' "$r_bar"
verifier "le client de #751 porte la chaîne (CONTENU_MESSAGE_BORNE)" "1" "$(grep -cF 'var CONTENU_MESSAGE_BORNE = "conv_messages:contenu-borne";' "$CLIENT" || true)"
verifier "…et MSG_TEXTE_MAX = 5 000 (la pire enveloppe ci-dessus en dépend)" "1" "$(grep -cF 'var MSG_TEXTE_MAX = 5000;' "$CLIENT" || true)"

echo
echo "Banc conv_messages, contenu borné : $ok vérifications réussies, $ko en échec."
[ "$ko" -eq 0 ]
