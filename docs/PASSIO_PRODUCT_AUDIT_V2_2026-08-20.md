# PASSIO Product Audit V2 — simplification vers Feed → relation → IRL

- **Date** : 2026-08-20
- **Statut** : cadrage produit prêt pour reprise avec Claude Code
- **Décision associée** : `.passio/adr/ADR-009-core-feed-irl-sans-wallet.md`

## 1. Objectif

Réduire PASSIO à une proposition de valeur immédiatement compréhensible : **« partage tes Passio et rencontre les gens »**.

La boucle cœur à optimiser devient :

**Passion → contenu → personne → interaction → conversation → expérience IRL → nouveau contenu.**

Chaque surface doit désormais prouver qu'elle renforce cette boucle. Les fonctions qui créent une économie parallèle, une destination concurrente ou une complexité sans preuve d'usage sortent du cœur.

## 2. Lecture du produit actuel

La cartographie fonctionnelle du 2026-08-16 mesure 8 écrans (`feed`, `profiles`, `studio`, `explore`, `irl`, `messages`, `cdv`, `wallet`) et 435 interactions distinctes. La suite complète en exerce 66, soit 15,2 %. Cette surface justifie une passe de simplification avant toute nouvelle expansion fonctionnelle.

Le produit dispose déjà de briques sérieuses sur les zones que nous voulons renforcer : feed et ranking, profils, messagerie, IRL, blocage/confidentialité, tests cross-compte, télémétrie, centre de pilotage et Sentinelle. L'effort doit donc porter d'abord sur la cohérence du parcours et la réduction de la surface secondaire, pas sur une réécriture générale.

## 3. Matrice de décision fonctionnelle

| Domaine | Décision | Direction |
|---|---|---|
| **Feed par passions** | KEEP + STRENGTHEN | Devient l'entrée principale. Ranking orienté pertinence, personnes et potentiel de relation, pas uniquement consommation. |
| **Profils / multi-profils passionnels** | KEEP + SIMPLIFY | Conserver la différenciation PASSIO, réduire la charge cognitive et clarifier identité, visibilité et passage d'un profil à l'autre. |
| **Messages** | KEEP + STRENGTHEN | Pont direct entre interaction et relation. Faciliter le passage contenu → conversation. |
| **IRL / événements / activités** | KEEP + STRENGTHEN | Deuxième moitié du noyau. Faciliter le passage conversation → activité réelle. |
| **Explore** | SIMPLIFY | Le garder seulement s'il apporte une découverte distincte du feed : passions, personnes ou activités. Éviter un second feed générique. |
| **Studio / création** | SIMPLIFY | Réduire à un flux de publication clair, rapide, contextualisé par Passio. Les options secondaires ne doivent pas ralentir le partage. |
| **Reels / vlogs / stories** | SIMPLIFY / RECLASSIFY | Ce sont des formats de contenu, pas des destinations produit. Les intégrer au Feed si utiles à la passion ; éviter une copie de TikTok/Instagram. |
| **IA visible côté utilisateur** | KEEP ONLY IF USEFUL | L'IA doit accélérer découverte, création, sécurité ou rencontre. Ne pas devenir une destination qui concurrence le lien humain. |
| **CDV / carnet de voyage** | EXTRACT | Sort du cœur de PASSIO. Préserver les briques pour le vertical **Passio : Voyage**. Extraction progressive, pas suppression aveugle. |
| **Wallet** | REMOVE | Supprimer écran, navigation, CTA, état, textes, tests et dépendances spécifiques après cartographie des références. |
| **Passia / points / étoiles / Score Passion / rangs / leaderboard** | REMOVE | Supprimer du cœur. Ne pas remplacer par un autre score public générique. |
| **Packs / boutique / Pass Passion / crypto** | REMOVE / LATER | Sort du MVP cœur. Un futur besoin de paiement doit préférer un paiement direct en monnaie réelle. |
| **Marketplace transactionnelle** | LATER | Non prioritaire tant que la boucle Feed→IRL n'a pas une traction mesurée. |
| **Podcasts** | LATER / VERTICAL | Ne pas ajouter au cœur maintenant. |
| **Sentinelle / centre de pilotage** | KEEP + STRENGTHEN | Hors navigation utilisateur ; essentiel aux opérations, à l'auto-diagnostic, au rollback et à la qualité de service. |

## 4. Navigation cible

La navigation primaire doit être limitée aux intentions les plus fréquentes du cœur produit. Cible de travail :

1. **Accueil / Feed** — voir ce qui compte dans mes Passio.
2. **Découvrir** — trouver de nouvelles passions, personnes ou activités si cette fonction ne peut pas vivre naturellement dans le feed.
3. **Créer** — publier dans une Passio avec le moins de friction possible.
4. **IRL** — voir, proposer ou rejoindre quelque chose à faire avec des personnes partageant mes passions.
5. **Messages** — poursuivre les relations et coordonner les rencontres.

Le profil reste accessible en permanence mais n'a pas besoin de concurrencer ces intentions dans toutes les tailles d'écran. `Wallet` et `CDV` ne sont plus des destinations du cœur.

## 5. Boucle magique PASSIO

### Étape A — Passion
L'utilisateur choisit quelques passions suffisamment précises pour personnaliser rapidement l'expérience. La sélection doit produire un bénéfice visible immédiatement.

### Étape B — Contenu
Le feed montre des contenus dont le lien avec une passion est évident. Chaque carte doit permettre de comprendre rapidement : **quoi**, **quelle Passio**, **qui** et **pourquoi cela m'est montré** lorsque pertinent.

### Étape C — Personne
Le contenu est une porte vers une personne, pas une fin en soi. Faciliter la découverte du profil passionnel de l'auteur et des passions réellement communes.

### Étape D — Interaction
Réactions et commentaires doivent aider à démarrer un échange de qualité. Éviter les mécanismes conçus uniquement pour accumuler des points ou maximiser le volume d'actions.

### Étape E — Conversation
Depuis un contenu, un commentaire ou un profil, démarrer une conversation doit être naturel. Le contexte de la Passio ou du contenu doit pouvoir être conservé dans la transition lorsque cela aide.

### Étape F — IRL
À partir d'une affinité ou d'une conversation, proposer une activité doit être simple, sûre et non intrusive. L'expérience doit être formulée autour de **« faire quelque chose ensemble grâce à une passion commune »**, pas autour de « rencontrer un inconnu ».

### Étape G — Retour au Feed
Une expérience IRL peut naturellement produire photos, récit, recommandation ou nouveau contenu, refermant la boucle sans mécanisme de points.

## 6. Onboarding cible

Objectif : atteindre un **premier feed pertinent** le plus tôt possible.

Séquence recommandée :

1. Compte / règles essentielles.
2. Choix de 3 à 7 Passio initiales avec possibilité de préciser plus tard.
3. Réglages minimum de confidentialité/localisation nécessaires.
4. Feed immédiatement personnalisé.
5. Invitations légères à compléter profil, suivre des personnes ou activer des préférences supplémentaires **après** démonstration de valeur.

À éviter dans l'onboarding cœur : Wallet, Passia, packs, rang, score, boutique, configuration avancée, promesse crypto ou multiplication prématurée des profils.

## 7. Multi-profils : simplification fonctionnelle

Le multi-profil reste différenciant s'il protège les contextes de passion au lieu de créer plusieurs comptes dans un compte.

Principes :

- Un utilisateur possède une identité de compte et peut présenter des **facettes passionnelles**.
- Au moment de publier, le contexte passionnel doit être clair et simple.
- Au moment d'interagir, éviter de demander un choix d'identité à chaque geste sans bénéfice réel.
- Les règles de visibilité entre facettes doivent être explicites.
- Le changement de profil ne doit pas modifier silencieusement des paramètres sensibles.
- La confidentialité doit privilégier des règles compréhensibles plutôt qu'une matrice d'options infinie.

Question à tester en UX : un profil passionnel doit-il toujours être une entité autonome, ou certaines Passio peuvent-elles être simplement des contextes d'un même profil ? Ne pas changer le modèle de données avant validation avec Claude Code et revue des contraintes existantes.

## 8. Feed : objectif et ranking

Le ranking ne doit pas avoir comme objectif unique le temps passé. Il doit équilibrer :

- correspondance avec les Passio déclarées ;
- affinité avec l'auteur ;
- fraîcheur ;
- qualité / intérêt du contenu ;
- diversité des auteurs et sous-passions ;
- signaux explicites de l'utilisateur ;
- découverte contrôlée ;
- potentiel de conversation ou d'activité réelle, sans favoriser artificiellement la proximité physique ;
- sécurité et qualité du compte/contenu.

### Métriques à surveiller

Ne pas optimiser seulement `session_duration`. Suivre notamment :

- contenus pertinents vus avant première interaction ;
- taux de posts menant à visite de profil ;
- visite profil → interaction ;
- interaction → conversation ;
- conversation → proposition/consultation IRL ;
- RSVP / participation ;
- retour après activité ;
- rétention J1/J7/J30 segmentée par activation ;
- masquages, blocages, signalements et abandons.

## 9. Activation

Hypothèse d'activation initiale à instrumenter :

Un utilisateur est **activé** lorsqu'il a :

1. choisi ses Passio ;
2. reçu un feed personnalisé ;
3. effectué une interaction humaine significative ou suivi une personne ;
4. découvert au moins une personne ou activité réellement liée à l'une de ses Passio.

Ne pas figer cette définition comme vérité : la comparer ensuite à la rétention réelle.

### Funnel produit

`signup_completed` → `passions_selected` → `personalized_feed_viewed` → `meaningful_interaction` → `conversation_started` → `irl_intent` → `irl_rsvp` → `irl_attended` → `post_irl_contribution`

## 10. Analytics à préparer

Événements minimaux, sans données sensibles inutiles :

- `onboarding_started/completed`
- `passion_selected/removed`
- `feed_item_impression`
- `feed_item_opened`
- `profile_opened_from_content`
- `follow_created`
- `reaction_created`
- `comment_created`
- `conversation_started`
- `message_sent`
- `irl_event_opened`
- `irl_event_created`
- `irl_rsvp_created/cancelled`
- `irl_attendance_confirmed` si un mécanisme sûr existe
- `block_created`
- `report_created`
- `content_hidden`

Chaque événement doit documenter : finalité, propriétés autorisées, données interdites, source, environnement et rétention.

## 11. Trust & Safety / IRL

La conversion vers l'IRL impose une sécurité supérieure à un réseau de contenu pur.

P0 fonctionnels :

- blocage robuste et immédiat ;
- signalement ;
- confidentialité du profil ;
- gestion prudente de la localisation ;
- contrôle de visibilité des activités ;
- possibilité de quitter/refuser sans exposition ;
- gestion des comptes abusifs/spam ;
- journalisation des actions de modération ;
- politique spécifique mineurs à cadrer avant ouverture large ;
- ne pas afficher un score public de « confiance » réducteur.

Les signaux de confiance doivent rester contextuels et vérifiables lorsque possible : compte/profil suffisamment complété, relations mutuelles, historique d'événements réellement terminés, absence ou traitement de signalements, éventuelles vérifications futures.

## 12. Suppression Wallet/Passia : stratégie sûre

Ordre obligatoire au moment de l'implémentation :

1. Inventorier toutes les références UI, JS, CSS, localStorage/state, données seed, documentation, tests et éventuelles colonnes/tables DB.
2. Identifier ce qui est purement démonstratif et ce qui est référencé par une autre fonctionnalité.
3. Supprimer d'abord les entrées de navigation et CTA.
4. Supprimer l'écran Wallet et ses fonctions dédiées.
5. Retirer points/étoiles/Score Passion/Passia/leaderboard du profil, du feed, des modales et de l'onboarding.
6. Rendre tolérante la lecture d'anciens états locaux possédant encore ces champs.
7. Ne supprimer aucune colonne/table de production sans inventaire, migration versionnée, test et possibilité de rollback.
8. Nettoyer les textes marketing, données de démonstration et screenshots après stabilisation.
9. Ajouter tests négatifs garantissant qu'aucun lien Wallet/Passia n'est encore exposé dans le cœur.

## 13. Extraction du CDV vers Passio : Voyage

Le CDV possède une surface et des tests significatifs. Il doit donc être extrait en plusieurs étapes :

- retirer sa destination de la navigation cœur ;
- conserver le code et les données derrière un flag/route non exposée pendant la transition ;
- documenter ses dépendances avec profils, médias, commentaires, IRL et stockage ;
- décider ensuite du mode de réutilisation par le vertical Passio : Voyage ;
- seulement après extraction vérifiée, supprimer du bundle cœur ce qui n'est plus partagé.

## 14. Création de contenu

Objectif : **partager une Passio en quelques secondes**.

Le Studio doit être évalué comme un moyen, pas comme un produit autonome. Préférer :

- un CTA créer évident ;
- choix du contexte Passio rapide ;
- média/texte simples ;
- options avancées repliées ;
- aperçu clair de l'identité utilisée ;
- confirmation immédiate et feed mis à jour ;
- reprise sûre après échec upload/réseau.

## 15. Sentinelle et centre de pilotage

Le centre de pilotage existe déjà et doit rester séparé du produit utilisateur. Les prochains travaux doivent renforcer :

- état synthétique du service ;
- incidents et diagnostic ;
- runbooks machine-lisibles ;
- auto-réparation uniquement pour actions sûres et réversibles ;
- rollback ;
- kill switches / feature flags ;
- journal d'intervention ;
- escalade humaine ;
- interface mobile réellement utilisable ;
- métriques du funnel Feed→IRL en plus de la seule santé technique.

## 16. Règles de non-régression produit

Après simplification :

- inscription et authentification restent fonctionnelles ;
- Feed, profils, création, messages et IRL restent accessibles ;
- confidentialité, RLS, blocage et cross-compte ne régressent pas ;
- aucune référence Wallet/Passia/points/rangs/leaderboard/crypto ne reste dans la navigation cœur ou l'onboarding ;
- le retrait du CDV du cœur ne détruit pas ses données ;
- les anciens états locaux ne doivent pas casser le démarrage ;
- les liens directs obsolètes doivent rediriger proprement ;
- le poids JS/CSS et le nombre d'interactions exposées doivent être remesurés après nettoyage.

## 17. KPI de réussite de la simplification

### Produit
- compréhension de la promesse en test utilisateur ;
- temps signup → premier feed pertinent ;
- taux feed → profil ;
- profil → interaction ;
- interaction → conversation ;
- conversation → intention IRL ;
- participation IRL ;
- rétention par cohorte activée.

### Complexité
- nombre d'écrans cœur ;
- nombre d'interactions exposées ;
- lignes et modules supprimés/extraits ;
- diminution des destinations principales ;
- couverture des parcours P0 ;
- bugs/régressions par release.

### Sécurité
- blocages et signalements traités ;
- violations RLS ;
- incidents liés à la confidentialité/localisation ;
- temps détection → diagnostic → remédiation Sentinelle.

## 18. Séquence recommandée

1. **Verrouiller ADR-009 et le périmètre.**
2. **Audit de dépendances Wallet/Passia/CDV** sans modification prod.
3. **Navigation cœur V2.**
4. **Suppression Wallet/points/Passia** avec compatibilité ancien état.
5. **Extraction CDV du cœur** sans perte de données.
6. **Simplification onboarding + création.**
7. **Passage contenu → profil → message.**
8. **Passage conversation → IRL.**
9. **Instrumentation funnel et KPI.**
10. **Trust & Safety IRL.**
11. **Optimisation ranking Feed.**
12. **Sentinelle + cockpit mobile + métriques produit.**
13. **Campagne E2E et mesure de surface après simplification.**
14. **Bêta mesurée**, puis seulement réévaluation des fonctionnalités `LATER`.

## 19. Répartition des responsabilités à la reprise de Claude Code

### ChatGPT
- garde-fou de la promesse produit ;
- arbitrage KEEP/SIMPLIFY/EXTRACT/REMOVE ;
- UX et critères d'acceptation ;
- instrumentation/KPI ;
- revue fonctionnelle et cohérence globale.

### Claude Code
- audit exact des références code et données ;
- plan de fichiers ;
- modifications multi-fichiers ;
- migrations nécessaires ;
- refactoring ;
- intégration et exécution de la suite de tests ;
- mise à jour des cartographies mesurées.

### Codex
- contrôle croisé ciblé ;
- analyse de régressions ;
- nouveaux tests P0 ;
- revue de diff et angles morts lorsque pertinent.

## 20. Definition of Done du chantier simplification

Le chantier est terminé lorsque :

- un nouvel utilisateur peut expliquer PASSIO comme un réseau de passions qui mène aux personnes et aux expériences réelles ;
- Wallet/Passia/points/rangs/leaderboard/crypto ne sont plus dans le cœur ni dans l'onboarding ;
- le CDV n'est plus une destination cœur et reste récupérable pour Passio : Voyage ;
- le parcours Feed → profil → interaction → message → IRL est cohérent et testé ;
- les protections confidentialité/blocage/RLS restent vertes ;
- les KPI de ce parcours sont instrumentés avec provenance ;
- les changements sont réversibles et documentés ;
- la surface fonctionnelle est remesurée et inférieure à la baseline de 435 interactions lorsque les suppressions sont terminées ;
- la suite P0 est verte avant toute fusion vers `main`.
