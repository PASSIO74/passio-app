#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_croissance_2026-11-01.sql
#        migrations/migration_moderation_pretri_2026-11-01.sql
#
# Ce qu'il protège :
#   ① croissance : une visite = un appareil (doublon, trafic d'équipe et
#     environnement de développement écartés) ; la source retombe sur
#     `referrer` sans `src` ; une valeur hostile est réduite à [a-z0-9_.-] ;
#     inscription, campagne, liens créés / envoyés / ouverts dédoublonnés ;
#   ② activité : identité SERVEUR seule, ni e2e ni équipe ni développement ;
#     elle part avec le compte (cascade) ;
#   ③ planification : `purge_telemetry_7j` retirée, deux tâches posées, rejeu ;
#   ④ paliers : échec et HTTP ≥ 400 de 4 jours gardés, le reste de 4 jours et
#     tout ce qui a 8 jours partis ;
#   ⑤ ni anon ni authenticated ne lisent les agrégats ni n'appellent les
#     fonctions ; la période lue est bornée à 120 jours ;
#   ⑥ pré-tri : deux anciens + un neuf + l'auteur + un doublon + un inconnu ne
#     masquent rien ; trois anciens confirmés distincts masquent ; l'auteur voit
#     encore, les autres non, l'autre publication reste visible ; rétablie,
#     elle n'est jamais remasquée ; un client ne lit pas `contenus_masques` ;
#   ⑦ rejeu des deux migrations.
# Éprouvé d'abord sur PGlite (25 scénarios, 2026-11-01).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
M1="$RACINE/migrations/migration_croissance_2026-11-01.sql"
M2="$RACINE/migrations/migration_moderation_pretri_2026-11-01.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$M1" ] && [ -f "$M2" ] || { echo "❌ migration introuvable"; exit 1; }

PORT=$(( 7040 + RANDOM % 50 ))
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

DB=croissance
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
FICHIER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }
# Sous un rôle client, avec un sub de JWT ; « REFUS » si la requête lève.
COMME() {
  local out
  if out="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 \
      -c "begin; set local role $1; select 'sub=' || set_config('request.jwt.claim.sub', '$2', true); $3; commit;" 2>/dev/null)"; then
    printf '%s\n' "$out" | grep -v '^sub=' | tail -1
  else echo "REFUS"; fi
}

U() { printf '00000000-0000-0000-0000-00000000000%s' "$1"; }

# Décor : rôles et droits par défaut de Supabase, auth, pg_cron minimal, les tables d'origine.
Q "
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), email_confirmed_at timestamptz, deleted_at timestamptz, is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean not null default true);
create function cron.schedule(p_nom text, p_horaire text, p_commande text) returns bigint language sql as \$\$
  insert into cron.job(jobname, schedule, command) values (p_nom, p_horaire, p_commande)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid \$\$;
create function cron.unschedule(p_id bigint) returns boolean language sql as \$\$ delete from cron.job where jobid = p_id returning true \$\$;
select cron.schedule('purge_telemetry_7j', '0 4 * * *', 'select public.purge_telemetry(7)');
create table public.telemetry_events (id uuid primary key default gen_random_uuid(), received_at timestamptz default now(), env text, type text, action text, status text, severity text, http_status int, user_id text, session_id text, device_id text, correlation_id text, meta jsonb, auth_uid uuid);
create table public.posts (id text primary key, author_id text, content text, created_at timestamp default now());
alter table public.posts enable row level security;
create policy \"Lecture respectant les comptes prives\" on public.posts for select using (true);
create table public.reports (id text primary key, reporter_id text, target_type text, target_id text, reason text, created_at timestamptz default now(), status text default 'open', handled_at timestamptz, handled_note text);
" >/dev/null

Q "
insert into auth.users(id,email,created_at,email_confirmed_at) values
 ('$(U 1)','a@x.fr', now()-interval '30 days', now()-interval '30 days'),
 ('$(U 2)','b@x.fr', now()-interval '30 days', now()-interval '30 days'),
 ('$(U 3)','c@x.fr', now()-interval '30 days', now()-interval '30 days'),
 ('$(U 4)','neuf@x.fr', now()-interval '1 day', now()-interval '1 day'),
 ('$(U 5)','t@passio-e2e.test', now()-interval '30 days', now()-interval '30 days'),
 ('$(U 6)','auteur@x.fr', now()-interval '30 days', now()-interval '30 days'),
 ('$(U 7)','parti@x.fr', now()-interval '30 days', now()-interval '30 days');
insert into public.telemetry_events(received_at,env,type,action,device_id,meta,auth_uid,correlation_id,status,severity,http_status) values
 (now(),'production','session','start','d1','{\"src\":\"instagram\"}','$(U 1)',null,null,null,null),
 (now(),'production','session','start','d1','{\"src\":\"instagram\"}','$(U 1)',null,null,null,null),
 (now(),'production','session','start','d2','{\"referrer\":\"direct\"}',null,null,null,null,null),
 (now(),'production','session','start','d3','{\"src\":\"instagram\",\"trafic\":\"equipe\"}','$(U 2)',null,null,null,null),
 (now(),'production','session','start','d4','{\"src\":\"Insta<script>\"}','$(U 5)',null,null,null,null),
 (now(),'production','session','start','d8','{\"src\":\"direct\"}','$(U 7)',null,null,null,null),
 (now(),'development','session','start','d9','{\"src\":\"tiktok\"}','$(U 3)',null,null,null,null),
 (now(),'production','link','acq_signup','d1','{\"src\":\"instagram\",\"camp\":\"lancement\",\"voie\":\"google\"}',null,null,null,null,null),
 (now(),'production','link','link_create','d1','{\"link_kind\":\"post\"}',null,'lk_1',null,null,null),
 (now(),'production','link','link_share','d1','{\"link_channel\":\"whatsapp\"}',null,'lk_1',null,null,null),
 (now(),'production','link','link_open','d7','{\"referrer\":\"external\"}',null,'lk_1',null,null,null),
 (now(),'production','link','link_open','d7','{\"referrer\":\"external\"}',null,'lk_1',null,null,null),
 (now()-interval '4 days','production','perf','page_load','d1','{}',null,null,null,null,null),
 (now()-interval '4 days','production','error','js_error','d1','{}',null,null,'error','error',null),
 (now()-interval '4 days','production','api','GET x','d1','{}',null,null,null,null,500),
 (now()-interval '8 days','production','error','js_error','d1','{}',null,null,'error','error',null),
 (now()-interval '1 day','production','session','start','d1','{\"src\":\"direct\"}','$(U 1)',null,null,null,null);
" >/dev/null

ok=0; ko=0
verif() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; ok=$((ok+1)); else echo "  ❌ $1 — attendu « $3 », obtenu « $2 »"; ko=$((ko+1)); fi; }
N() { Q "select coalesce((select n from public.croissance_jour where jour = (now() at time zone 'UTC')::date and mesure = '$1' and valeur = '$2'), 0)"; }

FICHIER "$M1" >/dev/null
verif "① visite instagram = 1 appareil (doublon, équipe, dev écartés)" "$(N visite instagram)" "1"
verif "① sans src, la source retombe sur referrer" "$(N visite direct)" "2"
verif "① valeur hostile nettoyée" "$(Q "select count(*) from public.croissance_jour where valeur ~ '[^a-z0-9_.?-]'")" "0"
verif "① inscription et campagne" "$(N inscription instagram)-$(N campagne lancement)" "1-1"
verif "① liens créés / envoyés / ouverts dédoublonnés" "$(N lien_cree post)-$(N lien_partage whatsapp)-$(N lien_ouvert external)" "1-1-1"
verif "② activité : identité serveur, ni e2e, ni équipe, ni dev" "$(Q "select string_agg(right(uid::text, 1), ',' order by jour, uid) from public.activite_jour")" "1,1,7"
Q "delete from auth.users where id = '$(U 7)'" >/dev/null
verif "② l'activité part avec le compte" "$(Q "select count(*) from public.activite_jour where uid = '$(U 7)'")" "0"
verif "③ purge_telemetry_7j retirée, deux tâches posées" "$(Q "select string_agg(jobname, ',' order by jobname) from cron.job")" "agreger_croissance,purge_telemetrie_paliers"
# La télémétrie de U7 (supprimé) est toujours là : le rejeu agrège ce jour-là.
verif "③ rejeu malgré la télémétrie d'un compte supprimé" "$(FICHIER "$M1" >/dev/null 2>&1 && echo ok || echo leve)" "ok"
verif "③ le compte supprimé ne revient pas dans l'activité" "$(Q "select count(*) from public.activite_jour where uid = '$(U 7)'")" "0"
verif "③ rejouable (deux tâches)" "$(Q "select count(*) from cron.job")" "2"
Q "select public.purge_telemetrie_paliers()" >/dev/null
verif "④ paliers : échec et 5xx de 4 j gardés, le reste parti" "$(Q "select string_agg(type, ',' order by type) from public.telemetry_events where received_at < now() - interval '2 days'")" "api,error"
verif "⑤ anon n'appelle pas pilotage_croissance" "$(COMME anon '' "select public.pilotage_croissance(30) is not null")" "REFUS"
verif "⑤ authenticated ne lit pas activite_jour" "$(COMME authenticated "$(U 1)" "select count(*) from public.activite_jour")" "REFUS"
verif "⑤ authenticated n'agrège pas" "$(COMME authenticated "$(U 1)" "select public.agreger_croissance(current_date)")" "REFUS"
verif "⑤ période bornée à 120 jours" "$(Q "select public.pilotage_croissance(9999) ->> 'jours'")" "120"
verif "⑤ cohortes sans e2e" "$(Q "select sum((c ->> 'taille')::int) from jsonb_array_elements(public.pilotage_croissance(30) -> 'cohortes') c")" "5"

Q "insert into public.posts(id,author_id,content) values ('p1','$(U 6)','bonjour'),('p2','$(U 6)','autre')" >/dev/null
FICHIER "$M2" >/dev/null
S() { Q "insert into public.reports(id,reporter_id,target_type,target_id,reason) values ('$1','$2','post','p1','x')" >/dev/null; }
MASQUE() { Q "select public.post_masque('p1')"; }
S r1 "$(U 1)"; S r2 "$(U 2)"; S r2b "$(U 2)"; S r3 "$(U 4)"; S r4 "$(U 6)"; S r5 inconnu
verif "⑥ 2 anciens + neuf + auteur + doublon + inconnu : rien" "$(MASQUE)" "f"
S r6 "$(U 3)"
verif "⑥ 3 anciens confirmés distincts : masquée" "$(MASQUE)" "t"
verif "⑥ un autre compte ne la voit plus" "$(COMME authenticated "$(U 1)" "select count(*) from public.posts where id = 'p1'")" "0"
verif "⑥ l'auteur la voit encore" "$(COMME authenticated "$(U 6)" "select count(*) from public.posts where id = 'p1'")" "1"
verif "⑥ l'autre publication reste visible" "$(COMME authenticated "$(U 1)" "select count(*) from public.posts where id = 'p2'")" "1"
Q "update public.contenus_masques set decision = 'retabli' where target_id = 'p1'" >/dev/null
verif "⑥ rétablie : visible" "$(COMME authenticated "$(U 1)" "select count(*) from public.posts where id = 'p1'")" "1"
S r7 "$(U 1)"
verif "⑥ rétablie : jamais remasquée par la machine" "$(MASQUE)" "f"
verif "⑥ un client ne lit pas contenus_masques" "$(COMME authenticated "$(U 1)" "select count(*) from public.contenus_masques")" "REFUS"
FICHIER "$M2" >/dev/null
verif "⑦ pré-tri rejouable (une policy restrictive)" "$(Q "select count(*) from pg_policies where tablename = 'posts' and policyname = 'Masquage apres signalements'")" "1"

echo "banc croissance + pré-tri : $ok vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
