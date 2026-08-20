# PASSIO — Lot cœur Feed → Profil → Conversation

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **Mission** : rendre naturelle la transformation d’une découverte dans le Feed en relation humaine, sans réécrire la messagerie.

## 1. Principe produit

La boucle PASSIO ne doit pas s’arrêter au like :

**contenu → personne → profil → interaction → conversation → IRL**.

Le Feed sert à découvrir des **personnes par leurs passions**, pas uniquement des contenus.

## 2. Existant vérifié à réutiliser

### Profils accessibles depuis les contenus

Le dépôt utilise déjà `openUserProfile(...)` depuis plusieurs surfaces, notamment :

- auteur d’une bobine ;
- auteur d’un commentaire de bobine ;
- réponses de commentaires ;
- résultats de recherche Explorer ;
- mentions/commentaires via helper de profil.

Cela confirme qu’un mécanisme de profil public transversal existe déjà. Le chantier doit le **standardiser depuis les cartes Feed**, pas créer une seconde page profil.

### Messagerie cross-compte réelle

`tests/e2e/multi-comptes.spec.js` prouve déjà le chemin technique :

- deux vrais comptes ;
- `supaCreateConversation(otherUid)` ;
- `openConversation(convId)` ;
- échange texte A→B puis B→A ;
- réception realtime ;
- vocal cross-compte ;
- persistance de conversation.

Conclusion : le backend conversation et le renderer principal sont des acquis à préserver.

### Notifications et interactions

La suite multi-comptes prouve aussi :

- like réel ;
- commentaire réel ;
- follow réel ;
- notifications vers l’auteur ;
- réactions cross-compte.

Le nouveau CTA conversation doit donc s’appuyer sur ces identités et règles existantes, pas contourner les contrôles.

## 3. Expérience cible depuis le Feed

### Carte de contenu

Chaque carte Feed doit rendre immédiatement lisibles :

- identité de l’auteur ;
- passion/contexte de publication ;
- contenu ;
- interactions essentielles.

Actions humaines cibles :

1. toucher avatar/nom → profil public ;
2. commenter/réagir → interaction légère ;
3. depuis le profil → **Discuter** ;
4. éventuellement depuis un menu du contenu → **Discuter avec [prénom]** si cela reste non intrusif.

Le CTA message direct sur chaque post ne doit pas devenir un bouton dominant qui encourage le spam. La voie préférée est **contenu → profil → discuter**.

## 4. Profil public cible

Pour un autre utilisateur, l’en-tête du profil doit donner priorité à :

- **Suivre** / état suivi ;
- **Discuter** ;
- éventuellement **Voir ses activités IRL** si visibilité autorisée.

Éléments à déprioriser/supprimer du profil :

- Score Passion ;
- rang ;
- Passia ;
- leaderboard ;
- signaux de prestige génériques.

À la place, afficher des signaux contextuels utiles :

- passions pratiquées ;
- contenus ;
- éventuelles activités publiques ;
- contexte de découverte (« Photo », « Cuisine », etc.) si disponible.

## 5. CTA `Discuter`

### Comportement

Lorsque l’utilisateur touche **Discuter** :

1. vérifier qu’il ne cible pas son propre compte ;
2. vérifier les règles de blocage/confidentialité applicables ;
3. rechercher/réutiliser une conversation 1:1 existante si elle existe ;
4. sinon créer via le mécanisme existant `supaCreateConversation(targetUid)` ;
5. ouvrir la conversation existante via `openConversation(convId)` ;
6. transférer uniquement un **contexte UX non sensible** si pertinent.

### Ne pas faire

- ne pas créer une nouvelle conversation à chaque clic ;
- ne pas envoyer automatiquement un message ;
- ne pas révéler une localisation ou donnée privée ;
- ne pas contourner le blocage ;
- ne pas changer silencieusement de profil passionnel actif ;
- ne pas utiliser Passia/points comme prérequis.

## 6. Contexte de découverte

Le contexte peut améliorer le premier échange sans générer de message automatique.

Exemple UX : dans l’en-tête de conversation, afficher temporairement :

**« Découvert via Photo · “Street photo à Lyon…” »**

Le contexte peut contenir :

- `source = feed | profile | comment | irl` ;
- `passionId` ;
- `postId` si visible par les deux comptes ;
- libellé court généré localement à partir du contenu déjà visible.

Politique :

- ce contexte n’est pas une nouvelle donnée personnelle ;
- ne pas persister un extrait de contenu privé sans nécessité ;
- si le post n’est plus visible, le lien disparaît proprement ;
- aucun contexte ne doit être transmis si blocage/confidentialité l’interdit.

Première version acceptable : ouvrir simplement la conversation, sans persistance de contexte. La priorité est la réduction du nombre d’étapes.

## 7. Multi-profil : invariant obligatoire

PASSIO possède plusieurs identités passionnelles par compte. Tout CTA message doit répondre explicitement à :

- quel **compte** contacte qui ?
- quelle **identité passionnelle** est affichée dans la conversation ?
- le changement de profil actif doit-il affecter une conversation existante ?

Décision de sécurité pour le premier lot :

- **ne pas modifier le modèle de messagerie multi-profil dans ce chantier** ;
- conserver la sémantique actuelle prouvée par les tests ;
- afficher l’identité active si c’est déjà le comportement canonique ;
- si le code réel montre une ambiguïté compte/profil, Claude Code doit la documenter avant toute modification de schéma.

Aucune donnée ne doit fuiter entre profils à cause d’un raccourci UI.

## 8. Blocage et confidentialité

Le CTA `Discuter` doit être absent ou inactif lorsque la relation n’autorise pas le contact.

Claude Code doit vérifier les règles réelles existantes avant implémentation. Minimum :

- utilisateur bloqué → aucun démarrage de conversation ;
- compte privé → respecter la politique actuelle, ne pas inventer une nouvelle règle ;
- cible supprimée/introuvable → fallback propre ;
- utilisateur courant → pas de CTA “Discuter avec soi-même”.

Les suites `blocage-acces`, `confidentialite` et `authz-critical` priment sur la commodité UX.

## 9. Instrumentation cible

Événements produit proposés :

- `profile_opened_from_content`
  - `source`
  - `passion_id`
  - pas de PII inutile ;
- `message_cta_viewed`
- `message_cta_clicked`
- `conversation_started`
  - distinguer `new` vs `existing` ;
  - `source = profile | feed_context | irl` ;
- `first_message_sent_after_discovery` si mesurable sans collecte excessive.

Mesure principale :

**taux contenu → profil → conversation**, pas nombre brut de messages.

## 10. Lot d’implémentation recommandé

Nom : **`improve/feed-person-message`**

### Étape A — standardiser l’accès auteur depuis Feed

- avatar auteur cliquable ;
- nom auteur cliquable ;
- passion visible ;
- cible unique `openUserProfile` ;
- aucune nouvelle page profil.

### Étape B — CTA Discuter sur profil public

- réutiliser fonction de création/recherche de conversation ;
- ouvrir Messages/conversation ;
- gérer conversation déjà existante ;
- gérer propre compte/blocage/échec réseau.

### Étape C — retour/navigation

- bouton retour conversation → profil ou Messages selon historique réel ;
- retour profil → Feed conserve la position si l’infrastructure actuelle le permet ;
- ne pas introduire une pile d’historique parallèle.

### Étape D — instrumentation minimale

Instrumenter les transitions seulement après validation du comportement.

## 11. Tests à conserver et étendre

### Existants

- `multi-comptes.spec.js` — preuve conversation/realtime réelle ;
- `interactions.spec.js` — interactions surfaces ;
- `blocage-acces.spec.js` ;
- `confidentialite.spec.js` ;
- `authz-critical.spec.js` ;
- `navigation.spec.js` ;
- `profils-types.spec.js` ;
- `transfert-message.spec.js` ;
- `conv-suppression.spec.js` ;
- smoke/handlers/globals.

### Nouveaux scénarios

1. Feed → clic auteur → bon profil.
2. Profil autre compte → `Discuter` visible.
3. Profil propre compte → `Discuter` absent.
4. `Discuter` → conversation existante réutilisée.
5. `Discuter` sans conversation → une seule conversation créée.
6. Double clic/réseau lent → pas de doublon de conversation.
7. Compte bloqué → CTA absent/refus serveur conforme.
8. Conversation créée depuis profil → premier message reçu cross-compte.
9. Retour téléphone après ouverture conversation cohérent.
10. Aucune métrique Passia/score dans ce parcours.

## 12. Critères d’acceptation

- un contenu mène au bon auteur en un tap ;
- un profil pertinent mène à une conversation en un tap supplémentaire ;
- aucun message automatique n’est envoyé ;
- aucune conversation dupliquée ;
- realtime existant intact ;
- blocage/confidentialité intacts ;
- multi-profil ne fuit pas d’identité ;
- aucun Wallet/points/Passia dans le parcours ;
- instrumentation mesure la transition humaine, pas le temps passé.

## 13. Répartition IA

- **ChatGPT** : hiérarchie CTA, comportement produit, critères d’acceptation et revue UX.
- **Claude Code** : identifier les fonctions exactes de profil/conversation, implémenter le chemin minimal, exécuter tests mono/multi-comptes.
- **Codex** : rechercher doublons de conversation, races réseau, fuite cross-profil, contournements blocage/confidentialité et régressions d’historique.
