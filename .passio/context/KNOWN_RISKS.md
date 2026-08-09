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

## Remédiations appliquées

- **2026-08-09 — Durcissement advisors (prod).** `migrations/migration_security_hardening.sql` : 3 vues SECURITY DEFINER (`telemetry_last24h`, `client_errors_top_24h`, `client_errors_par_heure`) passées en `security_invoker` (erreurs advisor corrigées) ; EXECUTE révoqué à `PUBLIC/anon/authenticated` sur les fonctions trigger/maintenance (`purge_telemetry`, `rate_limit_insert`, `broadcast_conv_message_to_users`, `posts_freeze_author`) — **`purge_telemetry` n'était appelable par n'importe qui** ; `search_path` épinglé. Non-régression : `multi-comptes` (messagerie + notifications) vert. Restent, **volontairement**, les WARN sur `post_is_visible`/`can_edit_post`/`comment_target_visible` (helpers de policies RLS → `authenticated` doit garder EXECUTE) et `auth_leaked_password_protection` (toggle Auth gratuit → `docs/SETUP_SMTP_AUTH.md`).

Revoir à chaque `/passio-audit` et `/passio-launch-review`.
