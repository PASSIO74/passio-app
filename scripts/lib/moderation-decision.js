"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// MODÉRATION — ce qu'une décision FAIT, exprimé en pur (MOD-01, 2026-09-14)
//
// Fonctions sans réseau, verrouillées par `tests/unit/moderation-decision.test.mjs`.
// `scripts/moderation.js` les exécute par PostgREST avec `service_role`
// (canal ② d'ADR-012). Séparer le PLAN de son EXÉCUTION permet de prouver que
// « retirer un commentaire de rencontre » vise `event_comments` et non
// `post_comments` — l'erreur exacte que `voir` avait faite le 2026-09-12.
// ═══════════════════════════════════════════════════════════════════════════

// Plan de retrait pour une cible signalée : la requête PostgREST à faire, ou
// `null` avec la raison quand l'outil ne sait pas retirer ce type-là.
function planRetrait(targetType, targetId) {
  const id = String(targetId || "");
  if (!id) return { plan: null, raison: "cible vide" };
  const cible = encodeURIComponent(id);
  switch (targetType) {
    case "post":
      return { plan: { methode: "DELETE", chemin: `posts?id=eq.${cible}`, libelle: "publication supprimée" } };
    case "comment":
      // Un identifiant `ec_…` est un commentaire de RENCONTRE (event_comments),
      // les autres sont sous une publication (post_comments).
      return id.startsWith("ec_")
        ? { plan: { methode: "DELETE", chemin: `event_comments?id=eq.${cible}`, libelle: "commentaire de rencontre supprimé" } }
        : { plan: { methode: "DELETE", chemin: `post_comments?id=eq.${cible}`, libelle: "commentaire supprimé" } };
    case "story":
      return { plan: { methode: "DELETE", chemin: `stories?id=eq.${cible}`, libelle: "story supprimée" } };
    case "message":
      return { plan: { methode: "DELETE", chemin: `conv_messages?id=eq.${cible}`, libelle: "message supprimé" } };
    case "event":
      // Une rencontre ne se supprime pas : elle s'ANNULE (les inscrits la voient
      // barrée, les inscriptions restent lisibles pour la trace).
      return { plan: { methode: "PATCH", chemin: `events?id=eq.${cible}`, corps: { status: "cancelled", updated_at: "__now__" }, libelle: "rencontre annulée" } };
    case "user":
      return { plan: null, raison: "suspendre un compte n'a pas de colonne en base — bloquer ses contenus un par un, ou supprimer le compte (delete-account, geste du propriétaire)" };
    case "passion":
      return { plan: null, raison: "les passions ont leur outil : node scripts/passions-moderation.js signalees" };
    default:
      return { plan: null, raison: "type de cible inconnu : " + String(targetType) };
  }
}

// Le texte envoyé au signalant (notification `moderation`). Il ne nomme ni la
// cible ni l'auteur — seulement la décision (DSA art. 16-17 : information du
// signalant, motivée). Borné à 200 caractères.
function texteDecision(action, note) {
  const base = action === "retrait" ? "Ton signalement a été examiné : le contenu a été retiré."
    : action === "rejet" ? "Ton signalement a été examiné : aucune infraction n'a été constatée."
    : "Ton signalement a été examiné.";
  const n = String(note || "").trim();
  const texte = n ? base + " " + n : base;
  return texte.length > 200 ? texte.slice(0, 197) + "…" : texte;
}

// La ligne `notifications` pour le signalant — ou `null` s'il n'y a personne à
// prévenir (signalement sans compte, identité absente).
function notificationPourSignalant(report, action, note) {
  const dest = report && report.reporter_id ? String(report.reporter_id) : "";
  // Un identifiant de compte est un uuid ; un placeholder `u_…` n'a pas de cloche.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dest)) return null;
  return {
    id: "n_mod_" + String(report.id || "").slice(0, 40),
    user_id: dest,
    kind: "moderation",
    from_id: null,
    ref_id: String(report.id || ""),
    content: texteDecision(action, note),
    seen: false,
  };
}

// Statut `reports` qui découle d'une action.
function statutApresAction(action) {
  return action === "rejet" ? "dismissed" : "handled";
}

module.exports = { planRetrait, texteDecision, notificationPourSignalant, statutApresAction };
