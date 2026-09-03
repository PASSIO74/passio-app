---
name: rls-audit
description: "Audit des policies RLS Supabase : confidentialité, comptes privés, mutation à 0 ligne. Dire : droits, qui peut voir quoi."
---

# /rls-audit — Audit RLS PASSIO

Délègue de préférence au subagent `migration-checker` pour l'inventaire, puis simule les rôles.

## Inventaire (prod réelle, lecture seule)
```
supabase db query --linked "SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('posts','post_comments','post_likes','comment_interactions','events','event_attendees','event_reactions','cdv_lives','cdv_live_steps','profiles','conv_messages') ORDER BY tablename, cmd"
```

## Points de contrôle
- **Mutation muette** : chaque table modifiable doit avoir une policy UPDATE et/ou DELETE. Une absente = mutation qui touche **0 ligne en silence** (l'app dit « mis à jour » mais rien ne bouge). Cas passés : `cdv_live_steps` (pas de UPDATE), `cdv_live_reactions` (pas de DELETE → toggle bloqué), events co-organisateurs.
- **Comptes privés** : `posts` filtre « auteur OU non-privé OU abonné (follows) ». `post_comments`/`post_likes`/`comment_interactions` via `post_is_visible(pid)`/`comment_target_visible(cid)` (SECURITY DEFINER, ne prennent PAS l'uid en paramètre). Contrainte beta : « pas de ligne posts = visible » (contenu seed orphelin).
- **can_edit_post / posts_freeze_author** : carnets collaboratifs — la propriété `author_id` est gelée par trigger (un WITH CHECK ne suffit pas).
- **Insert cross-user** justifié seulement pour les notifications (`WITH CHECK (true)`, pseudo échappé).

## Simuler les rôles
Rejouer une requête sous différents rôles via `SET LOCAL role` + `request.jwt.claims` (étranger / abonné / auteur / anon) et vérifier : étranger ne voit ni post privé ni ses cmt/like/réactions, abonné oui, auteur oui, anon voit les publics + orphelins.

## Validation ultime
Les policies cross-compte ne sont réellement prouvées que par `/e2e-multi` en base réelle. Un test mono-compte ne voit jamais un UPDATE à 0 ligne.

## Rapport
Divergences, policies manquantes/risquées avec scénario d'échec, verdict clair.
