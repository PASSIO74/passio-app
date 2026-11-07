#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_purge_analytics_courte_2026-11-07.sql
#
# Ce qu'il protège :
#   ① la tâche `purge_analytics_courte` est planifiée UNE fois, chaque heure à
#     :23, active, avec la commande exacte, sous le rôle qui l'a posée ; le
#     verdict rend 10 lignes, et ses 8 contrôles disent OK ;
#   ② la première purge (la commande planifiée, exécutée par la migration)
#     efface EXACTEMENT les lignes edge_* de plus de 2 h et les notes
#     push_envoye de plus de 8 jours, quel que soit leur auteur — et rien
#     d'autre : ni les récentes (1 h 55, 1 min ; 7 j 23 h, 2 j, 10 min), ni
#     `edgeX_…`, `edge`, `EDGE_…`, `x_edge_…`, `push_envoye_test`, ni
#     screen_view, battement, rappel_activite, ni une ligne edge_* sans date ;
#   ③ rejouée comme pg_cron le fera (la commande LUE dans cron.job), elle tient
#     ses bornes à deux minutes près : 2 h 02 part, 1 h 58 reste ; 8 j 0 h 02
#     part, 7 j 23 h 58 reste — et elle rend ce qu'elle a effacé ;
#   ④ les planchers refusent (22023) sous 1 h, sous 7 jours, et NULL, sans rien
#     effacer ; ni anon, ni authenticated, ni un rôle quelconque (PUBLIC)
#     n'exécutent la fonction ; service_role oui (droits par défaut de Supabase) ;
#   ⑤ l'index partiel sert la purge (EXPLAIN, parcours séquentiel interdit) ;
#   ⑥ rejouable ; la purge des 13 mois n'est pas touchée ; le retour arrière
#     (les lignes « --| » de l'en-tête) retire tâche, fonction et index, sans
#     toucher aux lignes, et la migration se réapplique ensuite ;
#   ⑦ FERMÉ SUR ÉCHEC : chaque mutant fait LEVER le verdict en nommant SES
#     lignes, et RIEN n'est appliqué (ni fonction, ni tâche, ni index, ni ligne
#     effacée) — rétention raccourcie, notes sous le plancher, planchers retirés,
#     SECURITY DEFINER, droits laissés à PUBLIC, planification oubliée, tâche
#     désactivée, motif de l'index changé, mauvaise famille de notes, notes
#     récentes effacées, corps modifié sans son empreinte — et le PIÈGE RLS : un
#     rôle propriétaire sous RLS FORCÉE efface 0 ligne SANS ERREUR (mesuré
#     d'abord), et ne lit rien non plus : seule la ligne 3 peut le voir ;
#   ⑧ ce que le verdict ne peut PAS voir, le banc le voit : un motif élargi
#     (`like 'edge_%'`, où `_` est un joker) dont l'empreinte a été remise à jour
#     passe le verdict — c'est ② qui rougit (`edgeX_…` effacée).
# pg_cron n'existe pas dans un PostgreSQL nu : un schéma `cron` minimal le
# remplace (job avec username et database comme pg_cron 1.6, schedule,
# unschedule par identifiant et par nom) — la commande planifiée est exécutée
# telle quelle par le banc, comme pg_cron le ferait.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_purge_analytics_courte_2026-11-07.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v python3 >/dev/null || { echo "❌ python3 introuvable (fabrique des mutants)"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable"; exit 1; }

PORT=$(( 7010 + RANDOM % 60 ))
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

DB=purge_courte
Q() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
QV() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "$1" 2>&1; }
R() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "begin; set local role $1; $2; commit;" 2>&1; }
FICHIER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -F '|' -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }
FICHIER_EN() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -F '|' -q -v ON_ERROR_STOP=1 -c "set role $1" -f "$2" 2>&1; }
# Le retour arrière de la migration (les lignes « --| »).
RETOUR_ARRIERE() { sed -n -e 's/^--| //p' -e 's/^--|$//p' "$MIGRATION"; }

ok=0; ko=0
verif() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; ok=$((ok+1)); else echo "  ❌ $1 — attendu « $3 », obtenu « $2 »"; ko=$((ko+1)); fi; }

# Rôles de Supabase (communs à toutes les bases de la grappe), plus deux du banc :
# `quelquun` (aucun droit : ce que PUBLIC peut) et `migrateur` (le piège RLS).
psql -h "$BASE" -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1 -c "
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role quelquun nologin; create role migrateur nologin;" >/dev/null

# Décor : droits par défaut de Supabase, pg_cron minimal, la table telle que la
# production la porte (colonnes, index, RLS sans policy DELETE), la purge des 13
# mois déjà planifiée, et vingt lignes de part et d'autre de chaque borne.
DECOR="
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text not null, command text not null,
  active boolean not null default true, username text not null default current_user, database text not null default current_database());
create function cron.schedule(p_nom text, p_horaire text, p_commande text) returns bigint language sql as \$\$
  insert into cron.job(jobname, schedule, command) values (p_nom, p_horaire, p_commande)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid \$\$;
create function cron.unschedule(p_id bigint) returns boolean language sql as \$\$ delete from cron.job where jobid = p_id returning true \$\$;
create function cron.unschedule(p_nom text) returns boolean language sql as \$\$ delete from cron.job where jobname = p_nom returning true \$\$;
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id text, event text, properties jsonb default '{}'::jsonb, created_at timestamptz default now());
create index idx_analytics_user_id on public.analytics_events (user_id);
create index idx_analytics_event on public.analytics_events (event);
create index idx_analytics_created_at on public.analytics_events (created_at desc);
alter table public.analytics_events enable row level security;
create policy analytics_insert_own on public.analytics_events for insert to public
  with check (user_id = current_setting('request.jwt.claim.sub', true));
select cron.schedule('passio_purge_analytics', '30 4 * * *',
  \$j\$ delete from public.analytics_events where created_at < now() - interval '13 months' \$j\$);
insert into public.analytics_events (user_id, event, properties, created_at) values
 ('u1', 'edge_notify-call', '{\"cas\":\"A1_edge_2h05\"}', now() - interval '2 hours 5 minutes'),
 ('systeme:pilotage-veille', 'edge_pilotage-veille', '{\"cas\":\"A2_creneau_3j\"}', now() - interval '3 days'),
 ('u2', 'edge_ask-ai', '{\"cas\":\"A3_edge_400j\"}', now() - interval '400 days'),
 ('u1', 'edge_notify-call', '{\"cas\":\"B1_edge_1h55\"}', now() - interval '1 hour 55 minutes'),
 ('systeme:pilotage-veille', 'edge_pilotage-veille', '{\"cas\":\"B2_creneau_1min\"}', now() - interval '1 minute'),
 ('systeme:pilotage', 'push_envoye', '{\"cas\":\"C1_note_pilote_8j1h\"}', now() - interval '8 days 1 hour'),
 ('systeme:notifs', 'push_envoye', '{\"cas\":\"C2_note_sociale_30j\"}', now() - interval '30 days'),
 ('u3', 'push_envoye', '{\"cas\":\"C3_note_forgee_9j\"}', now() - interval '9 days'),
 ('systeme:pilotage', 'push_envoye', '{\"cas\":\"D1_note_pilote_7j23h\"}', now() - interval '7 days 23 hours'),
 ('systeme:rappels', 'push_envoye', '{\"cas\":\"D2_note_rappel_2j\"}', now() - interval '2 days'),
 ('systeme:appels', 'push_envoye', '{\"cas\":\"D3_note_appel_10min\"}', now() - interval '10 minutes'),
 ('u1', 'screen_view', '{\"cas\":\"E1_screen_300j\"}', now() - interval '300 days'),
 ('u1', 'edgeX_notify', '{\"cas\":\"E2_edgeX_10j\"}', now() - interval '10 days'),
 ('u1', 'edge', '{\"cas\":\"E3_edge_seul_10j\"}', now() - interval '10 days'),
 ('u1', 'EDGE_notify-call', '{\"cas\":\"E4_EDGE_10j\"}', now() - interval '10 days'),
 ('u1', 'x_edge_foo', '{\"cas\":\"E5_x_edge_10j\"}', now() - interval '10 days'),
 ('systeme:pilotage', 'push_envoye_test', '{\"cas\":\"E6_push_prefixe_30j\"}', now() - interval '30 days'),
 ('systeme:pilotage', 'pilotage_battement', '{\"cas\":\"E7_battement_6j\"}', now() - interval '6 days'),
 ('systeme:rappels:u1', 'rappel_activite', '{\"cas\":\"E8_rappel_100j\"}', now() - interval '100 days'),
 ('u1', 'edge_notify-call', '{\"cas\":\"E9_edge_sans_date\"}', null);
"
nouvelle_base() {
  DB="$1"
  PGOPTIONS='-c client_min_messages=warning' psql -h "$BASE" -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1 \
    -c "drop database if exists $DB" -c "create database $DB" >/dev/null
  Q "$DECOR" >/dev/null
}
RESTANTES() { Q "select string_agg(properties->>'cas', ',' order by properties->>'cas' collate \"C\") from public.analytics_events"; }
ATTENDUES="B1_edge_1h55,B2_creneau_1min,D1_note_pilote_7j23h,D2_note_rappel_2j,D3_note_appel_10min,E1_screen_300j,E2_edgeX_10j,E3_edge_seul_10j,E4_EDGE_10j,E5_x_edge_10j,E6_push_prefixe_30j,E7_battement_6j,E8_rappel_100j,E9_edge_sans_date"
CMD_ATTENDUE="select public.purger_analytics_courte(interval '2 hours', interval '8 days')"
COMMANDE_13_MOIS=" delete from public.analytics_events where created_at < now() - interval '13 months' "

# Fabrique de mutants : chaque remplacement doit trouver son texte UNE fois (sinon
# le mutant ne mute rien et le banc le dit) ; « 1 » recalcule l'empreinte du corps
# de la fonction (un corps modifié AVEC son empreinte : ce que le verdict ne voit
# pas par l'md5, d'autres lignes doivent le voir).
cat > "$BASE/muter.py" <<'PY'
import sys, re, hashlib
src, dst, maj = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
paires = sys.argv[4:]
t = open(src, encoding="utf8").read()
for i in range(0, len(paires), 2):
    a, b = paires[i], paires[i + 1]
    n = t.count(a)
    if n != 1:
        sys.exit("mutant inapplicable : %d occurrence(s) de %r" % (n, a))
    t = t.replace(a, b)
if maj:
    m = re.search(r"as \$fn\$(.*?)\$fn\$;", t, re.S)
    corps = m.group(1).replace("\r\n", "\n")
    neuf = hashlib.md5(corps.encode("utf8")).hexdigest()
    t, k = re.subn(r"(md5\(replace\(p\.prosrc, chr\(13\) \|\| chr\(10\), chr\(10\)\)\) = ')[0-9a-f]{32}(')",
                   lambda x: x.group(1) + neuf + x.group(2), t)
    if k != 1:
        sys.exit("empreinte introuvable dans le verdict")
open(dst, "w", encoding="utf8").write(t)
PY
MUTANT="$BASE/mutant.sql"
# Un mutant qui ne mute rien est un défaut du BANC : il le dit, compte un échec, et
# le scénario se joue sur la migration intacte (ses contrôles rougissent aussi).
muter() {
  local maj="$1"; shift; rm -f "$MUTANT"
  if ! python3 -I "$BASE/muter.py" "$MIGRATION" "$MUTANT" "$maj" "$@"; then
    echo "  ❌ mutant inapplicable : la migration a changé sous le banc"; ko=$((ko+1))
    cp "$MIGRATION" "$MUTANT"
  fi
  chmod a+r "$MUTANT"
}
rien_applique() {   # $1 = libellé
  verif "$1 : rien d'appliqué (fonction, tâche, index absents ; les 20 lignes intactes)" \
    "$(Q "select (to_regprocedure('public.purger_analytics_courte(interval,interval)') is null)::text || ' ' ||
                 (select count(*) from cron.job where jobname = 'purge_analytics_courte') || ' ' ||
                 (to_regclass('public.idx_analytics_edge_created') is null)::text || ' ' ||
                 (select count(*) from public.analytics_events)")" "true 0 true 20"
}
leve() {   # $1 = libellé, $2 = lignes attendues en échec, $3 = sortie
  verif "$1 : le verdict LÈVE en nommant les lignes $2" \
    "$(printf '%s' "$3" | grep -c "RIEN n'est appliqué. Lignes en échec : $2\$")" "1"
}

echo "── ① à ⑥ : la migration telle qu'elle est ──"
nouvelle_base purge_courte
verif "décor : 20 lignes, la purge des 13 mois planifiée" "$(Q "select count(*) || ' ' || (select count(*) from cron.job) from public.analytics_events")" "20 1"

# `|| true` partout où la migration est jouée : une migration qui LÈVE ne coupe
# pas le banc en silence (set -e) — ses contrôles disent ce qui rougit, et la
# sortie est imprimée.
sortie="$(FICHIER "$MIGRATION" || true)"
verif "① le verdict rend 10 lignes" "$(printf '%s\n' "$sortie" | grep -c '|')" "10"
verif "① ses 8 contrôles disent OK" "$(printf '%s\n' "$sortie" | grep -c '|OK$')" "8"
[ "$(printf '%s\n' "$sortie" | grep -c '|OK$')" = "8" ] || printf '     sortie de la migration :\n%s\n' "$sortie" | head -20
verif "① information : 3 lignes edge_* et 3 notes effacées, 14 restent" \
  "$(printf '%s\n' "$sortie" | grep -c '|edge_\* : 3 · notes : 3 · restent 14 lignes (')" "1"
verif "① information : la purge des 13 mois, présente" "$(printf '%s\n' "$sortie" | grep -c "|présente : 30 4 \* \* \* · delete from public.analytics_events where created_at < now() - interval '13 months'$")" "1"
verif "① une tâche, chaque heure à :23, active, dans cette base, sous le rôle qui l'a posée" \
  "$(Q "select count(*) || ' ' || max(schedule) || ' ' || bool_and(active) || ' ' || max(username) || ' ' || bool_and(database = current_database()) from cron.job where jobname = 'purge_analytics_courte'")" \
  "1 23 * * * * true postgres true"
verif "① la commande exacte" "$(Q "select command from cron.job where jobname = 'purge_analytics_courte'")" "$CMD_ATTENDUE"
verif "① le corps installé a l'empreinte que le verdict attend" \
  "$(Q "select md5(replace(prosrc, chr(13) || chr(10), chr(10))) from pg_proc where oid = to_regprocedure('public.purger_analytics_courte(interval,interval)')")" \
  "$(grep -o "chr(10))) = '[0-9a-f]\{32\}'" "$MIGRATION" | grep -o '[0-9a-f]\{32\}')"
verif "② effacé EXACTEMENT : edge_* > 2 h et push_envoye > 8 j (tout auteur) ; tout le reste demeure" "$(RESTANTES)" "$ATTENDUES"

# ③ pg_cron exécuterait la commande telle quelle : le banc fait de même, aux bornes.
Q "insert into public.analytics_events (user_id, event, properties, created_at) values
   ('u1', 'edge_notify-call', '{\"cas\":\"F1_edge_2h02\"}', now() - interval '2 hours 2 minutes'),
   ('u1', 'edge_notify-call', '{\"cas\":\"F2_edge_1h58\"}', now() - interval '1 hour 58 minutes'),
   ('systeme:pilotage', 'push_envoye', '{\"cas\":\"F3_note_8j0h02\"}', now() - interval '8 days 2 minutes'),
   ('systeme:pilotage', 'push_envoye', '{\"cas\":\"F4_note_7j23h58\"}', now() - interval '7 days 23 hours 58 minutes')" >/dev/null
CMD="$(Q "select coalesce((select command from cron.job where jobname = 'purge_analytics_courte'), 'select ''aucune tâche''')")"
verif "③ la commande LUE dans cron.job rend ce qu'elle efface" "$(Q "$CMD")" '{"edge": 1, "notes": 1}'
verif "③ bornes à deux minutes près : 2 h 02 et 8 j 0 h 02 partent, 1 h 58 et 7 j 23 h 58 restent" \
  "$(Q "select string_agg(properties->>'cas', ',' order by properties->>'cas' collate \"C\") from public.analytics_events where properties->>'cas' like 'F%'")" \
  "F2_edge_1h58,F4_note_7j23h58"
verif "③ rejouée aussitôt, elle n'efface plus rien" "$(Q "$CMD")" '{"edge": 0, "notes": 0}'

# ④ planchers et droits
avant="$(Q "select count(*) from public.analytics_events")"
verif "④ plancher : 59 minutes pour edge_* → 22023" "$(QV "select public.purger_analytics_courte(interval '59 minutes', interval '8 days')" | grep -c '22023: purger_analytics_courte : rétention des lignes edge_\* sous 1 heure refusée')" "1"
verif "④ plancher : 6 j 23 h pour les notes → 22023" "$(QV "select public.purger_analytics_courte(interval '2 hours', interval '6 days 23 hours')" | grep -c '22023: purger_analytics_courte : rétention des notes push_envoye sous 7 jours refusée')" "1"
verif "④ plancher : NULL → 22023 (edge_*)" "$(QV "select public.purger_analytics_courte(null, interval '8 days')" | grep -c '22023:')" "1"
verif "④ plancher : NULL → 22023 (notes)" "$(QV "select public.purger_analytics_courte(interval '2 hours', null)" | grep -c '22023:')" "1"
verif "④ les refus n'ont rien effacé" "$(Q "select count(*) from public.analytics_events")" "$avant"
for role in anon authenticated quelquun; do
  verif "④ $role n'exécute pas la fonction" "$(R "$role" "select public.purger_analytics_courte(interval '2 hours', interval '8 days')" | grep -c 'permission denied for function purger_analytics_courte')" "1"
done
verif "④ service_role l'exécute (droits par défaut de Supabase)" "$(R service_role "select public.purger_analytics_courte(interval '2 hours', interval '8 days')")" '{"edge": 0, "notes": 0}'

# ⑤ l'index partiel sert la purge
plan="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "set enable_seqscan = off" \
  -c "explain (costs off) delete from public.analytics_events where starts_with(event, 'edge_') and created_at < now() - interval '2 hours'" 2>&1)"
verif "⑤ la purge des edge_* emprunte idx_analytics_edge_created" "$(printf '%s\n' "$plan" | grep -c 'idx_analytics_edge_created')" "1"

# ⑥ rejouable, 13 mois intacte, retour arrière, réapplication
sortie="$(FICHIER "$MIGRATION" || true)"
verif "⑥ rejouée : 8 contrôles OK" "$(printf '%s\n' "$sortie" | grep -c '|OK$')" "8"
verif "⑥ rejouée : toujours UNE tâche, rien de plus effacé" "$(Q "select count(*) from cron.job where jobname = 'purge_analytics_courte'") $(RESTANTES)" "1 $ATTENDUES,F2_edge_1h58,F4_note_7j23h58"
verif "⑥ la purge des 13 mois n'est pas touchée" "$(Q "select count(*) || '|' || max(schedule) || '|' || max(command) from cron.job where jobname = 'passio_purge_analytics'")" "1|30 4 * * *|$COMMANDE_13_MOIS"
RETOUR_ARRIERE > "$BASE/retour.sql"; chmod a+r "$BASE/retour.sql"
verif "⑥ le retour arrière est un bloc begin; … commit;" "$(head -1 "$BASE/retour.sql")|$(tail -1 "$BASE/retour.sql")" "begin;|commit;"
FICHIER "$BASE/retour.sql" >/dev/null || true
verif "⑥ retour arrière : tâche, fonction et index retirés ; la purge des 13 mois et les lignes demeurent" \
  "$(Q "select (select count(*) from cron.job where jobname = 'purge_analytics_courte') || ' ' ||
               (to_regprocedure('public.purger_analytics_courte(interval,interval)') is null)::text || ' ' ||
               (to_regclass('public.idx_analytics_edge_created') is null)::text || ' ' ||
               (select count(*) from cron.job where jobname = 'passio_purge_analytics') || ' ' ||
               (select count(*) from public.analytics_events)")" "0 true true 1 16"
verif "⑥ le retour arrière se rejoue sans erreur (tâche déjà absente)" "$(FICHIER "$BASE/retour.sql" 2>&1 | grep -c 'ERROR' || true) $(Q "select count(*) from cron.job where jobname = 'purge_analytics_courte'")" "0 0"
sortie="$(FICHIER "$MIGRATION" || true)"
verif "⑥ réappliquée après le retour arrière : 8 contrôles OK" "$(printf '%s\n' "$sortie" | grep -c '|OK$')" "8"

echo "── ⑦ fermé sur échec : chaque mutant lève, et rien n'est appliqué ──"
CMD_SRC="\$q\$select public.purger_analytics_courte(interval '2 hours', interval '8 days')\$q\$"

nouvelle_base m_retention
muter 0 "$CMD_SRC" "\$q\$select public.purger_analytics_courte(interval '1 hour', interval '8 days')\$q\$"
sortie="$(FICHIER "$MUTANT" || true)"
leve "⑦ rétention edge_* raccourcie à 1 h" "2,7" "$sortie"; rien_applique "⑦ rétention raccourcie"

nouvelle_base m_notes
muter 0 "$CMD_SRC" "\$q\$select public.purger_analytics_courte(interval '2 hours', interval '6 days')\$q\$"
sortie="$(FICHIER "$MUTANT" || true)"
leve "⑦ notes sous le plancher (6 jours)" "2,6" "$sortie"; rien_applique "⑦ notes sous le plancher"

nouvelle_base m_plancher_edge
muter 1 "  if p_edge is null or p_edge < interval '1 hour' then" "  if false then"
sortie="$(FICHIER "$MUTANT" || true)"
leve "⑦ plancher edge_* retiré (empreinte remise à jour)" "5" "$sortie"; rien_applique "⑦ plancher edge_* retiré"

nouvelle_base m_plancher_notes
muter 1 "  if p_notes is null or p_notes < interval '7 days' then" "  if false then"
sortie="$(FICHIER "$MUTANT" || true)"
leve "⑦ plancher des notes retiré (empreinte remise à jour)" "5" "$sortie"; rien_applique "⑦ plancher des notes retiré"

nouvelle_base m_definer
muter 0 "security invoker" "security definer"
sortie="$(FICHIER "$MUTANT" || true)"
leve "⑦ SECURITY DEFINER" "4" "$sortie"; rien_applique "⑦ SECURITY DEFINER"

nouvelle_base m_droits
muter 0 "revoke all on function public.purger_analytics_courte(interval, interval) from public, anon, authenticated;" ""
sortie="$(FICHIER "$MUTANT" || true)"
leve "⑦ droits laissés à PUBLIC, anon et authenticated" "4" "$sortie"; rien_applique "⑦ droits laissés"

nouvelle_base m_corps
muter 0 "  return pg_catalog.jsonb_build_object('edge', n_edge, 'notes', n_notes);" "  return pg_catalog.jsonb_build_object('edge', n_edge, 'notes', n_notes, 'x', 1);"
sortie="$(FICHIER "$MUTANT" || true)"
leve "⑦ corps modifié sans son empreinte" "4" "$sortie"; rien_applique "⑦ corps modifié"

nouvelle_base m_planification
muter 0 "  perform cron.schedule('purge_analytics_courte', '23 * * * *',
    $CMD_SRC);" ""
sortie="$(FICHIER "$MUTANT" || true)"
leve "⑦ planification oubliée" "1,2,3,6" "$sortie"; rien_applique "⑦ planification oubliée"

nouvelle_base m_inactive
Q "alter table cron.job alter column active set default false" >/dev/null
sortie="$(FICHIER "$MIGRATION" || true)"
leve "⑦ tâche désactivée" "1" "$sortie"; rien_applique "⑦ tâche désactivée"

nouvelle_base m_index
muter 0 "  where starts_with(event, 'edge_');" "  where event like 'edge%';"
sortie="$(FICHIER "$MUTANT" || true)"
leve "⑦ motif de l'index changé" "8" "$sortie"; rien_applique "⑦ motif de l'index changé"

nouvelle_base m_famille
muter 1 "   where event = 'push_envoye' and created_at < pg_catalog.now() - p_notes;" "   where event = 'push_envoyé' and created_at < pg_catalog.now() - p_notes;"
sortie="$(FICHIER "$MUTANT" || true)"
leve "⑦ mauvaise famille de notes (les vieilles restent)" "6" "$sortie"; rien_applique "⑦ mauvaise famille de notes"

nouvelle_base m_recentes
muter 1 "   where event = 'push_envoye' and created_at < pg_catalog.now() - p_notes;" "   where event = 'push_envoye' and p_notes is not null;"
sortie="$(FICHIER "$MUTANT" || true)"
leve "⑦ notes récentes effacées (le pilote, les rappels, les appels)" "7" "$sortie"; rien_applique "⑦ notes récentes effacées"

# Le PIÈGE RLS. La table n'a aucune policy DELETE : un rôle que la RLS arrête
# efface 0 ligne SANS ERREUR — et ne LIT rien non plus, si bien que les lignes 6 et
# 7 du verdict, aveugles avec lui, disent OK. Seule la ligne 3 (le catalogue) le
# voit. En production, `postgres` est propriétaire ET BYPASSRLS (mesuré le 07/11).
nouvelle_base m_rls
Q "alter table public.analytics_events owner to migrateur;
   alter table public.analytics_events force row level security;
   grant create on schema public to migrateur;
   grant usage on schema cron to migrateur;
   grant select, insert, update, delete on cron.job to migrateur;
   grant usage on sequence cron.job_jobid_seq to migrateur;" >/dev/null
verif "⑦ piège RLS, mesuré D'ABORD : le rôle propriétaire sous RLS forcée efface 0 ligne, sans erreur" \
  "$(R migrateur "delete from public.analytics_events where starts_with(event, 'edge_') returning 1" | grep -c . || true) $(Q "select count(*) from public.analytics_events where starts_with(event, 'edge_')")" "0 6"
sortie="$(FICHIER_EN migrateur "$MIGRATION" || true)"
leve "⑦ piège RLS : la ligne 3 refuse un rôle que la RLS arrête" "3" "$sortie"; rien_applique "⑦ piège RLS"

echo "── ⑧ ce que le verdict ne voit pas, le banc le voit ──"
nouvelle_base m_motif
muter 1 "   where starts_with(event, 'edge_') and created_at < pg_catalog.now() - p_edge;" "   where event like 'edge_%' and created_at < pg_catalog.now() - p_edge;"
sortie="$(FICHIER "$MUTANT" || true)"
verif "⑧ motif élargi, empreinte remise à jour : le verdict passe (8 OK)…" "$(printf '%s\n' "$sortie" | grep -c '|OK$')" "8"
verif "⑧ … mais « edgeX_… » est effacée : ② rougirait" "$( [ "$(RESTANTES)" = "$ATTENDUES" ] && echo identique || echo différent) $(Q "select count(*) from public.analytics_events where event = 'edgeX_notify'")" "différent 0"

echo "Banc purge-analytics-courte : $ok OK, $ko échec(s)"
[ "$ko" -eq 0 ]
