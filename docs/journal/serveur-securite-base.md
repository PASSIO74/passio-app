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
- 🛡️ QUI VA OÙ, QUI A ÉCRIT QUOI — les décisions produit de l'audit, et ce que trois contre-revues y ont trouvé (2026-11-03)
- 🔕 LA PROMOTION NE NOMME PLUS LE PROMU À N'IMPORTE QUI, ET LES VUES PERDENT LEURS DROITS HORS RLS (R24, R26 — 2026-11-03, le soir)
- 🗑️ UNE PUBLICATION SUPPRIMÉE N'OUVRE PLUS SES COMMENTAIRES À TOUS — ELLE LES EMPORTE (R31 — 2026-11-04)
- 📌 RV-38 — L'ÉPINGLE D'UN COMMENTAIRE N'ATTEIGNAIT JAMAIS LA BASE ; SEUL LE PROPRIÉTAIRE DU FIL Y ÉPINGLERA (2026-11-05)
- 🔐 C-02 / R41, RV-44 — L'APPARTENANCE NE SE LIT PLUS SUR AUTRUI, ET LE CRÉATEUR RETIRE ENFIN UN MEMBRE BLOQUÉ (2026-11-06)

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

---

## 🛡️ QUI VA OÙ, QUI A ÉCRIT QUOI — les décisions produit de l'audit, et ce que trois contre-revues y ont trouvé (2026-11-03)

L'audit du 2026-11-02 (`.passio/audits/AUDIT_PASSIO_2026-11-02/`) laissait cinq décisions ouvertes. Benjamin les a
déléguées (« je tranche moi-même au mieux pour l'app et je les mène au bout ») : elles sont tranchées ici, codées,
testées sur banc, et **aucune migration n'est appliquée** tant que le client n'est pas servi en production et que la
contre-revue humaine de la PR n'est pas faite. Deux relectures indépendantes ont lu la première version du lot :
**deux défauts bloquants, trois moyens, six mineurs**, tous fermés avant la PR. La leçon tient en deux règles.

**① Une policy qui s'ouvre sur un état que l'appelant écrit LUI-MÊME n'est pas une frontière.** C-04 ouvrait la liste
nominative des participants « aux inscrits de l'activité ». Or « inscrit » se pose en une requête : la garde de
capacité ne tenait que le passage à `going`, donc un compte s'écrivait `maybe` (ou `waitlist`) sur n'importe quelle
activité, **passée et annulée comprises**, lisait toute la liste avec les heures de pointage, puis effaçait sa ligne.
Même chose pour « les personnes que je suis » : suivre un profil public est accepté d'office (`trg_follows_statut`),
la branche livrait donc l'historique de présence de n'importe qui à quiconque appuyait sur « Suivre ». **La règle de
LECTURE et la règle d'ÉCRITURE de l'état qui l'ouvre se conçoivent ensemble** : la branche co-inscrit demande
désormais une ligne `going` (`vient_a_activite`), une nouvelle garde `trg_event_attendees_etat` refuse tout état
autre que `declined` sur une activité passée ou annulée, et la branche « suivi » exige la réciprocité — que la
personne suivie est seule à accorder. Un blocage, dans un sens ou dans l'autre, ferme les deux.

**①bis Une liste protégée ressort par toute table qui la RECOPIE** (troisième contre-revue, sur copie de banc avec
les définitions de production). La liste des membres d'une discussion d'activité (`conv_members` de `evgrp_<id>`)
EST la liste des venants : le client y inscrit chacun d'office. Or `can_join_event_conversation` y laissait entrer
un « peut-être » — posé même sur une activité COMPLÈTE, la capacité ne gardant que `going` —, et un compte bloqué par
un venant (seul le blocage avec l'AUTEUR était regardé) ; `conv_members_select_member` montre tous les membres à
tout membre. La porte fermée sur `event_attendees` restait ouverte à côté, en un geste. La discussion suit
désormais la règle de la liste : entrée en `going` ou en organisant, membre bloqué non montré dans une discussion
d'activité, purge des membres qui n'y ont plus droit (0 mesuré), et le client ne la demande plus qu'en « je viens ».
**Fermer une lecture, c'est chercher toutes les tables qui portent la même information** — membres d'une discussion,
identifiants qui l'encodent (`n_pa_<activité>_<compte>`), événements temps réel (R25).

**② Réserver une valeur à l'INSERT ne la réserve pas.** Les identifiants de notification écrits par le serveur
(`n_m_`, `n_pa_`, `n_fw_`, `n_fr_`, `n_fa_`) étaient refusés à l'INSERT client ; mais `authenticated` tenait l'UPDATE
de TABLE et la policy « Update propre » ne bornait pas les colonnes : un compte renommait sa propre notification en
`n_fr_<A8>_<V8>` (les 8 premiers caractères d'un uuid sont publics), et le `on conflict (id) do update` de
`follows_notifier`, sans `where`, réécrivait SA ligne — il lisait « A souhaite s'abonner à ton compte privé », V ne
recevait rien. **Sur une table où le client n'écrit qu'une colonne, la fermeture est le GRANT de colonne**
(`revoke update … ; grant update (seen) …`), pas la policy. `follows_notifier` garde son `do update` sur
`user_id` ET `from_id` (le motif de `promouvoir_attente`) et marque enfin ses écritures comme serveur
(`passio.notification_serveur`) ; la purge des identifiants réservés incohérents supprime **0 ligne** en production
(13 lignes à préfixe réservé, toutes cohérentes, mesuré au canal ①).

### Les décisions

| Sujet | Décision | Où |
|---|---|---|
| **C-04** participants | la LISTE suit le lien (sa ligne ; l'organisation ; les venants entre eux ; les abonnés mutuels ; jamais un blocage) ; le NOMBRE reste public parmi les connectés (`participants_compte`) ; `rating`/`feedback`/`rated_at` illisibles par le rôle — moyenne par `notes_evenement` à partir de **3 notes de participants** (sinon `avg: null`, le nombre seul), retours écrits par `retours_evenement` (organisation seule) ; `anon` sans aucun droit | `migration_participants_visibilite_2026-11-03.sql` |
| identifiants réservés (R5) | 5 familles réservées au serveur, UPDATE client limité à `seen`, `anon` sans écriture, purge des incohérents | `migration_notifications_identifiants_reserves_2026-11-03.sql` |
| **E-08** preuve | un signalement de message COPIE le message au moment du signalement dans `signalements_preuves` (RLS sans policy, `service_role` seul en lecture/suppression), si le signalant est membre de la conversation (`is_conv_member`, sans la clause de blocage : bloquer puis signaler est le chemin normal du harcèlement) ; une copie ratée ne bloque jamais le signalement (WARNING) ; la preuve vit avec le signalement (`on delete cascade`) | `migration_signalements_preuves_2026-11-03.sql`, `scripts/moderation.js voir` |
| appartenances (R6) | réinscrire le créateur ou le pair DÉCLARÉ d'un 1:1 non ambigu qui a écrit, jamais un tiers, un groupe, une discussion d'activité, un compte en suppression ni une paire bloquée — **mesuré : 0 ligne en production** (le seul couple orphelin est un tiers, qu'on ne réinscrit pas) ; retour arrière exact par `xmin` | `migration_conv_members_reparation_2026-11-03.sql` (AVANT `oracles_et_privileges`) |
| **F-05/F-06/F-07** | index doublon et index jamais lu retirés ; index partiel du pilotage (construction non concurrente mesurée : 14 542 lignes, 17 Mo, sous la seconde) ; une seule policy `realtime.messages` en `(select auth.uid())` | `migration_index_realtime_2026-11-03.sql`, fiche dans `capacite-perf-realtime.md` |
| **C-14** dépôt public | le dossier investisseurs sort de l'arbre et entre dans `.gitignore` ; les six vidéos de la racine (copies octet pour octet de `montage-video/`) sont retirées | commit `b0588e0` |
| **R25** temps réel (appliquée le 2026-11-04 à 12:45 UTC) | identité de réplication opaque et ALÉATOIRE (`rid`, 53 bits) sur `conv_members`, `notifications`, `conv_reads`, `post_likes` : un DELETE ne publie plus la clé ; `comment_interactions` en identité par défaut ; garde `trg_rid_opaque` ; gate des index `*_rid_key` ; DDL de reprise et sauvegarde rendus fidèles (identité, séquences, nombres au-delà de 2^53) | `migration_realtime_identite_opaque_2026-11-03.sql`, fiche « 🕳️ CE QUE REALTIME DIT D'UNE SUPPRESSION » dans `capacite-perf-realtime.md` |
| **R25**, seconde couche (appliquée le 2026-11-04 à 14:25 UTC, client déployé d'abord) | `conv_members` et `notifications` hors de `supabase_realtime` : plus aucun événement de suppression ; leurs INSERT poussés au seul destinataire sur `user:<uid>`, sous `conv_members:INSERT` et `notifications:INSERT` | `migration_realtime_diffusion_privee_2026-11-03.sql`, fiche « 🔒 R25 » dans `capacite-perf-realtime.md` |

**C-14, ce qui reste.** Les PDF (business plan, livre et dossier investisseurs, état du projet) restent lisibles dans
l'HISTORIQUE git du dépôt public. Les deux remèdes ont un coût que ce lot n'a pas pris : réécrire l'historique
(`git filter-repo` + push forcé) casse chaque clone et chaque PR ouverte ; rendre le dépôt privé peut retirer la
protection de branche et le quota d'Actions selon le forfait GitHub. Décision à prendre par Benjamin (risque résiduel
de l'audit). Le `git pull` qui suit la fusion SUPPRIME le dossier de son poste : il le sauvegarde AVANT.

### Pièges de ce lot

- **Le client d'abord, et complètement.** L'en-tête de C-04 exigeait un client prêt ; la première version ne l'était
  pas : les cartes UI-4A2 et la fiche UI-4B (actives par défaut) comptaient la liste LISIBLE — « 1 participant · 1
  place restante » pour 5/6 —, et `supaLoadEventRatings` changeait `avg: null` en 0 (« ☆☆☆☆☆ 0 · 2 avis »). Un
  compteur affiché passe par `_nbInscrits` (app-07), une moyenne absente reste `null` jusqu'à l'écran.
- **Un mémo « fonction absente » a une durée de vie.** Une PWA ouverte avant la migration gardait `PGRST202` pour la
  session entière et affichait la liste partielle comme un nombre : une heure (`_memoRpcAbsenteActif`), levé aussi par
  `_oublierRefusLecturesIRL`.
- **La file se lit sous un rôle qui la voit encore.** Après C-04, celui qui se désinscrit ne voit plus la liste
  d'attente : la promotion part par la RPC même quand la file locale est vide (la base choisit), et sur CHAQUE départ
  (`going` → retrait, `declined` ou `maybe`).
- **Un verdict qui ne contrôle que deux privilèges imprime OK sur un troisième.** Le verdict d'`anon` teste chaque
  privilège de table et de colonne, MAINTAIN à partir de PostgreSQL 17.
- **Ce que PostgREST renvoie après une écriture, c'est ce que `select=` demande, plus la clé primaire** (mesuré dans les
  `postgres_logs` de production le 06/11, texte des requêtes refusées) : une écriture de `user_state` en `.select("updated_at")` (app-02) part en
  `RETURNING "user_state"."updated_at", "user_state"."user_id"`, une écriture sans `select` en `RETURNING 1`, un
  `Prefer: return=representation` SANS `select=` en `RETURNING <table>.*`. Sous un SELECT par colonnes, une écriture
  garde donc `.select("<colonnes accordées>")`, et la clé primaire doit rester lisible ; le helper `rest()`
  d'`authz-critical`, qui pose `return=representation` par défaut, prend 42501 sur `event_attendees` (RV-40).
- **Une nouvelle table de compte doit être VUE par la barrière** : `audit-tables-compte` ne reconnaissait pas
  `auteur_id`, la table des preuves (texte privé + auteur) lui échappait ; sa survie à la suppression du compte de
  l'auteur est maintenant une EXCEPTION écrite, comme `reports.reporter_id`.

- **Un retour arrière se lit dans l'ORDRE d'application.** Celui des identifiants réservés rendait à `anon`
  TRUNCATE / REFERENCES / TRIGGER, que `oracles_et_privileges` (appliquée avant) venait de fermer : il rend
  désormais l'état exact d'avant CETTE migration, et le banc compare l'empreinte des droits avant / après.
- **Un filet qui ne doit rien faire aujourd'hui porte un plafond.** `conv_members_reparation` ne réinscrit rien en
  production ; un pair RETIRÉ délibérément d'un 1:1 est indiscernable d'une ligne perdue : au-delà de 0 couple
  réparable au moment de l'application, elle s'arrête (`passio.conv_members_plafond`, relu couple par couple).

**Bancs** (`tests/sql/`, ramassés par `bancs-sql-restants.sh`) : participants-visibilite 128, notifications-
identifiants-reserves 77, signalements-preuves 82, conv-members-reparation 56, index-realtime 24 — chaque correctif
réinjecté y rougit.
**Ordre d'application** (après la contre-revue de la PR et le client servi) : `conv_members_reparation` →
`oracles_et_privileges` (#681) → `participants_visibilite` → `notifications_identifiants_reserves` →
`index_realtime` → `signalements_preuves` ; puis mesurer l'état en base (canal ①), jamais le tableau de verdict.

**Application de `participants_visibilite` (06/11).** Partie à 09:17:12 UTC depuis le poste, 8 × OK, mesurée au canal ① :
policy par lien seule en SELECT, `authenticated` ne lit plus que cinq colonnes, `anon` sans droit, les sept fonctions à
l'octet du fichier, aucun membre retiré des discussions d'activité, aucune erreur ni attente de verrou dans les journaux.
Avant elle : une contre-vérification de quatre agents (aucun bloquant ; R27 corrigé, R39, R40, RV-40 à RV-42), et la
preuve, prise dans les `postgres_logs` de production, que PostgREST ne renvoie que les colonnes demandées (piège
ci-dessus). Le détail est au § 6.3 de `04-LIVRAISON.md` (audit du 02/11).
La contre-vérification de l'état d'après (trois agents) n'a trouvé aucun bloquant, mais une voie que C-04 ne ferme pas :
**`is_conv_member(_conv_id, _uid)` répond pour n'importe quel `_uid`** (C-02), et depuis le bloc ⑥ la discussion d'activité
`evgrp_<id>` ne contient plus que les venants — elle est devenue la RECOPIE de la liste. C'est la règle de CLAUDE.md
(« une liste fermée ressort par toute table qui la recopie ou RPC qui la renvoie ») appliquée une fois de plus : fermer
une lecture, c'est chercher aussi les fonctions qui répondent SUR AUTRUI à propos d'une table qui la recopie (R41).
- **Un bloc qui atteste en local rend `attestations.json` après coup.** `attester-migration.mjs` écrit l'attestation dans
  le clone ; consignée ensuite par une PR, elle laisse le fichier MODIFIÉ sur le poste, et le `git pull --ff-only`
  suivant refuse (« would be overwritten by merge ») — premier essai de C-04 arrêté là, rien n'était parti. Le bloc du
  staging de R25 le rendait (`git checkout -- .passio/migrations/attestations.json`), celui de R38 non : tout bloc qui
  atteste finit par cette ligne, et un bloc qui tire `main` copie d'abord le fichier local avant de le rendre.

## 🔕 LA PROMOTION NE NOMME PLUS LE PROMU À N'IMPORTE QUI, ET LES VUES PERDENT LEURS DROITS HORS RLS (R24, R26 — 2026-11-03, le soir)

Deux risques résiduels de l'audit du 2026-11-02 (`05-RISQUES-RESIDUELS.md`), fermés par
`migrations/migration_promotion_discrete_vues_2026-11-03.sql` — banc `tests/sql/migration-promotion-discrete-vues.test.sh`
(79 contrôles), suite `audit-2026-11-participants-compte.spec.js` h0–h6. **Repartie de la PRODUCTION, pas d'un fichier** :
`promouvoir_attente` est celle de `pg_get_functiondef` au canal ① (md5(prosrc) `1a4a2c4dcc01309b6235d1a2c42c3383`), et le
retour arrière la rend à l'octet près — le banc construit son socle avec lui et contrôle l'empreinte.

**R24 ① — une RPC ouverte à tout compte ne rend pas l'identité d'un tiers.** En mode automatique, `promouvoir_attente` est
ouverte à tout connecté, et c'est voulu : depuis C-04, celui qui libère une place n'a plus de lien une fois parti. Mais elle RENDAIT
`user_id` du promu — une place libre et une file suffisaient à un inconnu pour apprendre, un appel à la fois, qui vient :
exactement la liste que C-04 ferme. Le nom ne va plus qu'à l'organisation (`organise_activite`) ou à la personne promue ;
tout autre appelant lit `{"ok": true}` SEUL (les motifs de refus ne portent aucune identité, ils restent). **Avant C-04 la
fuite n'ajoutait rien (la liste est lisible par tout connecté) ; c'est APRÈS qu'elle devient une fuite SANS INSCRIPTION —
d'où l'application AVANT `participants_visibilite`.** Ce n'est pas la seule (R27, ci-dessous) : un venant lit la file. C'est le ①bis de la fiche précédente, une surface plus loin : fermer une lecture, c'est
chercher aussi les RPC qui RENVOIENT la même information, pas seulement les tables qui la recopient.

**R24 ② — une notion, une définition.** La promotion CHOISIE comparait elle-même auteur et co-organisateurs : elle oubliait
`organizer_id`, qu'acceptent `organise_activite` et `_canManageEvent` (le bouton « Inscrire » échouait pour l'organisateur
désigné), et `moi <> ev.author_id` est NUL sur une activité sans auteur — jamais vrai, donc n'importe qui y désignait le promu
(0 activité concernée en production, mesuré). Elle appelle désormais `organise_activite`. ⚠️ Celle-ci n'existait pas encore en
production (elle naît avec C-04, pas avant le 05/11) : la migration la crée, **copie à l'octet près** du bloc de C-04 (banc ⓪,
empreinte des deux blocs) — `create or replace` des deux côtés, l'ordre d'application est indifférent. ⚠️ Elle a désormais un
APPELANT : le retour arrière de C-04 la laisse en place, et elle ne se supprime plus sans rendre d'abord l'ancienne promotion
(sinon 42883 à chaque départ).

**Le client ne devine pas.** `{"ok": true}` sans nom est un SUCCÈS (`supaPromoteFromWaitlist` → `{ anonyme: true }`) : le lire
comme un refus laissait les compteurs en retard d'un chargement. `_appliquerPromotionAnonyme` (app-07) RELIT l'activité par
`supaLireParticipants` (app-08, sortie de `supaLoadEvents` : une lecture, deux appelants) au lieu de peindre `ev.waitlist[0]`
comme promue — ordre arbitraire (la lecture n'a pas d'`order`), liste partielle après C-04 : ce serait désigner à l'écran une
personne que la base n'a pas nommée. Avant C-04 la relecture montre la personne promue (la liste est lisible) ; après, le
nombre seul (« +N autres »). Verrous : h0, h1, h2, h4, h5 éprouvés par RÉINJECTION du client d'avant (5 rouges : compteurs en
retard) ; h0 bis et h6 bis tiennent le monde d'AVANT la migration (`promotionNommeeATous` du faux serveur) ; h6 : l'organisateur
désigné promeut enfin.
⚠️ **Une relecture asynchrone remplace ; un delta, lui, n'écrasait rien** (revue du diff, trois défauts fermés avant la PR) :
① la relecture prend deux allers-retours — un geste fait pendant ce temps (« peut-être » juste après « je ne viens plus ») était
effacé par une liste lue AVANT lui : MA ligne suit l'état local (`_reposerMonEtatRsvp`), compteur compris (h7, relecture
retenue pour être déterministe) ; ② `_nbInscrits` prend le PLUS GRAND de la liste et du compteur : sur une relecture en panne,
baisser le compteur ne retirait pas le visage périmé — « Liste d'attente (1) » restait. Les compteurs relus disent le nombre,
une file qu'ils disent vide perd ses visages, et la relecture des listes passe par la reprise des lectures (`noterLectureAReprendre`,
idempotente, jamais sur un refus mémorisé) (h2 bis, trois GET en panne) ; ③ l'objet canonique peut être REMPLACÉ pendant
l'attente (`fusionnerEvenementsServeur`) : on écrit dans celui qu'on relit APRÈS l'`await`. h2 bis et h7 rougissent sans ces
correctifs.

**R26 — les VUES.** C-03 a retiré TRUNCATE / REFERENCES / TRIGGER / MAINTAIN aux 52 TABLES ; les trois vues
(`client_errors_par_heure`, `client_errors_top_24h`, `telemetry_last24h`) gardaient les huit privilèges (arwdDxtm). Les quatre
sont retirés comme pour les tables ; SELECT / INSERT / UPDATE / DELETE restent — SELECT ne rend rien (security_invoker + RLS des
tables de base sans policy de lecture), les trois autres sont inertes (vues non modifiables, mesuré au verdict). Seul effet
concret mesuré : TRIGGER laissait un rôle client poser un déclencheur INSTEAD OF sur une vue qui n'est pas à lui. ⚠️ Ce qui
reste, dit tel quel : UPDATE / DELETE suffisent encore à un `LOCK TABLE` sur la vue, comme sur chaque table (C-03 les garde) —
hors de portée de PostgREST, et ce n'est pas R26.

**⚠️ R26, suite (2026-11-04) — SELECT gardé n'est inerte que tant que la vue lit sous les droits de l'appelant.** Trois
anciens fichiers recréaient ces vues par `create or replace view … as` SANS option : mesuré sur PostgreSQL 16, l'option
`security_invoker` DISPARAÎT au remplacement — la vue lit alors sous les droits de son propriétaire, et le SELECT qu'`anon`
garde rend les erreurs client et la télémétrie malgré la RLS des tables. Rejouer `migration_monitoring_view.sql`,
`APPLY_ALL_scaling.sql` ou `migration_telemetry.sql` suffisait. Ils posent désormais `with (security_invoker = on)` ; aucun
n'est à rejouer. **Règle : une vue se recrée toujours AVEC ses options** — `create or replace view` n'en garde aucune.

**⚠️ UN VERDICT QUI MESURE LE COMPORTEMENT EN PRODUCTION SANS Y LAISSER UNE LIGNE.** Le tableau ne lit pas le texte de la
fonction pour dire « ne nomme pas » : il crée une activité SYNTHÉTIQUE dans une sous-transaction, appelle la RPC treize fois sous
des identités simulées (`request.jwt.claim.sub`, la lecture même d'`auth.uid()`), puis lève une exception qui ANNULE tout —
lignes, notifications, secret de pointage, réglages de session ; une sous-transaction annulée n'est jamais décodée, donc jamais
diffusée en temps réel. Les mesures survivent dans une variable, posées en réglage de transaction pour le tableau ; une erreur
imprévue du décor s'écrit au tableau (ECHEC, avec son code) sans annuler la migration. Deux pièges rencontrés en l'écrivant :
**① une lecture placée dans la MÊME instruction que l'appel voit l'instantané d'AVANT lui** (une fonction VOLATILE n'est pas vue
de la requête qui l'appelle) — chaque lecture d'état est une instruction à part ; **② une ACL `NULL` sur une fonction veut dire
« EXECUTE à PUBLIC »** — `not exists (… aclexplode(proacl) … grantee = 0)` est VRAI sur NULL, d'où `proacl is not null`. Le banc
éprouve chaque ligne par mutation (nom à tous, promue muette, auteur seul, vues gardées, décor non annulé, décor cassé).

**Ce que la contre-revue red team a confirmé, et ce qu'elle a trouvé à côté** (2026-11-03 ; lecture seule ; second banc avec
les policies et déclencheurs de production, et C-04 telle qu'écrite). Confirmé : retour arrière identique à l'octet
(`pg_get_functiondef` en md5 `c6491165…`, mêmes attributs, même ACL) ; les deux ordres d'application (R24 puis C-04, et
l'inverse) donnent les mêmes définitions et les mêmes droits ; le bloc ④ ne touche en production aucun déclencheur à effet
externe (ni pg_net, ni http, ni notify) ; les trois vues n'ont aucun lecteur. Trouvé à côté, consigné et non corrigé ici
(chacun demande sa décision ou sa revue) :
- **R27** : un VENANT lit la file (C-04 : toute ligne hors « declined »), et un inconnu qui trouve une place libre s'inscrit,
  lit, repart. R24 ① ferme la voie de la RPC, pas celle de l'inscription. Proposition : branche « venant » limitée à « going ».
  **Tranché le 06/11 : assumé**, C-04 part telle qu'attestée (0 ligne « peut-être » ni « attente » en production). La
  contre-vérification du même jour a corrigé une des raisons : une place se libère aussi sans promotion (suppression de
  compte, promotion en échec), et un inconnu devient venant d'une activité complète en entrant en file avec un
  `created_at` ancien (R28). Suite décidée, et non plus conditionnelle : `participants_visibilite` v2, avec R39 et R40
  (`05-RISQUES-RESIDUELS.md` de l'audit du 02/11).
- **R28** : l'ordre de la file est `created_at`, que le client écrit — on passe devant la file.
- **R29** : `organizer_id` se désigne sans le consentement de la personne désignée ; la policy UPDATE d'`events` garde sa
  propre lecture des co-organisateurs.
- **R30** : le pointage n'exige pas le code — `supaCheckInEvent` écrit `checked_in_at` directement, et la garde serveur
  (`event_attendees_pointage_garde`) ne regarde que la fenêtre horaire.
Et un défaut du client de ce lot, corrigé : sur un objet REMPLACÉ pendant la relecture (un chargement concurrent qui compte
déjà la promotion), le −1/+1 de secours comptait la place deux fois — « complet » fictif, et le « je viens » suivant de
l'appareil partait en liste d'attente, décidé localement : une ÉCRITURE serveur fausse. Plus de delta sur un objet remplacé :
un nombre trop bas est sans danger (la base tranche la capacité), un nombre trop haut écrit faux. Verrou h8, rouge sans le
correctif.

**Ordre** : client d'abord (même PR), puis la migration, AVANT `participants_visibilite` (05/11 18:40 UTC). Mesure au canal ①
après application : md5(prosrc) ≠ `1a4a2c4d…`, `prosrc` appelle `organise_activite`, `organise_activite` présente, et les trois
vues sans les quatre droits pour `anon` / `authenticated`.

**Appliquée le 04/11 à 07:47 UTC** depuis le poste de Benjamin (verdict 17 × OK, journalisée dans sa transaction), **mesurée
au canal ①** à 07:48 : `md5(prosrc)` de `promouvoir_attente` = `3edef536…`, celui du corps du fichier revu ; `organise_activite`
= `144cba40…` ; EXECUTE ni à `anon` ni à PUBLIC ; plus aucun des quatre droits sur les vues pour `anon` / `authenticated`
(24 avant), `service_role` inchangé ; 0 reste du décor. ⚠️ Comparer `md5(prosrc)` au fichier, c'est comparer des OCTETS : la
mesure calcule aussi `md5(replace(prosrc, E'\r', ''))`, car un worktree Windows en CRLF enverrait des `\r` que l'empreinte
d'attestation ignore (elle normalise) mais que `prosrc` garde. Ici : aucun `\r`, les deux valeurs sont égales.

## 🗑️ UNE PUBLICATION SUPPRIMÉE N'OUVRE PLUS SES COMMENTAIRES À TOUS — ELLE LES EMPORTE (R31 — 2026-11-04)

Risque résiduel R31 de l'audit du 2026-11-02 (trouvé par la contre-revue finale de R25, confirmé sur deux bancs aux corps
et policies de production), fermé par `migrations/migration_publications_supprimees_2026-11-04.sql` — banc
`tests/sql/migration-publications-supprimees.test.sh`, unitaires `tests/unit/identifiants-exemple.test.mjs`
(5) et `tests/unit/purge-compte.test.mjs` R31 ①–⑮. **Serveur seul : le client ne change pas** — `deletePost` garde son
DELETE vérifié par relecture, et sa confirmation « Le post et ses commentaires seront supprimés » devient vraie.

**Le défaut.** Aucune clé étrangère ne relie `post_comments`, `post_likes`, `comment_interactions` à `posts` ; `deletePost`
et la purge de compte n'effaçaient que la publication. Et `post_is_visible` rendait VRAI quand la ligne `posts` manque — une
branche écrite le 2026-07-20 pour le contenu de démonstration (« pas de ligne posts = contenu seed/local → public »).
`comment_target_visible` faisait de même pour toute cible inconnue. M (privé) publie, V (abonné) commente et aime, M répond :
sans compte, 0 / 0 / 0. M supprime la publication, ou son compte : sans compte et sans filtre, on lit le commentaire de V,
son « j'aime », la réponse de M. V supprime SON commentaire : la réponse de M devient publique. Et sans AUCUNE suppression,
les réactions aux RÉPONSES d'une publication privée (`comment_id = srep_<date>`) étaient lisibles par tous. Le banc ①
rejoue les quatre voies sur les définitions de production (md5 vérifiés) avant de rien corriger.

**① Une absence n'est jamais une autorisation.** La base ne distingue pas « n'a jamais existé » de « a été supprimé » : une
règle qui ouvre sur une ligne MANQUANTE ouvre aussi tout ce qui viendra à manquer. L'exception d'origine était un cas (le
contenu de démonstration) écrit comme une règle (« pas de ligne → public »). Elle se NOMME désormais :
`est_identifiant_exemple(id)`, une liste FERMÉE des familles que le client fabrique (`buildSeed()` d'app-01,
`SEED_REEL_VIDEOS` d'app-05 : `p<n>`, `pm|pp|pv<n>`, `pn_<thème>_<n>`, `pac_<thème>`, `p_ev_<thème>`, `p_ev<n>_e<n>`,
`reel_seed_…`, `e<n>`). `identifiants-exemple.test.mjs` la confronte au seed (tout exemple y entre), aux générateurs du
contenu RÉEL (`uid()`, `"reel_" + uid()`, `post_<ms>_<9>` : aucun n'y entre) et au format de la purge ; il rougit sur un
exemple ajouté sans elle. ⚠️ **Un exemple nouveau qui n'y entre pas a ses commentaires lisibles par leur seul auteur** :
c'est le test qui le dit, pas un utilisateur.

**② Une interaction se lit comme son FIL, pas comme sa cible.** La correction littérale (« cible inconnue → personne » dans
`comment_target_visible`) aurait CACHÉ, mesuré au canal ① avant d'écrire une ligne, les interactions des commentaires
d'activité (38 dans des activités d'exemple `e<n>`, 1 dans une activité réelle : leurs `ec_…` ne sont dans aucune table) et
les réactions aux réponses des publications réelles (6) : leur cible est un identifiant que seul le client fabrique. Ce qui
les rattache, c'est `post_id`, que le client pose toujours (0 ligne sans, 0 dont la cible contredit le fil). La policy passe
donc par une surcharge, `comment_target_visible(comment_id, post_id)` : publication existante → sa règle ; activité
existante → publique (comme `events` et `event_comments`) ; exemple → public ; fil disparu ou inconnu → personne ; sans fil,
la cible. La mutation « cible seule » du banc ⑧ montre ce que l'autre choix coûtait : l'auteur ne lit plus les réactions à
SES réponses.

**③ La cible supprimée emporte ce qui la vise — par déclencheur.** Ni clé étrangère (un commentaire sur un EXEMPLE n'a, par
construction, aucune ligne `posts` à viser, et `comment_interactions` vise trois sortes de cibles), ni RPC de suppression (le
DELETE direct reste permis, la purge de compte passe par la clé de service, les scripts par SQL). Deux déclencheurs AFTER
DELETE **par instruction**, à table de transition (une purge de compte efface toutes les publications d'un auteur en un
passage), fonctions SECURITY DEFINER à `search_path` vide — les noms de transition se résolvent avant tout schéma, mesuré
sur banc : `trg_purger_cibles_publication` (`posts` → commentaires, « j'aime », co-auteurs, interactions dont la publication
est le fil OU la cible) et `trg_purger_cibles_commentaire` (`post_comments` → ses réponses et réactions, que la RLS ne
laissait effacer au client que pour les siennes). Index `idx_ci_post` : le prédicat du déclencheur et de la policy.

**④ Le passé.** 14 commentaires, 16 « j'aime » et 50 interactions visaient une publication ou une activité SUPPRIMÉE
(format réel, sans ligne ; la plus récente le 2026-09-01) : effacés par la migration, ce que ③ aurait fait. Identification
POSITIVE (le format que le client fabrique pour le contenu réel), jamais « tout ce qui n'a pas de ligne » : les exemples,
l'ancien `p_vlog_…` (26 commentaires, 9 « j'aime », 61 interactions — le client ne le fabrique plus, il est caché comme un
inconnu), les lives et étapes de carnet retirés (`live_…`, `carnetstep:…`) restent, lisibles par leur seul auteur hors
exemples. Plafond de 300 : au-delà, la migration REFUSE et rien n'est appliqué (banc ⑤) ; une hausse expliquée se pose
après `begin;` — un changement du fichier, donc une contre-revue. Le banc ⑧ « purge large » montre ce que le plafond ne
voit pas et que le format garde : un filtre trop large efface les EXEMPLES.

**⑤ La purge de compte relève AVANT d'effacer.** `supabase/functions/_shared/purge-compte.js` (`DEPENDANCES_PUBLICATION`,
`DEPENDANCES_COMMENTAIRE`) relève les publications et commentaires du compte, efface ce que d'AUTRES y ont écrit (par lots
de 50), puis le RELIT : une dépendance qui reste est un reste nommé (`dependances:…`). Elle ne dépend pas de l'ordre
d'application de la migration (avant elle, c'est le seul filet). ⚠️ **La barrière de suppression ne garde que les écritures
DU compte** : un tiers qui commente pendant la purge laisse une ligne tardive, réeffacée une fois (R31 ④ du test). Une
liste illisible est un échec nommé, jamais « rien à faire ». Ce n'est pas l'export : ces lignes sont les données d'autrui.

**⑥ Un identifiant CHOISI n'efface rien d'autrui (relecture de la PR, 04/11).** Le client choisit l'identifiant de ce qu'il
crée, et un déclencheur SECURITY DEFINER, comme la purge à la clé de service, efface pour tout le monde. La première version
s'y fiait : publier sous l'identifiant d'une activité ou d'un exemple puis supprimer emportait leur fil ; commenter sous
l'identifiant d'une publication, d'une réponse (`srep_…`) ou d'un commentaire d'exemple puis supprimer emportait les
réactions de l'original. Trois règles, aux DEUX endroits (déclencheurs et `purge-compte.js`) :
- une publication homonyme d'une activité, ou au format d'un exemple, n'emporte rien ;
- une interaction n'appartient qu'à son FIL : la cible seule ne vaut que sans fil, et un commentaire n'emporte que le sien ;
- un commentaire n'emporte rien s'il porte le nom d'une publication, d'un commentaire d'activité, d'un exemple ou d'une
  réponse ; dans un fil d'exemple, seul un `c_<uid>` compte (`c1`, `cp1_1`… sont ceux de démonstration).
La purge de compte ajoute une borne : un identifiant de plus de 120 caractères ou hors du jeu que le client fabrique n'entre
dans AUCUN filtre (`cribler`, compté dans `dependances.ecartes`, jamais répété). Mesuré le 04/11 : 0 homonyme, 0 interaction
dont le fil contredit la cible, 31 caractères au plus. ⚠️ Le format d'un commentaire réel fait 19 caractères (`c_` + 17) : le
test ⑤ a rejeté une première expression trop courte, en tirant de vrais `uid()`.

**Pièges du lot.**
- **Un verdict qui mesure la RLS doit la mesurer SOUS LE RÔLE.** Le bloc ④ lit sous `anon` et `authenticated`
  (`set local role` dans le DO, possible parce que `postgres` en est membre — mesuré, `pg_auth_members`) et supprime par
  l'AUTEUR sous son rôle (la policy « Suppression propre » joue) ; la suppression en nombre se fait comme la purge, sans
  session. Tout est annulé (`passio_verdict_annule`), rien n'est décodé par le temps réel.
- **Un verrou qui ne vient pas fait ÉCHOUER la migration, il ne fait pas attendre l'application.** `set local lock_timeout
  = '5s'` : sans lui, `create trigger` sur `posts` attend derrière une écriture et met en file toutes les suivantes (banc ⑥ :
  un écrivain qui tient `posts` 12 s, échec en 5, rien d'appliqué).
- **Chaque ligne effacée par le déclencheur part en DELETE du temps réel.** Avant R25 (#692), celui de `post_likes` porte
  `(post_id, user_id)` à tout abonné : qui avait aimé, une fois — au lieu d'une lecture permanente par la clé publique.
  Appliquer R25 d'abord, de préférence.

**Ce qui reste, dit tel quel.** Un orphelin peut encore NAÎTRE : un « j'aime » ou un commentaire écrit APRÈS la suppression
(client resté ouvert, file hors-ligne, fenêtre de la suppression) — les INSERT ne vérifient pas que la cible existe ; il
n'est lisible que par son auteur, sauf si quelqu'un recrée une publication SOUS LE MÊME IDENTIFIANT (choisi par le client).
Proposition : `post_is_visible(post_id)` / `comment_target_visible(comment_id, post_id)` dans le WITH CHECK des trois
INSERT. Les réactions aux réponses d'un commentaire supprimé restent dans le public de leur publication (affichées nulle
part, effacées avec elle). Un commentaire d'activité supprimé garde ses interactions (contenu public). TRUNCATE ne déclenche
pas DELETE. `comment_likes` n'entre pas dans ce lot, décision prise : le client ne l'écrit que pour les commentaires d'activité
et de carnet (publics par conception), et aucune de ses 3 lignes ne vise un commentaire de publication (mesuré le 04/11).

**Ordre et mesure.** Indépendante (ni identité de réplication, ni C-04, ni promotion), de préférence après R25. Après
application (poste de Benjamin, `node scripts/appliquer-migration.mjs migrations/migration_publications_supprimees_2026-11-04.sql
--projet njkiyoklssvefstljemx`), mesurer au canal ① : `md5(prosrc)` des deux fonctions (≠ `5ff0bf77…` / `f02f0f69…`, = le
fichier), la présence de `comment_target_visible(text,text)` et d'`est_identifiant_exemple` sans EXECUTE pour `anon` /
`authenticated`, le texte de la policy, les deux déclencheurs (`tgenabled = 'O'`), `idx_ci_post`, et 0 orphelin au format
réel — jamais le tableau de verdict seul.

**Appliquée le 2026-11-04** (revue n°5773659643 sur `d1dba655`, auto-revue de mainteneur unique postée par Claude Code sur
l'ordre de Benjamin ; empreinte `cbd9428a…`) :
- **Staging, 18:32 UTC** : 18 OK, mesuré en base. Les suites à comptes réels, à la tête de `main` et sur la base migrée :
  19 verts, 3 ignorés.
- **Production, 18:37 UTC** : 18 OK ; `14 / 16 / 0 / 50`, `19 / 17 | 26 / 9`, `121 | 73`, les valeurs attendues. Mesuré au
  canal ① : `post_is_visible` `5bfa68f2…`, `comment_target_visible(text)` `f8af90b8…`, `(text, text)` `e28dab52…` ; policy,
  deux déclencheurs à `O`, droits, `idx_ci_post` ; 0 orphelin au format réel ; 77 commentaires, 60 « j'aime », 339 interactions.
- **Sans compte, par PostgREST** (le connecteur refuse de prendre le rôle `anon`, 42501) : 21 commentaires, 18 « j'aime »,
  131 interactions lisibles, dont aucun sans cible, et aucune réaction à une réponse hors du public.
- **Pas éprouvé** : une vraie suppression de publication ou de compte en production, depuis l'application. Le verdict la
  rejoue dans une sous-transaction annulée ; le staging l'a passée par `suppression-compte`. La revue red team n'a jamais été rendue.

---

## 📌 RV-38 — L'ÉPINGLE D'UN COMMENTAIRE N'ATTEIGNAIT JAMAIS LA BASE ; SEUL LE PROPRIÉTAIRE DU FIL Y ÉPINGLERA (2026-11-05)

**Statut : corrigé — appliqué au staging puis en production le 07/11** (production à 08:33:11 UTC, `migrations_appliquees`
id 34, verdict 21 × OK et l'information à 0), mesuré au canal ①, prouvé à deux comptes sur le staging migré (« Application
et mesure », en fin de fiche). Client : #727 (156dd85) ;
migration : #734 (019896b), `migrations/migration_epingle_commentaire_2026-11-05.sql` (sha256 `be2f5942…`).

**Le défaut (registre RV-38, trouvé pendant le lot R37).** `togglePinComment` (app-04) écrivait l'épingle dans
`comment_interactions` (`kind = 'pin'`, charge « 1 » / « 0 ») par `supaCommentInteract`, sans lire le résultat. La
contrainte de production `ci_kind_check` n'admet que `like`, `reply`, `emoji`, `gif` : **chaque** épingle était refusée
(23514), et l'écran disait « Commentaire épinglé ». L'épingle restait locale à l'appareil du propriétaire du fil ; la
branche `pin` de `supaLoadCommentInteractions` n'a jamais rien eu à lire. Et ce lecteur prenait la dernière ligne `pin`
d'un commentaire **de qui qu'elle soit, dans n'importe quel fil**.

**Mesuré au canal ① (05/11, 06/11).** 339 interactions (188 like, 77 reply, 72 emoji, 2 gif), **0 pin** ; 0 action
`cint` de genre `pin` en télémétrie (3 jours), 0 erreur nommant `ci_kind_check` (24 h) : rien à reprendre. Policies :
`ci_insert` = `user_id = auth.uid()` ET la barrière de suppression — **ni le fil ni son propriétaire**. Aucune policy
UPDATE. 0 homonyme entre `post_comments` et `event_comments`, ni entre `posts` et `events` (leurs identifiants ont
pourtant le même format : un homonyme ne vient que d'un geste délibéré) ; `organizer_id` = `author_id` pour toutes les
activités.

**La décision : garder l'épingle et la rendre vraie** (pas la retirer de l'interface). C'est une fonction voulue du lot
« UX IG/FB » (#11), proposée au seul propriétaire du fil, et le correctif est borné.

**⚠️ « Ajouter `pin` à `ci_kind_check` » ne suffit PAS : c'est ouvrir une porte.** La WITH CHECK de `ci_insert` ne
connaît ni le fil ni son propriétaire : avec la seule contrainte, **n'importe quel compte** épingle le commentaire de son
choix chez n'importe qui, et l'ancien lecteur l'affiche chez tous (le banc le rejoue : « correction naïve », ①).

**Deux PR, le client d'abord** (le précédent de RV-36) — la migration est un périmètre critique (contre-revue humaine,
« Gouvernance critique »), le client non.

**Le client (#727).**
- `supaEcrireInteraction` (app-08) rend le **verdict** (`{ ok }`, ou le code, le message, l'indice, la panne réseau
  par `estEchecReseau`) ; `supaCommentInteract` en reste la forme booléenne.
- `togglePinComment` : affichage optimiste, puis le verdict. Un refus **défait** l'écran à l'identique (l'ancien
  épinglé revient) et le **dit** (`_motRefusEpingle` : 23514 « pas encore disponible », 42501 « refusée », réseau
  « pas de connexion »). La **cible** part d'abord, le « 0 » de l'ancien ensuite et seulement si elle passe. Un
  commentaire pas encore en base (`_pending`, `ec_local_…`) n'est pas tenté, et la raison est dite.
- ⚠️ **L'épingle est un ÉTAT DU FIL, pas d'un commentaire** : un seul épinglé par fil, retenu par fil
  (`_epinglesFil`) et lu par le rendu (`_estEpingle`), jamais le drapeau `pinned` d'objets qu'une page serveur
  reconstruit. Elle se **lit au niveau du fil** (`supaLireEpingleFil` : les lignes `pin` du **propriétaire**, dans
  **ce** fil, les plus récentes d'abord ; `_epingleDesLignes` : le « 1 » le plus récent l'emporte, sauf si un « 0 » plus
  récent vise ce même commentaire). Une épingle **reçue en direct** suit les mêmes règles (`_epingleRecue`), la mienne
  comprise ; une ligne **retirée** en direct fait relire le fil affiché, une fois par rafale (`_epingleRetiree`).
- Le **propriétaire** du fil (`_proprietaireFil`) : l'auteur de la publication, l'organisateur de l'activité
  (`organizer_id || author_id`) — la définition de la garde. Un fil **homonyme** (connu ici comme publication ET comme
  activité, `_filAmbigu`) n'en a pas : ni épingle lue, ni reçue, ni proposée, ni posée, et ce qu'on en savait s'efface.
  Le fil d'un exemple ou d'un visiteur (propriétaire sans compte réel) ne se lit pas.
- **Ce qu'elle ne coûte pas** : l'épingle s'applique APRÈS les « j'aime » de l'hydratation et ne les fait pas attendre ;
  elle ne repeint et ne sauve que si l'épinglé change (une épingle reçue repeint sans jamais sauver) ; une activité
  rechargée par le temps réel ne la relit pas quand elle est connue ; le panneau d'une bobine ne la lit pas (sa page
  détail, si).
- L'**épinglé plus ancien que la première page** (30) est lu par son identifiant (`supaLireCommentaire`), rangé en tête
  et marqué `_epingleGarde` — seulement s'il est HORS des pages chargées : un épinglé récent (écrit de mon autre appareil,
  manqué par le direct) est rangé à sa place, comme les autres. La page relue garde l'épinglé lu à part (sans clignoter),
  mais il se **revérifie** à chaque page relue, même dans une discussion paginée plus loin — absent en base, il part, lui
  seul ; quand l'épingle le quitte, il part aussi (`_retirerEpinglesGardes`, sur une vérité du serveur seulement) ;
  apporté par « précédents » ou reçu en direct, il n'est plus « gardé » ; la dernière page atteinte sans lui l'enlève et
  le décompte. Il ne prend pas une des 30 places affichées.
- Une écriture dont la RÉPONSE se perd alors qu'elle a abouti : son écho le prouve, l'écran relit la base et dit
  « Commentaire épinglé » au lieu d'annoncer un échec.
- Le marqueur **`EPINGLE_DU_FIL`** (« comment_interactions:epingle-du-fil ») : la migration le déclare en
  `-- PREREQUIS-CLIENT`.

**La migration** `migration_epingle_commentaire_2026-11-05.sql` (PR suivante ; contre-revue humaine, attestation,
`appliquer-migration.mjs`) : `pin` admis par `ci_kind_check`, `ci_pin_payload_check` (« 0 » ou « 1 », jamais rien), et la
garde `trg_ci_epingle_garde` (BEFORE INSERT OR UPDATE, `WHEN (new.kind = 'pin')`, SECURITY DEFINER, `search_path` vide,
aucun EXECUTE client). Pour un rôle client : son identité, à son nom, un fil annoncé, la charge « 0 »/« 1 » (jugée par la
garde, AVANT la contrainte) ; le **genre** du fil lu dans `post_id` ; le commentaire de CE fil, dans la table de CE genre ;
l'appelant en est le propriétaire (`posts.author_id`, `coalesce(nullif(organizer_id, ''), author_id)`) ; **aucun « 1 »
dans un fil homonyme**, mais le « 0 » du propriétaire y passe. Un refus unique (42501, le message d'un refus RLS, un
indice qui nomme l'épingle). L'administration n'est pas jugée. Verdict de 22 lignes **fermé sur échec**. Banc
`tests/sql/migration-epingle-commentaire.test.sh` : 76/0, treize mutations, socle élargi aux corps, policies et
déclencheurs de production des quatre tables du décor (md5 au canal ①).

**Les pièges du lot.**

- ⚠️ **Le genre du fil se lit dans `post_id`, et un fil homonyme n'a pas de propriétaire.** Publications, activités et
  commentaires portent des identifiants **choisis** par le client. La première version de la garde lisait le fil dans la
  table du COMMENTAIRE : un compte publiait sous l'identifiant de l'activité d'autrui, y commentait, épinglait — admis,
  propriétaire de « sa » publication — et tout client qui résolvait le propriétaire par l'identifiant (`_findCommentThread`
  cherche d'abord une publication) affichait son épingle sur l'activité (red team, P2). Désormais : aucun « 1 » dans un
  fil homonyme, côté serveur ; aucun propriétaire, côté client.
- ⚠️ **Une garde juge l'écriture, pas ce qu'un identifiant désignera plus tard** : une épingle posée dans son propre fil,
  puis un commentaire du même identifiant écrit (ou RENOMMÉ — `identifiants_figes` ne fige pas `id`) dans le fil d'autrui,
  et l'**ancien** lecteur (par `comment_id`, de qui que ce soit) l'affichait chez autrui (red team, P1). Seul un lecteur
  borné au fil et au propriétaire s'en garde : la migration **exige** ce client (`-- PREREQUIS-CLIENT`), et
  `appliquer-migration.mjs` refuse tant que le client servi ne porte pas le marqueur.
- ⚠️ **Un « 0 » ne se refuse pas pour un homonyme** : il n'affiche rien, et un homonyme créé APRÈS une épingle la
  verrouillait (red team, P2).
- ⚠️ **Une charge invalide est un refus comme les autres**, jugée par la garde : laissée à la contrainte, un 23514
  disait que la garde avait admis le reste (red team, P4).
- ⚠️ **Une lecture en ÉCHEC n'est pas une lecture vide** (`null` ≠ `{}`, et `supaLireCommentaire` : `false` = absence
  lue, `null` = on ne sait pas). Lue comme « aucune épingle », une panne retirait l'épingle de l'écran ; une lecture
  **réussie** sans ligne retire, elle, l'épingle restée locale d'avant RV-38.
- ⚠️ **Commentaire par commentaire, l'épingle ressuscite** ; une page de 30 cache l'épinglé plus ancien. D'où la lecture
  par FIL et sa règle.
- ⚠️ **Une page serveur reconstruit les objets commentaires sans leur drapeau** (`_fusionnerPageCommentaires`,
  `_setEventComments`) : l'état vit par fil, semé du drapeau tant qu'aucune lecture n'a eu lieu (`_semerEpingleFil`).
- ⚠️ **Une lecture partie AVANT ou PENDANT un geste ne le défait pas en revenant** : une génération par fil, avancée au
  DÉBUT et à la FIN de chaque écriture, à chaque épingle reçue et à chaque retrait. Une épingle du propriétaire reçue
  PENDANT l'écriture (son autre appareil) n'est pas réécrasée : la base tranche, relue ; l'écho de ma propre écriture
  n'en est pas une (`_epinglesEcrites`).
- ⚠️ **Ne rien repeindre, ne rien sauver qui n'ait changé** : chaque ouverture repeignait la discussion avant les
  « j'aime » (« 🤍 0 ») et envoyait `user_state` en entier ; une purge coûtait une relecture par ligne à chaque
  spectateur (l'amplification que R37 avait écartée).
- ⚠️ **L'ordre des écritures compte** : la cible d'abord.

**Verrous.** `tests/e2e/epingle-commentaire.spec.js` (27 cas locaux ; le simulateur honore filtres, ordre, limite et
curseur, sépare la lecture de l'épingle de celle des interactions, sait perdre une réponse après validation et retarder
la lecture d'un commentaire par son identifiant) : quarante-quatre réinjections au fil des contre-revues, chacune
rougit son cas (l'épinglé récent porte deux défenses superposées : ⑳ rougit quand les deux tombent). `tests/e2e/epingle-commentaire-reel.spec.js` (deux comptes, staging,
`SUITES_PROD`) : une sonde sans effet dit si la migration y est ; absente, le vrai refus 23514 est dit et défait — c'est
ce qu'a mesuré sa première exécution en CI (#727) ; présente, A épingle, B la voit après **rechargement**, B est refusé
(42501 et l'indice), A retire. Le banc SQL (76/0) et ses treize mutations.

**Les contre-revues** (toutes en lecture seule ; leurs reproductions rougissent désormais) :
- `audit-passio`, client, 06/11 : trois P2 (retirer l'épinglé ressuscitait un « 1 » plus ancien ; l'épinglé hors de la
  première page invisible ; une lecture ou une page relue pendant l'écriture défaisait l'épingle confirmée), un P3, trois
  P4 — corrigés (61fb36c) ;
- `passio-red-team`, migration, 06/11 : P1 (l'ancien lecteur et l'identifiant réutilisé après l'épingle ; aucun
  prérequis client déclaré) ; P2 (le propriétaire d'une activité résolu par une publication homonyme, côté serveur ET
  client) ; P2 (un homonyme créé après l'épingle la verrouillait) ; P3 (`organizer_id` vide : garde et client divergeaient) ;
  P4 (oracle 23514/42501, verdict et socle du banc incomplets, retrait en direct ignoré) — tous corrigés (3224fa0 pour le
  client, la migration révisée) ; ce qu'elle a vu en passant est au registre (RV-45 à RV-48) ;
- `audit-passio`, deltas, 06/11 : 61fb36c → deux P2 (repeinte avant les « j'aime », `saveState` à chaque ouverture),
  deux P3, des P4 ; 3224fa0 → un P3 (une relecture par retrait), deux P4 ; 84cb6b3 → un P2 (l'épinglé gardé jamais
  revérifié), trois P4 ; d38d2fb → aucun P2, mais trois régressions (P3 : un commentaire RÉCENT lu par son identifiant
  était « gardé » et quittait la liste avec l'épingle ; P4 : l'écho de mon écriture, seule preuve d'une écriture dont la
  réponse s'est perdue, était jeté ; P4 : une absence lue retirait aussi le nouvel épinglé) et deux trous préexistants
  (discussion paginée plus loin : jamais revérifié ; dernière page atteinte : l'épinglé supprimé restait et comptait) —
  tous corrigés (84cb6b3, d38d2fb, e86c955).
- Restés, dits tels quels : un ancien client non rechargé (la minute qui suit un déploiement) lit encore par
  `comment_id` ; « un seul épinglé par fil » n'est pas un invariant du serveur ; les lignes d'un commentaire d'ACTIVITÉ
  supprimé restent (R31), sans rien afficher.

**Application et mesure (07/11).** Contre-revue : la revue n°5811045261 de PASSIO74 sur `3bde757`, auto-revue de
mainteneur unique (ASTRA-61 bis), rédigée par une session Claude Code à la demande de Benjamin ; elle nomme les deux
cibles. Avant l'attestation, le contrôle de preuve d'`attester-migration.mjs` a été rejoué hors ligne sur la vraie revue,
pour les deux cibles (témoin : une revue qui ne nomme pas une cible est refusée), et la phrase d'assomption lue à l'octet dans l'appel qui
l'a publiée : la CI ne contrôle que le marqueur, une espace insécable devant « : » l'aurait fait refuser. Depuis le poste,
dans un worktree détaché de `main` (019896b) : une attestation par cible, consignées ici à l'identique (blob
`64ee539a`, celui du `git diff` imprimé) ; le staging d'abord (prérequis « non exigé ici » : aucun client servi connu
pour cette cible), puis la production après `--verifier` (la barrière a lu le marqueur dans le client servi,
`app.js?v=a0fa987522`) ; les deux verdicts : 21 × OK, l'information à 0.

Mesuré au canal ① à 08:35:50 UTC, jamais le tableau (état de référence relevé à 08:32:45 : quatre genres, aucune garde,
aucune ligne de journal) :
- `ci_kind_check` à cinq genres (`like`, `reply`, `emoji`, `gif`, `pin`) et `ci_pin_payload_check`, toutes deux validées ;
- `trg_ci_epingle_garde` = `BEFORE INSERT OR UPDATE … FOR EACH ROW WHEN ((new.kind = 'pin'::text)) EXECUTE FUNCTION
  ci_epingle_garde()`, actif, premier des trois déclencheurs BEFORE (`trg_ci_epingle_garde`, `trg_rate_limit`,
  `zz_barriere_suppression`) ;
- corps `9078992e4fdd194a5b9e9afae4ada3e6` (brut et normalisé), SECURITY DEFINER, `search_path=""`, ACL
  `{postgres=X, service_role=X}` : ni `anon` ni `authenticated` ne l'exécutent ; RLS active ;
- les trois policies de `comment_interactions` inchangées à l'octet (`4fc9fe8f…`, `100a0f66…`, `72198d79…`) ;
- 0 épingle ; 0 trace du décor (`zz_rv38_%` dans les cinq tables, les comptes `…3801` à `…3805`, leurs notifications,
  les secrets de pointage) ;
- journal d'application : id 34, `applique_le` 08:33:11 UTC, l'attestation identique à l'entrée de production consignée ;
- journaux Postgres de 08:30 à 08:40 : rien qui touche la migration. Le fond y est le même que la veille : refus RLS
  sur `profiles` (180 de 08:30 à 08:40, le premier à 08:30:28 ; de 181 à 347 par heure le 06/11 au soir),
  coupures de connexion de réplication (une à cinq par heure).

**Preuve à deux comptes (07/11).** `epingle-commentaire-reel.spec.js`, CI de #743 (run 42356513820, job « Suites
production (comptes réels) », sur le staging, 08:44:21 → 08:48:11 UTC) : « migration RV-38 sur le staging : PRÉSENTE (la
garde refuse l'inconnu) » ; 21 réussis, 3 sautés, 0 échec, aucun instable. Une fois la présence lue, le test n'a plus de
chemin de saut : ses quatre étapes ont passé — A épingle le commentaire de B (accepté, une ligne « 1 » en base, en tête à
l'écran) ; B, après RECHARGEMENT, voit l'épingle en tête avec « Épinglé » ; B ne peut pas épingler chez A (42501, l'indice
de la garde, rien d'écrit) ; A retire l'épingle et B, rechargé, ne la voit plus. Le run de `main` de la fusion de #734 ne
pouvait pas le dire : son job à comptes réels s'est terminé à 08:31:57, avant l'application au staging.

**Ce qui reste.** Hors lot : RV-45 à RV-48 (registre), et les restes dits ci-dessus.
## 🔐 C-02 / R41, RV-44 — L'APPARTENANCE NE SE LIT PLUS SUR AUTRUI, ET LE CRÉATEUR RETIRE ENFIN UN MEMBRE BLOQUÉ (2026-11-06)

**Statut : appliqué en production le 06/11 à 21:38:05 UTC** (verdict 17 × OK, `migrations_appliquees` id 33), mesuré au canal ①
(corps `814ad66c…`, policy `ff0689d9…`, 11 dépendants tous des policies, 0 trace du décor ; § 9.8 de la livraison).
`migrations/migration_discussions_activite_2026-11-06.sql` (sha256 `2d423d5f…`), banc
`tests/sql/migration-discussions-activite.test.sh` 175/0, client `removeGroupMember` (app-05) et son verrou
`tests/e2e/retrait-membre-groupe.spec.js` 24/24. Application, contrôles et retour arrière : § 9 de
`.passio/audits/AUDIT_PASSIO_2026-11-02/04-LIVRAISON.md`. Revu le même jour, avant toute attestation, par trois agents
relecteurs Claude Code, chaque trouvaille grave contre-vérifiée par un sceptique : cinq défauts confirmés et treize mineurs,
corrigés ou consignés ci-dessous ; puis contre-revu sur sa tête le soir (fin de fiche, et § 9.7).

**Le défaut.** `is_conv_member(_conv_id, _uid)` (`SECURITY DEFINER`, EXECUTE pour `authenticated`) répondait pour n'importe
quel `_uid` (C-02, au registre depuis le 02/11 comme « chantier transverse »). Sans incidence tant que la liste des
participants se lisait en clair ; C-04 l'a fermée, et son bloc ⑥ a fait de la discussion `evgrp_<activité>` la liste des venants
et de l'organisation — plus ceux qui y sont entrés et n'y sont plus venants, que rien n'en retire (R18) ; le client y inscrit
chaque « je viens » : `rpc/is_conv_member`, profil par profil, la rendait (R41). Et
RV-44, régression de C-04 : sa policy SELECT cachait au créateur de la discussion un membre bloqué avec lui, donc le DELETE de
« Suppression admin » touchait 0 ligne — et `removeGroupMember` annonçait le retrait sans lire le résultat.

**Le choix : fermer la fonction, pas ses appelants.** Inventaire de production (canal ①, 06/11) : les 11 policies qui
l'appellent lui passent toutes `(select auth.uid())::text`, `storage_chemin_autorise` aussi, `trg_reports_preuve_message`
passe `new.reporter_id` que `reports_insert` lie à l'appelant ; aucun client, aucune fonction Edge. Un corps qui ne répond
QUE sur l'appelant connecté — `(_uid = (auth.uid())::text or auth.uid() is null) and exists(…)` — ne change donc rien pour
eux, et le verdict REFUSE la base si l'inventaire a bougé (lignes 13 à 15). Sans session : inchangée (déclencheurs,
service_role). L'ordre est voulu : l'appelant est contrôlé avant la lecture (sur autrui, conv_members n'est pas lu : 0 lecture
sur 100 appels, 100 avec l'ordre inverse) et l'égalité vient en tête (les policies n'évaluent auth.uid() qu'une fois : +26 à
+28 % sur une lecture de 40 messages au lieu de +46 %). Le créateur d'une discussion voit tous ses membres
(`or is_conversation_creator(conv_id)`), comme l'organisation voit toute la liste dans `event_attendees_select_lien` : il peut
les retirer, ce que la policy DELETE lui accordait déjà.

**Le client : l'écran ne dit que ce que le serveur a rendu.** Retrait LOCAL, sans requête, pour ce que le serveur n'a jamais pu
avoir (visiteur — `_compteAuthReel()`, pas `_supaReal`, vrai pour tout appareil dès que le SDK se charge —, ébauche
`conv_grp_…`, identifiant non uuid : les personnages de démonstration que « Nouveau groupe » propose, que la clé étrangère
refuse) ; rien ne change, et l'écran le dit, pour un compte réel qui ne joint pas le serveur (session expirée, SDK absent) ;
sinon DELETE … RETURNING, `{ error }` et le nombre de lignes, et sur 0 ligne une RELECTURE de sa ligne et de la mienne. Le
succès arrive après l'aller-retour : ne repeindre que ce qui montre encore ce groupe.

**Pièges du lot.**
- **pg_depend ne voit pas tous les appelants.** Une policy y figure ; une fonction plpgsql, ou SQL sans `BEGIN ATOMIC`, non :
  `storage_chemin_autorise` et `trg_reports_preuve_message` n'apparaissent qu'en cherchant `is_conv_member` dans le `prosrc`
  de TOUTES les fonctions de TOUS les schémas. Fermer un oracle, c'est faire les deux recherches, plus le dépôt.
- **Un DELETE dont le WHERE lit des colonnes applique AUSSI les policies SELECT.** Cacher une ligne à la lecture, c'est
  empêcher qu'on la retire : toute policy SELECT qui masque doit laisser voir à qui a le droit de supprimer.
- **Un retrait ne s'annonce qu'après la ligne rendue — et « 0 ligne » n'est pas « toujours membre ».** Le SDK ne lève pas sur
  un refus RLS, et un DELETE filtré rend 0 ligne SANS erreur : `.select("user_id")` sur le DELETE, compter `data`. Mais 0 ligne
  dit seulement que rien n'a été ôté ICI : le membre a pu partir de lui-même, être retiré ailleurs, ou n'avoir jamais été en
  base (ajout refusé — un personnage de démonstration ne l'est jamais). Relire avant de conclure, avec sa propre ligne pour
  témoin, et ne pas conclure là où la lecture elle-même est masquée (`evgrp_` avant la migration). Ne prendre le chemin serveur
  que pour ce que le serveur a pu avoir, et ne jamais « retirer localement » ce que le serveur garde (session expirée, SDK
  absent) : c'est le mensonge même qu'on corrige. La première version de ce correctif avait les deux défauts (retrait devenu
  impossible pour tout groupe dont un membre est un personnage, c'est-à-dire tout groupe créé par « Nouveau groupe »).
- **Un succès asynchrone ne repeint que ce qui montre ENCORE sa cible.** Le code d'avant était synchrone avec le clic ; attendre
  le serveur a fait tourner `_renderGroupMembersModal` (qui finit par `openModal`) et `renderConvFpThread` après l'aller-retour :
  la modale fermée revenait, et le fil du groupe s'affichait dans le panneau d'une autre conversation — dont le bouton d'envoi
  restait lié à l'autre destinataire. Gardes : `#modalBackdrop` actif ET `_grpConvId` ET `#grpPanel_members` ; `_openedConvId`.
- **Un verdict n'est fermé sur échec que si sa MESURE l'est aussi.** La première version prenait toute erreur levée sous
  authenticated, celle du correctif comprise, pour une « panne du décor » non bloquante : une branche créateur récursive (42P17)
  passait — mesuré, APPLIQUÉE, et plus aucun compte ne lisait conv_members. Désormais : un bloc par mesure (son SQLSTATE dans sa
  clé, sa ligne en ECHEC), `decor = ok`, la phase, et la ligne 1 BLOQUANTE (le canal ① ne mesure pas le comportement : un décor
  en panne fait relancer, jamais appliquer à l'aveugle).
- **Un verdict sans témoin négatif ne voit pas « tout le monde est membre de tout ».** Mesuré sur le verdict d'avant :
  `coalesce(_uid = auth.uid(), false) or (auth.uid() is null and exists…)` passait 15/15 ; de même un oracle laissé ouvert sur
  les 1-à-1 (aucune au décor) et une forme « claims seuls » qui n'était plus éprouvée (claim.sub jamais relevé). Il faut un compte
  qui n'est PAS membre, une conversation de chaque forme, et relever l'identité qu'on croit poser.
- **L'ordre des conjonctions est de l'hygiène, pas la fermeture d'un canal.** Le temps de lecture d'une ligne de conv_members sous
  RLS dit si elle existe (`texteq` leakproof : la policy ne s'évalue que si la ligne existe ; +41 µs au corps de production, +88 à
  +92 µs au corps neuf) : un canal caché de la RLS, antérieur au lot, qu'aucun ordre ne ferme. Le dire, ne pas le présenter
  comme corrigé.
- **Une migration « rejouable » peut défaire la suivante.** Rejouer `participants_visibilite` réécrirait
  conv_members_select_member avec le texte de C-04, et son verdict ne regarde la policy que par motifs LIKE : RV-44 reviendrait
  en silence. Après tout geste sur conv_members, mesurer le déparsage (md5 `ff0689d9…`).
- **Un décor de verdict qui écrit dans une table PUBLIÉE ne livre rien s'il est annulé.** `conv_members` exige des profils
  (clé étrangère), et `profiles` est publiée ; `trg_diffuser_ajout_membre` appelle `realtime.send`. Le décodage logique
  écarte une sous-transaction annulée : le banc le prouve sur un slot `test_decoding`, et un témoin positif (décor NON annulé)
  montre que le même slot décode bien ces insertions — sans témoin, un contrôle « 0 ligne décodée » serait aveugle.
- **Une fonction SECURITY INVOKER rappelée par la policy de la table qu'elle lit tourne sans fin** (54001) dès que l'appelant y
  a sa ligne : mesurée clé par clé, la mutation « invoker » rougit tout ce qui lit sa propre appartenance (3, 4, 6, 7, 8, 17),
  pas l'oracle sur autrui (l'appelant est contrôlé avant la lecture) ni le témoin négatif (sans ligne, la récursion s'arrête).
- **`pg_get_expr` ouvre la table qu'il déparse** (RV-20) : le verdict ne déparse que conv_members, reports et les policies que
  `pg_depend` rattache à la fonction, jamais tout le catalogue.
- **Une définition recopiée à la main n'est pas une définition de production.** Le relevé remis au lot avait perdu deux
  blocs de commentaires et une espace de fin : `md5(prosrc)` l'a dit au banc ⓪, `to_json(prosrc)` au canal ① a montré
  l'écart. Le socle se contrôle par empreinte, fonction par fonction et policy par policy.
- **Le canal ① ne mesure pas le comportement d'une fonction réservée à `authenticated`** : le lecteur n'a ni EXECUTE ni SET
  ROLE. Seul le verdict, dans la transaction de la migration, la mesure en production ; après coup, le catalogue.

**Réinjections (mesurées le 06/11).**
- **Migration, banc § ⑨, sur le fichier corrigé — toutes REFUSÉES (55000), base inchangée** : clause `_uid` retirée → lignes
  2, 4 (2, 4, 11 sans empreinte recalculée) ; branche créateur retirée → 6, 7 (6, 7, 13) ; branche créateur RÉCURSIVE (R3) →
  6, 7, 8, 16, 17 ; EXECUTE rendu à anon ou à PUBLIC → 12 ; « sans session » fermée → 5 ; SECURITY INVOKER → 3, 4, 6, 7, 8,
  11, 17 ; policy TO public → 13 ; décor non annulé → 9 ; décor cassé → 1 à 8, 16, 17 ; décor hors rôle client → 1, 8, 16,
  17 ; « tout connecté membre de tout » → 16, 17 ; forme claims seuls non éprouvée → 1 ; oracle ouvert sur les 1-à-1 → 2 ; et
  dix dérives de la base (D1 à D10). L'ordre d'AVANT, empreinte recalculée, passe le verdict 17/0 : seul le compteur du banc
  le voit (100 lectures de conv_members au lieu de 0).
- **Contre le verdict d'AVANT la revue (15 lignes)** : « tout connecté membre de tout », claims seuls non éprouvés et oracle
  ouvert sur les 1-à-1 passaient 15/0 ; R3 était APPLIQUÉE (vecteur EEEEOEEEOOOOOOO, ligne 1 « ECHEC — 42P17 », non bloquante).
- **Dans le fichier corrigé** : l'ordre d'avant réinjecté rougit les deux comptages de lectures du § ③ (0 → 100 ; 0|0 →
  100|50) et rien d'autre ; le garde-fou d'avant (ligne 1 jamais bloquante, comportement bloquant seulement si la ligne 1 est
  OK) réinjecté rend APPLIQUÉES les mutations « décor cassé », « décor hors rôle client » et « claims non éprouvés » (et D10 ne
  rougit plus que 13) — R3 reste refusée, par ses blocs de mesure.
- **Client** (`tests/e2e/retrait-membre-groupe.spec.js`, 18 cas ; chaque variante d'app-05 servie par `page.route`, le
  worktree intact) : code d'avant le lot → 16 rouges (tous sauf ⑫ ⑬ : il était synchrone, l'écran ne pouvait pas dériver) ;
  première version du correctif → 15 rouges (verts : ②, ④, ⑥) ; gardes d'écran ôtées → ⑫ ⑬ ; panne postgrest-js lue comme un
  refus → ③bis ; gardes « personnage » et « ébauche » ôtées → ⑧ ⑨ ; garde du compte réel ôtée → ⑦ ; garde de session ôtée →
  ⑩ ; relecture ôtée → ② ②b ⑤ ; garde `evgrp_` ôtée → ②c ; garde du SDK absent ôtée (retrait local) → ⑪ ; le code du lot,
  servi de la même façon → 0 rouge. Contre-revue du soir (24 cas) : tête d'avant (`7320926a`) → ③ter ③quater ⑪ ⑭ ⑮ rouges,
  quatre cas neufs et ⑪ dont seul l'attendu a changé ; une mutation à la fois — 5xx lu comme un refus → ③ter, 401 → ③quater,
  garde SDK de `supaCreateGroup` ôtée → ⑭, onglet non restauré → ⑮ ; puis la relecture de ce correctif → `6bdf1ff6` →
  ②f (session morte, DELETE parti sous la clé anon : 200 [] puis relecture vide) ③quinquies (429) ⑮ renforcé (filtre de la
  liste rendu, focus non volé, défilement gardé) rouges, verts ensuite.

**Ce qui reste, dit tel quel.** Dans `conv_members`, les membres d'une discussion se voient entre eux, sauf blocage (C-04 : un
venant connaît la liste) ; HORS de conv_members, une discussion d'activité montre encore à tout membre les membres bloqués avec
lui — `conv_reads` (reads_select : is_conv_member seul), les pièces jointes (chemin `attachments/<conversation>/<fichier>`, sans
l'auteur, mais listables et lisibles, contenu et nom d'origine compris) et la diffusion `typing:` (le nom d'affichage) : résidu
de C-04, préexistant, hors lot (RV-49, R42 ; un remède des pièces jointes se cale sur `owner`, jamais sur le chemin). Le créateur d'une discussion d'activité qui n'organise plus
(co-organisateur retiré) peut y revenir à tout moment, y voir tous les membres, bloqués compris, et en ajouter (RV-50 : une
branche qui suit l'organisation, `is_conversation_creator(conv_id) and organise_activite(substr(conv_id, 7))`, écartée ici — son
verdict devrait écrire une activité synthétique en production). Le temps de lecture sous RLS (ci-dessus). `notifier_mentions`
dira l'appartenance d'autrui à un ancien membre dès que R36 sera corrigé (RV-51 : exiger `is_conv_member(p_ref_id, moi)` — qui ferme à
lui seul le cas — et, par hygiène, figer `created_at` par `identifiants_figes` : un REVOKE UPDATE (created_at) ne fige rien,
authenticated a l'UPDATE de la table). Un rôle `authenticated` sans `sub` (Supabase Auth n'en émet pas) lirait encore toute appartenance par la
RPC. `conv_1a1_bloquee` dit si un compte BLOQUÉ avec l'appelant est membre d'une conversation 1-à-1 donnée (identifiant
aléatoire), `is_blocked_with` reste interrogeable sur tout uid (R40) : hors lot. Côté client : dans une discussion d'activité,
le retrait d'un membre qui n'y est pas (la liste locale vient des inscrits, `_ensureLocalEventConv`) dit « pas confirmé »
jusqu'au prochain rafraîchissement serveur, qui l'ôte ; `addGroupMember` ignore toujours le résultat de son INSERT
(préexistant, hors lot).

**Appliquer depuis un worktree détaché, JAMAIS depuis le dossier de travail (06/11, vécu).** Le premier bloc de C-02 (comme
celui de C-04 le matin) faisait `git checkout main` puis `git pull --ff-only` DANS `Desktop\PASSIO` — que la procédure de
`.passio/migrations/README.md` évite déjà. Ce dossier portait le travail non commité d'une autre session (sa branche, deux
migrations ajoutées, `dashboard/`, `js/`, fonctions Edge) : le `checkout` l'a fait passer sur `main` (git garde les
modifications non commitées, mais la session ne se trouve plus sur sa branche), et le `pull` a refusé d'écraser dix fichiers.
Rien n'est parti ; le second bloc a d'abord RENDU le dossier (retour sur la branche, `attestations.json` remis depuis sa copie),
puis attesté et appliqué dans `Desktop\PASSIO-wt\migration-c02` (worktree détaché d'`origin/main`), imprimé l'entrée
d'attestation par `git diff`, et retiré le worktree. Un bloc d'application ne fait aucun `checkout`, aucun `pull`, aucun
`git checkout -- <fichier>` dans le dossier de travail : il peut y avoir quelqu'un.

**Ordre.** APRÈS C-04 (la ligne 10 refuse une base sans sa policy : le staging aujourd'hui — y appliquer C-04 d'abord, puis ce
lot), et JAMAIS C-04 rejouée après ; indépendante du client, pas de `PREREQUIS-CLIENT` — le client ne dit que ce que le serveur
lui rend : avant la migration, un créateur qui retire un membre que C-04 lui cache lit « le retrait n'a pas été confirmé » ;
après, le retrait passe.

**Contre-revue de la tête, le soir (06/11).** Quatre agents relecteurs Claude Code, lancés sans les conclusions de la session
qui a orchestré le lot (la migration en production ; la complétude des contrôles d'accès ; le client ; l'exactitude de ce qui
est écrit), deux sceptiques par trouvaille grave : rien de bloquant — la seule trouvaille « majeure » (l'ancien venant) ramenée
à mineure par ses deux sceptiques, préexistante et déjà au registre (R18). Ce qu'il faut en retenir :
- **`lock_timeout` borne CHAQUE attente, pas la détention.** Une fois l'ACCESS EXCLUSIVE pris, toute attente qui suit le
  prolonge — et une fonction qui AVALE les erreurs (`realtime.send`, `exception when others`) avale aussi 55P03 : sept
  attentes de 3 s, 27 s de messagerie gelée, mesurées quand une autre session tenait `realtime.messages`. D'où deux bornes :
  3 s pour PRENDRE le verrou, puis `set local lock_timeout = '200ms'` juste après (banc § ⑩ : abandon en moins de 5 s, rien
  d'appliqué ; seconde borne ôtée → plus de 9 s).
- **Le rechargement du cache de PostgREST attend la migration, pas l'inverse** (RV-42 relu) : le 05/11, c'est un lecteur de
  `passion_requests` qui a attendu 3,4 s le verrou de R38 ; le 06/11, C-04 a pris ses verrous la première. Qui peut faire
  attendre une migration, c'est une transaction cliente longue.
- **Un verdict qui compte les appelants d'une fonction compte TOUS ses dépendants** (`pg_depend`, `refobjid` = la fonction) :
  une vue, ou une fonction SQL `BEGIN ATOMIC` — dont le `prosrc` est VIDE, le corps vivant dans `prosqlbody` —, échappent à
  la fois à la recherche dans `prosrc` et à la liste des policies (dérives D11, D12).
- **Un client de repli qui « accepte » tout fabrique des identifiants serveur fantômes** : sans SDK, `supaCreateGroup`
  rendait `{ error: null }` et donc un `grp_…` qu'aucun retrait ne pouvait plus vider. Sans SDK, ne RIEN créer « côté
  serveur » : l'ébauche garde son préfixe local (`conv_grp_`).
- **Deux défauts préexistants, consignés** : tout compte peut prendre `evgrp_<activité>` avant l'organisateur et rendre la
  discussion impossible (RV-52 ; `conversations_insert_creator` ne lit que `created_by`) ; un ancien venant ou co-organisateur
  reste membre et lit les venants suivants, et côté client la sortie de discussion n'est pas vérifiée (R18, RV-53).
- **Pour mener une contre-revue par agents** : une commande qui exige une autorisation (création d'utilisateur, `su`) BLOQUE
  un agent non interactif indéfiniment, et un audit de droits trop « offensif » dans sa formulation peut être arrêté par les
  garde-fous de l'API ; borner les commandes (scripts, jamais de privilèges en ligne) et formuler l'audit en défensif.
