# 29 — La barre du bas v2 naviguait deux fois par toucher en production (2026-11-12)

## D'où ça vient

Relevé par le sous-agent `audit-passio` le 2026-11-12, pendant la PR #837 (la grille des emojis vide quand la page arrive lentement), en lisant le code. Re-mesuré ici, sur l'artefact construit puis en production, avant de toucher quoi que ce soit.

## Le défaut

- `js/app-08-ui-modals-tour.js` (« NAV CLICKS + CLAVIER ») exécute AU NIVEAU DU FICHIER `$$(".nav-item").forEach(…)` : un `click` et un `keydown` (→ `goTo(s)`, ou `openReels()`) sur chaque `.nav-item` présent à ce moment-là.
- `js/ui-v2-shell.js` construit la barre v2 (`#appNavV2`, boutons `.nav-item.nav-v2-item`) à `DOMContentLoaded`, avec SES écouteurs (`goToScreen`, `track("ui_v2_nav")`, un `keydown` pour les `div`). Son commentaire supposait que « le listener historique n'a jamais vu ces nœuds (créés après son exécution) ».
- C'est vrai en développement : les 9 fichiers du bloc app sont des balises placées AVANT ui-v2. C'est faux en production : `scripts/build.js` sort le bloc en 9 scripts insérés par un chargeur, qui tournent d'ordinaire APRÈS `DOMContentLoaded`. app-08 trouvait la barre v2 déjà construite et la branchait une seconde fois.
- L'ordre inverse existe aussi en production (page qui arrive lentement, #837 ⑤ bis) : la barre naît alors après app-08 et n'a qu'un écouteur. Le défaut était donc le cas ORDINAIRE, pas l'exception.

Ce que ça faisait, à chaque toucher sur Découvrir, Rencontrer, Messages ou Profil :

- **deux `goTo`, deux entrées d'historique au même hash**. Le premier retour (bouton Android, glissement Safari, `history.back()`) atterrissait sur la copie : `popstate` → `goTo` du même écran, rien de visible. Il fallait deux retours ;
- le plafond d'historique de WebKit (~100 écritures par 30 s, `_HIST_MAX = 90` dans app-02) s'épuisait deux fois plus vite ;
- un double rendu de l'écran, **deux `screen_view` de télémétrie** et deux parcours `nav_*` de perf-ios ;
- au clavier, Entrée sur un onglet naviguait aussi deux fois ; et le `keydown` d'app-08, qui fait `preventDefault()` sur Entrée et Espace, empêchait l'activation native du bouton « Créer » (un `<button>` sans `data-screen`) : **la feuille « Créer » ne s'ouvrait plus au clavier**.

Toute la suite `ui-v2-shell.spec.js` restait verte : elle tourne sur les fichiers de développement, et un toucher doublé n'y laisse rien de visible.

## Les mesures (avant)

Banc autonome (scratchpad de la session : Playwright en bibliothèque, serveur local aux en-têtes de production, proxy mort, worker bloqué ; Chromium au gabarit Pixel 7, WebKit au gabarit iPhone 13, 390 × 844). On compte les appels à `goTo` (enveloppe posée après le démarrage, relue au global par app-08 comme par ui-v2), les `pushState`, `history.length`, puis l'écran après un retour.

| Où | Barre | `goTo` par toucher | `pushState` | historique | 1er retour | Entrée sur un onglet | « Créer » au clavier |
|---|---|---|---|---|---|---|---|
| Production b918d9a9, 4 ouvertures (2 Chromium, 2 WebKit) | v2 | 2 | 2 | +2 | reste sur Rencontrer | 2 `goTo` | ne s'ouvre pas |
| Production 0677abc2, 2 ouvertures | v2 | 2 (+ 2 `screen_view`) | 2 | +2 | reste sur Rencontrer | 2 `goTo` | ne s'ouvre pas |
| Artefact, 2 sur 2 par moteur | v2 | 2 | 2 | +2 | reste sur Rencontrer | 2 `goTo` | ne s'ouvre pas (Entrée, Espace) |
| Artefact, 2 sur 2 par moteur | historique (coupure) | 1 | 1 | +1 | le fil | 1 | — |
| Développement, 2 sur 2 par moteur | v2 | 1 | 1 | +1 | le fil | 1 | s'ouvre |
| Développement, 2 sur 2 par moteur | historique | 1 | 1 | +1 | le fil | 1 | — |

La prémisse est relevée au `load` du script d'app-08, qui part juste après son exécution : la barre v2 existe déjà sur l'artefact et en production (page `interactive`), pas en développement (page `loading`).

**Chez les vrais visiteurs** (canal ①, `telemetry_events`, lecture seule, les trois jours disponibles au 12/11) : 22 touchers publics sur la barre v2 (`ui_v2_nav`, 8 sessions), et 24 `screen_view` publics en double à moins de 100 ms (9 sessions sur 11), dont 22 à côté d'un `ui_v2_nav`, sur les quatre seuls écrans de la barre. Côté équipe : 55 touchers, 52 doublons. Le compte public des `screen_view` était gonflé de 24 sur 65. Toutes les versions relevées sont touchées (36b778d1 → 9d14c999). Depuis quand, ce n'est pas mesuré : le bloc app est injecté par un chargeur depuis le 2026-07-03 et la v2 est active par défaut depuis le 2026-08-26, donc vraisemblablement depuis ce jour-là.

## Le correctif

- **app-08 ne branche plus que la barre historique : `$$("#appNav .nav-item")`.** Les boutons de `#appNavV2` n'ont que les écouteurs que ui-v2 leur pose, dans les deux ordres de chargement. La barre v2 est insérée À CÔTÉ de `#appNav`, jamais dedans, et c'est le seul autre endroit où naissent des `.nav-item`.
- Les commentaires suivent : celui de ui-v2-shell.js, dont l'hypothèse ne valait qu'en développement, et celui du délégué clavier générique d'app-08, qui exclut toujours les `.nav-item` (chacun a son écouteur dédié, dans app-08 ou dans ui-v2).
- Rien d'autre ne bouge : ni `goTo`, ni l'historique, ni la barre v2.

**Survivants cherchés** (même classe : un écouteur posé au niveau du fichier, dans le bloc app, sur des nœuds qu'un module de fin de page aurait déjà construits) : les trois autres boucles de ce genre (`$$(".mood-btn")` d'app-04, `$$("#studioTypeTabs .studio-type")` et `$$("#postMoodRow .pill")` d'app-06) visent du balisage statique qu'aucun module `ui-v*` ne crée ni ne déplace. Aucun survivant.

## Les verrous

`tests/e2e/app-scripts-par-fichier.spec.js` ⑪ ⑫. Cette suite est au socle WebKit de la CI (job bloquant) ET dans les shards Chromium : le verrou tourne sous les deux moteurs sans toucher `playwright.config.js`, qui est un chemin critique (contre-revue humaine). Ses cas sont posés à la fin du bloc « sans worker », loin de ce que modifie #837.

- Le banc sert le vrai artefact, avec les en-têtes de production. **app-08 est RETENU jusqu'à `DOMContentLoaded`** (`page.route` + `exposeFunction`) : l'ordre de la production devient déterministe, et la prémisse `__barreV2AuApp08 === true` le vérifie.
- ⑪ barre v2 : un toucher (`tap` au gabarit iPhone, clic sous Chromium) = `["irl"]`, `["#irl"]`, historique +1 ; un retour ramène au fil ; Entrée sur l'onglet = un `goTo` ; Entrée et Espace sur « Créer » ouvrent la feuille. Mesures en `expect.soft` : un rouge dit tout ce qui casse.
- ⑫ barre historique (coupure `passio_ui_v2 = "0"`) : un toucher = un `goTo`, une entrée, un retour au fil, Entrée = un `goTo`.
- **Mutations**, sous Chromium et WebKit : `.nav-item` seul → ⑪ rouge sur ses huit mesures, ⑫ vert ; un sélecteur qui ne trouve plus `#appNav` → ⑫ rouge (« la barre historique mène à Rencontrer »), ⑪ vert.

Deux pièges du banc, vus sous WebKit sur un poste chargé par d'autres sessions :

- un retour sans `popstate` en 5 s, 2 fois sur ~70 : l'attente passe à 15 s, et le rouge dit où en était la page. La mutation n'en dépend pas : sous le défaut, le retour atterrit bien, sur la copie ;
- un `tap` arrêté 15 s sur « waiting for element to be visible, enabled and stable », sans aucune relance (3 sur 10). C'est l'attente de stabilité de Playwright, qui compte sur `requestAnimationFrame`, que ne rend pas une page sans tête qui ne compose plus. Le geste est maintenant `force`, APRÈS un `toBeVisible` : toujours un vrai toucher au centre de l'élément, et le moteur fait son propre test de cible, donc un élément recouvert ne navigue pas et le cas rougit.

## Les mesures (après)

- Le banc autonome : 16 scénarios sur 16 (2 cibles × 2 barres × 2 moteurs × 2 essais) à un `goTo`, un `pushState`, historique +1, retour au fil ; « Créer » s'ouvre à Entrée et à Espace sur l'artefact.
- ⑪ ⑫ : 20 sur 20 par moteur à 2 workers (CI), après les deux durcissements. La suite entière : 14 sur 14 sous WebKit.
- Suites voisines sur les fichiers de développement (20 fichiers : barre du bas, navigation, historique, artefact) : 237 sur 239. Les deux rouges sont hors sujet : ⑤ (`loading` au lieu d'`interactive`, l'intermittent que #837 assouplit) et un clic du bandeau supérieur de `badge-messages` sous charge (18 sur 18 seul). ④ (le vrai worker) a rougi une fois sous charge, 4 sur 4 seul.
- `npm run verif` vert.
- La preuve en production est sur la PR (commentaire), relevée par le même banc contre https://passio-app.netlify.app/?equipe=1.

## La règle

**Un écouteur posé au niveau du fichier, dans le bloc app, se borne à son CONTENEUR (un identifiant), jamais à une classe seule.** En production le bloc app tourne d'ordinaire APRÈS les modules de fin de page : une classe partagée attrape aussi ce qu'ils ont déjà construit, avec leurs propres écouteurs. Et un défaut qui ne vit que dans cet ordre-là se prouve sur l'ARTEFACT, jamais sur les fichiers de développement.
