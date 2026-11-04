#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_realtime_identite_opaque_2026-11-03.sql (R25)
#
# PostgreSQL jetable en `wal_level = logical`. Socle : les cinq tables de la
# migration avec leurs clés primaires, clés étrangères, index, GRANTs, RLS et
# identités de réplication de production (canal ①, 2026-11-03 et 2026-11-04 :
# comment_interactions en FULL, les autres en DEFAULT), les six autres tables
# de la publication, et `supabase_realtime` à l'identique (11 tables, sans
# liste de colonnes). Un slot logique `test_decoding` (livré avec PostgreSQL)
# montre ce que le WAL PUBLIE vraiment à chaque geste.
#
# PREUVE FORTE : le schéma `realtime` de production est recopié À L'OCTET —
# types, table `subscription` et son déclencheur, `apply_rls`,
# `is_visible_through_filters`, `check_equality_op`, `cast`,
# `build_prepared_statement_sql`, `to_regrole`, et `auth.uid()` — et le banc
# EXIGE que le md5 de chaque corps égale celui lu au canal ①. On nourrit
# `apply_rls` du WAL réel du banc, mis en forme comme wal2json (format 2,
# `include-pk`) le met : `identity` = les colonnes que le WAL porte (lues dans
# la sortie de `test_decoding`), `pk` = la clé primaire du catalogue — la
# logique de `pg_decode_write_change` de wal2json, relue dans sa source. Des
# abonnements comme ceux qu'un attaquant pose (sans filtre, filtrés sur la
# clé, sur rid, en visiteur) disent alors ce que Realtime LIVRE, avant et après.
#
#   ⓪ AVANT : un DELETE publie (conv_id, user_id), l'identifiant n_pa_ / n_fr_,
#      (post_id, user_id), et la ligne ENTIÈRE de comment_interactions ;
#   ③a AVANT, apply_rls : l'abonné sans filtre lit ces clés, l'abonné filtré
#      sur conv_id / user_id / id est servi, le visiteur aussi ;
#   ① application : essai à blanc (elle ne verrouille que ses cinq tables) ;
#      une table TENUE — la migration réessaie en NOWAIT sans jamais attendre ni
#      tenir de verrou pendant ses pauses (un lecteur n'attend pas), renonce
#      proprement, puis passe dès que la table se libère ; verdict, réécriture
#      non publiée, rid aléatoires sur 53 bits, rejeu ;
#   ①ter une AUTRE table publiée tenue (posts : en ACCESS EXCLUSIVE, puis
#      derrière un lecteur long avec un ACCESS EXCLUSIVE en file) — le verdict
#      seul comme la migration rejouée passent sans une attente de verrou
#      (constat de la contre-revue finale : `pg_publication_tables` ouvrait
#      chaque table publiée, et la migration attendait posts en tenant ses
#      cinq ; la ligne 5, elle, déparsait le défaut de posts) ;
#   ② APRÈS : un DELETE / UPDATE ne publie plus que rid (id pour
#      comment_interactions), un INSERT tout ; écritures du client, de la
#      restauration (chemin de restaurer-donnees.js), conflits de clé inchangés ;
#      les 53 bits MESURÉS (4 000 tirages par la garde, 4 000 par le défaut :
#      bornes, aucun bit figé, aucun doublon) ;
#   ②ter la GARDE : un rid fourni est ignoré (INSERT, UPDATE OF rid, upsert) ;
#      garde COUPÉE, X plante un rid sur une notification qu'il écrit à V et
#      apprend l'instant où V l'efface ; garde active, plus rien ;
#   ③b APRÈS, apply_rls : old_record null, les abonnés filtrés ne reçoivent
#      plus rien, les écoutes du client sont toujours servies ;
#   ③c L'ENCADREMENT (constat 1 des revues) : rid SÉQUENTIEL (le premier jet,
#      reconstitué), les rid de X avant / après encadrent la ligne de V et
#      `rid=in.(…)` livre son effacement ; le remède de l'en-tête (retour
#      arrière, puis ses quatre `drop column` en `--|+`, puis la migration)
#      RECRÉE la colonne — et ce `drop column` fait LEVER apply_rls sur un
#      effacement décodé après lui (pourquoi le retour arrière, lui, garde la
#      colonne) ; la même attaque ne reconnaît plus rien — sauf la ligne que
#      l'abonné LIT (le résidu, mesuré) ;
#   ④ le verdict ne peut pas mentir : chaque propriété cassée rougit SA ligne
#      (et seulement elle) — garde désarmée par WHEN (false), garde qui GARDE
#      un rid fourni par une ligne glissée en tête, rid redevenu compteur,
#      défaut `(<expression>) & 7` (et rejoué : la migration le DIT), table
#      publiée par SCHÉMA, partition FULL compris —, chaque réparation est
#      remesurée à 10 / 0 ; la migration extraite en CRLF rend 10 / 0 ;
#   ⑤ le retour arrière de l'en-tête rend l'identité d'avant et retire garde
#      et index, la colonne RESTE (inerte) : un effacement écrit avant lui et
#      décodé après est toujours livré ; un rid planté ou doublé pendant la
#      fenêtre est TIRÉ DE NOUVEAU quand on réapplique, sans rien publier.
#
# Le serveur Realtime (Elixir) n'est pas sur le banc : ce qui y est éprouvé,
# c'est la fonction SQL qui décide QUI reçoit QUOI.
#
#   bash tests/sql/migration-realtime-identite-opaque.test.sh
#
# Prérequis : PostgreSQL 15+ (binaires serveur, `test_decoding` ; le verdict lit
# `pg_publication_namespace` et ④l publie `tables in schema`, tous deux de la 15). Ne touche
# AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_realtime_identite_opaque_2026-11-03.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6400 + RANDOM % 100 ))
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
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses= -c wal_level=logical -c max_replication_slots=4 -c max_wal_senders=4\" -l '$BASE/pg.log' start" >/dev/null 2>&1
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

DB=rtident
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()     { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
LIBRE() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "$1" 2>&1; }
AUTH()  { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
          -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1; }
# Le SEUL tableau de verdict de la migration, exécuté sans le reste : ce qu'il
# mesure, et non ce que la migration vient de réparer.
VERDICT() { awk '/^-- ── Verdict/{f=1} /^commit;$/{f=0} f' "$MIGRATION" \
              | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f - 2>&1; }
RETOUR_ARRIERE() { sed -n 's/^--| //p' "$MIGRATION"; }
# Les quatre `drop column` explicites du remède de la PREMIÈRE VERSION (lignes
# « --|+ » de l'en-tête, qui suivent le retour arrière).
SUPPRESSION_RID() { sed -n 's/^--|+ //p' "$MIGRATION"; }
# OK/ECHEC du tableau de verdict d'une sortie de migration.
BILAN() { printf '%s/%s' "$(printf '%s\n' "$1" | grep -cE '\|\s*OK\s*$' || true)" "$(printf '%s\n' "$1" | grep -cE '\|\s*ECHEC\s*$' || true)"; }
# Nombre de lignes ECHEC dont l'intitulé contient `$2`.
ECHEC_SUR() { printf '%s\n' "$1" | grep -E '\|\s*ECHEC\s*$' | grep -cF -- "$2" || true; }
# Le slot rend ce que le WAL a publié depuis la dernière lecture ; on le range
# sous une étiquette de phase (tables UNLOGGED : elles-mêmes hors WAL).
FLUX() { Q "insert into banc.flux (phase, data) select '$1', data from pg_logical_slot_get_changes('banc', null, null) where data like 'table public.%';" >/dev/null; }
# Un motif LIKE porte des apostrophes (`id[text]:'n_pa_%`) : on les double.
APOS="'"
sql_lit() { printf '%s' "${1//$APOS/$APOS$APOS}"; }
LIGNE() { Q "select banc.ligne('$1', '$(sql_lit "$2")');"; }
# Ce que Realtime LIVRE à l'abonnement `$3` pour la ligne de WAL (`$1` phase,
# `$2` motif) : la clé `$4` du message (old_record par défaut), « non livré »
# si l'abonnement n'est pas servi.
RECU() { Q "select banc.recu('$1', '$(sql_lit "$2")', '$3', '${4:-old_record}');"; }
CLES() { Q "select banc.cles('$1', '$(sql_lit "$2")', '$3', '${4:-record}');"; }
# Avant la migration (ou après un refus) : colonnes rid présentes | identité de comment_interactions.
ETAT_AVANT() { printf '%s|%s' "$(Q "select count(*) from pg_attribute where attname = 'rid' and not attisdropped and attrelid in ('public.conv_members'::regclass, 'public.notifications'::regclass, 'public.conv_reads'::regclass, 'public.post_likes'::regclass);")" \
  "$(Q "select relreplident from pg_class where oid = 'public.comment_interactions'::regclass;")"; }
# « t » si, dans chacune des quatre tables, deux rid diffèrent de plus de 1 000 :
# un compteur les rendrait consécutifs ; 53 bits tirés au hasard, presque jamais
# (une cinquantaine de lignes : ~10⁻¹⁰).
ECARTS_RID() { Q "select coalesce(bool_and(e > 1000), false) from (select rid - lag(rid) over (partition by t order by rid) e from (
  select 'cm' t, rid from public.conv_members union all select 'no', rid from public.notifications
  union all select 'cr', rid from public.conv_reads union all select 'pl', rid from public.post_likes) u) s where e is not null;"; }
# « t » si tous les rid des quatre tables tiennent sur 53 bits : 0 ≤ rid ≤ 2⁵³ − 1
# (exacts en JSON, donc pour la sauvegarde et tout lecteur JavaScript).
RID_53() { Q "select coalesce(bool_and(rid between 0 and 9007199254740991), false) from (
  select rid from public.conv_members union all select rid from public.notifications
  union all select rid from public.conv_reads union all select rid from public.post_likes) u;"; }
# Tire $1 rid par la GARDE (INSERT ordinaire) ou par le DÉFAUT de colonne
# (`$2` = defaut : garde coupée, le chemin de la restauration), dans une
# transaction ANNULÉE (rien n'est écrit, rien n'est publié) ; rend
# « hors bornes | bit_or | bit_and | distincts ».
BITS_RID() {
  local coupe=""
  [ "$2" = defaut ] && coupe="alter table public.notifications disable trigger trg_rid_opaque;"
  Q "begin; $coupe
  insert into public.notifications (id, user_id, kind, from_id, content) select 'n_bits_' || g, '$X', 'like', '$X', 'b' from generate_series(1, $1) g;
  select count(*) filter (where rid not between 0 and 9007199254740991) || '|' || bit_or(rid) || '|' || bit_and(rid) || '|' || count(distinct rid) from public.notifications where id like 'n_bits_%';
  rollback;"; }
# Tous les rid, rangés par table et par clé (pour vérifier qu'un rejeu n'en touche aucun).
RIDS() { Q "select string_agg(t || ':' || rid, ',' order by t, k) from (
  select 'cm' t, conv_id || '/' || user_id k, rid from public.conv_members union all select 'no', id, rid from public.notifications
  union all select 'cr', conv_id || '/' || user_id, rid from public.conv_reads union all select 'pl', post_id || '/' || user_id, rid from public.post_likes) u;"; }
# Notifications d'identifiant `$1…`, prises dans l'ordre d'écriture : nombre de
# hausses de rid d'une ligne à la suivante | plus petit écart.
ORDRE() { Q "select count(*) filter (where rid > prec) || '|' || min(abs(rid - prec)) from (select rid, lag(rid) over (order by id) prec from public.notifications where id like '$1%') s where prec is not null;"; }

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }
correspond() { if printf '%s' "$3" | grep -qE -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

ORGA=11111111-1111-1111-1111-111111111111   # organise l'activité, crée sa discussion
V=22222222-2222-2222-2222-222222222222      # la victime : quitte, retire, est promue, demande à suivre
M=33333333-3333-3333-3333-333333333333      # compte PRIVÉ ; conversation 1:1 avec V
X=44444444-4444-4444-4444-444444444444      # l'attaquant : connecté, sans aucun lien
A=55555555-5555-5555-5555-555555555555      # compte d'archive (chemin de restauration)
B1=66666666-6666-6666-6666-666666666666     # deux comptes que X ajoute à SA conversation,
B2=77777777-7777-7777-7777-777777777777     #   juste avant et juste après le geste de V (③c)
EVGRP=evgrp_ev_rando_nov
NPA=n_pa_ev_rando_nov_22222222              # 'n_pa_' || left(activité, 12) || '_' || left(V, 8)
NFR=n_fr_22222222_33333333                  # 'n_fr_' || left(V, 8) || '_' || left(M, 8)
# Abonnements Realtime (subscription_id) : X sans filtre, X filtré sur la clé,
# le visiteur, et les écoutes RÉELLES du client (app-08 `_creerCanalDb`).
S_CM_X=00000000-0000-4000-8000-000000000001        # X, conv_members, « * », sans filtre
S_CM_X_CONV=00000000-0000-4000-8000-000000000002   # X, conv_members, DELETE, conv_id=eq.evgrp_…
S_CM_ANON=00000000-0000-4000-8000-000000000003     # visiteur (anon), conv_members, « * »
S_CM_V=00000000-0000-4000-8000-000000000004        # l'écoute du client de V : INSERT, user_id=eq.V
S_NO_X_LIKE=00000000-0000-4000-8000-000000000005   # X, notifications, DELETE, id=like.n_pa_%
S_NO_X=00000000-0000-4000-8000-000000000006        # X, notifications, « * »
S_PL_X=00000000-0000-4000-8000-000000000007        # X, post_likes, « * »
S_PL_X_V=00000000-0000-4000-8000-000000000008      # X, post_likes, DELETE, user_id=eq.V
S_CR_X=00000000-0000-4000-8000-000000000009        # X, conv_reads, « * » (l'écoute du client, chez X)
S_CR_M=00000000-0000-4000-8000-000000000010        # M, conv_reads, « * » (l'écoute du client, chez M)
S_CI_X_V=00000000-0000-4000-8000-000000000011      # X, comment_interactions, DELETE, user_id=eq.V
S_CI_X=00000000-0000-4000-8000-000000000012        # X, comment_interactions, DELETE (l'écoute du client)
S_NO_M=00000000-0000-4000-8000-000000000013        # l'écoute du client de M : notifications INSERT, user_id=eq.M
# Abonnements filtrés sur rid (②ter, ③c), posés en cours de banc.
S_NO_X_PLANTE1=00000000-0000-4000-8000-000000000014  # X, notifications, DELETE, rid=eq.<planté> — garde coupée
S_NO_X_PLANTE2=00000000-0000-4000-8000-000000000015  # X, notifications, DELETE, rid=eq.<planté> — garde active
S_ENC_X=00000000-0000-4000-8000-000000000016       # X, conv_members, DELETE, rid=in.(fenêtre) — premier jet
S_ENC_LT=00000000-0000-4000-8000-000000000017      # visiteur, conv_members, DELETE, rid=lt.r2 — premier jet
S_ENC_GTE=00000000-0000-4000-8000-000000000018     # visiteur, conv_members, DELETE, rid=gte.r2 — premier jet
S_ENC_NO=00000000-0000-4000-8000-000000000019      # X, notifications, DELETE, rid=in.(fenêtre) — premier jet
S_ENC2_FEN=00000000-0000-4000-8000-000000000020    # X, conv_members, DELETE, rid=in.(99 valeurs après r1) — aléatoire
S_ENC2_LUS=00000000-0000-4000-8000-000000000021    # X, conv_members, DELETE, rid=in.(tous les rid qu'il lit)
S_ENC2_ORGA=00000000-0000-4000-8000-000000000022   # ORGA, conv_members, DELETE, rid=eq.<rid de V, qu'il lit> — le résidu
S_ENC2_NO=00000000-0000-4000-8000-000000000023     # X, notifications, DELETE, rid=in.(99 valeurs après a1) — aléatoire

# ── SOCLE ───────────────────────────────────────────────────────────────────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
-- Les droits par défaut de `public` mesurés en production (pg_default_acl,
-- propriétaire postgres) : rwU sur toute séquence neuve, EXECUTE sur toute
-- fonction neuve, tout sur toute table neuve — pour anon, authenticated, service_role.
alter default privileges in schema public grant select, update, usage on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- auth.uid() : copie de production (pg_get_functiondef, 2026-11-03). Elle lit
-- `request.jwt.claim.sub` (PostgREST) OU `request.jwt.claims` (Realtime).
-- ⚠️ « select » y est suivi d'une ESPACE en fin de ligne, comme en production :
-- le md5 vérifié plus bas l'exige (un éditeur qui la retire fait rougir le banc).
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

-- Les cinq tables de la migration, colonnes / clés / index de production.
create table public.conv_members (conv_id text not null, user_id text not null, primary key (conv_id, user_id));
create index idx_conv_members_user on public.conv_members (user_id);
create table public.notifications (id text primary key, user_id text, kind text, from_id text, ref_id text, content text,
  seen boolean default false, created_at timestamp default now(), origine text not null default 'client');
create index idx_notifications_user on public.notifications (user_id, created_at desc);
create table public.conv_reads (conv_id text not null, user_id text not null, last_read_at timestamptz not null default now(),
  primary key (conv_id, user_id));
create table public.post_likes (post_id text not null, user_id text not null, primary key (post_id, user_id));
create index idx_likes_post on public.post_likes (post_id);
create table public.comment_interactions (id text primary key, comment_id text not null, post_id text, user_id text not null,
  kind text not null, payload text, created_at timestamptz not null default now());
create index idx_ci_comment on public.comment_interactions (comment_id);
create index idx_ci_user_created on public.comment_interactions (user_id, created_at);
alter table public.comment_interactions replica identity full;
-- Les six autres tables publiées (clé `id`, identité par défaut) et les tables
-- que lisent les policies.
create table public.conversations (id text primary key, is_group boolean default false, created_by text);
create table public.posts (id text primary key, author_id text not null, prive boolean not null default false);
create table public.post_comments (id text primary key, post_id text, author_id text);
create table public.conv_messages (id text primary key, conv_id text, from_id text, content text);
create table public.event_comments (id text primary key, event_id text, user_id text);
create table public.profiles (id text primary key, username text);
create table public.video_lives (id text primary key, user_id text);
-- Les deux clés étrangères de conv_members (production, pg_constraint, 2026-11-04) :
-- la migration réécrit conv_members, et ne doit verrouiller ni l'une ni l'autre cible.
alter table public.conv_members add constraint conv_members_conv_id_fkey foreign key (conv_id) references public.conversations (id),
  add constraint conv_members_user_id_fkey foreign key (user_id) references public.profiles (id);
alter table public.conv_members enable row level security;
alter table public.notifications enable row level security;
alter table public.conv_reads enable row level security;
alter table public.post_likes enable row level security;
alter table public.comment_interactions enable row level security;
alter table public.conversations enable row level security;
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.conv_messages enable row level security;
alter table public.event_comments enable row level security;
alter table public.profiles enable row level security;
alter table public.video_lives enable row level security;

-- GRANTs mesurés en production (relacl, 2026-11-03), après les droits par défaut.
revoke all on public.conv_members, public.notifications, public.conv_reads, public.post_likes, public.comment_interactions from anon, authenticated;
grant select, insert, update, delete on public.comment_interactions to anon, authenticated;   -- arwd
grant select, update, delete on public.conv_members to anon;                                 -- rwd
grant select, insert, update, delete on public.conv_members to authenticated;                -- arwd
grant select, insert, update, delete on public.conv_reads to anon, authenticated;             -- arwd
grant select on public.notifications to anon;                                                 -- r
grant select, insert, delete on public.notifications to authenticated;                        -- ard
grant update (seen) on public.notifications to authenticated;                                 -- seen=w
grant select, insert, update, delete on public.post_likes to anon, authenticated;             -- arwd

-- Fonctions des policies, réduites à ce qu'elles décident ici.
create function public.suppression_de_mon_compte() returns boolean language sql stable as $fn$ select false $fn$;
create function public.is_conv_member(_conv_id text, _uid text) returns boolean
language sql stable security definer set search_path to ''
as $fn$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $fn$;
create function public.is_conversation_creator(_conv_id text) returns boolean
language sql stable security definer set search_path to ''
as $fn$ select case when auth.uid() is null or _conv_id is null then false
  else exists (select 1 from public.conversations c where c.id = _conv_id and c.created_by = (auth.uid())::text) end $fn$;
create function public.post_is_visible(_post_id text) returns boolean
language sql stable security definer set search_path to ''
as $fn$ select exists (select 1 from public.posts p where p.id = _post_id and (not p.prive or p.author_id = (auth.uid())::text)) $fn$;
create function public.comment_target_visible(_comment_id text) returns boolean
language sql stable security definer set search_path to ''
as $fn$ select public.post_is_visible(coalesce((select c.post_id from public.post_comments c where c.id = _comment_id), _comment_id)) $fn$;

-- Policies de production (pg_policies, 2026-11-03), helpers réduits.
create policy "Suppression admin" on public.conv_members for delete
  using (user_id = (select auth.uid())::text
    or exists (select 1 from public.conversations c where c.id = conv_members.conv_id and c.created_by = (select auth.uid())::text));
create policy "Ecriture propre" on public.conv_members for insert to authenticated
  with check (public.is_conversation_creator(conv_id) and not public.suppression_de_mon_compte());
create policy conv_members_select_member on public.conv_members for select to authenticated
  using (public.is_conv_member(conv_id, (select auth.uid())::text));
create policy reads_upsert on public.conv_reads for insert to authenticated
  with check (user_id = (select auth.uid())::text and public.is_conv_member(conv_id, (select auth.uid())::text) and not public.suppression_de_mon_compte());
create policy reads_select on public.conv_reads for select to authenticated
  using (public.is_conv_member(conv_id, (select auth.uid())::text));
create policy reads_update on public.conv_reads for update to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text and public.is_conv_member(conv_id, (select auth.uid())::text) and not public.suppression_de_mon_compte());
create policy "Suppression propre" on public.notifications for delete using (user_id = (select auth.uid())::text);
create policy notifications_insert_own_author on public.notifications for insert to authenticated
  with check (from_id = (select auth.uid())::text and not public.suppression_de_mon_compte());
create policy "Lecture propre" on public.notifications for select using (user_id = (select auth.uid())::text);
create policy "Update propre" on public.notifications for update
  using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text and not public.suppression_de_mon_compte());
create policy "Suppression propre" on public.post_likes for delete using (user_id = (select auth.uid())::text);
create policy "Ecriture propre" on public.post_likes for insert to authenticated
  with check (user_id = (select auth.uid())::text and not public.suppression_de_mon_compte());
create policy "Lecture selon visibilite du post" on public.post_likes for select
  using (user_id = (select auth.uid())::text or public.post_is_visible(post_id));
create policy ci_delete on public.comment_interactions for delete using (user_id = (select auth.uid())::text);
create policy ci_insert on public.comment_interactions for insert
  with check (user_id = (select auth.uid())::text and not public.suppression_de_mon_compte());
create policy "Lecture selon visibilite de la cible" on public.comment_interactions for select
  using (user_id = (select auth.uid())::text or public.comment_target_visible(comment_id));
create policy conversations_lecture on public.conversations for select to authenticated using (public.is_conv_member(id, (select auth.uid())::text));
create policy posts_lecture on public.posts for select using (not prive or author_id = (select auth.uid())::text);

-- `follows` et `follows_notifier`, réduits à leur geste : la notification
-- s'écrit DANS la transaction du suivi, colonnes nommées, `on conflict (id)`
-- gardé par destinataire et émetteur (comme en production).
create table public.follows (follower_id text not null, following_id text not null, status text not null default 'accepted',
  primary key (follower_id, following_id));
alter table public.follows enable row level security;
revoke all on public.follows from anon, authenticated;
grant select, insert, delete on public.follows to authenticated;
create policy follows_lecture on public.follows for select to authenticated using (true);
create policy follows_insert_own on public.follows for insert to authenticated with check (follower_id = (select auth.uid())::text);
create function public.follows_notifier() returns trigger
language plpgsql security definer set search_path to ''
as $fn$
begin
  insert into public.notifications (id, user_id, kind, from_id, content, origine)
  values ('n_fw_' || left(new.follower_id, 8) || '_' || left(new.following_id, 8), new.following_id, 'follow', new.follower_id, 'suivi', 'serveur')
  on conflict (id) do update set content = excluded.content
    where public.notifications.user_id = excluded.user_id and public.notifications.from_id = excluded.from_id;
  return new;
end
$fn$;
create trigger trg_follows_notifier after insert on public.follows for each row execute function public.follows_notifier();

create publication supabase_realtime for table public.comment_interactions, public.conv_members, public.conv_messages,
  public.conv_reads, public.event_comments, public.notifications, public.post_comments, public.post_likes, public.posts,
  public.profiles, public.video_lives;

-- ── Le schéma `realtime` de production (canal ①, 2026-11-03) ──
-- Types (pg_type / pg_enum / pg_attribute), table `subscription` (colonnes,
-- contraintes, index, déclencheur), fonctions par pg_get_functiondef — corps
-- recopiés à l'octet, ce que le banc vérifie par md5 juste après.
create schema realtime;
create type realtime.action as enum ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'ERROR');
create type realtime.equality_op as enum ('eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'like', 'ilike', 'is', 'match', 'imatch', 'isdistinct');
create type realtime.user_defined_filter as (column_name text, op realtime.equality_op, value text, negate boolean);
create type realtime.wal_column as (name text, type_name text, type_oid oid, value jsonb, is_pkey boolean, is_selectable boolean);
create type realtime.wal_rls as (wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[]);

CREATE OR REPLACE FUNCTION realtime.to_regrole(role_name text)
 RETURNS regrole
 LANGUAGE sql
 IMMUTABLE
AS $function$ select role_name::regrole $function$;

create table realtime.subscription (
  id bigint generated always as identity,
  subscription_id uuid not null,
  entity regclass not null,
  filters realtime.user_defined_filter[] not null default '{}',
  claims jsonb not null,
  claims_role regrole not null generated always as (realtime.to_regrole((claims ->> 'role'::text))) stored,
  created_at timestamp without time zone not null default timezone('utc'::text, now()),
  action_filter text default '*'::text,
  selected_columns text[],
  constraint pk_subscription primary key (id),
  constraint subscription_action_filter_check check ((action_filter = any (array['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text]))));
create index ix_realtime_subscription_entity on realtime.subscription using btree (entity);
create unique index subscription_subscription_id_entity_filters_action_filter_selec on realtime.subscription
  using btree (subscription_id, entity, filters, action_filter, coalesce(selected_columns, '{}'::text[]));

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
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
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

CREATE OR REPLACE FUNCTION realtime.subscription_check_filters()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
    col_names text[] = coalesce(
            array_agg(a.attname order by a.attnum),
            '{}'::text[]
        )
        from
            pg_catalog.pg_attribute a
        where
            a.attrelid = new.entity
            and a.attnum > 0
            and not a.attisdropped
            and pg_catalog.has_column_privilege(
                (new.claims ->> 'role'),
                a.attrelid,
                a.attnum,
                'SELECT'
            );
    filter realtime.user_defined_filter;
    col_type regtype;
    in_val jsonb;
    selected_col text;
begin
    for filter in select * from unnest(new.filters) loop
        if not filter.column_name = any(col_names) then
            raise exception 'invalid column for filter %', filter.column_name;
        end if;

        col_type = (
            select atttypid::regtype
            from pg_catalog.pg_attribute
            where attrelid = new.entity
                  and attname = filter.column_name
        );
        if col_type is null then
            raise exception 'failed to lookup type for column %', filter.column_name;
        end if;

        if filter.op = 'in'::realtime.equality_op then
            in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
            if coalesce(jsonb_array_length(in_val), 0) > 100 then
                raise exception 'too many values for `in` filter. Maximum 100';
            end if;
        elsif filter.op = 'is'::realtime.equality_op then
            -- `is` requires a keyword RHS rather than a typed literal
            if filter.value not in ('null', 'true', 'false', 'unknown') then
                raise exception 'invalid value for is filter: must be null, true, false, or unknown';
            end if;
            -- IS NULL works for any type, but IS TRUE/FALSE/UNKNOWN require a boolean
            -- operand. Reject the non-null keywords on non-boolean columns here so they
            -- don't abort apply_rls at WAL time.
            if filter.value <> 'null' and col_type <> 'boolean'::regtype then
                raise exception 'is % filter requires a boolean column, got %', filter.value, col_type::text;
            end if;
        elsif filter.op in ('like'::realtime.equality_op, 'ilike'::realtime.equality_op) then
            -- like/ilike apply the text pattern operator (~~); reject column types that
            -- have no such operator instead of failing at WAL time
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = '~~' and oprleft = col_type
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
        elsif filter.op in ('match'::realtime.equality_op, 'imatch'::realtime.equality_op) then
            -- match/imatch apply the regex operators ~ / ~*; reject column types that have
            -- no such operator (e.g. integer) instead of failing at WAL time, mirroring the
            -- like/ilike guard above.
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = case when filter.op = 'imatch'::realtime.equality_op then '~*' else '~' end
                  and oprleft = col_type
                  and oprright = col_type
                  and oprresult = 'boolean'::regtype
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
            -- validate the regex eagerly so a bad pattern is rejected here, not inside
            -- apply_rls where it would abort the WAL stream for the entity
            begin
                perform '' ~ filter.value;
            exception when others then
                raise exception 'invalid regular expression for % filter: %', filter.op::text, sqlerrm;
            end;
        else
            -- eq/neq/lt/lte/gt/gte: value must be coercable to the type
            perform realtime.cast(filter.value, col_type);
        end if;
    end loop;

    if new.selected_columns is not null then
        for selected_col in select * from unnest(new.selected_columns) loop
            if not selected_col = any(col_names) then
                raise exception 'invalid column for select %', selected_col;
            end if;
        end loop;
    end if;

    -- Apply consistent order to filters so the unique constraint can't be tricked by a
    -- different filter order. negate is part of the sort key.
    new.filters = coalesce(
        array_agg(f order by f.column_name, f.op, f.value, f.negate),
        '{}'
    ) from unnest(new.filters) f;

    -- Normalize selected_columns order so ARRAY['a','b'] and ARRAY['b','a'] are treated
    -- as the same subscription group in apply_rls. Preserve an empty array as '{}'
    -- ("primary keys only") so it stays distinct from NULL ("all columns"); array_agg
    -- over an empty set would otherwise collapse '{}' back to NULL.
    if new.selected_columns is not null then
        new.selected_columns = coalesce(
            (
                select array_agg(c order by c)
                from unnest(new.selected_columns) c
            ),
            '{}'::text[]
        );
    end if;

    return new;
end;
$function$;
create trigger tr_check_filters before insert or update on realtime.subscription
  for each row execute function realtime.subscription_check_filters();

-- ── L'outillage du banc (schéma `banc`, tables UNLOGGED : hors WAL) ──
create schema banc;
create unlogged table banc.flux (n bigserial primary key, phase text not null, data text not null);

-- Une ligne de `test_decoding` découpée en colonnes : nom, type, valeur (sans
-- guillemets, '' dédoublés), nulle ou non, rang.
create function banc.colonnes_td(p text) returns table (nom text, typ text, val text, nul boolean, rang bigint)
language sql immutable as $fn$
  select r.m[1], r.m[2],
         case when r.m[3] = 'null' then null
              when left(r.m[3], 1) = '''' then replace(substr(r.m[3], 2, length(r.m[3]) - 2), '''''', '''')
              else r.m[3] end,
         r.m[3] = 'null', r.o
    from regexp_matches(coalesce(p, ''), '([a-z_][a-z0-9_]*)\[([^]]+)\]:(''(?:[^'']|'''')*''|[^ ]+)', 'g') with ordinality as r(m, o)
$fn$;

-- La ligne de WAL d'une phase, la plus récente qui correspond au motif. Une
-- ligne ABSENTE lève : elle ne doit jamais se lire « non livrée ».
create function banc.ligne(p_phase text, p_motif text) returns text language plpgsql stable as $fn$
declare l text;
begin
  select f.data into l from banc.flux f where f.phase = p_phase and f.data like p_motif order by f.n desc limit 1;
  if l is null then raise exception 'ligne de WAL introuvable : % / %', p_phase, p_motif; end if;
  return l;
end $fn$;

-- La ligne de `test_decoding` mise en forme comme wal2json (format-version 2,
-- include-pk, include-type-oids, include-timestamp) — la logique de
-- `pg_decode_write_change` de wal2json, relue dans sa source :
--   · columns  (INSERT, UPDATE) : le NOUVEAU tuple, toutes les colonnes ;
--   · identity (DELETE, et UPDATE) : l'ANCIEN tuple que le WAL porte, réduit
--     aux colonnes de l'identité de réplication (toutes en FULL) ; pour un
--     UPDATE sans ancien tuple, ces colonnes lues dans le nouveau ;
--   · pk : la clé primaire du catalogue (noms et types, sans valeurs).
create function banc.wal_v2(p_ligne text) returns jsonb language plpgsql stable as $fn$
declare
  m        text[];
  v_rel    regclass;
  v_ancien text;
  v_neuf   text;
  v_ident  int2[];
  v_rep    "char";
  v_cols   jsonb;
  v_id     jsonb;
  v_pk     jsonb;
begin
  m := regexp_match(p_ligne, '^table ([^.]+)\.([^:]+): (INSERT|UPDATE|DELETE): (.*)$');
  if m is null then raise exception 'ligne de WAL illisible : %', p_ligne; end if;
  v_rel := (quote_ident(m[1]) || '.' || quote_ident(m[2]))::regclass;
  if m[3] = 'DELETE' then
    v_ancien := m[4];
  elsif m[3] = 'UPDATE' and m[4] like 'old-key: %' then
    v_ancien := substring(m[4] from '^old-key: (.*) new-tuple: ');
    v_neuf   := substring(m[4] from ' new-tuple: (.*)$');
  else
    v_neuf := m[4];
  end if;
  select c.relreplident into v_rep from pg_class c where c.oid = v_rel;
  v_ident := case v_rep
    when 'd' then (select i.indkey::int2[] from pg_index i where i.indrelid = v_rel and i.indisprimary)
    when 'i' then (select i.indkey::int2[] from pg_index i where i.indrelid = v_rel and i.indisreplident)
    when 'f' then null
    else '{}'::int2[] end;
  if v_neuf is not null then
    select jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'typeoid', a.atttypid,
                                        'value', case when t.nom is null or t.nul then 'null'::jsonb else to_jsonb(t.val) end) order by a.attnum)
      into v_cols
      from pg_attribute a left join banc.colonnes_td(v_neuf) t on t.nom = a.attname
     where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped;
  end if;
  if v_ancien is not null or m[3] = 'UPDATE' then
    select jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'typeoid', a.atttypid,
                                        'value', case when t.nom is null or t.nul then 'null'::jsonb else to_jsonb(t.val) end) order by a.attnum)
      into v_id
      from pg_attribute a left join banc.colonnes_td(coalesce(v_ancien, v_neuf)) t on t.nom = a.attname
     where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
       and (v_ident is null or a.attnum = any (v_ident));
  end if;
  select jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'typeoid', a.atttypid) order by a.attnum)
    into v_pk
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
   where i.indrelid = v_rel and i.indisprimary;
  return jsonb_build_object('action', left(m[3], 1), 'timestamp', now()::text, 'schema', m[1], 'table', m[2], 'pk', coalesce(v_pk, '[]'::jsonb))
      || case when v_cols is not null then jsonb_build_object('columns', v_cols) else '{}'::jsonb end
      || case when v_id is not null then jsonb_build_object('identity', v_id) else '{}'::jsonb end;
end $fn$;

-- Ce que `realtime.apply_rls` livre à un abonnement pour une ligne de WAL : la
-- clé demandée du message, ou « non livré ».
create function banc.recu(p_phase text, p_motif text, p_abonnement uuid, p_cle text) returns text language sql volatile as $fn$
  select coalesce(
    (select coalesce((r.wal -> p_cle)::text, 'absent')
       from realtime.apply_rls(banc.wal_v2(banc.ligne(p_phase, p_motif))) r
      where p_abonnement = any (r.subscription_ids) limit 1),
    'non livré')
$fn$;
-- …ou seulement ses clés, triées (un rid varie d'une exécution à l'autre).
create function banc.cles(p_phase text, p_motif text, p_abonnement uuid, p_cle text) returns text language sql volatile as $fn$
  select coalesce(
    (select coalesce((select string_agg(k, ',' order by k) from jsonb_object_keys(case when jsonb_typeof(r.wal -> p_cle) = 'object' then r.wal -> p_cle else '{}'::jsonb end) k), 'aucune')
       from realtime.apply_rls(banc.wal_v2(banc.ligne(p_phase, p_motif))) r
      where p_abonnement = any (r.subscription_ids) limit 1),
    'non livré')
$fn$;

-- Un DELETE ÉCRIT AVANT un changement de schéma et DÉCODÉ APRÈS (Realtime en
-- retard sur le slot) : wal2json le décode avec le catalogue HISTORIQUE — son
-- identité, ce sont les colonnes que la ligne de WAL porte, avec leurs noms et
-- types d'alors (test_decoding lit le même catalogue historique), et non
-- celles du catalogue courant comme `banc.wal_v2` les reconstruit. `pk` : la
-- clé primaire (inchangée).
create function banc.wal_v2_historique(p_ligne text) returns jsonb language plpgsql stable as $fn$
declare
  m    text[];
  v_id jsonb;
  v_pk jsonb;
begin
  m := regexp_match(p_ligne, '^table ([^.]+)\.([^:]+): DELETE: (.*)$');
  if m is null then raise exception 'ligne de DELETE illisible : %', p_ligne; end if;
  select jsonb_agg(jsonb_build_object('name', t.nom, 'type', t.typ, 'typeoid', t.typ::regtype::oid,
                                      'value', case when t.nul then 'null'::jsonb else to_jsonb(t.val) end) order by t.rang)
    into v_id from banc.colonnes_td(m[3]) t;
  select jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'typeoid', a.atttypid) order by a.attnum)
    into v_pk
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
   where i.indrelid = (quote_ident(m[1]) || '.' || quote_ident(m[2]))::regclass and i.indisprimary;
  return jsonb_build_object('action', 'D', 'timestamp', now()::text, 'schema', m[1], 'table', m[2],
                            'pk', coalesce(v_pk, '[]'::jsonb), 'identity', coalesce(v_id, '[]'::jsonb));
end $fn$;
create function banc.recu_historique(p_phase text, p_motif text, p_abonnement uuid, p_cle text) returns text language sql volatile as $fn$
  select coalesce(
    (select coalesce((r.wal -> p_cle)::text, 'absent')
       from realtime.apply_rls(banc.wal_v2_historique(banc.ligne(p_phase, p_motif))) r
      where p_abonnement = any (r.subscription_ids) limit 1),
    'non livré')
$fn$;
SQL

# Données : une activité et sa discussion, un 1:1 V–M, la publication privée de
# M, une publique, des notifications aux identifiants qui parlent.
Q "insert into public.profiles (id, username) values ('$ORGA', 'orga'), ('$V', 'v'), ('$M', 'm'), ('$X', 'x'), ('$A', 'a'), ('$B1', 'b1'), ('$B2', 'b2');
   insert into public.conversations (id, is_group, created_by) values ('$EVGRP', true, '$ORGA'), ('dm_vm', false, '$V'), ('dm_xo', false, '$X');
   insert into public.conv_members (conv_id, user_id) values ('$EVGRP', '$ORGA'), ('$EVGRP', '$V'), ('dm_vm', '$V'), ('dm_vm', '$M'), ('dm_xo', '$X'), ('dm_xo', '$ORGA');
   insert into public.conv_reads (conv_id, user_id) values ('dm_vm', '$V'), ('dm_vm', '$M'), ('dm_xo', '$X');
   insert into public.posts (id, author_id, prive) values ('p_prive', '$M', true), ('p_public', '$ORGA', false);
   insert into public.post_comments (id, post_id, author_id) values ('c_pub', 'p_public', '$ORGA');
   insert into public.post_likes (post_id, user_id) values ('p_prive', '$V'), ('p_public', '$V'), ('p_public', '$X');
   insert into public.notifications (id, user_id, kind, from_id, ref_id, content, origine) values
     ('$NPA', '$V', 'event_update', '$ORGA', 'ev_rando_nov', 'Une place s''est libérée', 'serveur'),
     ('$NFR', '$M', 'follow_request', '$V', null, 'demande', 'serveur'),
     ('n_x_soi', '$X', 'like', '$X', null, 'x', 'client');
   insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values
     ('ci_v1', 'c_pub', 'p_public', '$V', 'like', null), ('ci_o1', 'c_pub', 'p_public', '$ORGA', 'emoji', 'joie');" >/dev/null
Q "insert into realtime.subscription (subscription_id, entity, filters, claims, action_filter) values
   ('$S_CM_X', 'public.conv_members', '{}', '{\"role\":\"authenticated\",\"sub\":\"$X\"}', '*'),
   ('$S_CM_X_CONV', 'public.conv_members', array[('conv_id','eq','$EVGRP',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE'),
   ('$S_CM_ANON', 'public.conv_members', '{}', '{\"role\":\"anon\"}', '*'),
   ('$S_CM_V', 'public.conv_members', array[('user_id','eq','$V',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$V\"}', 'INSERT'),
   ('$S_NO_X_LIKE', 'public.notifications', array[('id','like','n_pa_%',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE'),
   ('$S_NO_X', 'public.notifications', '{}', '{\"role\":\"authenticated\",\"sub\":\"$X\"}', '*'),
   ('$S_PL_X', 'public.post_likes', '{}', '{\"role\":\"authenticated\",\"sub\":\"$X\"}', '*'),
   ('$S_PL_X_V', 'public.post_likes', array[('user_id','eq','$V',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE'),
   ('$S_CR_X', 'public.conv_reads', '{}', '{\"role\":\"authenticated\",\"sub\":\"$X\"}', '*'),
   ('$S_CR_M', 'public.conv_reads', '{}', '{\"role\":\"authenticated\",\"sub\":\"$M\"}', '*'),
   ('$S_CI_X_V', 'public.comment_interactions', array[('user_id','eq','$V',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE'),
   ('$S_CI_X', 'public.comment_interactions', '{}', '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE'),
   ('$S_NO_M', 'public.notifications', array[('user_id','eq','$M',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$M\"}', 'INSERT');" >/dev/null

echo "── SOCLE : le temps réel de production, à l'octet ─────────────────────"
# md5 de prosrc lus au canal ① le 2026-11-03 (production en PostgreSQL 17.6).
md5_de() { Q "select md5(prosrc) from pg_proc where oid = '$1'::regprocedure;"; }
verifier "realtime.apply_rls : corps de production à l'octet (md5)" "5d7c08428b259b87336d4a362800f051" "$(md5_de 'realtime.apply_rls(jsonb,integer)')"
verifier "realtime.is_visible_through_filters : idem" "9d8bfe1610d49594cccaed58da98d7c6" "$(md5_de 'realtime.is_visible_through_filters(realtime.wal_column[],realtime.user_defined_filter[])')"
verifier "realtime.check_equality_op (5 arguments, celui qu'appelle le filtre) : idem" "234c4bbee6ffbcfdbf492b1ef3933f91" "$(md5_de 'realtime.check_equality_op(realtime.equality_op,regtype,text,text,boolean)')"
verifier "realtime.cast : idem" "f773479a213568da2db99fb8d5a2851a" "$(md5_de 'realtime."cast"(text,regtype)')"
verifier "realtime.build_prepared_statement_sql : idem" "6fe8db9ff2579186cfe1fafd84d5d7f0" "$(md5_de 'realtime.build_prepared_statement_sql(text,regclass,realtime.wal_column[])')"
verifier "realtime.subscription_check_filters : idem" "2f093b2c8ac47f69bee9d8c357a4ea79" "$(md5_de 'realtime.subscription_check_filters()')"
verifier "realtime.to_regrole : idem" "5f48a9ebcc8c067a55dafa2685d46b03" "$(md5_de 'realtime.to_regrole(text)')"
verifier "auth.uid() : idem" "cdef18c69c4f4cbbced2eaf81e628b49" "$(md5_de 'auth.uid()')"
verifier "identités de réplication de production : comment_interactions FULL, les dix autres publiées DEFAULT" "comment_interactions:f|10" \
  "$(Q "select string_agg(c.relname || ':' || c.relreplident::text, ',') filter (where c.relreplident <> 'd') || '|' || count(*) filter (where c.relreplident = 'd') from pg_publication_tables pt join pg_class c on c.relname = pt.tablename where pt.pubname = 'supabase_realtime';")"
verifier "le déclencheur de production valide les filtres : un filtre sur une colonne inconnue est refusé" "1" \
  "$(LIBRE "insert into realtime.subscription (subscription_id, entity, filters, claims) values (gen_random_uuid(), 'public.conv_members', array[('inconnue','eq','x',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\"}');" | grep -c "invalid column for filter" || true)"

slot="$(Q "select 1 from pg_create_logical_replication_slot('banc', 'test_decoding');" || true)"
if [ "$slot" != "1" ]; then
  echo "❌ slot logique test_decoding impossible (wal_level = logical ? test_decoding installé ?) — aucun résultat n'est exploitable"
  echo "$slot" | tail -3
  exit 1
fi

echo "── ⓪ AVANT : ce que le WAL publie aujourd'hui à chaque effacement ─────"
verifier "les lignes existent (j'aime de V sur la publication privée, accusés de dm_vm, membres de la discussion)…" "1|2|2" \
  "$(Q "select count(*) from public.post_likes where post_id = 'p_prive';")|$(Q "select count(*) from public.conv_reads where conv_id = 'dm_vm';")|$(Q "select count(*) from public.conv_members where conv_id = '$EVGRP';")"
verifier "…et la RLS les cache à X : 0, 0, 0" "0|0|0" \
  "$(AUTH "$X" "select count(*) from public.post_likes where post_id = 'p_prive';")|$(AUTH "$X" "select count(*) from public.conv_reads where conv_id = 'dm_vm';")|$(AUTH "$X" "select count(*) from public.conv_members where conv_id = '$EVGRP';")"
verifier "V quitte la discussion d'activité (DELETE de SA ligne conv_members)" "1" "$(AUTH "$V" "delete from public.conv_members where conv_id = '$EVGRP' and user_id = '$V' returning 1;")"
verifier "V efface sa notification de promotion ; M efface la demande de suivi de V" "1|1" \
  "$(AUTH "$V" "delete from public.notifications where id = '$NPA' returning 1;")|$(AUTH "$M" "delete from public.notifications where id = '$NFR' returning 1;")"
verifier "V retire son « j'aime » de la publication PRIVÉE de M" "1" "$(AUTH "$V" "delete from public.post_likes where post_id = 'p_prive' and user_id = '$V' returning 1;")"
Q "delete from public.conv_reads where conv_id = 'dm_vm' and user_id = '$V';" >/dev/null
verifier "V retire son interaction de commentaire" "1" "$(AUTH "$V" "delete from public.comment_interactions where id = 'ci_v1' returning 1;")"
verifier "M marque la conversation lue (UPDATE de son accusé)" "dm_vm" "$(AUTH "$M" "update public.conv_reads set last_read_at = now() where conv_id = 'dm_vm' and user_id = '$M' returning conv_id;")"
Q "update public.comment_interactions set payload = 'rire' where id = 'ci_o1';" >/dev/null
Q "update public.notifications set id = 'n_x_soi_bis' where id = 'n_x_soi';" >/dev/null
FLUX avant
verifier "WAL : le DELETE de conv_members porte QUI quitte QUELLE discussion" \
  "table public.conv_members: DELETE: conv_id[text]:'$EVGRP' user_id[text]:'$V'" "$(LIGNE avant 'table public.conv_members: DELETE:%')"
verifier "WAL : le DELETE de notifications porte l'identifiant n_pa_<activité12>_<compte8> (qui a été promu)" \
  "table public.notifications: DELETE: id[text]:'$NPA'" "$(LIGNE avant "table public.notifications: DELETE: id[text]:'n_pa_%")"
verifier "WAL : …et n_fr_<A8>_<V8> (qui a demandé à suivre un compte privé)" \
  "table public.notifications: DELETE: id[text]:'$NFR'" "$(LIGNE avant "table public.notifications: DELETE: id[text]:'n_fr_%")"
verifier "WAL : le DELETE de post_likes porte (publication privée, compte)" \
  "table public.post_likes: DELETE: post_id[text]:'p_prive' user_id[text]:'$V'" "$(LIGNE avant 'table public.post_likes: DELETE:%')"
verifier "WAL : le DELETE de conv_reads porte (conversation, compte)" \
  "table public.conv_reads: DELETE: conv_id[text]:'dm_vm' user_id[text]:'$V'" "$(LIGNE avant 'table public.conv_reads: DELETE:%')"
correspond "WAL : comment_interactions (FULL) porte la ligne ENTIÈRE — commentaire, publication, compte, genre, date" \
  "^table public\.comment_interactions: DELETE: id\[text\]:'ci_v1' comment_id\[text\]:'c_pub' post_id\[text\]:'p_public' user_id\[text\]:'$V' kind\[text\]:'like' created_at\[timestamp with time zone\]:'[^']+'$" \
  "$(LIGNE avant 'table public.comment_interactions: DELETE:%')"
contient "WAL : …et chacun de ses UPDATE publie l'ANCIENNE ligne entière (old-key: … payload …)" "old-key: id\[text\]:'ci_o1' comment_id\[text\]:'c_pub' post_id\[text\]:'p_public' user_id\[text\]:'$ORGA' kind\[text\]:'emoji' payload\[text\]:'joie'" \
  "$(LIGNE avant 'table public.comment_interactions: UPDATE:%')"
contient "WAL : un UPDATE qui change la clé de notifications publie l'ANCIENNE clé" "UPDATE: old-key: id\[text\]:'n_x_soi' new-tuple:" \
  "$(LIGNE avant 'table public.notifications: UPDATE:%')"

echo "── ③a AVANT : ce que realtime.apply_rls (production) LIVRE ─────────────"
verifier "X, abonné SANS filtre à conv_members : old_record = (discussion, compte qui la quitte)" \
  "{\"conv_id\": \"$EVGRP\", \"user_id\": \"$V\"}" "$(RECU avant 'table public.conv_members: DELETE:%' "$S_CM_X")"
verifier "X, abonné filtré conv_id=eq.<discussion> : servi — il guette une activité précise" \
  "{\"conv_id\": \"$EVGRP\", \"user_id\": \"$V\"}" "$(RECU avant 'table public.conv_members: DELETE:%' "$S_CM_X_CONV")"
verifier "un VISITEUR (anon) sans filtre : servi de même" \
  "{\"conv_id\": \"$EVGRP\", \"user_id\": \"$V\"}" "$(RECU avant 'table public.conv_members: DELETE:%' "$S_CM_ANON")"
verifier "X filtré id=like.n_pa_% : servi, old_record = l'identifiant de la promotion" \
  "{\"id\": \"$NPA\"}" "$(RECU avant "table public.notifications: DELETE: id[text]:'n_pa_%" "$S_NO_X_LIKE")"
verifier "X sans filtre : la demande de suivi d'un compte privé (n_fr_…)" \
  "{\"id\": \"$NFR\"}" "$(RECU avant "table public.notifications: DELETE: id[text]:'n_fr_%" "$S_NO_X")"
verifier "X sans filtre : le « j'aime » retiré de la publication PRIVÉE (qu'il ne peut pas lire)" \
  "{\"post_id\": \"p_prive\", \"user_id\": \"$V\"}" "$(RECU avant 'table public.post_likes: DELETE:%' "$S_PL_X")"
verifier "X filtré user_id=eq.V sur post_likes : servi" \
  "{\"post_id\": \"p_prive\", \"user_id\": \"$V\"}" "$(RECU avant 'table public.post_likes: DELETE:%' "$S_PL_X_V")"
verifier "X sans filtre (l'écoute « * » du client) : l'accusé effacé dit qui appartient à dm_vm" \
  "{\"conv_id\": \"dm_vm\", \"user_id\": \"$V\"}" "$(RECU avant 'table public.conv_reads: DELETE:%' "$S_CR_X")"
verifier "comment_interactions : X filtré user_id=eq.V est SERVI (l'oracle), sur une charge réduite à id" \
  "{\"id\": \"ci_v1\"}" "$(RECU avant 'table public.comment_interactions: DELETE:%' "$S_CI_X_V")"
verifier "…et l'écoute DELETE du client reçoit {id} (RLS active : clé primaire seule)" \
  "{\"id\": \"ci_v1\"}" "$(RECU avant 'table public.comment_interactions: DELETE:%' "$S_CI_X")"
verifier "l'UPDATE d'un accusé passe la RLS : M (membre) le reçoit, old_record = la clé…" \
  "{\"conv_id\": \"dm_vm\", \"user_id\": \"$M\"}" "$(RECU avant 'table public.conv_reads: UPDATE:%' "$S_CR_M")"
verifier "…X (non membre) ne le reçoit pas" "non livré" "$(RECU avant 'table public.conv_reads: UPDATE:%' "$S_CR_X")"
verifier "l'écoute INSERT de V ne reçoit pas un DELETE (filtre d'action)" "non livré" "$(RECU avant 'table public.conv_members: DELETE:%' "$S_CM_V")"

# Les lignes effacées reviennent : la migration les réécrira, et ② les effacera de nouveau.
Q "insert into public.conv_members (conv_id, user_id) values ('$EVGRP', '$V');
   insert into public.notifications (id, user_id, kind, from_id, ref_id, content, origine) values
     ('$NPA', '$V', 'event_update', '$ORGA', 'ev_rando_nov', 'Une place s''est libérée', 'serveur'), ('$NFR', '$M', 'follow_request', '$V', null, 'demande', 'serveur');
   insert into public.post_likes (post_id, user_id) values ('p_prive', '$V');
   insert into public.conv_reads (conv_id, user_id) values ('dm_vm', '$V');
   insert into public.comment_interactions (id, comment_id, post_id, user_id, kind) values ('ci_v1', 'c_pub', 'p_public', '$V', 'like');
   update public.notifications set id = 'n_x_soi' where id = 'n_x_soi_bis';" >/dev/null
FLUX remise


echo "── ① APPLICATION ───────────────────────────────────────────────────"
# Ce que la migration VERROUILLE, relevé dans SA transaction : elle est jouée
# sans son `commit;` final, on lit pg_locks, puis on annule.
A_BLANC() { sed 's/^commit;$/-- (commit retiré par le banc : essai à blanc)/' "$MIGRATION"; printf '%s\n' "$1" "rollback;"; }
sortie_blanc="$(A_BLANC "select 'VERROUS=' || string_agg(distinct c.relname::text, ',' order by c.relname::text) from pg_locks l join pg_class c on c.oid = l.relation join pg_namespace n on n.oid = c.relnamespace where l.pid = pg_backend_pid() and l.granted and n.nspname = 'public' and c.relkind in ('r', 'p');" \
  | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f - 2>&1)" || { echo "  ❌ l'essai à blanc a échoué :"; echo "$sortie_blanc" | tail -5; exit 1; }
verifier "essai à blanc (sans commit) : le verdict rend 10 OK / 0 ECHEC" "10/0" "$(BILAN "$sortie_blanc")"
verifier "la migration ne verrouille QUE ses cinq tables — ni conversations ni profiles, que conv_members référence" \
  "VERROUS=comment_interactions,conv_members,conv_reads,notifications,post_likes" "$(printf '%s\n' "$sortie_blanc" | grep -o 'VERROUS=[a-z_,]*' | tail -1)"
verifier "…et l'essai annulé ne laisse rien : aucune colonne rid, comment_interactions toujours FULL" "0|f" "$(ETAT_AVANT)"

# ①bis Une transaction TIENT post_likes (la 4ᵉ des cinq). La migration doit
# réessayer en NOWAIT sans rien tenir pendant ses pauses, puis renoncer
# proprement. Pendant ce temps, on relève : un lecteur de conv_reads (la 1ʳᵉ
# prise — celle que la première version gardait en attendant), les demandes de
# verrou NON accordées de la migration, et sa pause (pg_sleep).
APPLI=r25_banc_migration
TENIR() {
  psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -c "begin; lock table public.post_likes in access share mode; select pg_sleep($1); commit;" >/dev/null 2>&1 &
  TENEUR=$!
  for _ in $(seq 1 80); do
    [ "$(Q "select count(*) from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'post_likes' and l.mode = 'AccessShareLock' and l.granted and l.pid <> pg_backend_pid();")" -ge 1 ] 2>/dev/null && break
    sleep 0.1
  done
}
LACHER() {
  Q "select pg_terminate_backend(l.pid) from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'post_likes' and l.pid <> pg_backend_pid();" >/dev/null || true
  wait "$TENEUR" 2>/dev/null || true
}
TENIR 60
debut=$(date +%s%N)
( PGAPPNAME="$APPLI" psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >"$BASE/verrou.sortie" 2>&1 ) &
MIGRANTE=$!
# On attend que la migration en soit AU VERROU — en pause entre deux essais
# (Timeout:PgSleep), ou, version fautive, en file d'attente (Lock:relation) —
# avant de relever. ⚠️ Chaque tour relève l'état de la migration AVANT de
# lancer le lecteur : une migration qui tient conv_reads bloque ce lecteur
# jusqu'à son propre abandon, et un relevé fait APRÈS lui ne verrait plus rien
# (preuve de rouge du 2026-11-04 : la file d'attente échappait au relevé).
for _ in $(seq 1 50); do
  case "$(Q "select coalesce(string_agg(wait_event_type || ':' || wait_event, ','), '') from pg_stat_activity where application_name = '$APPLI';")" in
    *PgSleep*|*Lock:*) break ;;
  esac
  sleep 0.1
done
lat_max=0; attentes=0; pauses=0; releves=0
for _ in $(seq 1 12); do
  attentes=$(( attentes + $(Q "select count(*) from pg_locks l join pg_stat_activity a on a.pid = l.pid where a.application_name = '$APPLI' and not l.granted;") ))
  pauses=$(( pauses + $(Q "select count(*) from pg_stat_activity where application_name = '$APPLI' and wait_event = 'PgSleep';") ))
  t0=$(date +%s%N); Q "select count(*) from public.conv_reads;" >/dev/null || true; lat=$(( ($(date +%s%N) - t0) / 1000000 ))
  [ "$lat" -gt "$lat_max" ] && lat_max=$lat
  releves=$((releves + 1))
  sleep 0.2
done
wait "$MIGRANTE" || true
duree=$(( ($(date +%s%N) - debut) / 1000000 ))
LACHER
sortie_verrou="$(cat "$BASE/verrou.sortie")"
contient "une transaction tient post_likes : la migration renonce après 100 essais NOWAIT, et le dit" "100 essais en NOWAIT" "$sortie_verrou"
verifier "…en moins de 15 s" "oui" "$([ "$duree" -lt 15000 ] && echo oui || echo "non ($duree ms)")"
verifier "…elle réessayait bien pendant les relevés (vue en pause pg_sleep)" "oui" "$([ "$pauses" -ge 1 ] && echo oui || echo "non ($pauses sur $releves)")"
verifier "…sans JAMAIS être en file d'attente d'un verrou (NOWAIT) : 0 demande non accordée sur $releves relevés" "0" "$attentes"
verifier "…ni TENIR une table pendant ses pauses : un lecteur de conv_reads n'attend jamais 0,5 s" "oui" \
  "$([ "$lat_max" -lt 500 ] && echo oui || echo "non ($lat_max ms)")"
verifier "…et RIEN n'est appliqué : aucune colonne rid, comment_interactions toujours FULL" "0|f" "$(ETAT_AVANT)"

Q "create unlogged table banc.xmin_avant as select xmin::text as x from public.conv_members union select xmin::text from public.notifications
   union select xmin::text from public.conv_reads union select xmin::text from public.post_likes;" >/dev/null
# La même table tenue 1,5 s seulement : la migration réessaie, et PASSE.
TENIR 1.5
debut=$(date +%s%N)
sortie="$(APPLIQUER)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; LACHER; exit 1; }
duree=$(( ($(date +%s%N) - debut) / 1000000 ))
LACHER
verifier "post_likes tenue 1,5 s : la migration réessaie et PASSE dès qu'elle se libère (≥ 0,5 s, essais refusés annoncés)" "oui|oui" \
  "$([ "$duree" -ge 500 ] && echo oui || echo "non ($duree ms)")|$(printf '%s' "$sortie" | grep -qE 'verrouillées \([1-9][0-9]* essai' && echo oui || echo non)"
verifier "le tableau de verdict rend 10 OK et 0 ECHEC" "10/0" "$(BILAN "$sortie")"
FLUX migration
verifier "la réécriture des quatre tables n'est PAS publiée (0 changement décodé : aucun abonné n'en reçoit 300 INSERT)" "0" \
  "$(Q "select count(*) from banc.flux where phase = 'migration';")"
verifier "chaque ligne existante a reçu un rid, unique, non nul (conv_members 6, notifications 3, conv_reads 3, post_likes 3)" "6/6|3/3|3/3|3/3" \
  "$(Q "select (select count(*) || '/' || count(distinct rid) from public.conv_members where rid is not null) || '|' || (select count(*) || '/' || count(distinct rid) from public.notifications where rid is not null) || '|' || (select count(*) || '/' || count(distinct rid) from public.conv_reads where rid is not null) || '|' || (select count(*) || '/' || count(distinct rid) from public.post_likes where rid is not null);")"
verifier "rid n'est pas un compteur : deux rid d'une même table diffèrent de plus de 1 000 (une séquence les rendrait consécutifs)" "t" "$(ECARTS_RID)"
verifier "…et tous tiennent sur 53 bits (0 ≤ rid ≤ 2⁵³ − 1) : exacts en JSON, pour la sauvegarde comme pour tout lecteur JavaScript" "t" "$(RID_53)"
verifier "la réécriture donne à TOUTES les lignes le xmin de la migration (un seul, aucun d'avant) — le retour arrière par xmin de la réparation conv_members ne vaut plus" "1|0" \
  "$(Q "select count(distinct x) || '|' || count(*) filter (where x in (select x from banc.xmin_avant)) from (select xmin::text x from public.conv_members union all select xmin::text from public.notifications union all select xmin::text from public.conv_reads union all select xmin::text from public.post_likes) s;")"
rids_avant="$(RIDS)"
sortie2="$(APPLIQUER)" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejouée : même verdict (idempotente), au premier essai de verrou" "10/0|oui" \
  "$(BILAN "$sortie2")|$(printf '%s' "$sortie2" | grep -q 'verrouillées (0 essai' && echo oui || echo non)"
FLUX rejeu
verifier "…sans rien réécrire ni publier, et sans toucher un seul rid" "0|identiques" \
  "$(Q "select count(*) from banc.flux where phase = 'rejeu';")|$([ "$(RIDS)" = "$rids_avant" ] && echo identiques || echo différents)"

echo "── ①ter une AUTRE table publiée tenue (posts) : ni le verdict ni la migration n'attendent ─"
# Constat de la contre-revue finale du 2026-11-04 : le verdict lisait
# pg_publication_tables, dont la fonction OUVRE (ACCESS SHARE) chaque table
# publiée sans liste de colonnes ; la migration, qui tenait déjà ses cinq
# tables, attendait alors posts — et chaque client des cinq attendait derrière
# elle, jusqu'à l'abandon par lock_timeout. Le même piège dormait dans la
# ligne 5, trouvé en écrivant ce cas : `pg_get_expr(adbin, adrelid)` ouvre la
# table dont il déparse le défaut, et le planificateur de ce banc le poussait
# dans le parcours de pg_attrdef — posts.prive a un défaut (d'où `rid_col`,
# MATERIALIZED : la production, elle, a un autre plan, qui n'est pas une
# garantie). Deux façons de tenir posts : un ACCESS EXCLUSIVE ACCORDÉ ; un
# lecteur long, et un ACCESS EXCLUSIVE EN FILE derrière lui (toute demande
# neuve, même ACCESS SHARE, fait alors la queue).
APPLI_P=r25_banc_posts_tenue
POSTS_TENUE() { Q "select count(*) from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'posts' and l.mode = '$1' and l.granted = $2 and l.pid <> pg_backend_pid();"; }
ATTENDRE_POSTS() { for _ in $(seq 1 100); do [ "$(POSTS_TENUE "$1" "$2")" -ge 1 ] 2>/dev/null && return 0; sleep 0.1; done; return 1; }
TENEURS_POSTS=""
LACHER_POSTS() {
  local reste
  for _ in $(seq 1 30); do
    Q "select pg_terminate_backend(l.pid) from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'posts' and l.pid <> pg_backend_pid();" >/dev/null || true
    reste="$(Q "select count(*) from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'posts' and l.pid <> pg_backend_pid();")"
    [ "$reste" = "0" ] && break
    sleep 0.1
  done
  for p in $TENEURS_POSTS; do wait "$p" 2>/dev/null || true; done
  TENEURS_POSTS=""
}
# Une lecture NEUVE de posts attend-elle ? (la tenue est réelle : « bloquée »)
LECTURE_POSTS() {
  local sortie_l
  sortie_l="$(PGOPTIONS="-c lock_timeout=300" psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "select count(*) from public.posts;" 2>&1 || true)"
  case "$sortie_l" in *"lock timeout"*) echo bloquée ;; *) echo libre ;; esac
}
# Lance `$1` (verdict | migration) sous l'étiquette $APPLI_P ; toutes les 50 ms,
# relève ses demandes de verrou NON accordées et la latence d'un lecteur de
# conv_reads (une des cinq tables). Rend « durée ms|OK/ECHEC|attentes|latence max ms ».
# Le verdict seul part avec lock_timeout = 3 s : une version fautive échoue
# au lieu de pendre (la migration pose le sien, 5 s).
SOUS_POSTS_TENUE() {
  local debut fin pid attentes=0 lat lat_max=0 t0 f="$BASE/posts_tenue.sortie"
  debut=$(date +%s%N)
  if [ "$1" = verdict ]; then
    ( export PGAPPNAME="$APPLI_P" PGOPTIONS="-c lock_timeout=3000"; VERDICT ) >"$f" 2>&1 &
  else
    ( export PGAPPNAME="$APPLI_P"; APPLIQUER ) >"$f" 2>&1 &
  fi
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    attentes=$(( attentes + $(Q "select count(*) from pg_locks l join pg_stat_activity a on a.pid = l.pid where a.application_name = '$APPLI_P' and not l.granted;") ))
    t0=$(date +%s%N); Q "select count(*) from public.conv_reads;" >/dev/null || true; lat=$(( ($(date +%s%N) - t0) / 1000000 ))
    [ "$lat" -gt "$lat_max" ] && lat_max=$lat
    sleep 0.05
  done
  wait "$pid" || true
  fin=$(date +%s%N)
  printf '%s|%s|%s|%s' "$(( (fin - debut) / 1000000 ))" "$(BILAN "$(cat "$f")")" "$attentes" "$lat_max"
}
# « rapide|10/0|0[|oui] » attendu : moins de $2 ms, 10 OK, aucune attente de
# verrou [, lecteur de conv_reads jamais bloqué 1 s].
JUGER() {
  local d b w l; IFS='|' read -r d b w l <<<"$1"
  printf '%s|%s|%s' "$([ "$d" -lt "$2" ] && echo rapide || echo "lent ($d ms)")" "$b" "$w"
  [ "${3:-}" = lecteur ] && printf '|%s' "$([ "$l" -lt 1000 ] && echo oui || echo "non ($l ms)")"
  return 0
}
# a. posts en ACCESS EXCLUSIVE, accordé.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -c "begin; lock table public.posts in access exclusive mode; select pg_sleep(60); commit;" >/dev/null 2>&1 &
TENEURS_POSTS="$!"
ATTENDRE_POSTS AccessExclusiveLock true || true
verifier "une session TIENT posts en ACCESS EXCLUSIVE : une lecture neuve de posts attend (la tenue est réelle)" "bloquée" "$(LECTURE_POSTS)"
r_v="$(SOUS_POSTS_TENUE verdict)"
verifier "…le verdict SEUL passe sans attendre : en moins de 2 s, 10 OK, 0 demande de verrou non accordée" "rapide|10/0|0" "$(JUGER "$r_v" 2000)"
r_m="$(SOUS_POSTS_TENUE migration)"
verifier "…la migration REJOUÉE aussi — et un lecteur de conv_reads n'attend jamais 1 s derrière elle" "rapide|10/0|0|oui" "$(JUGER "$r_m" 3000 lecteur)"
verifier "…posts était tenue de bout en bout" "1" "$(POSTS_TENUE AccessExclusiveLock true)"
LACHER_POSTS
# b. un lecteur LONG de posts, et un ACCESS EXCLUSIVE en FILE derrière lui.
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -c "begin; select count(*) from public.posts; select pg_sleep(60); commit;" >/dev/null 2>&1 &
TENEURS_POSTS="$!"
ATTENDRE_POSTS AccessShareLock true || true
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -c "begin; lock table public.posts in access exclusive mode; commit;" >/dev/null 2>&1 &
TENEURS_POSTS="$TENEURS_POSTS $!"
ATTENDRE_POSTS AccessExclusiveLock false || true
verifier "un lecteur long de posts, et un ACCESS EXCLUSIVE EN FILE derrière lui : une lecture neuve fait la queue" "bloquée" "$(LECTURE_POSTS)"
r_v="$(SOUS_POSTS_TENUE verdict)"
verifier "…le verdict SEUL passe sans attendre : en moins de 2 s, 10 OK, 0 demande de verrou non accordée" "rapide|10/0|0" "$(JUGER "$r_v" 2000)"
r_m="$(SOUS_POSTS_TENUE migration)"
verifier "…la migration REJOUÉE aussi — et un lecteur de conv_reads n'attend jamais 1 s derrière elle" "rapide|10/0|0|oui" "$(JUGER "$r_m" 3000 lecteur)"
verifier "…le lecteur tenait toujours posts, l'ACCESS EXCLUSIVE toujours en file" "1|1" "$(POSTS_TENUE AccessShareLock true)|$(POSTS_TENUE AccessExclusiveLock false)"
LACHER_POSTS
verifier "posts libérée : plus aucun verrou d'une autre session dessus" "0" \
  "$(Q "select count(*) from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'posts' and l.pid <> pg_backend_pid();")"

echo "── ② APRÈS : ce que le WAL publie ─────────────────────────────────────"
verifier "V quitte de nouveau la discussion d'activité" "1" "$(AUTH "$V" "delete from public.conv_members where conv_id = '$EVGRP' and user_id = '$V' returning 1;")"
# Après la migration, la ligne de WAL ne dit plus de quelle notification il
# s'agit : le banc retient le rid de la promotion pour la retrouver.
RID_NPA="$(Q "select rid from public.notifications where id = '$NPA';")"
verifier "V efface sa promotion ; M efface la demande de suivi" "1|1" \
  "$(AUTH "$V" "delete from public.notifications where id = '$NPA' returning 1;")|$(AUTH "$M" "delete from public.notifications where id = '$NFR' returning 1;")"
verifier "V retire son « j'aime » de la publication privée" "1" "$(AUTH "$V" "delete from public.post_likes where post_id = 'p_prive' and user_id = '$V' returning 1;")"
Q "delete from public.conv_reads where conv_id = 'dm_vm' and user_id = '$V';" >/dev/null
verifier "V retire son interaction de commentaire" "1" "$(AUTH "$V" "delete from public.comment_interactions where id = 'ci_v1' returning 1;")"
verifier "M marque la conversation lue" "dm_vm" "$(AUTH "$M" "update public.conv_reads set last_read_at = now() where conv_id = 'dm_vm' and user_id = '$M' returning conv_id;")"
Q "update public.comment_interactions set payload = 'colère' where id = 'ci_o1';" >/dev/null
verifier "l'organisation réinscrit V dans la discussion (INSERT par le créateur)" "1" "$(AUTH "$ORGA" "insert into public.conv_members (conv_id, user_id) values ('$EVGRP', '$V') returning 1;")"
verifier "V notifie M (INSERT du client, sans rid)" "1" "$(AUTH "$V" "insert into public.notifications (id, user_id, kind, from_id, content) values ('n_xv1', '$M', 'like', '$V', 'aime') returning 1;")"
Q "update public.notifications set id = 'n_x_soi_bis' where id = 'n_x_soi';" >/dev/null
FLUX apres
Q "update public.notifications set id = 'n_x_soi' where id = 'n_x_soi_bis';" >/dev/null
correspond "WAL : le DELETE de conv_members ne porte plus que rid" "^table public\.conv_members: DELETE: rid\[bigint\]:[0-9]+$" "$(LIGNE apres 'table public.conv_members: DELETE:%')"
verifier "WAL : …de notifications (promotion) : rid seul" "table public.notifications: DELETE: rid[bigint]:$RID_NPA" \
  "$(LIGNE apres "table public.notifications: DELETE: rid[bigint]:$RID_NPA")"
verifier "WAL : …les deux DELETE de notifications : rid seul, et rien d'autre" "2|2" \
  "$(Q "select count(*) from banc.flux where phase = 'apres' and data like 'table public.notifications: DELETE:%';")|$(Q "select count(*) from banc.flux where phase = 'apres' and data ~ '^table public\.notifications: DELETE: rid\[bigint\]:[0-9]+$';")"
correspond "WAL : …de post_likes : rid seul" "^table public\.post_likes: DELETE: rid\[bigint\]:[0-9]+$" "$(LIGNE apres 'table public.post_likes: DELETE:%')"
correspond "WAL : …de conv_reads : rid seul" "^table public\.conv_reads: DELETE: rid\[bigint\]:[0-9]+$" "$(LIGNE apres 'table public.conv_reads: DELETE:%')"
verifier "WAL : comment_interactions ne porte plus que sa clé primaire" "table public.comment_interactions: DELETE: id[text]:'ci_v1'" "$(LIGNE apres 'table public.comment_interactions: DELETE:%')"
verifier "WAL : un UPDATE qui ne touche pas l'identité ne publie plus d'ancienne ligne (ni conv_reads, ni comment_interactions)" "0|0" \
  "$(LIGNE apres 'table public.conv_reads: UPDATE:%' | grep -c 'old-key' || true)|$(LIGNE apres 'table public.comment_interactions: UPDATE:%' | grep -c 'old-key' || true)"
verifier "…et l'identité que wal2json en tire (nouveau tuple) est rid seul" '["rid"]' \
  "$(Q "select jsonb_agg(e->>'name') from jsonb_array_elements(banc.wal_v2(banc.ligne('apres', 'table public.conv_reads: UPDATE:%'))->'identity') e;")"
verifier "WAL : un UPDATE qui change la clé de notifications ne publie plus l'ancienne (rid ne change pas)" "0|t" \
  "$(LIGNE apres 'table public.notifications: UPDATE:%' | grep -c 'old-key' || true)|$(Q "select banc.ligne('apres', 'table public.notifications: UPDATE:%') ~ ' rid\[bigint\]:[0-9]+$';")"
correspond "WAL : un INSERT publie toujours toutes ses colonnes, rid compris" \
  "^table public\.conv_members: INSERT: conv_id\[text\]:'$EVGRP' user_id\[text\]:'$V' rid\[bigint\]:[0-9]+$" "$(LIGNE apres 'table public.conv_members: INSERT:%')"
verifier "le WAL porte exactement l'identité du catalogue : old-key de conv_members = (rid), celle de comment_interactions = (id)" "rid|id" \
  "$(Q "select string_agg(nom, ',') from banc.colonnes_td(substring(banc.ligne('apres', 'table public.conv_members: DELETE:%') from 'DELETE: (.*)$'));")|$(Q "select string_agg(nom, ',') from banc.colonnes_td(substring(banc.ligne('apres', 'table public.comment_interactions: DELETE:%') from 'DELETE: (.*)$'));")"

echo "── ②bis ÉCRITURES : client, restauration, conflits de clé ─────────────"
verifier "INSERT du client sans rid (V aime de nouveau) : accepté, rid posé par la base" "t" \
  "$(AUTH "$V" "insert into public.post_likes (post_id, user_id) values ('p_prive', '$V') returning rid is not null;")"
verifier "aucune séquence ne numérote rid (ni identité, ni serial), sur les quatre tables" "0" \
  "$(Q "select count(*) from unnest(array['conv_members', 'notifications', 'conv_reads', 'post_likes']) t where pg_get_serial_sequence('public.' || t, 'rid') is not null;")"
# Le chemin de scripts/restaurer-donnees.js, ENGENDRÉ par le module lui-même
# (`ordreInsert`, clé primaire de la cible pour cible du conflit) : il ne peut
# plus dériver d'une recopie. Déclencheurs utilisateur coupés, colonnes NOMMÉES
# (celles que l'archive porte), overriding system value,
# on conflict (post_id, user_id) do nothing.
ORDRE_RESTAURER() { node -e 'process.stdout.write(require(process.argv[1]).ordreInsert("post_likes", process.argv[2].split(", "), process.argv[3], ["post_id", "user_id"]))' \
  "$RACINE/scripts/restaurer-donnees.js" "$1" "$2"; }
RESTAURER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$(ORDRE_RESTAURER "$1" "$2")" 2>&1; }
contient "l'ordre de chargement du module vise la clé primaire de post_likes" 'on conflict ("post_id", "user_id") do nothing' \
  "$(ORDRE_RESTAURER "post_id, user_id" "[]")"
RESTAURER "post_id, user_id, rid" "[{\"post_id\":\"p_public\",\"user_id\":\"$A\",\"rid\":900001}]" >/dev/null
verifier "restauration (déclencheurs coupés, overriding system value — inerte sans identité) : le rid de l'archive est GARDÉ" "900001" \
  "$(Q "select rid from public.post_likes where post_id = 'p_public' and user_id = '$A';")"
RESTAURER "post_id, user_id" "[{\"post_id\":\"p_prive\",\"user_id\":\"$A\"}]" >/dev/null
verifier "…une archive d'avant R25 (sans rid) : le défaut en tire un, aléatoire" "t" \
  "$(Q "select rid > 1000000 and rid <> 900001 and rid <= 9007199254740991 from public.post_likes where post_id = 'p_prive' and user_id = '$A';")"
rid_like_x="$(Q "select rid from public.post_likes where post_id = 'p_public' and user_id = '$X';" || true)"
# ⚠️ Vérification finale de R25 (2026-11-04) : sans cible, `on conflict do
# nothing` ÉCARTAIT cette ligne sans un mot, et seul l'écart de compte du
# verdict le disait. Avec la clé primaire pour cible, le conflit de `rid` LÈVE :
# restaurer-donnees.js rejoue alors le lot ligne à ligne et NOMME le refus.
contient "…un rid d'archive déjà pris : le chargement LÈVE sur post_likes_rid_key (23505), il ne se tait plus" "post_likes_rid_key" \
  "$(RESTAURER "post_id, user_id, rid" "[{\"post_id\":\"p_prive\",\"user_id\":\"$ORGA\",\"rid\":${rid_like_x:-0}}]")"
verifier "…la ligne n'est pas posée, et l'unicité tient" "0|t" \
  "$(Q "select count(*) from public.post_likes where post_id = 'p_prive' and user_id = '$ORGA';")|$(Q "select count(*) = count(distinct rid) from public.post_likes;")"
verifier "…le REJEU d'une ligne déjà là (même clé primaire) reste sans effet ni erreur : son rid ne bouge pas" "|900001" \
  "$(RESTAURER "post_id, user_id, rid" "[{\"post_id\":\"p_public\",\"user_id\":\"$A\",\"rid\":123}]")|$(Q "select rid from public.post_likes where post_id = 'p_public' and user_id = '$A';")"
verifier "…et l'étape « séquences » du script (nextval ou identité) ne trouve rien à recaler pour rid" "0" \
  "$(Q "select count(*) from information_schema.columns c where c.table_schema = 'public' and c.column_name = 'rid' and (c.column_default like 'nextval%' or c.is_identity = 'YES');")"
verifier "INSERT d'administration avec un rid explicite DÉJÀ PRIS, déclencheurs actifs : accepté, rid NEUF (la valeur fournie est ignorée)" "t|1" \
  "$(Q "insert into public.post_likes (post_id, user_id, rid) values ('p_public', '$M', 900001) returning rid <> 900001;")|$(Q "select count(*) from public.post_likes where rid = 900001;")"
contient "conflit de clé primaire inchangé : un second « j'aime » de V est refusé par post_likes_pkey" "post_likes_pkey" \
  "$(AUTH "$V" "insert into public.post_likes (post_id, user_id) values ('p_prive', '$V');")"
verifier "…on conflict (post_id, user_id) do nothing : 0 ligne, aucune erreur" "" \
  "$(AUTH "$V" "insert into public.post_likes (post_id, user_id) values ('p_prive', '$V') on conflict (post_id, user_id) do nothing returning 1;")"
# Les 53 bits, MESURÉS plutôt que calculés : 4 000 rid tirés par la garde,
# puis 4 000 par le défaut de colonne (garde coupée), chacun dans une
# transaction annulée. Aucun hors de [0, 2⁵³ − 1] ; bit_or = 2⁵³ − 1 et
# bit_and = 0 : aucun bit figé (la forme précédente, chiffres 1 à 16, en avait
# quatre — le quartet de version de l'UUID) ; aucun doublon.
verifier "GARDE : 4 000 rid tirés — aucun hors de [0, 2⁵³ − 1], aucun bit figé (bit_or = 2⁵³ − 1, bit_and = 0), aucun doublon" \
  "0|9007199254740991|0|4000" "$(BITS_RID 4000 garde)"
verifier "DÉFAUT de colonne (garde coupée : le chemin de la restauration) : 4 000 rid — de même" \
  "0|9007199254740991|0|4000" "$(BITS_RID 4000 defaut)"
verifier "…et rien n'en reste : transactions annulées, garde toujours active" "0|O" \
  "$(Q "select count(*) from public.notifications where id like 'n_bits_%';")|$(Q "select tgenabled from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'trg_rid_opaque';")"
r1="$(AUTH "$M" "insert into public.conv_reads (conv_id, user_id, last_read_at) values ('dm_vm', '$M', now()) on conflict (conv_id, user_id) do update set last_read_at = excluded.last_read_at returning rid;" || true)"
r2="$(AUTH "$M" "insert into public.conv_reads (conv_id, user_id, last_read_at) values ('dm_vm', '$M', now()) on conflict (conv_id, user_id) do update set last_read_at = excluded.last_read_at returning rid;" || true)"
correspond "l'upsert du client (supaMarkRead : on conflict conv_id,user_id) passe deux fois…" "^[0-9]+\|[0-9]+$" "$r1|$r2"
verifier "…et garde son rid" "$r1" "$r2"

echo "── ②ter LA GARDE : un rid fourni est ignoré — c'est elle qui ferme le rid PLANTÉ ─"
rid_x="$(AUTH "$X" "select rid from public.notifications where id = 'n_x_soi';" || true)"
correspond "X lit le rid de SA notification (SELECT permis)" "^[0-9]+$" "$rid_x"
verifier "X ne lit aucune notification de V (Lecture propre)" "0" "$(AUTH "$X" "select count(*) from public.notifications where user_id = '$V';")"
# D'abord le défaut que la garde ferme, MESURÉ, garde coupée : X écrit à V une
# notification (notifications_insert_own_author le permet) en y PLANTANT un rid.
# `|| true` : sans garde posée (migration mutée), ce geste échoue — les contrôles qui suivent, eux, rougissent.
Q "alter table public.notifications disable trigger trg_rid_opaque;" >/dev/null || true
verifier "SANS LA GARDE : X écrit à V une notification au rid PLANTÉ (4242424242) — acceptée, rid gardé" "|4242424242" \
  "$(AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content, rid) values ('n_x_plante1', '$V', 'like', '$X', 'x', 4242424242);")|$(Q "select rid from public.notifications where id = 'n_x_plante1';")"
Q "alter table public.notifications enable trigger trg_rid_opaque;" >/dev/null || true
Q "insert into realtime.subscription (subscription_id, entity, filters, claims, action_filter) values
   ('$S_NO_X_PLANTE1', 'public.notifications', array[('rid','eq','4242424242',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE');" >/dev/null
verifier "…V l'efface" "1" "$(AUTH "$V" "delete from public.notifications where id = 'n_x_plante1' returning 1;")"
FLUX garde_coupee
verifier "…et X, abonné à rid=eq.<planté>, apprend l'instant où V l'efface — une notification qu'il ne peut pas lire" "null" \
  "$(RECU garde_coupee 'table public.notifications: DELETE: rid[bigint]:4242424242' "$S_NO_X_PLANTE1")"
# Puis la même attaque, garde active.
verifier "AVEC LA GARDE : X écrit à V une notification au rid planté (4343434343) — acceptée, mais le rid posé est NEUF" "|f" \
  "$(AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content, rid) values ('n_x_plante2', '$V', 'like', '$X', 'x', 4343434343);")|$(Q "select rid = 4343434343 from public.notifications where id = 'n_x_plante2';")"
rid_reel="$(Q "select rid from public.notifications where id = 'n_x_plante2';" || true)"
Q "insert into realtime.subscription (subscription_id, entity, filters, claims, action_filter) values
   ('$S_NO_X_PLANTE2', 'public.notifications', array[('rid','eq','4343434343',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE');" >/dev/null
verifier "…V l'efface" "1" "$(AUTH "$V" "delete from public.notifications where id = 'n_x_plante2' returning 1;")"
FLUX garde_active
verifier "…X, abonné à rid=eq.<planté>, ne reçoit RIEN : le rid réel, il ne l'a jamais lu" "non livré" \
  "$(RECU garde_active "table public.notifications: DELETE: rid[bigint]:${rid_reel:-0}" "$S_NO_X_PLANTE2")"
verifier "X recopie le rid d'une ligne qu'il lit (la sienne) sur un nouvel INSERT : accepté, rid neuf — aucune collision" "t" \
  "$(AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content, rid) values ('n_x_copie', '$X', 'like', '$X', 'x', ${rid_x:-0}) returning rid <> ${rid_x:-0};")"
verifier "le suivi de V passe, et la notification serveur (follows_notifier, même transaction) reçoit son rid de la garde" "1|t" \
  "$(AUTH "$V" "insert into public.follows (follower_id, following_id) values ('$V', '$M') returning 1;")|$(Q "select rid > 1000000 from public.notifications where id = 'n_fw_22222222_33333333';")"
verifier "…tous les rid restent uniques" "t" "$(Q "select count(*) = count(distinct rid) from public.notifications;")"
rid_cr="$(AUTH "$X" "select rid from public.conv_reads where conv_id = 'dm_xo' and user_id = '$X';" || true)"
verifier "X tente d'écrire le rid de SON accusé (UPDATE permis par reads_update) : la base garde l'ancien" "$rid_cr" \
  "$(AUTH "$X" "update public.conv_reads set rid = 4444444444 where conv_id = 'dm_xo' and user_id = '$X' returning rid;")"
verifier "…et par un upsert qui recopie rid (on conflict … do update set rid = excluded.rid) : l'ancien aussi" "$rid_cr" \
  "$(AUTH "$X" "insert into public.conv_reads (conv_id, user_id, rid) values ('dm_xo', '$X', 4242) on conflict (conv_id, user_id) do update set rid = excluded.rid returning rid;")"
verifier "la fonction de garde n'est exécutable ni par anon ni par authenticated" "f|f" \
  "$(Q "select has_function_privilege('anon', 'public.rid_opaque_garde()', 'EXECUTE')::text || '|' || has_function_privilege('authenticated', 'public.rid_opaque_garde()', 'EXECUTE')::text;" | sed 's/true/t/g; s/false/f/g')"

echo "── ③b APRÈS : ce que realtime.apply_rls (production) LIVRE ─────────────"
verifier "X sans filtre à conv_members : l'effacement arrive (son MOMENT est le résidu), old_record = null" "null" \
  "$(RECU apres 'table public.conv_members: DELETE:%' "$S_CM_X")"
verifier "X filtré conv_id=eq.<discussion> : plus rien" "non livré" "$(RECU apres 'table public.conv_members: DELETE:%' "$S_CM_X_CONV")"
verifier "le visiteur (anon) : old_record = null" "null" "$(RECU apres 'table public.conv_members: DELETE:%' "$S_CM_ANON")"
verifier "X filtré id=like.n_pa_% : plus rien sur l'effacement de la promotion" "non livré" \
  "$(RECU apres "table public.notifications: DELETE: rid[bigint]:$RID_NPA" "$S_NO_X_LIKE")"
verifier "X sans filtre à notifications : le même effacement arrive, old_record = null" "null" \
  "$(RECU apres "table public.notifications: DELETE: rid[bigint]:$RID_NPA" "$S_NO_X")"
verifier "X sans filtre à post_likes : old_record = null" "null" "$(RECU apres 'table public.post_likes: DELETE:%' "$S_PL_X")"
verifier "X filtré user_id=eq.V sur post_likes : plus rien" "non livré" "$(RECU apres 'table public.post_likes: DELETE:%' "$S_PL_X_V")"
verifier "X sans filtre à conv_reads : old_record = null" "null" "$(RECU apres 'table public.conv_reads: DELETE:%' "$S_CR_X")"
verifier "comment_interactions : X filtré user_id=eq.V n'est plus servi (l'oracle est fermé)" "non livré" \
  "$(RECU apres 'table public.comment_interactions: DELETE:%' "$S_CI_X_V")"
verifier "…l'écoute DELETE du client reçoit toujours {id} (charge inchangée)" "{\"id\": \"ci_v1\"}" \
  "$(RECU apres 'table public.comment_interactions: DELETE:%' "$S_CI_X")"
verifier "l'UPDATE d'un accusé passe toujours la RLS : M le reçoit, avec toutes ses colonnes (rid compris)…" "conv_id,last_read_at,rid,user_id" \
  "$(CLES apres 'table public.conv_reads: UPDATE:%' "$S_CR_M")"
verifier "…old_record = {rid} au lieu de la clé" "rid" "$(CLES apres 'table public.conv_reads: UPDATE:%' "$S_CR_M" old_record)"
verifier "…X (non membre) ne le reçoit toujours pas" "non livré" "$(RECU apres 'table public.conv_reads: UPDATE:%' "$S_CR_X")"
verifier "l'écoute du client de V (INSERT, user_id=eq.V) reçoit sa réinscription : conv_id, user_id, rid" "conv_id,rid,user_id" \
  "$(CLES apres 'table public.conv_members: INSERT:%' "$S_CM_V")"
verifier "…X sans filtre ne la reçoit pas (RLS de l'INSERT, inchangée)" "non livré" "$(RECU apres 'table public.conv_members: INSERT:%' "$S_CM_X" record)"
verifier "l'écoute du client de M (notifications INSERT, user_id=eq.M) reçoit la notification, rid en plus" \
  "content,created_at,from_id,id,kind,origine,ref_id,rid,seen,user_id" "$(CLES apres "table public.notifications: INSERT: id[text]:'n_xv1'%" "$S_NO_M")"
verifier "…X ne la reçoit pas (Lecture propre)" "non livré" "$(RECU apres "table public.notifications: INSERT: id[text]:'n_xv1'%" "$S_NO_X" record)"

echo "── ③c L'ENCADREMENT : un rid SÉQUENTIEL trahissait l'effacement, un rid aléatoire non ─"
# Constat 1 des revues du 2026-11-03. D'abord le premier jet, reconstitué sur
# conv_members et notifications : rid d'IDENTITÉ (by default), garde coupée —
# sa garde tirait de la même séquence. X (connecté, sans aucun lien avec la
# discussion d'activité) se fait une horloge de rid avec SES lignes.
# `|| true` : sur une migration mutée où rid est DÉJÀ une identité, ces gestes
# échouent — le banc continue, et les contrôles d'après, eux, rougissent.
Q "alter table public.conv_members alter column rid drop default;
   alter table public.conv_members alter column rid add generated by default as identity;" >/dev/null || true
Q "alter table public.notifications alter column rid drop default;
   alter table public.notifications alter column rid add generated by default as identity;" >/dev/null || true
Q "alter table public.conv_members disable trigger trg_rid_opaque; alter table public.notifications disable trigger trg_rid_opaque;" >/dev/null || true
s="$(VERDICT)"
verifier "le premier jet est reconnu par le verdict : 8 OK / 2 ECHEC — la ligne de rid, celle de la garde" "8/2|1|1" \
  "$(BILAN "$s")|$(ECHEC_SUR "$s" 'rid : bigint')|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
Q "insert into public.conversations (id, is_group, created_by) values ('x_horloge', true, '$X');
   delete from public.conv_members where conv_id = '$EVGRP' and user_id = '$V';" >/dev/null
AUTH "$X" "insert into public.conv_members (conv_id, user_id) values ('x_horloge', '$X');" >/dev/null
AUTH "$X" "insert into public.conv_members (conv_id, user_id) values ('x_horloge', '$A');" >/dev/null
AUTH "$ORGA" "insert into public.conv_members (conv_id, user_id) values ('$EVGRP', '$V');" >/dev/null   # le geste de la victime
AUTH "$X" "insert into public.conv_members (conv_id, user_id) values ('x_horloge', '$M');" >/dev/null
r1="$(AUTH "$X" "select rid from public.conv_members where conv_id = 'x_horloge' and user_id = '$A';" || true)"; r1="${r1:-0}"
r2="$(AUTH "$X" "select rid from public.conv_members where conv_id = 'x_horloge' and user_id = '$M';" || true)"; r2="${r2:-0}"
verifier "X ne lit rien de la discussion d'activité (RLS)" "0" "$(AUTH "$X" "select count(*) from public.conv_members where conv_id = '$EVGRP';")"
verifier "PREMIER JET : les rid de X juste avant et juste après encadrent la ligne de V — r2 − r1 = 2, V porte r1 + 1" "2|t" \
  "$(Q "select $r2 - $r1;")|$(Q "select rid = $r1 + 1 from public.conv_members where conv_id = '$EVGRP' and user_id = '$V';")"
verifier "…filtres sur rid ACCEPTÉS par le déclencheur de production : X (fenêtre in), un visiteur (lt, gte)" "3" \
  "$(Q "insert into realtime.subscription (subscription_id, entity, filters, claims, action_filter) values
     ('$S_ENC_X', 'public.conv_members', array[('rid','in','{' || ($r1 + 1) || '}',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE'),
     ('$S_ENC_LT', 'public.conv_members', array[('rid','lt','$r2',false)]::realtime.user_defined_filter[], '{\"role\":\"anon\"}', 'DELETE'),
     ('$S_ENC_GTE', 'public.conv_members', array[('rid','gte','$r2',false)]::realtime.user_defined_filter[], '{\"role\":\"anon\"}', 'DELETE') returning 1;" | grep -c '^1$' || true)"
FLUX enc_prep
AUTH "$ORGA" "delete from public.conv_members where conv_id = 'dm_xo' and user_id = '$ORGA';" >/dev/null   # un autre départ, d'une autre conversation
FLUX enc_bruit
verifier "V quitte la discussion d'activité" "1" "$(AUTH "$V" "delete from public.conv_members where conv_id = '$EVGRP' and user_id = '$V' returning 1;")"
FLUX enc_avant
verifier "PREMIER JET : le filtre encadrant de X reconnaît le départ de V — il en apprend l'instant exact" "null" \
  "$(RECU enc_avant 'table public.conv_members: DELETE:%' "$S_ENC_X")"
verifier "…et lui seul : le départ d'un autre membre, d'une autre conversation, ne passe pas" "non livré" \
  "$(RECU enc_bruit 'table public.conv_members: DELETE:%' "$S_ENC_X")"
verifier "…un visiteur bissecte : rid=lt.r2 reçoit le départ de V, rid=gte.r2 non" "null|non livré" \
  "$(RECU enc_avant 'table public.conv_members: DELETE:%' "$S_ENC_LT")|$(RECU enc_avant 'table public.conv_members: DELETE:%' "$S_ENC_GTE")"
a1="$(AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content) values ('n_x_av', '$X', 'like', '$X', 'a') returning rid;" || true)"; a1="${a1:-0}"
AUTH "$X" "insert into public.follows (follower_id, following_id) values ('$X', '$V');" >/dev/null   # follows_notifier écrit à V
a2="$(AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content) values ('n_x_ap', '$X', 'like', '$X', 'b') returning rid;" || true)"; a2="${a2:-0}"
verifier "PREMIER JET : la notification de suivi que X fait écrire chez V est encadrée par deux notifications de X à lui-même" "2|t" \
  "$(Q "select $a2 - $a1;")|$(Q "select rid = $a1 + 1 from public.notifications where id = 'n_fw_44444444_22222222';")"
Q "insert into realtime.subscription (subscription_id, entity, filters, claims, action_filter) values
   ('$S_ENC_NO', 'public.notifications', array[('rid','in','{' || ($a1 + 1) || '}',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE');" >/dev/null
verifier "V efface la notification du suivi de X" "1" "$(AUTH "$V" "delete from public.notifications where id = 'n_fw_44444444_22222222' returning 1;")"
FLUX enc_avant_no
verifier "PREMIER JET : …et X apprend l'instant où V l'efface" "null" "$(RECU enc_avant_no 'table public.notifications: DELETE:%' "$S_ENC_NO")"
AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content) select 'n_x_q' || lpad(g::text, 2, '0'), '$X', 'like', '$X', 'q' from generate_series(1, 20) g;" >/dev/null
verifier "PREMIER JET : 20 notifications de X écrites l'une après l'autre portent des rid croissants et consécutifs (19 hausses, écart 1)" "19|1" "$(ORDRE n_x_q)"
FLUX enc_ordre

# Puis la migration, jouée sur le premier jet : elle REFUSE, et dit quoi faire.
s6="$(APPLIQUER || true)"
contient "la migration, jouée sur le premier jet, REFUSE de s'appliquer et dit quoi faire (retour arrière, « drop column » explicites, migration)" \
  "identité SÉQUENTIELLE de la première version.*retour arrière.*drop column" "$s6"
verifier "…sans rien changer : rid porte toujours son identité, la garde est toujours coupée" "d|D" \
  "$(Q "select a.attidentity::text || '|' || t.tgenabled::text from pg_attribute a join pg_trigger t on t.tgrelid = a.attrelid and t.tgname = 'trg_rid_opaque' where a.attrelid = 'public.conv_members'::regclass and a.attname = 'rid' and not a.attisdropped;")"
# Un effacement ÉCRIT avant le remède, que Realtime n'aurait pas encore lu :
# X efface une de SES notifications ; le slot ne sera lu qu'après le remède.
verifier "X efface une de ses notifications (le slot n'est pas lu : Realtime en retard)" "1" \
  "$(AUTH "$X" "delete from public.notifications where id = 'n_x_q01' returning 1;")"
n_cm="$(Q "select count(*) from public.conv_members;")"; n_no="$(Q "select count(*) from public.notifications;")"
ra6="$(RETOUR_ARRIERE | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f - 2>&1)" || { echo "  ❌ le retour arrière a échoué (③c) :"; echo "$ra6" | tail -5; exit 1; }
s6="$(APPLIQUER || true)"
contient "le retour arrière SEUL ne suffit pas : il GARDE la colonne, et l'identité séquentielle avec elle — la migration refuse encore" \
  "identité SÉQUENTIELLE de la première version" "$s6"
sup6="$(SUPPRESSION_RID | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f - 2>&1)" || { echo "  ❌ les « drop column » du remède ont échoué (③c) :"; echo "$sup6" | tail -5; exit 1; }
verifier "les quatre « drop column » du remède (lignes --|+ de l'en-tête) : plus de colonne rid, plus de séquence d'identité" "0|0" \
  "$(Q "select count(*) from pg_attribute where attname = 'rid' and not attisdropped and attrelid in ('public.conv_members'::regclass, 'public.notifications'::regclass, 'public.conv_reads'::regclass, 'public.post_likes'::regclass);")|$(Q "select count(*) from pg_class where relkind = 'S' and relname like '%rid%';")"
FLUX enc_remede
correspond "l'effacement écrit AVANT le remède, décodé APRÈS : le WAL le rend avec le catalogue d'ALORS — identité rid" \
  "^table public\.notifications: DELETE: rid\[bigint\]:[0-9]+$" "$(LIGNE enc_remede 'table public.notifications: DELETE:%')"
contient "…colonne supprimée, apply_rls LÈVE sur ce message (has_column_privilege) — c'est tout le lot qui ne serait plus livré en direct : pourquoi le retour arrière, lui, GARDE la colonne" \
  'column "rid" of relation "notifications" does not exist' \
  "$(LIBRE "select banc.recu_historique('enc_remede', 'table public.notifications: DELETE:%', '$S_NO_X', 'old_record');" || true)"
s6="$(APPLIQUER)" || { echo "  ❌ migration en échec (③c)"; echo "$s6" | tail -3; exit 1; }
verifier "le remède de l'en-tête — retour arrière, quatre « drop column » explicites, puis migration : 10 OK / 0 ECHEC" "10/0" "$(BILAN "$s6")"
verifier "…la colonne est RECRÉÉE (ni identité ni séquence), garde réarmée, lignes intactes" \
  "conv_members sans identité sans séquence O,notifications sans identité sans séquence O|$n_cm|$n_no" \
  "$(Q "select string_agg(c.relname || case when a.attidentity = '' then ' sans identité' else ' IDENTITÉ' end || case when pg_get_serial_sequence('public.' || c.relname, 'rid') is null then ' sans séquence' else ' SÉQUENCE' end || ' ' || t.tgenabled::text, ',' order by c.relname) from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attname = 'rid' and not a.attisdropped join pg_trigger t on t.tgrelid = c.oid and t.tgname = 'trg_rid_opaque' where c.oid in ('public.conv_members'::regclass, 'public.notifications'::regclass);")|$(Q "select count(*) from public.conv_members;")|$(Q "select count(*) from public.notifications;")"
FLUX enc_recree
verifier "…sans rien publier (la réécriture ne passe pas au décodage), et ses rid redeviennent aléatoires" "0|t" \
  "$(Q "select count(*) from banc.flux where phase = 'enc_recree';")|$(ECARTS_RID)"

# La même attaque, rid aléatoire.
AUTH "$X" "insert into public.conv_members (conv_id, user_id) values ('x_horloge', '$B1');" >/dev/null
AUTH "$ORGA" "insert into public.conv_members (conv_id, user_id) values ('$EVGRP', '$V');" >/dev/null   # le geste de la victime
AUTH "$X" "insert into public.conv_members (conv_id, user_id) values ('x_horloge', '$B2');" >/dev/null
r1="$(AUTH "$X" "select rid from public.conv_members where conv_id = 'x_horloge' and user_id = '$B1';" || true)"; r1="${r1:-0}"
r2="$(AUTH "$X" "select rid from public.conv_members where conv_id = 'x_horloge' and user_id = '$B2';" || true)"; r2="${r2:-0}"
rv="$(Q "select rid from public.conv_members where conv_id = '$EVGRP' and user_id = '$V';" || true)"; rv="${rv:-0}"
verifier "rid ALÉATOIRE : |r2 − r1| > 100 — aucune fenêtre ne tient dans un filtre in (100 valeurs au plus)" "oui" \
  "$(Q "select case when abs($r2 - $r1) > 100 then 'oui' else 'non (' || abs($r2 - $r1) || ')' end;")"
verifier "…et la ligne de V n'est dans aucune des fenêtres les plus serrées (les 99 valeurs après r1, les 99 avant r2)" "oui" \
  "$(Q "select case when $rv not between $r1 + 1 and $r1 + 99 and $rv not between $r2 - 99 and $r2 - 1 then 'oui' else 'non' end;")"
fen="$(Q "select string_agg(g::text, ',') from generate_series($r1 + 1, $r1 + 99) g;" || true)"
lus="$(AUTH "$X" "select string_agg(rid::text, ',') from public.conv_members;" || true)"
rv_orga="$(AUTH "$ORGA" "select rid from public.conv_members where conv_id = '$EVGRP' and user_id = '$V';" || true)"
verifier "X ne lit que les lignes de ses conversations (6) ; ORGA, co-membre de la discussion, lit la ligne de V et son rid" "6|$rv" \
  "$(AUTH "$X" "select count(*) from public.conv_members;")|$rv_orga"
verifier "filtres acceptés : la meilleure fenêtre de X, TOUS les rid qu'il lit, et le rid de V lu par ORGA" "3" \
  "$(Q "insert into realtime.subscription (subscription_id, entity, filters, claims, action_filter) values
     ('$S_ENC2_FEN', 'public.conv_members', array[('rid','in','{$fen}',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE'),
     ('$S_ENC2_LUS', 'public.conv_members', array[('rid','in','{$lus}',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE'),
     ('$S_ENC2_ORGA', 'public.conv_members', array[('rid','eq','${rv_orga:-0}',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$ORGA\"}', 'DELETE') returning 1;" | grep -c '^1$' || true)"
verifier "V quitte de nouveau la discussion" "1" "$(AUTH "$V" "delete from public.conv_members where conv_id = '$EVGRP' and user_id = '$V' returning 1;")"
FLUX enc_apres
verifier "rid ALÉATOIRE : la meilleure fenêtre de X ne reconnaît plus rien" "non livré" "$(RECU enc_apres 'table public.conv_members: DELETE:%' "$S_ENC2_FEN")"
verifier "…un filtre sur TOUS les rid que X lit non plus : aucun n'est celui d'une ligne qu'il ne lit pas" "non livré" \
  "$(RECU enc_apres 'table public.conv_members: DELETE:%' "$S_ENC2_LUS")"
verifier "…le RÉSIDU, mesuré : ORGA, qui LIT la ligne de V (même discussion), connaît son rid et reçoit son départ — ce qu'il voyait déjà" "null" \
  "$(RECU enc_apres 'table public.conv_members: DELETE:%' "$S_ENC2_ORGA")"
verifier "…et l'abonné sans filtre en voit toujours le MOMENT (old_record null)" "null" "$(RECU enc_apres 'table public.conv_members: DELETE:%' "$S_CM_X")"
Q "delete from public.follows where follower_id = '$X' and following_id = '$V';" >/dev/null
a1="$(AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content) values ('n_x_av2', '$X', 'like', '$X', 'a') returning rid;" || true)"; a1="${a1:-0}"
AUTH "$X" "insert into public.follows (follower_id, following_id) values ('$X', '$V');" >/dev/null
a2="$(AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content) values ('n_x_ap2', '$X', 'like', '$X', 'b') returning rid;" || true)"; a2="${a2:-0}"
verifier "rid ALÉATOIRE : la notification de suivi n'est plus encadrée — |a2 − a1| > 100" "oui" \
  "$(Q "select case when abs($a2 - $a1) > 100 then 'oui' else 'non (' || abs($a2 - $a1) || ')' end;")"
fen="$(Q "select string_agg(g::text, ',') from generate_series($a1 + 1, $a1 + 99) g;" || true)"
Q "insert into realtime.subscription (subscription_id, entity, filters, claims, action_filter) values
   ('$S_ENC2_NO', 'public.notifications', array[('rid','in','{$fen}',false)]::realtime.user_defined_filter[], '{\"role\":\"authenticated\",\"sub\":\"$X\"}', 'DELETE');" >/dev/null
verifier "V efface la notification du suivi de X" "1" "$(AUTH "$V" "delete from public.notifications where id = 'n_fw_44444444_22222222' returning 1;")"
FLUX enc_apres_no
verifier "…X ne l'apprend plus" "non livré" "$(RECU enc_apres_no 'table public.notifications: DELETE:%' "$S_ENC2_NO")"
AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content) select 'n_x_s' || lpad(g::text, 2, '0'), '$X', 'like', '$X', 's' from generate_series(1, 20) g;" >/dev/null
verifier "rid ALÉATOIRE : 20 notifications de X écrites l'une après l'autre — rid ni dans l'ordre d'écriture, ni proches (écart minimal > 1 000)" "oui" \
  "$(Q "select case when count(*) filter (where rid > prec) < 19 and min(abs(rid - prec)) > 1000 then 'oui' else 'non (' || count(*) filter (where rid > prec) || ' hausses, écart ' || min(abs(rid - prec)) || ')' end from (select rid, lag(rid) over (order by id) prec from public.notifications where id like 'n_x_s%') s where prec is not null;")"

echo "── ④ LE VERDICT NE PEUT PAS MENTIR ─────────────────────────────────────"
# Chaque propriété cassée doit rougir SA ligne (et elle seule, au compte près) ;
# chaque réparation est remesurée à 10 / 0 — sinon une réparation ratée
# masquerait la casse suivante sur la même ligne.
RETABLI() { verifier "  …rétabli ($1) : 10 OK / 0 ECHEC" "10/0" "$(BILAN "$(VERDICT)")"; }
verifier "le verdict seul, sur l'état appliqué : 10 OK / 0 ECHEC" "10/0" "$(BILAN "$(VERDICT)")"
DEF_RID="$(Q "select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum where d.adrelid = 'public.conv_members'::regclass and a.attname = 'rid';" || true)"
DEF_GARDE="$(Q "select pg_get_functiondef('public.rid_opaque_garde()'::regprocedure);" || true)"
# a. une table repasse en identité par défaut
Q "alter table public.conv_members replica identity default;" >/dev/null
s="$(VERDICT)"
verifier "conv_members en identité DEFAULT : 8 OK / 2 ECHEC — sa ligne, et celle de la clé primaire" "8/2|1|1" \
  "$(BILAN "$s")|$(ECHEC_SUR "$s" 'conv_members : identité')|$(ECHEC_SUR "$s" 'aucune colonne de clé primaire')"
AUTH "$X" "delete from public.conv_members where conv_id = 'x_horloge' and user_id = '$A';" >/dev/null
FLUX casse_a
verifier "…et c'est bien la fuite qui revient : le DELETE republie (conversation, compte)" \
  "table public.conv_members: DELETE: conv_id[text]:'x_horloge' user_id[text]:'$A'" "$(LIGNE casse_a 'table public.conv_members: DELETE:%')"
Q "insert into public.conv_members (conv_id, user_id) values ('x_horloge', '$A'); alter table public.conv_members replica identity using index conv_members_rid_key;" >/dev/null
RETABLI "conv_members"
# b. une table en FULL
Q "alter table public.notifications replica identity full;" >/dev/null
s="$(VERDICT)"
verifier "notifications en FULL : 7 OK / 3 ECHEC — sa ligne, la clé primaire, « aucune table FULL »" "7/3|1|1|1" \
  "$(BILAN "$s")|$(ECHEC_SUR "$s" 'notifications : identité')|$(ECHEC_SUR "$s" 'aucune colonne de clé primaire')|$(ECHEC_SUR "$s" 'REPLICA IDENTITY FULL')"
Q "alter table public.notifications replica identity using index notifications_rid_key;" >/dev/null
RETABLI "notifications"
# c. identité sur un AUTRE index unique, qui contient la clé
Q "create unique index conv_reads_large on public.conv_reads (conv_id, user_id, rid); alter table public.conv_reads replica identity using index conv_reads_large;" >/dev/null
s="$(VERDICT)"
verifier "conv_reads sur un index unique (conv_id, user_id, rid) : 8 OK / 2 ECHEC — « rid seul » ne se contourne pas" "8/2|1|1" \
  "$(BILAN "$s")|$(ECHEC_SUR "$s" 'conv_reads : identité')|$(ECHEC_SUR "$s" 'aucune colonne de clé primaire')"
Q "alter table public.conv_reads replica identity using index conv_reads_rid_key; drop index public.conv_reads_large;" >/dev/null
RETABLI "conv_reads"
# d. l'index d'identité supprimé
Q "drop index public.post_likes_rid_key;" >/dev/null
s="$(VERDICT)"
verifier "post_likes_rid_key SUPPRIMÉ : 8 OK / 2 ECHEC — l'identité est VIDE, la ligne « non vide » le voit" "8/2|1|1" \
  "$(BILAN "$s")|$(ECHEC_SUR "$s" 'post_likes : identité')|$(ECHEC_SUR "$s" 'NON VIDE')"
contient "…et PostgreSQL REFUSE alors tout DELETE de la table publiée (le danger que la gate des index garde)" "does not have a replica identity" \
  "$(AUTH "$V" "delete from public.post_likes where post_id = 'p_prive' and user_id = '$V';")"
Q "create unique index post_likes_rid_key on public.post_likes (rid); alter table public.post_likes replica identity using index post_likes_rid_key;" >/dev/null
RETABLI "post_likes"
# e. rid redevient un compteur, de trois façons ; ou son défaut diverge d'une table à l'autre
Q "create sequence banc.rid_compteur; alter table public.conv_members alter column rid set default nextval('banc.rid_compteur');" >/dev/null || true
s="$(VERDICT)"
verifier "rid de conv_members redevenu un COMPTEUR (défaut nextval) : 9 OK / 1 ECHEC — la ligne de rid" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'rid : bigint')"
Q "alter table public.conv_members alter column rid set default $DEF_RID; drop sequence banc.rid_compteur;" >/dev/null || true
RETABLI "défaut aléatoire"
Q "alter table public.post_likes alter column rid drop default; alter table public.post_likes alter column rid add generated by default as identity;" >/dev/null || true
s="$(VERDICT)"
verifier "rid de post_likes redevenu une IDENTITÉ (le premier jet), garde intacte : 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'rid : bigint')"
Q "alter table public.post_likes alter column rid drop identity; alter table public.post_likes alter column rid set default $DEF_RID;" >/dev/null || true
RETABLI "identité retirée"
# Tous les marqueurs de la forme à 53 bits, et pourtant une autre expression (+ 0) :
# seule la clause « le même sur les quatre tables » peut le voir.
Q "alter table public.notifications alter column rid set default ((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991) + 0);" >/dev/null || true
s="$(VERDICT)"
verifier "défaut de notifications à 53 bits mais DIFFÉRENT des trois autres : 9 OK / 1 ECHEC — « le même sur les quatre tables »" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'rid : bigint')"
Q "alter table public.notifications alter column rid set default $DEF_RID;" >/dev/null || true
RETABLI "défaut commun"
# La forme PRÉCÉDENTE, à 63 bits (chiffres 1 à 16, masque 2⁶³ − 1) : 59 bits
# aléatoires, et des valeurs que JSON arrondit — le verdict la refuse.
Q "alter table public.conv_reads alter column rid set default ((((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)))::bit(64))::bigint & 9223372036854775807));" >/dev/null || true
s="$(VERDICT)"
verifier "défaut de conv_reads à l'ANCIENNE forme sur 63 bits : 9 OK / 1 ECHEC — la ligne de rid" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'rid : bigint')"
Q "alter table public.conv_reads alter column rid set default $DEF_RID;" >/dev/null || true
RETABLI "défaut à 53 bits"
# `(<expression>) & 7` sur les QUATRE tables : chaque fragment que cherchait la
# forme précédente du contrôle (gen_random_uuid(), « , 17, 16) », le masque à
# 53 bits) y est, et le défaut est le même partout — mais il ne tire plus que
# 3 bits. Seule l'égalité EXACTE avec le témoin le voit.
for t in conv_members notifications conv_reads post_likes; do
  Q "alter table public.$t alter column rid set default (($DEF_RID) & 7);" >/dev/null || true
done
s="$(VERDICT)"
verifier "défaut « (<expression>) & 7 » sur les QUATRE tables (tous les fragments présents, le même partout) : 9 OK / 1 ECHEC — la ligne de rid" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'rid : bigint')"
verifier "…et c'est bien un défaut : un rid tiré par le défaut (chemin de la restauration, garde coupée) tombe entre 0 et 7" "t" \
  "$(Q "begin; alter table public.post_likes disable trigger trg_rid_opaque;
       insert into public.post_likes (post_id, user_id) values ('p_sept', '$X') returning rid between 0 and 7;
       rollback;")"
# …et rejouée sur ce défaut, la migration ne le corrige pas en silence
# (`add column if not exists` garde la colonne et son défaut) : son verdict le DIT.
s="$(APPLIQUER || true)"
verifier "…rejouée sur ce défaut modifié, la migration ne le corrige pas en silence : son propre verdict rend 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'rid : bigint')"
for t in conv_members notifications conv_reads post_likes; do
  Q "alter table public.$t alter column rid set default $DEF_RID;" >/dev/null || true
done
RETABLI "défaut exact"
# h. la garde désactivée, en réplica, désarmée (WHEN), vidée, conditionnelle, séquentielle,
#    supprimée, réduite à l'INSERT, exécutable
# (`|| true` : si la migration n'a pas posé la garde, ces gestes échouent ; les contrôles, eux, rougissent.)
Q "alter table public.post_likes disable trigger trg_rid_opaque;" >/dev/null || true
s="$(VERDICT)"
verifier "garde DÉSACTIVÉE sur post_likes : 9 OK / 1 ECHEC — la ligne de la garde" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
Q "alter table public.post_likes enable trigger trg_rid_opaque;" >/dev/null || true
RETABLI "garde réactivée"
Q "alter table public.post_likes enable replica trigger trg_rid_opaque;" >/dev/null || true
s="$(VERDICT)"
verifier "garde en mode RÉPLICA (elle ne part pas pour une requête ordinaire) : 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
Q "alter table public.post_likes enable trigger trg_rid_opaque;" >/dev/null || true
RETABLI "garde ordinaire"
Q "drop trigger if exists trg_rid_opaque on public.post_likes;
   create trigger trg_rid_opaque before insert or update of rid on public.post_likes for each row when (false) execute function public.rid_opaque_garde();" >/dev/null || true
s="$(VERDICT)"
verifier "garde DÉSARMÉE par une clause WHEN (false) — présente, active, elle ne part jamais : 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
verifier "…et c'est bien un défaut : le rid fourni par le client est GARDÉ" "777777" \
  "$(AUTH "$X" "insert into public.post_likes (post_id, user_id, rid) values ('p_quand', '$X', 777777) returning rid;")"
Q "delete from public.post_likes where post_id = 'p_quand';
   drop trigger if exists trg_rid_opaque on public.post_likes;
   create trigger trg_rid_opaque before insert or update of rid on public.post_likes for each row execute function public.rid_opaque_garde();" >/dev/null || true
RETABLI "clause WHEN retirée"
Q "create or replace function public.rid_opaque_garde() returns trigger language plpgsql security definer set search_path to '' as \$fn\$ begin return new; end \$fn\$;" >/dev/null
s="$(VERDICT)"
verifier "garde présente mais VIDÉE (le corps est lu) : 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
Q "$DEF_GARDE" >/dev/null || true
RETABLI "corps rendu"
Q "create or replace function public.rid_opaque_garde() returns trigger language plpgsql security definer set search_path to '' as \$fn\$
begin
  if tg_op = 'INSERT' then
    if new.rid is null then
      new.rid := (('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991);
    end if;
  else
    new.rid := old.rid;
  end if;
  return new;
end
\$fn\$;" >/dev/null
s="$(VERDICT)"
verifier "garde qui GARDE la valeur fournie (« if new.rid is null ») : 9 OK / 1 ECHEC — le rid planté repasserait" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
Q "$DEF_GARDE" >/dev/null || true
RETABLI "corps rendu"
Q "create sequence banc.garde_compteur;
   create or replace function public.rid_opaque_garde() returns trigger language plpgsql security definer set search_path to '' as \$fn\$
begin
  if tg_op = 'INSERT' then
    new.rid := pg_catalog.nextval('banc.garde_compteur');
  else
    new.rid := old.rid;
  end if;
  return new;
end
\$fn\$;" >/dev/null
s="$(VERDICT)"
verifier "garde SÉQUENTIELLE (nextval, le premier jet) : 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
Q "$DEF_GARDE" >/dev/null || true
Q "drop sequence banc.garde_compteur;" >/dev/null
RETABLI "corps rendu"
Q "create or replace function public.rid_opaque_garde() returns trigger language plpgsql security definer set search_path to '' as \$fn\$
begin
  if tg_op = 'INSERT' then
    new.rid := (((('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16))::bit(64)::bigint) & 9223372036854775807));
  else
    new.rid := old.rid;
  end if;
  return new;
end
\$fn\$;" >/dev/null
s="$(VERDICT)"
verifier "garde qui tire encore l'ANCIENNE valeur sur 63 bits : 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
Q "$DEF_GARDE" >/dev/null || true
RETABLI "corps rendu"
# Le corps EXACT, précédé d'UNE ligne qui rend `new` quand un rid est fourni :
# la forme précédente du contrôle, ancrée à la fin seulement, le trouvait
# conforme — et rouvrait RV-16 (le rid planté dans une notification adressée
# à autrui).
Q "create or replace function public.rid_opaque_garde() returns trigger language plpgsql security definer set search_path to '' as \$fn\$
begin
  if tg_op = 'INSERT' and new.rid is not null then return new; end if;
  if tg_op = 'INSERT' then
    new.rid := (('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991);
  else
    new.rid := old.rid;
  end if;
  return new;
end
\$fn\$;" >/dev/null
s="$(VERDICT)"
verifier "garde au corps exact PRÉCÉDÉ d'une ligne « if tg_op = 'INSERT' and new.rid is not null then return new » : 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
verifier "…et c'est bien un défaut : X (authenticated) plante un rid sur une notification adressée à V — accepté, rid GARDÉ" "|8888888888" \
  "$(AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content, rid) values ('n_x_prefixe', '$V', 'like', '$X', 'x', 8888888888);")|$(Q "select rid from public.notifications where id = 'n_x_prefixe';")"
Q "delete from public.notifications where id = 'n_x_prefixe';" >/dev/null
Q "$DEF_GARDE" >/dev/null || true
RETABLI "corps rendu"
# La même ligne CACHÉE dans un commentaire, derrière un retour chariot SEUL
# (contre-revue finale) : PL/pgSQL clôt un commentaire `--` sur \r, donc le code
# qui suit s'exécute. Une ligne 7 qui ôtait les \r lisait ce code comme du
# commentaire, et disait la garde conforme.
CR=$'\r'
Q "create or replace function public.rid_opaque_garde() returns trigger language plpgsql security definer set search_path to '' as \$fn\$
begin
  -- commentaire anodin${CR}if tg_op = 'INSERT' and new.rid is not null then return new; end if;
  if tg_op = 'INSERT' then
    new.rid := (('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991);
  else
    new.rid := old.rid;
  end if;
  return new;
end
\$fn\$;" >/dev/null
s="$(VERDICT)"
verifier "garde dont un commentaire cache, derrière un retour chariot SEUL, « if … new.rid is not null then return new » : 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
verifier "…et c'est bien un défaut : le code caché s'exécute, le rid planté par X est GARDÉ" "|7777777777" \
  "$(AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content, rid) values ('n_x_cr', '$V', 'like', '$X', 'x', 7777777777);")|$(Q "select rid from public.notifications where id = 'n_x_cr';")"
Q "delete from public.notifications where id = 'n_x_cr';" >/dev/null
Q "$DEF_GARDE" >/dev/null || true
RETABLI "corps rendu"
Q "drop trigger trg_rid_opaque on public.conv_members;" >/dev/null || true
s="$(VERDICT)"
verifier "garde SUPPRIMÉE sur conv_members : 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
Q "create trigger trg_rid_opaque before insert on public.conv_members for each row execute function public.rid_opaque_garde();" >/dev/null || true
s="$(VERDICT)"
verifier "garde sur INSERT seulement (l'UPDATE de rid rouvert) : 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
Q "drop trigger if exists trg_rid_opaque on public.conv_members; create trigger trg_rid_opaque before insert or update of rid on public.conv_members for each row execute function public.rid_opaque_garde();" >/dev/null
RETABLI "garde recréée"
Q "grant execute on function public.rid_opaque_garde() to authenticated;" >/dev/null
s="$(VERDICT)"
verifier "fonction de garde rendue exécutable par authenticated : 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'garde trg_rid_opaque')"
Q "revoke execute on function public.rid_opaque_garde() from authenticated;" >/dev/null
RETABLI "EXECUTE retiré"
# i. comment_interactions de nouveau FULL, j. une autre table publiée en FULL
Q "alter table public.comment_interactions replica identity full;" >/dev/null
s="$(VERDICT)"
verifier "comment_interactions de nouveau FULL : 8 OK / 2 ECHEC — sa ligne et « aucune table FULL »" "8/2|1|1" \
  "$(BILAN "$s")|$(ECHEC_SUR "$s" 'comment_interactions :')|$(ECHEC_SUR "$s" 'REPLICA IDENTITY FULL')"
Q "alter table public.comment_interactions replica identity default;" >/dev/null
RETABLI "comment_interactions"
Q "alter table public.video_lives replica identity full;" >/dev/null
s="$(VERDICT)"
verifier "video_lives (publiée, hors migration) en FULL : 9 OK / 1 ECHEC — la ligne est générale, pas une liste" "9/1|1" \
  "$(BILAN "$s")|$(ECHEC_SUR "$s" 'REPLICA IDENTITY FULL')"
Q "alter table public.video_lives replica identity default;" >/dev/null
RETABLI "video_lives"
# k. la publication change
Q "alter publication supabase_realtime drop table public.post_likes;" >/dev/null
s="$(VERDICT)"
verifier "post_likes retirée de la publication : 9 OK / 1 ECHEC — la ligne de la publication" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'supabase_realtime : les 11')"
Q "alter publication supabase_realtime add table public.post_likes;" >/dev/null
RETABLI "post_likes republiée"
Q "alter publication supabase_realtime add table public.conversations;" >/dev/null
s="$(VERDICT)"
verifier "une 12ᵉ table ajoutée : 9 OK / 1 ECHEC" "9/1|1" "$(BILAN "$s")|$(ECHEC_SUR "$s" 'supabase_realtime : les 11')"
Q "alter publication supabase_realtime drop table public.conversations;" >/dev/null
RETABLI "11 tables"
# l. une appartenance PAR SCHÉMA (FOR TABLES IN SCHEMA) n'est pas dans
#    pg_publication_rel : le verdict, qui ne lit plus que lui, doit la voir
#    autrement — par pg_publication_namespace — et rougir plutôt que se taire.
Q "create schema banc_pub; create table banc_pub.ecrits (id text primary key, qui text);
   alter table banc_pub.ecrits replica identity full;
   alter publication supabase_realtime add tables in schema banc_pub;" >/dev/null
s="$(VERDICT)"
verifier "une appartenance PAR SCHÉMA (absente de pg_publication_rel), une table FULL dedans : 8 OK / 2 ECHEC — « aucune table FULL » et « les 11 »" "8/2|1|1" \
  "$(BILAN "$s")|$(ECHEC_SUR "$s" 'REPLICA IDENTITY FULL')|$(ECHEC_SUR "$s" 'supabase_realtime : les 11')"
Q "alter publication supabase_realtime drop tables in schema banc_pub; drop schema banc_pub cascade;" >/dev/null
RETABLI "appartenance par schéma retirée"
# m. une table PARTITIONNÉE publiée : ses partitions le sont avec elle, sans
#    ligne dans pg_publication_rel — une partition FULL doit rougir la ligne 9
#    (pg_publication_tables les listait ; le verdict descend pg_inherits).
Q "create table public.banc_part (id text not null, k int not null, primary key (id, k)) partition by list (k);
   create table public.banc_part_1 partition of public.banc_part for values in (1);
   alter table public.banc_part_1 replica identity full;
   alter publication supabase_realtime add table public.banc_part;" >/dev/null
s="$(VERDICT)"
verifier "une table PARTITIONNÉE publiée, sa partition en FULL : 8 OK / 2 ECHEC — « aucune table FULL » (partitions comprises) et « les 11 »" "8/2|1|1" \
  "$(BILAN "$s")|$(ECHEC_SUR "$s" 'REPLICA IDENTITY FULL')|$(ECHEC_SUR "$s" 'supabase_realtime : les 11')"
Q "alter publication supabase_realtime drop table public.banc_part; drop table public.banc_part;" >/dev/null
RETABLI "partition retirée"
# n. la migration EXTRAITE EN CRLF (poste Windows, core.autocrlf) : le corps de
#    la garde garde ses retours chariot ; la ligne 7, ancrée ligne à ligne, les
#    change en fins de ligne avant de lire — sinon c'est la garde de production
#    qui serait dite fausse.
sed 's/$/\r/' "$MIGRATION" >"$BASE/r25_crlf.sql"
crlf="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$BASE/r25_crlf.sql" 2>&1 || true)"
verifier "migration extraite en CRLF : 10 OK / 0 ECHEC — et le corps de la garde porte bien des retours chariot" "10/0|t" \
  "$(BILAN "$crlf")|$(Q "select position(chr(13) in prosrc) > 0 from pg_proc where oid = 'public.rid_opaque_garde()'::regprocedure;")"
s4="$(APPLIQUER)" || { echo "  ❌ migration en échec (④)"; echo "$s4" | tail -3; exit 1; }
verifier "migration rejouée sur l'état rétabli (en LF) : 10 OK / 0 ECHEC, corps de la garde sans retour chariot" "10/0|f" \
  "$(BILAN "$s4")|$(Q "select position(chr(13) in prosrc) > 0 from pg_proc where oid = 'public.rid_opaque_garde()'::regprocedure;")"

echo "── ⑤ RETOUR ARRIÈRE (en-tête, tel quel) ───────────────────────────────"
COMPTES() { Q "select (select count(*) from public.conv_members) || '|' || (select count(*) from public.notifications) || '|' || (select count(*) from public.conv_reads) || '|' || (select count(*) from public.post_likes);"; }
FLUX avant_retour
# Un effacement ÉCRIT avant le retour arrière, que Realtime n'a pas encore lu :
# le slot ne sera lu qu'après.
verifier "X efface une de ses notifications juste avant le retour arrière (le slot n'est pas lu : Realtime en retard)" "1" \
  "$(AUTH "$X" "delete from public.notifications where id = 'n_x_s01' returning 1;")"
comptes_avant="$(COMPTES)"
ra="$(RETOUR_ARRIERE | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f - 2>&1)" || { echo "  ❌ le retour arrière a échoué :"; echo "$ra" | tail -5; ko=$((ko+1)); }
verifier "identités d'avant : DEFAULT ×4, comment_interactions FULL" "conv_members:d,conv_reads:d,notifications:d,post_likes:d|f" \
  "$(Q "select string_agg(relname || ':' || relreplident::text, ',' order by relname) from pg_class where oid in ('public.conv_members'::regclass, 'public.notifications'::regclass, 'public.conv_reads'::regclass, 'public.post_likes'::regclass);")|$(Q "select relreplident from pg_class where oid = 'public.comment_interactions'::regclass;")"
verifier "la colonne rid RESTE sur les quatre tables (NOT NULL, défaut aléatoire inchangé) ; plus d'index *_rid_key, ni garde, ni fonction, ni séquence" "4|0|0|0|0" \
  "$(Q "select count(*) from pg_attribute a join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum where a.attname = 'rid' and not a.attisdropped and a.attnotnull and a.attidentity = '' and pg_get_expr(d.adbin, d.adrelid) = '$(sql_lit "$DEF_RID")' and a.attrelid in ('public.conv_members'::regclass, 'public.notifications'::regclass, 'public.conv_reads'::regclass, 'public.post_likes'::regclass);")|$(Q "select count(*) from pg_class where relkind = 'i' and relname like '%rid_key';")|$(Q "select count(*) from pg_trigger where tgname = 'trg_rid_opaque';")|$(Q "select count(*) from pg_proc where proname = 'rid_opaque_garde';")|$(Q "select count(*) from pg_class where relkind = 'S' and relname like '%rid%';")"
verifier "les lignes sont intactes (conv_members, notifications, conv_reads, post_likes)" "$comptes_avant" "$(COMPTES)"
FLUX retard
correspond "l'effacement écrit AVANT le retour arrière, décodé APRÈS : le WAL le rend avec le catalogue d'ALORS — identité rid" \
  "^table public\.notifications: DELETE: rid\[bigint\]:[0-9]+$" "$(LIGNE retard 'table public.notifications: DELETE:%')"
verifier "…et apply_rls, qui lit le catalogue COURANT, le traite sans erreur — la colonne est restée : livré à l'abonné sans filtre, old_record null" "null" \
  "$(LIBRE "select banc.recu_historique('retard', 'table public.notifications: DELETE:%', '$S_NO_X', 'old_record');" || true)"
AUTH "$X" "delete from public.conv_members where conv_id = 'x_horloge' and user_id = '$A';" >/dev/null
FLUX retour
verifier "…et un DELETE d'après republie la clé (l'identité d'avant, exactement)" \
  "table public.conv_members: DELETE: conv_id[text]:'x_horloge' user_id[text]:'$A'" "$(LIGNE retour 'table public.conv_members: DELETE:%')"
Q "insert into public.conv_members (conv_id, user_id) values ('x_horloge', '$A');" >/dev/null
# La FENÊTRE : sans garde ni index unique, un client écrit le rid qu'il veut.
verifier "fenêtre : un INSERT sans rid passe toujours (le défaut en tire un)" "t" \
  "$(AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content) values ('n_x_fenetre0', '$X', 'like', '$X', 'f') returning rid between 0 and 9007199254740991;")"
verifier "fenêtre : X plante un rid (5151515151) sur une notification adressée à V, et en double un autre (6161616161) — tout est accepté, gardé" "|5151515151|2" \
  "$(AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, content, rid) values ('n_x_fenetre1', '$V', 'like', '$X', 'f', 5151515151), ('n_x_fenetre2', '$X', 'like', '$X', 'f', 6161616161), ('n_x_fenetre3', '$X', 'like', '$X', 'f', 6161616161);")|$(Q "select rid from public.notifications where id = 'n_x_fenetre1';")|$(Q "select count(*) from public.notifications where rid = 6161616161;")"
comptes_fenetre="$(COMPTES)"
# Revenir : rejouer la migration. À blanc d'abord — ce qu'elle verrouille en revenant.
sortie_blanc5="$(A_BLANC "select 'VERROUS=' || string_agg(distinct c.relname::text, ',' order by c.relname::text) from pg_locks l join pg_class c on c.oid = l.relation join pg_namespace n on n.oid = c.relnamespace where l.pid = pg_backend_pid() and l.granted and n.nspname = 'public' and c.relkind in ('r', 'p');" \
  | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f - 2>&1 || true)"
verifier "réappliquée À BLANC depuis le retour arrière : 10 OK / 0 ECHEC, et toujours ses cinq tables seules sous verrou" \
  "10/0|VERROUS=comment_interactions,conv_members,conv_reads,notifications,post_likes" \
  "$(BILAN "$sortie_blanc5")|$(printf '%s\n' "$sortie_blanc5" | grep -o 'VERROUS=[a-z_,]*' | tail -1)"
FLUX avant_reprise
s5="$(APPLIQUER || true)"
verifier "réappliquée après le retour arrière : 10 OK / 0 ECHEC — et chaque rid des quatre tables TIRÉ DE NOUVEAU (annoncé, table par table)" "10/0|4" \
  "$(BILAN "$s5")|$(printf '%s\n' "$s5" | grep -c 'tiré de nouveau' || true)"
verifier "…le rid planté pendant la fenêtre n'y est plus, le doublon non plus : tous les rid uniques, sur les quatre tables" "f|0|t" \
  "$(Q "select rid = 5151515151 from public.notifications where id = 'n_x_fenetre1';")|$(Q "select count(*) from public.notifications where rid = 6161616161;")|$(Q "select bool_and(n = d) from (select count(*) n, count(distinct rid) d from public.conv_members union all select count(*), count(distinct rid) from public.notifications union all select count(*), count(distinct rid) from public.conv_reads union all select count(*), count(distinct rid) from public.post_likes) s;")"
FLUX reprise
verifier "…sans rien publier (la réécriture ne passe pas au décodage), lignes intactes, rid sur 53 bits" "0|$comptes_fenetre|t" \
  "$(Q "select count(*) from banc.flux where phase = 'reprise';")|$(COMPTES)|$(RID_53)"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
