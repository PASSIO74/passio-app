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
      return { plan: null, raison: "un compte ne se « retire » pas : node scripts/moderation.js suspendre --id <signalement> --jours N (ou lever --uid)" };
    case "passion":
      return { plan: null, raison: "les passions ont leur outil : node scripts/passions-moderation.js signalees" };
    default:
      return { plan: null, raison: "type de cible inconnu : " + String(targetType) };
  }
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUSPENSION_JOURS_MAX = 365;

// Plan de SUSPENSION d'un compte (MOD-01, 2026-09-15) : la suspension vit dans
// `auth.users.banned_until`, posée par l'API d'administration GoTrue
// (`PUT /auth/v1/admin/users/<uid>`, `ban_duration` en heures). Un compte
// banni ne peut plus se connecter ni rafraîchir son jeton ; sa session en
// cours meurt à l'expiration du jeton d'accès (≤ 1 h). Rien n'est supprimé :
// une suspension se lève (`planLevee`), une suppression ne se lève pas.
function planSuspension(uid, jours) {
  const id = String(uid || "");
  if (!RE_UUID.test(id)) return { plan: null, raison: "identifiant de compte attendu (uuid), reçu : " + (id || "vide") };
  const n = Number(jours);
  if (!Number.isInteger(n) || n < 1 || n > SUSPENSION_JOURS_MAX) return { plan: null, raison: "--jours attend un entier entre 1 et " + SUSPENSION_JOURS_MAX };
  return { plan: { methode: "PUT", chemin: "auth/v1/admin/users/" + id, corps: { ban_duration: (n * 24) + "h" }, jours: n, libelle: "compte suspendu " + n + " jour" + (n > 1 ? "s" : "") } };
}
function planLevee(uid) {
  const id = String(uid || "");
  if (!RE_UUID.test(id)) return { plan: null, raison: "identifiant de compte attendu (uuid), reçu : " + (id || "vide") };
  return { plan: { methode: "PUT", chemin: "auth/v1/admin/users/" + id, corps: { ban_duration: "none" }, libelle: "suspension levée" } };
}

// Le texte pour le compte SUSPENDU (DSA art. 17 : exposé des motifs à la
// personne visée). Il arrive dans sa cloche — lisible au retour — et l'écran de
// connexion, lui, dit « suspendu » tout de suite (`onbDoAuth`, app-02). Borné.
function texteSuspension(jours, note) {
  const n = Number(jours);
  const base = "Ton compte est suspendu " + n + " jour" + (n > 1 ? "s" : "") + ".";
  const motif = String(note || "").trim();
  const texte = (motif ? base + " Motif : " + motif + "." : base) + " Pour contester : passioadmin@gmail.com";
  return texte.length > 200 ? texte.slice(0, 197) + "…" : texte;
}
function notificationPourCible(uid, jours, note) {
  const dest = String(uid || "");
  if (!RE_UUID.test(dest)) return null;
  return { id: "n_susp_" + dest.slice(0, 8) + "_" + Date.now().toString(36), user_id: dest, kind: "moderation", from_id: null, ref_id: null, content: texteSuspension(jours, note), seen: false };
}

// Le texte envoyé au signalant (notification `moderation`). Il ne nomme ni la
// cible ni l'auteur — seulement la décision (DSA art. 16-17 : information du
// signalant, motivée). Borné à 200 caractères.
function texteDecision(action, note) {
  const base = action === "retrait" ? "Ton signalement a été examiné : le contenu a été retiré."
    : action === "rejet" ? "Ton signalement a été examiné : aucune infraction n'a été constatée."
    : action === "suspension" ? "Ton signalement a été examiné : le compte a été suspendu."
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


// ═══════════════════════════════════════════════════════════════════════════
// ASTRA-38 (quatrième contre-revue, 15/09/2026) — « SUSPENSION LEVÉE » ÉTAIT
// ANNONCÉ SANS QUE LA RELECTURE AIT PU DIRE QUOI QUE CE SOIT.
//
// `lever` relisait le compte par
//     .then((x) => x.json()).catch(() => null)
// puis
//     const encore = relu && relu.banned_until && …futur ;
//     if (encore) sortir(…) ;   // sinon : « ✅ suspension levée »
// Trois chemins menaient donc au succès SANS AUCUNE PREUVE :
//   · une erreur réseau → `relu = null` → `encore` faux → succès annoncé ;
//   · un HTTP 403/500 avec un corps JSON d'erreur → pas de `banned_until` →
//     `encore` faux → succès annoncé (`r.ok` n'était jamais lu) ;
//   · une réponse portant un AUTRE compte → jamais comparée à `uid`.
// `suspendre` relisait de la même façon, mais dans le sens INVERSE (`if (!banni)
// sortir(…)`), donc une relecture illisible y échouait FERMÉ — par direction,
// pas par contrôle. Les deux passent désormais par la même décision.
//
// LA RÈGLE : une modification n'est « vérifiée » que si la bonne réponse, pour
// le BON compte, dit l'état attendu. Sinon c'est « NON VÉRIFIÉE » — ni un
// succès, ni nécessairement un échec : un état qu'on ne connaît pas, et qui
// doit être dit tel quel, y compris au journal.
// ═══════════════════════════════════════════════════════════════════════════
function verdictRelectureSuspension(reponse, uid, attendu, maintenant) {
  const t = maintenant instanceof Date ? maintenant.getTime() : Number(maintenant || Date.now());
  if (!reponse || typeof reponse !== "object") return { verifie: false, motif: "aucune réponse à la relecture (réseau ?)" };
  if (reponse.reseau) return { verifie: false, motif: "relecture impossible : " + String(reponse.reseau).slice(0, 160) };
  if (!reponse.ok) return { verifie: false, motif: "relecture refusée : HTTP " + reponse.status };
  const c = reponse.corps;
  if (c === null || typeof c !== "object" || Array.isArray(c)) return { verifie: false, motif: "relecture illisible : corps inattendu" };
  // ⚠️ LA BONNE RÉPONSE POUR LE BON COMPTE. Sans ce contrôle, la réponse d'un
  // autre compte — ou un corps d'erreur JSON qui porte un `id` — vaudrait preuve.
  if (!c.id) return { verifie: false, motif: "relecture illisible : aucun `id` dans la réponse" };
  if (String(c.id) !== String(uid)) return { verifie: false, motif: "relecture d'un AUTRE compte (" + String(c.id).slice(0, 8) + "… ≠ " + String(uid).slice(0, 8) + "…)" };
  const b = c.banned_until ? Date.parse(c.banned_until) : NaN;
  const suspendu = Number.isFinite(b) && b > t;
  if (attendu === "suspendu") {
    return suspendu ? { verifie: true, conforme: true, jusqu: c.banned_until }
                    : { verifie: true, conforme: false, motif: "`banned_until` n'est pas posé (" + String(c.banned_until) + ") — le compte n'est PAS suspendu" };
  }
  return suspendu ? { verifie: true, conforme: false, motif: "`banned_until` = " + c.banned_until + ", la suspension tient encore", jusqu: c.banned_until }
                  : { verifie: true, conforme: true, jusqu: null };
}

module.exports = { verdictRelectureSuspension, planRetrait, planSuspension, planLevee, texteSuspension, notificationPourCible, texteDecision, notificationPourSignalant, statutApresAction, SUSPENSION_JOURS_MAX };
