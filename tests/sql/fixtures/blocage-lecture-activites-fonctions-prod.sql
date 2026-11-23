-- Définitions de PRODUCTION (pg_get_functiondef, mesurées le 2026-11-22, staging = production à l'empreinte près)
-- des fonctions que lit ou réécrit migration_blocage_lecture_activites_2026-11-22.sql.
-- NE PAS RETOUCHER À LA MAIN : la garde de la migration compare l'empreinte md5 du corps.

-- comment_target_visible(cid text) md5 f8af90b8f1764d68230301b3544dc988
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

-- comment_target_visible(cid text, pid text) md5 e28dab528fd25c573fa6b5d40a90f1f8
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

-- event_auteur_bloque(_event_id text) md5 620a094a9c3541e21b86e34d65db4696
CREATE OR REPLACE FUNCTION public.event_auteur_bloque(_event_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.events e
                 where e.id = _event_id and public.is_blocked_with(e.author_id));
$function$;

-- fil_temps_reel_visible(_fil text) md5 aaf635132ff283d341791159bf2c273f
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

-- is_blocked_with(_other text) md5 25b7ca8e81031951cb241316f7cfdd64
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

-- post_auteur_bloque(_post_id text) md5 fabfaa9d2e24f8eb0da7e11139232f6d
CREATE OR REPLACE FUNCTION public.post_auteur_bloque(_post_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.posts p
                 where p.id = _post_id and public.is_blocked_with(p.author_id));
$function$;
