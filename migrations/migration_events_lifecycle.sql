-- ════════════════════════════════════════════════════════════════════════
-- IRL — cycle de vie d'un événement (2026-07-21)
-- ════════════════════════════════════════════════════════════════════════
-- 1) end_at   : fin réelle de l'événement. Sans elle, un événement DISPARAISSAIT
--               de l'écran IRL à la seconde où il commençait (filtre `date > now`)
--               → personne ne pouvait retrouver l'event auquel il participait.
-- 2) status   : "active" | "cancelled". L'organisateur peut annuler sans
--               supprimer (les inscrits gardent la trace + reçoivent une notif).
-- 3) updated_at : horodatage de la dernière modification (affiché « modifié le… »).
--
-- Les policies UPDATE/DELETE « propre » (author_id = auth.uid()) existent DÉJÀ en
-- prod : rien à ajouter côté RLS pour l'édition/annulation/suppression.

ALTER TABLE events ADD COLUMN IF NOT EXISTS end_at     timestamp;
ALTER TABLE events ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'active';
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at timestamp;

-- Backfill : durée par défaut de 2 h pour les événements existants.
UPDATE events SET end_at = date_at + interval '2 hours' WHERE end_at IS NULL;

-- Le chemin chaud de l'écran IRL trie/filtre sur la date de fin.
CREATE INDEX IF NOT EXISTS idx_events_end_at ON events (end_at DESC);
