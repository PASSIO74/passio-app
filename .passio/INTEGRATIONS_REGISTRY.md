# Registre des intégrations / sources de données

> Toute source affichée dans le pilotage porte : type, environnement, statut, auth, fraîcheur, propriétaire, classification. `RÉEL` = données de production vérifiées · `LOCAL` = mode dégradé sans clé · `UNKNOWN` = non branché.
> Dernière revue : 2026-08-08.

| Système | Type | Env. | Statut | Auth | Données disponibles | Sync | Notes |
|---|---|---|---|---|---|---|---|
| **Supabase (Postgres/Auth/Realtime/Storage)** | Backend | prod | RÉEL | clé anon (front) / **service_role** (dashboard serveur) | ~30 tables, RLS par propriétaire | temps réel + REST | Unique frontière de sûreté = RLS (ADR-003). |
| **`telemetry_events`** | Télémétrie | prod | RÉEL (opt-out, actif par défaut depuis 2026-08-05) | insert-own (anon), lecture service_role | navigation, clics, timing API, erreurs, marqueurs sémantiques | realtime → dashboard | PII-safe (`js/telemetry.js`). |
| **`client_errors`** | Monitoring | prod | RÉEL | insert | erreurs client | requête CLI | Lu par `/prod-errors`, `diag`. |
| **`reports` / `blocks`** | Modération | prod | RÉEL | RLS acteur | signalements, blocages | requête CLI | Skill `moderation`. |
| **GitHub Actions** | CI/CD | prod | RÉEL | repo | tests → build → minify → deploy | sur push `main` | `.github/workflows/deploy.yml`. |
| **Netlify** | Hébergement | prod | RÉEL | compte | déploiement `passio-app.netlify.app` | sur push `main` | Tout push main = prod. |
| **Anthropic API / Claude CLI** | IA (dashboard) | local | OPTIONNEL | `ANTHROPIC_API_KEY` ou CLI Claude Code | analyse de bug en direct | à la demande | Sans clé → mode « copier le prompt ». |
| **MapLibre + OpenFreeMap** | Cartes | prod | RÉEL | aucune | tuiles carto | à la demande | Nominatim retiré de la CSP. |
| **BAN + Photon** | Géocodage | prod | RÉEL | aucune | adresses FR / POI | à la demande | Pièges cartes/géocodage. |
| **SMTP (Brevo)** | Notifications | prod | **RÉEL** (2026-08-30) | SMTP Supabase (jamais dans le dépôt) | confirmation e-mail, réinitialisation de mot de passe | 300/jour (offre gratuite) | Port 587 STARTTLS, expéditeur « PASSIO ». **Domaine d'envoi pas encore authentifié (DKIM/DMARC absents)** → risque de spam ; demande un accès DNS. |
| **Stripe / paiements** | Finance | — | **UNKNOWN (absent)** | — | — | — | Hors schéma ; exploration/ADR only. |
| **Analytics tiers (PostHog/GA…)** | Analytics | — | **UNKNOWN (non branché)** | — | — | — | Non nécessaire : télémétrie maison. |

## Architecture data (cible)
```
SOURCE → ADAPTER → NORMALISATION → MODÈLE DOMAINE → MÉTRIQUES/INTELLIGENCE → UI
```
Le dashboard implémente déjà ce découpage côté serveur (`server/ingest.js` → `store.js` → routes REST/SSE → SPA). Toute nouvelle source passe par un adaptateur, jamais un accès brut depuis l'UI. Secrets **jamais** exposés au front (service_role côté serveur uniquement).

## Frontières d'exposition
- Front PASSIO : clé anon uniquement (public, hostile).
- Dashboard : service_role côté serveur, jamais envoyée au navigateur.
- Aucune PII en URL/query. Aucun secret commité.
