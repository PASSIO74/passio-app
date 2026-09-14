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
| État | **corrigé dans le code** · testé sur staging : non · **déployé** (fusion #375 sur ordre explicite « fusionne 375 » le 2026-09-14, commit `82aa48a9`, run 34815138597) · vérifié après déploiement : voir la ligne « Après déploiement » ci-dessous |
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
| État | **corrigé dans le code** · testé sur staging : non · déployé : non · vérifié après déploiement : non |
| PR | `claude/pro-02-identite-expediteur-serveur` — voir la PR ouverte depuis cette branche. |

---

## Points restants (ordre du plan, fiche 16 et rapport du 2026-09-13)

Aucun n'est engagé au 2026-09-14. Ils seront ajoutés ici au fur et à mesure, un chantier par PR.

| Ordre | Chantier | Identifiants | État |
|---|---|---|---|
| 2 | Séparer les comptes et sécuriser les échanges | AUTH-06 (fusionné #375), PRO-02 (PR ouverte), MSG-01/04/10, SUP-06, MOD-04 | en cours — AUTH-06 déployé, PRO-02 corrigé dans le code ; le reste non engagé |
| 3 | Fiabiliser suppression et médias | AUTH-05, SUP-10, MSG-03, CONT-11, SUP-01, ASTRA-01 | non engagé |
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
| État | **corrigé dans le code** · testé sur staging : non · déployé : non · vérifié après déploiement : non |
| PR | `claude/mod-04-msg-04-blocage-et-push` — voir la PR ouverte depuis cette branche. |

---

## MSG-04 — Origine métier et destinataire d'une push insuffisamment liés — P1 (chantier 2)

| Champ | Valeur |
|---|---|
| État constaté (base `6b004138`) | Edge Function `notify-call` : appelant authentifié (jeton), plafond (20/min, 200/h), blocage dans les deux sens — mais **aucun lien exigé** entre l'émetteur et le destinataire : tout compte connecté réveillait n'importe quel membre (`toUserId` libre), avec un texte libre (`text`, jusqu'à 200 caractères) et sous un nom libre (`fromName`) — pour un appel comme pour une « notification ». Le résidu était écrit dans CLAUDE.md (« fromName/text restent déclaratifs »). |
| Correction | `supabase/functions/_shared/lien-metier.js` (en `.js`, importé tel quel par Deno et par `node --test`) : **appel** → une conversation 1:1 commune est exigée (`conv_members` × `conversations.is_group = false`) ; **notification** → une ligne `notifications` de l'émetteur vers le destinataire, écrite dans les **2 dernières minutes** (donc acceptée par la RLS `from_id = auth.uid()` + `not is_blocked_with` + `trg_rate_limit`, ou par le trigger `follows_notifier`) — et c'est le **texte de cette ligne** qui part (entités décodées), jamais celui du corps ; **identité** → nom et emoji lus dans `profiles`. `fromName`, `fromEmoji`, `text` du corps sont ignorés (acceptés pour les anciens clients). Lien absent ou lecture en erreur → même réponse qu'un blocage (« aucun appareil abonné »), fail-closed. |
| Test effectué | `tests/unit/lien-metier.test.mjs` (7 cas, faux client scripté) : 1:1 commune ok / groupe seul, sans conversation, tiers refusés / ligne récente ok avec SON texte décodé / ligne ancienne, d'un autre, vers un autre refusées / identité bornée et repli / erreur de lecture = refus / décodage des cinq entités. Branché dans `npm run verif` (donc en CI). |
| Résultat | **7/7**. Le comportement de bout en bout de la fonction (Deno, web-push) n'est **pas** exécuté localement : le module de décision l'est, et il est celui qui sera déployé. |
| Limite restante | **La fonction n'est PAS déployée** (`supabase functions deploy notify-call`, geste manuel — la CI ne déploie pas les Edge Functions). Tant qu'elle ne l'est pas, la production garde l'ancien comportement. Après déploiement, mesurer : un appel réel sonne (1:1 existante), une notification de message pousse, une push forgée vers un tiers rend `sent: 0`. La fenêtre de 2 minutes suppose que la ligne `notifications` précède la push — c'est l'ordre des trois appelants (`supaInsertNotif`, `_notifierMessage`, `follows_notifier` + `_pousserPushNotif`) ; un appelant qui pousserait AVANT d'écrire perdrait sa push. Non mesuré : latence réelle des deux lectures ajoutées. |
| État | **corrigé dans le code** · déployé : **non — attend `supabase functions deploy notify-call`** · vérifié après déploiement : non |
| PR | `claude/mod-04-msg-04-blocage-et-push` — voir la PR ouverte depuis cette branche. |
