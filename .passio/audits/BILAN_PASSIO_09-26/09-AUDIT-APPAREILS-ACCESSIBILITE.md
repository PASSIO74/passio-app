# Audit appareils et accessibilité — BILAN PASSIO 09/26

> SHA audité : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf` (main, 2026-09-04). Modèle : Claude Fable 5.1 (auditeurs de domaine et relecteurs adversariaux). Statuts : PROUVÉ · CONFORME PAR INSPECTION · PROBABLE · DÉFAILLANT · BLOQUÉ · NON APPLICABLE. Priorités : P0 bloque la commercialisation · P1 avant lancement public · P2 amélioration importante · P3 optimisation future. Chaque problème a été soumis à une relecture adversariale indépendante (angles reproduction / impact / contexte) ; la priorité retenue est celle de la relecture quand elle diffère.


## Domaine « appareils-a11y »

> ⚠️ **Domaine reconstitué par l'orchestrateur.** Les trois sous-agents Fable 5.1 affectés à ce domaine ont été interrompus par l'épuisement des crédits de session avant de rendre leur sortie structurée. L'orchestrateur (Fable 5.1 également) a reconstitué contrôles et problèmes à partir des preuves qu'ils avaient déposées (scripts, captures, journaux, requêtes) et de vérifications ciblées dans le code du SHA audité. **Aucune relecture adversariale n'a pu être faite sur ces problèmes** : ils sont marqués « NON VÉRIFIÉ (pas de relecture) » et sont prioritaires pour la contre-revue GPT-6 Astra.

Domaine appareils / navigateurs / tailles / orientations / permissions / PWA / accessibilité reconstitué par l'orchestrateur à partir de la matrice déposée par trois sous-agents Fable 5.1 interrompus : 9 fenêtres (320×568, 360×740, 390×844, 412×915, 430×932, 768×1024, 1024×768, 1280×800, 1440×900) et 844×390 paysage × 8 écrans, 88 captures, mesures automatiques (débordements, cibles tactiles, contrastes, noms accessibles, focus), refus de permissions, PWA hors ligne, 43 tests e2e de cadrage verts (deux fois). TOUT EST ÉMULÉ dans Chromium : aucun appareil réel, aucun Safari/WebKit, Firefox, Edge ni Samsung Internet (non installables ici). Aucun débordement horizontal du document à aucune taille ; l'app reste utilisable sans aucune permission ; le mode hors-ligne PWA fonctionne au second lancement. Défauts : cibles tactiles sous 44 px sur toutes les barres (cloche 34 px, menu 34 px, pièce jointe 36 px) et actions de commentaire de 12 px, ~95 gabarits `<div onclick>` sans `tabindex` (clavier), quelques contrastes sous 4,5:1, icônes sans nom. Aucune relecture adversariale.

### Contrôles (15)

| Id | Contrôle | Statut | Méthode | Preuve |
|---|---|---|---|---|
| DEV-C01 | Largeurs 320 / 360 / 390 / 412 / 430 : aucun débordement horizontal, barre et bouton principal visibles | **PROUVÉ** | émulation | preuves/appareils-a11y/matrice.json et matrice-synthese.md : `doc=false` pour les 8 écrans × 5 largeurs ; les éléments « hors écran » sont le panneau `#conv-fullpage` translaté (attendu) et une bulle de story coupée par le rail défilant (attendu). Captures 320x568-*.jpg … 430x932-*.jpg |
| DEV-C02 | Tablettes (768×1024, 1024×768) et ordinateurs (1280×800, 1440×900) | **PROBABLE** | émulation | captures 768x1024-*, 1024x768-*, 1280x800-*, 1440x900-* ; colonne centrée 440 px (`.app-shell`), aucun débordement ; mise en page « téléphone au centre » sur grand écran (choix produit non documenté) |
| DEV-C03 | Paysage mobile (844×390) | **PROBABLE** | émulation | captures 844x390-feed/irl/messages/studio.jpg : aucun débordement ; hauteur utile réduite (barre + en-tête), non jugé sur appareil réel |
| DEV-C04 | Encoches / safe-area, clavier virtuel, souris + clavier physique | **BLOQUÉ** | non réalisé | Non émulable fidèlement : `env(safe-area-inset-bottom)` présent dans le CSS (pied de la vue Filtre, `.app-nav`) ; clavier virtuel non simulé |
| DEV-C05 | Zoom 200 % et texte agrandi 200 % | **BLOQUÉ** | émulation | captures 390x844-texte200-feed/irl.jpg produites (non analysées avant l'interruption) ; captures zoom200 vides (2,8 Ko) → mesure échouée |
| DEV-C06 | Navigateurs : Safari/WebKit, Firefox, Edge, Samsung Internet, PWA installée iOS/Android | **BLOQUÉ** | non réalisé | Seul Chromium 1223 (Playwright) est disponible ; aucune installation possible |
| DEV-C07 | Permissions refusées : caméra, micro, géolocalisation, notifications, partage | **PROUVÉ** | émulation | permissions-offline.json : micro → toast ; caméra → éditeur en mode sans caméra ; géoloc → repli sans message (ROB-05) ; notifications denied → rien ; partage → toast avec lien ; appUtilisable=true, 0 erreur JS |
| DEV-C08 | PWA : manifest, icônes, service worker, hors ligne | **PROUVÉ** | émulation | permissions-offline.json : manifest 200 (standalone, portrait, icônes 192/512 any+maskable), SW actif avec cache `passio-v…` (index, CSS, icônes, manifest) ; second lancement sans réseau : fil actif, 23 cartes, bannière hors-ligne ; premier lancement sans réseau impossible (attendu) |
| DEV-C09 | Cibles tactiles ≥ 44 px (WCAG 2.5.5) / ≥ 24 px (2.5.8) | **DÉFAILLANT** | émulation | matrice-synthese.md « Cibles < 44 px » : `.topbar-bell` 34×34 (×79), `.hamburger` 34×34 (×79), `#btnAttach`/`#btnEmoji` 36×36, `.conv-fp-back` 36×36, bouton « OK » 43,5×26, `.comment-action` 12×12 et 15×12 (sous 24 px), `.post-action` 31×26 |
| DEV-C10 | Contraste ≥ 4,5:1 (texte normal) | **DÉFAILLANT** | émulation | « Échecs de contraste » : `#nouveauProfilSous` 4,4:1 à 12 px, `#nouveauProfilTitre` 4,4:1, `.passio-hint-ok` « Compris » 4,11:1 ; avatars emoji blanc sur #8b5cf6 4,23:1 (emoji, non texte) et sur #a78bfa 2,72:1 |
| DEV-C11 | Nom accessible des commandes iconiques | **DÉFAILLANT** | émulation | « Commandes sans nom accessible » : `.passion-photo-badge` 📷 (×28), avatars cliquables (×17) sans aria-label/title |
| DEV-C12 | Accessibilité clavier : éléments cliquables atteignables | **DÉFAILLANT** | inspection code | Transcript wf_eb42321e : ~95 gabarits `<div onclick>` sans `tabindex` (cartes du fil, événements, conversations) ; app-08 active `[role=button]` non natifs (CLAUDE.md fiche 18) mais pas les `div` sans rôle |
| DEV-C13 | Focus à l'ouverture/fermeture des modales (2.4.3), animations réduites (prefers-reduced-motion) | **BLOQUÉ** | non réalisé | Lecture d'`openModal`/`closeModal` commencée par le sous-agent, conclusion non déposée |
| DEV-C14 | Lecteur d'écran (VoiceOver, TalkBack) | **BLOQUÉ** | non réalisé | Aucun appareil réel |
| DEV-C15 | Suites e2e de cadrage/appareils (6 suites) | **PROUVÉ** | test exécuté | suites-6.log et suites-executees.txt : 43 verts (7,3 et 7,8 min) |

### Problèmes (5)

| Id | Priorité retenue | Relecture | Titre |
|---|---|---|---|
| DEV-01 | **P2** | NON VÉRIFIÉ (pas de relecture) | Cibles tactiles sous 44 px sur toutes les barres (cloche, menu, pièce jointe, retour) et actions de commentaire de 12 px |
| DEV-02 | **P2** | NON VÉRIFIÉ (pas de relecture) | Environ 95 gabarits `<div onclick>` sans `tabindex` ni rôle : cartes du fil, événements et conversations inaccessibles au clavier |
| DEV-03 | **P3** | NON VÉRIFIÉ (pas de relecture) | Contrastes sous 4,5:1 sur la porte « Ajouter une passion » (4,4:1 à 12 px) et le bouton « Compris » des aides (4,11:1) |
| DEV-04 | **P3** | NON VÉRIFIÉ (pas de relecture) | Commandes iconiques sans nom accessible (pastille photo 📷 ×28, avatars cliquables ×17) |
| DEV-05 | **P3** | NON VÉRIFIÉ (pas de relecture) | Détection du mode PWA installé : `PassioPlatform` absent dans le parcours hors-ligne |

### DEV-01 — Cibles tactiles sous 44 px sur toutes les barres (cloche, menu, pièce jointe, retour) et actions de commentaire de 12 px

| Champ | Valeur |
|---|---|
| Identifiant | DEV-01 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Barre du haut, composer de messagerie, commentaires |
| Résultat attendu | Cibles ≥ 44×44 px (Apple/Android) ou au minimum ≥ 24 px (WCAG 2.5.8) avec espacement. |
| Résultat observé | `.topbar-bell` et `.hamburger` 34×34 sur les 79 combinaisons écran×taille ; `#btnAttach`/`#btnEmoji`/`#btnVoice`/`.conv-fp-back` 36×36 ; `.comment-action` 12,4×12 et 14,9×12 ; `.post-action` 😊 31×26,5 ; bouton « OK » de recherche 43,5×26. |
| Reproduction | preuves/appareils-a11y/matrice.js (mesure getBoundingClientRect de tous les éléments cliquables visibles). |
| Preuve | preuves/appareils-a11y/matrice-synthese.md § Cibles < 44 px ; matrice.json |
| Impact utilisateur et commercial | Erreurs de tap, exclusion des utilisateurs à motricité réduite ; critère de recette des stores. |
| Visibilité dans le Centre de pilotage | Sans objet. |
| Détection par la Sentinelle | Sans objet. |
| Proposition de correction | Padding/min-size 44 px sur les boutons de barre et du composer ; zone de tap élargie sur `.comment-action` (padding, pas seulement l'icône). |
| Risque de régression | Faible (CSS) ; vérifier les tests de cadrage à 320 px. |
| Effort estimé | 0,5 jour. |

### DEV-02 — Environ 95 gabarits `<div onclick>` sans `tabindex` ni rôle : cartes du fil, événements et conversations inaccessibles au clavier

| Champ | Valeur |
|---|---|
| Identifiant | DEV-02 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | PLAUSIBLE |
| Fonctionnalité | Fil, IRL, Messages (navigation clavier) |
| Résultat attendu | Tout élément cliquable est focusable et activable au clavier (`button`, ou `role=button` + `tabindex=0`, activé par app-08). |
| Résultat observé | Comptage par le sous-agent : ~95 gabarits `<div onclick=…>` sans tabindex dans les template literals ; le mécanisme d'activation d'app-08 ne couvre que `[role=button]`. |
| Reproduction | `grep -c '<div[^>]*onclick' js/app-0*.js` puis filtrer ceux sans tabindex ; parcourir le fil à la touche Tab. |
| Preuve | Transcript wf_eb42321e (agent a1b00aaf) ; js/app-08 (activation `[role=button]`) |
| Impact utilisateur et commercial | Non-conformité RGAA/WCAG 2.1.1 ; utilisateurs clavier et lecteurs d'écran exclus des contenus principaux. |
| Visibilité dans le Centre de pilotage | Sans objet. |
| Détection par la Sentinelle | Sans objet. |
| Proposition de correction | Ajouter `role="button" tabindex="0"` aux gabarits (l'activation existe déjà), ou convertir en `<button>` ; audit `npm run audit:handlers` étendu. |
| Risque de régression | Faible ; attention au double écouteur (fiche 18 : aucun `onkeydown` supplémentaire). |
| Effort estimé | 1 jour. |

### DEV-03 — Contrastes sous 4,5:1 sur la porte « Ajouter une passion » (4,4:1 à 12 px) et le bouton « Compris » des aides (4,11:1)

| Champ | Valeur |
|---|---|
| Identifiant | DEV-03 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Page Mes passions, aides contextuelles |
| Résultat attendu | ≥ 4,5:1 pour le texte normal. |
| Résultat observé | `#nouveauProfilSous` rgb(110,105,135) sur rgb(239,233,253) = 4,4:1 ; `#nouveauProfilTitre` idem ; `.passio-hint-ok` blanc sur #8d5ff6 = 4,11:1. |
| Reproduction | matrice.js (calcul WCAG sur fond opaque). |
| Preuve | preuves/appareils-a11y/matrice-synthese.md § Échecs de contraste |
| Impact utilisateur et commercial | Faible ; lisibilité en plein soleil. |
| Visibilité dans le Centre de pilotage | Sans objet. |
| Détection par la Sentinelle | Sans objet. |
| Proposition de correction | Assombrir `--muted` sur lavis (ex. #5b5680) et le violet du bouton d'aide. |
| Risque de régression | Nul. |
| Effort estimé | 0,25 jour. |

### DEV-04 — Commandes iconiques sans nom accessible (pastille photo 📷 ×28, avatars cliquables ×17)

| Champ | Valeur |
|---|---|
| Identifiant | DEV-04 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Cartes de passion, avatars |
| Résultat attendu | aria-label ou title sur toute commande sans texte. |
| Résultat observé | `.passion-photo-badge` et `.avatar`/`.avatar.sm` cliquables sans nom. |
| Reproduction | matrice.js. |
| Preuve | preuves/appareils-a11y/matrice-synthese.md § Commandes sans nom accessible |
| Impact utilisateur et commercial | Faible. |
| Visibilité dans le Centre de pilotage | Sans objet. |
| Détection par la Sentinelle | Sans objet. |
| Proposition de correction | `aria-label="Changer la photo de la passion"`, `aria-label="Profil de <nom>"`. |
| Risque de régression | Nul. |
| Effort estimé | 0,25 jour. |

### DEV-05 — Détection du mode PWA installé : `PassioPlatform` absent dans le parcours hors-ligne

| Champ | Valeur |
|---|---|
| Identifiant | DEV-05 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | PLAUSIBLE |
| Fonctionnalité | PWA (js/platform.js) |
| Résultat attendu | `PassioPlatform` disponible pour distinguer navigateur / installée (télémétrie `platform`). |
| Résultat observé | permissions-offline.json standaloneDetection : « PassioPlatform absent », matchMedia standalone=false. |
| Reproduction | Second lancement hors ligne, `window.PassioPlatform`. |
| Preuve | preuves/appareils-a11y/permissions-offline.json |
| Impact utilisateur et commercial | Faible : télémétrie `platform` fausse en PWA hors ligne. |
| Visibilité dans le Centre de pilotage | Champ platform. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Vérifier le chargement de js/platform.js dans le cache du SW (absent de la liste des entrées : index, CSS, icônes, manifest — app.js n'y est pas non plus mais est servi par le réseau ou le cache dynamique). |
| Risque de régression | Nul. |
| Effort estimé | 0,25 jour. |

### Surfaces saines

- Aucun débordement horizontal du document sur 9 fenêtres × 8 écrans (émulation), y compris 320 px.
- Application utilisable sans aucune permission accordée, aucune erreur JS.
- PWA : manifest complet (maskable), service worker, mode hors-ligne fonctionnel au second lancement avec bannière.
- Champs de saisie ≥ 16 px (aucun zoom iOS involontaire), images avec alt (0 manquante sur les écrans mesurés).
- 43 tests de cadrage verts.

### Non vérifié (BLOQUÉ) et ce qu'il faudrait

- Appareils réels iPhone/iPad/Android/tablette/Windows/macOS : NON RÉALISÉ.
- Navigateurs Safari/WebKit, Firefox, Edge, Samsung Internet, PWA installée : NON RÉALISÉ (Chromium seul).
- Encoches, clavier virtuel, orientation réelle, souris/clavier physique, zoom 200 %, texte agrandi : NON RÉALISÉS ou non analysés.
- Lecteur d'écran, focus des modales, prefers-reduced-motion : NON RÉALISÉS.
- La barre de navigation n'a pas pu être mesurée par le script (nœud remplacé par un lot UI) : « nav visible NON » dans matrice.txt est un défaut de MESURE, pas de l'app (captures : barre visible).
- Relecture adversariale des 5 problèmes : NON FAITE.

### Affirmations des anciens rapports confrontées au code actuel

- docs/lots-ui/20-PAGE-RECHERCHER-REFERENTIEL (grille 3 colonnes, `minmax(0,1fr)`) : aucun débordement mesuré à 320 px, corrigé comme annoncé.

### Fichiers de preuve

- `preuves/appareils-a11y/matrice.js`
- `preuves/appareils-a11y/matrice.json`
- `preuves/appareils-a11y/matrice-synthese.md`
- `preuves/appareils-a11y/matrice.txt`
- `preuves/appareils-a11y/permissions-offline.js`
- `preuves/appareils-a11y/permissions-offline.json`
- `preuves/appareils-a11y/geo-refus.json`
- `preuves/appareils-a11y/suites-6.log`
- `preuves/appareils-a11y/*.jpg (88 captures)`

### Notes de l'auditeur

Reconstitué par l'orchestrateur le 2026-09-04 (sous-agents wf_88162f42, wf_7b217654, wf_eb42321e interrompus). Méthode partout : ÉMULATION Chromium — à ne jamais lire comme un test sur appareil réel.
