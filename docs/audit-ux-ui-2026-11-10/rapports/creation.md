# Création et médias — rapport de domaine

Clé `creation` · surfaces `CRE-001…041` · constats `CRE-C01…C18` · code audité : `main@4e1d8ed1`.

## 1. Périmètre et méthode

- **Lu** : `index.html` (#screen-studio l.869-962, #mediaEditor l.190-236), `js/ui-v6-composer.js`,
  `js/ui-v2-shell.js` (feuille Créer), `js/app-06-reels-partage.js` (renderStudio, gestionnaires de
  fichiers, publishPost, brouillons), `js/app-08-ui-modals-tour.js` (stories, éditeur média, file de
  renvoi), `js/ui-v7-lot.js` (finition de bobine), `js/passions-flat-ui.js`, `js/first-run.js`
  (porte visiteur), `styles.css` (UI-6), fiche lots-ui 07.
- **Ouvert dans le banc** : modes `compte` (faux serveur) et `visiteur`. Sondes gardées :
  `outils/sondes/creation-01…06*.js`. Scénarios : `outils/scenarios/creation.js` (11 scénarios,
  31 identifiants capturés, 39 fiches). Données : `outils/jeu/creation.js` (une activité passée ;
  **la table `passions` du faux serveur est semée avec les 5 001 identifiants du référentiel**, comme
  en production — sans cela, le sélecteur refusait toute passion fine : artefact du banc).
- **Gabarits** (émulations Chromium) : m390 partout ; m360 pour feuille Créer, Studio, saisie,
  feuille de bobine ; t768 et d1440 pour feuille Créer et Studio.
- **Limites** : pas de caméra ni de micro (branches « refusé » seules) ; `prompt()` natif rempli par
  le banc, non photographiable ; GIF refusés ; le hors-ligne n'atteint pas le faux serveur
  (interception `page.route`) ; toasts figés par `.toast{animation:none}` pour être visibles.

## 2. Cartographie

| Porte | Mène à | Fichier |
|---|---|---|
| Barre basse « Créer » | feuille 6 entrées (CRE-001) | ui-v2-shell.js:124-368 |
| Publication | Studio UI-6 (texte + photo/vidéo + Publier dans + MOOD) | ui-v6-composer.js, app-06 |
| Bobine | éditeur média mode bobine → aperçu → feuille « Ta bobine » | app-08:814, ui-v7-lot.js |
| Activité | `openCreateEvent` (domaine irl-fiche) | — |
| Story | éditeur média mode story (média ou fond coloré, Aa/😀/GIF) | app-08:814-1700 |
| Live vidéo | `startVideoLive` (titre, caméra, WebRTC) | app-05:4218 |
| Audio / podcast | Studio + bloc enregistreur (clic rejoué sur l'onglet masqué) | ui-v2-shell.js:176 |
| Fiche d'activité passée → « Partager mon expérience » | Studio pré-rempli + rattachement | app-07:4558 |

`studioType` reste la seule source de vérité du type publié ; les onglets de format sont masqués
(styles.css:9338) mais existent.

## 3. Parcours et états exercés

| État | Résultat observé |
|---|---|
| Publier vide | « Écris quelque chose. » (CRE-012) |
| Texte → Publier | retour au Fil < 0,5 s, « Publication en cours… » + « Post publié », carte « Sync… » figée (CRE-013) |
| Double appui | un seul post (sonde 02) |
| Photo ajoutée puis ✕, texte → Publier | **refusé « Ajoute une photo. »** (CRE-007) |
| Photo publiée puis texte seul | **même refus** (sonde 02) |
| Créer → Audio puis → Publication | bloc audio resté, **« Enregistre un audio. »** (CRE-011) |
| Fichier non image | « Choisis une image. » (CRE-008) |
| Vidéo webm | transcodée MP4, « Vidéo chargée » (CRE-009) |
| Micro refusé | statut + toast clairs (CRE-010) |
| Refus serveur 403 (simulé) | « Post en local (connexion lente) » + « Publication en cours… » restant ; carte « Sync… » (CRE-014) |
| Changer d'onglet en cours de saisie | texte conservé |
| Recharger en cours de saisie | texte perdu (CRE-015) |
| Choisir « Escalade de bloc » au Studio | passion ajoutée au compte sans message (CRE-005) |
| « Partager mon expérience » puis abandon | publication suivante rattachée à l'activité (CRE-016) |
| Bobine : photo | « Une bobine est une vidéo — choisis une vidéo » |
| Bobine : vidéo → Continuer → Publier | « Bobine en cours de publication… » puis « Bobine publiée » (CRE-019→021) |
| Story : fond, Aa (prompt), 😀, GIF, Publier | « Story publiée » ; panneaux recouvrant les outils (CRE-023→028) |
| Visiteur : Publication → Publier | porte « Crée ton compte pour publier ta création », texte conservé (CRE-029) |
| Visiteur : Bobine / Story / Activité | porte d'inscription |
| Visiteur : Live | toast « Connecte-toi pour lancer un live » (CRE-030) |
| Visiteur : Audio → micro | **getUserMedia appelé** (CRE-031) |
| Hors ligne | non vérifiable dans le banc (CRE-036) |

## 4. À conserver

Voir `aConserver` du JSON : feuille Créer, ligne « Publier dans », refus précis, parcours de bobine,
transcodage MP4, porte visiteur, verdict serveur avant « Story publiée », verrou anti-double appui.

## 5. Constats (par priorité)

- **P1 — CRE-C01** Le Studio garde le format du dernier média : après une photo retirée ou publiée,
  ou un passage par Audio, un texte seul est refusé sans issue (CRE-007, CRE-011). Correctif : déduire
  le type du média réellement attaché au moment de publier.
- **P2 — CRE-C02** *(sensible)* choisir une passion pour une publication l'ajoute au compte et
  change la passion courante, sans message (CRE-005).
- **P2 — CRE-C03** *(sensible)* rattachement à l'activité invisible et persistant (CRE-016).
- **P2 — CRE-C04** feedback de publication contradictoire, refus attribué au réseau, carte figée
  « Sync… » en 10 px (CRE-013, CRE-014). Le défaut transverse « toasts peints sous les modales et
  feuilles (z-index 200) » est établi par PAR-C03, IRL-C65, MSG-C85 et n'est pas refait ici.
- **P2 — CRE-C05** aucun brouillon ; le code de brouillons est orphelin (CRE-015, CRE-032).
- **P2 — CRE-C07** zone d'envoi sombre en double, vestige de thème sombre (CRE-006/007/009).
- **P2 — CRE-C08** cibles < 44 px et commandes sans nom (28, 34, 40, 22, 24, 29 px).
- **P2 — CRE-C09** texte de story par `prompt()` natif (CRE-025).
- **P2 — CRE-C14** *(sensible)* visiteur : micro demandé avant compte ; Live sans porte commune.
- **P3** — C06 « MOOD » / pastilles 40 px (rejoint SOC-C01) ; C10 story sans durée/public/passion
  *(sensible)* ; C11 panneaux emojis/GIF sur les outils ; C12 « Recommencer » invisible ; C13 bobine
  sans « Publier dans » ni envie ; C15 « post » / « publication » ; C16 pas de modification
  *(hypothèse, sensible)* ; C17 titre du sélecteur sous la croix ; C18 préparation vidéo sans annulation.

## 6. Cohérence avec le reste de l'application

- **Mots** : « MOOD » (Studio) vs « Envie du moment » (Fil) ; « post » (toasts, menu) vs
  « publication » ; « Passion » (bobine) vs « Publier dans : » (Studio) ; ordre des envies différent.
- **Composants** : deux sélecteurs de passion (recherche plate au Studio, `<select>` du compte pour
  la bobine) ; deux compositeurs de story (éditeur média et `openStoryComposer`, code mort).
- **Comportements** : Live est la seule entrée de « Créer » qui répond au visiteur par un toast ;
  l'Audio est la seule qui demande une permission avant compte.
- Toast « 🟢 Connexion rétablie — envoi des messages en attente » affiché deux fois au retour du
  réseau (sonde 06, hors domaine, signalé).
- À 1440 px la feuille Créer (≈ 540 px) déborde la colonne de l'application (≈ 440 px).

## 7. Non vérifié, et comment le vérifier

- Capture caméra (photo, vidéo maintenue, bascule) et enregistrement micro accordés — téléphone réel.
- Live vidéo connecté — deux comptes, appareil réel.
- Publication hors ligne puis reprise — appareil réel en mode avion (le code prévoit statut
  « offline » et rejeu).
- Compression réelle d'une vidéo > 2 Mo (seule la progression est simulée, CRE-022).
- Visibilité réelle des stories (RLS) avant d'écrire « par ta communauté » (CRE-C10).
- Emoji d'avatar de la carte optimiste (🎵) différent de celui rechargé (🎧) : dû à un état local
  du banc non aligné sur le faux serveur — à revérifier sur un vrai compte.

## 8. Compteurs

- Surfaces inventoriées : **41** — observées 30 (dont CRE-037 et CRE-041 sans capture) · simulées 3
  (CRE-003, 014, 022) · code seul 5 (CRE-032, 033, 038, 039, 040) · inaccessibles 3 (CRE-034, 035, 036).
- Visuels : avant-après **14** (CRE-001, 002, 005, 006, 007, 009, 010, 013, 016, 019, 020, 024, 025,
  026) · avant seul 17 · aucun 10. 39 fiches de capture (CRE-001 sur 4 gabarits, CRE-002 sur 4,
  CRE-003 et CRE-020 sur 2).
- Verdicts : à conserver 10 · à améliorer 24 · à vérifier 7.
- Constats : **18** — P1 : 1 · P2 : 8 · P3 : 9 (dont 5 sensibles).
