#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migration_blocage_lecture_activites_2026-11-22.sql (village, B3)
#
# Ce qu'il prouve, sur un PostgreSQL JETABLE, avec les définitions de
# PRODUCTION des aides de blocage et de `comment_target_visible`
# (fixtures/blocage-lecture-activites-fonctions-prod.sql, mesurées le
# 2026-11-22) et des policies permissives les plus OUVERTES (lecture = true) :
#   ⓪ AVANT : Léa bloque Kevin, Kevin lit encore l'activité de Léa, ses
#      commentaires, ses réactions, ses publications, la carte de partage
#      qu'Inès republie, et entre dans le canal `fil:<activité>` (le défaut B3)
#   ① la migration s'applique, 10 OK, et se rejoue
#   ② APRÈS : Kevin ne lit plus rien de Léa, dans aucune table ; Léa ne lit
#      plus Kevin (blocage dans les deux sens) ; ses PROPRES lignes restent
#      lisibles ; Inès (sans blocage) et un visiteur lisent comme avant, sans
#      erreur ; un `shared_data` mal formé ne fait pas échouer la lecture
#   ③ MUTATION : la policy des activités retirée → Kevin relit l'activité, et
#      le verdict ① dit ECHEC
#   ③bis RETOUR ARRIÈRE : les lignes `--|` rendent les corps mesurés (mêmes
#      empreintes md5 que la garde), et la migration se réapplique ensuite
#   ④ GARDE : un `comment_target_visible` différent de celui mesuré arrête la
#      migration sans rien appliquer
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_blocage_lecture_activites_2026-11-22.sql"
FONCTIONS="$RACINE/tests/sql/fixtures/blocage-lecture-activites-fonctions-prod.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }
[ -f "$FONCTIONS" ] || { echo "❌ fixture introuvable : $FONCTIONS"; exit 1; }

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

DB=blocage_activites
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()  { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
EN() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "begin; set local role authenticated; set local request.jwt.claim.sub='$1'; $2 commit;" 2>&1 | grep -v -E '^(BEGIN|COMMIT|SET)$'; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "begin; set local role anon; $1 commit;" 2>&1 | grep -v -E '^(BEGIN|COMMIT|SET)$'; }

LEA=11111111-1111-4111-8111-111111111111     # organise, bloque Kevin
KEVIN=22222222-2222-4222-8222-222222222222   # bloqué par Léa
INES=33333333-3333-4333-8333-333333333333    # sans blocage, republie Léa

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

# ── SOCLE : tables et rôles de production, policies permissives OUVERTES ────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -v lea="$LEA" -v kevin="$KEVIN" -v ines="$INES" >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table public.blocks (blocker_id text, blocked_id text, primary key (blocker_id, blocked_id));
create table public.events (id text primary key, author_id text, organizer_id text, title text, city text, status text default 'active');
create table public.event_attendees (event_id text, user_id text, rsvp text, primary key (event_id, user_id));
create table public.event_comments (id text primary key, event_id text not null, author_id text not null, text text);
create table public.event_reactions (event_id text, user_id text, emoji text, primary key (event_id, user_id, emoji));
create table public.posts (id text primary key, author_id text, content text, shared_data text, shared_from_post_id text, event_id text);
create table public.post_comments (id text primary key, post_id text, author_id text);
create table public.comment_interactions (id text primary key, comment_id text not null, post_id text, user_id text not null, kind text not null, payload text);
do $$ declare t text; begin
  foreach t in array array['blocks','events','event_attendees','event_comments','event_reactions','posts','post_comments','comment_interactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;
-- Comme en production : chacun ne voit que SES blocages.
create policy blocks_select_own on public.blocks for select using (blocker_id = (select auth.uid())::text);
-- Le pire cas : tout est ouvert en lecture (c'est la production pour events,
-- event_comments, event_reactions ; les autres sont plus fermées).
create policy "Lecture publique" on public.events for select using (true);
create policy ouvert on public.event_attendees for select to authenticated using (true);
create policy event_comments_select on public.event_comments for select using (true);
create policy event_reactions_select on public.event_reactions for select using (true);
create policy ouvert on public.posts for select using (true);
create policy ouvert on public.post_comments for select using (true);
create policy ouvert on public.comment_interactions for select using (true);

-- Aides que `comment_target_visible` appelle, réduites à leur contrat.
create function public.post_is_visible(pid text) returns boolean language sql stable security definer set search_path = public
  as $fn$ select exists (select 1 from posts where id = pid) $fn$;
create function public.est_identifiant_exemple(x text) returns boolean language sql immutable
  as $fn$ select x like 'ex_%' $fn$;
SQL
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$FONCTIONS" >/dev/null
# Droits de PRODUCTION : les aides de blocage, authenticated seulement ;
# comment_target_visible, anon aussi.
Q "revoke execute on all functions in schema public from public;
   grant execute on function public.is_blocked_with(text), public.event_auteur_bloque(text), public.post_auteur_bloque(text), public.fil_temps_reel_visible(text) to authenticated, service_role;
   grant execute on function public.comment_target_visible(text), public.comment_target_visible(text, text), public.post_is_visible(text), public.est_identifiant_exemple(text) to anon, authenticated, service_role;" >/dev/null

Q "insert into public.blocks values ('$LEA', '$KEVIN');
   insert into public.events (id, author_id, title, city) values
     ('evt_lea', '$LEA', 'Pique-nique', 'Lyon'), ('evt_ines', '$INES', 'Concert', 'Paris'), ('evt_kev', '$KEVIN', 'Spam', 'Nice');
   insert into public.events (id, author_id, organizer_id, title, city) values ('evt_ines_org_lea', '$INES', '$LEA', 'Atelier', 'Lyon');
   insert into public.event_attendees values ('evt_lea', '$INES', 'going'), ('evt_lea', '$KEVIN', 'going'), ('evt_ines', '$KEVIN', 'going');
   insert into public.event_comments values ('ec_1', 'evt_lea', '$INES', 'on y va'), ('ec_2', 'evt_ines', '$LEA', 'moi aussi'), ('ec_3', 'evt_ines', '$INES', 'super'), ('ec_4', 'evt_ines_org_lea', '$INES', 'RDV 18h fontaine');
   insert into public.event_reactions values ('evt_lea', '$INES', 'feu'), ('evt_ines', '$LEA', 'feu'), ('evt_ines', '$INES', 'feu');
   insert into public.comment_interactions values ('ci_1', 'ec_1', 'evt_lea', '$INES', 'reply', 'x'), ('ci_2', 'ec_3', 'evt_ines', '$INES', 'reply', 'y'), ('ci_3', 'ec_4', 'evt_ines_org_lea', '$INES', 'reply', 'z');
   insert into public.posts values
     ('post_lea', '$LEA', 'post de Léa', null, null, null),
     ('post_ev_evt_lea', '$LEA', 'A partagé une activité', '{\"kind\":\"event\",\"id\":\"evt_lea\",\"city\":\"Lyon\"}', null, null),
     ('post_ines_carte', '$INES', 'A partagé une activité', '{\"kind\":\"event\",\"id\":\"evt_lea\",\"city\":\"Lyon\"}', null, null),
     ('post_ines_repost', '$INES', 'A partagé une publication de Léa', '{\"id\":\"post_lea\",\"text\":\"x\"}', 'post_lea', null),
     ('post_ines_album', '$INES', 'photo', null, null, 'evt_lea'),
     ('post_ines_album_org', '$INES', 'photo', null, null, 'evt_ines_org_lea'),
     ('post_ines_libre', '$INES', 'rien à voir', null, null, null),
     ('post_ines_casse', '$INES', 'json cassé', '{\"kind\":\"event\", pas fini', null, null),
     ('post_kevin', '$KEVIN', 'spam', null, null, null);" >/dev/null

liste() { EN "$1" "select coalesce(string_agg($2, ',' order by $2), '-') from $3;"; }
FIL="select (public.fil_temps_reel_visible('evt_lea') and public.comment_target_visible(null, 'evt_lea'))::text;"

echo "── ⓪ AVANT : le défaut B3 ────────────────────────────────────────────"
verifier "Kevin lit l'activité de Léa (le défaut)" "1" "$(EN "$KEVIN" "select count(*) from public.events where id = 'evt_lea';")"
verifier "…la carte de partage qu'Inès republie" "1" "$(EN "$KEVIN" "select count(*) from public.posts where id = 'post_ines_carte';")"
verifier "…et entre dans le canal fil:evt_lea" "true" "$(EN "$KEVIN" "$FIL")"

echo "── ① APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "le tableau de verdict rend 10 OK et 0 ECHEC" "10/0" \
  "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 10 OK" "10" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ② APRÈS : Kevin ne lit plus rien de Léa ───────────────────────────"
verifier "activités lues par Kevin : ni celle de Léa, ni celle qu'elle organise" "evt_ines,evt_kev" "$(liste "$KEVIN" id public.events)"
verifier "inscrits lus par Kevin : sa propre ligne seulement sur celle de Léa" "evt_ines/$KEVIN,evt_lea/$KEVIN" \
  "$(EN "$KEVIN" "select coalesce(string_agg(event_id || '/' || user_id, ',' order by event_id, user_id), '-') from public.event_attendees;")"
verifier "commentaires d'activité lus par Kevin : ni sur les activités de Léa (créée OU organisée), ni écrits par Léa" "ec_3" "$(liste "$KEVIN" id public.event_comments)"
verifier "réactions lues par Kevin : idem" "evt_ines/$INES" \
  "$(EN "$KEVIN" "select coalesce(string_agg(event_id || '/' || user_id, ',' order by event_id, user_id), '-') from public.event_reactions;")"
verifier "interactions lues par Kevin : pas celles des fils des activités de Léa" "ci_2" "$(liste "$KEVIN" id public.comment_interactions)"
verifier "publications lues par Kevin : ni Léa, ni sa carte, ni la carte / le repartage / les albums d'Inès" "post_ines_casse,post_ines_libre,post_kevin" "$(liste "$KEVIN" id public.posts)"
verifier "canal fil:evt_lea refusé à Kevin" "false" "$(EN "$KEVIN" "$FIL")"
verifier "canal fil: de l'activité qu'Inès a créée et que Léa organise, refusé à Kevin" "false" \
  "$(EN "$KEVIN" "select (public.fil_temps_reel_visible('evt_ines_org_lea') and public.comment_target_visible(null, 'evt_ines_org_lea'))::text;")"
verifier "Léa, organisatrice de l'activité d'Inès, en lit les commentaires" "1" "$(EN "$LEA" "select count(*) from public.event_comments where event_id = 'evt_ines_org_lea';")"
verifier "blocage dans les deux sens : Léa ne lit plus l'activité ni la publication de Kevin" "0|0" \
  "$(EN "$LEA" "select count(*) from public.events where id = 'evt_kev';")|$(EN "$LEA" "select count(*) from public.posts where id = 'post_kevin';")"
verifier "Léa organise : elle lit TOUS ses inscrits, Kevin compris" "2" "$(EN "$LEA" "select count(*) from public.event_attendees where event_id = 'evt_lea';")"
verifier "Léa lit son activité et ses publications" "1|2" \
  "$(EN "$LEA" "select count(*) from public.events where id = 'evt_lea';")|$(EN "$LEA" "select count(*) from public.posts where author_id = '$LEA';")"
verifier "Inès (sans blocage) lit tout" "4|9|4|3|3|true" \
  "$(EN "$INES" "select count(*) from public.events;")|$(EN "$INES" "select count(*) from public.posts;")|$(EN "$INES" "select count(*) from public.event_comments;")|$(EN "$INES" "select count(*) from public.event_reactions;")|$(EN "$INES" "select count(*) from public.comment_interactions;")|$(EN "$INES" "$FIL")"
verifier "un visiteur : aucune erreur, tout le public lisible" "4|9|4|3" \
  "$(ANON "select count(*) from public.events;")|$(ANON "select count(*) from public.posts;")|$(ANON "select count(*) from public.event_comments;")|$(ANON "select count(*) from public.comment_interactions;")"
verifier "le visiteur ne peut appeler aucune des deux aides neuves (droit à authenticated seul)" "f|f" \
  "$(Q "select has_function_privilege('anon', 'public.activite_de_partage(text)', 'EXECUTE');")|$(Q "select has_function_privilege('anon', 'public.activite_masquee_pour_moi(text)', 'EXECUTE');")"

echo "── ③ MUTATION : la policy des activités retirée ──────────────────────"
Q "drop policy events_lecture_hors_blocage on public.events;" >/dev/null
verifier "prémisse : Kevin relit l'activité de Léa" "1" "$(EN "$KEVIN" "select count(*) from public.events where id = 'evt_lea';")"
verifier "…et le verdict ① dit ECHEC" "ECHEC" \
  "$(Q "select case when exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='events_lecture_hors_blocage') then 'OK' else 'ECHEC' end;")"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1
verifier "rejeu après mutation : Kevin ne lit plus" "0" "$(EN "$KEVIN" "select count(*) from public.events where id = 'evt_lea';")"

echo "── ③bis RETOUR ARRIÈRE : les lignes --| du fichier ────────────────────"
retour="$(sed -n 's/^--| \{0,1\}//p' "$MIGRATION")"
verifier "le bloc de retour arrière est présent" "1|1" "$(printf '%s\n' "$retour" | grep -c '^begin;$')|$(printf '%s\n' "$retour" | grep -c '^commit;$')"
printf '%s\n' "$retour" | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 \
  && verifier "le retour arrière s'applique" "ok" "ok" || verifier "le retour arrière s'applique" "ok" "échec"
verifier "…et rend les corps MESURÉS (empreintes de la garde)" "e28dab528fd25c573fa6b5d40a90f1f8|f8af90b8f1764d68230301b3544dc988" \
  "$(Q "select md5(prosrc) from pg_proc where oid = 'public.comment_target_visible(text,text)'::regprocedure;")|$(Q "select md5(prosrc) from pg_proc where oid = 'public.comment_target_visible(text)'::regprocedure;")"
verifier "…sans policy ni aide neuve" "0|0" \
  "$(Q "select count(*) from pg_policies where policyname like '%_lecture_hors_blocage';")|$(Q "select count(*) from pg_proc where proname in ('activite_masquee_pour_moi', 'activite_de_partage');")"
verifier "…donc Kevin relit l'activité de Léa (l'état d'avant)" "1" "$(EN "$KEVIN" "select count(*) from public.events where id = 'evt_lea';")"
sortie4="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || true
verifier "la migration se réapplique après le retour arrière : 10 OK" "10" "$(printf '%s\n' "$sortie4" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ④ GARDE : une définition qui a changé arrête tout ─────────────────"
Q "drop policy events_lecture_hors_blocage on public.events;
   create or replace function public.comment_target_visible(cid text, pid text) returns boolean language sql stable security definer set search_path to 'public'
     as \$fn\$ select true \$fn\$;" >/dev/null
if sortie3="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)"; then
  verifier "la garde refuse une définition inconnue" "refus" "acceptée"
else
  verifier "la garde refuse une définition inconnue" "refus" "$(printf '%s' "$sortie3" | grep -q 'a changé depuis la mesure' && echo refus || echo "autre erreur")"
fi
verifier "…et rien n'est appliqué (transaction annulée)" "0" \
  "$(Q "select count(*) from pg_policies where policyname = 'events_lecture_hors_blocage';")"

echo
echo "RÉSULTAT : $ok vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
