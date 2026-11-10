# Mission — MESSAGERIE : LA CONVERSATION (audit approfondi)

- Clé de domaine : `msg-conversation` · Groupe : `Messagerie`
- Identifiants : surfaces `MSG-100` à `MSG-299` ; constats `MSG-C50` à `MSG-C99`
- Un autre auditeur traite la liste, la nouvelle conversation, les groupes, les paramètres et les
  appels (`msg-liste`).

## Périmètre

Chaque détail de l'écran de conversation (1:1, groupe, discussion d'activité si elle partage ce
composant) : en-tête (identité du destinataire, contexte de l'échange, retour, actions) ; bulles
(alignements, largeur, contraste, groupement, dates, heures, séparateurs de jour) ; champ de saisie
(libellé, agrandissement, 16 px, clavier ouvert simulé, bouton d'envoi ; distinction entre écrire,
envoyer et enregistrer un vocal) ; enregistrement vocal (maintien, relâchement, annulation,
interruption, durée, lecture, vitesse ; permission refusée) ; emoji, GIF, photos, vidéos, documents,
audio, localisation ; aperçu avant envoi, galerie / plein écran des pièces jointes ; réponses,
citations, réactions, menu contextuel d'un message, copie, signalement, suppression pour moi / pour
tous ; envoi en cours, échec, nouvelle tentative, file hors ligne, prévention des doublons ; états
de livraison / lecture / présence / saisie ; arrivée de messages pendant le défilement, conservation
de la position, retour aux derniers messages, longue conversation, messages très longs ;
conversation avec un compte bloqué, conversation d'exemple, proposition d'un moment IRL ; fermeture,
retour, reprise après rechargement (brouillon), superpositions (menu de pièces jointes, clavier).

## Points d'entrée dans le code

`js/app-04-comments-shop.js` (`openConversation` ~5654, `renderConvFpThread` ~5919, `sendMessageFp`
~6993, `_fluxEnvoiMessage`, `applyMsgContentData` ~6743, `_openMsgActions` ~6334),
`js/app-09-boot-pwa.js` (pièces jointes ~708–1560, vocal ~1981–2100), `js/emoji-misc.js`,
`js/ui-v6a-messages.js`, `js/ui-v6c-proposer-irl.js`, `js/app-08-ui-modals-tour.js`
(`supaLoadMessages` ~6789), `docs/journal/social-messagerie.md`.
