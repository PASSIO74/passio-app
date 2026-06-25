-- ════════════════════════════════════════════════════════════════════════
-- CDV LIVES : FK ON DELETE CASCADE des tables enfants vers cdv_lives.
-- Supprimer un Live (par son auteur, via la RLS owner) efface alors
-- automatiquement ses étapes / commentaires / réactions / followers — y compris
-- ceux écrits par d'autres comptes (le cascade bypass la RLS des tables enfants).
-- Appliquée en prod le 2026-06-24 via `supabase db query --linked`.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE cdv_live_steps
  ADD CONSTRAINT fk_cdv_steps_live FOREIGN KEY (live_id) REFERENCES cdv_lives(id) ON DELETE CASCADE;

ALTER TABLE cdv_live_comments
  ADD CONSTRAINT fk_cdv_comments_live FOREIGN KEY (live_id) REFERENCES cdv_lives(id) ON DELETE CASCADE;

ALTER TABLE cdv_live_reactions
  ADD CONSTRAINT fk_cdv_reactions_live FOREIGN KEY (live_id) REFERENCES cdv_lives(id) ON DELETE CASCADE;

ALTER TABLE cdv_live_followers
  ADD CONSTRAINT fk_cdv_followers_live FOREIGN KEY (live_id) REFERENCES cdv_lives(id) ON DELETE CASCADE;
