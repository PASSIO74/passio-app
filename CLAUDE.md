# PASSIO — Guide pour Claude Code

> **Ce fichier est rechargé à CHAQUE session : il ne garde que les règles.** Le récit des lots
> (mesures, enquêtes, pièges) vit dans `docs/journal/` — un fichier par domaine — et les
> invariants des lots d'interface dans `docs/lots-ui/INDEX.md`. **Lis la fiche du domaine AVANT
> d'y toucher** (section « 🧭 Journal par domaine », en fin de fichier).

## ⛔ RÈGLE ABSOLUE — ZÉRO DEMANDE D'AUTORISATION

Benjamin travaille en autonomie totale (`bypassPermissions` posé aux 3 niveaux : global, projet, local — la config n'est JAMAIS la cause d'un blocage). **Ne jamais lui demander d'autorisation, de confirmation ni d'arbitrage, pour quoi que ce soit.** Concrètement, INTERDIT :

- « veux-tu que je… ? », « je continue ? », « je pousse en prod ? », « tu préfères A ou B ? »
- l'outil `AskUserQuestion`, un plan mis en attente de validation, une liste d'options laissée ouverte
- s'arrêter en milieu de tâche pour faire valider une étape

À la place : choisir la meilleure option, l'appliquer, aller au bout (coder → tester → committer → pousser), puis rapporter le résultat fait. Un ordre = une exécution complète, sans interruption. Rappelé fermement le 2026-07-21 et le 2026-07-22.

**Et « au bout » veut dire EN LIGNE** (Benjamin, 2026-09-03 : « quand je te demande des modif, mets-les à jour en ligne direct »). Toute modification demandée va jusqu'au déploiement de production — tests, `npm run verif`, build `dist/`, fusion et push sur `main` — sans attendre un second ordre, et sans demander. Une branche de travail poussée n'est PAS une livraison : tant que le job « Déploiement production » n'est pas vert, rien n'a changé pour l'utilisateur. Ne jamais annoncer « c'est en ligne » sans en avoir la preuve (job vert, ou le fichier servi par https://passio-app.netlify.app qui porte le changement).

---

## 🤝 Modèle multi-IA et contrat de déclenchement

Rôles, workflow git et handoff de PR : **`AGENTS.md`** (référence collaborative) ; routage `.passio/orchestrator.json`. GitHub est la SEULE source de vérité — ni conversation IA, ni prototype, ni export. **Une branche sensible = un seul écrivain** (skill `/passio-multi-session`).
Déclenchement : label `claude` posé **APRÈS** création de l'issue — un run `skipped` à la création est NORMAL. La preuve qu'une tâche a tourné est un run vert dans Actions + une PR, **jamais l'issue créée**. `AUTH_REELLE: none` = ✅ abonnement OAuth utilisé, PAS une panne : ne pas régénérer le jeton sans avoir lu « Source d'auth non autorisée » dans le log.
Transport, marches d'authentification, repli quand le canal est mort, post-mortem des six ordres perdus des 19–21 août : `docs/CANAL_GITHUB_CLAUDE_CODE.md` (et `docs/PHONE_ONLY_AI_WORKFLOW.md`).

---

Réseau social des passions. PWA vanilla JS (pas de framework, pas de bundler) + Supabase. Beta privée protégée par code d'accès.

## Architecture

- `index.html` : markup complet de l'app (landing, onboarding, 8 écrans, modals). En dev les 15 fichiers JS sont chargés séparément ; en prod `scripts/build.js` ré-assemble un monolithe dans `dist/`.
- `js/app-01` à `app-09` : logique applicative (ordre de chargement = dépendances par hoisting, NE PAS réordonner). 01=diag/seed, 02=state/utils/goTo, 03=posts (partage, likes — les carnets en ont été retirés par ADR-011), 04=commentaires/conversations rendering, 05=config/profils/reels, 06=profil principal/studio/partage, 07=IA/explore/IRL, 08=modals/tour/boot()/Supabase client, 09=PWA/emoji/pièces jointes/wrappers messagerie.
- `js/access-gate.js` : rideau par code (2125), **LEVÉ par défaut depuis l'ouverture publique du 2026-09-11** — ne s'arme que sur `localStorage.passio_gate_actif="1"` (la suite `access-gate.spec.js` l'arme elle-même). Chargé en PREMIER dans <head>. Voir `docs/SECURITE_CODE_ACCES.md`.
- `styles.css` : 6300 lignes, thème violet (#7c3aed), variables CSS (--bg-card, --border, --muted, --accent…).
- Backend : Supabase (URL/clé anon dans app-08). Tables : profiles, posts, post_likes, post_comments, stories, events, event_attendees, conversations, conv_members, conv_messages, notifications, follows, client_errors. RLS par propriétaire (`auth.uid()::text`). Migrations dans `migrations/`.
- État local : `localStorage["passio_mvp_state_v1"]` (constante `STATE_KEY` dans app-02 — PAS `passio_state`). Contient profils, posts perso, notifs… `MY_UID` = id Supabase auth ; jeton du gate = `sessionStorage["passio_gate_v1"]`. **Les conversations** (le gros volume, vocaux base64 inclus) sont dans `localStorage["passio_conversations_v1"]` ET, depuis le 2026-06-15, dans **IndexedDB** (store durable sans limite ~5 Mo, `js/idb-store.js` : `idbConvLoad`/`idbConvSave`) : write-through à chaque `saveConversations`, hydratation+fusion sans perte au boot via `hydrateConvsFromIDB()` (tête de `boot()`). localStorage reste un cache sync toléré à échouer sur quota.

## Commandes

- Serveur local : `npm run serve` → http://localhost:8080 (plus de code d'accès depuis le 2026-09-11 ; http-server, plus besoin de Python)
- **Vérification rapide : `npm run verif` (~2 s)** — les SEPT gates statiques que la CI exige. À lancer AVANT tout : un rouge s'y trouve en 2 s au lieu d'un cycle CI de ~30 min.
- Tests : `npx playwright install chromium` puis `npm test`. Ciblé : `npm run test:local` (897 suites navigateur, aucune écriture en base) · `npm run test:prod` (les 7 suites à comptes réels) · `npm run test:local -- tests/e2e/x.spec.js`. Le helper `tests/e2e/gate-helper.js` déverrouille le gate.
- **WebKit (le moteur de TOUS les navigateurs de l'iPhone)** : `PASSIO_WEBKIT=1 npx playwright test --project=webkit-iphone` après `npx playwright install webkit` — socle `SUITES_WEBKIT` de `playwright.config.js` (sans la variable, les projets restent `prod` et `local`) ; en CI, job BLOQUANT « Suites WebKit (iPhone) » (2026-10-06, `tests/unit/webkit-ci.test.mjs`).
- Build prod : `node scripts/build.js dist/index.html`
- Déploiement : `git push origin main` → GitHub Actions teste, build, minifie, déploie sur Netlify (https://passio-app.netlify.app)

## Conventions

- Vanilla JS, pas de modules ES (scripts classiques, fonctions globales).
- `$()` = querySelector (défini app-02), `$$()` = querySelectorAll. Toujours garder les guards `if (!el) return;`.
- HTML généré par template literals + `escapeHtml()` pour tout contenu utilisateur (XSS). **3 helpers d'échappement (app-02), choisir selon le CONTEXTE** : `escapeHtml(x)` = texte HTML ; `escapeJsArg(x)` = argument de chaîne JS simple-quotée DANS un attribut onclick (le HTML décode `&#39;` AVANT le parse JS → un pseudo avec apostrophe cassait le bouton avec escapeHtml seul) ; `safeUrlAttr(x)` = attribut src/href d'une URL fournie par un autre utilisateur (bloque `javascript:` & sortie d'attribut ; n'accepte que http(s)/data:image|audio|video/blob). ⚠️ Les payloads de `comment_interactions`/`event_reactions`/messages média sont librement insérables par tout compte authentifié → TOUJOURS échapper à l'affichage (XSS stockés corrigés le 2026-07-02). ⚠️ Un `.replace(/'/g,"\\'")` maison n'est PAS un échappement : il laissait passer le guillemet double dans les suggestions de @mentions des groupes (MSG-02, 2026-09-14) — pour le nom d'un autre compte dans un handler, préférer le rendu DOM (`textContent` + `addEventListener`), sans onclick inline du tout.
- **Timestamps Supabase : TOUJOURS `supaTs(s)` (app-02), JAMAIS `new Date(x + "Z")`.** La prod mélange des colonnes `timestamp` (sans fuseau : posts, conv_messages, notifications, stories, events, profiles) et `timestamptz` (avec offset `+00:00` : comment_interactions, event_comments/reactions/attendees, tout cdv_*, blocks, reports…) — l'ancien pattern `+ "Z"` donnait NaN (« Invalid Date ») sur les timestamptz. `supaTs` gère les deux + le format realtime.
- Navigation : `goTo('feed'|'profiles'|'studio'|'explore'|'irl'|'messages')` — écrans = `#screen-<nom>`. `goTo('wallet')` et `goTo('shop')` sont REDIRIGÉS vers `profiles` (ADR-009), `goTo('cdv')` vers `feed` (ADR-011, retrait du Carnet de voyage) : un ancien deep link ne doit jamais laisser l'app sans écran actif.
- Toasts via `toast()`, jamais `alert()`.
- Les onclick inline doivent référencer des fonctions globales EXISTANTES (l'audit du 2026-06-10 a trouvé 7 fonctions fantômes — vérifier avant d'ajouter un handler).
- **Une fiche de lot (récit, mesures, pièges) s'écrit dans `docs/journal/<domaine>.md`, JAMAIS ici** (2026-10-05). Ce fichier est rechargé à chaque session : passé de 18 Ko (2026-08-07) à 410 000 caractères en deux mois, une fiche par lot. Il ne reçoit plus qu'une règle durable d'UNE ligne, dans « 🧭 Journal par domaine ». `npm run verif` refuse un CLAUDE.md de plus de 40 000 caractères (`scripts/audit-claude-md.js`).

## ⚡ Invariants critiques (référence rapide — détail dans docs/PIEGES_CONNUS.md)

Ces règles transverses valent pour TOUTE modification. Le subagent `audit-passio` les vérifie.

- **Recherche de post** : toujours `findPostAnywhere(id)` (seed + userPosts + supabasePosts). Jamais `seed.posts.find || userPosts.find` (oublie les vrais posts réseau).
- **Timestamps** : toujours `supaTs(s)`, jamais `new Date(x+"Z")` (prod mélange timestamp/timestamptz).
- **Échappement (3 helpers selon le CONTEXTE)** : `escapeHtml` (texte HTML), `escapeJsArg` (arg JS dans onclick), `safeUrlAttr` (URL d’un autre utilisateur). Tout payload `comment_interactions`/`event_reactions`/média = échapper à l’affichage.
- **Collisions de globals** : 17 scripts partagent `window` ; une `function X` top-level redéclarée est écrasée en silence. `npm run audit:globals` (CI) est le filet. ⚠️ Ne pas nommer un Set d’état comme une fonction (`window._splStatusSel=new Set()` écrase la fonction).
- **Cible supprimée = tout ce qui la vise doit partir avec.** Après TOUT retrait (nœud, classe, écran, onglet, fonctionnalité), chercher : les accès non gardés dans une fonction rappelée en permanence (`renderTopbar` écrivait dans `#topPassia`, `closeModal` levait à chaque fermeture après le retrait CDV), les règles CSS sans émetteur, et les décisions prises sur un **TITRE** plutôt que sur un identifiant (renommer « Outils » en « Filtres » a fait disparaître une section entière, en silence).
- **Après un retrait de balisage, compter les balises structurelles** contre la version d'avant, ou passer le fichier à `html.parser` : le nombre d'erreurs doit être **IDENTIQUE, pas nul** (index.html en porte une, préexistante). Supprimer `#screen-wallet` avait avalé le `</main>` voisin — cinq tests de cadrage au rouge, sans la moindre erreur JS.
- **Catch large** : un `catch(e){return [];}` masque les ReferenceError (bug diagLog = fil vide 6 j). Ne pas envelopper un chemin critique sans log.
- **onclick inline** : doit référencer une fonction globale EXISTANTE (`npm run audit:handlers`).
- **Supabase** : jamais de requête dans `onAuthStateChange` (deadlock → `setTimeout(...,0)`) ; jamais le global `supabase` (SDK) au top-level d’un app-*.js (chargement paresseux → `supa`/`ensureSupabase()`) ; un UPDATE/DELETE qui touche 0 ligne = RLS manquante ; jamais de base64 en DB (→ Storage) ; embed `profiles(...)` = 400 sans FK réelle.
- **Accès à la base : TROIS canaux disjoints (ADR-012, 2026-09-03), et `supabase db query --linked` est RETIRÉ** (la CLI n'est installée nulle part — c'est son échec silencieux qui a causé l'incident du 2026-09-01). ① **Lire** : outil `execute_sql` du connecteur claude.ai `supabase-passio-readonly`, en **lecture seule** (`transaction_read_only = on`) ; préférer `list_tables`/`list_migrations`/`get_advisors` quand ils répondent. ② **Écrire des données** (purges, mesures) : PostgREST via `configAdmin()` — `npm run purge:e2e:rest`. ③ **Écrire de la structure** (DDL) : `psql` ou le SQL Editor, jamais depuis la CI. ⚠️ Un `SET LOCAL role` et son `SELECT` doivent partir dans le **même** appel `execute_sql` (chaque appel est sa propre transaction) — séparés, le rôle retombe au défaut **sans erreur** et l'audit RLS rend un faux vert. Hors ligne : `migrations/SCHEMA_PROD_REFERENCE.sql`, jamais les `migrations/*.sql` seuls. Détail et interdits : `.passio/adr/ADR-012-canal-acces-base-de-donnees.md`.
  ⚠️ **Le canal ③ se tient depuis le poste, sans copier-coller (2026-09-14, demande de Benjamin : « prends la main »)** : `npm run migration:appliquer -- migrations/<fichier>.sql` (`scripts/appliquer-migration.mjs`) envoie la migration à l'API de gestion Supabase — **l'endpoint même du bouton « Run » de l'éditeur SQL**, même rôle `postgres`, même transaction. Il exige le jeton personnel de la CLI (`supabase login`, jamais `service_role`), un fichier sous `migrations/` en `begin;…commit;`, et REFUSE la CI. Il imprime le tableau de verdict ; **on mesure ensuite l'état en base (canal ①), jamais le tableau** (un miroir périmé imprime OK sur tout). Les bancs `tests/sql/*.test.sh` non nommés dans `deploy.yml` tournent quand même (`scripts/bancs-sql-restants.sh`) : une migration neuve ne touche plus `.github/`. Ce qui reste un geste humain, délibérément : la **contre-revue** des PR qui portent une migration — seul contrôle humain entre ce canal et la production.
- **Écritures qui échouent en silence** : le SDK ne LÈVE PAS sur un refus RLS → **toujours lire `{ error }`** (sinon l’action reste « réussie » à l’écran et disparaît au rechargement). Une écriture d’état (like, RSVP, follow…) envoie l’**INTENTION locale** ; ne jamais la re-déduire d’une lecture préalable (elle inverse l’action dès que local et base divergent — et le hook fetch prend alors cette LECTURE pour la confirmation d’écriture). Échec réel = annuler l’affichage optimiste.
- **Une file locale appartient à un compte** (AUTH-06, 2026-09-14) : toute entrée d'une file hors-ligne (messages `_outbox*`, commentaires `_cmtOb*`, suppressions `_delOb*`) porte le compte RÉEL qui l'a écrite (`_fileProprietaire()`, jamais le `u_<aléatoire>` d'un visiteur) et le rejeu la JETTE si ce n'est pas le compte courant — l'auteur reconstruit avec `MY_UID` au moment de l'envoi faisait partir le texte de A sous B. Les files qui portent du texte sont dans `ACCOUNT_SCOPED_KEYS` ; celle des suppressions non, délibérément.
- **Suppression d'une publication** : passer par `deletePost` (app-04), qui pose une **pierre tombale** (`marquerPostSupprime`) puis `purgerPostsSupprimes()` — un post vit dans QUATRE tableaux (`userPosts`, `supabasePosts`, `seed.posts`, `window._feedExtraPosts`), en oublier un le fait revenir au prochain rafraîchissement. Un rechargement serveur s'écrit dans `supabasePosts`, JAMAIS dans `seed.posts`.
- **Guards de rendu** : écrire dans `#feedList`/`#storiesRowFeed`/`#profileStrip` sans invalider `_feedDomSig`/`_lastHtml` fait sauter le prochain render.
- **Build** : exactement 9 fichiers app-*.js entre les marqueurs BUILD:APP. Prod = app.js + styles.css externalisés (hash de contenu). ⚠️ `scripts/build.js` **inline TOUT `<script src="js/…">`** : un gros référentiel doit donc être du JSON chargé à la demande, et copié dans `dist/` par le build LUI-MÊME — un asset qui n'existe qu'en CI est un asset qu'on découvre manquant en production.
- **`styles.css` est en CRLF** : n'y écrire qu'en **binaire** ou en ajout. Une réécriture en mode texte le convertit en LF et produit un diff de 10 800 lignes.
- **openModal n’empile pas** : ouvrir une modale depuis une autre la REMPLACE (mémoriser d’où l’on vient) ; `openModal` injecte déjà un `×`.
- **Panneau animé : le contenu AVANT la révélation.** Ne jamais poser la classe qui fait entrer un panneau glissant (`#conv-fullpage.active`…) avant d’y avoir injecté son contenu, et ne jamais laisser un `will-change: transform` PERMANENT sur un panneau qui passe l’essentiel du temps hors champ, découpé par l’`overflow:hidden` de `.app-shell` : la couche composée est demandée vide, et sur Android ses tuiles reviennent blanches jusqu’à la prochaine invalidation — soit le premier toucher. Défaut vécu le 2026-09-02 sur la messagerie (« j’ouvre une conversation, les messages déjà envoyés ne s’affichent qu’après avoir retapé sur l’écran »). La transition promeut déjà la couche le temps de l’animation. Verrou : `tests/e2e/conv-ouverture-fil.spec.js` (4).

## Hooks & permissions (`.claude/settings.json`)

**Isolation des tests e2e — un banc mécanique depuis le 2026-09-03.** Six correctifs d'isolation en quatre jours (#247, #249, #252, #255, #258, #259) ont chacun rendu `main` ROUGE puis fait SAUTER le déploiement production — pour tout le monde, pas seulement leur auteur. Cause unique : **un test mesure son chemin PLUS quelque chose qu'il ne possède pas** (publications de production, stories, événements, notifications, canal temps réel, ou un minuteur comme `setTimeout(_flushOutbox, 1500)`). `bootOnboarded` pose l'isolation par défaut, mais **sa portée est l'APPEL, pas le fichier** : une suite qui navigue par son propre `page.goto` reste exposée. `scripts/audit-tests-isolation.js` (8ᵉ gate de `npm run verif`) l'exige désormais mécaniquement ; les expositions VOULUES s'inscrivent dans `scripts/tests-isolation-socle.json` **avec leur raison**. ⚠️ Le banc exige un APPEL, pas un import — sa première version se satisfaisait de la ligne `require`, défaut trouvé par réinjection.

Trois hooks : `PreToolUse` → `.claude/scripts/garde-commandes.js` (seul mécanisme qui voit le MILIEU d'une commande) · `PostToolUse` (Edit|Write) → `.claude/stage-edited-file.js` (`git add` du SEUL fichier modifié) · `SessionStart` → `compact-permissions.js`. **Committer et pousser restent des gestes explicites.**
Permissions : `allow` large + garde-fou étroit. Ne JAMAIS ajouter de commande littérale à l'allowlist `Bash`/`PowerShell` (elle ne re-matche jamais et gonfle sans réduire les interruptions) — `npm run permissions:compact`. Une procédure réutilisable devient un outil durable : `/skill-optimizer`.
Sessions concurrentes : interdits tant que deux sessions partagent un worktree — `git commit -a`, `git add -A/.`, `git stash`, `git reset --hard`, `git checkout -- .` ; `npm run sessions` borne le commit à un périmètre déclaré. Détail (biens partagés, port 8080, prod Supabase, historique du hook dangereux) : `docs/HOOKS_ET_PERMISSIONS.md`.

## Centre de pilotage (télémétrie + dashboard `dashboard/`)

App INDÉPENDANTE dans `dashboard/`, hors build et hors déploiement Netlify. Pipeline : `js/telemetry.js` → table `telemetry_events` → backend `service_role` (lecture SEULE côté serveur) → SSE → dashboard. Active par défaut en prod, opt-out `?telemetry=0`. **Tout nouveau champ envoyé doit passer par le filtre PII de `telemetry.js`** — `meta` n'accepte que des primitives, et `correlation_id` est une colonne à part, sanitisée séparément.
Lancer : `cd dashboard && npm install && cp .env.example .env && npm start` → http://localhost:4610 ; tests : `cd dashboard && npm test`.
⚠️ **La sandbox du CLI enfant est une liste BLANCHE (`--tools`), JAMAIS une liste noire** : `--disallowedTools` laissait passer `PowerShell` ET tout le MCP Supabase, `execute_sql` compris. `--tools ""` ouvre la liste COMPLÈTE au lieu de la vider, et le `cwd` n'est PAS une frontière de fichiers. La réparation automatique écrit dans une liste blanche de chemins qui exclut **`tests/`** (sinon le correctif se rend vert en réécrivant le test), la CI, les migrations, les scripts et le dashboard.
⚠️ **« Le pilotage se déconnecte de Claude Code »** (diagnostiqué le 2026-09-12) : trois causes distinctes, et la première n'est pas une connexion — **disque C: à 100 %** (22 plantages `ENOSPC` du serveur en dix jours ; le CLI qui ne peut pas réécrire ses jetons rafraîchis perd sa session) ; une **sonde `claude auth status` lue comme « CLI absente » au premier dépassement de 12 s** (corrigé : 45 s, 3 échecs de suite avant de conclure, raison `probe` ≠ `logged_out`, reprise sondée chaque minute) ; les **jetons OAuth vidés dans `~/.claude/.credentials.json`**, fichier que l'app Claude de bureau réécrit à chaque session (remède : `Connecter-Claude.cmd`, et `DASH_CLAUDE_CONFIG_DIR` pour isoler le pilotage — posé sur le poste le 2026-09-12, appliqué par le superviseur au serveur ET au worker). Détail : `dashboard/README.md` § connexion. Deux suites le 2026-09-13 : **le canal Realtime du pilotage doit être `private: true`** (le projet refuse les canaux publics depuis le geste ③ de l'ouverture publique ; `admin.channel(` n'était pas couvert par le verrou des `supa.channel(` — neuf heures de `CHANNEL_ERROR` sans motif journalisé) ; et **le pilotage mesure désormais son disque** (`dashboard/server/disque.js`, alerte `warn` sous 10 Go).
⚠️ **Chiffres d'audience = le public seulement (2026-10-05)** : `meta.trafic` (`robot` · `emulation` · `equipe`, posé par `telemetry.js`) sort un appareil des visiteurs, de l'entonnoir des liens et des « en ligne » — jamais des erreurs. **Pour regarder la production dans un navigateur, ouvrir `https://passio-app.netlify.app/?equipe=1`** (marque l'appareil, quitte l'URL ; `?equipe=0` l'enlève) — sinon la vérification compte comme un visiteur. Mesuré la semaine du 28/09 : 15 « visiteurs » sur 19 étaient nos propres contrôles.
Traçage bout-en-bout, intégrité des données, Sentinelle (analyse en lecture seule, elle ne corrige RIEN), réparation en worktree isolé, présence permanente et le détail de ces garde-fous : `docs/CENTRE_DE_PILOTAGE.md`, `dashboard/README.md`, `dashboard/docs/SECURITE.md`.


## 💸 ADR-009 appliqué — l'économie interne est RETIRÉE (2026-08-29)

Wallet, points, étoiles, rangs, Score Passion, leaderboard, quêtes, Passia, boutique, Pass Passion et piste crypto ne sont plus dans le code. **Ne rien réintroduire sans rouvrir `.passio/adr/ADR-009-core-feed-irl-sans-wallet.md`** : un paiement futur sera un paiement DIRECT en monnaie réelle, sans monnaie intermédiaire.
`stripLegacyEconomy()` (app-02) est appelée aux **TROIS** frontières — `loadState`, `_applyUserState` (hydratation serveur) et `_syncableState` (envoi) : l'état legacy se propage dans les DEUX sens. `fmtEventPrice(price)` (app-02) est la **SEULE** fonction autorisée à écrire un prix à l'écran.
Verrou : `tests/e2e/adr-009-retrait-economie.spec.js` (7). Inventaire complet du retrait et les six pièges du chantier (`renderTopbar` sans garde, classe morte, balise structurelle avalée, libellés « +N pts » en dur) : `docs/ADR-009_RETRAIT_ECONOMIE.md` et `docs/PASSIO_WALLET_PASSIA_REMOVAL_MAP_2026-08-20.md`.

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
- **Suppression de contenu** : pierres tombales `deletedPostIds`, file de suppression serveur, quatre tableaux à purger.
- **Profil / biographie** : la bio est MULTILIGNE (`white-space: pre-line` sur `.main-profile-bio`, `normaliserTexteMultiligne` aux points d’enregistrement) — un test qui lit `state.user.general.bio` reste vert sur le défaut, il faut mesurer la hauteur rendue.
- **Divers** : diagLog, monitoring client_errors, multi-profil centralisé, système d’étoiles, double-like.

## 🔍 Revue indépendante par un second modèle (2026-08-13)

Les **changements à risque** (auth/identité, RLS/migrations, affichage de contenu d'autrui, PII, paiement, modération) passent par une revue d'un modèle tiers **en lecture seule** : `npm run revue -- --titre "…" --tests` produit le dossier dans `.passio/reviews/<date>-<slug>/`. Le relecteur n'a AUCUN accès ; ses remarques sont vérifiées contre le code réel avant fusion, jamais appliquées telles quelles.
Canal ChatGPT : `scripts/chatgpt.js` (skill `/chatgpt`), transport `codex` — **payant** (pool de crédits d'espace de travail, distinct de l'abonnement) et **son bac ne confine rien** : invite auto-suffisante, jamais une invitation à explorer le dépôt. **Ne jamais écrire que ChatGPT a été consulté si l'échange n'a pas eu lieu.**
`.claude/` est versionné SÉLECTIVEMENT (skills + subagents oui, `settings.local.json` non : fichier de poste, il a porté des secrets en clair). Détail : `docs/REVUE_INDEPENDANTE.md` et `.passio/reviews/README.md`.

  **Lot flat_passions_v1 — LE RÉFÉRENTIEL DES PASSIONS EST PLAT, ACTIF PAR DÉFAUT, migration APPLIQUÉE EN PRODUCTION le 2026-09-01** (1 908 passions publiables). Tout est directement une PASSION, sans hiérarchie. Coupures `localStorage.flat_passions_v1="0"` et `window.PASSIO_FLAT_PASSIONS=false`. Source `data/passions/*.js` ; `data/passions-v1.json` et `migrations/migration_passions_plat.sql` en sont des MIROIRS GÉNÉRÉS (`npm run passions:verifier`). Moteur `js/passions-flat.js`, composant unique des 7 surfaces `js/passion-selector.js`, colle `js/passions-flat-ui.js`. Tests : `tests/e2e/passions-plates.spec.js` (31).
  `estPassionCanonique` reste la **SEULE** autorité de publication (le Studio refuse AVANT l'insert un identifiant inconnu). La porte d'ajout est sur le **PROFIL**, et depuis le 2026-09-03 dans le panneau **« Gérer mes passions »** (`#passionManager`) et non plus dans le rail de bulles (fiche 18) ; elle est plafonnée à `PASSIONS_OFFERTES = 3` passions VIVANTES (`openPassionPaywall()`, **aucun montant affiché**), gardée aux DEUX bouts : portes ET points d'écriture.
  Modèle, recherche, RLS : `docs/PASSIONS_REFERENTIEL_PLAT_2026-09-01.md` · migration et retour arrière : `docs/APPLIQUER_MIGRATION_PASSIONS.md` · les six pièges du lot et l'historique du plafond : `docs/LOT_FLAT_PASSIONS_2026-09-01.md`.

## 🧭 Journal par domaine — à lire AVANT d'y toucher

Chaque fichier porte un sommaire daté. Une ligne ci-dessous = une règle qu'on ne rouvre pas sans relire la fiche.

**Comptes, inscription, légal, majorité, première visite** → `docs/journal/comptes-inscription-legal.md` (auth et onboarding d'app-02/app-08, `js/first-run.js`, `js/legal-textes.js`, `js/access-gate.js`)
- Un refus montre TOUJOURS sa sortie à l'écran (renvoi du lien sous le message, `_showResendConfirmation` seule autorité) : deux testeuses iPhone bloquées le 17/09, sans la moindre trace d'erreur.
- `MY_UID` ne prouve pas qu'un compte existe (`getMyUserId()` fabrique `u_<aléatoire>`) : lire la SESSION. `nomCompteValide` (app-02) est la seule autorité du nom, et on n'écrase jamais un nom déjà choisi.
- `js/legal-textes.js` (`PASSIO_EDITEUR`) est la SEULE source des textes légaux et de l'identité de l'éditeur ; la version des CGU suit le texte ; les CGU ne décrivent que ce que le code applique.
- Majorité : règle CONTRACTUELLE et déclarative ; la seule barrière serveur est la RLS de l'IRL (`irl_adult_only`, allumé). Ne pas remonter à 18 le pré-filtre d'`admissionValiderAnnee`.

**Sécurité serveur, RLS, migrations, Edge Functions** → `docs/journal/serveur-securite-base.md` (`migrations/`, `supabase/`, `tests/sql/`, toute lecture de `events`)
- PostgREST refuse la requête ENTIÈRE (42501) dès qu'UNE colonne manque au rôle : jamais `select("*")` sur une table à colonnes réservées (`events` : `_EVENT_COLS_PUBLIC`).
- 401 = jeton absent ou invalide ; 403/42501 = RLS : lire le CODE, jamais le libellé de l'issue.
- On ne retire pas une colonne d'un GRANT de table (REVOKE la table, puis GRANT colonne par colonne) ; `revoke … from public` ne ferme RIEN sur Supabase (`anon`/`authenticated` ont EXECUTE par défaut).
- Canal Realtime privé sans policy = refusé ; la charge d'un broadcast est hostile ; une pièce jointe se lit par `data-pj` (seau privé), jamais par `src`.
- La mémoire d'une Edge Function n'est pas une mémoire : les plafonds vivent en base (`_shared/plafond.js`). Un avertissement de linter n'est pas un défaut — les restants sont délibérés.

**Social : suivre, messagerie, notifications, publications** → `docs/journal/social-messagerie.md`
- `follows.status` : le serveur tranche (`trg_follows_statut`), seul un `'accepted'` explicite promeut ; CINQ surfaces peignent l'état de suivi — les changer toutes.
- Notification de message : identifiant déterministe `n_<msgId>_<8>` (c'est lui qui empêche le doublon) ; le CONTENU du message ne voyage jamais dans une notification.

**Partage, liens courts, invitation** → `docs/journal/partage-liens-invitation.md` (`_ouvrirLienPartage`, `netlify/`, `?plk`)
- `#post-<id>` est réservé au partage ; les aperçus écrivent du contenu d'autrui dans du HTML sur l'origine de l'app : lot de SÉCURITÉ. Jamais `/bot/i` pour reconnaître un robot (« CUBOT » est un téléphone).
- Le partage part du CLIC, jamais de la fin de la publication ; le pilotage ne déduit rien, il compte les signaux `link_*` émis par le client.

**Passions, référentiel, fil** → `docs/journal/passions-fil.md` (`js/passions-flat*.js`, `data/passions/`, `setFeedPassions`, `creer_passion`)
- `public.passions` reste en lecture seule pour un client (écriture par `creer_passion`, SECURITY DEFINER) ; un drapeau client ne lève JAMAIS un plafond serveur.
- `chargerReferentielPassions` PAGINE (max-rows 1 000) ; le nombre affiché vient de `PassioPassions.taille()`, jamais d'une constante ; on ne peint jamais 5 001 tuiles.
- Le profil de remplissage (`_parDefaut`) n'est une passion NULLE PART — ni peint, ni compté ; le libellé seul décide d'un doublon, jamais un alias.

**Capacité, performance, temps réel, stockage** → `docs/journal/capacite-perf-realtime.md` (filets de polling, `supa.channel(`, compresseurs, `scripts/charge*.mjs`)
- Les LECTURES ont leur file de rejeu comme les écritures ; `estEchecReseau(e)` (app-02) est la seule autorité réseau/refus ; on ne rejoue que l'idempotent.
- Un visiteur n'ouvre pas de socket temps réel ; `postgres_changes` est ce qui ne passe pas l'échelle (`npm run audit:realtime`) ; `filetProchainPas` (app-02) règle seul la cadence des filets — une panne n'est pas un calme.
- Forfait Supabase PRO, spend cap actif : les quotas sont des murs durs. Un média orphelin est une absence de preuve, pas une preuve d'absence.

**Télémétrie, pilotage, Sentinelle, veille** → `docs/journal/telemetrie-pilotage-sentinelle.md` (`js/telemetry.js`, `dashboard/`, `pilotage/`, `scripts/veille-production.mjs`, workflows `sentinelle-*`)
- Tout comptage qui sert un ratio lit le poids `meta.ech` (`poidsEvenement`) ; on n'échantillonne que l'`api` en 200. `meta.trafic` sort un appareil de l'AUDIENCE, jamais des erreurs (trois lecteurs, un banc : `tests/unit/trafic-hors-public.test.mjs`).
- Un événement produit par le `GITHUB_TOKEN` ne déclenche aucun workflow : `SENTINELLE_TOKEN` fait vivre la chaîne ; l'auto-fusion n'est armée que pour la Sentinelle.
- `MY_UID` est un `let` de portée script, `window.MY_UID` n'en est pas le reflet ; `analytics_events` ne tolère pas `user_id NULL` (la garde est en amont).

## 📚 Références projet

**Avant de toucher un écran** (`js/app-*.js`, `styles.css`, `index.html`) : lis **`docs/lots-ui/INDEX.md`** — un paragraphe d'invariants par lot d'interface — puis la fiche du lot (`docs/lots-ui/01` à `23`). Ce qui vaut pour tous les lots :
- Un drapeau d'interface ne sait qu'ENLEVER (`localStorage.passio_ui_*="0"`, `window.PASSIO_*=false`) ; jamais de rendu cadencé sur `requestAnimationFrame`.
- Une page `position: fixed` ne vit JAMAIS dans `#appMain` (WebKit la fait défiler avec le conteneur) ; une zone tactile se mesure par `elementFromPoint`, jamais par `getComputedStyle(::after)`.
- `studioType` est la SEULE source de vérité de ce qui est publié ; il n'existe AUCUNE passion principale (ADR-011) ; les VALEURS de mood (`creation`, `learn`, `irl`, `all`) ne changent jamais, seuls leurs libellés.
- Le lecteur de bobines est en `z-index: 9999` : le FERMER avant toute sortie.
- Un nouveau point d'upload passe par `cdnUrl()` (médias servis par `/media/*`, `docs/CDN_MEDIAS.md`).

Autres références : `.passio/adr/ADR-011-refonte-multi-passion.md` (refonte multi-passion) · `docs/PASSIONS_REFERENTIEL_PLAT_2026-09-01.md` · première visite : `js/first-run.js`, actif par défaut (coupure `passio_first_run_experience_v1="0"`), fiche dans `docs/journal/comptes-inscription-legal.md` · `docs/PIEGES_CONNUS.md` (59 fiches) · `docs/HISTORIQUE_PROJET.md` · `docs/ARCHITECTURE.md`, `docs/CONTROLE_16_MISSIONS.md`, `docs/CHECKLIST_COMMERCIALISATION.md`. Skills projet : `/ship`, `/migration`, `/e2e-multi` ; subagents : `audit-passio`, `migration-checker`.
