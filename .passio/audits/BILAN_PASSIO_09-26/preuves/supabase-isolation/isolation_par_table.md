# Preuve d'isolation par table — projet njkiyoklssvefstljemx, 2026-09-04 (SHA audité c8cb8e99)

## Méthode et limites (à lire d'abord)
- `begin; set local role anon; …` et `set local role authenticated` sont REFUSÉS au rôle du connecteur (`ERROR 42501: permission denied to set role "anon"`), et `EXECUTE` sur `is_conv_member` lui est refusé aussi. L'`UPDATE … returning id` sous rôle tiers est donc impossible ici (deux causes : SET ROLE refusé et `transaction_read_only = on`).
- Les appels REST anon (`curl` vers `https://njkiyoklssvefstljemx.supabase.co`) sont BLOQUÉS par le proxy de l'environnement : `CONNECT tunnel failed, response 403`.
- Méthode retenue = **ÉMULATION PAR REQUÊTE** : les `qual` EXACTS des policies SELECT (dump `policies.json`) et le `prosrc` des fonctions helper (`is_conv_member`, `post_is_visible`, `comment_target_visible`) ont été inlinés avec `auth.uid()` substitué par NULL (anon) puis par `'00000000-0000-0000-0000-000000000000'` (compte tiers inexistant). C'est fidèle au moteur RLS (policies PERMISSIVE, OR entre policies d'une même commande), mais ce n'est pas le moteur RLS lui-même → statut CONFORME PAR INSPECTION / PROBABLE, pas PROUVÉ. La preuve exécutée existe ailleurs : `tests/e2e/authz-critical.spec.js` (comptes réels, run CI 33861671142 vert, job « Suites production (comptes réels) »).
- Total réel des lignes (rôle du connecteur, sans RLS) en colonne « total ».

| table | total | anon (uid=NULL) | tiers (uuid inexistant) | attendu | verdict |
|---|---|---|---|---|---|
| profiles | 5 | 5 | 5 | >0 (public) | conforme — colonnes exposées : id, username, emoji, color, passion_id, bio, created_at, avatar_url, cover_url, passions, is_private, rs_links (ni e-mail, ni téléphone, ni année de naissance) |
| posts | 32 | 32 | 32 | >0 (aucun profil is_private en prod : 0) | conforme ; branche « compte privé » NON VÉRIFIABLE sur données (0 profil privé), portée par la policy seule |
| stories | 8 | 8 | 8 | idem posts | idem |
| events / event_attendees / follows | 3 / 17 / 7 | 3 / 17 / 7 | 3 / 17 / 7 | >0 (choix assumé KNOWN_RISKS) | conforme au choix documenté ; RSVP, graphe social et `checked_in_at/rating/feedback` des participants publics |
| passions / passion_relations / user_passions | 1908 / 3830 / 22 | idem | idem | >0 | conforme |
| post_likes / post_comments / comment_interactions | 71 / 86 / 361 | 71 / 86 / 269 | 71 / 86 / (non calculé) | >0 | conforme (269 : 92 interactions ciblent des commentaires/posts introuvables → `comment_target_visible` rend true pour cid inconnu, donc EN RÉALITÉ 361 lisibles ; l'émulation a été plus stricte que la fonction) |
| comment_likes / event_comments / event_reactions / video_lives / step_interactions / post_collaborators / cdv_* | 3 / 34 / 48 / 21 / 6 / 0 / 2+4 | tout | tout | public (USING true) | conforme mais **cdv_* : fonctionnalité RETIRÉE (ADR-011) — données toujours lisibles publiquement** |
| conversations | 117 | 0 | 0 | 0 | conforme |
| conv_members | 7 | 0 | 0 | 0 | conforme |
| conv_messages | 68 | 0 | 0 | 0 | conforme |
| **conv_reads** | 34 | **34** | **34** | 0 | **DÉFAILLANT** : `reads_select USING (true)` — 34 accusés de lecture (conv_id, user_id, last_read_at) de 19 conversations privées lisibles par anon |
| notifications | 188 | 0 | 0 | 0 | conforme |
| user_state | 84 | 0 | 0 | 0 | conforme (blob jsonb jusqu'à 4,8 Mo par ligne) |
| blocks | 0 | 0 | 0 | 0 | conforme (policy) |
| reports | 2 | 0 (aucune policy SELECT) | 0 | 0 | conforme |
| push_subscriptions | 5 | 0 | 0 | 0 | conforme |
| story_views | 7 | 0 | 0 | 0 | conforme |
| user_safety | 2 | 0 (aucun grant anon) | 0 | 0 | conforme |
| telemetry_events | 111 829 | 0 (aucune policy SELECT) | 0 | 0 | conforme |
| analytics_events | 3 855 | 0 (aucune policy SELECT) | 0 | 0 | conforme |
| client_errors | 16 | 0 (aucune policy SELECT) | 0 | 0 | conforme |
| passion_requests | 0 | 0 | 0 | 0 | conforme |
| storage.objects (content + attachments) | 70 | **70** | **70** | 0 pour attachments | **DÉFAILLANT** : `passio_media_read` rend LISTABLES et lisibles les 12 pièces jointes vocales de conversations privées (`attachments/conv_<id>/<ts>_voice.webm`), buckets `public=true` |

## UPDATE / DELETE émulés pour le tiers (lignes que ses quals USING lui laisseraient toucher)
posts UPDATE 0 · posts DELETE 0 · profiles UPDATE/DELETE 0 · conv_messages UPDATE/DELETE 0 · notifications UPDATE/DELETE 0 · events UPDATE 0 · events DELETE 0 · user_state 0 · conv_members DELETE 0 · stories DELETE 0 · storage.objects UPDATE/DELETE 0 → un tiers ne touche AUCUNE ligne existante (émulation).

## Intégrité observée (rôle connecteur)
- 113 conversations sur 117 n'ont AUCUN membre (orphelines ; `conv_members` = 7 lignes) ; 2 messages émis par un non-membre ; 27 `conv_reads` posés par un non-membre (la policy INSERT n'exige que `user_id = auth.uid()`, pas l'appartenance).
- 5 messages portent une URL publique `/storage/v1/object/public/attachments/…` dans `content`.
- 0 base64 en `conv_messages.content` / `posts.media_url`.
- Tous les objets Storage ont un `owner` (70/70) → DELETE/UPDATE propriétaire opérants.
