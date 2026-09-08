# Bilan consolidé et plan de correction — BILAN PASSIO 09/26 (étapes 2 et 3 de la contre-revue)

> Établi le 2026-09-08 par la session « Avancer sur le projet BILAN » (Claude Fable 5.1, `session_014R2zEeBRiyNk1STv73GrrA`), pendant l'indisponibilité de GPT-6 Astra (crédits épuisés jusqu'au 2026-09-14). Il reprend l'ordre de mission de la contre-revue (`15-CONTRE-REVUE-ASTRA-PROMPT.md` §0) : **étape 2** (consolider : ce qui fonctionne, ce qui bloque, ce qui reste à tester ; verdict maintenu ou amendé) et **étape 3** (plan de correction ordonné, soumis à Benjamin). L'étape 1 (vérification des 81 problèmes non relus, contrôles débloqués) est dans `16-RELECTURE-COMPLEMENT-2026-09-08.md`.
>
> SHA de référence inchangé : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf` (`main` n'a reçu aucun commit entre le 2026-09-04 et le 2026-09-08 : `git rev-list --count c8cb8e9..origin/main` = 0). Aucun code applicatif n'est modifié par ce document. **Rien n'est corrigé avant l'accord de Benjamin** ; ce plan est ce qui lui est soumis.
>
> Réserve de méthode : cette consolidation est faite par le même modèle que l'audit. Elle ferme les trous de MÉTHODE signalés le 2026-09-04 (81 problèmes non relus, contrôles bloqués) ; elle ne remplace pas le regard d'un modèle tiers, qui reste attendu le 14.

## 1. Ce qui FONCTIONNE (prouvé, à ne pas défaire)

| Domaine | Preuve |
|---|---|
| **Isolation des comptes sous rôle** | Banc PostgreSQL jetable chargé des 123 policies réelles du 2026-09-08 (`preuves/complement-2026-09-08/banc-isolation-role/`) : UPDATE/DELETE d'un tiers = **0 ligne sur 40 tables**, usurpation d'auteur / auto-invitation / message hors conversation / notification signée par autrui / dépôt Storage chez autrui / télémétrie au nom d'autrui : **tous refusés** ; données « propres » (messages, conversations, membres, notifications, user_state, user_safety, push, signalements, télémétrie) : **0 ligne** pour anon et pour un tiers ; comptes privés respectés (post et story invisibles au non-abonné). Confirmé en production par le job « Suites production » du run 2494 (authz-critical : usurpation 403, cross-compte 0 ligne, anonyme sans donnée privée, Storage cloisonné). |
| **CI** | Run 2494 lu dans ses journaux : 1 096 tests navigateur passés, 1 instable repris, 0 échec ; dashboard 344/349 ; banc T&S serveur et migration référentiel verts ; déploiement Netlify vert. Suite complète locale du 2026-09-04 : 1 094 / 1 échec environnemental (carte). |
| **Lot Trust & Safety IRL (sous drapeau)** | `irl-trust-safety.spec.js` exécutée localement le 2026-09-08 : 23/23 (OFF par défaut, kill switch, verdicts mineur/bloqué, GPS jamais recopié, DM bloqué refusé, télémétrie sans PII). |
| Première visite, référentiel plat (1 908), fil additif, page Mes passions, confirmation d'e-mail, propriété de l'état local par compte, échappement systématique (hors MSG-01/MSG-02), position GPS jamais persistée, performances sur appareil rapide | Rapports 03, 04, 06, 07 (inchangés). |

## 2. Ce qui BLOQUE la commercialisation (après relecture complète)

Les huit P0 sont **tous maintenus** (voir rapport 16 pour les deux qui n'avaient pas été relus, EXP-01 et PERF-01, désormais confirmés) et les sept critères d'interdiction restent vrais :

| Critère | État au 2026-09-08 |
|---|---|
| P0 ouvert | 8 (SUP-01/MSG-03/CONT-11, MSG-01, MOD-01, SUP-04, EXP-01, PERF-01) |
| Isolation non prouvée | **Levé en partie** : l'isolation par propriétaire est PROUVÉE sous rôle sur réplique et en production (authz-critical). Restent les trois fuites *voulues par les policies* et prouvées sous rôle : `conv_reads`, `event_attendees`/`events` (adresse, téléphone), listing `attachments`. Le critère bascule donc de « non prouvé » à « prouvé, avec trois fuites à fermer ». |
| Restauration non prouvée | Vrai (EXP-01 confirmé : jamais exécutée, 4 migrations enregistrées sur 64, baseline du 2026-08-17). |
| Capacité non mesurée | Vrai (PERF-01 confirmé : aucune mesure, aucun staging, 60 connexions). |
| Fonction critique invisible du Pilotage et de la Sentinelle | Vrai (PIL-01, PIL-04, PIL-10 confirmés le 2026-09-04). |
| Sécurité IRL / modération insuffisante | Vrai (MOD-01 P0 ; IRL-01/02/03 confirmés sous rôle). |
| Staging et prod confondus | Vrai (SUP-04, EXP-11, TCI-04) — **chantier CH01 déjà ouvert** (#282). |

**Verdict : MAINTENU — BÊTA FERMÉE UNIQUEMENT, NO-GO grande échelle.** Amendement : le critère « isolation » n'est plus une inconnue mais une liste fermée de trois fuites, toutes couvertes par CH02 et CH05 ci-dessous.

## 3. Ce qui RESTE À TESTER (ne peut pas être fait d'ici)

Inchangé par rapport au rapport 13, moins ce qui a été débloqué le 2026-09-08 (journaux CI, isolation sous rôle, MOD-C30, DEV-C13) :

1. Fichier réellement servi par https://passio-app.netlify.app (proxy) — n'importe quel poste : `curl -sI …/release.json`.
2. REST anon direct vers la prod (proxy) — attendu table par table désormais connu (matrice du banc).
3. Plans, quotas et réglages Dashboard Supabase (Auth rate limits, captcha, sessions, PITR, `max-rows`), Netlify, Brevo — captures par Benjamin.
4. Appareils et navigateurs réels (iOS Safari + PWA installée, Android, Samsung Internet, tablettes) — grille du rapport 09.
5. Restauration complète et campagne de capacité — impossibles sans staging (CH01, CH07, CH08).
6. Relecture juridique par un professionnel (CGU, mentions, confidentialité).

## 4. Plan de correction ordonné (étape 3) — soumis à Benjamin

Douze chantiers. Chaque chantier = une branche, une PR, un seul écrivain, ses tests de non-régression et la **réinjection du défaut** (le test doit être rouge sans le correctif). Les efforts reprennent ceux du registre (rapport 11) ; « risque » = risque de régression. L'ordre tient compte des dépendances (CH01 conditionne tout ce qui exige une CI qui n'écrit plus en production).

### CH01 — Isoler les tests de la production, et disposer d'un staging
*Ouvert : issue #282 (canal local, un seul écrivain). Ne pas dupliquer.*
- Couvre : SUP-04 (P0), EXP-11, TCI-04, TCI-01 (suites opt-in), CPL-TCI-01/02 (échec silencieux de `mesure-passions.js` : `process.exit(0)` dans son catch ET `continue-on-error: true` ; purge Storage jamais exécutée en CI faute de `SUPABASE_URL`), et **CPL-TCI-03 (P1, trouvé le 08)** : `deploy.yml:300-347`, le job `test-prod` n'a ni `needs` ni `if` et reçoit `SUPABASE_SERVICE_ROLE_KEY` sur toute `pull_request`, en parallèle du job Gouvernance et non en aval — une branche non relue peut exfiltrer la clé qui contourne toute la RLS. **Correction minimale à livrer sans attendre le reste du chantier : `needs: [governance]` sur ce job (une ligne).**
- Préalable à : CH02 (migrations Storage testables), CH07 (restauration = cible), CH08 (charge).
- Effort : 3 à 5 jours (registre) — en cours. Risque : moyen (clé anon inlinée au build, dérive de schéma staging/prod).
- Preuve d'acceptation : les huit points de #282 ; un run de PR n'écrit plus une ligne en production.

### CH02 — Rendre la messagerie réellement privée
- Couvre : **SUP-01 / MSG-03 / CONT-11 (P0)**, SUP-02 / MSG-05 (conv_reads), SUP-03 (WITH CHECK conv_messages), AUTH-06 (file locale rejouée sous un autre compte — **reproduit le 08** : `passio_outbox_v1` survit à `purgeAccountScopedData()`, puis `_flushOutbox` insère `from_id` = uid du compte suivant avec le contenu de A), CPL-ROB-01 (un message déjà livré, code 23505, est marqué « réessayer » et renvoyé à chaque reconnexion), MSG-10 (bloqué déjà membre), MSG-06 (suppressions qui ressuscitent), SUP-10 partiel (purge Storage à la suppression).
- Correction : `attachments` → `public=false` ; policy SELECT `storage.objects` = `is_conv_member((storage.foldername(name))[2], auth.uid()::text)` pour `attachments`, `owner = auth.uid()` pour `content` (le rendu par URL publique passe alors par `createSignedUrl` TTL court, `app-09:886,1599`) ; migration des URLs déjà écrites dans `conv_messages.content` (68 messages, 5 avec URL publique) ; `drop policy reads_select` → `is_conv_member` ; `WITH CHECK` sur « Update propre » ; six clés dans `ACCOUNT_SCOPED_KEYS` + identité figée dans la file d'envoi ; policy INSERT conv_messages refusant un membre bloqué.
- Tests : bloc supplémentaire dans `authz-critical.spec.js` (tiers → 0 ligne sur conv_reads, listing `attachments` = 0 pour anon), cas AUTH-06 (file de A, boot en B, aucune requête), `conv-suppression.spec.js` étendu ; le banc `banc-isolation-role` rejoué doit passer `conv_reads` et `storage.objects/attachments` de PUBLIQUE à propre.
- Effort : 3 à 4 jours. Risque : **élevé** (vocaux déjà envoyés avec URL publique cessent de se lire sans migration ; revue sécurité indépendante exigée par le protocole du 2026-08-13).

### CH03 — Fermer les canaux Realtime et les deux XSS
- Couvre : **MSG-01 (P0)**, SUP-06 (ring:/call:/typing: publics), MSG-02 (XSS @mention), PRO-02 (identité affichée choisie par l'émetteur), MSG-04 + SUP-07 (notifications forgeables, écritures de masse).
- Correction : ① `escapeHtml(inv.emoji)` borné à un emoji (30 min) ; ② canaux privés `{config:{private:true}}` + policies `realtime.messages` (`topic = 'ring:'||auth.uid()`), `callId` aléatoire, `payload.from` jamais cru ; ③ @mention rendue par `data-name` + écouteur délégué ; ④ `trg_identite_affichage` étendu à `conv_messages.content->'sp'` et `notifications` ; ⑤ `rate_limit_insert('from_id',30)` sur notifications, `('from_id',60)` sur conv_messages, `notify-call` composant le texte côté serveur et refusant sans relation ni si bloqué.
- Tests : `echappement.spec.js` (les deux cas), e2e-multi pour les canaux privés, `authz-critical` (notification forgée 403 déjà présente → étendre à la cadence).
- Effort : 2 à 4 jours (① seul : 30 min, à livrer immédiatement). Risque : moyen (Realtime Authorization casse les appels si un client n'a pas de session).

### CH04 — Chaîne de modération
- Couvre : **MOD-01 (P0)**, MOD-02, MOD-03, MOD-04, MOD-06 + CONT-08 (rate-limits serveur), PIL-10 (vue Modération).
- Correction : migration `reports.status/handled_by/decision/resolved_at` + table `moderation_actions` ; route `service_role` dans `dashboard/` (file par gravité, masquer/retirer post·commentaire·story·événement·message, journal) ; « Signaler » avec motif sur posts, stories, bobines, messages ; policy `follows` INSERT `AND NOT is_blocked_with(following_id)` ; `trg_rate_limit` généralisé (posts, post_comments, post_likes, follows, stories, events, conversations) + CHECK de longueur ; toast « Trop rapide » côté client.
- Tests : `blocage-acces.spec.js` (re-follow refusé), banc serveur T&S étendu aux quotas (mutation : retirer un trigger → rouge), tests dashboard pour la file.
- Effort : 6 à 9 jours. Risque : moyen (policies sur tables très exposées ; suites prod écrivent vite → seuils au-dessus de l'usage réel).

### CH05 — Sécurité des rencontres et des mineurs
- Couvre : IRL-01, IRL-03 (prouvés sous rôle : adresse, téléphone, participants lisibles sans compte), IRL-02 + MOD-08 + AUTH-02 (majorité jamais déclarée sur le chemin nominal, 1995 par défaut), UXO-07 (« contrôle d'âge IA »), IRL-04 (promotion liste d'attente refusée en silence), IRL-07 (P1 après relecture : saturation des 60 événements), et les oublis du 08 : CPL-IRL-02 (le blocage n'existe pas pour les événements — un compte bloqué peut s'inscrire à ma rencontre et y lire l'adresse), CPL-IRL-01 + CPL-ROB-02 (RSVP refusé par le serveur : affichage optimiste jamais annulé, organisateur notifié quand même), CPL-IRL-03, CPL-IRL-04.
- Correction : colonnes sensibles (`address`, `contact`, `lat/lng` précis) servies par vue/RPC réservée aux inscrits `going/maybe` et à l'organisateur, liste publique = ville + position arrondie ; `event_attendees` SELECT réservé aux authentifiés, `feedback/rating` à l'organisateur ; `declare_birth_year` appelée à l'onboarding et à `onbDoAuth`, garde RLS `irl_interaction_allowed` sur INSERT `event_attendees`/`events` ; texte d'âge exact ; RPC `promote_from_waitlist` ; pagination des événements.
- Tests : `irl.spec.js`, `irl-trust-safety.spec.js` (23 verts aujourd'hui, à étendre au chemin nominal), `connexion-compte-existant.spec.js` (16 cas), banc serveur (anon → 0 sur `event_attendees`).
- Effort : 5 à 8 jours. Risque : moyen (carte et tri par proximité lisent `lat/lng` ; comptes existants sans année).

### CH06 — Base légale, consentement, support, effacement
- Couvre : AUTH-03, MOD-09, EXP-09 (CGU, mentions, acceptation horodatée), AUTH-04 (télémétrie sans consentement ni interrupteur ; nuance du 08 : `user_label` est NULL sur 100 % des 114 921 lignes, mais `user_id` est présent sur 85 143 et `device_id` sur toutes, en clair), EXP-07 (« Support » n'envoie rien), EXP-08 (droits d'accès/portabilité, procédure 72 h), AUTH-05 + SUP-10 + CPL-AUTH-01 + CPL-EXP-03 (suppression de compte incomplète : aucune FK `public` → `auth.users`, 79 blobs `user_state` orphelins sur 84, 51 `analytics_events`, 19 `notifications.from_id`), MOD-07 (captcha, mots de passe compromis). AUTH-13 est RÉFUTÉ sur son point central (le provider Google est actif : deux identités en base), résidu P3.
- Correction : pages légales versionnées + case d'acceptation (`terms_version`, `terms_accepted_at`) ; bandeau + interrupteur télémétrie (ou anonymisation stricte) ; table `feedbacks` ou Edge Function vers une boîte réelle ; export JSON signé ; `delete-account` étendu et transactionnel (SECURITY DEFINER) ; Turnstile + `captchaToken` + protection HIBP.
- Tests : `confirmation-email.spec.js`, `first-run.spec.js` (38, l'étape d'acceptation ne doit pas casser l'entrée directe), `suppression-compte.spec.js` étendu aux tables oubliées (et enfin exécuté en CI : CH01).
- Effort : 6 à 9 jours de code + rédaction juridique externe. Risque : faible à moyen (`onbDoAuth` gagne une étape).

### CH07 — Continuité : sauvegarde, restauration, retour arrière
- Couvre : **EXP-01 (P0, aggravé le 08)** : `migrations/SCHEMA_PROD_REFERENCE.sql` ne contient AUCUN `CREATE TABLE` ni `CREATE POLICY` (841 lignes de commentaires et 91 `CREATE INDEX` inexécutables sur base vide), 39 tables / 119 policies en prod contre 35 / 116 décrites, 4 migrations enregistrées sur 64 — la « référence » ne permet pas de reconstruire quoi que ce soit, et `schema-baseline.js` promet une base identique sans émettre de DDL (CPL-EXP-02) ; EXP-02, EXP-04, NET-07, TCI-03, EXP-03, CPL-TCI-04. Le banc `banc-isolation-role` (schéma + 123 policies + fonctions + triggers exécutables) est aujourd'hui la seule reconstitution exécutable du schéma : point de départ de la nouvelle baseline.
- Correction : `schema:baseline` régénéré et déclaré référence unique + journal des migrations (fichier → date → auteur → rollback) ; sauvegarde quotidienne planifiée, chiffrée, hors Supabase ; **restauration complète exercée** sur le projet staging (schéma → auth → données → Storage → policies) puis `authz-critical` dessus, RPO/RTO écrits ; rollback Netlify documenté et exercé une fois ; `rollback.yml` exercé sur un commit anodin.
- Tests : job mensuel « sauvegarde → restauration PostgreSQL jetable → comptages par table » (le banc `banc-isolation-role` fournit déjà le squelette : schéma + policies + assertions).
- Effort : 4 à 6 jours. Risque : nul sur le code applicatif.

### CH08 — Capacité mesurée et télémétrie bornée
- Couvre : **PERF-01 (P0)**, PIL-03 (télémétrie insérable sans borne, jamais purgée), advisors (78 policies `auth_rls_initplan`, 30 permissives multiples, `conv_reads`/`telemetry_events` dans la publication Realtime).
- Correction : campagne k6 sur staging (fil, publication, messagerie, Realtime) à 100 / 1 000 / 5 000 clients virtuels ; `(select auth.uid())` dans les policies restantes, fusion des doublons (`Lecture publique`+`Read events`, `Read profiles`, `Read follows`) ; `cron.schedule('purge_telemetry', 30 j)`, `rate_limit_insert` + CHECK de taille sur `telemetry_events`, suppression du heartbeat 20 s, échantillonnage perf/api ; retrait de `conv_reads` et `telemetry_events` de la publication Realtime.
- Effort : 4 à 6 jours (après CH01). Risque : faible (réécriture mécanique des policies, mutation par le banc) ; moyen pour le traçage bout-en-bout qui dépend des lignes de télémétrie.

### CH09 — Pilotage qui alerte hors page, console durcie
- Couvre : PIL-01, PIL-02, PIL-04, EXP-06, PIL-10 (part Sauvegardes/Capacité).
- Correction : sink d'alerte réel (issue GitHub ou e-mail Brevo) avec dédup ; alerte « seam UNAVAILABLE » ; sonde créés vs confirmés (Auth), logs structurés + `telemetry_events` type `edge` dans les 3 Edge Functions ; refus de démarrage sans `DASH_ADMIN_PASSWORD`/`DASH_SESSION_SECRET` forts, `trust proxy` borné, TOTP ; sonde d'uptime externe sur `/` et `/release.json`.
- Effort : 4 à 6 jours. Risque : faible (bruit d'alerte à borner).

### CH10 — Exposition du dépôt, gate, bus factor
- Couvre : EXP-10 (dépôt public : dossier investisseur, finances, 51 Mo de vidéos), **CPL-EXP-01 (P1, trouvé le 08)** : le dossier d'audit lui-même — failles ouvertes, scripts de reproduction, captures, 20 Mo — est sur le dépôt public depuis le 2026-09-04 (PR #280) et ce complément l'y rejoint le 2026-09-08 sur autorisation explicite de Benjamin ; AUTH-01 (gate 2125 : code retrouvé en 2 126 essais / 7 ms, contournable par `sessionStorage`, reproduit le 08), EXP-05 (une seule personne détient tout), CPL-EXP-04 (configuration Auth/SMTP, secrets d'Edge Functions, cron et Netlify sauvegardés nulle part).
- Correction : dépôt privé (ou scission code public / docs privées), retrait des livrables de l'historique si exigé (décision Benjamin), gate retiré ou remplacé par des invitations à usage unique, second propriétaire GitHub/Supabase/Netlify avec 2FA, coffre de secrets et rotation.
- Effort : 1 à 3 jours + décisions administratives. Risque : quotas Actions d'un dépôt privé ; rotation de `SUPABASE_SERVICE_ROLE_KEY` à répercuter.

### CH11 — Première visite et cœur produit (P1 UX)
- Couvre : UXO-01 (mur « Installer » iOS à 1,5 s), UXO-02 (landing par-dessus le fil sans session), UXO-03 (messagerie de démonstration non étiquetée), PRO-01 (~900 passions impubliables, `max-rows` 1000 — confirmé aussi côté service_role par le journal CI ; avec CPL-PRO-02/03 : référentiel jamais attendu ni repeint, erreurs avalées sans `diagLog`), CPL-PRO-01 (aucune contrainte d'unicité sur `profiles.username` en base, 0 doublon aujourd'hui), CONT-02 + ROB-01 + CPL-ROB-03/04 (post jamais retenté, étiquette « Sync… » à vie, envoi lent annoncé « en local » puis jamais confirmé), CONT-04 (`#user-<id>` non routé), CONT-06 (story « publiée » malgré refus), et l'accessibilité des modales (CPL-DEV-01/02/03 : focus jamais déplacé ni restitué, dialogue sans nom, Escape inopérant sur les panneaux plein écran ; DEV-C13 DÉFAILLANT).
- Correction : pas d'overlay automatique sur iOS ; branche « onboardé sans session » ; seeds étiquetés « Exemple » et hors badge ; chargement paginé du référentiel (`.range`) ou `data/passions-v1.json` comme source d'`estPassionCanonique` ; file `passio_post_outbox_v1` ; routeur `#user-` ; verdict serveur avant d'afficher une story.
- Tests : `first-run.spec.js`, `passions-plates.spec.js` (publication d'une passion > 1000ᵉ), `messages-offline`, `suppression-durable`.
- Effort : 4 à 6 jours. Risque : moyen (`boot()` et SW sur UXO-02).

### CH12 — Ce que la CI ne mesure pas
- Couvre : TCI-01 (les 12 tests prod `skipped` du run 2494), TCI-02 (inscription réelle par e-mail et mot de passe oublié sans test), CPL-TCI-A (étape verte sur `fetch failed`), CPL-TCI-B (purge Storage ignorée), TCI-C04 (1 instable connu : `monitoring-file-boot.spec.js:49`).
- Correction : suites confidentialité/suppression/multi-comptes inscrites sans `skip` sur staging (après CH01) ; canari d'inscription nocturne avec boîte jetable ; `mesure-passions.js` et `purge:storage` rendus bloquants (code de sortie) ; stabiliser le test instable.
- Effort : 3 à 5 jours (après CH01). Risque : faible.

### Ordre recommandé et jalons

| Vague | Chantiers | Pourquoi dans cet ordre |
|---|---|---|
| 0 (en cours) | **CH01** | Sans lui, chaque PR de correction écrit en production et la restauration n'a pas de cible. |
| 1 — sécurité immédiate (peut démarrer AVANT la fin de CH01, migrations validées sur le banc jetable) | **CH03 ①** (30 min), **CH02**, **CH03 ②-⑤** | Trois P0 de confidentialité/XSS ; correctifs bornés ; le banc `banc-isolation-role` sert de preuve avant migration. |
| 2 — obligations d'une plateforme | **CH04**, **CH05** | P0 modération + fuites IRL prouvées sous rôle + mineurs. |
| 3 — filet d'exploitation | **CH07**, **CH08**, **CH09** | Exigent le staging (CH01). Ferment « restauration », « capacité », « invisible du Pilotage ». |
| 4 — cadre et surface | **CH06**, **CH10** | Juridique (rédaction externe en parallèle dès la vague 1), dépôt privé (décision Benjamin, peut être fait en une heure à tout moment). |
| 5 — produit et CI | **CH11**, **CH12** | P1 d'expérience et de mesure ; ne conditionnent pas le passage en lancement limité mais le sécurisent. |

Deux correctifs d'une ligne à livrer AVANT toute vague, parce qu'ils ferment des portes ouvertes aujourd'hui : `needs: [governance]` sur le job `test-prod` (CPL-TCI-03) et `escapeHtml(inv.emoji)` (MSG-01 ①).

Effort total (registre) : **≈ 45 à 70 jours-personne**, dont ≈ 12 à 18 pour fermer les huit P0 (CH01, CH02, CH03, CH04, CH07, CH08). Le rapport 12 §4 reste la définition de « lancement limité » : vagues 0 à 3 fermées et re-vérifiées, plus la partie juridique de CH06.

## 5. Ce que Benjamin doit décider (les seules questions ouvertes)

1. **Dépôt privé ou scindé** (CH10) — et réécriture d'historique ou non.
2. **Règle d'âge** pour l'IRL : 18+ pour participer, ou majorité requise seulement pour organiser (CH05).
3. **Télémétrie** : consentement + interrupteur, ou anonymisation stricte sans consentement (CH06).
4. **Gate 2125** : retrait, ou invitations à usage unique (CH10).
5. **Rédaction juridique** : qui rédige CGU/mentions/confidentialité (CH06 ne peut pas se substituer à un professionnel).

Tout le reste est technique et peut être exécuté sur son seul « go », chantier par chantier, par le canal qu'il désignera (le canal nominal force encore Opus : #281 en attente).
