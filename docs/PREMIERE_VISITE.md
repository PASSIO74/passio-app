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
identifiant existant, lue par `specialitesDe()` et `chercher()` seulement. Le jour où un
vrai catalogue hiérarchique arrive, il remplace ces deux tables et rien d'autre ne bouge.
Une spécialité n'est jamais publiée comme une passion (elle n'est pas canonique) : la
choisir SÉLECTIONNE sa passion parente.

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

---

## 🔑 SE CONNECTER À UN COMPTE DÉJÀ CRÉÉ (2026-09-02)

**Le défaut, vécu au premier essai réel.** « Je n'arrive plus à me connecter avec
le compte qui était déjà créé avant ; j'ai essayé de taper sur déconnecter mais
il manque un onglet dans les paramètres. » L'entrée directe supprime la landing,
donc le formulaire de connexion **n'est plus à l'écran** ; et le parcours ne
tient sa promesse (« un compte existant n'entre jamais ici ») que si l'appareil
PORTE encore la trace de ce compte. Il suffit d'un appareil neuf, d'un cache
vidé, d'une session expirée — ou justement d'une déconnexion — pour qu'une
personne qui a un compte se retrouve traitée en visiteur, sans porte vers lui.

**Trois portes, désormais, et aucune ne demande de geste préalable :**

① **La carte de bienvenue du fil invité** porte le lien « J'ai déjà un compte —
me connecter » (`.fr-welcome-signin` → `PassioFirstRun.allerConnexion`). Le gate
d'action engageante l'offrait déjà, mais il faut avoir tenté un like ou un
commentaire pour le voir : ce n'est pas une porte, c'est une conséquence.
⚠️ C'est une TROISIÈME LIGNE, pas un troisième bouton dans `.fr-welcome-actions`
— les deux actions y sont en `flex: 1 1 auto`, un troisième y couperait les
libellés (piège ④ du lot UI-7).

② **Paramètres → Compte** porte un bouton dont le libellé suit l'état RÉEL,
réécrit à chaque ouverture du panneau par `majSectionCompte()` (app-02, appelée
par `toggleDevPanel`) : « 🔑 J'ai déjà un compte — me connecter » pour un
visiteur, « 🔄 Se connecter avec un autre compte » pour un compte connecté (qui
passe alors par une confirmation, puisque changer de compte déconnecte).
⚠️ Le panneau est du balisage STATIQUE : sans cette réécriture il ne peut rien
dire de juste, et il affichait à un visiteur un « Se déconnecter » sans objet —
masqué pour lui désormais.

③ **Toute déconnexion volontaire ouvre l'écran de connexion.** C'était le piège
le plus retors : `purgeAccountScopedData` efface `STATE_KEY` et `passio_uid`,
donc au rechargement `compteExistant()` rend `false` et l'appareil **retombe
dans le parcours invité** — la déconnexion, seule sortie qu'on cherche
spontanément, refermait la porte au lieu de l'ouvrir.
`doLogout` pose donc une INTENTION (`passio_auth_intent_v1`) **APRÈS** la purge,
sur une clé d'APPAREIL délibérément absente d'`ACCOUNT_SCOPED_KEYS` ; `boot()`
la lit et l'EFFACE tout au début (consommée une seule fois, quel que soit le
chemin de démarrage), et l'applique juste **avant** `entreeDirecte()`. Une
session valide sort de `boot()` bien plus haut : on ne peut donc pas voler son
écran à quelqu'un de connecté.
⚠️ **Et uniquement quand le parcours invité est ACTIF** : drapeau coupé, la
landing historique porte déjà « Se connecter » — il n'y a aucun piège à
défaire, et lui voler l'écran romprait la coupure « à l'octet près ».

**Aucun second système d'auth.** Les trois portes rouvrent le formulaire
EXISTANT — étape `splash` de l'onboarding, `onbStepIdx` remis à 0 — et laissent
`onbDoAuth` faire tout le travail (validation, confirmation d'e-mail Brevo,
anti-énumération, renvoi de lien). ⚠️ Le formulaire vit sur `splash`, **jamais**
sur l'étape `auth`, qui n'est plus qu'un alias en `display:none!important` :
l'ouvrir afficherait un écran VIDE sans la moindre erreur.

**La porte de sortie voyage avec le formulaire.** `openAuthScreen` (app-02)
appelle `PassioFirstRun.poserSortieExploration()` quand le parcours est actif :
l'onboarding est un écran plein sans retour, et « ← Continuer à explorer » est
une des trois issues promises par le gate.

**Cinq pièges de ce correctif, tous mesurés.**

⓵ **L'ORDRE DANS `boot()` EST LE CORRECTIF.** Ouvrir le formulaire *avant*
`entreeDirecte()` (et sortir de `boot()`) laisse derrière lui un fil à MOITIÉ
construit : pas de classe racine `passio-first-run` — donc `.fr-only` masque
« ✨ Mes passions » et « 🧭 Revoir les repères » dans les Paramètres —, aucun
contenu public chargé, aucune carte de bienvenue planifiée, aucune aide au geste
armée. La personne qui clique « ← Continuer à explorer » y tombe, **sans une
seule erreur en console**. L'entrée invitée passe donc d'abord, le formulaire
se pose par-dessus, et `entreeDirecte()` retirant `#onboarding.active`, l'ordre
inverse est le seul qui marche. Éprouvé par mutation.

⓶ **UNE SESSION SURVIVANTE + UNE INTENTION EN ATTENTE = DÉCONNEXION INACHEVÉE.**
`supa.auth.signOut()` est sous un `try` avale-tout et `ACCOUNT_SCOPED_KEYS` ne
touche pas le jeton `sb-…-auth-token` : hors ligne, la session peut survivre à
un `doLogout` dont la purge locale, elle, a bien eu lieu. `boot()` remettait
alors la personne EN SILENCE dans le compte qu'elle venait de quitter, avec un
état local déjà vidé. Cette branche termine le travail (signOut + purge) puis
ouvre l'écran demandé.

⓷ **L'INTENTION EST HORODATÉE (TTL 10 min).** Entre `setItem` et le rechargement
il s'écoule 1,2 s : une application fermée dans cette fenêtre laisserait la clé
sur l'appareil pour toujours, et le prochain démarrage — le lendemain, ou pour
quelqu'un d'autre sur un appareil partagé — s'ouvrirait sur un **mur de
connexion** au lieu du fil. `poserIntentionAuth` / `consommerIntentionAuth`
(app-02) sont le seul couple d'écriture et de lecture ; la lecture EFFACE
toujours, et ne rend le mode que s'il est encore frais.

⓸ **L'INTENTION SUIT LE PARAMÈTRE DE `doLogout`, jamais le hasard.** Les deux
boutons volontaires passent `doLogout('signin')` ; `doLogout()` sans argument
reste l'ancien comportement à l'octet près, pour qu'un appelant futur — session
expirée, suppression de compte — n'hérite pas d'un écran de connexion qu'il n'a
pas demandé.

⓹ **UN CATCH QUI RENONCE.** `openAuthScreen` rendait `true` même si
`showOnbStep` levait : `#onboarding` restait actif SANS aucune `.onb-step
.active` — écran vide, zéro erreur, application inatteignable. Il journalise
(`diagLog`) et rend `false`, et `boot()` reprend son chemin normal.

⚠️ **`majSectionCompte` masque TOUT ce qui suppose un compte**, pas seulement
l'entrée qui a motivé le correctif : « Se déconnecter », « Changer mon mot de
passe » (`supa.auth.updateUser` sans session) et « Supprimer mon compte ». Même
classe de défaut, au même endroit.

⚠️ **Un seul moteur d'ouverture** : `openAuthScreen` délègue à
`PassioFirstRun.allerConnexion` quand le module est là, et ne garde sa copie que
comme repli. Deux copies de l'étape `splash` seraient deux endroits à corriger le
jour où le formulaire déménage — le piège que ce fichier décrit déjà.

⚠️ **Mesure** : `guest_signin_started` (`ctx` en liste fermée) part de
`ouvrirAuth`, seul point de passage. Sans elle, les trois portes seraient
indiscernables de portes cassées.

Verrou : `tests/e2e/connexion-compte-existant.spec.js` (12 cas — les trois
portes, la survie de l'intention à la purge, sa consommation unique, sa
péremption, le retour à un fil invité COMPLET, le drapeau coupé, et
`doLogout()` sans argument).
