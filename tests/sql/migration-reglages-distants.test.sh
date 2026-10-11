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
#     lignes passé aux deux : le JS de _shared/pilotage.js fait foi) ; et les
#     deux mesures qui pilotent le délestage comptent des `auth_uid` DISTINCTS
#     — un compte qui forge 50 appareils, ou des lignes « 500 » sous la clé
#     anon, n'y pèsent qu'une fois, ou pas du tout ;
#   ⑤ ni anon ni authenticated ne peuvent l'exécuter ;
#   ⑥ la variante qui oublierait le revoke d'anon sur la TABLE fait LEVER le
#     verdict et n'applique rien.
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
  auth_uid uuid, type text not null default 'action', http_status integer
);
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
 {"user_id":"","device_id":"","platform":"android","connection":null,"meta":{},"auth_uid":null}
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
verif "④ le jeu de lignes n'est pas trivial" "$ATTENDU" "2,3,3"
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
verif "④ hors fenêtre et hors production : jamais comptés (3 + 50 appareils publics)" "$(R service_role "select public.pilotage_audience(300)->>'appareils'")" "53"
verif "④ connexions = comptes DISTINCTS (auth_uid serveur), 50 appareils forgés = 1" "$(R service_role "select public.pilotage_audience(300)->>'comptes_connectes'")" "4"
verif "④ pannes = comptes DISTINCTS touchés en 15 min, lignes anon forgées ignorées" "$(R service_role "select public.pilotage_audience(300)->>'comptes_5xx_15min'")" "2"
verif "④ fenêtre bornée (60 s au moins, 24 h au plus)" "$(R service_role "select (public.pilotage_audience(5)->>'secondes') || '/' || (public.pilotage_audience(999999)->>'secondes')")" "60/86400"

refuse "⑤ anon n'exécute pas pilotage_audience" anon "select public.pilotage_audience(300)"
refuse "⑤ authenticated n'exécute pas pilotage_audience" authenticated "select public.pilotage_audience(300)"

# ⑥ Mutation : sans le revoke de la TABLE pour anon, le verdict doit LEVER.
Q "drop function public.pilotage_audience(integer); drop table public.reglages_distants;" >/dev/null
MUTANT="$BASE/mutant.sql"
grep -v "revoke all on table public.reglages_distants from anon;" "$MIGRATION" > "$MUTANT"; chmod a+r "$MUTANT"
if FICHIER "$MUTANT" >/dev/null 2>&1; then verif "⑥ mutant refusé" "appliqué" "levé"; else verif "⑥ mutant refusé" "levé" "levé"; fi
verif "⑥ rien d'appliqué" "$(Q "select count(*) from pg_class where relname = 'reglages_distants'")" "0"

echo "Banc reglages-distants : $ok OK, $ko échec(s)"
[ "$ko" -eq 0 ]
