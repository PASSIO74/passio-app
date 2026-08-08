# PASSIO — Contexte produit

> Ce que gouverne le centre de pilotage. Source : `CLAUDE.md`, `PASSIO_REPOSITORY_AUDIT.md`, code `app-*.js`.

## Le concept central

PASSIO est un **réseau social centré sur les passions et les identités multiples**. Un utilisateur n'est pas réduit à un profil algorithmique unique : il peut être photographe, motard, cuisinier, voyageur… et **compartimenter** ces identités passionnelles.

```
COMPTE  →  UTILISATEUR  →  PROFILS PASSIONNELS  →  PASSIONS  →  CONTEXTES SOCIAUX
```

Le **multi-profil passionnel** est le pilier produit. Voir [`MULTI_PROFILE.md`](MULTI_PROFILE.md). Toute feature, métrique et décision doit se rattacher à ce modèle : le pilotage juge la santé produit à l'aune de l'engagement *passionnel* réel, pas de la vanité.

## Piliers fonctionnels (présents dans le code)

Feed social · profils multi-passions · posts/vlogs · stories/bobines · commentaires + réactions · messagerie (texte/vocal/média, appels WebRTC) · **événements IRL** (RSVP 3 états, liste d'attente, check-in QR, badges) · **Carnets de voyage (CDV)** collaboratifs (lives, étapes, budget, passeport) · explore/IA · wallet · modération.

## Stade & stack

- **Stade** : beta privée en prod (`passio-app.netlify.app`), protégée par code d'accès. ~1659 commits. App **mûre**.
- **Front** : Vanilla JS, **pas de framework, pas de bundler**. `index.html` + `styles.css` (~6300 l.) + `js/app-01..09` (ordre = dépendances par hoisting).
- **Back** : Supabase (Postgres + Auth + Realtime + Storage + Edge Functions), ~30 tables, **RLS par propriétaire** comme unique frontière de sûreté.
- **CI/CD** : GitHub Actions → `audit:globals` → Playwright → build → Netlify. **Tout push `main` = déploiement prod.**
- **Télémétrie** : `js/telemetry.js` (PII-safe) → `telemetry_events` → `dashboard/`.

## Ce qui n'existe PAS encore (ne pas présumer)

Podcasts, marketplace transactionnelle, paiements/abonnements, publicités. Ces domaines sont absents du schéma. Toute demande commence par un **ADR de modélisation**, pas par du code. Cf. `PASSIO_SYSTEM_MODEL.md` §4.

## Références de vérité (ne pas dupliquer, pointer)

- `../CLAUDE.md` — guide opératoire, conventions, invariants critiques.
- `../docs/PIEGES_CONNUS.md` — 56 fiches de pièges par domaine.
- `../docs/SCALE_RUNBOOK.md` — triggers et actions de montée en charge.
- `../PASSIO_SYSTEM_MODEL.md` — entités, propriété, frontières de confiance.
- `../PASSIO_REPOSITORY_AUDIT.md` — état des lieux du dépôt (Wave 1).
