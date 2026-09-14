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
| État | **corrigé dans le code** · testé sur staging : non · déployé : non · vérifié après déploiement : non |
| PR | `claude/auth-06-file-messages-par-compte` — voir la PR ouverte depuis cette branche. |

---

## Points restants (ordre du plan, fiche 16 et rapport du 2026-09-13)

Aucun n'est engagé au 2026-09-14. Ils seront ajoutés ici au fur et à mesure, un chantier par PR.

| Ordre | Chantier | Identifiants | État |
|---|---|---|---|
| 2 | Séparer les comptes et sécuriser les échanges | AUTH-06 (PR ouverte, ci-dessus), PRO-02, MSG-01/04/10, SUP-06, MOD-04 | en cours — AUTH-06 corrigé dans le code ; le reste non engagé |
| 3 | Fiabiliser suppression et médias | AUTH-05, SUP-10, MSG-03, CONT-11, SUP-01, ASTRA-01 | non engagé |
| 4 | Inscription et information cohérentes | AUTH-02/03/04/09/10, EXP-08/09/14/15, UXO-07, ASTRA-09 | non engagé |
| 5 | Éprouver la modération | MOD-01/02/03/09, AUTH-11, ASTRA-03 | non engagé |
| 6 | Isoler les essais, prouver une restauration | SUP-04, NET-07, EXP-01/03/04/11, TCI-03/04/15/16, ASTRA-07 | non engagé |
| 7 | Borner Sentinelle et les protections anti-abus | PIL-01/02/03/04/10, EXP-06/12, CONT-08, MOD-06/07, SUP-07, ASTRA-02/05/06/08 | non engagé |
| 8 | Supprimer les faux succès et divergences | CONT-02/06, MSG-06, IRL-04 à 13, ROB-01 à 06, PRO-04/05, ASTRA-10 | non engagé |
| 9 | Mesurer la capacité puis fixer les limites | PERF-01 à 06, PRO-01/03/06, ASTRA-04 | non engagé |
| 10 | Compléter les parcours et preuves de qualité | DEV-01 à 05, UXO-01/02/03, TCI-01/02/05 à 14 | non engagé |
