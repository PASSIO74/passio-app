-- TRUST & SAFETY SERVEUR (#136)
-- Age declare et oppose, blocage bidirectionnel, conversations non forcables.
--
-- IMPORTANT : cette migration ferme des frontieres serveur. Tant qu'elle n'est
-- pas appliquee et verifiee sur le vrai Supabase, `irl_proposal_v1` reste OFF.

BEGIN;

-- ============================================================================
-- A. AGE / MINORITE : DONNEE PRIVEE ET ECRITURE CONTROLEE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_safety (
  user_id      TEXT PRIMARY KEY,
  majority_at  DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_safety ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_safety_select_own" ON public.user_safety;
CREATE POLICY "user_safety_select_own" ON public.user_safety
  FOR SELECT TO authenticated
  USING (user_id = ((SELECT auth.uid()))::text);

-- Le Data API ne recoit que la lecture de sa propre ligne. Toute ecriture passe
-- par le RPC ci-dessous ; anon et PUBLIC n'ont aucun droit sur cette table.
REVOKE ALL ON TABLE public.user_safety FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_safety TO authenticated;

-- Defense en profondeur : meme un UPDATE privilegie ne peut pas rendre le
-- compte plus age (majority_at plus tot) sans retirer explicitement ce trigger.
CREATE OR REPLACE FUNCTION public.user_safety_majorite_non_avancable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.majority_at IS NOT NULL
     AND (NEW.majority_at IS NULL OR NEW.majority_at < OLD.majority_at) THEN
    RAISE EXCEPTION 'majority_at ne peut pas etre avancee (%->%)', OLD.majority_at, NEW.majority_at
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_safety_majorite ON public.user_safety;
CREATE TRIGGER trg_user_safety_majorite
  BEFORE UPDATE ON public.user_safety
  FOR EACH ROW EXECUTE FUNCTION public.user_safety_majorite_non_avancable();

-- Seul chemin client d'ecriture de l'age. Le client declare uniquement une
-- ANNEE de naissance ; majority_at est derive cote serveur au 31 decembre de
-- l'annee des 18 ans. Aucune date de majorite fournie par le client n'est
-- acceptee. Cette information reste declaree et opposable, jamais verifiee.
--
-- Premiere declaration : persistante. Ensuite, seule une annee plus recente
-- (donc plus restrictive) peut remplacer la valeur stockee. L'upsert est
-- atomique face a deux declarations concurrentes.
DROP FUNCTION IF EXISTS public.declare_majority(DATE);

CREATE OR REPLACE FUNCTION public.declare_birth_year(_birth_year INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid TEXT;
  v_candidate DATE;
  v_applied BOOLEAN;
BEGIN
  v_uid := (auth.uid())::text;
  IF v_uid IS NULL OR _birth_year IS NULL THEN
    RETURN FALSE;
  END IF;

  IF _birth_year < 1900
     OR _birth_year > EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER THEN
    RETURN FALSE;
  END IF;

  v_candidate := make_date(_birth_year + 18, 12, 31);

  INSERT INTO public.user_safety AS s (user_id, majority_at)
  VALUES (v_uid, v_candidate)
  ON CONFLICT (user_id) DO UPDATE
    SET majority_at = EXCLUDED.majority_at,
        updated_at = NOW()
    WHERE s.majority_at IS NULL
       OR EXCLUDED.majority_at > s.majority_at
  RETURNING TRUE INTO v_applied;

  RETURN COALESCE(v_applied, FALSE);
END $$;
REVOKE EXECUTE ON FUNCTION public.declare_birth_year(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_birth_year(INTEGER) TO authenticated;

-- ============================================================================
-- B. BLOCAGE BIDIRECTIONNEL, SANS ORACLE ENTRE TIERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_blocked_with(_other TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
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
$$;
REVOKE EXECUTE ON FUNCTION public.is_blocked_with(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_with(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.irl_interaction_allowed(_other TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL
      OR _other IS NULL
      OR _other = (auth.uid())::text
      THEN FALSE
    WHEN public.is_blocked_with(_other) THEN FALSE
    ELSE (
      COALESCE((
        SELECT s.majority_at <= CURRENT_DATE
          FROM public.user_safety s
         WHERE s.user_id = (auth.uid())::text
      ), FALSE)
      AND
      COALESCE((
        SELECT s.majority_at <= CURRENT_DATE
          FROM public.user_safety s
         WHERE s.user_id = _other
      ), FALSE)
    )
  END
$$;
REVOKE EXECUTE ON FUNCTION public.irl_interaction_allowed(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.irl_interaction_allowed(TEXT) TO authenticated;

-- ============================================================================
-- C. CONVERSATIONS : CREATION, MEMBERSHIP ET MESSAGES NON FORCABLES
-- ============================================================================

-- Les deux policies permissives mesurees en prod se combinent en OR. Elles
-- doivent toutes disparaitre avant de recreer une seule policy restrictive.
DROP POLICY IF EXISTS "Ecriture propre" ON public.conversations;
DROP POLICY IF EXISTS "Insert conversations" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert_creator" ON public.conversations;

CREATE POLICY "conversations_insert_creator" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = ((SELECT auth.uid()))::text);

DO $g$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'conversations'
       AND cmd = 'INSERT'
       AND policyname <> 'conversations_insert_creator'
  ) THEN
    RAISE EXCEPTION 'policy INSERT conversations inattendue : migration refusee';
  END IF;
END $g$;

-- La SELECT de conversations est membre-only. Ce helper SECURITY DEFINER permet
-- au createur d'amorcer son premier membership sans ouvrir la ligne.
CREATE OR REPLACE FUNCTION public.is_conversation_creator(_conv_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _conv_id IS NULL THEN FALSE
    ELSE EXISTS (
      SELECT 1
        FROM public.conversations c
       WHERE c.id = _conv_id
         AND c.created_by = (auth.uid())::text
    )
  END
$$;
REVOKE EXECUTE ON FUNCTION public.is_conversation_creator(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_creator(TEXT) TO authenticated;

-- Self-join evenement : autorise uniquement si TOUTES les preuves serveur sont
-- coherentes. `events.conv_id` est forgeable en prod (TEXT sans FK) et les
-- organisateurs peuvent modifier leurs evenements ; on ne lui fait donc jamais
-- confiance seul.
--
-- Invariants obligatoires :
--   * l'appelant a un RSVP ferme `going` sur l'evenement ;
--   * la conversation est l'ID canonique genere par l'app : evgrp_<event.id> ;
--   * le createur de la conversation est l'auteur de l'evenement ;
--   * aucun blocage bidirectionnel n'existe entre l'appelant et l'organisateur.
--
-- La combinaison ID canonique + createur empeche un faux evenement ou une
-- modification de conv_id de pointer vers une conversation privee existante.
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
         AND a.rsvp = 'going'
         AND NOT public.is_blocked_with(e.author_id)
    )
  END
$$;
REVOKE EXECUTE ON FUNCTION public.can_join_event_conversation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_join_event_conversation(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Ecriture propre" ON public.conv_members;
CREATE POLICY "Ecriture propre" ON public.conv_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.is_conversation_creator(conv_members.conv_id)
      OR (
        user_id = ((SELECT auth.uid()))::text
        AND public.can_join_event_conversation(conv_members.conv_id)
      )
    )
    AND NOT public.is_blocked_with(user_id)
  );

-- Comme pour conversations/messages, une policy INSERT permissive supplementaire
-- annulerait le verrou par OR. Refuser la migration plutot que faire semblant
-- d'etre protege.
DO $cm$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'conv_members'
       AND cmd = 'INSERT'
       AND policyname <> 'Ecriture propre'
  ) THEN
    RAISE EXCEPTION 'policy INSERT conv_members inattendue : migration refusee';
  END IF;
END $cm$;

-- Un non-membre ne peut pas injecter de message, meme s'il connait conv_id.
DROP POLICY IF EXISTS "Ecriture propre" ON public.conv_messages;
DROP POLICY IF EXISTS "conv_messages_insert_member" ON public.conv_messages;
CREATE POLICY "conv_messages_insert_member" ON public.conv_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    from_id = ((SELECT auth.uid()))::text
    AND public.is_conv_member(conv_id, ((SELECT auth.uid()))::text)
  );

DO $m$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'conv_messages'
       AND cmd = 'INSERT'
       AND policyname <> 'conv_messages_insert_member'
  ) THEN
    RAISE EXCEPTION 'policy INSERT conv_messages inattendue : migration refusee';
  END IF;
END $m$;

COMMIT;
