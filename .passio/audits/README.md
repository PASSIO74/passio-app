# Audits — index

Audits fondateurs du plan de contrôle. Chaque audit est **daté** et ancré dans des preuves (code, prod, rapports), jamais dans le cahier des charges.

| Audit | Fichier | Dernière passe |
|---|---|---|
| Dépôt (reconnaissance Wave 1) | [`../../PASSIO_REPOSITORY_AUDIT.md`](../../PASSIO_REPOSITORY_AUDIT.md) | 2026-08-07 |
| Sécurité | [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) | 2026-08-08 |
| Performance | [`PERFORMANCE_AUDIT.md`](PERFORMANCE_AUDIT.md) | 2026-08-08 |
| Système d'agents/skills | via [`../AGENTS_REGISTRY.md`](../AGENTS_REGISTRY.md) + [`../SKILLS_REGISTRY.md`](../SKILLS_REGISTRY.md) | 2026-08-08 |

## Audits historiques (docs/)
Le dépôt contient des audits antérieurs riches : `docs/AUDIT_EXECUTIVE_SUMMARY.md`, `docs/AUDIT_COMPLET_BUGS.md`, `docs/AUDIT_FINAL_10_POINTS.md`, `docs/CONTROLE_16_MISSIONS.md`. `.passio/audits/` **pointe** vers eux, ne les recopie pas.

## À planifier (mandat Control Center §99 — seulement si valeur)
- Audit **UX/accessibilité** dédié (le skill `a11y` produit déjà des passes ponctuelles).
- Audit **data** (qualité/provenance des métriques — largement couvert par `../METRICS_REGISTRY.md`).
- Audit **architecture du dashboard** (cf. `dashboard/docs/`).
