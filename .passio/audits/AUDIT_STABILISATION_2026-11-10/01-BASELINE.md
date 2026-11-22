# 01 — Baseline et état initial (2026-11-10)

> Ce qui était vrai AVANT tout changement de cette mission, avec la commande, la cible, le SHA, la date et le
> résultat de chaque preuve. Aucune de ces mesures n'a écrit en production.

## 1. Dépôt, branche, SHA

| Fait | Valeur | Preuve |
|---|---|---|
| Dépôt | `PASSIO74/passio-app` (PUBLIC) | `git remote -v` |
| `main` distant vérifié | `4e1d8ed1152867f309668a4a6847b8219d2f6622` — PR #820, 2026-11-10 14:08 UTC | `git fetch origin --prune` puis `git ls-remote origin refs/heads/main`, le 2026-11-10 à 16:02 UTC |
| Checkout local principal (`Desktop/PASSIO`) | branche `security/pilotage-second-facteur-suspendu`, `b98e9f47` : **1 commit d'avance, 23 de retard** sur `main` ; 5 entrées non suivies (`.agents/`, `.codex/`, `AGENTS.local-avant-pull.md`, `migrations/00_ORIGINE_PROD.sql`, `montage-video/videos-finales/`) | `git status`, `git rev-list --left-right --count HEAD...origin/main` |
| Conséquence | Le checkout local **n'est pas** la dernière version : il n'a été ni lu comme référence, ni modifié. Tout l'audit lit un worktree détaché sur `origin/main`. | `git worktree add --detach .claude/worktrees/audit-stabilisation-fable-2026-11-10 origin/main` |
| Travaux concurrents | 35 worktrees enregistrés (dont `audit-ux-ui-2026-11-10` sur `docs/audit-ux-ui-2026-11-10`, sans commit propre, et `controle-general-fable`, fusionné par #820) ; **aucune PR ouverte** ; 15 PR fusionnées en 36 h | `git worktree list`, `gh pr list --state open` → `[]` |
| Branche de cet audit | `docs/audit-stabilisation-2026-11-10` (documents seulement) ; chaque lot de correction a SA branche et SA PR | — |

## 2. Version déployée — vérifiée, pas supposée

| Fait | Valeur | Preuve |
|---|---|---|
| Production | https://passio-app.netlify.app sert le commit `4e1d8ed1…`, buildId `3d8e98bb12ad`, appHash `88ce2067d1`, cssHash `709d2be1cc` | `curl https://passio-app.netlify.app/release.json`, 2026-11-10 16:11 UTC |
| CI du commit | run `42831070685` : audits statiques, **suites à comptes réels**, 6 lots navigateur, WebKit iPhone, gates de l'artefact, gouvernance, déploiement (14:25:42 → 14:26:42 UTC), fumée : **tous verts** | `gh run view 42831070685 --json jobs` |
| Reproductibilité du build | un build local (Windows, Node 24.16, `PASSIO_MINIFIER_APP=1`) rend **le même** buildId / appHash / cssHash, et les **9 scripts `app/` sont identiques à l'octet** (sha384) à ceux que la page de production déclare (CI : Linux, Node 22) | `node scripts/build.js dist/index.html` puis comparaison des 9 `integrity` de la page servie |
| Ce que contient un déploiement | `dist/` : page assemblée, `app/` (9 scripts minifiés), `styles.css`, `sw.js`, `release.json`, `manifest.json`, `_headers`, icônes, `data/passions-v1.json`, `js/vendor/`, `fonts/`, **`pilotage/`** ; plus les 3 fonctions de bord Netlify (`/p /u /e`, `/media`, `/demo`) lues depuis `netlify.toml` | `scripts/build.js`, job « Déploiement production » de `deploy.yml` |
| Ce qu'il NE contient PAS | les 5 fonctions Supabase (`edge-functions.yml`, déploiement séparé), les migrations (canal ③, depuis le poste), `dashboard/` (application locale au poste). **Une livraison de l'application ne prouve donc ni celle des fonctions, ni celle de la base, ni celle du dashboard.** | workflows |

## 3. Environnements et droits d'accès de cette mission

| Environnement | Accès obtenu | Limite |
|---|---|---|
| Base de PRODUCTION (`njkiyoklssvefstljemx`) | canal ① d'ADR-012 : connecteur en lecture seule — `transaction_read_only = on`, rôle `supabase_read_only_user` ; projet prouvé par `migrations_appliquees.cible` | `SET ROLE` refusé (42501) : aucune lecture sous rôle `anon` / `authenticated` par ce canal. Aucune écriture possible, aucune tentée. |
| API publique de production, rôle ANONYME | `GET` seulement, avec la clé publique `anon` (ce que fait tout visiteur) : 57 relations sondées, noms de colonnes et comptages, aucune valeur imprimée | pas de compte, pas de `POST` — donc aucune RPC, aucun Storage en écriture |
| Staging (`fcksxofaelcdmmifnwjo`) | **aucun accès direct** : pas de clé `service_role` (secret GitHub), `.env` interdit de lecture | l'isolation sous rôles réels vient de la CI (voir § 4) |
| GitHub | `gh` connecté en `PASSIO74` (`repo`, `workflow`) : lecture des runs, création de branches et de PR | aucune fusion, aucun push sur `main` par cette mission |
| Netlify, Brevo, Cloudflare, console Supabase | **aucun accès** | quotas, facturation, journaux d'e-mails : non vérifiés |
| Appareils réels (iPhone, Android) | **aucun** | WebKit = moteur Playwright seulement |
| Modèle | la session déclare `claude-fable-5-2` (énoncé du harnais de la session) ; aucune configuration de modèle, d'authentification ou de facturation n'a été modifiée | voir `00-SYNTHESE.md` pour les sous-agents |

## 4. Résultats AVANT changement (SHA `4e1d8ed1`)

| Contrôle | Nature | Cible | Résultat | Date (UTC) |
|---|---|---|---|---|
| `npm run verif` | analyse statique + bancs unitaires des gates | worktree | **vert**, 125 s | 2026-11-10 16:07 |
| `npm run test:unit` | tests unitaires Node | worktree | **1 038 / 1 038** | 2026-11-10 16:09 |
| `npx playwright test --project=local` | test navigateur (Chromium), **serveur Supabase simulé** (« projet vide ») | worktree, port 8137 | voir `05-VERIFICATIONS.md` | 2026-11-10 |
| CI « Suites production (comptes réels) », 1ʳᵉ étape | intégration serveur réelle, **STAGING** | `fcksxofaelcdmmifnwjo` | 24 tests : **21 verts, 3 sautés** | run 42831070685, 14:09–14:15 |
| CI « Barrière RLS de la production (authz-critical seule) » | intégration serveur réelle, **PRODUCTION**, comptes e2e créés puis purgés | `njkiyoklssvefstljemx` | **1 / 1** ; le sous-cas 12c (RSVP d'autrui) est **sauté** en production (un compte e2e ne peut pas créer d'activité : admission 18+) | idem |
| Sonde anonyme | intégration serveur réelle, PRODUCTION, `GET` | 57 relations | 13 lisibles avec des lignes (contenu public), 20 lisibles à 0 ligne (RLS), 24 refusées (42501) ; messages, conversations, notifications, `user_state`, télémétrie, signalements : **0 ligne** | 2026-11-10 16:33 |
| `get_advisors` sécurité | catalogue de production | — | 0 ERROR ; WARN : 7 fonctions `SECURITY DEFINER` exécutables par `anon`, 37 par `authenticated`, `pg_trgm` dans `public` ; INFO : 11 tables RLS sans policy (fermées) | 2026-11-10 16:13 |

## 5. Production, mesurée au canal ① (agrégats, 2026-11-10 16:10–16:50 UTC)

- 14 comptes (13 confirmés, 0 compte e2e résiduel), 13 profils, 37 publications, 88 messages, 10 activités (aucune à venir),
  12 inscriptions, 14 suivis (tous `accepted`), 0 blocage, 2 signalements (classés), 48 objets Storage.
- Dernier compte créé le 2026-10-23 ; 5 connexions sur 30 jours, 1 sur 7 jours. **La production n'a pas, aujourd'hui, de trafic
  réel significatif** : aucune conclusion de charge ne peut en être tirée.
- PostgreSQL 17.6, `max_connections = 60`, `extra_float_digits = 0`.
- 43 migrations journalisées dans `migrations_appliquees` (dernière : `migration_realtime_public_hors_cdc_2026-11-09.sql`, 09/11 20:56).
- Erreurs clientes des 21 derniers jours : trois signatures seulement, détaillées dans `03-REGISTRE-FINDINGS.md` (STAB-01, STAB-02).
