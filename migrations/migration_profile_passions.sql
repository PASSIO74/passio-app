-- ════════════════════════════════════════════════════════════════════════
-- MIGRATION : centralisation du multi-profil
-- ════════════════════════════════════════════════════════════════════════
-- Objectif : UN seul profil public par compte (un seul pseudo) regroupant
-- TOUTES les passions de l'utilisateur. La table `profiles` a déjà une seule
-- ligne par compte (id = MY_UID) ; on ajoute une colonne `passions` (jsonb)
-- pour stocker la liste de ses passions [{id, emoji, label}], affichée telle
-- quelle sur le profil public (openUserProfile).
--
-- `passion_id` (colonne existante) reste la passion PRINCIPALE (1ʳᵉ créée) pour
-- la rétro-compatibilité (feed, embeds, anciens clients).
--
-- Additive et idempotente — aucune perte de données.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS passions jsonb DEFAULT '[]'::jsonb;
