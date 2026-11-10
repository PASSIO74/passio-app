# Ordre de réalisation par lots — audit UX/UI PASSIO

> Généré par `outils/construire-galerie.js` depuis `donnees/lots.json`. Version auditée : main @ 4e1d8ed1152867f309668a4a6847b8219d2f6622 (PR #820, 2026-11-10 14:08 UTC) — identique à la production (release.json : buildId 3d8e98bb12ad).
> Risque **critique** = touche à l'authentification, aux droits, aux données privées ou à une règle métier : revue indépendante obligatoire, garde-fous existants conservés (AGENTS.md).

| Lot | Vague | Risque | Titre | Constats |
|---|---|---|---|---|
| LOT-1 | 1 · corrections rapides | normal | Ce que l'application dit se voit, et dit vrai | 10 |
| LOT-2 | 1 · corrections rapides | critique | Arriver par un lien, créer son compte, retrouver le contenu | 6 |
| LOT-3 | 2 · parcours principaux | normal | Du fil à la rencontre, sans rupture | 8 |
| LOT-4 | 2 · parcours principaux | normal | Une messagerie fiable et confortable | 12 |
| LOT-5 | 2 · parcours principaux | normal | Les exemples ne se font plus passer pour de vraies personnes | 5 |
| LOT-6 | 2 · parcours principaux | critique | Confiance : suivre, bloquer, signaler, confirmer | 8 |
| LOT-7 | 2 · parcours principaux | normal | Des réglages qui font ce qu'ils disent | 4 |
| LOT-8 | 3 · harmonisation | normal | Un seul vocabulaire, une seule famille d'icônes, des cibles de 44 px | 3 |
| LOT-9 | 4 · évolutions | normal | Évolutions à arbitrer après mesure | 5 |

## LOT-1 — Ce que l'application dit se voit, et dit vrai

- **Vague** : 1 · corrections rapides · **Risque** : normal
- **Résultat utilisateur attendu** : Chaque confirmation, refus ou erreur est visible au-dessus de la fenêtre ouverte, et aucune action refusée par le serveur n'est plus annoncée réussie.
- **Périmètre** : Pile des toasts au-dessus de toute superposition (TRA-C01 : MSG-C85, PAR-C03, IRL-C65, BOB-C20) ; lecture systématique de `{ error }` et annulation de l'affichage optimiste sur refus (TRA-C03 : PRO-C01, FIL-C06, MSG-C05, MSG-C57, CRE-C04).
- **Constats couverts** : TRA-C01, MSG-C85, PAR-C03, IRL-C65, TRA-C03, PRO-C01, FIL-C06, MSG-C05, MSG-C57, CRE-C04
- **Critères d'acceptation** :
  - Conversation, profil visité, lecteur de bobines, fiche d'activité et modale ouverts : un toast émis est le premier élément peint à son emplacement (`elementFromPoint` sur un toast rendu cliquable le temps du test), au-dessus de la barre basse et du clavier.
  - Refus RLS simulé (403) sur l'enregistrement du profil, la suppression d'un commentaire, l'ajout d'un membre, l'envoi d'un GIF et la publication : aucun message de réussite, l'état affiché revient à l'état serveur, un message dit pourquoi.
- **Fichiers ou systèmes probablement concernés** : `styles.css`, `js/app-02-state-utils.js`, `js/app-04-comments-shop.js`, `js/app-05-config-profil.js`, `js/app-06-reels-partage.js`, `js/app-09-boot-pwa.js`
- **Vérifications nécessaires** : Suites e2e des domaines touchés + un banc « refus serveur » sur le faux serveur partagé (`audit-2026-11-parcours-faux-serveur.js`, pannes programmées) ; WebKit pour l'empilement.
- **Centre de pilotage / Sentinelle** : Oui : émettre `tel.error` sur chaque refus d'écriture affiché, pour que la Sentinelle voie la fréquence des refus réels (aujourd'hui masqués par les faux succès).
- **Métrique utile** : Nombre de refus d'écriture affichés par jour (télémétrie) ; baisse des actions répétées (double geste) — à mesurer, pas à prédire.
- **Retour arrière** : CSS d'empilement et lecture d'erreur sans drapeau ; un revert de PR suffit.

## LOT-2 — Arriver par un lien, créer son compte, retrouver le contenu

- **Vague** : 1 · corrections rapides · **Risque** : critique
- **Résultat utilisateur attendu** : Une personne qui ne connaît pas PASSIO ouvre un lien, voit le contenu, crée son compte sur un formulaire visible et retombe exactement sur ce contenu.
- **Périmètre** : Formulaire de compte au-dessus du contenu (PAR-C01, P0) ; réouverture du contenu visé après inscription (PAR-C02) ; état d'arrivée d'un lien mort, privé ou inconnu (PAR-C05) ; retour système qui ferme le formulaire (ENT-C01) ; formulaire d'inscription en deux temps, bouton visible, erreurs sous le champ (ENT-C02) ; profil d'un visiteur qui propose le compte (ENT-C04). Prototypes : partage.html, premiere-visite.html.
- **Constats couverts** : PAR-C01, PAR-C02, PAR-C05, ENT-C01, ENT-C02, ENT-C04
- **Critères d'acceptation** :
  - Visiteur sur `#post-<id>`, une fiche d'activité ou une bobine : « Créer mon compte » rend le formulaire visible au premier plan en moins de 300 ms.
  - Après inscription confirmée, la publication, l'activité ou la bobine du lien est rouverte (preuve : l'identifiant visé est à l'écran).
  - Lien mort ou privé : un écran d'arrivée explicite s'affiche en moins de 2 s, avec une sortie vers le fil.
  - Retour système depuis le formulaire : le formulaire se ferme, l'écran dessous n'a pas changé.
- **Fichiers ou systèmes probablement concernés** : `js/app-06-reels-partage.js`, `js/app-02-state-utils.js`, `js/first-run.js`, `js/app-08-ui-modals-tour.js`, `index.html`, `styles.css`
- **Vérifications nécessaires** : Suites first-run, lien-inscription, partage-*, historique-retour-en-vol, en Chromium ET WebKit (iPhone) ; essai réel sur iPhone d'un lien reçu par messagerie.
- **Centre de pilotage / Sentinelle** : Oui : l'entonnoir des liens existe (`link_*`) — ajouter l'étape « inscription depuis un lien » puis « contenu rouvert » pour mesurer la continuité.
- **Métrique utile** : Part des inscriptions issues d'un lien qui aboutissent au contenu visé (entonnoir `link_*`).
- **Retour arrière** : Touche au parcours d'authentification (critique) : revue indépendante obligatoire, aucune modification de l'auth elle-même (Supabase, consentements, majorité) — seulement l'ordre d'affichage et la mémoire du contenu visé ; revert de PR.

## LOT-3 — Du fil à la rencontre, sans rupture

- **Vague** : 2 · parcours principaux · **Risque** : normal
- **Résultat utilisateur attendu** : Une publication qui annonce une activité y mène tout de suite ; l'inscription est confirmée et propose la suite ; on revient toujours d'où l'on vient.
- **Périmètre** : Repeint des cartes à l'arrivée des activités (PCS-C01 / FIL-C01) ; confirmation et étape suivante après « Je participe » (PCS-C03) ; pas de désinscription au second appui (IRL-C50) ; sorties vers le réel visibles dans le lecteur de bobines (BOB-C03) ; la fiche passion mène à Rencontrer (REC-C04) ; retour vers l'origine depuis une conversation (PCS-C02) ; un seul mot pour l'inscription (PCS-C06). Prototype : rejoindre-activite.html.
- **Constats couverts** : PCS-C01, FIL-C01, PCS-C03, IRL-C50, BOB-C03, REC-C04, PCS-C02, PCS-C06
- **Critères d'acceptation** :
  - « Voir l'activité » visible au plus 1 s après l'arrivée des activités, sans geste ni saut de défilement.
  - Après « Je participe » : confirmation `role=status` avec la date, action « Écrire aux participants » visible sans défilement, et la désinscription n'est jamais sous le doigt qui vient de s'inscrire.
  - Fil → profil → Message → Retour : le profil est rétabli sur le fil, à la même position.
- **Fichiers ou systèmes probablement concernés** : `js/app-08-ui-modals-tour.js`, `js/ui-v3-passerelle.js`, `js/ui-v4b-fiche.js`, `js/ui-v5-bobines.js`, `js/app-07-ia-explore-irl.js`, `js/app-04-comments-shop.js`, `styles.css`
- **Vérifications nécessaires** : Suites ui-v3-passerelle, ui-v4b-fiche, feed-premier-rendu, conv-ouverture-fil, historique-retour-en-vol ; parcours cœur rejoué au banc (`outils/scenarios/parcours.js`).
- **Centre de pilotage / Sentinelle** : Oui : c'est la boucle centrale. Mesurer `fil → voir l'activité → inscription` comme un parcours (`tel.flowStart`) pour suivre le taux de passage.
- **Métrique utile** : Taux de passage publication « Rencontrer » → fiche → inscription.
- **Retour arrière** : Modules sous drapeau existants (UI-3, UI-4B, UI-5) : la coupure rend l'état d'avant.

## LOT-4 — Une messagerie fiable et confortable

- **Vague** : 2 · parcours principaux · **Risque** : normal
- **Résultat utilisateur attendu** : Écrire, enregistrer un vocal, joindre un média et relire l'historique se font sans surprise ; les réglages d'une conversation tiennent.
- **Périmètre** : Préférences de conversation conservées au démarrage (MSG-C01, et brouillon MSG-C74) ; arrêt sur le dernier message (MSG-C52) ; vocal : maintenir / relâcher / glisser pour annuler (MSG-C53, MSG-C54) ; pas de saut forcé en bas, pastille « nouveaux messages » (MSG-C55) ; confirmation avant d'envoyer sa position (MSG-C56) ; suppression confirmée et annulable (MSG-C58, MSG-C09) ; champ de saisie élargi (MSG-C60) ; contraste des bulles média (MSG-C50) ; recherche insensible aux accents (MSG-C06) ; fenêtre des membres exacte (MSG-C08). Prototype : messagerie.html.
- **Constats couverts** : MSG-C01, MSG-C52, MSG-C53, MSG-C54, MSG-C55, MSG-C56, MSG-C58, MSG-C09, MSG-C60, MSG-C50, MSG-C06, MSG-C08
- **Critères d'acceptation** :
  - Épingle, archive, sourdine et brouillon survivent à un rechargement.
  - Toucher bref sur le micro : aucune captation, une consigne s'affiche ; maintien puis glisser : annulé ; relâcher : envoyé.
  - Lecture de l'historique + message reçu : la position ne bouge pas, une pastille « 1 nouveau message » apparaît.
  - Contraste ≥ 4,5:1 dans toutes les bulles ; champ de saisie ≥ 220 px à 390 px.
- **Fichiers ou systèmes probablement concernés** : `js/app-04-comments-shop.js`, `js/app-09-boot-pwa.js`, `js/app-05-config-profil.js`, `js/ui-v6a-messages.js`, `styles.css`
- **Vérifications nécessaires** : Suites conv-*, audit-2026-11-parcours-social-session, audit-2026-11-messagerie-pagination ; essai réel sur iPhone et Android (appui long, clavier, micro).
- **Centre de pilotage / Sentinelle** : Oui : compter les vocaux annulés vs envoyés et les envois en échec repris.
- **Métrique utile** : Part des envois en échec repris avec succès ; vocaux annulés par erreur (signalements).
- **Retour arrière** : La fusion des préférences (MSG-C01) touche l'état synchronisé : garder l'ancien chemin derrière une coupure le temps d'une version.

## LOT-5 — Les exemples ne se font plus passer pour de vraies personnes

- **Vague** : 2 · parcours principaux · **Risque** : normal
- **Résultat utilisateur attendu** : Tout contenu d'exemple est marqué comme tel partout, et aucune action réelle (suivre, écrire, inviter, s'inscrire) ne peut le viser.
- **Périmètre** : Personnages d'exemple dans « Nouveau message », « Nouveau groupe », la recherche et les créateurs à suivre (MSG-C03, MSG-C04, REC-C02) ; bouton d'inscription des exemples (IRL-C01) ; bobines d'exemple non marquées (BOB-C22) ; conversations d'exemple mêlées aux vraies (PCS-006).
- **Constats couverts** : MSG-C03, MSG-C04, REC-C02, IRL-C01, BOB-C22
- **Critères d'acceptation** :
  - Aucune ligne `follows`, `conv_members` ou `event_attendees` ne peut viser un identifiant `u_*` d'exemple (garde au point d'écriture).
  - Chaque carte, ligne ou bobine d'exemple porte la même marque « Exemple » ; leurs boutons d'action sont visiblement inactifs.
- **Fichiers ou systèmes probablement concernés** : `js/app-01-diag-seed.js`, `js/app-04-comments-shop.js`, `js/app-05-config-profil.js`, `js/app-07-ia-explore-irl.js`, `js/ui-v4a2-cartes.js`, `js/ui-v5-bobines.js`
- **Vérifications nécessaires** : Suites fil-reel-dabord, first-run ; balayage du banc en mode compte neuf.
- **Centre de pilotage / Sentinelle** : Oui : un `tel.error` si une écriture vise un identifiant d'exemple (ne devrait jamais arriver).
- **Métrique utile** : Zéro écriture vers un identifiant d'exemple.
- **Retour arrière** : Revert de PR ; les exemples eux-mêmes ne changent pas.

## LOT-6 — Confiance : suivre, bloquer, signaler, confirmer

- **Vague** : 2 · parcours principaux · **Risque** : critique
- **Résultat utilisateur attendu** : Le suivi affiché est exact, un compte bloqué disparaît vraiment, tout peut être signalé, et chaque geste destructeur demande une confirmation de l'application.
- **Périmètre** : « Suivre » affiché à tort et désabonnement involontaire (REC-C01) ; comptes bloqués proposés (REC-C03) ; signalement des bobines (BOB-C04) ; signaler sous le pied collant (TRA-C17) ; quatre portes de blocage (TRA-C10) ; 8 `confirm()` et 4 `prompt()` remplacés par des feuilles de l'application (TRA-C11) ; demande en attente comptée comme abonné (PRO-C05) ; pseudo non validé à l'édition (PRO-C03).
- **Constats couverts** : REC-C01, REC-C03, BOB-C04, TRA-C17, TRA-C10, TRA-C11, PRO-C05, PRO-C03
- **Critères d'acceptation** :
  - L'état de suivi est le même sur les CINQ surfaces qui le peignent, dès l'ouverture de l'écran.
  - Un compte bloqué n'apparaît dans aucune suggestion ni résultat.
  - Aucun `confirm()` / `prompt()` natif restant (recherche dans js/) ; chaque destruction se confirme dans une feuille de l'application, avec 5 s pour annuler quand c'est possible.
- **Fichiers ou systèmes probablement concernés** : `js/app-04-comments-shop.js`, `js/app-07-ia-explore-irl.js`, `js/app-08-ui-modals-tour.js`, `js/app-09-boot-pwa.js`, `js/app-05-config-profil.js`, `js/app-06-reels-partage.js`
- **Vérifications nécessaires** : Suites blocage-acces, confidentialite, authz-critical ; revue indépendante (droits, modération).
- **Centre de pilotage / Sentinelle** : Oui : signalements par type de cible ; blocages ; désabonnements dans les 10 s suivant un abonnement (signe d'erreur).
- **Métrique utile** : Signalements de bobines (aujourd'hui impossibles) ; désabonnements involontaires.
- **Retour arrière** : Garde-fous serveur inchangés (RLS, `trg_follows_statut`) ; seules les portes changent ; revert de PR.

## LOT-7 — Des réglages qui font ce qu'ils disent

- **Vague** : 2 · parcours principaux · **Risque** : normal
- **Résultat utilisateur attendu** : Chaque interrupteur visible a un effet réel, ou disparaît.
- **Périmètre** : Cinq interrupteurs de notifications sur six sans effet (TRA-C04) ; « Bien-être digital » inopérant (TRA-C05) ; « Couper les notifications » d'une conversation (MSG-C02) ; rappel d'activité mal daté (TRA-C15).
- **Constats couverts** : TRA-C04, TRA-C05, MSG-C02, TRA-C15
- **Critères d'acceptation** :
  - Pour chaque interrupteur restant, un test montre l'effet (notification non émise, son coupé, limite appliquée).
  - Un rappel d'une activité du lendemain dit « demain ».
- **Fichiers ou systèmes probablement concernés** : `js/app-02-state-utils.js`, `js/app-08-ui-modals-tour.js`, `js/app-04-comments-shop.js`
- **Vérifications nécessaires** : Tests unitaires des préférences, e2e notifications ; vérification d'une push réelle sur appareil.
- **Centre de pilotage / Sentinelle** : Oui : la veille des rappels (`_shared/rappels.js`) doit lire les mêmes préférences.
- **Métrique utile** : Désactivations de notifications ; plaintes de notifications non désirées.
- **Retour arrière** : Retirer un interrupteur inopérant ne casse rien ; le rebrancher se fait derrière une coupure.

## LOT-8 — Un seul vocabulaire, une seule famille d'icônes, des cibles de 44 px

- **Vague** : 3 · harmonisation · **Risque** : normal
- **Résultat utilisateur attendu** : Les mêmes mots, icônes et gestes pour les mêmes actions dans toute l'application ; l'accessibilité au clavier et au toucher tenue partout.
- **Périmètre** : Lexique unique (publication, activité, envie, fil — constats de vocabulaire de chaque domaine, synthèse transverse) ; icônes SVG pour les fonctions (FIL-C02) ; boutons de fermeture uniques (doubles « × ») ; cibles ≥ 44 px (SOC-C01) ; panneaux fermés inertes (SOC-C02) ; tutoiement partout.
- **Constats couverts** : SOC-C01, SOC-C02, FIL-C02
- **Critères d'acceptation** :
  - Lexique publié dans le dépôt ; une recherche des termes bannis dans index.html et js/ ne rend que des commentaires.
  - Mesure automatique du banc : 0 cible < 44 px et 0 commande tabulable invisible sur les six écrans principaux.
- **Fichiers ou systèmes probablement concernés** : `index.html`, `styles.css`, `js/`
- **Vérifications nécessaires** : Banc de mesure (`outils/scenarios/socle.js` + `synthese-mesures.js`) rejoué avant/après ; suites qui cherchent des libellés exacts mises à jour.
- **Centre de pilotage / Sentinelle** : Non nécessaire.
- **Métrique utile** : Compteurs de 05-MESURES.md.
- **Retour arrière** : Changements de libellés et de CSS ; revert de PR.

## LOT-9 — Évolutions à arbitrer après mesure

- **Vague** : 4 · évolutions · **Risque** : normal
- **Résultat utilisateur attendu** : Des améliorations plus lourdes, décidées sur données plutôt que sur intuition.
- **Périmètre** : Mise en page tablette / ordinateur (SOC-C03) ; rappel du contexte à l'ouverture d'une conversation (PCS-C05, hypothèse) ; réponse à une story (BOB-C09) ; distances sans position réelle (IRL-C02, avec demande de position contextuelle) ; filtres actifs visibles hors de la vue Filtre (IRL-C07).
- **Constats couverts** : SOC-C03, PCS-C05, BOB-C09, IRL-C02, IRL-C07
- **Critères d'acceptation** :
  - Chaque évolution part d'une mesure (part de trafic hors mobile, test utilisateur) consignée dans la PR.
- **Fichiers ou systèmes probablement concernés** : `styles.css`, `js/ui-v2-shell.js`, `js/app-07-ia-explore-irl.js`, `js/ui-v4a5-filtres.js`
- **Vérifications nécessaires** : Tests utilisateurs ciblés ; suites de cadrage.
- **Centre de pilotage / Sentinelle** : Oui : instrumenter avant de construire.
- **Métrique utile** : Selon l'évolution.
- **Retour arrière** : Sous drapeau, selon la règle des lots d'interface (un drapeau ne sait qu'enlever).
