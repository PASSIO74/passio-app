-- BANC UNIQUEMENT : copies exactes du catalogue Lead du 16/11/2026.
-- Source : codex-fonctions-prod.json (definitions publiques, aucune donnee).
-- Les 9 empreintes de la migration sont verifiees par la migration ELLE-MEME.
-- Dependances recopiees sans modifier leur corps ; Auth/Realtime restent les stubs du socle.
-- Ne jamais appliquer cette fixture a un projet.
set check_function_bodies = off;
create table public.debit_ecritures (minute timestamptz not null, n integer not null, table_nom text not null, source text not null, primary key (minute, table_nom, source));
alter table public.debit_ecritures enable row level security;
revoke all on public.debit_ecritures from anon, authenticated;
alter table public.posts add column edited_at timestamptz;
-- Catalogue : post_auteur_bloque(text)
CREATE OR REPLACE FUNCTION public.post_auteur_bloque(_post_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.posts p
                 where p.id = _post_id and public.is_blocked_with(p.author_id));
$function$;

-- Catalogue : identifiants_figes()
CREATE OR REPLACE FUNCTION public.identifiants_figes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

-- Catalogue : diffuser_commentaire_publication()
CREATE OR REPLACE FUNCTION public.diffuser_commentaire_publication()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  auteur text;
  charge jsonb;
begin
  if new.post_id is null then return null; end if;
  select p.author_id into auteur from public.posts p where p.id = new.post_id;
  if not found then return null; end if;          -- pas une publication réelle : personne n'écoute
  charge := jsonb_build_object(
    'table', 'post_comments',
    'operation', 'INSERT',
    'record', jsonb_build_object(
      'id', new.id,
      'post_id', new.post_id,
      'author_id', new.author_id,
      'content', left(new.content, 2000),
      'created_at', new.created_at
    )
  );
  begin
    perform realtime.send(charge, 'post_comments:INSERT', 'fil:' || new.post_id, true);
    if auteur ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not public.blocage_entre(auteur, new.author_id) then
      perform realtime.send(charge, 'post_comments:INSERT', 'user:' || auteur, true);
    end if;
  exception when others then
    raise warning 'diffuser_commentaire_publication : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$function$;

-- Catalogue : diffuser_interaction()
CREATE OR REPLACE FUNCTION public.diffuser_interaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  auteur text;
  charge jsonb;
  evenement text;
begin
  if tg_op = 'DELETE' then r := old; evenement := 'comment_interactions:DELETE';
  else r := new; evenement := 'comment_interactions:INSERT';
  end if;
  if r.post_id is null then return null; end if;
  select p.author_id into auteur from public.posts p where p.id = r.post_id;
  if not found then
    -- Une activité a un sujet, mais pas d'« auteur de publication » à prévenir.
    if not exists (select 1 from public.events e where e.id = r.post_id) then return null; end if;
    auteur := null;
  end if;
  charge := jsonb_build_object(
    'table', 'comment_interactions',
    'operation', tg_op,
    'record', jsonb_build_object(
      'id', r.id,
      'comment_id', r.comment_id,
      'post_id', r.post_id,
      'user_id', r.user_id,
      'kind', r.kind,
      'payload', left(r.payload, 2000),
      'created_at', r.created_at
    )
  );
  begin
    perform realtime.send(charge, evenement, 'fil:' || r.post_id, true);
    if auteur ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not public.blocage_entre(auteur, r.user_id) then
      perform realtime.send(charge, evenement, 'user:' || auteur, true);
    end if;
  exception when others then
    raise warning 'diffuser_interaction : poussee sautee (%)', sqlerrm;
  end;
  return null;
end;
$function$;

-- Catalogue : abonne_accepte_non_bloque(text)
CREATE OR REPLACE FUNCTION public.abonne_accepte_non_bloque(_auteur text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- Catalogue : post_masque(text)
CREATE OR REPLACE FUNCTION public.post_masque(p_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.contenus_masques m
     where m.target_type = 'post' and m.target_id = p_id
       and m.decision is distinct from 'retabli'
  );
$function$;

-- Catalogue : refuser_ecriture_compte_en_suppression()
CREATE OR REPLACE FUNCTION public.refuser_ecriture_compte_en_suppression()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;

-- Catalogue : blocage_entre(text,text)
CREATE OR REPLACE FUNCTION public.blocage_entre(_a text, _b text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when _a is null or _b is null or _a = _b then false
    else exists (
      select 1 from public.blocks b
       where (b.blocker_id = _a and b.blocked_id = _b)
          or (b.blocker_id = _b and b.blocked_id = _a)
    )
  end
$function$;

-- Catalogue : posts_marquer_modifie()
CREATE OR REPLACE FUNCTION public.posts_marquer_modifie()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.content is distinct from old.content then
    new.edited_at := pg_catalog.now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $function$;

-- Catalogue : story_visible(text)
CREATE OR REPLACE FUNCTION public.story_visible(_story_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when auth.uid() is null or _story_id is null then false else exists (
    select 1 from public.stories s
     where s.id = _story_id
       and (   s.author_id = (auth.uid())::text
            or (    not exists (select 1 from public.profiles pr where pr.id = s.author_id and pr.is_private = true)
                and not public.is_blocked_with(s.author_id))
            or public.abonne_accepte_non_bloque(s.author_id))
  ) end
$function$;

-- Catalogue : story_est_a_moi(text)
CREATE OR REPLACE FUNCTION public.story_est_a_moi(_story_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when auth.uid() is null or _story_id is null then false else exists (
    select 1 from public.stories s where s.id = _story_id and s.author_id = (auth.uid())::text
  ) end
$function$;

-- Catalogue : rid_opaque_garde()
CREATE OR REPLACE FUNCTION public.rid_opaque_garde()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- `rid` n'appartient qu'à la base. Un INSERT reçoit TOUJOURS une valeur
  -- aléatoire neuve — l'expression du défaut de colonne, recopiée : une valeur
  -- fournie par l'appelant (client, upsert, PostgREST) est ignorée, aucun
  -- appelant ne connaît le rid d'une ligne qu'il ne lit pas. Un UPDATE ne le
  -- change jamais.
  if tg_op = 'INSERT' then
    new.rid := (('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991);
  else
    new.rid := old.rid;
  end if;
  return new;
end
$function$;

-- Catalogue : rate_limit_insert()
CREATE OR REPLACE FUNCTION public.rate_limit_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare user_col text := TG_ARGV[0]; max_per_min int := TG_ARGV[1]::int; uid text;
begin
  NEW.created_at := now();
  execute format('select ($1).%I', user_col) into uid using NEW;
  if uid is null then return NEW; end if;
  perform public.debit_compter(TG_TABLE_NAME, uid, max_per_min);
  return NEW;
end $function$;

-- Catalogue : est_identifiant_exemple(text)
CREATE OR REPLACE FUNCTION public.est_identifiant_exemple(_id text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  -- Le contenu de DÉMONSTRATION que le client fabrique et qu'aucune table ne porte :
  -- `buildSeed()` (app-01) et `getSeedReelPostsWithComments()` (app-05). Publications
  -- p<n>, pm|pp|pv<n>, pn_<thème>_<n>, pac_<thème>, p_ev_<thème>, p_ev<n>_e<n> ;
  -- bobines reel_seed_<thème>_<n> ; activités e<n>. Liste FERMÉE et ancrée :
  -- tests/unit/identifiants-exemple.test.mjs la confronte à buildSeed() et aux
  -- générateurs du contenu réel. Un exemple nouveau qui n'y entre pas a ses
  -- commentaires lisibles par leur seul auteur — le test le dit avant la mise en ligne.
  select coalesce(_id ~ '^(p[0-9]+|p[mpv][0-9]+|pn_[a-z0-9]+_[0-9]+|pac_[a-z]+|p_ev_[a-z]+|p_ev[0-9]+_e[0-9]+|reel_seed_[a-z0-9_]+|e[0-9]+)$', false)
$function$;

-- Catalogue : comment_target_visible(text,text)
CREATE OR REPLACE FUNCTION public.comment_target_visible(cid text, pid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Catalogue : purger_cibles_publications()
CREATE OR REPLACE FUNCTION public.purger_cibles_publications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- Catalogue : purger_cibles_commentaires()
CREATE OR REPLACE FUNCTION public.purger_cibles_commentaires()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- Catalogue : is_blocked_with(text)
CREATE OR REPLACE FUNCTION public.is_blocked_with(_other text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- Catalogue : comment_target_visible(text)
CREATE OR REPLACE FUNCTION public.comment_target_visible(cid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Catalogue : post_is_visible(text)
CREATE OR REPLACE FUNCTION public.post_is_visible(pid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        -- Même règle que la policy restrictive de `posts` : masquée, une publication ne se lit plus
        -- par ses commentaires ni par ses « j'aime », sauf pour son auteur.
        or (not public.post_masque(p.id) and (
              not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
              or public.abonne_accepte_non_bloque(p.author_id)))
      )
    )
  end
$function$;

-- Catalogue : can_edit_post(text)
CREATE OR REPLACE FUNCTION public.can_edit_post(pid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM posts p WHERE p.id = pid AND p.author_id = auth.uid()::text)
      OR EXISTS (SELECT 1 FROM post_collaborators c WHERE c.post_id = pid AND c.user_id = auth.uid()::text);
$function$;

-- Catalogue : ci_epingle_garde()
CREATE OR REPLACE FUNCTION public.ci_epingle_garde()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  moi              text := (auth.uid())::text;
  publication      boolean;
  activite         boolean;
  proprio_pub      text;
  proprio_activite text;
begin
  -- L'administration n'est pas jugée : le rôle « none » d'une migration,
  -- service_role, une restauration ou une purge reprennent des lignes déjà
  -- jugées à leur écriture. Seuls les rôles CLIENTS le sont.
  if coalesce(pg_catalog.current_setting('role', true), 'none') not in ('anon', 'authenticated') then
    return new;
  end if;
  if moi is not null
     and new.user_id is not distinct from moi
     and new.post_id is not null
     and new.payload is not null and new.payload in ('0', '1') then
    -- Le GENRE du fil se lit dans post_id ; le commentaire doit être de CE fil,
    -- dans la table de CE genre. Un identifiant présent dans les DEUX tables de
    -- fils est un fil HOMONYME.
    publication := exists (select 1 from public.posts p where p.id = new.post_id);
    activite := exists (select 1 from public.events e where e.id = new.post_id);
    if publication then
      select p.author_id into proprio_pub from public.posts p
       where p.id = new.post_id
         and exists (select 1 from public.post_comments c
                      where c.id = new.comment_id and c.post_id = new.post_id);
    end if;
    if activite then
      select coalesce(nullif(e.organizer_id, ''), e.author_id) into proprio_activite from public.events e
       where e.id = new.post_id
         and exists (select 1 from public.event_comments ec
                      where ec.id = new.comment_id and ec.event_id = new.post_id);
    end if;
    -- Le propriétaire de CE fil, sur un commentaire de CE fil ; un « 1 » hors
    -- d'un fil homonyme. Un « 0 » n'affiche rien : il passe, homonyme ou non.
    if (proprio_pub is not distinct from moi or proprio_activite is not distinct from moi)
       and (new.payload = '0' or not (publication and activite)) then
      return new;
    end if;
  end if;
  -- UN SEUL REFUS, au mot près, quelle que soit la raison — sans identité, au nom
  -- d'autrui, sans fil, charge invalide, commentaire d'un autre fil ou inconnu,
  -- fil homonyme, appelant qui n'en est pas le propriétaire.
  raise exception 'new row violates row-level security policy for table "comment_interactions"'
    using errcode = '42501',
          hint = 'épingle : réservée au propriétaire du fil, sur un commentaire de ce fil';
end
$function$;

-- Catalogue : posts_freeze_author()
CREATE OR REPLACE FUNCTION public.posts_freeze_author()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    NEW.author_id := OLD.author_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Catalogue : debit_compter(text,text,integer)
CREATE OR REPLACE FUNCTION public.debit_compter(p_table text, p_source text, p_plafond integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v integer;
begin
  insert into public.debit_ecritures as d (minute, table_nom, source, n)
  values (date_trunc('minute', now()), p_table, p_source, 1)
  on conflict (minute, table_nom, source) do update set n = d.n + 1
  returning d.n into v;
  if v > p_plafond then
    raise exception 'rate limit: max % insertions/minute sur %', p_plafond, p_table using errcode = 'P0001';
  end if;
end $function$;

-- Catalogue : debit_par_compte()
CREATE OR REPLACE FUNCTION public.debit_par_compte()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare moi text := (auth.uid())::text;
begin
  if moi is null then return new; end if;
  perform public.debit_compter(tg_table_name, moi, tg_argv[0]::int);
  return new;
end $function$;

-- Catalogue : ligne_bornee()
CREATE OR REPLACE FUNCTION public.ligne_bornee()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if pg_catalog.current_setting('role', true) in ('anon', 'authenticated')
     and pg_catalog.octet_length(pg_catalog.to_jsonb(new)::text) > tg_argv[0]::integer then
    raise exception 'ligne trop volumineuse sur %', tg_table_name using errcode = '22001';
  end if;
  return new;
end $function$;

-- Catalogue : debit_octets_par_compte()
CREATE OR REPLACE FUNCTION public.debit_octets_par_compte()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare moi text := (auth.uid())::text; v integer;
begin
  if moi is null then return new; end if;
  insert into public.debit_ecritures as d (minute, table_nom, source, n)
  values (pg_catalog.date_trunc('minute', pg_catalog.now()), 'octets', moi, pg_catalog.octet_length(pg_catalog.to_jsonb(new)::text))
  on conflict (minute, table_nom, source) do update set n = d.n + excluded.n
  returning d.n into v;
  if v > tg_argv[0]::integer then
    raise exception 'trop de données écrites en une minute' using errcode = 'P0001';
  end if;
  return new;
end $function$;

-- Catalogue : fil_temps_reel_visible(text)
CREATE OR REPLACE FUNCTION public.fil_temps_reel_visible(_fil text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null
     and _fil is not null
     and char_length(_fil) between 1 and 120
     and (
       (exists (select 1 from public.posts p where p.id = _fil) and public.post_is_visible(_fil))
       or exists (select 1 from public.events e where e.id = _fil)
     )
$function$;



-- Catalogue : event_auteur_bloque(text)
CREATE OR REPLACE FUNCTION public.event_auteur_bloque(_event_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.events e
                 where e.id = _event_id and public.is_blocked_with(e.author_id));
$function$;

-- Catalogue : suppression_de_mon_compte()
CREATE OR REPLACE FUNCTION public.suppression_de_mon_compte()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when auth.uid() is null then false
    else exists (select 1 from public.comptes_en_suppression c
                  where c.user_id = (auth.uid())::text and c.statut in ('en_cours','purgee','supprimee'))
      or exists (select 1 from auth.users u
                  where u.id = auth.uid() and u.banned_until is not null and u.banned_until > now())
  end
$function$;

-- Catalogue : is_conv_member(text,text)
CREATE OR REPLACE FUNCTION public.is_conv_member(_conv_id text, _uid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- C-02 / R41 (2026-11-06) : avec une session, l'appartenance ne se lit que
  -- sur l'appelant ; sans session (postgres, service_role, déclencheur hors
  -- requête cliente), inchangée. L'appelant est contrôlé AVANT la lecture : sur
  -- autrui, conv_members n'est pas lu ; et l'égalité vient en tête : les
  -- policies, qui passent l'appelant, n'évaluent auth.uid() qu'une fois.
  -- migrations/migration_discussions_activite_2026-11-06.sql
  select (_uid = (auth.uid())::text or auth.uid() is null)
     and exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid)
$function$;

-- Catalogue : call_partie_prenante(text)
CREATE OR REPLACE FUNCTION public.call_partie_prenante(_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.call_invites ci
     where ci.id = _id and (select auth.uid())::text in (ci.from_id, ci.to_id))
$function$;

-- Catalogue : peut_voir_live(text)
CREATE OR REPLACE FUNCTION public.peut_voir_live(_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.video_lives v
     where v.id = _id
       and (v.author_id = (select auth.uid())::text
            or (v.status = 'live' and not public.is_blocked_with(v.author_id)
                and (not exists (select 1 from public.profiles p where p.id = v.author_id and p.is_private)
                     or public.abonne_accepte_non_bloque(v.author_id)))))
$function$;
set check_function_bodies = on;
