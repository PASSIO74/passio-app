# Rencontrer — rapport d'audit, corrections et avis (2026-11-27)

## 1. Ce qui a été éprouvé

- **Cartographie complète** : 11 lecteurs (client, serveur réel en lecture seule, tests, doc) → 343 points suspects.
- **Vérification contradictoire** : 343 points → 231 sujets ; 213 vérifiés sur le dernier code en ligne, la plupart reproduits.
  - 201 confirmés (25 majeurs, 164 mineurs, 12 cosmétiques) · 3 réfutés · 5 choix délibérés · 4 déjà corrigés · 14 simples manques de tests.
- **Simulation à 10 comptes réels sur le staging** (`npm run village:rencontrer`) : demande/validation, file d'attente, promotion, gestes croisés, attaques directes sur l'API, activité privée + lien, pointage, série, modification, annulation, suppression. **Dernier passage : 45 contrôles OK, 0 échec exigé.**
- **Revue visuel / ergonomie / accessibilité / textes** sur ~100 captures réelles (320, 390, 768, 1440 px) : 164 constats, dont 55 majeurs nouveaux.
- **Injection HTML/JS** (4 constats, tous reproduits) et **performance** (9 constats mesurés).

## 2. Déjà corrigé (PR #1125, 61 tests neufs rouges sur `main`)

- Double appui « Je participe / Retirer » : base et écran divergeaient → une réponse à la fois par activité.
- Activité annulée / supprimée / déplacée pendant qu'on la regarde : l'écran rejoint la base, motif juste.
- Lecture du démarrage qui effaçait une réponse neuve ; repli qui inscrivait en « je viens » sur un refus.
- Validation, promotion, annulation reçues en direct : fiche et liste suivent la base ; place perdue quand un promu se retirait.
- « Riom » placé à Rio, « Venice » à Nice ; ville retapée qui gardait l'ancien marqueur ; séries mensuelles qui sautaient février, hebdomadaires décalées d'une heure.
- Création / modification : message d'échec par cause, couverture plus effacée sur échec d'envoi, activités à ex-co-organisateurs de nouveau modifiables, diffusion aux inscrits qui disait son échec, gardes « organisateur » sur les 7 gestes, double envoi, saisies numériques illisibles, type/durée reclassés en silence, lieu choisi qui mélangeait deux adresses, double carte au fil pour une série.

## 3. Restent à corriger — par priorité

### Côté serveur (migration à préparer, contre-revue humaine)
1. **Place libérée sans promotion serveur** : seul le client sortant promeut ; un retrait par l'organisation ou une hausse de places laisse la file attendre, et un nouveau venu peut passer devant.
2. **Retrait d'un participant** sans notification ni filet (le validé retiré n'apprend rien).
3. **Note / avis** écrivables avant l'activité, sans participation (A6 du village).
4. **Pointage par écriture directe** pour une réponse « je ne peux pas » ou une demande non validée (C4 du village).
5. File d'attente ordonnée par la date de PREMIÈRE réponse, pas d'entrée en file.
6. Catalogue limité aux **60 dernières activités créées** sans filtre de date (des sorties à venir disparaissent) + index manquant.
7. Images (couverture, GIF) acceptées depuis n'importe quel hôte https : un compte peut relever l'IP des lecteurs.

### Côté application (prêts en dossiers, lots DIS / ECR / FIC)
- Un participant validé n'entre jamais seul dans la discussion ; conversations d'activité fantômes impossibles à quitter.
- Une modification remet `conv_id` à NULL et prévient tous les inscrits pour un détail (quota de 3 diffusions/h consommé).
- Filtre de distance silencieusement centré sur Paris ; géolocalisation sans seconde chance.
- Activité privée créée hors conversation : fenêtre de partage au lien public mort.
- Cloche : balises `<b>` affichées en clair.

## 4. Avis visuel et ergonomie — les 10 changements qui comptent le plus

1. **Dire la vérité sur l'état** : « ✓ Tu participes » / « Inscrit ✓ » s'affiche alors que ce n'est qu'une **demande en attente de validation**. Trois états distincts partout (carte, fiche, conversation, cloche) : *Demande envoyée* (ambre) · *Participation confirmée* (vert) · *En liste d'attente* (gris), avec le même mot à chaque endroit.
2. **Signaler à l'organisateur ce qu'il doit faire** : la demande à valider n'apparaît ni sur la carte, ni sur la fiche, ni dans « Gérer ». Pastille « 2 demandes à valider » sur la carte et bouton en tête de la fiche.
3. **Retour visible après « Je participe »** : la feuille des rappels recouvre la fiche et la confirmation part dans la cloche. Mettre l'état à jour dans le pied, puis proposer les rappels en bandeau, pas en feuille.
4. **Pendant l'activité, l'action du moment en premier** : « Je suis arrivé·e » (pointage) en pied de fiche de H-1 à la fin, au lieu d'être enfoui au milieu.
5. **Activité annulée ou terminée** : retirer les places restantes et les actions, bandeau d'état clair, pied qui propose quelque chose d'utile (voir d'autres activités).
6. **Formulaire de création** : erreurs sous le champ fautif, avec focus, pas un toast fugace ; « Plus d'options » mieux signalé (cible de 33 px aujourd'hui).
7. **« Gérer l'activité »** : 8 boutons identiques → hiérarchie (Modifier · Inviter · Participants en premier), zone « danger » séparée pour Annuler / Supprimer ; « Retirer » un participant avec 5 s pour annuler, comme pour inviter.
8. **Activité privée lisible** : cadenas sur la carte de liste (absent aujourd'hui) ; badge de la fiche illisible sur le fond violet foncé → fond clair ou contour.
9. **Contrastes et cibles** : bouton principal en dégradé à 2,84:1 (texte blanc sur le départ clair) → assombrir le départ ; pastilles « Dans 2 jours » à 1,68:1 ; × des feuilles à 34 px, boutons de validation à 29 px → 44 px.
10. **Petits écrans et ordinateur** : à 320 px, en-tête + pied laissent 17 % de l'écran au contenu (réduire le héros quand on défile) ; sur ordinateur, le pied est décalé de 125 px de la colonne de la fiche. La fiche plein écran doit être un vrai dialogue (focus, Échap, lecteur d'écran).

## 5. Optimisation (performance)

- Chaque rendu de la liste relance 3 lectures réseau sans cache ; « Afficher plus » relit tout → mémoriser par activité, ne relire que l'ajout.
- La carte MapLibre est construite et animée **même en vue Liste** : la moitié du CPU à l'arrivée sur l'écran → ne l'initialiser qu'à l'ouverture de « Carte ».
- Chargement des activités : 5 allers-retours en série là où 2 suffisent ; descriptions entières pour 60 lignes → colonnes utiles seulement.
- Une inscription coûte 21 requêtes et reconstruit la fiche deux fois.
- Cache local des commentaires jamais purgé ; couverture en `data:` gardée dans l'état persisté.

## 6. Tests à ajouter (plan complet : 28 scénarios)

Les plus utiles : validation de bout en bout à 3 comptes réels · refus puis réinscription · banc SQL composé validation × capacité × promotion · inscrit non validé sans adresse / discussion / pointage · promotion puis validation · édition après inscriptions.
