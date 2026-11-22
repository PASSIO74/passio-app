-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCAGE ET LECTURE DES ACTIVITÉS — SUITES DE LA RELECTURE ADVERSE (#1017)
-- (2026-11-22, après `migration_blocage_lecture_activites_2026-11-22.sql`,
-- appliquée au staging et en production le même jour)
--
-- `npm run migration:appliquer -- migrations/migration_blocage_lecture_activites_bis_2026-11-22.sql --projet <ref>`
-- (canal ③ d'ADR-012). UNE transaction, REJOUABLE. Le verdict (14 lignes) LÈVE
-- si une seule ligne est en ECHEC : rien n'est alors validé. Aucun prérequis
-- client. PRÉREQUIS SERVEUR : la première migration (garde ci-dessous).
--
-- CE N'EST PAS UNE RÉGRESSION. Avant la première migration, un compte bloqué
-- lisait déjà TOUT ; celle-ci ferme ce que la première laissait ouvert.
--
-- QUATRE TROUS (relecture indépendante de la session « Stratégie de
-- simulation multi-compte », deux tours, mesurés ici) :
--
-- ① HOMONYMIE (bloquant, RV-45). Les identifiants de `posts`, `events`,
--    `post_comments` et `event_comments` sont CHOISIS par le client et ne sont
--    bornés que par leur forme. Or `comment_target_visible` et
--    `fil_temps_reel_visible` devinent le TYPE d'une cible d'après la table
--    où son identifiant existe. Un homonyme forgé y entre donc par la porte
--    de l'autre table : Kevin publie un post à l'identifiant de l'activité de
--    Léa et lit ses réponses (et `diffuser_interaction` les lui pousse sur
--    `user:<Kevin>`) ; Z crée une ACTIVITÉ à l'identifiant d'une publication
--    privée et l'ouvre à tous. Changer l'ordre des branches ne fait que
--    retourner le trou (premier essai de cette bis, refusé en relecture).
--    LE REMÈDE : il n'y a plus d'homonyme. Un déclencheur refuse, à
--    l'insertion et au changement d'identifiant, tout identifiant déjà
--    présent dans l'une des trois autres tables, sous un verrou consultatif
--    pris par les deux côtés (deux insertions concurrentes ne passent pas).
--    Mesuré le 2026-11-22 : 0 homonyme en production comme au staging ; la
--    garde le revérifie. `comment_target_visible` n'est PAS réécrite :
--    sans homonyme, son ordre d'origine (#951 : la publication avant
--    l'activité) est juste.
-- ② REPARTAGE À DEUX NIVEAUX. Hugo republie la carte d'Inès, qui partage
--    l'activité de Léa : son `shared_data` recopie le TEXTE de la carte
--    (titre, ville, heure). La première migration ne regardait que l'AUTEUR
--    de la publication citée ; elle applique désormais la règle entière à la
--    publication citée. (La phrase « le texte stocké du second ne cite
--    que… » de l'en-tête de la première migration était FAUSSE.)
-- ③ FILS DE DISCUSSION. `post_is_visible` ignorait le blocage pour un compte
--    public : sous la carte de Léa (`post_ev_<activité>`), sous une carte, un
--    album ou un repartage masqués, Kevin lisait commentaires, j'aime,
--    interactions, compteurs (`fil_compteurs`) et le canal `fil:`. Elle
--    applique désormais la même règle que la lecture de `posts`.
-- ④ L'ORGANISATRICE ne lisait plus ce qu'un compte bloqué avait laissé sur SA
--    propre activité : elle doit pouvoir le voir pour le modérer.
--
-- UNE DÉFINITION : `publication_masquee_pour_moi(id)` — l'auteur est en
-- blocage avec moi, OU l'activité portée (album, carte) est masquée pour moi,
-- OU la publication citée l'est (même règle, un niveau : un repartage de
-- repartage ne recopie que « A partagé une publication de … »). FAUX d'emblée
-- sans compte (aucun coût pour un visiteur). Lue par la policy de `posts` et
-- par `post_is_visible` — donc par `comment_target_visible`,
-- `fil_temps_reel_visible`, `fil_compteurs` et les lectures de
-- `post_comments` / `post_likes` / `comment_interactions` / `comment_likes`.
-- Elle ne dit rien que `post_auteur_bloque` / `is_blocked_with` ne disent déjà
-- (EXECUTE à authenticated, jamais anon) : pas de nouvel oracle.
--
-- VERROUS. `CREATE POLICY` / `CREATE TRIGGER` prennent un verrou fort sur
-- `posts`, `events` et les commentaires : `lock_timeout` 3 s,
-- `statement_timeout` 30 s — une table occupée fait ÉCHOUER la migration.
--
-- TEMPS RÉEL. Aucune table n'est publiée (verdict ⑫) ; la policy
-- `realtime.passio_rt_recevoir_fil` passe par `comment_target_visible`
-- (verdict ⑪) : sans homonyme, la règle qui la ferme ici la ferme là.
--
-- RESTE HORS LOT (déclaré) :
--   · la lecture ANONYME des activités et publications publiques (clé anon) ;
--   · une carte CITÉE SUPPRIMÉE : `shared_from_post_id` n'a pas de clé
--     étrangère, et le repost de Hugo garde le texte recopié de la carte
--     d'Inès. Une fois cette carte supprimée, rien ne relie plus le repost à
--     l'activité de Léa : il redevient lisible par Kevin. Le fermer demande
--     de neutraliser `shared_data` des repartages à la suppression de
--     l'original — changement de produit (village A24), autre lot ;
--   · `participants_compte` (des nombres) ; une notification déjà écrite ;
--   · une expression régulière et un `JSON.parse` peuvent diverger sur un
--     `shared_data` forgé à deux clés `id` (le forgeur est l'auteur du post,
--     il ne cache que son propre contenu) ;
--   · les identifiants ne sont pas FIGÉS à l'UPDATE (seul `post_comments`
--     l'est déjà) : un changement d'identifiant reste possible, mais jamais
--     vers un homonyme.
--
-- RETOUR ARRIÈRE (éditeur SQL) — GARDÉ (il refuse si l'état en place n'est
-- pas celui que cette bis écrit), rend l'état laissé par la première
-- migration, octet pour octet :
--| begin;
--| set local lock_timeout = '3s';
--| set local statement_timeout = '30s';
--| do $retour$
--| begin
--|   if to_regprocedure('public.publication_masquee_pour_moi(text)') is null
--|      or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.post_is_visible(text)'::regprocedure) <> '3e3d52b23aac8d5e931d63f4a61288ee' then
--|     raise exception 'retour arrière refusé : l''état en place n''est pas celui qu''écrit la bis (post_is_visible ou publication_masquee_pour_moi)';
--|   end if;
--| end
--| $retour$;
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
--| drop trigger if exists aa_identifiant_sans_homonyme on public.posts;
--| drop trigger if exists aa_identifiant_sans_homonyme on public.events;
--| drop trigger if exists aa_identifiant_sans_homonyme on public.post_comments;
--| drop trigger if exists aa_identifiant_sans_homonyme on public.event_comments;
--| drop function if exists public.identifiant_sans_homonyme();
--| drop function if exists public.publication_masquee_pour_moi(text);
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ── Garde : prérequis, définitions mesurées, et aucun homonyme ─────────────
do $garde$
declare
  r record;
  n int := 0;
  h int;
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
         -- comment_target_visible : celles de la première migration, que cette bis NE réécrit PAS.
         (r.sig = 'comment_target_visible(cid text, pid text)' and r.emp = '3cf606d2b4bf8605e403643342c11f5d')
      or (r.sig = 'comment_target_visible(cid text)'           and r.emp = '0d830765c94045194263714b9b7f2bf9')
      or (r.sig = 'post_is_visible(pid text)'                  and r.emp in ('08d910fbe202c6aaa5e73dce487b6364', '3e3d52b23aac8d5e931d63f4a61288ee'))) then
      raise exception '% a changé depuis la mesure du 2026-11-22 (md5 %) : relire avant de réécrire', r.sig, r.emp;
    end if;
  end loop;
  if n <> 3 then
    raise exception '% définition(s) trouvée(s) parmi comment_target_visible(cid), comment_target_visible(cid, pid), post_is_visible(pid) : 3 attendues', n;
  end if;
  select count(*) into h from (
    select id from (select id from public.posts union all select id from public.events
                    union all select id from public.post_comments union all select id from public.event_comments) t
     group by id having count(*) > 1) d;
  if h > 0 then
    raise exception '% identifiant(s) homonyme(s) entre posts, events, post_comments et event_comments : les résoudre avant de poser le déclencheur', h;
  end if;
end
$garde$;

-- ── ① Plus d'homonyme entre les quatre tables ──────────────────────────────
-- SECURITY DEFINER : la ligne homonyme peut être invisible à l'appelant (une
-- publication privée), et c'est justement celle-là qu'il faut voir.
-- Verrou consultatif sur l'identifiant, pris par les quatre tables : deux
-- insertions concurrentes du même identifiant dans deux tables se
-- sérialisent, la seconde voit la première (nouvel instantané par requête).
create or replace function public.identifiant_sans_homonyme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.id is not distinct from old.id then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('passio:identifiant:' || new.id, 0));
  if (tg_table_name <> 'posts'          and exists (select 1 from public.posts          where id = new.id))
  or (tg_table_name <> 'events'         and exists (select 1 from public.events         where id = new.id))
  or (tg_table_name <> 'post_comments'  and exists (select 1 from public.post_comments  where id = new.id))
  or (tg_table_name <> 'event_comments' and exists (select 1 from public.event_comments where id = new.id)) then
    raise exception using errcode = '23505',
      message = 'identifiant déjà utilisé par une autre publication, activité ou commentaire',
      hint = 'BLOC-ACT bis : un identifiant est unique entre posts, events, post_comments et event_comments (RV-45).';
  end if;
  return new;
end
$$;
comment on function public.identifiant_sans_homonyme() is
  'Refuse un identifiant déjà présent dans posts, events, post_comments ou event_comments (RV-45 : comment_target_visible et fil_temps_reel_visible devinent le type d''une cible d''après sa table). BLOC-ACT bis, 2026-11-22.';
revoke execute on function public.identifiant_sans_homonyme() from public, anon, authenticated;

drop trigger if exists aa_identifiant_sans_homonyme on public.posts;
create trigger aa_identifiant_sans_homonyme before insert or update of id on public.posts
  for each row execute function public.identifiant_sans_homonyme();
drop trigger if exists aa_identifiant_sans_homonyme on public.events;
create trigger aa_identifiant_sans_homonyme before insert or update of id on public.events
  for each row execute function public.identifiant_sans_homonyme();
drop trigger if exists aa_identifiant_sans_homonyme on public.post_comments;
create trigger aa_identifiant_sans_homonyme before insert or update of id on public.post_comments
  for each row execute function public.identifiant_sans_homonyme();
drop trigger if exists aa_identifiant_sans_homonyme on public.event_comments;
create trigger aa_identifiant_sans_homonyme before insert or update of id on public.event_comments
  for each row execute function public.identifiant_sans_homonyme();

-- ── ② ③ La publication est-elle masquée pour l'appelant ? ──────────────────
-- SECURITY DEFINER : `posts` est filtrée pour l'appelant, `blocks` ne lui
-- montre que SES blocages. FAUX d'emblée sans compte, pour un identifiant nul
-- ou inconnu, et pour l'auteur. La publication CITÉE est jugée par la même
-- règle, écrite sur ses colonnes (un niveau).
create or replace function public.publication_masquee_pour_moi(p_post_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and p_post_id is not null and exists (
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
  'La publication (son auteur, l''activité qu''elle porte, ou la publication qu''elle cite) est-elle en blocage avec l''appelant ? FAUX sans compte et pour son auteur. Ne dit rien que post_auteur_bloque / is_blocked_with ne disent déjà (BLOC-ACT bis, 2026-11-22).';
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

-- ── ④ event_comments / event_reactions : l'auteur et l'organisateur de
-- l'activité lisent ce qu'on y a laissé, bloqué compris (modération). Par
-- `events` lue sous la RLS de l'appelant (ses propres activités), pas par
-- `organise_activite`, qui compterait un co-organisateur bloqué.
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

-- ── ③ post_is_visible : la même règle que la lecture de `posts` ────────────
-- Corps identique à la définition mesurée, sauf les lignes marquées BLOC-ACT bis.
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

-- ── Verdict : il LÈVE sur la moindre ligne en ECHEC ────────────────────────
create temp table _verdict_bloc_act_bis on commit drop as
select 1 as n, '① publication_masquee_pour_moi : security definer, search_path vide, FAUX sans compte (identifiant réel)' as controle,
       case when exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.publication_masquee_pour_moi(text)')
                          and p.prosecdef and p.proconfig @> array['search_path=""'])
             and (select auth.uid()) is null
             and not public.publication_masquee_pour_moi(coalesce((select id from public.posts limit 1), 'aucun'))
             then 'OK' else 'ECHEC' end as verdict
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
select 6, '⑥ le déclencheur anti-homonyme est posé sur les QUATRE tables (insertion et changement d''identifiant)',
       case when (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                   where c.relnamespace = 'public'::regnamespace and c.relname in ('posts','events','post_comments','event_comments')
                     and t.tgname = 'aa_identifiant_sans_homonyme' and t.tgenabled = 'O'
                     and t.tgfoid = 'public.identifiant_sans_homonyme()'::regprocedure) = 4 then 'OK' else 'ECHEC' end
union all
select 7, '⑦ aucun homonyme entre posts, events, post_comments, event_comments',
       case when not exists (select id from (select id from public.posts union all select id from public.events
                                              union all select id from public.post_comments union all select id from public.event_comments) t
                              group by id having count(*) > 1) then 'OK' else 'ECHEC' end
union all
select 8, '⑧ les aides appelées par les policies sont exécutables par authenticated ; le déclencheur par personne',
       case when has_function_privilege('authenticated', 'public.is_blocked_with(text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.post_auteur_bloque(text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.activite_masquee_pour_moi(text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.activite_de_partage(text)', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.identifiant_sans_homonyme()', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select 9, '⑨ les policies de la première migration sont toujours là (events, event_attendees)',
       case when (select count(*) from pg_policies where schemaname='public' and tablename in ('events','event_attendees')
                   and policyname like '%_lecture_hors_blocage' and permissive='RESTRICTIVE') = 2 then 'OK' else 'ECHEC' end
union all
select 10, '⑩ lectures de post_comments / post_likes / comment_interactions / comment_likes : toujours par post_is_visible / comment_target_visible',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='post_comments' and cmd='SELECT' and qual like '%post_is_visible(post_id)%')
             and exists (select 1 from pg_policies where schemaname='public' and tablename='post_likes' and cmd='SELECT' and qual like '%post_is_visible(post_id)%')
             and exists (select 1 from pg_policies where schemaname='public' and tablename='comment_interactions' and cmd='SELECT' and qual like '%comment_target_visible(comment_id, post_id)%')
             and exists (select 1 from pg_policies where schemaname='public' and tablename='comment_likes' and cmd='SELECT' and qual like '%comment_target_visible(comment_id)%')
             then 'OK' else 'ECHEC' end
union all
select 11, '⑪ temps réel : realtime.passio_rt_recevoir_fil passe par comment_target_visible',
       case when exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='passio_rt_recevoir_fil'
                          and qual like '%fil:%' and qual like '%comment_target_visible(NULL::text, substr(realtime.topic(), 5))%') then 'OK' else 'ECHEC' end
union all
select 12, '⑫ aucune de ces tables n''est publiée en temps réel',
       case when not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'
                              and tablename in ('events','event_attendees','event_comments','event_reactions','posts','post_comments','post_likes','comment_interactions','comment_likes')) then 'OK' else 'ECHEC' end
union all
select 13, '⑬ comment_target_visible n''est pas réécrite (ordre de #951 : la publication avant l''activité)',
       case when (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.comment_target_visible(text,text)'::regprocedure) = '3cf606d2b4bf8605e403643342c11f5d'
             and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.comment_target_visible(text)'::regprocedure) = '0d830765c94045194263714b9b7f2bf9'
             then 'OK' else 'ECHEC' end
union all
select 14, '⑭ la lecture publique des activités reste ouverte (permissive d''origine intacte)',
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
