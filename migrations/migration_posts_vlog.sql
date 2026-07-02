-- Carnets de voyage cross-compte : les posts type "vlog" (destination, étapes,
-- budget…) n'étaient JAMAIS synchronisés (les champs vlog n'avaient pas de
-- colonne) → un carnet publié par A était invisible pour B. Colonne jsonb :
-- { destination, dateStart, dateEnd, budget, transport, lodging, season, tip,
--   cover: url, steps: [{place,text,tip,photo,video,audio}] }
-- ⚠️ Les médias d'étapes sont des URLs Storage (jamais de base64 en DB —
-- même hygiène que les vocaux et les étapes de CDV Live).
ALTER TABLE posts ADD COLUMN IF NOT EXISTS vlog jsonb;
