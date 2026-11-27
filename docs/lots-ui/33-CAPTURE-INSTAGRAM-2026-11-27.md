# Story et bobine : écran de capture façon Instagram — 2026-11-27

## Le retour

Benjamin, capture de l'appareil photo d'Instagram à l'appui : « je trouve que toutes
les fonctionnalités de story et bobines ne sont pas ergonomiques et faciles à
utiliser — retravaille ces deux fonctionnalités, copie Instagram, veille à ce que
chaque onglet et fonctionnalité fonctionne parfaitement ».

Mesuré avant d'y toucher (captures 390 × 844, caméra simulée) :

- **Bobine : il fallait MAINTENIR le doigt pendant toute la prise** (jusqu'à 60 s) —
  un toucher bref répondait « Maintiens le bouton pour filmer ta bobine ».
- **Bobine : le déclencheur n'était pas centré.** Le bouton « Aa » de droite passait
  en `display: none`, la rangée `space-between` poussait le déclencheur au bord droit.
- Aucun moyen de passer de Story à Bobine sans fermer l'éditeur et repasser par « + ».
- La rangée de filtres était posée en permanence sur la capture, sans nom.
- En édition, sept outils en emoji sans libellé, serrés au-dessus de « Publier ».
- Le ✕ de l'édition (et le geste retour) jetait la photo, les textes et le dessin
  d'un seul toucher, sans rien demander.

## Ce qui change

### Capture (story ET bobine — même écran, `#mediaEditor.phase-capture`)

- **Onglets de mode en bas : Publier · Story · Bobine · Live** (`#meModes`,
  `meChoisirMode`). Story ⇄ Bobine se change SUR PLACE — la caméra n'est pas
  rallumée (`_meAppliquerMode`, la seule fonction qui pose ce qui dépend du mode,
  appelée par `meOpen` ET par les onglets). « Publier » ferme l'éditeur et ouvre le
  Studio (`ouvrirStudioPublication`), « Live » lance `startVideoLive`. Glisser sur la
  scène passe aussi de Story à Bobine. L'onglet actif se centre ; la bande occupe
  toute la largeur, donc les quatre onglets restent atteignables de 320 à 430 px.
- **Colonne d'outils NOMMÉS à gauche** (`#meRail`, un bouton = une icône + son nom,
  repliable par le chevron, choix gardé dans `localStorage.passio_me_rail_replie`) :
  - Story : **Créer** (`#meBgBtn`, inchangé), **Boomerang**, **Effets**, **Mains
    libres**, **Minuteur** ;
  - Bobine : **Durée** (15 / 30 / 60 s), **Effets**, **Minuteur**.
  Un outil ne se montre que dans le mode où il agit (`data-modes`) et, s'il a besoin
  de la caméra (`data-camera`), seulement caméra allumée.
- **Déclencheur** (`_meBindShutter`) :
  - Story : toucher = photo, maintien = vidéo (inchangé) ;
  - **Bobine : toucher = filmer, toucher encore = arrêter** ; maintenir filme aussi,
    relâcher arrête. La prise lancée par un toucher est « verrouillée »
    (`.me-verrouille`), la consigne dit « Appuie pour arrêter » ;
  - Mains libres : la story se filme comme une bobine ;
  - Boomerang : un toucher = rafale de 16 images, rejouée en aller-retour (3 fois)
    et encodée en vidéo par canvas + MediaRecorder (`meCaptureBoomerang`,
    `_meBoomerangEncoder`) — le résultat suit le chemin d'une vidéo ordinaire ;
  - Minuteur (3 s / 10 s) : le toucher lance le décompte, un second l'annule.
- **Flash** (`#meFlashBtn`) : torche si la piste vidéo en a une (`_meTorche`), sinon
  l'ÉCRAN éclaire — plein blanc le temps d'une photo, anneau lumineux pendant une vidéo.
- Galerie à gauche du déclencheur, changement de caméra à droite : le déclencheur est
  centré dans les deux modes (ses voisins gardent leur place même invisibles).
- La consigne sous le déclencheur dit toujours ce que fera le prochain toucher
  (`_meMajConsigne`).

### Édition

- **Outils en colonne à droite**, icône + nom (Texte, Stickers, Effets, Dessin,
  Galerie, et Fond en mode Créer). Les noms s'affichent à l'arrivée puis s'effacent
  (`ME_NOMS_OUTILS_MS`). **Emoji et GIF sont dans le tiroir Stickers**, en tête.
- Les panneaux (stickers, emoji) sont des feuilles posées en bas de l'écran.
- Pendant qu'on déplace un élément, colonnes et rangée « Publier » s'effacent
  (`.me-glisse`).
- Le bouton du haut devient **‹ « Revenir à l'appareil photo »** ; avec du contenu,
  il DEMANDE (« Abandonner cette story ? »). Le geste retour du système pose la même
  question (`meRetourGarde`, appelée par `closeCurrentOverlay` d'app-02) ; il referme
  d'abord un tiroir ouvert.

## Invariants

- `_meAppliquerMode` est la SEULE fonction qui pose ce qui dépend du mode. Un nouvel
  élément propre à un mode s'y branche — pas dans `meOpen`.
- `#meBgBtn`, `#meShutter`, `#meFlipBtn`, `#meGalleryThumb`, `#meTitle` (texte « Story »
  / « Bobine », masqué visuellement) gardent leurs identifiants ; les outils d'édition
  gardent leurs `aria-label` (« Ajouter un texte », « Ajouter un sticker », « Filtres »).
- Les règles de visibilité historiques des outils (`.media-editor.me-fond
  .me-tool-filtres`, `:not(.me-fond) .me-tool-fond`) comptent TROIS classes : toute
  règle du bloc qui touche `display` d'un `.me-tool` reste à deux classes
  (`.me-toolbar .me-tool`), sinon elle les écrase.
- Le boomerang et le minuteur sont cadencés par `setInterval`, jamais par
  `requestAnimationFrame` ; l'encodeur a une garde de temps (`ME_BOOM.delaiMax`) et un
  jeton (`meCap.boomJeton`) : fermé en route, il ne pose rien après coup.
- Rien n'est pris pendant un décompte si l'éditeur a été fermé ou la caméra coupée.
- On ne change ni de mode ni de caméra pendant une prise, un décompte ou un boomerang.
- Tout le style vit dans UN bloc de fin de `styles.css` (marqueur « ÉCRAN DE CAPTURE
  FAÇON INSTAGRAM ») — écrit en CRLF, sans toucher aux règles d'avant.

## Lecteurs

- **Story** : sur téléphone (≤ 520 px), la story occupe toute la largeur, du haut de
  l'écran à la barre de réponse (elle était une carte de 346 px au milieu d'un fond).
  Sa géométrie se rapproche de celle de l'éditeur : un élément posé à la création
  retombe au même endroit à la lecture.
- **Bobines** : sur un écran tactile, les deux flèches ↑ ↓ disparaissent (on glisse),
  la légende redescend à leur place, et un **double toucher aime la bobine** (cœur au
  centre, jamais un « je n'aime plus »).

Verrou : `tests/e2e/capture-instagram.spec.js` (11) — chaque onglet et chaque outil
par ses vrais gestes sur une caméra simulée ; `tests/e2e/lecteurs-instagram.spec.js`.

## Non éprouvé ici

- La torche matérielle (la caméra simulée n'en a pas) : seul le flash d'écran est
  éprouvé. Le code de la torche suit l'API `applyConstraints({ advanced: [{ torch }] })`.
- Le boomerang sur iPhone : même couple canvas + MediaRecorder que la compression
  vidéo déjà en production ; sans l'un des deux, le bouton n'est pas proposé.
