# Profils et passions — rapport d'audit (PRO-…)

Registre et constats : `donnees/domaines/profils.json` (généré par `outils/sondes/profils-construire-json.js`).
Scénarios : `outils/scenarios/profils.js` · données fictives : `outils/jeu/profils.js` · sondes : `outils/sondes/profils-01…08`.

## 1. Périmètre et méthode

- **Lu** : `renderMainProfile`, `renderProfileContent`, listes de personnes, recadreur, menus, `openEditMainProfile` / `saveMainProfile`, « Mes passions » (archivage, aide, cartes) dans `js/app-06-reels-partage.js` ; `openUserProfile`, suivi, blocage, signalement dans `js/app-04-comments-shop.js` ; `supaSavePublicProfile`, demandes d'abonnement dans `js/app-08-ui-modals-tour.js` ; `nomCompteValide`, `etatSuivi`, porte de création de passion dans `js/app-02-state-utils.js` ; `js/passion-selector.js`.
- **Ouvert** uniquement par le banc, mode `compte` (faux serveur) : 8 sondes d'exploration (vrais gestes : appuis, `filechooser` réel avec les médias fictifs, Échap) puis `capturer.js`.
- **Gabarits** : m390 partout, m360 pour la modale d'édition et le compte neuf. Émulations Chromium, aucun appareil réel.
- **Limites** : la mission a été interrompue par une limite d'usage. Les scénarios `recadreur`, `profil-visite` (avec t768/d1440), `visite-etats`, `blocage`, `mes-passions` (avec t768/d1440), `mes-passions-gestes`, `derniere-passion`, `ajouter-passion`, `passion-perso-suspendue`, `plafond-arme` sont **écrits mais non exécutés** : leurs surfaces ont été observées par les sondes (preuve citée dans le registre) et sont marquées « aucun » visuel. Les gabarits t768 et d1440 n'ont été capturés pour aucun écran.
- Artefact du banc : mes publications vivent dans `state.userPosts` (synchronisé par `user_state`, non rejoué) ; l'état local est donc posé par `jeu.etat` et ses médias rendus absolus après le boot.

## 2. Cartographie

| Surface | Porte d'entrée | Fichier |
|---|---|---|
| Mon profil (en-tête, compteurs, rail, Publications/Activité, filtres de type) | barre basse → Profil | app-06:1034, 1385, 2436 |
| Menu du crayon (6 entrées) | `#v6bModifier` | app-06:1856 |
| Listes Abonnés / Abonnements | compteurs | app-06:1184-1232 |
| Modifier le profil (couverture, pseudo, bio, compte privé, 8 réseaux) | menu → Modifier | app-06:1916-2114 |
| Recadreur (avatar rond, couverture 3:2, photos de passion) | menu / modale / cartes | app-06:1551-1780 |
| Profil visité (+ menu ⋯ Partager/Signaler/Bloquer, sections, filtres) | auteur, listes, liens | app-04:4287-4900 |
| Suivi à trois états, compte privé, blocage, signalement | profil visité | app-04:4992-5244, app-02:2284 |
| Demandes d'abonnement (Accepter/Refuser) | cloche | app-08:2299, 8650 |
| Mes passions (cartes, ⋯, modifier, archiver, archives, aide, ajouter) | compteur « Passions » ou menu | app-06:2613-3700, 4587 |
| Sélecteur d'ajout (référentiel, demande d'ajout) | « Ajouter une passion » | passion-selector.js |
| Création de passion perso (suspendue), fenêtre de limite (plafond armé seulement) | code | app-02:6855, app-06:4365 |

## 3. Parcours et états difficiles exercés

| État | Résultat observé |
|---|---|
| Compte rempli, 3 passions, 7 publications de tous types | rendu correct ; pastilles de compte du rail rognées (PRO-C21) |
| « Tout » coché puis « Photos » | union : rien n'est filtré (PRO-C04) |
| Bulle Cuisine + Vidéos | « Touche « Toutes » » : bouton inexistant (PRO-C11) |
| Compte neuf | initiales, état vide guidé, aide « second profil » une fois |
| Compte privé + demande en attente | comptée et listée comme abonnée (PRO-C05) ; acceptation dans la cloche OK |
| Pseudo vide / « Admin » / déjà pris | vide et réservé acceptés (PRO-C03) ; déjà pris refusé par toast |
| PATCH profiles refusé (simulé) | « Profil mis à jour », compte resté public en base (PRO-C01) |
| Couverture depuis la modale | recadreur sous la modale (PRO-C02), réapparaît à la fermeture |
| Fichier non image | rien, aucun message (PRO-C18) |
| Profil public suivi, non suivi, privé en attente, nom très long, sans publication | tous rendus ; compteurs gonflés par les demandes ; vocabulaire divergent (PRO-C08) |
| Compte bloqué par moi / qui m'a bloquée | aucun signal (PRO-C07) / Suivre proposé (PRO-C20, hypothèse) |
| Bloquer depuis ⋯ | immédiat, sans confirmation (PRO-C06) |
| Fermer un profil ouvert depuis « Abonnés » | retour au profil, liste perdue (PRO-C10) |
| Archiver une passion, archives, recherche, aucun résultat | conformes ; textes « Toutes » et aide obsolète (PRO-C11, C12) |

## 4. À conserver

Voir `aConserver` du JSON : gabarit commun des deux profils, état vide guidé, bouton Suivre à trois états avec nom accessible explicite, bloc « Demande envoyée », archivage sans perte, demandes dans la cloche, recherche tolérante avec « Demander l'ajout », recadreur.

## 5. Constats (23 : P1 2 · P2 6 · P3 15)

- **PRO-C01 (P1, sensible)** — enregistrement refusé annoncé « Profil mis à jour », compte privé compris (`saveMainProfile` ignore le `false` de `supaSavePublicProfile`). Maquette PRO-015.
- **PRO-C02 (P1)** — recadreur de couverture ouvert sous la modale d'édition (z-index 6000 < 10001).
- **PRO-C03 (P2, sensible)** — pseudo non validé à l'édition (`nomCompteValide` non appelé). Maquette PRO-013.
- **PRO-C04 (P2)** — « Tout » reste coché, « Photos » ne filtre rien. Maquette PRO-003.
- **PRO-C05 (P2, sensible)** — demandes en attente comptées/listées comme abonnés (aucun filtre `status`). Maquettes PRO-009, PRO-049.
- **PRO-C06 (P2, sensible)** — Bloquer sans confirmation, désabonnement silencieux.
- **PRO-C07 (P2, sensible)** — profil d'un compte bloqué : rien ne le dit.
- **PRO-C15 (P2)** — modale d'édition de 1 096 px, 8 champs de réseaux, marques mal écrites. Maquette PRO-012.
- P3 : C08 vocabulaire des deux profils · C09 listes de personnes (emoji, double ×) · C10 retour à la liste · C11 « Toutes » · C12 aide obsolète · C13 en-tête « Mes passions » · C14 « profil principal » / « Bio de ce profil » · C16 crayon → menu · C17 boutons du profil visité · C18 photos en échec silencieux · C19 idées déjà possédées · C20 profil de qui m'a bloquée (hypothèse) · C21 pastille rognée · C22 signalement plein écran · C23 petites cibles (compteurs : SOC-C01 déjà établi).

Déjà établis, cités sans refaire : PCS-C04 (compteur Abonnés figé après Suivre), SOC-C01 (compteurs 40 px), toasts peints sous les modales (PAR-C03, IRL-C65, MSG-C85) — concerne le refus « pseudo déjà pris » (PRO-014).

### Sensible

PRO-C01 (confidentialité annoncée mais non écrite), PRO-C05 (demandes comptées comme abonnés), PRO-C03, C06, C07, C20 : décrits sobrement ; propositions qui conservent les garde-fous (`privacyChoisi`, verrous d'écriture, verdict serveur).

## 6. Cohérence avec le reste de l'application

« posts » / « Créer un post » contre « publications » ; « Tout » / « Posts », « Audio » / « Audio / podcast » ; trios de compteurs différents ; crayon qui ouvre un menu alors que ⋯ partout ailleurs ; « profil » pour une passion ; deux « × » superposés dans les modales de liste et le profil visité ; libellés de champs de deux styles dans une même modale.

## 7. Non vérifié

Captures de livrable des scénarios listés au § 1 (à lancer : `capturer.js profils --scenario <nom>`) ; t768 et d1440 ; échec d'envoi Storage (la panne REST du banc ne l'atteint pas) ; fenêtre de limite (plafond armé) ; dernière passion ; onglet Activité du profil visité ; mode visiteur ; vrai appareil (pincement du recadreur).

## 8. Compteurs

49 surfaces inventoriées · 41 observées · 2 simulées · 6 code seul · 0 inaccessible · 11 avec avant-après · 9 avant seul · 29 sans visuel · 13 à conserver · 4 à vérifier · constats P0 0 / P1 2 / P2 6 / P3 15.
