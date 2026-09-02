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

Elle est appelée aux **DEUX** entrées, et à chaque fois **AVANT** `MY_UID` et
`localStorage.passio_uid` :

- `onbDoAuth`, branche `signin` (app-02) — la connexion explicite ;
- `boot()`, branche « session retrouvée » (app-08) — retour de
  `signInWithOAuth`, lien de confirmation d'e-mail qui ouvre directement une
  session.

⚠️ **Le discriminant est `passio_uid`, et il doit être lu avant d'être réécrit.**
Les deux points d'entrée écrivaient l'identifiant du compte AVANT tout le reste :
lu après, il aurait toujours répondu « c'est déjà le sien ». `getMyUserId`
fabrique par ailleurs un placeholder `u_xxxxxxxx` pour tout le monde — un
appareil qui explore en porte un, et **il ne prouve aucun compte** (même piège
que `MY_UID`). Seul un uuid Supabase compte.

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

⚠️ **On n'adopte rien avant que le compte ait parlé.** `passio:app-ready` part au
CHARGEMENT du script d'application, donc AVANT que `boot()` ait fini d'attendre
`supaLoadUserState` : à 1 200 ms, un vrai compte ressemble encore à un compte
neuf. `reprise()` attend `window._etatCompteCharge` (posé à CHAQUE sortie de
l'hydratation, sorties précoces comprises), borné à ~7 s — hors ligne, le verdict
ne vient jamais et il vaut mieux trancher sur le repli que perdre les choix du
visiteur.

### Verrous

`tests/e2e/exploration-anonyme-vs-compte.spec.js` (5). Le premier cas
**REPRODUIT le défaut** — sans la garde, le POST vers `user_state` porte bien les
passions de l'exploration — de sorte que le second prouve quelque chose.
`tests/e2e/first-run.spec.js` couvre les deux sens de la migration (compte qui a
ses passions / compte neuf) et le repli hors ligne.

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
