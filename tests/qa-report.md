# Rapport de campagne QA — PASSIO

- Généré : 2026-08-09T08:35:01.999Z
- Durée : 71s
- Utilisateurs : 7/10
- Version app : inconnu

## Synthèse

| Total | PASS | FAIL | WARN | Taux | Latence p50 | p95 | max |
|--:|--:|--:|--:|--:|--:|--:|--:|
| 15 | 15 | 0 | 0 | 100% | 712ms | 1234ms | 1234ms |

Transferts : 12 livrés / 12 · perdus 0 · dupliqués 0

## Conclusion

- **TRANSFERT DE DONNÉES FIABLE : OUI**
- **SYNCHRONISATION MULTI-APPAREILS FIABLE : OUI**
- **REALTIME FIABLE : OUI**
- **CENTRE DE PILOTAGE COHÉRENT : OUI**
- **RISQUE DE PERTE DE DONNÉES : FAIBLE**
- **PRÊT POUR DES TESTS UTILISATEURS RÉELS : OUI**

## Par fonctionnalité

| Fonction | Total | PASS | FAIL | WARN | Latence p50 |
|--|--:|--:|--:|--:|--:|
| FOLLOW | 1 | 1 | 0 | 0 | —ms |
| MESSAGE | 8 | 8 | 0 | 0 | 712ms |
| PUBLISH | 1 | 1 | 0 | 0 | 636ms |
| LIKE | 1 | 1 | 0 | 0 | 805ms |
| COMMENT | 1 | 1 | 0 | 0 | 774ms |
| REACTION | 1 | 1 | 0 | 0 | 476ms |
| NOTIF | 1 | 1 | 0 | 0 | —ms |
| EVENT | 1 | 1 | 0 | 0 | —ms |

## Matrice de communication (messagerie)

| De | Vers | Statut | Latence |
|--|--|--|--:|
| Alice QA | Bruno QA | PASS | 846ms |
| Bruno QA | Chloé QA | PASS | 1234ms |
| Chloé QA | David QA | PASS | 716ms |
| David QA | Emma QA | PASS | 560ms |
| Emma QA | Farid QA | PASS | 712ms |
| Farid QA | Gaby QA | PASS | 424ms |
| Alice QA | Farid QA | PASS | 530ms |
| Alice QA | Bruno QA | PASS | 165ms |

## Intégrité

- ✅ compteur likes == lignes post_likes — UI=1, DB=1
- ✅ aucun auto-follow (follower==following) — 0 trouvé(s)
