# Fil et interactions — rapport de domaine

Clé `fil` · surfaces `FIL-001…FIL-111` · constats `FIL-C01…FIL-C30` · version auditée `main@4e1d8ed1`.

## 1. Périmètre et méthode

**Lu.** `CLAUDE.md`, `docs/lots-ui/INDEX.md` et les fiches 11, 14, 17, 23, 25, 28 ; `docs/journal/passions-fil.md` (fil chronologique, réel d'abord, panne ≠ vide) et `social-messagerie.md` (récap, réactions, GIF, décor des exemples) ; `docs/PIEGES_CONNUS.md` (fil, likes, réactions, commentaires, suppression, modération). Code : `renderFeed`, `renderPostHTML`, `openPost`, séparateur, envies (`js/app-02-state-utils.js`), j'aime (`js/app-03-posts-vlogs.js`), commentaires, options, panneaux (`js/app-04-comments-shop.js`, `js/emoji-misc.js`), lecture du fil et `fil_compteurs` (`js/app-08-ui-modals-tour.js`), passerelle IRL (`js/ui-v3-passerelle.js`, `js/app-07-ia-explore-irl.js`), `index.html`.

**Ouvert, par le banc isolé seulement.** Sept scénarios (`outils/scenarios/fil.js`) et cinq sondes (`outils/sondes/fil-0*.js`) : compte connecté fictif sur le faux serveur (jeu `outils/jeu/fil.js` : 19 publications de tous types, 39 commentaires, j'aime, réactions, stories, activité, option « 64 publications de plus »), compte neuf sans publication réelle, visiteur. Gabarits : 390×844 partout ; 360×640 pour le haut du fil, les cartes principales, la discussion, la page d'une publication, le visiteur ; 320×568, 768×1024 et 1440×900 pour le haut du fil. Ce sont des émulations Chromium 158 : aucun véritable appareil.

**Limites.** Temps réel coupé, GIF (KLIPY, Giphy) refusés, vidéo et audio remplacés par un fichier local, clavier simulé par réduction de fenêtre, pas de geste « tirer pour rafraîchir ». Le faux serveur commun répond à `fil_compteurs` par « 0 commentaire » : le jeu du domaine le complète en mémoire par un miroir de la fonction SQL de production (voir § 7).

## 2. Cartographie

| Zone | Surfaces | Porte d'entrée, condition | Code |
|---|---|---|---|
| En-tête du fil | FIL-001, 016 | onglet « Découvrir » ; rail = « Suivis » + passions du compte ; envies = filtres ; stories | `index.html:606-652`, `renderProfileStrip` (app-06:3696), `renderStories` (app-08:630) |
| Cartes | FIL-002 à 015, 071, 090 | `renderPostHTML` (app-02:10279) ; type déduit de l'adresse du média (app-08:4967) | app-02, app-08 |
| Modules insérés | FIL-017, 018, 019, 070 | après la 2ᵉ et la 4ᵉ carte ; séparateur avant le premier exemple | `ui-v2-shell.js:582, 704`, app-02:8595 |
| États du fil | FIL-072 à 076, 100 à 107 | sélection vide, envie, hors ligne, panne, repli | app-02:9803-9905, 8843 |
| Discussion | FIL-030 à 040 | « 💬 » d'une carte → `openComments` (app-04:1298) | app-04, emoji-misc |
| Page d'une publication | FIL-050, 051, 110, 111 | toucher le texte ou le média → `openPost` (app-02:10508) | app-02, `index.html:1256` |
| Réactions | FIL-052 à 054 | « 😊 » → `emojiReactPanel` (app-04:3336) | app-04, emoji-misc |
| Menus « ⋯ » | FIL-060 à 063, 034, 035 | publication : `openPostOptions` / `openPostOptionsAutrui` (app-04:9, 31) ; commentaire : `openCommentOptions` (2381) | app-04 |
| Vers l'IRL | FIL-005, 014, 064, 108 | « Voir l'activité » si `event_id`, sinon « Trouver une activité » | `ui-v3-passerelle.js`, app-07:5523 |
| Visiteur | FIL-080, 081 | appareil vierge : fil d'exemples, carte de bienvenue, `requireAuthentication` | `first-run.js:1463` |

Ce que les menus offrent réellement : ma publication → supprimer (pas de modification) ; publication d'autrui → signaler, bloquer (ni « masquer », ni « ne plus suivre ») ; commentaire d'autrui → répondre, réagir (emoji, GIF), copier, masquer, bloquer, signaler ; mon commentaire → + modifier, supprimer ; propriétaire du fil → épingler.

## 3. Parcours et états difficiles

| État exercé | Résultat observé |
|---|---|
| Fil normal, 17 publications réelles puis exemples | réel d'abord, séparateur « Tu es à jour » (FIL-019) |
| Fil volumineux (80 publications) | 20 cartes puis bouton ; la suite s'ajoute sans saut (FIL-091, 092) |
| Compte sans publication réelle | séparateur « seul », quatre lignes et deux boutons (FIL-070) |
| Rien de coché / « Suivis » seul sans abonnement / envie sans source | trois états vides ; le bouton ne suit pas le message (FIL-072 à 074) |
| Publication reliée à une activité, à l'ouverture | porte absente (FIL-005) — FIL-C01 |
| Nom d'auteur de 47 caractères | deux lignes, pas de chevauchement (FIL-015) |
| Photo très haute, absente (404), sans texte | dépasse l'écran ; rectangle gris ; correcte (FIL-008, 012, 009) |
| J'aime présent en base, état local vide | « 🤍 5 » puis « ❤️ 6 » au toucher (sonde fil-02) — FIL-C03 |
| Double appui sur « Publier » | une seule écriture, un seul commentaire (sonde fil-04) |
| Commentaire refusé par le serveur (500) | « Non envoyé · Réessayer » sur le commentaire (FIL-033) |
| Suppression d'un commentaire refusée (500) | toast « Commentaire supprimé », ligne toujours en base, de retour à la relecture — FIL-C06 |
| « Masquer » puis relecture de la discussion | le commentaire revient — FIL-C07 |
| « Copier » sans permission de presse-papiers | toast « Texte copié », rejet `NotAllowedError` non rattrapé — FIL-C09 |
| « Bloquer » depuis le menu d'un commentaire | blocage et désabonnement immédiats, toast « 🚫 Utilisateur bloqué », discussion refermée — FIL-C08 |
| Panneau de réaction à 360×640 | sort de l'écran ; le 3ᵉ emoji n'est pas touchable — FIL-C10 |
| Clavier ouvert (simulé) dans la discussion | liste toujours à 260 px (FIL-031) |
| Hors ligne (simulé) | bandeau qui recouvre la barre du haut (FIL-076) |
| Visiteur : fil, puis j'aime | bienvenue + séparateur avant tout contenu ; demande de compte claire (FIL-080, 081) |
| Parcours clavier du haut du fil (16 tabulations) | tout est atteignable avec un indicateur de focus visible |

## 4. Ce qui fonctionne et doit être conservé

- L'ordre « réel d'abord, exemples ensuite », son séparateur et l'étiquette « Exemple PASSIO ».
- La passion en violet près de l'heure et la pastille d'envie (corail réservé à « Rencontrer »).
- « Trouver une activité » au bas de chaque carte et sa feuille à trois suites (FIL-064).
- « Non envoyé · Réessayer » posé sur le commentaire, texte gardé (FIL-033) ; un double appui n'écrit qu'une fois.
- La confirmation de suppression d'une publication (FIL-063) et le signalement avec motif (FIL-061).
- La demande de compte du visiteur, qui nomme l'action et laisse sortir (FIL-081).
- Réponses repliées, pastille de réactions qui nomme les personnes (FIL-038, 054).
- La pagination qui ne déplace pas la lecture (FIL-092) ; le focus clavier visible partout.

## 5. Constats par surface

**Passage vers l'IRL.** FIL-C01 (P1) : « Voir l'activité » absent à l'ouverture. `decorerActivite` (`ui-v3-passerelle.js:1006-1008`) ne peint rien quand l'activité n'est pas encore en mémoire ; à son arrivée (`fusionnerEvenementsServeur`, app-08:6283) seul `renderIRL()` est rappelé, et seulement si l'écran Rencontrer est actif (6286-6287) ; l'observateur du fil (ui-v3:460) n'écoute que les ajouts de cartes. Maquette FIL-005 : le rendu que l'application produit elle-même après un repeint. FIL-C30 (P3) : même cause de calendrier pour « Passionnés à découvrir ».

**Carte.** FIL-C02 (P2) : barre d'actions en emojis, 12,5 px, nommée « 🤍 5 » (maquette FIL-002 : icônes SVG, noms, état). FIL-C03 (P2) : j'aime déjà posé non peint pendant les premières secondes (app-02:10314 lit `likedPosts`, la lecture rend `liked`, app-08:5007). FIL-C26 (P3) : aperçu « 🤍 0 » pour un commentaire aimé. FIL-C19, C18, C21 (P3) : photo très haute, photo en échec, vidéo. FIL-C20 (P2) : repartage sans lien vers l'original, sous-carte d'activité débordante. FIL-C27 (P3, sensible) : compte privé non signalé.

**En-tête et états.** FIL-C13 (P2, jugement) : envies non lues comme des filtres (11 px, sans intitulé). FIL-C14 (P3) : premier contenu à 273 px, soit 48 % d'un écran 320×568. FIL-C15 (P2) : séparateur adressé à un visiteur, contenu à ~670 px. FIL-C16 (P3) : séparateur long. FIL-C17 (P2) : états vides dont le bouton contredit le message. FIL-C25 (P3) : bandeau hors ligne sur la barre. FIL-C28 (P3) : « Charger plus de posts ».

**Discussion.** FIL-C04 (P2) : liste de 260 px (app-04:1320) pour 2 975 px de contenu. FIL-C05 (P3) : « Discussion » / « Commentaires », 34 → 37. FIL-C11 (P2) : cibles de 28 × 40, « ✓ » de 34 × 34, champs sans étiquette. FIL-C29 (P3) : limite de 400 caractères muette. FIL-C06 (P1) : suppression de commentaire sans confirmation ni verdict (app-04:2444-2482). FIL-C07 (P2) : « Masquer » non durable. FIL-C09 (P3) : « Texte copié » annoncé sans attendre.

**Page d'une publication.** FIL-C12 (P2) : titre « Post », fond en dur, pas de saisie, contraste 4,39:1 sur deux textes ; aucune image ne s'agrandit.

**Réactions et menus.** FIL-C10 (P2) : panneau hors écran, cases de 28 px, deux touchers. FIL-C08 (P2, sensible) : « Bloquer » sans confirmation depuis deux menus. FIL-C23 (P3) : emojis et pictogrammes mêlés. FIL-C24 (P3, hypothèse) : pas de modification d'une publication — décision produit, non maquettée.

**Sensible.** FIL-C08 (blocage, qui rompt aussi l'abonnement) et FIL-C27 (visibilité d'un compte privé) touchent aux droits et à la confidentialité : les garde-fous existants (RLS, `blockUser`) sont à conserver tels quels ; seules la confirmation et la mention changent.

## 6. Cohérence avec le reste de l'application

- **Mots** : « post » (menus, titre de page, pagination, toasts), « publication » (signalement, demande de compte), « Passio » (bouton d'état vide), « feed » (feuille de partage) — FIL-C22. « Événement » (sous-carte « ÉVÉNEMENT IRL », « A partagé un événement ») contre « activité » partout ailleurs. « Rencontrer » désigne à la fois une envie du fil et un onglet de la barre basse.
- **Icônes** : emojis pour les fonctions du fil (🤍 💬 😊, menus 🚩 🚫 📋…) alors que le partage, la barre basse et la corbeille sont en SVG.
- **Comportements** : supprimer une publication se confirme, supprimer un commentaire non ; l'échec d'envoi d'un commentaire se dit, l'échec de sa suppression non ; le panneau GIF est ramené dans l'écran (`_ramenerDansLEcran`), le panneau de réaction non ; deux gabarits de feuille pour les menus « ⋯ » (`openModal` et `#cmtSheet`).

## 7. Ce qui n'a pas pu être vérifié

- Tirer pour rafraîchir, double appui tactile, clavier réel (iOS, Android) : véritable téléphone.
- Arrivée de publications et de réactions en direct : deux comptes, temps réel ouvert.
- Récap de la semaine : compte réel de test d'au moins trois jours.
- Grille et recherche de GIF : production (`?equipe=1`).
- Repli d'exploration, séparateur « panne », « Rien en « Apprendre » » : lus dans le code, non rejoués.
- Publication d'un compte privé absente au premier chargement : vu dans le banc avec un état local sans abonnements ; à confirmer hors banc.
- **Banc** : `fil_compteurs` du faux serveur rend 0 commentaire, aucun aperçu, et `moi` au lieu de `aime` ; contourné dans `outils/jeu/fil.js` (`completerFilCompteurs`, objet en mémoire seulement). FIL-C03 repose sur ce miroir, fidèle au SQL de la migration du 2026-09-21.

## 8. Compteurs

| | |
|---|---|
| Surfaces inventoriées | 64 |
| Observées / simulées / code seul / inaccessibles | 45 / 7 / 10 / 2 |
| Avec avant-après / avant seul / sans capture | 15 / 37 / 12 |
| À conserver / à améliorer / à vérifier | 22 / 31 / 11 |
| Constats | 30 — P0 : 0 · P1 : 2 · P2 : 12 · P3 : 16 |
