# PASSIO — Journal d'ingénierie

> Une entrée par grande boucle de travail. Faits et mesures uniquement ; les décisions durables vont dans `.passio/adr/`, les risques dans `.passio/context/KNOWN_RISKS.md`.

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
