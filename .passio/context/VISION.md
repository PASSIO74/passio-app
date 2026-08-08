# Centre de pilotage PASSIO — Vision

> Ce que le centre de pilotage doit permettre, et ce qu'il refuse d'être.

## Raison d'être

Le centre de pilotage est l'interface depuis laquelle PASSIO est **observé, compris, priorisé, protégé, coordonné et amélioré**. Il répond, en une minute, aux questions de direction :

- Où en est PASSIO ? Les systèmes sont-ils sains ?
- Qu'est-ce qui a changé ? Qu'est-ce qui est bloqué ? Qu'est-ce qui est dangereux ?
- Qu'est-ce qui grandit, qu'est-ce qui décline ?
- Quelles décisions sont requises ? Que faut-il faire ensuite ?

## Deux briques distinctes (ne pas confondre)

| Brique | Nature | Emplacement |
|---|---|---|
| **Application de pilotage** | App Node/Express + SPA temps réel, connectée à `telemetry_events`. Supervision live de la beta. | `dashboard/` (déjà construite, mûre) |
| **Plan de contrôle (« OS »)** | Mémoire, registres, décisions, risques, gouvernance des agents/skills. Versionné. | `.passio/` (ce dossier) |

L'app `dashboard/` **observe** la prod en direct. Le plan de contrôle `.passio/` **gouverne** le développement assisté par IA et conserve la connaissance durable. Les deux servent la même vision.

## Principes directeurs

1. **VÉRITÉ avant complétude.** Une donnée inconnue est marquée `UNKNOWN`, jamais inventée. Un chiffre estimé est marqué `ESTIMATED`. Un chiffre de démo est marqué `MOCK`. Ne jamais fabriquer de certitude.
2. **Un tableau de bord n'affiche jamais une donnée sans provenance.** Chaque métrique porte : valeur, source, fraîcheur, environnement, confiance. Cf. [`METRICS_REGISTRY.md`](../METRICS_REGISTRY.md).
3. **Santé du pilotage ≠ santé de PASSIO.** Si le pilotage ne peut pas lire les données (Supabase non connecté), il l'affiche — il ne prétend jamais que PASSIO va bien.
4. **Pas de sur-ingénierie.** On n'ajoute une brique (alerte, intégration, automatisation) que lorsqu'une contrainte réelle la justifie. Le socle `dashboard/` vanilla + Supabase est adapté au stade beta.
5. **Ne pas dupliquer l'existant.** `.passio/` **pointe** vers `CLAUDE.md`, `docs/PIEGES_CONNUS.md`, `docs/SCALE_RUNBOOK.md` ; il ne les recopie pas.

## Frontières d'action (agents & automatisations)

| Catégorie | Exemple | Règle |
|---|---|---|
| **READ** | Lire la santé, générer un rapport interne | Aucune validation |
| **SAFE WRITE** | Écrire un fichier `.passio/`, un rapport `reports/` | Autonome (réversible) |
| **SENSITIVE WRITE** | Migration Supabase, commit sur `main` (= déploiement prod) | Geste explicite, tests verts d'abord |
| **DESTRUCTIVE** | Purge de données prod, suppression de table | Confirmation explicite, jamais par un agent seul |

Voir [`AGENT_MODEL.md`](AGENT_MODEL.md) pour le détail de la gouvernance des agents.
