-- ═══════════════════════════════════════════════════════════════════════════
-- UN COMPTE BLOQUÉ NE LIT PLUS LES ACTIVITÉS DE CELUI QUI L'A BLOQUÉ
-- (village à 10 comptes, contrôle B3, 2026-11-22)
--
-- `npm run migration:appliquer -- migrations/migration_blocage_lecture_activites_2026-11-22.sql --projet <ref>`
-- (canal ③ d'ADR-012), ou un copier-coller dans l'éditeur SQL. UNE transaction,
-- REJOUABLE, tableau de verdict en fin (10 lignes). Aucun prérequis client.
--
-- LE DÉFAUT. Mesuré par `tests/e2e/village-10-comptes.spec.js` (B3) sur le
-- staging : Léa bloque Kevin (`blockUser`), Kevin appelle `supaLoadEvents()` et
-- trouve l'activité de Léa — titre, lieu, heure du rendez-vous. Bloquer ne
-- fermait que des ÉCRITURES (commentaire, réaction, inscription : six policies
-- INSERT via `post_auteur_bloque`/`event_auteur_bloque`) et, côté client, le
-- profil (PRO-C20, `_profilIndisponiblePourMoi`). Les LECTURES restaient
-- ouvertes : `events` (« Lecture publique » = true), `event_comments` et
-- `event_reactions` (true), les publications de l'autre (compte public), et
-- la carte « A partagé une activité » qu'un TIERS republie (`shared_data`
-- porte la ville et la date ; `content` aussi).
--
-- LA RÈGLE. Une policy RESTRICTIVE de lecture, `TO authenticated`, par table :
-- une ligne dont l'auteur, ou l'activité visée, est en blocage AVEC l'appelant
-- (dans un sens ou dans l'autre) n'est plus lue. Ses propres lignes, toujours.
-- « L'activité est en blocage avec moi » = son AUTEUR ou son ORGANISATEUR l'est
-- (comme `rencontres_prive.bloque`), et je n'en suis ni l'auteur ni
-- l'organisateur — UNE définition, `activite_masquee_pour_moi(id)`, lue partout.
-- (La contrainte `events_organisateur_est_auteur`, validée en production, rend
-- aujourd'hui l'organisateur égal à l'auteur ou nul : la branche organisateur
-- est une défense en profondeur, qui tient si cette contrainte tombe.)
--   · events          — la même règle, écrite sur les colonnes de la ligne
--   · event_attendees — l'activité (l'organisatrice voit tous ses inscrits)
--   · event_comments  — l'activité, ou l'auteur du commentaire
--   · event_reactions — l'activité, ou l'auteur de la réaction
--   · posts           — l'auteur ; l'activité (`event_id`, album) ; la
--                       publication citée (`shared_from_post_id`) ; l'activité
--                       d'une carte de partage (`shared_data`, kind = event)
--   · comment_interactions (commentaires d'activité, `post_id` = l'activité)
--     et le canal temps réel `fil:<activité>` : via `comment_target_visible`,
--     dont la branche « activité » rendait VRAI sans condition.
-- RESTRICTIVE : elle s'AJOUTE aux policies existantes sans les réécrire, et se
-- retire d'un `drop policy`. `TO authenticated` seulement : un visiteur n'a pas
-- d'identité, donc pas de blocage, et les aides de blocage ne sont pas
-- exécutables par `anon` (une policy `to public` ferait lever 42501 à chaque
-- visiteur).
--
-- AUCUN NOUVEL ORACLE. `activite_masquee_pour_moi(id)` dit ce que
-- `is_blocked_with(auteur)` et `is_blocked_with(organisateur)` disent déjà
-- (EXECUTE à authenticated, jamais anon ; R40 hors lot). `activite_de_partage`
-- est PURE : elle lit un texte, jamais une table. Aucune liste « qui m'a
-- bloqué » n'est exposée.
--
-- PERFORMANCE. `is_blocked_with` sonde `blocks` par sa clé primaire
-- (blocker_id, blocked_id) dans les DEUX sens (les deux colonnes sont
-- fournies) : pas d'index à ajouter. Mesuré au staging : ~40 µs par appel. Le
-- coût est de un à quatre appels par ligne lue, sur des lectures bornées
-- (`limit 60` pour les activités, pages du fil pour les publications).
--
-- TEMPS RÉEL (R25/R37). Aucune de ces tables n'est dans `supabase_realtime`
-- (mesuré le 2026-11-22, production et staging : publication VIDE). Le seul
-- canal concerné est la diffusion `fil:<id>`, que `passio_rt_recevoir_fil`
-- garde par `comment_target_visible` : corrigé ici.
--
-- CE QUE LA MIGRATION NE FAIT PAS (déclaré, hors lot) :
--   · un VISITEUR (anon) lit toujours les activités publiques, colonnes
--     publiques comprises (`venue`, `lat`, `lng`, `date_at`) : il suffit de se
--     déconnecter, ou d'appeler l'API avec la seule clé anon. Bloquer ferme
--     l'APPLICATION au bloqué, ce n'est pas une frontière contre quelqu'un qui
--     insiste — le même cas que le profil public. La fermer demande de retirer
--     la lecture anonyme des activités : décision produit, pas ce lot.
--   · les CO-organisateurs (`co_organizers`) ne masquent pas une activité
--     (comme `rencontres_prive.bloque` et `blocage_pose`).
--   · `participants_compte` (nombre d'inscrits, SECURITY DEFINER) répond sur un
--     identifiant d'activité : des NOMBRES, pas un lieu.
--   · une notification déjà écrite (« t'invite à <titre> ») garde son texte.
--   · un repartage d'un repartage ne remonte pas à l'original (un seul niveau,
--     le texte stocké du second ne cite que « A partagé une publication de … »).
--   · `post_comments`/`post_likes` des publications d'un compte bloqué restent
--     lisibles par `post_is_visible` (les publications, elles, ne le sont plus).
--
-- RETOUR ARRIÈRE (éditeur SQL) — rend les définitions mesurées en production et
-- au staging le 2026-11-22, octet pour octet (mêmes empreintes que la garde) :
--| begin;
--| drop policy if exists events_lecture_hors_blocage on public.events;
--| drop policy if exists event_attendees_lecture_hors_blocage on public.event_attendees;
--| drop policy if exists event_comments_lecture_hors_blocage on public.event_comments;
--| drop policy if exists event_reactions_lecture_hors_blocage on public.event_reactions;
--| drop policy if exists posts_lecture_hors_blocage on public.posts;
--| CREATE OR REPLACE FUNCTION public.comment_target_visible(cid text)
--|  RETURNS boolean
--|  LANGUAGE sql
--|  STABLE SECURITY DEFINER
--|  SET search_path TO 'public'
--| AS $function$
--|   -- La CIBLE seule, pour une interaction sans fil (`post_id` nul : aucune ligne aujourd'hui,
--|   -- le client le pose toujours). Avec un fil, comment_target_visible(cid, pid) décide.
--|   select case
--|     when cid is null then false
--|     when exists (select 1 from posts where id = cid)
--|       then public.post_is_visible(cid)
--|     when exists (select 1 from post_comments where id = cid)
--|       then public.post_is_visible((select post_id from post_comments where id = cid limit 1))
--|     -- Un commentaire d'activité : public, comme `event_comments` (lecture : true).
--|     when exists (select 1 from event_comments where id = cid) then true
--|     -- Un exemple reste public ; une cible supprimée ou inconnue, personne (R31 : rendait VRAI).
--|     else public.est_identifiant_exemple(cid)
--|   end
--| $function$;
--| CREATE OR REPLACE FUNCTION public.comment_target_visible(cid text, pid text)
--|  RETURNS boolean
--|  LANGUAGE sql
--|  STABLE SECURITY DEFINER
--|  SET search_path TO 'public'
--| AS $function$
--|   -- Une interaction se lit comme son FIL : `post_id`, que le client pose toujours — la
--|   -- publication ou l'activité où elle a été écrite. Lui seul rattache une réaction à une
--|   -- RÉPONSE (`comment_id = srep_<date>`, une cible qu'aucune table ne porte).
--|   select case
--|     when pid is null then public.comment_target_visible(cid)
--|     when exists (select 1 from posts where id = pid) then public.post_is_visible(pid)
--|     -- Une activité : publique, comme `events` et `event_comments`.
--|     when exists (select 1 from events where id = pid) then true
--|     -- Un fil d'exemple reste public ; un fil supprimé ou inconnu n'est lisible par personne.
--|     else public.est_identifiant_exemple(pid)
--|   end
--| $function$;
--| drop function if exists public.activite_masquee_pour_moi(text);
--| drop function if exists public.activite_de_partage(text);
--| commit;
-- (Les droits EXECUTE de `comment_target_visible` ne changent pas : CREATE OR
-- REPLACE les conserve.)
-- ═══════════════════════════════════════════════════════════════════════════
begin;

-- ── Garde : les deux `comment_target_visible` sont celles MESURÉES ─────────
-- (empreinte md5 du corps, CR retirés : la production porte parfois du CRLF),
-- ou celles que CE fichier écrit (rejeu). Toute autre version arrête tout :
-- elle a changé depuis la mesure, il faut la relire avant de la réécrire.
do $garde$
declare
  r record;
  n int := 0;
begin
  for r in
    select pg_get_function_identity_arguments(p.oid) as args,
           md5(replace(p.prosrc, chr(13), '')) as emp
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = 'comment_target_visible'
  loop
    n := n + 1;
    if not (
         (r.args = 'cid text, pid text' and r.emp in ('e28dab528fd25c573fa6b5d40a90f1f8', '3cf606d2b4bf8605e403643342c11f5d'))
      or (r.args = 'cid text'           and r.emp in ('f8af90b8f1764d68230301b3544dc988', '0d830765c94045194263714b9b7f2bf9'))) then
      raise exception 'comment_target_visible(%) a changé depuis la mesure du 2026-11-22 (md5 %) : relire avant de réécrire', r.args, r.emp;
    end if;
  end loop;
  if n <> 2 then
    raise exception 'comment_target_visible : % signature(s) trouvée(s), 2 attendues (cid) et (cid, pid)', n;
  end if;
end
$garde$;

-- ── Aide : l'activité est-elle en blocage avec l'appelant ? ────────────────
-- SECURITY DEFINER : `events` est désormais filtrée pour l'appelant, et
-- `blocks` ne lui montre que SES blocages — il faut lire les deux en entier.
-- FAUX sans compte, pour un identifiant nul ou inconnu, et pour l'auteur ou
-- l'organisateur de l'activité.
create or replace function public.activite_masquee_pour_moi(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_event_id is not null and exists (
    select 1 from public.events e
     where e.id = p_event_id
       and e.author_id is distinct from (select auth.uid())::text
       and e.organizer_id is distinct from (select auth.uid())::text
       and (public.is_blocked_with(e.author_id)
            or (e.organizer_id is not null and e.organizer_id is distinct from e.author_id
                and public.is_blocked_with(e.organizer_id)))
  )
$$;
comment on function public.activite_masquee_pour_moi(text) is
  'L''auteur ou l''organisateur de cette activité est-il en blocage avec l''appelant (et l''appelant n''en est ni l''auteur ni l''organisateur) ? FAUX sans compte. Ne dit rien que is_blocked_with ne dise déjà (BLOC-ACT, 2026-11-22).';
revoke execute on function public.activite_masquee_pour_moi(text) from public, anon;
grant execute on function public.activite_masquee_pour_moi(text) to authenticated, service_role;

-- ── Aide PURE : l'activité qu'une carte de partage désigne ─────────────────
-- `shared_data` est un TEXTE (JSON sérialisé par le client) : un cast en jsonb
-- lèverait sur une ligne mal formée et ferait échouer TOUTE la lecture du fil.
-- Une expression régulière ne lève jamais. NULL si ce n'est pas une carte
-- d'activité (`"kind":"event"`).
create or replace function public.activite_de_partage(p_shared_data text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_shared_data is null or p_shared_data !~ '"kind"\s*:\s*"event"' then null
    else substring(p_shared_data from '"id"\s*:\s*"([^"\\]{1,200})"')
  end
$$;
comment on function public.activite_de_partage(text) is
  'Identifiant de l''activité désignée par une carte de partage (posts.shared_data, kind = event), NULL sinon. Pure : ne lit aucune table (BLOC-ACT, 2026-11-22).';
revoke execute on function public.activite_de_partage(text) from public, anon;
grant execute on function public.activite_de_partage(text) to authenticated, service_role;

-- ── events ─────────────────────────────────────────────────────────────────
-- La règle d'`activite_masquee_pour_moi`, écrite sur les colonnes de la ligne
-- (pas de seconde lecture de `events` pour chaque activité lue).
drop policy if exists events_lecture_hors_blocage on public.events;
create policy events_lecture_hors_blocage on public.events
  as restrictive for select to authenticated
  using (
    author_id = (select auth.uid())::text
    or organizer_id = (select auth.uid())::text
    or (
      not public.is_blocked_with(author_id)
      and (organizer_id is null or organizer_id = author_id or not public.is_blocked_with(organizer_id))
    )
  );

-- ── event_attendees ────────────────────────────────────────────────────────
drop policy if exists event_attendees_lecture_hors_blocage on public.event_attendees;
create policy event_attendees_lecture_hors_blocage on public.event_attendees
  as restrictive for select to authenticated
  using (
    user_id = (select auth.uid())::text
    or not public.activite_masquee_pour_moi(event_id)
  );

-- ── event_comments ─────────────────────────────────────────────────────────
drop policy if exists event_comments_lecture_hors_blocage on public.event_comments;
create policy event_comments_lecture_hors_blocage on public.event_comments
  as restrictive for select to authenticated
  using (
    author_id = (select auth.uid())::text
    or (not public.activite_masquee_pour_moi(event_id) and not public.is_blocked_with(author_id))
  );

-- ── event_reactions ────────────────────────────────────────────────────────
drop policy if exists event_reactions_lecture_hors_blocage on public.event_reactions;
create policy event_reactions_lecture_hors_blocage on public.event_reactions
  as restrictive for select to authenticated
  using (
    user_id = (select auth.uid())::text
    or (not public.activite_masquee_pour_moi(event_id) and not public.is_blocked_with(user_id))
  );

-- ── posts ──────────────────────────────────────────────────────────────────
drop policy if exists posts_lecture_hors_blocage on public.posts;
create policy posts_lecture_hors_blocage on public.posts
  as restrictive for select to authenticated
  using (
    author_id = (select auth.uid())::text
    or (
      not public.is_blocked_with(author_id)
      and (event_id is null or not public.activite_masquee_pour_moi(event_id))
      and (shared_from_post_id is null or not public.post_auteur_bloque(shared_from_post_id))
      and (shared_data is null or not public.activite_masquee_pour_moi(public.activite_de_partage(shared_data)))
    )
  );

-- ── comment_target_visible : la branche « activité » suit le blocage ───────
-- Corps identiques aux définitions mesurées, sauf les lignes marquées BLOC-ACT.
-- `activite_masquee_pour_moi` rend FAUX sans compte : un visiteur lit comme avant.
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
    when exists (select 1 from posts where id = pid) then public.post_is_visible(pid)
    -- Une activité : publique, sauf pour un compte en blocage avec elle (BLOC-ACT, 2026-11-22).
    when exists (select 1 from events where id = pid) then not public.activite_masquee_pour_moi(pid)
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
    when exists (select 1 from posts where id = cid)
      then public.post_is_visible(cid)
    when exists (select 1 from post_comments where id = cid)
      then public.post_is_visible((select post_id from post_comments where id = cid limit 1))
    -- Un commentaire d'activité : public, sauf pour un compte en blocage avec l'activité (BLOC-ACT, 2026-11-22).
    when exists (select 1 from event_comments where id = cid)
      then not public.activite_masquee_pour_moi((select event_id from event_comments where id = cid limit 1))
    -- Un exemple reste public ; une cible supprimée ou inconnue, personne (R31 : rendait VRAI).
    else public.est_identifiant_exemple(cid)
  end
$function$;

-- ── Verdict ────────────────────────────────────────────────────────────────
select '① events : policy restrictive de lecture, authenticated, auteur ET organisateur' as controle,
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='events_lecture_hors_blocage'
                          and permissive='RESTRICTIVE' and cmd='SELECT' and roles = '{authenticated}' and qual like '%is_blocked_with(author_id)%'
                          and qual like '%is_blocked_with(organizer_id)%') then 'OK' else 'ECHEC' end as verdict
union all
select '② event_attendees : idem, par activite_masquee_pour_moi',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='event_attendees' and policyname='event_attendees_lecture_hors_blocage'
                          and permissive='RESTRICTIVE' and cmd='SELECT' and roles = '{authenticated}' and qual like '%activite_masquee_pour_moi(event_id)%') then 'OK' else 'ECHEC' end
union all
select '③ event_comments : l''activité ET l''auteur du commentaire',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='event_comments' and policyname='event_comments_lecture_hors_blocage'
                          and permissive='RESTRICTIVE' and cmd='SELECT' and roles = '{authenticated}' and qual like '%activite_masquee_pour_moi(event_id)%'
                          and qual like '%is_blocked_with(author_id)%') then 'OK' else 'ECHEC' end
union all
select '④ event_reactions : l''activité ET l''auteur de la réaction',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='event_reactions' and policyname='event_reactions_lecture_hors_blocage'
                          and permissive='RESTRICTIVE' and cmd='SELECT' and roles = '{authenticated}' and qual like '%activite_masquee_pour_moi(event_id)%'
                          and qual like '%is_blocked_with(user_id)%') then 'OK' else 'ECHEC' end
union all
select '⑤ posts : auteur, album, publication citée, carte de partage d''activité',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts_lecture_hors_blocage'
                          and permissive='RESTRICTIVE' and cmd='SELECT' and roles = '{authenticated}' and qual like '%is_blocked_with(author_id)%'
                          and qual like '%activite_masquee_pour_moi(event_id)%' and qual like '%post_auteur_bloque(shared_from_post_id)%'
                          and qual like '%activite_de_partage(shared_data)%') then 'OK' else 'ECHEC' end
union all
select '⑥ activite_masquee_pour_moi : security definer, search_path vide, FAUX sans compte',
       case when exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.activite_masquee_pour_moi(text)')
                          and p.prosecdef and p.proconfig @> array['search_path=""'])
             and not public.activite_masquee_pour_moi(null) then 'OK' else 'ECHEC' end
union all
select '⑦ activite_de_partage : pure, extrait l''activité d''une carte, NULL ailleurs',
       case when public.activite_de_partage('{"kind":"event","id":"evt_abc-1","title":"x"}') = 'evt_abc-1'
             and public.activite_de_partage('{"id":"post_1","text":"x"}') is null
             and public.activite_de_partage('pas du json {') is null
             and public.activite_de_partage(null) is null
             and exists (select 1 from pg_proc where oid = to_regprocedure('public.activite_de_partage(text)') and provolatile = 'i' and not prosecdef)
             then 'OK' else 'ECHEC' end
union all
select '⑧ les deux aides neuves : authenticated oui, anon non',
       case when has_function_privilege('authenticated', 'public.activite_de_partage(text)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.activite_de_partage(text)', 'EXECUTE')
             and has_function_privilege('authenticated', 'public.activite_masquee_pour_moi(text)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.activite_masquee_pour_moi(text)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select '⑨ comment_target_visible : la branche activité suit le blocage (les deux signatures), droits anon conservés',
       case when pg_get_functiondef('public.comment_target_visible(text,text)'::regprocedure) like '%then not public.activite_masquee_pour_moi(pid)%'
             and pg_get_functiondef('public.comment_target_visible(text)'::regprocedure) like '%then not public.activite_masquee_pour_moi((select event_id from event_comments%'
             and has_function_privilege('anon', 'public.comment_target_visible(text,text)', 'EXECUTE') then 'OK' else 'ECHEC' end
union all
select '⑩ les permissives d''origine sont intactes (lecture publique des activités, aucune table publiée en temps réel)',
       case when exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='Lecture publique' and qual = 'true')
             and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'
                              and tablename in ('events','event_attendees','event_comments','event_reactions','posts')) then 'OK' else 'ECHEC' end;

commit;
