-- ═══════════════════════════════════════════════════════════════════════════
-- PASSIO — LES TROIS CORRECTIFS DE SÉCURITÉ DU 2026-09-08, EN UN SEUL FICHIER
--
-- ▶ MODE D'EMPLOI, sans terminal et sans mot de passe à manipuler :
--     1. Ouvre Supabase → SQL Editor → New query
--     2. Copie-colle CE FICHIER EN ENTIER
--     3. Clique « Run »
--     4. Lis le tableau final : chaque ligne doit dire OK.
--
-- ▶ CE QU'IL CORRIGE
--     ① Les photos, fichiers et messages vocaux des conversations privées
--        étaient LISTABLES ET LISIBLES PAR N'IMPORTE QUI, sans compte.
--     ② L'adresse exacte d'une rencontre, le téléphone de son organisateur et
--        la liste nominative des participants étaient publics.
--     ③ La garde de majorité existait côté serveur depuis juin, mais RIEN NE
--        L'APPELAIT : un compte de 13 ans organisait et rejoignait des
--        rencontres. Ce fichier la branche — INTERRUPTEUR ÉTEINT.
--
-- ▶ CE QU'IL NE FAIT PAS
--     · Il n'ALLUME PAS l'accès 18+. Rien ne change pour personne à l'exécution.
--       L'allumage est un geste séparé, à faire APRÈS le déploiement du client
--       (dernière ligne de ce fichier, en commentaire).
--     · Il ne crée, ne modifie et ne supprime AUCUNE donnée. Uniquement des
--       règles d'accès, des droits, des fonctions et un interrupteur.
--
-- ▶ SÛRETÉ
--     TOUT EST DANS UNE SEULE TRANSACTION. La moindre erreur annule
--     l'intégralité : la base ne peut pas rester à moitié corrigée. Le fichier
--     est REJOUABLE : l'exécuter deux fois ne change rien de plus, et ne
--     rétrograde jamais un interrupteur déjà allumé.
--
--     Chaque bloc REFUSE de s'appliquer s'il trouve une règle qu'il ne connaît
--     pas — plutôt que de poser un verrou qu'une règle oubliée annulerait en
--     silence. Si l'exécution s'arrête sur un message « migration refusee »,
--     c'est ce garde-là qui a parlé : rien n'a été appliqué, et le message dit
--     quelle table regarder.
--
--     Éprouvé sur PostgreSQL 16 jetable : 177 contrôles, 0 échec
--     (tests/sql/migration-*.test.sh, joués à chaque commit par la CI).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ========================================================================
-- ① PIECES JOINTES DE MESSAGERIE — cloisonner la lecture
-- source : migrations/migration_storage_lecture_cloisonnee.sql
-- ========================================================================

-- ============================================================================
-- PARTIE A — la lecture par l'API suit la règle de l'écriture
-- ============================================================================

-- Prérequis : la fonction de cloisonnement du 2026-08-17 et l'aide d'appartenance.
DO $prereq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'is_conv_member'
  ) THEN
    RAISE EXCEPTION 'prerequis absent : public.is_conv_member — appliquer migration_fix_conv_members_insert.sql';
  END IF;
END
$prereq$;

-- Les policies permissives se combinent en OU : une policy SELECT inconnue
-- annulerait le cloisonnement en silence. On REFUSE plutôt que d'appliquer un
-- verrou qui ne verrouille rien. `FOR ALL` (cmd = 'ALL') compte comme un SELECT.
DO $guard_read$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND cmd IN ('SELECT', 'ALL')
       AND policyname NOT IN ('passio_media_read', 'passio_content_read', 'passio_attachments_read_membre')
  ) THEN
    RAISE EXCEPTION 'policy SELECT/ALL inattendue sur storage.objects : migration refusee';
  END IF;
END
$guard_read$;

DROP POLICY IF EXISTS "passio_media_read" ON storage.objects;
DROP POLICY IF EXISTS "passio_content_read" ON storage.objects;
DROP POLICY IF EXISTS "passio_attachments_read_membre" ON storage.objects;

-- `content` reste lisible : il porte les médias PUBLICS du produit (avatars,
-- couvertures, photos et vidéos de publications). Le restreindre casserait le
-- fil pour un visiteur sans compte, qui est le parcours d'entrée du produit.
-- ⚠️ Limite connue et assumée : une publication d'un compte PRIVÉ y est donc
-- lisible par URL. C'est un autre lot (la confidentialité des comptes privés
-- côté médias), pas celui-ci.
CREATE POLICY "passio_content_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'content');

-- `attachments` : membre de la conversation, et personne d'autre. Le chemin est
-- `attachments/<convId>/<fichier>`, donc le deuxième segment est l'identifiant
-- de conversation — la même lecture que `storage_chemin_autorise` fait à
-- l'écriture.
-- ⚠️ `is_conv_member` est SECURITY DEFINER, et c'est indispensable : un
-- `select … from conv_members` ici serait soumis à la RLS de cette table dans la
-- sous-requête, et une policy plus stricte demain rendrait l'ensemble vide —
-- c'est-à-dire toutes les pièces jointes cassées, sans un mot en journal.
CREATE POLICY "passio_attachments_read_membre" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND public.is_conv_member((storage.foldername(name))[2], ((SELECT auth.uid()))::text)
  );

-- ========================================================================
-- ② RENCONTRES — adresse, telephone et participants
-- source : migrations/migration_irl_donnees_privees.sql
-- ========================================================================

-- ============================================================================
-- A. `events` : l'adresse et le contact sortent de la lecture publique
-- ============================================================================

-- Une policy SELECT inconnue rendrait le resserrement caduc (les permissives se
-- combinent en OU), et une policy `FOR ALL` porte `cmd = 'ALL'` — le gabarit
-- « Enable all operations » du tableau de bord, donc la dérive la plus probable.
DO $guard_lecture$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename IN ('events', 'event_attendees')
       AND cmd IN ('SELECT', 'ALL')
       AND policyname NOT IN ('Lecture publique', 'Read events', 'event_attendees_select_authentifie')
  ) THEN
    RAISE EXCEPTION 'policy SELECT/ALL inattendue sur events/event_attendees : migration refusee';
  END IF;
END
$guard_lecture$;

-- ⚠️ La liste est EXHAUSTIVE et doit le rester. Une colonne ajoutée demain à
-- `events` ne sera PAS lisible par un visiteur tant qu'elle n'est pas ajoutée
-- ici — c'est le sens voulu du défaut : une donnée nouvelle est privée jusqu'à
-- ce que quelqu'un décide qu'elle est publique.
REVOKE SELECT ON TABLE public.events FROM anon;
GRANT SELECT (
  id, author_id, title, passion_id, lat, lng, city, description, emoji,
  max_attendees, date_at, created_at, venue, postal_code, price,
  external_link, event_type, cover_url, organizer_id, end_at, status,
  updated_at, co_organizers, series_id, recurrence, conv_id
) ON TABLE public.events TO anon;

-- Un compte connecté garde l'accès complet : l'adresse et le contact sont ce
-- qu'on vient chercher quand on décide de s'y rendre.
GRANT SELECT ON TABLE public.events TO authenticated;

-- ============================================================================
-- B. `event_attendees` : la liste des participants demande un compte
-- ============================================================================
DROP POLICY IF EXISTS "Lecture publique" ON public.event_attendees;
DROP POLICY IF EXISTS "event_attendees_select_authentifie" ON public.event_attendees;
CREATE POLICY "event_attendees_select_authentifie" ON public.event_attendees
  FOR SELECT TO authenticated
  USING (true);

-- Défense en profondeur : une policy filtre l'accès, elle ne l'accorde pas.
-- Sans ce REVOKE, le GRANT de table laisserait `anon` passer si une policy
-- permissive réapparaissait.
REVOKE SELECT ON TABLE public.event_attendees FROM anon;

-- ========================================================================
-- ③ ADMISSION 18+ — fondation serveur, interrupteur ETEINT
-- source : migrations/migration_admission_18_plus.sql
-- ========================================================================

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
-- écriture) : il ne peut pas le BASCULER, ni lire cette table. Il en connaît le
-- verdict LE CONCERNANT par `adult_access_status()`, ce qui est voulu — l'état de
-- la règle n'est pas un secret. Seuls `postgres` (SQL Editor,
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
-- ⚠️ `cmd = 'INSERT'` NE SUFFIT PAS. Une policy `FOR ALL` porte `cmd = 'ALL'` dans
-- `pg_policies` : elle autorise l'INSERT et l'UPDATE tout en échappant à un garde
-- qui ne cherche que 'INSERT'/'UPDATE'. Or « Enable all operations » est le
-- gabarit que propose le tableau de bord Supabase — donc la dérive la PLUS
-- probable, et celle que ce garde laissait passer en silence (relevé en revue
-- adversariale, 2026-09-08 : migration acceptée, mineur inscrit, contrôles verts).
DO $guard_events$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename IN ('events', 'event_attendees')
       AND cmd = 'ALL'
  ) THEN
    RAISE EXCEPTION 'policy FOR ALL sur events/event_attendees : migration refusee (elle couvre INSERT et UPDATE en echappant aux gardes)';
  END IF;
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

-- S'inscrire : ligne à soi ET admis. `declined` est la seule exception, et elle
-- doit valoir ici AUSSI, pas seulement sur l'UPDATE : un `upsert` PostgREST
-- (`Prefer: resolution=merge-duplicates`, le `.upsert()` idiomatique de
-- supabase-js) fait évaluer le WITH CHECK d'INSERT AVANT la branche ON CONFLICT.
-- Sans cette exception, le jour où quelqu'un « simplifie » `supaSetEventRsvp` en
-- un upsert, le retrait deviendrait impossible pour exactement les comptes que
-- ce lot promet de laisser sortir — et aucun test ne rougirait.
DROP POLICY IF EXISTS "Ecriture propre" ON public.event_attendees;
DROP POLICY IF EXISTS "event_attendees_insert_own_adult" ON public.event_attendees;
CREATE POLICY "event_attendees_insert_own_adult" ON public.event_attendees
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = ((SELECT auth.uid()))::text
    AND (public.adult_access_allowed() OR rsvp = 'declined')
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

-- ⚠️ UN `WITH CHECK` NE VOIT QUE LA LIGNE FINALE, JAMAIS L'ANCIENNE. L'exception
-- « declined » ouvrait donc bien plus que le retrait : un compte non admis
-- écrivait `checked_in_at`, `rating`, `feedback` — c'est-à-dire une PREUVE DE
-- PARTICIPATION — du moment que la même requête posait `rsvp = 'declined'`.
--     UPDATE event_attendees SET checked_in_at = now(), rsvp = 'declined' → ACCEPTÉ
-- Le pointage alimente « N sur place », le marqueur par participant et le badge
-- « Fiable » ; la note entre dans la moyenne de l'événement. Reproduit en revue
-- adversariale le 2026-09-08.
--
-- Seul un trigger voit OLD. Il ne REFUSE pas le retrait : il RAMÈNE les colonnes
-- de preuve à leur valeur d'avant, pour que « je me retire » ne puisse jamais
-- transporter autre chose que le retrait.
CREATE OR REPLACE FUNCTION public.event_attendees_admission_gardee()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Aucune session (postgres, service_role, tâches d'administration) : la règle
  -- ne s'applique pas. Sans cette sortie, une purge ou une mesure administrative
  -- se ferait effacer ses colonnes en silence.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.adult_access_allowed() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.checked_in_at := NULL;
    NEW.rating        := NULL;
    NEW.feedback      := NULL;
    NEW.rated_at      := NULL;
  ELSE
    NEW.checked_in_at := OLD.checked_in_at;
    NEW.rating        := OLD.rating;
    NEW.feedback      := OLD.feedback;
    NEW.rated_at      := OLD.rated_at;
    -- Ni déplacer sa ligne vers un autre événement, ni vers un autre compte.
    NEW.event_id      := OLD.event_id;
    NEW.user_id       := OLD.user_id;
    NEW.created_at    := OLD.created_at;
  END IF;
  RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION public.event_attendees_admission_gardee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_event_attendees_admission ON public.event_attendees;
CREATE TRIGGER trg_event_attendees_admission
  BEFORE INSERT OR UPDATE ON public.event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.event_attendees_admission_gardee();

-- ⚠️ `events` UPDATE N'ÉTAIT GARDÉ NULLE PART. La policy de production
-- « Update organisateurs » n'a AUCUN `WITH CHECK` : PostgreSQL réutilise alors
-- le `USING`, et `author_id` devient réassignable. Un co-organisateur — promu
-- par un geste produit ordinaire — se déclarait auteur, puis déplaçait la date,
-- le lieu, ou réactivait un événement annulé. Reproduit en revue adversariale.
--
-- Deux règles, et une seule dépend de l'interrupteur :
--   ① `author_id` est IMMUABLE pour qui n'est pas l'auteur courant. Vraie en
--      toutes circonstances : aucun chemin client n'écrit `author_id` sur une
--      édition (`_eventRow` ne le porte pas), c'est un durcissement assumé et
--      c'est la SEULE chose que ce lot change quand l'interrupteur est éteint.
--   ② Un compte non admis ne modifie plus son événement, sauf pour l'ANNULER —
--      le pendant, côté organisateur, du droit de retrait.
CREATE OR REPLACE FUNCTION public.events_admission_gardee()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF NEW.author_id IS DISTINCT FROM OLD.author_id
     AND OLD.author_id IS DISTINCT FROM (auth.uid())::text THEN
    RAISE EXCEPTION 'author_id ne peut etre reassigne que par l''auteur courant'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.adult_access_allowed() THEN RETURN NEW; END IF;

  IF NEW.status = 'cancelled' AND OLD.author_id = (auth.uid())::text THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'modification d''un evenement refusee : admission requise'
    USING ERRCODE = 'check_violation';
END
$$;
REVOKE EXECUTE ON FUNCTION public.events_admission_gardee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_events_admission ON public.events;
CREATE TRIGGER trg_events_admission
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_admission_gardee();

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

-- ═══════════════════════════════════════════════════════════════════════════
-- VERDICT — chaque ligne doit dire OK
-- ═══════════════════════════════════════════════════════════════════════════
SELECT * FROM (
  SELECT 1 AS n, '① Pièces jointes' AS correctif,
         CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                            WHERE schemaname='storage' AND tablename='objects'
                              AND policyname='passio_attachments_read_membre')
               AND NOT EXISTS (SELECT 1 FROM pg_policies
                            WHERE schemaname='storage' AND tablename='objects'
                              AND policyname='passio_media_read')
              THEN 'OK' ELSE 'ECHEC' END AS verdict,
         'La lecture des conversations privées suit enfin l''appartenance.' AS detail
  UNION ALL
  SELECT 2, '② Rencontres',
         CASE WHEN NOT has_column_privilege('anon','public.events','address','SELECT')
               AND NOT has_column_privilege('anon','public.events','contact','SELECT')
               AND NOT has_table_privilege('anon','public.event_attendees','SELECT')
               AND has_column_privilege('anon','public.events','title','SELECT')
              THEN 'OK' ELSE 'ECHEC' END,
         'Adresse, téléphone et participants fermés ; titre et carte toujours visibles.'
  UNION ALL
  SELECT 3, '③ Admission 18+',
         CASE WHEN to_regclass('public.access_policies') IS NOT NULL
               AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
                            WHERE ns.nspname='public' AND p.proname='adult_access_allowed')
               AND EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                            WHERE c.relname='event_attendees' AND t.tgname='trg_event_attendees_admission')
              THEN 'OK' ELSE 'ECHEC' END,
         'La garde de majorité est branchée sur les écritures IRL.'
  UNION ALL
  SELECT 4, '   Interrupteur 18+',
         COALESCE((SELECT CASE WHEN enabled THEN 'ALLUME' ELSE 'eteint (normal)' END
                     FROM public.access_policies WHERE key='irl_adult_only'), 'ABSENT'),
         'Doit dire « eteint » : on l''allume APRÈS le déploiement du client.'
  UNION ALL
  SELECT 5, '   Comptes à faire passer',
         (SELECT count(*)::text FROM auth.users)
         || ' comptes, dont '
         || (SELECT count(*)::text FROM public.user_safety WHERE majority_at IS NOT NULL)
         || ' avec année déclarée',
         'Chaque compte doit ouvrir l''app UNE fois avant l''allumage, sinon il perdra l''accès aux rencontres.'
) v ORDER BY n;

-- ═══════════════════════════════════════════════════════════════════════════
-- APRÈS, ET SEULEMENT APRÈS le déploiement du client + un passage de chaque
-- compte dans l'application, allumer l'accès 18+ :
--
--   UPDATE public.access_policies SET enabled = TRUE, updated_at = NOW()
--    WHERE key = 'irl_adult_only';
--
-- Pour éteindre à tout moment, la même requête avec FALSE.
-- ⚠️ Ne JAMAIS supprimer la ligne pour éteindre : ligne absente = règle EXIGÉE.
-- ═══════════════════════════════════════════════════════════════════════════
