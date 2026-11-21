# Sentinelle autonome v2 — la chaîne GitHub, ses façons de mourir, ses gardes

Version du 2026-09-18 (lot A « autonomie »). Fichiers : `scripts/sentinelle-detecter.mjs`,
`tests/unit/sentinelle-detecter.test.mjs`, `.github/workflows/sentinelle-autonome.yml`,
`.github/workflows/claude-code.yml`, `.github/workflows/deploy.yml`, `docs/sentinelle/`.

## La chaîne, en une ligne

`sentinelle-autonome.yml` (cron horaire servi 3 à 4 fois par jour ; depuis le 21/11, relancé chaque heure par la veille du pilotage) lit la production →
ouvre UNE issue `[SENTINELLE]` label `sentinelle` → pose le label `claude` 8 s plus tard →
`claude-code.yml` écrit le correctif, le verrou et la fiche → PR auto-fusionnée si toute la
CI passe (gouvernance : périmètre + 2 fichiers / 60 lignes) → `deploy.yml` déploie et
écrit « déployé » sur l'issue. Ni PC allumé, ni geste humain. Mesuré du 09 au 13/09 :
6 enquêtes sur 9 réparées seules, 25 à 79 min entre l'alerte et la production.

GitHub est la MAIN. Tout ce qui exige Benjamin lui arrive **par e-mail GitHub, une fois,
avec le geste à faire** : une issue ou un commentaire écrit avec `github.token` (jamais
`SENTINELLE_TOKEN`, dont GitHub ne notifie pas l'auteur de ses propres gestes).

## Ce que le détecteur lit (v2)

| Source | Table | Ce qui en sort |
|---|---|---|
| Erreurs JS de la télémétrie | `telemetry_events` type `error`, env `production`, `auth_uid` non nul | famille `js` — la SOURCE (elle porte `app_version` et `session_id`), 5 occurrences d'une même empreinte par session au plus |
| Erreurs JS des visiteurs identifiés | `client_errors` (`auth_uid` non nul) | famille `js` — le REPLI : une ligne dont l'empreinte est déjà connue de la télémétrie est le doublon (même erreur, deux moniteurs) ; `uid` = `auth_uid` (identité serveur), jamais le `uid` écrit par le client |
| Appels refusés | `telemetry_events` type `api`, status `error`, env `production` | famille `api`, avec `app_version`, `severity`, `meta` |
| Boutons sans effet | clics (comptes seulement), puis effets des seules sessions suspectes | famille `bouton` (clics rageurs de comptes anciens) et un classement de suspects pour le résumé — voir « Elle lit tout, ou elle dit ce qu'elle n'a pas lu » |

Bruit lu sur ce que le client a **prouvé** : un statut 0 est du bruit sauf `severity =
error` sans `meta.masquee|hors_ligne|fermeture` (et alors ≥ 2 comptes) ; un 4xx avec
`meta.refus_attendu` est du bruit ; 429 se nomme « plafond de débit atteint ».

Chaque candidat porte `versions` (`app_version` → n, dernière) et ses 200 occurrences les
plus récentes `{at, app_version}` : c'est ce qui permet la dédup ci-dessous.

## Les façons dont la chaîne meurt, et la garde qui répond

| # | Façon de mourir | Mesuré | Garde (v2) |
|---|---|---|---|
| 1 | **Run Claude perdu par la course de 3 événements** (`--label claude --label sentinelle` → 3 runs dans le même groupe de concurrence, l'évincé était le seul qui travaille) | #316, #327, #337 : aucune PR, aucun commentaire, canal muet 6 h / 28 h 51 / 9 h | A1 : l'issue est créée avec le seul label `sentinelle`, `claude` est posé 8 s plus tard, seul dans son groupe. Depuis le 2026-11-04, la file de `claude-code.yml` garde les ordres (`queue: max` au niveau du job) ; le `sleep 8` reste tant qu'aucune vraie enquête n'y est passée (fiche « LE CANAL NE PERD PLUS UN ORDRE ») |
| 2 | **Enquête ouverte sans personne dessus** → « une enquête à la fois » muet | 18 % du temps sur 10 j | A2 : veilleur en tête de run — sans PR ni run après 20 min : relance UNE fois (`claude` retiré puis reposé, label `sentinelle-relancee`) ; après 6 h sans PR fusionnée : label `humain` + bilan, l'enquête sort du compte, elle n'est PAS fermée |
| 3 | **Récidive fabriquée** : dédup datée sur la fermeture (fusion), pas sur le déploiement ni le build du client | #355 a rouvert #350 sur une occurrence 41 min après la fusion, d'un client encore sur l'ancien app.js | A3 : `estVivante` — vivante si `app_version` est un build qui contient le correctif, sinon si postérieure à `deployeA` + 2 h (`SENTINELLE_GRACE_H`) ; le workflow date chaque enquête fermée sur le run deploy.yml vert de sa PR ; un correctif fusionné dont le déploiement n'est pas fini (run en file/en cours, ou fusion < 3 h sans run listé) est **en vol** : son titre est traité comme encore ouvert, on attend (`etatDeploiement`) ; sans PR ni déploiement retrouvé, règle historique par `closedAt`. Une fermeture À LA MAIN postérieure à toutes les occurrences tait toujours (une issue `humain`/`recidive` fermée n'est pas recréée à chaque run) ; une occurrence postérieure à cette fermeture rouvre |
| 4 | **Boucle** : même titre corrigé N fois | trois enquêtes, une cause, le 12/09 | A4 : ≥ 2 correctifs déployés sur le même titre → issue `sentinelle` + `recidive` + `humain`, sans `claude`, corps « décision humaine » |
| 5 | **Aucune mémoire** : la leçon reste dans un commit que personne ne relit | idem | A5 : la fiche `docs/sentinelle/<date>-<condensé>.md` est exigée (périmètre + hors comptage), les fiches proches sont jointes à l'enquête suivante, le bloc Cause/Correctif/Verrou/Leçon du commit est recopié sur l'issue |
| 6 | **Gouvernance rouge muette** : refus de périmètre ou de taille sans un mot sur l'issue | jamais exercé, chemin aveugle | A6 : commentaire de refus sur l'issue d'origine + label `humain` ; la PR reste ouverte pour relecture |
| 7 | **Fermée à la fusion, jamais déployée** : main rouge après la fusion | 8 rouges sur main en 10 j, dont un job « Déploiement production » | A7 : job `retour-issue` de deploy.yml — succès : « déployé à <heure>, run, commit » ; échec ou déploiement sauté : l'issue `sentinelle` est rouverte avec `humain` |
| 8 | **Détecteur en panne** (Supabase 5xx, jeton mort, script cassé) : un e-mail de run rouge parmi d'autres | — | A8 : issue `[SENTINELLE MUETTE]` label `disponibilite`, refermée au premier run suivant où « Lire la production » a vraiment rendu un verdict (pas sur un run vert où elle a été sautée) ; `disponibilite.yml` partage le label mais ne voit que les titres `[DISPONIBILITÉ]` — sans ce filtre, la sonde refermait la MUETTE dans les 10 min |
| 9 | Jeton `SENTINELLE_TOKEN` expiré (90 j) | — | étape « Le jeton est-il vivant ? » : run rouge nommant la page de renouvellement, puis A8 |
| 10 | Clé `service_role` changée | — | `exit 2` du détecteur, puis A8 |
| 11 | GitHub désactive les crons après 60 j sans commit ; les crons sont servis 4 à 23× moins souvent qu'annoncé | mesuré le 21/11 sur les 100 derniers passages planifiés : 3,7 par jour sur 24 demandés, écart médian 6,5 h, P95 9,9 h | **depuis le 21/11, la veille du pilotage (pg_cron, 5 min) relance le passage dès que le dernier est terminé depuis 1 h** (`cadence_sentinelle`, `doitCadencerSentinelle`) ; le cron reste un filet. Au-delà de 3 h sans passage : voyant orange et ligne « À faire » |
| 12 | **L'angle mort** : bouton mort, HTTP 200 faux, télémétrie interrompue | permanent | aucune : le silence n'est jamais une preuve de santé |
| 13 | **Lecture tronquée ou budget épuisé, run vert** : une famille ne juge plus, ou le passage ne lit même plus, et l'écran dit « rien à corriger » | mesuré le 21/11 : la famille bouton se taisait vers 435 sessions par jour ; six enquêtes dans la journée, et plus rien n'était lu pendant 24 h | le passage lit TOUJOURS ; chaque lecture dit si elle est complète ; ce qui n'est pas lu, jugé ou confié ouvre `[SENTINELLE PARTIELLE]` (label `sentinelle-partielle`), que le pilotage affiche en orange |

## Les labels

| Label | Posé par | Jeton | Effet |
|---|---|---|---|
| `sentinelle` | sentinelle-autonome, à la création | `SENTINELLE_TOKEN` (enquête) / `github.token` (récidive) | marque d'origine ; avec l'auteur OWNER et le préfixe `[SENTINELLE]`, arme l'auto-fusion ; compte dans les enquêtes en cours, plafond `MAX_ENQUETES` = 3 (sauf `humain`) |
| `claude` | sentinelle-autonome, étape séparée 8 s après | `SENTINELLE_TOKEN` | déclenche `claude-code.yml` (seul événement de son groupe) |
| `humain` | veilleur (6 h), gouvernance (refus), retour-issue (non déployé), récidive | `github.token` | la machine s'arrête, e-mail à Benjamin ; l'issue ne compte plus dans les enquêtes en cours ; `choisirCibles` saute son titre tant qu'elle est ouverte |
| `recidive` | sentinelle-autonome (A4) | `github.token` | ≥ 2 correctifs déployés sur le même titre |
| `sentinelle-relancee` | veilleur | `github.token` | le run Claude a été relancé une fois ; jamais deux |
| `disponibilite` | sentinelle-autonome (`[SENTINELLE MUETTE]`), disponibilite.yml (`[DISPONIBILITÉ]`) | `github.token` | alerte de disponibilité, jamais de correctif automatique ; chaque workflow ne referme que SON préfixe de titre |
| `sentinelle-partielle` | sentinelle-autonome, étape « État de lecture » | `github.token` | UNE issue d'ÉTAT `[SENTINELLE PARTIELLE]` : le passage n'a pas tout lu, tout jugé ou tout confié. Réécrite à chaque passage partiel, refermée seule quand tout est relu (au plus tôt 90 min après sa dernière réécriture, lue dans la ligne « Mis à jour » du CORPS et non dans `updatedAt`, qu'un commentaire avance ; conversation verrouillée). Jamais `claude`, jamais `sentinelle` : elle ne compte dans aucune enquête et ne déclenche aucune correction |
| `veille`, `digest` | lot B | `github.token` | veille production et digest quotidien (voir `docs/VEILLE_PRODUCTION.md` quand il existe) |

Coupe-circuit : une issue ouverte par PASSIO74 dont le titre contient `[SENTINELLE PAUSE]`
(lue par liste + filtre local, jamais par `--search` — même lecture dans `sentinelle-distante.yml`).

## Ce que Benjamin reçoit, et le geste

| E-mail | Geste |
|---|---|
| Commentaire « ✅ Claude Code a exécuté cette tâche » avec fiche et état de l'auto-fusion | rien, sauf « Auto-fusion : refusée / non armée » → fusionner à la main |
| « ✅ Déployé en production » | rien |
| Issue ou commentaire avec label `humain` (bilan du veilleur, refus de gouvernance, non déployé, récidive) | lire les liens, décider : correctif à la main (contre-revue si périmètre critique) ou fermeture motivée ; refermer l'issue |
| `[SENTINELLE MUETTE]` | ouvrir le run rouge : jeton, clé, Supabase, verrous |
| `[SENTINELLE PARTIELLE]` (aussi à l'écran du pilotage : « La Sentinelle n'a pas tout traité ») | « Régler » relance sa lecture ; si elle reste ouverte après une relance, soit la cause est un volume (rien à faire d'un toucher, lire la liste de l'issue), soit tout est relu et elle se refermera seule (au plus tôt 90 min après sa dernière réécriture) |

Fermer une enquête `humain` ou `recidive` à la main est un geste compris : la dédup tait
toutes les occurrences ANTÉRIEURES à la fermeture (elle n'est pas recréée au run suivant),
et rouvre à la première occurrence POSTÉRIEURE — c'est la récidive, et c'est voulu. Fermer
« pour faire du silence » sur un défaut encore vivant ne fait donc gagner qu'un run ;
ouverte et `humain`, l'issue ne gêne rien.

## Vérifier sans GitHub

- `node --test tests/unit/sentinelle-detecter.test.mjs` (62 verrous, chacun éprouvé par
  la mutation nommée en tête du test) ;
- `node --test tests/unit/sentinelle-workflows.test.mjs` (14 verrous : les blocs `run:`
  RÉELS du veilleur, de la dédup enrichie, de l'ouverture, de la récidive, de
  [SENTINELLE MUETTE], de `disponibilite.yml`, de la gouvernance et de `retour-issue`,
  rejoués contre un faux `gh` qui journalise le JETON de chaque écriture et un faux
  `sleep` qui journalise sa durée ; plus le point 8, `auto_fusion` et le snippet
  d'extraction de la fiche de `claude-code.yml`) ;
- `node --test tests/unit/sentinelle-taille-pr.test.mjs` (le snippet ASTRA-34 réel de
  deploy.yml, dont l'exclusion de la fiche) ;
- `bash tests/ci/frontiere-confiance.sh` (les valeurs figées de claude-code.yml).

## Quatrième famille : les parcours qui échouent (2026-11-06)

`classerParcours` (`scripts/sentinelle-detecter.mjs`) lit les flux d'action (`type=flow`) et fait d'un parcours refusé — même en HTTP 200 — un candidat : contrat de `supabase/functions/_shared/contrats-actions.js`, identité serveur (`auth_uid`) obligatoire, refus légitimes et mises en file exclus, action « sans verdict » jamais retenue. Titre `[SENTINELLE] parcours <action> <code> · <condensé>` (aucun texte libre), une enquête par parcours (`zoneCible`). Confort comme les boutons : sa lecture qui échoue ne fait pas échouer la détection. La veille la réveille dès qu'un parcours est en panne chez ≥ 2 comptes anciens. Détail : `docs/AUTONOMIE_EXPLOITATION.md`.

## Les instruments de mesure sont hors du périmètre de réparation (2026-11-20)

Audit « la surveillance tient-elle à 100 000 ? » (`docs/AUDIT_SURVEILLANCE_100K_2026-11-20.md`, T8) :
la preuve qu'une réparation automatique a guéri est le **silence** du signal. Une PR de la Sentinelle
qui touchait l'instrument lui-même — un filtre posé dans la télémétrie, le relais d'erreurs, la mesure
de performance, la garde de version, le délestage, ou l'enveloppe de `fetch` qui voit passer chaque
envoi — pouvait fabriquer ce silence, puis s'auto-fusionner.

- `js/telemetry.js`, `js/platform.js`, `js/perf-ios.js`, `js/release-guard.js`, `js/reglages-distants.js`
  et `js/identity-transition.js` sortent du périmètre autonome (`deploy.yml`, job « Gouvernance
  critique », même traitement que `js/vendor/*`) : une PR `[SENTINELLE]` qui y touche est refusée, le
  refus est écrit sur l'issue, label `humain`.
- Ils entrent au périmètre critique : toute PR, humaine comprise, exige la contre-revue ancrée sur le SHA.
- Le corps de l'issue le dit à l'agent avant qu'il écrive (`corpsIssue`, `scripts/sentinelle-detecter.mjs`) :
  si la cause est dans un instrument, c'est hors périmètre — la décrire et laisser la main, comme pour
  toute cause hors périmètre. Il dit aussi le principe : un correctif supprime la cause, JAMAIS la mesure.
- La politique d'automatisation le déclare (`exclus`, `supabase/functions/_shared/politique-autonomie.js`).
- **Les trois listes sont tenues ensemble** par `tests/unit/politique-autonomie-executants.test.mjs` ⑥ :
  ce que la politique exclut est EXACTEMENT ce que `deploy.yml` écarte, AVANT le motif `js/*.js` (dans un
  `case`, le premier motif gagne) ; chaque instrument est aussi au périmètre critique et nommé dans la
  consigne. En oublier un dans l'une des trois rougit.

⚠️ **`js/identity-transition.js` avait échappé au premier jet** — la contre-revue l'a trouvé. Il
enveloppe `window.fetch` et reconnaît `/rest/v1/telemetry_events` ; `scripts/build.js` l'injecte en
production juste après la télémétrie, et il est ABSENT de l'`index.html` de développement : seules
les suites qui construisent l'artefact le chargent (`deconnexion-artefact.spec.js`,
`release-integrity.spec.js`). Un étouffement TOTAL des envois y rougirait la première ; un filtre
SÉLECTIF (un message, un type d'événement) dans `observedFetch` serait passé inaperçu, depuis
l'intérieur du périmètre autonome. **Chercher un instrument, c'est chercher qui se trouve sur le fil
d'un envoi, pas qui porte « télémétrie » dans son nom.**

### ⚠️ Ce que cette garde ne ferme PAS

Elle interdit de modifier six fichiers : le chemin DIRECT, et le plus naturel (ajouter un
`refus_attendu` dans `telemetry.js`). Elle ne rend pas le silence infalsifiable. Depuis un fichier
du périmètre, une ligne suffit encore :

- **une enveloppe de `fetch` posée ailleurs** : la télémétrie envoie par le `fetch` global, et
  n'importe quel fichier du périmètre peut l'envelopper à son tour. Exclure `identity-transition.js`
  ferme cette enveloppe-là, pas la technique ;

- **les interrupteurs globaux** `window.PASSIO_TELEMETRY_SAMPLE = 0` ou `PASSIO_TELEMETRY_DEFAULT_ON =
  false`, posés par un script en ligne d'`index.html` ou par un script chargé avant la télémétrie
  (`js/access-gate.js`, `js/legal-textes.js`) ; aucune suite ne les voit, la télémétrie étant inerte en local ;
- **un global réassignable** que l'instrument consulte (`window.passioBugVideoSafari`, lu par l'écouteur
  d'erreurs) ou l'API publique elle-même (`tel.api = function(){}`) ;
- **l'opposition** `localStorage.passio_telemetry = "0"`, qui coupe aussi le relais `client_errors` ;
- et par nature : un `try/catch` large autour du défaut, un `display:none` sur un bouton mort, le
  retrait d'un `tel.flowStart`.

Ce qui est bien fermé : retirer la balise de la télémétrie fait échouer le build ; recopier
l'instrument sous un autre nom dépasse la borne des 60 lignes. **Seule la contre-mesure après
déploiement fermerait le reste** (T8-3 de l'audit : « vérifié sur N sessions » plutôt que le
silence, sinon `humain`) — à faire. D'ici là, une issue `[SENTINELLE]` « déployée » dit qu'un
correctif est en ligne, pas que le défaut a été revu guéri. La consigne de l'issue demande à l'agent
de ne jamais faire taire la mesure : c'est une instruction, pas une garde.

### Conséquences à connaître

- **Une enquête dont la cause est dans un instrument ne se répare plus seule**, et ses deux issues ne
  coûtent pas pareil :
  - l'agent ouvre quand même une PR qui touche l'instrument → refus écrit sur l'issue et `humain`
    AUSSITÔT ; la PR reste ouverte, à reprendre à la main ;
  - l'agent suit la consigne et s'arrête sans PR → son run finit rouge (pas de branche ni de PR),
    l'issue reçoit « ❌ Claude Code n'a pas exécuté cette tâche » à côté de son commentaire, le
    veilleur relance l'enquête UNE fois à 20 min (un second run d'agent), puis la passe `humain` à
    6 h. Pendant ces 6 h elle occupe une des 3 places ; elle compte dans le budget de 6 enquêtes par
    24 h pendant 24 h (il se compte par date de création).
  C'est le comportement de TOUTE cause hors périmètre (règle serveur, réparation trop large), pas une
  nouveauté de ce lot — il le rend seulement plus fréquent. Y remédier (un `humain` immédiat quand
  l'agent conclut « hors périmètre ») est un chantier de `claude-code.yml`, à part.
- `js/platform.js` porte aussi l'invite d'installation de l'application : un défaut d'interface à cet
  endroit part désormais chez un humain. Coût accepté.
- **La seconde chaîne, celle du poste** (`dashboard/server/repair.js`, `sentinel-production.js`), garde
  son ancienne liste blanche (`js/*.js`, `sw.js`). Une de ses PR qui toucherait un instrument est
  arrêtée par le périmètre critique (contre-revue manquante), mais sans mot sur une issue. ⚠️ Son
  défaut dans le code est ACTIF (`DASH_SENTINEL_REPAIR !== "off"`) : qu'elle soit éteinte tient au
  `.env` du poste, non versionné — le journal le note au 2026-09-18, le dépôt ne peut pas le
  vérifier. Deux autres verrous la retiennent par défaut : `DASH_ALLOW_MUTATIONS=false` et
  `DASH_SENTINEL_PRODUCTION=false` (`dashboard/.env.example`). À aligner avant de la rallumer.

Verrou : `tests/unit/sentinelle-workflows.test.mjs` (gouvernance A6) — chaque instrument refusé à une
réparation, refus ÉCRIT sur l'issue ; chaque instrument critique pour une PR humaine, accepté avec une
contre-revue ancrée — et `politique-autonomie-executants.test.mjs` ⑥. Neuf réinjections, toutes vues
par au moins un des deux bancs (ligne retirée, un instrument retiré, instruments retirés du critique,
un seul absent du critique, ligne déplacée après `js/*.js`, la même avec un commentaire recopié en
leurre, un absent de la politique, un absent de la consigne, principe « jamais la mesure » retiré). ⑥ lit des LISTES dans le texte du workflow : une branche antérieure du `case` qui
exempterait un instrument lui échappe — c'est `sentinelle-workflows`, qui EXÉCUTE le `case`, qui la voit.
Les deux bancs vont ensemble. ⚠️ La première version de l'assertion de périmètre ne vérifiait que l'échec du job : un
instrument sorti du périmètre restait refusé… par la seule contre-revue manquante, issue muette.

## Elle lit tout, ou elle dit ce qu'elle n'a pas lu (2026-11-21)

Audit « la surveillance tient-elle à 100 000 ? » (`docs/AUDIT_SURVEILLANCE_100K_2026-11-20.md`), trou T4,
part sans migration, et le cas de T9 qui faisait mentir l'écran. Avant ce lot, trois silences :
les erreurs JS et les appels refusés n'étaient lus que sur leurs 1 000 lignes les plus récentes, sans
drapeau ; les familles bouton et parcours ne désignaient plus rien au-delà de 10 000 lignes ; et sans
place d'enquête le passage ne lisait même plus la production. Dans les trois cas le run finissait vert
et le pilote lisait « rien à corriger ».

**Ce qui change dans le détecteur** (`scripts/sentinelle-detecter.mjs`) :

- `lirePagine` lit jusqu'à la page VIDE — ou un 416, qui dit la même chose — (plus jamais « une page plus courte que demandé »), entre deux
  bornes de temps fixées avant la première page, triée sur (colonne, id). Seule la PREMIÈRE requête
  lève ; une page suivante refusée ou expirée rend ce qui est lu avec `complet: false`. Chaque requête
  a son délai (20 s). Le message d'une erreur ne porte que le nom de la table.
- Les trois lectures « devoir » (`lireErreurs`, `lireErreursTelemetrie`, `lireApi`) lisent dix pages du
  plus récent au plus ancien et rendent `{ lignes, complet }`. Tronquée, une lecture reste classée :
  ses compteurs sont un plancher, jamais un faux positif.
- **La famille bouton se lit en deux temps** (`lireFamilleBoutons`). ① Les clics de comptes seulement,
  puis le classement existant rejoué SANS AUCUN effet : c'est le pire cas, donc un groupe qui ne passe
  pas ce filtre ne peut pas devenir une enquête. ② Les effets des seules sessions de ces groupes, par
  lots de 40 sessions. Un groupe est relu en entier ou pas du tout, et n'est jugé que si toutes ses
  sessions ont été relues complètement. Dès qu'un clic est lu, une lecture TÉMOIN d'une ligne éprouve la
  forme exacte de la requête du second temps (sinon elle ne tournerait pas avant qu'un bouton réunisse
  trois comptes).
- Les six marqueurs de pose d'interface (`MARQUEURS_POSE` : `ui_v4a4_pose`, `ui_v6_composer`,
  `ui_v6a_inbox`, `ui_v6b_profil`, `ui_v6c_pose`, `ui_v7_lot`) ne comptent plus comme l'effet d'un clic.
  Liste FERMÉE, confrontée au code par le banc ; pas le motif `ui_v*` (`ui_v2_nav` est un vrai effet).
- Les clics d'un robot ou d'une émulation ne pèsent pas (`TRAFIC_ECARTE`, importé de
  `_shared/parcours.js` : la même règle que la famille parcours). **L'équipe reste.**
- L'ancienneté se relit PAR candidat (30 comptes tirés au hasard, 60 pour un bouton), sous un budget de
  150 comptes DISTINCTS par groupe de familles, avec une mémoire pour le passage. Un refus du service
  d'authentification est compté au lieu de valoir « compte récent » en silence ; dix refus de suite
  coupent la relecture.
- `detecter()` porte désormais tout le passage (`principal()` ne fait que lire l'environnement et
  imprimer) : le banc l'exécute de bout en bout. Le verdict gagne `lecture` (`{ complet, partiel }`, des
  codes fermés) et `sources.boutons` (des nombres).

**Ce qui change dans le workflow** : « Lire la production » et la dédup tournent même sans place libre
(seule « Ouvrir l'enquête » exige une place) ; l'étape « État de lecture » publie l'issue d'état.

**Le classement `boutonsSuspects` du résumé a changé de sens** : il porte `portee: "groupes jugés,
comptes seulement"`. Il ne classe plus tous les libellés d'au moins dix clics, visiteurs compris.

### ⚠️ Ce que ce lot ne ferme PAS

- **Le seuil passe d'environ 435 à environ 2 000 sessions par jour ; au-delà, les boutons les plus
  cliqués ne sont plus jugés, c'est dit à l'écran, et seul l'agrégat SQL fermera le trou.** Le budget
  de 2 000 sessions vaut pour l'UNION des groupes suspects, et le premier temps (aucun effet) retient
  presque tout bouton populaire : passé ce volume, ce sont les petits groupes qui sont jugés, pas les gros.
- À l'échelle visée, l'état « lu en partie » sera DURABLE (appels refusés au-delà de 10 000 lignes par
  jour, boutons au-delà de 2 000 sessions) : voyant orange et ligne récurrente jusqu'au lot des agrégats
  SQL (`comptes_anciens(uuid[])`, `sentinelle_familles`, `sentinelle_boutons`, `pilotage_parcours`), qui
  demande une migration.
- La famille parcours tronquée ne désigne toujours rien au-delà de 10 000 étapes par 24 h : c'est
  maintenant DIT, pas levé.
- Détail des limites, des mesures et des pièges : fiche « LA SENTINELLE LIT TOUT, OU DIT CE QU'ELLE N'A
  PAS LU » de `docs/journal/telemetrie-pilotage-sentinelle.md`.

Verrous : `tests/unit/sentinelle-detecter.test.mjs` (T4-01 à T4-20), `tests/unit/sentinelle-workflows.test.mjs`
(T4-w1 à T4-w6), `tests/unit/pilotage.test.mjs` (T4-a à T4-d), `tests/unit/pilotage-chemins.test.mjs` (T4-k).
