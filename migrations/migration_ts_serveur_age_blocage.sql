-- TRUST & SAFETY SERVEUR (#136)
-- Age auto-declare, persistant et opposable ; blocage bidirectionnel ;
-- conversations non forcables.
--
-- IMPORTANT : cette migration ferme des frontieres serveur. Elle ne verifie
-- pas legalement l'age. Tant qu'elle n'est pas appliquee et prouvee sur le vrai
-- Supabase, `irl_proposal_v1` reste OFF.
--
-- Le fichier entier est atomique : toute erreur, notamment une derive de policy,
-- annule aussi les changements executes avant elle.

BEGIN;

-- ============================================================================
-- A. AGE / MINORITE : DONNEE PRIVEE ET ECRITURE CONTROLEE
-- ============================================================================
-- `profiles` est publiquement lisible : aucune donnee d'age n'y entre.
-- `majority_at` est derivee d'une ANNEE de naissance auto-declaree, jamais d'une
-- date choisie par le client. Faute de jour/mois, la borne prudente est le
-- 31 decembre de l'annee des 18 ans : elle ne classe jamais quelqu'un majeur
-- trop tot. Ligne absente / NULL = age inconnu = refus pour l'IRL sensible.
CREATE TABLE IF NOT EXISTS public.user_safety (
  user_id      TEXT PRIMARY KEY,
  majority_at  DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_safety ENABLE ROW LEVEL SECURITY;

-- Nettoyer toutes les revisions connues de #139 sans tolerer d'ecriture directe.
DROP POLICY IF EXISTS "user_safety_insert_own" ON public.user_safety;
DROP POLICY IF EXISTS "user_safety_update_own" ON public.user_safety;
DROP POLICY IF EXISTS "user_safety_select_own" ON public.user_safety;

CREATE POLICY "user_safety_select_own" ON public.user_safety
  FOR SELECT TO authenticated
  USING (user_id = ((SELECT auth.uid()))::text);

REVOKE ALL ON TABLE public.user_safety FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_safety TO authenticated;

-- Defense en profondeur : meme un UPDATE privilegie ne peut pas avancer la date
-- de majorite (donc rendre un compte plus permissif) sans retirer ce trigger.
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
END
$$;
REVOKE EXECUTE ON FUNCTION public.user_safety_majorite_non_avancable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_user_safety_majorite ON public.user_safety;
CREATE TRIGGER trg_user_safety_majorite
  BEFORE UPDATE ON public.user_safety
  FOR EACH ROW EXECUTE FUNCTION public.user_safety_majorite_non_avancable();

-- Retirer l'ancienne interface dangereuse : le client ne fournit plus jamais la
-- date derivee. Seule l'annee auto-declaree entre dans le RPC.
DROP FUNCTION IF EXISTS public.declare_majority(DATE);

-- Premiere declaration : persistante. Une declaration ulterieure plus recente
-- (donc plus restrictive) est acceptee ; une annee plus ancienne, qui ferait se
-- vieillir, ne modifie rien. L'UPSERT est atomique aussi en appels concurrents.
CREATE OR REPLACE FUNCTION public.declare_birth_year(_birth_year INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid       TEXT;
  v_candidate DATE;
  v_applied   BOOLEAN;
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
END
$$;
REVOKE EXECUTE ON FUNCTION public.declare_birth_year(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.declare_birth_year(INTEGER) TO authenticated;

-- ============================================================================
-- B. BLOCAGE BIDIRECTIONNEL, SANS ORACLE ENTRE TIERS
-- ============================================================================
-- Signature a un argument : l'autre terme est toujours auth.uid(). Le client ne
-- peut pas sonder une relation de blocage entre deux comptes tiers.
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
REVOKE EXECUTE ON FUNCTION public.is_blocked_with(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_with(TEXT) TO authenticated;

-- Verdict IRL minimal : majorite prudente des DEUX comptes + aucun blocage. La
-- date et le motif du refus restent prives ; seul le booleen necessaire sort.
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
REVOKE EXECUTE ON FUNCTION public.irl_interaction_allowed(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.irl_interaction_allowed(TEXT) TO authenticated;

-- ============================================================================
-- C. CONVERSATIONS : CREATION, MEMBERSHIP ET MESSAGES NON FORCABLES
-- ============================================================================

-- Les policies permissives se combinent en OR. Une policy INSERT inconnue fait
-- donc echouer la migration plutot que d'annuler silencieusement le verrou.
DO $guard_conversations$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'conversations'
       AND cmd = 'INSERT'
       AND policyname NOT IN ('Ecriture propre', 'Insert conversations', 'conversations_insert_creator')
  ) THEN
    RAISE EXCEPTION 'policy INSERT conversations inattendue : migration refusee';
  END IF;
END
$guard_conversations$;

DROP POLICY IF EXISTS "Ecriture propre" ON public.conversations;
DROP POLICY IF EXISTS "Insert conversations" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert_creator" ON public.conversations;

CREATE POLICY "conversations_insert_creator" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = ((SELECT auth.uid()))::text);

REVOKE INSERT ON TABLE public.conversations FROM PUBLIC, anon;
GRANT INSERT ON TABLE public.conversations TO authenticated;

-- La SELECT de conversations est membre-only. Ce helper permet au createur
-- d'amorcer le premier membership sans ouvrir la ligne.
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
REVOKE EXECUTE ON FUNCTION public.is_conversation_creator(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_creator(TEXT) TO authenticated;

-- Self-join evenement : autorise seulement si toutes les preuves serveur sont
-- coherentes. `events.conv_id` est forgeable (TEXT sans FK), donc l'ID canonique
-- et le createur sont verifies ensemble.
--
-- `going` ET `maybe` rejoignent le groupe : c'est le contrat actuel du client.
-- `declined`, `waitlist`, evenement annule et blocage avec l'organisateur sont
-- refuses.
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
    )
  END
$$;
REVOKE EXECUTE ON FUNCTION public.can_join_event_conversation(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_join_event_conversation(TEXT) TO authenticated;

DO $guard_members$
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
END
$guard_members$;

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

REVOKE INSERT ON TABLE public.conv_members FROM PUBLIC, anon;
GRANT INSERT ON TABLE public.conv_members TO authenticated;

DO $guard_messages$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'conv_messages'
       AND cmd = 'INSERT'
       AND policyname NOT IN ('Ecriture propre', 'conv_messages_insert_member')
  ) THEN
    RAISE EXCEPTION 'policy INSERT conv_messages inattendue : migration refusee';
  END IF;
END
$guard_messages$;

-- Un non-membre ne peut pas injecter de message, meme s'il connait conv_id.
DROP POLICY IF EXISTS "Ecriture propre" ON public.conv_messages;
DROP POLICY IF EXISTS "conv_messages_insert_member" ON public.conv_messages;
CREATE POLICY "conv_messages_insert_member" ON public.conv_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    from_id = ((SELECT auth.uid()))::text
    AND public.is_conv_member(conv_id, ((SELECT auth.uid()))::text)
  );

REVOKE INSERT ON TABLE public.conv_messages FROM PUBLIC, anon;
GRANT INSERT ON TABLE public.conv_messages TO authenticated;

COMMIT;

-- RECUPERATION / ROLLBACK
-- * avant COMMIT : toute erreur provoque le rollback integral automatiquement ;
-- * apres COMMIT : `irl_proposal_v1` reste OFF, donc aucune activation produit
--   n'est a annuler. Ne pas restaurer les anciennes policies permissives : ce
--   serait rouvrir les failles. Conserver les donnees user_safety et corriger par
--   une migration fix-forward revue. Une restauration fonctionnelle d'urgence
--   doit rester fail-closed et faire l'objet d'une seconde revue independante.
