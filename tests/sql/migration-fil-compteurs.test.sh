#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_fil_compteurs_2026-09-21.sql
#
# Ce qu'il prouve, sur un PostgreSQL JETABLE portant les policies RLS de
# PRODUCTION (`post_likes`, `post_comments`, `comment_interactions` : « ma
# ligne, ou la cible est visible ») et leurs fonctions d'appui telles qu'elles
# sont en base (`post_is_visible`, `abonne_accepte_non_bloque`,
# `comment_target_visible`, `is_blocked_with`) :
#   ① la migration s'applique, 5 OK, et se REJOUE ;
#   ② pour CHAQUE compte (privé, abonné accepté, abonné bloqué, sans lien,
#      visiteur sans compte), `fil_compteurs` rend EXACTEMENT ce qu'un GET
#      direct rend — le compte de likes, le compte de commentaires, mon like —
#      ligne par ligne, sous la même RLS ; ce n'est pas une valeur attendue
#      recopiée, c'est l'ÉGALITÉ avec la lecture directe qui est mesurée ;
#   ③ les aperçus sont les DEUX plus récents, dans cet ordre, sans profil (le
#      client tient son cache) ; les réactions ne portent que emoji/gif de la publication ;
#   ④ un identifiant inconnu rend 0 / faux / [] sans erreur, un tableau NULL
#      ou vide rend zéro ligne, et le 61ᵉ identifiant est IGNORÉ (borne) ;
#   ⑤ MUTATION : la même fonction en SECURITY DEFINER laisserait un compte
#      bloqué compter les likes d'un post qu'il ne voit pas — la migration
#      mutée doit ANNULER sa transaction (c'est la garde qu'on éprouve), et un
#      témoin hors migration montre ce que le DEFINER aurait laissé passer.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_fil_compteurs_2026-09-21.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6440 + RANDOM % 120 ))
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

DB=filcompteurs
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
Q()  { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# ⚠️ `set local role` et sa requête DOIVENT partir dans le MÊME appel (ADR-012).
EN() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1; }

A=11111111-1111-1111-1111-111111111111   # compte PRIVÉ, auteur de post_a
B=22222222-2222-2222-2222-222222222222   # abonné accepté de A, puis BLOQUÉ par A
C=33333333-3333-3333-3333-333333333333   # abonné accepté de A, jamais bloqué
D=44444444-4444-4444-4444-444444444444   # sans lien avec A
P=55555555-5555-5555-5555-555555555555   # compte PUBLIC, auteur de post_p

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }

# ── SOCLE : les tables lues par la fonction, avec les policies de PRODUCTION ─
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -v a="$A" -v b="$B" -v c="$C" -v d="$D" -v p="$P" >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin;
grant usage on schema public to anon, authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema auth to anon, authenticated;

create table public.profiles (id text primary key, username text, emoji text, color text, avatar_url text, is_private boolean default false);
create table public.follows (follower_id text, following_id text, status text default 'accepted', primary key (follower_id, following_id));
create table public.blocks (blocker_id text, blocked_id text, primary key (blocker_id, blocked_id));
create table public.posts (id text primary key, author_id text, content text, created_at timestamp default now());
create table public.post_likes (post_id text not null, user_id text not null, primary key (post_id, user_id));
create table public.post_comments (id text primary key, post_id text, author_id text, content text, created_at timestamp default now());
create table public.comment_interactions (id text primary key, comment_id text not null, post_id text, user_id text not null, kind text not null, payload text, created_at timestamptz not null default now());
alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.comment_interactions enable row level security;
grant select on public.profiles, public.follows, public.blocks, public.posts, public.post_likes, public.post_comments, public.comment_interactions to anon, authenticated;
create policy profils_lecture on public.profiles for select using (true);
create policy follows_lecture on public.follows for select using (status = 'accepted' or follower_id = auth.uid()::text or following_id = auth.uid()::text);
create policy blocks_propres on public.blocks for select using (blocker_id = auth.uid()::text);

-- Fonctions d'appui, telles qu'elles sont EN PRODUCTION (lues au canal ① le 2026-09-21).
create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path to '' as $$
  select case when auth.uid() is null or _other is null or _other = (auth.uid())::text then false
    else exists (select 1 from public.blocks b where (b.blocker_id = (auth.uid())::text and b.blocked_id = _other) or (b.blocker_id = _other and b.blocked_id = (auth.uid())::text)) end $$;
create function public.abonne_accepte_non_bloque(_auteur text) returns boolean language sql stable security definer set search_path to '' as $$
  select case when auth.uid() is null or _auteur is null then false
    else exists (select 1 from public.follows f where f.follower_id = (auth.uid())::text and f.following_id = _auteur and f.status = 'accepted')
     and not exists (select 1 from public.blocks b where (b.blocker_id = _auteur and b.blocked_id = (auth.uid())::text) or (b.blocker_id = (auth.uid())::text and b.blocked_id = _auteur)) end $$;
create function public.post_is_visible(pid text) returns boolean language sql stable security definer set search_path to 'public' as $$
  select case when pid is null then true
    when not exists (select 1 from posts where id = pid) then true
    else exists (select 1 from posts p where p.id = pid and (
      p.author_id = (select auth.uid())::text
      or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
      or public.abonne_accepte_non_bloque(p.author_id))) end $$;
create function public.comment_target_visible(cid text) returns boolean language sql stable security definer set search_path to 'public' as $$
  select case when cid is null then true
    when exists (select 1 from posts where id = cid) then public.post_is_visible(cid)
    when exists (select 1 from post_comments where id = cid) then public.post_is_visible((select post_id from post_comments where id = cid limit 1))
    else true end $$;
grant execute on function public.is_blocked_with(text), public.abonne_accepte_non_bloque(text), public.post_is_visible(text), public.comment_target_visible(text) to anon, authenticated;

-- Policies de lecture de PRODUCTION (lues au canal ① le 2026-09-21).
create policy "Lecture respectant les comptes prives" on public.posts for select using (
  author_id = (select auth.uid())::text
  or not exists (select 1 from public.profiles pr where pr.id = posts.author_id and pr.is_private = true)
  or public.abonne_accepte_non_bloque(author_id));
create policy "Lecture selon visibilite du post" on public.post_likes for select using (user_id = (select auth.uid())::text or public.post_is_visible(post_id));
create policy "Lecture selon visibilite du post" on public.post_comments for select using (author_id = (select auth.uid())::text or public.post_is_visible(post_id));
create policy "Lecture selon visibilite de la cible" on public.comment_interactions for select using (user_id = (select auth.uid())::text or public.comment_target_visible(comment_id));

insert into public.profiles values
  (:'a', 'A privé', '🔒', '#111', null, true), (:'b', 'B', '🅱', '#222', 'https://x/b.jpg', false),
  (:'c', 'C', '©', '#333', null, false), (:'d', 'D', '🇩', '#444', null, false), (:'p', 'P public', '🅿', '#555', null, false);
insert into public.follows values (:'b', :'a', 'accepted'), (:'c', :'a', 'accepted');
insert into public.blocks values (:'a', :'b');
insert into public.posts (id, author_id, content) values ('post_a', :'a', 'privé de A'), ('post_p', :'p', 'public de P'), ('post_vide', :'p', 'sans rien');
-- post_a : 3 likes (dont celui de B, bloqué depuis), 3 commentaires ; post_p : 2 likes, 1 commentaire.
insert into public.post_likes values ('post_a', :'b'), ('post_a', :'c'), ('post_a', :'d'), ('post_p', :'a'), ('post_p', :'b');
insert into public.post_comments (id, post_id, author_id, content, created_at) values
  ('ca1', 'post_a', :'c', 'premier',  '2026-09-01 10:00:00'),
  ('ca2', 'post_a', :'b', 'deuxième', '2026-09-01 11:00:00'),
  ('ca3', 'post_a', :'a', 'troisième', '2026-09-01 12:00:00'),
  ('cp1', 'post_p', :'d', 'coucou',   '2026-09-02 09:00:00');
insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload, created_at) values
  ('i1', 'post_p', 'post_p', :'b', 'emoji', '😍', '2026-09-02 10:00:00+00'),
  ('i2', 'post_p', 'post_p', :'c', 'gif',   'https://g/x.gif', '2026-09-02 10:01:00+00'),
  ('i3', 'post_p', 'post_p', :'d', 'like',  null, '2026-09-02 10:02:00+00'),
  ('i4', 'cp1',    'post_p', :'a', 'emoji', '🔥', '2026-09-02 10:03:00+00'),
  ('i5', 'post_a', 'post_a', :'c', 'emoji', '👏', '2026-09-02 10:04:00+00');
SQL

echo "── ① APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || {
  echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
n_ok="$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)"
n_echec="$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
verifier "le tableau de verdict rend 5 OK et 0 ECHEC" "5/0" "$n_ok/$n_echec"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" \
  || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 5 OK" "5" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)"

echo "── ② ÉGALITÉ AVEC LA LECTURE DIRECTE, COMPTE PAR COMPTE ─────────────"
# La même requête que le client d'avant (GET des lignes), et la fonction, sous le
# MÊME rôle et la MÊME identité : les trois nombres doivent coïncider.
DIRECT="select (select count(*) from public.post_likes where post_id = X) || '/' || (select count(*) from public.post_comments where post_id = X) || '/' || (select exists (select 1 from public.post_likes where post_id = X and user_id = auth.uid()::text))"
FONCTION="select likes || '/' || commentaires || '/' || aime from public.fil_compteurs(array[X])"
cible_dans() { printf '%s' "$1" | sed "s/X/'$2'/g"; }
for cible in post_a post_p post_vide; do
  d="$(cible_dans "$DIRECT" "$cible")"; f="$(cible_dans "$FONCTION" "$cible")"
  for compte in "A:$A" "B:$B" "C:$C" "D:$D" "P:$P"; do
    nom="${compte%%:*}"; id="${compte#*:}"
    verifier "$nom sur $cible : fonction = lecture directe ($(EN "$id" "$d;"))" "$(EN "$id" "$d;")" "$(EN "$id" "$f;")"
  done
  verifier "visiteur sur $cible : fonction = lecture directe ($(ANON "$d;"))" "$(ANON "$d;")" "$(ANON "$f;")"
done
# Les valeurs elles-mêmes, pour que la fiche dise ce que la RLS fait vraiment.
verifier "C (abonné accepté) compte les 3 likes de post_a et a aimé" "3/3/t" "$(EN "$C" "$(cible_dans "$FONCTION" post_a);")"
verifier "B (bloqué par A) ne voit que SA propre ligne : 1 like, 1 commentaire" "1/1/t" "$(EN "$B" "$(cible_dans "$FONCTION" post_a);")"
verifier "D (sans lien) voit sa propre ligne : 1 like, 0 commentaire" "1/0/t" "$(EN "$D" "$(cible_dans "$FONCTION" post_a);")"
verifier "visiteur : rien sur le post privé" "0/0/f" "$(ANON "$(cible_dans "$FONCTION" post_a);")"
verifier "visiteur : tout sur le post public, sans like à lui" "2/1/f" "$(ANON "$(cible_dans "$FONCTION" post_p);")"

echo "── ③ APERÇUS ET RÉACTIONS ────────────────────────────────────────────"
verifier "C : les DEUX aperçus les plus récents de post_a, du plus récent au plus ancien" "ca3,ca2" \
  "$(EN "$C" "select string_agg(x->>'id', ',') from public.fil_compteurs(array['post_a']) f, jsonb_array_elements(f.apercus) x;")"
verifier "…sans le profil de l'auteur (le client tient son cache ; passions ≈ 1 Ko par ligne)" "author_id,content,created_at,id" \
  "$(EN "$C" "select string_agg(k, ',' order by k) from public.fil_compteurs(array['post_a']) f, jsonb_object_keys(f.apercus->0) k;")"
verifier "…et le contenu, l'auteur et la date du commentaire" "troisième|$A|2026-09-01T12:00:00" \
  "$(EN "$C" "select (apercus->0->>'content') || '|' || (apercus->0->>'author_id') || '|' || (apercus->0->>'created_at') from public.fil_compteurs(array['post_a']);")"
verifier "B (bloqué) : un seul aperçu, le sien" "ca2" \
  "$(EN "$B" "select string_agg(x->>'id', ',') from public.fil_compteurs(array['post_a']) f, jsonb_array_elements(f.apercus) x;")"
verifier "réactions de post_p : emoji et gif de la publication, PAS le like ni la réaction du commentaire" "😍,https://g/x.gif" \
  "$(EN "$D" "select string_agg(x->>'payload', ',') from public.fil_compteurs(array['post_p']) f, jsonb_array_elements(f.reactions) x;")"
verifier "…chaque réaction porte user_id, kind, payload, created_at" "$B|emoji|😍" \
  "$(EN "$D" "select (reactions->0->>'user_id') || '|' || (reactions->0->>'kind') || '|' || (reactions->0->>'payload') from public.fil_compteurs(array['post_p']);")"
verifier "post sans rien : 0 / 0 / faux / [] / []" "0|0|f|[]|[]" \
  "$(EN "$D" "select likes || '|' || commentaires || '|' || aime || '|' || apercus::text || '|' || reactions::text from public.fil_compteurs(array['post_vide']);")"

echo "── ④ BORNES ─────────────────────────────────────────────────────────"
verifier "identifiant inconnu : une ligne à zéro, pas d'erreur" "inconnu|0|0|f" \
  "$(EN "$D" "select post_id || '|' || likes || '|' || commentaires || '|' || aime from public.fil_compteurs(array['inconnu']);")"
verifier "tableau NULL : zéro ligne" "0" "$(EN "$D" "select count(*) from public.fil_compteurs(null);")"
verifier "tableau vide : zéro ligne" "0" "$(EN "$D" "select count(*) from public.fil_compteurs('{}');")"
verifier "un NULL dans le tableau est ignoré" "1" "$(EN "$D" "select count(*) from public.fil_compteurs(array['post_p', null]);")"
verifier "doublons dédupliqués" "1" "$(EN "$D" "select count(*) from public.fil_compteurs(array['post_p', 'post_p']);")"
verifier "61 identifiants : 60 lignes, le 61ᵉ ignoré" "60|f" \
  "$(EN "$D" "select count(*) || '|' || bool_or(post_id = 'id61') from public.fil_compteurs((select array_agg('id' || g) from generate_series(1, 61) g));")"
verifier "une page de 20 : 20 lignes, une par identifiant, dans le tableau" "20" \
  "$(EN "$D" "select count(distinct post_id) from public.fil_compteurs((select array_agg('id' || g) from generate_series(1, 20) g));")"
verifier "un compte sans droit d'exécution (rôle nu) est refusé" "permission denied" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "create role nu nologin; grant usage on schema public to nu; set local role nu; select count(*) from public.fil_compteurs(array['post_p']);" 2>&1 | grep -o 'permission denied' | head -1)"

echo "── ⑤ MUTATION : la même fonction en SECURITY DEFINER est REFUSÉE par la migration ─"
mutant="$(mktemp)"; trap 'rm -f "$mutant"; nettoyer' EXIT
sed 's/^security invoker$/security definer/' "$MIGRATION" > "$mutant"
verifier "le mutant diffère bien de la migration (la mutation a porté)" "1" "$(diff "$MIGRATION" "$mutant" | grep -c '^> security definer' || true)"
# Avec ON_ERROR_STOP, psql s'arrête à l'exception de la garde : le verdict n'est
# jamais imprimé, la transaction est annulée, la version revue reste en place.
set +e
sortie3="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$mutant" 2>&1)"; code3=$?
set -e
verifier "l'application du mutant SORT EN ERREUR" "1" "$([ "$code3" -ne 0 ] && echo 1 || echo 0)"
verifier "…avec le motif nommé par la garde" "1" "$(printf '%s\n' "$sortie3" | grep -c 'doit rester SECURITY INVOKER' || true)"
verifier "…sans imprimer de verdict (la transaction s'est arrêtée avant)" "0" "$(printf '%s\n' "$sortie3" | grep -cE '\|\s*(OK|ECHEC)\s*$' || true)"
verifier "…et la fonction en base est toujours INVOKER" "f" "$(Q "select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'fil_compteurs';")"
verifier "…donc B (bloqué) ne compte toujours que sa ligne" "1" "$(EN "$B" "select likes from public.fil_compteurs(array['post_a']);")"
# Ce que le DEFINER aurait laissé passer, mesuré HORS migration pour que la fiche le dise :
Q "alter function public.fil_compteurs(text[]) security definer;" >/dev/null
verifier "(témoin) en DEFINER, B compterait les 3 likes d'un post qu'il ne voit pas — le défaut que la garde ferme" "3"   "$(EN "$B" "select likes from public.fil_compteurs(array['post_a']);")"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1
verifier "réappliquée : B ne compte de nouveau que sa ligne" "1" "$(EN "$B" "select likes from public.fil_compteurs(array['post_a']);")"

echo
echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
