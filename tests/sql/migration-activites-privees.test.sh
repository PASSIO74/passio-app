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
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIG" ] || { echo "❌ introuvable : $MIG"; exit 1; }

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
  checked_in_at timestamptz, primary key (event_id, user_id));
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

echo
echo "Banc activités privées : $ok OK, $ko ÉCHEC"
[ "$ko" -eq 0 ]
