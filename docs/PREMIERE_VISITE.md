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
chemin de démarrage), et l'applique **APRÈS** `entreeDirecte()` — voir le piège
⓵ ci-dessous, l'ordre inverse rendait un fil à moitié construit. Une
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
`supa.auth.signOut()` était sous un `try` avale-tout et `ACCOUNT_SCOPED_KEYS` ne
touche pas le jeton `sb-…-auth-token` : hors ligne, la session peut survivre à
un `doLogout` dont la purge locale, elle, a bien eu lieu. `boot()` remettait
alors la personne EN SILENCE dans le compte qu'elle venait de quitter, avec un
état local déjà vidé. Trois choses en découlent, et les trois sont dans le code :

- **on lit `{ error }`** — le SDK ne LÈVE PAS sur un refus, donc sans cette
  lecture une déconnexion qui échoue passe pour réussie (règle générale du
  projet : « les écritures qui échouent en silence ») ;
- **`purgerJetonAuthLocal()`** ferme alors la session CÔTÉ APPAREIL, sans
  réseau : pour supabase-js, le jeton `sb-<ref>-auth-token` EST la session. Il
  est retrouvé par MOTIF, jamais recopié en dur, et rien n'est détruit côté
  serveur. `doLogout` l'appelle aussi — c'est le chemin le plus fréquent ;
- **la branche RECHARGE la page**, exactement comme `doLogout`. Ce n'est pas du
  confort : `purgeAccountScopedData` vide `localStorage` et IndexedDB, mais pas
  la MÉMOIRE — `conversationsState` (app-04) porte encore les messages privés du
  compte quitté, et ni `saveConversations` ni `saveConversationsNow` ne
  consultent le verrou `_accountPurged`. La première écriture venue les
  réinstallerait sur l'appareil, à la disposition du compte suivant : même
  famille que la fuite inter-comptes corrigée le 2026-08-12. Poursuivre `boot()`
  sans recharger la rouvrait — et ouvrir le formulaire sur place rejouait en
  prime le piège ⓵. ⚠️ Le rechargement ne peut pas boucler : le jeton ayant été
  retiré, le prochain `getSession()` ne trouve plus rien, et l'intention
  re-posée conduit au chemin normal (`entreeDirecte()` puis l'écran demandé).

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

⚠️ **CE QUI A ÉTÉ ESSAYÉ PUIS RETIRÉ.** Une revue a signalé que le budget de
`planifierAccueil` (40 essais × 600 ms) se consomme pendant que le formulaire
occupe l'écran — `ecranOccupe()` rend `true` tant que `#onboarding.active` est
là — et que la carte de bienvenue, qui porte la porte ①, pourrait être
abandonnée pour la vie de la page. Le constat est juste, mais le réarmement
existe DÉJÀ : `retourExploration()` appelle `goTo("feed")`, donc
`surNavigation("feed")`, qui remet `_essaisAccueil` à zéro et replanifie. Le
correctif ajouté au premier jet était un second moteur pour un travail déjà
fait, et son test restait vert avec ET sans lui : les deux ont été retirés.

Verrou : `tests/e2e/connexion-compte-existant.spec.js` (14 cas — les trois
portes, la survie de l'intention à la purge, sa consommation unique, sa
péremption, le retour à un fil invité COMPLET, le drapeau coupé,
`doLogout()` sans argument, un `signOut` qui échoue, et le périmètre exact de
`purgerJetonAuthLocal`).
## 🔐 L'ÉTAT LOCAL APPARTIENT À UN COMPTE, JAMAIS À L'APPAREIL (2026-09-02)

Défaut rapporté par Benjamin après essai réel :

> « j'étais dans l'app sans compte pour découvrir, j'ai mis plein de passions
> pour voir, ensuite je me suis connecté à mon vrai compte et tu as mélangé les
> infos de la page de découverte avec mon compte… les infos enregistrées dans un
> compte doivent être enregistrées au compte. »

### Ce n'était pas une fusion d'affichage : l'exploration ÉCRASAIT le serveur

Le chemin tenait en quatre lignes de `onbDoAuth` (app-02) :

```js
MY_UID = data.session.user.id;   // ① l'identité devient celle du compte
state.onboarded = true;          // ② l'état ANONYME devient « onboardé »
saveState();                     // ③ _stateDirty = true
window.location.reload();        // ④ pagehide → supaSaveUserStateBeacon
```

`supaSaveUserStateBeacon` a trois gardes — une identité (`MY_UID`), un état
onboardé, un drapeau sale — et **les quatre lignes ci-dessus les lèvent toutes
les trois**. Le beacon POSTe donc `_syncableState()`, c'est-à-dire l'état de
l'EXPLORATION ANONYME, dans `user_state` du vrai compte, en
`resolution=merge-duplicates` : la ligne est **remplacée**. Les passions cochées
« pour voir » devenaient celles du compte, sur tous ses appareils, et le
rechargement les restituait ensuite comme si elles en venaient — ce qui donnait
au défaut son apparence de « fusion ».

### La règle, et son point d'application

Un état local ne part **jamais** sous une identité qui n'est pas la sienne.
`adopterCompteConnecte(uid)` (app-02) est le seul point qui tranche : quand
l'appareil adopte un compte dont l'état local ne provient pas, cet état est purgé
(`purgeAccountScopedData`) **avant** que quoi que ce soit puisse l'attribuer au
compte. Le serveur le restituera — lui seul fait foi.

Elle est appelée aux **TROIS** entrées, et à chaque fois **AVANT** `MY_UID` et
`localStorage.passio_uid` :

- `onbDoAuth`, branche `signin` (app-02) — la connexion explicite ;
- `boot()`, branche « session retrouvée » (app-08) — retour de
  `signInWithOAuth`, lien de confirmation d'e-mail qui ouvre directement une
  session ;
- `onAuthStateChange` (app-08) — **la troisième, et la plus piégeuse**. Ce
  handler n'est enregistré que lorsque `boot()` n'a trouvé AUCUNE session, donc
  précisément pour un visiteur en première visite, et il refaisait le défaut
  d'origine mot pour mot : `MY_UID` + `passio_uid` + `onboarded` + `saveState()`
  + `reload()`. Il **protège** désormais sans purger ni recharger : une adoption
  avec rechargement y aurait cassé les quatre suites e2e à comptes réels
  (`authz-critical`, `blocage-acces`, `user-state-horodatage`, `multi-comptes`),
  qui ouvrent l'app sans session puis se connectent — CI rouge, déploiement
  sauté. Fermer la porte suffit ; l'adoption a lieu au démarrage suivant.

⚠️ **LE DISCRIMINANT EST UN INSTANTANÉ PRIS AU CHARGEMENT, PAS UNE RELECTURE.**
C'est la correction la plus importante du lot, et sans elle tout le reste ne
servait à rien sur le chemin le plus courant. **Trois** points écrivent
`localStorage.passio_uid`, et **supabase-js notifie ses abonnés PENDANT
`signInWithPassword`, avant d'en résoudre la promesse** — le dépôt le documente
lui-même (« le client tient un verrou auth pendant l'émission de l'événement »).
Sur le parcours réel « j'explore sans compte → J'ai déjà un compte » :

1. le visiteur se connecte ;
2. `onAuthStateChange` reçoit `SIGNED_IN` et écrit `passio_uid = <uuid>` ;
3. la promesse de `signInWithPassword` résout enfin ;
4. `adopterCompteConnecte` relisait `passio_uid`… et y trouvait l'uuid.

La garde concluait « l'état local est déjà le sien », ne purgeait **rien**, et le
beacon repartait avec l'état anonyme : le défaut d'origine, intact, sur le chemin
exact qui l'avait fait remonter. `_uidProprietaireEtat` est donc capturé à
l'ÉVALUATION d'app-02 — avant `getMyUserId`, avant tout événement d'auth, hors
d'atteinte des trois écrivains.

`getMyUserId` fabrique par ailleurs un placeholder `u_xxxxxxxx` pour tout le
monde — un appareil qui explore en porte un, et **il ne prouve aucun compte**
(même piège que `MY_UID`). Seul un uuid Supabase compte.

⚠️ **La sonde d'écriture est une clé JETABLE, jamais `passio_uid`.** Sonder avec
la clé qu'on garde ouvrait une fenêtre — entre la sonde et la purge — où
l'appareil « connaissait » le compte tout en portant encore l'état anonyme. Une
interruption là (onglet fermé, plantage) désarmait la garde **à vie**.

⚠️ **UN APPAREIL VIDÉ N'ÉCRASE JAMAIS LE COMPTE QU'IL VIENT D'ADOPTER.** Défaut
créé par la purge elle-même : si `supaLoadUserState` échoue après elle (réseau,
5xx, jeton pas frais), l'état local reste VIDE et la première sauvegarde le POSTe
dans `user_state` — le compte est effacé sur tous ses appareils. Avant la purge,
ce chemin n'existait pas. `_peutPousserEtat()` interdit toute écriture d'état
tant que (a) la restauration n'est pas confirmée — drapeau
`passio_restauration_requise` posé par l'adoption, **persisté** car il doit
survivre au rechargement, levé par `supaLoadUserState` à son premier verdict
RÉUSSI, « ce compte n'a pas de ligne » compris — ou (b) l'état local appartient à
un autre compte. Gardé sur les **deux** chemins d'écriture, `supaSaveUserState`
et le beacon.

⚠️ **`attribuerEtatLocalAuCompte` est la contrepartie indispensable.** Certains
chemins exigent que l'état local SUIVE l'identité qui naît : une inscription qui
rend une session, et `onbSkipAuth` (`signInAnonymously`, qui rend un VRAI uuid).
Là, l'état porte l'onboarding qu'on vient de saisir — âge, prénom, passions. Le
purger serait jeter le travail de la personne au milieu de son inscription. Cette
fonction ne fait que **déclarer le propriétaire**.

⚠️ **LE PROFIL « MUSIQUE » FABRIQUÉ PAR `boot()` N'EST PAS UN CHOIX.** Quand le
serveur ne rend aucun profil, `boot()` en fabrique un avec `allPassions()[0]` et
le marque `_parDefaut`. Le compter faisait passer un compte NEUF pour un compte
garni, et les passions du visiteur étaient **jetées**. L'exclusion vaut aux DEUX
bouts : `restoreFeedPassions` ne l'amorce plus dans `selectedFeedPassions` (où le
marqueur ne survit pas — seul l'IDENTIFIANT voyage), et le verdict serveur
soustrait de `selectedFeedPassions` ce que seul le remplissage porte, pour les
clients antérieurs qui l'y ont déjà recopié.

⚠️ **LE PARCOURS « MOT DE PASSE OUBLIÉ » NE SE RECHARGE JAMAIS EN COURS DE
ROUTE.** Le lien ouvre une session, donc la garde d'adoption la voyait arriver
sur un appareil qui ne connaît pas ce compte, purgeait et RECHARGEAIT — ce qui
détruisait le formulaire de nouveau mot de passe, alors que le fragment
`type=recovery` a déjà été consommé par le SDK et que le lien est à **usage
unique**. L'adoption est déplacée au seul moment sûr : le changement effectif du
mot de passe (`_showPasswordRecoveryUI`). Pendant la récupération, `passio_uid`
n'est pas écrit (sinon abandonner le formulaire désarmerait la garde
définitivement) et l'exigence de restauration est armée, sinon
`supaLoadUserState` pousserait l'état du propriétaire précédent dans le compte
récupéré. ⚠️ **La branche « déconnexion inachevée » de #250 porte la même
exception** : elle s'exécute AVANT la garde d'adoption, donc la sienne était
contournée par le haut.

⚠️ **Pas de boucle de purge.** `purgeAccountScopedData` retire `passio_uid` de
l'appareil : on le RÉÉCRIT aussitôt avec l'identifiant adopté. Sans cette ligne,
le rechargement retrouverait un appareil « sans compte connu », re-purgerait,
rechargerait — indéfiniment.

⚠️ **Un retour sur SON PROPRE compte ne purge rien** (même identifiant ⇒ sortie
immédiate) : une session expirée puis rétablie garde les écritures locales pas
encore synchronisées. La purge de `onbDoAuth` est bornée à la branche `signin`,
la seule qui recharge : une inscription CONTINUE l'onboarding (âge, prénom) dans
l'état en cours, et purger là jetterait ce que la personne vient de saisir.

### La migration des préférences ne fusionne plus, elle abandonne

`migrerPreferences` disait « je n'écrase pas : les passions du compte d'abord,
celles du visiteur en queue ». Mais **« ne rien écraser » n'est pas « ne rien
ajouter »** : douze passions cochées pour voir se retrouvaient dans le fil d'un
compte qui n'en avait jamais voulu. Désormais, un compte qui a déjà ses passions
n'en reçoit **aucune** — les préférences d'exploration sont VIDÉES, pas seulement
marquées `migre`, pour qu'aucun chemin futur ne puisse les relire. Seul un compte
SANS passion (celui qu'on vient de créer au bout de l'exploration) les adopte.

⚠️ **La question ne se pose pas à `state`.** Sur un appareil qui vient
d'explorer, `state.selectedFeedPassions` contient les passions de l'EXPLORATION
(`appliquerPrefs` les y a mises) : les lire reviendrait à demander au visiteur si
le compte lui ressemble, et il répondrait toujours oui. L'autorité est
`window._comptePassionsServeur`, posé par `supaLoadUserState` d'après le blob
`user_state` **réellement renvoyé** pour ce compte. Le repli hors ligne ne retient
que ce qui ne peut PAS venir de l'exploration : un profil-passion vivant (le
visiteur n'en crée aucun) ou une passion sélectionnée que le visiteur n'a pas
choisie.

⚠️ **Les choix du visiteur passent en TÊTE de la fusion**, et l'ordre porte le
sens : le premier identifiant est la passion PRIMAIRE (`setFeedPassions`).
L'ordre inverse faisait de « Musique » — le remplissage — la passion primaire de
quelqu'un qui avait choisi Cuisine, Photo et Randonnée.

⚠️ **On n'adopte rien avant que le compte ait parlé.** `passio:app-ready` part au
CHARGEMENT du script d'application, donc AVANT que `boot()` ait fini d'attendre
`supaLoadUserState` : à 1 200 ms, un vrai compte ressemble encore à un compte
neuf. `reprise()` attend `window._etatCompteCharge` (posé à CHAQUE sortie de
l'hydratation, sorties précoces comprises), borné à ~7 s — hors ligne, le verdict
ne vient jamais et il vaut mieux trancher sur le repli que perdre les choix du
visiteur.

### Verrous

`tests/e2e/exploration-anonyme-vs-compte.spec.js` (16). Le premier cas
**REPRODUIT le défaut** — sans la garde, le POST vers `user_state` porte bien les
passions de l'exploration — de sorte que le second prouve quelque chose.
`tests/e2e/first-run.spec.js` couvre les deux sens de la migration (compte qui a
ses passions / compte neuf), le repli hors ligne et le profil de remplissage.

⚠️ **TESTER LA FONCTION NE SUFFIT PAS, IL FAUT TESTER LE CÂBLAGE.** Les douze
premiers cas appelaient `adopterCompteConnecte` DIRECTEMENT ; aucun ne passait
par `onbDoAuth`, qui est pourtant le chemin rapporté. Mesuré par mutation :
supprimer le branchement laissait `npm run verif` et les 897 suites VERTES, avec
le défaut d'origine intact — c'est ainsi que le premier bloquant avait survécu à
la première ronde. Deux cas pilotent désormais le VRAI `onbDoAuth` (branches
`signin` et `signup`), en reproduisant la course où `onAuthStateChange` réécrit
`passio_uid`. Le rechargement n'y est PAS doublé — Chromium refuse de redéfinir
`location.reload`, et c'est lui qui déclenche `pagehide`, donc le beacon, donc le
défaut : on observe depuis l'EXTÉRIEUR, par la sonde réseau de Playwright, qui
survit à la navigation.

⚠️ **ET IL FAUT TESTER SUR LE CHEMIN RÉEL.** `bootVisiteur` impose
`_supaReal === false` — prémisse saine — mais `_supaSaveUserStateOnce` sort sur
CETTE garde-là, à sa première ligne, bien AVANT `_peutPousserEtat()`. Les cas
« rien ne part » prouvaient donc surtout que le SDK était coupé. Deux cas posent
un vrai client factice et exercent le chemin d'écriture jusqu'au bout, ainsi que
le calcul de `_comptePassionsServeur` — règle écrite deux fois (verdict serveur
et repli local), dont une seule copie était couverte.

---

## ✨ « Passion » SANS SON NOM — le référentiel arrivait trop tard (2026-09-02)

Trois bulles génériques « ✨ Passion » au milieu de passions correctement
nommées, sur la capture du même essai. Cause : `passionById` (app-02) résout
d'abord les 19 passions du socle embarqué, interroge ensuite `PassioPassions`, et
rend `{ emoji: "✨", label: "Passion" }` quand il ne sait pas — or le référentiel
plat (1 908 passions) n'était chargé qu'à **l'ouverture du sélecteur**. Toute
passion venue de la recherche s'affichait donc sans son nom, dans le rail du Fil,
celui du Profil et le Studio, jusqu'à ce que quelqu'un rouvre le sélecteur.

⚠️ **La correction ne charge PAS le référentiel au démarrage**, et c'est délibéré :
160 Ko sur le chemin critique pour une donnée dont la plupart des sessions n'ont
jamais besoin — invariant protégé par `passions-plates.spec.js` ⑤ et ⑰ bis. La
conciliation tient en une question, posée une seule fois : « l'écran porte-t-il
un identifiant que le socle ne sait pas nommer ? ». Non ⇒ rien n'est chargé. Oui
⇒ la seule alternative est d'afficher « ✨ Passion » à la place d'un nom.

⚠️ **La question se pose APRÈS l'hydratation**, jamais à `app-ready` : les
passions d'un compte arrivent par `supaLoadUserState`, donc après le chargement
du script. Posée trop tôt, elle porterait sur un état vide et répondrait toujours
« non ».

⚠️ **Charger ne suffit pas, il faut repeindre.** `renderProfileStrip` porte un
cache `_lastHtml` et `renderFeed` un guard `_feedDomSig` : sans les invalider, le
rail garderait ses bulles génériques pour toute la session, référentiel pourtant
chargé.
