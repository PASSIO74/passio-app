// Le cœur de `delete-account`, hors de `Deno.serve` pour être TESTÉ avec un faux
// client (`node --test tests/unit/suppression-compte.test.mjs`) — même patron que
// `purge-compte.js` : Deno importe ce fichier tel quel.
//
// ⚠️ LE CONTRAT DE RÉPONSE (ASTRA-42, cinquième contre-revue, 2026-09-15 ;
// ASTRA-56, sixième contre-revue, 2026-09-16).
// `ok: true` n'est rendu QU'UNE FOIS le compte Auth supprimé après une purge
// vérifiée SOUS barrière ET le marqueur FINALISÉ par notre jeton. Tout le reste
// porte `ok: false` et un `code` que le client affiche distinctement :
//   503 infrastructure_absente — la migration de la barrière n'est pas appliquée :
//       on ne purge PAS. (La v1 purgeait « en le disant », et le handler jetait
//       la note : HTTP 200 `ok:true` pour une suppression non garantie.)
//   409 deja_en_cours        — une autre tentative est vivante pour ce compte
//                              (en train de purger, OU d'attendre la suppression Auth) ;
//   409 deja_supprimee       — le compte est déjà purgé et supprimé (jeton encore signé) ;
//   409 en_vol               — des écritures engagées avant la marque n'ont pas fini : relançable ;
//   409 incomplete           — restes ou échecs nommés : le compte reste ouvert, relançable ;
//   409 jeton_perdu          — une autre tentative a repris le compte pendant celle-ci ;
//   409 barriere             — la réclamation a été refusée pour une autre raison ;
//   500 auth_non_supprime    — données PURGÉES, compte Auth NON supprimé : la
//       protection est CONSERVÉE (`purgee`), la tentative est TERMINÉE
//       (`auth_echec`) ; la personne relance et la suppression reprend à la
//       purge (idempotente) puis à deleteUser.
//   500 finalisation_refusee — compte Auth SUPPRIMÉ, données purgées, mais le
//       marqueur n'a PAS pu être finalisé par notre jeton (une autre tentative
//       l'a repris). On rend l'état RÉEL lu en base (`marqueur`, `protection`),
//       jamais `garantie` : c'est le cas qu'ASTRA-56 a rejoué, où la v2
//       annonçait `garantie:"barriere"` sur un état supposé.
// Le succès porte `garantie: "barriere"` : le client l'EXIGE avant d'annoncer
// « Compte supprimé ».
// Quand un arrêt survient APRÈS qu'une tentative antérieure a purgé les
// données (reprise), la réponse porte `donnees_purgees: true` et un message qui
// ne dit pas « rien n'a été supprimé ».
import { purgerCompte, marquerSupprime, marquerAuthEchec } from "./purge-compte.js";

/** Statut HTTP par code d'arrêt de la purge. */
export const STATUT_PAR_CODE = {
  infrastructure_absente: 503,
  deja_en_cours: 409,
  deja_supprimee: 409,
  en_vol: 409,
  incomplete: 409,
  jeton_perdu: 409,
  barriere: 409,
  auth_non_supprime: 500,
  finalisation_refusee: 500,
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
  finalisation_refusee: "Ton compte est fermé et tes données supprimées, mais la confirmation finale n'a pas pu être enregistrée. Écris-nous si tu constates quoi que ce soit.",
};

/** Variante des messages quand les données sont DÉJÀ parties (reprise après `purgee`). */
export const MESSAGE_DONNEES_PURGEES = {
  en_vol: "Tes données ont déjà été supprimées ; des opérations étaient encore en cours et la fermeture du compte n'a pas pu se terminer cette fois. Réessaie.",
  incomplete: "Tes données ont déjà été supprimées ; la fermeture du compte n'a pas pu se terminer cette fois. Réessaie.",
  jeton_perdu: "Tes données ont déjà été supprimées ; une autre demande a repris la fermeture du compte. Réessaie dans quelques minutes.",
};

/** GoTrue : un utilisateur DÉJÀ absent est un compte Auth déjà parti — pas un échec (reprise après une tentative morte). */
export function estUtilisateurAbsent(err) {
  if (!err) return false;
  const statut = Number(err.status || err.code);
  return statut === 404 || /user not found|user_not_found/i.test(String(err.message || ""));
}

/**
 * Rend `{ status, body }`. `purger`, `marquer`, `marquerEchecAuth` et
 * `supprimerAuth` sont injectables pour le test ; en production ce sont
 * `purgerCompte`, `marquerSupprime`, `marquerAuthEchec` et `admin.auth.admin.deleteUser`.
 */
export async function traiterSuppression(admin, uid, deps = {}) {
  const purger = deps.purger || purgerCompte;
  const marquer = deps.marquer || marquerSupprime;
  const marquerEchecAuth = deps.marquerEchecAuth || marquerAuthEchec;
  const supprimerAuth = deps.supprimerAuth || (async (u) => {
    const r = await admin.auth.admin.deleteUser(u);
    if (!r || !r.error) return { error: null };
    return { error: { message: r.error.message || String(r.error), status: r.error.status, code: r.error.code } };
  });
  const jeton = deps.jeton || (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()) + "-" + Math.random());

  const purge = await purger(admin, uid, { jeton });
  if (!purge.ok) {
    const code = purge.code || "incomplete";
    const message = purge.donnees_purgees === true && MESSAGE_DONNEES_PURGEES[code] ? MESSAGE_DONNEES_PURGEES[code] : (MESSAGE_PAR_CODE[code] || MESSAGE_PAR_CODE.incomplete);
    const body = { ok: false, code, error: message,
                   echecs: purge.echecs, restes: purge.restes, notes: purge.notes, barriere: purge.barriere, marqueur: purge.statut_marqueur || purge.statut || null };
    if (purge.donnees_purgees === true) body.donnees_purgees = true;
    return { status: STATUT_PAR_CODE[code] || 409, body };
  }

  const { error: delErr } = await supprimerAuth(uid);
  if (delErr && !estUtilisateurAbsent(delErr)) {
    // Données purgées, compte Auth encore là : la protection reste (`purgee`),
    // la tentative est TERMINÉE (reprenable aussitôt), et on le DIT — ce n'est
    // ni un succès, ni « rien n'a été fait ».
    const fin = await marquerEchecAuth(admin, uid, jeton, { auth: delErr.message });
    return {
      status: 500,
      body: { ok: false, code: "auth_non_supprime", donnees_purgees: true,
              barriere: fin.protection === false ? "levee" : "conservee", marqueur: fin.statut || (fin.ok ? "purgee" : null),
              error: MESSAGE_PAR_CODE.auth_non_supprime + " (" + delErr.message + ")" },
    };
  }
  const notes = (purge.notes || []).slice();
  if (delErr) notes.push("compte Auth déjà absent (" + delErr.message + ") : reprise d'une suppression interrompue après deleteUser");

  // Le marqueur passe en rétention, PAR NOTRE JETON. S'il ne le peut pas, on ne
  // suppose rien : le compte Auth est parti (fait), les données ont été purgées
  // sous notre garde (fait), mais l'état du marqueur est celui que SQL rend —
  // et « garantie » n'est pas prononcée (ASTRA-56).
  const marque = await marquer(admin, uid, jeton);
  if (!marque.ok) {
    return {
      status: 500,
      body: { ok: false, code: "finalisation_refusee", auth_supprimee: true, donnees_purgees: true,
              marqueur: marque.statut || null, protection: marque.protection, motif: marque.motif || null,
              error: MESSAGE_PAR_CODE.finalisation_refusee, notes },
    };
  }
  return {
    status: 200,
    body: { ok: true, garantie: "barriere", objets: purge.objets, marqueur: marque.statut || "supprimee", notes },
  };
}
