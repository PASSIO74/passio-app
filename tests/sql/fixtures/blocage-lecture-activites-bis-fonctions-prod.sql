-- Définition de PRODUCTION de post_is_visible (pg_get_functiondef, mesurée le 2026-11-22 ; staging identique)
-- que réécrit migration_blocage_lecture_activites_bis_2026-11-22.sql.
-- NE PAS RETOUCHER À LA MAIN : la garde de la migration compare l'empreinte md5 du corps.

-- post_is_visible(pid text) md5 08d910fbe202c6aaa5e73dce487b6364
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
