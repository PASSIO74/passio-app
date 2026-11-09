# Journal — Capacité, performance, lectures et rejeu, temps réel, stockage

> **Fiches déplacées TELLES QUELLES de `CLAUDE.md` le 2026-10-05.** `CLAUDE.md` est rechargé à
> chaque session et avait atteint 410 000 caractères (Claude Code alerte dès 40 000) : il ne garde
> plus que les règles qui valent partout. Ici vivent le récit, les mesures et les pièges de chaque
> lot — **à lire AVANT de toucher au domaine.** Un commentaire du code qui cite « CLAUDE.md § … »
> désigne une fiche de ce dossier : `grep -rn "<début du titre>" docs/journal/`.
> **Nouvelle fiche** : à la FIN du fichier de son domaine, titre `## <emoji> <TITRE> (AAAA-MM-JJ)`.
> Si elle porte une règle qui vaut pour TOUTE modification, une seule ligne de plus dans la section
> « Journal par domaine » de `CLAUDE.md` — jamais la fiche elle-même.

## Sommaire

- 🌐 « Failed to fetch » AU DÉMARRAGE — les LECTURES n'avaient pas de file, les écritures si (2026-09-10)
- 📈 CAPACITÉ SANS INVESTIR — LE « 200 » ÉTAIT PÉRIMÉ, ET LES VRAIS PLAFONDS ÉTAIENT AILLEURS (2026-09-19)
- 🔁 CAPACITÉ, SUITE : LE MUR N'EST PLUS LA LECTURE, C'EST L'AMPLIFICATION (2026-09-20)
- ⏳ LES DEUX FILETS RECULENT QUAND ILS NE TROUVENT RIEN (2026-09-20, la suite)
- 🧪 LE RÉFÉRENTIEL ÉTAIT CHARGÉ PAR LA CI, ET LE BANC NE MESURAIT PAS CE QU'IL CROYAIT (2026-09-20, la suite)
- 💾 STOCKAGE : LE MÉNAGE EST UTILE, LE MUR N'ÉTAIT PAS LÀ — LE FORFAIT EST **PRO** (2026-09-20)
- 🔌 LE MUR EST UNE CONNEXION WEBSOCKET, ET 98 % ÉTAIENT PAYÉES POUR RIEN (2026-09-20)
- 📉 CAPACITÉ, QUATRE LOTS : CE QUI EST LIVRÉ, CE QUI ATTEND UNE MAIN HUMAINE, ET CE QUI A ÉTÉ MESURÉ (2026-09-21)
- 🚪 UN VISITEUR NE LIT PAS LE COMPTE QU'IL N'A PAS (2026-10-11)
- 🗂️ INDEX ET REALTIME : CE QUE LA MESURE A RETIRÉ, ET CE QU'ELLE A LAISSÉ (2026-11-03)
- 🕳️ CE QUE REALTIME DIT D'UNE SUPPRESSION — LA CLÉ PRIMAIRE, À TOUS, SANS RLS (2026-11-03, R25) → `rid` opaque depuis le 2026-11-04
- 🔒 R25 — UNE TABLE PUBLIÉE LIVRE SES SUPPRESSIONS À TOUT LE MONDE, ET UNE TABLE DÉPUBLIÉE FAIT TAIRE SON CANAL (2026-11-03)
- 🪟 UN DOSSIER PERSONNEL SE NEUTRALISE EN LE POSANT : DEPUIS WINDOWS, LE TEST DES GARDES LANÇAIT LA CHARGE (2026-11-04)
- 🧹 R37 — UN DELETE N'APPORTE QUE LA CLÉ : LE RETRAIT SE RETROUVE DANS CE QU'ON A LU, JAMAIS PAR UNE RELECTURE (2026-11-05)
- 🪞 RV-39 — MES PUBLICATIONS ONT DEUX COPIES : CE QUE LE SERVEUR REND S'ÉCRIT SUR CELLE QUE LA PASTILLE LIT (2026-11-05)
- 🚫 UN COMPTE BLOQUÉ NE COMPTE PAS NON PLUS SUR LA PASTILLE D'UN COMMENTAIRE (2026-11-06)
- 🗑️ analytics_events : CE QUI NE SERT QU'UNE HEURE NE VIT PLUS 13 MOIS — ET LE PREMIER POSTE ÉTAIT LA VEILLE, PAS LE PLAFOND (2026-11-07)
- 📦 BANDE PASSANTE ET QUOTAS SANS INVESTIR : LA PAGE EN 304, LES MÉDIAS EN DIRECT, LES MINIATURES SANS TRANSFORMATION, LA LISTE DES PASSIONS GARDÉE (2026-11-09)
- 📴 LE CONTENU PUBLIC SORT DE LA RÉPLICATION CDC — `realtime.list_changes` PESAIT 60 % DE LA BASE (2026-11-09)
- 🖼️ LES ANCIENNES MINIATURES NE DEMANDENT PLUS DE TRANSFORMATION — ET LE QUOTA DE MESSAGES TEMPS RÉEL, AVANT ET APRÈS #802 (2026-11-09, la suite)
- 🧩 LE BLOC APP EN 9 SCRIPTS : UNE VERSION NE RETÉLÉCHARGE QUE CE QUI A CHANGÉ — ET SOUS WEBKIT, IL A FALLU LE WORKER (2026-11-09)
- 🧪 LA CI NE PARLE PLUS AU PROJET DE PRODUCTION : UN PROJET SUPABASE VIDE POUR LES SUITES LOCALES (2026-11-09)

---

## 🌐 « Failed to fetch » AU DÉMARRAGE — les LECTURES n'avaient pas de file, les écritures si (2026-09-10)

Mesuré sur 14 jours (`telemetry_events`, `type='api'`, `http_status = 0`) : **448 appels morts sur 46 sessions** — `passions`, `user_state`, `posts`, `profiles`, `follows`, `notifications`, `conv_members`, `video_lives`. La requête n'a jamais atteint PostgREST.
⚠️ **L'HYPOTHÈSE DE DÉPART ÉTAIT FAUSSE, ET C'EST LA MESURE QUI L'A DIT.** On soupçonnait iOS/Safari (« WebKit coupe les requêtes d'une page en arrière-plan ») : la base ne porte **AUCUNE** ligne iOS de cette famille — 374 Android/Chrome, 57 Windows/Edge, 17 Windows/Chrome. Et le passage en arrière-plan n'explique **qu'un tiers** des cas (126 des 374 lignes Android suivent un `lifecycle hidden` dans la minute ; **zéro** des 74 lignes de bureau). La signature dit la vraie cause : **3,2 échecs par seconde, jusqu'à 23 d'un coup** — toutes les requêtes en vol qui tombent ensemble, pas une requête malchanceuse. Ne jamais réécrire ce paragraphe en « c'est iOS ».
⚠️ **LA GARDE À L'ALLER ÉTAIT LE MAUVAIS REMÈDE.** « N'émettre que si `visibilityState === "visible"` » ne répare rien (la requête coupée reste coupée), rate deux tiers des cas, et retarde le premier rendu de tout démarrage masqué (préchargement, lancement PWA). Ce qui manquait, c'est un **REJEU au RETOUR**.
⚠️ **ET C'EST LE CHEMIN DE LECTURE QUI N'EN AVAIT PAS.** Chaque ÉCRITURE a sa file branchée sur `online` (`_flushPendingUserState`, `_delObFlush`, `_cmtObFlush`, `_flushOutbox`) ; les LECTURES de démarrage n'avaient rien. Mesuré : **92 échecs sur 448 seulement** sont suivis d'un appel réussi dans la même session — dans l'immense majorité des cas, **personne ne réessaie**. Une coupure d'une seconde au boot laissait l'état du compte non restauré et le référentiel des passions tronqué POUR TOUTE LA SESSION, en silence.
⚠️ **`estEchecReseau(e)` (app-02) est la SEULE autorité** qui sépare une panne de réseau d'un refus serveur, et elle **refuse par défaut** : un refus porte un code (`42501`, `PGRST116`, `23505`) ou un statut ≥ 400, le rejouer c'est marteler une porte fermée. Elle connaît les libellés RÉELS des quatre moteurs (« Failed to fetch », « Load failed », « NetworkError… », « The network connection was lost ») et le préfixe `FetchError:` de postgrest-js.
⚠️ **UNE LECTURE `user_state` PERDUE GÈLE L'ÉTAT DU COMPTE** : sans restauration confirmée, `_peutPousserEtat()` interdit TOUTE écriture jusqu'au prochain démarrage (garde volontaire du 2026-09-02 : une lecture ratée ne doit jamais effacer un compte). Le rejeu ne desserre pas la garde, il lui donne une seconde chance de se lever.
⚠️ **« CHARGÉ » ET « CHARGÉ ENTIÈREMENT » SONT DEUX ÉTATS** : les branches d'échec de `chargerReferentielPassions` publient un Set PARTIEL, que le cache à un seul coup figeait pour la session — une coupure à la 2ᵉ des 6 pages installait une liste blanche tronquée et `estPassionCanonique` refusait ensuite des milliers de passions légitimes. `_referentielComplet` ne passe à `true` qu'à la **sortie propre** de la boucle ; le plafond dur `PAGES_MAX` ne s'inscrit PAS à la reprise (ce n'est pas une panne).
⚠️ **LE COMPTEUR D'ESSAIS VIT DANS UNE TABLE SÉPARÉE DU REGISTRE** : le pilote DÉSINSCRIT la lecture avant de la rejouer (elle se réinscrit elle-même), donc un compteur porté par l'entrée serait remis à zéro à chaque tour — **la borne ne bornerait rien**. ⚠️ **On ne rejoue JAMAIS depuis une page masquée ni hors ligne** : ce serait refabriquer l'échec et consommer un essai pour rien. ⚠️ **Plus rien à rejouer = plus de minuterie** (on annule, on ne laisse pas expirer).
⚠️ **ON NE REJOUE QUE CE QUI EST IDEMPOTENT** : `rpc/declare_birth_year` n'est PAS inscrit — c'est un POST, `admissionRappelServeur` consomme déjà son drapeau une-fois-par-session, et la porte d'admission ÉCHOUE OUVERT.
⚠️ **LA TÉLÉMÉTRIE CONFONDAIT « la requête a échoué » et « notre code a un défaut »** : le hook `fetch` peignait tout rejet en `severity: "error"`, remplissant de bruit l'écran qui sert à voir les vrais défauts (même famille que « newestWorker is null »). La sévérité tombe à `warn` UNIQUEMENT quand la cause est PROUVÉE au moment de l'échec (`meta.masquee`, `meta.hors_ligne`) ; **page visible et en ligne, ça reste une `error`** — celui-là, personne ne sait l'expliquer. Le `status` reste `"error"` : on n'efface pas le fait, on cesse de crier.
⚠️ **ET LA PREUVE ARRIVAIT TROP TARD SUR iOS (2026-09-16)** : le pilotage a remonté « Failed to fetch » en `error` sur `passions`, `user_state`, `auth/v1/user` et `rpc/declare_birth_year` — 6 occurrences, 1 compte, 4 appareils — avec, dans la chronologie, `session end` AVANT les quatre échecs et `lifecycle hidden` APRÈS, la même seconde. Sur iOS, **`pagehide` précède `visibilitychange`** : à l'instant où WebKit coupe les requêtes en vol, `document.visibilityState` dit encore « visible » et `navigator.onLine` reste vrai — les deux preuves que le hook lisait étaient fausses, alors que le drapeau `unloading` (posé par l'écouteur `pagehide` de telemetry.js, déjà lu par `contexteEchec()`) disait vrai. Le hook `fetch` le lit désormais (`meta.fermeture`, relevé par `pageshow`), et `admissionEchec` (app-07) fait la même distinction par `estEchecReseau` — la porte d'admission ÉCHOUE OUVERT, une coupure n'y est pas un défaut. **Une cause peut être prouvée par un signal antérieur à celui qu'on regarde** ; chercher le drapeau qui existe déjà avant d'en poser un. Ne PAS lire ce paragraphe comme un démenti de « ce n'est pas iOS » plus haut : les 448 échecs Android/bureau du 10/09 restent la masse, iOS n'est que celui dont la preuve arrivait dans le mauvais ordre. Verrou : `reprise-lectures-boot.spec.js` ⑪ (5 états) et ⑪ bis, éprouvés par RÉINJECTION (2 rouges).
⚠️ **ET LE CENTRE DE PILOTAGE, LUI, NE LISAIT PAS LA GRAVITÉ** (même jour) : `_isProblem` (dashboard/server/store.js) rangeait TOUT appel en échec dans « Problèmes », `warn` compris — le correctif client aurait donc changé une ligne rouge en ligne orange, jamais fait disparaître l'incident, et les six lignes historiques restaient rouges quoi qu'il arrive. Benjamin : « si c'est réglé le centre de pilotage ne doit plus afficher les problèmes ». Deux preuves y sont désormais jugées : ① `meta.masquee|hors_ligne|fermeture` posé par le client ; ② un `session end` / `lifecycle hidden` de la MÊME session à ±3 s de l'échec, sur `client_ts` — ce qui couvre aussi l'historique et les PWA qui gardent l'ancien `app.js`. ⚠️ **La preuve ② peut arriver APRÈS l'échec** : au `pagehide` tout part dans un seul envoi et les lignes partagent le même `received_at` (c'est `ts`), l'ordre de lecture n'est pas garanti — un échec candidat (`http_status 0` ou libellé réseau) **attend 10 s son contexte** avant d'être compté ; rien n'est jamais tu sans preuve (un refus 4xx, une erreur JS ordinaire, un départ à 12 s restent des problèmes). Une erreur de type `error` rétrogradée en `warn` par son émetteur sort aussi de « Problèmes » et du « pic d'erreurs » (alerts.js). Verrou : `dashboard/test/store-coupure-depart.test.js` (9, dont ①/② qui rejouent la chronologie réelle dans les DEUX ordres, éprouvés par RÉINJECTION : 3 rouges). **Redémarrer le serveur du pilotage après ce genre de correctif** : `taskkill` du `node` qui tient 4610, le superviseur relance en 2 s (Arreter/Lancer-Pilotage sont le chemin sans terminal).
⚠️ **LA SENTINELLE NE POUVAIT PAS TROUVER ÇA, ET C'EST DÉLIBÉRÉ** : `estDuBruitApi` écarte tout `http_status = 0` (« ça parle de la connexion de l'appareil, pas de notre code »). Le filtre reste juste sur le fond, mais il a un angle mort à nommer — **il classe un signal sur sa CAUSE, jamais sur sa CONSÉQUENCE**, et la conséquence était ici que personne ne réessayait. C'est la **cinquième** façon dont le canal manque un vrai défaut, et la seule qui soit volontaire.
⚠️ **TROIS DÉFAUTS INTRODUITS PAR LE LOT, TROUVÉS EN RELECTURE, dont deux rendaient le remède PIRE QUE LE MAL** : ① le rejeu **RÉTRÉCISSAIT** la liste blanche des passions (`vus` recréé à chaque appel, publié tel quel sur échec — un rejeu qui casse plus tôt que le premier essai remplaçait 3 000 identifiants par 1 000, et l'invariant « le référentiel serveur AJOUTE, il ne retranche pas » ne tenait QUE par le cache à un seul coup que ce lot venait de lever) → `vus` est amorcé sur l'existant ; ② `chargerReferentielPassions` ne rendait **rien**, donc le pilote comptait l'essai et désarmait la minuterie AVANT le verdict → elle rend une promesse résolue à CHAQUE sortie ; ③ un `catch (_e) {}` **nu** dans le pilote, après désinscription de l'entrée et consommation de l'essai → moteur éteint en silence, registre vide « indiscernable de tout va bien ». Plus : **TTL de 120 s** sur une entrée (un rejeu des heures plus tard réappliquerait un blob serveur par-dessus une session vivante — `_applyUserState` ne protège pas `userPosts`), `Promise.race` de 20 s et péremption de 60 s sur `_referentielEnCours` (un `fetch` qui ne se règle JAMAIS gelait tout le pilote), réarmement AVANT les sorties « masquée / hors ligne », et `estEchecReseau` qui n'accepte qu'un code de type **CHAÎNE** (`DOMException` porte un `code` NUMÉRIQUE hérité — tester sa présence écartait de vraies pannes).
⚠️ **`npm run audit:globals` NE VOYAIT NI `let` NI `const`** — les 11 déclarations de ce lot étaient hors filet, alors que leur mode d'échec est PIRE qu'une `function` (redéclaration = `SyntaxError` qui **tue le script entier**, pas un écrasement silencieux). La gate couvre désormais les deux : 1 430 → **1 595** déclarations scannées, aucune collision préexistante.
Verrou : `tests/e2e/reprise-lectures-boot.spec.js` (13), dont ②, ⑨ et ⑪ éprouvés par RÉINJECTION, ⑫ qui mesure le CÂBLAGE à la source et ⑬ le non-rétrécissement. ⚠️ Le cas ⑪ exige `?telemetry=1` (opt-in strict en local, sinon les hooks ne sont pas installés et le banc mesure le vide) ; le faux client se pose en **MUTANT `window.supa.from`**, jamais en remplaçant le binding (`supa` est un `let` de portée script : `window.supa = x` crée une propriété séparée). Détail, mesures et points ouverts : `docs/REPRISE_LECTURES_RESEAU.md`.

## 📈 CAPACITÉ SANS INVESTIR — LE « 200 » ÉTAIT PÉRIMÉ, ET LES VRAIS PLAFONDS ÉTAIENT AILLEURS (2026-09-19)

Question de Benjamin : « 200 personnes seulement peuvent l'utiliser, comment monter sans payer ? ».
Le chiffre venait de `docs/SCALE_RUNBOOK.md:154`, **mesuré le 2026-06-15 sur la compute Nano** : c'est
la limite du pooler Supavisor, pas de l'application. Depuis, le projet tourne sur **Micro** (mesuré :
`shared_buffers` 224 Mo, `effective_cache_size` 384 Mo, `max_connections` 60) et la charge du 14/09
donne **~400 req/s, p95 sous la seconde à 200 simultanés sans pause**, soit **2 000 à 4 000 connectés**.
⚠️ **Côté LECTURE il n'y a rien à acheter** — et ne pas rouvrir ce point sur le chiffre de 200, qui est
cité de bonne foi dans un fichier que personne n'avait daté. Dossier : `docs/CAPACITE_SANS_INVESTIR_2026-09-19.md`.
⚠️ **MAIS « 2 000 À 4 000 CONNECTÉS » N'A JAMAIS ÉTÉ UN PLAFOND DE CONNEXIONS, et il a été répété
comme tel pendant deux jours.** C'est une déduction d'un banc qui mesure des **req/s** ; le plafond
réel a été LU le 2026-09-20 sur la page Usage : **Realtime Concurrent Peak Connections, 500** — et
l'application ouvrait un canal par client, donc **500 personnes simultanées**, pas 2 000. Le chiffre
de lecture reste juste pour ce qu'il mesure (la base tient la charge) ; il ne dit rien du transport.
**Le lot du même jour convertit ce plafond en « 500 COMPTES simultanés, visiteurs illimités »** —
voir « 🔌 LE MUR EST UNE CONNEXION WEBSOCKET ». Troisième fois qu'une grandeur est annoncée contre un
proxy commode plutôt que contre ce qu'elle prétend borner.

⚠️ **① LA VIDÉO ÉTAIT 85 % DU STOCKAGE, ET LE COMPRESSEUR EXISTAIT DÉJÀ.** Mesuré : 9 vidéos = 68 Mo
sur 80, la plus grosse à 24 Mo ; les 58 images = 12,5 Mo (elles passent par `passioCompressImage`
depuis toujours). `passioCompressVideo` (app-08) n'avait **qu'UN appelant**, `meOnMedia` ; la porte du
Studio (`#videoInput`, app-06) lisait le fichier **BRUT** jusqu'à 30 Mo. Famille « corriger une surface,
c'est corriger une surface ».
⚠️ **ET IL Y AVAIT UNE TROISIÈME PORTE — le premier jet de ce lot écrivait « les DEUX portes », ce qui
était faux, et c'est `audit-passio` qui l'a relevé, pas les dix verrous.** `handleAttachFile` (app-09)
sert `#attachImageFile`, qui porte `accept="image/*,video/*"` : une vidéo jointe à une conversation
partait en `FileReader` brut vers le seau `attachments`, et le contrôle de 40 Mo juste au-dessus est
**IMAGE-SEULEMENT** — donc AUCUNE borne, plus permissif que l'ancien Studio. Un lot qui se réclame de
cette règle et en oublie une troisième surface en est l'illustration, pas l'exception.
**`passioVideoPourEnvoi` (app-08) est désormais la SEULE autorité des TROIS portes** —
seuils (8 / 25 / 150 Mo), transcodage webm→mp4, repli brut, refus **portant son `motifUtilisateur`** :
l'appelant ne re-décide rien. Recopier les seuils dans la seconde porte les aurait fait diverger.
⚠️ **LE GAIN SE DIT JUSTE** : ×5,2 sur la VIDÉO (7,5 → ~1,5 Mo), mais **×3,2 sur le stockage RÉEL**
— mesuré sur le corpus de production, 80 → 25 Mo : les 12,5 Mo d'images, déjà compressées, ne
bougent pas. Annoncer ×5 sur le total était une extrapolation depuis la moyenne, pas une mesure.

⚠️ **② GOOGLE EST PASSÉ EN TÊTE, ET C'EST UN GESTE DE CAPACITÉ.** La confirmation d'e-mail est
obligatoire depuis le 30/08 : **une inscription = un e-mail**, et Brevo gratuit en donne **300 PAR
JOUR**, renvois et mots de passe oubliés compris. C'est le **seul plafond d'ACQUISITION** de PASSIO, et
Google n'en coûte **aucun**. Le bouton était posé APRÈS « Créer mon compte », « Mot de passe oublié »
et le renvoi — **sous le pli**, exactement comme `#authResendLink` avant le 18/09. **UN SEUL nœud, une
seule position** pour les deux onglets ; le séparateur NOMME l'alternative (peint par `switchAuthTab`, sans fonction
dédiée — la première rédaction en nommait une, `majSeparateurGoogle`, qui n'a jamais existé :
une fonction fantôme DOCUMENTAIRE, qu'`audit:handlers` ne voit pas parce que ce n'est pas un
onclick). ⚠️ **La case de consentement est maintenant PLUS BAS que le bouton qui l'exige** :
`_amenerConsentementAuxYeux()` l'amène à l'écran sur refus, depuis les **DEUX** gardes
(`onbGoogleAuth` ET `onbDoAuth` portent le même refus mot pour mot) — un refus qui désigne un élément
hors champ est le défaut du 18/09 déplacé d'un cran. `block:"center"`, jamais `"start"` : la case est au
milieu, la caler en haut sortirait le message d'erreur de l'écran.

⚠️ **③ `postgres_changes` EST CE QUI NE PASSERA PAS L'ÉCHELLE — et l'inventaire se fait sur TOUT le
dépôt.** Coût en **O(changements × clients abonnés)** : il grandit avec le PRODUIT, pas avec le nombre
d'utilisateurs. Mesuré : **25 tables publiées pour 12 abonnées**, dont six `cdv_*` d'une fonctionnalité
retirée par ADR-011 sept semaines plus tôt.
⚠️ **`telemetry_events` DOIT RESTER PUBLIÉE, et l'avoir cru sans abonné a failli coûter cher** : le
**Centre de pilotage** s'y abonne depuis `dashboard/server/ingest.js:217` (service_role) et en tire son
flux SSE. La retirer aurait éteint le direct **sans une erreur** (repli silencieux sur le polling) — le
symptôme aurait été « c'est un peu en retard », jamais « c'est cassé ». **Un inventaire d'abonnés lu sur
le seul `js/` est un inventaire faux.** `conv_reads` est abonnée aussi (`_creerCanalDb`, le ✓✓).
⚠️ **Le livrable n'est pas la migration, c'est la gate** : `npm run audit:realtime`
(`scripts/audit-realtime-publication.js` + `scripts/realtime-publication.json`, dans `verif` donc en CI)
refuse les DEUX sens. Le sens muet est le pire : un `postgres_changes` sur une table **absente** de la
publication passe `SUBSCRIBED` et ne reçoit **jamais rien** — indiscernable de « il ne s'est rien passé ».
Éprouvée par réinjection des deux. Migration : `migrations/migration_realtime_publication_2026-09-19.sql`
(13 tables retirées, verdict qui **ANNULE la transaction** si `telemetry_events` disparaissait).

⚠️ **④ ON N'ÉCHANTILLONNE QUE LE 200 — RIEN D'AUTRE — ET LA LIGNE GARDÉE PORTE SON POIDS.** La
télémétrie pesait **43 % de la base** pour dix comptes : 61 470 lignes en 7 jours, dont **20 575 `api`
en http 200** (97 % des `api`). Économie mesurée : **−30 %** (61 470 → ~42 950).
⚠️ **LE PREMIER JET ÉCHANTILLONNAIT AUSSI `perf`, ANNONÇAIT −45 %, ET C'ÉTAIT UNE ERREUR DE FOND —
arrêtée par `perf-ios.spec.js` ⑧, pas par la relecture ni par `audit-passio`.** Les 9 867 lignes
`perf` ne sont PAS des mesures brutes : **38 % sont des `ios_stat_*`, donc DÉJÀ des agrégats** (une
ligne par instantané, portant p50/p95/p99 et `n`), et `page_load` (20 %) comme `ios_context` (8 %)
sont un RECENSEMENT — une ligne par session. ~4 lignes par session au total : ce n'était jamais le
volume. **On ne résume pas un résumé, on le PERD** : une moyenne de p95 tirés au sort ne vaut rien,
et l'instrumentation PERF-IOS existe précisément pour mesurer. `ECH_PERF = 1`. ⚠️ **Échantillonner les 2xx en bloc aurait divisé par dix l'activité affichée
au pilotage** : `store.js` compte publications, messages, commentaires, réactions et notifications sur
`type === "api" && http_status === 201`. 287 lignes en 201 sur sept jours — les garder toutes ne coûte
rien, les perdre donne un tableau de bord qui ment. Les échecs (0, 4xx, 5xx) sont gardés entiers :
**un 401 est un `api`, pas un `error`, donc hors `CRITICAL_TYPE`**.
⚠️ **LES DEUX MOITIÉS NE VALENT QU'ENSEMBLE.** Sans poids, succès divisés par dix et échecs entiers →
le **taux d'erreur afficherait dix fois la réalité** et `health()` basculerait en « Critique » (seuil
40 %) sur une production saine. `tauxEchantillon` (pure, telemetry.js) estampille `meta.ech` ;
`poidsEvenement` (dashboard/server/store.js) le lit, et **retombe à 1** sur toute valeur absurde — une
donnée venue du client ne décide jamais d'un multiplicateur.
⚠️ **LA PONDÉRATION VA JUSQU'AU BOUT, ET LE PREMIER JET S'ARRÊTAIT À MI-CHEMIN.** `health()` et
`snapshot()` étaient pondérés ; `apiPerf()`, `services()` et les cinq compteurs d'activité ne l'étaient
pas — donc le taux d'erreur PAR ENDPOINT et la **Carte des services** (seuils 5/15/40 %) criaient encore
à la panne. Relevé par `audit-passio`.
⚠️ **ET « une moyenne sur un échantillon est déjà la bonne estimation » ÉTAIT FAUX** : c'est vrai d'un
échantillon UNIFORME, et celui-ci ne l'est pas — seuls les 200 sont tirés, les échecs et les écritures
restent entiers, donc la population survivante penche vers les échecs, qui sont lents. Moyenne et p95
sont désormais pondérés eux aussi. Une justification écrite qui ne tient pas est pire qu'un oubli :
elle décourage de regarder.
⚠️ **UN 200 LENT EST UN SIGNAL, PAS DU BRUIT** : le hook `fetch` pose `status: "slow"` dès 1,5 s AVEC un
code 200, et le pilotage n'arme son alerte « Lenteur » qu'après N appels lents — échantillonnés, il en
aurait fallu dix fois plus. `tauxEchantillon` rend donc 1 sur tout `status: "slow"` ou
`severity: "warn"/"error"`, **avant** de regarder le code HTTP.

⚠️ **⑤ LE CACHE DU RÉFÉRENTIEL EST CLÉ SUR LA RELEASE, PAS SUR UNE DURÉE.** `data/passions-v1.json`
pèse **568 ko** et le service worker ne le pré-cache pas : retéléchargé à chaque session. Un TTL devine ;
la release SAIT (même commit déployé ⇒ même fichier). `idbPassionsLoad/Save` (js/idb-store.js, patron de
`idbConvLoad/Save`) ; hors artefact `window.PASSIO_RELEASE` est absent → **rien n'est lu ni écrit** et le
comportement d'avant tient à l'octet près (serve local, bancs).
⚠️ **ON NE CACHE JAMAIS UN REPLI HORS LIGNE** : `repliHorsLigne()` fabrique ses entrées depuis le socle
de 19 passions — le mettre en cache installerait un référentiel tronqué pour tous les démarrages
suivants, sur une coupure d'une seconde. C'est la faute exacte du 2026-09-10 (« le rejeu RÉTRÉCISSAIT la
liste blanche »). L'écriture ne se fait que sur la branche réseau RÉUSSIE, et le cas ⑤ bis le mesure.

⚠️ **LE PIÈGE DE BANC DU LOT, ET IL RENDAIT LE PREMIER CAS VERT SUR LE DÉFAUT.** Le cas ① testait
`typeof window.passioVideoPourEnvoi === "function"` : il restait **VERT** en remettant le Studio au
`FileReader` brut, c'est-à-dire sur le défaut même que le lot ferme. C'est la faute `_notifierMessage`,
rejouée. Réécrit sur le GESTE : un `File` posé dans `#videoInput`, l'événement `change`, et on regarde
qui est appelé. ⚠️ Au passage, `window.Telemetry` **n'existe pas** — le module s'expose en
`window.PassioTelemetry` (alias `window.tel`).
⚠️ **ET LA GATE ELLE-MÊME ÉTAIT AVEUGLE À DEUX CHOSES** : elle ne descendait pas dans les sous-dossiers
et n'acceptait que les guillemets DOUBLES — donc une souscription rangée ailleurs, ou écrite en
guillemets simples, n'était pas comptée, et l'oubli était muet **dans le sens qu'elle déclare garder en
premier**. Elle est récursive, accepte les trois guillemets, et **SIGNALE** ce qu'elle ne sait pas lire
(`table: MA_CONSTANTE`) plutôt que de l'ignorer : une gate qui se tait sur ce qu'elle n'a pas compris ne
garantit plus rien.
Verrous : `tests/e2e/capacite-sans-investir.spec.js` (12) + `dashboard/test/telemetrie-echantillon-poids.test.js`
(5) + `tests/sql/migration-realtime-publication.test.sh` (10 — la migration est **EXÉCUTÉE** sur un
PostgreSQL jetable, et la variante qui retirerait `telemetry_events` doit LEVER sans rien appliquer).
**Éprouvés par RÉINJECTION de sept mutations** — Studio rendu au fichier brut (1 rouge), porte de
messagerie rendue au brut (1), Google remis en bas (1), échantillonnage étendu aux 2xx (2), repli hors
ligne mis en cache (1), sortie du refus retirée de `onbDoAuth` SEULEMENT (1 — c'est la porte que le
premier verrou n'exerçait pas), et `poidsEvenement` rendu aveugle (3, côté pilotage).

### ⚠️ CONTRE-REVUE ADVERSARIALE DU MÊME JOUR — SEPT DÉFAUTS DE PLUS, APRÈS DEUX PASSES DÉJÀ FAITES

Le lot avait déjà été relu par `audit-passio` (2 défauts) et redressé par un test
(`perf-ios` ⑧). Une passe `passio-red-team` sur l'état final en a trouvé **sept autres**,
dont un P0. **Trois passes de relecture ne valent pas une passe adversariale** — et la
famille commune des trois plus graves mérite d'être nommée : un correctif qui réutilise
un helper écrit pour un AUTRE média, une justification qui se contredit à 160 lignes
d'écart dans le même commit, et un verrou qui mesure la taille là où le défaut porte sur
le type.

⚠️ **[P0] UNE VIDÉO JOINTE À UNE CONVERSATION PARTAIT EN `image/jpeg`, NOMMÉE `.jpg`.**
`_passioDataUrlToFile` (app-09) forçait type et extension EN DUR — parfaitement juste
tant qu'elle ne servait qu'à ré-injecter une image compressée, son seul appelant. La
TROISIÈME porte vidéo, ajoutée la veille, la réutilisait telle quelle. Sans lever une
seule erreur : `_processAttach` teste `file.type.startsWith("video/")`, devenu FAUX →
`msg.img` (vignette cassée chez l'expéditeur) ; le blob déposé dans `attachments`
portait `image/jpeg` avec `cacheControl` d'un an (**mauvais content-type figé pour un
an**) ; `content.fileType` annonçait « image » au destinataire, qui recevait une image
cassée POUR TOUJOURS. **Avant le lot, ce chemin FONCTIONNAIT** : régression complète
introduite par un correctif. **Un helper porte le contrat de son appelant d'origine ; le
brancher sur un autre média sans relire son corps est la faute à chercher en premier.**
⚠️ Et le verrou était VERT dessus : il n'assertait que la TAILLE du fichier traité.
**Un verrou qui mesure la taille ne mesure pas le type.**

⚠️ **[P1] UNE COMPRESSION QUI NE REND JAMAIS SON VERDICT VERROUILLAIT L'ÉCRAN.**
`passioCompressVideo` ne conclut que sur `video.onended`, et sa boucle de dessin est un
`requestAnimationFrame` : page passée en arrière-plan pendant l'encodage → lecture
suspendue, `onended` jamais émis, **promesse jamais réglée**. `#meProgressOv` (fixed,
inset:0, z-index 5200, **sans croix ni Échap**) restait posé : application morte jusqu'au
rechargement. C'est l'invariant maison « jamais de rendu cadencé sur rAF » vu par son
autre bout. Le mode d'échec préexistait à l'éditeur média ; **ce lot l'avait TRIPLÉ**
(Studio + messagerie) sans appliquer le `Promise.race` qu'il cite ailleurs.
`VIDEO_COMPRESSION_DELAI_MAX` = 90 s → le `catch` existant, et `_meHideProgress` en
`finally`. **Brancher un chemin existant sur deux surfaces de plus, c'est hériter de ses
modes d'échec sur deux surfaces de plus.**

⚠️ **[P1] LA PONDÉRATION DU PILOTAGE S'EST ARRÊTÉE À MI-CHEMIN UNE SECONDE FOIS.**
`timeseries()` pondérait `b.api` mais pas la LATENCE, et son commentaire le justifiait
par « une moyenne sur un échantillon est déjà la bonne estimation » — que le **MÊME
commit** réfutait 160 lignes plus bas dans `apiPerf`. Et c'est la moitié la plus VISIBLE
qui mentait : `#perfChart` trace cette série **juste au-dessus** du tableau `perfRows`,
lui pondéré — deux chiffres contradictoires sur un même écran. `b.events` restait brut
alors que `b.api` ne l'était plus : `api ⊆ events`, donc un bucket pouvait rendre
`api > events`, un état impossible. **Une justification écrite qui ne tient pas est pire
qu'un oubli : elle décourage d'aller regarder.**

⚠️ **[P1] L'ÉCHANTILLONNAGE BIAISAIT LES VERDICTS DE TRACE VERS « LENT ».**
`traces.js` (`_setStep`) laisse le DERNIER écrivain fixer l'étape `request`. Les 200
rapides jetés 9 fois sur 10, la population survivante penche vers les lignes lentes :
mesuré sur un flow RÉEL de production (`cint`), les événements 3, 4 et 5 sautent, le seul
`slow` devient le dernier, le verdict passe de `success` à `slow`, et `alerts.js` lève
« Action anormalement lente » **sur une action qui a parfaitement abouti**. Pire cas
voisin : un flow dont la seule requête serait un 200 perdrait son étape `request` →
`dead_click`, alerte `high`. **Une ligne qui porte un `correlation_id` n'est pas un
agrégat, c'est une PREUVE INDIVIDUELLE** : `tauxEchantillon` rend 1 dessus, avant tout
test de code HTTP (18 lignes en 30 jours — coût nul). **Échantillonner, c'est changer la
COMPOSITION d'une population, pas seulement son volume : tout ce qui lit « le dernier »,
« le premier » ou « y en a-t-il un » en aval est faussé, même si les moyennes sont
pondérées.**

⚠️ **[P2] LE CACHE DURABLE POUVAIT FIGER UN RÉFÉRENTIEL PÉRIMÉ POUR UNE RELEASE ENTIÈRE.**
La garde « on ne cache jamais un repli hors ligne » tenait ; **le trou était ailleurs**.
`data/passions-v1.json` n'est ni `/`, ni `/media/*`, ni un `.js` : il tombe dans la
DERNIÈRE branche de `sw.js`, en **stale-while-revalidate**. Au premier démarrage qui suit
un déploiement, l'ancien SW contrôle encore la page et rend la copie de la release
PRÉCÉDENTE avec un **HTTP 200 parfaitement valide** — que l'écriture rangeait sous la clé
de la release COURANTE. Avant ce lot la même fenêtre coûtait UNE session (le SWR se
rafraîchissait) ; le cache durable en faisait **une release**. L'URL porte donc
`?r=<release>`. Hors artefact, URL inchangée, comportement d'avant à l'octet près.
**Un cache durable n'hérite pas de la fraîcheur de son fournisseur : il la FIGE.**

⚠️ **[P2] LE REFUS DE CONSENTEMENT SE PRONONCE LÀ OÙ L'ON AGIT.** Amener la case sous les
yeux ÉLOIGNE mécaniquement `#authMsg` : à 390 × 664 le motif pouvait repartir hors champ
— **le défaut du 18/09 reproduit en miroir**, la cible visible et le refus plus.
`#authConsentRefus` vit **HORS du label** (un clic sur un descendant COCHERAIT le
consentement : même piège que les liens CGU, 2026-09-08), même patron que `#authPwdRefus`.
⚠️ Et le verrou **stubbait `scrollIntoView`** : il vérifiait qu'on avait DEMANDÉ
`block: "center"`, jamais que le refus restait lisible après le défilement réel — « on
mesure l'appel, pas le résultat », dans le lot même qui cite ce défaut. Il mesure
désormais la géométrie des DEUX nœuds après défilement.

⚠️ **[P2] LA GATE `audit:realtime` DÉCLARAIT UN PÉRIMÈTRE QU'ELLE N'AVAIT PAS.** Son
en-tête écrivait « TOUT LE DÉPÔT, BACKEND COMPRIS » ; elle lisait **deux racines sur
cinq**. Restait dehors `scripts/charge.mjs` — l'outil même avec lequel on mesure la
capacité que ce lot prétend lever. Cinq racines, 17 souscriptions. ⚠️ **Et elle devait
s'exclure elle-même** : depuis qu'elle balaie `scripts/`, ses propres exemples de
documentation (`table: "nom_en_clair"`) étaient comptés comme des souscriptions à des
tables inexistantes, et elle refusait un dépôt sain **en se citant**. Un scanner dans son
propre périmètre finit toujours par s'attraper.

⚠️ **[P3] DEUX ÉTIQUETTES DEVENUES PORTEUSES.** `releaseCourante` (idb-store) rendait
`PASSIO_APP_VERSION` SEUL quand il était posé : le jour où quelqu'un y écrit une version
produit stable (« 2026.10.0 »), la clé du cache **cesse de changer au déploiement**. Les
deux champs sont concaténés. Et `ech` était posé **DANS** `scrubMeta`, donc sous son
plafond de 30 clés : un appelant à 29 clés aurait fait partir une ligne échantillonnée
**sans son poids**, sous-comptée dix fois, en silence. Estampillé APRÈS.
**Un champ d'affichage promu clé de cache ou porteur de sens change de contrat sans que
son nom le dise.**

⚠️ **[P3] UNE VIDÉO SANS TYPE MIME CONTOURNAIT LA PORTE DE MESSAGERIE** (sélecteurs
Android, `file.type === ""`), où le contrôle de 40 Mo est IMAGE-SEULEMENT — donc aucune
borne. Pas une régression, mais **le lot AFFIRMAIT que cette porte est bornée : une
affirmation qu'un cas dément est pire qu'un trou connu.** `_passioEstVideo` retombe sur
l'extension.

⚠️ **DEUX CONSTATS ÉCARTÉS ET TROIS AXES DÉCLARÉS SAINS, ÉCRITS PLUTÔT QUE TUS** : aucune
quatrième porte vidéo (six `input[type=file]` inventoriés), aucun abonné `postgres_changes`
orphelin hors `js/` (recensement complet, `supabase/functions/` compris), et l'ordre des
tests de `tauxEchantillon` est correct. **Un « rien trouvé sur cet axe » a autant de
valeur qu'un constat** : sans lui, la session suivante refait l'enquête.

⚠️ **PIÈGE D'OUTILLAGE DU JOUR, DEUX FOIS** : ① `pkill -f "[p]laywright test"` tue quand
même son propre shell si la MÊME ligne de commande contient plus loin un vrai
`npx playwright test` — le motif y correspond. Séparer en deux appels. ② Un nom de balise
écrit entre chevrons **dans un commentaire HTML** est compté par le contrôle de balises
structurelles de ce fichier (c'est un grep, pas un parseur) : il faisait apparaître une
étiquette fantôme. Ne pas citer de nom de balise entre chevrons dans `index.html`.

Verrous portés à **17** (`capacite-sans-investir.spec.js`) et **6**
(`telemetrie-echantillon-poids.test.js`), la latence pondérée éprouvée par RÉINJECTION.
89 cas des suites voisines verts ; `cgu-consentement` ⑩ rougit à l'identique sur
`origin/main` PUR (erreur console MapLibre, bac à sable réseau) — étranger au lot.

⚠️ **[P3, FERMÉ LE MÊME SOIR] LA VEILLE COMPTAIT DES LIGNES LÀ OÙ IL FAUT COMPTER DU POIDS.**
`SQL.fluxHeures` (`scripts/veille-production.mjs`) faisait `count(*)` : ce signal mesurait donc
L'ÉCHANTILLONNAGE autant que l'usage, et son seuil « journée ouvrée quasi vide » (< 100 lignes,
médiane des jours ouvrés > 500) pouvait se déclencher sur une production saine pendant les 7 jours
où la médiane porte encore des journées d'avant le déploiement. Il lit désormais `meta->>'ech'`,
**même contrat que `poidsEvenement`** — valeur absurde → 1, poids borné à 1000 — parce que deux
lecteurs de la même table qui pondèrent différemment finissent par se contredire. La contre-revue
recommandait de le DOCUMENTER ; le corriger vaut mieux : la mesure devient invariante à tout
changement futur du taux. ⚠️ **Et l'ampleur annoncée était surévaluée** : mesuré le 19/09 contre la
production, le 18/09 fait 2 760 lignes et le 19/09 en fait 1 095 — à −30 % on serait à ~770, loin
des 100 du seuil. La fausse alerte exigeait une journée déjà très calme. **Une fiche qui surévalue
finit par ne plus être crue** : le correctif est juste sur le principe, pas sur l'urgence.
Verrou : `tests/unit/veille-production.test.mjs` (+4 assertions, mutation `count(*)` → rouge).

## 🔁 CAPACITÉ, SUITE : LE MUR N'EST PLUS LA LECTURE, C'EST L'AMPLIFICATION (2026-09-20)

Demande de Benjamin, après le lot du 19/09 : « trouve des solutions pour augmenter encore plus les
capacités du nombre d'utilisateurs sans investissement ». Première lecture du **temps CPU réel** de
la base (`extensions.pg_stat_statements`, cumulé sur 129 jours, canal ① d'ADR-012) — elle change le
cadrage : **le temps réel pèse 69 % du CPU de la base avec DIX comptes**, et son coût est en
**O(changements × clients abonnés)**, la seule forme quadratique du produit. Dossier :
`docs/CAPACITE_AMPLIFICATION_2026-09-20.md`.

⚠️ **LE FACTEUR D'AMPLIFICATION EST MESURÉ, PAS DÉDUIT : ×13.** `rows / calls` = **1,03** sur le
décodage WAL — ce ne sont donc pas des sondages à vide, chaque appel rend une ligne réelle. Or les
tables publiques n'ont connu qu'environ **550 000 changements de lignes** sur la période, pour
**7,17 millions de lignes décodées et vérifiées par la RLS**. Ce ×13 n'est pas une constante de
Supabase : c'est le nombre d'abonnements concurrents qui ont matché chaque changement (dix comptes ×
douze souscriptions sans filtre). **Il vaut ce qu'on lui donne — c'est la définition opérationnelle
du mur.**

⚠️ **DIX-NEUF MILLIONS DE BALAYAGES SUR UNE TABLE DE NEUF LIGNES N'EST PAS UN PROBLÈME D'INDEX.**
`profiles` : 18 964 110 balayages séquentiels, 132 550 791 tuples. Un balayage de neuf lignes est
gratuit — c'est le NOMBRE DE REQUÊTES qui est le défaut. Même lecture pour `video_lives` (223 315
balayages, 21 lignes), `follows` (820 671) et `conv_members` (723 854). **Sur une petite table, le
compteur de balayages est un compteur d'APPELANTS, pas un diagnostic de plan.**

⚠️ **① LA RECHERCHE : LES DEUX PREMIÈRES LETTRES COÛTAIENT 97 % DU MOT.** `rechercher_passions` est
la requête la plus lente du produit (92,2 ms de moyenne sur 18 185 appels). Mesuré en production,
cinq répétitions à chaud : **1 lettre = 80 à 133 ms, 2 lettres = 15 à 51 ms, 3 lettres = 0,6 à
8,5 ms, 4+ = 0,4 à 2,9 ms**. ⚠️ **LA CAUSE EST LA SÉLECTIVITÉ, PAS L'INDEX** — j'ai d'abord écrit « pg_trgm n'extrait aucun
trigramme sous trois caractères, l'index décroche », et c'est `audit-passio` qui a demandé la
mesure. Plan réel pour `q='a'` : `Seq Scan rows=4626` (383 écartées), puis **SubPlan 1 et 2,
`Function Scan on unnest`, `loops=4263` chacun**, 297 ms. `recherche like '%a%'` matche **92 % du
catalogue** : le balayage est le BON plan, et ce qui coûte est **l'expression de SCORE** — deux
`unnest(aliases)` + `unaccent_immutable` par ligne retenue — puis le tri. Un index parfait n'y
changerait rien. **On ne répare pas ça avec un index, on cesse de poser la question.** Comme la
recherche part à CHAQUE frappe (anti-rebond 160 ms), tout mot tapé traversait
d'abord son pire cas — « guitare » : 106 ms sur 109, soit **97 %** ; escalade 96 %, randonnée 91 %,
photographie 81 %. `LONGUEUR_MIN_SERVEUR = 3` (passions-flat.js) : sous ce seuil, **on ne demande
rien**. ⚠️ **On ne perd rien** : la recherche LOCALE (index préfixe sur les 5 001 entrées et leurs
alias) répond déjà, immédiatement et hors ligne, et `chercherAsync` la rend telle quelle dès que le
serveur ne complète pas — le serveur n'apporte que la sous-chaîne au milieu d'un mot et le flou, qui
n'ont aucun sens sur une ou deux lettres. ⚠️ **Les quatre passions à nom court restent trouvables**
(C++, C#, Go, DJ — les SEULES sous 3 caractères sur 5 009, mesuré) : l'index local les sert par
PRÉFIXE, la bonne réponse à « dj ». Ne pas descendre le plancher à 2 pour elles. ⚠️ **Il n'y a pas
de repli serveur moins cher, mesuré** : un préfixe (`normalized_label like 'a%'` + alias) coûte 68 à
75 ms — collation `en_US.UTF-8`, donc un btree n'y sert pas un `LIKE 'x%'`, et `unaccent_immutable`
est appelée par alias et par ligne. **Le bon geste n'est pas de chercher autrement, c'est de ne pas
demander.** ⚠️ Le plancher se prend sur la frappe **NORMALISÉE** : c'est elle que le serveur recevrait.

⚠️ **ET MA PREMIÈRE ENQUÊTE A CONCLU LE CONTRAIRE, À TORT — LEÇON DE MÉTHODE.** Un `EXPLAIN` où
j'avais *simplifié* l'`ORDER BY` en retirant l'expression de score montrait un balayage complet
(`Rows Removed by Filter: 4988`) et un index « jamais lu » : j'ai cru à une migration non appliquée.
Les deux index GIN **existent et servent** (4 770 lectures chacun), et le plan réel rend un
`BitmapOr` en 0,4 ms. **Une requête simplifiée pour la lisibilité n'est plus la requête qu'on
mesure** — et un `idx_scan` lu dans une liste triée par ordre croissant et tronquée à 40 lignes ne
dit rien de ce qui n'y figure pas.

⚠️ **② UN ÉVÉNEMENT REÇU DÉCLENCHAIT UNE REQUÊTE CHEZ CHAQUE CONNECTÉ.** Les gestionnaires temps
réel `posts` INSERT et `post_comments` INSERT faisaient `supa.from("profiles").select(...)` À LA
RÉCEPTION. L'événement étant poussé à TOUS, une seule publication coûtait **N requêtes** — à 2 000
connectés, 2 000 requêtes pour une publication. ⚠️ **MAIS CE N'EST PAS
L'ORIGINE DES 19 MILLIONS DE BALAYAGES DE `profiles`, ET JE L'AI D'ABORD ÉCRIT** (relevé par
`audit-passio`, vérifié dans le schéma de production) : ① sur une table de neuf lignes PostgreSQL
balaie pour TOUTE requête, donc ce compteur totalise toutes les lectures (6,99 tuples par balayage
= « table entière, chaque fois ») ; ② la policy SELECT de `posts` porte `NOT EXISTS (SELECT 1 FROM
profiles pr WHERE pr.id = posts.author_id AND pr.is_private = true)`, donc **un balayage par ligne
évaluée**, et `startFeedRefreshLoop` rejoue `supaLoadPosts()` toutes les 60 s chez chaque client
visible — ~86 400 balayages par jour et par onglet. **Le producteur dominant est là, et ce lot n'y
touche pas.** Attribuer un gros chiffre au défaut qu'on vient de corriger fait croire à la session
suivante que le poste est réglé : « une fiche qui décrit un défaut déjà refermé coûte autant qu'une
fiche qui en tait un », en version inverse. Le correctif reste juste POUR SA PROPRE RAISON. ⚠️ **LE CACHE EXISTAIT
DEPUIS TOUJOURS ET PERSONNE NE LE CONSULTAIT ICI** : `cacheRemoteProfile` écrit dans
`state.seed.users`, `userById` le lit, et c'est déjà cette source que le fil, les commentaires et la
messagerie peignent PARTOUT ailleurs. On ne « met pas en cache », on **cesse de contourner le
cache** (`_profilAuteur`, app-08, autorité unique). ⚠️ **ET ON NE CRÉE PAS UNE TROISIÈME AUTORITÉ** : `_fetchProfile` (app-04) fait déjà « un profil
sans réseau », avec son `Map`, et il LIT `{ error }` (il refuse de cacher un repli obtenu sur une
coupure — défaut qu'il a déjà payé). `_profilAuteur` lui DÉLÈGUE au lieu de recopier. ⚠️ La
fraîcheur ne baisse pas **TANT QUE LE CANAL EST JOINT** : `postgres_changes` ne rejoue rien après
une coupure, et le canal est rejoint APRÈS le premier `supaLoadPosts()`. ⚠️ Le manque est
**INSCRIT**, sinon la publication suivante du même auteur repaierait la requête chez tout le monde.

⚠️ **③ LE BATTEMENT DE CŒUR D'UN LIVE RECHARGEAIT LA LISTE CHEZ CHACUN.** L'abonnement `*` sur
`video_lives` appelait `supaRefreshVideoLives()` — une vraie requête — à chaque événement reçu, chez
chaque connecté. ⚠️ **ET MON PREMIER REMÈDE ÉTAIT LE MAUVAIS** : un débounce de 250 ms, justifié par
« un seul live produit plusieurs événements d'affilée ». C'est FAUX, et les chiffres cités le
démentaient déjà — 2 089 / 2 414 / 2 068, soit **~1,16 UPDATE par live**, donc des événements
ESPACÉS. Surtout, l'hôte envoie un UPDATE `last_seen` **toutes les 25 SECONDES** : 25 000 ms ≫
250 ms, aucun n'était coalescé. **Un débounce ne coalesce que ce qui arrive groupé ; il faut
regarder ce que la production produit VRAIMENT avant de choisir la forme du remède.** Le vrai geste :
`vliveEvenementSansEffet(payload)` prend AVANT la requête la signature de visibilité que
`supaRefreshVideoLives` calculait APRÈS (`id + status`) — une mise à jour d'un live déjà connu au
même statut est un battement de cœur, il n'y a rien à redemander. ⚠️ **On ne saute que ce cas-là** :
insertion, suppression, identifiant inconnu, statut différent repassent par la requête — un événement
qu'on ne sait pas lire est un événement qu'on honore. ⚠️ **La même signature que l'application, pas
une autre** : en copier une seconde les ferait diverger. ⚠️ Un live qui cesse de battre disparaît
toujours (`supaLoadVideoLives` filtre sur `last_seen`, le filet de 60 s purge). ⚠️ **Rien ne part
d'une page masquée**, mais le rendez-vous est **REPORTÉ, pas annulé** : `visibilitychange` ET
`pageshow` le rejouent — la première rédaction NOMMAIT `pageshow` sans jamais l'écouter, alors qu'un
retour de bfcache iOS l'émet sans forcément l'autre. **Un commentaire qui promet une couverture
qu'il n'a pas est pire qu'un trou : on croit le cas traité.** ⚠️ Repli sur l'appel direct si app-05
n'est pas chargé.

⚠️ **④ `conv_members` : UN FILTRE SERVEUR ÉVITE L'ÉVALUATION, PAS LA LIVRAISON — ET J'AVAIS ÉCRIT
L'INVERSE.** « Poussée à TOUS les connectés » est FAUX (relevé par `audit-passio`, vérifié en base) :
la policy `conv_members_select_member` est `is_conv_member(conv_id, auth.uid())`, donc Realtime ne
LIVRAIT la ligne qu'aux membres de cette conversation. Ce qui coûtait en O(N abonnés), c'est la
DÉCISION : pour savoir à qui livrer, Realtime appelle `is_conv_member` (SECURITY DEFINER) une fois
par abonnement et par ligne ; un filtre de colonne est tranché avant, sans toucher à la base. Le
dire juste évite que le prochain lot cherche un « O(N) livraisons » sur `conv_reads` ou
`comment_interactions`, où le raisonnement serait tout aussi faux — mêmes policies de membre.
⚠️ **La garde client reste, mais pas pour la raison d'abord écrite** : si `MY_UID` changeait, c'est
le FILTRE qui deviendrait périmé et jetterait silencieusement les événements de la nouvelle identité
— aucune garde client ne rattrape ce qui n'arrive jamais. La vraie règle est **ce filtre doit être
refait quand `MY_UID` change**, ce que personne ne fait, ni ici ni pour `notifications`. La garde
reste parce qu'un filtre Realtime est une optimisation de TRANSPORT, jamais une frontière de
sécurité.

⚠️ **UN BANC DE CHARGE QUI N'EXERCE QUE LE CAS FAVORABLE MESURE LA CAPACITÉ DU CAS FAVORABLE** :
`scripts/charge.mjs` interroge le RPC avec `q: "rando"` — cinq lettres, donc le chemin rapide. La
mesure de capacité du 14/09 n'a jamais vu le pire cas de la recherche.

⚠️ **CE QUI RESTE OUVERT, NOMMÉ** : les onze autres souscriptions du canal restent sans filtre — à
2 000 connectés un « j'aime » coûte 2 000 évaluations de RLS pour patcher un compteur que la plupart
n'ont pas à l'écran (`findPostAnywhere` rend `null`) ; s'abonner à ce qui est VISIBLE est un
changement d'architecture, pas un réglage. `chargerReferentielPassions` (2 847 316 appels, 5,8 % du
CPU, six allers-retours par session, plafond `PAGES_MAX` muet) ne se cache ni sur la release ni sur
un TTL, la liste blanche étant MUTABLE. `creer_passion` accepte un libellé de 2 caractères, invisible aux autres depuis le
plancher de ① (zéro cas, rien ne garde l'invariant). Une garde serveur pour les frappes courtes
demande une migration, donc une contre-revue humaine. ⚠️ « Le forfait Supabase n'a jamais été LU »
figurait ici : **il l'a été le 2026-09-20** (fiche « 🔌 LE MUR EST UNE CONNEXION WEBSOCKET »).

⚠️ **CE QUI A ÉTÉ CHERCHÉ ET N'A RIEN DONNÉ** — un « rien trouvé sur cet axe » a autant de valeur
qu'un constat : la publication realtime est correcte (12 tables, exactement les écoutées) ; les deux
index de recherche existent et servent ; `rechercher_passions` n'a que deux appelants
(`passions-flat.js`, `charge.mjs`), aucune surface oubliée ; `profiles` n'a pas de problème d'index.

⚠️ **PIÈGE D'OUTILLAGE, LE MÊME QU'HIER DANS L'AUTRE SENS** : `pkill -f servir-dist.js` tue son
propre shell quand la même ligne de commande contient le motif. Écrire `pkill -f 'servir[-]dist'`,
ou séparer en deux appels.

⚠️ **QUATRE DES QUATRE CAUSES ÉCRITES DANS LA PREMIÈRE RÉDACTION ÉTAIENT FAUSSES, ET LES QUATRE
CORRECTIFS ÉTAIENT BONS.** C'est le mode d'échec à retenir de ce lot : la mesure désigne le bon
endroit, et l'explication qu'on en tire peut être entièrement à côté. `audit-passio` les a toutes
relevées après que les gates étaient vertes et les verrous au vert. **Dans un lot de CAPACITÉ, une
cause fausse coûte plus que le gain du lot** — elle envoie la session suivante chercher ailleurs, ou
lui fait croire qu'un poste est réglé. Un seul remède a dû changer de forme (③) ; les trois autres
n'ont changé que de justification.

Verrou : `tests/e2e/capacite-amplification.spec.js` (11), **éprouvé par RÉINJECTION de neuf
mutations** — plancher retiré (2 rouges), gestionnaire `posts` rendu à la requête réseau (1),
coalescence retirée du gestionnaire (1), filtre `conv_members` retiré (1), garde du battement de
cœur retirée (1), payload non transmis (1), écouteur `pageshow` retiré (1), garde « page masquée »
retirée (1). ⚠️ **Un verrou qui exerce une forme de charge que la production n'a pas est vert sans
rien prouver** : le premier cas ⑧ envoyait douze appels dans le même tick — une rafale qu'aucune
mesure ne montre. Il exerce désormais le battement de cœur réel, espacé.

⚠️ **ET LES TROIS CAS ⑧ ONT ÉTÉ VERTS EN LOCAL ET ROUGES EN CI, À EXACTEMENT UN APPEL PRÈS**
(0 → 1, 1 → 2). Cause : **`supaInit` appelle `supaRefreshVideoLives()` UNE FOIS AU DÉMARRAGE**
(app-08, pour peindre les bulles « 🔴 LIVE »), gardé par `window._supaReal` — **faux en local**
(le SDK n'est pas chargé), **vrai en CI**. Le compteur du banc captait donc cet appel de
démarrage. C'est la divergence d'environnement que ce dépôt connaît par cœur, prise par son autre
bout. ⚠️ **Le remède n'est ni un `setTimeout` de complaisance ni une tolérance à +1** — les deux
rouvrent la course sur un runner plus lent, ou masquent un vrai appel : `compteurVliveAuCalme`
attend que le compteur soit **STABLE** (plus rien pendant 400 ms, 20 tours au plus) puis le remet
à zéro. Le sujet de ces cas est « mon geste déclenche-t-il un rechargement ? », pas « l'application
en fait-elle un au démarrage ». **Un banc qui compte un global appelé par le produit doit d'abord
attendre le calme.** L'échec a été REPRODUIT en local avant d'être corrigé (appel de démarrage
simulé à 250 ms → 4 rouges ; avec le correctif, 11 verts, simulation toujours en place). ⚠️ Le cas ⑦ a rougi sur sa première
rédaction parce que ma tranche de source allait jusqu'à la FIN DU FICHIER et attrapait le
`from("profiles")` de `supaInit` — un chemin de démarrage, appelé une fois par session : **un verrou
qui rougit sur un innocent finit par être désarmé**. En local, `creation-passion` ⑭ est rouge **sur
`origin/main` pur aussi** (worktree séparé, port 8099) — divergence d'environnement déjà écrite.

## ⏳ LES DEUX FILETS RECULENT QUAND ILS NE TROUVENT RIEN (2026-09-20, la suite)

Le point laissé ouvert par le lot « amplification », traité dans la foulée. Le fil
(`startFeedRefreshLoop`, app-08) rejouait `supaLoadPosts()` toutes les 60 s chez chaque client
visible — et un chargement de fil, ce n'est pas une requête mais **QUATRE** (`posts`, puis les lots
`post_likes`, `post_comments`, `comment_interactions`) ; le filet des lives (app-05) tournait toutes
les 60 s **même sans aucun live** (234 949 appels mesurés, le plus gros compteur de la base après le
temps réel).

⚠️ **AUJOURD'HUI C'EST PEU — ~3,4 % DU CPU — ET C'EST EXACTEMENT POURQUOI IL FAUT LE DIRE JUSTE.**
Ce coût ne dépend PAS de ce que les gens font, seulement du nombre d'onglets ouverts. À 2 000
connectés, ces minuteurs font **133 requêtes par seconde d'activité NULLE**, contre ~400 req/s
mesurés au banc de charge du 14/09 : **un tiers de la capacité mesurée, consommé avant que quiconque
ait fait quoi que ce soit.** ⚠️ **Et ce ne sont pas les chemins principaux** : publications et lives
arrivent par le temps réel. Ce sont des FILETS, et **un filet a le droit d'être lent quand il ne
trouve rien.**

⚠️ **UNE SEULE AUTORITÉ POUR LES DEUX** : `filetProchainPas(pas, vivant, masquee)` (app-02), PURE —
60 s → ×1,5 → plafond 5 min, retour à 60 s au premier signe de vie. Deux copies d'une même politique
finissent toujours par diverger sur celle qu'on oublie ; le verrou refuse d'ailleurs qu'une borne
soit recopiée dans app-05 ou app-08.

⚠️ **TROIS RÈGLES, CHACUNE A COÛTÉ UNE RÉFLEXION** : ① un signe de vie rend la cadence vive,
toujours — un filet qui reculerait sans revenir mettrait cinq minutes à montrer ce que le temps réel
a manqué ; ② une page **MASQUÉE NE RECULE PAS** — reculer pendant qu'on ne regarde pas puis servir
lentement au retour serait le pire des deux ; ③ **×1,5 et non ×2** — doubler atteindrait le plafond
en quatre tours et rendrait le filet inutile sur une accalmie passagère.

⚠️ **UNE PANNE N'EST PAS UN CALME** : c'est à l'APPELANT de passer `vivant: true` sur une erreur,
sinon une coupure réseau ferait mettre cinq minutes à retrouver le fil au retour de la connexion.

⚠️ **`setInterval` NE SAIT PAS CHANGER DE PAS**, d'où une chaîne de `setTimeout` pour le fil.
Conséquence à ne pas manquer : la branche « onglet masqué » doit **RÉ-ARMER**, là où le `return`
d'avant laissait l'intervalle tourner tout seul — sans ça le filet meurt au premier passage en
arrière-plan, et on a remplacé « trop de requêtes » par « plus aucune ». La ré-arme vit dans un
`finally`, donc elle survit à la sortie précoce ET à l'exception.

⚠️ **UN LIVE QUI EXISTE GARDE LA CADENCE VIVE**, quoi qu'il arrive : c'est exactement ce que ce
filet doit rattraper, et le ralentir laisserait une bulle « 🔴 LIVE » allumée jusqu'à cinq minutes
après la fin du direct. Le recul n'est pris que si la liste était vide AVANT le tour et l'est encore
APRÈS — `supaRefreshVideoLives` rend `false` sur une coupure comme sur un vrai calme (elle replie
sur un tableau vide), donc une seule observation ne suffit pas. Elle **REND son verdict** depuis ce
lot ; ses quatre appelants d'avant l'ignorent, aucun contrat ne change.

⚠️ **ET LE BANC A CHANGÉ DE FORME EN COURS DE ROUTE — leçon d'outillage.** Une première rédaction
pilotait le temps avec `page.clock.install()` posé APRÈS le démarrage : la page se fermait au milieu
des tours (les rendez-vous de l'application s'empilent dans la fenêtre avancée), et les trois cas
échouaient **sur leur outillage, jamais sur leur sujet**. **Un banc qui meurt de son propre
instrument ne mesure rien.** La politique a donc été extraite en fonction PURE — meilleur code ET
éprouvable sans horloge — et le câblage est mesuré à la SOURCE, comme pour les lots précédents.

Verrou : `tests/e2e/capacite-amplification.spec.js` ⑩ → ⑪ bis (6 cas), dont la suite exacte des pas
(90 000 / 135 000 / 202 500 / 300 000), le plafond, la page masquée, les entrées absurdes, et quatre
contrôles de câblage à la source.

## 🧪 LE RÉFÉRENTIEL ÉTAIT CHARGÉ PAR LA CI, ET LE BANC NE MESURAIT PAS CE QU'IL CROYAIT (2026-09-20, la suite)

Troisième volet de « capacité ». Première lecture du CPU de la base **avec le bon dénominateur** —
une requête d'inventaire calculait ses parts sur le seul sous-ensemble « passions » et rendait
**69 %** là où il y a **5,92 %** : un `sum(...) over ()` posé après un `where` ne totalise que ce que
le `where` a laissé. **Une part se lit toujours contre le total, jamais contre le filtre.** Dossier :
`docs/CAPACITE_CI_ET_BANC_2026-09-20.md`.

⚠️ **LE RÉFÉRENTIEL DES PASSIONS EST LA 3ᵉ REQUÊTE DE TOUTE LA BASE — ET AUCUN UTILISATEUR N'EST
DERRIÈRE.** `select id from passions where status='active'` : **2 900 511 appels, 4 368 s, 5,92 %**
du CPU, pour DIX comptes. `chargerReferentielPassions` pagine par 1 000, donc **six requêtes par
démarrage de page** : 2 900 511 / 6 = **~483 000 démarrages**, soit **~3 750 par JOUR** sur 129
jours. La production porte DIX comptes — même à dix sessions quotidiennes chacun, cela ferait 2,6 %
du total. ⚠️ **Le contre-témoin est indépendant et corrobore** : la variante SANS le filtre `status`
— le client d'avant le 2026-09-09, vivant ~11 jours — porte 141 520 appels, soit **~2 100
démarrages par jour**, même ordre de grandeur par un calcul distinct. ⚠️ **Le comptage textuel de la
suite (716 occurrences de boot) est une CORROBORATION, pas la mesure** : il SOUS-ESTIME, un boot
posé dans un `beforeEach` servant autant de cas que le fichier en porte. Ne pas rebâtir le constat
dessus. S'y ajoutent **~140 ko
d'identifiants par démarrage**, soit **~100 Mo d'egress par run**, que nul test ne lit. C'est la
famille de l'avatar de 2,59 Mo demandé 399 fois : **un coût de production payé par les tests, par un
chemin que personne ne regarde** — `passions` n'était pas dans `TABLES_DISTANTES`, et personne
n'avait de raison de l'y chercher.

⚠️ **ON NE RÉPOND PAS `[]`, ON SERT LE MIROIR.** `data/passions-v1.json` n'est pas une imitation :
c'est le miroir GÉNÉRÉ de cette table (même source `data/passions/*.js` que
`migration_passions_plat.sql`, égalité tenue par `npm run passions:verifier`). Une réponse vide
laisserait `estPassionCanonique` au plancher des 19 du socle : une suite qui publie sous une passion
du référentiel rougirait pour une raison étrangère à son sujet — et **une suite qui passerait quand
même cesserait d'exercer la liste blanche sans que rien ne le dise**. Divergence assumée : les
passions `user_suggested` (6 en prod) ne sont pas dans le miroir, donc aucun test ne peut s'appuyer
dessus — ce qui est la bonne règle de toute façon.

⚠️ **LE DÉFAUT QUE MON PROPRE CORRECTIF A INTRODUIT, ET QUE HUIT VERROUS VERTS N'ONT PAS VU.**
`postgrest-js` 2.116 traduit `.range(a,b)` en paramètres d'URL **`offset`/`limit`**, JAMAIS en
en-tête `Range` (lu dans `js/vendor/supabase-js-2.116.0.js`, confirmé par le SQL de prod
`LIMIT $1 OFFSET $2`). La route ne lisant que l'en-tête, chaque page revenait **pleine** : le
chargeur partait pour ses **quarante** pages (`PAGES_MAX`), journalisait « référentiel TRONQUÉ » et
ne posait jamais `complet` — donc rechargeait à chaque appel. **Un correctif de charge qui
MULTIPLIAIT la charge par sept.** ⚠️ Les huit verrous étaient verts parce qu'ils interrogeaient la
route avec **leur propre `fetch`** : ils mesuraient le faux serveur, pas le produit. Le 9ᵉ cas — qui
laisse le vrai chargeur paginer et COMPTE ce qui part — l'a trouvé en une exécution. **Un banc qui
pose lui-même la requête ne mesure pas le client qui la pose** (la faute `_notifierMessage`, sous un
autre angle).

⚠️ **UNE ROUTE D'ISOLATION ÉCRASE CELLE D'UNE SUITE, EN SILENCE.** Playwright donne la priorité à la
route enregistrée en **DERNIER** : `creation-passion` ⑬ posait sa propre route `passions → []`
AVANT `bootOnboarded` (c'est le chargement du BOOT qu'elle contrôle), et la nouvelle l'écrasait —
le cache se remplissait, le chargeur ressortait sur sa garde « déjà complet », et le cas mesurait
**le contraire de son sujet**. D'où `opts.sansMiroirPassions`, échappatoire ÉTROITE : lui faire poser
`sansIsolationDesDonnees` aurait rendu à la production ses posts, ses stories, ses médias et son
canal temps réel pour un besoin qui ne porte que sur une table. **Une échappatoire large est une
isolation qu'on retire par mégarde.**

⚠️ **LE BANC DE CHARGE NE MESURAIT PAS LA SEULE FORME QUADRATIQUE DU PRODUIT.** `scripts/charge.mjs`
s'abonnait à **UNE** liaison `postgres_changes`, **filtrée** sur son propre uid. L'app en pose
**DOUZE**, dont **dix sans filtre**. Or un filtre de colonne est tranché AVANT de toucher la base :
le banc ne faisait évaluer presque rien, là où le temps réel est 66 % du CPU (68,9 % avec la seconde
forme de décodage WAL — d'où les « ~69 % » de la fiche d'hier : même poste, pas une contradiction)
avec un facteur ×13. Il mesurait la latence d'un client gratuit, et on en tirait un chiffre de
capacité. Il pose désormais les douze ; la corrélation est bornée à `posts` (le canal porte
maintenant aussi `post_comments`, `video_lives`… dont les lignes ont un `id`).
⚠️ **DOUZE ET NON TREIZE — LE PREMIER JET DE CE LOT A ÉCRIT LE MAUVAIS CHIFFRE**, relevé par
`audit-passio`. app-08 porte bien une treizième ligne `.on(...)` sur `conv_messages` (6267), mais
elle est **CONDITIONNELLE** (`if (!PASSIO_REALTIME_V3 && !…_V2)`) et `PASSIO_REALTIME_V3` vaut `true`
par défaut (app-08:5957) : **aucun client réel ne la pose**. L'y recopier faisait abonner le banc
SANS FILTRE à la table la plus écrite du produit, sur un chemin que personne n'emprunte — le banc
aurait rendu un chiffre de capacité trop BAS, et « recopiées d'app-08 » aurait été lu comme une
vérité par la session suivante. **Compter les `.on(` d'un fichier n'est pas compter ce que
l'application exécute** ; `audit:realtime`, qui est un grep, ne voit pas cette condition non plus. ⚠️ **Et la recherche n'exerçait que le
cas favorable** : « rando », cinq lettres, 0,4 à 2,9 ms — alors que tout le coût est dans les
frappes courtes. Elle exerce **trois lettres**, le pire cas que `LONGUEUR_MIN_SERVEUR` permet encore ;
descendre à une ou deux mesurerait une charge que plus aucun client n'émet.

⚠️ **LA GATE REALTIME NE LISAIT QU'UNE TABLE PAR BLOC.** `audit-realtime-publication.js` prenait le
PREMIER nom de table de la fenêtre. Une jonction WebSocket brute passe ses liaisons en bloc : un
marqueur, treize liaisons — **douze sur treize hors garde**, et « 16 souscriptions scannées » pour un
dépôt qui en porte **28**. Elle lit désormais le bloc entier entre crochets, et **seulement cette
forme** : élargir la fenêtre du cas normal déborderait sur le corps du callback suivant, où un
`table:` désigne parfois une table REST (app-04 en a un). ⚠️ **Le commentaire qui explique la règle
DÉCLENCHE la règle** — mon premier jet citait l'exemple que la gate cherche, elle a refusé le fichier
en se citant elle-même : c'est le piège qu'elle avait déjà dû fermer sur elle-même le 19/09, rejoué
dans un autre fichier. ⚠️ **Le NOM de la variable porte le marqueur** : renommer le tableau des
liaisons rendrait les treize invisibles, sans une erreur.

⚠️ **DEUX POSTES QUE LA FICHE D'HIER NE NOMMAIT PAS** : ① **le pilotage est le DEUXIÈME consommateur
de la base — 8,66 % du CPU** en lectures `telemetry_events` (6,68 + 1,36 + 0,62) ; c'est du
`service_role` depuis `dashboard/`, pas des utilisateurs, et à ne pas confondre avec l'ÉCRITURE de
télémétrie (0,66 %), qui est le chemin client. Deux cibles mesurées, **non traitées ici
délibérément** (autre lot, autres tests — les mêler à cette PR compliquerait la contre-revue) :
`select user_id, received_at … env = $2` (97 666 appels, **50,5 ms**, `kpi.js:87` /
`retention.js:102`, appelée toutes les ~2 min) et surtout **`count: "exact"`** (5 159 appels,
**194,4 ms**) — PostgREST compte alors TOUTE la table à chaque appel ; `observation.js:92` est une
sonde de vivacité qui `limit(1)` et n'a aucune raison de la compter. ⚠️ Ne PAS l'appliquer en
aveugle à `reconcile.js:70` / `exploitation.js:39`, qui comparent peut-être des comptes EXACTS. ② `SELECT name FROM
pg_timezone_names` : **704 ms de moyenne, 2 % du CPU** pour 2 098 appels — ce n'est PAS du code
PASSIO (rechargement de cache de schéma PostgREST / tableau de bord). Nommés pour que personne ne
reparte l'enquête ; aucun des deux n'est traité ici.

⚠️ **CE QUI A ÉTÉ CHERCHÉ ET N'A RIEN DONNÉ** : aucune troisième lecture REST de `passions` (deux
seulement — `app-02:2084` et `passions-flat.js:1126`, les deux couvertes) ; aucune table voisine
attrapée par le motif (`passion_quotas`, `passion_requests`, `rpc/rechercher_passions` n'y
correspondent pas).

Verrous : `tests/e2e/isolation-referentiel-passions.spec.js` (9) et
`tests/unit/audit-realtime-publication.test.mjs` (3, ajouté à `npm run verif`). **Éprouvés par
RÉINJECTION de quatre mutations** — route retirée (**6 rouges**), miroir remplacé par `[]` (**5**),
`offset`/`limit` ignorés, c'est-à-dire le défaut d'origine (**4**, dont le 9ᵉ cas), forme tableau
rendue illisible à la gate (**3**).
⚠️ **LE PLANCHER DU VERROU CHIFFRÉ EST 27, PAS 28, ET C'EST DÉLIBÉRÉ** : le compte du jour porte un
**FANTÔME** — `app-08:6264` est un COMMENTAIRE qui contient le marqueur, et sa fenêtre de 400
caractères attrape la table de la ligne 6267. Reformuler ce commentaire ferait tomber le compte sans
qu'aucune souscription n'ait bougé, et **un verrou qui rougit sur un innocent finit par être
désarmé**. 27 reste rouge sur la vraie régression (branche « bloc » cassée → ~17). ⚠️ `creation-passion` ⑭ reste rouge **en local sur `origin/main` PUR** (rejoué en
worktree séparé, port 8099) — divergence d'environnement déjà écrite, étrangère au lot.

## 💾 STOCKAGE : LE MÉNAGE EST UTILE, LE MUR N'ÉTAIT PAS LÀ — LE FORFAIT EST **PRO** (2026-09-20)

Benjamin, après trois volets de capacité : « les résultats ne me conviennent, je veux beaucoup plus
de volume d'utilisateurs ». Ce lot devait enfin lire le forfait — le point que la fiche de la veille
laissait ouvert en toutes lettres (« le forfait Supabase n'a jamais été LU »). Dossier :
`docs/CAPACITE_STOCKAGE_2026-09-20.md`.

⚠️ **ET IL NE L'A PAS LU : IL L'A DÉDUIT, ET LA DÉDUCTION ÉTAIT FAUSSE D'UN FACTEUR 100.** La
première rédaction titrait « le mur le plus proche, c'est 1 Go de stockage » et concluait à
**≈ 125 comptes**. Le 1 Go venait du palier GRATUIT, supposé depuis la consigne « sans investir » —
jamais mesuré. **L'organisation est sur le forfait PRO** (capture de la page Billing, 2026-09-20 :
« Pro Plan », 25 $/mois, crédits de calcul 9,66 $ absorbés, facture projetée 28,75 $). Le stockage
est donc à **deux ordres de grandeur** au-dessus des 80 Mo consommés, et **le mur n'est pas là.**
**Une déduction présentée comme une mesure est la faute que ce fichier reproche partout ailleurs**
(« l'état ne se lit pas dans un fichier du dépôt, il se mesure ») — ici elle portait sur le forfait,
et elle a failli lancer un chantier Cloudflare R2 entier pour rien.

⚠️ **LE SPEND CAP EST ACTIVÉ, DONC LES QUOTAS RESTENT DES MURS DURS — ils ne deviennent pas une
facture.** Texte de la page : *« You won't be charged any extra for usage. However, your projects
could become unresponsive or enter read only mode if you exceed the included quota. »* Dépasser ne
coûte pas d'argent, ça met la production en **lecture seule**. Le raisonnement « plafond = mur » de
tous les lots de capacité TIENT ; seuls les nombres changent.

⚠️ **LES QUOTAS CHIFFRÉS DU PRO ONT ÉTÉ LUS LE JOUR MÊME, sur la page Usage** — ce paragraphe a dit
le contraire quelques heures : voir la fiche « 🔌 LE MUR EST UNE CONNEXION WEBSOCKET » pour le
tableau complet. Ce qu'il faut en retenir ici : **le stockage est à 0,139 Go sur 100**, donc le mur
n'est pas là et ne le sera pas avant longtemps ; le plus proche qui monte avec la fréquentation est
**Realtime Concurrent Peak Connections, 84/500**. L'autre plafond établi, **inscriptions 300/jour
chez Brevo, illimitées par Google**, ne dépend pas de Supabase.

⚠️ **CE QUI RESTE VRAI DU LOT, ET POURQUOI IL GARDE SA VALEUR** : 67 % du stockage est du déchet
(ci-dessous), et ça ne dépend d'aucun plafond — c'est 53,5 Mo qu'on ne sauvegarde plus, qu'on ne
restaure plus et qu'on ne paie plus à personne. **Sept vidéos = 59 Mo sur les 70 du seau `content`**,
la plus grosse 24 Mo, les trois plus grosses de JUILLET (le compresseur du 19/09 ne s'applique
qu'aux nouveaux envois) : ça reste une charge utile servie à des téléphones sur données mobiles,
argument qui n'a jamais eu besoin d'un quota pour tenir.

⚠️ **ET UN VRAI POSTE DE COÛT A ÉTÉ VU SUR LA MÊME CAPTURE** : la facture projetée est **28,75 $**
pour 25 $ de forfait, parce que les crédits de calcul (10 $) sont dépassés par **DEUX** projets —
`PASSIO74's Project` (Micro, 578 h) **et `PASSIO staging` (Micro, 141 h)**, ce dernier rallumé pour
l'exercice de restauration du 14/09 et jamais remis en pause. **Mettre le staging en pause ramène la
facture à 25 $**, ce qui est le sens littéral de « sans investir ». Geste d'exploitation, hors dépôt.
⚠️ **ET LE PLAFOND QUI BORNE VRAIMENT L'ACQUISITION NE SE CORRIGE PAS PAR DU CODE** : 300 e-mails
par jour, confirmation obligatoire depuis le 30/08. Le seul geste qui l'a levé est d'avoir remonté
**Google en tête** (19/09) ; Apple Sign-In ferait pareil, gratuitement.

⚠️ **67 % DU STOCKAGE NE SERT PLUS À RIEN** : `content` 24 orphelins/60 = **50 Mo sur 70**,
`attachments` 7/12 = **3,5 Mo sur 10**, soit **53,5 Mo sur 80**. Purger fait passer le stockage à
**26,5 Mo**, sans toucher une donnée vivante. ⚠️ La première rédaction vendait ça comme « marge ×3
sur le mur le plus proche » : **il n'y a pas de mur à cette distance**, et le geste n'en avait pas
besoin — on ne garde pas 53,5 Mo de fichiers que plus rien ne référence.
⚠️ **LA PREMIÈRE MESURE ANNONÇAIT 62 Mo, ET ELLE ÉTAIT FAUSSE** : elle ne lisait pas `user_state`,
le blob qui porte les **publications PERSO** — six objets, 12 Mo, bien vivants. **Une mesure
spectaculaire se re-vérifie avant d'y croire**, surtout quand elle décide de suppressions.

⚠️ **UN ORPHELIN EST UNE ABSENCE DE PREUVE, PAS UNE PREUVE D'ABSENCE** — c'est tout le danger de
`npm run medias:orphelins` (`scripts/medias-orphelins.js`, cœur PUR `classerOrphelins`) : un objet
est déclaré orphelin parce qu'on n'a trouvé son nom **nulle part**, et « orphelin » veut dire
« supprimé ». Toute source oubliée **fabrique** des suppressions. QUATRE gardes, trois mécaniques :
① rapport par défaut (`--appliquer` seul supprime) ; ② **âge minimum 30 j** — l'upload précède
l'INSERT, et une publication hors ligne attend dans sa file ; ③ **fail-closed** : une source
illisible fait LEVER, on ne réduit jamais la liste ; ④ plafond de 200 par exécution — un chiffre
inattendu est un signal, pas une quantité de travail. **Les CINQ sources** : `posts`, `profiles`,
`stories`, `conv_messages`, **`user_state`** (celle qu'on oublie).

⚠️ **MA JUSTIFICATION DU CHOIX « NOM DE FICHIER » ÉTAIT FAUSSE, ET LA RÉINJECTION L'A DIT.**
J'avais écrit « comparer l'URL entière classerait orphelin tout média publié avant le CDN » : faux —
le chemin de l'objet est sous-chaîne de l'URL Supabase **comme** de l'URL CDN, donc la mutation
laissait le cas **VERT**. La vraie raison est le **SENS DE L'ERREUR** : le nom seul est plus
permissif, donc tous les faux positifs vont vers « on garde », jamais vers « on supprime ». Le cas
② bis mesure enfin ce choix (une référence qui porte le nom SANS son dossier). **Deuxième fois de la
journée qu'une justification est démentie par une mutation** — après le chiffre-phare de #515.

⚠️ **NE PAS PARTIR SUR CLOUDFLARE R2 — LA PREMIÈRE RÉDACTION LE RECOMMANDAIT COMME « le seul levier
d'ordre de grandeur », ET C'ÉTAIT LA CONSÉQUENCE DIRECTE DU FORFAIT MAL DÉDUIT.** R2 offrirait 10 Go
là où le Pro en donne deux ordres de grandeur de plus : on aurait migré **vers un plafond plus bas**,
en ajoutant un fournisseur, un signeur SigV4 et une seconde origine à maintenir. Le chantier a été
arrêté avant le premier commit. ⚠️ Et si quelqu'un le rouvre un jour : **le seau `attachments` ne
peut PAS migrer** — R2 n'a pas de RLS, et la confidentialité des pièces jointes repose entièrement
sur `is_conv_member` + URL signées ; seul `content` serait éligible.
⚠️ **CE QUE LE LOT NE FAIT TOUJOURS PAS** : il ne change pas le RYTHME de remplissage (8 Mo par
compte). Restent nommés, et ils valent pour la charge utile mobile bien avant de valoir pour un
quota : recompresser les sept vidéos de juillet (59 → ~11 Mo), WebP (−25/30 %), Apple Sign-In.
⚠️ **La rétention de télémétrie 7 j → 2 j sort de la liste** : elle était motivée par « 43 % d'une
base plafonnée à 500 Mo ». Le plafond du Pro est ailleurs, la base fait 71 Mo — **une migration, donc
une contre-revue humaine, pour un problème qui n'existe pas.**

Verrou : `tests/unit/medias-orphelins.test.mjs` (9, dans `npm run verif`), **éprouvé par RÉINJECTION
de quatre mutations** — garde d'âge retirée (3 rouges), chemin entier au lieu du nom (2), nom vide
classé orphelin (1), source `user_state` retirée (1).

## 🔌 LE MUR EST UNE CONNEXION WEBSOCKET, ET 98 % ÉTAIENT PAYÉES POUR RIEN (2026-09-20)

Demande de Benjamin : « trouve une solution gratuite pour augmenter considérablement le nombre de
connexion / utilisateur ! Y a-t-il pas d'autres outils ? » Cinquième volet de capacité, et le premier
qui **LIT** le forfait au lieu de le déduire. Dossier : `docs/CAPACITE_CONNEXIONS_TEMPS_REEL_2026-09-20.md`.

⚠️ **LES PLAFONDS DU PRO SONT ENFIN MESURÉS** (page Usage, cycle 27/08–27/09) : Image
Transformations **19/100** · **Realtime Concurrent Peak Connections 84/500** · Egress 36,98/250 Go ·
Cached Egress 24,69/250 Go · MAU **8 560/100 000** · Realtime Messages 253 510/5 000 000 · Storage
0,139/100 Go · Edge Functions 2 440/2 000 000. Le point ouvert « le forfait Supabase n'a jamais été
LU » est **FERMÉ**.
⚠️ **LA PART LA PLUS HAUTE N'EST PAS LE MUR** : les transformations d'images (19 %) comptent des
images d'ORIGINE distinctes — ce compteur suit le catalogue, pas la fréquentation. Le classement qui
décide d'un lot de capacité est « qu'est-ce qui monte quand il y a plus de monde ». Marges (plafond ÷
consommé) : **Realtime ×5,95 · Egress ×6,76** · Cached Egress ×10,1 · MAU ×11,7. Le mur le plus
proche est le temps réel, **avec l'egress juste derrière**.
⚠️ **ET CE « JUSTE DERRIÈRE » EST UNE CORRECTION : « egress ×17 » a été publié ici.** Le calcul était
`250 / 14,79` — le plafond divisé par le **POURCENTAGE** au lieu de la consommation. Les deux autres
marges étant justes, l'erreur était invisible à la relecture, et elle rangeait l'egress troisième
alors qu'il est second. **Lire un nombre ne suffit pas, il faut encore le diviser par le bon** — et
ça compte ici, puisque le remède du lot pousse précisément sur l'egress.

⚠️ **ET CE QUOTA NE COMPTE NI DES CANAUX NI DES MESSAGES : IL COMPTE DES CLIENTS.** supabase-js
multiplexe TOUS les canaux d'un client sur UN SEUL WebSocket : « 500 connexions » veut dire « 500
personnes dont l'onglet est ouvert en même temps ». Le réflexe « réduisons le nombre de canaux » est
donc sans effet sur ce compteur — la consolidation de 2026-07-15 (9 canaux → 1) n'a jamais pu y
peser, et une dixième liaison n'y pèsera pas davantage. Ne pas rouvrir ce point par les canaux.

⚠️ **97,9 % DE CES CONNEXIONS N'AVAIENT RIEN À FAIRE LÀ** : mesuré sur 7 jours, **2 546 sessions sans
compte sur 2 600**, et `supaSubscribe` créait `realtime:db` SANS CONDITION (policy ouverte à `anon`).
`connexionTempsReelAutorisee()` (app-02, délègue à `_uidEstUnCompte`) est la SEULE autorité ; la
garde précède la pose de `_supaSubscribed`, sinon le compte qui vient de se créer resterait sans
temps réel toute la session (`onAuthStateChange` rappelle `supaInit`).

⚠️ **CE QUE LE VISITEUR PERD EST RÉEL, ET LA PREMIÈRE RÉDACTION L'A NIÉ** — relevé par `audit-passio`
après que tout était vert, et **aucun verrou n'aurait pu le démentir**. Elle écrivait « rien qu'il
puisse recevoir » : `_creerCanalDb` porte treize `.on(`, mais **un client réel n'en pose que DOUZE**
(la première, `conv_messages`, est sous `if (!PASSIO_REALTIME_V3 && !…_V2)`, et V3 vaut `true`).
**TROIS** ne le concernent pas (`conv_members`/`notifications` filtrées sur un identifiant qui
n'existe pas côté serveur, `conv_reads` retenue par la seule RLS), **NEUF portent du contenu PUBLIC
qu'il reçoit très bien** (`posts`, `post_likes` ×2, `post_comments`, `event_comments`,
`comment_interactions` ×2, `video_lives`, `profiles` UPDATE). Ce qu'il perd est le RAFRAÎCHISSEMENT
VIF du public.
⚠️ **CE COMPTE A ÉTÉ FAUX DEUX FOIS DE SUITE, ET LA SECONDE EST LA PLUS INSTRUCTIVE** : « sept et
six » de mémoire, puis « quatre et neuf sur treize » — compté cette fois, mais en comptant les `.on(`
du FICHIER au lieu de ce que l'application EXÉCUTE, c'est-à-dire **mot pour mot le piège consigné le
matin même** deux sections plus haut (« DOUZE ET NON TREIZE… elle est CONDITIONNELLE »). **Une leçon
écrite ne protège que celui qui va la relire.**

⚠️ **D'OÙ LE COUPLAGE AVEC LE LOT DE LA VEILLE, ET SANS LUI CE LOT COÛTAIT PLUS QU'IL NE RAPPORTAIT.**
Les deux filets reculent jusqu'à 5 min quand ils ne trouvent rien, justifié par « ça arrive par le
temps réel » : retirez le temps réel au visiteur et **ils deviennent son seul chemin**. `seulChemin`
les tient à 60 s pour lui — la latence qu'un compte subit déjà quand son canal décroche. ⚠️ **Le filet
des LIVES portait le même couplage et n'a pas été traité du premier coup, ni mesuré** (le cas ④ ne
lisait qu'app-08) : un visiteur aurait gardé une bulle « 🔴 LIVE » allumée cinq minutes après la fin
du direct.

⚠️ **ET LE MARCHÉ A DEUX TERMES — LA PREMIÈRE RÉDACTION N'EN COMPTAIT QU'UN**, partout (« 60 s de
latence contre 97,9 % d'un quota de 500 »). Mesuré : **un tour du filet du fil = QUATRE requêtes**
(`posts`, puis `post_likes`, `post_comments`, `comment_interactions`), et il tourne pour tout le
monde. `seulChemin` vrai en permanence = 5 req/min au lieu de ~1 : **×5, en régime permanent, chez
les 98 % qu'on prétend soulager** — et `supaLoadPosts()` à 60 s **est** le poste dominant de la base
(fiche « amplification », un balayage de `profiles` par ligne évaluée). Le lot aurait **restauré pour
98 % des onglets ce que la veille venait de réduire**, en poussant sur l'egress, le second mur.
⚠️ **D'OÙ LA BORNE** : `filetEstLeSeulChemin()` (app-02, autorité des DEUX filets) n'est vraie que
**pendant qu'on regarde le fil** (`#screen-feed.active`) ; ailleurs leur fraîcheur n'est visible nulle
part et ils reculent comme avant, `goTo("feed")` les réveillant au retour (sans quoi on aurait borné
le coût en servant du périmé). L'onglet masqué était déjà couvert par `filetProchainPas`.
⚠️ **Une justification à un seul terme n'est pas une justification, c'est une publicité** — et elle a
survécu à une passe d'audit et à dix verrous verts, parce qu'aucun verrou ne mesure ce qu'un texte
omet.

⚠️ **L'AUTORITÉ ÉCHOUE OUVERT, DANS LE MÊME SENS QUE SES APPELANTS** : ils la lisent par
`typeof … === "function" && !…()`, donc autorité absente la connexion s'ouvre. Un `catch` qui
refuserait irait à l'INVERSE du câblage et couperait le temps réel d'un vrai compte pour une cause
que personne ne pourrait nommer (`_uidEstUnCompte` porte déjà son propre `catch` : ce chemin est une
impossibilité, on la TRACE). Même jurisprudence que `requireAdmission`.

⚠️ **CINQ SURFACES DE GESTE RESTAIENT ATTEIGNABLES SANS COMPTE — le lot mesurait le BOOT et se
taisait sur les gestes**, et il en a d'abord nommé deux : ① ouvrir une conversation de DÉMONSTRATION
(`_subscribeTyping`, app-04 ; sa voisine `_supaConvSpecificChannel` est gardée aussi mais **ne fuyait
pas en production**, son `if (PASSIO_REALTIME_V3) return;` la rendant inerte par défaut) · ② taper une
bulle « 🔴 LIVE » (`joinVideoLive`) · ③ **lancer** un live (`startVideoLive`, le jumeau : aucun canal
ne fuyait, la RLS refusant l'INSERT avant, mais un visiteur obtenait **la demande de permission
caméra** avant d'être refusé — contraire à « première visite : aucune demande de permission ») ·
④ un **lien profond `?call=<id>&from=<uuid>`** (`_checkIncomingCallFromUrl`, armé au boot pour tout le
monde, attendant `_supaReal && MY_UID` — vrai pour un `u_…` : le visiteur voyait l'écran d'appel et,
qu'il accepte **ou refuse**, ouvrait `call:<id>` ; gardé à l'entonnoir `handlePushIncomingCall`, qui
couvre aussi le message `INCOMING_CALL` du SW) · ⑤ `startCall`, même idiome, sans fuite réelle.
**Toutes les cinq ont été trouvées par une relecture adversariale APRÈS des gates vertes, jamais par
un verrou** — d'où l'inventaire déclaré des PORTES (cas ⑤ bis). ⚠️ `ring:<uid>` n'était PAS du lot :
gardé par `admissionCompteReel` depuis le 2026-09-11 — un visiteur ouvrait DEUX canaux au repos.

⚠️ **LES AUTRES OUTILS SONT TOUS PLUS BAS, ET C'EST LA DEUXIÈME FOIS DU JOUR QU'ON L'ÉVITE** : Ably
200, Pusher Channels 100, Cloudflare Durable Objects payant — contre 500 ici. On aurait migré VERS UN
PLAFOND PLUS BAS, en ajoutant un fournisseur et une seconde origine : exactement la faute R2 du
dossier stockage. **Avant de changer de fournisseur, lire le plafond de celui qu'on a.**

⚠️ **CE QUE LE LOT CHANGE VRAIMENT, ET C'EST LA BONNE FAÇON DE LE DIRE** : le plafond n'est pas
repoussé, il **change de population**. Avant, l'application ouvrait un canal par client, donc les 500
bornaient **toute personne dont l'onglet est ouvert**. Après, elles ne bornent plus que les **comptes
simultanés** — un visiteur n'y compte plus du tout. « 500 personnes » devient « 500 comptes
simultanés, visiteurs illimités », et c'est le contraire d'un réglage : c'est le plafond qui cesse de
s'appliquer à 97,9 % du trafic.

⚠️ **DEUX CHIFFRES DE LA PAGE USAGE SENTENT LA CI, ET C'EST UNE HYPOTHÈSE, PAS UNE MESURE** :
**8 560 MAU pour dix comptes réels** et **37 Go d'egress**. `profiles` n'est délibérément PAS dans
`TABLES_DISTANTES` (une lecture rendue vide ferait tenter une ÉCRITURE en production), donc chaque
`page.goto` des bancs touche le projet — même famille que l'avatar de 2,59 Mo demandé 399 fois. **À
MESURER avant d'y croire** (répartition des MAU par jour, creux du week-end contre les heures de CI) :
les deux chiffres-phares faux du 20/09 sont nés d'exactement ce raccourci.

⚠️ **LE GAIN EST UNE ATTENTE, PAS UNE MESURE, tant que la page Usage n'est pas relue après
déploiement.** Deux chiffres-phares du même jour ont déjà été faux (le « 1 Go » du stockage, le
« 91 % de travail » de #515). Attendu : le pic tombe de 84 vers l'ordre de la poignée, et le mur
suivant devient **l'egress (×6,8)** — cette ligne a dit « MAU » tant que la marge d'egress était mal
calculée. ⚠️ **Et « 84 » et « 97,9 % » ne parlent pas de la même population** : l'un est un pic de
SIMULTANÉITÉ, l'autre une part de SESSIONS sur 7 jours, et un onglet de compte reste ouvert bien plus
longtemps qu'une visite de passage — la part des comptes dans le pic est donc mécaniquement
supérieure à 2,1 %.

Verrou : `tests/e2e/capacite-connexions-temps-reel.spec.js` (**10**), **éprouvé par RÉINJECTION de
huit mutations** — garde retirée de `supaSubscribe` (4 rouges), drapeau posé avant la garde (1),
couplage retiré du filet des lives (1), gardes de geste retirées (2), autorité rendue fail-closed (1),
borne « fil à l'écran » retirée (1), réveil retiré de `goTo` (1), porte de canal non déclarée (1).
⚠️ **QUATRE PIÈGES DE BANC, ET DEUX VERROUS QUI NE VERROUILLAIENT RIEN** : ① une tranche prise sur un
nombre magique cesse de couvrir sa fonction dès qu'elle grandit, **sans un rouge** (`slice(i, i+2600)`
s'arrêtait à UN caractère de la fin) — on lit jusqu'à l'accolade fermante ; ② un verrou qui épingle
une EXPRESSION littérale rougit sur le lot suivant pour une raison qui n'est pas la sienne
(`capacite-amplification` ⑪) — il mesure les TROIS TERMES ; ③ **puis le même verrou l'a refait deux
fois DANS le lot qui corrigeait la règle** : un `toBe(2)` de lecteurs par fichier (une garde légitime
le fait rougir), puis un balayage de fichiers entiers qui **a rougi sur TROIS innocents**
(`app-04:5340`, `app-05:569`, `app-08:1863` — tous posent la condition sur *quelqu'un d'autre*) ; il
mesure enfin DANS le corps de chaque fonction gardée. **Un verrou qui rougit sur un innocent finit
par être désarmé**, et c'est la première fois que c'est le verrou gardien de la règle qui l'enfreint ;
④ **UN VERROU VIDE EST PIRE QUE PAS DE VERROU** : le cas qui mesurait le BOOT d'un visiteur au
navigateur ne pouvait rien prouver — mesuré, `supaInit` n'atteint JAMAIS `supaSubscribe` sous
l'isolation de `bootOnboarded`, donc il restait VERT avec la garde retirée. Remplacé par
l'**inventaire déclaré des PORTES** (chaque site de création de canal, avec la raison qu'un visiteur
ne l'atteint pas, patron de `tests-isolation-socle.json`) : il ne prouve pas l'inatteignabilité —
aucun grep ne le peut — **il force à l'écrire**, et une porte neuve rougit jusque-là.
⚠️ **ET UN RALENTISSEMENT DE BANC QUI NE VENAIT PAS DE CE LOT** : `compteurVliveAuCalme` attendait
`_dbChan`, jamais posé sous l'isolation (même raison), donc chacun de ses quatre appels payait ses
20 s — **avant comme après**, et je l'ai d'abord attribué au lot. Signal porté à quatre témoins et
**borné à 6 s**, la boucle de stabilité restant le vrai garant : **1 min 54 → 1 min 00**.
⚠️ **`diagLog` NE PRENAIT QU'UN ARGUMENT, ET HUIT APPELS EN PASSAIENT DEUX** — `diagLog("vlive_filet",
e && e.message)` jetait le message d'erreur EN SILENCE, donc un filet en panne était indiscernable
d'un filet au calme, et la Sentinelle ne voit que ce qui est journalisé. Corriger les huit appelants
aurait laissé le neuvième refaire la faute : **c'est l'AUTORITÉ qui accepte le reste**, en le joignant.

## 📉 CAPACITÉ, QUATRE LOTS : CE QUI EST LIVRÉ, CE QUI ATTEND UNE MAIN HUMAINE, ET CE QUI A ÉTÉ MESURÉ (2026-09-21)

Demande de Benjamin : « augmenter la capacité de navigation et réduire la consommation par utilisateur,
sans augmenter les abonnements ni ajouter de service payant », en quatre chantiers. Dossiers :
`docs/CAPACITE_FIL_COMPTEURS_2026-09-21.md` (PR #521, en attente de la migration), `docs/CAPACITE_IMAGES_LEGERES_2026-09-21.md`,
`docs/CAPACITE_COMPTEURS_CADENCE_2026-09-21.md`, `docs/CAPACITE_TEMPS_REEL_CIBLE_2026-09-21.md`,
synthèse et campagne staging : `docs/CAPACITE_SYNTHESE_2026-09-21.md`.

⚠️ **① LE FIL TÉLÉCHARGEAIT DES LISTES POUR EN COMPTER LA LONGUEUR — ET LE REMÈDE EST UNE MIGRATION,
DONC UNE MAIN HUMAINE.** Ni `post_likes` ni `post_comments` ne portent de clé étrangère vers `posts` (lu en
base), et les agrégats REST sont désactivés (`PGRST123`, mesuré par requête) : aucun `count` PostgREST
n'est possible. `fil_compteurs(text[])` (SECURITY INVOKER — la RLS de chaque table s'applique ligne par
ligne, exactement comme le GET d'avant ; la transaction s'ANNULE si la fonction n'était pas INVOKER) rend
compteurs exacts, mon like, deux aperçus et réactions en UNE lecture. PR #521 fusionnée et **migration appliquée le 21/09 sur staging puis production** (barrière franchie par la revue de mainteneur unique, #530 ; journal en base, mesuré : INVOKER, borne 60, `rpc/fil_compteurs` observé dans le client servi). Périmètre
critique, la CI exige la revue GitHub de PASSIO74 avec le marqueur « Contre-revue technique indépendante »,
et `.passio/migrations/relecteurs-autorises.json` était **vide** (RES-15) — aucune attestation possible.
**Levé le 21/09 par décision de Benjamin (ASTRA-61 bis, AGENTS.md)** : le fichier déclare `mainteneur_unique:
PASSIO74`, dont l'auto-revue (COMMENTED, marqueur + phrase d'assomption + fichier + `cible: <ref>`) vaut
preuve pour la barrière — décision tracée, pas revue indépendante ; retirer le champ rétablit la règle stricte.
Le client fonctionne dans les deux états (PGRST202/42883 → lectures d'avant, mémorisé par release).
⚠️ **SUR LA PRODUCTION D'AUJOURD'HUI, LA RÉPONSE GROUPÉE PÈSE 2,2 Ko DE PLUS** (4 141 → 6 380 octets
pour la vraie première page : 13 likes et 9 commentaires sur 20 publications, la structure fixe domine).
Le gain est trois requêtes de moins et un volume BORNÉ ; la bascule est à ~2 likes + 1 commentaire par
publication. Une fiche qui annoncerait « −X % d'octets » aujourd'hui mentirait.
⚠️ **La contre-revue `audit-passio` du premier jet a trouvé 4 P1 + 5 P2 après 10 verrous verts** : la
signature du filet (app-08) lisait encore `comments.length` (constante à 2 → plus de repeinte), le panneau
des Bobines ne lisait que `reel.comments` (réduit à deux lignes sans bouton), une discussion ouverte était
ramenée à deux lignes au tour suivant du filet (les objets sont REMPLACÉS), et le banc SQL ⑤ attendait que
la mutation s'applique alors que la migration l'annule. **`String(window.PASSIO_RELEASE)` vaut
« [object Object] »** — une clé de cache « par release » qui ne change jamais ; l'autorité est
`idbPassionsRelease()`. **`psql` concatène un booléen en `true`/`false`, pas `t`/`f`** : huit attentes
littérales rouges en CI, alors que les contrôles d'ÉGALITÉ fonction = lecture directe étaient verts.

⚠️ **② UNE PHOTO PUBLIÉE EXISTE EN DEUX OBJETS, ET LE MARQUEUR EST DANS LE NOM.** `.app-shell` fait 540 px
CSS au plus, mais la grille « Photos » du profil et l'album d'une activité servaient la grande (≤ 2 048 px)
pour des cellules de 120 px. `photos/<uid>/<id>.jpg.v720.webp` à côté de `<id>.jpg` ; `media_url` désigne la
LÉGÈRE (aucune colonne, aucune requête d'essai, aucun 404 ; un média d'avant n'a pas de marqueur et suit le
chemin d'avant). **Le nom de la grande, extension COMPRISE, reste dans celui de la légère** : la grande garde
le format de la source, la légère celui de l'encodage (WebP dès que possible) — la première forme
`<id>.v720.webp` perdait l'extension, `imageGrande` rendait `<id>.webp` (objet inexistant), la suppression
d'une publication ne retirait que la légère (grande facturée pour toujours) et `medias-orphelins` aurait
classé chaque grande orpheline (contre-revue du 21/09). `cheminsImageStorage` (app-02) est l'autorité de
suppression ; pour une légère de première forme, elle tente les formats connus. **Seule la publication
demande la légère** (`supaUploadMedia(…, { legere: true })`) : le dossier `photos` est COMMUN aux stories,
qui s'affichent plein écran en `object-fit: cover` — le premier jet les convertissait par erreur. Mesuré sur les DIX photos réelles de production avec la fonction du produit : grilles
**−68 %**, fil **+7 %** contre la transformation 700/q75 (WebP q0,80 contre q75 — même ordre, mais **zéro
transformation d'image**, le service compté par image d'origine, 19/100), stockage **+29 %**.
⚠️ **Une image DÉJÀ ≤ 720 px n'est pas exclue** : une 720×720 JPEG pèse 46 à 74 Ko là où son
ré-encodage en pèse ~15 — la largeur n'est qu'une des deux raisons d'être lourd. Le premier jet la sautait.
⚠️ **La grande n'est affichée NULLE PART**, et c'est écrit tel quel plutôt que de lui inventer un usage :
`imageGrande()` est prête pour un visualiseur ou un téléchargement.

⚠️ **③ LES COMPTEURS VISIBLES RECULENT QUAND RIEN NE BOUGE** — même politique que les deux filets
(`compteursProchainPas`, app-03, PURE, copie ESM dans le banc comparée par un verrou `vm`) : 15 → 22,5 →
33,75 → 50,6 → 60 s, retour à 15 s sur changement, ERREUR (une panne n'est pas un calme), carte jamais
relue, mon propre like, retour au premier plan, réseau revenu. **Un réveil pendant un tour EN COURS est
mémorisé** (`_postLikeReveilDemande`) et consommé en fin de tour : sans cela la fin du tour (jusqu'à 3 HEAD
de 8 s) écrasait le rendez-vous vif que « mon like » venait de poser (contre-revue du 21/09). **La reprise ne tire AUCUN aléa** : le verrou
« chacun leur échéance » compte les `Math.random`, et un tirage de plus l'a fait rougir. Compromis : un like
d'un autre sur une carte immobile apparaît en 60 s au pire. Économie sur CES lectures seulement.
⚠️ **PIÈGE DE BANC : `page.clock.install()` laisse le temps RÉEL s'écouler entre deux `evaluate`** — les
rendez-vous dérivaient de quelques millisecondes et le banc mourait de son instrument. `pauseAt` fige.

⚠️ **④ TEMPS RÉEL : L'INVENTAIRE MESURÉ DIT QUE LE POSTE CLIENT EST `profiles` UPDATE**, table la plus
modifiée de la base (20 795 changements, la CI retouche ses comptes à chaque run), poussée à tous (table
publique, aucun filtre) : chaque UPDATE de n'importe qui faisait chez chaque connecté une entrée de plus
dans `state.seed.users` (donc le localStorage à chaque `saveState`), un rendu du fil et un rendu des
messages. `profilConnuLocalement(uid)` (app-08) : inconnu → ignoré et compté ; connu → chemin d'avant.
Gain CLIENT, pas de quota (policy `true`, livraison inchangée).
⚠️ **`event_comments` par événement ouvert a été REFUSÉ, avec la raison** : un topic privé neuf est
refusé par `passio_rt_recevoir` (liste blanche `ring:`, `call:`, `vlive:`, `realtime:db`, `typing:`,
`conv:`, `conv_specific:`) et les canaux publics sont désactivés — une migration de policy pour **36 INSERT
en 129 jours**. Un « rien fait sur cet axe, et voilà pourquoi » vaut un constat.

⚠️ **LA CAMPAGNE STAGING MESURE UN LOT SUR QUATRE** : le banc modélise la cadence des compteurs
(`--compteurs-cadence fixe|adaptative`, même scénario, mêmes fixtures, même graine) ; le chemin
`fil_compteurs` ne peut pas y être exercé (migration non appliquée, même barrière que la production), les
images et le temps réel ciblé sont hors de sa portée. Mesuré à 100 comptes, deux passes de 90 s, verdicts valides, nettoyage complet : **−7,5 % de HEAD** sous
cette charge (les cent acteurs aiment les trois mêmes publications : 85 % des cycles sont « vivants », le
pire cas du lot), contre −33 % au banc unitaire en régime calme sur 90 s (−65 % sur 5 min par arithmétique
de la politique, non mesuré). Les deux chiffres sont vrais sur
deux populations ; aucun n'est « la capacité ». Résultats : `docs/CAPACITE_SYNTHESE_2026-09-21.md`.
⚠️ **Le poste a été tenu éveillé par `SetThreadExecutionState`** (`scripts/rester-eveille.ps1`, demande
transitoire, aucun réglage modifié) : les essais précédents à 200 étaient morts de la veille, et le verdict
`DUREE_MESURE_INVALIDE` du banc les aurait de toute façon refusés.

## 🚪 UN VISITEUR NE LIT PAS LE COMPTE QU'IL N'A PAS (2026-10-11)

Demande de Benjamin : « comment améliorer l'app maintenant, pour des millions d'utilisateurs ». Lot de
CAPACITÉ côté visiteurs — la population que le modèle « 500 comptes simultanés, visiteurs illimités »
prétend ne pas borner.
⚠️ **LE PREMIER DIAGNOSTIC ÉTAIT FAUX, ET LA FAÇON DONT IL L'ÉTAIT EST LE VRAI ENSEIGNEMENT.** Lu dans
`edge_logs` (24 h) : ~21 requêtes/min et par IP sur `profiles`, `user_state`, `conv_members`, `follows` —
annoncé à Benjamin comme « un polling toutes les ~3 s ». **Il n'y a aucun polling** : les filets sont à
60 s minimum (`filetProchainPas`), et `startAutoRefresh` est mort depuis le 2026-06-29. Ces requêtes
venaient des BANCS (`HeadlessChrome`, puis le WebKit de #595) : ~1 300 démarrages par jour contre la
production, chacun sous un identifiant `u_<aléatoire>` différent. **73 % des requêtes REST d'une journée
(15 491 sur 21 294) venaient d'eux.** Un motif lu dans les journaux de production est d'abord un motif de
BANC tant qu'on n'a pas lu l'agent utilisateur et la valeur des filtres.
⚠️ **CE QUE LA RELECTURE A TROUVÉ À LA PLACE, ET QUI VAUT AUSSI POUR LES VRAIS VISITEURS** : ces
15 491 requêtes étaient des lectures « de moi » sous l'identifiant du visiteur — `user_state` (3 906),
`profiles?id=eq.u_…` (3 890), `conv_members` (3 882), `blocks` (1 299), `follows` (1 283),
`story_views` (1 186), plus `notifications`. ~12 par visite, toutes condamnées à un 200 vide : le
`u_<aléatoire>` de `getMyUserId()` n'existe dans aucune table. Les ÉCRITURES étaient gardées depuis
#367 (`_uidEstUnCompte`, `_compteAuthReel`) ; les LECTURES non.
⚠️ **DEUX D'ENTRE ELLES RETARDAIENT LE FIL** : `supaInit` ATTEND `supaLoadUserState()` puis la lecture du
profil AVANT `supaLoadPosts()`. Sur la séquence d'un visiteur lue dans les journaux : `user_state` à
+0,0 s, profil à +0,5 s, fil à +0,8 s. Deux allers-retours payés par chaque visiteur avant de voir une
publication — sur un réseau mobile, c'est plus que la moitié d'une seconde.
**Correctif** : la garde vit DANS chaque lecteur, avec l'autorité qui garde déjà les écritures —
`supaLoadUserState` (app-02, `_uidEstUnCompte` ; trois appelants : `boot`, `supaInit`, le rejeu),
`supaLoadMyConversations`, `supaLoadNotifications`, `supaLoadBlocks`, `supaLoadStoryViews`,
`supaLoadFollowing` (app-08, `_compteAuthReel`), et le bloc « profil » de `supaInit`. Chaque lecteur rend la
valeur qu'il rendait déjà sur un résultat vide : aucun appelant ne voit la différence.
⚠️ **`supaLoadUserState` SORT PAR SON `finally`** : `_etatCompteCharge` est posé sur cette sortie comme
sur toute sortie précoce — des modules l'attendent pour trancher (`reperesAutorises`). Un visiteur ne
touche plus à `_comptePassionsServeur` : il restait `false` « par lecture vide », il reste indéfini,
c'est-à-dire « verdict non rendu » — le seul lecteur (`comptePossedeSesPassions`) ne sert qu'à un compte.
⚠️ **CE QUI N'EST PAS DE CE LOT** : ouvrir une conversation de DÉMONSTRATION lit encore `conv_reads` et
`conv_messages` sous l'identifiant du visiteur (`c_a`, `c_b`) — c'est un GESTE, pas le démarrage ; et le
référentiel des passions reste paginé en six lectures (`chargerReferentielPassions`), délibérément.
⚠️ **QUATRE SUITES LISAIENT UN « COMPTE » SOUS L'IDENTIFIANT D'UN VISITEUR** — `bootOnboarded` laisse
`MY_UID` au placeholder `u_…`, et `reprise-lectures-boot` (②–⑧), `notification-message` (⑦, ⑦ bis),
`ouverture-publique` (`supaLoadFollowing`) appelaient les lecteurs ainsi. Elles parlent désormais au nom d'un
COMPTE (uuid de banc). ⚠️ **Deux d'entre elles restaient VERTES sans plus rien exercer** : ③ (« un refus
RLS ne s'inscrit jamais ») et ④ (« une lecture aboutie acquitte ») — aucune lecture, donc rien à inscrire ni
à acquitter. Même famille que le fixture `tourSeen: true` (fiche du 2026-09-12) : un verrou vert après un
changement de garde n'a rien prouvé tant qu'on n'a pas vérifié qu'il passe encore par le chemin.
⚠️ **ET UN CINQUIÈME ÉTAIT EN COURSE AVEC LE DÉMARRAGE** : `capacite-socket-au-repos` ② posait ses stubs
pendant que le bloc différé de 2 s de `supaInit` (lives, notifications…) était encore à venir. Il ne
restait vert que parce que les deux lectures supprimées ici retardaient ce bloc au-delà de la fenêtre ; le
démarrage plus rapide le faisait tomber DEDANS, au hasard (2 rouges sur 3). Le banc attend désormais
`_supaInitTerminee` puis l'échéance du bloc (24 verts sur 24, trois répétitions).
Verrou : `tests/e2e/visiteur-sans-lectures-compte.spec.js` (4) — ① un visiteur ne lit aucune table « de
moi » et le FIL est la première requête du démarrage ; ② un compte réel les lit TOUTES (une garde trop large
couperait sa synchronisation sans un bruit) ; ③ chaque lecteur seul rend sa valeur vide, sans requête ;
④ source. **Éprouvé par RÉINJECTION** (sources de `main` remises en place) : ①, ③ et ④ rougissent, ② reste
vert — il garde l'autre sens.

---

## 🗂️ INDEX ET REALTIME : CE QUE LA MESURE A RETIRÉ, ET CE QU'ELLE A LAISSÉ (2026-11-03)

Suite de l'audit du 2026-11-02 (agent F, `rapports/F-performance-charge.md`), décisions F-05 / F-06 /
F-07 tranchées le 2026-11-03. Migration `migrations/migration_index_realtime_2026-11-03.sql` (DDL seul,
aucune donnée), banc `tests/sql/migration-index-realtime.test.sh` (18/18).

- **F-05** — `passions_trgm_idx` était le doublon STRICT de `passions_normalized_trgm` (même
  `gin (normalized_label gin_trgm_ops)`, 1 scan contre 11 743 en 173 jours) ; `passions_aliases_gin`
  n'avait servi à rien depuis le 13/05 (la recherche passe par la colonne `recherche`). Les deux sont
  retirés. ⚠️ **Les AUTRES index « jamais lus » (events, reports, moderation_actions) restent** : sur des
  tables quasi vides, 0 scan ne prouve pas 0 usage — c'est une absence de preuve, pas une preuve
  d'absence (même règle que les médias orphelins).
- **F-06** — la lecture du pilotage sur `telemetry_events` (`kpi.js`, `retention.js` : `env = …`,
  `user_id is not null`, `received_at > …`, tri descendant) balayait `idx_tel_user` en entier : index
  partiel `idx_tel_env_received_identifies (env, received_at desc) include (user_id) where user_id is not
  null`. Le banc prouve le plan sans nœud de tri ; **le gain se remesure en production** au canal ①
  (EXPLAIN de la requête) après application, jamais d'après le banc.
- **F-07** — `realtime.messages` portait DEUX policies SELECT jumelles (« Utilisateur reçoit ses
  messages », avec et sans accent), écrites `auth.uid()` NU donc réévaluées pour chaque ligne diffusée
  (advisor `auth_rls_initplan` ×2). Une seule reste, même prédicat, en `(select auth.uid())`.
  ⚠️ **Piège du banc** : une policy de `realtime.messages` n'est PAS un filtre de lignes, elle OUVRE ou
  FERME la souscription au topic — tout ou rien. Le premier jet du banc attendait « 1 ligne » et
  mesurait 3 : c'était l'attente qui était fausse, pas la policy.

## 🕳️ CE QUE REALTIME DIT D'UNE SUPPRESSION — LA CLÉ PRIMAIRE, À TOUS, SANS RLS (2026-11-03, R25) → `rid` opaque depuis le 2026-11-04

Risque résiduel R25 de l'audit du 2026-11-02, trouvé en contre-revue du lot C-04 et **lu dans le code de
production** (`realtime.apply_rls`, canal ①), pas supposé. Migration
`migrations/migration_realtime_identite_opaque_2026-11-03.sql`, banc
`tests/sql/migration-realtime-identite-opaque.test.sh` (copies md5 de production d'`apply_rls` et de ses
dépendances, nourries de WAL réellement décodé). **Appliquée au staging puis en production le 2026-11-04 (12:45 UTC), mesurée au canal ①.**

**Ce que fait `apply_rls` d'un DELETE — trois faits, dans le code :**
1. il n'applique **aucune RLS** (`if not is_rls_enabled or action = 'DELETE' then visible_role_sub_ids = … ||
   subscription_id`) : tout abonné à la table reçoit l'événement, `anon` compris par le sujet `realtime:db` ;
2. la charge `old_record` est l'**identité de réplication** de la ligne, réduite aux colonnes de **clé
   primaire** quand la RLS est active (« we can't secure deletes so filter to pkey ») ;
3. le **filtre** d'un abonnement est évalué sur cette identité (`is_visible_through_filters(old_columns, …)`).
Donc, avant : `conv_members` livrait `(conv_id, user_id)` à chaque départ — qui quitte quelle discussion
d'activité `evgrp_<activité>` ; `notifications` livrait son `id`, qui ENCODE `n_pa_<activité>_<compte>` ou
`n_fr_<A>_<V>` ; `conv_reads` et `post_likes`, leurs couples de compte. Et `comment_interactions`, en identité
FULL, laissait filtrer un DELETE sur **n'importe quelle colonne** (`user_id=eq.<victime>`) : un oracle, même
si la charge ne portait que l'`id`.

**Le correctif est côté base seul, le client ne change pas.** Sur les quatre tables : une colonne opaque
`rid`, **aléatoire** (53 bits : les chiffres 17 à 32 d'un `gen_random_uuid()`, masqués à 2^53 − 1), un index
unique sur elle seule, et `replica identity using index`. **53 et pas 63** : au-delà de 2^53, un entier n'est
plus exact en JavaScript — la sauvegarde l'arrondissait (`2906581903110193585` → `…193700`), et deux `rid`
confondus dans l'archive se percutaient à la restauration ; et la forme à 63 bits (chiffres 1 à 16) n'en avait
que 59 d'aléatoires, le quartet de version de l'UUID tombant dans la valeur. Un DELETE ne publie plus que `rid` ; `rid` n'est pas une colonne de clé primaire, donc
`old_record` est **nul** ; un filtre sur `conv_id`, `user_id` ou `id` ne reconnaît plus aucun DELETE.
`comment_interactions` revient en identité par défaut (sa charge reste `{id}`, l'oracle se ferme). Clés,
RLS, droits et publication ne bougent pas.

⚠️ **UNE PREMIÈRE VERSION TIRAIT `rid` D'UNE SÉQUENCE, ET C'ÉTAIT UNE NOUVELLE FUITE** (contre-revue des
invariants). Un abonné lit le `rid` de SES lignes posées juste avant et juste après celle d'une victime,
s'abonne avec `rid=in.(…)` — le filtre est accepté, `rid` étant lisible — et apprend l'heure exacte de
l'effacement d'une ligne qu'il ne peut pas lire ; `anon` bissectait avec `rid=lt.N`. Une colonne qu'on ajoute
pour cacher une clé ne doit **rien ordonner** : aléatoire, ou elle redevient un horodatage.
⚠️ **UNE COLONNE QUE LE CLIENT PEUT ÉCRIRE REDEVIENT UN ORACLE** : `authenticated` tient l'INSERT de table, et
`notifications_insert_own_author` laisse X écrire une notification adressée à V. Sans garde, X y PLANTE un
`rid` de son choix, s'abonne à `rid=eq.<planté>` et apprend l'instant où V l'efface — une ligne qu'il ne peut
pas lire (mesuré au banc, garde coupée puis active). Sur la première version, poser la prochaine valeur de la
séquence faisait en plus échouer l'insertion suivante de n'importe qui (23505), `follows_notifier` compris. La
garde `trg_rid_opaque` (SECURITY DEFINER, `search_path` vide) tire un `rid` neuf à chaque INSERT, quelle que
soit la valeur fournie, et garde l'ancien sur un UPDATE de `rid` ; la restauration (`restaurer-donnees.js`)
désactive les déclencheurs et garde les valeurs de l'archive. Le verdict exige la garde ARMÉE (sans clause
`WHEN`) : une garde « présente » ne prouvait rien.
⚠️ **NE JAMAIS SUPPRIMER UN `*_rid_key`** : l'index porte l'identité de réplication d'une table PUBLIÉE ; sans
lui, PostgreSQL refuse TOUT UPDATE et DELETE de la table (« does not have a replica identity and publishes
updates »). L'avis « index jamais lu » de Supabase le signalera toujours — ce dépôt a déjà retiré des index
sur ce critère (F-05). La gate `scripts/audit-identite-replication.js` (`npm run verif`) refuse une migration
qui le retire sans rendre d'abord une identité à la table — et, sauf marqueur motivé, tout ce qui contourne ce
refus par le NOM qu'elle suit : un index renommé puis supprimé, un `drop constraint` (un `add constraint … using
index` renomme l'index), une table reconstruite, renommée ou déplacée (elle revient en identité DEFAULT, sans `rid`
ni garde), une colonne `rid` renommée, la garde retirée ou désarmée (`disable trigger`, `enable replica trigger`,
`create or replace trigger … when`), `replica identity` FULL ou `using index` sur une table publiée, y compris
dans le fichier même qui la publie (contre-revue finale, un test rouge par règle).
⚠️ **UNE RECONSTRUCTION DOIT RENDRE L'IDENTITÉ** : le générateur de schéma des sauvegardes
(`scripts/schema-executable.js`) n'écrivait aucun `replica identity` — un projet reconstruit rouvrait R25 en
silence, pendant que `restaurer-donnees.js --verifier` disait « contenu identique ». Corrigé dans le même
lot ; `docs/RECUPERATION.md` fait rejouer le verdict de la migration après une reprise.
⚠️ **La migration ne tient jamais un verrou en en attendant un autre** : les cinq tables d'un coup, en
`NOWAIT`, en boucle — attendre en tenant bloquait les lecteurs, et un interblocage avec l'instruction
préparée d'`apply_rls` a été reproduit.
⚠️ **…Y COMPRIS DANS SON VERDICT** (contre-revue finale, 2026-11-04, mesuré) : `pg_publication_tables` OUVRE
chaque table publiée (`pg_get_publication_tables` → `table_open(…, AccessShareLock)`, PostgreSQL 16 comme
17.6, dès qu'aucune liste de colonnes n'est posée). Tenant les cinq tables en ACCESS EXCLUSIVE, le verdict
attendait sur `posts` dès qu'une autre session la verrouillait : chaque client des cinq tables bloqué jusqu'au
`lock_timeout`, puis la migration entière annulée. Le verdict lit `pg_publication_rel` (et
`pg_publication_namespace`), qui n'ouvre aucune table. Règle : **dans une migration qui tient des verrous,
aucune lecture qui en prend d'autres** — vues système comprises.
⚠️ **NE PAS SUPPRIMER (NI RENOMMER) UNE COLONNE D'UNE TABLE PUBLIÉE SANS DRAINER LE SLOT** (même revue,
mesuré avec le vrai wal2json et l'`apply_rls` de production) : le décodage relit les changements avec le
catalogue HISTORIQUE (la colonne y existe), `apply_rls` avec le catalogue COURANT
(`has_column_privilege(…, 'rid', 'SELECT')` → « column does not exist ») ; `pg_logical_slot_get_changes` a
déjà avancé le slot, ce qui n'est pas transactionnel : le lot entier — messages d'autres tables compris — n'est
jamais livré en direct. Le retour arrière de R25 GARDE donc `rid` (inerte : identité, garde et index retirés) ;
la supprimer se fait à part, après drainage (procédure dans l'en-tête de la migration).
⚠️ **Un verdict compare à l'IDENTIQUE, jamais par morceaux** : « le défaut contient `gen_random_uuid()`,
`17, 16` et `9007199254740991` » laissait passer `(…) & 7` (3 bits) ; une regex de corps de garde ancrée à la
seule fin laissait passer un `if new.rid is not null then return new;` en tête. Le défaut se compare au
déparse, par le même serveur, d'une colonne témoin portant l'expression exacte ; le corps, par une regex
ancrée aux deux bouts. ⚠️ Et `pg_get_expr(adbin, adrelid)` OUVRE la table dont il déparse le défaut (mesuré sur
PostgreSQL 16) : laissé au planificateur, il était évalué sur tous les défauts de `pg_attrdef`, `posts` compris, et
le verdict attendait de nouveau sur une table verrouillée ailleurs — les quatre défauts de `rid` se lisent d'abord
par un CTE `MATERIALIZED`, et seuls eux sont déparsés.
⚠️ **Après un retour arrière, la réapplication TIRE DE NOUVEAU chaque `rid`** : la colonne gardée sans garde est écrite par le
client pendant la fenêtre (un `rid` planté reviendrait, ou un doublon ferait échouer l'index unique — les deux
mesurés) ; la migration le voit (colonne présente, garde absente) et tire chaque valeur de nouveau avant de
reconstruire l'index. La réécriture n'est pas publiée par le décodage logique (0 changement, mesuré).

**Ce qui reste, dit tel quel** : un abonné sans filtre voit qu'UN effacement a eu lieu, et quand, sur ces
tables ; `posts`, `post_comments`, `conv_messages`, `event_comments` et `profiles` envoient toujours leur
identifiant unique — une part aléatoire et l'instant de création : il dit QUAND la ligne effacée avait été
créée, jamais QUI ni OÙ — mais **`video_lives` envoie `vl_<8 premiers caractères du compte>_<horodatage>`**
(fabriqué par le client) : sans fuite aujourd'hui parce que ses lignes sont lisibles par tous, à revoir le jour
où elles ne le seraient plus ; un filtre sur `rid` ne reconnaît que les lignes dont l'abonné connaît le `rid`
(qu'il lit ou a lues), et `rid` ne change jamais — la poignée survit à un blocage ou à une exclusion. Hors temps
réel, le même fait « qui a effacé quoi » se sonde encore par l'identifiant PRÉVISIBLE `n_<message>_<8>` d'une
notification de message (un INSERT refusé en 23505 tant qu'elle existe) — préexistant, R32. **Après application** (`04-LIVRAISON.md` § 8.3) : mesurer au canal ①
`relreplident` des cinq tables, `indisreplident`, le défaut de `rid` et la garde. Le fonctionnel se prouve
AVANT, sur le staging : les « Suites production » de la CI visent le STAGING (SUP-04), jamais la production — un
UPDATE ou un DELETE refusé faute d'identité y tomberait au rouge. Côté
client, `old_record` nul arrive en `payload.old = {}` (supabase-js, `convertChangeData`).

## 🔒 R25 — UNE TABLE PUBLIÉE LIVRE SES SUPPRESSIONS À TOUT LE MONDE, ET UNE TABLE DÉPUBLIÉE FAIT TAIRE SON CANAL (2026-11-03)

Risque résiduel R25 de l'audit du 2026-11-02 (`.passio/audits/AUDIT_PASSIO_2026-11-02/05-RISQUES-RESIDUELS.md`),
à fermer « sans perdre les fonctions temps réel ». Migration `migrations/migration_realtime_diffusion_privee_2026-11-03.sql`,
banc `tests/sql/migration-realtime-diffusion-privee.test.sh` (65/65), verrou client `tests/e2e/realtime-diffusion-privee.spec.js` (11). **Appliquée au staging puis, client déployé d'abord, en production le 2026-11-04 (14:25 UTC), mesurée au canal ①.**

⚠️ **C'EST LA SECONDE COUCHE, APRÈS L'IDENTITÉ OPAQUE DE LA FICHE PRÉCÉDENTE.** Les deux lots traitaient R25 sans se connaître ; fusionnés à blanc le 04/11, ils sont compatibles dans les deux ordres (mêmes bancs verts, même état final). L'identité opaque retire la clé de CHAQUE suppression des quatre tables, mais un abonné voit encore QU'un effacement a lieu ; ce lot retire tout le flux pour `conv_members` et `notifications`, et deux liaisons `postgres_changes` sur les tables les plus écrites. ⚠️ Le verdict de la première couche exige « les 11 mêmes tables » : **rejoué après ce lot, sa ligne 10 dit ECHEC, et c'est attendu** (neuf tables).

⚠️ **LE DÉFAUT EST DANS LE MOTEUR, PAS DANS NOS POLICIES.** `realtime.apply_rls` (code de production) évalue
la RLS d'un INSERT ou d'un UPDATE par une requête préparée sous le rôle de l'abonné, et la SAUTE pour un
DELETE (« if RLS enabled, we can't secure deletes so filter to pkey ») : la clé primaire part vers toute
souscription dont le filtre la laisse passer — et le filtre comme l'action (`action_filter`) sont choisis par
le CLIENT au join. Les liaisons INSERT du produit ne recevaient donc rien ; un abonné qui DEMANDE `DELETE` ou
`*`, si. **Reproduit au banc avec le `apply_rls` de production**, ce que l'audit n'avait pas pu
faire : un compte sans lien reçoit `(evgrp_ev_rando, A)` au départ de A, et le même compte ne reçoit PAS
l'arrivée (la RLS s'applique à l'INSERT). ⚠️ **Et sans compte** : `anon` garde SELECT de table sur
`conv_members` et `notifications` (mesuré au canal ①), et `realtime:db` lui est ouvert
(`passio_rt_recevoir_visiteur`) — la clé anon publique suffisait. Volumes depuis la remise à zéro des
compteurs (2026-05-07) : 247 DELETE de `conv_members`, 2 895 de `notifications` pour 3 082 INSERT.

**Le remède a deux moitiés, et une seule ferme la fuite.** ① les deux tables SORTENT de la publication :
`realtime.list_changes` ne passe à wal2json que les tables de la publication (`add-tables`), plus aucun
DELETE n'atteint le moteur. ② deux triggers AFTER INSERT (SECURITY DEFINER, `search_path` vide, EXECUTE
retiré à `anon`/`authenticated` — un trigger ne vérifie pas EXECUTE au déclenchement, éprouvé au banc)
poussent la ligne au SEUL destinataire sur `user:<user_id>`, le topic du canal v3 des messages. La policy
« Utilisateur reçoit ses messages » ne l'ouvre qu'à son titulaire ; aucune policy n'y laisse émettre un
client, donc ce qui y arrive vient du serveur. ② garde la fonction ; c'est ① qui ferme.

⚠️ **LE PIÈGE DU LOT EST UN NOM D'ÉVÉNEMENT.** Le client v3 traitait tout `INSERT` reçu sur `user:` et porteur
d'un `conv_id` comme un MESSAGE ; une ligne `conv_members` en porte un. Diffusée sous `INSERT` (le choix
naturel, celui de `broadcast_changes` avec `TG_OP`), elle aurait peint chez chaque onglet resté sur l'ancien
code une bulle vide, joué le son et affiché « Passionné t'a envoyé un message ». D'où `conv_members:INSERT` et
`notifications:INSERT` — supabase-js compare un nom de liaison broadcast par ÉGALITÉ, insensible à la casse
(lu dans `js/vendor/supabase-js-2.116.0.js`) — et une garde `p.table` dans la liaison des messages.

⚠️ **« UNE TABLE HORS PUBLICATION NE REÇOIT RIEN » ÉTAIT INCOMPLET, ET C'EST CE QUI FIXE L'ORDRE.** La gate
`audit:realtime` l'écrivait depuis le 2026-09-19. Lu dans le serveur Realtime
(`PostgresCdcRls.Subscriptions.create`, `RealtimeChannel`) : les liaisons `postgres_changes` d'un canal sont
insérées en UNE transaction, et une table absente (0 ligne) l'annule ENTIÈRE — un message `system` que le
produit n'écoute pas, réessayé toutes les 5 à 10 s, le canal restant ouvert et son broadcast intact. Un
onglet resté sur l'ancien code aurait donc perdu à son join suivant TOUT `realtime:db` (fil, commentaires,
accusés de lecture, lives). **Ordre : le client EN LIGNE d'abord, la migration ensuite, dans la foulée** (entre
les deux, ces tables n'ont pas de direct ; la cloche se relit au démarrage, au réveil et à l'ouverture, une
conversation neuve apparaît à son premier message). La PWA recharge un onglet visible dans la minute d'un
déploiement (`js/pwa-detect.js`). Retour arrière : la base d'abord, le client ensuite — l'ordre inverse.
La gate et son manifeste le disent désormais.

- **La poussée ne peut pas faire échouer l'écriture** : `realtime.send` rattrape ses erreurs mais pas son
  absence ni un changement de signature ; le bloc `exception` du trigger le couvre (banc : `send` renommée,
  la notification et l'ajout s'écrivent, l'avertissement nomme la cause, le verdict rougit).
- **La charge est écrite colonne par colonne**, pas `to_jsonb(new)` : `origine` ne voyage pas, et une colonne
  ajoutée demain ne partira pas d'elle-même. Le verrou ⑥ exige que les colonnes LUES par le client soient
  incluses dans celles que le serveur POUSSE (une colonne lue et jamais envoyée rendrait `undefined`).
- **Le topic `user:` s'ouvre dans TOUS les modes** (soupapes v1/v2 comprises), la liaison des messages en v3
  seulement — sans quoi un appareil en v1 aurait perdu ses notifications en direct sans un bruit.
- Le verdict de la migration a treize lignes, chacune éprouvée au banc contre la mutation qu'elle garde
  (table republiée, autre table retirée, trigger désactivé, `search_path` retiré, EXECUTE rendu par un autre
  concédant, policy du topic retirée ou élargie, policy d'émission sur `user:`, canal des messages coupé,
  fonction réécrite sous « INSERT »).

⚠️ **QUATRE PIÈGES DE BANC.** ① `apply_rls` rend UNE ligne PAR RÔLE : prendre « la première » rendait un faux
« rien » (anon se trie avant authenticated) ; ② `claims_role` de `realtime.subscription` est une colonne
GÉNÉRÉE, que `pg_attrdef` affiche comme un défaut — recopiée en `default`, PostgreSQL la refuse ; ③ le bloc
différé de `supaInit` (~2 s) relit les notifications : tombé dans le cas du réveil, il comptait une relecture
que le réveil n'avait pas faite — **1 rouge sur 3**, même piège que `capacite-socket-au-repos`, même remède ;
④ la gate textuelle prend une assertion `'table: "x"'` pour une souscription si le marqueur CDC est à moins
de 400 caractères — son propre piège du fantôme, rejoué par le titre d'un test.
**Éprouvé par réinjection** : quatre mutations de la migration (retrait de publication supprimé, événement
« INSERT », destinataire = auteur, bloc `exception` retiré) et cinq du client (garde `p.table`, nom
d'événement, topic en v3 seulement, garde de destinataire, ancienne liaison remise) rougissent toutes.

**CE QUE CE LOT NE PROUVE PAS** : aucun serveur Realtime ne tourne au banc. La livraison de bout en bout se
mesure après application — au canal ① (les deux tables hors de `pg_publication_tables`, les deux triggers
présents) et à deux comptes (une notification et un ajout reçus sans recharger ; `multi-comptes.spec.js`
journalise « realtime OK » sur le staging quand la migration y est appliquée).
**CE QUI L'A PROUVÉ, LE 2026-11-04** : ce « realtime OK » se satisfait d'une relecture REST. Un essai ponctuel au staging
(vrai client, vrai serveur Realtime, trois comptes jetables, lectures REST de `notifications` bloquées chez le destinataire)
a rendu : notification reçue en 268 ms par une trame `notifications:INSERT`, ajout à une conversation en 727 ms par
`conv_members:INSERT`, tiers refusé (`CHANNEL_ERROR`) et sa fausse notification jamais livrée, visiteur sans compte muet
sur ces deux tables alors que son témoin `post_likes` reçoit la suppression, clés vides. ⚠️ `send` hors d'un canal rejoint
répond « ok » : c'est le repli REST de supabase-js, seule la réception chez la cible compte. Détail, et ce qui reste à
prouver en production : § 8.7 de `.passio/audits/AUDIT_PASSIO_2026-11-02/04-LIVRAISON.md`.
**CE QUI RESTE PUBLIÉ** : `conv_reads`, `post_likes` et `comment_interactions`. Leurs clés ne partent plus (fiche précédente), mais leurs suppressions restent des événements. `conv_reads` porte les accusés de lecture en direct ; `post_likes` n'a plus d'abonné produit, seuls les bancs de charge l'écoutent encore. **Une table dont la clé primaire DIT quelque chose ne publie pas cette clé.**

**DEUX CONTRE-RELECTURES (2026-11-03, `passio-red-team` et `audit-passio`, lecture seule, canal ① pour la
première) — aucun P0, ce que le lot ferme est fermé ; ce qu'elles ont trouvé, et ce qui en a été fait :**
- ⚠️ **CHAQUE NOTIFICATION EN DIRECT VIDAIT LA CLOCHE** (défaut préexistant, dans le code déplacé tel quel) :
  `mergeSupaNotifs` attend la liste COMPLÈTE du serveur et remplace les notifications distantes par celles
  qu'on lui passe — l'ancien gestionnaire lui passait la seule nouvelle. Corrigé (`_rtNotificationRecue` lui
  rend aussi celles qu'on tient) ; le cas ③ partait d'une cloche VIDE et ne pouvait pas le voir.
- Le toast partait pour un émetteur bloqué (la cloche l'écartait) et affichait du texte neutralisé pour le
  HTML (« &lt;b&gt; », « L&#39;équipe ») dans un `textContent` : il ne montre plus que ce que la cloche a
  gardé, en texte brut (`_texteBrutNotif`, jamais par `innerHTML` d'un élément détaché, qui charge les images
  et déclenche leurs `onerror`).
- **La base tranche, pas la poussée** (`_rtAjoutConversationRecu`) : rien n'est matérialisé si la relecture
  ne me compte pas parmi les membres (ajouté puis retiré aussitôt), pour un 1:1 sans correspondant lisible (le
  CRÉATEUR reçoit sa propre ligne avant celle du pair), ou si l'entrée a été posée pendant la lecture ;
  `confirmCreateGroup` (app-05) fusionne par identifiant au lieu d'un `unshift` aveugle (groupe en double).
  Le `catch` vide journalise ; l'appel de `_subscribeUserTopic` dans `supaSubscribe` est gardé (une exception
  y aurait privé la session de TOUT son temps réel).
- **Le verdict ÉPROUVE au lieu de lire** : une sonde dans une sous-transaction annulée écrit une notification
  pour un destinataire sentinelle, vérifie la poussée, puis rejoue sous `authenticated` lecture et émission
  sur `user:` — `realtime.topic() ~~ '%'` ou `(1 = 1)` passaient un contrôle textuel. Une ligne TÉMOIN écrite
  par le propriétaire sépare les contrôles de lecture de la poussée (premier jet : table vide = « personne ne
  lit », titulaire compris, trois faux ECHEC au banc). Rien ne reste, rien n'est diffusé.
- Poussée seulement vers un uuid (une ligne historique non-uuid existe), `content` borné à 500 (non borné en
  table) ; retour arrière rejouable ; propriétaire non superutilisateur éprouvé au banc (sans BYPASSRLS, la
  poussée est perdue en WARNING — la sonde le dit).
- ⚠️ **L'ORDRE « CLIENT D'ABORD » EST TENU PAR L'OUTIL** : règle ④ de `appliquer-migration.mjs` — une migration
  qui déclare `-- PREREQUIS-CLIENT: <motif>` n'est envoyée à la production que si le bundle SERVI porte le
  motif (illisible = refus). ⚠️ Le bundle n'est pas une balise `<script src>` : `build.js` l'injecte par un
  chargeur (`s.src = "app.js?v=…"`) — le premier jet de la règle, vert sur un HTML fabriqué, était aveugle sur
  le vrai build ; essayé sur un build réel avant d'être cru.
- Les skills `/realtime` et `/migration` conseillaient exactement le geste que R25 interdit (« ajouter la
  table à la publication », « table absente = 0 événement ») : corrigés, comme `migration-checker`.
- **Ce qui reste, et le registre le dit** : la même information par SONDAGE (`is_conv_member`, C-02 —
  `promouvoir_attente` ne nomme plus le promu depuis R24, appliquée le 04/11) ; R36 (`notifier_mentions` lit
  `c.name`, colonne absente : aucune @mention de conversation n'est notifiée — trouvé en passant, mesuré de
  nouveau le 04/11). `comment_interactions` : son gestionnaire DELETE ne servait à rien, il sortait sur
  `!r.comment_id` — corrigé côté client le 2026-11-05 (fiche « 🧹 R37 », fin de fichier). Et `realtime.messages` garde la charge poussée
  jusqu'à la chute de sa partition, comme celle des messages.
- **Le verrou (2026-11-04)** : `tests/e2e/realtime-poussee-reelle.spec.js`, projet `prod`, sous `PASSIO_E2E_MULTI`, staging
  seulement (elle refuse tout autre projet, côté banc et côté page). Avant lui, le seul contrôle en CI était le « realtime OK »
  de `multi-comptes`, informatif, qui se satisfait d'une relecture REST. Vrai client, vrai serveur Realtime, en un test de 1 min :
  notification reçue en 130 à 280 ms, lectures REST bloquées, trame comptée ; ajout à une conversation en 480 à 730 ms, par la
  trame et par le vrai gestionnaire (un filet relit aussi les conversations : la seule présence ne prouverait rien) ; tiers
  refusé (`CHANNEL_ERROR`), sa fausse notification jamais livrée, témoin chez A ; visiteur muet, témoin `post_likes` reçu sans clé.
  Rouge par réinjection : chaque liaison retirée, chaque garde de destinataire, chaque sonde braquée sur une table publiée.
  - ⚠️ **Une sonde par client.** L'essai d'origine réunissait les deux tables sur un canal : une liaison vers une table non
    publiée annule TOUTES celles de son canal, donc `notifications` republiée seule restait muette sous `conv_members`, et le
    verrou restait vert. Trouvé en braquant une sonde sur `post_likes` : vert. Un test de silence doit prouver qu'il pourrait
    entendre.
  - ⚠️ **La gate `audit:realtime` distingue une sonde d'un abonné** (`sondesHorsPublication`, dans
    `scripts/realtime-publication.json`) : fichier par fichier, table par table, avec sa raison. La même table reste refusée
    ailleurs, et une sonde disparue, sans raison ou sur une table republiée est refusée (`audit-realtime-publication.test.mjs` ④ à ⑦).
  - ⚠️ **Pour lancer une suite à comptes réels depuis le poste : jamais la config du dépôt telle quelle.** `global-teardown`
    purge dès que `PASSIO_E2E_MULTI` est posé, `PASSIO_E2E_PROD` ou non : 37 comptes de test du staging partis pendant le
    premier essai de ce verrou, alors qu'une CI pouvait y tourner (aucune n'a rougi, celle de #719 avait fini 15 s plus tôt).
    Une config locale reprend la vraie et retire `globalTeardown`.
  - **Non éprouvé** : la policy de `user:<uid>` n'a pas été mutée sur le staging (DDL sur un bien partagé) ; le refus du tiers
    est mesuré, pas son retrait. La réception par un vrai client EN PRODUCTION reste à voir sur un compte réel.


## 🪟 UN DOSSIER PERSONNEL SE NEUTRALISE EN LE POSANT : DEPUIS WINDOWS, LE TEST DES GARDES LANÇAIT LA CHARGE (2026-11-04)

**Symptôme.** Sur le poste de Benjamin, `npm run verif` s'arrêtait au maillon 30 sur 55 : le cas ③ de
`tests/unit/charge-gardes.test.mjs` rendait `status null` au lieu de 2, après 20 s. Vert en CI Linux.
La chaîne est en `&&` : les 25 contrôles suivants ne tournaient plus sur ce poste depuis l'entrée du
test dans la chaîne (2026-11-03).

**Cause.** `lancer()` isolait le jeton par `HOME` seul, or `scripts/charge.mjs` le lit par
`resolve(homedir(), ".supabase", "access-token")`. Mesuré sous Windows, dans un enfant :

| Environnement de l'enfant | `os.homedir()` |
|---|---|
| `HOME` posé, seul | le VRAI dossier du compte |
| aucune de ces variables | le VRAI dossier du compte |
| `HOMEDRIVE` + `HOMEPATH` posés | le VRAI dossier du compte |
| `USERPROFILE` vide | lève `ENOENT` |
| `HOME` et `USERPROFILE` posés | le dossier posé |

⚠️ **RETIRER N'EST PAS NEUTRALISER.** L'environnement de `lancer()` était déjà reconstruit à partir de
rien : `USERPROFILE` en était absent, et c'est précisément ce qui faisait retomber `homedir()` sur le
vrai dossier. `HOMEDRIVE` et `HOMEPATH` n'y jouent aucun rôle.

⚠️ **UN TEST DE REFUS QUI NE REFUSE PAS DEVIENT LE GESTE QU'IL DEVAIT INTERDIRE.** Sur un poste connecté
(`supabase login`), chaque `npm run verif` révélait les clés du staging par l'API de gestion, puis y
envoyait 10 lecteurs simultanés pendant 20 s, jusqu'au `timeout`. Portée vérifiée à la lecture de
`charge.mjs` : mode anon, donc lectures seules, sans compte créé ni donnée semée, et jamais la
production (`PROD_REF`). La reproduction du 04/11 a joué ce run une fois de plus.

**Correctif, dans le test seul** (`charge.mjs` n'y est pour rien) :
- `ENV_SANS_JETON` pose `HOME` ET `USERPROFILE` vers un dossier inexistant ;
- `lancer()` sonde ce que verrait l'enfant AVANT de lancer `charge.mjs` : une isolation rompue échoue en
  quelques dizaines de millisecondes, sans réseau, au lieu de partir contre le staging ;
- le cas ⓪ porte un témoin positif (un dossier leurre avec un jeton EST vu, sinon `jeton: false` ne
  prouverait rien), verrouille les deux variables (la CI Linux ne verrait jamais `USERPROFILE` autrement)
  et la forme de lecture du jeton dans `charge.mjs`, dont la sonde est la copie.

**Mesuré** : 20,8 s et un rouge avant, 0,84 s et 6/6 après. Mutations sur une copie temporaire :
retirer `USERPROFILE` (le défaut d'origine) rougit ⓪①②③ en 447 ms au total avec
`isolation rompue, charge.mjs n'est pas lancé` ; retirer `HOME` rougit ⓪ ; une sonde aveugle rougit ⓪.

**Survivants cherchés : aucun.** `grep "HOME:"` ne trouve que ce test. Les autres lecteurs du jeton de
poste, lus en contexte, ne sont atteints par aucun test :
- `appliquer-migration.mjs` : `barriere-migration` ne le lance qu'avec `--verifier`, qui sort avant le jeton ;
- `charge-realiste.mjs` : le test ne joue que le mode plan, et `--executer` n'y est éprouvé que refusé ;
- `verifier-prerequis-fonctions.mjs` : le banc SQL passe par `--psql`, sans jeton ;
- `generer-migration-initplan.mjs`, `restaurer-donnees.js` : le jeton n'est lu que derrière la garde
  « script principal » ; les tests appellent les fonctions exportées (les phases de la reprise, avec un
  contexte fabriqué) ;
- `schema-executable.js`, `rollback-netlify.mjs` : aucun test ne les lance.

**Règle.** Un test qui veut priver un enfant du dossier personnel pose `HOME` ET `USERPROFILE` vers un
dossier inexistant, et le vérifie avant de lancer ce qu'il protège.

## 🧹 R37 — UN DELETE N'APPORTE QUE LA CLÉ : LE RETRAIT SE RETROUVE DANS CE QU'ON A LU, JAMAIS PAR UNE RELECTURE (2026-11-05)

Risque résiduel R37 de l'audit du 2026-11-02 (registre RV-30), relevé par la vérification finale de R25 et
**préexistant** : R25 ne l'a ni causé ni aggravé.

**Le défaut.** Le gestionnaire DELETE de `comment_interactions` (`_creerCanalDb`, app-08) passait `payload.old`
à `_applyCommentInteractionEvent`, qui sort sur `!r.comment_id`. Or `realtime.apply_rls` réduit l'ancienne
ligne d'un DELETE à la clé primaire dès que la RLS est active : `payload.old` vaut `{ id }`, en identité FULL
(avant R25) comme en DEFAULT (après). Aucun retrait d'un autre compte ne se voyait donc en direct (like, emoji,
GIF, réaction de publication) : il fallait rouvrir la discussion (cache de 20 s) ou recharger. Et même avec
`comment_id`, seule la branche « like » savait retirer. Le commentaire d'`openComments` affirmait « le realtime
`comment_interactions` maintient déjà tout à jour » : c'était vrai des ajouts, et faux des retraits.

**Mesuré au canal ① avant d'écrire une ligne.** `comment_interactions` : `relreplident = d`, RLS active, clé
primaire `id`, publiée ; SELECT « mon compte OU `comment_target_visible` », DELETE « mon compte » ; 653 INSERT
et 309 DELETE depuis la remise à zéro des compteurs (2026-05-07), 339 lignes vivantes, TOUTES avec un `post_id` ;
index `idx_ci_comment` sur `comment_id`. Et `fil_compteurs`, la lecture du fil, rend les réactions d'une
publication SANS leur `id` (corps de la fonction).

**Le choix, et pourquoi pas l'autre piste.** Relire la discussion ouverte à chaque DELETE (comme
`vliveRefreshCoalesce` le fait pour les lives) **amplifie** : une suppression part à TOUS les abonnés, puisque
`apply_rls` ne juge pas la RLS d'un DELETE, et chaque effacement fait n'importe où aurait fait relire leur
discussion à tous les connectés qui en ont une d'ouverte. C'est le motif des fiches de capacité plus haut. Elle
laissait aussi de côté la pastille des publications, qui n'est pas dans la discussion. **L'index**, lui, ne coûte
rien et ne touche que ce que l'appareil a vu.

**Ce que fait le remède (client seul : aucune migration, aucune RLS touchée, identité inchangée).**
- `_ciIndex` (app-04) : `id → { comment_id, post_id, user_id, kind, payload, created_at }`, rempli par CHAQUE
  lecture (`supaLoadCommentInteractions` et le repli du fil demandent désormais `id, post_id`) et par chaque
  INSERT appliqué. Il est borné à 5 000 entrées (FIFO) : une entrée évincée coûte au pire un retrait qui attend
  la réouverture, comme avant le lot.
- `_commentInteractionRetiree(old)` résout le DELETE, puis `_applyCommentInteractionEvent(r, "remove")` applique
  ses branches. Le like retire UNE occurrence, puisque la lecture compte une entrée par ligne. L'emoji, le GIF et
  la réponse retirent L'entrée qui est cette ligne. La réaction de publication est retirée de toutes ses copies
  (`_copiesDiscussion`).
- Chaque entrée locale née d'une ligne porte `ci`, l'identifiant de cette ligne : on retire l'entrée, jamais
  « une autre du même compte ». À défaut de `ci`, la clé naturelle (`_ciMemeLigne`).
- **Le trou de `fil_compteurs`.** Un DELETE inconnu de l'index déclenche UNE lecture des identifiants
  (`_ciVerifierReactionsPost`). Elle est coalescée à 400 ms, jamais lancée depuis une page masquée (le
  rendez-vous est reporté au retour), reculée après un échec (10 → 60 s, demande reportée, pas perdue), et bornée aux publications À L'ÉCRAN dont
  une réaction d'autrui n'a pas d'identifiant. Elle apprend les identifiants, retire ce que le serveur n'a plus
  (seulement les entrées présentes AVANT la lecture, et seulement si la réponse n'est pas tronquée). Aux tours
  suivants du filet, `_ciRetrouverId` retrouve chaque identifiant par la clé naturelle. Le coût suit donc ce que
  l'écran montre de NEUF, jamais le débit des suppressions.
- RV-31, dans le même lot : le gestionnaire `conv_reads` « * » sort sur un DELETE. Depuis R25, sa charge est vide,
  et `undefined === undefined` pouvait faire passer « lue » une conversation 1:1 sans correspondant.

⚠️ **CINQ PIÈGES DU LOT.**
① **Deux formats d'horodatage.** REST écrit `…+00:00` et le temps réel `…+00`. Une clé naturelle comparée en
chaîne n'aurait jamais retrouvé une réaction reçue en direct puis relue par le filet. L'instant passe par
`supaTs` des deux côtés (verrou ③).
② **L'index vit en mémoire, l'état est persisté** (trouvé en relisant le lot). Une réaction reçue lors d'une
session précédente, sur une publication à moi (`userPosts`, que `findPostAnywhere` préfère), porte son `ci` sans
être dans l'index : elle n'était ni reconnue ni candidate à la lecture, puisqu'elle a un identifiant. On la
cherche donc d'abord à l'écran par cet identifiant (`_ciRetirerParCiAffiche`, verrou ⑧).
③ **Les exemples du fil ont des réactions et aucune ligne en base.** Sans l'exclusion (`fromSupabase`,
`_source`), chaque DELETE inconnu aurait relu pour eux, indéfiniment (verrou ④).
④ **« Aucune requête du tout » était une assertion fausse.** L'application a sa propre activité de fond
(événements, notifications, abonnements, blocages), qui tombait dans le journal au hasard : deux rouges sur
trois essais, sans rapport avec le lot. Le verrou mesure ce qu'il prétend, c'est-à-dire que la DISCUSSION n'est
pas relue (`comment_interactions` et `post_comments`), et non le silence du réseau.
⑤ **La gate `audit:realtime` prend tout `postgres_changes` littéral pour une souscription.** La suite staging
LIT les trames que reçoit l'application et ne s'abonne à rien : elle ne nomme pas l'événement.
Et sur le staging, deux suites tournent en parallèle (`workers: 2` en CI) : un DELETE étranger peut déclencher la
lecture des identifiants à tout instant. Les routes de comptage sont donc posées AVANT toute lecture de B, et le
filet du fil est arrêté chez B après la chaîne de démarrage (un tour de `fil_compteurs` ferait partir la réaction
pour une autre raison que celle qu'on mesure).

⚠️ **LA CONTRE-REVUE DU LOT (`audit-passio`, lecture seule, quatre cas reproduits hors dépôt) : aucun P0 ni P1, deux P2
corrigés dans le même lot.**
- **P2-a — un DELETE qui arrive PENDANT une lecture dont l'instantané le précède.** La réponse périmée réindexait la ligne
  morte et rendait son `ci` à l'entrée : la relecture de rattrapage ne la voyait plus (elle ne prend que les entrées sans
  `ci`), et la réaction ou le like restaient affichés jusqu'au tour suivant du filet, ou à une réouverture. C'est le
  mécanisme de rattrapage du lot lui-même qui était contourné. Remède : des **pierres tombales** (`_ciTombes`, 2 000
  entrées, deux minutes). Tout DELETE reçu, connu ou non, y est noté. L'index le refuse, et les trois lectures (discussion,
  repli du fil, identifiants) écartent ses lignes. Verrou ⑨, pour la lecture des identifiants puis pour la discussion.
- **P2-b — une réponse tronquée relisait sans fin.** Elle n'apprenait qu'une partie des identifiants, sans ordre, et chaque
  DELETE inconnu de la base refaisait la même lecture de 1 000 lignes. Remède : on ne demande que des publications dont les
  réactions connues tiennent sous 250 lignes, et une publication qui dépasse seule cette borne n'est jamais demandée (son
  retrait attend le filet). La limite est de 500, et non la valeur de `max-rows` : une limite serveur plus basse que prévu
  ferait passer une réponse tronquée pour complète. Une réponse qui l'atteint compte comme un **échec**. Le recul est alors
  de 10, 20, 40 puis 60 s ; la demande est reportée à sa fin, au plus trois fois, puis seul un nouveau DELETE redemande.
  Verrou ⑩. La forme structurelle reste ouverte : ajouter `'id', i.id` à `fil_compteurs`. Le client est prêt
  (`ci: x.id || …`), mais c'est une migration.
- P3/P4, corrigés :
  - la lecture pouvait partir d'une page masquée, si le minuteur avait été armé page visible (verrou ⑤ étendu) ;
  - `catch(e) {}` muet sur toute l'application des retraits : il journalise désormais (`ci_appliquer`) ;
  - `_ciVerifEnCours` était posé hors du `try` : une exception aurait tué la vérification pour la session ;
  - trois sélecteurs (`updatePostReactionsUI`, `_patchCmtReact`, `_patchCmtLike`) passent par `CSS.escape`, car un
    identifiant de publication est un texte choisi par son auteur (E-08, verrou ⑫) ;
  - un GIF hérité reçu en direct rafraîchit la liste, au lieu de patcher une pastille qui l'ignore ;
  - le balayage des entrées persistées est regroupé par rafale (100 ms) ;
  - la frontière des exemples passe par `_ciEstExemple` (appartenance à `state.seed.posts`), et non plus par
    `fromSupabase`, qu'une copie `userPosts` ne porte pas : mes publications sortaient du rattrapage.
- **« Jamais mes entrées »** n'était verrouillé par aucun cas (retirer `!_ciEstMoi` laissait tout vert). Verrou ⑪ : ma
  réaction optimiste, pas encore en base, n'est ni retirée ni candidate à la lecture.
- Dans le banc staging : un tour du fil n'y compte que s'il relit P, et la charge `{ id }` est vérifiée sur les DELETE de A
  seulement.

**Trouvé en passant par la contre-revue (RV-39, préexistant ; corrigé le jour même, fiche « 🪞 RV-39 » ci-dessous).** Sur l'appareil qui a publié, la pastille d'une
publication à moi lit la copie `userPosts` (`_postReactItems` → `findPostAnywhere`), que le serveur ne met jamais à jour :
`supaLoadPosts` n'y recopie que `commentsTotal`. Les réactions d'autrui relues par `fil_compteurs` n'y apparaissent donc
jamais ; seules celles reçues en direct, ou persistées, s'y affichent.

**Trouvé en passant (RV-38, non corrigé : migration et décision produit).** Épingler un commentaire n'atteint
jamais la base. `togglePinComment` écrit `kind = 'pin'`, mais la contrainte de production `ci_kind_check`
n'admet que `like`, `reply`, `emoji` et `gif` ; le refus (23514) est avalé. L'épingle reste locale.

**Ce que le lot ne fait pas, dit tel quel.** Un retrait tombé pendant que le socket dormait (repos, onglet masqué)
n'est pas rattrapé, comme un ajout : `postgres_changes` ne rejoue rien, et `_rtRattraper` ne relit pas la
discussion d'une publication. Le like d'un autre compte n'a pas d'entrée par ligne (`likedBy`) : il ne se
retire que par l'index, jamais par la recherche à l'écran. Si un jour `comment_interactions` passait en
identité opaque (`rid`), la charge serait vide et plus aucun retrait ne se résoudrait : la gate
`audit-identite-replication` exige déjà un marqueur motivé pour tout `replica identity` sur cette table, et ce
marqueur devra citer R37.

**Verrous.** `tests/e2e/retrait-interactions-direct.spec.js` (12 cas, navigateur, rien n'est écrit, la vraie
liaison nourrie de la charge exacte `{ id }`), éprouvé par RÉINJECTION — quinze mutations, chacune rougissant son cas :
l'ancien gestionnaire (①→⑤), la garde RV-31 (⑥), `id`/`post_id` à la lecture (① ⑦), l'exclusion des exemples
(④), le report d'une page masquée (⑤), la clé naturelle au tour du filet (② ③), la recherche à l'écran (⑧) ; puis,
pour la contre-revue, les pierres tombales des deux lectures (⑨), la borne des lignes attendues et la réponse tronquée
(⑩), « jamais mes entrées » aux deux endroits (⑪), `CSS.escape` (⑫) et le minuteur tombé page masquée (⑤).
`tests/e2e/retrait-interactions-reel.spec.js` (projet `prod`, sous `PASSIO_E2E_MULTI`, staging seulement) : deux
vrais comptes. La charge d'un DELETE mesurée sur la trame (`old_record` = `{ id }`), puis le retrait du like et de
l'emoji vu en direct par B, ses relectures de ces interactions BLOQUÉES. Puis la réaction d'une publication lue
par `fil_compteurs` qui part sans un tour du fil ; puis une réaction reçue en direct qui repart sans aucune lecture.

## 🪞 RV-39 — MES PUBLICATIONS ONT DEUX COPIES : CE QUE LE SERVEUR REND S'ÉCRIT SUR CELLE QUE LA PASTILLE LIT (2026-11-05)

Registre RV-39 de l'audit du 2026-11-02, trouvé par la contre-revue du lot R37, **préexistant**.

**Le défaut.** Une publication à moi vit dans `userPosts` (la copie gardée à la publication) ET dans
`supabasePosts` (la copie que rend le serveur). `findPostAnywhere` préfère la première, et la pastille la lit
(`_postReactItems`). Or `supaLoadPosts` n'y recopiait que `commentsTotal`. Sur l'appareil qui a publié, les
réactions d'autrui lues par `fil_compteurs` n'apparaissaient donc jamais : seules s'y voyaient celles reçues en
direct, ou persistées par une session précédente. Une réaction retirée pendant que le socket dormait y restait
pour toujours. Et pas sur ce seul appareil : `userPosts` voyage dans le blob `user_state` (`_syncableState`,
recopié tel quel par `_applyUserState` au démarrage), donc tout appareil du compte portait la même copie figée. Le
commentaire de `findPostAnywhere` affirmait « pour lire, c'est sans importance » : c'était faux dès qu'une donnée
serveur n'était recopiée que d'un côté. Il dit désormais à quelle condition c'est vrai.

**Le remède (client seul : aucune migration, aucune RLS, aucune requête de plus).** `_recopierReactionsAutrui`
(app-04), appelée par `supaLoadPosts` à côté de la recopie de `commentsTotal`, remplace dans mes copies
`userPosts` les réactions d'AUTRUI par celles de la copie serveur, selon six règles :
- **mes entrées restent les miennes** : optimistes (pas encore en base), ou retirées ici et pas encore effacées
  là-bas. Le serveur ne ressuscite pas une réaction que je viens d'enlever (verrou ②) ;
- **une entrée d'autrui que le serveur rend aussi est GARDÉE** (le même objet), et son `ci` avec elle. Une ligne
  serveur sans `ci` (`fil_compteurs` ne le rend pas) apprend celui de l'entrée locale, sur la copie serveur
  aussi : c'est lui qui fait voir un retrait en direct sans aucune lecture (R37, `_ciRetirerParCiAffiche`) ;
- **une entrée d'autrui absente du serveur n'est retirée que si elle était là AVANT la lecture**
  (`_reactionsAutruiAvantLecture`, pris juste avant `_chargerComplementsFil`). Une réaction reçue en direct
  pendant la lecture n'est pas jugée par un instantané qui la précède, comme dans `_ciVerifierReactionsPost` ;
- **rien ne bouge si les réactions n'ont pas été LUES.** Chaque chemin pose `reactionsLues` : `fil_compteurs`
  quand le champ est un tableau ; le repli quand sa lecture n'a ni erreur ni réponse à sa limite explicite
  (`FIL_REPLI_LIGNES_MAX` = 500, deux fois sous `max-rows`, comme la lecture des identifiants de R37). Une
  publication absente de la réponse reçoit `_complementFilVide()`, où il est faux. Mesuré au canal ① le
  2026-11-06 : en production, la liste `reactions` de `fil_compteurs` est un `jsonb_agg` sans borne,
  `coalesce` en `[]` (le seul `limit` de la fonction porte sur les 60 identifiants et les deux aperçus) ;
- **un état déjà juste ne réécrit rien.** Une signature (identifiant, `ci`, auteur, genre, texte, instant) évite
  la sauvegarde, la synchronisation `user_state` (où `userPosts` voyage) et la repeinte. Ce chemin tourne à
  CHAQUE tour du filet : sans elle, chaque compte qui a publié réécrirait son blob à chaque tour ;
- **une réponse plus VIEILLE que la dernière recopiée ne défait rien** (numéro de lecture par publication,
  `_rv39Servie`). Toute lecture recopie, la tête du fil comme la page suivante, le profil ou les bobines, et seules
  les lectures de tête sont séquencées (`_feedTeteSeq`) : sans ce numéro, l'instantané le plus ancien, arrivé le
  dernier, ramenait une réaction retirée entre les deux (verrou ⑧).

La pastille est repeinte EN PLACE (`updatePostReactionsUI`). Les signatures du fil (`_feedPostsSig`,
`_feedDomSig`) ne regardent que la copie serveur : elles ne repeindraient pas une carte dont seule ma copie a
changé. Effet de bord voulu : la pastille d'une publication à moi rattrape désormais au tour du filet un ajout ou un
retrait tombé pendant le repos du socket, comme celle d'une publication d'autrui.

⚠️ **TROIS PIÈGES DU LOT.**
① **Une liste vide n'est pas une absence.** Le repli (`_chargerComplementsFilLegacy`) avale l'échec de sa lecture
des réactions (`reactsRes.data || []`). Recopier sans `reactionsLues` aurait vidé ma pastille à chaque panne. C'est
la règle de la réponse tronquée de R37, appliquée à l'échec (verrou ⑤).
② **L'identifiant d'une entrée n'est pas une clé.** `semoji_<created_at>_<compte>` change de forme entre le temps
réel (`… +00`) et REST (`…+00:00`). On apparie donc par `ci` quand les deux côtés le portent, sinon par la clé
naturelle, l'instant passé par `supaTs` (verrou ④ : Bob, reçu en direct, puis relu sans doublon).
③ **Remplacer, c'est perdre le `ci`.** Recopier les lignes serveur telles quelles aurait effacé l'identifiant d'une
réaction persistée : son retrait en direct aurait coûté une lecture des identifiants au lieu de zéro, et la copie
serveur ne l'aurait jamais appris (verrou ③).

⚠️ **LA CONTRE-REVUE DU LOT (`audit-passio`, lecture seule, scénarios rejoués par un harnais `vm` sur les vraies
fonctions) : aucune perte de réaction, un P2 et deux P3 réels, tous corrigés dans le lot.**
- **P2 — un compte BLOQUÉ revenait sur mes publications.** Le temps réel l'écartait déjà (« un compte bloqué
  n'AJOUTE rien »), mais la lecture le recopiait, et la RLS laisse un compte bloqué réagir à une publication
  publique. Avant le lot, l'appareil qui publie ne le montrait jamais : c'était une régression de la promesse de
  blocage, sur les publications de la victime. Remède : `_postReactItems`, l'autorité d'affichage de la pastille
  ET de la liste des réacteurs, écarte `isBlocked(authorId)` pour TOUTES les copies, comme les commentaires. Le
  compte bloqué entre dans ma copie comme dans la copie serveur ; c'est l'affichage qui l'écarte, et un déblocage
  le rend sans relecture (verrou ⑥).
- **P3 — un retrait reçu PENDANT la lecture ressuscitait, et c'était persisté.** `_ciOublier` venait d'effacer la
  clé naturelle, et `fil_compteurs` ne rend pas l'`id` : la pierre tombale de R37 ne reconnaissait pas la ligne, et
  `saveState` emportait la réaction morte dans le blob. Remède : des pierres tombales par CLÉ (`_ciTombesCle`,
  mêmes bornes : 2 000 entrées, deux minutes), posées quand un retrait de réaction de publication est résolu, par
  l'index (`_commentInteractionRetiree`) comme par la recherche à l'écran (`_ciRetirerParCiAffiche`). Elles sont
  consultées en construisant la copie serveur (`_ciReactionPostTombee`, `supaLoadPosts`) : le trou se ferme aussi
  pour la copie serveur des publications d'autrui, que R37 laissait ouvert (verrou ⑦).
- **P3 — deux lectures non séquencées** (profil ou page suivante, croisés avec la tête du fil) : la plus vieille,
  arrivée la dernière, remettait une réaction retirée entre les deux, sans aucun DELETE. Remède : le numéro de
  lecture ci-dessus (verrou ⑧).
- **P3 — la borne du repli était `max-rows` lui-même** (1 000, sans `limit`) : une limite serveur plus basse aurait
  fait passer une réponse tronquée pour complète, et retiré à chaque tour des réactions au-delà de la coupe.
  Remède : `.limit(500)` et une réponse qui l'atteint ne compte pas comme lue (verrou ⑤).
- **P4 — un INSERT arrivé APRÈS la lecture doublait la réaction** : il cherchait l'entrée par son `id`, dont la
  forme diffère entre REST et temps réel. Invisible (dédoublonnage par auteur), mais persisté jusqu'au tour suivant.
  Remède : l'entrée est retrouvée par la LIGNE (`_ciMemeLigne`), et elle apprend son `ci` (verrou ①).
- **P4 — des trous du verrou**, comblés :
  - la branche où une entrée locale sans `ci` apprend celui du serveur (⑤) ;
  - le tri, que rien ne départageait (⑥) ;
  - un retrait attendu par un délai fixe, devenu un sondage (③).
- **P4, laissé tel quel, avec sa raison : le blob `user_state` porte les réactions d'autrui de mes publications.**
  C'était déjà le cas pour celles reçues en direct. Les retirer de `_syncableState` les ferait effacer, sur un
  autre appareil, par l'hydratation du blob, au démarrage et juste après sa propre lecture du fil, jusqu'au tour
  suivant du filet (jusqu'à cinq minutes). L'écriture ne part que sur un changement réel (signature).

**Ce que le lot ne fait pas, dit tel quel.**
- Mes propres réactions ne viennent jamais du serveur par ce chemin (première règle) : une réaction posée depuis un
  autre appareil du compte n'arrive, comme avant, que par le blob `user_state`, au démarrage (préexistant).
- La forme structurelle reste celle de R37 : ajouter `'id', i.id` à `fil_compteurs`.

Un résidu de cette liste est fermé depuis : la pastille d'un COMMENTAIRE écarte elle aussi un compte bloqué
(2026-11-06, fiche « 🚫 » ci-dessous).

**Verrou.** `tests/e2e/reactions-mes-publications.spec.js` (8 cas, navigateur, vraie lecture du fil, vrai filet,
vraie liaison temps réel, rien n'est écrit), éprouvé par RÉINJECTION le 2026-11-06 sur la version finale. Treize
mutations ; chacune rougit au moins le cas qui la vise (les autres colonnes sont les cas qu'elle rougit en plus) :

| Mutation | Cas rouges |
|---|---|
| sans la recopie | ① à ⑥, ⑧ — ⑦ reste vert : il éprouve les pierres tombales des deux copies, recopie ou non |
| sans l'instantané « avant » | ④ |
| mes lignes du serveur recopiées au lieu de mes entrées locales | ② ⑥ |
| sans reporter le `ci` local | ③ ⑤ |
| sans `reactionsLues` | ⑤ |
| sans la repeinte en place | ① ② ④ ⑧ |
| sans la comparaison de signature | ② |
| sans apprendre le `ci` à une entrée locale | ⑤ |
| sans écarter un compte bloqué | ⑥ |
| sans le tri | ⑥ |
| sans les pierres tombales par clé | ⑦ |
| sans le numéro de lecture | ⑧ |
| sans retrouver par la ligne l'entrée d'un INSERT tardif | ① |

Les suites de R37 (`retrait-interactions-direct.spec.js`, 12) restent vertes.

## 🚫 UN COMPTE BLOQUÉ NE COMPTE PAS NON PLUS SUR LA PASTILLE D'UN COMMENTAIRE (2026-11-06)

Le résidu de RV-39 (« Ce que le lot ne fait pas »), **préexistant**, fermé le lendemain.

**Le défaut.** Depuis RV-39, la pastille d'une PUBLICATION écarte un compte bloqué (`_postReactItems`). Celle d'un
COMMENTAIRE ou d'une réponse, non : `_cmtReactions` (app-04) gardait toutes les `emoji_reaction` de
`comment.replies`. Le temps réel ignorait déjà son AJOUT (`_applyCommentInteractionEvent`, « un compte bloqué
n'AJOUTE rien »). Mais la lecture de la discussion ramène ses réactions, puisque la RLS laisse un compte bloqué lire
et réagir sur une publication publique : `hydrateCommentInteractions` (app-08) appelle `supaLoadCommentInteractions`
en deux passes, les commentaires puis leurs réponses. Or ses commentaires, eux, sont masqués dans la discussion
(`_renderCommentsList`). La victime voyait donc « 🤬 3 » sous un commentaire, et le nom du compte bloqué dans
« Réactions · 3 ».

**Le remède (client seul : aucune migration, aucune RLS, aucune requête de plus).** Un prédicat,
`_reactionEmojiComptee(r)` (app-04) : un emoji, jamais celui d'un compte bloqué. C'est la SEULE autorité de ce qui
entre dans une pastille et dans une liste de réacteurs, pour une publication (`_postReactItems`, qui portait la règle
en ligne depuis RV-39) comme pour un commentaire (`_cmtReactions`). Passent par `_cmtReactions` :
- la pastille d'un commentaire comme d'une réponse (`_cmtReactChipHtml`) ;
- son patch en place (`_patchCmtReact`), après un geste local ou un ajout reçu en direct ;
- la liste des réacteurs (`openCommentReactors`) ;
- le tri « Pertinents » (`_cmtRelevance`).

Deux surfaces comptent les réactions emoji AVEC les réponses, sous « N réponses », et n'y passaient pas :
- le panneau des commentaires d'une BOBINE (`loadReelComments`, app-05), qui les liste aussi ;
- l'aperçu des deux commentaires d'une carte du FIL (`renderPostHTML`, app-02, « ▼ N réponses »). Celui-ci a été
  trouvé par la contre-revue.

Elles lisent `_reponsesComptees(replies)` (app-04) : une réaction n'y reste que si elle compte, et les réponses texte
et les GIF y restent tels quels.

Comme dans RV-39, le filtre est posé à l'AFFICHAGE, jamais à la lecture : un déblocage rend les réactions déjà lues,
sans relecture. Pour que ce soit vrai aussi dans le FIL, la signature de `renderFeed` (`_domSig`) porte désormais la
liste de blocage. Bloquer un compte qui n'est qu'un RÉACTEUR ne change aucune publication visible : le
`renderFeed()` de `blockUser` / `unblockUser` était donc sauté, et la pastille d'une publication restait fausse
jusqu'à la tranche suivante de 5 minutes. C'est préexistant depuis RV-39 (verrou ⑥).

⚠️ **LA CONTRE-REVUE DU LOT (`audit-passio`, lecture seule ; audits, suites et mutations rejoués dans une copie du
dépôt) : aucune régression, un P2 dans le périmètre, corrigé dans le lot.**
- **P2, corrigé : un lecteur oublié.** L'aperçu de la carte du fil comptait les deux réactions des comptes bloqués
  (« ▼ 4 réponses » au lieu de 2, mesuré au navigateur).
- **P3, corrigé : un blocage ne repeignait pas le fil** (signature ci-dessus).
- **P3, corrigé : les GIF et réponses n'étaient verrouillés par rien.** La fixture porte désormais un GIF et une
  réponse texte de comptes non bloqués : ④ et ⑤ exigent qu'ils restent rendus et comptés.
- **P4, corrigé : deux assertions creuses.**
  - « Aucune relecture » comptait les lectures AVANT qu'elles ne partent : `then` est appelé dans une micro-tâche,
    après le code synchrone. L'`evaluate` attend désormais un tour.
  - L'ajout en direct d'un compte bloqué n'était vérifié qu'à l'écran, où le filtre l'écarte de toute façon : la
    garde temps réel se vérifie désormais au MODÈLE.

⚠️ **Ce que le lot ne fait pas, dit tel quel (hors lot, par décision).** Les sources sont indiquées entre parenthèses.
- **La réponse TEXTE ou le GIF d'un compte bloqué**, sous le commentaire d'un compte non bloqué, reste rendu et
  compté (mesuré au navigateur le 2026-11-06). Il est compté dans « Voir N réponses », `_cmtRelevance`,
  `nbCommentairesPost`, l'aperçu du fil et le panneau des bobines. Le verrou n'exige PAS qu'il reste visible : c'est un
  défaut consigné, pas un comportement à protéger.
- **Le COMMENTAIRE de premier niveau d'un compte bloqué** n'est masqué que dans la discussion
  (`_renderCommentsList`). Il reste affiché :
  - dans le panneau des bobines (`loadReelComments`, mesuré au navigateur) ;
  - dans l'aperçu d'une carte du fil (`renderPostHTML`, mesuré par la contre-revue sur faux serveur ; `fil_compteurs`
    rend les deux plus récents sans filtre) ;
  - dans l'aperçu d'une carte d'événement (`_evCommentsInlineHtml`, app-07, lu dans le code).
- **L'aperçu d'une carte du fil compte les réactions emoji comme des « réponses »**, contrairement à la discussion
  qu'il ouvre (« ▼ 3 réponses » sur la carte, « Voir 2 réponses » dans la discussion). C'est préexistant. L'aligner
  effacerait la seule trace des réactions sur la carte, qui n'a pas de pastille par commentaire : c'est une décision
  d'interface.
- **« Qui a réagi » sur un ÉVÉNEMENT** ne filtre pas un compte bloqué, ni pour son nom (`_fillEventReactionDetail`) ni
  pour son compte (`_evReactChipHtml`) (app-07, lu dans le code).
- **Le j'aime d'un compte bloqué** compte dans le « ❤️ N » d'un commentaire (une ligne `like` relue = un j'aime),
  comme dans le compteur d'une publication, qui est un compte serveur (lu dans le code).

**Verrou.** `tests/e2e/reactions-commentaire-bloque.spec.js` : 6 cas, navigateur, vraie lecture de la discussion,
vraie liaison temps réel, vrais `blockUser` et `unblockUser`, rien n'est écrit. Éprouvé par RÉINJECTION le
2026-11-06 sur la version finale : sept mutations, chacune rouge sur l'assertion qui la vise.

| Mutation | Cas rouges |
|---|---|
| `_cmtReactions` sans le filtre | ① ② ③ — les autres lisent `_reponsesComptees` |
| le panneau des bobines sans le filtre | ④ |
| l'aperçu de la carte du fil sans le filtre | ⑤ ⑥ |
| la signature du fil sans la liste de blocage | ⑥ |
| `_reactionEmojiComptee` sans `isBlocked` | ① à ⑥, et ⑥ de `reactions-mes-publications.spec.js`, qui lit le même prédicat |
| la garde temps réel retirée (`_applyCommentInteractionEvent`) | ① |
| une relecture de la discussion à chaque repeinte | ① |

## 🗑️ analytics_events : CE QUI NE SERT QU'UNE HEURE NE VIT PLUS 13 MOIS — ET LE PREMIER POSTE ÉTAIT LA VEILLE, PAS LE PLAFOND (2026-11-07)

**La demande.** `verifierPlafondEnBase` (`supabase/functions/_shared/plafond.js`) écrit UNE ligne `edge_<fonction>` dans `analytics_events` par appel accepté d'une Edge Function plafonnée, et ne relit que la dernière heure ; les notes `push_envoye` des accusés (`systeme:pilotage`, `systeme:rappels`, `systeme:appels`, et `systeme:notifs` du lot #749) ne sont relues que sur 24 à 48 h. Tout vivait 13 mois — la seule purge de la table est `passio_purge_analytics`. Livré : `migrations/migration_purge_analytics_courte_2026-11-07.sql`, son banc `tests/sql/migration-purge-analytics-courte.test.sh`, le verrou `tests/unit/purge-analytics-courte.test.mjs`, la surveillance de la tâche par la veille de production (`signalPurgeCourte`, `scripts/veille-production.mjs`), la tendance au § 8 de `docs/AUTONOMIE_EXPLOITATION.md`. **Appliquée en production le 08/11 à 07:06:21 UTC** (contre-revue de PASSIO74, attestation, application depuis le poste : journal `migrations_appliquees` n° 40) ; mesurée au canal ① (ci-dessous, et au § 8).

⚠️ **LA MESURE A CORRIGÉ L'HYPOTHÈSE, DEUX FOIS.** On attendait le plafond de `notify-call` (≈ 6 Go en 13 mois à 100 000 inscrits). Mesuré au canal ① : 33 lignes `edge_notify-call` en tout, aucune depuis le 23/10 — et **68 % de la table sont les créneaux de la veille** (`edge_pilotage-veille`, 13 322 lignes ; 576 par jour, mesuré le 08/11 : `prendreCreneau` en écrit deux par passage, toutes les 5 min). Et à l'échelle, le mur d'`analytics_events` n'est pas une ligne technique : c'est **`screen_view`**, une ligne par navigation (`goTo` → `supaTrack`), 28 par compte et par jour actif sur 30 jours, gardée 13 mois — 50 à 75 Go à 20 000–30 000 actifs par jour. Décision produit, hors de la purge courte ; consignée au § 8. « Le vrai mur, c'est le plafond » ne vaut que parmi les lignes techniques.

**Les lecteurs, inventoriés avant d'écrire** (dépôt entier et catalogue de production) : le plafond (la dernière heure), `prendreCreneau` (par IDENTIFIANT, sa minute et la suivante — jamais par date), la fonction `pilotage` (`lireReception` : 24 h, 48 h pour la dernière alerte ; `essayerAlertes` et `essaiManuel` : la seule dernière note du pilote). La table n'est pas publiée ; le centre de pilotage ne fait que compter ses lignes ; la sauvegarde l'exclut ; l'export RGPD ne la rend pas (`EXCLUS_EXPORT`). En production, aucune fonction ni vue ne la NOMME — mais une la lit par SQL dynamique : `rate_limit_insert` (`trg_rate_limit`), sur la dernière minute, et elle pose `created_at := now()` à chaque insertion (colonne NOT NULL : ni ligne antidatée, ni postdatée). ⚠️ **Un inventaire par `prosrc ilike '%analytics_events%'` ne voit pas le SQL dynamique** (`format('… %I.%I …', TG_TABLE_SCHEMA, TG_TABLE_NAME)`) : la première rédaction affirmait « aucune fonction ne lit la table », la revue l'a démenti. Chercher aussi les fonctions qui font `EXECUTE format(… %I …)` (quatre dans `public` au 07/11). Et la PR #753, ouverte, déplace le plafond en SQL (`plafond_consommer`) : il relit la dernière heure, lui aussi — le verrou unitaire le vérifie s'il est là.

**Ce que fait la migration.** `purger_analytics_courte(p_edge, p_notes)` (SECURITY INVOKER, search_path vide, fermée à PUBLIC, anon, authenticated) efface `edge_*` plus vieux que `p_edge` et `push_envoye` plus vieux que `p_notes`, et REFUSE (22023) sous 1 h, sous 7 jours, ou NULL ; la tâche `purge_analytics_courte` l'appelle chaque heure à :23 avec 2 h et 8 jours ; un index partiel `(created_at) WHERE starts_with(event, 'edge_')` lui évite de parcourir toute la table (la collation de la base, en_US ICU, ne sert aucun `LIKE` par un btree) ; la commande PLANIFIÉE est exécutée une fois dans la transaction, et le verdict mesure son effet. Pourquoi 8 jours et un plancher à 7 : `essaiDu` rend la même décision pour une dernière note de plus de 7 jours et pour aucune note — toute purge au-delà lui est indifférente, en deçà un essai partirait trop tôt (le verrou unitaire ⑤ le refait).

⚠️ **`like 'edge_%'` N'EST PAS « commence par edge_ ».** Dans un LIKE, `_` est un JOKER : `edgeX_…` y passe, et l'échappement `\_` dépend de `standard_conforming_strings`. D'où `starts_with`, dans la purge ET dans l'index (le planificateur ne prend un index partiel que pour une condition identique). Le banc le prouve à l'envers : un motif élargi dont l'empreinte a été remise à jour PASSE le verdict — c'est le relevé exact des lignes restantes du banc qui rougit (`edgeX_…` effacée).

⚠️ **LE PIÈGE RLS : UNE PURGE QUI EFFACE 0 LIGNE SANS ERREUR, ET UN VERDICT AVEUGLE AVEC ELLE.** `analytics_events` n'a AUCUNE policy DELETE. Un rôle que la RLS arrête efface donc 0 ligne, sans erreur — et il ne LIT rien non plus : le contrôle « plus aucune vieille ligne » et le relevé des survivants, lus sous le même rôle, disent OK. Seul le catalogue le voit : la ligne 3 du verdict exige que le rôle de la tâche (`cron.job.username`) ait DELETE et contourne la RLS (superutilisateur, BYPASSRLS, ou propriétaire sans FORCE). Mesuré en production : `postgres` est propriétaire ET BYPASSRLS. Le banc rejoue le piège (propriétaire sous RLS forcée) : la ligne 3 neutralisée, la migration S'APPLIQUE et n'efface rien.

⚠️ **LE VERROU EN TÊTE, OU L'INTERBLOCAGE (revue `passio-red-team` du même jour).** La première version purgeait (verrous de LIGNE), PUIS créait l'index (verrou SHARE de table). Un DELETE concurrent d'une ligne déjà purgée — `purge-compte`, et cinq comptes portent encore de vieilles lignes `edge_notify-call` — attendait la migration en tenant ROW EXCLUSIVE, et SHARE l'attendait à son tour : interblocage, reproduit par la revue (`deadlock detected … waits for ShareLock`) ; la victime aurait été la suppression de compte, la première à attendre. Désormais `lock table public.analytics_events in share mode` est la PREMIÈRE instruction qui nomme la table : aucun cycle possible, et personne d'autre n'écrit pendant la transaction — la ligne 8 du verdict compte donc les lignes hors des deux familles avant et après, à l'unité (c'est elle qui refuse un motif élargi). Le prix, dit : les écritures attendent le COMMIT (quelques centaines de millisecondes, sous les 8 s de PostgREST : statement_timeout et lock_timeout d'`authenticator`), et pendant l'attente du verrou (5 s au plus) elles se rangent derrière la demande — mesuré par la revue, un INSERT `edge_ask-ai` à 3 s. Deux autres choses vraies de cette fiche : `CREATE INDEX IF NOT EXISTS` prend son verrou AVANT de constater que l'index existe (un rejeu verrouille aussi), et un index construit dans la transaction qui purge indexe les lignes qu'elle efface (des entrées mortes jusqu'au prochain vacuum). Le banc vérifie l'ordre (⑥) et rejoue un écrivain concurrent (⑩).

⚠️ **UNE TÂCHE pg_cron QUI ÉCHOUE NE DIT RIEN.** Le verdict ne prouve que la première exécution ; rien dans le dépôt ne lisait `cron.job_run_details`. Une `purge_analytics_courte` cassée (fonction modifiée, `statement_timeout` de 120 s de la session cron à grande échelle) laisserait la table repartir vers 13 mois en silence. La veille de production (`scripts/veille-production.mjs`, canal de LECTURE de l'API de gestion) lit désormais sa dernière exécution : absente, « non installée » — une information, pour qu'elle ne sonne pas avant l'application (depuis l'application du 08/11, absente ou désactivée = ATTENTION, et le TEXTE nomme la migration à rejouer : la veille n'affiche un geste que pour une ALERTE, jamais pour une ATTENTION — trouvé par la contre-revue de #782) ; installée, un échec ou plus de 3 h sans exécution — ATTENTION (`signalPurgeCourte`, verrous dans `tests/unit/veille-production.test.mjs`, trois mutations rouges). Requête éprouvée au canal ① le 07/11 (0 tâche, aucune exécution ; la purge des 13 mois, lue de même, `succeeded`).

⚠️ **UN BANC QUI S'ARRÊTE N'EST PAS UN BANC QUI DIT ROUGE.** Premier jet : sous `set -euo pipefail`, `sortie="$(psql -f migration)"` coupait le banc dès qu'une migration réinjectée levait — rouge, mais sans une ligne pour dire pourquoi. Chaque application est désormais suivie de `|| true`, ses contrôles disent ce qui rougit et la sortie s'imprime ; un mutant qui ne trouve plus son texte compte un échec du banc au lieu de l'arrêter.

**Les preuves.** Banc : 67 contrôles. 14 scénarios fermés sur échec lèvent chacun en nommant SES lignes, sans rien appliquer : 12 mutants de la migration, une tâche désactivée, le piège RLS. Le banc couvre aussi les bornes à deux minutes près (lignes retirées aussitôt : aucun contrôle suivant n'en dépend), le verrou en tête, le retour arrière rejoué puis la réapplication. Il rejoue la configuration de PRODUCTION (⑨) : collation ICU en-US, rôle non superutilisateur BYPASSRLS propriétaire, fichier envoyé en UNE chaîne avec la ligne de journal injectée par le vrai `sqlAvecJournal`. Et un écrivain concurrent (⑩) : la migration l'attend puis passe. Revue `passio-red-team` : aucun P0 à P2 ; huit P3, dont l'interblocage et deux affirmations fausses, corrigés ici — sauf le verrou du retour arrière (`drop index`, ACCESS EXCLUSIVE), documenté avec sa variante `concurrently`, pour garder le retour arrière atomique. Réinjections, fichiers restaurés à l'octet :
- 13 dans la migration, banc rouge à chaque fois : horaire, motif, rétention des notes, plancher, index, garde-fou, retour arrière, relevé des survivants, ligne 3, verrou retiré, verrou après le relevé, ligne 8 neutralisée, relevé des autres faux ;
- 15 dans les lecteurs, verrou unitaire rouge à chaque fois : plafond relu sur 3 h, `JUGEMENT_MAX_MS` à 10 jours, `essaiDu` à 9 jours, plancher à 6 jours, rétention sous plancher, motif LIKE, dernière note lue par 5, créneau relu par date, nouveau lecteur `edge_` dans `scripts/`, `.filter("event", "eq", EVT_ENVOI)` sur 30 jours, dernière note lue dans une autre fonction, une lecture dans `appels.js`, un nouveau fichier en `.match({ event: EVT_ENVOI })`, un script en `.or("event.eq.push_envoye")`, une vue SQL sur les notes ;
- 3 dans la veille, tests unitaires rouges à chaque fois.

Le verrou unitaire passe aussi sur les arbres fusionnés avec #749 et avec #753.

**L'application et la mesure (08/11).** Contre-revue de mainteneur unique 5816969146 (PASSIO74, sur 9f38f21, rédigée par une session Claude Code à la demande de Benjamin), trois remarques non bloquantes : l'en-tête inventorie les déclencheurs de la table sans `aa_ligne_bornee` (posé par #753, appliqué le 07/11 ; BEFORE INSERT/UPDATE comme les deux autres, il ne voit pas un DELETE) — le fichier attesté ne se corrige plus, son empreinte est consignée : la correction vit ici ; un rejeu sur une table remplie se fait en heure creuse — le verdict compte toute la table sous le verrou SHARE (⓪ bis, ligne 8) : quelques millisecondes à 20 000 lignes, au-delà des 8 s de PostgREST quand `screen_view` en comptera des millions ; et deux coûts déjà consignés au § 8 (au-delà de 2 h, l'usage des Edge Functions ne se lit plus en base ; `cron.job_run_details` grossit de 24 lignes par jour). Fusion en c9d0891 (#760), application à 07:06:21 UTC : les 9 contrôles bloquants du verdict OK et ses 2 lignes d'information, **14 242 lignes `edge_*` effacées**, aucune note, 5 937 lignes restantes. Mesuré au canal ① à 07:07 : la tâche `purge_analytics_courte` (`23 * * * *`, active, `postgres`, commande à l'octet), la fonction au md5 du banc, SECURITY INVOKER et `search_path` vide, fermée à `anon` ; l'index partiel valide (328 ko) ; plus aucune ligne `edge_*` de plus de 2 h ni de note de plus de 8 jours. Première exécution PLANIFIÉE à 07:23:00 : `succeeded` en 0,18 s sous `postgres`, et à 07:24 toujours rien au-delà des deux bornes (5 938 lignes). La taille et sa tendance : § 8 (4,8 Mo sur disque : le tas ne rétrécit pas, il cesse de croître). Le staging, attesté, ne l'a pas reçue : il a dérivé (§ 8, première ligne).

⚠️ **Deux pièges du canal ③ sous Windows, vécus ce jour-là.** ① `node scripts/appliquer-migration.mjs …` lancé depuis `C:\Users\BENJAMIN` rend `Cannot find module 'C:\Users\BENJAMIN\scripts\appliquer-migration.mjs'` : le chemin est relatif au clone — on se place d'abord dans le worktree détaché d'`origin/main` (`Desktop\PASSIO-wt\<sujet>`). ② `git worktree remove --force <chemin>` lancé DEPUIS ce worktree échoue en boucle (« Deletion of directory … failed. Should I try again? ») : Windows ne supprime pas le dossier courant. Répondre `n`, revenir dans le clone principal (`cd C:/Users/BENJAMIN/Desktop/PASSIO`), relancer la commande, puis `git worktree prune`.

**Ce qui reste.**
- ① ~~La contre-revue et l'application~~ : faites le 08/11 (ci-dessus).
- ② ~~La mesure après application~~ : au § 8 (lignes, taille, première exécution de `purge_analytics_courte`).
- ③ ~~Les commentaires « purgée à 13 mois »~~ : `_shared/plafond.js` et `_shared/appels.js` corrigés à la fermeture (#782), le second après la fusion de #749, qui réécrivait sa ligne ; § 3.7 et § 3.8 de `docs/AUTONOMIE_EXPLOITATION.md` aussi.
- ④ `screen_view` : décision produit.
- ⑤ `cron.job_run_details` : 13 Mo, jamais purgée (vue par la revue), § 8 — hors de cette migration.

## 📦 BANDE PASSANTE ET QUOTAS SANS INVESTIR : LA PAGE EN 304, LES MÉDIAS EN DIRECT, LES MINIATURES SANS TRANSFORMATION, LA LISTE DES PASSIONS GARDÉE (2026-11-09)

Demande de Benjamin : « que peut-on faire maintenant pour préparer Passio à une utilisation massive, sans
injecter d'argent ? », puis « fais tout, prends la main ». Point de départ : `9c8eb416` (#794). Mesuré
ce jour-là sur la production : 14 comptes, 1 connecté sur 7 jours — la base, le temps réel et la
télémétrie étaient déjà durcis (lots de septembre et d'octobre) ; **les murs gratuits qui restaient
étaient ceux des images et de la bande passante, et le pilotage ne les voyait pas.**

**Les mesures (production, 2026-11-09).**
- `index.html` : 106 Ko compressés, **retéléchargé ENTIER à chaque ouverture** : `_headers` le sert en
  `no-store` et `sw.js` le redemandait en `cache: "no-store"` — jamais de 304, alors que Netlify en rend
  un sur `If-None-Match` (essayé). `/`, `/index.html` et `/?…` portent le MÊME ETag.
  À 25 000 appareils × 3 ouvertures/jour : ~240 Go/mois, plus que les 100 Go du forfait Netlify.
- `/media/*` : **neuf requêtes identiques d'affilée, neuf `fwd=miss`**. Le cache du relais ne servait
  rien : chaque vue = une invocation + la bande passante Netlify + la sortie Supabase, et 1 h de cache
  navigateur. Supabase (Pro) sert le même objet avec `max-age=31536000`, `CF-Cache-Status: HIT`,
  `x-smart-cdn: true`. Les prémisses du relais (« 5 Go », « `no-cache` », 11/09) étaient tombées.
- Transformations d'image : 6 avatars + 5 couvertures en base, **aucun en version légère** — chacun
  passe par `render/image`, plafonné à 100 images d'origine/mois en Pro (19/100 le 20/09 avec dix
  comptes). Un mur vers ~50 profils avec photo, spend cap actif, et aucune jauge ne le suivait.
- `chargerReferentielPassions` : **6 requêtes et 36 Ko à chaque démarrage**, visiteurs compris
  (3 074 223 appels cumulés, 3ᵉ requête de la base) pour 5 006 identifiants dont UN créé en 30 jours.
- Jauge « bande passante » du pilotage : appareils × 40 versions × 0,75 Mo — ni la page à chaque
  ouverture, ni un seul média. Avec ~2 Mo d'images par session (hypothèse), le vrai mur Netlify tombait
  vers 500 actifs/jour quand la jauge l'annonçait vers 3 400.
- Qualité WebP de la version légère : cinq photos de production ré-encodées à 720 px (sharp, libwebp —
  l'encodeur du canvas) : 0,80 → 0,75 = −15 % ; 0,72 = −17 % ; 0,70 = −19 % : le gain plafonne.

**Ce qui est livré.**

| Pièce | Fichier | Verrou |
|---|---|---|
| Page revalidée en 304 : l'ETag de la copie gardée (`/`, sinon celle pré-cachée à l'installation) part en `If-None-Match` ; 304 → la copie, 200 → gardée | `sw.js` (`chercherCopiePage`, `etagRevalidable`) | `tests/e2e/sw-page-revalidee.spec.js` (5, vrai worker, serveur de banc qui compte ; rouge sur l'ancien `sw.js`) |
| Médias en direct du CDN Supabase (`PASSIO_CDN_BASE = ""`), anciennes URL lues à la source (`urlMediaDirecte`) | app-08, app-02 | `tests/e2e/cdn-medias.spec.js` ④ |
| `/media/*` devient un renvoi 301 (aucune lecture d'origine, liste fermée des largeurs gardée) | `netlify/edge-functions/media.js` | `tests/unit/media-edge.test.mjs` (10) |
| Version légère pour avatars (352 px), couvertures, photos (352 px) et fonds de passion, couvertures d'activité et de bobine ; `{ cache: "3600" }` pour les chemins réécrits | app-06, app-07, app-08, ui-v7-lot.js | `tests/e2e/capacite-images-legeres.spec.js` (vrais appels mesurés à la source) |
| **Plus AUCUNE transformation d'image** : `passioThumb` rend l'objet (sa légère, ou l'ancien tel quel) | app-02 | `cdn-medias` ②, `avatars-et-ia-referentiel` ① |
| Anciennes URL du relais lues à la source aussi hors `passioThumb` (vidéos de bobines, couvertures d'activité et de passion, cartes) ; `og:image` des aperçus en direct | app-04, app-05, app-06, app-07, ui-v4a2-cartes.js, `netlify/lib/apercu-coeur.js` | `tests/unit/apercu-liens.test.mjs` ⑤ |
| Qualité WebP 0,80 → 0,75 | app-08 | — (mesure ci-dessus) |
| Liste blanche des passions gardée 24 h (IndexedDB), complément en UNE requête : créées depuis (ajoutées), archivées (retirées) ; rejoué après coupure ; lecture IndexedDB bornée à 3 s | app-02, `js/idb-store.js` | `tests/e2e/capacite-referentiel-garde.spec.js` (9 ; ①②③ rouges sur l'ancien chargeur) |
| Jauge : une page par jour et par appareil en plus des versions ; les médias n'y comptent plus, à raison | `supabase/functions/_shared/pilotage.js` | `tests/unit/croissance.test.mjs` ⑤ |
| Les trois entrées du TURN public mort retirées des serveurs ICE des appels | app-05 (`CALL_ICE_SERVERS`) | — (mesure DNS + banc ICE, ci-dessous) |

**Les pièges, chacun payé ce jour-là.**
- ⚠️ **UN 304 N'APPORTE PAS LES EN-TÊTES DE SÉCURITÉ.** Celui de Netlify ne porte ni CSP ni
  Permissions-Policy : une copie servie sur 304 garde ceux de SON téléchargement. Une CSP modifiée sans
  que la page change ne s'appliquerait jamais — d'où la borne : une copie de plus de 24 h repart entière
  (`PAGE_REVALIDATION_MAX_MS`). L'âge se lit en VALEUR ABSOLUE : date du serveur contre horloge du
  téléphone, un téléphone en retard rendait un âge négatif (cas ⑤ du banc).
- ⚠️ **LA REQUÊTE CONDITIONNELLE GARDE `redirect: "manual"`** : une réponse redirigée rendue à une
  navigation est refusée par le navigateur. Et le cache HTTP reste en `no-store` : rien n'y est écrit, ni
  la page, ni une adresse portant des jetons de connexion (audit du 2026-11-06).
- ⚠️ **HORS LIGNE, LA COPIE LA PLUS RÉCENTE D'ABORD.** Le repli servait `./index.html` (copie de
  l'installation) avant celle de l'adresse ; le banc ③ l'a montré en servant une page plus ancienne.
- ⚠️ **UN CONTRAT DE SOURCE COMPTAIT UN SEUL `_referentielComplet = true`** (`reprise-lectures-boot`
  ⑫). La liste gardée en ajoute un second, légitime parce qu'elle n'a qu'UNE porte d'écriture : la
  sortie propre de la pagination. Le contrat compte désormais deux déclarations ET une seule porte.
- ⚠️ **LA LISTE GARDÉE N'EXISTE QU'EN ARTEFACT** (même règle que le référentiel d'affichage) : sans
  `PASSIO_RELEASE`, ni lecture ni écriture — les 897 suites locales mesurent le comportement d'avant,
  et le banc pose la release lui-même.
- ⚠️ **UN CHEMIN RÉÉCRIT NE SE GARDE PAS UN AN.** Avec le relais, toute image se gardait une heure ; en
  direct, l'objet porte le `cacheControl` de son envoi (un an) : une photo de passion changée resterait
  l'ancienne dans le navigateur. D'où `{ cache: "3600" }` sur les trois envois à clé fixe.
- Instabilité PRÉEXISTANTE vue en route, pas causée par ce lot (mesuré : 1 échec sur 136 sur le code
  d'origine) : `capacite-sans-investir.spec.js` ⑤ et ⑤ bis, quand le service worker prend la page avant
  `PassioPassions.charger()` — ses requêtes échappent alors à `page.route`.
- ⚠️ **LA LISTE FERMÉE DES LARGEURS NE PROTÉGEAIT PAS LE QUOTA** (`passio-red-team`) : l'URL
  `render/image` de Supabase est publique ; ~80 images déposées puis demandées en miniature éteignaient
  les vignettes de tous jusqu'au cycle suivant. Le remède n'est pas une garde de plus, c'est de ne plus
  DÉPENDRE du quota : `passioThumb` ne demande plus aucune transformation.
- ⚠️ **SUPABASE-JS NE REJETTE PAS SUR UNE COUPURE, IL REND `{ error }`** (`audit-passio`) : le
  complément revenait sur un `return` muet, la session restait sans les passions du jour. Il s'inscrit
  désormais à la reprise (`passions_complement`), comme la pagination.
- ⚠️ **RETIRER UNE PASSION ARCHIVÉE N'EST PAS LA FAUTE DU 2026-08-31** : celle-là prenait une réponse
  PARTIELLE pour un retrait ; le complément rend chaque ligne AVEC son statut. Sans ce retrait, la liste
  gardée aurait prolongé jusqu'à 24 h la publication dans une passion archivée — le serveur, lui, ne
  la refuse pas (clé étrangère seule, aucun déclencheur : vérifié en base).

**Ce qui reste — gestes humains, gratuits, hors de portée du code.**
- Vérifier sur developers.giphy.com que la clé de `js/emoji-misc.js` est en « Production » : une clé
  Beta est plafonnée (de l'ordre de 100 appels/heure) **pour toute l'application**, et la recherche
  retombe alors en silence sur les 26 GIF locaux.
- **Un TURN pour les appels.** Le relais public `openrelay.metered.ca` est MORT : il résout vers
  192.0.2.1 et 100::1 (adresses réservées, non routables — mesuré le 09/11 ; il résolvait encore le
  10/09), et un banc Chromium n'en obtient aucun candidat `relay` quand le STUN de Google rend ses
  `srflx`. Ses trois entrées sont retirées d'`CALL_ICE_SERVERS` (app-05) : elles ne relayaient plus
  rien. Un appel entre deux réseaux à NAT strict (CGNAT 4G, entreprise) échoue donc aujourd'hui. Le
  remède demande un compte (offre gratuite chez Metered ou Cloudflare) dont on colle les identifiants
  dans `PASSIO_CALL_TURN`.
- Supabase › Auth › Rate Limits : relever la limite d'inscriptions par IP (une soirée IRL, c'est tout le
  monde sur le même Wi-Fi ; Turnstile protège déjà) ; passer la connexion d'Auth en pourcentage
  (avis du linter, utile seulement le jour d'un changement de calcul).
- Supabase › Storage › Settings : **éteindre la transformation d'image**. PASSIO n'en demande plus
  aucune ; l'URL `render/image` reste publique tant qu'elle est allumée. ⚠️ Vrai pour `passioThumb`
  seulement : le renvoi `/media/…?width=` la demandait encore — fermé par #800, avec la précondition
  d'extinction (fiche suivante).

**Ce qui reste — serveur, relevé par `passio-red-team` (antérieur à ce lot, dit ici pour être suivi).**
- Un déclencheur `BEFORE INSERT OR UPDATE OF passion_id` sur `posts` qui refuse une passion non
  active : aujourd'hui seule la clé étrangère contrôle `passion_id` (migration, contre-revue).
- Un média masqué par la modération reste servi (l'objet n'est pas retiré du seau) : le retirer au
  masquage (`cheminsImageStorage`), ou le déplacer vers un seau privé.
- La pagination de la liste blanche (`range` sans curseur) peut sauter une passion si une autre est
  archivée PENDANT la lecture (~1 s) ; la liste gardée le retiendrait 24 h. Un `order by` ne suffit pas
  (le décalage reste) : une pagination par curseur (`id > dernier`) le réglerait.
- Une couverture d'activité envoyée AVANT ce lot (métadonnée d'un an) puis réécrite au même chemin peut
  rester l'ancienne dans un navigateur qui l'a affichée après ce déploiement (une seule en base).

**Ce qui reste — code, pour un lot suivant.**
- `postgres_changes` : **60 % du temps de calcul cumulé de la base** (`realtime.list_changes`, 7,5 M
  d'appels) avec un seul compte actif ; neuf tables publiées dont `posts`, `post_likes`,
  `post_comments`, `profiles`. Les filets adaptatifs couvrent déjà le fil : migrer le public vers eux
  (ou vers un broadcast), garder la socket pour messagerie, appels et lives. À mesurer au staging.
- `app.js` (417 Ko compressés) retéléchargé à chaque version qui touche un `app-*.js` (38 sur 136
  commits de `main` en 30 jours, ~2 fichiers sur 9 chacun) : un découpage par fichier, hash par
  fichier, diviserait ce poste par ~3.
- ~70 % des requêtes reçues par Supabase en 24 h viennent des runners de la CI (réseau Microsoft,
  navigateurs headless) : mêmes quotas plafonnés que les futurs utilisateurs.

## 📴 LE CONTENU PUBLIC SORT DE LA RÉPLICATION CDC — `realtime.list_changes` PESAIT 60 % DE LA BASE (2026-11-09)

Suite du lot « bande passante et quotas » du même jour, sur l'ordre de Benjamin (« fais tout, prends la
main, optimise au maximum »). C'était le premier poste de « ce qui reste — code » de la fiche précédente.

**Les mesures (production, canal ①, 2026-11-09 12:40 UTC).**
- `extensions.pg_stat_statements` (remis à zéro le 2026-05-13) : la requête de `realtime.list_changes`
  — le relevé du WAL que le serveur Realtime refait toutes les 100 ms dès qu'UN client tient une liaison
  `postgres_changes` — compte **7 486 911 appels, 53 283 s, 7,1 ms en moyenne : 60,31 % du temps
  d'exécution cumulé de TOUTE la base**, plus une seconde forme (354 568 appels, 2,37 %). Un seul compte
  avait été actif dans la semaine : le relevé tourne dès qu'un onglet de compte est ouvert, quoi qu'il
  regarde.
- Aucune ligne dans `realtime.subscription` ni dans `pg_replication_slots` au moment de la mesure : le
  relevé ne tourne QUE pendant qu'un client tient une liaison — c'est ce qui en fait un levier entier.
- La publication `supabase_realtime` : 9 tables en production, **23 au staging** (des `cdv_*`,
  `telemetry_events`… jamais retirées là-bas — le staging n'est pas un miroir, encore une fois).
- Policies de `realtime.messages` identiques des deux côtés ; plus de policy visiteur sur `realtime:db`
  (lot 3 de l'audit du 06/11).

**Pourquoi pas « un broadcast à tous » à la place.** Le quota `Realtime Messages` (5 M/mois, plafonné)
compte chaque message LIVRÉ : pousser chaque publication, chaque changement de profil ou chaque
battement de live à tous les connectés coûte O(écritures × connectés) messages — à l'échelle visée, le
quota tombe avant la base. Seuls survivent les envois CIBLÉS (ceux qui regardent une discussion, les
membres d'une conversation, l'auteur d'une publication) ; tout ce qui vaut « pour tout le monde » est
RELU par les filets, dont le coût suit les onglets à l'écran, jamais le débit des écritures.

**Ce qui le remplace.**
- Une discussion À L'ÉCRAN (modale, feuille, détail d'une publication, fiche d'activité, panneau des
  Bobines) rejoint un sujet privé `fil:<id>`, lâché 20 s après la fermeture (la fraîcheur du cache
  d'ouverture). Le serveur y poussera commentaires, interactions (ajout ET retrait, la ligne entière) et
  commentaires d'activité.
- L'auteur d'une publication reçoit les mêmes lignes sur `user:<lui>` : la pastille et le compte de SES
  cartes bougent comme avant, sans rien ouvrir. Un accusé de lecture part aux autres membres, sur
  `user:<membre>`.
- Publications, profils et lives : plus de direct. Le filet du fil reste à 60 s tant que le fil est à
  l'écran, pour tout le monde (`filetEstLeSeulChemin` n'a plus de terme d'identité) ; celui des lives
  aussi, et relit tout de suite au retour au fil ou au premier plan (sur le fil seulement) ; un profil
  changé se voit à la prochaine résolution (`_resolveProfilesByIds`, 2 min) ou au rechargement. Le
  battement de cœur d'un live (un UPDATE toutes les 25 s) ne part plus vers personne.
- Un sujet en PANNE (délai, canal fermé, adhésion sans réponse 15 s) fait relire la discussion à
  cadence adaptative (`discussionRelectureProchainPas`, 5 s → ×1,5 → 30 s) ; un REFUS de policy n'est
  pas une panne (avant la migration le serveur refuse tout `fil:`, après il ne refuse que l'illisible).

**La séquence — client d'abord, et un client valable dans les DEUX états.** La migration
(`migration_realtime_public_hors_cdc_2026-11-09.sql` : triggers `realtime.send`, policy
`passio_rt_recevoir_fil`, publication vidée) exige la contre-revue de PASSIO74 avant d'atteindre le
staging comme la production (`attester-migration.mjs`). Le client part donc SEUL d'abord : il garde
cinq liaisons CDC « de transition » (accusés, interactions ×2, commentaires, commentaires d'activité)
qui livrent comme hier tant que les tables sont publiées, et il écoute déjà `fil:` et `user:` — les
mêmes gestionnaires, idempotents (`_rtDejaTraite`). Après la migration, le premier refus du serveur
(message `system` en erreur) rend `realtime:db` pour la session (`_cdcRetire`).

**Les pièges, chacun payé ce jour-là.**
- ⚠️ **APRÈS LA MIGRATION, UNE LIAISON CDC N'EST PAS MUETTE : ELLE EST RÉESSAYÉE** (relecture
  `audit-passio`). Une table hors publication fait refuser au serveur la création des liaisons du canal,
  qu'il retente toutes les 5 à 10 s tant que le canal reste ouvert — pour chaque compte, en réveillant
  chaque fois le relevé qu'on vient d'éteindre. Le premier jet écrivait « la table sortie fait taire
  celui-ci » : c'était faux, et le `PREREQUIS-CLIENT` ne l'aurait pas vu (ce client porte les deux
  noms d'événement). D'où l'écoute du message `system`.
- ⚠️ **LE SOCKET QUI S'ENDORT SE COUPE AVANT DE RENDRE SES CANAUX** (défaut du 2026-09-21, lu dans le
  SDK 2.116) : un départ de canal ne se résout tout de suite que si le socket ne peut plus pousser.
  Dans l'ordre d'avant (`removeAllChannels` puis `disconnect`), chaque départ attendait 10 s une
  réponse perdue ; le canal restait dans `getChannels()` — et `supa.channel(sujet)` RENDAIT cette
  instance mourante à un réveil (adhésion jamais faite) —, puis `removeAllChannels` finissait par un
  `disconnect()` qui coupait le socket rouvert entre-temps. Le gestionnaire des sujets attend en plus le
  départ d'un canal du même sujet (`attente`).
- ⚠️ **UNE LECTURE EN ÉCHEC N'EST PAS UNE DISCUSSION VIDE** : `supaLoadEventComments` rendait `[]` sur
  une erreur, et `_loadEventComments` effaçait la discussion d'une activité (écran ET cache). Préexistant,
  mais la relecture de repli — qui tourne quand le réseau va mal — l'aurait refait toutes les 5 s.
  Désormais `null`, liste gardée, lecture non datée, cadence vive.
- ⚠️ **UNE RELECTURE EST UN INSTANTANÉ** : un commentaire arrivé par le sujet PENDANT la lecture était
  écrasé par la page (et la déduplication empêchait sa seconde copie de le remettre) ; une hydratation
  en échec repeignait « 🤍 0 ». `_relireDiscussionPublication` garde l'arrivé et reporte les interactions
  connues quand `hydrateCommentInteractions` (qui le rend désormais) n'a rien lu.
- ⚠️ **`pageshow` PART AUSSI AU PREMIER CHARGEMENT** : relire les lives sur lui doublait la lecture de
  `supaInit` — et une réponse 2xx de plus efface le compte des échecs de `_sondeServeurReponse`.
  `audit-2026-11-etats-degrades.spec.js:330` (bandeau après trois 500) passait de 3 rouges sur 5 sur
  `main` (instabilité préexistante, hors lot) à 5 sur 5. Seul un retour du cache de navigation relit.
- ⚠️ **UNE CINQUIÈME SURFACE** : le panneau des Bobines affiche une discussion que `_discussionAffichee`
  ignore à dessein (elle sert à l'épingle, qu'il n'affiche pas). Sans la relecture adversariale, son
  spectateur perdait tout direct après la migration.
- ⚠️ **UNE ACTIVITÉ CRÉÉE DANS LA SESSION N'A PAS `fromSupabase`** : l'exemple se reconnaît à sa forme
  (`e<n>`, celle d'`est_identifiant_exemple`), pas au drapeau — même piège que `_ciEstExemple`.
- ⚠️ **`clock.fastForward` NE DÉCLENCHE CHAQUE MINUTERIE QU'UNE FOIS** sur l'intervalle sauté : une veille
  de 3 s ne passe pas dix fois en 30 s. `runFor` pour une cadence.
- ⚠️ **`capacite-likes-visibles:300` ÉTAIT UNE COURSE DU BANC** : `clock.install()` laisse couler le
  temps, le premier relevé part 200 ms après le démarrage du cycle, et le clic de Playwright en prend
  55 à 280 (mesuré des deux côtés ; 4 rouges sur 34 sur la branche, 0 sur 34 sur `main` — un écart non
  significatif, la course est des deux côtés). L'horloge est figée avant le premier clic.
- ⚠️ **Sur ce poste, un heredoc mange les barres obliques inverses** (déjà en mémoire) : un correctif de
  test écrit ainsi a produit des chaînes cassées et des expressions régulières vidées. Write, puis node.

**Ce qui change pour l'utilisateur, dit tel quel.** Une publication d'un autre arrive en 60 s au plus
sur le fil à l'écran (avant : ~1 s pour un compte) ; les compteurs de commentaires et les réactions
d'une carte qui n'est pas à moi suivent le même filet (les « j'aime » le faisaient déjà, 15–60 s) ; une
nouvelle photo de profil se voit en 2 min ou au rechargement ; une bulle « 🔴 LIVE » apparaît et
disparaît en 60 s au plus sous les yeux. Inchangés : les messages, les notifications, les appels, une
discussion ouverte (en quelques centaines de ms par le sujet, en 5 s au pire par la relecture), les
cartes de MES publications. Un visiteur : rien de changé (il n'avait pas de direct).

**Verrous.** `tests/e2e/realtime-public-hors-cdc.spec.js` (25 cas, rien n'est écrit : `supa.channel`,
`supa.from` et `supa.rpc` simulés), dont un cas par correction de la relecture adversariale ;
suites ajustées : `capacite-amplification` (⑦ ⑧ ⑩), `capacite-connexions-temps-reel` (porte
`_creerCanalFil`, garde `_filsRtPossible`), `capacite-socket-au-repos`, `capacite-likes-visibles`,
`realtime-diffusion-privee`, `tests/unit/charge-realiste.test.mjs` ; `capacite-realtime-cible.spec.js`
est parti avec la liaison `profiles` qu'il gardait.

**La première PR — le client de transition — est en production** (PASSIO74/passio-app#802, fusionnée le
2026-11-09). Mesure de référence prise juste avant, au canal ① : 7 492 816 appels de `list_changes` à
18:41 UTC, soit +5 905 depuis 12:40 (~10 minutes de relevé continu sur six heures calmes).

**La seconde PR — la migration et le client sans CDC.** `migration_realtime_public_hors_cdc_2026-11-09.sql`
(triggers `realtime.send` vers `fil:<id>` et `user:<uid>`, policy `passio_rt_recevoir_fil`, publication
VIDÉE — toutes ses tables, quelle que soit la liste du projet, et un éventuel schéma entier), son banc
`tests/sql/migration-realtime-public-hors-cdc.test.sh` (verdict 16/0/0, retour arrière rejoué), et le client
qui n'a plus AUCUNE liaison CDC : `_creerCanalDb` et le canal `conv_specific:` de la soupape v1 sont partis,
la soupape v1 lit ses messages sur `user:` comme v3 ; `scripts/realtime-publication.json` à publication
vide ; les bancs de charge passent au profil `sans-cdc` (et la mesure « temps réel (insert → reçu) » de
`scripts/charge.mjs`, qui écoutait `posts`, est retirée plutôt que comptée en échec) ; le pilotage ne
compte plus une publication comme livraison vérifiable (plus aucun `rt_recv post`). Ordre : client #802 en
ligne → contre-revue de PASSIO74 → migration (staging, suites à comptes réels, production) → fusion de ce
client. **La contre-revue est le seul contrôle humain de cette PR** : rien de ce qui suit ne part sans elle.

**Ses pièges.**
- ⚠️ **LA GATE DU SCHÉMA RÉSULTANT REFUSAIT LA MIGRATION** : `… drop tables in schema x` (le retrait d'un
  schéma ENTIER d'une publication) passait son motif d'exception (`table\b`), puis le brut `drop\s+table`
  l'attrapait dans « drop tables » — un faux positif de plus de la famille du 2026-09-20. Corrigé dans
  `scripts/lib/schema-resultant.js`, avec un cas à la forme EXACTE de la migration (les deux boucles dans le
  même bloc : c'est la première, `drop table %s`, qui fait inspecter le bloc), éprouvé par réinjection.
- ⚠️ **`audit:realtime` LIT AUSSI LES COMMENTAIRES.** Les profils `transition5` et `legacy12` du banc
  réaliste ne joignent plus jamais (gardes `*_HORS_LIGNE`) : leur tableau est une ARCHIVE, renommée
  `liaisonsArchivees`, et le commentaire qui l'explique n'écrit pas le marqueur en toutes lettres — la
  fenêtre de la gate aurait attrapé les tables du tableau qui suit.
- ⚠️ **UN TÉMOIN QUI NE PEUT PLUS RIEN RECEVOIR N'EST PLUS UN TÉMOIN** : la sonde du visiteur de R25
  (`realtime-poussee-reelle` ④) prouvait son canal par une suppression de `post_likes` ; la publication est
  vide, et le canal du visiteur est refusé depuis le lot 3 du 06/11. Le témoin est parti, le silence des
  sondes reste exigé, et les deux garanties se mesurent au verdict de la migration et à la gate.
- ⚠️ **UN RETRAIT N'EST PLUS `{ id }`** : `retrait-interactions-reel` ① exigeait la charge CDC d'un DELETE
  sous RLS (la clé seule, R37) ; il exige désormais la ligne entière, sur `fil:<publication>`. Le chemin
  `{ id }` → index reste dans le client et dans les bancs locaux, qui l'exercent par `user:<moi>`.
- ⚠️ **TROIS BANCS ANCIENS COMPARAIENT LEUR ÉTAT AU MANIFESTE** (`migration-realtime-publication`,
  `-telemetry`, `-diffusion-privee`) : rouges à la première CI. La règle existait déjà — le banc de la
  migration de publication la plus RÉCENTE compare l'état final au manifeste, les plus anciens rendent à
  leur attendu ce qui a été retiré depuis — ; le relais passe au banc de ce lot.
- ⚠️ **UN DÉMARRAGE PLUS COURT A FAIT ROUGIR UNE COURSE DU BANC** : `audit-2026-11-participants-compte`
  (« a bis », « c », « h0 bis ») rougissait en CI à chaque essai. Le bloc différé de `supaInit`
  (`rafraichirEvenements(true)`, à 2 s) tombait au milieu du scénario et remplaçait l'activité par une
  lecture d'avant le geste. La course existait (1 rouge sur 27 en local sur cette PR, 0 sur la première) ;
  le banc attend désormais ces blocs (`demarrageTermine` : les lectures de stories, qu'ils lancent seuls).
  ⚠️ **Il y en a DEUX** : `supaInit` tourne au démarrage puis sur `onAuthStateChange`, et chaque passage
  programme son bloc — deux lectures de stories à ~0,5 s d'écart dans le journal du faux serveur.
  Attendre la première seulement déplaçait la course (« c » rougissait alors sur le compteur) ; le banc
  attend que leur nombre ne bouge plus pendant 1,5 s. Deux défauts PRODUIT, révélés et non traités ici :
  une relecture partie avant un « je viens » écrase son compteur optimiste (une minute au plus), et le
  démarrage relit DEUX fois stories, activités et notifications.

**Appliquée le 2026-11-09, sur l'ordre de Benjamin** (« Fait la contre revue toi même »). Les deux
contre-revues sont des auto-revues du mainteneur unique : la revue 5832416134 sur `648e2a58`, puis la revue
5832598515 sur `aaa10e15`, dont le delta est un fichier de banc. Les attestations des deux cibles portent
l'empreinte `699b0ae2…`. Le staging a été migré à 20:44 UTC (10 OK, 0 ECHEC, 6 SANS OBJET : base purgée),
puis les suites à comptes réels sont passées sur la base migrée. La production a été migrée à 20:56 UTC :
**16 OK sur 16**, dont 7 sondes réelles annulées. Ensuite #803 a été fusionnée (`33469218`), et le job
« Déploiement production » est passé au vert à la seconde tentative : la première avait rougi sur
`irl-trust-safety-reel`, instable et hors lot. Le client servi ne porte plus ni `"realtime:db"` ni
`conv_specific:` (lu sur la page et ses 9 scripts).

⚠️ **LE STAGING MIGRÉ AVANT LA FUSION A FAIT ROUGIR `main` PENDANT 30 MINUTES**, comme prévu par
« staging migré avant le client » : le run de #804 (21:05 UTC) portait encore l'ancien
`retrait-interactions-reel`, qui attendait `realtime:db`. La fusion de #803 l'a réglé. Pour réduire cette
fenêtre, enchaîner staging, production et fusion sans pause.

**Mesure APRÈS — premier relevé (canal ①, production).**

| UTC (2026-11-09) | Appels de `list_changes` | Contexte |
|---|---|---|
| 12:40 | 7 486 911 | référence (60,31 % du temps d'exécution cumulé) |
| 18:41 | 7 492 816 | +5 905 en 6 h, avant #802 |
| 20:27 | 7 498 024 | +5 208 en 1 h 46, #802 en ligne (5 liaisons de transition) |
| 20:55 | 7 498 024 | juste avant la migration |
| 21:48 | 7 498 024 | migration + client sans CDC en ligne : 0 abonnement CDC |

- Avant la migration, le compteur avançait de 0,3 à 0,8 appel/s dès qu'un compte était connecté.
- Depuis, il ne bouge plus. À 21:48, un client tenait pourtant le socket : le slot
  `supabase_realtime_messages_replication_slot_…` (pgoutput, la diffusion depuis la base qui porte
  `user:` et `fil:`) était actif depuis 21:45. Ce slot est un FLUX, pas un relevé, et n'apparaît pas dans
  `list_changes`.
- Les poussées ont repris dès la migration (`user:` × `conv_members:INSERT` et `notifications:INSERT`).

**Ce qui reste.** Ce relevé a été pris un soir calme : il prouve le mécanisme, pas encore le volume.
Relever à nouveau le compteur après une journée d'activité (canal ①) : il doit rester à 7 498 024. Lire
aussi Supabase › Usage › Realtime Messages : #800 estime le mur mensuel déplacé d'environ 1 300 à environ
14 000 actifs par jour, à un facteur 2 près.

## 🖼️ LES ANCIENNES MINIATURES NE DEMANDENT PLUS DE TRANSFORMATION — ET LE QUOTA DE MESSAGES TEMPS RÉEL, AVANT ET APRÈS #802 (2026-11-09, la suite)

Demande de Benjamin : « combien d'utilisateurs peuvent utiliser l'app maintenant ? total ? en même
temps ? », puis « oui, fais-le » (lever le mur des avatars).

⚠️ **LE CALCUL A D'ABORD ÉTÉ FAIT SUR UNE COPIE PÉRIMÉE, ET IL NOMMAIT UN MUR DÉJÀ LEVÉ.** La copie de
travail était sur une branche partie de #792 (la veille) : `passioThumb` y demandait encore
`render/image`, et le premier rapport a désigné les transformations d'image comme le mur n° 1
(« ~50 profils avec photo ») alors que #795, fusionné et SERVI le matin même, l'avait levé. **Avant de
chiffrer une capacité, lire `origin/main` et le `release.json` servi, jamais la copie locale**
(`git fetch`, puis `git show origin/main:<fichier>`).

⚠️ **CE QUI RESTAIT VRAIMENT : LE RENVOI DES ANCIENNES MINIATURES.** `media.js` renvoyait encore
`/media/…?width=` vers `render/image` — les URL d'un appareil pas encore passé à #795. Éteindre la
transformation chez Supabase, le geste que #795 recommande, aurait donc cassé ces vignettes-là. Elles
reçoivent désormais l'OBJET, exactement ce que rend `passioThumb` ; la liste fermée des largeurs ne
borne plus que la clé de cache du bord. Verrou : `tests/unit/media-edge.test.mjs` ⑪ — aucune forme de
requête n'est renvoyée vers la transformation, et rien de ce que Netlify sert ou exécute (`js/` hors
`vendor/`, `pilotage/`, `data/`, `netlify/`, `supabase/functions/`, `sw.js`, `index.html`,
`styles.css`, `netlify.toml`, `_headers`) ne la demande — ni en clair (`render/`), ni par l'option
`transform` du SDK (`getPublicUrl`, `createSignedUrl(s)`, `download` avec options), qui fabrique
`render/image` lui-même. ⑫ éprouve l'effaceur de commentaires qui sert ⑪ : un « // » dans une URL n'est
pas un commentaire, du code après un « /* … */ » reste du code, un gabarit imbriqué reste du texte.
Éprouvé par RÉINJECTION : renvoi rendu à `render/image` (①, ⑦, ⑪ rouges) ; miniature transformée
ajoutée au client, option `transform` ajoutée à app-08, URL transformée derrière un commentaire de
bloc dans le pilotage (⑪ rouge chaque fois, la ligne fautive nommée).
⚠️ **ÉTEINDRE LA TRANSFORMATION N'EST PAS SANS RISQUE LE JOUR MÊME** (contre-revue `audit-passio` de
#800, P2-1) : un navigateur garde UN JOUR le renvoi de #795 vers `render/image` (`TTL_RENVOI`), et un
onglet resté sur un build d'avant #795 la demande directement chez Supabase (`js/release-guard.js` ne
force jamais de rechargement). **Le geste humain, gratuit : Supabase › Storage › Settings → éteindre
« Enable Image Transformations », au moins 24 h après la mise en ligne de #800, une fois constatés
zéro `/render/image/` sur 24 h dans les journaux Storage (ou Usage › Image Transformations à plat) et
plus aucun `release/version_skew` d'un build antérieur à #795** (`docs/CDN_MEDIAS.md`). Allumée,
`render/image` reste une URL publique : n'importe qui peut épuiser les 100 images d'origine du mois,
et au-delà, spend cap actif, s'applique la politique d'usage équitable de Supabase (avertissement,
puis restrictions possibles du projet entier).
Laissé pour un lot suivant, antérieur à #800 : ⑩ (« la liste couvre chaque largeur du client ») n'a
plus d'objet depuis que `passioThumb` ignore la largeur — retirer ces arguments morts le ferait
rougir ; ce sont désormais les largeurs FIGÉES des builds d'avant #795 qu'il faut couvrir.

**Capacité au 2026-11-09 au soir — mesuré :** 16 comptes (15 confirmés), 2 connexions en 24 h,
7 appareils du public en 3 jours ; base 120 Mo / 8 Go, médias 30 Mo / 100 Go ; calcul Micro
(60 connexions Postgres, 28 ouvertes). **Les murs, estimés :**

| Mur | Limite (Pro, spend cap actif) | Atteint vers… |
|---|---|---|
| E-mails d'inscription | 30/h (défaut Supabase en SMTP perso), 300/j (Brevo gratuit) | un pic de lancement ; Google n'y est pas soumis |
| **Messages temps réel** | **5 M/mois** | **avant la migration de #802 : ~1 300 actifs/jour (800 à 2 000) ; après : ~14 000** |
| Messages temps réel par seconde | 500/s (au-delà, déconnexions `tenant_events`) | avant la migration : ~430 comptes connectés ensemble ; après : les 500 connexions passent devant |
| Connexions temps réel | 500 | 500 sockets — un onglet ou appareil connecté chacun (un visiteur n'en ouvre pas ; `test:prod` et le tableau de bord comptent aussi) |
| Sortie en cache Supabase (médias) | 250 Go/mois | ~1 400 actifs/jour (fiche précédente : ~2 Mo par session, ~3 sessions par jour et par actif) |
| Bande passante Netlify (l'app seule) | 100 Go/mois | ~3 000 appareils/jour |
| Base Micro | ~400 req/s (banc du 14/09) | 2 000 à 4 000 personnes actives ensemble |

⚠️ **LE QUOTA MENSUEL DE MESSAGES ÉTAIT UN MUR EN (ACTIFS)² — #802, FUSIONNÉE LE MÊME SOIR, EN RETIRE
L'ESSENTIEL — ET AUCUNE JAUGE NE LE SUIT.** Supabase compte un message par client abonné et par
changement. Jusqu'à #802, chaque publication, commentaire, réaction à un commentaire, modification de
profil et battement de live (25 s) partait à TOUS les comptes connectés (les « j'aime » n'y passaient
déjà plus) : messages/mois ≈ 30 × 1,5 × e × (T / 1 440) × D², avec D actifs/jour, e ≈ 5 écritures
publiques par actif et par jour, T ≈ 25 min de socket par jour, 1,5 pour la pointe — ≈ 3,9 × D², les
5 M vers D ≈ 1 100, et 5 000 actifs/jour auraient fait ~100 M de messages (~230 $/mois sans spend cap) ;
par seconde ≈ e / (60 × T) × C², les 500/s vers C ≈ 390 connectés. **Depuis #802 (client), publications,
profils et lives ne partent plus vers personne** ; restent, jusqu'à sa migration, les cinq liaisons de
transition (commentaires, interactions ×2, commentaires d'activité, accusés) qui livrent encore à tous :
e ≈ 4, ≈ 3,1 × D², les 5 M vers D ≈ 1 300, les 500/s vers C ≈ 430. **Après la migration, plus rien ne part
« à tous »** : un changement ne va qu'à ceux qui regardent la discussion, à l'auteur et aux membres —
≈ 30 × e × k × D avec k ≈ 3 destinataires, les 5 M vers ~14 000 actifs/jour, et c'est la limite des 500
connexions, pas les messages, qui borne la simultanéité. **Ce sont des estimations, à un facteur 2
près** : le chiffre réel se lit dans Supabase › Usage › Realtime Messages, que rien dans le pilotage ne
suit encore.

---

## 🧩 LE BLOC APP EN 9 SCRIPTS : UNE VERSION NE RETÉLÉCHARGE QUE CE QUI A CHANGÉ — ET SOUS WEBKIT, IL A FALLU LE WORKER (2026-11-09)

Suite directe du lot précédent (« ce qui reste — code ») : `scripts/build.js` concaténait les 9
`js/app-0*.js` (+ `emoji-misc.js`, `passion-context.js`) en UN `dist/app.js`. Benjamin veut ses
modifications en ligne aussitôt : on ne regroupe pas les mises en ligne, on réduit ce que chacune
coûte. Point de départ : `6e4cbce3` (#797).

**Les mesures (production et historique de `main`, 2026-11-09).**
- `app.js?v=55a530d4a1` servi : 1 549 218 octets minifiés — **exactement** la sortie de terser sur le
  poste (même version, figée par le lockfile) ; transféré en **419 229 octets en brotli** (≈ un brotli
  q4 local + 1,9 % : Netlify compresse à la volée) et 444 628 en gzip (≈ niveau 6).
- 30 jours (rejoué sur la tête qui intègre #802) : 138 commits sur `main`, **40 touchent le bloc** ;
  scripts touchés par version : 1 → 11 fois, 2 → 10, 3 → 9, 4 → 4, 5 → 3, 6 → 3. Le plus remué :
  app-08, app-02, app-04.
- Un script seul, minifié et compressé (brotli calibré) : app-01 109 Ko · app-07 61 · app-08 60 ·
  app-02 57 · app-04 55 · app-05 43 · app-06 40 · app-09 (+ queue) 28 · app-03 6.

**Le bilan** (même tête ; le monolithe y pèse 1 558 410 octets minifiés, ~421 Ko servis).

| Poste (par appareil, brotli calibré sur le servi) | Avant (`app.js`) | Après (9 scripts) |
|---|---|---|
| Première visite | 421 Ko | ~458 Ko (**+37 Ko, +8,8 %** ; gzip 447 → 453 Ko, +1,5 %) |
| Une version qui touche le bloc (moyenne des 40) | 421 Ko | **~145 Ko (−66 %)** |
| Une version qui ne touche qu'app-02 ou app-08 | 421 Ko | 57 ou 60 Ko |
| 30 jours de `main` (40 versions) | 16,8 Mo | 5,8 Mo |

Le surcoût de la première visite (le brotli perd le contexte commun entre fichiers) est remboursé dès
la première version qui touche le bloc ; huit requêtes de plus, en parallèle.

**Ce qui est livré.**

| Pièce | Fichier | Verrou |
|---|---|---|
| 9 scripts `app/<nom de la source>.js?v=<empreinte de SON contenu>` ; `emoji-misc.js` et `passion-context.js` ferment le 9ᵉ, comme ils fermaient `app.js` ; `appHash` reste l'empreinte du texte d'ensemble (identique à l'ancien `app.js`, octet pour octet) | `scripts/build.js` (étape 1) | `tests/unit/build-id.test.mjs` ⑦ (modifier UN fichier ne change que l'empreinte de SON script ; mutation : une empreinte d'ensemble → rouge) |
| Chargeur : preload des 9 en parallèle, exécution UN PAR UN, chacun inséré au `load` du précédent (un script inséré retarde l'événement `load` de la page : l'application tourne avant lui, comme avec `app.js`), deux reprises (1 s, 2 s) puis ARRÊT, `passio:app-ready` une fois après le 9ᵉ | `scripts/build.js` | `tests/e2e/app-scripts-par-fichier.spec.js` ①②③⑤ (Chromium et WebKit ; mutation : n'insérer qu'après l'arrivée des 9 → ⑤ rouge) |
| `passioCompressImage` n'est plus définie qu'UNE fois (app-06, celle que la production exécute depuis juin) : la `function` d'app-09 est retirée | `js/app-09-boot-pwa.js` | `scripts/audit-globals.js` (rouge avant le retrait, vert après) |
| Garde : une affectation `window.X =` face à une `function X` d'un AUTRE fichier du bloc app est refusée | `scripts/audit-globals.js` | `npm run verif`, CI |
| Budget de démarrage : le bloc app compte pour UN poste, comme l'ancien `app.js` | `tests/e2e/audit-2026-11-perf-dist.spec.js` | — |
| `/app/*` immutable, plus de règle `/app.js` | `_headers` | `tests/unit/entetes-coherence.test.mjs` ③, `version-skew.spec.js` |
| Le worker reçoit la liste des fichiers versionnés de la version — les 9 scripts et `styles.css` (`FICHIERS_VERSION`, écrite par le build) : à l'installation il RECOPIE de l'ancien cache les inchangés, ne télécharge que les autres ; un fichier versionné est servi du cache, SANS revalidation ; n'entre au cache que du script ou du CSS (`contenuVersionne`) | `sw.js`, `scripts/build.js` (étape 6) | `app-scripts-par-fichier.spec.js` ④ (vrai worker, deux artefacts, deux moteurs ; mutations : sans recopie → rouge, sans cache d'abord → rouge sous WebKit) |
| Minification fichier par fichier, et refus de déployer si `dist/app/` n'a pas 9 scripts | `.github/workflows/deploy.yml` | — (CI) |
| La barrière des migrations lit les 9 scripts servis (un motif peut vivre dans n'importe lequel ; un seul illisible = refus) ; l'ancienne forme reste lue | `scripts/lib/barriere-migration.js` (`urlsBundlesServis`), `scripts/appliquer-migration.mjs` | `tests/unit/barriere-migration.test.mjs` ④ (sur le VRAI build ; deux mutations) |
| Le serveur d'artefact et les suites qui lisaient `dist/app.js` | `scripts/servir-dist.js`, `dist-build`, `version-skew`, `pwa-maj-pendant-appel`, `audit-2026-11-perf-dist` | — |

**Les pièges, chacun payé ce jour-là.**
- ⚠️ **LE MONOLITHE HISSAIT TOUTES SES DÉCLARATIONS EN TÊTE — 9 SCRIPTS NON** (trouvé par la relecture
  `audit-passio`, invisible à toutes les suites : elles tournent sur la sémantique du développement,
  où les 9 fichiers sont déjà 9 balises). `passioCompressImage` était AFFECTÉE par app-06
  (`window.… =`, WebP, 1600 px, 0,82) et DÉCLARÉE par app-09 (`function`, JPEG, 1280 px, 0,72, ajoutée
  le 2026-06-24 en la croyant « fantôme »). Dans `app.js`, la déclaration hissée était écrasée par
  l'affectation : la production a toujours tourné sur app-06, le développement sur app-09. À 9 scripts,
  app-09 aurait gagné en production aussi : photos du Studio, éditeur média et pièces jointes passés en
  JPEG plus lourd, sans un signal — mesuré en construisant les deux artefacts. Le doublon est retiré,
  et `audit-globals.js` refuse désormais ce cas (il ne comparait que des déclarations entre elles).
  Balayage de l'agent : 1 341 affectations, c'était le seul. Les enveloppes posées à l'exécution par
  des scripts HORS du bloc (`goTo`, `doLogout`, `renderIRL`…) sont voulues et hors de la règle.
- ⚠️ **UN `<link rel=preload>` NE RETARDE PAS L'ÉVÉNEMENT `load` DE LA PAGE, UN `<script>` INSÉRÉ SI.**
  La relecture relevait que les minuteurs de démarrage comptent désormais depuis LEUR fichier
  (app-04 arme ses files de rejeu à 4 s, app-08 le rejeu des publications à 6 s, gardés par
  `window._supaReal`, sans se réarmer s'ils arrivent trop tôt). Premier remède essayé : n'exécuter
  qu'une fois les 9 arrivés, comme le monolithe. Rejeté sur mesure : les 9 ne sont alors que des
  preloads, et la page déclarait `load` AVANT que l'application tourne (dernier script retenu 1,5 s :
  `load` à ~100 ms, l'application à ~1,6 s, Chromium et WebKit) ; trois cas de `feed-premier-rendu`
  joués contre l'artefact ont rougi (le banc attend `goto`, puis lit `state` encore nul). Avec
  `app.js` comme avec la chaîne retenue, l'application tourne avant `load` (verrou ⑤). Le décalage
  des minuteurs reste donc, en résidu : il ne joue que si les derniers scripts arrivent plus de 4 s
  après app-04 (réseau lent, version qui les a modifiés), avec des actions hors ligne en attente ;
  le rejeu est alors REPORTÉ (retour en ligne, action suivante, lancement suivant), jamais perdu.
  Même famille, même ordre de grandeur : un geste fait pendant ce chargement peut appeler un
  fichier pas encore exécuté (`ReferenceError` remontée, sans autre effet).
- ⚠️ **SOUS WEBKIT, LE `fetch` DU WORKER NE VOIT PAS LE CACHE OÙ LA PAGE A RANGÉ SES SCRIPTS** (Playwright
  WebKit 2388) : premier chargement contrôlé = 9 requêtes, et avec le worker d'avant ce lot, une
  version qui ne changeait QU'UN fichier faisait repartir les 9 — l'activation vide le cache du worker,
  et WebKit ne retrouvait rien ailleurs. Le gain aurait été nul sur iPhone. D'où la recopie à
  l'installation (l'ancien cache n'est vidé qu'à l'activation) : le résultat ne dépend plus d'aucun
  cache HTTP. Chromium, lui, rendait déjà les inchangés par son cache HTTP (0 requête). Ce qu'un
  VRAI iPhone (session persistante) fait de son cache réseau n'a pas pu être mesuré d'ici : le lot
  n'en dépend plus. Même mécanisme, même remède pour `styles.css?v=` : sous WebKit elle repartait à
  CHAQUE version, CSS inchangé compris — elle est dans la liste recopiée (`FICHIERS_VERSION`).
  Revers mesuré : à la toute PREMIÈRE installation, le worker WebKit retélécharge ce que la page vient
  de charger (avant ce lot, c'était la deuxième visite qui le faisait, pour `app.js`) ; Chromium non.
- ⚠️ **LE STALE-WHILE-REVALIDATE REVALIDAIT CE QUI NE PEUT PAS CHANGER** : sous WebKit, 9 requêtes à
  chaque ouverture, scripts pourtant en cache. Un `?v=<empreinte>` ne change jamais sous son adresse :
  `estVersionne` le sert du cache, sans revalidation.
- ⚠️ **SANS REVALIDATION, UNE RÉPONSE FAUSSE NE SE RÉPARE PLUS** — et la recopie la reporterait de
  version en version. Une page de portail captif (200, `text/html`) sous l'adresse d'un script :
  `contenuVersionne` n'admet que `javascript`/`ecmascript` (ou `text/css`), réponse `basic` et `ok`.
- ⚠️ **PLAYWRIGHT COUPE LE CACHE HTTP DÈS QU'UNE ROUTE EST POSÉE** : le premier ④ voyait les 9 scripts
  repartir à chaque réouverture sous Chromium, et ce n'était pas l'application (`sansDonneesDistantes`
  pose des `page.route`). Un cas qui MESURE un cache ne route rien ; son isolation vient de la cible
  Supabase fictive de l'artefact et du proxy mort.
- ⚠️ **L'ORDRE D'ARRIVÉE N'EST PAS L'ORDRE D'EXÉCUTION** (hoisting entre app-01 et app-09) : chacun
  n'entre qu'au `load` du précédent ; le preload garde le téléchargement parallèle (① retient le premier
  1,5 s : les 8 autres sont demandés avant qu'il arrive, l'ordre d'exécution reste celui du bloc).
- ⚠️ **UN SCRIPT MANQUANT ARRÊTE TOUT** : le monolithe ne pouvait manquer qu'en entier ; à 9, lancer la
  suite sans lui démarrerait app-09 sur une application incomplète (`ReferenceError` en série, et une
  page à moitié vivante). Deux reprises, puis arrêt et `console.error` (③).
- ⚠️ **LA QUEUE DU BLOC RESTE DANS LE 9ᵉ SCRIPT** : app-09 lance `boot()` en microtâche ; séparés,
  `emoji-misc.js` et `passion-context.js` auraient tourné APRÈS le début du boot, au lieu d'avant.
- ⚠️ **TERSER FICHIER PAR FICHIER EST SÛR PARCE QUE `--toplevel` N'EST PAS POSÉ** : aucun nom de premier
  niveau n'est renommé ni retiré, et c'est par eux que les 9 scripts classiques se parlent.
- ⚠️ **NETLIFY IGNORE LE `?v=`** (antérieur au lot, désormais par fichier) : une page périmée qui
  demande l'ancien `?v=` d'un fichier MODIFIÉ reçoit le nouveau contenu. Fenêtre de quelques
  millisecondes depuis la levée du rideau ; des noms de fichier hachés en feraient un 404 (non retenu ici).
- ⚠️ **L'ÉPURATEUR DES GARDES (`sansCommentairesNiChaines`) PREND L'APOSTROPHE D'UNE REGEX POUR UNE
  CHAÎNE** (`/Can't find variable/`) et avale la suite du fichier : les deux gardes ne voyaient plus ni
  `page.goto` ni `sansDonneesDistantes`. `Can.t` dans la regex.
- ⚠️ **`^` DANS UN `execSync` SOUS WINDOWS** est l'échappement de cmd.exe (`sha^1` → `sha1`) : `~1`.
- ⚠️ **CLAUDE.md EST À 39 991 / 40 000** : ce lot y retire 5 caractères, il n'en ajoute aucun.

**Vérifié en plus de la CI.** Dix suites fonctionnelles (démarrage, fil, première visite, conversation,
rideau, invitation, cadrage, interactions, fil fenêtré, historique) contre l'ARTEFACT construit
(`PASSIO_CIBLE=dist`, donc le vrai chargeur) : 168/169. Le seul rouge, `feed-premier-rendu` §7, lit
`fetch("/js/telemetry.js")`, un fichier que le build n'a JAMAIS recopié dans `dist/` (il est inliné) :
préexistant, propre à ce mode, que la CI n'exécute pas pour cette suite.

**Ce qui reste.** Mesurer sur un vrai iPhone (session persistante) ce que son worker retrouve dans le
cache réseau — le lot n'en dépend plus. La première installation sous WebKit (ci-dessus) : la page
pourrait confier ses scripts au worker plutôt que de le laisser les redemander. Et le résidu des
minuteurs de démarrage : les réarmer sur `passio:app-ready` (app-04 ×2, app-08), après avoir vérifié
que deux rejeux rapprochés d'une même file ne doublent rien.

## 🧪 LA CI NE PARLE PLUS AU PROJET DE PRODUCTION : UN PROJET SUPABASE VIDE POUR LES SUITES LOCALES (2026-11-09)

Demande du 2026-11-09 (« fais tout, optimise au maximum », usage massif sans dépenser) : les ~70 % de
requêtes venus de la CI, notés en fin de la fiche 📦 du même jour. PR #799, puis sa PR de suite.

**AVANT — mesuré, pas estimé.** Journaux de la passerelle (`query_logs`, source `edge_logs`, fenêtre du
08/11 12:00 au 09/11 12:00 UTC, connecteur en lecture seule) : **54 563 requêtes reçues par la
production, dont 37 159 (68,1 %) du réseau des runners GitHub** (`request.cf.asOrganization` :
Microsoft Corporation, Microsoft Limited, Microsoft Deutschland MCIO), **34 318 d'un navigateur
headless**. Treize runs « CI & Deploy » dans la fenêtre : **≈ 2 860 requêtes de production par run**.
⚠️ **LE BON DISCRIMINANT EST L'ASN, PAS LE MOT « headless »** : le reste du trafic Azure vient AUSSI
des suites — le projet WebKit (agent « iPhone OS 15_0 » de `devices['iPhone 13']`, 2 036 requêtes),
les agents simulés de `telemetrie-trafic` — et de scripts Node (424). Compter les seuls « headless »
sous-estimerait la CI.
Par famille, côté Azure : `video_lives` GET **7 873** (l'annuaire des lives, au démarrage puis chaque
minute) · `follows` HEAD **6 505** (compteurs d'abonnés, 2 493 identifiants inventés différents) ·
`passions` GET 4 264 + OPTIONS 1 918 (les suites qui ne passent pas par le helper) · `profiles` GET
2 633 · `conv_reads` 1 533, `conv_messages` 1 431, `conv_members` 655 · `user_state` GET 1 234,
**POST 1 122 refusés en 401**, PATCH 589 (zéro ligne) · `profiles` POST 1 101 (401) et PATCH 487 ·
**`telemetry_events` POST 1 005 ACCEPTÉS** (201 : de vraies lignes écrites dans la table de
production) · `auth/v1/user` 549 (403, jetons fictifs) · 160 connexions temps réel.
⚠️ **AUCUNE DE CES LECTURES NE SERVAIT UN TEST.** Une suite locale n'a pas de vraie session (pas de
jeton, ou un jeton FICTIF que la production rejette) et ses identifiants (`u_lea`, `conv_lea`, des UUID
inventés) n'existent pas en base : la production rendait des listes VIDES, en payant la sortie, la CPU
et les connexions de ses vrais utilisateurs. Ce qui ne revenait pas vide — les douze profils de
`discoverPeople`, un live en cours, un avatar réel — faisait dépendre le verdict du contenu de la base.

**L'ATTRIBUTION, SUITE PAR SUITE.** `scripts/trafic-supabase-tests.cjs` se précharge dans les processus
du lanceur (`NODE_OPTIONS=--require`, AUCUN fichier de test modifié : l'écoute passe par
l'instrumentation que Playwright offre à ses propres enregistreurs) et journalise toute requête vers
`*.supabase.co` avec son verdict : **arrivée au réseau** (`serverAddr()` non nul) ou servie / coupée
par une route ; `scripts/trafic-supabase-rapport.mjs <dossier>` en fait le rapport. Course de référence
sur `main` (projet `local`, interrompue près de la fin) : 13 549 requêtes Supabase émises par les
navigateurs, **1 704 arrivées en production, par 104 suites**, dont 197 ÉCRITURES (`user_state`,
`profiles`, `conv_reads`, `conversations`, `telemetry_events`). En tête : `creation-passion` (317),
`audit-2026-11-perf-derives` (165), `audit-2026-11-fluidite` (107) — toutes trois par `bootOnboarded`,
dont l'isolation ne couvrait que quatre tables, le référentiel et les médias.

**LE REMÈDE : `projetSupabaseVide(page, opts)` (`tests/e2e/app-helper.js`).** Posé par
`sansDonneesDistantes`, donc par `bootOnboarded`, et directement par les suites qui naviguent seules.
Il répond À LA PLACE du projet ce qu'un projet VIDE répond à un visiteur SANS session :
lecture → `[]` (HEAD : compte 0, `content-range` EXPOSÉ, sinon le SDK lit `count: null` en silence) ;
`.single()` → 406 PGRST116 ; table sans lecture pour `anon` → 401 42501 ; insertion → refus de la RLS,
sauf `client_errors` et `telemetry_events` sans compte (201, comme la production, rien d'écrit) ;
mise à jour / suppression → zéro ligne ; RPC → `[]` pour les deux qu'`anon` exécute
(`fil_compteurs`, `rechercher_passions`), 401 sinon ; jeton d'utilisateur → 401 PGRST301 sur le REST,
403 `bad_jwt` sur `/auth/v1/user` ; inscription, lien magique, code, renvoi, OAuth → refusés : **aucun
compte (MAU) ni courriel ne peut naître d'une suite locale** ; le référentiel `passions` → le MIROIR
(`servirPassions`), jamais `[]`.
⚠️ **AU NIVEAU DU CONTEXTE, ET C'EST TOUT LE CHOIX.** Playwright consulte les routes de PAGE avant
celles du CONTEXTE, quel que soit l'ordre d'enregistrement : toute route posée par une suite garde la
main, avant comme après `bootOnboarded`. Un filet de PAGE aurait écrasé les routes posées avant lui —
le piège de `sansMiroirPassions`, rejoué à l'échelle du projet.
⚠️ **`route.fallback()`, PLUS `route.continue()`**, dans les routes existantes : `continue` envoie au
RÉSEAU en sautant le contexte — les écritures auraient filé en production sous le filet.
⚠️ **LE PROJET `prod` EN EST EXEMPT** (`test.info().project.name`) : ses suites créent de vrais comptes
et mesurent la vraie RLS (`irl-trust-safety-reel` passe par `sansDonneesDistantes` et a besoin de ses
RPC réelles). `opts.sansIsolationDesDonnees` (faux serveurs, coupures maison) l'écarte aussi.
⚠️ **LES PRIVILÈGES D'`anon` SONT UN RELEVÉ DATÉ, PAS UNE SOURCE** (`has_table_privilege`,
`has_any_column_privilege`, `has_function_privilege`, `pg_policies`, canal ①, 2026-11-09) : 22 tables
sans lecture, `events` et `reglages_distants` par colonne, insertion acceptée sur deux tables
seulement. Une migration qui change un GRANT ne le met pas à jour ; une table absente du relevé est
traitée comme la majorité (lisible sous RLS, donc vide).
⚠️ **UN CHEMIN RÉEL SE DÉSIGNE, IL NE S'OUVRE PAS EN GROS** : `opts.cheminsReels` (RegExp) laisse au
vrai projet les seules requêtes désignées. Un seul usage : `telemetrie-preauth` ①, dont le sujet est la
policy RÉELLE d'insertion de `telemetry_events` (un ou deux lots par exécution). Toute suite qui s'en
sert, ou qui passe `sansProjetVide`, figure au socle (`scripts/tests-isolation-socle.json`) avec sa raison.
⚠️ **`events` EN LECTURE N'ATTEINT PAS LE PROJET VIDE** : la route de page des quatre tables du
2026-09-02 la sert `[]` avant lui. Le verrou éprouve la règle « par colonne » sur `reglages_distants`.

**LES 17 SUITES QUI NAVIGUAIENT SANS AUCUNE ISOLATION** (le vieil audit les exemptait : « ne touche pas
l'application ») posent le projet vide — `smoke` (le référentiel chargé depuis la production à chaque
cas), `access-gate`, `dist-build`, les quatre suites qui forçaient la télémétrie SANS route (leurs lots
s'écrivaient en production), `captcha-turnstile`, `confirmation-email`… `gate-sans-app`, inscrit au socle
avec « aucune donnée distante à isoler », lisait en production le fil, les rencontres, les profils, le
référentiel et un avatar réel : il isole désormais ses données. `sw-page-revalidee` entre au socle (sa
page de banc ne charge pas l'application, et une route désactiverait le cache HTTP qu'il mesure).
⚠️ **LA SONDE, PAS LA RÈGLE STATIQUE, A TROUVÉ LES DERNIERS TROUS** : `captcha-turnstile` appelait le
filet dans `ouvrirAuth`… et ses cas ⑪ ⑫ passaient par un second helper, `ouvrirAuthSansOverride`
(douze lectures du référentiel parties en production pendant la course APRÈS) ; le cas ㉖ de
`passions-plates` navigue lui-même, quand tout le reste du fichier passe par `bootOnboarded`. Une
règle qui juge le FICHIER ne voit pas l'APPEL — « la portée est l'appel, pas le fichier » (fiche du
2026-09-03), encore. Remède : un `beforeEach` au niveau du fichier pour le premier (il couvre tout
chemin, présent et à venir), l'isolation avant le `goto` pour le second. **Repasser la sonde après
tout lot qui ajoute une navigation** : c'est elle qui juge l'appel.

**APRÈS, EN LOCAL — même poste, même suite, même sonde.** Course complète du projet `local` sur la
branche de #799 (2 511 cas) : **24 798 requêtes Supabase émises par les navigateurs, 21 arrivées en
production** — contre 1 704 — dont 12 de `captcha-turnstile` et 8 du cas ㉖ de `passions-plates`
(deux chemins que le filet ne couvrait pas, corrigés dans la PR de suite), et la seule requête
voulue, le contrat réel de `telemetrie-preauth`. S'y ajoutaient **12 WebSocket temps réel** ouverts en
production par six suites `sansIsolationDesDonnees`, qui coupaient le HTTP mais pas le WebSocket
(`page.route` ne le voit pas) — `bootOnboarded` avale désormais le canal pour elles aussi
(`canalTempsReelAvale`, verrou ⑫). Après ces corrections, la sonde sur les suites concernées :
**1 requête partie (la voulue), 0 WebSocket**. Soit, par course de la suite locale, **1 704 requêtes
de production → 1**.
⚠️ **11 CAS ROUGES DANS CETTE COURSE, TOUS DE CHARGE** (six workers sur un poste partagé avec deux autres
sessions) : les six suites rejouées seules passent (59/59), et la CI de #799 — la référence — est
verte sur les mêmes cas.
⚠️ **UN ÉCHEC N'EST PAS UN DÉPART** : la première version de la sonde comptait comme parties les
coupures SIMULÉES par `piece-jointe-depot-echec` (`route.abort("internetdisconnected")`). Seule une
adresse de serveur prouve un départ ; le rapport range les échecs à part, par code.

**APRÈS LA FUSION DE #799 — mêmes journaux, lus PAR RUNNER.** #799 fusionnée le 2026-11-09 à
18:41 UTC. Premier relevé, 18:42 → 18:59 : un run complet de `main` (84c70d8b, vert, déploiement
compris) et deux runs de PR partiels — tous avec le nouveau filet, puisqu'un run de PR teste le
commit de FUSION avec `main`. **605 requêtes Azure en 17 minutes**, à comparer aux **≈ 2 860 PAR RUN**
d'avant. Lu runner par runner (une adresse de runner = un job), le run de `main` pèse **≈ 370
requêtes** : le job à comptes réels (≈ 216 — `authz-critical` sur la production, navigateur + Node
service role, par construction), les gates `dist` (≈ 14, voulues), les six shards locaux (≈ 40 en
tout : les WebSocket des suites `sansIsolationDesDonnees` et les deux trous de la PR de suite)… et
**le job WebKit (≈ 100), qui démarrait l'application SANS isolation, avant comme après** : voir
ci-dessous.
**Relevé plus large, 18:42 → 20:05 : DIX runs « CI & Deploy » terminés** (trois sur `main`, sept de
PR, tous avec le filet de #799) → **2 117 requêtes Azure, soit ≈ 212 PAR RUN contre ≈ 2 860 :
−93 %**. Ce qui reste, sur les dix runs : le job WebKit 985 (≈ 98 par run), le référentiel 505 et
les profils 317 (WebKit et gates `dist` pour l'essentiel), les scripts Node du job à comptes réels
136, la messagerie 131, le temps réel 121 (≈ 12 par run, les WebSocket des suites
`sansIsolationDesDonnees`), la télémétrie 81, `video_lives` 44 (contre 7 873 en 24 h avant).
**Avec la PR de suite** (WebKit, WebSocket, deux trous) : ≈ 100 par run attendus, **≈ −96 %** — il ne
restera que `authz-critical`, les gates `dist` et le contrat de télémétrie désigné.
⚠️ **LA PART EN POURCENTAGE TROMPE SUR UNE COURTE FENÊTRE** : 45,9 % dans ce relevé (68,1 % avant),
parce que le reste du trafic n'est pas constant (veilles, sessions qui testent en local sur d'anciennes
branches). Le bon indicateur est **par run**, rapporté au nombre de runs de `gh run list`.
⚠️ **WEBKIT : UNE PAGE QUE LE SERVICE WORKER CONTRÔLE ÉCHAPPE À TOUTES LES ROUTES.** La sonde sur le
projet `webkit-iphone` (180 cas) : 86 requêtes parties en production depuis `first-run` (38),
`conv-ouverture-fil` (28), `cadrage` (15) et `feed-premier-rendu` (5). Dans `cadrage`, le référentiel
(premier chargement) est servi par le miroir… puis le fil, `fil_compteurs` et les profils partent au
réseau : `sw.js` prend le contrôle dès la première visite (`skipWaiting` + `clients.claim()`), et sous
WebKit une requête qui traverse un service worker — même un qui ne lui répond pas, comme `sw.js` pour
une autre origine — n'est plus vue par `page.route` ni `context.route`. Pire pour `first-run` : à la
seconde visite, le worker ressert le SDK depuis SON cache, la coupure de `couperReseauSupabase` ne joue
plus, et un vrai client lit la production. Même cause que `pilotage-nuage` le 2026-11-04 (« un geste
n'envoie rien ») — trouvée là par hasard, ici par la sonde. Remède (Playwright le documente) :
`test.use({ serviceWorkers: serviceWorkersHorsWebkit })` (app-helper.js) — `block` sur WebKit,
`allow` sur Chromium, où le worker reste éprouvé par les mêmes suites ; jamais dans
`pwa-maj-pendant-appel` ni `sw-page-revalidee`, dont le VRAI worker est le sujet. Après : 180/180,
**0 requête partie**. Banc unitaire ⑦ : toute suite du socle WebKit qui pose les routes d'isolation
bloque le worker (réinjection faite sur `cadrage`).
⚠️ **À REMESURER SUR 24 H PLEINES** après la fusion de la PR de suite, avec la même requête
(`edge_logs`, `request.cf.asOrganization` préfixé « Microsoft », groupé par famille et par
`request.headers.cf_connecting_ip`), et le nombre de runs « CI & Deploy » de la fenêtre.

**LES SUITES À COMPTES RÉELS, AU STRICT NÉCESSAIRE.** Une seule vise encore la production :
`authz-critical` (la barrière RLS de la production ; le reste du projet `prod` tourne sur le staging) —
2 comptes par run, **12 créations et 12 connexions en 24 h** (`auth/v1/admin/users`, `auth/v1/verify`).
Purge vérifiée en base le 2026-11-09 : **0 compte `@passio-e2e.test` restant** (14 comptes au total).
⚠️ **LA PURGE N'EFFACE PAS UN MAU** : un compte connecté dans le mois compte, même supprimé ensuite —
~12 MAU par jour à ce rythme, ~360 par mois. Deux comptes PERMANENTS réutilisés à chaque run (le job
`prod` est déjà sérialisé) ramèneraient ce poste à 2 par mois — mais `authz-critical`, `compte-e2e.js`
et `global-teardown.js` sont des chemins protégés : à faire sous contre-revue.

**PIÈGES DU LOT.**
⚠️ **NE JAMAIS MODIFIER UN FICHIER CHARGÉ PAR UNE COURSE PLAYWRIGHT EN COURS** : un worker relancé (après
un échec) relit les modules — la course de référence a tourné deux minutes avec le nouveau helper avant
restauration. Écrire à côté (fichier neuf, scratchpad), poser après.
⚠️ **SOUS GIT BASH, `$PWD` VAUT `/c/Users/…`** : passé à `NODE_OPTIONS=--require`, Node pour Windows ne
le trouve pas et `npx` meurt sur « Could not determine Node.js install directory » — sans lancer un
seul test. Prendre `$(pwd -W)`.
⚠️ **LE JOB « Audits statiques et bancs serveur » N'INSTALLE PAS `node_modules`** : un banc unitaire qui
résout `@playwright/test` y tombe au chargement (premier passage CI de #799). On intercepte la DEMANDE
(`Module._load`), on ne résout rien.
⚠️ **`audit-2026-11-participants-compte` EST INSTABLE SUR `main`** (cas « c. » et « h6. » en flaky au
run 42653481806) et a rougi le shard 1 des deux premiers passages de #799. Son faux serveur passe
`sansIsolationDesDonnees` : le projet vide ne s'y pose pas, ce n'est pas lui. À traiter à part.
⚠️ **CE QUI PARLE ENCORE AU VRAI PROJET, PAR CONSTRUCTION** : les gates `dist` (`release-integrity`,
`passion-context`, au socle : l'artefact déployé et sa télémétrie réelle sont leur sujet),
`authz-critical` (la barrière RLS de la production), le contrat de `telemetrie-preauth`, et les scripts
Node des jobs (service role : purge, mesures). Le WebSocket temps réel des suites
`sansIsolationDesDonnees` est avalé depuis la PR de suite, côté banc seulement — le code temps réel de
l'application n'est pas touché (un autre lot y travaille).

Verrous : `tests/e2e/isolation-projet-supabase.spec.js` (12 cas, par le VRAI SDK, « arrivée au réseau »
jugée par `serverAddr()` ; ①, ⑤, ⑩ et ⑫ éprouvés par RÉINJECTION — sans le filet, ⑩ liste les
requêtes parties en production, et ⑫ voit la production refuser la poignée de main) ;
`tests/unit/isolation-projet-supabase.test.mjs` (matrice des réponses, exemption `prod`, toute suite
LOCALE qui navigue pose le projet vide, chemins réels au socle seulement — il tourne sans
`node_modules`, comme le job d'audits).
Remesurer : la sonde sur `--project=local` (chemin Windows : `$(pwd -W)`), puis la requête
`edge_logs` groupée par `request.cf.asOrganization` (préfixe « Microsoft »), par famille de chemin.
