-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE — cloisonner l'écriture. ✅ APPLIQUÉE EN PRODUCTION le 2026-08-17.
--
-- État constaté en base après application (`pg_policies`) : une seule policy par
-- commande, `passio_media_insert_cloisonne` et `passio_media_update_cloisonne`
-- portant toutes deux `storage_chemin_autorise(bucket_id, name)`.
--
-- VÉRIFICATIONS DÉROULÉES, avec leurs résultats — la section « VÉRIFIER APRÈS »
-- plus bas dit quoi faire, celle-ci dit ce qui a été fait :
--   (a) une policy par commande                                    ✅ conforme
--   (b) chemin légitime : dépôt dans son propre dossier            ✅ 200
--       et `posts.media_url` ne contient AUCUN `data:` (0 sur tout
--       l'historique). ⚠️ Ce dernier point ne prouve rien sur le
--       trafic réel : aucun média n'a été publié en production
--       depuis l'application (le dernier date du 2026-08-14). La
--       preuve vient de la suite e2e, pas de la production.
--   (c) `upsert` sur SA PROPRE clé                                 ✅ 200
--       (et `PUT`, l'autre forme d'écrasement du SDK)              ✅ 200
--       re-dépôt SANS upsert → 400, conflit attendu                ✅
--   (d) intrusions refusées — dépôt chez autrui, `move`, `copy`,
--       conversation dont on n'est pas membre                      ✅ ≥ 400
--       (assertions 11 de `tests/e2e/authz-critical.spec.js`)
--   (e) chemin fabriqué `photos/<moi>/../<autrui>/x.png`           ✅ 400
--       → la RLS voit bien le nom NORMALISÉ. Ce point était marqué
--         « non vérifiable avant application » : il est tranché.
--
-- Version 2 (2026-08-17) — corrigée après une revue croisée par un second modèle
-- (canal `codex`, fil « securite ») dont trois objections ont été VÉRIFIÉES et
-- retenues. La version 1 était insuffisante ET dangereuse ; le détail est en bas,
-- section « CE QUE LA REVUE A CHANGÉ », parce qu'il vaut mieux qu'une prochaine
-- lecture sache pourquoi la règle a cette forme.
--
-- ── CE QUI A ÉTÉ MESURÉ (production, compte jetable, puis nettoyé) ─────────
--   ① déposer un `text/html` dans un seau de médias            → HTTP 200
--   ② déposer sous le dossier d'un AUTRE compte                → HTTP 200
--   ③ relire les deux sans aucun jeton                         → HTTP 200
--   ④ DÉPLACER (`/object/move`) son fichier vers le dossier
--      d'un autre compte                                       → HTTP 200
--   ⑤ COPIER (`/object/copy`) vers le dossier d'un autre       → HTTP 200
--   ⑥ chemin contenant `../` : le serveur NORMALISE avant
--      d'enregistrer — la clé finale est `photos/<victime>/…`
-- Les seaux n'ont ni `file_size_limit` ni `allowed_mime_types`.
--
-- Nuance qui abaisse la gravité : Supabase a servi le HTML en `text/plain`.
-- Un fichier déposé ne s'exécute donc pas — ce n'est PAS un XSS stocké. La
-- revue rappelle à juste titre que cette preuve vaut pour CE cas : elle ne dit
-- rien d'un SVG, d'un `Content-Type` explicitement mensongé, ni d'un futur
-- domaine personnalisé qui mettrait le Storage en même origine que l'app.
--
-- ── LE PIÈGE DE CHEMIN ────────────────────────────────────────────────────
-- Les deux seaux n'ont PAS la même convention :
--     content     : <categorie>/<uid>/<fichier>          (app-08 ~2727)
--     attachments : attachments/<conv_id>/<fichier>      (app-09 867, 1565)
-- Une contrainte uniforme « segment 2 = auth.uid() » casserait la messagerie.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Condition de cloisonnement, écrite UNE fois ────────────────────────
-- Une fonction plutôt qu'une expression recopiée : elle doit valoir pour
-- l'INSERT *et* pour l'UPDATE, et deux copies finissent toujours par diverger.
create or replace function public.storage_chemin_autorise(_bucket text, _name text)
returns boolean
language sql
stable
as $$
  select
    (_bucket = 'content'
      and (storage.foldername(_name))[2] = (select auth.uid())::text)
    or
    -- `is_conv_member` est SECURITY DEFINER (vérifié). Un `select … from
    -- conv_members` serait soumis à la RLS de cette table DANS la sous-requête :
    -- une policy de lecture plus stricte demain renverrait un ensemble vide,
    -- c'est-à-dire les pièces jointes cassées pour tous, sans un mot en journal.
    (_bucket = 'attachments'
      and public.is_conv_member((storage.foldername(_name))[2], (select auth.uid())::text));
$$;

-- ── 2. INSERT ─────────────────────────────────────────────────────────────
-- On lit les noms RÉELS dans pg_policies : un `drop policy` sur un nom inventé
-- ne supprime rien, laisse l'ancienne en place, et les policies permissives se
-- combinent en OU — le correctif serait sans effet, silencieusement.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname='storage' and tablename='objects' and cmd='INSERT'
  loop execute format('drop policy %I on storage.objects', p.policyname); end loop;
end $$;

create policy passio_media_insert_cloisonne on storage.objects
  for insert to public
  with check (public.storage_chemin_autorise(bucket_id, name));

-- ── 3. UPDATE — c'est ici que la version 1 laissait la porte ouverte ──────
-- `move` et `copy` ne passent PAS par l'INSERT : renommer un objet est un
-- UPDATE de sa colonne `name`. L'ancienne policy portait `using (owner =
-- auth.uid())` et AUCUN `with check` — or Postgres réutilise alors `using` pour
-- la nouvelle ligne, et l'owner ne change pas lors d'un renommage. Déplacer son
-- propre fichier dans le dossier d'autrui satisfaisait donc la condition.
-- Mesuré : HTTP 200. Fermer l'INSERT sans fermer l'UPDATE n'aurait rien fermé.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname='storage' and tablename='objects' and cmd='UPDATE'
  loop execute format('drop policy %I on storage.objects', p.policyname); end loop;
end $$;

create policy passio_media_update_cloisonne on storage.objects
  for update to public
  using  (bucket_id in ('content','attachments') and owner = (select auth.uid()))
  with check (public.storage_chemin_autorise(bucket_id, name));

-- ── 4. Borner la TAILLE, et elle seule ────────────────────────────────────
-- 50 Mo : la plus grosse vidéo réelle pèse 30,9 Mo (mesuré le 2026-08-17).
update storage.buckets
   set file_size_limit = 52428800
 where name in ('content','attachments');

-- ⛔ `allowed_mime_types` N'EST PAS POSÉ ICI, DÉLIBÉRÉMENT.
-- La revue a soulevé le risque, et la lecture du code l'a CONFIRMÉ : trois
-- chemins d'envoi légitimes ne portent pas un type de la liste qu'on serait
-- tenté d'écrire —
--     app-08 ~2709 : repli explicite sur `application/octet-stream`
--     app-09 ~874  : `new Blob([ab], { type: file.type })`, et `file.type` est
--                    vide quand le navigateur ne sait pas typer le fichier
--     app-09 ~1495 : `_voiceRecorder.mimeType`, qui vaut `audio/webm;codecs=opus`
--                    — le suffixe n'est pas retiré, contrairement à la ligne 957
-- Et l'échec serait silencieux au pire endroit : `if (error) return base64Data`
-- (app-08 ~2733) recopie le média EN BASE. Restreindre les types réintroduirait
-- donc exactement le défaut SYNC-B64-005, corrigé le 2026-08-16.
-- Ordre correct : d'abord normaliser le type à l'émission (retirer `;codecs=`,
-- déduire un type par défaut au lieu d'`octet-stream`), MESURER les types
-- réellement reçus, puis seulement poser la liste.

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFIER APRÈS — dans cet ordre, sans s'arrêter au premier vert.
--
-- a) Une seule policy par commande (sinon elles se combinent en OU) :
--      select cmd, policyname from pg_policies
--       where schemaname='storage' and tablename='objects' order by cmd;
--    → une INSERT, une UPDATE, une SELECT, une DELETE.
--
-- b) Le chemin légitime passe encore — LE risque de cette migration. Un envoi
--    refusé ne se voit pas à l'écran (repli base64). Dérouler la suite entière :
--      PASSIO_E2E_MULTI=1 npx playwright test
--    puis vérifier qu'aucune ligne récente de `posts.media_url` ne commence par
--    `data:` :
--      select count(*) from posts where media_url like 'data:%'
--       and created_at > now() - interval '1 hour';
--
-- c) `upsert: true` : réécrire SON PROPRE fichier doit continuer de marcher.
--    La revue signale à raison que l'upsert peut impliquer INSERT *et* UPDATE
--    (et parfois SELECT) — ça ne se déduit pas, ça se teste : déposer, puis
--    redéposer la même clé, et confirmer que le contenu a changé.
--
-- d) Les intrusions sont refusées. À ajouter dans `authz-critical.spec.js`
--    UNE FOIS LA MIGRATION APPLIQUÉE — jamais avant : un rouge connu dans le
--    gate finit par faire désactiver le gate.
--
--    ⚠️ Utiliser un type MIME AUTORISÉ (`image/png`) et non `text/plain` : si
--    une liste MIME est posée un jour, un test en `text/plain` serait refusé
--    pour la mauvaise raison et passerait au vert alors même que le
--    cloisonnement de chemin serait cassé. On isole une propriété à la fois.
--
--      // ① B dépose sous le dossier de A
--      const r1 = await fetch(`${URL}/storage/v1/object/content/photos/${A.uid}/x.png`, {
--        method: "POST",
--        headers: { apikey: ANON, Authorization: "Bearer " + B.token, "Content-Type": "image/png" },
--        body: pngMinimal,
--      });
--      expect(r1.status, "B écrit chez A → refusé").toBeGreaterThanOrEqual(400);
--
--      // ② B DÉPLACE son fichier vers le dossier de A (le contournement mesuré)
--      const r2 = await fetch(`${URL}/storage/v1/object/move`, {
--        method: "POST",
--        headers: { apikey: ANON, Authorization: "Bearer " + B.token, "Content-Type": "application/json" },
--        body: JSON.stringify({ bucketId: "content",
--          sourceKey: `photos/${B.uid}/sien.png`, destinationKey: `photos/${A.uid}/vole.png` }),
--      });
--      expect(r2.status, "B déplace chez A → refusé").toBeGreaterThanOrEqual(400);
--
--      // ③ COPY, même exigence
--      // ④ pièce jointe dans une conversation dont B n'est pas membre → refusé
--
-- e) Chemin fabriqué : déposer `photos/<sonUid>/../<autreUid>/x.png`. Le serveur
--    normalise AVANT d'enregistrer (mesuré : la clé finale est celle de l'autre
--    dossier) ; la RLS devrait donc voir le nom normalisé et refuser. **Non
--    vérifiable avant application** — à mesurer explicitement après.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ────────────────────────────────────
-- Elle ne referme pas la LECTURE : les seaux restent publics, donc toute URL
-- connue reste lisible, y compris celle d'un compte supprimé
-- (`MEDIA-COMPTE-SUPPRIME-010`). Elle ne pose pas de quota global non plus :
-- 50 Mo est une limite PAR OBJET, et rien n'empêche de multiplier les objets.
--
-- ── CE QUE LA REVUE CROISÉE A CHANGÉ ──────────────────────────────────────
-- Trois objections soulevées par le second modèle, chacune vérifiée avant d'être
-- retenue — deux confirmées, une nuancée :
--   1. « move/copy ne passent pas par INSERT » → VÉRIFIÉ en production (200) :
--      la version 1 ne fermait rien. C'est la correction la plus importante.
--   2. « allowed_mime_types casserait des envois » → VÉRIFIÉ dans le code :
--      trois chemins émettent un type hors liste, et l'échec retomberait en
--      base64. La liste est retirée.
--   3. « le test d'intrusion en text/plain sera invalide » → juste : il aurait
--      été refusé pour le type, pas pour le chemin. Le test annexé utilise
--      `image/png`.
-- ═══════════════════════════════════════════════════════════════════════════
