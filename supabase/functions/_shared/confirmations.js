import { reserverPush, textePush } from "./lien-metier.js";
import { pousserAppareils } from "./appels.js";
import { endpointPushSur, envoyerPushBorne, MAX_ABONNEMENTS_LUS } from "./push-sur.js";
import { TTL_NOTIFS_MS } from "./reception.js";

// Le signal de l'organisateur et la veille partagent la réservation atomique de la notification.
export async function pousserConfirmations(admin, envoyer, accuse, { sortie = null, emetteur = null, membre = null } = {}) {
  const file = await admin.rpc("confirmations_a_pousser", { p_sortie: sortie, p_emetteur: emetteur, p_membre: membre });
  if (file.error) throw new Error("lecture des confirmations indisponible");
  await Promise.all((file.data || []).map(async (n) => {
    if (!/^[\w-]{1,100}$/.test(n.event_id)) return;
    const appareils = await admin.from("push_subscriptions").select("endpoint, subscription")
      .eq("user_id", n.membre).limit(MAX_ABONNEMENTS_LUS);
    if (appareils.error) throw new Error("lecture des abonnements indisponible");
    const abonnements = (appareils.data || []).filter(a => endpointPushSur(a.subscription));
    if (!abonnements.length || !await reserverPush(admin, n.id, n.membre, 30, Date.now(), n.emetteur, { exigerReservation: true })) return;
    await pousserAppareils({ admin, abonnements, accuse,
      envoyer: (sub, corps, options) => envoyerPushBorne(envoyer, sub, corps, options),
      charge: { type: "notif", kind: "event_accepted", eventId: n.event_id, decisionId: n.id, text: textePush("event_accepted") },
      options: { TTL: TTL_NOTIFS_MS / 1000, urgency: "normal" },
    });
  }));
}
