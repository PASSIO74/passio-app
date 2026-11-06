// ═══════════════════════════════════════════════════════════════════════════
// CONTRATS D'ACTION — ce que « réussi » veut dire, parcours par parcours
// (2026-11-06)
//
// Jusqu'ici le nuage ne jugeait aucun RÉSULTAT MÉTIER : les flux d'action
// (`tel.flowStart` → `step "saved"` → `flowEnd`, js/telemetry.js) n'étaient
// relus que par l'atelier du poste (dashboard/server/traces.js). Un message
// refusé en HTTP 200, une publication jamais enregistrée ou une action restée
// sans verdict ne remontaient au téléphone que s'ils levaient aussi une erreur
// JavaScript ou un appel réseau en échec.
//
// Ce registre est la SEULE définition, lue par :
//   · la fonction `pilotage` (Deno) — bilan des parcours, voyant, « À faire » ;
//   · la Sentinelle (`scripts/sentinelle-detecter.mjs`) — enquêtes « parcours » ;
//   · la garde `scripts/audit-contrats-actions.js` (npm run verif) — un flux
//     sans contrat, un flux ouvert jamais fermé, un contrat critique sans
//     émetteur ou un verrou qui n'existe pas font échouer la CI.
//
// Vocabulaire (le sens de la consigne du 2026-11-06, §7, adapté au code) :
//   start  = action.intent         (le gestionnaire est parti, une écriture va être tentée)
//   step « saved » ok   = domain.committed   (la source de vérité a accepté)
//   step « saved » error = domain.rejected   (refus, ou échec technique)
//   end « pending »     = action.pending     (mise en file locale, annoncée comme telle)
//   pas de fin dans `finMs` = action.unknown (JAMAIS un succès, jamais un échec prouvé :
//                                             la télémétrie a pu se perdre)
// Un refus LÉGITIME (`refusLegitimes`, codes fermés émis par le client) n'est
// pas un défaut ; il se compte à part, jamais retiré en silence du dénominateur.
//
// ⚠️ Les codes d'un refus (`meta.rc`) sont écrits par un NAVIGATEUR : ils ne
// décident de rien seuls. `parcours.js` les assainit, et seules des identités
// SERVEUR (`auth_uid`) comptent pour déclarer un parcours en panne.
// Ce fichier ne fait AUCUN appel réseau ; tests/unit/contrats-actions.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════

export const VERSION_CONTRATS = 1;

export const CRITICITES = Object.freeze(["critique", "important"]);
export const REPRISES = Object.freeze(["file_locale", "rejeu_idempotent", "manuelle", "aucune"]);
export const SENSIBILITES = Object.freeze(["privee", "publique", "compte", "securite"]);
export const DOMAINES = Object.freeze(["messagerie", "publication", "interaction", "social", "rencontres", "securite", "compte"]);

// Un code de refus, d'attente ou d'étape : court, fermé, sans texte libre.
export const RE_CODE = /^[a-z0-9_]{1,40}$/;
// Un identifiant d'action : celui que `tel.flowStart` reçoit.
export const RE_ACTION = /^[a-z][a-z0-9_]{1,39}$/;

const contrat = (x) => Object.freeze({
  confirmation: "saved",
  coupure: null,
  ...x,
  attente: Object.freeze([...(x.attente || [])]),
  refusLegitimes: Object.freeze([...(x.refusLegitimes || [])]),
  emetteurs: Object.freeze([...(x.emetteurs || [])]),
  verrous: Object.freeze([...(x.verrous || [])]),
});

// `finMs` : au-delà, une action sans verdict est « inconnue ». Il couvre les
// essais internes de l'action (publication : jusqu'à 3 essais avec envoi du
// média), pas la file hors ligne, qui se déclare par `end "pending"`.
// `objectifP95Ms` : objectif de départ (consigne §25), mesuré du start au
// verdict sur la MÊME horloge (celle de l'appareil) — jamais deux horloges
// soustraites. Un objectif n'est pas un résultat : le bilan dit combien
// d'échantillons le soutiennent.
export const CONTRATS = Object.freeze({
  send_message: contrat({
    id: "send_message", libelle: "Envoyer un message", domaine: "messagerie", criticite: "critique",
    acteur: "membre de la conversation, compte réel",
    reaction: "le message s'affiche « envoi… » puis ✓ ; en échec « ⚠️ réessayer »",
    verite: "conv_messages (ligne id = identifiant du message, from_id = l'auteur)",
    finMs: 20e3, objectifP95Ms: 1000,
    attente: ["hors_ligne"],
    reprise: "file_locale", sensibilite: "privee",
    emetteurs: ["js/app-04-comments-shop.js", "js/app-09-boot-pwa.js"],
    verrous: ["tests/e2e/parcours-flux.spec.js", "tests/e2e/message-refus-definitif.spec.js", "tests/e2e/file-messages-par-compte.spec.js", "tests/e2e/message-media-echec.spec.js"],
  }),
  publish_post: contrat({
    id: "publish_post", libelle: "Publier une publication", domaine: "publication", criticite: "critique",
    acteur: "compte réel, passion du référentiel",
    reaction: "la carte apparaît dans le fil, puis passe de « en cours » à publiée",
    verite: "posts (ligne id = identifiant local) + objet Storage du média",
    finMs: 180e3, objectifP95Ms: 3000,
    reprise: "file_locale", sensibilite: "publique",
    emetteurs: ["js/app-08-ui-modals-tour.js"],
    verrous: ["tests/e2e/publication-optimiste-refusee.spec.js", "tests/e2e/publications-reprise.spec.js"],
  }),
  publish_reel: contrat({
    id: "publish_reel", libelle: "Publier une bobine", domaine: "publication", criticite: "critique",
    acteur: "compte réel, passion du référentiel",
    reaction: "la bobine apparaît, l'envoi de la vidéo est suivi jusqu'au bout",
    verite: "posts (is_reel) + objet Storage de la vidéo",
    finMs: 600e3, objectifP95Ms: 30e3,
    reprise: "file_locale", sensibilite: "publique",
    emetteurs: ["js/app-08-ui-modals-tour.js"],
    verrous: ["tests/e2e/publications-reprise.spec.js"],
  }),
  publish_story: contrat({
    id: "publish_story", libelle: "Publier une story", domaine: "publication", criticite: "important",
    acteur: "compte réel",
    reaction: "la story apparaît dans la rangée, ou un refus est dit",
    verite: "stories (ligne id) + objet Storage du média",
    finMs: 180e3, objectifP95Ms: 5000,
    reprise: "aucune", sensibilite: "publique",
    emetteurs: ["js/app-08-ui-modals-tour.js"],
    verrous: ["tests/e2e/faux-succes-irl-story.spec.js"],
  }),
  comment_post: contrat({
    id: "comment_post", libelle: "Commenter", domaine: "interaction", criticite: "critique",
    acteur: "compte réel",
    reaction: "le commentaire s'affiche « envoi… » puis confirmé, ou « non envoyé »",
    verite: "post_comments (ligne id = identifiant local)",
    finMs: 20e3, objectifP95Ms: 1000,
    reprise: "file_locale", sensibilite: "publique",
    emetteurs: ["js/app-08-ui-modals-tour.js"],
    verrous: ["tests/e2e/parcours-flux.spec.js"],
  }),
  cint: contrat({
    id: "cint", libelle: "Réagir à un commentaire (j'aime, réponse, emoji, épingle)", domaine: "interaction", criticite: "important",
    acteur: "compte réel",
    reaction: "la réaction s'affiche aussitôt, annulée à l'écran si le serveur refuse",
    verite: "comment_interactions (ligne id)",
    finMs: 20e3, objectifP95Ms: 1000,
    reprise: "aucune", sensibilite: "publique",
    emetteurs: ["js/app-08-ui-modals-tour.js"],
    verrous: ["tests/e2e/parcours-flux.spec.js", "tests/e2e/reactions-commentaire-bloque.spec.js"],
  }),
  like_post: contrat({
    id: "like_post", libelle: "Aimer une publication", domaine: "interaction", criticite: "important",
    acteur: "compte réel",
    reaction: "le cœur se remplit aussitôt, se vide si le serveur refuse",
    verite: "post_likes (post_id, user_id)",
    finMs: 15e3, objectifP95Ms: 1000,
    reprise: "aucune", sensibilite: "publique",
    emetteurs: ["js/app-03-posts-vlogs.js"],
    verrous: ["tests/e2e/capacite-likes-visibles.spec.js"],
  }),
  unlike_post: contrat({
    id: "unlike_post", libelle: "Retirer un j'aime", domaine: "interaction", criticite: "important",
    acteur: "compte réel",
    reaction: "le cœur se vide aussitôt, se remplit de nouveau si le serveur refuse",
    verite: "post_likes (ligne absente)",
    finMs: 15e3, objectifP95Ms: 1000,
    reprise: "aucune", sensibilite: "publique",
    emetteurs: ["js/app-03-posts-vlogs.js"],
    verrous: ["tests/e2e/capacite-likes-visibles.spec.js"],
  }),
  follow_user: contrat({
    id: "follow_user", libelle: "Suivre un profil", domaine: "social", criticite: "important",
    acteur: "compte réel",
    reaction: "le bouton passe à « Suivi » ou « Demande envoyée »",
    verite: "follows (follower_id, following_id, status tranché par le serveur)",
    finMs: 15e3, objectifP95Ms: 1000,
    reprise: "aucune", sensibilite: "compte",
    emetteurs: ["js/app-08-ui-modals-tour.js"],
    verrous: ["tests/e2e/fil-suivi-garantie.spec.js"],
  }),
  unfollow_user: contrat({
    id: "unfollow_user", libelle: "Ne plus suivre", domaine: "social", criticite: "important",
    acteur: "compte réel",
    reaction: "le bouton repasse à « Suivre »",
    verite: "follows (ligne absente)",
    finMs: 15e3, objectifP95Ms: 1000,
    reprise: "aucune", sensibilite: "compte",
    emetteurs: ["js/app-08-ui-modals-tour.js"],
    verrous: ["tests/e2e/fil-suivi-garantie.spec.js"],
  }),
  block_user: contrat({
    id: "block_user", libelle: "Bloquer un compte", domaine: "securite", criticite: "critique",
    acteur: "compte réel",
    reaction: "le compte disparaît du fil, de la messagerie et des réactions",
    verite: "blocks (blocker_id, blocked_id)",
    finMs: 15e3, objectifP95Ms: 1000,
    reprise: "aucune", sensibilite: "securite",
    emetteurs: ["js/app-08-ui-modals-tour.js"],
    verrous: ["tests/e2e/stories-blocage.spec.js", "tests/e2e/reactions-commentaire-bloque.spec.js"],
  }),
  event_join: contrat({
    id: "event_join", libelle: "S'inscrire à une rencontre", domaine: "rencontres", criticite: "critique",
    acteur: "compte réel majeur",
    reaction: "« Je viens » s'affiche, annulé si le serveur refuse ; complet = liste d'attente",
    verite: "event_attendees (event_id, user_id, rsvp)",
    finMs: 20e3, objectifP95Ms: 1500,
    refusLegitimes: ["complete", "annulee", "passee", "introuvable", "hors_fenetre"],
    reprise: "aucune", sensibilite: "compte",
    emetteurs: ["js/app-07-ia-explore-irl.js"],
    verrous: ["tests/e2e/telemetrie-rsvp.spec.js"],
  }),
  event_leave: contrat({
    id: "event_leave", libelle: "Se désinscrire d'une rencontre", domaine: "rencontres", criticite: "important",
    acteur: "compte réel",
    reaction: "l'inscription disparaît, rétablie si le serveur refuse",
    verite: "event_attendees (ligne absente)",
    finMs: 20e3, objectifP95Ms: 1500,
    refusLegitimes: ["annulee", "passee", "introuvable", "hors_fenetre"],
    reprise: "aucune", sensibilite: "compte",
    emetteurs: ["js/app-07-ia-explore-irl.js"],
    verrous: ["tests/e2e/telemetrie-rsvp.spec.js"],
  }),
  report_content: contrat({
    id: "report_content", libelle: "Signaler un contenu ou un compte", domaine: "securite", criticite: "critique",
    acteur: "compte réel",
    reaction: "« Signalement envoyé » seulement si la ligne est en base, sinon un refus dit",
    verite: "reports (ligne id, status ouvert)",
    finMs: 20e3, objectifP95Ms: 1500,
    reprise: "manuelle", sensibilite: "securite",
    emetteurs: ["js/app-08-ui-modals-tour.js"],
    verrous: ["tests/e2e/parcours-flux.spec.js", "tests/e2e/signaler-publication.spec.js", "tests/e2e/audit-2026-11-signaler-message.spec.js"],
  }),
  delete_account: contrat({
    id: "delete_account", libelle: "Supprimer son compte", domaine: "compte", criticite: "critique",
    acteur: "le compte lui-même",
    reaction: "suppression confirmée par le serveur avant toute déconnexion",
    verite: "Edge Function delete-account (verdict serveur), auth.users absent",
    finMs: 90e3, objectifP95Ms: 15e3,
    reprise: "manuelle", sensibilite: "compte",
    emetteurs: ["js/app-02-state-utils.js"],
    verrous: ["tests/e2e/suppression-compte-verdict.spec.js"],
  }),
});

// Recensés, PAS instrumentés en flux aujourd'hui : la couverture le dit au lieu
// de les taire (consigne §6 : « ne présente pas tous les clics sont surveillés
// si une partie est exclue »). Chacun est vu ailleurs, partiellement : erreurs
// JS, appels réseau refusés, inscriptions confirmées (veille de production).
export const PARCOURS_NON_INSTRUMENTES = Object.freeze([
  Object.freeze({ id: "connexion", libelle: "Se connecter", vuPar: "refus d'authentification (appels réseau), veille « inscriptions »" }),
  Object.freeze({ id: "inscription", libelle: "Créer un compte", vuPar: "taux de confirmation (veille de production), télémétrie d'inscription" }),
  Object.freeze({ id: "profil", libelle: "Enregistrer son profil et ses passions", vuPar: "appels réseau refusés" }),
  Object.freeze({ id: "piece_jointe", libelle: "Envoyer le fichier d'une pièce jointe (Storage)", vuPar: "appels réseau refusés ; le message lui-même est sous contrat" }),
  Object.freeze({ id: "notification_push", libelle: "Recevoir une notification sur l'appareil", vuPar: "rien : le fournisseur accepte sans preuve de réception" }),
  Object.freeze({ id: "appel", libelle: "Passer un appel", vuPar: "erreurs JS seulement" }),
  Object.freeze({ id: "creer_rencontre", libelle: "Créer une rencontre", vuPar: "appels réseau refusés" }),
]);

const CHAMPS_TEXTE = ["id", "libelle", "domaine", "criticite", "acteur", "reaction", "verite", "reprise", "sensibilite", "confirmation"];
const estEntierPositif = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;

/**
 * Valide le registre. Rend la liste des erreurs (vide = valide). Une erreur
 * n'est jamais « à peu près » : un registre invalide ne juge rien (le bilan
 * rend alors `contratsInvalides`, et l'écran le dit).
 */
export function validerContrats(contrats = CONTRATS, coupuresAutorisees = null) {
  const erreurs = [];
  if (!contrats || typeof contrats !== "object") return ["registre absent"];
  const ids = Object.keys(contrats);
  if (!ids.length) erreurs.push("registre vide");
  for (const cle of ids) {
    const c = contrats[cle];
    const ou = `contrat ${cle}`;
    if (!c || typeof c !== "object") { erreurs.push(`${ou} : absent`); continue; }
    for (const ch of CHAMPS_TEXTE) if (typeof c[ch] !== "string" || !c[ch].trim()) erreurs.push(`${ou} : champ « ${ch} » manquant`);
    if (c.id !== cle) erreurs.push(`${ou} : id « ${c.id} » ≠ clé`);
    if (!RE_ACTION.test(cle)) erreurs.push(`${ou} : identifiant hors format`);
    if (c.domaine && !DOMAINES.includes(c.domaine)) erreurs.push(`${ou} : domaine inconnu « ${c.domaine} »`);
    if (c.criticite && !CRITICITES.includes(c.criticite)) erreurs.push(`${ou} : criticité inconnue « ${c.criticite} »`);
    if (c.reprise && !REPRISES.includes(c.reprise)) erreurs.push(`${ou} : reprise inconnue « ${c.reprise} »`);
    if (c.sensibilite && !SENSIBILITES.includes(c.sensibilite)) erreurs.push(`${ou} : sensibilité inconnue « ${c.sensibilite} »`);
    if (c.confirmation && !RE_CODE.test(c.confirmation)) erreurs.push(`${ou} : étape de confirmation hors format`);
    if (!estEntierPositif(c.finMs) || c.finMs > 3600e3) erreurs.push(`${ou} : finMs invalide (1 ms à 1 h)`);
    if (!estEntierPositif(c.objectifP95Ms) || (estEntierPositif(c.finMs) && c.objectifP95Ms > c.finMs)) erreurs.push(`${ou} : objectifP95Ms invalide (positif, ≤ finMs)`);
    for (const champ of ["attente", "refusLegitimes"]) {
      if (!Array.isArray(c[champ])) { erreurs.push(`${ou} : ${champ} doit être une liste`); continue; }
      for (const code of c[champ]) if (typeof code !== "string" || !RE_CODE.test(code)) erreurs.push(`${ou} : code « ${code} » hors format dans ${champ}`);
    }
    if (Array.isArray(c.attente) && Array.isArray(c.refusLegitimes)) {
      const communs = c.attente.filter((x) => c.refusLegitimes.includes(x));
      if (communs.length) erreurs.push(`${ou} : « ${communs[0]} » à la fois attente et refus légitime`);
    }
    if (!Array.isArray(c.emetteurs) || !c.emetteurs.length) erreurs.push(`${ou} : aucun émetteur déclaré`);
    else for (const f of c.emetteurs) if (typeof f !== "string" || !/^js\/[\w.-]+\.js$/.test(f)) erreurs.push(`${ou} : émetteur hors js/ « ${f} »`);
    if (!Array.isArray(c.verrous) || !c.verrous.length) erreurs.push(`${ou} : aucun verrou (test) déclaré`);
    else for (const f of c.verrous) if (typeof f !== "string" || !/^tests\/(e2e|unit)\/[\w.-]+\.(spec\.js|test\.mjs)$/.test(f)) erreurs.push(`${ou} : verrou hors tests/ « ${f} »`);
    if (c.coupure != null) {
      if (typeof c.coupure !== "string") erreurs.push(`${ou} : coupure invalide`);
      else if (Array.isArray(coupuresAutorisees) && !coupuresAutorisees.includes(c.coupure)) erreurs.push(`${ou} : coupure « ${c.coupure} » hors liste blanche`);
    }
  }
  return erreurs;
}

/** Le contrat d'une action, ou null (une action inconnue n'est jugée par aucun contrat). */
export function contratDe(action, contrats = CONTRATS) {
  const a = String(action || "");
  return Object.hasOwn(contrats, a) ? contrats[a] : null;
}

/** Les identifiants des contrats critiques, dans l'ordre du registre. */
export function contratsCritiques(contrats = CONTRATS) {
  return Object.values(contrats).filter((c) => c && c.criticite === "critique").map((c) => c.id);
}
