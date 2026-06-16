-- ════════════════════════════════════════════════════════════════════════
-- REALTIME v3 — topic privé PAR UTILISATEUR (scaling P0.1, design définitif)
-- 2026-06-15. Remplace le trigger v2 (par conversation) qui souffrait d'une
-- course à l'abonnement pour les convs créées pendant la session.
--
-- Principe : à chaque INSERT dans conv_messages, on diffuse le message sur le
-- topic privé `user:<id>` de CHAQUE membre de la conversation. Chaque client
-- s'abonne UNE SEULE FOIS à `user:<MY_UID>` au boot (topic stable → aucune
-- course, et il ne reçoit QUE ses propres messages → scalable).
--
-- ⚠️ STAGED : appliquer ce SQL au Dashboard, PUIS activer le client v3
--    (localStorage.passio_realtime_v3 = "1") et tester 2 comptes. Tant que le
--    client est en v1 (défaut), ce trigger diffuse « dans le vide » sans impact.
-- ⚠️ Supersède v2 : ce script SUPPRIME le trigger/policy `conv:<id>`. Les rares
--    devices ayant opté pour v2 (passio_realtime_v2="1") doivent passer à v3.
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Trigger : diffuser à chaque membre sur son topic perso ────────────────
CREATE OR REPLACE FUNCTION public.broadcast_conv_message_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
DECLARE
  m RECORD;
BEGIN
  FOR m IN SELECT user_id FROM public.conv_members WHERE conv_id = NEW.conv_id LOOP
    PERFORM realtime.broadcast_changes(
      'user:' || m.user_id, -- topic privé du membre
      TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_conv_message_users_trigger ON public.conv_messages;
CREATE TRIGGER broadcast_conv_message_users_trigger
AFTER INSERT ON public.conv_messages
FOR EACH ROW EXECUTE FUNCTION public.broadcast_conv_message_to_users();

-- 2) RLS : un client n'écoute QUE son propre topic `user:<son uid>` ─────────
DROP POLICY IF EXISTS "Utilisateur reçoit ses messages" ON realtime.messages;
CREATE POLICY "Utilisateur reçoit ses messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() = 'user:' || auth.uid()::text);

-- 3) Nettoyage de v2 (par conversation) — superseded ───────────────────────
DROP TRIGGER IF EXISTS broadcast_conv_message_trigger ON public.conv_messages;
DROP FUNCTION IF EXISTS public.broadcast_conv_message();
DROP POLICY IF EXISTS "Membres reçoivent les broadcasts de leur conv" ON realtime.messages;

-- ── Vérifs ─────────────────────────────────────────────────────────────────
-- SELECT tgname FROM pg_trigger WHERE tgname = 'broadcast_conv_message_users_trigger';
-- SELECT polname FROM pg_policy WHERE polname = 'Utilisateur reçoit ses messages';
