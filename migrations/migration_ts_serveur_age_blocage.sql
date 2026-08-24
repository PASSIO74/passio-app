-- ════════════════════════════════════════════════════════════════════════
-- TRUST & SAFETY SERVEUR (#136) — âge serveur privé, blocage
-- bidirectionnel, conversation non forçable.
--
-- IMPORTANT : la donnée d'âge reste AUTO-DÉCLARÉE. Cette migration la rend
-- persistante et opposable aux règles PASSIO ; elle ne constitue PAS une
-- vérification légale ou réelle de l'âge. Tant que cette migration n'est pas
-- appliquée ET prouvée en production, `irl_proposal_v1` reste OFF.
--
-- Idempotente : relançable sans modifier les données existantes. Les chemins
-- inattendus échouent fermés plutôt que de laisser une policy permissive en OR.
-- ════════════════════════════════════════════════════════════════════════

-- ── A. Âge : stockage privé, écriture uniquement par RPC ────────────────
-- `profiles` est publiquement lisible : aucune donnée d'âge n'y entre.
-- `majority_at` est dérivé d'une ANNÉE de naissance auto-déclarée, jamais d'une
-- date de naissance stockée. Comme l'onboarding ne collecte que l'année, la
-- borne est volontairement prudente : 31 décembre de l'année des 18 ans.
-- Une personne peut donc rester classée mineure quelques mois après ses 18 ans,
-- mais ne devient jamais majeure trop tôt à cause de l'absence de jour/mois.
-- Ligne absente / NULL = inconnu = refus pour l'IRL sensible.
CREATE TABLE IF NOT EXISTS public.user_safety (
  user_id      TEXT PRIMARY KEY,
  majority_at  DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_safety ENABLE ROW LEVEL SECURITY;

-- Nettoyer l'ancienne révision de #139 si elle a été appliquée quelque part.
DROP POLICY IF EXISTS "user_safety_insert_own" ON public.user_safety;
DROP POLICY IF EXISTS "user_safety_update_own" ON public.user_safety;
DROP POLICY IF EXISTS "user_safety_select_own" ON public.user_safety;
DROP TRIGGER IF EXISTS trg_user_safety_majorite ON public.user_safety;
DROP FUNCTION IF EXISTS public.user_safety_majorite_non_avancable();

-- Lecture strictement propre. Aucune INSERT/UPDATE/DELETE directe par le client.
CREATE POLICY "user_safety_select_own" ON public.user_safety
  FOR SELECT USING (user_id = ((SELECT auth.uid()))::text);

REVOKE ALL ON TABLE public.user_safety FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_safety TO authenticated;

-- Seul chemin d'écriture client : l'appelant déclare SON année de naissance.
-- La fonction ne prend jamais de user_id : auth.uid() est l'unique identité.
--
-- Première déclaration : persistée.
-- Déclaration ultérieure plus restrictive (année plus récente) : acceptée.
-- Déclaration plus permissive (se vieillir) : ignorée, la valeur existante reste.
-- Cela empêche l'effacement du localStorage ou un UPDATE REST direct de rendre
-- le compte plus permissif. Une correction administrative reste du ressort du
-- service_role / opérateur, hors de cette RPC utilisateur.
CREATE OR REPLACE FUNCTION public.declare_birth_year(_birth_year INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid TEXT;
  _candidate DATE;
  _stored DATE;
BEGIN
  _uid := (auth.uid())::text;
  IF _uid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF _birth_year IS NULL
     OR _birth_year < 1900
     OR _birth_year > EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER THEN
    RAISE EXCEPTION 'annee de naissance invalide'
      USING ERRCODE = '22023';
  END IF;

  _candidate := make_date(_birth_year + 18, 12, 31);

  INSERT INTO public.user_safety AS s (user_id, majority_at)
  VALUES (_uid, _candidate)
  ON CONFLICT (user_id) DO UPDATE
    SET majority_at = EXCLUDED.majority_at,
        updated_at = NOW()
    WHERE s.majority_at IS NULL
       OR EXCLUDED.majority_at > s.majority_at;

  SELECT s.majority_at INTO _stored
    FROM public.user_safety s
   WHERE s.user_id = _uid;

  RETURN COALESCE(_stored <= CURRENT_DATE, FALSE);
END
$$;

REVOKE EXECUTE ON FUNCTION public.declare_birth_year(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_birth_year(INTEGER) TO authenticated;

-- ── B. Blocage bidirectionnel sans oracle entre tiers ───────────────────
-- Signature à un seul argument : l'autre terme est TOUJOURS auth.uid().
-- Le client ne peut donc pas sonder la relation de blocage entre deux tiers.
CREATE OR REPLACE FUNCTION public.is_blocked_with(_other TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _other IS NULL OR _other = (auth.uid())::text THEN FALSE
    ELSE EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = (auth.uid())::text AND b.blocked_id = _other)
         OR (b.blocker_id = _other AND b.blocked_id = (auth.uid())::text)
    )
  END
$$;

REVOKE EXECUTE ON FUNCTION public.is_blocked_with(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_with(TEXT) TO authenticated;

-- Verdict IRL : majorité prudente des DEUX comptes + aucun blocage. Un seul
-- booléen est renvoyé ; la date stockée et le motif du refus restent privés.
CREATE OR REPLACE FUNCTION public.irl_interaction_allowed(_other TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _other IS NULL OR _other = (auth.uid())::text THEN FALSE
    WHEN public.is_blocked_with(_other) THEN FALSE
    ELSE (
      COALESCE((SELECT s.majority_at <= CURRENT_DATE
                  FROM public.user_safety s
                 WHERE s.user_id = (auth.uid())::text), FALSE)
      AND
      COALESCE((SELECT s.majority_at <= CURRENT_DATE
                  FROM public.user_safety s
                 WHERE s.user_id = _other), FALSE)
    )
  END
$$;

REVOKE EXECUTE ON FUNCTION public.irl_interaction_allowed(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.irl_interaction_allowed(TEXT) TO authenticated;

-- ── C. Conversations : fermer les deux bypass serveur ───────────────────
-- PROD contient deux policies INSERT permissives sur `conversations`, toutes
-- deux `check: true`. Elles sont supprimées explicitement ; aucune policy INSERT
-- inconnue n'est tolérée, car les policies permissives se combinent en OR.
DROP POLICY IF EXISTS "Ecriture propre" ON public.conversations;
DROP POLICY IF EXISTS "Insert conversations" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert_creator" ON public.conversations;

CREATE POLICY "conversations_insert_creator" ON public.conversations
  FOR INSERT WITH CHECK (created_by = ((SELECT auth.uid()))::text);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'conversations'
       AND cmd = 'INSERT'
       AND policyname <> 'conversations_insert_creator'
  ) THEN
    RAISE EXCEPTION 'policy INSERT conversations inattendue : migration refusee';
  END IF;
END
$$;

-- La policy conv_members ne peut PAS relire directement `conversations` : la
-- policy SELECT de cette table exige déjà d'être membre, donc le créateur serait
-- bloqué au moment d'ajouter le TOUT PREMIER membre. Cette primitive dédiée
-- répond uniquement « suis-je le créateur de cette conversation ? » sans révéler
-- l'identité du créateur et sans ouvrir la lecture de la conversation.
CREATE OR REPLACE FUNCTION public.is_conversation_creator(_conv_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _conv_id IS NULL THEN FALSE
    ELSE EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id = _conv_id
         AND c.created_by = (auth.uid())::text
    )
  END
$$;

REVOKE EXECUTE ON FUNCTION public.is_conversation_creator(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_creator(TEXT) TO authenticated;

-- `conv_members` : seul le CRÉATEUR authentifié de la conversation peut ajouter
-- des membres. On supprime donc le self-join arbitraire `user_id=auth.uid()` :
-- connaître/deviner un conv_id ne donne plus le droit de rejoindre la discussion.
--
-- Le même chemin préserve DM et groupes existants : le créateur peut ajouter
-- sa propre ligne puis les invités, sauf toute cible en blocage avec lui dans
-- l'un ou l'autre sens. Ainsi un groupe ne contourne pas un blocage direct.
DROP POLICY IF EXISTS "Ecriture propre" ON public.conv_members;
DROP POLICY IF EXISTS "conv_members_insert_creator" ON public.conv_members;

CREATE POLICY "conv_members_insert_creator" ON public.conv_members
  FOR INSERT WITH CHECK (
    public.is_conversation_creator(conv_members.conv_id)
    AND NOT public.is_blocked_with(conv_members.user_id)
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'conv_members'
       AND cmd = 'INSERT'
       AND policyname <> 'conv_members_insert_creator'
  ) THEN
    RAISE EXCEPTION 'policy INSERT conv_members inattendue : migration refusee';
  END IF;
END
$$;

-- Les policies SELECT `conversations_select_member`,
-- `conv_members_select_member` et `conv_messages_select_member` restent
-- inchangées : elles continuent de s'appuyer sur `is_conv_member`.
--
-- ROLLBACK (si nécessaire avant application produit) : restaurer les policies
-- INSERT précédentes depuis SCHEMA_PROD_REFERENCE.sql, puis supprimer les quatre
-- fonctions et la table user_safety. Ne jamais supprimer la table après qu'elle
-- contient des déclarations sans procédure de migration des données.
