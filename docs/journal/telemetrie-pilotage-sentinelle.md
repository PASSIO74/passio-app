# Journal — Télémétrie, centre de pilotage, Sentinelle, veille et digest

> **Fiches déplacées TELLES QUELLES de `CLAUDE.md` le 2026-10-05.** `CLAUDE.md` est rechargé à
> chaque session et avait atteint 410 000 caractères (Claude Code alerte dès 40 000) : il ne garde
> plus que les règles qui valent partout. Ici vivent le récit, les mesures et les pièges de chaque
> lot — **à lire AVANT de toucher au domaine.** Un commentaire du code qui cite « CLAUDE.md § … »
> désigne une fiche de ce dossier : `grep -rn "<début du titre>" docs/journal/`.
> **Nouvelle fiche** : à la FIN du fichier de son domaine, titre `## <emoji> <TITRE> (AAAA-MM-JJ)`.
> Si elle porte une règle qui vaut pour TOUTE modification, une seule ligne de plus dans la section
> « Journal par domaine » de `CLAUDE.md` — jamais la fiche elle-même.

## Sommaire

- 🤖 SENTINELLE AUTONOME — la chaîne tourne dans GitHub, et voici COMMENT ELLE MEURT (2026-09-09)
- 🤖 SENTINELLE v2, VEILLE ET DIGEST — ce qui tourne seul pendant les mois de test (2026-09-18)
- 🔄 PWA — « newestWorker is null » : PREMIER défaut réparé de bout en bout par la chaîne autonome (2026-09-09)
- 📡 TÉLÉMÉTRIE — UN JETON DE SESSION MORT FAISAIT JETER LES LOTS (2026-09-16)
- 📊 ANALYTICS `analytics_events` — 271 refus **401** en production (2026-09-09)
- 🛰️ LA TÉLÉMÉTRIE SORT DU TEMPS RÉEL — 91 % DE CE QUE LA BASE ÉMET, POUR UN SEUL ABONNÉ (2026-09-20)
- 🕵️ TRAFIC HORS PUBLIC — 15 « VISITEURS » SUR 19 ÉTAIENT NOS PROPRES CONTRÔLES (2026-10-05)

---

## 🤖 SENTINELLE AUTONOME — la chaîne tourne dans GitHub, et voici COMMENT ELLE MEURT (2026-09-09)

`.github/workflows/sentinelle-autonome.yml` (cron horaire) lit `client_errors`, classe les causes (`scripts/sentinelle-detecter.mjs`, fonction PURE, 8 verrous dans `tests/unit/`) et ouvre une issue `[SENTINELLE]` étiquetée `claude` + `sentinelle`. `claude-code.yml` écrit alors le correctif, ouvre la PR, et arme l'auto-fusion. Ni PC allumé, ni geste humain.

⚠️ **`SENTINELLE_TOKEN` EST CE QUI REND LA CHAÎNE POSSIBLE, ET C'EST AUSSI SON POINT DE MORT.** Un événement produit par le `GITHUB_TOKEN` intégré NE DÉCLENCHE AUCUN workflow (règle anti-boucle de GitHub) : une issue ouverte avec lui n'est jamais traitée, et une PR ouverte avec lui n'obtient JAMAIS de CI — donc l'auto-fusion ne peut pas aboutir. Le jeton personnel agit au nom de PASSIO74, ce que `claude-code.yml` exige (`github.event.issue.user.login == 'PASSIO74'`). Le repli sur `GITHUB_TOKEN` est conservé partout : sans le secret, le canal REVIENT à son comportement d'avant, il ne casse pas.

⚠️ **L'AUTO-FUSION N'EST ARMÉE QUE POUR LA SENTINELLE**, à TROIS conditions cumulatives : label `sentinelle` + `author_association` ∈ {OWNER, MEMBER} + préfixe `[SENTINELLE]`. Une tâche demandée par Benjamin reste sous ses yeux. Le premier jet ne testait que le titre : un titre se recopie par distraction, un label est un geste délibéré (revue de sécurité du 2026-09-09).

### ⚠️ LES QUATRE FAÇONS DONT CE SYSTÈME MEURT — deux bruyantes, une SILENCIEUSE, une qui SE BLOQUE TOUTE SEULE

**① Le jeton expire (90 j).** L'étape « Le jeton est-il vivant ? » appelle `gh api user` et ÉCHOUE, en nommant la page de renouvellement. GitHub envoie un e-mail d'échec au propriétaire. **BRUYANT** — c'est délibéré : sans cette étape, le canal rendrait « rien à signaler » pour toujours.

**② La clé `service_role` change.** `sentinelle-detecter.mjs` sort en `exit 2` au lieu de rendre un verdict vide. **BRUYANT**, même raison.

**③ GitHub DÉSACTIVE les workflows `schedule` après 60 jours sans activité dans le dépôt.** Aucune erreur, aucun e-mail : les exécutions cessent, simplement. **SILENCIEUX, et c'est le plus dangereux** — le symptôme est identique à « tout va bien ». Le contrôle ne peut pas venir de l'intérieur : un workflow qui ne tourne plus ne peut pas s'en plaindre.

⚠️ **« TOUTES LES HEURES » N'EST PAS TENU PAR GITHUB, ET LE SEUIL DE 2 h ÉCRIT ICI ÉTAIT FAUX.** Mesuré le 2026-09-09 sur `sentinelle-distante.yml`, même cron horaire, en place depuis le 2026-08-21 : **456 créneaux demandés, 188 exécutions réelles** (41 %), avec des écarts observés de **4 h à 5 h** — 09h48, 14h37, 18h38 le même jour — et **jamais à la minute demandée**. Un `cron` est une DEMANDE que GitHub sert quand il a de la place, et il abandonne purement le créneau sous charge. Le seuil de contrôle est donc **« moins de 6 h »**, jamais 2 h : à 2 h l'alerte se déclencherait plusieurs fois par jour sur un canal parfaitement sain, et **une alarme qui crie à tort finit par ne plus être lue** — elle aurait remplacé une panne silencieuse par une panne ignorée. Corollaire à ne pas oublier : **un défaut n'est PAS relevé dans l'heure**, il l'est dans la demi-journée.

**④ IL SE BLOQUE TOUT SEUL SUR UN DÉFAUT QU'IL VIENT DE FAIRE CORRIGER (mesuré le 2026-09-10, corrigé le jour même).** La chaîne ouvre #312 (« HTTP 409 sur POST /rest/v1/profiles ») à 23h22, produit la PR #313, fusionnée et **déployée à 23h47** ; l'issue est fermée à 04h43. À **06h05 la sentinelle rouvre le même défaut, mot pour mot** (#316) — parce que sa fenêtre de 24 h porte encore les 9 occurrences d'**avant** le correctif (la dernière à 14h31 la veille). ⚠️ **Le détecteur ne connaît pas la date du correctif** : des lignes anciennes et un défaut vivant se ressemblent trait pour trait. ⚠️ **Et ce n'est pas un désagrément, c'est un ARRÊT** : « une enquête à la fois » compte les issues `[SENTINELLE]` **ouvertes**, donc ce faux doublon interdit de détecter quoi que ce soit d'autre — un vrai défaut survenu ce matin-là serait resté invisible, **pendant que le canal avait l'air de travailler**. C'est la panne la plus trompeuse des quatre : elle ressemble à de l'activité. ⚠️ **La règle de dédup porte sur la DERNIÈRE OCCURRENCE, jamais sur le titre seul** (`dejaCorrige`, `scripts/sentinelle-detecter.mjs`) : on se tait uniquement si **toutes** les occurrences précèdent la fermeture d'une enquête identique ; qu'une seule lui soit postérieure et l'on rouvre — la récidive est précisément le signal. Taire un titre pendant N heures aurait supposé que le défaut ne récidive pas, ce que personne ne sait. ⚠️ **La liste des enquêtes fermées se lit par LABEL** (`--label sentinelle`), **jamais par `--search "…" in:title`** : l'index de recherche de GitHub retarde — mesuré, #316 en était absente des heures après sa création — et une dédup bâtie sur un index en retard laisse passer très exactement le doublon qu'elle devait arrêter. ⚠️ `titreIssue()` est la **SEULE** source du titre : le workflow le réécrivait en toutes lettres de son côté, et deux constructions du même titre finissent toujours par diverger — une dédup qui compare des titres divergents ne dédoublonne plus rien, en silence. Verrous : `tests/unit/sentinelle-detecter.test.mjs` (26, dont le cas réel et sa récidive, éprouvés par RÉINJECTION).

### ⚠️ ET L'ANGLE MORT, QUI LUI NE MOURRA JAMAIS

Ce canal ne voit QUE ce qui lève une erreur JavaScript. Bouton qui n'émet plus rien, résultat faux en HTTP 200, télémétrie interrompue : zéro ligne dans `client_errors`, donc zéro issue — **et ça ressemble exactement au calme**. Le workflow l'écrit lui-même dans son résumé de run. **Le silence de la sentinelle n'est jamais une preuve de santé** ; elle se lit sur l'usage réel, pas sur l'absence d'alerte.

Coupe-circuit : une issue ouverte dont le titre contient `[SENTINELLE PAUSE]` arrête tout le canal au tour suivant (même convention que `sentinelle-distante.yml`). Une enquête à la fois : tant qu'une issue `[SENTINELLE]` est ouverte, aucune autre n'est créée.

## 🤖 SENTINELLE v2, VEILLE ET DIGEST — ce qui tourne seul pendant les mois de test (2026-09-18)

Chantier « autonomie » (PR #489, #490, #492, #493 et la PR veille) : Benjamin lit ses e-mails GitHub, chaque issue porte le geste à faire, le reste tourne seul. Trois docs font foi, ce paragraphe n'est qu'un index.

- **Chaîne GitHub v2** (`docs/SENTINELLE_AUTONOME.md`) : l'issue `[SENTINELLE]` naît avec le SEUL label `sentinelle`, `claude` est posé 8 s plus tard (la création à deux labels lançait trois runs et en perdait un sur trois). Un **veilleur** relance UNE fois une enquête sans run après 20 min et la remet à un humain (label `humain`) après 6 h. La dédup est datée sur le **déploiement** et la version servie, plus sur la fusion ; une récidive après deux correctifs déployés ouvre `recidive` + `humain`, jamais `claude`. Chaque correctif écrit une **fiche** `docs/sentinelle/<n>.md` (cause, correctif, verrou, leçon) ; le job `retour-issue` de `deploy.yml` commente « déployé » ou ROUVRE l'issue avec `humain`. Lecteur en panne → `[SENTINELLE MUETTE]`.
- **Veille de production et digest** (`docs/VEILLE_PRODUCTION.md`) : `veille-production.yml` (cron 30 min, servi en pratique toutes les 2 à 5 h) mesure ce que la sentinelle ne voit pas — télémétrie humaine silencieuse en heures actives, inscriptions jamais confirmées, erreurs ≥ 5 × la médiane, 5xx et refus en série, commit servi ≠ `main`, cron mort ou désactivé, base, jetons qui expirent — et n'ouvre qu'UNE issue `[VEILLE]` (label `veille`, jamais `claude`), refermée seule. `digest.yml` (matin) ouvre `[DIGEST]` — « ce qui t'attend / ce que les machines ont fait » — seulement s'il y a un geste à faire, ou le lundi.
- **Centre de pilotage** (PR #493) : l'œil se surveille (DB, canari, realtime, ingestion, persistance) et lit GitHub (vie des six crons, issues par label, PR critiques sans contre-revue) ; carte « Ce qui t'attend » en tête de l'Accueil et du Pilot mobile ; ce qui a besoin du poste (disque, CLI Claude, superviseur) sort par une issue `[POSTE]`. Sur le poste : `DASH_SENTINEL_REPAIR=off` (la réparation locale n'a jamais abouti sur un dépôt sale), `DASH_NOTIFY_GITHUB=true`, `DASH_SENTINEL_RELAIS_GITHUB=true` (un défaut réel vu localement devient une issue `[SENTINELLE]`), `PASSIO_PUBLIC_URL`.
- **Ce que Benjamin fait, et ne fait pas** : `docs/RUNBOOK_MOIS_DE_TEST.md` (un geste par signal, les trois gestes du poste, la cadence, ce qu'il ne faut pas faire).

⚠️ **La contre-revue est ancrée sur le SHA de tête** : après TOUT push sur une PR du périmètre critique, la reposer (`gh pr review <n> --comment --body-file …`), sinon « Gouvernance critique » refuse et l'auto-fusion attend pour toujours.

⚠️ **Un faux binaire posé sur le PATH d'un banc délègue au vrai par un chemin ABSOLU.** Le faux `jq` de `tests/unit/sentinelle-workflows.test.mjs` rappelait `"$JQ_BIN"`, qui vaut `jq` sur le runner (JQ_BIN absent) : il s'est rappelé lui-même, et deux runners de suite sont morts 36 s après le début des tests, « shutdown signal », sans un test rouge — ce qui ressemble à un incident GitHub et n'en est pas un. Rejouer un tel banc sans `JQ_BIN` avant de pousser.

## 🔄 PWA — « newestWorker is null » : PREMIER défaut réparé de bout en bout par la chaîne autonome (2026-09-09)

Erreur en production → issue `[SENTINELLE]` #304 → correctif et verrou écrits par le canal → PR #305, 13 contrôles verts → fusion → déploiement. **Aucun geste humain sur le chemin technique.** À conserver comme référence de ce que la chaîne sait faire seule.

Le défaut : `js/pwa-detect.js` demandait `registration.update()` au démarrage **et toutes les 60 s**. Sur WebKit (iOS/Safari), `update()` **REJETTE** avec « newestWorker is null » quand la registration n'a plus AUCUN worker (`installing`, `waiting` et `active` tous nuls : désinscription, worker devenu redondant, stockage du site vidé).
⚠️ **`update()` REND UNE PROMESSE, et le `try/catch` qui entoure le bloc NE L'ATTRAPE PAS** — elle rejette plus tard, hors de la pile. Le rejet partait donc dans `unhandledrejection` (`js/platform.js`) → `client_errors`, **sans le moindre effet pour l'utilisateur** : du bruit pur, qui polluait précisément le tableau de bord servant à voir les vrais défauts. Un `try/catch` autour d'un appel qui rend une promesse ne garde rien : c'est la faute de famille à chercher partout ailleurs.
⚠️ **La minuterie garde une référence sur la MÊME registration** : elle reposait la question chaque minute — d'où 5 occurrences en 24 h sur un seul compte. Un défaut périodique se compte en occurrences, pas en gravité.
⚠️ **UN SEUL POINT D'APPEL** : `majSilencieuse(r)` ① n'appelle `update()` que s'il reste un worker à mettre à jour, ② avale le rejet. La vérification immédiate ET la minuterie passent par lui — un second appel direct rouvrirait le défaut à lui seul, ce que le verrou ④ mesure à la SOURCE.
Verrou : `tests/e2e/pwa-maj-silencieuse.spec.js` (4), dont ① et ② éprouvés par RÉINJECTION.

⚠️ **CE QUE LA CHAÎNE NE SAIT PAS FAIRE, ET QUI SE VOIT ICI** : les consignes de l'issue lui interdisent d'écrire ailleurs que dans `js/*.js`, `styles.css`, `index.html`, `sw.js`. Elle produit donc un correctif et un verrou, **jamais une fiche**. La leçon reste dans un message de commit que personne ne relit — cette section-ci a été écrite à la main. **Un correctif automatique sans mémoire écrite rejoue la même enquête au défaut suivant** : tant que ce point n'est pas réglé, toute réparation de la sentinelle demande qu'on vienne écrire sa fiche après elle.

## 📡 TÉLÉMÉTRIE — UN JETON DE SESSION MORT FAISAIT JETER LES LOTS (2026-09-16)

Pilotage : « Lot de télémétrie rejeté (auth) après 6 essais (HTTP 401) », 4 fois, **1 appareil, 0 utilisateur**, avec cinq autres 401 de la même minute (`user_state`, `push_subscriptions`, `events`, `event_attendees`, `auth/v1/user`). **« 0 utilisateur » est le discriminant** : les lignes qui SONT arrivées portaient `user_id` NULL, donc `window.MY_UID` n'était pas un uuid — l'application ne se considérait PAS connectée — et pourtant `localStorage` portait encore un `sb-<ref>-auth-token` (déconnexion restée hors ligne, session révoquée : la famille documentée dans « Se connecter à un compte déjà créé »). `telemetry.js` joignait ce jeton mort à chaque lot (`authToken` relisait le stockage sans demander à l'app), PostgREST refusait (401), et après la grâce de 6 essais le lot était **JETÉ** — alors que ses lignes étaient toutes désattribuées et que la clé anon suffisait.
⚠️ **LE JETON SE CHOISIT D'ABORD, LES LIGNES S'ALIGNENT** : `authToken(cfg)` rend la clé anon dès que `authUserId()` est nul, et `flush` désattribue toute ligne quand la clé anon part (sous `auth.uid()` NULL, un seul uuid fait refuser le lot entier — policy `user_id IS NULL OR user_id = auth.uid()`). ⚠️ **LA DÉCISION VOYAGE AVEC LA REQUÊTE** (`opts.viaAnon`, `opts.jeton`) : le chemin `keepalive` ignore `sending`, deux envois peuvent être en vol, et un rejet se juge sur ce que SON lot portait — un drapeau global lu à la réponse aurait jeté un lot parti sous jeton en le croyant parti sous anon (trouvé par `audit-passio`, pas par le banc). ⚠️ **ON DÉSATTRIBUE PLUTÔT QUE DE PERDRE, À LA GRÂCE AUSSI** : après `AUTH_MAX_RETRIES`, le jeton refusé est mémorisé (`jetonRefuse`) et écarté **tant que le SDK n'en a pas écrit un autre** — sinon chaque lot suivant repaierait six essais et ~30 s ; le lot repart sous anon avec un `connectivity/auth_desattribue` (severity `info`, ce n'est pas un rejet) et n'est jeté (`server_reject`) que si la clé anon est refusée elle aussi. ⚠️ **Le SDK peut retirer lui-même le jeton mort en cours de route** (rafraîchissement définitivement refusé) : le repli arrive alors par « pas de session persistée » — les deux chemins convergent, et le banc ne suppose pas lequel est pris.
⚠️ **`MY_UID` EST UN `let` DE PORTÉE SCRIPT, `window.MY_UID` N'EN EST PAS LE REFLET.** `boot()` posait `MY_UID = session.user.id` sans toucher `window.MY_UID`, que telemetry.js et platform.js (`client_errors.uid`) lisent ; emoji-misc le pose depuis `passio_uid` 100 ms après le chargement, donc AVANT la réponse de `getSession()`, et avec l'ancienne valeur. Les TROIS points d'affectation (boot, `onAuthStateChange`, `onbDoAuth`) écrivent désormais les deux — le troisième avait échappé au premier jet, `audit-passio` l'a relevé. Un lecteur de `window.MY_UID` reste un lecteur d'une COPIE : préférer `MY_UID` nu dans un `page.evaluate`, comme `_activeFeedPassions`.
⚠️ **Les cinq autres 401 de cet appareil ne sont pas rouverts ici** : ce sont les signatures du rôle anonyme déjà refermées les 12–13/09 (`_compteAuthReel`, `_uidEstUnCompte`, garde push) ; un appareil qui les produit encore tourne un `app.js` d'avant ces gardes (PWA : l'ancien script vit jusqu'au prochain démarrage complet) ou porte cette divergence `MY_UID`/`window.MY_UID`. Se mesure au `app_version`… qui valait `2026.08.0` **en dur depuis août** (`PASSIO_APP_VERSION` jamais posé) : sans version réelle, « ancien client » et « défaut vivant » étaient indiscernables au pilotage. **FERMÉ le même jour** : `telemetry.js` lit le contrat de release que `scripts/build.js` pose avant lui (`window.PASSIO_RELEASE`, le même que `/release.json`) — le commit déployé sur 8 caractères, sinon `b<buildId>` ; hors artefact (`npm run serve`, bancs) : `dev`. ⚠️ **Deux déploiements sont deux versions**, et l'empreinte des bugs du pilotage inclut la version (`bugFingerprint`) : un défaut vivant à travers un déploiement fait DEUX lignes, une par version — c'est ce qui permet de lire « n'existe plus que sur l'ancienne ». Verrou : `dist-build.spec.js` (+1, sur l'ARTEFACT, éprouvé par réinjection).
Verrou : `tests/e2e/telemetrie-jeton-mort.spec.js` (2), serveur factice FIDÈLE à la policy (jeton mort → 401 ; anon + uuid → 401), éprouvé par RÉINJECTION (2 rouges). ⚠️ Le cas ⑪ de `reprise-lectures-boot` prenait « le dernier événement api » et rougissait 2 fois sur 3 en local (les reprises `pageshow`/`online` en émettent dans la même fenêtre) : il ne retient plus que l'événement du faux hôte.

## 📊 ANALYTICS `analytics_events` — 271 refus **401** en production (2026-09-09)

Second étage du défaut du matin même. `supaTrack` (app-08) exigeait déjà un **uuid** (`MY_UID` ne prouve pas qu'un compte existe), mais **un uuid ne prouve pas qu'une SESSION est vivante** : `localStorage.passio_uid` survit à la fin de session (déconnexion sur un autre appareil, jeton de rafraîchissement révoqué, stockage du SDK vidé), et un onglet endormi porte un jeton **expiré**. Le SDK partait alors avec la seule clé anon → `auth.uid()` NULL → la policy `analytics_insert_own` refuse.
⚠️ **UN 401 N'EST PAS UN 403** : PostgREST rend **401** quand le jeton est absent ou invalide, **403/42501** quand la RLS refuse une requête authentifiée. Lire le CODE avant d'accuser une policy — ici la policy était juste, c'est le jeton qui manquait. `window._supaReal` ne dit QUE « le vrai SDK est chargé », jamais « un compte est connecté ».
`_analyticsSessionUtilisable(uid)` lit la session persistée par le SDK (`sb-<ref>-auth-token`, v1 et v2), même source et même technique que `telemetry.js` (qui a réglé le sien le 2026-08-15) : jeton présent, non expiré (marge d'horloge 10 s), et portant **le même compte** que la ligne à écrire. Jeton périmé → `_analyticsNudgeRefresh()` (anti-rafale 15 s, `getSession()` dédupliqué par le verrou interne du SDK) et **l'événement est ABANDONNÉ** — ces analytics sont fire-and-forget, mieux vaut perdre un `screen_view` que rejouer une rafale.
⚠️ **LE SDK NE LÈVE PAS SUR UN REFUS** : `.then(function(){}, function(){})` ne regardait RIEN, le refus était deux fois invisible. On lit `{ error }` et un **coupe-circuit** tait les analytics 10 min après un refus (`window._analyticsMuetJusqua`), **levé par `SIGNED_IN`/`TOKEN_REFRESHED`** — un silence ne doit pas survivre à la cause qu'il protégeait.
⚠️ `analytics_events` **ne tolère PAS `user_id NULL`** (contrairement à `telemetry_events`) : la garde est en AMONT, on n'émet rien. Ne pas « réparer » en ouvrant une policy à `anon` — ce serait une table ouverte à l'écriture sans compte.
Verrou : `tests/e2e/analytics-visiteur.spec.js` (8), dont ⑤ (uuid sans session), ⑥ (jeton expiré + un seul nudge), ⑦ (session d'un autre compte) et ⑧ (coupe-circuit : 1 envoi, pas 21).

## 🛰️ LA TÉLÉMÉTRIE SORT DU TEMPS RÉEL — 91 % DE CE QUE LA BASE ÉMET, POUR UN SEUL ABONNÉ (2026-09-20)

Demande de Benjamin : « augmenter **considérablement** ces chiffres, sans investir ». Les trois volets
précédents grignotaient des postes réels sans changer l'ordre de grandeur, parce qu'aucun ne touchait
le premier poste de la base. Dossier : `docs/CAPACITE_TELEMETRIE_HORS_TEMPS_REEL_2026-09-20.md`.

⚠️ **UNE SEULE TABLE FAIT 91,4 % DE TOUT CE QUE LA BASE RÉPLIQUE.** `pg_stat_user_tables`, somme
insert+update+delete sur les DOUZE tables publiées : `telemetry_events` **481 554** sur **526 756**.
Les onze autres réunies font 8,6 % (`profiles` 20 748, `posts` 6 934, `video_lives` 6 583,
`notifications` 5 901, `conv_messages` 1 901, les six dernières 3 135). Et son abonné, c'est **UN
client** — `dashboard/server/ingest.js`, le pilotage, sur le poste de l'éditeur. **Neuf dixièmes du
travail temps réel de la production servaient un seul tableau de bord.**

⚠️ **CE QUE J'AI CRU POUVOIR FAIRE ET QUI EST IMPOSSIBLE — arrêté AVANT d'écrire du SQL.** En croisant
« publié » et « écouté », j'ai mesuré **229 613 changements (43,6 %) portant des opérations que
PERSONNE n'écoute** (le DELETE de la purge de télémétrie, l'INSERT et le DELETE de `profiles`, le
DELETE de `posts`…). Restreindre les opérations table par table est **IMPOSSIBLE** : `pubinsert`,
`pubupdate`, `pubdelete`, `pubtruncate` sont des colonnes de **`pg_publication`** — `publish` est
réglable PAR PUBLICATION, jamais par table ; `pg_publication_rel` ne porte qu'un filtre de lignes
(`prqual`) et une liste de colonnes (`prattrs`). Vérifié sur la prod (PG 17.6). Ce gaspillage est donc
**réel et inatteignable par ce chemin** ; il disparaît ici parce que la table qui en porte 89 % sort.

⚠️ **CE N'EST PAS UN DÉSAVEU DE LA MIGRATION DU 2026-09-19, QUI AVAIT RAISON.** Elle écrit que retirer
cette table « aurait éteint le tableau de bord en direct, SANS une erreur » — repli silencieux sur le
polling, symptôme « c'est un peu en retard », jamais « c'est cassé ». **Le raisonnement tient
toujours** : c'est pourquoi le lot ne se contente pas de retirer la table — le polling du pilotage
**cesse d'être un secours pour devenir le chemin NOMINAL**, et l'alerte « Realtime décroché » est
désarmée. On ne dégrade pas en silence, **on change de mécanisme**.

⚠️ **L'ALERTE EST DÉSARMÉE EXPLICITEMENT (`realtimeUtilise: false`), PAS PAR ACCIDENT** — et **la
première rédaction ne gardait ce drapeau NULLE PART** : `ingest.test.js` lisait le champ,
`observation-alerts.js` le lisait aussi, mais **aucun test ne reliait les deux** (le fixture `ingOk`
ne l'a jamais porté), donc retirer la garde laissait **577/577 verts**. C'est la faute
`_notifierMessage`, rejouée côté pilotage, dans le lot même qui invoque la règle. Verrou ⑪ de
`observation-alerts.test.js` : il passe `ingestState()` **réel** à `evaluer()` réel, avec trois
statuts hostiles injectés, et rougit sur le retrait de la garde.
⚠️ **ET DÉSARMER L'ALERTE NE SUFFISAIT PAS : L'ÉCRAN, LUI, DISAIT « SECOURS » POUR TOUJOURS.** Trois
surfaces de `dashboard/public/js/app.js` (bandeau d'Accueil, page Sources, détail « Collecte »)
lisaient `ing.realtimeOk`, devenu une variable **sans aucune affectation** — elle ne pouvait plus
rapporter que sa valeur initiale, « décroché ». Le pilotage aurait affirmé être en mode dégradé à
chaque chargement, et le prochain lecteur serait parti chercher une panne inexistante : **l'alarme
déplacée de l'alerte vers l'écran**, très exactement le mode d'échec que ce lot invoque.
`realtimeOk`, `lastRealtimeStatus` et `realtimeLastError` sont **RETIRÉS de l'état** avec leurs trois
lecteurs, et `ingestAlive` passe de `realtimeOk || pollingOk` à `pollingOk` — une disjonction dont un
terme est mort est une disjonction complaisante. **Cible supprimée = tout ce qui la vise part avec**,
y compris le verrou qui exigeait l'inverse la veille.
⚠️ **ET LE POLLING DEVENU UNIQUE A PERDU SON SECOND FILET, CE QUE LE LOT NE DISAIT PAS.**
`received_at` a `DEFAULT now()`, pris au **début de la transaction**, alors que la ligne n'est visible
qu'à sa **validation** : une ligne validée en retard passe sous la marque et n'est jamais rattrapée
par `gt(marque)`. `RECOUVREMENT_MS` valait **2 s, soit moins que `POLL_MS`** — et tant que le canal
existait, ça ne se voyait pas : lui décode le WAL, il est insensible à `received_at` et livrait la
ligne quand même. **Retirer le canal transforme une faiblesse théorique en perte silencieuse sans
recours.** Porté à **15 s** (> `POLL_MS`, > toute validation plausible), coût : trois relectures par
ligne à 1,0 ms. Et `limit(500)` est un **plafond de débit** — `LOT_MAX / (POLL_MS/1000)` — porté à
2 000, soit 400 lignes/s : au-delà le pilotage prend un retard qu'il ne rattrape jamais, **et rien ne
le dit**. C'est la vraie borne de mise à l'échelle du chemin devenu nominal.
⚠️ **LA FENÊTRE DU CANARI EST DE 90 SECONDES, PAS DE 15 MINUTES.** 15 min est `CANARY_EVERY_MS`, la
période d'**ENVOI** ; `CANARY_DEADLINE_MS` (90 s) est ce qui décide qu'un canari est manqué. La marge
sur le polling est donc **18×**, pas 180× — et le paragraphe qui justifiait de ne pas resserrer la
cadence s'appuyait sur le mauvais nombre : quelqu'un qui porterait `POLL_MS` à 120 s « puisqu'on a
15 minutes » ferait basculer le canari en UNAVAILABLE.
⚠️ **LA CADENCE NE CHANGE PAS (5 s), ET C'EST DÉLIBÉRÉ** : le polling est mesuré à **1,0 ms** par
lecture, 5 s suffisent à une console de supervision, et accélérer « pour compenser » aurait ajouté du
coût pour une latence imperceptible. ⚠️ **Le canari n'est pas concerné** : il est observé par
`ingestOne`, point de passage UNIQUE de tout événement entrant (historique, realtime, polling).

⚠️ **ORDRE D'APPLICATION, NON NÉGOCIABLE** : ① le pilotage déployé sur le poste, ② *seulement ensuite*
la migration. Dans l'autre sens, le pilotage garderait une souscription qui passe `SUBSCRIBED` et ne
livre plus jamais rien — le défaut muet que `audit:realtime` existe pour empêcher.
**APPLIQUÉE EN PRODUCTION LE 2026-09-20 — et mesuré, pas déduit** : `pg_publication_tables` rend
**11** tables, `telemetry_events` absente, les onze du produit intactes. L'ordre a été tenu : pilotage
relancé sur le poste (pid neuf sur 4610) AVANT la migration. Ne pas rouvrir ce point.

⚠️ **ET ELLE N'EST PAS PASSÉE PAR `migration:appliquer` — LA BARRIÈRE EST INUTILISABLE PAR UN
PROPRIÉTAIRE SEUL, ET C'EST UNE DÉCOUVERTE, PAS UN INCIDENT.** Sur une cible protégée, ASTRA-51/61
exige une preuve de revue VÉRIFIÉE chez GitHub, et elle cumule trois conditions qu'un dépôt à UN humain
ne peut pas satisfaire : ① l'état `APPROVED` (un `COMMENTED`, « même conforme, n'approuve rien ») ;
② un relecteur inscrit dans `.passio/migrations/relecteurs-autorises.json`, **qui est VIDE** — donc
« personne n'est autorisé », refus par construction ; ③ **un relecteur DISTINCT de l'auteur de la PR**,
or toutes les PR de ce dépôt sont sous le compte PASSIO74, et GitHub interdit d'approuver sa propre PR.
Les trois sont justes prises une à une ; ensemble elles ferment le canal. **Une barrière qui suppose un
second humain dans un projet qui en a un n'est pas franchissable, elle est contournée** — et un garde-fou
qu'on contourne à chaque migration ne garde plus rien.
⚠️ **LA SORTIE PRISE EST DOCUMENTÉE, CE N'EST PAS UN CONTOURNEMENT** : ADR-012 définit le canal ③ comme
« `psql` **ou le SQL Editor** » — `migration:appliquer` en est UNE implémentation, pas la définition. Le
contenu exact du fichier a été relu par Benjamin avant le coller (c'est ce que la barrière cherchait à
garantir), et `--sans-attestation` n'a PAS été employé : il est refusé sur cible protégée, et l'employer
aurait été se rendre vert en réécrivant le test.
⚠️ **DEUX SORTIES POSSIBLES, À TRANCHER ET PAS À REDÉCOUVRIR** : inscrire un SECOND compte relecteur
(geste de gouvernance : PR + revue), ou assumer l'éditeur SQL comme voie normale pour un dépôt à un
humain et le DIRE dans ADR-012 — aujourd'hui le dépôt outille un chemin que personne ne peut emprunter.
⚠️ **Et l'empreinte du fichier relu est un acquis à garder** : `sha256` du `.sql` au commit contre-revu
(`a3210ec`) = celui du fichier appliqué (`76c12ca0…`). C'est la seule partie de la barrière qui a
fonctionné de bout en bout, et elle vaut indépendamment du reste.

⚠️ **ET MON CHIFFRE-PHARE ÉTAIT FAUX — RÉÉCRIT LE JOUR MÊME, APRÈS MESURE.** J'annonçais « 91 % du
TRAVAIL de réplication disparaît, ce poste tombe de 68,9 % à ~6 %, la base fait le tiers du travail ».
C'était une **extrapolation** qui confondait *part des changements* et *part du travail*, et qui
contredisait la fiche du **MÊME JOUR** sur l'amplification (facteur **×13**). `audit-passio` l'a
relevé après que les gates étaient vertes ; la mesure lui a donné raison. **Mesuré** : la requête de
décodage WAL est appelée **7 201 615** fois pour **1 542 479** changements de lignes *tous schémas
confondus* (×4,67) et 527 675 sur les tables publiées (**×13,65**) — **elle est donc appelée plus
souvent qu'il n'existe de changements dans TOUTE la base**, donc son coût porte un multiplicateur :
le nombre d'abonnements qui matchent chaque changement. Et `telemetry_events`, avec **UN** abonné,
est précisément la table qui **ne le paie pas**. Le gain honnête est un **encadrement** : **6,7 %**
du poste temps réel (**4,6 pt** de CPU) si le coût suit (enregistrements × abonnements), 91,3 %
(62,9 pt) s'il suit les seuls enregistrements — **et la borne basse est la plausible**, puisque le
multiplicateur est mesuré. **Ordre de grandeur du lot : 4 à 5 points de CPU, pas 63.**
⚠️ **LE REMÈDE RESTE BON, SA JUSTIFICATION CHANGE** : ce n'est plus « le plus gros levier du
projet », c'est « retirer d'une publication une table sans aucun abonné qui porte neuf dixièmes de ce
qu'elle émet » — gratuit, sans risque, et c'est un terme qui **grandit avec les utilisateurs**.
⚠️ **LA MESURE D'ACCEPTATION EST À FAIRE APRÈS LE GESTE** (relever `calls`/`total_exec_time` de la
requête de décodage, comparer 24 h après) : **tant qu'elle n'est pas relevée, ce lot n'a pas de gain
mesuré, il a un encadrement.**
⚠️ **VÉRIFIER LES FENÊTRES DE COMPTEURS AVANT DE COMPARER DEUX SOURCES** : `pg_stat_database.stats_reset`
(07/05) et `pg_stat_statements_info.stats_reset` (13/05) — six jours d'écart sur 130, donc le ×13
n'est pas un artefact de période. C'est le contrôle qui manquait le matin même, quand un
`sum(...) over ()` posé après un `where` avait rendu 69 % pour 5,92 %.
⚠️ **LA LEÇON N'EST PAS « UNE CAUSE FAUSSE », C'EST UNE UNITÉ FAUSSE** : je mesurais des
*changements* et j'annonçais du *travail*. **Une part se lit contre la grandeur qu'on prétend
réduire, jamais contre un proxy commode.**
⚠️ **CE QUE ÇA NE FAIT PAS** : la forme quadratique demeure sur les onze tables du produit — à 2 000
connectés, une publication reste évaluée 2 000 fois. ⚠️ **Et depuis la re-mesure, on ne peut plus
écrire qu'elle « devient » dominante** : avec un multiplicateur de 13, elle l'était **déjà avant ce
lot** (8,6 % des changements, mais ~93 % des lignes décodées). S'abonner à ce qui est VISIBLE reste
un changement d'architecture, pas un réglage — **c'est le mur, et il est devant, pas derrière.**

⚠️ **LE COMMENTAIRE QUI EXPLIQUE LA RÈGLE DÉCLENCHE LA RÈGLE — TROISIÈME FOIS EN UNE JOURNÉE.** La gate
`audit:realtime` s'était attrapée elle-même le 19/09, puis avait attrapé le commentaire de
`charge.mjs` le matin même ; ici c'est le verrou de source du pilotage qui rougit parce que le
commentaire d'`ingest.js` **cite** `admin.channel(` pour expliquer le retour arrière. Correctif
durable : **un verrou de source qui cherche un jeton RETIRE LES COMMENTAIRES D'ABORD** — sinon il
interdit d'expliquer ce qu'il garde, et un verrou qu'on ne peut pas documenter finit désarmé.

⚠️ **`alter publication … drop table` N'EST PAS DU DDL DE TABLE**, et `audit:tables-compte` le prenait
pour tel : elle refusait cette migration — qui ne touche AUCUNE table — en réclamant « un identifiant
de compte » sur une table qu'elle n'avait jamais lue. **Un faux positif sur une gate de sécurité coûte
plus qu'un trou** : il pousse à réécrire la migration pour lui plaire, ou à l'inscrire au socle — deux
façons de la désarmer en croyant la respecter. La forme est neutralisée avant la recherche de DDL, et
le verrou ⑧ exige qu'un **vrai** `drop table` reste signalé.

⚠️ **UN BANC DE MIGRATION NE DOIT PAS COMPARER SON ÉTAT FINAL AU FICHIER D'AUJOURD'HUI.**
`migration-realtime-publication.test.sh` ⑦ comparait ses 12 tables à `realtime-publication.json` : il
rougissait dès que la nouvelle migration en retirait une. Lui reprocher de ne pas contenir l'avenir n'a
pas de sens — son attendu porte désormais « le JSON + `telemetry_events` », et c'est le banc du 20/09
qui compare l'état FINAL au JSON.

Verrous : `tests/sql/migration-realtime-telemetry.test.sh` (11 contrôles, la migration est EXÉCUTÉE sur
un PostgreSQL jetable — dont ⑦ « la variante qui emporterait `posts` doit LEVER sans rien appliquer »
et ⑧ « sans le retrait, le verdict REFUSE au lieu de dire OK »), `dashboard/test/ingest.test.js` (+3 :
le canal ne revient pas, la cadence est une constante nommée, l'état DÉCLARE que le temps réel n'est
plus utilisé) et `tests/unit/audit-tables-compte.test.mjs` ⑧. Suite du pilotage : **577/577**.

## 🕵️ TRAFIC HORS PUBLIC — 15 « VISITEURS » SUR 19 ÉTAIENT NOS PROPRES CONTRÔLES (2026-10-05)

Mesuré en production (canal ① d'ADR-012, `telemetry_events`, 28/09 → 04/10) : 19 appareils sans compte, et **15 n'étaient personne**. Dix « iPhone » 390 × 844 classés `ios`/`chrome` déclaraient une connexion `4g` — or `navigator.connection` n'existe sur AUCUN navigateur iOS (WebKit ne l'implémente pas ; les vrais iPhone de la même semaine envoient `""`). Ils arrivaient **13 à 16 min après chaque fusion sur `main`** (06:56 → 07:09, 08:10 → 08:24, 08:51 → 09:04…), une session chacun, zéro clic : des vérifications d'après déploiement, dans un navigateur qui émule un téléphone. Les cinq autres : des fenêtres de bureau ou d'Android d'une à trois secondes (800 × 600, 1366 × 768, 400 × 400). Le digest annonçait « Appareils actifs 7 j : 23 » pour 13 au plus, et l'entonnoir des liens livré la veille (#578) allait rapporter des robots à des comptes.

⚠️ **ON NE JETTE RIEN.** Un robot qui voit une erreur voit une erreur de la production : les événements partent comme avant, et la veille comme la Sentinelle les lisent toujours. `js/telemetry.js` pose seulement `meta.trafic` — APRÈS le filtre, comme `ech`, pour qu'aucun appelant ne puisse ni l'effacer sur un robot ni le fabriquer sur un visiteur (il y est retiré) — et ce sont les chiffres d'AUDIENCE qui l'écartent. Un visiteur ordinaire ne reçoit aucune clé de plus.
- `robot` : `navigator.webdriver`, « HeadlessChrome », robot d'indexation NOMMÉ. ⚠️ Liste fermée, jamais `bot\b` (téléphones CUBOT), et **pas de lookbehind** : Safari < 16.4 refuse la syntaxe à l'analyse, et c'est tout le fichier qui ne se chargerait plus.
- `emulation` : agent iPhone/iPad/iPod servi par Chromium (`navigator.connection` ou `navigator.userAgentData`). Rattrapé côté serveur pour les lignes d'avant ce lot et les anciens clients en cache (`platform = ios` + `connection` non vide).
- `equipe` : `?equipe=1` une fois — mémorisé dans `localStorage.passio_trafic`, clé d'APPAREIL (hors `ACCOUNT_SCOPED_KEYS`), retiré de la barre d'adresse comme `?plk` (sinon un lien copié marquerait « équipe » chaque destinataire) ; `?equipe=0` l'enlève.
- Ordre : robot > emulation > equipe — un fait mesuré passe avant une déclaration.

⚠️ **TROIS LECTEURS, UNE DÉFINITION.** `dashboard/server/trafic.js` (visiteurs, entonnoir des liens, « en ligne » ; le DERNIER événement de l'appareil décide, pour que `?equipe=0` agisse sans redémarrage ; une ouverture ou une inscription hors public est comptée À PART — `opensHorsPublic`, `signupsHorsPublic` — jamais dans l'entonnoir) ; `compterAudience` dans `supabase/functions/_shared/pilotage.js` (téléphone : « en ligne » et « 24 h » ; un appareil écarté une fois l'est pour la fenêtre, et `trafic` est lu par PostgREST — `meta->>trafic` — sans rapatrier la meta) ; `filtrePublic()` dans `scripts/veille-production.mjs` (« Appareils actifs 7 j » du digest — PAS le flux ni le silence, qui gardent tout). Le dashboard n'importe rien hors de son dossier (Render le déploie seul) : la définition est COPIÉE, et `tests/unit/trafic-hors-public.test.mjs` confronte les copies cas par cas et fait tourner le VRAI `telemetry.js` dans une VM (navigateurs intégrés d'Instagram, Facebook, Snapchat, TikTok, LinkedIn et Telegram compris : des humains).

⚠️ **`coalesce` PARTOUT DANS LE SQL** : un `platform` NULL rendait la négation NULL (logique à trois valeurs), et la ligne sortait du compte sans être un robot.

⚠️ **LIMITES DITES** : un navigateur iOS à moteur Blink (Union européenne) serait classé `emulation` — aucun n'existait au 05/10/2026. Et une vérification dans un navigateur de bureau SANS automation (pas de `webdriver`) n'est reconnue que par `?equipe=1` : d'où la règle de `CLAUDE.md` — **regarder la production avec `https://passio-app.netlify.app/?equipe=1`**.

Mesuré sur la base le jour même : « appareils actifs 7 j » passe de 23 à 13 par le seul rattrapage iOS. Verrous, chacun mutation-testé (chaque mutation rougit exactement ses cas) : `tests/e2e/telemetrie-trafic.spec.js` (7), `dashboard/test/trafic.test.js` (7), `tests/unit/trafic-hors-public.test.mjs` (4), `tests/unit/pilotage.test.mjs` ⑯ ⑰. Registre : `.passio/METRICS_REGISTRY.md` § « Trafic hors public ».
