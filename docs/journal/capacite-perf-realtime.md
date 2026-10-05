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
