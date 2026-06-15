-- ════════════════════════════════════════════════════════════════════════
-- Migration REALTIME AUTHORIZATION — scaling P0.1 (préparé le 2026-06-15)
-- Objectif : que chaque client ne reçoive QUE les messages de SES conversations,
-- au lieu du canal global `realtime:my_messages` qui reçoit TOUT et filtre en JS.
--
-- ⚠️ STAGED — NE PAS appliquer sans suivre le protocole de docs/SCALE_RUNBOOK.md :
--   1) appliquer ce SQL au Dashboard (SQL Editor),
--   2) activer Realtime Authorization (Database → Realtime),
--   3) SEULEMENT ENSUITE livrer le diff client (canaux privés `conv:<id>`),
--   4) tester avec 2 comptes réels + vérifier qu'un 3ᵉ ne reçoit rien.
-- Tant que le client n'est pas basculé, ce trigger diffuse en plus de l'ancien
-- canal — aucun impact sur la livraison existante.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Diffusion privée par conversation via Broadcast-from-Database ──────────
-- À chaque INSERT dans conv_messages, on diffuse sur le topic privé
-- `conv:<conv_id>`. Seuls les membres (RLS ci-dessous) le reçoivent.
CREATE OR REPLACE FUNCTION public.broadcast_conv_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'conv:' || NEW.conv_id, -- topic privé
    TG_OP,                  -- event (INSERT)
    TG_OP,                  -- operation
    TG_TABLE_NAME,          -- table
    TG_TABLE_SCHEMA,        -- schema
    NEW,                    -- nouvelle ligne
    OLD                     -- ancienne (NULL en INSERT)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_conv_message_trigger ON public.conv_messages;
CREATE TRIGGER broadcast_conv_message_trigger
AFTER INSERT ON public.conv_messages
FOR EACH ROW EXECUTE FUNCTION public.broadcast_conv_message();

-- 2) RLS sur realtime.messages : un client ne peut écouter `conv:<id>` que
--    s'il est membre de cette conversation. (auth.uid() est un UUID ; nos
--    user_id sont TEXT → cast.)
DROP POLICY IF EXISTS "Membres reçoivent les broadcasts de leur conv" ON realtime.messages;
CREATE POLICY "Membres reçoivent les broadcasts de leur conv"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conv_members cm
    WHERE cm.user_id = auth.uid()::text
      AND ('conv:' || cm.conv_id) = (realtime.topic())
  )
);

-- 3) (optionnel) topic de notif par utilisateur pour les convs en arrière-plan,
--    si on veut un signal « nouveau message » sans s'abonner à chaque conv.
--    À activer plus tard si besoin — laissé en commentaire pour rester minimal.
-- DROP POLICY IF EXISTS "Notif perso" ON realtime.messages;
-- CREATE POLICY "Notif perso" ON realtime.messages FOR SELECT TO authenticated
--   USING (realtime.topic() = 'user:' || auth.uid()::text);

-- ── Vérifs post-application ────────────────────────────────────────────────
-- Trigger présent ?
--   SELECT tgname FROM pg_trigger WHERE tgname = 'broadcast_conv_message_trigger';
-- Policy présente ?
--   SELECT polname FROM pg_policy WHERE polname LIKE 'Membres reçoivent%';
