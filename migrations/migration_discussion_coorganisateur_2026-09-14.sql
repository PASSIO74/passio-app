-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVITÉS IRL — la discussion créée par un co-organisateur est joignable
-- par les inscrits (IRL-10, contre-revue Astra, 2026-09-14)
--
-- Un seul copier-coller dans l'éditeur SQL de Supabase (canal ③ d'ADR-012),
-- UNE transaction, REJOUABLE, tableau de verdict en fin (3 lignes).
--
-- LE DÉFAUT. Le client autorise l'auteur OU un co-organisateur à créer la
-- discussion de l'activité (`_canManageEvent`, app-07 : `created_by =
-- MY_UID`), mais `can_join_event_conversation` — l'aide appelée par la policy
-- INSERT de `conv_members` — exige `c.created_by = e.author_id`. Une
-- discussion créée par un co-organisateur refusait donc TOUT inscrit, et le
-- client ignorait le refus (corrigé dans le même lot : il le lit et le dit).
-- Mesuré en base le 2026-09-14 : aucune discussion dans ce cas aujourd'hui —
-- la porte est fermée avant qu'elle serve.
--
-- CE QUI CHANGE, et rien d'autre : la condition sur le créateur admet aussi
-- un co-organisateur de l'activité (`events.co_organizers`, jsonb, tableau
-- d'identifiants — opérateur `?` : présence d'un élément texte). Tout le reste
-- de la fonction est repris À L'IDENTIQUE : inscrit `going`/`maybe`, activité
-- `active`, `conv_id = 'evgrp_' || id`, non bloqué par l'auteur, majorité.
-- `CREATE OR REPLACE` conserve propriétaire et droits (authenticated : oui,
-- anon : non — vérifiés en production avant d'écrire ce fichier).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

create or replace function public.can_join_event_conversation(_conv_id text)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _conv_id IS NULL THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.events e
        JOIN public.event_attendees a
          ON a.event_id = e.id
         AND a.user_id = (auth.uid())::text
        JOIN public.conversations c
          ON c.id = e.conv_id
       WHERE e.conv_id = _conv_id
         AND e.conv_id = ('evgrp_' || e.id)
         -- IRL-10 : l'auteur OU un co-organisateur a pu créer la discussion.
         AND (c.created_by = e.author_id
              OR (e.co_organizers IS NOT NULL
                  AND jsonb_typeof(e.co_organizers) = 'array'
                  AND e.co_organizers ? c.created_by))
         AND e.status = 'active'
         AND a.rsvp IN ('going', 'maybe')
         AND NOT public.is_blocked_with(e.author_id)
         AND public.adult_access_allowed()
    )
  END
$function$;

-- Verdict (3 lignes attendues).
select 'fonction admet un co-organisateur' as controle,
       case when pg_get_functiondef('public.can_join_event_conversation'::regproc) like '%co_organizers ? c.created_by%' then 'OK' else 'ECHEC' end as valeur
union all
select 'search_path figé', case when (select array_to_string(proconfig, ',') from pg_proc where proname = 'can_join_event_conversation') like '%search_path=%' then 'OK' else 'ECHEC' end
union all
select 'anon sans EXECUTE', case when has_function_privilege('anon', 'public.can_join_event_conversation(text)', 'EXECUTE') then 'ECHEC' else 'OK' end;

commit;
