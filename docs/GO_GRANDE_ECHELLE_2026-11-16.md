# GO pour l’ouverture gratuite à grande échelle

Mandat de Benjamin du 16 novembre 2026 : effectuer les vérifications et corrections nécessaires à un GO, en conservant le fonctionnement gratuit défini dans la checklist de commercialisation. Le chantier commence sur `main` réel `627b6d4c71cf8aaea2c9da275d6dceeec866f6ff`, après livraison de la PR951. Le GO n’est pas acquis au démarrage.

## Résultat attendu et périmètre

Obtenir une décision de lancement étayée par les parcours réellement livrés, les frontières de sécurité, une récupération exercée et des mesures de capacité reproductibles. L’objectif de volume est de 100 000 comptes ; le nombre de sessions actives simultanées, le débit et les volumes de médias sont mesurés et publiés séparément. Aucun résultat n’est extrapolé en « 100 000 utilisateurs simultanés ».

Le parcours prioritaire reste Découvrir → Partager → Rencontrer. La coorganisation suspendue ne sera pas réactivée sans parcours de consentement. Le chantier n’ajoute ni paiement, ni économie interne, ni nouvelle fonctionnalité étrangère au lancement.

Risque : **critical**. Orchestration et vérification : Codex ; implémentation ciblée par Codex/agents sur branches isolées, Claude distant lorsque pertinent ; contre-revue technique indépendante avant toute fusion critique. Chaque correctif garde sa branche et sa PR. Les déclarations personnelles du mainteneur ne sont jamais produites sans son instruction explicite.

## Conditions du GO

| Domaine | Preuve attendue |
|---|---|
| Risques | Registre actuel réconcilié : constats historiques distingués des défauts reproduits, P0 corrigés et P1 traités ou mitigés avec preuve ; aucune clôture par simple changement de libellé |
| Inscription | Inscription par le parcours public, réception réelle de l’email sur une boîte de test autorisée, confirmation et connexion ; refus, renvoi et expiration éprouvés |
| Parcours | Feed, publication, réactions, commentaires, messagerie et RSVP entre comptes distincts ; refus et nombre réel de lignes touchées vérifiés |
| Privacy/modération | Isolation entre comptes, données IRL réservées, blocage et signalement, consentements, export et suppression ; textes et contacts cohérents avec le service livré |
| Reprise | Sauvegarde → altération détectée → restauration → relecture, sur une cible isolée, avec comptes synthétiques, médias et cinq tables privées ; limites de mots de passe/OAuth/configuration explicites |
| Capacité | Données synthétiques à volume et mix représentatif ; paliers mesurés, P50/P95/P99, erreurs attendues/inattendues, pertes, doublons, convergence et première dégradation ; aucune charge sur la production |
| Exploitation | Version servie, observabilité, état des alertes, budget/quotas, délestage et récupération documentés ; propriétaire capable de superviser depuis mobile |
| Livraison | Branches/PR, CI requise verte, contre-revues, migrations attestées et journalisées si nécessaires, puis vérifications réelles après déploiement |

Les seuils de charge et budgets d’essai seront figés avant exécution à partir de l’outillage existant et des limites réelles de la cible. Les comptes inscrits, comptes actifs mensuels, connexions simultanées et trafic hostile restent des dimensions distinctes. Un palier vert ne prouve pas une capacité supérieure.

## Frontières d’exécution

- Production `njkiyoklssvefstljemx` : pas de charge ni de population synthétique massive. Les lectures opérationnelles restent agrégées et bornées.
- Staging `fcksxofaelcdmmifnwjo` : cible existante et migrée. Une charge requiert un prévol, des comptes propres au run, des budgets, une coupure et un nettoyage limité à ce run. Les autres suites ne doivent pas être perturbées.
- Restauration : cible jetable distincte de la source et de la production. Aucun effacement d’un staging partagé ni transfert des données utilisateur réelles vers le poste n’est présumé autorisé.
- Emails et notifications : uniquement les recettes prévues vers des destinataires de test autorisés. Les deux déclenchements manuels de veille autorisés pour PR951 sont consommés et ne constituent pas une autorisation permanente.
- Télémétrie et signalements : entrées non fiables. Les mandats d’agents ne prennent que comptages, catégories fixes et empreintes opaques, jamais messages navigateur, piles, URL ou motifs libres. Un défaut est reproduit localement avant modification.
- Secrets et données personnelles : aucune valeur dans Git, les rapports, les arguments ou journaux. Les preuves brutes restent sous `work/go-grande-echelle-2026-11-16/`, ignoré par Git ; les rapports publiés sont expurgés.

## Pilotage/Sentinelle et suivi

Intégration pertinente : suivi des campagnes, verdicts, seuils, incidents, coupures, historique de livraison et preuves de reprise. Réutiliser les événements et contrôles existants lorsque possible ; une instrumentation supplémentaire passe par le filtre de données personnelles et sa contre-revue.

Le rapport de suivi est `.passio/reports/2026-11-16-go-grande-echelle.md`. Il cite les versions et preuves datées, distingue NON VÉRIFIÉ d’un échec et ne promet aucun GO avant satisfaction des conditions.
