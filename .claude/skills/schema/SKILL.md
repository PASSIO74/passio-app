---
name: schema
description: Inspecte et documente le schéma Supabase RÉEL de prod PASSIO (tables, colonnes, FK, index, policies, publication realtime) — le repo n'est pas la source de vérité. À utiliser avant de coder une requête, pour comprendre une table, diagnostiquer un 400, ou quand Benjamin dit "montre le schéma", "quelles colonnes", "structure de la table".
---

# /schema — Schéma prod réel PASSIO

⚠️ **Le schéma prod diverge des fichiers `migrations/`.** Toujours interroger la base réelle (CLI liée, lecture seule).

## Requêtes
- Colonnes :
  ```
  supabase db query --linked "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='<t>' ORDER BY ordinal_position"
  ```
- Toutes les tables publiques :
  ```
  supabase db query --linked "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  ```
- FK :
  ```
  supabase db query --linked "SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='<t>'"
  ```
- Index :
  ```
  supabase db query --linked "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='<t>'"
  ```
- Policies : `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='<t>'`
- Realtime : `SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime'`

## Rappels PASSIO
- Embed `profiles(...)` = **400 sans FK réelle** (seul `posts` a `profiles!author_id`). Pour les autres, résoudre les profils en requête séparée (`_resolveProfilesByIds`).
- Colonnes `timestamp` (posts, conv_messages, notifications, stories, events, profiles) vs `timestamptz` (comment_interactions, event_*, cdv_*, blocks, reports) → toujours `supaTs` côté client.
- Une FK peut exister en prod sans être dans `migrations/supabase_tables.sql` (ex. `conv_messages.conv_id → conversations`).

## Sortie
Documenter la/les tables demandées (colonnes+types, FK, index, policies, realtime oui/non) et signaler tout écart avec le code client (colonne référencée mais absente, embed sans FK). Utile avant `/migration` ou `/feature`.
