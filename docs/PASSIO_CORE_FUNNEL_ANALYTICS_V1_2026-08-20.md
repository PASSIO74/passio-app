# PASSIO — Funnel cœur mesurable V1

- **Date** : 2026-08-20
- **Branche** : `product/passio-core-simplification-2026-08-20`
- **But** : instrumenter le cœur PASSIO avant toute optimisation de ranking profonde.

## 1. Boucle produit mesurée

PASSIO doit mesurer la boucle :

**Passion → Feed → personne → interaction → conversation → intention IRL → RSVP → présence → nouveau contenu**

Le but n’est pas de maximiser le temps passé. Le but est de savoir si PASSIO transforme une passion en relation puis en expérience réelle.

## 2. Infrastructure déjà disponible

Le schéma de production contient déjà `analytics_events` avec :

- `user_id` ;
- `event` ;
- `properties jsonb` ;
- `created_at`.

La migration analytics précise que la table est append-only, que l’utilisateur peut insérer ses propres événements et qu’il ne peut pas lire les analytics des autres.

**Décision** : réutiliser cette table. Pas de nouveau SDK analytics au P0.

## 3. Événements canoniques V1

### Acquisition / activation

- `signup_completed`
- `passions_selected`
- `personalized_feed_viewed`

### Feed → personne

- `feed_post_impression`
- `feed_author_opened`
- `profile_opened_from_feed`

### Interaction → conversation

- `meaningful_interaction`
- `conversation_cta_opened`
- `conversation_started`
- `conversation_reused`
- `first_message_sent`
- `first_reply_received`

### Conversation → IRL

- `conversation_irl_cta_opened`
- `conversation_irl_form_opened`
- `irl_created_from_conversation`
- `irl_shared_to_conversation`
- `irl_opened_from_conversation`

### IRL

- `irl_rsvp_going`
- `irl_rsvp_maybe`
- `irl_waitlisted`
- `irl_checkin`
- `irl_completed`

### Boucle de retour

- `post_created_after_irl`
- `event_album_post_created`

## 4. Définition de « meaningful_interaction »

Ne pas compter chaque scroll/clic comme activation.

V1 : `meaningful_interaction` couvre au minimum :

- commentaire publié ;
- réponse à un commentaire ;
- follow explicite ;
- ouverture profil depuis contenu avec action relationnelle ;
- démarrage de conversation.

Un simple impression, like isolé ou pause vidéo reste une micro-interaction et ne doit pas définir seul l’activation.

## 5. Propriétés communes

Quand disponibles et sans donnée sensible :

- `source_screen`
- `source_post_id`
- `source_author_id`
- `passion_id`
- `active_profile_id`
- `conversation_id`
- `conversation_type`
- `event_id`
- `is_existing_conversation`
- `app_version`

Ne jamais envoyer :

- contenu des messages ;
- texte privé ;
- adresse exacte ;
- GPS précis ;
- email/téléphone ;
- données de blocage/report comme propriétés marketing.

## 6. Métriques produit principales

### Activation passion

`personalized_feed_viewed / signup_completed`

### Feed → personne

`profile_opened_from_feed / personalized_feed_viewed`

### Personne → conversation

`conversation_started_or_reused / profile_opened_from_feed`

### Conversation → intention IRL

`conversation_irl_cta_opened / active_conversations`

### Intention → création IRL

`irl_created_from_conversation / conversation_irl_form_opened`

### Partage → RSVP

`unique users rsvp / irl_shared_to_conversation`

### RSVP → présence

`irl_checkin / irl_rsvp_going`

### Présence → contenu

`post_created_after_irl / irl_checkin`

## 7. North-star candidate

Avant validation par données, ne pas figer une métrique unique comme vérité absolue.

Candidate V1 :

**Nombre hebdomadaire d’utilisateurs ayant atteint une interaction humaine significative puis une action IRL vérifiable.**

Exemple de seuil : conversation bidirectionnelle + RSVP/check-in.

Le check-in est plus fort que le simple RSVP mais ne sera pas présent sur tous les événements ; conserver plusieurs niveaux de preuve.

## 8. Cohortes à séparer

Analyser séparément :

- nouveaux utilisateurs (< 7 jours) ;
- utilisateurs établis ;
- mono-profil ;
- multi-profils ;
- conversations directes ;
- groupes ;
- événements créés depuis conversation ;
- événements découverts dans IRL ;
- passion principale/catégorie si échantillon suffisant.

Ne pas tirer de conclusion d’un segment minuscule.

## 9. Provenance et qualité

Chaque KPI affiché dans le centre de pilotage doit préciser :

- source (`analytics_events`, `event_attendees`, etc.) ;
- fenêtre temporelle ;
- date de dernière donnée ;
- définition exacte ;
- statut `OK / PARTIAL / UNKNOWN` si les événements attendus ne sont pas encore instrumentés.

Aucune valeur factice ou extrapolée dans le cockpit production.

## 10. Ranking : règle de gouvernance

Ne pas modifier profondément `rankFeedPosts` avant d’avoir suffisamment de données sur :

- profils ouverts ;
- conversations démarrées ;
- IRL initiés ;
- qualité/safety ;
- diversité.

Le ranking existant conserve ses invariants tests : set de posts inchangé, fraîcheur forte, affinité en second signal, mode chrono de repli.

Les futurs tests de ranking doivent évaluer des résultats humains, pas uniquement clics/temps passé.

## 11. Dashboard / Sentinelle

Le centre de pilotage peut présenter :

- santé technique ;
- erreurs/incidents ;
- utilisateurs actifs ;
- activation ;
- Feed → profil ;
- profil → conversation ;
- conversation → IRL ;
- RSVP → check-in ;
- post-IRL contribution.

La Sentinelle peut alerter sur une **rupture de pipeline analytics** (ex. événement attendu à zéro brutalement), mais ne doit pas « réparer » les métriques en inventant des données.

## 12. Tests recommandés

- une action produit émet exactement l’événement attendu ;
- pas de doublons lors de re-render ;
- aucune émission avant authentification si non autorisée ;
- aucune propriété sensible ;
- échec analytics ne bloque jamais l’action utilisateur ;
- événement avec source correcte Feed/Profile/Messages/IRL ;
- les IDs facultatifs absents ne cassent pas l’émission.

## 13. Répartition IA

- **ChatGPT** : définition funnel/KPI, gouvernance et interprétation produit.
- **Claude Code** : instrumentation réelle aux points d’action existants + tests.
- **Codex** : recherche doublons, PII, événements manquants et incohérences de provenance.
