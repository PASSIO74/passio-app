#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migration_epingle_commentaire_2026-11-05.sql (RV-38, audit 2026-11-02)
#
# Sur un PostgreSQL JETABLE (utilisateur `pgbanc`), avec les tables, corps de
# fonctions, déclencheurs et policies de PRODUCTION lus au canal ① (05/11, et le
# 06/11 pour les quatre tables du décor) comme point de départ :
#   ⓪ le socle est la production : empreintes des corps (md5, fins de ligne
#      normalisées), des policies de comment_interactions, posts, post_comments,
#      events et event_comments, leurs déclencheurs, ci_kind_check au caractère près
#   ① AVANT (le défaut, ROUGE) : le propriétaire d'une publication épingle un
#      commentaire de son fil → 23514 (ci_kind_check). Et la correction NAÏVE
#      (ajouter `pin` à la contrainte, rien d'autre) ouvre la porte : un inconnu
#      épingle chez autrui, et tout le monde le lit
#   ② le verdict de la migration, réinjecté sur cet état de production, ROUGIT —
#      et le garde-fou refuse
#   ③ la migration s'applique (21 OK, 0 ECHEC, information à 0), déclare son
#      prérequis client, se rejoue
#   ④ APRÈS (VERT), hors verdict, sous les rôles : propriétaire, organisateur
#      (organizer_id), inconnu, auteur du commentaire, visiteur ; les homonymes
#      CRÉÉS PAR UN CLIENT sous la RLS de production (scénarios de la red team :
#      publication sous l'identifiant d'une activité, l'inverse, commentaire
#      homonyme, commentaire renommé) ; la purge R31 ; un UPDATE futur (policy
#      ajoutée) est jugé ; la clé de service ne l'est pas ; un compte en
#      suppression reste refusé par sa barrière
#   ⑤ VERROU : une écriture qui tient comment_interactions fait échouer la
#      migration en 5 s (lock_timeout), sans rien appliquer
#   ⑥ RETOUR ARRIÈRE : ci_kind_check revient au caractère près, la garde et sa
#      fonction partent, les épingles écrites depuis aussi ; puis la migration
#      se rejoue
#   ⑦ MUTATIONS : chaque correctif retiré fait REFUSER la migration (fermée sur
#      échec) en nommant les lignes du verdict qui le gardent — et rien n'est
#      appliqué
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_epingle_commentaire_2026-11-05.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v python3 >/dev/null || { echo "❌ python3 introuvable (mutations du banc)"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 5960 + RANDOM % 120 ))
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
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses= -c timezone=UTC\" -l '$BASE/pg.log' start" >/dev/null 2>&1
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

DB=rv38
SQLDIR="$BASE/sql"; mkdir -p "$SQLDIR"; chmod 755 "$SQLDIR"

QD()      { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
Q()       { QD "$DB" "$1"; }
# ⚠️ `set local role` et sa requête partent dans le MÊME appel (une transaction) — ADR-012.
# Un refus rend « ERREUR|<code>|<indice> » (VERBOSITY verbose : le SQLSTATE et l'indice
# sont lus dans la sortie, jamais devinés).
ROLE_SQL() {   # $1 base, $2 préambule de rôle, $3 requête
  psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -tA -q -v VERBOSITY=verbose -c "$2 $3" 2>&1 \
    | python3 -c '
import re, sys
s = sys.stdin.read()
m = re.search(r"ERROR:\s+([0-9A-Z]{5}):", s)
if not m:
    sys.stdout.write(s.strip()); sys.exit(0)
h = re.search(r"HINT:\s+(.*)", s)
sys.stdout.write("ERREUR|" + m.group(1) + "|" + (h.group(1).strip() if h else ""))'
}
AUTHD()   { ROLE_SQL "$1" "set local role authenticated; set local request.jwt.claim.sub='$2';" "$3"; }
AUTH()    { AUTHD "$DB" "$1" "$2"; }
ANON()    { ROLE_SQL "$DB" "set local role anon;" "$1"; }
SERVICE() { ROLE_SQL "$DB" "set local role service_role;" "$1"; }
# Applique un fichier à une base : rend le tableau de verdict, une ligne « contrôle§valeur ».
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -tA -F '§' -q -v ON_ERROR_STOP=1 -f "$2" 2>&1; }
compte_verdict() { printf '%s/%s' "$(printf '%s\n' "$1" | grep -c '§OK$' || true)" "$(printf '%s\n' "$1" | grep -c '§ECHEC' || true)"; }
# La valeur d'UNE ligne du verdict, désignée par un fragment de son libellé.
ligne() { printf '%s\n' "$1" | grep -F -- "$2" | head -1 | awk -F'§' '{ v = $NF; sub(/ —.*/, "", v); print v }'; }
# Les numéros des lignes que le garde-fou nomme quand il refuse.
refusees() { printf '%s\n' "$1" | grep -oE 'Lignes en échec : [0-9,]+' | head -1 | sed 's/Lignes en échec : //'; }
# Le retour arrière de la migration (les lignes « --| »).
RETOUR_ARRIERE() { sed -n -e 's/^--| //p' -e 's/^--|$//p' "$MIGRATION"; }
# Le bloc ④ (décor), le tableau ⑤, le garde-fou ⑥ et le verdict, seuls.
VERDICT_SEUL() { awk '/^-- ── ④ LE COMPORTEMENT/{p=1} /^commit;$/{p=0} p' "$MIGRATION"; }
md5_fn() { QD "${2:-$DB}" "select coalesce((select md5(replace(prosrc, chr(13) || chr(10), chr(10))) from pg_proc where oid = to_regprocedure('$1')), 'absente');"; }
def_kind() { QD "${1:-$DB}" "select coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.comment_interactions'::regclass and conname = 'ci_kind_check'), 'absente');"; }
etat_garde() { QD "${1:-$DB}" "select (select count(*) from pg_trigger where tgname = 'trg_ci_epingle_garde') || '|' || (select count(*) from pg_proc where proname = 'ci_epingle_garde') || '|' || (select count(*) from pg_constraint where conname = 'ci_pin_payload_check');"; }

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qF -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu (fragment) : %s\n     obtenu : %s\n' "$1" "$2" "$(printf '%s' "$3" | tail -3)"; fi; }

KIND_PROD="CHECK ((kind = ANY (ARRAY['like'::text, 'reply'::text, 'emoji'::text, 'gif'::text])))"
KIND_APRES="CHECK ((kind = ANY (ARRAY['like'::text, 'reply'::text, 'emoji'::text, 'gif'::text, 'pin'::text])))"
INDICE="épingle : réservée au propriétaire du fil, sur un commentaire de ce fil"
REFUS="ERREUR|42501|$INDICE"

M=11111111-1111-4111-8111-111111111111    # publie P et P2 (publiques), organise E, écrit E3
V=22222222-2222-4222-8222-222222222222    # commente
N=33333333-3333-4333-8333-333333333333    # aucun lien ; publie PN, organise EN, crée les homonymes
M2=44444444-4444-4444-8444-444444444444   # compte PRIVÉ : publie Q
X=55555555-5555-4555-8555-555555555555    # compte EN SUPPRESSION : publie R
K=66666666-6666-4666-8666-666666666666    # organise E3, que M a écrite
P=xrv38bancp00001; P2=xrv38bancp00002; Q=xrv38bancq00002; R=xrv38bancr00003; PN=xrv38bancpn001
E=xrv38bance00001; E3=xrv38bance00003; EN=xrv38bancen001
C1=c_rv38banc0c1; C2=c_rv38banc0c2; C3=c_rv38banc0c3; C4=c_rv38banc0c4; CQ=c_rv38banc0cq; CR=c_rv38banc0cr; Z1=c_rv38banc0z1
EC=ec_rv38banc0e1; EC2=ec_rv38banc0e2; EK=ec_rv38banc0ek; HD=ec_rv38banc0hd; W1=c_rv38banc0w1

# ── ⓪ SOCLE : les tables, corps, déclencheurs et policies de PRODUCTION (canal ①, 2026-11-05) ──
cat > "$SQLDIR/socle.sql" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
-- Comme Supabase : toute fonction créée par postgres dans public est exécutable par les trois rôles
-- (et par PUBLIC, défaut de PostgreSQL).
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
-- auth.uid() de Supabase : le claim `sub`, posé seul ou dans le JSON des claims.
create function auth.uid() returns uuid language sql stable as $fn$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$fn$;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create function extensions.gen_random_bytes(integer) returns bytea language sql volatile as $fn$
  select substring(decode(md5(random()::text) || md5(random()::text), 'hex') from 1 for $1)
$fn$;

-- ── Tables : colonnes, défauts et contraintes de production ──
create table public.passions (id text primary key);
create table public.profiles (
  id text primary key, username text not null, emoji text default '✨', color text default '#8b5cf6',
  passion_id text constraint profiles_passion_fk references public.passions(id), bio text, created_at timestamp default now(),
  avatar_url text, cover_url text, passions jsonb default '[]'::jsonb, is_private boolean not null default false, rs_links jsonb);
create table public.follows (
  follower_id text not null, following_id text not null, created_at timestamptz not null default now(),
  status text not null default 'accepted' constraint follows_status_chk check (status = any (array['pending'::text, 'accepted'::text])),
  primary key (follower_id, following_id));
create table public.blocks (blocker_id text not null, blocked_id text not null, created_at timestamptz default now(), primary key (blocker_id, blocked_id));
create table public.comptes_en_suppression (user_id text, statut text);
create table public.posts (
  id text primary key, author_id text constraint posts_author_id_fkey references public.profiles(id),
  passion_id text constraint posts_passion_fk references public.passions(id), mood text, content text, media_url text,
  likes integer default 0, created_at timestamp default now(), shared_from_post_id text, shared_data text,
  is_reel boolean default false, overlays jsonb, vlog jsonb, event_id text);
create table public.post_comments (
  id text primary key, post_id text, author_id text constraint post_comments_author_id_fkey references public.profiles(id),
  content text, created_at timestamp default now());
create table public.events (
  id text primary key, author_id text, title text, passion_id text constraint events_passion_fk references public.passions(id),
  lat double precision, lng double precision, city text,
  description text, emoji text default '📍', max_attendees integer constraint events_max_attendees_min1 check ((max_attendees is null) or (max_attendees >= 1)),
  date_at timestamp, created_at timestamp default now(),
  venue text, address text, postal_code text, price double precision default 0 constraint events_price_positif check ((price is null) or (price >= (0)::double precision)),
  contact text, external_link text,
  event_type text default 'Autre', cover_url text, organizer_id text, end_at timestamp, status text not null default 'active',
  updated_at timestamp, co_organizers jsonb not null default '[]'::jsonb, series_id text, recurrence text not null default 'none', conv_id text);
create table public.event_comments (
  id text primary key, event_id text not null constraint event_comments_event_id_fkey references public.events(id) on delete cascade,
  author_id text not null, author_name text, text text, created_at timestamptz default now());
create table public.event_checkin_secrets (event_id text primary key references public.events(id) on delete cascade, secret text, created_at timestamptz default now());
create table public.comment_interactions (
  id text primary key, comment_id text not null, post_id text, user_id text not null, kind text not null, payload text,
  created_at timestamptz not null default now(),
  constraint ci_ids_len_check check ((char_length(id) <= 120) and (char_length(comment_id) <= 120) and ((post_id is null) or (char_length(post_id) <= 120)) and (char_length(user_id) <= 120)),
  constraint ci_kind_check check (kind = any (array['like'::text, 'reply'::text, 'emoji'::text, 'gif'::text])),
  constraint ci_payload_len_check check ((payload is null) or (char_length(payload) <= 500)));
create table public.notifications (
  id text primary key, user_id text, kind text, from_id text, ref_id text, content text,
  seen boolean default false, created_at timestamp default now(), origine text not null default 'client');
create index idx_ci_comment on public.comment_interactions using btree (comment_id);
create index idx_ci_post on public.comment_interactions using btree (post_id);
create index idx_ci_user_created on public.comment_interactions using btree (user_id, created_at);

-- ── Fonctions : corps de production (pg_get_functiondef, 2026-11-05 ; md5 contrôlés en ⓪) ──
create function public.suppression_de_mon_compte() returns boolean language sql stable security definer set search_path = '' as $fn$
  select case
    when auth.uid() is null then false          -- postgres, service_role, purge, restauration
    else exists (select 1 from public.comptes_en_suppression c
                  where c.user_id = (auth.uid())::text
                    and c.statut in ('en_cours', 'purgee', 'supprimee'))
  end
$fn$;
create function public.refuser_ecriture_compte_en_suppression() returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  col   text;
  val   text;
  ligne jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    val := ligne ->> col;
    if val is not null and exists (
         select 1 from public.comptes_en_suppression c
          where c.user_id = val and c.statut in ('en_cours', 'purgee', 'supprimee'))
    then
      raise exception 'new row violates row-level security policy for table "%"', tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $fn$;
create function public.rate_limit_insert() returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
DECLARE
  user_col    text := TG_ARGV[0];
  max_per_min int  := TG_ARGV[1]::int;
  uid         text;
  cnt         int;
BEGIN
  NEW.created_at := now();
  EXECUTE format('SELECT ($1).%I', user_col) INTO uid USING NEW;
  IF uid IS NULL THEN RETURN NEW; END IF;
  EXECUTE format(
    'SELECT count(*) FROM %I.%I WHERE %I = $1 AND created_at > now() - interval ''1 minute''',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, user_col
  ) INTO cnt USING uid;
  IF cnt >= max_per_min THEN
    RAISE EXCEPTION 'rate limit: max % insertions/minute sur %', max_per_min, TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $fn$;
revoke all on function public.rate_limit_insert() from public, anon, authenticated;
revoke all on function public.refuser_ecriture_compte_en_suppression() from public, anon, authenticated;
create function public.posts_freeze_author() returns trigger language plpgsql set search_path = '' as $fn$
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    NEW.author_id := OLD.author_id;
  END IF;
  RETURN NEW;
END;
$fn$;
create function public.identite_affichage_canonique() returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  proprietaire text;
  p            record;
begin
  -- Le propriétaire est `author_id` partout, sauf step_interactions (`user_id`).
  proprietaire := coalesce(to_jsonb(new) ->> 'author_id', to_jsonb(new) ->> 'user_id');
  if proprietaire is null then
    return new;                       -- rien à rattacher : on laisse la RLS trancher
  end if;

  select username, avatar_url, emoji into p from public.profiles where id = proprietaire;
  if not found then
    return new;                       -- pas de profil (compte incomplet) : on ne fabrique rien
  end if;

  -- Inconditionnel : ce que le client a proposé n'est jamais retenu.
  if to_jsonb(new) ? 'author_name'  then new.author_name  := p.username;   end if;
  if to_jsonb(new) ? 'author_photo' then new.author_photo := p.avatar_url; end if;
  if to_jsonb(new) ? 'author_emoji' then new.author_emoji := p.emoji;      end if;

  return new;
end;
$fn$;
create function public.checkin_secret_generer() returns text language plpgsql set search_path = '' as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  octets bytea := extensions.gen_random_bytes(6);
  out text := '';
  i integer;
begin
  for i in 0..5 loop
    out := out || substr(alphabet, (get_byte(octets, i) % length(alphabet)) + 1, 1);
  end loop;
  return out;
end
$fn$;
create function public.events_poser_secret_pointage() returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.event_checkin_secrets (event_id, secret)
    values (new.id, public.checkin_secret_generer())
    on conflict (event_id) do nothing;
  return new;
end
$fn$;
create function public.est_identifiant_exemple(_id text) returns boolean language sql immutable parallel safe set search_path = '' as $$
  -- Le contenu de DÉMONSTRATION que le client fabrique et qu'aucune table ne porte :
  -- `buildSeed()` (app-01) et `getSeedReelPostsWithComments()` (app-05). Publications
  -- p<n>, pm|pp|pv<n>, pn_<thème>_<n>, pac_<thème>, p_ev_<thème>, p_ev<n>_e<n> ;
  -- bobines reel_seed_<thème>_<n> ; activités e<n>. Liste FERMÉE et ancrée :
  -- tests/unit/identifiants-exemple.test.mjs la confronte à buildSeed() et aux
  -- générateurs du contenu réel. Un exemple nouveau qui n'y entre pas a ses
  -- commentaires lisibles par leur seul auteur — le test le dit avant la mise en ligne.
  select coalesce(_id ~ '^(p[0-9]+|p[mpv][0-9]+|pn_[a-z0-9]+_[0-9]+|pac_[a-z]+|p_ev_[a-z]+|p_ev[0-9]+_e[0-9]+|reel_seed_[a-z0-9_]+|e[0-9]+)$', false)
$$;
revoke all on function public.est_identifiant_exemple(text) from public, anon, authenticated;
create function public.abonne_accepte_non_bloque(_auteur text) returns boolean language sql stable security definer set search_path = '' as $fn$
  select case
    when auth.uid() is null or _auteur is null then false
    else exists (
      select 1 from public.follows f
      where f.follower_id = (auth.uid())::text
        and f.following_id = _auteur
        and f.status = 'accepted'
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = _auteur and b.blocked_id = (auth.uid())::text)
         or (b.blocker_id = (auth.uid())::text and b.blocked_id = _auteur)
    )
  end
$fn$;
create function public.post_is_visible(pid text) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when pid is null then false
    -- Pas de ligne posts : PUBLIC seulement pour un identifiant d'EXEMPLE (le contenu de
    -- démonstration du client n'est dans aucune table). Une publication SUPPRIMÉE, ou un
    -- identifiant inconnu, n'est visible par personne (R31, 2026-11-04 : rendait VRAI).
    when not exists (select 1 from posts where id = pid) then public.est_identifiant_exemple(pid)
    else exists (
      select 1 from posts p
      where p.id = pid and (
        p.author_id = (select auth.uid())::text
        or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
        or public.abonne_accepte_non_bloque(p.author_id)
      )
    )
  end
$$;
create function public.comment_target_visible(cid text) returns boolean language sql stable security definer set search_path = public as $$
  -- La CIBLE seule, pour une interaction sans fil (`post_id` nul : aucune ligne aujourd'hui,
  -- le client le pose toujours). Avec un fil, comment_target_visible(cid, pid) décide.
  select case
    when cid is null then false
    when exists (select 1 from posts where id = cid)
      then public.post_is_visible(cid)
    when exists (select 1 from post_comments where id = cid)
      then public.post_is_visible((select post_id from post_comments where id = cid limit 1))
    -- Un commentaire d'activité : public, comme `event_comments` (lecture : true).
    when exists (select 1 from event_comments where id = cid) then true
    -- Un exemple reste public ; une cible supprimée ou inconnue, personne (R31 : rendait VRAI).
    else public.est_identifiant_exemple(cid)
  end
$$;
create function public.comment_target_visible(cid text, pid text) returns boolean language sql stable security definer set search_path = public as $$
  -- Une interaction se lit comme son FIL : `post_id`, que le client pose toujours — la
  -- publication ou l'activité où elle a été écrite. Lui seul rattache une réaction à une
  -- RÉPONSE (`comment_id = srep_<date>`, une cible qu'aucune table ne porte).
  select case
    when pid is null then public.comment_target_visible(cid)
    when exists (select 1 from posts where id = pid) then public.post_is_visible(pid)
    -- Une activité : publique, comme `events` et `event_comments`.
    when exists (select 1 from events where id = pid) then true
    -- Un fil d'exemple reste public ; un fil supprimé ou inconnu n'est lisible par personne.
    else public.est_identifiant_exemple(pid)
  end
$$;
revoke all on function public.comment_target_visible(text, text) from public;

-- ── Déclencheurs de production ──
create trigger zz_barriere_suppression before insert or update on public.profiles for each row execute function public.refuser_ecriture_compte_en_suppression('id');
create trigger trg_posts_freeze_author before update on public.posts for each row execute function public.posts_freeze_author();
create trigger trg_rate_limit before insert on public.posts for each row execute function public.rate_limit_insert('author_id', '10');
create trigger zz_barriere_suppression before insert or update on public.posts for each row execute function public.refuser_ecriture_compte_en_suppression('author_id');
create trigger trg_rate_limit before insert on public.post_comments for each row execute function public.rate_limit_insert('author_id', '30');
create trigger zz_barriere_suppression before insert or update on public.post_comments for each row execute function public.refuser_ecriture_compte_en_suppression('author_id');
create trigger trg_events_secret_pointage after insert on public.events for each row execute function public.events_poser_secret_pointage();
create trigger trg_rate_limit before insert on public.events for each row execute function public.rate_limit_insert('author_id', '15');
create trigger zz_barriere_suppression before insert or update on public.events for each row execute function public.refuser_ecriture_compte_en_suppression('author_id');
create trigger trg_identite_affichage before insert or update on public.event_comments for each row execute function public.identite_affichage_canonique();
create trigger trg_rate_limit before insert on public.event_comments for each row execute function public.rate_limit_insert('author_id', '30');
create trigger zz_barriere_suppression before insert or update on public.event_comments for each row execute function public.refuser_ecriture_compte_en_suppression('author_id');
create trigger trg_rate_limit before insert on public.comment_interactions for each row execute function public.rate_limit_insert('user_id', '60');
create trigger zz_barriere_suppression before insert or update on public.comment_interactions for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');

-- ── RLS, droits et policies de production (comment_interactions : à l'octet, md5 contrôlés en ⓪) ──
alter table public.comment_interactions enable row level security;
grant select on all tables in schema public to anon, authenticated;
grant select, insert, update, delete on public.comment_interactions to anon, authenticated;
grant all on all tables in schema public to service_role;
create policy "Lecture selon visibilite de la cible" on public.comment_interactions for select
  using (((user_id = (( select auth.uid() as uid))::text) or public.comment_target_visible(comment_id, post_id)));
create policy ci_delete on public.comment_interactions for delete using ((user_id = (( select auth.uid() as uid))::text));
create policy ci_insert on public.comment_interactions for insert
  with check (((user_id = (( select auth.uid() as uid))::text) and (not public.suppression_de_mon_compte())));
-- ── RV-38, red team du 06/11 : ce que la production porte sur les quatre tables du décor
-- (publications, commentaires, activités, commentaires d'activité) — sans eux, le banc ne voyait
-- ni un homonyme créé par un client, ni un commentaire renommé, ni une purge. Corps à l'octet
-- (pg_get_functiondef, 2026-11-06 ; md5 contrôlés en ⓪), policies et déclencheurs comparés en ⓪. ──
create table public.post_likes (post_id text, user_id text);
create table public.post_collaborators (post_id text, user_id text);
create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path to '' as $function$
  SELECT CASE
    WHEN auth.uid() IS NULL
      OR _other IS NULL
      OR _other = (auth.uid())::text
      THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.blocks b
       WHERE (b.blocker_id = (auth.uid())::text AND b.blocked_id = _other)
          OR (b.blocker_id = _other AND b.blocked_id = (auth.uid())::text)
    )
  END
$function$;
create function public.post_auteur_bloque(_post_id text) returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select exists (select 1 from public.posts p
                 where p.id = _post_id and public.is_blocked_with(p.author_id));
$function$;
create function public.event_auteur_bloque(_event_id text) returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select exists (select 1 from public.events e
                 where e.id = _event_id and public.is_blocked_with(e.author_id));
$function$;
create function public.can_edit_post(pid text) returns boolean language sql stable security definer set search_path to 'public' as $function$
  SELECT EXISTS (SELECT 1 FROM posts p WHERE p.id = pid AND p.author_id = auth.uid()::text)
      OR EXISTS (SELECT 1 FROM post_collaborators c WHERE c.post_id = pid AND c.user_id = auth.uid()::text);
$function$;
-- Deux BOUCHONS, les seuls corps qui ne sont pas ceux de la production — aucun ne touche à
-- l'épingle : adult_access_allowed (la production lit la majorité déclarée ; ici tout compte est
-- majeur) et post_masque (la production compte les signalements ; ici rien n'est masqué).
create function public.adult_access_allowed() returns boolean language sql stable security definer set search_path to '' as $function$ select auth.uid() is not null $function$;
create function public.post_masque(p_id text) returns boolean language sql stable as $function$ select false $function$;
create function public.events_admission_gardee() returns trigger language plpgsql security definer set search_path to '' as $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF NEW.author_id IS DISTINCT FROM OLD.author_id
     AND OLD.author_id IS DISTINCT FROM (auth.uid())::text THEN
    RAISE EXCEPTION 'author_id ne peut etre reassigne que par l''auteur courant'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.adult_access_allowed() THEN RETURN NEW; END IF;

  IF NEW.status = 'cancelled' AND OLD.author_id = (auth.uid())::text THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'modification d''un evenement refusee : admission requise'
    USING ERRCODE = 'check_violation';
END
$function$;
create function public.identifiants_figes() returns trigger language plpgsql set search_path to '' as $function$
declare col text; avant text; apres text;
begin
  foreach col in array TG_ARGV loop
    execute format('select ($1).%I::text, ($2).%I::text', col, col) into avant, apres using old, new;
    if avant is distinct from apres then
      raise exception '% : la colonne % ne se modifie pas', TG_TABLE_NAME, col using errcode = '42501';
    end if;
  end loop;
  return new;
end $function$;
create function public.purger_cibles_commentaires() returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  -- Les réponses et réactions des commentaires supprimés, de QUI qu'elles soient
  -- (la RLS ne laissait au client effacer que les siennes).
  -- ⚠️ L'identifiant est CHOISI par le client. Un commentaire posé sous le nom d'une
  -- publication, d'un commentaire d'activité, d'un exemple ou d'une réponse ne vise pas
  -- ces réactions-là, et une interaction n'appartient qu'à son FIL. Dans un fil d'exemple,
  -- seul un commentaire au format du client (`c_<uid>`) compte : `c1`, `cp1_1`… sont les
  -- commentaires de démonstration, qu'aucune table ne porte.
  delete from public.comment_interactions i
   using commentaires_supprimes s
   where i.comment_id = s.id
     and (i.post_id is null or i.post_id = s.post_id)
     and s.id !~ '^srep_'
     and not public.est_identifiant_exemple(s.id)
     and (not public.est_identifiant_exemple(s.post_id) or s.id ~ '^c_[0-9a-z]{8,17}$')
     and not exists (select 1 from public.posts p where p.id = s.id)
     and not exists (select 1 from public.event_comments ec where ec.id = s.id);
  return null;
end
$function$;
create function public.purger_cibles_publications() returns trigger language plpgsql security definer set search_path to '' as $function$
declare
  ids text[];
begin
  -- ⚠️ L'identifiant est CHOISI par le client, et cette fonction efface pour tout le monde.
  -- Une publication créée sous l'identifiant d'une ACTIVITÉ ou d'un EXEMPLE n'est pas le
  -- fil de ce qui s'y écrit : la supprimer n'emporte rien.
  select coalesce(array_agg(s.id), '{}') into ids
    from publications_supprimees s
   where not public.est_identifiant_exemple(s.id)
     and not exists (select 1 from public.events e where e.id = s.id);
  if cardinality(ids) = 0 then return null; end if;
  -- Les commentaires des publications supprimées ; leur propre déclencheur
  -- (`trg_purger_cibles_commentaire`) emporte leurs réponses et réactions.
  delete from public.post_comments c where c.post_id = any (ids);
  delete from public.post_likes l where l.post_id = any (ids);
  delete from public.post_collaborators k where k.post_id = any (ids);
  -- Les interactions dont la publication est le FIL (réactions, réponses, réactions aux
  -- réponses). La CIBLE seule ne vaut que SANS fil, et sans commentaire du même nom : une
  -- ligne qui a un fil appartient à ce fil.
  delete from public.comment_interactions i
   where i.post_id = any (ids)
      or (i.post_id is null and i.comment_id = any (ids)
          and not exists (select 1 from public.post_comments c where c.id = i.comment_id)
          and not exists (select 1 from public.event_comments ec where ec.id = i.comment_id));
  return null;
end
$function$;
create trigger trg_events_admission before update on public.events for each row execute function public.events_admission_gardee();
create trigger trg_identifiants_figes before update on public.post_comments for each row execute function public.identifiants_figes('post_id', 'author_id');
create trigger trg_purger_cibles_commentaire after delete on public.post_comments referencing old table as commentaires_supprimes for each statement execute function public.purger_cibles_commentaires();
create trigger trg_purger_cibles_publication after delete on public.posts referencing old table as publications_supprimees for each statement execute function public.purger_cibles_publications();
-- RLS, droits et policies de production des quatre tables (comparées en ⓪).
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.events enable row level security;
alter table public.event_comments enable row level security;
grant select, insert, update, delete on public.posts, public.post_comments, public.events, public.event_comments to authenticated;
create policy "Ecriture propre" on public.posts for insert with check (((author_id = (( select auth.uid() as uid))::text) and (not public.suppression_de_mon_compte())));
create policy "Suppression propre" on public.posts for delete using ((author_id = (( select auth.uid() as uid))::text));
create policy "Lecture respectant les comptes prives" on public.posts for select using (((author_id = (( select auth.uid() as uid))::text) or (not (exists ( select 1 from public.profiles pr where ((pr.id = posts.author_id) and (pr.is_private = true))))) or public.abonne_accepte_non_bloque(author_id)));
create policy "Masquage apres signalements" on public.posts as restrictive for select using (((author_id = (( select auth.uid() as uid))::text) or (not public.post_masque(id))));
create policy "Update propre" on public.posts for update to authenticated using (public.can_edit_post(id)) with check ((public.can_edit_post(id) and (not public.suppression_de_mon_compte())));
create policy "Ecriture propre" on public.post_comments for insert to authenticated with check (((author_id = (( select auth.uid() as uid))::text) and (not public.post_auteur_bloque(post_id)) and (not public.suppression_de_mon_compte())));
create policy "Suppression propre" on public.post_comments for delete using ((author_id = (( select auth.uid() as uid))::text));
create policy "Lecture selon visibilite du post" on public.post_comments for select using (((author_id = (( select auth.uid() as uid))::text) or public.post_is_visible(post_id)));
create policy "Update propre" on public.post_comments for update to authenticated using ((author_id = (( select auth.uid() as uid))::text)) with check (((author_id = (( select auth.uid() as uid))::text) and (not public.post_auteur_bloque(post_id)) and (not public.suppression_de_mon_compte())));
create policy events_insert_author_adult on public.events for insert to authenticated with check (((author_id = (( select auth.uid() as uid))::text) and public.adult_access_allowed() and (not public.suppression_de_mon_compte())));
create policy "Suppression propre" on public.events for delete using ((author_id = (( select auth.uid() as uid))::text));
create policy "Lecture publique" on public.events for select using (true);
create policy "Update organisateurs" on public.events for update using (((author_id = (( select auth.uid() as uid))::text) or jsonb_exists(co_organizers, (( select auth.uid() as uid))::text))) with check ((((author_id = (( select auth.uid() as uid))::text) or jsonb_exists(co_organizers, (( select auth.uid() as uid))::text)) and (not public.suppression_de_mon_compte())));
create policy event_comments_insert_own on public.event_comments for insert to authenticated with check (((author_id = (( select auth.uid() as uid))::text) and (not public.event_auteur_bloque(event_id)) and (not public.suppression_de_mon_compte())));
create policy event_comments_delete_own on public.event_comments for delete using ((author_id = (( select auth.uid() as uid))::text));
create policy event_comments_select on public.event_comments for select using (true);
SQL
chmod 644 "$SQLDIR/socle.sql"
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database socle" >/dev/null
psql -h "$BASE" -p "$PORT" -U postgres -d socle -q -v ON_ERROR_STOP=1 -f "$SQLDIR/socle.sql" >/dev/null

echo "── ⓪ LE SOCLE EST LA PRODUCTION (canal ①, 05/11 et 06/11) ─────────────"
emp() { QD socle "select md5(replace(prosrc, chr(13) || chr(10), chr(10))) from pg_proc where oid = to_regprocedure('$1');"; }
verifier "corps de production à l'octet : rate_limit_insert, la barrière, suppression_de_mon_compte" \
  "fb1b26118dee1c38bfd66c9c106809e2|8ea40f715280c2867524dab576ab32b8|60aa519cc72bc4ebfd95d7f7bea17553" \
  "$(emp 'public.rate_limit_insert()')|$(emp 'public.refuser_ecriture_compte_en_suppression()')|$(emp 'public.suppression_de_mon_compte()')"
verifier "…identite_affichage_canonique, checkin_secret_generer, events_poser_secret_pointage" \
  "13239f6c0c46cb67b1381cffe19a4c37|334e46a30069bbe140f184ed94481fd8|f92df45d3adca676b1c197a7ff8b7381" \
  "$(emp 'public.identite_affichage_canonique()')|$(emp 'public.checkin_secret_generer()')|$(emp 'public.events_poser_secret_pointage()')"
verifier "…la visibilité (après R31) : est_identifiant_exemple, abonne_accepte_non_bloque, post_is_visible, comment_target_visible ×2" \
  "816ad5cd6f34ad3bf22ddd21e4ac1889|cba7d22730f9a4192c321e11b306a586|5bfa68f2bcb6705d1481584c71eb375f|f8af90b8f1764d68230301b3544dc988|e28dab528fd25c573fa6b5d40a90f1f8" \
  "$(emp 'public.est_identifiant_exemple(text)')|$(emp 'public.abonne_accepte_non_bloque(text)')|$(emp 'public.post_is_visible(text)')|$(emp 'public.comment_target_visible(text)')|$(emp 'public.comment_target_visible(text,text)')"
verifier "policies de comment_interactions à l'octet (md5 de pg_get_expr) : lecture, ci_delete, ci_insert" \
  "4fc9fe8f0e32c9976de108f1d26a630d|100a0f66aba7ecd4089717fbbdb9fefd|72198d79670eccc66056b9a609ee688f" \
  "$(QD socle "select string_agg(md5(coalesce(pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid))), '|' order by polname) from pg_policy where polrelid = 'public.comment_interactions'::regclass;")"
verifier "ci_kind_check de production, au caractère près" "$KIND_PROD" "$(def_kind socle)"

verifier "…les quatre tables du décor (red team du 06/11) : events_admission_gardee, identifiants_figes, purger_cibles_commentaires, purger_cibles_publications" \
  "73b02a7b87ffe04e93aa2a8583576a5b|283686cca23a670e2a00145a50561ce7|6f7780f8f8ef2badf6211b980691609a|60fbc30e1f645f95c1640e9d0e030dfe" \
  "$(emp 'public.events_admission_gardee()')|$(emp 'public.identifiants_figes()')|$(emp 'public.purger_cibles_commentaires()')|$(emp 'public.purger_cibles_publications()')"
verifier "…is_blocked_with, post_auteur_bloque, event_auteur_bloque, can_edit_post" \
  "25b7ca8e81031951cb241316f7cfdd64|fabfaa9d2e24f8eb0da7e11139232f6d|620a094a9c3541e21b86e34d65db4696|50b76c114b4dfd9cb16cff7deb11fe28" \
  "$(emp 'public.is_blocked_with(text)')|$(emp 'public.post_auteur_bloque(text)')|$(emp 'public.event_auteur_bloque(text)')|$(emp 'public.can_edit_post(text)')"
pol() { QD socle "select md5(string_agg(pol.polname || '|' || pol.polcmd::text || '|' || pol.polpermissive::text || '|' || coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || '|' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''), E'\n' order by pol.polname)) from pg_policy pol where pol.polrelid = 'public.$1'::regclass;"; }
verifier "…leurs policies, à l'octet (nom, commande, permissive, USING, WITH CHECK) : posts, post_comments, events, event_comments" \
  "1c333ccf5796ad628563b4a7cb5f8afa|4157d77e76ff29f042c4ce5ab6f17550|040f882b82335c842a3834bbf788b437|e96f2289f68b5a980e0b1853b442b9f6" \
  "$(pol posts)|$(pol post_comments)|$(pol events)|$(pol event_comments)"
dec() { QD socle "select string_agg(t.tgname, ',' order by t.tgname) from pg_trigger t where not t.tgisinternal and t.tgrelid = 'public.$1'::regclass;"; }
verifier "…et leurs déclencheurs, ceux de la production : posts, post_comments, events, event_comments, comment_interactions" \
  "trg_posts_freeze_author,trg_purger_cibles_publication,trg_rate_limit,zz_barriere_suppression|trg_identifiants_figes,trg_purger_cibles_commentaire,trg_rate_limit,zz_barriere_suppression|trg_events_admission,trg_events_secret_pointage,trg_rate_limit,zz_barriere_suppression|trg_identite_affichage,trg_rate_limit,zz_barriere_suppression|trg_rate_limit,zz_barriere_suppression" \
  "$(dec posts)|$(dec post_comments)|$(dec events)|$(dec event_comments)|$(dec comment_interactions)"

# Le décor des essais hors verdict (④) : tout s'écrit sans session, comme en production l'administration.
DECOR="insert into public.profiles (id, username, is_private) values ('$M', 'banc_m', false), ('$V', 'banc_v', false), ('$N', 'banc_n', false), ('$M2', 'banc_m2', true), ('$X', 'banc_x', false), ('$K', 'banc_k', false);
  insert into public.posts (id, author_id, content) values ('$P', '$M', 'P'), ('$P2', '$M', 'P2'), ('$Q', '$M2', 'Q privée'), ('$R', '$X', 'R'), ('$PN', '$N', 'PN');
  insert into public.post_comments (id, post_id, author_id, content) values ('$C1', '$P', '$V', 'C1'), ('$C2', '$P', '$V', 'C2'), ('$C3', '$P2', '$V', 'C3'), ('$CQ', '$Q', '$M2', 'CQ'), ('$CR', '$R', '$V', 'CR'), ('$Z1', '$PN', '$N', 'Z1');
  insert into public.events (id, author_id, organizer_id, title) values ('$E', '$M', '$M', 'E'), ('$E3', '$M', '$K', 'E3, organisée par K'), ('$EN', '$N', '$N', 'EN');
  insert into public.event_comments (id, event_id, author_id, text) values ('$EC', '$E', '$V', 'EC'), ('$EC2', '$E', '$V', 'EC2'), ('$EK', '$E3', '$V', 'EK');"
QD socle "$DECOR" >/dev/null
# L'état de production, décor compris : le modèle de toutes les bases qui suivent.
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB template socle" >/dev/null

ins() {   # $1 id, $2 comment_id, $3 post_id (ou NULL), $4 user_id, $5 kind, $6 payload (ou NULL)
  local pid="'$3'"; [ "$3" = "NULL" ] && pid=NULL
  local charge="'$6'"; [ "$6" = "NULL" ] && charge=NULL
  printf "insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values ('%s', '%s', %s, '%s', '%s', %s);" "$1" "$2" "$pid" "$4" "$5" "$charge"
}
compte_pins() {   # $1 role (AUTH:<uid> | ANON), $2 clause
  case "$1" in
    ANON) ANON "select count(*) from public.comment_interactions where kind = 'pin' and $2;" ;;
    *)    AUTH "${1#AUTH:}" "select count(*) from public.comment_interactions where kind = 'pin' and $2;" ;;
  esac
}

echo "── ① AVANT : l'épingle n'atteint jamais la base ─────────────────────────"
verifier "LE DÉFAUT : M, auteur de P, épingle le commentaire C1 de son fil → 23514 (ci_kind_check)" "ERREUR|23514|" \
  "$(AUTH "$M" "$(ins ci_av_1 "$C1" "$P" "$M" pin 1)")"
verifier "…un « j'aime » passe (le canal lui-même fonctionne)" "" "$(AUTH "$V" "$(ins ci_av_2 "$C1" "$P" "$V" like NULL)")"
echo "  — la correction NAÏVE (« pin » ajouté à la contrainte, rien d'autre) ouvre une porte"
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database naive template $DB" >/dev/null
QD naive "alter table public.comment_interactions drop constraint ci_kind_check, add constraint ci_kind_check check (kind = any (array['like'::text, 'reply'::text, 'emoji'::text, 'gif'::text, 'pin'::text]));" >/dev/null
verifier "naïve : N, sans aucun lien, épingle le commentaire C1 de la publication de M — ACCEPTÉ" "" \
  "$(AUTHD naive "$N" "$(ins ci_nv_1 "$C1" "$P" "$N" pin 1)")"
verifier "…et un visiteur le lit (la policy SELECT suit le fil) : l'épingle forgée s'afficherait chez tous" "1" \
  "$(ROLE_SQL naive "set local role anon;" "select count(*) from public.comment_interactions where id = 'ci_nv_1';")"
verifier "naïve : une charge quelconque passe aussi (« oui », vide)" "|" \
  "$(AUTHD naive "$M" "$(ins ci_nv_2 "$C1" "$P" "$M" pin oui)")|$(AUTHD naive "$M" "$(ins ci_nv_3 "$C1" "$P" "$M" pin NULL)")"

echo "── ② LE VERDICT RÉINJECTÉ SUR L'ÉTAT DE PRODUCTION ROUGIT ───────────────"
# Le décor et le tableau seuls (sans le garde-fou) : quelles lignes rougissent, et pourquoi.
{ echo "begin;"
  VERDICT_SEUL | awk '/^-- ── ⑥ FERMÉ SUR ÉCHEC/{s=1} /^-- ── Verdict ──/{s=0} !s'
  echo "rollback;"; } > "$SQLDIR/reinjecte.sql"; chmod 644 "$SQLDIR/reinjecte.sql"
s_r="$(APPLIQUER "$DB" "$SQLDIR/reinjecte.sql" || true)"
verifier "réinjecté : la mesure s'exécute (décor posé, rôles relevés)" "OK" "$(ligne "$s_r" "RV-38 · mesure exécutée")"
verifier "réinjecté : le propriétaire et l'organisateur n'épinglent pas (23514) — « propriétaire d'une publication », « organisateur » ROUGISSENT" "ECHEC|ECHEC" \
  "$(ligne "$s_r" "le propriétaire d'une publication épingle")|$(ligne "$s_r" "l'organisateur d'une activité épingle")"
verifier "réinjecté : rien ne juge le propriétaire (les refus sont des 23514, pas des 42501) — « qui n'est pas le propriétaire », « un refus ne dit pas pourquoi » ROUGISSENT" "ECHEC|ECHEC" \
  "$(ligne "$s_r" "qui n'est pas le propriétaire est REFUSÉ")|$(ligne "$s_r" "un refus ne dit pas pourquoi")"
verifier "réinjecté : le partage, la contrainte, la garde ROUGISSENT ; les autres genres restent verts" "ECHEC|ECHEC|ECHEC|ECHEC|OK" \
  "$(ligne "$s_r" "l'épingle est PARTAGÉE")|$(ligne "$s_r" "ci_kind_check :")|$(ligne "$s_r" "trg_ci_epingle_garde :")|$(ligne "$s_r" "ci_epingle_garde() :")|$(ligne "$s_r" "les autres genres sont INCHANGÉS")"
{ echo "begin;"; VERDICT_SEUL; echo "rollback;"; } > "$SQLDIR/reinjecte_ferme.sql"; chmod 644 "$SQLDIR/reinjecte_ferme.sql"
s_f="$(APPLIQUER "$DB" "$SQLDIR/reinjecte_ferme.sql" || true)"
contient "réinjecté AVEC le garde-fou : il REFUSE (55000) et nomme les lignes" "RV-38 : la base n'est pas celle que ce correctif suppose" "$s_f"
# 7 reste verte sur la production : la RLS refuse déjà une écriture au nom d'autrui ou sans
# identité. 1, 15 et 17 aussi : la mesure s'exécute, les autres genres passent, rien ne reste.
verifier "…les lignes nommées : tout ce qui suppose la garde et la contrainte" "2,3,4,5,6,8,9,10,11,12,13,14,16,18,19,20,21" "$(refusees "$s_f")"
verifier "réinjecté : rien n'a changé (ci_kind_check de production, pas de garde)" "$KIND_PROD|0|0|0" "$(def_kind)|$(etat_garde)"

echo "── ③ APPLICATION, VERDICT, REJEU ────────────────────────────────────────"
sortie="$(APPLIQUER "$DB" "$MIGRATION")" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -8; exit 1; }
printf '%s\n' "$sortie" | sed 's/^/     │ /'
verifier "le verdict rend 21 OK et 0 ECHEC" "21/0" "$(compte_verdict "$sortie")"
verifier "information : aucune épingle en base au moment de l'application" "0" "$(ligne "$sortie" "information — épingles en base")"
verifier "ci_kind_check admet pin, ci_pin_payload_check et la garde existent" "$KIND_APRES|1|1|1" "$(def_kind)|$(etat_garde)"
verifier "la garde : SECURITY DEFINER, search_path vide, aucun EXECUTE client" "t|search_path=\"\"|f|f" \
  "$(Q "select prosecdef from pg_proc where proname = 'ci_epingle_garde';")|$(Q "select array_to_string(proconfig, ';') from pg_proc where proname = 'ci_epingle_garde';")|$(Q "select has_function_privilege('anon', 'public.ci_epingle_garde()', 'EXECUTE');")|$(Q "select has_function_privilege('authenticated', 'public.ci_epingle_garde()', 'EXECUTE');")"
verifier "les policies de comment_interactions n'ont pas bougé (md5)" \
  "4fc9fe8f0e32c9976de108f1d26a630d|100a0f66aba7ecd4089717fbbdb9fefd|72198d79670eccc66056b9a609ee688f" \
  "$(Q "select string_agg(md5(coalesce(pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid))), '|' order by polname) from pg_policy where polrelid = 'public.comment_interactions'::regclass;")"
contient "la migration déclare son prérequis client (la ligne que lit scripts/appliquer-migration.mjs)" \
  "-- PREREQUIS-CLIENT: comment_interactions:epingle-du-fil" "$(grep -E '^-- PREREQUIS-CLIENT:' "$MIGRATION")"
sortie2="$(APPLIQUER "$DB" "$MIGRATION")" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -8; exit 1; }
verifier "rejeu : toujours 21 OK, 0 ECHEC, une seule garde" "21/0|$KIND_APRES|1|1|1" "$(compte_verdict "$sortie2")|$(def_kind)|$(etat_garde)"

echo "── ④ APRÈS : sous les rôles, hors verdict ───────────────────────────────"
verifier "M, auteur de P, épingle C1 ; retire ; repose (trois écritures)" "||" \
  "$(AUTH "$M" "$(ins ci_ap_01 "$C1" "$P" "$M" pin 1)")|$(AUTH "$M" "$(ins ci_ap_02 "$C1" "$P" "$M" pin 0)")|$(AUTH "$M" "$(ins ci_ap_03 "$C1" "$P" "$M" pin 1)")"
verifier "B voit l'épingle : V (commentateur), N (inconnu) et un visiteur lisent les trois lignes de M" "3|3|3" \
  "$(compte_pins "AUTH:$V" "post_id = '$P'")|$(compte_pins "AUTH:$N" "post_id = '$P'")|$(compte_pins ANON "post_id = '$P'")"
verifier "M organise E : il épingle EC" "" "$(AUTH "$M" "$(ins ci_ap_04 "$EC" "$E" "$M" pin 1)")"
verifier "E3, écrite par M et organisée par K : K épingle EK ; M, auteur sans être l'organisateur, est refusé" "|$REFUS" \
  "$(AUTH "$K" "$(ins ci_ap_05 "$EK" "$E3" "$K" pin 1)")|$(AUTH "$M" "$(ins ci_ap_06 "$EK" "$E3" "$M" pin 1)")"
verifier "V, auteur de C1, ne l'épingle pas ; N non plus ; V n'épingle pas dans E" "$REFUS|$REFUS|$REFUS" \
  "$(AUTH "$V" "$(ins ci_ap_07 "$C1" "$P" "$V" pin 1)")|$(AUTH "$N" "$(ins ci_ap_08 "$C1" "$P" "$N" pin 1)")|$(AUTH "$V" "$(ins ci_ap_09 "$EC" "$E" "$V" pin 1)")"
verifier "M hors de son fil : C1 annoncé dans E, une réponse srep_, un fil d'exemple, sans fil" "$REFUS|$REFUS|$REFUS|$REFUS" \
  "$(AUTH "$M" "$(ins ci_ap_10 "$C1" "$E" "$M" pin 1)")|$(AUTH "$M" "$(ins ci_ap_11 srep_2026-11-05T09:00:00.000Z "$P" "$M" pin 1)")|$(AUTH "$M" "$(ins ci_ap_12 c1 p1 "$M" pin 1)")|$(AUTH "$M" "$(ins ci_ap_13 "$C1" NULL "$M" pin 1)")"
verifier "au nom d'un autre (M pour V), sans identité (visiteur)" "$REFUS|$REFUS" \
  "$(AUTH "$M" "$(ins ci_ap_14 "$C1" "$P" "$V" pin 1)")|$(ANON "$(ins ci_ap_15 "$C1" "$P" "$M" pin 1)")"
verifier "un jeton authentifié SANS compte (sub vide) est refusé au même mot" "$REFUS" \
  "$(ROLE_SQL "$DB" "set local role authenticated; set local request.jwt.claim.sub='';" "$(ins ci_ap_16 "$C1" "$P" "$M" pin 1)")"
verifier "la charge : « 2 », « true », rien → le MÊME refus que tout le reste (la garde juge la charge avant la contrainte : aucun 23514 qui dirait le reste admis)" "$REFUS|$REFUS|$REFUS" \
  "$(AUTH "$M" "$(ins ci_ap_17 "$C1" "$P" "$M" pin 2)")|$(AUTH "$M" "$(ins ci_ap_18 "$C1" "$P" "$M" pin true)")|$(AUTH "$M" "$(ins ci_ap_19 "$C1" "$P" "$M" pin NULL)")"
verifier "…et N, qui sonde un commentaire d'un fil PRIVÉ par une charge invalide, reçoit ce même refus" "$REFUS" \
  "$(AUTH "$N" "$(ins ci_ap_20 "$CQ" "$Q" "$N" pin 2)")"
verifier "M2 (compte privé) épingle CQ : N et un visiteur ne le lisent pas, M2 si" "|0|0|1" \
  "$(AUTH "$M2" "$(ins ci_ap_21 "$CQ" "$Q" "$M2" pin 1)")|$(compte_pins "AUTH:$N" "post_id = '$Q'")|$(compte_pins ANON "post_id = '$Q'")|$(compte_pins "AUTH:$M2" "post_id = '$Q'")"
verifier "les autres genres : N aime C1, répond, réagit à P, poste un GIF — la garde ne les voit pas" "|||" \
  "$(AUTH "$N" "$(ins ci_ap_22 "$C1" "$P" "$N" like NULL)")|$(AUTH "$N" "$(ins ci_ap_23 "$C1" "$P" "$N" reply 'une réponse')")|$(AUTH "$N" "$(ins ci_ap_24 "$P" "$P" "$N" emoji '😍')")|$(AUTH "$N" "$(ins ci_ap_25 "$C1" "$P" "$N" gif 'https://media.passio.test/a.gif')")"

echo "  — homonymes CRÉÉS PAR UN CLIENT (la RLS de production les admet), les scénarios de la red team"
verifier "N publie sous l'identifiant de l'activité E de M, et y commente W1 : la RLS l'admet" "|" \
  "$(AUTH "$N" "insert into public.posts (id, author_id, content) values ('$E', '$N', 'publication homonyme de E');")|$(AUTH "$N" "insert into public.post_comments (id, post_id, author_id, content) values ('$W1', '$E', '$N', 'W1');")"
verifier "P2 de la red team : N épingle W1 « dans » E — REFUSÉ (fil homonyme) ; M non plus n'y épingle plus EC2" "$REFUS|$REFUS" \
  "$(AUTH "$N" "$(ins ci_ap_26 "$W1" "$E" "$N" pin 1)")|$(AUTH "$M" "$(ins ci_ap_27 "$EC2" "$E" "$M" pin 1)")"
verifier "…mais l'homonyme ne VERROUILLE pas l'épingle posée avant lui : M retire EC (« 0 ») ; N ne retire rien chez M" "|$REFUS" \
  "$(AUTH "$M" "$(ins ci_ap_28 "$EC" "$E" "$M" pin 0)")|$(AUTH "$N" "$(ins ci_ap_29 "$EC" "$E" "$N" pin 0)")"
verifier "dans l'autre sens : N crée une activité sous l'identifiant de P — M n'y épingle plus (« 1 »), il y retire (« 0 »)" "||$REFUS|" \
  "$(AUTH "$N" "insert into public.events (id, author_id, organizer_id, title) values ('$P', '$N', '$N', 'activité homonyme de P');")|$(AUTH "$N" "insert into public.event_comments (id, event_id, author_id, text) values ('$HD', '$P', '$N', 'HD');")|$(AUTH "$M" "$(ins ci_ap_30 "$C2" "$P" "$M" pin 1)")|$(AUTH "$M" "$(ins ci_ap_31 "$C1" "$P" "$M" pin 0)")"
verifier "…et N, organisateur de l'activité homonyme, n'y épingle pas HD" "$REFUS" "$(AUTH "$N" "$(ins ci_ap_32 "$HD" "$P" "$N" pin 1)")"
verifier "un COMMENTAIRE homonyme (N écrit dans EN un commentaire sous l'identifiant C3 de P2) ne change rien : M épingle C3 dans P2, N le sien dans EN, M retire" "||||" \
  "$(AUTH "$N" "insert into public.event_comments (id, event_id, author_id, text) values ('$C3', '$EN', '$N', 'homonyme de C3');")|$(AUTH "$M" "$(ins ci_ap_33 "$C3" "$P2" "$M" pin 1)")|$(AUTH "$N" "$(ins ci_ap_34 "$C3" "$EN" "$N" pin 1)")|$(AUTH "$M" "$(ins ci_ap_35 "$C3" "$P2" "$M" pin 0)")|"
verifier "…un lecteur BORNÉ AU FIL ne voit, dans P2, que les deux lignes de M ; l'ancien lecteur (par commentaire, de qui que ce soit) en voyait trois — d'où le PREREQUIS-CLIENT" "2|3" \
  "$(compte_pins ANON "post_id = '$P2' and user_id = '$M'")|$(compte_pins ANON "comment_id = '$C3'")"
verifier "B' de la red team : N épingle Z1 dans SA publication PN, puis RENOMME Z1 (identifiants_figes ne fige pas l'id) — la ligne reste dans PN, aucune dans le fil d'autrui" "||1|0" \
  "$(AUTH "$N" "$(ins ci_ap_36 "$Z1" "$PN" "$N" pin 1)")|$(AUTH "$N" "update public.post_comments set id = '${Z1}_renomme' where id = '$Z1';")|$(compte_pins ANON "post_id = '$PN' and comment_id = '$Z1'")|$(compte_pins ANON "post_id = '$P' and user_id = '$N'")"
echo "  — le reste du périmètre"
verifier "R31 : V commente C4 sous P2, M l'épingle (une ligne) ; V supprime C4 — son épingle part avec lui (purger_cibles_commentaires)" "||1||0" \
  "$(AUTH "$V" "insert into public.post_comments (id, post_id, author_id, content) values ('$C4', '$P2', '$V', 'C4');")|$(AUTH "$M" "$(ins ci_ap_37 "$C4" "$P2" "$M" pin 1)")|$(Q "select count(*) from public.comment_interactions where comment_id = '$C4' and post_id = '$P2' and kind = 'pin';")|$(AUTH "$V" "delete from public.post_comments where id = '$C4';")|$(Q "select count(*) from public.comment_interactions where comment_id = '$C4' and post_id = '$P2';")"
verifier "un compte EN SUPPRESSION, propriétaire de R, reste refusé (sa barrière, pas la garde)" "ERREUR|42501|" \
  "$(Q "insert into public.comptes_en_suppression (user_id, statut) values ('$X', 'en_cours');" >/dev/null; AUTH "$X" "$(ins ci_ap_38 "$CR" "$R" "$X" pin 1)")"
verifier "la clé de service n'est pas jugée (reprise, purge) ; la contrainte de charge, si" "|ERREUR|23514|" \
  "$(SERVICE "$(ins ci_ap_39 "$C1" "$P" "$N" pin 1)")|$(SERVICE "$(ins ci_ap_40 "$C1" "$P" "$M" pin 9)")"
verifier "un UPDATE client touche 0 ligne (aucune policy UPDATE)" "0" \
  "$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$M'; with u as (update public.comment_interactions set payload = '0' where id = 'ci_ap_03' returning 1) select count(*) from u;" 2>&1)"
Q "create policy banc_update_futur on public.comment_interactions for update using ((user_id = (( select auth.uid() as uid))::text)) with check ((user_id = (( select auth.uid() as uid))::text));" >/dev/null
verifier "une policy UPDATE FUTURE : N change son « j'aime » sur C1 en épingle → la garde le juge (refus)" "$REFUS" \
  "$(AUTH "$N" "update public.comment_interactions set kind = 'pin', payload = '1' where id = 'ci_ap_22';")"
verifier "…M retourne SON épingle d'EC (« 1 » → « 0 ») : admis, même dans le fil devenu homonyme" "" \
  "$(AUTH "$M" "update public.comment_interactions set payload = '0' where id = 'ci_ap_04';")"
Q "drop policy banc_update_futur on public.comment_interactions;" >/dev/null

echo "── ⑤ VERROU : une écriture qui tient comment_interactions fait échouer la migration en 5 s ──"
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database verrou template socle" >/dev/null
psql -h "$BASE" -p "$PORT" -U postgres -d verrou -q -c "begin; lock table public.comment_interactions in row exclusive mode; select pg_sleep(12); commit;" >/dev/null 2>&1 &
TENEUR=$!
tenu=0
for _ in $(seq 1 40); do
  [ "$(QD verrou "select count(*) from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'comment_interactions' and l.mode = 'RowExclusiveLock' and l.granted and l.pid <> pg_backend_pid();")" = "1" ] && { tenu=1; break; }
  sleep 0.25
done
verifier "un écrivain tient bien comment_interactions (RowExclusiveLock accordé) avant l'application" "1" "$tenu"
debut=$(date +%s)
s_v="$(APPLIQUER verrou "$MIGRATION" || true)"
duree=$(( $(date +%s) - debut ))
wait "$TENEUR" || true
contient "le verrou n'est pas venu : la migration échoue (lock_timeout)" "canceling statement due to lock timeout" "$s_v"
verifier "…en moins de 10 s, sans attendre la fin de l'écriture (12 s)" "1" "$([ "$duree" -lt 10 ] && echo 1 || echo "0 ($duree s)")"
verifier "…et rien n'est appliqué" "$KIND_PROD|0|0|0" "$(def_kind verrou)|$(etat_garde verrou)"

echo "── ⑥ RETOUR ARRIÈRE : l'état exact d'avant, puis la migration rejouée ──"
RETOUR_ARRIERE > "$SQLDIR/retour.sql"; chmod 644 "$SQLDIR/retour.sql"
verifier "le retour arrière est un bloc begin; … commit; (les lignes « --| » de l'en-tête)" "begin;|commit;" \
  "$(head -1 "$SQLDIR/retour.sql")|$(tail -1 "$SQLDIR/retour.sql")"
avant_retour="$(Q "select count(*) from public.comment_interactions where kind = 'pin';")"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$SQLDIR/retour.sql" >/dev/null
verifier "retour : ci_kind_check de production au caractère près ; garde, fonction et contrainte de charge retirées" "$KIND_PROD|0|0|0" "$(def_kind)|$(etat_garde)"
verifier "retour : les $avant_retour épingles écrites depuis sont effacées (la contrainte d'avant ne les admet pas) ; les autres genres restent" "0|3" \
  "$(Q "select count(*) from public.comment_interactions where kind = 'pin';")|$(Q "select count(*) from public.comment_interactions where id in ('ci_ap_23', 'ci_ap_24', 'ci_ap_25');")"
verifier "retour : l'ancien comportement revient (M ne peut plus épingler : 23514)" "ERREUR|23514|" "$(AUTH "$M" "$(ins ci_rt_1 "$C1" "$P2" "$M" pin 1)")"
sortie3="$(APPLIQUER "$DB" "$MIGRATION")" || { echo "  ❌ la migration rejouée après retour arrière a échoué"; echo "$sortie3" | tail -8; exit 1; }
verifier "la migration se rejoue après un retour arrière : 21 OK, 0 ECHEC" "21/0" "$(compte_verdict "$sortie3")"

echo "── ⑦ MUTATIONS : chaque correctif retiré fait REFUSER la migration, en nommant ses lignes ──"
muter() {   # $1 nom, $2 texte à remplacer (exactement une fois), $3 remplaçant ; rend la sortie de l'application
  python3 - "$MIGRATION" "$SQLDIR/m_$1.sql" "$2" "$3" <<'PY'
import sys
src, dst, avant, apres = sys.argv[1:5]
s = open(src, encoding="utf-8").read()
assert s.count(avant) == 1, "mutation introuvable ou ambiguë : " + avant
open(dst, "w", encoding="utf-8").write(s.replace(avant, apres))
PY
  chmod 644 "$SQLDIR/m_$1.sql"
  psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database m_$1 template socle" >/dev/null
  APPLIQUER "m_$1" "$SQLDIR/m_$1.sql" || true
}
# Chaque mutation : le garde-fou refuse en nommant EXACTEMENT ces lignes, et RIEN n'est appliqué.
mutation() {   # $1 nom, $2 libellé, $3 lignes attendues, $4 avant, $5 après
  local s; s="$(muter "$1" "$4" "$5")"
  verifier "$2 → refus, lignes $3" "$3|$KIND_PROD|0|0|0" "$(refusees "$s")|$(def_kind "m_$1")|$(etat_garde "m_$1")"
}
mutation sans_proprietaire "la garde sans le contrôle du PROPRIÉTAIRE (l'auteur du commentaire et un inconnu épinglent)" "4,5,9,11,21" \
  $'    if (proprio_pub is not distinct from moi or proprio_activite is not distinct from moi)\n' \
  $'    if (proprio_pub is not null or proprio_activite is not null)\n'
mutation sans_fil_homonyme "la garde qui admet un « 1 » dans un fil HOMONYME (le scénario P2 de la red team)" "8,11,21" \
  $'       and (new.payload = \'0\' or not (publication and activite)) then\n' \
  $'       then\n'
mutation sans_commentaire_du_fil "la garde sans le contrôle du COMMENTAIRE de ce fil (une réponse srep_, ou un commentaire d'ailleurs, s'épingle)" "6,11,13,21" \
  $'       where p.id = new.post_id\n         and exists (select 1 from public.post_comments c\n                      where c.id = new.comment_id and c.post_id = new.post_id);' \
  $'       where p.id = new.post_id;'
mutation organisateur_vide "l'organisateur sans nullif (un organizer_id vide ne désigne plus l'auteur, contrairement au client)" "4,11,21" \
  $'coalesce(nullif(e.organizer_id, \'\'), e.author_id)' \
  $'coalesce(e.organizer_id, e.author_id)'
mutation organisateur_auteur "le propriétaire d'une activité pris comme son AUTEUR (le client dit l'organisateur)" "4,21" \
  $'coalesce(nullif(e.organizer_id, \'\'), e.author_id)' \
  $'e.author_id'
mutation charge_par_contrainte "la charge laissée à la contrainte (un 23514 dirait alors que la garde a admis le reste)" "11,12,21" \
  $'     and new.payload is not null and new.payload in (\'0\', \'1\') then\n' \
  $'     then\n'
mutation juge_administration "la garde qui juge AUSSI l'administration (une reprise ou une purge refusée)" "11,16,21" \
  $'  if coalesce(pg_catalog.current_setting(\'role\', true), \'none\') not in (\'anon\', \'authenticated\') then\n    return new;\n  end if;\n' \
  ''
mutation sans_charge "sans ci_pin_payload_check (l'administration écrit « 2 »)" "13,16,19" \
  $',\n  drop constraint if exists ci_pin_payload_check,\n  add constraint ci_pin_payload_check check (kind <> \'pin\'::text or (payload is not null and payload = any (array[\'0\'::text, \'1\'::text])));' \
  ';'
mutation sans_when "la garde SANS sa clause WHEN (elle juge les « j'aime », réponses, emoji et GIF)" "11,15,20" \
  $'  for each row\n  when (new.kind = \'pin\')\n' \
  $'  for each row\n'
mutation invocateur "la garde en SECURITY INVOKER" "21" \
  $'returns trigger\nlanguage plpgsql\nsecurity definer\nset search_path to \'\'\nas $fn$\ndeclare\n  moi' \
  $'returns trigger\nlanguage plpgsql\nsecurity invoker\nset search_path to \'\'\nas $fn$\ndeclare\n  moi'
mutation execute_client "la garde laissée exécutable par authenticated" "21" \
  $'revoke all on function public.ci_epingle_garde() from public, anon, authenticated;\n' \
  $'revoke all on function public.ci_epingle_garde() from public, anon, authenticated;\ngrant execute on function public.ci_epingle_garde() to authenticated;\n'
mutation sans_pin "ci_kind_check SANS « pin » (le défaut d'origine, garde présente)" "2,3,4,9,10,13,14,16,18" \
  $'\'gif\'::text, \'pin\'::text])),\n' \
  $'\'gif\'::text])),\n'
mutation decor_garde "le décor non annulé (« aucune trace » n'est pas décorative)" "17" \
  "    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';" \
  "    null;"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
