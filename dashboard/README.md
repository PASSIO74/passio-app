# Passio — Centre de pilotage

Tableau de bord indépendant de **supervision, pilotage et test temps réel** de
Passio. Il observe l'application en conditions réelles (connexions, écrans,
actions, messages, erreurs, API…), regroupe les bugs, prépare des contextes de
diagnostic pour Claude Code, pilote des sessions de test et génère des rapports.

Il est **réellement connecté** à Passio via la table Supabase `telemetry_events`,
alimentée par l'instrumentation `js/telemetry.js` ajoutée à l'app.

---

## 1. Architecture

```
Passio (PWA)                          Centre de pilotage (cette app)
  js/telemetry.js  ──insert──▶  Supabase.telemetry_events
                                        │ realtime (service_role)
                                        ▼
                                  Backend Node/Express
                                   • ingestion + store mémoire
                                   • REST + flux SSE
                                   • auth/rôles, bugs, sessions,
                                     tests, git, Claude, flags, audit
                                        │ SSE + REST
                                        ▼
                                  SPA (violet, temps réel)
```

- **Pas de nouvelle infrastructure** : Supabase (déjà le backend de Passio) sert
  de magasin d'événements et de bus temps réel.
- Le **backend détient la clé `service_role`** (jamais exposée au navigateur : la
  clé anon ne peut pas lire la télémétrie, par conception RLS).
- Le **frontend** est du vanilla JS + modules ES natifs (cohérent avec Passio,
  sans bundler), icônes SVG (type Lucide, pas d'emojis), graphiques `<canvas>`.

## 2. Installation

Prérequis : Node ≥ 20.

```bash
cd dashboard
npm install
cp .env.example .env      # puis éditer .env (voir ci-dessous)
npm start                 # http://localhost:4610
```

### Configuration minimale (`.env`)

| Variable | Rôle |
|---|---|
| `DASH_ADMIN_USER` / `DASH_ADMIN_PASSWORD` | compte admin du dashboard |
| `DASH_SESSION_SECRET` | secret de signature des sessions (générer aléatoire) |
| `SUPABASE_URL` | URL du projet Supabase de Passio |
| `SUPABASE_SERVICE_ROLE_KEY` | **lecture de la télémétrie** (Dashboard Supabase → Settings → API → service_role) |
| `PASSIO_REPO_PATH` | chemin du dépôt Passio (défaut : `..`) |
| `ANTHROPIC_API_KEY` | *(optionnel)* analyse de bug en direct par Claude |

Sans `SUPABASE_SERVICE_ROLE_KEY`, le dashboard démarre en **mode local** : tout
fonctionne (auth, git, tests, UI) mais aucun événement Passio n'est reçu.

## 3. Activer la collecte

1. **Appliquer la migration** (une fois) :
   ```bash
   supabase db query --linked --file ../migrations/migration_telemetry.sql
   ```
2. **Instrumentation** : déjà en place — `js/telemetry.js` est chargé dans
   `index.html` et branché sur la navigation, les clics, les appels API, les
   erreurs et quelques actions clés (publication, message, like, commentaire, RSVP).
3. **Activation** : en production, la télémétrie est **active par défaut** (suivi
   continu de la beta) avec **opt-out** — `?telemetry=0` désactive durablement,
   `?telemetry=1` force la capture complète. Réglages : `window.PASSIO_TELEMETRY_SAMPLE`
   (fraction d'appareils, 1 = tous) et `window.PASSIO_TELEMETRY_DEFAULT_ON=false`
   (repli opt-in strict). Données minimisées (aucun PII) — **à mentionner dans la
   politique de confidentialité**, idéalement avec un bouton d'opt-out en Réglages
   (`PassioTelemetry.setEnabled(false)`).

## 4. Déroulé d'un test à deux appareils

1. `npm start` le dashboard, se connecter.
2. **Sessions de test → Nouvelle session** (« Benjamin + testeur 2 »), *Démarrer*.
3. Sur chaque appareil, ouvrir Passio avec `?telemetry=1`.
4. **Appareils** : les deux apparaissent, comparables côte à côte.
5. **Activité en direct** : les actions défilent, filtrables par utilisateur/appareil.
6. Une erreur → **Bugs & erreurs** : fiche, stack, extrait de code, boutons de copie.
7. **Claude Code** : construire le contexte, copier le prompt (ou analyser en direct).
8. **Tests** : lancer une suite autorisée, sortie en direct.
9. *Terminer* la session → **Rapports** : synthèse exportable (JSON/CSV).

## 5. Rôles

`admin` (tout) · `developer` (tests, git lecture, claude, flags, db) ·
`tester` (sessions, alertes) · `observer` (lecture seule).
Utilisateurs additionnels via `DASH_EXTRA_USERS=user:pass:role,...`.

## 6. Commandes

```bash
npm start     # serveur (prod locale)
npm run dev   # serveur avec rechargement (node --watch)
npm test      # tests backend (node --test)
```

## 7. Sécurité (résumé)

Voir [`docs/SECURITE.md`](docs/SECURITE.md). En bref : clé service_role côté
serveur uniquement, sessions signées HMAC httpOnly, limitation des tentatives,
matrice de permissions, **mutations de code désactivées en production**, patchs
appliqués seulement sur une branche dédiée après confirmation, jamais de push,
journal d'audit complet, masquage PII côté client et serveur.

## 8. Intégration Claude Code

Voir [`docs/INTEGRATION_CLAUDE_CODE.md`](docs/INTEGRATION_CLAUDE_CODE.md).

## 9. Fichiers

- **Instrumentation Passio** : `js/telemetry.js`, `migrations/migration_telemetry.sql`,
  quelques marqueurs dans `js/app-0*.js` (voir la liste dans le rapport de session).
- **Backend** : `dashboard/server/*.js`
- **Frontend** : `dashboard/public/**`

## 10. Limites connues

- Pas de relecture visuelle (rrweb) : la relecture est **événementielle** (parcours
  d'écrans/actions), volontairement sans capture DOM pour rester léger et privé.
- La perf CPU/mémoire de l'appareil n'est pas remontée (API navigateur limitées) ;
  on mesure latence, erreurs, timings de navigation.
- L'analyse Claude en direct nécessite `ANTHROPIC_API_KEY` ; sinon mode « copier le prompt ».
- Le store temps réel est en mémoire (borné) ; l'historique long vit dans Supabase.

## 11. Améliorations recommandées

- Cron `purge_telemetry(30)` (pg_cron) pour la rétention.
- Notifications d'alerte e-mail/webhook (points de sortie déjà prévus dans `alerts.js`).
- Export PDF des rapports (structure déjà en JSON/CSV).
- URLs de médias signées côté Passio (durcissement au-delà du périmètre dashboard).
