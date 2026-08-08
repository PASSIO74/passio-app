# PASSIO — Vision technique (court / moyen / long terme)

> Principe directeur : **construire avec la vitesse d'une startup, penser avec la rigueur d'un Principal Engineer, sans over-engineering** (§69 du mandat). On n'ajoute de la complexité que quand une contrainte réelle la justifie.

## Aujourd'hui (MVP beta en prod)
Vanilla JS + Supabase. Monolithe front assemblé au build, RLS comme unique frontière de sûreté, Netlify + GitHub Actions. **Ce socle est adapté au stade actuel** (beta privée) et ne doit pas être remplacé par réflexe « Silicon Valley ».

## Court terme (0–90 j) — Fiabiliser
- **Confidentialité/comptes** : SMTP + confirmation e-mail, URLs signées pour médias privés, audit RLS systématique.
- **Cohérence schéma** : faire de `migration-checker` un gate (prod ↔ `migrations/`).
- **Dette base64→Storage** finalisée ; hygiène uploads.
- **Découpage progressif** des fichiers app géants (>200 Ko) sans casser le hoisting (extraction en fichiers app-* ordonnés, jamais de modules ES tant que pas de bundler).

## Moyen terme (3–6 mois) — Structurer pour la croissance
- **Observabilité** : télémétrie déjà en place → tableaux de bord KPI (DAU/rétention/K-factor) exploités pour décider.
- **Recommandation/feed** : améliorer `rankFeedPosts` (fraîcheur × affinité × engagement × diversité), mesuré par A/B (`ab-test`).
- **Multi-profil first-class** : garde-fous d'identité (voir `.passio/context/MULTI_PROFILE.md`) appliqués à feed, notif, recherche, analytics.
- **Scale DB** : index vérifiés, fan-out notifications, pagination — suivre `docs/SCALE_RUNBOOK.md`.

## Long terme (6 mois+) — Plateforme
- Introduire une couche serveur (Edge Functions Supabase déjà utilisées) pour la logique qui ne peut pas vivre côté client (ranking lourd, modération IA, fan-out).
- **Décider par ADR** avant : bundler, framework, microservices, file de messages. Chacun est un **trigger de scale**, pas un défaut.
- IA : modération, découverte, résumé — via Edge Functions + fournisseur (déjà `EDGE_FUNCTION_ASK_AI`).

## Ce qu'on refuse par défaut (jusqu'à trigger explicite)
Kubernetes, Kafka/queues distribuées, microservices, framework front, bundler, réécriture. Chacun ne s'active que quand une métrique le rend nécessaire (cf. `PASSIO_TECHNICAL_ROADMAP.md` §Scale triggers) et via un ADR.
