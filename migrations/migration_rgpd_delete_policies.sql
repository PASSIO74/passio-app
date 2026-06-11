-- ════════════════════════════════════════════════════════════════
-- Migration RGPD (2026-06-10) : policies DELETE manquantes pour que
-- la suppression de compte in-app (doDeleteAccount) puisse effacer
-- TOUTES les données de l'utilisateur. Sans ces policies, RLS bloque
-- silencieusement la suppression de ces lignes.
-- À exécuter dans Supabase : SQL Editor → coller → Run.
-- ════════════════════════════════════════════════════════════════

-- profiles : l'utilisateur peut supprimer SON profil
DO $$ BEGIN
  CREATE POLICY "Suppression propre" ON profiles
    FOR DELETE USING (id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- notifications : l'utilisateur peut supprimer SES notifications
DO $$ BEGIN
  CREATE POLICY "Suppression propre" ON notifications
    FOR DELETE USING (user_id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- follows : aussi supprimer les liens où l'utilisateur est LE SUIVI
-- (la policy existante ne couvre que follower_id)
DO $$ BEGIN
  CREATE POLICY "Suppression cote suivi" ON follows
    FOR DELETE USING (following_id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
