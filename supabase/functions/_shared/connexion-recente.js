// ═════════════════════════════════════════════════
// PASSIO · UNE PREUVE FRAÎCHE POUR LES GESTES IRRÉVERSIBLES (audit de sécurité 2026-11-06)
//
// Supprimer un compte ou sortir tout son dossier n'exigeait qu'un jeton valide : le mot
// « SUPPRIMER » n'existe que dans le client. Un jeton volé, ou un appareil laissé ouvert, suffisait
// à détruire le compte sans retour. Le claim `amr` du jeton porte l'heure de la dernière
// authentification réelle, et un renouvellement de session ne la rajeunit pas.
//
// ⚠️ À appeler APRÈS `auth.getUser()`, qui a validé le jeton : cette fonction ne vérifie rien
// d'autre que l'âge et la méthode. Un second facteur ajouté avec une session
// existante ne prouve pas une nouvelle connexion. Format absent/inconnu : refus.
// ═════════════════════════════════════════════════

const METHODES_CONNEXION = new Set(["password", "oauth", "otp", "sso/saml", "magiclink"]);

/** La dernière authentification primaire porte-t-elle moins de maxSecondes ? */
export function connexionRecente(enTeteAuthorization, maxSecondes, maintenantS = Math.floor(Date.now() / 1000)) {
  try {
    const charge = String(enTeteAuthorization || "").split(".")[1] || "";
    const claims = JSON.parse(atob(charge.replace(/-/g, "+").replace(/_/g, "/")));
    // Exception du droit de suppression des sessions anonymes, après auth.getUser.
    if (claims.is_anonymous === true) return true;
    if (!Number.isFinite(maxSecondes) || maxSecondes <= 0 || !Number.isFinite(maintenantS) || !Array.isArray(claims.amr)) return false;
    return claims.amr.some((a) => a && METHODES_CONNEXION.has(a.method)
      && Number.isSafeInteger(a.timestamp) && a.timestamp > 0
      && a.timestamp <= maintenantS && maintenantS - a.timestamp <= maxSecondes);
  } catch (_e) {
    return false;
  }
}

/** Le corps du refus, le même pour chaque geste : le client sait y répondre. */
export const REPONSE_REAUTH = {
  ok: false,
  code: "reauth_requise",
  message: "Par sécurité, reconnecte-toi, puis recommence.",
};
