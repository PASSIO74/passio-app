# PASSIO — Guide pour Claude Code

## ⛔ RÈGLE ABSOLUE — ZÉRO DEMANDE D'AUTORISATION

Benjamin travaille en autonomie totale (`bypassPermissions` posé aux 3 niveaux : global, projet, local — la config n'est JAMAIS la cause d'un blocage). **Ne jamais lui demander d'autorisation, de confirmation ni d'arbitrage, pour quoi que ce soit.** Concrètement, INTERDIT :

- « veux-tu que je… ? », « je continue ? », « je pousse en prod ? », « tu préfères A ou B ? »
- l'outil `AskUserQuestion`, un plan mis en attente de validation, une liste d'options laissée ouverte
- s'arrêter en milieu de tâche pour faire valider une étape

À la place : choisir la meilleure option, l'appliquer, aller au bout (coder → tester → committer → pousser), puis rapporter le résultat fait. Un ordre = une exécution complète, sans interruption. Rappelé fermement le 2026-07-21 et le 2026-07-22.

---

## 🤝 Modèle multi-IA et contrat de déclenchement

PASSIO est mené par plusieurs IA sous gouvernance unique. Les règles de
collaboration vivent dans **`AGENTS.md`** (workflow git non négociable, rôles,
handoff de PR), le routage dans `.passio/orchestrator.json`. Ce fichier-ci est la
référence *technique*, `AGENTS.md` la référence *collaborative* : lire les deux
quand la tâche vient d'une issue ou d'une PR.

**ChatGPT ne peut pas parler directement à Claude Code.** Le seul transport est
GitHub (`.github/workflows/claude-code.yml`, authentifié par l'abonnement via
`CLAUDE_CODE_OAUTH_TOKEN`). Un ordre ne déclenche rien s'il ne porte pas un
marqueur, et l'issue doit appartenir à PASSIO74 :

| Voie | Condition exacte |
|---|---|
| **label `claude`** (nominal) | événement `labeled` sur une issue de PASSIO74 |
| `@claude` (secours) | dans le titre/corps d'une issue, ou un commentaire de PASSIO74 sur une issue de PASSIO74 |

⚠️ **Un run `skipped` à la création d'une issue est NORMAL.** La condition teste
`github.event.label.name`, champ qui n'existe **que** sur l'événement `labeled` :
l'ouverture de l'issue produit toujours un run `skipped`, puis la pose du label
en produit un second qui, lui, exécute. Conséquences pratiques :

- créer une issue avec le label **déjà posé** ne déclenche rien — il faut le
  poser (ou le retirer/reposer) **après** création ;
- dans Actions, un `skipped` ne distingue pas « jamais labellisé » de « labellisé
  et exécuté » : c'est le run **suivant** qui fait foi.

C'est exactement ce qui a coûté six ordres perdus les 19–21 août (issues #68,
#69, #73 — dont le chantier PERF-IOS) : runs 9 à 14 sortis en `skipped`,
indiscernables d'un succès, sans qu'aucune alerte ne soit levée. **Une issue
créée n'est jamais la preuve qu'une tâche a tourné** : la preuve est un run vert
dans Actions → Claude Code, et une PR. Détail : `docs/PHONE_ONLY_AI_WORKFLOW.md`.

### État du canal, et le piège de `AUTH_REELLE` (2026-08-24)

Le canal GitHub → Claude Code est **nominal**, prouvé le 2026-08-24 par un
canari : issue #140 → run 141 → branche → PR #141. C'est cette chaîne complète,
et elle seule, qui prouve le transport — pas la présence du secret.

⚠️ **`AUTH_REELLE: none` n'est PAS une panne : c'est la preuve attendue.**
Avec le CLI 2.1.x, un jeton d'abonnement OAuth apparaît comme
`apiKeySource="none"` dans l'événement `system/init` — aucune clé API n'alimente
la requête, ce qui est exactement le but. Le workflow en fait la **seule** valeur
admise (`.github/workflows/claude-code.yml`, étape « Prouver le modèle et
l'authentification réellement exécutés ») :

```js
if (keySource !== 'none') {
  console.error(`… la preuve OAuth attendue est apiKeySource=none. Publication refusée.`);
  process.exit(1);
}
```

Une source vide sort `ABSENTE`, pas `none`. Donc : `none` = ✅ abonnement utilisé ;
toute autre valeur = ❌ publication refusée.

**Transport/authentification et capacité sont deux états distincts.** Un run peut
porter la bonne preuve OAuth et être néanmoins refusé parce que le quota ou les
crédits de l'abonnement sont épuisés. `AUTH_REELLE: none` ne prouve donc ni les
crédits disponibles, ni leur date de retour. Dans ce cas, ne pas régénérer le
jeton : attendre le rétablissement annoncé et continuer avec Codex sur les lots
indépendants de Claude Code.

Ce piège a coûté cher le 2026-08-24 : une session a lu `none` dans le commentaire
de retour, l'a présenté comme la cause des échecs des runs 138 et 139, et Benjamin
a régénéré un `CLAUDE_CODE_OAUTH_TOKEN` qui n'avait probablement rien. **La cause
réelle de ces deux échecs reste inconnue** — ne pas la réinventer. Avant de
conclure à une panne d'authentification, lire le log du run : le message
« Source d'auth non autorisée » est le seul symptôme d'un vrai problème d'auth.

Deux marches distinctes, à ne pas confondre :

| Marche du run | Ce qu'elle prouve | Ce qu'elle ne prouve PAS |
|---|---|---|
| `claude-auth-guard` (`steps.auth`) | le secret existe, fait ≥ 40 caractères, n'est pas une clé API facturée (préfixe `sk-ant-api` → refus), et aucune `ANTHROPIC_API_KEY` ne traîne dans le job | que le jeton est encore **valide** côté Anthropic — un préfixe simplement inattendu passe, le CLI tranchera |
| `steps.modele` | la source d'auth **observée** et le modèle réellement exécuté | — |

**Repli quand le canal est réellement mort** (run rouge sur l'étape d'auth, ou
aucun run) : ne pas relancer le label `claude` en boucle, il ne produit que des
commentaires rouges. L'ordre s'écrit dans une issue ou une PR, Benjamin le colle
dans une session Claude Code interactive, qui exécute. Lent mais fiable : c'est
ce chemin qui a porté les lots des 2026-08-23/24. Le rétablissement demande un
jeton neuf (`claude setup-token`) posé dans les secrets du dépôt — seul Benjamin
peut le faire.

**Une branche sensible = un seul écrivain.** Le 2026-08-24, six commits d'une
seconde session sont arrivés sur `claude/consolidate-pr-sessions-t05y6v` pendant
qu'une première y travaillait ; rien n'a été perdu — les deux versions ont été
confrontées sur un PostgreSQL réel avant d'en garder une — mais à deux écrivains
le recouvrement n'est qu'une question de temps. Désigner l'écrivain unique avant
d'ouvrir le chantier ; les autres sessions lisent et vérifient. Voir le skill
`/passio-multi-session`.

Répartition : **ChatGPT** = direction produit, spécification, arbitrage ·
**Claude Code** = implémentation, backend/Supabase/RLS, sécurité, tests, refacto ·
**Codex** = revue indépendante · **Lovable / Base44** = laboratoires
d'exploration, jamais source de vérité, jamais connectés à la prod. GitHub est la
seule source de vérité — pas une conversation IA, pas un prototype, pas un export.

---

Réseau social des passions. PWA vanilla JS (pas de framework, pas de bundler) + Supabase. Beta privée protégée par code d'accès.

## Architecture

- `index.html` : markup complet de l'app (landing, onboarding, 8 écrans, modals). En dev les 15 fichiers JS sont chargés séparément ; en prod `scripts/build.js` ré-assemble un monolithe dans `dist/`.
- `js/app-01` à `app-09` : logique applicative (ordre de chargement = dépendances par hoisting, NE PAS réordonner). 01=diag/seed, 02=state/utils/goTo, 03=posts (partage, likes — les carnets en ont été retirés par ADR-011), 04=commentaires/conversations rendering, 05=config/profils/reels, 06=profil principal/studio/partage, 07=IA/explore/IRL, 08=modals/tour/boot()/Supabase client, 09=PWA/emoji/pièces jointes/wrappers messagerie.
- `js/access-gate.js` : verrouillage par code (2125) — chargé en PREMIER dans <head>. Voir `docs/SECURITE_CODE_ACCES.md` pour changer le code.
- `styles.css` : 6300 lignes, thème violet (#7c3aed), variables CSS (--bg-card, --border, --muted, --accent…).
- Backend : Supabase (URL/clé anon dans app-08). Tables : profiles, posts, post_likes, post_comments, stories, events, event_attendees, conversations, conv_members, conv_messages, notifications, follows, client_errors. RLS par propriétaire (`auth.uid()::text`). Migrations dans `migrations/`.
- État local : `localStorage["passio_mvp_state_v1"]` (constante `STATE_KEY` dans app-02 — PAS `passio_state`). Contient profils, posts perso, notifs… `MY_UID` = id Supabase auth ; jeton du gate = `sessionStorage["passio_gate_v1"]`. **Les conversations** (le gros volume, vocaux base64 inclus) sont dans `localStorage["passio_conversations_v1"]` ET, depuis le 2026-06-15, dans **IndexedDB** (store durable sans limite ~5 Mo, `js/idb-store.js` : `idbConvLoad`/`idbConvSave`) : write-through à chaque `saveConversations`, hydratation+fusion sans perte au boot via `hydrateConvsFromIDB()` (tête de `boot()`). localStorage reste un cache sync toléré à échouer sur quota.

## Commandes

- Serveur local : `npm run serve` → http://localhost:8080 (code d'accès : 2125 ; http-server, plus besoin de Python)
- Tests : `npx playwright install chromium` puis `npm test` (smoke + access-gate ; le helper `tests/e2e/gate-helper.js` déverrouille le gate pour les tests)
- Build prod : `node scripts/build.js dist/index.html`
- Déploiement : `git push origin main` → GitHub Actions teste, build, minifie, déploie sur Netlify (https://passio-app.netlify.app)

## Conventions

- Vanilla JS, pas de modules ES (scripts classiques, fonctions globales).
- `$()` = querySelector (défini app-02), `$$()` = querySelectorAll. Toujours garder les guards `if (!el) return;`.
- HTML généré par template literals + `escapeHtml()` pour tout contenu utilisateur (XSS). **3 helpers d'échappement (app-02), choisir selon le CONTEXTE** : `escapeHtml(x)` = texte HTML ; `escapeJsArg(x)` = argument de chaîne JS simple-quotée DANS un attribut onclick (le HTML décode `&#39;` AVANT le parse JS → un pseudo avec apostrophe cassait le bouton avec escapeHtml seul) ; `safeUrlAttr(x)` = attribut src/href d'une URL fournie par un autre utilisateur (bloque `javascript:` & sortie d'attribut ; n'accepte que http(s)/data:image|audio|video/blob). ⚠️ Les payloads de `comment_interactions`/`event_reactions`/messages média sont librement insérables par tout compte authentifié → TOUJOURS échapper à l'affichage (XSS stockés corrigés le 2026-07-02).
- **Timestamps Supabase : TOUJOURS `supaTs(s)` (app-02), JAMAIS `new Date(x + "Z")`.** La prod mélange des colonnes `timestamp` (sans fuseau : posts, conv_messages, notifications, stories, events, profiles) et `timestamptz` (avec offset `+00:00` : comment_interactions, event_comments/reactions/attendees, tout cdv_*, blocks, reports…) — l'ancien pattern `+ "Z"` donnait NaN (« Invalid Date ») sur les timestamptz. `supaTs` gère les deux + le format realtime.
- Navigation : `goTo('feed'|'profiles'|'studio'|'explore'|'irl'|'messages')` — écrans = `#screen-<nom>`. `goTo('wallet')` et `goTo('shop')` sont REDIRIGÉS vers `profiles` (ADR-009), `goTo('cdv')` vers `feed` (ADR-011, retrait du Carnet de voyage) : un ancien deep link ne doit jamais laisser l'app sans écran actif.
- Toasts via `toast()`, jamais `alert()`.
- Les onclick inline doivent référencer des fonctions globales EXISTANTES (l'audit du 2026-06-10 a trouvé 7 fonctions fantômes — vérifier avant d'ajouter un handler).


## ⚡ Invariants critiques (référence rapide — détail dans docs/PIEGES_CONNUS.md)

Ces règles transverses valent pour TOUTE modification. Le subagent `audit-passio` les vérifie.

- **Recherche de post** : toujours `findPostAnywhere(id)` (seed + userPosts + supabasePosts). Jamais `seed.posts.find || userPosts.find` (oublie les vrais posts réseau).
- **Timestamps** : toujours `supaTs(s)`, jamais `new Date(x+"Z")` (prod mélange timestamp/timestamptz).
- **Échappement (3 helpers selon le CONTEXTE)** : `escapeHtml` (texte HTML), `escapeJsArg` (arg JS dans onclick), `safeUrlAttr` (URL d’un autre utilisateur). Tout payload `comment_interactions`/`event_reactions`/média = échapper à l’affichage.
- **Collisions de globals** : 17 scripts partagent `window` ; une `function X` top-level redéclarée est écrasée en silence. `npm run audit:globals` (CI) est le filet. ⚠️ Ne pas nommer un Set d’état comme une fonction (`window._splStatusSel=new Set()` écrase la fonction).
- **Catch large** : un `catch(e){return [];}` masque les ReferenceError (bug diagLog = fil vide 6 j). Ne pas envelopper un chemin critique sans log.
- **onclick inline** : doit référencer une fonction globale EXISTANTE (`npm run audit:handlers`).
- **Supabase** : jamais de requête dans `onAuthStateChange` (deadlock → `setTimeout(...,0)`) ; jamais le global `supabase` (SDK) au top-level d’un app-*.js (chargement paresseux → `supa`/`ensureSupabase()`) ; un UPDATE/DELETE qui touche 0 ligne = RLS manquante ; jamais de base64 en DB (→ Storage) ; embed `profiles(...)` = 400 sans FK réelle.
- **Écritures qui échouent en silence** : le SDK ne LÈVE PAS sur un refus RLS → **toujours lire `{ error }`** (sinon l’action reste « réussie » à l’écran et disparaît au rechargement). Une écriture d’état (like, RSVP, follow…) envoie l’**INTENTION locale** ; ne jamais la re-déduire d’une lecture préalable (elle inverse l’action dès que local et base divergent — et le hook fetch prend alors cette LECTURE pour la confirmation d’écriture). Échec réel = annuler l’affichage optimiste.
- **Guards de rendu** : écrire dans `#feedList`/`#storiesRowFeed`/`#profileStrip` sans invalider `_feedDomSig`/`_lastHtml` fait sauter le prochain render.
- **Build** : exactement 9 fichiers app-*.js entre les marqueurs BUILD:APP. Prod = app.js + styles.css externalisés (hash de contenu).
- **openModal n’empile pas** : ouvrir une modale depuis une autre la REMPLACE (mémoriser d’où l’on vient) ; `openModal` injecte déjà un `×`.

## Hooks & permissions (`.claude/settings.json`)

Trois hooks, chacun pour un problème distinct :

| Hook | Script | Rôle |
|---|---|---|
| `PreToolUse` (Bash\|PowerShell) | `.claude/scripts/garde-commandes.js` | seul mécanisme capable de voir le **milieu** d'une commande (`… && rm -rf /`, `DELETE` sans `WHERE`, `DROP TABLE`, `git add .env`). Une règle de permission ne matche qu'un préfixe. |
| `PostToolUse` (Edit\|Write) | `.claude/stage-edited-file.js` | `git add` du seul fichier modifié. |
| `SessionStart` | `.claude/scripts/compact-permissions.js --quiet` | empêche l'allowlist de regonfler (voir ci-dessous). |

**Architecture des permissions : `allow` large + garde-fou étroit.** Des `allow`
étroits interrompent sur l'ordinaire (`npm test`) *et* ratent quand même le
dangereux caché en milieu de ligne. Le couple allow-large + `garde-commandes.js`
donne zéro friction sur l'ordinaire et attrape le destructif réel.

⚠️ **Piège mesuré le 2026-08-15** : `settings.local.json` avait atteint 654 règles /
71 Ko, dont **542 commandes littérales complètes** — inutiles, car sur `Bash`/
`PowerShell` l'argument est une commande *libre* : un littéral ne re-matche jamais
la commande suivante, l'allowlist gonflait sans jamais réduire les interruptions
(9 entrées portaient un JWT en clair). Distinction à garder en tête :
`Skill(nom)`, `Read(chemin)`, `mcp__…` ont un argument **identifiant stable** → un
littéral y est parfaitement réutilisable. `npm run permissions:compact` applique
la règle (70 → 6 Ko) et tourne au `SessionStart`.

**Capitalisation** : quand une procédure se révèle réutilisable, ou quand une
instruction doit être répétée, la transformer en outil durable plutôt qu'en
rappel — skill, script, hook ou règle selon la portée : `/skill-optimizer`
(`npm run skills:lint` pour l'état factuel de la bibliothèque).

---

Le hook `PostToolUse` (Edit|Write) exécute `.claude/stage-edited-file.js`, qui fait **uniquement** `git add <le fichier qui vient d'être modifié>`. Il remplace l'ancien `git add -A && git commit -m "auto: …" && git push origin main`, dangereux à deux titres : ① `git add -A` indexait TOUT le dépôt — quand deux sessions Claude travaillent en parallèle sur ce dossier, chacune ramassait les fichiers en cours de l'autre (le 2026-07-21, trois commits ont mélangé des travaux CDV et IRL distincts) ; ② le `push origin main` **déployait en production à chaque frappe**, seul le garde `commit-msg` (qui refuse les messages « auto: ») l'empêchant — une protection fragile et non intentionnelle. Le script ignore silencieusement tout fichier hors dépôt (scratchpad) et tout payload illisible. **Committer et pousser restent des gestes explicites.**

⚠️ **Une session démarrée AVANT ce correctif tourne encore avec l'ancienne configuration** (les réglages sont lus au démarrage) : elle continuera à faire `git add -A` jusqu'à sa relance. Le filet de dernier recours reste `.git/hooks/commit-msg` (**local, non versionné**), qui refuse tout message de commit commençant par « auto: » — il ne testait que la chaîne exacte « auto: mise à jour app », il couvre désormais toutes les variantes. Conséquence pratique tant qu'une vieille session tourne : **committer son propre travail au fil de l'eau** plutôt que de laisser des fichiers modifiés en attente, sinon ils partent dans le commit de l'autre session.

### Sessions concurrentes (skill `/passio-multi-session`, 2026-08-16)

L'index git n'est que le premier des quatre biens partagés entre deux sessions Claude Code lancées sur ce dossier. Les trois autres : le **port 8080** — `playwright.config.js` a `reuseExistingServer: true`, donc une suite de tests réutilise le serveur de l'AUTRE session et mesure ses octets, vert ou rouge sur le mauvais code sans un mot ; la **prod Supabase** — `global-teardown` purge *tous* les comptes `%@passio-e2e.test`, la fin de suite de l'un supprimant les comptes d'une suite encore en cours ailleurs ; et les **documents partagés** (`.passio/*`, `MEMORY.md`, `dashboard/data/`) où le dernier écrivain gagne. `npm run sessions` (`.claude/scripts/session-registre.js`, registre local hors git) déclare un périmètre de fichiers, montre les autres sessions actives et les collisions présentes, et fournit `commiter` = `git commit -- <périmètre>` : le travail indexé par autrui reste indexé mais **n'entre pas dans le commit**. Interdits tant que deux sessions partagent un worktree : `git commit -a`, `git add -A/.`, `git stash`, `git reset --hard`, `git checkout -- .`. Isolation forte pour un même fichier = **worktree** (`EnterWorktree`), qui isole l'arbre, l'index et la branche — mais ni les ports, ni la prod.

## Centre de pilotage (télémétrie + dashboard `dashboard/`, 2026-08-05)

App INDÉPENDANTE de supervision/test temps réel, dans `dashboard/` (Node/Express + SPA vanilla, sans bundler, thème violet). Elle NE fait PAS partie du build/déploiement Passio (Netlify ignore ce dossier). Pipeline : `js/telemetry.js` (chargé dans `<head>` après platform.js) → table Supabase **`telemetry_events`** (migration `migration_telemetry.sql`, **appliquée en prod le 2026-08-05**, dans la publication realtime, RLS insert-own + AUCUN select) → backend dashboard (clé **service_role** dans `dashboard/.env`, RLS bypassée, lecture SEULE côté serveur) → flux SSE → dashboard. **Activation** : depuis le 2026-08-05, ACTIVE par défaut en prod (suivi continu de la beta) avec **opt-out** — `?telemetry=0` (ou `PassioTelemetry.setEnabled(false)`) désactive durablement (`localStorage.passio_telemetry="0"`), `?telemetry=1` force la capture complète, localhost toujours actif. Curseur d'échantillonnage stable par appareil `window.PASSIO_TELEMETRY_SAMPLE` (1 = tous) ; `window.PASSIO_TELEMETRY_DEFAULT_ON=false` = repli opt-in strict. Données minimisées (aucun PII). `js/telemetry.js` masque le PII — **tout nouveau champ envoyé doit passer par ce filtre**. ⚠️ Rectifié le 2026-08-15 : `meta` est filtré par une liste **NOIRE** de noms de clés (`DENY_KEY`), pas par une liste blanche comme affirmé ici jusqu'alors. C'est délibéré (une liste blanche ferait disparaître en silence toute clé nouvelle), mais ça déplace la garantie : la sécurité vient de ce que `scrubMeta` ACCEPTE — uniquement des primitives (objets et tableaux jetés), passées par `redactString`, tronquées à 160 caractères, 30 clés au plus. Vérifié en prod sur 20 205 événements : 22 clés distinctes, toutes techniques, zéro e-mail/JWT/base64. ⚠️ `correlation_id` est une colonne À PART, hors de `meta` : elle n'était donc couverte par aucun filtre alors que `captureLinkOpen` y recopie le `?plk=` de l'URL — sanitisée depuis, et le marqueur non conforme est rejeté à l'entrée. Instrumentation automatique : navigation (wrap de `goTo`), clics (délégation), fetch (timing API endpoint sans query), erreurs. Marqueurs sémantiques ajoutés (guardés `window.tel && tel.action(...)`) dans `supaPublishPostWithRetry`, `likePost`, `submitComment`, `sendMessageToSupabase`, `toggleJoinEvent`. ⚠️ `telemetry.js` est un IIFE `"use strict"` : il n'expose que `window.PassioTelemetry`/`window.tel` (aucun global top-level → `audit:globals` reste vert). Lancer le dashboard : `cd dashboard && npm install && cp .env.example .env` (renseigner `SUPABASE_SERVICE_ROLE_KEY`) `&& npm start` → http://localhost:4610. Tests backend : `cd dashboard && npm test` (77 verts). Mutations git du dashboard : désactivées en prod, jamais de push, branche dédiée + confirmation, tout audité. Doc : `dashboard/README.md`, `dashboard/docs/SECURITE.md`, `dashboard/docs/INTEGRATION_CLAUDE_CODE.md`.

### Traçage bout-en-bout & intégrité (2026-08-12/14)

**Traçage** (`dashboard/server/traces.js`, onglet « Traçage des actions ») : suit une action du clic au **résultat métier réel** via un `correlation_id`. API client `tel.flowStart(action, meta)` → cid, `tel.step(cid, key, status)`, `tel.flowEnd(cid, status)` ; le hook fetch tague **automatiquement** l'étape réseau du flow actif (fenêtre 4 s). Chaque action a un **contrat de résultat** (`CONTRACTS`) : soit « write = confirmation » (like/comment/cint/RSVP — l'écriture REST EST le résultat), soit une confirmation **explicite** (message, publication — plusieurs requêtes en jeu, l'auto-tag serait trompeur → step `saved` émis par le code). Verdicts : succès / partiel / échec / **clic mort** / non confirmé / en cours / lent + doublons. ⚠️ La livraison cross-device est **informative** et n'altère JAMAIS le verdict (sinon tout test mono-appareil produirait de faux « partiels »). Pour instrumenter une action : la wrapper avec `flowStart`, elle apparaît seule (contrat `_default` sinon). Couverture + dette : `/api/coverage`.

**Intégrité** (`dashboard/server/reconcile.js`, onglet « Intégrité des données », capacité `db`) : 9 règles d'anti-jointure/invariants (orphelins, base64 en base, bobines sans média…) en **lecture seule**, ancrées sur le schéma RÉEL de prod. Deux filtres indispensables, sans lesquels le tableau de bord crie au loup : ① les références au **contenu de démo** (`p1`, `u_lea`, `e1`, `reel_seed_*`, `me` — local, jamais en base) sont isolées, pas comptées en anomalie (133 fausses → 12 réelles) ; ② une anomalie **datée sans récidive sur 7 j** est rétrogradée en « résidu » (défaut déjà corrigé, seul le nettoyage reste utile). Une règle non vérifiable est remontée « non vérifiée », jamais « conforme ». Cache serveur 30 s (`?force=1` pour outrepasser). ⚠️ L'intégrité expose des identifiants de base : **toute route qui l'embarque doit vérifier la capacité `db`** (`/api/diagnose` a fuité une fois par cette bande).

**Diagnostic global** : bouton « Diagnostiquer toute la plateforme » → `/api/diagnose` assemble santé, chaînes cassées dédupliquées, livraison, intégrité, bugs et dette en un prompt Claude Code actionnable.

**Sentinelle — débogage automatique permanent** (`dashboard/server/sentinel.js`, onglet « Sentinelle », 2026-08-16) : le pilotage se débogue seul. Elle s'abonne au flux d'alertes (`onAlert` dans `alerts.js`), retient les niveaux `critical`/`high`, construit le contexte (trace bout-en-bout, bug groupé, ou signal brut), appelle Claude Code et publie le diagnostic en SSE (`sentinel`) → toast + cloche + page. Zéro geste humain. **Elle ne corrige RIEN** : analyse en lecture seule, correctif proposé jamais appliqué. Quatre garde-fous non négociables : ① **sandbox fail-closed** (`claudecli.js`, verrouillée par test via `buildCliArgs`) — le CLI enfant n'a qu'une **liste blanche** `--tools` (`Read,Grep,Glob` en approfondi, un outil inerte en rapide) + `--safe-mode` + `--strict-mcp-config` + env filtré des secrets. ⚠️ L'ancienne **liste noire** `--disallowedTools` laissait passer `PowerShell` (elle interdisait « Bash ») **et tout le MCP Supabase, `execute_sql` compris**, avec `defaultMode: bypassPermissions` — mesuré en interrogeant le vrai CLI le 2026-08-16. Ne JAMAIS revenir à une liste noire ; et `--tools ""` ouvre la liste COMPLÈTE au lieu de la vider. ⚠️ **Le `cwd` n'est PAS une frontière de fichiers** : avec `Read,Grep,Glob` et cwd=dépôt, un chemin absolu hors dépôt est refusé mais `../../AppData/…` est lu (mesuré ; `--settings` n'a pas permis de confiner) → **l'analyse approfondie automatique est DÉSACTIVÉE par défaut** (`DASH_SENTINEL_DEEP=true` pour l'activer) ; le bouton humain « Analyse approfondie » reste inchangé ; ② **injection** — `sanitizeObserved` + bloc « DONNÉES OBSERVÉES » (hygiène de prompt, PAS une frontière), et le mode approfondi est réservé aux contextes **calculés côté serveur** (trace/bug), jamais au texte libre client ; ③ **budget** — dédup par cause **+ révision du dépôt** (cooldown 6 h persisté), 1 analyse à la fois, 8/h dont 3 approfondies, espacement 90 s, arriéré de démarrage jamais rejoué, `taskkill /T` au dépassement de délai ; ④ **diffusion** — `/api/sentinel*` exige la capacité `claude` (un diagnostic contient du code du dépôt). ⚠️ **Angle mort structurel** : elle ne voit que ce qui déclenche une alerte — « aucun diagnostic » ne veut jamais dire « tout va bien » (panne silencieuse, télémétrie interrompue).

**Réparation automatique** (`dashboard/server/repair.js`, 2026-08-16) : sur verdict « défaut réel » seulement, elle écrit le correctif, l'applique dans un **worktree git isolé** (`git worktree add` + jonction `node_modules`) et le vérifie (syntaxe → `audit:globals`/`handlers` → e2e). Vert = branche `sentinelle/<date>-<id>` committée qui attend un clic « Fusionner » ; rouge = branche **supprimée** + motif. ⚠️ Invariants : ① **jamais le dossier de travail** — un checkout dans le dépôt principal changerait de branche sous les pieds de Benjamin (incident du 2026-07-21) ; refus si des fichiers **suivis** sont modifiés (`git status --untracked-files=no`, les non suivis ne bloquent pas) ; ② **le serveur fournit les fichiers au modèle**, jamais l'inverse (le CLI reste sans outils) ; ③ liste **blanche** de chemins `js/*.js`, `styles.css`, `index.html`, `sw.js` — **`tests/` interdit** (sinon le correctif se rend vert en réécrivant le test), CI/migrations/scripts/dashboard aussi ; ni création/suppression/renommage ; 120 lignes et 3 fichiers max ; ④ « PAS DE CORRECTIF SÛR » est une réponse valide. Jamais de push : `mergeRepair` exige `confirm:true` + capacité `git_mutate`. ⚠️ Piège Windows mesuré : avec `shell:true`, un exécutable dont le chemin contient une espace (`C:\Program Files\nodejs\node.exe`) est coupé en deux → guillemeter. Tests : `dashboard/test/repair.test.js`.

**Présence permanente** : `dashboard/supervise.mjs` relance le serveur s'il meurt (recul 2/5/15/30/60 s, journal borné `data/supervise.log`, PID dans `data/supervise.pid`), `Sentinelle-Demarrage.vbs` le lance sans fenêtre, `Installer-Demarrage-Auto.cmd` pose un raccourci dans le dossier Démarrage de la session (aucun droit admin ; `/retirer` pour défaire), `Arreter-Pilotage.cmd` arrête tout. ⚠️ Ces `.cmd` sont en **ASCII pur** : un `.cmd` accentué est mal découpé par l'interpréteur Windows, qui exécute alors des morceaux de commentaire. Chaque diagnostic porte un **verdict** : défaut réel / comportement attendu / données insuffisantes. Réglages `DASH_SENTINEL_*` (voir `dashboard/README.md` §3 bis). Tests : `dashboard/test/sentinel.test.js` (17, dont un test d'intégration erreur réelle → diagnostic).


## 💸 ADR-009 appliqué — l'économie interne est RETIRÉE (2026-08-29)

Wallet, points, étoiles, rangs, Score Passion, leaderboard, quêtes, Passia,
boutique, Pass Passion et piste crypto ne sont plus dans le code. La décision est
`.passio/adr/ADR-009-core-feed-irl-sans-wallet.md`, la carte d'exécution
`docs/PASSIO_WALLET_PASSIA_REMOVAL_MAP_2026-08-20.md`. **Ne rien réintroduire sans
rouvrir l'ADR** : un paiement futur devra être un paiement DIRECT en monnaie
réelle, sans monnaie intermédiaire.

Ce qui a disparu, et où : `RANKS`/`REWARDS`/`LIKES_PER_PASSIA` + `seedQuests`
(app-01) · `grantReward`/`rewardToast`/`awardLikeReceived`/`rankOf`/`checkRankUp`
(app-02) · les documents « Passia expliqué » et leur visionneuse (app-03) ·
`PASSIA_PACKS`/`PASSIA_PASSES`/`setWalletTab` (app-04) · `tipReel` et le bouton
« Soutenir » du rail bobine (app-05) · le **paywall du 4ᵉ profil** (app-06) ·
`renderWallet` et le leaderboard (app-07) · quêtes et récompense de like realtime
(app-08) · `#screen-wallet` et ses 4 onglets (index.html) · 154 règles CSS.

⚠️ **Quatre pièges de ce chantier, à connaître avant d'y retoucher.**

① **`renderTopbar` écrivait dans `#topPassia` SANS garde.** Retirer le nœud sans
   retirer cette ligne fait lever la fonction — et elle est rappelée à chaque
   publication, commentaire et RSVP. Le lot UI-6 avait justement choisi de
   *masquer* la rangée pour cette raison ; le retrait, lui, oblige à traiter les
   deux ensemble. Même famille de risque pour tout nœud supprimé qu'un renderer
   adresse par id.

② **L'état legacy se propage dans les DEUX sens.** `user.score`, `user.passia`,
   `user.likesReceived`, `user.activePass`, `transactions`, `quests` et le
   `profile.paid` vivent encore dans les `localStorage` existants ET dans le blob
   `user_state`. `stripLegacyEconomy()` (app-02) est donc appelé aux **trois**
   frontières : `loadState`, `_applyUserState` (hydratation serveur) et
   `_syncableState` (envoi). Sans la 2ᵉ, un ancien appareil encore en service
   repousse les clés à chaque sync ; sans la 3ᵉ, ce client les remet lui-même en
   circulation. « Last write wins » joue dans les deux sens.

③ **Une classe morte suffit à tuer un sélecteur.** Le nettoyage CSS a d'abord
   exigé que TOUTES les classes d'un sélecteur soient mortes : `.quest-card.ready`,
   `.lb-rank.gold`, `.pack-card.popular` et `.wallet-tab.active` survivaient donc,
   parce que `ready`/`gold`/`popular`/`active` sont des modificateurs vivants
   ailleurs. Le bon critère est l'inverse : **une seule** classe jamais posée rend
   la règle inatteignable. Et `styles.css` est en **CRLF** — écrire en binaire.

④ **Le prix d'un événement était libellé en Passia alors qu'aucun paiement n'a
   jamais lieu** (le RSVP est gratuit, `price` n'est qu'un affichage). Il est
   redevenu un montant indicatif en €, ce que l'ADR autorise explicitement.
   ⚠️ **`fmtEventPrice(price)` (app-02) est la SEULE fonction autorisée à écrire
   un prix à l'écran** — carte de la liste, ligne « Prix » de la fiche, et tout
   ce qui viendra. La première version concaténait `+ " €"` à la main aux trois
   endroits, ce qui sortait `12.5 €` (point anglais), `NaN €` sur une valeur non
   numérique et `-5 €` sur un négatif. Le helper rend « Gratuit 🎉 » pour tout
   ce qui n'est pas un montant positif, « 12 € » sans décimale inutile et
   « 12,50 € » avec la virgule française. Le champ de saisie porte
   `step="0.01"` : il valait 1, et refusait donc *silencieusement* les centimes.
   Verrou : `tests/e2e/prix-euros.spec.js` (4 cas, dont les six cas limites du
   formateur).

⑤ **Retirer un gros bloc de `index.html` emporte facilement une balise
   STRUCTURELLE voisine.** La suppression de `#screen-wallet` a avalé le
   `</main>` qui la suivait : `.app-nav` s'est retrouvée DANS la zone
   scrollable, sa base à 9 735 px au lieu de 667 — cinq tests `cadrage` au
   rouge, sans la moindre erreur JS. Après tout retrait de balisage, compter
   les balises structurelles contre la version d'avant, ou passer le fichier à
   `html.parser` : le nombre d'erreurs doit être IDENTIQUE, pas nul (index.html
   en porte une, préexistante).

⑥ **Les libellés promettaient des points que le moteur ne donnait plus.**
   « ✨ Publier · +10 pts », « Publier · +3 pts », « + Rejoindre · +25 pts ·
   +5 💎 », « Crée le premier pour +30 pts »… étaient du texte en dur dans
   `index.html` et quatre app-*.js, invisibles d'une recherche sur `passia` ou
   `grantReward`. Le lot UI-6 n'en masquait qu'un seul, et son test de kill
   switch EXIGEAIT le retour de « +10 pts » — c'est ce test qui les a révélés.
   Chercher aussi `\+[0-9]+ ?pts` et `\+[0-9]+ ?💎` avant de conclure.

Verrou de non-régression : `tests/e2e/adr-009-retrait-economie.spec.js` (7 tests)
couvre la surface, le moteur, la création d'un 4ᵉ profil, et l'aller-retour de
synchronisation avec un ancien client.

## 📧 Confirmation d'e-mail ACTIVE depuis le 2026-08-30 (SMTP Brevo)

`signUp` ne rend **plus** de session : le compte existe, il est inutilisable tant que
l'adresse n'est pas confirmée. État complet de la configuration, procédure de
rétablissement et geste DNS restant : `docs/SETUP_SMTP_AUTH.md`.

⚠️ **Quatre conséquences, toutes déjà traitées — les connaître avant de toucher à l'auth.**

① **Deux chemins de `onbDoAuth` étaient morts, et muets.** Les branches « compte créé,
   va confirmer » et « e-mail déjà utilisé » (anti-énumération : Supabase rend un user
   aux `identities` VIDES, pas une erreur) écrivaient le message **puis** appelaient
   `switchAuthTab("signin")`, qui remet `#authMsg` à zéro. On créait son compte, l'écran
   basculait, rien ne s'affichait. **Règle : `switchAuthTab` d'abord, message ensuite** —
   et tout ce qu'on veut voir survivre à une bascule se pose APRÈS elle.

② **Sans renvoi, un lien perdu enferme le compte** (« déjà utilisé » à l'inscription,
   « confirme ton e-mail » à la connexion, aucune sortie). `onbResendConfirmation()`
   (`supa.auth.resend`, type `signup`) + `#authResendLink`, affiché seulement quand il
   sert. Le message de succès n'affirme JAMAIS que le compte existe.

③ **Les comptes de test ne se créent plus par `signUp`.** Passer par
   `tests/e2e/compte-e2e.js` : création **pré-confirmée** via `service_role`
   (`email_confirm: true`), aucun e-mail envoyé — donc ni quota Brevo consommé (300/j),
   ni rebond vers le domaine fictif `passio-e2e.test` qui abîmerait la réputation
   d'expéditeur. ⚠️ `authz-critical` est la **barrière RLS du déploiement** : elle en
   dépend, et sans le secret `SUPABASE_SERVICE_ROLE_KEY` elle échoue **en nommant la
   cause** plutôt que de se mettre en veille (un skip silencieux sur une barrière de
   sécurité serait pire qu'un rouge).

④ **Le domaine d'envoi n'est pas authentifié** (ni DKIM ni DMARC) : les confirmations
   peuvent partir en indésirables — inscription perdue, **sans aucune trace côté app**.
   Risque R11, remède DNS uniquement.

Verrou : `tests/e2e/confirmation-email.spec.js` (7, éprouvés par mutation — remettre
l'ordre d'origine ou retirer le renvoi fait rougir 6 des 7).

## 🗂️ Pièges connus — index (détail complet : docs/PIEGES_CONNUS.md)

59 fiches détaillées par domaine. **Lis la fiche concernée AVANT de modifier ce domaine.** Pour un audit de diff, lance le subagent `audit-passio`.

- **Cadrage / shell** : jamais 100dvh (var --app-vh mesurée en JS).
- **Feed** : classement par pertinence (rankFeedPosts), guards no-op.
- **Profil** : onglets multi-sélection, profil visité = même mécanique, compte privé (RLS).
- ~~**CDV** (carnets/lives/voyages)~~ : **fonctionnalité RETIRÉE le 2026-08-31 (ADR-011)**. Les ~15 fiches de `docs/PIEGES_CONNUS.md` ne décrivent plus aucun code vivant ; elles restent pour l'histoire, et parce que rien n'interdit que la fonctionnalité revienne.
- **IRL** (événements) : ~12 fiches — RSVP 3 états, liste d’attente, check-in QR, badges, preuve sociale, cycle de vie, ergonomie, suite de tests dédiée.
- **Bobines / stories / éditeur média** : publication vidéo fiabilisée, son, plein écran.
- **Appels / Live vidéo** : WebRTC P2P, push app fermée, anti-écho (mono).
- **Commentaires / réactions** : 1 réaction/personne, GIF=commentaire, fluidité (patch en place), UX IG/FB.
- **Cartes / géocodage** : MapLibre+OpenFreeMap, BAN+Photon (Nominatim retiré de la CSP).
- **Supabase / realtime** : SDK paresseux, embeds sans FK, notifications cross-compte, tests multi-comptes par e-mail.
- **Divers** : diagLog, monitoring client_errors, multi-profil centralisé, système d’étoiles, double-like.

## 🔍 Revue indépendante par un second modèle (2026-08-13)

Les **changements à risque** (auth/identité, RLS/migrations, affichage de contenu d'autrui, PII, paiement, modération) passent par une revue d'un modèle tiers **en lecture seule**. Répartition stricte : l'agent principal seul détient le dépôt, `main`, Supabase, les tests et le déploiement ; le relecteur n'a **aucun accès** — il reçoit un dossier, rien d'autre. Ses remarques sont examinées et vérifiées contre le code réel avant toute fusion, jamais appliquées telles quelles.

```bash
npm run revue -- --titre "Ce que fait le changement" --tests    # produire le dossier
node scripts/chatgpt.js etat                                    # quel canal ChatGPT est prêt
```

**Le canal ChatGPT passe par `scripts/chatgpt.js`** (skill `/chatgpt`), pas par le
pilotage du DOM de chatgpt.com. Transport retenu le 2026-08-16 : **`codex`**,
lancé avec le compte ChatGPT, sans clé API (l'API OpenAI est facturée au jeton :
implémentée en repli, à ne pas activer sans décision de Benjamin).

⚠️ **Rectifié le 2026-08-23 : `codex` n'est PAS gratuit.** Ce paragraphe affirmait
« compris dans l'abonnement déjà payé, aucun frais supplémentaire ». Mesuré à la
première vraie question, `codex login` réussi et `etat` au vert : le CLI répond
`ERROR: Your workspace is out of credits. Add credits to continue.` L'usage tire
sur un pool de crédits d'espace de travail, distinct de l'abonnement ChatGPT, et
ce pool était vide. **`codex login` n'était donc pas la dernière pièce manquante :
les crédits le sont.** Tant qu'ils ne sont pas rechargés, le canal direct est
inutilisable — quel que soit ce qu'affiche `etat`. Fils persistants dans `.passio/chatgpt/` (gitignoré), et une
**garde qui refuse l'envoi** dès qu'un JWT, une clé `sb_secret_`/`sk-`, une
affectation `SERVICE_ROLE_KEY=…` ou un mot de passe apparaît — le chemin navigateur,
lui, n'a aucune garde. ⚠️ Codex est un **agent doté d'outils de lecture**, pas un
onglet : il est lancé sur un **dossier de travail vide** (+ `--ignore-user-config`,
`--ignore-rules`, env filtré), jamais sur le dépôt. Mais **le bac ne confine rien** :
test canari du 2026-08-17 — avec `--sandbox read-only` dans un dossier vide, il a lu
un fichier hors du bac *et* `package.json` dans le dépôt, son premier refus venant
de lui-même et non d'une barrière. `read-only` n'interdit que l'écriture. La seule
garde qui tient : une invite auto-suffisante, jamais une invitation à explorer le
dépôt (`dashboard/.env` est à sa portée). Sans transport connecté, le
script s'arrête et renvoie vers le repli navigateur
(`.claude/skills/chatgpt/references/navigateur.md`, 8 pièges vécus) : **ne jamais
écrire que ChatGPT a été consulté si l'échange n'a pas eu lieu.**

`scripts/dossier-revue.js` produit dans `.passio/reviews/<date>-<slug>/` : spécification, `diff.patch`, **fichiers concernés en entier** (un relecteur qui ne voit que des hunks juge la forme, pas le fond), vérifications réellement exécutées avec leurs sorties brutes (un test rouge est rapporté rouge), migrations touchées, conventions du projet, et pièges connus détectés par motif. `DOSSIER-COMPLET.md` regroupe le tout en un fichier à coller dans un chat. Sans `--tests`, Playwright n'est PAS lancé et le dossier le dit — ça ne vaut alors pas validation de bout en bout.

Le script est en lecture seule sur le dépôt (il n'écrit que dans son dossier de sortie) et n'a aucun accès prod. Chaque piège a une **portée** : les invariants DOM/globals ne valent que pour `js/app-*.js`, pas pour les modules Node — sinon le rapport se noie dans les faux positifs. Détail : `.passio/reviews/README.md`.

⚠️ **`.claude/` est désormais versionné SÉLECTIVEMENT** (skills + subagents = savoir projet, ils doivent survivre à un changement de machine). `.claude/settings.local.json` reste exclu : il a longtemps contenu des JWT et une clé `sb_secret_…` en clair dans ses commandes autorisées (9 entrées, purgées le 2026-08-15 par `npm run permissions:compact`, qui refuse désormais de conserver toute règle porteuse de secret). Il reste hors versionnement : c'est un fichier de poste, pas du savoir projet.

## 🚪 PREMIÈRE VISITE — « l'application est elle-même le pitch » (drapeau `first_run_experience_v1`, COUPÉ par défaut)

`js/first-run.js` (IIFE `window.PassioFirstRun`) + bloc « PASSIO — PREMIÈRE VISITE » dans
`styles.css`, tests `tests/e2e/first-run.spec.js` (25) et helper
`tests/e2e/first-run-helper.js`. Activation : `?passio_preview=first-run-v1` ou
`localStorage.passio_first_run_experience_v1="1"` ; coupure prioritaire `"0"` ou
`window.PASSIO_FIRST_RUN_V1=false`. **Drapeau coupé = landing + onboarding + tour
historiques, à l'octet près.**

Un visiteur sans compte entre DIRECTEMENT dans le fil (aucune landing, aucun carrousel,
aucun formulaire, aucun GPS, aucune notification), voit une carte de bienvenue non
bloquante, choisit ses passions dans un panneau, explore Découvrir et Rencontrer, et ne
rencontre l'inscription qu'au moment où il tente une action engageante
(`requireAuthentication(ctx)`). Ses préférences vivent dans une clé versionnée
`localStorage["passio_first_run_v1"]` et sont migrées vers son compte, une fois, sans
écraser ce que ce compte porte déjà.

⚠️ **Neuf pièges de ce lot, tous mesurés, aucun déduit.**

① **`MY_UID` NE PROUVE PAS QU'UN COMPTE EXISTE.** `getMyUserId()` (app-08) FABRIQUE un
   identifiant local `u_xxxxxxxx` au chargement du script — pour tout le monde, toujours —
   et l'écrit dans `localStorage.passio_uid`. La garde « compte existant » testait sa
   présence : elle rendait donc TOUJOURS vrai, `entreeDirecte()` sortait, la landing
   s'affichait, et le drapeau paraissait sans effet. Le seul identifiant qui prouve un
   compte est un **uuid** Supabase (`RE_UUID`). Corollaire pour tout futur code : ne jamais
   traiter `MY_UID` comme une preuve d'authentification.

② **`js/first-run.js` DOIT être chargé AVANT le bloc `BUILD:APP`.** `app-09` fait
   `(window.__gateReady || Promise.resolve()).then(() => boot())` : quand le gate est déjà
   déverrouillé, cette microtâche part dès que la pile se vide — donc AVANT l'exécution du
   script suivant. Placé après le bloc, le module n'était pas encore évalué au moment où
   `boot()` cherchait `window.PassioFirstRun`. En production `scripts/build.js` inline ce
   fichier en place et charge `app.js` après le gate : l'ordre est le même.

③ **Un visiteur qui n'a rien choisi voit un CUL-DE-SAC, pas un fil.** `feedFollowingOn`
   vaut `true` par défaut et un visiteur ne suit personne : la sélection additive
   (ADR-011) est vide et `renderFeed` affiche « Tu ne suis encore personne ». D'où le
   **fil de découverte** (`PassioFirstRun.filDecouverte()`, consommé dans `renderFeed`) :
   tout le contenu affichable, classé par le moteur habituel. ⚠️ Rien n'est coché ni
   persisté — aucune tuile ne s'allume, `_activeFeedPassions` et
   `state.selectedFeedPassions` restent vides — sinon la migration transférerait au compte
   des « choix » que personne n'a faits.

④ **La fiche d'activité n'a PAS de classe d'état** : `#eventDetailPage` reste dans le DOM
   et c'est `style.display` qui l'ouvre. Chercher une classe `active`/`open` rendait
   toujours `false`, et une bulle d'aide se posait par-dessus une fiche ouverte par lien
   profond — exactement ce que « le tour est différé » interdit.

⑤ **Le hash d'arrivée n'est pas celui qu'on retrouve.** `#irl-event-e1` amène
   `openEventDetails`, qui repose `#event-e1`. Un test ancré sur la forme d'ENTRÉE
   conclurait à tort que le lien profond est perdu. La vérité est l'ÉCRAN affiché, pas le
   hash.

⑥ **Le formulaire d'authentification vit sur l'étape `splash`, pas sur `auth`.** L'étape
   `data-onb-step="auth"` existe encore mais porte `display:none!important` : c'est un
   alias mort. L'ouvrir affiche un écran VIDE, sans la moindre erreur. Et `onbStepIdx`
   doit repartir de 0, sinon le `onbNext()` du succès saute l'âge ou le prénom.

⑦ **L'onboarding est un cul-de-sac sans porte de sortie.** Une fois dedans, un visiteur qui
   change d'avis — ou qui vient de créer un compte et attend son e-mail de confirmation —
   n'a plus aucun moyen de revenir au fil. « Continuer à explorer » est une des trois
   issues promises par le gate : `poserSortieExploration()` la rend vraie après ouverture.

⑧ **Deux chemins mènent à l'après-authentification, et un seul passe par `onbFinish`.**
   « J'ai déjà un compte » fait `location.reload()` dans `onbDoAuth`, et la confirmation
   d'e-mail ramène par un lien NEUF : dans les deux cas `onbFinish` n'est jamais atteint.
   C'est `reprise()` (sur `passio:app-ready`) qui prend le relais — **indépendamment du
   drapeau**, sinon des préférences créées sous le parcours seraient perdues parce que
   l'URL a changé. Garde `_apresFait` contre le double envoi.

⑨ **Le marqueur anti-géolocalisation est consommé par `renderIRL`**, donc il doit être armé
   AVANT lui : le crochet `PassioFirstRun.surNavigation(screen)` est appelé dans `goTo`
   **avant** la ligne de re-rendu. Posé après, il arrivait trop tard pour le premier rendu —
   celui qui compte. Le lot UI-4A0 masquait ce défaut en armant le même marqueur dans son
   enveloppe de `renderIRL` ; couper ce lot l'aurait rouvert sans aucun symptôme.

**Sécurité et données.** Aucune RLS n'est desserrée : la policy « Lecture respectant les
comptes privés » autorise déjà, sans session, la lecture des publications d'auteurs non
privés (`auth.uid()` NULL, deuxième branche du OU). Le mode invité ne fait que LIRE
(`supaLoadPosts`, `supaLoadEvents`) et ne passe JAMAIS par `supaInit()`, qui écrit
(`supaEnsureProfileExists`, `supaSaveUserState`). **Aucun compte anonyme n'est créé** —
contrairement au chemin historique `onbSkipAuth`, qui appelle `signInAnonymously`. Le
contenu de démonstration (`_source === "seed"`) porte l'étiquette « Exemple PASSIO » et
refuse la participation avant toute écriture. Rien de sensible ni de base64 n'entre dans la
clé versionnée : uniquement des identifiants du catalogue et une route de retour.

**Catalogue.** `PASSIONS` (app-01) + le référentiel serveur restent la SEULE source de
vérité des passions ; `SPECIALITES` et `SYNONYMES` sont une couche ADDITIVE indexée par
identifiant existant, lue par `specialitesDe()` et `chercher()` seulement. Le jour où un
vrai catalogue hiérarchique arrive, il remplace ces deux tables et rien d'autre ne bouge.
Une spécialité n'est jamais publiée comme une passion (elle n'est pas canonique) : la
choisir SÉLECTIONNE sa passion parente.

**Ce qui n'est jamais rejoué après inscription** : aucune publication, aucun message,
aucune inscription à une activité. `apresAuthentification()` restaure l'écran, la position
et le contenu, puis RAPPELLE l'action par un toast — le dernier geste appartient à la
personne.

**Deux corrections demandées par Benjamin après essai réel sur la preview (2026-09-01).**

⑩ **FERMER LA CARTE DE BIENVENUE N'EST PLUS DÉFINITIF.** Elle écrivait sa fermeture
   dans `localStorage` : elle ne revenait donc JAMAIS. Or c'est elle qui porte le
   bouton « Personnaliser mon expérience », et la seule autre porte vers le panneau
   est une entrée du menu Paramètres que personne ne va chercher. La fermer rendait
   le panneau INATTEIGNABLE — c'est pourquoi Benjamin ne l'a jamais vu. La consigne
   disait « ne pas réapparaître sans raison » ; « sans raison » avait été lu comme
   « jamais », alors que la raison est forte : **tant qu'aucun compte n'existe, rien
   n'est acquis**. La fermeture vit désormais dans `sessionStorage`
   (`passio_first_run_bienvenue_fermee`) et ne vaut que pour la session ; la carte
   revient à chaque visite, et disparaît définitivement dès qu'un compte existe.
   Son message suit l'état : passions déjà choisies → « Tes passions sont sur cet
   appareil / Crée ton compte pour les garder », bouton « Modifier mes passions ».

⑪ **LES AIDES AU GESTE NE SONT PAS DES ÉTAPES DE TOUR.** Quatre bulles se sont
   ajoutées (bulles de passion, envies, stories, bobines) parce que le tour à trois
   étapes laissait les commandes du Fil sans explication. Elles ne s'affichent PAS à
   l'ouverture : chacune attend le premier geste sur la commande dont elle parle.
   Empiler une bulle par commande reconstruirait le tutoriel que ce lot remplace.
   ⚠️ **L'écouteur est en phase de CAPTURE, et c'est obligatoire.** Une tuile de
   passion porte un `onclick` inline qui appelle `toggleProfileFilter` →
   `renderFeed` → `renderProfileStrip`, laquelle réécrit `#profileStrip` en entier :
   en bubbling, la tuile est DÉTACHÉE quand l'événement atteint `document`, et
   `closest("#profileStrip")` remonte dans un arbre orphelin sans jamais trouver la
   zone. L'aide ne se posait jamais, sans le moindre symptôme — même famille que le
   piège d'UI-4A4, « une chip arrachée par son propre clic ». ⚠️ Aucun écouteur
   CLAVIER n'est ajouté : app-08 en porte déjà un pour tout `[role="button"]` non
   natif, qui appelle `el.click()`.

⚠️ **AVANT TOUT CHOIX, LE RAIL DU HAUT NE CONTIENT QUE « Suivis ».**
   `renderProfileStrip` rend les passions DU COMPTE (`state.user.profiles`), et un
   visiteur n'en a aucune : les tuiles n'apparaissent qu'une fois ses passions
   choisies. Un test qui y chercherait une tuile de passion chercherait ce qui
   n'existe pas encore.

## 📚 Références projet
- **`docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md` — direction UX canonique (2026-08-25).** Elle
  consolide et **remplace l'ancien ordre qui plaçait la refonte visuelle après la performance** :
  priorité n° 1 = rendre le concept visible et testable par lots UI-1 → UI-7. **UI-1 + UI-2 sont
  actives par défaut depuis validation de Benjamin le 2026-08-26** ; les anciens liens
  `?passio_preview=passio-ui-v2` restent compatibles. Après validation visuelle d'un lot UI à risque
  normal, cette validation autorise aussi sa fusion squash et son déploiement Git/Netlify une fois
  revue et CI vertes, sans seconde demande. Les changements critiques restent exclus. Les règles
  de sécurité déjà acquises restent non négociables. Ordre historique du lot UI-1 :
  `docs/PASSIO_UI_V2_ORDRE_UI1_2026-08-25.md`.
  Implémentation UI-1 : `js/ui-v2-shell.js` + bloc « PASSIO UI V2 » en fin de `styles.css`
  (inertes sous kill switch), tests `tests/e2e/ui-v2-shell.spec.js`.
  ⚠️ **Contrat visuel arrêté le 2026-08-27, après essai réel de Benjamin sur la
  preview** : la ligne basse d'une carte éligible ne porte QUE le lien « Trouver une
  expérience », aligné à droite. Le nom de la Passio, son emoji et le « trait Passio »
  violet → corail y ont été RETIRÉS — l'en-tête du post porte déjà la Passio, la répéter
  en bas alourdissait la carte. Le trait subsiste dans la feuille basse, comme transition
  d'ouverture. La direction §A19 est amendée dans ce sens.
  ⚠️ **Amendement du 2026-08-28, sur demande de Benjamin (« un petit onglet, plus
  discret »)** : ce lien de texte est devenu une **pastille**, et son libellé de carte
  a été raccourci en « **Vivre ça en vrai** ». Deux conséquences à connaître avant d'y
  toucher. ① Le libellé n'est plus unique : `LIBELLE_CTA_CARTE` (la pastille) et
  `LIBELLE_CTA` (le titre du panneau, resté « Trouver une expérience ») sont deux
  constantes — la carte invite, le panneau promet, et le panneau tient toujours ce que
  la carte annonce. ② La pastille VISIBLE ne fait que ~30 px alors que la cible tactile
  doit rester à 44 px (test « cible tactile ≥ 44 px », mesuré sur la **boîte** du bouton,
  qu'un simple débord en pseudo-élément ne satisferait pas) : le bouton garde donc ses
  44 px et c'est un `::before` en `inset: 7px 0` (z-index négatif) qui **peint** la
  pilule. Son fond est **opaque** (`var(--bg-deep)`) délibérément : le test de contraste
  remonte les ancêtres jusqu'au premier fond opaque et prendrait une teinte `rgba(…)`
  pour une couleur pleine, alpha ignoré — un rouge ou un vert qui ne prouverait rien.
  UI-3B (« Voir l'activité ») partage `.v3-tempt` et devient une pastille avec elle.
  Implémentation UI-3A (passerelle « Trouver une expérience » du Feed vers l'IRL) :
  `js/ui-v3-passerelle.js` + bloc « PASSIO UI V3 » en fin de `styles.css`, tests
  `tests/e2e/ui-v3-passerelle.spec.js`. **ACTIF PAR DÉFAUT** depuis la validation
  visuelle de Benjamin du 2026-08-27 (PR #163) ; il était en aperçu jusque-là, et
  `?passio_preview=passio-ui-3` reste toléré sans plus rien décider. Le drapeau ne
  sait que RETIRER — aucune valeur positive n'active, aucune n'est écrite dans
  `localStorage` ; coupures : `localStorage.passio_ui_3="0"` et
  `window.PASSIO_UI_3=false`, prioritaires sur tout. Le module
  n'écrit rien (ni base, ni `state`, ni `localStorage`), ne crée ni événement ni RSVP,
  et réutilise les moteurs existants (`irlPassionFilters`+`renderIRL`,
  `openPassionExplorer`, `openCreateEvent`+`feedIrlBridgePrefill`). ⚠️ Quatre pièges
  payés pendant ce lot, à ne pas refaire : ne JAMAIS cadencer un rendu sur
  `requestAnimationFrame` (il ne part pas sur une page qui ne compose pas de frames —
  onglet en arrière-plan, headless, machine saturée : la passerelle n'était jamais
  posée, en silence) ; masquer par CSS ancré à la classe racine plutôt que RETIRER du
  DOM, sinon le kill switch ne restitue pas l'état d'avant ; fermer l'aide contextuelle
  (`fermerHint`) avant d'ouvrir une feuille, elle est `position: fixed` et intercepte le
  tap ; et **borner un masquage à ce qu'on remplace réellement** — la règle qui cache le
  CTA historique vise `.post[data-v3-decore]`, marqueur posé par la décoration, car les
  deux éligibilités ne se recouvrent pas (le pont historique n'exige aucune passion, la
  passerelle en exige une CONNUE) : sans cette borne, une carte sans passion reconnue
  perdait sa seule porte vers l'IRL sans rien recevoir en échange.
  Implémentation UI-3B (publication DÉJÀ reliée à une activité) : **même module**
  `js/ui-v3-passerelle.js` (section « LOT UI-3B ») + bloc CSS dédié en fin de
  `styles.css`, tests `tests/e2e/ui-v3b-activite.spec.js`. Les deux lots sont
  EXCLUSIFS : `refEvenement(post)` (uniquement `eventId` / `event_id` /
  `sharedReelData.kind==="event"`, jamais déduit du texte) décide, et une carte
  reliée ne reçoit JAMAIS « Trouver une expérience ». La carte ne porte que le lien
  « Voir l'activité » (mêmes classes `.v3-bridge`/`.v3-tempt`, attribut
  `data-v3-activity`) ; activité introuvable = AUCUN CTA, publication intacte,
  diagnostic technique sans PII. Le tap ouvre `openEventDetails` et remplace la
  seule barre `#eventDetailCta` par une action unique « Je participe » servie par
  `setEventRsvp` (aucun moteur RSVP dupliqué, aucune écriture avant le geste ;
  ni « Peut-être », ni « Je ne participe pas » dans cette surface ; le retrait
  reste secondaire). ⚠️ Deux pièges : le moteur repeint la fiche entière à chaque
  RSVP (`_refreshEventDetailIfOpen`) donc le marqueur `data-v3-rsvp` vit sur le
  nœud INJECTÉ et non sur `#eventDetailCta` (un `innerHTML` efface les enfants,
  pas les attributs de l'hôte) ; et l'activité annulée ou terminée n'est jamais
  recouverte — la fiche historique y dit déjà la bonne chose. Corollaire de test :
  les suites du pont historique (`feed-irl-bridge.spec.js`, le cas « Rencontrer » de
  `feed-intents.spec.js`) démarrent avec `localStorage.passio_ui_3="0"` pour l'observer
  seul — aucune assertion n'est retirée, la cohabitation est prouvée à part dans
  `ui-v3-passerelle.spec.js`. Le lot UI-3B (publications déjà liées à un événement,
  « Voir l'activité » puis « Je participe » dans la fiche) est implémenté et **en
  attente de la validation visuelle de Benjamin** : il vit sous le MÊME drapeau
  `passio_ui_3` et les mêmes coupures que UI-3A.
  Implémentation UI-4B (fiche activité V2) : `js/ui-v4b-fiche.js` + bloc « PASSIO UI V4 »
  en fin de `styles.css`, tests `tests/e2e/ui-v4b-fiche.spec.js`. **APERÇU UNIQUEMENT**
  (`?passio_preview=passio-ui-4b`, ou `…=passio-ui-4b-demo` qui ouvre en plus une activité
  de démonstration entièrement en mémoire) ; coupures dédiées et prioritaires
  `localStorage.passio_ui_4b="0"` et `window.PASSIO_UI_4B=false`. Aucune activation
  positive persistante, rien n'est écrit dans `localStorage`. Le module ne recrée AUCUN
  moteur : il **déplace** les nœuds que `openEventDetails` vient de rendre dans des
  sections ordonnées (rendez-vous → organisateur → description → infos → participants →
  discussion → contextuel → échanges → autres actions), ajoute la seule surface neuve
  (le bloc « Le rendez-vous » : tuile de date corail, heure, ville PUBLIQUE, places
  agrégées) et remplace la barre d'action par un unique « Je participe » servi par
  `setEventRsvp`. ⚠️ Cinq pièges de ce lot : **déplacer et non régénérer** — reconstruire
  la chaîne HTML tuerait les `onclick` inline et les nœuds que des chargements asynchrones
  retrouvent par id (`#eventAlbum`, `#eventCommentsList`, `#eventCommentInput`) ; un
  élément non classé tombe dans « Autres actions » et un élément non reconnu **hérite du
  titre historique qui le précède**, sinon la ligne « Plus que N places » quittait sa
  section ; le marqueur `data-v4b-rsvp` vit sur le nœud INJECTÉ, pas sur `#eventDetailCta`
  (même piège qu'UI-3B) ; **un verrou d'échec est obligatoire** car restaurer la fiche
  historique repeint le corps, que l'observateur voit — sans lui, une erreur reproductible
  boucle à l'infini ; et **deux modules ne peuvent pas écrire la même barre** — d'où le
  garde `ficheReprisParV4b()` dans `ui-v3-passerelle.js`, qui rend la barre à UI-4B dès
  que l'aperçu est actif (inerte hors aperçu). Annulé et terminé ne sont JAMAIS recouverts :
  la fiche historique y dit déjà la bonne chose. Vie privée : seule la ville publique monte
  au premier niveau, l'adresse exacte et le téléphone restent dans « Infos pratiques »,
  là où le moteur historique les avait mis.
  Implémentation UI-4A0 (tête de l'écran « Rencontrer ») : `js/ui-v4a0-tete.js` + bloc
  « PASSIO UI V4 — lot UI-4A0 » en fin de `styles.css`, tests `tests/e2e/ui-v4a0-tete.spec.js`.
  **APERÇU UNIQUEMENT** (`?passio_preview=passio-ui-4a0-demo`, alias `…=passio-ui-4a0`) ;
  coupures dédiées et prioritaires `localStorage.passio_ui_4a0="0"` et
  `window.PASSIO_UI_4A0=false`. Périmètre volontairement minuscule : titre, sous-titre,
  recherche et quatre intentions posés EN TÊTE de `#screen-irl` ; la liste, la carte, les
  cartes d'activité et tous les moteurs d'app-07 restent intacts dessous. Deux seuls
  comportements branchés : ① la recherche de tête recopie sa valeur dans le champ
  historique `#irlCitySearch` (masqué en CSS via le nouvel id `#irlSearchRow`, jamais
  retiré du DOM) puis appelle `filterIrlByCity()` — même anti-rebond, même
  `irlSearchQuery`, aucun second moteur ; ② **aucune demande GPS à l'ouverture**, obtenue
  en ENVELOPPANT `window.renderIRL` pour armer le marqueur historique
  `_passioIrlSkipGeoOnce` (celui d'UI-3A) avant chaque rendu — le moteur le consomme
  lui-même, donc la géolocalisation n'est jamais désactivée durablement et
  `requestUserLocation()` appelé par un geste explicite fonctionne toujours.
  ⚠️ Les quatre intentions (`Pour toi` neutre + trois multisélectionnables) tiennent leur
  état **EN MÉMOIRE SEULE** et ne filtrent PAS encore : le raccordement à `irlDateFilters`
  / `irlSelectedCity` / `irlPassionFilters` revient à UI-4A1, qui lira
  `window.PassioUIV4A0.intents()`. C'est une décision de découpage, pas un oubli.
  ⚠️ Piège du build : `scripts/build.js` externalise le bloc app dans `app.js` chargé
  APRÈS le gate, alors que les modules hors bloc sont inlinés et s'exécutent tout de
  suite — au premier `boot()`, `renderIRL` n'existe pas encore en prod. Le module écoute
  donc `passio:app-ready` et garde une reprise bornée par `setTimeout` (jamais
  `requestAnimationFrame`).
  Implémentation UI-4A1 (raccord des intentions au moteur IRL) :
  `js/ui-v4a1-intentions.js`, tests `tests/e2e/ui-v4a1-intentions.spec.js`.
  **APERÇU UNIQUEMENT** (`?passio_preview=passio-ui-4a1-demo`, alias `…=passio-ui-4a1`) ;
  coupures dédiées `localStorage.passio_ui_4a1="0"` et `window.PASSIO_UI_4A1=false`, et
  couper UI-4A0 coupe aussi ce lot. Aucun style neuf : la tête UI-4A0 est réutilisée
  telle quelle, son aperçu étant impliqué par celui de son « héritier ». Le module ne
  crée AUCUN moteur : `semaine` pilote la seule valeur `"week"` de `irlDateFilters`,
  `passio` ajoute exactement `_irlMyPassions()` dans `irlPassionFilters`, et tout passe
  par le même `renderIRL()`. ⚠️ Le seul écart réel : **il n'existait aucun filtre ville** —
  `irlSelectedCity` ne servait que de point de référence (carte, distances, tri « le plus
  proche »). Un prédicat explicite `irlCityIntent` (+ `setIrlCityIntent` /
  `irlCityIntentName` / `_normIrlCityName`) a donc été ajouté DANS `_filterIrlEvents`,
  pour que liste et marqueurs ne divergent pas ; il est vide par défaut, compté par
  `_irlActiveFilterCount`, signé par `_resetIrlPagingIfFiltersChanged` et vidé par
  `clearAllIrlFilters`. Sans ville choisie, `Ma ville` ouvre `openIrlCitySelector()` et
  reste inactive jusqu'au choix — jamais de GPS. ⚠️ Quatre pièges de ce lot : les états
  historiques sont des `let` (`irlPassionFilters`, `irlSelectedCity`) donc **absents de
  `window`** → app-07 expose `irlPassionFilterSet()` / `irlSelectedCityName()`, à relire
  à chaud (`renderIrlPassionTiles` REMPLACE le Set le temps d'un calcul) ; la coupure
  restitue **valeur par valeur**, jamais en bloc, sinon elle effacerait un filtre posé
  depuis le panneau détaillé APRÈS l'activation ; `clearAllIrlFilters()` est un geste
  explicite qui devient le nouveau neutre (le snapshot est abandonné, il ne ressuscite
  pas à la coupure) ; et **deux enveloppes de `renderIRL` s'empilent** — UI-4A0 ne met
  plus sa fonction d'origine à `null` quand un sous-lot l'a recouverte, sinon le rendu
  suivant plantait sur un `null.apply`.
  Implémentation UI-4A2 (carte d'activité V2 dans la liste « Rencontrer ») :
  `js/ui-v4a2-cartes.js` + bloc « PASSIO UI V4 — lot UI-4A2 » en fin de `styles.css`,
  tests `tests/e2e/ui-v4a2-cartes.spec.js`. **APERÇU UNIQUEMENT**
  (`?passio_preview=passio-ui-4a2-demo`, alias `…=passio-ui-4a2`) ; coupures dédiées
  `localStorage.passio_ui_4a2="0"` et `window.PASSIO_UI_4A2=false`. La carte ne porte
  plus que ce que la direction §8 énumère : visuel (couverture, sinon pastille emoji),
  titre, `Passio · quand`, `ville · environ N km`, `N personnes · N places`, la preuve
  sociale historique, puis « Voir » et « Je viens ». Vie privée (§A24) : elle en montre
  **moins** que l'historique — ni `venue`, ni adresse, ni contact, ni trombinoscope, et
  la preuve sociale reste la seule surface nommant des personnes (déjà bornée par
  `_eventFriendsGoing` aux comptes suivis). Aucun moteur neuf : `setEventRsvp` reste le
  seul point d'écriture (c'est lui qui bascule en liste d'attente), et une réponse déjà
  posée ouvre `openEventRsvpSheet` au lieu de dupliquer les trois états. Annulé et
  terminé ne sont jamais recouverts d'une invitation à venir.
  ⚠️ Six pièges de ce lot : **rien n'est retiré ni déplacé** — les nœuds recouverts sont
  masqués et l'ordre vient de `order`, sinon `_loadEventCommentCounts` /
  `_loadEventReactions` / `_loadEventCommentsPreviews` ne retrouveraient plus
  `[data-evlike]`, `[data-evc]`, `[data-evchipholder]`, `[data-evcomments]` ; le masquage
  exige `!important` car la rangée haute de la carte historique porte un
  `style="display:flex"` **inline** qu'aucun sélecteur ne bat (UI-4A0 avait mémorisé puis
  restauré ce display en JS ; ici il y a une carte neuve à chaque rendu, donc rien à
  restaurer — on surclasse, et retirer la classe racine rend tout) ; le masquage est
  **borné à `data-v4a2`**, une carte non décorée gardant TOUTES ses portes ; **aucune
  enveloppe de `renderIRL`** — un `MutationObserver` sur `#eventList` voit en plus
  `_patchEventCardJoin`, qui repeint le seul pied après un RSVP sans repasser par le
  rendu, et n'allonge pas la chaîne d'enveloppes UI-4A0/UI-4A1 ; l'anti-boucle est une
  **signature d'état** posée sur la carte (on n'écrit qu'au changement), l'observateur
  voyant ses propres écritures ; et `_isMyEvent` s'appuie sur `ev._mine`, drapeau porté
  par les **copies** d'`allEvents()` et absent de l'objet canonique — d'où un repli sur
  `state.userEvents`, sans quoi la carte V2 dirait « Je viens » là où l'historique disait
  « Organisé ». L'aperçu UI-4A2 implique UI-4A0 et UI-4A1 (`passio_preview` ne porte
  qu'une valeur, et des chips inertes mentiraient sur l'écran) : UI-4A0 balaie donc TOUS
  ses héritiers au lieu d'en chaîner un seul, et UI-4A2 réveille les lots amont à son
  boot, puisqu'ils ont démarré avant que son fichier n'existe. Reste du lot UI-4 : la vue
  Liste / Carte (UI-4A3).

  **Lot UI-5 — « Bobines connectées au réel » (§7 et §15), EN LIGNE le 2026-08-28.**
  `js/ui-v5-bobines.js` + bloc « PASSIO UI V5 » en fin de `styles.css`, tests
  `tests/e2e/ui-v5-bobines.spec.js` (15). Coupures : `localStorage.passio_ui_5="0"`,
  `window.PASSIO_UI_5=false`. Une rangée d'actions est AJOUTÉE dans `.reel-info` ;
  rien n'est retiré (le rail like/commentaire/soutien/partage reste entier).
  Deux branches EXCLUSIVES, décidées par `PassioUIV3.eventRefOf` — la même règle
  canonique que le Feed : une bobine reliée à une activité porte le seul lien
  « Voir l'activité » ; les autres portent « Ça m'intrigue », « Découvrir
  \<Passio\> », « À vivre près de moi », « Proposer une sortie ».
  AUCUN moteur nouveau : `ui-v3-passerelle.js` expose désormais `seeActivities` /
  `discoverPeople` / `proposeOuting` (les fonctions que la passerelle du Feed
  appelle déjà), et l'ouverture d'activité passe par `openActivity`.
  ⚠️ **Cinq pièges de ce lot.** ① Le viewer est en `z-index: 9999` alors que
  `toast()` et `#eventDetailPage` sont à 200 et les feuilles basses à 1200 :
  ouvertes par-dessus, elles seraient dans le DOM et INVISIBLES (seule
  `.modal-backdrop`, 10001, monte au-dessus). Le module ferme donc le viewer
  AVANT chaque sortie, sans exception — précédent `_openReelAuthor` — et un test
  vérifie que `reelsState.open` est faux au moment de chaque appel de moteur ;
  effet voulu : le « retour Feed stable » du §15 devient vrai. ② `openReels()`
  fait `#reelsList.innerHTML = …` à CHAQUE ouverture, et `openReelById` rouvre le
  viewer : la décoration passe par un `MutationObserver`, jamais par une
  enveloppe de fonction. ③ « Ça m'intrigue » serait DÉCORATIF sans effet réel —
  `state.user.likedPosts` n'est lu par aucun classement et le viewer n'en a
  aucun. Le signal porte donc sur la PASSION (seule granularité que
  `feedPostScore`, `irlPassionFilters` et `openPassionExplorer` savent déjà
  consommer), vit dans `state.user.passionSignals` et ajoute 0,6 au bloc affinité
  de `feedPostScore` ; 100 % local, réversible, borné à 200 entrées parce que le
  blob `user_state` part EN ENTIER à chaque synchronisation. ④ Aucune bobine ne
  portait d'`event_id` : deux bobines de démonstration en reçoivent un, sans quoi
  la branche « Voir l'activité » serait invisible — donc indiscernable d'un lot
  cassé (leçon UI-3B). ⑤ Les tests d'un lot « bobines » doivent VIDER les bobines
  du seed avant d'injecter les leurs : `buildReels()` assemble seed + Supabase +
  posts perso, donc le viewer en montre 22, et la liste étant en `scroll-snap`,
  une chip hors écran n'est pas cliquable.
  ⚠️ **Les deux manques laissés hors du lot UI-5 sont désormais fermés.**
  `event_id` est entré dans le `.select()` de `supaLoadPosts` avec la PR #184.
  Le **lien de partage `#reel=<id>`** est routé depuis le 2026-08-29 :
  `_openReelDeepLink()` en tête de `js/app-06-reels-partage.js`, écouteur
  `hashchange` + amorçage sur `window.__gateReady`, tests
  `tests/e2e/reel-deeplink.spec.js` (5). C'était un défaut de production, pas une
  fonctionnalité manquante : `openReelShareModal` fabriquait ces liens et les
  envoyait sur WhatsApp, Telegram, X, Facebook, e-mail, SMS et presse-papier
  depuis toujours, mais **personne ne les lisait** — donc la seule porte d'entrée
  d'un nouveau venu retombait sur le fil. Même défaut, même correctif que
  `#cdv-live-<id>` (app-03) et `#irl-event-<id>` (app-07).
  ⚠️ **Cinq règles de ce routage, dont deux P0 trouvés en revue de diff.**
  ① Il n'ouvre JAMAIS une autre bobine que celle demandée. `openReels()` montre
  la première de la liste quand l'id est absent, et `buildReels()` **tronque à
  30** : la garde est donc l'APPARTENANCE à `buildReels(id)` (qui épingle la
  cible via `pinnedId`), jamais une copie de ses conditions. Tester `isReel` +
  média ne suffisait pas — `buildReels` écarte aussi les **comptes bloqués**,
  donc une bobine d'un compte bloqué ouvrait le viewer sur le contenu d'autrui,
  avec un toast « introuvable » par-dessus. `openReelById` referme le viewer
  quand il rend `false`. ② Il attend que l'application soit VRAIMENT prête :
  `state` vaut **null** jusqu'à `state = loadState()`, qui part après
  `await ensureSupabase()` — sonder trop tôt levait un TypeError dans
  `findPostAnywhere`, non rattrapé car venu d'un `setTimeout`, ce qui TUAIT la
  chaîne de reprise en silence (même piège que `ui-v4b-fiche.js` le 2026-08-28).
  Le corps est sous `try` et une exception **replanifie** au lieu de conclure.
  ③ Il n'ouvre rien par-dessus le gate, la landing ou l'onboarding (viewer en
  z-index 9999 : il recouvrirait l'inscription de la personne même qui vient
  d'ouvrir le lien) — ces attentes ne consomment pas d'essai. ④ Il ne nettoie le
  hash que sur le chemin de SUCCÈS, et avant l'ouverture (`openReels()` empile
  son propre `#reels`) : le nettoyer sur échec rendait le lien irrécupérable,
  même par rechargement, alors que le budget d'attente (12 × 700 ms) peut être
  plus court qu'un réseau mobile froid. ⑤ Il mémorise l'id au premier passage :
  une ouverture normale des Bobines pendant l'attente empile `#reels` et le lien
  aurait été perdu sans un mot. ⚠️ La télémétrie de ce chemin n'est PAS corrélée
  au `?plk=` du lien : `telemetry.js` consomme et retire ce paramètre au
  chargement, avant que le bloc app n'existe. Son `link_open` prouve
  l'ouverture, `reel_link_open` l'affichage effectif ; les apparier demanderait
  une API publique qui n'existe pas encore.
  ⚠️ **Les liens IRL avaient le MÊME défaut, corrigé le 2026-08-30.**
  `#irl-event-<id>` et `#irl-checkin-<id>-<code>` (app-07) sondaient `allEvents()`
  **une seule fois**, à +1 200 ms d'un `setTimeout` d'amorçage — donc parfois avant
  que `state` existe. `allEvents()` fait `state.seed.events` : sur `state === null`
  il lève, l'exception venue d'un `setTimeout` ou d'un `hashchange` n'est rattrapée
  par personne, la boucle de reprise `setInterval` n'est **jamais armée**, et le
  lien meurt sans un toast. Le cas du **QR de pointage** est le pire des deux : on
  est devant l'organisateur, on scanne, il ne se passe rien. Les deux routages
  suivent désormais les mêmes règles que `#reel=` : attente de disponibilité qui ne
  consomme **pas** d'essai de contenu (sinon le budget de 12 essais est brûlé par le
  démarrage), mémorisation de l'id au premier passage (`goTo()` fait un
  `pushState("#irl")`, donc toute navigation pendant l'attente effacerait le lien),
  corps entier sous `try` qui **replanifie** au lieu de conclure, et écoute de
  `passio:app-ready` avec remise à zéro des compteurs. Le hash n'est toujours pas
  nettoyé — un rechargement doit pouvoir retenter. ⚠️ Mesuré en mutant les deux
  couches séparément : **chacune suffit seule** (neutraliser la garde laisse vert,
  car le `catch` replanifie ; faire conclure le `catch` laisse vert, car la garde
  évite l'exception). C'est une vraie défense en profondeur — et la conséquence
  honnête est qu'aucune mutation simple ne rougit : le test protège le
  comportement, pas chaque couche.

  **§5 de la direction — la palette PILOTE l'interface depuis le 2026-08-28.**
  `--v2-ink` et `--v2-cloud` étaient déclarés avec ZÉRO consommateur, et le
  violet réellement affiché restait `#7c3aed` au lieu du `#6D32F4` arrêté : la
  charte était écrite, jamais vue. Les variables de thème du projet
  (`--accent`, `--bg-deep`, `--text`, `--grad-hero`…) sont remappées sous
  `:root.passio-ui-v2` — et elles seules : aucune règle existante n'est
  réécrite, donc `localStorage.passio_ui_v2="0"` rend la charte historique à
  l'octet près. Contraste vérifié avant/après : `#6D32F4` donne 6,15:1 sur blanc
  contre 5,70:1 pour `#7c3aed` — le nouveau violet est plus foncé, donc plus
  lisible. Le corail `#FF6B57` reste STRICTEMENT réservé au passage au réel
  (§5) : il n'entre dans aucun jeton d'accent général. Typographie : Manrope
  pour les titres et les appels à l'action (`display=swap`, autorisé par la CSP),
  texte courant en pile système ; deux niveaux de titre distincts (26 px/800 pour
  un écran, 17 px/800 pour un bloc).

  **⚠️ Piège de déploiement mesuré le 2026-08-28 : la garde « Gouvernance
  critique » perd une course avec l'indexation GitHub.** Sur un `push` vers
  `main`, elle résout la PR par `gh api repos/…/commits/<sha>/pulls`. Lancée 3 s
  après une fusion squash, l'index n'est pas encore à jour : elle sort « Aucune
  pull request n'est associée à <sha> » et le déploiement production est SAUTÉ.
  Ce n'est pas un défaut du code — le remède est de relancer le seul job en
  échec une fois le run terminé (`rerun_failed_jobs`), et il passe. Ne jamais
  annoncer « c'est en ligne » sans avoir vu le job « Déploiement production »
  vert : entre la fusion et la publication, la chaîne repasse toute la suite
  (~13 min) et peut buter sur cette garde.

  **⚠️ MISE EN LIGNE DU 2026-08-28 — les quatre lots UI-4 sont ACTIFS PAR DÉFAUT.**
  Sur ordre de Benjamin, `UI-4A0`, `UI-4A1`, `UI-4A2` et `UI-4B` sont passés de l'aperçu
  à l'URL normale, sans validation visuelle préalable — le mécanisme d'aperçu ne lui
  permettait pas de voir les lots sur son appareil (voir ci-dessous), et l'attente
  bloquait tout le chantier. Chaque drapeau suit désormais le patron d'UI-3A : il ne sait
  plus qu'**enlever** (`localStorage.passio_ui_4a0|4a1|4a2|4b = "0"`,
  `window.PASSIO_UI_4A0|4A1|4A2|4B = false`), les anciens liens `?passio_preview=…`
  restent tolérés mais ne décident plus rien, et aucune activation positive n'est écrite.
  Seule exception : la **démonstration** d'UI-4B (`?passio_preview=passio-ui-4b-demo`)
  reste sur son lien, car elle injecte une activité fictive.
  Conséquences de produit assumées, à connaître : ① `ficheReprisParV4b()` rend
  définitivement la barre d'action de la fiche à UI-4B — UI-3B ne la peint plus jamais ;
  ② UI-4A0 arme `_passioIrlSkipGeoOnce` avant chaque `renderIRL`, donc **la position
  n'est plus jamais demandée implicitement** sur l'écran IRL (conforme à §A23, mais c'est
  un changement pour les comptes existants) ; ③ les cartes ne montrent plus `venue` ni le
  trombinoscope (§A24).
  Convention de test appliquée, la même qu'à la mise en ligne d'UI-3A : **une suite qui
  observe le comportement historique pose au boot le kill switch du lot qui le recouvre**
  et garde toutes ses assertions ; les contrôles « URL normale = rien du lot » ont été
  RÉÉCRITS en contrôles de kill switch, jamais supprimés. Fichiers réalignés :
  `ui-v4a0-tete`, `ui-v4a1-intentions`, `ui-v4a2-cartes`, `ui-v4b-fiche`,
  `ui-v3b-activite`, `ui-v3-passerelle`, `irl`.

  **⚠️ Pourquoi un aperçu peut être invisible alors que tout est déployé (2026-08-28).**
  Quatre causes mesurées le même jour, sur trois lots différents — aucune n'était le
  déploiement, et aucune n'était détectable par la suite e2e. À relire avant de conclure
  « ça ne marche pas » :
  ① **`js/platform.js` détruisait la query.** La redirection « iOS autre navigateur »
     faisait `location.href = 'https://passio-app.netlify.app/'` 800 ms après `load` —
     donc sans `?passio_preview=…`, en pleine saisie du code d'accès. Elle n'ouvrait
     d'ailleurs pas Safari (même schéma `https`) et, lancée depuis l'adresse canonique,
     ne faisait que recharger. Corrigée : on ne redirige plus que depuis une AUTRE
     origine, et query et fragment sont conservés.
  ② **`state` vaut `null`, pas `undefined`.** `js/ui-v4b-fiche.js` gardait par
     `typeof state === "undefined" || !state.seed` alors qu'app-01 déclare
     `let state = null` : `state.seed` levait un TypeError non rattrapé qui tuait la
     reprise. **Ce motif est à chasser partout** où un `typeof state === "undefined"`
     précède un accès à une propriété de `state`.
  ③ **Un budget de reprise consommé avant l'existence de l'application.** En prod le bloc
     app n'est injecté qu'APRÈS le code d'accès ; `ui-v4b-fiche.js` brûlait ses 80 essais
     × 150 ms pendant la saisie et ne remettait jamais son compteur à zéro — seul des
     quatre modules à ne pas écouter `passio:app-ready`. Corrigé. **Tout module inliné
     hors bloc app DOIT écouter `passio:app-ready` et y remettre ses compteurs à zéro.**
  ④ **Un lot sans contenu éligible est indiscernable d'un lot cassé.** UI-3B ne décore
     qu'une publication portant `eventId` : aucune publication du contenu de démo n'en
     porte, donc « Voir l'activité » n'apparaissait nulle part. Le lot marchait.
  ⑤ **UNE PREVIEW DE PR EST UNE AUTRE ORIGINE** (mesuré le 2026-09-01, PR #232).
     Le correctif de ① garde la redirection iOS-autre-navigateur par
     `location.origin === 'https://passio-app.netlify.app'`. Or Netlify sert les
     déploiements de PR et de branche sous un SOUS-DOMAINE —
     `pr-232--passio-app.netlify.app` — donc sous une origine différente : la garde
     ne reconnaissait pas le site, et ramenait en PRODUCTION quelqu'un venu tester
     un aperçu. Le `?passio_preview=…` survivait au voyage et atterrissait sur un
     code qui ne contient pas le lot : on conclut « l'aperçu ne marche pas » alors
     qu'il n'a jamais été chargé. Le prédicat est désormais
     `_estDeploiementPassio()` (`js/platform.js`), qui accepte l'adresse canonique
     ET `*--passio-app.netlify.app`, et il garde AUSSI l'`intent://` de Firefox
     Android, qui avait exactement le même défaut. ⚠️ L'ancre `$` de sa regex n'est
     pas cosmétique : sans elle, `mechant--passio-app.netlify.app.attaquant.fr`
     serait accepté. Éprouvé sur huit hôtes, dont trois usurpations de suffixe.
  **Angle mort structurel confirmé :** `tests/e2e/app-helper.js` pose le jeton du gate
  AVANT la navigation, donc **aucune suite n'exerce la fenêtre « gate affiché,
  application absente »** — celle où ①, ② et ③ se produisent. Un vert e2e n'infirme
  jamais ces cinq causes. ⑤ y échappe pour une autre raison : la suite tourne sur
  `127.0.0.1`, donc aucun test ne peut porter un hôte `*--passio-app.netlify.app`.

  **Lots UI-4A4, UI-5, UI-6, UI-6A et UI-6B (2026-08-28) — tous ACTIFS PAR DÉFAUT**, chacun
  coupable seul (`localStorage.passio_ui_4a4|5|6|6a|6b = "0"`, ou le `window.PASSIO_UI_*`
  correspondant à `false`). Aucune valeur positive n'active, rien n'est écrit dans
  `localStorage`.
  - **UI-4A4** — « Rencontrer » a trois cases (Liste · Carte · Outils) et les quatre
    intentions quittent la tête pour le panneau. `js/ui-v4a4-outils.js`, tests
    `ui-v4a4-outils.spec.js`. ⚠️ Dans le panneau, les intentions sont **RECONSTRUITES**
    par UI-4A0 (`PassioUIV4A0.renderIntentsInto`), jamais déménagées : `#ctxToolsBody` est
    réécrit en entier à chaque rendu, que le clic sur une intention déclenche justement —
    une chip déplacée serait arrachée **par son propre clic**. Règle inverse pour
    `#irlToolsBtn`, qui est *déplacé* : le reconstruire ferait écrire `_updateIrlFiltersBtn`
    dans une pastille invisible. Et « Outils » **n'est pas un onglet** (il ouvre un
    dialogue) : il garde son rôle de bouton et se place *à côté* du groupe `role="tab"`.
    ⚠️ La refonte du panneau `.ctx-*` est bornée à `max-width: 1023px` : non bornée, elle
    décollait le **rail latéral** du bord droit au-delà de 1024 px, en silence. Et elle
    centre par `margin-inline: auto`, jamais par `translateX(-50%)` — `transform` est déjà
    occupée par l'animation d'ouverture.
  - **UI-5** — bobines connectées au réel. `js/ui-v5-bobines.js`. Toute sortie **ferme le
    lecteur d'abord** ; « Ça m'intéresse » écrit un signal durable dans
    `state.user.passionSignals`, lu par `feedPostScore`.
  - **UI-6 (§9)** — le composer ne demande plus de choisir un format. `js/ui-v6-composer.js`.
    ⚠️ **Le piège qui décide de tout** : `studioType` est la SEULE source de vérité de ce qui
    est publié — `publishPost` type le post et remplit `image`/`video` d'après elle, jamais
    d'après le média réellement attaché. Masquer les onglets sans rien d'autre publierait un
    post « texte » avec la photo perdue **EN SILENCE**. Le bouton média unique se contente
    donc de déclencher `#photoInput` / `#videoInput`, dont les gestionnaires **existants**
    fixent déjà `studioType`. §11 au passage : « +10 pts » quitte le bouton et
    `.profile-chips-row` est masquée — seul l'AFFICHAGE change, `grantReward` tourne toujours.
  - **UI-6A (§10)** — inbox Messages : titre, « + » groupant les deux gestes, recherche
    dessous, Passio devant l'aperçu. `js/ui-v6a-messages.js`. ⚠️ `renderMessages()` repart de
    zéro (`innerHTML`) à chaque envoi, réception et frappe, et **sort tôt** quand l'écran
    n'est pas actif : la décoration passe par un MutationObserver + signature par carte.
  - **UI-6B (§11)** — profil : le point d'édition, « Mes Passio », et surtout **Actif / Activer**.
    `js/ui-v6b-profil.js`. ⚠️ Ce lot répare un défaut réel : `switchToProfile()` — la seule
    fonction qui change l'identité active — était **définie et appelée par personne**, un clic
    sur une carte de profil n'agissant que sur le filtre d'affichage (`toggleProfileSelect`).
    D'où deux conséquences : le bouton « Activer » est ce chaînon manquant, et son clic
    **doit stopper sa propagation**, sinon activer une identité basculerait aussi ce filtre.
    ⚠️ **Amendement du 2026-08-29, sur ordre de Benjamin (« un petit onglet très discret,
    crayon, en haut à droite »)** : le bouton « Modifier » pleine largeur posé sous les
    statistiques est devenu un **crayon** (`#v6bModifier`, icône seule) ancré au coin haut
    droit de `#mainProfileCover`. Trois choses à savoir avant d'y toucher. ① Le moteur ne
    change pas : le crayon appelle toujours `openMainProfileMenu`, avec ses quatre entrées.
    ② Le « ⋯ » historique occupait **exactement ce coin** et ouvrait **ce même menu** — deux
    boutons identiques côte à côte : il est donc **masqué en CSS** (`:root.passio-ui-6b
    #screen-profiles .profile-dots-btn.on-cover { display: none }`), jamais retiré du DOM,
    de sorte que le kill switch le rende. ③ Le rond VISIBLE fait 30 px mais la cible tactile
    se mesure sur la **boîte** du bouton : celui-ci garde ses 44 px et c'est un `::before` en
    `inset: 7px` qui peint la pastille — même patron que la pastille d'UI-3A.
  ⚠️ **Trois règles communes à ces modules**, payées à l'écriture : ① un **verrou de coupure**
  dans la fonction de décoration (`if (!actif()) return;`) — un rendez-vous armé AVANT la
  coupure survit à l'arrêt de l'observateur et reconstruit la surface juste après sa dépose,
  le kill switch paraissant sans effet ; ② rendre des nœuds dans un hôte encore **détaché**
  les laisse invisibles aux synchronisations qui balaient le document ; ③ `photoDataUrl`,
  `studioType`, `irlPassionFilters`… sont des `let` de **portée script** : ils existent comme
  identifiants globaux mais **ne sont pas** des propriétés de `window` — `window.studioType`
  vaut toujours `undefined`, et un test qui l'interroge expire sans rien prouver.

  **Lot UI-7 — cohérence des interfaces (2026-08-28), ACTIF PAR DÉFAUT.**
  `js/ui-v7-lot.js` + bloc « PASSIO UI V7 » en fin de `styles.css`, tests
  `tests/e2e/ui-v7-lot.spec.js` et `tests/e2e/ui-v7-bobine-camera.spec.js`.
  Coupure unique : `localStorage.passio_ui_7="0"` ou `window.PASSIO_UI_7=false`.
  Périmètre : ① **vocabulaire visible** (« Mes passions », « Ajouter une passion »,
  « Passion : X », « Filtres » à la place d'« Outils » sur Rencontrer, « Mes inscriptions »,
  « Options », « Changer de profil ») — les **identifiants** (`data-intent`, `data-tab`,
  `data-irlfilter`) ne bougent pas ; ② **Rencontrer** : « Détails », « Je viens » →
  « Inscrit ✓ », ligne « N participants · N places restantes » **calculée**, passion
  abrégée à l'affichage seul (`libelleCourt`, « Yoga » et non « Yoga / Bien-être »),
  « Choisir une ville » et un geste explicite `useMyPositionForIrl()` — toujours **aucun
  GPS automatique** ; ③ **Fil** : les passions et les stories sont réduites d'environ
  −25 % — ⚠️ **rectifié le 2026-08-29 sur demande de Benjamin** (« remets les profils du
  fil comme avant, en bulle mais plus petite ») : ce lot les avait transformées en
  pastilles « emoji + libellé » revenant à la ligne, avec un bouton « Autres ». Elles
  redeviennent des **bulles** (vignette photo ronde + pastille emoji + libellé dessous)
  dans une rangée qui **défile horizontalement**, avec une vignette de 34 px au lieu de
  46. C'est du CSS SEUL (`:root.passio-ui-7 #screen-feed .profile-tile*`) : le bouton
  « Autres » et son mécanisme JS ont été supprimés, `renderProfileStrip` n'est pas touché,
  et couper le lot rend les 46 px d'origine — ce que la suite vérifie. Aussi :
  intentions renommées **Tous · Explorer · Apprendre · Idées · Rencontrer** ; ④ l'icône
  **Messages quitte la barre supérieure** (`#msgDot` reste dans le DOM, masqué —
  `renderMsgBadge` continue d'y écrire) ; ⑥ **Profil** à trois onglets nommés
  (Publications · Activités · À propos), les cinq onglets d'icônes redevenant des
  sous-filtres ; ⑧ **Bobine** : après l'aperçu, « Recommencer » / « Continuer », puis une
  feuille légère (description · passion · couverture · activité facultative) qui
  renseigne `meState.details` et appelle `mePublish()` — **aucun second moteur de
  publication**.
  ⚠️ **Six pièges de ce lot.** ① `renderProfileStrip` réécrit `#profileStrip` **en
  entier** (cache `_lastHtml` compris) : rien d'injecté dans la rangée n'y survit, tout
  ajout doit être posé en **frère** — c'est pourquoi la compacité des passions passe
  aujourd'hui par le CSS seul. Corollaire de mesure : `.profile-tile-avatar` porte
  `transition: all 0.25s`, donc une largeur relevée dans la foulée d'un changement de
  drapeau est encore à mi-course (piège vécu en écrivant le test du kill switch). ② Au Profil, c'est l'**ORDRE d'origine de l'écran** qui est mémorisé, pas le
  « frère suivant » de chaque bloc — ce frère déménage lui aussi, et rendre un bloc
  « avant lui » restituait un ordre inventé. ③ ~~Le bloc CSS UI-7 vient **après** les règles
  de repli au défilement, à spécificité **égale** : sans réécrire
  `.app-main.chrome-collapsed …` dans le bloc, l'en-tête du fil cessait de se replier.~~
  **CADUC depuis le 2026-08-29 : le repli au défilement a été RETIRÉ** (voir ci-dessous).
  ④ Les intentions sont en `flex: 1 1 auto` et non `1 1 0` : à colonnes égales,
  « Rencontrer » et « Apprendre » se faisaient couper pendant que « Tous » laissait du vide.
  ⑤ `renderProfileEvents` listait `state.seed.events.slice(0,3)` — le contenu de
  démonstration — sous le titre « Événements participés » : la section ne montrait donc
  **jamais** une participation. Elle lit désormais `allEvents()` + `_isMyEvent` + `myRsvp`
  (`_myProfileEventsHTML`, app-06). ⑥ `styles.css` est en **CRLF** : une réécriture du
  fichier en mode texte Python le convertit en LF et produit un diff de 10 800 lignes —
  n'y écrire qu'en **binaire**, ou en ajout.

  ⑦ **Un TITRE n'est pas un identifiant d'écran.** `ui-v4a4-outils.js` décidait
  s'il devait injecter les quatre intentions en cherchant « IRL » dans
  `#ctxToolsTitle`. Renommer ce titre en « Filtres » a suffi à faire disparaître
  toute la section — sans erreur, sans test rouge ailleurs, sans rien dans la
  console. `ContextualTools` publie désormais l'écran courant comme une DONNÉE :
  `ContextualTools.pageType()` et `#ctxToolsRoot[data-ctx-page]`. Même famille de
  piège pour l'aide contextuelle : `montrerHint` refuse une cible sans
  `offsetParent`, donc déplacer une ancre dans un panneau masqué éteint l'aide en
  silence — l'ancre de « second_profil » retombe sur l'onglet « À propos ».

  **Lot UI-4A5 — « Filtres » est une VUE de Rencontrer (2026-08-29), ACTIF PAR DÉFAUT.**
  `js/ui-v4a5-filtres.js` + bloc « PASSIO UI V4 — lot UI-4A5 » en fin de `styles.css`,
  tests `tests/e2e/ui-v4a5-filtres.spec.js` (11). Coupure unique :
  `localStorage.passio_ui_4a5="0"` ou `window.PASSIO_UI_4A5=false`. Demandé par Benjamin
  après essai réel : « les bulles de profil dans le filtre, et l'onglet Filtres fait comme
  pour Liste et Carte : quand on clique dessus tu n'ouvres plus un panel mais tu affiches
  dessous tous les choix. » La troisième case cesse donc d'ouvrir un dialogue et devient
  une **troisième vue exclusive** : la liste passe la main, et tout le choix s'affiche en
  ligne — bulles de passion, quatre intentions, ville, « Mes événements / Mes inscriptions »,
  puis le calendrier, le curseur de distance et la plage horaire. Le pied porte
  « Tout effacer » et « Voir les N événements », qui ramène à la liste.
  **Aucun moteur n'est écrit ici** : `#irlPassionRow` et les volets `.irl-ftabs` /
  `#irlPane*` sont DÉPLACÉS (les moteurs les retrouvent par leur `id` et continuent d'y
  écrire à chaque `renderIRL`), les intentions sont construites par
  `PassioUIV4A0.renderIntentsInto`, et les items ville/mes-événements sont rendus par la
  nouvelle `ContextualTools.renderInto(hôte, config)` — même `itemHtml`, même échappement,
  même délégation `[data-irlfilter]`.
  ⚠️ **Six pièges de ce lot.** ① Le clic est intercepté en phase de **CAPTURE** sur
  `document` avec `stopPropagation()` : c'est le SEUL moyen de neutraliser l'`onclick`
  inline `ContextualTools.open('irl', this)` sans le retirer — un écouteur posé sur le
  bouton lui-même s'exécuterait APRÈS l'attribut, l'ordre en phase « at target » étant
  celui de l'enregistrement. L'attribut reste intact et redevient actif à la coupure.
  ② Le **calendrier n'était peint qu'à l'ouverture** de `#irlFiltersPanel`, que ce lot ne
  passe plus jamais : sans un appel explicite à `_renderIrlInlineCal()` à l'ouverture de
  la vue, le volet Date s'affiche VIDE, sans erreur ni test rouge ailleurs. ③ Les sections
  d'`irlToolsSections()` portent désormais un `id` (`ville`/`affiner`/`miens`) et le lot
  retire « affiner » par cet **identifiant**, jamais par son titre — filtrer sur un
  libellé, c'est le piège d'UI-4A4 (renommer « Outils · IRL » en « Filtres » avait fait
  disparaître une section entière, en silence). ④ La sélection des onglets se dispute avec
  UI-4A3, qui repose `aria-selected` à chaque rendu : on le **ré-aligne** après coup et
  seulement quand la valeur diffère. UI-4A3 n'observe que les enfants directs de
  `#screen-irl` et jamais les attributs — aucune de ces écritures ne le réveille, donc
  aucun aller-retour. ⑤ Le panneau est **masqué, jamais retiré**, parce qu'il héberge des
  nœuds déplacés dans lesquels le moteur continue d'écrire ; et la coupure **restitue
  avant de supprimer**, sinon la suppression les emporterait. ⑥ Ce lot **réécrit deux
  règles d'UI-7 (§2)**, qui donnaient volontairement à « Filtres » une allure différente
  parce qu'elle ouvrait un dialogue : elle redevient une case à égalité de largeur, sans
  séparateur. Les sélecteurs gagnent par la position — le bloc UI-4A5 doit rester le
  DERNIER de `styles.css`.
  Convention de test appliquée : `contextual-nav`, `irl`, `ui-v4a2-cartes`, `ui-v4a3-vue`,
  `ui-v4a4-outils` et `ui-v7-lot` posent au boot `passio_ui_4a5="0"` et gardent TOUTES
  leurs assertions ; la cohabitation est prouvée à part.

  **⚠️ La vue Carte s'affiche SOUS les onglets (2026-08-30), dans `js/ui-v4a3-vue.js`.**
  Demandé par Benjamin après essai réel : « quand je clique sur Carte je voudrais qu'elle
  apparaisse dessous les trois onglets, comme quand je clique sur Liste — le même effet
  sur les trois clics. » Dans le balisage historique, `#irlMapWrap` précède la liste de
  très haut (juste sous `.irl-actionbar`) alors que le commutateur se pose au ras de
  `#eventList` : la carte s'affichait donc AU-DESSUS des onglets, quand la liste et la
  vue Filtres s'affichent dessous — trois cases, deux comportements. La vue Carte
  **DÉPLACE** donc le nœud juste avant `#eventList`, et le rend à sa place d'origine dès
  qu'on quitte la vue ou que le drapeau tombe.
  ⚠️ Quatre points à connaître avant d'y toucher. ① Le nœud est **déplacé, jamais
  recréé** : le moteur Leaflet vit dans `#irlMap`, et `initIrlMap()` ne réinitialise pas
  deux fois — le reconstruire donnerait une carte blanche. On redemande seulement un
  `invalidateSize()` après le déplacement (`irlMap` est un `let` de portée script, absent
  de `window` et en zone morte tant qu'app-07 n'a pas tourné : le `typeof` doit être DANS
  un `try`). ② La destination est `#eventList`, **jamais `barre.nextSibling`** : UI-4A5 y
  pose son panneau et l'y REMET après chaque rendu — deux modules sur le même point
  d'ancrage se renverraient la balle, chacun réveillant l'observateur de l'autre. L'ordre
  obtenu est `v4a3Vue > v4a5Panneau > irlMapWrap > eventList`. ③ `poserBarre()` ne vise
  plus la liste mais une **ancre** (`ancreBarre()`) : sans elle, une barre reconstruite
  après un rendu se serait insérée SOUS la carte déplacée. Le ré-alignement n'écrit que
  si l'ancre est passée devant la barre — une écriture inconditionnelle réveillerait les
  deux observateurs à chaque rendu. ④ La restitution mémorise **les deux voisins** : le
  suivant (`#irlPassionRow`) peut avoir déménagé dans le panneau d'UI-4A5 au moment de
  rendre la carte, et ne retenir que lui la reléguait en FIN d'écran, sous la liste ; le
  précédent (`.irl-actionbar`) sert alors de repère. Verrous : `ui-v4a3-vue.spec.js`
  (« la carte s'affiche SOUS les onglets », éprouvé par mutation — neutraliser le
  déplacement le fait rougir) et `ui-v4a5-filtres.spec.js` (« cohabitation avec la vue
  Carte : chacun son ancrage, aucun va-et-vient »).

  **Moods du Studio alignés sur le rail d'intentions (2026-08-29), ACTIF, sans drapeau.**
  Le composer proposait encore les quatre moods d'origine — Création · Apprentissage ·
  Chill · Actu — alors que le Fil lit désormais Tous · Explorer · Apprendre · Idées ·
  Rencontrer : on publiait dans un vocabulaire, on lisait dans un autre. La rangée
  `#postMoodRow` (repli « Options » du composer UI-6) porte maintenant **💡 Idées ·
  📚 Apprendre · 🤝 Rencontrer · ✨ Tous**. Tests : `tests/e2e/studio-moods.spec.js` (8).
  ⚠️ **Les LIBELLÉS changent, les VALEURS non** : `creation`, `learn`, `irl`, `all` sont
  écrites dans `posts.mood` et relues par `legacyMoodToFeedIntent` — renommer une valeur
  ferait perdre son classement à toute publication existante, et `publishPost` n'appelle
  `bumpQuest("publish")` que sur `creation`, qui reste donc le défaut (la quête `q1`
  s'arrêterait en silence sinon).
  ⚠️ **« Rencontrer » (`irl`) n'était choisissable NULLE PART avant ce lot** :
  `legacyMoodToFeedIntent` savait le traduire en `meet` et le fil savait l'afficher, mais
  aucune pastille ne le produisait — le bonus d'intention « Rencontrer » était donc
  structurellement inatteignable pour un contenu publié depuis l'app.
  ⚠️ **Pas de pastille « Explorer », délibérément** : cette intention se calcule côté
  LECTEUR dans `rankFeedPostsForIntent` (auteur non suivi, passion inconnue) et ne regarde
  jamais le mood. Une pastille y serait purement décorative — le piège ③ du lot UI-5.
  ⚠️ **Une seule table de libellés désormais**, `PASSIO_MOOD_LABELS` + `moodTagLabel()` /
  `moodShortLabel()` (app-02). Les deux copies locales avaient DIVERGÉ : le fil connaissait
  « irl » mais pas « actu » (tous les posts d'actualité du seed sortaient avec une étiquette
  VIDE), les bobines l'inverse (« irl » y sortait « Tout »). `all` reste hors table à
  dessein — le neutre ne porte aucun badge, sinon tous les posts venus de Supabase, qui
  retombent sur `mood: "all"`, en recevraient un.
  ⚠️ **Le chemin historique n'est PAS touché** : sous le kill switch des intentions
  (`passio_feed_intents_v1="0"`), `#moodSelector` garde ses quatre pastilles d'origine et
  `_moodVisible` son comportement à l'octet près — un post `irl` y reste invisible, comme
  avant, et le test « ancien filtre mood inchangé » de `feed-intents.spec.js` continue de
  l'exiger. Conséquence assumée : un « Rencontrer » publié aujourd'hui disparaît de la vue
  de son auteur s'il coupe les intentions. Élargir `_moodVisible` aux moods sans pastille
  était le correctif naturel — il a été écarté parce qu'il change le legacy gelé.
  ⚠️ `chill` et `actu` ne sont plus publiables mais restent affichables (des milliers de
  posts les portent). Un brouillon plus ancien qui en porte un est ramené sur le neutre par
  `normalizeStudioMood` (app-06) : sans elle, `loadDraft` rendait une rangée SANS pastille
  active — état muet, republié en silence.


  **REFONTE MULTI-PASSION (2026-08-31) — ADR-011, SANS DRAPEAU.**
  `.passio/adr/ADR-011-refonte-multi-passion.md`. Elle complète ADR-010 (qu'elle
  ne remet pas en cause : une identité publique, des passions qui classent) et en
  **amende l'interface** sur quatre points. Verrou :
  `tests/e2e/refonte-multi-passion.spec.js` (18 cas, les six tests d'acceptation).

  ① **LE FIL EST UNE SÉLECTION ADDITIVE (OU inclusif).** « Suivis », les passions
  et les envies du moment sont trois familles de critères CUMULABLES : une
  publication entre dès qu'elle en satisfait **au moins un**, et cocher l'un
  n'éteint jamais l'autre. Une seule liste, dédupliquée par `p.id`, classée par le
  moteur existant — aucune section par passion, par envie ni par source.
  ⚠️ **Ce que ça défait sciemment.** ADR-010 avait livré deux VUES EXCLUSIVES
  (`state.feedView` = `"accueil"` | `"suivis"`), et toucher une passion depuis
  « Suivis » ramenait en « accueil ». Ce n'était pas un caprice : `renderFeed` ne
  consultait PAS `_activeFeedPassions` en vue « suivis », donc une passion cochée
  y aurait été un CLIC MORT. La refonte supprime la cause — le moteur consulte
  désormais les trois sources — avant de supprimer l'exclusivité.
  ⚠️ **Migration** : `state.feedView` → `state.feedFollowingOn` (booléen persisté).
  Les DEUX anciennes vues se migrent à `true`, car les deux incluaient les comptes
  suivis. C'est ce qui préserve l'acquis d'ADR-010 : suivre quelqu'un garde un
  effet observable et durable. `setFeedView` survit en alias de compatibilité.
  ⚠️ **Les envies deviennent un FILTRE, plus seulement un classement.**
  `#feedIntentSelector` passe en multi-sélection (`state.feedIntents`, `setFeedIntents`,
  `feedIntentsSelected`) et `feedPostMatchesIntent` en fait un critère d'entrée.
  « Tous » (`for_you`) reste le NEUTRE : le cocher revient à tout décocher.
  ⚠️ **Le défaut ne doit pas ÉLARGIR** : `state.feedIntents` démarre VIDE. Le piège
  était `selectedMoods`, qui démarre à `{"creation"}` — en OU, un critère coché
  d'usine aurait ouvert le fil au lieu de le restreindre. Le rail legacy
  (`#moodSelector`, sous kill switch) n'est pas touché : son comportement ET reste
  intact à l'octet près.
  ⚠️ **Le classement est généralisé, pas remplacé** : `rankFeedPostsForIntents`
  retombe EXACTEMENT sur `rankFeedPostsForIntent` à zéro ou une envie ; à
  plusieurs, il retient le MEILLEUR bonus, jamais leur somme. La règle de bonus est
  extraite dans `_feedIntentBonus`, partagée — deux copies auraient divergé.

  ② **LE PROFIL : UN SEUL SÉLECTEUR, DEUX ONGLETS.** Le rail de passions se pose
  EN HAUT, au-dessus des onglets, et réutilise le composant du Fil —
  `passionTileHTML` (app-02), donc les mêmes classes `.profile-tile*`, les mêmes
  dimensions et les mêmes états. **Choix UNIQUE** ici (multi-sélection sur le Fil),
  et il commande les DEUX onglets à la fois (`setProfilePassion` écrit
  `profilePostFilterId` ET `profileEventFilterId`, tenus égaux). Deux onglets
  seulement : **Publications** et **Activité**. Même mécanique sur le profil
  d'autrui, avec une section « Activité » qui montre ce qu'il ORGANISE — jamais ses
  participations, qui ne sont pas chargées pour un tiers.
  **Retirés** : l'onglet et le panneau « À propos », la ligne « Passion active »
  (`#v8ActivePassion`), `openPassionSwitcher`, et les deux rangées de puces
  jumelles (`#v8PostFilter` / `#v8EventFilter`, avec `_passionFilterRowHTML` et
  `_monterFiltrePassion`).
  ⚠️ **La migration à un coup `_v8FiltresMigres` est REPRISE, pas renommée** : elle
  convertit l'ancien `profileFilterIds` multiple. La contourner perdrait le filtre
  des comptes existants, en silence.
  ⚠️ **RETIRER UN ONGLET PEUT FERMER UNE FONCTION.** « À propos » portait la
  gestion des passions (ajouter, illustrer, archiver). Elle vit maintenant dans
  `#passionManager`, panneau replié qu'ouvre l'entrée « Mes passions » du menu
  d'options du profil (`openPassionManager`). Sans cette porte, ajouter une passion
  devenait inatteignable — le défaut exact du Studio après un carnet (2026-08-29).
  ⚠️ `archiverPassion` **rebascule elle-même** `currentProfileId` sur une passion
  vivante : elle exigeait auparavant « choisis d'abord une autre passion active »,
  un geste qui n'existe plus. Le nettoyage vit au point d'ÉCRITURE, jamais à
  l'affichage.

  ③ **L'IDENTITÉ AFFICHÉE EST CENTRALISÉE.** `identitePassionsHTML(u)` /
  `identitePassionsTexte(u)` / `passionsAffichables(u)` (app-02) rendent, sous le
  pseudo, les passions du compte (« Benjamin » / « Moto · Podcast · Voyage »).
  Appliqué aux cartes de publication, au post ouvert, aux commentaires et réponses,
  aux abonnés/abonnements, aux DEUX écrans de recherche, aux notifications, à
  l'inbox Messages, à mon profil et au profil visité. `cacheRemoteProfile` et
  `_resolveProfilesByIds` transportent désormais la colonne `passions`.
  ⚠️ **Trois règles, chacune payée par un défaut réel.** ① `passionsPubliques()` et
  JAMAIS la liste brute : le jsonb `profiles.passions` contient les passions
  ARCHIVÉES (c'est voulu — la colonne sert de sauvegarde), les afficher ferait
  réapparaître chez tout le monde ce qu'un utilisateur a rangé (porte dérobée ② du
  lot UI-8). ② Ces libellés sont du CONTENU D'AUTRUI : `escapeHtml` obligatoire.
  ③ Le rendu est BORNÉ (3 + « +N ») et tronqué en CSS — une identité longue pousse
  hors de l'écran l'action posée à côté d'elle (« Message → », « Voir → »).
  ⚠️ L'inbox Messages n'affiche plus la passion ACTIVE mais TOUTES les passions :
  « Ben · 🏍️ Moto » laissait croire qu'on écrivait « depuis » une passion.

  ④ **LE STUDIO EST LE SEUL POINT DE CHOIX DE LA PASSION DE DESTINATION**, et il
  s'en souvient : `#postPassion` porte un `onchange="onStudioPassionChange()"` qui
  appelle `switchToProfile`. Sans cela, la ligne « Passion active » ayant disparu,
  la passion d'inscription serait devenue un choix définitif. Écriture et lecture
  restent indépendantes (ADR-010 §6) : ça ne touche aucune préférence du fil.
  La carte de passion n'offre plus « Publier dans celle-ci » — elle INDIQUE
  seulement laquelle le Studio présélectionnera.

  ⚠️ **LE GESTIONNAIRE D'UNE BULLE N'EST PAS UNE CHAÎNE LIBRE.** `passionTileHTML`
  prend une `action` (`feedFollowing` | `feedPassion` | `profilePassion` |
  `visitedPassion`) et un `arg` ; `_passionTileOnclick` écrit chaque appel EN
  TOUTES LETTRES. La première version laissait l'appelant fournir l'`onclick`
  entier — `audit:echappement` l'a refusée, à raison : un handler doit se relire à
  l'œil, sans remonter la provenance de la chaîne.

  **RETRAIT DU CARNET DE VOYAGE (§6 de la refonte, ADR-011).** Écran, éditeur,
  viewer plein écran, CDV Lives et leurs étapes, commentaires et réactions
  d'étape, « Mes lieux », passeport, géocodage, liens profonds, 9 abonnements
  temps réel, 32 fonctions Supabase, contenu de démonstration, sous-filtre
  « Carnets » du profil, entrée de navigation, étape du tour, raccourci IA et pont
  IRL↔CDV : tout est retiré. `js/app-03-posts-vlogs.js` passe de 4 879 à ~400
  lignes ; 279 règles CSS partent. **`goTo("cdv")` est REDIRIGÉ vers le fil**,
  comme `goTo("wallet")` après ADR-009 — un ancien lien profond ne doit jamais
  laisser l'application sans écran actif.
  ⚠️ **AUCUNE DONNÉE N'EST DÉTRUITE** : `localStorage["passio_cdv_lives"]`, les
  publications de type `vlog` et les tables `cdv_*` restent intactes, et restent
  dans la publication realtime — on cesse seulement de les écouter.
  ⚠️ **`_kmBetween` RESTE dans app-03** : `app-07` s'en sert pour trier les
  activités par proximité. C'est de la géométrie, pas du voyage. La retirer aurait
  fait retomber toutes les distances à 0 — sans erreur, car l'appel est gardé par
  un `typeof`.
  ⚠️ **LE TYPAGE `vlog` EST CONSERVÉ À LA LECTURE** (`supaLoadPosts`), et c'est une
  garantie de CONFIDENTIALITÉ, pas une survivance : la visibilité d'un carnet
  (« public / abonnés / privé ») vivait dans un blob jsonb, hors de portée de la
  RLS. C'est ce type qui permet à `allFeedPosts` de les écarter TOUS. Le retirer
  ferait retomber un carnet « Privé » sur son type de média et l'afficherait, en
  clair, dans le fil de tout le monde.
  ⚠️ **`closeModal` levait à CHAQUE fermeture** si on oubliait son nettoyage CDV
  (`cdvLiveRefreshInterval`, `removeCdvLiveViewer`) — c'est-à-dire partout. Même
  famille que le `renderTopbar` d'ADR-009 : chercher tout accès à un nœud ou à une
  variable supprimés dans une fonction rappelée en permanence.
  ⚠️ Les badges « voyages / kilomètres / pays » valent désormais zéro. Ils ne sont
  PAS supprimés : ils restent visibles comme non acquis, plutôt que de disparaître
  d'un profil qui les affichait hier.
  Suites retirées : `cdv`, `cdv-deeplink`, `carnet-visibilite`,
  `commentaire-live-id`, `studio-apres-carnet`.

  **Lot UI-8 — « une personne, plusieurs passions » (2026-08-29), ACTIF PAR DÉFAUT.**
  Coupure unique : `localStorage.passio_ui_8="0"` ou `window.PASSIO_UI_8=false`. Le drapeau
  ne sait qu'ENLEVER — aucune valeur positive n'active, rien n'est écrit dans `localStorage`.
  Implémentation dans les moteurs eux-mêmes (`js/app-06-reels-partage.js`, bloc « LOT UI-8 »)
  plutôt que dans un module observateur : ce lot change ce que l'écran SIGNIFIE, pas seulement
  ce qu'il montre. CSS : bloc « PASSIO UI V8 » en fin de `styles.css`. Tests :
  `tests/e2e/ui-v8-passions.spec.js`.
  **Le modèle.** PASSIO ne donne plus l'impression qu'on possède plusieurs COMPTES : un seul
  profil personnel (pseudo, avatar, bio, abonnés) + plusieurs **passions**, univers de contenu
  rattachés à ce même profil. Une seule passion est active pour CRÉER ; consulter se fait par
  des filtres séparés. `currentProfileId` reste la seule source de vérité de l'identité active
  et `switchToProfile()` son seul point d'écriture — la ligne « Passion active », le sélecteur
  (`openPassionSwitcher`) et le bouton « Utiliser pour créer » l'appellent tous les trois.
  **Ce qui bouge.** ① Sous la carte d'identité, une ligne `Passion active : 🏍️ Moto · Changer`
  (`#v8ActivePassion`, rendue par `renderMainProfile` donc rafraîchie à chaque repeint).
  ② « À propos » ne filtre PLUS : la carte n'appelle plus `toggleProfileSelect`, « Réinitialiser »
  disparaît, et chaque carte porte photo/couverture/nom/bio, ses décomptes et son état
  (« Passion active ✓ » ou « Utiliser pour créer »). Le reste de la carte ouvre
  `openEditPassionProfile`. ③ Le filtre de contenu déménage dans « Publications » et devient à
  choix UNIQUE (`state.user.profilePostFilterId`), avec un jumeau dans « Activités »
  (`profileEventFilterId`) ; aucun filtre = « Toutes ». ④ Le Studio annonce
  `Publication dans : 🏍️ Moto · Changer` (le `<select>` `#postPassion` reste le seul moteur :
  choisir une autre passion pour UNE publication ne change pas la passion active). ⑤ Les
  Messages affichent `Ben sur portable · 🏍️ Moto` — pseudo général d'abord, passion en contexte
  gris. ⑥ « Supprimer ce profil » devient « Archiver cette passion ».
  ⚠️ **Sept points à connaître avant d'y toucher.**
  ① **La suppression effaçait aussi les posts.** `deleteProfile` filtrait `state.userPosts` sur
  `profileId` : perdre une passion, c'était perdre son contenu. L'archivage ne retire RIEN — la
  passion reste dans `state.user.profiles` avec `archived:true`, ses publications restent
  visibles dans « Toutes ». **Aucune migration Supabase** : le drapeau voyage dans le blob
  `user_state`. La fusion défensive d'app-02 le ré-injecte quand le serveur n'en a AUCUN
  (`=== undefined`), jamais quand il en porte un — sinon une restauration serveur serait annulée
  par un vieil état local. Le quota (`isNextProfilePaid`) compte toujours `profiles.length` :
  archiver ne libère pas d'emplacement payant, et c'est voulu.
  ② **La migration de l'ancien état n'efface jamais `profileFilterIds`.** Exactement une valeur
  encore valide devient le filtre unique ; vide ou multiple retombe sur « Toutes ». Elle ne
  tourne qu'une fois (`_v8FiltresMigres`), et un filtre qui désigne une passion disparue ou
  archivée retombe sur « Toutes » plutôt que de vider l'écran sans explication.
  ③ **La rangée de filtre est montée PAR RAPPORT au bloc qu'elle commande**
  (`insertBefore(rangee, #myPosts)`), jamais à une position fixe de l'écran : sous le lot UI-7,
  `#myPosts` et `#profileEvents` vivent dans des panneaux d'onglet, et une rangée posée « en
  haut de l'écran » sortirait du panneau — visible, mais sous le mauvais onglet.
  ④ **Deux modules ne peuvent pas écrire la même carte.** UI-6B posait « Actif »/« Activer » par
  MutationObserver en lisant l'`onclick` de la carte (`idDeCarte` cherche `toggleProfileSelect`).
  Sous UI-8 cet `onclick` n'existe plus et l'état est rendu par `renderProfilesScreen` :
  `cartesReprisesParV8()` rend donc la surface à app-06 (même famille de garde que
  `ficheReprisParV4b` au lot UI-4B). UI-6B garde « Modifier » et le renommage de section.
  ⑤ **`_myProfileEvents(9999)` est l'appel de COMPTAGE**, et il n'est volontairement pas soumis
  au filtre d'affichage : les cartes doivent annoncer le total d'une passion, pas ce que le
  filtre courant laisse passer.
  ⑥ **Le Studio publiait « en tant que » la mauvaise identité.** `identiteCourante()`
  (ui-v6-composer) lisait `currentProfile().name` — le nom porté par la passion — alors que
  `publishPost` envoie `state.user.general.username`. Ce n'était pas une nuance de vocabulaire :
  l'écran annonçait un expéditeur qui n'était pas celui du post.
  ⑦ **Un `onclick` construit par concaténation d'un identifiant de fonction VARIABLE est refusé
  par `audit:echappement`**, et il a raison : la relecture d'un handler doit se faire à l'œil.
  Chaque branche de `_passionFilterRowHTML` écrit son appel en toutes lettres, avec
  `escapeJsArg` inline dans l'attribut.
  ⚠️ **Six PORTES DÉROBÉES trouvées par l'audit du lot, toutes fermées — et toutes couvertes par
  un test.** Elles ne rendaient pas le lot imparfait, elles le rendaient FAUX : « archiver ne
  supprime rien » ne tenait pas.
  ① `openEditPassionProfile` gardait « 🗑 Supprimer ce profil » — or c'est cette modale que la
  nouvelle carte ouvre sur TOUTE sa surface : la suppression destructrice se retrouvait à deux
  taps, plus près qu'avant le lot. Elle devient « Archiver cette passion » sous UI-8.
  ② `supaUpsertProfile` publiait `state.user.profiles` EN ENTIER dans le profil public : ranger
  une passion la laissait visible chez tous les autres comptes. Seule conséquence hors appareil
  du lot, et rien ne la filtrait.
  ③ `archiverPassion` ne nettoyait pas `_activeFeedPassions` alors que `renderProfileStrip` ne
  rend plus que les vivantes : la tuile disparaissait, le filtre restait. Si c'était la seule
  sélectionnée, le Fil ne montrait plus QUE la passion rangée, sans commande pour en sortir.
  ④ Le paywall barrait la RESTAURATION : `openCreateProfile` ouvrait `openProfilePaywall()` avant
  la grille dès `profiles.length >= 3` (archivées comprises, ce qui est voulu), et la passion
  rangée n'apparaissait ni dans la liste ni dans le catalogue. Un compte à la limite gratuite se
  voyait réclamer 150 💎 pour une passion qu'il possède déjà et ne voit plus. Le quota est
  inchangé ; c'est le CHEMIN qui s'ouvre — et choisir une passion archivée la RESTAURE au lieu
  d'en créer une seconde (`confirmCreateProfile`, avant le re-test du paywall).
  ⑤ `ui-v7-lot.js` (`remplirPassions`, feuille de bobine) proposait encore de publier dans une
  passion archivée, là où `renderStudio` les excluait : deux composeurs, deux réponses à « où
  puis-je publier ? ».
  ⑥ `deleteProfile` (chemin historique) repliait `currentProfileId` sur `profiles[0]`, qui peut
  être ARCHIVÉE — un état que tout le lot suppose impossible.
  ⚠️ **Et la coupure doit rendre les MOTS aussi.** Le vocabulaire du composer
  (« Publication dans : … · Changer ») et la ligne d'identité des Messages sont gouvernés par le
  même drapeau `passio_ui_8` : un kill switch qui laisse les libellés du nouveau lot n'est pas un
  kill switch. Corollaire de test : `ui-v6-composer.spec.js` et `ui-v7-lot.spec.js` observent ces
  mots d'avant, ils posent donc `localStorage.passio_ui_8="0"` au boot et gardent TOUTES leurs
  assertions — comme `ui-v6b-profil.spec.js`. Seule exception non gouvernée par le drapeau :
  `identiteCourante()`, qui est une correction de défaut (le Studio annonçait un expéditeur qui
  n'était pas celui du post), pas un choix de lot.
  Convention de test appliquée, la même qu'aux mises en ligne d'UI-3A et d'UI-4 :
  `ui-v6b-profil.spec.js` observe le comportement historique de la carte, il pose donc
  `localStorage.passio_ui_8="0"` au boot et garde TOUTES ses assertions ; la cohabitation des
  deux lots est prouvée à part dans `ui-v8-passions.spec.js`.

  ⚠️ **Ordre des blocs dans `styles.css` (fusion UI-4A5 × UI-8, 2026-08-29).** Le lot UI-4A5
  énonce que son bloc doit rester le DERNIER de la feuille — ses sélecteurs gagnent par la
  position. Le bloc « PASSIO UI V8 » est donc posé JUSTE AVANT lui, pas à la fin. Les deux
  sont ancrés sur des familles disjointes (`.v8-*` d'un côté, `:root.passio-ui-4a5` de
  l'autre), donc rien ne se recouvre ; l'ordre ne sert qu'à honorer cette contrainte. Piège
  payé à la résolution : les deux blocs se terminaient par une `@media` dont l'accolade
  fermante était la ligne COMMUNE d'après le marqueur de conflit — concaténés tels quels,
  le `@media` du premier englobait tout le second, en silence et sans CSS invalide.

  **⚠️ En-tête du fil : plus de repli au défilement (2026-08-29).** Les passions
  (`.profile-strip`), les moods (`.mood-selector` — la rangée AFFICHÉE est
  `#feedIntentSelector`, l'historique `#moodSelector` restant `hidden`) et les stories
  (`.stories-row`) restent visibles en permanence. La bascule `.chrome-collapsed`
  (écouteur de défilement en fin d'`app-09`, règles en fin de `styles.css`) a été
  **supprimée**, code et CSS : sur ordre de Benjamin, après le défaut vécu « je descends
  puis je remonte, les profils et les moods ne s'affichent plus ». Cause identifiée et
  documentée dans `app-09` : le garde anti-oscillation du 2026-08-28 n'était relâché que
  par **deux événements de défilement consécutifs à la même position**, condition qu'un
  geste tactile ne remplit pas à la fin d'un mouvement — une fois replié, l'en-tête ne se
  rouvrait plus. Corriger le seuil aurait ramené l'oscillation (replier déplace
  `scrollTop`, l'ancrage de Chrome compense mal) : les deux exigences étaient
  contradictoires, on a retiré la bascule. Effet de bord bienvenu : plus aucune transition
  `max-height` ne tourne au-dessus de `#feedList` pendant le défilement — c'est ce
  mouvement sub-pixel qui faisait refuser des clics à Playwright (« element is not
  stable », cf. `tests/e2e/interactions.spec.js`). Non-régression :
  `tests/e2e/entete-fil-permanent.spec.js` (remplace `entete-fil-oscillation.spec.js`),
  vérifiée rouge sur l'ancien code avant d'être verte sur le nouveau.

  **⚠️ Les moods ne se lisent plus dans le DOM d'un rail MASQUÉ (2026-08-29, PR #198).**
  Deux défauts de la même famille, trouvés en consolidant une branche doublon. Racine
  commune : une décision de **rendu** et une décision de **classement** s'appuyaient sur
  le DOM de `#moodSelector`, que le lot UI-7 a masqué au profit de `#feedIntentSelector`.
  ① La pastille de mood dessinait une **capsule vide** : `<span class="post-mood-tag">`
  était rendu SANS condition alors que `moodTagLabel()` rend `""` pour le neutre, pour un
  mood inconnu et pour un mood absent. La classe portant `padding: 3px 9px`, `border: 1px`
  et un fond opaque, le résultat était une capsule creuse — **mesurée à 20 × 8 px**, pas
  déduite du CSS. Tous les posts venus de Supabase retombent sur `mood: "all"` : ils en
  portaient donc **tous** une. L'intention documentée était pourtant la bonne (« le neutre
  ne porte aucun badge ») ; seul le rendu la trahissait. `_moodTagHTML(mood)` rend la
  pastille, ou rien — **ne jamais réintroduire un `<span>` de mood sans condition**.
  ② Le **repli d'exploration** (« voici ce qui vit ailleurs », servi quand les passions
  suivies n'ont rien) construisait sa liste de moods admis en lisant les BOUTONS de
  `#moodSelector`. Or `irl` n'y a **jamais** eu de bouton : une publication « Rencontrer »
  venue d'une passion non suivie en était exclue. Portée exacte, à ne pas surestimer —
  elle restait visible dans sa propre passion, ce n'était pas « invisible partout » ; mais
  elle n'atteignait personne d'autre, soit exactement les gens qu'une invitation à se
  rencontrer vise. Le défaut n'était **pas atteignable avant #194**, qui a rendu
  « Rencontrer » choisissable dans le composer le matin même. La source de vérité est
  désormais `PASSIO_MOOD_LABELS`, qui reste une liste **BLANCHE** : un mood inconnu venu
  d'un client tiers n'entre toujours pas. Verrous : `tests/e2e/pastille-mood.spec.js` (3)
  et `tests/e2e/exploration-moods.spec.js` (4), éprouvés par mutation — rendre la source
  de vérité au DOM, ou la pastille sans condition, fait rougir 3 tests.

  **⚠️ Fenêtrage du Fil — `feed_window_v1`, COUPÉ par défaut (2026-08-29, PR #157).**
  Le fil ne monte plus toutes ses cartes : celles hors fenêtre sont déshydratées (contenu
  retiré, hauteur intrinsèque conservée) et réhydratées à l'approche. Moteur dans `app-02`
  (`feedWindowHydrate`, `feedWindowTeardown`, `feedWindowRememberScroll`,
  `feedWindowRestoreScroll`), suite `tests/e2e/feed-window.spec.js` (24).
  ⚠️ **Le piège qui décide de tout : réhydrater REMPLACE `card.innerHTML`.** Tout ce qu'un
  autre lot a injecté DANS la carte après rendu disparaît — la passerelle UI-3
  `[data-v3-bridge]` la première — alors que les marqueurs posés sur l'ÉLÉMENT
  (`data-v3-decore`) survivent. Et l'observateur d'UI-3 n'écoute `#feedList` qu'en
  `childList` **sans `subtree`** : remplacer le contenu d'une carte ne le réveille pas.
  La carte se retrouvait donc avec la porte neuve retirée ET l'ancienne toujours masquée
  par la règle liée à `data-v3-decore` — soit **aucune** porte vers l'IRL.
  `_feedWindowRedecorer(card)` retire les marqueurs devenus incohérents puis rappelle
  `PassioUIV3.decorateFeed()`, à la **seule sortie commune** de toutes les réhydratations
  (observateur, coupure du drapeau, redimensionnement). Son `catch` journalise par
  `diagLog` : un `catch` muet sur un chemin de rendu a déjà coûté six jours de fil vide.
  **Tout futur décorateur de carte doit être rebranché là**, sinon il disparaîtra au
  premier défilement.
  ⚠️ `window._feedScrollRestoring` n'a plus de consommateur en production depuis que #196
  a supprimé l'en-tête rétractable qu'il neutralisait. Il SURVIT à dessein : il marque
  « une restauration est en cours » et un test vérifie qu'il est bien relâché, ce qui
  prouve que la restauration se termine et ne fuit pas. Ne pas le retirer sans retirer
  aussi cette assertion.

  **⚠️ Cinq défauts trouvés par audit adversarial après les treize lots du 2026-08-29.**
  Tous étaient EN PRODUCTION, tous ont été mesurés avant correction et éprouvés par
  mutation. Ils partagent une famille : **une règle ou un test qui survit à la
  disparition de sa cible**.

  ① **`HTMLElement.click()` sur un input remonte jusqu'à son conteneur.** La pastille
  📷 d'une carte de passion faisait `event.stopPropagation()` puis `input.click()` —
  mais ce `stopPropagation` ne concerne que le clic SUR LA PASTILLE : `.click()`
  dispatche un NOUVEL événement, qui part de l'input (descendant de la carte) et
  remonte à son `onclick`. Une seule tape ouvrait donc le sélecteur de fichier ET la
  modale d'édition. Le garde est posé sur l'**input** (`onclick="event.stopPropagation()"`),
  jamais sur la pastille : le menu « Options » déclenche le même `input.click()`.
  ⚠️ `#mainProfileAvatar` porte le motif identique et n'a PAS ce défaut — son `onclick`
  rappelle `input.click()`, et le *click in progress flag* de la spécification HTML
  arrête la récursion. Ne pas le « corriger ». Verrou : `carte-passion-photo.spec.js`.

  ② **`v()` du formulaire d'activité ÉCHAPPE DÉJÀ — ne jamais le ré-envelopper.**
  Dix de ses onze appels faisaient `escapeHtml(v("champ"))`. Mesuré : « Café d'Or »
  s'affichait « Café d&#39;Or ». Et ce n'était pas qu'un défaut d'affichage — ces
  valeurs sont celles que « Enregistrer » PERSISTE, donc la corruption s'aggravait à
  chaque édition (`&#39;` puis `&amp;#39;`). Le textarea `evDesc` était le seul appel
  correct. ⚠️ Retirer un `escapeHtml` demande de prouver qu'on n'ouvre pas une sortie
  d'attribut : `escapeHtml` échappe `& < > " '`, donc un seul passage suffit pour un
  `value="…"`. Le test le vérifie sur une charge réelle, pas par raisonnement.
  Verrou : `edition-activite-echappement.spec.js`.

  ③ **« Mes passions » doit dire la même chose partout.** `_irlMyPassions()` (app-07)
  mappait `state.user.profiles` en entier, archivées comprises, alors que le Fil rend
  `passionsVivantes()`. Après un archivage : Fil `["musique"]`, Rencontrer
  `["musique","cuisine"]`. Verrou : `irl-passion-archivee.spec.js`.

  ④ **La passion ACTIVE ne doit jamais être archivée — et le nettoyage appartient aux
  points d'ÉCRITURE.** `currentProfile()` rend `null` pour une passion archivée et son
  commentaire dit pourquoi il ne réécrit rien. `archiverPassion` et `deleteProfile`
  nettoient déjà ; `supaLoadUserState` restaurait `currentProfileId` sur le seul test
  « toujours dans la liste fusionnée » — or une passion archivée sur un AUTRE appareil
  y reste, avec `archived:true`. Extrait en fonction nommée
  `restaurerPassionActiveApresFusion` pour qu'un test exerce le code RÉEL : la première
  version du test recopiait la logique, et serait restée verte si la production avait
  changé. Verrou : `sync-passion-active.spec.js`.

  ⑤ **Une règle CSS survit à la disparition de sa cible.** UI-6 §11 masquait
  `.profile-chips-row` pour cacher les pastilles de score, rang et solde. ADR-009 a
  retiré ce moteur en entier, mais la règle est restée — et la rangée ne portait plus
  que la pastille de BADGES d'assiduité, que l'ADR garde expressément. Mesuré avec un
  badge gagné : pastille à `inline-flex`, rangée à `none`, hauteur visible 0, et
  `openBadgesSheet()` sans aucun autre appelant. Fonctionnalité calculée à chaque
  rendu, morte à l'écran. ⚠️ `myEngagementStats` compte par `organizerId`/`authorId`,
  jamais par `ownerId` — une sonde écrite avec `ownerId` rend 0 badge et fait conclure
  à tort que le défaut n'existe pas. Verrou : `profil-badges-visibles.spec.js`.

  **⚠️ Second lot de la même nuit — sept défauts de plus, même méthode.**
  Trois d'entre eux sont des failles d'échappement, quatre des chemins morts.

  ⑥ **XSS stockée dans les notifications.** `renderNotifs` (app-08) écrivait
  `${n.text}` BRUT parce que les notifications de démonstration portent des `<b>`
  voulus. Or `pushNotification` recopie du texte d'autrui (mentions, extraits de
  commentaires) et `supaLoadNotifs` remonte des lignes écrites par n'importe quel
  compte. Le rendu est désormais **sûr par défaut** : `_notifTexteHtml(n)` échappe,
  sauf discriminant explicite de confiance (`n.html === true` ou `kind === "local"`),
  que seules la graine et `pushNotification` posent. ⚠️ Le motif est général : dès
  qu'un champ mélange du balisage MAISON et du texte d'autrui, c'est un
  **discriminant de confiance** qu'il faut, jamais un échappement conditionnel au cas
  par cas. Verrou : `notifications-echappement.spec.js`.

  ⑦ **La même donnée échappée à un endroit et pas à l'autre.** `ev.eventType` était
  échappé sur la carte de la liste (app-07 ~2432) et BRUT dans la fiche (~3310) :
  mesuré, `<img src=x onerror=…>` s'exécutait à l'ouverture de la fiche. Idem pour
  `duration` d'un carnet en direct, brut dans le carrousel du Fil (app-02) et dans la
  fiche (app-03). ⚠️ « Le `<select>` de création ne propose que des valeurs fixes »
  n'est PAS une garantie : toute session authentifiée écrit ces colonnes par REST.
  Verrou : `echappement-type-et-duree.spec.js`.

  ⑧ **Un champ manquant qui fait échouer une publication EN SILENCE.**
  `shareReelInFeed` (app-05) fabriquait son post sans `createdAt`. Or
  `supaPublishPostWithRetry` fait `new Date(post.createdAt).toISOString()` : sur
  `undefined` cela lève un RangeError, avalé par le `catch` de la boucle de réessai
  qui renvoie `false`. Le partage n'atteignait donc JAMAIS Supabase — et le même champ
  date la carte (`fmtTime(undefined)` → "") et la classe dans le fil (tri sur
  `createdAt || 0` → tout en bas). Sa jumelle `sharePostInFeed` (app-03) le portait
  déjà : **deux fonctions presque identiques avaient divergé sur ce seul point**.
  Second défaut dans les DEUX : le texte était échappé à la SOURCE alors qu'il l'est
  déjà à l'affichage (`escapeHtml(displayText)`), donc doublement — et la valeur
  corrompue partait dans `posts.content`. Verrou : `partage-bobine.spec.js`.

  ⑨ **Le lecteur de bobines n'envoyait aucun commentaire.** `submitReelComment`
  (app-05) écrivait dans l'état local puis `saveState()`, et rien d'autre : ni
  `post_comments`, ni `comment_interactions`. L'auteur de la bobine ne voyait jamais
  le commentaire, et son auteur le perdait au premier rechargement. Le MÊME texte
  posté depuis la discussion du Fil partait, lui — d'où un défaut invisible à qui
  teste par le Fil. Corrigé **sans dupliquer de moteur** : passage par la file
  d'attente commune `_enqueueCommentSync` (app-04), qui gère le réessai hors-ligne.
  Dans la foulée : `loadReelComments` datait par `c.timestamp`, un champ qu'AUCUN
  chemin de création ne pose (tous écrivent `createdAt`) — le repli « Maintenant »
  était donc universel. Verrou : `commentaires-bobine.spec.js`.

  ⑩ **Le contenu de démonstration est COPIÉ dans l'état, puis persisté à vie.**
  `loadState` fait `parsed.notifications = def.seed.notifications.map(…)` à la
  première ouverture. ADR-009 a réécrit la graine — mais un compte ouvert AVANT le
  retrait garde sa copie : « Nouvelle quête du jour 🎨 **+15 pts** » et « Tu as gagné
  **10 💎 Passia** ». `stripLegacyEconomy` filtre désormais aussi `notifications`, aux
  TROIS frontières (`_leanState` recopie `notifications` dans le blob `user_state`,
  donc un vieil appareil les repousserait). ⚠️ Le filtrage par TEXTE est borné aux
  notifications écrites PAR L'APP (`fromId` absent ou `"me"`) : une notification qui
  rapporte le contenu d'autrui le CITE — la publication d'actualité de la graine
  contient « +4 pts ». Verrou : `notifications-economie-retiree.spec.js`.

  ⑪ **« Ma ville » posait son prédicat une fois, et ne le reprenait jamais.**
  `ui-v4a1-intentions.js` appelait `poserPredicatVille(nomVille())` au clic sur la
  chip. Changer de ville ensuite (`selectIrlCity` → `renderIRL`) laissait le filtre
  sur l'ANCIENNE : le titre annonçait Paris, la liste montrait Lyon. La
  resynchronisation post-rendu ré-aligne désormais le prédicat. ⚠️ Le prédicat est
  stocké NORMALISÉ (`_normIrlCityName`) et la ville garde son libellé d'affichage :
  comparer les deux valeurs brutes ferait croire à une divergence à chaque rendu et
  provoquerait une réécriture sans fin. Verrou : `irl-changement-ville.spec.js`.

  ⑫ **Ouvrir l'éditeur de carnet amputait le Studio, définitivement.**
  `activateStudioVlog` masque le texte libre, la passion et le mood — le carnet ne
  les utilise pas. Rien ne les rendait : `closeCarnetEditor` remettait `studioType` à
  `"text"` et s'arrêtait là, et le SEUL chemin de restauration était le clic sur un
  onglet de format… que le lot UI-6 a retiré de l'écran. Un composeur muet, sans
  erreur ni message, jusqu'au rechargement. Deux sorties tenues désormais : la porte
  (`closeCarnetEditor`) et un filet dans `renderStudio` pour qui quitte l'écran CDV
  par la navigation. ⚠️ Famille générale : **retirer un chemin d'accès (ici les
  onglets) peut supprimer le seul chemin de RETOUR d'un état transitoire.**
  Verrou : `studio-apres-carnet.spec.js`.

  ⑬ **Deux sessions ont corrigé le MÊME défaut à deux endroits — et le cumul a
  cassé l'affichage.** La XSS des notifications a été fermée deux fois le même
  soir : #202 neutralise les chevrons au **point d'entrée** (`mergeSupaNotifs`,
  par où passent la lecture REST et le temps réel), #200 échappait au **rendu**
  (`_notifTexteHtml`). Chacun était correct seul. Fusionnés, un texte distant
  passait deux fois — mesuré : « Ben&#39;j a aimé ton post &lt;img … &gt; »,
  entités visibles à l'écran. Le repli par défaut de `supaInsertNotif` étant
  `escapeHtml("Quelqu'un")`, **tout le monde** voyait « Quelqu&#39;un ».
  Réconcilié par #209 : le modèle de confiance du rendu est conservé (le défaut
  reste le REFUS) mais son désinfectant devient la même neutralisation de
  chevrons qu'à l'entrée — **idempotente** (`&lt;` ne contient plus de `<`) et
  suffisante dans un contenu d'élément. ⚠️ Deux leçons : un désinfectant appliqué
  à deux étages doit être idempotent, sinon il ne faut en garder qu'un ; et c'est
  exactement le risque que vise « une branche sensible = un seul écrivain » — ici
  les deux branches ne se touchaient même pas, ce sont les CORRECTIFS qui se sont
  recouverts. Verrou ajouté APRÈS coup, #209 n'en portait aucun : le test
  « passée par mergeSupaNotifs, elle n'est pas désinfectée deux fois » rougit
  seul quand on remet `escapeHtml` — les quatre tests de sécurité, eux, restent
  verts, ce qui montre qu'il s'agit d'un défaut d'affichage et non d'une faille.

- **`.passio/adr/ADR-011-refonte-multi-passion.md` — la refonte du 2026-08-31** : fil additif (OU inclusif), profil à deux onglets, identité centralisée, Studio seul point de choix, retrait du Carnet de voyage. Elle complète ADR-010 et en amende l'interface.
- **Première visite** : `js/first-run.js` (drapeau `first_run_experience_v1`, coupé par défaut), tests `tests/e2e/first-run.spec.js`, captures `docs/captures/first-run/`.
- `docs/PIEGES_CONNUS.md` — les 59 fiches détaillées (extrait de ce fichier le 2026-08-07, recompté le 2026-08-29).
- `docs/HISTORIQUE_PROJET.md` — état 2026-06-11, backlog terminé, logs d’optimisation.
- `docs/ARCHITECTURE.md`, `docs/CONTROLE_16_MISSIONS.md`, `docs/CHECKLIST_COMMERCIALISATION.md`.
- Skills projet : `/ship`, `/migration`, `/e2e-multi`. Subagents : `audit-passio`, `migration-checker`.

