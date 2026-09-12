#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_ouverture_publique_2026-09-11.sql
#
# Même méthode que les bancs de sécurité des 08 et 10/09 : on reconstitue
# l'état RÉEL de la production sur un PostgreSQL jetable, on MESURE D'ABORD
# chaque défaut (sinon on ne prouve pas qu'on l'a refermé), on applique la
# migration, on la REJOUE (idempotence), on vérifie chaque correctif dans les
# deux sens (ce qui doit être refusé l'est, ce qui doit encore passer passe),
# puis on retire chaque garde une par une et on exige que le banc — et le
# TABLEAU DE VERDICT du fichier — rougissent.
#
# ⚠️ Le socle porte les policies de production TELLES QUELLES (noms compris) :
# la migration fait des `alter policy … to authenticated` par NOM, et un socle
# qui les nommerait autrement accuserait la migration d'un défaut qui n'est que
# le sien. Il porte aussi les trois `trg_rate_limit` déjà en prod, parce que le
# verdict ⑤ compte des TABLES et non des ajouts.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_ouverture_publique_2026-09-11.sql"
APP08="$RACINE/js/app-08-ui-modals-tour.js"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 5930 + RANDOM % 120 ))
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
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
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

DB=ouverture
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
# Realtime évalue ses policies avec le TOPIC posé dans la session.
RT()   { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; set local realtime.topic='$2'; $3" 2>&1; }

A=11111111-1111-1111-1111-111111111111   # compte public
B=22222222-2222-2222-2222-222222222222   # compte PRIVÉ, qui a bloqué C
C=33333333-3333-3333-3333-333333333333   # bloqué par B
D=44444444-4444-4444-4444-444444444444   # tiers, sans lien

ok=0; ko=0
verifier() { # libellé, attendu, obtenu
  if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi
}
contient() { # libellé, motif, texte
  if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi
}
# ⚠️ `psql -q` AVALE les étiquettes de commande (« INSERT 0 1 », « DO »…) : on ne
# peut pas lire le succès dans la sortie. Ces trois aides rendent « OK » quand la
# commande n'a produit aucune erreur, et le message d'erreur sinon — lisible dans
# le rapport, là où un « obtenu : (vide) » n'apprendrait rien.
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
AUTH_OK() { _ok_ou_erreur "$(AUTH "$1" "$2")"; }
ANON_OK() { _ok_ou_erreur "$(ANON "$1")"; }
RT_OK()   { _ok_ou_erreur "$(RT "$1" "$2" "$3")"; }

# ── SOCLE : l'état RÉEL de la production, mesuré le 2026-09-11 ──────────────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 \
     -v a="$A" -v b="$B" -v c="$C" -v d="$D" >/dev/null <<'SQL'
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

-- ── Tables (colonnes utiles seulement, noms de policies EXACTS) ──
create table public.profiles (id text primary key, username text, is_private boolean default false);
alter table public.profiles enable row level security;
create policy "Lecture publique" on public.profiles for select to public using (true);

create table public.blocks (blocker_id text not null, blocked_id text not null, created_at timestamptz default now(),
  primary key (blocker_id, blocked_id));
alter table public.blocks enable row level security;
create policy "blocks_insert_own" on public.blocks for insert to public with check (blocker_id = (auth.uid())::text);

create table public.conversations (id text primary key, is_group boolean default false, created_by text, created_at timestamp default now());
alter table public.conversations enable row level security;
create table public.conv_members (conv_id text not null, user_id text not null, primary key (conv_id, user_id));
alter table public.conv_members enable row level security;
create table public.conv_messages (id text primary key, conv_id text not null, from_id text, content text, created_at timestamp default now());
alter table public.conv_messages enable row level security;
create table public.conv_reads (conv_id text not null, user_id text not null, last_read_at timestamptz default now(), primary key (conv_id, user_id));
alter table public.conv_reads enable row level security;

create function public.is_conv_member(_conv_id text, _uid text)
  returns boolean language sql stable security definer set search_path = '' as
  $fn$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $fn$;
-- L'état de prod : EXECUTE nominatif à anon ET authenticated (privilèges par défaut Supabase).
grant execute on function public.is_conv_member(text, text) to anon, authenticated;

create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path = '' as
  $fn$ select case when auth.uid() is null or _other is null or _other = (auth.uid())::text then false
       else exists (select 1 from public.blocks b where (b.blocker_id = (auth.uid())::text and b.blocked_id = _other)
                    or (b.blocker_id = _other and b.blocked_id = (auth.uid())::text)) end $fn$;
revoke execute on function public.is_blocked_with(text) from public;
grant execute on function public.is_blocked_with(text) to authenticated;

create policy "conversations_select_member" on public.conversations for select to public
  using (public.is_conv_member(id, (select auth.uid())::text));
create policy "conv_members_select_member" on public.conv_members for select to public
  using (public.is_conv_member(conv_id, (select auth.uid())::text));
create policy "conv_messages_select_member" on public.conv_messages for select to public
  using (public.is_conv_member(conv_id, (select auth.uid())::text));
create policy "conv_messages_insert_member" on public.conv_messages for insert to authenticated
  with check (from_id = (select auth.uid())::text and public.is_conv_member(conv_id, (select auth.uid())::text));
-- Prod : USING seul, pas de WITH CHECK, rien ne fige conv_id (défaut ⑧ de la red team).
create policy "Update propre" on public.conv_messages for update to public using (from_id = (auth.uid())::text);
create policy "reads_select" on public.conv_reads for select to public
  using (public.is_conv_member(conv_id, (select auth.uid())::text));

-- follows : DEUX colonnes, comme en prod (ni created_at, ni statut).
create table public.follows (follower_id text not null, following_id text not null, primary key (follower_id, following_id));
alter table public.follows enable row level security;
create policy "Lecture publique" on public.follows for select to public using (true);
create policy "Read follows" on public.follows for select to public using (true);
create policy "Ecriture propre" on public.follows for insert to public with check (follower_id = (auth.uid())::text);
create policy "Suppression propre" on public.follows for delete to public using (follower_id = (auth.uid())::text);
create policy "Suppression cote suivi" on public.follows for delete to public using (following_id = (auth.uid())::text);

create table public.posts (id text primary key, author_id text, content text, created_at timestamp default now());
alter table public.posts enable row level security;
create function public.can_edit_post(pid text) returns boolean language sql stable security definer set search_path = 'public' as
  $fn$ select exists (select 1 from posts p where p.id = pid and p.author_id = (select auth.uid())::text) $fn$;
grant execute on function public.can_edit_post(text) to anon, authenticated;
create policy "Ecriture propre" on public.posts for insert to public with check (author_id = (auth.uid())::text);
create policy "Update propre" on public.posts for update to public using (can_edit_post(id)) with check (can_edit_post(id));
create policy "Lecture respectant les comptes prives" on public.posts for select to public using (
  (author_id = (( select auth.uid()))::text)
  or (not (exists (select 1 from profiles pr where pr.id = posts.author_id and pr.is_private = true)))
  or (exists (select 1 from follows f where f.follower_id = (( select auth.uid()))::text and f.following_id = posts.author_id)));

create table public.stories (id text primary key, author_id text, created_at timestamp default now());
alter table public.stories enable row level security;
create policy "Ecriture propre" on public.stories for insert to public with check (author_id = (auth.uid())::text);
create policy "Lecture stories respectant les comptes prives" on public.stories for select to public using (
  (author_id = (( select auth.uid()))::text)
  or (not (exists (select 1 from profiles pr where pr.id = stories.author_id and pr.is_private = true)))
  or (exists (select 1 from follows f where f.follower_id = (( select auth.uid()))::text and f.following_id = stories.author_id)));

create function public.post_is_visible(pid text) returns boolean language sql stable security definer set search_path = 'public' as
  $fn$ select case when pid is null then true
       when not exists (select 1 from posts where id = pid) then true
       else exists (select 1 from posts p where p.id = pid and (p.author_id = (select auth.uid())::text
         or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
         or exists (select 1 from follows f where f.follower_id = (select auth.uid())::text and f.following_id = p.author_id))) end $fn$;
grant execute on function public.post_is_visible(text) to anon, authenticated;

create table public.post_comments (id text primary key, post_id text, author_id text, text text, created_at timestamp default now());
alter table public.post_comments enable row level security;
create policy "Ecriture propre" on public.post_comments for insert to public with check (author_id = (auth.uid())::text);
create policy "Lecture selon visibilite du post" on public.post_comments for select to public
  using (author_id = (select auth.uid())::text or post_is_visible(post_id));
create policy "Update propre" on public.post_comments for update to public using (author_id = (auth.uid())::text);
create table public.post_likes (post_id text not null, user_id text not null, primary key (post_id, user_id));
alter table public.post_likes enable row level security;
create policy "Ecriture propre" on public.post_likes for insert to public with check (user_id = (auth.uid())::text);

-- events : TOUTES les colonnes de prod (le GRANT colonne par colonne échoue sur la première absente).
create table public.events (
  id text primary key, author_id text, title text, passion_id text, lat double precision, lng double precision,
  city text, description text, emoji text, max_attendees int, date_at timestamp, created_at timestamp default now(),
  venue text, address text, postal_code text, price text, contact text, external_link text, event_type text,
  cover_url text, organizer_id text, end_at timestamp, status text, updated_at timestamp, co_organizers jsonb,
  series_id text, recurrence text, conv_id text);
alter table public.events enable row level security;
create policy "Lecture publique" on public.events for select to public using (true);
create policy "Ecriture propre" on public.events for insert to public with check (author_id = (auth.uid())::text);
create table public.event_comments (id text primary key, event_id text, author_id text, text text, created_at timestamptz default now());
alter table public.event_comments enable row level security;
create policy "event_comments_insert_own" on public.event_comments for insert to public with check (author_id = (auth.uid())::text);

create table public.notifications (id text primary key, user_id text, kind text, from_id text, ref_id text, content text,
  seen boolean default false, created_at timestamp default now());
alter table public.notifications enable row level security;
create policy "notifications_insert_own_author" on public.notifications for insert to public
  with check (from_id = (select auth.uid())::text);

create table public.reports (id text primary key default gen_random_uuid()::text, reporter_id text, target_type text,
  target_id text, reason text, created_at timestamptz default now());
alter table public.reports enable row level security;
create policy "reports_insert" on public.reports for insert to public with check (reporter_id = (auth.uid())::text);

create table public.client_errors (id text primary key default gen_random_uuid()::text, message text, uid text,
  created_at timestamptz default now(), auth_uid uuid);
alter table public.client_errors enable row level security;
create policy "Insert erreurs" on public.client_errors for insert to public with check (true);
create index idx_client_errors_created on public.client_errors (created_at desc);
create table public.telemetry_events (id uuid primary key default gen_random_uuid(), user_id text, type text,
  received_at timestamptz default now());
alter table public.telemetry_events enable row level security;
create policy "telemetry_insert_own" on public.telemetry_events for insert to public
  with check (user_id is null or user_id = (auth.uid())::text);
create index idx_tel_received_at on public.telemetry_events (received_at desc);
create table public.analytics_events (id uuid primary key default gen_random_uuid(), user_id text, event text,
  created_at timestamptz default now());
alter table public.analytics_events enable row level security;
create policy "analytics_insert_own" on public.analytics_events for insert to public with check (user_id = (auth.uid())::text);

-- Les trois tables DÉJÀ bornées en prod, avec la vraie fonction.
create function public.rate_limit_insert() returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $fn$
declare user_col text := TG_ARGV[0]; max_per_min int := TG_ARGV[1]::int; uid text; cnt int;
begin
  NEW.created_at := now();
  execute format('SELECT ($1).%I', user_col) into uid using NEW;
  if uid is null then return NEW; end if;
  execute format('SELECT count(*) FROM %I.%I WHERE %I = $1 AND created_at > now() - interval ''1 minute''',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, user_col) into cnt using uid;
  if cnt >= max_per_min then
    raise exception 'rate limit: max % insertions/minute sur %', max_per_min, TG_TABLE_NAME using errcode = 'P0001';
  end if;
  return NEW;
end $fn$;
create table public.comment_interactions (id text primary key default gen_random_uuid()::text, user_id text, created_at timestamptz default now());
create trigger trg_rate_limit before insert on public.comment_interactions for each row execute function public.rate_limit_insert('user_id', '60');
create table public.event_reactions (id text primary key default gen_random_uuid()::text, user_id text, created_at timestamptz default now());
create trigger trg_rate_limit before insert on public.event_reactions for each row execute function public.rate_limit_insert('user_id', '30');
create trigger trg_rate_limit before insert on public.reports for each row execute function public.rate_limit_insert('reporter_id', '10');

-- Deux fonctions de trigger exposées par les privilèges par défaut (constat get_advisors).
create function public.passion_request_auto_creer() returns trigger language plpgsql security definer as $fn$ begin return new; end $fn$;
create function public.trg_sync_profil_passions() returns trigger language plpgsql security definer as $fn$ begin return new; end $fn$;
grant execute on function public.passion_request_auto_creer() to anon, authenticated;
grant execute on function public.trg_sync_profil_passions() to anon, authenticated;

-- Storage et Realtime : le strict nécessaire pour que les ALTER/CREATE POLICY portent.
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false);
insert into storage.buckets values ('content', 'content', true), ('attachments', 'attachments', true);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create policy "passio_media_insert_cloisonne" on storage.objects for insert to public with check (true);
create policy "passio_media_update_cloisonne" on storage.objects for update to public using (true);
create policy "passio_media_delete" on storage.objects for delete to public using (true);
create schema realtime;
create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text, extension text, payload jsonb, inserted_at timestamptz default now());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $fn$ select current_setting('realtime.topic', true) $fn$;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;
create policy "Utilisateur recoit ses messages" on realtime.messages for select to authenticated
  using (realtime.topic() = ('user:' || (auth.uid())::text));

-- GRANTS de prod : tout à authenticated ; anon lit tout SAUF address/contact sur events.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to anon;
revoke select on table public.events from anon;
grant select (id, author_id, title, passion_id, lat, lng, city, description, emoji, max_attendees, date_at, created_at,
  venue, postal_code, price, external_link, event_type, cover_url, organizer_id, end_at, status, updated_at,
  co_organizers, series_id, recurrence, conv_id) on public.events to anon;

-- ── Données ──
insert into public.profiles values (:'a', 'A', false), (:'b', 'B', true), (:'c', 'C', false), (:'d', 'D', false);
insert into public.blocks (blocker_id, blocked_id) values (:'b', :'c');          -- B a bloqué C
insert into public.conversations (id, is_group, created_by) values
  ('conv_bc', false, :'b'), ('conv_ab', false, :'a'), ('evgrp_1', true, :'a');
insert into public.conv_members values ('conv_bc', :'b'), ('conv_bc', :'c'), ('conv_ab', :'a'), ('conv_ab', :'b'),
  ('evgrp_1', :'a'), ('evgrp_1', :'b'), ('evgrp_1', :'c');
insert into public.events (id, author_id, title, conv_id) values ('ev1', :'b', 'Sortie vélo', 'evgrp_1');
insert into public.posts (id, author_id, content) values ('p_b', :'b', 'privé'), ('p_a', :'a', 'public');
insert into public.stories (id, author_id) values ('s_b', :'b');
-- Un message de C dans le groupe, un commentaire de C sur le post public de A :
-- ce qu'un UPDATE pouvait DÉPLACER.
insert into public.conv_messages (id, conv_id, from_id, content) values ('m_c0', 'evgrp_1', :'c', 'bonjour le groupe');
insert into public.post_comments (id, post_id, author_id, text) values ('c_c0', 'p_a', :'c', 'joli');
insert into realtime.messages (topic, extension) values ('ring:' || :'a', 'broadcast'), ('typing:conv_ab', 'broadcast'),
  ('realtime:db', 'postgres_changes'), ('conv_specific:conv_ab', 'postgres_changes');
SQL

# ═══════════════════════════════════════════════════════════════════════════
echo "── ⓪ COHÉRENCE CLIENT ↔ MIGRATION : la liste des colonnes publiques ───"
# ⚠️ Même règle que le banc IRL du 08/09 : `_EVENT_COLS_PUBLIC` (app-08) et le
# GRANT colonne par colonne doivent être IDENTIQUES à l'octet près, sinon le
# client demande une colonne que PostgREST refuse — et refuse alors TOUTE la
# requête : plus aucune rencontre pour aucun visiteur.
cols_client="$(node -e '
  const s = require("fs").readFileSync(process.argv[1], "utf8");
  const m = s.match(/const _EVENT_COLS_PUBLIC = \[([\s\S]*?)\]\.join/);
  if (!m) { console.log("INTROUVABLE"); process.exit(0); }
  console.log(m[1].replace(/["\s]/g, "").split(",").filter(Boolean).sort().join(","));
' "$APP08")"
cols_grant="$(awk '/^grant select \($/{f=1;next} f&&/^\) on public.events to anon;/{f=0} f' "$MIGRATION" \
  | tr -d ' \n' | tr ',' '\n' | grep -v '^$' | sort | paste -sd, -)"
verifier "_EVENT_COLS_PUBLIC (client) == GRANT anon (migration), sans conv_id" "$cols_grant" "$cols_client"
if printf '%s' "$cols_client" | grep -q "conv_id"; then
  ko=$((ko+1)); echo "  ❌ le client demande encore conv_id dans la liste PUBLIQUE"
else ok=$((ok+1)); echo "  ✅ conv_id n'est plus demandé par un visiteur"; fi

echo "── ① LES DÉFAUTS, MESURÉS AVANT TOUT ────────────────────────────────"
verifier "① l'oracle répond à un visiteur sans compte" "t" \
  "$(ANON "select public.is_conv_member('evgrp_1', '$B');")"
verifier "① events.conv_id est lisible sans compte" "evgrp_1" \
  "$(ANON "select conv_id from public.events where id='ev1';")"
verifier "② C, bloqué par B, peut suivre B" "OK" \
  "$(AUTH_OK "$C" "insert into public.follows values ('$C', '$B');")"
Q "delete from public.follows where follower_id='$C';" >/dev/null
verifier "② C, bloqué par B, peut lui écrire en privé" "OK" \
  "$(AUTH_OK "$C" "insert into public.conv_messages (id, conv_id, from_id, content) values ('m0', 'conv_bc', '$C', 'coucou');")"
Q "delete from public.conv_messages where id='m0';" >/dev/null
verifier "③ follows n'a pas de created_at (le trigger de débit lèverait)" "0" \
  "$(Q "select count(*) from information_schema.columns where table_name='follows' and column_name='created_at';")"
verifier "④ reports n'a aucun statut" "0" \
  "$(Q "select count(*) from information_schema.columns where table_name='reports' and column_name='status';")"
verifier "⑥ le seau attachments est public" "t" \
  "$(Q "select public from storage.buckets where id='attachments';")"
verifier "⑦ un abonnement à un compte privé ouvre ses publications d'un tap" "1" \
  "$(Q "insert into public.follows values ('$A','$B');" >/dev/null; AUTH "$A" "select count(*) from public.posts where author_id='$B';")"
verifier "⑩ la table follows se lit ENTIÈRE sans compte" "1" "$(ANON "select count(*) from public.follows;")"
Q "delete from public.follows;" >/dev/null
verifier "⑧ C DÉPLACE son message de groupe dans le 1:1 de B, qui l'a bloqué (UPDATE non gardé)" "OK" \
  "$(AUTH_OK "$C" "update public.conv_messages set conv_id='conv_bc' where id='m_c0';")"
verifier "   …et B le lit dans sa conversation privée" "1" \
  "$(AUTH "$B" "select count(*) from public.conv_messages where conv_id='conv_bc' and from_id='$C';")"
Q "update public.conv_messages set conv_id='evgrp_1' where id='m_c0';" >/dev/null
verifier "⑧ C déplace son commentaire vers la publication du compte PRIVÉ qui l'a bloqué" "OK" \
  "$(AUTH_OK "$C" "update public.post_comments set post_id='p_b' where id='c_c0';")"
Q "update public.post_comments set post_id='p_a' where id='c_c0';" >/dev/null

echo "── ② APPLICATION DE LA MIGRATION ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "❌ la migration a échoué :"; echo "$sortie"; exit 1; }
echo "  ✅ appliquée sans erreur"; ok=$((ok+1))
n_echec="$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
n_ok="$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)"
verifier "le tableau de verdict rend 13 OK et 0 ECHEC" "13/0" "$n_ok/$n_echec"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  && { echo "  ✅ rejouable (idempotente)"; ok=$((ok+1)); } \
  || { echo "  ❌ non rejouable :"; echo "$sortie2" | tail -3; ko=$((ko+1)); }

echo "── ③ ① L'ORACLE EST FERMÉ, LE CLIENT SANS COMPTE NE VOIT AUCUNE ERREUR ──"
contient "un visiteur ne peut plus appeler is_conv_member" "permission denied" \
  "$(ANON "select public.is_conv_member('evgrp_1', '$B');")"
verifier "…mais un compte connecté l'appelle toujours (les policies en dépendent)" "t" \
  "$(AUTH "$A" "select public.is_conv_member('conv_ab', '$A');")"
verifier "un visiteur lit conv_members : ZÉRO ligne, aucune erreur" "0" \
  "$(ANON "select count(*) from public.conv_members;")"
verifier "un visiteur lit conv_messages : ZÉRO ligne, aucune erreur" "0" \
  "$(ANON "select count(*) from public.conv_messages;")"
verifier "un membre lit toujours sa conversation" "2" \
  "$(AUTH "$A" "select count(*) from public.conv_members where conv_id='conv_ab';")"
contient "events.conv_id est refusé à un visiteur" "permission denied" \
  "$(ANON "select conv_id from public.events where id='ev1';")"
verifier "…mais le titre d'une rencontre reste public (parcours d'entrée)" "Sortie vélo" \
  "$(ANON "select title from public.events where id='ev1';")"
verifier "…et un compte connecté lit conv_id" "evgrp_1" \
  "$(AUTH "$A" "select conv_id from public.events where id='ev1';")"
verifier "can_edit_post n'est plus exécutable par anon" "f" \
  "$(Q "select has_function_privilege('anon', 'public.can_edit_post(text)', 'execute');")"
verifier "les deux fonctions de trigger ne sont plus appelables par anon" "false/false" \
  "$(Q "select has_function_privilege('anon', 'public.passion_request_auto_creer()', 'execute') || '/' || has_function_privilege('anon', 'public.trg_sync_profil_passions()', 'execute');")"
verifier "post_is_visible reste appelable par anon (les commentaires publics en dépendent)" "t" \
  "$(Q "select has_function_privilege('anon', 'public.post_is_visible(text)', 'execute');")"
verifier "un visiteur lit le commentaire d'une publication publique (celui de C sur p_a)" "1" \
  "$(ANON "select count(*) from public.post_comments where post_id='p_a';")"

echo "── ④ ② BLOQUER A UN EFFET ───────────────────────────────────────────"
contient "C (bloqué par B) ne peut plus suivre B" "row-level security" \
  "$(AUTH "$C" "insert into public.follows (follower_id, following_id) values ('$C', '$B');")"
verifier "…mais D suit B sans problème (demande, B est privé)" "OK" \
  "$(AUTH_OK "$D" "insert into public.follows (follower_id, following_id) values ('$D', '$B');")"
contient "C ne peut plus écrire dans son 1:1 avec B" "row-level security" \
  "$(AUTH "$C" "insert into public.conv_messages (id, conv_id, from_id, content) values ('m1', 'conv_bc', '$C', 'coucou');")"
verifier "…mais C écrit encore dans le GROUPE où B est aussi (borné aux 1:1)" "OK" \
  "$(AUTH_OK "$C" "insert into public.conv_messages (id, conv_id, from_id, content) values ('m2', 'evgrp_1', '$C', 'bonjour à tous');")"
verifier "…et A écrit toujours à B (pas bloqué)" "OK" \
  "$(AUTH_OK "$A" "insert into public.conv_messages (id, conv_id, from_id, content) values ('m3', 'conv_ab', '$A', 'salut');")"
contient "C ne peut pas commenter une publication de B" "row-level security" \
  "$(AUTH "$C" "insert into public.post_comments (id, post_id, author_id, text) values ('c1', 'p_b', '$C', 'x');")"
verifier "…mais commente celle de A" "OK" \
  "$(AUTH_OK "$C" "insert into public.post_comments (id, post_id, author_id, text) values ('c2', 'p_a', '$C', 'x');")"
verifier "…et un commentaire sur un post SEED (sans ligne posts) passe toujours" "OK" \
  "$(AUTH_OK "$C" "insert into public.post_comments (id, post_id, author_id, text) values ('c3', 'seed_42', '$C', 'x');")"
contient "C ne peut pas aimer une publication de B" "row-level security" \
  "$(AUTH "$C" "insert into public.post_likes values ('p_b', '$C');")"
contient "C ne peut pas commenter la rencontre de B" "row-level security" \
  "$(AUTH "$C" "insert into public.event_comments (id, event_id, author_id, text) values ('e1', 'ev1', '$C', 'x');")"
contient "C ne peut plus notifier B" "row-level security" \
  "$(AUTH "$C" "insert into public.notifications (id, user_id, kind, from_id, content) values ('n1', '$B', 'like', '$C', 'x');")"
verifier "…mais A notifie B" "OK" \
  "$(AUTH_OK "$A" "insert into public.notifications (id, user_id, kind, from_id, content) values ('n2', '$B', 'like', '$A', 'x');")"
contient "un visiteur ne peut rien insérer dans follows (aucune policy anon)" "row-level security" \
  "$(ANON "insert into public.follows (follower_id, following_id) values ('$A', '$B');")"

echo "── ④ bis ⑧ UN UPDATE NE DÉPLACE PLUS RIEN ───────────────────────────"
contient "C ne peut plus déplacer son message vers le 1:1 de B (identifiant figé)" "ne se modifie pas" \
  "$(AUTH "$C" "update public.conv_messages set conv_id='conv_bc' where id='m_c0';")"
contient "…ni réattribuer son message à quelqu'un d'autre" "ne se modifie pas" \
  "$(AUTH "$C" "update public.conv_messages set from_id='$A' where id='m_c0';")"
verifier "…mais corrige encore le TEXTE de son message de groupe" "OK" \
  "$(AUTH_OK "$C" "update public.conv_messages set content='bonsoir le groupe' where id='m_c0';")"
Q "insert into public.conv_messages (id, conv_id, from_id, content) values ('m_cb', 'conv_bc', '$C', 'avant le blocage');" >/dev/null
contient "…et ne peut plus réécrire un message du 1:1 où B l'a bloqué (WITH CHECK)" "row-level security" \
  "$(AUTH "$C" "update public.conv_messages set content='après' where id='m_cb';")"
verifier "D (pas membre) ne modifie rien chez les autres : 0 ligne, aucune erreur" "bonsoir le groupe" \
  "$(AUTH "$D" "update public.conv_messages set content='pirate' where id='m_c0';" >/dev/null; Q "select content from public.conv_messages where id='m_c0';")"
contient "C ne peut plus déplacer son commentaire vers la publication de B" "ne se modifie pas" \
  "$(AUTH "$C" "update public.post_comments set post_id='p_b' where id='c_c0';")"
verifier "…mais corrige encore son texte" "OK" \
  "$(AUTH_OK "$C" "update public.post_comments set text='très joli' where id='c_c0';")"
verifier "identifiants_figes n'est exécutable par aucun rôle client" "false/false" \
  "$(Q "select has_function_privilege('anon','public.identifiants_figes()','execute') || '/' || has_function_privilege('authenticated','public.identifiants_figes()','execute');")"

echo "── ⑤ ③ LE DÉBIT EST BORNÉ ───────────────────────────────────────────"
verifier "follows a désormais created_at" "1" \
  "$(Q "select count(*) from information_schema.columns where table_name='follows' and column_name='created_at';")"
verifier "trg_rate_limit posé sur 12 tables (3 existantes + 9)" "12" \
  "$(Q "select count(distinct tgrelid) from pg_trigger where tgname='trg_rate_limit' and not tgisinternal;")"
# D n'a encore rien publié : A porte déjà `p_a` dans la minute, et la borne compte TOUT.
verifier "D publie 10 fois dans la minute" "OK" \
  "$(AUTH_OK "$D" "do \$\$ begin for i in 1..10 loop insert into public.posts (id, author_id, content) values ('rl_'||i, '$D', 'x'); end loop; end \$\$;")"
contient "…la 11ᵉ publication est refusée" "rate limit" \
  "$(AUTH "$D" "insert into public.posts (id, author_id, content) values ('rl_11', '$D', 'x');")"
verifier "…et B, lui, publie toujours (la borne est PAR COMPTE)" "OK" \
  "$(AUTH_OK "$B" "insert into public.posts (id, author_id, content) values ('rl_b', '$B', 'x');")"
verifier "l'horodatage d'une publication est celui du SERVEUR (pas antidatable)" "t" \
  "$(Q "select created_at > now() - interval '1 minute' from public.posts where id='rl_1';")"
verifier "un visiteur écrit 120 erreurs dans la minute" "OK" \
  "$(ANON_OK "do \$\$ begin for i in 1..120 loop insert into public.client_errors (message) values ('flood '||i); end loop; end \$\$;")"
contient "…la 121ᵉ est refusée par le plafond GLOBAL" "plafond global" \
  "$(ANON "insert into public.client_errors (message) values ('flood 121');")"
verifier "le plafond de telemetry_events est posé" "1" \
  "$(Q "select count(*) from pg_trigger where tgrelid='public.telemetry_events'::regclass and tgname='trg_debit_global';")"
verifier "limiter_debit_global n'est exécutable par aucun rôle client" "false/false" \
  "$(Q "select has_function_privilege('anon','public.limiter_debit_global()','execute') || '/' || has_function_privilege('authenticated','public.limiter_debit_global()','execute');")"

echo "── ⑥ ④ UN SIGNALEMENT NAÎT OUVERT, QUOI QUE LE CLIENT ENVOIE ─────────"
AUTH "$A" "insert into public.reports (id, reporter_id, target_type, target_id, reason, status, handled_at) values ('r1', '$A', 'user', '$C', 'spam', 'handled', now());" >/dev/null
verifier "status = open, handled_at vide" "open|" \
  "$(Q "select status || '|' || coalesce(handled_at::text,'') from public.reports where id='r1';")"
contient "un statut hors liste est refusé" "reports_status_chk" \
  "$(Q "update public.reports set status='banane' where id='r1';")"
contient "un target_type hors liste est refusé (il finit dans une issue publique)" "reports_target_type_chk" \
  "$(AUTH "$A" "insert into public.reports (id, reporter_id, target_type, target_id) values ('r2', '$A', '![](https://evil.tld/p.png)', 'x');")"

echo "── ⑦ ⑤ REALTIME : QUI REÇOIT, QUI ÉMET ──────────────────────────────"
# Dans ce banc `realtime.topic()` est un réglage de SESSION : la policy s'évalue
# sur lui, pas sur la colonne — un topic autorisé rend donc TOUTES les lignes.
n_rt="$(Q "select count(*) from realtime.messages;")"
verifier "A reçoit sur SA sonnerie ring:A" "$n_rt" "$(RT "$A" "ring:$A" "select count(*) from realtime.messages;")"
verifier "A ne reçoit RIEN sur ring:B (écoute de qui appelle qui : fermée)" "0" "$(RT "$A" "ring:$B" "select count(*) from realtime.messages;")"
verifier "A reçoit sur typing:conv_ab (membre)" "$n_rt" "$(RT "$A" "typing:conv_ab" "select count(*) from realtime.messages;")"
verifier "A ne reçoit rien sur typing:conv_bc (pas membre)" "0" "$(RT "$A" "typing:conv_bc" "select count(*) from realtime.messages;")"
verifier "A reçoit sur call:xyz et vlive:42 (comptes seulement)" "$n_rt/$n_rt" \
  "$(RT "$A" "call:xyz" "select count(*) from realtime.messages;")/$(RT "$A" "vlive:42" "select count(*) from realtime.messages;")"
verifier "A reçoit sur realtime:db (les changements de tables — chaque table garde sa RLS)" "$n_rt" \
  "$(RT "$A" "realtime:db" "select count(*) from realtime.messages;")"
verifier "…et un VISITEUR aussi — c'est le seul topic ouvert sans compte" "$n_rt" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; set local realtime.topic='realtime:db'; select count(*) from realtime.messages;" 2>&1)"
verifier "A reçoit sur conv_specific:conv_ab (membre), rien sur conv_specific:conv_bc" "$n_rt/0" \
  "$(RT "$A" "conv_specific:conv_ab" "select count(*) from realtime.messages;")/$(RT "$A" "conv_specific:conv_bc" "select count(*) from realtime.messages;")"
verifier "A peut SONNER B (émettre sur ring:B)" "OK" \
  "$(RT_OK "$A" "ring:$B" "insert into realtime.messages (topic, extension) values ('ring:$B', 'broadcast');")"
contient "⑨ C, bloqué par B, ne peut PLUS faire sonner B" "row-level security" \
  "$(RT "$C" "ring:$B" "insert into realtime.messages (topic, extension) values ('ring:$B', 'broadcast');")"
verifier "…mais sonne A sans problème" "OK" \
  "$(RT_OK "$C" "ring:$A" "insert into realtime.messages (topic, extension) values ('ring:$A', 'broadcast');")"
contient "A ne peut pas émettre sur typing:conv_bc (pas membre)" "row-level security" \
  "$(RT "$A" "typing:conv_bc" "insert into realtime.messages (topic, extension) values ('typing:conv_bc', 'broadcast');")"
verifier "un visiteur sans compte ne reçoit rien, sur aucun topic" "0" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; set local realtime.topic='ring:$A'; select count(*) from realtime.messages;" 2>&1)"
contient "…et ne peut pas émettre" "row-level security" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; set local realtime.topic='ring:$A'; insert into realtime.messages (topic, extension) values ('ring:$A','broadcast');" 2>&1)"
verifier "la policy historique user:<uid> tient toujours" "$(Q "select count(*) from realtime.messages;")" "$(RT "$A" "user:$A" "select count(*) from realtime.messages;")"

echo "── ⑧ ⑥ LE SEAU attachments EST PRIVÉ ; ⑦ L'ABONNEMENT SE DEMANDE ────"
verifier "attachments : public = false ; content reste public" "false/true" \
  "$(Q "select (select public from storage.buckets where id='attachments') || '/' || (select public from storage.buckets where id='content');")"
Q "delete from public.follows;" >/dev/null
AUTH "$A" "insert into public.follows (follower_id, following_id, status) values ('$A', '$B', 'accepted');" >/dev/null
verifier "A demande à suivre B (privé) en se déclarant accepté : le serveur écrit PENDING" "pending" \
  "$(Q "select status from public.follows where follower_id='$A' and following_id='$B';")"
verifier "⑩ la demande en attente est INVISIBLE sans compte, et pour D" "0/0" \
  "$(ANON "select count(*) from public.follows where following_id='$B';")/$(AUTH "$D" "select count(*) from public.follows where following_id='$B';")"
verifier "…mais A (demandeur) et B (cible) la voient" "1/1" \
  "$(AUTH "$A" "select count(*) from public.follows where following_id='$B';")/$(AUTH "$B" "select count(*) from public.follows where following_id='$B';")"
verifier "⑦ la notification de DEMANDE est écrite par le serveur, chez B, au nom de A" "follow_request|$B|A souhaite s'abonner à ton compte privé" \
  "$(Q "select kind || '|' || user_id || '|' || content from public.notifications where id='n_fr_11111111_22222222';")"
verifier "…et ne voit pas les publications de B" "0" "$(AUTH "$A" "select count(*) from public.posts where author_id='$B';")"
verifier "…ni ses stories" "0" "$(AUTH "$A" "select count(*) from public.stories where author_id='$B';")"
verifier "…ni par post_is_visible (commentaires, j'aime)" "f" "$(AUTH "$A" "select public.post_is_visible('p_b');")"
AUTH "$A" "update public.follows set status='accepted' where follower_id='$A' and following_id='$B';" >/dev/null
verifier "A ne peut pas s'accepter lui-même" "pending" \
  "$(Q "select status from public.follows where follower_id='$A' and following_id='$B';")"
contient "B ne peut pas réécrire follower_id (fabriquer un abonné)" "ne se modifient pas" \
  "$(AUTH "$B" "update public.follows set follower_id='$D' where follower_id='$A' and following_id='$B';")"
verifier "B accepte la demande" "OK" \
  "$(AUTH_OK "$B" "update public.follows set status='accepted' where follower_id='$A' and following_id='$B';")"
verifier "…la notification d'ACCEPTATION est écrite chez A, au nom de B" "follow|$A|B a accepté ta demande d'abonnement" \
  "$(Q "select kind || '|' || user_id || '|' || content from public.notifications where id='n_fa_22222222_11111111';")"
verifier "…et l'abonnement accepté redevient lisible sans compte" "1" \
  "$(ANON "select count(*) from public.follows where following_id='$B';")"
verifier "…et A voit désormais TOUTES les publications de B" "$(Q "select count(*) from public.posts where author_id='$B';")" "$(AUTH "$A" "select count(*) from public.posts where author_id='$B';")"
verifier "…ses stories" "1" "$(AUTH "$A" "select count(*) from public.stories where author_id='$B';")"
verifier "…et post_is_visible dit vrai" "t" "$(AUTH "$A" "select public.post_is_visible('p_b');")"
AUTH "$D" "insert into public.follows (follower_id, following_id) values ('$D', '$A');" >/dev/null
verifier "suivre un compte PUBLIC reste immédiat (accepted)" "accepted" \
  "$(Q "select status from public.follows where follower_id='$D' and following_id='$A';")"
verifier "…et A est notifié « a commencé à te suivre », par le serveur" "follow|D a commencé à te suivre" \
  "$(Q "select kind || '|' || content from public.notifications where id='n_fw_44444444_11111111';")"
AUTH "$D" "delete from public.follows where follower_id='$D' and following_id='$A';" >/dev/null
AUTH "$D" "insert into public.follows (follower_id, following_id) values ('$D', '$A');" >/dev/null
verifier "se désabonner puis se réabonner RAFRAÎCHIT la même notification (pas de doublon)" "1" \
  "$(Q "select count(*) from public.notifications where from_id='$D' and user_id='$A' and kind='follow';")"
# Un refus sur `notifications` (quota, contrainte) ne doit JAMAIS faire échouer
# l'abonnement : on pose un trigger qui refuse toute insertion, on suit, on retire.
Q "create function public._refus_notif() returns trigger language plpgsql as \$\$ begin raise exception 'rate limit: simulé'; end \$\$;
   create trigger trg_refus_notif before insert on public.notifications for each row execute function public._refus_notif();" >/dev/null
verifier "un refus de notifications ne fait PAS échouer l'abonnement (la notification est un à-côté)" "OK" \
  "$(AUTH_OK "$C" "insert into public.follows (follower_id, following_id) values ('$C', '$D');")"
verifier "…l'abonnement existe, sans notification" "accepted/0" \
  "$(Q "select status from public.follows where follower_id='$C' and following_id='$D';")/$(Q "select count(*) from public.notifications where from_id='$C' and user_id='$D';")"
Q "drop trigger trg_refus_notif on public.notifications; drop function public._refus_notif(); delete from public.follows where follower_id='$C' and following_id='$D';" >/dev/null
verifier "follows_notifier n'est exécutable par aucun rôle client" "false/false" \
  "$(Q "select has_function_privilege('anon','public.follows_notifier()','execute') || '/' || has_function_privilege('authenticated','public.follows_notifier()','execute');")"
verifier "les abonnements existants sont tous 'accepted' (le défaut de la colonne)" "0" \
  "$(Q "select count(*) from public.follows where status is null;")"
verifier "B refuse une demande en la supprimant (policy « Suppression cote suivi »)" "OK" \
  "$(Q "insert into public.follows (follower_id, following_id) values ('$C','$A');" >/dev/null; AUTH_OK "$A" "delete from public.follows where follower_id='$C' and following_id='$A';")"

echo "── ⑨ MUTATIONS : chaque garde retirée doit faire ROUGIR ──────────────"
VERDICT="$(awk '/^with v\(ordre, correctif, ok\) as \(/{f=1} f{print} /^from v order by ordre;/{f=0}' "$MIGRATION")"
verdict_de() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "$VERDICT" 2>&1 | grep "^$1|" | awk -F'|' '{print $3}'; }
verifier "le verdict extrait du fichier rend OK sur la ligne ①" "OK" "$(verdict_de 1)"

# ① l'oracle rouvert
Q "grant execute on function public.is_conv_member(text,text) to anon;" >/dev/null
m="$(ANON "select public.is_conv_member('evgrp_1', '$B');")"
if [ "$m" = "t" ]; then echo "  ✅ mutation ① : EXECUTE rendu à anon → l'oracle répond de nouveau, le contrôle est réel"; ok=$((ok+1)); else echo "  ❌ mutation ① : l'oracle ne répond pas ($m)"; ko=$((ko+1)); fi
verifier "  …et le verdict ① dit ECHEC" "ECHEC" "$(verdict_de 1)"
Q "revoke execute on function public.is_conv_member(text,text) from anon;" >/dev/null

# ② la condition de blocage retirée de follows
Q "drop policy \"Ecriture propre\" on public.follows; create policy \"Ecriture propre\" on public.follows for insert to authenticated with check (follower_id = (select auth.uid())::text);" >/dev/null
m="$(AUTH_OK "$C" "insert into public.follows (follower_id, following_id) values ('$C', '$B');")"
if [ "$m" = "OK" ]; then echo "  ✅ mutation ② : sans is_blocked_with, C suit B de nouveau"; ok=$((ok+1)); else echo "  ❌ mutation ② : refus inattendu ($m)"; ko=$((ko+1)); fi
verifier "  …et le verdict ④ dit ECHEC" "ECHEC" "$(verdict_de 4)"
Q "delete from public.follows where follower_id='$C'; drop policy \"Ecriture propre\" on public.follows; create policy \"Ecriture propre\" on public.follows for insert to authenticated with check (follower_id = (select auth.uid())::text and not public.is_blocked_with(following_id));" >/dev/null

# ③ le plafond global retiré
Q "drop trigger trg_debit_global on public.client_errors;" >/dev/null
m="$(ANON_OK "insert into public.client_errors (message) values ('flood 121 bis');")"
if [ "$m" = "OK" ]; then echo "  ✅ mutation ③ : sans le trigger, la 121ᵉ erreur passe — le plafond n'est pas décoratif"; ok=$((ok+1)); else echo "  ❌ mutation ③ ($m)"; ko=$((ko+1)); fi
verifier "  …et le verdict ⑥ dit ECHEC" "ECHEC" "$(verdict_de 6)"
Q "create trigger trg_debit_global before insert on public.client_errors for each row execute function public.limiter_debit_global('created_at', '120');" >/dev/null

# ④ le statut d'abonnement n'est plus tranché par le serveur
Q "drop trigger trg_follows_statut on public.follows; delete from public.follows where follower_id='$D' and following_id='$B';" >/dev/null
AUTH "$D" "insert into public.follows (follower_id, following_id, status) values ('$D', '$B', 'accepted');" >/dev/null
m="$(Q "select status from public.follows where follower_id='$D' and following_id='$B';")"
if [ "$m" = "accepted" ]; then echo "  ✅ mutation ④ : sans le trigger, le client se déclare accepté chez un compte privé"; ok=$((ok+1)); else echo "  ❌ mutation ④ ($m)"; ko=$((ko+1)); fi
verifier "  …et le verdict ⑩ dit ECHEC" "ECHEC" "$(verdict_de 10)"
Q "create trigger trg_follows_statut before insert on public.follows for each row execute function public.follows_statut_initial();" >/dev/null

# ⑤ la policy Realtime de réception retirée : plus rien ne passe, même sa propre sonnerie
Q "drop policy \"passio_rt_recevoir\" on realtime.messages;" >/dev/null
m="$(RT "$A" "ring:$A" "select count(*) from realtime.messages;")"
if [ "$m" = "0" ]; then echo "  ✅ mutation ⑤ : sans la policy, un canal privé ne délivre RIEN — c'est elle qui ouvre"; ok=$((ok+1)); else echo "  ❌ mutation ⑤ ($m)"; ko=$((ko+1)); fi
verifier "  …et le verdict ⑧ dit ECHEC" "ECHEC" "$(verdict_de 8)"

# ⑦ le trigger qui fige conv_id retiré : le WITH CHECK seul laisse un message
# se déplacer entre deux conversations dont on est membre — c'est le trigger qui
# interdit TOUT déplacement, et il faut le prouver.
Q "insert into public.conversations (id, is_group, created_by) values ('evgrp_2', true, '$D');
   insert into public.conv_members values ('evgrp_2', '$C'), ('evgrp_2', '$D');
   drop trigger trg_identifiants_figes on public.conv_messages;" >/dev/null
m="$(AUTH_OK "$C" "update public.conv_messages set conv_id='evgrp_2' where id='m_c0';")"
if [ "$m" = "OK" ]; then echo "  ✅ mutation ⑦ : sans le trigger, le message change de conversation — le contrôle est réel"; ok=$((ok+1)); else echo "  ❌ mutation ⑦ : déplacement refusé sans le trigger ($m)"; ko=$((ko+1)); fi
verifier "  …et le verdict ⑪ dit ECHEC" "ECHEC" "$(verdict_de 11)"
Q "update public.conv_messages set conv_id='evgrp_1' where id='m_c0';" >/dev/null

# ⑥ la migration REJOUÉE répare la mutation ⑤ (c'est ce qui rend une relance sûre)
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1
verifier "rejouer la migration recrée la policy retirée" "OK" "$(verdict_de 8)"
verifier "…et le trigger retiré" "OK" "$(verdict_de 11)"

echo
echo "───────────────────────────────────────────────────────────────────────"
echo "  $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ] || { echo "❌ BANC ROUGE"; exit 1; }
echo "✅ BANC VERT — les sept défauts sont refermés, chaque garde est éprouvée"
