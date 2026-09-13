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
//
// ⚠️ TROIS GARDES POSÉES LE 2026-09-12, parce qu'un compte confirmé pouvait :
//   ① réveiller N'IMPORTE QUEL membre autant de fois qu'il voulait (aucun
//      plafond) → plafond par appelant (_shared/plafond.js) ;
//   ② réveiller quelqu'un qui l'a BLOQUÉ — la seule fuite du blocage relevée
//      par le go/no-go du 2026-09-11 (MOD-03 : « seul canal qui perce : la push
//      notify-call ») → lecture de `blocks` dans les deux sens, refus SILENCIEUX
//      (même réponse que « aucun appareil abonné », pour ne pas révéler le blocage) ;
//   ③ faire afficher un texte de longueur libre dans la notification de l'OS →
//      bornes sur chaque champ affiché.
// Résidu assumé (déjà écrit dans CLAUDE.md) : `fromName`/`text` restent
// DÉCLARATIFS entre comptes — le nom affiché est celui que l'appelant envoie.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { verifierPlafondEnBase, reponsePlafond } from "../_shared/plafond.js";

// Par appelant : 20 pushes par minute, 200 par heure. Le client n'émet qu'une
// push par conversation et par 5 min (anti-spam de _notifierMessage) plus les
// appels ; un humain reste très loin de ce seuil, une boucle le touche en 3 s.
const PLAFOND = { parMinute: 20, parHeure: 200 };

/** Borne un champ texte affiché dans la notification ; `undefined` si vide. */
function borne(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? Array.from(s).slice(0, max).join("") : undefined;
}

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

  // 1 bis. Plafond par appelant — avant de lire le corps et avant tout envoi.
  // Le compte vit en base (analytics_events, service_role), pas dans l'isolat.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const verdict = await verifierPlafondEnBase(admin, fromUid, "notify-call", PLAFOND);
  if (!verdict.ok) return reponsePlafond(verdict, corsHeaders);

  let body: { toUserId?: string; callId?: string; kind?: string; fromName?: string; fromEmoji?: string; type?: string; text?: string; emoji?: string };
  try { body = await req.json(); } catch { return json({ error: "Body invalide" }, 400); }
  const toUserId = borne(body.toUserId, 64);
  const callId = borne(body.callId, 80);
  const kind = borne(body.kind, 32);
  const fromName = borne(body.fromName, 60);
  const fromEmoji = borne(body.fromEmoji, 8);
  const text = borne(body.text, 200);
  const emoji = borne(body.emoji, 8);
  const type = body.type === "notif" ? "notif" : "call";
  // Un identifiant de compte n'a que des caractères d'UUID : tout autre
  // caractère (virgule, parenthèse) est refusé AVANT d'entrer dans un filtre
  // PostgREST, où il changerait le sens de la requête.
  if (!toUserId || !/^[A-Za-z0-9_-]{1,64}$/.test(toUserId)) return json({ error: "toUserId requis" }, 400);
  if (type === "call" && !callId) return json({ error: "callId requis pour les appels" }, 400);
  if (toUserId === fromUid) return json({ ok: true, sent: 0, note: "soi-même" });

  // 2. VAPID.
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:passioadmin@gmail.com";
  if (!pub || !priv) return json({ error: "VAPID non configuré" }, 500);
  webpush.setVapidDetails(subject, pub, priv);

  // 3 pré. Blocage, dans les DEUX sens. La réponse est la même que « aucun
  // appareil abonné » : ni l'un ni l'autre ne doit apprendre le blocage ici.
  // Une erreur de lecture (colonne, panne) compte comme un blocage : on préfère
  // une push manquée à une push qui perce.
  const { data: bloc, error: blocErr } = await admin
    .from("blocks")
    .select("blocker_id")
    .or(`and(blocker_id.eq.${fromUid},blocked_id.eq.${toUserId}),and(blocker_id.eq.${toUserId},blocked_id.eq.${fromUid})`)
    .limit(1);
  if (blocErr || (bloc && bloc.length)) return json({ ok: true, sent: 0, note: "aucun appareil abonné" });

  // 3. Charger les abonnements du destinataire (service_role → contourne la RLS).
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, subscription").eq("user_id", toUserId);
  if (!subs || !subs.length) return json({ ok: true, sent: 0, note: "aucun appareil abonné" });

  const payload = type === "notif"
    ? JSON.stringify({ type: "notif", text: text || "Nouvelle notification", emoji: emoji || "🔔", kind })
    : JSON.stringify({ type: "call", callId, kind: kind || "voice", from: fromUid, name: fromName || "Quelqu'un", emoji: fromEmoji || "📞" });

  const ttl = type === "notif" ? 3600 : 45;
  const urgency = type === "notif" ? "normal" : "high";

  // 4. Envoyer à chaque appareil ; nettoyer les abonnements morts (410/404).
  let sent = 0;
  const dead: string[] = [];
  await Promise.all((subs || []).map(async (row) => {
    try {
      await webpush.sendNotification(row.subscription, payload, { TTL: ttl, urgency });
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
