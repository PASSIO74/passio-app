---
name: sauvegarde
description: "Sauvegarde et restauration de la prod : données, comptes, médias. Dire : backup, revenir en arrière, restaurer."
---

# /sauvegarde — Sauvegarder et restaurer PASSIO

## Sauvegarder (une commande)

```bash
npm run sauvegarde -- --complete
```

Écrit dans `.passio/sauvegardes/<horodatage>/` : les 32 tables en NDJSON, `_auth_users.ndjson`, `_storage/<seau>/…`, et un `manifeste.json`. Ordres de grandeur en beta : ~1 100 lignes / 5 Mo de base, 220 fichiers / 174 Mo de médias, quelques minutes.

Variantes : `--avec-telemetrie` (ajoute ~11 000 lignes d'observabilité, regénérables — rarement utile), sans `--complete` on n'a **ni les comptes ni les médias**, et le script le dit à l'écran.

Relire une archive : `npm run sauvegarde -- --verifier <dossier>`.

## Trois choses à ne pas oublier

**`supabase db dump` ne marche pas sur la machine de Benjamin.** Il lance `pg_dump` dans un conteneur ; sans Docker il échoue — en laissant à destination **un fichier de 0 octet**. Ne jamais conclure au succès sur la seule présence du fichier.

**Les archives contiennent des données personnelles réelles** — messages, photos, e-mails. `.passio/sauvegardes/` est dans `.gitignore` : ne jamais l'y forcer, ne jamais coller un extrait dans un chat, un dossier de revue ou un ticket.

**Une sauvegarde n'est pas une restauration.** Au 2026-08-16, aucune restauration n'a jamais été exécutée. Dire « on a une sauvegarde » est vrai ; dire « on sait revenir » ne l'est pas encore.

## Restaurer

Procédure complète, étape par étape : `docs/RECUPERATION.md`. Trois points qui coûtent cher si on les découvre en route :

1. **Le schéma est le maillon faible.** L'archive contient des données, pas de structure. Rejouer `migrations/` ne redonne pas forcément la production — la divergence est connue de longue date sur ce projet. Comparer `information_schema` avant d'aller plus loin.
2. **Les identifiants de compte doivent être conservés à l'identique.** Toutes les tables s'y réfèrent par `user_id` en texte ; des comptes recréés avec de nouveaux id donnent une base entière d'orphelins.
3. **Finir par le noyau d'autorisation** : `npx playwright test tests/e2e/authz-critical.spec.js`. Une base restaurée mais ouverte à tous est pire qu'une base absente.

## Ce qui manque pour prouver la reprise

Une **base cible** — second projet Supabase (gratuit, à détruire après) ou Docker Desktop. C'est une décision de Benjamin, pas du développement. Le signaler quand l'occasion se présente ; ne pas créer de projet ni engager de dépense sans son accord.
