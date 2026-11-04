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

**Une sauvegarde n'est pas une restauration.** Un cycle complet a été répété le 2026-10-21 sur le staging (RES-14, `docs/RECUPERATION.md`) : une altération refusée, puis une restauration prouvée, avec 0 écart. Chaque reprise se prouve encore par SON verdict : « on a su revenir une fois » ne dit pas « on saura revenir ».

## Restaurer

Procédure complète, étape par étape : `docs/RECUPERATION.md`. Trois points qui coûtent cher si on les découvre en route :

1. **Le schéma est le maillon faible.** L'archive de la NUIT porte son DDL (`schema.sql`, `scripts/schema-executable.js`, identité de réplication comprise). Une sauvegarde locale n'en porte pas. Rejouer `migrations/` ne redonne pas la production : la divergence est connue de longue date sur ce projet. ⚠️ Avant d'ouvrir une base reconstruite, il y a `docs/RECUPERATION.md` ④ : rejouer les migrations de sécurité, puis MESURER l'identité de réplication. `information_schema` ne la voit pas, et une base restaurée sans elle rouvre R25 sans un signe (un DELETE publie de nouveau la clé primaire).
2. **Les identifiants de compte doivent être conservés à l'identique.** Toutes les tables s'y réfèrent par `user_id` en texte ; des comptes recréés avec de nouveaux id donnent une base entière d'orphelins.
3. **Finir par le noyau d'autorisation** : `npx playwright test tests/e2e/authz-critical.spec.js`. Une base restaurée mais ouverte à tous est pire qu'une base absente. Il teste la RLS, PAS le temps réel : l'identité de réplication se mesure à part (point 1).

## Ce qui manque pour prouver la reprise

Une **base cible** — second projet Supabase (gratuit, à détruire après) ou Docker Desktop. C'est une décision de Benjamin, pas du développement. Le signaler quand l'occasion se présente ; ne pas créer de projet ni engager de dépense sans son accord.
