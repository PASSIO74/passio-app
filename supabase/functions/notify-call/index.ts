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
// ⚠️ QUATRIÈME GARDE, LE 2026-09-14 (MSG-04, contre-revue Astra) : le LIEN
// MÉTIER. Rien n'exigeait de rapport entre l'émetteur et le destinataire, et le
// nom comme le texte venaient du corps de requête. Désormais (_shared/lien-metier.js) :
//   ④ un APPEL exige une conversation 1:1 commune ; une NOTIFICATION exige une
//      ligne `notifications` de l'émetteur vers le destinataire écrite dans les
//      deux dernières minutes — donc acceptée par la RLS ou par un trigger — et
//      c'est le TEXTE de cette ligne qui part, jamais celui du corps ; le nom
//      et l'emoji de l'appelant viennent de `profiles`. `fromName`, `fromEmoji`
//      et `text` du corps sont IGNORÉS (acceptés pour les anciens clients).
//      Lien absent → même réponse qu'un blocage.
// ⚠️ ACCUSÉ DE RÉCEPTION DES APPELS (2026-11-07, _shared/appels.js) : toute push
// part par `pousserAppareils`. Un APPEL sur dix, tiré au sort par le serveur,
// porte un pid aléatoire et l'adresse d'accusé ; le service worker accuse après
// l'affichage, et la note `push_envoye` (genre « appel », pids, appareils
// acceptés) se pose sous `systeme:appels` — sans rien de l'appelant. Le pid
// n'est JAMAIS rendu à l'appelant : il pourrait forger l'accusé d'un appel qui
// n'a pas sonné.
// ⚠️ ET DES NOTIFICATIONS SOCIALES (même jour) : une push « notif » sur VINGT,
// tirée par le serveur, porte de même un pid et l'adresse ; le service worker
// l'accuse « notif », et la note se pose sous `systeme:notifs` avec le genre de
// la notification d'une liste fermée (celui que `autoriserPushNotif` a relu en
// base) — ni son texte, ni l'émetteur, ni le destinataire. Le pid ne revient pas
// davantage à l'émetteur : il forgerait la réception de SA notification.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";
import { endpointPushSur, envoyerPushBorne, MAX_ABONNEMENTS_LUS } from "../_shared/push-sur.js";
import { verifierPlafondEnBase, reponsePlafond } from "../_shared/plafond.js";
import { identiteAppelant, lienAppel, autoriserPushNotif, reserverPush } from "../_shared/lien-metier.js";
import { adresseAccuse, TTL_NOTIFS_MS } from "../_shared/reception.js";
import { APPELS_ACTIFS, pousserAppareils, serveursIceDepuisCloudflare, TTL_ICE_S } from "../_shared/appels.js";
import { REVISION } from "../_shared/revision.js";
// Pilote : les appels sont désactivés (ASTRA-60) — même interrupteur que le client
// (`PASSIO_APPELS_ACTIFS`, app-05). `APPELS_ACTIFS` vit dans _shared/appels.js
// depuis le 2026-11-07, pour que le pilotage dise « appels coupés » au lieu de
// « 0 appel mesuré » : une seule source, lue par les deux fonctions.
// L'adresse d'accusé (_shared/reception.js) : l'URL du projet et sa clé PUBLIQUE
// (l'ancienne anon, sinon la publiable). Absente ou hors forme → les appels
// partent sans accusé, comme avant ; jamais une adresse inventée.
const ACCUSE = adresseAccuse((n) => Deno.env.get(n)).accuse;

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
  // La révision servie, sur toute réponse (dossier de livraison §6) — lisible par le client et par curl.
  "X-Passio-Revision": REVISION,
  "Access-Control-Expose-Headers": "X-Passio-Revision",
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
  // 1 ter. IDENTIFIANTS TURN (2026-11-09, `_shared/appels.js`) — `{ type: "ice" }`.
  // Servis aux appels ET aux lives : AVANT l'interrupteur des appels (un live en a
  // besoin même quand les appels sont coupés), APRÈS l'authentification et le
  // plafond (un compte réel, 20 par minute). Jamais en cache : un secret de 24 h.
  if (body.type === "ice") return await identifiantsIce(userData.user);
  const toUserId = borne(body.toUserId, 64);
  const callId = borne(body.callId, 80);
  const kind = borne(body.kind, 32);
  // `fromName`, `fromEmoji` et `text` du corps ne sont plus lus (garde ④).
  const emoji = borne(body.emoji, 8);
  const type = body.type === "notif" ? "notif" : "call";
  // Un identifiant de compte n'a que des caractères d'UUID : tout autre
  // caractère (virgule, parenthèse) est refusé AVANT d'entrer dans un filtre
  // PostgREST, où il changerait le sens de la requête.
  if (!toUserId || !/^[A-Za-z0-9_-]{1,64}$/.test(toUserId)) return json({ error: "toUserId requis" }, 400);
  // ⚠️ PILOTE GRATUIT (ASTRA-60, 2026-09-16) : les appels sont DÉSACTIVÉS. Une
  // push d'appel n'est pas envoyée — un ancien client (en cache) ne réveille
  // personne. Les notifications (`type:"notif"`) restent servies. Réversible
  // avec le client (`PASSIO_APPELS_ACTIFS`, app-05).
  if (type === "call" && !APPELS_ACTIFS) return json({ ok: false, code: "appels_desactives", error: "Les appels ne sont pas disponibles pendant le pilote." }, 503);
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

  // 3 bis. LIEN MÉTIER (garde ④). Même réponse qu'un blocage : rien à apprendre.
  let texteServeur = "";
  let kindServeur = "";
  if (type === "call") {
    const lien = await lienAppel(admin, fromUid, toUserId);
    if (!lien.ok) return json({ ok: true, sent: 0, note: "aucun appareil abonné" });
  } else {
    // ⚠️ MSG-04 second étage + ASTRA-24 (cinquième contre-revue, 15/09/2026) :
    // la ligne `notifications` (écrite par l'appelant pour les genres client),
    // l'ÉVÉNEMENT MÉTIER qui la justifie, et un TEXTE DÉRIVÉ par le serveur —
    // jamais celui de la ligne. Une 'mention' n'est poussée que si SA ligne a
    // été écrite par le serveur (`notifier_mentions`). La décision vit dans
    // `autoriserPushNotif` (lien-metier.js), testée par Node.
    const decision = await autoriserPushNotif(admin, fromUid, toUserId);
    if (!decision.ok) return json({ ok: true, sent: 0, note: "aucun appareil abonné" });
    // ⚠️ `fromUid`, l'appelant AUTHENTIFIÉ — et non `uid`, jamais déclaré : de #753
    // (07/11) au 2026-11-09, la lecture levait une ReferenceError et TOUTE push
    // sociale rendait 500 (aucune notification n'était née entre-temps, donc aucune
    // perdue). Verrou : tests/unit/notify-call-chemins.test.mjs, qui EXÉCUTE ce chemin.
    if (!(await reserverPush(admin, decision.id, toUserId, 30, Date.now(), fromUid))) return json({ ok: true, sent: 0, note: "aucun appareil abonné" });
    texteServeur = decision.texte;
    kindServeur = decision.kind || "";
  }
  const idn = await identiteAppelant(admin, fromUid);

  // 3. Charger les abonnements du destinataire (service_role → contourne la RLS).
  // Lignes écrites par le client (audit 2026-11-06) : services push connus seulement, en nombre borné.
  const { data: toutes } = await admin.from("push_subscriptions").select("endpoint, subscription").eq("user_id", toUserId).limit(MAX_ABONNEMENTS_LUS);
  const subs = (toutes || []).filter((l) => endpointPushSur(l.subscription));
  if (!subs.length) return json({ ok: true, sent: 0, note: "aucun appareil abonné" });

  const charge = type === "notif"
    ? { type: "notif", text: texteServeur || "Nouvelle notification", emoji: emoji || "🔔", kind: kindServeur || kind }
    : { type: "call", callId, kind: kind || "voice", from: fromUid, name: idn.name, emoji: idn.emoji };

  // Le TTL d'une notification sociale vient de _shared/reception.js : sa réception
  // se juge après lui (DELAI_JUGEMENT_NOTIFS_MS), une seule source pour les deux.
  const ttl = type === "notif" ? TTL_NOTIFS_MS / 1000 : 45;
  const urgency = type === "notif" ? "normal" : "high";

  // 4. Envoyer à chaque appareil (_shared/appels.js : un appel sur dix, une
  // notification sociale sur vingt portent un accusé, noté après l'envoi) ;
  // nettoyer les abonnements morts (410/404).
  const { sent, morts } = await pousserAppareils({
    admin, abonnements: subs, charge, options: { TTL: ttl, urgency }, accuse: ACCUSE,
    // deno-lint-ignore no-explicit-any
    // Borné : un abonnement qui ne répond pas ne fige plus la fonction (audit 2026-11-06, D-02).
    envoyer: (s: any, c: string, o: any) => envoyerPushBorne((a: any, b: string, d: any) => webpush.sendNotification(a, b, d), s, c, o),
  });
  if (morts.length) { try { await admin.from("push_subscriptions").delete().in("endpoint", morts); } catch (_e) { /* */ } }

  // Ni le pid ni « mesuré » ne sortent dans la réponse (voir l'en-tête). Le temps de
  // réponse, lui, peut trahir « mesurée » (une écriture de plus, revue du 2026-11-07) :
  // sans le pid, l'émetteur n'a rien à forger.
  return json({ ok: true, sent });
});

/**
 * Fabrique des identifiants TURN Cloudflare de TTL_ICE_S secondes (`TURN_CF_KEY_ID`,
 * `TURN_CF_API_TOKEN`, secrets de la fonction). Toute réponse est un 200 sans cache :
 * un relais absent est un repli PRÉVU (STUN seul), pas une erreur — sinon la
 * télémétrie compterait chaque entrée dans un live pendant une panne Cloudflare,
 * indiscernable d'une panne des pushes. Le corps dit pourquoi :
 *   · `configure: false` — secrets absents : le relais est coupé ;
 *   · `code: "cle_invalide"` — identifiant de clé hors forme (journalisé) ;
 *   · `code: "compte_requis"` — session anonyme : pas de relais ;
 *   · `code: "turn_indisponible"` — Cloudflare en erreur, hors forme ou muet au-delà
 *     de 4 s (journalisé, statut et nom d'erreur seulement — jamais l'en-tête).
 * ⚠️ COUPER LE RELAIS VITE se fait chez Cloudflare (supprimer l'application TURN) :
 * retirer un secret empêche seulement d'en fabriquer de nouveaux, et ceux déjà émis
 * restent valables jusqu'à TTL_ICE_S.
 */
async function identifiantsIce(user: { is_anonymous?: boolean } | null): Promise<Response> {
  if (!user || user.is_anonymous) return json({ ok: false, iceServers: [], code: "compte_requis" }, 200, true);
  // `trim` : un secret collé avec une espace ou un retour à la ligne final ne doit pas
  // couper le relais en silence (le `$` d'une regex JS ne tolère pas le `\n`).
  const cle = (Deno.env.get("TURN_CF_KEY_ID") ?? "").trim();
  const jeton = (Deno.env.get("TURN_CF_API_TOKEN") ?? "").trim();
  if (!cle || !jeton) return json({ ok: true, iceServers: [], configure: false }, 200, true);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(cle)) {
    console.error("relais TURN : TURN_CF_KEY_ID hors forme (" + cle.length + " caractères)");
    return json({ ok: false, iceServers: [], configure: false, code: "cle_invalide" }, 200, true);
  }
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${cle}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: "Bearer " + jeton, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: TTL_ICE_S }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      console.error("relais TURN : Cloudflare a répondu " + r.status);
      return json({ ok: false, iceServers: [], configure: true, code: "turn_indisponible" }, 200, true);
    }
    const iceServers = serveursIceDepuisCloudflare(await r.json());
    if (!iceServers.length) {
      console.error("relais TURN : réponse de Cloudflare hors forme");
      return json({ ok: false, iceServers: [], configure: true, code: "turn_indisponible" }, 200, true);
    }
    return json({ ok: true, iceServers, ttl: TTL_ICE_S, configure: true }, 200, true);
  } catch (e) {
    console.error("relais TURN : " + ((e && (e as Error).name) || "erreur"));
    return json({ ok: false, iceServers: [], configure: true, code: "turn_indisponible" }, 200, true);
  } finally {
    clearTimeout(minuterie);
  }
}

function json(body: unknown, status = 200, sansCache = false): Response {
  const headers: Record<string, string> = { ...corsHeaders, "Content-Type": "application/json" };
  if (sansCache) headers["Cache-Control"] = "no-store";
  return new Response(JSON.stringify(body), { status, headers });
}
