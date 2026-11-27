# Sondage en bobine — 2026-11-27

Dernier point de la liste « c'est quoi la suite ? » (Benjamin : « Ok fait tout »), laissé hors
de la fiche 34 parce qu'il demande une table en base. Le sticker 📊 des stories (fiche 32, lot C)
s'ouvre aux bobines.

## État : ALLUMÉ le 2026-11-27 (migrations appliquées, mesurées en base)

- Le 2026-11-27, depuis la session (à la demande de Benjamin, « Fait toi même »), par
  `appliquer-migration.mjs` : `migration_story_sondage_score_auteur_2026-11-27.sql` (journal n°95),
  puis `migration_bobine_sondage_2026-11-27.sql` (journal n°96). Mesuré ensuite au canal ① : table,
  RLS, deux policies, trois fonctions DEFINER à `search_path` vide, déclencheurs avec leurs arguments,
  hors publication, score du point de vue de l'auteur — dans les deux fonctions de résultats.
- Puis `BOBINE_SONDAGE_ACTIF = true` (PR à part). Le drapeau ne sait qu'ENLEVER la création :
  coupures `BOBINE_SONDAGE_ACTIF = false` (pour tous), `localStorage.passio_bobine_sondage = "0"` ou
  `window.PASSIO_BOBINE_SONDAGE = false` (un appareil). Le lecteur reste branché quoi qu'il arrive.
- Ce qui suit — les étapes d'allumage — est gardé pour l'histoire.

### Allumer (dans cet ordre, jamais l'inverse)

0. **D'abord, et indépendamment du sondage des bobines** : appliquer
   `migrations/migration_story_sondage_score_auteur_2026-11-27.sql` — correctif de sécurité du sondage des
   STORIES, déjà en ligne (le score y était un oracle, voir `docs/journal/serveur-securite-base.md`).
1. Appliquer `migrations/migration_bobine_sondage_2026-11-27.sql` depuis le poste
   (`npm run migration:appliquer -- migrations/migration_bobine_sondage_2026-11-27.sql`).
2. MESURER en base (canal ①), pas le tableau imprimé :
   `select to_regclass('public.bobine_sondage_votes'), to_regprocedure('public.bobine_sondage_resultats(text)');`
3. Passer `BOBINE_SONDAGE_ACTIF` à `true` (app-08) dans une PR à part. — **fait le 2026-11-27.**

## Ce qui change (client)

- **Création** : en mode bobine, le panneau des stickers propose 📊 Sondage sous le drapeau. Un
  seul par bobine (`_meStickerSondage`, partagé avec la story ; le message dit « par bobine »).
  Il voyage dans `posts.overlays`, comme la Question.
- **Lecteur** : `_storyOverlaysHtml(overlays, { bobine: true })` rend la carte (une seule), échappée.
  Hors des deux lecteurs (aperçu, partage) elle n'est pas rendue : personne n'y saurait à qui va le vote.
- **Vote** : `bobineVoterSondage` — l'INTENTION part (`insert({ post_id, choix })`, deux colonnes,
  rien d'autre), le verdict de la base décide : 23505 (déjà voté) montre les résultats ; table
  absente et refus se DISENT et laissent revoter. Ma bobine : pas de vote, les résultats. Bobine
  d'exemple : le vote reste sur l'appareil (`state.user.sondagesLocaux`), rien ne part.
- **Résultats** : `bobineSondagePeindre`, appelée quand la bobine devient ACTIVE (`playReelAt`,
  app-05) et après un vote — une requête par bobine à sondage REGARDÉE, jamais une par bobine de
  la liste. La base ne rend les pourcentages qu'après le vote, ou à l'auteur.
- Typographie : espace insécable devant « ? » et « ! » dans la question d'un sondage (story comme
  bobine) — le point d'interrogation partait seul à la ligne.
- **Taille bornée** (`meEchelleMax`, app-08) : un sticker ne dépasse pas l'échelle que l'éditeur permet
  (5), et un SONDAGE pas 1,6 — au rendu (valeur forgée) comme au pincement. Agrandi à toute la scène, chacune
  de ses réponses couvrait la moitié de l'écran : un toucher de pause devenait un vote, lu par l'auteur.

## Invariants

- **La bobine d'un vote se lit dans `reelsState.items`** (la ligne du serveur), par l'identifiant de
  la carte `.reel-item[data-post-id]` — jamais dans l'overlay, qu'un autre compte a écrit. Lecteur
  fermé (`reelsState.open` faux) : rien ne part.
- **Le clic d'une réponse est pris par `_storyStickersBrancher`** (document, phase de capture,
  `stopPropagation`) : il n'atteint ni la bascule lecture/pause de la carte, ni le double toucher
  « j'aime » de `#reelsList`. Tout nouveau sticker cliquable passe par ce même écouteur.
- **Le drapeau ne sait qu'ENLEVER** la création. Il ne lève aucune règle : ce sont les policies de
  `bobine_sondage_votes` qui disent qui vote (bobine VISIBLE, à sondage, pas la sienne).
- Serveur : fiche « 📊 SONDAGE DES BOBINES » de `docs/journal/serveur-securite-base.md`.

## Deux tests existants changent d'attente, à dessein

- `tests/e2e/story-stickers.spec.js` ⑧ affirmait « jamais rendu dans une bobine ». Il vérifie
  désormais : rendu UNE fois, en story comme en bobine, hostile = inerte dans les deux, et non
  rendu hors des deux lecteurs.
- `tests/e2e/bobine-montage-video.spec.js` ⑤ : même ligne (« le sondage reste story seulement »).

Verrous : `tests/e2e/bobine-sondage.spec.js` (5), `tests/sql/migration-bobine-sondage.test.sh`
(41 contrôles, 94 cas par identité, dont l'oracle par blocage),
`tests/sql/migration-story-sondage-score-auteur.test.sh` (16 contrôles, 40 cas).

## Non éprouvé

- Aucun vote réel : la table n'existe pas en production. Les tests du client répondent par un
  faux client ; le banc SQL tourne sur un PostgreSQL 16 jetable (production : 17).
- Ni PostgREST, ni comptes réels, ni téléphone.
