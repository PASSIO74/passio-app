# PASSIO — Roadmap technique

> Priorités : **P0** critique (sécurité/confidentialité/prod), **P1** majeur, **P2** standard, **P3** optimisation, **P4** exploration.
> Complète (ne remplace pas) `docs/CHECKLIST_COMMERCIALISATION.md` et `docs/SCALE_RUNBOOK.md`.

## IMMÉDIAT (P0)
| Item | Impact | Risque | Validation |
|---|---|---|---|
| **SMTP + confirmation e-mail** | Confidentialité, anti-usurpation | Réactiver sans SMTP = mailer 2/h qui bloque les inscriptions | Inscription réelle → e-mail reçu ; mémoire `compte-sync-photos`. |
| **URLs signées médias privés** | Fuite de contenu privé | Buckets publics exposent les médias | Média privé inaccessible sans signature ; `.passio/audits/SECURITY_AUDIT.md`. |
| **Gate `migration-checker` prod↔repo** | Évite 400 / RLS silencieuse | Schéma prod diverge du repo | Subagent vert avant toute migration. |

## COURT (30 j, P1)
- Dette **base64→Storage** finalisée (vocaux, médias legacy).
- Tests des **parcours sensibles** : suppression de compte, changement de confidentialité, blocage bout-en-bout, cross-profil (voir stratégie de test).
- **Régressions de sécurité en tests** : ownership, autorisation, accès cross-profil, contenu privé (issues de l'audit → specs Playwright multi-comptes).

## MOYEN (90 j, P1/P2)
- **Découpage** des fichiers app > 200 Ko (app-03, app-04, app-07) en unités ordonnées, hoisting préservé, `audit-globals` vert.
- **Feed ranking** mesuré (`ab-test`) : diversité + anti-fraîcheur-uniquement.
- **KPI produit** exploités (dashboard) : DAU/WAU, rétention J1/J7/J30, K-factor, création de contenu.
- **Observabilité** : redaction PII confirmée, error budgets légers.

## 6 MOIS (P2/P3)
- Edge Functions pour logique sensible (ranking, fan-out notif, modération IA).
- i18n : préparer l'extraction des chaînes (aucune dépendance lourde tant que non nécessaire).
- Accessibilité : passe AA systématique (skill `a11y`).

## SCALE TRIGGERS (n'implémenter QUE si atteint)
| Trigger | Action déclenchée | ADR requis |
|---|---|---|
| Feed lent à > ~50k posts actifs | ranking côté serveur (Edge/DB) | oui |
| Fan-out notif coûteux à > ~100k users | table de fan-out / job | oui |
| Parse JS front trop lourd | envisager un bundler (pas avant) | oui |
| Volume média > coût Storage acceptable | CDN/transcodage | oui |

## EXPLORATION (P4)
Podcasts, marketplace transactionnelle, paiements/abonnements, IA de découverte. **Chacun commence par un ADR de modélisation** (entités absentes du schéma — cf. `PASSIO_SYSTEM_MODEL.md` §4).
