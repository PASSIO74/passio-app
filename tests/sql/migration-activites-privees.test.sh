#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migration_activites_privees_2026-11-26.sql
#
# Sur un PostgreSQL JETABLE, avec les policies et aides de PRODUCTION mesurées
# le 2026-11-26 (lecture publique de `events`, restrictives de blocage,
# `activite_masquee_pour_moi`, `organise_activite`, `participants_compte`,
# `comment_target_visible`) :
#   ⓪ AVANT : une activité marquée privée reste lisible par tous (le trou)
#   ① la migration s'applique (verdict OK), se rejoue
#   ② APRÈS : l'invité, l'organisation, le co-organisateur lisent ; un
#      inconnu, un visiteur ne lisent ni l'activité, ni ses commentaires,
#      réactions, participants, compteurs ; ne peuvent ni s'inscrire, ni
#      commenter, ni réagir, ni s'inviter ; personne ne lit la liste des
#      autres invités ; une activité publique se lit et s'ouvre comme avant ;
#      le blocage tient toujours
#   ③ MUTATION : une policy restrictive retirée → le verdict LÈVE
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$RACINE/migrations/migration_activites_privees_2026-11-26.sql"
SUITE="$RACINE/migrations/migration_activites_privees_suite_2026-11-26.sql"
RETRAITS="$RACINE/migrations/migration_activites_privees_retraits_2026-11-26.sql"
RESTES="$RACINE/migrations/migration_activites_privees_restes_2026-11-27.sql"
VISITEUR="$RACINE/migrations/migration_activites_privees_visiteur_2026-11-27.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
for f in "$MIG" "$SUITE" "$RETRAITS" "$RESTES" "$VISITEUR"; do [ -f "$f" ] || { echo "❌ introuvable : $f"; exit 1; }; done

PORT=$(( 6200 + RANDOM % 120 ))
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

DB=activites_privees
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()  { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
EN() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "begin; set local role authenticated; set local request.jwt.claim.sub='$1'; $2 commit;" 2>&1 | grep -v -E '^(BEGIN|COMMIT|SET)$' || true; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "begin; set local role anon; $1 commit;" 2>&1 | grep -v -E '^(BEGIN|COMMIT|SET)$' || true; }
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }
# Une écriture SOUS un rôle : rend le SQLSTATE d'un refus, ou « ok » (rien n'est gardé).
ECRIT() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "begin; set local role authenticated; set local request.jwt.claim.sub='$1';
  do \$x\$ begin begin $2; raise notice 'ETAT=ok'; exception when others then raise notice 'ETAT=%', sqlstate; end; end \$x\$; rollback;" 2>&1 | sed -n 's/.*ETAT=//p'; }

LEA=11111111-1111-4111-8111-111111111111     # organise l'activité privée
BEN=22222222-2222-4222-8222-222222222222     # invité
KEVIN=33333333-3333-4333-8333-333333333333   # inconnu
CO=44444444-4444-4444-8444-444444444444      # co-organisateur
BLOQ=55555555-5555-4555-8555-555555555555    # bloqué par Léa

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

# ── SOCLE (définitions de production, 2026-11-26) ───────────────────────────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table public.profiles (id text primary key);
create table public.notifications (id text primary key default gen_random_uuid()::text, user_id text, from_id text,
  kind text, ref_id text, content text, origine text default 'client', seen boolean default false);
create policy notif_vue on public.notifications for update to authenticated using (user_id = (select auth.uid())::text);
alter table public.notifications enable row level security;
grant select, insert on public.notifications to authenticated; grant update (seen) on public.notifications to authenticated;
create policy notif_ecriture on public.notifications for insert to authenticated with check (from_id = (select auth.uid())::text);
create policy notif_lecture on public.notifications for select to authenticated using (user_id = (select auth.uid())::text);
-- L'origine est POSÉE par le serveur (définition de production) : le client ne la choisit pas.
create function public.notifications_origine() returns trigger language plpgsql security definer set search_path = '' as $f$
begin
  new.origine := case when current_setting('passio.notification_serveur', true) = '1' then 'serveur' else 'client' end;
  return new;
end $f$;
create trigger trg_notifications_origine before insert or update on public.notifications
  for each row execute function public.notifications_origine();
create table public.blocks (blocker_id text, blocked_id text, primary key (blocker_id, blocked_id));
create table public.events (id text primary key, author_id text, organizer_id text, title text,
  status text default 'active', co_organizers jsonb, address text);
create table public.event_attendees (event_id text references public.events(id) on delete cascade, user_id text, rsvp text,
  checked_in_at timestamptz, rating smallint, primary key (event_id, user_id));
create table public.conv_members (conv_id text, user_id text, primary key (conv_id, user_id));
-- Publications (définitions de production, 2026-11-27) : lecture ouverte au rôle public.
create table public.posts (id text primary key, author_id text, content text, event_id text,
  shared_data text, shared_from_post_id text);
create table public.post_comments (id text primary key, post_id text, author_id text, content text);
create table public.post_likes (post_id text, user_id text, primary key (post_id, user_id));
create table public.comment_interactions (id text primary key, comment_id text, post_id text, user_id text, kind text);
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.comment_interactions enable row level security;
grant select on public.posts, public.post_comments, public.post_likes, public.comment_interactions to anon, authenticated;
create policy posts_lecture on public.posts for select using (true);
create policy post_comments_lecture on public.post_comments for select using (true);
create policy post_likes_lecture on public.post_likes for select using (true);
create policy ci_lecture on public.comment_interactions for select using (true);
create function public.activite_de_partage(p_shared_data text) returns text language sql immutable set search_path = '' as $f$
  select case when p_shared_data is null or p_shared_data !~ '"kind"\s*:\s*"event"' then null
    else substring(p_shared_data from '"id"\s*:\s*"([^"\\]{1,200})"') end
$f$;
grant execute on function public.activite_de_partage(text) to authenticated;
-- `post_is_visible` : définition de PRODUCTION du 2026-11-27 (aides réduites à leur cas neutre),
-- et un lecteur SECURITY DEFINER exécutable par anon qui juge par elle, comme `interactions_cibles`.
alter table public.profiles add column is_private boolean default false;
create function public.est_identifiant_exemple(p text) returns boolean language sql immutable as $f$ select false $f$;
create function public.post_masque(p text) returns boolean language sql stable as $f$ select false $f$;
create function public.abonne_accepte_non_bloque(p text) returns boolean language sql stable as $f$ select false $f$;
create function public.publication_masquee_pour_moi(p text) returns boolean language sql stable as $f$ select false $f$;
create function public.post_is_visible(pid text) returns boolean language sql stable security definer set search_path to 'public' as $function$
  select case
    when pid is null then false
    when not exists (select 1 from posts where id = pid) then public.est_identifiant_exemple(pid)
    else exists (
      select 1 from posts p
      where p.id = pid and (
        p.author_id = (select auth.uid())::text
        or (not public.post_masque(p.id) and (
              not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
              or public.abonne_accepte_non_bloque(p.author_id))
            and not public.publication_masquee_pour_moi(p.id))
      )
    )
  end
$function$;
grant execute on function public.post_is_visible(text) to anon, authenticated;
create function public.reponses_lues(p_post text) returns bigint language sql stable security definer set search_path = '' as $f$
  select count(*) from public.comment_interactions i where i.post_id = p_post and public.post_is_visible(p_post)
$f$;
grant execute on function public.reponses_lues(text) to anon, authenticated;
create table public.event_comments (id text primary key, event_id text not null references public.events(id) on delete cascade,
  author_id text not null, text text);
create table public.event_reactions (event_id text references public.events(id) on delete cascade, user_id text, emoji text,
  primary key (event_id, user_id, emoji));
alter table public.blocks enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.event_comments enable row level security;
alter table public.event_reactions enable row level security;
grant select on public.blocks to authenticated;
create policy blocks_lecture on public.blocks for select using (true);

-- Privilèges de production : colonnes de `events` une à une, `address` exclue.
grant select (id, author_id, organizer_id, title, status, co_organizers) on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.event_attendees to authenticated;
grant select on public.event_comments, public.event_reactions to anon;
grant select, insert, delete on public.event_comments, public.event_reactions to authenticated;

create function public.is_blocked_with(other text) returns boolean language sql stable security definer set search_path = '' as
  $f$ select exists (select 1 from public.blocks b where (b.blocker_id = (select auth.uid())::text and b.blocked_id = other)
                                                     or (b.blocked_id = (select auth.uid())::text and b.blocker_id = other)) $f$;
create function public.suppression_de_mon_compte() returns boolean language sql stable as $f$ select false $f$;
create function public.adult_access_allowed() returns boolean language sql stable as $f$ select true $f$;
create function public.event_auteur_bloque(_event_id text) returns boolean language sql stable security definer set search_path = '' as
  $f$ select exists (select 1 from public.events e where e.id = _event_id and public.is_blocked_with(e.author_id)) $f$;
create function public.organise_activite(p_event_id text) returns boolean language sql stable security definer set search_path = '' as $f$
  select auth.uid() is not null and exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.author_id = (select auth.uid())::text
        or e.organizer_id = (select auth.uid())::text
        or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array'
            and e.co_organizers ? (select auth.uid())::text)));
$f$;
create function public.vient_a_activite(p_event_id text) returns boolean language sql stable security definer set search_path = '' as $f$
  select auth.uid() is not null and exists(select 1 from public.event_attendees a join public.events e on e.id = a.event_id
    where a.event_id = p_event_id and a.user_id = auth.uid()::text and a.rsvp = 'going' and e.status = 'active')
$f$;
create function public.activite_masquee_pour_moi(p_event_id text) returns boolean language sql stable security definer set search_path = '' as $f$
  select p_event_id is not null and exists (
    select 1 from public.events e
     where e.id = p_event_id
       and e.author_id is distinct from (select auth.uid())::text
       and e.organizer_id is distinct from (select auth.uid())::text
       and (public.is_blocked_with(e.author_id)
            or (e.organizer_id is not null and e.organizer_id is distinct from e.author_id
                and public.is_blocked_with(e.organizer_id)))
  )
$f$;
revoke all on function public.activite_masquee_pour_moi(text) from public;
grant execute on function public.activite_masquee_pour_moi(text) to authenticated;
create function public.participants_compte(p_event_ids text[])
returns table(event_id text, going integer, maybe integer, waitlist integer, checked_in integer)
language sql stable security definer set search_path = '' as $f$
  select a.event_id,
    count(*) filter (where coalesce(a.rsvp, 'going') not in ('maybe','waitlist','declined'))::int,
    count(*) filter (where a.rsvp = 'maybe')::int,
    count(*) filter (where a.rsvp = 'waitlist')::int,
    count(*) filter (where a.checked_in_at is not null)::int
  from public.event_attendees a where auth.uid() is not null
    and a.event_id = any(p_event_ids[1:200]) group by a.event_id
$f$;
grant execute on function public.participants_compte(text[]) to authenticated;
create function public.notes_evenement(p_event_id text) returns jsonb language sql stable security definer set search_path = '' as $f$
  select case when auth.uid() is null then null
    else (select jsonb_build_object('avg', case when n.nb >= 3 or public.organise_activite(p_event_id) then n.moyenne end, 'count', n.nb)
      from (select count(*)::integer as nb, avg(a.rating)::numeric(4,2) as moyenne from public.event_attendees a
             where a.event_id = p_event_id and a.rating is not null and a.rsvp = 'going') n) end;
$f$;
grant execute on function public.notes_evenement(text) to authenticated;
-- Le fil d'une activité, comme `comment_target_visible(cid, pid)` en production.
create function public.fil_activite_visible(pid text) returns boolean language sql stable security definer set search_path = '' as $f$
  select case when exists (select 1 from public.events where id = pid) then not public.activite_masquee_pour_moi(pid) else false end
$f$;
grant execute on function public.fil_activite_visible(text) to authenticated;

-- Policies de production.
create policy "Lecture publique" on public.events for select using (true);
create policy events_lecture_hors_blocage on public.events as restrictive for select to authenticated using (
  (author_id = (select auth.uid())::text) or (organizer_id = (select auth.uid())::text)
  or ((not public.is_blocked_with(author_id)) and ((organizer_id is null) or (organizer_id = author_id) or (not public.is_blocked_with(organizer_id)))));
create policy events_insert_author_adult on public.events for insert to authenticated with check (
  author_id = (select auth.uid())::text and public.adult_access_allowed() and not public.suppression_de_mon_compte());
create policy "Update organisateurs" on public.events for update using (
  author_id = (select auth.uid())::text or jsonb_exists(co_organizers, (select auth.uid())::text));

create policy event_attendees_insert_own_adult on public.event_attendees for insert to authenticated
  with check (user_id = (select auth.uid())::text and public.adult_access_allowed());
create policy event_attendees_update_own_adult on public.event_attendees for update to authenticated
  using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);
create policy event_attendees_select_lien on public.event_attendees for select to authenticated using (
  user_id = (select auth.uid())::text or public.organise_activite(event_id)
  or (rsvp = 'going' and public.vient_a_activite(event_id) and not public.is_blocked_with(user_id)));
create policy event_attendees_lecture_hors_blocage on public.event_attendees as restrictive for select to authenticated using (
  user_id = (select auth.uid())::text or not public.activite_masquee_pour_moi(event_id));

create policy event_comments_select on public.event_comments for select using (true);
create policy event_comments_insert_own on public.event_comments for insert to authenticated with check (
  author_id = (select auth.uid())::text and not public.event_auteur_bloque(event_id));
create policy event_comments_lecture_hors_blocage on public.event_comments as restrictive for select to authenticated using (
  author_id = (select auth.uid())::text or ((not public.activite_masquee_pour_moi(event_id)) and (not public.is_blocked_with(author_id))));

create policy event_reactions_select on public.event_reactions for select using (true);
create policy event_reactions_insert on public.event_reactions for insert to authenticated with check (
  user_id = (select auth.uid())::text and not public.event_auteur_bloque(event_id));
create policy event_reactions_lecture_hors_blocage on public.event_reactions as restrictive for select to authenticated using (
  user_id = (select auth.uid())::text or ((not public.activite_masquee_pour_moi(event_id)) and (not public.is_blocked_with(user_id))));
SQL

Q "insert into public.profiles values ('$LEA'), ('$BEN'), ('$KEVIN'), ('$CO'), ('$BLOQ');" >/dev/null
Q "insert into public.events (id, author_id, organizer_id, title, co_organizers) values
  ('ev_priv', '$LEA', '$LEA', 'Anniversaire chez Léa', '[\"$CO\"]'),
  ('ev_pub',  '$LEA', '$LEA', 'Rando publique', null);
 insert into public.event_attendees values ('ev_priv', '$LEA', 'going', null), ('ev_pub', '$LEA', 'going', null);
 insert into public.event_comments values ('c1', 'ev_priv', '$LEA', 'on apporte quoi ?'), ('c2', 'ev_pub', '$LEA', 'rdv 9h');
 insert into public.event_reactions values ('ev_priv', '$LEA', '🎉');
 insert into public.blocks values ('$LEA', '$BLOQ');" >/dev/null

echo "⓪ AVANT la migration"
verifier "un inconnu lit toute activité (le trou)" "2" "$(EN "$KEVIN" "select count(*) from public.events;")"
verifier "un visiteur lit toute activité (le trou)" "2" "$(ANON "select count(*) from public.events;")"

echo "① application"
SORTIE="$(APPLIQUER "$MIG")"
if echo "$SORTIE" | grep -q "ERROR"; then echo "$SORTIE"; fi
verifier "la migration passe (16 OK)" "16" "$(echo "$SORTIE" | grep -cE '\| *OK *$' || true)"
SORTIE2="$(APPLIQUER "$MIG")"
verifier "la migration se REJOUE" "16" "$(echo "$SORTIE2" | grep -cE '\| *OK *$' || true)"
verifier "les activités existantes restent publiques" "2" "$(Q "select count(*) from public.events where visibilite = 'publique';")"

# Léa rend son activité privée et invite Ben, comme le client.
verifier "Léa rend son activité privée" "ok" "$(ECRIT "$LEA" "update public.events set visibilite = 'privee' where id = 'ev_priv'")"
Q "update public.events set visibilite = 'privee' where id = 'ev_priv';" >/dev/null
verifier "Léa invite Ben" "ok" "$(ECRIT "$LEA" "insert into public.event_invites (event_id, user_id) values ('ev_priv', '$BEN')")"
EN "$LEA" "insert into public.event_invites (event_id, user_id) values ('ev_priv', '$BEN');" >/dev/null

echo "② APRÈS — lecture de l'activité"
verifier "Léa (organisatrice) lit sa privée" "1" "$(EN "$LEA" "select count(*) from public.events where id = 'ev_priv';")"
verifier "le co-organisateur la lit" "1" "$(EN "$CO" "select count(*) from public.events where id = 'ev_priv';")"
verifier "Ben (invité) la lit" "1" "$(EN "$BEN" "select count(*) from public.events where id = 'ev_priv';")"
verifier "Kevin (inconnu) ne la lit pas" "0" "$(EN "$KEVIN" "select count(*) from public.events where id = 'ev_priv';")"
verifier "un visiteur ne la lit pas" "0" "$(ANON "select count(*) from public.events where id = 'ev_priv';")"
verifier "Kevin lit toujours la publique" "1" "$(EN "$KEVIN" "select count(*) from public.events where id = 'ev_pub';")"
verifier "un visiteur lit toujours la publique" "1" "$(ANON "select count(*) from public.events where id = 'ev_pub';")"
verifier "le bloqué ne lit toujours pas l'activité de Léa" "0" "$(EN "$BLOQ" "select count(*) from public.events;")"

echo "② APRÈS — ce qui l'entoure"
verifier "Kevin ne lit pas ses commentaires" "0" "$(EN "$KEVIN" "select count(*) from public.event_comments where event_id = 'ev_priv';")"
verifier "un visiteur ne lit pas ses commentaires" "0" "$(ANON "select count(*) from public.event_comments where event_id = 'ev_priv';")"
verifier "un visiteur ne lit pas ses réactions" "0" "$(ANON "select count(*) from public.event_reactions where event_id = 'ev_priv';")"
verifier "un visiteur lit les commentaires d'une publique" "1" "$(ANON "select count(*) from public.event_comments where event_id = 'ev_pub';")"
verifier "Ben lit ses commentaires" "1" "$(EN "$BEN" "select count(*) from public.event_comments where event_id = 'ev_priv';")"
verifier "Kevin ne lit pas ses réactions" "0" "$(EN "$KEVIN" "select count(*) from public.event_reactions where event_id = 'ev_priv';")"
verifier "Kevin n'en compte pas les participants" "0" "$(EN "$KEVIN" "select count(*) from public.participants_compte(array['ev_priv']);")"
verifier "Ben en compte les participants" "1" "$(EN "$BEN" "select going from public.participants_compte(array['ev_priv']);")"
verifier "Kevin compte ceux d'une publique" "1" "$(EN "$KEVIN" "select going from public.participants_compte(array['ev_pub']);")"
verifier "le fil (réponses, temps réel) est fermé à Kevin" "f" "$(EN "$KEVIN" "select public.fil_activite_visible('ev_priv');")"
verifier "le fil est ouvert à Ben" "t" "$(EN "$BEN" "select public.fil_activite_visible('ev_priv');")"

echo "② APRÈS — écritures"
verifier "Kevin ne peut pas s'inscrire" "42501" "$(ECRIT "$KEVIN" "insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_priv', '$KEVIN', 'going')")"
verifier "Kevin ne peut pas commenter" "42501" "$(ECRIT "$KEVIN" "insert into public.event_comments values ('cK', 'ev_priv', '$KEVIN', 'coucou')")"
verifier "Kevin ne peut pas réagir" "42501" "$(ECRIT "$KEVIN" "insert into public.event_reactions values ('ev_priv', '$KEVIN', '👍')")"
verifier "Kevin ne peut pas s'inviter" "42501" "$(ECRIT "$KEVIN" "insert into public.event_invites (event_id, user_id) values ('ev_priv', '$KEVIN')")"
verifier "Ben (invité) ne peut pas inviter Kevin" "42501" "$(ECRIT "$BEN" "insert into public.event_invites (event_id, user_id) values ('ev_priv', '$KEVIN')")"
verifier "Léa ne peut pas inviter au nom d'un autre" "42501" "$(ECRIT "$LEA" "insert into public.event_invites (event_id, user_id, invited_by) values ('ev_priv', '$KEVIN', '$CO')")"
verifier "Léa ne peut pas inviter un compte bloqué" "42501" "$(ECRIT "$LEA" "insert into public.event_invites (event_id, user_id) values ('ev_priv', '$BLOQ')")"
verifier "le co-organisateur peut inviter" "ok" "$(ECRIT "$CO" "insert into public.event_invites (event_id, user_id) values ('ev_priv', '$KEVIN')")"
verifier "Kevin ne déplace pas son inscription vers la privée" "42501" "$(ECRIT "$KEVIN" "insert into public.event_attendees values ('ev_pub', '$KEVIN', 'going', null); update public.event_attendees set event_id = 'ev_priv' where user_id = '$KEVIN'")"
verifier "Ben peut s'inscrire" "ok" "$(ECRIT "$BEN" "insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_priv', '$BEN', 'going')")"
verifier "Ben peut commenter" "ok" "$(ECRIT "$BEN" "insert into public.event_comments values ('cB', 'ev_priv', '$BEN', 'top')")"
verifier "Kevin peut s'inscrire à une publique" "ok" "$(ECRIT "$KEVIN" "insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_pub', '$KEVIN', 'going')")"
verifier "un visiteur ne lit pas les invités" "42501" "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "begin; set local role anon; do \$x\$ begin begin perform 1 from public.event_invites; raise notice 'ETAT=ok'; exception when others then raise notice 'ETAT=%', sqlstate; end; end \$x\$; rollback;" 2>&1 | sed -n 's/.*ETAT=//p')"

echo "② APRÈS — notifications d'invitation"
verifier "Léa notifie Ben (invité)" "ok" "$(ECRIT "$LEA" "insert into public.notifications (user_id, from_id, kind, ref_id) values ('$BEN', '$LEA', 'event_invite', 'ev_priv')")"
EN "$LEA" "insert into public.notifications (id, user_id, from_id, kind, ref_id) values ('n_ben', '$BEN', '$LEA', 'event_invite', 'ev_priv');" >/dev/null
verifier "Ben marque l'invitation lue" "ok" "$(ECRIT "$BEN" "update public.notifications set seen = true where id = 'n_ben'")"
verifier "Léa ne notifie pas un non-invité" "42501" "$(ECRIT "$LEA" "insert into public.notifications (user_id, from_id, kind, ref_id) values ('$BLOQ', '$LEA', 'event_invite', 'ev_priv')")"
verifier "Kevin ne se fait pas envoyer le titre (complice)" "42501" "$(ECRIT "$KEVIN" "insert into public.notifications (user_id, from_id, kind, ref_id) values ('$BEN', '$KEVIN', 'event_invite', 'ev_priv')")"
verifier "Kevin ne saute pas la garde en forgeant origine = serveur" "42501" "$(ECRIT "$KEVIN" "insert into public.notifications (user_id, from_id, kind, ref_id, origine) values ('$BEN', '$KEVIN', 'event_invite', 'ev_priv', 'serveur')")"
verifier "une ligne du SERVEUR (réglage posé) n'est pas touchée" "ok" "$(ECRIT "$KEVIN" "perform set_config('passio.notification_serveur', '1', true); insert into public.notifications (user_id, from_id, kind, ref_id) values ('$BEN', '$KEVIN', 'event_invite', 'ev_priv')")"
verifier "Ben (invité, pas organisateur) n'invite pas" "42501" "$(ECRIT "$BEN" "insert into public.notifications (user_id, from_id, kind, ref_id) values ('$BEN', '$BEN', 'event_invite', 'ev_priv')")"
verifier "une invitation à une publique n'est pas touchée" "ok" "$(ECRIT "$KEVIN" "insert into public.notifications (user_id, from_id, kind, ref_id) values ('$BEN', '$KEVIN', 'event_invite', 'ev_pub')")"
verifier "Léa ré-invite Ben sans erreur (rejeu idempotent)" "ok" "$(ECRIT "$LEA" "insert into public.event_invites (event_id, user_id) values ('ev_priv', '$BEN') on conflict do nothing")"

echo "② APRÈS — la liste des invités"
EN "$LEA" "insert into public.event_invites (event_id, user_id) values ('ev_priv', '$CO');" >/dev/null 2>&1 || true
Q "insert into public.event_invites (event_id, user_id, invited_by) values ('ev_priv', '$KEVIN', '$LEA');" >/dev/null
verifier "Ben ne lit que SA ligne d'invitation" "1" "$(EN "$BEN" "select count(*) from public.event_invites;")"
verifier "Léa lit toute la liste" "2" "$(EN "$LEA" "select count(*) from public.event_invites where user_id in ('$BEN', '$KEVIN');")"
verifier "invité à son tour, Kevin lit l'activité" "1" "$(EN "$KEVIN" "select count(*) from public.events where id = 'ev_priv';")"
verifier "Léa retire l'invitation de Kevin" "ok" "$(ECRIT "$LEA" "delete from public.event_invites where user_id = '$KEVIN'")"
Q "delete from public.event_invites where user_id = '$KEVIN';" >/dev/null
verifier "désinvité, Kevin ne la lit plus" "0" "$(EN "$KEVIN" "select count(*) from public.events where id = 'ev_priv';")"
verifier "un UPDATE d'invitation n'existe pas" "42501" "$(ECRIT "$BEN" "update public.event_invites set user_id = '$KEVIN' where user_id = '$BEN'")"
verifier "la suppression de l'activité emporte ses invités" "0" "$(Q "begin; delete from public.events where id = 'ev_priv'; select count(*) from public.event_invites; rollback;" | grep -E '^[0-9]+$')"

verifier "la suppression d'un profil emporte ses invitations" "0" "$(Q "begin; delete from public.profiles where id = '$BEN'; select count(*) from public.event_invites where user_id = '$BEN'; rollback;" | grep -E '^[0-9]+$')"

echo "③ MUTATION — une restrictive retirée"
# Le `drop policy if exists` reste, le `create` saute : la policy disparaît DANS la transaction.
MUT="$(sed '/^create policy events_privee_lecture_compte/,/;$/d' "$MIG" \
  | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 2>&1 || true)"
verifier "le verdict LÈVE (rien n'est validé)" "1" "$(echo "$MUT" | grep -c "verdict en ECHEC" || true)"
verifier "…et l'activité privée reste fermée à Kevin" "0" "$(EN "$KEVIN" "select count(*) from public.events where visibilite = 'privee';")"

echo "④ SUITE — retirer un invité, lien d'invitation, notes"
verifier "sans la suite, le code d'invitation n'existe pas" "42883" "$(ECRIT "$LEA" "perform public.code_invitation_activite('ev_priv')")"
SORTIE3="$(APPLIQUER "$SUITE")"
if echo "$SORTIE3" | grep -q "ERROR"; then echo "$SORTIE3"; fi
verifier "la suite passe (7 OK)" "7" "$(echo "$SORTIE3" | grep -cE '\| *OK *$' || true)"
verifier "la suite se REJOUE" "7" "$(APPLIQUER "$SUITE" | grep -cE '\| *OK *$' || true)"

# Ben, invité, s'inscrit et entre dans la discussion ; une note de Ben.
Q "insert into public.event_attendees (event_id, user_id, rsvp, rating) values ('ev_priv', '$BEN', 'going', 5) on conflict do nothing;
   insert into public.conv_members values ('evgrp_ev_priv', '$BEN'), ('evgrp_ev_priv', '$LEA');" >/dev/null
verifier "notes : fermées à Kevin (non admis)" "" "$(EN "$KEVIN" "select public.notes_evenement('ev_priv');")"
verifier "notes : ouvertes à Ben (inscrit)" "1" "$(EN "$BEN" "select public.notes_evenement('ev_priv')->>'count';")"
verifier "notes : une publique reste lisible par Kevin" "0" "$(EN "$KEVIN" "select public.notes_evenement('ev_pub')->>'count';")"

verifier "Kevin ne retire personne" "f" "$(EN "$KEVIN" "select public.retirer_invite_activite('ev_priv', '$BEN');")"
verifier "Ben (invité) ne retire personne" "f" "$(EN "$BEN" "select public.retirer_invite_activite('ev_priv', '$BEN');")"
verifier "Léa ne retire pas son co-organisateur" "f" "$(EN "$LEA" "select public.retirer_invite_activite('ev_priv', '$CO');")"
verifier "Léa ne retire personne d'une publique" "f" "$(EN "$LEA" "select public.retirer_invite_activite('ev_pub', '$BEN');")"
verifier "Léa retire Ben" "t" "$(EN "$LEA" "select public.retirer_invite_activite('ev_priv', '$BEN');")"
verifier "…son invitation, son inscription et sa place dans la discussion partent" "0|0|0" "$(Q "select (select count(*) from public.event_invites where user_id = '$BEN')||'|'||(select count(*) from public.event_attendees where event_id = 'ev_priv' and user_id = '$BEN')||'|'||(select count(*) from public.conv_members where user_id = '$BEN');")"
verifier "…et Ben ne lit plus l'activité" "0" "$(EN "$BEN" "select count(*) from public.events where id = 'ev_priv';")"

verifier "Kevin n'obtient pas le code" "" "$(EN "$KEVIN" "select public.code_invitation_activite('ev_priv');")"
verifier "pas de code pour une activité publique" "" "$(EN "$LEA" "select public.code_invitation_activite('ev_pub');")"
CODE="$(EN "$LEA" "select public.code_invitation_activite('ev_priv');")"
verifier "Léa obtient un code de 64 hexadécimaux" "1" "$(echo "$CODE" | grep -cE '^[0-9a-f]{64}$' || true)"
verifier "le code est stable sans renouvellement" "$CODE" "$(EN "$CO" "select public.code_invitation_activite('ev_priv');")"
verifier "aucun compte ne lit la table des codes" "42501" "$(ECRIT "$LEA" "perform 1 from public.event_codes_invitation")"
verifier "un mauvais code rend faux" "f" "$(EN "$KEVIN" "select public.rejoindre_par_code('ev_priv', repeat('a', 64));")"
verifier "un code d'une autre forme rend faux" "f" "$(EN "$KEVIN" "select public.rejoindre_par_code('ev_priv', 'x');")"
verifier "le bon code sur une autre activité rend faux" "f" "$(EN "$KEVIN" "select public.rejoindre_par_code('ev_pub', '$CODE');")"
verifier "le bloqué n'entre pas par le lien" "f" "$(EN "$BLOQ" "select public.rejoindre_par_code('ev_priv', '$CODE');")"
verifier "un visiteur ne peut pas l'appeler" "42501" "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "begin; set local role anon; do \$x\$ begin begin perform public.rejoindre_par_code('ev_priv', '$CODE'); raise notice 'ETAT=ok'; exception when others then raise notice 'ETAT=%', sqlstate; end; end \$x\$; rollback;" 2>&1 | sed -n 's/.*ETAT=//p')"
verifier "Kevin entre avec le bon code" "t" "$(EN "$KEVIN" "select public.rejoindre_par_code('ev_priv', '$CODE');")"
verifier "…et lit désormais l'activité" "1" "$(EN "$KEVIN" "select count(*) from public.events where id = 'ev_priv';")"
verifier "…invité au nom de l'autrice" "$LEA" "$(Q "select invited_by from public.event_invites where event_id = 'ev_priv' and user_id = '$KEVIN';")"
NOUVEAU="$(EN "$LEA" "select public.code_invitation_activite('ev_priv', true);")"
verifier "renouveler change le code" "1" "$([ -n "$NOUVEAU" ] && [ "$NOUVEAU" != "$CODE" ] && echo 1 || echo 0)"
verifier "l'ancien lien ne fait plus entrer Ben" "f" "$(EN "$BEN" "select public.rejoindre_par_code('ev_priv', '$CODE');")"
verifier "le nouveau, si" "t" "$(EN "$BEN" "select public.rejoindre_par_code('ev_priv', '$NOUVEAU');")"
verifier "supprimer l'activité emporte son code" "0" "$(Q "begin; delete from public.events where id = 'ev_priv'; select count(*) from public.event_codes_invitation; rollback;" | grep -E '^[0-9]+$')"

echo "⑤ MUTATION — la suite sans la garde de l'organisation"
MUT2="$(sed 's/or not public.organise_activite(p_event_id) then/then/' "$SUITE" \
  | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 2>&1 || true)"
verifier "le verdict LÈVE (rien n'est validé)" "1" "$(echo "$MUT2" | grep -c "verdict en ECHEC" || true)"
verifier "…et Kevin n'obtient toujours pas le code" "" "$(EN "$KEVIN" "select public.code_invitation_activite('ev_priv');")"

echo "⑥ RETRAITS — un invité retiré ne revient pas par le lien"
CODE3="$(EN "$LEA" "select public.code_invitation_activite('ev_priv');")"
Q "delete from public.event_invites where event_id = 'ev_priv' and user_id = '$KEVIN';" >/dev/null
verifier "AVANT : Kevin entre par le lien" "t" "$(EN "$KEVIN" "select public.rejoindre_par_code('ev_priv', '$CODE3');")"
verifier "AVANT : Léa retire Kevin" "t" "$(EN "$LEA" "select public.retirer_invite_activite('ev_priv', '$KEVIN');")"
verifier "AVANT (le défaut) : Kevin REVIENT par le même lien" "t" "$(EN "$KEVIN" "select public.rejoindre_par_code('ev_priv', '$CODE3');")"
SORTIE4="$(APPLIQUER "$RETRAITS")"
if echo "$SORTIE4" | grep -q "ERROR"; then echo "$SORTIE4"; fi
verifier "les retraits passent (6 OK)" "6" "$(echo "$SORTIE4" | grep -cE '\| *OK *$' || true)"
verifier "…et se REJOUENT" "6" "$(APPLIQUER "$RETRAITS" | grep -cE '\| *OK *$' || true)"
verifier "Léa retire Kevin" "t" "$(EN "$LEA" "select public.retirer_invite_activite('ev_priv', '$KEVIN');")"
verifier "APRÈS : Kevin ne revient pas par le lien" "f" "$(EN "$KEVIN" "select public.rejoindre_par_code('ev_priv', '$CODE3');")"
verifier "…ni ne lit l'activité" "0" "$(EN "$KEVIN" "select count(*) from public.events where id = 'ev_priv';")"
verifier "…ni ne lit la liste des retraits" "42501" "$(ECRIT "$KEVIN" "perform 1 from public.event_invites_retires")"
verifier "…ni ne s'en efface (aucun droit)" "42501" "$(ECRIT "$KEVIN" "delete from public.event_invites_retires")"
verifier "Ben, lui, entre toujours par le lien" "t" "$(EN "$BEN" "select public.rejoindre_par_code('ev_priv', '$CODE3');")"
verifier "Léa réinvite Kevin explicitement" "ok" "$(ECRIT "$LEA" "insert into public.event_invites (event_id, user_id) values ('ev_priv', '$KEVIN')")"
EN "$LEA" "insert into public.event_invites (event_id, user_id) values ('ev_priv', '$KEVIN');" >/dev/null
verifier "…la marque est effacée, Kevin lit de nouveau" "0|1" "$(Q "select (select count(*) from public.event_invites_retires where user_id = '$KEVIN')||'|'||(select count(*) from public.event_invites where event_id = 'ev_priv' and user_id = '$KEVIN');")"
verifier "supprimer l'activité emporte ses retraits" "0" "$(Q "begin; insert into public.event_invites_retires values ('ev_priv', '$BLOQ'); delete from public.events where id = 'ev_priv'; select count(*) from public.event_invites_retires; rollback;" | grep -E '^[0-9]+$')"

echo "⑦ RESTES — notification d'un invité retiré, publications vues sans compte"
Q "insert into public.posts values
   ('p_album', '$LEA', 'photos', 'ev_priv', null, null),
   ('p_carte', '$LEA', '', null, '{\"kind\":\"event\",\"id\":\"ev_priv\"}', null),
   ('p_repost', '$BEN', '', null, null, 'p_carte'),
   ('p_pub', '$LEA', 'rando', 'ev_pub', null, null),
   ('p_libre', '$LEA', 'bonjour', null, null, null);
   insert into public.post_comments values ('pc1', 'p_album', '$BEN', 'super');
   insert into public.post_likes values ('p_album', '$BEN');
   insert into public.comment_interactions values ('ci1', 'pc1', 'p_album', '$BEN', 'reply');" >/dev/null
verifier "AVANT : un visiteur lit l'album de l'activité privée" "1" "$(ANON "select count(*) from public.posts where id = 'p_album';")"
Q "delete from public.event_invites where user_id = '$BEN'; insert into public.event_invites (event_id, user_id, invited_by) values ('ev_priv', '$BEN', '$LEA') on conflict do nothing;" >/dev/null
EN "$LEA" "insert into public.notifications (id, user_id, from_id, kind, ref_id) values ('n_ben2', '$BEN', '$LEA', 'event_invite', 'ev_priv');" >/dev/null
EN "$LEA" "insert into public.notifications (id, user_id, from_id, kind, ref_id) values ('n_ben_pub', '$BEN', '$LEA', 'event_invite', 'ev_pub');" >/dev/null
verifier "AVANT : Ben a sa notification d'invitation" "1" "$(Q "select count(*) from public.notifications where id = 'n_ben2';")"
SORTIE5="$(APPLIQUER "$RESTES")"
if echo "$SORTIE5" | grep -q "ERROR"; then echo "$SORTIE5"; fi
verifier "les restes passent (4 OK)" "4" "$(echo "$SORTIE5" | grep -cE '\| *OK *$' || true)"
verifier "…et se REJOUENT" "4" "$(APPLIQUER "$RESTES" | grep -cE '\| *OK *$' || true)"
verifier "Léa retire Ben" "t" "$(EN "$LEA" "select public.retirer_invite_activite('ev_priv', '$BEN');")"
verifier "…sa notification d'invitation part avec lui" "0" "$(Q "select count(*) from public.notifications where id = 'n_ben2';")"
verifier "…celle d'une AUTRE activité reste" "1" "$(Q "select count(*) from public.notifications where id = 'n_ben_pub';")"
verifier "…et le lien ne le fait toujours pas revenir" "f" "$(EN "$BEN" "select public.rejoindre_par_code('ev_priv', '$CODE3');")"
verifier "visiteur : ni l'album, ni la carte, ni le repartage d'une privée" "0" "$(ANON "select count(*) from public.posts where id in ('p_album', 'p_carte', 'p_repost');")"
verifier "visiteur : une publication publique ou libre se lit" "2" "$(ANON "select count(*) from public.posts where id in ('p_pub', 'p_libre');")"
verifier "visiteur : ni commentaires, ni j'aime, ni réponses de l'album" "0|0|0" "$(ANON "select (select count(*) from public.post_comments)||'|'||(select count(*) from public.post_likes)||'|'||(select count(*) from public.comment_interactions);")"
verifier "un compte n'est pas touché par ces restrictives" "3" "$(EN "$KEVIN" "select count(*) from public.posts where id in ('p_album', 'p_carte', 'p_repost');")"
verifier "rendue publique, l'activité rouvre son album au visiteur" "1" "$(Q "begin; update public.events set visibilite = 'publique' where id = 'ev_priv'; set local role anon; select count(*) from public.posts where id = 'p_album'; rollback;" | grep -E '^[0-9]+$')"

echo "⑧ VISITEUR — les lecteurs SECURITY DEFINER (interactions_cibles, fil_compteurs…)"
verifier "AVANT (le défaut) : un visiteur relit les réponses de l'album par un lecteur DEFINER" "1" "$(ANON "select public.reponses_lues('p_album');")"
SORTIE6="$(APPLIQUER "$VISITEUR")"
if echo "$SORTIE6" | grep -q "ERROR"; then echo "$SORTIE6"; fi
verifier "la règle visiteur passe (3 OK)" "3" "$(echo "$SORTIE6" | grep -cE '\| *OK *$' || true)"
verifier "…et se REJOUE" "3" "$(APPLIQUER "$VISITEUR" | grep -cE '\| *OK *$' || true)"
verifier "APRÈS : le lecteur DEFINER ne rend plus rien au visiteur" "0" "$(ANON "select public.reponses_lues('p_album');")"
verifier "…post_is_visible : faux pour l'album, vrai pour une publication libre" "false|true" "$(ANON "select public.post_is_visible('p_album')||'|'||public.post_is_visible('p_libre');")"
verifier "…un compte n'est pas touché par cette règle" "t" "$(EN "$KEVIN" "select public.post_is_visible('p_album');")"
verifier "la garde refuse une post_is_visible inattendue" "1" "$(Q "begin; create or replace function public.post_is_visible(pid text) returns boolean language sql stable security definer as \$x\$ select true \$x\$; rollback;" >/dev/null; sed 's/^begin;$/begin; create or replace function public.post_is_visible(pid text) returns boolean language sql stable security definer as $x$ select true $x$;/' "$VISITEUR" | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 2>&1 | grep -c "définition attendue" || true)"
verifier "…et rien n'a changé (transaction annulée)" "f" "$(ANON "select public.post_is_visible('p_album');")"

echo
echo "Banc activités privées : $ok OK, $ko ÉCHEC"
[ "$ko" -eq 0 ]
