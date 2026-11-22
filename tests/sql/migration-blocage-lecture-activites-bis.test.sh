#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migration_blocage_lecture_activites_bis_2026-11-22.sql (suites des
# deux relectures adverses de #1017)
#
# Sur un PostgreSQL JETABLE, avec les définitions de PRODUCTION (fixtures,
# mesurées le 2026-11-22) des aides de blocage, de `comment_target_visible`,
# `post_is_visible`, `post_masque`, `abonne_accepte_non_bloque`, les policies
# de lecture et d'écriture de #951 (`post_comments`, `post_likes`,
# `comment_interactions`, `comment_likes`), la policy temps réel du fil
# ÉVALUÉE par topic, un compte PRIVÉ et la modération, PUIS la première
# migration (l'état de la production) :
#   ⓪ AVANT la bis : les trous — homonymes tous acceptés (A : activité à
#      l'id d'une publication privée ; B : à l'id de la carte d'Inès ; miroir :
#      post à l'id de l'activité de Léa, qui OUVRE ses réponses à Kevin en
#      production ; (cid) commentaire homonyme), repost
#      à deux niveaux, fils sous la carte de Léa, organisatrice privée du
#      commentaire du bloqué
#   ① la bis s'applique (14 OK), se rejoue
#   ② APRÈS : tout homonyme est REFUSÉ (23505) dans les quatre tables, à
#      l'insertion comme au changement d'identifiant ; les trous sont fermés ;
#      le compte privé et la modération tiennent ; Inès et un visiteur lisent
#      comme avant ; la carte CITÉE SUPPRIMÉE est le reste déclaré
#   ③ MUTATIONS : policy temps réel sans comment_target_visible, ou un
#      déclencheur retiré → la bis LÈVE, rien n'est validé
#   ④ RETOUR ARRIÈRE (gardé) : refuse un état inconnu ; sinon rend les
#      empreintes ET les `qual` laissés par la première migration, puis la
#      bis se réapplique
#   ⑤ GARDES : post_is_visible inconnu, homonyme présent, première migration
#      absente → la bis refuse de partir
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
# Une écriture SOUS un rôle : rend le SQLSTATE d'un refus, ou « ok ».
ECRIT() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "begin; set local role authenticated; set local request.jwt.claim.sub='$1';
  do \$x\$ begin begin $2; raise notice 'ETAT=ok'; exception when others then raise notice 'ETAT=%', sqlstate; end; end \$x\$; rollback;" 2>&1 | sed -n 's/.*ETAT=//p'; }
# Le canal : la policy temps réel évaluée pour de vrai sur une ligne du topic.
CANAL() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "begin; set local realtime.topic = 'fil:$2'; set local role authenticated; set local request.jwt.claim.sub='$1'; select count(*) from realtime.messages where topic = 'fil:$2'; commit;" 2>&1 | grep -v -E '^(BEGIN|COMMIT|SET)$'; }

LEA=11111111-1111-4111-8111-111111111111     # organise, bloque Kevin
KEVIN=22222222-2222-4222-8222-222222222222   # bloqué par Léa
INES=33333333-3333-4333-8333-333333333333    # sans blocage, partage la carte
HUGO=44444444-4444-4444-8444-444444444444    # republie la carte d'Inès
PAUL=55555555-5555-4555-8555-555555555555    # compte PRIVÉ
Z=66666666-6666-4666-8666-666666666666       # forge des homonymes, sans blocage

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
create table public.follows (follower_id text, following_id text, status text, primary key (follower_id, following_id));
create table public.contenus_masques (target_type text not null, target_id text not null, decision text, primary key (target_type, target_id));
create table public.blocks (blocker_id text, blocked_id text, primary key (blocker_id, blocked_id));
create table public.events (id text primary key, author_id text, organizer_id text, title text, city text, status text default 'active');
create table public.event_attendees (event_id text, user_id text, rsvp text, primary key (event_id, user_id));
create table public.event_comments (id text primary key, event_id text not null, author_id text not null, text text);
create table public.event_reactions (event_id text, user_id text, emoji text, primary key (event_id, user_id, emoji));
create table public.posts (id text primary key, author_id text, content text, shared_data text, shared_from_post_id text, event_id text);
create table public.post_comments (id text primary key, post_id text, author_id text, content text);
create table public.post_likes (post_id text, user_id text, primary key (post_id, user_id));
create table public.comment_interactions (id text primary key, comment_id text not null, post_id text, user_id text not null, kind text not null, payload text);
create table public.comment_likes (comment_id text not null, user_id text not null, primary key (comment_id, user_id));
do $$ declare t text; begin
  foreach t in array array['profiles','follows','contenus_masques','blocks','events','event_attendees','event_comments','event_reactions','posts','post_comments','post_likes','comment_interactions','comment_likes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
  foreach t in array array['events','event_comments','posts','post_comments','post_likes','comment_interactions','comment_likes'] loop
    execute format('grant insert, update on public.%I to authenticated', t);
  end loop;
end $$;
create policy lecture on public.profiles for select using (true);
create policy blocks_select_own on public.blocks for select using (blocker_id = (select auth.uid())::text);
create policy "Lecture publique" on public.events for select using (true);
create policy ecriture on public.events for insert to authenticated with check (author_id = (select auth.uid())::text);
create policy maj on public.events for update to authenticated using (author_id = (select auth.uid())::text);
create policy ouvert on public.event_attendees for select to authenticated using (true);
create policy event_comments_select on public.event_comments for select using (true);
create policy ecriture on public.event_comments for insert to authenticated with check (author_id = (select auth.uid())::text);
create policy event_reactions_select on public.event_reactions for select using (true);
-- posts : la policy de PRODUCTION des comptes privés (les autres étant plus fermées ici).
create policy "Lecture respectant les comptes prives" on public.posts for select using (
  (author_id = (select auth.uid())::text) or (not exists (select 1 from public.profiles pr where pr.id = posts.author_id and pr.is_private = true))
  or abonne_accepte_non_bloque(author_id));
create policy ecriture on public.posts for insert to authenticated with check (author_id = (select auth.uid())::text);
create policy maj on public.posts for update to authenticated using (author_id = (select auth.uid())::text);
create policy ecriture on public.post_comments for insert to authenticated with check (author_id = (select auth.uid())::text);

create function public.est_identifiant_exemple(x text) returns boolean language sql immutable as $fn$ select x like 'ex_%' $fn$;

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
# Policies de PRODUCTION de #951 et des fils (mesurées le 2026-11-22).
Q "create policy \"Lecture selon visibilite du post\" on public.post_comments for select using ((author_id = (select auth.uid())::text) or post_is_visible(post_id));
   create policy post_comments_select_auteur_publication on public.post_comments for select to authenticated using (exists (select 1 from posts p where p.id = post_comments.post_id and p.author_id = (select auth.uid())::text));
   create policy post_comments_visibilite_insert on public.post_comments as restrictive for insert to authenticated with check (post_is_visible(post_id));
   create policy \"Lecture selon visibilite du post\" on public.post_likes for select using ((user_id = (select auth.uid())::text) or post_is_visible(post_id));
   create policy \"Lecture selon visibilite de la cible\" on public.comment_interactions for select using ((user_id = (select auth.uid())::text) or comment_target_visible(comment_id, post_id));
   create policy ci_insert on public.comment_interactions for insert to authenticated with check (user_id = (select auth.uid())::text);
   create policy ci_visibilite_insert on public.comment_interactions as restrictive for insert to authenticated with check (comment_target_visible(comment_id, post_id));
   create policy comment_likes_select on public.comment_likes for select to anon, authenticated using ((user_id = (select auth.uid())::text) or comment_target_visible(comment_id));
   create policy comment_likes_insert_own on public.comment_likes for insert with check (user_id = (select auth.uid())::text);
   create policy comment_likes_visibilite_insert on public.comment_likes as restrictive for insert to authenticated with check (comment_target_visible(comment_id));
   create policy passio_rt_recevoir_fil on realtime.messages for select to authenticated using (((realtime.topic() ~~ 'fil:%'::text) and fil_temps_reel_visible(substr(realtime.topic(), 5)) and comment_target_visible(null::text, substr(realtime.topic(), 5)) and (not post_auteur_bloque(substr(realtime.topic(), 5)))));
   revoke execute on all functions in schema public from public;
   grant execute on function public.is_blocked_with(text), public.event_auteur_bloque(text), public.post_auteur_bloque(text), public.fil_temps_reel_visible(text) to authenticated, service_role;
   grant execute on function public.comment_target_visible(text), public.comment_target_visible(text, text), public.post_is_visible(text), public.est_identifiant_exemple(text), public.post_masque(text), public.abonne_accepte_non_bloque(text) to anon, authenticated, service_role;" >/dev/null

Q "insert into public.profiles values ('$PAUL', true);
   insert into public.blocks values ('$LEA', '$KEVIN');
   insert into public.events (id, author_id, title, city) values ('evt_lea', '$LEA', 'Pique-nique', 'Lyon');
   insert into public.event_comments values ('ec_i', 'evt_lea', '$INES', 'RDV fontaine'), ('ec_k', 'evt_lea', '$KEVIN', 'vieux commentaire de Kevin');
   insert into public.event_reactions values ('evt_lea', '$KEVIN', 'feu');
   insert into public.comment_interactions values ('ci_h', 'ec_i', 'evt_lea', '$INES', 'reply', '18h devant la fontaine');
   insert into public.posts values
     ('post_ines_carte', '$INES', 'A partagé une activité', '{\"kind\":\"event\",\"id\":\"evt_lea\",\"city\":\"Lyon\"}', null, null),
     ('post_hugo_repost', '$HUGO', 'A partagé une publication de Inès', '{\"id\":\"post_ines_carte\",\"text\":\"A partagé une activité Pique-nique Lyon 18:00\"}', 'post_ines_carte', null),
     ('post_hugo_libre', '$HUGO', 'rien à voir', null, null, null),
     ('post_hugo_masque', '$HUGO', 'masqué par la modération', null, null, null),
     ('post_paul_prive', '$PAUL', 'privé de Paul', null, null, null),
     ('post_lea', '$LEA', 'publication de Léa', null, null, null);
   insert into public.contenus_masques values ('post', 'post_hugo_masque', null);
   insert into public.posts (id, author_id, content, shared_data) values ('post_ev_evt_lea', '$LEA', 'A partagé une activité', '{\"kind\":\"event\",\"id\":\"evt_lea\"}');
   insert into public.post_comments values ('pc_1', 'post_ev_evt_lea', '$INES', 'j''y serai'), ('pc_p', 'post_paul_prive', '$PAUL', 'fil privé'), ('pc_m', 'post_hugo_masque', '$INES', 'sous un masqué');
   insert into public.post_likes values ('post_ev_evt_lea', '$INES');
   insert into public.comment_interactions values ('ci_p', 'pc_p', 'post_paul_prive', '$PAUL', 'reply', 'secret de Paul'), ('ci_c', 'ec_i', 'post_ines_carte', '$INES', 'reply', 'sous la carte');
   insert into public.comment_likes values ('pc_p', '$PAUL');
   insert into realtime.messages (topic) values ('fil:evt_lea'), ('fil:post_ev_evt_lea'), ('fil:post_paul_prive'), ('fil:post_ines_carte'), ('fil:post_lea');" >/dev/null

liste() { EN "$1" "select coalesce(string_agg($2, ',' order by $2), '-') from $3;"; }

echo "── PRÉALABLE : la première migration (l'état de la production) ───────"
sortie="$(APPLIQUER "$M1")" || { echo "  ❌ la première migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "première migration : 10 OK" "10" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)"
QUAL_M1="$(Q "select string_agg(tablename || ':' || qual, ' | ' order by tablename) from pg_policies where policyname like '%_lecture_hors_blocage';")"

echo "── ⓪ AVANT LA BIS : les trous ──────────────────────────────────────"
verifier "A : rien n'empêche Z de créer une ACTIVITÉ à l'id d'une publication privée de Paul" "ok" "$(ECRIT "$Z" "insert into public.events (id, author_id, title) values ('post_paul_prive', '$Z', 'homonyme')")"
# Avec l'ordre de #951 (la publication AVANT l'activité), cet homonyme-là n'ouvre rien : c'est
# l'ordre inverse (premier essai de la bis, refusé) qui ouvrait le fil privé à un visiteur.
Q "insert into public.events (id, author_id, title) values ('post_paul_prive', '$Z', 'homonyme');" >/dev/null
verifier "A : …avec l'ordre de #951, un visiteur ne lit pas le fil privé de Paul" "-" "$(ANON "select coalesce(string_agg(id, ','), '-') from public.comment_interactions where post_id = 'post_paul_prive';")"
Q "delete from public.events where id = 'post_paul_prive';" >/dev/null
# Le trou RÉEL en production (RV-45) : le post homonyme de l'activité.
Q "insert into public.posts (id, author_id, content) values ('evt_lea', '$KEVIN', 'homonyme');" >/dev/null
verifier "miroir (RV-45, état de la production) : avec un post à l'id de l'activité de Léa, Kevin lit ses réponses" "ci_h" "$(liste "$KEVIN" "id" "public.comment_interactions where post_id = 'evt_lea'")"
verifier "miroir : …et reçoit son canal" "1" "$(CANAL "$KEVIN" evt_lea)"
Q "delete from public.posts where id = 'evt_lea';" >/dev/null
verifier "B : Kevin crée une activité à l'id de la carte d'Inès" "ok" "$(ECRIT "$KEVIN" "insert into public.events (id, author_id, title) values ('post_ines_carte', '$KEVIN', 'homonyme')")"
verifier "miroir : Kevin publie un post à l'id de l'activité de Léa" "ok" "$(ECRIT "$KEVIN" "insert into public.posts (id, author_id, content) values ('evt_lea', '$KEVIN', 'homonyme')")"
verifier "(cid) : Z écrit un commentaire d'activité à l'id d'un commentaire privé" "ok" "$(ECRIT "$Z" "insert into public.event_comments (id, event_id, author_id, text) values ('pc_p', 'evt_lea', '$Z', 'homonyme')")"
verifier "repost à deux niveaux : Kevin lit le repost de Hugo" "1" "$(EN "$KEVIN" "select count(*) from public.posts where id = 'post_hugo_repost';")"
verifier "fils : Kevin lit commentaire et j'aime sous la carte de Léa (son canal, déjà refusé par post_auteur_bloque)" "1|1|0" \
  "$(EN "$KEVIN" "select count(*) from public.post_comments where id = 'pc_1';")|$(EN "$KEVIN" "select count(*) from public.post_likes where post_id = 'post_ev_evt_lea';")|$(CANAL "$KEVIN" post_ev_evt_lea)"
verifier "organisatrice : Léa ne lit pas le vieux commentaire de Kevin sur SON activité" "0" "$(EN "$LEA" "select count(*) from public.event_comments where id = 'ec_k';")"

echo "── ① APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(APPLIQUER "$BIS")" || { echo "  ❌ la bis a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "la bis rend 14 OK et 0 ECHEC" "14/0" \
  "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(APPLIQUER "$BIS")" || { echo "  ❌ la bis REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 14 OK" "14" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ② APRÈS : plus d'homonyme, trous fermés ───────────────────────────"
verifier "A : l'activité homonyme d'une publication privée est REFUSÉE" "23505" "$(ECRIT "$Z" "insert into public.events (id, author_id, title) values ('post_paul_prive', '$Z', 'homonyme')")"
verifier "A : …le visiteur ne lit pas le fil privé de Paul" "-" "$(ANON "select coalesce(string_agg(id, ','), '-') from public.comment_interactions where post_id = 'post_paul_prive';")"
verifier "A : …ni un connecté, ni son canal" "-|0" "$(liste "$Z" "id" "public.comment_interactions where post_id = 'post_paul_prive'")|$(CANAL "$Z" post_paul_prive)"
verifier "B : l'activité homonyme de la carte d'Inès est REFUSÉE" "23505" "$(ECRIT "$KEVIN" "insert into public.events (id, author_id, title) values ('post_ines_carte', '$KEVIN', 'homonyme')")"
verifier "B : …Kevin ne lit ni l'interaction sous la carte, ni son canal" "-|0" "$(liste "$KEVIN" "id" "public.comment_interactions where post_id = 'post_ines_carte'")|$(CANAL "$KEVIN" post_ines_carte)"
verifier "miroir : le post homonyme de l'activité de Léa est REFUSÉ" "23505" "$(ECRIT "$KEVIN" "insert into public.posts (id, author_id, content) values ('evt_lea', '$KEVIN', 'homonyme')")"
verifier "miroir : une activité homonyme d'une publication de Léa est REFUSÉE" "23505" "$(ECRIT "$KEVIN" "insert into public.events (id, author_id, title) values ('post_lea', '$KEVIN', 'homonyme')")"
verifier "(cid) : un commentaire d'activité homonyme d'un commentaire privé est REFUSÉ" "23505" "$(ECRIT "$Z" "insert into public.event_comments (id, event_id, author_id, text) values ('pc_p', 'evt_lea', '$Z', 'homonyme')")"
verifier "(cid) : …et un commentaire de publication homonyme d'un commentaire d'activité aussi" "23505" "$(ECRIT "$Z" "insert into public.post_comments (id, post_id, author_id, content) values ('ec_i', 'post_hugo_libre', '$Z', 'homonyme')")"
verifier "(cid) : Z ne lit pas qui a aimé le commentaire privé" "0" "$(EN "$Z" "select count(*) from public.comment_likes where comment_id = 'pc_p';")"
verifier "un changement d'identifiant VERS un homonyme est REFUSÉ" "23505" "$(ECRIT "$HUGO" "update public.posts set id = 'evt_lea' where id = 'post_hugo_libre'")"
verifier "un changement d'identifiant ordinaire passe" "ok" "$(ECRIT "$HUGO" "update public.posts set id = 'post_hugo_libre_2' where id = 'post_hugo_libre'")"
verifier "une publication neuve ordinaire passe" "ok" "$(ECRIT "$INES" "insert into public.posts (id, author_id, content) values ('post_ines_neuf', '$INES', 'bonjour')")"
verifier "repost à deux niveaux : Kevin ne lit plus le repost de Hugo ni la carte d'Inès" "0|0" \
  "$(EN "$KEVIN" "select count(*) from public.posts where id = 'post_hugo_repost';")|$(EN "$KEVIN" "select count(*) from public.posts where id = 'post_ines_carte';")"
verifier "fils : ni commentaire, ni j'aime, ni canal sous la carte de Léa" "0|0|0" \
  "$(EN "$KEVIN" "select count(*) from public.post_comments where id = 'pc_1';")|$(EN "$KEVIN" "select count(*) from public.post_likes where post_id = 'post_ev_evt_lea';")|$(CANAL "$KEVIN" post_ev_evt_lea)"
verifier "fils : Kevin ne peut plus commenter sous la carte de Léa (post_is_visible)" "42501" "$(ECRIT "$KEVIN" "insert into public.post_comments (id, post_id, author_id, content) values ('pc_kev', 'post_ev_evt_lea', '$KEVIN', 'x')")"
verifier "fils : …ni l'activité de Léa, ni son canal (première migration, intacte)" "-|0" "$(liste "$KEVIN" "id" "public.comment_interactions where post_id = 'evt_lea'")|$(CANAL "$KEVIN" evt_lea)"
verifier "organisatrice : Léa lit tout ce qu'on a laissé sur SON activité, Kevin compris" "ec_i,ec_k|1" \
  "$(liste "$LEA" id public.event_comments)|$(EN "$LEA" "select count(*) from public.event_reactions where event_id = 'evt_lea';")"
verifier "Léa garde son canal et ses réponses" "1|ci_h" "$(CANAL "$LEA" evt_lea)|$(liste "$LEA" "id" "public.comment_interactions where post_id = 'evt_lea'")"
verifier "compte privé : Inès ne lit pas Paul ; la modération tient (commentaire sous un masqué)" "0|0|0" \
  "$(EN "$INES" "select count(*) from public.posts where id = 'post_paul_prive';")|$(EN "$INES" "select count(*) from public.post_comments where id = 'pc_p';")|$(EN "$Z" "select count(*) from public.post_comments where id = 'pc_m';")"
verifier "Inès (sans blocage) lit le public" "1|1|1|1|1" \
  "$(EN "$INES" "select count(*) from public.posts where id = 'post_hugo_repost';")|$(EN "$INES" "select count(*) from public.post_comments where id = 'pc_1';")|$(EN "$INES" "select count(*) from public.post_likes;")|$(EN "$INES" "select count(*) from public.comment_interactions where id = 'ci_h';")|$(CANAL "$INES" post_ev_evt_lea)"
verifier "un visiteur : aucune erreur, le public lisible" "1|1|1|ci_c,ci_h" \
  "$(ANON "select count(*) from public.posts where id = 'post_hugo_repost';")|$(ANON "select count(*) from public.post_comments where id = 'pc_1';")|$(ANON "select count(*) from public.post_likes;")|$(ANON "select coalesce(string_agg(id, ',' order by id), '-') from public.comment_interactions;")"
echo "   reste DÉCLARÉ : la carte citée supprimée"
Q "delete from public.posts where id = 'post_ines_carte';" >/dev/null
verifier "carte d'Inès supprimée : le repost de Hugo redevient lisible par Kevin (reste hors lot, déclaré)" "1" "$(EN "$KEVIN" "select count(*) from public.posts where id = 'post_hugo_repost';")"

echo "── ③ MUTATIONS : le verdict LÈVE, rien n'est validé ──────────────────"
Q "alter policy passio_rt_recevoir_fil on realtime.messages using (((realtime.topic() ~~ 'fil:%'::text) and fil_temps_reel_visible(substr(realtime.topic(), 5))));" >/dev/null
if sortie3="$(APPLIQUER "$BIS")"; then verifier "policy temps réel sans comment_target_visible → la bis LÈVE" "levée" "validée"
else verifier "policy temps réel sans comment_target_visible → la bis LÈVE" "levée" "$(printf '%s' "$sortie3" | grep -q 'VERDICT EN ECHEC' && echo levée || echo "autre erreur")"; fi
Q "alter policy passio_rt_recevoir_fil on realtime.messages using (((realtime.topic() ~~ 'fil:%'::text) and fil_temps_reel_visible(substr(realtime.topic(), 5)) and comment_target_visible(null::text, substr(realtime.topic(), 5)) and (not post_auteur_bloque(substr(realtime.topic(), 5)))));" >/dev/null
Q "drop trigger aa_identifiant_sans_homonyme on public.event_comments;" >/dev/null
verifier "déclencheur retiré : un homonyme repasse (prémisse)" "ok" "$(ECRIT "$Z" "insert into public.event_comments (id, event_id, author_id, text) values ('pc_p', 'evt_lea', '$Z', 'homonyme')")"
APPLIQUER "$BIS" >/dev/null 2>&1 || true
verifier "…la bis le repose (rejouable)" "23505" "$(ECRIT "$Z" "insert into public.event_comments (id, event_id, author_id, text) values ('pc_p', 'evt_lea', '$Z', 'homonyme')")"

echo "── ④ RETOUR ARRIÈRE (gardé) ─────────────────────────────────────────"
retour="$(sed -n 's/^--| \{0,1\}//p' "$BIS")"
Q "create or replace function public.post_is_visible(pid text) returns boolean language sql stable security definer set search_path to 'public' as \$fn\$ select false \$fn\$;" >/dev/null
if printf '%s\n' "$retour" | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1; then
  verifier "le retour arrière refuse un état qui n'est pas celui de la bis" "refus" "accepté"
else verifier "le retour arrière refuse un état qui n'est pas celui de la bis" "refus" "refus"; fi
APPLIQUER "$BIS" >/dev/null 2>&1 || true   # la garde refuse ce post_is_visible : on remet la fixture, puis la bis
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$FONCTIONS_BIS" >/dev/null
APPLIQUER "$BIS" >/dev/null
printf '%s\n' "$retour" | psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 \
  && verifier "le retour arrière s'applique sur l'état de la bis" "ok" "ok" || verifier "le retour arrière s'applique sur l'état de la bis" "ok" "échec"
verifier "…rend les empreintes de la première migration" "0d830765c94045194263714b9b7f2bf9|3cf606d2b4bf8605e403643342c11f5d|08d910fbe202c6aaa5e73dce487b6364" \
  "$(Q "select md5(prosrc) from pg_proc where oid = 'public.comment_target_visible(text)'::regprocedure;")|$(Q "select md5(prosrc) from pg_proc where oid = 'public.comment_target_visible(text,text)'::regprocedure;")|$(Q "select md5(prosrc) from pg_proc where oid = 'public.post_is_visible(text)'::regprocedure;")"
verifier "…et les qual des policies de la première migration, à l'identique" "$QUAL_M1" \
  "$(Q "select string_agg(tablename || ':' || qual, ' | ' order by tablename) from pg_policies where policyname like '%_lecture_hors_blocage';")"
verifier "…sans aide neuve ni déclencheur" "0|0" \
  "$(Q "select count(*) from pg_proc where proname in ('publication_masquee_pour_moi', 'identifiant_sans_homonyme');")|$(Q "select count(*) from pg_trigger where tgname = 'aa_identifiant_sans_homonyme';")"
sortie4="$(APPLIQUER "$BIS")" || true
verifier "la bis se réapplique après le retour arrière : 14 OK" "14" "$(printf '%s\n' "$sortie4" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ⑤ GARDES ─────────────────────────────────────────────────────────"
Q "alter table public.events disable trigger aa_identifiant_sans_homonyme; insert into public.events (id, author_id, title) values ('post_lea', '$Z', 'homonyme posé à la main');" >/dev/null
if sortie5="$(APPLIQUER "$BIS")"; then verifier "un homonyme présent arrête la bis" "refus" "acceptée"
else verifier "un homonyme présent arrête la bis" "refus" "$(printf '%s' "$sortie5" | grep -q 'homonyme(s)' && echo refus || echo "autre erreur")"; fi
Q "delete from public.events where id = 'post_lea'; alter table public.events enable trigger aa_identifiant_sans_homonyme;" >/dev/null
Q "create or replace function public.post_is_visible(pid text) returns boolean language sql stable security definer set search_path to 'public' as \$fn\$ select true \$fn\$;" >/dev/null
if sortie6="$(APPLIQUER "$BIS")"; then verifier "un post_is_visible inconnu arrête la bis" "refus" "acceptée"
else verifier "un post_is_visible inconnu arrête la bis" "refus" "$(printf '%s' "$sortie6" | grep -q 'a changé depuis la mesure' && echo refus || echo "autre erreur")"; fi
Q "drop policy posts_lecture_hors_blocage on public.posts;" >/dev/null
if sortie7="$(APPLIQUER "$BIS")"; then verifier "sans la première migration, la bis refuse de partir" "refus" "acceptée"
else verifier "sans la première migration, la bis refuse de partir" "refus" "$(printf '%s' "$sortie7" | grep -q 'prérequis absent' && echo refus || echo "autre erreur")"; fi

echo
echo "RÉSULTAT : $ok vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
