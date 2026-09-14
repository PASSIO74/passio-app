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
