# Nuit du 2026-08-29 au 2026-08-30 — audit de sécurité, correctifs, et une collision entre deux sessions

> Règle de ce document : **rien d'affirmé sans preuve exécutée**. Ce qui n'a pas
> pu être mesuré porte `NON MESURÉ` et sa raison.
>
> Session autonome (Benjamin dormait, aucune interaction possible). Une **seconde
> session Claude Code travaillait en parallèle** sur le même dépôt — c'est le
> fait le plus structurant de la nuit, voir §4.

## 1. Ce qui a été cherché

Un audit en **9 dimensions**, lancé en parallèle par agents en lecture seule, puis
une **vérification adversariale à 3 lentilles** par finding (réalité du code,
reproductibilité par un geste utilisateur, existence d'une garde ailleurs), avec
consigne de REFUTER par défaut.

- 69 agents, 0 erreur, ~2 h de calcul.
- **56 findings bruts** → 20 vérifiés (budget) → **13 confirmés, 7 réfutés**.
- 36 findings de moindre gravité n'ont pas été vérifiés faute de budget : ils sont
  listés en §5, non traités, et ne doivent pas être pris pour des défauts établis.

La vérification adversariale a fait son travail dans les deux sens : elle a
**réfuté** sept findings plausibles (dont « `deletePost` ne vérifie pas la
suppression serveur », faux : le chemin est couvert ailleurs), et elle a
**enrichi** un finding confirmé — c'est elle qui a signalé que neutraliser une
charge à l'affichage ne l'empêche pas de rester stockée dans IndexedDB.

## 2. Ce qui a été corrigé, et comment c'est prouvé

Chaque lot suit la même discipline : correctif → test → **réinjection du défaut**
(le test doit rougir) → PR → CI complète → fusion.

| Défaut | Gravité | Preuve |
|---|---|---|
| **Deux XSS stockées** : texte d'une notification distante, et clé d'une réaction de message — toutes deux insérables par n'importe quel compte authentifié | P0 | 6 tests à preuve ACTIVE (la charge appelle `window.__pwn()`, le DOM est secoué) ; 3 mutations, 3 rouges |
| **`href` acceptant `javascript:`** dans un message « 📍 position » (`escapeHtml` ferme l'attribut, pas le schéma) | P1 | idem |
| **Carnet « Privé » visible dans le fil de tout le monde** et ouvrable entièrement | P0 | 5 tests ; 2 mutations → 4 rouges |
| **Clé de réaction non filtrée à l'entrée** : la charge restait dans localStorage et IndexedDB, rejouée à chaque démarrage | P1 | 4 tests ; 1 mutation → 2 rouges |
| **Deux identifiants bruts dans un `onclick`** (pastille de réactions d'un post, d'un live) | P1 | 3 tests ; 2 mutations ciblées → 1 rouge chacune |
| **Inbox Messages qui se repeignait en boucle** | P1 | **mesuré : 1 047 mutations DOM en 1,5 s ; 0 après** |
| **Média/vocal perdu en silence** quand l'écriture Supabase échoue | P1 | 3 tests ; 1 mutation → 1 rouge |
| **Aucun indicateur de message non lu dans l'application**, et Messages inatteignable sous kill switch | P1 | 6 tests ; 2 mutations → 4 puis 1 rouge |
| **Recherche de comptes sans limite ni garde d'obsolescence** | P2 | 2 tests ; 2 mutations → 1 rouge chacune |

## 3. Deux de mes propres tests passaient pour la mauvaise raison

Trouvé par la réinjection, pas par la relecture — et c'est la partie la plus
instructive de la nuit :

1. **Une charge XSS qui ne s'exécutait pas.** En sortant de l'attribut, elle
   fabriquait `onmouseover="window.__pwn()', event);"` : une **erreur de syntaxe**,
   que le navigateur avale en silence. Le test passait donc *sans* échappement.
   Un `//` final rend le reste inerte et la charge réellement exécutable.
2. **Un test sans décor.** `_liveReactItems` ne trouvait pas le live, rendait une
   liste vide, et la pastille n'était jamais construite. Le test restait vert en
   retirant l'échappement.

Les deux appartiennent à la famille que l'audit signale par ailleurs dans
`echappement.spec.js`. Les avoir trouvés dans mes propres tests donne du crédit à
ce signalement — et une règle : **un test de sécurité qui n'a pas été vu rougir
n'est pas un test de sécurité.**

## 4. L'incident : deux sessions, le même défaut, deux correctifs corrects, une CI rouge

**`main` est resté rouge de 23:00 (fusion de #200) à 00:0x (fusion de #209).**
Aucun déploiement production pendant ce temps, et **six PR de la nuit ont été
bloquées en cascade** — #204 à #208 échouaient toutes sur exactement les deux
mêmes tests (`xss-notifs-messages.spec.js:45` et `:69`), non parce qu'elles
étaient fautives, mais parce que la CI d'une PR teste la **fusion** de sa branche
avec la base : une base rouge rend rouge tout ce qui s'y greffe.

Les deux sessions ont trouvé la **même XSS de notification** le même soir et l'ont
fermée **au même moment, à deux bouts différents de la chaîne** :

- l'une neutralise les chevrons **à l'entrée** (`mergeSupaNotifs`) ;
- l'autre pose **au rendu** un modèle de confiance explicite (`html: true` /
  `kind === "local"`, tout le reste échappé).

Chaque PR était verte séparément : **elles ne se voyaient pas**. Fusionnées, elles
se cumulent — et le double échappement affichait `Ben&#39;j` au lieu de `Ben'j`
dans les notifications, une régression visible pour tout pseudo avec apostrophe.

Ce qu'il faut en retenir, et qui n'est pas « quelqu'un a mal travaillé » :

- **deux correctifs corrects sur la même ligne ne font pas un correctif correct** ;
- la CI d'une PR ne teste pas la fusion, elle teste la branche ;
- `npm run sessions` existe précisément pour déclarer un périmètre de fichiers, et
  **aucune des deux sessions ne l'a utilisé cette nuit**.

La réconciliation garde le modèle de confiance de l'autre session — il est meilleur
que le mien, son défaut est le REFUS — et ne change que le désinfectant appliqué au
texte non fiable, pour qu'il soit **idempotent** avec la neutralisation d'entrée.

## 5. Ce qui n'a PAS été fait, et pourquoi

- **`PASSIO_E2E_MULTI=1`, RLS prod, vérification du site en ligne** : `NON MESURÉ`.
  Le proxy réseau de cet environnement refuse `njkiyoklssvefstljemx.supabase.co`
  **et** `passio-app.netlify.app`. Ni vert ni rouge : non lancé. La CI reste donc
  la seule autorité sur la suite complète.
- **Migration RLS pour la visibilité des carnets** : le correctif livré est un
  filet **client**. La vraie fermeture demande une colonne réelle et une policy.
  Non écrite : la prod est injoignable d'ici (impossible de lire le schéma réel),
  et la règle de la nuit interdit d'appliquer une migration sans supervision.
- **`NOTIF-FORGE-009`** (n'importe quel compte peut insérer une notification au nom
  d'un autre) : migration prête, toujours **non appliquée**. Les correctifs de
  cette nuit ferment l'affichage, pas l'écriture.
- **36 findings de moindre gravité** non vérifiés faute de budget — ils sont dans
  le résultat brut de l'audit, à traiter avec la même discipline (vérifier avant
  de corriger). Les plus prometteurs : stories qui échappent au filtre de blocage,
  liens `#irl-event-` et `#irl-checkin-` sondés une seule fois à 1 200 ms sur un
  `state` encore `null`, quatre tests soupçonnés creux, base64 déposé sur `window`
  et jamais libéré.

## 6. Ce qui attend une décision de Benjamin

- **PR « CI Node 24 »** — GitHub retire Node 20 des runners le **23 septembre 2026** ;
  passé cette date, `actions/checkout@v4` et `setup-node@v4` ne démarrent plus et
  **toute la chaîne s'arrête** (gouvernance, tests, build, déploiement, rollback,
  Sentinelle). Le correctif est prêt et minimal (v4 → v5). Il touche `.github/`,
  donc la garde « Gouvernance critique » **exige une contre-revue humaine ancrée
  sur le SHA** : elle a refusé la PR, ce qui est le comportement voulu. Je ne l'ai
  pas contournée.


## 7. Seconde passe adversariale — ce qui reste, avec sa mutation

Les 36 findings non vérifiés de §5 ont été repris par une seconde passe : **5 pistes
d'enquête, 20 findings, 60 verdicts** (trois lentilles par finding — réalité du code,
reproductibilité par un geste, existence d'une garde ailleurs — avec consigne de
**réfuter** par défaut). 65 agents, 0 erreur, 18 réfutations.

Quatre ont été corrigés cette nuit et sont en PR : le rail de stories qui ignorait le
blocage, la fuite de Blob des bobines, et trois assertions de test inatteignables.

**Le reste est confirmé mais NON TRAITÉ.** Il est listé ici avec assez de précision pour
être repris sans refaire l'enquête. Ce sont des findings **vérifiés**, pas des soupçons —
mais aucun n'a été reproduit dans un navigateur par moi, et c'est la règle de la maison :
*avant de corriger, mesurer*.

### 7.1 Écritures Supabase qui ne s'écrivent pas — demandent une MIGRATION

Ces trois-là ont un point commun : **une policy manque en base**. Le correctif client seul
ne suffirait pas, et la règle de la nuit interdit d'appliquer une migration sans
supervision. Ils sont donc préparés, pas appliqués.

| Défaut | Où | Ce qui manque |
|---|---|---|
| **Modifier un commentaire d'activité IRL ou de live CDV n'écrit RIEN** (P1) | `js/app-04-comments-shop.js:1475` | Deux verrous indépendants : `_supaUpdateCommentRow` écrit `content` sur les trois tables, or seule `post_comments` a cette colonne — `event_comments` et `cdv_live_comments` portent `text` (→ 400 PGRST204) ; **et** aucune policy UPDATE n'existe sur ces deux tables. Même avec la bonne colonne, l'UPDATE serait filtré à 0 ligne. Aucun `{ error }` n'est lu : le texte d'origine revient au rechargement. |
| **Supprimer le commentaire d'une étape ne touche jamais `step_interactions`** (P1) | `js/app-04-comments-shop.js:1422` | `_supaDeleteCommentRow` choisit sa table sur le seul **préfixe** de l'id (`ec_`, `lc_`, sinon `post_comments`). Or les commentaires d'étape portent `c_…` et vivent dans `step_interactions`, jamais citée. La suppression part sur la mauvaise table → 0 ligne, `{ error: null }`. Et l'hydratation est une UNION qui ne supprime jamais : le commentaire revient à la réouverture. Router sur le **kind** du fil, pas sur le préfixe. |
| **La description d'un groupe est écrite dans une table sans policy UPDATE** (P2) | `js/app-05-config-profil.js:1584` | `public.conversations` n'a que des policies INSERT et SELECT. Et le résultat est jeté par un `.then(function(){}, function(){})` qui avale aussi bien l'erreur que le succès à 0 ligne. Second défaut cumulé, indépendant : `supaLoadMyConversations` ne recopie jamais `c.description`, donc la valeur serait perdue au boot **même si** l'écriture passait. |

### 7.2 Un id local qui n'est jamais remplacé par l'id serveur

**Supprimer un commentaire de live CDV qu'on vient de poster ne supprime rien** (P2,
`js/app-03-posts-vlogs.js:3616`). `addCdvLiveComment` crée l'optimiste avec
`"lc_local_" + Date.now()`, tandis que `supaAddCdvLiveComment` génère de son côté
`"lc_" + uid()` et **ne le renvoie pas**. La suppression part donc sur un id fictif.

C'est un écart avec le chemin des activités, qui fait la chose juste :
`addEventComment` corrige l'id (`optimistic.id = realId`). Correctif sans migration —
faire renvoyer son id par `supaAddCdvLiveComment`, comme le fait déjà l'autre chemin.

### 7.3 Deux liens profonds encore dans l'état que cette nuit a corrigé ailleurs

Même famille exactement que `#reel=`, `#irl-event-` et `#irl-checkin-`, et **non traitée** :

- **`?call=<id>`** (P1, `js/app-05-config-profil.js:1161`) — le repli à 10 s appelle
  `handlePushIncomingCall` sans aucune garde de préparation. La chaîne descend jusqu'à
  `isBlocked(payload.from)`, qui fait `state.user.blocked` : sur `state === null`, c'est un
  TypeError, venu d'un `setInterval`, **non rattrapé**. Et l'URL a déjà été effacée.
- **`?live=<id>`** (P1, `js/app-05-config-profil.js:1172`) — le paramètre est supprimé
  **avant** toute tentative, et par `location.pathname` seul, ce qui emporte aussi le reste
  de la query et le fragment. Puis la reprise abandonne **en silence** à 10 s : ni toast,
  ni journal.

Dans les deux cas le budget d'attente (40 × 250 ms) est calculé sur une hypothèse fausse :
`ensureSupabase()` télécharge le SDK depuis un CDN **sans délai maximal ni repli**. Sur un
réseau mobile froid, 10 s ne suffisent pas.

Le correctif est déjà écrit ailleurs et n'a qu'à être transposé : `_reelLinkAppPrete`
(app-06) et `_irlLienAppPrete` (app-07).

### 7.4 Quatre tests encore soupçonnés creux

`profils-types.spec.js:191` et `:208`, `cadrage.spec.js:68`,
`profil-badges-visibles.spec.js:87`. Chacun vient avec sa mutation nommée. **Je ne les ai
pas vérifiés** — et les rapporter comme établis serait reproduire exactement l'erreur que
la PR #216 corrige. À reprendre avec la même discipline : appliquer la mutation, constater
le vert, puis réparer.

⚠️ Fait à connaître : `npm run audit:tests` reste **vert** sur les quatre. Cet audit
détecte les specs qui ne vérifient *que* leurs propres constructions, pas une assertion
isolée inatteignable au milieu d'un test par ailleurs solide. Sa portée mérite d'être
élargie.

### 7.5 Une rétention mémoire, volontairement laissée

`meClose()` ne remet pas `meState.media` à `null` : le base64 de la dernière bobine
publiée reste retenu jusqu'à la réouverture de l'éditeur (P3,
`js/app-08-ui-modals-tour.js:613`). C'est une **rétention**, pas une accumulation —
`meOpen()` réaffecte `meState` en entier, donc il n'y a jamais qu'une copie à la fois.

Non traité parce que le corriger demande de vérifier que rien ne lit `meState.media` après
fermeture (la publication est asynchrone), et cette vérification n'a pas été faite.
