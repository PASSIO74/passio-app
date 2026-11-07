# 14 FIL ENTETE ET FENETRAGE

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

  **⚠️ En-tête du fil : plus de repli au défilement (2026-08-29).** Les passions
  (`.profile-strip`), les moods (`.mood-selector` — la rangée AFFICHÉE est
  `#feedIntentSelector`, l'historique `#moodSelector` restant `hidden`) et les stories
  (`.stories-row`) restent visibles en permanence. La bascule `.chrome-collapsed`
  (écouteur de défilement en fin d'`app-09`, règles en fin de `styles.css`) a été
  **supprimée**, code et CSS : sur ordre de Benjamin, après le défaut vécu « je descends
  puis je remonte, les profils et les moods ne s'affichent plus ». Cause identifiée et
  documentée dans `app-09` : le garde anti-oscillation du 2026-08-28 n'était relâché que
  par **deux événements de défilement consécutifs à la même position**, condition qu'un
  geste tactile ne remplit pas à la fin d'un mouvement — une fois replié, l'en-tête ne se
  rouvrait plus. Corriger le seuil aurait ramené l'oscillation (replier déplace
  `scrollTop`, l'ancrage de Chrome compense mal) : les deux exigences étaient
  contradictoires, on a retiré la bascule. Effet de bord bienvenu : plus aucune transition
  `max-height` ne tourne au-dessus de `#feedList` pendant le défilement — c'est ce
  mouvement sub-pixel qui faisait refuser des clics à Playwright (« element is not
  stable », cf. `tests/e2e/interactions.spec.js`). Non-régression :
  `tests/e2e/entete-fil-permanent.spec.js` (remplace `entete-fil-oscillation.spec.js`),
  vérifiée rouge sur l'ancien code avant d'être verte sur le nouveau.

  **⚠️ Les moods ne se lisent plus dans le DOM d'un rail MASQUÉ (2026-08-29, PR #198).**
  Deux défauts de la même famille, trouvés en consolidant une branche doublon. Racine
  commune : une décision de **rendu** et une décision de **classement** s'appuyaient sur
  le DOM de `#moodSelector`, que le lot UI-7 a masqué au profit de `#feedIntentSelector`.
  ① La pastille de mood dessinait une **capsule vide** : `<span class="post-mood-tag">`
  était rendu SANS condition alors que `moodTagLabel()` rend `""` pour le neutre, pour un
  mood inconnu et pour un mood absent. La classe portant `padding: 3px 9px`, `border: 1px`
  et un fond opaque, le résultat était une capsule creuse — **mesurée à 20 × 8 px**, pas
  déduite du CSS. Tous les posts venus de Supabase retombent sur `mood: "all"` : ils en
  portaient donc **tous** une. L'intention documentée était pourtant la bonne (« le neutre
  ne porte aucun badge ») ; seul le rendu la trahissait. `_moodTagHTML(mood)` rend la
  pastille, ou rien — **ne jamais réintroduire un `<span>` de mood sans condition**.
  ② Le **repli d'exploration** (« voici ce qui vit ailleurs », servi quand les passions
  suivies n'ont rien) construisait sa liste de moods admis en lisant les BOUTONS de
  `#moodSelector`. Or `irl` n'y a **jamais** eu de bouton : une publication « Rencontrer »
  venue d'une passion non suivie en était exclue. Portée exacte, à ne pas surestimer —
  elle restait visible dans sa propre passion, ce n'était pas « invisible partout » ; mais
  elle n'atteignait personne d'autre, soit exactement les gens qu'une invitation à se
  rencontrer vise. Le défaut n'était **pas atteignable avant #194**, qui a rendu
  « Rencontrer » choisissable dans le composer le matin même. La source de vérité est
  désormais `PASSIO_MOOD_LABELS`, qui reste une liste **BLANCHE** : un mood inconnu venu
  d'un client tiers n'entre toujours pas. Verrous : `tests/e2e/pastille-mood.spec.js` (3)
  et `tests/e2e/exploration-moods.spec.js` (4), éprouvés par mutation — rendre la source
  de vérité au DOM, ou la pastille sans condition, fait rougir 3 tests.

  **⚠️ Fenêtrage du Fil — `feed_window_v1`, COUPÉ par défaut (2026-08-29, PR #157).**
  Le fil ne monte plus toutes ses cartes : celles hors fenêtre sont déshydratées (contenu
  retiré, hauteur intrinsèque conservée) et réhydratées à l'approche. Moteur dans `app-02`
  (`feedWindowHydrate`, `feedWindowTeardown`, `feedWindowRememberScroll`,
  `feedWindowRestoreScroll`), suite `tests/e2e/feed-window.spec.js` (24).
  ⚠️ **Le piège qui décide de tout : réhydrater REMPLACE `card.innerHTML`.** Tout ce qu'un
  autre lot a injecté DANS la carte après rendu disparaît — la passerelle UI-3
  `[data-v3-bridge]` la première — alors que les marqueurs posés sur l'ÉLÉMENT
  (`data-v3-decore`) survivent. Et l'observateur d'UI-3 n'écoute `#feedList` qu'en
  `childList` **sans `subtree`** : remplacer le contenu d'une carte ne le réveille pas.
  La carte se retrouvait donc avec la porte neuve retirée ET l'ancienne toujours masquée
  par la règle liée à `data-v3-decore` — soit **aucune** porte vers l'IRL.
  `_feedWindowRedecorer(card)` retire les marqueurs devenus incohérents puis rappelle
  `PassioUIV3.decorateFeed()`, à la **seule sortie commune** de toutes les réhydratations
  (observateur, coupure du drapeau, redimensionnement). Son `catch` journalise par
  `diagLog` : un `catch` muet sur un chemin de rendu a déjà coûté six jours de fil vide.
  **Tout futur décorateur de carte doit être rebranché là**, sinon il disparaîtra au
  premier défilement.
  ⚠️ `window._feedScrollRestoring` n'a plus de consommateur en production depuis que #196
  a supprimé l'en-tête rétractable qu'il neutralisait. Il SURVIT à dessein : il marque
  « une restauration est en cours » et un test vérifie qu'il est bien relâché, ce qui
  prouve que la restauration se termine et ne fuit pas. Ne pas le retirer sans retirer
  aussi cette assertion.

  **⚠️ La sentinelle ne guette que ce qui peut arriver (2026-11-07).** Toujours posée,
  `#feedWindowSentinel` demandait en fin de liste un lot sur RIEN : `loadMoreFeedPosts`
  élargissait la fenêtre, `feedWindowPaintIncremental` n'avait aucune carte à ajouter
  (`n >= visible.length`) et `renderFeed` reconstruisait tout le fil (12 cartes, puis le
  complément différé). Sous Chromium 153 le lecteur était renvoyé vers la 11ᵉ carte ;
  sous Chromium 158, l'ancrage de défilement ramène la page en bas une fois la liste
  regonflée, la nouvelle sentinelle repart aussitôt — une reconstruction toutes les deux
  trames, sans fin. Deux gardes : `feedWindowTailHtml` ne pose la sentinelle que si
  `hasMore` (comme le bouton « Charger plus ») ; et un lot qui n'ajoute aucune carte
  (page serveur entièrement filtrée) pose `_feedWindowFrein`. Le frein part de la
  position ACTUELLE de la sentinelle (réobservée quand il se pose) et tombe quand une
  sentinelle ENCORE dans la page sort de la marge, quand le nombre de cartes peintes
  change, ou au démontage (`feedWindowTeardown`). Une sentinelle détachée par un repeint
  complet ne compte pas : l'observateur rend pour elle une dernière entrée « hors marge »
  qui n'est le geste de personne.
  ⚠️ **Reste, et c'est un préalable à la levée du drapeau** : un lot serveur stérile
  repeint encore tout le fil une fois — sous Chromium ≤ 157 (mesuré), et probablement
  sous WebKit (non mesuré), le lecteur est encore renvoyé vers la 11ᵉ carte, et ce saut
  lève le frein. Mesures, enquête CI et mutations : fiche « 🌀 LA BOUCLE DU BAS DU FIL »
  de `docs/journal/passions-fil.md`. Verrous : `feed-window.spec.js` — « en fin de liste,
  la sentinelle se tait », « un lot qui n'ajoute aucune carte ne se relance pas tout
  seul » (8 et 20 cartes), « un geste fait pendant un lot lent n'est pas perdu ».

