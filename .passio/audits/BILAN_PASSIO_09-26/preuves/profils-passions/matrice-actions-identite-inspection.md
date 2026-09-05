# Matrice actions × identité utilisée — domaine profils-passions — SHA c8cb8e99 (2026-09-04)
Méthode : inspection code (fichier:ligne) + émulation Chromium (F-matrice-actions-identite.json, faux client Supabase journalisé) + colonnes réelles (requetes-base-2026-09-04.md §1, information_schema.columns lu par la session précédente du domaine).

| Action | Table | Identité de COMPTE envoyée | Passion envoyée | Source côté client | Autorité serveur |
|---|---|---|---|---|---|
| Publier (post/bobine/partage) | posts | author_id = MY_UID (app-08:3416) | passion_id = requiredCanonicalPassion(#postPassion) (app-06:4212, 4438 ; app-08:3416) | `<select id=postPassion>` = passion active par défaut (renderStudio app-06:3776-3800), `onStudioPassionChange` bascule currentProfileId (3754) | RLS INSERT author_id = auth.uid() ; FK passions(id) ; AUCUN contrôle que passion_id ∈ passions du compte |
| Story | stories | author_id = MY_UID | passion_id = optionalCanonicalPassion(currentProfile().passion) (app-08:548-553, 1326-1330, 4001) | passion active | RLS owner ; FK ; facultative (null accepté) |
| Événement | events | author_id = MY_UID (+ organizer_id) | passion_id = `#evPassion` (app-07:5575, options = passions du compte 4781) | choix explicite dans le formulaire | RLS owner ; FK ; obligatoire côté client |
| Conversation de groupe | conversations | created_by = MY_UID | passion_id = optionalCanonicalPassion(passionId) (app-08:4533, 5580) | passion de l'événement ou choix | FK |
| Commenter | post_comments | author_id = MY_UID (app-08:3817-3821) | — (aucune colonne passion_id) | — | RLS owner ; affichage via embed profiles (serveur) |
| Réagir / répondre à un commentaire | comment_interactions | user_id = MY_UID (app-08:3837-3845) | — | — | RLS owner + rate-limit |
| Like post | post_likes | user_id = MY_UID (app-03:253) | — | — | RLS owner |
| Réaction événement | event_reactions | user_id = MY_UID (app-08:4271-4278) | — | — | RLS owner + rate-limit |
| RSVP | event_attendees | user_id = MY_UID (émulation F : update {rsvp}) | — | — | RLS owner |
| Suivre | follows | follower_id = MY_UID (app-08:5301) | — | — | RLS owner |
| Message privé | conv_messages | from_id = MY_UID (app-04:4491, app-09:667-1043) | — | **`content.sp = {n, e, c, pid, ph}` = identité CHOISIE PAR LE CLIENT** (`_msgSenderMeta` app-02:1670-1700, `_withSenderMeta` 1692) ; le destinataire l'applique en priorité sur `profiles` (app-04:4309-4312) | RLS membre ; AUCUN trigger sur conv_messages.content → l'identité affichée n'est pas serveur-autoritaire |
| Notification | notifications | from_id = MY_UID (app-08:4782-4786) | — | `content = escapeHtml(currentProfile().name) + texte` : NOM CHOISI PAR LE CLIENT (app-08:4779-4781) | RLS from_id = auth.uid() (AUTHZ §9) ; le texte n'est pas réécrit |
| Lives vidéo / commentaires d'événement / step_interactions / cdv_live_comments | 4 tables | author_id/user_id | — | author_name/photo/emoji proposés par le client | **réécrits** par `trg_identite_affichage` → `identite_affichage_canonique()` (migration_identite_affichage_canonique.sql:45-91) ; propagation au renommage `trg_propager_identite` (113-144) |
| Profil public | profiles | id = MY_UID | passion_id = `_passionIdPubliable` = PREMIÈRE passion vivante canonique de la liste, pas la passion active (app-08:2753-2767) ; passions = jsonb complet (vivantes + archivées marquées) | `supaSavePassionState` (app-08:3142) | RLS UPDATE id = auth.uid() (sans WITH CHECK) ; aucune contrainte sur le jsonb |
| Miroir normalisé | user_passions | user_id = MY_UID | passion_id (seulement si estPassionCanonique côté client) (app-08:3199-3245) | best-effort, jamais lu | RLS insert/update/delete own, select true ; AUCUNE contrainte de nombre |

Constats :
1. ADR-007 toujours vrai : `passion_id` n'existe que sur conversations, events, posts, profiles, stories, user_passions (requetes-base §1) ; aucune table d'interaction n'en porte.
2. L'identité de COMPTE (uuid) est toujours MY_UID et gardée par RLS (`= auth.uid()`), sauf pour les ÉTIQUETTES d'identité transportées dans `conv_messages.content.sp` et `notifications.content`, non réécrites par le serveur.
3. La passion d'ÉCRITURE est `currentProfileId` (source unique `switchToProfile`, app-06:2671) pour posts (par défaut du select) et stories ; explicite pour events ; absente ailleurs.
4. Le plafond 3 / quota 3 / mode illimité n'existent que côté client (app-06:3076-3365) ; aucune policy, trigger ni contrainte serveur (policies.json : user_passions_*_own = `user_id = auth.uid()` seulement).
