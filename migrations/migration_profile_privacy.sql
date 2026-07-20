-- ════════════════════════════════════════════════════════════════════════
-- PASSIO — Compte privé + réseaux sociaux publics (2026-07-20)
--
-- 1) `is_private` : quand true, seuls les abonnés voient le CONTENU du profil
--    (posts, photos, bobines, carnets). L'en-tête (avatar, pseudo, passions,
--    compteurs) reste visible — comportement Instagram.
-- 2) `rs_links`   : liens réseaux sociaux, déjà saisis en local (general.rsLinks)
--    mais jamais publiés → invisibles pour les visiteurs. On les publie pour
--    que le profil visité soit le MÊME visuel que le profil personnel.
-- ════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists is_private boolean not null default false;
alter table public.profiles add column if not exists rs_links   jsonb;
