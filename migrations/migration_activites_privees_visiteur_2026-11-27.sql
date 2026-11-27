-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVITÉS PRIVÉES — LE VISITEUR AUSSI DANS `post_is_visible`
-- (2026-11-27, après `migration_activites_privees_restes_2026-11-27.sql`,
-- appliquée en staging et en production le même jour)
--
-- `npm run migration:appliquer -- migrations/migration_activites_privees_visiteur_2026-11-27.sql --projet <ref>`
-- (canal ③ d'ADR-012). UNE transaction, REJOUABLE. Le verdict LÈVE si une
-- seule ligne est en ECHEC. AUCUN PRÉREQUIS CLIENT.
--
-- LE DÉFAUT (revue de sécurité automatique du même jour) : les restrictives
-- « visiteur » de la migration des restes ferment les LECTURES DIRECTES de
-- `posts`, `post_comments`, `post_likes`, `comment_interactions`. Mais
-- `interactions_cibles`, `fil_compteurs` et `comment_target_visible` sont
-- SECURITY DEFINER et EXÉCUTABLES PAR ANON : elles contournent la RLS et
-- jugent par `post_is_visible`, qui ignorait la règle. Un visiteur relisait
-- ainsi réponses, réactions, aperçus de commentaires et compteurs d'un album
-- d'activité privée.
--
-- LE REMÈDE : la règle entre dans `post_is_visible` — la porte que tous ces
-- lecteurs partagent (et la RLS de `post_comments`, `post_likes`,
-- `comment_interactions`, `comment_likes`) : SANS COMPTE, une publication qui
-- porte ou cite une activité privée n'est pas visible. Définition de
-- production du 2026-11-27, une ligne de plus. Un compte n'est pas concerné
-- (`publication_masquee_pour_moi` le couvre déjà). Ferme aussi le reste déclaré
-- des « j'aime » de commentaire (`comment_likes` → `comment_target_visible`).
-- ═══════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $garde$
begin
  if to_regprocedure('public.publication_privee_pour_visiteur(text)') is null then
    raise exception 'activites_privees_visiteur : la migration des restes (migration_activites_privees_restes_2026-11-27.sql) n''est pas appliquée';
  end if;
  -- La définition remplacée doit être celle qu'on a lue en production : sinon on écraserait une évolution.
  -- (rejouable : la définition d'avant OU celle-ci, toutes deux portent le blocage)
  if pg_get_functiondef('public.post_is_visible(text)'::regprocedure) not like '%and not public.publication_masquee_pour_moi(p.id)%' then
    raise exception 'activites_privees_visiteur : post_is_visible n''a pas la définition attendue (BLOC-ACT bis) — relire la production avant de la remplacer';
  end if;
end
$garde$;

create or replace function public.post_is_visible(pid text)
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
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
              or public.abonne_accepte_non_bloque(p.author_id))
            -- Ni en blocage avec moi, ni portant ou citant ce qui l'est (BLOC-ACT bis, 2026-11-22).
            and not public.publication_masquee_pour_moi(p.id)
            -- Sans compte : ni portant ni citant une activité PRIVÉE (2026-11-27).
            and not ((select auth.uid()) is null and public.publication_privee_pour_visiteur(p.id)))
      )
    )
  end
$function$;

-- ── VERDICT ─────────────────────────────────────────────────────────────────
create temp table _verdict_activites_privees_visiteur on commit drop as
select * from (values
  (1, 'post_is_visible applique la règle du visiteur',
     pg_get_functiondef('public.post_is_visible(text)'::regprocedure) like '%auth.uid()) is null and public.publication_privee_pour_visiteur(p.id)%'),
  (2, 'post_is_visible garde le blocage et le masquage',
     pg_get_functiondef('public.post_is_visible(text)'::regprocedure) like '%publication_masquee_pour_moi(p.id)%'
     and pg_get_functiondef('public.post_is_visible(text)'::regprocedure) like '%post_masque(p.id)%'
     and pg_get_functiondef('public.post_is_visible(text)'::regprocedure) like '%est_identifiant_exemple(pid)%'),
  (3, 'post_is_visible reste SECURITY DEFINER',
     exists (select 1 from pg_proc where oid = 'public.post_is_visible(text)'::regprocedure and prosecdef))
) as v(n, controle, ok_bool);

alter table _verdict_activites_privees_visiteur add column verdict text;
update _verdict_activites_privees_visiteur set verdict = case when ok_bool then 'OK' else 'ECHEC' end;
select n, controle, verdict from _verdict_activites_privees_visiteur order by n;

do $verdict$
begin
  if exists (select 1 from _verdict_activites_privees_visiteur where verdict <> 'OK') then
    raise exception 'activites_privees_visiteur : verdict en ECHEC — rien n''est validé (%)',
      (select string_agg(n::text || ' ' || controle, ' ; ') from _verdict_activites_privees_visiteur where verdict <> 'OK');
  end if;
end
$verdict$;

commit;
