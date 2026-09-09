-- STORAGE — CLOISONNER LA LECTURE DES PIÈCES JOINTES (2026-09-08)
--
-- LE DÉFAUT, mesuré en production le 2026-09-08 :
--   policy `passio_media_read` : SELECT, rôle {public}, expression
--       bucket_id = ANY (ARRAY['content','attachments'])
--   Autrement dit : **n'importe qui, y compris sans compte, peut LISTER et LIRE
--   par l'API tout le contenu du seau `attachments`** — les photos, fichiers et
--   messages vocaux échangés dans les conversations privées. Ce n'est pas une
--   fuite par URL devinée : c'est une énumération, `/object/list` comprise.
--   (12 objets, 4 conversations, au 2026-09-08.)
--
-- L'ÉCRITURE, elle, est déjà cloisonnée depuis le 2026-08-17
-- (`migration_storage_cloisonnement.sql`) par `storage_chemin_autorise`, qui
-- dit exactement la bonne règle :
--     attachments/<convId>/<fichier>  →  is_conv_member(<convId>, auth.uid())
-- Cette migration ne fait qu'appliquer LA MÊME RÈGLE à la lecture. Aucun
-- prédicat nouveau n'est inventé : celui qui gouverne le dépôt gouverne l'accès.
--
-- ⚠️ CE QU'ELLE NE CASSE PAS, ET POURQUOI ON PEUT L'APPLIQUER TOUT DE SUITE.
-- Le client lit les pièces jointes par `getPublicUrl`, c'est-à-dire la route
-- `/object/public/attachments/…`, qui contourne la RLS tant que le seau est
-- déclaré public. Restreindre la policy ferme donc l'ÉNUMÉRATION et la lecture
-- par l'API authentifiée, sans changer une ligne de rendu. On passe de
-- « n'importe qui peut parcourir les conversations privées » à « il faut déjà
-- détenir l'URL exacte ».
--
-- ⚠️ CE N'EST DONC PAS LE CORRECTIF COMPLET. Le correctif complet est en pied de
-- fichier (PARTIE B) : passer le seau en privé et faire signer les URL par le
-- client. Il EXIGE un lot client (URL signées à l'affichage) et ne doit pas être
-- appliqué avant lui, sinon les pièces jointes disparaissent pour tout le monde.
-- Appliquer la PARTIE A seule est un gain net et sans risque ; s'arrêter là
-- serait en revanche se raconter que le sujet est clos.
--
-- Le fichier est atomique : toute erreur annule tout.

BEGIN;

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

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE B — LE CORRECTIF COMPLET. **NE PAS APPLIQUER AVANT LE LOT CLIENT.**
-- ═══════════════════════════════════════════════════════════════════════════
-- Tant que `attachments` est déclaré public, la route `/object/public/…` sert
-- les fichiers sans consulter la RLS : détenir l'URL suffit. Or ces URL sont
-- stockées en clair dans `conv_messages.content`, donc lisibles par tout membre
-- d'une conversation — et conservées indéfiniment, même après suppression du
-- message.
--
-- Le passage en privé exige que le client demande des URL SIGNÉES
-- (`createSignedUrl`) au lieu de `getPublicUrl`, aux deux points de dépôt
-- (`js/app-09-boot-pwa.js` : pièce jointe et message vocal) ET à l'affichage,
-- avec un renouvellement quand la signature expire. Les URL déjà stockées en
-- base devront être resignées à la lecture.
--
-- Appliquer ceci sans ce lot ferait disparaître toutes les pièces jointes.
--
--   UPDATE storage.buckets SET public = FALSE WHERE id = 'attachments';
--
-- Retour arrière de la PARTIE A (restaure l'état d'avant, qui est le défaut) :
--   BEGIN;
--   DROP POLICY IF EXISTS "passio_content_read" ON storage.objects;
--   DROP POLICY IF EXISTS "passio_attachments_read_membre" ON storage.objects;
--   CREATE POLICY "passio_media_read" ON storage.objects FOR SELECT
--     USING (bucket_id = ANY (ARRAY['content','attachments']));
--   COMMIT;
