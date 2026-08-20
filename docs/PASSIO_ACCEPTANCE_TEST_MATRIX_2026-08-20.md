# PASSIO — Matrice d'acceptation et de non-régression

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **But** : transformer les décisions produit en preuves testables avant toute fusion vers `main`.

## Règle générale

Un lot n'est pas terminé parce que l'interface paraît correcte. Il est terminé lorsque **comportement + sécurité + compatibilité + instrumentation + tests** convergent.

Les suites existantes restent la base de preuve : `smoke`, `navigation`, `contextual-nav`, `feed-ranking`, `feed-realtime-course`, `interactions`, `irl`, `profils-types`, `multi-comptes`, `authz-critical`, `blocage-acces`, `confidentialite`, `conv-suppression`, `transfert-message`, `version-skew`, `dist-build`, plus `audit:globals` et `audit:handlers`.

## Lot A — Retrait Wallet / Passia / points

| ID | Scénario | Preuve attendue | Type |
|---|---|---|---|
| WAL-01 | Navigation principale après login | aucun Wallet visible | e2e UI |
| WAL-02 | Ancien `goTo('wallet')` / hash obsolète | redirection vers destination valide, aucune erreur console | e2e navigation |
| WAL-03 | Profil principal | aucun score, étoile, rang ou solde Passia | e2e UI négatif |
| WAL-04 | Landing | aucune promesse Passia/crypto/monnaie | assertion texte |
| WAL-05 | IA/raccourcis | aucun raccourci « gagner des Passia » | assertion DOM |
| WAL-06 | Publication texte/photo/vidéo | publication réussie sans mutation score/passia | e2e métier |
| WAL-07 | Commentaire | commentaire réussi sans récompense | e2e métier |
| WAL-08 | Like reçu realtime | like livré au bon compte sans crédit Passia | multi-compte/realtime |
| WAL-09 | Création profil passion | profil créé sans récompense | e2e profils |
| WAL-10 | Création/join IRL | événement fonctionne sans points | e2e IRL |
| WAL-11 | Ancien blob local avec `score`, `passia`, `transactions`, `quests` | app démarre sans exception et n'affiche aucune UI legacy | migration état |
| WAL-12 | Sync cross-appareil depuis ancien état | aucune résurrection UI/logicique Wallet | sync/version-skew |
| WAL-13 | Recherche statique finale | chaque occurrence restante justifiée | audit documentaire |
| WAL-14 | Handlers/globals | aucun handler orphelin/collision | `audit:handlers`, `audit:globals` |

### Test négatif indispensable

Ajouter une spec dédiée du type `wallet-removal.spec.js` qui vérifie l'**absence** des éléments supprimés. Sans test négatif, une future réintroduction accidentelle peut passer inaperçue.

## Lot B — CDV hors du cœur

| ID | Scénario | Preuve attendue |
|---|---|---|
| CDV-01 | Navigation cœur | aucun bouton CDV primaire |
| CDV-02 | Ancien état avec carnets | chargement sans perte/exception |
| CDV-03 | Ancien lien CDV | comportement documenté : redirection ou route préservée non exposée |
| CDV-04 | Données/media/comments partagés | aucune suppression opportuniste |
| CDV-05 | Suite `cdv.spec.js` | reste disponible pour valider le module tant qu'il existe dans le dépôt |
| CDV-06 | Parcours cœur | aucun test Feed/IRL/Messages ne dépend d'un bouton CDV |

## Lot C — Navigation V2

Cible : **Fil · IRL · Créer · Messages · Profil**.

| ID | Scénario | Preuve attendue |
|---|---|---|
| NAV-01 | mobile | cinq points d'entrée maximum, utilisables au pouce |
| NAV-02 | desktop | destinations cohérentes avec mobile |
| NAV-03 | état actif | une seule destination active et correcte |
| NAV-04 | retour arrière | historique prévisible, pas de boucle |
| NAV-05 | Fil | toujours accessible directement |
| NAV-06 | Créer | accessible depuis Fil et IRL en un geste |
| NAV-07 | Explorer | aucune duplication de destination sans rôle distinct |
| NAV-08 | bobines/stories | accessibles comme formats, pas comme produit obligatoire séparé |
| NAV-09 | multi-profil | changement d'écran ne change pas silencieusement d'identité |

Adapter `navigation.spec.js` et `contextual-nav.spec.js` plutôt que créer une seconde implémentation concurrente.

## Lot D — Onboarding simplifié

| ID | Scénario | Preuve attendue |
|---|---|---|
| ONB-01 | nouveau compte | aucun Wallet/point/rang |
| ONB-02 | choix Passio | 3–7 passions sélectionnables simplement |
| ONB-03 | confidentialité | minimum explicite sans surcharge |
| ONB-04 | localisation | pas de position précise obligatoire pour accéder au Fil |
| ONB-05 | sortie | premier Fil pertinent affiché |
| ONB-06 | récupération | refresh/reprise ne duplique pas profils/passions |
| ONB-07 | analytics | `signup_completed`, `passions_selected`, `personalized_feed_viewed` émis selon définition |

## Lot E — Feed → profil → message

| ID | Scénario | Preuve attendue |
|---|---|---|
| FPM-01 | clic auteur depuis post | bon profil ouvert |
| FPM-02 | contexte passion | Passio de publication visible |
| FPM-03 | compte bloqué | profil/conversation respectent blocage |
| FPM-04 | profil privé | politique de visibilité respectée |
| FPM-05 | CTA message | démarrage conversation en peu d'étapes |
| FPM-06 | contexte post transmis | référence utile sans fuite de PII |
| FPM-07 | identité émettrice | bon profil passionnel utilisé/affiché |
| FPM-08 | cross-compte | le destinataire réel reçoit correctement |
| FPM-09 | suppression message | invariants existants restent verts |

Réutiliser en priorité `interactions.spec.js`, `multi-comptes.spec.js`, `transfert-message.spec.js`, `conv-suppression.spec.js`, `blocage-acces.spec.js`, `confidentialite.spec.js`.

## Lot F — Conversation → IRL

| ID | Scénario | Preuve attendue |
|---|---|---|
| IRL-01 | depuis conversation | activité existante consultable/partageable |
| IRL-02 | proposition activité | création contextualisée à une Passio |
| IRL-03 | refus | aucune relance forcée, sortie simple |
| IRL-04 | localisation | adresse précise non divulguée au mauvais niveau de visibilité |
| IRL-05 | blocage | utilisateur bloqué ne peut pas contourner via IRL |
| IRL-06 | compte privé | permissions appliquées |
| IRL-07 | RSVP | lifecycle existant préservé |
| IRL-08 | retour activité | contribution facultative, aucun point |

## Lot G — Instrumentation du funnel cœur

Événements canoniques :

`signup_completed → passions_selected → personalized_feed_viewed → meaningful_interaction → conversation_started → irl_intent → irl_rsvp → irl_attended → post_irl_contribution`.

Pour chaque événement, documenter et tester : nom, moment exact d'émission, propriétés autorisées, identité compte/profil, environnement, version app, source, absence de PII superflue, déduplication éventuelle.

### Tests minimum

- événement non émis avant l'action ;
- émis une fois par occurrence logique ;
- payload ne contient ni message privé ni adresse précise ni email ;
- identité analytique respecte le multi-profil ;
- dashboard distingue métrique produit et santé technique ;
- absence de données affichée comme `UNKNOWN`/insuffisant, jamais comme zéro rassurant.

## Lot H — Ranking Feed

Conserver d'abord les invariants déjà testés par `feed-ranking.spec.js` :

- affinité passion/auteur à fraîcheur égale ;
- fraîcheur dominante ;
- aucun post perdu/ajouté par le classement ;
- fallback chronologique ;
- ordre stable.

Toute V2 ajoute des tests avant déploiement : version de formule traçable, diversité, exploration, sécurité, déterminisme, rollback/feature flag, mesure d'impact Feed→conversation→IRL.

## Lot I — Sentinelle / centre de pilotage

| ID | Scénario | Preuve attendue |
|---|---|---|
| SEN-01 | aucune alerte | l'UI n'affirme jamais que le système est sain sur ce seul signal |
| SEN-02 | DB_READ | lecture de santé prouvée séparément |
| SEN-03 | canari ingestion | canari retrouvé dans la fenêtre définie et exclu des analytics métier |
| SEN-04 | SSE | heartbeat dashboard vivant |
| SEN-05 | réparation sûre | worktree isolé, périmètre fichiers respecté, tests exécutés |
| SEN-06 | patch invalide | rejet, aucune branche prête à fusionner |
| SEN-07 | kill switch | arrêt des auto-réparations effectif et audité |
| SEN-08 | rollback | chemin de retour disponible pour toute action auto autorisée |
| SEN-09 | mobile | état, incident, diagnostic, branche de réparation et actions autorisées utilisables sur smartphone |
| SEN-10 | action sensible | authentification + autorisation + audit |
| SEN-11 | main/prod | aucune fusion ou mise en prod autonome |

## Campagne obligatoire avant fusion du chantier cœur

Ordre recommandé :

1. `npm run audit:globals`
2. `npm run audit:handlers`
3. smoke / dist-build
4. navigation / contextual-nav
5. profils / interactions
6. feed ranking / realtime
7. messages
8. IRL
9. blocage / confidentialité / authz-critical
10. multi-comptes
11. version-skew / état legacy
12. nouvelles specs négatives Wallet + parcours Feed→IRL

## Contrôle croisé Codex

Codex intervient après les lots sensibles avec un mandat limité :

- rechercher les références Wallet/Passia oubliées ;
- relire les migrations/normalisations d'état ;
- chercher contournements blocage/confidentialité dans Feed→message→IRL ;
- vérifier les tests négatifs ;
- examiner les changements Sentinelle/repair pour élargissement accidentel de capacité ;
- proposer des tests ciblés sans redéfinir le produit.

## Go / No-Go global

**GO** uniquement si : parcours cœur testables, anciens états tolérés, aucune UI économie interne, données CDV préservées, invariants multi-profil/RLS verts, télémétrie documentée, aucune régression P0, diff compréhensible et rollbackable.

**NO-GO** si : une suppression DB n'est pas réversible, une identité cross-profil fuit, Wallet/Passia subsiste dans un parcours cœur, un test critique est neutralisé au lieu d'être corrigé, ou une auto-réparation peut fusionner/déployer sans geste autorisé.
