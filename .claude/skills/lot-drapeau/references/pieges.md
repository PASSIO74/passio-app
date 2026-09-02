# Pièges d'un lot sous drapeau, par famille

Tous mesurés, aucun déduit. Le récit complet vit dans `docs/lots-ui/`.

## Décorer une surface que le moteur repeint

- **Ne jamais cadencer un rendu sur `requestAnimationFrame`** : il ne part pas sur
  une page qui ne compose pas de frames (onglet en arrière-plan, headless, machine
  saturée). La décoration n'était jamais posée, en silence. Utiliser `setTimeout`.
- **Observer, ne pas envelopper**, quand le moteur réécrit `innerHTML` à chaque
  rendu (`openReels`, `renderMessages`, `renderIRL`). Un `MutationObserver` voit
  aussi les repeints partiels qu'une enveloppe de fonction rate.
- **Anti-boucle = signature d'état posée sur le nœud**, et n'écrire qu'au
  changement : l'observateur voit ses propres écritures.
- **Deux enveloppes de `renderIRL` s'empilent** : ne jamais remettre la fonction
  d'origine à `null` quand un sous-lot l'a recouverte — le rendu suivant plante sur
  un `null.apply`.

## Masquer plutôt que retirer

- **Masquer par CSS ancré à la classe racine**, jamais retirer du DOM : sinon le
  kill switch ne restitue pas l'état d'avant.
- **Borner le masquage au marqueur de décoration** (`data-v3-decore`, `data-v4a2`) :
  sans cette borne, une carte non décorée perd sa seule porte sans rien recevoir.
- Un `style="display:flex"` **inline** ne se bat qu'avec `!important`.

## Déplacer des nœuds

- **Déplacer, jamais régénérer** : reconstruire la chaîne HTML tue les `onclick`
  inline et les nœuds que des chargements asynchrones retrouvent par `id`.
- **Mémoriser les DEUX voisins** pour restituer : le suivant a pu déménager
  entre-temps.
- **Ne jamais s'ancrer sur `barre.nextSibling`** quand un autre lot s'y ancre :
  les deux se renvoient la balle, chacun réveillant l'observateur de l'autre.

## Ce qui n'est pas ce qu'on croit

- **`state` vaut `null`, pas `undefined`** : `typeof state === "undefined"` suivi
  d'un accès à une propriété lève un TypeError non rattrapé, qui tue la chaîne de
  reprise en silence.
- **`MY_UID` ne prouve pas qu'un compte existe** — seul un uuid Supabase le prouve.
- **`studioType`, `photoDataUrl`, `irlPassionFilters`… sont des `let` de portée
  script** : ils ne sont PAS des propriétés de `window`. Un test qui interroge
  `window.studioType` expire sans rien prouver.
- **Un TITRE n'est pas un identifiant d'écran** : renommer « Outils » en
  « Filtres » a fait disparaître une section entière, sans erreur.
- **Une preview de PR est une AUTRE origine** (`pr-232--passio-app.netlify.app`).

## Gardes

- **Garder la fonction qui ÉCRIT ne suffit pas : garder celle qui OUVRE LA PORTE.**
  `mePublish` était gardée, pas `meOpen` — qui déclenche la demande d'accès CAMÉRA.
- **Deux modules ne peuvent pas écrire la même surface** : poser un garde explicite
  (`ficheReprisParV4b()`, `cartesReprisesParV8()`) plutôt qu'espérer un ordre.
- **Un lot sans contenu éligible est indiscernable d'un lot cassé.** Avant de
  conclure « ça ne marche pas », vérifier qu'il existe une donnée qui déclenche.
