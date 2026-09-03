# 07 STUDIO MOODS

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

  **Moods du Studio alignés sur le rail d'intentions (2026-08-29), ACTIF, sans drapeau.**
  Le composer proposait encore les quatre moods d'origine — Création · Apprentissage ·
  Chill · Actu — alors que le Fil lit désormais Tous · Explorer · Apprendre · Idées ·
  Rencontrer : on publiait dans un vocabulaire, on lisait dans un autre. La rangée
  `#postMoodRow` (composer UI-6) porte maintenant **Idées ·
  Apprendre · Rencontrer · Tous**. Les emojis qui précédaient ces quatre libellés
  ont été retirés le 2026-09-03 avec toute la décoration d'interface : la table
  `PASSIO_MOOD_LABELS` ne porte plus que le mot, et `moodTagLabel` le rend seul. Tests : `tests/e2e/studio-moods.spec.js` (8).
  ⚠️ **Les LIBELLÉS changent, les VALEURS non** : `creation`, `learn`, `irl`, `all` sont
  écrites dans `posts.mood` et relues par `legacyMoodToFeedIntent` — renommer une valeur
  ferait perdre son classement à toute publication existante, et `publishPost` n'appelle
  `bumpQuest("publish")` que sur `creation`, qui reste donc le défaut (la quête `q1`
  s'arrêterait en silence sinon).
  ⚠️ **« Rencontrer » (`irl`) n'était choisissable NULLE PART avant ce lot** :
  `legacyMoodToFeedIntent` savait le traduire en `meet` et le fil savait l'afficher, mais
  aucune pastille ne le produisait — le bonus d'intention « Rencontrer » était donc
  structurellement inatteignable pour un contenu publié depuis l'app.
  ⚠️ **Pas de pastille « Explorer », délibérément** : cette intention se calcule côté
  LECTEUR dans `rankFeedPostsForIntent` (auteur non suivi, passion inconnue) et ne regarde
  jamais le mood. Une pastille y serait purement décorative — le piège ③ du lot UI-5.
  ⚠️ **Une seule table de libellés désormais**, `PASSIO_MOOD_LABELS` + `moodTagLabel()` /
  `moodShortLabel()` (app-02). Les deux copies locales avaient DIVERGÉ : le fil connaissait
  « irl » mais pas « actu » (tous les posts d'actualité du seed sortaient avec une étiquette
  VIDE), les bobines l'inverse (« irl » y sortait « Tout »). `all` reste hors table à
  dessein — le neutre ne porte aucun badge, sinon tous les posts venus de Supabase, qui
  retombent sur `mood: "all"`, en recevraient un.
  ⚠️ **Le chemin historique n'est PAS touché** : sous le kill switch des intentions
  (`passio_feed_intents_v1="0"`), `#moodSelector` garde ses quatre pastilles d'origine et
  `_moodVisible` son comportement à l'octet près — un post `irl` y reste invisible, comme
  avant, et le test « ancien filtre mood inchangé » de `feed-intents.spec.js` continue de
  l'exiger. Conséquence assumée : un « Rencontrer » publié aujourd'hui disparaît de la vue
  de son auteur s'il coupe les intentions. Élargir `_moodVisible` aux moods sans pastille
  était le correctif naturel — il a été écarté parce qu'il change le legacy gelé.
  ⚠️ `chill` et `actu` ne sont plus publiables mais restent affichables (des milliers de
  posts les portent). Un brouillon plus ancien qui en porte un est ramené sur le neutre par
  `normalizeStudioMood` (app-06) : sans elle, `loadDraft` rendait une rangée SANS pastille
  active — état muet, republié en silence.

## Le mood sort du repli « Options » (2026-09-03)

Demande de Benjamin : « dans Créer, ne mets pas en option le choix de mood ;
affiche-le directement sélectionnable sous le choix de passion. »

`js/ui-v6-composer.js` ⑤ rangeait `#fieldMood` dans un `<details class="v6-affiner">`
intitulé « Options », replié par défaut. Conséquence mesurable : personne ne
l'ouvrait, donc **toute publication partait avec le défaut `creation`** — et c'est
ce mood qui décide de l'intention sous laquelle le fil classe la publication
(`legacyMoodToFeedIntent`). Un choix qui pilote le classement n'est pas une option.

Le champ est désormais déplacé **directement dans `#v6Composer`, juste après
`#fieldPassion`** : où je publie, puis sous quelle envie, d'un seul trait. Le
`<details>` est retiré AVEC tout ce qui le visait — le nœud, sa classe
`.v6-affiner`, ses cinq règles CSS et le mot « Options » (piège maison : *une règle
qui survit à la disparition de sa cible*). `#fieldMood` reprend sous
`:root.passio-ui-6` la peau calme de la ligne « Publier dans : … » au-dessus.

⚠️ **Rien du moteur ne bouge** : `studioMood`, `PASSIO_MOOD_LABELS`, les quatre
valeurs publiées et le défaut `creation` sont inchangés. Le kill switch UI-6 rend
toujours le champ à sa place d'origine dans `#screen-studio`.

⚠️ **Trois suites s'appuyaient sur le repli** et ont été retournées, jamais vidées :
`ui-v6-composer.spec.js` (l'ordre des enfants attend `mood` à la place d'`affiner`,
et exige `.v6-affiner` à 0, le mood VISIBLE, cliquable sans un geste préalable, et
placé après la passion), `studio-moods.spec.js` (son helper `ouvrirStudio`
dépliait le `<details>` ; il EXIGE maintenant la visibilité de la première
pastille — sans quoi un retour du repli laisserait la suite verte sur des pastilles
présentes dans le DOM mais invisibles), et `ui-v7-lot.spec.js` (le mot « Options »
n'existe plus dans le vocabulaire gouverné par UI-7).
