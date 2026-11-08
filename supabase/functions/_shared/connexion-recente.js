// ═════════════════════════════════════════════════
// PASSIO · UNE PREUVE FRAÎCHE POUR LES GESTES IRRÉVERSIBLES (audit de sécurité 2026-11-06)
//
// Supprimer un compte ou sortir tout son dossier n'exigeait qu'un jeton valide : le mot
// « SUPPRIMER » n'existe que dans le client. Un jeton volé, ou un appareil laissé ouvert, suffisait
// à détruire le compte sans retour. Le claim `amr` du jeton porte l'heure de la dernière
// authentification réelle, et un renouvellement de session ne la rajeunit pas.
//
// ⚠️ À appeler APRÈS `auth.getUser()`, qui a validé le jeton : cette fonction ne vérifie rien
// d'autre que l'âge. Un `amr` absent ou illisible ne bloque pas : la suppression est un droit
// de la personne, et un changement de format côté fournisseur ne doit pas le lui retirer.
// ═════════════════════════════════════════════════

/** La dernière authentification porte-t-elle moins de `maxSecondes` ? */
export function connexionRecente(enTeteAuthorization, maxSecondes, maintenantS = Math.floor(Date.now() / 1000)) {
  try {
    const charge = String(enTeteAuthorization || "").split(".")[1] || "";
    const claims = JSON.parse(atob(charge.replace(/-/g, "+").replace(/_/g, "/")));
    // Une session anonyme n'a aucun moyen de se reconnecter : l'exiger rendrait le compte insupprimable.
    if (claims.is_anonymous === true) return true;
    if (!Array.isArray(claims.amr) || !claims.amr.length) return true;
    const derniere = Math.max(...claims.amr.map((a) => Number(a && a.timestamp) || 0));
    if (!derniere) return true;
    return maintenantS - derniere <= maxSecondes;
  } catch (_e) {
    return true;
  }
}

/** Le corps du refus, le même pour chaque geste : le client sait y répondre. */
export const REPONSE_REAUTH = {
  ok: false,
  code: "reauth_requise",
  message: "Par sécurité, reconnecte-toi, puis recommence.",
};
