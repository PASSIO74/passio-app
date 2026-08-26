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
- `js/app-01` à `app-09` : logique applicative (ordre de chargement = dépendances par hoisting, NE PAS réordonner). 01=diag/seed, 02=state/utils/goTo, 03=posts/carnets, 04=commentaires/conversations rendering, 05=config/profils/reels, 06=profil principal/studio/partage, 07=IA/explore/IRL, 08=modals/tour/boot()/Supabase client, 09=PWA/emoji/pièces jointes/wrappers messagerie.
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
- Navigation : `goTo('feed'|'profiles'|'studio'|'explore'|'irl'|'wallet'|'messages'|'cdv')` — écrans = `#screen-<nom>`.
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


## 🗂️ Pièges connus — index (détail complet : docs/PIEGES_CONNUS.md)

56 fiches détaillées par domaine. **Lis la fiche concernée AVANT de modifier ce domaine.** Pour un audit de diff, lance le subagent `audit-passio`.

- **Cadrage / shell** : jamais 100dvh (var --app-vh mesurée en JS).
- **Feed** : classement par pertinence (rankFeedPosts), guards no-op.
- **Profil** : onglets multi-sélection, profil visité = même mécanique, compte privé (RLS).
- **CDV** (carnets/lives/voyages) : ~15 fiches — v2/v3, collaboratif, stats/passeport, Mes lieux, rétrospective, stories, création hors Studio, sync Supabase, modération.
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
- `docs/PIEGES_CONNUS.md` — les 56 fiches détaillées (extrait de ce fichier le 2026-08-07).
- `docs/HISTORIQUE_PROJET.md` — état 2026-06-11, backlog terminé, logs d’optimisation.
- `docs/ARCHITECTURE.md`, `docs/CONTROLE_16_MISSIONS.md`, `docs/CHECKLIST_COMMERCIALISATION.md`.
- Skills projet : `/ship`, `/migration`, `/e2e-multi`. Subagents : `audit-passio`, `migration-checker`.

