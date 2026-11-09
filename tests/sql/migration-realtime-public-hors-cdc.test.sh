#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_realtime_public_hors_cdc_2026-11-09.sql (« 📴 »)
#
# PostgreSQL jetable. Le socle recopie la production telle que mesurée au canal
# ① le 2026-11-09 : les tables du lot (colonnes de production), `auth.uid()`,
# `post_masque`, `abonne_accepte_non_bloque`, `post_is_visible`, `blocage_entre`
# et `est_identifiant_exemple` copiés de `pg_get_functiondef`, la publication
# `supabase_realtime` à neuf tables PLUS deux tables « de staging » (le staging en
# porte 23), la publication des messages diffusés, et le schéma `realtime` —
# `realtime.messages`, `realtime.topic()`, `realtime.send` (copie de production)
# et les trois policies de production.
#
# ① On applique (verdict 16/0), et la migration se rejoue.
# ② La publication est VIDE — les deux tables de staging comprises —, celle des
#    messages diffusés est intacte.
# ③ Chaque écriture d'un CLIENT (sous `authenticated`, qui n'a pas EXECUTE sur
#    les triggers) pousse au bon sujet, sous le bon nom, avec la bonne charge :
#    commentaire → `fil:<publication>` + `user:<auteur>` ; interaction → les
#    mêmes, retrait compris, LIGNE ENTIÈRE ; commentaire d'activité →
#    `fil:<activité>` ; accusé de lecture → `user:<autres membres>`. Et rien
#    pour un exemple, un fil supprimé, un blocage, une conversation de plus de
#    50 membres, une lecture qui ne change rien.
# ④ La policy du sujet `fil:` : lisible par qui peut lire la discussion, par
#    personne d'autre ; aucun client n'y émet.
# ⑤ Une poussée impossible ne bloque pas l'écriture.
# ⑥ Le retour arrière rend les neuf tables et retire tout ; la migration se
#    réapplique.
# ⑦ Le verdict ne peut pas imprimer OK sur un état faux : chaque ligne est
#    éprouvée contre la mutation qu'elle garde.
#
#   bash tests/sql/migration-realtime-public-hors-cdc.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_realtime_public_hors_cdc_2026-11-09.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6700 + RANDOM % 120 ))
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

DB=horscdc
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# Sous `authenticated`, au nom de `$1` (le chemin d'un client).
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
# La policy de `realtime.messages` OUVRE ou FERME un sujet (tout ou rien) : `$1`
# voit-il quelque chose sur `$2` ? (une ligne témoin est posée par TEMOIN)
RECOIT() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
           -c "set local role authenticated; set local request.jwt.claim.sub='$1'; set local realtime.topic='$2'; select count(*) > 0 from realtime.messages;" 2>&1 | sed 's/^t$/oui/;s/^f$/non/'; }
RECOIT_ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
           -c "set local role anon; set local realtime.topic='$1'; select count(*) > 0 from realtime.messages;" 2>&1 | sed 's/^t$/oui/;s/^f$/non/'; }
# `$1` tente d'ÉMETTRE sur `$2` (le contrôle d'écriture que fait Realtime).
EMET() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; set local realtime.topic='$2';
             insert into realtime.messages (topic, extension, payload, event, private) values ('$2', 'broadcast', '{}', 'post_comments:INSERT', true) returning 'emis';" 2>&1; }
TEMOIN() { Q "insert into realtime.messages (topic, extension, payload, event, private) values ('temoin', 'broadcast', '{}', 'temoin', true);" >/dev/null; }
# Les poussées enregistrées, dans l'ordre : « sujet>événement ».
POUSSEES() { Q "select coalesce(string_agg(topic || '>' || event, ',' order by topic, event), '-') from realtime.messages where event <> 'temoin';"; }
VIDER() { Q "truncate realtime.messages;" >/dev/null; }
RETOUR_ARRIERE() { sed -n 's/^--| //p' "$MIGRATION"; }
# Le tableau de verdict SEUL (sans rien réappliquer), dans UNE transaction comme
# dans la migration : la sonde passe son résultat au SELECT par un réglage LOCAL.
VERDICT_SEUL() { { echo "begin;"; sed -n '/^-- ── VERDICT/,/^commit;/p' "$MIGRATION" | sed '$d'; echo "rollback;"; } \
                 | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 2>&1; }
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1; }
BILAN() { printf '%s/%s/%s' "$(printf '%s\n' "$1" | grep -cE '\|\s*OK\s*$' || true)" "$(printf '%s\n' "$1" | grep -cE '\|\s*ECHEC\s*$' || true)" "$(printf '%s\n' "$1" | grep -cE '\|\s*SANS OBJET' || true)"; }
# La ligne en ECHEC d'un verdict contient-elle `$2` ?
ROUGE() { printf '%s\n' "$1" | grep -E '\|\s*ECHEC\s*$' | grep -c -- "$2" || true; }

A=11111111-1111-4111-8111-111111111111   # autrice d'une publication publique et d'une activité
B=22222222-2222-4222-8222-222222222222   # commente, réagit, lit
C=33333333-3333-4333-8333-333333333333   # compte PRIVÉ, autrice d'une publication
D=44444444-4444-4444-8444-444444444444   # abonnée ACCEPTÉE de C, membre d'un groupe
X=88888888-8888-4888-8888-888888888888   # tiers sans aucun lien

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
-- auth.uid(), copie de production.
create function auth.uid() returns uuid language sql stable as $fn$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

-- ── Les tables, colonnes de production (information_schema, 2026-11-09) ────
create table public.profiles (id text primary key, username text, emoji text, avatar_url text, is_private boolean default false);
create table public.follows (follower_id text not null, following_id text not null, status text default 'accepted',
  primary key (follower_id, following_id));
create table public.blocks (blocker_id text not null, blocked_id text not null, primary key (blocker_id, blocked_id));
create table public.contenus_masques (target_type text, target_id text, decision text);
create table public.posts (id text primary key, author_id text, content text, created_at timestamp without time zone default now());
create table public.post_comments (id text primary key, post_id text, author_id text, content text,
  created_at timestamp without time zone default now());
create table public.comment_interactions (id text primary key, comment_id text, post_id text, user_id text, kind text, payload text,
  created_at timestamptz default now());
create table public.events (id text primary key, author_id text, created_at timestamp without time zone default now());
create table public.event_comments (id text primary key, event_id text references public.events(id) on delete cascade,
  author_id text, author_name text, text text, created_at timestamptz default now());
create table public.conversations (id text primary key);
create table public.conv_members (conv_id text not null references public.conversations(id), user_id text not null,
  primary key (conv_id, user_id));
create table public.conv_reads (conv_id text not null, user_id text not null, last_read_at timestamptz, rid bigint,
  primary key (conv_id, user_id));
create table public.conv_messages (id text primary key, conv_id text, from_id text, content text);
create table public.notifications (id text primary key, user_id text);
create table public.post_likes (post_id text not null, user_id text not null, primary key (post_id, user_id));
create table public.video_lives (id text primary key);
-- Deux tables que seul le STAGING publie encore (23 tables) : la migration doit
-- vider la publication quelle que soit sa liste.
create table public.telemetry_events (id text primary key);
create table public.cdv_lives (id text primary key);
-- Un client écrit ces tables (la RLS n'est pas l'objet du banc : elle reste coupée).
grant select, insert, update, delete on public.post_comments, public.comment_interactions, public.event_comments,
  public.conv_reads to authenticated;

-- ── Les fonctions de visibilité, copies de production (2026-11-09) ─────────
CREATE OR REPLACE FUNCTION public.est_identifiant_exemple(_id text)
 RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO ''
AS $function$ select coalesce(_id ~ '^(p[0-9]+|p[mpv][0-9]+|pn_[a-z0-9]+_[0-9]+|pac_[a-z]+|p_ev_[a-z]+|p_ev[0-9]+_e[0-9]+|reel_seed_[a-z0-9_]+|e[0-9]+)$', false) $function$;
CREATE OR REPLACE FUNCTION public.post_masque(p_id text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ select exists ( select 1 from public.contenus_masques m where m.target_type = 'post' and m.target_id = p_id and m.decision is distinct from 'retabli' ); $function$;
CREATE OR REPLACE FUNCTION public.abonne_accepte_non_bloque(_auteur text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select case
    when auth.uid() is null or _auteur is null then false
    else exists (
      select 1 from public.follows f
      where f.follower_id = (auth.uid())::text
        and f.following_id = _auteur
        and f.status = 'accepted'
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = _auteur and b.blocked_id = (auth.uid())::text)
         or (b.blocker_id = (auth.uid())::text and b.blocked_id = _auteur)
    )
  end
$function$;
CREATE OR REPLACE FUNCTION public.post_is_visible(pid text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select case
    when pid is null then false
    when not exists (select 1 from posts where id = pid) then public.est_identifiant_exemple(pid)
    else exists (
      select 1 from posts p
      where p.id = pid and (
        p.author_id = (select auth.uid())::text
        or (not public.post_masque(p.id) and (
              not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
              or public.abonne_accepte_non_bloque(p.author_id)))
      )
    )
  end
$function$;
CREATE OR REPLACE FUNCTION public.blocage_entre(_a text, _b text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
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
grant execute on function public.post_is_visible(text) to anon, authenticated;

-- Les poussées déjà en place (canal des messages, R25) : des déclencheurs témoins
-- dont le verdict exige qu'ils restent actifs.
create function public.temoin_trigger() returns trigger language plpgsql as $fn$ begin return null; end $fn$;
create trigger broadcast_conv_message_users_trigger after insert on public.conv_messages for each row execute function public.temoin_trigger();
create trigger trg_diffuser_notification after insert on public.notifications for each row execute function public.temoin_trigger();
create trigger trg_diffuser_ajout_membre after insert on public.conv_members for each row execute function public.temoin_trigger();

create publication supabase_realtime for table
  public.comment_interactions, public.conv_messages, public.conv_reads, public.event_comments, public.post_comments,
  public.post_likes, public.posts, public.profiles, public.video_lives, public.telemetry_events, public.cdv_lives;

-- ── Le schéma `realtime`, tel que la production le porte ───────────────────
create schema realtime;
grant usage on schema realtime to anon, authenticated;
create table realtime.messages (
  topic text not null, extension text not null, payload jsonb, event text, private boolean default false,
  updated_at timestamp without time zone default timezone('utc'::text, clock_timestamp()) not null,
  inserted_at timestamp without time zone default timezone('utc'::text, clock_timestamp()) not null,
  id uuid default gen_random_uuid() not null, binary_payload bytea, skip_broadcast boolean default false not null,
  primary key (id, inserted_at));
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to anon, authenticated;
create publication supabase_realtime_messages_publication for table realtime.messages;

create function realtime.topic() returns text language sql stable
as $function$ select nullif(current_setting('realtime.topic', true), '')::text; $function$;

-- Les trois policies de production (pg_policies, 2026-11-09).
create function public.is_conv_member(_conv_id text, _uid text) returns boolean
language sql stable security definer set search_path to ''
as $fn$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $fn$;
grant execute on function public.is_conv_member(text, text) to authenticated;
create policy passio_rt_emettre on realtime.messages for insert to authenticated with check (
  (realtime.topic() ~~ 'call:%') or (realtime.topic() ~~ 'vlive:%')
  or ((realtime.topic() ~~ 'typing:%') and public.is_conv_member(substr(realtime.topic(), 8), (select auth.uid())::text))
  or ((realtime.topic() ~~ 'conv:%') and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text)));
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
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$function$;
SQL

# ── Les données du banc ─────────────────────────────────────────────────────
Q "insert into public.profiles (id, username, is_private) values
     ('$A', 'Alice', false), ('$B', 'Bob', false), ('$C', 'Chloe', true), ('$D', 'Dora', false), ('$X', 'Xavier', false);
   insert into public.follows (follower_id, following_id, status) values ('$D', '$C', 'accepted');
   insert into public.posts (id, author_id, content, created_at) values
     ('post_pub', '$A', 'publique', now() - interval '1 hour'),
     ('post_privee', '$C', 'privee', now() - interval '2 hours'),
     ('post_masquee', '$A', 'masquee', now() - interval '3 hours'),
     ('post_supprimee', '$A', 'a supprimer', now() - interval '4 hours');
   insert into public.contenus_masques (target_type, target_id, decision) values ('post', 'post_masquee', 'masque');
   insert into public.events (id, author_id) values ('ev_banc', '$A');
   insert into public.conversations (id) values ('conv_duo'), ('conv_groupe'), ('conv_foule');
   insert into public.conv_members (conv_id, user_id) values
     ('conv_duo', '$A'), ('conv_duo', '$B'),
     ('conv_groupe', '$A'), ('conv_groupe', '$B'), ('conv_groupe', '$D'), ('conv_groupe', 'u_historique_non_uuid');
   insert into public.conv_members (conv_id, user_id)
     select 'conv_foule', gen_random_uuid()::text from generate_series(1, 50);
   insert into public.conv_members (conv_id, user_id) values ('conv_foule', '$A');" >/dev/null

echo "① Application"
sortie="$(APPLIQUER)"
verifier "verdict 16 OK, 0 ECHEC, 0 SANS OBJET" "16/0/0" "$(BILAN "$sortie")"
[ "$(BILAN "$sortie")" = "16/0/0" ] || printf '%s\n' "$sortie" | sed 's/^/     /'
sortie="$(APPLIQUER)"
verifier "rejouable : verdict identique" "16/0/0" "$(BILAN "$sortie")"
verifier "la sonde n'a rien laissé (ni interaction, ni commentaire, ni accusé)" "0|0|0|0" \
  "$(Q "select (select count(*) from public.comment_interactions) || '|' || (select count(*) from public.post_comments) || '|' ||
              (select count(*) from public.event_comments) || '|' || (select count(*) from public.conv_reads);")"
verifier "la sonde n'a rien laissé dans realtime.messages" "0" "$(Q "select count(*) from realtime.messages;")"

echo "② Les publications"
verifier "supabase_realtime : aucune table, les deux de staging comprises" "0" \
  "$(Q "select count(*) from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid where p.pubname = 'supabase_realtime';")"
verifier "la publication des messages diffusés porte toujours realtime.messages" "1" \
  "$(Q "select count(*) from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid
         where p.pubname = 'supabase_realtime_messages_publication' and pr.prrelid = 'realtime.messages'::regclass;")"

echo "③ Les poussées, écrites par un CLIENT (authenticated, sans EXECUTE sur les triggers)"
VIDER
AUTH "$B" "insert into public.post_comments (id, post_id, author_id, content) values ('c_b1', 'post_pub', '$B', 'Bonjour');" >/dev/null
verifier "un commentaire : au sujet du fil ET à l'autrice" "fil:post_pub>post_comments:INSERT,user:$A>post_comments:INSERT" "$(POUSSEES)"
verifier "la charge : colonne par colonne, rien de plus" "author_id,content,created_at,id,post_id" \
  "$(Q "select string_agg(k, ',' order by k) from realtime.messages m, jsonb_object_keys(m.payload -> 'record') k where m.topic = 'fil:post_pub';")"
verifier "la charge porte la table et l'opération" "post_comments|INSERT" \
  "$(Q "select payload ->> 'table' || '|' || (payload ->> 'operation') from realtime.messages where topic = 'fil:post_pub';")"
VIDER
AUTH "$A" "insert into public.post_comments (id, post_id, author_id, content) values ('c_a1', 'post_pub', '$A', 'Merci');" >/dev/null
verifier "l'autrice qui commente : ses autres appareils le reçoivent aussi" "fil:post_pub>post_comments:INSERT,user:$A>post_comments:INSERT" "$(POUSSEES)"
VIDER
AUTH "$B" "insert into public.post_comments (id, post_id, author_id, content) values ('c_ex', 'p12', '$B', 'exemple');" >/dev/null
verifier "un exemple (aucune ligne posts) : rien" "-" "$(POUSSEES)"
VIDER
Q "insert into public.blocks (blocker_id, blocked_id) values ('$A', '$B');" >/dev/null
AUTH "$B" "insert into public.post_comments (id, post_id, author_id, content) values ('c_b2', 'post_pub', '$B', 'bloque');" >/dev/null
verifier "un blocage entre l'autrice et le commentateur : le sujet du fil seulement" "fil:post_pub>post_comments:INSERT" "$(POUSSEES)"
Q "delete from public.blocks;" >/dev/null

VIDER
AUTH "$B" "insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values ('ci_b1', 'c_a1', 'post_pub', '$B', 'emoji', 'feu');" >/dev/null
verifier "une interaction : au sujet du fil ET à l'autrice" "fil:post_pub>comment_interactions:INSERT,user:$A>comment_interactions:INSERT" "$(POUSSEES)"
VIDER
AUTH "$B" "delete from public.comment_interactions where id = 'ci_b1';" >/dev/null
verifier "son retrait : les mêmes sujets, sous DELETE" "fil:post_pub>comment_interactions:DELETE,user:$A>comment_interactions:DELETE" "$(POUSSEES)"
verifier "le retrait porte la LIGNE ENTIÈRE" "ci_b1|c_a1|post_pub|$B|emoji|feu|DELETE" \
  "$(Q "select payload -> 'record' ->> 'id' || '|' || (payload -> 'record' ->> 'comment_id') || '|' || (payload -> 'record' ->> 'post_id') || '|' ||
              (payload -> 'record' ->> 'user_id') || '|' || (payload -> 'record' ->> 'kind') || '|' || (payload -> 'record' ->> 'payload') || '|' ||
              (payload ->> 'operation') from realtime.messages where topic = 'fil:post_pub';")"
verifier "la charge d'une interaction : colonne par colonne" "comment_id,created_at,id,kind,payload,post_id,user_id" \
  "$(Q "select string_agg(k, ',' order by k) from realtime.messages m, jsonb_object_keys(m.payload -> 'record') k where m.topic = 'fil:post_pub';")"
VIDER
AUTH "$B" "insert into public.comment_interactions (id, comment_id, post_id, user_id, kind) values ('ci_ev', 'ec_x', 'ev_banc', '$B', 'like');" >/dev/null
verifier "une interaction dans une activité : son sujet seulement" "fil:ev_banc>comment_interactions:INSERT" "$(POUSSEES)"
VIDER
AUTH "$B" "insert into public.comment_interactions (id, comment_id, post_id, user_id, kind) values ('ci_sans', 'c_a1', null, '$B', 'like'),
                                                                                                     ('ci_ex', 'p12', 'p12', '$B', 'like');" >/dev/null
verifier "sans fil, ou sur un exemple : rien" "-" "$(POUSSEES)"
Q "insert into public.comment_interactions (id, comment_id, post_id, user_id, kind) values ('ci_orph', 'post_supprimee', 'post_supprimee', '$B', 'like');" >/dev/null
Q "delete from public.posts where id = 'post_supprimee';" >/dev/null
VIDER
Q "delete from public.comment_interactions where id = 'ci_orph';" >/dev/null
verifier "la purge des cibles d'une publication supprimée : rien" "-" "$(POUSSEES)"

VIDER
AUTH "$B" "insert into public.event_comments (id, event_id, author_id, text) values ('ec_b1', 'ev_banc', '$B', 'Super');" >/dev/null
verifier "un commentaire d'activité : son sujet" "fil:ev_banc>event_comments:INSERT" "$(POUSSEES)"
verifier "sa charge le désigne, sans le texte" "author_id,created_at,event_id,id" \
  "$(Q "select string_agg(k, ',' order by k) from realtime.messages m, jsonb_object_keys(m.payload -> 'record') k where m.topic = 'fil:ev_banc';")"

VIDER
AUTH "$B" "insert into public.conv_reads (conv_id, user_id, last_read_at) values ('conv_duo', '$B', '2026-11-09 10:00:00+00');" >/dev/null
verifier "un accusé de lecture : à l'AUTRE membre seulement" "user:$A>conv_reads:UPSERT" "$(POUSSEES)"
VIDER
AUTH "$B" "update public.conv_reads set last_read_at = '2026-11-09 10:05:00+00' where conv_id = 'conv_duo' and user_id = '$B';" >/dev/null
verifier "une nouvelle lecture : de nouveau" "user:$A>conv_reads:UPSERT" "$(POUSSEES)"
VIDER
AUTH "$B" "update public.conv_reads set last_read_at = '2026-11-09 10:05:00+00' where conv_id = 'conv_duo' and user_id = '$B';" >/dev/null
verifier "une lecture qui ne change rien : rien" "-" "$(POUSSEES)"
VIDER
AUTH "$D" "insert into public.conv_reads (conv_id, user_id, last_read_at) values ('conv_groupe', '$D', now());" >/dev/null
verifier "un groupe : chaque autre membre (un identifiant historique non uuid n'a pas de sujet)" "user:$A>conv_reads:UPSERT,user:$B>conv_reads:UPSERT" "$(POUSSEES)"
VIDER
Q "insert into public.blocks (blocker_id, blocked_id) values ('$A', '$D');" >/dev/null
AUTH "$D" "update public.conv_reads set last_read_at = now() + interval '1 minute' where conv_id = 'conv_groupe' and user_id = '$D';" >/dev/null
verifier "un membre bloqué ne reçoit pas l'accusé" "user:$B>conv_reads:UPSERT" "$(POUSSEES)"
Q "delete from public.blocks;" >/dev/null
VIDER
AUTH "$A" "insert into public.conv_reads (conv_id, user_id, last_read_at) values ('conv_foule', '$A', now());" >/dev/null
verifier "plus de 50 membres : rien (le ✓✓ se relit à l'ouverture)" "-" "$(POUSSEES)"
verifier "la charge d'un accusé : conversation, compte, instant" "conv_id,last_read_at,user_id" \
  "$(VIDER; AUTH "$B" "update public.conv_reads set last_read_at = now() where conv_id = 'conv_duo' and user_id = '$B';" >/dev/null;
     Q "select string_agg(k, ',' order by k) from realtime.messages m, jsonb_object_keys(m.payload -> 'record') k where m.topic = 'user:$A';")"

echo "④ La policy du sujet fil:"
VIDER; TEMOIN
verifier "un tiers lit le sujet d'une publication publique" "oui" "$(RECOIT "$X" 'fil:post_pub')"
verifier "un tiers ne lit pas celui d'une publication PRIVÉE" "non" "$(RECOIT "$X" 'fil:post_privee')"
verifier "son abonnée acceptée, si" "oui" "$(RECOIT "$D" 'fil:post_privee')"
verifier "son autrice, si" "oui" "$(RECOIT "$C" 'fil:post_privee')"
verifier "une publication MASQUÉE : pas le tiers" "non" "$(RECOIT "$X" 'fil:post_masquee')"
verifier "…mais son autrice" "oui" "$(RECOIT "$A" 'fil:post_masquee')"
verifier "une activité : tout compte" "oui" "$(RECOIT "$X" 'fil:ev_banc')"
verifier "un exemple : personne (aucune ligne n'y passe)" "non" "$(RECOIT "$X" 'fil:p12')"
verifier "un fil inconnu : personne" "non" "$(RECOIT "$X" 'fil:inconnu')"
Q "insert into public.blocks (blocker_id, blocked_id) values ('$C', '$D');" >/dev/null
verifier "un blocage entre l'autrice privée et son abonnée : plus lisible" "non" "$(RECOIT "$D" 'fil:post_privee')"
Q "delete from public.blocks;" >/dev/null
verifier "un visiteur (anon) : rien" "non" "$(RECOIT_ANON 'fil:post_pub')"
contient "aucun client n'émet sur un sujet fil:" "row-level security" "$(EMET "$A" 'fil:post_pub')"
verifier "la sonde n'autorise rien de plus : user:<autre> reste fermé" "non" "$(RECOIT "$X" "user:$A")"
verifier "EXECUTE : aucun client sur les fonctions de trigger" "f|f|f|f|f|f|f|f" \
  "$(Q "select string_agg(has_function_privilege(r, f, 'EXECUTE')::text, '|' order by r, f) from unnest(array['anon', 'authenticated']) r,
          unnest(array['public.diffuser_commentaire_publication()', 'public.diffuser_interaction()', 'public.diffuser_commentaire_activite()',
                       'public.diffuser_lecture()']) f;" | sed 's/false/f/g;s/true/t/g')"
verifier "EXECUTE de la visibilité du fil : authenticated oui, anon non" "t|f" \
  "$(Q "select has_function_privilege('authenticated', 'public.fil_temps_reel_visible(text)', 'EXECUTE')::text || '|' ||
              has_function_privilege('anon', 'public.fil_temps_reel_visible(text)', 'EXECUTE')::text;" | sed 's/false/f/g;s/true/t/g')"

echo "⑤ Une poussée impossible ne bloque pas l'écriture"
VIDER
Q "alter function realtime.send(jsonb, text, text, boolean) rename to send_renommee;" >/dev/null
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
          -c "set local role authenticated; set local request.jwt.claim.sub='$B';
              insert into public.post_comments (id, post_id, author_id, content) values ('c_sans_send', 'post_pub', '$B', 'quand meme') returning 'ecrit';" 2>&1)"
contient "le commentaire s'écrit" "ecrit" "$sortie"
contient "et l'avertissement nomme la cause" "poussee sautee" "$sortie"
verifier "rien n'est poussé" "-" "$(POUSSEES)"
sortie="$(VERDICT_SEUL)"
verifier "le verdict le dit (realtime.send absente)" "1" "$(ROUGE "$sortie" "realtime.send")"
Q "alter function realtime.send_renommee(jsonb, text, text, boolean) rename to send;" >/dev/null

echo "⑥ Le retour arrière, puis la réapplication"
RETOUR_ARRIERE | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1
verifier "les neuf tables de production republiées (pas celles du staging)" \
  "comment_interactions,conv_messages,conv_reads,event_comments,post_comments,post_likes,posts,profiles,video_lives" \
  "$(Q "select string_agg(c.relname, ',' order by c.relname) from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid
         join pg_class c on c.oid = pr.prrelid where p.pubname = 'supabase_realtime';")"
verifier "triggers, fonctions et policy retirés" "0|0|0" \
  "$(Q "select (select count(*) from pg_trigger where tgname in ('trg_diffuser_commentaire_publication', 'trg_diffuser_interaction',
                    'trg_diffuser_commentaire_activite', 'trg_diffuser_lecture')) || '|' ||
              (select count(*) from pg_proc where proname in ('diffuser_commentaire_publication', 'diffuser_interaction',
                    'diffuser_commentaire_activite', 'diffuser_lecture', 'fil_temps_reel_visible')) || '|' ||
              (select count(*) from pg_policies where policyname = 'passio_rt_recevoir_fil');")"
RETOUR_ARRIERE | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1
verifier "le retour arrière se rejoue" "9" \
  "$(Q "select count(*) from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid where p.pubname = 'supabase_realtime';")"
sortie="$(APPLIQUER)"
verifier "la migration se réapplique : 16/0/0" "16/0/0" "$(BILAN "$sortie")"

echo "⑦ Le verdict ne peut pas imprimer OK sur un état faux"
eprouver() {
  # $1 : libellé ; $2 : SQL de la mutation ; $3 : motif de la ligne qui doit rougir
  Q "$2" >/dev/null
  local s; s="$(VERDICT_SEUL)"
  verifier "$1" "1" "$(ROUGE "$s" "$3")"
  APPLIQUER >/dev/null
}
eprouver "une table republiée" "alter publication supabase_realtime add table public.posts;" "VIDE"
eprouver "un schéma publié" "alter publication supabase_realtime add tables in schema realtime;" "VIDE"
eprouver "la publication des messages diffusés vidée" "alter publication supabase_realtime_messages_publication drop table realtime.messages;" "messages diffusés"
Q "alter publication supabase_realtime_messages_publication add table realtime.messages;" >/dev/null
eprouver "un trigger retiré" "drop trigger trg_diffuser_lecture on public.conv_reads;" "quatre triggers"
eprouver "un trigger désactivé" "alter table public.comment_interactions disable trigger trg_diffuser_interaction;" "quatre triggers"
eprouver "un search_path retiré" "alter function public.diffuser_interaction() reset search_path;" "cinq fonctions"
eprouver "EXECUTE rendu à un client" "grant execute on function public.diffuser_lecture() to authenticated;" "n'exécute"
eprouver "EXECUTE de la visibilité rendu à anon" "grant execute on function public.fil_temps_reel_visible(text) to anon;" "n'exécute"
eprouver "une poussée sous « INSERT »" \
  "create or replace function public.diffuser_commentaire_activite() returns trigger language plpgsql security definer set search_path = '' as \$f\$
   begin perform realtime.send(jsonb_build_object('record', jsonb_build_object('id', new.id)), 'INSERT', 'fil:' || new.event_id, true); return null; end \$f\$;" \
  "nom distinct"
eprouver "la policy du sujet retirée" "drop policy passio_rt_recevoir_fil on realtime.messages;" "passio_rt_recevoir_fil"
eprouver "la policy du sujet élargie à tout fil" \
  "drop policy passio_rt_recevoir_fil on realtime.messages;
   create policy passio_rt_recevoir_fil on realtime.messages for select to authenticated using (realtime.topic() ~~ 'fil:%');" \
  "fil inexistant"
eprouver "une policy d'émission sur fil:" \
  "create policy emission_fil on realtime.messages for insert to authenticated with check (realtime.topic() ~~ 'fil:%');" \
  "ÉMETTRE"
Q "drop policy if exists emission_fil on realtime.messages;" >/dev/null
eprouver "un trigger d'interaction qui oublie l'auteur" \
  "create or replace function public.diffuser_interaction() returns trigger language plpgsql security definer set search_path = '' as \$f\$
   declare r record; begin if tg_op = 'DELETE' then r := old; else r := new; end if;
   perform realtime.send(jsonb_build_object('record', jsonb_build_object('id', r.id)), 'comment_interactions:' || tg_op, 'fil:' || r.post_id, true);
   return null; end \$f\$;" \
  "interaction ajoutée"
eprouver "un retrait sans la ligne entière" \
  "create or replace function public.diffuser_interaction() returns trigger language plpgsql security definer set search_path = '' as \$f\$
   declare r record; a text; begin if tg_op = 'DELETE' then r := old; else r := new; end if;
   select p.author_id into a from public.posts p where p.id = r.post_id;
   perform realtime.send(jsonb_build_object('record', jsonb_build_object('id', r.id)), 'comment_interactions:' || tg_op, 'fil:' || r.post_id, true);
   perform realtime.send(jsonb_build_object('record', jsonb_build_object('id', r.id)), 'comment_interactions:' || tg_op, 'user:' || a, true);
   return null; end \$f\$;" \
  "LIGNE ENTIÈRE"
eprouver "un accusé renvoyé au lecteur" \
  "create or replace function public.diffuser_lecture() returns trigger language plpgsql security definer set search_path = '' as \$f\$
   declare m record; begin for m in select cm.user_id from public.conv_members cm where cm.conv_id = new.conv_id loop
   perform realtime.send(jsonb_build_object('record', jsonb_build_object('conv_id', new.conv_id)), 'conv_reads:UPSERT', 'user:' || m.user_id, true);
   end loop; return null; end \$f\$;" \
  "jamais au lecteur"
eprouver "un trigger de poussée des messages coupé" "alter table public.conv_messages disable trigger broadcast_conv_message_users_trigger;" "intacts"
Q "alter table public.conv_messages enable trigger broadcast_conv_message_users_trigger;" >/dev/null

echo
echo "Résultat : ${ok} vérification(s) conforme(s), ${ko} écart(s)."
[ "$ko" -eq 0 ]
