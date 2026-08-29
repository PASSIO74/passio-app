# PASSIO — Journal d'ingénierie

> Une entrée par grande boucle de travail. Faits et mesures uniquement ; les décisions durables vont dans `.passio/adr/`, les risques dans `.passio/context/KNOWN_RISKS.md`.

---

## 2026-08-17 — Boucle 20 : la migration Storage est appliquée, et vérifiée

La migration préparée en boucle 18 a été **appliquée en production** par l'autre session, qui a aussi câblé le test d'intrusion dans le gate. Constaté en base avant toute autre chose : une seule policy par commande, `INSERT` et `UPDATE` portant tous deux `storage_chemin_autorise()`. C'est bien la version 2 — celle qui ferme aussi le renommage.

Restait à dérouler la section « vérifier après » que j'avais écrite pour ce moment précis. C'est fait, point par point.

**Les intrusions sont refusées.** Le gate passe : dépôt chez autrui, `move`, `copy`, pièce jointe dans une conversation dont on n'est pas membre — tous ≥ 400. Et la contre-épreuve, qui est le vrai risque de cette policy, passe aussi : déposer dans son propre dossier → 200.

**L'`upsert` n'est pas cassé.** Le point que la revue croisée disait indécidable sans mesure. L'application envoie ses médias avec `upsert: true` ; un refus aurait cassé la republication d'un média **en silence**, le code retombant sur le base64. Mesuré : premier dépôt 200, re-dépôt sans upsert 400 (conflit attendu), **upsert sur sa propre clé 200**, et `PUT` — l'autre forme d'écrasement du SDK — **200** aussi.

**Le chemin fabriqué est refusé.** J'avais laissé ce point ouvert en écrivant « non vérifiable avant application ». Il l'est maintenant : `photos/<moi>/../<autrui>/x.png` → **400**. La RLS voit donc le nom **normalisé**, pas le nom brut. La question était réelle — le serveur normalise avant d'enregistrer, et rien ne garantissait a priori dans quel ordre.

### Une preuve dont je borne la portée

`posts.media_url` ne contient **aucun** `data:` — zéro sur tout l'historique. Mais ce contrôle ne prouve rien sur le trafic réel : **aucun média n'a été publié en production depuis l'application** de la migration, le dernier datant du 2026-08-14. La preuve que le chemin légitime fonctionne vient de la suite e2e, pas de la production. Écrit tel quel dans la migration et dans le registre, plutôt que compté comme un vert de plus.

### État du registre

**Plus aucun incident ouvert** : les quatorze sont clos, infirmés, ou corrigés et vérifiés. `STORAGE-ECRITURE-014` passe à `CLOS` avec ses preuves ; `MEDIA-COMPTE-SUPPRIME-010` reste `INFIRME_PARTIELLEMENT` — le parcours produit est bon, seuls les 19 médias issus de suppressions administratives restent à traiter.

### Fichiers touchés
`migrations/migration_storage_cloisonnement.sql` (annoté des résultats — le SQL n'a pas bougé), `passio_qa_registry.json`, `PASSIO_PRODUCTION_READINESS.md`, `PASSIO_ENGINEERING_LOG.md`.

---

## 2026-08-17 — Boucle 19 : « supprimer mon compte » marche, et je m'étais trompé

### Le temps réel : rien à signaler, et c'est une information

Vérification jamais faite : les 17 tables auxquelles l'application s'abonne sont-elles publiées ? **Zéro manquante.** Une table écoutée mais non publiée serait une fonctionnalité qui ne se met jamais à jour en direct, sans la moindre erreur — la panne silencieuse type. Elle n'existe pas ici. Résultat négatif, noté comme tel.

### Le 15,2 % devient une liste de 35

Un taux global ne dit pas quoi faire. `scripts/couverture-risque.js` sépare, parmi les 369 interactions non exercées, celles qui **touchent réellement aux données** : **7 qui suppriment, 28 qui écrivent**. Le reste n'écrit rien directement. L'analyse est non transitive et le dit — c'est une borne inférieure, pas un inventaire.

Et en tête des sept : `doDeleteAccount`.

### Ce que j'ai cru, et ce qui est vrai

Le commentaire de `doDeleteAccount` affirmait que l'Edge Function de suppression « n'est pas déployée », que l'échec est silencieux, et qu'une purge manuelle sous 30 jours s'applique. Le code client, lui, ne touche jamais au Storage. J'en avais conclu, à la boucle 17, que la suppression de compte **ne cascade pas** — et je l'ai écrit dans le readiness.

**C'était faux.** L'Edge Function est déployée, active, en version 4. Vérifié de bout en bout sur un compte jetable : elle supprime le compte — reconnexion refusée ensuite — **et les médias**, servis `200` avant l'appel, `400` après. Le parcours produit est complet.

Ce qui reste vrai, mais autrement : le résidu mesuré (76 `user_state`, 54 notifications, 19 médias) ne vient **pas** du parcours produit. Il vient des suppressions **administratives** qui le contournent — `purge_e2e_accounts.sql` supprime `auth.users` directement, les nettoyages manuels aussi. C'est un artefact d'exploitation, pas un défaut vécu par un utilisateur. L'incident est rétrogradé, pas effacé : les 19 médias restent lisibles, et aligner les outils d'administration sur l'Edge Function reste à faire.

**La cause de mon erreur est un commentaire périmé**, au pire endroit possible : il donnait à lire une suppression incomplète là où elle est complète. Corrigé, avec la mesure et la date.

### Un test là où il n'y en avait aucun

`tests/e2e/suppression-compte.spec.js` (opt-in) crée un compte, y dépose une donnée et un média, déclenche la suppression, puis vérifie **ce que verrait un tiers** : média plus servi, reconnexion refusée. Nécessaire parce qu'une Edge Function se redéploie sans que le dépôt bouge d'une ligne — le dépôt vert ne prouverait rien.

Mutation-testé, et la première mutation était trop faible : remplacer le `POST` par un `GET` faisait échouer l'assertion sur le **code de retour**, pas sur le résultat. La bonne mutation — fabriquer un `{ status: 200 }` sans appeler quoi que ce soit — fait tomber le test sur « le média ne doit plus être servi ». C'est celle-là qui prouve que le test regarde l'effet et non la forme de l'appel.

### Fichiers touchés
`tests/e2e/suppression-compte.spec.js` (nouveau), `scripts/couverture-risque.js` (nouveau), `js/app-02-state-utils.js` (commentaire), `passio_qa_registry.json`, `PASSIO_PRODUCTION_READINESS.md`, `PASSIO_ENGINEERING_LOG.md`.

---

## 2026-08-17 — Boucle 18 : la revue croisée a démoli ma propre migration

La règle du projet veut qu'un changement de RLS passe par un second modèle. Le canal `codex` étant opérationnel, la migration Storage de la boucle 17 y est passée — dossier factuel, mesures, et cinq questions précises, dont celles où j'étais le moins sûr.

**Trois objections sont revenues. Deux étaient justes, et l'une invalidait la migration.** Chacune a été vérifiée avant d'être retenue.

### ① `move` et `copy` ne passent pas par l'INSERT — la migration ne fermait rien

Objection : renommer un objet est un **UPDATE** de sa colonne `name`, pas un INSERT.

Vérifié en production, compte jetable puis nettoyage : déposer dans son propre dossier → 200, puis **déplacer ce fichier vers le dossier d'un autre compte → 200**. `copy` aussi.

La cause est nette une fois qu'on la regarde : l'ancienne policy UPDATE portait `using (owner = auth.uid())` et **aucun `with check`**. Postgres réutilise alors `using` pour la nouvelle ligne — et l'owner ne change pas lors d'un renommage. La version 1 fermait la porte d'entrée en laissant la fenêtre ouverte.

Corrigé : la condition de chemin est désormais une **fonction unique**, appliquée à l'INSERT *et* à l'UPDATE. Deux expressions recopiées finissent toujours par diverger.

### ② `allowed_mime_types` aurait réintroduit un défaut déjà corrigé

Objection : rien ne prouve que le client envoie les types que je liste.

Vérifié dans le code, et c'est pire que l'objection. Trois chemins d'envoi légitimes portent un type hors de ma liste : le repli explicite sur `application/octet-stream` (app-08 ~2709), un `file.type` **vide** quand le navigateur ne sait pas typer (app-09 ~874), et `audio/webm;codecs=opus` dont le suffixe n'est pas retiré — contrairement à la ligne 957 du même fichier, qui le fait.

Et l'échec serait silencieux au pire endroit possible : `if (error) return base64Data` recopie le média **en base**. Poser cette liste aurait donc réintroduit `SYNC-B64-005`, le défaut de base64 en base corrigé la veille. La liste est retirée ; seule la limite de taille reste. L'ordre correct est écrit dans la migration : normaliser le type à l'émission, mesurer ce qui arrive, poser la liste ensuite.

### ③ Mon test d'intrusion se serait auto-validé

Objection : le test annexé utilisait `Content-Type: text/plain`. Avec une liste MIME, il aurait été refusé **pour le type** — donc vert — alors même que le cloisonnement de chemin serait cassé. Un test qui passe pour la mauvaise raison. Corrigé : `image/png`, et une propriété isolée à la fois.

### Ce que j'ai nuancé plutôt que retenu

Le chemin fabriqué (`photos/<moi>/../<victime>/x.png`) est **normalisé par le serveur avant enregistrement** : la clé finale est bien celle du dossier de la victime. La RLS devrait donc voir le nom normalisé et refuser. Je ne peux pas le confirmer avant application — c'est inscrit comme vérification à faire, pas comme fait acquis.

### Ce que cette boucle dit du protocole

La revue croisée n'a pas produit une liste de suggestions polies : elle a **invalidé le cœur d'une migration que j'estimais prête**, et la mesure lui a donné raison en trente secondes. Sans elle, j'aurais livré un correctif qui ferme l'INSERT, laisse `move` ouvert, et casse l'envoi de médias au passage — avec le repli base64 pour masquer la casse.

### Fichiers touchés
`migrations/migration_storage_cloisonnement.sql` (version 2, **toujours non appliquée**), `passio_qa_registry.json`, `PASSIO_ENGINEERING_LOG.md`.

---

## 2026-08-17 — Boucle 17 : le Storage acceptait n'importe quoi, de n'importe qui

### Les premières mesures réelles de latence perçue

Sept clics de production portent désormais `meta.ms` : **16, 18, 19, 22, 29, 33, 62 ms**, sur un Android/Chrome réel — navigation entre écrans et filtres d'humeur. La chaîne fonctionne donc de bout en bout **en production**, et pas seulement dans les tests.

Sept points depuis un seul appareil n'autorisent **aucun percentile**. Le readiness reste sur « instrumentée, premiers points » et n'annoncera un p50/p95 qu'avec de quoi le calculer. Ce qu'on peut dire : rien dans ces valeurs ne contredit une interface qui répond vite.

### Une question jamais posée : les seaux publics le sont-ils aussi en écriture ?

La lecture publique est un choix d'architecture assumé. L'écriture, elle, n'avait jamais été regardée. La policy disait :

```
with check (bucket_id in ('content','attachments') and auth.role() = 'authenticated')
```

**Aucune contrainte de chemin, aucune de type.** Et les deux seaux n'ont ni `file_size_limit` ni `allowed_mime_types`.

Vérifié plutôt que déduit, avec un compte jetable puis nettoyage complet : déposer un `text/html` dans un seau de médias → **200**. Déposer un fichier **sous le dossier d'un autre compte** → **200**. Relire les deux **sans aucun jeton** → **200**.

**Nuance qui abaisse la gravité, et qu'il faut dire** : Supabase a servi le HTML en `text/plain`. Un fichier déposé ne s'exécute donc pas dans le navigateur — ce n'est **pas** un XSS stocké. Restent deux choses réelles : n'importe quel compte peut écrire sous le dossier de n'importe qui (ce qui fausse au passage toute attribution par dossier — c'est exactement ainsi que raisonne `purge-e2e-storage.js`), et n'importe quel compte peut obtenir une URL publique permanente, sur le domaine du projet, pour un fichier de n'importe quel type et n'importe quelle taille. Sur une beta ouverte, c'est un hébergement gratuit offert à tout venant.

### Le piège que la contre-épreuve a évité

Le réflexe naturel — « le second segment du chemin doit être l'uid de l'auteur » — **aurait cassé la messagerie**. Les deux seaux n'ont pas la même convention :

```
content     : <categorie>/<uid>/<fichier>
attachments : attachments/<conv_id>/<fichier>
```

Vérifié sur les 70 fichiers réels avant d'écrire quoi que ce soit : la convention est uniforme dans chaque seau, et les fichiers qui ne « matchent » pas aujourd'hui pointent vers des comptes ou des conversations **supprimés** — pas vers un autre format. La règle proposée n'aurait donc refusé aucun envoi légitime au moment où il a eu lieu.

Second piège écarté : pour `attachments`, la condition passe par `is_conv_member` (vérifié `SECURITY DEFINER`) plutôt que par un `select … from conv_members`. La RLS de cette table s'appliquerait **dans la sous-requête** — une policy de lecture plus stricte demain renverrait un ensemble vide, c'est-à-dire les pièces jointes cassées pour tout le monde, sans un mot dans les journaux.

### Préparée, non appliquée

`migrations/migration_storage_cloisonnement.sql` est écrite, commentée, avec sa section « vérifier après » et le test d'intrusion prêt à coller dans `authz-critical` — **une fois la migration appliquée, jamais avant** : un rouge connu dans le gate finit par faire désactiver le gate. Conformément aux règles de la nuit, **elle n'est pas appliquée** : c'est un changement de RLS.

Elle ne referme pas la lecture. Les seaux restent publics, donc `MEDIA-COMPTE-SUPPRIME-010` reste ouvert : fermer la lecture demande des URLs signées, soit une autre architecture d'affichage.

### Fichiers touchés
`migrations/migration_storage_cloisonnement.sql` (nouveau, **non appliqué**), `passio_qa_registry.json`, `PASSIO_ENGINEERING_LOG.md`.

---

## 2026-08-17 — Boucle 16 : mon propre gate bloquait `main`

La CI était **rouge sur `main`**. Cause : `audit:tests` signalait `user-state-horodatage.spec.js` — « n'appelle aucune fonction de production ».

Le constat était exact, et le verdict faux. Ce spec vérifie un **trigger en base** (`trg_user_state_horodatage`) par appels REST bruts, exactement comme `authz-critical` vérifie des policies RLS. Ces specs-là sont même les plus précieux : ils prouvent que la garantie tient **quel que soit le client**, y compris un client hostile qui n'exécuterait aucune de nos fonctions. Les signaler comme creux était un faux positif — et un outil qui crie au loup finit ignoré, ce qui est précisément ce que ce gate est censé empêcher.

L'allowlist accueille donc une seconde catégorie, nommée explicitement : les **frontières tenues par la base**, à côté des artefacts de build. Le spec n'est pas de moi ; le gate si.

### Ce que rendre la CI verte impliquait

Débloquer `main` n'est pas neutre ici : la CI verte **déclenche le déploiement**, et la file d'attente contenait un changement de synchronisation d'une autre session (`ea6d507`, l'horloge du client ne fait plus autorité sur `user_state`) dont la garantie repose sur un trigger. Déployer le client sans le trigger aurait été le pire des deux mondes.

Vérifié avant de pousser, dans la base de production : `trg_user_state_horodatage BEFORE INSERT OR UPDATE ON public.user_state`, actif. La dépendance existe, le déploiement est sûr de ce côté.

### Fichiers touchés
`scripts/audit-tests-creux.js`, `PASSIO_ENGINEERING_LOG.md`.

---

## 2026-08-16 — Boucle 15 : le stockage, troisième table remplie par ses propres tests

Après la télémétrie et les erreurs, le même motif une troisième fois — et cette fois il coûte du disque et laisse des fichiers dans un seau **public**.

### 174 fichiers de test dans le seau public

Sur 244 fichiers du Storage, **198 n'étaient référencés par aucune ligne** de la base. Le chiffre brut ne veut rien dire tant qu'on n'a pas regardé : une première requête en annonçait 221 pour 108 Mo, parce qu'elle ignorait les colonnes `jsonb` (`posts.vlog`, `overlays`, `cdv_live_steps.photos`) et `conv_messages.content`. Recompté en cherchant chaque nom de fichier dans **l'intégralité** des lignes : 198 orphelins, 35 Mo.

Leur nature saute aux yeux dès qu'on regarde les tailles : **90 fichiers créés le jour même pesaient 3 330 octets à eux tous** — des GIF de 37 octets, le 1×1 transparent des fixtures de test, rangés sous des dossiers d'UUID de comptes jetables. Le `global-teardown` supprimait les comptes ; les fichiers restaient.

### Pourquoi la purge existante ne pouvait pas les nettoyer

`purge_e2e_accounts.sql` vide 23 tables puis supprime les comptes. Ajouter `delete from storage.objects` échoue : **Supabase l'interdit** par un trigger (`storage.protect_delete` — « Direct deletion from storage tables is not allowed »). Le nettoyage des médias passe obligatoirement par l'API Storage. D'où `scripts/purge-e2e-storage.js`, branché sur le teardown après la purge des comptes.

**Le garde-fou central est le seuil de taille** : on ne supprime que des fichiers de moins de 1 Ko appartenant à un compte qui n'existe plus. Une vraie photo ne pèse jamais 37 octets — ce seuil rend *mécaniquement* impossible d'effacer du contenu d'utilisateur, y compris si la détection d'orphelin se trompe.

Résultat mesuré : 174 fichiers supprimés (244 → 70), puis suite complète relancée — **70 → 70, zéro petit fichier restant**. Les 6 fichiers créés pendant l'exécution ont été nettoyés par le teardown. La fuite est fermée et la fermeture est prouvée.

### Ce que je ne traite pas, et pourquoi

**19 fichiers, 81 Mo, appartiennent à des comptes supprimés et sont conservés.** Ce ne sont pas des fixtures : des vidéos de 30 Mo, des avatars, des photos. Le script les compte et les affiche, il n'y touche pas — leur sort est une décision humaine, pas la conséquence d'un script de nettoyage de tests.

Et ils posent une question qui dépasse le ménage. Vérifié en récupérant l'URL publique **sans aucun jeton** : `http 200`, 249 415 octets. **Le média d'un compte supprimé reste servi publiquement.** Le seau `content` est public par conception, donc toute URL l'est ; le point n'est pas là. Le point est que **la suppression d'un compte n'emporte pas ses médias**, qui restent accessibles indéfiniment à qui a connu l'adresse. Pour un réseau social qui vise une beta publique, c'est un sujet de confidentialité à trancher — noté dans le registre, pas corrigé à la volée.

### Fichiers touchés
`scripts/purge-e2e-storage.js` (nouveau), `tests/e2e/global-teardown.js`, `package.json`, `PASSIO_ENGINEERING_LOG.md`, `passio_qa_registry.json`.

### Vérifications exécutées
Suite complète `PASSIO_E2E_MULTI=1` : **180 passés, 1 flaky** (notification cross-compte), 1 skipped. Comptage Storage avant/après la suite : 70 → 70.

---

## 2026-08-16 — Boucle 14 : l'observabilité se mesurait elle-même

Le plan était clos, les quatre conditions du readiness soit traitées soit bloquées sur une décision. Restait à regarder ce que la production dit d'elle-même. Elle disait surtout du bruit — le nôtre.

### La table d'erreurs était occupée par ses propres tests

En tête du monitoring de production : « `Uncaught SyntaxError: Failed to execute 'dispatchEvent' … Unexpected token ')'` » — **55 occurrences, 55 clients distincts, la plus récente du jour**. De quoi croire à une panne de masse.

Origine réelle : `source = 127.0.0.1`, pile portant `eval at evaluate` et `NodeList.forEach`. La signature de Playwright. Et l'erreur elle-même est **souhaitable** : `echappement.spec.js` secoue le DOM avec une charge hostile ; correctement échappée, elle rend le handler inline non compilable, et ce `SyntaxError` **est la preuve que l'attaque est inerte**.

Le défaut n'était donc pas l'erreur mais sa destination. `report()` dans `platform.js` avait un plafond anti-spam de 5 par session et **aucune barrière d'environnement** : chaque exécution locale écrivait dans la table de PRODUCTION. Corrigé sur le modèle retenu pour la télémétrie le matin même — localhost ne remonte plus, `?monitoring=1` force la remontée pour déboguer la chaîne.

Deux directions testées, parce qu'un filtre qui bloquerait *tout le monde* ressemblerait à un filtre qui marche : 0 remontée en local, 1 avec l'indicateur, message transmis. Mutation appliquée (garde retirée) → le premier test tombe. La règle d'hier tient.

### Ce que le nettoyage a révélé

Après purge de 70 lignes locales puis de 5 piles Playwright restantes : **34 erreurs, aucune postérieure au 11 août, et la plus récente est encore du bruit local**. Autrement dit — et c'est une information, pas une absence d'information — **aucune erreur réelle de production depuis cinq jours**. Elle était invisible sous le bruit.

Au passage, un candidat qui semblait sérieux s'est dégonflé à la lecture : `Cannot read properties of null (reading 'getZoom')`, 5 clients distincts, récent. Sa pile portait `predicate` — le nom interne de `waitForFunction`. Encore Playwright. **Lire la pile avant de crier au bug** : c'est ce qui sépare un incident d'une fausse alerte.

### Mes propres tests polluaient aussi

Les deux tests de latence écrits la boucle précédente utilisaient `?telemetry=1` et déposaient une dizaine de lignes `development` dans la table de production à chaque exécution — 128 s'y étaient réaccumulées après la purge du matin. Rendus hermétiques par interception réseau (`page.route`, réponse 201 pour ne pas déclencher la file de reprise). Vérifié en comptant avant/après : **138 → 138, zéro ligne écrite**, tests toujours verts.

`telemetrie-preauth.spec.js` continue d'écrire, délibérément : son objet même est le vrai aller-retour serveur (l'incident TEL-IDENT-002 se mesurait en codes HTTP). Le dégrader pour gagner deux lignes serait un mauvais échange, et c'est écrit plutôt que corrigé en silence.

### Toujours pas de p50/p95

L'instrumentation de latence fonctionne (27 ms relevés). Mais **aucun clic de production depuis le déploiement** : le dernier date de 15 h 01, le déploiement de 18 h 30. Le readiness continue donc de porter « instrumentée, pas encore observée ». Il n'y a pas de chiffre à donner, et je n'en fabrique pas.

### Le flaky du « j'aime » : trouvé, et c'était le harnais

Les tests de like ont floté aux **trois** exécutions complètes de la nuit. Un motif, pas du hasard.

Le diagnostic posé en boucle 13 visait `waitForFunction` — mais l'échec tombait plus tôt, sur `waitForSelector` : le bouton n'apparaissait jamais. Diagnostic étendu à cette attente, puis reproduction sous charge (8 workers × 4 répétitions). Verdict littéral : **`{"dansEtat":false,"nbSupabase":54}`**.

54, c'est exactement le nombre de posts de la table de production. Une requête du boot encore en vol se résolvait **après** le seed et **remplaçait** `state.supabasePosts`, emportant le post injecté. Le fixture apparaissait puis disparaissait.

Correction à la cause : attendre que cette requête ait atterri **avant** de semer — après elle, plus personne ne remplace le tableau. Le seed est aussi devenu idempotent (rejouable sans doublon) avec un réessai en second rideau, et une attente bornée pour rester valide hors ligne.

**Ce n'est pas un défaut produit** : injecter un post à la main dans une structure que l'application possède et reconstruit est une construction de test ; un vrai post arrive *par* cette requête, jamais à côté d'elle. Dit autrement, on ne rend pas un test vert en le contournant — on lui donne le fixture qu'il croyait avoir.

Mesure, dans les conditions **identiques** à celles de l'échec (8 × 4) : 1 puis 2 échecs sur 68 avant, **68/68 deux fois de suite** après.

### Le garde-fou de commit refusait des messages légitimes

`.git/hooks/commit-msg` (local, non versionné) refuse un sujet commençant par `@` ou `'` — séquelle du commit « `@ feat(cdv): …` » du 2026-07-22, irrattrapable sur une branche protégée. Utile, et mal ciblé : il annonce vérifier **le sujet** mais grep **tout le fichier**. Le message de cette boucle contenait une ligne de corps commençant par `'dispatchEvent'` — refusé à tort.

Recadré sur la première ligne, c'est-à-dire sur ce qu'il documente déjà. Vérifié sur trois cas : sujet `@` → refusé, `auto:` → refusé, message légitime à corps apostrophé → accepté. La protection est intacte, le faux positif a disparu. **Ce hook n'étant pas versionné, il devra être refait sur toute autre machine.**

### Fichiers touchés
`js/platform.js`, `tests/e2e/monitoring-bruit.spec.js` (nouveau), `tests/e2e/latence-percue.spec.js`, `PASSIO_ENGINEERING_LOG.md`. Hors dépôt : `.git/hooks/commit-msg`.

### Données de production modifiées
Purge de `telemetry_events` (138 lignes `development`) et de `client_errors` (75 lignes de bruit local et Playwright). Aucune donnée d'utilisateur réel touchée ; précédent établi les 11 et 16 août.

---

## 2026-08-16 — Boucle 13 : deux blancs comblés — la couverture et la sauvegarde

Les sept points du plan étaient clos. Restaient les quatre conditions du passage à `PUBLIC BETA READY`. Deux ont bougé cette nuit ; les deux autres demandent du trafic réel, pas du travail.

### La couverture fonctionnelle : 66 sur 435, soit 15,2 %

La cartographie refusait d'annoncer un taux, faute de savoir le calculer — position juste à l'époque, plus tenable une fois l'outil écrit.

**Méthode.** Un serveur sert l'application **octet pour octet** et ajoute en fin de `<body>` un enregistreur qui enveloppe les 435 fonctions atteignables par un geste utilisateur. **Aucun fichier de `tests/` n'a été touché**, ni pour produire le chiffre, ni pour l'améliorer. Sans `PASSIO_COUVERTURE=1`, la suite tourne exactement comme avant — vérifié après coup.

**Ce que le chiffre vaut.** Une interaction compte comme couverte dès que sa fonction s'exécute, **même appelée depuis une autre fonction plutôt que par un clic**. C'est la définition la plus généreuse possible : 15,2 % est un **plafond**, pas une borne prudente.

**Trois pièges écartés avant publication.** Une mesure vide se confond avec une couverture nulle → `reuseExistingServer:false` fait *échouer* le démarrage si le port est pris, et le cas s'est présenté dès la première exécution. Une fonction `const f = …` au niveau racine n'est pas une propriété de `window` et compterait comme jamais exécutée (piège connu de `state`) → vérifié, **0 des 435** est dans ce cas. Enfin le dénominateur doit être recalculable : **les 445 annoncés en boucle 12 n'ont pas pu être reproduits**, la règle écrite en donne 435. Mon propre chiffre, corrigé par mon propre outil.

### La sauvegarde : de « aucune » à « complète et vérifiée »

Le readiness portait `NON VÉRIFIÉ` sur la récupération — seul domaine à zéro preuve, coût d'échec total.

**Ce qui bloquait réellement** : `supabase db dump` lance `pg_dump` dans un conteneur. Sans Docker, il échoue. Il sort proprement en code 1, mais laisse à destination **un fichier de 0 octet** — un script qui vérifierait la seule présence du fichier conclurait au succès.

D'où un export par l'API REST, exécuté sur la production : **32 tables (1 104 lignes), 4 comptes, 220 fichiers Storage (173,6 Mo)**. Trois trous comblés en regardant plutôt qu'en supposant : les **comptes** ne sont pas dans `public` (sans eux, l'archive est un jeu de lignes sans auteur) ; les **médias** pèsent 173,6 Mo contre 5,14 Mo de base, soit 97 % du contenu réel ; et PostgREST expose aussi les **vues**, dont trois étaient exportées comme des tables — discriminant vérifié contre `pg_class`, pas deviné.

**Ce qui n'est toujours pas acquis, et reste écrit tel quel** : aucune restauration n'a été exécutée. Ni Docker, ni `psql`, ni base cible ici. Et reconstruire le schéma supposerait de rejouer `migrations/`, connu pour diverger de la production — c'est l'étape qui échouera en premier, donc celle qu'il faut essayer à froid. `docs/RECUPERATION.md`.

### Deux vérifications de contrôle

**Le téléphone à l'inscription n'avait jamais servi.** Aucun des 4 comptes ne porte de numéro. Ni défaut ni preuve : deux comptes viennent de Google (pas de formulaire), un précède la fonctionnalité, le dernier a été créé six minutes après le commit — probablement avant la fin du déploiement. Vérifié une fois pour de bon, par le même chemin REST que l'application : le numéro est **stocké et relisible côté serveur**. Compte jetable purgé, 0 résiduel.

**Le registre était périmé sur `NOTIF-FORGE-009`.** Il le disait « migration prête, non appliquée » ; le journal le disait appliqué. Tranché en interrogeant la base plutôt qu'en croyant l'un des deux documents : la production ne porte plus qu'**une seule** policy INSERT, `with_check (from_id = (select auth.uid())::text)`. Incident clos, registre corrigé. **Plus aucun incident ouvert.**

### Un piège de vérification de plus, à mon compte

`supabase db dump | tail` a renvoyé 0 alors que `supabase` sortait en 1 : **un code de sortie lu après un pipe mesure le dernier maillon**. J'ai failli déclarer un incident « l'outil ment sur son succès » qui n'existait pas. Corrigé par une seconde mesure sans pipe, avant d'écrire quoi que ce soit.

### La latence perçue : instrumentée, pas encore observée

Troisième blanc du readiness. La télémétrie date maintenant chaque clic depuis la **phase de capture** (donc avant tout handler) et joint le délai jusqu'à la **première image peinte** — deux `requestAnimationFrame` enchaînés — dans `meta.ms`.

Ce que ça mesure et ce que ça ne mesure pas : le temps jusqu'au premier rendu, **pas** jusqu'au résultat confirmé par le serveur. Un « j'aime » optimiste peint en 20 ms et se confirme en 300 ; c'est 20 qui est ressenti. L'événement part **après** la peinture pour ne pas doubler le volume de la table, avec un délai de secours d'une seconde — sans quoi tout clic suivi d'un passage en arrière-plan disparaîtrait, `requestAnimationFrame` ne se déclenchant jamais sur un onglet caché.

**Le chiffre n'existe pas encore, et le readiness le dit** : 28 ms relevés en local ne disent rien d'un téléphone sur réseau mobile. Il faut du trafic.

### Le test qui ne testait rien

Les deux tests de latence ont été soumis à mutation avant commit. Le premier a tué la sienne (champ renommé `tel_ms` — un nom que le filtre PII rejette en silence, faute très plausible).

**Le second ne l'a pas tuée.** Il prétendait vérifier le comportement en onglet caché en forçant `document.visibilityState` par `defineProperty` ; il restait vert **après suppression du filet de sécurité qu'il gardait**, parce qu'en headless `requestAnimationFrame` continue de tourner malgré cette propriété. Un test creux, du type que `audit:tests` n'attrape pas — il vérifiait bien du code de production, simplement pas celui qu'il annonçait.

Réécrit pour neutraliser `requestAnimationFrame` lui-même, et surtout pour **asserter que le chemin visé est bien emprunté** (`window.__rafDemandes > 0`) : sans cette vérification, on retombe dans le même piège d'un cran plus loin. Il tue maintenant sa mutation. La règle en est tirée dans le skill `new-test`.

### Fichiers touchés
`scripts/couverture-{interactions,rapport,mesure}.js`, `scripts/serve-couverture.js`, `scripts/sauvegarde-donnees.js`, `playwright.config.js`, `package.json`, `.gitignore`, `docs/RECUPERATION.md`, `js/telemetry.js`, `tests/e2e/latence-percue.spec.js`, `PASSIO_FUNCTIONAL_MAP.md`, `PASSIO_PRODUCTION_READINESS.md`, `passio_qa_registry.json`, skills `new-test` et `sauvegarde`.

### Le flaky : diagnostiqué, pas expliqué

Deux exécutions complètes ont produit un flaky sur `interactions.spec.js`, avec pour seule information `TimeoutError: waitForFunction 15000ms`. L'attente en cause est `attendreFilStable`, et les causes possibles appellent des corrections **opposées** : un fil qui se re-rend en boucle n'est pas un post disparu du DOM.

**Non reproduit** : 8 workers × 3 répétitions (51 tests), verts deux fois de suite. Aucune cause n'est donc avancée. À la place, l'attente compte désormais ses sondages, ses remplacements de nœud et ses absences, et les rapporte dans le message d'échec — la prochaine occurrence désignera sa cause au lieu de nous laisser deviner.

### Le déploiement, vérifié dans le bon artefact

`origin/main` à jour ne vaut pas prod à jour. Vérification faite sur le contenu réellement servi : `{tag:t.tagName.toLowerCase(),ms:e}` et le `requestAnimationFrame` imbriqué sont présents. **J'ai d'abord cherché dans `app.js`** — mauvais artefact, `telemetry.js` étant inliné dans `index.html` au build (et `/js/telemetry.js` répond 404 en production). C'est le piège déjà consigné, refait une fois de plus : chercher un littéral, oui, mais dans le fichier qui le contient.

### Vérifications exécutées
Suite complète `PASSIO_E2E_MULTI=1`, deux fois — avant la modification de télémétrie (**175 passés, 1 flaky**) et après (**176 passés, 2 flaky, 1 skipped** sur 179). Flaky : publication d'étape CDV, et annulation du ❤️ optimiste ; verts au réessai, à surveiller. Les 4 audits statiques verts, build prod OK, 0 compte e2e résiduel.

---

## 2026-08-16 — Boucle 12 : les deux derniers livrables du plan

### Ce qui manquait
Le plan initial listait sept livrables. Cinq existaient ; `PASSIO_FUNCTIONAL_MAP.md` et `PASSIO_PRODUCTION_READINESS.md` manquaient encore. Produits ici à partir du dépôt réel — 8 écrans, **445 interactions distinctes** relevées depuis les handlers inline, 34 tables, 25 specs, 175 tests déclarés.

### Le choix qui compte dans la cartographie
Elle **ne donne pas de taux de couverture fonctionnelle**, et le dit. L établir exigerait de relier chacune des 445 interactions au test qui l exerce. Le nombre de specs ne s y substitue pas : 52 tests sur CDV ne disent rien du nombre d interactions CDV couvertes. Annoncer un pourcentage aurait été exactement le chiffre de complaisance que le reste de cette qualification s interdit.

Ce qu elle donne à la place : la liste des propriétés **réellement prouvées**, chacune avec le test qui la prouve.

### Verdict de production readiness
**CONTROLLED BETA READY**, inchangé — mais ce sur quoi il repose a changé. Autorisation, confidentialité, intégrité et cross-compte sont **prouvés**. Trois domaines restent faibles : latence perçue (non mesurée), montée en charge (plans vérifiés mais aucun test à volume), et **récupération — aucune restauration de sauvegarde jamais exécutée**, seul domaine à zéro preuve.

Quatre conditions pour passer à PUBLIC BETA, aucune ne demandant de refactoring : latence réelle, couverture établie, une restauration éprouvée, un test à volume.

---

## 2026-08-16 — Boucles 9 à 11 : deux fermetures P1, et trois de mes conclusions démenties

*(Rattrapage : ces trois boucles n'avaient pas été consignées au fil de l'eau, contrairement à la règle. Le manquement est noté ici plutôt que masqué par une réécriture de l'historique.)*

### Ce qui a été fermé

**`NOTIF-FORGE-009` (P1) — appliqué en prod.** `notifications` était scellée en lecture et grande ouverte en écriture : `INSERT` valait `true`, en double. N'importe quel compte pouvait déposer une notification vers n'importe qui, au nom de n'importe qui. La contrainte portait sur le mauvais côté — une notification est cross-compte par nature, donc `user_id` ne *pouvait* pas être contraint ; c'est l'auteur qu'il fallait tenir. Gate à 13 invariants.

**`auth_rls_initplan` — 3 policies corrigées, gain mesuré 11,6 → 1,1 ms** sur `conv_messages` (50 lignes). Les 7 policies de lecture restantes sont préparées.

**Registre machine remis à niveau.** Il était resté à 3 incidents pendant que le tableau humain en comptait 9 — deux sources de vérité divergentes, ce que le cadrage interdit.

### Trois conclusions à moi, démenties par la mesure

**La baseline de performance était fausse.** Publié : landing 3 946 ms, 2 575 ms de tâches longues. Réel, machine au repos, médiane de 3 : **1 501 ms et 728 ms**. Gonflé 3,5× parce que ma mesure d'origine tournait pendant la suite complète. Il n'y a pas de problème de démarrage — et deux investigations entières (couverture JS, hypothèse CSS) avaient été menées sur cette prémisse fausse.

**Le découpage du JS n'est pas un levier.** Coût d'injection des 9 fichiers : **133 ms au total**, dont 24 pour le candidat. V8 pré-parse paresseusement : les 1 367 Ko jamais exécutés ne coûtent presque rien. La couverture à 20 % était exacte mais non actionnable.

**« Le planificateur remonte déjà `auth.uid()` » était faux.** La policy de `posts` utilisait déjà `(select auth.uid())` — c'est l'enveloppe qui produisait l'`InitPlan`. Contre-épreuve : `stories`, même forme mais appel nu, n'en a aucun. Erreur d'attribution : j'avais lu un plan optimisé sans vérifier pourquoi il l'était.

### Deux erreurs d'exécution, rattrapées par le contrôle

Un `drop policy` sur un **nom deviné** n'a rien supprimé : les anciennes policies sont restées, se combinant en OU, bénéfice nul. J'avais pourtant écrit cette précaution exacte dans la migration des notifications deux heures plus tôt.

Et la contre-épreuve du test de notification échouait en 403 — pas la migration, mais `Prefer: return=representation` qui fait retomber le `RETURNING` sous la policy `SELECT`.

### Le motif de recherche que la nuit a dégagé

Trois défauts se sont révélés être **le survivant d'un correctif incomplet** : le base64 expurgé pour les profils passion mais pas pour le compte, `supaLoadPosts` absent d'une liste de 24 stubs, et 3 policies alors que 4 autres avaient déjà l'enveloppe.

**Quand un correctif existe quelque part, chercher où il n'a pas été appliqué.** Plus productif que relire du code au hasard — et c'est ce qui a produit le cadrage « 85 avertissements = 10 policies réelles ».

---

## 2026-08-16 — Boucle 8 : outiller la détection des tests creux

### Tentative de revue croisée — interrompue, et rapportée comme telle
Un quatrième tour a été envoyé à ChatGPT pour faire challenger les décisions de la nuit, **en particulier les renoncements** (les 85 policies, la file de télémétrie non partitionnée, les index « inutilisés » conservés, l'option C maintenue, le sujet performance déclaré clos). Le message est parti (5 969 caractères, il est dans le fil) ; la réponse s'est interrompue après 5 caractères et l'onglet est devenu irrécupérable — la conversation dépasse 60 000 caractères et le rendu ne répond plus, même à `1+1`.

**Aucune analyse reçue, donc aucune rapportée.** Reprendre la boucle exigera un fil neuf.

### `audit-tests-creux.js` — répondre soi-même à la question posée
La question la plus utile du tour 4 était : comment détecter les tests creux à l'échelle d'une suite de 161 tests, sans les relire un par un ? Faute de réponse, elle a été traitée directement.

Le script croise les identifiants appelés dans les `page.evaluate` avec les fonctions réellement définies dans `js/`. Un spec qui n'en touche aucune ne peut, par construction, que vérifier ses propres constructions.

**Le travail n'a pas été d'écrire la détection, mais de la rendre crédible.** En version brute elle signalait `cadrage.spec.js` (qui boote la vraie app puis mesure du CSS) et `version-skew.spec.js` (qui vérifie des artefacts de build) — deux faux positifs. Trois exemptions plus tard : **0 faux positif sur 23 specs, et un spec creux fabriqué bien détecté.**

C'est la leçon des 133 fausses anomalies du tableau d'intégrité, appliquée à soi-même : un outil qui crie au loup finit désactivé, et un outil désactivé ne vaut rien.

Câblé dans la CI **avant** l'installation de Playwright — il échoue vite et pour une raison lisible.

Ce qu'il ne prétend pas faire : mesurer la couverture. Il attrape le cas franc, celui qui coûte le plus cher parce qu'il est invisible.

---

## 2026-08-16 — Boucle 7 : advisors, index oubliés, et une course fetch/temps réel

### Remesurer APRÈS avoir corrigé
Advisors Supabase interrogés après mes migrations. Deux enseignements opposés.

**Ce qui va** : mes deux fonctions `SECURITY DEFINER` n'apparaissent pas — le `revoke execute` a pris ; la table `passions` non plus — RLS active avec sa policy. Les 9 avertissements de sécurité sont ceux déjà documentés comme délibérés.

**Ce que j'avais laissé** : sur 7 clés étrangères sans index de couverture, **cinq venaient de ma propre migration des passions**, posées quelques heures plus tôt. Corrigé et vérifié (7 index).

**Ce que je n'ai pas fait, et pourquoi** : 85 `auth_rls_initplan` (`auth.uid()` réévalué par ligne) + 42 `multiple_permissive_policies`. Correctif mécanique mais portant sur ~85 policies — la seule frontière de sécurité de l'app. Impact nul aujourd'hui, réel à l'échelle. Et les 13 index « inutilisés » restent en place : sur une beta à faible trafic, c'est une absence de preuve, pas une preuve d'absence.

### `FEED-RT-007` — un post temps réel effacé par une requête plus ancienne
Scénario multi-appareil n° 1 de l'analyse croisée. `startFeedRefreshLoop` écrase `state.supabasePosts` avec un instantané serveur pris **avant** l'arrivée du post ; seul `_feedExtraPosts` survit, et le handler temps réel ne l'alimentait pas. Le post s'affichait puis s'effaçait jusqu'au cycle suivant — auto-réparant, donc jamais remonté comme une perte.

Prouvé en A/B : `survitAvantCorrectif: false`, `survitApresCorrectif: true`.

**Le point de méthode de cette boucle** : mon premier test passait… en recopiant les deux lignes du correctif au lieu d'appeler le vrai code. Il aurait passé même après retrait de la correction. D'où l'extraction de `feedAddRealtimePost()` — non pas par goût du découpage, mais parce qu'**une logique enfermée dans un callback ne peut être testée qu'en la recopiant, et un test qui recopie ce qu'il vérifie ne garde rien.**

### Vérifié correct, non modifié
L'idempotence de la publication : un conflit de clé primaire au réessai est déjà interprété comme « déjà enregistré », à cinq endroits. Troisième résultat négatif de la nuit.

---

## 2026-08-16 — Boucle 6 : isolation en invariant, et la suppression qui ne tenait pas

### L'isolation à la déconnexion devient un invariant
Le test existant nommait deux clés. Un test qui nomme ses clés ne voit pas arriver la suivante : le jour où une fonctionnalité écrit une clé de compte oubliée dans `ACCOUNT_SCOPED_KEYS`, il reste vert pendant que la donnée fuit vers le compte suivant. Réécrit en invariant — après déconnexion, il ne doit subsister que des clés d'**appareil**.

Couvre enfin les files `passio_pending_user_state*`, suffixées par compte donc impossibles à lister en dur, et qui portent le blob d'état complet. Vérifie aussi l'inverse : la purge ne doit pas emporter le contrôle parental, sous peine d'offrir un contournement en un clic.

Double vérification d'absence de test creux : `ACCOUNT_SCOPED_KEYS` est bien exposée (11 clés — sans quoi le semis n'aurait rien écrit), et une clé volontairement oubliée est bien détectée.

### `CONV-RESUR-006` — une suppression de message pouvait être annulée
Scénario multi-appareil n° 2 de l'analyse croisée, **reproduit** : une conversation et un message privé supprimés revenaient après redémarrage. `localStorage` s'écrit en synchrone, IndexedDB en asynchrone best-effort (résultat jamais lu) ; la fusion au boot, faite pour ne jamais perdre un message, défaisait les suppressions.

Ce n'était pas une erreur de conception — l'union corrigeait l'inverse. Le défaut : aucun des deux stores ne distinguait « jamais existé » de « supprimé ».

Corrigé par un journal de suppressions **borné** (TTL 30 j, 2 000 entrées), filtrage en un seul point à la sortie de la fusion, clé inscrite dans `ACCOUNT_SCOPED_KEYS`.

**Le test qui compte le plus n'est pas le principal, c'est la contre-épreuve** : un message présent dans un seul store et *non* supprimé doit continuer d'être récupéré. C'est la propriété que l'union protégeait, et un journal trop zélé l'aurait détruite en silence. C'est le vrai risque de ce correctif, pas l'inverse.

Réserve initiale levée par la vérification, pas par l'attente : le risque portait sur une modification **non vérifiée** du store des messages privés.

### Décisions déléguées, tranchées
- **ADR-007** reste en **option C**. La délégation ne crée pas un besoin qui n'existe pas.
- **ADR-008** : option B **implémentée**.

### Bilan
160 e2e passés (0 flaky), 12 cross-compte, 3 audits, build OK. `origin/main` à jour.

---

## 2026-08-16 — Boucle 5 : la performance, mesurée puis corrigée à la source

### Le poids n'était pas le problème — et le chiffre fautif venait de moi
« 1,84 Mo de JS », écrit dans l'audit conjoint, était la **source non minifiée**. Réel servi : **≈ 355 Ko** transférés (HTML 33 Ko + app.js 287 Ko + CSS 34 Ko). Aucune optimisation de poids ne se justifie.

Le coût est sur le processeur : sous bridage CPU ×4, **11 tâches longues cumulant 2 575 ms**, la plus longue à 496 ms.

### Profilage : un résultat NÉGATIF, et il compte
Profil CPU au niveau fonction : aucune fonction applicative ne domine (`_measureAppVh` 32 ms, `defaultState` 13 ms — négligeables). Le temps part dans `(program)`, c'est-à-dire le parse/compile V8 du monolithe et le layout.

Conclusion : **il n'y a pas de gain facile**. Le seul levier serait le découpage par univers, qui casserait le modèle de hoisting — exactement ce que l'analyse croisée recommandait de ne pas faire. Le sujet est donc **clos**, pas laissé ouvert en « l'app est lente ». *(Réserve : le profil inclut la surcharge de l'instrumentation Playwright — les valeurs absolues sont majorées.)*

### La vraie trouvaille est venue des données de production
`p50`/`p95` calculés sur la télémétrie réelle. Le pire endpoint n'était pas devinable :

```
/functions/v1/…    n= 70   p50= 894   p95= 4337
/rest/v1/user_state n=757  p50= 156   p95= 2844   max= 43199
```

`user_state` — 80 lignes, 10 Mo. **État médian 1 288 octets, plus gros état 4 731 kB** : un facteur 3 700×. Dans ce blob, `avatarPhoto` et `coverPhoto` en **base64, 2 352 kB chacune** — 99,7 % du contenu, renvoyé à chaque synchronisation.

Violation directe d'un invariant documenté (ADR-004 : jamais de base64 en base). Et le plus instructif : **`_syncableState()` expurgeait déjà le base64… mais seulement pour les profils passion**, pas pour les photos du compte. Quelqu'un avait identifié la classe de bug et traité un seul des deux emplacements. La mesure a trouvé le survivant.

Correctif à la **frontière de synchronisation** — un seul endroit qui couvre tous les producteurs présents et futurs, même raisonnement que pour la télémétrie. Une seule ligne sur 80 était concernée ; aucune mutation de données n'est nécessaire, la prochaine synchronisation de cet appareil réécrira l'état expurgé par-dessus.

`tests/e2e/etat-sync-base64.spec.js` vérifie les deux emplacements, que les URL Storage passent bien (les expurger casserait la synchro cross-appareil) et que la photo reste intacte en mémoire. **Mutation-testé** : sans le correctif, il échoue sur la bonne assertion.

### Piège de vérification rencontré
`git checkout <fichier>` restaure depuis l'**index** — or le hook `PostToolUse` y a déjà indexé la modification. Le premier test de mutation a donc tourné *avec* le correctif et l'a déclaré valide à tort. Il faut `git checkout HEAD -- <fichier>`.

---

## 2026-08-16 — Boucle 4 : les trois migrations appliquées en production

Benjamin a levé la réserve (« fait tout ») : les migrations préparées la nuit précédente sont passées en prod, chacune avec contrôle avant/après.

**Référentiel des passions** (ADR-007, option C) — 19 passions, **5 clés étrangères**, RLS en lecture seule vérifiées en base. Aucune policy d'écriture : un client ne peut pas déclarer une passion pour la légitimer ensuite.

**Identité d'affichage canonique** — 4 triggers d'écriture, 1 de propagation, 4 index, 2 fonctions. Le fichier a d'abord été **rejeté en bloc** : `CREATE INDEX CONCURRENTLY` est interdit dans le bloc transactionnel du CLI (25001). Rejet atomique, donc rien d'appliqué à moitié. Repassé en index simples — la plus grosse de ces tables porte 16 lignes, le verrou dure des microsecondes. Le fichier documente qu'il faudra revenir à `CONCURRENTLY`, un ordre à la fois, quand les volumes le justifieront.

Backfill : **22 lignes réalignées** (video_lives 5, event_comments 15, step_interactions 2). Il y avait donc bien des noms d'affichage divergents de la source canonique.

**Purge du bruit de télémétrie** — 44 960 lignes `development` supprimées, `production = 10 532` intacte, vacuum passé.

**Invariant anti-usurpation ajouté au gate** — maintenant que le trigger existe, `authz-critical.spec.js` le prouve : un compte qui insère un live avec le nom et la photo d'un tiers voit ces champs **réécrits** depuis son propre profil, à l'INSERT comme à l'UPDATE. Le gate compte 11 invariants.

---

## 2026-08-16 — Boucle 3 : hygiène de la télémétrie et stabilisation du harnais

### `TEL-NOISE-004` — 79 % de la table de télémétrie était du bruit de test

Mesuré en prod : `development` 40 625 événements (dernier 16/08 04:55) contre `production` 10 532 (dernier 15/08 17:55).

Cause : il n'existe **qu'une seule base Supabase**, et la télémétrie était active **par défaut** sur localhost. Les ~15 specs e2e chargent l'app à chaque exécution → chaque passage de la suite écrivait dans la table de production.

Le dashboard filtrait déjà sur `env=production`, donc **il restait honnête**. Ce qui ne l'était pas : la taille de la table, son coût, et toute analyse SQL directe — celle qu'on fait justement en audit.

Aggravation dont je suis l'auteur : le correctif `TEL-IDENT-002` de la boucle 2 a transformé du bruit *rejeté* (identité fabriquée → 401) en bruit *stocké* (`user_id: null` → 201). Le volume a bondi pendant la nuit.

Correctif : en local, opt-in **explicite** (`?telemetry=1`), plus d'activation par défaut. Deux tests gardent les deux sens dans `tests/e2e/telemetrie-preauth.spec.js` — l'un vérifie qu'un envoi forcé part correctement, l'autre qu'**aucun** envoi ne part quand on n'a rien demandé. Sans ce second garde, la pollution reviendrait au premier qui rétablirait le défaut.

Purge de l'accumulé préparée (`migrations/purge_telemetry_development.sql`), non exécutée — destructive. **À passer APRÈS déploiement du correctif**, sinon la prochaine suite e2e reconstitue le bruit.

### Harnais e2e — flaky éliminé

Trois causes, dont deux hypothèses rejetées par la mesure. Détail et pièges : mémoire `playwright-pieges-flaky`. Sous stress : 30 → 64 passés sur 68.

**Correction d'une affirmation trop rapide.** J'ai écrit « 154 passés, 0 flaky » sur la foi d'**une seule** exécution. L'exécution suivante en a montré 1 (`interactions.spec.js:165`). Le bilan honnête est donc : flottement **réduit** — de systématique (3 exécutions sur 3 avant correctif) à intermittent (1 exécution sur 2) — **et non éliminé**. Un seul passage vert ne prouve rien sur un défaut intermittent : c'est exactement l'erreur que la mesure de référence m'avait déjà évitée quelques heures plus tôt.

Le piège le plus coûteux venait de mon propre correctif : `polling: "raf"` ne se déclenche pas sur une page qui ne compose pas de frames, donc le garde de stabilité expirait sans jamais s'exécuter.

### Incident d'exploitation

Trois fichiers d'une **session Claude parallèle** ont été aspirés dans un de mes commits : `git commit` sans chemin valide tout l'index, que l'autre session alimente via son hook. Sans dégât (rien de perdu, aucun effet prod), mais le commit est mal étiqueté. Règle ajoutée au skill `reprise-autonome` : toujours `git commit -F msg -- <chemins>`, et `git status --porcelain` avant.

---

## 2026-08-15 — Boucle 2 : analyse croisée réelle, puis correction de CI-GATE-001 et TEL-IDENT-002

### Analyse croisée
Deux tours complets avec ChatGPT (compte pro, fil « Analyse croisée PASSIO »). Elle a corrigé **trois erreurs de mon analyse** : F3 n'était pas une race applicative (le flake portait sur le clic de setup) ; `server_reject` n'est pas indépendant ; et surtout mon « 49 % des événements ont perdu leur attribution » était faux — la ventilation par type montre que les NULL sont concentrés sur `session` (99 %) et `perf` (100 %), le comportemental étant à 0 %.

Livrables : `PASSIO_INITIAL_JOINT_AUDIT.md`, `PASSIO_CONTROL_CENTER_AUDIT.md`.

### `CI-GATE-001` — corrigé
`tests/e2e/authz-critical.spec.js` : 9 invariants d'autorisation vérifiés par appels REST bruts, **non skippable**, vert en 2,7 s. Étape dédiée en tête du workflow.

Le blocage supposé (« il faut des identifiants de test en secrets CI ») **n'existait pas** : l'inscription passe par la clé anon, déjà publique côté client par conception Supabase.

Découverte incidente : `posts.author_id` référence `profiles(id)` — un compte sans profil ne peut pas publier (409). Garde d'intégrité utile, trouvé en écrivant le test.

### `TEL-IDENT-002` — cause racine prouvée, corrigée, mesurée

`tests/e2e/telemetrie-preauth.spec.js` tranche par observation réseau sur navigateur vierge. **Avant** :

```
MY_UID = window.MY_UID = passio_uid = u_m8nq4h2b   (aucune session)
20 envois → 20 × HTTP 401
lot de 2 · user_id=[null,"u_m8nq4h2b"] · types=session/perf
lot de 1 · user_id=["u_m8nq4h2b"] · types=connectivity
```

Trois choses prouvées d'un coup : la fenêtre pré-auth est **100 % perdue** ; l'**empoisonnement de lot** est réel (l'événement `null` légitime meurt avec le poison, dans le même insert multi-lignes) ; et l'alarme `server_reject` porte elle-même l'identité fabriquée, donc **se fait rejeter par la cause exacte qu'elle signale**.

Correctif dans `js/telemetry.js` : ne transmettre que ce qui **peut** satisfaire la policy — un UUID d'authentification ; tout le reste part à `NULL`, valeur explicitement tolérée. Désinfection aussi **au flush**, ce qui couvre du même coup le backlog estampillé sous un compte puis rejoué sous un autre.

**Après** : 1 envoi, HTTP 201, `user_id=[null]`, les deux événements sauvés. De 100 % de perte à 100 % de livraison — et la tempête de retries disparaît (batterie et réseau gaspillés chez chaque visiteur).

### `F7` — le score de santé n'est plus une moyenne
`readiness.js` calculait une moyenne pondérée. Deux défauts mesurés sur le code lui-même : **trois bugs critiques ouverts affichaient encore 75/100** (`max(0, 100−3×34) = 0`, puis `(0×25 + 100×75)/100 = 75`), et **aucun facteur d'autorisation n'existait** — une fuite cross-compte totale n'aurait pas déplacé le score d'un point.

Remplacé par `santé = pire domaine critique`, un seul bug critique rougit, 8 canaris sur 9 = ROUGE (pas 89 %), la performance ne peut qu'ambrer, un domaine non mesuré vaut INCONNU. Second chiffre **CONFIANCE**. Le `score` historique reste exposé mais ne peut plus contredire le statut. Le domaine autorisation est alimenté par le dernier passage réel d'AUTHZ-CRITICAL lancé depuis le dashboard ; tant qu'il n'a pas tourné, il vaut INCONNU.

### Décision produit obtenue
`author_name` = **nom ACTUEL du profil** (Benjamin). La migration est donc repensée : dénormalisation maintenue vraie par deux triggers (réécriture à l'écriture + propagation au renommage) plutôt qu'une jointure sur les chemins chauds. Vérifié en prod : **aucun index** n'existait sur `author_id`/`user_id` dans les 4 tables — ajoutés en `CONCURRENTLY`.

### Déploiement vérifié
CI verte (le gate AUTHZ-CRITICAL passe depuis un runner GitHub), déploiement réussi, et **correctif confirmé live en prod**. Piège rencontré : la CI minifie, Terser renomme les variables locales — chercher `authUserId` dans le HTML servi renvoie 0 alors que le correctif est bien là. Seuls les **littéraux** (regex, chaînes) sont des marqueurs valables en prod.

### Reste à faire
Attribution préservée au changement de compte (file partitionnée par identité) : ici on **désattribue** au lieu de détruire, ce qui est strictement mieux mais pas optimal. Version skew PWA (F5) et provenance `passion_id` des interactions (F6) non instruits. Vider la file de A avant l'invalidation de sa session préserverait l'attribution.

### Skills créés
`revue-croisee` (protocole d'analyse croisée + mécanique navigateur non devinable), `reprise-autonome` (travail continu sans supervision).

---

## 2026-08-15 — Boucle 1 : Phase 0 (baseline) + Phase 1a (exploration)

### Contexte
Démarrage de la mission « Production Readiness ». Règle cadre : la première analyse générale doit être **conjointe Claude Code + ChatGPT**, l'agent principal ne devant pas produire seul l'audit complet puis le faire entériner.

### Travail réalisé
- **Phase 0 — baseline factuelle** : état git, syntaxe, 3 audits statiques, build prod, suite e2e par défaut, suite e2e cross-compte réelle, tests backend du dashboard, inventaire RLS de la prod, mesure de la page d'accueil prod.
- **Phase 1a — exploration** : lecture du plan de contrôle `.passio/` (contexte, risques, priorités), de `PASSIO_REPOSITORY_AUDIT.md`, `PASSIO_SYSTEM_MODEL.md`, `PASSIO_CONTROL_CENTER_ROADMAP.md` ; inventaire du centre de pilotage (61 routes API, modules serveur, vues) ; inspection du schéma et des policies réelles en prod.
- **Phase 1b — préparation** : dossier d'analyse croisée rédigé (sans aucun secret), prêt à transmettre.

### Mesures (avant)
Voir le tableau « Baseline mesurée » de `PASSIO_MASTER_CONTROL.md`. Points saillants : 146 tests passés / 1 flaky / 12 skippés ; 89 tests backend dashboard verts ; 11 tests cross-compte réels verts ; RLS active sur 34/34 tables ; accueil prod 123 864 o en 0,76 s.

### Bugs détectés
- `CI-GATE-001` (**P1**) — la CI valide chaque déploiement prod sans jamais exercer RLS / cross-compte / realtime / confidentialité. Les 12 tests « skipped » sont exactement ceux-là (opt-in par variable d'environnement, absente du workflow).
- `TEL-IDENT-002` (**P2**) — la télémétrie abandonne ses lots au changement d'identité. Cause racine établie : `user_id` estampillé à la mise en file, jeton lu au flush ; la policy `WITH CHECK (user_id IS NULL OR user_id = auth.uid()::text)` rejette alors définitivement le lot (`42501`).
- `RACE-LIKE-003` (**P3**) — flaky sur l'annulation d'affichage optimiste pendant reconstruction du fil ; nature non tranchée.

### Bugs corrigés
Aucun. Conformément à la règle de cadrage, aucune modification structurelle avant l'analyse conjointe ; aucun des trois constats n'est un P0 mettant en danger sécurité, données ou intégrité du projet.

### Fichiers touchés
`PASSIO_MASTER_CONTROL.md`, `PASSIO_ENGINEERING_LOG.md`, `passio_qa_registry.json` (créés). Aucun fichier applicatif modifié.

### Blocage rencontré
**La boucle croisée avec ChatGPT n'a PAS pu avoir lieu.** `list_connected_browsers` renvoie une liste vide (extension Claude-in-Chrome non connectée) et le navigateur intégré présente ChatGPT déconnecté ; m'authentifier à la place du fondateur n'est pas une option. Le dossier de transmission est rédigé et prêt. **Aucune analyse de ChatGPT n'est donc rapportée nulle part** — ni ici, ni dans les livrables.

Conséquence directe : `PASSIO_INITIAL_JOINT_AUDIT.md` et `PASSIO_CONTROL_CENTER_AUDIT.md` ne sont **pas** créés. Ce sont par définition des livrables conjoints ; les produire en solo puis les faire relire contredirait la règle cadre de la mission.

### Décisions
1. **Ne pas fabriquer les livrables conjoints** tant que la seconde analyse n'existe pas, plutôt que de les remplir en solo (règle 116 : ne jamais prétendre que ChatGPT a été consulté).
2. **Ne pas afficher de score global** (santé, couverture fonctionnelle, performance) tant que ses composantes ne sont pas mesurées — `NON MESURÉ` plutôt qu'un chiffre arbitraire.
3. **Ne pas corriger `CI-GATE-001` à chaud** : faire tourner les tests cross-compte en CI implique des identifiants de test en secrets GitHub et des écritures dans la base de production depuis la CI — c'est un arbitrage à instruire, pas un `sed` sur un YAML.

### Risques / points à surveiller
- Le vert de la CI est aujourd'hui trompeur sur tout ce qui touche à la confidentialité et au cross-compte : ne pas le lire comme une garantie.
- Les tests cross-compte écrivent dans la base de production ; le nettoyage a été vérifié (0 compte e2e résiduel) mais reste à surveiller à chaque exécution.
- Les hachages d'assets prod (`app.js?v=0d7a125b26`) diffèrent du build local (`0b7e76c726`) : attendu, la CI minifie. **Ce n'est donc pas un indicateur de divergence exploitable** — ne pas en tirer de conclusion.

---

## Session 2026-08-28 → 2026-08-29 — lot UI-7, deux défauts silencieux, réconciliation du plan de contrôle

### Contexte
Ordre de Benjamin : finaliser la cohérence des interfaces (§1 à §11) et aller **jusqu'à la mise en production réelle**, sans s'arrêter à une preview. Puis « travail en continu jusqu'à demain 8h ».

### Ce qui a été livré en production
| PR | SHA | Contenu |
|---|---|---|
| #186 | `6bf75ac` | Lot UI-7 : vocabulaire, Rencontrer, Fil compact, barre supérieure, Profil à trois onglets, parcours Bobine |
| #187 | `c2e3e1b` | Filtre de passions vide = aucun filtre · la passion ne se vide plus en silence au partage d'expérience |

### Deux défauts SILENCIEUX, trouvés en vérifiant autre chose
1. **`SHARE-PASSION-011` (P2)** — `shareEventExperience` forçait `sel.value = ev.passion`. Affecter `select.value` avec une valeur **sans `<option>` correspondante ne lève pas** : le select passe à `""`. Le `try/catch` autour de la ligne ne pouvait rien attraper. Le souvenir partait sans passion, devenait **invisible dans le fil de son propre auteur** et perdait sa provenance en base.
2. **Le filtre de passions du Profil** — « Réinitialiser » *vidait* l'écran au lieu de retirer le filtre, et un compte neuf ne voyait aucune de ses publications. La règle appliquée est celle que le même fichier énonçait déjà quinze lignes plus bas pour les types de contenu ; les deux rangées du même écran se contredisaient.

### Le piège méthodologique de la session
La CI de la PR #187 était rouge sur `ui-v7-parcours.spec.js` ⑦. **L'attribution évidente — « c'est mon dernier commit » — était fausse.** L'A/B (rejouer avec `app-06` remis à l'état de `main`) a montré un échec identique. Le test était flaky **de façon dépendante de l'heure** : il partage la première activité retournée par `_filterIrlEvents`, laquelle change au fil du temps ; quand elle portait une passion de l'utilisateur le select l'acceptait, sinon non. Vert la nuit, rouge le matin, imputé au commit de passage.

> **Règle à retenir** : un test rouge sur une PR ne prouve pas que la PR l'a cassé. L'A/B contre la base coûte cinq minutes et évite de « corriger » du code sain.

### Autres pièges payés (détail dans `CLAUDE.md`)
- **Un titre n'est pas un identifiant d'écran** : `ui-v4a4-outils.js` détectait l'écran IRL en cherchant « IRL » dans `#ctxToolsTitle`. Renommer ce titre en « Filtres » a fait disparaître toute une section, **sans erreur ni exception**. `ContextualTools` publie désormais `pageType()` et `data-ctx-page`.
- **`montrerHint` refuse une ancre sans `offsetParent`** : déplacer « Mes passions » dans un onglet masqué éteignait l'aide contextuelle en silence.
- **`styles.css` est en CRLF** : une réécriture en mode texte Python le convertit en LF et produit un diff de 10 800 lignes. N'y écrire qu'en binaire.

### Mesures
Voir la table « BASELINE MESURÉE (2026-08-29) » de `PASSIO_MASTER_CONTROL.md`. Saillant : **521 passés / 1 flaky / 19 skippés** en CI ; six audits statiques verts ; build OK ; **`interactions.spec.js` 51/51 sans retry**.

### Incidents mis à jour
- `RACE-LIKE-003` → **CLOS**. Le tableau humain disait « cause non établie » alors que le registre machine disait `INFIRME / verified` : **le tableau humain était le périmé**. Mesuré avant d'aligner : 51 exécutions consécutives sans filet de retry, 0 flaky.
- `SHARE-PASSION-011` → **corrigé en prod**, mutation-testé.
- `CONV-FLAKY-012` → **détecté**, cause **non établie** (une seule occurrence). Aucune hypothèse écrite.

### Ce qui n'a PAS pu être fait, et pourquoi
- **`PASSIO_E2E_MULTI=1`, RLS prod, vérification de l'app en ligne** : le proxy réseau de l'environnement d'exécution refuse `passio-app.netlify.app` **et** `njkiyoklssvefstljemx.supabase.co` (`connect_rejected`, politique d'organisation). Ces trois-là sont `NON MESURÉ`, pas « OK ».
- **La nuit de travail continu n'a pas eu lieu** : le conteneur a redémarré vers minuit. La reprise horaire posée par `CronCreate` vit **en mémoire de session** et est morte avec lui. ~8 h perdues. **Leçon : `CronCreate` n'est pas un mécanisme de reprise durable** — il faut une Routine côté serveur, qui survit au conteneur.

### Dette signalée, non traitée
- **Deux lots portent le nom « UI-7 »** : celui de la PR #184 (`ui-v7-parcours.spec.js`) et celui de la PR #186. Collision de nommage entre deux sessions ; renommage non fait, il toucherait le travail d'une autre session.
- `NOTIF-FORGE-009` : migration prête, **non appliquée** (règle de la nuit : aucune migration sans supervision).
- La CI force Node 24 sur des actions ciblant Node 20 (avertissement à chaque run). Périmètre `.github/` = critique, contre-revue obligatoire.
