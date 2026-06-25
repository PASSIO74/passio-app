// Edge Function PASSIO — notify-call
// Réveille le destinataire d'un appel via Web Push, même quand son app est
// fermée. L'appelant invoque cette fonction au démarrage de l'appel ; on lit
// les abonnements push du destinataire (service_role) et on envoie une push à
// chacun de ses appareils. Le service worker (sw.js) affiche alors une
// notification « Appel entrant » avec un bouton Répondre qui ouvre l'app sur
// l'écran d'appel.
//
// Secrets requis (supabase secrets set …) :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex: mailto:contact@…)
//
// Appel côté app : supa.functions.invoke("notify-call", { body: {...} }) avec
// la session active (JWT dans Authorization → on identifie l'appelant).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // 1. Authentifier l'appelant (on n'envoie une push que de la part d'un compte réel).
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Non authentifié" }, 401);
  const fromUid = userData.user.id;

  let body: { toUserId?: string; callId?: string; kind?: string; fromName?: string; fromEmoji?: string };
  try { body = await req.json(); } catch { return json({ error: "Body invalide" }, 400); }
  const { toUserId, callId, kind, fromName, fromEmoji } = body;
  if (!toUserId || !callId) return json({ error: "toUserId/callId requis" }, 400);

  // 2. VAPID.
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:contact@passio.app";
  if (!pub || !priv) return json({ error: "VAPID non configuré" }, 500);
  webpush.setVapidDetails(subject, pub, priv);

  // 3. Charger les abonnements du destinataire (service_role → contourne la RLS).
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, subscription").eq("user_id", toUserId);
  if (!subs || !subs.length) return json({ ok: true, sent: 0, note: "aucun appareil abonné" });

  const payload = JSON.stringify({
    type: "call",
    callId, kind: kind || "voice",
    from: fromUid,
    name: fromName || "Quelqu'un",
    emoji: fromEmoji || "📞",
  });

  // 4. Envoyer à chaque appareil ; nettoyer les abonnements morts (410/404).
  let sent = 0;
  const dead: string[] = [];
  await Promise.all((subs || []).map(async (row) => {
    try {
      await webpush.sendNotification(row.subscription, payload, { TTL: 45, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) dead.push(row.endpoint);
    }
  }));
  if (dead.length) { try { await admin.from("push_subscriptions").delete().in("endpoint", dead); } catch (_e) { /* */ } }

  return json({ ok: true, sent });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
