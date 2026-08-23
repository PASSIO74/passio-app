-- ════════════════════════════════════════════════════════════════════════
-- TRUST & SAFETY SERVEUR (#136) — âge fiable, blocage bidirectionnel,
-- conversation non forçable.
--
-- Ferme les TROIS trous établis par l'audit de #134, qu'aucune garde cliente
-- ne peut fermer. Tant que cette migration n'est pas appliquée ET prouvée, le
-- drapeau `irl_proposal_v1` reste OFF et aucun CTA conversation → IRL ne doit
-- être branché.
--
-- ⚠️ CONTRAINTE STRUCTURANTE : `profiles` est en LECTURE PUBLIQUE INTÉGRALE
-- (`[SELECT] Lecture publique · using: true`). Y ajouter une date de naissance
-- ou un `is_minor` rendrait la donnée d'âge de TOUT LE MONDE lisible par tout
-- compte authentifié — l'inverse exact de ce que ce lot doit obtenir. D'où une
-- table SÉPARÉE en lecture-propre, et des fonctions qui ne rendent qu'un
-- BOOLÉEN de décision.
--
-- Idempotente : relançable sans effet de bord. Aucune suppression de données.
-- Application : éditeur SQL Supabase, ou `supabase db query --linked --file <ce fichier>`.
-- ════════════════════════════════════════════════════════════════════════

-- ── A. Âge : la donnée minimale, et elle seule ───────────────────────────
--
-- On ne stocke NI la date de naissance NI un booléen figé, mais `majority_at` :
-- la date à laquelle le compte devient majeur. C'est la seule question que le
-- système pose jamais, et elle se périme toute seule — un booléen `is_minor`
-- resterait faux pour toujours après le 18ᵉ anniversaire, et exigerait un
-- travail de fond pour se corriger.
--
-- ⚠️ `majority_at` NULL ou ligne absente = ÉTAT INCONNU = REFUS (fail-closed).
-- Les comptes existants n'ont pas de ligne : ils sont donc refusés par défaut
-- pour les fonctions IRL sensibles, jusqu'à déclaration. On n'invente l'âge de
-- personne.
CREATE TABLE IF NOT EXISTS public.user_safety (
  user_id      TEXT PRIMARY KEY,
  majority_at  DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_safety ENABLE ROW LEVEL SECURITY;

-- Lecture STRICTEMENT propre : personne ne lit l'âge d'un autre. Les décisions
-- passent par les fonctions SECURITY DEFINER plus bas, qui ne rendent qu'un
-- booléen sans jamais exposer la valeur.
DROP POLICY IF EXISTS "user_safety_select_own" ON public.user_safety;
CREATE POLICY "user_safety_select_own" ON public.user_safety
  FOR SELECT USING (user_id = ((SELECT auth.uid()))::text);

DROP POLICY IF EXISTS "user_safety_insert_own" ON public.user_safety;
CREATE POLICY "user_safety_insert_own" ON public.user_safety
  FOR INSERT WITH CHECK (user_id = ((SELECT auth.uid()))::text);

DROP POLICY IF EXISTS "user_safety_update_own" ON public.user_safety;
CREATE POLICY "user_safety_update_own" ON public.user_safety
  FOR UPDATE USING (user_id = ((SELECT auth.uid()))::text)
           WITH CHECK (user_id = ((SELECT auth.uid()))::text);

-- ⚠️ LES POLICIES NE DONNENT PAS L'ACCÈS, ELLES LE FILTRENT. Sans GRANT, une
-- table neuve rend « permission denied for table user_safety » à tout compte
-- authentifié — l'utilisateur ne pourrait même pas déclarer son âge, et le
-- verdict resterait fail-closed pour tout le monde, en silence. Mesuré sur une
-- instance PostgreSQL 16 réelle en éprouvant cette migration. Supabase pose en
-- général des default privileges qui couvriraient ce cas ; on ne s'en remet pas
-- à un réglage de projet pour une table de sécurité.
--
-- `anon` est volontairement exclu : sans `auth.uid()`, aucune policy ne peut
-- l'accepter, et lui donner le GRANT n'ajouterait qu'une surface.
GRANT SELECT, INSERT, UPDATE ON public.user_safety TO authenticated;

-- Pas de policy DELETE : effacer sa ligne reviendrait à revenir à « inconnu »,
-- ce qui est fail-closed donc inoffensif — mais ce serait aussi un moyen de
-- réinitialiser une déclaration. La purge RGPD passe par le service_role.

-- ⚠️ LA RÈGLE QUI EMPÊCHE LE CONTOURNEMENT : on ne peut JAMAIS se vieillir.
--
-- Sans elle, la déclaration ne vaut rien : un mineur poserait `majority_at`
-- dans le passé et franchirait toutes les gardes. `majority_at` ne peut donc
-- qu'AVANCER (se rajeunir, c'est-à-dire se restreindre davantage) — jamais
-- reculer. Une erreur de saisie reste corrigeable dans le sens prudent ; le
-- sens permissif exige une intervention en service_role.
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

-- ── B. Blocage bidirectionnel, sans révéler la direction ─────────────────
--
-- `blocks` garde sa policy `blocks_select_own` : la table brute reste
-- invisible à l'autre partie. Cette fonction répond à la seule question utile.
--
-- ⚠️ SIGNATURE À UN SEUL ARGUMENT, DÉLIBÉRÉMENT. Une fonction
-- `is_blocked_between(a, b)` librement appelable transformerait la base en
-- oracle : n'importe qui sonderait la relation de blocage entre deux comptes
-- TIERS. Le premier terme est donc TOUJOURS l'appelant authentifié, jamais un
-- paramètre. On ne peut interroger que les paires dont on fait partie.
--
-- Ne dit pas QUI a bloqué : les deux sens rendent le même `true`.
CREATE OR REPLACE FUNCTION public.is_blocked_with(_other TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _other IS NULL OR _other = (auth.uid())::text THEN FALSE
    ELSE EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = (auth.uid())::text AND b.blocked_id = _other)
         OR (b.blocker_id = _other AND b.blocked_id = (auth.uid())::text)
    )
  END
$$;
REVOKE EXECUTE ON FUNCTION public.is_blocked_with(TEXT) FROM public;
GRANT  EXECUTE ON FUNCTION public.is_blocked_with(TEXT) TO authenticated;

-- Verdict IRL complet : majorité des DEUX comptes ET absence de blocage dans
-- les deux sens. Un seul booléen, donc aucun canal pour distinguer « il est
-- mineur » de « il m'a bloqué » — ce qui serait en soi une fuite.
CREATE OR REPLACE FUNCTION public.irl_interaction_allowed(_other TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _other IS NULL OR _other = (auth.uid())::text THEN FALSE
    WHEN public.is_blocked_with(_other) THEN FALSE
    ELSE (
      -- Fail-closed : une ligne absente ou un majority_at NULL rend NULL, donc
      -- COALESCE à FALSE. « Inconnu » n'est jamais « autorisé ».
      COALESCE((SELECT s.majority_at <= CURRENT_DATE
                  FROM public.user_safety s WHERE s.user_id = (auth.uid())::text), FALSE)
      AND
      COALESCE((SELECT s.majority_at <= CURRENT_DATE
                  FROM public.user_safety s WHERE s.user_id = _other), FALSE)
    )
  END
$$;
REVOKE EXECUTE ON FUNCTION public.irl_interaction_allowed(TEXT) FROM public;
GRANT  EXECUTE ON FUNCTION public.irl_interaction_allowed(TEXT) TO authenticated;

-- ── C. Une conversation ne peut plus être forcée ─────────────────────────
--
-- Trou mesuré : `conversations` INSERT vaut `check: true`, et la policy INSERT
-- de `conv_members` autorise le CRÉATEUR de la conversation à insérer
-- n'importe quel `user_id`. N'importe qui ouvrait donc un DM avec n'importe
-- qui, blocage compris — le client masquait, la base gardait.
--
-- On garde les deux branches légitimes (s'ajouter soi-même ; le créateur ajoute
-- les membres) et on retire la seule chose qui ne doit jamais passer : ajouter
-- quelqu'un avec qui on est en blocage, dans un sens ou dans l'autre.
--
-- N'affecte QUE les nouvelles insertions : les conversations existantes et
-- leur lecture par `is_conv_member` sont intactes.
DROP POLICY IF EXISTS "Ecriture propre" ON public.conv_members;
CREATE POLICY "Ecriture propre" ON public.conv_members
  FOR INSERT WITH CHECK (
    (
      user_id = ((SELECT auth.uid()))::text
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conv_members.conv_id
          AND c.created_by = ((SELECT auth.uid()))::text
      )
    )
    AND NOT public.is_blocked_with(user_id)
  );
