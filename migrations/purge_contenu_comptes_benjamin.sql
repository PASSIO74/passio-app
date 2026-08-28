-- ════════════════════════════════════════════════════════════════════════
-- PURGE DU CONTENU PUBLIÉ PAR LES DEUX COMPTES DE TEST DE BENJAMIN
-- ════════════════════════════════════════════════════════════════════════
-- Demandé le 2026-08-28 : « supprime tout le contenu que j'ai publié avec mes
-- deux comptes test, je ne veux plus rien voir ».
--
-- CE QUE CE SCRIPT FAIT   : il efface le CONTENU (publications, bobines,
--                           commentaires, likes, stories, activités, réactions,
--                           carnets de voyage / lives, notifications émises)
--                           des deux comptes nommés ci-dessous.
-- CE QU'IL NE FAIT PAS    : il ne supprime NI les comptes (auth.users), NI les
--                           profils, NI les abonnements, NI les conversations.
--                           Les deux comptes restent utilisables pour tester,
--                           avec un mur vide. Pour supprimer un compte ENTIER,
--                           l'application a déjà le geste : Réglages →
--                           « Supprimer mon compte » (doDeleteAccount).
--
-- ⚠️ À EXÉCUTER DANS LE SQL EDITOR DU DASHBOARD SUPABASE (rôle postgres /
--    service_role). La clé anon en est incapable : la RLS interdit de toucher
--    les lignes reçues (notifications, participations) d'autres comptes.
--
-- ⚠️ LANCE D'ABORD LE BLOC 1 SEUL. Il ne lit rien d'autre que des compteurs.
--    Vérifie les chiffres, puis seulement ensuite décommente le bloc 2.
--
-- ⚠️ POINT NON ÉVIDENT, et c'est celui qui fait échouer une purge naïve :
--    l'application réplique l'état local (dont `userPosts`, la copie locale de
--    tes publications) dans la table `user_state`. Supprimer les lignes de
--    `posts` NE SUFFIT PAS : au prochain démarrage, `supaLoadUserState()`
--    restaure `userPosts` depuis le serveur et les publications réapparaissent.
--    Le bloc 2 vide donc aussi ces tableaux dans `user_state.data`.
-- ════════════════════════════════════════════════════════════════════════

-- ── Bloc 1 : APERÇU (lecture seule) — exécute-le SEUL d'abord ───────────────
WITH cibles AS (
  SELECT id, email FROM auth.users
  WHERE lower(email) IN ('contact@ladamemetallerie.com', 'benjamin.ladame@gmail.com')
)
SELECT 'comptes trouvés'   AS objet, count(*) AS lignes FROM cibles
UNION ALL SELECT 'posts',             count(*) FROM posts             WHERE author_id  IN (SELECT id FROM cibles)
UNION ALL SELECT 'post_comments',     count(*) FROM post_comments     WHERE author_id  IN (SELECT id FROM cibles)
UNION ALL SELECT 'post_likes',        count(*) FROM post_likes        WHERE user_id    IN (SELECT id FROM cibles)
UNION ALL SELECT 'comment_likes',     count(*) FROM comment_likes     WHERE user_id    IN (SELECT id FROM cibles)
UNION ALL SELECT 'comment_interactions', count(*) FROM comment_interactions WHERE user_id IN (SELECT id FROM cibles)
UNION ALL SELECT 'stories',           count(*) FROM stories           WHERE author_id  IN (SELECT id FROM cibles)
UNION ALL SELECT 'events',            count(*) FROM events            WHERE author_id  IN (SELECT id FROM cibles)
UNION ALL SELECT 'event_attendees',   count(*) FROM event_attendees   WHERE user_id    IN (SELECT id FROM cibles)
UNION ALL SELECT 'event_comments',    count(*) FROM event_comments    WHERE author_id  IN (SELECT id FROM cibles)
UNION ALL SELECT 'event_reactions',   count(*) FROM event_reactions   WHERE user_id    IN (SELECT id FROM cibles)
UNION ALL SELECT 'cdv_lives',         count(*) FROM cdv_lives         WHERE author_id  IN (SELECT id FROM cibles)
UNION ALL SELECT 'notifications émises', count(*) FROM notifications  WHERE from_id    IN (SELECT id FROM cibles)
UNION ALL SELECT 'user_state',        count(*) FROM user_state        WHERE user_id    IN (SELECT id FROM cibles);

-- ── Bloc 2 : SUPPRESSION — n'exécute ce bloc QUE si l'aperçu est conforme ───
-- Décommente tout le bloc puis exécute-le d'un seul tenant : la transaction
-- garantit que tout part ensemble, ou rien. L'ordre est FK-safe (les tables
-- filles avant les tables mères).
/*
BEGIN;

CREATE TEMP TABLE _cibles ON COMMIT DROP AS
  SELECT id FROM auth.users
  WHERE lower(email) IN ('contact@ladamemetallerie.com', 'benjamin.ladame@gmail.com');

-- Garde-fou : si la résolution par e-mail n'a rien trouvé, on s'arrête net
-- plutôt que d'exécuter des DELETE sur un ensemble vide (ou pire, mal ciblé).
DO $$
BEGIN
  IF (SELECT count(*) FROM _cibles) <> 2 THEN
    RAISE EXCEPTION 'Attendu 2 comptes, trouvé %. Vérifie les adresses.', (SELECT count(*) FROM _cibles);
  END IF;
END $$;

-- ① Ce qui pend aux publications (avant les publications elles-mêmes).
DELETE FROM comment_interactions WHERE user_id IN (SELECT id FROM _cibles);
DELETE FROM comment_likes        WHERE user_id IN (SELECT id FROM _cibles);
DELETE FROM post_likes           WHERE user_id IN (SELECT id FROM _cibles);
DELETE FROM post_comments        WHERE author_id IN (SELECT id FROM _cibles);
DELETE FROM post_collaborators   WHERE user_id IN (SELECT id FROM _cibles);
-- …et tout ce qui pend aux publications DES CIBLES, écrit par d'autres comptes.
DELETE FROM comment_interactions WHERE comment_id IN (SELECT id FROM post_comments WHERE post_id IN (SELECT id FROM posts WHERE author_id IN (SELECT id FROM _cibles)));
DELETE FROM comment_likes        WHERE comment_id IN (SELECT id FROM post_comments WHERE post_id IN (SELECT id FROM posts WHERE author_id IN (SELECT id FROM _cibles)));
DELETE FROM post_comments        WHERE post_id IN (SELECT id FROM posts WHERE author_id IN (SELECT id FROM _cibles));
DELETE FROM post_likes           WHERE post_id IN (SELECT id FROM posts WHERE author_id IN (SELECT id FROM _cibles));
DELETE FROM posts                WHERE author_id IN (SELECT id FROM _cibles);

-- ② Stories.
DELETE FROM story_views WHERE story_id IN (SELECT id FROM stories WHERE author_id IN (SELECT id FROM _cibles));
DELETE FROM story_views WHERE viewer_id IN (SELECT id FROM _cibles);
DELETE FROM stories     WHERE author_id IN (SELECT id FROM _cibles);

-- ③ Activités IRL : les miennes, et mes participations aux autres.
DELETE FROM event_reactions WHERE user_id IN (SELECT id FROM _cibles);
DELETE FROM event_comments  WHERE author_id IN (SELECT id FROM _cibles);
DELETE FROM event_attendees WHERE user_id IN (SELECT id FROM _cibles);
DELETE FROM event_reactions WHERE event_id IN (SELECT id FROM events WHERE author_id IN (SELECT id FROM _cibles));
DELETE FROM event_comments  WHERE event_id IN (SELECT id FROM events WHERE author_id IN (SELECT id FROM _cibles));
DELETE FROM event_attendees WHERE event_id IN (SELECT id FROM events WHERE author_id IN (SELECT id FROM _cibles));
DELETE FROM events          WHERE author_id IN (SELECT id FROM _cibles);

-- ④ Carnets de voyage / lives.
DELETE FROM step_interactions        WHERE user_id IN (SELECT id FROM _cibles);
DELETE FROM cdv_live_reactions       WHERE user_id IN (SELECT id FROM _cibles);
DELETE FROM cdv_live_comments        WHERE author_id IN (SELECT id FROM _cibles);
DELETE FROM cdv_live_followers       WHERE user_id IN (SELECT id FROM _cibles);
DELETE FROM cdv_live_collaborators   WHERE user_id IN (SELECT id FROM _cibles);
DELETE FROM cdv_live_reactions       WHERE live_id IN (SELECT id FROM cdv_lives WHERE author_id IN (SELECT id FROM _cibles));
DELETE FROM cdv_live_comments        WHERE live_id IN (SELECT id FROM cdv_lives WHERE author_id IN (SELECT id FROM _cibles));
DELETE FROM cdv_live_followers       WHERE live_id IN (SELECT id FROM cdv_lives WHERE author_id IN (SELECT id FROM _cibles));
DELETE FROM cdv_live_collaborators   WHERE live_id IN (SELECT id FROM cdv_lives WHERE author_id IN (SELECT id FROM _cibles));
DELETE FROM cdv_live_steps           WHERE live_id IN (SELECT id FROM cdv_lives WHERE author_id IN (SELECT id FROM _cibles));
DELETE FROM cdv_lives                WHERE author_id IN (SELECT id FROM _cibles);

-- ⑤ Notifications ÉMISES par ces comptes (celles que les autres ont reçues).
DELETE FROM notifications WHERE from_id IN (SELECT id FROM _cibles);

-- ⑥ LE POINT CRITIQUE : vider la copie locale répliquée sur le serveur.
--    Sans ceci, `supaLoadUserState()` restaure `userPosts` au prochain
--    démarrage et tout le contenu supprimé réapparaît à l'écran.
UPDATE user_state
   SET data = jsonb_set(
                jsonb_set(coalesce(data, '{}'::jsonb), '{userPosts}',  '[]'::jsonb, true),
                '{userEvents}', '[]'::jsonb, true)
 WHERE user_id IN (SELECT id FROM _cibles);

COMMIT;
*/

-- ── Bloc 3 : CONTRÔLE (lecture seule) — relance le bloc 1 après le bloc 2.
-- Tous les compteurs doivent être à 0, sauf « comptes trouvés » (2) et
-- « user_state » (2 : les lignes existent toujours, mais vidées de leurs posts).

-- ── Et sur l'appareil ──────────────────────────────────────────────────────
-- Après la purge, sur chaque téléphone déjà connecté, l'état LOCAL contient
-- encore les publications : il faut le laisser se réaligner sur le serveur.
-- Le plus simple, dans l'application : Réglages → Se déconnecter, puis se
-- reconnecter (`purgeAccountScopedData()` efface les 13 clés locales et les
-- conversations IndexedDB, et `supaLoadUserState()` recharge l'état vidé).
