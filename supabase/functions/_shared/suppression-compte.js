// Le cœur de `delete-account`, hors de `Deno.serve` pour être TESTÉ avec un faux
// client (`node --test tests/unit/suppression-compte.test.mjs`) — même patron que
// `purge-compte.js` : Deno importe ce fichier tel quel.
//
// ⚠️ LE CONTRAT DE RÉPONSE (ASTRA-42, cinquième contre-revue, 2026-09-15).
// `ok: true` n'est rendu QU'UNE FOIS le compte Auth supprimé après une purge
// vérifiée SOUS barrière. Tout le reste porte `ok: false` et un `code` que le
// client affiche distinctement :
//   503 infrastructure_absente — la migration de la barrière n'est pas appliquée :
//       on ne purge PAS. (La v1 purgeait « en le disant », et le handler jetait
//       la note : HTTP 200 `ok:true` pour une suppression non garantie.)
//   409 deja_en_cours        — une autre tentative est vivante pour ce compte ;
//   409 deja_supprimee       — le compte est déjà purgé et supprimé (jeton encore signé) ;
//   409 en_vol               — des écritures engagées avant la marque n'ont pas fini : relançable ;
//   409 incomplete           — restes ou échecs nommés : le compte reste ouvert, relançable ;
//   409 jeton_perdu          — une autre tentative a repris le compte pendant celle-ci ;
//   409 barriere             — la réclamation a été refusée pour une autre raison ;
//   500 auth_non_supprime    — données PURGÉES, compte Auth NON supprimé : la
//       protection est CONSERVÉE (`purgee`) ; la personne relance et la
//       suppression reprend à la purge (idempotente) puis à deleteUser.
// Le succès porte `garantie: "barriere"` : le client l'EXIGE avant d'annoncer
// « Compte supprimé ».
import { purgerCompte, marquerSupprime } from "./purge-compte.js";

/** Statut HTTP par code d'arrêt de la purge. */
export const STATUT_PAR_CODE = {
  infrastructure_absente: 503,
  deja_en_cours: 409,
  deja_supprimee: 409,
  en_vol: 409,
  incomplete: 409,
  jeton_perdu: 409,
  barriere: 409,
};

/** Message affichable par code (le client peut le remplacer par le sien). */
export const MESSAGE_PAR_CODE = {
  infrastructure_absente: "Suppression indisponible pour le moment : l'infrastructure de suppression n'est pas en place. Réessaie plus tard, ou écris-nous.",
  deja_en_cours: "Une suppression est déjà en cours pour ce compte. Réessaie dans quelques minutes.",
  deja_supprimee: "Ce compte est déjà supprimé.",
  en_vol: "Des opérations étaient encore en cours sur ton compte : rien n'a été supprimé. Réessaie.",
  incomplete: "Suppression incomplète : le compte n'a pas été supprimé, réessaie.",
  jeton_perdu: "La suppression a été reprise par une autre demande : réessaie dans quelques minutes.",
  barriere: "La suppression n'a pas pu être engagée : réessaie, ou écris-nous.",
  auth_non_supprime: "Tes données ont été supprimées mais la fermeture du compte a échoué. Réessaie pour terminer.",
};

/**
 * Rend `{ status, body }`. `purger`, `marquer` et `supprimerAuth` sont
 * injectables pour le test ; en production ce sont `purgerCompte`,
 * `marquerSupprime` et `admin.auth.admin.deleteUser`.
 */
export async function traiterSuppression(admin, uid, deps = {}) {
  const purger = deps.purger || purgerCompte;
  const marquer = deps.marquer || marquerSupprime;
  const supprimerAuth = deps.supprimerAuth || (async (u) => {
    const r = await admin.auth.admin.deleteUser(u);
    return { error: r && r.error ? { message: r.error.message || String(r.error) } : null };
  });
  const jeton = deps.jeton || (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()) + "-" + Math.random());

  const purge = await purger(admin, uid, { jeton });
  if (!purge.ok) {
    const code = purge.code || "incomplete";
    return {
      status: STATUT_PAR_CODE[code] || 409,
      body: { ok: false, code, error: MESSAGE_PAR_CODE[code] || MESSAGE_PAR_CODE.incomplete,
              echecs: purge.echecs, restes: purge.restes, notes: purge.notes, barriere: purge.barriere },
    };
  }

  const { error: delErr } = await supprimerAuth(uid);
  if (delErr) {
    // Données purgées, compte Auth encore là : la protection reste (`purgee`),
    // et on le DIT — ce n'est ni un succès, ni « rien n'a été fait ».
    return {
      status: 500,
      body: { ok: false, code: "auth_non_supprime", donnees_purgees: true, barriere: "conservee",
              error: MESSAGE_PAR_CODE.auth_non_supprime + " (" + delErr.message + ")" },
    };
  }

  // Le marqueur passe en rétention. S'il ne le peut pas (jeton repris — improbable
  // après deleteUser), la ligne reste `purgee`, qui protège tout autant.
  const marque = await marquer(admin, uid, jeton);
  return {
    status: 200,
    body: { ok: true, garantie: "barriere", objets: purge.objets, marqueur: marque.ok ? "supprimee" : "purgee", notes: purge.notes },
  };
}
