-- ═══════════════════════════════════════════════════════════════════════════
-- INDEX DE COUVERTURE DES CLÉS ÉTRANGÈRES
--
-- Détecté par les advisors Supabase le 2026-08-16 : 7 clés étrangères sans
-- index de couverture. Postgres n'en crée pas automatiquement, et leur absence
-- coûte à deux moments — sur les jointures, et surtout sur toute suppression
-- dans la table PARENT, qui doit alors balayer la table enfant en entier pour
-- vérifier qu'aucune ligne ne la référence.
--
-- ⚠️ CINQ DES SEPT SONT DE MON FAIT : les `*_passion_fk` ont été créées quelques
-- heures plus tôt par `migration_passions_referentiel.sql`, sans index. Poser
-- une clé étrangère sans son index est un oubli classique — celui-ci est
-- documenté ici plutôt que corrigé en silence.
--
-- Additif et réversible : aucune donnée touchée, `drop index` suffit à revenir.
-- Volumes actuels minuscules (36 posts, 6 stories) → pose instantanée, d'où des
-- index simples plutôt que CONCURRENTLY, que le CLI refuse en transaction (25001).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Les 5 introduites par le référentiel des passions ───────────────────────
create index if not exists idx_posts_passion         on public.posts(passion_id);
create index if not exists idx_stories_passion       on public.stories(passion_id);
create index if not exists idx_events_passion        on public.events(passion_id);
create index if not exists idx_conversations_passion on public.conversations(passion_id);
create index if not exists idx_profiles_passion      on public.profiles(passion_id);

-- ── Les 2 préexistantes ─────────────────────────────────────────────────────
create index if not exists idx_post_comments_author  on public.post_comments(author_id);
create index if not exists idx_stories_author        on public.stories(author_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUE CETTE MIGRATION NE FAIT **PAS**
--
-- Les advisors signalent aussi 13 index « inutilisés ». On n'y touche pas, et
-- c'est délibéré : sur une beta à faible trafic, « inutilisé » signifie « pas
-- encore utilisé » — `pg_stat_user_indexes` est quasi vide. Supprimer un index
-- sur cette base, c'est le supprimer sur une absence de preuve, pas sur une
-- preuve d'absence. À réexaminer quand le trafic sera représentatif.
--
-- Restent aussi 85 avertissements `auth_rls_initplan` (`auth.uid()` réévalué à
-- chaque ligne au lieu d'une fois) et 42 `multiple_permissive_policies`. Le
-- correctif est mécanique — envelopper en `(select auth.uid())` — mais il touche
-- ~85 policies RLS, c'est-à-dire la seule frontière de sécurité de l'app.
-- À faire sous supervision, avec la suite cross-compte après CHAQUE table.
-- Impact actuel nul (tables minuscules) ; réel à l'échelle.
--
-- RETOUR ARRIÈRE
--   drop index if exists public.idx_posts_passion, public.idx_stories_passion,
--     public.idx_events_passion, public.idx_conversations_passion,
--     public.idx_profiles_passion, public.idx_post_comments_author,
--     public.idx_stories_author;
-- ═══════════════════════════════════════════════════════════════════════════
