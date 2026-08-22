# PASSIO — Sentinelle : durcissement, autonomie sûre et cockpit mobile

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Principe** : renforcer l'existant, ne pas construire une seconde Sentinelle.

## État de départ observé

PASSIO possède déjà deux briques distinctes mais liées :

1. `dashboard/server/sentinel.js` : écoute les alertes, trie, construit le contexte, déclenche le diagnostic et publie son état.
2. `dashboard/server/repair.js` : peut produire un correctif, l'appliquer dans un **worktree Git isolé**, exécuter des validations et conserver une branche seulement si le patch passe les garde-fous.

La réparation existante limite par défaut la taille du patch et le nombre de fichiers, interdit les tests/migrations/dashboard/config sensible, et ne fusionne ni ne déploie automatiquement.

Le but du prochain chantier n'est donc pas « ajouter l'auto-réparation », mais **augmenter la confiance dans ce qui existe avant d'étendre ses capacités**.

## P0 — Santé de l'observation

Une Sentinelle déclenchée par alertes est aveugle aux pannes silencieuses. `QUIET` n'est jamais synonyme de `HEALTHY`.

### Trois preuves indépendantes

#### `DB_READ`

Prouver régulièrement que le dashboard peut effectuer une lecture attendue de la source Supabase. Une réponse avec zéro ligne peut être valide : le test juge la capacité de lecture, pas l'activité utilisateur.

État : `HEALTHY | DEGRADED | DOWN | UNKNOWN` avec timestamp et provenance.

#### `CANARY_INGESTION`

Émettre un petit événement synthétique via le **chemin public normal de télémétrie**, avec les mêmes frontières que l'application, puis vérifier qu'il est retrouvé côté backend dans une fenêtre définie.

Règles :

- identifiant unique ;
- aucune PII ;
- exclu des DAU/WAU/MAU et du funnel produit ;
- exclu des alertes Sentinelle pour ne pas créer une boucle auto-alimentée ;
- délai et dernier succès visibles dans le cockpit ;
- échec = problème de couture ingestion, pas automatiquement panne complète de Supabase.

#### `SSE_HEARTBEAT`

Le serveur émet un heartbeat léger ; le dashboard confirme la fraîcheur de la connexion temps réel.

Le cockpit doit distinguer : backend vivant mais SSE coupé, ingestion vivante mais dashboard déconnecté, etc.

## P0 — Capacité DB réellement lecture seule

L'audit existant a identifié que `service_role` peut écrire et que « lecture seule » n'est alors qu'une convention.

Cible : créer/utiliser une **capacité DB dédiée en lecture seule** pour les fonctions qui n'ont pas besoin d'écrire. La sécurité doit être imposée par les permissions de la base, pas par le prompt ni par une promesse de code.

Avant changement : inventaire des endpoints dashboard qui lisent/écrivent. Ne pas casser les actions opérateur légitimes qui nécessitent une écriture ; les séparer explicitement avec identités/capacités distinctes.

## Modèle d'autonomie

### `READ_ONLY`

Diagnostic, corrélation, lecture métriques, inspection Git non destructive.

### `AUTO_SAFE`

Actions sans impact utilisateur/prod et réversibles par nature : rafraîchissement, nouvelle analyse, génération de rapport, création d'une branche de réparation validée dans un worktree.

### `AUTO_WITH_LIMITS`

Action automatisée seulement avec quota, périmètre whitelisté, tests et rollback explicites. Exemple : correctif applicatif restreint déjà prévu par `repair.js` dans un worktree, **sans merge**.

### `HUMAN_APPROVAL`

Fusion branche, déploiement, changement de configuration sensible, migration DB réversible, activation d'un feature flag à impact important.

### `HUMAN_ONLY`

Suppression de données, destruction de ressource, désactivation de protections de sécurité, migration irréversible, modification de secrets/permissions critiques non prévalidée.

## Invariants de réparation automatique

- modèle sans accès disque arbitraire ;
- fichiers injectés par le serveur après confinement de chemin ;
- tests non modifiables par le patch ;
- whitelist de fichiers ;
- taille/fichiers/quota bornés ;
- worktree isolé ;
- syntaxe + audits + suites de tests ;
- branche conservée seulement si validations vertes ;
- aucune fusion vers `main` automatique ;
- aucun déploiement prod automatique ;
- audit de chaque étape ;
- arrêt immédiat possible via kill switch.

## Rollback et kill switches

Le cockpit doit exposer clairement :

- état global Sentinelle ON/OFF ;
- état réparation automatique ON/OFF ;
- raison si réparation impossible ;
- branche/commit de réparation ;
- résultat des tests ;
- bouton abandonner/supprimer une proposition sûre si autorisé ;
- rollback d'une action opérateur quand un mécanisme existe ;
- journal immuable ou durable des bascules et actions sensibles.

Les kill switches doivent fonctionner même quand Claude/Codex sont indisponibles.

## Cockpit mobile — écran d'accueil

Sur smartphone, l'opérateur doit comprendre la situation en moins d'une minute.

### Bloc 1 — Santé technique

- statut app/API ;
- `DB_READ` ;
- `CANARY_INGESTION` ;
- `SSE_HEARTBEAT` ;
- fraîcheur dernière télémétrie ;
- erreurs/incidents P0/P1 ;
- version/déploiement courant.

### Bloc 2 — Sentinelle

- active/inactive ;
- diagnostic en cours ;
- file d'attente ;
- derniers diagnostics ;
- réparations proposées ;
- réparations rejetées et motif ;
- quotas utilisés.

### Bloc 3 — Produit cœur

- utilisateurs actifs avec provenance ;
- `personalized_feed_viewed` ;
- `meaningful_interaction` ;
- `conversation_started` ;
- `irl_intent` ;
- `irl_rsvp` ;
- `irl_attended` ;
- taux de passage entre étapes seulement si échantillon suffisant.

Le dashboard doit marquer `UNKNOWN`, `INSUFFICIENT DATA`, `LOCAL`, `REAL` ou équivalent plutôt que fabriquer une confiance.

## Cockpit mobile — fiche incident

Une fiche incident doit montrer :

1. sévérité et heure ;
2. symptôme observé ;
3. preuves ;
4. hypothèse diagnostic ;
5. niveau de confiance ;
6. code/version suspects ;
7. action proposée ;
8. niveau d'autorisation (`AUTO_SAFE`, etc.) ;
9. tests requis ;
10. rollback ;
11. historique de l'incident ;
12. actions opérateur autorisées.

Ne pas présenter le texte d'un modèle comme un ordre. Les blocs **Preuves / Hypothèse / Action** doivent rester séparés.

## Sécurité mobile

Toute action sensible depuis mobile exige :

- session authentifiée ;
- autorisation rôle/capacité ;
- protection CSRF/session selon architecture ;
- revalidation ou geste explicite pour action à fort impact ;
- journal avec acteur, date, action et résultat ;
- aucune clé/service_role exposée au navigateur ;
- timeout/session lock raisonnable ;
- interface lisible avec cible tactile suffisante.

Un simple responsive CSS n'est pas suffisant : les parcours d'incident et d'arrêt d'urgence doivent être testés sur viewport mobile réel.

## Priorités de réalisation avec Claude Code

### SEN-P0.1 — Observation health

Implémenter `DB_READ`, `CANARY_INGESTION`, `SSE_HEARTBEAT`, états et tests.

### SEN-P0.2 — Séparation des capacités DB

Auditer les usages `service_role`, introduire une capacité lecture seule quand possible, conserver les écritures opérateur derrière une frontière distincte.

### SEN-P0.3 — Kill switches + audit

Vérifier que Sentinelle et repair peuvent être coupés indépendamment et que les bascules sont auditées.

### SEN-P1.1 — Cockpit mobile

Réorganiser les données existantes en vue mobile opérationnelle sans réécrire le dashboard.

### SEN-P1.2 — Produit Feed→IRL

Ajouter au cockpit les événements funnel une fois l'instrumentation applicative réelle disponible.

### SEN-P1.3 — Runbooks

Formaliser quelques runbooks mesurés : ingestion télémétrie, SSE, erreur applicative récurrente, régression post-déploiement. Pas de catalogue théorique massif.

## Tests d'acceptation

- `QUIET` n'est jamais rendu comme preuve de santé ;
- perte de lecture DB détectée ;
- perte ingestion canari détectée ;
- perte SSE détectée séparément ;
- canari absent des KPI produit et du déclenchement Sentinelle ;
- rôle/capacité lecture seule échoue effectivement sur une tentative d'écriture de test ;
- réparation ne peut modifier `tests/`, migrations ou dashboard ;
- patch hors limites rejeté ;
- tests rouges => branche non proposée comme prête ;
- kill switch bloque le chemin automatique ;
- aucune route d'auto-merge/main/prod ;
- actions sensibles non disponibles à un rôle non autorisé ;
- parcours mobile : consulter incident, voir preuves, couper réparation, consulter branche/tests, revenir à l'accueil ;
- audit conserve acteur/action/résultat.

## Mandat de contrôle Codex

Après implémentation, Codex doit chercher spécifiquement : élargissement involontaire de whitelist, injection/chemin hors dépôt, capacité DB trop large, contournement du kill switch, confusion diagnostic/action, fuite de secrets côté client, absence de test négatif, et possibilité de merge/deploy automatisé non voulu.

## Definition of Done

La Sentinelle est considérée plus autonome uniquement quand **elle sait mieux distinguer silence et santé, possède des capacités minimales réelles, peut se couper immédiatement, produit des réparations confinées vérifiées, et reste sous contrôle humain pour main/prod**. L'interface mobile doit rendre ces garanties observables et actionnables, pas seulement déclarées dans la documentation.
