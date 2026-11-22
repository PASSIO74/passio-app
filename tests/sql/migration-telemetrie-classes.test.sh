#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_telemetrie_classes_2026-11-21.sql
#        (audit « la surveillance tient-elle à 100 000 utilisateurs ? » du 20/11, trou T2)
#
# Sur un PostgreSQL jetable, avec la STRUCTURE de production (tests/sql/fixtures/socle-production-
# 2026-11-06.sql, lue au catalogue) portée à l'état du 15/11 par les migrations du dépôt, dans
# l'ordre où la production les a reçues. Aucune donnée réelle, aucune cible distante (127.0.0.1).
#
#   ① AVANT : le défaut est MESURÉ — pas de lecture du remplissage ; une mesure de performance de
#     30 h survit aux deux purges ; sous une borne abaissée, le lot d'un visiteur est refusé EN
#     ENTIER, son erreur comprise ;
#   ② la migration s'applique DEUX fois : 8 contrôles OK, aucun ECHEC, 8 déclencheurs, 5 tâches ;
#   ③ APRÈS, à seuils abaissés (déclencheurs d'épreuve : ceux de la migration ne sont pas touchés) :
#     palier 1 = seule la perf ordinaire est écartée ; palier 2 = seul le protégé reste ; un compte
#     sous son seuil et la clé de service ne sont jamais délestés ; un lot entièrement écarté est
#     ACCEPTÉ ; seules les lignes écrites comptent au débit ; 121 lignes restent refusées (PT413) ;
#     l'heure et l'identité restent posées par le serveur ; la borne haute refuse toujours le lot ;
#   ④ la lecture : valeurs relues des déclencheurs, droits, statistiques remises à zéro ;
#   ⑤ la purge courte : ce qui part, ce qui reste, les comptes agrégés AVANT, croissance_jour
#     inchangée après la purge quotidienne, rejeu à 0, budget épuisé = un lot quand même ;
#   ⑥ les purges du 15/11 rendent ce qu'elles rendaient ;
#   ⑦ aux VRAIS seuils (480 000, 720 000, 800 000, 1 080 000, 1 200 000 lignes, encadrés), les déclencheurs
#     de la migration elle-même, sans déclencheur d'épreuve ; puis la durée d'un passage de purge
#     sur 1,2 million de lignes, contre la coupure de 120 s de la production ;
#   ⑧ MUTANTS : chaque garde de la migration est retirée tour à tour (sed sur une copie), et SON
#     cas — ou le verdict du fichier — doit rougir. Un mutant dont la cible est introuvable rougit.
#
#   bash tests/sql/migration-telemetrie-classes.test.sh
#
# Deux pièges mesurés : les statistiques d'une table ne sont à jour qu'APRÈS la fin de la session
# qui a écrit — chaque cas fait donc `analyze` dans un appel séparé ; et une ligne ANCIENNE ne
# s'écrit que sous `session_replication_role = replica` (le déclencheur d'identité repose l'heure).
# ⚠️ PostgreSQL 16 ici, 17.6 en production : la lecture de pg_stat_get_live_tuples dans un
# déclencheur par ligne n'est éprouvée que sur 16 (limite écrite dans la fiche du journal).
# ══════════════════════════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
SOCLE="$RACINE/tests/sql/fixtures/socle-production-2026-11-06.sql"
MIGRATION="$RACINE/migrations/migration_telemetrie_classes_2026-11-21.sql"
T15="$RACINE/migrations/migration_securite_lot4_telemetrie_2026-11-15.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
for f in "$SOCLE" "$MIGRATION" "$T15"; do [ -f "$f" ] || { echo "❌ fichier introuvable : $f"; exit 1; }; done

PORT=$(( 6240 + RANDOM % 50 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"
  SU="su pgbanc -c"
  chmod -R a+rX "$RACINE/tests/sql/fixtures" "$RACINE/migrations" 2>/dev/null || true
else
  BASE="$(mktemp -d)"
  SU="bash -c"
fi
MUT="$(mktemp -d)"; chmod a+rx "$MUT"
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE" "$MUT"; }
trap nettoyer EXIT

lancer "initdb -D '$BASE/data' -A trust -U postgres -E UTF8 --locale=C" >/dev/null 2>&1
case "$(uname -s)" in MINGW*|MSYS*) SOCKET="" ;; *) SOCKET="-k $BASE" ;; esac
lancer "pg_ctl -D '$BASE/data' -o \"-p $PORT $SOCKET -c listen_addresses=127.0.0.1 -c timezone=UTC -c fsync=off\" -l '$BASE/pg.log' start" >/dev/null 2>&1 &
demarre=0
for _ in $(seq 1 60); do
  psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -tA -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }
  sleep 0.5
done
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

QD()      { psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$1" -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
FICHIER() { psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$1" -tA -F '§' -q -v ON_ERROR_STOP=1 -f "$2" 2>&1; }
# Une instruction jouée SOUS un rôle et une identité, dans sa transaction (comme PostgREST) :
# « ok », ou « refus:<SQLSTATE> ». $1 base · $2 rôle · $3 identifiant du compte ou "" · $4 SQL.
SOUS() {
  local claims out
  claims="{\"role\":\"$2\"$([ -n "$3" ] && printf ',"sub":"%s"' "$3")}"
  if out="$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$1" -tA -q -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
      -c "begin; set local role $2; set local request.jwt.claims = '$claims'; $4; commit;" 2>&1)"; then echo ok
  else echo "refus:$(printf '%s' "$out" | grep -oE 'ERROR:  [A-Z0-9]{5}' | head -1 | cut -c9-)"; fi
}

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$3" "$2"; fi; }

U1=aaaaaaaa-0000-4000-8000-000000000001   # compte de 30 jours, confirmé : il écrit des lots
UA=aaaaaaaa-0000-4000-8000-00000000000a   # sa SEULE ligne est une perf du jour « jour » de la purge
UB=aaaaaaaa-0000-4000-8000-00000000000b   # sa SEULE ligne est une perf du jour « jour - 1 »

# ── Le décor : la structure de production, portée à l'état du 15/11 comme la production l'a été ──
QD postgres "create database tc_socle" >/dev/null
if ! sortie="$(FICHIER tc_socle "$SOCLE")"; then echo "❌ socle : $sortie" | head -5; exit 1; fi
for lot in lot1_2026-11-06 lot2_2026-11-06 lot3_2026-11-06; do
  if ! sortie="$(FICHIER tc_socle "$RACINE/migrations/migration_securite_$lot.sql")"; then echo "❌ décor $lot : $sortie" | head -5; exit 1; fi
done
# Le socle écrit les droits colonne par colonne ; le lot 4 du 07/11 attend le droit de table de la production.
QD tc_socle "grant select on public.events to authenticated" >/dev/null
if ! sortie="$(FICHIER tc_socle "$RACINE/migrations/migration_securite_lot4_2026-11-07.sql")"; then echo "❌ décor lot 4 : $sortie" | head -5; exit 1; fi
# Le socle exporte les fonctions, pas les tâches : celles que la production porte sont posées ici.
QD tc_socle "select cron.schedule('purge_telemetry_7j', '0 4 * * *', 'select public.purge_telemetry(7)'); select public.planifier_croissance();
  select cron.schedule('purge_telemetrie_debit', '*/15 * * * *', 'delete from public.telemetrie_debit where minute < now() - interval ''1 hour''');" >/dev/null \
  || { echo "❌ décor : tâches planifiées"; exit 1; }
sortie="$(FICHIER tc_socle "$T15")"
verifier "décor : la migration du 15/11 s'applique (5 OK)" "$(printf '%s\n' "$sortie" | grep -c '§OK$' || true)" "5"
# Les deux index de production que la purge emprunte (le socle ne porte que les contraintes).
QD tc_socle "create index idx_tel_received on public.telemetry_events (received_at desc);
  create index idx_tel_type_received on public.telemetry_events (type, received_at);
  insert into auth.users (id, email, email_confirmed_at, created_at) values
    ('$U1', 'a@exemple.fr', now() - interval '30 days', now() - interval '30 days'),
    ('$UA', 'jour@exemple.fr', now() - interval '30 days', now() - interval '30 days'),
    ('$UB', 'veille@exemple.fr', now() - interval '30 days', now() - interval '30 days');" >/dev/null \
  || { echo "❌ décor : index et comptes"; exit 1; }
verifier "décor : les 7 déclencheurs de production sur telemetry_events" \
  "$(QD tc_socle "select string_agg(tgname || ':' || tgtype, ' ' order by tgname collate \"C\") from pg_trigger where tgrelid = 'public.telemetry_events'::regclass and not tgisinternal")" \
  "aa_ligne_bornee:23 aa_table_bornee:6 trg_debit_avant:6 trg_debit_lot:4 trg_debit_taille:7 trg_telemetry_identite:7 zz_barriere_suppression:23"

# ── Outils des cas ─────────────────────────────────────────────────────────────────────────────
# Le lot d'épreuve : 13 lignes, 5 ordinaires et 8 protégées. $1 = session (elle nomme le cas).
LOT() { cat <<SQL
insert into public.telemetry_events (type, action, status, severity, http_status, correlation_id, session_id) values
 ('perf', 'lcp', null, 'info', null, null, '$1'),
 ('action', 'ui_open', 'ok', 'info', null, null, '$1'),
 ('click', 'btn', null, 'info', null, null, '$1'),
 ('nav', 'feed', null, 'info', null, null, '$1'),
 ('lifecycle', 'heartbeat', null, 'info', null, null, '$1'),
 ('perf', 'inp', null, 'warn', null, null, '$1'),
 ('click', 'btn', null, 'warn', null, null, '$1'),
 ('error', 'js_error', 'error', 'error', null, null, '$1'),
 ('lifecycle', 'sentinel_observation_canary', 'ok', 'info', null, 'can_1', '$1'),
 ('session', 'start', null, 'info', null, null, '$1'),
 ('action', 'acq_signup', null, 'info', null, null, '$1'),
 ('api', 'GET x', null, 'info', 500, null, '$1'),
 ('api', 'GET y', 'ok', 'info', 200, 'f_1', '$1')
SQL
}
TOUT="action:acq_signup:info action:ui_open:info api:GET x:info api:GET y:info click:btn:info click:btn:warn error:js_error:error lifecycle:heartbeat:info lifecycle:sentinel_observation_canary:info nav:feed:info perf:inp:warn perf:lcp:info session:start:info"
SANS_PERF="action:acq_signup:info action:ui_open:info api:GET x:info api:GET y:info click:btn:info click:btn:warn error:js_error:error lifecycle:heartbeat:info lifecycle:sentinel_observation_canary:info nav:feed:info perf:inp:warn session:start:info"
PROTEGE="action:acq_signup:info api:GET x:info api:GET y:info click:btn:warn error:js_error:error lifecycle:sentinel_observation_canary:info perf:inp:warn session:start:info"
# Ce qui a été ÉCRIT d'une session.
ECRIT() { QD "$1" "select coalesce(string_agg(type || ':' || action || ':' || severity, ' ' order by type, action, severity), 'rien') from public.telemetry_events where session_id = '$2'"; }
# La table à $2 lignes vivantes, statistiques à jour : vidée, remplie SANS déclencheur, puis analysée à part.
NIVEAU() {
  QD "$1" "truncate public.telemetry_events; set session_replication_role = replica;
    insert into public.telemetry_events (type, severity, session_id) select 'nav', 'info', 'remplir' from generate_series(1, $2);" >/dev/null
  QD "$1" "analyze public.telemetry_events" >/dev/null
}
# Les seuils ABAISSÉS : deux déclencheurs d'épreuve, à côté de ceux de la migration (jamais touchés).
# Visiteurs : confort 5, réserve 8, borne 12. Comptes : confort 100, réserve 200, borne 1 000.
SEUILS_BAS() {
  QD "$1" "create trigger zz_banc_pleine before insert on public.telemetry_events for each statement execute function public.telemetrie_bornee('12', '1000');
    do \$d\$ begin if to_regprocedure('public.telemetrie_classe_bornee()') is not null then
      create trigger zz_classe_bornee_banc before insert on public.telemetry_events for each row execute function public.telemetrie_classe_bornee('5', '100', '8', '200');
    end if; end \$d\$;" >/dev/null
}
# Un cas : niveau, lot sous un rôle, puis « <verdict de l'écriture> | <ce qui est écrit> ».
CAS() { # $1 base · $2 lignes vivantes · $3 rôle · $4 identifiant · $5 session
  NIVEAU "$1" "$2"
  local r; r="$(SOUS "$1" "$3" "$4" "$(LOT "$5")")"
  echo "$r | $(ECRIT "$1" "$5")"
}

echo "══ ① AVANT : le défaut est mesuré sur l'état du 15/11 ══"
QD postgres "create database tc_avant template tc_socle" >/dev/null
SEUILS_BAS tc_avant
verifier "avant : aucune lecture du remplissage" "$(QD tc_avant "select coalesce(to_regprocedure('public.telemetrie_remplissage()')::text, 'absente')")" "absente"
verifier "avant : sous la borne, le lot d'un visiteur passe entier (rien ne trie)" "$(CAS tc_avant 9 anon "" v_sous)" "ok | $TOUT"
verifier "avant : à la borne, le lot du visiteur est refusé EN ENTIER — son erreur et son canari avec" "$(CAS tc_avant 13 anon "" v_pleine)" "refus:PT429 | rien"
QD tc_avant "truncate public.telemetry_events; set session_replication_role = replica;
  insert into public.telemetry_events (type, action, severity, session_id, received_at) values ('perf', 'lcp', 'info', 'vieille', now() - interval '30 hours');" >/dev/null
QD tc_avant "select public.purge_telemetrie_paliers(); select public.purge_telemetrie_rattrapage();" >/dev/null
verifier "avant : une mesure de performance de 30 h survit aux deux purges (elle vivra 3 jours)" "$(ECRIT tc_avant vieille)" "perf:lcp:info"

echo "══ ② La migration s'applique, deux fois ══"
QD postgres "create database tc_apres template tc_socle" >/dev/null
for passe in 1 2; do
  sortie="$(FICHIER tc_apres "$MIGRATION")"; code=$?
  verifier "application $passe" "$code" "0"
  [ "$code" -ne 0 ] && printf '%s\n' "$sortie" | head -8
  verifier "application $passe : 8 contrôles OK" "$(printf '%s\n' "$sortie" | grep -c '§OK$' || true)" "8"
  verifier "application $passe : aucun ECHEC" "$(printf '%s\n' "$sortie" | grep -c '§ECHEC' || true)" "0"
  verifier "application $passe : le tableau est la dernière sortie (10 lignes, deux informations)" "$(printf '%s\n' "$sortie" | grep -c '§')/$(printf '%s\n' "$sortie" | grep -c '^information — ')" "10/2"
done
verifier "8 déclencheurs, celui de la classe en DERNIER des « avant insertion, par ligne »" \
  "$(QD tc_apres "select string_agg(tgname, ' ' order by tgname collate \"C\") from pg_trigger where tgrelid = 'public.telemetry_events'::regclass and not tgisinternal")" \
  "aa_ligne_bornee aa_table_bornee trg_debit_avant trg_debit_lot trg_debit_taille trg_telemetry_identite zz_barriere_suppression zz_classe_bornee"
verifier "5 tâches de télémétrie, la purge courte à :52" \
  "$(QD tc_apres "select string_agg(jobname || '[' || schedule || ']', ' ' order by jobname) from cron.job where jobname ~ '^(purge_telemetrie|agreger_croissance)'")" \
  "agreger_croissance[7 * * * *] purge_telemetrie_breve[52 * * * *] purge_telemetrie_debit[*/15 * * * *] purge_telemetrie_paliers[0 4 * * *] purge_telemetrie_rattrapage[37 * * * *]"
verifier "la migration n'appelle PAS la purge : le premier passage est celui de la tâche" "$(grep -c '^ *\(select\|perform\) public\.purge_telemetrie_breve()' "$MIGRATION")" "0"
verifier "la borne du 15/11 n'a pas bougé" "$(QD tc_apres "select replace(encode(tgargs, 'escape'), '\\000', '|') from pg_trigger where tgname = 'aa_table_bornee' and tgrelid = 'public.telemetry_events'::regclass")" "800000|1200000|"

echo "══ ④ La lecture du remplissage (avant les déclencheurs d'épreuve : elle ne lit que ceux de la migration) ══"
LECTURE() { QD "$1" "select (j->>'vivantes') || ' ' || (j->>'estimees') || ' ' || (j->>'borne_visiteurs') || ' ' || (j->>'borne_comptes') || ' ' || (j->>'confort_visiteurs') || ' ' || (j->>'confort_comptes') || ' ' || (j->>'reserve_visiteurs') || ' ' || (j->>'reserve_comptes') || ' ' || ((j->>'octets')::bigint > 0) from (select public.telemetrie_remplissage() as j) x"; }
NIVEAU tc_apres 37
verifier "lecture : lignes vivantes, estimation, bornes et seuils relus des déclencheurs" "$(LECTURE tc_apres)" "37 37 800000 1200000 480000 720000 720000 1080000 true"
verifier "lecture : la clé de service" "$(SOUS tc_apres service_role "" "select public.telemetrie_remplissage()")" "ok"
verifier "lecture : refusée à un visiteur" "$(SOUS tc_apres anon "" "select public.telemetrie_remplissage()")" "refus:42501"
verifier "lecture : refusée à un compte" "$(SOUS tc_apres authenticated "$U1" "select public.telemetrie_remplissage()")" "refus:42501"
verifier "purge courte : refusée à un compte" "$(SOUS tc_apres authenticated "$U1" "select public.purge_telemetrie_breve()")" "refus:42501"
verifier "classification : refusée à un visiteur" "$(SOUS tc_apres anon "" "select public.telemetrie_protegee('perf', null, null, 'info', null, null)")" "refus:42501"
# Après un arrêt brutal, les statistiques repartent de zéro : l'estimation du catalogue reste — le pilotage prend le plus grand.
QD tc_apres "select pg_stat_reset_single_table_counters('public.telemetry_events'::regclass)" >/dev/null
verifier "lecture : statistiques remises à zéro → vivantes 0, estimation intacte" "$(QD tc_apres "select (j->>'vivantes') || ' ' || (j->>'estimees') from (select public.telemetrie_remplissage() as j) x")" "0 37"
# Un seuil qui n'est pas un entier rend NULL : le pilotage ignore alors les classes, la lecture ne lève pas.
QD tc_apres "drop trigger zz_classe_bornee on public.telemetry_events;
  create trigger zz_classe_bornee before insert on public.telemetry_events for each row execute function public.telemetrie_classe_bornee('abc', '720000', '720000', '1080000');" >/dev/null
verifier "lecture : un seuil illisible rend NULL, pas une erreur" "$(QD tc_apres "select coalesce(j->>'confort_visiteurs', 'nul') || ' ' || (j->>'confort_comptes') from (select public.telemetrie_remplissage() as j) x")" "nul 720000"
sortie="$(FICHIER tc_apres "$MIGRATION")"
verifier "le rejeu de la migration repose les vrais seuils" "$(printf '%s\n' "$sortie" | grep -c '§OK$' || true)/$(QD tc_apres "select tgnargs from pg_trigger where tgname = 'zz_classe_bornee'")" "8/4"

echo "══ ③ APRÈS, à seuils abaissés : visiteurs 5 / 8 / 12, comptes 100 / 200 / 1 000 ══"
SEUILS_BAS tc_apres
cas_sous()     { CAS "$1" 3 anon "" a_sous; }
cas_palier1()  { CAS "$1" 6 anon "" a_p1; }
cas_palier2()  { CAS "$1" 9 anon "" a_p2; }
cas_pleine()   { CAS "$1" 13 anon "" a_pleine; }
cas_compte()   { CAS "$1" 9 authenticated "$U1" c_sous; }
cas_compte1()  { CAS "$1" 101 authenticated "$U1" c_p1; }
cas_compte2()  { CAS "$1" 201 authenticated "$U1" c_p2; }
cas_service()  { CAS "$1" 201 service_role "" s_p2; }
verifier "visiteur sous le confort : tout est écrit" "$(cas_sous tc_apres)" "ok | $TOUT"
verifier "visiteur au palier 1 : seule la mesure de performance ordinaire est écartée (12 sur 13, le battement reste)" "$(cas_palier1 tc_apres)" "ok | $SANS_PERF"
verifier "visiteur au palier 2 : seul le protégé est écrit — erreur, canari, session, inscription, HTTP 500, ligne corrélée, perf et clic LENTS" "$(cas_palier2 tc_apres)" "ok | $PROTEGE"
verifier "visiteur à la borne : le refus du lot entier, inchangé (PT429)" "$(cas_pleine tc_apres)" "refus:PT429 | rien"
verifier "compte sous son confort (table au palier 2 des visiteurs) : 13 sur 13" "$(cas_compte tc_apres)" "ok | $TOUT"
verifier "compte au palier 1 : la perf ordinaire seule est écartée" "$(cas_compte1 tc_apres)" "ok | $SANS_PERF"
verifier "compte au palier 2 : seul le protégé" "$(cas_compte2 tc_apres)" "ok | $PROTEGE"
verifier "clé de service au palier 2 des comptes : jamais délestée" "$(cas_service tc_apres)" "ok | $TOUT"
# Un lot ENTIÈREMENT écarté est accepté : les clients déjà en cache vident leur file (201), rien n'est écrit.
cas_lot_vide() { NIVEAU "$1" 6; echo "$(SOUS "$1" anon "" "insert into public.telemetry_events (type, action, severity, session_id) select 'perf', 'lcp', 'info', 'vide' from generate_series(1, 3)") | $(ECRIT "$1" vide)"; }
verifier "un lot entièrement écarté est ACCEPTÉ, 0 ligne écrite" "$(cas_lot_vide tc_apres)" "ok | rien"
# Le débit ne compte que les lignes ÉCRITES (table de transition de trg_debit_lot).
cas_debit() {
  NIVEAU "$1" 6
  local avant apres
  avant="$(QD "$1" "select coalesce(sum(n), 0) from public.telemetrie_debit where reservoir = 'anonymes' and source = '*'")"
  SOUS "$1" anon "" "$(LOT debit)" >/dev/null
  apres="$(QD "$1" "select coalesce(sum(n), 0) from public.telemetrie_debit where reservoir = 'anonymes' and source = '*'")"
  echo $((apres - avant))
}
verifier "débit : 12 lignes comptées pour un lot de 13 dont une écartée" "$(cas_debit tc_apres)" "12"
# Les 120 lignes par lot se comptent AVANT l'écartement : la classe ne desserre aucun refus.
cas_121() { NIVEAU "$1" 6; echo "$(SOUS "$1" anon "" "insert into public.telemetry_events (type, action, severity, session_id) select 'perf', 'lcp', 'info', 'gros' from generate_series(1, 121)") | $(ECRIT "$1" gros)"; }
verifier "121 perf d'un visiteur au palier 1 : toujours PT413" "$(cas_121 tc_apres)" "refus:PT413 | rien"
cas_identite() {
  NIVEAU "$1" 6
  SOUS "$1" anon "" "insert into public.telemetry_events (type, severity, session_id, received_at) values ('error', 'error', 'horloge', now() - interval '8 days')" >/dev/null
  SOUS "$1" authenticated "$U1" "insert into public.telemetry_events (type, severity, session_id) values ('error', 'error', 'identite')" >/dev/null
  QD "$1" "select (select (received_at > now() - interval '1 minute')::text || ':' || coalesce(auth_uid::text, 'sans compte') from public.telemetry_events where session_id = 'horloge')
    || ' ' || (select auth_uid::text from public.telemetry_events where session_id = 'identite')"
}
verifier "l'heure et l'identité restent posées par le serveur" "$(cas_identite tc_apres)" "true:sans compte $U1"

echo "══ ⑤ La purge courte : agréger, puis supprimer, dans les deux jours agrégés ══"
# Les dates sont celles que la fonction calcule : A = milieu du jour « jour » (toujours avant la borne), B = midi de « jour - 1 ».
DECOR_PURGE() {
  QD "$1" "truncate public.telemetry_events; delete from public.activite_jour; delete from public.croissance_jour;
    set session_replication_role = replica;
    with t as (select now() - interval '26 hours' as borne, ((now() - interval '26 hours') at time zone 'UTC')::date as jour),
         d as (select t.borne, (t.jour::timestamp at time zone 'UTC') + (t.borne - (t.jour::timestamp at time zone 'UTC')) / 2 as a,
                      ((t.jour - 1)::timestamp at time zone 'UTC') + interval '12 hours' as b from t)
    insert into public.telemetry_events (type, action, status, severity, http_status, correlation_id, session_id, received_at, auth_uid, device_id, meta)
    select v.type, v.action, v.status, v.severity, v.http, v.corr, v.session, case v.quand when 'a' then d.a when 'b' then d.b when 'recent' then now() - interval '20 hours' else now() - interval '80 hours' end,
           v.uid::uuid, v.appareil, v.meta::jsonb
      from d, (values
        ('perf', 'lcp', null, 'info', null::int, null, 'part', 'a', '$UA', null, '{}'),
        ('perf', 'lcp', null, 'info', null, null, 'part', 'b', '$UB', null, '{}'),
        ('click', 'btn', null, 'info', null, null, 'part', 'a', null, null, '{}'),
        ('action', 'ui_open', 'ok', 'info', null, null, 'part', 'a', null, null, '{}'),
        ('lifecycle', 'heartbeat', null, 'info', null, null, 'part', 'a', null, null, '{}'),
        ('action', 'acq_signup', null, 'info', null, null, 'reste', 'a', null, 'd1', '{\"src\":\"instagram\"}'),
        ('action', 'ui_save', 'ok', 'info', null, 'f_9', 'reste', 'a', null, null, '{}'),
        ('error', 'js_error', 'error', 'error', null, null, 'reste', 'a', null, null, '{}'),
        ('nav', 'feed', null, 'info', null, null, 'reste', 'a', null, null, '{}'),
        ('perf', 'inp', null, 'warn', null, null, 'reste', 'a', null, null, '{}'),
        ('session', 'start', null, 'info', null, null, 'reste', 'a', null, 'd1', '{\"src\":\"instagram\"}'),
        ('session', 'start', null, 'info', null, null, 'reste', 'b', null, 'd2', '{\"referrer\":\"direct\"}'),
        ('lifecycle', 'sentinel_observation_canary', 'ok', 'info', null, 'can_9', 'reste', 'a', null, null, '{}'),
        ('perf', 'lcp', null, 'info', null, null, 'recente', 'recent', null, null, '{}'),
        ('perf', 'lcp', null, 'info', null, null, 'ancienne', 'vieux', null, null, '{}')
      ) as v(type, action, status, severity, http, corr, session, quand, uid, appareil, meta);" >/dev/null
}
RESTE() { QD "$1" "select coalesce(string_agg(session_id || ':' || type || ':' || action, ' ' order by session_id, type, action, received_at), 'rien') from public.telemetry_events"; }
ACTIVITE() { QD "$1" "select coalesce(string_agg(right(uid::text, 1), ',' order by uid), 'personne') from public.activite_jour where uid in ('$UA', '$UB')"; }
CROISSANCE() { QD "$1" "select md5(coalesce(string_agg(jour::text || mesure || valeur || n::text, '|' order by jour, mesure, valeur), 'vide')) || ':' || count(*) from public.croissance_jour"; }
RESTE_ATTENDU="ancienne:perf:lcp recente:perf:lcp reste:action:acq_signup reste:action:ui_save reste:error:js_error reste:lifecycle:sentinel_observation_canary reste:nav:feed reste:perf:inp reste:session:start reste:session:start"
cas_purge() { DECOR_PURGE "$1"; echo "$(QD "$1" "select public.purge_telemetrie_breve()") | $(RESTE "$1")"; }
verifier "purge : la perf, le clic, l'action et le battement ordinaires de plus de 26 h partent (5) ; le protégé, le récent (20 h) et l'ancien (80 h, hors des deux jours agrégés) restent" \
  "$(cas_purge tc_apres)" "5 | $RESTE_ATTENDU"
verifier "purge : les comptes dont la SEULE ligne est partie sont dans activite_jour — comptés avant d'être effacés" "$(ACTIVITE tc_apres)" "a,b"
verifier "purge : rejouée, elle ne retire plus rien" "$(QD tc_apres "select public.purge_telemetrie_breve()")" "0"
croissance_avant="$(CROISSANCE tc_apres)"
verifier "purge : les visites et l'inscription agrégées sont là (3 mesures : deux sources de visite, une inscription)" "${croissance_avant#*:}" "3"
QD tc_apres "select public.purge_telemetrie_paliers()" >/dev/null
verifier "purge : croissance_jour IDENTIQUE après la ré-agrégation de la purge quotidienne (rien de ce qu'elle relit n'a été purgé)" "$(CROISSANCE tc_apres)" "$croissance_avant"
verifier "purge : le budget démarre APRÈS les agrégations, et la sortie est jugée APRÈS le lot (lu dans le corps posé en base)" \
  "$(QD tc_apres "select (position('debut := pg_catalog.clock_timestamp()' in prosrc) > position('perform public.agreger_croissance(jour);' in prosrc))::text || ':' || (position('exit when k < lot' in prosrc) > position('get diagnostics k = row_count' in prosrc))::text from pg_proc where oid = 'public.purge_telemetrie_breve()'::regprocedure")" "true:true"

echo "══ ⑥ Les purges du 15/11 rendent ce qu'elles rendaient ══"
cas_purges_15() {
  QD "$1" "truncate public.telemetry_events; set session_replication_role = replica;
    insert into public.telemetry_events (type, session_id, severity, received_at) values
      ('nav', 'banc5', 'info', now() - interval '8 days'), ('error', 'banc5', 'error', now() - interval '8 days'),
      ('nav', 'banc5', 'info', now() - interval '4 days'), ('error', 'banc5', 'error', now() - interval '4 days'),
      ('api', 'banc5', 'warn', now() - interval '4 days'), ('nav', 'banc5', 'info', now() - interval '1 day');" >/dev/null
  echo "$(QD "$1" "select public.purge_telemetrie_paliers()") | $(QD "$1" "select string_agg(type || ':' || severity, ',' order by type, severity) from public.telemetry_events where session_id = 'banc5'") | $(QD "$1" "select public.purge_telemetrie_rattrapage()")"
}
verifier "purge quotidienne et rattrapage : mêmes lignes parties, mêmes lignes gardées qu'avant la migration" "$(cas_purges_15 tc_apres)" "$(cas_purges_15 tc_avant)"
verifier "… soit 3 parties, les échecs de 4 jours et la ligne d'hier gardés, rattrapage à 0" "$(cas_purges_15 tc_apres)" "3 | api:warn,error:error,nav:info | 0"

echo "══ ⑦ Aux VRAIS seuils : les déclencheurs de la migration, sans déclencheur d'épreuve ══"
QD postgres "create database tc_volume template tc_socle" >/dev/null
FICHIER tc_volume "$MIGRATION" >/dev/null
# Des mesures de performance de 30 h, écrites sans déclencheur : elles font le volume ET la matière de la purge.
MONTER() { # $1 lignes vivantes visées
  local n; n="$(QD tc_volume "select count(*) from public.telemetry_events")"
  QD tc_volume "set session_replication_role = replica;
    insert into public.telemetry_events (type, action, severity, session_id, received_at) select 'perf', 'lcp', 'info', 'volume', now() - interval '30 hours' from generate_series(1, $1 - $n);" >/dev/null
  QD tc_volume "analyze public.telemetry_events" >/dev/null
}
VRAI() { # $1 rôle · $2 identifiant · $3 session → verdict | ce qui est écrit
  local r; r="$(SOUS tc_volume "$1" "$2" "$(LOT "$3")")"
  echo "$r | $(ECRIT tc_volume "$3")"; QD tc_volume "delete from public.telemetry_events where session_id = '$3'" >/dev/null; QD tc_volume "analyze public.telemetry_events" >/dev/null
}
# Les niveaux encadrent chaque seuil de 2 000 lignes : sur une grande table, `analyze` ESTIME les lignes vivantes
# (comme l'autovacuum en production) — la borne et la classe jugent sur cette estimation, pas sur un compte.
MONTER 478000
verifier "478 000 lignes (sous 480 000) : le visiteur écrit tout" "$(VRAI anon "" r0)" "ok | $TOUT"
MONTER 482000
verifier "482 000 lignes : palier 1 des visiteurs — la perf ordinaire est écartée par zz_classe_bornee" "$(VRAI anon "" r1)" "ok | $SANS_PERF"
verifier "482 000 lignes : le compte écrit tout" "$(VRAI authenticated "$U1" r2)" "ok | $TOUT"
MONTER 722000
verifier "722 000 lignes : palier 2 des visiteurs — seul le protégé" "$(VRAI anon "" r3)" "ok | $PROTEGE"
verifier "722 000 lignes : palier 1 des comptes" "$(VRAI authenticated "$U1" r4)" "ok | $SANS_PERF"
MONTER 802000
verifier "802 000 lignes : fermée aux visiteurs (aa_table_bornee, PT429)" "$(VRAI anon "" r5)" "refus:PT429 | rien"
verifier "802 000 lignes : les comptes écrivent encore (palier 1)" "$(VRAI authenticated "$U1" r6)" "ok | $SANS_PERF"
MONTER 1082000
verifier "1 082 000 lignes : palier 2 des comptes" "$(VRAI authenticated "$U1" r7)" "ok | $PROTEGE"
verifier "1 082 000 lignes : la clé de service écrit tout" "$(VRAI service_role "" r8)" "ok | $TOUT"
MONTER 1202000
verifier "1 202 000 lignes : fermée aux comptes (PT429)" "$(VRAI authenticated "$U1" r9)" "refus:PT429 | rien"
verifier "1 202 000 lignes : la lecture le dit (statistiques et estimation au-dessus de la borne des comptes)" "$(QD tc_volume "select ((j->>'vivantes')::bigint > 1200000)::text || ' ' || ((j->>'estimees')::bigint > 1200000)::text from (select public.telemetrie_remplissage() as j) x")" "true true"
# La durée d'un passage : deux agrégations d'un jour, puis les lots, contre la coupure de 120 s de la production.
debut_purge=$(date +%s)
partis="$(QD tc_volume "select public.purge_telemetrie_breve()")"
duree_purge=$(( $(date +%s) - debut_purge ))
restent="$(QD tc_volume "select count(*) from public.telemetry_events")"
echo "  ℹ️  purge courte sur 1 202 000 lignes de 30 h : $partis parties en $duree_purge s (budget des suppressions : 45 s), $restent restantes"
verifier "volume : un passage tient sous la coupure de 120 s de la production" "$([ "$duree_purge" -lt 120 ] && echo oui || echo "non ($duree_purge s)")" "oui"
verifier "volume : un passage retire au moins un lot" "$([ "$partis" -ge 5000 ] && echo oui || echo "non ($partis)")" "oui"
passes=1
while [ "$restent" != "0" ] && [ "$passes" -lt 6 ]; do QD tc_volume "select public.purge_telemetrie_breve()" >/dev/null; restent="$(QD tc_volume "select count(*) from public.telemetry_events")"; passes=$((passes+1)); done
verifier "volume : la table est vidée en quelques passages ($passes)" "$restent" "0"
QD postgres "drop database tc_volume" >/dev/null

echo "══ ⑧ Mutants : chaque garde retirée fait rougir SON cas, ou le verdict du fichier ══"
# $1 nom · $2 expression sed (-E) · reste : la commande qui rend la valeur du cas · attendu = valeur de la vraie migration.
# Un mutant est ROUGE si la migration mutée est refusée (verdict) ou si le cas ne rend plus la valeur attendue.
# PREPA : du SQL joué sur la base du mutant AVANT d'appliquer (un décor que la garde suppose), vide sinon.
n_mutants=0; PREPA=""
mutant() {
  local nom="$1" expr="$2" attendu="$3"; shift 3
  n_mutants=$((n_mutants+1))
  local base="tc_m$n_mutants" f="$MUT/m$n_mutants.sql"
  sed -E "$expr" "$MIGRATION" > "$f"; chmod a+r "$f"
  if cmp -s "$f" "$MIGRATION"; then verifier "mutant $nom : la cible existe dans la migration" "introuvable" "trouvée"; return; fi
  QD postgres "create database $base template tc_socle" >/dev/null
  [ -n "$PREPA" ] && QD "$base" "$PREPA" >/dev/null
  local sortie obtenu
  if sortie="$(FICHIER "$base" "$f")"; then
    SEUILS_BAS "$base"
    obtenu="$("$@" "$base")"
    if [ "$obtenu" != "$attendu" ]; then verifier "mutant $nom : son cas rougit" "rouge" "rouge"
    else verifier "mutant $nom : son cas rougit" "vert ($obtenu)" "rouge"; fi
  else
    if printf '%s' "$sortie" | grep -q "RIEN n'est appliqué"; then verifier "mutant $nom : le verdict refuse l'application" "refusée" "refusée"
    else verifier "mutant $nom : le verdict refuse l'application" "erreur inattendue : $(printf '%s' "$sortie" | grep -m1 ERROR)" "refusée"; fi
    verifier "mutant $nom : rien n'est resté en base" "$(QD "$base" "select coalesce(to_regprocedure('public.telemetrie_remplissage()')::text, 'absente') || ' ' || (select count(*) from cron.job where jobname = 'purge_telemetrie_breve')")" "absente 0"
  fi
  QD postgres "drop database $base" >/dev/null
}
toujours_vert() { echo vert; }   # pour un mutant que SEUL le verdict doit arrêter
mutant "M1 les sessions ne sont plus protégées" "s/'push', 'release', 'session'\)/'push', 'release')/" "vert" toujours_vert
mutant "M2 le déclencheur ne passe plus en dernier (aa_classe_bornee)" "s/zz_classe_bornee before insert/aa_classe_bornee before insert/; s/drop trigger if exists zz_classe_bornee/drop trigger if exists aa_classe_bornee/" "vert" toujours_vert
mutant "M3 palier 1 inerte (la perf n'est plus écartée)" "s/ or coalesce\(new\.type, ''\) = 'perf' then return null/ then return null/" "ok | $SANS_PERF" cas_palier1
mutant "M4 palier 2 inerte" "s/if vivantes > reserve or coalesce/if false or coalesce/" "ok | $PROTEGE" cas_palier2
mutant "M5 la clé de service est délestée" "s/if r is null or r not in \('anon', 'authenticated'\) then return new; end if;//" "ok | $TOUT" cas_service
mutant "M6 le palier 1 écarte aussi les battements (comptes connectés sous-estimés dès 60 %)" "s/coalesce\(new\.type, ''\) = 'perf' then return null/coalesce(new.type, '') in ('perf', 'lifecycle') then return null/" "ok | $SANS_PERF" cas_palier1
mutant "M7 le protégé n'est plus épargné par la borne" "s/^  if public\.telemetrie_protegee\(new\.type.*$/  if false then/" "ok | $PROTEGE" cas_palier2
mutant "M8 la purge emporte le protégé (inscription, ligne corrélée)" "s/^ *and not public\.telemetrie_protegee\(x\.type, x\.action, x\.status, x\.severity, x\.http_status, x\.correlation_id\)$//" "5 | $RESTE_ATTENDU" cas_purge
cas_activite() { DECOR_PURGE "$1"; QD "$1" "select public.purge_telemetrie_breve()" >/dev/null; ACTIVITE "$1"; }
mutant "M9 le jour entamé n'est plus agrégé avant la purge" "s/^  perform public\.agreger_croissance\(jour\);$//" "a,b" cas_activite
mutant "M10 la veille du jour entamé n'est plus agrégée" "s/^  perform public\.agreger_croissance\(jour - 1\);$//" "a,b" cas_activite
mutant "M11 la purge sort des deux jours agrégés (une ligne de 80 h part sans avoir été comptée par elle)" "s/where x\.received_at >= plancher and x\.received_at < borne/where x.received_at < borne/" "5 | $RESTE_ATTENDU" cas_purge
mutant "M12 les battements ne sont plus purgés à 26 h" "s/and x\.type in \('perf', 'click', 'action', 'lifecycle'\)$/and x.type in ('perf', 'click', 'action')/" "5 | $RESTE_ATTENDU" cas_purge
# Depuis le lot 1 du 06/11, les droits PAR DÉFAUT de `public` ne donnent plus EXECUTE aux clients : sur l'état
# d'aujourd'hui, les `revoke` de cette migration sont une seconde ceinture (un mutant qui les retire reste fermé).
# Ils sont donc éprouvés sur les droits par défaut d'AVANT ce lot — ceux d'un projet Supabase neuf, et ceux que
# rend son retour arrière : là, sans `revoke`, toute fonction neuve est exécutable par anon et authenticated.
DEFAUTS_ANCIENS="alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated; alter default privileges for role postgres grant execute on functions to public;"
QD postgres "create database tc_defauts template tc_socle" >/dev/null
QD tc_defauts "$DEFAUTS_ANCIENS" >/dev/null
sortie="$(FICHIER tc_defauts "$MIGRATION")"
verifier "droits par défaut d'avant le 06/11 : la migration ferme quand même ses quatre fonctions (8 OK)" "$(printf '%s\n' "$sortie" | grep -c '§OK$' || true)" "8"
verifier "… et un visiteur n'appelle ni la lecture ni la purge" "$(SOUS tc_defauts anon "" "select public.telemetrie_remplissage()") $(SOUS tc_defauts anon "" "select public.purge_telemetrie_breve()")" "refus:42501 refus:42501"
QD postgres "drop database tc_defauts" >/dev/null
PREPA="$DEFAUTS_ANCIENS"
mutant "M13 la lecture du remplissage reste ouverte aux clients (droits par défaut d'avant le 06/11)" "s/^revoke all on function public\.telemetrie_remplissage\(\) from public, anon, authenticated;$//" "vert" toujours_vert
mutant "M13 bis la purge courte reste appelable par les clients (droits par défaut d'avant le 06/11)" "s/^revoke all on function public\.purge_telemetrie_breve\(\) from public, anon, authenticated;$//" "vert" toujours_vert
PREPA=""
mutant "M14 la purge courte n'est pas planifiée" "s/^  perform cron\.schedule\('purge_telemetrie_breve'.*$/  null;/" "vert" toujours_vert
mutant "M15 le canari n'est plus protégé par son action" "s/in \('acq_signup', 'sentinel_observation_canary'\)/in ('acq_signup')/" "vert" toujours_vert
# Le budget : avec un budget NUL, un lot part quand même et le rejeu finit ; la sortie jugée AVANT le lot ne retire jamais rien.
cas_budget() {
  QD "$1" "truncate public.telemetry_events; set session_replication_role = replica;
    insert into public.telemetry_events (type, action, severity, session_id, received_at) select 'perf', 'lcp', 'info', 'budget', now() - interval '30 hours' from generate_series(1, 5003);" >/dev/null
  echo "$(QD "$1" "select public.purge_telemetrie_breve()") $(QD "$1" "select public.purge_telemetrie_breve()") $(QD "$1" "select public.purge_telemetrie_breve()")"
}
sed -E "s/interval '45 seconds'/interval '0 seconds'/" "$MIGRATION" > "$MUT/budget.sql"; chmod a+r "$MUT/budget.sql"
QD postgres "create database tc_budget template tc_socle" >/dev/null
FICHIER tc_budget "$MUT/budget.sql" >/dev/null
verifier "budget épuisé (0 s) : un lot de 5 000 part quand même, le rejeu finit (3), puis plus rien" "$(cas_budget tc_budget)" "5000 3 0"
verifier "budget entier (45 s) : tout part en un passage" "$(cas_budget tc_apres)" "5003 0 0"
QD postgres "drop database tc_budget" >/dev/null
mutant "M16 la sortie du budget est jugée AVANT le lot (à budget nul, plus rien ne part jamais)" "s/interval '45 seconds'/interval '0 seconds'/; s/^  loop$/  loop exit when pg_catalog.clock_timestamp() - debut >= interval '0 seconds';/" "5000 3 0" cas_budget
cas_budget_ordre() { QD "$1" "select (position('debut := pg_catalog.clock_timestamp()' in prosrc) > position('perform public.agreger_croissance(jour);' in prosrc))::text from pg_proc where oid = 'public.purge_telemetrie_breve()'::regprocedure"; }
mutant "M17 le budget démarre avant les agrégations (épingle de texte : une agrégation lente ne se simule pas ici)" "s/^  debut timestamptz;$/  debut timestamptz := pg_catalog.clock_timestamp();/; s/^  debut := pg_catalog\.clock_timestamp\(\);$//" "true" cas_budget_ordre
# Le garde-fou lui-même : sans lui, une migration au verdict en ECHEC s'appliquerait.
cas_mal_place() { QD "$1" "select count(*) from pg_trigger where tgname = 'aa_classe_bornee'"; }
mutant "M18 le garde-fou ne lève plus (le déclencheur mal placé de M2 resterait en base, avec un ECHEC au tableau)" "s/zz_classe_bornee before insert/aa_classe_bornee before insert/; s/drop trigger if exists zz_classe_bornee/drop trigger if exists aa_classe_bornee/; s/^  if numeros is not null then$/  if false then/" "0" cas_mal_place
verifier "mutants joués" "$n_mutants" "19"

echo "Bilan : $ok vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
