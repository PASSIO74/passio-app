#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migration_publications_supprimees_2026-11-04.sql (R31, audit 2026-11-02)
#
# Sur un PostgreSQL JETABLE (utilisateur `pgbanc`), avec les tables, corps de
# fonctions, déclencheurs et policies de PRODUCTION lus au canal ① le
# 2026-11-04 comme point de départ :
#   ⓪ le socle porte les deux fonctions de production à l'octet (md5(prosrc))
#   ① AVANT (le défaut, ROUGE) : M (privé) publie P1 ; V, abonné accepté,
#      commente et aime ; M répond. Sans compte : 0 / 0 / 0 — sauf la réaction
#      de V à la RÉPONSE de M (`srep_…`), lisible sans rien supprimer. M
#      supprime P1 : sans compte, on lit le commentaire de V, son « j'aime », la
#      réponse de M. V supprime SON commentaire sur P2 : la réponse de M devient
#      publique. Le compte de M2 part (toutes ses publications, clé de service) :
#      ses commentaires, « j'aime » et réponses deviennent publics.
#   ② le verdict de la migration, réinjecté sur cet état de production, ROUGIT
#   ③ la migration s'applique (17 OK, 0 ECHEC), efface les orphelins RÉELS que ①
#      a laissés — et rien d'autre (exemples, ancien p_vlog_, live, carnet) —,
#      se rejoue (rien de plus à effacer) ; les policies des commentaires et des
#      « j'aime » ne bougent pas, ni les ACL des deux fonctions
#   ④ APRÈS (VERT) : le même scénario ne laisse rien lire ET rien en base ; un
#      commentaire supprimé emporte ses réponses ; la clé de service (purge de
#      compte) déclenche aussi ; les exemples restent lisibles sans compte, un
#      fil d'activité aussi ; l'ancien p_vlog_, un live, un carnet : leur seul
#      auteur
#   ⑤ PLAFOND : au-delà de 300 orphelins la migration REFUSE et rien n'est
#      appliqué ; le plafond posé juste après begin; la laisse passer
#   ⑥ VERROU : une écriture qui tient `posts` fait échouer la migration en 5 s
#      (lock_timeout), sans rien appliquer — au lieu d'arrêter l'application
#   ⑦ RETOUR ARRIÈRE : les deux fonctions reviennent à l'octet (md5 de
#      production), la policy, les ACL ; déclencheurs, fonctions et index
#      retirés ; l'ancien comportement revient ; puis la migration se rejoue
#   ⑧ MUTATIONS : chaque correctif retiré fait rougir la ligne du verdict qui le
#      garde (et pas les autres)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_publications_supprimees_2026-11-04.sql"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v python3 >/dev/null || { echo "❌ python3 introuvable (mutations du banc)"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 5820 + RANDOM % 120 ))
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

DB=r31
SQLDIR="$BASE/sql"; mkdir -p "$SQLDIR"; chmod 755 "$SQLDIR"

QD()      { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -tA -q -v ON_ERROR_STOP=1 -c "$2" 2>&1; }
Q()       { QD "$DB" "$1"; }
# ⚠️ `set local role` et sa requête partent dans le MÊME appel (une transaction) — ADR-012.
AUTH()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role anon; $1" 2>&1; }
SERVICE() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -c "set local role service_role; $1" 2>&1; }
# Applique un fichier à une base : rend le tableau de verdict, une ligne « contrôle§valeur ».
APPLIQUER() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -tA -F '§' -q -v ON_ERROR_STOP=1 -f "$2" 2>&1; }
compte_verdict() { printf '%s/%s' "$(printf '%s\n' "$1" | grep -c '§OK$' || true)" "$(printf '%s\n' "$1" | grep -c '§ECHEC' || true)"; }
# La valeur d'UNE ligne du verdict, désignée par un fragment de son libellé.
ligne() { printf '%s\n' "$1" | grep -F -- "$2" | head -1 | awk -F'§' '{ v = $NF; sub(/ —.*/, "", v); print v }'; }
# Le retour arrière de la migration (les lignes « --| »).
RETOUR_ARRIERE() { sed -n -e 's/^--| //p' -e 's/^--|$//p' "$MIGRATION"; }
# Le bloc ④ et le tableau de verdict, seuls (pour les réinjecter sur un autre état).
VERDICT_SEUL() { awk '/^-- ── ④ LE COMPORTEMENT/{p=1} /^commit;$/{p=0} p' "$MIGRATION"; }
MD5_PROD_POST_IS_VISIBLE=5ff0bf778b27a7ee4f817dcaecb238c1
MD5_PROD_COMMENT_TARGET=f02f0f69b94607d16e39c18851d058d8
md5_fn() { QD "${2:-$DB}" "select coalesce((select md5(prosrc) from pg_proc where oid = to_regprocedure('$1')), 'absente');"; }
acl_fns() { QD "${1:-$DB}" "select string_agg(proacl::text, ' ' order by oid) from pg_proc where oid in (to_regprocedure('public.post_is_visible(text)'), to_regprocedure('public.comment_target_visible(text)'));"; }
qual_policy() { QD "${3:-$DB}" "select qual from pg_policies where schemaname = 'public' and tablename = '$1' and policyname = '$2';"; }

ok=0; ko=0
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$3"; fi; }
contient() { if printf '%s' "$3" | grep -qF -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu (fragment) : %s\n     obtenu : %s\n' "$1" "$2" "$(printf '%s' "$3" | tail -3)"; fi; }

M=11111111-1111-4111-8111-111111111111    # compte PRIVÉ : publie P1, P2, puis P6, P7
V=22222222-2222-4222-8222-222222222222    # abonné ACCEPTÉ de M, M2, M3 : commente, aime
N=33333333-3333-4333-8333-333333333333    # aucun lien
M2=44444444-4444-4444-8444-444444444444   # compte PRIVÉ dont le COMPTE part (①)
W=55555555-5555-4555-8555-555555555555    # organise deux activités
M3=66666666-6666-4666-8666-666666666666   # compte PRIVÉ dont le COMPTE part (④)
P1=xr31bancp1000001; P2=xr31bancp2000002; P3=xr31bancp3000003
P4=reel_xr31bancp4000004; P5=post_1730000000000_r31banc05
P6=xr31bancp6000006; P7=xr31bancp7000007; P8=xr31bancp8000008; P9=reel_xr31bancp9000009
EV1=xr31bancev00001; EV2=xr31bancev00002

# ── ⓪ SOCLE : les tables, corps, déclencheurs et policies de PRODUCTION (canal ①, 2026-11-04) ──
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
-- pgcrypto n'est pas exigé du banc : gen_random_bytes, au même nom et au même type.
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
create table public.contenus_masques (target_type text, target_id text, signaleurs integer, masque_le timestamptz, decision text, decide_le timestamptz);
create table public.posts (
  id text primary key, author_id text constraint posts_author_id_fkey references public.profiles(id),
  passion_id text constraint posts_passion_fk references public.passions(id), mood text, content text, media_url text,
  likes integer default 0, created_at timestamp default now(), shared_from_post_id text, shared_data text,
  is_reel boolean default false, overlays jsonb, vlog jsonb, event_id text);
create table public.post_comments (
  id text primary key, post_id text, author_id text constraint post_comments_author_id_fkey references public.profiles(id),
  content text, created_at timestamp default now());
create table public.post_likes (post_id text not null, user_id text not null, primary key (post_id, user_id));
create table public.post_collaborators (post_id text not null, user_id text not null, added_by text not null, created_at timestamptz default now());
create table public.comment_interactions (
  id text primary key, comment_id text not null, post_id text, user_id text not null, kind text not null, payload text,
  created_at timestamptz not null default now(),
  constraint ci_ids_len_check check ((char_length(id) <= 120) and (char_length(comment_id) <= 120) and ((post_id is null) or (char_length(post_id) <= 120)) and (char_length(user_id) <= 120)),
  constraint ci_kind_check check (kind = any (array['like'::text, 'reply'::text, 'emoji'::text, 'gif'::text])),
  constraint ci_payload_len_check check ((payload is null) or (char_length(payload) <= 500)));
create table public.events (
  id text primary key, author_id text, title text, passion_id text, lat double precision, lng double precision, city text,
  description text, emoji text default '📍', max_attendees integer, date_at timestamp, created_at timestamp default now(),
  venue text, address text, postal_code text, price double precision default 0, contact text, external_link text,
  event_type text default 'Autre', cover_url text, organizer_id text, end_at timestamp, status text not null default 'active',
  updated_at timestamp, co_organizers jsonb not null default '[]'::jsonb, series_id text, recurrence text not null default 'none', conv_id text);
create table public.event_comments (
  id text primary key, event_id text not null references public.events(id) on delete cascade, author_id text not null,
  author_name text, text text, created_at timestamptz default now());
create table public.event_checkin_secrets (event_id text primary key references public.events(id) on delete cascade, secret text, created_at timestamptz default now());
create table public.cdv_lives (
  id text primary key, author_id text not null, destination text, description text, duration text,
  visibility text default 'public', status text default 'live', created_at timestamptz default now(), updated_at timestamptz default now());
create table public.notifications (
  id text primary key, user_id text, kind text, from_id text, ref_id text, content text,
  seen boolean default false, created_at timestamp default now(), origine text not null default 'client');
create index idx_likes_post on public.post_likes using btree (post_id);
create index idx_comments_post on public.post_comments using btree (post_id, created_at desc);
create index idx_post_comments_author on public.post_comments using btree (author_id);
create index idx_ci_comment on public.comment_interactions using btree (comment_id);
create index idx_ci_user_created on public.comment_interactions using btree (user_id, created_at);

-- ── Fonctions : corps de production (pg_get_functiondef, 2026-11-04) ──
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
create function public.posts_freeze_author() returns trigger language plpgsql set search_path = '' as $fn$
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    NEW.author_id := OLD.author_id;
  END IF;
  RETURN NEW;
END;
$fn$;
create function public.identifiants_figes() returns trigger language plpgsql set search_path = '' as $fn$
declare col text; avant text; apres text;
begin
  foreach col in array TG_ARGV loop
    execute format('select ($1).%I::text, ($2).%I::text', col, col) into avant, apres using old, new;
    if avant is distinct from apres then
      raise exception '% : la colonne % ne se modifie pas', TG_TABLE_NAME, col using errcode = '42501';
    end if;
  end loop;
  return new;
end $fn$;
create function public.follows_statut_initial() returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if new.follower_id <> new.following_id
     and exists (select 1 from public.profiles p where p.id = new.following_id and p.is_private = true) then
    new.status := 'pending';
  else
    new.status := 'accepted';
  end if;
  return new;
end $fn$;
create function public.follows_identifiants_figes() returns trigger language plpgsql set search_path = '' as $fn$
begin
  if new.follower_id <> old.follower_id or new.following_id <> old.following_id then
    raise exception 'follows : les identifiants d''un abonnement ne se modifient pas' using errcode = '42501';
  end if;
  return new;
end $fn$;
create function public.follows_notifier() returns trigger language plpgsql security definer set search_path = '' as $fn$
declare acteur text; cible text; genre text; texte text; ident text; nom text;
begin
  if TG_OP = 'INSERT' then
    if new.follower_id = new.following_id then return new; end if;
    acteur := new.follower_id; cible := new.following_id;
    if new.status = 'pending' then
      genre := 'follow_request'; texte := 'souhaite s''abonner à ton compte privé';
      ident := 'n_fr_' || left(acteur, 8) || '_' || left(cible, 8);
    else
      genre := 'follow'; texte := 'a commencé à te suivre';
      ident := 'n_fw_' || left(acteur, 8) || '_' || left(cible, 8);
    end if;
  elsif TG_OP = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    acteur := new.following_id; cible := new.follower_id;
    genre := 'follow'; texte := 'a accepté ta demande d''abonnement';
    ident := 'n_fa_' || left(acteur, 8) || '_' || left(cible, 8);
  else
    return new;
  end if;
  select nullif(btrim(p.username), '') into nom from public.profiles p where p.id = acteur;
  perform set_config('passio.notification_serveur', '1', true);
  begin
    insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
    values (ident, cible, genre, acteur, acteur, coalesce(nom, 'Quelqu''un') || ' ' || texte, false, now())
    on conflict (id) do update set content = excluded.content, kind = excluded.kind, seen = false, created_at = now()
      where public.notifications.user_id = excluded.user_id and public.notifications.from_id = excluded.from_id;
    if not found then
      insert into public.notifications (id, user_id, kind, from_id, ref_id, content, seen, created_at)
      values (left(ident, 5) || left(md5(ident || '|' || clock_timestamp()::text || '|' || random()::text), 20),
              cible, genre, acteur, acteur, coalesce(nom, 'Quelqu''un') || ' ' || texte, false, now());
    end if;
  exception when others then
    raise warning 'follows_notifier : notification non écrite (%) — l''abonnement est conservé', sqlerrm;
  end;
  return new;
end $fn$;
create function public.notifications_origine() returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  new.origine := case when current_setting('passio.notification_serveur', true) = '1' then 'serveur' else 'client' end;
  return new;
end $fn$;
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
create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path = '' as $fn$
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
$fn$;
create function public.post_masque(p_id text) returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.contenus_masques m
     where m.target_type = 'post' and m.target_id = p_id
       and m.decision is distinct from 'retabli'
  );
$fn$;
create function public.post_auteur_bloque(_post_id text) returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select exists (select 1 from public.posts p
                 where p.id = _post_id and public.is_blocked_with(p.author_id));
$fn$;
create function public.can_edit_post(pid text) returns boolean language sql stable security definer set search_path = public as $fn$
  SELECT EXISTS (SELECT 1 FROM posts p WHERE p.id = pid AND p.author_id = auth.uid()::text)
      OR EXISTS (SELECT 1 FROM post_collaborators c WHERE c.post_id = pid AND c.user_id = auth.uid()::text);
$fn$;
-- Les deux fonctions de R31, telles qu'en production (md5(prosrc) contrôlé par le banc).
CREATE OR REPLACE FUNCTION public.post_is_visible(pid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when pid is null then true
    -- Pas de ligne posts = contenu seed/local → public (contenu démo beta)
    when not exists (select 1 from posts where id = pid) then true
    else exists (
      select 1 from posts p
      where p.id = pid and (
        p.author_id = (select auth.uid())::text
        or not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
        or public.abonne_accepte_non_bloque(p.author_id)
      )
    )
  end
$function$;
CREATE OR REPLACE FUNCTION public.comment_target_visible(cid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when cid is null then true
    when exists (select 1 from posts where id = cid)
      then public.post_is_visible(cid)
    when exists (select 1 from post_comments where id = cid)
      then public.post_is_visible((select post_id from post_comments where id = cid limit 1))
    else true
  end
$function$;

-- ── Déclencheurs de production ──
create trigger trg_posts_freeze_author before update on public.posts for each row execute function public.posts_freeze_author();
create trigger trg_rate_limit before insert on public.posts for each row execute function public.rate_limit_insert('author_id', '10');
create trigger zz_barriere_suppression before insert or update on public.posts for each row execute function public.refuser_ecriture_compte_en_suppression('author_id');
create trigger trg_identifiants_figes before update on public.post_comments for each row execute function public.identifiants_figes('post_id', 'author_id');
create trigger trg_rate_limit before insert on public.post_comments for each row execute function public.rate_limit_insert('author_id', '30');
create trigger zz_barriere_suppression before insert or update on public.post_comments for each row execute function public.refuser_ecriture_compte_en_suppression('author_id');
create trigger zz_barriere_suppression before insert or update on public.post_likes for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');
create trigger trg_rate_limit before insert on public.comment_interactions for each row execute function public.rate_limit_insert('user_id', '60');
create trigger zz_barriere_suppression before insert or update on public.comment_interactions for each row execute function public.refuser_ecriture_compte_en_suppression('user_id');
create trigger trg_follows_figes before update on public.follows for each row execute function public.follows_identifiants_figes();
create trigger trg_follows_notifier after insert or update of status on public.follows for each row execute function public.follows_notifier();
create trigger trg_follows_statut before insert on public.follows for each row execute function public.follows_statut_initial();
create trigger trg_rate_limit before insert on public.follows for each row execute function public.rate_limit_insert('follower_id', '30');
create trigger zz_barriere_suppression before insert or update on public.follows for each row execute function public.refuser_ecriture_compte_en_suppression('follower_id', 'following_id');
create trigger trg_events_secret_pointage after insert on public.events for each row execute function public.events_poser_secret_pointage();
create trigger trg_rate_limit before insert on public.events for each row execute function public.rate_limit_insert('author_id', '15');
create trigger zz_barriere_suppression before insert or update on public.events for each row execute function public.refuser_ecriture_compte_en_suppression('author_id');
create trigger trg_notifications_origine before insert on public.notifications for each row execute function public.notifications_origine();
create trigger trg_rate_limit before insert on public.notifications for each row execute function public.rate_limit_insert('from_id', '60');
create trigger zz_barriere_suppression before insert or update on public.notifications for each row execute function public.refuser_ecriture_compte_en_suppression('from_id', 'user_id');
create trigger zz_barriere_suppression before insert or update on public.post_collaborators for each row execute function public.refuser_ecriture_compte_en_suppression('added_by', 'user_id');
create trigger zz_barriere_suppression before insert or update on public.profiles for each row execute function public.refuser_ecriture_compte_en_suppression('id');
create trigger zz_barriere_suppression before insert or update on public.cdv_lives for each row execute function public.refuser_ecriture_compte_en_suppression('author_id');

-- ── RLS, droits et policies de production ──
alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_collaborators enable row level security;
alter table public.comment_interactions enable row level security;
alter table public.events enable row level security;
alter table public.event_comments enable row level security;
alter table public.event_checkin_secrets enable row level security;
alter table public.cdv_lives enable row level security;
alter table public.notifications enable row level security;
alter table public.comptes_en_suppression enable row level security;
alter table public.contenus_masques enable row level security;
grant select, insert, update, delete on public.profiles, public.follows, public.blocks, public.posts, public.post_comments,
  public.post_likes, public.post_collaborators, public.comment_interactions, public.event_comments, public.cdv_lives to anon, authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, update, delete on public.events to anon;   -- production : SELECT par colonnes publiques ; sans effet ici
grant all on all tables in schema public to service_role;

create policy "Suppression propre" on public.posts for delete using ((author_id = (( select auth.uid() as uid))::text));
create policy "Ecriture propre" on public.posts for insert with check (((author_id = (( select auth.uid() as uid))::text) and (not public.suppression_de_mon_compte())));
create policy "Lecture respectant les comptes prives" on public.posts for select using (((author_id = (( select auth.uid() as uid))::text) or (not (exists ( select 1 from public.profiles pr where ((pr.id = posts.author_id) and (pr.is_private = true))))) or public.abonne_accepte_non_bloque(author_id)));
create policy "Masquage apres signalements" on public.posts as restrictive for select using (((author_id = (( select auth.uid() as uid))::text) or (not public.post_masque(id))));
create policy "Update propre" on public.posts for update to authenticated using (public.can_edit_post(id)) with check ((public.can_edit_post(id) and (not public.suppression_de_mon_compte())));
create policy "Suppression propre" on public.post_comments for delete using ((author_id = (( select auth.uid() as uid))::text));
create policy "Ecriture propre" on public.post_comments for insert to authenticated with check (((author_id = (( select auth.uid() as uid))::text) and (not public.post_auteur_bloque(post_id)) and (not public.suppression_de_mon_compte())));
create policy "Lecture selon visibilite du post" on public.post_comments for select using (((author_id = (( select auth.uid() as uid))::text) or public.post_is_visible(post_id)));
create policy "Update propre" on public.post_comments for update to authenticated using ((author_id = (( select auth.uid() as uid))::text)) with check (((author_id = (( select auth.uid() as uid))::text) and (not public.post_auteur_bloque(post_id)) and (not public.suppression_de_mon_compte())));
create policy "Suppression propre" on public.post_likes for delete using ((user_id = (( select auth.uid() as uid))::text));
create policy "Ecriture propre" on public.post_likes for insert to authenticated with check (((user_id = (( select auth.uid() as uid))::text) and (not public.post_auteur_bloque(post_id)) and (not public.suppression_de_mon_compte())));
create policy "Lecture selon visibilite du post" on public.post_likes for select using (((user_id = (( select auth.uid() as uid))::text) or public.post_is_visible(post_id)));
create policy ci_delete on public.comment_interactions for delete using ((user_id = (( select auth.uid() as uid))::text));
create policy ci_insert on public.comment_interactions for insert with check (((user_id = (( select auth.uid() as uid))::text) and (not public.suppression_de_mon_compte())));
create policy "Lecture selon visibilite de la cible" on public.comment_interactions for select using (((user_id = (( select auth.uid() as uid))::text) or public.comment_target_visible(comment_id)));
create policy "Ecriture propre" on public.follows for insert to authenticated with check (((follower_id = (( select auth.uid() as uid))::text) and (not public.is_blocked_with(following_id)) and (not public.suppression_de_mon_compte())));
create policy "Suppression propre" on public.follows for delete using (((follower_id = (( select auth.uid() as uid))::text) or (following_id = (( select auth.uid() as uid))::text)));
create policy follows_accepter on public.follows for update to authenticated using ((following_id = (( select auth.uid() as uid))::text)) with check (((following_id = (( select auth.uid() as uid))::text) and (status = 'accepted'::text) and (not public.suppression_de_mon_compte())));
create policy follows_lecture on public.follows for select to anon, authenticated using (((status = 'accepted'::text) or (follower_id = (( select auth.uid() as uid))::text) or (following_id = (( select auth.uid() as uid))::text)));
create policy "Lecture publique" on public.profiles for select using (true);
create policy "Suppression propre" on public.profiles for delete using ((id = (( select auth.uid() as uid))::text));
create policy "Update propre" on public.profiles for update using ((id = (( select auth.uid() as uid))::text)) with check (((id = (( select auth.uid() as uid))::text) and (not public.suppression_de_mon_compte())));
create policy "Upsert propre" on public.profiles for insert with check (((id = (( select auth.uid() as uid))::text) and (not public.suppression_de_mon_compte())));
create policy blocks_delete_own on public.blocks for delete using ((blocker_id = (( select auth.uid() as uid))::text));
create policy blocks_insert_own on public.blocks for insert with check (((blocker_id = (( select auth.uid() as uid))::text) and (not public.suppression_de_mon_compte())));
create policy blocks_select_own on public.blocks for select using ((blocker_id = (( select auth.uid() as uid))::text));
create policy post_collab_select on public.post_collaborators for select using (true);
create policy post_collab_delete on public.post_collaborators for delete using (((user_id = (( select auth.uid() as uid))::text) or (exists ( select 1 from public.posts p where ((p.id = post_collaborators.post_id) and (p.author_id = (( select auth.uid() as uid))::text))))));
create policy post_collab_insert_owner on public.post_collaborators for insert with check (((added_by = (( select auth.uid() as uid))::text) and (exists ( select 1 from public.posts p where ((p.id = post_collaborators.post_id) and (p.author_id = (( select auth.uid() as uid))::text)))) and (not public.suppression_de_mon_compte())));
create policy "Lecture publique" on public.events for select using (true);
create policy "Suppression propre" on public.events for delete using ((author_id = (( select auth.uid() as uid))::text));
create policy event_comments_select on public.event_comments for select using (true);
create policy event_comments_delete_own on public.event_comments for delete using ((author_id = (( select auth.uid() as uid))::text));
create policy cdv_lives_select on public.cdv_lives for select using (((visibility <> 'private'::text) or (author_id = (( select auth.uid() as uid))::text)));
SQL
chmod 644 "$SQLDIR/socle.sql"
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database socle" >/dev/null
psql -h "$BASE" -p "$PORT" -U postgres -d socle -q -v ON_ERROR_STOP=1 -f "$SQLDIR/socle.sql" >/dev/null

echo "── ⓪ LE SOCLE PORTE LES DÉFINITIONS DE PRODUCTION ──────────────────"
verifier "post_is_visible du socle = la définition de production, à l'octet près (md5(prosrc))" "$MD5_PROD_POST_IS_VISIBLE" "$(md5_fn 'public.post_is_visible(text)' socle)"
verifier "comment_target_visible(text) du socle = la définition de production (md5(prosrc))" "$MD5_PROD_COMMENT_TARGET" "$(md5_fn 'public.comment_target_visible(text)' socle)"
QUAL_CI_AVANT="$(qual_policy comment_interactions 'Lecture selon visibilite de la cible' socle)"
QUAL_PC_AVANT="$(qual_policy post_comments 'Lecture selon visibilite du post' socle)"
QUAL_PL_AVANT="$(qual_policy post_likes 'Lecture selon visibilite du post' socle)"
ACL_AVANT="$(acl_fns socle)"
verifier "la policy de production appelle comment_target_visible(comment_id)" "((user_id = (( SELECT auth.uid() AS uid))::text) OR comment_target_visible(comment_id))" "$QUAL_CI_AVANT"
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB template socle" >/dev/null

# ── ① AVANT : le décor, puis le défaut ──
cat > "$SQLDIR/decor.sql" <<'SQL'
insert into public.profiles (id, username, is_private) values
  (:'m', 'M privé', true), (:'v', 'V', false), (:'n', 'N', false), (:'m2', 'M2 privé', true), (:'w', 'W', false), (:'m3', 'M3 privé', true);
-- V suit M, M2, M3 : « en attente » (comptes privés, trg_follows_statut), puis accepté.
insert into public.follows (follower_id, following_id) values (:'v', :'m'), (:'v', :'m2'), (:'v', :'m3');
update public.follows set status = 'accepted' where follower_id = :'v';
insert into public.posts (id, author_id, content) values
  (:'p1', :'m', 'P1 privée'), (:'p2', :'m', 'P2 privée'),
  (:'p3', :'m2', 'P3 de M2'), (:'p4', :'m2', 'bobine de M2'), (:'p5', :'m2', 'partage de M2');
insert into public.post_comments (id, post_id, author_id, content) values
  ('c_xr31banc00c1', :'p1', :'v', 'V sur P1'), ('c_xr31banc00c2', :'p2', :'v', 'V sur P2'),
  ('c_xr31banc00c3', :'p3', :'v', 'V sur P3'), ('c_xr31banc00c4', :'p4', :'v', 'V sur la bobine'),
  ('c_xr31banc00c5', :'p5', :'n', 'N sur le partage'),
  ('c_xr31banc0e1', 'p1', :'v', 'V sur un exemple'), ('c_xr31banc0e2', 'reel_seed_cuisine_1', :'n', 'N sur une bobine d''exemple'),
  ('c_xr31banc0vl', 'p_vlog_lisbonne', :'v', 'V sur un ancien carnet d''exemple');
insert into public.post_likes (post_id, user_id) values
  (:'p1', :'v'), (:'p2', :'v'), (:'p3', :'v'), (:'p4', :'n'), ('p48', :'v'), ('p_vlog_lisbonne', :'n');
insert into public.post_collaborators (post_id, user_id, added_by) values (:'p1', :'v', :'m');
insert into public.events (id, author_id, title) values (:'ev1', :'w', 'activité'), (:'ev2', :'w', 'activité supprimée ensuite');
insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values
  ('ci_banc_01', 'c_xr31banc00c1', :'p1', :'v', 'like', null),
  ('ci_banc_02', 'c_xr31banc00c1', :'p1', :'m', 'reply', 'M répond à V'),
  ('ci_banc_03', 'srep_r31banc_1', :'p1', :'v', 'emoji', '👍'),
  ('ci_banc_04', :'p1', :'p1', :'v', 'emoji', '😍'),
  ('ci_banc_05', 'c_xr31banc00c2', :'p2', :'m', 'reply', 'M répond à V sur P2'),
  ('ci_banc_06', 'c_xr31banc00c3', :'p3', :'m2', 'reply', 'M2 répond à V'),
  ('ci_banc_07', 'pac_music', 'pac_music', :'v', 'emoji', '🔥'),
  ('ci_banc_08', 'cp1_1', 'p1', :'n', 'like', null),
  ('ci_banc_09', 'ec_xr31banc01', :'ev1', :'v', 'like', null),
  ('ci_banc_10', 'ec_xr31banc02', :'ev2', :'v', 'like', null),
  ('ci_banc_11', 'lc_xr31banc01', 'live_xr31banclive0001', :'v', 'like', null),
  ('ci_banc_12', 'carnetstep:xr31:1', 'carnetstep:xr31:1', :'v', 'emoji', '✨');
SQL
chmod 644 "$SQLDIR/decor.sql"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 \
  -v m="$M" -v v="$V" -v n="$N" -v m2="$M2" -v w="$W" -v m3="$M3" \
  -v p1="$P1" -v p2="$P2" -v p3="$P3" -v p4="$P4" -v p5="$P5" -v ev1="$EV1" -v ev2="$EV2" -f "$SQLDIR/decor.sql" >/dev/null

echo "── ① AVANT : sur les définitions de production, le défaut ───────────"
verifier "avant suppression : sans compte, 0 commentaire / 0 « j'aime » de la publication privée P1" "0|0" \
  "$(ANON "select (select count(*) from public.post_comments where post_id = '$P1') || '|' || (select count(*) from public.post_likes where post_id = '$P1');")"
verifier "…un non-abonné non plus" "0|0" \
  "$(AUTH "$N" "select (select count(*) from public.post_comments where post_id = '$P1') || '|' || (select count(*) from public.post_likes where post_id = '$P1');")"
verifier "LE DÉFAUT, SANS SUPPRESSION : la réaction de V à la RÉPONSE de M (srep_…) se lit sans compte" "1" \
  "$(ANON "select count(*) from public.comment_interactions where comment_id = 'srep_r31banc_1';")"
AUTH "$M" "delete from public.posts where id = '$P1';" >/dev/null
verifier "M supprime P1 (sous son rôle) : la ligne part" "0" "$(Q "select count(*) from public.posts where id = '$P1';")"
verifier "LE DÉFAUT : sans compte, on lit le commentaire de V (auteur, contenu)" "$V|V sur P1" \
  "$(ANON "select author_id || '|' || content from public.post_comments where post_id = '$P1';")"
verifier "LE DÉFAUT : …son « j'aime », et les quatre interactions du fil (dont la réponse de M)" "1|4|M répond à V" \
  "$(ANON "select (select count(*) from public.post_likes where post_id = '$P1') || '|' || (select count(*) from public.comment_interactions where post_id = '$P1') || '|' || (select payload from public.comment_interactions where id = 'ci_banc_02');")"
AUTH "$V" "delete from public.post_comments where id = 'c_xr31banc00c2';" >/dev/null
verifier "LE DÉFAUT : V supprime SON commentaire sur P2 → la réponse de M devient publique" "M répond à V sur P2" \
  "$(ANON "select payload from public.comment_interactions where id = 'ci_banc_05';")"
SERVICE "delete from public.posts where author_id = '$M2';" >/dev/null
verifier "LE DÉFAUT : le compte de M2 part (clé de service) → ses trois publications laissent 3 commentaires, 2 « j'aime », 1 réponse lisibles sans compte" "3|2|1" \
  "$(ANON "select (select count(*) from public.post_comments where post_id in ('$P3', '$P4', '$P5')) || '|' || (select count(*) from public.post_likes where post_id in ('$P3', '$P4', '$P5')) || '|' || (select count(*) from public.comment_interactions where post_id in ('$P3', '$P4', '$P5'));")"
AUTH "$W" "delete from public.events where id = '$EV2';" >/dev/null
verifier "une activité supprimée laisse son interaction, lisible sans compte" "1" "$(ANON "select count(*) from public.comment_interactions where id = 'ci_banc_10';")"
# L'état de production avec ses orphelins : le modèle des mutations (⑧).
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database avant template $DB" >/dev/null

echo "── ② LE VERDICT RÉINJECTÉ SUR L'ÉTAT DE PRODUCTION ROUGIT ───────────"
{ echo "begin;"
  sed -n '/^create or replace function public.est_identifiant_exemple/,/^\$\$;$/p' "$MIGRATION"
  VERDICT_SEUL
  echo "rollback;"; } > "$SQLDIR/reinjecte.sql"; chmod 644 "$SQLDIR/reinjecte.sql"
s_r="$(APPLIQUER "$DB" "$SQLDIR/reinjecte.sql" || true)"
verifier "réinjecté : la mesure le dit (la surcharge par le fil n'existe pas : 42883)" "ECHEC|42883" \
  "$(ligne "$s_r" "R31 · mesure exécutée")|$(printf '%s\n' "$s_r" | grep -F "R31 · mesure exécutée" | grep -oE '42883' | head -1)"
verifier "réinjecté : « avant suppression », « réponses », « l'auteur supprime » ROUGISSENT (la réaction à une réponse se lit, les dépendances restent)" "ECHEC|ECHEC|ECHEC" \
  "$(ligne "$s_r" "AVANT suppression")|$(ligne "$s_r" "réaction à une RÉPONSE")|$(ligne "$s_r" "l'auteur supprime sa publication")"
verifier "réinjecté : orphelins réels, policy, déclencheurs, index ROUGISSENT" "ECHEC|ECHEC|ECHEC|ECHEC" \
  "$(ligne "$s_r" "plus aucun orphelin au format réel")|$(ligne "$s_r" "policy « Lecture selon")|$(ligne "$s_r" "déclencheurs AFTER DELETE")|$(ligne "$s_r" "index idx_ci_post")"
verifier "réinjecté : rien n'a changé (sous-transaction, puis rollback)" "$MD5_PROD_POST_IS_VISIBLE|absente" \
  "$(md5_fn 'public.post_is_visible(text)')|$(md5_fn 'public.est_identifiant_exemple(text)')"

echo "── ③ APPLICATION, VERDICT, PURGE DU PASSÉ, REJEU ────────────────────"
sortie="$(APPLIQUER "$DB" "$MIGRATION")" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -8; exit 1; }
printf '%s\n' "$sortie" | sed 's/^/     │ /'
verifier "le verdict rend 17 OK et 0 ECHEC" "17/0" "$(compte_verdict "$sortie")"
verifier "le passé : 4 commentaires, 3 « j'aime », 1 co-auteur, 6 interactions d'une publication ou activité supprimée effacés" \
  "4 / 3 / 1 / 6 (plafond 300)" "$(ligne "$sortie" "passé · orphelins")"
verifier "…et seulement eux : les commentaires et « j'aime » d'exemples, de l'ancien p_vlog_, restent" "2 / 1 | 1 / 1" "$(ligne "$sortie" "laissés · commentaires")"
verifier "…les interactions d'exemples (pac_music, p1), d'un live et d'un carnet retirés restent" "2 | 2" "$(ligne "$sortie" "laissés · interactions")"
verifier "la réponse de M au commentaire supprimé de P2 reste dans P2, qui existe (pas un orphelin)" "1" "$(Q "select count(*) from public.comment_interactions where id = 'ci_banc_05';")"
verifier "l'interaction de l'activité qui existe reste" "1" "$(Q "select count(*) from public.comment_interactions where id = 'ci_banc_09';")"
verifier "les policies des commentaires et des « j'aime » n'ont pas bougé (même texte)" "$QUAL_PC_AVANT|$QUAL_PL_AVANT" \
  "$(qual_policy post_comments 'Lecture selon visibilite du post')|$(qual_policy post_likes 'Lecture selon visibilite du post')"
verifier "les ACL de post_is_visible et comment_target_visible(text) n'ont pas bougé (create or replace)" "$ACL_AVANT" "$(acl_fns)"
sortie2="$(APPLIQUER "$DB" "$MIGRATION")" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -8; exit 1; }
verifier "rejeu : toujours 17 OK, 0 ECHEC" "17/0" "$(compte_verdict "$sortie2")"
verifier "rejeu : plus rien à effacer" "0 / 0 / 0 / 0 (plafond 300)" "$(ligne "$sortie2" "passé · orphelins")"

echo "── ④ APRÈS : le même scénario, plus rien à lire ni en base ──────────"
verifier "la réponse de M sur P2 (commentaire supprimé avant la migration) : sans compte 0, l'abonné V la lit encore (son public)" "0|1" \
  "$(ANON "select count(*) from public.comment_interactions where id = 'ci_banc_05';")|$(AUTH "$V" "select count(*) from public.comment_interactions where id = 'ci_banc_05';")"
verifier "exemples, sans compte : le commentaire sur p1, celui sur une bobine d'exemple, la réaction à pac_music, le « j'aime » d'un commentaire d'exemple" "1|1|1|1" \
  "$(ANON "select (select count(*) from public.post_comments where id = 'c_xr31banc0e1') || '|' || (select count(*) from public.post_comments where id = 'c_xr31banc0e2') || '|' || (select count(*) from public.comment_interactions where id = 'ci_banc_07') || '|' || (select count(*) from public.comment_interactions where id = 'ci_banc_08');")"
verifier "…et le « j'aime » d'une publication d'exemple (p48)" "1" "$(ANON "select count(*) from public.post_likes where post_id = 'p48';")"
verifier "une interaction dans une activité qui existe : lisible sans compte" "1" "$(ANON "select count(*) from public.comment_interactions where id = 'ci_banc_09';")"
verifier "l'ancien p_vlog_, un live, un carnet retirés : 0 commentaire, 0 « j'aime », 0 interaction sans compte ; 0 pour N" "0|0|0|0" \
  "$(ANON "select (select count(*) from public.post_comments where id = 'c_xr31banc0vl') || '|' || (select count(*) from public.post_likes where post_id = 'p_vlog_lisbonne') || '|' || (select count(*) from public.comment_interactions where id in ('ci_banc_11', 'ci_banc_12'));")|$(AUTH "$N" "select count(*) from public.comment_interactions where id in ('ci_banc_11', 'ci_banc_12');")"
verifier "…mais leur AUTEUR les lit toujours (V : son commentaire et ses deux interactions ; N : son « j'aime »)" "1|2|1" \
  "$(AUTH "$V" "select (select count(*) from public.post_comments where id = 'c_xr31banc0vl') || '|' || (select count(*) from public.comment_interactions where id in ('ci_banc_11', 'ci_banc_12'));")|$(AUTH "$N" "select count(*) from public.post_likes where post_id = 'p_vlog_lisbonne';")"
Q "insert into public.posts (id, author_id, content) values ('$P6', '$M', 'P6 privée'), ('$P7', '$M', 'P7 privée'), ('$P8', '$M3', 'P8 de M3'), ('$P9', '$M3', 'bobine de M3');
   insert into public.post_comments (id, post_id, author_id, content) values
     ('c_xr31banc00c6', '$P6', '$V', 'V sur P6'), ('c_xr31banc00c7', '$P7', '$V', 'V sur P7'),
     ('c_xr31banc00c8', '$P8', '$V', 'V sur P8'), ('c_xr31banc00c9', '$P9', '$V', 'V sur la bobine de M3');
   insert into public.post_likes (post_id, user_id) values ('$P6', '$V'), ('$P7', '$N'), ('$P8', '$V'), ('$P9', '$V');
   insert into public.post_collaborators (post_id, user_id, added_by) values ('$P6', '$V', '$M');
   insert into public.comment_interactions (id, comment_id, post_id, user_id, kind, payload) values
     ('ci_banc_21', 'c_xr31banc00c6', '$P6', '$V', 'like', null),
     ('ci_banc_22', 'c_xr31banc00c6', '$P6', '$M', 'reply', 'M répond à V sur P6'),
     ('ci_banc_23', 'srep_r31banc_6', '$P6', '$V', 'emoji', '👍'),
     ('ci_banc_24', '$P6', '$P6', '$V', 'emoji', '😍'),
     ('ci_banc_31', 'c_xr31banc00c7', '$P7', '$M', 'reply', 'M répond à V sur P7'),
     ('ci_banc_32', 'c_xr31banc00c7', '$P7', '$N', 'like', null),
     ('ci_banc_41', 'c_xr31banc00c8', '$P8', '$M3', 'reply', 'M3 répond à V'),
     ('ci_banc_42', '$P9', '$P9', '$V', 'emoji', '🎬');" >/dev/null
verifier "avant suppression : sans compte et pour N, 0 commentaire / 0 « j'aime » / 0 interaction de P6, réaction à la réponse comprise" "0|0|0|0" \
  "$(ANON "select (select count(*) from public.post_comments where post_id = '$P6') || '|' || (select count(*) from public.post_likes where post_id = '$P6') || '|' || (select count(*) from public.comment_interactions where post_id = '$P6') || '|' || (select count(*) from public.comment_interactions where comment_id = 'srep_r31banc_6');")"
verifier "…pour N non plus" "0|0|0" \
  "$(AUTH "$N" "select (select count(*) from public.post_comments where post_id = '$P6') || '|' || (select count(*) from public.post_likes where post_id = '$P6') || '|' || (select count(*) from public.comment_interactions where post_id = '$P6');")"
verifier "l'abonné V lit la réponse de M ; M, l'auteur, lit la réaction de V à sa réponse (le fil décide)" "1|1" \
  "$(AUTH "$V" "select count(*) from public.comment_interactions where id = 'ci_banc_22';")|$(AUTH "$M" "select count(*) from public.comment_interactions where comment_id = 'srep_r31banc_6';")"
AUTH "$M" "delete from public.posts where id = '$P6';" >/dev/null
verifier "M supprime P6 sous son rôle : en BASE, 0 commentaire, 0 « j'aime », 0 co-auteur, 0 interaction (réaction à la réponse comprise)" "0|0|0|0" \
  "$(Q "select (select count(*) from public.post_comments where post_id = '$P6') || '|' || (select count(*) from public.post_likes where post_id = '$P6') || '|' || (select count(*) from public.post_collaborators where post_id = '$P6') || '|' || (select count(*) from public.comment_interactions where post_id = '$P6' or comment_id in ('$P6', 'c_xr31banc00c6', 'srep_r31banc_6'));")"
verifier "…et les fonctions disent FAUX sur la publication supprimée, sans compte comme pour M" "f|f|f|f" \
  "$(ANON "select public.post_is_visible('$P6');" | sed 's/true/t/;s/false/f/')|$(ANON "select public.comment_target_visible('c_xr31banc00c6', '$P6');" | sed 's/true/t/;s/false/f/')|$(AUTH "$M" "select public.post_is_visible('$P6');" | sed 's/true/t/;s/false/f/')|$(AUTH "$M" "select public.comment_target_visible('$P6');" | sed 's/true/t/;s/false/f/')"
AUTH "$V" "delete from public.post_comments where id = 'c_xr31banc00c7';" >/dev/null
verifier "V supprime son commentaire sur P7 : la réponse de M et le « j'aime » de N partent ; P7 et son « j'aime » restent" "0|1|1" \
  "$(Q "select (select count(*) from public.comment_interactions where comment_id = 'c_xr31banc00c7') || '|' || (select count(*) from public.posts where id = '$P7') || '|' || (select count(*) from public.post_likes where post_id = '$P7');")"
SERVICE "delete from public.posts where author_id = '$M3';" >/dev/null
verifier "le compte de M3 part (clé de service, une instruction, deux publications) : 0 commentaire, 0 « j'aime », 0 interaction" "0|0|0" \
  "$(Q "select (select count(*) from public.post_comments where post_id in ('$P8', '$P9')) || '|' || (select count(*) from public.post_likes where post_id in ('$P8', '$P9')) || '|' || (select count(*) from public.comment_interactions where post_id in ('$P8', '$P9') or comment_id in ('c_xr31banc00c8', '$P9'));")"
verifier "les rôles clients n'appellent pas est_identifiant_exemple ni les fonctions de purge" "permission denied|permission denied" \
  "$(ANON "select public.est_identifiant_exemple('p1');" | grep -o 'permission denied' | head -1)|$(AUTH "$V" "select public.est_identifiant_exemple('p1');" | grep -o 'permission denied' | head -1)"

echo "── ⑤ PLAFOND : au-delà de 300 orphelins, rien n'est appliqué ────────"
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database plafond template socle" >/dev/null
QD plafond "insert into public.post_likes (post_id, user_id) select 'x' || lpad(i::text, 16, '0'), 'aaaaaaaa-0000-4000-8000-000000000001' from generate_series(1, 301) i;" >/dev/null
s_p="$(APPLIQUER plafond "$MIGRATION" || true)"
contient "301 « j'aime » orphelins au format réel : la migration REFUSE, et dit pourquoi (nombres seulement)" "R31 : 301 ligne(s) orpheline(s) à effacer pour un plafond de 300" "$s_p"
verifier "…et RIEN n'est appliqué : post_is_visible de production, pas d'est_identifiant_exemple, pas de déclencheur, 301 « j'aime »" "$MD5_PROD_POST_IS_VISIBLE|absente|0|301" \
  "$(md5_fn 'public.post_is_visible(text)' plafond)|$(md5_fn 'public.est_identifiant_exemple(text)' plafond)|$(QD plafond "select count(*) from pg_trigger where tgname like 'trg_purger_cibles_%';")|$(QD plafond "select count(*) from public.post_likes;")"
python3 - "$MIGRATION" "$SQLDIR/plafond_400.sql" <<'PY'
import sys
s = open(sys.argv[1], encoding="utf-8").read()
assert s.count("\nbegin;\n") == 1, "« begin; » introuvable ou ambigu"
open(sys.argv[2], "w", encoding="utf-8").write(s.replace("\nbegin;\n", "\nbegin;\nselect set_config('passio.r31_plafond_purge', '400', true);\n"))
PY
chmod 644 "$SQLDIR/plafond_400.sql"
s_p2="$(APPLIQUER plafond "$SQLDIR/plafond_400.sql" || true)"
verifier "le plafond posé juste après begin; (le geste de l'en-tête) : 17 OK, les 301 « j'aime » effacés" "17/0|0 / 301 / 0 / 0 (plafond 400)" \
  "$(compte_verdict "$s_p2")|$(ligne "$s_p2" "passé · orphelins")"

echo "── ⑥ VERROU : une écriture qui tient posts fait échouer la migration en 5 s ──"
psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database verrou template socle" >/dev/null
psql -h "$BASE" -p "$PORT" -U postgres -d verrou -q -c "begin; lock table public.posts in row exclusive mode; select pg_sleep(12); commit;" >/dev/null 2>&1 &
TENEUR=$!
sleep 1
debut=$(date +%s)
s_v="$(APPLIQUER verrou "$MIGRATION" || true)"
duree=$(( $(date +%s) - debut ))
wait "$TENEUR" || true
contient "le verrou n'est pas venu : la migration échoue (lock_timeout)" "canceling statement due to lock timeout" "$s_v"
verifier "…en moins de 10 s, sans attendre la fin de l'écriture (12 s)" "1" "$([ "$duree" -lt 10 ] && echo 1 || echo "0 ($duree s)")"
verifier "…et rien n'est appliqué" "$MD5_PROD_POST_IS_VISIBLE|0" \
  "$(md5_fn 'public.post_is_visible(text)' verrou)|$(QD verrou "select count(*) from pg_trigger where tgname like 'trg_purger_cibles_%';")"

echo "── ⑦ RETOUR ARRIÈRE : l'état exact d'avant, puis la migration rejouée ──"
RETOUR_ARRIERE > "$SQLDIR/retour.sql"; chmod 644 "$SQLDIR/retour.sql"
verifier "le retour arrière est un bloc begin; … commit; (les lignes « --| » de l'en-tête)" "begin;|commit;" \
  "$(head -1 "$SQLDIR/retour.sql")|$(tail -1 "$SQLDIR/retour.sql")"
psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$SQLDIR/retour.sql" >/dev/null
verifier "retour : post_is_visible = la définition de production, à l'octet près (md5(prosrc))" "$MD5_PROD_POST_IS_VISIBLE" "$(md5_fn 'public.post_is_visible(text)')"
verifier "retour : comment_target_visible(text) = la définition de production (md5(prosrc))" "$MD5_PROD_COMMENT_TARGET" "$(md5_fn 'public.comment_target_visible(text)')"
verifier "retour : la policy de comment_interactions est celle d'avant, au caractère près" "$QUAL_CI_AVANT" "$(qual_policy comment_interactions 'Lecture selon visibilite de la cible')"
verifier "retour : les ACL des deux fonctions sont celles d'avant" "$ACL_AVANT" "$(acl_fns)"
verifier "retour : surcharge, est_identifiant_exemple, fonctions et déclencheurs de purge, index : tous retirés" "absente|absente|absente|absente|0|0" \
  "$(md5_fn 'public.comment_target_visible(text,text)')|$(md5_fn 'public.est_identifiant_exemple(text)')|$(md5_fn 'public.purger_cibles_publications()')|$(md5_fn 'public.purger_cibles_commentaires()')|$(Q "select count(*) from pg_trigger where tgname like 'trg_purger_cibles_%';")|$(Q "select count(*) from pg_class where relname = 'idx_ci_post';")"
verifier "retour : l'ancien comportement revient (une cible inconnue redevient publique)" "t" "$(ANON "select public.post_is_visible('xjamaispublie000');" | sed 's/true/t/;s/false/f/')"
sortie3="$(APPLIQUER "$DB" "$MIGRATION")" || { echo "  ❌ la migration rejouée après retour arrière a échoué"; echo "$sortie3" | tail -8; exit 1; }
verifier "la migration se rejoue après un retour arrière : 17 OK, 0 ECHEC" "17/0" "$(compte_verdict "$sortie3")"

echo "── ⑧ MUTATIONS : chaque ligne du verdict rougit sur le défaut qu'elle garde ──"
muter() {   # $1 nom, $2 texte à remplacer (exactement une fois), $3 remplaçant ; rend le verdict
  python3 - "$MIGRATION" "$SQLDIR/m_$1.sql" "$2" "$3" <<'PY'
import sys
src, dst, avant, apres = sys.argv[1:5]
s = open(src, encoding="utf-8").read()
assert s.count(avant) == 1, "mutation introuvable ou ambiguë : " + avant
open(dst, "w", encoding="utf-8").write(s.replace(avant, apres))
PY
  chmod 644 "$SQLDIR/m_$1.sql"
  psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database m_$1 template avant" >/dev/null
  APPLIQUER "m_$1" "$SQLDIR/m_$1.sql" || true
}
s_m="$(muter sans_purge_publication $'create or replace trigger trg_purger_cibles_publication\n  after delete on public.posts\n  referencing old table as publications_supprimees\n  for each statement execute function public.purger_cibles_publications();\n' '')"
verifier "sans le déclencheur de posts : « l'auteur supprime », « en nombre », « déclencheurs » ROUGISSENT" "ECHEC|ECHEC|ECHEC" \
  "$(ligne "$s_m" "l'auteur supprime sa publication")|$(ligne "$s_m" "EN NOMBRE")|$(ligne "$s_m" "déclencheurs AFTER DELETE")"
s_m="$(muter sans_purge_commentaire $'create or replace trigger trg_purger_cibles_commentaire\n  after delete on public.post_comments\n  referencing old table as commentaires_supprimes\n  for each statement execute function public.purger_cibles_commentaires();\n' '')"
verifier "sans le déclencheur de post_comments : « un commentaire supprimé » et « déclencheurs » ROUGISSENT ; la publication supprimée reste verte (elle purge par le fil)" "ECHEC|ECHEC|OK" \
  "$(ligne "$s_m" "un commentaire supprimé par son auteur")|$(ligne "$s_m" "déclencheurs AFTER DELETE")|$(ligne "$s_m" "l'auteur supprime sa publication")"
s_m="$(muter branche_ouverte 'when not exists (select 1 from posts where id = pid) then public.est_identifiant_exemple(pid)' 'when not exists (select 1 from posts where id = pid) then true')"
verifier "la branche « pas de ligne → public » rouverte : « cible absente », « ancien p_vlog_ », « définitions » ROUGISSENT" "ECHEC|ECHEC|ECHEC" \
  "$(ligne "$s_m" "une cible absente au format réel")|$(ligne "$s_m" "fil d'activité")|$(ligne "$s_m" "définitions :")"
s_m="$(muter cible_seule 'or public.comment_target_visible(comment_id, post_id));' 'or public.comment_target_visible(comment_id));')"
verifier "la policy par la CIBLE seule : la réaction à une réponse se perd pour l'auteur — « réponses » et « policy » ROUGISSENT" "ECHEC|ECHEC" \
  "$(ligne "$s_m" "réaction à une RÉPONSE")|$(ligne "$s_m" "policy « Lecture selon")"
s_m="$(muter activite_cachee $'    when exists (select 1 from events where id = pid) then true\n' '')"
verifier "le fil d'activité oublié : « fil d'activité » ROUGIT, les exemples restent verts" "ECHEC|OK" \
  "$(ligne "$s_m" "fil d'activité")|$(ligne "$s_m" "exemples :")"
s_m="$(muter exemples_fermes "  select coalesce(_id ~ '" "  select false and coalesce(_id ~ '")"
verifier "les exemples fermés : « exemples » ROUGIT" "ECHEC" "$(ligne "$s_m" "exemples :")"
s_m="$(muter droits_ouverts $'revoke all on function public.est_identifiant_exemple(text) from public, anon, authenticated;\n' '')"
verifier "est_identifiant_exemple laissé aux rôles clients : « droits » ROUGIT" "ECHEC" "$(ligne "$s_m" "droits :")"
s_m="$(muter decor_garde "    raise exception using errcode = 'P0001', message = 'passio_verdict_annule';" "    null;")"
verifier "le décor non annulé : « aucune trace » ROUGIT (le contrôle n'est pas décoratif)" "ECHEC" "$(ligne "$s_m" "aucune trace du décor")"
s_m="$(muter purge_large "  forme   constant text := '^(x[0-9a-z]{8,16}|reel_x[0-9a-z]{8,16}|post_[0-9]{13}_[0-9a-z]{1,9})\$';" "  forme   constant text := '^.*\$';")"
verifier "une purge au filtre trop large efface les EXEMPLES : le banc le voit (rien de laissé), la purge le compte" "0 / 0 | 0 / 0|7 / 5 / 1 / 10 (plafond 300)" \
  "$(ligne "$s_m" "laissés · commentaires")|$(ligne "$s_m" "passé · orphelins")"

echo
echo "RÉSULTAT : $ok ✅  $ko ❌"
[ "$ko" -eq 0 ]
