# ADR-005 — `supaTs()` pour tous les timestamps (prod mixte)

- **Statut** : Accepté
- **Date** : 2026-07-02 (formalisé lors de l'audit)
- **Contexte** : La prod mélange des colonnes `timestamp` **sans** fuseau (posts, conv_messages, notifications, stories, events, profiles) et `timestamptz` **avec** offset (comment_interactions, event_*, cdv_*, blocks, reports…). L'ancien pattern `new Date(x + "Z")` donnait `NaN` (« Invalid Date ») sur les `timestamptz`.
- **Décision** : Toujours parser via **`supaTs(s)`** (défini en `app-02`), qui gère les deux formats + le format realtime. `new Date(x+"Z")` est proscrit.
- **Conséquences** :
  - (+) Dates correctes quelle que soit la colonne, robustesse realtime.
  - Interdit désormais : `new Date(x+"Z")` sur une valeur Supabase.
  - Rappel : le repo n'est pas la source de vérité SQL → vérifier le type réel de colonne (`schema`/`migration-checker`) avant de présumer.
- **Alternatives écartées** : normaliser toutes les colonnes en `timestamptz` (migration lourde et risquée sur données prod ; le helper résout le problème sans toucher aux données).
- **Trigger de réexamen** : uniformisation future du schéma en `timestamptz` (migration dédiée + ADR) rendrait le helper trivial, sans le supprimer.
