# `.passio/` — PASSIO AI Engineering OS

Mémoire projet **committée** (versionnée) + plan de contrôle du développement assisté par IA de PASSIO.

## Pourquoi deux emplacements

| Emplacement | Versionné ? | Contenu |
|---|---|---|
| `.passio/` | **Oui** (committé) | Connaissance & mémoire durables : contexte, ADR, audits, playbooks, registre des skills. |
| `.claude/` | Non (gitignoré, cf. ADR-006) | Exécutable local : skills (`/…`), subagents, hooks, permissions. |

Séparation volontaire : la **connaissance** survit au dépôt et se partage ; l'**outillage exécutable** reste local à la machine de Benjamin (choix historique, `.claude/` gitignoré).

## Arborescence

```
.passio/
├── README.md              ← ce fichier
├── SKILLS_REGISTRY.md     ← registre vivant des skills/agents
├── context/               ← mémoire canonique (VISION, DOMAIN, DB, SECURITY, MULTI_PROFILE, RISKS…)
├── adr/                   ← Architecture Decision Records (décisions réelles déjà prises)
├── audits/                ← audits fondateurs (sécu, archi, DB, produit/UX, perf)
├── playbooks/             ← procédures exécutables (feature, bug, migration, incident, launch, red team)
└── reports/              ← rapports datés générés par les commandes /passio-*
```

## Comment ça s'utilise

- `passio-orchestrator` (agent) lit `context/` puis route vers les skills/subagents adaptés.
- Les commandes `/passio-*` (skills) exécutent les playbooks et écrivent leurs sorties dans `reports/`.
- Docs projet plus anciennes restent la référence détaillée : `../CLAUDE.md`, `../docs/PIEGES_CONNUS.md`, `../docs/SCALE_RUNBOOK.md`. `.passio/` **pointe** vers elles, ne les duplique pas.

## Ce que `.passio/` n'est PAS

Un dump documentaire. Chaque fichier est ancré dans le code réel. Là où une info est inconnue, elle est marquée **UNKNOWN** plutôt qu'inventée.
