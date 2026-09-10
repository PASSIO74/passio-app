# Reprise des lectures de démarrage après une coupure réseau (2026-09-10)

## Le signal

Un rapport d'analyse externe décrivait des « échecs de fetch iOS liés au passage
en arrière-plan » : au démarrage, `passions`, `user_state` et
`rpc/declare_birth_year` tombaient en `TypeError: Failed to fetch`, sans code
HTTP. Le remède proposé : n'émettre les requêtes de démarrage que lorsque
`document.visibilityState === "visible"`.

**Rien n'a été appliqué avant d'avoir mesuré.** Ce qui suit vient de
`telemetry_events` (canal ① d'ADR-012, lecture seule), fenêtre de 14 jours au
2026-09-10.

## Ce que la production dit vraiment

| Mesure | Valeur |
|---|---|
| Appels morts (`type='api'`, `http_status = 0`, « Failed to fetch ») | **448** |
| Sessions concernées | **46** |
| Android / Chrome | **374** |
| Windows / Edge | **57** |
| Windows / Chrome | **17** |
| **iOS / Safari** | **0** |
| Précédés d'un `lifecycle hidden` dans la minute (Android) | 126 / 374 |
| Précédés d'un `lifecycle hidden` (bureau) | **0 / 74** |
| Échecs par seconde (moyenne / maximum) | **3,2 / 23** |
| Échecs suivis d'un appel réussi dans la même session | **92 / 448** |

Trois conclusions, et elles décident de la forme du correctif.

⚠️ **L'HYPOTHÈSE iOS EST FAUSSE, ET IL FAUT LE DIRE PLUTÔT QUE LA CORRIGER EN
SILENCE.** La base ne porte **aucune** ligne iOS de cette famille. Le raisonnement
« WebKit tue les requêtes d'une page en arrière-plan » est exact dans l'absolu et
sans rapport avec ce qu'on observe. Un correctif écrit sur cette prémisse aurait
visé un navigateur qui n'a pas le défaut.

⚠️ **LE PASSAGE EN ARRIÈRE-PLAN N'EXPLIQUE QU'UN TIERS DES CAS.** Zéro sur les
74 lignes de bureau. La cause dominante est la **perte de connexion** — et la
signature le confirme : 3,2 échecs par seconde, jusqu'à 23 d'un coup, c'est-à-dire
*toutes les requêtes en vol qui tombent ensemble*, pas une requête malchanceuse.

⚠️ **PERSONNE NE RÉESSAIE.** 92 échecs sur 448 seulement sont suivis d'un appel
réussi dans la même session. Le reste, la session le porte jusqu'au bout.

## Pourquoi la garde à l'aller était le mauvais remède

Attendre `visibilityState === "visible"` avant d'émettre :

1. **ne répare rien** — la requête coupée reste coupée, elle n'est pas rejouée ;
2. **rate deux tiers des cas** — la connexion perdue ne se voit pas dans la
   visibilité ;
3. **coûte au démarrage normal** — une page qui démarre masquée (préchargement,
   lancement PWA, onglet restauré) verrait son premier rendu retardé sans raison.

Ce qui manquait n'était pas une garde à l'ALLER, c'était un **rejeu au RETOUR**.

## Ce que le correctif fait

⚠️ **LES ÉCRITURES ÉTAIENT DÉJÀ COUVERTES, LES LECTURES NON — ET C'EST TOUT LE
DÉFAUT.** Chaque chemin d'écriture a sa file, branchée sur `online` :
`_flushPendingUserState`, `_delObFlush`, `_cmtObFlush`, `_flushOutbox`. Les
lectures de démarrage n'avaient rien. Une coupure d'une seconde au boot laissait
l'état du compte non restauré et le référentiel des passions tronqué **pour toute
la session**, sans un message et sans une seconde tentative.

### Le moteur (`js/app-02-state-utils.js`)

- `estEchecReseau(e)` — **seule autorité** qui sépare une panne de réseau d'un
  refus du serveur. Elle refuse par défaut, et écarte un refus par deux chemins
  indépendants : le code PostgREST/PostgreSQL (`42501`, `PGRST116`, `23505`…) et
  le statut HTTP. Elle reconnaît les libellés **réels** des quatre moteurs —
  Chrome/Edge « Failed to fetch », WebKit « Load failed », Firefox « NetworkError
  when attempting to fetch resource », iOS « The network connection was lost » —
  et le préfixe `FetchError:` que postgrest-js ajoute aux siens.
- `noterLectureAReprendre(nom, fn)` / `acquitterLecture(nom)` / `repriseLecturesBoot(raison)`.
- Déclencheurs : `online`, retour en visibilité, et une minuterie bornée
  (2 s → 8 s → 30 s).

### Les deux lectures câblées

- **`supaLoadUserState`** — panne réseau dans `{ error }` ou dans le `catch`.
- **`chargerReferentielPassions`** — panne réseau sur une page de la pagination.

## Les six pièges du lot

⚠️ **UNE COUPURE RÉSEAU N'EST PAS UN REFUS, ET LA CONFONDRE COÛTE LA SESSION.**
Quand `supaLoadUserState` échoue, la restauration n'est pas confirmée, donc
`_peutPousserEtat()` **interdit toute écriture d'état** jusqu'au prochain
démarrage. Cette garde est volontaire (une lecture ratée ne doit jamais effacer un
compte, cf. l'incident du 2026-09-02) — mais sans rejeu, une seconde de réseau
perdue gelait l'état du compte pour toute la session, en silence. Le rejeu ne
desserre pas la garde : il lui donne une seconde chance de se lever.

⚠️ **« CHARGÉ » ET « CHARGÉ ENTIÈREMENT » SONT DEUX ÉTATS.** Les branches d'échec
de `chargerReferentielPassions` publient volontairement un Set **partiel**
(« garder ce qu'on a plutôt que rien »), mais le cache à un seul coup
`if (_referentielPassions) return;` le figeait alors pour la session : une coupure
à la 2ᵉ des 6 pages installait une **liste blanche tronquée**, et
`estPassionCanonique` refusait ensuite à la publication des milliers de passions
légitimes — sans erreur, sans message. D'où `_referentielComplet`, qui ne passe à
`true` qu'à la **sortie propre** de la boucle. Le plafond dur (`PAGES_MAX`) ne
s'inscrit PAS à la reprise : ce n'est pas une panne, rejouer ne rendrait pas une
ligne de plus.

⚠️ **ON NE REJOUE QUE CE QUI EST IDEMPOTENT.** Les lectures, oui. Les écritures,
non — elles ont leurs files, qui portent leur propre logique d'acquittement et de
non-écrasement. Et `rpc/declare_birth_year`, cité par le rapport d'origine, n'est
**pas** inscrit : c'est un POST, `admissionRappelServeur` consomme déjà son
drapeau « une fois par session », et la porte d'admission **échoue ouvert** — son
échec n'a aucune conséquence utilisateur.

⚠️ **LE COMPTEUR D'ESSAIS VIT DANS UNE TABLE SÉPARÉE DU REGISTRE.** Le pilote
**désinscrit** la lecture avant de la rejouer (elle se réinscrit elle-même si elle
échoue encore, et le fait par `noterLectureAReprendre`, qui porte la borne). Un
compteur porté par l'entrée serait donc remis à zéro à chaque tour : **la borne ne
bornerait rien**, et une coupure durable ferait boucler le rejeu indéfiniment.

⚠️ **ON NE REJOUE JAMAIS DEPUIS UNE PAGE MASQUÉE NI HORS LIGNE.** Ce serait
refabriquer l'échec et **consommer un essai** — au bout de trois, la borne
croirait trois vraies tentatives faites et abandonnerait sans qu'aucune n'ait eu
lieu. Le retour en visibilité et `online` rappellent le pilote de toute façon.

⚠️ **PLUS RIEN À REJOUER = PLUS DE MINUTERIE.** La minuterie posée à la première
panne continuait de courir après que la borne a vidé le registre : un réveil pour
rien, et un état « armé » que le diagnostic rapportait alors qu'aucune reprise
n'était possible. `_armerReprise` **annule** au lieu de laisser expirer, et
`acquitterLecture` l'appelle — c'était peut-être la dernière.

## La télémétrie cessait de distinguer le bruit du défaut

⚠️ **« LA REQUÊTE A ÉCHOUÉ » ET « NOTRE CODE A UN DÉFAUT » NE SONT PAS LA MÊME
CHOSE.** Le hook `fetch` de `js/telemetry.js` peignait **tout** rejet en
`severity: "error"`, au même titre qu'un vrai défaut — 448 lignes en 14 jours,
dont des rafales de 23 à la seconde. Le centre de pilotage, c'est-à-dire
précisément l'écran qui sert à voir les vrais défauts, s'en trouvait rempli. Même
famille que « newestWorker is null » (2026-09-08) : *du bruit pur, qui polluait le
tableau de bord*.

La sévérité n'est dégradée en `warn` que lorsque la cause est **prouvée au moment
de l'échec** : page masquée, ou navigateur qui se déclare hors ligne
(`meta.masquee`, `meta.hors_ligne`). Un échec réseau **page visible et en ligne
reste une `error`** — celui-là, personne ne sait l'expliquer, et il ne doit pas se
taire. Le `status` reste `"error"` dans les trois cas : l'appel a bel et bien
échoué, on n'efface pas le fait, on cesse seulement de crier.

## Ce que la Sentinelle ne pouvait pas faire, et pourquoi

⚠️ **CETTE FAMILLE EST FILTRÉE COMME DU BRUIT PAR LE DÉTECTEUR LUI-MÊME.**
`estDuBruitApi` (`scripts/sentinelle-detecter.mjs`) écarte tout
`http_status = 0` : *« un appel qui n'a jamais atteint le serveur parle de la
CONNEXION de l'appareil, pas de notre code — et il n'y a rien à corriger »*. La
chaîne autonome n'aurait donc **jamais** ouvert d'issue là-dessus, quel qu'en soit
le volume. Ce filtre n'est pas retiré : il reste juste sur le fond (on ne peut pas
corriger le réseau d'un téléphone). Mais il a un angle mort qu'il faut nommer —
**il ne dit rien de ce que l'application FAIT de cet échec**, et c'était là que le
défaut se trouvait : nulle part on ne réessayait.

C'est la cinquième façon dont le canal peut manquer un vrai défaut, et la seule
qui soit **délibérée** : ⑤ *un signal classé « pas notre code » l'est sur sa
CAUSE, jamais sur sa CONSÉQUENCE.*

## Trois défauts introduits par le lot, trouvés en relecture (`audit-passio`)

Ils ne sont pas anecdotiques : deux d'entre eux rendaient le remède **pire que le
mal**, et aucun n'était visible aux 8 gates ni aux 12 cas d'origine.

⚠️ **① LE REJEU POUVAIT RÉTRÉCIR LA LISTE BLANCHE DES PASSIONS.** `vus` est
recréé à chaque appel, et les branches d'échec publient `vus` telle quelle. Un
premier chargement qui casse à la page 3 installe 3 000 identifiants ; le rejeu
repart de la page 0, casse à la page 1, et **remplace 3 000 par 1 000** — 2 000
passions légitimes refusées à la publication, par un rejeu censé réparer. C'est
exactement l'invariant écrit quarante lignes plus bas (« **LE RÉFÉRENTIEL SERVEUR
AJOUTE, IL NE RETRANCHE PAS** », 2026-08-31), que le cache à un seul coup faisait
tenir **tout seul** et que sa levée a exposé. `vus` est désormais amorcé sur
`_referentielPassions`. Verrou ⑬.

⚠️ **② LE REJEU DES PASSIONS ÉTAIT FIRE-AND-FORGET.** `chargerReferentielPassions`
ne rendait rien : le pilote la croyait terminée à l'instant où il l'appelait,
**consommait l'essai**, trouvait le registre vide et **désarmait la minuterie** —
alors que le vrai verdict tombait quelques secondes plus tard, avec personne pour
réinscrire. Elle rend maintenant une promesse qui se résout à **chaque** sortie,
sorties précoces comprises. Asymétrie avec `user_state`, dont le rejeu était
correctement `async` : la même famille que « un test qui tient par accident ».

⚠️ **③ UN `catch (_e) {}` NU DANS LE PILOTE, sur le chemin critique neuf.**
L'entrée venait d'être désinscrite et l'essai consommé : un `ReferenceError`
(renommage d'une lecture, `renderEverything` disparu) était avalé **et** l'entrée
perdue. Au bout de trois tours muets, le moteur s'éteignait en rendant un registre
vide — **indiscernable de « tout va bien »**. C'est la faute `diagLog` = fil vide
six jours, réinstallée dans le correctif qui la cite.

Quatre points de robustesse ajoutés dans la foulée :

- **TTL de 120 s sur une entrée du registre.** Le retour en visibilité peut
  arriver des heures plus tard : rejouer alors `user_state` ferait réappliquer un
  blob serveur par-dessus une session vivante — `_applyUserState` remplace `state`
  clé par clé et sa fusion défensive ne couvre **pas** `userPosts`. Le rapport
  d'origine le disait déjà (« à encadrer par une TTL courte »).
- **`Promise.race` de 20 s autour du rejeu**, et **péremption de 60 s sur
  `_referentielEnCours`** : un `fetch` qui ne se règle **jamais** (réseau mort sans
  rejet, courant sur mobile) gelait sinon `_repriseEnCours` — donc *toutes* les
  autres lectures — et figeait le référentiel aux 19 identifiants du socle.
- **Réarmement avant les deux sorties « masquée / hors ligne ».** Elles précèdent
  le `finally` qui réarme, et le callback de la minuterie avait déjà remis
  `_repriseTimer` à `null` : plus aucune minuterie ne courait, registre plein, et
  `_repriseEtat().arme` rendait `false` **en mentant**.
- **`estEchecReseau` : seul un code de type CHAÎNE prouve un refus serveur.**
  `DOMException` porte un `code` **numérique** hérité (`AbortError` 20,
  `TimeoutError` 23, `NETWORK_ERR` 19) : tester la simple présence écartait de
  vraies pannes réseau — l'inverse exact du but.

⚠️ **ET LA GATE QUI AURAIT DÛ LES VOIR NE REGARDAIT PAS.** `npm run audit:globals`
ne détectait que `function` et `var` : les **11 déclarations `let`/`const` de
premier niveau** de ce lot étaient hors de son périmètre. Le mode d'échec y est
pourtant **pire** — une `function` redéclarée est écrasée en silence, un
`let`/`const` redéclaré lève un `SyntaxError` qui **tue le script entier**. La
gate couvre désormais les deux (1 430 → 1 595 déclarations scannées, aucune
collision préexistante trouvée).

## Verrous

- `tests/e2e/reprise-lectures-boot.spec.js` (13), dont ②, ⑨ et ⑪ éprouvés par
  **RÉINJECTION** du défaut, et ⑫ qui mesure le **CÂBLAGE à la source** — sans
  lui, le moteur pourrait rester vivant et n'être appelé par personne, la suite
  entière restant verte (faute déjà commise sur « Gérer mes passions » le
  2026-09-03).
- ⚠️ Le cas ⑪ exige `?telemetry=1` : en local la télémétrie est en **opt-in
  strict**, et sans lui les hooks passifs ne sont même pas installés
  (`if (!ENABLED) return;`) — le banc mesurerait le vide en se croyant vert.
- ⚠️ Le faux client Supabase se pose en **MUTANT** `window.supa.from`, jamais en
  remplaçant le binding : `supa` est un `let` de portée script (app-08), donc
  `window.supa = x` crée une propriété **séparée** que le code applicatif ne
  regarde jamais. Même famille que le `Object.defineProperty` exigé pour
  `supa.functions` (fiche « notifier un message privé »).

## Points ouverts

1. Les autres lectures de démarrage (`posts`, `profiles`, `follows`,
   `notifications`, `conv_members`, `video_lives`, `event_attendees`) ne sont pas
   encore inscrites au registre. Elles ont chacune leur repli et leur cache ; le
   moteur les accepte telles quelles (`noterLectureAReprendre(nom, fn)`), c'est un
   câblage à faire lecture par lecture, en mesurant ce que chacune coûte quand
   elle manque.
2. Le rejeu ne prévient pas l'utilisateur. Tant que la reprise aboutit, se taire
   est juste ; au troisième essai perdu, l'application continue avec un état
   partiel **sans le dire**. À trancher avec le message d'état hors ligne existant.
3. `severity: "warn"` n'est pas `severity: "info"` : ces lignes restent visibles au
   centre de pilotage, volontairement. Si le volume gêne encore, la question à
   poser est « combien de sessions », jamais « combien de lignes » — 448 échecs
   sur 46 sessions ne sont pas 448 incidents.
