-- ════════════════════════════════════════════════════════════════════════
-- PURGE DES DONNÉES DE TEST (comptes "Test Alice" / "Test Bob")
-- ════════════════════════════════════════════════════════════════════════
-- Contexte : le test E2E 2 comptes (tests/e2e/multi-comptes.spec.js) écrit en
-- base RÉELLE. Quand un run échoue AVANT son étape de nettoyage, il laisse des
-- lignes orphelines (post, commentaires, likes, follows, notifications, profils
-- anonymes). Ce script les supprime.
--
-- ⚠️ À EXÉCUTER DANS LE SQL EDITOR DU DASHBOARD SUPABASE (rôle postgres /
--    service_role) : il supprime aussi des lignes d'AUTRES utilisateurs
--    (notifications reçues par les comptes de test) et des entrées auth.users,
--    ce que la clé anon ne peut pas faire (RLS).
--
-- ⚠️ Cible les profils dont le username est EXACTEMENT 'Test Alice' ou
--    'Test Bob' (utilisés uniquement par les tests). Lance D'ABORD le bloc 1
--    (aperçu) et vérifie que rien d'inattendu n'apparaît avant le bloc 2.
-- ════════════════════════════════════════════════════════════════════════

-- ── Bloc 1 : APERÇU (lecture seule) — exécute-le seul d'abord ───────────────
WITH test_users AS (
  SELECT id, username FROM profiles
  WHERE username IN ('Test Alice', 'Test Bob')
)
SELECT 'profiles'        AS table_name, count(*) AS lignes FROM profiles        WHERE id IN (SELECT id FROM test_users)
UNION ALL SELECT 'posts',            count(*) FROM posts            WHERE author_id IN (SELECT id FROM test_users) OR content = 'Post de Alice [test notif auto]'
UNION ALL SELECT 'post_comments',    count(*) FROM post_comments    WHERE author_id IN (SELECT id FROM test_users) OR content LIKE '%[test notif auto]%'
UNION ALL SELECT 'post_likes',       count(*) FROM post_likes       WHERE user_id   IN (SELECT id FROM test_users)
UNION ALL SELECT 'follows',          count(*) FROM follows          WHERE follower_id IN (SELECT id FROM test_users) OR following_id IN (SELECT id FROM test_users)
UNION ALL SELECT 'notifications',    count(*) FROM notifications    WHERE user_id   IN (SELECT id FROM test_users) OR from_id IN (SELECT id FROM test_users)
UNION ALL SELECT 'conv_members',     count(*) FROM conv_members     WHERE user_id   IN (SELECT id FROM test_users)
UNION ALL SELECT 'stories',          count(*) FROM stories          WHERE author_id IN (SELECT id FROM test_users)
UNION ALL SELECT 'events',           count(*) FROM events           WHERE author_id IN (SELECT id FROM test_users)
UNION ALL SELECT 'auth.users',       count(*) FROM auth.users       WHERE id IN (SELECT id FROM test_users);

-- ── Bloc 2 : SUPPRESSION — n'exécute ce bloc QUE si l'aperçu est conforme ───
-- (Décommente tout le bloc ci-dessous puis exécute-le d'un seul tenant.)
-- On fige d'abord les ids de test dans une table temporaire : ainsi auth.users
-- est supprimé par id EXACT (jamais "tous les anonymes"), et l'ordre est FK-safe.
/*
BEGIN;

CREATE TEMP TABLE _test_uids ON COMMIT DROP AS
  SELECT id FROM profiles WHERE username IN ('Test Alice', 'Test Bob');

DELETE FROM notifications WHERE user_id IN (SELECT id FROM _test_uids)
                             OR from_id IN (SELECT id FROM _test_uids);
DELETE FROM follows       WHERE follower_id IN (SELECT id FROM _test_uids)
                             OR following_id IN (SELECT id FROM _test_uids);
DELETE FROM post_likes    WHERE user_id IN (SELECT id FROM _test_uids);
DELETE FROM post_comments WHERE author_id IN (SELECT id FROM _test_uids)
                             OR content LIKE '%[test notif auto]%';
DELETE FROM posts         WHERE author_id IN (SELECT id FROM _test_uids)
                             OR content = 'Post de Alice [test notif auto]';
DELETE FROM stories       WHERE author_id IN (SELECT id FROM _test_uids);
DELETE FROM events        WHERE author_id IN (SELECT id FROM _test_uids);
DELETE FROM conv_messages WHERE from_id IN (SELECT id FROM _test_uids);
DELETE FROM conv_members  WHERE user_id IN (SELECT id FROM _test_uids);

-- Conversations devenues orphelines (plus aucun membre)
DELETE FROM conversations c
WHERE NOT EXISTS (SELECT 1 FROM conv_members m WHERE m.conv_id = c.id);

-- Profils de test, puis comptes auth anonymes — par id EXACT (sûr).
DELETE FROM profiles  WHERE id IN (SELECT id FROM _test_uids);
DELETE FROM auth.users WHERE id IN (SELECT id FROM _test_uids);

COMMIT;
*/
