#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_prevenir_inscrits_serveur_2026-11-22.sql
#        (village à 100, contrôle A3 : 60 inscrits prévenus sur 99)
#
# Socle = les définitions de PRODUCTION relevées le 2026-11-22 (canal ①,
# md5 identiques au staging) de ce que la migration touche ou appelle :
# `debit_compter` (+ plafond du jour), `rate_limit_insert` sur
# `notifications`, `notifications_origine` (avec son plafond par cible),
# `organise_activite`, `is_blocked_with`, `passio_echapper_html`,
# `events_prevenir_suppression` (12/11), `identifiant_reserve_au_serveur`
# (03/11) et la policy d'INSERT client, `suppression_de_mon_compte`,
# `adult_access_allowed`, `comptes_en_suppression`, les bornes de la table.
# Les deux corps que la migration remplace sont vérifiés au md5 normalisé
# relu en production : le socle EST la production pour ses gardes.
# On MESURE D'ABORD les défauts (la 61ᵉ ligne d'une même minute est refusée ;
# la suppression d'une grande activité n'en prévient AUCUN ; un client occupe
# un identifiant `n_sup_`), on éprouve quatre MUTATIONS et une garde (chacune
# refusée, rien appliqué), on applique, on rejoue, puis on mesure de
# l'extérieur, sous le rôle `authenticated` : bornes par activité, par compte
# et en lignes par jour (relecture red team du 22/11, P1), message trop long
# une fois échappé, activité terminée, admission.
#
#   bash tests/sql/migration-prevenir-inscrits-serveur.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_prevenir_inscrits_serveur_2026-11-22.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 7450 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"; SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
TMPM="$(mktemp -d)"
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE" "$TMPM"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }; sleep 0.5; done
[ "$demarre" -eq 1 ] || { echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"; exit 1; }

DB=prevenir
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1 || true; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1 || true; }
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }
# Un appel de la fonction, sous `authenticated` : le motif d'un refus, ou « prevenues/destinataires ».
PREV() { AUTH "$1" "with r as (select public.prevenir_inscrits_activite('$2', '$3', '$4'${5:+, '$5'}) as j) select coalesce(j->>'motif', (j->>'prevenues') || '/' || (j->>'destinataires')) from r;"; }

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }

ORGA=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
X=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb       # étrangère à l'activité
BLOQ=cccccccc-cccc-4ccc-8ccc-cccccccccccc    # inscrite, a bloqué l'organisatrice
SUPPR=dddddddd-dddd-4ddd-8ddd-dddddddddddd   # inscrite, compte en suppression
uidn() { printf '00000000-0000-4000-8000-%012d' "$1"; }

Y=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee       # organise une autre activité, sans admission

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, created_at timestamptz default now() - interval '30 days');
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated;

create table public.profiles (id text primary key, username text not null, is_private boolean default false);
create table public.events (id text primary key, organizer_id text, author_id text, title text, status text not null default 'active',
  co_organizers jsonb not null default '[]'::jsonb, date_at timestamp, end_at timestamp, created_at timestamp default now());
create table public.event_attendees (event_id text not null references public.events(id) on delete cascade, user_id text not null,
  rsvp text not null default 'going' check (rsvp in ('going', 'maybe', 'declined', 'waitlist')), created_at timestamptz default now(),
  primary key (event_id, user_id));
create table public.blocks (blocker_id text not null, blocked_id text not null, created_at timestamptz default now(), primary key (blocker_id, blocked_id));
create table public.comptes_en_suppression (user_id text primary key, statut text not null default 'en_cours');
create table public.user_safety (user_id text primary key, majority_at date);
create table public.access_policies (key text primary key, enabled boolean);
insert into public.access_policies values ('irl_adult_only', true);
-- Les bornes de production de `notifications`.
create table public.notifications (id text primary key check (id ~ '^[A-Za-z0-9_-]{1,120}$'), user_id text, kind text, from_id text, ref_id text,
  content text check (content is null or char_length(content) <= 600), seen boolean default false,
  created_at timestamp default now(), origine text check (origine in ('client', 'serveur')), push_le timestamptz);
alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = (select auth.uid())::text);
grant select, insert on public.notifications to authenticated;
-- Comme en production : `events` se lit colonne par colonne (aucun SELECT de table pour les clients).
grant select (id, organizer_id, author_id, title, status, co_organizers, date_at, end_at, created_at) on public.events to anon, authenticated;
grant select on public.event_attendees to authenticated;
create table public.debit_ecritures (minute timestamptz, table_nom text, source text, n integer, primary key (minute, table_nom, source));
create table public.debit_jour (jour date, cle text, source text, n bigint, primary key (jour, cle, source));

-- ── Définitions de PRODUCTION (pg_get_functiondef, 2026-11-22) ──
create function public.compte_recent(p_source text) returns boolean language plpgsql stable security definer set search_path to '' as $f$
declare cree timestamptz;
begin
  if p_source is null or p_source !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  select u.created_at into cree from auth.users u where u.id = p_source::uuid;
  return cree is null or cree > pg_catalog.now() - interval '7 days';
end $f$;
create function public.debit_jour_compter(p_cle text, p_source text, p_n bigint, p_plafond bigint) returns void language plpgsql security definer set search_path to '' as $f$
declare v bigint;
begin
  insert into public.debit_jour as d (jour, cle, source, n)
  values ((pg_catalog.now() at time zone 'UTC')::date, p_cle, p_source, p_n)
  on conflict (jour, cle, source) do update set n = d.n + excluded.n
  returning d.n into v;
  if v > p_plafond then
    raise exception 'rate limit: plafond journalier atteint sur %', p_cle using errcode = 'P0001';
  end if;
end $f$;
create function public.debit_compter(p_table text, p_source text, p_plafond integer) returns void language plpgsql security definer set search_path to '' as $f$
declare v integer;
begin
  insert into public.debit_ecritures as d (minute, table_nom, source, n)
  values (pg_catalog.date_trunc('minute', pg_catalog.now()), p_table, p_source, 1)
  on conflict (minute, table_nom, source) do update set n = d.n + 1
  returning d.n into v;
  if v > p_plafond then
    raise exception 'rate limit: max % insertions/minute sur %', p_plafond, p_table using errcode = 'P0001';
  end if;
  if pg_catalog.current_setting('role', true) in ('anon', 'authenticated') then
    perform public.debit_jour_compter(p_table, p_source, 1,
      p_plafond::bigint * case when public.compte_recent(p_source) then 15 else 60 end);
  end if;
end $f$;
create function public.rate_limit_insert() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $f$
declare user_col text := TG_ARGV[0]; max_per_min int := TG_ARGV[1]::int; uid text;
begin
  NEW.created_at := now();
  execute format('select ($1).%I', user_col) into uid using NEW;
  if uid is null then return NEW; end if;
  perform public.debit_compter(TG_TABLE_NAME, uid, max_per_min);
  return NEW;
end $f$;
create function public.notifications_origine() returns trigger language plpgsql security definer set search_path to '' as $f$
begin
  new.origine := case when current_setting('passio.notification_serveur', true) = '1' then 'serveur' else 'client' end;
  if new.origine = 'client' and auth.uid() is not null then
    new.push_le := null;
    if (select count(*) from public.notifications n
         where n.from_id = new.from_id and n.user_id = new.user_id
           and n.created_at > now() - interval '1 minute') >= 10 then
      raise exception 'rate limit: max 10 notifications/minute vers un même compte' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $f$;
create trigger trg_notifications_origine before insert on public.notifications for each row execute function public.notifications_origine();
create trigger trg_rate_limit before insert on public.notifications for each row execute function public.rate_limit_insert('from_id', '60');
create function public.organise_activite(p_event_id text) returns boolean language sql stable security definer set search_path to '' as $f$
  select auth.uid() is not null and exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.author_id = (select auth.uid())::text
        or e.organizer_id = (select auth.uid())::text
        or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array'
            and e.co_organizers ? (select auth.uid())::text))
  );
$f$;
create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path to '' as $f$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _other IS NULL OR _other = (auth.uid())::text THEN FALSE
    ELSE EXISTS (SELECT 1 FROM public.blocks b
       WHERE (b.blocker_id = (auth.uid())::text AND b.blocked_id = _other)
          OR (b.blocker_id = _other AND b.blocked_id = (auth.uid())::text))
  END
$f$;
create function public.passio_echapper_html(s text) returns text language sql immutable set search_path to '' as $f$
  select replace(replace(replace(replace(replace(coalesce(s, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$f$;
create function public.suppression_de_mon_compte() returns boolean language sql stable security definer set search_path to '' as $f$
  select case when auth.uid() is null then false
    else exists (select 1 from public.comptes_en_suppression c
                  where c.user_id = (auth.uid())::text and c.statut in ('en_cours','purgee','supprimee')) end
$f$;
create function public.is_adult_declared() returns boolean language sql stable security definer set search_path to '' as $f$
  SELECT CASE WHEN auth.uid() IS NULL THEN FALSE
    ELSE COALESCE((SELECT s.majority_at <= CURRENT_DATE FROM public.user_safety s WHERE s.user_id = (auth.uid())::text), FALSE) END
$f$;
create function public.adult_access_enforced() returns boolean language sql stable security definer set search_path to '' as $f$
  SELECT COALESCE((SELECT p.enabled FROM public.access_policies p WHERE p.key = 'irl_adult_only'), TRUE)
$f$;
create function public.adult_access_allowed() returns boolean language sql stable security definer set search_path to '' as $f$
  SELECT CASE WHEN auth.uid() IS NULL THEN FALSE WHEN NOT public.adult_access_enforced() THEN TRUE ELSE public.is_adult_declared() END
$f$;
-- La réserve d'identifiants du 03/11, telle qu'en production (corps relu au caractère près).
create function public.identifiant_reserve_au_serveur(p_id text) returns boolean language sql immutable set search_path to '' as $f$
  select p_id like 'n\_m\_%'
      or p_id like 'n\_pa\_%'
      or p_id like 'n\_fw\_%'
      or p_id like 'n\_fr\_%'
      or p_id like 'n\_fa\_%'
$f$;
-- La policy d'INSERT client de production.
create policy notifications_insert_own_author on public.notifications for insert to authenticated
  with check (from_id = (select auth.uid())::text and not public.is_blocked_with(user_id)
              and not public.suppression_de_mon_compte() and not public.identifiant_reserve_au_serveur(id));
SQL
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
-- L'avis de suppression du 12/11, tel qu'en production.
create or replace function public.events_prevenir_suppression() returns trigger language plpgsql security definer set search_path to '' as $f$
declare
  orga text := coalesce(old.organizer_id, old.author_id);
  nom  text;
begin
  if orga is null then return old; end if;
  select p.username into nom from public.profiles p where p.id = orga;
  begin
    perform set_config('passio.notification_serveur', '1', true);
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
    select 'n_sup_' || left(md5(old.id || a.user_id), 20), a.user_id, 'event_cancelled', orga, old.id,
           public.passio_echapper_html(coalesce(nullif(btrim(nom), ''), 'Quelqu''un'))
             || ' a supprimé « ' || public.passio_echapper_html(left(coalesce(old.title, 'une activité'), 60)) || ' »',
           false
      from public.event_attendees a
     where a.event_id = old.id and a.user_id is distinct from orga
    on conflict (id) do nothing;
    perform set_config('passio.notification_serveur', '', true);
  exception when others then
    perform set_config('passio.notification_serveur', '', true);
  end;
  return old;
end
$f$;
create trigger trg_events_prevenir_suppression before delete on public.events for each row execute function public.events_prevenir_suppression();
-- Les fonctions de Supabase sont exécutables par anon/authenticated par défaut.
grant execute on all functions in schema public to anon, authenticated;
SQL

H() { Q "select md5(btrim(regexp_replace(prosrc, '[[:space:]]+', ' ', 'g'))) from pg_proc where oid = '$1'::regprocedure;"; }
verifier "socle : l'avis de suppression est celui de la production (md5 normalisé relu le 22/11)" "b9767e8210b46598ff8a68437acafd3b" "$(H 'public.events_prevenir_suppression()')"
verifier "socle : la réserve d'identifiants est celle de la production" "5214adbb9c88ffd7800c75547e498258" "$(H 'public.identifiant_reserve_au_serveur(text)')"

# Une activité comme celle du village : l'organisatrice, 19 venants, 77 en attente,
# 3 « peut-être », 1 « ne vient pas » — 99 à prévenir — plus BLOQ (qui l'a bloquée)
# et SUPPR (compte en suppression), inscrites elles aussi : 103 lignes.
DATE_DEFAUT="now() + interval '2 days'"
peupler() { # $1 = identifiant de l'activité, $2 = organisatrice (défaut ORGA), $3 = date (défaut dans 2 jours)
  local o="${2:-$ORGA}" d="${3:-$DATE_DEFAUT}"
  Q "insert into public.events (id, organizer_id, author_id, title, status, date_at) values ('$1', '$o', '$o', 'Rando <du> lac', 'active', $d);
     insert into public.event_attendees (event_id, user_id, rsvp) values ('$1', '$o', 'going'), ('$1', '$BLOQ', 'going'), ('$1', '$SUPPR', 'going');
     insert into public.event_attendees (event_id, user_id, rsvp, created_at)
       select '$1', '00000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
              case when i <= 19 then 'going' when i <= 96 then 'waitlist' when i <= 99 then 'maybe' else 'declined' end,
              now() - make_interval(secs => 200 - i)
         from generate_series(1, 100) i;" >/dev/null
}
# Supprime une activité comme le fait l'organisatrice (auth.uid() = elle), sous le rôle propriétaire.
SUPPRIMER() { Q "begin; set local request.jwt.claim.sub = '$ORGA'; delete from public.events where id = '$1'; select coalesce(current_setting('passio.diffusion_inscrits', true), '') || '|' || coalesce(current_setting('passio.notification_serveur', true), ''); commit;"; }
Q "insert into public.profiles (id, username) values ('$ORGA', 'Léa & co'), ('$X', 'Xavier'), ('$BLOQ', 'Bloque'), ('$SUPPR', 'Partante'), ('$Y', 'Yves');
   insert into auth.users (id) values ('$ORGA');
   insert into public.user_safety (user_id, majority_at) values ('$ORGA', date '2000-01-01');
   insert into public.blocks (blocker_id, blocked_id) values ('$BLOQ', '$ORGA');
   insert into public.comptes_en_suppression (user_id, statut) values ('$SUPPR', 'en_cours');" >/dev/null
REMISE() { Q "delete from public.notifications; delete from public.debit_ecritures; delete from public.debit_jour;" >/dev/null; }

echo "── ① LES DÉFAUTS, MESURÉS AVANT ──────────────────────────────────────"
# Le chemin du client, en rafale (UNE requête : la même minute du plafond) : une écriture par personne.
ecrits="$(AUTH "$ORGA" "do \$r\$ declare i int; begin for i in 1..99 loop begin insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('zz_av_' || i, '00000000-0000-4000-8000-' || lpad(i::text, 12, '0'), 'event_cancelled', '$ORGA', 'ev_av', 'x'); exception when others then null; end; end loop; end \$r\$;" >/dev/null; Q "select count(*) from public.notifications where id like 'zz\_av\_%';")"
verifier "avant : 99 écritures d'une même minute depuis le navigateur → 60 passent (le défaut d'A3)" "60" "$ecrits"
REMISE
peupler ev_sup_avant
SUPPRIMER ev_sup_avant >/dev/null
verifier "avant : supprimer une activité de 102 inscrits n'en prévient AUCUN (l'INSERT entier est défait à la 61ᵉ ligne)" "0" \
  "$(Q "select count(*) from public.notifications where id like 'n\_sup\_%';")"
verifier "avant : un client peut occuper un identifiant n_sup_ (le défaut du 12/11)" "OK" \
  "$(_r="$(AUTH "$X" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('n_sup_occupe', '$ORGA', 'like', '$X', 'p1', 'x');")"; printf '%s' "$_r" | grep -qi error && echo REFUSE || echo OK)"
REMISE

echo "── ② MUTATIONS : chacune doit être refusée par la migration, RIEN appliqué ─"
TRG() { Q "select p.proname from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'public.notifications'::regclass and t.tgname = 'trg_rate_limit';"; }
# (a) sans l'exemption du plafond pour une diffusion serveur
awk 'BEGIN{n=0} /pg_catalog.current_setting\(.passio.diffusion_inscrits., true\) = .1. then$/ && n==0 {print "  if false then"; n=1; next} {print}' "$MIGRATION" > "$TMPM/m1.sql"
grep -q "  if false then" "$TMPM/m1.sql" || { echo "❌ mutation (a) non posée"; exit 1; }
contient "mutation (a) — plafond appliqué aux diffusions : refusée" "RIEN n'est appliqué" "$(APPLIQUER "$TMPM/m1.sql" || true)"
verifier "mutation (a) : la fonction n'existe pas" "" "$(Q "select to_regprocedure('public.prevenir_inscrits_activite(text, text, text, text)');")"
# (b) sans l'écart des comptes bloqués
grep -q "and not public.is_blocked_with(a.user_id)" "$MIGRATION" || { echo "❌ ancre de la mutation (b) introuvable"; exit 1; }
sed 's/and not public.is_blocked_with(a.user_id)/and true/' "$MIGRATION" > "$TMPM/m2.sql"
contient "mutation (b) — un compte qui a bloqué l'organisatrice serait prévenu : refusée" "RIEN n'est appliqué" "$(APPLIQUER "$TMPM/m2.sql" || true)"
verifier "mutation (b) : le plafond est resté celui d'avant" "rate_limit_insert" "$(TRG)"
# (c) un réglage posé pour la SESSION (set_config(…, false)) au lieu de la transaction
grep -q "set_config('passio.diffusion_inscrits', '1', true)" "$MIGRATION" || { echo "❌ ancre de la mutation (c) introuvable"; exit 1; }
sed "s/set_config('passio.diffusion_inscrits', '1', true)/set_config('passio.diffusion_inscrits', '1', false)/" "$MIGRATION" > "$TMPM/m3.sql"
contient "mutation (c) — réglage de diffusion posé pour la session : refusée" "RIEN n'est appliqué" "$(APPLIQUER "$TMPM/m3.sql" || true)"
# (d) sans la réserve de n_sup_
sed "/or p_id like 'n\\\\_sup\\\\_%'/d" "$MIGRATION" > "$TMPM/m4.sql"
if grep -q "or p_id like 'n\\\\_sup" "$TMPM/m4.sql" || ! grep -q "or p_id like 'n\\\\_sup" "$MIGRATION"; then echo "❌ mutation (d) non posée"; exit 1; fi
contient "mutation (d) — n_sup_ laissé aux clients : refusée" "RIEN n'est appliqué" "$(APPLIQUER "$TMPM/m4.sql" || true)"
# (f) sans la garde ON CONFLICT (red team, E) : la ligne d'autrui serait reprise
GARDE="where n.user_id = excluded.user_id and n.kind = excluded.kind and n.ref_id = excluded.ref_id and n.origine = 'serveur'"
grep -qF "$GARDE" "$MIGRATION" || { echo "❌ ancre de la mutation (f) introuvable"; exit 1; }
node -e 'const fs=require("fs");const [s,d,g]=process.argv.slice(1);fs.writeFileSync(d,fs.readFileSync(s,"utf8").split(g).join("where true"));' "$MIGRATION" "$TMPM/m5.sql" "$GARDE" 2>/dev/null \
  || awk -v g="$GARDE" '{ i = index($0, g); if (i) $0 = substr($0, 1, i - 1) "where true" substr($0, i + length(g)); print }' "$MIGRATION" > "$TMPM/m5.sql"
grep -qF "$GARDE" "$TMPM/m5.sql" && { echo "❌ mutation (f) non posée"; exit 1; }
contient "mutation (f) — garde ON CONFLICT retirée : refusée" "RIEN n'est appliqué" "$(APPLIQUER "$TMPM/m5.sql" || true)"
# (e) la garde : un avis de suppression DIFFÉRENT de celui relu n'est pas remplacé
Q "create or replace function public.events_prevenir_suppression() returns trigger language plpgsql security definer set search_path to '' as \$f\$ begin return old; end \$f\$;" >/dev/null
contient "garde — un corps inconnu de l'avis de suppression : rien appliqué" "corps différent de celui relu" "$(APPLIQUER "$MIGRATION" || true)"
verifier "garde : la fonction n'existe toujours pas" "" "$(Q "select to_regprocedure('public.prevenir_inscrits_activite(text, text, text, text)');")"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create or replace function public.events_prevenir_suppression() returns trigger language plpgsql security definer set search_path to '' as $f$
declare
  orga text := coalesce(old.organizer_id, old.author_id);
  nom  text;
begin
  if orga is null then return old; end if;
  select p.username into nom from public.profiles p where p.id = orga;
  begin
    perform set_config('passio.notification_serveur', '1', true);
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen)
    select 'n_sup_' || left(md5(old.id || a.user_id), 20), a.user_id, 'event_cancelled', orga, old.id,
           public.passio_echapper_html(coalesce(nullif(btrim(nom), ''), 'Quelqu''un'))
             || ' a supprimé « ' || public.passio_echapper_html(left(coalesce(old.title, 'une activité'), 60)) || ' »',
           false
      from public.event_attendees a
     where a.event_id = old.id and a.user_id is distinct from orga
    on conflict (id) do nothing;
    perform set_config('passio.notification_serveur', '', true);
  exception when others then
    perform set_config('passio.notification_serveur', '', true);
  end;
  return old;
end
$f$;
SQL
verifier "garde : l'avis de suppression d'origine est remis" "b9767e8210b46598ff8a68437acafd3b" "$(H 'public.events_prevenir_suppression()')"

echo "── ③ APPLICATION, PUIS REJEU ──────────────────────────────────────────"
rc=0; sortie="$(APPLIQUER "$MIGRATION")" || rc=$?
verifier "la migration s'applique, verdict sans ÉCHEC" "0|0" "$rc|$(printf '%s' "$sortie" | grep -c ECHEC || true)"
[ "$rc" -eq 0 ] || printf '%s\n' "$sortie"
rc=0; sortie="$(APPLIQUER "$MIGRATION")" || rc=$?
verifier "la migration se rejoue (ses propres corps sont acceptés par les gardes)" "0" "$rc"
[ "$rc" -eq 0 ] || printf '%s\n' "$sortie"
REMISE

echo "── ④ DE L'EXTÉRIEUR, SOUS authenticated ──────────────────────────────"
peupler ev_v
verifier "une activité non annulée ne s'annonce pas annulée" "pas_annulee" "$(PREV "$ORGA" ev_v event_cancelled clevillage01)"
Q "update public.events set status = 'cancelled' where id = 'ev_v';" >/dev/null
# 99 à prévenir + le compte en suppression, compté sans ligne (son écart le trahirait).
verifier "l'annulation : 100 sur 100 (au-delà des 60 du plafond)" "100/100" "$(PREV "$ORGA" ev_v event_cancelled clevillage01)"
verifier "99 lignes, une par personne" "99|99" \
  "$(Q "select count(*) || '|' || count(distinct user_id) from public.notifications where ref_id = 'ev_v' and kind = 'event_cancelled';")"
verifier "jamais l'organisatrice, ni qui l'a bloquée, ni un compte en suppression, ni « ne vient pas »" "0" \
  "$(Q "select count(*) from public.notifications where ref_id = 'ev_v' and user_id in ('$ORGA', '$BLOQ', '$SUPPR', '$(uidn 100)');")"
verifier "d'origine serveur, au nom de l'organisatrice, nom échappé, phrase fixe" "serveur|$ORGA|Léa &amp; co a annulé un événement auquel tu participais" \
  "$(Q "select distinct origine || '|' || from_id || '|' || content from public.notifications where ref_id = 'ev_v' and kind = 'event_cancelled';")"
Q "update public.notifications set seen = true where ref_id = 'ev_v';" >/dev/null
LUES() { Q "select count(*) || '|' || count(*) filter (where not seen) from public.notifications where ref_id = '$1' and kind = 'event_cancelled';"; }
# Red team B : sans réactivation, une nouvelle annulation ne touche RIEN (ni ligne, ni « non lu »).
verifier "ré-annuler SANS réactivation (clé neuve) : 100 comptées, aucune ligne de plus, rien ne redevient non lu" "100/100|99|0" \
  "$(PREV "$ORGA" ev_v event_cancelled clevillage09)|$(LUES ev_v)"
Q "update public.events set status = 'active' where id = 'ev_v';" >/dev/null
Q "update public.events set status = 'cancelled' where id = 'ev_v';" >/dev/null
verifier "réactivée puis ré-annulée : les 99 redeviennent non lues, sans ligne de plus" "100/100|99|99" \
  "$(PREV "$ORGA" ev_v event_cancelled clevillage10)|$(LUES ev_v)"
verifier "la 4ᵉ annulation de l'heure sur la même activité est refusée" "debit_activite" "$(PREV "$ORGA" ev_v event_cancelled clevillage11)"
verifier "la date de réactivation ne se pose pas par un client (réécrite à l'UPDATE)" "1" \
  "$(Q "update public.events set reactivee_le = now() + interval '1 year' where id = 'ev_v'; select count(*) from public.events where id = 'ev_v' and reactivee_le < now() + interval '1 day';" | tail -1)"
verifier "la diffusion n'a pas consommé le plafond ordinaire de l'organisatrice" "" \
  "$(Q "select n from public.debit_ecritures where table_nom = 'notifications' and source = '$ORGA';")"
peupler ev_m
verifier "message : échappé, borné à 200 avant échappement" "100/100|Léa &amp; co &lt;b&gt;RDV&lt;/b&gt; à l&#39;entrée nord|200" \
  "$(PREV "$ORGA" ev_m event_update clevillage02 "  <b>RDV</b> à l''entrée nord  ")|$(Q "select content from public.notifications where ref_id = 'ev_m' and kind = 'event_update' limit 1;")|$(PREV "$ORGA" ev_m event_update clevillage03 "$(printf 'x%.0s' $(seq 1 300))" >/dev/null; Q "select max(char_length(content)) - char_length('Léa &amp; co ') from public.notifications where ref_id = 'ev_m' and kind = 'event_update';")"
verifier "le rejeu d'un même message (même clé) n'ajoute aucune ligne" "100/100|99" \
  "$(PREV "$ORGA" ev_m event_update clevillage02 "  <b>RDV</b> à l''entrée nord  ")|$(Q "select count(*) from public.notifications where ref_id = 'ev_m' and kind = 'event_update' and content like '%RDV%';")"
peupler ev_q
verifier "200 guillemets (1 200 caractères échappés) : refusé AVANT toute écriture" "message_trop_long|0" \
  "$(AUTH "$ORGA" "select public.prevenir_inscrits_activite('ev_q', 'event_update', 'clevillage12', repeat('\"', 200))->>'motif';")|$(Q "select count(*) from public.notifications where ref_id = 'ev_q';")"
peupler ev_passee "$ORGA" "now() - interval '5 days'"
verifier "une activité terminée depuis plus de 2 jours n'est plus une liste de diffusion" "activite_terminee" "$(PREV "$ORGA" ev_passee event_update clevillage13)"
peupler ev_y "$Y"
verifier "sans admission, pas de mise à jour aux inscrits" "admission_requise" "$(PREV "$Y" ev_y event_update clevillage14)"
verifier "un message n'accompagne pas une annulation" "message_hors_genre" "$(PREV "$ORGA" ev_v event_cancelled clevillage04 "Venez quand même")"
verifier "une étrangère ne prévient personne" "non_autorise" "$(PREV "$X" ev_v event_update clevillage05)"
verifier "une clé mal formée est refusée" "cle_invalide" "$(PREV "$ORGA" ev_v event_update "court")"
verifier "un genre inconnu est refusé" "genre_inconnu" "$(PREV "$ORGA" ev_v like clevillage06)"
verifier "une activité inconnue" "introuvable" "$(PREV "$ORGA" ev_inconnue event_update clevillage07)"
contient "anon ne peut pas appeler la fonction" "permission denied" "$(ANON "select public.prevenir_inscrits_activite('ev_v', 'event_update', 'clevillage08');")"
Q "insert into public.comptes_en_suppression (user_id, statut) values ('$X', 'en_cours');" >/dev/null
verifier "un compte en suppression ne diffuse rien" "compte_en_suppression" "$(PREV "$X" ev_v event_update clevillage15)"
Q "delete from public.comptes_en_suppression where user_id = '$X';" >/dev/null
# Red team D : une date absente, une création de plus d'un an — la date d'une activité se réécrit.
peupler ev_sans_date "$ORGA" "null"
verifier "une activité sans date ne reçoit pas de mise à jour" "activite_sans_date" "$(PREV "$ORGA" ev_sans_date event_update clevillage16)"
peupler ev_ancienne
Q "update public.events set created_at = now() - interval '2 years' where id = 'ev_ancienne';" >/dev/null
verifier "une activité créée il y a plus d'un an (date repoussée) ne reçoit plus de mise à jour" "activite_trop_ancienne" "$(PREV "$ORGA" ev_ancienne event_update clevillage17)"
# Red team C : une co-organisatrice qui annule après réactivation prévient tout le monde, en son nom.
CO=ffffffff-ffff-4fff-8fff-ffffffffffff
Q "insert into public.profiles (id, username) values ('$CO', 'Coline');" >/dev/null
peupler ev_co
Q "update public.events set co_organizers = '[\"$CO\"]'::jsonb, status = 'cancelled' where id = 'ev_co';" >/dev/null
# Pour Coline, l'organisatrice et BLOQ (qui n'a bloqué que l'organisatrice) sont des inscrites : 101 + 1 compte en suppression.
verifier "l'organisatrice annule (100), puis la co-organisatrice SANS réactivation : 2 nouvelles personnes, rien de repris" "100/100|102/102|101|99" \
  "$(PREV "$ORGA" ev_co event_cancelled clecoorg01)|$(PREV "$CO" ev_co event_cancelled clecoorg02)|$(Q "select count(*) || '|' || count(*) filter (where from_id = '$ORGA') from public.notifications where ref_id = 'ev_co' and kind = 'event_cancelled';")"
Q "update public.events set status = 'active' where id = 'ev_co';" >/dev/null
Q "update public.events set status = 'cancelled' where id = 'ev_co';" >/dev/null
verifier "après réactivation, la co-organisatrice ré-annule : les 101 avis passent à son nom, non lus" "102/102|101|101|101" \
  "$(PREV "$CO" ev_co event_cancelled clecoorg03)|$(Q "select count(*) || '|' || count(*) filter (where from_id = '$CO') || '|' || count(*) filter (where not seen) from public.notifications where ref_id = 'ev_co' and kind = 'event_cancelled';")"
# Red team E : la garde ON CONFLICT — une ligne d'une autre personne et une ligne d'origine client,
# posées aux identifiants de deux inscrits d'une activité réactivée, ne sont jamais reprises.
Q "insert into public.events (id, organizer_id, author_id, title, status, date_at) values ('ev_g', '$ORGA', '$ORGA', 'G', 'active', now() + interval '1 day');
   insert into public.event_attendees (event_id, user_id) values ('ev_g', '$(uidn 1)'), ('ev_g', '$(uidn 2)');
   insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values
     ('n_pi_' || left(md5('ev_g|event_cancelled|$(uidn 1)'), 20), '$(uidn 2)', 'event_cancelled', '$X', 'ev_g', 'intact'),
     ('n_pi_' || left(md5('ev_g|event_cancelled|$(uidn 2)'), 20), '$(uidn 2)', 'event_cancelled', '$X', 'ev_g', 'intact');
   update public.events set status = 'cancelled' where id = 'ev_g';" >/dev/null
Q "update public.events set status = 'active' where id = 'ev_g';" >/dev/null
Q "update public.events set status = 'cancelled' where id = 'ev_g';" >/dev/null
verifier "garde ON CONFLICT : 0 prévenue sur 2, les deux lignes occupantes intactes (contenu, émetteur, origine client)" "0/2|2" \
  "$(PREV "$ORGA" ev_g event_cancelled clegarde01)|$(Q "select count(*) from public.notifications where ref_id = 'ev_g' and content = 'intact' and from_id = '$X' and origine = 'client';")"
# Red team A : deux appels CONCURRENTS sur une activité qui a déjà 2 diffusions dans l'heure. Le
# premier tient sa transaction ouverte 5 s après son appel ; le second, lancé pendant, doit attendre
# le verrou puis lire 3 : refusé. Sans verrou, il lisait 2 et passait (4 diffusions).
Q "delete from public.debit_ecritures where table_nom = 'prevenir_inscrits';" >/dev/null
peupler ev_conc
PREV "$ORGA" ev_conc event_update cleconc01 >/dev/null
PREV "$ORGA" ev_conc event_update cleconc02 >/dev/null
( AUTH "$ORGA" "select public.prevenir_inscrits_activite('ev_conc', 'event_update', 'cleconc03')->>'ok'; select pg_sleep(5);" > "$TMPM/conc1.txt" ) &
PID_CONC=$!
sleep 2
second="$(PREV "$ORGA" ev_conc event_update cleconc04)"
wait "$PID_CONC" || true
verifier "concurrence : la 1ʳᵉ passe, la 2ᵈᵉ (lancée pendant) est refusée ; 3 diffusions, pas 4" "true|debit_activite|3" \
  "$(head -1 "$TMPM/conc1.txt")|$second|$(Q "select sum(n) from public.debit_ecritures where table_nom = 'prevenir_activite' and source = 'ev_conc|event_update';")"
# Débit par compte : 20 diffusions par minute, toutes activités confondues. 21 activités d'une
# personne, 21 appels dans UNE requête (même minute du compteur, quelle que soit la vitesse du poste).
Q "delete from public.debit_ecritures where table_nom = 'prevenir_inscrits';
   insert into public.events (id, organizer_id, author_id, title, status, date_at) select 'ev_d' || k, '$ORGA', '$ORGA', 'D', 'active', now() + interval '1 day' from generate_series(1, 21) k;
   insert into public.event_attendees (event_id, user_id) select 'ev_d' || k, '$(uidn 1)' from generate_series(1, 21) k;" >/dev/null
verifier "20 diffusions par minute et par compte passent, la 21ᵉ est refusée" "20|debit" \
  "$(AUTH "$ORGA" "select count(*) filter (where (j->>'ok')::boolean) || '|' || max(j->>'motif') filter (where k = 21)
                     from (select k, public.prevenir_inscrits_activite('ev_d' || k, 'event_update', 'clevillage-d' || k) as j
                             from generate_series(1, 21) k) s;")"
# Budget du jour en LIGNES : 6 000 pour un compte installé.
Q "delete from public.debit_ecritures where table_nom = 'prevenir_inscrits';
   update public.debit_jour set n = 5950 where cle = 'notifications_diffusion' and source = '$ORGA';" >/dev/null
peupler ev_b
verifier "le budget du jour compte les LIGNES (5 950 + 100 > 6 000) : refusé, rien d'écrit" "debit|0" \
  "$(PREV "$ORGA" ev_b event_update clevillage16)|$(Q "select count(*) from public.notifications where ref_id = 'ev_b';")"
# Le plafond des notifications ORDINAIRES tient toujours : 60 par minute.
Q "delete from public.debit_ecritures where table_nom = 'notifications';" >/dev/null
ecrits="$(AUTH "$X" "do \$r\$ declare i int; begin for i in 1..61 loop begin insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('zz_cl_' || i, '00000000-0000-4000-8000-' || lpad(i::text, 12, '0'), 'like', '$X', 'p1', 'x'); exception when others then null; end; end loop; end \$r\$;" >/dev/null; Q "select count(*) from public.notifications where id like 'zz\_cl\_%';")"
verifier "le plafond des écritures du CLIENT est intact : 60 sur 61" "60" "$ecrits"
verifier "après : un client ne peut plus occuper un identifiant n_sup_ ni n_pi_" "REFUSE|REFUSE" \
  "$(for id in n_sup_occupe2 n_pi_occupe; do _r="$(AUTH "$Y" "insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('$id', '$ORGA', 'like', '$Y', 'p1', 'x');")"; printf '%s' "$_r" | grep -qi error && printf 'REFUSE|' || printf 'OK|'; done | sed 's/|$//')"
# Une origine « serveur » sans diffusion reste comptée (follows_notifier, mentions…).
Q "delete from public.debit_ecritures;" >/dev/null
verifier "une ligne serveur HORS diffusion reste comptée" "1" \
  "$(Q "select set_config('passio.notification_serveur', '1', false); insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('zz_srv', '$X', 'follow', '$ORGA', '$ORGA', 'x'); select n from public.debit_ecritures where table_nom = 'notifications' and source = '$ORGA';" | tail -1)"
# La suppression d'une grande activité prévient TOUT LE MONDE.
REMISE
peupler ev_sup
# Sans `auth.uid()` (purge d'administration) : le blocage se lit par rapport à l'ORGANISATION.
verifier "les réglages de diffusion ne survivent pas à la suppression" "|" "$(Q "delete from public.events where id = 'ev_sup'; select coalesce(current_setting('passio.diffusion_inscrits', true), '') || '|' || coalesce(current_setting('passio.notification_serveur', true), '');" | tail -1)"
verifier "après : supprimer une activité de 102 inscrits en prévient 99 (ni « ne vient pas », ni qui a bloqué, ni le compte en suppression)" "99" \
  "$(Q "select count(*) from public.notifications where ref_id = 'ev_sup' and id like 'n\_sup\_%';")"

echo
echo "Résultat : $ok OK · $ko échec(s)"
[ "$ko" -eq 0 ]
