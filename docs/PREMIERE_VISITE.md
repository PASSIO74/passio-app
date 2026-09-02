# PREMIERE_VISITE

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

## 🚪 PREMIÈRE VISITE — « l'application est elle-même le pitch » (`first_run_experience_v1`, ACTIF PAR DÉFAUT depuis le 2026-09-01)

`js/first-run.js` (IIFE `window.PassioFirstRun`) + bloc « PASSIO — PREMIÈRE VISITE » dans
`styles.css`, tests `tests/e2e/first-run.spec.js` (38) et helper
`tests/e2e/first-run-helper.js`. **Coupures, seules valeurs qui décident :**
`localStorage.passio_first_run_experience_v1="0"` et `window.PASSIO_FIRST_RUN_V1=false`.
Le drapeau ne sait plus qu'ENLEVER — même patron qu'UI-3A et les lots UI-4 : aucune
valeur positive n'active, rien n'est écrit dans `localStorage`, et l'ancien
`?passio_preview=first-run-v1` ne décide plus rien (`paramApercu` et sa persistance ont
été RETIRÉS avec le basculement, pas laissés en code mort). **Coupé = landing +
onboarding + tour historiques, à l'octet près.**

⚠️ **UN COMPTE EXISTANT N'ENTRE JAMAIS DANS CE PARCOURS**, drapeau actif compris :
`entreeDirecte()` sort sur sa garde `compteExistant()`. Le basculement n'a donc changé la
porte d'entrée que pour un appareil qui ne possède AUCUN compte.

⚠️ **LE BASCULEMENT A CASSÉ 23 CAS DE TEST, ET C'ÉTAIT ATTENDU.** Différentiel mesuré
(mêmes 25 suites, `origin/main` sans le lot : 122 réussis / 3 échecs ; avec : 102 / 26) —
les 3 échecs communs réclament `SUPABASE_SERVICE_ROLE_KEY` et préexistent. Les 23 autres
sont tous la même famille : une suite qui démarre d'un appareil VIERGE et attend la
landing historique. Convention appliquée, la même qu'aux mises en ligne d'UI-3A et des
lots UI-4 : **la suite pose la coupure au boot et garde TOUTES ses assertions.** Outil
durable plutôt que rustine recopiée : `poserGateSansPremiereVisite(page)`
(`tests/e2e/gate-helper.js`), qui pose le jeton du gate ET la coupure, avec l'explication
écrite une seule fois. Suites réalignées : `access-gate`, `confirmation-email`,
`dist-build`, `latence-percue`, `monitoring-bruit`, `onboarding-acceptation`, `perf-ios`,
`smoke`, `telemetrie-preauth`.
⚠️ Deux pièges de ce réalignement. ① **Un test qui TAPE le code d'accès n'a aucun script
d'injection à remplacer** : le cas « saisie du code → landing » de `dist-build` a survécu
au remplacement automatique du démarrage commun, et lui seul restait rouge. La coupure se
pose donc par SUITE, pas par cas — un test ajouté plus tard hériterait sinon du piège en
silence. ② **`access-gate` ne pose pas de jeton** (elle teste le gate), d'où un
`beforeEach` dédié ; la coupure vit dans `localStorage` et le jeton du gate dans
`sessionStorage`, les deux ne se croisent pas.

Un visiteur sans compte entre DIRECTEMENT dans le fil (aucune landing, aucun carrousel,
aucun formulaire, aucun GPS, aucune notification), voit une carte de bienvenue non
bloquante, choisit ses passions dans un panneau, explore Découvrir et Rencontrer, et ne
rencontre l'inscription qu'au moment où il tente une action engageante
(`requireAuthentication(ctx)`). Ses préférences vivent dans une clé versionnée
`localStorage["passio_first_run_v1"]` et sont migrées vers son compte, une fois, sans
écraser ce que ce compte porte déjà.

⚠️ **Neuf pièges de ce lot, tous mesurés, aucun déduit.**

① **`MY_UID` NE PROUVE PAS QU'UN COMPTE EXISTE.** `getMyUserId()` (app-08) FABRIQUE un
   identifiant local `u_xxxxxxxx` au chargement du script — pour tout le monde, toujours —
   et l'écrit dans `localStorage.passio_uid`. La garde « compte existant » testait sa
   présence : elle rendait donc TOUJOURS vrai, `entreeDirecte()` sortait, la landing
   s'affichait, et le drapeau paraissait sans effet. Le seul identifiant qui prouve un
   compte est un **uuid** Supabase (`RE_UUID`). Corollaire pour tout futur code : ne jamais
   traiter `MY_UID` comme une preuve d'authentification.

② **`js/first-run.js` DOIT être chargé AVANT le bloc `BUILD:APP`.** `app-09` fait
   `(window.__gateReady || Promise.resolve()).then(() => boot())` : quand le gate est déjà
   déverrouillé, cette microtâche part dès que la pile se vide — donc AVANT l'exécution du
   script suivant. Placé après le bloc, le module n'était pas encore évalué au moment où
   `boot()` cherchait `window.PassioFirstRun`. En production `scripts/build.js` inline ce
   fichier en place et charge `app.js` après le gate : l'ordre est le même.

③ **Un visiteur qui n'a rien choisi voit un CUL-DE-SAC, pas un fil.** `feedFollowingOn`
   vaut `true` par défaut et un visiteur ne suit personne : la sélection additive
   (ADR-011) est vide et `renderFeed` affiche « Tu ne suis encore personne ». D'où le
   **fil de découverte** (`PassioFirstRun.filDecouverte()`, consommé dans `renderFeed`) :
   tout le contenu affichable, classé par le moteur habituel. ⚠️ Rien n'est coché ni
   persisté — aucune tuile ne s'allume, `_activeFeedPassions` et
   `state.selectedFeedPassions` restent vides — sinon la migration transférerait au compte
   des « choix » que personne n'a faits.

④ **La fiche d'activité n'a PAS de classe d'état** : `#eventDetailPage` reste dans le DOM
   et c'est `style.display` qui l'ouvre. Chercher une classe `active`/`open` rendait
   toujours `false`, et une bulle d'aide se posait par-dessus une fiche ouverte par lien
   profond — exactement ce que « le tour est différé » interdit.

⑤ **Le hash d'arrivée n'est pas celui qu'on retrouve.** `#irl-event-e1` amène
   `openEventDetails`, qui repose `#event-e1`. Un test ancré sur la forme d'ENTRÉE
   conclurait à tort que le lien profond est perdu. La vérité est l'ÉCRAN affiché, pas le
   hash.

⑥ **Le formulaire d'authentification vit sur l'étape `splash`, pas sur `auth`.** L'étape
   `data-onb-step="auth"` existe encore mais porte `display:none!important` : c'est un
   alias mort. L'ouvrir affiche un écran VIDE, sans la moindre erreur. Et `onbStepIdx`
   doit repartir de 0, sinon le `onbNext()` du succès saute l'âge ou le prénom.

⑦ **L'onboarding est un cul-de-sac sans porte de sortie.** Une fois dedans, un visiteur qui
   change d'avis — ou qui vient de créer un compte et attend son e-mail de confirmation —
   n'a plus aucun moyen de revenir au fil. « Continuer à explorer » est une des trois
   issues promises par le gate : `poserSortieExploration()` la rend vraie après ouverture.

⑧ **Deux chemins mènent à l'après-authentification, et un seul passe par `onbFinish`.**
   « J'ai déjà un compte » fait `location.reload()` dans `onbDoAuth`, et la confirmation
   d'e-mail ramène par un lien NEUF : dans les deux cas `onbFinish` n'est jamais atteint.
   C'est `reprise()` (sur `passio:app-ready`) qui prend le relais — **indépendamment du
   drapeau**, sinon des préférences créées sous le parcours seraient perdues parce que
   l'URL a changé. Garde `_apresFait` contre le double envoi.

⑨ **Le marqueur anti-géolocalisation est consommé par `renderIRL`**, donc il doit être armé
   AVANT lui : le crochet `PassioFirstRun.surNavigation(screen)` est appelé dans `goTo`
   **avant** la ligne de re-rendu. Posé après, il arrivait trop tard pour le premier rendu —
   celui qui compte. Le lot UI-4A0 masquait ce défaut en armant le même marqueur dans son
   enveloppe de `renderIRL` ; couper ce lot l'aurait rouvert sans aucun symptôme.

**Sécurité et données.** Aucune RLS n'est desserrée : la policy « Lecture respectant les
comptes privés » autorise déjà, sans session, la lecture des publications d'auteurs non
privés (`auth.uid()` NULL, deuxième branche du OU). Le mode invité ne fait que LIRE
(`supaLoadPosts`, `supaLoadEvents`) et ne passe JAMAIS par `supaInit()`, qui écrit
(`supaEnsureProfileExists`, `supaSaveUserState`). **Aucun compte anonyme n'est créé** —
contrairement au chemin historique `onbSkipAuth`, qui appelle `signInAnonymously`. Le
contenu de démonstration (`_source === "seed"`) porte l'étiquette « Exemple PASSIO » et
refuse la participation avant toute écriture. Rien de sensible ni de base64 n'entre dans la
clé versionnée : uniquement des identifiants du catalogue et une route de retour.

**Catalogue.** `PASSIONS` (app-01) + le référentiel serveur restent la SEULE source de
vérité des passions ; `SPECIALITES` et `SYNONYMES` sont une couche ADDITIVE indexée par
identifiant existant, lue par `specialitesDe()` et `chercher()` seulement. Le jour où le
référentiel plat entier prendra leur place (ses 1 908 entrées et leur champ `broader`),
il n'y aura que ces deux fonctions à toucher. Une spécialité n'est jamais publiée comme
une passion — `estPassionCanonique` (app-02) reste la seule autorité de publication, et
la clé étrangère de `posts.passion_id` la dernière barrière.

**⑭ UNE SPÉCIALITÉ CHOISIE DOIT SE VOIR DANS LE FIL (corrigé le 2026-09-02).** Benjamin,
après essai : « je sélectionne Sport, en dessous tu proposes d'autres sports, exemple Vélo ;
j'ai sélectionné Vélo et validé, mais sur le fil tu affiches que Sport. » Les identifiants
de spécialité étaient FABRIQUÉS ici (`"sport:velo"`) : ils ne désignaient aucune passion
que le reste de l'application sache lire, donc ils ne pouvaient pas entrer dans
`_activeFeedPassions`, et seule la passion PARENTE survivait. Le choix précis était
enregistré dans `passio_first_run_v1`, migré vers `state.user.passionSpecialites`… et sans
le moindre effet nulle part. Une donnée qu'on collecte et qui ne commande rien est pire
qu'une donnée absente : elle fait croire que le geste a été pris en compte.

Chaque ligne de `SPECIALITES` porte désormais l'identifiant CANONIQUE du référentiel plat
et son libellé, recopié de la même source (`["cyclisme","Vélo et cyclisme"]`). Trois
conséquences, et il faut les trois :

- `interetsDuVisiteur()` construit les intérêts du fil comme **parente puis spécialités**,
  jamais l'une à la place de l'autre. Ne garder que la parente, c'était le défaut ; ne
  garder que la spécialité serait son symétrique — on retirerait un critère jamais décoché
  et le fil perdrait tout ce que la passion large apportait. Les critères du fil sont un
  **OU inclusif** (ADR-011) : ajouter n'enlève rien.
- `migrerPreferences()` lit `interetsDuVisiteur()` et non `p.passions` : oublier les
  spécialités là referait perdre le choix précis au moment où le visiteur crée son compte,
  c'est-à-dire au moment où il devient durable.
- `assurerReferentiel(ids)` demande `PassioPassions.charger()` puis repeint le rail. Le
  référentiel plat n'est chargé par PERSONNE au démarrage — seul le sélecteur de passions
  le demande, à son ouverture — et sans lui `passionById` retombe sur « ✨ Passion » : la
  bulle du fil existerait sans nommer le choix qu'on vient de faire. **Il n'est demandé
  que s'il sert** : `appliquerPrefs` tourne à CHAQUE entrée directe, donc l'appeler sans
  condition aurait remis 160 Ko sur le chemin critique du démarrage pour tout visiteur qui
  repasse — la décision d'architecture que tient `passions-plates.spec.js` ⑤, et que ce
  test-là n'aurait PAS vue (il démarre sur un compte, hors de ce parcours).

⚠️ **Deux pièges de démarrage, trouvés par le test et non par relecture.** ① `js/passions-flat.js`
est chargé APRÈS le bloc `BUILD:APP` et `app-09` lance `boot()` dans une microtâche :
quand `entreeDirecte()` applique les préférences, `window.PassioPassions` est encore
`undefined`. Rendre la main là, c'était laisser « ✨ Passion » sur le seul chemin qui
compte — celui du visiteur qui REVIENT. ② Le rattrapage ne peut PAS être un simple
écouteur `passio:app-ready` : cet événement n'est émis que par la production
(`scripts/build.js` l'injecte après le bundle inliné) et ne part JAMAIS en développement,
c'est-à-dire là où tourne la suite e2e. La reprise est donc un réessai BORNÉ (12 tours,
~3,6 s) : un module absent après trois secondes ne viendra pas, et une boucle sans fin
coûterait la batterie de quelqu'un dont le référentiel est simplement coupé.

⚠️ `specialiteValide()` n'interroge PAS `metaPassion()` sur la spécialité elle-même.
`metaPassion` passe par `estPassionCanonique`, qui ne connaît hors ligne que les 19 du socle
embarqué et n'apprend les 1 908 autres qu'après une réponse de la table `passions` :
attendre cette réponse ferait retomber le choix précis sur sa parente, en silence et de
façon INTERMITTENTE. Un intérêt de LECTURE n'a besoin d'aucune autorisation serveur — le
filtre du fil est 100 % local. La garantie que l'identifiant existe est posée ailleurs, en
CI : `npm run passions:verifier` lit le bloc `SPECIALITES` de `js/first-run.js`, refuse un
identifiant absent de `data/passions/` et signale un libellé qui aurait divergé du sien.

⚠️ Les préférences déjà posées sur un appareil portent l'ancienne forme `"<passion>:<spé>"`.
`specialiteValide` les refuse — elles ne désignent rien — mais `passionDeSpecialite` sait
encore en lire la passion parente, qui est ce qui doit survivre à la mise à jour.

Verrous : `tests/e2e/first-run.spec.js` › « une spécialité choisie arrive dans le fil, et sa
bulle la NOMME » — elle mesure les TROIS étages (identifiant canonique dans la puce, entrée
dans `_activeFeedPassions` sans perdre `sport`, bulle du rail qui affiche « Vélo ») ; vérifiée
par mutation, rétablir `p.passions` seul rend `["sport"]`, exactement le défaut rapporté.
Puis les deux cas du démarrage — « le référentiel plat n'est demandé au démarrage QUE si une
spécialité l'exige » et « … et il l'est quand une spécialité déjà choisie doit être nommée ».
Il faut LES DEUX : sans le premier, la dépense est libre ; sans le second, on peut
« économiser » jusqu'à ne plus rien nommer.

**Ce qui n'est jamais rejoué après inscription** : aucune publication, aucun message,
aucune inscription à une activité. `apresAuthentification()` restaure l'écran, la position
et le contenu, puis RAPPELLE l'action par un toast — le dernier geste appartient à la
personne.

**Deux corrections demandées par Benjamin après essai réel sur la preview (2026-09-01).**

⑩ **FERMER LA CARTE DE BIENVENUE N'EST PLUS DÉFINITIF.** Elle écrivait sa fermeture
   dans `localStorage` : elle ne revenait donc JAMAIS. Or c'est elle qui porte le
   bouton « Personnaliser mon expérience », et la seule autre porte vers le panneau
   est une entrée du menu Paramètres que personne ne va chercher. La fermer rendait
   le panneau INATTEIGNABLE — c'est pourquoi Benjamin ne l'a jamais vu. La consigne
   disait « ne pas réapparaître sans raison » ; « sans raison » avait été lu comme
   « jamais », alors que la raison est forte : **tant qu'aucun compte n'existe, rien
   n'est acquis**. La fermeture vit désormais dans `sessionStorage`
   (`passio_first_run_bienvenue_fermee`) et ne vaut que pour la session ; la carte
   revient à chaque visite, et disparaît définitivement dès qu'un compte existe.
   Son message suit l'état : passions déjà choisies → « Tes passions sont sur cet
   appareil / Crée ton compte pour les garder », bouton « Modifier mes passions ».

⑪ **LES AIDES AU GESTE NE SONT PAS DES ÉTAPES DE TOUR.** Quatre bulles se sont
   ajoutées (bulles de passion, envies, stories, bobines) parce que le tour à trois
   étapes laissait les commandes du Fil sans explication. Elles ne s'affichent PAS à
   l'ouverture : chacune attend le premier geste sur la commande dont elle parle.
   Empiler une bulle par commande reconstruirait le tutoriel que ce lot remplace.
   ⚠️ **L'écouteur est en phase de CAPTURE, et c'est obligatoire.** Une tuile de
   passion porte un `onclick` inline qui appelle `toggleProfileFilter` →
   `renderFeed` → `renderProfileStrip`, laquelle réécrit `#profileStrip` en entier :
   en bubbling, la tuile est DÉTACHÉE quand l'événement atteint `document`, et
   `closest("#profileStrip")` remonte dans un arbre orphelin sans jamais trouver la
   zone. L'aide ne se posait jamais, sans le moindre symptôme — même famille que le
   piège d'UI-4A4, « une chip arrachée par son propre clic ». ⚠️ Aucun écouteur
   CLAVIER n'est ajouté : app-08 en porte déjà un pour tout `[role="button"]` non
   natif, qui appelle `el.click()`.

⑫ **UNE AIDE PEUT ÊTRE MORTE SANS QUE RIEN NE LE DISE — et c'est arrivé.**
   L'aide « bobines » a été livrée avec une ancre inexistante :
   `.app-nav-v2 [data-v2-key="reels"]` ne matche RIEN (`DESTINATIONS` de
   `ui-v2-shell` ne contient que discover, meet, create, messages, profile) et
   son repli `.app-nav .nav-bobines` existe bien dans `index.html` mais vit dans
   la nav HISTORIQUE, que UI-1 met en `display: none`. Mesuré : 0×0,
   `offsetParent` nul, `montrerEtape("bobines")` toujours `false`. Même piège
   que l'étape « Créer », qui visait `.app-nav .nav-cta` avant correction —
   famille « une règle qui survit à la disparition de sa cible ».
   Elle a été **retirée**, pas rafistolée : même avec une ancre valide il n'y a
   aucun MOMENT où la montrer, toute porte vers les bobines ouvrant le lecteur
   en z-index 9999 quand `.fr-tip` est à 9000 — et relâcher `ecranOccupe()`
   pour ce cas rouvrirait le défaut ④. Les bobines restent expliquées par la
   rangée d'actions qu'UI-5 pose dans `.reel-info`, à l'intérieur du lecteur.
   ⚠️ Le verrou n'est pas le cas mais la FAMILLE : le test « toute aide déclarée
   a une ancre RÉELLEMENT atteignable » interroge `PassioFirstRun.zonesGeste()`
   et `cibleEtape()` — la table de PRODUCTION, jamais une copie recopiée dans le
   test, qui serait restée verte le jour où la production perd son ancre.
   Éprouvé par mutation : remettre l'ancre morte le fait rougir.

⑬ **`meOpen` OUVRAIT LA CAMÉRA À UN VISITEUR SANS COMPTE.** `mePublish` était
   gardée, pas `meOpen` — or c'est `meOpen` qui pose `#mediaEditor` en
   `phase-capture open`, donc qui déclenche la demande d'accès CAMÉRA. Mesuré :
   toucher « Ta story » dans la rangée du Fil y menait **à une seule tape** de
   l'entrée directe. Deux règles du lot tombaient d'un coup — « aucune demande
   de permission à l'entrée » et « l'inscription au moment de l'action
   engageante ». ⚠️ **Aucun contrôle d'ÉCRAN ne voyait ce défaut** :
   `#mediaEditor` se pose PAR-DESSUS le Fil, qui reste l'écran actif. Règle
   générale : garder la fonction qui ÉCRIT ne suffit pas, il faut garder celle
   qui OUVRE LA PORTE. Verrous : `meOpen` entre dans l'énumération des portes
   d'écriture, plus un test d'EFFET sur le geste réel (« Ta story » n'ouvre pas
   la caméra).

⚠️ **AVANT TOUT CHOIX, LE RAIL DU HAUT NE CONTIENT QUE « Suivis ».**
   `renderProfileStrip` rend les passions DU COMPTE (`state.user.profiles`), et un
   visiteur n'en a aucune : les tuiles n'apparaissent qu'une fois ses passions
   choisies. Un test qui y chercherait une tuile de passion chercherait ce qui
   n'existe pas encore.
