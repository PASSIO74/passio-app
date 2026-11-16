# Reprise des correctifs de sécurité — 16 novembre 2026

État de travail, à relire avec les preuves de livraison. Cette page expurgée ne contient ni secret, ni donnée d'utilisateur, ni procédure d'exploitation. L'audit initial et son registre détaillé restent distincts des correctifs. La reprise du chat interrompu a récupéré les commits locaux et les fichiers non publiés dans un nouveau worktree isolé ; le dépôt principal et l'ancien checkout sont préservés.

## Mandat et références

Benjamin a étendu le mandat d'audit aux corrections et à leur livraison. La reprise par Codex conserve les branches des autres agents, les contrôles de revue et la CI. Aucune écriture directe sur `main`.

- Code audité initialement : `d4c885afb08d1c7312f58c336c6e5acf9b633197`.
- Base réelle de la reprise, vérifiée par fetch : `a270749b`.
- Branche : `security/codex-finalisation-2026-11-16`.
- [PR de correction #951](https://github.com/PASSIO74/passio-app/pull/951), en brouillon.
- Exécution : Codex, outils locaux PowerShell/Node/Git, Playwright avec Chrome installé, GitHub Actions, API de gestion Supabase. Les agents techniques utilisent le modèle hérité sans sélection supplémentaire. Le modèle exact de chaque agent n'est pas certifié par un nom inscrit dans le code.

## État des opérations

| Surface | État prouvé à cette étape | Limite |
|---|---|---|
| Administration | La session précédente a consigné l'exigence du second facteur et la relecture de la configuration | Configuration non recontrôlée par cette reprise ; parcours mobile du propriétaire non rejoué |
| Relais d'appels | La session précédente a consigné la fermeture de l'émission des nouveaux identifiants | État fournisseur et expiration des identifiants déjà émis non recontrôlés |
| Authentification | La session précédente a consigné l'activation des notifications de sécurité et leur relecture | Réception d'un email et configuration actuelle non démontrées par cette reprise |
| Messagerie | Correctif client et borne serveur préparés ; régression trouvée en contre-revue puis corrigée | SQL et code non déclarés livrés par leur seule présence dans Git |
| Rencontres | Réserves de création, export, suppression, rétention et notification corrigées et relues séparément | Bancs PostgreSQL et essais sur cible encore requis ; promotion/suppression concurrentes hors couverture actuelle |
| Social | Rendu renforcé et contrôles serveur préparés | Vérification PostgreSQL des droits et de la composition des policies requise |
| Auth/Edge et veille | Correctifs préparés et tests locaux ciblés | Configuration, ordre de livraison, revue indépendante et vérification sur cible requis |
| CI et agents | Cloisonnement des secrets et réduction des données non fiables préparés | Les règles textuelles d'un agent ne prouvent pas un confinement de ses permissions |
| Abus et capacité | Lot de plafonds et de réduction des lectures en revue | Amplification, accès anonymes et plafond financier global restent à prouver séparément |

## Vérifications acquises et contrôles encore ouverts

Le passage ciblé actuel exécute **106 tests unitaires : 106 réussis**, sur les messages, rencontres, export, push, rétention, CI et plafonds. **35 scénarios Chrome distincts** ont été vérifiés avec les API interceptées : accès aux discussions, refus et succès d'inscription, adresse, messages et rendu social. Un scénario a d'abord reproduit la notification en double ; le correctif a été intégré, puis les neuf scénarios de ce fichier et les trois scénarios sociaux ont tous réussi. Ces bancs ne prouvent pas la RLS déployée.

Le build local et son contrôle d'intégrité passent : neuf scripts applicatifs et la feuille de style correspondent aux empreintes déclarées. La version minifiée et les suites complètes restent à vérifier par la CI. Le banc SQL social est maintenant découvert par le lanceur automatique ; les bancs de concurrence exigent PostgreSQL natif et refusent une simulation locale qui prétendrait le remplacer.

Les audits locaux de données personnelles suivies dans Git, d'échappement, de globals et de publication Realtime passent. Leurs analyses statiques ont une portée limitée aux formes reconnues.

Le premier passage CI était rouge. Ses deux échecs unitaires ont été corrigés localement ; les attentes navigateur ont été adaptées au nouveau contrat, en préservant les assertions de refus. Le contrôle général a ensuite identifié une borne non référencée pour le nouveau job de build de preview : corrigée et testée. Son majorant initial provient de l'ancien job complet ; la durée du job séparé reste à relever lors de son premier passage CI réussi. Une nouvelle CI et une revue ancrée sur le commit final restent nécessaires avant fusion.

Le lot de réduction de l'amplification Realtime est traité séparément : sa présence dans le plan ne constitue pas une réparation ni une livraison. Le cumul de trafic de plusieurs comptes, les plafonds financiers et les lectures anonymes ne deviennent pas bornés par un seul quota par compte.

Les contre-revues par des agents séparés ont effectivement détecté des régressions avant livraison. Elles ne sont ni une revue humaine indépendante, ni une certification de sécurité. Toute retouche critique invalide les conclusions portant uniquement sur le commit précédent.

## Ordre de livraison et récupération

1. Corriger les réserves, exécuter les bancs SQL jetables et relire le diff final.
2. Vérifier les dépendances de staging et tester les refus avec les vrais rôles et des données synthétiques.
3. Consigner les revues et attestations sur les fichiers exacts et les cibles exactes. Conserver les gardes du script officiel de migration.
4. Livrer les composants selon leurs prérequis : client avant les contraintes qui exigent sa présence, configuration authentifiée avant fermeture de la veille. Une migration ne devient pas appliquée par une fusion de code.
5. Vérifier version servie, configuration, état effectif et disponibilité ; conserver un retour arrière examiné qui ne réouvre pas silencieusement une faille.

Les plafonds de dépenses, la restauration de sauvegardes et les kill switches doivent être vérifiés par leur résultat effectif. Une sauvegarde présente ne prouve pas une restauration réussie.

## Réponses directes à cette étape

**Que peut réellement faire un attaquant aujourd'hui ?** Les chemins confirmés par l'audit restent ouverts tant que chaque correctif correspondant n'a pas été livré et vérifié. Cette page publique n'en donne pas les procédures. Les gestes de configuration déjà appliqués ferment des accès précis ; ils ne ferment pas tout le registre.

**Quelles protections avons-nous effectivement vérifiées ?** Les configurations relues et les tests explicitement cités ci-dessus. Une requête privilégiée de catalogue ne démontre pas l'efficacité de la RLS ; un résultat HTTP sans contrôle des lignes modifiées ne démontre pas une autorisation correcte.

**Quel scénario à 100 000 utilisateurs est démontré ?** Aucun nouveau scénario. Il faut distinguer comptes inscrits, activité quotidienne, connexions simultanées et trafic hostile. Aucune charge de production n'est autorisée ou exécutée par cette reprise.

**Quels points empêchent encore de conclure ?** La revue finale, les bancs et essais sur cible, l'application effective des migrations, les preuves de livraison et de récupération, ainsi que les constats non couverts par les lots. L'absence de faille trouvée ne constitue jamais une garantie absolue.
