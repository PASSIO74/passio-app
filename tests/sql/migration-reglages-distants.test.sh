#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_reglages_distants_2026-10-11.sql
#
# Ce qu'il protège :
#   ① la table existe, RLS active ; anon et authenticated LISENT (cle, valeur,
#     maj) et rien d'autre — ni motif, ni auteur, ni aucune écriture — MALGRÉ
#     les grants par défaut que Supabase pose sur toute nouvelle table
#     (reproduits ici : un PostgreSQL nu n'a pas ce piège, et un banc sans lui
#     serait vert par accident) ; service_role écrit ;
#   ② la base borne la forme : clé, auteur, objet JSON ;
#   ③ la migration est REJOUABLE ;
#   ④ pilotage_audience compte EXACTEMENT comme `compterAudience` (même jeu de
#     lignes passé aux deux, `platform` NULL compris : le JS fait foi) ;
#   ⑤ ni anon ni authenticated n'exécutent les trois fonctions ;
#   ⑥ les variantes dangereuses font LEVER le verdict et n'appliquent rien :
#     revoke d'anon oublié, colonne réservée rendue lisible, table préexistante
#     sans ses contraintes ;
#   ⑦ les signaux de la veille ne comptent que des comptes RÉELS ET ANCIENS
#     (auth.users : e-mail confirmé, pas anonyme, 7 jours / 24 h) — dix comptes
#     neufs qui forgent une ligne « 503 » ne délestent rien ; la saturation se
#     lit, et l'aveuglement contre le mur qui coupe vraiment les signaux (le
#     total sous trg_debit_global, le réservoir des anciens sous
#     trg_debit_lot) ; sur 24 h, les signaux valent NULL ;
#   ⑧ pilotage_familles_erreurs : familles par comptes anciens DISTINCTS, les
#     NOUVELLES d'abord ; des lignes anonymes ou de comptes neufs ne rendent ni
#     « nouvelle » ni « déjà vue » une famille.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_reglages_distants_2026-10-11.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v node >/dev/null || { echo "❌ node introuvable (confrontation avec compterAudience)"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable"; exit 1; }

PORT=$(( 6700 + RANDOM % 120 ))
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

DB=reglages
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# Une requête jouée SOUS un rôle, dans la même transaction que le `set role`.
R() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "begin; set local role $1; $2; commit;" 2>&1; }
FICHIER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }

Q "
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
-- Les grants PAR DÉFAUT de Supabase : tout pour les trois rôles sur ce qui se crée dans public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create table public.telemetry_events (
  id bigserial primary key, env text not null default 'production', received_at timestamptz not null default now(),
  user_id text, device_id text, platform text, connection text, meta jsonb not null default '{}'::jsonb,
  auth_uid uuid, type text not null default 'action', http_status integer,
  status text, endpoint text, message text, app_version text
);
-- La partie d'auth.users que lisent les signaux (colonnes réelles de la production, lues le 2026-10-13).
create schema auth;
create table auth.users (id uuid primary key, created_at timestamptz not null default now(),
  email_confirmed_at timestamptz, is_anonymous boolean not null default false);
" >/dev/null

ok=0; ko=0
verif() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; ok=$((ok+1)); else echo "  ❌ $1 — attendu « $3 », obtenu « $2 »"; ko=$((ko+1)); fi; }
refuse() { if R "$2" "$3" >/dev/null 2>&1; then verif "$1" "accepté" "refusé"; else verif "$1" "refusé" "refusé"; fi; }

FICHIER "$MIGRATION" >/dev/null
verif "① RLS active" "$(Q "select relrowsecurity::text from pg_class where oid='public.reglages_distants'::regclass")" "true"
Q "insert into public.reglages_distants(cle, valeur, pose_par, motif) values ('delestage', '{\"niveau\":1}', 'veille', 'connexions à 84 %')" >/dev/null
verif "① anon lit (cle, valeur, maj)" "$(R anon "select cle || ':' || (valeur->>'niveau') from public.reglages_distants")" "delestage:1"
verif "① authenticated lit aussi" "$(R authenticated "select count(*) from public.reglages_distants")" "1"
refuse "① anon ne lit pas le motif" anon "select motif from public.reglages_distants"
refuse "① authenticated ne lit pas l'auteur" authenticated "select pose_par from public.reglages_distants"
refuse "① anon ne lit pas tout (select *)" anon "select * from public.reglages_distants"
refuse "① anon n'écrit pas" anon "insert into public.reglages_distants(cle, valeur, pose_par) values ('bandeau', '{\"texte\":\"x\"}', 'pilote')"
refuse "① authenticated ne modifie pas" authenticated "update public.reglages_distants set valeur = '{\"niveau\":0}'"
refuse "① authenticated n'efface pas" authenticated "delete from public.reglages_distants"
verif "① service_role écrit (upsert)" "$(R service_role "insert into public.reglages_distants(cle, valeur, pose_par) values ('delestage', '{\"niveau\":2}', 'pilote') on conflict (cle) do update set valeur = excluded.valeur, pose_par = excluded.pose_par returning valeur->>'niveau'")" "2"

refuse "② clé inconnue refusée" service_role "insert into public.reglages_distants(cle, valeur, pose_par) values ('autre', '{}', 'pilote')"
refuse "② auteur inconnu refusé" service_role "insert into public.reglages_distants(cle, valeur, pose_par) values ('bandeau', '{\"texte\":\"x\"}', 'pirate')"
refuse "② valeur non objet refusée" service_role "insert into public.reglages_distants(cle, valeur, pose_par) values ('bandeau', '[1]', 'pilote')"

FICHIER "$MIGRATION" >/dev/null
verif "③ rejouable : la ligne survit" "$(Q "select valeur->>'niveau' from public.reglages_distants where cle='delestage'")" "2"
verif "③ rejouable : une seule politique" "$(Q "select count(*) from pg_policies where tablename='reglages_distants'")" "1"

# ④ Même jeu de lignes pour la base et pour compterAudience (le JS fait foi).
A1=aaaaaaaa-0000-4000-8000-000000000001; A4=aaaaaaaa-0000-4000-8000-000000000004
A5=aaaaaaaa-0000-4000-8000-000000000005; A6=aaaaaaaa-0000-4000-8000-000000000006
LIGNES='[
 {"user_id":"u1","device_id":"d1","platform":"android","connection":null,"meta":{},"auth_uid":"'$A1'"},
 {"user_id":"u1","device_id":"d1","platform":"android","connection":null,"meta":{},"auth_uid":"'$A1'"},
 {"user_id":null,"device_id":"d2","platform":"windows","connection":null,"meta":{},"auth_uid":null},
 {"user_id":null,"device_id":"d3","platform":"linux","connection":null,"meta":{"trafic":"robot"},"auth_uid":null},
 {"user_id":"u4","device_id":"d4","platform":"ios","connection":"4g","meta":{},"auth_uid":"'$A4'"},
 {"user_id":"u5","device_id":"d5","platform":"android","connection":null,"meta":{"trafic":"equipe"},"auth_uid":"'$A5'"},
 {"user_id":"u5","device_id":"d5","platform":"android","connection":null,"meta":{},"auth_uid":"'$A5'"},
 {"user_id":"u6","device_id":"d6","platform":"android","connection":"","meta":{"trafic":"pirate"},"auth_uid":"'$A6'"},
 {"user_id":"","device_id":"","platform":"android","connection":null,"meta":{},"auth_uid":null},
 {"user_id":"u7","device_id":"d7","platform":null,"connection":"4g","meta":{},"auth_uid":null},
 {"user_id":"u8","device_id":"d8","platform":null,"connection":null,"meta":{},"auth_uid":null}
]'
Q "insert into public.telemetry_events(user_id, device_id, platform, connection, meta, auth_uid)
   select user_id, device_id, platform, connection, meta, auth_uid from jsonb_to_recordset('$LIGNES'::jsonb)
     as x(user_id text, device_id text, platform text, connection text, meta jsonb, auth_uid uuid)" >/dev/null
ATTENDU="$(cd "$RACINE" && LIGNES="$LIGNES" node --no-warnings --input-type=module -e "
import { compterAudience } from './supabase/functions/_shared/pilotage.js';
const l = JSON.parse(process.env.LIGNES).map((r) => ({ ...r, trafic: r.meta.trafic }));
const a = compterAudience(l);
process.stdout.write([a.comptes, a.appareils, a.horsPublic].join(','));")"
OBTENU="$(R service_role "select concat_ws(',', a->>'comptes', a->>'appareils', a->>'hors_public') from (select public.pilotage_audience(300) a) x")"
verif "④ pilotage_audience = compterAudience (comptes, appareils, hors public)" "$OBTENU" "$ATTENDU"
verif "④ le jeu de lignes n'est pas trivial (platform NULL compris)" "$ATTENDU" "4,5,3"
# A1, A4, A5, A6 : comptes anciens (30 jours), e-mail confirmé.
Q "insert into auth.users(id, created_at, email_confirmed_at) select x::uuid, now() - interval '30 days', now() - interval '30 days'
   from unnest(array['$A1','$A4','$A5','$A6']) x" >/dev/null
# Un SEUL compte (A6) qui forge 50 appareils : il ne pèse qu'une connexion.
Q "insert into public.telemetry_events(user_id, device_id, auth_uid) select 'u6', 'forge' || g, '$A6' from generate_series(1, 50) g" >/dev/null
# Pannes serveur : 3 lignes d'un même compte, 1 d'un autre, 40 forgées sous la clé anon (auth_uid NULL), 1 trop ancienne.
Q "insert into public.telemetry_events(type, http_status, auth_uid) select 'api', 503, '$A1' from generate_series(1, 3);
   insert into public.telemetry_events(type, http_status, auth_uid) values ('api', 500, '$A4');
   insert into public.telemetry_events(type, http_status, auth_uid) select 'api', 500, null from generate_series(1, 40);
   insert into public.telemetry_events(type, http_status, auth_uid, received_at) values ('api', 500, '$A5', now() - interval '20 minutes')" >/dev/null
# Hors fenêtre et hors production : jamais comptés.
Q "insert into public.telemetry_events(user_id, device_id, received_at) values ('vieux','dv', now() - interval '2 days');
   insert into public.telemetry_events(env, user_id, device_id) values ('development','dev','dd')" >/dev/null
verif "④ hors fenêtre et hors production : jamais comptés (5 + 50 appareils publics)" "$(R service_role "select public.pilotage_audience(300)->>'appareils'")" "55"
verif "④ connexions = comptes DISTINCTS (auth_uid serveur), 50 appareils forgés = 1" "$(R service_role "select public.pilotage_audience(300)->>'comptes_connectes'")" "4"
verif "④ pannes = comptes DISTINCTS touchés en 15 min, lignes anon forgées ignorées" "$(R service_role "select public.pilotage_audience(300)->>'comptes_5xx_15min'")" "2"
verif "④ fenêtre bornée (60 s au moins, 24 h au plus)" "$(R service_role "select (public.pilotage_audience(5)->>'secondes') || '/' || (public.pilotage_audience(999999)->>'secondes')")" "60/86400"

verif "④ 24 h : les signaux de la veille valent NULL (personne ne les lit, une passe coûte)" "$(R service_role "select concat_ws('/', coalesce(a->>'comptes_connectes','nul'), coalesce(a->>'comptes_5xx_15min','nul'), coalesce(a->>'comptes_echecs_30min','nul'), coalesce(a->>'saturation_minute_max','nul'), coalesce(a->>'saturation_aveugle','nul'), coalesce(a->>'saturation_plafond','nul')) from (select public.pilotage_audience(86400) a) x")" "nul/nul/nul/nul/nul/nul"

# ⑦ Comptes neufs (1 h), non confirmé, anonyme : forgent des « 503 » — aucun ne compte.
N="bbbbbbbb-0000-4000-8000-0000000000"
Q "insert into auth.users(id, created_at, email_confirmed_at) select ('$N' || lpad(g::text, 2, '0'))::uuid, now() - interval '1 hour', now() - interval '1 hour' from generate_series(1, 10) g;
   insert into auth.users(id, created_at, email_confirmed_at) values ('cccccccc-0000-4000-8000-000000000001', now() - interval '30 days', null);
   insert into auth.users(id, created_at, email_confirmed_at, is_anonymous) values ('cccccccc-0000-4000-8000-000000000002', now() - interval '30 days', now() - interval '30 days', true);
   insert into public.telemetry_events(type, status, http_status, auth_uid) select 'api', 'error', 503, id from auth.users where created_at > now() - interval '2 hours' or email_confirmed_at is null or is_anonymous" >/dev/null
verif "⑦ dix comptes neufs, un non confirmé, un anonyme forgent « 503 » : toujours 2 comptes" "$(R service_role "select public.pilotage_audience(300)->>'comptes_5xx_15min'")" "2"
verif "⑦ la CHARGE (connexions) les compte tous : c'est la charge même" "$(R service_role "select public.pilotage_audience(300)->>'comptes_connectes'")" "16"
# Échecs en 30 min (réveil) : comptes de plus de 24 h. D1 a 2 jours.
D1=dddddddd-0000-4000-8000-000000000001
Q "insert into auth.users(id, created_at, email_confirmed_at) values ('$D1', now() - interval '2 days', now() - interval '2 days');
   insert into public.telemetry_events(type, message, auth_uid) values ('error', 'TypeError: boom', '$A1'), ('error', '', '$A4'), ('error', 'TypeError: neuf', '${N}01');
   insert into public.telemetry_events(type, status, http_status, endpoint, auth_uid, meta) values
     ('api', 'error', 500, 'x.supabase.co/rest/v1/posts?select=*', '$D1', '{}'),
     ('api', 'error', 404, 'x.supabase.co/rest/v1/reglages_distants', '$A4', '{\"refus_attendu\":true}'),
     ('api', 'error', 400, 'x.supabase.co/auth/v1/token?grant_type=refresh_token', '$A5', '{}'),
     ('api', 'error', 0, 'x.supabase.co/rest/v1/posts', '$A6', '{}'),
     ('api', 'ok', 200, 'x.supabase.co/rest/v1/posts', '$A6', '{}')" >/dev/null
verif "⑦ échecs en 30 min : A1 (erreur) + D1 (api 500) ; ni refus attendu, ni jeton, ni réseau, ni compte neuf" "$(R service_role "select public.pilotage_audience(300)->>'comptes_echecs_30min'")" "2"
verif "⑦ famille d'une erreur" "$(R service_role "select public.pilotage_famille_echec('error', null, null, null, 'TypeError: x', '{}')")" "error:TypeError: x"
verif "⑦ famille d'un appel : statut et CHEMIN (hôte et requête retirés)" "$(R service_role "select public.pilotage_famille_echec('api', 'error', 403, 'h.supabase.co/rest/v1/events?select=a,b', null, '{}')")" "api:403 /rest/v1/events"
verif "⑦ pas un échec : message vide, statut 0, refus attendu, 2xx" "$(R service_role "select count(*) from (values (public.pilotage_famille_echec('error', null, null, null, '', '{}')), (public.pilotage_famille_echec('api', 'error', 0, 'h/x', null, '{}')), (public.pilotage_famille_echec('api', 'error', 409, 'h/x', null, '{\"refus_attendu\":true}')), (public.pilotage_famille_echec('api', 'ok', 200, 'h/x', null, '{}'))) v(f) where f is not null")" "0"
Q "insert into public.telemetry_events(received_at) select date_trunc('minute', now()) - interval '2 minutes' + interval '1 second' from generate_series(1, 120)" >/dev/null
verif "⑦ saturation : la pire minute des 5 dernières se lit" "$(R service_role "select ((public.pilotage_audience(300)->>'saturation_minute_max')::int >= 120)::text")" "true"
verif "⑦ aveugle sous le plafond global (pas de trg_debit_lot) : la saturation totale, contre 3 000" \
  "$(R service_role "select (a->>'saturation_aveugle' = a->>'saturation_minute_max')::text || '/' || (a->>'saturation_plafond') from (select public.pilotage_audience(300) a) x")" "true/3000"
# Sous le limiteur par lot, l'aveuglement se lit sur le réservoir des ANCIENS : un
# flot anonyme de 5 000 ne rend pas la veille aveugle, 1 700 anciens si.
Q "create table public.telemetrie_debit (minute timestamptz, reservoir text, source text, n integer, primary key (minute, reservoir, source));
   create function public.telemetrie_plafond(p text) returns integer language sql immutable as \$\$ select case p when 'anciens' then 1800 end \$\$;
   create function public.banc_rien() returns trigger language plpgsql as \$\$ begin return null; end \$\$;
   create trigger trg_debit_lot after insert on public.telemetry_events referencing new table as nouvelles for each statement execute function public.banc_rien();
   insert into public.telemetrie_debit values (date_trunc('minute', now()), 'anonymes', '*', 5000), (date_trunc('minute', now()) - interval '2 minutes', 'anciens', '*', 900),
     (date_trunc('minute', now()) - interval '1 minute', 'anciens', '*', 1700), (date_trunc('minute', now()) - interval '20 minutes', 'anciens', '*', 1800),
     (date_trunc('minute', now()), 'anciens', 'u:eeeeeeee-0000-4000-8000-000000000099', 2000)" >/dev/null
verif "⑦ aveugle sous trg_debit_lot : le pire des anciens (source *) des 5 dernières minutes, contre 1 800" \
  "$(R service_role "select (a->>'saturation_aveugle') || '/' || (a->>'saturation_plafond') from (select public.pilotage_audience(300) a) x")" "1700/1800"
# Les deux murs à la fois (migration du 11/09 rejouée après celle du 16/10) : le pire des deux.
Q "create trigger trg_debit_global after insert on public.telemetry_events for each statement execute function public.banc_rien();
   insert into public.telemetry_events(received_at) select date_trunc('minute', now()) - interval '3 minutes' + interval '1 second' from generate_series(1, 2950)" >/dev/null
verif "⑦ deux murs actifs : le pire des deux (total 2 950/3 000 > anciens 1 700/1 800)" \
  "$(R service_role "select ((a->>'saturation_aveugle')::int >= 2950)::text || '/' || (a->>'saturation_plafond') from (select public.pilotage_audience(300) a) x")" "true/3000"
Q "drop trigger trg_debit_global on public.telemetry_events" >/dev/null
verif "⑦ le mur global retiré : de nouveau les anciens" "$(R service_role "select (a->>'saturation_aveugle') || '/' || (a->>'saturation_plafond') from (select public.pilotage_audience(300) a) x")" "1700/1800"
Q "alter table public.telemetry_events disable trigger trg_debit_lot" >/dev/null
verif "⑦ trg_debit_lot désactivé : retour au plafond global" "$(R service_role "select public.pilotage_audience(300)->>'saturation_plafond'")" "3000"
Q "drop trigger trg_debit_lot on public.telemetry_events; drop function public.banc_rien(); drop function public.telemetrie_plafond(text); drop table public.telemetrie_debit" >/dev/null

# ⑧ Familles d'échec d'une version (mise en ligne il y a 30 min).
V=abcdef12; W=ffff0000
O="eeeeeeee-0000-4000-8000-0000000000"
Q "insert into auth.users(id, created_at, email_confirmed_at) select ('$O' || lpad(g::text, 2, '0'))::uuid, now() - interval '30 days', now() - interval '30 days' from generate_series(1, 6) g;
   -- Nouvelle sur V : 5 comptes anciens. Vue ailleurs par UN seul compte ancien, des anonymes et un compte neuf : toujours nouvelle.
   insert into public.telemetry_events(type, message, app_version, auth_uid) select 'error', 'TypeError: neuf', '$V', ('$O' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 5) g;
   insert into public.telemetry_events(type, message, app_version, auth_uid) values ('error', 'TypeError: neuf', '$W', '${O}06'), ('error', 'TypeError: neuf', '$W', '${N}02');
   insert into public.telemetry_events(type, message, app_version, auth_uid) select 'error', 'TypeError: neuf', '$W', null from generate_series(1, 30);
   -- Bruit de fond : 3 comptes sur V, 2 comptes anciens sur W → déjà vue.
   insert into public.telemetry_events(type, message, app_version, auth_uid) select 'error', 'Bruit', '$V', ('$O' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 3) g;
   insert into public.telemetry_events(type, message, app_version, auth_uid) select 'error', 'Bruit', '$W', ('$O' || lpad(g::text, 2, '0'))::uuid from generate_series(4, 5) g;
   -- Un appel qui casse sur V : 2 comptes anciens.
   insert into public.telemetry_events(type, status, http_status, endpoint, app_version, auth_uid) select 'api', 'error', 500, 'x.supabase.co/rest/v1/posts?select=*', '$V', ('$O' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 2) g;
   -- Une famille forgée par dix comptes neufs, et des lignes antérieures à la mise en ligne : absentes.
   insert into public.telemetry_events(type, message, app_version, auth_uid) select 'error', 'Forge', '$V', ('$N' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 10) g;
   insert into public.telemetry_events(type, message, app_version, auth_uid, received_at) select 'error', 'Avant', '$V', ('$O' || lpad(g::text, 2, '0'))::uuid, now() - interval '2 hours' from generate_series(1, 6) g" >/dev/null
verif "⑧ familles : nouvelles d'abord, comptes anciens distincts, déjà vue = 2 comptes anciens ailleurs" \
  "$(R service_role "select string_agg(famille || '=' || comptes || '/' || comptes_ailleurs, ' | ') from public.pilotage_familles_erreurs('$V', now() - interval '30 minutes')")" \
  "error:TypeError: neuf=5/1 | api:500 /rest/v1/posts=2/0 | error:Bruit=3/2"
verif "⑧ version invalide : rien" "$(R service_role "select count(*) from public.pilotage_familles_erreurs('x'' or 1=1', now())")" "0"
verif "⑧ mise en ligne de plus de 24 h : bornée à 24 h (les lignes « Avant » de 2 h comptent)" \
  "$(R service_role "select count(*) from public.pilotage_familles_erreurs('$V', now() - interval '10 days') where famille = 'error:Avant'")" "1"

refuse "⑤ anon n'exécute pas pilotage_audience" anon "select public.pilotage_audience(300)"
refuse "⑤ authenticated n'exécute pas pilotage_audience" authenticated "select public.pilotage_audience(300)"
refuse "⑤ authenticated n'exécute pas pilotage_familles_erreurs" authenticated "select * from public.pilotage_familles_erreurs('abcdef12', now())"
refuse "⑤ anon n'exécute pas pilotage_familles_erreurs" anon "select * from public.pilotage_familles_erreurs('abcdef12', now())"
refuse "⑤ anon n'exécute pas pilotage_famille_echec" anon "select public.pilotage_famille_echec('error', null, null, null, 'x', '{}')"

# ⑥ Mutations : chacune doit faire LEVER le verdict, et rien n'est appliqué.
Q "drop function public.pilotage_audience(integer); drop function public.pilotage_familles_erreurs(text, timestamptz);
   drop function public.pilotage_famille_echec(text, text, integer, text, text, jsonb); drop table public.reglages_distants;" >/dev/null
MUTANT="$BASE/mutant.sql"
mutant() {   # $1 = libellé ; le fichier $MUTANT est déjà écrit
  chmod a+r "$MUTANT"
  if FICHIER "$MUTANT" >/dev/null 2>&1; then verif "⑥ $1 : verdict" "appliqué" "levé"; else verif "⑥ $1 : verdict" "levé" "levé"; fi
  verif "⑥ $1 : rien d'appliqué" "$(Q "select (to_regclass('public.reglages_distants') is not null)::int + (select count(*) from pg_proc where proname like 'pilotage_%')::int")" "0"
}
grep -v "revoke all on table public.reglages_distants from anon;" "$MIGRATION" > "$MUTANT"
mutant "revoke d'anon oublié"
sed 's/^do \$v\$$/grant select (motif) on table public.reglages_distants to authenticated;\ndo $v$/' "$MIGRATION" > "$MUTANT"
grep -q "grant select (motif)" "$MUTANT" || { echo "❌ mutant motif non construit"; exit 1; }
mutant "motif lisible par authenticated"
sed 's/^do \$v\$$/grant update (valeur) on table public.reglages_distants to authenticated;\ndo $v$/' "$MIGRATION" > "$MUTANT"
grep -q "grant update (valeur)" "$MUTANT" || { echo "❌ mutant update non construit"; exit 1; }
mutant "écriture par colonne"
sed 's/^do \$v\$$/grant execute on function public.pilotage_famille_echec(text, text, integer, text, text, jsonb) to anon;\ndo $v$/' "$MIGRATION" > "$MUTANT"
grep -q "to anon;$" "$MUTANT" || { echo "❌ mutant execute non construit"; exit 1; }
mutant "fonction exécutable par anon"
Q "create table public.reglages_distants (cle text primary key, valeur jsonb, pose_par text, motif text, maj timestamptz not null default now())" >/dev/null
if FICHIER "$MIGRATION" >/dev/null 2>&1; then verif "⑥ table préexistante sans contraintes : verdict" "appliqué" "levé"; else verif "⑥ table préexistante sans contraintes : verdict" "levé" "levé"; fi
verif "⑥ table préexistante : aucune fonction posée" "$(Q "select count(*) from pg_proc where proname like 'pilotage_%'")" "0"

echo "Banc reglages-distants : $ok OK, $ko échec(s)"
[ "$ko" -eq 0 ]
