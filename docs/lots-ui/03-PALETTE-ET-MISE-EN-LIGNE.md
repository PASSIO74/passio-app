# 03 PALETTE ET MISE EN LIGNE

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.


  **§5 de la direction — la palette PILOTE l'interface depuis le 2026-08-28.**
  `--v2-ink` et `--v2-cloud` étaient déclarés avec ZÉRO consommateur, et le
  violet réellement affiché restait `#7c3aed` au lieu du `#6D32F4` arrêté : la
  charte était écrite, jamais vue. Les variables de thème du projet
  (`--accent`, `--bg-deep`, `--text`, `--grad-hero`…) sont remappées sous
  `:root.passio-ui-v2` — et elles seules : aucune règle existante n'est
  réécrite, donc `localStorage.passio_ui_v2="0"` rend la charte historique à
  l'octet près. Contraste vérifié avant/après : `#6D32F4` donne 6,15:1 sur blanc
  contre 5,70:1 pour `#7c3aed` — le nouveau violet est plus foncé, donc plus
  lisible. Le corail `#FF6B57` reste STRICTEMENT réservé au passage au réel
  (§5) : il n'entre dans aucun jeton d'accent général. Typographie : Manrope
  pour les titres et les appels à l'action (`display=swap`, autorisé par la CSP),
  texte courant en pile système ; deux niveaux de titre distincts (26 px/800 pour
  un écran, 17 px/800 pour un bloc).

  **⚠️ Piège de déploiement mesuré le 2026-08-28 : la garde « Gouvernance
  critique » perd une course avec l'indexation GitHub.** Sur un `push` vers
  `main`, elle résout la PR par `gh api repos/…/commits/<sha>/pulls`. Lancée 3 s
  après une fusion squash, l'index n'est pas encore à jour : elle sort « Aucune
  pull request n'est associée à <sha> » et le déploiement production est SAUTÉ.
  Ce n'est pas un défaut du code — le remède est de relancer le seul job en
  échec une fois le run terminé (`rerun_failed_jobs`), et il passe. Ne jamais
  annoncer « c'est en ligne » sans avoir vu le job « Déploiement production »
  vert : entre la fusion et la publication, la chaîne repasse toute la suite
  (~13 min) et peut buter sur cette garde.

  **⚠️ MISE EN LIGNE DU 2026-08-28 — les quatre lots UI-4 sont ACTIFS PAR DÉFAUT.**
  Sur ordre de Benjamin, `UI-4A0`, `UI-4A1`, `UI-4A2` et `UI-4B` sont passés de l'aperçu
  à l'URL normale, sans validation visuelle préalable — le mécanisme d'aperçu ne lui
  permettait pas de voir les lots sur son appareil (voir ci-dessous), et l'attente
  bloquait tout le chantier. Chaque drapeau suit désormais le patron d'UI-3A : il ne sait
  plus qu'**enlever** (`localStorage.passio_ui_4a0|4a1|4a2|4b = "0"`,
  `window.PASSIO_UI_4A0|4A1|4A2|4B = false`), les anciens liens `?passio_preview=…`
  restent tolérés mais ne décident plus rien, et aucune activation positive n'est écrite.
  Seule exception : la **démonstration** d'UI-4B (`?passio_preview=passio-ui-4b-demo`)
  reste sur son lien, car elle injecte une activité fictive.
  Conséquences de produit assumées, à connaître : ① `ficheReprisParV4b()` rend
  définitivement la barre d'action de la fiche à UI-4B — UI-3B ne la peint plus jamais ;
  ② UI-4A0 arme `_passioIrlSkipGeoOnce` avant chaque `renderIRL`, donc **la position
  n'est plus jamais demandée implicitement** sur l'écran IRL (conforme à §A23, mais c'est
  un changement pour les comptes existants) ; ③ les cartes ne montrent plus `venue` ni le
  trombinoscope (§A24).
  Convention de test appliquée, la même qu'à la mise en ligne d'UI-3A : **une suite qui
  observe le comportement historique pose au boot le kill switch du lot qui le recouvre**
  et garde toutes ses assertions ; les contrôles « URL normale = rien du lot » ont été
  RÉÉCRITS en contrôles de kill switch, jamais supprimés. Fichiers réalignés :
  `ui-v4a0-tete`, `ui-v4a1-intentions`, `ui-v4a2-cartes`, `ui-v4b-fiche`,
  `ui-v3b-activite`, `ui-v3-passerelle`, `irl`.

  **⚠️ Pourquoi un aperçu peut être invisible alors que tout est déployé (2026-08-28).**
  Quatre causes mesurées le même jour, sur trois lots différents — aucune n'était le
  déploiement, et aucune n'était détectable par la suite e2e. À relire avant de conclure
  « ça ne marche pas » :
  ① **`js/platform.js` détruisait la query.** La redirection « iOS autre navigateur »
     faisait `location.href = 'https://passio-app.netlify.app/'` 800 ms après `load` —
     donc sans `?passio_preview=…`, en pleine saisie du code d'accès. Elle n'ouvrait
     d'ailleurs pas Safari (même schéma `https`) et, lancée depuis l'adresse canonique,
     ne faisait que recharger. Corrigée : on ne redirige plus que depuis une AUTRE
     origine, et query et fragment sont conservés.
  ② **`state` vaut `null`, pas `undefined`.** `js/ui-v4b-fiche.js` gardait par
     `typeof state === "undefined" || !state.seed` alors qu'app-01 déclare
     `let state = null` : `state.seed` levait un TypeError non rattrapé qui tuait la
     reprise. **Ce motif est à chasser partout** où un `typeof state === "undefined"`
     précède un accès à une propriété de `state`.
  ③ **Un budget de reprise consommé avant l'existence de l'application.** En prod le bloc
     app n'est injecté qu'APRÈS le code d'accès ; `ui-v4b-fiche.js` brûlait ses 80 essais
     × 150 ms pendant la saisie et ne remettait jamais son compteur à zéro — seul des
     quatre modules à ne pas écouter `passio:app-ready`. Corrigé. **Tout module inliné
     hors bloc app DOIT écouter `passio:app-ready` et y remettre ses compteurs à zéro.**
  ④ **Un lot sans contenu éligible est indiscernable d'un lot cassé.** UI-3B ne décore
     qu'une publication portant `eventId` : aucune publication du contenu de démo n'en
     porte, donc « Voir l'activité » n'apparaissait nulle part. Le lot marchait.
  ⑤ **UNE PREVIEW DE PR EST UNE AUTRE ORIGINE** (mesuré le 2026-09-01, PR #232).
     Le correctif de ① garde la redirection iOS-autre-navigateur par
     `location.origin === 'https://passio-app.netlify.app'`. Or Netlify sert les
     déploiements de PR et de branche sous un SOUS-DOMAINE —
     `pr-232--passio-app.netlify.app` — donc sous une origine différente : la garde
     ne reconnaissait pas le site, et ramenait en PRODUCTION quelqu'un venu tester
     un aperçu. Le `?passio_preview=…` survivait au voyage et atterrissait sur un
     code qui ne contient pas le lot : on conclut « l'aperçu ne marche pas » alors
     qu'il n'a jamais été chargé. Le prédicat est désormais
     `_estDeploiementPassio()` (`js/platform.js`), qui accepte l'adresse canonique
     ET `*--passio-app.netlify.app`, et il garde AUSSI l'`intent://` de Firefox
     Android, qui avait exactement le même défaut. ⚠️ L'ancre `$` de sa regex n'est
     pas cosmétique : sans elle, `mechant--passio-app.netlify.app.attaquant.fr`
     serait accepté. Éprouvé sur huit hôtes, dont trois usurpations de suffixe.
  **Angle mort structurel confirmé :** `tests/e2e/app-helper.js` pose le jeton du gate
  AVANT la navigation, donc **aucune suite n'exerce la fenêtre « gate affiché,
  application absente »** — celle où ①, ② et ③ se produisent. Un vert e2e n'infirme
  jamais ces cinq causes. ⑤ y échappe pour une autre raison : la suite tourne sur
  `127.0.0.1`, donc aucun test ne peut porter un hôte `*--passio-app.netlify.app`.
