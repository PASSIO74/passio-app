#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_inscription_identifiants_figes_2026-09-15.sql
# (ASTRA-35 / IRL-05)
#
# ⚠️ IL CHARGE LES TROIS GARDES DE PRODUCTION ENSEMBLE, pas seulement celle
# qu'il éprouve : la migration de CAPACITÉ réelle est appliquée d'abord, puis
# celle-ci. La contre-revue le demande explicitement — un socle qui omet la
# protection censée s'appliquer mesure autre chose que la production.
#
# Il mesure le défaut AVANT (adulte `going` sur E1 → PATCH event_id vers une E2
# PLEINE, puis vers une E2 ANNULÉE, puis vers une PASSÉE : acceptés), applique,
# rejoue, puis éprouve : le déplacement refusé, la réassignation de compte
# refusée, l'inscription normale et le retrait TOUJOURS possibles, le chemin
# légitime (se désinscrire puis s'inscrire) correctement REFUSÉ par la capacité,
# les écritures sans session (restauration) intactes, et deux mutations.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
CAPACITE="$RACINE/migrations/migration_capacite_activite_2026-09-14.sql"
MIGRATION="$RACINE/migrations/migration_inscription_identifiants_figes_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
for f in "$CAPACITE" "$MIGRATION"; do [ -f "$f" ] || { echo "❌ introuvable : $f"; exit 1; }; done

PORT=$(( 6300 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"; SU="bash -c"
fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }; sleep 0.5; done
[ "$demarre" -eq 1 ] || { echo "❌ le serveur PostgreSQL de test n'a pas démarré"; [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"; exit 1; }

DB=astra35
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
_verdict() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | sed -n 's/.*ERROR:[[:space:]]*\([a-z_]*\).*/\1/p' | head -1 | tr -d '\n'; [ -z "$(printf '%s' "$1" | sed -n 's/.*ERROR:[[:space:]]*\([a-z_]*\).*/\1/p')" ] && printf 'erreur'; else printf 'OK'; fi; }
AUTH_V() { _verdict "$(AUTH "$1" "$2")"; }

ORGA=11111111-1111-1111-1111-111111111111
A=22222222-2222-2222-2222-222222222222
B=33333333-3333-3333-3333-333333333333

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
create table public.events (id text primary key, author_id text not null, title text, status text default 'active',
  max_attendees integer, price double precision, date_at timestamp, end_at timestamp);
create table public.event_attendees (event_id text not null, user_id text not null, created_at timestamptz default now(),
  rsvp text default 'going', checked_in_at timestamp, rating smallint, feedback text, rated_at timestamptz,
  primary key (event_id, user_id));
create function public.adult_access_allowed() returns boolean language sql stable security definer set search_path to '' as $$ select auth.uid() is not null $$;
-- Les trois gardes de production, chargées ENSEMBLE (admission + pointage ici,
-- capacité par sa vraie migration juste après).
create function public.event_attendees_admission_gardee() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if auth.uid() is null then return new; end if;
  if public.adult_access_allowed() then return new; end if;
  if tg_op = 'UPDATE' then new.checked_in_at = old.checked_in_at; new.rating = old.rating; new.feedback = old.feedback; end if;
  return new;
end $$;
create trigger trg_event_attendees_admission before insert or update on public.event_attendees for each row execute function public.event_attendees_admission_gardee();
create function public.event_attendees_pointage_garde() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.checked_in_at is distinct from old.checked_in_at and new.checked_in_at is not null then
    if not exists (select 1 from public.events e where e.id = new.event_id and e.author_id = (auth.uid())::text) then
      new.checked_in_at = old.checked_in_at;
    end if;
  end if;
  return new;
end $$;
create trigger trg_event_attendees_pointage before update on public.event_attendees for each row execute function public.event_attendees_pointage_garde();
alter table public.events enable row level security; alter table public.event_attendees enable row level security;
create policy "lecture" on public.events for select using (true);
create policy "lecture" on public.event_attendees for select using (true);
create policy "event_attendees_insert_own_adult" on public.event_attendees for insert to authenticated with check (user_id = (select auth.uid())::text and (public.adult_access_allowed() or rsvp = 'declined'));
create policy "event_attendees_update_own_adult" on public.event_attendees for update to authenticated using (user_id = (select auth.uid())::text) with check (user_id = (select auth.uid())::text and (public.adult_access_allowed() or rsvp = 'declined'));
create policy "Suppression propre" on public.event_attendees for delete using (user_id = (select auth.uid())::text);
grant select, insert, update, delete on public.event_attendees to authenticated;
grant select on public.events to authenticated;

-- E1 : de la place. E2 : PLEINE (1 place, déjà prise). E3 : ANNULÉE. E4 : PASSÉE.
insert into public.events (id, author_id, title, status, max_attendees, date_at, end_at) values
  ('E1','11111111-1111-1111-1111-111111111111','avec de la place','active', 10, now() + interval '2 days', now() + interval '2 days'),
  ('E2','11111111-1111-1111-1111-111111111111','pleine','active', 1, now() + interval '2 days', now() + interval '2 days'),
  ('E3','11111111-1111-1111-1111-111111111111','annulée','cancelled', 10, now() + interval '2 days', now() + interval '2 days'),
  ('E4','11111111-1111-1111-1111-111111111111','passée','active', 10, now() - interval '5 days', now() - interval '5 days');
insert into public.event_attendees (event_id, user_id, rsvp) values ('E2','33333333-3333-3333-3333-333333333333','going');
SQL

# La migration de CAPACITÉ réelle — celle qu'ASTRA-35 contourne.
cap="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$CAPACITE" 2>&1)" || { echo "❌ la migration de capacité n'a pas pu être appliquée sur le socle :"; printf '%s\n' "$cap" | tail -6; exit 1; }

INSCRIRE() { Q "delete from public.event_attendees where user_id='$A';" >/dev/null; AUTH_V "$A" "insert into public.event_attendees (event_id, user_id, rsvp) values ('E1','$A','going');"; }
DEPLACER() { AUTH_V "$A" "update public.event_attendees set event_id='$1' where event_id='E1' and user_id='$A';"; }
OU()       { Q "select coalesce(string_agg(event_id, ',' order by event_id),'aucune') from public.event_attendees where user_id='$A';"; }

echo "── ① LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
verifier "prémisse : la capacité REFUSE bien une inscription directe sur E2 (pleine)" "activite_complete" "$(Q "delete from public.event_attendees where user_id='$A';" >/dev/null; AUTH_V "$A" "insert into public.event_attendees (event_id, user_id, rsvp) values ('E2','$A','going');")"
verifier "prémisse : et sur E3 (annulée)" "activite_annulee" "$(AUTH_V "$A" "insert into public.event_attendees (event_id, user_id, rsvp) values ('E3','$A','going');")"
verifier "prémisse : A s'inscrit normalement sur E1" "OK" "$(INSCRIRE)"
verifier "avant : le DÉPLACEMENT vers E2 (PLEINE) est ACCEPTÉ — la capacité est contournée" "OK" "$(DEPLACER E2)"
verifier "avant : A est bien sur E2, au-delà de sa capacité de 1" "E2" "$(OU)"
INSCRIRE >/dev/null
verifier "avant : le déplacement vers E3 (ANNULÉE) est ACCEPTÉ" "OK" "$(DEPLACER E3)"
INSCRIRE >/dev/null
verifier "avant : le déplacement vers E4 (PASSÉE) est ACCEPTÉ" "OK" "$(DEPLACER E4)"

echo "── ② APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -8; exit 1; }
verifier "verdict 6 OK / 0 ECHEC" "6/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration REJOUÉE a échoué"; exit 1; }
verifier "rejeu : toujours 6 OK" "6" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ③ CE QUI CHANGE ───────────────────────────────────────────────────"
INSCRIRE >/dev/null
verifier "le déplacement vers E2 (pleine) est REFUSÉ, et nommé" "inscription_activite_figee" "$(DEPLACER E2)"
verifier "le déplacement vers E3 (annulée) est REFUSÉ" "inscription_activite_figee" "$(DEPLACER E3)"
verifier "le déplacement vers E4 (passée) est REFUSÉ" "inscription_activite_figee" "$(DEPLACER E4)"
verifier "…et même vers une activité qui a de la place : figer, c'est figer" "inscription_activite_figee" "$(Q "insert into public.events (id, author_id, title, status, max_attendees, date_at, end_at) values ('E5','$ORGA','autre','active',10, now() + interval '2 days', now() + interval '2 days') on conflict do nothing;" >/dev/null; DEPLACER E5)"
verifier "A est resté sur E1 : rien n'a bougé" "E1" "$(OU)"
verifier "réassigner le compte de SA propre inscription est REFUSÉ" "inscription_compte_fige" "$(AUTH_V "$A" "update public.event_attendees set user_id='$B' where event_id='E1' and user_id='$A';")"

echo "── ④ CE QUI NE CHANGE PAS ────────────────────────────────────────────"
verifier "changer d'avis sur la MÊME activité reste permis" "OK" "$(AUTH_V "$A" "update public.event_attendees set rsvp='maybe' where event_id='E1' and user_id='$A';")"
verifier "se retirer reste permis — le retrait n'est jamais conditionné" "OK" "$(AUTH_V "$A" "update public.event_attendees set rsvp='declined' where event_id='E1' and user_id='$A';")"
verifier "se désinscrire reste permis" "OK" "$(AUTH_V "$A" "delete from public.event_attendees where event_id='E1' and user_id='$A';")"
verifier "le CHEMIN LÉGITIME (se désinscrire puis s'inscrire) est bien REFUSÉ par la capacité" "activite_complete" "$(AUTH_V "$A" "insert into public.event_attendees (event_id, user_id, rsvp) values ('E2','$A','going');")"
verifier "…et accepté là où il y a de la place" "OK" "$(AUTH_V "$A" "insert into public.event_attendees (event_id, user_id, rsvp) values ('E5','$A','going');")"
verifier "sans session (restauration, purge) : le déplacement passe, comme les gardes voisines" "OK" "$(_verdict "$(Q "update public.event_attendees set event_id='E1' where event_id='E5' and user_id='$A';")")"

echo "── ⑤ MUTATIONS : le banc doit ROUGIR ─────────────────────────────────"
Q "drop trigger trg_event_attendees_figes on public.event_attendees;" >/dev/null
Q "delete from public.event_attendees where user_id='$A';" >/dev/null
INSCRIRE >/dev/null
verifier "mutation « trigger retiré » : le déplacement vers E2 repasse" "OK" "$(DEPLACER E2)"
Q "create or replace function public.event_attendees_figes() returns trigger language plpgsql security definer set search_path to '' as \$fn\$
begin if auth.uid() is null then return new; end if;
  if new.user_id is distinct from old.user_id then raise exception 'inscription_compte_fige' using errcode='P0001'; end if;
  return new; end \$fn\$;" >/dev/null
Q "create trigger trg_event_attendees_figes before update on public.event_attendees for each row execute function public.event_attendees_figes();" >/dev/null
Q "delete from public.event_attendees where user_id='$A';" >/dev/null
INSCRIRE >/dev/null
verifier "mutation « seul user_id figé » : le déplacement d'activité repasse — le banc le voit" "OK" "$(DEPLACER E2)"
sortie3="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -f "$MIGRATION" 2>&1)" || true
verifier "…et la migration rétablit les deux" "6" "$(printf '%s\n' "$sortie3" | grep -cE '\|\s*OK\s*$' || true)"
Q "delete from public.event_attendees where user_id='$A';" >/dev/null
INSCRIRE >/dev/null
verifier "rétabli : le déplacement est de nouveau refusé" "inscription_activite_figee" "$(DEPLACER E2)"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
