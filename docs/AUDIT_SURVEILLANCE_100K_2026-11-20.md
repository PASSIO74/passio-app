# PASSIO à 100 000 inscrits — la surveillance tient-elle ? (audit du 2026-11-20)

> Question de Benjamin (20/11) : « Comment peut-on encore améliorer le système d'automatisation de
> la Sentinelle et du centre de pilotage ? Si 100 000 personnes l'utilisent, tout est-il bien
> contrôlé ? Problèmes d'affichage, bugs de contenu, clics sans effet, problèmes de connexion… »
>
> Méthode : six audits indépendants (affichage, contenu, clics, connexion, chaîne de réparation,
> pilotage), chacun contredit par un second relecteur chargé de réfuter chaque trou, puis une
> synthèse. Mesures de production par le canal ① (lecture seule). Suite du plan
> `docs/PASSIO_100K_AUTONOMIE.md` (2026-10-11) et de la matrice `docs/AUTONOMIE_EXPLOITATION.md`.
>
> **Livré le même jour (lot T1 + T10 partiel)** : priorité des signaux de panne dans la file de
> télémétrie, fin des réémissions de `perf-ios`, mesure du clic lent — voir la fiche du 20/11 dans
> `docs/journal/telemetrie-pilotage-sentinelle.md`. Le reste de ce document est la feuille de route.

**Réponse courte :** non, pas encore. Au trafic actuel (17 comptes, ~45 sessions par jour) la pile est solide. À 2 000–5 000 connectés, trois choses cèdent ensemble :

- **La télémétrie est refusée ou la table se ferme**, donc tout le reste devient aveugle.
- **Les seuils sont en nombres absolus**, donc le voyant reste rouge et l'app tourne en délestage permanent.
- **Les lectures sont plafonnées à 1 000–10 000 lignes**, donc deux familles de la Sentinelle sur quatre s'éteignent sans le dire.

S'y ajoutent des pannes qui ne laissent aucune trace aujourd'hui : photos qui ne s'affichent pas, connexion ou inscription cassée, toucher intercepté par un calque, script refusé au démarrage.

Les mesures de production viennent des six audits (canal lecture seule, 2026-11-20). Le trafic mesuré est surtout celui de l'équipe et des robots : les mécanismes sont sûrs, les volumes extrapolés sont des ordres de grandeur. La synthèse a relu le code sur lequel repose le lot du point 3 ; les pièces A et B, et la mesure du clic lent, ont ensuite été implémentées et éprouvées par réinjection (fiche du 20/11).

---

## 1. Tout est-il bien contrôlé à 100 000 ?

✅ oui · 🟡 en partie · ⬜ non

| Famille | Vu ? | Réparé seul ? | Tient à 100k ? | En une phrase |
|---|---|---|---|---|
| **Affichage** | 🟡 | ⬜ | ⬜ | Une erreur JS d'un compte connecté est vue ; un écran vide, une photo absente, un script refusé ou une lenteur ne laissent rien. |
| **Contenu** | 🟡 | ⬜ | ⬜ | L'écriture est jugée (15 parcours sous contrat), pas ce qui se voit : fil réduit aux exemples, notification jamais écrite, file locale perdue sont muets. |
| **Clics sans effet** | 🟡 | 🟡 | ⬜ | La détection marche aujourd'hui, mais devient muette vers 450 sessions par jour et ignore le « J'aime », les calques et les boutons désactivés. |
| **Connexion** | 🟡 | ⬜ | ⬜ | Tout est émis par le client, mais les lecteurs du nuage exigent un compte connecté : « plus personne ne peut entrer » est invisible. |
| **Chaîne de réparation (Sentinelle)** | ✅ | 🟡 | ⬜ | Chaîne sûre (identité serveur, périmètre borné), mais 6 enquêtes par jour, 60 comptes relus, et la preuve de guérison est le silence. |
| **Pilotage (voyant, À faire, délestage)** | ✅ | 🟡 | ⬜ | Honnête aujourd'hui (jamais vert sans tout lire) ; à l'échelle : rouge permanent, délestage permanent, aucune découpe par navigateur. |

---

## 2. Les trous, dédupliqués et triés par rendement

Rendement = impact à 100k × probabilité ÷ effort. Les identifiants entre parenthèses renvoient aux fiches des six audits.

### T1 — Les preuves (erreurs, parcours) attendent derrière le bruit, et le bruit dépasse le plafond
*(AFF-02, CLIC-04, PIL-01, volet client de CONT-01)*

- **Scénario :** en pointe, les lots sont refusés en 429 ; une ligne `error` ou `flow` attend derrière 59 lignes `perf`, puis la file de 300 jette les plus anciennes sans regarder leur type.
- **Preuves (relues) :**
  - `js/telemetry.js:523` — l'éviction coupe la tête de file, tous types confondus.
  - `js/telemetry.js:680-683` — le lot est composé dans l'ordre de la file.
  - `js/telemetry.js:1080-1087` — le délestage ne touche que les familles déjà échantillonnées.
  - `js/perf-ios.js:309-322` et `479-483` — une ligne par métrique toutes les 180 s, sans test de visibilité, réémise même sans nouvel échantillon.
- **Mesure :** les `perf` font 73–77 % des lignes (46 % pour le public seul) ; plafonds 1 800/min (comptes anciens) et 2 400/min (les autres).
- **Correctif :** priorité aux types critiques dans le lot et à l'éviction ; perf-ios dédoublonné et silencieux quand l'onglet est masqué. Plan détaillé au point 3 (A et B).
- **Risque :** normal · **Migration :** non · **Effort :** S.
- **Limite :** ne règle pas le plafond lui-même (voir T2).

### T2 — La table de télémétrie se ferme (« table pleine ») bien avant 100k
*(CONT-01, plus deux oublis : canari non routé, trafic interne dans le stock)*

- **Scénario :** la borne de 1,2 M lignes vivantes est atteinte en environ 5 h au débit maximal admis ; la purge ne retire qu'à J-3, donc la table reste fermée l'essentiel du temps et tout signal meurt.
- **Preuves :**
  - `migrations/migration_securite_lot4_telemetrie_2026-11-15.sql:19-20, 56-73` — la borne et son refus.
  - `supabase/functions/pilotage/index.ts:301-306` — `emettreCanari` rend `{emis:false, erreur}` (relu).
  - `index.ts:283` — l'erreur est rangée dans `gestes.canari` ; aucun lecteur trouvé dans `_shared/pilotage.js` ni `pilotage/pilotage.js`.
- **Correctif en deux temps :**
  1. Sans migration (S) : deux refus consécutifs du canari donnent une ligne « À faire » rouge qui cite le motif.
  2. Avec migration (critical, M) : borne par classe (non-critiques refusés à 60 %), purge par type (perf, action, click à 24 h), rétention courte pour `trafic = robot|emulation`, RPC `telemetrie_remplissage()`, ligne « Télémétrie pleine à x % ».
- **Risque :** critical · **Migration :** oui pour le second temps.

### T3 — Seuils absolus : voyant rouge permanent, délestage permanent, carte « erreurs » permanente
*(AFF-06, CNX-07, PIL-02, PIL-07)*

- **Scénario :** le bruit de fond de 25 000 actifs dépasse seul les seuils ; `decideAlerte` ne sonne que sur une transition, donc une vraie panne ne sonne plus.
- **Preuves :**
  - `supabase/functions/_shared/pilotage.js:327-335` — rouge à 10 erreurs ou 5 réponses 5xx en 15 min.
  - `_shared/pilotage.js:1367-1378` — sonnerie sur transition seulement.
  - `_shared/reglages.js:154-159` — délestage à 10 et 40 comptes.
  - `_shared/autonomie.js:49` — réveil de la Sentinelle à 2 comptes.
  - `scripts/veille-production.mjs:344-356` — alerte API en nombres absolus.
  - `pilotage/index.ts:676` — le classement des erreurs sort des 300 dernières lignes.
- **Correctif :**
  - Chaque seuil devient « plancher absolu ET taux », avec `comptes_connectes` comme dénominateur et la même heure sur 7 jours comme référence.
  - Sonner aussi sur une nouvelle raison rouge d'une liste fermée.
  - Classement des familles d'erreurs agrégé en base.
  - Bancs à trois échelles : 100 actifs, 25 000 actifs, vague de lancement.
- **Ordre :** après T1, car le dénominateur sort de la télémétrie.
- **Risque :** critical · **Migration :** oui (`pilotage_audience`) · **Effort :** M.

### T4 — La Sentinelle s'aveugle par ses plafonds de lecture
*(REP-01, REP-03, CLIC-01, PIL-04, plus les oublis « API tronquée » et « effets ambiants »)*

- **Scénario :**
  - Les familles boutons et parcours ne désignent plus rien au-delà de 10 000 lignes.
  - Les familles JS et API ne lisent que les 1 000 lignes les plus récentes, sans le dire.
  - Une famille de 60 comptes mange tout le budget de relecture d'ancienneté.
  - Un seul compte peut figer le voyant en « lecture partielle ».
- **Preuves :**
  - `scripts/sentinelle-detecter.mjs:1471-1486` — pagination plafonnée à 10 pages.
  - `:1311, 1376, 1441` — `limit` sans drapeau de troncature.
  - `:1563-1566` et `:769` — relecture d'ancienneté coupée à 60.
  - `:1533-1549` — une lecture incomplète ne désigne rien.
  - `pilotage/index.ts:945-966` et `:223` — la lecture tronquée des parcours tient le voyant.
- **Correctif d'abord (S, sans migration) :**
  - Drapeau `complet` sur les trois lectures JS/API.
  - Lire les clics avant les effets, puis les effets des seules sessions suspectes.
  - Exclure `action=like.ui_v*` et le trafic équipe, robot, émulation des « effets ».
  - Budget d'ancienneté par candidat, boutons compris.
  - Faire remonter « la Sentinelle ne lit plus X » à l'écran du pilote.
- **Correctif ensuite (migration) :** agrégats SQL `comptes_anciens(uuid[])`, `sentinelle_familles`, `sentinelle_boutons`, `pilotage_parcours`, avec plafond par compte dans l'agrégat.
- **Risque :** critical (sélection de ce qu'un agent répare) · **Effort :** S puis L.

### T5 — Photos et vidéos qui ne s'affichent pas : aucun signal
*(AFF-04, CONT-05, REP-09, cas 16 de la matrice)*

- **Scénario :** mur de sortie Storage, CDN, service worker ou codec : « Image indisponible » partout, voyant vert.
- **Preuves (relues) :**
  - `js/app-02-state-utils.js:11375-11386` — `imageFilIndisponible` remplace l'image sans rien émettre.
  - `js/app-05-config-profil.js:3105` — `_reelVideoError`, même silence.
  - `js/telemetry.js:1496` — l'écouteur `error` n'est pas en capture, donc les erreurs de ressource ne lui arrivent pas.
  - `js/telemetry.js:1624` — le crochet fetch ignore `/private-media/`.
- **Correctif :** compteur client et une ligne par session (plan au point 3, C) ; ensuite lecture par la veille en ratio, et ligne « Les photos ne s'affichent plus ».
- **Risque :** normal tant que le signal ne nourrit qu'une ligne À faire · **Migration :** non · **Effort :** M.

### T6 — Plus personne ne peut entrer : invisible
*(CNX-01, CLIC-08, REP-07, AFF-05, plus l'oubli « lien e-mail en erreur »)*

- **Scénario :** Turnstile, Google ou GoTrue cassé pendant une campagne ; les comptes déjà connectés continuent, tous les lecteurs exigent `auth_uid`, zéro alerte.
- **Preuves :**
  - `pilotage/index.ts:667` et `sentinelle-detecter.mjs:1311, 1385, 1447` — lectures filtrées sur `auth_uid`.
  - `js/app-02-state-utils.js:7592-7594` — une exception à la connexion n'émet rien.
  - `js/app-02-state-utils.js:6527-6537` — un 5xx ou un délai est rangé en « autre ».
  - `scripts/veille-production.mjs:298-306` — 0 compte créé rend « ok ».
  - `.github/workflows/disponibilite.yml:61-72` — simple `curl`, aucun navigateur.
  - Aucune lecture de `error_code` ou `otp_expired` dans `js/` (recherche refaite : vide).
- **Correctif :**
  1. Vérité serveur non forgeable : RPC `pilotage_auth_sante` (sessions et comptes créés par fournisseur, comparés à la médiane). Seule cette mesure peut passer au rouge.
  2. Job `fumee-production` dans `deploy.yml` : Playwright Chromium et WebKit contre le site servi avec `?equipe=1`, sans écriture en base. Le run rouge colore déjà le pilotage (`pilotage.js:337-339`).
  3. Côté client : codes `serveur` et `reseau`, événement `auth_exception`, traitement du retour de lien en erreur.
- **Risque :** critical (1 et 2), normal (3) · **Migration :** oui pour (1) · **Effort :** M.

### T7 — Aucune découpe par navigateur, OS ou version
*(PIL-05, AFF-03 lot A, CLIC-05 point 3)*

- **Scénario :** panne totale sur iOS Safari (15 % du parc) ; taux global 15 %, sous tous les seuils, pilotage « sain ».
- **Preuves :**
  - `pilotage/index.ts:956` — la lecture des flux ne sélectionne ni `platform` ni `browser`.
  - `_shared/parcours.js:50-62` — seuils globaux.
  - `js/telemetry.js:113-130` — aucune version majeure d'OS, aucune détection de WebView.
- **Correctif :** bilan par `platform + browser + app_version` (colonnes déjà là) avec au moins 2 comptes anciens par segment, état « panne concentrée » ; puis `meta.nav` et la WebView côté client.
- **Risque :** critical (un nouvel état rouge) · **Migration :** seulement pour les familles d'erreurs · **Effort :** M.

### T8 — La preuve de réparation est le silence, et l'agent peut toucher l'instrument
*(REP-05, CLIC-06, AFF-07, REP-02)*

- **Scénario :** une PR auto-fusionnée pose `refus_attendu` ou un try/catch ; le signal disparaît, l'issue dit « Déployé », le bouton est toujours mort.
- **Preuves :**
  - `.github/workflows/deploy.yml:252` — périmètre autonome : tout `js/*.js`.
  - `deploy.yml:307` — côté js, la liste critique ne cite que `js/vendor/*`.
  - `deploy.yml:1341` — « Déployé » sans mesure.
  - `sentinelle-detecter.mjs:886-901` — un vieux build redevient « vivant » après 2 h.
  - `sentinelle-detecter.mjs:1267` — « ajouter seulement `Telemetry.action` » est autorisé.
- **Correctif :**
  1. Une ligne dans `deploy.yml` : `js/telemetry.js`, `platform.js`, `reglages-distants.js`, `release-guard.js`, `perf-ios.js` rejoignent le `case` critique. Rendement très élevé.
  2. `estVivante` : une occurrence d'un commit connu antérieur au correctif est morte, quelle que soit sa date.
  3. Étape « contre-mesure » 6–48 h après déploiement : « vérifié sur N sessions », ou « signal éteint, non prouvé » avec le label `humain`.
  4. Émettre `nav` après `goTo`, et seulement si l'écran a changé.
- **Risque :** critical · **Migration :** non · **Effort :** S pour (1), M pour le reste.

### T9 — File d'enquêtes sans mémoire, et « rien à corriger » mensonger
*(REP-04)*

- **Scénario :** quand le budget de 6 enquêtes par jour est pris, le run ne lit même plus la production et finit vert ; le pilote lit « rien à corriger ».
- **Preuves :** `.github/workflows/sentinelle-autonome.yml:320-327, 337` ; `_shared/pilotage.js:913, 921`.
- **Correctif :**
  - Toujours lire ; conditionner seulement l'ouverture des issues.
  - Publier la file : candidats en attente, budget restant.
  - Score de priorité : part des actifs touchés × criticité du parcours.
  - Ne pas compter les issues `humain` dans le budget.
- **Risque :** critical · **Migration :** non · **Effort :** M.

### T10 — Clics que la capture ne voit pas
*(CLIC-02, CLIC-07, CLIC-03, plus l'oubli « bouton désactivé »)*

- **Scénario :** un calque transparent reste posé sur le fil ; on tape cinq fois « J'aime » ; aucune ligne.
- **Preuves (relues) :**
  - `js/telemetry.js:1567-1570` — sélecteur fermé, sortie muette si rien ne correspond.
  - `js/telemetry.js:294-302` — le libellé ignore `data-action`, alors que le « J'aime » en porte un (`app-02:11695`) et que son `aria-label` contient un compteur.
  - `js/telemetry.js:1601` — le secours à 1 s émet `ms: null`.
- **Correctif :**
  - Écouteur `pointerdown` : 3 touchers en 1 s sans effet donnent `tap_bloque`, avec `elementsFromPoint` et la garde `!interactif.contains(haut)`, bouton `disabled` compris.
  - `_libelleClic` lit `data-action` ; `libellesDuCode` l'extrait.
  - Le secours émet le temps réellement écoulé.
- **Risque :** normal côté client, critical dès que cela nourrit la Sentinelle · **Migration :** non · **Effort :** M.

### T11 — Script ou feuille de style refusés au démarrage : rien ne peut partir
*(AFF-01, plus l'oubli « feuille de style »)*

- **Scénario :** 404 final, empreinte refusée pendant une bascule, proxy : page figée, et `PASSIO_SUPABASE` n'existe pas, donc la télémétrie est muette.
- **Preuves :**
  - `scripts/build.js:169-178` — deux essais puis un simple `console.error`.
  - `scripts/build.js:251-281` — feuille de style remplacée sans signal.
  - `js/app-08-ui-modals-tour.js:4363` — seul endroit qui pose la configuration.
- **Correctif :**
  - Sortir `{url, anon}` dans un script de tête ; le motif existe déjà (`build.js:335-344`).
  - `error/app_script_echec` et `app_style_echec`, avec un panneau « Recharger ».
  - Chien de garde : `demarrage_bloque` 20 s après le déverrouillage sans `app-ready`.
  - Écouteur `securitypolicyviolation`.
- **Risque :** critical (chargeur de build) · **Migration :** non · **Effort :** M.

### T12 — Le fil et les stories n'ont aucun filtre côté serveur
*(CONT-03, plus l'oubli « stories »)*

- **Scénario :** le fil lit les 20 dernières publications de toute la plateforme et filtre côté client ; à 5 000 publications par jour, les amis disparaissent derrière des exemples, sous un « Tu es à jour » faux.
- **Preuves :**
  - `js/app-08-ui-modals-tour.js:5915-5925` — requête sans filtre de passion ni d'auteur.
  - `js/app-08-ui-modals-tour.js:6950` — stories, `limit(30)` sur toute la plateforme.
  - `js/app-02-state-utils.js:9680, 9718` — le séparateur ne regarde pas `_feedServerMayHaveMore`.
- **Correctif :**
  - Tout de suite (normal, S) : « Tu es à jour » seulement si `!_feedServerMayHaveMore`.
  - Ensuite (migration, critical, L) : RPC `fil_pour_moi(curseur)`, index composite, même traitement pour les stories.

### T13 — Mur des 500 sockets temps réel, et délais à 30 s mal routés
*(CNX-05, CNX-06, PIL-03)*

- **Scénario :**
  - Realtime refuse des clients alors que la jauge, qui compte des comptes et non des sockets, affiche 60 %.
  - Une base saturée produit des délais en statut 0 : la Sentinelle ouvre une enquête de code au lieu de délester.
  - Une panne de l'API d'adresses déleste toute la production.
- **Preuves :**
  - `js/app-08-ui-modals-tour.js:9451, 9219` — `subscribe()` sans rappel de statut.
  - `migrations/migration_reglages_distants_2026-10-11.sql:228-239` — jauge en comptes, 5xx sans filtre d'hôte.
  - `sentinelle-detecter.mjs:270-274` — un statut 0 visible n'est pas du bruit.
  - `js/telemetry.js:1624` — le crochet enregistre aussi les hôtes tiers.
- **Correctif :**
  - Rappel de statut unique et événement `rt_refus` : appareils qui n'atteignent pas `SUBSCRIBED` en 20 s.
  - `meta.delai=1` ; saturation renvoyée vers une ligne À faire, pas vers une enquête.
  - Filtre d'hôte à la lecture pour les 5xx.
  - Gigue sur les écouteurs `online`.
- **Risque :** critical · **Migration :** oui · **Effort :** M à L.

### T14 — Pertes silencieuses de contenu
*(CONT-04, CONT-07, CONT-02, CNX-03, CNX-02)*

- **Notifications de j'aime et de commentaire** écrites par l'appareil de l'acteur (`app-08:8759-8774`, `app-03:784-787`). Correctif : déclencheur serveur à identifiant déterministe. Migration, critical.
- **Files locales perdues sur quota** (`app-04:177, 629, 8488` ; `app-09:819`). Correctif : écrivain unique avec miroir IndexedDB et instantané `files`. Normal, M.
- **`diagLog` ne quitte jamais l'appareil** (`app-08:5311-5321`). Correctif : liste fermée d'une vingtaine de libellés, comptés par session. Normal, M, après T1.
- **`session_expiree_mode` sans lecteur**, refus de rafraîchissement confondu avec un mot de passe faux (`telemetry.js:1615-1616, 1645-1646`). Normal, M.
- **E-mails :** taux de confirmation masqué par Google, jauge grise, « mot de passe oublié » muet (`veille-production.mjs:734-740`, `pilotage.js:1250`, `app-02:6618-6633`). Normal, M.

### T15 — Réseau qui bloque Supabase, pilote qui dort, coupure pendant l'enquête
*(CNX-04, PIL-06, REP-08, REP-06, CONT-06, CONT-08)*

Rendement plus faible ou déjà planifié :

- Balise de secours sur l'origine Netlify (orange seulement, jamais de sonnerie).
- Issue `[PILOTAGE]` sur alerte non accusée (déjà spécifiée, cas 40).
- Geste « Couper le lot en attendant » proposé sur la ligne d'enquête (plan 100k, point 7).
- Normalisation des empreintes d'erreur : mesurer d'abord.
- `reconcile.js` : `truncated >= 1000`.
- Sortir `rt_recv` de `CRITICAL_TYPE` : aucun lecteur dans le nuage (`telemetry.js:429`).

---

## 3. LOT IMPLÉMENTABLE MAINTENANT
*(classe normal, sans migration, code client et tests)*

Quatre pièces indépendantes, relues dans le code. Les numéros de ligne sont ceux du dépôt au 2026-11-20.

### A — Les preuves passent en premier dans la file de télémétrie (T1)

**Fichier :** `js/telemetry.js`.

**État relu :**
- `enqueue` (l. 520-523) fait `queue.splice(0, queue.length - MAX_QUEUE)`.
- `flush` (l. 680-683) parcourt la file dans l'ordre jusqu'à 60 (20 en keepalive).
- `persistBacklog` (l. 469) fait `queue.slice(-MAX_QUEUE)`.
- Chaque événement porte `type` et `severity` (l. 1093-1097).
- `CRITICAL_TYPE` est défini l. 429.

**Plan :**
1. Ajouter `function _prioritaire(ev)` : vrai si `CRITICAL_TYPE[ev.type]`, ou si `severity` vaut `error` ou `warn`, ou si `type === "api" && status === "error"`.
2. `enqueue` : au dépassement, retirer d'abord les non prioritaires les plus anciens. Ne toucher un prioritaire que s'il ne reste plus que cela.
3. `flush` : deux passes sur la file, les prioritaires qui peuvent partir d'abord, puis les autres, jusqu'à `max`. Garder `_peutPartir` et le retrait par identité (`_retirerDeLaFile`) tels quels.
4. `loadBacklog` (l. 476) : remplacer `.slice(-MAX_QUEUE)` par la même éviction priorisée.
5. Corriger le commentaire l. 367-378 (« ~4 lignes par session » est contredit par la mesure).

**Verrous à écrire :**
- Dans `tests/e2e/telemetrie-limitee.spec.js` (existe, 3 tests) : route `telemetry_events` en 429 ; émettre 80 `tel.perf` puis un `tel.error` ; lever le 429. Le premier lot accepté doit contenir la ligne `error`.
- Nouveau `tests/e2e/telemetrie-file-priorite.spec.js` : hors ligne, émettre un `flow` start puis 350 `perf` ; au retour, le `flow` doit être reçu.
- Appeler `bootOnboarded` dans chaque suite (gate d'isolation).

**Réinjection :** remettre la boucle simple dans `flush`, puis le `splice(0, …)` dans `enqueue`. Chacun des deux tests doit rougir séparément.

**Attention :** `telemetrie-doublons.spec.js` verrouille « un succès retire son lot par identité ». Ne pas changer `_retirerDeLaFile`.

### B — perf-ios cesse de réémettre pour rien (T1)

**Fichier :** `js/perf-ios.js`.

**État relu :**
- `snapshot` (l. 309-322) émet une ligne `ios_stat_<m>` par métrique, plus `ios_context`, à chaque appel.
- Le périodique tourne toutes les 180 s (l. 479-483).
- Aucun `document.hidden` ni `visibilityState` dans le fichier (recherche vide).
- La photo `exit` part au `pagehide`.

**Plan :**
1. Dans le `setInterval` : `if (document.hidden) return;`. La photo `exit` reste.
2. Mémoriser `_nEmis[name]`. En phase `periodic`, n'émettre une métrique que si `s.n > _nEmis[name]`. Les phases `t45` et `exit` émettent tout ce qui a `n > 0`.
3. `ios_context` en `periodic` : seulement si au moins une métrique est partie.
4. Diviser la cadence sous délestage : relire `window.delestageFacteur` à chaque tour et sauter 1 tour sur 2 ou 3 tours sur 4.
5. Ne pas échantillonner par `Math.random` : les agrégats mentiraient.

**Verrous :** dans `tests/e2e/perf-ios.spec.js` (5 tests ; la suite garde contre l'échantillonnage, on dédoublonne seulement) :
- Avec `page.clock`, avancer 45 s puis deux fois 180 s sans interaction : zéro ligne `ios_stat_*` de phase `periodic` au deuxième tour.
- `document.hidden` forcé à `true` : zéro `periodic`.
- Un clic entre deux tours : `ios_stat_evt_click` repart.

**Réinjection :** retirer la comparaison de `n` (premier test rouge), puis la garde `hidden` (deuxième rouge).

**Preuve en production (canal ①) :** lignes par minute et par session, et part des `perf`, sur le seul trafic public, avant et après.

### C — Médias qui ne s'affichent pas : un compteur, une ligne par session (T5)

**Fichiers :** `js/telemetry.js`, `js/app-02-state-utils.js`, `js/app-05-config-profil.js`.

**État relu :**
- `imageFilIndisponible` (app-02:11375-11386) et `_reelVideoError` (app-05:3105) n'émettent rien.
- L'écouteur `window.addEventListener("error", …)` de `telemetry.js:1496` n'est pas en capture.

**Plan :**
1. Dans `telemetry.js`, exposer `Telemetry.mediaKo(genre, hote)` :
   - `genre` : `image`, `video` ou `audio`.
   - Famille d'hôte d'une liste fermée, calculée sans garder l'URL : `cdn-supabase`, `relais-media`, `prive`, `blob`, `externe`.
   - Ignorer si `navigator.onLine === false`.
2. `document.addEventListener("error", h, true)`, filtré sur `IMG`, `VIDEO`, `AUDIO`, `SOURCE`, qui appelle `mediaKo`. Dédoublonner par élément avec un `WeakSet`, car `imageFilIndisponible` l'appellera aussi.
3. Compteur des médias vus : écouteur `load` et `loadeddata` en capture, simple incrément, aucun événement.
4. Une ligne `track("media", "bilan", {meta:{vus, ko, famille, genre}})` au plus toutes les 3 min, et au `pagehide`, seulement si `ko > 0`. Type non critique, donc soumis au plafond client.
5. Appeler `mediaKo` depuis `imageFilIndisponible` et `_reelVideoError`.
6. Élargir le filtre du crochet fetch (`telemetry.js:1624`) à `/private-media/`.

**À vérifier par l'implémenteur :**
- Au canal ①, qu'aucune contrainte `CHECK` ne borne `telemetry_events.type`. Des types `push` et `release` existent déjà en base, ce qui le suggère sans le prouver.
- Que `scrubMeta` laisse passer ces clés (`npm run verif`, gate `audit-telemetry-keys`).

**Verrou :** nouveau `tests/e2e/monitoring-medias.spec.js` :
- `route.abort()` sur l'hôte Storage, fil avec deux publications à image : une ligne `media/bilan`, `ko ≥ 1`, famille `cdn-supabase`, aucune URL dans la ligne.
- Variante hors ligne (`context.setOffline(true)`) : aucune ligne.

**Réinjection :** retirer `true` (la capture) de l'écouteur et l'appel dans `imageFilIndisponible` : le premier test rougit.

**Ce que ce lot ne fait pas :** la ligne « À faire ». Lecture en ratio par la veille au lot suivant ; jusque-là le signal existe en base mais ne sonne pas.

### D — Un lien e-mail en erreur ne laisse plus la personne sans sortie (T6, volet client)

**Fichiers :** `js/app-08-ui-modals-tour.js` (traitement du retour d'URL, vers l. 3823-3838 et 4148 selon l'audit — bloc non relu ici, à lire avant d'écrire), `js/app-02-state-utils.js`.

**État relu :** aucune occurrence de `otp_expired`, `error_code` ou `error_description` dans `js/`.

**Plan :**
1. Au démarrage, avant le nettoyage du hash, lire `error_code` dans `location.hash` et `location.search`.
2. Ramener la valeur à un code fermé : `otp_expired`, `access_denied`, `autre`. Ne jamais émettre la description.
3. Émettre `tel.action("lien_retour_erreur", {rc})`.
4. Afficher le renvoi du lien par `_showResendConfirmation` (seule autorité d'après CLAUDE.md), puis retirer l'erreur de l'URL.
5. Dans le `catch` d'`onbDoAuth` (app-02:7592-7594) : `tel.action("auth_exception")`.
6. Dans `rcRefusAuth` (app-02:6527-6537) : ajouter les codes `serveur` (statut ≥ 500) et `reseau`.
7. Dans `onbForgotPassword` (app-02:6618-6633) : `tel.action("recover_requested", {rc})`.

**Verrou :** dans `tests/e2e/telemetrie-inscription.spec.js` (existe) :
- `page.goto("/#error=access_denied&error_code=otp_expired&error_description=…")` : le bouton de renvoi est visible et une ligne `lien_retour_erreur` porte `rc: "otp_expired"`, sans la description.

**Réinjection :** retirer la lecture de `error_code` : rouge.

**Non retenus dans ce lot, bien que tentants :**
- La ligne critique de `deploy.yml` (T8-1) : classe critical, mais une ligne ; à faire en PR séparée, tout de suite après.
- `data-action` dans les libellés (T10) : touche la frontière de confidentialité du détecteur.
- Le routage du canari (T2-1) : touche `aFaire`.

---

## 4. Ce qui demande une migration, une décision ou un geste humain

**Migrations (canal ③, contre-revue humaine) :**
- Borne de télémétrie par classe, purge par type, rétention courte du trafic robot (T2).
- `pilotage_audience` en taux, avec filtre d'hôte, délais et refus temps réel (T3, T13).
- Agrégats de la Sentinelle et `pilotage_parcours` (T4).
- `pilotage_auth_sante` (T6).
- Déclencheurs de notification sur `post_likes` et `post_comments` (T14).
- `fil_pour_moi` et index composite `posts(passion_id, created_at, id)` (T12).
- Familles d'erreurs agrégées et normalisées (T3, T15).
- À corriger au passage : `migrations/SCHEMA_PROD_REFERENCE.sql` ne contient pas `idx_tel_type_received`, pourtant présent en production.

**Décisions de politique :**
- Passer chaque seuil en taux : cela modifie une remédiation automatique (délestage).
- Bandeau d'incident automatique : seulement sur une liste fermée de raisons prouvées côté serveur.
- Gel nocturne des auto-fusions : la Sentinelle ne réparerait plus la nuit.
- Ouvrir ou non l'auto-fusion aux nouvelles familles `rendu` et `tap_bloque`. Recommandation : voie `humain` d'abord.
- Clés étrangères sur `post_likes` et `notifications` : le contenu de démonstration (`p1`, `pm1`) l'empêche en l'état.

**Gestes humains, quotas et fournisseurs :**
- Poser le secret `PILOTAGE_NETLIFY_TOKEN` : sans lui, la proposition de retour arrière est « inactive » (564 fois sur 564 d'après le suivi).
- 500 sockets Realtime pour 2 000–5 000 connectés : achat à faire avant la pointe.
- Brevo gratuit (300 e-mails par jour) et plafond horaire Supabase : à relire dans la console. Le code parle de 30 par heure, le journal de 150.
- Base Micro vers Small : le déclencheur « p95 > 1 s » n'est mesuré nulle part.
- Sortie Storage et taille de la base : la télémétrie seule peut dépasser 8 Go au plafond.
- Domaine personnalisé Supabase contre le filtrage de `*.supabase.co`.
- Second canal d'alerte et troisième domaine de sonde.
- Planifications GitHub servies toutes les 2 à 8 h au lieu de 30–60 min : toute alerte portée par GitHub seul a ce retard.

---

## 5. Ce que cet audit n'a PAS examiné

- **GitHub réel :** le connecteur GitHub n'a pas pu se connecter (proxy 403). Aucune issue, aucun run, aucun taux de service du cron, aucune récidive réelle n'ont été lus ; ces chiffres viennent des documents du dépôt.
- **Rien n'a été rejoué dans un navigateur.** Le scénario « clic à 3 s donne `ms: null` » est un raisonnement (0 occurrence sur 193 clics). Le comportement de supabase-js au mur des sockets est supposé.
- **Les volumes à 100k sont extrapolés** de 10 sessions publiques sur 72 h. Ne sont pas mesurés : publications par jour, taux de perte des notifications (3 sur 3 aujourd'hui), part d'iOS, taux d'erreur de fond.
- **Sécurité :** RLS, XSS et falsification n'ont été regardés que sous l'angle « un signal forgeable ne doit pas sonner ». Pas d'audit de sécurité des nouvelles surfaces proposées (balise Netlify, RPC).
- **Surfaces non parcourues :** appels et live WebRTC, push sur app fermée, modération et signalements, IRL (RSVP, QR), paiement, Edge Functions hors `pilotage`, `dashboard/` hors `reconcile.js`, `scripts/digest.mjs`, `controle-realtime.yml`, le service worker hors média privé.
- **Environ 1 240 `catch` vides** dans `js/app-01` à `app-09` : comptés par un des audits, pas triés. C'est probablement la première source de « bloc vide, zéro signal ». Un gate à cliquet qui interdit tout nouveau catch vide est à ajouter.
- **Coûts :** minutes GitHub, runs Claude (6 par jour), invocations de fonctions à 100k ne sont pas chiffrés.
- **Accessibilité, traductions, fuseaux horaires** et contenu faux mais « plausible » (mauvais auteur, mauvais compteur) : aucun détecteur proposé au-delà du banc « zéro valeur absurde ».
- **Limite de ma relecture :** pour le point 3, j'ai relu `telemetry.js` (file, flush, clic, écouteur d'erreur), `perf-ios.js` (photo, minuteur), `imageFilIndisponible`, `emettreCanari`, et constaté l'absence de `error_code` dans `js/`. Le bloc de retour d'URL d'app-08 (pièce D) et `scrubMeta` (pièce C) restent à lire par l'implémenteur.
