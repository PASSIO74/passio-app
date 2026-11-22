# Mission — PROFILS ET PASSIONS

- Clé de domaine : `profils` · Groupe : `Profils et passions`
- Identifiants : surfaces `PRO-001…` ; constats `PRO-C01…`
- Hors périmètre : la feuille de partage d'un profil (`partage`), l'ouverture d'une conversation
  (`msg-*`), la page de recherche et la fiche d'une passion (`recherche`).

## Périmètre

- **Mon profil** (`#screen-profiles`, lots UI-6B `js/ui-v6b-profil.js` et UI-7 `js/ui-v7-lot.js`) :
  couverture (rapport 3:2), avatar, initiales, recadrage (couverture et avatar : le recadreur, ses
  gestes, validation, annulation, image trop grande, échec d'envoi), pseudo, biographie multiligne
  et très longue, compteurs (abonnés · passions · abonnements) et leurs listes
  (`openFollowersList` app-06:1210, `openFollowingList` app-06:1200), rail des passions, onglets
  Publications | Activité, filtres de média (Tout · Photos · Vidéos · Bobines · Audio), grille,
  état vide (« Publie ta première création »), crayon de modification
  (`openEditMainProfile` app-06:1916 : chaque champ, validation du nom `nomCompteValide`, nom déjà
  pris, enregistrement, erreur), menu « ⋯ » (`openMainProfileMenu` app-06:1856).
- **Profil visité** (`openUserProfile` app-04:4287) : compte public, compte privé non suivi (ce
  qui est montré / caché, demande d'abonnement, « demande envoyée », annulation), compte suivi,
  compte qui me suit, compte bloqué / qui m'a bloqué, profil sans publication, nom très long ;
  boutons Suivre / Message ; menu « ⋯ » (`openVisitedProfileMenu` app-04:4673 : partager, signaler,
  bloquer — cette modale porte DEUX « × », fiche lots-ui 12) ; retour au contexte d'origine
  (`openModal` n'empile pas) ; les CINQ surfaces qui peignent l'état de suivi restent-elles
  cohérentes après un geste ?
- Demandes d'abonnement à un compte privé : réception, acceptation, refus (notification, liste).
- **« Mes passions »** (page `#passionManager`, `openPassionManager` app-06:2613, fiches lots-ui
  18 et 19) : en-tête, cartes de passion, « … » d'une carte (`openPassionProfileMenu`
  app-06:1891), modifier une passion (`openEditPassionProfile` app-06:3513), ajouter
  (`openCreateProfile` app-06:4587 → sélecteur `js/passion-selector.js`), recherche dans le
  référentiel (5 001 passions), création d'une passion personnalisée
  (`openCreateCustomPassion` app-02:6857), archivage (confirmation, dernière passion vivante),
  archives repliables, « Réactiver », aide (`openPassionsAide` app-06:2646). ⚠️ Le plafond de trois
  passions est LEVÉ par défaut depuis le 2026-11-01 : la fenêtre de limite (`openPassionPaywall`
  app-06:4365) n'apparaît qu'en armant le plafond (`window.PASSIO_PLAFOND_PASSIONS = true` avant le
  boot) — capture-la comme état conditionnel « simulé », sans la présenter comme la règle en vigueur.
- Distinction personne / passions / publications : est-elle lisible sur ces écrans ? (Aucune
  passion principale : ADR-011.)

## Points d'entrée dans le code

`js/app-06-reels-partage.js` (profil principal, « Mes passions »), `js/app-04-comments-shop.js`
(profil visité ~4287–5440), `js/app-05-config-profil.js`, `js/ui-v6b-profil.js`, `js/ui-v7-lot.js`,
`js/passion-selector.js`, `js/passions-flat*.js`, `js/app-08-ui-modals-tour.js` (suivi ~8596–8780,
profils ~3690–4250), `styles.css`. Fiches : `docs/lots-ui/` 04, 08, 10, 12, 13, 16, 18, 19,
`docs/journal/social-messagerie.md` (suivre), `docs/journal/passions-fil.md`,
`docs/PIEGES_CONNUS.md` (profil, biographie). Données fictives dans `outils/jeu/profils.js`
(publications de `MOI` de tous types, abonnés nombreux, demande en attente, blocage).
