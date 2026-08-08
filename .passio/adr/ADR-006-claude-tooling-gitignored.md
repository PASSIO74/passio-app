# ADR-006 — `.claude/` local (gitignoré), `.passio/` committé

- **Statut** : Accepté
- **Date** : 2026-08-07
- **Contexte** : Le développement de PASSIO est fortement assisté par IA (skills, subagents, hooks). Deux natures d'artefacts cohabitent : la **connaissance durable** (contexte, décisions, audits) et l'**outillage exécutable** (skills `/…`, subagents, permissions, hooks).
- **Décision** :
  - `.claude/` reste **gitignoré** (non versionné) : skills, subagents (`audit-passio`, `migration-checker`, `growth-analyst`), `settings.json`, hooks (`stage-edited-file.js`), `launch.json`. Outillage local à la machine de Benjamin.
  - `.passio/` est **committé** : mémoire canonique (`context/`), décisions (`adr/`), audits (`audits/`), registres, playbooks. La connaissance survit au dépôt et se partage.
- **Conséquences** :
  - (+) Séparation nette connaissance/outillage ; la mémoire projet est versionnée et revue comme du code.
  - (−) Les skills/subagents ne sont pas partagés via git → le **registre** (`SKILLS_REGISTRY.md`, `AGENTS_REGISTRY.md`) documente ce qui existe localement, à défaut de le versionner.
  - Le hook `stage-edited-file.js` n'indexe **que** le fichier édité (plus de `git add -A && push`) pour ne pas mélanger des sessions parallèles ni déployer à chaque frappe.
- **Alternatives écartées** : tout versionner (`.claude/` inclus) — mélangerait config machine et projet ; tout garder local — perdrait la mémoire partageable.
- **Trigger de réexamen** : passage à une équipe multi-développeurs → versionner un sous-ensemble de `.claude/` (skills partagés) via un nouvel ADR.
