# 04 UI4A4 A UI7 ET UI4A5

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.


  **Lots UI-4A4, UI-5, UI-6, UI-6A et UI-6B (2026-08-28) — tous ACTIFS PAR DÉFAUT**, chacun
  coupable seul (`localStorage.passio_ui_4a4|5|6|6a|6b = "0"`, ou le `window.PASSIO_UI_*`
  correspondant à `false`). Aucune valeur positive n'active, rien n'est écrit dans
  `localStorage`.
  - **UI-4A4** — « Rencontrer » a trois cases (Liste · Carte · Outils) et les quatre
    intentions quittent la tête pour le panneau. `js/ui-v4a4-outils.js`, tests
    `ui-v4a4-outils.spec.js`. ⚠️ Dans le panneau, les intentions sont **RECONSTRUITES**
    par UI-4A0 (`PassioUIV4A0.renderIntentsInto`), jamais déménagées : `#ctxToolsBody` est
    réécrit en entier à chaque rendu, que le clic sur une intention déclenche justement —
    une chip déplacée serait arrachée **par son propre clic**. Règle inverse pour
    `#irlToolsBtn`, qui est *déplacé* : le reconstruire ferait écrire `_updateIrlFiltersBtn`
    dans une pastille invisible. Et « Outils » **n'est pas un onglet** (il ouvre un
    dialogue) : il garde son rôle de bouton et se place *à côté* du groupe `role="tab"`.
    ⚠️ La refonte du panneau `.ctx-*` est bornée à `max-width: 1023px` : non bornée, elle
    décollait le **rail latéral** du bord droit au-delà de 1024 px, en silence. Et elle
    centre par `margin-inline: auto`, jamais par `translateX(-50%)` — `transform` est déjà
    occupée par l'animation d'ouverture.
  - **UI-5** — bobines connectées au réel. `js/ui-v5-bobines.js`. Toute sortie **ferme le
    lecteur d'abord** ; « Ça m'intéresse » écrit un signal durable dans
    `state.user.passionSignals`, lu par `feedPostScore`.
  - **UI-6 (§9)** — le composer ne demande plus de choisir un format. `js/ui-v6-composer.js`.
    ⚠️ **Le piège qui décide de tout** : `studioType` est la SEULE source de vérité de ce qui
    est publié — `publishPost` type le post et remplit `image`/`video` d'après elle, jamais
    d'après le média réellement attaché. Masquer les onglets sans rien d'autre publierait un
    post « texte » avec la photo perdue **EN SILENCE**. Le bouton média unique se contente
    donc de déclencher `#photoInput` / `#videoInput`, dont les gestionnaires **existants**
    fixent déjà `studioType`. §11 au passage : « +10 pts » quitte le bouton et
    `.profile-chips-row` est masquée — seul l'AFFICHAGE change, `grantReward` tourne toujours.
  - **UI-6A (§10)** — inbox Messages : titre, « + » groupant les deux gestes, recherche
    dessous, Passio devant l'aperçu. `js/ui-v6a-messages.js`. ⚠️ `renderMessages()` repart de
    zéro (`innerHTML`) à chaque envoi, réception et frappe, et **sort tôt** quand l'écran
    n'est pas actif : la décoration passe par un MutationObserver + signature par carte.
  - **UI-6B (§11)** — profil : le point d'édition et surtout **Actif / Activer**.
    ⚠️ Son renommage « Mes Passio » → « Mes passions » (`renommerSection`) a été **SUPPRIMÉ le
    2026-09-03** : le markup dit « Gérer mes passions » de lui-même, et `#nouveauProfilLien`
    étant devenu une BULLE, le `lien.textContent =` du lot en aurait détruit les enfants.
    UI-6B ne renomme plus rien (fiche 18).
    `js/ui-v6b-profil.js`. ⚠️ Ce lot répare un défaut réel : `switchToProfile()` — la seule
    fonction qui change l'identité active — était **définie et appelée par personne**, un clic
    sur une carte de profil n'agissant que sur le filtre d'affichage (`toggleProfileSelect`).
    D'où deux conséquences : le bouton « Activer » est ce chaînon manquant, et son clic
    **doit stopper sa propagation**, sinon activer une identité basculerait aussi ce filtre.
    ⚠️ **Amendement du 2026-08-29, sur ordre de Benjamin (« un petit onglet très discret,
    crayon, en haut à droite »)** : le bouton « Modifier » pleine largeur posé sous les
    statistiques est devenu un **crayon** (`#v6bModifier`, icône seule) ancré au coin haut
    droit de `#mainProfileCover`. Trois choses à savoir avant d'y toucher. ① Le moteur ne
    change pas : le crayon appelle toujours `openMainProfileMenu`, avec ses quatre entrées.
    ② Le « ⋯ » historique occupait **exactement ce coin** et ouvrait **ce même menu** — deux
    boutons identiques côte à côte : il est donc **masqué en CSS** (`:root.passio-ui-6b
    #screen-profiles .profile-dots-btn.on-cover { display: none }`), jamais retiré du DOM,
    de sorte que le kill switch le rende. ③ Le rond VISIBLE fait 30 px mais la cible tactile
    se mesure sur la **boîte** du bouton : celui-ci garde ses 44 px et c'est un `::before` en
    `inset: 7px` qui peint la pastille — même patron que la pastille d'UI-3A.
  ⚠️ **Trois règles communes à ces modules**, payées à l'écriture : ① un **verrou de coupure**
  dans la fonction de décoration (`if (!actif()) return;`) — un rendez-vous armé AVANT la
  coupure survit à l'arrêt de l'observateur et reconstruit la surface juste après sa dépose,
  le kill switch paraissant sans effet ; ② rendre des nœuds dans un hôte encore **détaché**
  les laisse invisibles aux synchronisations qui balaient le document ; ③ `photoDataUrl`,
  `studioType`, `irlPassionFilters`… sont des `let` de **portée script** : ils existent comme
  identifiants globaux mais **ne sont pas** des propriétés de `window` — `window.studioType`
  vaut toujours `undefined`, et un test qui l'interroge expire sans rien prouver.

  **Lot UI-7 — cohérence des interfaces (2026-08-28), ACTIF PAR DÉFAUT.**
  `js/ui-v7-lot.js` + bloc « PASSIO UI V7 » en fin de `styles.css`, tests
  `tests/e2e/ui-v7-lot.spec.js` et `tests/e2e/ui-v7-bobine-camera.spec.js`.
  Coupure unique : `localStorage.passio_ui_7="0"` ou `window.PASSIO_UI_7=false`.
  Périmètre : ① **vocabulaire visible** (« Mes passions » — devenu « Gérer mes
  passions » sur le profil le 2026-09-03, fiche 18 —, « Ajouter une passion »,
  « Passion : X », « Filtres » à la place d'« Outils » sur Rencontrer, « Mes inscriptions »,
  « Options », « Changer de profil ») — les **identifiants** (`data-intent`, `data-tab`,
  `data-irlfilter`) ne bougent pas ; ② **Rencontrer** : « Détails », « Je viens » →
  « Inscrit ✓ », ligne « N participants · N places restantes » **calculée**, passion
  abrégée à l'affichage seul (`libelleCourt`, « Yoga » et non « Yoga / Bien-être »),
  « Choisir une ville » et un geste explicite `useMyPositionForIrl()` — toujours **aucun
  GPS automatique** ; ③ **Fil** : les passions et les stories sont réduites d'environ
  −25 % — ⚠️ **rectifié le 2026-08-29 sur demande de Benjamin** (« remets les profils du
  fil comme avant, en bulle mais plus petite ») : ce lot les avait transformées en
  pastilles « emoji + libellé » revenant à la ligne, avec un bouton « Autres ». Elles
  redeviennent des **bulles** (vignette photo ronde + pastille emoji + libellé dessous)
  dans une rangée qui **défile horizontalement**, avec une vignette de 34 px au lieu de
  46. C'est du CSS SEUL (`:root.passio-ui-7 #screen-feed .profile-tile*`) : le bouton
  « Autres » et son mécanisme JS ont été supprimés, `renderProfileStrip` n'est pas touché,
  et couper le lot rend les 46 px d'origine — ce que la suite vérifie. Aussi :
  intentions renommées **Tous · Explorer · Apprendre · Idées · Rencontrer** ; ④ l'icône
  **Messages quitte la barre supérieure** (`#msgDot` reste dans le DOM, masqué —
  `renderMsgBadge` continue d'y écrire) ; ⑥ **Profil** à trois onglets nommés
  (Publications · Activités · À propos), les cinq onglets d'icônes redevenant des
  sous-filtres ; ⑧ **Bobine** : après l'aperçu, « Recommencer » / « Continuer », puis une
  feuille légère (description · passion · couverture · activité facultative) qui
  renseigne `meState.details` et appelle `mePublish()` — **aucun second moteur de
  publication**.
  ⚠️ **Six pièges de ce lot.** ① `renderProfileStrip` réécrit `#profileStrip` **en
  entier** (cache `_lastHtml` compris) : rien d'injecté dans la rangée n'y survit, tout
  ajout doit être posé en **frère** — c'est pourquoi la compacité des passions passe
  aujourd'hui par le CSS seul. Corollaire de mesure : `.profile-tile-avatar` porte
  `transition: all 0.25s`, donc une largeur relevée dans la foulée d'un changement de
  drapeau est encore à mi-course (piège vécu en écrivant le test du kill switch). ② Au Profil, c'est l'**ORDRE d'origine de l'écran** qui est mémorisé, pas le
  « frère suivant » de chaque bloc — ce frère déménage lui aussi, et rendre un bloc
  « avant lui » restituait un ordre inventé. ③ ~~Le bloc CSS UI-7 vient **après** les règles
  de repli au défilement, à spécificité **égale** : sans réécrire
  `.app-main.chrome-collapsed …` dans le bloc, l'en-tête du fil cessait de se replier.~~
  **CADUC depuis le 2026-08-29 : le repli au défilement a été RETIRÉ** (voir ci-dessous).
  ④ Les intentions sont en `flex: 1 1 auto` et non `1 1 0` : à colonnes égales,
  « Rencontrer » et « Apprendre » se faisaient couper pendant que « Tous » laissait du vide.
  ⑤ `renderProfileEvents` listait `state.seed.events.slice(0,3)` — le contenu de
  démonstration — sous le titre « Événements participés » : la section ne montrait donc
  **jamais** une participation. Elle lit désormais `allEvents()` + `_isMyEvent` + `myRsvp`
  (`_myProfileEventsHTML`, app-06). ⑥ `styles.css` est en **CRLF** : une réécriture du
  fichier en mode texte Python le convertit en LF et produit un diff de 10 800 lignes —
  n'y écrire qu'en **binaire**, ou en ajout.

  ⑦ **Un TITRE n'est pas un identifiant d'écran.** `ui-v4a4-outils.js` décidait
  s'il devait injecter les quatre intentions en cherchant « IRL » dans
  `#ctxToolsTitle`. Renommer ce titre en « Filtres » a suffi à faire disparaître
  toute la section — sans erreur, sans test rouge ailleurs, sans rien dans la
  console. `ContextualTools` publie désormais l'écran courant comme une DONNÉE :
  `ContextualTools.pageType()` et `#ctxToolsRoot[data-ctx-page]`. Même famille de
  piège pour l'aide contextuelle : `montrerHint` refuse une cible sans
  `offsetParent`, donc déplacer une ancre dans un panneau masqué éteint l'aide en
  silence. ⚠️ Cette phrase citait « l'onglet « À propos » » comme repli : cet onglet
  n'existe plus (ADR-011), et depuis le 2026-09-03 la cascade compte QUATRE ancres testées
  sur `offsetParent` — `#nouveauProfilLien`, `#v6bModifier`, `.profile-dots-btn`, puis le
  rail en dernier ressort (fiche 18, piège ③).

  **Lot UI-4A5 — « Filtres » est une VUE de Rencontrer (2026-08-29), ACTIF PAR DÉFAUT.**
  `js/ui-v4a5-filtres.js` + bloc « PASSIO UI V4 — lot UI-4A5 » en fin de `styles.css`,
  tests `tests/e2e/ui-v4a5-filtres.spec.js` (11). Coupure unique :
  `localStorage.passio_ui_4a5="0"` ou `window.PASSIO_UI_4A5=false`. Demandé par Benjamin
  après essai réel : « les bulles de profil dans le filtre, et l'onglet Filtres fait comme
  pour Liste et Carte : quand on clique dessus tu n'ouvres plus un panel mais tu affiches
  dessous tous les choix. » La troisième case cesse donc d'ouvrir un dialogue et devient
  une **troisième vue exclusive** : la liste passe la main, et tout le choix s'affiche en
  ligne — bulles de passion, quatre intentions, ville, « Mes événements / Mes inscriptions »,
  puis le calendrier, le curseur de distance et la plage horaire. Le pied porte
  « Tout effacer » et « Voir les N événements », qui ramène à la liste.
  **Aucun moteur n'est écrit ici** : `#irlPassionRow` et les volets `.irl-ftabs` /
  `#irlPane*` sont DÉPLACÉS (les moteurs les retrouvent par leur `id` et continuent d'y
  écrire à chaque `renderIRL`), les intentions sont construites par
  `PassioUIV4A0.renderIntentsInto`, et les items ville/mes-événements sont rendus par la
  nouvelle `ContextualTools.renderInto(hôte, config)` — même `itemHtml`, même échappement,
  même délégation `[data-irlfilter]`.
  ⚠️ **Six pièges de ce lot.** ① Le clic est intercepté en phase de **CAPTURE** sur
  `document` avec `stopPropagation()` : c'est le SEUL moyen de neutraliser l'`onclick`
  inline `ContextualTools.open('irl', this)` sans le retirer — un écouteur posé sur le
  bouton lui-même s'exécuterait APRÈS l'attribut, l'ordre en phase « at target » étant
  celui de l'enregistrement. L'attribut reste intact et redevient actif à la coupure.
  ② Le **calendrier n'était peint qu'à l'ouverture** de `#irlFiltersPanel`, que ce lot ne
  passe plus jamais : sans un appel explicite à `_renderIrlInlineCal()` à l'ouverture de
  la vue, le volet Date s'affiche VIDE, sans erreur ni test rouge ailleurs. ③ Les sections
  d'`irlToolsSections()` portent désormais un `id` (`ville`/`affiner`/`miens`) et le lot
  retire « affiner » par cet **identifiant**, jamais par son titre — filtrer sur un
  libellé, c'est le piège d'UI-4A4 (renommer « Outils · IRL » en « Filtres » avait fait
  disparaître une section entière, en silence). ④ La sélection des onglets se dispute avec
  UI-4A3, qui repose `aria-selected` à chaque rendu : on le **ré-aligne** après coup et
  seulement quand la valeur diffère. UI-4A3 n'observe que les enfants directs de
  `#screen-irl` et jamais les attributs — aucune de ces écritures ne le réveille, donc
  aucun aller-retour. ⑤ Le panneau est **masqué, jamais retiré**, parce qu'il héberge des
  nœuds déplacés dans lesquels le moteur continue d'écrire ; et la coupure **restitue
  avant de supprimer**, sinon la suppression les emporterait. ⑥ Ce lot **réécrit deux
  règles d'UI-7 (§2)**, qui donnaient volontairement à « Filtres » une allure différente
  parce qu'elle ouvrait un dialogue : elle redevient une case à égalité de largeur, sans
  séparateur. Les sélecteurs gagnent par la position — le bloc UI-4A5 doit rester le
  DERNIER de `styles.css`.
  Convention de test appliquée : `contextual-nav`, `irl`, `ui-v4a2-cartes`, `ui-v4a3-vue`,
  `ui-v4a4-outils` et `ui-v7-lot` posent au boot `passio_ui_4a5="0"` et gardent TOUTES
  leurs assertions ; la cohabitation est prouvée à part.

  > **⚠️ CADUC EN PARTIE DEPUIS LE 2026-09-04.** La vue Filtre a été REFONDUE
  > (quatre sections nommées, bouton violet FIXE, « Filtre » au singulier) :
  > voir **`docs/lots-ui/20-PAGE-FILTRE-RENCONTRER-2026-09-04.md`**, qui est
  > désormais la référence. Ce qui suit décrit l'état d'AVANT la refonte et
  > reste ici pour l'histoire — deux choses seulement y survivent telles
  > quelles : le repli fait **en JS et jamais en CSS**, et la sentinelle
  > `window._irlFilterTab` NON VIDE rendue à `"date"` à la fermeture.

  **⚠️ LE PANNEAU FILTRES TIENT SUR UN ÉCRAN (2026-09-02), SANS NOUVEAU DRAPEAU.**
  Demande de Benjamin après essai réel : « repositionne les onglets dans la page
  filtre de Rencontrer, les onglets sont trop gros, mal ordonnés ; je voudrais
  que tout tienne sur la page sans descendre. » Mesuré AVANT à 390 × 844 :
  panneau de **1 018 px pour 714 px visibles**, « Voir les activités » hors de
  l'écran — donc valider ses choix demandait de descendre. Mesuré APRÈS : **377 px,
  zéro débordement**, le pied à 643 px. Aucun moteur n'est touché, aucune case ne
  disparaît, et `passio_ui_4a5="0"` rend l'écran d'avant à la lettre.
  ⚠️ **La cause n° 1 n'était pas la taille des cases, c'était un volet OUVERT
  D'OFFICE** : le volet Date pesait 337 px à lui seul — un tiers du panneau —
  alors que Distance et Horaire, eux, étaient repliés. Les trois partent
  désormais repliés, et un tap ouvre celui qu'on veut.
  ⚠️ **Le repli se fait en JS, jamais en CSS.** `_syncIrlFilterTabs()` pose la
  classe `on` sur le volet de `window._irlFilterTab || "date"` à CHAQUE
  `renderIRL()` : masquer les volets en CSS aurait laissé le moteur croire qu'un
  volet est ouvert, et la pastille « ce filtre est actif » de l'onglet aurait
  menti. Le module pose donc `window._irlFilterTab = "aucun"` — une valeur qui
  ne désigne aucun onglet. Elle doit être **NON VIDE** (`""` est faux, le moteur
  retomberait sur « date ») et elle est **rendue à `"date"`** quand la vue se
  ferme ou que le drapeau tombe : `openIrlFiltersPanel` ne repose la valeur que
  si elle est ABSENTE, la feuille historique se serait donc ouverte sans aucun
  volet et sans onglet sélectionné — un dialogue vide, sans erreur.
  ⚠️ **Un onglet de volet déjà ouvert se referme au second tap**, intercepté en
  phase de CAPTURE comme celui de `#irlToolsBtn` : l'`onclick` inline
  `setIrlFilterTab('date')` n'a pas de bascule, et sans elle le panneau ne
  saurait que grandir.
  ⚠️ **Une seule hauteur de case dans tout le panneau : 44 px** (bulles de
  passion, intentions, ville / mes activités, et les trois onglets de volet, qui
  faisaient 92 px avec leur icône empilée — c'était le « mal ordonné »). Leurs
  couleurs ne bougent pas : la demande du 2026-08-31 (« sauf Date, Distance,
  Horaire, laisse comme ça ») portait sur la PEAU, pas sur la taille.
  ⚠️ **`display: contents` aplatit les deux sous-sections de `#v4a5Outils`** :
  « Autour de moi » (une case) et « Mes événements » (deux) formaient trois
  lignes de gabarits différents ; les trois cases deviennent une rangée de trois
  colonnes. Leurs titres sont MASQUÉS, jamais retirés, et la règle est bornée à
  `#v4a5Outils` — `.ctx-section` est le composant commun des outils contextuels,
  servi dans le dialogue des autres écrans.
  ⚠️ **PAS D'ELLIPSE sur ces libellés : deux lignes.** Essayé, mesuré, rejeté —
  à trois colonnes, `text-overflow` sortait « Choisir une … », « Mes évène… » et
  « Mes inscript… », trois cases dont plus aucune ne disait ce qu'elle fait.
  Verrou : `ui-v4a5-filtres.spec.js`, trois cas — « tout tient sur un écran »
  (qui mesure la ZONE DE DÉFILEMENT `.app-main`, la seule qui décide s'il faut
  descendre, et vérifie qu'aucun libellé n'est coupé), « partent repliés, et se
  referment au second tap », « la feuille historique retrouve son volet Date
  ouvert ». Éprouvés par mutation : rouvrir le volet Date d'office fait rougir
  les deux premiers.
