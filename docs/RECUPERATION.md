# PASSIO — Récupération

> État au 2026-08-16. Ce document distingue trois choses qu'on confond d'habitude : ce qui est **sauvegardé**, ce qui est **vérifié**, et ce qui est **restauré**. Seules les deux premières sont acquises.

## Verdict

**Une archive complète est produisible et vérifiée. La restauration n'a jamais été exécutée.**

C'est un progrès réel — avant le 2026-08-16 il n'existait aucune sauvegarde exécutable sur cette machine — et ce n'est pas encore une garantie de reprise.

## Ce qui est prouvé

```bash
npm run sauvegarde -- --complete
```

Mesuré le 2026-08-16 sur la production :

| Contenu | Volume | Vérification |
|---|---|---|
| 32 tables du schéma `public` | 1 104 lignes, 5,14 Mo | chaque table recomptée côté serveur (`Prefer: count=exact`) et confrontée à l'export ; écart = échec du script |
| 4 comptes `auth.users` | e-mails, fournisseurs, identifiants | via l'API d'administration — `auth` n'est pas exposé à PostgREST |
| 220 fichiers du Storage | 173,6 Mo | décompte confirmé **indépendamment** par `storage.objects` en SQL (210 + 10) |

Relecture de l'archive : `npm run sauvegarde -- --verifier <dossier>` — 32 tables lisibles, conformes au manifeste, fichiers présents sur le disque au nombre annoncé.

**Le contenu de l'archive est du contenu utilisateur réel.** `.passio/sauvegardes/` est exclu de git pour cette raison ; ne jamais l'y forcer.

## Ce qui n'est pas prouvé, et pourquoi

**La restauration.** Aucune n'a été tentée. Il n'existe sur cette machine ni Docker, ni `psql`, ni base cible : rien pour recharger l'archive. Tant que l'opération n'a pas été faite une fois de bout en bout, « on a une sauvegarde » veut dire « on a des fichiers », pas « on sait revenir ».

**Le schéma.** L'archive contient des **données**, pas la structure. La reconstruction suppose de rejouer `migrations/` — or il est établi de longue date sur ce projet que **le schéma de production diverge des migrations du dépôt**. Rejouer les migrations sur une base vide ne redonnerait donc pas nécessairement la production. Cette moitié de la reprise repose aujourd'hui sur les sauvegardes internes de Supabase, **qui n'ont pas été vérifiées non plus**.

**`supabase db dump` est inutilisable ici.** Il lance `pg_dump` dans un conteneur : sans Docker, il échoue. Il sort correctement en code 1 — mais il laisse à destination **un fichier de 0 octet**. Un script de sauvegarde qui se contenterait de vérifier l'existence du fichier conclurait au succès.

## Procédure de reprise (rédigée, non éprouvée)

1. Recréer un projet Supabase, noter son URL et sa clé `service_role`.
2. Reconstruire le schéma — **c'est l'étape non fiable** : rejouer `migrations/` puis comparer `information_schema` à celui de l'ancienne production, table par table, avant d'aller plus loin.
3. Recréer les comptes depuis `_auth_users.ndjson` (API d'administration). **Les identifiants doivent être conservés à l'identique** : toutes les autres tables s'y réfèrent par `user_id` en texte.
4. Recharger les tables. L'ordre importe : `passions` et `profiles` d'abord, puis les contenus (`posts`, `events`, `cdv_lives`…), puis les interactions.
5. Reverser `_storage/` dans les seaux `content` et `attachments`, en préservant les chemins — les URLs stockées en base les référencent.
6. Rejouer les policies RLS, puis **passer le noyau AUTHZ-CRITICAL** (`npx playwright test tests/e2e/authz-critical.spec.js`) : c'est le seul contrôle qui dise si la base restaurée est aussi *fermée* que l'originale. Une restauration qui rouvre les données de tout le monde est pire que pas de restauration.

## Pour passer de « sauvegardé » à « restaurable »

Une seule chose manque, et elle demande une décision, pas du code : **une base cible**. Deux voies, l'une et l'autre hors de ce qui peut se décider sans supervision —

- un **second projet Supabase** (gratuit) dédié aux essais de restauration, à détruire après ;
- **Docker Desktop** sur cette machine, qui débloquerait aussi `supabase db dump` et une restauration entièrement locale.

L'étape 2 (le schéma) est celle qui échouera en premier. C'est précisément pour cela qu'il faut l'essayer à froid plutôt que le jour où ça compte.
