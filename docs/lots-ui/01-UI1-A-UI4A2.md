# 01 UI1 A UI4A2

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

- **`docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md` — direction UX canonique (2026-08-25).** Elle
  consolide et **remplace l'ancien ordre qui plaçait la refonte visuelle après la performance** :
  priorité n° 1 = rendre le concept visible et testable par lots UI-1 → UI-7. **UI-1 + UI-2 sont
  actives par défaut depuis validation de Benjamin le 2026-08-26** ; les anciens liens
  `?passio_preview=passio-ui-v2` restent compatibles. Après validation visuelle d'un lot UI à risque
  normal, cette validation autorise aussi sa fusion squash et son déploiement Git/Netlify une fois
  revue et CI vertes, sans seconde demande. Les changements critiques restent exclus. Les règles
  de sécurité déjà acquises restent non négociables. Ordre historique du lot UI-1 :
  `docs/PASSIO_UI_V2_ORDRE_UI1_2026-08-25.md`.
  Implémentation UI-1 : `js/ui-v2-shell.js` + bloc « PASSIO UI V2 » en fin de `styles.css`
  (inertes sous kill switch), tests `tests/e2e/ui-v2-shell.spec.js`.
  ⚠️ **Contrat visuel arrêté le 2026-08-27, après essai réel de Benjamin sur la
  preview** : la ligne basse d'une carte éligible ne porte QUE le lien « Trouver une
  expérience », aligné à droite. Le nom de la Passio, son emoji et le « trait Passio »
  violet → corail y ont été RETIRÉS — l'en-tête du post porte déjà la Passio, la répéter
  en bas alourdissait la carte. Le trait subsiste dans la feuille basse, comme transition
  d'ouverture. La direction §A19 est amendée dans ce sens.
  ⚠️ **Amendement du 2026-08-28, sur demande de Benjamin (« un petit onglet, plus
  discret »)** : ce lien de texte est devenu une **pastille**, et son libellé de carte
  a été raccourci en « **Vivre ça en vrai** ». Deux conséquences à connaître avant d'y
  toucher. ① Le libellé n'est plus unique : `LIBELLE_CTA_CARTE` (la pastille) et
  `LIBELLE_CTA` (le titre du panneau, resté « Trouver une expérience ») sont deux
  constantes — la carte invite, le panneau promet, et le panneau tient toujours ce que
  la carte annonce. ② La pastille VISIBLE ne fait que ~30 px alors que la cible tactile
  doit rester à 44 px (test « cible tactile ≥ 44 px », mesuré sur la **boîte** du bouton,
  qu'un simple débord en pseudo-élément ne satisferait pas) : le bouton garde donc ses
  44 px et c'est un `::before` en `inset: 7px 0` (z-index négatif) qui **peint** la
  pilule. Son fond est **opaque** (`var(--bg-deep)`) délibérément : le test de contraste
  remonte les ancêtres jusqu'au premier fond opaque et prendrait une teinte `rgba(…)`
  pour une couleur pleine, alpha ignoré — un rouge ou un vert qui ne prouverait rien.
  UI-3B (« Voir l'activité ») partage `.v3-tempt` et devient une pastille avec elle.
  Implémentation UI-3A (passerelle « Trouver une expérience » du Feed vers l'IRL) :
  `js/ui-v3-passerelle.js` + bloc « PASSIO UI V3 » en fin de `styles.css`, tests
  `tests/e2e/ui-v3-passerelle.spec.js`. **ACTIF PAR DÉFAUT** depuis la validation
  visuelle de Benjamin du 2026-08-27 (PR #163) ; il était en aperçu jusque-là, et
  `?passio_preview=passio-ui-3` reste toléré sans plus rien décider. Le drapeau ne
  sait que RETIRER — aucune valeur positive n'active, aucune n'est écrite dans
  `localStorage` ; coupures : `localStorage.passio_ui_3="0"` et
  `window.PASSIO_UI_3=false`, prioritaires sur tout. Le module
  n'écrit rien (ni base, ni `state`, ni `localStorage`), ne crée ni événement ni RSVP,
  et réutilise les moteurs existants (`irlPassionFilters`+`renderIRL`,
  `openPassionExplorer`, `openCreateEvent`+`feedIrlBridgePrefill`). ⚠️ Quatre pièges
  payés pendant ce lot, à ne pas refaire : ne JAMAIS cadencer un rendu sur
  `requestAnimationFrame` (il ne part pas sur une page qui ne compose pas de frames —
  onglet en arrière-plan, headless, machine saturée : la passerelle n'était jamais
  posée, en silence) ; masquer par CSS ancré à la classe racine plutôt que RETIRER du
  DOM, sinon le kill switch ne restitue pas l'état d'avant ; fermer l'aide contextuelle
  (`fermerHint`) avant d'ouvrir une feuille, elle est `position: fixed` et intercepte le
  tap ; et **borner un masquage à ce qu'on remplace réellement** — la règle qui cache le
  CTA historique vise `.post[data-v3-decore]`, marqueur posé par la décoration, car les
  deux éligibilités ne se recouvrent pas (le pont historique n'exige aucune passion, la
  passerelle en exige une CONNUE) : sans cette borne, une carte sans passion reconnue
  perdait sa seule porte vers l'IRL sans rien recevoir en échange.
  Implémentation UI-3B (publication DÉJÀ reliée à une activité) : **même module**
  `js/ui-v3-passerelle.js` (section « LOT UI-3B ») + bloc CSS dédié en fin de
  `styles.css`, tests `tests/e2e/ui-v3b-activite.spec.js`. Les deux lots sont
  EXCLUSIFS : `refEvenement(post)` (uniquement `eventId` / `event_id` /
  `sharedReelData.kind==="event"`, jamais déduit du texte) décide, et une carte
  reliée ne reçoit JAMAIS « Trouver une expérience ». La carte ne porte que le lien
  « Voir l'activité » (mêmes classes `.v3-bridge`/`.v3-tempt`, attribut
  `data-v3-activity`) ; activité introuvable = AUCUN CTA, publication intacte,
  diagnostic technique sans PII. Le tap ouvre `openEventDetails` et remplace la
  seule barre `#eventDetailCta` par une action unique « Je participe » servie par
  `setEventRsvp` (aucun moteur RSVP dupliqué, aucune écriture avant le geste ;
  ni « Peut-être », ni « Je ne participe pas » dans cette surface ; le retrait
  reste secondaire). ⚠️ Deux pièges : le moteur repeint la fiche entière à chaque
  RSVP (`_refreshEventDetailIfOpen`) donc le marqueur `data-v3-rsvp` vit sur le
  nœud INJECTÉ et non sur `#eventDetailCta` (un `innerHTML` efface les enfants,
  pas les attributs de l'hôte) ; et l'activité annulée ou terminée n'est jamais
  recouverte — la fiche historique y dit déjà la bonne chose. Corollaire de test :
  les suites du pont historique (`feed-irl-bridge.spec.js`, le cas « Rencontrer » de
  `feed-intents.spec.js`) démarrent avec `localStorage.passio_ui_3="0"` pour l'observer
  seul — aucune assertion n'est retirée, la cohabitation est prouvée à part dans
  `ui-v3-passerelle.spec.js`. Le lot UI-3B (publications déjà liées à un événement,
  « Voir l'activité » puis « Je participe » dans la fiche) est implémenté et **en
  attente de la validation visuelle de Benjamin** : il vit sous le MÊME drapeau
  `passio_ui_3` et les mêmes coupures que UI-3A.
  Implémentation UI-4B (fiche activité V2) : `js/ui-v4b-fiche.js` + bloc « PASSIO UI V4 »
  en fin de `styles.css`, tests `tests/e2e/ui-v4b-fiche.spec.js`. **APERÇU UNIQUEMENT**
  (`?passio_preview=passio-ui-4b`, ou `…=passio-ui-4b-demo` qui ouvre en plus une activité
  de démonstration entièrement en mémoire) ; coupures dédiées et prioritaires
  `localStorage.passio_ui_4b="0"` et `window.PASSIO_UI_4B=false`. Aucune activation
  positive persistante, rien n'est écrit dans `localStorage`. Le module ne recrée AUCUN
  moteur : il **déplace** les nœuds que `openEventDetails` vient de rendre dans des
  sections ordonnées (rendez-vous → organisateur → description → infos → participants →
  discussion → contextuel → échanges → autres actions), ajoute la seule surface neuve
  (le bloc « Le rendez-vous » : tuile de date corail, heure, ville PUBLIQUE, places
  agrégées) et remplace la barre d'action par un unique « Je participe » servi par
  `setEventRsvp`. ⚠️ Cinq pièges de ce lot : **déplacer et non régénérer** — reconstruire
  la chaîne HTML tuerait les `onclick` inline et les nœuds que des chargements asynchrones
  retrouvent par id (`#eventAlbum`, `#eventCommentsList`, `#eventCommentInput`) ; un
  élément non classé tombe dans « Autres actions » et un élément non reconnu **hérite du
  titre historique qui le précède**, sinon la ligne « Plus que N places » quittait sa
  section ; le marqueur `data-v4b-rsvp` vit sur le nœud INJECTÉ, pas sur `#eventDetailCta`
  (même piège qu'UI-3B) ; **un verrou d'échec est obligatoire** car restaurer la fiche
  historique repeint le corps, que l'observateur voit — sans lui, une erreur reproductible
  boucle à l'infini ; et **deux modules ne peuvent pas écrire la même barre** — d'où le
  garde `ficheReprisParV4b()` dans `ui-v3-passerelle.js`, qui rend la barre à UI-4B dès
  que l'aperçu est actif (inerte hors aperçu). Annulé et terminé ne sont JAMAIS recouverts :
  la fiche historique y dit déjà la bonne chose. Vie privée : seule la ville publique monte
  au premier niveau, l'adresse exacte et le téléphone restent dans « Infos pratiques »,
  là où le moteur historique les avait mis.
  Implémentation UI-4A0 (tête de l'écran « Rencontrer ») : `js/ui-v4a0-tete.js` + bloc
  « PASSIO UI V4 — lot UI-4A0 » en fin de `styles.css`, tests `tests/e2e/ui-v4a0-tete.spec.js`.
  **APERÇU UNIQUEMENT** (`?passio_preview=passio-ui-4a0-demo`, alias `…=passio-ui-4a0`) ;
  coupures dédiées et prioritaires `localStorage.passio_ui_4a0="0"` et
  `window.PASSIO_UI_4A0=false`. Périmètre volontairement minuscule : titre, sous-titre,
  recherche et quatre intentions posés EN TÊTE de `#screen-irl` ; la liste, la carte, les
  cartes d'activité et tous les moteurs d'app-07 restent intacts dessous. Deux seuls
  comportements branchés : ① la recherche de tête recopie sa valeur dans le champ
  historique `#irlCitySearch` (masqué en CSS via le nouvel id `#irlSearchRow`, jamais
  retiré du DOM) puis appelle `filterIrlByCity()` — même anti-rebond, même
  `irlSearchQuery`, aucun second moteur ; ② **aucune demande GPS à l'ouverture**, obtenue
  en ENVELOPPANT `window.renderIRL` pour armer le marqueur historique
  `_passioIrlSkipGeoOnce` (celui d'UI-3A) avant chaque rendu — le moteur le consomme
  lui-même, donc la géolocalisation n'est jamais désactivée durablement et
  `requestUserLocation()` appelé par un geste explicite fonctionne toujours.
  ⚠️ Les quatre intentions (`Pour toi` neutre + trois multisélectionnables) tiennent leur
  état **EN MÉMOIRE SEULE** et ne filtrent PAS encore : le raccordement à `irlDateFilters`
  / `irlSelectedCity` / `irlPassionFilters` revient à UI-4A1, qui lira
  `window.PassioUIV4A0.intents()`. C'est une décision de découpage, pas un oubli.
  ⚠️ Piège du build : `scripts/build.js` externalise le bloc app dans `app.js` chargé
  APRÈS le gate, alors que les modules hors bloc sont inlinés et s'exécutent tout de
  suite — au premier `boot()`, `renderIRL` n'existe pas encore en prod. Le module écoute
  donc `passio:app-ready` et garde une reprise bornée par `setTimeout` (jamais
  `requestAnimationFrame`).
  Implémentation UI-4A1 (raccord des intentions au moteur IRL) :
  `js/ui-v4a1-intentions.js`, tests `tests/e2e/ui-v4a1-intentions.spec.js`.
  **APERÇU UNIQUEMENT** (`?passio_preview=passio-ui-4a1-demo`, alias `…=passio-ui-4a1`) ;
  coupures dédiées `localStorage.passio_ui_4a1="0"` et `window.PASSIO_UI_4A1=false`, et
  couper UI-4A0 coupe aussi ce lot. Aucun style neuf : la tête UI-4A0 est réutilisée
  telle quelle, son aperçu étant impliqué par celui de son « héritier ». Le module ne
  crée AUCUN moteur : `semaine` pilote la seule valeur `"week"` de `irlDateFilters`,
  `passio` ajoute exactement `_irlMyPassions()` dans `irlPassionFilters`, et tout passe
  par le même `renderIRL()`. ⚠️ Le seul écart réel : **il n'existait aucun filtre ville** —
  `irlSelectedCity` ne servait que de point de référence (carte, distances, tri « le plus
  proche »). Un prédicat explicite `irlCityIntent` (+ `setIrlCityIntent` /
  `irlCityIntentName` / `_normIrlCityName`) a donc été ajouté DANS `_filterIrlEvents`,
  pour que liste et marqueurs ne divergent pas ; il est vide par défaut, compté par
  `_irlActiveFilterCount`, signé par `_resetIrlPagingIfFiltersChanged` et vidé par
  `clearAllIrlFilters`. Sans ville choisie, `Ma ville` ouvre `openIrlCitySelector()` et
  reste inactive jusqu'au choix — jamais de GPS. ⚠️ Quatre pièges de ce lot : les états
  historiques sont des `let` (`irlPassionFilters`, `irlSelectedCity`) donc **absents de
  `window`** → app-07 expose `irlPassionFilterSet()` / `irlSelectedCityName()`, à relire
  à chaud (`renderIrlPassionTiles` REMPLACE le Set le temps d'un calcul) ; la coupure
  restitue **valeur par valeur**, jamais en bloc, sinon elle effacerait un filtre posé
  depuis le panneau détaillé APRÈS l'activation ; `clearAllIrlFilters()` est un geste
  explicite qui devient le nouveau neutre (le snapshot est abandonné, il ne ressuscite
  pas à la coupure) ; et **deux enveloppes de `renderIRL` s'empilent** — UI-4A0 ne met
  plus sa fonction d'origine à `null` quand un sous-lot l'a recouverte, sinon le rendu
  suivant plantait sur un `null.apply`.
  Implémentation UI-4A2 (carte d'activité V2 dans la liste « Rencontrer ») :
  `js/ui-v4a2-cartes.js` + bloc « PASSIO UI V4 — lot UI-4A2 » en fin de `styles.css`,
  tests `tests/e2e/ui-v4a2-cartes.spec.js`. **APERÇU UNIQUEMENT**
  (`?passio_preview=passio-ui-4a2-demo`, alias `…=passio-ui-4a2`) ; coupures dédiées
  `localStorage.passio_ui_4a2="0"` et `window.PASSIO_UI_4A2=false`. La carte ne porte
  plus que ce que la direction §8 énumère : visuel (couverture, sinon pastille emoji),
  titre, `Passio · quand`, `ville · environ N km`, `N personnes · N places`, la preuve
  sociale historique, puis « Voir » et « Je viens ». Vie privée (§A24) : elle en montre
  **moins** que l'historique — ni `venue`, ni adresse, ni contact, ni trombinoscope, et
  la preuve sociale reste la seule surface nommant des personnes (déjà bornée par
  `_eventFriendsGoing` aux comptes suivis). Aucun moteur neuf : `setEventRsvp` reste le
  seul point d'écriture (c'est lui qui bascule en liste d'attente), et une réponse déjà
  posée ouvre `openEventRsvpSheet` au lieu de dupliquer les trois états. Annulé et
  terminé ne sont jamais recouverts d'une invitation à venir.
  ⚠️ Six pièges de ce lot : **rien n'est retiré ni déplacé** — les nœuds recouverts sont
  masqués et l'ordre vient de `order`, sinon `_loadEventCommentCounts` /
  `_loadEventReactions` / `_loadEventCommentsPreviews` ne retrouveraient plus
  `[data-evlike]`, `[data-evc]`, `[data-evchipholder]`, `[data-evcomments]` ; le masquage
  exige `!important` car la rangée haute de la carte historique porte un
  `style="display:flex"` **inline** qu'aucun sélecteur ne bat (UI-4A0 avait mémorisé puis
  restauré ce display en JS ; ici il y a une carte neuve à chaque rendu, donc rien à
  restaurer — on surclasse, et retirer la classe racine rend tout) ; le masquage est
  **borné à `data-v4a2`**, une carte non décorée gardant TOUTES ses portes ; **aucune
  enveloppe de `renderIRL`** — un `MutationObserver` sur `#eventList` voit en plus
  `_patchEventCardJoin`, qui repeint le seul pied après un RSVP sans repasser par le
  rendu, et n'allonge pas la chaîne d'enveloppes UI-4A0/UI-4A1 ; l'anti-boucle est une
  **signature d'état** posée sur la carte (on n'écrit qu'au changement), l'observateur
  voyant ses propres écritures ; et `_isMyEvent` s'appuie sur `ev._mine`, drapeau porté
  par les **copies** d'`allEvents()` et absent de l'objet canonique — d'où un repli sur
  `state.userEvents`, sans quoi la carte V2 dirait « Je viens » là où l'historique disait
  « Organisé ». L'aperçu UI-4A2 implique UI-4A0 et UI-4A1 (`passio_preview` ne porte
  qu'une valeur, et des chips inertes mentiraient sur l'écran) : UI-4A0 balaie donc TOUS
  ses héritiers au lieu d'en chaîner un seul, et UI-4A2 réveille les lots amont à son
  boot, puisqu'ils ont démarré avant que son fichier n'existe. Reste du lot UI-4 : la vue
  Liste / Carte (UI-4A3).
