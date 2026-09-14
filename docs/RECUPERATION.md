# PASSIO — Récupération

> État au 2026-09-14. Ce document distingue trois choses qu'on confond d'habitude : ce qui est **sauvegardé**, ce qui est **vérifié**, et ce qui est **restauré**. Depuis le 2026-09-14 au soir, les trois sont acquises — et la troisième l'est parce qu'elle a été FAITE, pas décrite.

## Verdict

**Une archive complète est produite chaque nuit, vérifiée, et elle a été RESTAURÉE de bout en bout dans un second projet : 40 tables, 8 comptes, 67 médias, 0 écart. La base reconstruite est structurellement identique à la production (16 compteurs d'objets égaux, mêmes avertissements `get_advisors`) et se comporte comme elle à la frontière anonyme.**

Ce qui manquait n'était pas un fichier, c'était l'exercice (EXP-01, contre-revue Astra : « personne n'a jamais reconstruit la base de bout en bout »). Il est fait, et les six défauts qu'il a révélés sont écrits plus bas — **aucun n'aurait été trouvé en relisant**.

## Les trois outils, dans l'ordre d'une reprise

```bash
npm run sauvegarde -- --complete                              # ① l'archive (données + comptes + médias)
npm run schema:executable                                     # ② le DDL de la prod (structure seule)
npm run restaurer -- --archive <dossier> --projet <ref> --schema <ddl.sql>   # ③ tout reverser, puis compter
```

| Outil | Ce qu'il fait | Ce qu'il rend |
|---|---|---|
| `scripts/sauvegarde-donnees.js` | export NDJSON par table (PostgREST, `service_role`), comptes par l'API d'administration, médias par l'API Storage ; `--verifier` relit l'archive | manifeste avec décompte serveur par table |
| `scripts/schema-executable.js` | lit le **catalogue** Postgres de la production par l'API de gestion (canal ③ d'ADR-012, jamais la CLI) et rend un DDL en une transaction, rejouable : extensions, séquences, tables, contraintes, index, fonctions, vues, déclencheurs, RLS, policies, privilèges de table/colonne/fonction, publication realtime, seaux, cron | `.passio/sauvegardes/schema-<date>.sql` (hors git : une photographie) |
| `scripts/restaurer-donnees.js` | ① schéma (applique `--schema` si des tables manquent) · ② comptes **avec leur identifiant d'origine** · ③ tables par lots SQL, triggers utilisateur coupés, parents d'abord · ④ médias, chemins préservés · ⑤ verdict : chaque table recomptée sur la cible contre le manifeste, comptes, objets Storage | `✅ restauration prouvée` ou la liste des écarts, exit 1 |

**Garde :** `restaurer` refuse la production (`njkiyoklssvefstljemx`, en dur) ET le projet écrit dans le manifeste de l'archive. On ne restaure jamais par-dessus la source. `--purger` vide la cible (même garde) : c'est ce qui rend l'exercice rejouable.

## L'exercice du 2026-09-14, mesuré

Cible : projet « PASSIO staging » (`fcksxofaelcdmmifnwjo`, `eu-west-1`, PG 17.6 comme la prod), **réactivé** par l'API de gestion (`POST /v1/projects/<ref>/restore`) après 28 jours de pause (créé le 2026-08-17, jamais servi).

| Étape | Résultat |
|---|---|
| Artefact de la nuit (`sauvegarde.yml`, run du 14/09 08:05) téléchargé, **déchiffré avec la phrase de repli** (SHA-256 de `service_role`, aucun secret `SAUVEGARDE_PASSPHRASE` posé), relu : 38 tables + 8 comptes conformes | ✅ la chaîne CI → poste fonctionne |
| DDL de la prod appliqué sur la base vide : 697 instructions, 16 sections | ✅ 43 tables, 317 colonnes, 123 policies, 38 triggers, 50 fonctions, 117 index, 92 contraintes, 3 vues, 3 cron, 25 tables realtime, 2 seaux, 286 grants anon, 1 127 privilèges de colonne anon, EXECUTE anon 9 / authenticated 27 — **tous égaux à la production** |
| DDL **rejoué** sur la base déjà semée | ✅ 201, rien ne casse, rien ne se duplique |
| Archive du 14/09 20:19 (fraîche, `--complete`) reversée | ✅ 40 tables, 8 comptes, 67 médias (79,7 Mo), **0 écart** |
| Sonde anonyme sur staging (clé anon) : `profiles` 200, `conv_messages` 200 vide, `events.address` **401**, `event_attendees` **401**, `user_state` 200 vide | ✅ identique à la production |
| `get_advisors` sécurité, staging vs prod | ✅ identiques — sauf `auth_leaked_password_protection`, réglage d'authentification que ni l'archive ni le DDL ne portent (voir « ce qu'une restauration ne rend pas ») |

Puis la cible a été **purgée** (`--purger`) : une copie des données réelles n'a rien à faire dans un second projet une fois la preuve écrite. Le schéma reste ; l'exercice se rejoue en quatre minutes.

## Les six défauts que l'exercice a révélés — et pourquoi la relecture ne les voyait pas

1. **`insert … select * from json_populate_recordset` pose NULL sur toute colonne absente du JSON.** Une colonne ajoutée APRÈS l'archive (`follows.created_at`, `reports.status`, toutes deux du 11/09) n'obtenait jamais son DEFAULT : NOT NULL refusé, table entière perdue. La liste de colonnes est désormais explicite (celles que l'archive porte ∩ celles que la cible connaît).
2. **Une archive antérieure à une contrainte porte des lignes que le schéma actuel refuse.** L'archive du 11/09 contient 15 + 35 + 47 lignes `event_*` orphelines (`event_id = 'e1'`, un identifiant de démonstration) — exactement celles que la migration de cascade du 14/09 a purgées. Un lot est atomique : une ligne refusée faisait tomber tout le lot. Le rejeu se fait ligne à ligne **dans la base** (un seul aller-retour, l'API plafonne à ~60 appels/min — mesuré : 429 « ThrottlerException »), et chaque motif de refus est nommé avec son nombre. **Un écart au verdict est une information, pas un échec du script.**
3. **Un seul `user_state` pèse 4,7 Mo** — plus que ce que l'API de gestion accepte (413). Il passe par PostgREST, triggers actifs, et c'est écrit dans le bilan. (C'est aussi une donnée de capacité : un compte porte un blob de 4,7 Mo, probablement des vocaux en base64 dans l'état — PERF-04 à mesurer.)
4. **La limite de taille d'un seau n'est pas celle de son contenu.** `content` plafonne à 26 Mo en production et portait une vidéo de 30,9 Mo, déposée avant que la limite ne baisse. Un dépôt à la limite du seau refuse un objet que la production a : le temps de la restauration, les seaux prennent la limite du projet, puis retrouvent celle du schéma.
5. **Les privilèges ne sont pas dans les policies.** Une reconstruction « tables + policies » rend `events.address` lisible sans compte (ce ne sont que des GRANT de colonnes qui le protègent) et `is_conv_member` appelable par `anon` — Supabase donne EXECUTE à PUBLIC à la création, un `revoke … from anon` seul ne ferme rien. Les vues sans `security_invoker` ressortaient en `security_definer_view ERROR`. Le DDL porte désormais privilèges de table, de colonne, d'EXECUTE (PUBLIC révoqué d'abord) et options de vue — c'est la différence entre « la même structure » et « la même frontière ».
6. **Le Storage refuse un `DELETE` SQL direct** (`storage.protect_delete`) : la purge passe par l'API, seau par seau. Et `SCHEMA_PROD_REFERENCE.sql` (08/2026) comme le brouillon `00_ORIGINE_PROD.sql` décrivent un état de 35 tables et 12 fonctions — la production en a 43 et 50. Une photographie ne vaut que datée.

## Ce qu'une restauration NE REND PAS — écrit, pas tu

- **Les mots de passe** : l'export ne porte pas `encrypted_password`. Chaque compte restauré reçoit un mot de passe aléatoire (jamais journalisé) et repasse par « mot de passe oublié ». Les **identités OAuth** (Google) ne sont pas dans l'export non plus. `created_at` des comptes est celui de la restauration (l'API d'administration l'impose).
- **La configuration du projet** : réglages d'authentification (confirmation d'e-mail, longueur de mot de passe, protection contre les mots de passe compromis, captcha), SMTP, secrets des Edge Functions, les Edge Functions elles-mêmes (`supabase functions deploy`), « Allow public access » du Realtime. Ils vivent dans le tableau de bord, pas dans la base. `docs/OUVERTURE_PUBLIQUE_2026-09-11.md` et `docs/SETUP_SMTP_AUTH.md` en sont la liste.
- **Les tables d'observabilité** (`telemetry_events`, `analytics_events`, `client_errors`) : exclues de l'archive par choix, régénérables.
- **Le comportement bout en bout par l'application** : le client porte l'URL de la production en dur (`SUPABASE_URL`, app-08), donc `authz-critical.spec.js` ne sait pas viser le staging. C'est le cœur de SUP-04 (un seul environnement), lot suivant ; en attendant, la frontière a été sondée en REST direct.

## Ce qui reste vrai d'avant

**Le contenu de l'archive est du contenu utilisateur réel.** `.passio/sauvegardes/` est exclu de git ; ne jamais l'y forcer. L'artefact CI est chiffré (`SAUVEGARDE_PASSPHRASE`, sinon SHA-256 de `service_role`), conservé 30 jours ; les médias n'y sont que le dimanche.

**`supabase db dump` est inutilisable ici** (pas de Docker : fichier de 0 octet, code 1). **`supabase db query` est retiré** (ADR-012). Le seul canal vers la structure est l'API de gestion, et c'est celui des trois outils.

**Le plan est Pro** : huit sauvegardes physiques quotidiennes côté Supabase, lisibles par l'API de gestion, restaurables **dans le même projet** uniquement. L'exercice ci-dessus est l'autre voie — celle qui reconstruit ailleurs, avec nos propres fichiers, et qui a été faite.
