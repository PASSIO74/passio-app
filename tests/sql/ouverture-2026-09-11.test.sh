#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/OUVERTURE_2026-09-11.sql
#
# Ce fichier est celui que Benjamin colle DANS LA PRODUCTION, en un seul geste,
# le jour de l'ouverture. Il n'a donc pas droit à un essai raté : on l'EXÉCUTE
# ici sur un PostgreSQL jetable qui reconstitue l'état réel, mesuré le
# 2026-09-11.
#
# ⚠️ CE QUE CE BANC PROUVE VRAIMENT, ET CE QU'IL NE PEUT PAS PROUVER. Il prouve
# que le SQL est valide, que les trois gestes portent, que le fichier est
# rejouable, et surtout que son TABLEAU DE VERDICT sait dire ECHEC. Il ne prouve
# rien sur pg_cron lui-même : l'extension n'existe pas sur un PostgreSQL nu, son
# schéma est donc SIMULÉ ici. La production, elle, porte bien pg_cron 1.6.4 avec
# une tâche déjà active (`purge_client_errors`) — vérifié en lecture le
# 2026-09-11.
#
# ⚠️ LA MUTATION ⑤ EST LA RAISON D'ÊTRE DE CE BANC. Un tableau de verdict qui
# dirait OK quoi qu'il arrive serait PIRE que pas de verdict : on croirait avoir
# appliqué. On casse donc chaque garde et on exige que le verdict rougisse.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
FICHIER="$RACINE/migrations/OUVERTURE_2026-09-11.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"

command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$FICHIER" ] || { echo "❌ fichier introuvable : $FICHIER"; exit 1; }

# ⚠️ LE MIROIR D'ABORD. Mesurer un fichier qui a dérivé de sa migration source,
# c'est éprouver l'ANCIENNE version en croyant éprouver la nouvelle — le défaut
# que le découpeur du référentiel avait déjà eu à fermer.
node "$RACINE/scripts/generer-ouverture.js" --verifier

PORT=$(( 5940 + RANDOM % 120 ))
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

# ⚠️ `-c` EST OBLIGATOIRE : sans lui, psql prend la requête pour un nom de base
# et rend une chaîne VIDE, SANS erreur — chaque contrôle échouerait alors en
# annonçant un défaut du produit qui n'est qu'un défaut du banc.
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1; }
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$FICHIER" 2>&1; }

A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222
C=33333333-3333-3333-3333-333333333333   # membre de RIEN : le témoin négatif

ok=0; ko=0
verifier() { # libellé, attendu, obtenu
  if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi
}
contient() { # libellé, motif, texte
  if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi
}
absent() { # libellé, motif, texte
  if printf '%s' "$3" | grep -qi -- "$2"; then
    ko=$((ko+1)); printf '  ❌ %s\n     motif INTERDIT trouvé : %s\n' "$1" "$2"
  else ok=$((ok+1)); printf '  ✅ %s\n' "$1"; fi
}

# ─────────────────────────────────────────────────────────────────────────────
# SOCLE — l'état RÉEL de la production, mesuré le 2026-09-11 par le connecteur
# en lecture seule (canal ① d'ADR-012) :
#   conv_reads      37 lignes, RLS active, policy « reads_select » qual = true
#   client_errors   pas de colonne auth_uid, INSERT ouvert à anon (GRANT de table)
#   auth.users      7 comptes, 3 avec un `phone` dans raw_user_meta_data
#   user_state      1 ligne avec user.general.phone
#   telemetry_events 130 906 lignes, la plus vieille du 2026-08-05
# ⚠️ HEREDOC CITÉ (<<'SQL') : sans les quotes, bash interpréterait `$$`, `$(` et
# les antislashs du corps des fonctions.
# ─────────────────────────────────────────────────────────────────────────────
socle() {
  psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 \
       -v a="$A" -v b="$B" >/dev/null <<'SQL'
-- ⚠️ LES RÔLES SONT GLOBAUX AU CLUSTER, PAS À LA BASE. `socle()` est rejoué
-- sur une base neuve à chaque mutation : un `create role` sec y échouait dès la
-- première, et le banc s'arrêtait en plein milieu de la section qui compte.
do $roles$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $roles$;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

-- ── ① les deux fuites ──────────────────────────────────────────────────────
create table public.conv_reads (
  conv_id text not null, user_id text not null, last_read_at timestamptz default now(),
  primary key (conv_id, user_id));
-- L'appartenance vit dans une AUTRE table, comme en production : la faire lire
-- dans conv_reads ferait s'appeler la policy elle-même (stack depth exceeded).
create table public.conv_members (conv_id text not null, user_id text not null);
create table public.client_errors (
  id text primary key default gen_random_uuid()::text,
  message text, source text, line int, stack text, url text, uid text,
  created_at timestamptz default now());

create function public.is_conv_member(_conv_id text, _uid text)
  returns boolean language sql stable security definer
  set search_path = public, pg_temp as
  $fn$ select exists (select 1 from public.conv_members m
        where m.conv_id = _conv_id and m.user_id = _uid) $fn$;

alter table public.conv_reads enable row level security;
create policy "reads_select" on public.conv_reads for select to public using (true);
grant select, insert, update on public.conv_reads to anon, authenticated;

alter table public.client_errors enable row level security;
create policy "Insert erreurs" on public.client_errors for insert to public with check (true);
grant insert on public.client_errors to anon, authenticated;   -- GRANT DE TABLE, le piège

-- A est membre de DEUX conversations, B d'une seule, et C de RIEN : c'est C
-- qui prouve que le prédicat discrimine. Sans lui, « le membre lit toujours »
-- serait vert même avec une policy `using (true)`.
insert into public.conv_members (conv_id, user_id) values
  ('conv_prive', :'a'), ('conv_prive', :'b'), ('conv_autre', :'a');
insert into public.conv_reads (conv_id, user_id) values
  ('conv_prive', :'a'), ('conv_prive', :'b'), ('conv_autre', :'a');

-- ── ② les téléphones, aux DEUX endroits ────────────────────────────────────
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text, email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb);
insert into auth.users (raw_user_meta_data) values
  ('{"name":"Une","phone":"0639981201"}'::jsonb),
  ('{"name":"Deux","phone":"0639981202"}'::jsonb),
  ('{"name":"Trois","phone":"0639981203"}'::jsonb),
  ('{"name":"Quatre"}'::jsonb);

create table public.user_state (
  user_id text primary key, data jsonb not null default '{}'::jsonb);
insert into public.user_state (user_id, data) values
  ('u1', '{"user":{"general":{"bio":"salut","phone":"0639981204"}}}'::jsonb),
  ('u2', '{"user":{"general":{"bio":"rien"}}}'::jsonb);

-- ── ③ la télémétrie et pg_cron ─────────────────────────────────────────────
-- ⚠️ pg_cron n'existe pas sur un PostgreSQL nu : on SIMULE son schéma. Le banc
-- éprouve donc le SQL du fichier et la logique du verdict, jamais l'extension.
create schema cron;
create table cron.job (
  jobid bigserial primary key, schedule text not null, command text not null,
  active boolean not null default true, jobname text unique);
create function cron.schedule(job_name text, sched text, cmd text)
  returns bigint language plpgsql as $fn$
  declare id bigint;
  begin
    insert into cron.job (jobname, schedule, command) values (job_name, sched, cmd)
      on conflict (jobname) do update set schedule = excluded.schedule,
                                          command  = excluded.command,
                                          active   = true
      returning jobid into id;
    return id;
  end $fn$;
create function cron.unschedule(job_name text) returns boolean language sql as
  $fn$ delete from cron.job where jobname = job_name returning true $fn$;
-- Une tâche préexistante, comme en production.
select cron.schedule('purge_client_errors', '0 3 * * *',
  $fn$delete from public.client_errors where created_at < now() - interval '30 days'$fn$);

create table public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(), type text, action text);
create function public.purge_telemetry(keep_days integer)
  returns integer language plpgsql security definer
  set search_path = public, pg_temp as $fn$
  declare n integer;
  begin
    delete from public.telemetry_events
      where received_at < now() - (keep_days || ' days')::interval;
    get diagnostics n = row_count;
    return n;
  end $fn$;
-- 10 lignes vieilles de 40 j (purgeables) et 10 d'hier (à garder).
insert into public.telemetry_events (received_at)
  select now() - interval '40 days' from generate_series(1,10);
insert into public.telemetry_events (received_at)
  select now() - interval '1 day' from generate_series(1,10);
SQL
}

echo "═══ BANC OUVERTURE 2026-09-11 ═══"
echo
DB=ouverture
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
socle

# ─────────────────────────────────────────────────────────────────────────────
echo "① LE DÉFAUT D'ABORD — sans quoi on ne prouve pas qu'on l'a refermé"
# ─────────────────────────────────────────────────────────────────────────────
verifier "conv_reads : un visiteur SANS COMPTE lit tout le graphe social" \
  "3" "$(ANON "select count(*) from public.conv_reads")"
verifier "client_errors : aucune colonne d'identité posée par le serveur" \
  "0" "$(Q "select count(*) from information_schema.columns
             where table_schema='public' and table_name='client_errors'
               and column_name='auth_uid'")"
verifier "auth.users : 3 comptes portent encore un téléphone" \
  "3" "$(Q "select count(*) from auth.users where raw_user_meta_data ? 'phone'")"
verifier "user_state : 1 ligne porte encore un téléphone" \
  "1" "$(Q "select count(*) from public.user_state
             where jsonb_exists(data->'user'->'general','phone')")"
verifier "aucune purge de télémétrie planifiée" \
  "0" "$(Q "select count(*) from cron.job where jobname like 'purge_telemetry%'")"
echo

# ─────────────────────────────────────────────────────────────────────────────
echo "② LE FICHIER S'EXÉCUTE, ET SON VERDICT NE PORTE AUCUN « ECHEC »"
# ─────────────────────────────────────────────────────────────────────────────
SORTIE="$(APPLIQUER)"
absent   "aucune erreur PostgreSQL pendant l'application" "ERROR:" "$SORTIE"
absent   "le tableau de verdict ne dit ECHEC nulle part"  "ECHEC"  "$SORTIE"
contient "le verdict nomme le graphe social"      "Graphe social" "$SORTIE"
contient "le verdict nomme l'identité serveur"    "Identité serveur" "$SORTIE"
contient "le verdict nomme les téléphones"        "Téléphones effacés" "$SORTIE"
contient "le verdict nomme la purge planifiée"    "Purge télémétrie planifiée" "$SORTIE"
echo

# ─────────────────────────────────────────────────────────────────────────────
echo "③ LES TROIS GESTES ONT PORTÉ"
# ─────────────────────────────────────────────────────────────────────────────
verifier "① un visiteur sans compte ne lit plus RIEN de conv_reads" \
  "0" "$(ANON "select count(*) from public.conv_reads")"
# A est membre de conv_prive ET conv_autre : les 3 lignes le concernent.
verifier "① un membre lit toujours les conversations dont il fait partie" \
  "3" "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$A';
             select count(*) from public.conv_reads" 2>&1)"
# ⚠️ C'EST CE CONTRÔLE-CI QUI PROUVE QUELQUE CHOSE : un compte authentifié mais
# étranger à ces conversations ne doit RIEN voir. Sans lui, le contrôle
# précédent resterait vert sous une policy `using (true)`.
verifier "① un compte AUTHENTIFIÉ mais étranger ne lit rien" \
  "0" "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q \
         -c "set local role authenticated; set local request.jwt.claim.sub='$C';
             select count(*) from public.conv_reads" 2>&1)"
verifier "① la colonne d'identité serveur existe" \
  "1" "$(Q "select count(*) from information_schema.columns
             where table_schema='public' and table_name='client_errors'
               and column_name='auth_uid'")"
verifier "① le trigger d'identité est BEFORE INSERT et actif" \
  "O" "$(Q "select tgenabled from pg_trigger
             where tgrelid='public.client_errors'::regclass
               and tgname='trg_client_errors_identite'")"
verifier "② plus un seul téléphone dans auth.users" \
  "0" "$(Q "select count(*) from auth.users where raw_user_meta_data ? 'phone'")"
verifier "② plus un seul téléphone dans user_state" \
  "0" "$(Q "select count(*) from public.user_state
             where jsonb_exists(data->'user'->'general','phone')")"
verifier "② le RESTE des métadonnées est intact (on retire une clé, pas la ligne)" \
  "4" "$(Q "select count(*) from auth.users where raw_user_meta_data ? 'name'")"
verifier "② la bio de user_state survit au retrait du téléphone" \
  "salut" "$(Q "select data->'user'->'general'->>'bio' from public.user_state where user_id='u1'")"
verifier "③ la purge de télémétrie est planifiée et active" \
  "0 4 * * *" "$(Q "select schedule from cron.job where jobname='purge_telemetry_30j' and active")"
verifier "③ la tâche préexistante n'a pas été touchée" \
  "1" "$(Q "select count(*) from cron.job where jobname='purge_client_errors' and active")"
verifier "③ les lignes de plus de 30 jours ont été purgées" \
  "0" "$(Q "select count(*) from public.telemetry_events
             where received_at < now() - interval '30 days'")"
verifier "③ les lignes récentes sont INTACTES" \
  "10" "$(Q "select count(*) from public.telemetry_events")"
echo

# ─────────────────────────────────────────────────────────────────────────────
echo "④ REJOUABLE — le fichier peut être collé deux fois sans dégât"
# ─────────────────────────────────────────────────────────────────────────────
SORTIE2="$(APPLIQUER)"
absent   "seconde application : aucune erreur" "ERROR:" "$SORTIE2"
absent   "seconde application : verdict toujours sans ECHEC" "ECHEC" "$SORTIE2"
verifier "seconde application : une seule tâche de purge, pas deux" \
  "1" "$(Q "select count(*) from cron.job where jobname like 'purge_telemetry%'")"
verifier "seconde application : les lignes récentes sont toujours là" \
  "10" "$(Q "select count(*) from public.telemetry_events")"
echo

# ─────────────────────────────────────────────────────────────────────────────
echo "⑤ MUTATIONS — le verdict doit savoir dire ECHEC, sinon il ne prouve rien"
# ─────────────────────────────────────────────────────────────────────────────
mutation() { # libellé, SQL de sabotage
  local nom="$1" sabotage="$2"
  DB=mut
  psql -h "$BASE" -p "$PORT" -U postgres -q -c "drop database if exists mut" >/dev/null
  psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database mut" >/dev/null
  socle
  APPLIQUER >/dev/null 2>&1
  psql -h "$BASE" -p "$PORT" -U postgres -d mut -q -c "$sabotage" >/dev/null 2>&1
  # On ne rejoue QUE le tableau de verdict : appliquer à nouveau réparerait le
  # sabotage, et le banc se rendrait vert tout seul.
  local v
  # ⚠️ On borne sur le SELECT lui-même, pas sur le titre du bloc : partir de
  # « -- VERDICT » puis retirer « les trois premières lignes » avalait le
  # `SELECT * FROM (` — l'extraction rendait un fragment invalide, donc une
  # sortie vide, donc « pas d'ECHEC », donc un banc vert sur une garde cassée.
  v="$(psql -h "$BASE" -p "$PORT" -U postgres -d mut -tA -q \
       -f <(sed -n '/^SELECT \* FROM (/,/^) v ORDER BY n;/p' "$FICHIER") 2>&1)"
  if printf '%s' "$v" | grep -q "ECHEC"; then
    ok=$((ok+1)); printf '  ✅ %s → le verdict rougit\n' "$nom"
  else
    ko=$((ko+1)); printf '  ❌ %s → le verdict reste VERT alors que la garde est cassée\n' "$nom"
    printf '     verdict obtenu : %s\n' "$v"
  fi
  DB=ouverture
}

mutation "on rend conv_reads lisible par tous à nouveau" \
  "alter policy \"reads_select\" on public.conv_reads using (true);"
mutation "on désactive la RLS de conv_reads (policy intacte, faux vert classique)" \
  "alter table public.conv_reads disable row level security;"
mutation "on retire le trigger d'identité serveur" \
  "drop trigger trg_client_errors_identite on public.client_errors;"
mutation "un téléphone revient dans user_state (l'appareil qui repousse son état)" \
  "update public.user_state set data = jsonb_set(data,'{user,general,phone}','\"0639981299\"') where user_id='u2';"
mutation "un téléphone revient dans auth.users" \
  "update auth.users set raw_user_meta_data = raw_user_meta_data || '{\"phone\":\"0639981298\"}'::jsonb where raw_user_meta_data->>'name'='Quatre';"
mutation "la tâche de purge est désactivée sans être supprimée" \
  "update cron.job set active = false where jobname = 'purge_telemetry_30j';"
echo

# ─────────────────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════"
printf '  %s réussis, %s échoués\n' "$ok" "$ko"
[ "$ko" -eq 0 ] || { echo "❌ BANC ROUGE"; exit 1; }
echo "✅ BANC VERT — le fichier d'ouverture est applicable en un seul coller."
