# Ouverture gratuite : go / no-go (2026-09-11)

> ⚠️ **À LIRE AVANT LA SYNTHÈSE CI-DESSOUS.** Le rédacteur de la synthèse a reçu un dossier
> **tronqué** (120 000 caractères, faille du script d'orchestration) : les constats jugés des
> dimensions SÉCURITÉ et EXPLOITATION ne lui sont pas parvenus avec leur verdict. Or deux
> d'entre eux ont été **jugés BLOQUANTS** par le juge, après trois réfutateurs. Le verdict
> en trois lignes de la synthèse est donc **remplacé** par celui-ci, écrit par la session
> après lecture du dossier complet (`journal.jsonl` du workflow, 81 agents, 12 constats
> confirmés, 8 réfutés, 41 P2/P3 non soumis à réfutation).

## Verdict corrigé (session, dossier complet)

**NO-GO tant que la PR #335 n'est pas contre-relue, fusionnée, déployée, et son SQL collé.**
Puis GO à une condition mesurable : la preuve de livraison des e-mails (EM-1).

| # | Ce qui bloque | Où c'est réglé | Qui débloque |
|---|---|---|---|
| 1 | **SEC-01 (P0)** — l'emoji d'une invitation d'appel est inséré dans le HTML **sans échappement** (`js/app-05-config-profil.js` l.1052) ; le canal `ring:<uid>` est **public**, la clé anon est dans le bundle, `profiles` est lisible sans compte : un anonyme peut exécuter du script dans la session de tout utilisateur connecté (exécution **reproduite localement sous la CSP de prod** par un réfutateur). | **PR #335**, « Red team (client) » : `_emojiSur` / `_emojiBorne`, éprouvé par réinjection | Benjamin : contre-revue « Contre-revue technique indépendante » sur la tête de #335, fusion |
| 2 | **SEC-02 (P1)** — `ring:` / `call:` / `typing:` / `vlive:` publics : faire sonner n'importe qui sous une fausse identité, couper un appel, et **devenir le pair WebRTC** à la place du destinataire (handlers `ready` / `answer` sans contrôle d'émetteur). Aucune policy `realtime.messages` ne les couvre (2 policies, toutes SELECT, `user:` seulement). | **PR #335** : canaux en `private: true` avec sonde de repli, policies `passio_rt_recevoir` / `passio_rt_emettre` dans `migrations/migration_ouverture_publique_2026-09-11.sql` | Benjamin : même contre-revue, puis **coller le SQL** (13 × OK) et Realtime « Allow public access » OFF, dans cet ordre |
| 3 | **EM-1 (P1)** — aucune inscription n'a traversé le nouveau montage d'envoi (dernier compte créé le 2026-09-09, bascule SMTP le 2026-09-11 13:20 UTC). | Rien à coder | Benjamin : inscription réelle sur un Gmail neuf, `dkim=pass header.d=passio-app.fr`, boîte de réception |

Ce que la session a fait ce jour, hors de ces trois points : PR #334 en prod (textes légaux lisibles sans code, LCEN), issue [SENTINELLE] #327 fermée (elle bloquait le canal d'auto-détection depuis le 2026-09-10 16:32 alors que sa cause était éteinte), registres remis à jour (R11, intégrations, récupération).

## Constats reçus après la synthèse, avec leur verdict

### SEC-01 · P0 · bloque : oui

- **Preuve** : `js/app-05-config-profil.js` l.1052 concatène `(inv.emoji || "🙂")` dans `innerHTML` alors que l.1053 échappe `inv.name` ; l.1105 passe `msg.payload` brut du broadcast à `_callOnInvite` ; l.494-496 `_callChannel` crée le canal sans `private:true` ; l.1101-1107 abonne chaque session ouverte à `ring:<MY_UID>` au démarrage ; `netlify.toml` l.21 `script-src 'self' 'unsafe-inline'`. Chaîne complète sans compte : clé anon dans le bundle + `profiles` lisible par anon (deux policies SELECT publiques) = énumération des cibles ; broadcast forgé sur `ring:<uid>` = exécution dans la session de toute victime en ligne. Même sink par la notification push (l.1183).
- **Réfutateurs** : un des trois a été refusé par les garde-fous du modèle (sujet « cyber ») ; les deux autres **confirment et renforcent** (exécution prouvée localement, `pwned=1`, zéro violation CSP, sur le code identique au bundle déployé `app.js?v=38aadb6ea7`).
- **Juge** : P0, bloque. « Le correctif tient en une ligne et un déploiement CI déjà vert : le rapport coût/dommage impose de le faire AVANT d'envoyer le lien. »
- **État** : corrigé dans **PR #335** (non fusionnée). La session n'a pas doublé le correctif : un second patch sur la même ligne mettrait #335 en conflit, et #335 porte aussi SEC-02, dont SEC-01 est l'escalade.

### SEC-02 · P1 · bloque : oui

- **Preuve** : `_callChannel` sans `private` (l.494-497) ; `callId` prévisible (`MY_UID + "_" + Date.now().toString(36)`, l.531) diffusé en clair sur `ring:<victime>` ; `_callBindChannelEvents` (l.762-808) sans vérification d'émetteur ; seule barrière `isBlocked(payload.from)`, `from` étant libre. `pg_policies realtime.messages` : 2 policies, toutes SELECT, `user:` uniquement, aucune INSERT. Config Realtime : `private_only` null, `max_joins_per_second` 2500, 100 canaux par client. Vérifié de bout en bout **en prod** par un réfutateur avec la seule clé anon : join et broadcast acceptés sur `ring:` / `call:` / `typing:` ; refus « Unauthorized » sur `conv:` (privé), preuve que la parade marche déjà ailleurs.
- **Juge** : P1, bloque. Deux voies acceptables avant le lien : A (neutraliser les appels derrière un drapeau) ou B (canaux privés + policies SELECT **et** INSERT livrées avec le client + vérification de `from`). **#335 est la voie B.** Le juge précise que « passer `private_only` à true seul » casserait `ring:` / `call:` / `typing:` / `vlive:` : le client et les policies vont ensemble.
- **Après #335** : l'ordre est déploiement client (sonde de repli public tant que les policies manquent) → SQL collé → « Allow public access » OFF.

### SEC-06 · P1 · bloque : non

- Inscription sans captcha, plafonds partagés (Supabase 150/h, Brevo 300/j) : un script rend l'onboarding indisponible jusqu'à 24 h. Aucune fuite, réversible en minutes par config (`disable_signup`). **Ne pas** abaisser `rate_limit_email_sent` à 30/h (contredit le geste 3 du plan d'ouverture). Dans les 7 jours : Cloudflare Turnstile côté client **avant** `security_captcha_enabled` côté projet, CSP à étendre (`challenges.cloudflare.com` en `script-src` et `frame-src`), neuf suites e2e à équiper d'une clé de test.
- Trouvé au passage, **à coter à part** : `https://passio74.github.io/passio-app/` répond encore avec une build du 22 mai 2026 branchée sur la base de production, sans CSP ni `release.json`, et figure dans `uri_allow_list`. Désactiver GitHub Pages sur le dépôt et retirer l'entrée.

### EXP-01 · P2 · bloque : non — **réglé ce soir**

- L'issue `[SENTINELLE]` #327 (ouverte le 2026-09-10 16:32) bloquait « une enquête à la fois » : « Lire la production » sautait à chaque passage planifié depuis 27 h. Sa cause (403 sur `conv_messages`) n'a plus d'occurrence depuis le 2026-09-10 07:19:30 UTC, avant même l'issue ; les trois runs Claude déclenchés ont été skipped / cancelled. **Fermée avec commentaire par la session.** Reste, hors chemin critique : filtrer `env = 'production'` dans `lireApi` (`scripts/sentinelle-detecter.mjs`).

### EXP-06 · P2 · bloque : non

- Aucune restauration jamais exécutée, **mais** deux prémisses de `docs/RECUPERATION.md` sont fausses depuis le 2026-08-17 : la base cible existe (projet « PASSIO staging », `fcksxofaelcdmmifnwjo`, en pause, même région), et l'organisation est en plan **Pro** : huit sauvegardes physiques quotidiennes `COMPLETED`, lisibles par l'API de gestion. Le document est corrigé dans cette PR. Exercer une restauration à froid reste à faire (heures, Benjamin).

## Ce que la PR #335 ferme d'un coup (à lire avant de la contre-relire)

Sept défauts serveur (`is_conv_member` retiré à `anon`, blocage appliqué partout, débit borné sur 9 tables, `reports.status`, policies Realtime, seau `attachments` privé, comptes privés à acceptation), un lot client déployable avant la migration (canaux privés avec repli, URL signées des pièces jointes, `_emojiSur`, SDK et MapLibre auto-hébergés, **rideau levé par défaut**), deux canaux d'exploitation (sauvegarde quotidienne chiffrée en artefact GitHub, alerte de modération à 24 h). Banc SQL de 117 contrôles et 35 cas e2e. Elle touche `.github/*` et `migrations/*` : la garde « Gouvernance critique » exige une revue GitHub par PASSIO74, ancrée sur la tête, contenant « Contre-revue technique indépendante ». **C'est le seul geste qui sépare la production des correctifs SEC-01, SEC-02, SEC-04, MOD-01, MOD-02, MOD-03 et EXP-05.**

---

# Synthèse du workflow (dossier tronqué, voir l'avertissement en tête)

Périmètre : ouvrir PASSIO gratuitement, largement, à de vrais utilisateurs, aujourd'hui. Pas de facturation (décision docs/OUVRIR_AU_PUBLIC_2026-09-10.md). Mesures reprises du dossier de contre-expertise (7 dimensions, 3 réfutateurs + 1 juge par constat) et remesurées à 21:17 UTC le 2026-09-11 (git, release.json, gh, SQL lecture seule).

## Verdict en trois lignes

1. GO technique et légal, à une condition mesurable : une inscription réelle depuis une adresse Gmail neuve doit arriver en Réception avec `dkim=pass header.d=passio-app.fr` (constat EM-1, seul P1 bloquant retenu par le juge). Coût : 10 minutes, par Benjamin, aucun code.
2. Tout le reste jugé bloquant par les auditeurs a été soit livré en prod (LC-1 : PR #334, commit b15a0b5a servi, release.json lu à 21:17 UTC), soit recoté non bloquant sur preuve (MOD-01, MOD-02, MOD-03, EM-3, CAP-01).
3. Le rideau « Beta privée » (code 2125) est toujours en prod : ouvrir = décider de le retirer, ou distribuer le code. Ce n'est pas un bloqueur technique, c'est la décision d'ouverture elle-même.

## Ce qui est prouvé FAIT aujourd'hui (avec la preuve)

| Fait | Preuve |
|---|---|
| Code prod = b15a0b5a (PR #334 « Les textes légaux se lisent sans code d'accès ») | `git log -1` = b15a0b5a ; origin/main identique ; `curl https://passio-app.netlify.app/release.json` → commit b15a0b5aeba0…, appHash 38aadb6ea7 (21:17 UTC) |
| CI verte sur ce commit, sentinelles vertes | `gh run list --branch main` : CI & Deploy success 16:42 UTC (10 min 20 s) ; Sentinelle distante 18:35 success ; Sentinelle autonome 19:51 success |
| Mentions légales, CGU, politique lisibles SOUS le rideau, sans code | js/access-gate.js l.194 `#pgLegalPanel{position:absolute;inset:0;z-index:5}` (interne au rideau) ; l.260 panneau ; textes dans js/legal-textes.js chargé en tête ; tests/e2e/access-gate.spec.js l.124-199 ; verrou dist-build.spec.js |
| SQL d'ouverture appliqué (conv_reads RLS, client_errors.auth_uid, purge_telemetry planifiée) | Contrôles A..G du dossier ; SQL 21:17 UTC : `cron.job where active` = 2 |
| Auth Supabase conforme à docs/SETUP_SMTP_AUTH.md §5 | GET Management API /config/auth : mailer_autoconfirm=false, password_hibp_enabled=true, rate_limit_email_sent=150, smtp-relay.brevo.com:587, expéditeur contact@passio-app.fr, site_url=https://passio-app.netlify.app, uri_allow_list sans passio-app.fr |
| DNS passio-app.fr complets et clé DKIM provisionnée par Brevo | Resolve-DnsName sur 8.8.8.8 + DoH dns.google : brevo-code, CNAME brevo1/brevo2._domainkey → b1/b2.passio-app-fr.dkim.brevo.com → TXT k=rsa, DMARC p=none, SPF OVH |
| Le nouveau relais a délivré un e-mail | auth_logs : POST /recover 200 à 13:22:07 UTC, GET /verify 303 à 13:23:38 (91 s, Gmail de Benjamin) |
| Consentement CGU envoyé dans signUp options.data et posé sur les deux chemins Google | app-02 l.4295-4299 ; app-08 l.2341 et l.2528 ; tests cgu-consentement.spec.js ③ et ⑮ |
| Signalements : 5 portes écrivent en base, policy `reports_insert`, anti-flood 10/min | app-04 l.3372-3386, l.3483-3494, l.1531-1542, l.3459-3472 ; app-07 l.5838-5861 ; pg_policies ; pg_get_triggerdef trg_rate_limit |
| Blocage appliqué par le serveur sur DM nouvelle, conversation d'événement, proposition IRL | pg_policies conv_members INSERT `NOT is_blocked_with(user_id)` ; `can_join_event_conversation` ; `irl_interaction_allowed` (app-07 l.5240-5258) |
| Aucune table public sans RLS ; client_errors illisible par un anonyme | requête pg_class relrowsecurity → aucune ; RLS true sans policy SELECT |
| Dashboard admin non exposé | `ls dist` sans dashboard/ ; https://passio-pilotage.onrender.com → 404 `x-render-routing: no-server` |
| Plan Supabase Pro, sauvegardes physiques quotidiennes | GET /organizations/… → plan pro ; /database/backups : COMPLETED 09/10/11 sept. 04:06 UTC |
| Archive locale complète | .passio/sauvegardes/2026-09-11-08-14-28-ouverture : 38 tables, 16 354 lignes, ecarts=[], 71 fichiers Storage |
| Tous les médias stockés passent par le CDN Netlify /media/* | 0 URL supabase.co directe dans posts, stories, profiles.avatar_url, conv_messages ; render/image → HTTP 200 |
| Base et Storage loin des plafonds | pg_database_size 53,9 Mo ; Storage 65 fichiers / 83 Mo ; plafonds Pro 8 Go / 100 Go |
| Prod calme | SQL 21:17 UTC : 7 comptes, dernier créé 2026-09-09 11:07 UTC, client_errors 24 h = 0, reports = 2 (anciens), blocks = 0, profils privés = 0 |
| Chaîne de livraison prête | main protégé (checks « Tests smoke (Playwright) » + « Gouvernance critique », enforce_admins) ; cycle PR → prod mesuré 21 min de CI + fusion ; secrets CI présents |

## Ce qui bloque encore (constats confirmés ET jugés bloquants)

### EM-1 : aucune preuve exécutée que l'e-mail de confirmation du nouvel expéditeur arrive en Réception avec dkim=pass

- Preuve du manque : SQL 21:17 UTC `max(created_at) auth.users` = 2026-09-09 11:07 UTC, soit AVANT la bascule SMTP (recharges config 13:19:51 et 13:20:06 UTC le 2026-09-11). Zéro inscription n'a traversé le nouveau montage. Le seul envoi mesuré (recover 13:22 UTC) va vers le propriétaire, pas vers un inconnu, et sans lecture d'en-tête. Registres en retard : .passio/context/KNOWN_RISKS.md:8 (R11 « en cours »), .passio/INTEGRATIONS_REGISTRY.md:17 (« DKIM/DMARC en cours de pose »).
- Pourquoi bloquant : la confirmation est obligatoire (mailer_autoconfirm=false). Une panne de livraison est un échec silencieux à 100 % des nouveaux, invisible de la sentinelle, des advisors et de client_errors (docs/SETUP_SMTP_AUTH.md:34-35). Historique : 1 compte sur 7 envoyé et jamais confirmé (SQL 21:17 UTC `envoyes_non_confirmes` = 1).
- Qui : Benjamin. Effort : 10 minutes.
- Minimum acceptable : une inscription réelle via « Créer mon compte » avec une adresse Gmail jamais vue par PASSIO ; e-mail « Confirme ton adresse e-mail pour PASSIO » en Réception ; « Afficher l'original » avec spf=pass, dkim=pass header.d=passio-app.fr, dmarc=pass ; lien cliqué ; `email_confirmed_at` renseigné en base. Doubler sur Outlook/Hotmail si possible. Consigner date, fournisseurs et ligne Authentication-Results dans docs/SETUP_SMTP_AUTH.md §3. Si header.d ≠ passio-app.fr : Brevo → Domains → passio-app.fr → Authentifier, avant d'ouvrir.

Aucun autre constat n'a été jugé bloquant sur le seuil « ouverture gratuite et large aujourd'hui ».

## À faire par Benjamin, hors code, dans l'ordre

1. (10 min, AVANT le lien) EM-1 : inscription Gmail neuve, lecture de l'en-tête, consignation. Voir minimum ci-dessus.
2. (15 min, AVANT le lien) MOD-01 : amorcer la routine de modération. `npm run moderation`, puis `npm run moderation vu --id r_xhhydg70fmqxjjto9` et `vu --id r_xhmapceexmt0ge5pr`. Les deux cibles n'existent plus en base (u_lou → 0 profil ; ec_local_1782636172208 → 0 commentaire). Preuve du manque : `ls .passio/moderation-vus.json` → absent (21:17 UTC).
3. (1 min) CAP-01 : Supabase → Org → Billing → Cost Control : vérifier que le Spend Cap est activé, et lire le compteur « Storage Images Transformed » (100 images d'origine incluses par mois, puis 5 $/1 000 ; c'est le premier quota Pro qui déborde quand les gens publient). NON MESURÉ par API (/billing/subscription → 404).
4. (jour J) Brevo : garder le compteur d'envois du jour à l'œil (300/j en offre gratuite). Si > 200 en journée, passer Brevo Starter ou accepter la dégradation jusqu'à minuit (EM-3).
5. (jour J) Garder le dashboard de pilotage allumé : c'est lui, pas la sentinelle GitHub, qui alerte au premier 5xx sur /auth/v1/signup (dashboard/server/alerts.js l.115-117).
6. (décision) Le rideau : soit le retirer (js/access-gate.js) le jour de l'ouverture, soit diffuser le code 2125. Tant qu'il reste, le texte « Beta privée / pas encore ouverte au public » (access-gate.js l.243-245, index.html l.106), le `<title>` « MVP Beta » et le §11 « Beta privée » de la politique (js/legal-textes.js l.218) contredisent CGU art. 2 « ouvert gratuitement au public ». Cohérence éditoriale, non bloquante.
7. (semaine 1) PR #335 (« Ouverture publique gratuite : sept défauts serveur, un lot client, deux canaux d'exploitation ») : poser la contre-revue exigée. État à 21:17 UTC : OPEN, tous checks verts sauf « Gouvernance critique » fail (garde de contre-revue, deploy.yml:85). Puis fusionner et lancer une fois `workflow_dispatch` sur « Alerte de modération » pour prouver le canal contre la prod.
8. (semaine 1) Suivre au pilotage le ratio `confirmation_sent_at non null / email_confirmed_at null` dans auth.users (1/7 aujourd'hui) : seul signal d'une panne de livraison.

## À faire en code (ordre, effort)

Ce que cette session devait livrer, « liens légaux sur l'écran du code d'accès » : DÉJÀ LIVRÉ ET SERVI. PR #334 (b15a0b5a) fusionnée, CI verte 16:42 UTC, release.json prod = b15a0b5a à 21:17 UTC, panneau #pgLegalPanel dans le rideau, textes dans js/legal-textes.js, e2e access-gate.spec.js l.124-199. Rien à écrire, ne pas doubler. Le seul rendu non exécuté dans un navigateur par cette expertise est couvert par l'e2e CI.

Lots suivants, après l'envoi du lien, par ordre de priorité :

1. Fusion de #335 (heures de revue, 0 h de développement) : destinataire machine des signalements (moderation-alerte.yml, reports.status, `npm run moderation traiter`). Précondition : contre-revue humaine (geste 7 ci-dessus).
2. Lot « is_blocked_with côté serveur » (heures, migration) : MOD-02 + MOD-03. follows INSERT `AND NOT public.is_blocked_with(following_id)` ; clause follows de `post_is_visible` et des policies SELECT posts/stories conditionnée à `NOT is_blocked_with(author_id)` ; conv_messages INSERT avec `m.conv_id = conv_messages.conv_id` (pas `conv_id = conv_id`, ambiguïté relevée) ; post_comments et notifications ; banc controles_*.sql ; test e2e multi-comptes dans tests/e2e/blocage-acces.spec.js (aujourd'hui un seul test, sur follows). Devient urgent (48 h) dès que `profiles.is_private` > 0 ET `blocks` > 0 (0 et 0 à 21:17 UTC).
3. Push « X t'a envoyé un message » d'un bloqué (minutes) : dans `_notifierMessage` (app-08 l.4754-4801) ne pas invoquer notify-call si `isBlocked(toUserId)` ; côté Edge Function notify-call, refus si une ligne blocks existe entre les deux (grep « blocks » dans supabase/functions/notify-call : 0 résultat). 5 abonnés push aujourd'hui.
4. EM-3 (minutes) : dans onbDoAuth (app-02 l.4160-4187), onbResendConfirmation (l.3844-3847) et onbForgotPassword (l.3803), réécriture française de `/error sending|sending (confirmation|recovery) email|smtp/i` + `tel.error("auth_smtp_fail")` ; nommer la cause dans l'alerte api5xx pour /auth/v1/(signup|resend|recover) ; corriger le commentaire « 30 e-mails par heure » (l.4172-4174) en 150/h.
5. Docs (minutes) : sept passages qui raisonnent encore en plan Free (CLAUDE.md l.371, l.412-413, l.616 ; docs/CDN_MEDIAS.md l.3, l.101, l.104-105 ; docs/OUVRIR_AU_PUBLIC_2026-09-10.md l.122-123, l.163) ; ajouter « 100 images transformées/mois » à docs/SCALE_RUNBOOK.md ; KNOWN_RISKS R11 et INTEGRATIONS_REGISTRY:17 à passer en « posé et prouvé » après EM-1 ; docs/CHECKLIST_COMMERCIALISATION.md:233 prête à l'app une promesse (« ni de vous écrire ») qu'elle ne fait pas ; commentaire périmé app-08 l.5372-5379.
6. Advisors Supabase (heures, staging d'abord) : 3 fonctions search_path mutable, pg_trgm dans public, SECURITY DEFINER exécutables par anon. Non jugés bloquants au seuil gratuit.

## Ce qui ne bloque pas mais doit être su (P2/P3 confirmés)

- EM-3 (P2) : refus du relais SMTP (quota Brevo 300/j ou clé révoquée) = message anglais brut sur inscription, renvoi et mot de passe oublié. Mais la télémétrie api capte déjà le 5xx (js/telemetry.js l.824-850) et le dashboard alerte « high » dès la première occurrence (alerts.js l.115-117). Déclencheur : > 300 envois/jour. Adresse non perdue.
- MOD-01 (P2) : la file de signalements n'a aucun destinataire automatique et aucune trace de lecture. Zéro cas vivant en file (deux cibles disparues). Le blocage côté serveur ne dépend d'aucun modérateur. Redevient P1 si le journal est toujours vide 7 jours après l'ouverture, ou si un signalement visant un contenu existant reste sans lecture > 48 h.
- MOD-02 (P2, confidentialité) : une personne bloquée peut se réabonner à un compte privé et revoir ses posts/stories (pg_policies follows INSERT sans is_blocked_with ; `post_is_visible`). Exposition nulle : 0 compte privé, 0 blocage. Aucune promesse produit contredite (app-09 l.1311 : « tu ne le suivras plus »).
- MOD-03 (P2, défense en profondeur) : conversation existante, commentaires, notifications d'un bloqué restent masqués côté client seulement. Promesse tenue (« Ses messages seront masqués », app-04 l.3521). Le trigger broadcast_conv_message_to_users diffuse aussi sans filtre blocks. Seul canal qui perce : la push notify-call.
- CAP-01 (P2) : les docs décrivent le plan Free alors que l'org est en Pro (25 $/mois, coût d'exploitation, sans effet sur la gratuité ni sur le régime « particulier »). Plafond réel le plus serré : 100 images transformées/mois. Le retour au Free ferait perdre miniatures, sauvegardes quotidiennes et anti-pause.
- LC-1 recoté P3 : ne jamais câbler openLegalNotice()/openModal depuis le gate (ReferenceError avant app.js ; z-index 10001 < 2147483647). Déjà respecté par #334 et verrouillé par dist-build.spec.js.
- Sentinelle autonome tenue ~41 % des créneaux par GitHub (écarts 4-5 h) : le pilotage horaire n'est pas garanti.
- Résidu dashboard : repli `admin`/`admin` dans dashboard/server/config.js l.36-37, actif en local seulement.
- Fuite event_attendees/events (adresses de rencontres visibles d'un bloqué) : mentionnée par un réfutateur comme constat distinct. NON JUGÉ dans le dossier reçu.

## Constats RÉFUTÉS par la contre-expertise (titre + pourquoi)

- LC-1 « Aucun texte légal atteignable sous le rideau, bloquant P1 » : PÉRIMÉ. Livré par #334 (b15a0b5a), servi en prod (release.json 21:17 UTC), textes inlinés en tête AVANT le loader `__gateReady`, panneau rendu DANS #passioGate. Ne pas rouvrir.
- EM-3 « aucune télémétrie, sans trace côté pilotage » : FAUX. hookFetch écrit tout appel supabase non-ok en telemetry_events (preuve prod : le 429 de /auth/v1/resend du 2026-09-07 y figure) ; alerte dashboard dès le premier 5xx. Reste vrai : message anglais et cause non nommée.
- EM-3 « noter le compteur Brevo dans SETUP §9 » : DÉJÀ FAIT (§9 l.167-171).
- MOD-01 « il faut construire le job d'alerte » : PÉRIMÉ. Écrit, testé (8 verrous), vert en CI dans #335. Reste : contre-revue + fusion + premier run non-PR.
- MOD-01 « P1 bloquant » : SURCOTÉ. Zéro cas vivant en file, blocage serveur indépendant du modérateur, script vieux de quelques heures. P2.
- MOD-02 « atteinte à la sécurité des personnes, P1 » : RECLASSÉ confidentialité P2. Effet limité aux posts/stories d'un compte privé, opt-in utilisé par 0/6 profils, 0 blocage, instance du modèle déjà documenté (#134 constat 3). Phrase « Bloquer ne l'empêche pas de vous suivre » : n'existe dans aucun écran ni document du produit.
- MOD-03 « promesse “ni de vous écrire” non tenue » : FAUX sur la promesse. L'app promet « masqués », et c'est tenu. La formule n'existe que dans docs/AUDIT_COMMERCIALISATION_2026-09-10.md:2276 et CHECKLIST_COMMERCIALISATION.md:233. Référence « historique app-05 l.3128 » fausse (filtre des vidéos live).
- CAP-01 « tous les plafonds cités sont faux, un abonnement court pendant le lancement gratuit, P1 » : les chiffres sont les vrais chiffres Free, c'est le plan qui est faux, dans le sens PESSIMISTE (plafonds réels 16 à 100 fois plus larges). 25 $/mois d'hébergement ne touche ni la gratuité ni le régime LCEN. Spend Cap activé par défaut en Pro : le risque réel est un service coupé au dépassement, pas une facture ouverte. P2.
- « Le retrait de Node 20 par GitHub le 23 septembre bloque la CI » : FAUX, CI sur Node 22 (setup-node@v5, checkout@v5).
- « Les anciens médias gardent leur URL Supabase directe » (docs/CDN_MEDIAS.md) : RÉGLÉ, 0 URL directe en base.
- « nslookup échoue donc DNS incomplet » : FAUX, UDP 53 sortant bloqué sur ce poste ; DNS complets via 8.8.8.8 et DoH.
- « Le lien de confirmation mène au domaine mort passio-app.fr » : FAUX, site_url et uri_allow_list = passio-app.netlify.app uniquement.

## Non mesuré

- Dossier reçu tronqué après le motif du juge de CAP-01 : les constats jugés des dimensions SÉCURITÉ (SEC-01 inv.emoji, SEC-02, SEC-04 notes vocales, SEC-05, SEC-08), PARCOURS (LC-3, EM-5), EXPLOITATION (#327 immobilisant la sentinelle autonome) et DÉPÔT n'ont pas été reçus avec leur verdict. Seules leurs mentions dans « ce qui tient » et « non mesuré » sont connues. Ils ne sont ni bloquants ni non bloquants ici : NON REÇUS.
- Rendu visuel réel du panneau légal sous le rideau dans un navigateur (couvert par l'e2e CI, pas exécuté par cette expertise).
- Placement Réception/Indésirables et en-tête Authentication-Results d'un e-mail signup du nouvel expéditeur (objet d'EM-1).
- Statut « Authentifié » du domaine dans Brevo, compteur Brevo du jour, comportement exact au dépassement des 300/j.
- Spend Cap Supabase, taille de compute réelle (Nano ou Micro), egress du cycle, règle de comptage des images transformées.
- Plan Netlify, bande passante et invocations Edge du mois (CLI absente, aucun jeton local).
- Arrivée effective de cgu_version dans auth.users.raw_user_meta_data pour un compte créé après #329 : 0/7 à 21:17 UTC, aucun compte créé depuis.
- Conservation des clés cgu_* lors d'une liaison Google sur un compte e-mail existant.
- Existence et acheminement de la boîte contact@passio-app.fr (MX OVH présents, aucun test).
- Comportement réel sur appareil : lien de confirmation ouvert dans la PWA installée (Android WebAPK, iOS Mail → Safari vs PWA).
- Scénarios multi-comptes « bloqué écrit dans une DM existante / commente / se réabonne » et conversations de groupe avec un membre bloqué : lus dans les policies, jamais joués.
- Exploitation réelle des canaux Realtime publics et exécution du onerror inv.emoji (SEC-01) : lecture seule, aucune attaque contre la prod.
- Rate limiting PostgREST/Netlify au bord.
- Première exécution effective de purge_telemetry_7j (attendue 2026-09-12 04:00 UTC).
- Comportement de l'app quand Realtime refuse la connexion (plafond 500).
- Restaurabilité effective des sauvegardes physiques Supabase, durée de rollback.yml, retour arrière Netlify : jamais exercés.
- Copie hors machine des archives .passio/sauvegardes ; 2FA et second propriétaire sur GitHub/Supabase/Netlify/Brevo ; réglages de notification GitHub de PASSIO74.
- Temps de réponse de l'éditeur à un signalement ; applicabilité exacte du DSA art. 16 à un hébergeur non professionnel.
- Contenu de migrations/00_ORIGINE_PROD.sql et scripts/schema-origine.js (autre session, non lus, non touchés). docs/CHECKLIST_COMMERCIALISATION.md est aussi modifié non commité (git status 21:17 UTC), à ne pas toucher.

## Annexe : les 41 constats P2/P3, non soumis à réfutation

Relevés par les enquêteurs, cotés non bloquants, **non contre-expertisés** : à lire comme des pistes vérifiées une fois, pas comme des verdicts.

| Id | Gravité | Qui | Constat |
|---|---|---|---|
| LC-3 | P2 | benjamin | La preuve que le consentement « atteint le serveur » se lit dans auth.users.raw_user_meta_data, PAS dans user_state : sur le chemin e-mail (Confirm email), user_state ne portera JAMAIS user.cgu |
| LC-4 | P2 | code | La politique de confidentialité (version 2026-09-10) contredit les CGU (même version) : « beta privée », « accès protégé par un code » vs « ouvert gratuitement au public » |
| LC-5 | P2 | code | Textes qui deviennent faux à la diffusion large : « Beta privée », « pas encore ouverte au public », « Accès réservé », « MVP Beta », « MVP beta testable » |
| LC-6 | P3 | benjamin | passio-app.fr affiche la page de parking OVH en HTTP et ne répond pas en HTTPS, alors que c'est le domaine expéditeur des e-mails d'authentification ; deux identités de contact coexistent |
| EM-4 | P2 | code | Le lien de confirmation expire au bout de 1 h (mailer_otp_exp=3600) et un lien expiré arrive sur l'app sans aucun message |
| EM-5 | P2 | code | Lien de confirmation sur mobile : il atterrit dans le navigateur système, derrière la gate si le code n'y a jamais été saisi ; la PWA iOS reste déconnectée |
| EM-6 | P2 | code | Refus HIBP (« Password is known to be weak… ») affiché brut en anglais à l'inscription et à la récupération — mesuré 2 fois aujourd'hui |
| EM-7 | P3 | code | Deux documents affirment encore que le domaine n'est pas authentifié / que les DNS restent à poser — faux depuis aujourd'hui |
| EM-8 | P3 | code | Le message après inscription ne dit pas de qui vient l'e-mail ni sous quel objet le chercher |
| MOD-04 | P2 | decision | Aucun canal d'urgence ni délai chiffré : l'adresse éditeur est un Gmail, le seul engagement est « meilleurs délais », et rien ne renvoie vers le 17/112 pour un danger physique |
| MOD-05 | P3 | code | Ce que voit la personne bloquée : strictement rien de différent — ses messages en DM existante sont écrits en base et affichés « envoyés » sans jamais être lus (comportement silencieux type Instagram, mais non documenté et non testé) |
| MOD-06 | P3 | benjamin | Documents de référence faux ou périmés : la checklist coche encore « un signalement n'arrive nulle part » sans nuance, le skill /moderation décrit une colonne `kind` et une « lecture admin » qui n'existent pas |
| CAP-03 | P2 | code | Le cache CDN /media/* ne divise pas l'egress « par le nombre de vues » : mesuré ~1 hit sur 3, vidéo jamais servie du cache, et chaque requête Range (iOS) invoque la fonction avec une lecture interne complète |
| CAP-04 | P2 | code | Télémétrie : ~2,3 Mo par utilisateur actif et par jour en régime 7 jours, plus un abonnement Realtime qui rediffuse chaque insert — mur vers 3 000 DAU sur Pro (aurait été ~200 DAU sur Free) |
| CAP-05 | P2 | code | Aucune alerte interne avant un mur (base, Storage, egress, Brevo) : la seule sonde de production lit client_errors |
| CAP-06 | P2 | code | Realtime : 3 canaux par client au repos, plafond de connexions simultanées non instrumenté, et le repli hors-realtime décrit par le runbook n'existe plus dans le code |
| CAP-07 | P3 | code | Plafonds d'upload incohérents : image 40 Mo côté client > 26 Mo côté bucket → refus serveur silencieux, post publié sans média |
| CAP-08 | P3 | decision | 79 lignes user_state sur 85 n'appartiennent à aucun compte auth, dont une ligne orpheline de 4,7 Mo (clé « user ») : preuve qu'un état peut atteindre plusieurs Mo, rechargé intégralement à chaque boot |
| CAP-09 | P3 | code | Docs contradictoires entre elles sur l'egress (5 Go vs 10 Go) et sur la compute (Nano) — toutes périmées par le plan Pro |
| SEC-03 | P2 | code | vlive:<liveId> public : injection de flux vidéo chez les spectateurs, saturation des 8 slots hôte par des présences fictives |
| SEC-04 | P2 | code | Seau attachments public : les notes vocales ont un chemin sans aléa (timestamp seul), lisible à vie par quiconque connaît le conv_id |
| SEC-05 | P2 | base | client_errors : INSERT anonyme illimité, sans rate-limit ni borne de taille — remplissage de la base par un visiteur |
| SEC-07 | P2 | decision | CSP script-src 'unsafe-inline' (+ cdn.jsdelivr.net, unpkg.com sans SRI) : toute injection HTML devient exécution de code |
| SEC-08 | P3 | base | 6 fonctions SECURITY DEFINER exécutables par anon : seul is_conv_member est un oracle réel (appartenance à une conversation), le reste est inerte |
| PU-03 | P2 | code | Un compte confirmé arrive avec un profil de remplissage « Musique » et aucune invite à choisir ses passions ; le premier fil est ~92 % de démonstration |
| PU-04 | P2 | benjamin | Un inscrit sur cinq n'a jamais confirmé : preuve vivante du cul-de-sac « regarde tes e-mails », sans relance ni visibilité |
| PU-05 | P2 | benjamin | Google en PWA installée : chemin de code cohérent et provider activé, mais jamais éprouvé en réel depuis le 23 juin et couvert uniquement par des mocks |
| PU-06 | P3 | code | L'installation PWA n'est proposée que par l'overlay automatique iOS Safari ; sur Android/desktop le bouton vit dans une landing que le parcours first-run n'affiche jamais |
| PU-07 | P3 | code | La permission push est demandée sans pré-explication à la première ouverture d'une conversation 1:1, et jamais ailleurs |
| PU-08 | P2 | code | Trois étapes du parcours n'ont AUCUN test e2e : le retour par lien de confirmation (fragment → boot), le gate sur un second navigateur, et l'installation/push |
| EXP-02 | P2 | benjamin | Les alertes n'arrivent que sous forme d'issue GitHub ; les issues [SENTINELLE] sont créées AU NOM de PASSIO74, donc sans notification e-mail à PASSIO74 ; aucun canal push/SMS |
| EXP-03 | P2 | decision | Fréquence réelle de la sentinelle distante ≈ 4 h (pas horaire) et périmètre : un site down est vu au mieux 4-8 h après ; « Santé publique » ne teste que la présence de deux chaînes dans le HTML Netlify |
| EXP-05 | P2 | benjamin | Aucune sauvegarde applicative automatisée ; deux archives locales à 26 jours d'écart, sur le seul disque de production de Benjamin, sans copie hors machine trouvée — MAIS le plan Supabase est « pro » : 8 sauvegardes physiques quotidiennes existent (sans le Storage) |
| EXP-07 | P2 | benjamin | rollback.yml n'a jamais été exécuté (0 run) ; le retour arrière réel prend ~25-30 min minimum et deux gestes humains ; le rollback instantané Netlify n'est documenté nulle part |
| EXP-08 | P2 | decision | Un seul humain, un seul compte partout, aucune procédure d'absence |
| EXP-09 | P3 | benjamin | Pause Supabase après 7 jours d'inactivité : SANS OBJET, le projet est sur un plan payant — et deux documents raisonnent encore sur un « plan gratuit » |
| CI-03 | P2 | code | Liens légaux sur l'écran du gate : liste exacte des tests et gates qui cassent selon la façon de faire |
| CI-04 | P3 | decision | La garde « Gouvernance critique » ne couvre pas js/access-gate.js, index.html ni js/legal-textes.js ; pour .github/* et migrations/* la contre-revue est une auto-revue du même compte |
| CI-05 | P3 | decision | Suites production en CI : 3 tests joués, 12 sautés — la messagerie cross-comptes en base réelle n'est jamais exercée par la chaîne |
| CI-06 | P3 | decision | PR #281 (draft) dort sans risque mais est orpheline : aucun run CI, bloquée, et main a réécrit 3 fois le fichier qu'elle épingle |
| CI-07 | P3 | benjamin | Retour arrière : le workflow de rollback crée une PR et repasse toute la chaîne (≈ 25 min), pas de retour instantané documenté dans le dépôt |

## Méthode

Workflow d'orchestration en trois phases : huit enquêtes en parallèle (preuves fichier et production en lecture seule), puis pour chaque constat P0/P1 ou déclaré bloquant trois réfutateurs indépendants (re-vérification des preuves, contre-exemple, portée « gratuit vs commercial ») et un juge (« faut-il l'avoir réglé avant d'envoyer le lien ? »), puis une synthèse. 81 agents, 957 appels d'outils, ~53 minutes de calcul. Deux réfutateurs ont été refusés par les garde-fous du modèle sur SEC-01 et SEC-02 (sujet « cyber ») : ces deux constats ont été jugés sur deux votes au lieu de trois, tous deux confirmant. Le dossier remis au rédacteur de la synthèse était tronqué à 120 000 caractères : les constats manquants sont restitués en tête de ce document, avec leur verdict, depuis le journal complet du workflow.
