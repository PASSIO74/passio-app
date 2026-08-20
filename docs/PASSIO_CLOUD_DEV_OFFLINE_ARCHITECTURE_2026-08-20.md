# Passio Cloud Dev — architecture ordinateur éteint

Date : 2026-08-20

## Objectif

Permettre à PASSIO de continuer les tâches de développement, de revue et de validation quand l'ordinateur personnel est éteint, en utilisant GitHub comme source de vérité et des exécutions Claude Code distantes contrôlées.

## État vérifié au 20 août 2026

Le test E2E distant PR #72 a confirmé que :
- GitHub Actions démarre sans dépendre de l'ordinateur personnel ;
- le checkout de la branche distante fonctionne ;
- Node 22 est disponible ;
- Claude Code 2.1.237 s'installe correctement ;
- le modèle initialisé est bien `claude-opus-5` ;
- les garde-fous empêchent toute persistance après un échec ;
- le diagnostic expurgé des secrets fonctionne.

Le blocage observé n'est pas technique : Claude Code retourne `Credit balance is too low`. Le chemin GitHub -> runner -> Claude Code -> Opus 5 est donc opérationnel jusqu'à l'appel facturé Anthropic. Le système sera relançable dès qu'un mode de facturation distant valide sera disponible.

Politique Sentinelle : ce cas doit être classé `billing_blocked`, pas `runtime_failure`. Il ne doit pas déclencher de boucle de retry automatique tant que la capacité de facturation n'a pas été restaurée.

## Principes obligatoires

1. GitHub est la source de vérité du code, des branches, des PR et de l'état de travail.
2. Aucune exécution distante ne pousse directement sur `main`.
3. Toute tâche distante travaille sur une branche dédiée et passe par une PR.
4. Avant chaque implémentation, la branche de base et le commit de référence doivent être vérifiés contre la dernière version réelle de PASSIO.
5. Toute modification doit être visible dans le Centre de pilotage et supervisable par la Sentinelle.
6. Les actions distantes doivent être traçables, réversibles et limitées par permissions.
7. Les secrets ne doivent jamais être écrits dans le dépôt ni exposés dans les logs.

## Architecture cible

### 1. Source de vérité

- Dépôt de référence : `PASSIO74/passio-app`.
- Branche produit de référence actuelle : `product/passio-core-simplification-2026-08-20` jusqu'à validation d'une nouvelle référence.
- Chaque tâche distante est matérialisée par une branche `claude-task/<slug>` ou équivalent.
- Chaque implémentation est proposée via PR ; aucune fusion automatique par Claude.

### 2. Moteur d'exécution distant

Le moteur principal est Claude Code exécuté sur un runner GitHub hébergé.

Le runner :
- checkout la branche de tâche ;
- installe une version contrôlée de Claude Code ;
- charge `AGENTS.md`, `CLAUDE.md` et la tâche approuvée ;
- exécute uniquement les outils autorisés ;
- produit les changements ;
- lance les checks pertinents ;
- refuse de persister en cas d'erreur de garde-fou ;
- committe uniquement sur la branche de tâche ;
- laisse la PR ouverte pour revue.

### 3. Orchestration ChatGPT / Claude Code / Codex

- ChatGPT : cadrage produit, spécification, orchestration, diagnostic, lecture GitHub et décision de prochaine étape.
- Claude Code : implémentation principale dans le dépôt distant.
- Codex : revue indépendante des PR à risque normal/élevé, détection de régressions et vérification du scope.

### 4. Centre de pilotage / Sentinelle

Chaque run distant devra à terme produire un enregistrement exploitable par le Centre de pilotage avec au minimum :

- identifiant de tâche ;
- branche ;
- SHA de base ;
- SHA de tête ;
- agent utilisé ;
- modèle ;
- heure de début/fin ;
- statut ;
- fichiers touchés ;
- checks exécutés ;
- résultat CI ;
- PR associée ;
- diagnostic d'échec ;
- classe d'échec (`billing_blocked`, `runtime_failure`, `permission_failure`, `ci_failure`, `scope_violation`) ;
- possibilité de relance ;
- kill switch du système distant.

La Sentinelle devra :
- détecter les runs échoués ;
- distinguer erreur Claude, facturation, configuration, permissions, CI ou code ;
- proposer ou appliquer une relance sûre lorsque la cause est transitoire ;
- ne pas relancer automatiquement un blocage de facturation ;
- bloquer tout push interdit ou changement hors scope ;
- conserver une trace complète de l'incident et de la reprise.

## Sécurité

- `main` est interdit en écriture aux agents.
- Pas de `--dangerously-skip-permissions` dans les runners distants.
- Les commandes shell autorisées doivent rester minimales.
- Aucun accès aux fichiers `.env` ou secrets locaux.
- Les secrets GitHub Actions sont injectés uniquement à l'exécution.
- Les logs d'échec doivent être utiles au diagnostic sans imprimer les prompts contenant des secrets ni les variables secrètes.
- Toute migration, auth, RLS, données de production ou déploiement doit nécessiter un niveau de validation supérieur.

## Facturation et authentification distantes

Le mode actuel GitHub Actions utilise `ANTHROPIC_API_KEY`. Cette voie dépend donc du solde de crédits de l'organisation Anthropic Console associée à la clé.

Options supportées à considérer :
1. conserver l'API Anthropic directe avec crédits Console et auto-reload contrôlé ;
2. utiliser AWS Bedrock ;
3. utiliser Google Vertex AI.

Le choix final devra privilégier la simplicité, la sécurité, la visibilité des coûts et la possibilité d'appliquer des limites budgétaires. Les abonnements Claude Pro/Max et la facturation API doivent être traités comme deux mécanismes distincts dans l'architecture distante.

## Modes d'utilisation prévus

### Depuis ChatGPT / téléphone

1. Vérifier la dernière version réelle et la branche de base.
2. Créer une branche de tâche.
3. Écrire une tâche bornée dans `.passio/claude-task.md` ou un mécanisme équivalent.
4. Ouvrir la PR.
5. Le runner cloud exécute Claude Code.
6. Lire les résultats, CI et diff depuis GitHub.
7. Déclencher revue Codex si nécessaire.
8. Ne fusionner qu'après validation.

### Depuis l'ordinateur

Le même workflow reste utilisable. L'ordinateur local devient un poste facultatif de développement et de test, et non une dépendance de fonctionnement.

## Étapes de mise en place

### Phase 1 — fiabilisation immédiate

- diagnostiquer précisément le code de sortie actuel de Claude Code ;
- conserver un journal d'erreur non sensible ;
- ajouter timeout et concurrence ;
- vérifier le modèle réellement initialisé ;
- garantir qu'aucun diff n'est persisté si Claude échoue ;
- conserver les checks CI existants ;
- rétablir un mode de facturation distant valide ;
- relancer le probe E2E.

### Phase 2 — pilotage distant

- normaliser la file de tâches ;
- rendre les statuts consultables depuis le Centre de pilotage mobile ;
- ajouter classification automatique des échecs ;
- ajouter relance contrôlée et kill switch ;
- ajouter historique des runs et diagnostics.

### Phase 3 — autonomie avancée

- traitement de plusieurs tâches en file, avec une seule tâche d'écriture par zone critique ;
- classification automatique du risque ;
- revue Codex automatique selon le risque ;
- preview distante avant merge ;
- rollback et fermeture automatique des branches abandonnées ;
- métriques de fiabilité dans la Sentinelle.

## Critère de réussite

PASSIO est considéré comme réellement opérationnel « ordinateur éteint » lorsqu'une tâche créée depuis mobile/ChatGPT peut être :

1. cadrée ;
2. exécutée par Claude Code dans le cloud ;
3. vérifiée par CI ;
4. revue ;
5. consultée dans le Centre de pilotage ;
6. reprise ou annulée ;

sans qu'aucune machine personnelle ne soit allumée et sans accès direct automatisé à `main`.
