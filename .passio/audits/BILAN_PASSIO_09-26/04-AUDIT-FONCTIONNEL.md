# Audit fonctionnel — BILAN PASSIO 09/26

> SHA audité : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf` (main, 2026-09-04). Modèle : Claude Fable 5.1 (auditeurs de domaine et relecteurs adversariaux). Statuts : PROUVÉ · CONFORME PAR INSPECTION · PROBABLE · DÉFAILLANT · BLOQUÉ · NON APPLICABLE. Priorités : P0 bloque la commercialisation · P1 avant lancement public · P2 amélioration importante · P3 optimisation future. Chaque problème a été soumis à une relecture adversariale indépendante (angles reproduction / impact / contexte) ; la priorité retenue est celle de la relecture quand elle diffère.


## Domaine « contenu »

Audit en lecture seule sur le SHA c8cb8e99 (HEAD de la branche a reçu ensuite 2 commits d'audit de l'orchestrateur ; `git diff --stat c8cb8e99 HEAD -- js index.html sw.js migrations tests` est vide). Méthode : inspection code (app-02/03/04/06/08/09, ui-v5/v6/v7, passions-flat-ui, sw.js, index.html), 4 requêtes base en lecture seule (policies, contraintes, triggers, buckets, inventaire des 32 posts/71 likes/86 commentaires/58 objets Storage), 12 suites e2e exécutées sur le port 8102 (67 cas), et un scénario d'émulation Chromium maison (390×844, script `emulation-contenu.js`) : publication texte+photo, double clic, like, commentaire vide/hostile, partage, suppression, image 0 octet, vidéo/audio à MIME menteur, publication pendant coupure, changement de profil en cours de rédaction, story et follow avec refus serveur.
Formats réellement présents : texte, photo, vidéo, bobine (is_reel), story (24 h), audio (onglet « Podcast », ≤ 500 Ko ou 120 s de micro), partage d'événement dans le fil. Absents : édition d'un post (menu ⋯ = supprimer seulement), suppression d'une story, live vidéo comme publication (le « live » est un appel WebRTC), carnet/vlog (retiré ADR-011, 1 ligne résiduelle en prod, lue mais jamais rendue).
Verdict par surface : l'échappement des commentaires/réactions/GIF est PROUVÉ (payload hostile rendu inerte, 3 helpers utilisés au bon contexte), le like est idempotent et annulé sur refus (PROUVÉ), la suppression durable tient (8/8 verts, émulation). En revanche la PUBLICATION est fragile : validation client quasi nulle sur vidéo/audio (fichier texte accepté comme vidéo, 0 octet publié), aucune file de reprise pour un post du Studio non envoyé (reste « Sync… » à vie, jamais retenté), badge « Sync… » affiché même après « Post publié », story et follow qui restent « réussis » quand le serveur refuse, lien de partage de profil `#user-` que rien ne route, partage externe d'un post sans lien profond. Côté base : aucun rate-limit sur posts/post_comments/post_likes, `posts.content` et `post_comments.content` non bornés, 39/58 objets Storage orphelins (153 Mo de bucket), 42/71 likes et 58/86 commentaires orphelins (pas de FK vers posts), 1 bobine en prod sans média.
Tests : 58/67 verts au premier passage ; 9 rouges = `ERR_CONNECTION_REFUSED` / « browser has been closed » (chute du serveur 8102 en cours de run, jamais une assertion) ; rerun de la suite ui-v5-bobines 12/15 + 3 « browser closed », rerun ciblé des 3 : 5/5 verts. Aucune assertion applicative rouge. Le navigateur installé (rev 1194) ne correspond pas à Playwright 1.60 (rev 1223) : contourné par un répertoire de liens symboliques dans le scratchpad.

### Contrôles (34)

| Id | Contrôle | Statut | Méthode | Preuve |
|---|---|---|---|---|
| CT-01 | Inventaire des formats réellement publiables et de leur chemin (studioType → publishPost → supaPublishPostWithRetry → supaUploadMedia → posts) | **CONFORME PAR INSPECTION** | inspection code | index.html:775-780 (onglets texte/photo/vidéo/bobine/audio « Podcast ») ; js/app-06-reels-partage.js:3745,4304-4309 (type/isReel/image/video/audio dérivés de studioType) ; js/app-08-ui-modals-tour.js:3318-3470 (upload puis insert, passion obligatoire l.3352) ; bobine : app-08:1285-1395 (mePublish) ; story : app-08:538-575 et 3968-4030. Prod : 32 posts = 25 texte, 2 webp, 1 mp3, 1 mp4, 1 bobine mp4, 1 bobine SANS média, 1 vlog résiduel (requête base) |
| CT-02 | Validation client des médias (type MIME, taille, 0 octet) par format | **DÉFAILLANT** | émulation | emulation-resultats.json : video_mime_menteur → fichier text/plain accepté (studioType=video, data:text/plain) ; video_0_octet_publiee → post type video avec `data:video/mp4;base64,` créé et envoyé à supaPublishPostWithRetry ; audio_mime_menteur → application/pdf accepté « Audio chargé et prêt à publier ». Code : app-06:4012-4016 (vidéo : seule la taille ≤30 Mo) ; 4062-4066 (audio : seule la taille ≤500 Ko). Photo : app-06:3980-3982 + passioCompressImage (décodage canvas, image 0 octet refusée « Impossible de lire cette image » — PROUVÉ) |
| CT-03 | Stockage : bucket content public, chemin cloisonné, extension fidèle, pas de base64 en base | **PROUVÉ** | requête base | storage.buckets content/attachments public=true, 50 Mo, allowed_mime_types NULL ; policy INSERT `storage_chemin_autorise` = dossier[2] = auth.uid() ; posts_media_not_storage = 0 ; supaUploadMedia app-08:3520-3600 (extension dérivée du conteneur réel, retrait de l'orphelin si URL publique introuvable) |
| CT-04 | Rendu des publications (renderPostHTML) avec échappement de tout contenu utilisateur | **CONFORME PAR INSPECTION** | inspection code | js/app-02-state-utils.js:6553-6790 : escapeHtml sur texte/nom/passion, escapeJsArg dans tous les onclick, safeUrlAttr côté média (commentaire l.6634) ; capture 02-feed-post-photo.png |
| CT-05 | Suppression d'une publication : pierre tombale, quatre tableaux, file serveur, retour au rafraîchissement | **PROUVÉ** | test exécuté | suppression-durable.spec.js 8/8 verts (suites-contenu.log) ; émulation : suppression → {dansUserPosts:false, tombstone:true, dom:false, outbox:1} ; code app-04:204-232, file _delObRun app-04:101-125 (relecture après 0 ligne) |
| CT-06 | Édition d'une publication | **NON APPLICABLE** | inspection code | Fonctionnalité absente : openPostOptions app-04:9-24 ne propose que « Supprimer » (`_editBtn = ""`) ; la policy UPDATE `can_edit_post` existe en base sans aucun appelant client |
| CT-07 | Double clic « Publier » (doublon ?) | **PROUVÉ** | émulation | publish_double_clic → userPosts:1, pubCalls:1, toast « Publication en cours, attends un moment... » ; verrou `_publishInProgress` app-06:4196-4204 ; insert 23505 traité comme succès app-08:3439 |
| CT-08 | Publication pendant coupure réseau : reprise idempotente ? | **DÉFAILLANT** | émulation | publication_hors_ligne → syncStatus « syncing », toast « Post en local (connexion lente) », aucune clé outbox posts ; reprise_apres_online → pubCalls:0 ; post_local_apres_reload → présent, toujours « Sync… ». Code : publishPost app-06:4349-4372 n'a ni file ni retentative (contraste : bobines `_scheduleReelRetry` app-08:1408) |
| CT-09 | Statut de synchronisation affiché sur mes cartes | **DÉFAILLANT** | émulation | feed_rendu.meta = « 🎸 Musique · à l'instant Sync… » alors que le toast dit « Post publié » ; capture 02-feed-post-photo.png ; `syncStatus` n'est écrit qu'à « syncing » (app-06:4314) et jamais mis à jour (grep : aucune autre écriture) ; rendu app-02:6744-6747 |
| CT-10 | Changement de profil pendant la rédaction | **PROBABLE** | émulation | switch_profil → texte et photo conservés, studioType conservé, mais `#postPassion` passe de « musique » à « sport » (renderStudio réécrit le select, app-06:2671+ / 3792-3796) : le brouillon en cours changera de passion sans avertissement |
| CT-11 | Réactions : 1 réaction par personne, double-like, écriture de l'intention | **PROUVÉ** | test exécuté | interactions.spec.js (verts : « l'écriture serveur reçoit l'INTENTION », « anti double clic », « contenu de démo : aucune écriture ») ; émulation like_double_clic → liked:true, likes:1, likeCalls:1 ; code app-03:291-370 (`_likePending`, annulation optimiste sur refus) ; post_likes PK (post_id,user_id) ; supaCommentRemoveReactions appelé avant réinsertion (emoji-misc.js:543,657) |
| CT-12 | Commentaire vide / trop court | **PROUVÉ** | émulation | commentaire.vide → n:0, toast « Trop court » (app-04:1082) ; bouton désactivé champ vide (_syncComposerSendState app-04:1134) |
| CT-13 | Commentaire XSS (texte, lien javascript:, GIF URL piégée) et payloads comment_interactions | **PROUVÉ** | test exécuté | echappement.spec.js, echappement-ids-reactions.spec.js, reaction-cle-entree.spec.js, commentaires-bobine.spec.js verts ; émulation : `<img onerror>` rendu en `&lt;img…` (xss:0, imgInjectees:0), URL giphy avec `"onload=` rendue en lien `rel=noopener` sans exécution ; code : _commentBodyHtml app-04:301-305 (safeUrlAttr + escapeHtml), réponses emoji/GIF app-04:646-668, escapeJsArg sur tous les onclick ; base : 0 commentaire ou payload contenant « < » ; ci_payload_len_check ≤ 500 |
| CT-14 | GIF = commentaire (rendu image, non modifiable) | **CONFORME PAR INSPECTION** | inspection code | _looksLikeMediaUrl app-04:238-244 ; editCommentEntry refuse « Un GIF ne peut pas être modifié » app-04:1474 ; comment_interactions kind ∈ {like,reply,emoji,gif} (contrainte ci_kind_check) — prod : 188 like / 87 reply / 84 emoji / 2 gif |
| CT-15 | Suppression de son commentaire et droits (RLS post_comments) | **CONFORME PAR INSPECTION** | requête base | émulation commentaire_supprime → 0 ; policies post_comments : DELETE/UPDATE `author_id = auth.uid()` uniquement ; UI cohérente (openCommentOptions n'offre « Supprimer » qu'à `isMine`, app-04) — l'auteur du post ne peut PAS modérer les commentaires sous sa publication (épingler seulement). ⚠️ `_supaDeleteCommentRow` app-04:1447-1458 ne lit pas `{error}` : un refus serveur laisse le commentaire supprimé à l'écran seulement |
| CT-16 | Commentaire sur un post d'un compte privé / bloqué | **CONFORME PAR INSPECTION** | inspection code | posts d'un compte bloqué écartés du fil (allFeedPosts app-02, `blocked.includes(p.authorId)`) et commentaires des bloqués masqués (_renderCommentsList app-04:554) ; posts privés filtrés à la lecture (supaLoadPosts app-08:3637-3639 + policy SELECT posts). Limite : la policy INSERT post_comments ne vérifie que `author_id` — un compte non abonné connaissant l'id peut commenter en aveugle un post privé (PLAUSIBLE, non reproduit) |
| CT-17 | Follow / unfollow, multi-surfaces data-follow-uid, refus serveur | **DÉFAILLANT** | émulation | parcours-suivre.spec.js vert ; _boutonsSuivi app-04:3264-3278 repeint tous les boutons ; MAIS follow_refus_serveur → following:true, bouton « ✓ Suivi » alors que supaFollowUser a rendu false (toggleFollowUser app-04:3299 ignore le retour ; supaUnfollowUser app-08:5317-5325 ne compte pas les lignes supprimées) |
| CT-18 | Compte privé et blocage qui révoque l'abonnement | **CONFORME PAR INSPECTION** | inspection code | blockUser app-04:3313-3327 retire de `following` + supaUnfollowUser ; supaBlockUser app-08:5340+ retire aussi la relation inverse ; policy follows DELETE « Suppression cote suivi » (following_id = auth.uid()). Prod : 0 compte privé, 0 blocage, 7 follows, 0 auto-follow |
| CT-19 | Compteurs abonnés / abonnements / posts cohérents | **CONFORME PAR INSPECTION** | inspection code | profil visité : `count exact` sur follows dans les deux sens (app-04:2885-2895) ; mon profil : `_followersCount` chargé depuis Supabase (app-06:405-412) ; abonnements = state.user.following (local, resynchronisé par supaLoadFollowing). Non mesuré contre la base (BLOQUÉ sans compte réel) |
| CT-20 | Feuille de partage d'un post (dans le fil / en dehors) et lien profond | **DÉFAILLANT** | émulation | partage_modal → « Partager dans mon feed », « Partager en dehors » (capture 04-partage-post.png) ; « en dehors » partage `https://passio-app.netlify.app` sans identifiant de post (app-03:35-36) — aucun route `#post-` n'existe (grep) ; partage-bobine.spec.js et partage-experience-passion.spec.js verts |
| CT-21 | Partage de profil (shareUserProfile) et routage de son lien | **DÉFAILLANT** | émulation | partage_profil_url → `…/index.html?plk=…#user-u_theo` ; deep_link_user_route → hash posé, aucune modale, écran feed. Aucun routeur ne traite `#user-` (grep js/ : seul émetteur app-04:3384) ; first-run.js:441 RE_LIEN_PROFOND reconnaît `#profil-`/`#post-`/`#conv-` que personne n'émet |
| CT-22 | Liens profonds #reel= et #irl-event- | **PROUVÉ** | test exécuté | ui-v5-bobines.spec.js (15/15 verts cumulés sur deux passages, 3 cas rejoués isolément après « browser closed »), fuite-blob-bobines.spec.js vert ; _openReelDeepLink app-06:77-135 (garde d'appartenance buildReels, hash nettoyé au seul succès) |
| CT-23 | Web Share API et repli copier | **CONFORME PAR INSPECTION** | inspection code | partagerOuCopier app-02:1915-1965 : navigator.share sans await préalable, AbortError ignoré, repli clipboard puis toast « Lien : … » |
| CT-24 | Invitation d'amis (parrainage, contacts, lien d'invitation) | **NON APPLICABLE** | inspection code | Aucune fonctionnalité d'invitation de personnes extérieures : grep « invit » ne rend que les invitations d'APPEL (app-05:456-1183), les membres de groupe (app-05:1290), un lien beta télémétrique (app-08:223) et les notifications event_invite. Boucle de croissance absente |
| CT-25 | Partage vers la messagerie interne | **NON APPLICABLE** | inspection code | sharePost (app-03:10-43), openReelShareModal (app-05:2908-2960 : WhatsApp/Telegram/X/Facebook/Email/SMS/feed/copier) et shareUserProfile n'offrent aucun envoi vers une conversation PASSIO |
| CT-26 | Stories : publication, 24 h, refus serveur, suppression | **DÉFAILLANT** | émulation | story_echec_serveur → story ajoutée localement (7→8), aucun toast d'échec, `typeof deleteStory === "undefined"` ; code app-08:1339-1341 et 570-573 (résultat de supaPublishStory ignoré, toast « Story publiée » inconditionnel) ; expiration 24 h à la lecture seulement (supaLoadStories `gte created_at`) ; aucune suppression de story dans le code (grep `from("stories")` : select/insert seuls, hors purge de compte) |
| CT-27 | Rate-limit et bornes serveur sur posts / post_comments / post_likes | **DÉFAILLANT** | requête base | pg_trigger : `trg_rate_limit` seulement sur comment_interactions (et event_reactions/reports d'après l'orchestrateur) ; posts n'a que `trg_posts_freeze_author` ; post_comments et post_likes : aucun trigger ; information_schema : posts.content et post_comments.content `text` sans longueur ni CHECK ; seules bornes = maxlength client 1200 (index.html:786) et 400 (app-04:1024) |
| CT-28 | Intégrité référentielle des interactions (FK vers posts) et orphelins | **DÉFAILLANT** | requête base | pg_constraint : post_likes et post_comments n'ont AUCUNE FK vers posts ; prod : likes_orphan 42/71, comments_orphan 58/86, ci_orphan 145/361 (comment_interactions) ; storage_content_orphans 39/58 objets (dont 8 mp4 sur 10 non référencés) |
| CT-29 | Pièces jointes de messagerie (app-09) : validation et base64 en base | **PROBABLE** | inspection code | handleAttachFile app-09:780-798 : image ≤40 Mo compressée ; vidéo/audio/document : AUCUNE borne de taille ni de type avant lecture en data URL (localStorage) ; sendMessageToSupabase app-09:920-934 refuse bien le base64 en base (« non synchronisé »). Hors périmètre strict (messagerie), signalé |
| CT-30 | Service worker : cache des médias, mise à jour | **CONFORME PAR INSPECTION** | inspection code | sw.js : cache limité à index/styles/manifest/icônes, navigation network-first no-store, aucun cache de média Storage (fetch hors hostname ignoré l.~150) |
| CT-31 | Suites e2e demandées (12) exécutées | **PROUVÉ** | test exécuté | `PASSIO_PORT=8102 npx playwright test --project=local <12 suites> --workers=1` → 58 passed / 9 failed (16,9 min) ; les 9 rouges = ui-v5-bobines cas 59-67 avec `ERR_CONNECTION_REFUSED`/« browser has been closed » (serveur tombé) ; rerun suite : 12 passed / 3 « browser closed » ; rerun ciblé :275 :303 :358 → 5 passed. Logs : suites-contenu.log, suite-ui-v5-bobines-rerun.log, suite-ui-v5-bobines-rerun2.log. Aucune assertion applicative rouge |
| CT-32 | Scénario manuel émulé : publier texte+photo, rendu, like, commenter, partager, supprimer | **PROUVÉ** | émulation | emulation-contenu.js + emulation-resultats.json ; captures 01-studio-photo.png, 02-feed-post-photo.png, 03-commentaire-hostile.png, 04-partage-post.png, 05-apres-suppression.png ; erreurs_js: [] |
| CT-33 | Politique Storage SELECT (listage) sur content ET attachments | **DÉFAILLANT** | requête base | pg_policies storage.objects `passio_media_read` SELECT roles {public} qual `bucket_id IN ('content','attachments')` : tout rôle, anon compris, peut LISTER les objets, y compris les pièces jointes de conversations privées (`attachments/<convId>/…`). Domaine sécurité, signalé ici car il porte sur les médias publiés |
| CT-34 | Comportement sur appareils réels (iOS/Android/Safari) pour vidéo/audio | **BLOQUÉ** | non réalisé | Chromium seul ; le code porte des reprises iOS (mp4/m4a, app-06:4110-4125, app-08:736-760) non vérifiables ici. Il faudrait un iPhone et un Android réels |

### Problèmes (14)

| Id | Priorité retenue | Relecture | Titre |
|---|---|---|---|
| CONT-01 | **P2** | CONFIRMÉ par la relecture | Aucune validation de type ni de contenu sur les vidéos et audios du Studio : un fichier texte ou vide est publié comme vidéo |
| CONT-02 | **P1** | CONFIRMÉ par la relecture | Un post du Studio non envoyé n'est jamais retenté : il reste « Sync… » à vie sans file de reprise |
| CONT-03 | **P2** | CONFIRMÉ par la relecture | Badge « Sync… » affiché en permanence sur mes publications, même après « Post publié » |
| CONT-04 | **P1** | CONFIRMÉ par la relecture | Le lien de partage d'un profil (#user-<id>) n'est routé par personne |
| CONT-05 | **P2** | CONFIRMÉ par la relecture | Le partage externe d'un post ne porte aucun lien profond vers le post |
| CONT-06 | **P1** | CONFIRMÉ par la relecture | Story « publiée » même quand le serveur refuse, et aucune suppression de story possible |
| CONT-07 | **P2** | CONFIRMÉ par la relecture | Follow/unfollow : un refus serveur laisse « ✓ Suivi » à l'écran et dans l'état |
| CONT-08 | **P1** | CONFIRMÉ par la relecture | Aucun rate-limit ni borne serveur sur posts, post_comments et post_likes |
| CONT-09 | **P2** | CONFIRMÉ par la relecture | Interactions sans clé étrangère vers posts : 42/71 likes, 58/86 commentaires et 145/361 interactions sont orphelins en prod |
| CONT-10 | **P2** | CONFIRMÉ par la relecture | 39 des 58 objets du bucket `content` ne sont référencés par aucune ligne (dont 8 vidéos sur 10) |
| CONT-11 | **P0** | CONFIRMÉ par la relecture | La policy Storage SELECT autorise tout rôle (anon compris) à LISTER les objets des buckets content et attachments |
| CONT-12 | **P3** | RÉFUTÉ par la relecture | Changer de profil pendant la rédaction change silencieusement la passion de destination du brouillon |
| CONT-13 | **P3** | CONFIRMÉ par la relecture | L'onglet « Podcast » n'accepte qu'un fichier de 500 Ko ou 2 minutes de micro |
| CONT-14 | **P2** | CONFIRMÉ par la relecture | La suppression et l'édition d'un commentaire ignorent le verdict serveur |

### CONT-01 — Aucune validation de type ni de contenu sur les vidéos et audios du Studio : un fichier texte ou vide est publié comme vidéo

| Champ | Valeur |
|---|---|
| Identifiant | CONT-01 |
| Priorité retenue | **P2** (proposée par l'auditeur : P1) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Studio — publication vidéo / audio (« Podcast ») |
| Résultat attendu | Un fichier qui n'est pas une vidéo/un audio décodable est refusé avant tout upload ; un fichier 0 octet est refusé |
| Résultat observé | `text/plain` accepté comme vidéo (toast « Vidéo chargée »), vidéo de 0 octet acceptée puis publiée (post type video, `data:video/mp4;base64,` envoyé au chemin de publication) ; `application/pdf` accepté comme audio (« Audio chargé et prêt à publier ») |
| Reproduction | Studio → onglet Vidéo → choisir un fichier .mp4 dont le contenu est du texte (ou vide) → Publier. Script : emulation-contenu.js, clés video_mime_menteur, video_0_octet_publiee, audio_mime_menteur |
| Preuve | js/app-06-reels-partage.js:4012-4016 (seule la taille est testée), 4062-4066 (audio : taille seule), 4090-4094 ; emulation-resultats.json ; bucket sans allowed_mime_types (requête storage.buckets) |
| Impact utilisateur et commercial | Publication invisible/injouable pour tous les lecteurs (carte vidéo noire), fichier facturé en Storage ; en prod une bobine is_reel=true sans média existe déjà (requête base). Image de marque dégradée dès les premiers testeurs |
| Visibilité dans le Centre de pilotage | non — le flux publish_post se termine « ok » (traces.js:69) puisque l'upload et l'insert réussissent |
| Détection par la Sentinelle | non — aucune erreur, aucune trace en échec |
| Proposition de correction | Dans les gestionnaires #videoInput/#audioInput : exiger `file.type` en video/*\|audio/*, refuser size===0, décoder via `<video>`/`<audio>` (loadedmetadata, duration>0) avant d'accepter ; côté Storage poser allowed_mime_types sur le bucket content |
| Risque de régression | faible (gardes d'entrée) ; attention aux MIME vides d'iOS pour les .mov (accepter par extension avec décodage) |
| Effort estimé | 0,5 jour |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P1). 1) Code (SHA c8cb8e99 ; `git diff --stat c8cb8e99 HEAD -- js index.html sw.js` vide, donc l'inspection porte bien sur l'état audité) : js/app-06-reels-partage.js:4012-4016, le gestionnaire `#videoInput` ne teste que `f.size > 30 Mo` puis `readAsDataURL` ; l.4062-4066 idem pour `#audioInput` (500 Ko seulement). Aucun contrôle de `file.type`, de `size === 0`, ni décodage. Les `accept="video/*"`/`accept="audio/*"` (index.html:808, 824) ne sont qu'un filtre de sélecteur, pas une garde. 2) Reproduction exécutée (émulation Chromium, http-server sur 8120, script preuves/relecture-CONT-01/repro-cont01.js, résultats repro-resultats.json) : `text/plain` posé sur `#videoInput` → `studioType="video"`, `videoDataUrl="data:text/plain;base64,…"`, toasts « Chargement vidéo… », « Vidéo chargée » ; fichier 0 octet `video/mp4` → `videoDataUrl="data:video/mp4;base64,"` (truthy, donc la garde `!videoDataUrl` de publishPost, app-06:4222, ne l'arrête pas) et `publishPost()` crée bien un post `type:"video"` dans `state.userPosts` ; `application/pdf` sur `#audioInput` → `studioType="audio"`, « Audio chargé et prêt à publier ». Les trois mesures de l'auditeur sont refaites à l'identique. 3) Chaîne serveur, par inspection : supaUploadMedia (app-08:3520-3600) accepte tout `data:` avec `;base64,`, fabrique un Blob du MIME déclaré (text/plain) ou vide, force l'extension `.mp4`/`.m4a`, et l'envoie sans aucun contrôle ; le bucket `content` n'a pas d'`allowed_mime_types` (preuves/supabase-isolation/fonctions_realtime_storage_staging.md:30). Aucune suite e2e ne cible `#videoInput`/`#audioInput` (grep tests/e2e vide). 4) Nuance : « publiée » a été mesuré par l'auditeur (comme par moi) derrière un STUB de supaPublishPostWithRetry (bootOnboarded le remplace, tests/e2e/app-helper.js:143-144) — l'arrivée effective en Storage/DB n'est PROUVÉE ni par lui ni par moi ; elle est PROBABLE par lecture du code, pas mesurée. — Correction de formulation : Observé/preuve : préciser que « publiée / envoyé au chemin de publication » a été mesuré contre le stub `supaPublishPostWithRetry` posé par bootOnboarded (app-helper.js:143-144) et non contre l'upload Storage réel ; l'acceptation client est PROUVÉE (émulation), l'arrivée en Storage/DB est CONFORME PAR INSPECTION (supaUploadMedia sans contrôle de type, bucket sans allowed_mime_types), pas « prouvée ». Impact : retirer ou reformuler « en prod une bobine is_reel=true sans média existe déjà » comme indice non attribuable (cause documentée différente : timeout d'upload, app-08:3335-3337). Ajouter dans la preuve `app-06:4222` (garde `!videoDataUrl` inefficace sur la chaîne `data:video/mp4;base64,` truthy) et le fait qu'aucune suite e2e ne cible #videoInput/#audioInput. Priorité P1 maintenue (aucune barrière ni côté client ni côté bucket, défaut invisible au pilotage).
- **impact** → CONFIRMÉ (priorité proposée P2). Le défaut est réel et n'est pas une décision produit : js/app-06-reels-partage.js:4012-4016 (#videoInput) ne teste que `f.size > 30 Mo`, 4062-4066 (#audioInput) que `f.size > 500 Ko` ; aucun contrôle de `file.type`, de `size === 0` ni de décodage. Preuve reproduite dans preuves/contenu/emulation-resultats.json (video_mime_menteur → `data:text/plain`, video_0_octet_publiee → post type video avec `data:video/mp4;base64,`, audio_mime_menteur → `data:application/pdf`). L'incohérence interne confirme qu'il s'agit d'un oubli : le chemin photo (app-06:3980 `f.type.indexOf("image/") !== 0` → « Choisis une image ») et le chemin bobine (app-08:982-985 « Photo ou vidéo uniquement », 985 « Une bobine est une vidéo ») refusent, eux, un type menteur. Rien dans CLAUDE.md, les ADR ni docs/lots-ui ne documente l'absence de validation comme voulue. Mais P1 est surévalué au regard des définitions : le cas exige que l'auteur choisisse lui-même un fichier hors du filtre natif `accept="video/*"` / `accept="audio/*"` (index.html:808, 824) ou un fichier corrompu/vide ; l'impact est borné à SA propre publication (carte noire pour les lecteurs, un objet ≤ 30 Mo facturé), sans fuite, sans exécution (safeUrlAttr app-02:1171 rend `#` pour `data:text/plain` au rendu du fil ; l'aperçu `<video src>` ne peut pas exécuter de script), sans atteinte à l'isolation, à la restauration, à la capacité, à la sécurité IRL ni à la modération — aucun critère d'interdiction du GO n'est touché. C'est une amélioration de robustesse importante → P2. — Correction de formulation : Priorité : P2 (pas P1). Attendu/observé : justes ; ajouter que la garde EXISTE sur les deux autres chemins (photo app-06:3980, bobine app-08:982-985) — le défaut est une incohérence du seul Studio vidéo/audio. Impact : borner à « la propre publication de l'auteur, qui a dû contourner le filtre natif accept= ou charger un fichier corrompu » ; retirer la phrase sur la bobine sans média en prod tant que la cause n'est pas prouvée (chemin bobine gardé ; échec d'upload avec repli base64 est une cause alternative). Correction : garder la garde client (type video/*|audio/* avec tolérance MIME vide iOS par extension, size===0 refusé, décodage `loadedmetadata`/`duration>0`), et SUPPRIMER la recommandation `allowed_mime_types` sur le bucket, contraire à migration_storage_cloisonnement.sql:119-131 — ou la reformuler comme « seulement après normalisation des types à l'émission et mesure des types reçus », l'ordre que la migration prescrit. Effort 0,5 jour : cohérent. Visibilité pilotage/Sentinelle « non » : exact, mais ce n'est pas une « fonction critique invisible » (la publication est tracée ; seul le contenu invalide ne l'est pas).
- **contexte** → CONFIRMÉ (priorité proposée P2). Finding NOUVEAU et toujours OUVERT sur le SHA audité (HEAD f501fb7 = c8cb8e99 + 2 commits d'audit hors js/ ; `git diff --stat c8cb8e99 HEAD -- js index.html` vide). - Code vérifié : js/app-06-reels-partage.js:4011-4021 (`#videoInput` : seul `f.size > 30 Mo` est testé, aucun contrôle de `f.type`, aucun décodage) et :4060-4066 (`#audioInput` : seul `f.size > 500 Ko`). Contraste dans le MÊME fichier :3980 (`#photoInput` refuse `f.type` hors `image/`) et dans l'éditeur média app-08:982-983 (« Photo ou vidéo uniquement ») — le Studio vidéo/audio est le seul chemin sans garde (famille « survivant »). `accept="video/*"`/`"audio/*"` (index.html:808,824) est une suggestion du sélecteur, pas une garde. - Chemin de publication : supaUploadMedia app-08:3539-3583 fabrique un Blob depuis le mime de la data URL sans le vérifier ; un `data:video/mp4;base64,` vide donne `atob("")` = Blob de 0 octet uploadé sous `.mp4`, URL publique obtenue → la garde `hadMedia` de la fiche « publication vidéo fiabilisée (2026-07-19) » (docs/PIEGES_CONNUS.md:23) ne bloque PAS ce cas (elle vise `media_url NULL`, pas un média vide/menteur). - Preuve d'émulation cohérente : preuves/contenu/emulation-resultats.json (`video_mime_menteur` → data:text/plain accepté, toasts « Vidéo chargée » ; `video_0_octet_publiee` → post type video `data:video/mp4;base64,` ; `audio_mime_menteur` → application/pdf accepté). - Aucune trace antérieure : grep « mime / 0 octet / allowed_mime / validation vidéo » dans docs/PIEGES_CONNUS.md, .passio/context/KNOWN_RISKS.md, TECH_DEBT.md, docs/CHECKLIST_COMMERCIALISATION.md, docs/lots-ui/*, .passio/adr/* : rien (les seuls hits « 0 octet » sont ADR-012, dump SQL). CHECKLIST_COMMERCIALISATION.md:28 coche « post vidéo testé (type + média + rendu fil) » mais aucune suite ne touche `#videoInput`/`#audioInput` (grep tests/e2e : 0 fichier) : l'affirmation ancienne ne couvre pas le refus d'un fichier invalide. - Correction compatible avec les invariants : gardes d'entrée en JS (pas de tests/ réécrit, aucune liste noire, aucune RLS desserrée, ADR-009/011 non concernés) ; `allowed_mime_types` sur le bucket est du DDL → canal ③ d'ADR-012 (psql/SQL Editor, jamais depuis la CI) ; la réserve « MIME vide iOS pour .mov » est cohérente avec la fiche 2026-07-19 (mp4/m4a en priorité, extension fidèle au conteneur). - Priorité : P2 plutôt que P1 — défaut auto-infligé (l'auteur choisit un fichier invalide), sans impact sécurité ni sur les autres comptes ; le coût est une carte noire pour ses lecteurs et un objet Storage inutile. — Correction de formulation : Formulation à corriger : (1) l'impact « en prod une bobine is_reel=true sans média existe déjà » ne prouve PAS ce défaut — la fiche « publication vidéo fiabilisée (2026-07-19) » (docs/PIEGES_CONNUS.md:23) documente des lignes fantômes `media_url NULL` antérieures, réparées/masquées par `buildReels` ; à requalifier en « indice non rattaché » sauf preuve par la requête ci-dessus. (2) Préciser que la garde `hadMedia` existante ne couvre pas le cas (média vide ou de mauvais type MAIS uploadé avec succès), et que la fiche 2026-07-19 impose déjà mp4/m4a + extension fidèle au conteneur : la correction doit s'y aligner (décodage `loadedmetadata` plutôt que confiance dans `file.type`, vide sur iOS). (3) La pose d'`allowed_mime_types` sur `content` doit lister aussi les images HEIC/WEBP/PNG/GIF des avatars, couvertures de passion, couvertures d'événement et stories qui passent par le même bucket (supaUploadMedia est appelé depuis app-06:794/1002/1039, app-07:5668, app-08:3370-3382/3981, ui-v7-lot.js:627), sinon régression sur ces surfaces ; et c'est du DDL → canal ③ ADR-012. (4) Priorité P2 (défaut auto-infligé, aucun impact sécurité). Doublons : aucun autre domaine ne rapporte ce défaut ; voisins distincts à citer en lien — CONT-10 (objets Storage orphelins, aggravé par ce défaut), CONT-13 (même gestionnaire `#audioInput`, borne 500 Ko), et CT-29 / MSG-14 (pièces jointes de messagerie sans borne de type — même famille, autre chemin app-09:780-798).

### CONT-02 — Un post du Studio non envoyé n'est jamais retenté : il reste « Sync… » à vie sans file de reprise

| Champ | Valeur |
|---|---|
| Identifiant | CONT-02 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Studio — publication pendant coupure/lenteur réseau |
| Résultat attendu | Un post accepté localement est mis en file et renvoyé au retour du réseau (idempotent, comme la file des commentaires et celle des suppressions) |
| Résultat observé | Toast « Post en local (connexion lente) », `syncStatus` reste « syncing », aucune clé outbox posts, aucun renvoi sur l'événement `online`, et le post survit au rechargement toujours local |
| Reproduction | Publier un post texte avec supaPublishPostWithRetry qui rend false (ou réseau coupé) ; déclencher `online` ; recharger. Clés publication_hors_ligne, reprise_apres_online, post_local_apres_reload |
| Preuve | js/app-06-reels-partage.js:4349-4372 (Promise.race 5 s puis abandon) ; aucune file : grep `_flushOutbox` = messages seulement (app-04:4644), `_delOb*` = suppressions, `_cmtOb*` = commentaires ; bobines seules ont `_scheduleReelRetry` (app-08:1408) |
| Impact utilisateur et commercial | Perte silencieuse de contenu (le post n'existe que sur l'appareil, disparaît au changement d'appareil) ; l'utilisateur croit avoir publié |
| Visibilité dans le Centre de pilotage | partiel — la trace publish_post finit « error » (tel.flowEnd app-08:3325-3330) mais rien ne dit que le post ne sera jamais renvoyé |
| Détection par la Sentinelle | partiel — une trace en échec peut lui être soumise (sentinel.js:189,251), sans notion de reprise |
| Proposition de correction | Créer une file `passio_post_outbox_v1` sur le modèle de `_delOb*` : mise en file à l'échec, flush sur `online`/timer, insert idempotent (23505 = succès), mise à jour de `syncStatus` |
| Risque de régression | moyen (interaction avec les pierres tombales : ne jamais renvoyer un id supprimé) |
| Effort estimé | 1 jour |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P1). Reproduit sur le SHA audité (diff c8cb8e99..HEAD vide sur js/index.html), test Playwright maison sur le port 8120 (/tmp/…/scratchpad/verif-cont02/cont02.spec.js, résultats dans resultats.json, 2/2 verts) : - publishPost (js/app-06-reels-partage.js:4349-4372) : supaPublishPostWithRetry rendu false → toast « Post en local (connexion lente) », `syncStatus: "syncing"`, aucune clé outbox posts (seule `passio_post_delete_outbox_v1` existe), `_reelRetryTimer` absent (le mécanisme de reprise d'app-08:1403-1420 filtre `p._pendingSync && p.isReel`, et `_pendingSync` n'est posé QUE par `_publishReelWithFeedback`, app-08:1389-1401 — jamais par le Studio). - `online` dispatché puis 50 s d'attente (au-delà du timer bobines de 45 s) : 0 rappel de supaPublishPostWithRetry. L'écouteur `online` d'app-09:261-278 ne fait que RELIRE `supaLoadPosts`, il ne renvoie rien ; ceux d'app-04:158/533/4651 servent suppressions, commentaires, messages. - Rechargement avec `supabase.co` réellement coupé (page.route abort) puis `online` : le post survit dans `state.userPosts` (`present: true`, toujours `syncing`), 0 appel de publication. Aucune reprise au boot non plus (grep `userPosts` × publish/insert/pending dans app-08/app-09 : seul le filtre bobines de la ligne 1408). Le grep du finding est exact : `_flushOutbox` = messages (app-04:4644), `_delOb*` = suppressions, `_cmtOb*` = commentaires, `_scheduleReelRetry` = bobines seules. Le défaut est réel : un post texte/photo/vidéo/audio du Studio refusé après les 2 essais de supaPublishPostWithRetry (app-08:3318, pause 1 s, ligne 3465) n'est jamais retenté. — Correction de formulation : Trois retouches de formulation, le fond tient : ① « syncStatus reste syncing » n'est PAS un indice du défaut — il reste "syncing" aussi quand la publication RÉUSSIT (jamais mis à jour ; c'est le défaut voisin « badge Sync… après Post publié » du résumé, à ne pas compter deux fois) ; l'observable discriminant est l'absence de tout rappel de supaPublishPostWithRetry après `online`, après 50 s et après rechargement. ② « Promise.race 5 s puis abandon » est inexact : les 5 s ne bornent que l'AFFICHAGE (toast) ; `syncPromise` continue et, en succès tardif, fait saveState()+renderFeed() (app-06:4354-4357). L'abandon réel est celui de supaPublishPostWithRetry lui-même (2 essais espacés de 1 s, app-08:3318/3465-3470, ou refus définitif 23503/passion) — donc « aucune reprise au-delà de ~1 s ». ③ Impact « disparaît au changement d'appareil » à nuancer : `userPosts` voyage dans le blob `user_state` (`_syncableState` app-02:308-311 ne retire que seed/supabasePosts ; `_applyUserState` app-02:797 le sait), donc un post TEXTE réapparaît sur l'autre appareil de l'auteur comme post local ; en revanche il n'existe jamais dans `posts` (invisible à tout autre utilisateur, absent des profils visités, du fil des abonnés et des notifications) et un post MÉDIA perd son média (base64 retiré par `_leanState`, app-02:232-245). Le reste (preuves, correction proposée sur le modèle `_delOb*`, risque pierres tombales, effort 1 j) est juste.
- **impact** → CONFIRMÉ (priorité proposée P1). Défaut réel, vérifié sur le SHA audité (git diff js/ vide entre c8cb8e99 et HEAD) : js/app-06-reels-partage.js:4347-4372 — `publishPost` fait un `Promise.race` 5 s contre `supaPublishPostWithRetry(post)` ; en cas de `false` il ne fait qu'un toast « Post en local (connexion lente) » et libère `_publishInProgress`. `supaPublishPostWithRetry` (app-08:3318-3470) tente `maxRetries = 2` fois, espacées de 1 s, puis rend `false` définitivement : aucune file persistée, aucun rejeu. Preuves d'absence : grep `syncStatus` dans js/ → une seule écriture (`"syncing"`, app-06:4314) et jamais « synced/offline » ; grep `_pendingSync` → app-08 uniquement, et `_scheduleReelRetry` (app-08:1404-1425) filtre `p.isReel` — les posts texte/photo/vidéo/audio du Studio en sont exclus ; l'écouteur `online` d'app-09:261-278 ne fait que `supaLoadPosts()` (relecture), il ne renvoie rien. Émulation du domaine (emulation-resultats.json) : publication_hors_ligne → outbox = [cmt, post_delete] seulement ; reprise_apres_online → pubCalls 0 ; post_local_apres_reload → toujours « Sync… ». Ce n'est PAS une décision produit : aucune ADR ni fiche docs/lots-ui ne documente « jamais retenté » ; au contraire, le dépôt a posé une file pour les commentaires (`passio_cmt_outbox_v1`, PIEGES_CONNUS l.88 #14), les suppressions (`passio_post_delete_outbox_v1`, l.94) et un réessai pour les bobines (« bobines orphelines constatées en prod »), précisément parce que le « fire and forget » a déjà coûté du contenu. Priorité : pas P0 (aucun critère d'interdiction du GO — ni isolation, ni restauration, ni capacité, ni sécurité IRL ; la trace `publish_post` finit « error » dans le pilotage) ; P1 justifié car c'est l'action cœur du produit (publier) qui perd du contenu en silence sur réseau mobile dégradé/app fermée pendant l'upload, avec un indicateur « Sync… » qui reste identique en succès comme en échec — l'utilisateur ne peut pas distinguer les deux. P2 serait défendable si on considérait les 2 tentatives + timeout insert 12 s comme une reprise suffisante, mais la coupure/fermeture pendant un upload photo est un cas courant en usage mobile, et le patron de correction existe déjà dans le code (effort 1 j crédible). — Correction de formulation : Trois précisions de formulation, la priorité P1 restant juste. (1) Preuve : l'« abandon » n'est pas à 5 s — la promesse de fond continue après le race (2 tentatives espacées de 1 s, timeout d'insert 12 s, upload compris) ; c'est à la fin de `supaPublishPostWithRetry` (app-08:3463) qu'il n'y a plus jamais de renvoi. Reformuler : « aucune reprise au-delà des 2 tentatives de la session courante ; le rechargement, l'événement `online` et le boot ne relancent rien ». (2) Impact : « disparaît au changement d'appareil » est inexact — `userPosts` fait partie du blob `user_state` (app-02:308-311), la copie locale suit le compte ; l'impact exact est « n'atteint jamais la table `posts`, donc invisible pour tout autre utilisateur, tout en restant affiché comme publié à son auteur ». (3) Observé : ajouter que `syncStatus` n'est écrit qu'une fois (`"syncing"`, app-06:4314) et jamais mis à « synced », donc le badge « Sync… » ne distingue pas un post publié d'un post perdu — c'est ce qui rend la perte silencieuse ; la correction proposée doit poser `syncStatus = "synced"` dans `_pubDone(true)` (ou côté producteur) en plus de la file, sinon la file corrige la reprise sans corriger l'affichage. Risque de régression à compléter : ne jamais rejouer un id présent dans `state.deletedPostIds` (pierre tombale) ni un échec 23503 (erreur de données, déjà traitée comme définitive app-08:3457-3462).
- **contexte** → CONFIRMÉ (priorité proposée P1). Finding NOUVEAU, toujours ouvert sur le SHA audité c8cb8e99, et jamais assumé comme risque connu. Preuves : (1) `git show c8cb8e99:js/app-06-reels-partage.js` l.4346-4372 : `Promise.race([supaPublishPostWithRetry(post), timeout 5 s])`, puis toast « Post en local (connexion lente) » — aucune mise en file, aucun `_pendingSync`, `syncStatus` figé à « syncing » (l.4314). (2) `supaPublishPostWithRetry` (app-08 l.3318+, boucle `for attempt ≤ maxRetries=2`, pause 1 s) ne réessaie qu'en session, jamais après `online` ni au boot. (3) Les 7 écouteurs `online` du dépôt (git grep) rejouent messages (`_flushOutbox`), commentaires (`_cmtObFlush`), suppressions (`_delObFlush`), bobines de `mePublish` (`_scheduleReelRetry`, app-08 l.1408 filtre `_pendingSync && isReel` — jamais posé par `publishPost`) ; celui d'app-09 l.261-273 ne fait que RELIRE `supaLoadPosts` (jamais renvoyer un post local). (4) Aucune trace du défaut dans .passio/context/KNOWN_RISKS.md (R1-R… : rien sur la publication), DECISIONS.md, CURRENT_PRIORITIES.md ; TECH_DEBT.md n'existe pas ; docs/PIEGES_CONNUS.md l.23/88/94 documentent les trois files existantes (bobines, commentaires `_cmtOb*`, suppressions `_delOb*`) sans jamais mentionner les posts du Studio — la file des commentaires y est d'ailleurs présentée comme le patron à suivre, donc la correction proposée est CONFORME à la doctrine du projet. (5) Aucun test e2e n'exerce la reprise (git grep « Post en local » dans tests/ : seul passion-personnalisee-fk.spec.js l.155-159, qui vérifie le libellé d'erreur de passion). docs/AUDIT_FINAL_10_POINTS.md l.291 et NEXT_ACTIONS_TIMELINE.md l.89 citent le toast comme un comportement « OK » : ancien rapport, pas une décision d'assumer la perte. Aucun invariant contredit ; aucune touche à ADR-009/tests/ ; pas de liste noire. git status --short vide. — Correction de formulation : Reformuler le titre/observé : « reste “Sync…” à vie » est le symptôme de CONT-03 (même domaine : `syncStatus` n'est JAMAIS passé à « synced », même en cas de succès — app-02 l.6744-6747 n'a aucun écrivain « synced »), donc le badge ne prouve pas l'absence de reprise ; la preuve décisive de CONT-02 est `reprise_apres_online → pubCalls:0` + absence de tout écouteur `online` renvoyant un post local (app-09 l.261-273 ne fait que relire). Ajouter dans « preuve » la ligne app-09:261-273 (seul écouteur `online` lié aux posts, en LECTURE seule) et préciser que `supaPublishPostWithRetry` a bien 2 tentatives en session (maxRetries=2, 1 s) — l'attendu doit dire « reprise APRÈS abandon/rechargement », pas « aucun réessai ». Ajouter au risque de régression : nommage `_postOb*` (collision `_outboxLoad`), 23503/passion non canonique = jamais en file, clé dans `ACCOUNT_SCOPED_KEYS`, borne d'essais (voir MSG-11, messagerie-notifs, même famille inverse : file sans borne). Doublons probables : CONT-03 (badge) — à lier, pas fusionner ; MSG-11 (borne de file) — à citer comme contrainte de conception.

### CONT-03 — Badge « Sync… » affiché en permanence sur mes publications, même après « Post publié »

| Champ | Valeur |
|---|---|
| Identifiant | CONT-03 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Fil — carte de mes publications |
| Résultat attendu | « Sync… » pendant l'envoi, « En ligne » après succès, « Local » après échec |
| Résultat observé | `syncStatus` n'est écrit qu'à « syncing » à la création et jamais mis à jour ; la carte affiche « Sync… » y compris après le toast de succès et après rechargement |
| Reproduction | Publier un post ; lire `.post-author-meta` de la carte (clé feed_rendu) ; capture 02-feed-post-photo.png |
| Preuve | js/app-06-reels-partage.js:4314 (seule écriture) ; grep `syncStatus` js/ : aucune autre affectation ; rendu js/app-02-state-utils.js:6744-6747 |
| Impact utilisateur et commercial | Message contradictoire (« Post publié » vs « Sync… »), perte de confiance dans la synchronisation ; masque le vrai cas d'échec (CONT-02) |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Écrire `post.syncStatus = ok ? "synced" : "offline"` dans le `.then` de supaPublishPostWithRetry (app-06:4354) et repeindre la carte ; `supaLoadPosts` marque « synced » |
| Risque de régression | faible |
| Effort estimé | 1 heure |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit sur le SHA audité (git diff --stat c8cb8e99 HEAD -- js index.html sw.js : vide). - `grep -rn syncStatus js/ index.html sw.js` : 5 occurrences seulement — 1 écriture (js/app-06-reels-partage.js:4314 `syncStatus: "syncing"` à la fabrication du post dans publishPost) et 4 lectures de rendu (js/app-02-state-utils.js:6744-6747, trois libellés « Sync… » / « En ligne » / « Local » sous `p._source === "me"`). Aucune affectation à « synced » ni « offline » nulle part : les deux états sont du code mort. - js/app-06-reels-partage.js:4354-4357 : le `.then(ok => { saveState(); renderFeed(); })` de `supaPublishPostWithRetry` repeint le fil sans toucher `post.syncStatus` ; l.4361 le toast « Post publié » part sur `syncSuccess` sans mise à jour du champ. - Preuve d'émulation de l'auditeur relue (preuves/contenu/emulation-resultats.json) : `publish_double_clic` → toasts [...,"Post publié"] et `post.syncStatus: "syncing"` ; `feed_rendu.meta` = « 🎸 Musique · à l'instant Sync… » (stub `supaPublishPostWithRetry` renvoyant `true`, donc chemin de SUCCÈS) ; `post_local_apres_reload` → toujours « Sync… » après rechargement (le post persiste dans `state.userPosts` avec son champ, et `renderFeed` dédoublonne par `seenIds` sans re-qualifier le statut, app-02:6107-6111). - La preuve citée existe, est bien lue et décrit exactement le comportement rapporté. Le champ ne reflète jamais l'issue de la synchronisation ; le badge est donc un mensonge permanent, contradictoire avec le toast de succès et incapable de signaler l'échec réel (CONT-02). — Correction de formulation : Formulation exacte ; une seule nuance : l'effet est cosmétique/confiance, un P3 serait défendable si CONT-02 (absence de file de reprise) est corrigé en même temps — car c'est ce dernier qui rend le badge dangereux (il masque un post jamais envoyé). Garder P2 tant que CONT-02 est ouvert. La correction proposée doit aussi couvrir le chemin d'échec du `.then` (`ok === false` → « offline ») et le `catch` (l.4367) pour que « Local » ait enfin un émetteur.
- **impact** → CONFIRMÉ (priorité proposée P2). Défaut réel, vérifié sur le SHA audité (HEAD f501fb78, aucun fichier js touché depuis c8cb8e99) : `grep -rn syncStatus js/` ne rend que 5 lignes — UNE seule écriture, js/app-06-reels-partage.js:4314 (`syncStatus: "syncing"` à la fabrication du post), et le rendu js/app-02-state-utils.js:6744-6747 qui peint « Sync… » / « En ligne » / « Local » selon la valeur. Ni le `.then(ok)` de supaPublishPostWithRetry (app-06:4354-4357), ni la branche succès (4360), ni le catch (4370), ni le rechargement `supaLoadPosts` (4392+) ne réécrivent le champ : l'état « syncing » est persisté par saveState() (4335) et survit au rechargement. Preuve d'émulation du domaine (preuves/contenu/emulation-resultats.json) : `feed_rendu.meta` = « 🎸 Musique · à l'instant Sync… » après le toast « Post publié » ; `post_local_apres_reload.syncStatus` = "syncing" ; capture 02-feed-post-photo.png. Aucune décision produit ne justifie ce comportement : `grep syncStatus|Sync…` dans docs/, .passio/, CLAUDE.md, AGENTS.md ne rend rien — ce n'est ni un ADR ni une fiche de lot, c'est un tracker inachevé (commentaire « 🔄 Tracker le statut de sync »). Priorité : P2 est juste. Le badge est borné aux cartes de l'AUTEUR (`p._source === "me"`, jamais visible par un autre compte), en 10 px couleur --muted ; il ne casse aucune fonction, ne touche ni isolation, ni restauration, ni sécurité IRL/modération, ni aucun critère d'interdiction du GO. Il ne bloque donc pas la commercialisation (P0) et n'est pas indispensable avant lancement public (P1) : le cas réellement grave — post jamais retenté ni signalé comme perdu — est déjà porté par CONT-02 (P1), dont CONT-03 n'est qu'un symptôme d'affichage. « Amélioration importante » correspond : message contradictoire vu par chaque utilisateur à chaque publication, correctif d'une heure sans risque, à livrer avec CONT-02 puisque les deux se corrigent au même endroit (le `.then` d'app-06:4354). — Correction de formulation : Formulation exacte, rien à corriger sur attendu/observé/preuve. Deux précisions utiles pour le rapport : (1) ajouter que le badge n'est visible QUE par l'auteur (`_source === "me"`, app-02:6744), ce qui borne l'impact commercial à la confiance du créateur et non à la perception des lecteurs ; (2) rattacher explicitement CONT-03 à CONT-02 comme « même correctif, même ligne » (le `.then` d'app-06:4354 doit à la fois écrire `synced`/`offline` ET enfiler le post dans une file de reprise), pour éviter qu'un correctif cosmétique de CONT-03 seul masque encore mieux l'échec réel en affichant « Local » sans reprise.

### CONT-04 — Le lien de partage d'un profil (#user-<id>) n'est routé par personne

| Champ | Valeur |
|---|---|
| Identifiant | CONT-04 |
| Priorité retenue | **P1** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Partage de profil (menu ⋯ du profil visité, shareUserProfile) |
| Résultat attendu | Ouvrir le lien partagé affiche le profil visé |
| Résultat observé | Le lien est fabriqué avec `#user-<uid>` ; aucun routeur ne traite ce hash : le destinataire arrive sur le fil, sans message |
| Reproduction | shareUserProfile('u_theo') → URL `…#user-u_theo` ; poser ce hash → aucune modale, écran feed (clés partage_profil_url, deep_link_user_route) |
| Preuve | js/app-04-comments-shop.js:3384 (émetteur) ; grep `#user-` dans js/ : aucun consommateur ; js/first-run.js:441 RE_LIEN_PROFOND attend `#profil-`, jamais émis |
| Impact utilisateur et commercial | Boucle de croissance cassée : partager un profil ne ramène personne sur ce profil ; télémétrie de lien (`plk`) mesure des ouvertures qui n'aboutissent pas |
| Visibilité dans le Centre de pilotage | partiel — le lien est tagué (tel.shareLink) mais l'échec d'ouverture n'est pas un événement |
| Détection par la Sentinelle | non |
| Proposition de correction | Ajouter un routeur `#user-<id>` sur le modèle de `_openReelDeepLink` (attente app prête, openUserProfile(id,'seed'), hash nettoyé au succès) et aligner RE_LIEN_PROFOND |
| Risque de régression | faible |
| Effort estimé | 0,5 jour |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit sur le SHA audité (git diff --stat c8cb8e99 HEAD -- js index.html sw.js : vide). - Émetteur : /home/user/passio-app/js/app-04-comments-shop.js:3384 `const rawUrl = location.origin + location.pathname + "#user-" + userId;` (shareUserProfile). - Consommateurs : `grep -rn "#user-" js/ index.html sw.js` → une seule occurrence, l'émetteur. Les seuls fichiers lisant `location.hash` (app-02:2215, app-06:78/141/154, app-07:4263/4302/6620/6653, app-08:2176, first-run.js:444/1085, platform.js:189) ne traitent que `#reel=`, `#irl-event-`, `#irl-checkin-`, `type=recovery` et les noms d'écran NAV_SCREENS (retour arrière app-02:2216). Aucun routeur `#user-`. - /home/user/passio-app/js/first-run.js:441 `RE_LIEN_PROFOND = /^#(reel=|irl-event-|irl-checkin-|event-|post-|profil-|conv-)/` : `#profil-` attendu, `#user-` non reconnu → memoriserRetour (l.1085-1090) ne conservera pas non plus ce lien pour un visiteur qui s'inscrit après l'avoir ouvert. - Test exécuté (Chromium, PASSIO_PORT=8120, config scratchpad étendant playwright.config.js, bootOnboarded avec query "#user-u_theo") : chargement À FROID → {hash:"#user-u_theo", modal:false, visited:false, ecran:"screen-feed", toasts:[]} ; hashchange → identique ; témoin `#irl-event-e1` sur le même socle → hash réécrit "#event-e1", ecran "screen-irl" (le mécanisme de lien profond fonctionne, seul `#user-` est absent). 1 passed (23,2 s). - La preuve de l'auditeur (emulation-resultats.json, clés partage_profil_url / deep_link_user_route) est cohérente mais ne testait que le hashchange sur page déjà chargée ; le chargement à froid — le cas réel du destinataire — est désormais couvert et donne le même résultat. git status --short : vide. — Correction de formulation : Formulation juste. Deux précisions à ajouter : (1) le défaut est reproduit aussi au CHARGEMENT À FROID de l'URL (pas seulement par hashchange), ce qui est le cas réel du destinataire ; (2) conséquence secondaire de RE_LIEN_PROFOND (first-run.js:441 + memoriserRetour l.1085-1090) : un visiteur sans compte qui ouvre le lien puis s'inscrit ne retrouve pas non plus la destination, car `#user-` n'est pas mémorisé comme lien profond. La correction proposée doit donc inclure l'ajout de `user-` (ou l'émission de `#profil-`) dans RE_LIEN_PROFOND, sinon le routeur seul ne couvrira pas le parcours inscription. Impact/effort/priorité P2 inchangés.
- **impact** → CONFIRMÉ (priorité proposée P1). Défaut réel, vérifié sur le code du SHA audité (diff js/ vide entre c8cb8e99 et HEAD f501fb78) : - Émetteur : js/app-04-comments-shop.js:3384 `location.origin + location.pathname + "#user-" + userId`, passé à `tel.shareLink(..., "profile", ...)` puis `partagerOuCopier`. - Consommateurs : `grep -rn "#user-\|'user-\|\"user-" js/ index.html sw.js` → une seule occurrence, l'émetteur. Les seuls routeurs de hash sont `#reel=` (app-06:78,140), `#irl-event-` (app-07:4263,4301), `#irl-checkin-` (app-07:6620,6652), `type=recovery` (app-08:2176) ; le repli popstate d'app-02:2215-2218 ne suit le hash que s'il nomme un écran de `NAV_SCREENS`, sinon `goTo("feed")` — c'est exactement l'atterrissage observé. - js/first-run.js:441 `RE_LIEN_PROFOND` reconnaît `#profil-` (jamais émis) et pas `#user-` : pour un destinataire sans compte (le cas nominal d'un lien partagé), le module de première visite ne voit même pas de lien profond et pose la carte de bienvenue sur le Fil. - Aucune décision documentée ne justifie ce comportement : docs/lots-ui/12-PROFIL-VISITE-OPTIONS.md:18 présente `shareUserProfile` comme une porte livrée (« Partager » du menu ⋯), sans réserve sur le routage ; docs/lots-ui/02 fixe les invariants d'un lien profond, ce qui montre que le routage est la norme du projet, pas une option. Aucune suite e2e ne cible `#user-` (grep tests/e2e vide). Priorité : ce n'est ni un critère d'interdiction du GO ni un P0, mais P2 (« amélioration importante ») sous-estime : c'est une commande livrée et visible dont le résultat est FAUX en silence, sur la seule surface qui s'adresse à des personnes EXTÉRIEURES (le destinataire d'un partage est par définition le public du lancement), et la télémétrie `plk` compte l'ouverture comme un succès — la mesure de la boucle de croissance mentira dès le lancement. La culture du dépôt classe un « tap mort » comme un défaut à corriger, pas comme une optimisation. Effort 0,5 j, à faire AVANT lancement public → P1. — Correction de formulation : Impact à nuancer : la boucle n'est pas « cassée » mais DÉGRADÉE — le destinataire atterrit bien dans PASSIO (mode invité, « l'application est elle-même le pitch »), c'est le profil visé qui n'est jamais montré et l'intention du partageur qui est perdue ; la télémétrie `plk` compte l'ouverture comme aboutie, donc le KPI de partage sera FAUX (surestimé), pas absent. Ajouter au champ observé le cas du destinataire SANS compte : `RE_LIEN_PROFOND` ne reconnaît pas `#user-`, donc la carte de bienvenue/le tour se posent comme s'il n'y avait aucun lien profond. Risque de régression « faible » est optimiste : un routeur `#user-` doit respecter les invariants de docs/lots-ui/02 (`state` null avant `loadState`, replanification sous try, hash nettoyé au seul succès, rien par-dessus gate/landing/onboarding), filtrer les comptes bloqués/privés dans `openUserProfile`, et ajouter `user-` à `RE_LIEN_PROFOND` pour que first-run n'empile pas la bienvenue sur la modale → « moyen ». Priorité P1 au lieu de P2 ; ajouter un verrou e2e (aucune suite ne cible `#user-`).

### CONT-05 — Le partage externe d'un post ne porte aucun lien profond vers le post

| Champ | Valeur |
|---|---|
| Identifiant | CONT-05 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Feuille de partage d'un post → « Partager en dehors » |
| Résultat attendu | L'URL partagée ouvre la publication (comme `#reel=` pour les bobines) |
| Résultat observé | URL partagée = `https://passio-app.netlify.app` seule ; aucune route `#post-` n'existe |
| Reproduction | sharePost(id) → « Partager en dehors » → lire `data.url` |
| Preuve | js/app-03-posts-vlogs.js:35-36 ; grep `#post-` js/ : seulement first-run.js:441 (regex sans consommateur) |
| Impact utilisateur et commercial | Le contenu partagé hors app n'est jamais retrouvé ; viralité nulle sur les posts (les bobines ont, elles, un lien) |
| Visibilité dans le Centre de pilotage | partiel — tel.action share_post existe (app-03:57), pas la destination |
| Détection par la Sentinelle | non |
| Proposition de correction | Émettre `#post=<id>` et router comme `#reel=` (garde findPostAnywhere/visibilité, openPost) |
| Risque de régression | faible |
| Effort estimé | 0,5 jour |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit par inspection du code sur le SHA audité (git diff c8cb8e99..HEAD sur js/ index.html sw.js vide ; `git show c8cb8e99:js/app-03-posts-vlogs.js` identique). - js/app-03-posts-vlogs.js:39-40 (et non 35-36) : le listener du bouton « Partager en dehors » de `sharePost(id)` fait `const shareUrl = "https://passio-app.netlify.app"; partagerOuCopier({ title: "PASSIO", text: txt, url: shareUrl }, …)` — l'id du post n'entre jamais dans l'URL ; le commentaire l.34-38 explique que l'ancien `#carnet-<id>` a été retiré sans remplacement. - Aucun routeur de post : `grep -rn "#post-\|#post=" js/ index.html sw.js` ne rend que js/first-run.js:441 (`RE_LIEN_PROFOND`, simple détection d'un hash « profond », aucun consommateur qui ouvre un post). Les seuls routeurs de hash existants sont `#reel=` (app-06:78,141,154), `#irl-event-` (app-07:4263,4302), `#irl-checkin-` (app-07:6620,6653) et le repli popstate d'app-02:2215 qui n'accepte que les noms d'écrans (`NAV_SCREENS`). - Contraste réel avec les bobines : app-05:2914 et app-06:216 construisent `${location.origin}${location.pathname}#reel=${encodeURIComponent(postId)}`. - La preuve d'émulation du domaine (emulation-resultats.json « partage_modal ») ne mesure que la présence des boutons ; c'est le code qui prouve l'URL, ce qui suffit ici (constante littérale). Impact bien qualifié (viralité nulle pour un post texte/photo partagé hors app, alors que les bobines ont un lien) ; P2 tenable, pas bloquant pour la commercialisation. — Correction de formulation : Corriger la référence de preuve : le lien fixe est à js/app-03-posts-vlogs.js:39-40 (déclaration `shareUrl` + appel `partagerOuCopier`), pas 35-36 (lignes de commentaire). Préciser dans « reproduction » que la preuve est une constante littérale lue dans le code (inspection), l'émulation n'ayant relevé que les libellés des boutons. Le reste (attendu/observé/impact/effort) est exact.
- **impact** → CONFIRMÉ (priorité proposée P2). Défaut réel, vérifié sur le SHA audité : js/app-03-posts-vlogs.js:35-40 — le bouton « Partager en dehors » d'un post émet `shareUrl = "https://passio-app.netlify.app"` (racine nue) et affiche le toast « Lien copié ». Aucun routeur `#post-`/`#post=` n'existe : `grep -rn '#post' js/ index.html` ne rend que les routes `#reel=` (app-06:78,141,154,216 ; app-05:2914) et les commentaires de first-run.js:430/1828 ; l'unique mention d'un `#post-<id>` est un projet non réalisé dans docs/PASSIO_NOTIFICATIONS_V2_HEALTHY_REENGAGEMENT_2026-08-20.md:888. Ce n'est PAS une décision produit documentée : le commentaire en app-03:35-38 justifie uniquement le retrait du lien `#carnet-<id>` (ADR-011 §6, docs/lots-ui/09) parce qu'aucun routeur ne l'attrapait plus ; ni ADR-011, ni CLAUDE.md, ni docs/lots-ui/02 (liens profonds UI-5) ne décident que les posts n'auront pas de lien. Au contraire, le dépôt a choisi de doter bobines (`#reel=`), événements (app-07:4354) et profils (app-06:777, app-04:3387) d'un lien ciblé — le post est l'exception, et l'incohérence est même reconnue en app-03:37-38 (« déposait le destinataire sur le fil, sans un mot »). Priorité : aucun critère d'interdiction du GO n'est touché (pas d'isolation, restauration, capacité, sécurité ou modération) et rien n'empêche de vendre l'app → pas P0/P1. Ce n'est pas non plus une simple optimisation P3 : pour un réseau social, le partage externe d'une publication est une boucle de croissance de base (docs/CHECKLIST_COMMERCIALISATION.md:31 coche « Partage post » comme fait, ce qui est trompeur), et le toast promet un « lien » qui n'en est pas un. P2 « amélioration importante » est la bonne priorité. Réserve sur la correction proposée : router `#post=<id>` doit respecter la visibilité (comptes privés, blocages, `post_is_visible`) comme `buildReels` le fait pour `#reel=` — à traiter en même temps, sinon on crée un chemin de lecture non gardé. `git status --short` : vide. — Correction de formulation : Impact à nuancer : « viralité nulle » est excessif — le texte du post (100 premiers caractères) est bien partagé et l'URL racine mène à l'app, où la première visite entre directement dans le fil (first-run) ; écrire « viralité réduite : le destinataire n'atteint jamais la publication partagée ». Ajouter à l'observé que le toast « Lien copié » promet un lien ciblé qui n'existe pas (attente utilisateur trompée), et que docs/CHECKLIST_COMMERCIALISATION.md:31 marque « Partage post » comme fait. Compléter la correction : la route `#post=<id>` doit reprendre la garde d'appartenance/visibilité de `#reel=` (comptes privés, blocages) et suivre les invariants de docs/lots-ui/02 (state null avant loadState, replanification, hash nettoyé au seul succès, rien par-dessus gate/onboarding) — risque de régression « faible » à porter à « moyen » à cause de cette garde. Effort 0,5 j plausible si le routeur `#reel=` est dupliqué ; sinon 1 j avec le verrou e2e.

### CONT-06 — Story « publiée » même quand le serveur refuse, et aucune suppression de story possible

| Champ | Valeur |
|---|---|
| Identifiant | CONT-06 |
| Priorité retenue | **P1** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Stories (composer texte et éditeur média) |
| Résultat attendu | Échec serveur = story retirée localement + message ; l'auteur peut supprimer sa story avant 24 h |
| Résultat observé | Le résultat de supaPublishStory est ignoré, toast « Story publiée » inconditionnel, story ajoutée à `state.seed.stories` ; aucune fonction de suppression de story dans le code |
| Reproduction | supaPublishStory stubbé à false → publishStoryFromComposer() : stories 7→8, aucun toast d'échec, `typeof deleteStory === 'undefined'` (clé story_echec_serveur) |
| Preuve | js/app-08-ui-modals-tour.js:570-573 et 1339-1341 ; grep `from("stories")` : select/insert seuls (purge de compte à part, app-02:3090) |
| Impact utilisateur et commercial | Story visible chez l'auteur seul, invisible pour tous ; impossible de retirer une story publiée par erreur (RGPD/modération : seule la suppression de compte l'efface) |
| Visibilité dans le Centre de pilotage | partiel — flux publish_story settle « error » (app-08:3998) mais l'écran ne le reflète pas |
| Détection par la Sentinelle | partiel |
| Proposition de correction | Attendre le verdict de supaPublishStory et retirer la story + toast en cas d'échec ; ajouter « Supprimer ma story » (delete RLS auteur + retrait local + Storage) |
| Risque de régression | faible |
| Effort estimé | 0,5 jour |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit sur le SHA audité (git diff c8cb8e99..HEAD -- js index.html vide). Code : js/app-08-ui-modals-tour.js:556-573 (`publishStoryFromComposer`) — `state.seed.stories.unshift(story)`, `saveState()`, puis `supaPublishStory(story)` appelé SANS await ni lecture de la valeur de retour, `closeModal()`, `renderStories()`, `toast("Story publiée","success")` inconditionnel ; même schéma dans l'éditeur média l.1333-1341 (`mePublish`, mode story). `supaPublishStory` (l.3968-4028) rend pourtant `false` sur upload raté / refus RLS (`_writeVerdict`) et règle le flux tel `publish_story` en échec — verdict jeté par les deux appelants. Test exécuté (émulation Chromium, http-server 8120, script preuves/relecture-cont06/repro.js, sortie repro-sortie.txt) : `supaPublishStory` stubbé à false → stories 7→8, ma story présente dans `state.seed.stories` (mine:1), bulle « Voir ta story » peinte dans #storiesRowFeed, toasts = ["Story publiée|success"], aucun toast d'échec, `typeof deleteStory === "undefined"`, aucune fonction globale `*story*` de suppression, #storyViewer n'expose que closeStoryViewer/storyPrev/storyNext. grep `from("stories")` : insert (l.3997) et select (l.4033) seulement ; aucun `.delete()` client. Note : le champ `toasts: []` de l'émulation d'origine était une lacune de capture, pas une contradiction — le toast inconditionnel est bien émis. — Correction de formulation : Deux retouches de formulation : (1) « impact » — la story fantôme n'est visible chez l'auteur QUE jusqu'au prochain rechargement/hydratation (seed non persisté, app-02:234), pas durablement ; le défaut réel est le faux succès (toast + bulle) sans aucun signal d'échec, et la télémétrie `publish_story` en erreur est la seule trace. (2) « correction » — inutile d'ajouter une « delete RLS auteur » : la policy DELETE « Suppression propre » existe déjà en prod (policies.json l.104) ; il ne manque que le bouton « Supprimer ma story » dans #storyViewer, l'appel `supa.from("stories").delete()` avec lecture de `{ error }` (0 ligne = refus), le retrait de `state.seed.stories` et le nettoyage du média Storage. La priorité P2 est justifiée : impact modération/RGPD réel mais faible volume (stories 24 h, 5 comptes).
- **impact** → CONFIRMÉ (priorité proposée P1). 1) Défaut réel, pas une décision produit : js/app-08-ui-modals-tour.js:573 et :1339 appellent `supaPublishStory(story)` sans `await` ni lecture du retour, puis `toast("Story publiée","success")` inconditionnel (:575, :1341). `supaPublishStory` (app-08:3968-4028) lit bien `{error}` via `_writeVerdict` et rend `false`, mais `_writeVerdict` (app-02:376-397) ne fait que `console.warn`/`diagLog` — aucun toast, aucun retrait de `state.seed.stories`. Cela contredit l'invariant CLAUDE.md « Échec réel = annuler l'affichage optimiste ». Preuve d'émulation cohérente : emulation-resultats.json `story_echec_serveur` = stories 7→8, toasts [], deleteStoryFn "undefined". 2) Atténuation non mentionnée par l'auditeur : au boot, app-08:5845-5846 REMPLACE `state.seed.stories` par le résultat serveur s'il est non vide → une story refusée disparaît en silence au prochain rechargement (mais persiste si le serveur ne renvoie aucune story). L'échec reste invisible à l'écran, visible seulement en télémétrie (`tel.settle("publish_story", saved=false)`). 3) Suppression : la policy DELETE existe (preuves/supabase-isolation/policies.json ligne 104 « Suppression propre » `author_id = auth.uid()`, migrations/migration_rls_v2_appliquee.sql:54), mais aucune fonction UI/JS (`grep from("stories")` : insert :3997 et select :4033 seuls ; purge de compte app-02 « ["stories","author_id"] » à part). Aucun ADR ni fiche docs/lots-ui ne documente une story non supprimable ; ADR-010:98 ne parle que de la passion facultative. Il n'existe pas non plus de purge serveur des stories > 24 h (aucun cron hors purge_client_errors) : la ligne reste en base, invisible. 4) Priorité : P2 sous-estime la moitié « suppression ». Une story (photo/vidéo) publiée par erreur reste visible 24 h à tout compte non bloqué (lecture publique sauf compte privé, policies.json ligne 103) sans aucun recours autre que supprimer le compte : c'est une attente de base d'un réseau social public et une exposition de vie privée → P1 « avant lancement public ». Ne bloque pas la commercialisation (P0) : pas d'isolation rompue, purge RGPD au delete-account existante, expiration 24 h. La moitié « publication refusée restée réussie » reste P2 (cas rare : refus RLS ou média non uploadé, tracé en télémétrie, partiellement auto-corrigé au reload). — Correction de formulation : Scinder en deux problèmes : (a) « Impossible de supprimer sa story pendant 24 h » → P1, impact à reformuler : exposition d'un média publié par erreur à tous les comptes non bloqués pendant 24 h, ligne conservée en base sans limite (aucun cron de purge), seule sortie = suppression du compte ; effort ~0,5 j (bouton dans le visionneur de sa propre story, `supa.from("stories").delete().eq("id",…).select()` + `_writeVerdict({expectRows:true})` + retrait Storage + retrait local). (b) « Résultat de supaPublishStory ignoré » → P2, en précisant que `supaPublishStory` lit déjà `{error}` (le défaut est dans les DEUX appelants, pas dans la fonction) et que le boot remplace `state.seed.stories` par le serveur, donc la story fantôme ne survit qu'à la session ou tant que le serveur ne renvoie aucune story. Visibilité pilotage : « partiel » correct (settle saved=false + diagLog « publication de story KO »).

### CONT-07 — Follow/unfollow : un refus serveur laisse « ✓ Suivi » à l'écran et dans l'état

| Champ | Valeur |
|---|---|
| Identifiant | CONT-07 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Abonnements (toggleFollowUser) |
| Résultat attendu | Échec réel = annulation de l'affichage optimiste (invariant CLAUDE.md « écritures qui échouent en silence ») |
| Résultat observé | supaFollowUser rend `false`, l'état `following` et le bouton restent « suivi » ; supaUnfollowUser ne compte pas les lignes supprimées (0 ligne = RLS ou déjà absent, indistinct) |
| Reproduction | supaFollowUser stubbé à false → toggleFollowUser('u_theo') → following:true, bouton « ✓ Suivi » (clé follow_refus_serveur) |
| Preuve | js/app-04-comments-shop.js:3299 et 3310 (retour ignoré) ; js/app-08-ui-modals-tour.js:5317-5325 (delete sans `.select()` ni relecture) |
| Impact utilisateur et commercial | Compte privé : l'utilisateur croit suivre et ne voit pas le contenu ; désabonnement fantôme ; compteurs faux jusqu'au prochain supaLoadFollowing |
| Visibilité dans le Centre de pilotage | oui — flux follow_user/unfollow_user settle « error » (tel.settle) |
| Détection par la Sentinelle | partiel |
| Proposition de correction | `supaFollowUser(...).then(ok => { if (!ok) revert + toast })` ; unfollow avec `.select('following_id')` et relecture comme supaSetPostLike |
| Risque de régression | faible |
| Effort estimé | 2 heures |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). SHA audité : `git diff --stat c8cb8e99 HEAD -- js index.html` vide, le code lu est celui de c8cb8e99. - js/app-04-comments-shop.js:3280-3310 (`toggleFollowUser`) : l'état `state.user.following` et le bouton (« ✓ Suivi », fond accent) sont écrits AVANT l'appel, puis `supaFollowUser(userId);` (l.3298) et `supaUnfollowUser(userId);` (l.3308) sont appelés sans `.then`, sans lecture du retour, suivi de `saveState()` inconditionnel. Même schéma dans `blockUser` (l.3322). - js/app-08-ui-modals-tour.js:5293-5315 (`supaFollowUser`) rend bien `ok` (lit `res.error`, tolère 23505) et `false` dans le catch — mais aucun appelant n'exploite cette valeur. l.5317-5324 (`supaUnfollowUser`) : `delete().eq().eq()` sans `.select()` ni `count`, ne rend rien ; 0 ligne supprimée (RLS, session expirée, ligne absente) est indistinct d'un succès. - Preuve d'émulation vérifiée : preuves/contenu/emulation-contenu.js:175-182 stubbe `supaFollowUser` à `false`, appelle `toggleFollowUser("u_theo")` ; emulation-resultats.json → `{"following": true, "btn": "✓ Suivi"}`. Le refus est avalé, conforme à ce que dit le code. - Réalisme du refus : policies.json — follows INSERT `follower_id = auth.uid()` ; un `MY_UID` non aligné sur la session (session expirée, invité, compte non confirmé) ou une panne réseau rend `false`. Impact réel confirmé par la policy SELECT de `posts`/`stories` (« respectant les comptes prives ») qui exige une ligne `follows` : sans elle, le contenu d'un compte privé reste invisible alors que l'écran dit « ✓ Suivi ». - Aggravant non relevé : la réconciliation au boot (app-08:5925-5931) fait une UNION `[...following, ...ids]` — elle n'enlève JAMAIS un suivi fantôme local ; le défaut persiste donc au-delà du prochain `supaLoadFollowing`. git status --short : vide. — Correction de formulation : Preuve : les lignes exactes sont app-04:3298 et 3308 (pas 3299/3310) ; app-08:5317-5324 correct. Impact : remplacer « compteurs faux jusqu'au prochain supaLoadFollowing » par « le suivi fantôme n'est JAMAIS corrigé par supaLoadFollowing (fusion en UNION, app-08:5925-5931) ; seul le désabonnement fantôme l'est ». Ajouter `blockUser` (app-04:3322) comme second appelant qui ignore le retour de `supaUnfollowUser`. La correction proposée doit aussi faire de la réconciliation au boot un REMPLACEMENT (ou une intersection) et non une union, sinon le revert ne suffit pas pour les états déjà persistés.
- **impact** → CONFIRMÉ (priorité proposée P2). Défaut réel, vérifié sur le code (git diff c8cb8e99..HEAD -- js index.html vide) : js/app-04-comments-shop.js:3298 `supaFollowUser(userId);` et :3308 `supaUnfollowUser(userId);` — le retour est ignoré alors que js/app-08-ui-modals-tour.js:5306-5315 calcule explicitement `ok` (lecture de `{error}`, code 23505 = succès) et le rend ; supaUnfollowUser (app-08:5317-5324) fait un `.delete()` sans `.select()` ni relecture, 0 ligne indistinct d'un refus. Même défaut sur une 3ᵉ porte non citée : js/app-05-config-profil.js:4024/4029 (bouton `#vliveFollowBtn` du live vidéo). Ce n'est PAS une décision produit : l'invariant CLAUDE.md:69 dit textuellement « Échec réel = annuler l'affichage optimiste » en citant le follow ; KNOWN_RISKS.md:21 n'assume que la LECTURE publique de `follows`, pas l'écriture avalée. Aucune ADR/doc lots-ui ne documente un follow « best effort ». Priorité P2 juste : le refus RLS est improbable en pratique (policies.json l.62/65-66 : INSERT `follower_id = auth.uid()`, DELETE `follower_id = auth.uid()` — le client satisfait toujours ces prédicats, `supaEnsureProfileExists` précède), la cause réaliste est une panne réseau/session expirée ; aucun critère d'interdiction du GO n'est touché (pas d'isolation de comptes, pas de fuite, pas de sécurité IRL) ; le flux est visible du pilotage (dashboard/server/traces.js:74-75, settle « saved » false). Impact borné au graphe social et à la visibilité d'un compte privé (posts/stories SELECT l.86/103 exigent la ligne `follows`), donc amélioration importante avant lancement, pas bloquante. — Correction de formulation : Impact à corriger : « compteurs faux jusqu'au prochain supaLoadFollowing » est inexact dans le sens follow — la fusion au boot est une UNION (app-08:5928), donc le « ✓ Suivi » fantôme persiste à vie sur l'appareil ET se propage par user_state ; seul l'unfollow fantôme est réparé au reboot. Preuve à compléter : ajouter la 3ᵉ porte js/app-05-config-profil.js:4024-4029 (`#vliveFollowBtn`) à corriger dans la même passe, sinon survivant. Effort : 2 h reste crédible mais inclure les 3 appelants + un verrou e2e (stub de supaFollowUser à false → bouton revenu à « Suivre » et `following` sans l'id) ; parcours-suivre.spec.js ne le couvre pas aujourd'hui. Priorité P2 maintenue.

### CONT-08 — Aucun rate-limit ni borne serveur sur posts, post_comments et post_likes

| Champ | Valeur |
|---|---|
| Identifiant | CONT-08 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Publication / commentaires / likes — protection anti-abus côté base |
| Résultat attendu | Trigger rate_limit_insert (déjà utilisé sur comment_interactions) et longueur bornée (CHECK) sur les contenus |
| Résultat observé | posts : seul trigger `trg_posts_freeze_author` ; post_comments/post_likes : aucun trigger ; `content` sans CHECK de longueur ; seules bornes = maxlength HTML (1200 / 400), contournables par l'API REST |
| Reproduction | SELECT sur pg_trigger et information_schema.columns (résultats dans le contrôle CT-27) |
| Preuve | pg_trigger (tables posts/post_likes/post_comments), pg_constraint : aucun CHECK ; index.html:786, app-04:1024 |
| Impact utilisateur et commercial | Un seul compte confirmé peut inonder le fil ou les fils de commentaires de tout le monde (spam, contenu de 10 Mo par ligne), sans frein ni détection ; coût base et modération |
| Visibilité dans le Centre de pilotage | partiel — le volume d'actions apparaît dans interactions.js mais aucune alerte de seuil |
| Détection par la Sentinelle | non |
| Proposition de correction | Migration : `rate_limit_insert('author_id','60')` sur posts et post_comments, `('user_id','120')` sur post_likes ; CHECK char_length(content) ≤ 2000 / 500 ; passer par le canal DDL d'ADR-012 |
| Risque de régression | faible (seuils larges) ; vérifier les suites multi-comptes |
| Effort estimé | 0,5 jour |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P1). Reproduit sur c8cb8e99 (ancêtre de HEAD, diff js/index.html/migrations vide) sans le connecteur Supabase, par trois sources indépendantes concordantes : 1. preuves/supabase-isolation/fonctions_realtime_storage_staging.md:20 (dump live du 2026-09-04) : « Triggers actifs (12) : rate_limit sur comment_interactions(60/min), event_reactions(30/min), reports(10/min) ; freeze author posts ; … Aucun rate-limit sur … posts » — la liste exhaustive des 12 ne contient aucun trigger sur post_comments ni post_likes. 2. migrations/SCHEMA_PROD_REFERENCE.sql:894-910 (section DÉCLENCHEURS) : posts → trg_posts_freeze_author uniquement ; post_comments et post_likes absents. Section contraintes :350-355 : uniquement PK et FK (author_id→profiles, passion_id→passions), aucun CHECK ; colonnes :194-215 : posts.content et post_comments.content en `text` sans longueur. 3. preuves/supabase-isolation/policies.json:78,82,85 : les policies INSERT « Ecriture propre » de post_comments/post_likes/posts n'ont pour with_check que `author_id/user_id = auth.uid()::text` — aucune borne de contenu ni de cadence. Côté client : index.html:786 `maxlength="1200"` sur #postText et js/app-04-ui-rendering.js:1024 `maxlength="400"` sur #newComment, contournables par PostgREST (INSERT direct app-08:3434 posts, :3817 post_comments, app-03:253 post_likes) ; aucun throttle client (grep rate/flood/throttle/cooldown vide dans app-03/04/06). Le précédent existe déjà : migrations/migration_anti_flood_interactions.sql:98-139 (fonction rate_limit_insert + 3 triggers), ce qui rend la correction proposée directement applicable. Pilotage : dashboard/server/anomaly-engine.js:17-23 ne suit que errors/api_failures/slow_api/connectivity/version_skew — aucun seuil de volume de contenu, donc « détection Sentinelle : non » et « pilotage : partiel » sont exacts. git status --short : vide. — Correction de formulation : Le champ « preuve » cite une requête non déposée (« pg_trigger, pg_constraint ») ; le remplacer par des preuves de dossier : preuves/supabase-isolation/fonctions_realtime_storage_staging.md:20, policies.json:78/82/85, migrations/SCHEMA_PROD_REFERENCE.sql:194-215, 350-355, 894-910, et le précédent migrations/migration_anti_flood_interactions.sql:98-139. Nuance sur l'impact « likes » : la PK (post_id,user_id) borne à un like par post et par compte, donc l'inondation par likes ne passe que par des post_id inexistants (absence de FK vers posts, déjà relevée par le domaine avec 42/71 likes orphelins) — la correction devrait mentionner cette FK manquante comme borne complémentaire. Ajouter dans « visibilité pilotage » la référence exacte : dashboard/server/anomaly-engine.js:17-23 (métriques errors/api/connectivity/release seulement, aucun volume de contenu).
- **impact** → CONFIRMÉ (priorité proposée P1). 1) Défaut réel, corroboré par deux domaines indépendants : preuves/supabase-isolation/fonctions_realtime_storage_staging.md:20 (« Triggers actifs (12) : rate_limit sur comment_interactions(60/min), event_reactions(30/min), reports(10/min) … Aucun rate-limit sur notifications, conv_messages, posts, … ») et contenu CT-27. policies.json : posts/post_comments/post_likes INSERT = seul WITH CHECK `author_id|user_id = auth.uid()`, rien d'autre ; migrations/SCHEMA_PROD_REFERENCE.sql:350-355 ne liste aucun CHECK sur ces trois tables (les CHECK de longueur n'existent que via migration_anti_flood_interactions.sql, pour ci/evr/reports). 2) Pas une décision produit : aucun ADR, ni CLAUDE.md, ni docs/lots-ui ne documente l'absence volontaire ; .passio/context/KNOWN_RISKS.md:24 ne parle que du durcissement des fonctions. Le propre exposé de migrations/migration_anti_flood_interactions.sql:1-16 (« acceptaient des insertions illimitées avec payload texte arbitraire ») s'applique mot pour mot à posts et post_comments — c'est un oubli de périmètre, pas un choix. 3) Modèle de menace juste : le gate 2125 est côté client (docs/SECURITE_CODE_ACCES.md:48), l'inscription n'est freinée que par la confirmation e-mail ; un seul compte scripté suffit, et le fil est LA surface centrale de l'app (ADR-011). 4) Invisibilité confirmée : dashboard/server/interactions.js ne fait que corréler émission/réception (l.4-60), aucun seuil ; sentinel.js:36-37 « Elle ne voit QUE ce qui déclenche une alerte » → ni pilotage ni Sentinelle ne verraient une inondation. 5) Priorité : pas P0 (exige un compte authentifié, aucune fuite de données, signalement/blocage existent, 5 comptes en beta privée), mais P1 tient au regard du critère « modération insuffisante » du GO grande échelle et de l'ouverture publique qui supprime la seule barrière (humaine) actuelle ; le mécanisme existe déjà (rate_limit_insert), effort 0,5 j cohérent. 6) Incohérence inter-domaines à signaler à l'orchestrateur : SUP-07 (même classe, notifications vers n'importe qui + INSERT anon sur telemetry/client_errors) est classé P2 par supabase-isolation ; l'un des deux doit être aligné (je recommande P1 pour le volet notifications de SUP-07, P2 pour le volet télémétrie). — Correction de formulation : Priorité P1 maintenue. À corriger dans la formulation : (a) post_likes est déjà borné par sa clé primaire (post_id, user_id) (SCHEMA_PROD_REFERENCE.sql:352,430) — une inondation de likes est plafonnée au nombre de posts visibles et l'insert est idempotent (CT-11 : 23505 traité comme succès) ; ce volet est P3, à séparer du cœur du finding (posts + post_comments). (b) Observé : la borne client des commentaires est 400 (app-04:1024) OU 500 (app-04:1556, `cmtThreadInput`) selon la surface — le CHECK proposé ≤ 500 doit couvrir les deux, et la troncature client doit précéder l'insert (leçon de migration_anti_flood_interactions.sql:17-19 : une longueur refusée serait avalée en silence). (c) Impact : préciser « invisible du pilotage ET de la Sentinelle » (interactions.js sans seuil, sentinel.js:36-37), ce qui rattache le finding au critère d'interdiction du GO. (d) Ajouter le renvoi croisé à SUP-07 (P2) pour que l'orchestrateur aligne les deux priorités. (e) Le trigger doit aussi forcer created_at = now() sur posts (antidatage = sortie de la fenêtre de comptage ET tri du fil faussé, même défaut que celui corrigé pour comment_interactions).
- **contexte** → INCERTAIN (priorité proposée P1). agent sans résultat

### CONT-09 — Interactions sans clé étrangère vers posts : 42/71 likes, 58/86 commentaires et 145/361 interactions sont orphelins en prod

| Champ | Valeur |
|---|---|
| Identifiant | CONT-09 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Intégrité des données de contenu |
| Résultat attendu | FK post_likes.post_id / post_comments.post_id → posts(id) ON DELETE CASCADE ; comptages fiables |
| Résultat observé | Aucune FK (pg_constraint) ; les lignes survivent à la suppression du post ; supaLoadPosts recharge likes/commentaires par `in(post_id)` donc les orphelins ne sont pas affichés mais restent stockés et comptés par toute requête agrégée |
| Reproduction | Requêtes likes_orphan / comments_orphan / ci_orphan (contrôle CT-28) |
| Preuve | pg_constraint pour post_likes, post_comments, comment_interactions ; deletePost n'efface que la ligne posts (app-04:101-125) |
| Impact utilisateur et commercial | Statistiques et KPI faux (engagement), base qui gonfle, fuite de contenu de commentaires après suppression du post (les commentaires d'autrui restent lisibles via l'API si `post_is_visible` répond vrai sur un id absent — à vérifier) |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Migration : purge des orphelins puis FK avec ON DELETE CASCADE (post_likes, post_comments) ; pour comment_interactions, nettoyage périodique pg_cron |
| Risque de régression | moyen (identifiants de démo `p48`… ne doivent plus être écrits — déjà le cas pour les likes, app-03:322) |
| Effort estimé | 0,5 jour + revue RLS |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Le cœur du défaut est reproductible sans le connecteur : (1) absence de FK vers posts — preuves/supabase-isolation/ref_cols.txt (dump live pg_constraint) ne liste pour post_likes que `post_likes_pkey (post_id, user_id)`, pour post_comments que `post_comments_author_id_fkey → profiles` + PK, pour comment_interactions que la PK ; preuves/carto/CARTOGRAPHIE.md §10 (requête pg_constraint indépendante, 20 FK) confirme qu'aucune FK ne cible posts ; migrations/SCHEMA_PROD_REFERENCE.sql:350-354 idem ; `grep -rn "references.*posts *(" migrations/` → 0 résultat. (2) Suppression côté serveur : js/app-04-comments-shop.js:101-125 `_delObRun` n'exécute que `supa.from("posts").delete().eq("id",…)` puis `storage.remove` ; aucun `from("post_likes"/"post_comments").delete()` par post_id dans js/ (seuls les deletes par comment_id/user_id, app-03:262, app-04:1456, app-08:3854/3865). Les lignes survivent donc à la suppression d'un post. (3) Fuite de lecture après suppression (le finding l'annonçait « à vérifier ») : migrations/migration_comments_likes_privacy_rls.sql:31 `when not exists (select 1 from posts where id = pid) then true` + preuves/supabase-isolation/fonctions_realtime_storage_staging.md:8 (« pid inexistant → TRUE ») ; policies.json : post_comments/post_likes SELECT = `author_id = auth.uid() OR post_is_visible(post_id)` → tout compte (et anon, grant PostgREST) lit les commentaires d'un post supprimé ; comment_interactions via comment_target_visible (:61 `else true`) idem. (4) Lecture app : app-08-ui-modals-tour.js:3659/3662 charge likes/commentaires par `.in("post_id", postIds)` → orphelins invisibles à l'écran mais comptés par toute agrégation (`supaGetLikeCount` app-08:3805 par post_id est par contre sain). Pas de test Playwright nécessaire : le défaut est structurel (schéma + code). — Correction de formulation : Trois corrections de formulation : ① les références de lignes sont fausses par nom de fichier — « app-04:101-125 » vise js/app-04-comments-shop.js:101-125 (`_delObRun`, pas `deletePost` qui est à :204-235) et « app-03:322 » vise js/app-03-posts-vlogs.js:322-324 (`isDemoPost`/`willWrite`) ; ② le « à vérifier » de l'impact est tranché : `post_is_visible` rend TRUE sur un id absent (migration_comments_likes_privacy_rls.sql:31) → les commentaires/likes d'un post supprimé restent lisibles par tout rôle via PostgREST — c'est une fuite de contenu supprimé, à écrire comme observé et non hypothétique ; ③ les comptages d'orphelins ne sont étayés par aucune sortie déposée et mélangent deux populations : les likes sur posts de démo sont bloqués côté client (app-03:322 `isDemoPost` → pas d'écriture) mais les COMMENTAIRES sur posts de démo partent bien en base (`supaAddComment`, app-04:1105/1593, app-05:2599, emoji-misc.js:609, sans garde de démo) et sont « orphelins » PAR CONCEPTION (« Pas de ligne posts = contenu seed → public », migration :30) — une FK ON DELETE CASCADE casserait donc les commentaires sur le fil de démonstration ; la proposition de correction doit soit exclure les ids de démo (`^p\d+$`), soit poser la FK seulement après une décision produit sur les commentaires de démo. Priorité P2 maintenue (base réduite : 32 posts, aucun impact utilisateur visible, mais fuite de contenu après suppression).
- **impact** → CONFIRMÉ (priorité proposée P2). 1) L'ABSENCE de FK n'est pas un oubli mais une décision documentée de beta : migrations/migration_comments_likes_privacy_rls.sql:9-16 et :30 (« ~50 % des lignes sont orphelines (parent = post SEED démo local) … Pas de ligne posts = contenu seed/local → public ») et docs/PIEGES_CONNUS.md:28 (« Contrainte beta … règle "pas de ligne posts = visible" pour ne pas casser le cross-compte du contenu démo »). Le code s'y appuie : app-03:315-322 (un like sur un post local non encore synchronisé est écrit AVANT que la ligne posts existe et « redevient valide une fois le post envoyé ») ; une FK ON DELETE CASCADE telle que proposée refuserait ces inserts et casserait les commentaires cross-compte sur le contenu démo — le « risque de régression : moyen » du finding est sous-estimé. 2) La part réellement défaillante est ailleurs et elle est réelle : deletePost/_delObRun (app-04:101-125 et 204-232) n'efface que la ligne posts et les objets Storage ; post_comments/post_likes/comment_interactions du post supprimé survivent, et post_is_visible(pid inexistant) → TRUE (preuves/supabase-isolation/fonctions_realtime_storage_staging.md:8, policies.json : SELECT post_comments = author_id = auth.uid() OR post_is_visible(post_id)). Donc les commentaires d'un post supprimé — y compris d'un compte privé — deviennent lisibles par anon via PostgREST. Fuite marginale (contenu de commentaires d'autrui, pas d'isolation de compte), mais non documentée. 3) « visibilité pilotage : non » est FAUX : dashboard/server/reconcile.js:115-121 porte les règles likes_orphelins / commentaires_orphelins (severity warn), avec filtre SEED_ID (l.29-38) qui sépare références de démo et vrais orphelins, exposées sur /api/reconcile et /api/diagnose (index.js:124,136). Aucune référence dans sentinel.js → Sentinelle : non. Les KPI d'engagement (store.js:387-388) se calculent sur la télémétrie, pas par agrégat SQL → « KPI faux » est surestimé. 4) Priorité : aucun critère d'interdiction du GO n'est touché (pas d'isolation de comptes, fonction visible du pilotage). Le reste est une dette de données bornée (volumes : 86 commentaires, 71 likes) → P2 « amélioration importante » est juste, à condition de reformuler le défaut. — Correction de formulation : Attendu : ne pas exiger « FK ON DELETE CASCADE » (contredit la contrainte beta documentée et app-03:315-322) ; attendu = « la suppression d'une publication retire aussi ses commentaires/likes/interactions côté serveur, et un orphelin issu d'une suppression n'est plus lisible ». Observé : préciser que la majorité des orphelins sont des références au contenu de démo (décision documentée, migration_comments_likes_privacy_rls.sql:9-16, PIEGES_CONNUS.md:28) et que le vrai défaut est _delObRun (app-04:101-125) qui n'efface que posts + Storage. Impact : retirer « KPI faux » (KPI = télémétrie) ; garder la fuite résiduelle en la qualifiant de marginale (commentaires d'autrui sur post supprimé lisibles par anon, post_is_visible → TRUE sur id absent, vérifié). Visibilité pilotage : « partiel » (reconcile.js:115-121, règles likes_orphelins/commentaires_orphelins, seedRefs isolés) ; Sentinelle : non. Correction : supprimer post_comments/post_likes/comment_interactions dans _delObRun (ou trigger AFTER DELETE ON posts) + purge pg_cron des orphelins NON-seed ; une FK n'est envisageable qu'après retrait du modèle « seed local = visible », à documenter comme décision produit avant lancement public. Risque de régression : élevé pour la FK (contenu démo, likes avant sync), faible pour la cascade applicative. Effort : 0,5 j inchangé pour la cascade seule.

### CONT-10 — 39 des 58 objets du bucket `content` ne sont référencés par aucune ligne (dont 8 vidéos sur 10)

| Champ | Valeur |
|---|---|
| Identifiant | CONT-10 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Stockage des médias publiés |
| Résultat attendu | Un média Storage correspond à une publication/story/avatar vivante ; les orphelins sont purgés |
| Résultat observé | 39/58 objets orphelins sur un bucket de 153 Mo ; sources : uploads suivis d'un insert raté ou d'un timeout (app-08:3373-3390 réessaie l'upload sous le MÊME chemin avec upsert, mais un échec final laisse le fichier), suppressions RLS refusées, suppressions administratives |
| Reproduction | Requête storage_content_orphans (CT-28) |
| Preuve | storage.objects vs posts.media_url/stories.media_url/profiles.avatar_url\|cover_url ; storage_mime : videos video/mp4 : 10 pour 2 posts mp4 |
| Impact utilisateur et commercial | Coût Storage/egress inutile (≈ 2/3 du bucket), et médias de contenu supprimé toujours servis publiquement (URL devinable ? non, mais listable : voir CONT-11) |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Job pg_cron ou script `npm run purge` (canal ② ADR-012) qui liste storage.objects sans référence depuis > 24 h et les supprime ; retirer le fichier dans supaPublishPostWithRetry quand l'insert échoue définitivement (comme supaPublishStory le fait) |
| Risque de régression | faible si délai de grâce ≥ 24 h |
| Effort estimé | 0,5 jour |

Relecture (angles indépendants) :

- **reproduction** → INCERTAIN (priorité proposée P2). 1) Le MÉCANISME est réel sur c8cb8e99 (inspection code, `git diff --stat c8cb8e99 HEAD -- js index.html migrations scripts` vide) : js/app-08-ui-modals-tour.js:3368-3392 uploade le média AVANT l'insert ; l.3400-3406 réécrit l'URL Storage dans le post local puis `saveState()` ; l.3435-3460 : quand l'insert échoue définitivement (`attempt === maxRetries`, ou 23503 l.3452) on rend `_pubDone(false)` SANS `storage.remove` — alors que `supaPublishStory` (l.4012-4023) retire bien le fichier qu'elle vient d'uploader (`_uploadeIci`). Le commentaire l.3431-3433 admet lui-même « bobines orphelines constatées en prod ». Aucun purgeur d'orphelins n'existe : `scripts/purge-e2e-storage.js` ne supprime que les fichiers < 1 Ko de comptes disparus (l.16-21) ; aucun `cron.schedule` sur storage dans migrations/ ; delete-account (Edge) ne purge que photos/videos/audios (preuves/supabase-isolation/fonctions_realtime_storage_staging.md l.35). 2) Le CHIFFRE 39/58 (et « 8 mp4 sur 10 ») n'est PAS reproductible : la « requête storage_content_orphans (CT-28) » n'a laissé AUCUNE sortie dans preuves/contenu/ (grep « orphan|storage.objects » : uniquement les logs e2e), et le connecteur m'est interdit. Seul le total (58 objets / 153 Mo) est corroboré par l'orchestrateur. 3) La DÉFINITION d'orphelin du finding est trop étroite : la comparaison ne porte que sur posts.media_url, stories.media_url, profiles.avatar_url|cover_url. Or le bucket `content` reçoit aussi `passion_photos/` et `passion_covers/` (js/app-06-reels-partage.js:1002 et 1039 → stockés dans `profiles.passions` jsonb, ref_cols.txt l.29), `covers/`+`avatars/` (app-06:956,977), `cdv_steps/` (cdv_live_steps.photos jsonb / video, ref_cols.txt l.7 — données conservées par ADR-011) et `events.cover_url` (ref_cols.txt l.21). Les chemins réellement présents en prod incluent passion_photos, passion_covers, cdv_steps (fonctions_realtime_storage_staging.md l.32). Une partie des 39 « orphelins » peut donc être référencée légitimement ; le ratio « ≈ 2/3 du bucket » n'est pas établi. git status --short : vide. — Correction de formulation : Observé : remplacer le chiffre ferme « 39/58 (≈ 2/3 du bucket) » par « N objets non référencés — comptage à refaire contre TOUTES les tables référentes (posts, stories, profiles.avatar/cover ET profiles.passions jsonb, events.cover_url, cdv_live_steps.photos/video) » ; les préfixes passion_photos/, passion_covers/, cdv_steps/, covers/, avatars/ présents en prod n'étaient pas dans le périmètre de la requête citée. Preuve : la sortie de la requête doit être déposée dans preuves/ (aucune ne l'est) — la référence « CT-28 » n'est qu'une auto-citation. Ajouter à la preuve code : app-08:3435-3460 (échec définitif de l'insert sans `storage.remove`, contraste app-08:4012-4023 pour les stories) et app-08:3431-3433 (aveu « bobines orphelines constatées en prod »). Impact : garder « coût Storage inutile » mais retirer « ≈ 2/3 » tant que le comptage corrigé n'est pas fait ; l'exposition publique des médias de contenu supprimé relève de CONT-11. Correction : conserver, mais le purgeur doit lister TOUTES les colonnes référentes ci-dessus (sinon il effacerait des photos de passion, couvertures d'événements ou étapes de carnet conservées par ADR-011) — d'où un risque de régression « moyen », pas « faible ». Effort 0,5 j → 1 j (inventaire des référents + délai de grâce + test).
- **impact** → CONFIRMÉ (priorité proposée P2). Défaut réel, priorité P2 juste. (1) Aucune décision produit ne documente la conservation d'orphelins : scripts/purge-e2e-storage.js:1-24 reconnaît au contraire le phénomène (172 fichiers de test dans `content` le 2026-08-16, « chaque exécution de la suite multi-comptes en ajoutait une douzaine ») et ne purge que les fichiers < 1 Ko de comptes disparus (TAILLE_MAX = 1024, l.30/118-119) — les gros fichiers sont COMPTÉS, jamais supprimés : le mécanisme existant ne couvre donc pas le cas rapporté. (2) Côté client, la seule retenue d'orphelin est dans supaUploadMedia (app-08:3597, URL publique introuvable) et dans supaPublishStory (app-08:4020) ; supaPublishPostWithRetry (app-08:3365-3395, catch l.3454) ne retire pas le fichier quand l'insert échoue définitivement — vérifié, le finding est exact. (3) Pilotage : dashboard/server/reconcile.js ne contient aucun contrôle Storage/bucket (grep « storage|bucket » : seuls des libellés l.12/139/147/155) → « visibilité non » et « Sentinelle non » confirmés. (4) Priorité : aucun critère d'interdiction du GO n'est touché (ni isolation, ni restauration, ni sécurité IRL) ; l'enjeu est coût/hygiène sur 153 Mo et 5 comptes, plus la persistance de médias de contenu supprimé, dont l'exposition réelle relève de CONT-11 (P1, listage anonyme). Ce n'est pas P1 : sans CONT-11, l'URL d'un orphelin n'est pas devinable. Ce n'est pas P3 : un média d'une publication supprimée qui reste servi indéfiniment est une promesse de suppression non tenue envers l'utilisateur (docs/SUPPRESSION_DURABLE.md) et le volume croît mécaniquement à chaque run e2e. (5) Réserve sur le CHIFFRE : le référentiel de comparaison (posts/stories/profiles.avatar_url|cover_url) omet des destinations réelles du bucket `content` : events.cover_url (app-07:5668, dossier `events`), passion_photos/passion_covers écrits dans profiles.passions jsonb et user_state (app-06:1002/1039, `prof.photoUrl`/`coverUrl`), et les couvertures de bobines `reelcover_*` sous `photos` (ui-v7-lot.js:625-627). 39/58 est donc une BORNE HAUTE ; les 8 mp4 sur 10 (videos ne viennent que des posts/bobines) restent crédibles. — Correction de formulation : Observé : écrire « au plus 39/58 » et préciser que la comparaison a ignoré events.cover_url, profiles.passions (photoUrl/coverUrl des passions), user_state et les couvertures de bobines `reelcover_*` ; distinguer les fichiers de comptes e2e supprimés (cause documentée dans scripts/purge-e2e-storage.js, script existant mais borné à 1 Ko) des orphelins de comptes vivants. Preuve : ajouter la ventilation par dossier (photos/videos/audios/events/passion_photos/passion_covers) et par existence du compte propriétaire (70/70 objets ont un owner, preuves/supabase-isolation/fonctions_realtime_storage_staging.md l.30). Impact : rattacher explicitement l'exposition publique à CONT-11 (sans listage, l'orphelin n'est pas atteignable) et mentionner la promesse de suppression (docs/SUPPRESSION_DURABLE.md). Correction : étendre purge-e2e-storage.js (lever le seuil 1 Ko pour les comptes disparus + croiser toutes les références) plutôt qu'un nouveau job pg_cron — un DELETE direct sur storage.objects est interdit par le trigger storage.protect_delete (commentaire l.6-8 du script), donc le canal doit être l'API Storage via service_role, pas pg_cron. Effort 0,5 j inchangé.

### CONT-11 — La policy Storage SELECT autorise tout rôle (anon compris) à LISTER les objets des buckets content et attachments

| Champ | Valeur |
|---|---|
| Identifiant | CONT-11 |
| Priorité retenue | **P0** (proposée par l'auditeur : P1) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Storage — médias publiés et pièces jointes de conversations |
| Résultat attendu | Listage réservé au propriétaire (content) et aux membres de la conversation (attachments) ; lecture par URL seulement |
| Résultat observé | `passio_media_read` : SELECT, roles {public}, qual `bucket_id IN ('content','attachments')` → `storage.from('attachments').list()` sans session énumère `attachments/<convId>/…` (vocaux, photos privées), puis URL publique |
| Reproduction | SELECT sur pg_policies schemaname='storage' (CT-33) ; à reproduire hors audit avec un client anon : `supabase.storage.from('attachments').list('attachments')` |
| Preuve | pg_policies storage.objects (résultat cité dans CT-33) ; app-09:872-873 (chemins attachments/<convId>/<fichier>) |
| Impact utilisateur et commercial | Énumération des médias privés de la messagerie et de tout contenu supprimé encore en Storage ; contradiction avec la fuite DM corrigée le 2026-08-09 (KNOWN_RISKS) |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Remplacer la policy SELECT par `bucket_id='content' AND (owner = auth.uid())` OR `bucket_id='attachments' AND is_conv_member(...)` — la lecture par URL publique n'en dépend pas ; à défaut, passer `attachments` en bucket privé avec URLs signées |
| Risque de régression | moyen — vérifier que getPublicUrl n'utilise pas SELECT ; suites confidentialite/multi-comptes |
| Effort estimé | 0,5 jour + revue sécurité indépendante (changement RLS = critique, AGENTS.md) |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P1). 1) La policy existe telle que décrite, dans un dump indépendant du domaine contenu : preuves/supabase-isolation/policies.json:126 → {"s":"storage","t":"objects","p":"passio_media_read","cmd":"SELECT","roles":"{public}","qual":"(bucket_id = ANY (ARRAY['content','attachments']))","check":null} ; policies_liste_live.txt:110 la confirme ; policies.json:135 : « storage.objects … anon=arw » (le rôle anon détient SELECT sur la table, condition nécessaire au listage). 2) Le code source de la policy est dans le dépôt au SHA audité : migrations/migration_storage_buckets.sql:31-32 `create policy "passio_media_read" on storage.objects for select using (bucket_id in ('content','attachments'))` ; migrations/SCHEMA_PROD_REFERENCE.sql:829-831 identique. migrations/migration_storage_cloisonnement.sql:190-192 (« CE QUE CETTE MIGRATION NE FAIT PAS : elle ne referme pas la LECTURE : les seaux restent publics ») : le durcissement du 2026-08-17 n'a volontairement touché que INSERT/UPDATE. 3) Les pièces jointes privées vivent bien sous ce préfixe : js/app-09-boot-pwa.js:867 `var storagePath = "attachments/" + convId + "/" + fileName;` (fichiers joints) et :1597 `"attachments/" + convId + "/" + Date.now() + "_voice." + _vext` (vocaux), bucket "attachments" (:877, :1598), URL PUBLIQUE via getPublicUrl (:886, :1599) ; aucun createSignedUrl réel (app-08:2644 = stub hors-ligne). Buckets content/attachments public=true (fait orchestrateur + fonctions_realtime_storage_staging.md:29). isolation_par_table.md:33 : 12 vocaux `attachments/conv_<id>/<ts>_voice.webm` en prod, 70/70 objets visibles pour anon et tiers dans l'émulation SQL. 4) Mécanisme : l'endpoint POST /storage/v1/object/list/<bucket> s'exécute sous le rôle du JWT (anon avec la clé publiable embarquée dans app-08) avec la RLS de storage.objects ; « public=true » ne dispense d'auth que le GET /object/public/… — donc une qual réduite à bucket_id autorise l'énumération par un visiteur sans compte. Sans listing, le chemin (conv_<17 car.> + epoch ms) est peu devinable ; avec, il n'y a rien à deviner. 5) Seule limite : l'énumération HTTP réelle n'a PAS été exercée (preuves/messagerie-notifs/anon-rest-storage-probe.json : « anon POST storage list attachments » → 403 « Host not in allowlist », proxy de l'environnement), et je ne l'ai pas tentée non plus (prod interdite). Le défaut est donc établi par la policy + les grants + le code, pas par une requête anon effective. 6) git status --short : vide (0 ligne) ; aucun outil Supabase utilisé. — Correction de formulation : Fond exact ; trois retouches de forme. ① Preuve : citer js/app-09-boot-pwa.js:867 (pièces jointes) et :1597 (vocaux), pas 872-873 (ces lignes sont la conversion Uint8Array, sans chemin) ; préciser que convId est de la forme `conv_<17 car.>` (isolation_par_table.md:33) et que l'URL publique passe par getPublicUrl (:886, :1599), aucun createSignedUrl réel. ② Reproduction : écrire que le listage anon est DÉDUIT (policy + grant anon=arw + bucket public) et non exercé — la sonde HTTP déposée est un 403 du proxy (preuves/messagerie-notifs/anon-rest-storage-probe.json), le statut du contrôle CT-33 devrait donc être « DÉFAILLANT (inspection + requête base), énumération HTTP non réalisée ». ③ Impact : nuancer « tout contenu supprimé encore en Storage » — deletePost retire bien les médias du bucket content (js/app-04-comments-shop.js:121 `storage.from("content").remove`), le résidu est celui des 39/58 orphelins mesurés, pas une absence totale de purge. Ajouter l'origine assumée : migration_storage_cloisonnement.sql:190-192 dit explicitement que la lecture n'a pas été refermée. Fusionner avec MSG-03 (un seul finding sécurité, deux domaines rapporteurs). Priorité P1 maintenue : contenu privé de messagerie énumérable par tout visiteur porteur de la clé anon (embarquée dans l'app), non détecté par le pilotage ni la Sentinelle ; correction de RLS/bucket = changement critique à passer par la revue indépendante.
- **impact** → CONFIRMÉ (priorité proposée P0). Défaut réel et non une décision produit : preuves/supabase-isolation/policies.json:126 montre `passio_media_read` SELECT roles {public} qual `bucket_id = ANY(content, attachments)`, sans condition d'owner ni d'appartenance ; fonctions_realtime_storage_staging.md:30-33 confirme buckets public=true, chemins `attachments/conv_<id>/<epoch>_voice.webm`, aucun createSignedUrl réel (js/app-08:2644 = stub), getPublicUrl partout (js/app-09-boot-pwa.js:886,1599). Le seul texte qui « décide » la lecture publique est migrations/migration_storage_buckets.sql:14-32 (2026-06-12, motif : « les URLs publiques sont servies par le CDN ») — motif qui justifie le flag public, pas le LISTING par anon des dossiers de conversations privées. Le projet lui-même le classe comme risque OUVERT et non assumé : .passio/context/KNOWN_RISKS.md:9 (R2, mitigation « URLs signées (P0) »), .passio/audits/SECURITY_AUDIT.md:23 et :35 (S10 « ❌ P0 »), docs/PIEGES_CONNUS.md:28 (« limite résiduelle : médias Storage = URLs publiques »). Priorité : P1 est un rabaissement sans justification par rapport aux deux registres du dépôt qui disent P0, et le critère d'interdiction du GO « isolation des comptes non prouvée » est directement atteint — un tiers sans compte énumère puis écoute les vocaux d'une messagerie privée, en contradiction avec la fuite DM corrigée le 2026-08-09 (KNOWN_RISKS:21). Le faible volume actuel (12 objets attachments, 5 messages à URL publique) ne change pas la nature bloquante pour la commercialisation d'une messagerie. Ce finding est un DOUBLON de SUP-01 (supabase-isolation, P1, même policy, même reproduction, correction plus complète) : à fusionner sous un seul identifiant et à remonter à P0 pour les deux. git status --short : vide. — Correction de formulation : 1) Priorité P0 (pas P1) : registres internes R2/S10 déjà en P0 + critère GO « isolation des comptes » violé. 2) Fusionner avec SUP-01 (doublon exact). 3) Correction : pour `attachments`, le passage en bucket privé + URLs signées (ou proxy) est le correctif PRINCIPAL, pas le repli « à défaut » — restreindre la policy SELECT à `is_conv_member` ne supprime que le listage, l'objet reste servi à quiconque connaît l'URL tant que public=true, et 5 conv_messages portent déjà une URL publique. Pour `content`, la policy SELECT peut simplement être retirée (le bucket public sert les URLs sans policy ; garder `owner = auth.uid()` si l'app a besoin de lister ses propres fichiers). 4) Effort : 0,5 jour ne couvre que la policy ; avec bucket privé, remplacement de getPublicUrl (app-09:886,1599), migration des 5 messages, invalidation SW/CDN et cas authz-critical, compter 1 à 2 jours (aligné SUP-01). 5) Risque de régression à relever à « moyen-élevé » : vocaux déjà envoyés cassés sans migration, repli base64 (SYNC-B64) si l'upload signé échoue.
- **contexte** → CONFIRMÉ (priorité proposée P1). 1. Le défaut est réel sur le SHA audité : preuves/supabase-isolation/policies.json l.126 = `passio_media_read`, SELECT, roles {public}, qual `bucket_id = ANY('content','attachments')` ; identique dans migrations/SCHEMA_PROD_REFERENCE.sql:829-831 ; origine migrations/migration_storage_buckets.sql:30-32 (« Lecture publique des deux buckets »). Aucune migration ultérieure ne la referme : migrations/migration_storage_cloisonnement.sql:191-193 le dit en toutes lettres (« Elle ne referme pas la LECTURE : les seaux restent publics »). 2. Déjà CONNU et ASSUMÉ, jamais traité : .passio/context/KNOWN_RISKS.md R2 « Médias privés en bucket public (pas d'URL signée) — Mitigation : URLs signées (P0) » ; .passio/adr/ADR-004-media-storage-no-base64.md:10 (« URLs signées à mettre en place (P0) ») ; docs/PIEGES_CONNUS.md:28 (« Limites résiduelles : médias Storage = URLs publiques »). Le finding reste donc ouvert, mais sa formulation doit citer R2/ADR-004 au lieu de se présenter comme une découverte. 3. La « contradiction avec la fuite DM du 2026-08-09 » est exacte mais partielle : KNOWN_RISKS.md:21 ne corrige que les TABLES (conv_messages/conv_members/conversations) ; le Storage est traité à part (R2). Ce n'est pas une régression, c'est un chantier jamais fait. 4. Aucun invariant contredit : la correction ne rouvre aucun ADR ; c'est un changement RLS (« à risque » → revue indépendante, AGENTS.md/CLAUDE.md), ce que le finding prévoit déjà. 5. Compatibilité de la correction avec les pièges : le client ne fait jamais `.list()` (grep js/ : aucun) ni `createSignedUrl` (app-08:2644-2645 = stub hors-ligne `_ko`) ; `getPublicUrl` ne passe pas par RLS. MAIS `remove()` (app-08:3597, app-08:4020, app-04:121) et `upsert: true` (app-08:3582) exigent SELECT côté storage-api — migration_storage_cloisonnement.sql:151-154 l'avertit (« ça ne se déduit pas, ça se teste »). Une policy SELECT `owner = auth.uid()` (content) / `is_conv_member` (attachments) les préserve, mais l'option de repli « bucket privé + URLs signées » casse les 68 messages/5 URLs publiques absolues déjà stockées et le stub hors-ligne : risque « moyen » est sous-estimé pour cette variante. 6. git status --short : vide (0 ligne). — Correction de formulation : DOUBLON triple : même défaut rapporté par SUP-01 (supabase-isolation, P1, plus complet : bucket privé + is_conv_member + migration des 5 messages + cas authz-critical) et MSG-03 (messagerie-notifs, P1 : ajoute vocaux sans aléa, non-purge, risque élevé). À fusionner sous SUP-01 en gardant CONT-11 comme angle « contenu publié / objets orphelins ». Reformulations : (a) « attendu » et « impact » doivent dire « risque R2 connu depuis le 2026-08-08, coté P0 dans KNOWN_RISKS.md et ADR-004, jamais traité » — pas une découverte ; (b) retirer « contradiction avec la fuite DM corrigée » → « le correctif du 2026-08-09 n'a couvert que les tables, pas le Storage (R2 distinct) » ; (c) « risque_regression » : moyen pour la seule policy SELECT (owner/is_conv_member), mais ÉLEVÉ pour la variante « bucket privé + URLs signées » (68 messages avec URLs publiques absolues, cache SW 1 an, stub hors-ligne app-08:2644, repli base64 si l'upload échoue — piège SYNC-B64) ; (d) ajouter à la vérification : `remove()` (app-08:3597, 4020 ; app-04:121) et `upsert: true` (app-08:3582) doivent rester fonctionnels pour le propriétaire — tester, ne pas déduire (migration_storage_cloisonnement.sql:151-154) ; (e) préciser que retirer purement la policy SELECT sur `content` ne casse pas la lecture publique (getPublicUrl sans RLS) mais casserait `remove()`/upsert du propriétaire → la garder bornée au propriétaire, pas la supprimer.

### CONT-12 — Changer de profil pendant la rédaction change silencieusement la passion de destination du brouillon

| Champ | Valeur |
|---|---|
| Identifiant | CONT-12 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | RÉFUTÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Studio — sélecteur de passion et switchToProfile |
| Résultat attendu | La passion choisie pour le post en cours est conservée ou l'utilisateur est prévenu |
| Résultat observé | Texte et photo conservés mais `#postPassion` bascule sur la passion du nouveau profil (musique → sport) |
| Reproduction | Studio, saisir texte + photo, switchToProfile(autre) → lire #postPassion (clé switch_profil) |
| Preuve | js/app-06-reels-partage.js:2699-2703 (renderStudio si le Studio est actif) et 3792-3796 (select réécrit avec `selected` sur currentProfileId) |
| Impact utilisateur et commercial | Publication rangée dans la mauvaise passion, invisible dans le fil attendu |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Mémoriser la valeur du select avant renderStudio et la restaurer si l'option existe encore (même remède que loadDraft) |
| Risque de régression | faible |
| Effort estimé | 1 heure |

Relecture (angles indépendants) :

- **reproduction** → RÉFUTÉ (priorité proposée P3). Le comportement mesuré est réel mais il n'est pas un défaut : c'est la conception documentée, et aucun geste utilisateur ne le déclenche « silencieusement ». 1) js/app-06-reels-partage.js:3759-3769 — `onStudioPassionChange()` (onchange de `#postPassion`, index.html:830) appelle `switchToProfile(pr.id)` : le sélecteur du Studio ET `currentProfileId` sont liés dans les DEUX sens par design (§3 ADR-011, commentaire l.3750-3758 « le Studio est le seul point de choix… et il doit s'en souvenir »). Il n'existe donc pas de « passion choisie à la main » distincte du profil actif : tout choix manuel dans le Studio a déjà écrit `currentProfileId`. 2) js/app-06-reels-partage.js:2693-2703 — la resynchronisation est explicitement voulue (« sinon la prochaine publication partirait dans l'ancienne passion ») et gardée par « Studio à l'écran ». 3) Appelants réels de `switchToProfile` (grep js/ index.html) : uniquement app-06:3769 (le sélecteur du Studio lui-même) et ui-v6b-profil.js:159 (`activer` sur l'écran Profil, où le Studio n'est PAS actif → la garde l.2701 ne relance pas `renderStudio`, et le changement y est « visiblement confirmé » par un toast nommant la passion, l.160-165). Aucun bouton du Studio ne change de profil autrement que par `#postPassion`. 4) La preuve `switch_profil` (emulation-contenu.js:150-160, emulation-resultats.json) appelle `switchToProfile(autre.id)` depuis `page.evaluate` — un appel console, pas un parcours utilisateur. Elle prouve le mécanisme, pas un défaut d'usage. 5) La correction proposée (restaurer l'ancienne valeur du select après `renderStudio`) désynchroniserait `#postPassion` (lu par `publishPost`, l.4212) de `currentProfileId`, c'est-à-dire réintroduirait exactement le cas que le commentaire l.2693-2696 cherche à éviter ; `loadDraft` (l.4455-4471) restaure la passion d'un BROUILLON enregistré, cas différent. git status --short : vide. — Correction de formulation : Si le finding est conservé, le reformuler en remarque de conception (P3/P4, non « CONFIRMÉ ») : « observé » = le sélecteur du Studio suit le profil actif par construction (lien bidirectionnel §3 ADR-011), aucun geste UI ne change le profil pendant la rédaction hors du sélecteur lui-même ; « reproduction » = appel console `switchToProfile()`, à signaler comme tel ; « attendu » = à discuter produit (faut-il que le brouillon en cours garde sa passion quand on change de profil depuis l'écran Profil PUIS revient au Studio, où `goTo("studio")` → `renderStudio()` (app-02:2053) réinitialise le select — c'est ce chemin-là, non mesuré par l'auditeur, qui mériterait une vérification) ; supprimer la correction proposée telle quelle (elle désynchroniserait `#postPassion` de `currentProfileId`).

### CONT-13 — L'onglet « Podcast » n'accepte qu'un fichier de 500 Ko ou 2 minutes de micro

| Champ | Valeur |
|---|---|
| Identifiant | CONT-13 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Studio — audio |
| Résultat attendu | Un format nommé « Podcast » accepte des durées de podcast (dizaines de minutes) ou porte un autre nom |
| Résultat observé | Import limité à 500 Ko (« Audio > 500 KB, compresse-la! »), enregistrement coupé à 120 s ; la landing promet « podcast » |
| Reproduction | Studio → Podcast → importer un mp3 de 1 Mo |
| Preuve | js/app-06-reels-partage.js:4062-4066, 4189 (`s >= 120`) ; index.html:130 et 780 |
| Impact utilisateur et commercial | Promesse marketing non tenue ; un seul post audio en prod (extension .mp3 héritée) |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Renommer « Audio » ou relever les bornes (upload Storage direct en Blob, sans data URL) ; 50 Mo de bucket le permettent |
| Risque de régression | faible |
| Effort estimé | 0,5 jour |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). Reproduit par inspection du code au SHA audité c8cb8e99 (`git show c8cb8e99:…`, le diff js/index.html entre ce SHA et HEAD est vide). - js/app-06-reels-partage.js:4062-4066 : handler `#audioInput change` → `if (f.size > 500 * 1024) { toast("Audio > 500 KB, compresse-la!"); return; }` — un mp3 de 1 Mo est refusé avant toute lecture. Le commentaire l.4063 (« base64 serait 667 KB ») date de l'époque data-URL en base ; or l'audio part désormais vers Storage (app-08:3379-3383 `supaUploadMedia(post.id,"audios",…)`, bucket 50 Mo d'après CT-03), donc la borne est un vestige, pas une contrainte technique actuelle. - js/app-06-reels-partage.js:4173-4177 : minuteur d'enregistrement `if (s >= 120) toggleRecording();` — micro coupé à 2 min. - index.html:780 : onglet Studio `data-type="audio"` libellé « Podcast » ; index.html:130 : pilier de la landing « Texte, photo, vidéo, podcast… » ; index.html:759 : onglet profil « Audio / podcast » ; app-06:4944 : aide « 🎙 Podcast audio — Enregistre directement depuis le micro ». - L'affirmation « un seul post audio en prod (.mp3) » n'est pas re-vérifiable sans connecteur ; elle s'appuie sur la requête d'inventaire du contrôle CT-01 du même domaine (32 posts dont 1 mp3), cohérente avec app-08:3739 qui reconnaît encore `.mp3` en lecture. Non déterminante pour le verdict. - git status --short : vide. — Correction de formulation : Preuve : la coupure à 120 s est à js/app-06-reels-partage.js:4177 (bloc 4173-4177), non 4189 (4189 est dans le catch « Micro refusé »). Ajouter aux preuves app-06:4944 (aide « Podcast audio ») et index.html:759 (onglet profil « Audio / podcast »). Préciser que la landing l.130 n'est plus servie par défaut (first-run actif) — l'impact « promesse marketing » repose surtout sur le libellé de l'onglet Studio et de l'aide. Le reste (attendu/observé/impact/effort) est exact.

### CONT-14 — La suppression et l'édition d'un commentaire ignorent le verdict serveur

| Champ | Valeur |
|---|---|
| Identifiant | CONT-14 |
| Priorité retenue | **P2** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Commentaires — supprimer / modifier |
| Résultat attendu | Lire `{error}` et compter les lignes ; annuler localement en cas de refus |
| Résultat observé | `_supaDeleteCommentRow` et `_supaUpdateCommentRow` sont des fire-and-forget avec catch muet |
| Reproduction | Inspection : app-04:1447-1458 |
| Preuve | js/app-04-comments-shop.js:1447-1458 (`await supa.from(table).delete().eq("id", commentId)` sans lecture du résultat) |
| Impact utilisateur et commercial | Commentaire qui « revient » au rechargement chez l'auteur, contenu qu'on croit retiré toujours visible par les autres (modération de soi-même impossible à vérifier) |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Appliquer `_writeVerdict` + relecture comme `_delObRun`, mise en file si échec |
| Risque de régression | faible |
| Effort estimé | 2 heures |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Relecture sur le SHA audité (`git show c8cb8e99:js/app-04-comments-shop.js`, lignes 1447-1458 ; `git diff --stat c8cb8e99 HEAD -- js` vide) : `_supaDeleteCommentRow` fait `await supa.from(table).delete().eq("id", commentId);` sans affecter le résultat, dans un `try { … } catch(e) {}` muet ; idem `_supaUpdateCommentRow` (l.1501-1507 : `await supa.from(table).update({ content: text }).eq("id", commentId);` puis `catch (e) {}`). Les deux appelants (`deleteCommentEntry` l.1431-1446, `editCommentEntry` save.onclick l.1489-1498) écrivent l'état local, `thread.save()`, puis lancent l'appel SANS `await` et affichent « Commentaire supprimé » / « Commentaire modifié » avant tout verdict. Aucune pierre tombale de commentaire n'existe (`grep deletedComment|commentTombstone` → 0 résultat), et `supaLoadComments` (app-08:3946-3964) rehydrate depuis la base : un DELETE refusé (0 ligne) fait donc revenir le commentaire au rechargement, comme décrit. `_writeVerdict` (app-02:376) est utilisé sur 20+ écritures (likes, réactions, événements, story) mais pas ici. Le hook fetch de télémétrie (js/telemetry.js:826-850) ne lit que `res.status` : un refus RLS sur DELETE/UPDATE est un 200/204 à 0 ligne, donc « visibilité pilotage : non » et « Sentinelle : non » sont exacts. — Correction de formulation : Le finding est juste ; deux précisions. (1) Preuve : ajouter `js/app-04-comments-shop.js:1501-1507` (`_supaUpdateCommentRow`) aux côtés de 1447-1458, et les appelants 1431-1446 / 1489-1498 qui toastent avant le verdict. (2) Observé/impact à durcir : pour les commentaires d'ÉVÉNEMENT, l'édition n'est pas seulement « non vérifiée », elle est impossible côté serveur (aucune policy UPDATE sur `event_comments`, policies.json l.130) — l'écran ment à chaque fois. Correction à compléter : outre `_writeVerdict` + `expectRows`/relecture et annulation locale, ajouter une policy UPDATE propre sur `event_comments` (migration) ou masquer « Modifier » pour les `ec_…`. Priorité proposée P2 plutôt que P3 en raison de ce chemin déterministement mort (effort inchangé, ~2 h + une migration).

### Surfaces saines

- Échappement des commentaires, réponses, réactions emoji/GIF et identifiants (escapeHtml / escapeJsArg / safeUrlAttr au bon contexte) — PROUVÉ par 4 suites vertes + payload hostile en émulation (xss:0)
- Like d'un post : idempotent (PK post_likes), intention envoyée et non re-déduite, annulation sur refus, anti double clic 800 ms, pas d'écriture pour le contenu de démo — PROUVÉ (interactions.spec.js + émulation)
- Suppression durable d'une publication : pierre tombale, purge des 4 tableaux, file serveur vérifiée par relecture, survie au rechargement — PROUVÉ (suppression-durable 8/8 + émulation)
- Double clic « Publier » : un seul post, un seul envoi (`_publishInProgress`, 23505 = succès) — PROUVÉ
- Refus AVANT mutation locale quand aucune passion canonique n'est disponible (les 4 producteurs) — PROUVÉ (publication-optimiste-refusee 4/4)
- Photo : compression canvas côté client (≤1600 px puis ≤2048 px à l'upload, WebP/JPEG), image 0 octet ou non décodable refusée — PROUVÉ
- Storage : aucun base64 en base (posts_media_not_storage = 0), chemins cloisonnés par `storage_chemin_autorise`, extension fidèle au conteneur réel, orphelin retiré si URL publique introuvable — CONFORME
- Liens profonds #reel= (garde d'appartenance buildReels, hash nettoyé au seul succès, viewer fermé avant sortie) — PROUVÉ (ui-v5-bobines 15/15 cumulés, fuite-blob-bobines vert)
- Partage de bobine / d'expérience d'événement : texte non échappé deux fois, passion jamais vide, `createdAt` présent — PROUVÉ (partage-bobine, partage-experience-passion verts)
- Web Share API avec repli presse-papiers et AbortError ignoré (partagerOuCopier) — CONFORME PAR INSPECTION
- Commentaires : file d'attente avec statut « Envoi… / Non envoyé · Réessayer », id aligné local⇄serveur, longueur ≤ 400 côté client — CONFORME PAR INSPECTION
- Blocage : posts et commentaires des comptes bloqués masqués, abonnement révoqué dans les deux sens — CONFORME PAR INSPECTION
- Service worker : aucun cache de média, navigation network-first — CONFORME PAR INSPECTION

### Non vérifié (BLOQUÉ) et ce qu'il faudrait

- BLOQUÉ — comportement réel iOS/Android (lecture mp4/m4a, MediaRecorder, Web Share natif) : Chromium seul ; il faudrait un iPhone et un Android physiques
- BLOQUÉ — upload réel d'un fichier 0 octet ou à MIME menteur jusqu'à Storage/insert (aucune écriture en prod autorisée) : mesuré jusqu'à l'appel de supaPublishPostWithRetry seulement ; il faudrait un projet Supabase de préproduction
- BLOQUÉ — suites du projet prod (authz-critical, multi-comptes, confidentialite…) : comptes réels et SUPABASE_SERVICE_ROLE_KEY requis ; le job « Suites production (comptes réels) » du run CI 33861671142 est vert sur le SHA audité
- BLOQUÉ — cohérence des compteurs abonnés/abonnements contre la base avec un compte réel (lecture seule sans session utilisateur)
- BLOQUÉ — vérification que https://passio-app.netlify.app sert bien le SHA audité (proxy réseau : 403 sur netlify.app)
- NON RÉALISÉ — listage anon effectif de storage.objects (CONT-11) : déduit de la policy, non exercé avec un client anon (aucune requête vers la prod hors connecteur lecture seule)
- NON RÉALISÉ — commentaire en aveugle sur un post privé par un non-abonné (CT-16) : déduit de la policy INSERT, non reproduit

### Affirmations des anciens rapports confrontées au code actuel

- docs/CHECKLIST_COMMERCIALISATION.md l.10 « Créer (Studio) — texte (testé), photo/vidéo/audio/carnet (UI présente) » → partiellement fausse : le carnet est RETIRÉ (ADR-011, studioType vlog ramené à text app-06:3782) ; photo/vidéo/audio présents mais vidéo/audio sans validation (CONT-01)
- docs/CHECKLIST_COMMERCIALISATION.md l.28 « Post photo / vidéo / carnet — testés (type + média + rendu fil) » → fausse pour le carnet (fonctionnalité absente) ; vraie pour photo (ui-v6-composer.spec.js) ; la vidéo n'est testée qu'avec un fichier fixture, jamais un fichier invalide
- docs/CHECKLIST_COMMERCIALISATION.md l.31 « Partage post (feuille de partage) » → toujours vraie, mais le partage externe ne porte aucun lien vers le post (CONT-05)
- docs/CHECKLIST_COMMERCIALISATION.md l.37 « Follow/unfollow — présents, non auto-testés » → dépassée : tests/e2e/parcours-suivre.spec.js existe et est vert ; mais le refus serveur n'est pas annulé (CONT-07)
- PASSIO_FUNCTIONAL_MAP.md l.26 « app-03-posts-vlogs : 89 fonctions — publication, posts, vlogs, médias » → fausse : le fichier fait 399 lignes, les vlogs sont retirés, il ne reste closePost/sharePost/sharePostInFeed/like/_kmBetween ; la publication vit dans app-06 et app-08
- PASSIO_FUNCTIONAL_MAP.md l.72 « passion_id présent sur posts, stories… et sur aucune table d'interaction » → toujours vraie (colonnes posts/stories vérifiées, comment_interactions sans passion_id)
- PASSIO_PRODUCTION_READINESS.md l.17 « Storage — écriture cloisonnée (PROUVÉ) » → toujours vraie pour l'ÉCRITURE (policy INSERT storage_chemin_autorise) ; mais la LECTURE/listage est ouverte à tous les rôles (CONT-11), point que le rapport ne couvrait pas
- PASSIO_PRODUCTION_READINESS.md l.19 « suppression de compte supprime les médias » → non vérifiable ici (BLOQUÉ) ; le résidu de médias annoncé (19) est cohérent avec les 39 orphelins mesurés aujourd'hui (CONT-10) — la situation s'est dégradée
- KNOWN_RISKS.md 2026-08-09 « Reste follows/event_attendees en lecture publique = choix assumé » → toujours vraie (policies « Lecture publique » et « Read follows » USING true, doublon signalé par l'advisor multiple_permissive_policies)
- KNOWN_RISKS.md 2026-08-09 « rate_limit_insert … EXECUTE révoqué » → vraie pour la fonction, mais le trigger n'est posé QUE sur comment_interactions/event_reactions/reports : posts, post_comments, post_likes n'ont aucun frein (CONT-08)
- CLAUDE.md « Un échec réel = annuler l'affichage optimiste » → respecté pour le like (app-03:355-365), NON respecté pour follow (CONT-07), story (CONT-06), suppression/édition de commentaire (CONT-14) et publication du Studio (CONT-02/03)

### Fichiers de preuve

- `preuves/contenu/suites-contenu.log`
- `preuves/contenu/suite-ui-v5-bobines-rerun.log`
- `preuves/contenu/suite-ui-v5-bobines-rerun2.log`
- `preuves/contenu/emulation-contenu.js`
- `preuves/contenu/emulation-resultats.json`
- `preuves/contenu/01-studio-photo.png`
- `preuves/contenu/02-feed-post-photo.png`
- `preuves/contenu/03-commentaire-hostile.png`
- `preuves/contenu/04-partage-post.png`
- `preuves/contenu/05-apres-suppression.png`

### Notes de l'auditeur

MATRICE FORMATS × OPÉRATIONS (statut par cellule) :
- Texte : publication PROUVÉ · validation ≥3 caractères, maxlength 1200 client / illimité serveur (DÉFAILLANT CONT-08) · stockage posts.content · rendu PROUVÉ · suppression PROUVÉ · édition ABSENTE · reprise hors ligne DÉFAILLANT (CONT-02) · badge Sync DÉFAILLANT (CONT-03).
- Photo : publication PROUVÉ · validation PROUVÉ (MIME image/*, décodage canvas, 0 octet refusé, compression 1600 px puis 2048 px) · stockage content/photos/<uid>/<id>.webp|jpg|png · rendu PROUVÉ (capture 02) · suppression PROUVÉ (chemin Storage retiré après la ligne) · édition ABSENTE.
- Vidéo (Studio) : publication CONFORME · validation DÉFAILLANT (taille seule, MIME et 0 octet acceptés, CONT-01) · stockage content/videos/<uid>/<id>.mp4|webm · rendu CONFORME PAR INSPECTION · suppression CONFORME · édition ABSENTE · pas de transcodage dans ce chemin (le 720p n'existe que dans l'éditeur média des bobines).
- Bobine : publication CONFORME (éditeur média, refus avant meClose, retry 8×45 s) · validation CONFORME (vidéo obligatoire, compression >8 Mo, plafond 25/150 Mo) · rendu PROUVÉ (ui-v5) · lien profond PROUVÉ · partage PROUVÉ · 1 bobine sans média en prod (défaut historique réel).
- Story : publication DÉFAILLANT (échec serveur ignoré, CONT-06) · 24 h à la lecture seulement · suppression ABSENTE · rangée dans state.seed.stories (tableau de démonstration).
- Audio « Podcast » : publication CONFORME · validation DÉFAILLANT (MIME, CONT-01) · bornes 500 Ko / 120 s (CONT-13) · extension fidèle (.webm/.m4a/.ogg) · 1 post .mp3 hérité en prod.
- Partage d'événement dans le fil : PROUVÉ (partage-experience-passion) ; album d'événement via posts.event_id (0 ligne en prod).
- Carnet/vlog : RETIRÉ ; 1 ligne résiduelle lue mais jamais rendue (garantie de confidentialité conservée, app-08:3690-3700).
- Live vidéo : n'est PAS un format de publication (appel WebRTC P2P, app-05) — annoncé nulle part comme publication.

CAPACITÉ / COÛTS : bucket content 153 Mo dont ≈ 2/3 orphelins (CONT-10) ; cacheControl 1 an sur les médias (bon pour l'egress). Les data URL vidéo (≤30 Mo → 40 Mo base64) transitent par localStorage via saveState avant l'upload : quota 5 Mo probable dépassé sur les gros fichiers (non mesuré, le remplacement par l'URL Storage arrive seulement après l'upload).

RECOMMANDATIONS : conserver le moteur like/suppression/échappement (référence de qualité du dépôt) ; refactoriser la publication du Studio sur le patron des files existantes (CONT-02/03) ; soumettre à Benjamin : (1) le sens de « Podcast » (CONT-13), (2) l'absence volontaire ou non d'édition de post et de suppression de story, (3) l'absence d'invitation d'amis (CT-24) alors qu'AGENTS.md fait du partage une valeur cœur, (4) la modération par l'auteur de son propre fil de commentaires (RLS ne l'autorise pas, CT-15). CONT-11 (listage Storage) relève du domaine sécurité : changement RLS critique, revue indépendante obligatoire.

ENVIRONNEMENT : Playwright 1.60 attend Chromium rev 1223, /opt/pw-browsers ne contient que 1194 → contournement par PLAYWRIGHT_BROWSERS_PATH pointant sur un répertoire de liens symboliques du scratchpad (aucune écriture dans le dépôt ni dans /opt). Le serveur http-server 8102 est tombé une fois en cours de run (9 cas ERR_CONNECTION_REFUSED), et le navigateur headless s'est fermé sur 3 cas au rerun : instabilité d'infrastructure, jamais d'assertion applicative rouge. Le serveur 8103 lancé pour l'émulation a été arrêté. `git status --short` vide à la fin ; HEAD de la branche = f501fb78 (deux commits d'audit de l'orchestrateur, aucun fichier de code touché depuis c8cb8e99).

## Domaine « messagerie-notifs »

SHA audité c8cb8e99 (HEAD de la branche d'audit a avancé de 2 commits .passio/ de l'orchestrateur, aucun fichier audité modifié — vérifié par git diff). Méthode : inspection du code (app-04, app-05, app-08, app-09, idb-store, ui-v6a, sw.js, notify-call, delete-account, migrations), 20 requêtes en lecture seule sur la base de production (pg_policies, pg_trigger, grants, contenus agrégés de conv_messages/notifications/storage.objects), 11 suites Playwright exécutées en local (48/48 vertes, 12,7 min, Chromium 141 via un répertoire de navigateurs symlinké dans le scratchpad car Playwright 1.60 attend le build 1223 et seul 1194 est installé), puis une émulation manuelle Chromium à Supabase stubbé (13 scénarios : texte, pièce jointe, hors-ligne/renvoi, refus RLS, 100 Ko, rafale de 50, double envoi, vide, GIF, média hostile, suppression pour moi, mention @, invitation d'appel forgée). Vérification HTTP directe de la prod (REST anon, listing Storage, HEAD d'un objet) BLOQUÉE par le proxy (403 « Host not in allowlist »).
Verdict par surface : le cœur texte (envoi, statut, outbox, hors-ligne, transfert, média avec verdict d'écriture, échappement des médias reçus, notifications distantes échappées, RLS de lecture des messages/membres/conversations, cloisonnement d'écriture Storage, badge non-lus, IndexedDB) est PROUVÉ sain. Quatre défauts P1 CONFIRMÉS : (1) XSS DOM par invitation d'appel forgée sur le canal realtime public ring:<uid> (emoji non échappé, exécuté en émulation) ; (2) XSS stockée par pseudo contenant un guillemet dans l'autocomplétion @ des groupes (exécutée en émulation) ; (3) pièces jointes de conversation publiques ET listables sans authentification (bucket public, policy SELECT sans condition, grant anon), nom de vocal prévisible, jamais purgées à la suppression de compte/message ; (4) notifications et push forgeables vers n'importe qui, sans relation ni cadence (notify-call prend le texte du client ; aucun rate-limit sur notifications ni conv_messages). Plusieurs P2 : conv_reads lisible par les anonymes, suppressions locales qui ressuscitent au rechargement serveur, mute placebo, GIF/localisation/réaction sans verdict d'écriture, aucun push pour les messages privés, compte bloqué qui écrit encore. Le domaine n'est pas commercialisable en l'état pour un lancement public sans corriger les P1 (échappement 1 h ; canaux privés, bucket privé/URLs signées, rate-limits et notify-call durci : 2 à 4 jours).

### Contrôles (39)

| Id | Contrôle | Statut | Méthode | Preuve |
|---|---|---|---|---|
| C01 | Conversation 1-1 : création serveur (conversations + conv_members) et RLS d'insertion | **CONFORME PAR INSPECTION** | inspection code | app-08:4500-4524 supaCreateConversation ; pg_policies : conversations_insert_creator (created_by = auth.uid()), conv_members « Ecriture propre » (is_conversation_creator OR self+can_join_event_conversation) AND NOT is_blocked_with ; suite prod multi-comptes verte dans le run CI 33861671142 (conclusion success, head_sha c8cb8e99) |
| C02 | Groupe : création, ajout/retrait de membres, quitter, description, photo | **DÉFAILLANT** | inspection code | app-08:4526-4550 supaCreateGroup ; app-05:1559-1612 add/remove/leave (erreurs avalées .then(fn,fn)) ; app-05:1624 update description → AUCUNE policy UPDATE sur conversations (pg_policies : INSERT+SELECT seulement) = 0 ligne en silence ; app-05:1473 photo de groupe = data URL locale, aucune colonne serveur (voir MSG-13, MSG-14) |
| C03 | Envoi texte : verdict d'écriture, statut, outbox | **PROUVÉ** | test exécuté | émulation S1 {status:'sent', outbox:0, inserts:1} ; app-04:4529-4643 sendMessageFp/_sendTextToSupa ; transfert-message.spec.js 2/2 verts |
| C04 | Envoi vocal : upload Storage puis message, type MIME réel, repli sans base64 | **CONFORME PAR INSPECTION** | inspection code | app-09:1562-1611 _sendVoiceMessage (contentType = type réel de la data-URL) → sendMessageToSupabase ; base : 2 messages audio, 2 URLs http, 0 data: ; nom d'objet `<Date.now()>_voice.<ext>` SANS aléa (app-09:1597) |
| C05 | Envoi GIF : verdict d'écriture | **DÉFAILLANT** | test exécuté | émulation S6 {status:'(aucun)', outbox:0, inserts:2, second_insert_sans_from_id:true} ; app-09:665-700 (_diag seulement, repli sans from_id refusé par conv_messages_insert_member) |
| C06 | Envoi photo/vidéo/fichier : upload attachments, URL http en base, jamais de base64 | **PROUVÉ** | test exécuté | émulation S2 (upload OK → db_url https, db_has_base64:false), S2b (upload KO → url:'', expired:true, 207 octets) ; message-media-echec.spec.js 3/3 verts ; base : 68/68 lignes conv_messages sans 'data:' ; etat-sync-base64.spec.js vert |
| C07 | Envoi localisation : verdict d'écriture | **DÉFAILLANT** | inspection code | app-09:1027-1050 shareLocation : `.catch(function(err){ // Continuer même en cas d'erreur })`, aucun statut, aucune outbox, repli sans from_id |
| C08 | Accusés de lecture (conv_reads) : écriture propre, lecture | **DÉFAILLANT** | requête base | pg_policies reads_select USING true (roles public) ; has_table_privilege('anon','public.conv_reads','SELECT') = true ; 34 lignes / 23 user_id distincts lisibles sans compte (MSG-05) ; écriture correcte (user_id = auth.uid()) |
| C09 | Suppression de message pour moi / pour tous (tombstones ADR-008) | **DÉFAILLANT** | test exécuté | conv-suppression.spec.js 3/3 verts (fusion locale) MAIS émulation S8 {present_apres_suppression:false, tombstone_pose:true, present_apres_reouverture:true} : openConversation (app-04:3757-3760) réinjecte le message du serveur sans consulter convTombHas (utilisé seulement app-04:2253,2294) ; pour tous : app-04:4227-4231 delete + tombstone, erreurs avalées, objet Storage jamais retiré |
| C10 | Suppression / effacement / export de conversation | **DÉFAILLANT** | inspection code | app-09:1261-1268 _deleteConv : local seulement, pas de convTombAdd, pas de sortie de conv_members ; boot app-08:5940-5945 `[...supaConvs, ...localOnly]` remet toute conversation serveur → elle revient au prochain démarrage ; _clearConvMessages app-09:1233 idem ; export app-09:1245 texte seul (médias = '[Media]') |
| C11 | Mute d'une conversation | **DÉFAILLANT** | inspection code | app-09:1222-1230 écrit c._muted ; grep `_muted` : 4 occurrences, toutes dans le libellé/toggle ; _handleIncomingConvMessage (app-08 ~4948-4960) appelle _playMsgSound() et pushNotification() sans condition |
| C12 | Recherche de conversations | **PROUVÉ** | test exécuté | ui-v6a-messages.spec.js « la recherche déplacée alimente toujours le même moteur » vert ; app-04:3542 _globalMsgSearch |
| C13 | Badge non-lus (barre du bas, aria-label, titre d'onglet, badge d'icône PWA) | **PROUVÉ** | test exécuté | badge-messages.spec.js 2/2 verts ; émulation S10 {badge:'3', aria:'Messages, 3 non lus'} ; app-08:1724-1760 renderMsgBadge, 1679-1690 updateAppBadge |
| C14 | Pagination des messages et des conversations | **PROBABLE** | inspection code | conversations : 30 par page côté client (app-04:3475) ; fil : 40 par page côté client (app-04:3795) MAIS supaLoadMessages (app-08:4564-4569) charge TOUS les messages d'une conversation sans limit à chaque ouverture ; aperçus : limit 150-500 (app-08:4687-4691) |
| C15 | Realtime INSERT conv_messages : trigger broadcast, policy realtime.messages, canal privé user:<uid> | **CONFORME PAR INSPECTION** | requête base | pg_trigger broadcast_conv_message_users_trigger AFTER INSERT (SECURITY DEFINER, EXECUTE retiré à anon/authenticated) ; realtime.messages : 2 policies identiques 'Utilisateur recoit/reçoit ses messages' (topic = 'user:'\|\|auth.uid()) ; client app-08:4990-4999 channel(user:<uid>, private:true) ; publication supabase_realtime contient conv_messages, conv_members, conv_reads, conversations, notifications ; l'activation « Realtime Authorization » côté dashboard n'est pas vérifiable ici (BLOQUÉ) — livraison cross-compte couverte par multi-comptes.spec.js (job prod vert, run 33861671142) |
| C16 | Appels / live vidéo : signalisation, notify-call, TURN | **DÉFAILLANT** | test exécuté | app-05:494-497 _callChannel = canal broadcast PUBLIC (pas de private:true) pour ring:<uid> et call:<id> ; _callOnInvite (app-05:818-836) n'a que isBlocked(payload.from) pour garde, `from` étant fourni par l'émetteur ; _callRenderIncomingUI app-05:1052 insère inv.emoji SANS échappement → émulation S11 {overlay_affiche:true, pwn:7, img_onerror_present:1} ; TURN = relais public openrelay (app-05:483-485), PASSIO_CALL_TURN null ; notify-call authentifie l'appelant et lit push_subscriptions en service_role (index.ts:27-59) |
| C17 | Outbox : mise en file hors-ligne, renvoi à la reconnexion, bornes | **DÉFAILLANT** | test exécuté | émulation S3 : hors-ligne → {status:'failed', outbox:[1], bouton réessayer:true} puis retour → {status:'sent', outbox:0} (capture emul-03) ; S3b : refus permanent → 3 _flushOutbox = 3 inserts, entrée sans compteur d'essais (app-04:4644-4651, aucune borne ; contraste _cmtObFlush stop à 8) |
| C18 | Stockage local : localStorage + IndexedDB, hydratation sans perte, quota | **PROUVÉ** | test exécuté | conv-suppression.spec.js (IDB) verts ; émulation S10 idb_convs:2, ls_bytes:108 195 après une seule image 1 px (base64 locale conservée : S2 local_img_is_dataurl:true) ; app-04:2334-2356 write-through ; idb-store.js undefined ≠ null ; localStorage échoue en silence sur quota (catch vide app-04:2341) |
| C19 | Base64 en DB interdit : colonnes écrites dans conv_messages | **PROUVÉ** | requête base | grep insert conv_messages : colonnes id, conv_id, from_id, content, created_at uniquement ; base : 68 lignes, max_len 609, 0 'data:' ; types : text 50, gif 7, location 3, media 3, react 3, audio 2 (toutes URLs http) ; app-09:917-928 retire toute data-URL avant insert |
| C20 | Storage : écriture cloisonnée (INSERT/UPDATE) des pièces jointes | **CONFORME PAR INSPECTION** | requête base | pg_policies storage.objects : passio_media_insert_cloisonne WITH CHECK storage_chemin_autorise(bucket_id,name) ; passio_media_update_cloisonne USING owner=auth.uid() WITH CHECK idem ; fonction : attachments → is_conv_member((foldername)[2], auth.uid()) ; 12 objets attachments tous avec owner ; assertions 11 d'authz-critical.spec.js (job prod vert) |
| C21 | Storage : lecture publique / devinabilité / listing des pièces jointes | **DÉFAILLANT** | requête base | storage.buckets attachments public=true, allowed_mime_types null, 50 Mo ; policy passio_media_read SELECT to public USING bucket_id in ('content','attachments') sans condition d'appartenance ; has_table_privilege('anon','storage.objects','SELECT')=true → listing anonyme possible ; chemin `attachments/<conv_id>/<ts>_<9 car. base36>_<nom>` (app-09:865-866) et `<ts>_voice.<ext>` (1597) ; cacheControl 1 an ; sondage HTTP réel BLOQUÉ (preuves/anon-rest-storage-probe.json : 403 proxy) |
| C22 | Notifications : RLS SELECT/UPDATE/DELETE = user_id, INSERT = from_id (notifications_insert_own_author) | **PROUVÉ** | requête base | pg_policies : Lecture propre (user_id = auth.uid()), Update/Suppression propre, notifications_insert_own_author WITH CHECK from_id = auth.uid() (migration_notifications_auteur.sql appliquée) ; base : 188 notifications, 0 avec from_id = user_id, 3 lignes anciennes contenant des balises (event_invite/event_feedback) |
| C23 | Notifications : rendu sûr par défaut (n.html === true / kind local), échappement, idempotence | **PROUVÉ** | test exécuté | notifications-echappement.spec.js 5/5, xss-notifs-messages.spec.js 6/6 verts ; app-08:1802-1806 _notifTexteHtml, 1849-1858 _neutraliserBalisesNotif, 1860-1868 mergeSupaNotifs (point d'entrée unique REST + realtime app-08:5205-5222) |
| C24 | Notifications : forgeabilité (contenu, kind, ref_id, destinataire) et cadence | **DÉFAILLANT** | requête base | policy INSERT ne contraint que from_id ; pg_trigger : trg_rate_limit uniquement sur comment_interactions (60/min), event_reactions (30/min), reports (10/min) — AUCUN sur notifications ni conv_messages ; supaInsertNotif (app-08:4776-4798) appelle notify-call type 'notif' avec text composé côté client ; openNotifTarget (app-08:1976-1990) suit ref_id |
| C25 | Push Web : push_subscriptions (RLS own), sw.js, VAPID côté serveur, notify-call | **CONFORME PAR INSPECTION** | inspection code | pg_policies push_* (user_id = auth.uid()) ; base 5 abonnements / 3 comptes ; clé privée VAPID seulement en secret Edge (index.ts:44-47), publique en clair app-05:1114 (normal) ; sw.js:50-83 push handler affiche data.text en texte ; abonnement uniquement si permission déjà accordée (app-05:1126-1145) |
| C26 | Push : messages privés reçus app fermée | **DÉFAILLANT** | inspection code | grep supaInsertNotif(…"message") et notify-call : aucun producteur pour un message ; la seule notification d'un DM est locale (pushNotification dans _handleIncomingConvMessage) ; notify-call n'est invoqué que par _callPushNotify et supaInsertNotif |
| C27 | Attaque : message vide / espaces | **PROUVÉ** | test exécuté | émulation S5b {inserts:0} (app-04:4537 trim) |
| C28 | Attaque : message de 100 Ko et rafale de 50 envois | **DÉFAILLANT** | test exécuté | émulation S4 {maxlength_attr:null, insert_100ko_len:102493, inserts_rafale:50, ms_rafale:4} ; colonne content text sans CHECK ; aucun trigger rate_limit sur conv_messages (pg_trigger) |
| C29 | Attaque : double clic sur envoyer | **PROUVÉ** | test exécuté | émulation S5 {inserts:1} (le champ est vidé avant le second appel, app-04:4540) |
| C30 | Attaque : membre retiré qui envoie encore | **CONFORME PAR INSPECTION** | requête base | conv_messages_insert_member exige is_conv_member(conv_id, auth.uid()) → refus serveur ; trigger broadcast ne diffuse qu'aux membres courants ; côté client le message reste 'failed' et est renvoyé sans fin (C17) |
| C31 | Attaque : compte bloqué qui écrit | **DÉFAILLANT** | requête base | conv_messages_insert_member : (from_id = auth.uid()) AND is_conv_member(...) — pas de is_blocked_with (présent seulement sur conv_members INSERT) ; client : realtime filtré app-08:4849, mais openConversation remet les messages serveur sans filtre (app-04:3757-3760) ; renderMessages masque la conv 1-1 (app-04:3410), pas les messages d'un bloqué dans un groupe |
| C32 | Attaque : XSS dans un message média / réaction / position reçu | **PROUVÉ** | test exécuté | émulation S7 {pwn:0, img_src:'#', inline_handlers:0, sender_html_neutralise:true} ; xss-notifs-messages.spec.js (réaction, position javascript:) verts ; app-04:3894-3968 safeUrlAttr/escapeHtml, 4507-4511 _reactionKeySure |
| C33 | Attaque : XSS par pseudo dans l'autocomplétion @ des groupes | **DÉFAILLANT** | test exécuté | émulation S9 {attribut_onmouseover_injecte:true, pwn:9} ; app-04 _mentionDetect : onclick="_pickMention('" + String(m.name).replace(/'/g,"\\'") + "')" sans escapeHtml ; aucune validation de caractères du pseudo (app-06:1306-1326, seule l'unicité est vérifiée) |
| C34 | Attaque : pièce jointe avec type menteur | **PROBABLE** | inspection code | aucun allowed_mime_types sur les seaux (choix documenté migration_storage_cloisonnement.sql) ; type = file.type du navigateur (app-09:874) ; rendu par balise img/video/a selon fileType déclaré dans le JSON, URL passée par safeUrlAttr (http(s)/data:image\|audio\|video/blob) ; un HTML servi par Storage est rendu text/plain d'après la migration (non re-mesuré ici, HTTP bloqué) |
| C35 | Suites Playwright ciblées (11 fichiers) | **PROUVÉ** | test exécuté | PASSIO_PORT=8103 npx playwright test --project=local conv-ouverture-fil conv-suppression conv-clavier-ouverture transfert-message message-media-echec badge-messages xss-notifs-messages notifications-echappement etat-sync-base64 ui-v6a-messages ui-v6a-boucle --workers=1 → 48 passed (12.7m), EXIT=0 (preuves/playwright-suites.log) |
| C36 | multi-comptes.spec.js et confidentialite.spec.js (comptes réels) | **BLOQUÉ** | non réalisé | exigent SUPABASE_SERVICE_ROLE_KEY et des comptes réels ; job « Suites production (comptes réels) » vert dans le run CI 33861671142 (get_workflow_run : conclusion success, head_sha c8cb8e99, terminé 10:44 UTC) |
| C37 | Émulation manuelle : ouverture, texte, pièce jointe, réseau coupé, renvoi, captures | **PROUVÉ** | émulation | preuves/emulation-resultats.json et -2.json, captures emul-01 à emul-07 (28-143 Ko) ; Chromium headless 141 sur http-server local, Supabase stubbé en mémoire (aucune requête vers la prod) |
| C38 | Vérification directe de la production (REST anon, listing Storage, HEAD objet public) | **BLOQUÉ** | non réalisé | preuves/anon-rest-storage-probe.json : 7 requêtes, toutes 403 « Host not in allowlist » (proxy de l'environnement) ; il faudrait un poste hors proxy et la clé anon publique du bundle |
| C39 | Visibilité Centre de pilotage / Sentinelle sur la messagerie | **PROBABLE** | inspection code | dashboard/server/traces.js:50-56 contrat send_message (handler→request→saved→delivered) mais tel.action/flowStart('send_message') n'existent que dans le chemin MÉDIA (app-09:902,907), pas dans le texte ; store.js:386 compte les messages via API conv_messages 201 ; sentinel.js/alerts.js : aucune règle messagerie/notification, seulement erreurs critiques, pics et API 5xx |

### Problèmes (16)

| Id | Priorité retenue | Relecture | Titre |
|---|---|---|---|
| MSG-01 | **P0** | CONFIRMÉ par la relecture | XSS DOM par invitation d'appel forgée sur un canal realtime public (emoji non échappé) |
| MSG-02 | **P1** | CONFIRMÉ par la relecture | XSS stockée via un pseudo contenant un guillemet dans l'autocomplétion @mention des groupes |
| MSG-03 | **P0** | CONFIRMÉ par la relecture | Pièces jointes de conversation lisibles ET listables sans authentification, jamais purgées |
| MSG-04 | **P1** | CONFIRMÉ par la relecture | Notifications in-app et push forgeables vers n'importe qui, sans relation ni cadence |
| MSG-05 | **P1** | CONFIRMÉ par la relecture | conv_reads lisible par tout le monde, anonymes compris (identifiants de conversation et horodatages de lecture) |
| MSG-06 | **P1** | CONFIRMÉ par la relecture | Suppressions locales (message pour moi, effacer le fil, supprimer la conversation) qui ressuscitent au rechargement serveur |
| MSG-07 | **P2** | CONFIRMÉ par la relecture | « Couper les notifications » d'une conversation ne coupe rien (mute placebo) |
| MSG-08 | **P2** | CONFIRMÉ par la relecture | GIF, localisation, réaction et tombstone « pour tous » : verdict d'écriture ignoré |
| MSG-09 | **P2** | CONFIRMÉ par la relecture | Aucune notification push pour un message privé reçu app fermée |
| MSG-10 | **P1** | CONFIRMÉ par la relecture | Un compte bloqué déjà membre peut encore écrire, et ses messages reviennent au rechargement |
| MSG-11 | **P3** | CONFIRMÉ par la relecture | File de renvoi sans borne : un message refusé définitivement est renvoyé à chaque démarrage, pour toujours |
| MSG-12 | **P3** | CONFIRMÉ par la relecture | Aucune borne de taille ni de cadence sur conv_messages (100 Ko accepté, 50 envois en 4 ms) |
| MSG-13 | **P3** | CONFIRMÉ par la relecture | 113 conversations orphelines en base et aucune policy UPDATE/DELETE sur conversations (nettoyage et description de groupe échouent en silence) |
| MSG-14 | **P3** | CONFIRMÉ par la relecture | Photo de groupe locale seulement, et base64 des médias envoyés conservé dans l'état local |
| MSG-15 | **P3** | CONFIRMÉ par la relecture | Surfaces realtime/RPC mineures : indicateur de frappe usurpable, is_conv_member exécutable par anon, policy realtime en double |
| MSG-16 | **P3** | CONFIRMÉ par la relecture | Chargement intégral des messages d'une conversation à chaque ouverture (pas de pagination serveur) |

### MSG-01 — XSS DOM par invitation d'appel forgée sur un canal realtime public (emoji non échappé)

| Champ | Valeur |
|---|---|
| Identifiant | MSG-01 |
| Priorité retenue | **P0** (proposée par l'auditeur : P1) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Appels WebRTC — sonnerie entrante (canal ring:<uid>) |
| Résultat attendu | Seul un pair légitime peut faire sonner un compte, et l'identité affichée est celle de l'émetteur authentifié, rendue en texte. |
| Résultat observé | Les canaux ring:<uid>/call:<id> sont des canaux broadcast PUBLICS (aucune policy realtime.messages ne les couvre, seul le topic user: en a) ; tout client connaissant l'uid de la victime peut diffuser un `invite` avec from/name/emoji arbitraires ; `_callRenderIncomingUI` insère `inv.emoji` sans échappement → exécution de script chez la victime, avec un faux nom d'appelant. |
| Reproduction | Émulation : _callOnInvite({callId:'forge_1', from:'u_attaquant', kind:'voice', name:'Banque <b>Officielle</b>', emoji:'<img src=x onerror=window.__pwn=7>'}) → overlay affiché, __pwn = 7. En production : supa.channel('ring:<uid victime>').send({type:'broadcast', event:'invite', payload:{…}}) depuis n'importe quel compte. |
| Preuve | js/app-05-config-profil.js:494-497 (_callChannel sans private:true), 818-836 (_callOnInvite, seule garde isBlocked(payload.from)), 1052 (`(inv.emoji \|\| '🙂')` brut) ; pg_policies realtime : uniquement topic 'user:'\|\|auth.uid() ; preuves/emulation-resultats-2.json S11, capture emul-07-appel-forge.png |
| Impact utilisateur et commercial | Exécution de code arbitraire dans la session de la victime (vol de jeton sb-*-auth-token en localStorage, envoi de messages en son nom, lecture de ses conversations) ; harcèlement par sonneries forgées avec identité usurpée ; risque réputationnel majeur pour un réseau social de rencontre. |
| Visibilité dans le Centre de pilotage | non — aucun événement de télémétrie sur les invitations reçues ; un XSS silencieux ne remonte pas dans client_errors |
| Détection par la Sentinelle | non — la Sentinelle ne surveille que les erreurs critiques, les pics et les 5xx ; une charge XSS réussie ne produit aucune erreur |
| Proposition de correction | ① escapeHtml(inv.emoji) (et borner à un emoji : même filtre que _reactionKeySure) ; ② passer ring:/call:/typing: en canaux privés (`config.private:true`) avec policies realtime.messages `topic = 'ring:'\|\|auth.uid()` en lecture et une policy d'écriture bornée aux authentifiés ; ③ ne jamais faire confiance à payload.from : le porter par le JWT (Realtime le fournit dans les canaux privés) ou passer l'invitation par une table/Edge Function. |
| Risque de régression | faible pour ①. ② casse les appels tant que Realtime Authorization n'est pas activé et les policies posées : à livrer avec un test à deux comptes réels (multi-comptes) et un kill switch. |
| Effort estimé | ① 30 min ; ② + ③ 1 à 2 jours (migration + tests) |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P1). Code relu sur la branche d'audit (HEAD f501fb78 = c8cb8e99 + 2 commits .passio/ ; `git diff --stat c8cb8e99 HEAD -- js index.html tests migrations` vide) : - js/app-05-config-profil.js:494-497 `_callChannel(name)` → `supa.channel(name, { config: { broadcast: { self:false, ack:false } } })`, sans `private: true` (seuls `conv:` et `user:` en ont, app-08:4977 et 4992). Utilisé pour `ring:<peer.id>` (557), `ring:<MY_UID>` (1103) et `call:<id>`. - app-05:1100-1106 `_subscribeCallRing` branche `_callOnInvite(msg.payload)` sur tout broadcast `invite` du canal public ; app-05:818-836 `_callOnInvite` n'a pour seule garde `isBlocked(payload.from)`, `from` étant fourni par l'émetteur. - app-05:1052 `'<div class="call-avatar" …>' + (inv.emoji || "🙂") + '</div>'` : emoji inséré brut, alors que `inv.name` est bien passé par `escapeHtml` à la ligne suivante. - Preuve base déposée : preuves/supabase-isolation/policies.json ne contient que deux policies `realtime.messages` (SELECT authenticated, `realtime.topic() = 'user:'||auth.uid()`), aucune sur `ring:`/`call:` — cohérent avec des canaux publics sans autorisation. - CSP prod (netlify.toml:19, _headers:40) : `script-src 'self' 'unsafe-inline' …` → un attribut `onerror` inline s'exécute en production. - Reproduction exécutée par moi : `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scratchpad/relecture-msg-01.js` (http-server local port 8120, Supabase aborté par route, gate posé, `_callOnInvite({callId:'forge_relecture', from:'u_attaquant_inexistant', kind:'voice', name:'Banque <b>Officielle</b>', emoji:'<img src=x onerror="window.__pwn=42">'})`) → `{overlay_present:true, overlay_active:true, pwn:42, img_onerror:1, avatar_html:'<img src="x" onerror="window.__pwn=42">', nom_affiche:'Banque <b>Officielle</b>', pageerrors:[]}`. Capture : preuves/relecture-msg-01/repro-appel-forge.png. Le résultat S11 de l'auditeur (pwn=7) est donc reproduit indépendamment. git status --short : vide. — Correction de formulation : Formulation exacte ; deux précisions utiles : (1) ajouter dans la preuve que la CSP de production (netlify.toml:19 / _headers:40) porte `'unsafe-inline'` dans `script-src`, sans quoi un lecteur pourrait objecter que la CSP neutralise le handler inline — ce n'est pas le cas ; (2) le volet « diffusion depuis n'importe quel compte » est CONFORME PAR INSPECTION (code + policies.json), pas « test exécuté » : seule la partie XSS (émulation) est PROUVÉE. Le champ `preuve` peut le distinguer.
- **impact** → CONFIRMÉ (priorité proposée P0). Défaut réel, non documenté comme choix produit : js/app-05-config-profil.js:1052 insère `(inv.emoji || "🙂")` brut alors que `inv.name` (l.1053) passe par escapeHtml — l'oubli est local, pas une décision ; partout ailleurs l'emoji de profil est échappé (app-06:622, 2279, 2489, 2516). La CSP prod (netlify.toml:19, _headers:40) autorise `script-src 'unsafe-inline'` et `img-src https: data:`, donc un `<img onerror>` s'exécute ; l'émulation S11 (preuves/messagerie-notifs/emulation-resultats-2.json : pwn=7, overlay affiché, nom « Banque <b>Officielle</b> ») le prouve sur le vrai handler `_callOnInvite` → `_callRenderIncomingUI`. Chemin d'attaque : `_callChannel` (app-05:494-497) crée un canal broadcast sans `private:true` ; les 2 seules policies realtime.messages couvrent le topic `user:<uid>` (preuves/supabase-isolation/policies.json l.122-123) et realtime.messages est granté à anon (l.135) — un canal public n'exige aucune RLS, donc l'émetteur n'a même pas besoin d'un compte (clé anon publique) ; les uid des victimes sont lisibles par tous (`profiles` SELECT `true`, policies.json l.89-90) ; la victime est abonnée à `ring:<MY_UID>` dès le boot (app-05:1101-1107). Le jeton `sb-…-auth-token` est en localStorage (app-08:2186, 2635) → prise de contrôle complète du compte (le CLAUDE.md dit lui-même que ce jeton EST la session). Le seul point documenté (docs/PIEGES_CONNUS.md:80 « canaux publics, AUCUNE table/migration ») acte les canaux publics pour la signalisation, jamais l'absence d'échappement ni l'usurpation d'identité. Au regard des critères du GO grande échelle, un takeover de compte à distance par n'importe qui invalide « isolation des comptes prouvée » : c'est l'archétype du P0, pas d'un « avant lancement public » — l'effort de ① (30 min) ne change pas la gravité. — Correction de formulation : Scinder la priorité : ① XSS par `inv.emoji` non échappé = P0 (exécution de code chez toute victime en ligne, sans compte attaquant, prise de contrôle du compte via le jeton localStorage ; correctif escapeHtml + borne à un seul emoji, 30 min, à livrer AVANT toute ouverture, même en beta privée) ; ② canaux privés + ③ identité portée par le JWT = P1 (usurpation/harcèlement par sonneries forgées, effort 1-2 j). Préciser dans « reproduction » que l'attaque n'exige aucun compte : canal broadcast public + clé anon (grant anon sur realtime.messages, policies.json l.135) + uid lisible par `profiles` SELECT public ; préciser dans « preuve » que la CSP prod est en `'unsafe-inline'` (netlify.toml:19), condition qui rend la charge exécutable en production et non seulement en émulation. Ajouter que la voie « compte légitime au profil emoji hostile » (app-05:555, emoji jamais filtré à l'envoi) subsiste même après ② — d'où l'obligation de ① quoi qu'il arrive.
- **contexte** → CONFIRMÉ (priorité proposée P1). Code sur le SHA audité inchangé (git diff --stat c8cb8e99..HEAD -- js/ index.html migrations/ : vide). js/app-05-config-profil.js:494-497 `_callChannel` crée un canal broadcast sans `private:true` (commentaire « Canal Realtime broadcast (public) ») ; :818-836 `_callOnInvite` ne garde que `isBlocked(payload.from)` ; :1052 `(inv.emoji || "🙂")` inséré brut dans innerHTML alors que `inv.name` (ligne suivante) passe par escapeHtml. Réalité prod : preuves/supabase-isolation/fonctions_realtime_storage_staging.md:24-25 — realtime.messages n'a de policy que pour `user:<auth.uid()>`, et `ring:/call:/typing:` y sont listés comme canaux publics sans RLS. netlify.toml:19 : la CSP autorise `script-src 'unsafe-inline'`, donc la charge `onerror` s'exécute aussi en production (pas seulement en émulation). Ce n'est PAS un risque déjà décidé/assumé : aucune ADR (001-012), ni KNOWN_RISKS.md (R5 « XSS stocké via payload tiers » est générique), ni TECH_DEBT.md, ni PIEGES_CONNUS.md ne mentionne la non-authentification du canal ring: — PIEGES_CONNUS.md:80 dit simplement « canaux publics, AUCUNE table/migration » comme choix technique, sans l'évaluer comme risque. Aucun test e2e n'exerce la réception d'invitation (seul xss-notifs-messages.spec.js couvre notifs/messages, pas les appels). La correction ① (escapeHtml + filtre emoji type `_reactionKeySure`, app-04:4507) respecte l'invariant « 3 helpers selon le contexte » ; ② et ③ (canaux privés + policies realtime.messages, JWT plutôt que payload.from) sont compatibles : `private:true` est déjà le pattern en place pour `user:<uid>` (app-08:4992), donc Realtime Authorization est active en prod — la clause « casse les appels tant que Realtime Authorization n'est pas activé » du finding est donc trop pessimiste ; le vrai risque est l'absence de policy sur le nouveau topic (cas vécu : le canal v2 `conv:<id>` private est mort faute de policy, fonctions_realtime_storage_staging.md:24). — Correction de formulation : DOUBLON PARTIEL : supabase-isolation SUP-06 (P2) rapporte le même défaut de transport (ring:<uid>/call:<callId>/typing: publics, from usurpable, callId prévisible) sans la partie XSS. À fusionner : MSG-01 garde le P1 (il ajoute l'exécution de code prouvée en émulation + CSP unsafe-inline), SUP-06 devient sa sous-partie « transport », et l'orchestrateur doit harmoniser la priorité (P2 chez SUP-06 vs P1 ici). Reformuler « observé » : ce n'est pas un risque connu/assumé — PIEGES_CONNUS.md:80 documente les canaux publics comme choix d'implémentation (2026-06-25) sans analyse de sécurité, à citer comme tel. Ajuster « risque de régression » : Realtime Authorization est DÉJÀ active (topic user: privé, app-08:4992) ; le risque réel de ② est d'oublier la policy realtime.messages du nouveau topic (précédent : canal conv:<id> v2 mort, fonctions_realtime_storage_staging.md:24) — livrer la migration AVANT le passage en private, sous kill switch, et l'éprouver par la suite prod multi-comptes (BLOQUÉE ici, run CI 33861671142). Ajouter à la preuve netlify.toml:19 (CSP 'unsafe-inline'), qui rend l'impact effectif en production. Correction compatible avec tous les invariants (pas d'écriture dans tests/ hors ajout d'un verrou, pas d'ADR rouverte, pas de liste noire).

### MSG-02 — XSS stockée via un pseudo contenant un guillemet dans l'autocomplétion @mention des groupes

| Champ | Valeur |
|---|---|
| Identifiant | MSG-02 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Messagerie de groupe — mentions @ |
| Résultat attendu | Le nom d'un membre est rendu inerte dans tous les contextes (texte, attribut, handler). |
| Résultat observé | `_mentionDetect` construit `onclick="_pickMention('…')"` avec `String(m.name).replace(/'/g,"\\'")` seulement : un guillemet double ferme l'attribut et injecte un handler. Le pseudo n'est soumis à aucune validation de caractères (seule l'unicité est vérifiée), et il peut aussi être posé par REST sur profiles. |
| Reproduction | Émulation : cacheRemoteProfile({id:'u_evil', username:'x" onmouseover="window.__pwn=9" data-x="'}) ; ouvrir un groupe dont u_evil est membre ; taper « @ » ; survoler la ligne → __pwn = 9. En production : un membre du groupe choisit ce pseudo dans « Modifier le profil ». |
| Preuve | js/app-04-comments-shop.js (_mentionDetect, ligne `'<div onclick="_pickMention(\'' + String(m.name).replace(/'/g,"\\'") + '\')" …'`) ; js/app-06-reels-partage.js:1306-1326 (aucune validation) ; preuves/emulation-resultats-2.json S9 (extrait_html montre l'attribut injecté), capture emul-05-mention-xss.png |
| Impact utilisateur et commercial | Tout membre d'un groupe peut piéger les autres membres (exécution de script au survol/tap d'une suggestion) ; même surface d'impact que MSG-01. |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Rendre la ligne avec un attribut `data-name` + escapeHtml et un écouteur délégué (pas de onclick inline), ou `escapeHtml(escapeJsArg(name))` ; ajouter une validation de pseudo (longueur ≤ 30, caractères lettres/chiffres/_/-/espace/accents) à l'écriture ET un nettoyage à l'affichage ; ajouter le cas au verrou echappement.spec.js. |
| Risque de régression | faible (une seule fonction) ; la validation peut refuser des pseudos existants → l'appliquer aux nouveaux et normaliser à l'affichage. |
| Effort estimé | 1 à 2 h |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P1). 1) Code sur le SHA audité : `git show c8cb8e99:js/app-04-comments-shop.js` ligne 4714 — `'<div onclick="_pickMention(\'' + String(m.name).replace(/'/g,"\\'") + '\')" …'` : seul l'apostrophe est échappé, un `"` dans le nom ferme l'attribut. `js/` est identique entre c8cb8e99 et HEAD (git diff --stat vide). 2) Chaîne réelle jusqu'au pseudo d'autrui : `profiles.username` (text NOT NULL, aucun CHECK — migrations/SCHEMA_PROD_REFERENCE.sql:220 ; policy « Update propre » qual `id = auth.uid()` — preuves/supabase-isolation/policies.json, donc posable librement par REST par son propriétaire ; aucun trigger de nettoyage — fonctions_realtime_storage_staging.md:20 ne liste que la propagation d'identité) → `cacheRemoteProfile` (app-02:1642 `name: p.username`, appelée au chargement des membres de conversation app-08:5097) → `_groupMemberName` (app-05:1552-1556) → `_mentionDetect`. `saveMainProfile` (app-06:1307-1322) ne vérifie que l'unicité. 3) CSP de prod (`netlify.toml:19`, `_headers:40`) : `script-src 'self' 'unsafe-inline'` → les handlers inline injectés s'exécutent. 4) Reproduction indépendante (émulation Chromium, serveur local port 8120, Supabase stubbé, chemin réel `input` → `onConvInput` → `_mentionDetect`, survol par `page.hover` et non par dispatchEvent) : `lignes_onmouseover: 1`, `pwn_apres_survol_reel: 9`, `pageerrors: []` — fichier preuves/revue-msg-02/repro-msg02-8120.json (script preuves/../repro-msg02.js). La preuve citée par le finding (emulation-resultats-2.json S9 : pwn 9, extrait_html avec l'attribut injecté) existe et dit la même chose. 5) `git status --short` vide à la fin. — Correction de formulation : Le finding est juste sur le fond ; précisions de forme : (a) la preuve doit citer la ligne exacte `js/app-04-comments-shop.js:4714` (et `_groupMemberName` app-05:1552-1556, `cacheRemoteProfile` app-02:1642, ingestion des membres app-08:5097) ; (b) ajouter que la CSP de production autorise `'unsafe-inline'` (netlify.toml:19), condition sans laquelle le handler inline ne s'exécuterait pas ; (c) dans la correction, `escapeJsArg` seul suffit pour l'argument onclick (il encode déjà `"` en `&quot;`, app-02:1163) — ne pas l'empiler avec `escapeHtml` (double échappement de `&`) ; la solution `data-name` + écouteur délégué reste préférable. Priorité P1 maintenue : pré-requis = être membre du même groupe et victime qui survole/tape une suggestion, même surface que MSG-01, à corriger avant lancement public.
- **impact** → CONFIRMÉ (priorité proposée P1). Défaut réel, relu dans le code : js/app-04-comments-shop.js:4714 construit `onclick="_pickMention('…')"` avec pour seule protection `String(m.name).replace(/'/g,"\\'")` — un guillemet double sort de l'attribut ; la ligne suivante (4716) échappe bien le libellé visible, ce qui prouve que seul le contexte handler est oublié (exactement le cas « escapeJsArg » de CLAUDE.md, ici en plus sans escapeHtml). Le nom vient de `_groupMemberName(id)` (4707), donc du pseudo d'autrui. Aucune validation de caractères sur le pseudo : app-06 saveMainProfile (1307-1322) ne vérifie que l'unicité ; grep « username » + check/constraint dans migrations/*.sql = 0 résultat ; SCHEMA_PROD_REFERENCE.sql:220 = `username text NOT NULL` sans contrainte. La CSP de production (netlify.toml:19, _headers:40) autorise `script-src 'unsafe-inline'`, donc rien ne bloque le handler injecté. Preuve d'exécution : preuves/messagerie-notifs/emulation-resultats-2.json S9 (`attribut_onmouseover_injecte:true`, `pwn:9`, extrait HTML montrant l'attribut fermé). Ce n'est ni un comportement attendu ni une décision documentée : CLAUDE.md classe les XSS stockées comme défauts corrigés le 2026-07-02 et impose les 3 helpers selon le contexte. Priorité P1 justifiée : exploitation par tout membre authentifié d'un groupe contre les autres membres, avec accès au jeton `sb-<ref>-auth-token` en localStorage (prise de compte possible) — mais surface bornée (groupe commun, survol/tap d'une suggestion), beta privée à 5 comptes sous code d'accès, correctif de 1-2 h ; il doit être fermé avant tout lancement public, sans bloquer la commercialisation en soi. git status --short : vide. — Correction de formulation : Formulation juste ; deux ajouts : (1) préciser dans « preuve » que la CSP de prod autorise 'unsafe-inline' (netlify.toml:19), sinon un lecteur pourrait supposer que le handler injecté est bloqué ; (2) dans « impact », nommer explicitement le risque de prise de compte (jeton de session lisible en localStorage depuis un script exécuté dans l'origine) et la condition d'exploitation (appartenance au même groupe + survol/tap), ce qui fonde le P1 plutôt qu'un P0. Le champ preuve `app-06:1306-1326` désigne bien saveMainProfile (unicité seule). Effort 1-2 h confirmé.
- **contexte** → CONFIRMÉ (priorité proposée P1). Défaut présent sur le SHA audité (git diff c8cb8e99..HEAD ne touche que .passio/) : js/app-04-comments-shop.js:4714 construit `'<div onclick="_pickMention(\'' + String(m.name).replace(/'/g,"\\'") + '\')"'` — seul l'apostrophe est échappé, pas le guillemet double ; le nom vient de `_groupMemberName` (app-05:1552-1557 → `userById`, donc le `username` d'un profil distant mis en cache). L'émulation S9 (preuves/messagerie-notifs/emulation-resultats-2.json, clé S9_mention_xss_pseudo_guillemet : attribut_onmouseover_injecte=true, pwn=9) le prouve. Pas déjà corrigé ni décidé : aucun document ne le cite (grep `_mentionDetect`/`_pickMention` dans docs/ et .passio/ ne rend que docs/PIEGES_CONNUS.md:29 et :88, qui parlent uniquement de la COLLISION de nom `_pickMention` et disent que l'autocomplétion des COMMENTAIRES est « XSS-safe via escapeHtml/escapeJsArg » — la variante messagerie n'a jamais été passée en revue). Il relève du risque générique R5 (« XSS stocké via payload tiers non échappé », .passio/context/KNOWN_RISKS.md:12, mitigation = 3 helpers + xss-audit) : un cas concret non couvert par la mitigation, donc toujours ouvert. Il contredit directement l'invariant CLAUDE.md « escapeJsArg = argument de chaîne JS simple-quotée DANS un attribut onclick » et l'audit des XSS stockées du 2026-07-02, qui n'a pas atteint cette fonction. Aucune validation de pseudo : app-06:1306-1326 ne vérifie que l'unicité (`supaUsernameTaken`) ; en base profiles.username est `text` sans CHECK (preuves/supabase-isolation/ref_cols.txt:29, aucune contrainte dans migrations/*.sql), et les triggers d'identité (fonctions_realtime_storage_staging.md:17-20) propagent sans filtrer. Aucun test ne couvre les mentions de groupe (xss-notifs-messages.spec.js:108-110 = conversation isGroup:false ; echappement.spec.js sans « mention »). Aucun doublon dans les autres domaines (grep pseudo/username/mention dans resultats/*.json : seuls des contrôles non liés CTL-32 et C06). git status --short : vide. — Correction de formulation : Finding juste ; à corriger dans sa proposition de correction : (1) ne PAS écrire `escapeHtml(escapeJsArg(name))` — `escapeJsArg` fait déjà l'échappement HTML (app-02:1160-1163), l'empiler avec `escapeHtml` produirait `&amp;quot;`/`&amp;#39;` (nom affiché corrompu, bouton mort sur un pseudo avec apostrophe) et viole l'invariant de la fiche 15 (docs/lots-ui/15-AUDIT-DEFAUTS-2026-08-29.md : « un désinfectant appliqué à deux étages doit être IDEMPOTENT — jamais deux échappements empilés ») ; la bonne formulation est SOIT `escapeJsArg(m.name)` seul (invariant CLAUDE.md « escapeJsArg = arg JS dans onclick »), SOIT — mieux — le rendu DOM + écouteur `onmousedown` déjà employé par `_cmtMentionDetect` (app-04:395-406), sans onclick inline (ce qui satisfait aussi `npm run audit:handlers`). (2) La validation de pseudo proposée est une mesure de défense en profondeur, pas la correction : la borne « lettres/chiffres/_/-/espace/accents » refuserait des pseudos existants et n'empêche pas la pose par REST tant qu'elle n'est pas aussi un CHECK/trigger côté base (canal ③ DDL d'ADR-012, jamais depuis la CI) — la formuler comme P2 séparée ou comme complément optionnel, et l'échappement à l'affichage reste la garde obligatoire. (3) Préciser que le risque est un cas concret de R5 (KNOWN_RISKS.md) resté hors du périmètre de l'audit XSS du 2026-07-02, et que `_pickMention` est cité dans PIEGES_CONNUS.md:29/:88 uniquement pour sa collision de nom, jamais pour son échappement. (4) L'ajout d'un cas de test dans echappement.spec.js ou xss-notifs-messages.spec.js (conversation isGroup:true) est compatible avec les règles du dépôt (l'interdiction de toucher tests/ ne vise que la réparation automatique de la Sentinelle). Aucun doublon dans un autre domaine ; parenté de surface avec MSG-01 (même vecteur onclick/HTML non échappé), à traiter dans le même correctif d'échappement.

### MSG-03 — Pièces jointes de conversation lisibles ET listables sans authentification, jamais purgées

| Champ | Valeur |
|---|---|
| Identifiant | MSG-03 |
| Priorité retenue | **P0** (proposée par l'auditeur : P1) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Pièces jointes (photos, vidéos, vocaux, documents) — bucket `attachments` |
| Résultat attendu | Un média privé n'est lisible que par les membres de la conversation, via une URL non devinable ou signée à courte durée, et disparaît avec le message ou le compte. |
| Résultat observé | Le seau `attachments` est public=true ; la policy SELECT `passio_media_read` n'a aucune condition d'appartenance et s'applique au rôle public ; anon détient SELECT sur storage.objects → l'endpoint de listing énumère les dossiers `attachments/<conv_id>/` et leurs fichiers ; les vocaux sont nommés `<Date.now()>_voice.webm` (aucun aléa), les autres `<ts>_<9 car. base36>_<nom original>` ; cacheControl 1 an ; `_deleteMsgForAll` ne retire pas l'objet ; delete-account ne purge que content/photos\|videos\|audios, jamais attachments. Aujourd'hui 12 objets / 10 Mo (2 vocaux, 7 images, 3 vidéos, la plus lourde 6,2 Mo) appartenant à 4 conversations. |
| Reproduction | Requêtes base : select public from storage.buckets ; select * from pg_policies where schemaname='storage' ; has_table_privilege('anon','storage.objects','SELECT'). Sans compte : POST /storage/v1/object/list/attachments {prefix:'attachments'} puis GET /storage/v1/object/public/attachments/<chemin> (non exécuté ici : proxy 403). |
| Preuve | storage.buckets attachments public=true, allowed_mime_types null ; policy passio_media_read USING bucket_id IN ('content','attachments') roles {public} ; has_table_privilege anon SELECT = true ; js/app-09-boot-pwa.js:865-866, 877-886, 1597-1598 ; js/app-04-comments-shop.js:4217-4234 ; supabase/functions/delete-account/index.ts:71-79 ; migration_storage_cloisonnement.sql § « CE QUE CETTE MIGRATION NE FAIT PAS » ; preuves/anon-rest-storage-probe.json (403 proxy) |
| Impact utilisateur et commercial | Fuite de contenu privé (vocaux, photos échangées en messagerie) à quiconque, sans compte ; violation RGPD (conservation après suppression du compte, MEDIA-COMPTE-SUPPRIME-010) ; un lien partagé une fois reste lisible un an de cache ; blocage commercial pour une messagerie « privée ». |
| Visibilité dans le Centre de pilotage | partiel — PASSIO_CONTROL_CENTER_AUDIT.md l.80 : « Autorisation Storage NON INSTRUMENTÉ » ; aucune métrique d'accès Storage |
| Détection par la Sentinelle | non — les accès Storage anonymes ne passent pas par la télémétrie |
| Proposition de correction | ① `update storage.buckets set public=false where name='attachments'` + policy SELECT `bucket_id='attachments' and is_conv_member((storage.foldername(name))[2], auth.uid()::text)` ; ② côté client, remplacer getPublicUrl par createSignedUrl (durée courte) à l'affichage (renderConvFpThread img/video/audio/a, galerie #convFilesPanel), stocker le chemin et non l'URL dans content.url ; ③ nommer les vocaux avec un aléa crypto (crypto.randomUUID()) ; ④ purger l'objet dans _deleteMsgForAll et le dossier attachments/<conv> dans delete-account (lister par conv_members avant suppression) ; ⑤ retirer le grant SELECT anon sur storage.objects si aucun média public n'est servi aux visiteurs (à arbitrer avec le fil public du bucket content). |
| Risque de régression | élevé : les 68 messages existants portent des URLs publiques absolues ; prévoir une lecture de compatibilité (URL publique → chemin → URL signée) et un test multi-comptes ; le cache SW/CDN ne sert pas les URLs signées de la même façon. |
| Effort estimé | 1,5 à 2,5 jours (migration, client, tests, migration des contenus existants) |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P1). SHA vérifié : HEAD f501fb7 n'a que 2 commits .passio/ au-dessus de c8cb8e99 (git diff --stat ':!.passio' vide). Chaque preuve citée existe et dit ce que le finding en dit : - Base (preuves déposées par un domaine INDÉPENDANT, supabase-isolation) : preuves/supabase-isolation/policies.json → passio_media_read, SELECT, roles {public}, qual = `bucket_id = ANY(ARRAY['content','attachments'])`, aucune condition d'appartenance ; fonctions_realtime_storage_staging.md l.30-34 → buckets content et attachments public=true, 50 Mo, MIME null, « listing /storage/v1/object/list/<bucket> possible avec la seule clé anon », aucun createSignedUrl réel ; isolation_par_table.md l.33 → storage.objects DÉFAILLANT, l.40 → 5 messages portent une URL publique /storage/v1/object/public/attachments/…. Le fait « buckets public=true » figure aussi dans les faits établis de l'orchestrateur. - Code : migrations/migration_storage_buckets.sql:20-22 crée les deux buckets `public = true` ; migration_storage_cloisonnement.sql:190-193 déclare explicitement « Elle ne referme pas la LECTURE : les seaux restent publics » (seul l'INSERT/UPDATE passe par storage_chemin_autorise → is_conv_member, l.73-74) ; js/app-09-boot-pwa.js:865-866 nom `<Date.now()>_<9 base36>_<nom>`, :877-878 cacheControl 31536000, :886 getPublicUrl ; :1597-1599 vocal `<Date.now()>_voice.<ext>` (aucun aléa) + getPublicUrl ; js/app-04-comments-shop.js:4217-4234 `_deleteMsgForAll` supprime la ligne conv_messages et pose un tombstone mais ne touche jamais storage ; supabase/functions/delete-account/index.ts:71-79 ne purge que content/photos|videos|audios/<uid>, jamais attachments. - La reproduction HTTP directe (listing anon) est BLOQUÉE par le proxy (preuves/messagerie-notifs/anon-rest-storage-probe.json : 403 « Host not in allowlist »), mais la policy SELECT sans condition + bucket public suffisent à établir le défaut par inspection ; git status --short vide. — Correction de formulation : Deux retouches de formulation, sans effet sur le verdict ni la priorité : (1) « cacheControl 1 an » ne vaut que pour les pièces jointes fichiers (app-09:878, 31536000) ; les vocaux sont à 3600 s (app-09:1598) — le vocal, précisément celui dont le nom est prévisible, n'est mis en cache qu'une heure. (2) Le décompte « 2 vocaux, 7 images, 3 vidéos » n'est pas recoupé par les preuves déposées (isolation_par_table.md l.33 parle de « 12 pièces jointes vocales ») : présenter le détail par type comme non recoupé, ou le faire relire par la requête ci-dessus. (3) La preuve « has_table_privilege anon SELECT = true » n'est dans aucun fichier de preuves/ : la marquer « déclarée par l'auditeur, à confirmer par l'orchestrateur » — c'est le grant par défaut de Supabase, donc très probable, et sans lui la lecture par URL publique reste de toute façon ouverte (bucket public=true).
- **impact** → CONFIRMÉ (priorité proposée P0). Défaut réel, non une décision produit : preuves/supabase-isolation/policies.json → storage.objects `passio_media_read` SELECT roles {public}, qual `bucket_id = ANY('content','attachments')` sans condition d'appartenance ; fonctions_realtime_storage_staging.md l.30-33 : buckets `attachments` public=true, listing `/storage/v1/object/list/` possible avec la seule clé anon, `createSignedUrl` sans usage réel (app-08:2644 stub), `getPublicUrl` partout. Code vérifié : js/app-09-boot-pwa.js:865-866 (nom `<ts>_<9 car. base36>_<nom>`), :877-878 (cacheControl 31536000), :886 et :1597-1598 (vocal `<Date.now()>_voice.<ext>`, aucun aléa, getPublicUrl) ; js/app-04-comments-shop.js:4217-4234 `_deleteMsgForAll` supprime la ligne, jamais l'objet ; supabase/functions/delete-account/index.ts:71-79 purge uniquement content/photos|videos|audios/<uid>. Le projet n'a JAMAIS acté ce comportement : migrations/migration_storage_cloisonnement.sql l.190-194 dit explicitement « Elle ne referme pas la LECTURE : les seaux restent publics… y compris celle d'un compte supprimé » ; docs/EDGE_FUNCTION_DELETE_ACCOUNT.md l.51 le note comme lacune ; et surtout .passio/context/KNOWN_RISKS.md l.9 (R2) classe « Médias privés en bucket public (pas d'URL signée) » impact Élevé avec correction « URLs signées (P0) » — le dépôt lui-même le tient pour un P0 ouvert. Sur les critères du GO grande échelle, c'est une « isolation des comptes non prouvée » sur le canal le plus sensible (messagerie privée : vocaux, photos échangées), invisible du pilotage (PASSIO_CONTROL_CENTER_AUDIT l.80 « Autorisation Storage NON INSTRUMENTÉ ») et de la Sentinelle — deux critères d'interdiction cumulés. Le précédent du 2026-08-09 (lecture des DM par tout compte) a été traité comme « FUITE CRITIQUE » (KNOWN_RISKS l.21) ; ici c'est pire, la lecture est possible SANS compte. Le faible volume actuel (12 objets, 4 conversations) décrit l'exposition, pas la gravité. P1 sous-estime : P0. — Correction de formulation : Priorité : P1 → P0 (blocage de commercialisation), en cohérence avec KNOWN_RISKS R2 qui prévoit déjà « URLs signées (P0) » et avec les critères d'interdiction du GO (isolation non prouvée + fonction critique invisible du pilotage ET de la Sentinelle). Ajouter dans « preuve » la référence .passio/context/KNOWN_RISKS.md l.9 (R2) et docs/EDGE_FUNCTION_DELETE_ACCOUNT.md l.51 : le risque est connu depuis 2026-08 et non traité, ce qui aggrave l'appréciation (dette assumée puis oubliée, pas décision documentée d'acceptation). Nuancer « observé » : le cacheControl 1 an vaut pour les fichiers (app-09:877), les vocaux sont à 3600 s (app-09:1598). Préciser que l'attaquant n'a besoin que de la clé anon (publique, app-08:2551) — le code d'accès 2125 ne protège pas Storage. Effort et correction inchangés ; ajouter à la correction une mesure au pilotage (compteur d'accès Storage anonymes ou au minimum `get_advisors`/audit périodique des buckets publics) pour lever le critère « invisible du pilotage ». Git status --short : vide.
- **contexte** → CONFIRMÉ (priorité proposée P1). Le défaut est CONNU, DOCUMENTÉ comme risque ouvert et JAMAIS corrigé sur le SHA audité : .passio/context/KNOWN_RISKS.md l.9 (R2 « Médias privés en bucket public (pas d'URL signée) », mitigation « URLs signées (P0) », aucune remédiation appliquée dans la section dédiée) ; .passio/context/SECURITY_MODEL.md l.14 (« Médias privés | URLs signées | À faire (P0) ») ; .passio/audits/SECURITY_AUDIT.md l.23 et l.35 (S10 ❌ P0) ; .passio/adr/ADR-004 (« Médias privés exposés si buckets publics → URLs signées à mettre en place (P0) ») ; migrations/migration_storage_cloisonnement.sql l.190-194 (« Elle ne referme pas la LECTURE : les seaux restent publics ») ; PASSIO_ENGINEERING_LOG.md l.145 ; docs/PIEGES_CONNUS.md l.28 (« médias Storage = URLs publiques (durcissement = URLs signées, refacto plus lourd) ») ; docs/EDGE_FUNCTION_DELETE_ACCOUNT.md l.51 (« bucket attachments … ne sont pas purgés »). Code vérifié sur place : js/app-09-boot-pwa.js:865-866 (nom avec 9 car. base36), 877-886 (getPublicUrl, cacheControl 31536000), 1597-1599 (`Date.now()+"_voice."` sans aléa, getPublicUrl) ; js/app-04-comments-shop.js:4217-4234 (_deleteMsgForAll ne retire aucun objet Storage) ; supabase/functions/delete-account/index.ts:71-79 (content/photos|videos|audios seulement). migrations/migration_storage_buckets.sql l.19-31 crée volontairement les deux buckets « publics en lecture » — c'est une décision d'implémentation datée, PAS un choix assumé en ADR (l'ADR-004 la classe au contraire comme dette P0). Aucune migration ni code sur c8cb8e99 ne passe attachments en public=false ni n'utilise createSignedUrl (app-08:2644 est un stub hors-ligne). Preuves base réutilisées : preuves/supabase-isolation/fonctions_realtime_storage_staging.md l.30-34 (buckets public=true, policy SELECT {public} sur content+attachments, listing possible avec la clé anon, 5 messages portant une URL publique). La correction proposée ne rouvre aucune ADR, ne touche pas tests/ (elle en AJOUTE), et respecte les invariants (lire { error }, pas de base64 en DB, is_conv_member existant). git status --short : vide. — Correction de formulation : Reformuler comme RISQUE CONNU ET ASSUMÉ-OUVERT depuis le 2026-08-08 : citer KNOWN_RISKS R2 (« URLs signées (P0) »), SECURITY_MODEL.md l.14, SECURITY_AUDIT.md S10, ADR-004 et migration_storage_cloisonnement.sql l.190-194 — la formulation actuelle laisse croire à une découverte alors que le projet le classe P0 depuis un mois sans l'avoir traité (ce qui renforce l'urgence plutôt que l'inverse). Corriger l'attribution MEDIA-COMPTE-SUPPRIME-010 (cet incident vise les médias du bucket content laissés par des suppressions administratives ; la non-purge d'attachments est une limite déclarée de delete-account, docs/EDGE_FUNCTION_DELETE_ACCOUNT.md l.51). Préciser que la policy publique est une décision explicite de migration_storage_buckets.sql l.19-31 (« publics en lecture, en plus du flag public, pour les SDK »), non couverte par une ADR. DOUBLONS : SUP-01 (supabase-isolation, P1 — même défaut, même correction, cite déjà R2) et CONT-11 (contenu, P1 — le volet listing anonyme) ; le volet « jamais purgées » recoupe SUP-10 (P2, delete-account incomplet). Fusionner MSG-03 + SUP-01 + CONT-11 en un seul finding transverse P1 (attachments : bucket privé + lecture par membre ; content : retirer seulement le LISTING), en gardant le volet purge dans SUP-10.

### MSG-04 — Notifications in-app et push forgeables vers n'importe qui, sans relation ni cadence

| Champ | Valeur |
|---|---|
| Identifiant | MSG-04 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Notifications (table notifications + Edge Function notify-call, type 'notif') |
| Résultat attendu | Une notification ne peut être adressée qu'à un compte en relation avec l'auteur (abonné, membre de conversation, participant), avec un texte composé côté serveur et une cadence bornée. |
| Résultat observé | La policy INSERT ne contraint que from_id ; user_id, kind, ref_id et content sont libres. `supaInsertNotif` invoque ensuite notify-call avec `text` et `toUserId` choisis par le client, sans vérification de relation ni quota côté serveur → push système (titre « PASSIO ») avec texte arbitraire sur tous les appareils de la cible. Aucun trigger rate_limit sur notifications ni conv_messages (présents seulement sur comment_interactions 60/min, event_reactions 30/min, reports 10/min). Émulation : 50 inserts en 4 ms sans borne cliente. |
| Reproduction | Depuis un compte authentifié : insert notifications {user_id:<cible>, kind:'follow', from_id:<moi>, ref_id:<profil piégé>, content:'Texte libre'} ×N ; puis supa.functions.invoke('notify-call',{body:{toUserId:<cible>, type:'notif', text:'…', emoji:'🏦'}}) ×N. |
| Preuve | pg_policies notifications_insert_own_author (from_id seulement) ; pg_trigger (aucun trg_rate_limit sur notifications/conv_messages) ; supabase/functions/notify-call/index.ts:40-59 (toUserId/text/emoji lus du body, aucune vérification) ; js/app-08-ui-modals-tour.js:4776-4798 ; émulation S4 ; base : 188 notifications, 0 auto-adressée (aucune trace d'abus à ce jour) |
| Impact utilisateur et commercial | Spam et hameçonnage par le canal le plus fiable de l'app (ref_id ouvre le post/profil visé) ; push système forgé sur le téléphone ; épuisement du quota Web Push et désinstallation des notifications ; inutilisable en lancement public sans modération. |
| Visibilité dans le Centre de pilotage | partiel — store.js compte les actions, pas les rafales par auteur ; aucune alerte sur volume de notifications |
| Détection par la Sentinelle | non — aucune règle de cadence ; un pic de notifications n'est pas une erreur |
| Proposition de correction | ① triggers `rate_limit_insert('from_id', 30)` sur notifications et `('from_id', 60)` sur conv_messages (fonction existante) ; ② notify-call : composer le texte côté serveur à partir de kind + pseudo de fromUid (profiles), refuser si aucune relation (follows, conv_members commune, event_attendees) et si bloqué (is_blocked_with), quota par appelant (ex. 60/h) ; ③ policy INSERT notifications : `user_id <> from_id AND kind IN (liste blanche)` et NOT is_blocked_with(user_id) ; ④ borner content (CHECK length ≤ 200). |
| Risque de régression | moyen : les 21 points d'appel de supaInsertNotif doivent rester sous les seuils (like/unlike répétés) ; tester avec multi-comptes. |
| Effort estimé | 0,5 à 1 jour |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P1). SHA audité : HEAD f501fb78 ne diffère de c8cb8e99 que par 3 fichiers .passio/ (git diff --name-only), aucun fichier audité modifié. 1) Policy INSERT : preuves/supabase-isolation/policies.json (dump pg_policies du 2026-09-04) → notifications_insert_own_author, cmd INSERT, roles {public}, check "(from_id = ((SELECT auth.uid()))::text)" ; aucune contrainte sur user_id, kind, ref_id, content. Cohérent avec migrations/migration_notifications_auteur.sql:56-58 et migrations/SCHEMA_PROD_REFERENCE.sql:673-675. La colonne content est text sans CHECK (ref_cols.txt:23 ; SCHEMA_PROD_REFERENCE.sql:347 : seule contrainte = PK). 2) Cadence : preuves/supabase-isolation/fonctions_realtime_storage_staging.md:20 « Triggers actifs (12) : rate_limit sur comment_interactions(60/min), event_reactions(30/min), reports(10/min) … Aucun rate-limit sur notifications, conv_messages » ; SCHEMA_PROD_REFERENCE.sql:895-903 idem ; migrations/migration_anti_flood_interactions.sql:129-139 ne pose trg_rate_limit que sur ces trois tables. 3) supabase/functions/notify-call/index.ts:39-42 lit toUserId/type/text/emoji/kind du body ; seul contrôle = JWT valide (l.35-37) ; l.57 charge TOUS les push_subscriptions de toUserId (service_role) ; l.60-61 met text/emoji tels quels dans le payload ; aucune vérification de relation, de blocage, ni de quota. sw.js:52-65 affiche data.text en corps sous le titre « <emoji> PASSIO ». 4) js/app-08-ui-modals-tour.js:4776-4798 : supaInsertNotif insère {user_id:toUserId, kind, from_id:MY_UID, ref_id, content} puis invoque notify-call avec text composé côté client — exactement ce qu'un client hostile peut appeler directement avec des valeurs arbitraires. openNotifTarget (app-08:1976-1990) suit ref_id vers openPost/openUserProfile → le vecteur d'hameçonnage est réel. Toutes les preuves citées existent et disent ce que le finding leur fait dire. Aucune requête SQL supplémentaire nécessaire. — Correction de formulation : Deux précisions de formulation, sans changer le verdict ni la priorité : ① « Émulation : 50 inserts en 4 ms sans borne cliente » renvoie à S4_message_100ko_et_rafale (emulation-resultats-2.json), qui mesure une rafale sur conv_messages avec Supabase STUBBÉ, pas sur notifications — à reformuler en « aucune borne cliente ni serveur (émulation S4 sur conv_messages ; notifications : inspection + pg_trigger) ». ② Le volet push (« sur tous les appareils de la cible ») est CONFORME PAR INSPECTION (index.ts:57 sélectionne tous les abonnements de toUserId), mais le déploiement effectif de notify-call en production n'a pas été vérifié dans ce bilan (BLOQUÉ) : le dire. Le reste (policy, absence de trigger, texte composé côté client, ref_id suivi par openNotifTarget) est exact et vérifié aux lignes citées.
- **impact** → CONFIRMÉ (priorité proposée P1). Défaut réel, pas une décision produit. (1) preuves/supabase-isolation/policies.json l.70 : seule policy INSERT sur notifications = `from_id = auth.uid()` ; user_id, kind, ref_id, content libres. (2) migrations/migration_notifications_auteur.sql l.1-35 documente ce choix comme un PALIER (contraindre l'auteur, usurpation fermée) et nomme explicitement le résidu « vecteur d'hameçonnage (ref_id mène où l'on veut) » — aucune ADR ni doc ne déclare le contenu libre/la cadence illimitée comme comportement voulu ; au contraire docs/PASSIO_NOTIFICATIONS_V2_HEALTHY_REENGAGEMENT_2026-08-20.md §15 (l.752-767) exige un rate limiting serveur non implémenté. (3) supabase/functions/notify-call/index.ts l.38-59 : `toUserId`, `text`, `emoji`, `kind` lus du body sans vérification de relation, de blocage ni de quota ; seul un JWT valide est exigé (l.34-36) ; sw.js l.53-62 affiche `data.text` tel quel sous le titre « PASSIO ». (4) preuves/supabase-isolation/fonctions_realtime_storage_staging.md l.20 : « Aucun rate-limit sur notifications, conv_messages » ; migration_anti_flood_interactions.sql l.11-15 ne couvre que 3 tables. (5) js/app-08-ui-modals-tour.js l.4776-4798 : le client compose le texte et invoque notify-call après insert. Priorité : lancement public = comptes inconnus ; spam/hameçonnage par push système forgé vers tout compte (5 push_subscriptions en prod) touche le critère GO « sécurité IRL ou modération insuffisante » mais ne bloque pas une commercialisation en beta fermée (5 comptes, 0 abus observé : isolation_par_table.md l.22). P1 « avant lancement public » est donc exact, ni P0 ni P2. — Correction de formulation : Formulation à préciser : l'usurpation d'auteur (from_id) est DÉJÀ fermée par migration_notifications_auteur.sql (appliquée, policies.json l.70) — le finding ne doit pas laisser croire que tout le champ est ouvert. Le résidu confirmé est : destinataire libre, contenu libre (in-app ET push via notify-call), aucune relation/blocage vérifié, aucune cadence. Séparer l'impact conv_messages (absence de rate-limit = P2 flood, pas d'hameçonnage push) de l'impact notifications/push (P1). Effort 0,5-1 j plausible pour ①③④ ; ② (composition serveur du texte + vérification de relation dans notify-call) touche 25 points d'appel de supaInsertNotif et 3 kinds sans relation évidente (event_feedback, cdv_live_step…) → compter 1-2 j.
- **contexte** → CONFIRMÉ (priorité proposée P1). Défaut CONNU, DÉCIDÉ et TOUJOURS OUVERT sur le SHA audité (c8cb8e99), donc finding recevable mais à reformuler comme « risque connu, planifié P0 le 2026-08-20, non livré ». - Connu depuis le 2026-08-16 : migrations/migration_notifications_auteur.sql:2-35 décrit mot pour mot l'usurpation/hameçonnage par `ref_id` et ne corrige VOLONTAIREMENT que le côté auteur (`from_id`) ; user_id/kind/ref_id/content restent libres. Preuve prod : preuves/supabase-isolation/policies.json → notifications INSERT `notifications_insert_own_author`, check `(from_id = (select auth.uid())::text)` uniquement. Le verrou CI `tests/e2e/authz-critical.spec.js:224-249` ne teste que l'usurpation de from_id, pas la cible ni la cadence. - Décidé : docs/PASSIO_MASTER_IMPLEMENTATION_ROADMAP_2026-08-20.md:740-762 « Piste sécurité S1 — Notifications authz P0 » (supprimer la push sociale arbitraire de notify-call, cible+texte arbitraires refusés, création server-authoritative, block, rate limit) ; docs/PASSIO_NOTIFICATIONS_V2_HEALTHY_REENGAGEMENT_2026-08-20.md §4 et §15 ; matrice d'acceptation NOTIF-GATE-03 (docs/PASSIO_ACCEPTANCE_TEST_MATRIX_2026-08-20.md:306). Aucun ADR ne l'a tranché autrement ; KNOWN_RISKS.md ne le liste PAS (seule la lecture « notifications déjà scellé » y figure, ligne 21 — ce n'est pas une contradiction, c'est le SELECT). - Non corrigé sur le SHA : supabase/functions/notify-call/index.ts:40-59 lit toujours toUserId/text/emoji du body sans vérification ; js/app-08-ui-modals-tour.js:4776-4798 envoie le texte du client ; preuves/supabase-isolation/fonctions_realtime_storage_staging.md:20 « Aucun rate-limit sur notifications, conv_messages, posts… ». - Compatibilité de la correction avec les invariants : `rate_limit_insert` existe (migration_anti_flood_interactions.sql:98, fenêtre 1 min) ; DDL = canal ③ ADR-012 (psql/SQL Editor, jamais CI) ; changement RLS = revue indépendante obligatoire (CLAUDE.md §Revue). Aucune violation d'ADR-009, de tests/ ni de liste noire. — Correction de formulation : Reformuler « observé » : « risque connu depuis le 2026-08-16 (migration_notifications_auteur.sql, qui n'a fermé que l'usurpation d'auteur), planifié P0 dans la roadmap du 2026-08-20 (piste S1, NOTIF-GATE-03), non livré au SHA audité ». Corriger « 21 points d'appel » → 25. Correction ② « refuser si aucune relation (follows, conv_members, event_attendees) » est en contradiction avec le produit : un like, un commentaire ou un follow venant d'un inconnu sur un post public est une notification légitime SANS relation préalable — la bonne exigence est celle de la roadmap (création server-authoritative à partir de l'action canonique : post_likes, follows, post_comments…), pas un contrôle de relation. Correction ① seuil 30/min sur from_id : incompatible avec `_vliveNotifyFollowers` (200 inserts en rafale, échec silencieux) — seuil ≥ 200 ou fan-out serveur. Composer le texte serveur ne doit pas perdre l'échappement du pseudo (piège 41, docs/PIEGES_CONNUS.md) — le rendu « sûr par défaut » (app-08:1804) couvre, à confirmer. Effort « 0,5 à 1 jour » sous-estimé si server-authoritative (roadmap : branche dédiée + tests NOTIF2-01..39 + revue indépendante RLS) ; 2-3 jours plus réaliste. DOUBLONS : SUP-07 (supabase-isolation, P2 — même policy, même absence de trigger, à FUSIONNER en un seul finding P1) ; la partie conv_messages de la correction ① est le sujet de MSG-12 (même domaine) ; PIL-04 (notify-call sans signal) et CONT-08 (rate-limit posts) sont voisins, pas doublons.

### MSG-05 — conv_reads lisible par tout le monde, anonymes compris (identifiants de conversation et horodatages de lecture)

| Champ | Valeur |
|---|---|
| Identifiant | MSG-05 |
| Priorité retenue | **P1** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Accusés de lecture (table conv_reads) |
| Résultat attendu | Seuls les membres d'une conversation lisent l'état de lecture de ses membres. |
| Résultat observé | Policy reads_select USING true, rôle public ; anon détient SELECT → GET /rest/v1/conv_reads avec la clé anon renvoie les 34 lignes (23 user_id distincts) : qui lit quelle conversation et quand ; les conv_id révélés sont aussi les préfixes des dossiers Storage (MSG-03). |
| Reproduction | select policyname, roles, qual from pg_policies where tablename='conv_reads' ; has_table_privilege('anon','public.conv_reads','SELECT') → true. HTTP direct non exécuté (proxy). |
| Preuve | pg_policies conv_reads reads_select ; requête has_table_privilege ; migrations/migration_conv_reads.sql:13 (« Lecture publique » assumée) ; base : 34 lignes / 23 utilisateurs |
| Impact utilisateur et commercial | Fuite de métadonnées sociales (graphe des conversations, activité horodatée) sans compte ; contredit la promesse de messagerie privée. |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | `drop policy reads_select; create policy reads_select on conv_reads for select to authenticated using (is_conv_member(conv_id, auth.uid()::text));` + assertion dans authz-critical.spec.js (tiers → 0 ligne). |
| Risque de régression | faible : supaLoadOtherRead et le realtime conv_reads ne lisent que les conversations dont on est membre. |
| Effort estimé | 30 min + test |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P1). 1) Policy réelle en prod (dump live preuves/supabase-isolation/policies.json) : {"t":"conv_reads","p":"reads_select","cmd":"SELECT","roles":"{public}","qual":"true"} — identique à migrations/migration_conv_reads.sql:13 (`CREATE POLICY "reads_select" ON conv_reads FOR SELECT USING (true)`), dont le commentaire lignes 2-3 annonce « chaque membre voit l'état de lecture des autres » mais n'exprime aucune appartenance : la policy sur-livre par rapport à son intention. 2) Grant anon : resultats/supabase-isolation.json:185 (relacl lu en prod) « anon = arwdDxtm sur toutes les tables public sauf conv_members/conv_messages/conversations (sans INSERT) et user_safety » → conv_reads est bien lisible par anon via PostgREST (aucune policy RESTRICTIVE, RLS PERMISSIVE seule). 3) Données : preuves/supabase-isolation/isolation_par_table.md:21 — 34 lignes, 34 visibles pour uid=NULL (anon) et pour un tiers, 19 conversations privées ; :39 — 27 de ces accusés ont été posés par un non-membre (la policy INSERT n'exige pas l'appartenance). 4) Aggravant vérifié dans le code : js/app-08-ui-modals-tour.js:5043 s'abonne à postgres_changes sur conv_reads sans filtre et conv_reads est dans la publication realtime (fonctions_realtime_storage_staging.md:23) → tout client authentifié reçoit tous les accusés de lecture de tout le monde ; de plus le handler :5045 apparie `x.userId === r.user_id` sans regarder conv_id. 5) Risque de régression du correctif proposé : faible, confirmé — supaLoadOtherRead (app-08:4664) et supaMarkRead (app-08:4652) ne visent que des conversations dont l'appelant est membre ; aucun test e2e ne lit conv_reads (grep tests/e2e → 0 occurrence). 6) Limite : GET REST anon non exécutable ici (preuves/messagerie-notifs/anon-rest-storage-probe.json : 403 proxy « Host not in allowlist ») — la reproduction est une émulation par qual + grant, pas le moteur RLS ; mais avec USING (true) + grant SELECT, aucun autre mécanisme ne peut filtrer. P1 plutôt que P2 : métadonnées d'une messagerie annoncée privée (qui parle avec qui, quand) exposées SANS compte, alimentant is_conv_member (oracle anon) et le listing Storage (MSG-03) ; correctif de 30 min sans régression, à faire avant tout lancement public. git status --short : vide. — Correction de formulation : Le chiffre « 23 user_id distincts » n'apparaît dans aucune preuve déposée (isolation_par_table.md donne 34 lignes / 19 conversations) : le rendre vérifiable par la requête ci-dessus ou le retirer. La preuve « requête has_table_privilege » n'est pas déposée en fichier : citer à la place resultats/supabase-isolation.json:185 (relacl anon = arwdDxtm) et policies.json. Ajouter à l'observé le volet realtime (app-08:5043, table dans la publication : diffusion à tous les clients authentifiés) et l'intégrité (27 accusés posés par des non-membres, policy INSERT sans is_conv_member) — le correctif doit donc aussi durcir reads_upsert/reads_update avec is_conv_member, pas seulement le SELECT. Priorité proposée P1 au lieu de P2.
- **impact** → CONFIRMÉ (priorité proposée P1). Défaut réel, vérifié sur les preuves déposées : preuves/supabase-isolation/policies.json → conv_reads/reads_select cmd=SELECT roles={public} qual=true ; migrations/migration_conv_reads.sql:13 `CREATE POLICY "reads_select" ON conv_reads FOR SELECT USING (true)` ; migrations/SCHEMA_PROD_REFERENCE.sql:595-597 (même policy en prod) et :925 (table dans la publication supabase_realtime, donc chaque accusé de lecture est aussi diffusé à tout abonné). Ce n'est PAS une décision produit : le commentaire de la migration (lignes 1-3) dit « chaque MEMBRE voit l'état de lecture des autres » — l'intention est bornée aux membres, l'implémentation ne l'est pas ; aucun ADR, aucune fiche docs/lots-ui ni CLAUDE.md ne documente une lecture anonyme (grep conv_reads/reads_select dans docs/, .passio/adr/, CLAUDE.md, AGENTS.md : rien). Le code client n'a besoin que des lignes de ses propres conversations : js/app-08-ui-modals-tour.js:4664 (`select…eq("conv_id", convId)`) et :5043-5047 (handler realtime qui ignore toute conv inconnue) → régression faible, comme annoncé. Priorité : P2 est trop basse. Sans compte, n'importe qui sur Internet lit qui converse avec qui et quand (user_id joignable à profiles.username, lisible publiquement — preuves/supabase-isolation/isolation_par_table.md:11), et les conv_id fuités alimentent l'énumération des dossiers Storage attachments/<conv_id>/ de MSG-03 (P1). C'est une rupture d'isolation d'une surface « messagerie privée » exposée au public, donc un critère « avant lancement public » (P1) et l'un des interdits du GO (isolation des comptes non prouvée). Le domaine supabase-isolation a d'ailleurs déjà classé le MÊME défaut P1 (SUP-02) : deux priorités pour un seul défaut, le rapport doit les aligner. Pas P0 : aucun contenu de message ni PII directe exposée, 34 lignes aujourd'hui, correctif de 30 min. git status --short : vide. — Correction de formulation : Priorité : P2 → P1 (aligner avec SUP-02 du domaine supabase-isolation, qui décrit le même défaut, et le rattacher au critère GO « isolation des comptes »). Impact à compléter : (a) la table est dans la publication realtime, donc la fuite est aussi en temps réel pour tout abonné anonyme du canal postgres_changes ; (b) user_id se résout en pseudo via profiles (lecture publique) — ce n'est pas un identifiant opaque en pratique ; (c) « 23 user_id distincts » pour 5 comptes auth = données orphelines/de test, à préciser pour ne pas surestimer le nombre de personnes réelles concernées. Correction à compléter : borner aussi INSERT/UPDATE à l'appartenance (SUP-15) dans la même migration.

### MSG-06 — Suppressions locales (message pour moi, effacer le fil, supprimer la conversation) qui ressuscitent au rechargement serveur

| Champ | Valeur |
|---|---|
| Identifiant | MSG-06 |
| Priorité retenue | **P1** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Suppression de message / de conversation (ADR-008) |
| Résultat attendu | Ce que l'utilisateur a supprimé ne réapparaît pas, ni au redémarrage ni à la réouverture. |
| Résultat observé | Les pierres tombales ADR-008 ne sont consultées que dans la fusion locale (_unionConvsById). `openConversation` réinjecte tout message serveur absent en local ; le boot remet toute conversation serveur ; `_deleteConv` ne pose ni tombstone ni sortie de conv_members ; `_clearConvMessages` vide seulement le tableau local. Émulation : « Supprimer pour moi » puis réouverture → le message est de retour. |
| Reproduction | Émulation S8 : _deleteMsgForMe('c_x','m1') (tombstone posé) → closeConversation() → openConversation('c_x') avec supaLoadMessages renvoyant m1 → present_apres_reouverture:true. Pour la conversation : « Supprimer cette conversation » puis recharger la page avec un compte réel. |
| Preuve | js/app-04-comments-shop.js:3757-3760 (remote.forEach push sans convTombHas), 2253/2294 (seuls usages de convTombHas) ; js/app-09-boot-pwa.js:1233-1243, 1261-1268 ; js/app-08-ui-modals-tour.js:5940-5945 ; preuves/emulation-resultats-2.json S8, capture emul-04-message-supprime-revenu.png ; conv-suppression.spec.js vert (ne couvre que la fusion locale) |
| Impact utilisateur et commercial | Perte de confiance (« j'ai supprimé, ça revient »), impossibilité réelle de retirer un message reçu ou de quitter une conversation 1-1 ; ADR-008 §70 exigeait ce point « avant toute ouverture publique de la messagerie ». |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Filtrer `remote` par convTombHas(_tomb,'msg',id) dans openConversation et par 'conv' dans la fusion du boot ; pour « supprimer la conversation » : poser la tombstone + (1-1) supprimer sa ligne conv_members ou ajouter une table conv_hidden(user_id, conv_id, hidden_at) lue par supaLoadMyConversations ; étendre conv-suppression.spec.js avec un supaLoadMessages stubbé. |
| Risque de régression | faible-moyen : la tombstone a un TTL de 30 j, au-delà un message reviendra sauf suppression serveur — à documenter. |
| Effort estimé | 0,5 jour |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit indépendamment sur le SHA audité (git diff --stat c8cb8e99..HEAD -- js index.html : vide, donc le code lu est bien celui audité). - js/app-04-comments-shop.js:3766-3769 (openConversation) : `remote.forEach(m => { if (!localIds.has(m.id)) messages.push(m); })` — aucun appel à convTombHas ; `grep -n convTombHas js/*.js` ne donne que app-04:2244 (définition), 2253 et 2294, tous dans _unionConvsById (fusion IDB/localStorage au boot). - js/app-04-comments-shop.js:4203-4213 (_deleteMsgForMe) : filtre local + convTombAdd("msg") + saveConversations, rien côté serveur ; le message reste en base et revient à la relecture. - js/app-09-boot-pwa.js:1233-1243 (_clearConvMessages) : `c.messages = []` + save, local seulement ; 1261-1268 (_deleteConv) : filtre conversationsState + saveConversationsNow, sans convTombAdd ni delete conv_members (contraste : leaveGroup app-05:1600-1607 fait les deux). - js/app-08-ui-modals-tour.js:5940-5945 (boot) : `conversationsState = deduplicateConversations([...supaConvs, ...localOnly])` — toute conversation serveur dont on est encore membre est remise, sans consulter le journal « conv ». - Émulation Chromium exécutée (PASSIO_PORT=8120, Supabase stubbé, script preuves/relecture-MSG-06/repro-msg06.js) : {"present_apres_suppression":false,"tombstone_pose":true,"present_apres_reouverture":true,"texte_dans_le_fil_apres_reouverture":true} — identique au S8 de l'auditeur ; le message supprimé « pour moi » est de retour dans l'état ET dans le fil affiché après fermeture/réouverture. - tests/e2e/conv-suppression.spec.js (3 tests) ne couvre que la fusion IDB au redémarrage, jamais openConversation avec rechargement serveur : un vert ne contredit pas le défaut. Priorité P2 justifiée : défaut fonctionnel de confiance (« j'ai supprimé, ça revient »), pas de fuite de données ni de perte, mais ADR-008 en faisait un prérequis d'ouverture publique. — Correction de formulation : Le finding est juste. Deux précisions de formulation : (1) pour « Supprimer cette conversation » en 1-1, la résurrection au boot n'est pas seulement due à l'absence de filtre conv dans app-08:5945 — _deleteConv ne pose même pas de tombstone, donc même la fusion _unionConvsById (qui, elle, respecte « conv ») ne la protégerait pas ; (2) « Effacer tous les messages » (_clearConvMessages) ne pose aucune tombstone « msg » par message, donc les messages reviennent dès la prochaine openConversation, y compris sans redémarrage — cas encore plus immédiat que celui décrit.
- **impact** → CONFIRMÉ (priorité proposée P1). Défaut réel, vérifié dans le code du SHA audité (HEAD f501fb78 n'avance que de commits .passio/) : - js/app-04-comments-shop.js:3769-3772 : `remote.forEach(function(m){ if (!localIds.has(m.id)) messages.push(m); })` — aucun appel à convTombHas ; les seuls usages de convTombHas sont bien app-04:2253 et 2294 (grep), donc uniquement dans `_unionConvsById`. - js/app-09-boot-pwa.js:1237-1239 : `conversationsState = deduplicateConversations([...supaConvs, ...localOnly])` — les conversations serveur sont réinjectées sans filtre « conv » du journal. - js/app-08-ui-modals-tour.js:5940-5946 : `_deleteConv` filtre `conversationsState` et sauvegarde ; ni convTombAdd ni delete sur conv_members (contrairement à `leaveGroup`, app-05:1601-1607, qui fait les deux). Ce n'est PAS une décision produit : .passio/adr/ADR-008 §53 exige que le filtrage soit « en un seul endroit … les deux branches de fusion y passent forcément » — or les fusions serveur (openConversation, boot) ne passent pas par `_unionConvsById`, et `_deleteConv` n'est pas dans les trois points d'appel listés (§53). L'ADR ne documente donc pas cette résurrection comme acceptée ; elle la considère au contraire comme « ce qui détruit la confiance dans une messagerie » (§37). Priorité : P2 (« amélioration importante ») sous-estime. Le projet a lui-même fixé le seuil au §70 : « À traiter avant toute ouverture publique de la messagerie » = définition exacte de P1. Aucun critère d'interdiction du GO grande échelle n'est touché (pas d'isolation de comptes ni de sécurité — le blocage via is_blocked_with existe), donc pas P0. git status --short : vide. — Correction de formulation : Priorité : P1 au lieu de P2 (le déclencheur §70 d'ADR-008 est littéralement « avant toute ouverture publique »). Impact à nuancer : pour un GROUPE, `leaveGroup` supprime bien la ligne conv_members et pose la tombstone (app-05:1601-1607), donc la résurrection au boot ne concerne que les conversations supprimées via le menu Réglages (`_deleteConv`) et les 1-1 ; pour les messages « pour moi », la résurrection touche tout chemin de réouverture. Correction proposée à compléter : filtrer `remote` par convTombHas ne suffit pas durablement — le journal a un TTL de 30 j (ADR §51) alors que le serveur conserve le message « pour moi » indéfiniment, donc il reviendra au 31ᵉ jour ; il faut soit exempter les entrées `msg:` du TTL, soit un marqueur serveur par utilisateur (conv_hidden / message_hidden) lu par supaLoadMessages/supaLoadMyConversations. Effort à réévaluer à 1 jour si l'option serveur (migration + RLS + test prod) est retenue.

### MSG-07 — « Couper les notifications » d'une conversation ne coupe rien (mute placebo)

| Champ | Valeur |
|---|---|
| Identifiant | MSG-07 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Paramètres de conversation — mute |
| Résultat attendu | Une conversation en sourdine ne joue ni son, ni notification locale, ni push. |
| Résultat observé | `_toggleMuteConv` écrit `c._muted` et change le libellé ; aucun autre code ne lit `_muted` : `_handleIncomingConvMessage` joue le son et pousse la notification pour toute conversation fermée. |
| Reproduction | Ouvrir Paramètres d'une conversation → « Couper les notifications » → recevoir un message dans cette conversation (fermée) → son + notification cloche. |
| Preuve | js/app-09-boot-pwa.js:1170-1171, 1222-1230 ; grep `_muted` js/*.js = 4 occurrences (toutes UI) ; js/app-08-ui-modals-tour.js ~4948-4960 (_playMsgSound(), pushNotification() inconditionnels) ; docs/CHECKLIST_COMMERCIALISATION.md l.22 coche « mute » |
| Impact utilisateur et commercial | Fonction annoncée non fonctionnelle ; nuisance pour les groupes actifs ; l'utilisateur coupe toutes les notifications du navigateur à la place. |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Dans _handleIncomingConvMessage : `if (!conv._muted) { _playMsgSound(); pushNotification(...) }` ; persister `_muted` (préfixe _ exclu ?) et le respecter côté push quand MSG-09 sera fait ; test e2e. |
| Risque de régression | nul |
| Effort estimé | 1 h |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit par lecture du code au SHA c8cb8e99 (git show/git grep, aucun diff js/ avec HEAD f501fb7) : - `git grep -n "_muted" c8cb8e99 -- js/ index.html` = exactement 4 occurrences, toutes dans js/app-09-boot-pwa.js : l.1170-1171 (icône/libellé du panneau Paramètres) et l.1226/1229 (`_toggleMuteConv` : `c._muted = !c._muted; saveConversations(); toast(...)`). Aucune LECTURE de `_muted` hors de ce rendu. - js/app-08-ui-modals-tour.js `_handleIncomingConvMessage` (l.4846-4968) : branche `else` (conv fermée, l.~4943-4962) fait `conv.unread++`, puis `_playMsgSound();` et `pushNotification(_msgText, "✉️", r.from_id);` sans aucune condition sur `conv._muted` (ni sur une préférence globale). `_playMsgSound` (app-04 l.4655) joue l'oscillateur inconditionnellement ; `pushNotification` (app-08 l.2038) insère la notif et appelle `renderBell()` inconditionnellement. - docs/CHECKLIST_COMMERCIALISATION.md l.22 coche bien « [x] Paramètres conv (mute, effacer, exporter, supprimer) » : fonctionnalité déclarée livrée. - `git grep -l "_muted\|Couper les notifications" c8cb8e99 -- tests/` = 0 fichier : aucun verrou e2e. - Impact réel borné à la messagerie in-app (son + cloche) ; le push app fermée (sw.js l.62/82) n'est pas concerné par cette conv-level mute mais ne la respecte pas non plus. P2 maintenu : fonction annoncée et non fonctionnelle, sans risque de sécurité ni de perte de données. — Correction de formulation : Dans `correction`, retirer le doute « persister `_muted` (préfixe _ exclu ?) » : le drapeau EST déjà persisté (localStorage + IndexedDB via JSON.stringify sans filtre). Dans `preuve`, préciser les lignes exactes des appels inconditionnels : app-08 l.~4947 (`_playMsgSound()`) et l.~4958 (`pushNotification(...)`), plus l'absence de tout test (`tests/` : 0 occurrence de `_muted`). Le reste du finding (attendu/observé/impact/effort 1 h) est exact.
- **impact** → CONFIRMÉ (priorité proposée P2). Défaut réel, vérifié dans le code du SHA audité : `grep -n "_muted" js/*.js` rend exactement 4 occurrences, toutes dans js/app-09-boot-pwa.js (l.1170-1171 libellé/icône du panneau, l.1226 bascule, l.1229 toast) ; aucun consommateur ailleurs. js/app-08-ui-modals-tour.js:4846-4967 `_handleIncomingConvMessage` : la branche « conversation fermée » (l.4951-4964) appelle `_playMsgSound()` puis `pushNotification(_msgText, "✉️", r.from_id)` sans aucune condition sur `conv._muted`. Aucune ADR, aucune fiche docs/lots-ui ni docs/PIEGES_CONNUS.md ne documente un mute volontairement limité à l'affichage ; au contraire docs/CHECKLIST_COMMERCIALISATION.md l.22 coche « Paramètres conv (mute, …) » comme fonctionnel — c'est donc bien un défaut, pas une décision produit. Aucune suite e2e n'exerce le mute (grep tests/e2e : zéro cas). Priorité : P2 est juste. Le défaut ne touche aucun critère d'interdiction du GO (pas d'isolation de comptes, ni restauration, ni capacité, ni sécurité IRL/modération : l'utilisateur gêné dispose du blocage, qui lui fonctionne côté RLS d'après C01). L'impact est par ailleurs borné : `pushNotification` n'écrit qu'une notification LOCALE dans l'onglet cloche (app-08:2038-2044) et `_playMsgSound` un bip WebAudio ; il n'existe pas de push système pour les messages privés (MSG-09 du même domaine), donc la nuisance n'existe que l'application ouverte. Fonction secondaire annoncée non tenue = « amélioration importante », pas bloquant avant lancement public. — Correction de formulation : Formulation à ajuster : (1) l'« observé » doit préciser que la notification poussée est une notification LOCALE (onglet cloche) et un bip WebAudio, sans push système (MSG-09) — l'impact « nuisance pour les groupes actifs » ne vaut qu'application ouverte ; (2) la question « persister _muted (préfixe _ exclu ?) » est tranchée : saveConversations (app-04:2341/2352) persiste tout en JSON, `_muted` survit déjà au rechargement — retirer le doute de la correction et noter à la place que le réglage est par appareil (conversations hors user_state) ; (3) la preuve « app-08 ~4948-4960 » se situe précisément à app-08:4951-4964 ; (4) ajouter que la CHECKLIST_COMMERCIALISATION.md l.22 est à décocher tant que le correctif et un test e2e n'existent pas.

### MSG-08 — GIF, localisation, réaction et tombstone « pour tous » : verdict d'écriture ignoré

| Champ | Valeur |
|---|---|
| Identifiant | MSG-08 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Envoi de GIF / position / réaction / suppression pour tous |
| Résultat attendu | Comme le texte, le média et le transfert : échec → statut « réessayer » + file de renvoi (invariant maison « toujours lire { error } »). |
| Résultat observé | `_sendGif` et `shareLocation` ne font qu'un _diag et retentent SANS from_id (toujours refusé par la RLS) ; `_sendReaction` et l'insert de tombstone de `_deleteMsgForAll` avalent les deux callbacks. Émulation GIF avec insert refusé : aucun statut, outbox vide, 2 inserts dont un sans from_id. |
| Reproduction | Émulation S6 : __insertReply = {error} ; _sendGif('https://…gif') → {status:'(aucun)', outbox:0, inserts:2, second_insert_sans_from_id:true}. |
| Preuve | js/app-09-boot-pwa.js:665-700, 1027-1050 ; js/app-04-comments-shop.js:4488-4493, 4227-4232 ; preuves/emulation-resultats-2.json S6 |
| Impact utilisateur et commercial | Un GIF/une position/une réaction « envoyés » qui n'existent que sur l'appareil de l'expéditeur et disparaissent au rechargement ; une suppression « pour tous » qui ne parvient pas à l'autre ; une requête gaspillée par échec. |
| Visibilité dans le Centre de pilotage | partiel — seul le chemin média émet tel.flowStart('send_message') ; GIF/position n'émettent rien |
| Détection par la Sentinelle | non |
| Proposition de correction | Router _sendGif et shareLocation par sendMessageToSupabase (qui porte déjà statut/outbox/télémétrie) ; supprimer le repli sans from_id (mort depuis RLS v2) ; lire {error} sur _sendReaction et sur le tombstone, avec toast + outbox. |
| Risque de régression | faible |
| Effort estimé | 1 à 2 h |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Arbre de travail identique au SHA audité pour js/ et index.html (`git diff --stat c8cb8e9 HEAD -- js/ index.html` vide). Relecture des lignes citées : - js/app-09-boot-pwa.js:665-700 `_sendGif` : insert avec from_id, puis sur `res.error` un second insert SANS from_id ; les deux branches ne font que `_diag(...)`, aucun `status`, aucun `_outboxAdd`, catch vide. - js/app-09-boot-pwa.js:1027-1050 `shareLocation` : même schéma, `.catch(function(){})` sur le repli et `.catch(function(err){ // Continuer même en cas d'erreur })`. - js/app-04-comments-shop.js:4488-4493 `_sendReaction` et 4227-4232 tombstone de `_deleteMsgForAll` : `.then(function(){}, function(){})` — les deux callbacks avalent le verdict. - Contraste avec le chemin de référence `sendMessageToSupabase` (app-09:901-980) qui, lui, appelle `_outboxAdd` sur échec et `_outboxRemove` sur succès. - Repli sans from_id « toujours refusé » confirmé par preuves/supabase-isolation/policies.json ligne 40 : `conv_messages_insert_member` WITH CHECK `(from_id = (SELECT auth.uid())::text) AND is_conv_member(...)` — un from_id NULL ne satisfait jamais la condition ; la requête est donc gaspillée à chaque échec. - Preuve d'émulation existante et cohérente : preuves/messagerie-notifs/emulation-resultats-2.json clé `S6_gif_echec_silencieux` = {status:"(aucun)", outbox:0, inserts:2, second_insert_sans_from_id:true}, produite par emul-suite2.js:62-64 (stub `__insertReply={error}`, appel de `_sendGif`). Le défaut est réel, déterministe à la lecture du code et mesuré. P2 est juste : perte silencieuse de contenu secondaire (GIF/position/réaction/suppression pour tous), pas de faille de sécurité. — Correction de formulation : Aucune correction de fond. Précision possible dans « observé » : la suppression serveur elle-même (`supa.from("conv_messages").delete()`, app-04:4227) avale aussi son verdict, pas seulement l'insert du tombstone ; et citer la policy conv_messages_insert_member (WITH CHECK from_id = auth.uid()) comme preuve que le repli sans from_id est mort.
- **impact** → CONFIRMÉ (priorité proposée P2). Défaut réel, vérifié sur le code du SHA audité (git diff --stat c8cb8e99 HEAD -- js/ : vide ; HEAD ne diffère que par des commits de documentation d'audit). - js/app-09-boot-pwa.js:667-700 (_sendGif) et 1028-1047 (shareLocation) : sur res.error, seul un _diag puis un second insert SANS from_id, dont le .catch est vide ; aucun _setMsgStatus, aucun _outboxAdd, aucun flowStart. - js/app-04-comments-shop.js:4488-4493 (_sendReaction) et 4227-4232 (_deleteMsgForAll) : .then(function(){}, function(){}) sur l'insert du tombstone ET sur le .delete() — les deux verdicts sont avalés. - Policy conv_messages_insert_member (preuves/supabase-isolation/policies.json) : WITH CHECK (from_id = auth.uid() AND is_conv_member(...)) → un insert sans from_id est refusé de façon DÉTERMINISTE ; le repli est une requête morte à chaque échec. - Ce n'est PAS une décision produit : le commentaire de sendMessageToSupabase (app-09:942-950) énonce l'invariant « LE VERDICT DE L'ÉCRITURE DOIT ÊTRE VISIBLE » et cite explicitement « GIF, vocaux, documents, position » comme couverts — or _sendGif et shareLocation ne passent pas par ce chemin : survivant d'un correctif partiel. Aucun ADR ni fiche docs/lots-ui ne documente une exception ; aucune suite tests/e2e ne référence _sendGif/shareLocation/_sendReaction/_deleteMsgForAll. - Émulation S6 (preuves/messagerie-notifs/emulation-resultats-2.json) concorde : status "(aucun)", outbox 0, inserts 2, second_insert_sans_from_id true. Priorité : P2 est juste. L'impact ne se matérialise qu'en cas d'échec de l'insert (hors ligne, réseau mobile instable, refus RLS non-membre/bloqué) ; texte, média et transfert — le gros du trafic — sont protégés par la file de renvoi. Aucun critère d'interdiction du GO n'est touché (pas d'isolation, restauration, capacité, sécurité ; le flux send_message reste partiellement visible du pilotage). Ce n'est donc pas un P1 « avant lancement public », mais une amélioration importante à faible effort (1-2 h, faible régression). — Correction de formulation : Deux précisions de formulation : (1) « observé » : dans _deleteMsgForAll, le verdict du .delete() lui-même (app-04:4228) est avalé au même titre que l'insert du tombstone — un « supprimer pour tous » peut échouer sur les DEUX opérations sans que l'utilisateur, qui voit le toast « Message supprimé pour tous » (4235), en soit averti ; (2) « impact » : préciser que la perte n'a lieu QUE lors d'un échec d'écriture (hors ligne, réseau instable, refus RLS) — c'est ce qui justifie P2 et non P1 — et que la « requête gaspillée » est certaine (policy déterministe), pas probable. La visibilité pilotage « partiel » est exacte : seul sendMessageToSupabase émet tel.flowStart('send_message') (app-09:907).

### MSG-09 — Aucune notification push pour un message privé reçu app fermée

| Champ | Valeur |
|---|---|
| Identifiant | MSG-09 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Messagerie — notifications de nouveau message |
| Résultat attendu | Un nouveau message réveille le destinataire (push) comme un appel ou un like. |
| Résultat observé | La seule notification d'un DM est locale (`pushNotification` dans _handleIncomingConvMessage, donc app ouverte) ; aucun `supaInsertNotif(…,'message')` ni appel notify-call à l'envoi ; sw.js sait pourtant afficher un type 'notif'. |
| Reproduction | grep -n 'supaInsertNotif(' js/*.js \| grep message → 0 ; fermer l'app sur un appareil abonné aux push, envoyer un message depuis un autre compte → rien. |
| Preuve | js/app-08-ui-modals-tour.js ~4956-4960 (pushNotification locale) ; notify-call invoqué uniquement app-05:1169 (appels) et app-08:4791 (notifs sociales) |
| Impact utilisateur et commercial | Rétention : la messagerie ne ramène personne dans l'app ; les utilisateurs apprennent les messages avec des heures de retard. |
| Visibilité dans le Centre de pilotage | partiel — la chaîne send_message a une étape « delivered » qui ne peut se confirmer que si l'autre appareil est ouvert |
| Détection par la Sentinelle | non |
| Proposition de correction | Trigger AFTER INSERT sur conv_messages (ou l'Edge Function) → push aux membres (hors expéditeur, hors bloqués, hors conversation en sourdine), TTL court, tag par conversation, cadence (au plus 1 push/conv/minute) ; à faire APRÈS MSG-04 (sinon la forge de push s'étend aux messages). |
| Risque de régression | moyen (coût Web Push, doublons avec la notification locale : ignorer si un client est ouvert) |
| Effort estimé | 1 jour |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Reproduit par inspection du code sur c8cb8e99 (HEAD f501fb78 ne diffère que par des fichiers .passio/, `git diff --stat` : 3 fichiers, 0 en js/). - `grep -n "supaInsertNotif(" js/*.js` : 26 appels, kinds like/comment/mention/follow/event_*/live_video — AUCUN kind « message » ni appel depuis le chemin d'envoi de DM. - Chemin d'envoi texte `_sendTextToSupa` (js/app-04-comments-shop.js:4615-4630) : insert conv_messages puis statut/outbox, rien d'autre ; `sendMessageToSupabase` (js/app-09-boot-pwa.js:901+) : aucun « notif/invoke/push » dans le corps. - Seul émetteur push : `supaInsertNotif` → `supa.functions.invoke("notify-call", {type:"notif"})` (app-08:4776-4797) et l'appel entrant (app-05:1169). Côté serveur, le seul trigger sur conv_messages est `broadcast_conv_message_to_users` (AFTER INSERT → `realtime.broadcast_changes('user:<uid>')`, preuves/supabase-isolation/fonctions_realtime_storage_staging.md:20,26) : diffusion realtime seulement, utile uniquement à un client connecté ; aucun pg_net/webhook dans SCHEMA_PROD_REFERENCE.sql. - Réception : `_handleIncomingConvMessage` (app-08:4956-4964) ne fait qu'une `pushNotification` LOCALE (onglet 🔔) quand la conv n'est pas ouverte — donc app ouverte uniquement. - sw.js:52-62 sait afficher `type:"notif"` (commentaire cite « message… ») mais rien n'émet ce type pour un DM. Test appareil fermé + push réel : NON RÉALISÉ (nécessite deux comptes réels et abonnement push) ; l'inspection suffit car aucun émetteur n'existe. — Correction de formulation : Préciser dans « observé » que la seule exception est la @mention en groupe (push via kind « mention », app-04:4736) ; un DM 1-1 n'a strictement aucun push. Préciser que le trigger serveur `broadcast_conv_message_to_users` existe déjà (AFTER INSERT) et peut servir de point d'accroche à la correction (pg_net → notify-call ou Database Webhook), ce qui réduit l'effort côté client. Reproduction : la ligne « grep … | grep message → 0 » est exacte mais doit exclure « mention ».
- **impact** → CONFIRMÉ (priorité proposée P2). Défaut réel, vérifié sur le SHA audité : `grep -n 'supaInsertNotif(' js/*.js` → 25 appels (like, comment, mention, follow, event_*, live_video), aucun de kind « message » ; `notify-call` n'est invoqué que par app-05:1169 (appels) et app-08:4791 (depuis supaInsertNotif). La réception d'un DM ne produit qu'une notification LOCALE (app-08:4949-4963, `pushNotification(_msgText,"✉️",r.from_id)` dans `_handleIncomingConvMessage`, donc app ouverte et abonnée au realtime). Pourtant la chaîne push existe et sait déjà rendre ce cas : sw.js:52-65 (« Notif sociale (like, follow, commentaire, message…) », type "notif") et notify-call/index.ts:60-64 (payload notif, TTL 3600). Un like réveille donc l'appareil, pas un message — l'incohérence décrite dans « attendu » est exacte. Ce n'est PAS une décision produit de ne pas pousser : docs/PASSIO_NOTIFICATIONS_V2_HEALTHY_REENGAGEMENT_2026-08-20.md classe « nouveau message direct » en Niveau B (l. 303 : « push = activable, recommandé après consentement ») et §10 (l. 587-613) prescrit la push « Nouveau message de Nina » sans texte sur l'écran verrouillé, non agrégée (l. 745). C'est une fonctionnalité PLANIFIÉE non livrée, aucune ADR ni fiche docs/lots-ui ne l'écarte. Priorité : P2 tient. Aucun critère d'interdiction du GO grande échelle n'est touché (ni sécurité, ni isolation, ni restauration, ni capacité). L'utilisateur garde le badge non-lus (renderMsgBadge) et la notif in-app ; c'est un manque de rétention/attente de marché, pas une fonction cassée ni une fuite. Passer en P1 ne se justifie pas d'autant que la correction DOIT suivre MSG-04 (P1) : ajouter la push DM sur le notify-call actuel (texte et toUserId fournis par le client, aucune relation vérifiée, aucun rate-limit sur conv_messages) étendrait la surface de forge — l'ordre « MSG-04 puis MSG-09 » indiqué par l'auditeur est le bon. — Correction de formulation : Formulation à préciser : (1) qualifier le défaut de « fonctionnalité prévue non livrée » en citant docs/PASSIO_NOTIFICATIONS_V2_HEALTHY_REENGAGEMENT_2026-08-20.md (Niveau B, §10) plutôt que d'un comportement anormal sans référentiel ; (2) le correctif doit reprendre les contraintes de ce document : push « Nouveau message de <pseudo> » SANS le texte du DM (aperçu seulement sur préférence explicite), aucune push si `is_blocked_with`, consentement/opt-in par catégorie, non agrégée ; (3) rappeler que sur iOS la push n'existe que pour la PWA installée (docs/PIEGES_CONNUS.md l. 79) — l'impact « rétention » est donc partiel sur iPhone même après correction ; (4) attendu : « comme un like ou un appel » est juste (ces deux-là poussent via notify-call), à conserver.

### MSG-10 — Un compte bloqué déjà membre peut encore écrire, et ses messages reviennent au rechargement

| Champ | Valeur |
|---|---|
| Identifiant | MSG-10 |
| Priorité retenue | **P1** (proposée par l'auditeur : P2) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Blocage × messagerie |
| Résultat attendu | Après blocage, l'autre ne peut plus rien m'écrire et je ne vois plus rien de lui. |
| Résultat observé | `conv_messages_insert_member` n'inclut pas is_blocked_with (présent seulement sur conv_members INSERT) ; le realtime filtre côté client, mais openConversation réinjecte les messages serveur sans filtre ; la conversation 1-1 est masquée dans la liste, pas les messages d'un bloqué dans un groupe commun. |
| Reproduction | A bloque B (blocks) ; B, membre d'une conversation existante avec A, insère un message → accepté par la RLS ; A ouvre le groupe → message visible. |
| Preuve | pg_policies conv_messages_insert_member ; pg_get_functiondef is_blocked_with ; js/app-08-ui-modals-tour.js:4849 (filtre realtime) vs js/app-04-comments-shop.js:3757-3760 (aucun filtre) ; app-04:3410 (liste 1-1 seulement) |
| Impact utilisateur et commercial | Le blocage ne protège pas contre le harcèlement dans les conversations existantes (attente première d'un outil de modération). |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Policy INSERT conv_messages : `AND NOT EXISTS (select 1 from conv_members m where m.conv_id = conv_id and is_blocked_with(m.user_id))` (ou, en groupe, filtrer à l'affichage) ; côté client filtrer `remote` par isBlocked(m.from) dans openConversation et supaLoadMyConversations. |
| Risque de régression | faible |
| Effort estimé | 0,5 jour (policy + test authz) |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P2). Vérifié sur le SHA audité c8cb8e99 (HEAD f501fb7 ne diffère que par .passio/ orchestrateur ; git status vide en fin de travail). 1) Policy INSERT : preuves/supabase-isolation/policies.json (dump pg_policies prod du 2026-09-04) → conv_messages_insert_member, roles {authenticated}, check = "(from_id = auth.uid()::text) AND is_conv_member(conv_id, auth.uid()::text)" — AUCUN appel à is_blocked_with. Seule conv_members « Ecriture propre » (INSERT) porte "AND (NOT is_blocked_with(user_id))". Cohérent avec migrations/migration_ts_serveur_age_blocage.sql:110-126 et 250-263 (la fonction n'est ajoutée qu'à conv_members). is_conv_member (fonctions_realtime_storage_staging.md:9) est un pur test d'appartenance, sans notion de blocage. Donc un membre déjà présent, bloqué après coup, peut toujours insérer (RLS acceptée). 2) Client : js/app-08-ui-modals-tour.js:4849 filtre bien isBlocked(r.from_id) sur le realtime, et :5095 refuse l'ingestion d'une NOUVELLE conv 1-1 avec un bloqué. Mais js/app-04-comments-shop.js:3578-3800 (openConversation, fusion `remote` lignes 3743-3775) ne contient aucune occurrence d'isBlocked (grep = 0) : les messages serveur d'un bloqué sont réinjectés dans c2.messages et rendus. supaLoadMessages (app-08:4560) et supaLoadMyConversations (app-08:4678) ne filtrent pas non plus. 3) Liste : app-04:3411 masque uniquement les conversations dont c.userId est bloqué (1-1) ; un groupe commun reste visible avec les messages du bloqué. blockUser (app-04:3314) ne quitte ni ne purge aucune conversation. Le finding est exact sur ses trois points (RLS, réinjection, portée 1-1 seulement). Preuve exécutée non réalisée (pas de comptes réels ici), mais le dump prod des policies + le code suffisent : le chemin d'écriture n'a aucune garde de blocage. — Correction de formulation : Formulation exacte. Précision utile : la ligne citée « app-04:3757-3760 » correspond en fait au bloc de fusion 3743-3775 (remoteMap/remote.forEach) ; et la correction proposée doit viser la policy avec l'alias de table (`m.conv_id = conv_messages.conv_id`) pour éviter l'auto-référence ambiguë `m.conv_id = conv_id`. Le contrôle authz-critical.spec.js ne couvre pas ce cas (aucune assertion « bloqué écrit dans une conv existante »), ce qui justifie l'ajout d'un test authz.
- **impact** → CONFIRMÉ (priorité proposée P1). Défaut réel, vérifié sur les preuves déposées et le code (aucune décision produit ne le documente comme voulu) : - preuves/supabase-isolation/policies.json : `conv_messages_insert_member` WITH CHECK = `from_id = auth.uid() AND is_conv_member(conv_id, auth.uid())` — aucune référence à `is_blocked_with`, alors que conv_members INSERT (« Ecriture propre ») la porte. migrations/migration_ts_serveur_age_blocage.sql:286-292 confirme que la policy messages a été réécrite SANS la clause, dans une migration dont l'en-tête (ligne 2) promet un « blocage bidirectionnel ». - js/app-08-ui-modals-tour.js:4849 filtre `isBlocked(r.from_id)` sur le canal realtime seulement ; js/app-04-comments-shop.js:3757-3764 (`openConversation`) remplace les messages locaux par ceux de `supaLoadMessages` sans aucun filtre ; js/app-04-comments-shop.js:3411 masque uniquement la conversation 1-1 (`isBlocked(c.userId)`), rien pour les messages d'un bloqué dans un groupe. - docs/PIEGES_CONNUS.md:37 énumère les surfaces couvertes par `isBlocked` : « messages entrants (`_handleIncomingConvMessage`) » — la garantie écrite ne couvre ni le rechargement serveur ni les groupes ; la fiche elle-même rappelle que « la garantie était écrite, pas tenue » pour les stories : même famille de défaut. - Aucune ADR, aucune fiche docs/lots-ui, aucun texte de KNOWN_RISKS ne déclare « un bloqué déjà membre continue d'écrire » comme comportement attendu ; KNOWN_RISKS.md:21 ne documente comme choix assumé que la lecture publique de follows/event_attendees. Priorité : P2 sous-estime. Les critères d'interdiction du GO grande échelle nomment explicitement « sécurité IRL ou modération insuffisante ». Le blocage est le SEUL outil d'auto-protection de l'utilisateur, et le cas typique du harcèlement est précisément une conversation DÉJÀ existante (on bloque quelqu'un à qui on a parlé). Le cas le plus exposé est IRL : les discussions d'événement (`evgrp_<eventId>`, PIEGES_CONNUS.md:66 ③) sont des groupes où `can_join_event_conversation` ne teste `is_blocked_with` que contre l'AUTEUR de l'événement (migration ligne 229), donc un participant bloqué reste membre et ses messages sont acceptés par la RLS puis affichés à la victime à chaque ouverture. Ni le pilotage ni la Sentinelle ne le voient (finding), et aucune suite e2e n'exerce « bloqué → message dans conv existante » (tests/e2e/stories-blocage.spec.js, irl-trust-safety.spec.js ne couvrent pas conv_messages). Un mécanisme de blocage qui ne bloque pas est aussi un point d'attention des revues de stores (mécanisme de blocage exigé pour le contenu généré par les utilisateurs). Cela doit être corrigé AVANT lancement public : P1. Pas P0 : la conversation 1-1 est masquée de la liste et le realtime est filtré, donc l'exposition immédiate est bornée aux groupes et au rechargement ; effort 0,5 j, risque faible. — Correction de formulation : Priorité P2 → P1 (critère GO « modération insuffisante » ; blocage = seul outil d'auto-protection ; cas IRL des discussions d'événement). Compléter « observé » : `can_join_event_conversation` ne teste `is_blocked_with` que contre l'auteur de l'événement (migration_ts_serveur_age_blocage.sql:229), donc dans les groupes d'événement le bloqué entre ET écrit légitimement pour la RLS ; la preuve « pg_policies » doit citer preuves/supabase-isolation/policies.json (entrée conv_messages_insert_member) et migrations/migration_ts_serveur_age_blocage.sql:286-292 (la clause manque dès l'écriture de la migration, pas par dérive). Préciser l'impact : exposition bornée en 1-1 (liste masquée app-04:3411, realtime filtré app-08:4849) mais entière en groupe et à chaque rechargement (app-04:3757-3764). Ajouter au « proposition de correction » : étendre `can_join_event_conversation` ou la policy INSERT conv_messages à TOUS les membres (`NOT EXISTS (SELECT 1 FROM conv_members m WHERE m.conv_id = conv_messages.conv_id AND is_blocked_with(m.user_id))` — qualifier `conv_id` pour éviter l'auto-référence), filtrer `remote` par `isBlocked(m.from)` dans `openConversation`, et un cas authz-critical dédié (aucune suite ne couvre ce chemin aujourd'hui). Effort 0,5 j confirmé ; noter que `is_blocked_with` est SECURITY DEFINER et révèle à B qu'il est bloqué (déjà le cas via conv_members).

### MSG-11 — File de renvoi sans borne : un message refusé définitivement est renvoyé à chaque démarrage, pour toujours

| Champ | Valeur |
|---|---|
| Identifiant | MSG-11 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Outbox messagerie |
| Résultat attendu | Un renvoi borné (essais/TTL) puis un abandon explicite, comme la file des commentaires (stop à 8). |
| Résultat observé | Entrées {convId,msgId,content,at} sans compteur ; _flushOutbox renvoie tout à chaque boot (1,5 s) et à chaque événement online. Émulation : 3 flush → 3 inserts refusés, l'entrée reste. |
| Reproduction | Émulation S3b (insert refusé RLS) → {outbox:[{msgId, sans attempts}], inserts_supplementaires_apres_3_flush:3}. |
| Preuve | js/app-04-comments-shop.js:4583-4590, 4644-4651 ; js/app-08-ui-modals-tour.js:5956 ; preuves/emulation-resultats.json S3b |
| Impact utilisateur et commercial | Requêtes refusées répétées (membre retiré d'un groupe : une par message, à vie) ; message « réessayer » éternel. |
| Visibilité dans le Centre de pilotage | partiel — les 4xx PostgREST sont comptés par le hook fetch |
| Détection par la Sentinelle | non |
| Proposition de correction | Ajouter attempts/lastError, abandonner après 8 essais ou 7 jours avec un statut « non envoyé » distinct et un toast ; purger l'entrée quand le refus est une RLS (42501). |
| Risque de régression | nul |
| Effort estimé | 1 h |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). SHA : js/ identique entre c8cb8e99 et HEAD (git diff --stat vide). Inspection : js/app-04-comments-shop.js:4583-4587 `_outboxAdd` pousse `{convId,msgId,content,at:Date.now()}` — aucun compteur, et `at` est RÉINITIALISÉ à chaque ré-ajout (l'entrée est filtrée puis repoussée), donc même une borne d'âge serait impossible à calculer ; :4625 et :4628 tout refus (`res.error` ou rejet) fait `_outboxAdd` sans distinction du code d'erreur ; :4644-4649 `_flushOutbox` rejoue TOUTES les entrées sans condition ; :4651 rejoué à chaque `online` ; js/app-08-ui-modals-tour.js:5956 `setTimeout(_flushOutbox,1500)` à chaque boot. Contraste avec les deux autres files du même fichier : commentaires `if ((op.tries||0) >= 8) continue;` (:504) et suppressions `_DEL_OB_MAX_TRIES` (:137,:150). Preuve d'exécution relue : preuves/messagerie-notifs/emulation-resultats.json S3b → `outbox:[{msgId, at_age_ms:506}]` (attempts absent) et `inserts_supplementaires_apres_3_flush: 3`, produit par scratchpad/emul-messagerie.js:83-88 (insert stubbé en refus RLS, 3 flush). Aucune purge de `passio_outbox_v1` ailleurs : la clé n'est référencée que dans app-04 et n'est pas dans `ACCOUNT_SCOPED_KEYS` (app-02:2711). git status --short : 0 ligne. — Correction de formulation : Formulation exacte. Deux précisions à ajouter : (1) `at` est remis à Date.now() à chaque ré-ajout (:4585), donc la correction proposée « abandonner après 7 jours » exige de conserver le `at` d'origine lors du ré-ajout ; (2) la clé n'est pas purgée par `purgeAccountScopedData` → l'ajouter à ACCOUNT_SCOPED_KEYS ou marquer chaque entrée par uid (comme `_delObAdd` :88) pour ne pas rejouer les messages d'un compte quitté.

### MSG-12 — Aucune borne de taille ni de cadence sur conv_messages (100 Ko accepté, 50 envois en 4 ms)

| Champ | Valeur |
|---|---|
| Identifiant | MSG-12 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Envoi de message |
| Résultat attendu | Longueur maximale raisonnable (ex. 4 000 caractères) et cadence bornée côté serveur. |
| Résultat observé | textarea sans maxlength, colonne content text sans CHECK, aucun trigger rate_limit sur conv_messages ; chaque ligne est rediffusée par le trigger broadcast à chaque membre. |
| Reproduction | Émulation S4 : insert_100ko_len 102 493 ; 50 inserts en 4 ms. |
| Preuve | index.html:1452 ; pg_trigger (seul broadcast_conv_message_users_trigger) ; preuves/emulation-resultats-2.json S4 |
| Impact utilisateur et commercial | Flood d'une conversation ou d'un groupe, coût realtime/egress, gel du rendu chez les destinataires (le rendu de 50 messages de 100 Ko a fait expirer l'émulation). |
| Visibilité dans le Centre de pilotage | partiel — volume de messages visible dans store.js, pas d'alerte |
| Détection par la Sentinelle | non |
| Proposition de correction | maxlength=4000 + garde dans sendMessageFp ; `alter table conv_messages add constraint content_len check (length(content) <= 8000)` ; trigger rate_limit_insert('from_id', 60) (voir MSG-04). |
| Risque de régression | faible (les messages média JSON restent < 1 Ko) |
| Effort estimé | 1 h |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). SHA : index.html, js/ et migrations/ identiques entre c8cb8e99 et HEAD (git diff --stat vide).  1) index.html:1452 : `<textarea id="convFpInput" rows="1" placeholder="Message…" …>` sans `maxlength` (les seuls maxlength du fichier sont #userName:329 et #postText:786).  2) js/app-04-comments-shop.js:4529-4537 (`sendMessageFp`) : `var txt = (inp.value || "").trim();` — aucun test de longueur, aucune troncature.  3) Schéma prod : migrations/SCHEMA_PROD_REFERENCE.sql:103-108 et preuves/supabase-isolation/ref_cols.txt → `content:text` sans CHECK ; policy INSERT réelle (policies.json, `conv_messages_insert_member`) : `from_id = auth.uid() AND is_conv_member(conv_id, …)`, aucune borne de longueur.  4) Triggers : SCHEMA_PROD_REFERENCE.sql:896 et fonctions_realtime_storage_staging.md:20 → conv_messages ne porte que `broadcast_conv_message_users_trigger` (AFTER INSERT) ; `trg_rate_limit` n'est posé que sur comment_interactions/event_reactions/reports.  5) Preuve d'émulation relue : emul-suite2.js:56 et emulation-resultats-2.json S4 (`maxlength_attr: null, insert_100ko_len: 102493, inserts_rafale: 50, ms_rafale: 4`) — mesure client à Supabase stubbé, cohérente avec le code. Le défaut est réel, l'impact reste modeste (5 comptes, membres de la conversation seulement) → P3 maintenu. — Correction de formulation : Reformuler « 100 Ko accepté » : l'acceptation serveur n'a PAS été mesurée en production — l'émulation était à Supabase stubbé (emul-suite2.js:56) ; ce qui est PROUVÉ est l'absence de toute borne cliente (index.html:1452, app-04:4537) et, PAR INSPECTION (schéma de référence, policies.json, liste des triggers), l'absence de CHECK et de rate_limit côté base. Préciser aussi que le flood n'atteint que les membres de la conversation (is_conv_member dans la policy INSERT), ce qui justifie P3 et non P2.

### MSG-13 — 113 conversations orphelines en base et aucune policy UPDATE/DELETE sur conversations (nettoyage et description de groupe échouent en silence)

| Champ | Valeur |
|---|---|
| Identifiant | MSG-13 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Table conversations — hygiène et RLS |
| Résultat attendu | Une conversation sans membre n'existe pas ; le créateur peut la supprimer/modifier. |
| Résultat observé | 113/117 conversations n'ont ni membre ni message (103 créateurs distincts, 100 comptes disparus : résidus des purges e2e qui laissent conversations) ; conversations n'a que INSERT+SELECT → `supaCreateConversation` (nettoyage sur échec) et `editGroupDescription` touchent 0 ligne sans erreur. |
| Reproduction | select count(*) from conversations c where not exists (select 1 from conv_members m where m.conv_id=c.id) → 113 ; select cmd from pg_policies where tablename='conversations' → INSERT, SELECT. |
| Preuve | requêtes base (117 conv, 7 conv_members, 113 orphelines, 0 sans created_by) ; js/app-08-ui-modals-tour.js:4517-4518 ; js/app-05-config-profil.js:1624 |
| Impact utilisateur et commercial | Dette de données (croît à chaque purge e2e), description de groupe jamais synchronisée entre appareils/membres. |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Policies `conversations_update_creator` / `conversations_delete_creator` (created_by = auth.uid()) ; purge des orphelines dans purge:e2e:rest ; lire {error} dans editGroupDescription. |
| Risque de régression | faible |
| Effort estimé | 1 h |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). Reproduit sur le SHA audité (HEAD f501fb7 = c8cb8e9 + 2 commits .passio/ de l'orchestrateur, git status --short vide en fin). 1) RLS : preuves/supabase-isolation/policies.json ne contient que DEUX policies pour t='conversations' — conversations_insert_creator (INSERT, check created_by = auth.uid()) et conversations_select_member (SELECT, is_conv_member) ; 'conversations' figure explicitement dans tables_sans_policy_update ET tables_sans_policy_delete. Aucun fichier de migrations/ ne crée de policy UPDATE/DELETE sur conversations (grep 'on conversations|on public.conversations' : uniquement SELECT/INSERT). 2) Orphelines : preuves/supabase-isolation/isolation_par_table.md:18 (117 conv) et :39 « 113 conversations sur 117 n'ont AUCUN membre ; conv_members = 7 lignes » — comptage indépendant du domaine supabase-isolation, concordant avec le finding. 3) Code : js/app-08-ui-modals-tour.js:4517-4518 = delete conv_members puis delete conversations dans try/catch sans lecture de {error} → sans policy DELETE, 0 ligne, conversation orpheline restante ; js/app-05-config-profil.js:1624 = supa.from("conversations").update({description}).then(function(){}, function(){}) → erreurs/0 ligne avalées, description jamais synchronisée. La colonne description existe bien (ref_cols.txt:17). 4) scripts/purge-e2e-rest.js:43-45 purge conv_messages/conv_reads/conv_members mais JAMAIS la table conversations (purge_e2e_accounts.sql idem) → la dette croît à chaque purge, comme affirmé. P3 justifié : dette de données et fonction de groupe non synchronisée, sans fuite ni perte. — Correction de formulation : Aucune correction de fond. Précision utile : les lignes de nettoyage citées (app-08:4517-4518) tournent avec la session de l'utilisateur, donc le DELETE de conversations est refusé par RLS (0 ligne, aucune exception), et purge-e2e-rest.js (service_role) n'est pas concerné par RLS mais omet simplement la table conversations de sa liste — deux causes distinctes pour les orphelines, à mentionner séparément dans la correction (policy DELETE créateur + ajout de conversations dans la purge, filtrée sur created_by).

### MSG-14 — Photo de groupe locale seulement, et base64 des médias envoyés conservé dans l'état local

| Champ | Valeur |
|---|---|
| Identifiant | MSG-14 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Groupes (photo) / stockage local des conversations |
| Résultat attendu | La photo de groupe est partagée avec les membres ; l'état local ne garde que des URLs après upload. |
| Résultat observé | `c.groupPhoto` = data URL en localStorage/IDB, aucune colonne serveur → invisible aux autres membres et appareils ; `msg.img`/`msg.voiceData` restent en base64 localement après upload (émulation : local_img_is_dataurl true, 108 Ko de localStorage pour une image 1 px) → le quota localStorage (~5 Mo) est atteint avec une seule vidéo (max prod 6,2 Mo), l'écriture échoue en silence et seul IndexedDB survit. |
| Reproduction | Émulation S2/S10 ; envoyer une vidéo de 6 Mo puis lire localStorage.getItem('passio_conversations_v1') → null ou périmé. |
| Preuve | js/app-05-config-profil.js:1473 ; js/app-09-boot-pwa.js:830-836, 1575 ; js/app-04-comments-shop.js:2341 (catch vide) ; preuves/emulation-resultats.json S2, -2.json S10 |
| Impact utilisateur et commercial | Groupe sans identité visuelle partagée ; accumulation locale (lenteur de saveConversations, perte du cache sync). |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Colonne conversations.photo_url + upload dans content/<uid>/ ; après upload réussi, remplacer msg.img/voiceData local par l'URL Storage ; borner la taille des data URL conservées. |
| Risque de régression | faible |
| Effort estimé | 0,5 jour |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). Reproduit par inspection du code sur l'arbre audité (git diff c8cb8e99..HEAD sur js/ et index.html : vide). (1) Photo de groupe : js/app-05-config-profil.js:1473 `c.groupPhoto = ev.target.result;` (data URL du FileReader) puis `saveConversations()` — aucun appel Supabase ; le rendu (app-04:3511-3615, app-05:1408-1410) ne lit que `c.groupPhoto`. Preuve base déjà déposée : preuves/supabase-isolation/ref_cols.txt ligne 17, table `conversations` = id, is_group, group_name, passion_id, created_by, created_at, description — aucune colonne photo. Donc invisible aux autres membres/appareils : confirmé. (2) Base64 conservé localement après upload : js/app-09-boot-pwa.js:834/837/841 posent `msg.video|img|voiceData = dataUrl`, `c.messages.push(msg)` + `saveConversations()` (l.853-856) ; après `supa.storage.upload` réussi (l.875-887) seul `sendMessageToSupabase(msgId, convId, storageUrl…)` est appelé, qui ne fait qu'un `conv_messages.insert` — aucune réécriture du message local (grep `\.img = |\.video = |\.voiceData = ` : seuls app-09:834-841 et app-04:4320-4336). Même chose pour les vocaux (app-09:1576-1601). Et à la relecture serveur, `applyMsgContentData` (app-04:4319 `d.type === "media" && !m.img && !m.video`, 4322 `!m.voiceData`) GARDE explicitement la data URL locale au lieu de la remplacer par l'URL Storage. (3) Quota : `saveConversations` app-04:2341 `try { localStorage.setItem(...) } catch(e) {}` — échec silencieux, IDB seul survivant ; seules les IMAGES sont compressées (app-09:787-793 `passioCompressImage`), une vidéo part en base64 intégral (6 Mo → ~8 Mo de JSON > quota ~5 Mo, arithmétique). (4) Émulation S2 (preuves/messagerie-notifs/emulation-resultats.json) : `local_img_is_dataurl: true`, `db_has_base64: false`, `img_src_rendu: data:image/jpeg;base64,…` après upload réussi — cohérent. — Correction de formulation : La mention « 108 Ko de localStorage pour une image 1 px » est une mauvaise lecture des preuves : les 108 195 octets viennent de S10_badge_idb (emulation-resultats-2.json, `ls_bytes`), mesurés APRÈS S4 (un message texte de 102 493 caractères + rafale de 50), pas après l'image 1 px de S2 (761 octets uploadés, suite 1). Remplacer par : « émulation S2 : après upload Storage réussi, `msg.img` local reste une data URL (local_img_is_dataurl true, img_src_rendu = data:image/jpeg;base64…) ». Ajouter à la preuve app-04:4319-4322 (`applyMsgContentData` conserve la data URL locale à la relecture serveur, donc le base64 n'est jamais remplacé) et préciser que seules les images sont compressées (app-09:787-793), les vidéos et vocaux partant/restant en base64 intégral. Le chiffre « max prod 6,2 Mo » reste à sourcer (requête ci-contre). Priorité P3 maintenue : perte du cache localStorage sans perte de données (IDB), et photo de groupe = manque fonctionnel non bloquant.

### MSG-15 — Surfaces realtime/RPC mineures : indicateur de frappe usurpable, is_conv_member exécutable par anon, policy realtime en double

| Champ | Valeur |
|---|---|
| Identifiant | MSG-15 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | PLAUSIBLE |
| Fonctionnalité | Realtime et fonctions RLS |
| Résultat attendu | Canaux d'état privés ; fonctions helpers non exposées aux anonymes ; une policy par topic. |
| Résultat observé | typing:<convId> est un canal public (payload.user affiché via textContent, pas de XSS) ; is_conv_member est SECURITY DEFINER avec EXECUTE pour anon (oracle « X est-il membre de Y ? » via /rest/v1/rpc) ; realtime.messages porte deux policies identiques ('recoit'/'reçoit'). |
| Reproduction | pg_proc has_function_privilege('anon','is_conv_member(text,text)','EXECUTE') = true ; select policyname from pg_policies where schemaname='realtime' → 2 lignes. |
| Preuve | requêtes base ; js/app-04-comments-shop.js:4755 ; advisors sécurité (SECURITY DEFINER exécutables par anon ×4) |
| Impact utilisateur et commercial | Faible : nuisance (faux « est en train d'écrire »), sondage d'appartenance avec des ids connus. |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | revoke execute on function is_conv_member from anon (les policies s'exécutent en definer) ; canal typing en private avec la policy 'conv:' ; drop de la policy en double. |
| Risque de régression | faible (vérifier que storage_chemin_autorise, non definer, garde l'accès à is_conv_member pour authenticated) |
| Effort estimé | 1 h |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). Trois affirmations, trois vérifications indépendantes sur le SHA c8cb8e99 (HEAD f501fb78 ne diffère que par 3 fichiers .passio/, `git diff --stat` vérifié ; git status vide). 1) Canal typing public : js/app-04-comments-shop.js:4755 `supa.channel("typing:" + convId)` SANS `{ config: { private: true } }` (les seuls canaux privés du dépôt sont app-08-ui-modals-tour.js:4977 `conv:` et :4992 `user:`). L'émetteur choisit `payload.user` (app-04:4742, `currentProfile()?.name || state.user.name`), le récepteur l'écrit par `bar.textContent` (app-04:4758) → usurpation possible, pas de XSS. Inspection code, conforme au finding. 2) is_conv_member SECURITY DEFINER exécutable par anon : preuves/supabase-isolation/fonctions_realtime_storage_staging.md:9 (« is_conv_member | oui [secdef] | anon, authenticated | oracle d'appartenance ») et :43 (RPC anon) ; resultats/supabase-isolation.json:150 (pg_proc, EXECUTE anon+authenticated) ; faits orchestrateur (advisors : SECURITY DEFINER exécutables par anon ×4 dont is_conv_member) ; origine dans migrations/migration_rls_private_dms_stories.sql:22 (`grant execute … to anon, authenticated`). La migration corrective migrations/migration_fonctions_rls_hors_schema_expose.sql est explicitement « NON APPLIQUÉE » (l.6). 3) Policy realtime en double : preuves/supabase-isolation/policies.json (dump pg_policies prod du 2026-09-04) contient deux lignes realtime.messages SELECT {authenticated} « Utilisateur recoit ses messages » et « Utilisateur reçoit ses messages », qual strictement identique `(realtime.topic() = ('user:' || (auth.uid())::text))` ; policies_liste_live.txt:108-109 et policies_dupliquees le corroborent. Le défaut est réel ; l'impact reste faible (nuisance, oracle structurel sans contenu, doublon inoffensif) → P3 maintenu. Doublon SUP-05 pour le volet oracle. — Correction de formulation : La formulation attendu/observé/preuve/impact/effort est juste. En revanche la PROPOSITION DE CORRECTION est erronée sur un point : « revoke execute on function is_conv_member from anon (les policies s'exécutent en definer) » — faux. SECURITY DEFINER ne concerne que le corps de la fonction ; l'expression d'une policy est évaluée avec le rôle APPELANT, qui doit détenir EXECUTE sur les fonctions qu'elle appelle. Or conv_members_select_member, conv_messages_select_member et conversations_select_member sont déclarées pour {public} (policies.json) : un SELECT anon sur ces tables lèverait « permission denied for function is_conv_member » au lieu de rendre 0 ligne, et storage_chemin_autorise (INVOKER, grant anon) appelle aussi public.is_conv_member. Le remède documenté par le dépôt lui-même est migrations/migration_fonctions_rls_hors_schema_expose.sql (déplacer la fonction dans un schéma non exposé par PostgREST, `passio_private`, en gardant EXECUTE pour anon/authenticated) — à substituer au revoke. Le risque de régression passe donc de « faible » à « moyen si revoke » / « faible si déplacement de schéma ». Le reste (canal typing en private + policy `conv:`, drop du doublon) tient.

### MSG-16 — Chargement intégral des messages d'une conversation à chaque ouverture (pas de pagination serveur)

| Champ | Valeur |
|---|---|
| Identifiant | MSG-16 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | CONFIRMÉ par la relecture |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Ouverture d'une conversation |
| Résultat attendu | Charger une fenêtre (ex. 40 derniers) puis paginer par curseur created_at. |
| Résultat observé | supaLoadMessages fait select … order created_at sans limit (« Charge TOUS les messages sans limite ») ; la pagination 40/page n'est que côté rendu. |
| Reproduction | Lire js/app-08-ui-modals-tour.js:4561-4569. |
| Preuve | app-08:4561-4569 ; index idx_conv_messages_conv (conv_id, created_at desc) présent ; docs/CHECKLIST_COMMERCIALISATION.md l.50 « pagination … messages » (côté client seulement) |
| Impact utilisateur et commercial | Coût croissant par conversation (egress, temps d'ouverture) dès quelques milliers de messages ; capacité non prouvée au-delà de 68 messages en base. |
| Visibilité dans le Centre de pilotage | partiel (latence API dans le dashboard) |
| Détection par la Sentinelle | non |
| Proposition de correction | .limit(80) + chargement des plus anciens sur _loadMoreMsgs avec .lt('created_at', plusAncien). |
| Risque de régression | moyen (rejeu des événements de contrôle react/del qui visent des messages hors fenêtre) |
| Effort estimé | 0,5 jour |

Relecture (angles indépendants) :

- **reproduction** → CONFIRMÉ (priorité proposée P3). Reproduit par inspection du code sur le SHA audité (git diff c8cb8e99..HEAD ne touche que .passio/, aucun fichier js/). js/app-08-ui-modals-tour.js:4560-4569 : `supaLoadMessages` fait `.from("conv_messages").select(...).eq("conv_id", convId).order("created_at", {ascending:true})` sans `.limit()` ni `.range()` — le commentaire l.4561 dit explicitement « Charge TOUS les messages sans limite ». Les seuls `.range/.limit` d'app-08 (l.3627 posts, 3662 commentaires, 4033 stories, 4180 events) ne concernent pas les messages. Appelée à chaque ouverture : js/app-04-comments-shop.js:3745 (`var supaMessages = await supaLoadMessages(convId)`) et app-08:5124 (realtime v2). La pagination par 40 est purement côté rendu : app-04:3795-3800 (`CONV_PAGE = 40`, `allMsgs.slice(_startIdx)` sur `c.messages` déjà entièrement chargés), scroll infini app-04:4068-4072. docs/CHECKLIST_COMMERCIALISATION.md l.50 coche « pagination fil + messages + conversations » : exact pour le rendu, trompeur pour le réseau. L'index cité (`idx_conv_messages_conv`) n'existe dans les preuves déposées que via migrations/migration_scale_indexes_2.sql l.10-14 et migration_scale_v3.sql l.17, pas via un dump prod ; ce point est secondaire et n'infirme pas le défaut. Impact réel aujourd'hui négligeable (68 conv_messages en base) : P3 maintenu. git status --short vide. — Correction de formulation : Formulation juste sur attendu/observé/preuve/impact/effort. Deux précisions : (1) la présence de l'index `idx_conv_messages_conv` en prod n'est attestée que par les fichiers migrations/ (dont 60 non enregistrés côté Supabase, divergence R3), pas par une preuve prod — écrire « index présent dans migrations/, non vérifié en prod » ; (2) la proposition de correction vise `_loadMoreMsgs`, qui incrémente `_msgPage` et non `_convPage` lu par le rendu — le chargement des plus anciens doit se brancher sur le scroll infini d'app-04:4068-4072 (`_convPage`), sinon la pagination serveur ne serait jamais déclenchée.

### Surfaces saines

- Envoi texte 1-1 : statut sending/sent/failed, bouton « réessayer », outbox hors-ligne et renvoi à la reconnexion (émulation S1/S3, transfert-message.spec.js)
- Envoi média (photo/vidéo/vocal/document) : upload Storage puis insert avec verdict lu, aucun base64 en base (0/68 lignes), repli « non synchronisé » (émulation S2/S2b, message-media-echec.spec.js, etat-sync-base64.spec.js)
- RLS de lecture des messages, membres et conversations réservée aux membres (is_conv_member SECURITY DEFINER, search_path vide) — la fuite du 2026-08-09 reste fermée
- Écriture Storage cloisonnée : INSERT/UPDATE conditionnés à storage_chemin_autorise (dossier du compte ou conversation dont on est membre), owner posé sur les 12 objets
- Échappement des médias reçus : gif/img/video/href par safeUrlAttr, noms par escapeHtml, clés de réaction filtrées à l'entrée (émulation S7 pwn=0, xss-notifs-messages.spec.js 6/6)
- Notifications distantes : rendu sûr par défaut avec discriminant de confiance explicite, neutralisation idempotente des chevrons au point d'entrée unique (notifications-echappement.spec.js 5/5)
- Notifications : policies SELECT/UPDATE/DELETE scellées sur user_id, INSERT contrainte sur from_id (migration appliquée) ; realtime filtré user_id=eq.<moi>
- Push Web : abonnement uniquement si permission déjà accordée, RLS own sur push_subscriptions, clé privée VAPID côté Edge seulement, nettoyage des endpoints morts (404/410)
- Realtime messages v3 : un canal privé user:<uid> par client, policy realtime.messages sur le topic, trigger broadcast non exécutable par anon/authenticated
- Badge non-lus sur la barre du bas avec aria-label, titre d'onglet et Badging API (badge-messages.spec.js, émulation S10)
- Stockage durable IndexedDB : distinction lecture impossible / vide, fusion sans perte, tombstones locales (conv-suppression.spec.js 3/3, ui-v6a 12/12, conv-ouverture-fil 4/4, conv-clavier-ouverture 3/3)
- Message vide et double clic sur envoyer : rien n'est inséré / un seul insert (émulation S5/S5b)
- Membre retiré d'une conversation : l'insert est refusé côté serveur (is_conv_member) et le broadcast ne le sert plus
- Ouverture d'une conversation : le fil est peint avant l'entrée du panneau, pas de will-change permanent (conv-ouverture-fil.spec.js)

### Non vérifié (BLOQUÉ) et ce qu'il faudrait

- Lecture/listing HTTP réels des pièces jointes en production (GET public, POST /object/list) : BLOQUÉ par le proxy de l'environnement (403 « Host not in allowlist » sur les 7 requêtes, preuves/anon-rest-storage-probe.json) — il faudrait un poste hors proxy ; la preuve retenue est la configuration (bucket public, policy, grants)
- Lecture anonyme de conv_reads par REST : même blocage ; preuve par pg_policies + has_table_privilege
- Simulation RLS par SET LOCAL ROLE anon/authenticated : refusée au rôle du connecteur (« permission denied to set role ») — vérifier avec authz-critical.spec.js (job prod vert) ou un rôle disposant de SET ROLE
- multi-comptes.spec.js (messagerie texte + vocal cross-compte, notifications) et confidentialite.spec.js (tiers bloqué / membre OK) : BLOQUÉ (comptes réels + SUPABASE_SERVICE_ROLE_KEY) — cité : run CI 33861671142 conclusion success sur c8cb8e99, job « Suites production (comptes réels) »
- Activation « Realtime Authorization » côté dashboard Supabase (nécessaire aux canaux privés) : non lisible en SQL ; la livraison cross-compte est couverte par multi-comptes (CI)
- Push Web de bout en bout (VAPID secrets posés, réception sur un vrai appareil, comportement iOS PWA) : non réalisé — il faudrait deux appareils réels abonnés
- Appels WebRTC réels (NAT symétrique, relais openrelay saturé, iOS) : non réalisé — deux appareils réels nécessaires
- Type MIME menteur servi par Storage (HTML/SVG rendu ou non en text/plain) : non re-mesuré (HTTP bloqué) ; s'appuie sur la mesure du 2026-08-17 de la migration
- Quota localStorage réel sur iOS/Safari (ITP 7 jours, IndexedDB sans onsuccess) : émulation Chromium seulement ; WebKit/Firefox non installés
- Rendu de 50 messages de 100 Ko : l'émulation a expiré pendant le rendu (S4 mesuré avec rendu neutralisé) — mesure de performance du rendu à refaire isolément

### Affirmations des anciens rapports confrontées au code actuel

- PASSIO_PRODUCTION_READINESS.md l.17 « Storage — écriture PROUVÉ, cloisonné depuis le 2026-08-17 » → toujours vraie (pg_policies passio_media_insert/update_cloisonne + storage_chemin_autorise vérifiés en base) ; mais la LECTURE reste publique et listable (MSG-03), ce que la ligne ne dit pas
- PASSIO_PRODUCTION_READINESS.md l.19 « Suppression de compte PROUVÉ … et les médias (400 après) » → partiellement vraie : delete-account ne purge que content/photos|videos|audios ; le seau attachments (et avatars/covers/passion_*) n'est pas touché (index.ts:71-79)
- PASSIO_PRODUCTION_READINESS.md l.16 « Autorisation PROUVÉ … notifications, messages privés » → toujours vraie pour la lecture (policies conv_* et notifications scellées), fausse pour la forge de notifications/push (MSG-04) et pour conv_reads (MSG-05)
- PASSIO_FUNCTIONAL_MAP.md l.55 « Une suppression de message tient au redémarrage (conv-suppression.spec.js) » → vraie pour la fusion locale (3/3 verts), fausse dès que le fil est rechargé du serveur : le message « supprimé pour moi » revient (émulation S8, MSG-06)
- PASSIO_FUNCTIONAL_MAP.md l.56 « Un transfert échoué est marqué et remis en file » → toujours vraie (transfert-message.spec.js 2/2 verts)
- PASSIO_FUNCTIONAL_MAP.md l.62 « Messagerie, vocal, realtime, réactions cross-compte — multi-comptes.spec.js base réelle » → non vérifiable ici (BLOQUÉ) ; job prod vert dans le run 33861671142
- PASSIO_CONTROL_CENTER_AUDIT.md l.80 « Autorisation Storage NON INSTRUMENTÉ » → toujours vraie (aucune télémétrie d'accès Storage)
- docs/CHECKLIST_COMMERCIALISATION.md l.11 « Messages — liste paginée (30/page) » → toujours vraie (app-04:3475)
- docs/CHECKLIST_COMMERCIALISATION.md l.19 « Message vocal reçu → lecteur intégré » → toujours vraie (applyMsgContentData app-04:4331-4342, discriminant par nom)
- docs/CHECKLIST_COMMERCIALISATION.md l.20 « GIF, pièce jointe, localisation » → vraie à l'écran, mais GIF et localisation n'ont pas de verdict d'écriture (MSG-08)
- docs/CHECKLIST_COMMERCIALISATION.md l.22 « Paramètres conv (mute, effacer, exporter, supprimer) » → fausse pour mute (placebo, MSG-07) ; effacer et supprimer ne tiennent pas au rechargement serveur (MSG-06) ; exporter vrai (texte seul)
- docs/CHECKLIST_COMMERCIALISATION.md l.43 « RLS v2 (26 policies) + migration conv_members appliquée » → chiffre périmé (128 policies public aujourd'hui) ; la policy conv_members INSERT en prod est plus stricte que migration_fix_conv_members_insert.sql (is_conversation_creator / can_join_event_conversation / NOT is_blocked_with)
- docs/CHECKLIST_COMMERCIALISATION.md l.50 « pagination fil + messages + conversations » → partiellement vraie : messages paginés côté rendu (40) mais chargés intégralement du serveur (MSG-16)
- KNOWN_RISKS.md R8 « base64 legacy en DB (vocaux) » → devenue fausse (résolue) : 0 data: sur 68 lignes conv_messages, 2 vocaux en URL http
- KNOWN_RISKS.md 2026-08-09 « fuite critique de messages privés corrigée … notifications déjà scellé » → toujours vraie (policies vérifiées) ; conv_reads (créée avec « lecture publique » assumée) n'a pas été incluse dans ce durcissement (MSG-05)
- migrations/migration_notifications_auteur.sql « PRÉPARÉE, NON APPLIQUÉE » → l'en-tête est périmé : la policy notifications_insert_own_author EST en production (pg_policies)
- migrations/migration_realtime_authorization.sql (canaux conv:<id>) → supersédée : seule la v3 user:<uid> existe en base (trigger broadcast_conv_message_users_trigger, 2 policies 'Utilisateur re(ç)oit ses messages')
- docs/PIEGES_CONNUS.md l.46 « Insert conv_messages : AVEC from_id d'abord, fallback sans from_id » → le repli sans from_id est mort (WITH CHECK from_id = auth.uid()) et ne fait que gaspiller une requête (émulation S6)

### Fichiers de preuve

- `preuves/messagerie-notifs/playwright-suites.log`
- `preuves/messagerie-notifs/emulation-resultats.json`
- `preuves/messagerie-notifs/emulation-resultats-2.json`
- `preuves/messagerie-notifs/emulation-console.log`
- `preuves/messagerie-notifs/emulation-console-2.log`
- `preuves/messagerie-notifs/anon-rest-storage-probe.json`
- `preuves/messagerie-notifs/emul-01-texte-envoye.png`
- `preuves/messagerie-notifs/emul-02-piece-jointe.png`
- `preuves/messagerie-notifs/emul-03-hors-ligne-reessayer.png`
- `preuves/messagerie-notifs/emul-04-message-supprime-revenu.png`
- `preuves/messagerie-notifs/emul-05-mention-xss.png`
- `preuves/messagerie-notifs/emul-06-badge.png`
- `preuves/messagerie-notifs/emul-07-appel-forge.png`
- `/tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad/emul-messagerie.js`
- `/tmp/claude-0/-home-user-passio-app/8e50efcd-cd50-5123-9eb7-687c6d323ca2/scratchpad/emul-suite2.js`

### Notes de l'auditeur

MATRICE messagerie × opérations (E = envoi/écriture, R = réception/lecture, S = suppression, V = verdict d'écriture lu, X = échappement à l'affichage) :
- Texte : E ✅ (RLS membre+from_id) · R ✅ realtime v3 + rechargement intégral · S pour moi ⚠️ revient au rechargement (MSG-06) · S pour tous ⚠️ tombstone sans verdict · V ✅ · X ✅
- Vocal : E ✅ Storage (type réel) · R ✅ lecteur intégré · S ⚠️ objet Storage jamais retiré · V ✅ (via sendMessageToSupabase) · X ✅ (safeUrlAttr) · ⚠️ nom d'objet prévisible, lecture publique (MSG-03)
- Photo/vidéo/document : E ✅ · R ✅ · S ⚠️ idem · V ✅ (message-media-echec) · X ✅ · ⚠️ lecture publique + listing anonyme (MSG-03), base64 conservé localement (MSG-14)
- GIF : E ⚠️ sans verdict, repli mort (MSG-08) · R ✅ · X ✅
- Localisation : E ⚠️ sans verdict (MSG-08) · R ✅ · X ✅ (javascript: bloqué, test vert)
- Réaction : E ⚠️ sans verdict · R ✅ clé filtrée (_reactionKeySure) · X ✅
- Transfert : E ✅ verdict + outbox (test vert)
- Groupe : création ✅ · membres ⚠️ erreurs avalées · description ❌ jamais écrite (pas de policy UPDATE) · photo ❌ locale seulement · mentions ❌ XSS (MSG-02) · quitter ✅ (tombstone + delete conv_members)
- Lecture (conv_reads) : E ✅ own · R ❌ publique aux anonymes (MSG-05)
- Mute ❌ placebo (MSG-07) · Recherche ✅ · Export ✅ texte · Suppression de conversation ❌ locale, revient (MSG-06)
- Badge ✅ · Pagination : conversations ✅ 30 · messages ⚠️ client seulement (MSG-16)
- Realtime : messages ✅ privé user:<uid> · appels ❌ canaux publics + XSS emoji (MSG-01) · frappe ⚠️ public
- Appels : signalisation ✅ (hors forge), TURN = relais public partagé (qualité non garantie), push d'appel ✅ (notify-call)
- Notifications : lecture ✅ scellée · rendu ✅ sûr par défaut · insertion ❌ forgeable, sans cadence (MSG-04) · push social ✅ mais forgeable · push DM ❌ absent (MSG-09)
- Stockage local ✅ LS + IDB, quota ⚠️ (base64 locale)
- Cadence/borne : ❌ aucune sur conv_messages ni notifications (MSG-04/MSG-12)

CAPACITÉ : non prouvée au-delà des volumes actuels (68 messages, 117 conversations, 188 notifications, 5 abonnements push, 12 pièces jointes/10 Mo). Le trigger broadcast fait N diffusions par message (N = membres) et supaLoadMessages charge tout : coût linéaire par conversation et par groupe ; aucune mesure de charge (interdite sur la prod).
COÛTS : cache Storage 1 an sur des objets publics = egress imprévisible si une URL circule ; Web Push gratuit mais forgeable ; relais TURN openrelay public (gratuit, saturé) — un TURN dédié est le seul levier de qualité des appels.
ORDRE DE CORRECTION RECOMMANDÉ : (1) MSG-01 ①/MSG-02 (échappement, 2 h, à livrer immédiatement) ; (2) MSG-04 rate-limits + notify-call durci ; (3) MSG-03 bucket privé + URLs signées + purge ; (4) MSG-05 conv_reads ; (5) MSG-01 ②③ canaux privés ; (6) MSG-06/07/08/10 ; (7) MSG-09 push DM (après MSG-04) ; (8) P3.
À SOUMETTRE À BENJAMIN : le passage du seau attachments en privé (change le modèle d'URL des 68 messages existants et le cache) ; le choix d'un TURN dédié payant ; l'ajout de push pour les DM (coût/cadence) ; la validation des pseudos (peut refuser des pseudos existants).
CONSERVER : le modèle de confiance explicite des notifications, le pipeline média avec verdict, les tombstones locales, le canal privé user:<uid>. REFACTORISER : _sendGif/shareLocation/_sendReaction vers sendMessageToSupabase (un seul point de vérité du verdict) ; supprimer le repli « sans from_id » (mort). SUPPRIMER : la policy realtime en double ; migration_realtime_authorization.sql (supersédée) ou l'annoter.
ENVIRONNEMENT : Playwright 1.60 attendait chromium_headless_shell-1223 alors que /opt/pw-browsers ne contient que 1194 — contourné par des liens symboliques dans le scratchpad (PLAYWRIGHT_BROWSERS_PATH), sans toucher au dépôt ; à signaler à l'orchestrateur pour la suite complète. Aucun fichier suivi par git modifié (git status --short vide à la fin ; HEAD f501fb78 = c8cb8e99 + 2 commits .passio/ de l'orchestrateur, diff vide sur js/, index.html, sw.js, supabase/, migrations/, tests/, styles.css, dashboard/). Aucune écriture en base, aucune requête HTTP n'a atteint la production (toutes bloquées par le proxy), les suites e2e locales n'écrivent pas en base et l'émulation stubbe Supabase en mémoire.

## Domaine « irl »

> ⚠️ **Domaine reconstitué par l'orchestrateur.** Les trois sous-agents Fable 5.1 affectés à ce domaine ont été interrompus par l'épuisement des crédits de session avant de rendre leur sortie structurée. L'orchestrateur (Fable 5.1 également) a reconstitué contrôles et problèmes à partir des preuves qu'ils avaient déposées (scripts, captures, journaux, requêtes) et de vérifications ciblées dans le code du SHA audité. **Aucune relecture adversariale n'a pu être faite sur ces problèmes** : ils sont marqués « NON VÉRIFIÉ (pas de relecture) » et sont prioritaires pour la contre-revue GPT-6 Astra.

Domaine IRL (activités) reconstitué par l'orchestrateur à partir des preuves déposées par trois sous-agents Fable 5.1 interrompus par la limite de crédits (matrice IRL × opérations, deux émulations Chromium sur serveur local, policies prod, 166 tests e2e IRL exécutés). Le cycle de vie fonctionne (création, filtres dont « Ce week-end », RSVP à trois états, liste d'attente, désinscription, signalement) et les champs hostiles sont échappés. Mais la SÉCURITÉ IRL est insuffisante pour un lancement public : l'adresse exacte, le téléphone de contact et la liste nominative des participants sont lisibles par tout visiteur sans compte (SELECT `true` sur `events` et `event_attendees`, rôle anon compris) ; la garde de majorité `irl_interaction_allowed` n'est appelée que sous un drapeau éteint ; aucun conseil de sécurité ; la promotion depuis la liste d'attente est refusée par la RLS en silence tout en notifiant « tu es inscrit·e ! » ; les vérifications de capacité, de statut et de propriété (co-organisateur) manquent côté serveur. Aucune relecture adversariale n'a pu être faite sur ces problèmes (crédits épuisés) : ils sont marqués « NON VÉRIFIÉ (pas de relecture) ».

### Contrôles (18)

| Id | Contrôle | Statut | Méthode | Preuve |
|---|---|---|---|---|
| IRL-C01 | Création d'une activité : champs obligatoires (titre ≥ 3, ville, date, passion), date passée refusée | **PROUVÉ** | émulation | preuves/irl/emulation-resultats.json étapes « formulaire de création » (11 champs présents) et « création avec date passée » (toast « Cette date est déjà passée », 0 événement créé) ; app-07:5601-5608 |
| IRL-C02 | Modification d'une activité par son auteur | **DÉFAILLANT** | émulation | emulation-resultats-2.json « édition d'un événement avec une date passée » : dateDansLePasse=true, supaUpdateEvent appelé — la date passée n'est refusée qu'à la création (app-07:5608) |
| IRL-C03 | Annulation douce (status cancelled) et notification des inscrits | **CONFORME PAR INSPECTION** | inspection code | toggleCancelEvent app-07:5500 → supaCancelEvent app-08:4150 ; notifie `ev.attendees` seulement (5732-5738) : « peut-être » et liste d'attente non prévenus |
| IRL-C04 | Suppression d'une activité : verdict serveur honoré, inscrits prévenus | **DÉFAILLANT** | émulation | emulation-resultats.json « suppression refusée par la base » : encoreLocal=false et toast « Événement supprimé » alors que le stub serveur a refusé ; deleteEventConfirm app-07:5522-5535 ignore le retour de supaDeleteEvent |
| IRL-C05 | Recherche et filtres (passion, mine/joined, dates dont « Ce week-end », ville, distance, horaire, texte) | **PROUVÉ** | émulation | emulation-resultats-2.json « case Ce week-end » : aria-pressed=true, filtres=[weekend], 3 résultats, pied « Afficher 3 résultats » ; « Mes rencontres » : 1 résultat ; _filterIrlEvents app-07:2395, weekend 2084 |
| IRL-C06 | Liste : chargement serveur borné et filtré par date | **DÉFAILLANT** | inspection code | supaLoadEvents app-08:4178 : `order created_at desc limit 60`, SANS filtre de date → dès 60 événements créés, les plus anciens créés (même futurs) disparaissent de la liste |
| IRL-C07 | Carte (MapLibre GL + OpenFreeMap) : affichage, repli sans WebGL | **BLOQUÉ** | émulation | emulation-resultats.json « carte » : unpkg/openfreemap injoignables derrière le proxy → repli « La carte n'est pas disponible sur cet appareil » affiché correctement ; 1 test e2e irl.spec.js:354 échoue pour la même raison (getZoom sur carte nulle) — vert en CI (run 2494) |
| IRL-C08 | Inscription / désinscription / liste d'attente (3 états) côté client | **PROUVÉ** | émulation | emulation-resultats.json : RSVP going, double appel idempotent (0 écriture), événement complet → waitlist, désinscription → promotion locale ; tests irl.spec.js + irl-funnel.spec.js (166 tests, 165 verts) |
| IRL-C09 | Promotion depuis la liste d'attente : effective côté serveur | **DÉFAILLANT** | inspection code | supaPromoteFromWaitlist app-07:5506 fait un UPDATE de la ligne d'AUTRUI ; policy event_attendees UPDATE = `user_id = auth.uid()` (preuves/irl/policies-irl.txt) → 0 ligne ; retour ignoré (app-07:3355, 5476) et supaInsertNotif « une place s'est libérée, tu es inscrit·e ! » envoyée (émulation étape « désinscription → promotion file (serveur refuse : stub false) ») |
| IRL-C10 | Adresse exacte, coordonnées et contact : réservés aux inscrits ou aux comptes | **DÉFAILLANT** | inspection code | policies-irl.txt : events SELECT `true` ×2 pour {public} (anon compris) ; fiche app-07:3767-3777 affiche adresse, lien Google Maps et `tel:` sans inscription ; first-run.js:515-516 charge les événements réels pour un visiteur sans compte ; émulation « fiche evA (non inscrit) » : adresseVisible=true, contactVisible=true, inscrit=false |
| IRL-C11 | Participants : liste nominative réservée | **DÉFAILLANT** | inspection code | event_attendees SELECT `true` (rsvp, checked_in_at, rating, feedback lisibles par l'API avec la clé anon) ; fiche app-07:3742-3760 |
| IRL-C12 | Check-in (GPS 500 m, QR/code) | **PROBABLE** | émulation | émulation « check-in par code (sans inscription préalable), 2 fois » : code dérivé de l'id (hachage FNV public, app-07:6490), rsvp passe à going, rejeu bloqué localement ; GPS refusé → done() (3463) ; aucune fenêtre horaire serveur |
| IRL-C13 | Mineurs : garde de majorité appliquée aux interactions IRL | **DÉFAILLANT** | inspection code | `irl_interaction_allowed` n'est appelé que par app-07:5050 sous le drapeau `passio_irl_proposal_v1` (défaut « 0 », app-07:4941) ; `declare_birth_year` idem (5024) ; onbValidateAge app-02:3179 = année auto-déclarée, isMinor en localStorage ; émulation « RSVP going par un compte isMinor=true » : accepté |
| IRL-C14 | Conseils de sécurité IRL (lieu public, prévenir un proche, signaler l'organisateur) | **DÉFAILLANT** | inspection code | grep « sécurité / lieu public / conseil » dans app-07, ui-v4b, ui-v4a2, index.html : 0 occurrence IRL ; émulation fiche : conseilsSecurite=false ; aucun bouton signaler/bloquer l'organisateur depuis la fiche |
| IRL-C15 | Injection dans les champs d'événement (titre, adresse, lieu, contact, badge) | **PROUVÉ** | émulation | emulation-resultats-2.json : titre `<script>` et contact `tel:" onclick=…` rendus échappés, xss=null, xss2=null après clic |
| IRL-C16 | Signalement d'un événement | **PROBABLE** | émulation | reportEvent app-07:5563 → supaReport('event', id, '') : motif toujours vide, aucune confirmation, 5 envois successifs acceptés (émulation « 5 signalements successifs ») ; rate-limit serveur 10/min |
| IRL-C17 | Suites e2e IRL du dépôt | **PROUVÉ** | test exécuté | preuves/irl/tests-irl-run.txt : 166 tests, 165 verts, 1 échec environnemental (carte injoignable) |
| IRL-C18 | Bornes des champs numériques (prix, capacité) | **DÉFAILLANT** | émulation | émulation « création valide (prix -5, max -3) » : événement créé, spots=0, full=true, prix affiché « Gratuit » ; les `min` HTML (app-07:5287, 5290) ne sont pas revérifiés (5583-5584) |

### Problèmes (13)

| Id | Priorité retenue | Relecture | Titre |
|---|---|---|---|
| IRL-01 | **P1** | NON VÉRIFIÉ (pas de relecture) | Adresse exacte, coordonnées GPS et téléphone de contact d'une activité lisibles par tout visiteur, sans compte ni inscription |
| IRL-02 | **P1** | NON VÉRIFIÉ (pas de relecture) | Aucune protection des mineurs sur les rencontres physiques : la garde de majorité serveur existe mais n'est jamais appelée |
| IRL-03 | **P1** | NON VÉRIFIÉ (pas de relecture) | Liste nominative des participants, pointages, notes et retours d'événement lisibles par l'API avec la clé anon |
| IRL-04 | **P1** | NON VÉRIFIÉ (pas de relecture) | Promotion depuis la liste d'attente refusée par la RLS en silence, tout en notifiant « tu es inscrit·e ! » |
| IRL-05 | **P2** | NON VÉRIFIÉ (pas de relecture) | Capacité, statut de l'événement et valeur du RSVP non vérifiés côté serveur |
| IRL-06 | **P2** | NON VÉRIFIÉ (pas de relecture) | Suppression d'une activité : verdict serveur ignoré, inscrits jamais prévenus, participations orphelines |
| IRL-07 | **P2** | NON VÉRIFIÉ (pas de relecture) | La liste des activités ne charge que les 60 dernières créées, sans filtre de date : des rencontres futures disparaissent dès 60 événements |
| IRL-08 | **P2** | NON VÉRIFIÉ (pas de relecture) | Prise de contrôle d'un événement par un co-organisateur, et affichage d'un tiers comme organisateur |
| IRL-09 | **P2** | NON VÉRIFIÉ (pas de relecture) | Aucun conseil de sécurité IRL, aucun signalement/blocage de l'organisateur depuis la fiche, signalement sans motif ni confirmation |
| IRL-10 | **P2** | NON VÉRIFIÉ (pas de relecture) | Conversation d'événement créée par un co-organisateur : aucun participant ne peut la rejoindre, refus silencieux |
| IRL-11 | **P3** | NON VÉRIFIÉ (pas de relecture) | Prix et capacité négatifs acceptés ; édition avec une date passée acceptée |
| IRL-12 | **P3** | NON VÉRIFIÉ (pas de relecture) | Preuve de présence uniquement côté client (GPS refusé = pointage accepté, code dérivable de l'id) |
| IRL-13 | **P3** | NON VÉRIFIÉ (pas de relecture) | L'annulation ne prévient que les inscrits `going` |

### IRL-01 — Adresse exacte, coordonnées GPS et téléphone de contact d'une activité lisibles par tout visiteur, sans compte ni inscription

| Champ | Valeur |
|---|---|
| Identifiant | IRL-01 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — fiche d'activité, chargement des événements |
| Résultat attendu | L'adresse précise et le contact d'une rencontre physique ne sont révélés qu'à un compte inscrit (ou au moins connecté), jamais au public anonyme. |
| Résultat observé | Les deux policies SELECT de `events` valent `true` pour le rôle {public} (anon inclus). La fiche affiche l'adresse, un lien Google Maps et un lien `tel:` sans condition (app-07:3767-3777). Le parcours « première visite » charge les événements réels pour un visiteur sans compte (first-run.js:515-516). |
| Reproduction | Sans compte : ouvrir l'onglet Rencontrer, ouvrir une fiche → adresse et téléphone visibles (émulation « fiche evA (non inscrit) » : adresseVisible=true, contactVisible=true). Par l'API : `GET /rest/v1/events?select=address,lat,lng,contact` avec la seule clé anon. |
| Preuve | preuves/irl/policies-irl.txt (events SELECT true ×2) ; preuves/irl/emulation-resultats.json ; js/app-07-ia-explore-irl.js:3767-3777 ; js/first-run.js:515 |
| Impact utilisateur et commercial | Sécurité physique des organisateurs et des participants (domicile, numéro personnel exposés au public, scraping possible). Critère d'interdiction du GO grande échelle « sécurité IRL insuffisante ». |
| Visibilité dans le Centre de pilotage | Aucune : une lecture anonyme est une requête normale. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Colonnes sensibles (address, lat/lng précis, contact) servies par une vue ou une RPC réservée aux inscrits (`going`/`maybe`) et à l'organisateur ; la liste publique ne montre que la ville et une position arrondie. Garder SELECT public sur le reste. |
| Risque de régression | Moyen : la carte et le tri par proximité (`_kmBetween`) lisent lat/lng ; prévoir une position arrondie pour la carte. |
| Effort estimé | 2 à 3 jours (migration + client + tests irl-trust-safety). |

### IRL-02 — Aucune protection des mineurs sur les rencontres physiques : la garde de majorité serveur existe mais n'est jamais appelée

| Champ | Valeur |
|---|---|
| Identifiant | IRL-02 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — création, RSVP, check-in, conversation d'événement ; onboarding âge |
| Résultat attendu | Un compte de 13 à 17 ans ne peut pas rejoindre ou organiser une rencontre avec des adultes inconnus, ou au minimum une garde serveur l'en empêche. |
| Résultat observé | `irl_interaction_allowed` et `declare_birth_year` ne sont appelés que sous le drapeau `passio_irl_proposal_v1`, éteint par défaut (app-07:4941, 5024, 5050). L'âge est une année auto-déclarée côté client (app-02:3179-3193), `isMinor` vit en localStorage et n'est lu par aucune écriture IRL. `user_safety` : 2 lignes pour 5 comptes. En émulation, un compte isMinor=true s'inscrit (« RSVP going par un compte isMinor=true » : accepté). |
| Reproduction | Onboarding avec année 2013 → isMinor=true ; onglet Rencontrer → fiche → « J'y vais » : accepté, adresse et téléphone visibles. |
| Preuve | preuves/irl/matrice-irl-operations.md ligne « Âge / mineurs » ; preuves/irl/emulation-resultats.json ; preuves/supabase-isolation/fonctions_realtime_storage_staging.md (declare_birth_year, irl_interaction_allowed) |
| Impact utilisateur et commercial | Sécurité des mineurs, responsabilité juridique de l'éditeur. Critère d'interdiction du GO « sécurité IRL insuffisante ». |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Décider la règle produit (18+ pour l'IRL, ou majorité requise pour organiser) ; appeler `declare_birth_year` à l'onboarding et faire porter la garde par la RLS d'`event_attendees`/`events` (INSERT conditionné à `irl_interaction_allowed`) ; retirer l'allégation « contrôle d'âge IA » (voir AUT-04). |
| Risque de régression | Moyen : comptes existants sans année déclarée (« âge inconnu ») à traiter. |
| Effort estimé | 2 à 4 jours. |

### IRL-03 — Liste nominative des participants, pointages, notes et retours d'événement lisibles par l'API avec la clé anon

| Champ | Valeur |
|---|---|
| Identifiant | IRL-03 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — participants |
| Résultat attendu | Qui participe à une rencontre est visible des inscrits/du réseau, pas du public anonyme, et les retours (`feedback`, `rating`) restent privés. |
| Résultat observé | Policy `event_attendees` SELECT = `true` pour {public} : rsvp, checked_in_at, rating, feedback de tous les comptes lisibles sans authentification. |
| Reproduction | `GET /rest/v1/event_attendees?select=*` avec la clé anon (non exécuté ici : lecture seule, mais la policy le garantit). |
| Preuve | preuves/irl/policies-irl.txt [event_attendees] Lecture publique qual=true ; preuves/supabase-isolation/policies.json |
| Impact utilisateur et commercial | Profilage des déplacements physiques d'un utilisateur (où et quand il sera), fuite de retours libres. Sécurité IRL et RGPD. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | SELECT réservé aux authentifiés, et masquer `feedback`/`rating` sauf à l'organisateur (vue ou colonnes séparées). |
| Risque de régression | Faible côté app (déjà authentifiée quand elle lit) ; le mode invité ne doit plus compter les participants ou seulement leur nombre via RPC. |
| Effort estimé | 1 jour. |

### IRL-04 — Promotion depuis la liste d'attente refusée par la RLS en silence, tout en notifiant « tu es inscrit·e ! »

| Champ | Valeur |
|---|---|
| Identifiant | IRL-04 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — liste d'attente |
| Résultat attendu | Quand une place se libère, le premier en attente devient inscrit en base et est prévenu ; sinon rien n'est annoncé. |
| Résultat observé | `supaPromoteFromWaitlist` met à jour la ligne d'un AUTRE utilisateur alors que la policy UPDATE d'`event_attendees` exige `user_id = auth.uid()` → 0 ligne. Les deux appelants ignorent le retour (app-07:3355 et 5476) et envoient la notification « une place s'est libérée, tu es inscrit·e ! » (3358, 5477). |
| Reproduction | Événement complet avec un attente ; le dernier inscrit se désinscrit → émulation « désinscription → promotion file (serveur refuse : stub false) » : supaPromoteFromWaitlist puis supaInsertNotif envoyée malgré le refus. |
| Preuve | preuves/irl/emulation-resultats.json ; preuves/irl/policies-irl.txt [event_attendees] Maj de sa propre participation ; js/app-07-ia-explore-irl.js:3344-3360, 5470-5480 |
| Impact utilisateur et commercial | Un utilisateur se présente à une rencontre où il n'est pas inscrit ; l'organisateur ne le voit pas dans sa liste. Défaut d'intégrité invisible pour tous. |
| Visibilité dans le Centre de pilotage | Partielle : la requête PATCH renvoie 200 avec 0 ligne, aucune erreur. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | RPC SECURITY DEFINER `promote_from_waitlist(event_id)` bornée à l'organisateur ou au mécanisme de désinscription, ou promotion côté serveur par trigger sur DELETE ; lire `{ error }` et le nombre de lignes avant de notifier. |
| Risque de régression | Faible. |
| Effort estimé | 1 jour. |

### IRL-05 — Capacité, statut de l'événement et valeur du RSVP non vérifiés côté serveur

| Champ | Valeur |
|---|---|
| Identifiant | IRL-05 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — RSVP |
| Résultat attendu | Un événement complet ou annulé refuse une inscription `going` quelle que soit la voie (UI ou REST) ; la valeur rsvp est contrainte. |
| Résultat observé | INSERT/UPDATE `event_attendees` ne vérifient que `user_id = auth.uid()` : aucune borne de capacité, de statut (`cancelled`), ni de valeur rsvp. Le banc de chaos montre 2 POST + 2 PATCH concurrents acceptés côté client (A2_rsvp). |
| Reproduction | Deux appels simultanés à setEventRsvp sur un événement à une place restante, ou un INSERT REST `rsvp='going'` sur un événement complet. |
| Preuve | preuves/irl/policies-irl.txt ; preuves/robustesse-pannes/02-chaos-observations.jsonl (A2_rsvp) |
| Impact utilisateur et commercial | Dépassement de capacité, inscription à un événement annulé ; l'organisateur ne peut pas s'y fier. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | CHECK sur rsvp ∈ {going,maybe,declined,waitlist} ; trigger BEFORE INSERT/UPDATE qui refuse `going` au-delà de `max_attendees` et sur un événement `cancelled`/passé. |
| Risque de régression | Faible. |
| Effort estimé | 0,5 à 1 jour. |

### IRL-06 — Suppression d'une activité : verdict serveur ignoré, inscrits jamais prévenus, participations orphelines

| Champ | Valeur |
|---|---|
| Identifiant | IRL-06 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — suppression |
| Résultat attendu | Un refus serveur laisse l'événement à l'écran ; une suppression réussie prévient les inscrits et efface leurs participations. |
| Résultat observé | deleteEventConfirm (app-07:5522-5535) affiche « Événement supprimé » quel que soit le retour ; aucune notification ; les lignes `event_attendees` d'autrui restent (pas de FK, DELETE limité à ses lignes). |
| Reproduction | Émulation « suppression refusée par la base » : encoreLocal=false, toast « Événement supprimé ». |
| Preuve | preuves/irl/emulation-resultats.json ; js/app-07-ia-explore-irl.js:5522-5535 ; preuves/supabase-isolation/ref_cols.txt (aucune FK event_attendees→events) |
| Impact utilisateur et commercial | Participants qui se déplacent pour rien ; données orphelines qui grossissent. |
| Visibilité dans le Centre de pilotage | Partielle (requête DELETE 200 sans ligne). |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Lire `{ error }`/count ; notifier `attendees` + `maybe` + waitlist ; FK `event_attendees.event_id → events(id) ON DELETE CASCADE`. |
| Risque de régression | Faible. |
| Effort estimé | 0,5 jour. |

### IRL-07 — La liste des activités ne charge que les 60 dernières créées, sans filtre de date : des rencontres futures disparaissent dès 60 événements

| Champ | Valeur |
|---|---|
| Identifiant | IRL-07 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — liste |
| Résultat attendu | La liste montre les événements à venir (filtre `date >= now()`), paginés. |
| Résultat observé | `supaLoadEvents` (app-08:4178) : `order created_at desc limit 60`, aucun filtre de date, aucune pagination serveur. |
| Reproduction | Créer 61 événements ; le premier créé (même daté dans un mois) n'est plus chargé. |
| Preuve | js/app-08-ui-modals-tour.js:4178 ; preuves/irl/matrice-irl-operations.md ligne « Liste » |
| Impact utilisateur et commercial | Dès quelques centaines d'utilisateurs actifs, des rencharges organisées disparaissent de l'application. Capacité fonctionnelle. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Filtre `date >= now() - 1 day`, tri par date, pagination par curseur (comme le fil). |
| Risque de régression | Faible ; adapter les tests irl.spec. |
| Effort estimé | 0,5 jour. |

### IRL-08 — Prise de contrôle d'un événement par un co-organisateur, et affichage d'un tiers comme organisateur

| Champ | Valeur |
|---|---|
| Identifiant | IRL-08 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — modification, création |
| Résultat attendu | Un co-organisateur ne peut pas changer l'auteur ; `organizer_id` est contraint à l'appelant. |
| Résultat observé | Policy UPDATE `events` : `author_id = auth.uid() OR jsonb_exists(co_organizers, auth.uid())` SANS WITH CHECK → un co-organisateur peut réécrire `author_id` et `co_organizers`. INSERT ne contraint que `author_id` ; `organizer_id` est libre (app-08:4109). |
| Reproduction | En co-organisateur : `PATCH /rest/v1/events?id=eq.X {"author_id":"<moi>"}` ; en créateur : INSERT avec `organizer_id` d'un tiers. |
| Preuve | preuves/irl/policies-irl.txt [events] Update organisateurs (check=None) ; preuves/irl/matrice-irl-operations.md |
| Impact utilisateur et commercial | Usurpation d'organisateur, perte de contrôle de son événement. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | WITH CHECK identique à USING + trigger gelant `author_id` (comme `trg_posts_freeze_author`) ; CHECK `organizer_id = author_id` ou retrait de la colonne. |
| Risque de régression | Faible. |
| Effort estimé | 0,5 jour. |

### IRL-09 — Aucun conseil de sécurité IRL, aucun signalement/blocage de l'organisateur depuis la fiche, signalement sans motif ni confirmation

| Champ | Valeur |
|---|---|
| Identifiant | IRL-09 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — fiche, signalement |
| Résultat attendu | Avant une rencontre physique : rappels (lieu public, prévenir un proche), moyen de signaler ou bloquer l'organisateur en un geste, signalement motivé. |
| Résultat observé | 0 texte de sécurité ; `reportEvent` envoie `supaReport('event', id, '')` sans motif ni confirmation (5 envois successifs acceptés) ; le ⋯ de blocage n'existe que sur le profil. |
| Reproduction | Ouvrir une fiche → « Signaler » ×5. |
| Preuve | preuves/irl/emulation-resultats-2.json « 5 signalements successifs » ; js/app-07-ia-explore-irl.js:5563 |
| Impact utilisateur et commercial | Sécurité IRL et exploitabilité des signalements (motif toujours vide, voir MOD-01). |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Bloc « Sécurité » sur la fiche ; menu ⋯ organisateur (signaler/bloquer) ; formulaire de motif obligatoire ; anti-doublon local. |
| Risque de régression | Faible. |
| Effort estimé | 1 jour. |

### IRL-10 — Conversation d'événement créée par un co-organisateur : aucun participant ne peut la rejoindre, refus silencieux

| Champ | Valeur |
|---|---|
| Identifiant | IRL-10 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — discussion de l'activité |
| Résultat attendu | Toute discussion d'événement créée par un gestionnaire est joignable par les inscrits. |
| Résultat observé | `_canManageEvent` autorise auteur OU co-organisateur à créer la discussion (`created_by = MY_UID`, app-07:5580) mais `can_join_event_conversation` exige `c.created_by = e.author_id` ; l'INSERT `conv_members` est refusé et `supaJoinEventConversation` (5588) ignore le retour. |
| Reproduction | Co-organisateur crée la discussion ; un inscrit clique « Rejoindre la discussion » : rien ne se passe. |
| Preuve | preuves/irl/matrice-irl-operations.md ligne « Conversation d'événement » ; preuves/irl/policies-irl.txt [conv_members] Ecriture propre |
| Impact utilisateur et commercial | Fonction morte dans ce cas, sans message. |
| Visibilité dans le Centre de pilotage | Partielle (403 RLS générique). |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Élargir `can_join_event_conversation` aux co-organisateurs, lire `{ error }` et afficher un toast. |
| Risque de régression | Faible. |
| Effort estimé | 0,5 jour. |

### IRL-11 — Prix et capacité négatifs acceptés ; édition avec une date passée acceptée

| Champ | Valeur |
|---|---|
| Identifiant | IRL-11 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — formulaire |
| Résultat attendu | Bornes revalidées en JS et en base. |
| Résultat observé | Prix -5 et capacité -3 acceptés (événement « complet » à la création, prix affiché « Gratuit ») ; l'édition n'applique pas la règle de date passée. |
| Reproduction | Émulation « création valide (prix -5, max -3) » et « édition d'un événement avec une date passée ». |
| Preuve | preuves/irl/emulation-resultats.json ; preuves/irl/emulation-resultats-2.json |
| Impact utilisateur et commercial | Faible : incohérences d'affichage. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Revalider min/max dans submitEvent ; CHECK `price >= 0`, `max_attendees > 0`. |
| Risque de régression | Nul. |
| Effort estimé | 0,25 jour. |

### IRL-12 — Preuve de présence uniquement côté client (GPS refusé = pointage accepté, code dérivable de l'id)

| Champ | Valeur |
|---|---|
| Identifiant | IRL-12 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — check-in |
| Résultat attendu | Le pointage a une valeur (fenêtre horaire, code non devinable, position réelle). |
| Résultat observé | GPS indisponible → `done()` (app-07:3463) ; code = hachage FNV de l'id public (6490) ; aucune fenêtre horaire serveur ; pointage possible sans inscription préalable (rsvp forcé à going). |
| Reproduction | Émulation « check-in par code (sans inscription préalable), 2 fois ». |
| Preuve | preuves/irl/emulation-resultats.json |
| Impact utilisateur et commercial | Faible tant que le pointage ne conditionne rien (badges). |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Code secret par événement (colonne non lisible), fenêtre horaire vérifiée par trigger. |
| Risque de régression | Faible. |
| Effort estimé | 1 jour. |

### IRL-13 — L'annulation ne prévient que les inscrits `going`

| Champ | Valeur |
|---|---|
| Identifiant | IRL-13 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — annulation |
| Résultat attendu | « Peut-être » et liste d'attente sont prévenus aussi. |
| Résultat observé | toggleCancelEvent notifie `ev.attendees` seulement (app-07:5732-5738). |
| Reproduction | Annuler un événement avec un `maybe` : aucune notification pour lui. |
| Preuve | js/app-07-ia-explore-irl.js:5732-5738 |
| Impact utilisateur et commercial | Faible. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Étendre la boucle aux trois listes. |
| Risque de régression | Nul. |
| Effort estimé | 0,25 jour. |

### Surfaces saines

- Échappement des champs d'événement (titre, adresse, lieu, contact, durée, type) : aucune XSS en émulation (deux passes).
- Filtres de la page « Filtre » (UI-4A5) : « Ce week-end », « Mes rencontres », distance, horaire — conformes à la fiche docs/lots-ui/20.
- RSVP à trois états et liste d'attente côté client : idempotents, testés (166 tests e2e, 165 verts).
- Position de l'utilisateur : jamais persistée ni envoyée (verrou irl-trust-safety.spec.js ⑥-⑨), repli Paris.
- Réactions d'événement : owner + rate-limit 30/min. Prix : une seule fonction d'affichage (`fmtEventPrice`).
- Repli sans carte (WebGL/réseau absent) affiché correctement, la liste reste utilisable.

### Non vérifié (BLOQUÉ) et ce qu'il faudrait

- Carte MapLibre/OpenFreeMap : tuiles et bibliothèque injoignables derrière le proxy → rendu, performance et recadrage non mesurés (1 test e2e rouge pour cette raison, vert en CI).
- Géocodage BAN/Photon : non exercé (réseau).
- Valeur réelle de `max_attendees` et comportements sur appareil réel (GPS, QR caméra) : non réalisés.
- Relecture adversariale des 13 problèmes : NON FAITE (crédits épuisés) — à confronter en contre-revue.

### Affirmations des anciens rapports confrontées au code actuel

- docs/CHECKLIST_COMMERCIALISATION.md:12 mentionne Leaflet : obsolète, la carte est MapLibre GL via le shim `window.L` de js/map-loader.js (L.tileLayer = no-op).
- docs/PIEGES_CONNUS.md (IRL, ~12 fiches) décrit la promotion automatique de la liste d'attente comme fonctionnelle : elle l'est côté client seulement (IRL-04).

### Fichiers de preuve

- `preuves/irl/matrice-irl-operations.md`
- `preuves/irl/emulation-irl.js`
- `preuves/irl/emulation-resultats.json`
- `preuves/irl/emulation-irl-2.js`
- `preuves/irl/emulation-resultats-2.json`
- `preuves/irl/policies-irl.txt`
- `preuves/irl/tests-irl-run.txt`
- `preuves/irl/01-liste.jpg … 07-filtre-weekend.jpg`

### Notes de l'auditeur

Reconstitué par l'orchestrateur (Fable 5.1) le 2026-09-04 à partir des preuves déposées par les sous-agents wf_d7fd44d8 et wf_1ca0cda6 (interrompus). Les numéros de ligne cités proviennent de la matrice déposée et ont été recoupés par grep sur le SHA audité pour IRL-04, IRL-06, IRL-13 et la garde de majorité.

## Domaine « profils-passions »

> ⚠️ **Domaine reconstitué par l'orchestrateur.** Les trois sous-agents Fable 5.1 affectés à ce domaine ont été interrompus par l'épuisement des crédits de session avant de rendre leur sortie structurée. L'orchestrateur (Fable 5.1 également) a reconstitué contrôles et problèmes à partir des preuves qu'ils avaient déposées (scripts, captures, journaux, requêtes) et de vérifications ciblées dans le code du SHA audité. **Aucune relecture adversariale n'a pu être faite sur ces problèmes** : ils sont marqués « NON VÉRIFIÉ (pas de relecture) » et sont prioritaires pour la contre-revue GPT-6 Astra.

Domaine profils / passions / identité active reconstitué par l'orchestrateur à partir des preuves de trois sous-agents Fable 5.1 interrompus (matrice actions × identité, 7 scénarios d'attaque rejoués + 7 scénarios complémentaires en émulation Chromium, requêtes base en lecture seule, 248 tests e2e du domaine exécutés, tous verts). L'identité de COMPTE (uuid) est toujours `MY_UID` et gardée par la RLS ; le plafond de 3 passions, le quota de changements et le mode « illimité » fonctionnent à l'écran et sont bien gardés aux points d'écriture CLIENT. Mais rien n'existe côté serveur : 13 passions publiées depuis la console, quota remis à zéro par le client ; l'identité AFFICHÉE en messagerie et dans les notifications est choisie par l'émetteur (usurpation « Équipe PASSIO » réussie) ; et le référentiel serveur est tronqué par le plafond `max-rows` de PostgREST (1 000 lignes) : ~900 des 1 908 passions restent impubliables, dont une passion VIVANTE d'un compte réel. Aucune relecture adversariale (crédits épuisés).

### Contrôles (17)

| Id | Contrôle | Statut | Méthode | Preuve |
|---|---|---|---|---|
| PRO-C01 | Identité de compte envoyée par chaque action (posts, stories, événements, commentaires, likes, RSVP, follows, messages, notifications) | **PROUVÉ** | émulation | preuves/profils-passions/F-matrice-actions-identite.json : author_id/user_id/from_id = MY_UID pour toutes les écritures journalisées ; RLS `= auth.uid()` (policies.json) |
| PRO-C02 | Passion d'écriture : `currentProfileId` seule source, Studio seul point de choix (ADR-011) | **PROUVÉ** | inspection code | matrice-actions-identite-inspection.md : posts via `#postPassion` (défaut = passion active, app-06:3776-3800), stories = passion active, événements = choix explicite `#evPassion` |
| PRO-C03 | Plafond de 3 passions vivantes : gardé aux points d'écriture client | **PROUVÉ** | test exécuté | D-archive-active-double-restaure.json : restaurerAuPlafond=false, paywallOuvert=true ; passions-archive-quota.spec.js (29) et mes-passions-page.spec.js (28) verts (pw-A..D.log : 248 tests verts) |
| PRO-C04 | Plafond et quota : existence côté serveur | **DÉFAILLANT** | requête base | requetes-base-2026-09-04.md §2 : user_passions_* = `user_id = auth.uid()` seulement, aucune contrainte de nombre ; profiles UPDATE sans contrainte sur le jsonb ; attaques-resultat.json A : 13 passions vivantes publiées dans profiles.passions ET user_state |
| PRO-C05 | Quota de changements : non réinitialisable par le client | **DÉFAILLANT** | émulation | B-quota-reset-client.json : après 3 archivages facturés (restants 0), réécriture de `state.user.passionChanges.entries` → restants 3, nouvel archivage accepté |
| PRO-C06 | Identité affichée en messagerie : autorité serveur | **DÉFAILLANT** | émulation | C-usurpation-nom-messagerie.json : `content.sp = {n:'Équipe PASSIO', e:'👑', ph:'https://…/usurpe.jpg'}` accepté ; le destinataire affiche le nom usurpé (listeMontreUsurpe=true, listeMontreVrai=false) ; capture C-usurpation-messagerie.png ; aucun trigger sur conv_messages.content |
| PRO-C07 | Identité affichée dans les notifications | **DÉFAILLANT** | inspection code | app-08:4779-4786 : `content = escapeHtml(currentProfile().name) + texte` — nom choisi par le client, RLS ne contraint que from_id |
| PRO-C08 | Identité affichée sur les 4 tables à `author_name` (event_comments, video_lives, step_interactions, cdv_live_comments) | **PROUVÉ** | requête base | requetes-base §3 : `trg_identite_affichage` → `identite_affichage_canonique()` réécrit nom/photo/emoji depuis profiles ; propagation au renommage |
| PRO-C09 | Référentiel plat : toutes les passions publiables (1 908) | **DÉFAILLANT** | émulation | maxrows-emulation-resultat.json : `chargerReferentielPassions` (app-02:1304) fait `select('id')` sans `.range()` ; sous le plafond PostgREST par défaut (1 000) le client voit 1 008 identifiants canoniques et refuse 900 à la publication ; requetes-base §8 : 908 passions au rang physique > 1 000, dont 2 passions VIVANTES de comptes réels (sante-sport-sante rang 1 732) |
| PRO-C10 | Libellés de passion hostiles (jsonb, console) | **PROUVÉ** | émulation | E-jsonb-hostile.json : `<img onerror>` rendu échappé, xss=false ; attaques-resultat E_xss_libelle : xss_declenche=false |
| PRO-C11 | Archives : archiver n'efface rien, restaurer au plafond ouvre le paywall d'échange, passion active jamais archivée | **PROUVÉ** | émulation | D-archive-active-double-restaure.json ; attaques B_double_restore (2 restaurations, 1 seule facturée) |
| PRO-C12 | Mode « Passions illimitées » : porte Paramètres → Démo, réservé aux comptes | **PROUVÉ** | émulation | G-bouton-illimite-parametres.json : boutonPresent=true, gardeCompte=true, après activation plafondActif=false, texte « Passions illimitées : ACTIVÉ » ; Abis-killswitch-plafond.json |
| PRO-C13 | Vitrine publique (profiles.passions) cohérente avec l'état du compte (user_state) | **DÉFAILLANT** | requête base | requetes-base §6 : compte 20762060 : profiles.passions dit moto-enduro VIVANTE, user_state dit ARCHIVÉE ; profiles.passion_id → `art` (archivée des deux côtés) ; compte d59aaaa3 : passion_id `moto` alors que currentProfileId = yoga |
| PRO-C14 | Miroir normalisé user_passions fidèle | **DÉFAILLANT** | requête base | requetes-base §5 : 23 entrées jsonb absentes du miroir ; 3 comptes sur 5 sans aucune ligne ; compte 20762060 : 3 vivantes en jsonb, 0 dans le miroir |
| PRO-C15 | Changement de profil pendant une action (brouillon Studio, conversation ouverte) | **PROBABLE** | émulation | attaques C_studio_brouillon : le brouillon suit la passion nouvellement active (select=sport) ; robustesse B3_switch_conv : le message part avec `sp.pid` du nouveau profil |
| PRO-C16 | Sélecteur Studio après archivage d'une passion | **DÉFAILLANT** | émulation | attaques D_select_perime : après archivage de `sport`, le select propose encore `sport` (encoreProposee=true) et une publication part avec `profil_archive: true` |
| PRO-C17 | Suites e2e du domaine (15 suites) | **PROUVÉ** | test exécuté | pw-A.log 59, pw-B.log 47, pw-C.log 70, pw-D.log 72 verts (248) ; pw-attaques-rejeu.log 7 verts |

### Problèmes (6)

| Id | Priorité retenue | Relecture | Titre |
|---|---|---|---|
| PRO-01 | **P1** | NON VÉRIFIÉ (pas de relecture) | Le référentiel serveur des passions est tronqué par le plafond `max-rows` de PostgREST : ~900 des 1 908 passions restent impubliables, dont une passion vivante d'un compte réel |
| PRO-02 | **P1** | NON VÉRIFIÉ (pas de relecture) | Usurpation d'identité affichée en messagerie et dans les notifications : nom, emoji et photo choisis par l'émetteur, jamais réécrits par le serveur |
| PRO-03 | **P2** | NON VÉRIFIÉ (pas de relecture) | Plafond de 3 passions et quota de changements inexistants côté serveur : 13 passions publiées depuis la console, quota remis à zéro |
| PRO-04 | **P2** | NON VÉRIFIÉ (pas de relecture) | La vitrine publique (profiles.passions, passion_id) diverge de l'état réel du compte (user_state) |
| PRO-05 | **P3** | NON VÉRIFIÉ (pas de relecture) | Le sélecteur du Studio propose encore une passion archivée et publie dans un profil archivé |
| PRO-06 | **P3** | NON VÉRIFIÉ (pas de relecture) | Miroir `user_passions` incomplet (23 entrées manquantes, 3 comptes sur 5 vides) et 79 lignes `user_state` orphelines sur 84 |

### PRO-01 — Le référentiel serveur des passions est tronqué par le plafond `max-rows` de PostgREST : ~900 des 1 908 passions restent impubliables, dont une passion vivante d'un compte réel

| Champ | Valeur |
|---|---|
| Identifiant | PRO-01 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Studio / publication, création d'activité, référentiel plat |
| Résultat attendu | Toute passion du référentiel (1 908, migration appliquée le 2026-09-01) est publiable ; `estPassionCanonique` reconnaît chacune. |
| Résultat observé | `chargerReferentielPassions` (app-02:1304) fait `supa.from('passions').select('id')` sans `.range()`. PostgREST plafonne la réponse (1 000 lignes par défaut sur Supabase). Le client n'ajoute que ces 1 000 ids au socle de 19 : 1 008 canoniques, 900 refusées. En base, 908 passions sont au rang physique > 1 000, dont `sante-sport-sante` (rang 1 732), passion VIVANTE du compte 20762060, et `parentalite-sport-famille` (rang 1 898). Le Studio répond « on ne peut pas encore y publier » et la création d'événement rend `non_canonique`. |
| Reproduction | Émulation (maxrows-emulation.js) : réponse `passions` limitée à 1 000 lignes → canoniques_vues_par_le_client=1008, refusees_a_la_publication=900, verdict_evenement.motif='non_canonique'. En prod : sélectionner une passion de rang > 1 000 dans le Studio. |
| Preuve | preuves/profils-passions/maxrows-emulation-resultat.json ; preuves/profils-passions/ids-1000-ctid.txt ; preuves/profils-passions/requetes-base-2026-09-04.md §8 ; js/app-02-state-utils.js:1296-1345 (le commentaire du 2026-08-31 cite lui-même le plafond max-rows) |
| Impact utilisateur et commercial | Près de la moitié du catalogue promis par la page Rechercher (« 1 908 passions ») est impubliable ; un utilisateur réel ne peut ni publier ni créer d'activité dans l'une de ses trois passions. Contredit docs/PASSIONS_REFERENTIEL_PLAT_2026-09-01.md §11 (« les 1 908 sont désormais publiables »). |
| Visibilité dans le Centre de pilotage | Aucune : le refus est client, avant toute requête. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Charger par pages (`.range(0,999)`, `.range(1000,1999)` …) jusqu'à épuisement, ou faire de `data/passions-v1.json` (déjà 1 908) la source de `estPassionCanonique` (union), ou une RPC `passion_existe(id)` au moment de publier. Valeur `max-rows` réelle du projet à lire dans le tableau de bord Supabase (BLOQUÉ ici). |
| Risque de régression | Faible ; verrou passions-plates.spec.js à compléter (publication d'une passion de rang > 1 000). |
| Effort estimé | 0,5 jour. |

### PRO-02 — Usurpation d'identité affichée en messagerie et dans les notifications : nom, emoji et photo choisis par l'émetteur, jamais réécrits par le serveur

| Champ | Valeur |
|---|---|
| Identifiant | PRO-02 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Messagerie privée, notifications |
| Résultat attendu | Le nom et l'avatar affichés au destinataire viennent du profil serveur de l'expéditeur. |
| Résultat observé | Chaque message porte `content.sp = {n, e, c, pid, ph}` construit par le client (`_msgSenderMeta` app-02:1670-1700) et le destinataire l'applique EN PRIORITÉ sur `profiles` (app-04:4309-4312). Aucun trigger sur `conv_messages.content`. Les notifications embarquent `escapeHtml(currentProfile().name)` (app-08:4779-4781). Un compte peut se présenter comme « Équipe PASSIO 👑 » avec une photo externe. |
| Reproduction | Émulation C : `state.user.name='Équipe PASSIO'`, photo externe → message envoyé ; la liste des conversations du destinataire montre le nom usurpé et pas le vrai (listeMontreUsurpe=true, listeMontreVrai=false). |
| Preuve | preuves/profils-passions/C-usurpation-nom-messagerie.json ; preuves/profils-passions/C-usurpation-messagerie.png ; preuves/profils-passions/matrice-actions-identite-inspection.md ; migrations/migration_identite_affichage_canonique.sql (le mécanisme existe pour 4 autres tables) |
| Impact utilisateur et commercial | Hameçonnage interne (« l'équipe PASSIO te demande… »), harcèlement sous un nom d'emprunt, confiance dans la messagerie. Modération impossible sur l'identité affichée. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Étendre `trg_identite_affichage` à `conv_messages` (réécrire `content->'sp'` depuis profiles) et à `notifications.content`, ou faire lire au destinataire `profiles` en priorité et n'utiliser `sp` que pour la PASSION (pid) ; interdire `ph` externe. |
| Risque de régression | Moyen : `sp` sert aussi à afficher la passion d'écriture (UI-8) ; ne réécrire que n/e/c/ph. |
| Effort estimé | 1 jour. |

### PRO-03 — Plafond de 3 passions et quota de changements inexistants côté serveur : 13 passions publiées depuis la console, quota remis à zéro

| Champ | Valeur |
|---|---|
| Identifiant | PRO-03 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Mes passions — plafond, quota (fiche 16), futur paywall |
| Résultat attendu | Le plafond et le quota, base d'une offre payante future, sont appliqués par le serveur. |
| Résultat observé | user_passions/profiles n'ont ni policy, ni trigger, ni CHECK sur le nombre ; `state.user.passionChanges.entries` est la seule mémoire du quota et se réécrit librement. Attaque A : 13 passions vivantes publiées dans `profiles.passions` et `user_state` ; B : quota 0 → 3 par réécriture locale. |
| Reproduction | Console : pousser 13 entrées dans `state.user.profiles` puis `supaSavePassionState()` ; ou vider `passionChanges.entries`. |
| Preuve | preuves/profils-passions/attaques-resultat.json (A, B) ; preuves/profils-passions/A-plafond-6-passions.json ; preuves/profils-passions/B-quota-reset-client.json ; requetes-base §2 |
| Impact utilisateur et commercial | Le jour où le plafond conditionne un paiement, il est contournable en une ligne ; en attendant, incohérence d'affichage entre comptes. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Trigger BEFORE INSERT/UPDATE sur `user_passions` (≤ 3 vivantes sauf `illimite`) et sur `profiles.passions` (comptage jsonb) ; journal de changements en table serveur. |
| Risque de régression | Moyen : comptes antérieurs au plafond (5 vivantes) à exempter ; fusion multi-appareils bornée (`reinjecterProfilsLocauxBornes`). |
| Effort estimé | 1 à 2 jours. |

### PRO-04 — La vitrine publique (profiles.passions, passion_id) diverge de l'état réel du compte (user_state)

| Champ | Valeur |
|---|---|
| Identifiant | PRO-04 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Profil public, page de passion, référentiel |
| Résultat attendu | Ce que voient les autres = ce que le compte a choisi. |
| Résultat observé | Compte 20762060 : `moto-enduro` vivante dans profiles.passions, archivée dans user_state ; `profiles.passion_id` = `art` (archivée) ; compte d59aaaa3 : passion_id `moto` alors que la passion active est yoga. `.passio/context/MULTI_PROFILE.md` affirme que passion_id porte l'active : faux (`_passionIdPubliable` = première vivante, app-08:2753-2767). |
| Reproduction | Comparer `profiles.passions` et `user_state.data.user.profiles` pour un même compte (requêtes déposées). |
| Preuve | preuves/profils-passions/requetes-base-2026-09-04.md §6 |
| Impact utilisateur et commercial | Un autre utilisateur voit une passion que le compte a quittée ; recherche de créateurs par passion faussée. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Publier la vitrine depuis la même fonction que l'état (`supaSavePassionState` après chaque archivage/restauration), et corriger la doc MULTI_PROFILE.md. |
| Risque de régression | Faible. |
| Effort estimé | 0,5 jour. |

### PRO-05 — Le sélecteur du Studio propose encore une passion archivée et publie dans un profil archivé

| Champ | Valeur |
|---|---|
| Identifiant | PRO-05 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Studio |
| Résultat attendu | Après archivage, la passion sort du sélecteur (nettoyage aux points d'écriture, fiche 13). |
| Résultat observé | Attaque D : après `archiverPassion('sport')`, `#postPassion` propose encore `sport` et la publication part avec `profil_archive: true`. |
| Reproduction | Studio ouvert, archiver la passion sélectionnée depuis Mes passions, revenir au Studio sans re-rendu, publier. |
| Preuve | preuves/profils-passions/attaques-resultat.json (D_select_perime) |
| Impact utilisateur et commercial | Faible (cas de séquence rare) mais contredit l'invariant « la passion active n'est jamais archivée ». |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Re-rendre `#postPassion` dans `archiverPassion` (ou lire `passionsVivantes()` au moment de publier). |
| Risque de régression | Nul. |
| Effort estimé | 0,25 jour. |

### PRO-06 — Miroir `user_passions` incomplet (23 entrées manquantes, 3 comptes sur 5 vides) et 79 lignes `user_state` orphelines sur 84

| Champ | Valeur |
|---|---|
| Identifiant | PRO-06 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Référentiel / hygiène des données |
| Résultat attendu | Le miroir normalisé, prévu pour les requêtes serveur, reflète le jsonb ; user_state n'appartient qu'à des comptes. |
| Résultat observé | requêtes §4-5 : jsonb_only=23, 3 comptes sans ligne ; 79 user_state sans compte auth (sessions de test/visiteurs). |
| Reproduction | Requêtes déposées. |
| Preuve | preuves/profils-passions/requetes-base-2026-09-04.md §4-5 |
| Impact utilisateur et commercial | Toute future requête sur user_passions (créateurs par passion) sera fausse ; volume inutile. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Job de réconciliation + FK user_state.user_id → auth.users (ou purge des orphelins). |
| Risque de régression | Faible. |
| Effort estimé | 0,5 jour. |

### Surfaces saines

- Identité de compte : toujours MY_UID, gardée par RLS sur toutes les tables d'écriture ; `trg_posts_freeze_author` gèle l'auteur d'une publication.
- Plafond 3 / quota 3 / mode illimité : cohérents à l'écran, gardés aux deux bouts côté client, 248 tests verts.
- Archives : archiver n'efface rien, restaurer au plafond propose l'échange, une seule facturation par archivage réel.
- Libellés hostiles échappés partout (jsonb, console).
- Identité canonique serveur (trigger) sur event_comments, video_lives, step_interactions, cdv_live_comments.

### Non vérifié (BLOQUÉ) et ce qu'il faudrait

- Valeur réelle de `max-rows` du projet Supabase : BLOQUÉE (REST direct refusé par le proxy, pg_settings ne l'expose pas) — l'émulation utilise la valeur par défaut Supabase (1 000).
- Relecture adversariale des 6 problèmes : NON FAITE (crédits épuisés).

### Affirmations des anciens rapports confrontées au code actuel

- docs/PASSIONS_REFERENTIEL_PLAT_2026-09-01.md §11 « les 1 908 sont désormais publiables » : faux tant que PRO-01 n'est pas corrigé — le même paragraphe évoque pourtant le plafond max-rows.
- .passio/context/MULTI_PROFILE.md « profiles.passion_id porte l'active » : faux (première vivante publiable).

### Fichiers de preuve

- `preuves/profils-passions/matrice-actions-identite-inspection.md`
- `preuves/profils-passions/requetes-base-2026-09-04.md`
- `preuves/profils-passions/attaques-resultat.json`
- `preuves/profils-passions/A-plafond-6-passions.json`
- `preuves/profils-passions/B-quota-reset-client.json`
- `preuves/profils-passions/C-usurpation-nom-messagerie.json`
- `preuves/profils-passions/C-usurpation-messagerie.png`
- `preuves/profils-passions/D-archive-active-double-restaure.json`
- `preuves/profils-passions/E-jsonb-hostile.json`
- `preuves/profils-passions/F-matrice-actions-identite.json`
- `preuves/profils-passions/G-bouton-illimite-parametres.json`
- `preuves/profils-passions/maxrows-emulation-resultat.json`
- `preuves/profils-passions/pw-A.log … pw-D.log`

### Notes de l'auditeur

Reconstitué par l'orchestrateur le 2026-09-04 à partir des preuves des sous-agents wf_49c0dbab, wf_d7fd44d8 et wf_1ca0cda6 (interrompus). PRO-01 recoupé par lecture directe de js/app-02-state-utils.js:1296-1345 sur le SHA audité.

## Domaine « robustesse-pannes »

> ⚠️ **Domaine reconstitué par l'orchestrateur.** Les trois sous-agents Fable 5.1 affectés à ce domaine ont été interrompus par l'épuisement des crédits de session avant de rendre leur sortie structurée. L'orchestrateur (Fable 5.1 également) a reconstitué contrôles et problèmes à partir des preuves qu'ils avaient déposées (scripts, captures, journaux, requêtes) et de vérifications ciblées dans le code du SHA audité. **Aucune relecture adversariale n'a pu être faite sur ces problèmes** : ils sont marqués « NON VÉRIFIÉ (pas de relecture) » et sont prioritaires pour la contre-revue GPT-6 Astra.

Domaine robustesse (doubles clics, actions simultanées, perte réseau, reprise, permissions refusées, changement de profil pendant une action, pannes API) reconstitué par l'orchestrateur à partir d'un banc de chaos Playwright de 33 scénarios écrit et exécuté par les sous-agents Fable 5.1 (observations JSONL horodatées) et de 8 suites existantes (21 tests verts, 2 ignorés). Les protections contre le double envoi (publication, message, like) tiennent ; le mode hors-ligne du fil et la file d'envoi des messages fonctionnent ; les refus de permission ne cassent rien. Trois défauts de REPRISE : une publication faite hors ligne n'est jamais envoyée (reste « Sync… » après reconnexion et rechargement), un RSVP hors ligne n'est jamais rejoué, et une session expirée (401) ou un serveur en panne (500/429) ne produisent aucun message à l'utilisateur. Aucune relecture adversariale (crédits épuisés).

### Contrôles (15)

| Id | Contrôle | Statut | Méthode | Preuve |
|---|---|---|---|---|
| ROB-C01 | Double clic « J'aime » | **PROUVÉ** | test exécuté | 02-chaos-observations.jsonl A1_like : dblclick → 1 POST post_likes + 1 notification ; deux clics à 1 s → DELETE puis POST (bascule attendue) |
| ROB-C02 | Double clic « Publier » | **PROUVÉ** | test exécuté | A3_publier : 1 seul POST posts, 1 post local |
| ROB-C03 | Double clic « Envoyer » (message) | **PROUVÉ** | test exécuté | A4_envoyer : 1 POST conv_messages, outbox 0 |
| ROB-C04 | RSVP concurrent (deux appels simultanés) | **PROBABLE** | test exécuté | A2_rsvp : 2 PATCH + 2 POST event_attendees partent ; état final cohérent côté client (PK serveur dédoublonne) — capacité non vérifiée serveur (IRL-05) |
| ROB-C05 | Double clic « Suivre » / « Bloquer » | **DÉFAILLANT** | test exécuté | A5_suivre : POST follows puis DELETE follows, toasts « Tu suis Autre ! » puis « Tu ne suis plus Autre », état final NON suivi ; A6_bloquer : 2 POST blocks, 2 toasts |
| ROB-C06 | Message et publication simultanés | **PROUVÉ** | test exécuté | B1_simultane : 1 conv_messages + 1 posts, ordre conservé |
| ROB-C07 | Changement de profil pendant un brouillon Studio / une conversation ouverte | **PROBABLE** | test exécuté | B2_switch_studio : le brouillon est publié sous la nouvelle passion (select suit `switchToProfile`) ; B3_switch_conv : le message porte `sp.pid` du nouveau profil (voir PRO-02) |
| ROB-C08 | Fil hors ligne : bannière, cache, retour en ligne | **PROUVÉ** | test exécuté | C1_fil_offline : bannière « Mode hors-ligne — contenu en cache », 20 cartes, toast « 🟢 Connexion rétablie » au retour |
| ROB-C09 | Message envoyé hors ligne : file d'envoi et reprise | **PROBABLE** | test exécuté | C2_message_offline : statut failed + « réessayer », outbox 1 ; D_reload_file : après rechargement en ligne, message envoyé, outbox 0. Deux flush concurrents ont produit 2 envois en double (envoisDbl dup=true ×2) — PK serveur protège, mais le statut reste « failed » |
| ROB-C10 | Publication hors ligne : reprise à la reconnexion | **DÉFAILLANT** | test exécuté | C3_publication_offline : post local `sync: syncing`, toast « Post en local (connexion lente) » ; après retour en ligne : 0 POST posts ; après rechargement : 0 POST posts, post toujours `syncing` |
| ROB-C11 | RSVP hors ligne : reprise | **DÉFAILLANT** | test exécuté | C4_rsvp_offline : état local going, POST/PATCH échouent, aucune annulation optimiste, reprise automatique = un seul GET event_attendees (le RSVP n'est jamais rejoué) |
| ROB-C12 | Changement de passion hors ligne : reprise | **PROUVÉ** | test exécuté | C5_passion_offline : clé pending posée ; rejouée au rechargement (POST user_state ×2, pending vidé) |
| ROB-C13 | Permissions refusées (micro, caméra, géolocalisation, notifications, partage) | **PROUVÉ** | émulation | E_permissions : micro → toast + statut « Micro non accessible » ; caméra → éditeur sans caméra (placeholder) ; géoloc → repli Paris SANS message ; push denied → rien ; aucune erreur JS |
| ROB-C14 | Pannes API simulées : 500, 401, 429 sur toutes les requêtes Supabase | **DÉFAILLANT** | test exécuté | F_api_500/401/429 : fil actif, 5 écrans navigables, aucune erreur JS ; mais toasts=[] et bannière none dans les trois cas (aucun message à l'utilisateur) ; 28 requêtes en 30 s (rejeux) |
| ROB-C15 | Suites existantes de robustesse (8) | **PROUVÉ** | test exécuté | 01-suites-existantes.txt : feed-malformed-post, feed-realtime-course, monitoring-bruit, monitoring-file-boot, publication-optimiste-refusee, supa-hors-ligne, transfert-message, version-skew → 21 verts, 2 ignorés |

### Problèmes (6)

| Id | Priorité retenue | Relecture | Titre |
|---|---|---|---|
| ROB-01 | **P2** | NON VÉRIFIÉ (pas de relecture) | Une publication faite hors ligne n'est jamais envoyée : elle reste « Sync… » après la reconnexion et après rechargement |
| ROB-02 | **P2** | NON VÉRIFIÉ (pas de relecture) | Un RSVP fait hors ligne reste affiché « J'y vais » mais n'est jamais rejoué |
| ROB-03 | **P2** | NON VÉRIFIÉ (pas de relecture) | Session expirée (401) ou serveur en panne (500/429) : aucune information à l'utilisateur, les écritures échouent en silence |
| ROB-04 | **P3** | NON VÉRIFIÉ (pas de relecture) | Double tap sur « Suivre » désabonne ; double tap sur « Bloquer » envoie deux écritures et deux toasts |
| ROB-05 | **P3** | NON VÉRIFIÉ (pas de relecture) | Géolocalisation refusée : repli silencieux sur Paris, l'écran affiche « Paris » comme si c'était la position de l'utilisateur |
| ROB-06 | **P3** | NON VÉRIFIÉ (pas de relecture) | Deux vidages concurrents de la file d'envoi renvoient le même message deux fois |

### ROB-01 — Une publication faite hors ligne n'est jamais envoyée : elle reste « Sync… » après la reconnexion et après rechargement

| Champ | Valeur |
|---|---|
| Identifiant | ROB-01 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | PLAUSIBLE |
| Fonctionnalité | Studio — publication, file de publication |
| Résultat attendu | Une publication acceptée localement est rejouée au retour du réseau ou au prochain démarrage, ou son échec est annoncé. |
| Résultat observé | Hors ligne : post local `sync: syncing`, toast « Post en local (connexion lente) ». Retour en ligne : aucun POST posts. Rechargement en ligne : aucun POST posts, le post est toujours `syncing`. L'utilisateur croit avoir publié. |
| Reproduction | Banc chaos2.spec.js scénario C3 : `context.setOffline(true)`, publier, `setOffline(false)`, attendre, recharger, compter les POST /rest/v1/posts. |
| Preuve | preuves/robustesse-pannes/02-chaos-observations.jsonl (C3_publication_offline) ; preuves/robustesse-pannes/chaos2.spec.js |
| Impact utilisateur et commercial | Perte silencieuse de contenu ; incohérence entre l'appareil et le réseau (fil des autres sans le post). |
| Visibilité dans le Centre de pilotage | Partielle : `post_publish` sans verdict d'écriture ; aucun compteur de publications en attente. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | File de publication persistée (comme `passio_outbox_v1` des messages) rejouée au retour en ligne et au boot, avec état « échec » visible et bouton « réessayer ». |
| Risque de régression | Moyen : interactions avec `supaPublishPostWithRetry` et les pierres tombales. |
| Effort estimé | 1 jour. |

### ROB-02 — Un RSVP fait hors ligne reste affiché « J'y vais » mais n'est jamais rejoué

| Champ | Valeur |
|---|---|
| Identifiant | ROB-02 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | PLAUSIBLE |
| Fonctionnalité | IRL — RSVP |
| Résultat attendu | Échec réel = annuler l'affichage optimiste (invariant CLAUDE.md) ou rejouer plus tard. |
| Résultat observé | POST/PATCH event_attendees échouent hors ligne, l'état local reste going, la reprise automatique ne fait qu'un GET. |
| Reproduction | Scénario C4_rsvp_offline. |
| Preuve | preuves/robustesse-pannes/02-chaos-observations.jsonl (C4_rsvp_offline) |
| Impact utilisateur et commercial | L'utilisateur se croit inscrit, l'organisateur ne le voit pas. |
| Visibilité dans le Centre de pilotage | Partielle (`irl_join_failed(offline)` existe dans le funnel, mais l'écran ne le reflète pas). |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Annuler l'état optimiste sur échec (le funnel émet déjà `irl_join_failed`) ou file de rejeu. |
| Risque de régression | Faible. |
| Effort estimé | 0,5 jour. |

### ROB-03 — Session expirée (401) ou serveur en panne (500/429) : aucune information à l'utilisateur, les écritures échouent en silence

| Champ | Valeur |
|---|---|
| Identifiant | ROB-03 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Toute l'application |
| Résultat attendu | Bannière ou toast « Connexion au serveur impossible / reconnecte-toi » ; les écritures refusées sont visibles. |
| Résultat observé | Avec toutes les requêtes Supabase en 500, 401 ou 429 : fil actif depuis le cache, navigation possible, toasts=[] et bannière none ; 28 requêtes en 30 s de rejeux. |
| Reproduction | Scénarios F_api_500 / F_api_401 / F_api_429 (route Playwright renvoyant le statut). |
| Preuve | preuves/robustesse-pannes/02-chaos-observations.jsonl (F_*) |
| Impact utilisateur et commercial | En incident réel (Supabase down, quota dépassé, jeton expiré), les utilisateurs continuent d'agir sur un état qui ne part pas ; support inondé de « ça ne marche pas » sans message. |
| Visibilité dans le Centre de pilotage | OUI : les `api` 5xx/4xx remontent en télémétrie (alertes api5xx) — mais l'utilisateur, lui, ne voit rien. |
| Détection par la Sentinelle | Oui pour 5xx (règle api5xx) ; non pour 401. |
| Proposition de correction | Écouter les verdicts d'écriture (`_writeVerdict`) et les 401 du hook fetch pour afficher une bannière d'état serveur et forcer la reconnexion sur 401. |
| Risque de régression | Faible. |
| Effort estimé | 0,5 jour. |

### ROB-04 — Double tap sur « Suivre » désabonne ; double tap sur « Bloquer » envoie deux écritures et deux toasts

| Champ | Valeur |
|---|---|
| Identifiant | ROB-04 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Profil visité |
| Résultat attendu | Un bouton d'état ignore le second tap pendant l'écriture en cours. |
| Résultat observé | A5 : POST follows puis DELETE follows en 300 ms, deux toasts contradictoires, état final « Suivre » ; A6 : 2 POST blocks. |
| Reproduction | Scénarios A5_suivre, A6_bloquer. |
| Preuve | preuves/robustesse-pannes/02-chaos-observations.jsonl |
| Impact utilisateur et commercial | Faible : confusion, écriture inutile. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Verrou `_followBusy[uid]` pendant l'écriture (comme pour like/publier). |
| Risque de régression | Nul. |
| Effort estimé | 0,25 jour. |

### ROB-05 — Géolocalisation refusée : repli silencieux sur Paris, l'écran affiche « Paris » comme si c'était la position de l'utilisateur

| Champ | Valeur |
|---|---|
| Identifiant | ROB-05 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | IRL — Ma ville / Autour de moi |
| Résultat attendu | Message « Localisation refusée — résultats pour Paris » et possibilité de saisir sa ville. |
| Résultat observé | E_permissions.geoloc : titre « Paris », aucune toast, drapeau d'erreur interne posé. |
| Reproduction | Refuser la permission puis ouvrir Rencontrer → « Autour de moi ». |
| Preuve | preuves/robustesse-pannes/02-chaos-observations.jsonl (E_permissions) ; preuves/appareils-a11y/geo-refus.json |
| Impact utilisateur et commercial | Faible : résultats trompeurs pour un utilisateur hors Île-de-France. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Toast explicite + champ ville. |
| Risque de régression | Nul. |
| Effort estimé | 0,25 jour. |

### ROB-06 — Deux vidages concurrents de la file d'envoi renvoient le même message deux fois

| Champ | Valeur |
|---|---|
| Identifiant | ROB-06 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | PLAUSIBLE |
| Fonctionnalité | Messagerie — file `passio_outbox_v1` |
| Résultat attendu | Le vidage est idempotent (verrou) ; un message en file n'est envoyé qu'une fois. |
| Résultat observé | Deux `_flushOutbox` en parallèle : 4 envois pour 2 messages, 2 doublons ; le serveur dédoublonne par clé primaire (id client), mais le statut reste « failed » dans ce scénario. |
| Reproduction | Scénario C2_message_offline (doubleFlush). |
| Preuve | preuves/robustesse-pannes/02-chaos-observations.jsonl (C2_message_offline) |
| Impact utilisateur et commercial | Faible tant que la PK tient ; bruit réseau. |
| Visibilité dans le Centre de pilotage | Aucune. |
| Détection par la Sentinelle | Non. |
| Proposition de correction | Verrou `_flushBusy` + relecture de la file avant chaque envoi. |
| Risque de régression | Faible. |
| Effort estimé | 0,25 jour. |

### Surfaces saines

- Anti double envoi : like, publication, message — une seule écriture.
- Fil hors ligne : bannière, cache de 20 cartes, retour en ligne annoncé.
- File d'envoi des messages persistée et rejouée au rechargement (IndexedDB + localStorage).
- Refus micro/caméra/notifications : aucune erreur JS, l'app reste utilisable.
- Version skew : index.html réseau d'abord, assets hachés (5 tests), post malformé sauté, course realtime/requête gérée.

### Non vérifié (BLOQUÉ) et ce qu'il faudrait

- Rejeu des scénarios sur appareil réel (mise en veille, changement de réseau Wi-Fi→4G, bascule d'onglet) : non réalisé.
- Comportement sur 401 réel (jeton expiré après 1 h) : simulé par route Playwright, non vécu.
- Les 33 scénarios du banc n'ont pas tous produit d'observation exploitable avant l'interruption ; 20 observations horodatées sont déposées.
- Relecture adversariale des 6 problèmes : NON FAITE.

### Affirmations des anciens rapports confrontées au code actuel

- docs/PIEGES_CONNUS.md (« Écritures qui échouent en silence », « Échec réel = annuler l'affichage optimiste ») : l'invariant est documenté mais ROB-02 montre qu'il n'est pas tenu pour le RSVP hors ligne.

### Fichiers de preuve

- `preuves/robustesse-pannes/chaos.spec.js`
- `preuves/robustesse-pannes/chaos2.spec.js`
- `preuves/robustesse-pannes/playwright.chaos.config.js`
- `preuves/robustesse-pannes/02-chaos-observations.jsonl`
- `preuves/robustesse-pannes/04-chaos-sortie-brute.txt`
- `preuves/robustesse-pannes/01-suites-existantes.txt`

### Notes de l'auditeur

Reconstitué par l'orchestrateur le 2026-09-04 (sous-agents wf_9ad7c9d4 et wf_dde7d72b interrompus). Les scénarios C3 et C4 (reprise) sont marqués PLAUSIBLE : mesurés sur une fenêtre courte, un rejeu différé (minuteur > 30 s) n'est pas exclu — à confirmer en contre-revue.

## Domaine « tests-ci »

Audit en lecture seule du dispositif de test et de livraison sur le SHA c8cb8e99 (branche audit, git status vide à la fin). Méthode : inventaire mécanique (playwright --list, comptage test( par fichier), exécution de npm run verif (vert, 1,4 s), exécution d'un échantillon de 8 suites locales sur le port 8115 deux fois de suite (28 passés / 4 skippés, 0 flaky, 4,3 et 4,6 min), exécution des gates artefact sur dist (6 passés), exécution des 349 tests unitaires du dashboard (verts), lecture de l'API GitHub publique (run 33861671142 et 100 derniers runs), attaque par mutation des deux gates de qualité des tests (copies en scratchpad), croisement parcours critiques × specs par grep ciblé, confrontation des anciens rapports (897 suites, 175 e2e, 15,2 %, 13 invariants, 94 backend).
Verdict du domaine : la base est solide sur le NAVIGATEUR LOCAL (1103 tests, 8 gates statiques, suite reproductible, pas de flaky mesuré ici) et le gate d'autorisation en CI est réel (12 invariants REST bruts sur comptes réels). Mais la commercialisation n'est pas couverte : aucun test n'exerce l'inscription réelle par e-mail ni le mot de passe oublié, la messagerie/realtime/suppression de compte cross-compte ne tournent JAMAIS en CI (opt-in, et une suite y référence 6 fonctions supprimées), il n'existe ni staging ni test de restauration/rollback, les deux gates « tests creux » et « isolation » se contournent trivialement, la couverture « 15,2 % » n'est plus reproductible (dénominateur 435→355, mesure de 19 jours), la chaîne main dure 37 min dont 20 min de déploiement (17 min d'outils npx non épinglés), et main a été rouge 4 fois en 2 jours (déploiement sauté à chaque fois). Statut global du domaine : PARTIEL — livrable en beta privée, pas en lancement public sans les P1.

### Contrôles (33)

| Id | Contrôle | Statut | Méthode | Preuve |
|---|---|---|---|---|
| TCI-C01 | Inventaire des tests Playwright (local / prod / total) et par fichier | **PROUVÉ** | test exécuté | npx playwright test --list --project=local → « Total: 1103 tests in 124 files » ; --project=prod → « 15 tests in 7 files » ; sans projet → 1118/131. Comptage test( : 1053 (preuves/tests-ci/tests-par-fichier.txt ; écart = describe paramétrés). Répartition par domaine : passions 261, irl 170, feed 138, auth/first-run 102, shell/nav 89, bobines/studio 84, profil 66, messagerie/notifs 49, sécurité/échappement 36, sync/supabase 18, monitoring/perf 13 |
| TCI-C02 | Suites opt-in et suites skippées | **PROUVÉ** | inspection code | tests/e2e/multi-comptes.spec.js:21, confidentialite.spec.js:21, suppression-compte.spec.js:28 → test.skip(!PASSIO_E2E_MULTI) ; qa-campaign.spec.js:63 → PASSIO_QA_CAMPAIGN ; release-integrity.spec.js:7 et passion-context.spec.js:5 → skip sauf PASSIO_CIBLE=dist ; monitoring-bruit.spec.js:56 skip si CDN injoignable. Aucune de ces variables opt-in n'est définie dans .github/workflows/deploy.yml (grep PASSIO_E2E_MULTI = 0) |
| TCI-C03 | Durée CI par shard et par job (run 33861671142) | **PROUVÉ** | requête base | API GitHub (preuves/tests-ci/run-33861671142-jobs.json) : shards 6,0 / 13,8 / 8,1 / 7,2 / 8,0 / 14,4 min ; « Installer Playwright » 7,4 min par job (28,5 min cumulées sur 8 jobs) ; Suites production 5,8 min ; Audits 2,8 min ; Gates artefact 4,3 min ; Déploiement production 20,0 min (Minify index 7,0 + app.js 5,2 + css 5,0 + Netlify 2,5). Total 10:07:06 → 10:44:12 = 37 min |
| TCI-C04 | Flakiness dans les derniers runs (retries 2 en CI) | **BLOQUÉ** | non réalisé | GET /actions/jobs/{id}/logs → « CONNECT tunnel failed, response 403 » (proxy) ; MCP github en échec (AUTH_HEADER_REJECTED) ; gh CLI absent. Indice indirect : shards 2/6 et 6/6 durent 13,8 et 14,4 min contre 6–8 min pour les autres (retries ou suites lourdes, indiscernable). Il faudrait un jeton GitHub Actions:read ou l'accès aux logs |
| TCI-C05 | Stabilité locale : échantillon ciblé (smoke, projets-playwright, dist-build, release-integrity, version-skew, latence-percue, adr-009, adr-010) | **PROUVÉ** | test exécuté | PASSIO_PORT=8115 npx playwright test --project=local <8 fichiers> --workers=1 --reporter=line : run1 « 28 passed, 4 skipped (4.3m) EXIT=0 » ; run2 « 28 passed, 4 skipped (4.6m) EXIT=0 » (preuves/tests-ci/echantillon-local-run1.txt, run2.txt). Les 4 skippés = release-integrity sans PASSIO_CIBLE=dist |
| TCI-C06 | Gates artefact de production (release-integrity + passion-context sur dist) | **PROUVÉ** | test exécuté | PASSIO_CIBLE=dist PASSIO_PORT=8116 COMMIT_REF=c8cb8e99… npx playwright test release-integrity passion-context → « 6 passed (1.4m) EXIT=0 » (preuves/tests-ci/gates-artefact-dist-local.txt) |
| TCI-C07 | Gates statiques npm run verif (8 gates + référentiel) | **PROUVÉ** | test exécuté | npm run verif → CSS sain, 0 collision de globals (1384 déclarations), 0 handler fantôme (652 handlers), échappement 63 signalements tous au socle, tests creux OK (131 specs, 1312 fonctions), stub Supabase 45/45, télémétrie 81 clés OK, isolation 31 navigants / 5 au socle, référentiel 1908 passions valide ; real 1,43 s |
| TCI-C08 | Gate anti-tests creux : résistance à un test creux | **DÉFAILLANT** | test exécuté | Copie de scripts/audit-tests-creux.js dans scratchpad/preuves/tests-ci/creux-mutation/ avec un spec faisant page.setContent('<b id=a>1</b>') puis expect(locator('#a').textContent()).toBe('1') → « OK — aucun spec ne vérifie uniquement ses propres constructions », exit 0. Cause : scripts/audit-tests-creux.js:47 (regex UI) accepte tout fichier contenant `locator(` |
| TCI-C09 | Gate isolation des suites : résistance à un marqueur factice | **DÉFAILLANT** | test exécuté | Copie de scripts/audit-tests-isolation.js + socle dans scratchpad/preuves/tests-ci/isolation-mutation/ avec un spec qui fait page.goto('/index.html') et #feedList, le texte « sansDonneesDistantes( » n'étant présent QUE dans un commentaire → « OK », exit 0. Cause : scripts/audit-tests-isolation.js:71 (regex sur le source après retrait des seules lignes require) |
| TCI-C10 | Tests qui recopient le code de production (piège connu) | **PROBABLE** | inspection code | Aucun cas franc trouvé par relecture des 8 suites exécutées ; le gate mécanique est contournable (TCI-C08) donc la garantie repose sur la relecture humaine. Marqueurs mutation/réinjection/contre-épreuve : 18 fichiers sur 131 (13,7 %) déclarent une épreuve par mutation |
| TCI-C11 | Assertions existence vs visibilité (fiche 12) | **CONFORME PAR INSPECTION** | inspection code | grep : 306 toBeVisible, 26 offsetParent, contre 77 assertions d'existence (toBeAttached / count()>0 / toBeTruthy) ; 0 spec sans expect( |
| TCI-C12 | Tests dépendant de la production (projet prod) et création de comptes réels en prod | **PROUVÉ** | inspection code | playwright.config.js:40-48 SUITES_PROD (7). En CI : authz-critical (2 creerCompteE2E), blocage-acces (2), user-state-horodatage (1) = 5 comptes réels par run, job test-prod avec SUPABASE_SERVICE_ROLE_KEY (deploy.yml). 33 push + 52 PR réussis en 2 jours ≈ 85 runs × 5 comptes. Canari horaire sentinelle-distante.yml (cron 17 * * * *) rejoue authz-critical en prod : +48 comptes/jour. Comptes créés via /auth/v1/admin/users (compte-e2e.js:107) puis purgés par global-teardown seulement si CI && PASSIO_E2E_PROD=1 |
| TCI-C13 | Purge %@passio-e2e.test : risque pour un vrai utilisateur | **CONFORME PAR INSPECTION** | inspection code | scripts/purge-e2e-rest.js:88-92 exige endsWith('@passio-e2e.test') (jamais includes) ; scripts/purge_e2e_accounts.sql:12 like '%@passio-e2e.test'. Le TLD .test est réservé (RFC 2606, non routable) : un vrai inscrit avec cette adresse ne recevrait jamais l'e-mail de confirmation (SMTP Brevo), son compte resterait inutilisable puis serait purgé. Aucun refus côté app de ce domaine (grep js/ = 0) : résidu théorique acceptable |
| TCI-C14 | Workflow deploy.yml : gates présentes | **CONFORME PAR INSPECTION** | inspection code | .github/workflows/deploy.yml : governance (PR obligatoire, contre-revue PASSIO74 sur périmètre critique), audits (7 audits statiques + référentiel + frontière de confiance + banc T&S Postgres jetable + migration référentiel + dashboard npm test), test-prod (--project=prod, verrou passio-e2e-prod), test-local 6 shards, gates-artefact (dist), smoke (agrégateur), deploy (needs governance+audits+test-prod+test-local+gates-artefact), preview PR |
| TCI-C15 | Gates manquantes en CI (lint, typecheck, npm audit, Lighthouse, WebKit, visuel, restauration, secrets) | **DÉFAILLANT** | inspection code | deploy.yml : 0 lint, 0 node --check, 0 npm audit, 0 Lighthouse, 0 WebKit/Firefox (playwright.config.js : aucun `devices`, Chromium seul), 0 toHaveScreenshot dans tests/e2e, 0 test de restauration (sauvegarde-donnees.js jamais exercé), 0 scan de secrets, .github/dependabot.yml absent. npm audit exécuté ici : app 1 high (sharp <0.35.0, devDep) + 1 moderate (qs) ; dashboard 3 moderate (body-parser, express 4.22.2, qs) |
| TCI-C16 | Débit de livraison : concurrency, durée totale, un seul run main à la fois | **PROUVÉ** | requête base | deploy.yml concurrency group 'passio-deploy-main' (push) / 'passio-ci-pr-N', cancel-in-progress false. 100 derniers runs (02→04 sept, preuves/tests-ci/deploy-runs-100.json) : médiane main 9,2 min quand la suite est rapide, max 64,2 min ; run 2483 62 min, 2490 44 min, 2494 37 min. push/cancelled 1 (run 2492 : un commit de main n'a jamais eu son propre déploiement) |
| TCI-C17 | Déploiement sur push main sans approbation manuelle | **CONFORME PAR INSPECTION** | inspection code | deploy.yml job deploy : `if: github.event_name == 'push'`, aucun `environment:` (grep = 0) donc aucun reviewer requis ; garde = PR associée (gh api commits/{sha}/pulls) + contre-revue sur périmètre critique. Protection de branche GitHub : BLOQUÉ (HTTP 403) |
| TCI-C18 | Preview PR branchée sur la prod Supabase | **PROUVÉ** | inspection code | js/app-08-ui-modals-tour.js:2551 `const SUPABASE_URL = "https://njkiyoklssvefstljemx.supabase.co"` en dur ; scripts/build.js ne substitue rien (seuls COMMIT_REF/PASSIO_BUILD_TIME lus, lignes 80/90) ; job preview needs [governance, audits] seulement — déployé AVANT les tests navigateur |
| TCI-C19 | Couverture fonctionnelle (npm run couverture) et fraîcheur de la mesure | **DÉFAILLANT** | test exécuté | npm run couverture → « Mesurée le 2026-08-16T17:14 ; Interactions 355 ; Exécutées 38 ; Taux 10,7 % ; ⚠ 28 noms mesurés absents du code actuel : mesure à refaire ; ⚠ dénominateur 435 → 355 ». npm run couverture:risque → 19 interactions qui ÉCRIVENT en base jamais exercées (mePublish, submitEvent, publishStoryFromComposer, shareLocation, inviteToEvent…). Re-mesure = suite complète sous PASSIO_COUVERTURE=1 (orchestrateur) |
| TCI-C20 | Parcours critiques sans test automatisé (matrice) | **DÉFAILLANT** | inspection code | grep sur tests/e2e : resetPasswordForEmail 0 spec ; signUp réel 0 (confirmation-email.spec.js:48 double supa.auth) ; RTCPeerConnection/startCall 0 ; pushManager/notify-call 0 (supa-hors-ligne = stub) ; storage upload réel 0 ; export de données 0 ; ask-ai 0 ; rollback 0 ; restauration 0 ; Sentinelle bout-en-bout 0 (dashboard = 349 tests unitaires sans supabase.co) ; géocodage doublé (irl.spec.js:67-69) ; MapLibre jamais initialisé par un test (navigation.spec.js:26 le contourne) |
| TCI-C21 | Suites opt-in : viabilité sur le code actuel | **DÉFAILLANT** | inspection code | tests/e2e/multi-comptes.spec.js:619 et :712 (carnet de voyage cross-compte, CDV v2) appellent openVlogViewer, supaAddCarnetCollaborator, supaAddCdvCollaborator, supaAddCdvLiveStep, supaPublishCdvLive, supaUpdateCdvLiveStep : 0 définition dans js/ (retrait ADR-011 du 2026-08-31). La suite échouerait dès qu'on l'activerait |
| TCI-C22 | Suites prod exécutées | **BLOQUÉ** | non réalisé | Interdiction (comptes réels + SUPABASE_SERVICE_ROLE_KEY). Preuve de substitution : job « Suites production (comptes réels) » du run 33861671142 success, 10:09:47→10:15:35 |
| TCI-C23 | Affirmation « 897 suites navigateur » (CLAUDE.md:40) | **DÉFAILLANT** | test exécuté | Mesuré 1103 tests / 124 fichiers en projet local (+23 % en 2 jours ; chiffre posé le 2026-09-02, commit e773ed4). Le mot « suites » est impropre : ce sont des tests |
| TCI-C24 | Affirmation « 175 e2e passés (1 flaky, 1 skipped) + 94 backend » (PASSIO_PRODUCTION_READINESS.md:26) | **DÉFAILLANT** | test exécuté | Aujourd'hui 1118 tests e2e listés et 349 tests dashboard (cd dashboard && npm test : « # tests 349 # pass 349 »). Affirmation datée du 2026-08-16, périmée d'un facteur 6 et 3,7 |
| TCI-C25 | Affirmation « 13 invariants AUTHZ » (PASSIO_PRODUCTION_READINESS.md:10,16 ; passio_qa_registry.json) | **DÉFAILLANT** | inspection code | tests/e2e/authz-critical.spec.js : UN seul test( (ligne 36), 12 blocs numérotés 0 à 11 (lignes 100,132,140,152,158,164,171,180,186,224,276,282), 29 expect(). Le compte de 13 n'est pas reproductible sur le code actuel (12 invariants + contre-épreuves) |
| TCI-C26 | Banc RLS Postgres jetable : périmètre | **CONFORME PAR INSPECTION** | inspection code | tests/sql/migration-ts-serveur.test.sh applique la SEULE migration migration_ts_serveur_age_blocage.sql sur un socle de 97 lignes (tests/sql/socle-prod.sql) — 9 comptes fictifs, scénarios T&S/âge/blocage. Il ne rejoue pas les 125 policies de production ni les 64 fichiers de migrations/ |
| TCI-C27 | Hygiène du workflow : timeouts, artefacts, épinglage des outils | **DÉFAILLANT** | inspection code | deploy.yml : timeout-minutes = 0 occurrence (défaut 6 h par job, dans un groupe de concurrence sérialisé) ; upload-artifact = 0 (aucune trace/rapport Playwright conservé en cas d'échec) ; `npm install --no-save @playwright/test` (version flottante ^1.49 → 1.60.0 aujourd'hui, package-lock ignoré pour ce paquet) ; `npx --yes html-minifier-terser`, `terser`, `clean-css-cli` non épinglés (netlify-cli seul épinglé 27.1.2) |
| TCI-C28 | Artefact MINIFIÉ testé avant mise en ligne | **DÉFAILLANT** | inspection code | La minification n'a lieu que dans le job deploy (deploy.yml, après tous les tests) ; scripts/servir-dist.js:25-26 l'écrit : « Ce que ça ne prouve PAS : le comportement APRÈS minification ». Chaque étape de minification porte `\|\| echo "Minification échouée, déploiement du fichier brut"` : un minifieur cassé n'arrête rien |
| TCI-C29 | Tests manuels tests/*.html, test-irl.js, TEST_*.md | **DÉFAILLANT** | inspection code | tests/test-simple.html (« Test Toggle »), test-emoji*.html, test-messagerie-complet.html, test-panel-iso.html, test-quick-check.html, test-debug.html, test-final-verification.html, test-irl.js, test-time-filter.js, TEST_MULTISELECT.md, TEST_PUBLICATION_MULTIAPPAREILS.md : 0 référence dans package.json, CLAUDE.md, docs/*.md. Harnais manuels morts |
| TCI-C30 | Taux de rouge sur main et sur PR | **PROUVÉ** | requête base | deploy-runs-100.json : push/failure 4 sur 38 runs main (2444, 2437, 2413, 2409 — 10,5 %) → « Déploiement production » sauté 4 fois en 2 jours ; PR/failure 8 sur 62 |
| TCI-C31 | Télémétrie des tests locaux n'atteint pas la prod | **CONFORME PAR INSPECTION** | inspection code | js/telemetry.js:71 (localhost/127.0.0.1 → false) ; js/platform.js:42 ; verrou tests/e2e/telemetrie-preauth.spec.js:122 « envois de télémétrie non sollicités depuis localhost : 0 » |
| TCI-C32 | Campagne QA multi-utilisateurs (qa-campaign) : fraîcheur | **DÉFAILLANT** | inspection code | tests/qa-report.md généré le 2026-08-09 (26 jours), 7/10 utilisateurs, « Version app : inconnu ». Suite opt-in jamais rejouée en CI |
| TCI-C33 | Émulation d'appareils | **CONFORME PAR INSPECTION** | inspection code | playwright.config.js:66 viewport unique 390×844, locale fr-FR, Chromium seul ; cadrage.spec.js:14 boucle sur plusieurs viewports (iPhone SE 375×667…). Aucun WebKit : iOS Safari, cible PWA principale, NON RÉALISÉ |

### Problèmes (16)

| Id | Priorité retenue | Relecture | Titre |
|---|---|---|---|
| TCI-01 | **P1** | NON VÉRIFIÉ (pas de relecture) | Messagerie, realtime, confidentialité et suppression de compte cross-compte ne tournent JAMAIS en CI (opt-in) et la suite multi-comptes est cassée par le retrait CDV |
| TCI-02 | **P1** | NON VÉRIFIÉ (pas de relecture) | Inscription réelle par e-mail (SMTP Brevo) et « mot de passe oublié » n'ont aucun test automatisé |
| TCI-03 | **P1** | NON VÉRIFIÉ (pas de relecture) | Restauration de sauvegarde et rollback ne sont jamais exercés par un test |
| TCI-04 | **P1** | NON VÉRIFIÉ (pas de relecture) | Aucun environnement de staging : tests, canari horaire et previews de PR écrivent tous sur la base de production |
| TCI-05 | **P2** | NON VÉRIFIÉ (pas de relecture) | Le gate « tests creux » est contournable par n'importe quel locator() sur une page fabriquée |
| TCI-06 | **P3** | NON VÉRIFIÉ (pas de relecture) | Le gate d'isolation des suites est satisfait par le nom de la fonction dans un commentaire |
| TCI-07 | **P2** | NON VÉRIFIÉ (pas de relecture) | La couverture fonctionnelle « 15,2 % » n'est plus reproductible : mesure de 19 jours, dénominateur 435→355, 19 écritures en base jamais exercées |
| TCI-08 | **P2** | NON VÉRIFIÉ (pas de relecture) | Chaîne main de 37 min dont 20 min de déploiement passées à télécharger des minifieurs non épinglés ; 28 min cumulées d'installation Playwright |
| TCI-09 | **P2** | NON VÉRIFIÉ (pas de relecture) | L'artefact réellement servi (minifié par terser --mangle) n'est testé par rien, et un échec de minification est masqué |
| TCI-10 | **P2** | NON VÉRIFIÉ (pas de relecture) | Main rouge 4 fois en 2 jours (10,5 % des runs) : chaque rouge saute le déploiement production, sans artefact de diagnostic ni timeout de job |
| TCI-11 | **P2** | NON VÉRIFIÉ (pas de relecture) | Gates manquantes : npm audit (1 high, 4 moderate connus), dependabot, scan de secrets, WebKit/iOS, régression visuelle, Lighthouse, lint |
| TCI-12 | **P2** | NON VÉRIFIÉ (pas de relecture) | Appels WebRTC, push réel, upload Storage réel, export de données, Edge Function ask-ai : zéro test |
| TCI-13 | **P3** | NON VÉRIFIÉ (pas de relecture) | Chiffres de la documentation périmés : « 897 suites », « 175 e2e + 94 backend », « 13 invariants », « ~15 specs » |
| TCI-14 | **P3** | NON VÉRIFIÉ (pas de relecture) | Harnais de test manuels morts dans tests/ (11 fichiers html/js/md non référencés) |
| TCI-15 | **P3** | NON VÉRIFIÉ (pas de relecture) | Le banc RLS Postgres jetable ne rejoue qu'une migration sur un socle de 97 lignes, pas les 125 policies de production |
| TCI-16 | **P3** | NON VÉRIFIÉ (pas de relecture) | Le canari horaire crée 2 comptes réels par heure en production et tient le verrou passio-e2e-prod |

### TCI-01 — Messagerie, realtime, confidentialité et suppression de compte cross-compte ne tournent JAMAIS en CI (opt-in) et la suite multi-comptes est cassée par le retrait CDV

| Champ | Valeur |
|---|---|
| Identifiant | TCI-01 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Suites prod opt-in : multi-comptes (8 tests), confidentialite (2), suppression-compte (1), qa-campaign (1) |
| Résultat attendu | Les parcours cross-compte qui portent la promesse produit (conversation texte+vocal, notifications d'interaction, RSVP, stories privées, suppression RGPD) sont éprouvés à chaque déploiement, sur du code qui existe. |
| Résultat observé | test.skip(!PASSIO_E2E_MULTI) (multi-comptes.spec.js:21, confidentialite.spec.js:21, suppression-compte.spec.js:28) et PASSIO_QA_CAMPAIGN (qa-campaign.spec.js:63) ; aucune de ces variables n'est posée dans deploy.yml. multi-comptes.spec.js:619 et :712 appellent openVlogViewer, supaAddCarnetCollaborator, supaAddCdvCollaborator, supaAddCdvLiveStep, supaPublishCdvLive, supaUpdateCdvLiveStep, absents de js/ depuis ADR-011 (2026-08-31). |
| Reproduction | grep -c PASSIO_E2E_MULTI .github/workflows/deploy.yml → 0 ; for fn in openVlogViewer supaAddCdvLiveStep supaPublishCdvLive; do grep -c "function $fn" js/*.js; done → 0 partout ; PASSIO_E2E_MULTI=1 npx playwright test multi-comptes (non lancé ici : écrit en prod) échouerait sur ReferenceError. |
| Preuve | tests/e2e/multi-comptes.spec.js:619-884 ; playwright.config.js:40-48 ; preuves/tests-ci/RESUME_PREUVES.txt (section OPT-IN POURRI) |
| Impact utilisateur et commercial | Une régression RLS sur conv_messages ou stories privées, ou une Edge Function delete-account cassée, partirait en production sans aucun rouge : perte de confidentialité et non-conformité RGPD invisibles. Commercialement : la promesse « rencontrer » repose sur une messagerie dont la livraison cross-compte n'est plus prouvée depuis le 2026-08-31. |
| Visibilité dans le Centre de pilotage | non — le dashboard ne remonte pas l'état des suites opt-in ; le score « autorisation » n'est alimenté que si AUTHZ-CRITICAL tourne depuis le dashboard (passio_qa_registry.json scores.global_health) |
| Détection par la Sentinelle | non — la Sentinelle distante ne rejoue que authz-critical (sentinelle-distante.yml) ; une régression messagerie n'émet aucun signal tant qu'aucun utilisateur ne l'exerce |
| Proposition de correction | 1) Retirer ou réécrire les deux tests CDV de multi-comptes ; 2) inscrire confidentialite + suppression-compte + un sous-ensemble déterministe de multi-comptes (conversation, notifications) dans SUITES_PROD sans skip, sous le verrou passio-e2e-prod ; 3) à défaut, un job nocturne (schedule) PASSIO_E2E_MULTI=1 qui ouvre une issue en rouge comme la Sentinelle distante. |
| Risque de régression | Moyen : +3 à 5 comptes réels par run en prod (quota d'inscriptions horaire, cause de l'incident du 2026-08-30) ; attentes realtime = flakiness possible → réserver au job nocturne si instable. |
| Effort estimé | 1 à 2 jours |

### TCI-02 — Inscription réelle par e-mail (SMTP Brevo) et « mot de passe oublié » n'ont aucun test automatisé

| Champ | Valeur |
|---|---|
| Identifiant | TCI-02 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Authentification : signUp + confirmation e-mail, resetPasswordForEmail, lien de récupération |
| Résultat attendu | Le tunnel qui transforme un visiteur en compte (le seul chemin de revenu) est éprouvé de bout en bout : signUp → e-mail reçu → confirmation → connexion ; et le parcours de récupération de mot de passe. |
| Résultat observé | 0 spec appelle resetPasswordForEmail ; confirmation-email.spec.js:47-50 remplace supa.auth.signUp / signInWithPassword / resend par des doublures ; les comptes de test sont créés pré-confirmés par l'API admin (compte-e2e.js:107, email_confirm:true), donc le chemin SMTP/DKIM/lien de confirmation n'est jamais parcouru par une machine. |
| Reproduction | grep -l resetPasswordForEmail tests/e2e/*.spec.js → vide ; grep -n 'supa.auth.signUp =' tests/e2e/confirmation-email.spec.js → ligne 48 (doublure). |
| Preuve | tests/e2e/confirmation-email.spec.js:17-52 ; tests/e2e/compte-e2e.js:100-110 ; grep résultats dans preuves/tests-ci/RESUME_PREUVES.txt |
| Impact utilisateur et commercial | Un incident SMTP (quota Brevo 300/j, DKIM, template) ou une régression du fragment de récupération bloque toute nouvelle inscription sans qu'aucun test ne rougisse ; c'est le risque R11 de CLAUDE.md, non instrumenté. Commercialement : acquisition à zéro sans alerte. |
| Visibilité dans le Centre de pilotage | partiel — la télémétrie pré-auth remonte les échecs client, mais aucun panneau ne mesure le taux signUp → confirmé |
| Détection par la Sentinelle | non — sa page publique vérifie seulement que index.html contient 'screen-feed' et 'Passio' |
| Proposition de correction | Canari d'inscription nocturne : boîte de réception jetable (API Brevo « inbound » ou compte IMAP dédié) ; test qui inscrit une adresse réelle, lit l'e-mail, suit le lien, se connecte, puis déclenche resetPasswordForEmail et suit le lien de récupération ; purge par motif dédié. À défaut, un contrôle Sentinelle qui mesure le taux de confirmation sur auth.users (confirmed_at) via service_role. |
| Risque de régression | Faible (test additif) ; consomme 2 e-mails/jour du quota Brevo. |
| Effort estimé | 2 jours |

### TCI-03 — Restauration de sauvegarde et rollback ne sont jamais exercés par un test

| Champ | Valeur |
|---|---|
| Identifiant | TCI-03 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | scripts/sauvegarde-donnees.js, workflow rollback.yml, reprise après incident |
| Résultat attendu | Une restauration complète (données + comptes + médias) et un retour arrière applicatif ont été rejoués au moins une fois sur un environnement jetable, avec preuve. |
| Résultat observé | 0 test référence sauvegarde-donnees.js ; rollback.yml (workflow_dispatch) crée une branche + PR brouillon sans jamais être exercé par la CI ; aucun banc Postgres jetable ne recharge un dump (le banc T&S n'applique qu'une migration sur un socle de 97 lignes). |
| Reproduction | grep -rl 'sauvegarde-donnees' tests/ → vide ; grep -c 'rollback' tests/e2e/*.spec.js → 0. |
| Preuve | .github/workflows/rollback.yml ; tests/sql/migration-ts-serveur.test.sh:1-50 ; preuves/tests-ci/RESUME_PREUVES.txt |
| Impact utilisateur et commercial | En cas de corruption ou de suppression massive, la capacité de restauration est NON PROUVÉE (le contexte impose de l'écrire ainsi) ; la perte définitive de données utilisateur est un risque commercial et légal (RGPD art. 32). |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Job mensuel (schedule) : sauvegarde → restauration dans un PostgreSQL jetable (comme tests/sql/) → assertions de comptage par table et de rejouabilité des migrations ; exercice de rollback.yml sur un commit trivial avec vérification que la PR de revert est buildable. |
| Risque de régression | Nul (lecture seule côté prod). |
| Effort estimé | 2 jours |

### TCI-04 — Aucun environnement de staging : tests, canari horaire et previews de PR écrivent tous sur la base de production

| Champ | Valeur |
|---|---|
| Identifiant | TCI-04 |
| Priorité retenue | **P1** (proposée par l'auditeur : P1) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | CI test-prod, sentinelle-distante.yml, preview Netlify de PR |
| Résultat attendu | Les suites qui écrivent en base et les previews de PR visent une base de test ; la prod ne reçoit que du trafic réel. |
| Résultat observé | SUITES_PROD créent 5 comptes réels par run sur njkiyoklssvefstljemx (≈85 runs/2 jours) ; le canari horaire en crée 2 de plus par heure ; l'URL Supabase est une constante (app-08:2551) que build.js ne substitue pas, donc la preview pr-N (deploy.yml job preview, déployée après les seuls audits statiques, AVANT les tests navigateur) est branchée sur la prod et sur son bucket public. Le teardown purge par motif, ce qui a déjà effacé les comptes d'une suite concurrente (incident du 2026-09-01, cf. playwright.config.js:7-15). |
| Reproduction | grep -n 'const SUPABASE_URL' js/app-08-ui-modals-tour.js → 2551 ; grep -n 'needs:' .github/workflows/deploy.yml (preview needs [governance, audits]). |
| Preuve | deploy.yml jobs test-prod et preview ; sentinelle-distante.yml (cron 17 * * * *, authz-critical --project=prod) ; playwright.config.js:7-15 ; tests/e2e/global-teardown.js |
| Impact utilisateur et commercial | Quota d'inscriptions consommé par les tests (cause de la panne du 2026-08-30), données de test mêlées aux données réelles (telemetry_events 111 828 lignes dont bruit de test), testeurs d'une preview qui écrivent des vraies lignes ; une erreur de purge peut toucher des comptes réels si le motif change. Commercialement : impossible de garantir la propreté des KPI ni d'isoler un incident de test d'un incident client. |
| Visibilité dans le Centre de pilotage | partiel — le dashboard connaît les comptes de test (comptes.test.js, testusers) mais pas la provenance preview/CI |
| Détection par la Sentinelle | non |
| Proposition de correction | Second projet Supabase « staging » (gratuit) alimenté par migrations/SCHEMA_PROD_REFERENCE.sql ; injection de SUPABASE_URL/clé anon au build (COMMIT_REF existe déjà comme précédent dans build.js) ; test-prod, canari et preview pointent staging ; la prod ne garde qu'un canari lecture seule. |
| Risque de régression | Moyen : dérive de schéma staging/prod (déjà R3 : 4 migrations enregistrées contre 64 fichiers) — à combler par un job qui compare les deux. |
| Effort estimé | 3 à 5 jours |

### TCI-05 — Le gate « tests creux » est contournable par n'importe quel locator() sur une page fabriquée

| Champ | Valeur |
|---|---|
| Identifiant | TCI-05 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | scripts/audit-tests-creux.js (gate CI et npm run verif) |
| Résultat attendu | Un spec qui ne fait que vérifier ses propres constructions est refusé. |
| Résultat observé | Un spec de 4 lignes (page.setContent puis expect(locator('#a').textContent()).toBe('1')) passe le gate : « OK — aucun spec ne vérifie uniquement ses propres constructions », exit 0. La regex UI (ligne 47) accepte tout fichier contenant locator( / toBeVisible / getByText, sans exiger un goto vers l'application ni un appel de fonction de production. |
| Reproduction | cp scripts/audit-tests-creux.js <bac>/scripts/ ; ln -s js <bac>/js ; écrire <bac>/tests/e2e/creux-attaque.spec.js (contenu dans preuves/tests-ci/creux-mutation/) ; cd <bac> && node scripts/audit-tests-creux.js --ci → exit 0. |
| Preuve | scripts/audit-tests-creux.js:47 ; preuves/tests-ci/creux-mutation/tests/e2e/creux-attaque.spec.js ; sortie dans RESUME_PREUVES.txt |
| Impact utilisateur et commercial | Le gate est un filet à mailles larges : un futur test creux (le piège n° 5 du registre, qui « fait croire à un succès ») passe la CI. Effet indirect : le vert de la suite est moins probant qu'annoncé. |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Exiger, en plus du marqueur UI, soit un page.goto vers /index.html\|/dist, soit un helper de boot, soit un appel à une fonction de production ; refuser page.setContent sans boot ; ajouter un cas de mutation à projets-playwright.spec.js. |
| Risque de régression | Faible : quelques specs légitimes à inscrire dans ARTEFACTS. |
| Effort estimé | 0,5 jour |

### TCI-06 — Le gate d'isolation des suites est satisfait par le nom de la fonction dans un commentaire

| Champ | Valeur |
|---|---|
| Identifiant | TCI-06 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | scripts/audit-tests-isolation.js (8e gate) |
| Résultat attendu | Seul un APPEL réel à sansDonneesDistantes( (ou la déclaration sansIsolationDesDonnees) satisfait le banc. |
| Résultat observé | Le banc retire les lignes require puis cherche la regex sur tout le source, commentaires compris ; un spec qui navigue vers #feedList avec « sansDonneesDistantes( » uniquement en commentaire est accepté (exit 0). |
| Reproduction | Copie du script + socle dans preuves/tests-ci/isolation-mutation/, spec isolation-attaque.spec.js ; node scripts/audit-tests-isolation.js --ci → « OK ». |
| Preuve | scripts/audit-tests-isolation.js:69-71 ; preuves/tests-ci/isolation-mutation/ |
| Impact utilisateur et commercial | Faible en pratique (il faut le vouloir), mais le banc a été créé après six correctifs d'isolation qui ont chacun fait sauter le déploiement : sa robustesse est censée être mécanique. |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Retirer les commentaires (// et /* */) et les chaînes avant la recherche, ou parser avec acorn (déjà utilisable en Node sans dépendance via node:vm ? sinon regex de commentaires). |
| Risque de régression | Nul. |
| Effort estimé | 1 heure |

### TCI-07 — La couverture fonctionnelle « 15,2 % » n'est plus reproductible : mesure de 19 jours, dénominateur 435→355, 19 écritures en base jamais exercées

| Champ | Valeur |
|---|---|
| Identifiant | TCI-07 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | scripts/couverture-*.js, .passio/couverture/observe.json |
| Résultat attendu | Le chiffre cité par CLAUDE.md, PASSIO_FUNCTIONAL_MAP.md §5 et passio_qa_registry.json (scores.functional 15.2 MESURE) correspond à une mesure sur le code déployé. |
| Résultat observé | npm run couverture → mesure du 2026-08-16, 355 interactions aujourd'hui, 38 exécutées (10,7 %), « 28 noms mesurés absents du code actuel : mesure à refaire » (fonctions CDV supprimées). npm run couverture:risque → 19 interactions écrivant en base non exercées : mePublish, submitEvent, publishStoryFromComposer, shareLocation, inviteToEvent, promoteWaitlisted, submitPassionRequest, shareEventInFeed, sharePostInFeed, shareReelInFeed, _forwardTo, addEventComment, addGroupMember, confirmCreateGroup, editGroupDescription, likeCommentNode, likeReelComment, submitEventFeedback, toggleEventCoOrganizer. |
| Reproduction | npm run couverture ; npm run couverture:risque (sorties intégrales dans preuves/tests-ci/RESUME_PREUVES.txt). |
| Preuve | .passio/couverture/observe.json (genere_le 2026-08-16) ; scripts/couverture-rapport.js:44-48 |
| Impact utilisateur et commercial | Le pilotage s'appuie sur un chiffre périmé et déjà un plafond ; 19 gestes qui écrivent en prod (publier, créer un événement, publier une story, partager une position) ne sont exercés par aucun test : un `{ error }` non lu y resterait invisible (invariant « écritures qui échouent en silence »). |
| Visibilité dans le Centre de pilotage | partiel — passio_qa_registry.json expose 15,2 (MESURE) alors que la mesure est périmée |
| Détection par la Sentinelle | non |
| Proposition de correction | Re-mesurer (PASSIO_COUVERTURE=1 npx playwright test, à faire par l'orchestrateur en fin de bilan) et régénérer observe.json ; ajouter un job hebdomadaire qui refait la mesure et échoue si `perimes.length > 0` ; écrire en priorité des tests pour les 19 écritures (gate --ci de couverture:risque à 0 écriture nue). |
| Risque de régression | Nul. |
| Effort estimé | 0,5 jour pour la mesure ; 3 à 4 jours pour couvrir les 19 écritures |

### TCI-08 — Chaîne main de 37 min dont 20 min de déploiement passées à télécharger des minifieurs non épinglés ; 28 min cumulées d'installation Playwright

| Champ | Valeur |
|---|---|
| Identifiant | TCI-08 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | deploy.yml jobs deploy et test-local |
| Résultat attendu | Un push sur main est en ligne en moins de 15 min avec des outils de build épinglés et reproductibles. |
| Résultat observé | Run 2494 : Minify index.html 7,0 min, app.js 5,2 min, styles.css 5,0 min (npx --yes html-minifier-terser / terser / clean-css-cli sans version), Netlify 2,5 min ; « Installer Playwright » 7,4 min × 8 jobs = 28,5 min de runner ; `npm install --no-save @playwright/test` prend la dernière 1.x (1.60.0 aujourd'hui) hors package-lock. 100 derniers runs : main jusqu'à 64 min (run 2483). |
| Reproduction | node -e sur preuves/tests-ci/run-33861671142-jobs.json (étapes et durées) ; grep -n 'npx --yes' .github/workflows/deploy.yml. |
| Preuve | preuves/tests-ci/run-33861671142-jobs.json ; deploy.yml étapes Minify ; RESUME_PREUVES.txt section CI |
| Impact utilisateur et commercial | Débit de livraison borné à ~1,5 déploiement/heure (groupe de concurrence sérialisé) ; un correctif urgent attend 37 min minimum ; une nouvelle version majeure de terser/html-minifier ou de Playwright peut casser main un matin sans changement du dépôt (supply chain). |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Épingler les trois minifieurs en devDependencies (ou `npx --yes terser@5.x`), les exécuter depuis node_modules avec `npm ci` + cache ; cacher les navigateurs Playwright (actions/cache sur ~/.cache/ms-playwright, clé = version) ; épingler @playwright/test au lock (`npm ci` au lieu de `npm install --no-save`). |
| Risque de régression | Faible. |
| Effort estimé | 0,5 jour |

### TCI-09 — L'artefact réellement servi (minifié par terser --mangle) n'est testé par rien, et un échec de minification est masqué

| Champ | Valeur |
|---|---|
| Identifiant | TCI-09 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Job deploy : minification puis Netlify |
| Résultat attendu | Le fichier mis en ligne est celui qui a passé les gates artefact. |
| Résultat observé | Les gates dist tournent sur dist/ non minifié (scripts/servir-dist.js:25-26 l'assume) ; la minification a lieu après tous les tests, dans le job deploy ; chaque étape porte `\|\| echo "Minification échouée, déploiement du fichier brut"` : un minifieur qui produit un fichier vide ou cassé mais sort en 0 est déployé, et un minifieur en erreur déploie le brut sans rouge. |
| Reproduction | Lire deploy.yml étapes « Minify … (fallback sur le fichier brut) » ; grep -c 'terser' scripts/servir-dist.js → commentaire seulement. |
| Preuve | deploy.yml lignes Minify ; scripts/servir-dist.js:8,25-26 ; registre pieges_de_verification n° 2 (« Minifieur qui renomme les marqueurs cherchés en prod ») |
| Impact utilisateur et commercial | Un bug introduit par le mangle (identifiant global attendu par un onclick inline, littéral recherché par release-integrity) n'est vu qu'en production ; le piège est déjà consigné au registre comme vécu. |
| Visibilité dans le Centre de pilotage | partiel — la Sentinelle distante lit index.html en prod (grep 'screen-feed'), pas app.js |
| Détection par la Sentinelle | partiel — seulement si le boot lève une erreur remontée dans client_errors |
| Proposition de correction | Minifier dans un job « build » en amont, publier dist/ en artefact, faire tourner gates-artefact (release-integrity, dist-build, smoke) sur cet artefact, puis déployer ce même artefact ; retirer le fallback silencieux ou le transformer en `::warning` + étape rouge. |
| Risque de régression | Faible. |
| Effort estimé | 1 jour |

### TCI-10 — Main rouge 4 fois en 2 jours (10,5 % des runs) : chaque rouge saute le déploiement production, sans artefact de diagnostic ni timeout de job

| Champ | Valeur |
|---|---|
| Identifiant | TCI-10 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | deploy.yml, retries Playwright en CI |
| Résultat attendu | Un rouge sur main est rare, diagnostiquable en une lecture (traces conservées) et ne bloque pas la file plus que nécessaire. |
| Résultat observé | deploy-runs-100.json : push/failure 4 (runs 2409, 2413, 2437, 2444), PR/failure 8 ; retries: 2 en CI (playwright.config.js:58) sans reporter ni upload-artifact (0 occurrence) → un test flaky repasse vert sans trace, un test rouge ne laisse ni trace ni capture ; timeout-minutes absent (0 occurrence) → défaut 6 h dans un groupe de concurrence sérialisé. |
| Reproduction | node -e sur preuves/tests-ci/deploy-runs-100.json ; grep -c 'upload-artifact\\|timeout-minutes' .github/workflows/deploy.yml → 0. |
| Preuve | preuves/tests-ci/deploy-runs-100.json ; playwright.config.js:58-62 ; deploy.yml |
| Impact utilisateur et commercial | Quatre commits de main non déployés en 48 h (cf. docs : « six correctifs d'isolation ont chacun fait SAUTER le déploiement ») ; sans traces, chaque rouge coûte un cycle complet pour être compris ; un job pendu bloquerait toute livraison 6 h. |
| Visibilité dans le Centre de pilotage | partiel — le dashboard consigne les releases (release-recorder) mais pas les runs rouges |
| Détection par la Sentinelle | non |
| Proposition de correction | `timeout-minutes: 30` sur chaque job ; `actions/upload-artifact` de playwright-report/ et test-results/ en `if: failure()` ; reporter `github` + `blob` par shard ; compteur hebdomadaire de flaky (reporter JSON agrégé) publié dans le dashboard. |
| Risque de régression | Nul. |
| Effort estimé | 0,5 jour |

### TCI-11 — Gates manquantes : npm audit (1 high, 4 moderate connus), dependabot, scan de secrets, WebKit/iOS, régression visuelle, Lighthouse, lint

| Champ | Valeur |
|---|---|
| Identifiant | TCI-11 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Pipeline CI |
| Résultat attendu | Les contrôles standard d'un produit grand public sont automatisés : vulnérabilités de dépendances, secrets, navigateur iOS, budgets de performance. |
| Résultat observé | deploy.yml : aucun de ces contrôles. npm audit exécuté ici : app 1 high (sharp <0.35.0) + 1 moderate (qs) ; dashboard 3 moderate (body-parser 1.20.x, express 4.22.2, qs). .github/dependabot.yml absent. playwright.config.js : Chromium seul, aucun `devices` ; 0 toHaveScreenshot ; a11y : aucun scan axe ; perf : perf-ios.spec.js borne un seul indicateur (≤120, ligne 89). |
| Reproduction | npm audit --json ; (cd dashboard && npm audit --json) ; ls .github/dependabot.yml ; grep -c toHaveScreenshot tests/e2e/*.spec.js. |
| Preuve | Sorties dans preuves/tests-ci/RESUME_PREUVES.txt ; playwright.config.js:64-70 |
| Impact utilisateur et commercial | iOS Safari (cible PWA principale, docs/PERF-IOS) n'est exercé par AUCUN moteur WebKit : les défauts iPhone rapportés le 2026-09-02 ne pouvaient pas être vus en CI ; une vulnérabilité de dépendance serveur (dashboard Express) ou une fuite de secret n'est détectée par personne. |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Ajouter au job audits : `npm audit --audit-level=high` (app et dashboard), gitleaks (action) ; dependabot.yml (npm, weekly) ; projet Playwright `webkit` sur 3 suites de cadrage/navigation iOS (cadrage, ios-navigation-et-zoom, conv-ouverture-fil) ; Lighthouse CI sur dist avec budget ; axe-core sur 5 écrans. |
| Risque de régression | Moyen pour WebKit (flakiness initiale) — commencer en `continue-on-error` une semaine. |
| Effort estimé | 2 jours |

### TCI-12 — Appels WebRTC, push réel, upload Storage réel, export de données, Edge Function ask-ai : zéro test

| Champ | Valeur |
|---|---|
| Identifiant | TCI-12 |
| Priorité retenue | **P2** (proposée par l'auditeur : P2) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | Live vidéo/appels (WebRTC), notify-call, publication média vers Storage via l'app, export RGPD, IA |
| Résultat attendu | Chaque fonctionnalité exposée dans l'app a au moins un test qui exerce son chemin réel ou un contrat serveur. |
| Résultat observé | grep tests/e2e : RTCPeerConnection/startCall 0 ; pushManager/notify-call 0 (supa-hors-ligne = stub CDN) ; storage.from().upload 0 hors stub ; export 0 ; ask-ai 0 ; caméra bobine testée avec drapeaux de faux média (ui-v7-bobine-camera.spec.js:7). Le seul contrôle Storage réel est la RLS par dossier via REST brut (authz-critical:282-345), pas le chemin applicatif. |
| Reproduction | grep -l 'RTCPeerConnection\\|startCall' tests/e2e/*.spec.js → vide ; grep -l 'ask-ai' tests/e2e/*.spec.js → vide. |
| Preuve | Résultats de grep dans preuves/tests-ci/RESUME_PREUVES.txt ; tests/e2e/supa-hors-ligne.spec.js:34,73 |
| Impact utilisateur et commercial | Une publication vidéo qui n'atteint plus le bucket, un appel qui ne se connecte plus ou un export vide seraient découverts par les utilisateurs ; pour l'export, exposition RGPD (art. 20). |
| Visibilité dans le Centre de pilotage | partiel — client_errors et télémétrie captent les exceptions, pas les échecs fonctionnels silencieux |
| Détection par la Sentinelle | partiel — seulement sur exception remontée |
| Proposition de correction | Sur staging (TCI-04) : test d'upload réel d'une image 1 px puis lecture publique ; test de l'export (contenu JSON non vide, PII du seul compte) ; test WebRTC en deux contextes Chromium avec fake-device flags (loopback) ; test contractuel des Edge Functions (401 sans jeton, 200 avec). |
| Risque de régression | Faible. |
| Effort estimé | 3 jours |

### TCI-13 — Chiffres de la documentation périmés : « 897 suites », « 175 e2e + 94 backend », « 13 invariants », « ~15 specs »

| Champ | Valeur |
|---|---|
| Identifiant | TCI-13 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | CLAUDE.md:40, PASSIO_PRODUCTION_READINESS.md:10,16,26, passio_qa_registry.json, .passio/context/TESTING_STRATEGY.md |
| Résultat attendu | Les nombres cités se reproduisent par une commande. |
| Résultat observé | Mesuré : 1103 tests locaux / 15 prod / 1118 total ; 349 tests dashboard ; authz-critical = 1 test, 12 blocs numérotés 0-11, 29 expect ; TESTING_STRATEGY.md parle de « ~15 specs » et cite encore CDV comme couvert. |
| Reproduction | npx playwright test --list --project=local \| tail -1 ; cd dashboard && npm test \| tail -8 ; grep -nE '// ── [0-9]+\.' tests/e2e/authz-critical.spec.js. |
| Preuve | preuves/tests-ci/RESUME_PREUVES.txt ; tests/e2e/authz-critical.spec.js:100-282 |
| Impact utilisateur et commercial | Un lecteur du dossier de commercialisation lit des garanties inexactes (13 invariants, 15,2 %) ; perte de crédibilité documentaire, décisions prises sur des nombres faux. |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Remplacer les nombres par les commandes qui les produisent, ou les générer (script qui met à jour CLAUDE.md et le registre depuis --list). |
| Risque de régression | Nul. |
| Effort estimé | 2 heures |

### TCI-14 — Harnais de test manuels morts dans tests/ (11 fichiers html/js/md non référencés)

| Champ | Valeur |
|---|---|
| Identifiant | TCI-14 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | tests/test-*.html, test-irl.js, test-time-filter.js, TEST_MULTISELECT.md, TEST_PUBLICATION_MULTIAPPAREILS.md |
| Résultat attendu | Le dossier tests/ ne contient que ce qui est exécuté ou documenté. |
| Résultat observé | 0 référence dans package.json, CLAUDE.md, docs/*.md ; contenu = pages de test manuel (« Test Toggle », emoji) et simulations de filtres IRL d'avant les refontes. |
| Reproduction | grep -rn 'tests/test-' docs/*.md CLAUDE.md package.json → vide. |
| Preuve | ls tests/ ; head tests/test-simple.html, tests/test-irl.js |
| Impact utilisateur et commercial | Bruit pour l'auditeur et pour les gates (audit-tests-creux ne les voit pas, mais un futur script pourrait) ; risque de croire à une couverture manuelle qui n'existe plus. |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Supprimer (ou déplacer dans docs/archives/) après vérification par le domaine code-nettoyage. |
| Risque de régression | Nul. |
| Effort estimé | 30 minutes |

### TCI-15 — Le banc RLS Postgres jetable ne rejoue qu'une migration sur un socle de 97 lignes, pas les 125 policies de production

| Champ | Valeur |
|---|---|
| Identifiant | TCI-15 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | tests/sql/migration-ts-serveur.test.sh, tests/sql/socle-prod.sql |
| Résultat attendu | La CI éprouve les policies telles qu'elles sont en production (SCHEMA_PROD_REFERENCE.sql) sur des scénarios multi-comptes. |
| Résultat observé | Le banc applique migration_ts_serveur_age_blocage.sql sur socle-prod.sql (97 lignes) : couverture T&S/âge/blocage uniquement ; le reste des policies n'est éprouvé que par authz-critical (12 invariants sur comptes réels) ; divergence R3 (4 migrations enregistrées côté Supabase vs 64 fichiers). |
| Reproduction | wc -l tests/sql/socle-prod.sql ; grep MIGRATION= tests/sql/migration-ts-serveur.test.sh. |
| Preuve | tests/sql/migration-ts-serveur.test.sh:3-4 |
| Impact utilisateur et commercial | Une policy régressée hors T&S et hors des 12 invariants n'a aucun filet mécanique en CI. |
| Visibilité dans le Centre de pilotage | non |
| Détection par la Sentinelle | non |
| Proposition de correction | Étendre le banc : charger migrations/SCHEMA_PROD_REFERENCE.sql dans le Postgres jetable, y rejouer les 12 invariants d'authz-critical en SQL (set local role/claims) plus messagerie, stories privées, follows — ce qui rendrait aussi TCI-01 partiellement testable sans prod. |
| Risque de régression | Faible. |
| Effort estimé | 2 jours |

### TCI-16 — Le canari horaire crée 2 comptes réels par heure en production et tient le verrou passio-e2e-prod

| Champ | Valeur |
|---|---|
| Identifiant | TCI-16 |
| Priorité retenue | **P3** (proposée par l'auditeur : P3) |
| Relecture adversariale | NON VÉRIFIÉ (pas de relecture) |
| Confiance de l'auditeur | CONFIRMÉ |
| Fonctionnalité | sentinelle-distante.yml |
| Résultat attendu | La surveillance de production est en lecture seule (règle ADR-012 pour la Sentinelle). |
| Résultat observé | cron 17 * * * * → authz-critical --project=prod avec service_role : 2 comptes/heure (48/jour) créés puis purgés ; le job partage le groupe de concurrence passio-e2e-prod avec test-prod de deploy.yml, donc un déploiement peut attendre le canari. |
| Reproduction | grep -n 'cron\\|authz-critical\\|passio-e2e-prod' .github/workflows/sentinelle-distante.yml. |
| Preuve | sentinelle-distante.yml lignes on.schedule, jobs.health.concurrency, étape « Canari d'autorisation » |
| Impact utilisateur et commercial | Bruit dans auth.users/analytics, consommation du quota d'inscriptions (cause de l'incident du 2026-08-30), retard possible d'un déploiement. |
| Visibilité dans le Centre de pilotage | partiel — issue « [SENTINELLE DISTANTE] Santé rouge » ouverte en cas d'échec |
| Détection par la Sentinelle | oui — c'est elle |
| Proposition de correction | Sur staging une fois TCI-04 fait ; sinon ramener à toutes les 6 h et réutiliser deux comptes canaris permanents au lieu d'en créer. |
| Risque de régression | Faible. |
| Effort estimé | 2 heures |

### Surfaces saines

- npm run verif : 8 gates statiques + référentiel des passions verts en 1,4 s sur le SHA audité (audit-globals 0 collision sur 1384 déclarations, audit-handlers 0 fantôme sur 652 handlers, stub Supabase 45/45, télémétrie 81 clés OK)
- Échantillon de 8 suites locales (32 tests) : 28 passés / 4 skippés attendus, deux exécutions consécutives identiques (4,3 et 4,6 min), 0 flaky en local avec workers=1
- Gates artefact dist (release-integrity + passion-context) : 6 passés en local sous PASSIO_CIBLE=dist, comme en CI
- Dashboard : 349 tests unitaires verts en 24,6 s (node --test), sans accès réseau Supabase
- Partition prod/local de playwright.config.js prouvée disjointe et verrouillée par projets-playwright.spec.js (3 tests, verts ici)
- Gate d'autorisation en CI : authz-critical non skippable, 12 invariants par REST brut sur comptes réels (usurpation, UPDATE/DELETE 0 ligne, notifications, DM, télémétrie, identité réécrite, Storage par dossier), job vert sur le run 33861671142
- Gouvernance : push direct sur main refusé (PR obligatoire), contre-revue PASSIO74 exigée sur .github/, migrations/, auth/config/repair/sentinel du dashboard
- Purge des comptes de test : suffixe exact @passio-e2e.test (endsWith, jamais includes), TLD réservé non routable, réservée au job détenteur du verrou en CI
- Télémétrie et client_errors coupées depuis localhost/127.0.0.1 (telemetry.js:71, platform.js:42) avec verrou telemetrie-preauth : les 1103 tests locaux ne polluent pas la prod
- Hygiène des assertions : 306 toBeVisible / 26 offsetParent contre 77 assertions d'existence ; aucun spec sans expect ; 18 suites déclarent une épreuve par mutation

### Non vérifié (BLOQUÉ) et ce qu'il faudrait

- Flakiness réelle en CI (retries 2) : logs de jobs inaccessibles (proxy 403 vers l'hôte des logs, MCP github en AUTH_HEADER_REJECTED, gh absent). Il faudrait un jeton Actions:read ou les rapports Playwright en artefact (TCI-10).
- Exécution des 7 suites du projet prod (comptes réels, service_role) : interdite ici ; preuve de substitution = job « Suites production (comptes réels) » vert sur le run 33861671142 (5,8 min).
- Protection de branche main (reviews requis, status checks) : API GitHub 403 sans jeton admin.
- Scan de secrets GitHub natif (secret scanning / push protection) : état du dépôt non consultable sans droits admin.
- Re-mesure de la couverture fonctionnelle : exige la suite COMPLÈTE sous PASSIO_COUVERTURE=1 (interdite au sous-agent ; à lancer par l'orchestrateur : `PASSIO_COUVERTURE=1 PASSIO_PORT=<port> npx playwright test --project=local` puis `npm run couverture`).
- Suites opt-in multi-comptes/confidentialite/suppression-compte/qa-campaign : non lancées (écriture en prod) ; leur rupture sur le code actuel est établie par inspection (6 fonctions absentes), pas par exécution.
- Vérification directe de https://passio-app.netlify.app (artefact minifié servi) : BLOQUÉ par le proxy (403), comme indiqué par l'orchestrateur.
- Tests WebKit/Firefox : non réalisables (Chromium seul installé) — et de toute façon absents du dépôt.

### Affirmations des anciens rapports confrontées au code actuel

- CLAUDE.md:40 « 897 suites navigateur » → fausse aujourd'hui : 1103 tests dans 124 fichiers (npx playwright test --list --project=local), chiffre posé le 2026-09-02 (commit e773ed4)
- PASSIO_PRODUCTION_READINESS.md:26 « 175 e2e passés (1 flaky, 1 skipped) + 94 backend » → fausse : 1118 tests e2e listés, 349 tests dashboard verts (cd dashboard && npm test)
- PASSIO_FUNCTIONAL_MAP.md §5 et passio_qa_registry.json « couverture 15,2 % (66/435) » → non vérifiable sur le code actuel : dénominateur 355, 28 noms mesurés absents, mesure du 2026-08-16 ; npm run couverture affiche 10,7 % sur une mesure périmée
- PASSIO_PRODUCTION_READINESS.md:10,16 et registre « 13 invariants d'autorisation » → fausse : 12 blocs numérotés 0-11 dans un seul test, 29 expect (tests/e2e/authz-critical.spec.js)
- PASSIO_PRODUCTION_READINESS.md:21 « Cross-compte PROUVÉ : 13 tests sur base réelle » → toujours vraie pour authz-critical/blocage-acces/user-state (CI verte), FAUSSE pour multi-comptes : deux tests référencent des fonctions CDV supprimées le 2026-08-31 et la suite est opt-in, jamais rejouée en CI
- PASSIO_PRODUCTION_READINESS.md:19 « Suppression de compte PROUVÉ, mutation-testé » → non vérifiable depuis le 2026-08-17 : suppression-compte.spec.js est opt-in (PASSIO_E2E_MULTI), absent de la CI
- docs/CHECKLIST_COMMERCIALISATION.md:37 « Follow/unfollow, édition bio — non auto-testés » (2026-06-12) → périmée dans le bon sens : parcours-suivre.spec.js et biographie-multiligne.spec.js existent
- docs/CHECKLIST_COMMERCIALISATION.md:61 « CI GitHub Actions → Netlify » → toujours vraie (deploy.yml, run 2494 vert)
- .passio/context/TESTING_STRATEGY.md « ~15 specs, CDV couvert, Audits CI = globals + handlers » → périmée : 131 specs, CDV retiré (ADR-011), 8 gates statiques
- .passio/context/KNOWN_RISKS.md R7 « tout push main = déploiement prod, CI tests avant deploy » → toujours vraie (deploy needs test-local/test-prod/gates-artefact/audits/governance)
- tests/qa-report.md « PRÊT POUR DES TESTS UTILISATEURS RÉELS : OUI » (2026-08-09, 7/10 utilisateurs, version inconnue) → non vérifiable : campagne jamais rejouée depuis, opt-in
- playwright.config.js commentaire « 121 suites, 7 touchent la base, 3 en CI » → toujours vraie sur la partition (7 prod / 124 local aujourd'hui, 3 créant des comptes en CI)

### Fichiers de preuve

- `preuves/tests-ci/RESUME_PREUVES.txt`
- `preuves/tests-ci/tests-par-fichier.txt`
- `preuves/tests-ci/echantillon-local-run1.txt`
- `preuves/tests-ci/echantillon-local-run2.txt`
- `preuves/tests-ci/gates-artefact-dist-local.txt`
- `preuves/tests-ci/run-33861671142-jobs.json`
- `preuves/tests-ci/deploy-runs-30.json`
- `preuves/tests-ci/deploy-runs-100.json`
- `preuves/tests-ci/creux-mutation/tests/e2e/creux-attaque.spec.js`
- `preuves/tests-ci/isolation-mutation/tests/e2e/isolation-attaque.spec.js`

### Notes de l'auditeur

MATRICE PARCOURS CRITIQUE × TEST (oui = CI locale / prod-CI = comptes réels en CI / opt-in = jamais en CI / non = aucun) :
- Gate code d'accès : oui (access-gate, gate-sans-app, dist-build)
- Première visite sans compte : oui (first-run 41, exploration-anonyme 16)
- Inscription réelle avec e-mail (SMTP) : NON (doublures ; comptes admin pré-confirmés)
- Connexion compte existant : oui (connexion-compte-existant 15, doublures) ; prod-CI via signInWithPassword (compte-e2e)
- Mot de passe oublié : NON
- Confirmation d'e-mail (écran) : oui (confirmation-email 7, doublure)
- Fil / classement / intentions : oui (138 tests)
- Publication texte/photo (Studio) : oui local ; écriture réelle en base : prod-CI (authz-critical 1 post)
- Publication vidéo / bobine réelle (Storage) : NON (caméra factice, stub)
- Stories : oui local ; cross-compte : opt-in (multi-comptes)
- Commentaires / réactions / likes : oui local ; cross-compte notifications : opt-in
- Messagerie 1-1 texte/vocal : oui local (état local) ; livraison cross-compte réelle : opt-in (multi-comptes) — JAMAIS EN CI
- Confidentialité messages / stories privées : opt-in (confidentialite) — JAMAIS EN CI
- Realtime cross-compte : opt-in
- Blocage : prod-CI (blocage-acces) + local (stories-blocage) ; T&S serveur : banc Postgres jetable
- Signalement : oui local (profil-visite-options), trigger rate_limit : banc SQL
- IRL événements, RSVP, liste d'attente, filtres : oui local (170) ; RSVP cross-compte : opt-in
- Check-in QR : oui local (4 fichiers)
- Carte avec tuiles MapLibre : NON (init contournée) ; géocodage BAN/Photon : NON (doublé à null)
- Passions (référentiel, plafond, archives) : oui (261)
- Profil / identité / multi-appareils user_state : oui local + prod-CI (user-state-horodatage)
- Suppression de compte (Edge Function) : opt-in — JAMAIS EN CI
- Export de données : NON
- Appels / live WebRTC : NON
- Push réel (notify-call, push_subscriptions) : NON
- IA (Edge ask-ai) : NON
- PWA / service worker / version skew : oui (version-skew 5, release-integrity dist 4)
- Hors ligne (CDN coupé) : oui (supa-hors-ligne 2)
- Télémétrie pré-auth / bruit local : oui (telemetrie-preauth, monitoring-bruit)
- Sentinelle bout-en-bout (signal → incident → réparation) : NON (dashboard = 349 tests unitaires isolés ; canari distant = authz seulement)
- Rollback réel : NON ; Restauration de sauvegarde : NON
- Accessibilité automatisée : NON (26 fichiers touchent aria-, 0 axe) ; iOS WebKit : NON ; visuel : NON ; charge : NON (scripts/test-volume.sql non branché)

GATES MANQUANTES RECOMMANDÉES (par ordre) : ① staging Supabase + injection d'URL au build (débloque TCI-01, 04, 12, 16) ; ② artefact minifié testé avant deploy + retrait des fallbacks silencieux ; ③ timeout-minutes + upload-artifact en échec + reporter blob + compteur de flaky ; ④ épinglage des minifieurs et de @playwright/test, cache des navigateurs (−17 min sur deploy, −28 min de runner) ; ⑤ npm audit --audit-level=high (app + dashboard), dependabot, gitleaks ; ⑥ projet webkit sur 3 suites iOS ; ⑦ couverture:risque en mode --ci avec 0 écriture nue, re-mesure hebdomadaire ; ⑧ durcir audit-tests-creux (exiger boot ou goto) et audit-tests-isolation (retirer les commentaires) ; ⑨ banc Postgres jetable élargi à SCHEMA_PROD_REFERENCE.sql ; ⑩ canari d'inscription réelle + reset de mot de passe nocturne.

CAPACITÉ / COÛTS : run 2494 = 13 jobs, ≈ 100 min de runner pour 37 min de mur ; 100 runs en 48 h ≈ 8 000 min de runner/2 jours (à confronter au plan GitHub — non mesuré). Débit de livraison : 1 déploiement à la fois, 37 min minimum, jusqu'à 64 min mesurés.

CONSERVER : partition prod/local, audit-tests-isolation (idée), authz-critical, gates artefact dist, telemetry localhost off, purge par suffixe exact. REFACTORISER : deploy job (build → test artefact → deploy), audit-tests-creux, TESTING_STRATEGY.md (réécrire depuis les commandes). SUPPRIMER : tests/test-*.html et compagnons, les deux tests CDV de multi-comptes. SOUMETTRE À BENJAMIN : création d'un projet Supabase staging (coût 0 € sur le palier gratuit, mais dérive de schéma à gérer) ; passage de la Sentinelle distante en lecture seule.

Requêtes à exécuter par l'orchestrateur (aucune requête base n'a été lancée par ce domaine) : `PASSIO_COUVERTURE=1 npx playwright test --project=local` puis `npm run couverture` (re-mesure) ; lecture des logs des shards 2/6 et 6/6 du run 33861671142 pour compter les « flaky ». Hygiène : aucun fichier suivi modifié (git status --short vide en fin de travail) ; dist/ régénéré par dist-build/servir-dist (ignoré par git) ; le lien symbolique de la copie du gate en scratchpad a été retiré.
