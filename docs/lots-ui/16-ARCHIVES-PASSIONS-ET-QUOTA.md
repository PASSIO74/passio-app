# Archives de passions et quota de changements — 2026-09-02

> « J'ai essayé d'archiver une passion, de passer à une autre, puis de revenir à
> celle archivée : elle n'apparaissait plus. Il faut les enregistrer et en faire
> une liste. Dans la démo sans compte, illimité ; sur un compte créé et une
> utilisation courante, limiter à trois changements par exemple, ensuite passer
> au mode payant. Sinon les utilisateurs archivent autant de passions qu'ils
> veulent et changent quand ils veulent, et la fonction payante n'est plus
> utile. » — Benjamin, après essai réel.

Fichiers : `js/app-06-reels-partage.js` (moteur), `js/app-02-state-utils.js`
(normalisation + fusion serveur), `index.html` (`#passionArchiveBox`).
Verrou : `tests/e2e/passions-archive-quota.spec.js` (29 cas). Aucune migration
Supabase, aucun CSS neuf : le journal voyage dans le blob `user_state` et la
liste réutilise les classes `.v8-switch-*` du lot UI-8.

---

## 1. Le défaut, et ses TROIS causes

Le symptôme était un seul — « la passion archivée n'apparaissait plus » — mais
trois défauts distincts y menaient, chacun suffisant à lui seul.

### ① Une porte fermée sans issue

`restaurerPassion` gardait le plafond de trois passions vivantes (à raison :
sans ce garde, on archivait une passion et on en restaurait deux). Mais son
refus ouvrait `openPassionPaywall()` **sans rien dire de la cible ni de la
sortie**. Concrètement, sur le parcours vécu :

1. trois passions vivantes, on en archive une → deux vivantes, une place libre ;
2. on prend une autre passion → trois vivantes, plafond atteint ;
3. on revient chercher la première dans les archives → **la fenêtre payante
   remplace la liste, la passion reste rangée, et il n'y a plus rien à cliquer.**

La fenêtre disait « archives-en une pour en activer une autre » : un conseil
juste, et aucun moyen de le suivre depuis l'endroit où on se trouvait.

**Correctif.** `restaurerPassion` passe désormais l'id de la cible :
`openPassionPaywall({ restaurer: pr.id })`. La fenêtre liste alors les passions
vivantes avec un bouton « Ranger » chacune, et `echangerPassion(idArchivée,
idVivante)` fait les deux gestes d'un coup. C'est la sortie qui manquait.

### ② Une liste qui n'existait pas

La seule trace d'une passion rangée était un **lien** (`🗄️ Passions archivées
(1)`) dans `#profilesQuotaSub`, lui-même dans `#passionManager`, un panneau
`hidden` qui ne s'ouvre que depuis le menu ⋯ du profil → « Mes passions ».
Trois portes fermées devant une passion qu'on venait de ranger. Du point de vue
de l'utilisateur, elle avait disparu — et il avait raison de le dire.

**Correctif.** `#passionArchiveBox`, rendu **en clair** sous les cartes, avec la
date d'archivage et un bouton par ligne. La modale `openArchivedPassions` reste
(elle sert au retour depuis la fenêtre payante) mais n'est plus le seul chemin,
et les deux surfaces partagent **un seul** constructeur de ligne,
`_lignesArchiveesHTML` — deux rendus de la même liste auraient divergé au
premier ajustement, et c'est la liste qui dit à l'utilisateur ce qu'il possède.

### ③ Un plafond qui ne bornait rien

`PASSIONS_OFFERTES = 3` comptait les passions **vivantes**. Archiver libérait
une place, gratuitement et sans limite : un compte pouvait donc posséder
l'intégralité du référentiel — 1 908 passions — en faisant tourner ses trois
emplacements. L'offre payante ne vendait rien que le compte gratuit n'avait
déjà.

**Correctif.** Ce n'est pas « trois passions » qui se vend, c'est **la liberté
d'en changer**. C'est donc le changement qui est compté.

---

## 2. Le quota — ce qui compte, et ce qui ne compte pas

`CHANGEMENTS_PASSION_OFFERTS = 3` (app-06).

| Geste | Consomme ? | Pourquoi |
|---|---|---|
| Ajouter une passion sous le plafond | non | c'est la dotation initiale, pas un changement |
| **Archiver une passion vivante** | **oui, 1** | seul geste qui libère une place |
| Restaurer une archive sous le plafond | non | on ne fait pas payer deux fois le même échange |
| Échanger (`echangerPassion`) | 1 | l'archivage qu'il contient, et lui seul |
| Archiver la dernière passion vivante | non | refusé, et un refus ne débite jamais |
| Archiver une passion **déjà** archivée | non | rien ne se libère |

Un échange complet coûte donc **1**. Trois échanges, puis l'offre payante.

### Le journal EST le compteur

`state.user.passionChanges = { entries: [{ type, passion, label, emoji, at,
compte }] }`. Le nombre de changements consommés se **lit** dans le journal
(`changementsPassionUtilises()`), il n'est pas tenu à côté : un compteur tenu à
part de son historique finit toujours par le contredire — et c'est l'historique
qu'on montre à l'utilisateur. Le journal est borné à 100 entrées (il voyage
dans `user_state`, envoyé à chaque sauvegarde) ; le quota étant de trois, la
troncature ne peut pas rendre de changement.

**Les passions archivées, elles, ne sont PAS dupliquées dans un second
magasin** : elles restent les entrées `archived: true` de `state.user.profiles`,
comme depuis le lot UI-8. Une seconde liste tenue en parallèle aurait divergé de
la première au premier correctif — la colonne jsonb `profiles.passions` a déjà
coûté ce prix-là au dépôt.

---

## 3. La démo sans compte est illimitée — et le reste

**Deux règles distinctes, et les confondre a coûté un trou réel.**

| | Démo sans compte | Compte |
|---|---|---|
| Plafond de 3 passions vivantes | **s'applique** | s'applique |
| Quota de 3 changements | **illimité** | s'applique |

« Illimité en démo » porte sur les **changements** — ranger et reprendre autant
qu'on veut en essayant l'application. Le **plafond** de trois passions vivantes,
lui, reste ce qu'il était avant ce lot : universel.

> ⚠️ **LE CRÉDIT DE DÉMO — mesuré, puis refermé le 2026-09-02.** Une première
> version de ce lot exemptait la démo des DEUX règles. Le trou était réel et
> reproductible : la porte d'ajout n'est **pas** gardée par
> `requireAuthentication` — le lot « première visite » la laisse ouverte
> délibérément — donc un visiteur atteignait `#screen-profiles`, y trouvait
> « Ajouter une passion », en ajoutait **huit**, puis créait son compte.
> `state.onboarded` basculait et il gardait ses huit passions vivantes,
> définitivement au-dessus du plafond. C'est le miroir exact de la dette de
> démo — un **crédit** de démo — et il défaisait l'offre payante aussi sûrement
> que la rotation illimitée qu'on venait de fermer. Mesure avant/après, par le
> moteur d'ajout réel : 8 acceptées → 3 acceptées. Verrou : `④ quater`.

`plafondPassionsActif()` reste donc universel, et `quotaChangementsActif()`
= `plafondPassionsActif() && comptePassioReel()` porte seule l'exemption.
Un visiteur qui s'inscrit arrive **dans son dû**, sans qu'on ait rien à lui
reprendre au passage.

`comptePassioReel()` (app-06) décide, **une seule fois**, de ce qu'est un
compte : `state.onboarded` vrai, ou un uuid Supabase connu. C'est le miroir
exact de `PassioFirstRun.compteExistant()`.

> ⚠️ **On ne délègue PAS à `PassioFirstRun`.** Ce module a sa propre coupure
> (`first_run_experience_v1`) : un quota qui s'éteindrait avec le drapeau d'un
> AUTRE lot serait une porte dérobée par kill switch.

> ⚠️ **`MY_UID` n'est pas une preuve de compte.** `getMyUserId()` fabrique un
> identifiant local `u_xxxxxxxx` au chargement du script, pour tout le monde,
> toujours. Seul un uuid Supabase prouve un compte — leçon du lot « première
> visite », payée par une landing qui s'affichait pour tout le monde.

### Le piège central du lot : la dette de démo

`state.onboarded` bascule à la création du compte. Sans précaution, un visiteur
qui a essayé l'application — c'est-à-dire exactement ce que la démo illimitée
l'invite à faire — arrivait sur son compte tout neuf avec ses trois changements
**déjà consommés** : la démo illimitée facturait, avec un jour de retard.

D'où le marqueur `compte`, posé **à l'écriture** (`_inscrireChangementPassion`),
au moment où l'on sait encore que c'était une démo, et figé ensuite.
`_estChangementFacturable` ignore les entrées `compte: false`. Une entrée **sans
marqueur** vient d'un client antérieur au lot : elle compte, car seuls les
comptes réels écrivaient alors.

Le même prédicat est recopié — et signalé comme tel — dans la fusion serveur
d'app-02. C'est la seule duplication du lot, et elle est nommée.

---

## 4. Les gardes, aux DEUX bouts

Leçon de `meOpen`, prise dans les deux sens :

- **La porte** : `confirmArchivePassion` refuse d'ouvrir la confirmation quand
  le quota est épuisé. Laisser l'utilisateur lire, comprendre et valider un
  archivage qu'on refusera ensuite serait un cul-de-sac.
- **Le point d'écriture** : `archiverPassion` re-vérifie. Tout appelant futur
  passe par là — `echangerPassion`, un test, un deep link. `_inscrireChangement-
  Passion` refuse d'inscrire un quatrième archivage, et **sans inscription on
  n'écrit rien** : le compteur ne peut donc pas diverger de l'état.

L'ordre à l'intérieur d'`archiverPassion` est lui aussi un invariant : la garde
« au moins une passion vivante » et la garde « déjà archivée » passent **avant**
l'inscription au journal. Un refus qui débite est pire qu'un refus — l'utilisateur
paie un geste qui n'a pas eu lieu (`③ sexies`, `③ septies`).

---

## 5. L'échange, et sa reprise

`echangerPassion(idArchivee, idVivante)` n'invente aucun moteur : elle enchaîne
`archiverPassion(…, true)` puis `restaurerPassion(…, true)` — les deux seuls
points d'écriture — dans l'ordre qui garde l'invariant (on libère **avant** de
reprendre ; l'inverse buterait sur le plafond). Le drapeau `silencieux` évite
le toast et le re-rendu intermédiaires : l'écran afficherait sinon une seconde
un état à deux passions que personne n'a demandé.

> ⚠️ **Si la restauration échoue, la passion rangée revient.** Sans cette
> reprise, un échec laisserait le compte à deux passions **et** un changement
> consommé pour rien. La reprise retire aussi l'entrée de journal qu'elle vient
> de poser : le changement n'a pas eu lieu, il ne doit pas être facturé.

---

## 6. Ce que le lot ne fait pas

- **Aucun tarif, aucun bouton « payer ».** L'offre n'est pas ouverte ; un bouton
  qui ne mène nulle part est un clic mort. Verrou déjà posé par
  `passions-plates.spec.js` (㉒), qui interdit tout montant et tout verbe d'achat
  dans la fenêtre.
- **Aucune monnaie intermédiaire** (ADR-009) : le paiement futur sera direct, en
  monnaie réelle.
- **Aucune facturation rétroactive** : un compte de production existant arrive
  sans journal, donc avec ses trois changements intacts.
- **Aucune preuve serveur.** La suite e2e exerce la persistance locale (un
  rechargement) ; la fusion `supaLoadUserState` — qui garde le journal **le plus
  long**, jamais le plus récent, pour qu'un `localStorage` vidé ne rende pas des
  changements consommés — est relue, pas exécutée contre la base.
- **Le quota est côté client.** Il est contournable par quelqu'un qui édite son
  `localStorage`. C'est un choix assumé tant que le paiement n'est pas ouvert :
  le jour où il le sera, la vérité devra passer côté serveur (une colonne sur
  `profiles`, ou une table `user_passion_changes` avec sa RLS).

---

## 6 bis. Les portes oubliées, trouvées par audit adversarial

Le plafond a été posé le 2026-09-01 sur `ajouterPassionAuCompte`. Un audit
adversarial lancé avant la mise en ligne a montré que **deux autres chemins**
écrivaient dans l'ensemble vivant sans jamais y passer — un plafond qui ne tient
qu'à la porte qu'on avait en tête ne tient pas.

**① `quickCreateProfile` (app-07).** « + Créer profil », sur la page d'une
passion, poussait DIRECTEMENT dans `state.user.profiles` : ni plafond, ni quota,
ni journal, ni déduplication avec une entrée archivée de la même passion. Une
quatrième, une cinquième, une dixième passion vivante — et un doublon garanti si
la passion existait déjà en archive. Elle délègue maintenant au moteur unique.
Verrous : `⑥`, `⑥ bis`, `⑥ ter`.

**② Le Studio (`js/passions-flat-ui.js`).** `onValider` écrivait
`sel.value = id` **avant** d'appeler `ajouterPassionAuCompte`. Au plafond,
l'ajout était refusé — fenêtre payante à l'écran — mais `#postPassion`, *la seule
source de vérité de `publishPost`*, pointait déjà la passion refusée : on
publiait dans une quatrième passion qu'on ne possède pas, **en silence**. C'est
le piège de `studioType` (lot UI-6) repris à l'identique. On acquiert d'abord, on
écrit ensuite — et le test de succès n'est pas la valeur rendue
(`ajouterPassionAuCompte` rend `null` aussi bien pour un refus que pour une
restauration réussie) mais « la passion est-elle vivante maintenant ? ».
Verrou : `⑦`.

**③ Le mur qui était une boucle.** Au plafond avec le quota épuisé, le bouton
d'une archive disait « Échanger » et ouvrait une fenêtre payante *sans* liste
d'échange, dont l'unique action ramenait au panneau — où le même bouton
attendait. Le bouton dit maintenant « Indisponible », et la fenêtre retire
« Gérer mes passions » quand elle ne mène plus nulle part. Verrou : `⑧`.

**④ La liste qu'on ne savait pas ouvrir.** `#passionArchiveBox` rend la liste en
clair, mais dans `#passionManager`, `hidden` par défaut : après un rechargement,
rien à l'écran ne disait qu'on possède encore une passion rangée. L'entrée
« 🗂️ Mes passions » du menu ⋯ — seule porte visible — porte désormais le compte
(« Mes passions (1 archivée) »). Verrou : `⑨`.

## 6 ter. La fusion multi-appareils — dette assumée, puis refermée (2026-09-03)

Ce lot a été livré le 2026-09-02 avec **une dette écrite noir sur blanc** : la
« fusion défensive » de `supaLoadUserState` réinjecte les profils locaux absents
du serveur sans consulter le plafond. Mesuré le lendemain sur le code en
production : deux appareils portant chacun trois passions **différentes**
convergeaient vers **six vivantes**, le plafond annonçant « 0 place restante »
pendant que le compte en possédait six. Aucun geste volontaire n'était requis —
un second téléphone suffisait, et l'offre payante tombait.

Le défaut n'avait pas été corrigé le jour même pour une raison qui tenait : le
correctif évident — archiver « le surplus » — **aurait rétrogradé
silencieusement les passions de comptes de production** qui en portent
légitimement plus de trois (le plafond date du 2026-09-01, les comptes le
précèdent). Détruire de la donnée réelle pour fermer un contournement à deux
appareils aurait été un mauvais échange.

**La forme qui rend le correctif acceptable** : `reinjecterProfilsLocauxBornes`
(app-02) ne borne QUE ce que la fusion **ajoute**. L'état serveur fait foi et
n'est jamais touché — un compte à cinq passions vivantes en garde cinq. Seules
les entrées réinjectées au-delà de la place restante arrivent `archived: true` :
elles sont donc dans la liste des archives, d'où l'utilisateur les reprend quand
il veut, par l'échange.

> ⚠️ **Rien n'est supprimé, rien n'est facturé.** Les six entrées survivent à la
> fusion, trois rangées. Aucune n'est inscrite au journal des changements :
> ranger une passion à la fusion n'est pas un geste d'utilisateur, et l'inscrire
> ferait qu'un simple changement de téléphone débiterait le quota.

> ⚠️ **Fonction NOMMÉE, exercée telle quelle par les tests.** Une copie de ces
> règles dans un spec ne prouverait que sa propre cohérence — c'est ce que
> `audit-tests-creux.js` traque, et la raison pour laquelle
> `restaurerPassionActiveApresFusion` avait déjà été extraite.

> ⚠️ **Le plafond est lu paresseusement** (`PASSIONS_OFFERTES` vit dans app-06,
> chargé après app-02) et son absence vaut « pas de plafond » : un kill switch ne
> doit jamais ranger une passion. Verrou : `⑩ sexies`.

Verrous : `⑩` à `⑩ sexies` de `tests/e2e/passions-archive-quota.spec.js`.

**Ce qui reste ouvert.** Le quota est toujours **côté client**, donc
contournable en éditant son `localStorage`. Choix assumé tant que le paiement
n'est pas ouvert ; le jour où il le sera, la vérité devra passer côté serveur.

## 7. Coupures

`localStorage.flat_passions_v1 = "0"` ou `window.PASSIO_FLAT_PASSIONS = false`
rendent le comportement historique à l'octet près : ni plafond, ni compteur, ni
annonce de coût. `localStorage.passio_ui_8 = "0"` retire l'archivage entier (et
avec lui la liste : `renderPassionArchiveBox` se vide et se masque — une cible
supprimée emporte tout ce qui la vise).
