# Journal — Sécurité serveur, RLS, droits, migrations, Edge Functions, ouverture au public

> **Fiches déplacées TELLES QUELLES de `CLAUDE.md` le 2026-10-05.** `CLAUDE.md` est rechargé à
> chaque session et avait atteint 410 000 caractères (Claude Code alerte dès 40 000) : il ne garde
> plus que les règles qui valent partout. Ici vivent le récit, les mesures et les pièges de chaque
> lot — **à lire AVANT de toucher au domaine.** Un commentaire du code qui cite « CLAUDE.md § … »
> désigne une fiche de ce dossier : `grep -rn "<début du titre>" docs/journal/`.
> **Nouvelle fiche** : à la FIN du fichier de son domaine, titre `## <emoji> <TITRE> (AAAA-MM-JJ)`.
> Si elle porte une règle qui vaut pour TOUTE modification, une seule ligne de plus dans la section
> « Journal par domaine » de `CLAUDE.md` — jamais la fiche elle-même.

## Sommaire

- 🔁 401 SUR `events` / `event_attendees` — LA MÊME ENQUÊTE TROIS FOIS DANS LA JOURNÉE (2026-09-12)
- 🔁 401 SUR `POST /rest/v1/user_state` — L'ÉTAT D'UN VISITEUR PARTAIT VERS UNE TABLE QUI N'ACCEPTE QUE `auth.uid()` (2026-09-13)
- 🔁 TROIS TABLES DE PLUS EN 401, UNE EN 403 — ET LE 403 N'AVAIT PAS LA MÊME CAUSE (2026-09-13)
- 🔒 PIÈCES JOINTES DE MESSAGERIE — la lecture était OUVERTE À TOUS (2026-09-08)
- 📍 RENCONTRES — adresse, téléphone et participants n'étaient PAS privés (2026-09-08)
- 🧰 APPLIQUER LES CORRECTIFS DE SÉCURITÉ — deux outils, un seul geste (2026-09-08)
- 🧯 LA RESTAURATION A ÉTÉ FAITE — et six défauts que la relecture ne voyait pas (2026-09-14)
- 🚦 AUDIT GO/NO-GO DE COMMERCIALISATION (2026-09-10) — et les cinq défauts qu'il a trouvés
- 🚧 EDGE FUNCTIONS SANS PLAFOND — un compte confirmé facturait l'IA en boucle et réveillait qui il voulait (2026-09-12, soir)
- 🚀 OUVERTURE PUBLIQUE GRATUITE — SEPT DÉFAUTS SERVEUR, UN LOT CLIENT, DEUX CANAUX D'EXPLOITATION (2026-09-11, après-midi)
- 🚪 OUVERTURE AU PUBLIC — UN SEUL COLLER SQL, ET LA CI QUI MANGEAIT LA BANDE PASSANTE (2026-09-11)
- 🧭 `search_path` FIGÉ — et pourquoi `''` n'est PAS la bonne réponse partout (2026-09-12)
- 🧹 QUATRE SURFACES QUI VIEILLISSAIENT SANS TÉMOIN (2026-09-12, le soir)

---

## 🔁 401 SUR `events` / `event_attendees` — LA MÊME ENQUÊTE TROIS FOIS DANS LA JOURNÉE (2026-09-12)

Trois issues `[SENTINELLE]` le même jour, deux tables, **une seule cause** — et la troisième ne
décrivait plus aucun défaut vivant. C'est la fiche que la chaîne ne sait pas écrire (section
précédente) : sans elle, elle rejoue l'enquête au tour suivant, ce qui est très exactement ce qui
s'est passé ici.

**La cause, établie dans le code.** `migration_irl_donnees_privees.sql` (08/09) retire à `anon`
`events.address` et `events.contact` et lui révoque `event_attendees` ; `migration_ouverture_publique`
(11/09) y ajoute `events.conv_id`. Le client demandait pourtant la liste PRIVÉE **d'abord, pour tout
le monde**, et ne retombait sur la publique qu'APRÈS le refus — une porte fermée exprès, à laquelle
on frappait une fois par session sans compte (`js/first-run.js` → `chargerContenuPublic` →
`supaLoadEvents`, PLUS le bloc « 3. Les autres requêtes » de `supaInit` : deux refus par démarrage).
⚠️ **PostgREST refuse la requête ENTIÈRE (42501) dès qu'UNE colonne manque au rôle** : ce n'est pas
« deux champs masqués », c'est « aucune rencontre ». ⚠️ **401 et non 403** : 403 quand un compte est
authentifié, **401 quand le rôle est `anon`**. Lire le CODE avant d'accuser une policy — la policy
était juste, le GRANT manque exprès, donc la cause n'est PAS une règle d'accès (hors périmètre de la
chaîne) mais un appel client qui ne devait plus partir. Correctifs : `_compteAuthReel()` (un uuid
Supabase, jamais `MY_UID`) décide des colonnes, et `_attendeesLisibles()` de la table des
participants. Verrous : `tests/e2e/evenements-cols-visiteur.spec.js` et
`tests/e2e/participants-visiteur.spec.js`.

⚠️ **« 0 COMPTE IDENTIFIÉ » EST LA PREUVE, PAS UN DÉTAIL.** `telemetry.js` ne transmet un `user_id`
que si `MY_UID` est un **uuid d'auth** (`authUserId`) : 17 refus / 0 compte veut dire « 17 refus chez
des clients SANS compte », donc le chemin visiteur, donc celui que le correctif ferme. C'est le
discriminant à lire en premier sur tout refus d'écriture ou de lecture remonté par ce canal.

⚠️ **ET LE DISCRIMINANT QUI DIT « CE N'EST PAS UN PROBLÈME DE JETON » MALGRÉ LE LIBELLÉ DE L'ISSUE** :
« refusé — jeton absent ou expiré » est le **gabarit** de `libelleApi()` pour tout 401, pas une
mesure. Un jeton mort ne connaît pas les tables : il ferait tomber `posts`, `profiles` et `passions`
dans le même démarrage. Un 401 qui ne frappe QUE `events` et `event_attendees` désigne le GRANT de
colonnes, jamais la session.

⚠️ **POURQUOI LA TROISIÈME ISSUE EXISTE, ET C'EST LA CINQUIÈME FAÇON DONT LE CANAL MANQUE SA CIBLE.**
`dejaCorrige` se tait quand **toutes** les occurrences précèdent la **FERMETURE** d'une enquête
identique (le titre est déterministe : `GET /rest/v1/events 401 · 138b32a1`). Or une enquête se ferme
à la **FUSION** de sa PR, et le défaut ne s'arrête qu'à son **DÉPLOIEMENT** — strictement plus tard
(cycle CI ~30 min), et plus tard encore pour toute page déjà chargée, qui garde son `app.js` jusqu'à
son prochain démarrage. La fenêtre de 24 h porte donc des occurrences **postérieures à la clôture et
antérieures au correctif**, et une seule suffit à rouvrir. **Une réouverture n'est pas une récidive
tant que la dernière occurrence n'est pas postérieure au DÉPLOIEMENT.**
⚠️ **Ce qui se mesure avant de croire à une quatrième**, et ça ne se lit pas dans le dépôt : le
`app.js` **servi** par https://passio-app.netlify.app porte-t-il `_compteAuthReel` ? Si oui, la
cause reportée est éteinte et il ne reste qu'à refermer. Une fiche du dépôt ne prouve pas l'état de
la production (même règle que pour l'interrupteur `irl_adult_only`).

⚠️ **CE QUI RESTAIT VRAIMENT OUVERT DANS LA MÊME FONCTION : UN MÉMO QUI SURVIVAIT À SA CAUSE.**
`_eventColsPubliquesSeulement` se pose sur **n'importe quel** refus de la demande privée — donc aussi
sur un `PGRST301` « jeton absent ou expiré », qui n'a plus aucune cause au jeton suivant. Il tenait
pourtant toute la session : pour un compte qui a **pleinement droit** à ces colonnes et dont le jeton
avait juste expiré le temps d'un démarrage (application reprise après quelques heures : le cas
normal), `address`, `contact` et `conv_id` revenaient VIDES jusqu'au rechargement complet — adresse
du rendez-vous absente, téléphone de l'organisateur absent, « rejoindre la conversation » sans
`conv_id`. Son voisin `_attendeesRefusLecture` avait sa levée sur `SIGNED_IN`/`TOKEN_REFRESHED`
depuis le début (« un silence ne doit pas survivre à la cause qu'il protégeait ») ; les deux la
partagent désormais en **UN SEUL point**, `_oublierRefusLecturesIRL()` — deux levées côte à côte
finissent par diverger, et c'est la seconde qu'on oublie. Verrou : `evenements-cols-visiteur.spec.js`
⑤ (le CÂBLAGE, à la source — une levée sans appelant serait le défaut `_notifierMessage`) et ⑤ bis
(le comportement).

## 🔁 401 SUR `POST /rest/v1/user_state` — L'ÉTAT D'UN VISITEUR PARTAIT VERS UNE TABLE QUI N'ACCEPTE QUE `auth.uid()` (2026-09-13)

Même famille que la section précédente, une table plus loin. Mesuré sur 14 jours : **261 refus, 101
sessions, 0 uuid d'auth** dans ces sessions — le chemin visiteur, et rien d'autre. `user_state` porte
86 lignes, toutes en uuid ; ses quatre policies `*_own` exigent `auth.uid()`.
**La cause est dans le client, pas dans la policy.** `getMyUserId()` fabrique un `u_<aléatoire>` pour
tout visiteur, et les gardes des chemins d'écriture d'état (`_scheduleStateSync`, `supaSaveUserState`,
le beacon de `pagehide`, `_flushPendingUserState`) ne testaient que `!MY_UID` : le placeholder passait,
et chaque `saveState()` sans compte POSTait l'état sous le rôle anonyme → 401.
⚠️ **LE TUYAU DOMINANT N'ÉTAIT PAS LE BEACON** (4 refus sur 261 précédés d'un `hidden`) mais le
debounce de 2,5 s après `saveState()`, dès le démarrage (`ios_boot_feed` → `ui_v4a4_pose` → `hint_shown`
→ 401). ⚠️ **ET LE DÉFAUT S'AMPLIFIAIT TOUT SEUL** : le 401 mettait le blob en file
(`passio_pending_user_state_u_xxx`), que le rejeu du démarrage suivant rejouait — PATCH 200 (zéro
ligne), SELECT, INSERT 401 — d'où 87 des 101 sessions avec ce PATCH. Un correctif qui n'aurait touché
que l'envoi aurait laissé la file rejouer le 401 à chaque visite.
Correctif : **une seule autorité**, `_uidEstUnCompte()` (app-02 — pas `_compteAuthReel` d'app-08,
parce que le beacon tire dans `pagehide` et qu'app-02 ne doit dépendre de rien chargé après lui), et
les QUATRE chemins passent par elle ; le rejeu retire la file d'un placeholder au lieu de la rejouer.
La **lecture** (`supaLoadUserState`) n'est PAS touchée : un GET sans compte rend 200 vide, ce n'est
pas un défaut, et `reprise-lectures-boot.spec.js` l'exerce avec le placeholder. Verrou :
`tests/e2e/user-state-invite.spec.js` (5), ⓪ à ③ éprouvés par RÉINJECTION (4 rouges sur le code
d'avant), ④ garde la porte ouverte aux comptes réels.
⚠️ **CE QUI RESTAIT OUVERT DANS LA MÊME FAMILLE EST FERMÉ LE MÊME JOUR** : `profiles`,
`story_views`, `conv_reads` et `push_subscriptions` suivaient — voir la fiche suivante.

## 🔁 TROIS TABLES DE PLUS EN 401, UNE EN 403 — ET LE 403 N'AVAIT PAS LA MÊME CAUSE (2026-09-13)

Suite directe de #367, et **son second étage**. Mesuré en production le jour même
(`telemetry_events`, `type='api'`), tous des **POST** :

| Cible | Statut | Refus | Sessions | Comptes | Dernier |
|---|---|---|---|---|---|
| `profiles` | 401 | 104 | 101 | **0** | 07:16 |
| `story_views` | 401 | 17 | 3 | **0** | 08/09 |
| `conv_reads` | 401 | 13 | 5 | **0** | 12/09 |
| `push_subscriptions` | **403** | 17 | 12 | **3** | **05:51** |
| `conv_reads` | **403** | 2 | 2 | **1** | **05:29** |

⚠️ **IL Y A DEUX CAUSES, ET C'EST LE CODE HTTP QUI LES SÉPARE — jamais le libellé.**
**401 avec 0 compte** = rôle anonyme : le placeholder `u_<aléatoire>` de
`getMyUserId()` passait la garde `!MY_UID`, exactement comme pour `user_state`.
Gardes posées sur `supaMarkRead`, `supaMarkStoryView` et — pour `profiles` — sur le
**démarrage** (`_compteAuthReel()`, l'autorité déjà présente dans app-08 : on n'en a
pas créé une troisième). **403 AVEC un compte** = le jeton est joint et valide, donc
la session existe : ce n'est pas elle qui manque.

⚠️ **ET LA GARDE DE `profiles` N'EST PAS DANS `supaEnsureProfileExists` — un run
rouge a payé cette leçon.** Posée là, elle faisait tomber **quinze cas** :
`hotfix-profil-passion-custom` en ENTIER (10), `profil-trois-autorites` (4) et
`multi-passion-integrite` ⑧ — dont l'objet est précisément « la ligne est créée
quand même », dans les états dégradés. Cette fonction a **seize appelants**,
presque tous déclenchés par un geste d'un compte réel, et son contrat est « la
ligne de `MY_UID` existe ». **Quand une garde fait tomber la suite DÉDIÉE à la
fonction gardée, ce n'est pas la suite qui a tort : la garde est trop haut.** Le
défaut mesuré ne vient que d'UN appelant — le bloc « pas de profil serveur encore »
de `supaInit` — donc c'est lui qui est gardé, **branche `catch` comprise** (sinon le
refus repart par là, et c'est invisible). Corollaire de banc : le verrou exerce
`supaInit()`, jamais la fonction à la main — appelée directement, elle resterait
verte le jour où la garde disparaîtrait du démarrage (défaut `_notifierMessage`).
⚠️ Le `SELECT` qui précède cette création n'est PAS un défaut et reste non gardé :
une lecture sans compte rend 200 vide (même raison que `supaLoadUserState`, #367).

⚠️ **UN UUID DE LA BONNE FORME PEUT ÊTRE CELUI DU MAUVAIS COMPTE.** `_compteAuthReel`
et `_uidEstUnCompte` ne regardent que la FORME ; les policies comparent à
`auth.uid()`. Aucune garde de forme ne verra jamais ce cas — d'où
`_identiteDivergeDeLaSession(uid)`, qui ne répond `true` que sur une divergence
**PROUVÉE** : session absente, illisible ou sans `user.id` → `false`, l'écriture
part comme avant. **Durcir sur un inconnu couperait des écritures légitimes pour
une cause supposée** (même raisonnement que la porte d'admission, qui échoue
ouvert). Le refus est **TRACÉ** (`diagLog`) : une divergence d'identité muette est
indiscernable d'un calme plat.

⚠️ **UNE SEULE LECTURE DU JETON POUR TROIS VERDICTS.** `_sessionSdkPersistee()`
(app-08) est désormais le seul endroit qui lit `sb-<ref>-auth-token` (v1 et v2) ;
`_analyticsSessionUtilisable` l'appelle au lieu de garder sa copie. Les questions
sont différentes — « le jeton est-il frais ? » pour les analytics, « est-ce bien
MON compte ? » pour les écritures — mais la lecture est la même, et deux copies du
parsing finissent toujours par diverger sur celle qu'on oublie. Le verrou ⓪ compte
les occurrences : **exactement une**.

⚠️ **ET LE 403 DE `push_subscriptions` N'EST MÊME PAS UN PROBLÈME D'IDENTITÉ : c'est
la PROPRIÉTÉ DE L'ENDPOINT.** La clé primaire est l'`endpoint`, qui appartient au
**NAVIGATEUR**, pas au compte. Quand un second compte se connecte sur le même
appareil, `getSubscription()` rend le MÊME endpoint et l'upsert
(`onConflict: "endpoint"`) tente de réassigner la ligne du premier :
`push_update_own` (USING `user_id = auth.uid()`) refuse, PostgreSQL rend 42501.
**Aucune policy ne peut arbitrer ça** sans autoriser un compte à revendiquer la
ligne d'un autre — c'est au navigateur de trancher, et il sait le faire : on lui
demande un endpoint NEUF (`unsubscribe()` puis `subscribe()`), **une seule fois par
session** (`window._pushEndpointRepris`), sinon deux comptes qui partagent
vraiment un téléphone se voleraient l'abonnement en boucle. L'ancienne ligne
devient orpheline et **`notify-call` la purge déjà lui-même sur 410/404** : ne pas
ajouter de nettoyage, il existe.

⚠️ **L'ÉCHEC ÉTAIT DEUX FOIS MUET, ET LE DRAPEAU MENTAIT.** `await
supa.from("push_subscriptions").upsert(...)` **sans lire `{ error }`** — le SDK ne
LÈVE PAS sur un refus RLS — puis `window._callPushReady = true` posé quoi qu'il
arrive. L'appareil se croyait abonné sans l'être : **aucune notification d'appel ni
de message application fermée**, ce qui vidait de son effet la fiche « Notifier un
message privé ». Un abonnement qui échoue en silence est pire qu'une absence
d'abonnement : il se croit fait, donc personne ne le refait.

⚠️ **`conv_messages` (403 × 285, 31 sessions, vrais téléphones) EST DÉJÀ REFERMÉ —
NE PAS REJOUER L'ENQUÊTE.** Le dernier refus est le 2026-09-10 à **07:19 UTC** et
`_reparerAppartenanceConv` (#318) a été fusionné à **07:54 UTC** le même jour :
toutes les occurrences précèdent le correctif. C'est la règle déjà écrite pour la
Sentinelle — **une réouverture n'est pas une récidive tant que la dernière
occurrence n'est pas postérieure au déploiement** — et elle vaut aussi pour un
humain qui lit un tableau de bord. Ce lot a commencé par classer ce point « le
plus coûteux à faire » : c'est la mesure qui l'a détrompé, pas la relecture.

⚠️ **LE PIÈGE DE BANC, ET IL RENDAIT DEUX CAS VERTS SUR LE DÉFAUT.** Le jeton de
session posé en `addInitScript` **a DISPARU** une fois l'app démarrée (plus aucune
clé `sb-…` dans `localStorage`) : un appareil qui porte un compte sans session
retrouvée passe par `purgerJetonAuthLocal()`, geste délibéré du produit. Posé
avant, on mesure une fenêtre que le produit referme — et comme « pas de jeton » =
fail-open, le cas passait **quoi qu'il arrive**. `_identiteDivergeDeLaSession` lit
le stockage à CHAQUE appel : le jeton se pose donc à l'instant de l'écriture, ce
qui est son contrat réel. Le cas ⑥ exige en plus que la session soit **lue**,
sinon il repasserait vert par le fail-open.

⚠️ **POINT OUVERT, DÉLIBÉRÉMENT LAISSÉ** : **d'où vient la divergence d'identité**
n'est pas établi. On sait qu'elle existe (19 refus mesurés sur deux tables), on
refuse d'écrire sous une identité fausse et on la trace — mais réaligner `MY_UID`
à chaud depuis une écriture de push serait poser un correctif sur une cause
supposée, dans un chemin (`adopterCompteConnecte`, quatre entrées) dont le dépôt
documente déjà la sensibilité. La trace `diagLog` est ce qui rendra la cause
mesurable au prochain cas.
Verrou : `tests/e2e/ecritures-identite-compte.spec.js` (9), **éprouvé par
RÉINJECTION de trois mutations** — gardes de forme remises (3 rouges), push sans
lecture d'erreur ni reprise (3 rouges), garde d'identité retirée (1 rouge, celui
qui la mesure).

## 🔒 PIÈCES JOINTES DE MESSAGERIE — la lecture était OUVERTE À TOUS (2026-09-08)

Mesuré en production : la policy `passio_media_read` de `storage.objects` était `FOR SELECT` au rôle `{public}` avec pour seule condition `bucket_id IN ('content','attachments')`. **N'importe qui, sans compte, pouvait LISTER et lire tout le seau `attachments`** — photos, fichiers et messages vocaux des conversations privées (12 objets, 4 conversations au 2026-09-08). Ce n'était pas une fuite par URL devinée, c'était une énumération.
`migrations/migration_storage_lecture_cloisonnee.sql` (**PARTIE A APPLIQUÉE EN PRODUCTION** — mesuré le 2026-09-09 : `passio_media_read` a disparu, remplacée par `passio_content_read` et `passio_attachments_read_membre`) applique à la LECTURE le prédicat qui gouverne déjà l'ÉCRITURE depuis le 2026-08-17 : `is_conv_member((storage.foldername(name))[2], auth.uid())` — le chemin étant `attachments/<convId>/<fichier>`, le deuxième segment EST la conversation. Aucun prédicat nouveau n'est inventé.
⚠️ **La PARTIE A ne casse rien et peut s'appliquer seule** : le client lit par `getPublicUrl`, donc la route `/object/public/…`, qui contourne la RLS tant que le seau est déclaré public. On ferme l'énumération et l'API authentifiée, pas la lecture par URL exacte. ⚠️ **La PARTIE B — passer le seau en privé — est ÉCRITE le 2026-09-11** (lot client des URL signées + instruction ⑥ de `migration_ouverture_publique_2026-09-11.sql`, à coller APRÈS le déploiement du client) : voir la section « OUVERTURE PUBLIQUE GRATUITE ».
⚠️ Le seau `content` reste lisible par tous, délibérément : il porte les médias publics du fil, qu'un visiteur sans compte doit voir. Limite assumée : une publication d'un compte PRIVÉ y est donc lisible par URL — autre lot.
Verrou : `tests/sql/migration-storage-lecture.test.sh` (22 contrôles, gate CI), qui mesure d'ABORD le défaut sur la policy réelle de prod, puis le referme, puis éprouve 4 mutations.

## 📍 RENCONTRES — adresse, téléphone et participants n'étaient PAS privés (2026-09-08)

Audit IRL-01/IRL-03 (P1), vérifié en production : `events` et `event_attendees` sont lisibles par `anon` (policy `USING (true)` + GRANT de table). **L'adresse exacte du rendez-vous, le téléphone de l'organisateur et la liste NOMINATIVE des participants d'une rencontre physique sont lisibles sans compte, par un simple appel REST.**
`migrations/migration_irl_donnees_privees.sql` (**APPLIQUÉE EN PRODUCTION** — mesuré le 2026-09-09 : `anon` garde `title`, perd `address` et `contact`, et n'a plus aucun droit sur `event_attendees`) laisse `events` lisible sans compte — c'est le parcours d'entrée du produit — mais retire à `anon` les colonnes `address` et `contact`, et réserve `event_attendees` aux comptes connectés.
⚠️ **ON NE PEUT PAS RETIRER UNE COLONNE D'UN GRANT DE TABLE** : PostgreSQL ne soustrait pas un privilège de colonne à un privilège de table. Il faut `REVOKE SELECT ON TABLE … FROM anon` puis `GRANT SELECT (col, col, …)`. La liste est EXHAUSTIVE, et c'est voulu : une colonne ajoutée demain est PRIVÉE tant que personne ne l'a déclarée publique.
⚠️ **`select("*")` EST LE PIÈGE DU LOT.** PostgREST refuse la requête ENTIÈRE (42501) dès qu'une seule colonne manque au rôle : un `*` ne masque pas deux champs, il fait disparaître TOUTES les rencontres pour tout visiteur. `supaLoadEvents` demande donc `_EVENT_COLS_PUBLIC` / `_EVENT_COLS_PRIVE` en toutes lettres, avec repli mémorisé sur la liste publique au premier refus. **Toute colonne ajoutée à `events` doit l'être aux DEUX endroits** — le banc ④ ter compare les deux listes à l'octet près.
⚠️ `lat`/`lng` restent lisibles sans compte : la carte est l'écran d'entrée d'un visiteur. Décision assumée, pas un oubli — la fermer demande une position approchée pour les non-inscrits, donc un autre lot. `event_comments` et `event_reactions` restent publics eux aussi.
Verrou : `tests/sql/migration-irl-donnees-privees.test.sh` (22 contrôles, gate CI), qui mesure d'ABORD le défaut, puis le referme, puis éprouve 3 mutations dont « le GRANT de table rendu à anon ».

## 🧰 APPLIQUER LES CORRECTIFS DE SÉCURITÉ — deux outils, un seul geste (2026-09-08)

Les trois migrations du 2026-09-08 (pièces jointes, rencontres, admission 18+) demandaient neuf gestes manuels dans le bon ordre, dont trois oubliables sans que rien ne le signale. Deux outils les remplacent, et **les deux sont éprouvés à chaque commit** par `tests/sql/appliquer-securite.test.sh` (27 contrôles, gate CI) :
- **`migrations/APPLIQUER_TOUT_2026-09-08.sql`** — le chemin SANS terminal : un seul copier-coller dans l'éditeur SQL de Supabase, **une seule transaction** (une erreur annule tout), rejouable, et il finit par un TABLEAU DE VERDICT qui dit OK/ECHEC par correctif. ⚠️ **C'est un MIROIR, jamais une source** : il est généré par `scripts/generer-appliquer-tout.py` à partir des trois migrations, et le banc ⓪ refuse une dérive — corriger une migration sans régénérer laisserait un fichier qui applique l'ANCIENNE version, en silence.
- **`scripts/appliquer-securite-2026-09.sh`** — le chemin terminal : préflight → migration → contrôles pour chaque lot, avec **arrêt net** au premier BLOQUANT ou ÉCHEC (on ne passe jamais au lot suivant sur une base dont on n'a pas la preuve qu'elle est saine). `--verifier` ne change rien et dit ce qui manque.
⚠️ **NI L'UN NI L'AUTRE N'ALLUME LE 18+**, et une relance ne rétrograde jamais un interrupteur déjà allumé. L'allumage reste un geste séparé, APRÈS le déploiement du client.
⚠️ Le socle des bancs (`tests/sql/socle-prod-admission.sql`) porte désormais les 21 colonnes de `events` que la prod a et que `socle-prod.sql` n'avait pas : un `GRANT` colonne par colonne échoue sur la PREMIÈRE colonne absente, et le banc accusait la migration d'un défaut qui n'était que celui de son socle.

## 🧯 LA RESTAURATION A ÉTÉ FAITE — et six défauts que la relecture ne voyait pas (2026-09-14)

EXP-01 de la contre-revue Astra, l'un des trois bloquants intacts : « personne n'a jamais reconstruit la base de bout en
bout ». C'est fait, sur le projet « PASSIO staging » (`fcksxofaelcdmmifnwjo`, réactivé par l'API de gestion, PG 17.6 comme
la prod) : **40 tables, 8 comptes, 67 médias, 0 écart**, base structurellement identique (16 compteurs d'objets égaux, mêmes
`get_advisors`), même frontière anonyme (`events.address` 401, `event_attendees` 401). Trois outils, tous par l'API de
gestion (canal ③ d'ADR-012, jamais la CLI) : `npm run sauvegarde -- --complete` → `npm run schema:executable` (le DDL de
la prod, `scripts/schema-executable.js`, 16 sections) → `npm run restaurer -- --archive <dossier> --projet <ref> --schema
<ddl>` (`scripts/restaurer-donnees.js`, verdict table par table). Récit, mesures et limites : `docs/RECUPERATION.md`.
⚠️ **`restaurer` REFUSE la production ET le projet du manifeste** (en dur) ; `--purger` vide la cible. Le staging a été
purgé après la preuve — **une copie des données réelles ne reste pas dans un second projet**.
⚠️ **LES PRIVILÈGES NE SONT PAS DANS LES POLICIES.** Une reconstruction « tables + policies » rend `events.address` lisible
sans compte (seuls des GRANT de colonnes le protègent) et `is_conv_member` appelable par `anon` — Supabase donne EXECUTE à
PUBLIC à la création, un `revoke … from anon` seul ne ferme rien. Le DDL porte privilèges de table, de colonne, d'EXECUTE
(PUBLIC révoqué d'abord) et options de vue (`security_invoker`). C'est la différence entre « la même structure » et « la
même frontière », et c'est l'exercice qui l'a montrée, pas la relecture.
⚠️ **`insert … select * from json_populate_recordset` POSE NULL SUR TOUTE COLONNE ABSENTE DU JSON** — le DEFAULT ne joue
pas. Une colonne ajoutée après l'archive (`follows.created_at`, `reports.status`) faisait tomber la table entière : la
liste de colonnes est explicite. ⚠️ **Le chargement passe par le SQL, triggers utilisateur coupés** : par PostgREST,
`trg_rate_limit` refuse la 11ᵉ ligne et `rate_limit_insert` réécrit `created_at`. Les contraintes restent actives — un
lot refusé se rejoue ligne à ligne DANS la base (un aller-retour : l'API plafonne à ~60 appels/min, 429 mesuré) et chaque
motif est nommé : l'archive du 11/09 portait les 97 lignes `event_*` orphelines que la FK du 14/09 refuse. **Un écart au
verdict est une information.** ⚠️ Mesures au passage : un `user_state` de **4,7 Mo** (413 de l'API de gestion → PostgREST
pour cette ligne), une vidéo de 30,9 Mo dans un seau `content` plafonné à 26 Mo (limite levée le temps du dépôt),
`storage.protect_delete` interdit le DELETE SQL (purge par l'API). Ce qu'une restauration ne rend PAS : mots de passe,
identités OAuth, configuration du projet (auth, SMTP, secrets, Edge Functions) — liste écrite dans le doc.
⚠️ Le brouillon local `scripts/schema-origine.js` / `migrations/00_ORIGINE_PROD.sql` (non versionné) décrit l'état du
**17/08** (35 tables, 12 fonctions) et passe par `supabase db query`, retiré : à réconcilier avec `schema-executable.js`
avant d'en faire la baseline NET-07. Verrou : `tests/unit/restaurer-donnees.test.mjs` (7, dans `verif`).
⚠️ **LE RETOUR ARRIÈRE APPLICATIF PREND 2 SECONDES, PAS 45 MINUTES** (EXP-03, exercé le 14/09 à 20 h 50) :
`npm run rollback:netlify -- --restaurer precedent` (`scripts/rollback-netlify.mjs`) remet en ligne un déploiement de
production DÉJÀ CONSTRUIT (`POST /deploys/<id>/restore`) et ne dit « en ligne » qu'après avoir relu `release.json` sur le
site — 1,8 s aller, 1,1 s retour, mesurés. `rollback.yml` (PR de revert par la CI) reste le chemin PROPRE. Ce qu'un
rollback Netlify NE défait PAS : une migration (chaque migration porte son retour arrière), une Edge Function, le service
worker déjà installé. Il n'existe AUCUN kill switch serveur par fonctionnalité : les `passio_*="0"` sont locaux à l'appareil.
⚠️ **79 lignes `user_state` sur 86 étaient les états de comptes SUPPRIMÉS** (essais de juin–juillet, d'avant `delete-account`),
dont une de 4,8 Mo (avatar + couverture en base64, d'avant l'expurgation du 16/08) — purgées le 14/09 avec 63 notifications et
18 `conv_reads` orphelines. Une suppression de compte faite hors de `delete-account` (tableau de bord) recrée des orphelins :
il n'y a pas de purge périodique, c'est écrit dans le registre (PRO-06).
⚠️ **LE CLIENT SAIT VISER LE STAGING (SUP-04, 2026-09-14)** : `window.PASSIO_SUPABASE_CIBLE = { url, anon }` posé AVANT
app-08 (`_cibleSupabase`, forme vérifiée, sinon ignoré) fait viser ce projet à tout le client. Suites `prod` :
`PASSIO_SUPABASE_URL` + `PASSIO_SUPABASE_ANON` + `SUPABASE_SERVICE_ROLE_KEY` du staging → `tests/e2e/cible-supabase.js`
pose la cible avant chaque `page.goto` ; artefact : `scripts/build.js` avec les deux mêmes variables. Mesuré : authz-critical,
blocage-acces, user-state-horodatage verts contre `fcksxofaelcdmmifnwjo`, production intacte. **La CI, elle, écrit encore en
production** tant que `deploy.yml`/`sentinelle-distante.yml` ne posent pas la cible (lot `.github`, contre-revue). Le staging
ne porte AUCUNE donnée personnelle (référentiels seuls) ; ne jamais y reverser une archive complète sans la purger après.
`docs/STAGING.md`. Verrou : `tests/e2e/cible-supabase.spec.js` (5, ② éprouvé par réinjection).

## 🚦 AUDIT GO/NO-GO DE COMMERCIALISATION (2026-09-10) — et les cinq défauts qu'il a trouvés

Question posée : « j'envoie l'app aux utilisateurs, je commercialise, c'est ok ? » Réponse en deux
seuils, à ne JAMAIS confondre : **envoyer à des testeurs** est possible ; **commercialiser** ne l'est
pas — il n'existe **aucun chemin d'encaissement** (recherche exhaustive : ni Stripe, ni PayPal, ni
Paddle, ni achat intégré), et surtout **les CGU en vigueur promettent la gratuité et fondent
l'exonération de responsabilité dessus** (art. 2 et art. 10). Encaisser un euro rend ces deux
articles faux et fait tomber le bouclier avec eux. Décision : `docs/CHECKLIST_COMMERCIALISATION.md`
(refondue — l'ancienne datait de juin et cochait Wallet et CDV, deux fonctionnalités RETIRÉES) ·
107 constats et leurs contre-expertises : `docs/AUDIT_COMMERCIALISATION_2026-09-10.md`.

⚠️ **LA FAMILLE COMMUNE DES CINQ DÉFAUTS CORRIGÉS : UNE GARANTIE QUI S'ÉTEINT AU MOMENT OÙ ELLE
COMPTE.** Ce n'est pas une coïncidence, c'est le mode d'échec à chercher en premier ici.

⚠️ **① LE CONTENU DE DÉMONSTRATION NE SE DISAIT QU'AUX VISITEURS.** L'étiquette « Exemple PASSIO »,
les chiffres muets d'une activité et le refus de participation étaient conditionnés à
`estVisiteur()` : ils s'éteignaient **à la création du compte**, donc pour exactement les personnes à
qui l'application est envoyée. Mesuré : **550 publications de démonstration et 29 comptes fabriqués**
(`app-01-diag-seed.js`) contre **33 publications réelles** en production — un fil fabriqué à 94 %,
sans étiquette, et une inscription possible à une rencontre qui n'existe pas, chez un organisateur
qui n'existe pas. Le discriminant est désormais `contenuDemoSignale()` = `actif() && appPrete()` :
le kill switch du lot, **jamais l'existence d'un compte**. Un compte ne rend pas le décor vrai.

⚠️ **② LA NOTIFICATION DE MESSAGE PRIVÉ ÉTAIT BRANCHÉE SUR UNE FONCTION MORTE, ET LA FICHE DISAIT
LE CONTRAIRE.** `_notifierMessage` n'était appelée que par `supaSendMessage`, qui n'avait **aucun
appelant dans tout le dépôt**. Le correctif du 2026-09-09, ses **12 verrous** et sa section de
CLAUDE.md portaient donc sur un chemin que personne n'emprunte — et la production le disait :
**0 ligne `notifications` de type `message`**, y compris pour le message envoyé après le
déploiement. Les deux vraies voies sont `_sendTextToSupa` (app-04, texte) et `sendMessageToSupabase`
(app-09, média) ; elles notifient maintenant dans leur **branche de succès**. `supaSendMessage` est
RETIRÉE : c'est elle qui a rendu le défaut invisible, en offrant au correctif un endroit plausible où
se poser et aux tests un endroit plausible où être verts. ⚠️ **Les 12 verrous appelaient tous
`_notifierMessage` À LA MAIN** — aucun ne mesurait le câblage. Le 13ᵉ le fait, à la SOURCE.
**Une fonction morte qui double une fonction vivante est pire qu'un trou.**

⚠️ **③ QUATRE PORTES DE SIGNALEMENT SUR CINQ ANNONÇAIENT UN SUCCÈS SANS LE VÉRIFIER.** `reportUser`,
`reportPost`, `reportCommentEntry` et `reportEvent` appelaient `supaReport` **sans `await`** et sans
lire `{ error }`, puis remerciaient inconditionnellement. Seule `reportPassion` faisait bien. Ce
n'était pas théorique : la policy est `WITH CHECK (reporter_id = auth.uid()::text)`, et un visiteur
porte un `MY_UID` fabriqué — son signalement était REFUSÉ en silence pendant qu'il lisait « notre
équipe va vérifier ». Or « Signaler cet événement » **est** proposé aux visiteurs. Et le motif
n'était **jamais** renseigné : les cinq appelants passaient `""`, ce que les 2 lignes de production
confirment. ⚠️ **Mais le vrai trou est en aval et reste OUVERT** : `reports` n'a **aucune colonne de
statut**, aucun outil de lecture hors passions, aucune alerte. Un signalement n'arrive nulle part.

⚠️ **④ LE PREMIER ÉCRAN APRÈS UNE INSCRIPTION ÉTAIT VIDE.** Depuis « Confirm email », `signUp` ne
rend pas de session : l'onboarding (âge → prénom → passions) n'est **jamais atteint**, `boot()` pose
`onboarded = true` avec un profil de remplissage `_parDefaut` que `restoreFeedPassions` écarte, et
`feedFollowingOn` valant `true`, le compte lisait « Tu ne suis encore personne ». Le fil de
découverte l'aurait sauvé, mais il exigeait `estVisiteur()`. **C'est l'ÉTAT qui doit décider, pas la
présence d'un compte** : `filDecouverte()` couvre désormais aussi `comptePasEncoreGarni()` (aucune
passion voulue — le profil `_parDefaut` n'en est pas une — et personne de suivi).

⚠️ **⑤ UN TEXTE ANONYME DEVENAIT LE PROMPT D'UN AGENT DONT LA PR EST AUTO-FUSIONNÉE.**
`client_errors` accepte un INSERT **de tout visiteur non authentifié** (policy « Insert erreurs »,
rôle `public`, `with_check` vrai), et ses colonnes `message`/`stack` étaient recopiées telles quelles
dans le corps **ET LE TITRE** d'une issue `[SENTINELLE]` — label `sentinelle` + préfixe + OWNER,
c'est-à-dire les trois conditions exactes qui arment l'auto-fusion. Déclencher était trivial :
`classer()` retient un groupe dès **2 comptes**, `uid` est une colonne libre, et la production ne
porte que ~22 erreurs. ⚠️ **Le titre était la seule partie qu'aucune clôture ne protégeait** : il
porte désormais l'**empreinte normalisée**, rien de librement choisi. Le corps passe par
`desamorcer()` (`sentinelle-detecter.mjs`, 6 verrous unitaires) : lignes en forme d'instruction
retirées, marqueurs de structure neutralisés, longueur bornée — **et un VRAI message d'erreur doit
survivre intact**, sinon on ne peut plus établir de cause. ⚠️ **Le vrai correctif est en base**
(`migrations/migration_fuites_2026-09-10.sql`, colonne `auth_uid` posée par le serveur) : le
désamorçage est une barrière, pas la porte. `lireErreurs` gère les DEUX états, avec repli signalé.

⚠️ **CE QUI RESTE OUVERT — LISTE RAMENÉE À CE QUI L'EST VRAIMENT** (liste du 2026-09-10,
re-mesurée le 2026-09-12 : **six de ses points étaient déjà refermés**, voir plus bas). La migration
d'ouverture est **APPLIQUÉE** (verdict 13 × OK), donc les canaux Realtime portent leurs policies et
le seau `attachments` est **privé**. DKIM et DMARC sont **POSÉS** (`npm run verif:dns`, mesuré).
La sauvegarde a **tourné** pour la première fois le 2026-09-12, archive chiffrée puis déchiffrée et
relue dans le même run.

**CETTE LISTE EST VIDE DEPUIS LE 2026-09-12.** Les quatre gestes hors dépôt qu'elle nommait —
Realtime « Allow public access » OFF, fournisseur Anonymous désactivé, protection des mots de passe
compromis, et l'« authentifié » de Brevo — sont **tous constatés faits**, les deux premiers par le
run 5 de `controle-realtime.yml`, les deux autres sur les tableaux de bord Brevo et Supabase le
même jour. Le raisonnement de chacun reste juste (un DNS qui résout ne dit rien de ce que le
fournisseur en a conclu ; sans « Allow public access » OFF les policies Realtime ne sont pas
opposables) — ce sont les FAITS qui ont changé. Résidus assumés déjà écrits plus bas : identité
déclarative de l'appelant entre comptes, oracles pour un compte connecté.

> **MESURÉ LE 2026-09-12 (run 5 de `controle-realtime.yml`) — DEUX DES TROIS SONT FAITS.**
> « Allow public access » est **COUPÉ** : le canal public est refusé avec, en toutes lettres,
> `PrivateOnly: This project only allows private channels` — les policies de `realtime.messages`
> sont donc bien opposables. Le fournisseur **Anonymous est DÉSACTIVÉ** (`signInAnonymously()`
> refusé : « Anonymous sign-ins are disabled »). Ne plus les compter comme des gestes à faire.
> **ET LE TROISIÈME AUSSI, LE MÊME JOUR** : « Prevent use of leaked passwords » (API HaveIBeenPwned)
> est **ACTIVÉ**, constaté sur Authentication → Email du tableau de bord. Aucune API ne l'expose et
> `get_advisors` ne la signale pas : elle se lit là, ou se constate à l'inscription. L'« authentifié »
> de Brevo est **ACQUIS** lui aussi, constaté sur son tableau de bord. **Plus aucun geste hors dépôt
> n'est en attente.**
> ⚠️ **DEUX RÉGLAGES VOISINS SONT RESTÉS À OFF, ET C'EST UN CHOIX À FAIRE, PAS UN OUBLI CONSTATÉ** :
> « Secure password change » et « Require current password when updating ». Tant qu'ils sont éteints,
> **une session volée suffit à changer le mot de passe** sans connaître l'ancien ni se
> réauthentifier — donc à verrouiller le compte hors de son propriétaire. Le minimum est par ailleurs
> à **6** caractères (Supabase recommande 8) et « Password requirements » n'est pas renseigné. Rien
> de cela n'est un défaut du produit ; c'est un arbitrage friction/sécurité qui appartient à
> Benjamin, et il est écrit ici pour ne pas être redécouvert comme une surprise.
> ⚠️ **Ne pas confondre avec le « Statut de la marque », qui reste rouge (« Sans marque »)** : c'est
> le *branded subdomain*, qui remplace les liens de SUIVI de Brevo par le domaine du projet. Il ne
> concerne que des campagnes marketing et n'a **aucun effet** sur la délivrabilité d'un e-mail de
> confirmation. Un voyant rouge à côté d'un voyant vert appelle la réparation du mauvais.
> ⚠️ **ET CE VERDICT A MIS TROIS RUNS À SORTIR POUR DEUX RAISONS QUI N'ÉTAIENT PAS DANS LE
> PRODUIT** : le discriminant de refus ne connaissait que des mots anglais de permission et ratait
> `PrivateOnly` (donc un vrai refus était classé « panne ») ; et le `bash -e` que GitHub pose sur
> `run:` tuait l'étape sur `node … | tee` avant la garde écrite pour le code 3 — `shell: bash {0}`.
> **Une garde placée après une commande que `-e` rend fatale est du code mort, et plus trompeuse
> qu'un trou : on a écrit le cas, on croit donc l'avoir traité.** Même parenté que le `try/catch`
> autour d'un appel qui rend une promesse (« newestWorker is null »).

⚠️ **ET DEUX AFFIRMATIONS DE CE FICHIER ÉTAIENT FAUSSES** : l'interrupteur `irl_adult_only` était
annoncé ÉTEINT, il est **ALLUMÉ** ; et `docs/CHECKLIST_COMMERCIALISATION.md` cochait Wallet et CDV.
**L'état d'un interrupteur serveur ne se lit pas dans un fichier du dépôt, il se mesure.**

## 🚧 EDGE FUNCTIONS SANS PLAFOND — un compte confirmé facturait l'IA en boucle et réveillait qui il voulait (2026-09-12, soir)

Question de Benjamin : « je vais envoyer l'app à des milliers de personnes, confirme-moi qu'elle est sécurisée ».
Re-mesure depuis l'extérieur avec la seule clé anon (lecture de chaque table, écritures, listage des seaux,
schéma OpenAPI, fonctions sans jeton, historique git) : **tout ce que les lots des 8–11/09 ont fermé est bien fermé**
(41 tables RLS, aucune écriture anonyme sauf `client_errors` bornée, seau `attachments` privé, `get_advisors` sans
ERROR, aucun secret dans l'historique — seule la clé `anon` y figure, ce qui est normal). Deux trous restaient, tous
deux derrière l'authentification : **`ask-ai` et `notify-call` n'avaient AUCUN plafond**. Le commentaire d'`ask-ai`
promettait un « rate-limit léger (table optionnelle ai_usage, sinon ignoré) » — la table n'a jamais existé, rien ne
comptait : un compte confirmé pouvait facturer l'API Anthropic en boucle. Et `notify-call` réveillait N'IMPORTE QUEL
membre, sans limite, **y compris quelqu'un qui avait bloqué l'appelant** (MOD-03 du go/no-go : « seul canal qui perce »).

⚠️ **LA MÉMOIRE D'UNE EDGE FUNCTION N'EST PAS UNE MÉMOIRE.** Le premier correctif comptait dans une `Map` au niveau
du module : déployé, puis mesuré en production — **23 appels consécutifs, 23 acceptés**. Le runtime Supabase ne
garantit rien entre deux requêtes ; une garde qui n'existe que dans un isolat froid n'existe pas. Le compte vit
donc **en base** : `supabase/functions/_shared/plafond.js` lit et écrit `analytics_events` (table existante, purge à
13 mois, index en place, écrite par service_role) — un événement `edge_<fonction>` par appel **accepté**, rien pour
un refus (sinon insister repousserait la fenêtre). Panne de lecture ou d'écriture = refus (fail-closed). Plafonds :
`ask-ai` 8/min · 60/h ; `notify-call` 20/min · 200/h. Mesuré après redéploiement : 20 × 200 puis 429 ; 8 × 400 (corps
vide, compté, zéro coût) puis 429. Le refus est un **429 `Retry-After`** : `sendAIQuery` retombe déjà sur son moteur
local, les appelants de `notify-call` avalent l'échec — aucun écran ne casse.

⚠️ **`notify-call` LIT `blocks` DANS LES DEUX SENS** et rend exactement la réponse « aucun appareil abonné » — ni
l'un ni l'autre ne doit apprendre le blocage par là. Mesuré en prod avec un compte jetable : sans blocage `sent: 2`,
cible qui bloque `sent: 0`, émetteur qui bloque `sent: 0`. Chaque champ affiché est **borné** (`text` 200, `fromName`
60, emojis 8) et `toUserId` doit ressembler à un UUID **avant** d'entrer dans le filtre `.or()` de PostgREST — une
virgule ou une parenthèse y changerait le sens de la requête. Résidu assumé, inchangé : `fromName`/`text` restent
déclaratifs entre comptes.

⚠️ **Le fichier testé est CELUI que Deno déploie** : `plafond.js` est en `.js` pour que `node --test
tests/unit/plafond.test.mjs` (10 verrous, dont ⑧ fail-closed et ⑩ réinjection de la boucle) charge le même
fichier sans transpileur. Déploiement : `supabase functions deploy ask-ai` / `notify-call` (la CLI **est** installée
et liée sur ce poste — `supabase functions list` le prouve ; l'ADR-012 ne retire que `db query`). ⚠️ Sur ce poste,
`core.autocrlf=true` fait ROUGIR `audit-supa-stub.js` et `generer-ouverture.js --verifier` (ils cherchent `
}
`
dans des fichiers relus en CRLF) — vert en CI, fichiers identiques à `origin/main` : ce n'est pas le produit.

**Ce qui reste, et qui n'est pas du code** : le dépôt est PUBLIC (le code se clone en une commande — voir la réponse
du 2026-09-12 sur la copie), pas de captcha à l'inscription (SEC-06 : Turnstile, à poser dans la semaine), CSP
`script-src 'unsafe-inline'` (152 `onclick` inline dans index.html : tout XSS résiduel devient exécution), 2FA des
comptes GitHub/Supabase/Netlify/Brevo non mesurable d'ici, « Secure password change » OFF, mot de passe minimum 6.

## 🚀 OUVERTURE PUBLIQUE GRATUITE — SEPT DÉFAUTS SERVEUR, UN LOT CLIENT, DEUX CANAUX D'EXPLOITATION (2026-09-11, après-midi)

Benjamin : « commercialiser, c'est la rendre publique gratuitement et la faire utiliser à un
max d'utilisateurs ». Le matin, la re-mesure disait « sûre pour des testeurs avertis, pas pour
le public » ; ce lot ferme l'écart. Mode d'emploi et gestes restants (coller le SQL, trois
interrupteurs du tableau de bord Supabase, DKIM/DMARC, une sauvegarde à déchiffrer une fois) :
**`docs/OUVERTURE_PUBLIQUE_2026-09-11.md`**. Migration : `migrations/migration_ouverture_publique_2026-09-11.sql`
(une transaction, verdict à 13 lignes) · banc `tests/sql/migration-ouverture-publique.test.sh` (117, gate CI)
· verrous client `tests/e2e/ouverture-publique.spec.js` (35) · unitaires `tests/unit/moderation-alerte.test.mjs` (8).

⚠️ **UN ORACLE N'EST PAS UNE FUITE DE TABLE, ET AUCUN AUDIT RLS NE LE VOIT.** `is_conv_member(conv, uid)` est
`SECURITY DEFINER` et était **exécutable par `anon`** (`get_advisors` le signalait ; `has_function_privilege` l'a
confirmé). Toutes les tables de messagerie étaient bien fermées — mais `events.conv_id` était dans le GRANT colonne
d'`anon` et `profiles.id` est public : la liste **nominative** des membres de la conversation d'une rencontre se
reconstituait sans compte, alors que `event_attendees` venait d'être fermée le 08/09. **Une porte fermée sur une table
se rouvre par une fonction** : après toute migration de confidentialité, lire `get_advisors` ET
`has_function_privilege('anon', …)` sur chaque `SECURITY DEFINER`. ⚠️ Révoquer seul aurait fait lever « permission
denied » aux policies qui l'appellent au rôle courant : elles passent au rôle `authenticated`, et un visiteur obtient
**zéro ligne sans erreur** — jamais de bruit dans le tableau de bord pour un refus légitime. ⚠️ `post_is_visible` et
`comment_target_visible` RESTENT ouverts à `anon` : un visiteur lit les commentaires d'une publication publique par eux.
⚠️ Retirer `conv_id` du GRANT sans le retirer de `_EVENT_COLS_PUBLIC` ferait disparaître **toutes** les rencontres pour
tout visiteur (42501 sur la requête entière) : le banc compare les deux listes à l'octet, et `_EVENT_COLS_PRIVE`
= publique + `address, contact, conv_id`.

⚠️ **BLOQUER N'AVAIT D'EFFET QUE SUR `conv_members`.** La personne bloquée pouvait toujours vous suivre, vous écrire dans
le 1:1 existant, commenter, aimer et vous notifier. Six policies INSERT exigent désormais `not is_blocked_with(...)` via
trois aides `SECURITY DEFINER` (`post_auteur_bloque`, `event_auteur_bloque`, `conv_1a1_bloquee`) — SECURITY DEFINER parce
qu'un commentaire vise parfois une ligne que la RLS du rôle courant ne rend pas. **Borné aux 1:1** pour les messages :
dans un groupe la personne bloquée reste membre, c'est le retrait du groupe qui relève de l'organisateur. Un commentaire
sur un post SEED (sans ligne `posts`) passe toujours : le banc le mesure.

⚠️ **LE DÉBIT N'ÉTAIT BORNÉ QUE SUR TROIS TABLES, ET `rate_limit_insert` POSE `created_at = now()`.** C'est voulu (un client
antidaterait pour échapper au compte) et c'est un changement de sémantique pour `posts` : une publication rejouée depuis la
file hors ligne porte désormais l'heure du SERVEUR. `follows` n'avait pas de `created_at` — le trigger aurait levé « record
new has no field » à chaque abonnement ; la colonne est ajoutée. Les tables à INSERT **anonyme** (`client_errors`,
`telemetry_events`) n'ont pas d'identité fiable : `limiter_debit_global()` plafonne la table entière par minute (120 /
3 000). Un attaquant qui sature ce plafond fait perdre de la télémétrie, jamais la base. ⚠️ Dans un banc, la borne compte
les lignes du SOCLE : un compte qui a déjà publié dans la minute ne peut pas servir à mesurer « 10 puis refus ».

⚠️ **UN CANAL REALTIME PRIVÉ SANS POLICY EST REFUSÉ** : déployer `private: true` avant les policies aurait coupé appels,
frappe et lives. La sonnerie (`_subscribeCallRing`, abonnée au démarrage, UN SEUL point de création pour `ring:`/`call:` :
`_callChannel`) sert de **sonde** : un `CHANNEL_ERROR` dont le message parle de permission/policy pose
`window._rtPriveIndisponible` et tout repart en public — une coupure réseau ne fait PAS replier. ⚠️ **Les policies ne
sont opposables que si le tableau de bord Supabase interdit les canaux publics** (Realtime → « Allow public access » OFF) :
tant qu'il les permet, un client qui omet `private: true` écoute encore. C'est un geste du tableau de bord, pas du dépôt.
⚠️ **ET CE GESTE TUE TOUT CANAL RESTÉ PUBLIC** : `realtime:db` (accusés de lecture, interactions, arrivée dans une
conversation) et `conv_specific:<conv>` l'étaient encore, sans policy — la red team l'a vu, pas le lot. **TOUS** les
`supa.channel(` du dépôt portent désormais `private:` (le verrou ⑨ balaie les trois fichiers), chacun avec son propre
repli sur refus de policy (`_creerCanalDb`, `_creerCanalConvSpecifique`, `_creerCanalTyping`) ; la policy
`realtime:db` est ouverte à `anon` aussi — le canal n'ouvre RIEN, chaque table garde sa RLS.
Résidu assumé : l'identité de l'appelant dans la charge utile reste déclarative **entre comptes**.

⚠️ **RED TEAM DU MÊME JOUR — LA CHARGE UTILE D'UN BROADCAST EST HOSTILE, ET UN UPDATE EST UNE ÉCRITURE COMME UNE AUTRE.**
Revue adversariale en lecture seule du lot (agent `passio-red-team`, vérifié en production par `execute_sql`), dix
constats, tous refermés le jour même sauf deux résidus écrits : ① **P0 — XSS par sonnerie** : `_callRenderIncomingUI`
posait `inv.emoji` dans `innerHTML` sans échappement, et la policy `ring:%` laisse tout compte émettre — une invitation
`{ emoji: '<img onerror=…>' }` exécutait du script chez n'importe quel compte connecté (vol du jeton de session). La
policy Realtime ne regarde que le TOPIC, jamais le contenu : **tout champ d'un `payload` broadcast s'échappe à
l'affichage**, comme `comment_interactions` (`_emojiSur`, borné à 4 caractères, éprouvé par RÉINJECTION). ② **P1 —
`conv_messages."Update propre"` était `USING (from_id = moi)` SANS `WITH CHECK`, et rien ne figeait `conv_id`** : un
message se DÉPLAÇAIT par UPDATE dans le 1:1 d'un compte qui vous a bloqué ou dans le groupe d'une rencontre dont on n'est
pas membre (`events.conv_id = 'evgrp_' || id`, ids publics). Même trou sur `post_comments.post_id`. Le lot ② ne gardait
que l'INSERT — **une garde posée sur l'INSERT seul se contourne par l'UPDATE** ; `WITH CHECK` reprend la condition
d'INSERT et `trg_identifiants_figes` fige les identifiants (`WITH CHECK` ne voit que la ligne finale). ③ Un compte
BLOQUÉ pouvait encore faire sonner : le bloqueur est dans le TOPIC (`ring:<uid>`), la policy `passio_rt_emettre` le lit
(`is_blocked_with(substr(topic, 6))`) ; et `_callOnInvite` borne la cadence (un callId neuf par message faisait
réafficher l'écran d'appel en boucle). ④ `callId = <uid>_<horodatage>` se DEVINAIT (uid public, milliseconde proche) et
`call:%` est lisible par tout compte → offre SDP (adresses IP) et `hangup` à portée d'un tiers : `_callIdAleatoire()`.
⑤ Les demandes d'abonnement EN ATTENTE se lisaient sans compte (`follows` : deux SELECT `true`) : `follows_lecture`
n'ouvre `pending` qu'à ses deux bouts. ⑥ Un live obéissait à n'importe qui (`offer` détournait le flux d'un spectateur,
`end` coupait pour tous) : `_vliveDeLHote(d)` exige `from = video_lives.author_id` sur les huit ordres d'hôte, et un
`roffer` n'est accepté que du relais ASSIGNÉ. ⑦ `reports.target_type` (libre, ≤ 40 car.) finissait tel quel dans le
corps d'une issue PUBLIQUE : liste blanche (`autre` sinon) + `CHECK` en base. ⑧ Une URL signée valait **7 jours** — un
membre retiré lisait encore une semaine : **1 heure**. ⑨ Sur un doublon 23505, `supaFollowUser` rendait `accepted` par
défaut : une demande en attente devenait « ✓ Suivi » ; le statut local prime. ⑩ La ligne `notifications` d'un abonnement
était écrite par le client qui s'abonne : **`follows_notifier` (serveur) l'écrit** avec un identifiant déterministe
(`n_fr_`/`n_fw_`/`n_fa_` + 8 car. de chaque uid — même famille que `_idNotifMessage`), le client ne pousse que le PUSH
(`_pousserPushNotif`) — et écrit encore la ligne lui-même **tant que la base n'a pas `status`** (pas de colonne = pas de
trigger : `window._followsSansStatut` est le discriminant des deux états).
⚠️ **RÉSIDUS ÉCRITS, PAS RÉGLÉS** : `from` reste déclaratif **entre comptes** dans un live (un compte connecté peut se
dire l'hôte — fermer cela demande un topic d'hôte gardé par policy) ; `is_conv_member`/`is_blocked_with` restent des
oracles pour un compte **connecté** (les policies `authenticated` les appellent au rôle courant : leur retirer EXECUTE
ferait lever « permission denied » partout — c'est très exactement ce que ① avait dû contourner pour `anon`).
⚠️ **ET UNE SUGGESTION DE LA RED TEAM ÉTAIT FAUSSE** : « révoquer EXECUTE aux aides appelées seulement par des policies,
elles s'exécutent au rôle propriétaire ». Non : SECURITY DEFINER change le rôle DANS la fonction, l'APPEL exige toujours
EXECUTE pour le rôle courant. Une revue adversariale se vérifie contre le code réel avant d'être appliquée (règle de
`docs/REVUE_INDEPENDANTE.md`).
⚠️ **PUIS `audit-passio` A RELU LES CORRECTIFS EUX-MÊMES, ET EN A TROUVÉ TROIS DE TRAVERS** : ① **un identifiant
déterministe rend un verdict ÉTERNEL** — `follows_notifier` rafraîchit la MÊME ligne à chaque nouvelle demande, et le
verdict « refusée » mémorisé par id (`demandesAbonnementTraitees`) aurait affiché « Demande refusée », sans bouton, pour
toujours : le verdict est HORODATÉ (`{ verdict, at }`, `_verdictDemandeAbonnement`), périmé dès qu'une notification plus
récente arrive, et `mergeSupaNotifs` l'efface. ② **une correction inatteignable depuis son appelant** — « sur doublon, le
statut local prime » lisait `etatSuivi()`, mais `toggleFollowUser` pousse l'optimiste dans `following` AVANT d'appeler
`supaFollowUser` : l'état local disait toujours « suivi ». Sur doublon on RELIT la ligne serveur (`follows_lecture`
l'ouvre au demandeur) ; le verrou qui posait `followingPending` à la main testait la fonction, pas le câblage — le cas
② bis pose l'état RÉEL de l'appelant. ③ **un second appelant oublié** — `_vliveToggleFollow` (live) ignorait `ok:false`
et `pending` : il a les trois états de `toggleFollowUser`. Et **un à-côté qui casse le contrat** : `notifications` porte
`trg_rate_limit` (60/min, tous genres), un refus y aurait fait échouer l'INSERT `follows` par le trigger — le notifier
avale l'exception (`raise warning`), la notification n'est pas le contrat. Mesuré avant déploiement (canal ①) : rien de
la migration n'est en prod (ni `status`, ni trigger, ni policy), le discriminant `_followsSansStatut` est donc exact.

⚠️ **LES PIÈCES JOINTES PORTENT `data-pj`, PAS `src`.** Un seau privé refuse l'URL publique : la poser en `src` ferait
demander au navigateur une URL en 400 avant la signature. `attrMediaSrc(url, "src"|"href")` (app-02) tranche selon
`pieceJointeChemin(url)`, qui reconnaît les DEUX formes en base (Supabase `/object/public/attachments/…` et CDN
`/media/attachments/…`) ; `signerPiecesJointes(root)` s'appelle **APRÈS chaque `innerHTML`** qui peint des messages (fil
`renderConvFpThread`, panneau Médias `openConvFiles`) et le lecteur vocal signe au premier tap. Le nom d'objet est
`attachments/<conv>/<fichier>` DANS le seau `attachments` — segment doublé depuis toujours, c'est `foldername(name)[2]` que
la policy compare : ne pas « nettoyer ». `cdnUrl` ne réécrit plus ce seau (un objet privé n'a rien à faire dans un cache
public). Repli sur l'URL d'origine si la signature échoue : rien ne casse tant que le seau est public, et une fois privé
seul un membre lit. ⚠️ La partie ⑥ de la migration (seau privé) est **la dernière instruction** et se colle **après** le
déploiement du client.

⚠️ **`follows.status` : LE SERVEUR TRANCHE, LE CLIENT SE CORRIGE.** `trg_follows_statut` écrit `pending` vers un compte
privé quoi que le client envoie ; `follows_accepter` (UPDATE, cible seule, vers `accepted` seulement) et
`trg_follows_figes` (identifiants figés — `WITH CHECK` ne voit que la ligne finale, la cible aurait pu réécrire
`follower_id` et fabriquer un abonné). `posts`, `stories` ET `post_is_visible` exigent `status = 'accepted'` : trois
endroits qui doivent dire la même chose. Côté client, `toggleFollowUser` reste optimiste dans le sens « suivi » puis se
CORRIGE au verdict (`Demande envoyée`, `state.user.followingPending`) ; un second tap annule ; `libelleBoutonSuivi`
(app-02) est la SEULE table des trois libellés. ⚠️ **PostgREST joue l'insert et son `select` dans la même transaction** :
demander `status` sur une base qui n'a pas la colonne rend 42703 ET n'écrit pas l'abonnement — d'où
`_erreurColonneStatutAbsente` et `window._followsSansStatut`, mémorisé pour la session au premier refus. ⚠️ Le verdict
d'une demande (`demandesAbonnementTraitees`) vit dans l'ÉTAT DU COMPTE, pas sur l'objet notification :
`mergeSupaNotifs` remplace celui-ci à chaque relecture et les deux boutons réapparaîtraient.

⚠️ **UN SDK EN VERSION FLOTTANTE EST UN DÉPLOIEMENT QUE PERSONNE N'A DÉCIDÉ.** `@supabase/supabase-js@2` venait de jsDelivr
sans intégrité, MapLibre d'unpkg : une publication cassée ou compromise atteignait la production sans commit et sans
qu'aucune gate puisse le voir. Les deux vivent dans `js/vendor/` (épinglés, `LICENCES.md`), copiés dans `dist/` par
`scripts/build.js` (règle `data/` : un asset qui n'existe qu'en CI est un asset qu'on découvre manquant en production), et
la CSP ne connaît plus que `'self'`. ⚠️ `audit:globals`/`audit:handlers`/`audit-echappement` ne scannent que `js/*.js` de
premier niveau — `js/vendor/` en est exclu par construction, ne pas y déposer de code maison. ⚠️ Les suites qui coupaient
le SDK par `**/cdn.jsdelivr.net/**` coupent désormais `**/js/vendor/supabase-js*` ; en local, MapLibre se charge
désormais (il était bloqué par le bac à sable réseau), comme en CI depuis toujours.

⚠️ **`psql -q` AVALE LES ÉTIQUETTES DE COMMANDE** (« INSERT 0 1 », « DO ») : un banc qui attend ce texte lit une chaîne
vide et accuse la migration. `AUTH_OK`/`ANON_OK`/`RT_OK` rendent « OK » ou le message d'erreur. Et une assignation
`res="$(psql …)"` sous `set -e` TUE le banc au premier refus SQL — là où un `$(…)` en argument de fonction ne tue rien.

⚠️ **LE DÉPÔT EST PUBLIC** : l'archive de sauvegarde (comptes, e-mails, messages) est chiffrée AVANT d'être déposée en
artefact (phrase = `SAUVEGARDE_PASSPHRASE`, sinon SHA-256 de la clé `service_role` : qui détient cette clé détient déjà
la base, le repli n'affaiblit rien et n'exige aucun geste), puis **déchiffrée et relue** dans le même run — une
sauvegarde jamais restaurée est une intention. L'issue `[MODÉRATION]` ne porte ni identifiant, ni cible, ni motif : combien,
depuis quand, quel type. Label `moderation`, jamais `claude` : décider d'un signalement est un geste humain.

## 🚪 OUVERTURE AU PUBLIC — UN SEUL COLLER SQL, ET LA CI QUI MANGEAIT LA BANDE PASSANTE (2026-09-11)

Le lot d'ouverture (#329) est **déployé** (`7665c7ac`, job « Déploiement production » vert à
06:27 UTC). Restaient sept gestes manuels. Ce lot-ci en replie trois en un, et corrige en code la
cause d'un huitième.

### `migrations/OUVERTURE_2026-09-11.sql` — trois gestes en base, un seul copier-coller

Généré par `node scripts/generer-ouverture.js` à partir de `migration_fuites_2026-09-10.sql`
(partie ①) plus deux gestes d'exploitation dont ce script EST la source (② téléphones,
③ purge de télémétrie). ⚠️ **C'est un MIROIR pour sa partie ①** : corriger la migration sans
régénérer laisserait un fichier qui applique l'ANCIENNE version, en silence — même famille que
`generer-appliquer-tout.py` du 2026-09-08. `--verifier` est dans `npm run verif`, donc en CI.
⚠️ **`VACUUM` ne peut pas y vivre** (interdit en transaction) : il est décrit en second coller,
facultatif — et `VACUUM (ANALYZE)` rend l'espace RÉUTILISABLE tandis que `VACUUM FULL` rend les
OCTETS, ce qui n'est pas la même promesse.
Verrou : `tests/sql/ouverture-2026-09-11.test.sh` (34 contrôles, gate CI) — il l'EXÉCUTE, le rejoue
une seconde fois, et **six mutations exigent que le tableau de verdict ROUGISSE**. ⚠️ Un tableau de
verdict qui dirait OK quoi qu'il arrive est PIRE que pas de verdict : on croirait avoir appliqué.

### ⚠️ LA CI CONSOMMAIT 95 % DE LA BANDE PASSANTE DU PROJET, PAR UN CHEMIN INDIRECT

Mesuré le 2026-09-10 : **1,12 Go d'egress en 24 h** sur un plan qui en offre **10 Go par MOIS**,
dont **1,06 Go pour un seul avatar de 2,59 Mo demandé 399 fois**. Le demandeur n'était pas un
utilisateur, c'était `tests/e2e`.
⚠️ **LE CHEMIN EST À UN ÉTAGE SOUS TOUT CE QUE L'ISOLATION REGARDAIT.** `profiles` n'est
délibérément PAS dans `TABLES_DISTANTES` (une lecture rendue vide ferait tenter une ÉCRITURE en
production à `supaEnsureProfileExists`) : les profils réels remontent donc avec leurs vraies URLs
d'avatar, et c'est le **NAVIGATEUR** qui télécharge — une fois par `page.goto`, six shards, plus de
cent suites. Aucune de ces images n'est jamais regardée par un test.
`sansDonneesDistantes` sert désormais un **PNG 1×1** sur `/storage/v1/(object|render/image)/`.
⚠️ **ON RÉPOND UNE IMAGE VALIDE, ON N'ABORTE PAS** : le produit porte des `onerror` qui repeignent
la boîte en gris avec une hauteur minimale (`renderPostHTML`) — abandonner ferait BOUGER la mise en
page et une suite de cadrage rougirait pour une raison étrangère. Ce qui n'est pas une image
(vidéos jusqu'à 30 Mo) est abandonné ; les **ÉCRITURES passent**, comme pour les tables.
⚠️ **LE MOTIF DOIT COUVRIR LES DEUX FORMES D'URL** : `passioThumb` (app-02) réécrit
`/object/public/` en `/render/image/public/`. N'en connaître qu'une laissait passer toutes les
images de publication, soit l'essentiel du poids.
Verrou : `tests/e2e/isolation-medias.spec.js` (6), dont ② qui mesure le **CÂBLAGE** par
`bootOnboarded` (un verrou qui n'appellerait que `sansDonneesDistantes` resterait vert si l'appel
disparaissait de `bootOnboarded` — défaut vécu sur `_notifierMessage`), ⑥ qui mesure à la SOURCE,
et ④/⑤ qui tranchent sur la **RAISON** de l'échec réseau : `ERR_FAILED` = la route a abandonné,
`ERR_NAME_NOT_RESOLVED`/`ERR_TUNNEL_CONNECTION_FAILED` = la requête est RÉELLEMENT partie. Écrits
d'abord sans ce discriminant, ils étaient verts dans les deux états — ils ne prouvaient rien.
Éprouvé par RÉINJECTION : sans la route, 4 cas sur 6 rougissent.

### ⚠️ LES AVATARS SERVIS AUX VRAIS UTILISATEURS NE SONT TOUJOURS PAS REDIMENSIONNÉS — point OUVERT

`passioThumb(url, width)` existe et n'a que **trois appelants**, tous sur des images de
PUBLICATION (700 px) ; **aucun avatar n'y passe**. Un avatar de 2,59 Mo est donc servi en pleine
résolution pour être affiché à ~40 px, à chaque utilisateur et à chaque chargement.
⚠️ **NE PAS L'ÉTENDRE SANS AVOIR VÉRIFIÉ QUE LA TRANSFORMATION D'IMAGE RÉPOND SUR CE PLAN.**
Elle réécrit l'URL en `/storage/v1/render/image/public/…?width=` ; c'est une option dont la
disponibilité dépend du plan Supabase. Si elle ne répond pas, l'étendre casserait **tous** les
avatars de l'application — et l'un des deux appelants actuels n'a même pas de `onerror`. Le
contrôle tient en une requête : ouvrir une URL `render/image` d'un fichier existant et lire le
code HTTP. Tant que ce n'est pas fait, c'est un pari, pas un correctif.

### ⚠️ DEUX AFFIRMATIONS DU MODE D'EMPLOI ÉTAIENT FAUSSES, ET C'EST LA MESURE QUI L'A DIT

① « La purge de télémétrie fera tomber la table nettement sous 62 Mo » : **non**. Sur
130 906 lignes, **8 596 seulement ont plus de 30 jours (6,6 %)** — soit ~4 Mo. Son rôle est
d'EMPÊCHER LA CROISSANCE (stabilisation vers 44 Mo), pas de faire maigrir. ⚠️ Et **30 jours ne
tiendra pas à l'échelle** : trafic ×10 = ~440 Mo de rétention, contre un mur en lecture seule à
500 Mo. Passer à 7 jours quand les comptes décollent.
② « Les gros médias appartiennent au compte `d59aaaa3…` » : **non**, ils sont à `6902826f…` et
`dc7ff081…`. Trier par TAILLE, jamais chercher un identifiant recopié.
**L'état d'une base ne se lit pas dans un fichier du dépôt, il se mesure** — même règle que pour
l'interrupteur `irl_adult_only`, et c'est la troisième fois qu'elle sert.

### 🔁 RE-MESURE DU 2026-09-12 — SEPT AFFIRMATIONS DE CE FICHIER ÉTAIENT PÉRIMÉES

Et c'est la **quatrième** fois que la règle sert. Une fiche qui décrit un défaut déjà refermé coûte
autant qu'une fiche qui en tait un : elle envoie la session suivante travailler pour rien, ou la
fait renoncer à un geste déjà sûr. Mesuré au canal ① d'ADR-012, après le déploiement de `3e1e825`.

⚠️ **① `conv_reads` N'EST PLUS LISIBLE SANS COMPTE.** `reads_select` porte
`is_conv_member(conv_id, auth.uid())`, pas `qual = true` : le graphe « qui parle à qui » est fermé,
la migration a bien été appliquée. Le paragraphe « ce qui reste ouvert » du 10/09 l'annonçait encore.

⚠️ **② LA PURGE DE TÉLÉMÉTRIE EST DÉJÀ À 7 JOURS, ET LA TABLE FAIT 9,8 Mo.** `cron.job` porte
`purge_telemetry_7j` (04:00) et `purge_client_errors` (03:00) ; **zéro** ligne de plus de 30 jours.
Les chiffres de la fiche (62 Mo, 130 906 lignes, « stabilisation vers 44 Mo », « passer à 7 jours
quand les comptes décollent ») décrivent un état révolu — le geste recommandé est FAIT. Ce qui reste
vrai, c'est le raisonnement : la rétention est le levier, pas la purge ponctuelle.

⚠️ **③ TOUT LE MÉDIA DE LA BASE PASSE DÉJÀ PAR LE CDN.** Avatars 3/3, couvertures 3/3, publications
5/5, stories 8/8 en `/media/…` ; **aucune** URL Supabase directe. La sortie Supabase due aux vrais
utilisateurs est donc ~nulle, et le forfait qui compte est celui de Netlify (100 Go/mois), pas les
5 Go de Supabase. **Le point « avatars non redimensionnés » reste ouvert, mais ce n'est plus une
urgence de facture** : c'est une question de charge utile (2,59 Mo servis pour un rond de 40 px, sur
données mobiles) et de bande passante Netlify à l'échelle. Ne pas le rouvrir en criant à l'egress.

⚠️ **④ ET LA VÉRIFICATION QUI BLOQUAIT CE POINT EST DÉJÀ FAITE PAR LE PRODUIT LUI-MÊME.** La fiche
dit « ne pas étendre `passioThumb` sans avoir vérifié que la transformation d'image répond sur ce
plan ». Or ses **trois appelants actuels l'utilisent en production** (photos de publication à 700 px,
bobines à 720 px) : si `render/image` ne répondait pas, ces images seraient DÉJÀ cassées. La question
ne se tranche donc pas par une requête à écrire, mais en **regardant le fil** — une photo de
publication s'affiche, ou elle ne s'affiche pas. ⚠️ Nuance qui empêche de conclure trop vite :
`renderPostHTML` porte un `onerror` qui repeint la boîte en gris, donc un échec ressemble à une image
absente, jamais à une erreur. Regarder une publication dont on SAIT qu'elle porte une photo.

⚠️ **⑤ LE CONSENTEMENT AUX CGU EST PERSISTÉ DEPUIS LE 2026-09-10, PAR `user_metadata`.** La liste
« ce qui reste ouvert » l'annonçait encore comme « persisté nulle part ». `onbDoAuth` envoie
`cgu_version`, `cgu_accepted_at` et `confidentialite_version` dans les options de `signUp`, et le
retour Google a son propre chemin (`passio_oauth_cgu` relu puis posé par `updateUser`, avec lecture
de `{ error }`). ⚠️ **Et la mesure qui semble contredire ça n'en est pas une** : `auth.users` rend
**0 compte sur 7** portant `cgu_version` — parce que le dernier compte de production date du
**2026-09-09**, soit la veille du correctif. Zéro trace n'est ici PAS un défaut, c'est l'absence
d'inscription depuis. Ne pas rouvrir le sujet sur ce chiffre : le vérifier sur le PREMIER compte créé
après l'ouverture, en lisant `raw_user_meta_data ? 'cgu_version'`.
> **CE CONTRÔLE EST FAIT, ET IL EST VERT (2026-09-12).** Un compte a été créé le 12/09 à 11:06 :
> `raw_user_meta_data ? 'cgu_version'` rend **true**, et il a **confirmé son e-mail en 62 secondes**.
> Le consentement est donc bien persisté sur un compte réel, et la chaîne d'envoi Brevo fonctionne
> de bout en bout sur un compte neuf — ce qu'aucun enregistrement DNS ne pouvait prouver. C'est la
> mesure qui manquait pour dire que l'inscription est ouvrable au public.

⚠️ **⑥ LA SAUVEGARDE AUTOMATIQUE EXISTE — ET N'A JAMAIS TOURNÉ.** `.github/workflows/sauvegarde.yml`
est en place, quotidien, archive chiffrée puis **déchiffrée et relue dans le même run**. Le constat
« aucune sauvegarde automatique » est donc périmé. ⚠️ Mais l'inverse ne se dit pas non plus : le
workflow compte **zéro exécution** à ce jour. Une sauvegarde configurée n'est pas une sauvegarde —
tant qu'un run vert ne l'a pas prouvée, c'est une intention avec un fichier YAML devant. Le premier
lancement est un geste qui reste à faire.

> **Suite du ⑥, le même jour :** le workflow a été lancé et il est **VERT** (run du 2026-09-12,
> archive chiffrée de 3,9 Mo, conservée 30 jours). L'étape « Chiffrer » **déchiffre et relit**
> l'archive dans le même run, et elle est passée : le trajet complet est donc prouvé, phrase de
> passe comprise. Ce n'est plus une intention.

⚠️ **⑦ DKIM ET DMARC SONT POSÉS, ET C'EST L'AFFIRMATION LA PLUS COÛTEUSE DES SEPT.** « DKIM/DMARC
absents, les e-mails partent en spam » était répété comme LE défaut qui tue une ouverture en
silence. Mesuré le 2026-09-12 sur le DNS public (8.8.8.8 et 1.1.1.1), avec témoin négatif : les
**quatre** enregistrements résolvent — `brevo-code`, les deux CNAME `brevo1/brevo2._domainkey` vers
`b1/b2.passio-app-fr.dkim.brevo.com`, et `_dmarc` en `p=none`. Et le piège documenté est évité : la
cible des CNAME n'est **pas** complétée par le domaine, donc le point final a bien été posé.
⚠️ **Le DNS ne suffisait pas, et la seconde marche est FRANCHIE** : Brevo devait encore marquer le
domaine « authentifié », ce qui ne se lit PAS depuis le DNS — c'est **FAIT**, constaté sur son
tableau de bord le 2026-09-12 (`passio-app.fr` → « Authentifié »). Garder la distinction : un
enregistrement DNS qui résout ne dit rien de ce que le fournisseur en a conclu ; il faut aller le
lire chez lui.
⚠️ **La leçon de méthode** : ce point est resté « ouvert » des jours durant parce que personne
n'avait de moyen de le MESURER, et qu'une absence de plainte ressemble à une absence de défaut.
`npm run verif:dns` (`scripts/verifier-dns-email.mjs`, aucune dépendance) le tranche en deux
secondes. ⚠️ Il est **hors de `npm run verif` et hors de la CI de déploiement**, délibérément : il
juge un fait EXTÉRIEUR au dépôt, et une gate rouge qu'aucun commit ne peut réparer bloquerait tous
les déploiements. C'est un contrôle d'exploitation, pas une gate de code.

## 🧭 `search_path` FIGÉ — et pourquoi `''` n'est PAS la bonne réponse partout (2026-09-12)

`get_advisors` signalait « Function Search Path Mutable » sur cinq fonctions de `public`.
Migration : `migrations/migration_search_path_fonctions.sql` (une transaction, verdict à 6 lignes)
· banc `tests/sql/migration-search-path.test.sh` (28 contrôles, gate CI).

⚠️ **ÉTENDUE AUX CINQ FONCTIONS LE 2026-09-12 (soir).** `identifiants_figes` et
`follows_identifiants_figes` y sont entrées : elles prennent le chemin VIDE (corps relus en
production — elles ne touchent aucune relation, seulement `old`/`new` et `pg_catalog`). Le banc les
**EXERCE** après le figement, il ne se contente pas de lire `proconfig` : vérifier l'attribut ne
vérifie pas le comportement, et une garde d'intégrité muette ne se voit nulle part.


⚠️ **APPLIQUÉE EN PRODUCTION LE 2026-09-12 AU SOIR — mesuré, 5 fonctions sur 5.**
`function_search_path_mutable` a DISPARU de `get_advisors`, et `proconfig` porte le chemin attendu
sur les cinq. La recherche de passions répond toujours (contrôle par appel réel : 5 résultats sur
« randonee », donc `similarity` résout bien). Ne pas rouvrir ce point.

⚠️ **ET LE COLLER S'EST FAIT EN DEUX FOIS, POUR UNE RAISON À RETENIR.** Le premier coller n'a posé
que TROIS chemins : le fichier avait été copié depuis GitHub pendant que la fusion arrivait, donc
c'est la version **de la veille**, à trois `ALTER`, qui a été appliquée — et **son tableau de verdict
a dit OK sur tout**, puisqu'il ne connaissait que trois fonctions. C'est exactement ce que le
commentaire de la migration annonçait. **Un verdict ne peut certifier que ce que sa propre version
connaît** : il ne dit jamais « il manque quelque chose que j'ignore ». Corollaire opératoire : après
avoir collé un fichier MIROIR, vérifier l'ÉTAT en base (`proconfig`, `get_advisors`), jamais le
tableau qu'il vient d'imprimer. Même famille que `generer-ouverture --verifier` et
`generer-appliquer-tout.py`, mais le piège est ici du côté du COPIEUR, pas du générateur.

⚠️ **LES 25 AVERTISSEMENTS QUI RESTENT SONT TOUS DÉLIBÉRÉS — verdict posé le 2026-09-12 pour que
personne ne refasse l'enquête.** 18 × « `authenticated` peut exécuter une fonction SECURITY
DEFINER » : ce sont les aides appelées PAR les policies RLS (`is_conv_member`, `is_blocked_with`…),
leur retirer `EXECUTE` ferait lever « permission denied » partout (la red team l'avait suggéré,
c'était faux). 2 × `anon` sur `post_is_visible` / `comment_target_visible` : voulu, un visiteur lit
par elles les commentaires d'une publication publique. 1 × `pg_trgm` dans `public` : connu, et le
chemin choisi survit à son déplacement. 1 × `access_policies` RLS sans policy : c'est l'interrupteur
du 18+, son inaccessibilité EST sa protection. **Aucun n'est actionnable.**

⚠️ **AUCUNE des trois n'est `SECURITY DEFINER`** : c'est de la défense en profondeur, pas une porte
ouverte. Ne pas la présenter comme une faille. Ce qu'elle ferme : `storage_chemin_autorise` est
évaluée par les policies RLS de `storage.objects`, et un prédicat d'autorisation ne doit pas
résoudre ses appels dans le chemin de la session APPELANTE.

⚠️ **34 fonctions de `public` ont `proconfig IS NULL`, mais 31 APPARTIENNENT À `pg_trgm`.** On n'y
touche pas : un `ALTER` y serait perdu à la prochaine mise à jour de l'extension, et ce n'est pas
notre code. Trois seulement sont à nous — exactement les trois que le linter nomme. Compter les
fonctions sans chemin sans retirer celles des extensions donne un chiffre qui affole pour rien.

⚠️ **`rechercher_passions` APPELLE `similarity()` SANS LE QUALIFIER**, et pg_trgm vit dans `public`.
Le `set search_path = ''` que Supabase recommande partout **casserait la recherche de passions en
production** — 5 001 passions, la page Rechercher. Avant de figer un chemin, lire le CORPS de la
fonction et chercher les appels NON qualifiés ; `''` n'est sûr que si tout l'est déjà.

⚠️ **LES DEUX CONSTATS DU LINTER SONT COUPLÉS.** Le même rapport demande aussi de sortir `pg_trgm`
de `public` (« Extension in Public »). Appliquer CE conseil-là plus tard casserait
`rechercher_passions` si son chemin ne nommait que `public` — d'où `public, extensions, pg_temp`,
qui tient dans les DEUX états. Le banc déplace vraiment l'extension pour le prouver (contrôle ⑦).

⚠️ **`pg_temp` SE NOMME EN DERNIER, ET C'EST TOUT L'INTÉRÊT** : non nommé, PostgreSQL le place
IMPLICITEMENT EN TÊTE, et n'importe quel appelant peut alors masquer une fonction par une
temporaire. Le retirer en croyant durcir le remet devant.

⚠️ **`set search_path = ''` SE RELIT `search_path=""`** dans `pg_proc.proconfig` : un verdict qui
comparerait à `search_path=` dirait ECHEC sur une migration pourtant appliquée (mesuré, PG 16).

⚠️ **LA LIGNE ④ DU VERDICT EST UNE GARDE, PAS UN RAPPORT** : elle APPELLE `rechercher_passions`.
Sur une base où le chemin ne résoudrait pas `similarity`, elle lève, la transaction est annulée et
les trois `ALTER` sont DÉFAITS — le fichier ne peut pas laisser la recherche muette derrière lui.
Le banc le prouve en retirant pg_trgm (contrôle ⑧). Ne pas la « simplifier » en test de présence.

### ⚠️ LES SIX AUTRES CONSTATS DU MÊME RAPPORT : AUCUN SECOND ORACLE (mesuré le 2026-09-12)

`get_advisors` signale aussi **six fonctions `SECURITY DEFINER` exécutables par `anon`**. Après le
défaut `is_conv_member` du 11/09 (« une porte fermée sur une table se rouvre par une fonction »),
la question à trancher était : y en a-t-il un SECOND ? **Non — et c'est mesuré, pas supposé.**
Écrire ce verdict ici a autant de valeur qu'un correctif : sans lui, la session suivante refera
l'enquête, ou « réparera » trois non-problèmes et cassera des triggers vivants.

- `post_is_visible` et `comment_target_visible` : **ouverts à `anon` DÉLIBÉRÉMENT** — un visiteur
  lit par eux les commentaires d'une publication publique. Déjà écrit plus haut, ne pas y toucher.
- `is_conv_member` : **le vrai oracle**, fermé par la migration d'ouverture — **COLLÉE, mesuré le
  2026-09-12** : `has_function_privilege('anon', …, 'EXECUTE')` rend **false**. Cette ligne a annoncé
  le contraire pendant un jour, et c'est la cinquième fois que la règle sert : **l'état de la base
  ne se lit pas dans un fichier du dépôt, il se mesure.**
- `can_edit_post(pid)` : ne compare qu'à `auth.uid()`, qui est **NULL pour `anon`** — les deux
  `EXISTS` sont alors faux quel que soit le `pid`. Elle rend donc `false` en toutes circonstances et
  **ne dit RIEN sur la publication visée**. Un oracle répond sur la CIBLE ; celle-ci répond sur
  l'APPELANT. C'est la distinction à faire avant de crier à la fuite.
- `passion_request_auto_creer()` et `trg_sync_profil_passions()` : elles rendent le type `trigger`.
  **PostgreSQL REFUSE de les appeler directement**, quels que soient le rôle et les `GRANT` —
  « trigger functions can only be called as triggers », vérifié en production. Le `GRANT` que
  l'advisor voit est donc **inerte** : l'endpoint RPC existe et ne peut rien exécuter. ⚠️ Leur
  retirer `EXECUTE` ne fermerait rien et resterait à refaire à chaque `CREATE OR REPLACE` ; les
  passer en `SECURITY INVOKER` **casserait les triggers** qui, eux, ont besoin des droits du
  propriétaire. **Le seul geste juste ici est de ne rien faire.**

⚠️ **UN AVERTISSEMENT DE LINTER N'EST PAS UN DÉFAUT, ET LE TRAITER COMME TEL EN FABRIQUE.** Cinq
de ces six lignes sont du bruit ; la sixième était une vraie fuite. Le tri ne se fait qu'en LISANT
le corps de chaque fonction et en se demandant **sur QUOI elle répond** — la cible, ou l'appelant.

⚠️ `rls_enabled_no_policy` sur `access_policies` est **voulu** : RLS active, aucune policy, aucun
`GRANT` — donc refus total pour `anon` et `authenticated`. C'est l'interrupteur serveur du 18+,
et son inaccessibilité EST sa protection (fiche « ADMISSION 18+ »). Ne pas « corriger » en
ajoutant une policy.

## 🧹 QUATRE SURFACES QUI VIEILLISSAIENT SANS TÉMOIN (2026-09-12, le soir)

Aucun de ces défauts ne lève d'erreur. Ils ont en commun d'être sur des chemins que **plus personne
ne traverse** — et une surface que personne ne traverse n'est pas morte : elle vieillit sans témoin.

⚠️ **① LA LANDING RACONTAIT UNE APPLICATION QUI N'EXISTE PLUS.** Badge « Beta privée » (rideau levé
le 11/09), pilier « Documente tes voyages » (Carnet de voyage RETIRÉ par ADR-011 §6) et **deux
piliers 🤝 en double**, même emoji et même promesse. Elle ne s'affiche plus QUE pour un appareil qui
porte un compte dont la session n'est pas retrouvée — jeton expiré, hors ligne, SDK non chargé :
c'est-à-dire quelqu'un qui REVIENT. Badge réécrit sur deux faits vérifiables : gratuit (les CGU le
promettent) et 18 ans et +. ⚠️ **Et la politique de confidentialité disait le CONTRAIRE sur le même
écran** (« beta privée », « l'accès est protégé par un code ») : corrigée, et
`PASSIO_CONFIDENTIALITE_VERSION` passe à `2026-09-12` — **la version SUIT le texte**, sinon « a
accepté » ne désigne plus rien. `access-gate.js` garde son badge « Beta privée » : lui n'est peint
que quand le rideau est ARMÉ, il reste juste.

⚠️ **② LES AVATARS PARTAIENT EN PLEINE RÉSOLUTION, ET « UN SEUL POINT D'ENTRÉE » ÉTAIT FAUX.**
`passioThumb` n'avait que trois appelants, tous sur des images de publication. Le correctif vit dans
`avatarBg` (39 appelants) — mais **neuf autres surfaces ne passent pas par lui** : photos de groupe
(liste Messages, en-tête de conversation, configurateur), photos et couvertures de passion, tuile de
profil, et mon propre avatar/couverture. La première version du commentaire écrivait « ici et nulle
part ailleurs » ; c'était faux, et `audit-passio` l'a relevé. **Un point d'entrée unique pour SES
appelants n'est pas un point d'entrée unique pour la fonctionnalité — le vérifier au `grep`.**
⚠️ **La largeur est un ARGUMENT** (192 par défaut, 352 pour les avatars de 116 px, 880 pour les
couvertures) : un nombre unique serait soit flou sur le grand, soit du gaspillage sur les petits.
⚠️ **La couleur passe SOUS la photo, et c'est une garde** : un avatar est un `background`, donc sans
`onerror` — une image en échec ne laissait ni couleur (pas posée) ni emoji (`avatarInner` rend `""`
dès qu'une photo existe). Un rond vide, sans une erreur.
⚠️ **ORDRE DE GRANDEUR À DIRE JUSTE** : `changeAvatarPhoto` recadre à 480×480 en JPEG 0,9, donc un
avatar PRODUIT PAR L'APPLICATION pèse quelques dizaines de Ko. Le fichier de 2,59 Mo mesuré dans le
seau est un RÉSIDU d'import direct, pas la norme. Le gain réel est 480 → 192 px. Une fiche qui
surévalue finit par ne plus être crue.

⚠️ **③ LE MOTEUR IA CHERCHAIT DANS 19 PASSIONS, ET RETIRER LE TEXTE DE REPLI NE SUFFISAIT PAS.**
`aiGenerateResponse` devient asynchrone et consulte le référentiel ; son unique appelant l'attend en
**rejouant** la garde « la question a-t-elle changé ? » (celle d'origine est évaluée avant cette
attente-là, la plus longue). ⚠️ **Mais la PORTE était au-dessus** : `aiDetectIntent` routait
`voyage|carnet|live|cdv` vers une branche « 📔 Carnets de Voyage » renvoyant à un onglet retiré — et
`index.html` livre un raccourci « ✈️ Voyage » qui pose exactement cette question. Ces requêtes
n'atteignaient donc jamais le référentiel. Intention et branche RETIRÉES.
⚠️ **On LOGUE avant de replier** (`diagLog`) : le symptôme d'une erreur avalée dans ce bloc est
EXACTEMENT celui du défaut qu'on vient de fermer — le moteur ne rend que les 19 du socle — et sans
trace dans `client_errors` la Sentinelle ne peut pas le voir.
⚠️ La coupure `flat_passions_v1` doit couper **cette surface aussi** (`moteur.actif()`), comme les
quatre autres appelants de `chercherAsync`.

⚠️ **④ ET MON PROPRE VERROU ÉTAIT VERT SUR LE DÉFAUT.** Trouvé en le RÉINJECTANT, pas en le
relisant : il lisait `innerText`, **sensible au RENDU**, et le badge vit dans `.landing-header`, que
le navigateur ne peint pas tant que la landing est inactive — il mesurait 1 472 caractères sans le
badge et passait quoi qu'il arrive. `textContent` lit le DOM. Même famille qu'`offsetParent` qui ne
mesure rien sur un `position: fixed`.

⚠️ **AU PASSAGE, DEUX PRISES D'`audit-passio` QUI NE VENAIENT PAS DU LOT** : un attribut `style`
délimité par des APOSTROPHES autour d'`avatarBg`, qui émet ses propres `url('…')` — la balise se
refermait sur la première apostrophe dès qu'un compte de la liste « démarrer une conversation »
portait une photo (pas une injection, `_cssUrl` encode celles de l'URL) ; et le socle de
`audit-echappement` dont les clés portent l'EXPRESSION : la changer sort l'entrée du socle, et
régénérer le fichier en entier RETIRE treize entrées étrangères au lot — ajouter à la fin, ne jamais
retrier.

Verrous : `tests/e2e/avatars-et-ia-referentiel.spec.js` (10) et `smoke.spec.js` (+1). Réinjection
faite pour les quatre.
