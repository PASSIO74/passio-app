-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCAGE ET LECTURE DES ACTIVITÉS — SUITES DE LA RELECTURE ADVERSE (#1017)
-- (2026-11-22, après `migration_blocage_lecture_activites_2026-11-22.sql`,
-- appliquée au staging et en production le même jour)
--
-- `npm run migration:appliquer -- migrations/migration_blocage_lecture_activites_bis_2026-11-22.sql --projet <ref>`
-- (canal ③ d'ADR-012). UNE transaction, REJOUABLE. Le verdict (13 lignes) LÈVE
-- si une seule ligne est en ECHEC : rien n'est alors validé. Aucun prérequis
-- client. PRÉREQUIS SERVEUR : la première migration (garde ci-dessous).
--
-- QUATRE TROUS que la première migration laissait (relecture indépendante de
-- la session « Stratégie de simulation multi-compte », mesurés ici) :
--
-- ① HOMONYMIE (bloquant). `posts.id` n'est borné que par sa forme : Kevin
--    publie un post dont l'identifiant est celui de l'activité de Léa. Dans
--    `comment_target_visible`, la branche « publication » passait AVANT la
--    branche « activité » : `post_is_visible(evt_lea)` disait VRAI (Kevin en
--    est l'auteur), la garde de blocage n'était jamais atteinte. Kevin lisait
--    les réponses de l'activité (`comment_interactions.post_id = evt_lea`) et
--    s'abonnait à `fil:evt_lea` ; à l'inverse, un homonyme d'une publication
--    masquée fermait à Léa le fil de SA propre activité. Désormais l'activité
--    (et le commentaire, d'activité puis de publication) PRIME sur une
--    publication de même identifiant, dans les deux signatures.
-- ② REPARTAGE À DEUX NIVEAUX. Inès partage la carte de l'activité (masquée à
--    Kevin) ; Hugo republie la carte d'Inès : son `shared_data` recopie le
--    TEXTE de la carte (titre, ville, heure — `carteCiteeHTML` l'affiche).
--    La première migration ne regardait que l'AUTEUR de la publication citée.
--    Elle applique désormais à la publication citée la règle entière.
--    (La phrase « le texte stocké du second ne cite que… » de l'en-tête de la
--    première migration était FAUSSE.)
-- ③ FILS DE DISCUSSION. `post_is_visible` ignorait le blocage pour un compte
--    public : sous la carte de Léa (`post_ev_<activité>`), sous une carte,
--    un album ou un repartage masqués, Kevin lisait commentaires, j'aime,
--    interactions, compteurs du fil, et le canal `fil:<publication>`.
--    `post_is_visible` applique désormais la même règle que la lecture de
--    `posts` (aucune autre lecture de ces tables n'est réécrite : toutes
--    passent par elle ou par `comment_target_visible`).
-- ④ L'ORGANISATRICE ne lisait plus ce qu'un compte bloqué avait laissé sur SA
--    propre activité (commentaires, réactions) : elle doit pouvoir le voir pour
--    le modérer. Rendu à l'auteur et à l'organisateur de l'activité.
--
-- UNE DÉFINITION : `publication_masquee_pour_moi(id)` — l'auteur de la
-- publication est en blocage avec moi, OU l'activité qu'elle porte (album,
-- carte) est masquée pour moi, OU la publication qu'elle cite l'est (même
-- règle, un niveau : un repartage de repartage ne recopie que « A partagé une
-- publication de … »). Lue par la policy de `posts`, par `post_is_visible`,
-- donc par `comment_target_visible`, `fil_temps_reel_visible`, `fil_compteurs`
-- et les lectures de `post_comments` / `post_likes` / `comment_interactions`.
-- Elle ne dit rien que `post_auteur_bloque` / `is_blocked_with` ne disent déjà
-- (EXECUTE à authenticated, jamais anon) : pas de nouvel oracle.
--
-- VERROUS. `CREATE POLICY` prend un AccessExclusive sur `posts` et les tables
-- d'activité : `lock_timeout` 3 s, `statement_timeout` 30 s (convention du
-- 2026-11-16) — une table occupée fait ÉCHOUER la migration, elle ne bloque
-- pas le fil.
--
-- TEMPS RÉEL. Aucune table n'est publiée (verdict ⑫) ; la policy
-- `realtime.passio_rt_recevoir_fil` appelle bien `comment_target_visible`
-- (verdict ⑪) : la fermer ici la ferme là.
--
-- RESTE HORS LOT (déclaré) : la lecture anonyme des activités et publications
-- publiques (clé anon seule) ; `participants_compte` (des nombres) ; une
-- notification déjà écrite ; un repartage de repartage (un niveau suffit, voir
-- ②) ; une expression régulière et un `JSON.parse` peuvent diverger sur un
-- `shared_data` forgé à deux clés `id` (le forgeur est l'auteur du post, il ne
-- cache que son propre contenu) ; et un homonyme peut encore REFUSER le canal
-- `fil:<activité>` à l'organisatrice (la clause `NOT post_auteur_bloque(topic)`
-- de `realtime.passio_rt_recevoir_fil`, antérieure à ce lot, lit l'auteur du
-- post homonyme) — un refus, pas une fuite : le client retombe sur son filet.
-- La fermer, c'est réécrire cette policy temps réel, autre lot.
--
-- RETOUR ARRIÈRE (éditeur SQL) — rend l'état laissé par la première migration,
-- octet pour octet (mêmes empreintes que la garde) :
--| begin;
--| set local lock_timeout = '3s';
--| set local statement_timeout = '30s';
--| drop policy if exists posts_lecture_hors_blocage on public.posts;
--| create policy posts_lecture_hors_blocage on public.posts
--|   as restrictive for select to authenticated
--|   using (
--|     author_id = (select auth.uid())::text
--|     or (
--|       not public.is_blocked_with(author_id)
--|       and (event_id is null or not public.activite_masquee_pour_moi(event_id))
--|       and (shared_from_post_id is null or not public.post_auteur_bloque(shared_from_post_id))
--|       and (shared_data is null or not public.activite_masquee_pour_moi(public.activite_de_partage(shared_data)))
--|     )
--|   );
--| drop policy if exists event_comments_lecture_hors_blocage on public.event_comments;
--| create policy event_comments_lecture_hors_blocage on public.event_comments
--|   as restrictive for select to authenticated
--|   using (
--|     author_id = (select auth.uid())::text
--|     or (not public.activite_masquee_pour_moi(event_id) and not public.is_blocked_with(author_id))
--|   );
--| drop policy if exists event_reactions_lecture_hors_blocage on public.event_reactions;
--| create policy event_reactions_lecture_hors_blocage on public.event_reactions
--|   as restrictive for select to authenticated
--|   using (
--|     user_id = (select auth.uid())::text
--|     or (not public.activite_masquee_pour_moi(event_id) and not public.is_blocked_with(user_id))
--|   );
--| CREATE OR REPLACE FUNCTION public.post_is_visible(pid text)
--|  RETURNS boolean
--|  LANGUAGE sql
--|  STABLE SECURITY DEFINER
--|  SET search_path TO 'public'
--| AS $function$
--|   select case
--|     when pid is null then false
--|     -- Pas de ligne posts : PUBLIC seulement pour un identifiant d'EXEMPLE (le contenu de
--|     -- démonstration du client n'est dans aucune table). Une publication SUPPRIMÉE, ou un
--|     -- identifiant inconnu, n'est visible par personne (R31, 2026-11-04 : rendait VRAI).
--|     when not exists (select 1 from posts where id = pid) then public.est_identifiant_exemple(pid)
--|     else exists (
--|       select 1 from posts p
--|       where p.id = pid and (
--|         p.author_id = (select auth.uid())::text
--|         -- Même règle que la policy restrictive de `posts` : masquée, une publication ne se lit plus
--|         -- par ses commentaires ni par ses « j'aime », sauf pour son auteur.
--|         or (not public.post_masque(p.id) and (
--|               not exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_private)
--|               or public.abonne_accepte_non_bloque(p.author_id)))
--|       )
--|     )
--|   end
--| $function$;
--| create or replace function public.comment_target_visible(cid text)
--| returns boolean
--| language sql
--| stable
--| security definer
--| set search_path to 'public'
--| as $function$
--|   -- La CIBLE seule, pour une interaction sans fil (`post_id` nul : aucune ligne aujourd'hui,
--|   -- le client le pose toujours). Avec un fil, comment_target_visible(cid, pid) décide.
--|   select case
--|     when cid is null then false
--|     when exists (select 1 from posts where id = cid)
--|       then public.post_is_visible(cid)
--|     when exists (select 1 from post_comments where id = cid)
--|       then public.post_is_visible((select post_id from post_comments where id = cid limit 1))
--|     -- Un commentaire d'activité : public, sauf pour un compte en blocage avec l'activité (BLOC-ACT, 2026-11-22).
--|     when exists (select 1 from event_comments where id = cid)
--|       then not public.activite_masquee_pour_moi((select event_id from event_comments where id = cid limit 1))
--|     -- Un exemple reste public ; une cible supprimée ou inconnue, personne (R31 : rendait VRAI).
--|     else public.est_identifiant_exemple(cid)
--|   end
--| $function$;
--| create or replace function public.comment_target_visible(cid text, pid text)
--| returns boolean
--| language sql
--| stable
--| security definer
--| set search_path to 'public'
--| as $function$
--|   -- Une interaction se lit comme son FIL : `post_id`, que le client pose toujours — la
--|   -- publication ou l'activité où elle a été écrite. Lui seul rattache une réaction à une
--|   -- RÉPONSE (`comment_id = srep_<date>`, une cible qu'aucune table ne porte).
--|   select case
--|     when pid is null then public.comment_target_visible(cid)
--|     when exists (select 1 from posts where id = pid) then public.post_is_visible(pid)
--|     -- Une activité : publique, sauf pour un compte en blocage avec elle (BLOC-ACT, 2026-11-22).
--|     when exists (select 1 from events where id = pid) then not public.activite_masquee_pour_moi(pid)
--|     -- Un fil d'exemple reste public ; un fil supprimé ou inconnu n'est lisible par personne.
--|     else public.est_identifiant_exemple(pid)
--|   end
--| $function$;
--| drop function if exists public.publication_masquee_pour_moi(text);
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ── Garde : prérequis, et les définitions réécrites sont celles MESURÉES ───
-- (empreintes md5 du corps, CR retirés), ou celles que CE fichier écrit.
do $garde$
declare
  r record;
  n int := 0;
begin
  if to_regprocedure('public.activite_masquee_pour_moi(text)') is null
     or to_regprocedure('public.activite_de_partage(text)') is null
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_lecture_hors_blocage') then
    raise exception 'prérequis absent : appliquer d''abord migration_blocage_lecture_activites_2026-11-22.sql';
  end if;
  for r in
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
           md5(replace(p.prosrc, chr(13), '')) as emp
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname in ('comment_target_visible', 'post_is_visible')
  loop
    n := n + 1;
    if not (
         (r.sig = 'comment_target_visible(cid text, pid text)' and r.emp in ('3cf606d2b4bf8605e403643342c11f5d', 'b61eb2bc938c81d8905ead0253487064'))
      or (r.sig = 'comment_target_visible(cid text)'           and r.emp in ('0d830765c94045194263714b9b7f2bf9', 'e76d020cbc73bc612a486656bd3aa07d'))
      or (r.sig = 'post_is_visible(pid text)'                  and r.emp in ('08d910fbe202c6aaa5e73dce487b6364', '3e3d52b23aac8d5e931d63f4a61288ee'))) then
      raise exception '% a changé depuis la mesure du 2026-11-22 (md5 %) : relire avant de réécrire', r.sig, r.emp;
    end if;
  end loop;
  if n <> 3 then
    raise exception '% définition(s) trouvée(s) parmi comment_target_visible(cid), comment_target_visible(cid, pid), post_is_visible(pid) : 3 attendues', n;
  end if;
end
$garde$;

-- ── Aide : la publication est-elle masquée pour l'appelant ? ───────────────
-- SECURITY DEFINER : `posts` est filtrée pour l'appelant, `blocks` ne lui
-- montre que SES blocages. FAUX sans compte, pour un identifiant nul ou
-- inconnu, et pour l'auteur de la publication. La publication CITÉE est jugée
-- par la même règle, écrite sur ses colonnes (un niveau).
create or replace function public.publication_masquee_pour_moi(p_post_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_post_id is not null and exists (
    select 1 from public.posts p
     where p.id = p_post_id
       and p.author_id is distinct from (select auth.uid())::text
       and (
         public.is_blocked_with(p.author_id)
         or (p.event_id is not null and public.activite_masquee_pour_moi(p.event_id))
         or (p.shared_data is not null and public.activite_masquee_pour_moi(public.activite_de_partage(p.shared_data)))
         or (p.shared_from_post_id is not null and exists (
               select 1 from public.posts c
                where c.id = p.shared_from_post_id
                  and c.author_id is distinct from (select auth.uid())::text
                  and (
                    public.is_blocked_with(c.author_id)
                    or (c.event_id is not null and public.activite_masquee_pour_moi(c.event_id))
                    or (c.shared_data is not null and public.activite_masquee_pour_moi(public.activite_de_partage(c.shared_data)))
                  )))
       )
  )
$$;
comment on function public.publication_masquee_pour_moi(text) is
  'La publication (son auteur, l''activité qu''elle porte, ou la publication qu''elle cite) est-elle en blocage avec l''appelant ? FAUX pour son auteur et sans compte. Ne dit rien que post_auteur_bloque / is_blocked_with ne disent déjà (BLOC-ACT bis, 2026-11-22).';
revoke execute on function public.publication_masquee_pour_moi(text) from public, anon;
grant execute on function public.publication_masquee_pour_moi(text) to authenticated, service_role;

-- ── posts : une seule règle, celle de l'aide ───────────────────────────────
drop policy if exists posts_lecture_hors_blocage on public.posts;
create policy posts_lecture_hors_blocage on public.posts
  as restrictive for select to authenticated
  using (
    author_id = (select auth.uid())::text
    or not public.publication_masquee_pour_moi(id)
  );

-- ── event_comments / event_reactions : l'auteur et l'organisateur de
-- l'activité lisent ce qu'on y a laissé, bloqué compris (modération) ───────
drop policy if exists event_comments_lecture_hors_blocage on public.event_comments;
create policy event_comments_lecture_hors_blocage on public.event_comments
  as restrictive for select to authenticated
  using (
    author_id = (select auth.uid())::text
    or exists (select 1 from public.events e where e.id = event_comments.event_id
                and (e.author_id = (select auth.uid())::text or e.organizer_id = (select auth.uid())::text))
    or (not public.activite_masquee_pour_moi(event_id) and not public.is_blocked_with(author_id))
  );
drop policy if exists event_reactions_lecture_hors_blocage on public.event_reactions;
create policy event_reactions_lecture_hors_blocage on public.event_reactions
  as restrictive for select to authenticated
  using (
    user_id = (select auth.uid())::text
    or exists (select 1 from public.events e where e.id = event_reactions.event_id
                and (e.author_id = (select auth.uid())::text or e.organizer_id = (select auth.uid())::text))
    or (not public.activite_masquee_pour_moi(event_id) and not public.is_blocked_with(user_id))
  );

-- ── post_is_visible : la même règle que la lecture de `posts` ──────────────
-- Corps identique à la définition mesurée, sauf la ligne marquée BLOC-ACT bis.
create or replace function public.post_is_visible(pid text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
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
            and not public.publication_masquee_pour_moi(p.id))
      )
    )
  end
$function$;

-- ── comment_target_visible : l'activité D'ABORD (homonymie) ────────────────
-- Corps identiques à la première migration, sauf les lignes marquées BLOC-ACT bis.
create or replace function public.comment_target_visible(cid text, pid text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- Une interaction se lit comme son FIL : `post_id`, que le client pose toujours — la
  -- publication ou l'activité où elle a été écrite. Lui seul rattache une réaction à une
  -- RÉPONSE (`comment_id = srep_<date>`, une cible qu'aucune table ne porte).
  select case
    when pid is null then public.comment_target_visible(cid)
    -- Une activité : publique, sauf pour un compte en blocage avec elle (BLOC-ACT, 2026-11-22).
    -- Elle PRIME sur une publication de même identifiant : `posts.id` est libre, un homonyme
    -- ouvrait le fil de l'activité à un bloqué, ou le fermait à l'organisatrice (BLOC-ACT bis).
    when exists (select 1 from events where id = pid) then not public.activite_masquee_pour_moi(pid)
    when exists (select 1 from posts where id = pid) then public.post_is_visible(pid)
    -- Un fil d'exemple reste public ; un fil supprimé ou inconnu n'est lisible par personne.
    else public.est_identifiant_exemple(pid)
  end
$function$;

create or replace function public.comment_target_visible(cid text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- La CIBLE seule, pour une interaction sans fil (`post_id` nul : aucune ligne aujourd'hui,
  -- le client le pose toujours). Avec un fil, comment_target_visible(cid, pid) décide.
  select case
    when cid is null then false
    -- Un commentaire d'activité : public, sauf pour un compte en blocage avec l'activité (BLOC-ACT, 2026-11-22).
    -- Les commentaires PRIMENT sur une publication de même identifiant (`posts.id` est libre :
    -- un homonyme ouvrait ou fermait la cible à tort — BLOC-ACT bis).
    when exists (select 1 from event_comments where id = cid)
      then not public.activite_masquee_pour_moi((select event_id from event_comments where id = cid limit 1))
    when exists (select 1 from post_comments where id = cid)
      then public.post_is_visible((select post_id from post_comments where id = cid limit 1))
    when exists (select 1 from posts where id = cid)
      then public.post_is_visible(cid)
    -- Un exemple reste public ; une cible supprimée ou inconnue, personne (R31 : rendait VRAI).
    else public.est_identifiant_exemple(cid)
  end
$function$;

-- ── Verdict : il LÈVE sur la moindre ligne en ECHEC ────────────────────────
create temp table _verdict_bloc_act_bis on commit drop as
select 1 as n, '① publication_masquee_pour_moi : security definer, search_path vide, FAUX sans compte' as controle,
       case when exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.publication_masquee_pour_moi(text)')
                          and p.prosecdef and p.proconfig @> array['search_path=""'])
             and not public.publication_masquee_pour_moi(null) then 'OK' else 'ECHEC' end as verdict
union all
select 2, '② publication_masquee_pour_moi : authenticated oui, anon non',
       case when has_function_privilege('authenticated', 'public.publication_masquee_pour_moi(text)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.publication_masquee_pour_moi(text)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select 3, '③ posts : une seule règle restrictive, par publication_masquee_pour_moi',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts_lecture_hors_blocage'
                          and permissive='RESTRICTIVE' and cmd='SELECT' and roles = '{authenticated}' and qual like '%publication_masquee_pour_moi(id)%') then 'OK' else 'ECHEC' end
union all
select 4, '④ event_comments / event_reactions : auteur et organisateur de l''activité lisent tout',
       case when (select count(*) from pg_policies where schemaname='public' and tablename in ('event_comments','event_reactions')
                   and policyname like '%_lecture_hors_blocage' and permissive='RESTRICTIVE' and roles = '{authenticated}'
                   and qual like '%organizer_id%' and qual like '%activite_masquee_pour_moi(event_id)%') = 2 then 'OK' else 'ECHEC' end
union all
select 5, '⑤ post_is_visible : applique publication_masquee_pour_moi, droits anon conservés',
       case when pg_get_functiondef('public.post_is_visible(text)'::regprocedure) like '%and not public.publication_masquee_pour_moi(p.id)%'
             and has_function_privilege('anon', 'public.post_is_visible(text)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select 6, '⑥ comment_target_visible(cid, pid) : la branche activité passe AVANT la branche publication',
       case when position('when exists (select 1 from events where id = pid) then not public.activite_masquee_pour_moi(pid)' in pg_get_functiondef('public.comment_target_visible(text,text)'::regprocedure))
                 between 1 and position('when exists (select 1 from posts where id = pid)' in pg_get_functiondef('public.comment_target_visible(text,text)'::regprocedure))
             then 'OK' else 'ECHEC' end
union all
select 7, '⑦ comment_target_visible(cid) : les branches commentaire passent AVANT la branche publication',
       case when position('then public.post_is_visible((select post_id from post_comments where id = cid limit 1))' in pg_get_functiondef('public.comment_target_visible(text)'::regprocedure))
                 between 1 and position('when exists (select 1 from posts where id = cid)' in pg_get_functiondef('public.comment_target_visible(text)'::regprocedure))
             then 'OK' else 'ECHEC' end
union all
select 8, '⑧ les aides appelées par les policies sont exécutables par authenticated',
       case when has_function_privilege('authenticated', 'public.is_blocked_with(text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.post_auteur_bloque(text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.activite_masquee_pour_moi(text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.activite_de_partage(text)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select 9, '⑨ les policies de la première migration sont toujours là (events, event_attendees)',
       case when (select count(*) from pg_policies where schemaname='public' and tablename in ('events','event_attendees')
                   and policyname like '%_lecture_hors_blocage' and permissive='RESTRICTIVE') = 2 then 'OK' else 'ECHEC' end
union all
select 10, '⑩ lectures de post_comments / post_likes / comment_interactions : toujours par post_is_visible / comment_target_visible',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='post_comments' and cmd='SELECT' and qual like '%post_is_visible(post_id)%')
             and exists (select 1 from pg_policies where schemaname='public' and tablename='post_likes' and cmd='SELECT' and qual like '%post_is_visible(post_id)%')
             and exists (select 1 from pg_policies where schemaname='public' and tablename='comment_interactions' and cmd='SELECT' and qual like '%comment_target_visible(comment_id, post_id)%')
             then 'OK' else 'ECHEC' end
union all
select 11, '⑪ temps réel : realtime.passio_rt_recevoir_fil passe par comment_target_visible',
       case when exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='passio_rt_recevoir_fil'
                          and qual like '%fil:%' and qual like '%comment_target_visible(NULL::text, substr(realtime.topic(), 5))%') then 'OK' else 'ECHEC' end
union all
select 12, '⑫ aucune de ces tables n''est publiée en temps réel',
       case when not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'
                              and tablename in ('events','event_attendees','event_comments','event_reactions','posts','post_comments','post_likes','comment_interactions')) then 'OK' else 'ECHEC' end
union all
select 13, '⑬ la lecture publique des activités reste ouverte (permissive d''origine intacte)',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='Lecture publique' and qual = 'true') then 'OK' else 'ECHEC' end;

do $verdict$
declare echecs text;
begin
  select string_agg(controle, ' ; ' order by n) into echecs from _verdict_bloc_act_bis where verdict <> 'OK';
  if echecs is not null then
    raise exception 'VERDICT EN ECHEC — rien n''est validé : %', echecs;
  end if;
end
$verdict$;

select controle, verdict from _verdict_bloc_act_bis order by n;

commit;
