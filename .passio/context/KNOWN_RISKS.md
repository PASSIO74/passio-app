# Registre des risques connus

> Cotation : Prob (probabilité) × Impact × Détectabilité (D=facile à détecter, difficile=passe inaperçu). Mitigation existante notée.

| # | Risque | Catégorie | Prob | Impact | Détect. | Mitigation |
|---|---|---|---|---|---|---|
| R1 | Réactivation « confirm email » sans SMTP → inscriptions bloquées (mailer 2/h) | Produit/Conf. | Moyenne | Élevé | Difficile | Ne réactiver qu'après SMTP configuré (P0). |
| R2 | Médias privés en bucket public (pas d'URL signée) | Confidentialité | Moyenne | Élevé | Difficile | URLs signées (P0). |
| R3 | Schéma prod diverge des migrations repo → 400 / RLS silencieuse | DB | Élevée | Moyen | Moyen | `migration-checker` en gate. |
| R4 | Collision de globals sur nouveau code | Archi | Moyenne | Moyen | Facile | `audit-globals` (CI). |
| R5 | XSS stocké via payload tiers non échappé | Sécurité | Faible | Élevé | Moyen | 3 helpers + `xss-audit`. |
| R6 | Catch large masquant une ReferenceError | Fiabilité | Moyenne | Moyen | Difficile | Revue `audit-passio`, interdiction. |
| R7 | Tout push `main` = déploiement prod | Ops | Moyenne | Élevé | Facile | Discipline commit, hook `stage-edited-file.js`, CI tests avant deploy. |
| R8 | base64 legacy en DB (vocaux) → coût/limites | DB/Perf | Faible | Moyen | Moyen | Migration Storage (P1). |
| R9 | Fuite de données cross-profil | Confidentialité | Faible | Élevé | Difficile | `MULTI_PROFILE.md`, tests cross-profil. |
| R10 | Deux sessions Claude parallèles mélangent des commits | Ops | Faible | Moyen | Facile | Committer au fil de l'eau, hook add ciblé. |

Revoir à chaque `/passio-audit` et `/passio-launch-review`.
