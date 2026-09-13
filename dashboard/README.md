# Passio — Centre de pilotage

Tableau de bord indépendant de **supervision, pilotage et test temps réel** de
Passio. Il observe l'application en conditions réelles (connexions, écrans,
actions, messages, erreurs, API…), regroupe les bugs, prépare des contextes de
diagnostic pour Claude Code, pilote des sessions de test et génère des rapports.

Il est **réellement connecté** à Passio via la table Supabase `telemetry_events`,
alimentée par l'instrumentation `js/telemetry.js` ajoutée à l'app.

---

## 1. Architecture

```
Passio (PWA)                          Centre de pilotage (cette app)
  js/telemetry.js  ──insert──▶  Supabase.telemetry_events
                                        │ realtime (service_role)
                                        ▼
                                  Backend Node/Express
                                   • ingestion + store mémoire
                                   • REST + flux SSE
                                   • auth/rôles, bugs, sessions,
                                     tests, git, Claude, flags, audit
                                        │ SSE + REST
                                        ▼
                                  SPA (violet, temps réel)
```

- **Pas de nouvelle infrastructure** : Supabase (déjà le backend de Passio) sert
  de magasin d'événements et de bus temps réel.
- Le **backend détient la clé `service_role`** (jamais exposée au navigateur : la
  clé anon ne peut pas lire la télémétrie, par conception RLS).
- Le **frontend** est du vanilla JS + modules ES natifs (cohérent avec Passio,
  sans bundler), icônes SVG (type Lucide, pas d'emojis), graphiques `<canvas>`.

## 2. Installation

Prérequis : Node ≥ 20.

```bash
cd dashboard
npm install
cp .env.example .env      # puis éditer .env (voir ci-dessous)
npm start                 # http://localhost:4610
```

### Configuration minimale (`.env`)

| Variable | Rôle |
|---|---|
| `DASH_ADMIN_USER` / `DASH_ADMIN_PASSWORD` | compte admin du dashboard |
| `DASH_SESSION_SECRET` | secret de signature des sessions (générer aléatoire) |
| `SUPABASE_URL` | URL du projet Supabase de Passio |
| `SUPABASE_SERVICE_ROLE_KEY` | **lecture de la télémétrie** (Dashboard Supabase → Settings → API → service_role) |
| `PASSIO_REPO_PATH` | chemin du dépôt Passio (défaut : `..`) |
| `ANTHROPIC_API_KEY` | *(optionnel)* analyse de bug en direct par Claude |

Sans `SUPABASE_SERVICE_ROLE_KEY`, le dashboard démarre en **mode local** : tout
fonctionne (auth, git, tests, UI) mais aucun événement Passio n'est reçu.

## 3. Activer la collecte

1. **Appliquer la migration** (une fois) :
   ```bash
   psql "$DATABASE_URL" -f ../migrations/migration_telemetry.sql
   ```
   C'est du DDL, donc le canal ③ d'[ADR-012](../.passio/adr/ADR-012-canal-acces-base-de-donnees.md) : `psql` depuis un poste, ou le SQL Editor du tableau de bord. Le connecteur de lecture le refuserait.
2. **Instrumentation** : déjà en place — `js/telemetry.js` est chargé dans
   `index.html` et branché sur la navigation, les clics, les appels API, les
   erreurs et quelques actions clés (publication, message, like, commentaire, RSVP).
3. **Activation** : en production, la télémétrie est **active par défaut** (suivi
   continu de la beta) avec **opt-out** — `?telemetry=0` désactive durablement,
   `?telemetry=1` force la capture complète. Réglages : `window.PASSIO_TELEMETRY_SAMPLE`
   (fraction d'appareils, 1 = tous) et `window.PASSIO_TELEMETRY_DEFAULT_ON=false`
   (repli opt-in strict). Données minimisées (aucun PII) — **à mentionner dans la
   politique de confidentialité**, idéalement avec un bouton d'opt-out en Réglages
   (`PassioTelemetry.setEnabled(false)`).

## 2 bis. Présence permanente (rien à relancer)

```bash
cd dashboard && Installer-Demarrage-Auto.cmd
```

Dépose un raccourci dans le dossier Démarrage de ta session — **aucun droit
administrateur, rien de touché dans le système**. À chaque ouverture de session,
`supervise.mjs` démarre sans fenêtre et maintient le serveur en vie : s'il meurt,
il le relance (2 s, 5 s, 15 s, 30 s puis 60 s au plus, pour ne pas boucler sur une
erreur de démarrage). Journal borné dans `data/supervise.log`.

| Commande | Effet |
|---|---|
| `Installer-Demarrage-Auto.cmd` | installe et lance tout de suite |
| `Installer-Demarrage-Auto.cmd /retirer` | retire le démarrage automatique |
| `Arreter-Pilotage.cmd` | arrête superviseur + serveur (repart à la prochaine session) |
| `Connecter-Claude.cmd` | reconnecte Claude Code pour le pilotage (`/etat` : vérifier) — rien à redémarrer ensuite |

⚠️ **Le pilotage vit sur le disque système.** 22 plantages `ENOSPC` (disque
plein) du serveur entre le 1er et le 10 septembre 2026 : à chaque écriture
refusée (alertes, diagnostics, journal) le processus tombe, le superviseur le
relance, et le CLI `claude` lui-même — qui écrit ses jetons rafraîchis dans
`~/.claude` — peut perdre sa session. Un pilotage qui « se déconnecte des fois »
sur un disque à 100 % n'a pas d'abord un problème de connexion.

Depuis le 2026-09-13 le pilotage **mesure ce disque** (`server/disque.js`,
`fs.statfs` sur le volume de `data/`, toutes les 5 min) : ligne « Disque du
poste » sur la page Sources, alerte `warn` **une fois** au passage sous
`DASH_DISK_WARN_GB` (10 Go), `info` au retour au-dessus du seuil + 2 Go
d'hystérésis (`DASH_DISK_HYSTERESIS_GB`). Une mesure impossible garde l'état
connu — elle ne vaut ni « plein » ni « sain ». Verrous : `test/disque.test.js`.

Et **une écriture qui échoue ne tue plus le serveur** (`server/jsondb.js`,
2026-09-13) : `save()` était appelée sans garde par des minuteurs (battement SSE
toutes les 25 s, historique de contrôle, observation) et par `alerts.emit` — à
disque plein, ENOSPC hors de tout `try` arrêtait le processus, 22 fois. La
mémoire est désormais la vérité : la donnée est posée AVANT l'écriture, l'échec
est compté et exposé par `health()` (`write_failed:ENOSPC`), et la prochaine
écriture qui réussit réarme l'état sain et réécrit tout. Même esprit pour
`startIngest()` (promesse rattrapée), `release-recorder` (les deux
enregistrements protégés) et le superviseur (PID réécrit toutes les 5 min tant
que le disque le refuse). Verrou : `test/jsondb-health.test.js` « une écriture
impossible ne lève pas ».

Le superviseur, depuis le 2026-09-13 : **instance unique** (un second
`supervise.mjs` s'efface si le PID du fichier est vivant ET porte bien ce
dossier dans sa ligne de commande — dans le doute, il démarre), **compteur de
relances** transmis au serveur et affiché sur la page Sources (« Superviseur »,
rouge dès 3 relances), journal relayé en 8 premières + 12 dernières lignes (la
pile d'un `ENOSPC` tenait dans ce qu'on coupait). `Arreter-Pilotage.cmd` tue
désormais **tous** les superviseurs de ce dossier par leur ligne de commande,
filtre le port strictement, et vérifie à la fin que rien ne survit.

Le worker IA (`aiworker.mjs`, 2026-09-13) : une demande en échec n'est plus
rejouée toutes les 20 s à l'infini — **5 essais** (`PASSIO_AI_MAX_ATTEMPTS`) avec
recul 5, 10, 20, 40, 80 min, puis abandon annoncé ; une demande figée en
`running` par un arrêt brutal (le superviseur tue sans `finally`) est remise en
jeu au démarrage (quatre l'étaient depuis le 19-24/08) ; au délai dépassé,
l'arbre `claude`/`codex` est abattu en entier.

#### Realtime : le canal du pilotage est PRIVÉ (2026-09-12)

Le projet Supabase n'accepte plus que des canaux privés (« Allow public
access » OFF, geste ③ de `docs/OUVERTURE_PUBLIQUE_2026-09-11.md`). Le verrou
du dépôt ne couvrait que les `supa.channel(` de l'app : `dash:telemetry`, en
`admin.channel(`, est resté public et a été refusé toutes les 14 s pendant
neuf heures (`PrivateOnly: This project only allows private channels`, ~260
refus par heure dans les journaux Realtime), le pilotage vivant sur le seul
polling de secours sans le dire — le motif du refus n'était pas journalisé.
Corrigé : `{ config: { private: true } }` (mesuré : abonné en 0,9 s avec
`service_role`), motif gardé (`ingestState().realtimeLastError`) et affiché sur
la page Sources. Verrou : `test/ingest.test.js` « canal privé ».


## 2 ter. Tests du pilotage

`npm test` — **347 tests, ~40 s** (dont 5 dans un vrai navigateur).

Ce qu'ils couvrent, du plus proche du code au plus proche de l'écran :

| Niveau | Fichiers | Ce que ça prouve |
|---|---|---|
| Unités | 40 fichiers | moteurs, policies, agrégations |
| Contrat page ↔ serveur | `front-api.test.js` | les 60 appels de la page existent, avec le bon verbe |
| Gardes déclarées | `routes-caps.test.js` | les 81 routes et leur capacité, figées dans les deux sens |
| Gardes appliquées | `http-routes.test.js` | un vrai serveur refuse vraiment (401/403), quatre rôles |
| Écran | `navigateur.test.js` | Chromium : 29 onglets rendus, deux charges d'injection |

Le fichier navigateur **saute bruyamment** si Chromium manque, en disant
pourquoi — il ne laisse pas de trou : l'échappement est aussi couvert sans
navigateur par `spa-echappement.test.js`.

Convention maison : **tout test de sécurité ou de non-régression est éprouvé par
MUTATION** avant d'être retenu — on casse le code exprès, on vérifie que le test
rougit, on restaure. Un test qu'aucune mutation ne fait rougir ne protège rien,
et les commits de cette suite nomment les mutations passées.

## 3 bis. Sentinelle — le débogage sans rien faire

Onglet **Sentinelle**. Elle tourne en permanence dès que le dashboard est lancé :
elle écoute les alertes, retient celles qui comptent, appelle Claude Code, et
publie la cause dans le flux temps réel (toast + cloche + page). Aucun clic.

| Ce qu'elle analyse | Ce qu'elle ignore |
|---|---|
| Alertes **critiques** et **élevées** : erreur critique, bug touchant plusieurs utilisateurs, pic d'erreurs, chaîne d'action cassée (clic mort, échec), API en 5xx | `warn` et `info` (lenteurs, liens ouverts…), alertes levées à la main, toute cause déjà analysée dans les 6 dernières heures |

Chaque diagnostic commence par « En clair » et porte un **verdict explicite** :
*défaut réel*, *comportement attendu* (beaucoup de « bugs » du pilotage sont des
garde-fous qui font leur travail) ou *données insuffisantes*.

⚠️ **« Aucun diagnostic » ne veut pas dire « tout va bien ».** Un débogueur
déclenché par des alertes est aveugle à tout ce qui n'en produit pas : bouton qui
n'émet plus rien, résultat faux en HTTP 200, contenu disparu en silence, ou
télémétrie elle-même interrompue. Ces pannes-là ressemblent au calme. La santé se
lit sur l'Accueil (fraîcheur de l'ingestion, taux de réussite), pas ici.

### Elle répare aussi

Sur un verdict **défaut réel** — et seulement celui-là — elle enchaîne toute seule :
demande de correctif → application dans un **worktree git isolé** (ton dossier de
travail n'est jamais touché, jamais déplacé) → syntaxe → audits → tests e2e.

- **Vert** : le correctif est committé sur sa branche `sentinelle/<date>-<id>` et
  t'attend. Un bouton « Fusionner dans main » dans le tiroir du diagnostic. Rien
  n'est poussé : déployer se décide en regardant ce qu'on déploie.
- **Rouge** : la branche est **supprimée** et le motif affiché. On ne garde jamais
  un correctif « probablement bon ».

Périmètre du patch, verrouillé par test : `js/*.js`, `styles.css`, `index.html`,
`sw.js` — et **jamais `tests/`** (sinon un correctif paresseux se rendrait vert en
réécrivant le test), ni la CI, les migrations, les scripts, le dashboard. Ni
création, ni suppression, ni renommage de fichier. 120 lignes et 3 fichiers au
plus : au-delà ce n'est plus une réparation, c'est une refonte, et ça mérite un
humain. Le modèle a le droit de répondre « pas de correctif sûr » — c'est une
sortie légitime, pas un échec.

La réparation est refusée si des fichiers **suivis** sont modifiés dans le dépôt :
le worktree part de `HEAD`, on vérifierait donc une autre version que la tienne.

| Variable | Défaut | Rôle |
|---|---|---|
| `DASH_SENTINEL_REPAIR` | actif | `off` pour diagnostiquer sans jamais écrire de correctif |
| `DASH_REPAIR_SUITES` | `globals,handlers,smoke` | vérifications exigées avant de garder un correctif |
| `DASH_REPAIR_MAX_LINES` / `_MAX_FILES` / `_MAX_PER_HOUR` | `120` / `3` / `2` | bornes du correctif |

**Ce qu'elle ne fait jamais** : pousser, déployer, toucher `main` sans ton clic. Le
processus Claude qu'elle lance ne dispose que d'une liste blanche d'outils, sans
personnalisations ni serveurs MCP (voir [`docs/SECURITE.md`](docs/SECURITE.md) §4 bis).
Elle a besoin d'une source d'analyse : le `claude` local connecté (gratuit,
abonnement Claude Code) ou `ANTHROPIC_API_KEY`. Sans source, elle reste inerte
et le dit.

### Autopilote — la fusion locale sans clic (éteint par défaut)

Sans autopilote, la chaîne s'arrête sur « une branche t'attend ». Avec, elle va
jusqu'au bout toute seule : **fusion dans la branche locale cible**, re-jeu des
suites `authz,globals,handlers,smoke`, et `git reset --hard` **au SHA d'avant**
si l'une d'elles rougit. Chaque transaction est journalisée.

Allumer, sans terminal : double-clic sur **`Activer-Autopilote.cmd`**
(`/off` pour revenir au mode « propose seulement », `/etat` pour vérifier).
Il pose trois clés dans `.env` et redémarre le pilotage.

⚠️ **Il ne déploie JAMAIS en production**, et ce n'est pas un réglage :
`sentinel-autopilot.js` porte `productionDeploy: false` en dur, et l'exécuteur
refuse toute promotion si `DASH_ENV=production`. Le `git push` reste humain.

⚠️ **Il s'abstient si l'arbre de travail est sale ou si la branche courante
n'est pas la cible.** Si tu codes en permanence sur `main`, vise une autre
branche (`DASH_AUTOPILOT_TARGET_BRANCH`).

⚠️ **Un motif qui rate deux fois est mis en quarantaine** et cesse d'être promu
automatiquement (`sentinel-learning.js`) : c'est un frein, pas une mémoire — il
n'écrit aucune règle durable.

| Variable | Défaut | Rôle |
|---|---|---|
| `DASH_SENTINEL_AUTOPILOT` | `false` | autorise la promotion locale |
| `DASH_SENTINEL_LOCAL_GATE_V2` | `false` | barrière de preuves locales exigée avant promotion |
| `DASH_AUTOPILOT_TARGET_BRANCH` | `main` | branche locale cible (jamais poussée) |
| `DASH_AUTOPILOT_MAX_LINES` / `_MAX_FILES` | `60` / `2` | bornes d'un correctif promu |
| `DASH_SENTINEL_QUARANTINE_FAILS` | `2` | ratés avant mise en quarantaine d'un motif |

### Mise en ligne automatique — le mode le plus engageant (éteint par défaut)

Avec l'autopilote seul, la chaîne s'arrête sur « c'est fusionné dans ta branche
locale ». Avec la mise en ligne automatique, elle va jusqu'aux **utilisateurs** :

```
correctif vérifié → push de la branche sentinelle/* → PR ouverte
→ auto-merge armé → CI COMPLÈTE (audits, 7 bancs SQL, 6 shards e2e, prod)
→ GitHub fusionne SEUL quand tout est vert → Déploiement production → Netlify
```

Allumer : **`Activer-Autopilote.cmd /enligne`** (`/nonenligne` pour l'éteindre).
Il refuse d'armer si `GITHUB_TOKEN` est vide — un mode annoncé actif qui
n'ouvrirait jamais rien serait exactement la panne silencieuse qu'on corrige.

⚠️ **Ce n'est pas un `git push origin main`, et c'est délibéré.** `main` est
protégée : GitHub refuse un push direct (mesuré, *protected branch hook
declined*). Contourner demanderait de retirer la protection du dépôt, donc de
désarmer les 13 contrôles qui rendent une publication sans humain défendable.
On passe par eux. **Un rouge arrête tout** : l'auto-merge natif ne peut pas
fusionner une PR dont un check requis échoue — la sécurité n'est pas une
condition dans notre code, c'est une propriété du serveur d'en face.

⚠️ **La publication REMPLACE la promotion locale**, elle ne s'y ajoute pas :
sinon `main` local (commit de fusion) et `origin/main` (squash de la PR)
divergeraient, et aucun `pull --ff-only` ne rattraperait ça.

⚠️ **Le périmètre est re-vérifié à la publication**, indépendamment de
`repair.js` : `js/*.js`, `styles.css`, `index.html`, `sw.js`. Jamais `tests/`,
`.github/`, `migrations/`, `scripts/` ni `dashboard/`. La garde « Gouvernance
critique » du dépôt reste en travers en double : elle exige une contre-revue
humaine pour `.github/` et `migrations/`.

⚠️ **Plafond quotidien** (`DASH_PRODUCTION_MAX_PER_DAY`, défaut 3). Une journée
où la sentinelle publie plus que ça n'est pas une bonne journée : c'est le signe
qu'elle tourne en rond sur une cause qu'elle ne referme pas, et la bonne réponse
est un humain, pas un quatrième essai.

| Variable | Défaut | Rôle |
|---|---|---|
| `DASH_SENTINEL_PRODUCTION` | `false` | arme la mise en ligne automatique |
| `GITHUB_TOKEN` | — | scope `repo`, pour ouvrir la PR et armer l'auto-merge |
| `DASH_PRODUCTION_MAX_PER_DAY` | `3` | plafond de publications par 24 h |
| `DASH_PRODUCTION_BASE_BRANCH` | `main` | branche de base des PR automatiques |

### La connexion Claude Code se rattrape toute seule

La session OAuth du CLI expire. Jusqu'au 2026-09-09, elle n'était sondée **qu'au
démarrage** : le pilotage pouvait tourner des jours avec « analyse indisponible »
sans plus jamais rien diagnostiquer, et l'écran continuait d'annoncer l'état du
démarrage. Désormais :

- la sonde `claude auth status` est rejouée toutes les 10 min
  (`DASH_CLAUDE_CLI_WATCH_MIN`), et **toutes les minutes dès que la connexion
  manque** (`DASH_CLAUDE_CLI_RETRY_MIN`) — donc se reconnecter suffit, **sans
  redémarrer le pilotage ni cliquer nulle part**, et la reprise est vue en
  moins d'une minute ;
- un refus d'authentification pendant une analyse rabat l'état immédiatement,
  au lieu de laisser l'écran mentir — et il est signalé (jusqu'au 2026-09-12
  cette chute-là était muette) ;
- chaque bascule est signalée **une seule fois** : `warn` à la chute, **avec la
  raison**, `info` au retour. Sans la chute, la panne est silencieuse par nature
  (plus d'analyses = plus de diagnostics = ça ressemble au calme) ; sans le
  retour, on ne sait jamais si la reconnexion a pris.

**Se reconnecter : double-clic sur `Connecter-Claude.cmd`** (ou `claude auth
login` dans un terminal). Rien à redémarrer ensuite.

#### « Pas de réponse » n'est pas « déconnecté » (corrigé le 2026-09-12)

Mesuré en production : le pilotage affichait « CLI absente » (`installed:false`)
alors que `claude auth status` répondait en 0,5 s à côté. La sonde avait un
délai de 12 s et **tout dépassement était lu comme « pas installé »** — sur un
poste saturé (shards e2e, build, **disque plein** : 22 plantages `ENOSPC` du
serveur entre le 1er et le 10 septembre), une seule sonde lente rendait la
sentinelle sourde pour dix minutes, et l'écran donnait le mauvais geste.
Désormais la sonde distingue trois cas, et l'écran affiche la **raison** :

| `reason` | Ce qui s'est passé | Le geste |
|---|---|---|
| `logged_out` / `auth_refused` | le CLI répond : la session OAuth est tombée | `Connecter-Claude.cmd` |
| `probe` | la sonde ne répond pas (45 s, `DASH_CLAUDE_CLI_PROBE_TIMEOUT_S`) **3 fois de suite** (`DASH_CLAUDE_CLI_PROBE_FAILURES`) — avant ça, l'état connu est gardé | libérer le poste / le disque, chercher des `claude` orphelins ; rien à reconnecter |
| `not_installed` | la sortie n'est pas du JSON : `claude` introuvable ou trop ancien | installer / mettre à jour |

Un délai dépassé abat tout l'arbre de processus (`taskkill /T`) : un `claude`
orphelin par sonde s'accumulait sinon. Verrous : `test/claude-cli-watch.test.js`,
éprouvés par mutation (rabattre dès le premier échec, ne jamais rabattre, poser
`logged_out` au lieu de `probe`, rendre `noteAuthFailure` muet — chacun rougit
le sien).

#### Identifiants isolés — `DASH_CLAUDE_CONFIG_DIR` (posé sur ce poste le 2026-09-12)

Par défaut le `claude` du pilotage partage `~/.claude/.credentials.json` avec
l'application Claude de bureau et tous les terminaux. Observé le 2026-09-12 :
l'application de bureau **réécrit ce fichier** à chaque session (jetons MCP), et
les jetons OAuth du CLI s'y sont retrouvés vides — session perdue sans aucun
`logout`. Isoler le pilotage : `DASH_CLAUDE_CONFIG_DIR=.claude-cli` dans `.env`
(dossier relatif au dashboard, déjà ignoré par git), redémarrer, puis
**`Connecter-Claude.cmd`** — c'est la seule porte qui se connecte dans le bon
dossier ; un `claude auth login` dans un terminal ordinaire ne reconnecterait
pas le pilotage. Prix : une connexion de plus à faire, une fois.

Le dossier est appliqué par le **superviseur** à ses deux enfants (serveur ET
worker IA) — jusqu'au 2026-09-13, seul le serveur le lisait : le worker sondait
`~/.claude`, se déclarait « non connecté » et refusait ses tâches pendant que
le serveur analysait. Vérifié : `claude -p` avec un dossier vierge va droit au
contrôle d'authentification (pas d'écran d'accueil qui bloque).

#### Un refus d'authentification est re-sondé avant d'être cru (2026-09-13)

Une analyse qui échoue avec un message « ressemblant » à un refus d'auth ne
rabat plus l'état sur le seul message : la sonde `claude auth status` est
rejouée d'abord. Sonde connectée → l'état est gardé, l'erreur d'analyse est
notée ; sonde déconnectée → `auth_refused`, alerte une fois. L'ancienne
expression contenait `connect` : « Could not connect to server » ou
`ECONNREFUSED` faisaient passer une panne réseau pour une session tombée.
Verrous : `looksLikeAuthError`, `confirmAuthFailure` dans
`test/claude-cli-watch.test.js` (mutations : remettre `connect`, rabattre sans
sonder).

#### Limite d'usage de l'abonnement : raison `quota` (2026-09-13)

« You've hit your weekly limit · resets Aug 28, 3am » n'est ni une déconnexion
ni une panne — et `claude auth status` continue de dire « connecté ». Jusqu'ici
l'état restait vert pendant des jours (mesuré le 24/08), chaque alerte était
consommée en erreur, sans raison ni alerte. Désormais : 429 ou « … limit » →
raison `quota`, indisponible jusqu'à l'heure de remise à zéro lue dans le
message (sinon 60 min ; 15 min pour une limite de débit), alerte `warn` une
fois « Rien à reconnecter », puis `info` « limite levée » à l'échéance. Le quota
PRIME sur la session : une sonde « connecté » ne le lève pas avant l'heure. 529
(surcharge transitoire) n'en fait pas partie. Verrous : `looksLikeQuotaError`,
`noteQuota`.

#### Ce que l'écran suit en direct (2026-09-13)

Chaque bascule de la connexion est poussée en SSE (`claude`) : la carte
« Réparation automatique », la navigation et la page Sources se mettent à jour
sans recharger — jusqu'ici l'état lu au login était gardé 12 h et mentait dans
les deux sens. « Revérifier » passe par le tour de surveillance (il SIGNALE la
bascule). Le panneau Orchestrateur affiche l'état de connexion du CLI, plus la
seule vie du pid.

Réglages (`.env`, tous facultatifs) :

| Variable | Défaut | Rôle |
|---|---|---|
| `DASH_SENTINEL` | actif | `off` pour démarrer en veille |
| `DASH_SENTINEL_LEVELS` | `critical,high` | niveaux d'alerte analysés |
| `DASH_SENTINEL_COOLDOWN_MIN` | `360` | délai avant de ré-analyser la même cause |
| `DASH_SENTINEL_MAX_PER_HOUR` | `8` | plafond d'analyses par heure |
| `DASH_SENTINEL_MAX_DEEP_PER_HOUR` | `3` | sous-plafond des analyses approfondies (au-delà : dégradées en rapides) |
| `DASH_SENTINEL_MIN_GAP_S` | `90` | espacement minimal entre deux analyses |
| `DASH_SENTINEL_DEEP` | **inactif** | `true` pour autoriser l'analyse approfondie (Claude lit le code) — voir l'avertissement ci-dessous |

⚠️ **Pourquoi l'analyse approfondie automatique est désactivée par défaut.** Mesuré
le 2026-08-16 : avec `--tools Read,Grep,Glob` et le dépôt comme dossier de travail,
un chemin absolu hors dépôt est bien refusé, mais un chemin **relatif** remontant
(`../../AppData/…`) est lu sans difficulté — le dossier de travail n'est pas une
frontière de système de fichiers, et les règles de permission par `--settings` n'ont
pas permis de la rétablir. Un texte hostile arrivé dans le prompt pourrait donc faire
lire un fichier quelconque du poste. La sentinelle tournant sans personne devant
l'écran, elle s'en abstient. Le bouton « Analyse approfondie », lui, reste disponible :
c'est un humain qui le déclenche et qui lit le résultat.

## 4. Déroulé d'un test à deux appareils

1. `npm start` le dashboard, se connecter.
2. **Sessions de test → Nouvelle session** (« Benjamin + testeur 2 »), *Démarrer*.
3. Sur chaque appareil, ouvrir Passio avec `?telemetry=1`.
4. **Appareils** : les deux apparaissent, comparables côte à côte.
5. **Activité en direct** : les actions défilent, filtrables par utilisateur/appareil.
6. Une erreur → **Bugs & erreurs** : fiche, stack, extrait de code, boutons de copie.
7. **Claude Code** : construire le contexte, copier le prompt (ou analyser en direct).
8. **Tests** : lancer une suite autorisée, sortie en direct.
9. *Terminer* la session → **Rapports** : synthèse exportable (JSON/CSV).

## 5. Rôles

`admin` (tout) · `developer` (tests, git lecture, claude, flags, db) ·
`tester` (sessions, alertes) · `observer` (lecture seule).
Utilisateurs additionnels via `DASH_EXTRA_USERS=user:pass:role,...`.

## 6. Commandes

```bash
npm start     # serveur (prod locale)
npm run dev   # serveur avec rechargement (node --watch)
npm test      # tests backend (node --test)
```

## 7. Sécurité (résumé)

Voir [`docs/SECURITE.md`](docs/SECURITE.md). En bref : clé service_role côté
serveur uniquement, sessions signées HMAC httpOnly, limitation des tentatives,
matrice de permissions, **mutations de code désactivées en production**, patchs
appliqués seulement sur une branche dédiée après confirmation, jamais de push,
journal d'audit complet, masquage PII côté client et serveur.

## 8. Intégration Claude Code

Voir [`docs/INTEGRATION_CLAUDE_CODE.md`](docs/INTEGRATION_CLAUDE_CODE.md).

## 9. Fichiers

- **Instrumentation Passio** : `js/telemetry.js`, `migrations/migration_telemetry.sql`,
  quelques marqueurs dans `js/app-0*.js` (voir la liste dans le rapport de session).
- **Backend** : `dashboard/server/*.js`
- **Frontend** : `dashboard/public/**`

## 10. Limites connues

- Pas de relecture visuelle (rrweb) : la relecture est **événementielle** (parcours
  d'écrans/actions), volontairement sans capture DOM pour rester léger et privé.
- La perf CPU/mémoire de l'appareil n'est pas remontée (API navigateur limitées) ;
  on mesure latence, erreurs, timings de navigation.
- L'analyse Claude en direct nécessite `ANTHROPIC_API_KEY` ; sinon mode « copier le prompt ».
- Le store temps réel est en mémoire (borné) ; l'historique long vit dans Supabase.

### ⚠️ « Fraîcheur » ne mesure QUE le trafic réel (corrigé le 2026-08-30)

`server/ingest.js` tient **deux** marques d'eau, et les confondre a produit un
défaut observé en production : l'en-tête annonçait « dernier signal il y a
5 min » alors que le dernier signal réel datait d'une heure et cinq minutes.

| Variable | Question à laquelle elle répond | Le canari la fait-il avancer ? |
|---|---|---|
| `lastSeenIso` | « à partir d'où reprendre le polling ? » | **Oui, obligatoirement** — sinon chaque cycle relit les mêmes lignes |
| `lastRealSeenIso` | « quand un vrai signal est-il arrivé ? » | **Non, jamais** — c'est elle que l'écran affiche |

Le canari synthétique part toutes les 15 min (`DASH_CANARY_EVERY_MIN`) et prouve
la chaîne publique → base → dashboard ; il ne prouve **aucun** trafic utilisateur.
L'afficher sous « dernier signal » faisait passer un pilotage sans trafic pour un
pilotage vivant — exactement la panne que cet écran est censé rendre visible.
Verrou : les deux tests « marque d'eau » de `test/ingest.test.js`, éprouvés par
mutation (rendre la fraîcheur sensible au canari, ou la figer, rougit chacun le
sien).

## 11. Améliorations recommandées

- Cron `purge_telemetry(30)` (pg_cron) pour la rétention.
- Notifications d'alerte e-mail/webhook (points de sortie déjà prévus dans `alerts.js`).
- Export PDF des rapports (structure déjà en JSON/CSV).
- URLs de médias signées côté Passio (durcissement au-delà du périmètre dashboard).
