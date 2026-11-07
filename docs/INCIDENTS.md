# Passio — procédures d'incident

Écrit le 2026-11-07 à la suite de l'audit de sécurité du 06/11. **À adopter par le responsable, qui doit aussi désigner un suppléant : ce document ne vaut pas adoption.** Aucune de ces procédures n'a encore été exercée en conditions réelles, sauf mention contraire.

## Déroulé commun

1. **Qualifier, et noter l'heure.** Ce qu'on sait, ce qu'on ne sait pas.
2. **Copier les journaux avant qu'ils expirent** : Auth, API, Postgres, et `pg_stat_statements` avant toute remise à zéro.
3. **Couper** : voir le tableau.
4. **Corriger**, avec une preuve : test ou mesure, jamais une impression.
5. **Vérifier en production**, avec `https://passio-app.netlify.app/?equipe=1`.
6. **Écrire le rapport** : `/passio-incident-report`.
7. **Prévenir** : voir « Données personnelles ».

## Par scénario

| Scénario | Couper | Spécifique |
|---|---|---|
| Compte utilisateur compromis | Bannir, révoquer les sessions (aucune commande outillée : à écrire) | Relever ses écritures, prévenir la personne |
| Compte du pilotage compromis | Même chose, plus `[SENTINELLE PAUSE]` | Relire chaque geste, `moderation_actions` ; changer les secrets `PILOTAGE_*` |
| Fuite de clé | Révoquer chez le fournisseur : retirer une valeur d'un fichier ou d'un secret GitHub ne la révoque pas | `service_role` : les archives anciennes restent chiffrées avec une clé qui en dérive |
| Accès non autorisé aux données | Geler, conserver les journaux | Évaluation au titre de l'art. 33 RGPD, voir plus bas |
| Abus massif | `revoke insert … from anon`, `disable_signup`, bandeau distant, coupures | Supprimer par date : `purge_telemetry(7)` est inerte pendant une attaque. Ensuite, `VACUUM FULL telemetry_events` à la main pour rendre la place, en fenêtre calme : verrou exclusif |
| Panne d'un fournisseur | Bandeau distant | Brevo : `docs/SETUP_SMTP_AUTH.md` § 9. Turnstile : interrupteur à écrire, sinon plus de connexion |
| Déploiement défectueux | `npm run rollback:netlify` (1,8 s mesuré le 14/09) | Exercice récent manquant ; `rollback.yml` n'a jamais tourné |
| Chaîne CI ou agent détourné | Issue `[SENTINELLE PAUSE]`, puis retrait du label `claude` | Relire les PR ouvertes et les runs récents ; `docs/CANAL_GITHUB_CLAUDE_CODE.md` |

## Données personnelles

Si des données personnelles ont pu être atteintes :

- **Évaluer le risque et consigner la décision** au registre des violations, même sans notification.
- **Notification à l'autorité compétente sous 72 h** dès lors qu'un risque existe pour les personnes, après en avoir pris connaissance (art. 33 RGPD).
- **Information des personnes concernées** si le risque est élevé (art. 34 RGPD).
- Ces textes se relisent avec un conseil : ce document n'est pas un avis juridique.

## Sauvegardes et reprise

- `docs/RECUPERATION.md` : procédure, exercices passés et limites.
- Les archives de `sauvegarde.yml` sont chiffrées par clé publique `age` depuis le 2026-11-07 (variable `SAUVEGARDE_AGE_PUBLIC`). La clé privée reste hors ligne, en deux copies. Les archives plus anciennes s'ouvrent avec la clé symétrique d'avant.
- Pas de restauration à la minute : la production a 8 sauvegardes quotidiennes, sans PITR.

## Contacts

| Rôle | Qui |
|---|---|
| Responsable | À compléter |
| Suppléant | **À désigner** |
| Conseil juridique | À compléter |
