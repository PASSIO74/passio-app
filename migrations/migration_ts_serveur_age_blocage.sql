-- TRUST & SAFETY SERVEUR (#136)
-- Age declare et oppose, blocage bidirectionnel, conversations non forcables.
--
-- IMPORTANT : cette migration ferme des frontieres serveur. Tant qu'elle n'est
-- pas appliquee et verifiee sur le vrai Supabase, `irl_proposal_v1` reste OFF.

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
  FOR SELECT USING (user_id = ((SELECT auth.uid()))::text);

-- Un compte authentifie ne peut jamais ecrire directement sa date de majorite.
REVOKE INSERT, UPDATE, DELETE ON public.user_safety FROM authenticated;
GRANT SELECT ON public.user_safety TO authenticated;

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

-- Seul chemin client d'ecriture de l'age. La premiere declaration est
-- persistante ; ensuite, seul un changement restrictif (majority_at plus tard)
-- est accepte. Il s'agit d'une declaration utilisateur, pas d'une verification
-- legale de l'age.
CREATE OR REPLACE FUNCTION public.declare_majority(_majority_at DATE)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid TEXT;
  v_old DATE;
BEGIN
  v_uid := (auth.uid())::text;
  IF v_uid IS NULL OR _majority_at IS NULL THEN
    RETURN FALSE;
  END IF;

  IF _majority_at < DATE '1900-01-01'
     OR _majority_at > (CURRENT_DATE + INTERVAL '18 years') THEN
    RETURN FALSE;
  END IF;

  SELECT s.majority_at
    INTO v_old
    FROM public.user_safety s
   WHERE s.user_id = v_uid;

  IF NOT FOUND THEN
    INSERT INTO public.user_safety(user_id, majority_at)
    VALUES (v_uid, _majority_at);
    RETURN TRUE;
  END IF;

  IF v_old IS NULL OR _majority_at > v_old THEN
    UPDATE public.user_safety
       SET majority_at = _majority_at
     WHERE user_id = v_uid;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END $$;
REVOKE EXECUTE ON FUNCTION public.declare_majority(DATE) FROM public;
GRANT EXECUTE ON FUNCTION public.declare_majority(DATE) TO authenticated;

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
REVOKE EXECUTE ON FUNCTION public.is_blocked_with(TEXT) FROM public;
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
REVOKE EXECUTE ON FUNCTION public.irl_interaction_allowed(TEXT) FROM public;
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
  FOR INSERT WITH CHECK (created_by = ((SELECT auth.uid()))::text);

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
REVOKE EXECUTE ON FUNCTION public.is_conversation_creator(TEXT) FROM public;
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
REVOKE EXECUTE ON FUNCTION public.can_join_event_conversation(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.can_join_event_conversation(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Ecriture propre" ON public.conv_members;
CREATE POLICY "Ecriture propre" ON public.conv_members
  FOR INSERT WITH CHECK (
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
  FOR INSERT WITH CHECK (
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
