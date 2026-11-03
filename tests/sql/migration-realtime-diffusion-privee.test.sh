#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_realtime_diffusion_privee_2026-11-03.sql (R25)
#
# PostgreSQL jetable. Le socle recopie la production telle que mesurée au canal
# ① le 2026-11-03 : `conv_members` (PK conv_id, user_id), `notifications` (PK
# id, colonne `origine`), RLS « membre » / « ma ligne », `anon` avec SELECT de
# table sur les deux (mesuré), la publication `supabase_realtime` à onze
# tables, et le schéma `realtime` — types, `realtime.subscription`,
# `realtime.messages` et ses quatre policies, et les fonctions de Supabase
# copiées de `pg_get_functiondef` : `apply_rls` (le moteur qui décide QUI
# reçoit un changement), ses aides (`cast`, `check_equality_op`,
# `is_visible_through_filters`, `build_prepared_statement_sql`), `send`,
# `broadcast_changes`, `quote_wal2json` et la liste des tables que
# `list_changes` passe au décodeur (`add-tables`). Code de supabase/realtime
# (Apache-2.0), recopié pour être EXÉCUTÉ, pas paraphrasé.
#
# ⓪ On REPRODUIT d'abord la fuite — l'audit l'avait lue dans le code, « non
#    reproduite (pas de serveur Realtime sur banc) » : on donne à `apply_rls`
#    les enregistrements wal2json d'une suppression et l'on regarde à qui il
#    les livre. Un tiers sans filtre — et même un visiteur avec la seule clé
#    anon — reçoit la clé primaire ; le même tiers ne reçoit PAS l'INSERT (la
#    RLS s'y applique) : le défaut est propre au DELETE.
# ① On applique (verdict 11/0, rejouable).
# ② Le décodeur ne reçoit plus les deux tables ; chaque ajout part au SEUL
#    destinataire, sur `user:<lui>`, sous un événement distinct de « INSERT »,
#    même inséré sous `authenticated` (qui n'a pas EXECUTE sur le trigger) ; une
#    suppression ne part nulle part ; personne d'autre ne lit ni n'émet sur ce
#    topic ; une poussée impossible ne bloque pas l'écriture ; le canal des
#    messages n'a pas bougé.
# ③ Le retour arrière rend l'état d'avant, et la migration se réapplique.
# ④ Le verdict ne peut pas imprimer OK sur un état faux : chaque ligne est
#    éprouvée contre la mutation qu'elle garde.
#
#   bash tests/sql/migration-realtime-diffusion-privee.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_realtime_diffusion_privee_2026-11-03.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

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

lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses= -c wal_level=logical\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do
  psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }
  sleep 0.5
done
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

DB=diffusion
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# Sous `authenticated`, au nom de `$1` (le chemin d'un client, RLS comprise).
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
# La policy de `realtime.messages` OUVRE ou FERME un topic (tout ou rien) : `$1`
# voit-il quelque chose sur `$2` ?
RECOIT() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
           -c "set local role authenticated; set local request.jwt.claim.sub='$1'; set local realtime.topic='$2'; select count(*) > 0 from realtime.messages;" 2>&1 | sed 's/^t$/oui/;s/^f$/non/'; }
# `$1` tente d'ÉMETTRE sur `$2` (le contrôle d'écriture que fait Realtime).
EMET() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; set local realtime.topic='$2';
             insert into realtime.messages (topic, extension, payload, event, private) values ('$2', 'broadcast', '{}', 'notifications:INSERT', true) returning 'emis';" 2>&1; }
# Les poussées enregistrées, dans l'ordre : « topic>événement ».
POUSSEES() { Q "select coalesce(string_agg(topic || '>' || event, ',' order by topic, event), '-') from realtime.messages;"; }
VIDER() { Q "truncate realtime.messages;" >/dev/null; }
# Ce que `apply_rls` livre à la souscription `$1` pour l'enregistrement wal2json `$2` :
# « recu|<old_record> » ou « rien|… ».
# ⚠️ `apply_rls` rend UNE ligne PAR RÔLE (anon, authenticated…) : on cherche celle
# qui porte la souscription, jamais « la première » (anon se trie avant).
LIVRE() { Q "select coalesce((select 'recu|' || coalesce((wal->'old_record')::text, '-')
                                from realtime.apply_rls('$2'::jsonb, 1048576) where '$1'::uuid = any(subscription_ids) limit 1), 'rien');"; }
# Les tables que `list_changes` passe à wal2json (`add-tables`) — le seul filtre en amont d'`apply_rls`.
DECODEES() { Q "select string_agg(t, ',' order by t) from unnest(banc.tables_decodees()) t;"; }
RETOUR_ARRIERE() { sed -n 's/^--| //p' "$MIGRATION"; }
# Le tableau de verdict SEUL (sans rien réappliquer), pour éprouver chaque ligne.
VERDICT_SEUL() { sed -n '/^-- ── VERDICT/,/^commit;/p' "$MIGRATION" | sed '$d' | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 2>&1; }
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1; }
BILAN() { printf '%s/%s' "$(printf '%s\n' "$1" | grep -cE '\|\s*OK\s*$' || true)" "$(printf '%s\n' "$1" | grep -cE '\|\s*ECHEC\s*$' || true)"; }
# La ligne en ECHEC d'un verdict contient-elle `$2` ?
ROUGE() { printf '%s\n' "$1" | grep -E '\|\s*ECHEC\s*$' | grep -c -- "$2" || true; }

A=33333333-3333-3333-3333-333333333333   # destinataire : promu de la liste d'attente, membre de la discussion
B=44444444-4444-4444-4444-444444444444   # organisatrice, créatrice d'un groupe, autrice de notifications
C=55555555-5555-5555-5555-555555555555   # second membre d'un groupe
X=88888888-8888-8888-8888-888888888888   # tiers sans aucun lien — l'abonné sans filtre de l'audit
SUB_X_MEMBRES=aaaaaaaa-0000-4000-8000-000000000001
SUB_X_NOTIFS=aaaaaaaa-0000-4000-8000-000000000002
SUB_A_MEMBRES=aaaaaaaa-0000-4000-8000-000000000003
SUB_ANON_NOTIFS=aaaaaaaa-0000-4000-8000-000000000004

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
-- auth.uid(), copie de production (pg_get_functiondef, 2026-11-03) : la claim
-- isolée d'abord, le jeu de claims ensuite — c'est ce second chemin qu'emprunte
-- `apply_rls` (`request.jwt.claims`).
create function auth.uid() returns uuid language sql stable as $fn$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

-- ── Les tables du lot, colonnes de production ──────────────────────────────
create table public.conversations (id text primary key, is_group boolean default false, created_by text);
create table public.conv_members (conv_id text not null references public.conversations(id), user_id text not null,
  primary key (conv_id, user_id));
-- `origine` est posée par un trigger BEFORE INSERT en production ; un défaut suffit ici.
create table public.notifications (id text primary key, user_id text, kind text, from_id text, ref_id text, content text,
  seen boolean default false, created_at timestamp without time zone default now(), origine text not null default 'client');
create table public.conv_messages (id text primary key, conv_id text, from_id text, content text,
  created_at timestamp without time zone default now());
create table public.blocks (blocker_id text not null, blocked_id text not null, primary key (blocker_id, blocked_id));
-- Les neuf autres tables publiées (leur contenu n'est pas l'objet du banc).
create table public.comment_interactions (id text primary key);
create table public.conv_reads (conv_id text not null, user_id text not null, last_read_at timestamptz, primary key (conv_id, user_id));
create table public.event_comments (id text primary key);
create table public.post_comments (id text primary key);
create table public.post_likes (post_id text not null, user_id text not null, primary key (post_id, user_id));
create table public.posts (id text primary key);
create table public.profiles (id text primary key);
create table public.video_lives (id text primary key);

-- `is_conv_member`, copie de production (EXECUTE : authenticated oui, anon non — mesuré).
create function public.is_conv_member(_conv_id text, _uid text) returns boolean
language sql stable security definer set search_path to ''
as $fn$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $fn$;
revoke all on function public.is_conv_member(text, text) from public, anon;
grant execute on function public.is_conv_member(text, text) to authenticated;

alter table public.conv_members enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
-- Lecture : policies de production. Écriture : SIMPLIFIÉE (créateur ou soi ;
-- autrice de la notification) — la RLS d'écriture n'est pas l'objet du banc,
-- seul compte qu'un client NON privilégié déclenche les triggers.
create policy conv_members_select_member on public.conv_members for select to authenticated
  using (public.is_conv_member(conv_id, (select auth.uid())::text));
create policy conv_members_ecriture_banc on public.conv_members for insert to authenticated
  with check (user_id = (select auth.uid())::text
              or exists (select 1 from public.conversations c where c.id = conv_id and c.created_by = (select auth.uid())::text));
create policy "Suppression admin" on public.conv_members for delete
  using (user_id = (select auth.uid())::text
         or exists (select 1 from public.conversations c where c.id = conv_members.conv_id and c.created_by = (select auth.uid())::text));
create policy "Lecture propre" on public.notifications for select using (user_id = (select auth.uid())::text);
create policy "Suppression propre" on public.notifications for delete using (user_id = (select auth.uid())::text);
create policy "Update propre" on public.notifications for update using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);
create policy notifications_ecriture_banc on public.notifications for insert to authenticated
  with check (from_id = (select auth.uid())::text);
create policy conversations_banc on public.conversations for all to authenticated using (true) with check (true);
-- Droits de table mesurés : authenticated ET anon gardent SELECT (la RLS trie les lignes).
grant select, insert, update, delete on public.conversations, public.conv_members, public.notifications, public.conv_messages to authenticated;
grant select on public.conv_members, public.notifications to anon;

create publication supabase_realtime for table
  public.comment_interactions, public.conv_members, public.conv_messages, public.conv_reads, public.event_comments,
  public.notifications, public.post_comments, public.post_likes, public.posts, public.profiles, public.video_lives;

-- ── Le schéma `realtime`, tel que la production le porte ───────────────────
create schema realtime;
grant usage on schema realtime to anon, authenticated;
create type realtime.action as enum ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'ERROR');
create type realtime.equality_op as enum ('eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'like', 'ilike', 'is', 'match', 'imatch', 'isdistinct');
create type realtime.user_defined_filter as (column_name text, op realtime.equality_op, value text, negate boolean);
create type realtime.wal_column as (name text, type_name text, type_oid oid, value jsonb, is_pkey boolean, is_selectable boolean);
create type realtime.wal_rls as (wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[]);

create function realtime.to_regrole(role_name text) returns regrole language sql immutable
as $function$ select role_name::regrole $function$;

create table realtime.subscription (
  id bigint generated always as identity primary key,
  subscription_id uuid not null,
  entity regclass not null,
  filters realtime.user_defined_filter[] default '{}'::realtime.user_defined_filter[] not null,
  claims jsonb not null,
  claims_role regrole generated always as (realtime.to_regrole((claims ->> 'role'::text))) stored not null,
  created_at timestamp without time zone default timezone('utc'::text, now()) not null,
  action_filter text default '*'::text,
  selected_columns text[]);

create table realtime.messages (
  topic text not null, extension text not null, payload jsonb, event text, private boolean default false,
  updated_at timestamp without time zone default timezone('utc'::text, clock_timestamp()) not null,
  inserted_at timestamp without time zone default timezone('utc'::text, clock_timestamp()) not null,
  id uuid default gen_random_uuid() not null, binary_payload bytea, skip_broadcast boolean default false not null,
  primary key (id, inserted_at));
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to anon, authenticated;

create function realtime.topic() returns text language sql stable
as $function$ select nullif(current_setting('realtime.topic', true), '')::text; $function$;

-- Les quatre policies de production (pg_policies, 2026-11-03).
create policy passio_rt_emettre on realtime.messages for insert to authenticated with check (
  (realtime.topic() ~~ 'call:%') or (realtime.topic() ~~ 'vlive:%')
  or ((realtime.topic() ~~ 'typing:%') and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
  or ((realtime.topic() ~~ 'conv:%') and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text)));
create policy passio_rt_recevoir_visiteur on realtime.messages for select to anon using (realtime.topic() = 'realtime:db');
create policy passio_rt_recevoir on realtime.messages for select to authenticated using (
  ((realtime.topic() ~~ 'ring:%') and (substr(realtime.topic(), 6) = (select auth.uid())::text))
  or (realtime.topic() ~~ 'call:%') or (realtime.topic() ~~ 'vlive:%') or (realtime.topic() = 'realtime:db')
  or ((realtime.topic() ~~ 'typing:%') and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
  or ((realtime.topic() ~~ 'conv:%') and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text))
  or ((realtime.topic() ~~ 'conv_specific:%') and public.is_conv_member(substr(realtime.topic(), 15), (select auth.uid())::text)));
create policy "Utilisateur reçoit ses messages" on realtime.messages for select to authenticated
  using (realtime.topic() = ('user:' || (select auth.uid())::text));

-- realtime.send, copie de production.
CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$function$;

-- realtime.broadcast_changes, copie de production (le canal des messages s'en sert).
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

-- realtime."cast", check_equality_op (forme à 5 arguments), is_visible_through_filters,
-- build_prepared_statement_sql : copies de production.
CREATE OR REPLACE FUNCTION realtime."cast"(val text, type_ regtype)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$function$;

CREATE OR REPLACE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
    op_symbol text;
    res boolean;
begin
    -- IS DISTINCT FROM / IS NOT DISTINCT FROM: infix, both sides typed literals
    if op = 'isdistinct' then
        execute format(
            'select %L::%s %s %L::%s',
            val_1,
            type_::text,
            case when negate then 'IS NOT DISTINCT FROM' else 'IS DISTINCT FROM' end,
            val_2,
            type_::text
        ) into res;
        return res;
    end if;

    -- IS requires a keyword RHS (NULL, TRUE, FALSE, UNKNOWN), not a typed literal
    if op = 'is' then
        if val_2 not in ('null', 'true', 'false', 'unknown') then
            raise exception 'invalid value for is filter: must be null, true, false, or unknown';
        end if;
        execute format(
            'select %L::%s %s %s',
            val_1,
            type_::text,
            case when negate then 'IS NOT' else 'IS' end,
            upper(val_2)
        ) into res;
        return res;
    end if;

    op_symbol = case
        when op = 'eq'    then '='
        when op = 'neq'   then '!='
        when op = 'lt'    then '<'
        when op = 'lte'   then '<='
        when op = 'gt'    then '>'
        when op = 'gte'   then '>='
        when op = 'in'    then '= any'
        when op = 'like'   then 'LIKE'
        when op = 'ilike'  then 'ILIKE'
        when op = 'match'  then '~'
        when op = 'imatch' then '~*'
        else null
    end;

    if op_symbol is null then
        raise exception 'unsupported equality operator: %', op::text;
    end if;

    execute format(
        'select %L::%s %s (%L::%s)',
        val_1,
        type_::text,
        op_symbol,
        val_2,
        case when op = 'in' then type_::text || '[]' else type_::text end
    ) into res;

    return case when negate then not res else res end;
end;
$function$;

CREATE OR REPLACE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    select
        filters is null
        or array_length(filters, 1) is null
        or coalesce(
            count(col.name) = count(1)
            and sum(
                realtime.check_equality_op(
                    op:=f.op,
                    type_:=coalesce(col.type_oid::regtype, col.type_name::regtype),
                    val_1:=col.value #>> '{}',
                    val_2:=f.value,
                    negate:=coalesce(f.negate, false)
                )::int
            ) filter (where col.name is not null) = count(col.name),
            false
        )
    from
        unnest(filters) f
        left join unnest(columns) col
            on f.column_name = col.name;
$function$;

CREATE OR REPLACE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[])
 RETURNS text
 LANGUAGE sql
AS $function$
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $function$;

-- realtime.apply_rls, copie de production (2026-11-03), intégrale : c'est elle qui
-- décide à quelles souscriptions un changement est livré.
CREATE OR REPLACE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024))
 RETURNS SETOF realtime.wal_rls
 LANGUAGE plpgsql
AS $function$
declare
    -- Regclass of the table e.g. public.notes
    entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

    -- I, U, D, T: insert, update ...
    action realtime.action = (
        case wal ->> 'action'
            when 'I' then 'INSERT'
            when 'U' then 'UPDATE'
            when 'D' then 'DELETE'
            else 'ERROR'
        end
    );

    -- Is row level security enabled for the table
    is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

    subscriptions realtime.subscription[] = array_agg(subs)
        from
            realtime.subscription subs
        where
            subs.entity = entity_
            -- Filter by action early - only get subscriptions interested in this action
            -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
            and (subs.action_filter = '*' or subs.action_filter = action::text);

    -- Subscription vars
    working_role regrole;
    working_selected_columns text[];
    claimed_role regrole;
    claims jsonb;

    subscription_id uuid;
    subscription_has_access bool;
    visible_to_subscription_ids uuid[] = '{}';

    -- structured info for wal's columns
    columns realtime.wal_column[];
    -- previous identity values for update/delete
    old_columns realtime.wal_column[];

    error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

    -- Primary jsonb output for record
    output jsonb;

    -- Loop record for iterating unique roles (outer loop)
    role_record record;
    -- Loop record for iterating unique selected_columns within a role (inner loop)
    cols_record record;
    -- Subscription ids visible at the role level (before fanning out by selected_columns)
    visible_role_sub_ids uuid[] = '{}';

begin
    perform set_config('role', null, true);

    columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'columns') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    old_columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'identity') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    for role_record in
        select claims_role
        from (select distinct claims_role from unnest(subscriptions)) t
        order by claims_role::text
    loop
        working_role := role_record.claims_role;

        -- Update `is_selectable` for columns and old_columns (once per role)
        columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(columns) c;

        old_columns =
                array_agg(
                    (
                        c.name,
                        c.type_name,
                        c.type_oid,
                        c.value,
                        c.is_pkey,
                        pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                    )::realtime.wal_column
                )
                from
                    unnest(old_columns) c;

        if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
            -- Fan out 400 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 400: Bad Request, no primary key']
                )::realtime.wal_rls;
            end loop;

        -- The claims role does not have SELECT permission to the primary key of entity
        elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
            -- Fan out 401 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 401: Unauthorized']
                )::realtime.wal_rls;
            end loop;

        else
            -- Create the prepared statement (once per role)
            if is_rls_enabled and action <> 'DELETE' then
                if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                    deallocate walrus_rls_stmt;
                end if;
                execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
            end if;

            -- Collect all visible subscription IDs for this role (filter check + RLS check)
            visible_role_sub_ids = '{}';

            for subscription_id, claims in (
                    select
                        subs.subscription_id,
                        subs.claims
                    from
                        unnest(subscriptions) subs
                    where
                        subs.entity = entity_
                        and subs.claims_role = working_role
                        and (
                            realtime.is_visible_through_filters(columns, subs.filters)
                            or (
                              action = 'DELETE'
                              and realtime.is_visible_through_filters(old_columns, subs.filters)
                            )
                        )
            ) loop

                if not is_rls_enabled or action = 'DELETE' then
                    visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                else
                    -- Check if RLS allows the role to see the record
                    perform
                        -- Trim leading and trailing quotes from working_role because set_config
                        -- doesn't recognize the role as valid if they are included
                        set_config('role', trim(both '"' from working_role::text), true),
                        set_config('request.jwt.claims', claims::text, true);

                    execute 'execute walrus_rls_stmt' into subscription_has_access;

                    -- Reset the role on every FOR..LOOP batch execution.
                    -- The first batch of 10 rows is pre-fetched using the current connection role (PG internal behaviour)
                    -- then we have to reset it again otherwise it would use the role defined in the `set_config` above
                    -- to fetch the remaining rows when rows>10, which could be a user-defined role that lacks execution grants.
                    -- The flow is:
                    --   1. run batch with conn role
                    --   2. set_config working_role
                    --   3. execute walrus
                    --   4. reset role (revert)
                    --   5. repeat
                    perform set_config('role', null, true);

                    if subscription_has_access then
                        visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                    end if;
                end if;
            end loop;

            perform set_config('role', null, true);

            -- Inner loop: per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;

                output = jsonb_build_object(
                    'schema', wal ->> 'schema',
                    'table', wal ->> 'table',
                    'type', action,
                    'commit_timestamp', to_char(
                        ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ),
                    'columns', (
                        select
                            jsonb_agg(
                                jsonb_build_object(
                                    'name', pa.attname,
                                    'type', pt.typname
                                )
                                order by pa.attnum asc
                            )
                        from
                            pg_attribute pa
                            join pg_type pt
                                on pa.atttypid = pt.oid
                            left join (
                                select unnest(conkey) as pkey_attnum
                                from pg_constraint
                                where conrelid = entity_ and contype = 'p'
                            ) pk on pk.pkey_attnum = pa.attnum
                        where
                            attrelid = entity_
                            and attnum > 0
                            and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
                            and (working_selected_columns is null or pa.attname = any(working_selected_columns) or pk.pkey_attnum is not null)
                    )
                )
                -- Add "record" key for insert and update
                || case
                    when action in ('INSERT', 'UPDATE') then
                        jsonb_build_object(
                            'record',
                            (
                                select
                                    jsonb_object_agg(
                                        -- if unchanged toast, get column name and value from old record
                                        coalesce((c).name, (oc).name),
                                        case
                                            when (c).name is null then (oc).value
                                            else (c).value
                                        end
                                    )
                                from
                                    unnest(columns) c
                                    full outer join unnest(old_columns) oc
                                        on (c).name = (oc).name
                                where
                                    coalesce((c).is_selectable, (oc).is_selectable)
                                    and (working_selected_columns is null or coalesce((c).name, (oc).name) = any(working_selected_columns) or coalesce((c).is_pkey, (oc).is_pkey))
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            )
                        )
                    else '{}'::jsonb
                end
                -- Add "old_record" key for update and delete
                || case
                    when action = 'UPDATE' then
                        jsonb_build_object(
                                'old_record',
                                (
                                    select jsonb_object_agg((c).name, (c).value)
                                    from unnest(old_columns) c
                                    where
                                        (c).is_selectable
                                        and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                        and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                )
                            )
                    when action = 'DELETE' then
                        jsonb_build_object(
                            'old_record',
                            (
                                select jsonb_object_agg((c).name, (c).value)
                                from unnest(old_columns) c
                                where
                                    (c).is_selectable
                                    and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                    and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                            )
                        )
                    else '{}'::jsonb
                end;

                -- Filter visible_role_sub_ids to those matching the current selected_columns group
                visible_to_subscription_ids = coalesce(
                    (
                        select array_agg(s.subscription_id)
                        from unnest(subscriptions) s
                        where s.claims_role = working_role
                          and (s.selected_columns is not distinct from working_selected_columns)
                          and s.subscription_id = any(visible_role_sub_ids)
                    ),
                    '{}'::uuid[]
                );

                return next (
                    output,
                    is_rls_enabled,
                    visible_to_subscription_ids,
                    case
                        when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                        else '{}'
                    end
                )::realtime.wal_rls;
            end loop;

        end if;
    end loop;

    perform set_config('role', null, true);
end;
$function$;

-- quote_wal2json / wal2json_escape_identifier, copies de production, et la liste
-- `add-tables` que `realtime.list_changes` passe à wal2json (CTE `pub`, recopiée) :
-- une table absente de cette liste n'est JAMAIS décodée, donc jamais livrée.
CREATE OR REPLACE FUNCTION realtime.wal2json_escape_identifier(name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  -- Prefix `\`, `,`, `.`, and any whitespace with `\`
  SELECT regexp_replace(name, '([\\,.[:space:]])', '\\\1', 'g')
$function$;
CREATE OR REPLACE FUNCTION realtime.quote_wal2json(entity regclass)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  SELECT
    realtime.wal2json_escape_identifier(nsp.nspname::text)
    || '.'
    || realtime.wal2json_escape_identifier(pc.relname::text)
  FROM pg_class pc
  JOIN pg_namespace nsp ON pc.relnamespace = nsp.oid
  WHERE pc.oid = entity
$function$;
create schema banc;
create function banc.tables_decodees() returns text[] language sql stable as $fn$
  select string_to_array(w2j_add_tables, ',') from (
    SELECT
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = 'supabase_realtime'
    GROUP BY pp.pubname
    LIMIT 1) pub
$fn$;

-- ── Le canal des MESSAGES, tel qu'en production (MSG-10) ───────────────────
create function public.blocage_entre(_a text, _b text) returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select case
    when _a is null or _b is null or _a = _b then false
    else exists (
      select 1 from public.blocks b
       where (b.blocker_id = _a and b.blocked_id = _b)
          or (b.blocker_id = _b and b.blocked_id = _a)
    )
  end
$fn$;
revoke all on function public.blocage_entre(text, text) from public, anon, authenticated;
create function public.broadcast_conv_message_to_users() returns trigger
language plpgsql security definer set search_path = public, realtime
as $fn$
DECLARE
  m RECORD;
BEGIN
  FOR m IN SELECT user_id FROM public.conv_members WHERE conv_id = NEW.conv_id LOOP
    IF NOT public.blocage_entre(NEW.from_id, m.user_id) THEN
      PERFORM realtime.broadcast_changes(
        'user:' || m.user_id,
        TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$fn$;
revoke all on function public.broadcast_conv_message_to_users() from public, anon, authenticated;
create trigger broadcast_conv_message_users_trigger after insert on public.conv_messages
  for each row execute function public.broadcast_conv_message_to_users();
SQL

# Les comptes, la discussion d'activité et un groupe ordinaire.
Q "insert into public.conversations (id, is_group, created_by) values ('evgrp_ev_rando', true, '$B'), ('grp_1', true, '$B');
   insert into public.conv_members (conv_id, user_id) values ('evgrp_ev_rando', '$B'), ('evgrp_ev_rando', '$A');
   insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values
     ('n_pa_ev_rando_____${A:0:8}', '$A', 'promotion', '$B', 'ev_rando', 'Une place s''est libérée');" >/dev/null
# Les souscriptions telles que Realtime les écrit au join : X, compte quelconque, sans
# filtre ; un VISITEUR (clé anon publique : `realtime:db` lui est ouvert) ; A, comme
# l'app d'avant (INSERT filtré sur lui).
Q "insert into realtime.subscription (subscription_id, entity, claims, action_filter, filters) values
   ('$SUB_X_MEMBRES', 'public.conv_members', '{\"role\":\"authenticated\",\"sub\":\"$X\"}', '*', '{}'),
   ('$SUB_X_NOTIFS', 'public.notifications', '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE', '{}'),
   ('$SUB_ANON_NOTIFS', 'public.notifications', '{\"role\":\"anon\"}', 'DELETE', '{}'),
   ('$SUB_A_MEMBRES', 'public.conv_members', '{\"role\":\"authenticated\",\"sub\":\"$A\"}', 'INSERT',
    array[('user_id', 'eq', '$A', false)::realtime.user_defined_filter]);" >/dev/null

# Les enregistrements wal2json (format-version 2, include-pk, include-type-oids) tels
# que `list_changes` les passe à `apply_rls`.
PK_MEMBRES='"pk":[{"name":"conv_id","type":"text","typeoid":25},{"name":"user_id","type":"text","typeoid":25}]'
WAL_DEPART="{\"action\":\"D\",\"schema\":\"public\",\"table\":\"conv_members\",\"timestamp\":\"2026-11-03 10:00:00.000000+00\",\"identity\":[{\"name\":\"conv_id\",\"type\":\"text\",\"typeoid\":25,\"value\":\"evgrp_ev_rando\"},{\"name\":\"user_id\",\"type\":\"text\",\"typeoid\":25,\"value\":\"$A\"}],$PK_MEMBRES}"
WAL_ARRIVEE="{\"action\":\"I\",\"schema\":\"public\",\"table\":\"conv_members\",\"timestamp\":\"2026-11-03 10:00:00.000000+00\",\"columns\":[{\"name\":\"conv_id\",\"type\":\"text\",\"typeoid\":25,\"value\":\"evgrp_ev_rando\"},{\"name\":\"user_id\",\"type\":\"text\",\"typeoid\":25,\"value\":\"$A\"}],$PK_MEMBRES}"
WAL_NOTIF_EFFACEE="{\"action\":\"D\",\"schema\":\"public\",\"table\":\"notifications\",\"timestamp\":\"2026-11-03 10:00:00.000000+00\",\"identity\":[{\"name\":\"id\",\"type\":\"text\",\"typeoid\":25,\"value\":\"n_pa_ev_rando_____${A:0:8}\"}],\"pk\":[{\"name\":\"id\",\"type\":\"text\",\"typeoid\":25}]}"

echo "── ⓪ AVANT : la fuite, reproduite avec le apply_rls de production ──────"
verifier "X, sans filtre, reçoit le DÉPART de A de la discussion d'activité (clé primaire en clair)" \
  "recu|{\"conv_id\": \"evgrp_ev_rando\", \"user_id\": \"$A\"}" "$(LIVRE "$SUB_X_MEMBRES" "$WAL_DEPART")"
verifier "…mais pas son ARRIVÉE : sur un INSERT, la RLS s'applique (X n'est pas membre)" \
  "rien" "$(LIVRE "$SUB_X_MEMBRES" "$WAL_ARRIVEE")"
verifier "…que A, membre, reçoit bien (la copie d'apply_rls applique la RLS comme la production)" \
  "recu" "$(LIVRE "$SUB_A_MEMBRES" "$WAL_ARRIVEE" | cut -d'|' -f1)"
verifier "X reçoit l'identifiant de la notification EFFACÉE de A — « promu de la liste d'attente de ev_rando »" \
  "recu|{\"id\": \"n_pa_ev_rando_____${A:0:8}\"}" "$(LIVRE "$SUB_X_NOTIFS" "$WAL_NOTIF_EFFACEE")"
verifier "un VISITEUR (rôle anon, sans compte) le reçoit aussi : anon garde SELECT sur la table" \
  "recu|{\"id\": \"n_pa_ev_rando_____${A:0:8}\"}" "$(LIVRE "$SUB_ANON_NOTIFS" "$WAL_NOTIF_EFFACEE")"
verifier "et le décodeur reçoit bien les deux tables (add-tables de list_changes)" \
  "1|1" "$(DECODEES | tr ',' '\n' | grep -cx 'public.conv_members')|$(DECODEES | tr ',' '\n' | grep -cx 'public.notifications')"

echo "── ① APPLICATION ───────────────────────────────────────────────────"
sortie="$(APPLIQUER)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "le tableau de verdict rend 11 OK et 0 ECHEC" "11/0" "$(BILAN "$sortie")"
sortie2="$(APPLIQUER)" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejouée : même verdict (idempotente)" "11/0" "$(BILAN "$sortie2")"
contient "rejouée : elle dit qu'il n'y avait plus rien à retirer" "plus publiee" "$sortie2"

echo "── ② LA FUITE EST FERMÉE EN AMONT DU MOTEUR ──────────────────────────"
verifier "le décodeur ne reçoit plus conv_members ni notifications : aucun DELETE n'atteint apply_rls" \
  "0|0" "$(DECODEES | tr ',' '\n' | grep -cx 'public.conv_members' || true)|$(DECODEES | tr ',' '\n' | grep -cx 'public.notifications' || true)"
verifier "les neuf autres tables sont toujours décodées" \
  "public.comment_interactions,public.conv_messages,public.conv_reads,public.event_comments,public.post_comments,public.post_likes,public.posts,public.profiles,public.video_lives" \
  "$(DECODEES)"

echo "── ③ LA FONCTION EST GARDÉE : LE SEUL DESTINATAIRE, SUR SON TOPIC ──────"
VIDER
verifier "authenticated n'a PAS EXECUTE sur les fonctions de trigger" "f|f" \
  "$(Q "select has_function_privilege('authenticated', 'public.diffuser_notification()', 'EXECUTE')")|$(Q "select has_function_privilege('authenticated', 'public.diffuser_ajout_membre()', 'EXECUTE')")"
verifier "B (client, sous RLS) notifie A : l'écriture passe…" "1" \
  "$(AUTH "$B" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n_like_1', '$A', 'like', '$B', 'post_1', 'B aime ta publication') returning 1;")"
verifier "…et UNE poussée part, vers user:A seul, sous « notifications:INSERT »" \
  "user:$A>notifications:INSERT" "$(POUSSEES)"
verifier "privée, extension broadcast" "t|broadcast" "$(Q "select private::text || '|' || extension from realtime.messages limit 1;" | sed 's/^true/t/')"
verifier "la charge : table, opération, et la ligne colonne par colonne — sans « origine »" \
  "notifications|INSERT|content,created_at,from_id,id,kind,ref_id,seen,user_id" \
  "$(Q "select payload->>'table' || '|' || (payload->>'operation') || '|' || (select string_agg(k, ',' order by k) from jsonb_object_keys(payload->'record') k) from realtime.messages limit 1;")"
verifier "les valeurs sont celles de la ligne écrite" "n_like_1|$A|like|$B|post_1|false" \
  "$(Q "select concat_ws('|', payload->'record'->>'id', payload->'record'->>'user_id', payload->'record'->>'kind', payload->'record'->>'from_id', payload->'record'->>'ref_id', payload->'record'->>'seen') from realtime.messages limit 1;")"
VIDER
verifier "B ajoute A et C au groupe : une poussée par membre ajouté, à lui seul" \
  "user:$A>conv_members:INSERT,user:$C>conv_members:INSERT" \
  "$(AUTH "$B" "insert into public.conv_members (conv_id, user_id) values ('grp_1', '$A'), ('grp_1', '$C');" >/dev/null; POUSSEES)"
verifier "la charge d'un ajout : conv_id et user_id, rien d'autre" \
  "conv_members|INSERT|grp_1|$A|conv_id,user_id" \
  "$(Q "select payload->>'table' || '|' || (payload->>'operation') || '|' || (payload->'record'->>'conv_id') || '|' || (payload->'record'->>'user_id') || '|' || (select string_agg(k, ',' order by k) from jsonb_object_keys(payload->'record') k) from realtime.messages where topic = 'user:$A';")"
VIDER
verifier "B entre lui-même dans son groupe : son AUTRE appareil l'apprend (comme l'écoute filtrée d'avant)" \
  "user:$B>conv_members:INSERT" "$(AUTH "$B" "insert into public.conv_members (conv_id, user_id) values ('grp_1', '$B');" >/dev/null; POUSSEES)"
VIDER
verifier "aucune poussée ne porte le nom « INSERT » qu'un ancien client lirait comme un MESSAGE" "0" \
  "$(Q "insert into public.notifications (id, user_id, kind, from_id) values ('n_x', '$C', 'follow', '$B'); insert into public.conv_members values ('evgrp_ev_rando', '$C');
       select count(*) from realtime.messages where lower(event) = 'insert';")"
VIDER
verifier "une SUPPRESSION ne part nulle part (membre qui quitte, notification effacée)" "-" \
  "$(AUTH "$A" "delete from public.conv_members where conv_id = 'evgrp_ev_rando' and user_id = '$A'; delete from public.notifications where id = 'n_pa_ev_rando_____${A:0:8}';" >/dev/null; POUSSEES)"
verifier "…et elle a bien eu lieu (2 lignes de moins)" "0|0" \
  "$(Q "select count(*) from public.conv_members where conv_id = 'evgrp_ev_rando' and user_id = '$A'")|$(Q "select count(*) from public.notifications where id = 'n_pa_ev_rando_____${A:0:8}'")"
verifier "une notification LUE (UPDATE) ne part nulle part" "-" \
  "$(AUTH "$A" "update public.notifications set seen = true where id = 'n_like_1';" >/dev/null; POUSSEES)"
verifier "une notification sans destinataire s'écrit, sans poussée" "1|-" \
  "$(Q "insert into public.notifications (id, user_id, kind) values ('n_orpheline', null, 'systeme') returning 1;")|$(POUSSEES)"

echo "── ④ LE TOPIC user:<uid> : SON TITULAIRE LIT, PERSONNE N'ÉMET ────────"
Q "insert into public.notifications (id, user_id, kind, from_id) values ('n_lecture', '$A', 'like', '$B');" >/dev/null
verifier "A reçoit sur user:A" "oui" "$(RECOIT "$A" "user:$A")"
verifier "X ne peut pas s'abonner à user:A" "non" "$(RECOIT "$X" "user:$A")"
verifier "B, qui a écrit la notification, ne peut pas non plus" "non" "$(RECOIT "$B" "user:$A")"
contient "X ne peut pas ÉMETTRE sur user:A (une fausse notification)" "row-level security" "$(EMET "$X" "user:$A")"
contient "A non plus sur son propre topic : ce qui y arrive vient du serveur" "row-level security" "$(EMET "$A" "user:$A")"

echo "── ⑤ UNE POUSSÉE IMPOSSIBLE NE BLOQUE JAMAIS L'ÉCRITURE ───────────────"
VIDER
Q "alter function realtime.send(jsonb, text, text, boolean) rename to send_absente;" >/dev/null
verifier "realtime.send absente : la notification s'écrit quand même, l'ajout aussi" "1|1|-" \
  "$(AUTH "$B" "insert into public.notifications (id, user_id, kind, from_id) values ('n_sans_canal', '$A', 'like', '$B') returning 1;" | grep -v '^WARNING')|$(AUTH "$B" "insert into public.conv_members (conv_id, user_id) values ('evgrp_ev_rando', '$A') returning 1;" | grep -v '^WARNING')|$(POUSSEES)"
contient "…et l'avertissement nomme la cause" "diffuser_notification : poussee sautee" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -c "insert into public.notifications (id, user_id, kind, from_id) values ('n_sans_canal_2', '$A', 'like', '$B');" 2>&1)"
s="$(VERDICT_SEUL)"
verifier "…et le verdict le voit : la ligne realtime.send dit ECHEC" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "realtime.send")"
Q "alter function realtime.send_absente(jsonb, text, text, boolean) rename to send;" >/dev/null

echo "── ⑥ LE CANAL DES MESSAGES N'A PAS BOUGÉ ────────────────────────────"
VIDER
verifier "un message dans grp_1 part toujours à chaque membre, sous « INSERT »" \
  "user:$A>INSERT,user:$B>INSERT,user:$C>INSERT" \
  "$(Q "insert into public.conv_messages (id, conv_id, from_id, content) values ('m_1', 'grp_1', '$B', 'salut');" >/dev/null; POUSSEES)"

echo "── ⑦ RETOUR ARRIÈRE : L'ÉTAT D'AVANT, PUIS RÉAPPLICATION ─────────────"
VIDER
RETOUR_ARRIERE | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 \
  || { echo "  ❌ le bloc de retour arrière a échoué"; exit 1; }
verifier "les deux tables sont de nouveau décodées" "1|1" \
  "$(DECODEES | tr ',' '\n' | grep -cx 'public.conv_members')|$(DECODEES | tr ',' '\n' | grep -cx 'public.notifications')"
verifier "plus de trigger ni de fonction du lot" "0|0" \
  "$(Q "select count(*) from pg_trigger where tgname in ('trg_diffuser_notification', 'trg_diffuser_ajout_membre')")|$(Q "select count(*) from pg_proc where proname in ('diffuser_notification', 'diffuser_ajout_membre')")"
verifier "une notification ne pousse plus rien (le direct revient par postgres_changes, avec la fuite)" "-" \
  "$(Q "insert into public.notifications (id, user_id, kind, from_id) values ('n_apres_retour', '$A', 'like', '$B');" >/dev/null; POUSSEES)"
s3="$(APPLIQUER)" || { echo "  ❌ réapplication après retour arrière en échec"; echo "$s3" | tail -3; exit 1; }
verifier "la migration se réapplique après le retour arrière : 11 OK / 0 ECHEC" "11/0" "$(BILAN "$s3")"

echo "── ⑧ LE VERDICT NE PEUT PAS MENTIR ──────────────────────────────────"
s="$(VERDICT_SEUL)"; verifier "état sain : 11 OK / 0 ECHEC" "11/0" "$(BILAN "$s")"
# Chaque mutation est posée APRÈS la migration (qui l'aurait sinon réparée), et
# la ligne qui la garde doit dire ECHEC — elle seule.
Q "alter publication supabase_realtime add table public.notifications;" >/dev/null
s="$(VERDICT_SEUL)"; verifier "notifications republiée : la ligne de la publication rougit" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "HORS de supabase_realtime")"
Q "alter publication supabase_realtime drop table public.notifications; alter publication supabase_realtime drop table public.post_likes;" >/dev/null
s="$(VERDICT_SEUL)"; verifier "une AUTRE table retirée par erreur : la ligne des neuf rougit" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "neuf autres")"
Q "alter publication supabase_realtime add table public.post_likes;" >/dev/null
Q "alter table public.notifications disable trigger trg_diffuser_notification;" >/dev/null
s="$(VERDICT_SEUL)"; verifier "trigger des notifications désactivé : sa ligne rougit" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "trg_diffuser_notification")"
Q "alter table public.notifications enable trigger trg_diffuser_notification; alter table public.conv_members disable trigger trg_diffuser_ajout_membre;" >/dev/null
s="$(VERDICT_SEUL)"; verifier "trigger des ajouts désactivé : sa ligne rougit" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "trg_diffuser_ajout_membre")"
Q "alter table public.conv_members enable trigger trg_diffuser_ajout_membre;" >/dev/null
Q "alter function public.diffuser_notification() reset search_path;" >/dev/null
s="$(VERDICT_SEUL)"; verifier "search_path retiré d'une fonction : la ligne SECURITY DEFINER rougit" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "search_path vide")"
Q "alter function public.diffuser_notification() set search_path = '';" >/dev/null
Q "create role tiers_concedant; grant execute on function public.diffuser_ajout_membre() to tiers_concedant with grant option;
   set role tiers_concedant; grant execute on function public.diffuser_ajout_membre() to authenticated;" >/dev/null
s="$(VERDICT_SEUL)"; verifier "EXECUTE rendu à authenticated par un autre concédant : la ligne des droits rougit" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "aucun client (anon")"
s="$(APPLIQUER)"; verifier "…et la migration REJOUÉE ne le répare pas (PostgreSQL ne retire que ses propres droits) : elle le DIT" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "aucun client (anon")"
Q "set role tiers_concedant; revoke execute on function public.diffuser_ajout_membre() from authenticated;" >/dev/null
Q "drop policy \"Utilisateur reçoit ses messages\" on realtime.messages;" >/dev/null
s="$(VERDICT_SEUL)"; verifier "policy du topic user: retirée : sa ligne rougit" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "ne s'ouvre en lecture")"
Q "create policy \"Utilisateur reçoit ses messages\" on realtime.messages for select to authenticated using (realtime.topic() = ('user:' || (select auth.uid())::text));
   create policy lecture_trop_large on realtime.messages for select to authenticated using (true);" >/dev/null
s="$(VERDICT_SEUL)"; verifier "une policy de lecture ouverte à tous (USING true) : la même ligne rougit" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "ne s'ouvre en lecture")"
Q "drop policy lecture_trop_large on realtime.messages;
   create policy emission_user on realtime.messages for insert to authenticated with check (realtime.topic() ~~ 'user:%');" >/dev/null
contient "une policy d'ÉMISSION sur user: rend la fausse notification possible…" "emis" "$(EMET "$X" "user:$A")"
s="$(VERDICT_SEUL)"; verifier "…et le verdict le dit" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "ÉMETTRE sur user:")"
Q "drop policy emission_user on realtime.messages;" >/dev/null
Q "alter table public.conv_messages disable trigger broadcast_conv_message_users_trigger;" >/dev/null
s="$(VERDICT_SEUL)"; verifier "canal des messages coupé : sa ligne rougit" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "canal des messages")"
Q "alter table public.conv_messages enable trigger broadcast_conv_message_users_trigger;" >/dev/null
Q "create or replace function public.diffuser_notification() returns trigger language plpgsql security definer set search_path = ''
   as \$fn\$ begin perform realtime.send(jsonb_build_object('record', to_jsonb(new)), 'INSERT', 'user:' || new.user_id, true); return null; end \$fn\$;" >/dev/null
s="$(VERDICT_SEUL)"; verifier "fonction réécrite sous « INSERT » (le message fantôme) : la ligne des poussées rougit" "10/1|1" "$(BILAN "$s")|$(ROUGE "$s" "distinct de « INSERT »")"
s="$(APPLIQUER)"; verifier "la migration rejouée la remet en état : 11 OK / 0 ECHEC" "11/0" "$(BILAN "$s")"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
