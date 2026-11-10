# Bobines, stories et live — rapport du domaine

> Clé `bobines` · surfaces BOB-001… · constats BOB-C01… · version auditée `main@4e1d8ed1`.
> Registre et constats : `donnees/domaines/bobines.json`. Scénarios : `outils/scenarios/bobines.js`.
> Données fictives : `outils/jeu/bobines.js`. Sondes : `outils/sondes/bobines-01…05`.

## 1. Périmètre et méthode

- **Lu** : `js/app-05-config-profil.js` (bobines 2860–3870, live 3980–5230), `js/app-06-reels-partage.js`
  (lien `#reel=`, navigation clavier 990–1025, onglet Bobines du profil 1475), `js/ui-v5-bobines.js`
  (sorties vers le réel), `js/ui-v2-shell.js` (rail « Bobines à découvrir »), `js/app-08-ui-modals-tour.js`
  (stories 565–705 et 1846–2100, `supaLoadStories` 5696), `js/app-04-comments-shop.js` (profil visité),
  `index.html` (`#storyViewer`, `#reelsViewer`), `styles.css`.
- **Ouvert** : uniquement par le banc, en mode `compte` (faux serveur en mémoire). Gabarits `m390` partout,
  `m360` pour le lecteur, les commentaires, les stories et le live, `t768` et `d1440` pour le lecteur,
  `d1440` pour les stories. Toutes ces vues sont des **émulations Chromium**.
- **Limites du banc** : les vidéos sont la boucle locale `boucle.webm` (le H.264 de production n'est pas
  éprouvé) ; les vidéos du jeu portent `#videos/`, sans quoi le client les prend pour des photos — c'est ce
  qui fait de la bobine du socle `pa_lea_2` une « photo » cassée (BOB-051, PAR-010) : défaut du **jeu de
  données**, pas du produit. Aucun flux WebRTC : le live spectateur reste sur « Connexion au direct… ».
  Les toasts sont capturés animations coupées (cf. `partage`).
- Deux défauts de l'outillage : la sonde perd le texte d'une erreur de script quand le contexte se ferme
  (contourné en écrivant le résultat dans un fichier depuis la sonde) ; `contexteEcran` lit
  `#reelsViewer.active` alors que le lecteur utilise la classe `open` (le champ `bobines` des fiches est
  donc toujours `false`).

## 2. Cartographie

| Porte | Surface | Rendu |
|---|---|---|
| Rangée de stories du fil (ma story, lives, stories) | `#storyViewer`, visionneuse live | app-08:630, app-05:4161 |
| Rail « Bobines à découvrir » (après la 2ᵉ carte) | `#reelsViewer` | ui-v2-shell.js:580 → `openReelById` |
| Onglet Bobines de mon profil / d'un profil visité | `#reelsViewer` | app-06:1475, app-04:4884 |
| Lien `#reel=<id>` | `#reelsViewer` | app-06:77 (couvert par `partage` : PAR-047, PAR-056) |
| Créer → Plus → Live vidéo | diffusion | ui-v2-shell.js:146 (inaccessible ici) |

Dans le lecteur : rail Aimer / Commentaire / Partager, son, flèches ↑ ↓, compteur, sorties UI-5
(« Voir l'activité » ou quatre puces), panneau `#reelCommentsPanel`, carte de respiration à 15 bobines.
Le lecteur (z-index 9999) se ferme avant toute sortie (auteur, activité) : vérifié (BOB-082).

## 3. Parcours et états exercés

| État | Résultat observé |
|---|---|
| Rail → vignette | Ouvre la bonne bobine, 1 / 27 (7 de comptes + 20 d'exemple non marquées) |
| Toucher la vidéo | Rien : pas de pause (BOB-011) |
| Bouton son | Bascule, mémorisé pour les suivantes |
| Bobine reliée à une activité | « Voir l'activité » corail seul (BOB-012) — à conserver |
| Bobine photo | Dégradé violet, photo absente (BOB-013) |
| Vidéo en 404 | Message « non lisible » sous un bouton « Lire » (BOB-014) |
| Ma bobine | Aucune action propre (BOB-015) |
| Fin de liste | Flèche ↓ grisée, rien d'autre (BOB-016) |
| 15ᵉ bobine (simulé) | Carte de respiration (BOB-017) — à conserver |
| Paysage (simulé) | Texte et puces sur la moitié basse (BOB-018) |
| Commentaires, clavier simulé | Champ visible (BOB-021) |
| Frappe « Bonjour à tous » | « Bonjouràtous » et bobine suivante (BOB-022) |
| Mouvement réduit | Lecture auto en boucle (BOB-070) |
| Aucune bobine (simulé) | État vide correct, texte périmé (BOB-060) |
| Story : maintien 1,5 s | La barre avance, puis story suivante au relâcher |
| Story : Échap, → | Aucun effet |
| Story : fin du groupe de Léa | Enchaîne sur MA story |
| Stories de Léa (2) | La plus récente d'abord ; heure vide |
| Profil de Léa → bobine → Fermer | Retour sur mon profil, celui de Léa perdu (BOB-052) |
| Bulle live | Visionneuse ouverte, nom du diffuseur invisible (BOB-040) |

## 4. À conserver

« Voir l'activité » en corail ; fermeture du lecteur avant toute sortie ; carte « Tu as vu 15 bobines » ;
son coupé par défaut et mémorisé ; anneaux vu / non vu et stories vues en fin de rangée ; signalement
d'une story ; filtrage des comptes bloqués ; routeur `#reel=` qui ne montre jamais une autre bobine.

## 5. Constats

**P1**
- **BOB-C01** — Au clavier, chaque espace d'un commentaire fait passer à la bobine suivante : l'écouteur
  global (app-06:1016) ne regarde pas la cible. Mesuré : « Bonjouràtous », 1 / 27 → 2 / 27, le panneau garde
  les commentaires de la bobine précédente. Probable sur iPhone (à vérifier sur appareil).
- **BOB-C02** — Une bobine photo s'ouvre sans sa photo : `reelMediaHTML` (app-05:3003) ignore `image`, le
  seul champ que la création (app-08:1684) et la lecture (app-08:4985) remplissent.
- **BOB-C03** — Les deux sorties vers le réel sont hors de l'écran : `.reel-info` s'arrête à x = 296,
  « À vivre près de moi » commence à 295, « Proposer une sortie » à 452. Après : grille 2 × 2, bordure corail.
- **BOB-C04** (sensible) — Aucune bobine ne peut être signalée ni supprimée depuis le lecteur, alors qu'une
  story a son « ⋯ Signaler ».

**P2** — BOB-C05 vignettes vides (rail, profils) · BOB-C06 pas de pause, mouvement réduit ignoré (WCAG 2.2.2) ·
BOB-C07 stories sans pause au maintien ni clavier (WCAG 2.2.1) · BOB-C08 stories réelles sans heure et à
l'envers (`createdAt` non repris) · BOB-C09 aucune réponse à une story (jugement ; proposition : ouvrir la
conversation existante, sensible) · BOB-C10 retour perdu vers le profil visité · BOB-C11 live : nom du
diffuseur écrasé à 0 px · BOB-C12 Échap / retour ferment tout le lecteur (d'après le code, hypothèse) ·
BOB-C22 exemples mêlés sans marque.

**P3** — BOB-C13 commandes du panneau de commentaires (28, 36, 16 px) et « Lancez » · BOB-C14 fermer
38 px, étiquette en doublon qui touche la flèche, « Commentaire » sans nombre · BOB-C15 « Lire » sur une vidéo
illisible · BOB-C16 piste de progression invisible, « ⋯ » au milieu, ✕ sans nom · BOB-C17 avatars en emoji,
ma bobine proposée à moi-même · BOB-C18 réactions masquées / mortes / locales · BOB-C19 état vide périmé ·
BOB-C20 toasts sous le lecteur (fait transverse PAR-C03, IRL-C65, MSG-C85) · BOB-C21 ma story sans option et
insérée parmi celles des autres (sensible).

### Sensible
BOB-C04, BOB-C09, BOB-C21 touchent à la modération, à la messagerie entre comptes et à la suppression de
contenu : les propositions réutilisent les flux existants (signalement, suppression, conversation) et
leurs garde-fous (RLS, blocage, comptes privés).

## 6. Cohérence avec le reste de l'application

- Vouvoiement « Lancez la conversation… » dans le seul panneau des bobines ; ailleurs on tutoie.
- Fermer : « ✕ » 38 px (bobines), « ✕ » 32 px div (stories), « − » (commentaires), « ✕ » 44 px (live).
- Avatars : photo partout, emoji dans le lecteur et la visionneuse de stories.
- Partager : icône à nœuds dans le lecteur, « ↗ » dans le live.
- Onglets du profil : « Tout / Audio » sur mon profil, « Posts / Audio / podcast » sur le profil visité ;
  la multi-sélection oblige à décocher « Tout » pour voir la grille des bobines (domaine profils).
- Le live utilise un rouge (#dc2626) propre, distinct du corail IRL : acceptable (convention « en direct »).

## 7. Non vérifié

Diffusion d'un live (caméra, WebRTC, deux appareils) ; lecture H.264 et webm sur iPhone ; touche Espace du
clavier iOS dans le champ de commentaire (BOB-C01) ; geste de retour système réel (BOB-C12) ; mode
paysage sur un vrai téléphone ; bobines d'un visiteur (couvert par `partage`).

## 8. Compteurs

- Surfaces inventoriées : **38** — observées 26 · simulées 6 · code seul 5 · inaccessibles 1.
- Avec avant-après : **9** · avant seul : 17 · sans capture : 12. À conserver : **10** · à améliorer 22 · à vérifier 6.
- Constats : **22** — P0 0 · P1 4 · P2 9 · P3 9.
