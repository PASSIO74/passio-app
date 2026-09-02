# 05 LAVIS VIOLET

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.


  **⚠️ Les carrés violets sont des LAVIS, plus des aplats (2026-09-01), SANS drapeau.**
  Trois demandes de Benjamin après essai réel : « sur Publication, écris en petit
  dessous : photo / vidéo » · « supprime "publier en tant que…", on a changé le
  concept de multi-profil, ça ne sert plus à rien, supprime-le de partout » · « les
  grands carrés violets sont agressifs, mets plutôt des carrés violet très léger et
  écris en violet foncé », puis « pour les onglets violets, mets les mêmes sur le
  filtre dans Rencontrer ».
  ① **Trois jetons de palette neufs** — `--accent-tile`, `--accent-tile-on`,
  `--accent-tile-line` — déclarés dans les DEUX palettes (`:root` historique et
  `:root.passio-ui-v2`). Ils remplacent le couple `--accent` + blanc partout où une
  SURFACE ENTIÈRE était peinte en violet plein : la feuille « Créer »
  (`#v2CreateSheet`) et les cases du panneau Filtres de Rencontrer (`#v4a5Outils`,
  `.v4a5-intents`, `#v4a5Passions`, y compris le dépliant « Autres »). L'écriture
  passe en `--accent-2` : 6,2:1 sur le lavis, très au-dessus de l'AA. La FORME ne
  bouge pas — mêmes hauteurs, mêmes rayons, même grille : seule la densité de
  couleur change. Les onglets `.v7-tab[aria-selected="true"]` ne sont PAS touchés :
  un indicateur d'onglet sélectionné n'est pas un « grand carré ».
  ⚠️ Ce sont des couleurs OPAQUES, jamais des `rgba` comme `--accent-wash` : le
  contrôle de contraste du projet remonte les ancêtres jusqu'au premier fond opaque
  et prendrait une teinte translucide pour une couleur pleine, alpha ignoré.
  ⚠️ **La grammaire d'état a dû changer avec la couleur.** Ces cases distinguaient
  coché de décoché par `opacity: 0.55`. Sur un carré déjà très clair, cela efface la
  case décochée ET fait tomber son texte sous le seuil AA : l'état se lit désormais à
  la DENSITÉ du lavis (`--accent-tile-on`) et au filet violet plein, la coche ✓
  continuant de le porter une seconde fois. Un éclaircissement fait sans y toucher
  aurait rendu l'état invisible, en silence.
  ⚠️ Le compteur d'une bulle de passion (`.msg-tile-badge`) S'INVERSE avec le fond :
  il était blanc sur violet plein, il devient violet sur lavis.
  ② **« Publication » porte un sous-titre, et elle seule.** `CREATE_CHOICES`
  (`js/ui-v2-shell.js`) retrouve un champ `hint`, FACULTATIF : c'est la seule entrée
  dont le nom ne dit pas ce qu'elle accepte — « Bobine », « Story », « Audio /
  podcast » nomment déjà leur format. Le nom et son sous-titre sont empilés dans
  `.v2-sheet-text`, le conteneur que la feuille d'UI-3 utilise déjà pour la même
  paire : c'est LUI qui porte le centrage dans la ligne, pas le titre seul — deux
  nœuds centrés séparément se centreraient sur deux largeurs différentes.
  ③ **« Publier en tant que … » est retirée du composer**, avec sa classe
  `.v6-identite*`, ses règles CSS et `identiteCourante()`. Elle n'avait de sens que
  tant qu'on pouvait publier SOUS plusieurs identités ; depuis ADR-010/ADR-011 il n'y
  a qu'un profil personnel, l'expéditeur n'est plus un choix. Le seul choix restant —
  DANS QUELLE PASSION on publie — vit sur la ligne « Publier dans : ». Rien n'est
  masqué : le nœud n'est plus construit, et le moteur n'est pas touché (`publishPost`
  envoie toujours `state.user.general.username`, ce qu'un test vérifie).
  Verrous : `tests/e2e/cases-violet-leger.spec.js` (2 cas — seuils de luminance, de
  teinte et de contraste, jamais des valeurs hexadécimales, plus la distinguabilité
  de l'état coché) et une assertion de sous-titre dans `ui-v2-shell.spec.js`.
  Convention appliquée : les assertions dont la cible a disparu ont été RETOURNÉES,
  jamais vidées — `ui-v6-composer.spec.js` et `ui-v7-lot.spec.js` exigent désormais
  l'ABSENCE de la ligne d'identité, pour qu'un retour silencieux reste visible.
  ④ **ÉTENDU LE MÊME JOUR À LA FEUILLE « TROUVER UNE EXPÉRIENCE » DU FIL**, sur
  demande de Benjamin après essai réel : « dans le fil quand je clique sur un post
  → Trouver une expérience, je veux les mêmes onglets que dans (+), même design
  fond violet clair écriture violet foncé ; supprime les textes explicatifs et les
  emojis. » `js/ui-v3-passerelle.js` rend donc ses trois entrées comme la feuille
  « Créer » : une icône SVG violette dans une pastille blanche à la place de
  l'emoji (📍 🧑‍🤝‍🧑 ✨), le libellé seul et centré, aucune aide sous lui.
  ⚠️ **Les règles CSS sont PARTAGÉES, pas recopiées** : le bloc du 2026-08-31
  groupe désormais `#v2CreateSheet` et `#v3PassioSheet` (sept sélecteurs). Deux
  copies auraient divergé au premier retouchage — c'est exactement ce que le
  commentaire d'origine redoutait en sens inverse (il interdisait alors d'élargir
  la règle, parce que la feuille d'UI-3 portait emoji ET sous-titre : la
  contrainte tombe avec eux). **Ce qui n'a PAS changé : tout reste ancré à un
  IDENTIFIANT de feuille, jamais à `.v2-sheet-item` seul**, qui reste le socle
  générique de toute feuille basse à venir.
  ⚠️ `.v2-sheet-emoji` est **retirée** de `styles.css` : la feuille d'UI-3 en
  était l'unique consommatrice, et une règle qui survit à sa cible est un piège
  déjà payé ici (défaut ⑤ de l'audit du 2026-08-29).
  ⚠️ `#v3PassioSheet .v2-sheet-item-hint` est **conservée** alors qu'aucun nœud ne
  la porte plus — délibérément : le jour où l'un des trois libellés cesserait de se
  suffire, son aide naîtrait sinon dans le gris `--muted` du socle, éteint sur le
  lavis. C'est la seule exception, et elle est écrite dans le fichier.
  Verrou : `ui-v3-passerelle.spec.js`, cas ⑨ (absence d'emoji et d'aide, une icône
  SVG par entrée, lavis mesuré sur la case ET son titre, libellé centré). La sonde
  de lavis a déménagé dans `tests/e2e/lavis-helper.js` — trois suites la mesurent
  désormais, et deux copies de ces seuils auraient divergé.
