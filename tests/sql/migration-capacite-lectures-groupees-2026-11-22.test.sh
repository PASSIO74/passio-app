#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# BANC — CAPACITÉ du 2026-11-22 (D14-01, suite) : réactions et stories lues en
# un appel groupé, la visibilité décidée une fois par cible.
#
# Sur un PostgreSQL natif jetable (socket privé, aucune cible distante) :
#   ① AVANT : le défaut est MESURÉ — les fonctions de visibilité sont COMPTÉES
#      (compteur de session) pendant une lecture sous règle de lecture : une fois
#      par ligne lue ;
#   ② la migration se joue DEUX fois, sans ÉCHEC dans son tableau de verdict ;
#   ③ APRÈS : chaque fonction groupée rend EXACTEMENT les lignes que rend la
#      lecture sous règle (même ensemble, même ordre), pour quatre identités
#      (propriétaire, tiers, compte bloqué, visiteur), et n'appelle la fonction de
#      visibilité qu'une fois par cible ;
#   ④ la garde refuse de s'appliquer si une règle de lecture a changé.
#
# Les fonctions de visibilité du socle sont des doublures : ce qui est éprouvé, c'est
# que les fonctions groupées appliquent la MÊME règle, avec la MÊME fonction, moins
# souvent — pas le détail de la visibilité, qu'elles ne recopient pas.
#
#   bash tests/sql/migration-capacite-lectures-groupees-2026-11-22.test.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -z "$PGBIN" ] || export PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo 'ECHEC : PostgreSQL natif requis pour ce banc'; exit 1; }
PORT=$((7500 + RANDOM % 100))
if [ "$(id -u)" -eq 0 ]; then
 id pgbanc >/dev/null 2>&1 || useradd -m pgbanc
 BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU='su pgbanc -c'
else BASE="$(mktemp -d)"; SU='bash -c'; fi
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres -E UTF8" >/dev/null
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses= -c timezone=UTC\" -l '$BASE/pg.log' start -w" >/dev/null
DB=passio_test_lectures_groupees
createdb -h "$BASE" -p "$PORT" -U postgres "$DB"
PSQL=(psql -X -h "$BASE" -p "$PORT" -U postgres -d "$DB" -qAt -v ON_ERROR_STOP=1)
Q() { "${PSQL[@]}" -c "$1"; }
# EN <rôle> <compte> <sql> : une requête sous un rôle client, avec l'identité d'un compte.
EN() { "${PSQL[@]}" -c "set request.jwt.claim.sub = '$2'" -c "set role $1" -c "$3"; }
# APPELS <rôle> <compte> <compteur> <sql> : le nombre d'appels d'une fonction de visibilité
# pendant cette requête (compteur de session remis à zéro juste avant).
APPELS() { "${PSQL[@]}" -c "set request.jwt.claim.sub = '$2'" -c "select set_config('banc.$3', '0', false)" -c "set role $1" -c "$4" -c "reset role" -c "select current_setting('banc.$3')" | tail -1; }
issue() { if "$@" >"$BASE/issue.log" 2>&1; then echo accepte; else echo refuse; fi; }
cd "$RACINE"
MIG=migrations/migration_capacite_lectures_groupees_2026-11-22.sql

A=11111111-1111-4111-8111-111111111111   # propriétaire de la story S1
B=22222222-2222-4222-8222-222222222222   # tiers, auteur de la story S2
C=33333333-3333-4333-8333-333333333333   # en blocage avec A
D=44444444-4444-4444-8444-444444444444   # compte privé, auteur de S3
ok=0; ko=0
verifier() {
 if [ "$2" = "$3" ]; then ok=$((ok+1)); echo "  OK     $1"
 else ko=$((ko+1)); echo "  ECHEC  $1 — attendu [$3], obtenu [$2]"; fi
}

# ── Socle : rôles, identité, tables, droits et règles de lecture TELS QUE RELUS EN PRODUCTION
# le 2026-11-22 (mêmes noms, mêmes rôles, mêmes expressions : la garde de la migration les compare).
Q "create role anon; create role authenticated; create role service_role;
create schema auth; grant usage on schema auth to anon, authenticated;
create function auth.uid() returns uuid language sql stable as
 \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
-- Le compteur d'appels : une variable de session, incrémentée par chaque doublure.
create function public.banc_compter(nom text) returns void language sql volatile as
 \$\$ select set_config('banc.' || nom, (coalesce(nullif(current_setting('banc.' || nom, true), ''), '0')::int + 1)::text, false) \$\$;
grant execute on function public.banc_compter(text) to anon, authenticated;
create table public.profiles(id text primary key, is_private boolean not null default false);
create table public.blocks(blocker_id text, blocked_id text);
create table public.follows(follower_id text, following_id text, status text);
create table public.cibles_visibles(cible text primary key);   -- fils et cibles visibles de tous
create table public.comment_interactions(id text primary key, comment_id text not null, post_id text, user_id text not null,
 kind text not null, payload text, created_at timestamptz not null default now());
create table public.stories(id text primary key, author_id text);
create table public.story_likes(story_id text not null, user_id text not null, created_at timestamptz not null default now(), primary key (story_id, user_id));
create table public.story_views(story_id text not null, user_id text not null, seen_at timestamptz not null default now());
create table public.story_comments(id text primary key, story_id text not null, author_id text not null, content text not null,
 created_at timestamptz not null default now());

-- Doublures des fonctions de visibilité (SECURITY DEFINER, comme en production), qui se comptent.
create function public.comment_target_visible(cid text, pid text) returns boolean language plpgsql stable security definer set search_path = '' as
 \$\$ begin perform public.banc_compter('ctv');
   return exists (select 1 from public.cibles_visibles v where v.cible = coalesce(pid, cid)); end \$\$;
create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path = '' as
 \$\$ select case when auth.uid() is null or _other is null or _other = (auth.uid())::text then false
   else exists (select 1 from public.blocks b where (b.blocker_id = (auth.uid())::text and b.blocked_id = _other)
                                               or (b.blocker_id = _other and b.blocked_id = (auth.uid())::text)) end \$\$;
create function public.story_est_a_moi(_story_id text) returns boolean language plpgsql stable security definer set search_path = '' as
 \$\$ begin perform public.banc_compter('est');
   return case when auth.uid() is null or _story_id is null then false
     else exists (select 1 from public.stories s where s.id = _story_id and s.author_id = (auth.uid())::text) end; end \$\$;
create function public.story_visible(_story_id text) returns boolean language plpgsql stable security definer set search_path = '' as
 \$\$ begin perform public.banc_compter('vis');
   return case when auth.uid() is null or _story_id is null then false else exists (
     select 1 from public.stories s where s.id = _story_id and (
       s.author_id = (auth.uid())::text
       or (not exists (select 1 from public.profiles pr where pr.id = s.author_id and pr.is_private) and not public.is_blocked_with(s.author_id))
       or exists (select 1 from public.follows f where f.follower_id = (auth.uid())::text and f.following_id = s.author_id and f.status = 'accepted'))) end; end \$\$;

alter table public.comment_interactions enable row level security;
alter table public.story_likes enable row level security;
alter table public.story_views enable row level security;
alter table public.story_comments enable row level security;
grant select on public.comment_interactions, public.story_views to anon, authenticated;
grant select on public.story_likes, public.story_comments to authenticated;
create policy \"Lecture selon visibilite de la cible\" on public.comment_interactions for select to public
 using ((user_id = (select auth.uid())::text) or comment_target_visible(comment_id, post_id));
create policy story_comments_select on public.story_comments for select to authenticated
 using (story_est_a_moi(story_id) or (story_visible(story_id) and not is_blocked_with(author_id)));
create policy story_likes_select on public.story_likes for select to authenticated
 using ((user_id = (select auth.uid())::text) or (story_est_a_moi(story_id) and not is_blocked_with(user_id)));
create policy story_views_select_auteur_story on public.story_views for select to authenticated
 using (story_est_a_moi(story_id) and not is_blocked_with(user_id));
create policy story_views_select_own on public.story_views for select to public
 using (user_id = (select auth.uid())::text);" >/dev/null

# ── Données. Fils : P1 visible de tous ; P2 privé (A y a ses propres lignes). Une interaction sans
# fil (`post_id` nul) vise c9, invisible. 200 « j'aime » sur c1 (fil P1) : la discussion populaire.
Q "insert into public.profiles values ('$A',false),('$B',false),('$C',false),('$D',true);
insert into public.blocks values ('$A','$C');
insert into public.cibles_visibles values ('P1');
insert into public.comment_interactions(id, comment_id, post_id, user_id, kind, payload, created_at)
 select 'l' || g, 'c1', 'P1', 'u' || lpad(g::text, 3, '0'), 'like', null, timestamptz '2026-11-22 10:00' + g * interval '1 second' from generate_series(1, 200) g;
insert into public.comment_interactions(id, comment_id, post_id, user_id, kind, payload, created_at) values
 ('e1','c1','P1','$B','emoji','😍', '2026-11-22 11:00'), ('g1','c1','P1','$C','gif','https://exemple.invalid/a.gif','2026-11-22 11:01'),
 ('r1','srep_1','P1','$B','emoji','👍','2026-11-22 11:02'), ('r2','srep_2','P1','$A','like',null,'2026-11-22 11:03'),
 ('p1','c2','P2','$A','like',null,'2026-11-22 11:04'), ('p2','c2','P2','$B','like',null,'2026-11-22 11:05'),
 ('p3','c2','P2','$B','emoji','🔥','2026-11-22 11:06'), ('n1','c9',null,'$B','like',null,'2026-11-22 11:07'),
 ('n2','c9',null,'$A','emoji','👀','2026-11-22 11:08');
insert into public.stories values ('S1','$A'),('S2','$B'),('S3','$D');
insert into public.story_likes(story_id, user_id) select 'S1', 'u' || lpad(g::text, 3, '0') from generate_series(1, 300) g;
insert into public.story_likes(story_id, user_id) values ('S1','$B'),('S1','$C'),('S2','$A'),('S2','$C');
insert into public.story_views(story_id, user_id, seen_at) values ('S1','$B','2026-11-22 09:00'),('S1','$C','2026-11-22 09:01'),('S1','$A','2026-11-22 09:02'),('S2','$A','2026-11-22 09:03');
insert into public.story_comments(id, story_id, author_id, content, created_at) values
 ('k1','S1','$B','bravo','2026-11-22 12:00'),('k2','S1','$C','super','2026-11-22 12:01'),
 ('k3','S2','$A','joli','2026-11-22 12:02'),('k4','S2','$C','top','2026-11-22 12:03'),
 ('k5','S3','$B','privé','2026-11-22 12:04');" >/dev/null

IDS="array['c1','srep_1','srep_2','c2','c9']"
DIRECT_CI="select string_agg(id, ',' order by created_at, id) from public.comment_interactions where comment_id = any($IDS)"
DIRECT_CI_EG="select string_agg(id, ',' order by created_at, id) from public.comment_interactions where comment_id = any($IDS) and kind = any(array['emoji','gif'])"
GROUPE_CI="select string_agg(id, ',' order by created_at, id) from public.interactions_cibles($IDS)"
GROUPE_CI_EG="select string_agg(id, ',' order by created_at, id) from public.interactions_cibles($IDS, array['emoji','gif'], 1000)"

echo "① AVANT : le défaut est mesuré (un appel de visibilité par ligne lue)"
verifier "discussion de 211 lignes lue par A : comment_target_visible appelée au moins 200 fois" \
 "$(APPELS authenticated "$A" ctv "$DIRECT_CI" | awk '{print ($1 >= 200) ? "oui" : "non (" $1 ")"}')" "oui"
verifier "activité de S1 lue par A : story_est_a_moi appelée au moins 300 fois" \
 "$(APPELS authenticated "$A" est "select count(*) from public.story_likes where story_id = 'S1'" | awk '{print ($1 >= 300) ? "oui" : "non (" $1 ")"}')" "oui"
verifier "fonctions groupées absentes" "$(Q "select count(*) from pg_proc where proname in ('interactions_cibles','story_activite','story_commentaires_lire','story_nb_commentaires')")" "0"

echo "② la migration, deux fois"
for passe in 1 2; do
 sortie="$("${PSQL[@]}" -f "$MIG")"
 verifier "passe $passe : aucune ligne ECHEC au verdict" "$(printf '%s\n' "$sortie" | grep -c 'ECHEC' || true)" "0"
 verifier "passe $passe : quatre lignes OK" "$(printf '%s\n' "$sortie" | grep -c '|OK$' || true)" "4"
done

echo "③ APRÈS : mêmes lignes que la règle de lecture, visibilité décidée une fois par cible"
for qui in "A:$A" "B:$B" "C:$C"; do
 nom="${qui%%:*}"; uid="${qui#*:}"
 verifier "réactions, $nom : mêmes lignes, même ordre" "$(EN authenticated "$uid" "$GROUPE_CI")" "$(EN authenticated "$uid" "$DIRECT_CI")"
 verifier "réactions emoji/gif, $nom : mêmes lignes" "$(EN authenticated "$uid" "$GROUPE_CI_EG")" "$(EN authenticated "$uid" "$DIRECT_CI_EG")"
done
verifier "réactions, visiteur : mêmes lignes" "$(EN anon '' "$GROUPE_CI")" "$(EN anon '' "$DIRECT_CI")"
verifier "réactions, A : ses lignes d'un fil privé comprises, celles de B exclues" \
 "$(EN authenticated "$A" "select string_agg(id, ',' order by id) from public.interactions_cibles(array['c2','c9'])")" "n2,p1"
verifier "réactions : 5 couples (commentaire, fil), 5 appels de visibilité (et non 211)" "$(APPELS authenticated "$A" ctv "$GROUPE_CI")" "5"
verifier "réactions : la borne de lignes s'applique après la visibilité" \
 "$(EN authenticated "$B" "select count(*) from public.interactions_cibles(array['c1'], null, 50)")" "50"
verifier "réactions : au plus 1 000 lignes, même si l'on en demande plus" \
 "$(EN authenticated "$B" "select count(*) from public.interactions_cibles(array['c1'], null, 100000)")" "202"
verifier "réactions : 300 identifiants au plus" \
 "$(EN authenticated "$B" "select count(*) from public.interactions_cibles(array_fill('x'::text, array[300]) || array['c1'])")" "0"

LIKES_JSON="select coalesce(jsonb_agg(user_id order by user_id), '[]'::jsonb) from (select user_id from public.story_likes where story_id = 'S1' order by user_id limit 1000) x"
VUES_JSON="select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'seen_at', seen_at) order by seen_at desc), '[]'::jsonb) from (select user_id, seen_at from public.story_views where story_id = 'S1' order by seen_at desc limit 500) x"
for qui in "A:$A" "B:$B" "C:$C"; do
 nom="${qui%%:*}"; uid="${qui#*:}"
 verifier "story S1, $nom : « j'aime » identiques" "$(EN authenticated "$uid" "select public.story_activite('S1')->'jaime'")" "$(EN authenticated "$uid" "$LIKES_JSON")"
 verifier "story S1, $nom : vues identiques" "$(EN authenticated "$uid" "select public.story_activite('S1')->'vues'")" "$(EN authenticated "$uid" "$VUES_JSON")"
 for s in S1 S2 S3; do
  verifier "commentaires $s, $nom : mêmes lignes" \
   "$(EN authenticated "$uid" "select coalesce(string_agg(id, ',' order by created_at, id), '-') from public.story_commentaires_lire('$s')")" \
   "$(EN authenticated "$uid" "select coalesce(string_agg(id, ',' order by created_at, id), '-') from public.story_comments where story_id = '$s'")"
  verifier "compte des commentaires $s, $nom : identique" \
   "$(EN authenticated "$uid" "select public.story_nb_commentaires('$s')")" \
   "$(EN authenticated "$uid" "select count(*) from public.story_comments where story_id = '$s'")"
 done
done
verifier "story S1, A : 301 « j'aime » visibles, sans C (bloqué)" "$(EN authenticated "$A" "select jsonb_array_length(public.story_activite('S1')->'jaime') || ':' || (public.story_activite('S1')->'jaime' ? '$C')")" "301:false"
verifier "story : story_est_a_moi appelée une fois (et non 304)" "$(APPELS authenticated "$A" est "select public.story_activite('S1')")" "1"
verifier "commentaires : story_visible appelée une fois" "$(APPELS authenticated "$A" vis "select public.story_nb_commentaires('S2')")" "1"
verifier "stories : refusées au visiteur" "$(issue EN anon '' "select public.story_activite('S1')")" "refuse"
verifier "réactions : permises au visiteur" "$(issue EN anon '' "select count(*) from public.interactions_cibles(array['c1'])")" "accepte"

echo "④ la garde : une règle de lecture ajoutée arrête la migration"
Q "create policy story_likes_tous on public.story_likes for select to authenticated using (true);" >/dev/null
if "${PSQL[@]}" -f "$MIG" >"$BASE/garde.log" 2>&1; then garde=accepte; else garde=refuse; fi
verifier "règle ajoutée : migration refusée" "$garde" "refuse"
verifier "règle ajoutée : message de la garde" "$(grep -c 'plus equivalentes' "$BASE/garde.log" || true)" "1"

echo
echo "banc lectures groupées : $ok OK, $ko ECHEC"
[ "$ko" -eq 0 ]
