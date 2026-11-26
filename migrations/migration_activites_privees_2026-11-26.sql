-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVITÉS PRIVÉES — UNE INVITATION CIBLÉE N'EST PLUS UNE ANNONCE PUBLIQUE
-- (2026-11-26, demande de Benjamin : « il faut que l'on puisse faire une
-- invitation ciblée et privée »)
--
-- `npm run migration:appliquer -- migrations/migration_activites_privees_2026-11-26.sql --projet <ref>`
-- (canal ③ d'ADR-012). UNE transaction, REJOUABLE. Le verdict LÈVE si une
-- seule ligne est en ECHEC : rien n'est alors validé. AUCUN PRÉREQUIS CLIENT :
-- la colonne naît à « publique », le client d'avant ne la lit ni ne l'écrit.
-- C'est le client NEUF qui exige cette migration (il lit `visibilite`) : elle
-- part AVANT lui.
--
-- LE CONSTAT (mesuré en production le 2026-11-26) : `events` porte la policy
-- « Lecture publique » (`true`, rôle public). Une activité créée depuis une
-- conversation pour UNE personne (« Anniversaire chez Léa ») était lisible par
-- tout compte et tout visiteur, sur la carte de Rencontrer comme par l'API.
-- La case « Publier aussi dans le fil » ne réglait que la CARTE du fil.
--
-- LE MODÈLE :
--   · `events.visibilite` ∈ {'publique','privee'}, défaut 'publique' ;
--   · `event_invites (event_id, user_id)` : la liste des invités, écrite par
--     l'organisation (auteur, organisateur, co-organisateurs), lisible par
--     l'organisation et, ligne par ligne, par l'invité LUI-MÊME — personne ne
--     voit la liste des autres invités ;
--   · UNE autorité : `activite_privee_fermee_pour_moi(id)` — VRAI si l'activité
--     est privée et que l'appelant n'est ni de l'organisation, ni invité, ni
--     déjà inscrit (une ligne `event_attendees` à lui, qu'il n'a pu écrire
--     qu'en étant admis). VRAI pour un visiteur sans compte.
--
-- OÙ ELLE S'APPLIQUE :
--   ① lecture de `events` : deux policies RESTRICTIVES (anon : publique
--     seulement ; compte : publique OU admis) ;
--   ② `activite_masquee_pour_moi` (le masquage du blocage, BLOC-ACT) devient
--     « blocage OU privée fermée ». C'est la même porte que lisent déjà, sans
--     être réécrites : la lecture de `event_attendees`, `event_comments`,
--     `event_reactions` (comptes), `comment_target_visible` (donc
--     `comment_interactions`, `interactions_cibles`, `fil_temps_reel` et la
--     policy temps réel `passio_rt_recevoir_fil`) et
--     `publication_masquee_pour_moi` (carte du fil, album, repartage d'une
--     activité privée) ;
--   ③ lecture ANONYME de `event_comments` / `event_reactions` (policy `true`
--     au rôle public) : restrictive, l'activité doit être publique ;
--   ④ ÉCRITURE : s'inscrire, commenter, réagir sur une activité privée
--     fermée est refusé (restrictive INSERT/UPDATE) — sans quoi « s'inscrire »
--     ouvrirait la lecture à n'importe qui connaissant l'identifiant (C-04 :
--     une policy qui s'ouvre sur un état que l'appelant écrit lui-même n'est
--     pas une frontière) ;
--   ⑤ `participants_compte` (SECURITY DEFINER) ne compte plus une activité
--     privée fermée.
--
-- RESTE HORS LOT (déclaré) :
--   · `notes_evenement` rend la moyenne des notes d'un identifiant connu (des
--     nombres, après l'activité) ;
--   · une notification déjà écrite (« t'invite à <titre> ») reste chez son
--     destinataire — elle n'est écrite que pour un invité ;
--   · un visiteur SANS COMPTE lit les publications publiques : un album relié
--     à une activité privée par son auteur reste lisible sans compte (le
--     client ne publie jamais la carte d'une activité privée) ;
--   · retirer une invitation ne retire pas une inscription déjà faite.
--
-- VERROUS : `lock_timeout` 3 s, `statement_timeout` 30 s — une table occupée
-- fait ÉCHOUER la migration, elle ne fige pas la production.
--
-- RETOUR ARRIÈRE (à la main, dans une transaction) :
--   drop policy events_privee_lecture_anon on public.events;
--   drop policy events_privee_lecture_compte on public.events;
--   drop policy event_comments_privee_lecture_anon on public.event_comments;
--   drop policy event_reactions_privee_lecture_anon on public.event_reactions;
--   drop policy event_attendees_privee_ecriture on public.event_attendees;
--   drop policy event_attendees_privee_modification on public.event_attendees;
--   drop policy event_comments_privee_ecriture on public.event_comments;
--   drop policy event_reactions_privee_ecriture on public.event_reactions;
--   puis recréer `activite_masquee_pour_moi` et `participants_compte` à leur
--   définition d'avant (citée en clair ci-dessous, sans la ligne « privée ») ;
--   la colonne et la table peuvent rester (inertes sans les policies).
-- ═══════════════════════════════════════════════════════════════════════════
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- ── GARDES : l'état de départ attendu ───────────────────────────────────────
do $garde$
begin
  if to_regprocedure('public.activite_masquee_pour_moi(text)') is null
     or to_regprocedure('public.organise_activite(text)') is null
     or to_regprocedure('public.is_blocked_with(text)') is null
     or to_regprocedure('public.suppression_de_mon_compte()') is null
     or to_regprocedure('public.participants_compte(text[])') is null
     or to_regclass('public.notifications') is null then
    raise exception 'activites_privees : une aide attendue manque (activite_masquee_pour_moi, organise_activite, is_blocked_with, suppression_de_mon_compte, participants_compte)';
  end if;
end
$garde$;

-- ── ① LA COLONNE ────────────────────────────────────────────────────────────
alter table public.events add column if not exists visibilite text not null default 'publique';
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_visibilite_valeur'
                  and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_visibilite_valeur
      check (visibilite in ('publique', 'privee'));
  end if;
end
$c$;
-- Lecture par COLONNE (les colonnes de `events` sont accordées une à une :
-- `address`, `contact`, `conv_id` ne le sont pas à tous). L'écriture passe par
-- le privilège de table INSERT/UPDATE déjà accordé à `authenticated`.
grant select (visibilite) on public.events to anon, authenticated;

-- ── ② LES INVITÉS ───────────────────────────────────────────────────────────
-- Les deux bouts sont des PROFILS, en cascade : la purge d'un compte supprime
-- son profil, et ses invitations (reçues comme envoyées) partent avec lui —
-- même règle que `story_likes` (exception déclarée dans
-- `scripts/audit-tables-compte.js`), sans toucher la barrière de suppression.
create table if not exists public.event_invites (
  event_id   text not null references public.events(id) on delete cascade,
  user_id    text not null references public.profiles(id) on delete cascade,
  invited_by text not null default (auth.uid())::text references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_invites_user_idx on public.event_invites (user_id);
alter table public.event_invites enable row level security;
revoke all on public.event_invites from public, anon, authenticated;
grant select, insert, delete on public.event_invites to authenticated;
grant all on public.event_invites to service_role;

drop policy if exists event_invites_lecture on public.event_invites;
create policy event_invites_lecture on public.event_invites
  for select to authenticated
  using (user_id = (select auth.uid())::text or public.organise_activite(event_id));

drop policy if exists event_invites_ecriture on public.event_invites;
create policy event_invites_ecriture on public.event_invites
  for insert to authenticated
  with check (
    invited_by = (select auth.uid())::text
    and user_id is distinct from (select auth.uid())::text
    and user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.organise_activite(event_id)
    and not public.is_blocked_with(user_id)
    and not public.suppression_de_mon_compte()
  );

drop policy if exists event_invites_retrait on public.event_invites;
create policy event_invites_retrait on public.event_invites
  for delete to authenticated
  using (user_id = (select auth.uid())::text or public.organise_activite(event_id));

-- ── ③ L'AUTORITÉ ────────────────────────────────────────────────────────────
create or replace function public.activite_privee_fermee_pour_moi(p_event_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_event_id is not null and exists (
    select 1 from public.events e
     where e.id = p_event_id
       and e.visibilite = 'privee'
       and not coalesce((select auth.uid()) is not null and (
             e.author_id = (select auth.uid())::text
          or e.organizer_id = (select auth.uid())::text
          or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array'
              and e.co_organizers ? (select auth.uid())::text)
          or exists (select 1 from public.event_invites i
                      where i.event_id = e.id and i.user_id = (select auth.uid())::text)
          or exists (select 1 from public.event_attendees a
                      where a.event_id = e.id and a.user_id = (select auth.uid())::text)
       ), false)
  )
$$;
revoke all on function public.activite_privee_fermee_pour_moi(text) from public, anon;
grant execute on function public.activite_privee_fermee_pour_moi(text) to authenticated, service_role;

-- Définition d'avant (BLOC-ACT, 2026-11-22) + la ligne « privée fermée ».
create or replace function public.activite_masquee_pour_moi(p_event_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_event_id is not null and (
    exists (
      select 1 from public.events e
       where e.id = p_event_id
         and e.author_id is distinct from (select auth.uid())::text
         and e.organizer_id is distinct from (select auth.uid())::text
         and (public.is_blocked_with(e.author_id)
              or (e.organizer_id is not null and e.organizer_id is distinct from e.author_id
                  and public.is_blocked_with(e.organizer_id)))
    )
    or public.activite_privee_fermee_pour_moi(p_event_id)
  )
$$;

-- ── ④ LECTURE DE `events` ───────────────────────────────────────────────────
drop policy if exists events_privee_lecture_anon on public.events;
create policy events_privee_lecture_anon on public.events
  as restrictive for select to anon
  using (visibilite = 'publique');

drop policy if exists events_privee_lecture_compte on public.events;
create policy events_privee_lecture_compte on public.events
  as restrictive for select to authenticated
  using (visibilite = 'publique' or not public.activite_privee_fermee_pour_moi(id));

-- ── ⑤ LECTURE ANONYME DES COMMENTAIRES ET RÉACTIONS ─────────────────────────
-- Sous le rôle anon, la sous-requête lit `events` SOUS SA RLS : une activité
-- privée n'y existe pas.
drop policy if exists event_comments_privee_lecture_anon on public.event_comments;
create policy event_comments_privee_lecture_anon on public.event_comments
  as restrictive for select to anon
  using (exists (select 1 from public.events e where e.id = event_comments.event_id and e.visibilite = 'publique'));

drop policy if exists event_reactions_privee_lecture_anon on public.event_reactions;
create policy event_reactions_privee_lecture_anon on public.event_reactions
  as restrictive for select to anon
  using (exists (select 1 from public.events e where e.id = event_reactions.event_id and e.visibilite = 'publique'));

-- ── ⑥ ÉCRITURES ─────────────────────────────────────────────────────────────
drop policy if exists event_attendees_privee_ecriture on public.event_attendees;
create policy event_attendees_privee_ecriture on public.event_attendees
  as restrictive for insert to authenticated
  with check (not public.activite_privee_fermee_pour_moi(event_id));

drop policy if exists event_attendees_privee_modification on public.event_attendees;
create policy event_attendees_privee_modification on public.event_attendees
  as restrictive for update to authenticated
  using (true)
  with check (not public.activite_privee_fermee_pour_moi(event_id));

drop policy if exists event_comments_privee_ecriture on public.event_comments;
create policy event_comments_privee_ecriture on public.event_comments
  as restrictive for insert to authenticated
  with check (not public.activite_privee_fermee_pour_moi(event_id));

drop policy if exists event_reactions_privee_ecriture on public.event_reactions;
create policy event_reactions_privee_ecriture on public.event_reactions
  as restrictive for insert to authenticated
  with check (not public.activite_privee_fermee_pour_moi(event_id));

-- ── ⑦ COMPTEURS ─────────────────────────────────────────────────────────────
create or replace function public.participants_compte(p_event_ids text[])
returns table (event_id text, going integer, maybe integer, waitlist integer, checked_in integer)
language sql stable security definer set search_path = ''
as $$
  select a.event_id,
    count(*) filter (where coalesce(a.rsvp, 'going') not in ('maybe','waitlist','declined'))::int,
    count(*) filter (where a.rsvp = 'maybe')::int,
    count(*) filter (where a.rsvp = 'waitlist')::int,
    count(*) filter (where a.checked_in_at is not null)::int
  from public.event_attendees a where auth.uid() is not null
    and a.event_id = any(p_event_ids[1:200])
    and not public.activite_privee_fermee_pour_moi(a.event_id)
  group by a.event_id
$$;

-- ── ⑧ NOTIFICATION D'INVITATION ─────────────────────────────────────────────
-- Trouvé en contre-revue : `notifications_texte_serveur` écrit LUI-MÊME le
-- titre de l'activité (« t'invite à <b>titre</b> ») et
-- `notifications_preuve_evenement` n'exige, pour `event_invite`, qu'un
-- abonnement accepté entre l'émetteur et le destinataire. Un compte qui
-- connaît l'identifiant d'une activité privée se faisait donc envoyer son
-- titre par un second compte. Pour une activité PRIVÉE, une invitation venue
-- d'un client n'est acceptée que de l'ORGANISATION, vers un compte INVITÉ
-- (`event_invites`). Les lignes du serveur ne passent pas ici.
create or replace function public.notifications_invite_privee_garde()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- ⚠️ L'ORIGINE SE LIT AU RÉGLAGE, JAMAIS DANS LA COLONNE DE LA LIGNE : les déclencheurs
  -- partent par ordre alphabétique, et celui-ci passe AVANT
  -- `trg_notifications_origine` — la colonne est encore celle que le CLIENT a
  -- envoyée. Un `origine = 'serveur'` forgé sautait la garde, puis l'origine
  -- était réécrite à 'client' et le titre ajouté (revue de sécurité du
  -- 2026-11-26). Même règle que `notifications_origine`.
  if new.kind is distinct from 'event_invite'
     or current_setting('passio.notification_serveur', true) = '1'
     or auth.uid() is null then
    return new;
  end if;
  if exists (select 1 from public.events e where e.id = new.ref_id and e.visibilite = 'privee')
     and not (
       public.organise_activite(new.ref_id)
       and new.from_id = (select auth.uid())::text
       and exists (select 1 from public.event_invites i where i.event_id = new.ref_id and i.user_id = new.user_id)
     ) then
    raise exception 'invitation à une activité privée hors de son organisation' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function public.notifications_invite_privee_garde() from public, anon, authenticated;
drop trigger if exists trg_notifications_invite_privee on public.notifications;
-- INSERT seulement : le destinataire MARQUE LUE sa notification (UPDATE), et
-- le client n'a de droit d'écriture que sur `seen` (GRANT de colonne).
create trigger trg_notifications_invite_privee
  before insert on public.notifications
  for each row execute function public.notifications_invite_privee_garde();

-- ── VERDICT ─────────────────────────────────────────────────────────────────
create temp table _verdict_activites_privees on commit drop as
select * from (values
  (1, 'events.visibilite : colonne, défaut publique, contrainte',
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events'
              and column_name = 'visibilite' and column_default like '''publique''%' and is_nullable = 'NO')
     and exists (select 1 from pg_constraint where conname = 'events_visibilite_valeur')),
  (2, 'events.visibilite lisible par anon et authenticated',
     has_column_privilege('anon', 'public.events', 'visibilite', 'select')
     and has_column_privilege('authenticated', 'public.events', 'visibilite', 'select')),
  (3, 'event_invites : RLS active, rien pour anon',
     (select relrowsecurity from pg_class where oid = 'public.event_invites'::regclass)
     and not has_table_privilege('anon', 'public.event_invites', 'select')
     and not has_table_privilege('anon', 'public.event_invites', 'insert')),
  (4, 'event_invites : pas de policy UPDATE, ni de privilège UPDATE',
     not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_invites' and cmd in ('UPDATE','ALL'))
     and not has_table_privilege('authenticated', 'public.event_invites', 'update')),
  (5, 'event_invites : trois policies (lecture, écriture, retrait)',
     (select count(*) from pg_policies where schemaname = 'public' and tablename = 'event_invites') = 3),
  (6, 'activite_privee_fermee_pour_moi : SECURITY DEFINER, search_path figé, pas pour anon',
     exists (select 1 from pg_proc where oid = 'public.activite_privee_fermee_pour_moi(text)'::regprocedure
              and prosecdef and proconfig @> array['search_path=""'])
     and not has_function_privilege('anon', 'public.activite_privee_fermee_pour_moi(text)', 'execute')),
  (7, 'activite_masquee_pour_moi lit la privée fermée',
     pg_get_functiondef('public.activite_masquee_pour_moi(text)'::regprocedure) like '%activite_privee_fermee_pour_moi%'),
  (8, 'participants_compte lit la privée fermée',
     pg_get_functiondef('public.participants_compte(text[])'::regprocedure) like '%activite_privee_fermee_pour_moi%'),
  (9, 'events : deux lectures RESTRICTIVES (anon, compte)',
     (select count(*) from pg_policies where schemaname = 'public' and tablename = 'events' and permissive = 'RESTRICTIVE'
       and policyname in ('events_privee_lecture_anon','events_privee_lecture_compte')) = 2),
  (10, 'commentaires et réactions : lecture anonyme restreinte',
     (select count(*) from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'
       and policyname in ('event_comments_privee_lecture_anon','event_reactions_privee_lecture_anon')) = 2),
  (11, 'inscription, commentaire, réaction : écriture restreinte',
     (select count(*) from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'
       and policyname in ('event_attendees_privee_ecriture','event_attendees_privee_modification',
                          'event_comments_privee_ecriture','event_reactions_privee_ecriture')) = 4),
  (12, 'la lecture par blocage passe toujours par activite_masquee_pour_moi',
     exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_attendees'
              and policyname = 'event_attendees_lecture_hors_blocage' and qual like '%activite_masquee_pour_moi%')
     and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_comments'
              and policyname = 'event_comments_lecture_hors_blocage' and qual like '%activite_masquee_pour_moi%')),
  (13, 'aucune activité existante n''est devenue privée',
     not exists (select 1 from public.events where visibilite <> 'publique')
     or exists (select 1 from public.event_invites)),
  (15, 'event_invites : trois clés étrangères en cascade (activité, invité, auteur)',
     (select count(*) from pg_constraint where conrelid = 'public.event_invites'::regclass
       and contype = 'f' and confdeltype = 'c') = 3),
  (16, 'notifications : la garde d''invitation privée est posée',
     exists (select 1 from pg_trigger where tgname = 'trg_notifications_invite_privee'
              and tgrelid = 'public.notifications'::regclass and not tgisinternal and tgenabled <> 'D')
     and pg_get_functiondef('public.notifications_invite_privee_garde()'::regprocedure) like '%passio.notification_serveur%'
     and pg_get_functiondef('public.notifications_invite_privee_garde()'::regprocedure) not like '%new.origine%'),
  (14, 'event_invites n''est pas publiée en temps réel',
     not exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'event_invites'))
) as v(n, controle, ok_bool);

alter table _verdict_activites_privees add column verdict text;
update _verdict_activites_privees set verdict = case when ok_bool then 'OK' else 'ECHEC' end;
select n, controle, verdict from _verdict_activites_privees order by n;

do $verdict$
begin
  if exists (select 1 from _verdict_activites_privees where verdict <> 'OK') then
    raise exception 'activites_privees : verdict en ECHEC — rien n''est validé (%)',
      (select string_agg(n::text || ' ' || controle, ' ; ') from _verdict_activites_privees where verdict <> 'OK');
  end if;
end
$verdict$;

commit;
