-- CDV live steps : vidéo par étape (item 2026-08-03).
-- Une étape de carnet live pouvait n'avoir que des photos ; on ajoute une URL
-- vidéo (uploadée sur Storage, jamais de base64 en DB — cf. supaAddCdvLiveStep).
ALTER TABLE cdv_live_steps ADD COLUMN IF NOT EXISTS video text;
