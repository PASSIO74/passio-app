---
name: migration
description: Crée et applique une migration SQL Supabase en prod pour PASSIO, en respectant les invariants du projet (schéma prod ≠ migrations repo, RLS par propriétaire, publication realtime, timestamptz). À utiliser quand Benjamin demande une nouvelle table/colonne/policy Supabase, ou dit "migration", "ajoute une colonne", "nouvelle table".
---

# /migration — Migration Supabase PASSIO

⚠️ **Le schéma prod n'est PAS le miroir exact des fichiers `migrations/` du repo.** Toujours vérifier l'état réel avant d'écrire.

## Étapes

1. **Inspecter l'existant en prod** avant toute écriture :
   ```
   supabase db query --linked "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='<table>'"
   ```
   Pour une nouvelle table, vérifier qu'elle n'existe pas déjà.

2. **Écrire le fichier** `migrations/migration_<nom>.sql`. Checklist des invariants PASSIO :
   - **RLS activée** + policies. Défaut = propriété : `USING (auth.uid()::text = <owner_col>)`. Insert cross-user autorisé seulement si justifié (ex. notifications : `WITH CHECK (true)`).
   - **Timestamps** : choisir `timestamptz` pour les nouvelles colonnes (le client lit tout via `supaTs()`, qui gère les deux). Noter dans CLAUDE.md si c'est un `timestamp` sans fuseau.
   - **FK vers `profiles`** si la colonne référence un utilisateur (sinon les embeds PostgREST `profiles(...)` renvoient 400).
   - **Realtime** : si le client doit recevoir les changements en direct, ajouter la table à la publication :
     `ALTER PUBLICATION supabase_realtime ADD TABLE <table>;`
   - **Fonctions de visibilité** : si ça touche du contenu privé, réutiliser `post_is_visible` / `can_edit_post` (SECURITY DEFINER) plutôt que de dupliquer la logique.

3. **Appliquer en prod** :
   ```
   supabase db query --linked --file migrations/migration_<nom>.sql
   ```
   (ou `supabase db query --linked "<SQL>"` pour un one-shot).

4. **Vérifier** que c'est bien passé — re-query `information_schema` / `pg_policies` / `pg_publication_tables`.

5. **Simuler les rôles** si c'est une policy de lecture sensible (étranger / abonné / auteur / anon) via `SET LOCAL role` + `request.jwt.claims`, comme documenté dans CLAUDE.md pour les migrations de confidentialité.

6. **Documenter** : ajouter dans CLAUDE.md « migration `migration_<nom>.sql` (**appliquée en prod** le <date>) » avec la description de ce qu'elle fait et les pièges.

7. **Côté client** : brancher les fonctions `supa*` correspondantes (app-08), avec le filet « colonne inconnue retirée une à une » dans `supaUpsertProfile`/inserts si la colonne peut manquer chez d'anciens environnements.

## Ne pas faire
- Pas de `supabase db push` aveugle (le repo n'est pas la source de vérité).
- Pas de base64 en DB (médias → Storage via `supaUploadMedia`).
- Ne pas supprimer les tables filles avant la parente si les FK sont en `ON DELETE CASCADE`.
