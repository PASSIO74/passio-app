-- ═════════════════════════════════════════════════
-- AUDIT 2026-11-02, DÉCISION PRODUIT C-04 (tranchée le 2026-11-03) :
-- LA LISTE NOMINATIVE DES PARTICIPANTS D'UNE ACTIVITÉ N'EST PLUS PUBLIQUE
--
-- Mesuré en production au canal ① (lecture seule) : `event_attendees` portait
-- une policy SELECT `USING (true)` pour `authenticated` — tout compte connecté
-- lisait QUI va à QUELLE rencontre physique (événements passés compris), avec
-- la note `rating`, le texte libre `feedback` et l'heure de pointage de chacun.
-- Pour une application qui s'ouvre à des inconnus, c'est l'adresse et l'heure
-- où trouver une personne, offertes à n'importe quel compte.
--
-- CE QUI CHANGE (et ce qui est gardé) :
--  ① LA LISTE suit le LIEN. Un compte lit une ligne d'inscription si c'est la
--     sienne ; s'il organise l'activité (auteur, organisateur, co-organisateur :
--     pointage, liste d'attente, promotion) ; s'il y est lui-même inscrit (les
--     participants se voient entre eux — hors « declined », qui n'est jamais
--     public) ; ou si la personne inscrite est quelqu'un qu'il SUIT (abonnement
--     accepté) : « ton ami y va » reste visible, l'inconnu ne l'est plus.
--  ② LE NOMBRE reste public parmi les connectés : RPC `participants_compte`
--     (venants, peut-être, liste d'attente, pointés) — preuve sociale, places
--     restantes, tri par popularité continuent de fonctionner pour tous.
--  ③ `rating`, `feedback` et `rated_at` ne sont plus LISIBLES par le rôle
--     (révocation de colonne) : la moyenne vient de la RPC `notes_evenement`
--     (agrégat, jamais « qui a mis quoi ») ; les retours écrits se lisent par
--     `retours_evenement`, réservée à l'organisation de l'activité — c'est à
--     elle qu'ils sont adressés. Chacun écrit toujours sa propre note (policy
--     UPDATE « ma ligne », intacte).
--  ④ `anon` perd un DELETE de table qu'aucune policy ne lui ouvrait (défense en
--     profondeur).
--
-- CLIENT : déployé AVANT cette migration (PR de l'audit, 2026-11-03) — il lit
-- les compteurs par la RPC quand elle existe, retombe sur la liste sinon ; il
-- ne demande plus jamais `select *` sur cette table (un RETURNING * demanderait
-- les colonnes retirées et PostgREST refuserait l'UPDATE entier, 42501).
--
-- PIÈGE ÉVITÉ : une policy qui interroge SA PROPRE table (« suis-je inscrit ? »)
-- déclenche « infinite recursion detected in policy » — d'où les deux helpers
-- SECURITY DEFINER `inscrit_a_activite` / `organise_activite`, qui ne parlent
-- que de l'APPELANT (aucun oracle sur autrui), comme `is_conv_member`.
--
-- Rejouable (idempotent) ; verdict en fin. RETOUR ARRIÈRE :
--   drop policy event_attendees_select_lien on public.event_attendees;
--   create policy event_attendees_select_authentifie on public.event_attendees for select to authenticated using (true);
--   grant select on public.event_attendees to authenticated;
--   (les RPC et helpers peuvent rester : sans appelant, ils sont inertes)
-- ═════════════════════════════════════════════════
begin;

-- ── Helpers : ne parlent que de l'appelant ──────────────────────────────────
create or replace function public.organise_activite(p_event_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.author_id = (select auth.uid())::text
        or e.organizer_id = (select auth.uid())::text
        or (e.co_organizers is not null and jsonb_typeof(e.co_organizers) = 'array'
            and e.co_organizers ? (select auth.uid())::text))
  );
$$;
revoke all on function public.organise_activite(text) from public, anon;
grant execute on function public.organise_activite(text) to authenticated;

create or replace function public.inscrit_a_activite(p_event_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.event_attendees a
    where a.event_id = p_event_id
      and a.user_id = (select auth.uid())::text
      and a.rsvp is distinct from 'declined'
  );
$$;
revoke all on function public.inscrit_a_activite(text) from public, anon;
grant execute on function public.inscrit_a_activite(text) to authenticated;

-- ── ① La liste suit le lien ─────────────────────────────────────────────────
drop policy if exists event_attendees_select_authentifie on public.event_attendees;
drop policy if exists event_attendees_select_lien on public.event_attendees;
create policy event_attendees_select_lien on public.event_attendees
  for select to authenticated
  using (
    user_id = (select auth.uid())::text
    or public.organise_activite(event_id)
    or (
      rsvp is distinct from 'declined'
      and (
        public.inscrit_a_activite(event_id)
        or exists (
          select 1 from public.follows f
          where f.follower_id = (select auth.uid())::text
            and f.following_id = event_attendees.user_id
            and f.status = 'accepted'
        )
      )
    )
  );

-- ── ③ Colonnes de retour d'expérience retirées à la lecture directe ─────────
revoke select on public.event_attendees from authenticated;
grant select (event_id, user_id, rsvp, created_at, checked_in_at) on public.event_attendees to authenticated;
-- ── ④ anon : aucun DELETE (aucune policy ne le lui ouvrait) ─────────────────
revoke delete on public.event_attendees from anon;

-- ── ② Le nombre reste public parmi les connectés ────────────────────────────
-- Même lecture que le client : « going » = tout ce qui n'est ni peut-être, ni
-- attente, ni refus ; « pointés » = une heure de pointage posée.
create or replace function public.participants_compte(p_event_ids text[])
returns table (event_id text, going integer, maybe integer, waitlist integer, checked_in integer)
language sql stable security definer set search_path = ''
as $$
  select a.event_id,
         count(*) filter (where coalesce(a.rsvp, 'going') not in ('maybe', 'waitlist', 'declined'))::integer,
         count(*) filter (where a.rsvp = 'maybe')::integer,
         count(*) filter (where a.rsvp = 'waitlist')::integer,
         count(*) filter (where a.checked_in_at is not null)::integer
  from public.event_attendees a
  where auth.uid() is not null
    and a.event_id = any (p_event_ids[1:200])
  group by a.event_id;
$$;
revoke all on function public.participants_compte(text[]) from public, anon;
grant execute on function public.participants_compte(text[]) to authenticated;

-- Moyenne et nombre de notes : l'agrégat, jamais qui a noté quoi.
create or replace function public.notes_evenement(p_event_id text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when auth.uid() is null then null
    else jsonb_build_object(
      'avg', coalesce((select avg(a.rating)::numeric(4,2) from public.event_attendees a where a.event_id = p_event_id and a.rating is not null), 0),
      'count', (select count(*) from public.event_attendees a where a.event_id = p_event_id and a.rating is not null))
  end;
$$;
revoke all on function public.notes_evenement(text) from public, anon;
grant execute on function public.notes_evenement(text) to authenticated;

-- Les retours écrits, pour l'organisation seulement (c'est à elle qu'ils sont adressés).
create or replace function public.retours_evenement(p_event_id text)
returns table (user_id text, rating smallint, feedback text, rated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.user_id, a.rating, a.feedback, a.rated_at
  from public.event_attendees a
  where public.organise_activite(p_event_id)
    and a.event_id = p_event_id
    and (a.rating is not null or nullif(btrim(a.feedback), '') is not null)
  order by a.rated_at desc nulls last;
$$;
revoke all on function public.retours_evenement(text) from public, anon;
grant execute on function public.retours_evenement(text) to authenticated;

-- ── Verdict ──
select 'event_attendees SELECT : une seule policy, par lien (soi, organisation, co-inscrit, suivi)' as controle,
       case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'event_attendees' and cmd = 'SELECT') = 1
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'event_attendees' and policyname = 'event_attendees_select_lien') like '%organise_activite%'
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'event_attendees' and policyname = 'event_attendees_select_lien') like '%inscrit_a_activite%'
             and (select qual from pg_policies where schemaname = 'public' and tablename = 'event_attendees' and policyname = 'event_attendees_select_lien') like '%follows%' then 'OK' else 'ECHEC' end as valeur
union all select 'event_attendees : feedback / rating / rated_at illisibles par authenticated, les 5 autres colonnes lisibles',
       case when not has_column_privilege('authenticated', 'public.event_attendees', 'feedback', 'SELECT')
             and not has_column_privilege('authenticated', 'public.event_attendees', 'rating', 'SELECT')
             and not has_column_privilege('authenticated', 'public.event_attendees', 'rated_at', 'SELECT')
             and has_column_privilege('authenticated', 'public.event_attendees', 'event_id', 'SELECT')
             and has_column_privilege('authenticated', 'public.event_attendees', 'user_id', 'SELECT')
             and has_column_privilege('authenticated', 'public.event_attendees', 'rsvp', 'SELECT')
             and has_column_privilege('authenticated', 'public.event_attendees', 'created_at', 'SELECT')
             and has_column_privilege('authenticated', 'public.event_attendees', 'checked_in_at', 'SELECT') then 'OK' else 'ECHEC' end
union all select 'event_attendees : INSERT / UPDATE / DELETE d''authenticated intacts, anon sans aucun droit',
       case when has_table_privilege('authenticated', 'public.event_attendees', 'INSERT')
             and has_table_privilege('authenticated', 'public.event_attendees', 'UPDATE')
             and has_table_privilege('authenticated', 'public.event_attendees', 'DELETE')
             and not has_table_privilege('anon', 'public.event_attendees', 'SELECT')
             and not has_table_privilege('anon', 'public.event_attendees', 'DELETE') then 'OK' else 'ECHEC' end
union all select 'quatre RPC SECURITY DEFINER à search_path vide, exécutables par authenticated seul',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname in ('participants_compte', 'notes_evenement', 'retours_evenement', 'organise_activite', 'inscrit_a_activite')
                    and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=""') = 5
             and has_function_privilege('authenticated', 'public.participants_compte(text[])', 'execute')
             and has_function_privilege('authenticated', 'public.notes_evenement(text)', 'execute')
             and has_function_privilege('authenticated', 'public.retours_evenement(text)', 'execute')
             and not has_function_privilege('anon', 'public.participants_compte(text[])', 'execute')
             and not has_function_privilege('anon', 'public.notes_evenement(text)', 'execute')
             and not has_function_privilege('anon', 'public.retours_evenement(text)', 'execute') then 'OK' else 'ECHEC' end;

commit;
