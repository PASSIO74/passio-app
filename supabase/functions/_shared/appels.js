// ═══════════════════════════════════════════════════════════════════════════
// LES PUSHES DE `notify-call`, ET L'ACCUSÉ DE RÉCEPTION DES APPELS (2026-11-07)
// ET DES NOTIFICATIONS SOCIALES (même jour, voir plus bas : `MESURES`)
//
// LE DÉFAUT. Un appel réveille le destinataire par une push « Appel entrant »
// (sw.js). Le service de notification qui ACCEPTE la push ne prouve pas qu'elle
// s'affiche : appareil éteint, permission retirée, service worker cassé. Les
// alertes du pilote et les rappels d'activité s'accusent depuis le 2026-11-06
// (_shared/reception.js) ; les appels restaient hors mesure (§ 3.5 de
// docs/AUTONOMIE_EXPLOITATION.md : « à échantillonner, leur volume suit
// l'audience »).
//
// LE CHEMIN. `notify-call` passe TOUTES ses pushes par `pousserAppareils` :
//   ① un APPEL tiré au sort (un sur ECHANTILLON_APPELS, `appelMesure`) porte un
//      pid ALÉATOIRE, partagé par les appareils du destinataire, et l'adresse
//      d'accusé (`adresseAccuse`) ; une NOTIFICATION SOCIALE de même, à son taux
//      (une sur ECHANTILLON_NOTIFS, `notifMesuree`) ;
//   ② le service worker accuse APRÈS l'affichage (`accuser(data, "appel")`,
//      `accuser(data, "notif")`), sans contenu ;
//   ③ après l'envoi, si au moins un service de notification a accepté la push,
//      la note `push_envoye` (genre, pids, appareils acceptés ; pour une
//      notification sociale, son genre d'une liste fermée) est écrite sous
//      `systeme:appels` ou `systeme:notifs` et son `{ error }` lu. La note ne
//      retarde ni ne casse la push : elle est partie.
//
// CE QUI NE SORT JAMAIS.
//   · Le pid ne quitte pas cette fonction : `notify-call` ne le rend pas à
//     l'appelant. Le connaître lui permettrait de déposer l'accusé d'un appel qui
//     n'a pas sonné — et de faire passer une livraison en panne pour saine.
//   · Ni l'identifiant d'appel, ni l'appelant, ni son nom, ni son emoji, ni le
//     type d'appel n'entrent dans la note : ils viennent du corps de requête ou
//     de `profiles`, c'est du texte d'autrui. La note ne porte que des pid et des
//     nombres.
//   · Le tirage est fait par le SERVEUR (`tirer`, aléa cryptographique), jamais
//     dérivé de la requête : un appelant ne choisit pas lesquels de ses appels
//     sont jugés.
//   · Pour une notification sociale, de même : ni son texte, ni son émetteur, ni
//     son destinataire ; son genre seulement s'il est de la liste fermée.
//
// LE VOLUME. Une push mesurée coûte une note (`analytics_events`, purgée à
// 13 mois) et un accusé anonyme par appareil qui l'affiche (`telemetry_events`,
// 3 jours). Un appel sur dix : chiffré au § 3.7 ; une notification sociale sur
// vingt : § 3.8. Bornes qui tiennent sans ce fichier : le plafond par émetteur de
// `notify-call` (20/min, 200/h) et `trg_rate_limit` (120 notes/min sous chaque
// auteur ; au-delà la note est refusée et le dit, la push part quand même).
//
// Les dépendances sont injectées (`admin` = client service_role, `envoyer` =
// web-push) : `node --test tests/unit/appels.test.mjs` éprouve CE fichier, celui
// que Deno déploie.
// ═══════════════════════════════════════════════════════════════════════════

import { EVT_ENVOI, GENRE_APPEL, UID_APPELS, GENRE_NOTIF, UID_NOTIFS, appelMesure, notifMesuree, avecAccuse, pidNeuf } from "./reception.js";
import { GENRES_PUSH } from "./lien-metier.js";

// LES NOTIFICATIONS SOCIALES (même jour). Une push « notif » (j'aime, abonnement,
// commentaire, message…) se mesure comme un appel, à SON taux (une sur
// ECHANTILLON_NOTIFS, `notifMesuree`), sous SON auteur (`systeme:notifs`) : un
// pid partagé par les appareils du destinataire, accusé par le service worker
// (`accuser(data, "notif")`), la note après l'envoi. La note porte en plus le
// GENRE de la notification, d'une LISTE FERMÉE (`GENRES_PUSH`, les gabarits de
// lien-metier.js ; « autre » sinon) : il vient de la ligne `notifications` que
// le SERVEUR a relue (`autoriserPushNotif`), et il dit le mélange réel des pushes
// mesurées — de quoi revoir le taux sur une mesure plutôt qu'une hypothèse. Ni le
// texte de la notification, ni son émetteur, ni son destinataire, ni un genre
// hors liste n'y entrent jamais.
/** Ce qui se mesure, par type de charge : le genre, l'auteur des notes, le tirage. */
const MESURES = Object.freeze({
  call: Object.freeze({ genre: GENRE_APPEL, auteur: UID_APPELS, mesure: appelMesure }),
  notif: Object.freeze({ genre: GENRE_NOTIF, auteur: UID_NOTIFS, mesure: notifMesuree }),
});
/** Le genre d'une notification sociale pour sa note : une valeur de la liste fermée, sinon « autre ». */
export const genreNoteNotif = (kind) => (typeof kind === "string" && GENRES_PUSH.includes(kind) ? kind : "autre");

/**
 * Pilote : les appels sont COUPÉS (ASTRA-60, 2026-09-16) — l'interrupteur serveur,
 * jumeau du client (`PASSIO_APPELS_ACTIFS`, app-05) : `notify-call` refuse toute
 * push d'appel (503 `appels_desactives`) tant qu'il vaut false. Il vit ICI depuis
 * le 2026-11-07 pour que le pilotage le LISE : sans lui, l'écran disait « 0 appel
 * mesuré » sans dire que c'est parce qu'aucun appel ne part. Une seule source.
 */
export const APPELS_ACTIFS = false;

/** Un tirage dans [0, 1), du SERVEUR — aléa cryptographique, jamais dérivé de la requête. */
export function tirer() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

/**
 * Pousse `charge` vers chaque abonnement du destinataire.
 * @param {{ admin: { from: (t: string) => any },
 *           envoyer: (subscription: unknown, corps: string, options: unknown) => Promise<unknown>,
 *           abonnements: Array<{ endpoint: string, subscription: unknown }>,
 *           charge: Record<string, unknown>, options: unknown,
 *           accuse?: { u: string, k: string } | null, tirage?: number,
 *           journal?: (m: string) => void }} e
 * @returns {Promise<{ sent: number, morts: string[] }>} — jamais le pid.
 */
export async function pousserAppareils({ admin, envoyer, abonnements = [], charge, options, accuse = null, tirage = tirer(), journal = (m) => console.warn(m) }) {
  // Une charge d'APPEL ou de NOTIFICATION SOCIALE se mesure, chacune à son taux ;
  // tout autre type part sans pid, quelle que soit l'adresse reçue.
  const m = charge && typeof charge.type === "string" && Object.hasOwn(MESURES, charge.type) ? MESURES[charge.type] : null;
  const pid = m && accuse && m.mesure(tirage) ? pidNeuf() : null;
  const corps = JSON.stringify(avecAccuse(charge, pid, accuse));
  let sent = 0;
  const morts = [];
  await Promise.all((abonnements || []).map(async (row) => {
    try {
      await envoyer(row.subscription, corps, options);
      sent++;
    } catch (e) {
      const code = e && e.statusCode;
      if (code === 404 || code === 410) morts.push(row.endpoint);
    }
  }));
  // La note APRÈS l'envoi, et seulement pour une push qu'un service de
  // notification a acceptée : un refus n'est pas une question de réception.
  if (pid && sent) {
    const properties = m.genre === GENRE_NOTIF
      ? { genre: GENRE_NOTIF, pids: [pid], acceptes: sent, kind: genreNoteNotif(charge.kind) }
      : { genre: GENRE_APPEL, pids: [pid], acceptes: sent };
    try {
      const { error } = await admin.from("analytics_events").insert({ user_id: m.auteur, event: EVT_ENVOI, properties });
      if (error) journal("notify-call : note d'envoi refusée " + String(error.code || ""));
    } catch (_e) { journal("notify-call : note d'envoi injoignable"); }
  }
  return { sent, morts };
}
