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

-- ⚠️ AUCUNE POLICY INSERT NI UPDATE, ET AUCUN GRANT CORRESPONDANT.
--
-- Une première version de ce lot accordait `INSERT, UPDATE` à `authenticated`
-- avec des policies `own`. La contre-revue a montré le trou : le trigger
-- n'empêche que de RECULER `majority_at` sur un UPDATE — un compte NEUF, sans
-- ligne, faisait simplement `INSERT ... majority_at = '2000-01-01'` et se
-- déclarait majeur dans la seconde. La garde ne gardait que les comptes ayant
-- déjà déclaré.
--
-- L'écriture passe donc exclusivement par `public.declare_majority()` plus bas.
-- REVOKE explicite : une base où la version précédente a tourné doit perdre ces
-- droits au réapplication.
REVOKE INSERT, UPDATE, DELETE ON public.user_safety FROM authenticated;

-- ⚠️ LES POLICIES NE DONNENT PAS L'ACCÈS, ELLES LE FILTRENT. Sans GRANT, une
-- table neuve rend « permission denied for table user_safety » à tout compte
-- authentifié — l'utilisateur ne pourrait même pas déclarer son âge, et le
-- verdict resterait fail-closed pour tout le monde, en silence. Mesuré sur une
-- instance PostgreSQL 16 réelle en éprouvant cette migration. Supabase pose en
-- général des default privileges qui couvriraient ce cas ; on ne s'en remet pas
-- à un réglage de projet pour une table de sécurité.
--
-- SELECT SEULEMENT : le client doit pouvoir savoir s'il a déjà déclaré (sinon
-- il redemanderait à chaque démarrage). L'écriture passe par le RPC.
-- `anon` est volontairement exclu : sans `auth.uid()`, aucune policy ne peut
-- l'accepter, et lui donner le GRANT n'ajouterait qu'une surface.
GRANT SELECT ON public.user_safety TO authenticated;

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


-- ⚠️ LE SEUL CHEMIN D'ÉCRITURE DE LA DONNÉE D'ÂGE.
--
-- `SECURITY DEFINER`, donc il traverse la RLS — c'est précisément pour ça que
-- `authenticated` n'a plus aucun droit d'écriture direct sur la table.
--
-- Trois règles, dans cet ordre :
--   ① bornes de vraisemblance — une majorité avant 1900 ou à plus de 18 ans
--      dans le futur n'a pas de sens et est refusée ;
--   ② la PREMIÈRE déclaration est libre, mais elle est définitive dans le sens
--      permissif : c'est elle qui devient opposable ;
--   ③ ensuite, seul un changement RESTRICTIF passe (se rajeunir). Se vieillir
--      exige le service_role.
--
-- ⚠️ CE QUE CE RPC NE FAIT PAS, et qu'aucun code ne peut faire ici : VÉRIFIER
-- l'âge. La déclaration reste déclarative. Ce que le lot apporte, c'est qu'elle
-- devient opposable et à sens unique — pas qu'elle devienne vraie. Une
-- vérification réelle (pièce, tiers de confiance) est un chantier à part, et il
-- ne faut pas laisser croire que ce lot l'a fait.
CREATE OR REPLACE FUNCTION public.declare_majority(_majority_at DATE)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid TEXT; v_old DATE;
BEGIN
  v_uid := (auth.uid())::text;
  IF v_uid IS NULL OR _majority_at IS NULL THEN RETURN FALSE; END IF;
  IF _majority_at < DATE '1900-01-01'
     OR _majority_at > (CURRENT_DATE + INTERVAL '18 years') THEN
    RETURN FALSE;
  END IF;

  SELECT s.majority_at INTO v_old FROM public.user_safety s WHERE s.user_id = v_uid;

  IF NOT FOUND THEN
    INSERT INTO public.user_safety(user_id, majority_at) VALUES (v_uid, _majority_at);
    RETURN TRUE;
  END IF;

  IF v_old IS NULL OR _majority_at > v_old THEN
    UPDATE public.user_safety SET majority_at = _majority_at WHERE user_id = v_uid;
    RETURN TRUE;
  END IF;

  RETURN FALSE;  -- tentative de se vieillir : refusée, sans exception bruyante
END $$;
REVOKE EXECUTE ON FUNCTION public.declare_majority(DATE) FROM public;
GRANT  EXECUTE ON FUNCTION public.declare_majority(DATE) TO authenticated;

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
-- ⚠️ DEUXIÈME TROU, TROUVÉ PAR LA CONTRE-REVUE : la branche `user_id =
-- auth.uid()` était LIBRE. Quiconque connaissait ou devinait un `conv_id`
-- s'ajoutait lui-même comme membre — et `is_conv_member` lui ouvrait alors
-- toute la conversation et ses messages. Une auto-invitation dans une
-- conversation privée existante.
--
-- La supprimer purement casserait un parcours réel : `supaJoinEventConversation`
-- (app-08) fait s'ajouter un inscrit au groupe des participants d'un événement.
-- On la BORNE donc à ce cas précis, vérifié côté serveur contre
-- `events.conv_id` et `event_attendees` — au lieu de la retirer à l'aveugle ou
-- de la laisser ouverte.
--
-- N'affecte QUE les nouvelles insertions : les conversations existantes et
-- leur lecture par `is_conv_member` sont intactes.

-- ── C.0 Une conversation ne peut plus être attribuée à quelqu'un d'autre ──
--
-- Repris de la solution concurrente poussée en parallèle sur cette branche
-- (commits `0cfd0bd`..`e954b28`), qui avait vu ce que j'avais laissé ouvert :
-- la PROD porte DEUX policies INSERT permissives sur `conversations`, toutes
-- deux `check: true`. N'importe qui créait donc une conversation en la
-- déclarant créée par un autre compte — et récupérait au passage les droits que
-- la policy `conv_members` accorde au créateur.
--
-- ⚠️ Les policies permissives se COMBINENT EN OR : en laisser une seule
-- annulerait le verrou. D'où la suppression explicite des deux, puis un garde
-- qui FAIT ÉCHOUER la migration si une policy INSERT inconnue subsiste.
DROP POLICY IF EXISTS "Ecriture propre" ON public.conversations;
DROP POLICY IF EXISTS "Insert conversations" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert_creator" ON public.conversations;

CREATE POLICY "conversations_insert_creator" ON public.conversations
  FOR INSERT WITH CHECK (created_by = ((SELECT auth.uid()))::text);

DO $g$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename = 'conversations'
       AND cmd = 'INSERT' AND policyname <> 'conversations_insert_creator'
  ) THEN
    RAISE EXCEPTION 'policy INSERT conversations inattendue : migration refusee';
  END IF;
END $g$;

-- ⚠️ POURQUOI UNE FONCTION, ET PAS UN SOUS-`EXISTS` DIRECT SUR `conversations`.
--
-- `conversations` n'est lisible que par ses MEMBRES (`conversations_select_member`
-- → `is_conv_member`). Un sous-`EXISTS` écrit en clair dans la policy de
-- `conv_members` est donc soumis à cette RLS : au moment où le créateur insère
-- sa PROPRE ligne, il n'est pas encore membre, la conversation lui est invisible,
-- et l'`EXISTS` rend faux. Résultat mesuré sur PostgreSQL réel : le créateur ne
-- peut pas s'ajouter à sa propre conversation — plus AUCUNE conversation ne se
-- crée, ni DM ni groupe.
--
-- L'ancienne policy ne marchait que par un enchaînement fragile : la branche
-- libre `user_id = auth.uid()` amorçait l'adhésion du créateur, ce qui rendait
-- ENSUITE la conversation visible et permettait d'ajouter l'autre membre. Cette
-- branche étant précisément le trou d'auto-invitation, il faut remplacer
-- l'amorçage, pas seulement le retirer.
--
-- `SECURITY DEFINER` + `search_path` verrouillé, sur le modèle exact de
-- `is_conv_member` : la question « suis-je le créateur de cette conversation ? »
-- est tranchée sans exposer la ligne.
CREATE OR REPLACE FUNCTION public.is_conversation_creator(_conv_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN FALSE ELSE EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conv_id AND c.created_by = (auth.uid())::text
  ) END
$$;
REVOKE EXECUTE ON FUNCTION public.is_conversation_creator(TEXT) FROM public;
GRANT  EXECUTE ON FUNCTION public.is_conversation_creator(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Ecriture propre" ON public.conv_members;
CREATE POLICY "Ecriture propre" ON public.conv_members
  FOR INSERT WITH CHECK (
    (
      -- ① Le créateur de la conversation en compose les membres — lui-même
      --    compris, ce qui amorce sans avoir besoin d'une branche libre.
      public.is_conversation_creator(conv_members.conv_id)
      -- ② Je rejoins MOI-MÊME la conversation d'un événement AUQUEL JE SUIS
      --    INSCRIT. C'est le seul self-join légitime de l'application
      --    (`supaJoinEventConversation`, app-08) : un inscrit rejoint le groupe
      --    des participants après son RSVP.
      OR (
        user_id = ((SELECT auth.uid()))::text
        AND EXISTS (
          SELECT 1 FROM public.events e
          JOIN public.event_attendees a ON a.event_id = e.id
          WHERE e.conv_id = conv_members.conv_id
            AND a.user_id = ((SELECT auth.uid()))::text
        )
      )
    )
    AND NOT public.is_blocked_with(user_id)
  );

-- ── C ter. Un non-membre ne peut pas INJECTER un message ─────────────────
--
-- Trou trouve par la solution concurrente (`ba25715`), que j'avais manque : la
-- policy INSERT de prod sur `conv_messages` ne verifie que `from_id =
-- auth.uid()`. Un tiers connaissant un `conv_id` pouvait donc ECRIRE dans une
-- conversation privee sans pouvoir la lire — la lecture etait fermee depuis
-- 2026-08-09, l'ecriture non. L'appartenance est desormais exigee des l'INSERT.
--
-- Meme garde anti-policy-inconnue que plus haut : les policies permissives se
-- combinent en OR.
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
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename = 'conv_messages'
       AND cmd = 'INSERT' AND policyname <> 'conv_messages_insert_member'
  ) THEN
    RAISE EXCEPTION 'policy INSERT conv_messages inattendue : migration refusee';
  END IF;
END $m$;
