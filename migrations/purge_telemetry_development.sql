-- ═══════════════════════════════════════════════════════════════════════════
-- PURGE DU BRUIT DE DÉVELOPPEMENT dans telemetry_events.
--
-- ⚠️ DESTRUCTIVE — PRÉPARÉE, NON EXÉCUTÉE. À passer sous supervision.
--
-- POURQUOI
-- Il n'existe qu'une seule base Supabase : ce qui est émis depuis localhost
-- atterrit dans la table de PRODUCTION. La télémétrie était active par défaut
-- en local, et les ~15 specs e2e chargent l'app à chaque exécution.
--
-- Mesuré le 2026-08-16 :
--   development : 40 625 événements  (dernier : 16/08 04:55)
--   production  : 10 532 événements  (dernier : 15/08 17:55)
-- Soit 79 % de la table produite par des tests.
--
-- Le dashboard filtrait déjà sur `env=production` (commit 816f11e) : il restait
-- donc honnête. Ce qui ne l'était pas : la taille de la table, son coût, et
-- toute analyse SQL directe — celle qu'on fait justement en audit.
--
-- LA CAUSE EST DÉJÀ CORRIGÉE
-- `js/telemetry.js` : en local, opt-in explicite désormais (`?telemetry=1`),
-- plus d'activation par défaut. Deux tests gardent les deux sens :
-- tests/e2e/telemetrie-preauth.spec.js. Cette purge ne traite donc que
-- l'accumulé — elle n'a pas vocation à être rejouée régulièrement.
--
-- ORDRE D'EXÉCUTION IMPORTANT : purger APRÈS avoir déployé le correctif,
-- sinon la prochaine exécution de la suite e2e reconstitue le bruit.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Contrôle AVANT (lire le résultat, ne pas enchaîner à l'aveugle) ──────
select env,
       count(*)                        as evenements,
       min(received_at)                as premier,
       max(received_at)                as dernier
  from public.telemetry_events
 group by env
 order by count(*) desc;

-- ── 2. La purge ─────────────────────────────────────────────────────────────
-- Ne touche QUE `development`. `preview` est conservé : un déploiement de
-- prévisualisation est un vrai environnement, ses données ont un sens.
-- begin;
--   delete from public.telemetry_events where env = 'development';
--   -- Vérifier le nombre de lignes supprimées AVANT de valider.
-- commit;   -- ou rollback; si le compte ne correspond pas à l'attendu

-- ── 3. Contrôle APRÈS ───────────────────────────────────────────────────────
-- select env, count(*) from public.telemetry_events group by env;
-- Attendu : plus aucune ligne `development`, `production` inchangé.

-- ── 4. Récupérer l'espace ───────────────────────────────────────────────────
-- Un DELETE ne rend pas l'espace au système : les lignes mortes restent
-- jusqu'au VACUUM. Sur 40 000 lignes c'est marginal, mais autant le faire.
-- vacuum (analyze) public.telemetry_events;

-- ═══════════════════════════════════════════════════════════════════════════
-- PAS DE RETOUR ARRIÈRE
-- Les événements supprimés ne sont pas récupérables. C'est assumé : ce sont des
-- événements de test, sans valeur analytique. En cas de doute, exporter d'abord :
--   \copy (select * from public.telemetry_events where env='development') to 'dev_telemetry.csv' csv header
-- ═══════════════════════════════════════════════════════════════════════════
