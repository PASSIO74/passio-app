# PASSIO — Modèle système canonique

> Vocabulaire et frontières de confiance de référence. Toute feature doit se rattacher à ces entités.
> Source : tables Supabase réelles listées dans `CLAUDE.md` + code `app-*.js`. Marqué **UNKNOWN** là où la prod n'a pas été vérifiée.

## 1. Entités & propriété

| Entité | Table(s) | Propriétaire (RLS) | Notes |
|---|---|---|---|
| ACCOUNT | `auth.users` (Supabase) | soi | Identité racine sécurisée. `MY_UID` = `auth.uid()`. |
| USER / PROFIL | `profiles` | `auth.uid()::text` | Avatar partagé `avatar_url`, passions, confidentialité. |
| PASSION PROFILE | `profile_passions` + état local multi-profil | compte | **Concept central** : identités passionnelles multiples. Voir `.passio/context/MULTI_PROFILE.md`. |
| POST / VLOG | `posts` (`timestamp`) | auteur | Recherche **toujours** via `findPostAnywhere(id)`. |
| MÉDIA | Supabase Storage (buckets) | auteur | **Jamais** base64 en DB. URLs publiques vs signées : cf. audit. |
| RÉACTION POST | `post_likes` / réactions (comment_id===post_id) | acteur | 1 réaction/personne. |
| COMMENTAIRE | `post_comments`, `comment_interactions` (`timestamptz`) | auteur | Payloads librement insérables → **échapper à l'affichage**. |
| STORY / BOBINE | `stories`, `story_views` (`timestamp`) | auteur | |
| FOLLOW | `follows` | suiveur | Cross-compte, `created_at` — vérifier colonnes réelles. |
| BLOCK / REPORT | `blocks`, `reports` (`timestamptz`) | acteur | Modération. |
| CONVERSATION | `conversations`, `conv_members`, `conv_messages`, `conv_reads` | membres | Gros volume, vocaux → IndexedDB local + Supabase. |
| NOTIFICATION | `notifications` (`timestamp`) | destinataire | Cross-compte. |
| ÉVÉNEMENT IRL | `events`, `event_attendees`, `event_comments`, `event_reactions`, `event_feedback` (`timestamptz`) | organisateur / participant | RSVP 3 états, liste d'attente, check-in QR, badges. |
| CARNET (CDV) | `cdv_*` (lives, steps, collaborators, step_interactions) (`timestamptz`) | auteur + collaborateurs | Collaboratif, budget €, vidéo étape. |
| PUSH | `push_subscriptions` | soi | PWA push. |
| TÉLÉMÉTRIE | `telemetry_events` | insert-own, **aucun select** | PII-masqué. |
| ERREURS CLIENT | `client_errors` | insert | Monitoring. |
| MARKETPLACE / WALLET | UNKNOWN (produit futur / wallet partiel) | — | À modéliser avant build. |
| PODCAST | UNKNOWN (roadmap) | — | Pas dans le schéma actuel. |
| PAYMENT / SUBSCRIPTION | UNKNOWN (roadmap) | — | Pas dans le schéma actuel. |

## 2. Frontières de confiance

1. **Le client est hostile.** Clé anon publique + code d'accès en clair → **toute** garantie de sûreté vient de la RLS Postgres, jamais du JS.
2. **Compte ⊃ profils passionnels.** Le compte contrôle ses profils ; un profil ne doit jamais lire/écrire les objets d'un autre compte. Un UPDATE/DELETE touchant 0 ligne = RLS à ajouter, pas un bug à contourner.
3. **Contenu tiers = données, jamais confiance.** Tout ce qu'un autre compte peut insérer (commentaires, réactions, média, messages) est échappé à l'affichage (`escapeHtml` / `escapeJsArg` / `safeUrlAttr`).
4. **Realtime respecte la RLS.** La livraison cross-compte n'est prouvable que par les tests multi-comptes.

## 3. Timestamps

Prod **mixte** : `timestamp` (posts, conv_messages, notifications, stories, events, profiles) et `timestamptz` (comment_interactions, cdv_*, event_*, blocks, reports…). **Toujours `supaTs(s)`**, jamais `new Date(x+"Z")`.

## 4. Ce qui n'existe PAS encore (ne pas présumer)

Podcasts, marketplace transactionnelle, paiements/abonnements, ads. Toute demande sur ces domaines commence par une décision de modélisation (ADR), pas par du code.
