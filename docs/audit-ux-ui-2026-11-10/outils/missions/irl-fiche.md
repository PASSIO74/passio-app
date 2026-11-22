# Mission — RENCONTRES IRL : FICHE, PARTICIPATION, ORGANISATION

- Clé de domaine : `irl-fiche` · Groupe : `Rencontres IRL`
- Identifiants : surfaces `IRL-100` à `IRL-299` ; constats `IRL-C50` à `IRL-C99`
- Un autre auditeur traite la DÉCOUVERTE (liste, carte, filtres, calendrier, recherche ; clé
  `irl-decouvrir`) : n'y passe que pour atteindre une fiche. Le partage d'une activité est traité
  par `partage` (tu en décris seulement la porte).

## Périmètre

- Fiche d'activité (`openEventDetails` app-07:4243, décor `js/ui-v4b-fiche.js`) : couverture,
  titre, date/heure/durée, lieu (adresse révélée ou non), prix (`fmtEventPrice`), organisateur,
  passion, description longue, participants (visibles ou non selon le lien), preuve sociale,
  bouton principal, actions secondaires, réactions (`openEventReactions`), commentaires/discussion
  (`openEventChat` app-07:3899), activité d'exemple (« participation désactivée »), activité
  passée, complète, annulée, la mienne, celle d'un compte privé, 18 ans et + (admission).
- Inscription : feuille RSVP à 3 états (`openEventRsvpSheet` app-07:4006 : je viens / peut-être /
  ne viens pas), désinscription, liste d'attente (`openEventWaitlist` app-07:6751, promotion),
  activité complète, confirmation, proposition de rappel / notification après inscription,
  retour au contexte, double appui, hors ligne, refus du serveur (complète, passée, annulée — le
  faux serveur rejoue ces refus).
- Création et modification (`openCreateEvent` app-07:6431, lot UI-6A0 `js/ui-v6a0-activite.js` :
  couverture) : chaque champ, validations, sélecteurs (date, heure `openIrlTimePicker`, ville,
  passion `ouvrirRecherchePassionIRL`), capacité, prix, récurrence/série, brouillon conservé ?,
  clavier ouvert, erreur d'enregistrement, aperçu de ce qui sera publié, invitation après création
  (`proposerInvitationActivite`).
- Gestion par l'organisateur (`openEventManage` app-07:6677) : modifier, annuler
  (`toggleCancelEvent`, `cancelEventSeries`, `deleteEventConfirm` — dialogues natifs `confirm()`),
  co-organisateurs (`openEventCoOrganizers`), liste d'attente, invitations (`openEventInvite`
  app-07:7411, « inviter tous mes abonnements »), QR et pointage (`openEventCheckinQr` app-07:8042,
  `openCheckinCodeEntry` app-07:8096, lien `#irl-checkin-`), avis après l'activité
  (`openEventFeedback` app-07:7645, notes, retours), affiche (`js/affiche-rencontre.js`).
- « Mes événements » / « Mes rencontres » (activités passées et à venir, participations) vus depuis
  le profil ou l'onglet, et le passage conversation → activité (`js/ui-v6c-proposer-irl.js`).

## Points d'entrée dans le code

`js/app-07-ia-explore-irl.js` (lignes ci-dessus), `js/ui-v4b-fiche.js`, `js/ui-v6a0-activite.js`,
`js/affiche-rencontre.js`, `js/app-08-ui-modals-tour.js` (`supaLoadEvents` ~6160, RSVP ~8890–9100,
`supaCreateEventConversation` ~9119), `styles.css`. Fiches : `docs/PIEGES_CONNUS.md` (IRL, ~12
fiches), `docs/lots-ui/` 01 (UI-4B), 26, `docs/journal/serveur-securite-base.md` (événements),
`tests/e2e/audit-2026-11-parcours-contenu-irl.spec.js` et `audit-2026-11-promotion-attente.spec.js`
(exemples de semis d'événements et de participants sur le faux serveur). Données fictives dans
`outils/jeu/irl-fiche.js` (tables `events`, `event_attendees`, `event_comments`,
`event_reactions`) : à venir, aujourd'hui, complète avec liste d'attente, passée (avec avis),
annulée, la mienne (avec inscrits), payante, titre et description très longs.
