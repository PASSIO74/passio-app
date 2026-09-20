# Capacité, troisième volet : le référentiel était chargé par la CI, et le banc ne mesurait pas ce qu'il croyait

*2026-09-20, suite directe de `docs/CAPACITE_AMPLIFICATION_2026-09-20.md`.*

Mesures prises au canal ① d'ADR-012 (`extensions.pg_stat_statements`, lecture seule),
cumul depuis le dernier `stats_reset` — **129 jours**, dix comptes réels en production.

---

## 1. Le tableau qui recadre tout

Première lecture du CPU de la base avec le **bon dénominateur** (une première requête
calculait les parts sur le seul sous-ensemble « passions » et rendait 69 % là où il y a 5,9 % —
noté ici parce que l'erreur est facile et qu'elle inverse une priorité).

| Requête | Appels | CPU (s) | Moyenne | % du CPU total |
|---|---:|---:|---:|---:|
| Décodage WAL (Realtime) | 6 839 636 | 48 763 | 7,13 ms | **66,04 %** |
| `SELECT … telemetry_events` (pilotage) | 97 659 | 4 934 | 50,52 ms | **6,68 %** |
| `SELECT id FROM passions WHERE status` | 2 900 511 | 4 368 | 1,51 ms | **5,92 %** |
| Décodage WAL (2ᵉ forme) | 354 568 | 2 096 | 5,91 ms | 2,84 % |
| `rechercher_passions` | 18 401 | 1 687 | 91,70 ms | 2,29 % |
| `SELECT name FROM pg_timezone_names` | 2 098 | 1 479 | **704,85 ms** | 2,00 % |
| `SELECT id FROM telemetry_events` | 5 158 | 1 002 | 194,33 ms | 1,36 % |
| `comment_interactions` (filet du fil) | 233 272 | 922 | 3,95 ms | 1,25 % |
| `post_comments` (filet du fil) | 239 021 | 696 | 2,91 ms | 0,94 % |
| `post_likes` (filet du fil) | 242 888 | 673 | 2,77 ms | 0,91 % |

---

## 2. Le référentiel des passions : 5,92 % du CPU, et **aucun utilisateur derrière**

`chargerReferentielPassions` (app-02) pagine par 1 000. Avec 5 001 passions actives,
c'est **six requêtes par démarrage de page**.

Le calcul se prend **sans jamais compter les tests**, et c'est ce qui le rend solide :

- 2 900 511 appels / 6 par démarrage = **~483 000 démarrages de page** ;
- sur 129 jours, **~3 750 démarrages par jour** ;
- la production porte **DIX comptes**. Même à dix sessions par jour chacun, cela ferait
  100 démarrages, soit **2,6 % du total**. Les 97 % restants ne sont pas des utilisateurs.

**Le contre-témoin ferme le doute, et il est indépendant.** La variante *sans* le filtre
`status` — le client d'avant le 2026-09-09, donc vivant pendant ~11 jours — porte
**141 520 appels**, soit **~23 600 démarrages ≈ 2 100 par jour**. Même ordre de grandeur que les
3 750, sur une fenêtre calculée autrement : les deux chiffres se corroborent.

⚠️ **Le comptage textuel de la suite (716 occurrences de `page.goto` / `bootOnboarded` /
`bootVisiteur` / `bootLegacy`) est une CORROBORATION, pas la mesure** — il sous-estime, puisqu'un
boot posé dans un `beforeEach` sert autant de cas qu'il y en a dans le fichier. Il donne
~4 300 appels par run complet, donc quelques centaines de runs sur la période : cohérent avec la
cadence du dépôt, mais ce n'est pas sur lui que repose le constat.

S'y ajoute l'egress : **~140 ko d'identifiants par démarrage**, soit **~100 Mo par run complet**,
que nul test ne lit jamais.

C'est la famille de l'avatar de 2,59 Mo demandé 399 fois (2026-09-10) : **un coût de production
payé par les tests, par un chemin que personne ne regarde.** `passions` n'était pas dans
`TABLES_DISTANTES`, et personne n'avait de raison de l'y chercher.

### Le correctif, et pourquoi ce n'est pas `[]`

`sansDonneesDistantes` sert désormais `data/passions-v1.json`. Ce n'est pas une imitation :
c'est le **miroir généré** de cette table, depuis la même source `data/passions/*.js` que
`migration_passions_plat.sql`, égalité tenue par la gate `npm run passions:verifier`.

Répondre `[]` aurait laissé `_referentielPassions` à `null`, donc `estPassionCanonique` au
plancher des 19 passions du socle. Deux conséquences, et la seconde est la pire :
une suite qui publie sous une passion du référentiel rougirait pour une raison étrangère à son
sujet — et une suite qui passerait quand même **cesserait d'exercer la liste blanche sans que
rien ne le dise**.

**Divergence assumée et écrite** : les passions créées depuis l'application
(`source = 'user_suggested'`, 6 en production) vivent en base et pas dans le miroir. Aucun test
ne peut donc s'appuyer sur elles — ce qui est la bonne règle de toute façon.

---

## 3. ⚠️ Le défaut que mon propre correctif a introduit, et que huit verrous verts n'ont pas vu

La première version de la route ne lisait que l'en-tête `Range`. Or **`postgrest-js` 2.116
traduit `.range(a, b)` en paramètres d'URL `offset`/`limit`**, jamais en en-tête — lu dans
`js/vendor/supabase-js-2.116.0.js`, et confirmé par le SQL enregistré en production
(`LIMIT $1 OFFSET $2`).

Conséquence : chaque page revenait **pleine** (5 001 lignes). Le chargeur redemande tant qu'une
page est pleine : il partait pour ses **quarante** pages (`PAGES_MAX`), journalisait
« référentiel TRONQUÉ » et ne posait **jamais** `complet` — donc rechargeait à chaque appel.
**Un correctif de charge qui multipliait la charge par sept.**

⚠️ **Et les huit verrous écrits pour ce lot étaient VERTS dessus.** Ils interrogeaient la route
avec leur propre `fetch` et leurs propres en-têtes : ils mesuraient le faux serveur, pas le
produit. Le neuvième cas — celui qui laisse `chargerReferentielPassions` faire sa pagination
réelle et compte ce qui part — l'a trouvé en une exécution.

**Règle à retenir : un banc qui pose lui-même la requête ne mesure pas le client qui la pose.**
C'est la faute `_notifierMessage` (12 verrous verts sur une fonction morte) sous un autre angle.

Mesuré après correctif : **6 requêtes par démarrage, `complet: true`, 5 001 identifiants,
zéro octet de production.**

---

## 4. Le banc de charge ne mesurait pas la seule forme quadratique du produit

`scripts/charge.mjs` s'abonnait à **une** liaison `postgres_changes`, **filtrée**
(`author_id=eq.<son propre uid>`). L'application (`_creerCanalDb`, app-08) en pose **douze** en
configuration par défaut, dont **dix sans filtre**.

⚠️ **Le premier jet de ce lot écrivait « treize / onze », et c'était faux** — relevé par
`audit-passio`. app-08 porte bien une treizième ligne `.on(...)` sur `conv_messages` (6267), mais
elle est conditionnée à `!PASSIO_REALTIME_V3 && !…_V2`, et `PASSIO_REALTIME_V3` vaut `true` par
défaut (app-08:5957). **Aucun client réel ne la pose.** L'y recopier faisait abonner le banc *sans
filtre* à la table la plus écrite du produit, sur un chemin que personne n'emprunte : le banc aurait
rendu un chiffre de capacité **trop bas**, et son commentaire « recopiées d'app-08 » aurait été lu
comme une vérité. **Compter les `.on(` d'un fichier n'est pas compter ce que l'application
exécute** — et `audit:realtime`, qui est un grep, ne voit pas cette condition non plus.

Or un filtre de colonne est tranché **avant** de toucher la base. Le banc faisait donc évaluer
quasiment rien, là où le temps réel est **66 % du CPU** et porte un facteur d'amplification
mesuré à **×13**. Il mesurait la latence de livraison d'un client gratuit — et on en tirait un
chiffre de capacité.

Le banc pose désormais les treize liaisons de l'app. La corrélation des événements est bornée à
la table `posts` : depuis que le canal porte aussi `conv_messages`, `post_comments`,
`video_lives`…, verser toutes les lignes au corrélateur lui ferait compter des « arrivées
précoces » étrangères à la publication mesurée.

**Et la recherche n'exerçait que le cas favorable.** Le banc interrogeait le RPC avec
« rando » — cinq lettres, donc 0,4 à 2,9 ms. La recherche est pourtant la requête la plus lente
du produit (91,7 ms de moyenne) et tout son coût est dans les frappes courtes. Il exerce
désormais **trois lettres**, le pire cas que le plancher `LONGUEUR_MIN_SERVEUR` permet encore ;
descendre à une ou deux mesurerait une charge que plus aucun client n'émet.

---

## 5. La gate realtime ne lisait qu'une table par bloc

`audit-realtime-publication.js` repart de chaque occurrence du marqueur et lisait **le premier**
nom de table de la fenêtre. Une jonction WebSocket brute passe ses liaisons en bloc : un
marqueur, treize liaisons. **Douze sur treize étaient donc hors garde**, et la gate annonçait
« 16 souscriptions scannées » pour un dépôt qui en porte 28.

Elle lit désormais le bloc entier entre crochets — et **seulement cette forme** : élargir la
fenêtre du cas normal ferait déborder sur le corps du callback suivant, où un `table:` désigne
parfois une table REST (app-04 en a un).

⚠️ **Le commentaire qui explique la règle déclenche la règle.** Mon premier jet documentait la
contrainte en citant l'exemple que la gate cherche : elle a refusé le fichier en se citant
elle-même. C'est le piège que la gate avait déjà dû fermer **sur elle-même** le 2026-09-19,
rejoué dans un autre fichier.

⚠️ **Le nom de la variable porte le marqueur.** Renommer le tableau des liaisons rendrait les
douze invisibles à la gate, sans une erreur.

⚠️ **Et le compte porte un FANTÔME.** `js/app-08-ui-modals-tour.js:6264` est un *commentaire* qui
contient le marqueur ; sa fenêtre de 400 caractères attrape la table de la ligne 6267. Le dépôt
porte donc **27** souscriptions réelles pour 28 comptées. Le verrou chiffré est calé à **27** :
reformuler ce commentaire ne doit pas le faire rougir — *un verrou qui rougit sur un innocent finit
par être désarmé* — et 27 reste rouge sur la vraie régression (branche « bloc » cassée → ~17).

---

## 6. Ce qui n'est PAS fermé, et qui est nommé

- **Le pilotage est le deuxième consommateur de la base : 8,66 % du CPU** en lectures
  `telemetry_events` (6,68 + 1,36 + 0,62). C'est du `service_role` depuis `dashboard/`, pas des
  utilisateurs — et à ne pas confondre avec l'ÉCRITURE de télémétrie (0,66 %), le chemin client.
  **Non traité ici délibérément** : c'est un autre lot, avec ses propres tests
  (`cd dashboard && npm test`), et le mêler à une PR qui porte déjà l'isolation des tests, le banc
  de charge et une gate rendrait la contre-revue plus difficile pour rien. Les deux cibles sont
  mesurées et nommées pour que le prochain pas soit direct :

  | Requête | Appels | ms moy | % CPU | Où |
  |---|---:|---:|---:|---|
  | `select user_id, received_at … received_at > $1 and user_id is not null and env = $2` | 97 666 | 50,5 | 6,68 % | `dashboard/server/kpi.js:87`, `retention.js:102` |
  | `select id … limit/offset` **avec `count = exact`** | 5 159 | 194,4 | 1,36 % | `observation.js:92` (et `dbwatch.js:22`, `reconcile.js:70`, `exploitation.js:39`) |

  ⚠️ **La seconde est la plus facile et la plus chère à l'unité : `count: "exact"` fait compter
  TOUTE la table à chaque appel** (PostgREST émet un `count(*)` sur un `pgrst_source_count`
  non borné) — 194 ms pour savoir combien de lignes existent. `planned` ou `estimated` rend la
  même information utile pour une jauge de supervision, en temps constant. ⚠️ À vérifier au cas
  par cas : `reconcile.js` et `exploitation.js` comparent peut-être des comptes EXACTS, auquel cas
  l'estimation y serait fausse — c'est `observation.js` (une sonde de vivacité qui `limit(1)`)
  qui n'a aucune raison de compter la table.
  ⚠️ **La première est appelée toutes les ~2 minutes** (97 666 appels / 129 jours) et balaie une
  fenêtre glissante : avant d'y toucher, mesurer si un index `(env, received_at) where user_id is
  not null` existe — 50 ms sur une table de ce volume ressemble à un balayage.
- **`SELECT name FROM pg_timezone_names` : 704 ms de moyenne, 2 % du CPU** pour 2 098 appels
  (~16 par jour). Ce n'est pas du code PASSIO — c'est un rechargement de cache de schéma
  PostgREST / tableau de bord. Nommé pour que personne ne reparte l'enquête.
- Les **onze souscriptions sans filtre** du canal restent sans filtre : s'abonner à ce qui est
  VISIBLE est un changement d'architecture, pas un réglage (déjà écrit le 19/09).
- Le **forfait Supabase n'a toujours pas été LU** dans la facturation.

## 7. Ce qui a été cherché et n'a rien donné

- **Aucune troisième lecture REST de `passions`** : deux seulement dans tout `js/`
  (`app-02:2084`, le chargeur ; `passions-flat.js:1126`, la résolution de noms), les deux
  couvertes.
- **Aucune table voisine attrapée par le motif** : `passion_quotas`, `passion_requests` et
  `rpc/rechercher_passions` ne correspondent pas à `/rest/v1/passions?` (vérifié au cas ⑦).
