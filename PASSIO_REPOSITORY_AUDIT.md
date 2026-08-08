# PASSIO — Audit du dépôt (Wave 1 / Reconnaissance)

> État des lieux factuel, daté du **2026-08-07**, produit à partir du dépôt réel (pas du cahier des charges).
> Source de vérité complémentaire : `CLAUDE.md`, `docs/PIEGES_CONNUS.md` (56 fiches), `docs/HISTORIQUE_PROJET.md`, `docs/SCALE_RUNBOOK.md`.
> Ce que ce document N'EST PAS : une refonte. PASSIO est une app mûre (1659 commits, beta en prod). Le vrai travail est fiabilité / confidentialité / scalabilité, pas la réécriture.

## 1. Ce qu'est PASSIO

Réseau social **centré sur les passions et les identités multiples**. Un utilisateur n'est pas réduit à un profil algorithmique unique : il peut être photographe, motard, cuisinier, voyageur… et compartimenter ces identités. Le **multi-profil passionnel** est le concept produit central.

Piliers fonctionnels présents dans le code : feed social, profils multi-passions, posts/vlogs, stories/bobines, commentaires+réactions, messagerie (texte/vocal/média, appels WebRTC), événements **IRL** (RSVP, liste d'attente, check-in QR, badges), **Carnets de voyage (CDV)** collaboratifs (lives, étapes, budget, passeport), explore/IA, wallet, modération.

## 2. Stack détectée (factuel)

| Couche | Réalité |
|---|---|
| Frontend | **Vanilla JS, pas de framework, pas de bundler**. `index.html` (~113 Ko) + `styles.css` (~301 Ko, ~6300 lignes) + 20 fichiers JS. |
| Logique app | `js/app-01`…`app-09` (~1,7 Mo cumulés), scripts classiques partageant `window`, **ordre de chargement = dépendances par hoisting**. |
| Backend | **Supabase** (Postgres + Auth + Realtime + Storage + Edge Functions). ~30 tables, RLS par propriétaire (`auth.uid()::text`). |
| État local | `localStorage` (`passio_mvp_state_v1`), conversations en **IndexedDB** (`js/idb-store.js`) + cache localStorage. |
| Build | `scripts/build.js` ré-assemble les 9 `app-*.js` en un monolithe `dist/` (hoisting identique). |
| CI/CD | GitHub Actions (`.github/workflows/deploy.yml`) : `audit-globals` → Playwright → build → minify → **Netlify** (`passio-app.netlify.app`). |
| PWA | `sw.js`, `manifest.json`, cadrage `--app-vh`, push. |
| Télémétrie | `js/telemetry.js` (IIFE strict, PII-safe) → `telemetry_events` → dashboard `dashboard/` (Node/Express + SPA, hors build). |
| Accès beta | `js/access-gate.js`, code `2125` (voir `docs/SECURITE_CODE_ACCES.md`). |
| Tests | Playwright e2e (`tests/e2e/`, ~15 specs dont multi-comptes), audits statiques `audit:globals` / `audit:handlers`. |

## 3. Architecture actuelle — forces

- **Découpage discipliné** malgré le vanilla : responsabilités claires par fichier (01 diag/seed → 09 boot/pwa), documentées.
- **Invariants explicites et outillés** : `findPostAnywhere`, `supaTs`, 3 helpers d'échappement, guards de rendu, RLS par propriétaire — le tout listé dans `docs/PIEGES_CONNUS.md` et vérifié par le subagent `audit-passio` + audits CI.
- **CI qui garde les régressions systémiques** : `audit-globals` attrape les collisions de `window` (le risque n°1 de ce modèle multi-script).
- **Realtime + durabilité** : write-through IndexedDB pour les conversations, canal realtime unique.
- **Sécurité applicative sérieuse pour l'échelle** : XSS stockés corrigés (2026-07-02), anti-flood serveur, RLS v2.
- **Mémoire projet réelle** : docs riches (audits, runbook de scale, pièges), skills/subagents locaux.

## 4. Architecture actuelle — faiblesses / risques

| # | Risque | Gravité | Preuve |
|---|---|---|---|
| A1 | **Collisions de globals** : 17+ scripts sur `window`, une `function` top-level redéclarée est écrasée en silence. | Élevé (maîtrisé par CI) | `scripts/audit-globals.js`, fiche PIEGES. |
| A2 | **Fichiers app monstres** (`app-03` 257 Ko, `app-07` 274 Ko) : coût cognitif, risque de couplage caché. | Moyen | `ls js/`. |
| A3 | **Schéma prod ≠ migrations repo** : le repo n'est pas la source de vérité SQL. | Élevé | Mémoire projet, `migration-checker`. |
| A4 | **Confidentialité SMTP** : « Confirm email » désactivé (pas de SMTP), mailer 2/h → à configurer avant réactivation. | Élevé (P0 produit) | Mémoire `compte-sync-photos`. |
| A5 | **base64 en base = interdit** mais historiquement présent (vocaux) → dette Storage. | Moyen | Fiche PIEGES, `idb-store`. |
| A6 | **Catch large** masquant des ReferenceError (bug diagLog = fil vide 6 j). | Moyen | Fiche PIEGES. |
| A7 | **Code d'accès en clair** côté client (`2125`) — protection beta, pas sécurité. | Faible (assumé) | `js/access-gate.js`. |
| A8 | **Clé anon Supabase côté client** (normal Supabase, mais dépend 100% de RLS pour la sûreté). | Structurel | `app-08`. |

## 5. Tests

- **Couverts** : smoke, access-gate, feed ranking, feed malformé, IRL, CDV, navigation, contextual-nav, interactions, profils-types, **multi-comptes** (la seule preuve des RLS + realtime cross-compte), dist-build.
- **Lacunes** : pas de tests de charge, couverture partielle des parcours critiques (suppression de compte, changement de confidentialité, blocage bout-en-bout). Voir `.passio/context/TESTING_STRATEGY` (à venir) et `PASSIO_TECHNICAL_ROADMAP.md`.

## 6. Sécurité (synthèse — détail : `.passio/audits/SECURITY_AUDIT.md`)

Modèle de confiance = **RLS Supabase par propriétaire**. Le front est hostile par construction (clé anon publique). Points vérifiés : échappement 3-helpers, anti-flood, RLS v2, RGPD delete policies. Points de vigilance : tout payload librement insérable (`comment_interactions`, `event_reactions`, média) DOIT être échappé à l'affichage ; tout UPDATE/DELETE touchant 0 ligne = RLS manquante à investiguer.

## 7. Performance (synthèse — détail : `.passio/audits/PERFORMANCE_AUDIT.md`)

Optimisations déjà faites (2026-07-15) : CSS externalisé (HTML 364→134 Ko), `saveState` débouncé, canal realtime unique, downscale images upload, index prod vérifiés. Rapports Lighthouse présents (`docs/lighthouse-*`). Hotspot structurel : taille de `app-*.js` (parse JS) et `styles.css`.

## 8. Documentation & DevOps

Très fournie (docs/ + dashboard/ + runbook de scale). CI robuste. Déploiement automatique sur push `main` = **tout push main = prod** → discipline de commit critique (cf. `CLAUDE.md`, hook `stage-edited-file.js`).

## 9. Verdict

**App mûre, bien gardée, avec une dette maîtrisée et documentée.** Les priorités ne sont pas architecturales-de-fond mais opérationnelles : (P0) SMTP/confidentialité, cohérence schéma prod↔repo, dette base64→Storage ; (P1) découpage des gros fichiers, couverture de tests des parcours sensibles. Détail chiffré et séquencé dans `PASSIO_TECHNICAL_ROADMAP.md`.
