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
# `events_prevenir_suppression` (12/11), `comptes_en_suppression`.
# On MESURE D'ABORD les deux défauts (la 61ᵉ ligne d'une même minute est
# refusée ; la suppression d'une activité de 69 inscrits n'en prévient AUCUN),
# on éprouve deux MUTATIONS de la migration (chacune doit être refusée par son
# propre verdict, rien appliqué), on applique, on rejoue, puis on mesure de
# l'extérieur, sous le rôle `authenticated`.
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

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, created_at timestamptz default now() - interval '30 days');
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated;

create table public.profiles (id text primary key, username text not null, is_private boolean default false);
create table public.events (id text primary key, organizer_id text, author_id text, title text, status text not null default 'active',
  co_organizers jsonb not null default '[]'::jsonb, date_at timestamp, created_at timestamp default now());
create table public.event_attendees (event_id text not null references public.events(id) on delete cascade, user_id text not null,
  rsvp text not null default 'going' check (rsvp in ('going', 'maybe', 'declined', 'waitlist')), created_at timestamptz default now(),
  primary key (event_id, user_id));
create table public.blocks (blocker_id text not null, blocked_id text not null, created_at timestamptz default now(), primary key (blocker_id, blocked_id));
create table public.comptes_en_suppression (user_id text primary key, statut text not null);
create table public.notifications (id text primary key, user_id text, kind text, from_id text, ref_id text, content text, seen boolean default false,
  created_at timestamp default now(), origine text, push_le timestamptz);
alter table public.notifications enable row level security;
create policy notifications_insert_own_author on public.notifications for insert to authenticated with check (from_id = (select auth.uid())::text);
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = (select auth.uid())::text);
grant select, insert on public.notifications to authenticated;
grant select on public.events, public.event_attendees to authenticated;
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
-- L'avis de suppression du 12/11, tel qu'en production.
create function public.events_prevenir_suppression() returns trigger language plpgsql security definer set search_path to '' as $f$
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

# Une activité comme celle du village : l'organisatrice, 19 venants, 77 en attente,
# 3 « peut-être », 1 « ne vient pas » — 99 à prévenir — plus BLOQ (qui l'a bloquée)
# et SUPPR (compte en suppression), inscrites elles aussi : 103 lignes.
peupler() { # $1 = identifiant de l'activité
  Q "insert into public.events (id, organizer_id, author_id, title, status, date_at) values ('$1', '$ORGA', '$ORGA', 'Rando <du> lac', 'active', now() + interval '2 days');
     insert into public.event_attendees (event_id, user_id, rsvp) values ('$1', '$ORGA', 'going'), ('$1', '$BLOQ', 'going'), ('$1', '$SUPPR', 'going');
     insert into public.event_attendees (event_id, user_id, rsvp, created_at)
       select '$1', '00000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
              case when i <= 19 then 'going' when i <= 96 then 'waitlist' when i <= 99 then 'maybe' else 'declined' end,
              now() - make_interval(secs => 200 - i)
         from generate_series(1, 100) i;" >/dev/null
}
Q "insert into public.profiles (id, username) values ('$ORGA', 'Léa & co'), ('$X', 'Xavier'), ('$BLOQ', 'Bloque'), ('$SUPPR', 'Partante');
   insert into public.blocks (blocker_id, blocked_id) values ('$BLOQ', '$ORGA');
   insert into public.comptes_en_suppression (user_id, statut) values ('$SUPPR', 'en_cours');" >/dev/null

echo "── ① LES DÉFAUTS, MESURÉS AVANT ──────────────────────────────────────"
# Le chemin du client, en rafale : une écriture par personne, au nom de l'organisatrice.
ecrits="$(AUTH "$ORGA" "do \$r\$ declare i int; begin for i in 1..99 loop begin insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('zz_av_' || i, '00000000-0000-4000-8000-' || lpad(i::text, 12, '0'), 'event_cancelled', '$ORGA', 'ev_av', 'x'); exception when others then null; end; end loop; end \$r\$;" >/dev/null; Q "select count(*) from public.notifications where id like 'zz\_av\_%';")"
verifier "avant : 99 écritures d'une même minute depuis le navigateur → 60 passent (le défaut d'A3)" "60" "$ecrits"
Q "delete from public.notifications; delete from public.debit_ecritures; delete from public.debit_jour;" >/dev/null
peupler ev_sup_avant
Q "delete from public.events where id = 'ev_sup_avant';" >/dev/null
verifier "avant : supprimer une activité de 102 inscrits n'en prévient AUCUN (l'INSERT entier est défait à la 61ᵉ ligne)" "0" \
  "$(Q "select count(*) from public.notifications where id like 'n\_sup\_%';")"
Q "delete from public.notifications; delete from public.debit_ecritures; delete from public.debit_jour;" >/dev/null

echo "── ② MUTATIONS : chacune doit être refusée par la migration, RIEN appliqué ─"
# (a) sans l'exemption du plafond pour une diffusion serveur
awk 'BEGIN{n=0} /pg_catalog.current_setting\(.passio.diffusion_inscrits., true\) = .1. then$/ && n==0 {print "  if false then"; n=1; next} {print}' "$MIGRATION" > "$TMPM/m1.sql"
grep -q "  if false then" "$TMPM/m1.sql" || { echo "❌ mutation (a) non posée"; exit 1; }
sortie="$(APPLIQUER "$TMPM/m1.sql" || true)"
contient "mutation (a) — plafond appliqué aux diffusions : refusée (55000)" "RIEN n'est appliqué" "$sortie"
verifier "mutation (a) : la fonction n'existe pas" "" "$(Q "select to_regprocedure('public.prevenir_inscrits_activite(text, text, text, text)');")"
# (b) sans l'écart des comptes bloqués
grep -q "and not public.is_blocked_with(a.user_id)" "$MIGRATION" || { echo "❌ ancre de la mutation (b) introuvable"; exit 1; }
sed 's/and not public.is_blocked_with(a.user_id)/and true/' "$MIGRATION" > "$TMPM/m2.sql"
sortie="$(APPLIQUER "$TMPM/m2.sql" || true)"
contient "mutation (b) — un compte qui a bloqué l'organisatrice serait prévenu : refusée" "RIEN n'est appliqué" "$sortie"
verifier "mutation (b) : le plafond est resté celui d'avant" "rate_limit_insert" \
  "$(Q "select p.proname from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'public.notifications'::regclass and t.tgname = 'trg_rate_limit';")"

echo "── ③ APPLICATION, PUIS REJEU ──────────────────────────────────────────"
rc=0; sortie="$(APPLIQUER "$MIGRATION")" || rc=$?
verifier "la migration s'applique, verdict sans ÉCHEC" "0|0" "$rc|$(printf '%s' "$sortie" | grep -c ECHEC || true)"
[ "$rc" -eq 0 ] || printf '%s\n' "$sortie"
rc=0; sortie="$(APPLIQUER "$MIGRATION")" || rc=$?
verifier "la migration se rejoue" "0" "$rc"
Q "delete from public.notifications; delete from public.debit_ecritures; delete from public.debit_jour;" >/dev/null

echo "── ④ DE L'EXTÉRIEUR, SOUS authenticated ──────────────────────────────"
peupler ev_v
verifier "une activité non annulée ne s'annonce pas annulée" "pas_annulee" "$(PREV "$ORGA" ev_v event_cancelled clevillage01)"
Q "update public.events set status = 'cancelled' where id = 'ev_v';" >/dev/null
verifier "l'annulation : 99 personnes prévenues sur 99 (au-delà des 60 du plafond)" "99/99" "$(PREV "$ORGA" ev_v event_cancelled clevillage01)"
verifier "une ligne par personne, sans doublon" "99|99" \
  "$(Q "select count(*) || '|' || count(distinct user_id) from public.notifications where ref_id = 'ev_v' and kind = 'event_cancelled';")"
verifier "jamais l'organisatrice, ni qui l'a bloquée, ni un compte en suppression, ni « ne vient pas »" "0" \
  "$(Q "select count(*) from public.notifications where ref_id = 'ev_v' and user_id in ('$ORGA', '$BLOQ', '$SUPPR', '$(uidn 100)');")"
verifier "d'origine serveur, au nom de l'organisatrice, nom échappé, phrase fixe" "serveur|$ORGA|Léa &amp; co a annulé un événement auquel tu participais" \
  "$(Q "select distinct origine || '|' || from_id || '|' || content from public.notifications where ref_id = 'ev_v' and kind = 'event_cancelled';")"
verifier "le rejeu du même geste (même clé) : 99 comptées, aucune ligne de plus" "99/99|99" \
  "$(PREV "$ORGA" ev_v event_cancelled clevillage01)|$(Q "select count(*) from public.notifications where ref_id = 'ev_v' and kind = 'event_cancelled';")"
verifier "la diffusion n'a pas consommé le plafond ordinaire de l'organisatrice" "" \
  "$(Q "select n from public.debit_ecritures where table_nom = 'notifications' and source = '$ORGA';")"
verifier "message de l'organisation : échappé, borné à 200" "99/99|Léa &amp; co &lt;b&gt;RDV&lt;/b&gt; à l&#39;entrée nord|200" \
  "$(PREV "$ORGA" ev_v event_update clevillage02 "  <b>RDV</b> à l''entrée nord  ")|$(Q "select content from public.notifications where ref_id = 'ev_v' and kind = 'event_update' limit 1;")|$(PREV "$ORGA" ev_v event_update clevillage03 "$(printf 'x%.0s' $(seq 1 300))" >/dev/null; Q "select max(char_length(content)) - char_length('Léa &amp; co ') from public.notifications where ref_id = 'ev_v' and kind = 'event_update';")"
verifier "un message n'accompagne pas une annulation" "message_hors_genre" "$(PREV "$ORGA" ev_v event_cancelled clevillage04 "Venez quand même")"
verifier "une étrangère ne prévient personne" "non_autorise" "$(PREV "$X" ev_v event_update clevillage05)"
verifier "une clé mal formée est refusée" "cle_invalide" "$(PREV "$ORGA" ev_v event_update "court")"
verifier "un genre inconnu est refusé" "genre_inconnu" "$(PREV "$ORGA" ev_v like clevillage06)"
verifier "une activité inconnue" "introuvable" "$(PREV "$ORGA" ev_inconnue event_update clevillage07)"
contient "anon ne peut pas appeler la fonction" "permission denied" "$(ANON "select public.prevenir_inscrits_activite('ev_v', 'event_update', 'clevillage08');")"
# Débit : 12 diffusions par minute et par compte. Les 13 appels partent dans UNE requête
# (même `now()`, donc la même minute du compteur, quelle que soit la vitesse du poste).
Q "delete from public.debit_ecritures where table_nom = 'prevenir_inscrits';" >/dev/null
verifier "12 diffusions par minute passent, la 13ᵉ est refusée (débit)" "12|debit" \
  "$(AUTH "$ORGA" "select count(*) filter (where (j->>'ok')::boolean) || '|' || max(j->>'motif') filter (where k = 22)
                     from (select k, public.prevenir_inscrits_activite('ev_v', 'event_update', 'clevillage' || k) as j
                             from generate_series(10, 22) k) s;")"
# Le plafond des notifications ORDINAIRES tient toujours : 60 par minute.
Q "delete from public.debit_ecritures where table_nom = 'notifications';" >/dev/null
ecrits="$(AUTH "$X" "do \$r\$ declare i int; begin for i in 1..61 loop begin insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('zz_cl_' || i, '00000000-0000-4000-8000-' || lpad(i::text, 12, '0'), 'like', '$X', 'p1', 'x'); exception when others then null; end; end loop; end \$r\$;" >/dev/null; Q "select count(*) from public.notifications where id like 'zz\_cl\_%';")"
verifier "le plafond des écritures du CLIENT est intact : 60 sur 61" "60" "$ecrits"
# Une origine « serveur » sans diffusion reste comptée (follows_notifier, mentions…).
Q "delete from public.debit_ecritures;" >/dev/null
verifier "une ligne serveur HORS diffusion reste comptée" "1" \
  "$(Q "select set_config('passio.notification_serveur', '1', false); insert into public.notifications (id, user_id, kind, from_id, ref_id, content) values ('zz_srv', '$X', 'follow', '$ORGA', '$ORGA', 'x'); select n from public.debit_ecritures where table_nom = 'notifications' and source = '$ORGA';" | tail -1)"
# La suppression d'une grande activité prévient TOUT LE MONDE.
Q "delete from public.notifications; delete from public.debit_ecritures; delete from public.debit_jour;" >/dev/null
peupler ev_sup
verifier "les réglages de diffusion ne survivent pas à la suppression" "|" \
  "$(Q "delete from public.events where id = 'ev_sup'; select coalesce(current_setting('passio.diffusion_inscrits', true), '') || '|' || coalesce(current_setting('passio.notification_serveur', true), '');")"
verifier "après : supprimer une activité de 102 inscrits en prévient 101 (tous sauf le compte en suppression)" "101" \
  "$(Q "select count(*) from public.notifications where ref_id = 'ev_sup' and id like 'n\_sup\_%';")"

echo
echo "Résultat : $ok OK · $ko échec(s)"
[ "$ko" -eq 0 ]
