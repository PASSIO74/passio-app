-- ADMISSION 18+ — FONDATION SERVEUR (lot « accès 18+ », 2026-09-08)
-- L'accès aux rencontres physiques (IRL) devient une ADMISSION décidée par le
-- serveur : organiser une rencontre, s'y inscrire et rejoindre sa conversation
-- de groupe exigent un compte dont la majorité DÉCLARÉE est atteinte.
--
-- CE QUE CETTE MIGRATION FAIT
--   A. Un interrupteur SERVEUR (`access_policies`, clé `irl_adult_only`),
--      éteint à l'application : rien ne change pour personne tant qu'il n'est
--      pas allumé. C'est le premier kill switch DISTANT du dépôt (l'audit du
--      2026-09-04 relevait 35 drapeaux, tous côté client).
--   B. Les prédicats d'admission, SECURITY DEFINER, search_path vide, jamais
--      exécutables par `anon`. Ils ne parlent QUE de l'appelant : aucun oracle
--      sur l'âge d'autrui.
--   C. Les policies d'écriture des surfaces IRL (events INSERT, event_attendees
--      INSERT/UPDATE) et le self-join de conversation d'événement conditionnés
--      à l'admission. Le RETRAIT d'une inscription reste toujours possible.
--
-- CE QU'ELLE NE FAIT PAS
--   · Elle ne VÉRIFIE pas l'âge : la majorité reste dérivée de l'année de
--     naissance auto-déclarée par `declare_birth_year` (#136), au 31 décembre de
--     l'année des 18 ans, jamais reculable. Une vérification documentaire est
--     un autre chantier, avec un coût.
--   · Elle n'allume rien. Interrupteur : voir docs/ADMISSION_18_PLUS.md.
--   · Elle ne touche ni la lecture des événements ni les commentaires et
--     réactions d'événement (points ouverts, listés dans la doc).
--
-- PRÉREQUIS : #136 appliquée (table user_safety, is_blocked_with,
-- can_join_event_conversation). Vérifié en tête, la migration s'arrête sinon.
--
-- FAIL-CLOSED, dans les deux sens :
--   · ligne d'interrupteur ABSENTE = admission EXIGÉE (supprimer la ligne ne
--     rouvre jamais la porte) ;
--   · ligne user_safety absente ou NULL = compte NON admis.
--
-- Le fichier entier est atomique : toute erreur annule tout.

BEGIN;

-- ============================================================================
-- 0. PRÉREQUIS #136
-- ============================================================================
DO $prereq$
BEGIN
  IF to_regclass('public.user_safety') IS NULL THEN
    RAISE EXCEPTION 'prerequis absent : public.user_safety (appliquer migration_ts_serveur_age_blocage.sql d''abord)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'is_blocked_with'
       AND pg_catalog.pg_get_function_identity_arguments(p.oid) = '_other text'
  ) THEN
    RAISE EXCEPTION 'prerequis absent : public.is_blocked_with(text) (#136)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'can_join_event_conversation'
       AND pg_catalog.pg_get_function_identity_arguments(p.oid) = '_conv_id text'
  ) THEN
    RAISE EXCEPTION 'prerequis absent : public.can_join_event_conversation(text) (#136)';
  END IF;
  -- `declare_birth_year` est le SEUL chemin par lequel un compte peut devenir
  -- admis. Sans elle, la regle n'aurait aucune porte : l'exiger ici, et pas
  -- seulement dans le preflight, evite d'appliquer une frontiere sans issue.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'declare_birth_year'
       AND pg_catalog.pg_get_function_identity_arguments(p.oid) = '_birth_year integer'
  ) THEN
    RAISE EXCEPTION 'prerequis absent : public.declare_birth_year(integer) (#136) — la regle n''aurait aucune porte';
  END IF;
END
$prereq$;

-- ============================================================================
-- A. INTERRUPTEUR SERVEUR
-- ============================================================================
-- Une ligne par règle d'accès. Le client n'y a AUCUN accès (ni lecture ni
-- écriture) : il ne peut ni sonder ni basculer. Seuls `postgres` (SQL Editor,
-- psql) et `service_role` la voient. Une table plutôt qu'une constante dans une
-- fonction : l'état se lit et se change en une requête, sans redéployer.
CREATE TABLE IF NOT EXISTS public.access_policies (
  key        TEXT PRIMARY KEY,
  enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  note       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.access_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.access_policies FROM PUBLIC, anon, authenticated;
-- Aucune policy : sans policy, RLS refuse tout aux rôles qui n'en sont pas
-- exemptés — et les GRANTs ci-dessus ne leur laissent de toute façon rien.

-- Idempotent : une seconde exécution ne rétrograde JAMAIS un interrupteur
-- allumé (DO NOTHING, pas DO UPDATE).
INSERT INTO public.access_policies (key, enabled, note)
VALUES ('irl_adult_only', FALSE,
        'Admission 18+ : organiser, s''inscrire et rejoindre la conversation d''une rencontre exigent la majorité déclarée. OFF à l''application (2026-09-08). Allumer : UPDATE public.access_policies SET enabled = TRUE, updated_at = NOW() WHERE key = ''irl_adult_only'';')
ON CONFLICT (key) DO NOTHING;

-- L'interrupteur est-il allumé ? FAIL-CLOSED : ligne absente = EXIGÉ.
CREATE OR REPLACE FUNCTION public.adult_access_enforced()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT COALESCE((
    SELECT p.enabled FROM public.access_policies p WHERE p.key = 'irl_adult_only'
  ), TRUE)
$$;
REVOKE EXECUTE ON FUNCTION public.adult_access_enforced() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- B. PRÉDICATS D'ADMISSION (l'appelant seulement)
-- ============================================================================
-- Majorité DÉCLARÉE atteinte ? FAIL-CLOSED : pas de session, pas de ligne,
-- date NULL ou future → FALSE.
CREATE OR REPLACE FUNCTION public.is_adult_declared()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN FALSE
    ELSE COALESCE((
      SELECT s.majority_at <= CURRENT_DATE
        FROM public.user_safety s
       WHERE s.user_id = (auth.uid())::text
    ), FALSE)
  END
$$;
REVOKE EXECUTE ON FUNCTION public.is_adult_declared() FROM PUBLIC, anon, authenticated;

-- Le verdict que les policies consultent. Interrupteur éteint → TRUE pour tout
-- compte connecté (comportement d'avant, à l'octet près) ; allumé → majorité
-- déclarée. Sans session : FALSE dans les deux cas — un visiteur n'écrit rien.
CREATE OR REPLACE FUNCTION public.adult_access_allowed()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN FALSE
    WHEN NOT public.adult_access_enforced() THEN TRUE
    ELSE public.is_adult_declared()
  END
$$;
REVOKE EXECUTE ON FUNCTION public.adult_access_allowed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adult_access_allowed() TO authenticated;

-- Statut lisible par le client, pour choisir la porte à montrer AVANT le
-- refus : 'off' (règle éteinte) · 'admitted' · 'undeclared' (aucune année
-- déclarée : demander l'année) · 'minor' (déclaré, majorité non atteinte).
-- Ne rend que le statut de l'APPELANT — sa propre ligne user_safety lui est
-- déjà lisible par la policy SELECT de #136, rien de neuf ne sort.
CREATE OR REPLACE FUNCTION public.adult_access_status()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'undeclared'
    WHEN NOT public.adult_access_enforced() THEN 'off'
    WHEN NOT EXISTS (SELECT 1 FROM public.user_safety s
                      WHERE s.user_id = (auth.uid())::text AND s.majority_at IS NOT NULL)
      THEN 'undeclared'
    WHEN public.is_adult_declared() THEN 'admitted'
    ELSE 'minor'
  END
$$;
REVOKE EXECUTE ON FUNCTION public.adult_access_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adult_access_status() TO authenticated;

-- ============================================================================
-- C. SURFACES IRL : ORGANISER, S'INSCRIRE, REJOINDRE LA CONVERSATION
-- ============================================================================
-- Les policies permissives se combinent en OR : une policy INSERT/UPDATE
-- inconnue annulerait la garde en silence. Comme #136, on REFUSE la migration
-- plutôt que d'appliquer un verrou qui ne verrouille rien.
DO $guard_events$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename = 'events' AND cmd = 'INSERT'
       AND policyname NOT IN ('Ecriture propre', 'events_insert_author_adult')
  ) THEN
    RAISE EXCEPTION 'policy INSERT events inattendue : migration refusee';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename = 'event_attendees' AND cmd = 'INSERT'
       AND policyname NOT IN ('Ecriture propre', 'event_attendees_insert_own_adult')
  ) THEN
    RAISE EXCEPTION 'policy INSERT event_attendees inattendue : migration refusee';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename = 'event_attendees' AND cmd = 'UPDATE'
       AND policyname NOT IN ('Maj de sa propre participation', 'event_attendees_update_own_adult')
  ) THEN
    RAISE EXCEPTION 'policy UPDATE event_attendees inattendue : migration refusee';
  END IF;
END
$guard_events$;

-- Organiser une rencontre : auteur = soi ET admis.
DROP POLICY IF EXISTS "Ecriture propre" ON public.events;
DROP POLICY IF EXISTS "events_insert_author_adult" ON public.events;
CREATE POLICY "events_insert_author_adult" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = ((SELECT auth.uid()))::text
    AND public.adult_access_allowed()
  );
REVOKE INSERT ON TABLE public.events FROM PUBLIC, anon;
GRANT INSERT ON TABLE public.events TO authenticated;

-- S'inscrire : ligne à soi ET admis.
DROP POLICY IF EXISTS "Ecriture propre" ON public.event_attendees;
DROP POLICY IF EXISTS "event_attendees_insert_own_adult" ON public.event_attendees;
CREATE POLICY "event_attendees_insert_own_adult" ON public.event_attendees
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = ((SELECT auth.uid()))::text
    AND public.adult_access_allowed()
  );

-- Changer d'avis : ligne à soi, et le NOUVEL état exige l'admission — SAUF le
-- retrait (`declined`), toujours permis. Un compte que la règle rattrape doit
-- pouvoir se désinscrire ; il ne doit jamais pouvoir se réinscrire, ni pointer
-- son arrivée (le check-in réécrit `rsvp = 'going'`).
DROP POLICY IF EXISTS "Maj de sa propre participation" ON public.event_attendees;
DROP POLICY IF EXISTS "event_attendees_update_own_adult" ON public.event_attendees;
CREATE POLICY "event_attendees_update_own_adult" ON public.event_attendees
  FOR UPDATE TO authenticated
  USING (user_id = ((SELECT auth.uid()))::text)
  WITH CHECK (
    user_id = ((SELECT auth.uid()))::text
    AND (public.adult_access_allowed() OR rsvp = 'declined')
  );
REVOKE INSERT, UPDATE ON TABLE public.event_attendees FROM PUBLIC, anon;
GRANT INSERT, UPDATE ON TABLE public.event_attendees TO authenticated;
-- La policy DELETE « Suppression propre » (se désinscrire) est volontairement
-- laissée telle quelle : le retrait n'est jamais conditionné.

-- Rejoindre la conversation d'une rencontre : mêmes preuves qu'en #136, plus
-- l'admission. Corps de #136 recopié, une ligne ajoutée (la dernière).
CREATE OR REPLACE FUNCTION public.can_join_event_conversation(_conv_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
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
         AND c.created_by = e.author_id
         AND e.status = 'active'
         AND a.rsvp IN ('going', 'maybe')
         AND NOT public.is_blocked_with(e.author_id)
         AND public.adult_access_allowed()
    )
  END
$$;
REVOKE EXECUTE ON FUNCTION public.can_join_event_conversation(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_join_event_conversation(TEXT) TO authenticated;

COMMIT;

-- ALLUMER / ÉTEINDRE (canal ③ d'ADR-012 : psql ou SQL Editor, jamais le client)
--   UPDATE public.access_policies SET enabled = TRUE,  updated_at = NOW() WHERE key = 'irl_adult_only';
--   UPDATE public.access_policies SET enabled = FALSE, updated_at = NOW() WHERE key = 'irl_adult_only';
-- Ne JAMAIS supprimer la ligne pour « éteindre » : ligne absente = EXIGÉ.
--
-- RETOUR ARRIÈRE (structure) — restaure les policies d'avant, sans rien effacer
--   BEGIN;
--   DROP POLICY IF EXISTS "events_insert_author_adult" ON public.events;
--   CREATE POLICY "Ecriture propre" ON public.events FOR INSERT WITH CHECK (author_id = (auth.uid())::text);
--   DROP POLICY IF EXISTS "event_attendees_insert_own_adult" ON public.event_attendees;
--   CREATE POLICY "Ecriture propre" ON public.event_attendees FOR INSERT WITH CHECK (user_id = (auth.uid())::text);
--   DROP POLICY IF EXISTS "event_attendees_update_own_adult" ON public.event_attendees;
--   CREATE POLICY "Maj de sa propre participation" ON public.event_attendees FOR UPDATE
--     USING (user_id = (auth.uid())::text) WITH CHECK (user_id = (auth.uid())::text);
--   -- can_join_event_conversation : réappliquer la définition de migration_ts_serveur_age_blocage.sql
--   DROP FUNCTION IF EXISTS public.adult_access_status();
--   DROP FUNCTION IF EXISTS public.adult_access_allowed();
--   DROP FUNCTION IF EXISTS public.is_adult_declared();
--   DROP FUNCTION IF EXISTS public.adult_access_enforced();
--   DROP TABLE IF EXISTS public.access_policies;
--   COMMIT;
