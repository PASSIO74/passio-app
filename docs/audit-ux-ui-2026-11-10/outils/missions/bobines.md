# Mission — BOBINES, STORIES ET LIVE

- Clé de domaine : `bobines` · Groupe : `Bobines et stories`
- Identifiants : surfaces `BOB-001…` ; constats `BOB-C01…`
- Hors périmètre : la CRÉATION d'une bobine ou d'une story (`creation`), la feuille de partage
  d'une bobine (`partage` — tu en montres seulement la porte).

## Périmètre

- Portes d'entrée : rail « Bobines à découvrir » du fil, onglet / filtre Bobines du profil, lien
  profond `#reel=<id>`, carte de bobine dans le fil, rangée de stories (fil et profil).
- Lecteur de bobines (`#reelsViewer`, `openReels` app-05:3076, `openReelById` app-05:3139, lot
  UI-5 `js/ui-v5-bobines.js`) : ouverture, navigation verticale (glisser, molette, clavier),
  lecture / pause (toucher), son (coupé par défaut ? indicateur ?), progression, texte superposé
  (lisibilité sur l'image), auteur et passion, j'aime, commentaires (`#reelCommentsPanel`,
  `openReelComments` app-05:3307, emoji et GIF `showQuickEmojiForReelComment` /
  `showEmojiPickerForReelComment` / `showGifPickerForReelComment`), partage, « … », sortie vers le
  profil de l'auteur ou une activité (le lecteur est en `z-index: 9999` : se ferme-t-il avant
  toute sortie ?), première bobine épinglée, fin de liste, bobine en erreur de lecture, vidéo
  lente, une seule bobine, aucune bobine, mode paysage, bouton de fermeture (taille, position,
  contraste sur vidéo claire), geste de retour du système.
  ⚠️ Dans le banc les vidéos distantes sont remplacées par `boucle.webm` (le Chromium de Playwright
  ne lit pas le H.264) : à dire dans les preuves.
- Stories (`#storyViewer`, `openStoryViewer` app-08:1883, `openStoryViewerAt` app-08:1871,
  `openStoryGroup` app-08:1854) : barres de progression, durée, toucher précédent / suivant
  (zones `.story-tap-prev/next`), pause au maintien, fermeture (« ✕ » de quelle taille ?),
  enchaînement entre auteurs, story vue / non vue (anneau), ma story (« Ta story »), réponse ou
  réaction à une story si elle existe, liste des vues, story expirée, story avec texte superposé,
  clavier (Échap, flèches).
- Live vidéo (`js/app-05-config-profil.js` ~4012–5300 : `supaLoadVideoLives`, `_vlive*`) : est-il
  actif dans l'application auditée ? Où est sa porte ? Rends ce qui peut l'être par les fonctions
  de rendu (« simulé ») ; la diffusion réelle (WebRTC, caméra) est « inaccessible » ici.
- Mouvement réduit (`contexte.reducedMotion: "reduce"`) : lecture automatique, transitions.

## Points d'entrée dans le code

`js/app-05-config-profil.js` (bobines ~3000–3900, live ~4012–5300), `js/ui-v5-bobines.js`,
`js/app-08-ui-modals-tour.js` (stories ~700–1900, `supaLoadStories` ~5696, vues ~8832),
`index.html` (`#storyViewer` l.168–237, `#reelsViewer` l.1285–1342), `styles.css`. Fiches :
`docs/lots-ui/` 02, 06, `docs/BOBINE_DISCOVERY_V1_SPEC.md`, `docs/PIEGES_CONNUS.md` (bobines /
stories, appels / live), `tests/e2e/*reel*.spec.js`, `*bobine*.spec.js`, `*stor*.spec.js`.
Données fictives dans `outils/jeu/bobines.js` (table `posts` avec `is_reel: true` et
`media_url: media("boucle.webm")`, table `stories`, `story_views`).
