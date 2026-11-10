# Messagerie — la conversation (domaine `msg-conversation`)

> Version de travail du 2026-11-10 — **passe 1 (exploration terminée, captures du livrable en cours)**.
> Registre et constats : `donnees/domaines/msg-conversation.json` (généré par
> `outils/sondes/msg-conversation-_registre.js` à partir de `-_surfaces.js` et `-_constats.js`).

## 1. Périmètre et méthode

- **Périmètre** : l'écran de conversation (1:1, groupe, discussion d'activité — même composant
  `#conv-fullpage`), de l'ouverture à la fermeture : en-tête, fil, bulles de tous types, barre de
  saisie, vocal, pièces jointes, emoji / GIF, menu d'un message, statuts d'envoi, défilement, cas de
  blocage, conversation d'exemple, proposition IRL, fond de conversation vu depuis le fil. La liste des
  conversations, la création, les groupes (gestion), les paramètres et les appels relèvent du domaine
  `msg-liste` : je n'y suis passé que pour entrer dans une conversation.
- **Lu** : `GUIDE-AUDIT.md`, `banc.js`, `jeu/base.js`, le faux serveur ; `js/app-04-comments-shop.js`
  (5640-7805), `js/app-09-boot-pwa.js` (530-2110), `js/emoji-misc.js`, `js/ui-v6a-messages.js`,
  `js/ui-v6c-proposer-irl.js`, `js/app-07-ia-explore-irl.js` (6129-6306), `js/app-08-ui-modals-tour.js`
  (6716-7541), `index.html` (1392-1476, 1729-1762), `styles.css` (5909-6302, 12247-12280),
  `scripts/build.js`, `docs/journal/social-messagerie.md`, `docs/PIEGES_CONNUS.md`.
- **Ouvert** : uniquement par le banc (`sonde.js`, `capturer.js`), mode `compte` (faux serveur en
  mémoire) et mode `demo`. Gabarits : m390 partout, m360 pour l'écran principal et les surfaces de
  saisie, m320 là où un débordement était possible, t768 et d1440 pour l'écran principal. **Tous sont
  des émulations Chromium** (agent Android, tactile) : aucun véritable appareil.
- **Jeu de données** (`outils/jeu/msg-conversation.js`, fictif) : une conversation 1:1 avec tous les
  types de message (texte, texte long, lien, emoji seul, photo, GIF, vidéo, vocal, document, fichier
  audio, position, réponse, réactions, accusé de lecture) sur quatre jours ; un groupe de 5 ; une
  conversation de 230 messages ; une interlocutrice au nom très long ; une conversation vide ; une
  discussion d'activité ; un fil court pour les envois.
- **Sondes gardées comme preuve** : `outils/sondes/msg-conversation-01…08-*.js`.

### Limites du banc à connaître en lisant ce rapport

| Sujet | Ce que fait le banc | Conséquence |
|---|---|---|
| Micro | Aucun micro : `getUserMedia` est remplacé par un flux audio de synthèse ; le Chromium de Playwright annonce `audio/mp4` mais n'encode rien (0 octet) → conteneur forcé en webm. | Tout ce qui touche à l'enregistrement est « simulé ». La course « toucher bref » dépend du délai d'ouverture du micro : à mesurer sur appareil réel. |
| Appui long | L'appui tactile (CDP) ne produit pas l'événement `contextmenu` d'un vrai appui long ; au relâchement Chromium émet un clic. | La feuille d'actions est ouverte par appui maintenu **puis glissé** ; le constat MSG-C64 est une hypothèse à confirmer sur appareil. |
| Clavier virtuel | Simulé par réduction de la fenêtre (300 px). | La zone visible ne se déplace pas comme sur un téléphone : surface MSG-120 « à vérifier ». |
| Temps réel | WebSocket avalé. | Arrivée d'un message et « en train d'écrire » sont injectés par le point d'entrée du canal (`_handleIncomingConvMessage`) ou forcés. |
| GIF | KLIPY refusé. | Sélecteurs remplis par une réponse locale (images du banc). |
| Page servie | Le banc sert `index.html` de développement ; la production sert la page construite (`scripts/build.js`), où `emoji-misc.js` s'exécute dans le 9ᵉ script. | La grille d'emojis cassée (MSG-152) n'est pas l'état de production : celui-ci est reproduit dans MSG-151. |
| Stockage | Les objets déposés reviennent en image 1×1. | Les pièces jointes du jeu utilisent des adresses locales hors du seau `attachments`. |

## 2. Cartographie

| Surface | Porte d'entrée | Fichiers |
|---|---|---|
| Écran de conversation (`#conv-fullpage`) | toucher une carte de la liste ; `openConversation(id)` ; notification ; profil → message | `app-04` 5654-5824, `index.html` 1392-1478, `styles.css` 5909-6085 |
| En-tête (`#convFpHead`) | — | `app-04` 5700-5724 ; bouton IRL `app-07` 6258-6306 |
| Fil (`#convFpThread`) : séparateurs, bulles, statuts | — | `app-04` 5919-6168 (`renderConvFpThread`), 7158 (`_msgStatusIndHtml`) |
| Barre de saisie (`.conv-toolbar`) | — | `index.html` 1432-1476 ; `app-04` 5726-5737, 6993 (`sendMessageFp`) |
| Barre d'enregistrement (`#voiceRecordBar`) | maintenir le micro | `index.html` 1424-1429 ; `app-09` 1981-2108 |
| Barre de réponse (`#convReplyBar`) | feuille d'actions → Répondre | `app-04` 6398-6418 |
| Liste de mentions (`#convMentionBox`) | « @ » dans un groupe | `app-04` 7634-7688 |
| Barre « en train d'écrire » (`#convTypingBar`) | canal temps réel | `app-04` 7738-7749 |
| Feuille d'actions d'un message (modale) | appui long / clic droit | `app-04` 6263-6283, 6334-6363 |
| Feuille « Transférer vers… » | feuille d'actions | `app-04` 6569-6736 |
| Feuille « Signaler ce message » | feuille d'actions (message reçu) | `app-04` 6371-6386, 5280 |
| Menu « + » (`#convAttachMenu`) | bouton « + » | `index.html` 1437-1461 ; `ui-v6c` ; `app-09` 708-741 |
| Panneau emoji / GIF (`#convEmojiPanel`) | bouton emoji | `index.html` 1729-1762 ; `emoji-misc.js` ; `app-09` 531-609 |
| Sélecteur GIF flottant (`#gif-panel-msg`) | bouton pellicule | `emoji-misc.js` 117-193, 476-494 |
| Visionneuse d'image (`#fullImgViewer`) | toucher une photo | `app-09` 1933-1973 |
| Galerie « Pièces jointes » (`#convFilesPanel`) | « + » → Pièces jointes | `app-09` 1560-1643 |
| Toasts de la conversation | envoi refusé, micro, position, transfert… | `app-04`, `app-09` |

Conditions d'apparition notables : boutons d'appel seulement si `appelsDisponibles()` ; bouton IRL de
l'en-tête seulement en 1:1 et après un verdict serveur favorable ; entrée « Proposer un IRL » du menu
seulement en 1:1 ; « Signaler ce message » seulement sur un message reçu ; « Supprimer pour tous »
seulement sur les miens ; nom de l'expéditeur seulement en groupe ; liste de mentions seulement en groupe.

## 3. Parcours déroulés et états difficiles

*(tableau complété à la passe finale — résultats déjà acquis ci-dessous)*

| État exercé | Résultat observé |
|---|---|
| Ouverture d'un fil riche en médias | fil 360 px au-dessus du bas, jamais recalé (MSG-C52) |
| Ouverture d'un fil de texte (230 messages) | 40 bulles, bas atteint, rendu de 230 bulles en 29 ms |
| Champ : 141 caractères | 11 lignes dans 126 px utiles, plafond 120 px puis défilement interne |
| Entrée (gabarit tactile) | envoie le message |
| Double appui sur Envoyer, Entrée × 3, espaces seuls | 2 lignes pour 2 messages, 0 pour les espaces |
| Hors ligne puis reconnexion | « ✓ réessayer » + bandeau sur l'en-tête ; envoi automatique au retour |
| Serveur 500 puis « réessayer » | échec affiché, relance réussie |
| Appui long (texte, photo, vidéo) | feuille sur texte et photo ; rien sur la vidéo |
| Supprimer pour moi / pour tous | immédiat, sans confirmation |
| Photo, document, fichier audio (vrai sélecteur) | photo envoyée sans aperçu ; document illisible ; audio = bulle vide |
| Position accordée | envoyée en un toucher |
| Visionneuse + Retour ; panneau emoji + Retour | la conversation se ferme derrière, la couche reste |
| Vocal : maintien, toucher bref, glissement, ✕, refus | voir MSG-C53, MSG-C54, MSG-C81 |
| Message entrant pendant la relecture | saut tout en bas |
| Brouillon : retour / rechargement | conservé / perdu |
| Bloqué par l'autre ; compte que j'ai bloqué | « réessayer » sans fin ; fil amputé, champ actif |

## 4. Ce qui fonctionne et doit être conservé

Voir `aConserver` dans le JSON (14 points) et les lignes « à conserver » du registre.

## 5. Constats détaillés

*(rédaction détaillée à la passe finale ; chaque constat est complet dans le JSON : emplacement,
preuve, problème, déclencheur, conséquence, proposition, critère d'acceptation, risques.)*

## 6. Cohérence avec le reste de l'application

*(à compléter)* — déjà relevé : icônes en emoji dans la feuille d'actions quand le menu « + » est en
pictogrammes ; `#7c3aed` en dur dans le panneau emoji ; deux libellés et deux icônes pour « proposer
un IRL » ; liens actifs dans les commentaires, inertes dans les messages ; fenêtres natives
(`confirm`, `prompt`) dans les paramètres de conversation ; libellés d'aperçu différents entre la
liste (« Photo ») et la citation (« [MEDIA] nom »).

## 7. Ce qui n'a pas pu être vérifié

*(à compléter)* — appareil réel pour : clavier virtuel, appui long, micro, format des vocaux, push.

## 8. Compteurs

*(générés à la passe finale par `msg-conversation-_registre.js`)*
