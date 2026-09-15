#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — LES TROIS SÉQUENCES DE MISE EN SERVICE (cinquième contre-revue Astra,
# mandat §8, 2026-09-15), sur PostgreSQL RÉEL jetable :
#
#   A. infrastructure de suppression AVANT la fonction qui l'exige : sans la
#      migration barrière v2, les RPC que `purge-compte.js` v2 appelle n'existent
#      pas (42883 — PostgREST rend PGRST202, que la fonction traduit en 503
#      `infrastructure_absente`, verrouillé par tests/unit/suppression-compte) ;
#      après, elles existent et la première tentative est acquise ; rejouée,
#      la migration est idempotente (un retour arrière puis une reprise ne
#      cassent rien).
#   B. RPC des propriétaires disponible AVANT de déclarer une sauvegarde
#      complète : sans `migration_proprietaires_objets_stockage`, la RPC
#      n'existe pas (→ inventaire « indisponible », archive jamais COMPLÈTE,
#      verrouillé par tests/unit/sauvegarde-medias ⑦) ; après, elle rend chaque
#      objet, propriétaire nul compris.
#   C. protocole client compatible AVANT le resserrement des canaux d'appel :
#      l'ANCIEN ordre (s'abonner à `call:<id>` PUIS déposer l'invitation) marche
#      sous l'ancienne policy et est REFUSÉ après ; le NOUVEAU (déposer puis
#      s'abonner) marche sous les deux — c'est ce qui autorise l'ordre « client
#      d'abord, migration ensuite » (docs/APPELS_TRANSITION.md).
#
# Trois bases sur un même serveur ; chaque séquence lit l'état AVANT, applique
# la vraie migration, relit APRÈS. Aucune attente arbitraire.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
M_BARRIERE="$RACINE/migrations/migration_barriere_suppression_2026-09-15.sql"
M_PROPRIOS="$RACINE/migrations/migration_proprietaires_objets_stockage_2026-09-15.sql"
M_AMONT="$RACINE/migrations/migration_appels_invitations_attestees_2026-09-15.sql"
M_CANAL="$RACINE/migrations/migration_canal_appel_lie_2026-09-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v node >/dev/null || { echo "❌ node introuvable"; exit 1; }
for m in "$M_BARRIERE" "$M_PROPRIOS" "$M_AMONT" "$M_CANAL"; do [ -f "$m" ] || { echo "❌ migration introuvable : $m"; exit 1; }; done

# Socle de la purge, DÉRIVÉ de TABLES_COMPTE (même dérivation que le banc de la barrière).
SOCLE_JS='
import { pathToFileURL } from "node:url";
const { TABLES_COMPTE } = await import(pathToFileURL(process.argv[1]).href);
const speciales = new Set(["user_state", "profiles", "conv_reads"]);
const parTable = new Map();
for (const [t, c] of TABLES_COMPTE) { if (!parTable.has(t)) parTable.set(t, []); parTable.get(t).push(c); }
const ddl = [];
for (const [t, cols] of parTable) {
  if (speciales.has(t)) continue;
  ddl.push(`create table public.${t} (id serial primary key, ${cols.map((c) => c + " text").join(", ")}, blob text);`);
  ddl.push(`alter table public.${t} enable row level security;`);
  ddl.push(`create policy ${t}_ins on public.${t} for insert to authenticated with check (true);`);
}
ddl.push("create policy client_errors_anon on public.client_errors for insert to anon with check (true);");
console.log(ddl.join("\n"));
'
DDL="$(node --input-type=module -e "$SOCLE_JS" "$RACINE/supabase/functions/_shared/purge-compte.js" 2>/dev/null)"
[ -n "$DDL" ] || { echo "❌ impossible de dériver le socle de TABLES_COMPTE"; exit 1; }

PORT=$(( 7100 + RANDOM % 120 ))
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
[ "$demarre" -eq 1 ] || { echo "❌ le serveur PostgreSQL de test n'a pas démarré"; exit 1; }

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qi -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$3"; fi; }
_ok_ou_erreur() { if printf '%s' "$1" | grep -qi "error"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }
migrer() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -q -v ON_ERROR_STOP=1 -f "$2" 2>&1; }
verdicts() { printf '%s\n' "$1" | grep -cE '\|\s*OK\s*$' || true; }
echecs()   { printf '%s\n' "$1" | grep -cE '\|\s*ECHEC\s*$' || true; }

# Les rôles sont propres au CLUSTER : une fois pour les trois bases.
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create role anon; create role authenticated; create role service_role;" >/dev/null

A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
B=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb
C=cccccccc-cccc-4ccc-8ccc-cccccccccccc
J1=11111111-1111-4111-8111-111111111111

# ═══════════════════════════════════════════════════════════════════════════
echo "── A. SUPPRESSION : l'infrastructure AVANT la fonction qui l'exige ────────"
DB=seq_suppr
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()   { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
SVC() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role service_role; $1" 2>&1 || true; }
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
create schema auth;
create function auth.uid() returns uuid language sql stable as \$fn\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$fn\$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
create table public.user_state (user_id text primary key, blob jsonb);
create table public.profiles   (id text primary key, username text);
create table public.conv_reads (conv_id text, user_id text, primary key (conv_id, user_id));
alter table public.user_state enable row level security; alter table public.profiles enable row level security; alter table public.conv_reads enable row level security;
$DDL
SQL
avant="$(SVC "select public.reclamer_suppression('$A', '$J1'::uuid, 'test');")"
contient "AVANT la migration : reclamer_suppression n'existe pas (42883 → PGRST202 → 503 infrastructure_absente côté fonction)" "does not exist" "$avant"
verifier "AVANT : aucune des quatre RPC de la v2 n'existe" "0" "$(Q "select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('reclamer_suppression','terminer_suppression','attendre_ecritures_en_vol','purger_marqueurs_suppression');")"
verifier "AVANT : la table marqueur n'existe pas" "0" "$(Q "select count(*)::int from pg_tables where schemaname = 'public' and tablename = 'comptes_en_suppression';")"
sortie="$(migrer "$DB" "$M_BARRIERE")" || { echo "  ❌ la migration barrière a échoué :"; echo "$sortie" | tail -8; exit 1; }
verifier "APPLICATION : verdict de la migration sans ECHEC" "0" "$(echecs "$sortie")"
verifier "APRÈS : les quatre RPC existent" "4" "$(Q "select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('reclamer_suppression','terminer_suppression','attendre_ecritures_en_vol','purger_marqueurs_suppression');")"
contient "APRÈS : la première tentative est acquise (statut en_cours)" "en_cours" "$(SVC "select public.reclamer_suppression('$A', '$J1'::uuid, 'test');")"
contient "APRÈS : elle se termine (purgee)" "purgee" "$(SVC "select public.terminer_suppression('$A', '$J1'::uuid, 'purgee', null::jsonb);")"
sortie2="$(migrer "$DB" "$M_BARRIERE")" || { echo "  ❌ la migration barrière REJOUÉE a échoué :"; echo "$sortie2" | tail -5; exit 1; }
verifier "REJEU (reprise après retour arrière partiel) : idempotente, sans ECHEC" "0" "$(echecs "$sortie2")"
verifier "REJEU : le marqueur déjà posé est conservé (une reprise n'efface pas l'état)" "purgee" "$(Q "select statut from public.comptes_en_suppression where user_id = '$A';")"

# ═══════════════════════════════════════════════════════════════════════════
echo "── B. SAUVEGARDE : la RPC des propriétaires AVANT toute archive « complète »"
DB=seq_proprios
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated, service_role;
create table storage.objects (bucket_id text, name text, owner uuid, owner_id text, metadata jsonb default '{}'::jsonb, primary key (bucket_id, name));
create function public.objets_stockage_du_compte(p_uid uuid) returns table (bucket_id text, name text)
language sql stable security definer set search_path = '' as $fn$
  select o.bucket_id, o.name from storage.objects o where o.owner = p_uid or o.owner_id = p_uid::text order by o.bucket_id, o.name $fn$;
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('content', 'photos/a/a.jpg', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('attachments', 'attachments/conv_ab/b.jpg', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('content', 'systeme/banniere.png', null, null);
SQL
contient "AVANT : la RPC n'existe pas — le script la verra PGRST202 et dira « inventaire indisponible », jamais COMPLÈTE" "does not exist" "$(SVC "select count(*) from public.proprietaires_objets_stockage();")"
sortie="$(migrer "$DB" "$M_PROPRIOS")" || { echo "  ❌ la migration des propriétaires a échoué :"; echo "$sortie" | tail -8; exit 1; }
verifier "APPLICATION : sans ECHEC" "0" "$(echecs "$sortie")"
verifier "APRÈS : la RPC rend CHAQUE objet, propriétaire nul compris (3 objets)" "3" "$(SVC "select count(*)::int from public.proprietaires_objets_stockage();" | tail -1)"
verifier "APRÈS : le propriétaire nul est EXPLICITE (ligne présente, owner null) — pas « non relevé »" "1" "$(SVC "select count(*)::int from public.proprietaires_objets_stockage() where owner is null and owner_id is null;" | tail -1)"
contient "APRÈS : authenticated ne peut pas lire l'inventaire" "permission denied" "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; select count(*) from public.proprietaires_objets_stockage();" 2>&1 || true)"

# ═══════════════════════════════════════════════════════════════════════════
echo "── C. APPELS : le protocole client compatible AVANT le resserrement ──────"
DB=seq_appels
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
RT() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; set local realtime.topic='$2'; $3" 2>&1; }
AUTH() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
RT_OK() { _ok_ou_erreur "$(RT "$1" "$2" "$3")"; }
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -v a="$A" -v b="$B" -v c="$C" >/dev/null <<'SQL'
create schema auth;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
create table public.blocks (blocker_id text not null, blocked_id text not null, primary key (blocker_id, blocked_id));
create table public.conversations (id text primary key, is_group boolean default false);
create table public.conv_members (conv_id text not null, user_id text not null, primary key (conv_id, user_id));
create function public.is_conv_member(_conv_id text, _uid text) returns boolean language sql stable security definer set search_path = '' as
  $fn$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $fn$;
create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path = '' as
  $fn$ select case when auth.uid() is null or _other is null or _other = (auth.uid())::text then false
       else exists (select 1 from public.blocks b where (b.blocker_id = (auth.uid())::text and b.blocked_id = _other)
                    or (b.blocker_id = _other and b.blocked_id = (auth.uid())::text)) end $fn$;
create schema realtime;
create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text, extension text, payload jsonb, inserted_at timestamptz default now());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $fn$ select current_setting('realtime.topic', true) $fn$;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;
create table realtime.envois (topic text, event text, payload jsonb, private boolean, quand timestamptz default now());
create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void language sql as
  $fn$ insert into realtime.envois (topic, event, payload, private) values (topic, event, payload, private) $fn$;
create policy "passio_rt_recevoir" on realtime.messages for select to authenticated using (
     (realtime.topic() like 'ring:%' and substr(realtime.topic(), 6) = (select auth.uid())::text)
  or realtime.topic() like 'call:%' or realtime.topic() like 'vlive:%' or realtime.topic() = 'realtime:db'
  or (realtime.topic() like 'conv:%' and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text)));
create policy "passio_rt_emettre" on realtime.messages for insert to authenticated with check (
     (realtime.topic() like 'ring:%' and not public.is_blocked_with(substr(realtime.topic(), 6)))
  or realtime.topic() like 'call:%' or realtime.topic() like 'vlive:%'
  or (realtime.topic() like 'conv:%' and public.is_conv_member(substr(realtime.topic(), 6), (select auth.uid())::text)));
insert into public.conversations values ('conv_ab', false);
insert into public.conv_members values ('conv_ab', :'a'), ('conv_ab', :'b');
SQL
sortie="$(migrer "$DB" "$M_AMONT")" || { echo "  ❌ la migration amont (invitations attestées) a échoué"; echo "$sortie" | tail -5; exit 1; }

# L'abonnement = une lecture sous la policy du topic. L'ANCIEN client s'abonne
# AVANT d'écrire la ligne ; le NOUVEAU écrit la ligne PUIS s'abonne.
ancien_ordre() { # $1 = id d'appel ; s'abonne (A) puis dépose ; rend le verdict de l'abonnement
  local v; v="$(RT_OK "$A" "call:$1" "insert into realtime.messages (topic, extension) values ('call:$1', 'broadcast');")"
  AUTH "$A" "insert into public.call_invites (id, from_id, to_id, kind) values ('$1', '$A', '$B', 'voice');" >/dev/null 2>&1 || true
  echo "$v"
}
nouvel_ordre() { # dépose (A) puis s'abonne
  AUTH "$A" "insert into public.call_invites (id, from_id, to_id, kind) values ('$1', '$A', '$B', 'voice');" >/dev/null 2>&1 || true
  RT_OK "$A" "call:$1" "insert into realtime.messages (topic, extension) values ('call:$1', 'broadcast');"
}
verifier "AVANT : ancien ordre (abonnement puis dépôt) — accepté" "OK" "$(ancien_ordre call_v1_a)"
verifier "AVANT : nouvel ordre (dépôt puis abonnement) — accepté" "OK" "$(nouvel_ordre call_v1_n)"
verifier "AVANT : un tiers lit le canal (le défaut ASTRA-23, toujours là)" "1" "$(RT "$C" "call:call_v1_n" "select count(*) from realtime.messages where topic = 'call:call_v1_n';" | tail -1)"

sortie="$(migrer "$DB" "$M_CANAL")" || { echo "  ❌ la migration du canal lié a échoué"; echo "$sortie" | tail -8; exit 1; }
verifier "APPLICATION : sans ECHEC" "0" "$(echecs "$sortie")"
contient "APRÈS : ancien ordre — REFUSÉ (row-level security) : c'est l'onglet ancien en cache, RES-05" "row-level security" "$(ancien_ordre call_v2_a)"
verifier "APRÈS : nouvel ordre — accepté : le client servi avant la migration fonctionne sous les deux policies" "OK" "$(nouvel_ordre call_v2_n)"
verifier "APRÈS : l'appelé (B) rejoint le canal du nouvel ordre" "OK" "$(RT_OK "$B" "call:call_v2_n" "insert into realtime.messages (topic, extension) values ('call:call_v2_n', 'broadcast');")"
verifier "APRÈS : le tiers ne lit plus rien" "0" "$(RT "$C" "call:call_v2_n" "select count(*) from realtime.messages where topic = 'call:call_v2_n';" | tail -1)"
verifier "APRÈS : l'appel de l'ancien ordre, une fois sa ligne écrite, redevient joignable en se RÉABONNANT (reprise = recharger puis rappeler)" "OK" "$(RT_OK "$A" "call:call_v2_a" "insert into realtime.messages (topic, extension) values ('call:call_v2_a', 'broadcast');")"

echo
echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
