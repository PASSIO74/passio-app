#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_promotion_discrete_vues_2026-11-03.sql (R24, R26)
#
# PostgreSQL jetable, socle = la PRODUCTION du 2026-11-03 : `events`,
# `event_attendees`, `notifications`, `event_checkin_secrets` avec leurs
# déclencheurs de production (capacité sous verrou, admission, figeage,
# barrière de suppression, débit, origine des notifications, secret de
# pointage), les droits de Supabase (GRANT ALL, puis C-03 sur les TABLES
# seules), les trois vues `security_invoker`, `auth.uid()` de production — et
# `promouvoir_attente` prise dans le RETOUR ARRIÈRE de la migration, dont on
# contrôle l'empreinte contre celle mesurée au canal ① (md5(prosrc)) : le socle
# EST la définition de production, et le retour arrière la rend à l'octet près.
# `organise_activite` n'y est pas (absente en production ce jour-là).
#
# On MESURE D'ABORD le défaut : un inconnu apprend QUI est promu ; l'organisateur
# désigné (`organizer_id`) ne peut pas promouvoir à la main ; sur une activité
# sans auteur, un inconnu désigne le promu ; un rôle client pose un déclencheur
# INSTEAD OF sur une vue qui n'est pas à lui. Le verdict de la migration,
# RÉINJECTÉ sur la définition de production, rougit. Puis on applique, on rejoue,
# on éprouve le comportement sous les vrais rôles, l'absence de trace du décor
# du verdict, les vues, le retour arrière (empreintes de la fonction ET des
# droits), et quatre mutations : chacune rougit la ligne du verdict qui la vise.
#
#   bash tests/sql/migration-promotion-discrete-vues.test.sh
#
# Prérequis : PostgreSQL 14+ (binaires serveur). Ne touche AUCUNE base réelle.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_promotion_discrete_vues_2026-11-03.sql"
C04="$RACINE/migrations/migration_participants_visibilite_2026-11-03.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v python3 >/dev/null || { echo "❌ python3 introuvable (mutations du banc)"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }
[ -f "$C04" ] || { echo "❌ migration C-04 introuvable : $C04"; exit 1; }

# Empreinte mesurée en production le 2026-11-03 (canal ①) : md5(prosrc), 4 154 caractères.
MD5_PROD_PROMOUVOIR=1a4a2c4dcc01309b6235d1a2c42c3383

PORT=$(( 6450 + RANDOM % 120 ))
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

DB=promotion
SQLDIR="$BASE/sql"; mkdir -p "$SQLDIR"; chmod 755 "$SQLDIR"

Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
QD()   { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1; }
# Une promotion sous une identité : la réponse JSON, telle que la base la rend.
RPC()  { AUTH "$1" "select public.promouvoir_attente('$2'${3:-})::text;"; }
RSVP() { Q "select rsvp from public.event_attendees where event_id='$1' and user_id='$2';"; }
# Applique un fichier (migration, mutation) à une base : rend le tableau de verdict, une ligne « contrôle§valeur » par contrôle.
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -tA -F '§' -q -v ON_ERROR_STOP=1 -f "$2" 2>&1; }
compte_verdict() { printf '%s/%s' "$(printf '%s\n' "$1" | grep -c '§OK$' || true)" "$(printf '%s\n' "$1" | grep -c '§ECHEC' || true)"; }
# La valeur d'UNE ligne du verdict, désignée par un fragment de son libellé.
ligne() { printf '%s\n' "$1" | grep -F -- "$2" | head -1 | awk -F'§' '{ v = $NF; sub(/ —.*/, "", v); print v }'; }
# Le retour arrière de la migration (les lignes « --| », une ligne vide s'écrit « --| » nu).
RETOUR_ARRIERE() { sed -n -e 's/^--| //p' -e 's/^--|$//p' "$MIGRATION"; }
# Les droits d'anon et d'authenticated sur les trois vues (aclexplode : concédant et transmission compris).
DROITS_VUES() { QD "${1:-$DB}" "select coalesce(string_agg(x, ' ' order by x), '-') from (
    select c.relname || ':' || a.grantee::regrole::text || ':' || a.privilege_type || ':' || a.grantor::regrole::text || ':' || a.is_grantable::text as x
      from pg_class c cross join lateral aclexplode(c.relacl) a
     where c.oid in ('public.client_errors_par_heure'::regclass, 'public.client_errors_top_24h'::regclass, 'public.telemetry_last24h'::regclass)
       and a.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)) s;"; }
# Les droits sur les TABLES de public : la migration n'y touche pas.
DROITS_TABLES() { Q "select md5(coalesce(string_agg(x, ' ' order by x), '-')) from (
    select c.relname || ':' || a.grantee::regrole::text || ':' || a.privilege_type as x
      from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join lateral aclexplode(c.relacl) a
     where n.nspname = 'public' and c.relkind in ('r', 'p')) s;"; }
HORS_RLS_VUE() { Q "select has_table_privilege('$1', 'public.$2', 'TRUNCATE') || '|' || has_table_privilege('$1', 'public.$2', 'REFERENCES')
                      || '|' || has_table_privilege('$1', 'public.$2', 'TRIGGER');" | sed 's/true/t/g; s/false/f/g'; }

AUT=11111111-1111-4111-8111-111111111111   # l'auteur
ORG=22222222-2222-4222-8222-222222222222   # l'organisateur désigné (organizer_id) : ni auteur, ni co-organisateur
COO=33333333-3333-4333-8333-333333333333   # le co-organisateur
X=44444444-4444-4444-8444-444444444444     # un inconnu
Y=55555555-5555-4555-8555-555555555555     # un second inconnu
W1=a1a1a1a1-0000-4000-8000-000000000001    # ┐
W2=a2a2a2a2-0000-4000-8000-000000000002    # │ la liste d'attente, dans l'ordre d'arrivée
W3=a3a3a3a3-0000-4000-8000-000000000003    # │
W4=a4a4a4a4-0000-4000-8000-000000000004    # │
W5=a5a5a5a5-0000-4000-8000-000000000005    # ┘
V1=b1b1b1b1-0000-4000-8000-000000000001
V2=b2b2b2b2-0000-4000-8000-000000000002
V3=b3b3b3b3-0000-4000-8000-000000000003

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }
nom() { printf '{"ok": true, "user_id": "%s"}' "$1"; }
SEUL='{"ok": true}'

# ── LE SOCLE : la production du 2026-11-03, sans `organise_activite` ──────────
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database socle" >/dev/null
psql -h "$BASE" -p "$PORT" -U postgres -d socle -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon;
create role authenticated;
create role service_role;
create schema auth;
-- auth.uid() de production (pg_get_functiondef, 2026-11-03).
create function auth.uid() returns uuid language sql stable as $fn$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$fn$;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

create table public.events (id text primary key, author_id text, organizer_id text, title text, status text not null default 'active',
  max_attendees integer constraint events_max_attendees_min1 check (max_attendees is null or max_attendees >= 1),
  date_at timestamp, end_at timestamp, co_organizers jsonb not null default '[]', recurrence text not null default 'none',
  passion_id text, created_at timestamp default now());
create table public.event_attendees (event_id text not null references public.events(id) on delete cascade, user_id text not null,
  created_at timestamptz default now(), rsvp text not null default 'going'
  constraint event_attendees_rsvp_valeurs check (rsvp in ('going', 'maybe', 'declined', 'waitlist')),
  checked_in_at timestamp, rating smallint, feedback text, rated_at timestamptz, primary key (event_id, user_id));
create table public.notifications (id text primary key, user_id text, kind text, from_id text, ref_id text, content text,
  seen boolean default false, created_at timestamp default now(),
  origine text not null default 'client' constraint notifications_origine_check check (origine in ('client', 'serveur')));
create table public.event_checkin_secrets (event_id text primary key, secret text not null, created_at timestamptz not null default now());
create table public.comptes_en_suppression (user_id text primary key, statut text not null);
create table public.access_policies (key text primary key, enabled boolean);
insert into public.access_policies values ('irl_adult_only', true);
create table public.user_safety (user_id text primary key, majority_at date);
create table public.client_errors (id bigserial primary key, created_at timestamptz default now(), uid text, message text);
create table public.telemetry_events (id bigserial primary key, received_at timestamptz default now(), type text, severity text);
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.notifications enable row level security;
alter table public.client_errors enable row level security;
alter table public.telemetry_events enable row level security;
create policy "lecture" on public.events for select using (true);
create policy "lecture" on public.event_attendees for select to authenticated using (true);
create policy "insert_own" on public.event_attendees for insert with check (user_id = (select auth.uid())::text);
create policy "update_own" on public.event_attendees for update using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text);
create policy "notif_lecture" on public.notifications for select using (user_id = (select auth.uid())::text);
create policy "Insert erreurs" on public.client_errors for insert with check (true);
create policy "telemetry_insert_own" on public.telemetry_events for insert with check (true);

-- Les trois vues, définitions de production (pg_get_viewdef, 2026-11-03).
create view public.client_errors_par_heure with (security_invoker = on) as
 SELECT date_trunc('hour'::text, created_at) AS heure, count(*) AS erreurs
   FROM public.client_errors WHERE created_at > (now() - '7 days'::interval)
  GROUP BY (date_trunc('hour'::text, created_at)) ORDER BY (date_trunc('hour'::text, created_at)) DESC;
create view public.client_errors_top_24h with (security_invoker = on) as
 SELECT "left"(COALESCE(message, '(sans message)'::text), 200) AS message, count(*) AS occurrences,
    count(DISTINCT uid) AS utilisateurs, max(created_at) AS derniere_occurrence
   FROM public.client_errors WHERE created_at > (now() - '24:00:00'::interval)
  GROUP BY ("left"(COALESCE(message, '(sans message)'::text), 200)) ORDER BY (count(*)) DESC;
create view public.telemetry_last24h with (security_invoker = on) as
 SELECT type, severity, count(*) AS n, max(received_at) AS last_seen
   FROM public.telemetry_events WHERE received_at > (now() - '24:00:00'::interval) GROUP BY type, severity;

-- Les droits de Supabase (GRANT ALL), puis C-03 sur les TABLES seules — l'état mesuré.
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke truncate, references, trigger on table public.%I from anon, authenticated', r.relname);
    if current_setting('server_version_num')::int >= 170000 then
      execute format('revoke maintain on table public.%I from anon, authenticated', r.relname);
    end if;
  end loop;
end $$;

-- Déclencheurs de production (pg_get_functiondef, 2026-11-03).
create function public.event_attendees_capacite_gardee() returns trigger language plpgsql security definer set search_path to '' as $t$
declare ev record; inscrits integer;
begin
  if auth.uid() is null then return new; end if;
  if new.rsvp is distinct from 'going' then return new; end if;
  if tg_op = 'UPDATE' and old.rsvp = 'going' then return new; end if;
  select id, status, max_attendees, end_at, date_at into ev from public.events where id = new.event_id for update;
  if not found then raise exception 'activite_introuvable' using errcode = 'P0001'; end if;
  if ev.status = 'cancelled' then raise exception 'activite_annulee' using errcode = 'P0001'; end if;
  if coalesce(ev.end_at, ev.date_at + interval '3 hours') < now() then raise exception 'activite_passee' using errcode = 'P0001'; end if;
  if ev.max_attendees is not null then
    select count(*) into inscrits from public.event_attendees a where a.event_id = new.event_id and a.rsvp = 'going' and a.user_id <> new.user_id;
    if inscrits >= ev.max_attendees then raise exception 'activite_complete' using errcode = 'P0001'; end if;
  end if;
  return new;
end $t$;
create trigger trg_event_attendees_capacite before insert or update on public.event_attendees
  for each row execute function public.event_attendees_capacite_gardee();
create function public.adult_access_enforced() returns boolean language sql stable security definer set search_path to '' as $f$
  SELECT COALESCE((SELECT p.enabled FROM public.access_policies p WHERE p.key = 'irl_adult_only'), TRUE)
$f$;
create function public.is_adult_declared() returns boolean language sql stable security definer set search_path to '' as $f$
  SELECT CASE WHEN auth.uid() IS NULL THEN FALSE
    ELSE COALESCE((SELECT s.majority_at <= CURRENT_DATE FROM public.user_safety s WHERE s.user_id = (auth.uid())::text), FALSE) END
$f$;
create function public.adult_access_allowed() returns boolean language sql stable security definer set search_path to '' as $f$
  SELECT CASE WHEN auth.uid() IS NULL THEN FALSE WHEN NOT public.adult_access_enforced() THEN TRUE ELSE public.is_adult_declared() END
$f$;
create function public.event_attendees_admission_gardee() returns trigger language plpgsql security definer set search_path to '' as $t$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.adult_access_allowed() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.checked_in_at := NULL; NEW.rating := NULL; NEW.feedback := NULL; NEW.rated_at := NULL;
  ELSE
    NEW.checked_in_at := OLD.checked_in_at; NEW.rating := OLD.rating; NEW.feedback := OLD.feedback; NEW.rated_at := OLD.rated_at;
    NEW.event_id := OLD.event_id; NEW.user_id := OLD.user_id; NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END $t$;
create trigger trg_event_attendees_admission before insert or update on public.event_attendees
  for each row execute function public.event_attendees_admission_gardee();
create function public.event_attendees_figes() returns trigger language plpgsql security definer set search_path to '' as $t$
begin
  if auth.uid() is null then return new; end if;
  if new.event_id is distinct from old.event_id then raise exception 'inscription_activite_figee' using errcode = 'P0001'; end if;
  if new.user_id is distinct from old.user_id then raise exception 'inscription_compte_fige' using errcode = 'P0001'; end if;
  return new;
end $t$;
create trigger trg_event_attendees_figes before update on public.event_attendees for each row execute function public.event_attendees_figes();
create function public.refuser_ecriture_compte_en_suppression() returns trigger language plpgsql security definer set search_path to '' as $t$
declare col text; val text; ligne jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    val := ligne ->> col;
    if val is not null and exists (select 1 from public.comptes_en_suppression c where c.user_id = val and c.statut in ('en_cours', 'purgee', 'supprimee')) then
      raise exception 'new row violates row-level security policy for table "%"', tg_table_name using errcode = '42501';
    end if;
  end loop;
  return new;
end $t$;
create trigger zz_barriere_suppression before insert or update on public.event_attendees for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');
create trigger zz_barriere_suppression before insert or update on public.events for each row execute function public.refuser_ecriture_compte_en_suppression('author_id');
create trigger zz_barriere_suppression before insert or update on public.notifications for each row execute function public.refuser_ecriture_compte_en_suppression('from_id', 'user_id');
create function public.rate_limit_insert() returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $t$
DECLARE user_col text := TG_ARGV[0]; max_per_min int := TG_ARGV[1]::int; uid text; cnt int;
BEGIN
  NEW.created_at := now();
  EXECUTE format('SELECT ($1).%I', user_col) INTO uid USING NEW;
  IF uid IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I = $1 AND created_at > now() - interval ''1 minute''', TG_TABLE_SCHEMA, TG_TABLE_NAME, user_col) INTO cnt USING uid;
  IF cnt >= max_per_min THEN RAISE EXCEPTION 'rate limit: max % insertions/minute sur %', max_per_min, TG_TABLE_NAME USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $t$;
create trigger trg_rate_limit before insert on public.events for each row execute function public.rate_limit_insert('author_id', '15');
create trigger trg_rate_limit before insert on public.notifications for each row execute function public.rate_limit_insert('from_id', '60');
create function public.notifications_origine() returns trigger language plpgsql security definer set search_path to '' as $t$
begin
  new.origine := case when current_setting('passio.notification_serveur', true) = '1' then 'serveur' else 'client' end;
  return new;
end $t$;
create trigger trg_notifications_origine before insert on public.notifications for each row execute function public.notifications_origine();
-- Secret de pointage : le générateur de production lit `extensions.gen_random_bytes` (absent ici) — remplacé, le déclencheur est le même.
create function public.checkin_secret_generer() returns text language sql set search_path to '' as $f$ select upper(left(md5(random()::text), 6)) $f$;
create function public.events_poser_secret_pointage() returns trigger language plpgsql security definer set search_path to '' as $t$
begin
  insert into public.event_checkin_secrets (event_id, secret) values (new.id, public.checkin_secret_generer()) on conflict (event_id) do nothing;
  return new;
end $t$;
create trigger trg_events_secret_pointage after insert on public.events for each row execute function public.events_poser_secret_pointage();

-- Un déclencheur que n'importe quel rôle client pourrait poser, s'il tient TRIGGER (R26).
create function public.f_banc_vue() returns trigger language plpgsql as $t$ begin return null; end $t$;
grant execute on function public.f_banc_vue() to authenticated;
SQL
# La promotion de PRODUCTION : prise dans le retour arrière de la migration, et l'ACL mesurée.
RETOUR_ARRIERE > "$SQLDIR/retour.sql"; chmod 644 "$SQLDIR/retour.sql"
psql -h "$BASE" -p "$PORT" -U postgres -d socle -q -v ON_ERROR_STOP=1 -f "$SQLDIR/retour.sql" >/dev/null
QD socle "revoke execute on function public.promouvoir_attente(text, text) from public, anon;
          grant execute on function public.promouvoir_attente(text, text) to authenticated, service_role;" >/dev/null
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB template socle" >/dev/null

echo "── ⓪ LE SOCLE EST LA PRODUCTION ; l'organisation est celle de C-04, à l'octet près ──"
verifier "promouvoir_attente du retour arrière = la définition de production, à l'octet près (md5(prosrc))" "$MD5_PROD_PROMOUVOIR" \
  "$(Q "select md5(prosrc) from pg_proc where oid = 'public.promouvoir_attente(text,text)'::regprocedure;")"
verifier "…et son ACL est celle de production (authenticated, service_role ; ni anon, ni PUBLIC)" "authenticated,postgres,service_role" \
  "$(Q "select string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text) from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.promouvoir_attente(text,text)'::regprocedure;")"
verifier "organise_activite est ABSENTE (comme en production le 2026-11-03)" "" "$(Q "select to_regprocedure('public.organise_activite(text)');")"
BLOC_ORGA='/^create or replace function public\.organise_activite(p_event_id text)$/,/^grant execute on function public\.organise_activite(text) to authenticated;$/p'
verifier "le bloc organise_activite de la migration est CELUI de C-04, à l'octet près (create, revoke, grant)" \
  "$(sed -n "$BLOC_ORGA" "$C04" | md5sum | cut -c1-32)" "$(sed -n "$BLOC_ORGA" "$MIGRATION" | md5sum | cut -c1-32)"
verifier "…et ce bloc n'est pas vide (15 lignes)" "15" "$(sed -n "$BLOC_ORGA" "$MIGRATION" | wc -l | tr -d ' ')"
for vue in client_errors_par_heure client_errors_top_24h telemetry_last24h; do
  verifier "avant : anon tient TRUNCATE | REFERENCES | TRIGGER sur $vue" "t|t|t" "$(HORS_RLS_VUE anon "$vue")"
  verifier "avant : authenticated aussi" "t|t|t" "$(HORS_RLS_VUE authenticated "$vue")"
done
verifier "avant : les TABLES ne les donnent plus (C-03)" "f|f|f" "$(HORS_RLS_VUE authenticated event_attendees)"
DROITS_AVANT="$(DROITS_VUES)"
TABLES_AVANT="$(DROITS_TABLES)"

echo "── ① LE DÉFAUT, MESURÉ AVANT, sur la définition de production ───────"
Q "insert into public.events (id, author_id, organizer_id, title, max_attendees, date_at, co_organizers) values
     ('ev_avant', '$AUT', '$ORG', 'Avant', 4, now() + interval '2 days', '[\"$COO\"]'),
     ('ev_sans_auteur', null, null, 'Sans auteur', 2, now() + interval '2 days', '[]');
   insert into public.event_attendees (event_id, user_id, rsvp, created_at) values
     ('ev_avant', '$W1', 'waitlist', now() - interval '5 hours'), ('ev_avant', '$W2', 'waitlist', now() - interval '4 hours'),
     ('ev_avant', '$W3', 'waitlist', now() - interval '3 hours'),
     ('ev_sans_auteur', '$W1', 'waitlist', now() - interval '5 hours');" >/dev/null
verifier "avant : un INCONNU déclenche la promotion automatique et apprend QUI est promu (W1)" "$(nom "$W1")" "$(RPC "$X" ev_avant)"
verifier "avant : l'ORGANISATEUR désigné (organizer_id) ne peut pas promouvoir à la main : non_autorise" '{"ok": false, "motif": "non_autorise"}' "$(RPC "$ORG" ev_avant ", '$W3'")"
verifier "…W3 attend toujours" "waitlist" "$(RSVP ev_avant "$W3")"
verifier "avant : sur une activité SANS AUTEUR, un inconnu DÉSIGNE le promu (moi <> null n'est jamais vrai)" "$(nom "$W1")" "$(RPC "$X" ev_sans_auteur ", '$W1'")"
verifier "avant : authenticated pose un déclencheur INSTEAD OF sur une vue qui n'est pas à lui" "OK" \
  "$(AUTH "$X" "create trigger t_banc instead of insert on public.telemetry_last24h for each row execute function public.f_banc_vue(); select 'OK';")"
Q "drop trigger t_banc on public.telemetry_last24h;" >/dev/null
Q "delete from public.events where id in ('ev_avant', 'ev_sans_auteur'); delete from public.notifications;" >/dev/null

# RÉINJECTION : la migration dont la promotion est la définition de PRODUCTION et
# dont le retrait des droits des vues est ôté. Son verdict doit rougir.
python3 - "$MIGRATION" "$SQLDIR/retour.sql" "$SQLDIR/reinjecte.sql" <<'PY'
import re, sys
mig, retour, sortie = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(mig, encoding="utf-8").read()
r = open(retour, encoding="utf-8").read()
prod = r[r.index("CREATE OR REPLACE FUNCTION public.promouvoir_attente"):r.index("$function$;") + len("$function$;")]
debut = s.index("create or replace function public.promouvoir_attente(")
fin = s.index("$function$;", debut) + len("$function$;")
s = s[:debut] + prod + s[fin:]
d = s.index("-- ── ③ R26"); f = s.index("-- ── ④ LE COMPORTEMENT")
s = s[:d] + s[f:]
open(sortie, "w", encoding="utf-8").write(s)
PY
chmod 644 "$SQLDIR/reinjecte.sql"
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database reinjecte template socle" >/dev/null
sortie_r="$(APPLIQUER reinjecte "$SQLDIR/reinjecte.sql")"
verifier "réinjection : la mesure s'exécute (activité synthétique, sous-transaction annulée)" "OK" "$(ligne "$sortie_r" "R24 · mesure exécutée")"
verifier "réinjection : « inconnu → {ok: true} SEULE » ROUGIT" "ECHEC" "$(ligne "$sortie_r" "AUTOMATIQUE, déclenchée par un inconnu")"
verifier "réinjection : « personne de la file non promue → {ok: true} seule » ROUGIT" "ECHEC" "$(ligne "$sortie_r" "qui n'est PAS la promue")"
verifier "réinjection : « CHOISIE par l'ORGANISATEUR : acceptée » ROUGIT" "ECHEC" "$(ligne "$sortie_r" "CHOISIE par l'ORGANISATEUR")"
verifier "réinjection : « s'en remet à organise_activite » ROUGIT" "ECHEC" "$(ligne "$sortie_r" "s'en remet à organise_activite")"
verifier "réinjection : « aucune relation ne donne TRUNCATE / REFERENCES / TRIGGER » ROUGIT" "ECHEC" "$(ligne "$sortie_r" "R26 · aucune relation")"
verifier "réinjection : ce qui n'a pas changé reste vert (promue nommée, organisation en automatique, choisie par un inconnu refusée, organise_activite, vues inertes)" "OK|OK|OK|OK|OK" \
  "$(ligne "$sortie_r" "déclenchée par la personne promue")|$(ligne "$sortie_r" "déclenchée par l'auteur")|$(ligne "$sortie_r" "CHOISIE par un inconnu")|$(ligne "$sortie_r" "organise_activite : auteur")|$(ligne "$sortie_r" "R26 · les trois vues restent")"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(APPLIQUER "$DB" "$MIGRATION")" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -8; exit 1; }
printf '%s\n' "$sortie" | sed 's/^/     │ /'
verifier "le tableau de verdict rend 17 OK et 0 ECHEC" "17/0" "$(compte_verdict "$sortie")"
sortie2="$(APPLIQUER "$DB" "$MIGRATION")" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -8; exit 1; }
verifier "rejeu : toujours 17 OK, 0 ECHEC" "17/0" "$(compte_verdict "$sortie2")"
verifier "organise_activite existe, et la promouvoir_attente en vigueur n'est plus celle de production" "1|f" \
  "$(Q "select (to_regprocedure('public.organise_activite(text)') is not null)::int || '|' || (md5(prosrc) = '$MD5_PROD_PROMOUVOIR') from pg_proc where oid = 'public.promouvoir_attente(text,text)'::regprocedure;" | sed 's/false/f/; s/true/t/')"

echo "── ③ LE COMPORTEMENT, SOUS LES VRAIS RÔLES ──────────────────────────"
Q "insert into public.events (id, author_id, organizer_id, title, max_attendees, date_at, co_organizers) values
     ('ev_b', '$AUT', '$ORG', 'Rando à quatre', 4, now() + interval '2 days', '[\"$COO\"]'),
     ('ev_c', '$AUT', '$ORG', 'Atelier à trois', 3, now() + interval '2 days', '[\"$COO\"]'),
     ('ev_sans_auteur', null, null, 'Sans auteur', 2, now() + interval '2 days', '[]'),
     ('ev_d', '$AUT', '$AUT', 'Une seule place', 1, now() + interval '2 days', '[]'),
     ('ev_ann', '$AUT', '$AUT', 'Annulée', 2, now() + interval '2 days', '[]'),
     ('ev_past', '$AUT', '$AUT', 'Passée', 2, now() - interval '2 days', '[]'),
     ('ev_libre', '$AUT', '$AUT', 'Sans capacité', null, now() + interval '2 days', '[]');
   update public.events set status = 'cancelled' where id = 'ev_ann';
   insert into public.event_attendees (event_id, user_id, rsvp, created_at) values
     ('ev_b', '$W1', 'waitlist', now() - interval '5 hours'), ('ev_b', '$W2', 'waitlist', now() - interval '4 hours'),
     ('ev_b', '$W3', 'waitlist', now() - interval '3 hours'), ('ev_b', '$W4', 'waitlist', now() - interval '2 hours'),
     ('ev_b', '$W5', 'waitlist', now() - interval '1 hour'),
     ('ev_c', '$V1', 'waitlist', now() - interval '3 hours'), ('ev_c', '$V2', 'waitlist', now() - interval '2 hours'),
     ('ev_c', '$V3', 'waitlist', now() - interval '1 hour'),
     ('ev_sans_auteur', '$W1', 'waitlist', now() - interval '1 hour'),
     ('ev_d', '$W1', 'waitlist', now() - interval '2 hours'), ('ev_d', '$W2', 'waitlist', now() - interval '1 hour'),
     ('ev_ann', '$W1', 'waitlist', now() - interval '1 hour'), ('ev_past', '$W1', 'waitlist', now() - interval '1 hour');" >/dev/null
verifier "un INCONNU déclenche : {\"ok\": true} SEUL — la place est donnée, pas son destinataire" "$SEUL" "$(RPC "$X" ev_b)"
verifier "…et c'est bien la plus ancienne de la file (W1) qui est promue" "going|waitlist" "$(RSVP ev_b "$W1")|$(RSVP ev_b "$W2")"
verifier "…la réponse ne porte AUCUNE autre clé" "ok" "$(AUTH "$Y" "select string_agg(k, ',') from jsonb_object_keys(public.promouvoir_attente('ev_b')) k;")"
verifier "…(ce second appel, d'un autre inconnu, a promu W2 sans la nommer)" "going" "$(RSVP ev_b "$W2")"
verifier "W4, EN FILE mais pas la première (W3 l'est) : {\"ok\": true} seule" "$SEUL" "$(RPC "$W4" ev_b)"
verifier "…W3 est promue" "going" "$(RSVP ev_b "$W3")"
verifier "W4, désormais la première, déclenche : SON nom" "$(nom "$W4")" "$(RPC "$W4" ev_b)"
verifier "complet (4/4) : l'inconnu lit « complete » — un motif ne porte aucune identité" '{"ok": false, "motif": "complete"}' "$(RPC "$X" ev_b)"
AUTH "$W1" "update public.event_attendees set rsvp = 'declined' where event_id = 'ev_b' and user_id = '$W1';" >/dev/null
verifier "un inconnu qui DÉSIGNE (W5) : non_autorise" '{"ok": false, "motif": "non_autorise"}' "$(RPC "$X" ev_b ", '$W5'")"
verifier "…W5 attend toujours" "waitlist" "$(RSVP ev_b "$W5")"
verifier "l'ORGANISATEUR désigné (organizer_id, ni auteur ni co-organisateur) désigne W5 : acceptée, nommée" "$(nom "$W5")" "$(RPC "$ORG" ev_b ", '$W5'")"
verifier "le CO-ORGANISATEUR désigne V3 (pas la première) : acceptée, nommée" "$(nom "$V3")" "$(RPC "$COO" ev_c ", '$V3'")"
verifier "l'AUTEUR désigne V2 : acceptée, nommée" "$(nom "$V2")" "$(RPC "$AUT" ev_c ", '$V2'")"
verifier "l'auteur en AUTOMATIQUE : V1, nommée (l'organisation sait qui elle inscrit)" "$(nom "$V1")" "$(RPC "$AUT" ev_c)"
verifier "activité SANS AUTEUR : un inconnu qui désigne est refusé (le trou de « moi <> null » est fermé)" '{"ok": false, "motif": "non_autorise"}' "$(RPC "$X" ev_sans_auteur ", '$W1'")"
verifier "…mais il libère la file en automatique, sans apprendre le nom" "$SEUL|going" "$(RPC "$X" ev_sans_auteur)|$(RSVP ev_sans_auteur "$W1")"
verifier "organise_activite : auteur, organisateur, co-organisateur oui ; inconnu, promue non" "t|t|t|f|f" \
  "$(AUTH "$AUT" "select public.organise_activite('ev_b');" | sed 's/true/t/;s/false/f/')|$(AUTH "$ORG" "select public.organise_activite('ev_b');" | sed 's/true/t/;s/false/f/')|$(AUTH "$COO" "select public.organise_activite('ev_b');" | sed 's/true/t/;s/false/f/')|$(AUTH "$X" "select public.organise_activite('ev_b');" | sed 's/true/t/;s/false/f/')|$(AUTH "$W1" "select public.organise_activite('ev_b');" | sed 's/true/t/;s/false/f/')"
verifier "une notification d'origine serveur par personne promue, et une seule (ev_b : W1…W5, ev_c : V1…V3)" "8|8|8" \
  "$(Q "select count(*) || '|' || count(distinct user_id || ref_id) || '|' || count(*) filter (where origine = 'serveur') from public.notifications where ref_id in ('ev_b', 'ev_c');")"
verifier "motifs inchangés : annulee, passee, sans_capacite, introuvable" "annulee|passee|sans_capacite|introuvable" \
  "$(AUTH "$X" "select public.promouvoir_attente('ev_ann')->>'motif';")|$(AUTH "$X" "select public.promouvoir_attente('ev_past')->>'motif';")|$(AUTH "$X" "select public.promouvoir_attente('ev_libre')->>'motif';")|$(AUTH "$X" "select public.promouvoir_attente('ev_inconnue')->>'motif';")"
verifier "motifs inchangés : personne_en_attente, pas_en_attente (l'organisation désigne quelqu'un qui n'attend pas)" "personne_en_attente|pas_en_attente" \
  "$(Q "insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_libre', '$W1', 'going');" >/dev/null; Q "update public.events set max_attendees = 9 where id = 'ev_libre';" >/dev/null; AUTH "$X" "select public.promouvoir_attente('ev_libre')->>'motif';")|$(AUTH "$AUT" "select public.promouvoir_attente('ev_libre', '$W2')->>'motif';")"
verifier "sans session : non_connecte" "non_connecte" "$(Q "select public.promouvoir_attente('ev_b')->>'motif';")"
contient "anon : pas le droit d'exécuter promouvoir_attente" "permission denied" "$(ANON "select public.promouvoir_attente('ev_b');")"
contient "anon : pas le droit d'exécuter organise_activite" "permission denied" "$(ANON "select public.organise_activite('ev_b');")"
# Concurrence : deux inconnus sur la dernière place — une promotion, sans nom ; l'autre lit « complete ».
( AUTH "$X" "select pg_sleep(0.05); select public.promouvoir_attente('ev_d')::text;" > "$BASE/r1.txt" 2>&1 ) &
( AUTH "$Y" "select pg_sleep(0.05); select public.promouvoir_attente('ev_d')::text;" > "$BASE/r2.txt" 2>&1 ) &
wait
r1="$(tail -1 "$BASE/r1.txt")"; r2="$(tail -1 "$BASE/r2.txt")"
verifier "concurrence : {\"ok\": true} (sans nom) d'un côté, « complete » de l'autre" "$SEUL|{\"ok\": false, \"motif\": \"complete\"}" \
  "$(printf '%s\n%s\n' "$r1" "$r2" | sort -r | paste -sd'|')"
verifier "…une seule place donnée, à la plus ancienne (W1)" "1|going|waitlist" \
  "$(Q "select count(*) from public.event_attendees where event_id = 'ev_d' and rsvp = 'going';")|$(RSVP ev_d "$W1")|$(RSVP ev_d "$W2")"

echo "── ④ LE DÉCOR DU VERDICT NE LAISSE AUCUNE TRACE ─────────────────────"
verifier "aucune activité, inscription, notification ni secret de pointage du verdict (deux exécutions)" "0|0|0|0" \
  "$(Q "select (select count(*) from public.events where id like 'zz\_verdict\_r24\_%') || '|' || (select count(*) from public.event_attendees where event_id like 'zz\_verdict\_r24\_%')
        || '|' || (select count(*) from public.notifications where ref_id like 'zz\_verdict\_r24\_%' or user_id like '00000000-0000-4000-8000-0000000024%')
        || '|' || (select count(*) from public.event_checkin_secrets where event_id like 'zz\_verdict\_r24\_%');")"
verifier "contre-épreuve : le secret de pointage, lui, naît bien avec chaque activité (le contrôle n'est pas vide)" "7" \
  "$(Q "select count(*) from public.event_checkin_secrets where event_id in ('ev_b', 'ev_c', 'ev_sans_auteur', 'ev_d', 'ev_ann', 'ev_past', 'ev_libre');")"
{ echo "begin;"; sed -n '/^-- ── ④ LE COMPORTEMENT/,/^\$verdict\$;$/p' "$MIGRATION";
  echo "select 'reglage=' || coalesce(current_setting('passio.notification_serveur', true), '') || '|mesure=' || (current_setting('passio.verdict_promotion', true) <> '');";
  echo "rollback;"; } > "$SQLDIR/bloc4.sql"; chmod 644 "$SQLDIR/bloc4.sql"
verifier "le réglage que la RPC pose DANS le bloc (passio.notification_serveur) ne lui survit pas ; la mesure, si" "reglage=|mesure=true" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -f "$SQLDIR/bloc4.sql" 2>&1 | grep '^reglage=')"

echo "── ⑤ R26 : LES VUES ─────────────────────────────────────────────────"
for vue in client_errors_par_heure client_errors_top_24h telemetry_last24h; do
  verifier "après : anon ne tient plus TRUNCATE | REFERENCES | TRIGGER sur $vue" "f|f|f" "$(HORS_RLS_VUE anon "$vue")"
  verifier "après : authenticated non plus" "f|f|f" "$(HORS_RLS_VUE authenticated "$vue")"
done
contient "authenticated ne pose plus de déclencheur INSTEAD OF sur la vue" "permission denied" \
  "$(AUTH "$X" "create trigger t_banc instead of insert on public.telemetry_last24h for each row execute function public.f_banc_vue(); select 'OK';")"
verifier "rien d'autre ne change : SELECT/INSERT/UPDATE/DELETE gardés, service_role intact" \
  "$(printf '%s\n' "$DROITS_AVANT" | tr ' ' '\n' | grep -vE ':(anon|authenticated):(TRUNCATE|REFERENCES|TRIGGER|MAINTAIN):' | paste -sd' ')" "$(DROITS_VUES)"
verifier "une lecture de visiteur rend toujours 0 ligne, sans erreur (security_invoker + RLS)" "0" \
  "$(Q "insert into public.telemetry_events (type, severity) values ('api', 'info');" >/dev/null; ANON "select count(*) from public.telemetry_last24h;")"
verifier "les TABLES ne sont pas touchées (empreinte de leurs droits)" "$TABLES_AVANT" "$(DROITS_TABLES)"

echo "── ⑥ RETOUR ARRIÈRE : l'état exact d'avant, puis la migration rejouée ──"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$SQLDIR/retour.sql" >/dev/null
verifier "retour : promouvoir_attente = la définition de production (md5(prosrc))" "$MD5_PROD_PROMOUVOIR" \
  "$(Q "select md5(prosrc) from pg_proc where oid = 'public.promouvoir_attente(text,text)'::regprocedure;")"
verifier "retour : les droits des trois vues sont ceux d'avant, à l'identique (aclexplode)" "$DROITS_AVANT" "$(DROITS_VUES)"
verifier "retour : organise_activite reste (C-04 la crée à l'identique et sa policy en dépend)" "1" \
  "$(Q "select (to_regprocedure('public.organise_activite(text)') is not null)::int;")"
Q "insert into public.events (id, author_id, organizer_id, title, max_attendees, date_at) values ('ev_retour', '$AUT', '$AUT', 'Retour', 1, now() + interval '2 days');
   insert into public.event_attendees (event_id, user_id, rsvp) values ('ev_retour', '$W1', 'waitlist');" >/dev/null
verifier "retour : l'ancien comportement est bien revenu (l'inconnu apprend le nom)" "$(nom "$W1")" "$(RPC "$X" ev_retour)"
sortie3="$(APPLIQUER "$DB" "$MIGRATION")"
verifier "la migration se rejoue après un retour arrière : 17 OK, 0 ECHEC" "17/0" "$(compte_verdict "$sortie3")"

echo "── ⑦ MUTATIONS : chaque ligne du verdict rougit sur le défaut qu'elle vise ──"
muter() {   # $1 nom, $2 texte à remplacer (une fois), $3 remplaçant ; rend le verdict
  python3 - "$MIGRATION" "$SQLDIR/m_$1.sql" "$2" "$3" <<'PY'
import sys
src, dst, avant, apres = sys.argv[1:5]
s = open(src, encoding="utf-8").read()
assert s.count(avant) == 1, "mutation introuvable ou ambiguë : " + avant
open(dst, "w", encoding="utf-8").write(s.replace(avant, apres))
PY
  chmod 644 "$SQLDIR/m_$1.sql"
  psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database m_$1 template socle" >/dev/null
  APPLIQUER "m_$1" "$SQLDIR/m_$1.sql"
}
s_m="$(muter nommer_tous '  if orga or cible = moi then' '  if true then')"
verifier "mutation « le nom à tout appelant » : inconnu et file non promue ROUGISSENT" "ECHEC|ECHEC" \
  "$(ligne "$s_m" "AUTOMATIQUE, déclenchée par un inconnu")|$(ligne "$s_m" "qui n'est PAS la promue")"
s_m="$(muter promue_muette '  if orga or cible = moi then' '  if orga then')"
verifier "mutation « la personne promue n'apprend pas son nom » : sa ligne ROUGIT, l'organisation reste verte" "ECHEC|OK" \
  "$(ligne "$s_m" "déclenchée par la personne promue")|$(ligne "$s_m" "déclenchée par l'auteur")"
s_m="$(muter orga_auteur_seul '  orga := coalesce(public.organise_activite(p_event_id), false);' '  orga := (moi = ev.author_id);')"
verifier "mutation « l'auteur seul organise » : organisateur désigné et co-organisateur ROUGISSENT, l'appel d'organise_activite aussi" "ECHEC|ECHEC|ECHEC" \
  "$(ligne "$s_m" "CHOISIE par l'ORGANISATEUR")|$(ligne "$s_m" "CHOISIE par le co-organisateur")|$(ligne "$s_m" "s'en remet à organise_activite")"
s_m="$(muter vues_gardees "    execute format('revoke truncate, references, trigger on table public.%I from anon, authenticated', r.relname);" "    null;")"
verifier "mutation « les vues gardent leurs droits » : la ligne R26 ROUGIT" "ECHEC" "$(ligne "$s_m" "R26 · aucune relation")"
s_m="$(muter decor_garde "    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';" "    null;")"
verifier "mutation « le décor n'est pas annulé » : « aucune trace » ROUGIT (le contrôle n'est pas décoratif)" "ECHEC" "$(ligne "$s_m" "aucune trace du décor")"
verifier "…et le décor est bien resté dans cette base-là (activité, notifications)" "1|9" \
  "$(QD m_decor_garde "select (select count(*) from public.events where id like 'zz\_verdict\_r24\_%') || '|' || (select count(*) from public.notifications where ref_id like 'zz\_verdict\_r24\_%');")"
s_m="$(muter decor_casse "'Mesure du verdict R24', 'active', 9," "'Mesure du verdict R24', 'active', 0,")"
verifier "mutation « le décor casse » (contrainte de production) : la première ligne le DIT, avec sa cause" "ECHEC|23514" \
  "$(ligne "$s_m" "R24 · mesure exécutée")|$(printf '%s\n' "$s_m" | grep -F "R24 · mesure exécutée" | grep -oE '23514' | head -1)"
verifier "…les lignes de comportement rougissent avec elle (aucun OK sans mesure)" "ECHEC|ECHEC|ECHEC" \
  "$(ligne "$s_m" "AUTOMATIQUE, déclenchée par un inconnu")|$(ligne "$s_m" "CHOISIE par l'ORGANISATEUR")|$(ligne "$s_m" "capacité tenue")"
verifier "…mais la migration est passée : la promotion discrète est en place, les vues fermées" "t|f|f|f" \
  "$(QD m_decor_casse "select (prosrc like '%orga := coalesce(public.organise_activite(p_event_id), false);%') from pg_proc where oid = 'public.promouvoir_attente(text,text)'::regprocedure;" | sed 's/true/t/;s/false/f/')|$(QD m_decor_casse "select has_table_privilege('anon', 'public.telemetry_last24h', 'TRUNCATE') || '|' || has_table_privilege('authenticated', 'public.telemetry_last24h', 'TRIGGER') || '|' || has_table_privilege('anon', 'public.client_errors_top_24h', 'REFERENCES');" | sed 's/true/t/g;s/false/f/g')"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
