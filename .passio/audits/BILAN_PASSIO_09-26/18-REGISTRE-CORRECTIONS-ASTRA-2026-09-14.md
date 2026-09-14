# Registre des corrections — contre-revue GPT-6 Astra (ouvert le 2026-09-14)

> **À QUOI SERT CE FICHIER.** La contre-revue indépendante du 2026-09-13 (fiche 16, commit
> examiné `30cc8851d1f9486d146bbb6448612557cbc7f4bf`) a rendu un verdict et un plan en dix
> chantiers. Benjamin a autorisé la PRÉPARATION des corrections, sous forme de branches et
> de pull requests, **sans fusion, sans déploiement et sans migration** tant qu'il n'a pas
> donné son accord explicite, PR par PR.
>
> Ce registre consigne, pour chaque identifiant traité : l'état constaté sur le commit de
> départ, la correction, le test effectué, le résultat, la limite restante et la PR. Les
> identifiants historiques (AUTH-, MSG-, SUP-…) et ASTRA-01 à ASTRA-10 sont conservés tels
> quels. Un même correctif peut fermer plusieurs identifiants ; il n'est écrit qu'une fois.
>
> **Les quatre états sont distincts et ne se confondent jamais :**
> `corrigé dans le code` → `testé sur staging` → `déployé` → `vérifié après déploiement`.
> Un état non atteint reste écrit tel quel. « non mesuré » signifie qu'aucune preuve n'existe.

---

## MSG-02 — Injection JavaScript dans les suggestions de @mentions (groupes) — P0

| Champ | Valeur |
|---|---|
| État constaté (base `7fc927ad`, identique à `30cc8851` pour les fichiers concernés) | `_mentionDetect` (`js/app-04-comments-shop.js`) rendait chaque suggestion par une chaîne HTML : `'<div onclick="_pickMention(\'' + String(m.name).replace(/'/g,"\\'") + '\')" …'`. Seule l'apostrophe était échappée. Un guillemet double fermait l'attribut, la suite du pseudo devenait un attribut `onmouseover`. Le pseudo vient de `_groupMemberName` → `userById` → `profiles.username` d'un autre compte (aucune contrainte de caractères). La CSP de production (`_headers`, `netlify.toml`) autorise `script-src 'unsafe-inline'`. **Reproduit** : pseudo `x" onmouseover="window.__pwn()" data-x="`, frappe de `@` dans le composeur d'un groupe, survol réel (`page.hover`) → `__pwn()` exécuté (compteur à 1). Reproduit aussi sur l'artefact assemblé ET minifié (terser + html-minifier-terser + clean-css, comme le job de déploiement). |
| Correction | Rendu DOM : `document.createElement` + `textContent` pour l'initiale et le libellé, écouteur `mousedown` attaché (`preventDefault` pour garder le focus et le curseur du composeur). Aucune interpolation, plus aucun `onclick` inline dans cette boîte. Même patron que `_showMentionBox` (commentaires). Par la même occasion, `_pickMention` remplace par FONCTION (`String.replace` avec une chaîne interprétait `$&`, `$'`, `$$` d'un pseudo et l'insérait déformé). |
| Test effectué | Nouveau verrou `tests/e2e/mention-groupe-xss.spec.js` (5 cas, preuve ACTIVE via `window.__pwn`, survol et clic réels via le composeur de production) : pseudo hostile inerte au survol et affiché comme texte, aucun attribut `on*`/parasite dans la boîte, choix d'un pseudo hostile inséré comme texte, filtre `@ben` et sélection d'un pseudo avec apostrophe + guillemet, pseudo avec `$`, fermeture de la boîte. Joué sur le code de développement ET sur `dist/` minifié. Suites voisines rejouées (xss-notifs-messages, echappement, echappement-ids-reactions, conv-clavier-ouverture, conv-ouverture-fil, conv-suppression, ui-v6a-messages, ui-v6c-proposer-irl, irl-trust-safety, message-media-echec). |
| Résultat | **Avant** (origin/main, dev et minifié) : 4 échecs sur 5 — `__pwn()` exécuté au survol, bouton mort sur un pseudo avec guillemet, pseudo avec `$` déformé. **Après** : 5/5 en dev, 5/5 sur l'artefact minifié. Suites voisines : 70/72 en parallèle, les 2 rouges (`echappement-ids-reactions`, `conv-clavier-ouverture`) repassent 6/6 seules — flakes de charge documentés dans `playwright.config.js`, sans lien avec les mentions. |
| Limite restante | Le pseudo n'est toujours soumis à aucune validation de caractères (client ni base) : c'est une défense en profondeur séparée (P2, à décider — peut refuser des pseudos existants). L'exploitation entre comptes en production n'a pas été rejouée (aucune écriture en base). `npm run verif` : 3 gates rouges en LOCAL sur des fichiers non touchés (`audit-supa-stub`, `generer-ouverture --verifier`, `passions:verifier`) — dus au checkout Windows CRLF ; la CI est verte sur le même commit de base, elle reste la mesure. |
| État | **corrigé dans le code** · testé sur staging : non (aucun staging exercé, tests locaux et artefact minifié seulement) · **déployé** (fusion #374 sur ordre explicite de Benjamin le 2026-09-14, commit `3ae87385`, job « Déploiement production » vert, run 34812848191) · **vérifié après déploiement** : `release.json` servi = `3ae87385`, `app.js?v=e7a495adaa` servi (1 275 359 octets) identique à l'octet à l'artefact minifié sur lequel le verrou a tourné en 5/5 ; l'écouteur `mousedown` y est, l'ancien `onclick` interpolé n'y est plus. Non mesuré : exploitation entre deux comptes réels en production (aucune écriture en base). |
| PR | [#374](https://github.com/PASSIO74/passio-app/pull/374) — fusionnée (squash) le 2026-09-14. |

---

## AUTH-06 — Une file de messages peut traverser un changement de compte — P1 urgent

| Champ | Valeur |
|---|---|
| État constaté (base `3ae87385`) | La file hors-ligne des messages (`passio_outbox_v1`, `js/app-04-comments-shop.js`) ne portait aucun propriétaire (`{ convId, msgId, content, essais }`) et `_sendTextToSupa` reconstruit l'auteur avec `MY_UID` **au moment de l'envoi** ; `_flushOutbox` rejoue la file au démarrage (1,5 s après `supaInit`) et au retour du réseau. La clé n'était **pas** dans `ACCOUNT_SCOPED_KEYS` : la déconnexion purgeait les conversations mais laissait la file — texte d'un message privé de A lisible par le compte suivant. Même défaut sur la file des **commentaires** (`passio_cmt_outbox_v1`, `supaAddComment` écrit `author_id = MY_UID` à l'envoi). La file des **suppressions** portait déjà le compte (`uid`) et filtrait au rejeu. **Reproduit** (banc à faux client, aucune requête) : message de A en file après un 500, `MY_UID` passé à B sans purge, `_flushOutbox()` → un `insert conv_messages` part avec `from_id = B` ; `purgeAccountScopedData()` laisse les deux clés ; `_retryMsg` sous B envoie ; un brouillon de commentaire de A est publié sous B. Livraison réelle en production non mesurée (le serveur l'accepterait dès que B est membre de la conversation : 1:1 A–B, groupe commun). |
| Correction | Patron de la file des suppressions repris : `_fileProprietaire()` = compte RÉEL (`_uidEstUnCompte()`, jamais le `u_<aléatoire>` d'un visiteur) ; `_outboxAdd` stampe `owner`, `_enqueueCommentSync` stampe `uid` ; `_flushOutbox`, `_retryMsg` et `_cmtObFlush` jettent une entrée d'un autre compte **avant** tout compteur et tout envoi (tracé `diagLog`), sans toucher au statut d'un message qui n'est pas dans nos conversations. Entrée d'AVANT le correctif (sans propriétaire) : adoptée si son message/commentaire est encore dans l'appareil (même compte, mise à jour), jetée sinon. `passio_outbox_v1` et `passio_cmt_outbox_v1` ajoutées à `ACCOUNT_SCOPED_KEYS` (purge = première ceinture, filtre au rejeu = seconde, pour les chemins sans purge : `onAuthStateChange`, retour OAuth). `passio_post_delete_outbox_v1` volontairement hors purge (identifiants seulement, compte déjà porté, rattrapage pour les autres comptes). |
| Test effectué | `tests/e2e/file-messages-par-compte.spec.js` (7 cas) : ① rejeu sous B → rien ne part, l'entrée sort ; ② rejeu sous A → part avec `from_id = A` ; ③ la déconnexion purge les deux files ; ④ « réessayer » sous B → rien ne part, message visible en échec ; ⑤ entrée sans propriétaire adoptée si le message est ici (et porte alors `owner`), orpheline jetée ; ⑥ brouillon de commentaire de A non publié par B ; ⑦ même compte → publié. Suites voisines rejouées : message-refus-definitif, conv-reparation-appartenance, message-media-echec, transfert-message, reprise-lectures-boot, audit-identite-emoji, cgu-consentement, exploration-anonyme-vs-compte, connexion-compte-existant, suppression-durable, ecritures-identite-compte, notification-message. |
| Résultat | **Avant** (dev) : 5 échecs / 7 (①③④⑤⑥). **Après** : 7/7 en dev, 7/7 sur l'artefact assemblé + minifié comme en CI. Voisines : 114/120 en parallèle, les 6 rouges sont des timeouts (`page.goto`, `waitForFunction`, `click`) et repassent 68/68 seules — saturation, sans lien avec les files. Gates locales vertes (les 3 gates CRLF restent hors mesure locale, cf. MSG-02). |
| Limite restante | Les entrées **sans propriétaire** créées par une version antérieure et dont la conversation a été purgée sont jetées (leur texte n'est de toute façon plus dans l'appareil). Le contenu d'un message porte encore le persona déclaratif (`sp`) — c'est PRO-02, non traité ici. Livraison réelle inter-comptes en production : non mesurée. Changement de compte **sans purge** (`onAuthStateChange`) : la seconde ceinture le couvre, mais l'état des conversations lui-même n'est pas purgé sur ce chemin — c'est la fiche « L'ÉTAT LOCAL APPARTIENT À UN COMPTE », hors périmètre. |
| État | **corrigé dans le code** · testé sur staging : non · **déployé** (fusion #375 sur ordre explicite le 2026-09-14, commit `82aa48a9`, run 34815138597, job « Déploiement production » vert) · **vérifié après déploiement** : `release.json` servi = `82aa48a9`, `app.js?v=cd2eafd389` servi (1 276 479 octets) porte `passio_outbox_v1` dans la liste de purge et les traces `msg_outbox_autre_compte` / `cmt_outbox_autre_compte`. Non mesuré : rejeu réel entre deux comptes en production. |
| PR | [#375](https://github.com/PASSIO74/passio-app/pull/375) — fusionnée (squash) le 2026-09-14. |

---

## PRO-02 — Identité déclarative encore utilisée dans certaines représentations de messages — P1 (chantier 2)

| Champ | Valeur |
|---|---|
| État constaté (base `82aa48a9`) | `_withSenderMeta` (app-02) attache à chaque `content` un objet `sp` (nom `n`, emoji `e`, couleur `c`, photo `ph`, persona `pid`). À la réception, `applyMsgContentData` (app-04) le faisait **primer** sur la ligne `profiles` de `from_id` (`m.fromName = sp.n`, `m.fromEmoji = sp.e`, `senderProfile = sp` entier) ; en 1:1, `_handleIncomingConvMessage` (app-08) réécrivait `conv.userName`, `userEmoji`, `userColor`, `userPhoto` avec lui, et `supaLoadMyConversations` nommait/photographiait la conversation depuis `lastSp.n`/`lastSp.ph`. `content` est écrit librement par l'émetteur (tout membre). **Reproduit** au banc (profil serveur « Léa » dans le cache, message reçu par le chemin réel `_handleIncomingConvMessage`) : en groupe la ligne d'expéditeur affiche « Benjamin » ; en 1:1 l'en-tête prend « Admin PASSIO » et la photo d'une URL tierce ; un emoji `<img onerror>` est accepté comme `fromEmoji`. |
| Correction | Le NOM et la PHOTO viennent du serveur (`from_id` → `profiles`, via `_fetchProfile`/`cacheRemoteProfile`) ; `sp.n` et `sp.ph` sont **ignorés** partout (parser, en-tête 1:1, chargement des conversations). Le persona ne fournit plus qu'un décor **borné** : emoji court sans caractère HTML (`_reactionKeySure`, même règle que les réactions) et couleur hexadécimale stricte. L'émetteur continue d'envoyer `sp` (compatibilité des anciens clients en cache) ; la réception ne lui fait plus confiance. |
| Test effectué | `tests/e2e/identite-expediteur-serveur.spec.js` (6 cas) : ① groupe — ligne d'expéditeur = nom du profil ; ② 1:1 — l'en-tête ne suit pas la charge ; ③ 1:1 — la photo ne vient jamais de la charge ; ④ décor légitime (emoji, hex) conservé ; ⑤ décor hostile jeté, aucune exécution, aucune balise ; ⑥ à la SOURCE — app-08 ne lit plus `lastSp?.n`, `lastSp?.ph`, `senderProfile.n`, `senderProfile.ph`. Voisines rejouées : audit-identite-emoji, notification-message, conv-ouverture-fil, ui-v6a-messages, xss-notifs-messages, transfert-message, message-media-echec, file-messages-par-compte, mention-groupe-xss, conv-suppression. |
| Résultat | **Avant** (main pristine, export `git archive`) : 5 échecs / 6 (①②③⑤⑥). **Après** : 6/6 en dev, 6/6 sur l'artefact assemblé + minifié. Voisines : 64/64. Gates locales vertes. |
| Limite restante | L'identité de l'**émetteur** reste `from_id`, posé par le client mais garanti par la RLS d'insertion (`from_id = auth.uid()`) — non re-mesuré ici. Le persona `pid` n'est plus conservé côté réception (aucun consommateur trouvé). Les **appels** (invitation `fromName` déclarative, résidu MSG-01) et les **lives** (`from` déclaratif) ne sont pas couverts : c'est MSG-01/SUP-06, point suivant. Non mesuré : rendu sur un appareil réel avec deux comptes réels. |
| État | **corrigé dans le code** · testé sur staging : non · **déployé** (fusion #376 automatique après CI verte — règle donnée par Benjamin le 2026-09-14 : « fusionne les autres automatiquement » — commit `6b004138`, run 34816178233) · vérifié après déploiement : à compléter au run suivant |
| PR | [#376](https://github.com/PASSIO74/passio-app/pull/376) — fusionnée (squash) le 2026-09-14. |

---

## MSG-01 / SUP-06 — Règles d'appels trop larges pour des tiers authentifiés ; identité d'appelant déclarative — P1 (chantier 2)

| Champ | Valeur |
|---|---|
| État constaté (base `6b004138`) | Policy Realtime `passio_rt_recevoir` (migration d'ouverture du 2026-09-11, appliquée en prod) : `ring:<uid>` lisible par **tout compte non bloqué** — un tiers connecté observe qui appelle qui (callId, kind, from). Cause côté client : `startCall` **s'abonnait** à `ring:<pair>` pour y émettre, et Realtime refuse un abonnement privé sans droit de lecture — la migration d'ouverture l'écrit elle-même (« resserrer exige d'abord un client qui émet SANS s'abonner — lot suivant »). Et l'écran d'appel entrant affichait `payload.name` / `payload.emoji` (écrits par l'émetteur) : n'importe quel compte faisait sonner sous un autre nom. **Reproduit** au banc (faux `supa.channel`) : `startCall` appelle `ring.subscribe` (1) et rien ne part en REST ; une invitation `{ from: Léa, name: "Benjamin" }` affiche « Benjamin ». |
| Correction | **Client** : l'invitation part par `httpSend` (REST broadcast, jeton joint, gouverné par la policy d'ÉMISSION seule), répétée toutes les 2 s comme avant, **sans abonnement** à `ring:<pair>` (`_callEmettreInvitation`) ; l'identité affichée et retenue à l'acceptation est celle du **profil serveur de `from`** (`_callIdentiteServeur` + `_fetchProfile`), `payload.name`/`emoji` ignorés ; un `from` qui n'est pas un uuid n'est pas une invitation. **Serveur** : `migrations/migration_appels_sonnerie_privee_2026-09-14.sql` — `ring:<uid>` lisible uniquement par `<uid>`, reste de la policy à l'identique, émission inchangée, verdict 4 lignes, rejouable. Banc `tests/sql/migration-appels-sonnerie-privee.test.sh` (20 contrôles : défaut mesuré AVANT, application, rejeu, réception/émission dans les deux sens, mutation → banc ET verdict rouges), branché dans `deploy.yml`. |
| Test effectué | `tests/e2e/appels-sonnerie-privee.spec.js` (5 cas) : ① aucun abonnement à `ring:<pair>`, invitation en `httpSend` avec `from = MY_UID` ; ② écran entrant = profil de `from` ; ③ `from` non-uuid ignoré ; ④ « Répondre » retient le profil ; ⑤ à la source (plus de `ring.subscribe` dans `startCall`, migration restrictive, banc branché). `ouverture-publique.spec.js` réécrit sur 3 cas qui EXIGEAIENT l'identité déclarative (charge vs profil, rafale avec un `from` uuid, assertion source). |
| Résultat | **Avant** (main pristine) : 5 échecs / 5. **Après** : 5/5 en dev, 5/5 sur l'artefact minifié ; `ouverture-publique` 35/35 ; gates locales vertes. Banc SQL : **non exécuté localement** (aucun PostgreSQL sur ce poste) — la CI de la PR est la mesure. |
| Limite restante | **La migration n'est PAS appliquée** : elle attend le coller de Benjamin (canal ③), **après** le déploiement de ce client — collée avant, elle couperait les appels sortants des clients encore en cache. `call:<id>` reste lisible par tout compte (uuid aléatoire connu des deux parties) ; `from` dans la charge utile n'est pas lié au jeton — lier l'un et l'autre demande une table d'appels (autre lot). Le push `notify-call` compose encore son texte avec `fromName` déclaratif : c'est MSG-04, point suivant. Non mesuré : appel réel entre deux comptes en production, comportement de `httpSend` sur le projet réel (REST broadcast sur canal privé). |
| État | **corrigé dans le code** (client) · **fusionné #377** le 2026-09-14 après la contre-revue de Benjamin (gate « Gouvernance critique » verte sur `1e843571`), commit `1dac720d` · **déployé** : run 34823009969 vert · **vérifié après déploiement** : `release.json` servi = `1dac720d`, `app.js?v=0b740daf5a` (1 281 049 octets) porte `httpSend` et plus aucun abonnement `ring(send)` · **migration APPLIQUÉE** par Benjamin (SQL Editor) et **mesurée** en base : `passio_rt_recevoir` restreint `ring:` à `auth.uid()`, `realtime:db` / `conv_specific:` intacts, `passio_rt_emettre` inchangée · ⚠️ collée ~20 min AVANT que le client soit servi : fenêtre transitoire où un client en cache ne pouvait pas passer d'appel sortant, refermée au rechargement · appel réel entre deux comptes : non mesuré |
| PR | [#377](https://github.com/PASSIO74/passio-app/pull/377) — fusionnée (squash) le 2026-09-14. |

---

## Points restants (ordre du plan, fiche 16 et rapport du 2026-09-13)

Aucun n'est engagé au 2026-09-14. Ils seront ajoutés ici au fur et à mesure, un chantier par PR.

| Ordre | Chantier | Identifiants | État |
|---|---|---|---|
| 2 | Séparer les comptes et sécuriser les échanges | AUTH-06 (#375), PRO-02 (#376), MSG-01/SUP-06 (#377 + migration appliquée), MOD-04, MSG-04, MSG-10 (#378) | **fait** — tout déployé ; résidus écrits dans chaque fiche |
| 3 | Fiabiliser suppression et médias | AUTH-05, SUP-10, MSG-03, ASTRA-01 (#379, fonction déployée et éprouvée) ; CONT-11, SUP-01 | en cours — CONT-11/SUP-01 = décision produit (« profil privé ») puis migration |
| 4 | Inscription et information cohérentes | AUTH-02/03/04/09/10, EXP-08/09/14/15, UXO-07, ASTRA-09 | non engagé |
| 5 | Éprouver la modération | MOD-01/02/03/09, AUTH-11, ASTRA-03 | non engagé |
| 6 | Isoler les essais, prouver une restauration | SUP-04, NET-07, EXP-01/03/04/11, TCI-03/04/15/16, ASTRA-07 | non engagé |
| 7 | Borner Sentinelle et les protections anti-abus | PIL-01/02/03/04/10, EXP-06/12, CONT-08, MOD-06/07, SUP-07, ASTRA-02/05/06/08 | non engagé |
| 8 | Supprimer les faux succès et divergences | CONT-02/06, MSG-06, IRL-04 à 13, ROB-01 à 06, PRO-04/05, ASTRA-10 | non engagé |
| 9 | Mesurer la capacité puis fixer les limites | PERF-01 à 06, PRO-01/03/06, ASTRA-04 | non engagé |
| 10 | Compléter les parcours et preuves de qualité | DEV-01 à 05, UXO-01/02/03, TCI-01/02/05 à 14 | non engagé |

---

## MOD-04 — Le blocage est annoncé localement malgré un échec serveur — P1 (chantier 2)

| Champ | Valeur |
|---|---|
| État constaté (base `6b004138`) | `blockUser` (app-04) posait l'id dans `state.user.blocked`, appelait `supaBlockUser` **sans attendre ni lire son verdict** (la fonction ne rendait rien), puis affichait « 🚫 X bloqué ». Un refus RLS, une coupure, une session expirée laissaient un blocage purement local — l'autre continuait d'écrire, de commenter, d'appeler — et l'état local survivait à la réhydratation. `unblockUser` : idem. **Reproduit** au banc (faux client, INSERT `blocks` en 42501) : `blockUser` rend `undefined`, l'id reste dans `blocked`, le toast dit « bloqué ». |
| Correction | `supaBlockUser` rend un **verdict** (`true` si la ligne est écrite ou déjà là — 23505 —, `false` sinon, exception comprise). `blockUser` / `unblockUser` restent optimistes à l'écran puis **attendent** le verdict : un échec **annule** l'affichage (blocked ET following rendus), le dit (« ⚠️ Blocage non enregistré — réessaie »), trace `diagLog`. Sans compte réel (`_uidEstUnCompte()` faux, SDK absent), l'action reste locale et le dit (« bloqué sur cet appareil »), sans écriture sous une identité qui n'existe pas. |
| Test effectué | `tests/e2e/blocage-verdict.spec.js` (5 cas) : ① refus → annulé, dit, rien persisté, abonnement rendu ; ② succès → bloqué, désabonné, annoncé ; ③ doublon = succès ; ④ déblocage refusé → reste bloqué, puis accepté ; ⑤ sans compte réel → local, dit, zéro écriture. Voisines : `parcours-suivre`, `ouverture-publique` (42/42). |
| Résultat | **Avant** (main pristine) : 5 échecs / 5. **Après** : 5/5 en dev, 5/5 sur l'artefact minifié. |
| Limite restante | Le blocage dans les **groupes communs** (MSG-10) reste incomplet : la personne bloquée reste membre du groupe, c'est le retrait par l'organisateur qui l'exclut — non traité ici. La cohérence blocage ↔ abonnements côté serveur (retrait de l'abonné, `follows` DELETE) est un complément dont l'échec ne défait pas un blocage écrit — tracé, non bloquant. Non mesuré : parcours réel entre deux comptes. |
| État | **corrigé dans le code** · testé sur staging : non · **déployé** (fusion automatique #378 après CI verte, commit `00f7eec6`) · **vérifié après déploiement** : `release.json` servi = `00f7eec6`, `app.js?v=5946403cc7` (1 277 794 octets) porte « Blocage non enregistré » et la trace `blocage KO`. |
| PR | [#378](https://github.com/PASSIO74/passio-app/pull/378) — fusionnée (squash) le 2026-09-14. |

---

## MSG-04 — Origine métier et destinataire d'une push insuffisamment liés — P1 (chantier 2)

| Champ | Valeur |
|---|---|
| État constaté (base `6b004138`) | Edge Function `notify-call` : appelant authentifié (jeton), plafond (20/min, 200/h), blocage dans les deux sens — mais **aucun lien exigé** entre l'émetteur et le destinataire : tout compte connecté réveillait n'importe quel membre (`toUserId` libre), avec un texte libre (`text`, jusqu'à 200 caractères) et sous un nom libre (`fromName`) — pour un appel comme pour une « notification ». Le résidu était écrit dans CLAUDE.md (« fromName/text restent déclaratifs »). |
| Correction | `supabase/functions/_shared/lien-metier.js` (en `.js`, importé tel quel par Deno et par `node --test`) : **appel** → une conversation 1:1 commune est exigée (`conv_members` × `conversations.is_group = false`) ; **notification** → une ligne `notifications` de l'émetteur vers le destinataire, écrite dans les **2 dernières minutes** (donc acceptée par la RLS `from_id = auth.uid()` + `not is_blocked_with` + `trg_rate_limit`, ou par le trigger `follows_notifier`) — et c'est le **texte de cette ligne** qui part (entités décodées), jamais celui du corps ; **identité** → nom et emoji lus dans `profiles`. `fromName`, `fromEmoji`, `text` du corps sont ignorés (acceptés pour les anciens clients). Lien absent ou lecture en erreur → même réponse qu'un blocage (« aucun appareil abonné »), fail-closed. |
| Test effectué | `tests/unit/lien-metier.test.mjs` (7 cas, faux client scripté) : 1:1 commune ok / groupe seul, sans conversation, tiers refusés / ligne récente ok avec SON texte décodé / ligne ancienne, d'un autre, vers un autre refusées / identité bornée et repli / erreur de lecture = refus / décodage des cinq entités. Branché dans `npm run verif` (donc en CI). |
| Résultat | **7/7**. Le comportement de bout en bout de la fonction (Deno, web-push) n'est **pas** exécuté localement : le module de décision l'est, et il est celui qui sera déployé. |
| Limite restante | **La fonction n'est PAS déployée** (`supabase functions deploy notify-call`, geste manuel — la CI ne déploie pas les Edge Functions). Tant qu'elle ne l'est pas, la production garde l'ancien comportement. Après déploiement, mesurer : un appel réel sonne (1:1 existante), une notification de message pousse, une push forgée vers un tiers rend `sent: 0`. La fenêtre de 2 minutes suppose que la ligne `notifications` précède la push — c'est l'ordre des trois appelants (`supaInsertNotif`, `_notifierMessage`, `follows_notifier` + `_pousserPushNotif`) ; un appelant qui pousserait AVANT d'écrire perdrait sa push. Non mesuré : latence réelle des deux lectures ajoutées. |
| État | **corrigé dans le code** (fusionné #378, `00f7eec6`) · **déployé** : `supabase functions deploy notify-call` lancé par Claude Code sur ordre de Benjamin (« déploie les fonctions »), version 7 ACTIVE le 2026-09-14 08:30 UTC · **vérifié après déploiement** : sans jeton → 401 ; avec un compte jetable `@passio-e2e.test` et une cible sans aucun lien : `type: call` → `{ ok: true, sent: 0, note: "aucun appareil abonné" }`, `type: notif` sans ligne `notifications` → même réponse, `fromName` du corps ignoré. Non mesuré : une push réellement délivrée entre deux comptes liés. |
| PR | [#378](https://github.com/PASSIO74/passio-app/pull/378) — fusionnée (squash) le 2026-09-14. |

---

## MSG-10 — Blocage incomplet dans les groupes communs — P1 (chantier 2)

| Champ | Valeur |
|---|---|
| État constaté (base `6b004138`) | Le blocage ne s'appliquait aux messages qu'à la **réception temps réel** (`_handleIncomingConvMessage` ignore un expéditeur bloqué). L'historique rechargé (`supaLoadMessages`) et le fil rendu (`renderConvFpThread`) montraient tout ce qu'un membre bloqué avait écrit dans un groupe commun ; l'aperçu de la liste Messages reprenait son dernier message ; « @ » le proposait encore. La partie « dépendant de sa persistance serveur » est fermée par MOD-04 (verdict attendu). **Reproduit** au banc : fil, aperçu et boîte de mentions montrent le membre bloqué. |
| Correction | Un seul prédicat `_msgVisiblePourMoi(m)` (app-04) — visible sauf si `m.from` est un compte que **j'ai** bloqué (mes messages et les messages système restent) — appliqué au fil, à l'aperçu de la liste et aux suggestions de @mentions (membres filtrés). **Filtre à l'affichage, rien n'est supprimé** : débloquer rend tout. Côté serveur, rien ne change : la personne reste membre du groupe (c'est l'organisateur qui l'exclut), et la policy d'insertion ne borne le blocage qu'aux 1:1 (décision de l'ouverture publique). |
| Test effectué | `tests/e2e/blocage-groupe-commun.spec.js` (4 cas) : ① fil sans les messages du bloqué, les autres gardés, 4 messages toujours en mémoire ; ② aperçu de la liste sans son dernier mot ; ③ « @ » ne le propose plus ; ④ débloquer rend tout. Voisines : mention-groupe-xss, ui-v6a-messages, conv-ouverture-fil, blocage-verdict (29/29). |
| Résultat | **Avant** (main pristine) : 3 échecs / 4 (①②③). **Après** : 4/4. |
| Limite restante | Le bloqué **voit** toujours ce que le bloqueur écrit dans le groupe (le blocage est asymétrique à l'affichage, comme sur les réseaux comparables ; l'exclusion du groupe relève de l'organisateur). Les réactions et accusés de lecture d'un membre bloqué ne sont pas filtrés. Non mesuré : parcours réel entre deux comptes. |
| État | **corrigé dans le code** · testé sur staging : non · **déployé** (#378, `00f7eec6`) · vérifié après déploiement : artefact servi = `00f7eec6` (marqueurs MOD-04 présents ; le filtre MSG-10 est du même commit, non relu à part) |
| PR | [#378](https://github.com/PASSIO74/passio-app/pull/378) — fusionnée (squash) le 2026-09-14. |


---

## AUTH-05 / SUP-10 — La suppression de compte annonce un succès malgré des échecs — P1 (chantier 3)

| Champ | Valeur |
|---|---|
| État constaté (base `00f7eec6`) | Edge Function `delete-account` : quinze `delete()` « best-effort » **sans lire `{ error }`** (le SDK ne lève pas), trois dossiers du seau `content` purgés sur huit (ni avatars, ni covers, ni events, ni passion_*), **aucune** pièce jointe de messagerie (`attachments/<conv>/…`, dont le nom ne porte pas l'auteur), dix-sept tables oubliées (`user_state`, `blocks`, `conv_reads`, `comment_interactions`, `comment_likes`, `event_comments`, `event_reactions`, `user_safety`, `user_passions`, `passion_quotas`, `passion_requests`, `step_interactions`, `video_lives`, `post_collaborators`, `analytics_events`, `telemetry_events`, `notifications.from_id`), puis `deleteUser` et `ok: true` quoi qu'il arrive. Client `doDeleteAccount` (app-02) : appel dans un `try {} catch {}` muet, puis déconnexion, purge locale et « Compte supprimé. Au revoir » — sans réseau ou sur une erreur aussi. Liste des tables **mesurée** en base (canal ①, `information_schema`) le 2026-09-14. |
| Correction | `supabase/functions/_shared/purge-compte.js` (en `.js`, importé par Deno et par `node --test`) : relève les pièces jointes des messages du compte **avant** de les supprimer (deux formes d'URL), supprime **35 couples table/colonne** en lisant chaque verdict, purge les **8 dossiers** de `content` et les pièces jointes relevées, puis **relit** chaque table (compte exact) ; rend `{ ok, echecs, restes }`. `delete-account` ne supprime le compte Auth que si `ok` ; sinon **409** avec la liste — le compte reste ouvert, la suppression est **relançable** (gestes idempotents). Client : lit le verdict ; sans `ok: true`, rien n'est annoncé, rien n'est purgé, la session reste, message « ton compte n'a PAS été supprimé, réessaie ou écris à … ». Hors liste, délibérément : `reports` (trace de modération d'un tiers), `passions.created_by`, `conversations.created_by`, `events.organizer_id` (objets partagés ; identifiant orphelin). |
| Test effectué | `tests/unit/purge-compte.test.mjs` (7 cas, faux client en mémoire, dans `npm run verif`) : tout part et rien d'autre ; delete en erreur = échec nommé ; delete « réussi » qui ne retire rien = reste nommé ; pièces jointes relevées sans doublon ; seau illisible = échec, dossier vide ≠ échec ; relecture illisible = reste ; couverture du schéma. `tests/e2e/suppression-compte-verdict.spec.js` (3 cas) : 409 → rien annoncé, rien purgé, pas de déconnexion ; fonction injoignable → idem ; verdict positif → tout. |
| Résultat | Unitaires **7/7**. E2E : **avant** (main pristine) 3 échecs / 3 ; **après** 3/3 en dev, 3/3 sur l'artefact minifié. |
| Limite restante | **La fonction n'est PAS déployée** (`supabase functions deploy delete-account`, geste manuel). Exercice réel d'une suppression de bout en bout : **non mesuré** (aucun compte réel supprimé ; la suite `suppression-compte.spec.js` à comptes réels est opt-in `PASSIO_E2E_MULTI`). Les FK réelles entre tables ne sont pas modélisées au banc : un refus FK en prod apparaîtrait comme un échec nommé (c'est le but), jamais comme un succès. La purge de `telemetry_events` / `analytics_events` par `user_id` peut être lente sans index (non mesuré). Question juridique ouverte : conserver ou anonymiser `reports.reporter_id`. |
| État | **corrigé dans le code** · **fusionné #379** (`9ddbd646`) · **déployé** : `supabase functions deploy delete-account` lancé par Claude Code sur ordre de Benjamin, version 6 ACTIVE le 2026-09-14 08:30 UTC · **vérifié après déploiement — exercice RÉEL** : un compte jetable `@passio-e2e.test` créé (service_role), doté d'une ligne `profiles`, puis `delete-account` avec son jeton → `200 { ok: true, piecesJointes: 0 }` ; relecture : compte Auth **absent (404)**, ligne `profiles` **absente**. Le chemin 409 (purge incomplète) n'a pas été provoqué en production. |
| PR | [#379](https://github.com/PASSIO74/passio-app/pull/379) — fusionnée (squash) le 2026-09-14. |

---

## MSG-03 (purge) / ASTRA-01 — Pièces jointes : jamais purgées, transférées sous le mauvais dossier — P1 (chantier 3)

| Champ | Valeur |
|---|---|
| État constaté (base `00f7eec6`) | `_deleteMsgForAll` (app-04) supprimait la ligne `conv_messages` et diffusait la pierre tombale, **jamais l'objet Storage** : photo, vidéo, fichier restaient lisibles par tout membre (URL signée) pour toujours. La policy DELETE du seau (`owner = auth.uid()`, mesurée) le permettait pourtant à l'auteur. `_forwardTo` réutilisait l'URL d'origine `attachments/<conv source>/…` ; le seau est privé et la lecture exige `is_conv_member(dossier du chemin)` : le destinataire du transfert, non membre de la source, ne pouvait ni signer ni lire. **Reproduit** au banc : aucun `remove` à la suppression ; le message transféré porte l'URL de `conv_src`. |
| Correction | `_purgerPieceJointeDe(m)` à la suppression pour tous (verdict lu, tracé ; un refus n'annule pas la suppression du message). `_forwardTo` **copie** l'objet dans `attachments/<conv cible>/<horodatage>_<nom>` (`storage.copy` : SELECT sur la source, INSERT sur la cible, le transféreur est membre des deux), le message porte l'URL de la copie ; **copie refusée = transfert refusé et dit** — jamais un message livré avec un média que personne ne peut ouvrir. Le texte ne copie rien. |
| Test effectué | `tests/e2e/pieces-jointes-cycle.spec.js` (4 cas) : ① remove sous le chemin exact ; ② copie vers le dossier cible, message avec l'URL de la copie ; ③ copie refusée → rien inséré, dit ; ④ texte → aucune copie. Voisines : `transfert-message`, `conv-suppression` (9/9). |
| Résultat | **Avant** (main pristine) : 3 échecs / 4 (①②③). **Après** : 4/4 en dev, 4/4 sur l'artefact minifié. |
| Limite restante | Un message média supprimé « pour moi » seulement garde son objet (voulu : il existe encore pour l'autre). Les objets déjà orphelins (suppressions passées, comptes supprimés avant ce lot) ne sont pas rattrapés — un balayage `storage.objects` sans ligne `conv_messages` serait un autre lot. Un vocal (`voiceData`) n'est pas transférable (chemin existant : il redevient texte). Non mesuré : `storage.copy` sur le projet réel avec la policy `storage_chemin_autorise`. |
| État | **corrigé dans le code** · **fusionné #379** (`9ddbd646`), déployé avec le run suivant de `main` · vérifié après déploiement : non (artefact non relu à part) |
| PR | [#379](https://github.com/PASSIO74/passio-app/pull/379) — fusionnée (squash) le 2026-09-14. |


---

## AUTH-03 — Accord enregistré sans case cochée par le chemin Google « connexion » — P1 (chantier 4)

| Champ | Valeur |
|---|---|
| État constaté (base `00f7eec6`) | `onbGoogleAuth` (app-02) mémorisait `passio_oauth_cgu` (accord horodaté) **dans les deux modes** ; la case n'est à l'écran qu'en inscription, le bouton Google est unique et jamais masqué en connexion. Google crée le compte s'il n'existe pas : depuis l'écran de connexion, un compte NEUF naissait et `_poserConsentementOAuth` posait sur lui, au retour, un consentement que personne n'avait donné (`user_metadata.cgu_accepted_at`). **Reproduit** au banc : en mode connexion, `passio_oauth_cgu` porte un accord horodaté après `onbGoogleAuth`. |
| Correction | En connexion, rien n'est mémorisé (une trace ancienne est même effacée) ; en inscription, l'accord n'est mémorisé qu'avec la case cochée (inchangé). Au retour sans accord, `_verifierConsentementApresOAuth` lit le compte : **aucune trace serveur ET compte créé il y a moins de 15 min** → rappel posé sur l'appareil et **modale « Avant de continuer »** (case + liens vers les textes, « J'accepte et je continue » / « Refuser et me déconnecter ») ; elle réapparaît tant qu'aucune réponse n'est donnée ; accepter écrit la trace (`updateUser`, verdict lu) et l'état local ; refuser déconnecte. Un compte ancien sans trace n'est pas sollicité ici (autre lot, EXP-09). |
| Test effectué | `tests/e2e/consentement-google.spec.js` (5 cas) : ① connexion → rien ; inscription cochée → mémorisé ; ② retour sans accord, compte neuf sans trace → modale, rien écrit ; ③ compte ancien / compte déjà tracé → pas sollicité ; ④ accepter sans case → rien ; avec case → trace écrite, rappel levé, modale fermée ; ⑤ UXO-07 (ci-dessous). Voisines : `cgu-consentement`, `admission-18-plus` (39/39). |
| Résultat | **Avant** (main pristine) : 4 échecs / 5 (①②④⑤). **Après** : 5/5. |
| Limite restante | Le parcours Google **réel** (départ, retour, création de compte par Google) n'est pas rejoué : banc à faux `supa.auth`. Les comptes créés par Google avant ce lot depuis l'écran de connexion portent un `cgu_accepted_at` fabriqué — non re-mesuré, non corrigé (une trace ne se retire pas sans décision). Un refus déconnecte mais ne supprime pas le compte que Google vient de créer. |
| État | **corrigé dans le code** · **fusionné #380** (fusion automatique après CI verte, commit `9bd45125`) · déploiement production : à relever · vérifié après déploiement : non |
| PR | [#380](https://github.com/PASSIO74/passio-app/pull/380) — fusionnée (squash) le 2026-09-14. |

---

## UXO-07 — Fausse promesse de contrôle d'âge IA dans le HTML — P2 (chantier 4)

| Champ | Valeur |
|---|---|
| État constaté | `index.html`, étape « Vérification d'âge » de l'onboarding : « PASSIO protège les mineurs avec un contrôle d'âge IA. » Aucun contrôle de ce genre n'existe (l'âge est déclaratif — CLAUDE.md « réservé aux majeurs », `onbValidateAge`). Une promesse de sécurité fausse, sur l'écran même qui recueille l'âge. |
| Correction | Texte remplacé : « PASSIO est réservé aux personnes majeures. Ton année de naissance est déclarative : elle n'est vérifiée par aucun contrôle automatique. » Note d'audit en commentaire HTML. |
| Test effectué | `consentement-google.spec.js` ⑤ : le HTML (hors commentaires) ne contient plus « contrôle d'âge IA » et dit que l'année est déclarative. |
| Résultat | Avant : rouge. Après : vert. |
| Limite restante | Visibilité de cette étape dans le parcours nominal (« Confirm email » peut la sauter) : non re-mesurée. |
| État | **corrigé dans le code** · **fusionné #380** (`9bd45125`) · déployé : à relever · vérifié après déploiement : non |
| PR | [#380](https://github.com/PASSIO74/passio-app/pull/380) — fusionnée (squash) le 2026-09-14. |


---

## ASTRA-09 / EXP-09 — Identité du responsable de traitement à la collecte — P1 (chantier 4) — **décidé « a », fait**

| Champ | Valeur |
|---|---|
| État constaté | `js/legal-textes.js`, régime `particulier` : le §1 de la politique promettait l'identité du responsable « à toute personne qui exerce ses droits » — donc après la collecte ; l'écran d'inscription ne la donnait pas. L'art. 13 RGPD exige l'information **au moment de la collecte** ; l'anonymat de l'éditeur non professionnel (LCEN art. 1-1, II) vaut pour les mentions légales, pas pour cette obligation (contre-revue du 2026-09-13, CNIL). |
| Décision (Benjamin, 2026-09-14) | **« a »** : se nommer dans la politique et à l'inscription ; les mentions légales gardent l'anonymat LCEN. Nom fourni par Benjamin : *Benjamin Ladame*, contact passioadmin@gmail.com. |
| Correction | `PASSIO_EDITEUR.responsable = { nom, contact }` (source unique) ; `passioNomResponsable()` rend « [à compléter] » EN CLAIR si le nom manque (même règle que le régime `societe`) ; §1 réécrit : « Le responsable du traitement est Benjamin Ladame, personne physique éditant PASSIO à titre non professionnel, joignable à … Cette identité t'est donnée dès l'inscription » ; ligne `#authResponsable` sur l'écran d'inscription, remplie par `switchAuthTab` depuis `passioLigneResponsable()`, en mode inscription seulement. Version de la politique → `2026-09-14`. |
| Test effectué | `tests/e2e/responsable-traitement.spec.js` (4 cas) : ① §1 nomme le responsable, ne promet plus « à l'exercice des droits », un nom vide s'afficherait « [à compléter] » ; ② ligne d'inscription présente en mode inscription seulement, texte identique à `legal-textes.js` ; ③ cohérence politique ↔ réglage « Compte privé » ; ④ la version suit le texte. `cgu-consentement` (assertion §1 réécrite), `ouverture-publique` ⑧ (version), `access-gate`, `dist-build`, `confirmation-email` : 81/81. |
| Résultat | Avant : rouge sur ① ② ④. Après : 4/4 ; voisines 81/81. |
| Limite restante | Qualification juridique globale (droit de la consommation, DSA) hors périmètre du code — à faire relire. Les comptes créés avant ce texte n'ont pas reçu l'information à leur inscription : la politique versionnée les couvre à la prochaine lecture, pas rétroactivement. |
| État | **corrigé dans le code** · déployé : non · vérifié après déploiement : non |
| PR | `claude/astra-09-responsable-et-profil-prive` — voir la PR ouverte depuis cette branche. |


---

## CONT-11 / SUP-01 — Couvertures d'un profil privé publiques ; ce que « profil privé » protège — P1 (chantier 3) — **DÉCIDÉ « 2 », écrit**

| Champ | Valeur |
|---|---|
| État constaté | Policy `passio_content_read` du seau `content` : `SELECT` pour `public` sur tout le seau (mesurée en base). Avatars, couvertures, et les fichiers image/vidéo des publications — profil privé compris — sont lisibles par lien direct et listables sans compte. Ni la politique ni le réglage « Compte privé » ne le disaient (le réglage citait pseudo, avatar, passions ; pas la couverture, pas l'hébergement des fichiers). |
| Décision (Benjamin, 2026-09-14) | **« 2 »** : le privé protège les publications et stories **dans l'application** ; l'hébergement des fichiers reste public. On l'écrit, on ne le cache pas. |
| Correction | Politique §2 ter « Ce qu'un compte privé protège — et ce qu'il ne protège pas » ; réglage « Compte privé » : « ta photo de couverture » ajoutée, et « les fichiers image et vidéo restent ouvrables par lien direct ». Version de la politique → `2026-09-14`. Aucune migration. |
| Test effectué | `tests/e2e/responsable-traitement.spec.js` ③ ④ ; suites `cgu-consentement`, `ouverture-publique` (⑧ réécrit : la version suit), `access-gate`, `dist-build`, `confirmation-email` — 81/81. |
| Limite restante | La limite technique demeure : un lien direct ouvre un fichier de publication privée. La fermer (seau `content` privé + URL signées) est un lot distinct, à décider si le mot « privé » doit un jour couvrir l'hébergement. |
| État | **corrigé dans le code** (textes) · déployé : non · vérifié après déploiement : non |
| PR | `claude/astra-09-responsable-et-profil-prive` — voir la PR ouverte depuis cette branche. |


---

## ASTRA-03 — La commande de modération prend les 500 derniers signalements, puis filtre les ouverts — P1 (chantier 5/7)

| Champ | Valeur |
|---|---|
| État constaté | `scripts/moderation.js` : `reports?…&order=created_at.desc&limit=500` puis `filter(estOuvert)` en mémoire. Dès 501 lignes en base, les signalements ouverts les plus **anciens** — ceux qui attendent depuis le plus longtemps — sortent de la fenêtre et disparaissent de la liste, sans un mot. (Seuil non atteint en production aujourd'hui : 2 signalements.) |
| Correction | Filtre **serveur** (`status=eq.open`, sauf `--tous`) et lecture **paginée** (`scripts/lib/pagination-rest.js`, 500 par page, jusqu'à 20 pages) ; une lecture bornée est **dite** (« liste TRONQUÉE aux 10 000 plus récents »). La sonde de présence de la colonne `status` est conservée (base sans la migration du 2026-09-11 → tout est ouvert). |
| Test effectué | `tests/unit/pagination-rest.test.mjs` (5 cas : page pleine → suivante, 1 201 lignes = 3 pages, borne dite, vide, page exactement pleine), dans `npm run verif`. Le script lui-même n'est pas exécuté contre la base (il écrit) — la construction d'URL est lue. |
| Résultat | 5/5. |
| Limite restante | Non mesuré sur une base de plus de 500 signalements. Le journal local « vu » (`lireVus`) reste sur l'appareil de l'opérateur. |
| État | **corrigé dans le code** · **fusionné #382** (`920614b2`), outil local : effectif à sa prochaine exécution |
| PR | [#382](https://github.com/PASSIO74/passio-app/pull/382) — fusionnée (squash) le 2026-09-14. |

---

## ASTRA-06 — Des erreurs API anonymes peuvent sélectionner une enquête automatique — P1 (chantier 7) — **partiel**

| Champ | Valeur |
|---|---|
| État constaté | `scripts/sentinelle-detecter.mjs`, famille API : `lireApi` lit `telemetry_events` (écriture **anonyme** admise, `user_id` écrit par le client) et `classerApi` retenait une cause dès 5 occurrences, compte ou non. Cinq lignes fictives sans compte désignaient la cible d'une enquête dont la PR est fusionnée automatiquement. La famille JS, elle, exige `auth_uid` (colonne posée par le serveur sur `client_errors`) ; `telemetry_events` n'a **pas** cette colonne (mesuré : `user_id` seulement). |
| Correction (partielle) | `estSansCompte(ligne)` : une ligne dont `user_id` n'est pas un uuid est **écartée** de la famille API (comptée dans `ecartees`). Le seuil « 5 occurrences ou 2 comptes » ne s'applique plus qu'à des lignes portant un compte. |
| Test effectué | `tests/unit/sentinelle-detecter.test.mjs` : cas « ASTRA-06 » (50 lignes anonymes → aucune cible, RÉINJECTION ; deux comptes → une cause) ; les cas existants réécrits avec des uuid (« u1 » n'est pas une personne). 38/38. |
| Résultat | 38/38. |
| Limite restante | **Résidu écrit** : un client hostile peut recopier des uuid publics (`profiles` est lisible) — la fermeture complète est une colonne `auth_uid` posée par le serveur sur `telemetry_events`, comme `client_errors` (migration → lot « périmètre critique », gate de gouvernance). Le seuil de 5 occurrences sur un seul compte reste ouvrable par ce même compte. |
| État | **corrigé dans le code** (écart des lignes sans compte, #382 `920614b2`) · **fermé côté serveur** : `telemetry_events.auth_uid` + trigger `trg_telemetry_identite` (#383 `89f8851a`), **migration APPLIQUÉE** par Benjamin et **mesurée** en base le 2026-09-14 (colonne présente, trigger posé, télémétrie qui continue d'arriver — 95 lignes en 10 min) ; `lireApi` préfère `auth_uid` (déployé avec #383, effectif au prochain run de la Sentinelle) |
| PR | [#382](https://github.com/PASSIO74/passio-app/pull/382) et [#383](https://github.com/PASSIO74/passio-app/pull/383) — fusionnées le 2026-09-14. |

---

## ASTRA-08 — La déduplication s'arrête sur un premier candidat déjà corrigé — P2 (chantier 7) — **préparé, câblage à venir**

| Champ | Valeur |
|---|---|
| État constaté | Le verdict ne portait que `cible = candidates[0]` ; le workflow (`sentinelle-autonome.yml`) ne déduplique que cette cible : si elle est déjà corrigée, le run s'arrête (« aucune enquête ouverte ») et le **suivant, encore actif**, reste invisible tant que le premier domine le classement. |
| Correction | `choisirCible(candidats, fermees)` (pure) rend le premier candidat non déjà corrigé ; le verdict porte `candidats` (les 5 premiers). **Le câblage du workflow** (`.github/workflows/sentinelle-autonome.yml`, périmètre critique → contre-revue de Benjamin) est reporté au lot « périmètre critique » : tant qu'il n'est pas fait, le comportement de production est inchangé. |
| Test effectué | `tests/unit/sentinelle-detecter.test.mjs` cas « ASTRA-08 » (premier corrigé, second actif → second ; liste vide/nulle → null). |
| Résultat | vert. |
| Limite restante | Sans le câblage, rien ne change en production. |
| État | **corrigé dans le code** : `choisirCible` (#382) **et câblage du workflow** (#383, contre-revue de Benjamin sur `ba89e46e`) · effectif au prochain run de `sentinelle-autonome.yml` · vérifié : non (attend un run avec un premier candidat déjà corrigé) |
| PR | [#382](https://github.com/PASSIO74/passio-app/pull/382) et [#383](https://github.com/PASSIO74/passio-app/pull/383). |

---

## ASTRA-10 — Une erreur transitoire de chargement des événements mémorisée comme absence de droit — P2 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté | `supaLoadEvents` (app-08) : `_eventColsPubliquesSeulement = true` sur **n'importe quelle** erreur de la demande privée. Un 503, une coupure, un délai au démarrage, et le compte perdait `address`, `contact`, `conv_id` pour toute la session (jusqu'à un jeton frais) — alors qu'une relance aurait suffi. **Reproduit** au banc (503 simulé : le second appel ne redemande que la liste publique). |
| Correction | `_refusDeDroit(error)` : seul un refus de **droit** (401, 403, 42501, 42703, PGRST301) pose le mémo ; une panne fait le repli public de la requête en cours, et la liste privée repart d'elle-même à l'appel suivant. |
| Test effectué | `tests/e2e/evenements-cols-visiteur.spec.js` ⑥ (503 → repli, mémo NON posé, la liste privée repart — RÉINJECTION) et ⑥ bis (un vrai refus se mémorise toujours ; table de `_refusDeDroit`). |
| Résultat | **Avant** (main pristine) : ⑥ et ⑥ bis rouges. **Après** : 9/9. |
| Limite restante | Aucune mesure sur appareil réel. |
| État | **corrigé dans le code** · **fusionné #382**, **déployé** (`release.json` servi = `89f8851a`) · vérifié après déploiement : artefact non relu à part |
| PR | [#382](https://github.com/PASSIO74/passio-app/pull/382) — fusionnée (squash) le 2026-09-14. |


---

## ASTRA-02 — Le plafond global compte des dates fournies par l'émetteur — P1 (chantier 7) — **appliqué**

| Champ | Valeur |
|---|---|
| État constaté | `limiter_debit_global` (ouverture publique) compte les lignes dont `created_at` / `received_at` est dans la dernière minute — colonnes à `DEFAULT now()` mais **écrivables par le client** (mesuré : aucun trigger ne les imposait). Un client qui antidate sort ses lignes de la fenêtre au moment d'y entrer : le plafond ne borne rien. Banc : 5 lignes antidatées passent un plafond de 3/min. |
| Correction | Le trigger pose la date du serveur (`json_populate_record(new, json_build_object(col_temps, now()))`) avant de compter. Migration `migration_debit_et_identite_serveur_2026-09-14.sql` (une transaction, rejouable, verdict 4 lignes). |
| Test effectué | `tests/sql/migration-debit-identite.test.sh` (24 contrôles, PostgreSQL jetable, CI) : défaut mesuré avant, antidatées re-datées et refusées au plafond sur les deux tables, mutation (ancienne fonction) → 5 repassent et verdict ① ECHEC, rejeu répare. |
| Résultat | Banc vert en CI (#383). |
| Limite restante | Le plafond reste global (par table, par minute), pas par émetteur anonyme — c'est le choix de l'ouverture publique. Non mesuré : comportement sous rafale réelle. |
| État | **corrigé dans le code** · **fusionné #383** (`89f8851a`) · **migration APPLIQUÉE** par Benjamin le 2026-09-14 et **mesurée** en base (`pg_get_functiondef` porte la pose de date, 2 triggers de débit) · vérifié après application : télémétrie qui continue d'arriver |
| PR | [#383](https://github.com/PASSIO74/passio-app/pull/383) — fusionnée (squash) le 2026-09-14 après contre-revue. |

---

## ASTRA-07 — Le vérificateur de sauvegarde accepte un fichier vide alors que le manifeste annonce des lignes — P2 (chantier 6) — **fait**

| Champ | Valeur |
|---|---|
| État constaté | `scripts/sauvegarde-donnees.js --verifier` : `if (contenu && lignes.length !== info.exporte)` — un fichier **vide** n'était jamais comparé au manifeste. **Reproduit** sur `main` : manifeste à 3 lignes, fichier vide → « Archive relue : conformes au manifeste », sortie 0. Ce vérificateur est celui que le workflow de sauvegarde exécute chaque nuit après déchiffrement : un vert à tort y vaut une archive qu'on croit restaurable. |
| Correction | Un vide se compte comme n'importe quel nombre (`lignes.length !== info.exporte`). |
| Test effectué | `tests/unit/sauvegarde-verifier.test.mjs` (3 cas, lance le **script lui-même** sur des dossiers fabriqués : vide vs 3 annoncées → anomalie, sortie 1 ; conforme → 0 ; vide annoncé → conforme), branché dans `deploy.yml`. |
| Résultat | Avant : rouge (sortie 0 sur le vide). Après : 3/3. |
| Limite restante | Le vérificateur relit les lignes et compte les fichiers médias ; il ne **restaure** toujours rien (EXP-01 reste ouvert : aucune restauration complète exercée). |
| État | **corrigé dans le code** · **fusionné #383** · effectif au prochain run de `sauvegarde.yml` |
| PR | [#383](https://github.com/PASSIO74/passio-app/pull/383). |

---

## MOD-02 — La fonction de signalement d'une publication n'a pas d'appelant — P1 (chantier 5)

| Champ | Valeur |
|---|---|
| État constaté (base `89f8851a`) | `reportPost` (app-04) existait — motif demandé, verdict serveur lu depuis le 2026-09-10 — mais **aucune surface ne l'appelait** : le ⋯ d'une publication n'était rendu que sur ses propres publications (`_estMonPost`), pour les supprimer. Un contenu illicite dans le fil n'avait pas de porte de signalement, alors que le DSA (art. 16) exige d'un hébergeur un mécanisme de notification accessible. |
| Correction | `_boutonOptionsPost(p)` (app-02, un seul constructeur pour le fil et la vue détail) : ma publication → ⋯ de suppression (inchangé) ; publication d'un compte réel → ⋯ « Signaler ou bloquer » → `openPostOptionsAutrui` (app-04) : « 🚩 Signaler cette publication » (`reportPost`) et « 🚫 Bloquer <nom> » / « ✅ Débloquer » (`blockUser` / `unblockUser`, verdict serveur lu depuis MOD-04). Le contenu de démonstration (auteur `u_…`, absent de la base) n'a pas de ⋯. |
| Test effectué | `tests/e2e/signaler-publication.spec.js` (5 cas) : ① ⋯ sur la publication d'un compte réel, la mienne, jamais la démo ; ② la feuille porte « Signaler » et « Bloquer Léa » ; ③ « Signaler » appelle `reportPost` sur la bonne publication ; ④ vue détail : même ⋯ ; ⑤ à la source : un seul constructeur. Voisines : suppression-durable, feed-premier-rendu, profil-visite-options, refonte-multi-passion, first-run, feed-envie-filtre (110/110). |
| Résultat | Avant : ① rouge (aucune porte). Après : 5/5. |
| Limite restante | Le signalement d'un **commentaire** depuis le fil et d'une **story** : non revus ici (`reportCommentEntry` a un appelant dans le fil de commentaires ; les stories n'ont pas de porte — à faire). Le **traitement** du signalement (MOD-01 : réception, décision, retrait, traçabilité) reste manuel via `scripts/moderation.js` ; l'alerte quotidienne existe ; aucun retrait automatique — non mesuré de bout en bout. |
| État | **corrigé dans le code** · déployé : **oui** (`11e01618`, `app.js?v=e423aa515d`, symboles servis vérifiés) · vérifié après déploiement : **oui** (artefact servi ; non mesuré sur deux comptes réels) |
| PR | `claude/mod-02-signaler-publication` — voir la PR ouverte depuis cette branche. |


---

## ROB-02 — RSVP annoncé avant confirmation, absence de retour arrière sur refus — P1 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté (base `fbc8ae09`) | `setEventRsvp` (app-07) : état local mis à jour, notification « Tu rejoins … » et toast émis, puis seulement `supaSetEventRsvp` ; un verdict `false` n'annulait rien — la personne se croyait inscrite, l'événement ne la comptait pas ; l'organisateur était notifié et la conversation rejointe quand même. Désinscription : « Désinscrit » affiché avant `supaLeaveEvent`, résultat ignoré. **Reproduit** au banc (verdict programmé `false`). |
| Correction | Instantané des listes avant l'optimiste ; `supaSetEventRsvp` / `supaLeaveEvent` **attendus** ; un refus **annule** l'affichage (listes, `eventRsvp`, carte, fiche), le dit (« ⚠️ Inscription / Désinscription non enregistrée — réessaie »), trace `diagLog`, et **n'émet ni notification ni entrée en conversation**. Le funnel (`irl_join_failed(write_failed)`) reste alimenté par le verdict. |
| Test effectué | `tests/e2e/faux-succes-irl-story.spec.js` ① ② ③ ; `irl-funnel.spec.js` (un cas réécrit : il exigeait que l'état optimiste survive au refus) ; `irl`, `irl-trust-safety`, `ui-v4a2-cartes`, `admission-18-plus`. |
| Résultat | **Avant** (main pristine) : ① ③ rouges. **Après** : 7/7 ; voisines 99/99. |
| Limite restante | En mode local (aucun SDK), l'inscription reste locale, comme avant (compté `offline` par le funnel). Non mesuré sur deux comptes réels. |
| État | **corrigé dans le code** · déployé : **oui** (`11e01618`, `app.js?v=e423aa515d`, symboles servis vérifiés) · vérifié après déploiement : **oui** (artefact servi ; non mesuré sur deux comptes réels) |
| PR | `claude/chantier-8-faux-succes` — voir la PR ouverte depuis cette branche. |

---

## IRL-04 — Promotion de liste d'attente annoncée malgré un refus — P1 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté | `_promoteNextWaitlisted` (app-07) déplaçait localement le premier de la file vers les inscrits, appelait `supaPromoteFromWaitlist` (qui rend déjà `false` sur zéro ligne — verdict lu depuis le 2026-09-02) **sans lire le retour**, puis notifiait « une place s'est libérée, tu es inscrit·e ! » quoi qu'il arrive. |
| Correction | Le serveur d'abord : promotion refusée → rien ne bouge localement, aucune notification, trace `diagLog` ; acceptée → déplacement, sauvegarde, notification. |
| Test effectué | `faux-succes-irl-story.spec.js` ④ (refus : reste en liste, pas de « inscrit ») ⑤ (accepté : monte, prévenu). |
| Résultat | **Avant** : ④ rouge. **Après** : vert. |
| Limite restante | La promotion reste faite **par le client qui se désinscrit** (pas de trigger serveur) : si ce client ferme l'application entre les deux appels, la place libérée n'est promue qu'à la prochaine désinscription. Autre lot (IRL-05 : capacité non garantie atomiquement). |
| État | **corrigé dans le code** · déployé : **oui** (`11e01618`, `app.js?v=e423aa515d`, symboles servis vérifiés) · vérifié après déploiement : **oui** (artefact servi ; non mesuré sur deux comptes réels) |
| PR | `claude/chantier-8-faux-succes`. |

---

## CONT-06 — Publication de story annoncée sans attendre le résultat — P1 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté | Les deux composeurs (`publishStoryFromComposer`, éditeur média mode `story`, app-08) appelaient `supaPublishStory(story)` **sans attendre ni lire son verdict**, puis « Story publiée ». Un refus (RLS, média non uploadé, réseau) laissait une story visible sur cet appareil seulement, annoncée comme publiée. |
| Correction | `_publierStoryAvecVerdict(story)` (un seul point pour les deux composeurs) : optimiste à l'écran, puis `await supaPublishStory` ; échec → story locale retirée, « ⚠️ Story non publiée — réessaie », trace ; succès → « Story publiée » ; sans compte réel ou sans SDK → « Story enregistrée sur cet appareil ». |
| Test effectué | `faux-succes-irl-story.spec.js` ⑥ (refus → retirée, dit) ⑦ (succès → publiée ; local → « sur cet appareil ») ; `stories-blocage`, `studio-moods`. |
| Résultat | **Avant** : ⑥ ⑦ rouges (la fonction n'existait pas). **Après** : vert. |
| Limite restante | Aucune file de renvoi pour une story (contrairement aux publications) : l'échec est dit, pas rejoué — CONT-02 / ROB-01 (reprise durable) restent ouverts. |
| État | **corrigé dans le code** · déployé : **oui** (`11e01618`, `app.js?v=e423aa515d`, symboles servis vérifiés) · vérifié après déploiement : **oui** (artefact servi ; non mesuré sur deux comptes réels) |
| PR | `claude/chantier-8-faux-succes`. |


---

## CONT-02 / ROB-01 — Aucune reprise durable d'une publication après l'échec final — P1 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté (base `fbc8ae09`) | `syncStatus` posé à `"syncing"` à la création (Studio, app-06) et **jamais mis à jour** : le badge « Sync… » restait à vie, « En ligne » / « Local » n'étaient jamais affichés. Après le dernier essai de `supaPublishPostWithRetry` (2 essais, 1 s), l'échec ne quittait pas la console : la publication restait dans `state.userPosts` sur cet appareil (« Post en local »), et **rien ne la renvoyait** — ni au retour du réseau, ni au lancement suivant. Seules les bobines avaient un minuteur (`_scheduleReelRetry`, 8 × 45 s), en mémoire, perdu au rechargement. Quatre producteurs concernés : Studio, partage de bobine (app-05), partage de publication (app-03), partage d'événement (app-07). **Reproduit** au banc (insert refusé → `syncStatus` reste `"syncing"`, aucun renvoi). |
| Correction | Le point d'écriture central (`_pubDone`) **écrit le verdict sur la publication** (`_verdictPublication`, app-08) — persisté par `saveState()` donc durable : `synced` / `refusee` (passion absente ou inconnue, clé étrangère : définitif, jamais rejoué) / `offline` (transitoire : **rejoué** au retour du réseau, toutes les 45 s — 8 essais par session — et au **lancement suivant** via `_rejouerPublicationsEnAttente`, minuteur d'amorçage 6 s) / `perdue` (média photo/vidéo/audio absent de l'appareil — le base64 n'est jamais persisté par `_leanState` — : dit à la personne, **jamais inséré sans média**). Un envoi encore `"syncing"` mais antérieur au chargement de page (application fermée pendant l'envoi) est requalifié en attente (`_requalifierEnvoisInterrompus`) ; ceux de la session courante ne sont pas doublés. Seules **mes** publications d'un **compte réel** sont rejouées (`authorId === MY_UID`, `_uidEstUnCompte()`). Le badge dit l'état réel (« Local · renvoi automatique », « Non publiée », « Média perdu »). Le chemin bobine s'appuie sur la même file. |
| Test effectué | `tests/e2e/publications-reprise.spec.js` (6 cas) : ① échec transitoire écrit et persisté, renvoi planifié ; ② la file rejoue, `synced`, « Publication envoyée », pas de double insert ; ③ survit au **rechargement** et repart de lui-même au lancement (`offline` et `syncing` antérieur) ; ④ refus définitif → `refusee`, jamais rejoué ; ⑤ média perdu → `perdue`, aucun insert ; ⑥ publication d'un autre compte → jamais publiée sous le mien. Voisines : feed-activite-relue, first-run, multi-comptes, partage-bobine, passion-personnalisee-fk, passion-politiques-ecriture, passion-referentiel, publication-optimiste-refusee, suppression-durable, ui-v2-shell, fuite-blob-bobines (106/106). `audit:globals` OK. |
| Résultat | **Avant** (main pristine `fbc8ae09`, RÉINJECTION) : 6/6 rouges (① : `syncStatus` reste `"syncing"` ; ②–⑥ : la file n'existe pas). **Après** : 6/6 ; **artefact minifié** (build + html-minifier-terser + terser + clean-css comme le job de déploiement) : 6/6. |
| Limite restante | Un média dont l'**upload** a échoué avant l'insert est perdu au rechargement (contrainte de quota localStorage, `_leanState`) : la personne est prévenue, elle doit republier — une file de médias (IndexedDB) serait le lot suivant. Le « Post en local (connexion lente) » après 5 s reste affiché même si l'envoi aboutit ensuite (faux échec, pas faux succès) : hors périmètre. Les **stories** n'ont pas de file (CONT-06 : l'échec est dit, pas rejoué). Non mesuré sur deux appareils réels. |
| État | **corrigé dans le code** · déployé : **oui** (`11e01618`, `app.js?v=e423aa515d`, symboles servis vérifiés) · vérifié après déploiement : **oui** (artefact servi ; non mesuré sur deux comptes réels) |
| PR | `claude/chantier-8-reprise-publications` — voir la PR ouverte depuis cette branche. |


---

## ROB-04 — Double tap sur « Suivre » désabonne ; double tap sur « Bloquer » écrit deux fois — P3 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté (base `9de2c4d6`) | `toggleFollowUser` (app-04) : aucun verrou — un second tap pendant l'écriture lisait l'état optimiste « suivi » et lançait le DELETE : POST puis DELETE en 300 ms, deux toasts contradictoires, état final « Suivre ». `blockUser` / `unblockUser` : deux taps = deux INSERT `blocks`, deux toasts. **Reproduit** au banc (écriture tenue en vol). |
| Correction | `_verrouEcriture(table, id, promesse)` (app-04) : `_ecritureSuiviEnCours[uid]` / `_ecritureBlocageEnCours[uid]` posés à l'envoi, levés **à la réponse du serveur** (jamais sur un minuteur). Pendant ce temps, `toggleFollowUser` ignore le tap ; `blockUser` / `unblockUser` rendent `false` sans rien écrire ni annoncer. Même famille que `_likePending` et `_publishInProgress`. |
| Test effectué | `tests/e2e/doubles-ecritures.spec.js` ① (Suivre ×2 en vol : un INSERT, un toast, état « suivi » avant et après la réponse) ② (Bloquer ×2 : un INSERT, un toast, second appel `false`) ④ (après la réponse, le geste inverse marche : INSERT puis DELETE). `recherche-referentiel` ⑧ réécrit (il enchaînait deux clics **synchrones** — exactement le double tap — pour prouver que « désuivre » existe ; il laisse désormais le faux serveur répondre). Voisines : blocage-acces, blocage-verdict, blocage-groupe-commun, parcours-suivre, profil-visite-options, first-run, ouverture-publique… (163/163 après réécriture). |
| Résultat | **Avant** (main pristine, RÉINJECTION) : ① ② rouges, ④ vert. **Après** : 5/5 ; **artefact minifié** : 5/5. |
| Limite restante | Le verrou est **par compte cible et par appareil** : deux onglets écrivent chacun une fois (le serveur dédoublonne par clé). Le bouton n'est pas grisé pendant l'écriture (l'ignorance du tap suffit ; non mesuré à l'œil). |
| État | **corrigé dans le code** · déployé : **oui** (`11e01618`, `app.js?v=e423aa515d`, symboles servis vérifiés) · vérifié après déploiement : **oui** (artefact servi ; non mesuré sur deux comptes réels) |
| PR | `claude/chantier-8-doubles-ecritures` — voir la PR ouverte depuis cette branche. |

---

## ROB-06 — Deux vidages concurrents de la file d'envoi renvoient le même message deux fois — P3 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté | `_flushOutbox` (app-04) déclenché par `online` **et** par le boot (app-08, 1,5 s), ou deux « réessayer » rapprochés : chaque appel lisait la même file et appelait `_sendTextToSupa` pour chaque entrée — quatre INSERT pour deux messages ; le serveur dédoublonnait par clé primaire (id client), mais la seconde réponse (23505) écrasait « envoyé » par « échec ». **Reproduit** au banc (deux `_flushOutbox()` → m1, m2, m1, m2). |
| Correction | `_msgEnVol[msgId]` (app-04) : tant que l'INSERT d'un message n'a pas répondu, tout nouvel envoi du même id est **ignoré** (`_sendTextToSupa`) ; `_flushOutbox` garde l'entrée en file **sans compter d'essai** ni la renvoyer. Levé à la réponse (succès, refus, exception). |
| Test effectué | `doubles-ecritures.spec.js` ③ (deux vidages concurrents : deux INSERT pour deux messages, tous deux « sent », file vide) ⑤ (deux « réessayer » : un envoi ; après la réponse, un nouvel échec se renvoie). Voisines : file-messages-par-compte, message-refus-definitif, message-media-echec, conv-reparation-appartenance, notification-message, transfert-message, reprise-lectures-boot. |
| Résultat | **Avant** : ③ ⑤ rouges. **Après** : vert ; artefact minifié : vert. |
| Limite restante | Le verrou est en mémoire : deux **onglets** peuvent encore envoyer le même message (la clé primaire tient). Le chemin **média** (`sendMessageToSupabase`) n'a pas de file et n'est pas concerné. |
| État | **corrigé dans le code** · déployé : **oui** (`11e01618`, `app.js?v=e423aa515d`, symboles servis vérifiés) · vérifié après déploiement : **oui** (artefact servi ; non mesuré sur deux comptes réels) |
| PR | `claude/chantier-8-doubles-ecritures`. |


---

## MSG-06 — Suppressions locales (message pour moi, effacer le fil, supprimer la conversation) qui ressuscitent au rechargement serveur — P1 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté (base `origin/main` après #387) | Les pierres tombales ADR-008 (`passio_conv_deleted_v1`) n'étaient consultées que par la fusion **locale** (`_unionConvsById`). Trois portes serveur les ignoraient : `openConversation` (app-04) réinjectait tout message serveur absent en local — « Supprimer pour moi », fermer, rouvrir : le message revenait ; le boot (`supaInit`, app-08) remettait toute conversation rendue par `supaLoadMyConversations`, y compris celle qu'on venait de « Supprimer » ; « Effacer le fil » (`_clearConvMessages`, app-09) vidait le tableau local et rien d'autre — la réouverture rechargeait l'historique entier ; `_deleteConv` ne posait aucune pierre. **Reproduit** au banc (émulation S8 de l'audit confirmée : `present_apres_reouverture: true`). |
| Correction | Un seul point décide qu'un message est masqué : `_msgMasquePourMoi(journal, convId, m)` (app-04) — pierre `msg:<id>` **ou** message antérieur à la marque `clr:<convId>` (« fil effacé à cet instant »). Appliqué dans `_unionConvsById`, dans `openConversation` (le retour de `supaLoadMessages` est filtré avant fusion) et au boot via `_filtrerConvsServeur` (conversations `conv:<id>` écartées, messages masqués retirés). `_clearConvMessages` pose `clr` ; `_deleteConv` pose `clr` + `conv`. Un **nouveau** message de l'autre dans une conversation supprimée la fait réapparaître **avec ce seul message** (`_handleIncomingConvMessage` lève `conv`, garde `clr`) — la sémantique d'une messagerie ordinaire ; l'appartenance serveur (`conv_members`) n'est pas touchée, donc aucun effet sur les canaux d'écriture ni sur la réparation d'appartenance. `convTombRemove` ajouté. |
| Test effectué | `tests/e2e/suppressions-serveur.spec.js` (6 cas) : ① supprimer pour moi puis rouvrir ; ② effacer le fil puis rouvrir ; ③ après effacement, un message postérieur s'affiche ; ④ conversation supprimée non remise par le boot (`_filtrerConvsServeur`) ni par la fusion ; ⑤ nouveau message → réapparaît avec ce seul message, `conv` levée, `clr` tenue, historique toujours masqué à la réouverture ; ⑥ sans suppression, rien ne se volatilise. `conv-suppression` (ADR-008, 3/3 inchangé). Voisines : blocage-groupe-commun, confidentialite, conv-clavier-ouverture, conv-ouverture-fil, identite-expediteur-serveur, irl-trust-safety, mention-groupe-xss, multi-comptes, notification-message, qa-campaign, ui-v6c-proposer-irl, ui-v7-parcours, xss-notifs-messages, file-messages-par-compte, transfert-message (96/96). |
| Résultat | **Avant** (main pristine, RÉINJECTION) : ①–⑤ rouges, ⑥ vert. **Après** : 6/6 ; **artefact minifié** : 6/6. |
| Limite restante | Journal local **par appareil**, TTL 30 j, 2000 entrées (bornes ADR-008) : au-delà, le serveur fait autorité et un message reçu peut revenir ; sur un **autre appareil** du même compte, la suppression n'est pas répercutée (aucune table serveur `conv_hidden` — lot suivant si voulu). « Supprimer la conversation » ne quitte pas la conversation côté serveur (choix : l'autre peut toujours écrire, comme sur WhatsApp) ; quitter un groupe reste `leaveGroup`. Non mesuré sur deux comptes réels. |
| État | **corrigé dans le code** · déployé : **oui** (`264204cb`, `app.js?v=1ecb443007`, symboles servis vérifiés) · vérifié après déploiement : **oui** (artefact servi ; non mesuré sur deux comptes réels) |
| PR | `claude/chantier-8-suppressions-durables` — voir la PR ouverte depuis cette branche. |


---

## IRL-06 — Suppression d'une activité : verdict serveur ignoré, inscrits jamais prévenus, participations orphelines — P2 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté (base `origin/main` après #388) | `deleteEventConfirm` (app-07) affichait « Événement supprimé » quel que soit le retour de `supaDeleteEvent` (qui rendait déjà `false` sur refus ou zéro ligne) ; aucune notification. **En base (mesuré le 2026-09-14, canal ① lecture)** : aucune clé étrangère entre `event_attendees` / `event_comments` / `event_reactions` et `events` ; policies DELETE « ses lignes seulement » sur les trois tables filles → l'organisateur ne peut pas retirer les inscriptions des autres, `supaDeleteEvent` « nettoyait » en silence ses seules lignes. **15 participations orphelines sur 25**, 35 commentaires et 47 réactions rattachés à des activités disparues. |
| Correction | **Client** : le verdict est lu — refus → rien ne bouge, « ⚠️ Suppression non enregistrée — réessaie », trace ; succès → `_prevenirSuppressionActivite(ev)` notifie inscrits ∪ « peut-être » ∪ liste d'attente (`event_cancelled`, « « titre » a été supprimé par l'organisateur »), chacun une fois, jamais soi-même, **avant** que les listes disparaissent ; sans compte réel → suppression locale dite « sur cet appareil », aucun appel. **Base** : `migrations/migration_evenements_cascade_2026-09-14.sql` (canal ③, à coller par Benjamin, rejouable, verdict 7 lignes) : orphelins retirés, puis 3 FK `event_id → events(id) ON DELETE CASCADE` — la suppression du parent (policy « Suppression propre » inchangée) emporte les lignes filles sous n'importe quel compte. Aucune policy modifiée. |
| Test effectué | `tests/e2e/suppression-activite.spec.js` (3 cas : refus → reste, dit, personne notifié ; accepté → 4 destinataires uniques, jamais moi ; sans compte → local, dit). Banc SQL `tests/sql/migration-evenements-cascade.test.sh` (PostgreSQL jetable : défaut mesuré avant — l'organisateur supprime, l'inscription d'autrui reste ; application, verdict, rejeu ; cascade sous l'organisateur seul ; un tiers ne supprime pas ; un participant retire sa seule inscription) — câblé dans `deploy.yml`. Voisines : irl, irl-trust-safety, faux-succes-irl-story, irl-funnel, ui-v4a2-cartes (86/86 ; un cas irl-funnel rouge en parallèle ×2, vert seul — saturation). |
| Résultat | **Avant** (main pristine, RÉINJECTION) : ① ② ③ rouges. **Après** : 3/3 ; **artefact minifié** : 3/3. Banc SQL : **non mesuré localement** (aucun PostgreSQL sur ce poste) — la CI est la mesure. |
| Limite restante | La migration doit être **collée** (canal ③) : tant qu'elle ne l'est pas, une suppression laisse encore les inscriptions d'autrui en base (mais l'écran et les notifications sont justes). Les orphelins actuels (15/35/47) seront retirés par la migration — ils ne correspondent à aucune activité existante. Les notifications partent du client de l'organisateur (fire-and-forget, pas de verdict par destinataire). |
| État | **corrigé dans le code** · déployé : **oui** (`5caaf322` #389, servi — vérifié dans `app.js?v=1ecb443007`) · migration : **appliquée et mesurée** (3 FK cascade, orphelins 0/0/0, `event_attendees` 25 → 10, commentaires 35 → 0, réactions 47 → 1) · vérifié après déploiement : **oui** (symbole `_prevenirSuppressionActivite` servi) |
| PR | `claude/chantier-8-suppression-activite` — porte `migrations/*` et `.github/*` : **contre-revue** requise sur le SHA. |


---

## IRL-10 — Conversation d'événement créée par un co-organisateur : aucun participant ne peut la rejoindre, refus silencieux — P2 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté (base `5caaf322`) | **En base (relu le 2026-09-14, canal ①)** : `can_join_event_conversation` exige `c.created_by = e.author_id` ; la policy INSERT « Ecriture propre » de `conv_members` passe par elle pour tout non-créateur. Le client (`_canManageEvent`, app-07) laisse un **co-organisateur** créer la discussion (`created_by = MY_UID`) → tout inscrit est refusé. Et `_joinEventConversation` **ignorait** le verdict de `supaJoinEventConversation` : le miroir local était créé quand même, `openEventChat` ouvrait une conversation où chaque message partait en 403. Aucune discussion dans ce cas en base aujourd'hui (0 `evgrp_*` créée par un non-auteur) : la porte est fermée avant qu'elle serve. |
| Correction | **Base** : `migrations/migration_discussion_coorganisateur_2026-09-14.sql` (canal ③, à coller — rejouable, verdict 3 lignes) : la condition admet aussi un co-organisateur (`e.co_organizers ? c.created_by`, jsonb), tout le reste de la fonction repris à l'identique ; `CREATE OR REPLACE` conserve droits (authenticated oui, anon non — vérifiés) et `search_path`. **Client** : `_joinEventConversation` rend un verdict et **ne crée le miroir local que si le serveur accorde l'entrée** (refus tracé `diagLog`) ; `openEventChat` demande l'entrée quand la discussion n'est pas déjà locale et dit « ⚠️ Impossible de rejoindre la discussion pour le moment — réessaie » sur refus, en restant sur la fiche ; `supaCreateEventConversation` lit le verdict de l'entrée du créateur (créateur non membre → `null`, pas de discussion fantôme). |
| Test effectué | Banc SQL `tests/sql/migration-discussion-coorganisateur.test.sh` (socle = fonction et policy de prod ; défaut mesuré avant ; application, verdict, rejeu ; inscrit entre chez l'auteur et chez le co-organisateur ; tiers, non-inscrit, usurpation d'identité refusés ; anon sans EXECUTE ; `co_organizers NULL` ne lève pas) — câblé dans `deploy.yml`. `tests/e2e/discussion-activite-refus.spec.js` (4 cas : refus → pas de miroir, dit, fiche conservée ; accepté → miroir + Messages ouvert ; déjà membre → aucune demande ; création par un gestionnaire : entrée lue). Voisines : irl, irl-trust-safety, faux-succes-irl-story, ui-v6c-proposer-irl, conv-reparation-appartenance (72/72). |
| Résultat | **Avant** (main pristine, RÉINJECTION) : ① ② ④ rouges, ③ vert. **Après** : 4/4 ; **artefact minifié** : 4/4. Banc SQL : **non mesuré localement** (pas de PostgreSQL) — la CI est la mesure. |
| Limite restante | Migration **à coller** : tant qu'elle ne l'est pas, une discussion créée par un co-organisateur reste fermée aux inscrits — mais le client le **dit** désormais au lieu d'ouvrir une conversation morte. Un co-organisateur non inscrit (`rsvp` absent) ne peut rejoindre une discussion créée par l'auteur qu'en s'inscrivant (contrat inchangé). `setEventRsvp` appelle encore `_joinEventConversation` en arrière-plan sans afficher le refus (l'inscription est le contrat ; la discussion se redemande depuis la fiche). |
| État | **corrigé dans le code** · déployé : **oui** (`3e7c4798` #390, servi) · migration : **appliquée et mesurée** (fonction admet un co-organisateur, `search_path` figé, anon sans EXECUTE, authenticated avec) · vérifié après déploiement : **oui** (artefact servi) |
| PR | `claude/chantier-8-discussion-coorganisateur` — porte `migrations/*` et `.github/*` : **contre-revue** requise sur le SHA. |


---

## PRO-04 — La vitrine publique (profiles.passions, passion_id) diverge de l'état réel du compte — P2 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté (base `3e7c4798`, mesuré en base le 2026-09-14, canal ①) | Sur 6 comptes ayant `profiles` + `user_state` : les listes vitrine/état **coïncident** pour 5 (le cas `moto-enduro` du 04/09 est résorbé : archivée des deux côtés) ; **un compte** (`6902826f`) a 25 passions dans l'état et **16** dans la vitrine — la vitrine n'est publiée qu'aux gestes (`supaSavePassionState` à l'ajout, l'archivage, la bascule), un geste dont la publication a échoué la laisse en retard pour toujours. `profiles.passion_id` ≠ passion active sur 4 comptes sur 6 — **et c'est voulu** : ADR-010 en fait la passion PRINCIPALE (première vivante canonique, rétro-compat feed/embeds/anciens clients), deux suites l'exigent (`avatar-public-stable`, `hotfix-profil-passion-custom`) ; la contre-revue a lu l'inverse dans une doc. |
| Correction | **Réconciliation au démarrage** : `_reconcilierVitrinePassions` (app-08) — une fois l'état du compte chargé (`_etatCompteCharge`), si l'empreinte (passions + rangement + active) diffère de la dernière publication **réussie** (`passio_vitrine_publiee_v1`, posée par `supaSavePassionState` sur verdict `ok`), republier ; compte réel seulement, 6 essais au plus, jamais en boucle, refus tracé. `_passionIdPubliable` **inchangé** (une première rédaction le faisait suivre l'active — deux suites voisines rouges, ADR-010 relu, revenu). `.passio/context/MULTI_PROFILE.md` précisé : `profiles.passion_id` ne suit pas la bascule. |
| Test effectué | `tests/e2e/vitrine-passions.spec.js` ① (passion_id = première vivante canonique, indépendante de la bascule) ② (archivée écartée) ③ (réconciliation : publie quand l'empreinte diffère, pas deux fois, republie après un geste) ③ bis (sans compte réel, rien ne part). Voisines : 23 suites profil/passions/Studio (331/333 en parallèle ×2 ; les 2 rouges étaient la première rédaction de passion_id, 22/22 après retour). |
| Résultat | **Avant** (main pristine, RÉINJECTION) : ③ ③ bis rouges (la réconciliation n'existe pas) ; ① ② verts (comportement inchangé, désormais verrouillé). **Après** : 6/6 ; **artefact minifié** : 6/6. |
| Limite restante | Le compte `6902826f` sera réconcilié à son prochain démarrage sur ce client (non mesuré : à relire en base après déploiement). Pourquoi sa vitrine a pris du retard (échec réseau ? session ?) n'est pas établi — la trace `diagLog("vitrine passions non réconciliée")` le rendra mesurable. |
| État | **corrigé dans le code** · déployé : **oui** (`264204cb`, `app.js?v=1ecb443007`, symboles servis vérifiés) · vérifié après déploiement : **oui** (artefact servi ; non mesuré sur deux comptes réels) |
| PR | `claude/chantier-8-vitrine-passions`. |

---

## PRO-05 — Le sélecteur du Studio propose encore une passion archivée et publie dans un profil archivé — P2 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté | `archiverPassion` / `restaurerPassion` (app-06) repeignaient l'écran Profil, pas le Studio : `#postPassion` gardait l'option archivée (surtout sur le chemin `silencieux` de l'échange) ; `publishPost` lisait la valeur et retrouvait le profil **archivé** (`_matchProf` retombe sur n'importe quel profil de cette passion) → publication dans un profil archivé. **Reproduit** au banc (attaque D de l'audit). |
| Correction | `_resyncStudioSiVisible()` (app-06) — un seul point, appelé par la bascule ET par l'archivage/restauration, `silencieux` compris. Et la garde au **point d'écriture** : `publishPost` refuse une passion archivée même si le sélecteur la propose encore (« Cette passion est archivée — réactive-la ou choisis-en une autre »), repeint le sélecteur, ne crée aucune publication locale. |
| Test effectué | `vitrine-passions.spec.js` ④ (archiver en `silencieux`, Studio à l'écran → l'option disparaît) ⑤ (sélecteur périmé portant une archivée → refus, 0 post local, sélecteur repeint). Voisines : studio-moods, passions-archive-quota, ui-v8-passions, mes-passions-page… (dans les 23 ci-dessus). |
| Résultat | **Avant** : ④ ⑤ rouges. **Après** : vert ; artefact minifié : vert. |
| Limite restante | Le sélecteur en mode référentiel plat (`#studioPassionBtn`) n'est pas un `<select>` : la garde d'écriture couvre les deux chemins, le repeint suit `renderStudio`. |
| État | **corrigé dans le code** · déployé : **oui** (`264204cb`, `app.js?v=1ecb443007`, symboles servis vérifiés) · vérifié après déploiement : **oui** (artefact servi ; non mesuré sur deux comptes réels) |
| PR | `claude/chantier-8-vitrine-passions`. |

---

## Outillage — prendre la main sur les gestes manuels (2026-09-14, demande de Benjamin)

| Champ | Valeur |
|---|---|
| Constat | Six migrations collées à la main dans la journée, deux contre-revues pour une ligne de YAML par banc. |
| Correction | `scripts/appliquer-migration.mjs` (`npm run migration:appliquer -- migrations/<f>.sql`) : envoie la migration à l'API de gestion Supabase — **l'endpoint même que le bouton « Run » de l'éditeur SQL** (canal ③ d'ADR-012, même rôle, même transaction) ; exige le jeton personnel de la CLI (jamais `service_role`), un fichier sous `migrations/` en `begin;…commit;`, refuse la CI ; imprime le tableau de verdict et rappelle de mesurer l'état en base. **Éprouvé** : rejeu de `migration_evenements_cascade` → 7 lignes identiques au coller manuel. `scripts/bancs-sql-restants.sh` (câblé une fois dans `deploy.yml`) : tout banc `tests/sql/*.test.sh` non nommé dans le workflow tourne quand même — une nouvelle migration ne touche plus `.github/`. |
| Ce qui reste manuel, délibérément | La **contre-revue** des PR qui touchent `migrations/*`, `.github/*`, `dashboard/server/*`, `scripts/run_migrations.js`, `scripts/sauvegarde-donnees.js` : c'est le seul contrôle humain entre ce canal et la production ; il ne se contourne pas. Elle se déclenchera désormais **aux migrations seules** (plus aux bancs). |
| État | **corrigé dans le code** · déployé : n/a (outillage de poste + CI) |


---

## IRL-11 — Prix et capacité négatifs acceptés ; édition avec une date passée acceptée — P3 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté | `submitEvent` (app-07) lisait `parseFloat`/`parseInt` sans borne : prix `-5` accepté (affiché « Gratuit »), capacité `-3` acceptée (activité « complète » à la création) ; la garde « date déjà passée » ne valait qu'à la création (`!editId`). **Reproduit** au banc. En base : aucun CHECK sur `events.price` / `max_attendees` (à poser avec la migration d'IRL-05, même lot serveur). |
| Correction | Bornes revalidées au point d'écriture : `price` ∈ [0, 99999], `max_attendees` ∈ [1, 9999] ou vide ; « Cette date est déjà passée » vaut aussi à l'édition, sauf si l'activité est **déjà** à cette date (correction d'un titre après coup reste possible — comparaison au jour local, `_localDay` étant locale à `openCreateEvent`). |
| Test effectué | `tests/e2e/irl-bornes-annulation-geo.spec.js` ① (prix/capacité négatifs refusés, rien créé) ② (édition vers le passé refusée) ④ (nominal : création valide ; retouche d'une activité passée sans changer la date). |
| Résultat | **Avant** (main pristine) : ① ② rouges, ④ vert. **Après** : vert ; artefact minifié : vert. Voisines IRL 129/129. |
| Limite restante | Les CHECK en base (`price >= 0`, `max_attendees > 0`) arrivent avec la migration IRL-05 (capacité atomique) — lot suivant, une seule contre-revue. |
| État | **corrigé dans le code** · déployé : non · vérifié après déploiement : non |
| PR | `claude/chantier-8-irl-bornes-annulation-geo`. |

---

## IRL-13 — L'annulation ne prévient que les inscrits « going » — P3 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté | `_notifyEventAttendees` ne bouclait que sur `attendees` : « peut-être » et liste d'attente apprenaient l'annulation sur place. Et `toggleCancelEvent` posait `status = "cancelled"` **avant** `supaCancelEvent` : sur refus, « Changement non synchronisé » mais l'activité restait barrée à l'écran (faux succès, même famille que ROB-02). `cancelEventSeries` idem. |
| Correction | `_destinatairesActivite(ev)` — seule liste des personnes à prévenir (inscrits ∪ peut-être ∪ attente, chacun une fois, jamais soi-même), partagée avec la suppression (IRL-06, `_prevenirSuppressionActivite` réécrite dessus). `_notifyEventAttendees(ev, texte, kind)` l'utilise ; annulation → `event_cancelled`. `toggleCancelEvent` et `cancelEventSeries` : le serveur d'abord ; refus → rien ne bouge, « ⚠️ Changement non enregistré — réessaie », trace. |
| Test effectué | même spec ③ (trois listes, une fois, `event_cancelled`) ⑤ (refus → active, personne prévenu, dit). |
| Résultat | **Avant** : ③ ⑤ rouges. **Après** : vert ; artefact minifié : vert. |
| Limite restante | Le message groupé (`_sendEventBroadcast`) et l'édition (« a modifié un événement ») prévenaient aussi `attendees` seuls : ils passent par la même fonction, donc les trois listes désormais — voulu (une annonce de dernière minute concerne aussi « peut-être »). Notifications fire-and-forget, sans verdict par destinataire. |
| État | **corrigé dans le code** · déployé : non · vérifié après déploiement : non |
| PR | `claude/chantier-8-irl-bornes-annulation-geo`. |

---

## ROB-05 — Géolocalisation refusée : repli silencieux sur Paris — P3 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté | `requestUserLocation` (app-07) : sur refus, `irlUserLocation = Paris` et `irlUserLocationError = true`, mais `updateIrlCityTitle` testait `irlUserLocation` **avant** l'erreur → titre « Paris » comme une position réelle ; aucun toast. Ce libellé alimente aussi le panneau Filtre (`_irlReferenceLabel`). |
| Correction | Le repli se dit : titre « Paris (par défaut) » (la branche erreur passe avant la position), toast une fois par session « Localisation indisponible — résultats autour de Paris. Choisis ta ville dans Filtre → Autour de moi. » Le choix d'une ville (`irlSelectedCity`) remplace le repli, comme avant. |
| Test effectué | même spec ⑥ (refus → titre et libellé « Paris (par défaut) », un seul toast sur deux demandes, choisir une ville remplace). |
| Résultat | **Avant** : ⑥ rouge. **Après** : vert ; artefact minifié : vert. |
| Limite restante | Pas de champ ville inline dans le toast (la sortie est nommée, pas offerte à la même place) ; non mesuré sur un appareil réel avec permission refusée. |
| État | **corrigé dans le code** · déployé : non · vérifié après déploiement : non |
| PR | `claude/chantier-8-irl-bornes-annulation-geo`. |


---

## IRL-05 — La capacité n'est pas garantie par la base (inscriptions concurrentes, statut, valeurs `rsvp`) — P1 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté (base, mesuré le 2026-09-14) | `event_attendees` : aucun CHECK sur `rsvp`, aucune borne de capacité, aucune garde de statut — les policies INSERT/UPDATE ne vérifient que `user_id = auth.uid()` (+ admission 18+). La capacité n'était tenue que par le client qui s'inscrit (contournable en REST, jamais atomique : le banc de chaos de l'audit a fait passer 2 POST + 2 PATCH concurrents). `events.price` / `max_attendees` sans borne. Données : 0 prix négatif, 0 capacité < 1, 0 rsvp hors liste, 0 activité déjà au-delà de sa capacité — rien à réparer. |
| Correction | **Base** : `migrations/migration_capacite_activite_2026-09-14.sql` — CHECK `rsvp ∈ {going, maybe, declined, waitlist}`, CHECK `price >= 0`, CHECK `max_attendees ≥ 1 ou NULL` (IRL-11 côté base) ; trigger BEFORE INSERT/UPDATE `trg_event_attendees_capacite` : le passage à `going` est refusé sur activité annulée / passée / complète, sous verrou `FOR UPDATE` de la ligne `events` (deux inscriptions concurrentes sérialisées) ; messages stables `activite_complete` / `activite_annulee` / `activite_passee` ; `maybe`, `waitlist`, `declined`, « rester going » passent ; sans session (administration) la règle ne s'applique pas. **Client** : `supaSetEventRsvp` lit le motif (`_motifRefusRsvp`), `setEventRsvp` le dit (« Activité complète — tu peux rejoindre la liste d'attente », « a été annulée », « déjà passée ») en annulant l'optimiste (ROB-02). |
| Test effectué | Banc SQL `tests/sql/migration-capacite-activite.test.sh` (défaut mesuré avant : 3 going sur 2 places, going sur annulée, `rsvp='bidon'`, prix -5 acceptés ; application, verdict 6/6, rejeu ; refus complet/annulée/passée/bidon/prix/capacité ; passe : waitlist, maybe, pointage, declined, promotion, administration ; **deux sessions concurrentes** sur la dernière place → la seconde refusée, jamais 3). `tests/e2e/capacite-serveur.spec.js` (3 cas : complet nommé + sortie ; annulée / passée ; sans motif → générique, succès → inscrit). Voisines : faux-succes-irl-story, irl-funnel (23/23). |
| Résultat | **Avant** (main pristine) : ① ② rouges (le refus était dit « non enregistrée » pour tout), ③ vert. **Après** : 3/3 ; artefact minifié : 3/3. Banc SQL : **mesuré en CI** (pas de PostgreSQL local) — voir la PR. |
| Limite restante | La liste d'attente reste gérée par le client (promotion par celui qui se retire, IRL-04) — le serveur garantit seulement qu'elle ne dépasse pas la capacité. `setEventRsvp` ne bascule pas automatiquement en `waitlist` sur `activite_complete` : la personne choisit. |
| État | **corrigé dans le code** · déployé : non · migration : **appliquée et mesurée** (banc CI vert d'abord, puis `npm run migration:appliquer` — 3 CHECK, trigger `trg_event_attendees_capacite`, `search_path` figé, vérifiés en base) · vérifié après déploiement : non |
| PR | `claude/chantier-8-capacite-serveur` — porte `migrations/*` : **contre-revue** requise sur le SHA. |


---

## ROB-03 — Session expirée (401) ou serveur en panne (500/429) : aucune information à l'utilisateur — P2 (chantier 8)

| Champ | Valeur |
|---|---|
| État constaté | Au chaos de l'audit (toutes les requêtes Supabase en 500, 401 ou 429) : fil servi depuis le cache, navigation possible, **aucun toast, aucune bannière**, 28 rejeux en 30 s. Les écritures échouaient en silence ; une session morte laissait la personne « connectée » à l'écran. Le seul bandeau existant (`#offlineBanner`, app-09) ne parle que du réseau coupé. |
| Correction | Sonde légère sur `fetch` bornée à l'hôte Supabase (`_sondeServeurInstaller`, app-02, chargé avant tout) : **≥ 3 réponses 5xx/429 en 30 s** → bandeau « Serveur indisponible — tes actions ne sont pas enregistrées pour le moment » (`#serveurBanner`, créé à la demande), retiré à la première 2xx ; **401 sur REST/Storage/Functions avec un compte réel** → on demande au SDK si une session vit encore (`supa.auth.getSession`) ; sans session → bandeau « Session expirée — Se reconnecter » (`doLogout("signin")`), anti-rafale 60 s. Un 401 chez un **visiteur** (rôle anon, placeholder `u_…`) ou sur `/auth/v1` n'affiche rien ; les échecs **réseau** (`status 0`) ne sont pas comptés (domaine du bandeau hors-ligne et de la reprise des lectures). Un bandeau, jamais de toast (une panne = des dizaines d'échecs). Tracé `diagLog`. |
| Test effectué | `tests/e2e/etat-serveur.spec.js` (5 cas) : ① 3 × 5xx/429 → bandeau, 2xx le retire ; ② 401 sans session → « Se reconnecter », avec session vivante → rien, `/auth/v1` ignoré ; ② bis visiteur → rien ; ③ **câblage** : trois vraies réponses 500 de l'hôte allument le bandeau ; ④ échec réseau non compté. Voisines réseau/identité : reprise-lectures-boot, analytics-visiteur, user-state-invite, ecritures-identite-compte, isolation-medias, smoke, conv-reparation-appartenance, message-refus-definitif, first-run, evenements-cols-visiteur (116/116 seul ; 1 rouge en parallèle ×2 = saturation). |
| Résultat | **Avant** (main pristine, RÉINJECTION) : 5/5 rouges (la sonde n'existe pas). **Après** : 5/5 ; artefact minifié : 5/5. |
| Limite restante | Pas de reconnexion automatique sur 401 (un refresh token révoqué ne se répare pas côté client : on propose la sortie). Les écritures refusées pendant la panne restent portées par leurs files respectives (messages, commentaires, publications) ; un like ou un RSVP refusé est annulé à l'écran (invariant), pas rejoué. Non mesuré en production réelle (aucune panne à disposition). |
| État | **corrigé dans le code** · déployé : non · vérifié après déploiement : non |
| PR | `claude/chantier-8-etat-serveur`. |


---

## EXP-08 — Aucun export des données du compte (portabilité) — P2

| Champ | Valeur |
|---|---|
| État constaté | La politique de confidentialité promettait « accès, portabilité » par e-mail ; aucune fonction d'export n'existait. (Le reste du point — politique datée, sous-traitants, durées, `delete-account` — a été traité les 11–14/09.) |
| Correction | Edge Function `export-account` (JWT de la personne ; `service_role` côté serveur ; plafond 2/min, 10/h via `plafond.js`) qui rend un JSON `passio-export/1` : identité Auth (e-mail, dates, métadonnées), toutes les tables où la personne a écrit (`_shared/export-compte.js`, dérivé de la liste de purge **moins** les données d'autrui — qui la suit, qui l'a bloquée, notifications qu'elle a causées — et les traces techniques), médias listés par chemin + URL publique, tables illisibles nommées, pagination 1 000 / plafond 5 000 par table (tronquées dites). Client : Paramètres → Confidentialité → « 📦 Exporter mes données (JSON) » (`exporterMesDonnees`, téléchargement local, échecs et plafond dits, sans compte réel → dit). Politique §9 : la porte est nommée. |
| Test effectué | **Éprouvé en production sur un compte jetable** (`verif-export.cjs`) : sans jeton → 401 ; avec jeton → 200, `passio-export/1`, **27 tables**, la publication et le profil semés présents, e-mail présent, 0 erreur ; 3e appel dans la minute → **429** ; compte purgé ensuite (delete-account 200). `tests/unit/export-compte.test.mjs` (3 : exclusions, lecture bornée au compte, table illisible nommée + pagination/plafond) dans `verif`. `tests/e2e/export-donnees.spec.js` (5 : porte, appel + téléchargement + bilan, échec/plafond dit, sans compte, politique). Voisines : confidentialite, cgu-consentement, suppression-compte-verdict, access-gate, ouverture-publique (69/69). |
| Résultat | **Avant** (main pristine) : 5/5 rouges. **Après** : 5/5 ; artefact minifié : 5/5. Edge Function **déployée** (v1) et vérifiée pour de vrai. |
| Limite restante | Les médias sont listés, pas embarqués (les URL `content` sont publiques ; les pièces jointes de messagerie, seau privé, ne sont pas listées — lot suivant si voulu). Pas de ZIP ni de signature. Registre des traitements et procédure de violation (72 h) : documents à écrire, hors code. |
| État | **corrigé dans le code** · Edge Function déployée et vérifiée · client déployé : non |
| PR | `claude/exp-08-export-donnees`. |


---

## TCI-05 / TCI-06 / TCI-14 — Gates de tests contournables, harnais manuels morts — P3 (chantier 10)

| Champ | Valeur |
|---|---|
| État constaté | TCI-05 : `audit-tests-creux` tenait pour preuve tout `locator(`/`click(` — un spec sur `page.setContent("<button>")` passait. TCI-06 : `audit-tests-isolation` cherchait `sansDonneesDistantes(` dans le fichier entier — un appel **en commentaire** satisfaisait le gate. TCI-14 : 10 harnais manuels (`tests/test-*.html`, `test-irl.js`, `test-time-filter.js`) référencés par rien, 2 fiches de tests manuels dans `tests/`. **Reproduits** par mutation (spec fabriqué → gate vert ; appel commenté → gate vert). |
| Correction | `audit-tests-creux.js` : les marqueurs UI ne valent preuve que sur une page RÉELLE (helper de boot ou `page.goto`) ; `page.setContent` sans boot est nommé et refusé. `audit-tests-isolation.js` : commentaires et contenu des chaînes retirés avant de chercher l'appel (`sansCommentairesNiChaines`, exporté, `main()` gardé par `require.main`). Harnais morts supprimés ; les deux fiches archivées dans `docs/archives/tests-manuels/` (référence du rapport d'architecture mise à jour). |
| Test effectué | `tests/unit/audit-tests-isolation.test.mjs` (2, dans `verif`). Mutations rejouées après correctif : spec fabriqué → **rouge**, appel commenté → **rouge** ; les 180 specs existants restent verts sur les deux gates. |
| Résultat | Gates éprouvés par réinjection. |
| Limite restante | Le retrait de commentaires/chaînes est un automate simple : un littéral regex contenant `'` ou `//` peut le tromper localement (aucun cas dans les 180 specs actuels). TCI-07 (couverture non reproductible) et TCI-13 (chiffres périmés dans les docs) restent ouverts. |
| État | **corrigé dans le code** · déployé : n/a (outillage) |
| PR | `claude/chantier-10-gates-tests`. |
