# Requêtes base (lecture seule, connecteur supabase-passio-readonly) — domaine profils-passions — 2026-09-04, SHA c8cb8e99

Identifiants de compte tronqués à 8 caractères ; aucune donnée personnelle recopiée.

## 1. Colonnes `passion_id` / identité d'affichage (information_schema.columns)
- `passion_id` : conversations, events, posts, profiles, stories, user_passions — **aucune table d'interaction** (post_comments, post_likes, comment_interactions, event_attendees, event_reactions, follows, notifications, conv_messages n'en portent pas). ADR-007 toujours vrai.
- `author_name` : cdv_live_comments, event_comments, step_interactions, video_lives (les 4 tables portant `trg_identite_affichage`). posts/post_comments/conv_messages n'ont PAS de colonne d'identité : l'affichage passe par l'embed `profiles!author_id(username,emoji,color,avatar_url,is_private)` (app-03:17) et `_resolveProfilesByIds` (app-03:66).

## 2. Policies user_passions (pg_policies)
- select_all : `true` · insert_own : `user_id = auth.uid()::text` · update_own : idem (qual + with_check) · delete_own : idem.
- **Aucune contrainte de nombre** (ni policy, ni trigger, ni check) : le plafond « 3 passions » n'existe pas côté serveur. profiles : « Update propre » `id = auth.uid()::text`, sans contrainte sur le jsonb `passions`.
- Contraintes user_passions : PK (user_id, passion_id), FK passion_id → passions(id) ON DELETE CASCADE.

## 3. Triggers (pg_trigger, non internes)
- trg_identite_affichage (BEFORE INSERT OR UPDATE) sur cdv_live_comments, event_comments, step_interactions, video_lives → `identite_affichage_canonique()` (SECURITY DEFINER, réécrit author_name/author_photo/author_emoji depuis profiles).
- trg_propager_identite (AFTER UPDATE OF username, avatar_url, emoji ON profiles) → `propager_identite_affichage()`.
- trg_posts_freeze_author (BEFORE UPDATE ON posts), trg_user_state_horodatage (BEFORE INSERT OR UPDATE ON user_state → `updated_at := now()`), rate_limit ×3, broadcast conv_messages, majorité user_safety.

## 4. Volumes
- passions 1 908 (dont 19 `source='legacy'`) ; user_passions 22 lignes pour 2 comptes ; profiles 5 (5 avec `passions` non nul) ; user_state 84 lignes dont **79 sans profil ni compte auth** (orphelines).
- posts 32 / events 3 / stories 8 : 0 passion_id nul, 0 hors référentiel. conversations 117 dont 116 passion_id nul.
- FK vers passions(id) : posts, stories, events, conversations, profiles, passion_relations ×2, user_passions, passion_requests (9).

## 5. Miroir user_passions vs profiles.passions (jsonb)
- jsonb_only (dans profiles.passions, absent de user_passions) : **23** · up_only : 0 · archived_mismatch : 0 · jsonb hors référentiel : 1.
- Compte 20762060 : jsonb 14 entrées (3 vivantes : moto-enduro, outdoor-randonnee, sante-sport-sante) ; user_passions 7 lignes, **0 vivante** — les 3 vivantes ne sont pas dans le miroir.
- Compte 6902826f : jsonb 23 (15 vivantes) ; user_passions 15 (9 vivantes) ; manquent moto-sportive, parentalite-sport-famille, running, sport-escalade, sport-handisport, sport-sport-en-salle, metier-poterie, sante-sport-sante (toutes canoniques en base).
- 3 comptes sur 5 : 0 ligne user_passions.

## 6. profiles.passions vs user_state (blob) — même compte
- Compte 20762060 : profiles.passions dit **moto-enduro vivante** ; user_state (2026-09-03 11:28) dit **moto-enduro archivée** (2 vivantes contre 3). Divergence vitrine publique / état du compte.
- profiles.passion_id : 20762060 → `art` (archivée des deux côtés) ; d59aaaa3 → `moto` alors que currentProfileId = yoga. La colonne n'est pas « la passion active » (contrairement à `.passio/context/MULTI_PROFILE.md` « profiles.passion_id porte l'active »).

## 7. Journal des changements (user_state.data.user.passionChanges.entries)
- 20762060 : archive compte:true ×1, restore ×1.
- 6902826f : archive compte:true ×3 (quota atteint), archive compte:false ×7, restore ×4. Aucun compte au-delà de 3 archivages facturés.

## 8. Rang physique (ctid) des passions — plafond max-rows PostgREST
- `row_number() over (order by ctid)` : 908 passions au rang > 1 000, dont 900 hors socle des 19 (legacy au-delà : cuisine, jardinage, animaux, litterature, cinema, podcast, actu, yoga — couvertes par le socle client).
- 2 passions VIVANTES de comptes réels sont au rang > 1 000 (dont sante-sport-sante, rang 1 732, passion COURANTE du compte 20762060 ; parentalite-sport-famille, rang 1 898). 0 post existant concerné.
- Vérification directe de la valeur `max-rows` du projet : BLOQUÉE (REST supabase.co refusé par le proxy : connect_rejected ; `pg_settings` ne l'expose pas).

## 9. Fonctions
- `rechercher_passions(q, lim)` : STABLE, plafonnée à 50, `status='active'`, trigram si pg_trgm.
- `user_state_horodatage_serveur()` : `new.updated_at := now()`.
