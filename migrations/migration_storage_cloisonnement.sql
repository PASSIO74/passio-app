-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE — cloisonner l'écriture. PRÉPARÉE, NON APPLIQUÉE.
--
-- ⚠️ Cette migration modifie des policies RLS. Elle attend une supervision :
--    ne pas l'appliquer sans avoir déroulé la section « VÉRIFIER APRÈS ».
--
-- ── CE QUI A ÉTÉ MESURÉ (2026-08-17, production) ──────────────────────────
-- La policy d'INSERT sur `storage.objects` était :
--     with check (bucket_id in ('content','attachments') and auth.role() = 'authenticated')
-- Aucune contrainte de CHEMIN. Vérifié empiriquement avec un compte jetable,
-- puis nettoyé :
--   ① déposer un fichier `text/html` dans un seau de médias  → HTTP 200
--   ② déposer un fichier sous le dossier d'un AUTRE compte   → HTTP 200
--   ③ relire les deux sans aucun jeton                       → HTTP 200
-- Et les seaux n'ont ni `file_size_limit` ni `allowed_mime_types` (NULL).
--
-- Nuance mesurée, qui abaisse la gravité : Supabase a servi le HTML en
-- `text/plain`. Un fichier déposé ne s'exécute donc pas dans le navigateur —
-- ce n'est PAS un XSS stocké. Ce qui reste :
--   • n'importe quel compte peut écrire sous le dossier de n'importe qui —
--     ce qui fausse aussi toute attribution par dossier (le script
--     `purge-e2e-storage.js` raisonne ainsi) ;
--   • n'importe quel compte peut déposer un fichier de n'importe quel type et
--     de n'importe quelle taille, et en obtenir une URL publique permanente sur
--     le domaine du projet. Sur une beta ouverte, c'est un hébergement gratuit
--     offert à tout venant, avec la facture et la responsabilité qui vont avec.
--
-- ── LE PIÈGE À NE PAS RATER ───────────────────────────────────────────────
-- Les deux seaux N'ONT PAS la même convention de chemin :
--     content     : <categorie>/<uid>/<fichier>          (app-08, ligne ~2727)
--     attachments : attachments/<conv_id>/<fichier>      (app-09, lignes 867, 1565)
-- Une contrainte uniforme « segment 2 = auth.uid() » CASSERAIT la messagerie.
-- D'où deux policies distinctes : appartenance au compte pour `content`,
-- appartenance à la CONVERSATION pour `attachments`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Remplacer la policy d'INSERT ───────────────────────────────────────
-- On lit les noms RÉELS dans pg_policies plutôt que de les deviner : un
-- `drop policy` sur un nom inventé ne supprime rien, laisse l'ancienne policy
-- en place, et les policies permissives se combinent en OU — le correctif
-- serait alors sans effet, silencieusement. (Piège vécu le 2026-08-16.)
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd = 'INSERT'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy passio_media_insert_cloisonne on storage.objects
  for insert to public
  with check (
    -- `content` : on n'écrit que dans SON dossier.
    (bucket_id = 'content'
      and (storage.foldername(name))[2] = (select auth.uid())::text)
    or
    -- `attachments` : on n'écrit que dans une conversation dont on est membre.
    -- On passe par `is_conv_member` (SECURITY DEFINER, vérifié) plutôt que par
    -- un `select … from conv_members` : la RLS de cette table s'appliquerait
    -- DANS la sous-requête, et une policy de lecture un peu plus stricte
    -- demain renverrait un ensemble vide — c'est-à-dire l'envoi de pièces
    -- jointes cassé pour tout le monde, sans un mot dans les journaux.
    (bucket_id = 'attachments'
      and public.is_conv_member((storage.foldername(name))[2], (select auth.uid())::text))
  );

-- ── 2. Borner les seaux ───────────────────────────────────────────────────
-- 50 Mo : la plus grosse vidéo réelle en base pèse 30,9 Mo (2026-08-17).
-- Les types listés sont ceux que l'application produit réellement (app-08 :
-- jpeg/png/webp/gif/mp3 ; app-09 : webm audio ; bobines : mp4).
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array[
         'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
         'video/mp4','video/webm','video/quicktime',
         'audio/mpeg','audio/webm','audio/mp4','audio/ogg'
       ]
 where name in ('content','attachments');

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFIER APRÈS — dans cet ordre, et ne pas s'arrêter au premier vert.
--
-- a) La policy est bien SEULE en INSERT (sinon elles se combinent en OU) :
--      select policyname, with_check from pg_policies
--       where schemaname='storage' and tablename='objects' and cmd='INSERT';
--    → exactement UNE ligne.
--
-- b) Le chemin légitime passe encore. C'est LE risque de cette migration :
--    une contrainte trop stricte casse l'envoi de médias sans que rien ne le
--    dise à l'écran (le code retombe sur le base64 : `if (error) return
--    base64Data`, app-08 ~2733). Dérouler la suite complète :
--      PASSIO_E2E_MULTI=1 npx playwright test
--    Les specs qui envoient réellement : cdv, irl, interactions, multi-comptes.
--
-- c) L'intrusion est refusée. À ajouter dans `tests/e2e/authz-critical.spec.js`
--    UNE FOIS LA MIGRATION APPLIQUÉE — jamais avant : un rouge connu dans le
--    gate finit par faire désactiver le gate.
--
--      // B dépose un fichier sous le dossier de A → doit être refusé
--      const r = await fetch(`${URL}/storage/v1/object/content/photos/${A.uid}/intrus.txt`, {
--        method: "POST",
--        headers: { apikey: ANON, Authorization: "Bearer " + B.token, "Content-Type": "text/plain" },
--        body: "intrusion",
--      });
--      expect(r.status, "B écrit dans le dossier de A → refusé").toBeGreaterThanOrEqual(400);
--
--      // B dépose dans une conversation dont il n'est pas membre → refusé
--      const r2 = await fetch(`${URL}/storage/v1/object/attachments/attachments/${convDeA}/x.txt`, { … });
--      expect(r2.status).toBeGreaterThanOrEqual(400);
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ────────────────────────────────────
-- Elle ne referme pas la LECTURE : les seaux restent publics, donc toute URL
-- connue reste lisible, y compris celle d'un compte supprimé
-- (`MEDIA-COMPTE-SUPPRIME-010`). Fermer la lecture demande des URLs signées,
-- c'est-à-dire une autre architecture d'affichage — un arbitrage produit.
-- ═══════════════════════════════════════════════════════════════════════════
