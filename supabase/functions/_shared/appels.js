// ═══════════════════════════════════════════════════════════════════════════
// LES PUSHES DE `notify-call`, ET L'ACCUSÉ DE RÉCEPTION DES APPELS (2026-11-07)
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
//      d'accusé (`adresseAccuse`) — une notification sociale, JAMAIS ;
//   ② le service worker accuse APRÈS l'affichage (`accuser(data, "appel")`),
//      sans contenu ;
//   ③ après l'envoi, si au moins un service de notification a accepté la push,
//      la note `push_envoye` (genre « appel », pids, appareils acceptés) est
//      écrite sous `systeme:appels` et son `{ error }` lu. La note ne retarde ni
//      ne casse l'appel : la push est partie.
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
//
// LE VOLUME. Un appel mesuré coûte une note (`analytics_events`, purgée à
// 13 mois) et un accusé anonyme par appareil qui l'affiche (`telemetry_events`,
// 3 jours). Un sur dix : chiffré au § 3.7. Bornes qui tiennent sans ce fichier :
// le plafond par appelant de `notify-call` (20/min, 200/h) et `trg_rate_limit`
// (120 notes/min sous `systeme:appels` ; au-delà la note est refusée et le dit,
// l'appel part quand même).
//
// Les dépendances sont injectées (`admin` = client service_role, `envoyer` =
// web-push) : `node --test tests/unit/appels.test.mjs` éprouve CE fichier, celui
// que Deno déploie.
// ═══════════════════════════════════════════════════════════════════════════

import { EVT_ENVOI, GENRE_APPEL, UID_APPELS, appelMesure, avecAccuse, pidNeuf } from "./reception.js";

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
  // Seule une charge d'APPEL se mesure : une notification sociale ne part jamais
  // avec un pid, quelle que soit l'adresse reçue.
  const pid = charge && charge.type === "call" && accuse && appelMesure(tirage) ? pidNeuf() : null;
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
  // La note APRÈS l'envoi, et seulement pour un appel qu'un service de
  // notification a accepté : un refus n'est pas une question de réception.
  if (pid && sent) {
    try {
      const { error } = await admin.from("analytics_events")
        .insert({ user_id: UID_APPELS, event: EVT_ENVOI, properties: { genre: GENRE_APPEL, pids: [pid], acceptes: sent } });
      if (error) journal("notify-call : note d'envoi refusée " + String(error.code || ""));
    } catch (_e) { journal("notify-call : note d'envoi injoignable"); }
  }
  return { sent, morts };
}
