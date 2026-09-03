---
name: schema
description: "Schéma Supabase réel de prod : quelles colonnes a la table, types, FK, index, policies, realtime. Diagnostiquer un 400."
---

# /schema — Schéma prod réel PASSIO

⚠️ **Le schéma prod diverge des fichiers `migrations/`.** Toujours interroger la base réelle via le connecteur `supabase-passio-readonly` (ADR-012, canal ① — lecture seule).

## Requêtes
- Colonnes :
  ```
  execute_sql  (connecteur supabase-passio-readonly)
  SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='<t>' ORDER BY ordinal_position
  ```
- Toutes les tables publiques : outil dédié `list_tables` (`schemas=["public"]`), pas de requête brute. `verbose=true` rend aussi colonnes, clés primaires et FK.
- FK :
  ```
  execute_sql  (connecteur supabase-passio-readonly)
  SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='<t>'
  ```
- Index :
  ```
  execute_sql  (connecteur supabase-passio-readonly)
  SELECT indexname, indexdef FROM pg_indexes WHERE tablename='<t>'
  ```
- Policies : `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='<t>'`
- Realtime : `SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime'`

## Rappels PASSIO
- Embed `profiles(...)` = **400 sans FK réelle** (seul `posts` a `profiles!author_id`). Pour les autres, résoudre les profils en requête séparée (`_resolveProfilesByIds`).
- Colonnes `timestamp` (posts, conv_messages, notifications, stories, events, profiles) vs `timestamptz` (comment_interactions, event_*, cdv_*, blocks, reports) → toujours `supaTs` côté client.
- Une FK peut exister en prod sans être dans `migrations/supabase_tables.sql` (ex. `conv_messages.conv_id → conversations`).

## Sortie
Documenter la/les tables demandées (colonnes+types, FK, index, policies, realtime oui/non) et signaler tout écart avec le code client (colonne référencée mais absente, embed sans FK). Utile avant `/migration` ou `/feature`.
