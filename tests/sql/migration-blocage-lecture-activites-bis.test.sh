#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migration_blocage_lecture_activites_bis_2026-11-22.sql (suites de la
# relecture adverse de #1017)
#
# Sur un PostgreSQL JETABLE, avec les définitions de PRODUCTION des aides de
# blocage, de `comment_target_visible` et de `post_is_visible` (fixtures,
# mesurées le 2026-11-22), les policies de lecture de `post_comments`,
# `post_likes`, `comment_interactions` et la policy temps réel du fil telles
# qu'en production, PUIS la première migration (état de la production) :
#   ⓪ APRÈS LA PREMIÈRE MIGRATION SEULE, les quatre trous :
#      homonymie (Kevin publie un post à l'identifiant de l'activité de Léa et
#      lit ses réponses), repartage à deux niveaux, fils sous la carte de Léa,
#      organisatrice privée des commentaires du bloqué
#   ① la bis s'applique (13 OK), se rejoue
#   ② les quatre trous sont fermés ; l'homonyme ne ferme RIEN à Léa ; Inès et
#      un visiteur lisent comme avant, sans erreur
#   ③ MUTATION : la policy temps réel du fil ne passe plus par
#      comment_target_visible → le verdict ⑪ ÉCHOUE et la bis LÈVE, rien
#      n'est validé
#   ④ RETOUR ARRIÈRE : les lignes `--|` rendent les empreintes de la première
#      migration, puis la bis se réapplique
#   ⑤ GARDE : un post_is_visible inconnu arrête tout ; sans la première
#      migration, la bis refuse de partir
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
M1="$RACINE/migrations/migration_blocage_lecture_activites_2026-11-22.sql"
BIS="$RACINE/migrations/migration_blocage_lecture_activites_bis_2026-11-22.sql"
FONCTIONS="$RACINE/tests/sql/fixtures/blocage-lecture-activites-fonctions-prod.sql"
FONCTIONS_BIS="$RACINE/tests/sql/fixtures/blocage-lecture-activites-bis-fonctions-prod.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
for f in "$M1" "$BIS" "$FONCTIONS" "$FONCTIONS_BIS"; do [ -f "$f" ] || { echo "❌ introuvable : $f"; exit 1; }; done

PORT=$(( 6060 + RANDOM % 120 ))
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

DB=blocage_activites_bis
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()  { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
EN() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "begin; set local role authenticated; set local request.jwt.claim.sub='$1'; $2 commit;" 2>&1 | grep -v -E '^(BEGIN|COMMIT|SET)$'; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "begin; set local role anon; $1 commit;" 2>&1 | grep -v -E '^(BEGIN|COMMIT|SET)$'; }
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" 2>&1; }

LEA=11111111-1111-4111-8111-111111111111     # organise, bloque Kevin
KEVIN=22222222-2222-4222-8222-222222222222   # bloqué par Léa ; forge un homonyme
INES=33333333-3333-4333-8333-333333333333    # sans blocage, partage la carte
HUGO=44444444-4444-4444-8444-444444444444    # republie la carte d'Inès

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

# ── SOCLE ───────────────────────────────────────────────────────────────────
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table public.profiles (id text primary key, is_private boolean default false);
create table public.blocks (blocker_id text, blocked_id text, primary key (blocker_id, blocked_id));
create table public.events (id text primary key, author_id text, organizer_id text, title text, city text, status text default 'active');
create table public.event_attendees (event_id text, user_id text, rsvp text, primary key (event_id, user_id));
create table public.event_comments (id text primary key, event_id text not null, author_id text not null, text text);
create table public.event_reactions (event_id text, user_id text, emoji text, primary key (event_id, user_id, emoji));
create table public.posts (id text primary key, author_id text, content text, shared_data text, shared_from_post_id text, event_id text);
create table public.post_comments (id text primary key, post_id text, author_id text, content text);
create table public.post_likes (post_id text, user_id text, primary key (post_id, user_id));
create table public.comment_interactions (id text primary key, comment_id text not null, post_id text, user_id text not null, kind text not null, payload text);
do $$ declare t text; begin
  foreach t in array array['profiles','blocks','events','event_attendees','event_comments','event_reactions','posts','post_comments','post_likes','comment_interactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;
create policy lecture on public.profiles for select using (true);
create policy blocks_select_own on public.blocks for select using (blocker_id = (select auth.uid())::text);
create policy "Lecture publique" on public.events for select using (true);
create policy ouvert on public.event_attendees for select to authenticated using (true);
create policy event_comments_select on public.event_comments for select using (true);
create policy event_reactions_select on public.event_reactions for select using (true);
create policy ouvert on public.posts for select using (true);

-- Aides que post_is_visible / comment_target_visible appellent, réduites à leur contrat.
create function public.est_identifiant_exemple(x text) returns boolean language sql immutable as $fn$ select x like 'ex_%' $fn$;
create function public.post_masque(p_id text) returns boolean language sql stable as $fn$ select false $fn$;
create function public.abonne_accepte_non_bloque(_auteur text) returns boolean language sql stable as $fn$ select false $fn$;

-- La vraie surface temps réel : un topic, la table, la policy de PRODUCTION.
create schema realtime;
create function realtime.topic() returns text language sql stable as $fn$ select nullif(current_setting('realtime.topic', true), '') $fn$;
create table realtime.messages (id bigserial primary key, topic text);
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated;
grant select on realtime.messages to authenticated;
grant execute on function realtime.topic() to anon, authenticated;
SQL
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$FONCTIONS" >/dev/null
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$FONCTIONS_BIS" >/dev/null
# Policies de PRODUCTION qui lisent par post_is_visible / comment_target_visible (mesurées le 2026-11-22).
Q "create policy \"Lecture selon visibilite du post\" on public.post_comments for select using ((author_id = (select auth.uid())::text) or post_is_visible(post_id));
   create policy \"Lecture selon visibilite du post\" on public.post_likes for select using ((user_id = (select auth.uid())::text) or post_is_visible(post_id));
   create policy \"Lecture selon visibilite de la cible\" on public.comment_interactions for select using ((user_id = (select auth.uid())::text) or comment_target_visible(comment_id, post_id));
   create policy passio_rt_recevoir_fil on realtime.messages for select to authenticated using (((realtime.topic() ~~ 'fil:%'::text) and fil_temps_reel_visible(substr(realtime.topic(), 5)) and comment_target_visible(null::text, substr(realtime.topic(), 5)) and (not post_auteur_bloque(substr(realtime.topic(), 5)))));
   revoke execute on all functions in schema public from public;
   grant execute on function public.is_blocked_with(text), public.event_auteur_bloque(text), public.post_auteur_bloque(text), public.fil_temps_reel_visible(text) to authenticated, service_role;
   grant execute on function public.comment_target_visible(text), public.comment_target_visible(text, text), public.post_is_visible(text), public.est_identifiant_exemple(text), public.post_masque(text), public.abonne_accepte_non_bloque(text) to anon, authenticated, service_role;" >/dev/null

Q "insert into public.blocks values ('$LEA', '$KEVIN');
   insert into public.events (id, author_id, title, city) values ('evt_lea', '$LEA', 'Pique-nique', 'Lyon');
   -- ① homonyme : Kevin publie un post à l'identifiant de l'activité de Léa.
   insert into public.posts (id, author_id, content) values ('evt_lea', '$KEVIN', 'homonyme');
   insert into public.event_comments values ('ec_i', 'evt_lea', '$INES', 'RDV fontaine'), ('ec_k', 'evt_lea', '$KEVIN', 'vieux commentaire de Kevin');
   insert into public.event_reactions values ('evt_lea', '$KEVIN', 'feu');
   insert into public.comment_interactions values ('ci_h', 'ec_i', 'evt_lea', '$INES', 'reply', '18h devant la fontaine');
   -- ② repartage à deux niveaux.
   insert into public.posts values
     ('post_ines_carte', '$INES', 'A partagé une activité', '{\"kind\":\"event\",\"id\":\"evt_lea\",\"city\":\"Lyon\"}', null, null),
     ('post_hugo_repost', '$HUGO', 'A partagé une publication de Inès', '{\"id\":\"post_ines_carte\",\"text\":\"A partagé une activité Pique-nique Lyon 18:00\"}', 'post_ines_carte', null),
     ('post_hugo_libre', '$HUGO', 'rien à voir', null, null, null);
   -- ③ la carte de Léa, un commentaire et un j'aime dessous.
   insert into public.posts (id, author_id, content, shared_data) values ('post_ev_evt_lea', '$LEA', 'A partagé une activité', '{\"kind\":\"event\",\"id\":\"evt_lea\"}');
   insert into public.post_comments values ('pc_1', 'post_ev_evt_lea', '$INES', 'j''y serai'), ('pc_2', 'post_hugo_libre', '$INES', 'ok');
   insert into public.post_likes values ('post_ev_evt_lea', '$INES');" >/dev/null

liste() { EN "$1" "select coalesce(string_agg($2, ',' order by $2), '-') from $3;"; }
# Le canal : la policy temps réel évaluée pour de vrai sur une ligne du topic.
CANAL() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "begin; set local realtime.topic = 'fil:$2'; set local role authenticated; set local request.jwt.claim.sub='$1'; select count(*) from realtime.messages where topic = 'fil:$2'; commit;" 2>&1 | grep -v -E '^(BEGIN|COMMIT|SET)$'; }
Q "insert into realtime.messages (topic) values ('fil:evt_lea'), ('fil:post_ev_evt_lea');" >/dev/null

echo "── PRÉALABLE : la première migration (l'état de la production) ───────"
sortie="$(APPLIQUER "$M1")" || { echo "  ❌ la première migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "première migration : 10 OK" "10" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ⓪ LES QUATRE TROUS, après la première migration seule ─────────────"
verifier "① homonymie : Kevin lit la réponse d'Inès sur l'activité de Léa" "ci_h" "$(liste "$KEVIN" id public.comment_interactions)"
verifier "① …et reçoit le canal fil:evt_lea" "1" "$(CANAL "$KEVIN" evt_lea)"
verifier "② repartage à deux niveaux : Kevin lit le repost de Hugo (titre, ville, heure)" "1" "$(EN "$KEVIN" "select count(*) from public.posts where id = 'post_hugo_repost';")"
verifier "③ fils : Kevin lit le commentaire et le j'aime sous la carte de Léa" "1|1" \
  "$(EN "$KEVIN" "select count(*) from public.post_comments where id = 'pc_1';")|$(EN "$KEVIN" "select count(*) from public.post_likes where post_id = 'post_ev_evt_lea';")"
verifier "④ Léa ne lit pas le vieux commentaire de Kevin sur SA propre activité" "0" "$(EN "$LEA" "select count(*) from public.event_comments where id = 'ec_k';")"

echo "── ① APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(APPLIQUER "$BIS")" || { echo "  ❌ la bis a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "la bis rend 13 OK et 0 ECHEC" "13/0" \
  "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(APPLIQUER "$BIS")" || { echo "  ❌ la bis REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 13 OK" "13" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ② APRÈS : les quatre trous sont fermés ────────────────────────────"
verifier "① homonymie : Kevin ne lit plus la réponse sur l'activité de Léa" "-" "$(liste "$KEVIN" id public.comment_interactions)"
verifier "① …ni le canal fil:evt_lea" "0" "$(CANAL "$KEVIN" evt_lea)"
verifier "① Kevin lit toujours son propre post (homonyme compris)" "1" "$(EN "$KEVIN" "select count(*) from public.posts where id = 'evt_lea';")"
verifier "① l'homonyme ne ferme RIEN à Léa : elle lit la réponse sur son activité" "ci_h" "$(liste "$LEA" id public.comment_interactions)"
verifier "② Kevin ne lit plus le repost de Hugo ni la carte d'Inès" "0|0" \
  "$(EN "$KEVIN" "select count(*) from public.posts where id = 'post_hugo_repost';")|$(EN "$KEVIN" "select count(*) from public.posts where id = 'post_ines_carte';")"
verifier "② …mais lit la publication libre de Hugo" "1" "$(EN "$KEVIN" "select count(*) from public.posts where id = 'post_hugo_libre';")"
verifier "③ fils : ni commentaire, ni j'aime, ni canal sous la carte de Léa" "0|0|0" \
  "$(EN "$KEVIN" "select count(*) from public.post_comments where id = 'pc_1';")|$(EN "$KEVIN" "select count(*) from public.post_likes where post_id = 'post_ev_evt_lea';")|$(CANAL "$KEVIN" post_ev_evt_lea)"
verifier "③ …post_is_visible dit faux à Kevin, vrai à Inès et à un visiteur" "f|t|t" \
  "$(EN "$KEVIN" "select public.post_is_visible('post_ev_evt_lea');")|$(EN "$INES" "select public.post_is_visible('post_ev_evt_lea');")|$(ANON "select public.post_is_visible('post_ev_evt_lea');")"
verifier "④ Léa lit tout ce qu'on a laissé sur SON activité, Kevin compris" "ec_i,ec_k|1" \
  "$(liste "$LEA" id public.event_comments)|$(EN "$LEA" "select count(*) from public.event_reactions where event_id = 'evt_lea';")"
verifier "Kevin garde ses propres lignes" "ec_k|1" \
  "$(liste "$KEVIN" id public.event_comments)|$(EN "$KEVIN" "select count(*) from public.event_reactions where event_id = 'evt_lea';")"
verifier "Inès (sans blocage) lit tout" "5|2|1|1|1" \
  "$(EN "$INES" "select count(*) from public.posts;")|$(EN "$INES" "select count(*) from public.post_comments;")|$(EN "$INES" "select count(*) from public.post_likes;")|$(EN "$INES" "select count(*) from public.comment_interactions;")|$(CANAL "$INES" evt_lea)"
verifier "un visiteur : aucune erreur, tout le public lisible" "5|2|1|1" \
  "$(ANON "select count(*) from public.posts;")|$(ANON "select count(*) from public.post_comments;")|$(ANON "select count(*) from public.post_likes;")|$(ANON "select count(*) from public.comment_interactions;")"

echo "── ③ MUTATION : la policy temps réel ne passe plus par comment_target_visible ─"
Q "alter policy passio_rt_recevoir_fil on realtime.messages using (((realtime.topic() ~~ 'fil:%'::text) and fil_temps_reel_visible(substr(realtime.topic(), 5))));" >/dev/null
avant="$(Q "select md5(prosrc) from pg_proc where oid = 'public.post_is_visible(text)'::regprocedure;")"
if sortie3="$(APPLIQUER "$BIS")"; then
  verifier "la bis LÈVE quand le verdict ⑪ échoue" "levée" "validée"
else
  verifier "la bis LÈVE quand le verdict ⑪ échoue" "levée" "$(printf '%s' "$sortie3" | grep -q 'VERDICT EN ECHEC' && echo levée || echo "autre erreur")"
fi
verifier "…et rien n'a bougé (même post_is_visible)" "$avant" "$(Q "select md5(prosrc) from pg_proc where oid = 'public.post_is_visible(text)'::regprocedure;")"
Q "alter policy passio_rt_recevoir_fil on realtime.messages using (((realtime.topic() ~~ 'fil:%'::text) and fil_temps_reel_visible(substr(realtime.topic(), 5)) and comment_target_visible(null::text, substr(realtime.topic(), 5)) and (not post_auteur_bloque(substr(realtime.topic(), 5)))));" >/dev/null

echo "── ④ RETOUR ARRIÈRE : les lignes --| de la bis ──────────────────────"
retour="$(sed -n 's/^--| \{0,1\}//p' "$BIS")"
printf '%s\n' "$retour" | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 \
  && verifier "le retour arrière s'applique" "ok" "ok" || verifier "le retour arrière s'applique" "ok" "échec"
verifier "…et rend les empreintes laissées par la première migration" "0d830765c94045194263714b9b7f2bf9|3cf606d2b4bf8605e403643342c11f5d|08d910fbe202c6aaa5e73dce487b6364" \
  "$(Q "select md5(prosrc) from pg_proc where oid = 'public.comment_target_visible(text)'::regprocedure;")|$(Q "select md5(prosrc) from pg_proc where oid = 'public.comment_target_visible(text,text)'::regprocedure;")|$(Q "select md5(prosrc) from pg_proc where oid = 'public.post_is_visible(text)'::regprocedure;")"
verifier "…sans l'aide neuve, et l'homonyme rouvre le trou (l'état d'avant)" "0|ci_h" \
  "$(Q "select count(*) from pg_proc where proname = 'publication_masquee_pour_moi';")|$(liste "$KEVIN" id public.comment_interactions)"
sortie4="$(APPLIQUER "$BIS")" || true
verifier "la bis se réapplique après le retour arrière : 13 OK" "13" "$(printf '%s\n' "$sortie4" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ⑤ GARDES ─────────────────────────────────────────────────────────"
Q "create or replace function public.post_is_visible(pid text) returns boolean language sql stable security definer set search_path to 'public' as \$fn\$ select true \$fn\$;" >/dev/null
if sortie5="$(APPLIQUER "$BIS")"; then
  verifier "un post_is_visible inconnu arrête la bis" "refus" "acceptée"
else
  verifier "un post_is_visible inconnu arrête la bis" "refus" "$(printf '%s' "$sortie5" | grep -q 'a changé depuis la mesure' && echo refus || echo "autre erreur")"
fi
Q "drop policy posts_lecture_hors_blocage on public.posts;" >/dev/null
if sortie6="$(APPLIQUER "$BIS")"; then
  verifier "sans la première migration, la bis refuse de partir" "refus" "acceptée"
else
  verifier "sans la première migration, la bis refuse de partir" "refus" "$(printf '%s' "$sortie6" | grep -q 'prérequis absent' && echo refus || echo "autre erreur")"
fi

echo
echo "RÉSULTAT : $ok vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
