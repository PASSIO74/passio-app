# PASSIO — Brief de reprise Claude Code

- **Date** : 2026-08-20
- **Branche de cadrage** : `product/passio-core-simplification-2026-08-20`
- **Sources** : ADR-009 + `docs/PASSIO_PRODUCT_AUDIT_V2_2026-08-20.md`
- **Mode de travail** : ChatGPT + Claude Code, avec Codex en contrôle croisé ciblé

## Mission de reprise

Implémenter une simplification mesurable de PASSIO autour de la promesse : **« partage tes Passio et rencontre les gens »**.

Le chantier ne consiste pas à réécrire l'application. Il consiste à réduire la surface qui concurrence le noyau, préserver les protections existantes, puis rendre plus direct le chemin :

**Feed → personne → interaction → conversation → IRL.**

## Règles non négociables

1. Ne jamais supprimer une table/colonne prod avant inventaire, migration versionnée, tests et rollback.
2. Ne pas casser les invariants RLS, confidentialité, blocage, cross-compte et suppression de messages déjà prouvés.
3. Ne pas mélanger extraction CDV et suppression Wallet dans un seul gros diff irréversible.
4. Les changements doivent être découpés en PR/revues logiques et testables.
5. Aucun nouveau système de points, Wallet, monnaie virtuelle, Passia, rang global ou leaderboard dans le cœur.
6. Aucun paiement n'est requis par ce chantier. Si un paiement devient nécessaire plus tard, l'hypothèse par défaut est paiement direct en monnaie réelle, sans monnaie PASSIO.
7. CDV = extraction vers **Passio : Voyage**, pas purge.
8. Toute modification de la navigation doit conserver une voie claire vers Feed, création, IRL, messages et profil.
9. Après chaque étape, mesurer les interactions exposées et les tests réellement exercés.
10. Main/prod uniquement après tests verts et revue explicite.

# Sprint 0 — Audit exact avant modification

## CC-00.1 — Cartographier Wallet/Passia/points

Chercher dans :

- `index.html`
- `js/app-01` à `app-09`
- `js/contextual-nav.js`
- CSS
- état et localStorage
- seeds/données de démo
- tests Playwright
- migrations / schéma prod
- docs
- screenshots et assets
- raccourcis/commandes IA éventuels

### Livrable

Table de dépendances :

`référence | fichier | symbole/selector | type | dépend de | impact si retiré | action`.

### Acceptance

- [ ] zéro suppression avant inventaire complet ;
- [ ] distinction UI / état / persistance / DB / tests / docs ;
- [ ] dépendances partagées identifiées ;
- [ ] vieux états locaux pris en compte.

## CC-00.2 — Cartographier CDV pour extraction

Identifier les dépendances avec profils, médias, commentaires, IRL, storage, navigation et migrations.

### Acceptance

- [ ] liste des modules strictement CDV ;
- [ ] liste des briques partagées ;
- [ ] liste des tables/migrations à préserver ;
- [ ] stratégie feature flag/route ou autre méthode réversible proposée ;
- [ ] aucune suppression de données.

## CC-00.3 — Baseline mesurée

Avant changements, enregistrer :

- nombre d'écrans ;
- nombre d'interactions ;
- couverture fonctionnelle mesurée ;
- taille JS/CSS ;
- résultat tests P0 ;
- tests feed/messages/IRL/profils/confidentialité ;
- temps de chargement/latence disponible sans inventer de chiffres.

# Sprint 1 — Retrait de l'économie interne

## CC-01.1 — Retirer Wallet de la navigation

- retirer destination principale ;
- retirer CTA et raccourcis ;
- gérer anciens deep links sans écran cassé.

### Acceptance

- [ ] aucune entrée Wallet visible ;
- [ ] deep link obsolète redirigé proprement ;
- [ ] Feed/IRL/messages/profil/création navigables mobile et desktop.

## CC-01.2 — Supprimer l'écran Wallet

Après inventaire des dépendances seulement.

### Acceptance

- [ ] DOM Wallet supprimé du cœur ;
- [ ] handlers dédiés retirés ;
- [ ] CSS strictement dédié retiré ;
- [ ] aucun handler orphelin ;
- [ ] smoke vert.

## CC-01.3 — Retirer Passia/points/Score/rangs/leaderboard

Nettoyer : profil, onboarding, feed, modales, shop, seeds, textes et navigation.

### Acceptance

- [ ] aucune promesse de gains/points/Passia dans l'UI cœur ;
- [ ] aucun Score Passion/rang/leaderboard public ;
- [ ] ancien localStorage/state chargé sans exception ;
- [ ] aucune régression des profils ;
- [ ] recherche finale des termes documentée.

## CC-01.4 — Persistance/DB

Ne retirer que ce qui est prouvé inutile.

### Acceptance

- [ ] si aucune donnée prod n'est concernée, le documenter explicitement ;
- [ ] si DB concernée : migration distincte, idempotente si possible, testée et rollback documenté ;
- [ ] aucune donnée utilisateur supprimée par opportunisme.

# Sprint 2 — CDV sort du cœur

## CC-02.1 — Retirer CDV de la navigation primaire

### Acceptance

- [ ] CDV absent du parcours cœur ;
- [ ] données non supprimées ;
- [ ] tests cœur ne dépendent plus de la présence du bouton CDV ;
- [ ] code récupérable pour Passio : Voyage.

## CC-02.2 — Isoler le module

Séparer au maximum les dépendances strictement voyage des briques génériques sans réarchitecture disproportionnée.

### Acceptance

- [ ] frontière documentée ;
- [ ] briques médias/commentaires/profils partagées préservées ;
- [ ] extraction future réalisable sans copier aveuglément l'application cœur.

# Sprint 3 — Navigation et onboarding cœur

## CC-03.1 — Navigation V2

Cible fonctionnelle : Feed, Découvrir si distinct, Créer, IRL, Messages ; profil accessible clairement.

### Acceptance

- [ ] aucun doublon de destination sans rôle distinct ;
- [ ] mobile testable au pouce ;
- [ ] état actif fiable ;
- [ ] retour Feed prévisible ;
- [ ] tests navigation mis à jour.

## CC-03.2 — Onboarding simplifié

Priorité : Passio → premier feed pertinent.

### Acceptance

- [ ] aucune étape Wallet/gamification ;
- [ ] choix initial de passions simple ;
- [ ] confidentialité/localisation minimale explicite ;
- [ ] options avancées différées ;
- [ ] événement `personalized_feed_viewed` instrumentable.

# Sprint 4 — Feed → personne → conversation

## CC-04.1 — Cartes Feed

Chaque contenu doit rendre clair auteur + contexte Passio et ouvrir naturellement le profil ou l'échange.

### Acceptance

- [ ] profil auteur accessible depuis contenu ;
- [ ] contexte passion visible ;
- [ ] aucune métrique de points ;
- [ ] feed-ranking specs restent vertes ou sont adaptées explicitement.

## CC-04.2 — Transition vers message

### Acceptance

- [ ] depuis profil/contenu pertinent, démarrer une conversation demande peu d'étapes ;
- [ ] contexte utile transféré sans fuite de données ;
- [ ] règles confidentialité/blocage respectées ;
- [ ] tests cross-compte ajoutés/ajustés.

# Sprint 5 — Conversation → IRL

## CC-05.1 — CTA activité

Permettre de consulter/proposer/rejoindre une activité depuis un contexte humain pertinent sans transformer la messagerie en moteur d'invitations agressif.

### Acceptance

- [ ] CTA contextualisé ;
- [ ] refus/annulation faciles ;
- [ ] aucune localisation précise exposée sans règle explicite ;
- [ ] blocage et confidentialité priment sur suggestion IRL ;
- [ ] lifecycle événement existant réutilisé.

## CC-05.2 — Boucle retour

Après une activité, faciliter une contribution ou un souvenir sans récompense artificielle.

### Acceptance

- [ ] aucune obligation de publier ;
- [ ] pas de points ;
- [ ] contenu éventuellement relié à la Passio/activité ;
- [ ] contrôle de visibilité explicite.

# Sprint 6 — Instrumentation produit

## Funnel cible

`signup_completed`
→ `passions_selected`
→ `personalized_feed_viewed`
→ `meaningful_interaction`
→ `conversation_started`
→ `irl_intent`
→ `irl_rsvp`
→ `irl_attended`
→ `post_irl_contribution`

### Acceptance

- [ ] définitions et propriétés documentées ;
- [ ] aucune PII superflue ;
- [ ] provenance/environnement/fraîcheur compatibles avec le centre de pilotage ;
- [ ] dashboard peut distinguer santé technique et performance produit ;
- [ ] inconnues affichées comme inconnues, pas estimées silencieusement.

# Sprint 7 — Feed ranking V2

Ne pas changer l'algorithme au doigt mouillé. D'abord instrumenter.

Signaux candidats : passions déclarées, affinité auteur, fraîcheur, qualité, diversité, exploration, signaux explicites, sécurité, potentiel de conversation/IRL.

### Acceptance

- [ ] formule/version du ranking traçable ;
- [ ] tests de déterminisme/invariants ;
- [ ] garde-fous diversité ;
- [ ] pas d'optimisation exclusive du temps passé ;
- [ ] expérimentation mesurable avant généralisation.

# Sprint 8 — Trust & Safety IRL

### P0

- blocage ;
- signalement ;
- visibilité événement ;
- localisation prudente ;
- permissions ;
- compte privé ;
- modération et journalisation ;
- politique mineurs avant ouverture large.

### Acceptance

- [ ] suite `authz-critical` verte ;
- [ ] specs blocage/confidentialité vertes ;
- [ ] scénarios IRL cross-compte ;
- [ ] aucune fonction de confiance publique par score générique.

# Sprint 9 — Sentinelle et cockpit mobile

## Objectif

Étendre l'existant, pas le réécrire.

### Runbook générique

`détection → diagnostic → action sûre → health check → succès OU rollback → journal → alerte/escalade`.

### Niveaux d'action

- `READ_ONLY`
- `AUTO_SAFE`
- `AUTO_WITH_LIMITS`
- `HUMAN_APPROVAL`
- `HUMAN_ONLY`

### Acceptance

- [ ] chaque action automatique est réversible ou explicitement non automatique ;
- [ ] kill switch ;
- [ ] logs d'intervention ;
- [ ] dashboard mobile utilisable ;
- [ ] action sensible protégée par authentification/autorisation ;
- [ ] aucune purge/destruction autonome.

# Sprint 10 — Campagne de validation

## Technique

- smoke ;
- handlers ;
- feed ranking ;
- messages ;
- IRL ;
- profils ;
- authz ;
- blocage/confidentialité ;
- version skew ;
- PWA si touchée.

## Produit

- 5 parcours manuels minimum sur mobile et desktop :
  1. nouveau compte → Passio → Feed ;
  2. Feed → profil → interaction ;
  3. interaction → conversation ;
  4. conversation → IRL ;
  5. retour IRL → contenu.

## Mesures finales

Comparer au baseline :

- écrans cœur ;
- interactions ;
- couverture ;
- JS/CSS ;
- régressions ;
- erreurs console ;
- temps de parcours si mesuré proprement.

# Découpage de commits/PR recommandé

1. `audit/product-surface-wallet-cdv`
2. `remove/wallet-navigation`
3. `remove/passia-points-core`
4. `extract/cdv-core-navigation`
5. `simplify/core-navigation-onboarding`
6. `improve/feed-person-message`
7. `improve/message-irl-loop`
8. `instrument/core-funnel`
9. `tune/feed-ranking-v2`
10. `harden/irl-trust-safety`
11. `improve/sentinel-mobile-product-metrics`

Éviter un méga-commit couvrant tout le chantier.

# Protocole de collaboration

## ChatGPT avant chaque lot

- rappelle l'objectif utilisateur ;
- fournit critères d'acceptation ;
- vérifie le risque de scope creep ;
- décide avec l'utilisateur si un arbitrage produit est réellement nécessaire.

## Claude Code

- inspecte la réalité du dépôt ;
- annonce les fichiers impactés ;
- propose le changement minimal cohérent ;
- implémente ;
- exécute les tests appropriés ;
- remonte les écarts entre spec et code réel au lieu de les masquer.

## Codex après les lots sensibles

- relit diff ;
- cherche régressions/angles morts ;
- propose ou ajoute tests ciblés ;
- ne redéfinit pas le produit sans arbitrage.

# Critère global de fusion

Aucun lot n'est considéré fini parce que « l'écran semble bon ». Il est fini lorsque **comportement + sécurité + tests + mesure + documentation** convergent, avec un diff suffisamment petit pour être compris et rollbacké.
