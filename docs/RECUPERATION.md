# PASSIO — Récupération

> État au 2026-09-14. Ce document distingue trois choses qu'on confond d'habitude : ce qui est **sauvegardé**, ce qui est **vérifié**, et ce qui est **restauré**. Depuis le 2026-09-14 au soir, les trois sont acquises — et la troisième l'est parce qu'elle a été FAITE, pas décrite.

## Verdict

**Une archive complète est produite chaque nuit, vérifiée, et elle a été RESTAURÉE de bout en bout dans un second projet : 40 tables, 8 comptes, 67 médias, 0 écart. La base reconstruite est structurellement identique à la production (16 compteurs d'objets égaux, mêmes avertissements `get_advisors`) et se comporte comme elle à la frontière anonyme.**

Ce qui manquait n'était pas un fichier, c'était l'exercice (EXP-01, contre-revue Astra : « personne n'a jamais reconstruit la base de bout en bout »). Il est fait, et les six défauts qu'il a révélés sont écrits plus bas — **aucun n'aurait été trouvé en relisant**.

## Les trois outils, dans l'ordre d'une reprise

```bash
npm run sauvegarde -- --complete                              # ① l'archive (données + comptes + médias)
npm run schema:executable                                     # ② le DDL de la prod (structure seule)
npm run restaurer -- --archive <dossier> --projet <ref> --schema <ddl.sql>   # ③ tout reverser, puis compter
npm run migration:appliquer -- migrations/<sécurité>.sql --projet <ref>     # ④ rejouer les migrations de sécurité, lire leur verdict
```

Le geste ④ n'est pas facultatif : un verdict de données ne voit pas une structure qui fuit (voir « ④ Après toute reconstruction », plus bas).

| Outil | Ce qu'il fait | Ce qu'il rend |
|---|---|---|
| `scripts/sauvegarde-donnees.js` | export NDJSON par table (PostgREST, `service_role`), comptes par l'API d'administration, médias par l'API Storage ; `--verifier` relit l'archive | manifeste avec décompte serveur par table |
| `scripts/schema-executable.js` | lit le **catalogue** Postgres de la production par l'API de gestion (canal ③ d'ADR-012, jamais la CLI) et rend un DDL en une transaction, rejouable : extensions, séquences (hors identité ; celles des `serial` rattachées à leur colonne), tables, contraintes, index, **identité de réplication**, fonctions, vues, déclencheurs, RLS, policies, privilèges de table/colonne/**séquence**/fonction, publication realtime, seaux, cron | `.passio/sauvegardes/schema-<date>.sql` (hors git : une photographie) |
| `scripts/restaurer-donnees.js` | ① schéma (applique `--schema` si des tables manquent) · ② comptes **avec leur identifiant d'origine** · ③ tables par lots SQL, triggers utilisateur coupés, parents d'abord · ④ médias, chemins préservés · ⑤ verdict : chaque table recomptée sur la cible contre le manifeste, comptes, objets Storage | `✅ restauration prouvée` ou la liste des écarts, exit 1 |

**Garde :** `restaurer` refuse la production (`njkiyoklssvefstljemx`, en dur) ET le projet écrit dans le manifeste de l'archive. On ne restaure jamais par-dessus la source. `--purger` vide la cible (même garde) : c'est ce qui rend l'exercice rejouable.

## L'exercice du 2026-09-14, mesuré

Cible : projet « PASSIO staging » (`fcksxofaelcdmmifnwjo`, `eu-west-1`, PG 17.6 comme la prod), **réactivé** par l'API de gestion (`POST /v1/projects/<ref>/restore`) après 28 jours de pause (créé le 2026-08-17, jamais servi).

| Étape | Résultat |
|---|---|
| Artefact de la nuit (`sauvegarde.yml`, run du 14/09 08:05) téléchargé, **déchiffré avec la phrase de repli** (SHA-256 de `service_role`, aucun secret `SAUVEGARDE_PASSPHRASE` posé), relu : 38 tables + 8 comptes conformes | ✅ la chaîne CI → poste fonctionne |
| DDL de la prod appliqué sur la base vide : 697 instructions, 16 sections | ✅ 43 tables, 317 colonnes, 123 policies, 38 triggers, 50 fonctions, 117 index, 92 contraintes, 3 vues, 3 cron, 25 tables realtime, 2 seaux, 286 grants anon, 1 127 privilèges de colonne anon, EXECUTE anon 9 / authenticated 27 — **tous égaux à la production** |
| DDL **rejoué** sur la base déjà semée | ✅ 201, rien ne casse, rien ne se duplique |
| Archive du 14/09 20:19 (fraîche, `--complete`) reversée | ✅ 40 tables, 8 comptes, 67 médias (79,7 Mo), **0 écart** |
| Sonde anonyme sur staging (clé anon) : `profiles` 200, `conv_messages` 200 vide, `events.address` **401**, `event_attendees` **401**, `user_state` 200 vide | ✅ identique à la production |
| `get_advisors` sécurité, staging vs prod | ✅ identiques — sauf `auth_leaked_password_protection`, réglage d'authentification que ni l'archive ni le DDL ne portent (voir « ce qu'une restauration ne rend pas ») |

Puis la cible a été **purgée** (`--purger`) : une copie des données réelles n'a rien à faire dans un second projet une fois la preuve écrite. Le schéma reste ; l'exercice se rejoue en quatre minutes.

## Les six défauts que l'exercice a révélés — et pourquoi la relecture ne les voyait pas

1. **`insert … select * from json_populate_recordset` pose NULL sur toute colonne absente du JSON.** Une colonne ajoutée APRÈS l'archive (`follows.created_at`, `reports.status`, toutes deux du 11/09) n'obtenait jamais son DEFAULT : NOT NULL refusé, table entière perdue. La liste de colonnes est désormais explicite (celles que l'archive porte ∩ celles que la cible connaît).
2. **Une archive antérieure à une contrainte porte des lignes que le schéma actuel refuse.** L'archive du 11/09 contient 15 + 35 + 47 lignes `event_*` orphelines (`event_id = 'e1'`, un identifiant de démonstration) — exactement celles que la migration de cascade du 14/09 a purgées. Un lot est atomique : une ligne refusée faisait tomber tout le lot. Le rejeu se fait ligne à ligne **dans la base** (un seul aller-retour, l'API plafonne à ~60 appels/min — mesuré : 429 « ThrottlerException »), et chaque motif de refus est nommé avec son nombre. **Un écart au verdict est une information, pas un échec du script.**
3. **Un seul `user_state` pèse 4,7 Mo** — plus que ce que l'API de gestion accepte (413). Il passe par PostgREST, triggers actifs, et c'est écrit dans le bilan. (C'est aussi une donnée de capacité : un compte porte un blob de 4,7 Mo, probablement des vocaux en base64 dans l'état — PERF-04 à mesurer.)
4. **La limite de taille d'un seau n'est pas celle de son contenu.** `content` plafonne à 26 Mo en production et portait une vidéo de 30,9 Mo, déposée avant que la limite ne baisse. Un dépôt à la limite du seau refuse un objet que la production a : le temps de la restauration, les seaux prennent la limite du projet, puis retrouvent celle du schéma.
5. **Les privilèges ne sont pas dans les policies.** Une reconstruction « tables + policies » rend `events.address` lisible sans compte (ce ne sont que des GRANT de colonnes qui le protègent) et `is_conv_member` appelable par `anon` — Supabase donne EXECUTE à PUBLIC à la création, un `revoke … from anon` seul ne ferme rien. Les vues sans `security_invoker` ressortaient en `security_definer_view ERROR`. Le DDL porte désormais privilèges de table, de colonne, d'EXECUTE (PUBLIC révoqué d'abord) et options de vue — c'est la différence entre « la même structure » et « la même frontière ».
6. **Le Storage refuse un `DELETE` SQL direct** (`storage.protect_delete`) : la purge passe par l'API, seau par seau. Et `SCHEMA_PROD_REFERENCE.sql` (08/2026) comme le brouillon `00_ORIGINE_PROD.sql` décrivent un état de 35 tables et 12 fonctions — la production en a 43 et 50. Une photographie ne vaut que datée.

## Ce que le verdict compare depuis le 2026-09-15 — et ce qu'il ne comparait pas (ASTRA-16/17/18)

La contre-revue du 15/09 a montré que le verdict du 14/09 comparait des **compteurs** : mêmes quantités de lignes, de comptes et d'objets. Huit autres identités, une ligne au contenu différent (`on conflict do nothing` laisse en place une ligne divergente), un objet vide de même nom : « restauration prouvée ». Ce que `--verifier` compare désormais :

- **les lignes, clé par clé et contenu compris** — la cible est relue par PostgREST (la même sérialisation que l'export), chaque ligne est canonisée (clés triées) et comparée à sa jumelle de l'archive sur les colonnes que l'archive porte (une colonne née après l'archive n'est pas une divergence ; une colonne de l'archive absente de la cible, si). Sortie : `manquantes / divergentes / en trop`, avec un exemple.
- **les comptes par identifiant** — les `id` de `_auth_users.ndjson` doivent tous être là, pas seulement le bon nombre.
- **les médias par nom, taille et empreinte** — le `eTag` du Storage est le md5 d'un dépôt en une passe ; il est comparé au md5 du fichier de l'archive.
- **`--preuve <fichier.json>`** écrit le verdict détaillé (commande, cible, archive, résultat par table) : c'est la preuve **durable**, celle qui manquait — la première est `.passio/audits/BILAN_PASSIO_09-26/preuves/restauration/2026-09-15-staging-referentiels.json`.

Mesuré sur le staging le 15/09 : `passions` (5 007), `passion_relations` (10 012), `access_policies` — « contenu identique » ; puis **une seule étiquette modifiée** en base sur 5 007 → `ECART passions | 5007 | 5007 — 0 manquante(s), 1 divergente(s), 0 en trop (ex. musique)`. Le compteur ne l'aurait jamais vu.

Deux autres défauts du même lot : la **purge** (`--purger`) comptait ses refus sans les dire et « terminait normalement » sur des HTTP 500 — chaque refus est nommé, la cible est **relue** (tables, comptes, objets) et tout reste rend le code 1 (ASTRA-17, non exercé en direct : le staging portait les référentiels dont la CI a besoin) ; et les **limites de taille des seaux**, levées le temps du dépôt des médias, étaient rétablies hors de tout `finally` — une exception d'upload laissait les seaux sans plafond ; le rétablissement est garanti, borné aux seaux lus, et un rétablissement refusé est un échec (ASTRA-18).

Les comparaisons sont pures et éprouvées : `tests/unit/restaurer-donnees.test.mjs` ④ à ④ quater (contenu différent à quantités égales, autres identités, objet vide de même nom, colonne née après l'archive).

## Le retour arrière APPLICATIF, exercé le même soir (EXP-03, moitié « rollback » de TCI-03)

Deux chemins, et ils ne servent pas la même urgence :

| Chemin | Ce qu'il fait | Délai mesuré |
|---|---|---|
| `.github/workflows/rollback.yml` (`workflow_dispatch`, confirmation « ROLLBACK ») | ouvre une branche et une PR de **revert** qui repasse par toute la CI — le chemin PROPRE, qui laisse une trace dans `main` | le cycle CI complet, ~30–45 min, jamais mesuré à moins |
| `npm run rollback:netlify -- --restaurer precedent` (`scripts/rollback-netlify.mjs`) | remet en ligne un déploiement de production **déjà construit** (Netlify les garde tous : HTML, `app.js`, `styles.css`, `sw.js`, `release.json`) par `POST /deploys/<id>/restore`, puis **relit `release.json` sur le site servi** jusqu'à y lire le commit attendu — le chemin d'URGENCE | **1,8 s** aller (6eca16aa → 53a4584b), **1,1 s** retour, mesurés le 2026-09-14 à 20 h 50 |

Le script liste d'abord les déploiements de production avec le commit que chacun sert (lu dans le `release.json` de son adresse propre `<id>--passio-app.netlify.app` : `commit_ref` est vide, les déploiements partent de la CLI, pas du lien git), refuse de restaurer ce qu'il ne sait pas vérifier, et n'écrit « en ligne » qu'après avoir vu le site le servir. Jeton : `NETLIFY_AUTH_TOKEN` ou la CLI Netlify du poste.

⚠️ **Ce qu'un rollback Netlify ne défait pas** : une migration appliquée (chaque migration porte sa section de retour arrière, à jouer par `npm run migration:appliquer`), une Edge Function déployée (`supabase functions deploy` de la version d'avant), le service worker déjà installé chez quelqu'un (il prend la version restaurée à son prochain démarrage, comme pour tout déploiement). Un correctif qui touche le client ET la base se défait dans l'ordre inverse de sa pose : base d'abord si le client d'avant ne la comprend pas, client d'abord sinon.

⚠️ **Kill switch distant** : il n'y en a pas d'autre que celui-ci — remettre la version d'avant en 2 s. Les drapeaux du dépôt (`passio_*="0"`) sont des coupures **locales**, par appareil ; aucun interrupteur serveur ne coupe une fonctionnalité chez tout le monde, sauf `irl_adult_only` (18+). C'est écrit, pas réglé.

✅ **Réglé le 2026-10-11** : `public.reglages_distants` (migration `migration_reglages_distants_2026-10-11.sql`) — depuis le pilotage téléphone (Capacité → Protection automatique), une fonctionnalité d'une liste blanche s'éteint chez tous en 5 min sans déploiement, un message s'affiche à tous, et la veille ralentit d'elle-même toute l'app devant un mur de capacité. Le retour arrière Netlify reste le geste pour un mauvais DÉPLOIEMENT — et depuis le 2026-10-12 il se fait depuis le TÉLÉPHONE (pilotage › Capacité › « Remettre la version précédente », qui montre la version servie et la version remise avant la confirmation) dès que le secret `PILOTAGE_NETLIFY_TOKEN` est posé sur la fonction `pilotage` ; la veille le propose quand une version casse, jamais seule : un humain confirme (`_shared/autonomie.js`). ⚠️ Retirer la table des réglages se fait en DEUX temps : la vider, attendre 15 min que chaque appareil rende ses coupures, puis la supprimer (en-tête de la migration). Détail : `docs/journal/telemetrie-pilotage-sentinelle.md` (🛡️ RÉGLAGES DISTANTS).

## L'exercice du 2026-09-15 : base VIDE, preuve écrite, parcours de comptes restaurés

Astra (fiche 21, point 4) : « restaurer sur cible vide et prouver des parcours avec comptes et médias ». Fait le 15/09 vers 12 h UTC, dans une fenêtre sans CI (la CI crée des comptes `@passio-e2e.test` sur le staging à chaque run : un exercice lancé pendant un run rend des « écarts » qui ne sont que ses comptes — mesuré une première fois avec 39 `user_safety` pour 2 dans l'archive).

| Étape | Résultat |
|---|---|
| Archive `--complete` fraîche de la production + `schema.sql` (DDL exécutable, 725 instructions, 16 sections) | 41 tables, 16 119 lignes, 4,04 Mo ; 10 comptes ; 67 médias, 79,7 Mo ; `--verifier` conforme |
| Staging **purgé** (`--purger`) puis relu | 0 ligne, 0 compte, 0 objet |
| Restauration (DDL → comptes → tables → médias), `--preuve` | **64 s** ; 41 tables « contenu identique », 10/10 comptes (mêmes identifiants), 67/67 médias (taille et empreinte) — `prouvee: true`, 0 écart : `.passio/audits/BILAN_PASSIO_09-26/preuves/restauration/2026-09-15-cible-vide.json` |
| Parcours de trois comptes restaurés : lien magique (`generate_link` → `verify`), lectures par l'API de l'app avec leur jeton | profil, 21/21 et 11/11 publications, conversations, `user_state`, deux médias lus HTTP 200 avec leurs octets — `…/2026-09-15-parcours-comptes-restaures.md` |
| Purge, puis référentiels seuls reversés, puis données synthétiques de charge | staging sans donnée personnelle |

**Trois défauts de l'outil, trouvés par l'exercice et corrigés le jour même** — aucun n'était visible à la relecture :

1. **Une colonne d'identité `generated always` refuse toute valeur explicite.** `migrations_appliquees.id` (journal du 15/09) : les quatre lignes tombaient (« cannot insert a non-DEFAULT value »), nommées au terminal, mais la preuve JSON disait `4 | 0` avec un détail vide. `overriding system value` sur les deux chemins d'insertion, et le bilan (`refus`, `notes`) voyage désormais dans la preuve.
2. **Un eTag `<hex>-<n>` n'est pas un MD5.** Deux vidéos de 20 et 25 Mo, identiques à l'octet et au même eTag des deux côtés, étaient dites « divergentes » : le Storage les envoie en multipart et leur eTag n'est pas l'empreinte du fichier. Pour ces objets, la taille est la seule comparaison honnête ; pour les autres, l'eTag reste le MD5 et se compare.
3. **Un compte ne dit pas quoi regarder.** « 2 divergents » sans leurs noms : la preuve porte désormais `medias.noms` (manquants, divergents, en trop — bornés à 50).

Deux constats de plus : une archive prise **pendant un déploiement** porte les comptes transitoires de la barrière `authz-critical` (deux `@passio-e2e.test`, créés à 13:27, purgés par la fin du run) — ils se reconnaissent à leur domaine, et la fin de run de la CI les retire aussi de la cible restaurée ; et le journal `migrations_appliquees` du staging part avec la purge (il n'est durable que là où on n'exerce pas de restauration).

Ce qui n'est toujours pas rendu par une restauration reste ce qui est écrit plus bas (mots de passe, OAuth, configuration, Edge Functions).

## Ce que l'archive porte depuis la cinquième contre-revue (15/09/2026 — ASTRA-45 / 46 / 47 / 48 / 55)

- **`_storage_index.json`** (`passio-index-medias/1`) : nom, taille et MD5 de **chaque** objet archivé, écrit
  par la sauvegarde ; son empreinte SHA-256 est dans le manifeste (`medias.index_sha256`). C'est **lui** qui
  dit ce que l'archive doit contenir — pas les fichiers encore présents sur disque. Le vérificateur et la
  restauration y confrontent le disque **au moment de l'usage** (une archive endommagée après sa
  vérification se voit), puis la cible ; un objet **en trop** sur la cible est un écart (ASTRA-55). Sans
  index (archives d'avant), l'attendu est **indéterminé** et la reprise ne peut pas se dire prouvée sur les
  médias.
- **`_storage_proprietaires.json`** (`passio-proprietaires/1`) : versionné, avec son `total`, son empreinte
  dans le manifeste (`medias.proprietaires_sha256`). Lu **strictement** : illisible, tronqué, d'une autre
  forme ou d'une autre empreinte → **indéterminé**, jamais « vide et conforme » (ASTRA-48). L'inventaire est
  lu par **pages** (`Range`, avance du nombre de lignes reçues, fin sur `200`), sous tout plafond `max-rows`
  (ASTRA-45 — la valeur de production n'a **pas été mesurée**), puis **rapproché objet par objet** de l'index :
  trois états distincts dans le manifeste — `proprietaires_explicites`, `proprietaires_nuls` (propriétaire
  explicitement nul en base), `proprietaires_non_releves` — et `proprietaires_inventaire` =
  `complet | incomplet | indisponible`. Une archive dont l'inventaire n'est pas complet est **partielle**.
- **Un seul résultat** (ASTRA-46) : chaque phase (comptes, tables, médias, limites de seaux, propriétaires)
  écrit dans le bilan partagé ; le verdict le lit ; la preuve JSON, l'affichage et le code de sortie suivent
  le même `prouvee`. Une incohérence interne (phase en échec, verdict prouvé) sort en échec et le dit.
- **La suspension d'un compte** est comparée à sa **borne** (ASTRA-47) : conforme dans
  `[attendu, attendu + 1 h]` ± 5 min (arrondi à l'heure de `ban_duration`, dérive d'horloge) ; déjà passée,
  raccourcie ou prolongée → écart. Un compte **déjà présent** sur la cible (rejeu, conflit) est relu ; si
  l'archive porte une suspension en cours qu'il n'a pas, elle est posée puis relue ; sinon c'est un refus.
- Verrous : `tests/unit/reprise-verdicts.test.mjs` (fonctions pures), `tests/unit/restaurer-phases.test.mjs`
  et `tests/unit/sauvegarde-medias.test.mjs` (les **vraies** phases, seul `fetch` doublé — GoTrue, Storage,
  API de gestion), `tests/unit/sauvegarde-verifier.test.mjs` (le vrai vérificateur sur de vraies archives).
  Six mutations détectées, dont « ban non transmis au POST », que la contre-revue avait montrée invisible.
- **Non mesuré** : aucune restauration réelle sur un projet jetable n'a été rejouée avec ces changements.

## Sixième contre-revue (16/09/2026 — ASTRA-57 / 58 / 59) : trois défauts qui restaient ouverts

- **ASTRA-57 — la pagination des propriétaires ne paginait pas.** « POST + `Range`, arrêt sur ≠ 206 » :
  PostgREST ne rend **206** que s'il connaît le total (`Prefer: count=…`) et que la plage rendue est plus
  courte que lui ; sans compte il rend **200 à chaque page**, plafonnée à `max-rows` — la boucle s'arrêtait
  au premier appel (1 001 objets → 1 000 propriétaires, un appel, zéro erreur). Désormais
  (`paginerProprietaires`) : `limit`/`offset` en paramètres, `order=bucket_id.asc,name.asc` (ordre **total**
  : `(bucket_id, name)` est unique), `Prefer: count=exact` → le **total** de `Content-Range` termine et est
  **vérifié** (lu = annoncé) ; total inconnu → la **page vide** termine ; on avance du nombre **reçu** ;
  **non-progression** (clé déjà vue, total qui change, plus de 20 000 pages) → erreur nommée, l'archive se
  dit **partielle**. Testé à 2 501 objets sous un plafond de 1 000, avec un faux PostgREST qui applique ses
  vraies règles de statut (`tests/unit/sauvegarde-medias.test.mjs`, ASTRA-57 ①–⑥ ; ① rejoue l'ancien
  protocole et montre l'arrêt prématuré). **Le plafond réel de production reste non mesuré.**
- **ASTRA-58 — le NUL explicite se restaure et se compare.** Une entrée `owner:null, owner_id:null` (les
  deux champs **présents**) est ce que la base portait : la restauration écrit NULL sur la cible, et le
  verdict exige NULL — une cible qui appartient à B est un **écart** (avant : sautée, et « prouvée »). Les
  champs sont comparés **un par un**. Une entrée `{}`, `null`, ou sans l'un des deux champs est un
  propriétaire **inconnu** : l'inventaire est refusé (indéterminé), rien n'est écrit, `prouvee:false`.
- **ASTRA-59 — l'archive se valide AVANT toute mutation.** `validerArchive` : tables (lignes NDJSON =
  manifeste), index et fichiers (taille, MD5), inventaire (forme, total, empreinte, chaque entrée). Invalide
  → code 2, **la cible n'a pas été touchée**. Sans index (archive d'avant) → « non vérifiable », distinct
  d'une corruption détectée, et ne passe qu'avec `--accepter-archive-non-verifiable`. Et la phase médias
  garde son filet : un fichier qui diffère de l'index ou hors index **n'est jamais déposé** (avec `x-upsert`
  il remplaçait un objet sain par un octet altéré — reproduit : index AAA, disque BAD, cible AAA → cible BAD).
- Verrous : `tests/unit/restaurer-phases.test.mjs` ASTRA-58 ③④, ASTRA-59 ①② (vraies phases) ;
  `tests/unit/reprise-verdicts.test.mjs` ASTRA-58 ①②.
- **Non mesuré** : le cycle sauvegarde → altération contrôlée → restauration → relecture sur un projet
  Supabase jetable **n'a pas été rejoué** (aucun projet jetable autorisé sur ce poste : il faut un projet
  Supabase distinct de la production, son `ref`, et le jeton personnel `sbp_…` — voir le dossier de livraison).

## Le cycle réel du 2026-10-21 (RES-14) : altération refusée, restauration prouvée

Cible : « PASSIO staging » (`fcksxofaelcdmmifnwjo`) — ni la production, ni la source de l'archive ; vidé
(`--purger`) avant chaque passage, vidé et ressemé (référentiels seuls) après. Archive : production du
21/10 à 18 h 43, `--complete` + `schema.sql` (`schema-executable.js`), `--verifier` : **COMPLÈTE**,
45 tables, 11 comptes, 43 médias (26,8 Mo), 43 propriétaires explicites, 0 nul en base.

| Passage | Archive | Résultat |
|---|---|---|
| ① altération contrôlée | copie : un `.jpg` remplacé par `BAD`, un propriétaire changé vers un autre compte | **code 2**, « rien n'a été écrit sur la cible » : fichier modifié ET empreinte d'inventaire ≠ manifeste détectés tous les deux ; purge relue ensuite à 0 ligne, 0 compte, 0 objet |
| ② restauration saine | l'archive intacte | **`prouvee: true`**, 0 écart : 45 tables, 11 comptes (mêmes identifiants), 43 médias, 43 propriétaires conformes |
| ③ propriétaire NULL | copie cohérente : un objet rendu sans propriétaire, empreinte recalculée | premier essai pollué par la CI (voir ⚠️) ; **rejoué hors déploiement : `prouvee: true`**, `_storage.owner` OK — 43 conformes, 1 sans propriétaire posé NULL |

**Le défaut que l'exercice a trouvé** : `schema-executable.js` écrivait `create table if not exists` seul.
Sur une cible dont le schéma a dérivé (staging semé le 14/09, `notifications.origine` ajoutée depuis), la
table était sautée avec ses colonnes d'avant, puis la contrainte CHECK de la colonne absente faisait tomber
toute la transaction (`42703`). Chaque colonne est désormais reposée par `add column if not exists` —
sans effet sur une base à jour, rattrapage sur une base en retard.

**Plafond `max-rows` de PostgREST en production : 1 000** (mesuré le même soir : `telemetry_events` et
`analytics_events` rendent 1 000 lignes sur 5 033 et 11 727 malgré `limit=100000`). C'est pour cela que
la sauvegarde pagine (RES-17).

⚠️ **Le staging n'est plus un projet calme** : depuis le lot SUP-04, `deploy.yml` y fait tourner les suites
à comptes réels. Le passage ③ a croisé le déploiement de 18 h 46 : 13 comptes de banc et leurs lignes sont
apparus « en trop » pendant la restauration. Rejouer l'exercice **hors d'un déploiement** (`gh run list`
vide en cours) — ou sur un projet jetable dédié — et ressemer le staging après.

Preuves (hors git, contenu utilisateur réel) : `.passio/sauvegardes/2026-10-21-res14-preuves/`.

## La revue du 2026-11-03 (R25) : la structure qu'une reprise ne rendait pas

Revue indépendante du 2026-11-03, reproduite au banc puis corrigée le 2026-11-04. Le DDL de reprise
(`schema.sql` de chaque archive, écrit chaque nuit par `schema-executable.js`) ne portait ni l'identité de
réplication des tables, ni les droits de séquence, et doublait chaque séquence d'identité. Un projet
reconstruit sortait « contenu identique » du verdict — `--verifier` compare des **lignes** — et pourtant :

| Ce qui manquait | Ce que la reconstruction rendait | Ce que cela rouvrait |
|---|---|---|
| `REPLICA IDENTITY` | toutes les tables en DEFAULT, la clé primaire | `migration_realtime_identite_opaque_2026-11-03.sql` ne fait plus publier d'un DELETE que `rid` (`replica identity using index <table>_rid_key` sur `conv_members`, `notifications`, `conv_reads`, `post_likes`) ; sur la base reconstruite, chaque départ republiait la conversation et le compte à tout abonné — R25 rouvert sans un signe. `comment_interactions`, en FULL jusqu'au 2026-11-04 (DEFAULT depuis R25), perdait aussi la sienne |
| séquences d'identité | créées d'avance comme séquences autonomes : la colonne en recevait une **seconde** (`*_seq1`), la première restait orpheline | deux séquences par colonne d'identité — `client_errors.id` et `migrations_appliquees.id` en sont (canal ①, 2026-11-04 : ce sont des identités, jamais des `serial`) |
| droits de séquence | ceux qu'un projet Supabase donne à toute séquence neuve : `rwU` pour `anon` et `authenticated` | identiques à la production AUJOURD'HUI (ses deux séquences ont `rwU`, canal ①, 2026-11-04) ; mais tout droit RESSERRÉ revenait en silence — la première version de R25 retirait tout droit client sur les séquences de `rid` : les lire, c'est estimer le volume d'écritures d'une table ; les reculer, c'est faire percuter l'index unique à l'insertion suivante |
| `OWNED BY` d'un `serial` | une séquence que `pg_get_serial_sequence` ne trouve pas | le recalage des séquences de `restaurer-donnees.js` la sautait : la première insertion après la reprise percutait une clé restaurée (« duplicate key »). Aucune colonne `serial` en production : défaut latent |

**Le correctif** (`schema-executable.js`, 19 sections au lieu de 16 — 20 avec la garde ajoutée par la contre-revue finale, plus bas) : la section « Séquences » ne crée plus
d'avance une séquence d'identité (pg_depend `i` : elle naît avec sa colonne) ; une section rattache chaque
`serial` à sa colonne (`OWNED BY`) ; une section **identité de réplication**, après les index, rend chaque
table publique — DEFAULT compris, si bien qu'une cible semée qui a dérivé revient à la source — et un
USING INDEX dont l'index a disparu en NOTHING, son effet réel ; une section **privilèges de séquence** retire
puis rend à `anon` et `authenticated` ce que `has_sequence_privilege` lit dans la source, la séquence d'une
identité désignée par SA COLONNE (`pg_get_serial_sequence` : une table renommée garde l'ancien nom de
séquence, la cible en donne un neuf). Une séquence d'identité absente de la cible est une erreur, pas un
silence.

**Le banc** `tests/sql/schema-executable-identite.test.sh` (40 contrôles, PostgreSQL jetable, exécuté en CI
par `scripts/bancs-sql-restants.sh`) rend le DDL par les ETAPES du dépôt contre une source qui porte les deux
formes de R25 (`rid` d'identité séquentielle, puis `rid` aléatoire), une table FULL, une NOTHING, une identité
ALWAYS, l'identité d'une table renommée, un `bigserial` et une séquence autonome aux droits choisis ;
l'applique à une base vide aux droits par défaut de Supabase ; compare identités, séquences et droits ;
reverse les lignes comme `restaurer-donnees.js` (`ordreInsert`, texte NDJSON tel quel, son recalage des
séquences) et insère encore une ligne par table ; lit dans le WAL (`test_decoding`) ce qu'un DELETE publie ;
puis rejoue le DDL sur la base semée et sur une cible qui a dérivé. **Rouge prouvé** sur le générateur
d'`origin/main` (3e4019d, worktree privé) : 25 ✅ 15 ❌ — dont les DELETE de la base reconstruite qui
publient `conv_id[text]:'c1' user_id[text]:'u1'` et `post_id[text]:'p1' user_id[text]:'u2'`.

**Recoupé** sur le socle de la revue (la vraie migration R25, `realtime.apply_rls` de production recopiée à
l'octet), reconstruit avec le générateur corrigé, le verdict de R25 lu sur la base reconstruite **sans
réappliquer la migration** : **11 OK / 0 ECHEC** pour la version du commit 13874e4 (`rid` d'identité, sha256
`51a2f4c2…`), **10 OK / 0 ECHEC** pour la version de travail du 2026-11-04 (`rid` aléatoire, `bb3ae779…`) ;
dans les deux, le DDL s'applique sans erreur et un DELETE ne publie plus que `rid`. La migration n'était pas
finalisée : ce recoupement ne vaut que pour ces deux empreintes. **La forme FINALE** du `rid` (53 bits, chiffres
17 à 32 de l'UUID), introduite par le fichier sha256 `6471496f…` — le fichier attesté et APPLIQUÉ est `9f48ffe1…`,
dont défaut, index, identité et code de la garde sont identiques —, est celle que porte désormais la table `aimes` du banc — défaut
recopié à l'octet près, garde au même code exécutable (sans ses commentaires) : 40 ✅ / 0 ❌ (2026-11-04). La contre-revue finale (2026-11-04) a REJOUÉ le
recoupement pour cette empreinte : source 10 OK, DDL rendu puis appliqué à une base vide de type Supabase,
verdict de R25 lu sur la base reconstruite sans réappliquer la migration **10 OK / 0 ECHEC**, rejeu du DDL et de la
migration sans erreur. Les corrections de R25 qui ont suivi (verdict, retour arrière, en-tête) ne changent ni
l'identité, ni le défaut de `rid`, ni la garde.

**Garde du générateur** (même revue) : une table PARTITIONNÉE ou ÉTRANGÈRE de `public` n'était pas rendue, et le
DDL échouait plus loin, à la reprise (contraintes, `OWNED BY` d'un serial, droits d'une séquence d'identité). La
première des 20 sections le DIT désormais : sa seule instruction LÈVE à l'application, en nommant la table — la
reprise s'arrête avant d'avoir rien posé —, et le générateur le signale au journal du workflow (`::warning`). Il
n'échoue PAS : un échec à cette étape sautait le chiffrement et le dépôt de la nuit, données comprises (relevé par
la contre-revue de ce correctif). `--verifier` dit alors l'archive PARTIELLE (en note : l'archive est déposée), et
une dernière étape de `sauvegarde.yml`, APRÈS le dépôt, rend le run ROUGE — sinon trente nuits « vertes » ne
reconstruiraient pas une base vide (dernière passe de la contre-revue, `reprise-verdicts.test.mjs`). Aucune en production (canal ①, 2026-11-04). Verrou :
`tests/unit/restaurer-donnees.test.mjs` ⑦.

### ④ Après toute reconstruction : rejouer les migrations de sécurité, mesurer l'identité

Une archive porte des lignes, et le DDL de la nuit où elle a été prise. Ce qu'une migration de sécurité pose
**sans écrire de ligne** — identité de réplication, droits, policies, publication — n'est vu par aucun
verdict de données. Donc, avant d'ouvrir un projet reconstruit :

1. **Rejouer sur la cible** chaque migration de sécurité dont l'effet n'est pas une ligne — au minimum
   `migration_realtime_identite_opaque_2026-11-03.sql` puis `migration_realtime_diffusion_privee_2026-11-03.sql`,
   toutes deux appliquées en production le 2026-11-04. Elles sont
   idempotentes et impriment leur tableau de verdict :
   `npm run migration:appliquer -- migrations/<fichier>.sql --projet <ref de la cible>` — tout OK, ou le
   projet ne s'ouvre pas. Le journal `migrations_appliquees`, restauré avec l'archive, dit lesquelles la
   source avait reçues. ⚠️ Une seule exception, attendue : la ligne 10 de `migration_realtime_identite_opaque`
   exige « les 11 mêmes tables » publiées. Elle dit ECHEC dès que la publication de la cible ne porte plus
   `conv_members` ni `notifications` : après `migration_realtime_diffusion_privee`, ET sur toute base
   reconstruite d'une archive prise après le 2026-11-04 à 14:25 UTC, dont le DDL publie déjà neuf tables —
   l'ordre des rejeux n'y change rien (reproduit, vérification finale de R25). L'attendu est alors : R25,
   lignes 1 à 9 OK et ligne 10 ECHEC ; `diffusion_privee`, tout OK ; et la publication de la cible égale à
   celle de la production (canal ①). `appliquer-migration.mjs` sort en code 1 sur cette ligne, transaction
   validée : c'est le tableau qui fait foi, pas le code de sortie. Rejouer l'identité opaque d'abord reste
   l'ordre sûr pour une archive d'AVANT cette heure.
2. **Mesurer l'identité de réplication** par le canal de lecture seule (canal ① d'ADR-012 ; sur un projet que
   le connecteur ne vise pas, la même requête — un SELECT seul — par l'API de gestion), puis la comparer à la
   même lecture sur la production :

   ```sql
   select c.relname, c.relreplident,
          (select ic.relname from pg_index i join pg_class ic on ic.oid = i.indexrelid
            where i.indrelid = c.oid and i.indisreplident) as index_identite
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relreplident <> 'd'
    order by 1;
   ```

   Attendu une fois R25 appliquée : `conv_members`, `conv_reads`, `notifications`, `post_likes` en `i` sur
   `<table>_rid_key`, et aucune autre ligne.
3. **Mesurer les séquences** de la même façon : aucune `*_seq1`, et les mêmes droits que la production
   (`has_sequence_privilege(<rôle>, c.oid, 'USAGE, SELECT, UPDATE')` est vrai dès qu'UN droit reste) :

   ```sql
   select c.relname,
          has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE') as anon,
          has_sequence_privilege('authenticated', c.oid, 'USAGE, SELECT, UPDATE') as authenticated
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
    order by 1;
   ```

### Ce que le DDL ne rend toujours pas — écrit

- **Les options d'une séquence d'identité** (départ, pas, bornes, cache) : l'identité renaît avec celles de
  PostgreSQL par défaut. Les deux de la production les ont (canal ①, 2026-11-04), et la reprise recale la
  valeur courante sur le maximum restauré.
- **La valeur courante d'une séquence autonome** (rattachée à aucune colonne) : elle repart de son départ —
  l'archive ne porte pas de séquences. Aucune en production.
- **Un projet reconstruit avec l'ancien générateur** (le staging, le 2026-09-14) porte probablement une
  séquence orpheline par colonne d'identité, la colonne se servant de `*_seq1` — non mesuré ; sans effet,
  puisque rien ne s'en sert, et le DDL ne supprime rien.
- Le banc tourne sur PostgreSQL 16 (poste et CI) ; la production est en 17.6. Aucun cycle réel sur un projet
  Supabase n'a été rejoué avec ces sections. Les requêtes de catalogue des sections neuves ont été lues sur la
  production (canal ①, 2026-11-04, AVANT l'application de R25) : elles s'exécutent, et rendent l'identité de
  52 tables (seule `comment_interactions` hors DEFAULT, en FULL ; depuis 12:45:52 UTC, les quatre tables de R25
  en `i` et `comment_interactions` en DEFAULT), aucune séquence à créer d'avance, aucun `OWNED BY`, et les
  droits des deux séquences d'identité pour `anon` et `authenticated`, désignées par leur colonne.

### Trouvé en écrivant le banc : l'ARCHIVE arrondissait un entier au-delà de 2^53 (corrigé le 2026-11-04)

`sauvegarde-donnees.js` lisait chaque page de PostgREST par `r.json()` et la réécrivait par `JSON.stringify` :
un `bigint` au-delà de 2^53 y devenait le double le plus proche — mesuré : `2906581903110193585` →
`2906581903110193700`, et deux valeurs distinctes (`4176641050114934105`, `4176641050114934300`) devenaient la
même. `restaurer-donnees.js` passe, lui, le texte NDJSON tel quel : c'était l'archive qui perdait, pas la
reprise, et `--verifier`, qui relisait les deux côtés par `JSON.parse`, ne le voyait pas. Deux `rid` arrondis au
même double auraient fait refuser la seconde ligne par `<table>_rid_key` (`on conflict do nothing` : elle
manquait au verdict).

**Correctif** (`scripts/lib/json-exact.js`) :
- **l'export n'interprète plus ses lignes** : `decouperLignes` découpe le tableau que rend PostgREST en textes de
  lignes, par un balayage LINÉAIRE (profondeur, chaînes, échappements), et `exporter` les écrit tels que la base
  les a rendus — exact par construction, échelle de `10.00` comprise. `JSON.parse` seul vérifie que chaque ligne
  est un objet ; une page tronquée fait échouer l'export en nommant la table et la page ;
- **la vérification compare au chiffre près** : `lireJsonExact` (archive relue, cible relue, `lireNdjson`,
  `lignesCible`) garde le texte source d'un nombre que JavaScript changerait (`JSON.rawJSON`, Node 21 et plus — la
  CI est en 22) ; un nombre qu'il lit en dénotant la même valeur décimale reste un nombre (`10.00`, `1e-07`,
  `0.1` : une archive d'avant le correctif se vérifie toujours à l'identique — rejoué sur PostgreSQL 16 par la
  contre-revue, 0 écart). La clé de comparaison prend le texte exact (`texteValeur`) ;
- ⚠️ **aucune profondeur ne fait échouer la sauvegarde** (contre-revue finale, 2026-11-04) : un compte écrit le
  jsonb qu'il veut dans SON `user_state`, et la production en accepte au moins 8 000 niveaux (mesuré). L'ancien
  export (`r.json()` puis `JSON.stringify`) cassait déjà vers 4 171 niveaux — plus aucune archive, nuit après nuit —,
  et la première version de ce lot, par un `reviver` récursif, vers 2 847. L'export ne relit plus rien : aucun
  plafond de profondeur, l'ancien compris. `lireJsonExact` balaie d'abord les jetons numériques et n'appelle le
  reviver que s'il en trouve un « à risque » ;
- **sans `JSON.rawJSON`, tout nombre à risque fait échouer la lecture** (entier au-delà de 2^53, décimal à plus de
  15 chiffres, `1e400` qui deviendrait `null`) : jamais un arrondi silencieux.
- **la VALIDATION d'une archive ne relit rien au chiffre près** : elle compte et vérifie la syntaxe (`JSON.parse`
  seul, `compterLignesNdjson`). Par la lecture exacte, une seule ligne très imbriquée portant un nombre à risque —
  qu'un compte écrit chez lui — faisait refuser l'archive ENTIÈRE, « INVALIDE », sans recours (P2 relevé par la
  contre-revue de ce correctif, confirmé, rouge sur réinjection : `restaurer-phases.test.mjs`) ;
- **la reprise refuse de démarrer sans `JSON.rawJSON`** (Node < 21), en le disant, au lieu de déclarer « corrompue »
  une archive saine ; et la comparaison voit une différence rangée sous une clé `__proto__` (préexistant :
  `canoniser` l'affectait, ce qui changeait le prototype au lieu de créer la clé).
Verrous : `tests/unit/restaurer-donnees.test.mjs` ⑤ à ⑦ bis, rouges sur six réinjections (`r.json()` à
l'export, `JSON.parse` à la relecture, `String()` dans la clé, export relu puis réécrit, lecture toujours par
reviver, repli qui arrondit les décimaux). Aucune archive existante n'est à reprendre : jusqu'ici, les seules
colonnes `bigint` de `public` étaient les deux compteurs d'identité, aucune n'était en `numeric` ni `json`, et les
1 291 nombres des `jsonb` sauvegardés ont tous 15 chiffres significatifs au plus (canal ①, 2026-11-04).

**Limites qui restent, dites telles quelles** :
- les `float8` : la production rend ses flottants sur 15 chiffres (`extra_float_digits = 0`), et le `json_agg` de
  PostgREST les écrit ainsi — `0.30000000000000004` s'archive `0.3`, se restaure `0.3`, et le verdict compare `0.3` à
  `0.3`. Préexistant (l'ancien export faisait de même) ; aucune valeur touchée le 2026-11-04 (canal ①). Risque
  résiduel R35 ;
- une colonne de type `json` (pas `jsonb`) garde ses blancs d'origine ; le découpage change un saut de ligne hors
  chaîne en espace, et le verdict, qui compare des valeurs, ne le voit pas. Aucune colonne `json` en production ;
- la COMPARAISON de la reprise (`canoniser`, récursive) plafonne entre ≈ 2 600 et ≈ 4 170 niveaux d'imbrication
  selon l'état du moteur (mesuré par la contre-revue) — préexistant :
  une ligne plus profonde fait échouer le verdict (il ne dit pas « conforme ») ; l'export et le chargement, eux,
  n'ont plus de plafond propre ;
- la sauvegarde de la nuit n'inscrit jamais `schema_sha256` au manifeste — préexistant : l'étape « Exporter » de
  `sauvegarde.yml` tourne AVANT « Archiver le schéma », et ne hache `schema.sql` que s'il existe déjà. Le contrôle
  « ce DDL est celui de cette archive » (ASTRA-32) ne sert donc pas encore ; inverser les étapes ferait dépendre
  l'export des données de l'étape du schéma. Risque résiduel R34 de l'audit du 2026-11-02.

## Ce qu'une restauration NE REND PAS — écrit, pas tu

- **Les mots de passe** : l'export ne porte pas `encrypted_password`. Chaque compte restauré reçoit un mot de passe aléatoire (jamais journalisé) et repasse par « mot de passe oublié ». Les **identités OAuth** (Google) ne sont pas dans l'export non plus. `created_at` des comptes est celui de la restauration (l'API d'administration l'impose).
- **La configuration du projet** : réglages d'authentification (confirmation d'e-mail, longueur de mot de passe, protection contre les mots de passe compromis, captcha), SMTP, secrets des Edge Functions, les Edge Functions elles-mêmes (`supabase functions deploy`), « Allow public access » du Realtime. Ils vivent dans le tableau de bord, pas dans la base. `docs/OUVERTURE_PUBLIQUE_2026-09-11.md` et `docs/SETUP_SMTP_AUTH.md` en sont la liste.
- **Les tables d'observabilité** (`telemetry_events`, `analytics_events`, `client_errors`) : exclues de l'archive par choix, régénérables.
- **Le comportement bout en bout par l'application** : le client porte l'URL de la production en dur (`SUPABASE_URL`, app-08), donc `authz-critical.spec.js` ne sait pas viser le staging. C'est le cœur de SUP-04 (un seul environnement), lot suivant ; en attendant, la frontière a été sondée en REST direct.

## Ce qui reste vrai d'avant

**Le contenu de l'archive est du contenu utilisateur réel.** `.passio/sauvegardes/` est exclu de git ; ne jamais l'y forcer. L'artefact CI est chiffré (`SAUVEGARDE_PASSPHRASE`, sinon SHA-256 de `service_role`), conservé 30 jours ; les médias n'y sont que le dimanche.

**`supabase db dump` est inutilisable ici** (pas de Docker : fichier de 0 octet, code 1). **`supabase db query` est retiré** (ADR-012). Le seul canal vers la structure est l'API de gestion, et c'est celui des trois outils.

**Le plan est Pro** : huit sauvegardes physiques quotidiennes côté Supabase, lisibles par l'API de gestion, restaurables **dans le même projet** uniquement. L'exercice ci-dessus est l'autre voie — celle qui reconstruit ailleurs, avec nos propres fichiers, et qui a été faite.
