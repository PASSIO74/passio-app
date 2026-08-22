# PASSIO Sentinel 2 — mode autonome sans Claude

## Objectif

Sentinel 2 sépare la supervision déterministe de l'analyse IA. Le centre de pilotage doit continuer à détecter, prouver, corréler et préparer les incidents même lorsque Claude Code est indisponible ou sans crédit.

## Chaîne cible

`Passio → télémétrie/tests/Git/DB → Observation Health → alertes → Incident Packets → Readiness/Control Center → Claude Code si nécessaire → correctif proposé → tests → validation humaine`

## Ce qui est désormais automatisé sans Claude

- **Observation Health** avec états explicites `LIVE`, `DEGRADED`, `NOT_CONFIGURED`, `UNAVAILABLE`.
- **DB_READ** périodique pour prouver que le backend peut réellement lire `telemetry_events`.
- **Canari synthétique public** toutes les 15 minutes via la clé anon ; il doit être revu par l'ingestion sous 90 secondes.
- Le canari est retiré avant le store afin de ne jamais polluer utilisateurs, sessions, KPI, bugs, alertes ou traces produit.
- **Heartbeat SSE mesuré** : le serveur comptabilise les écritures réussies vers les connexions dashboard ouvertes. Ce seam n'est pas présenté comme un ACK de rendu navigateur.
- **Incident Packet** déterministe attaché à chaque alerte : signal, commit, écran/endpoint/action, corrélation, preuves récentes, confiance, reproduction, tests suggérés et définition de done.
- **Release Flight Recorder** : commit, branche, identifiant de déploiement, version frontend et version DB quand ces preuves sont disponibles.
- `/readiness` inclut désormais les domaines **Observation** et **Release chain** en plus de l'autorisation, des bugs, des parcours, de la disponibilité et de la stabilité.

## Autorisation

Le domaine AUTHORIZATION reste critique et binaire. Le résultat de `tests/e2e/authz-critical.spec.js` alimente le readiness : un seul canari en échec doit imposer le rouge. Aucun pourcentage moyen ne peut masquer une fuite cross-account.

## Règles d'usage de Claude Code

Claude n'est plus requis pour : disponibilité serveur, fraîcheur, présence d'un commit, résultats de tests, détection d'un canari perdu, déduplication d'alertes, collecte de contexte ou préparation d'un incident.

Claude est réservé à : analyse causale complexe, arbitrage d'architecture, génération d'un patch délicat, revue sémantique et explication d'un comportement non déterministe.

## Configuration

Variables optionnelles :

- `DASH_CANARY_EVERY_MIN` — fréquence du canari, défaut 15 min.
- `DASH_CANARY_DEADLINE_S` — délai maximum d'observation, défaut 90 s.
- `DASH_DB_READ_EVERY_MIN` — fréquence de la preuve DB_READ, défaut 5 min.
- `DASH_INCIDENT_KEEP` — nombre de dossiers d'incident conservés, défaut 200.
- `DASH_RELEASE_KEEP` — nombre de snapshots release conservés, défaut 120.
- `PASSIO_APP_VERSION`, `PASSIO_DB_VERSION`, `DEPLOY_ID`/`COMMIT_REF` — preuves de version pour compléter la chaîne release.

## Sécurité

Le canari utilise la clé anon et `user_id = null`, conformément à la policy INSERT de `telemetry_events`. La lecture continue d'être effectuée uniquement côté backend. Les données du canari sont explicitement marquées synthétiques et exclues des métriques produit.

Sentinel historique conserve ses garde-fous : analyses Claude sans écriture automatique, deep mode opt-in, sandbox/allowlist, quotas, déduplication par cause + révision, et traitement des données observées comme potentiellement hostiles.

## Prochaine amélioration compatible

Un ACK navigateur explicite peut être ajouté ultérieurement au heartbeat SSE. Le modèle actuel distingue déjà honnêtement "écrit dans le flux SSE" d'un véritable ACK de rendu UI, afin de ne pas créer une fausse preuve.
