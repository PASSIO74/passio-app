#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_purge_marqueurs_2026-10-16.sql (RES-02)
#
# Ce qu'il protège :
#   ① la tâche `purge_marqueurs_suppression` est planifiée UNE fois, avec la
#     rétention de 45 jours ;
#   ② elle purge les marqueurs `supprimee` de plus de 45 jours, et rien d'autre
#     (ni les récents, ni ceux qui ne sont pas `supprimee`) ;
#   ③ la migration est rejouable (une seule tâche, jamais deux) ;
#   ④ ni anon ni authenticated ne replanifient ;
#   ⑤ un mutant qui oublie la planification fait LEVER le verdict.
# pg_cron n'existe pas dans un PostgreSQL nu : un schéma `cron` minimal le
# remplace (job, schedule, unschedule) — la commande planifiée est exécutée
# telle quelle par le banc, comme pg_cron le ferait.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_purge_marqueurs_2026-10-16.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable"; exit 1; }

PORT=$(( 6940 + RANDOM % 50 ))
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
for _ in $(seq 1 30); do psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && break; sleep 0.5; done

DB=marqueurs
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
R() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "begin; set local role $1; $2; commit;" 2>&1; }
FICHIER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }

# Décor : rôles et droits par défaut de Supabase, pg_cron minimal, la table et la purge d'origine.
Q "
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(p_nom text, p_horaire text, p_commande text) returns bigint language sql as \$\$
  insert into cron.job(jobname, schedule, command) values (p_nom, p_horaire, p_commande)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid \$\$;
create function cron.unschedule(p_id bigint) returns boolean language sql as \$\$ delete from cron.job where jobid = p_id returning true \$\$;
create table public.comptes_en_suppression (uid text primary key, statut text not null, supprimee_le timestamptz);
create or replace function public.purger_marqueurs_suppression(p_retention interval) returns integer
language plpgsql security definer set search_path = '' as \$\$
declare n integer;
begin
  if p_retention < interval '30 days' then raise exception 'rétention < 30 jours refusée'; end if;
  delete from public.comptes_en_suppression where statut = 'supprimee' and supprimee_le < now() - p_retention;
  get diagnostics n = row_count; return n;
end \$\$;
" >/dev/null

ok=0; ko=0
verif() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; ok=$((ok+1)); else echo "  ❌ $1 — attendu « $3 », obtenu « $2 »"; ko=$((ko+1)); fi; }

FICHIER "$MIGRATION" >/dev/null
verif "① une tâche planifiée" "$(Q "select count(*) from cron.job where jobname = 'purge_marqueurs_suppression'")" "1"
verif "① chaque jour à 03:41 UTC" "$(Q "select schedule from cron.job where jobname = 'purge_marqueurs_suppression'")" "41 3 * * *"

Q "insert into public.comptes_en_suppression values
   ('vieux', 'supprimee', now() - interval '60 days'),
   ('recent', 'supprimee', now() - interval '10 days'),
   ('limite', 'supprimee', now() - interval '44 days'),
   ('en_cours', 'en_cours', now() - interval '90 days')" >/dev/null
# pg_cron exécuterait la commande telle quelle : le banc fait de même.
CMD="$(Q "select command from cron.job where jobname = 'purge_marqueurs_suppression'")"
Q "$CMD" >/dev/null
verif "② la commande planifiée purge le seul marqueur supprimé de plus de 45 jours" "$(Q "select string_agg(uid, ',' order by uid) from public.comptes_en_suppression")" "en_cours,limite,recent"

FICHIER "$MIGRATION" >/dev/null
verif "③ rejouable : toujours UNE tâche" "$(Q "select count(*) from cron.job where jobname = 'purge_marqueurs_suppression'")" "1"

if R anon "select public.planifier_purge_marqueurs()" >/dev/null 2>&1; then verif "④ anon ne replanifie pas" "accepté" "refusé"; else verif "④ anon ne replanifie pas" "refusé" "refusé"; fi
if R authenticated "select public.planifier_purge_marqueurs()" >/dev/null 2>&1; then verif "④ authenticated ne replanifie pas" "accepté" "refusé"; else verif "④ authenticated ne replanifie pas" "refusé" "refusé"; fi
verif "④ service_role replanifie" "$(R service_role "select (public.planifier_purge_marqueurs() like 'purge_marqueurs_suppression%')::text")" "true"

# ⑤ mutant : la planification oubliée → le verdict lève, rien n'est appliqué
Q "delete from cron.job; drop function public.planifier_purge_marqueurs();" >/dev/null
MUTANT="$BASE/mutant.sql"
grep -v "^select public.planifier_purge_marqueurs() as planification;" "$MIGRATION" > "$MUTANT"; chmod a+r "$MUTANT"
if FICHIER "$MUTANT" >/dev/null 2>&1; then verif "⑤ planification oubliée : verdict" "appliqué" "levé"; else verif "⑤ planification oubliée : verdict" "levé" "levé"; fi
verif "⑤ rien d'appliqué" "$(Q "select count(*) from pg_proc where proname = 'planifier_purge_marqueurs'")" "0"

echo "Banc purge-marqueurs : $ok OK, $ko échec(s)"
[ "$ko" -eq 0 ]
