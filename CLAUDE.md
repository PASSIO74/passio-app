# PASSIO — Guide pour Claude Code

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
Traçage bout-en-bout, intégrité des données, Sentinelle (analyse en lecture seule, elle ne corrige RIEN), réparation en worktree isolé, présence permanente et le détail de ces garde-fous : `docs/CENTRE_DE_PILOTAGE.md`, `dashboard/README.md`, `dashboard/docs/SECURITE.md`.


## 💸 ADR-009 appliqué — l'économie interne est RETIRÉE (2026-08-29)

Wallet, points, étoiles, rangs, Score Passion, leaderboard, quêtes, Passia, boutique, Pass Passion et piste crypto ne sont plus dans le code. **Ne rien réintroduire sans rouvrir `.passio/adr/ADR-009-core-feed-irl-sans-wallet.md`** : un paiement futur sera un paiement DIRECT en monnaie réelle, sans monnaie intermédiaire.
`stripLegacyEconomy()` (app-02) est appelée aux **TROIS** frontières — `loadState`, `_applyUserState` (hydratation serveur) et `_syncableState` (envoi) : l'état legacy se propage dans les DEUX sens. `fmtEventPrice(price)` (app-02) est la **SEULE** fonction autorisée à écrire un prix à l'écran.
Verrou : `tests/e2e/adr-009-retrait-economie.spec.js` (7). Inventaire complet du retrait et les six pièges du chantier (`renderTopbar` sans garde, classe morte, balise structurelle avalée, libellés « +N pts » en dur) : `docs/ADR-009_RETRAIT_ECONOMIE.md` et `docs/PASSIO_WALLET_PASSIA_REMOVAL_MAP_2026-08-20.md`.

## 🤖 CAPTCHA TURNSTILE À L'INSCRIPTION — le client d'abord, l'interrupteur ensuite (2026-09-13)

SEC-06 du go/no-go : sans captcha, un script vide le quota d'e-mails (150/h Supabase, 300/j Brevo) et rend l'inscription
indisponible 24 h. Moteur `captcha*` (app-02, avant `switchAuthTab`), conteneur `#authCaptcha` (index.html, juste avant
`#authSubmitBtn`), sitekey **publique** `PASSIO_TURNSTILE_SITEKEY` (app-08, à côté du CDN). **Sitekey VIDE = inactif** : aucun
script chargé, aucun jeton envoyé, l'appel part comme avant — c'est ce qui rend le client déployable AVANT l'interrupteur.
⚠️ **ORDRE D'ALLUMAGE, et il n'est pas négociable** : ① widget Turnstile créé chez Cloudflare (hostname `passio-app.netlify.app`) ;
② sitekey posée dans app-08 ET déployée ; ③ seulement alors, Supabase → Authentication → Attack Protection → « Enable Captcha
protection » + secret (ou `PATCH /v1/projects/<ref>/config/auth` : `security_captcha_enabled`, `security_captcha_provider: turnstile`,
`security_captcha_secret`). **Allumer avant ② casse 100 % des inscriptions** (`captcha_failed` sur signup, `/token` mot de passe,
`/recover`, `/resend`). ⚠️ **Un jeton ne sert qu'une fois** : `captchaReinitialiser()` après CHAQUE appel, réussi ou non. `captchaJeton()`
attend jusqu'à 20 s (mode Managed : une case à cocher parfois) et rend `""` sinon — le serveur refuse, `traduireRefusCaptcha` le dit.
⚠️ **LE BANC DE COMPTES RÉELS N'ENTRE PLUS PAR LE MOT DE PASSE** : `creerCompteE2E` (compte-e2e.js) demande un
`generate_link` (magiclink, service_role) et la page fait `verifyOtp({ token_hash })` — `/verify` n'est PAS gardé par le captcha,
`/token?grant_type=password` l'est. Prouvé contre la prod le 2026-09-13 (compte jetable, purgé). Repli sur le mot de passe si l'API
ne rend pas de jeton. ⚠️ **La CSP admet UN hôte tiers, et un seul** : `https://challenges.cloudflare.com` en `script-src` ET en
`frame-src` (netlify.toml ET `_headers`) — c'est un service, pas une copie flottante d'une bibliothèque (le verrou d'ouverture-publique
a été réécrit pour le dire). Verrous : `tests/e2e/captcha-turnstile.spec.js` (9, dont ①/③/④/⑥ éprouvés par RÉINJECTION — jeton
jamais joint → 2 rouges), faux `window.turnstile` posé AVANT l'app (donc rien ne part vers Cloudflare, et ① le mesure).
## 🔑 MOT DE PASSE : 8 CARACTÈRES, ET LES REFUS DU SERVEUR EN FRANÇAIS (2026-09-13)

Le minimum serveur (Supabase → Authentication → Sign In / Providers → **Email** → « Minimum password length ») passe de 6 à **8**,
avec « Password requirements » = lettres et chiffres. **`MOT_DE_PASSE_MIN` (app-02) est la SEULE source du nombre côté client** —
inscription (`onbDoAuth`), changement depuis les Paramètres (`#cpNew`), récupération par lien (`#pwdRecoveryInput`) : trois portes,
un seul nombre, et le `minlength` de chaque champ le suit (verrou ①). Le serveur tranche ; le client refuse plus tôt, en français.
⚠️ **Les refus du serveur partaient en anglais** (« Password should be at least… », « Password is known to be weak and easy to
guess… » — EM-6 du go/no-go, mesuré deux fois le 2026-09-11) : `traduireRefusMotDePasse(m)` (app-02) est la SEULE table, appelée
sur les DEUX chemins (inscription ET changement), et rend le message INTACT s'il n'est pas un refus de mot de passe (verrou ⑤).
⚠️ **Ordre de bascule** : ce client d'abord (il refuse à 8 quoi que dise le serveur), le réglage serveur ensuite — l'inverse
aurait affiché l'erreur anglaise à tout inscrit entre 6 et 7 caractères.
⚠️ **LES DEUX GARDES DE CHANGEMENT SONT ALLUMÉES CÔTÉ SERVEUR (2026-09-13)** — « Require current password when updating » et
« Secure password change » — et `openChangePassword`/`doChangePassword` (app-02) en sont la contrepartie : le champ « Mot de passe
actuel » part en `current_password` (champ du SERVEUR : supabase-js transmet l'objet tel quel, quelle que soit sa version), et un
refus `reauthentication_needed` (session > 24 h) déclenche `supa.auth.reauthenticate()` → champ « Code reçu par e-mail » → renvoi
avec `nonce`, le mot de passe saisi restant dans le formulaire. **Sans ce client, une session volée suffisait à changer le mot de
passe et à verrouiller le compte hors de son propriétaire.** ⚠️ Un compte **Google seul** n'a pas de mot de passe : le serveur ne
lui demande pas l'ancien (`user.HasPassword()` faux) et le champ est MASQUÉ (`app_metadata.providers` sans « email ») — le lui
demander l'aurait bloqué devant un champ qu'il ne peut pas remplir. ⚠️ La récupération par lien est EXEMPTÉE des deux gardes
(session `recovery`, GoTrue ≥ 2.189 — prod en 2.196) : ne pas y ajouter de champ. ⚠️ `[hidden]` ne replie rien sur un `label.field`
(display:block, fiche 19) : la visibilité des deux champs se pilote et se LIT par `style.display`. Verrou :
`tests/e2e/changement-mdp-securise.spec.js` (12, dont ① et ④ éprouvés par RÉINJECTION — `current_password` retiré → 2 rouges).
`LICENSE` (racine) dit « Tous droits réservés » — il ne bloque ni la lecture ni le fork d'un dépôt PUBLIC (CGU GitHub D.5) ;
seul le passage en privé le fait. Verrou : `tests/e2e/mot-de-passe-minimum.spec.js` (7, dont ①/②/④ éprouvés par RÉINJECTION à 6).
## 🔑 CHOISIR SON MOT DE PASSE — ON AIDE, ON N'EXIGE PAS PLUS (2026-09-16)

Capture d'un essai réel : quelqu'un tape « Emma0207@ » et lit « Ce mot de passe apparaît dans des
fuites de données connues. Choisis-en un autre, plus original. » — message posé EN HAUT du
formulaire, à quatre champs du mot de passe, donc hors de l'écran d'un téléphone quand on regarde le
champ, et qui ne dit NI ce qui est attendu, NI quoi faire ensuite. Demande de Benjamin : « ne
complique pas trop la sélection ».

⚠️ **AUCUNE RÈGLE N'A ÉTÉ AJOUTÉE, ET C'EST TOUT LE LOT.** Les trois exigences affichées
(`MOT_DE_PASSE_REGLES`, app-02) sont EXACTEMENT celles que le serveur applique déjà :
`MOT_DE_PASSE_MIN` caractères, des lettres, des chiffres. Les ÉCRIRE, ce n'est pas compliquer la
sélection — c'est cesser de la faire deviner refus après refus. **Ne jamais y ajouter majuscule,
symbole ni jauge de « force »** : le serveur ne les demande pas, et une règle affichée que rien
n'applique est une friction pure. `motDePasseVerdict`/`motDePasseAccepte` sont la SEULE autorité
côté client (même contrat que `nomCompteValide` : l'appelant ne re-teste rien).

⚠️ **LE RÉGLAGE « leaked passwords » N'EST PAS DESSERRÉ.** Il est allumé depuis le 2026-09-12 et le
reste : ce qui manquait n'était pas la permission de choisir un mot de passe fuité, c'était une
SORTIE. « Choisis-en un autre » est un ordre, pas une sortie — quelqu'un dont les trois mots de
passe habituels ont fuité n'a aucune idée du suivant, et c'est là qu'on abandonne une inscription.

⚠️ **LA CAUSE SILENCIEUSE ÉTAIT UN `autocomplete`.** `#authPassword` était figé sur
`current-password` pour les DEUX onglets : en création, le trousseau iOS et les gestionnaires du
navigateur se taisaient, donc personne ne se voyait proposer « Mot de passe fort » et chacun
inventait le sien — d'où les mots de passe déjà fuités. `switchAuthTab` bascule désormais l'attribut
avec l'onglet, et lui seul (verrou ⑥). Il pose aussi le `minlength` en création **seulement** :
en connexion il barrerait un mot de passe de 6 caractères d'avant le 2026-09-13, parfaitement valide
côté serveur — enfermer un compte dehors pour un attribut d'affichage.

⚠️ **LE REFUS SE PRONONCE LÀ OÙ L'ON TAPE**, en plus du bandeau (que `mot-de-passe-minimum.spec.js`
mesure, et qui ne bouge pas) : `#authPwdRefus`, sous le champ, avec la sortie nommée. Le
discriminant « est-ce un refus de mot de passe ? » se prend sur le message **BRUT**, AVANT les
réécritures qui suivent dans `onbDoAuth` (captcha, « déjà utilisé », quota d'e-mails) — après, la
table ne reconnaîtrait plus son propre refus. Retaper efface le refus : répondre, c'est répondre.

⚠️ **« Proposer un mot de passe » remplit les DEUX champs et les affiche EN CLAIR** — un mot de
passe proposé qu'on ne peut pas lire est un mot de passe perdu, et ne remplir que le premier ferait
tomber « les mots de passe ne correspondent pas » à la ligne suivante. `motDePasseSuggere()` rend
deux mots tirés au sort et quatre chiffres (`lavande-colibri-4917`) : prononçable, conforme par
construction, et hors de toute fuite puisqu'il vient d'être tiré. Tirage par **REJET** sur
`crypto.getRandomValues` (`_aleaEntier`) — un simple `% max` favoriserait les premiers mots de la
liste ; `Math.random()` n'est qu'un repli, jamais le chemin nominal.

⚠️ **LA GARDE « lettres + chiffres » NE VAUT QU'EN CRÉATION.** Posée en connexion, elle refuserait à
la porte un mot de passe choisi avant le réglage serveur — le compte serait inaccessible sans que
rien ne l'explique. Même raison que le `minlength`. Verrou ⑤, qui mesure les DEUX sens.

⚠️ **L'AIDE VIT HORS DU `<label>` VOISIN** : un bouton posé DANS un label voit son clic détourné
vers le champ du label (même famille que le piège des liens dans la case de consentement). Elle est
peinte par `majAideMotDePasse` et par lui seul ; l'état d'une règle ne repose JAMAIS sur la couleur
(✓ / ○), et le vert retenu est `#15803d` — `#16a34a` tombe à 3,9:1 sur fond clair, sous le seuil AA
d'un texte de 12 px. Aucune ligne de `styles.css` n'a été touchée (styles en ligne, comme le reste
du formulaire) : le bloc UI-4A5 reste le dernier.

⚠️ **UN FIXTURE DE TEST PEUT DEVENIR INVALIDE SANS ÊTRE FAUX** : `exploration-anonyme-vs-compte` ⑯
posait `"motdepasse"` (sans chiffre) pour mesurer le CÂBLAGE DE PROPRIÉTÉ de la branche `signup` —
la garde le faisait sortir avant son sujet. Le mot de passe du fixture a changé, aucune assertion
n'a bougé. Même famille que « sculpture sur glace » entrée au référentiel : un test qui tient par
une prémisse finit par le dire.

Verrou : `tests/e2e/mot-de-passe-aide.spec.js` (8), **éprouvé par RÉINJECTION de cinq mutations** —
câblage de `switchAuthTab` retiré (2 rouges), écho du refus coupé (2), garde lettres+chiffres
neutralisée (1), `autocomplete` refigé (1), confirmation non remplie (1).

## 📱 DEUX TESTEUSES iPHONE, DEUX REFUS SANS SORTIE ATTEIGNABLE (2026-09-18)

Capture d'écran à l'appui, le 17/09 au soir. ① « Moi ça bloque ici, je n'arrive pas à cliquer sur
l'encadré pour confirmer mon adresse mail » — l'écran de connexion, l'encadré rouge « Confirme ton
e-mail », et rien d'autre à l'écran. ② « Moi ça bloque quand j'appuie sur les différentes options » —
le détail d'une publication, avec sa rangée ❤️ 💬 😊 partage.

⚠️ **AUCUNE DES DEUX N'A LAISSÉ LA MOINDRE TRACE D'ERREUR.** `client_errors` ne porte **rien** d'iOS
sur cinq jours, et la télémétrie ne montre que des `POST /auth/v1/token` en 400 — le refus attendu.
C'est l'angle mort déjà écrit pour la Sentinelle : *un bouton qui n'émet rien ressemble exactement au
calme*. Ces deux défauts ne pouvaient être trouvés QUE par la mesure au navigateur, en gabarit de
téléphone, sur le geste réel.

### ⚠️ ① LA SORTIE EXISTAIT DEPUIS TROIS SEMAINES — SOUS LE PLI

Le renvoi du lien de confirmation (`#authResendLink`, 2026-08-30) est posé **après** « Se connecter »
et après « Mot de passe oublié ». Mesuré sur un iPhone 12 (390 × **664** px — la hauteur UTILE sous
Safari, pas les 844 du gabarit Playwright) : le lien occupe **647–669 px captcha ÉTEINT** — à cheval sur le pli,
17 px visibles sur 22 — et **724–746 px** avec le widget Turnstile de la production, soit **82 px sous
le pli**, entièrement hors écran. La
capture s'arrête exactement sur « Se connecter ».
⚠️ **ET LA BASE LE CONFIRME, ce n'est pas une déduction** : le compte bloqué porte un
`confirmation_sent_at` égal à son `created_at`, **jamais renouvelé**. Personne n'avait jamais atteint
cette sortie — ni elle, ni quiconque.
⚠️ **ON N'A PAS DÉPLACÉ LA SORTIE, ON EN A POSÉ UNE SECONDE** là où le refus s'écrit :
`#authResendTop` (index.html), juste sous `#authMsg`, un bouton plein de 44 px avec sa phrase
d'explication — **vraie sur les DEUX chemins qui l'affichent** (« Compte créé ! » comme « confirme ton
e-mail ») : la première rédaction disait « ton compte existe déjà » à qui venait de s'inscrire, relevé
par `audit-passio`. ⚠️ **Et la branche « e-mail déjà utilisé » de l'inscription était le dernier
cul-de-sac** : recréer son compte est le geste le plus naturel de qui n'a pas reçu son lien, et cette
branche répondait « déjà utilisé » sans proposer le renvoi — même relecture. Les TROIS branches
appellent désormais `_showResendConfirmation`. Le défilement cale **le message en haut** (`block:
"start"` sur `#authMsg`), pas le bloc au centre : centré, il renvoyait « Se connecter » 18 px sous
le pli avec le captcha — le défaut qu'on venait de corriger, déplacé d'un bouton. Le lien du bas reste **à l'octet près** — six cas de `confirmation-email.spec.js` le
visent, et un verrou qui cesse d'exercer un geste cesse de le protéger.
⚠️ **`_showResendConfirmation` (app-02) reste l'autorité UNIQUE des DEUX sorties** : elle les montre,
les cache (`switchAuthTab` l'appelle avec `""` à chaque bascule) et amène la seconde à l'écran par
`scrollIntoView`. Deux pilotages pour un même état finissent toujours par diverger sur celui qu'on
oublie. ⚠️ Et le refus **NOMME** désormais sa sortie : « Confirme ton e-mail avant de te connecter :
ouvre le lien qu'on t'a envoyé, ou fais-le renvoyer juste en dessous. » Un refus sans porte de sortie
est ce qui fait abandonner une inscription — même règle que le mot de passe fuité (2026-09-16).

### ⚠️ ② ELLE ÉTAIT ENFERMÉE DANS LA PAGE DÉTAIL — ET LA VIDÉO L'A MONTRÉ, PAS LA CAPTURE

La capture montrait le détail d'une publication ; la **vidéo** (VID-20260916-WA0005, 11 s) montre le
mécanisme : l'onglet du bas s'allume à chaque tap — Profil, Messages, Rencontrer, Découvrir — et
**l'écran ne change pas**. La page détail est rendue ENTRE la barre du haut et la barre d'onglets,
son en-tête « ← Post » est hors de vue, et la barre d'onglets reste tapable par-dessus. Deux causes,
deux correctifs, et le second vaut même sans le premier :

⚠️ **UNE PAGE `position: fixed` NE VIT JAMAIS DANS `#appMain`.** `#postDetailPage`, `#eventDetailPage`
et `#offlineBanner` étaient les **seules** surfaces plein écran du dépôt posées DANS le conteneur
défilant (`overflow-y: auto; -webkit-overflow-scrolling: touch`) — toutes les autres (`#reelsViewer`,
`#modalBackdrop`, `#conv-fullpage`, `#storyViewer`, `#mediaEditor`) sont des sœurs de `<main>`. Sur
Chromium, `fixed` se cale sur le viewport quoi qu'il arrive : **le défaut est INVISIBLE au banc**
(Chromium seul ici, et `closeCurrentOverlay` fonctionnait — c'est le geste de retour que personne
ne trouve sans bouton). Sur WebKit, la page est rendue dans le scroller, défile avec lui, et la barre
d'onglets reste au-dessus. Les trois blocs sont sortis de `<main>` (index.html), et les comptes de
balises structurelles sont **identiques** avant/après (main 1, section 6, div 417/418 — l'écart
préexistant compris). Aucun style ni script ne dépendait de l'ancien emplacement (mesuré au grep).

⚠️ **ET `goTo` FERME LES DEUX PAGES DE DÉTAIL AVANT LA BASCULE D'ÉCRAN**, comme il le fait déjà pour
« Mes passions » — la règle de la fiche 19 (« toute page plein écran doit avoir son entrée dans
`closeCurrentOverlay` ET `goTo` doit la fermer avant la bascule ») n'était appliquée qu'à moitié :
les deux pages étaient dans `closeCurrentOverlay`, aucune dans `goTo`. Un onglet du bas est une
NAVIGATION : il referme ce qui est ouvert. C'est ce qui aurait libéré la testeuse dès son premier
tap, quel que soit le moteur. L'entrée d'historique de la page devient orpheline, comme pour « Mes
passions » — coût déjà accepté par `goTo` (`_navOverlayDepth = 0`).

⚠️ **ET LA SEULE SORTIE RESTANTE FAISAIT 18 PIXELS.** DEV-01 (2026-09-14) a élargi à 44/40 px la
cloche, les croix de panneau et les actions de **COMMENTAIRE**. Il s'est arrêté là. Mesuré au
navigateur sur le détail d'une publication — l'écran même de la capture : **« ← » 18×22** (la seule
sortie VISIBLE de la page — le geste de retour du système la ferme aussi, mais personne ne le trouve
sans bouton), actions **55×27 / 47×27 / 31×27 / 35×31**, tri des commentaires **91×22**, « ⋯ »
d'un commentaire **24×24**, « ⋯ » d'une publication **30×30**. Apple demande 44 pt. **Corriger une
surface, c'est corriger une surface** — et la famille se re-traque après CHAQUE correctif de ce type.

⚠️ **L'ÉLARGISSEMENT SE PREND VERS LE HAUT, JAMAIS AUTOUR.** Les quatre actions d'une publication
sont séparées de 4 px : un `inset` symétrique ferait que la zone d'une action recouvre sa voisine et
lui vole ses taps — on aurait remplacé « trop petit » par « ça fait autre chose ». D'où
`left: 0; right: 0` (la largeur vient de `min-width: 44px` — les deux boutons étroits 😊 et partage
s'ÉLARGISSENT vraiment, de 31 et 35 à 44 px, et le partage glisse de 13 px : c'est le seul déplacement
visible du lot avec `.v3-bridge`, la hauteur de rangée et de carte étant identiques — sans déborder :
la rangée fait 324 px pour 202 px d'actions) et `top: -17px; bottom: 0` — au-dessus il n'y a que le corps de la
carte, dont le seul geste est « ouvrir la publication », c'est-à-dire l'issue d'un tap raté.

⚠️ **UNE ZONE DE 44 px NE VAUT QUE SI PERSONNE NE LA PREND, et un voisin la prenait déjà.** Sur les
cartes qui portent le pont IRL, `.v3-tempt` (lot UI-3) réclame ses 44 px par `margin: -11px 0` +
`z-index: 1`, et sa moitié haute remontait **dans la boîte VISIBLE** du bouton « partager » :
mesurée à **22 px de zone pour 31 px de bouton**. Taper l'icône de partage ouvrait « Trouver une
expérience ». **Défaut ANTÉRIEUR à ce lot**, invisible parce qu'aucune des deux zones n'est peinte.
Deux zones de 44 px ne tiennent pas dans 42 px de rangée + 2 px de marge : on ne désigne pas un
gagnant (l'autre resterait volée), on **donne la place** — `.post-actions + .v3-bridge { padding-top: 11px }`,
soit 9 px de plus sous la rangée, **sur les seules cartes où le pont SUIT la rangée** (5 sur 20 :
ailleurs l'aperçu de commentaires les sépare déjà — la première rédaction l'appliquait aux 20, relevé
par `audit-passio`). En-tête, hauteur de rangée, hauteur de carte et hauteur du fil sont mesurés
identiques ; ce qui bouge est dit au paragraphe précédent.

⚠️ **ON MESURE LA ZONE PAR `elementFromPoint`, JAMAIS PAR `getComputedStyle(::after)`.** Un
pseudo-élément parfaitement dimensionné mais recouvert ne reçoit aucun tap, et l'attribut serait vert
sur le défaut — c'est très exactement comme ça que `.v3-tempt` est passé. ⚠️ **Et la première mesure
était fausse** : les bulles d'aide `.fr-tip` couvraient la rangée, la sonde rendait 1 px partout. Une
sonde qui rend une valeur absurde ne mesure pas un défaut, elle mesure un obstacle — le retrait des
bulles fait partie du banc, et la sonde NOMME qui borne la zone (`borneHaut`/`borneBas`), sinon un
rouge dit « 29 au lieu de 44 » sans dire qui vole les pixels.

⚠️ **`.comment-menu-btn` est DÉJÀ en `position: absolute`** : on ne lui pose pas `position: relative`
— c'est la leçon `.modal-close` (rouge CI #400).

⚠️ **RÉSIDUS NOMMÉS, PAS RÉGLÉS** : les actions d'un COMMENTAIRE (❤️ 💬 😊) sont à 40 px de haut mais
24–38 px de large (DEV-01 n'avait traité que la hauteur). Essayé ici par `padding` + marge négative :
mesuré, les boîtes se recouvrent alors de 10 px et le voisin reprend exactement ce qu'on donne — la
rangée (`gap: 12px`) n'a pas la place de trois zones de 44 px, ce sera une autre mise en page, pas un
élargissement ; l'avatar d'un commentaire reste 30×30. Sur l'écran d'auth, les liens « Mot de passe oublié » / « Renvoyer » passent à 44 px de
haut et les deux « 👁 » de 18×21 à 44×44 (glyphe au même endroit, le champ garde son `padding-right`).

Verrous : `ios-navigation-et-zoom.spec.js` (+3 : les trois pages hors de `#appMain` à la SOURCE, un
onglet du bas referme la publication, un onglet du bas referme la fiche d'activité),
`accessibilite-cibles.spec.js` (+3 : ⑤ les options fil ET détail, ⑥ le « ← », ⑦ les deux
« ⋯ ») et `confirmation-email.spec.js` (+3 : ⑧ la sortie tient dans un écran de 664 px **avec** le
captcha, ⑨ le bouton du haut renvoie comme le lien du bas, ⑩ les deux sorties obéissent à la même
autorité). **Éprouvés par RÉINJECTION de cinq mutations** : bloc CSS retiré → 2 rouges ; « ← »
rendu à 18×22 → 1 rouge ; `#authResendTop` retiré → 3 rouges ; pages remises dans `<main>` → 1 rouge ;
fermeture retirée de `goTo` → 2 rouges.

## 📧 Confirmation d'e-mail ACTIVE depuis le 2026-08-30 (SMTP Brevo)

`signUp` ne rend **plus** de session : le compte existe, il est inutilisable tant que l'adresse n'est pas confirmée. Depuis le 2026-09-11, PASSIO a sa propre identité : contact `passioadmin@gmail.com` (`PASSIO_EDITEUR.email`, source unique), domaine d'envoi `passio-app.fr` sur des comptes OVH et Brevo dédiés — **plus aucune référence à une autre activité de l'éditeur**. Montage complet, enregistrements DKIM/DMARC, bascule SMTP et gabarits français : `docs/SETUP_SMTP_AUTH.md`.
Deux règles à ne pas enfreindre : **`switchAuthTab` d'abord, message ensuite** (il remet `#authMsg` à zéro — tout ce qu'on veut voir survivre à une bascule se pose APRÈS elle) ; et les comptes de test ne se créent JAMAIS par `signUp` mais par `tests/e2e/compte-e2e.js` (pré-confirmés via `service_role`, aucun e-mail envoyé).
Verrou : `tests/e2e/confirmation-email.spec.js` (7). Les quatre conséquences détaillées (chemins morts d'`onbDoAuth`, renvoi de lien, anti-énumération, `authz-critical` comme barrière RLS, risque R11 DKIM/DMARC) : `docs/CONFIRMATION_EMAIL.md`.

## ✉️ NOTIFIER UN MESSAGE PRIVÉ (2026-09-09) — la cloche ne sonnait que si l'appli était OUVERTE

Envoyer un message n'écrivait **aucune** ligne `notifications` : la seule notification existante était fabriquée **localement par le destinataire** (`pushNotification` dans `_handleIncomingConvMessage`), donc uniquement si son application était ouverte à l'instant exact de l'envoi. Application fermée = message découvert par hasard en ouvrant Messages, sans cloche et sans push. Mesuré en production : la table ne portait aucune ligne `kind = 'message'` alors que `_notifEmoji` (✉️) et `openNotifTarget` (→ `openConversation`) la connaissent depuis toujours — **le tuyau existait, personne n'y versait rien**.
`supaSendMessage` lit désormais `{ error }` (le SDK ne LÈVE PAS sur un refus RLS : notifier un message refusé annoncerait un message qui n'existe pas) puis appelle `_notifierMessage(convId, msgId)`, qui écrit une ligne par destinataire et déclenche le push `notify-call`.
⚠️ **L'IDENTIFIANT EST DÉTERMINISTE** — `_idNotifMessage(msgId, destinataire)` = `n_<msgId>_<8 premiers car.>` — et c'est LUI qui empêche le DOUBLON : le destinataire en ligne fabrique le même pour sa notification locale, et la dédup par id (`pushNotification`, `mergeSupaNotifs`) écarte la seconde. Un identifiant par **destinataire**, jamais un seul par message : la clé primaire refuserait la deuxième ligne d'un groupe, en silence.
⚠️ **ANTI-SPAM** : une notification par conversation et par fenêtre de 5 min (`window._msgNotifDerniere`, mémoire volatile), **remise à zéro dès qu'un message arrive** de cette conversation — l'autre est revenu, la relance suivante doit sonner.
⚠️ **Le CONTENU du message ne voyage jamais dans la notification** (elle transite aussi par le push) : on n'annonce que l'expéditeur.
⚠️ **`supaLoadMyConversations` rendait `unread: 0` EN DUR**, et son résultat REMPLACE l'entrée locale au boot : un message reçu appli fermée n'avait donc ni cloche ni pastille au retour. Le compteur se recalcule depuis `conv_reads` (même source que le ✓✓ de `supaLoadOtherRead`), en écartant les messages de CONTRÔLE (`react`/`del`) qui feraient clignoter une pastille sans bulle.
Verrou : `tests/e2e/notification-message.spec.js` (12), dont ④ bis qui RÉINJECTE le doublon et ① ter la divergence d'environnement — **en CI le VRAI SDK se charge, et `supa.functions` y est un GETTER de prototype** : le faux client d'une suite doit s'y poser par `Object.defineProperty`, une affectation échoue EN SILENCE (vert en local, rouge en CI).
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

## 🔁 401 SUR `events` / `event_attendees` — LA MÊME ENQUÊTE TROIS FOIS DANS LA JOURNÉE (2026-09-12)

Trois issues `[SENTINELLE]` le même jour, deux tables, **une seule cause** — et la troisième ne
décrivait plus aucun défaut vivant. C'est la fiche que la chaîne ne sait pas écrire (section
précédente) : sans elle, elle rejoue l'enquête au tour suivant, ce qui est très exactement ce qui
s'est passé ici.

**La cause, établie dans le code.** `migration_irl_donnees_privees.sql` (08/09) retire à `anon`
`events.address` et `events.contact` et lui révoque `event_attendees` ; `migration_ouverture_publique`
(11/09) y ajoute `events.conv_id`. Le client demandait pourtant la liste PRIVÉE **d'abord, pour tout
le monde**, et ne retombait sur la publique qu'APRÈS le refus — une porte fermée exprès, à laquelle
on frappait une fois par session sans compte (`js/first-run.js` → `chargerContenuPublic` →
`supaLoadEvents`, PLUS le bloc « 3. Les autres requêtes » de `supaInit` : deux refus par démarrage).
⚠️ **PostgREST refuse la requête ENTIÈRE (42501) dès qu'UNE colonne manque au rôle** : ce n'est pas
« deux champs masqués », c'est « aucune rencontre ». ⚠️ **401 et non 403** : 403 quand un compte est
authentifié, **401 quand le rôle est `anon`**. Lire le CODE avant d'accuser une policy — la policy
était juste, le GRANT manque exprès, donc la cause n'est PAS une règle d'accès (hors périmètre de la
chaîne) mais un appel client qui ne devait plus partir. Correctifs : `_compteAuthReel()` (un uuid
Supabase, jamais `MY_UID`) décide des colonnes, et `_attendeesLisibles()` de la table des
participants. Verrous : `tests/e2e/evenements-cols-visiteur.spec.js` et
`tests/e2e/participants-visiteur.spec.js`.

⚠️ **« 0 COMPTE IDENTIFIÉ » EST LA PREUVE, PAS UN DÉTAIL.** `telemetry.js` ne transmet un `user_id`
que si `MY_UID` est un **uuid d'auth** (`authUserId`) : 17 refus / 0 compte veut dire « 17 refus chez
des clients SANS compte », donc le chemin visiteur, donc celui que le correctif ferme. C'est le
discriminant à lire en premier sur tout refus d'écriture ou de lecture remonté par ce canal.

⚠️ **ET LE DISCRIMINANT QUI DIT « CE N'EST PAS UN PROBLÈME DE JETON » MALGRÉ LE LIBELLÉ DE L'ISSUE** :
« refusé — jeton absent ou expiré » est le **gabarit** de `libelleApi()` pour tout 401, pas une
mesure. Un jeton mort ne connaît pas les tables : il ferait tomber `posts`, `profiles` et `passions`
dans le même démarrage. Un 401 qui ne frappe QUE `events` et `event_attendees` désigne le GRANT de
colonnes, jamais la session.

⚠️ **POURQUOI LA TROISIÈME ISSUE EXISTE, ET C'EST LA CINQUIÈME FAÇON DONT LE CANAL MANQUE SA CIBLE.**
`dejaCorrige` se tait quand **toutes** les occurrences précèdent la **FERMETURE** d'une enquête
identique (le titre est déterministe : `GET /rest/v1/events 401 · 138b32a1`). Or une enquête se ferme
à la **FUSION** de sa PR, et le défaut ne s'arrête qu'à son **DÉPLOIEMENT** — strictement plus tard
(cycle CI ~30 min), et plus tard encore pour toute page déjà chargée, qui garde son `app.js` jusqu'à
son prochain démarrage. La fenêtre de 24 h porte donc des occurrences **postérieures à la clôture et
antérieures au correctif**, et une seule suffit à rouvrir. **Une réouverture n'est pas une récidive
tant que la dernière occurrence n'est pas postérieure au DÉPLOIEMENT.**
⚠️ **Ce qui se mesure avant de croire à une quatrième**, et ça ne se lit pas dans le dépôt : le
`app.js` **servi** par https://passio-app.netlify.app porte-t-il `_compteAuthReel` ? Si oui, la
cause reportée est éteinte et il ne reste qu'à refermer. Une fiche du dépôt ne prouve pas l'état de
la production (même règle que pour l'interrupteur `irl_adult_only`).

⚠️ **CE QUI RESTAIT VRAIMENT OUVERT DANS LA MÊME FONCTION : UN MÉMO QUI SURVIVAIT À SA CAUSE.**
`_eventColsPubliquesSeulement` se pose sur **n'importe quel** refus de la demande privée — donc aussi
sur un `PGRST301` « jeton absent ou expiré », qui n'a plus aucune cause au jeton suivant. Il tenait
pourtant toute la session : pour un compte qui a **pleinement droit** à ces colonnes et dont le jeton
avait juste expiré le temps d'un démarrage (application reprise après quelques heures : le cas
normal), `address`, `contact` et `conv_id` revenaient VIDES jusqu'au rechargement complet — adresse
du rendez-vous absente, téléphone de l'organisateur absent, « rejoindre la conversation » sans
`conv_id`. Son voisin `_attendeesRefusLecture` avait sa levée sur `SIGNED_IN`/`TOKEN_REFRESHED`
depuis le début (« un silence ne doit pas survivre à la cause qu'il protégeait ») ; les deux la
partagent désormais en **UN SEUL point**, `_oublierRefusLecturesIRL()` — deux levées côte à côte
finissent par diverger, et c'est la seconde qu'on oublie. Verrou : `evenements-cols-visiteur.spec.js`
⑤ (le CÂBLAGE, à la source — une levée sans appelant serait le défaut `_notifierMessage`) et ⑤ bis
(le comportement).

## 🔁 401 SUR `POST /rest/v1/user_state` — L'ÉTAT D'UN VISITEUR PARTAIT VERS UNE TABLE QUI N'ACCEPTE QUE `auth.uid()` (2026-09-13)

Même famille que la section précédente, une table plus loin. Mesuré sur 14 jours : **261 refus, 101
sessions, 0 uuid d'auth** dans ces sessions — le chemin visiteur, et rien d'autre. `user_state` porte
86 lignes, toutes en uuid ; ses quatre policies `*_own` exigent `auth.uid()`.
**La cause est dans le client, pas dans la policy.** `getMyUserId()` fabrique un `u_<aléatoire>` pour
tout visiteur, et les gardes des chemins d'écriture d'état (`_scheduleStateSync`, `supaSaveUserState`,
le beacon de `pagehide`, `_flushPendingUserState`) ne testaient que `!MY_UID` : le placeholder passait,
et chaque `saveState()` sans compte POSTait l'état sous le rôle anonyme → 401.
⚠️ **LE TUYAU DOMINANT N'ÉTAIT PAS LE BEACON** (4 refus sur 261 précédés d'un `hidden`) mais le
debounce de 2,5 s après `saveState()`, dès le démarrage (`ios_boot_feed` → `ui_v4a4_pose` → `hint_shown`
→ 401). ⚠️ **ET LE DÉFAUT S'AMPLIFIAIT TOUT SEUL** : le 401 mettait le blob en file
(`passio_pending_user_state_u_xxx`), que le rejeu du démarrage suivant rejouait — PATCH 200 (zéro
ligne), SELECT, INSERT 401 — d'où 87 des 101 sessions avec ce PATCH. Un correctif qui n'aurait touché
que l'envoi aurait laissé la file rejouer le 401 à chaque visite.
Correctif : **une seule autorité**, `_uidEstUnCompte()` (app-02 — pas `_compteAuthReel` d'app-08,
parce que le beacon tire dans `pagehide` et qu'app-02 ne doit dépendre de rien chargé après lui), et
les QUATRE chemins passent par elle ; le rejeu retire la file d'un placeholder au lieu de la rejouer.
La **lecture** (`supaLoadUserState`) n'est PAS touchée : un GET sans compte rend 200 vide, ce n'est
pas un défaut, et `reprise-lectures-boot.spec.js` l'exerce avec le placeholder. Verrou :
`tests/e2e/user-state-invite.spec.js` (5), ⓪ à ③ éprouvés par RÉINJECTION (4 rouges sur le code
d'avant), ④ garde la porte ouverte aux comptes réels.
⚠️ **CE QUI RESTAIT OUVERT DANS LA MÊME FAMILLE EST FERMÉ LE MÊME JOUR** : `profiles`,
`story_views`, `conv_reads` et `push_subscriptions` suivaient — voir la fiche suivante.

## 🔁 TROIS TABLES DE PLUS EN 401, UNE EN 403 — ET LE 403 N'AVAIT PAS LA MÊME CAUSE (2026-09-13)

Suite directe de #367, et **son second étage**. Mesuré en production le jour même
(`telemetry_events`, `type='api'`), tous des **POST** :

| Cible | Statut | Refus | Sessions | Comptes | Dernier |
|---|---|---|---|---|---|
| `profiles` | 401 | 104 | 101 | **0** | 07:16 |
| `story_views` | 401 | 17 | 3 | **0** | 08/09 |
| `conv_reads` | 401 | 13 | 5 | **0** | 12/09 |
| `push_subscriptions` | **403** | 17 | 12 | **3** | **05:51** |
| `conv_reads` | **403** | 2 | 2 | **1** | **05:29** |

⚠️ **IL Y A DEUX CAUSES, ET C'EST LE CODE HTTP QUI LES SÉPARE — jamais le libellé.**
**401 avec 0 compte** = rôle anonyme : le placeholder `u_<aléatoire>` de
`getMyUserId()` passait la garde `!MY_UID`, exactement comme pour `user_state`.
Gardes posées sur `supaMarkRead`, `supaMarkStoryView` et — pour `profiles` — sur le
**démarrage** (`_compteAuthReel()`, l'autorité déjà présente dans app-08 : on n'en a
pas créé une troisième). **403 AVEC un compte** = le jeton est joint et valide, donc
la session existe : ce n'est pas elle qui manque.

⚠️ **ET LA GARDE DE `profiles` N'EST PAS DANS `supaEnsureProfileExists` — un run
rouge a payé cette leçon.** Posée là, elle faisait tomber **quinze cas** :
`hotfix-profil-passion-custom` en ENTIER (10), `profil-trois-autorites` (4) et
`multi-passion-integrite` ⑧ — dont l'objet est précisément « la ligne est créée
quand même », dans les états dégradés. Cette fonction a **seize appelants**,
presque tous déclenchés par un geste d'un compte réel, et son contrat est « la
ligne de `MY_UID` existe ». **Quand une garde fait tomber la suite DÉDIÉE à la
fonction gardée, ce n'est pas la suite qui a tort : la garde est trop haut.** Le
défaut mesuré ne vient que d'UN appelant — le bloc « pas de profil serveur encore »
de `supaInit` — donc c'est lui qui est gardé, **branche `catch` comprise** (sinon le
refus repart par là, et c'est invisible). Corollaire de banc : le verrou exerce
`supaInit()`, jamais la fonction à la main — appelée directement, elle resterait
verte le jour où la garde disparaîtrait du démarrage (défaut `_notifierMessage`).
⚠️ Le `SELECT` qui précède cette création n'est PAS un défaut et reste non gardé :
une lecture sans compte rend 200 vide (même raison que `supaLoadUserState`, #367).

⚠️ **UN UUID DE LA BONNE FORME PEUT ÊTRE CELUI DU MAUVAIS COMPTE.** `_compteAuthReel`
et `_uidEstUnCompte` ne regardent que la FORME ; les policies comparent à
`auth.uid()`. Aucune garde de forme ne verra jamais ce cas — d'où
`_identiteDivergeDeLaSession(uid)`, qui ne répond `true` que sur une divergence
**PROUVÉE** : session absente, illisible ou sans `user.id` → `false`, l'écriture
part comme avant. **Durcir sur un inconnu couperait des écritures légitimes pour
une cause supposée** (même raisonnement que la porte d'admission, qui échoue
ouvert). Le refus est **TRACÉ** (`diagLog`) : une divergence d'identité muette est
indiscernable d'un calme plat.

⚠️ **UNE SEULE LECTURE DU JETON POUR TROIS VERDICTS.** `_sessionSdkPersistee()`
(app-08) est désormais le seul endroit qui lit `sb-<ref>-auth-token` (v1 et v2) ;
`_analyticsSessionUtilisable` l'appelle au lieu de garder sa copie. Les questions
sont différentes — « le jeton est-il frais ? » pour les analytics, « est-ce bien
MON compte ? » pour les écritures — mais la lecture est la même, et deux copies du
parsing finissent toujours par diverger sur celle qu'on oublie. Le verrou ⓪ compte
les occurrences : **exactement une**.

⚠️ **ET LE 403 DE `push_subscriptions` N'EST MÊME PAS UN PROBLÈME D'IDENTITÉ : c'est
la PROPRIÉTÉ DE L'ENDPOINT.** La clé primaire est l'`endpoint`, qui appartient au
**NAVIGATEUR**, pas au compte. Quand un second compte se connecte sur le même
appareil, `getSubscription()` rend le MÊME endpoint et l'upsert
(`onConflict: "endpoint"`) tente de réassigner la ligne du premier :
`push_update_own` (USING `user_id = auth.uid()`) refuse, PostgreSQL rend 42501.
**Aucune policy ne peut arbitrer ça** sans autoriser un compte à revendiquer la
ligne d'un autre — c'est au navigateur de trancher, et il sait le faire : on lui
demande un endpoint NEUF (`unsubscribe()` puis `subscribe()`), **une seule fois par
session** (`window._pushEndpointRepris`), sinon deux comptes qui partagent
vraiment un téléphone se voleraient l'abonnement en boucle. L'ancienne ligne
devient orpheline et **`notify-call` la purge déjà lui-même sur 410/404** : ne pas
ajouter de nettoyage, il existe.

⚠️ **L'ÉCHEC ÉTAIT DEUX FOIS MUET, ET LE DRAPEAU MENTAIT.** `await
supa.from("push_subscriptions").upsert(...)` **sans lire `{ error }`** — le SDK ne
LÈVE PAS sur un refus RLS — puis `window._callPushReady = true` posé quoi qu'il
arrive. L'appareil se croyait abonné sans l'être : **aucune notification d'appel ni
de message application fermée**, ce qui vidait de son effet la fiche « Notifier un
message privé ». Un abonnement qui échoue en silence est pire qu'une absence
d'abonnement : il se croit fait, donc personne ne le refait.

⚠️ **`conv_messages` (403 × 285, 31 sessions, vrais téléphones) EST DÉJÀ REFERMÉ —
NE PAS REJOUER L'ENQUÊTE.** Le dernier refus est le 2026-09-10 à **07:19 UTC** et
`_reparerAppartenanceConv` (#318) a été fusionné à **07:54 UTC** le même jour :
toutes les occurrences précèdent le correctif. C'est la règle déjà écrite pour la
Sentinelle — **une réouverture n'est pas une récidive tant que la dernière
occurrence n'est pas postérieure au déploiement** — et elle vaut aussi pour un
humain qui lit un tableau de bord. Ce lot a commencé par classer ce point « le
plus coûteux à faire » : c'est la mesure qui l'a détrompé, pas la relecture.

⚠️ **LE PIÈGE DE BANC, ET IL RENDAIT DEUX CAS VERTS SUR LE DÉFAUT.** Le jeton de
session posé en `addInitScript` **a DISPARU** une fois l'app démarrée (plus aucune
clé `sb-…` dans `localStorage`) : un appareil qui porte un compte sans session
retrouvée passe par `purgerJetonAuthLocal()`, geste délibéré du produit. Posé
avant, on mesure une fenêtre que le produit referme — et comme « pas de jeton » =
fail-open, le cas passait **quoi qu'il arrive**. `_identiteDivergeDeLaSession` lit
le stockage à CHAQUE appel : le jeton se pose donc à l'instant de l'écriture, ce
qui est son contrat réel. Le cas ⑥ exige en plus que la session soit **lue**,
sinon il repasserait vert par le fail-open.

⚠️ **POINT OUVERT, DÉLIBÉRÉMENT LAISSÉ** : **d'où vient la divergence d'identité**
n'est pas établi. On sait qu'elle existe (19 refus mesurés sur deux tables), on
refuse d'écrire sous une identité fausse et on la trace — mais réaligner `MY_UID`
à chaud depuis une écriture de push serait poser un correctif sur une cause
supposée, dans un chemin (`adopterCompteConnecte`, quatre entrées) dont le dépôt
documente déjà la sensibilité. La trace `diagLog` est ce qui rendra la cause
mesurable au prochain cas.
Verrou : `tests/e2e/ecritures-identite-compte.spec.js` (9), **éprouvé par
RÉINJECTION de trois mutations** — gardes de forme remises (3 rouges), push sans
lecture d'erreur ni reprise (3 rouges), garde d'identité retirée (1 rouge, celui
qui la mesure).

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

## 🙋 NOM D'UTILISATEUR DEMANDÉ À LA CRÉATION DU COMPTE (2026-09-09)

Rapport d'un testeur : « à l'inscription le nom d'utilisateur n'est pas demandé ». Il l'était — à l'étape `name` de l'onboarding, qu'un compte neuf **peut ne jamais atteindre** depuis « Confirm email » (2026-08-30) : quand `signUp` ne rend pas de session, la personne revient par « Se connecter », branche qui pose `onboarded = true` et RECHARGE, et `boot()` entre directement dans l'app — le compte s'appelle alors « **Passionné** » (repli local) ou « **Profil** » (repli de `supaEnsureProfileExists`). La question est désormais posée au **SEUL écran que tout compte traverse** : le formulaire de création (`#authName`, premier champ, montré par `switchAuthTab` en mode `signup` uniquement).
⚠️ **CE QUE LA PRODUCTION DIT VRAIMENT (mesuré le 2026-09-10, et il faut le lire avant de raisonner sur ce lot).** « Tout compte créé depuis le 30/08 s'appelle Passionné » était une DÉDUCTION, pas une mesure, et elle est **fausse** : `select count(*) filter (where username in ('Passionné','Profil','Moi')) from public.profiles` rend **0 sur 6 comptes**. Le seul compte créé depuis a sa ligne `profiles` **26 secondes** après son compte auth, **avec son nom ET sa passion** — donc `signUp` LUI A RENDU UNE SESSION et l'onboarding a continué (lien de confirmation ouvert en 21 s sur le même téléphone). **Les DEUX chemins sont vivants**, et la moitié « sans session » n'a simplement pas encore de cas en base. Ne jamais réécrire ce paragraphe en « le nom n'était jamais demandé » : le défaut rapporté par le testeur est que le **formulaire d'inscription** ne le demandait pas, ce qui est vrai et corrigé ; « le compte s'appelle Passionné » reste un chemin POSSIBLE, jamais un fait constaté.
⚠️ **LA MÊME QUESTION NE SE POSE PAS DEUX FOIS** (2026-09-10) : ce chemin vivant fait justement enchaîner le formulaire (« Nom d'utilisateur ») sur l'étape « Comment t'appelles-tu ? ». `onbNext`/`onbPrev` sautent donc l'étape `name` quand `nomCompteValide(state.user.name)` rend un nom — **dans les DEUX SENS**, sinon le « ← Retour » de l'écran des passions rouvre l'étape évitée. ⚠️ **Sauter une étape, c'est sauter ce qu'elle PRÉPARAIT** : `onbValidateName` peignait la grille des passions et rejouait `PassioFirstRun.prefiller()` APRÈS son `onbNext()` — c'est passé dans `_onbPreparerEtape`, sans quoi l'écran suivant s'ouvre VIDE, défaut muet qu'aucune gate ne voit.
⚠️ **`nomCompteValide` (app-02) est la SEULE autorité** : normalise les blancs, refuse hors de `[2, 40]`, et l'appelant ne re-teste rien. Le refus se prononce **avant** tous les autres contrôles — c'est le premier champ de l'écran.
⚠️ **`user_metadata` est la seule mémoire qui VOYAGE** (créer sur le téléphone, confirmer sur l'ordinateur) : le nom part dans `signUp` sous DEUX clés de même valeur (`name`, relue par `nomCompteDepuisSession` ; `display_name`, affichée par le tableau de bord Supabase), et `boot()` l'applique par `appliquerNomCompte(session)` **après** `supaLoadUserState` (l'état du compte fait foi) et **avant** le profil de repli, qui lit `state.user.name`. `full_name` couvre au passage le retour Google.
⚠️ **On n'écrase JAMAIS un nom déjà choisi** — seuls les noms de remplissage (`""`, `Passionné`, `Profil`, `Moi`) cèdent, sinon un compte renommé depuis les Paramètres retrouverait son pseudo d'origine à chaque reconnexion ; et `general.username` PRIME sur `state.user.name` dans `supaEnsureProfileExists`, donc les deux sont écrits. ⚠️ **Aucune unicité n'est promise** : `profiles.username` n'a pas d'index unique en production.
⚠️ **UN SERVEUR `dist/` LAISSÉ EN VIE FAUSSE TOUS LES TESTS LOCAUX** (mesuré le 2026-09-10) : `webServer` de Playwright RÉUTILISE un serveur déjà à l'écoute sur le port 8080. Un `node scripts/servir-dist.js` oublié fait donc mesurer l'ARTEFACT PRÉCÉDENT au lieu des sources — ici, quatre cas neufs rouges et onze verts qui ne prouvaient rien. Symptôme : une fonction que l'on vient d'écrire est `<absente>` de la page. `pkill -f servir-dist.js` avant tout `npm run test:local`.
Verrou : `tests/e2e/nom-utilisateur-inscription.spec.js` (14), dont ⑦ qui mesure le CÂBLAGE à la source et sa position — le seul appelant vit dans un chemin de `boot()` qu'un banc local ne parcourt pas. Détail et point ouvert (les comptes déjà nommés « Passionné ») : `docs/lots-ui/22-NOM-UTILISATEUR-INSCRIPTION-2026-09-09.md`.

## 🎬 LE VIEUX TOUR REVENAIT SUR TOUT COMPTE NEUF — « Confirm email » avait tué son seul garde-fou (2026-09-12)

Rapport d'essai réel : « je viens de créer un compte, la validation par mail a fonctionné, mais en
arrivant sur l'app c'était l'ancien système de présentation ». Mesuré : compte créé à 11:06:37,
confirmé à 11:07:39, et le **tour historique plein écran** (`#tourOverlay`, « Étape 1 / 5 ») s'ouvrait
par-dessus le Fil — au lieu de l'arrivée directe et des aides au geste. Reproduit au banc.
⚠️ **CE N'EST PAS UNE RÉGRESSION DU LOT PREMIÈRE VISITE : C'EST SON GARDE-FOU QUI EST MORT DE VIEILLESSE.**
La règle §8 (« le tour long ne doit pas suivre l'inscription, la compréhension vient du produit ») a été
posée le 2026-08-23 **dans `onbFinish`**, qui pose `tourSeen = true` au lieu d'appeler `launchTourSafe`.
Son propre commentaire disait déjà pourquoi sauter le seul appel ne suffisait pas — quatre appelants, trois
gardés par `if (!state.tourSeen)`. Sept jours plus tard, « Confirm email » (2026-08-30) a rendu `onbFinish`
**inatteignable pour tout compte neuf** : `signUp` ne rend plus de session. **Un remède posé à UN endroit
meurt le jour où cet endroit cesse d'être sur le chemin, et rien ne le signale.**
⚠️ **LA CHAÎNE, ET LE MAILLON QUE PERSONNE NE REGARDAIT** : lien de confirmation (ou « Se connecter ») →
`adopterCompteConnecte` **PURGE `STATE_KEY`, donc `tourSeen`** → rechargement → `boot()` pose
`onboarded = true` et rend le Fil → **et ~600 ms plus tard `emoji-misc.js` appelle `initApp()`**, qui teste
`!state.tourSeen` et lance le tour. L'appelant fatal n'est ni `boot()` ni l'onboarding : c'est un
`setTimeout` de fin de fichier, écrit en 2026-06 pour un tout autre motif. Chercher « qui lance le tour »
dans `boot()` ne le trouve jamais.
⚠️ **LA RÈGLE VIT DÉSORMAIS DANS `launchTourSafe` (app-08), seul entonnoir des lancements AUTOMATIQUES** :
`if (typeof onbV2Actif === "function" && onbV2Actif()) return;`. Aucun appelant, présent ou futur, ne peut
plus imposer le tour. `startTour()` (bouton « Tour démo », panneau de dev) ne passe pas par là et reste
entier — **un refus d'imposer n'est pas un retrait** — et la coupure `PASSIO_ONBOARDING_V2 = false` rend le
parcours historique à l'octet près, `onbFinish` compris.
⚠️ **L'ANGLE MORT ÉTAIT DANS LE FIXTURE, ET C'EST LE VRAI ENSEIGNEMENT** : `onboardedState` (`app-helper.js`)
pose `tourSeen: true`. Les ~120 suites qui l'utilisent démarrent donc **toutes dans le seul état où le défaut
ne peut pas se produire**. Aucune n'était fausse ; ensemble elles étaient aveugles. **Un fixture qui neutralise
la condition d'un défaut le rend invisible à toute la batterie** — vérifier ce qu'un fixture pose *en dur*
avant de conclure qu'un chemin est couvert.
⚠️ **`offsetParent` NE MESURE RIEN SUR UN ÉLÉMENT `position: fixed`** : il y vaut `null` affiché comme masqué.
Écrit ainsi, le cas ① bis restait VERT sous réinjection du défaut. Pour un élément fixe, mesurer le `display`
calculé et le rectangle. Trouvé parce que la réinjection était faite, pas parce qu'on l'a relu.
⚠️ **Les bulles, elles, fonctionnaient** : `montrerHint` ne s'efface que tant que `PassioFirstRun.estVisiteur()`
est vrai, donc un compte les reçoit (`hint_shown` mesuré sur le compte neuf à 11:07:50). Le défaut n'était pas
« les bulles ont disparu », c'était « le vieux tour se posait par-dessus » — ne pas partir chercher les aides.
⚠️ **POINT OUVERT, DE LA MÊME FAMILLE, NON CORRIGÉ ICI** : un appareil qui PORTE un compte (`passio_uid` ou
`state.onboarded`) mais dont la session n'est pas retrouvée au démarrage (jeton expiré, hors ligne, SDK non
chargé) sort de `boot()` par **`showLanding()`** — donc sur la landing historique, ses 8 piliers, sa mention
« Beta privée » et sa promesse « Documente tes voyages » (Carnet de voyage RETIRÉ par ADR-011). Elle reste
fonctionnelle (elle porte « Se connecter »), mais elle raconte une application qui n'existe plus.
Verrou : `tests/e2e/tour-jamais-impose.spec.js` (5), dont ①, ① bis et ④ éprouvés par RÉINJECTION (② et ③
restent verts, ils gardent la coupure et le geste manuel) et ④ qui mesure à la SOURCE que `showTour()` n'a
pas d'appelant hors du moteur du tour.

## 💬 LES TROIS REPÈRES ATTEIGNENT AUSSI UN COMPTE NEUF (2026-09-12, l'après-midi)

Suite directe de la fiche précédente. Question de Benjamin : « toutes les bulles d'explications sont
en place sur les nouveaux comptes ? » **Mesuré : non.** Les trois repères (« Ce qui t'inspire » ·
« Ce que tu veux vivre » · « Ce que tu veux partager ») étaient gardés par `estVisiteur()` : ils
s'éteignaient à la seconde où un compte existe — **pour exactement les personnes à qui l'application
est envoyée**. Quelqu'un qui explore d'abord les voit ; quelqu'un qui crée son compte directement
(lien de confirmation sur un appareil neuf, chemin NORMAL depuis « Confirm email ») ne les voyait
JAMAIS, et ne pouvait pas les rejouer — « Revoir les repères » portait `.fr-only`, donc
`display:none` dès qu'un compte existe. Troisième occurrence de la même famille après
`contenuDemoSignale()` et `filDecouverte()` (2026-09-10) : **c'est l'ÉTAT qui décide, jamais la
présence d'un compte.**
⚠️ **LA CARTE DE BIENVENUE, ELLE, RESTE VISITEUR — ET C'EST SON TEXTE QUI TRANCHE.** « Crée ton
compte pour les garder », « Personnaliser mon expérience » : c'est une carte de **CONVERSION**. La
montrer à quelqu'un qui vient de créer son compte serait sourd. `poserBienvenue` garde `estVisiteur()`,
et le verrou ⑦ l'exige à la source. Ne pas « harmoniser » les deux gardes : elles ne disent pas la
même chose.
⚠️ **`reperesAutorises()` (js/first-run.js) EST LA SEULE AUTORITÉ**, et elle a deux marches : sans
compte → visiteur, inchangé ; avec compte → **il faut le verdict d'hydratation PUIS
`comptePasEncoreGarni()`**.
⚠️ **LE DISCRIMINANT NE PEUT PAS ÊTRE « PRÉFÉRENCES LOCALES VIDES ».** Un habitué qui se connecte sur
un téléphone neuf en a d'aussi vides : `adopterCompteConnecte` vient de tout purger. On tranche sur
l'état du COMPTE (`comptePasEncoreGarni()` — aucune passion voulue, personne de suivi), la même
autorité que `filDecouverte()`. Le verrou ② mesure ce cas-là, c'est lui qui protège les habitués.
⚠️ **ET IL FAUT ATTENDRE `window._etatCompteCharge`.** Interrogé trop tôt, `comptePasEncoreGarni()`
dit « vide » pendant que `user_state` arrive encore : on servirait la présentation à quelqu'un qui
utilise PASSIO depuis des semaines. Sans verdict, on s'abstient — le silence est le bon sens de
l'échec ici.
⚠️ **LE DÉFAUT INTRODUIT PAR LA PREMIÈRE RÉDACTION, ET IL ÉTAIT MUET.** `planifierReperesCompte`
appelait `planifierTour()` **UNE FOIS**. Or `planifierTour` temporise 700 ms puis abandonne **sans
reprise** si l'écran n'est pas prêt : à ~2,1 s le Fil n'a pas fini de peindre, `#feedPassionsBlock`
n'existe pas encore, `montrerEtape` refuse l'ancrage sur `offsetParent`, et **rien ne se reproduit**.
Chez un visiteur le défaut n'existe pas — `planifierAccueil` réessaie 40 fois et rappelle
`planifierTour` à chaque tour ; un compte n'avait pas cette boucle. **Mesuré** : la fonction rendait
`true` en appel direct à 5 s pendant que le câblage ne posait jamais rien. Le planificateur du compte
est donc une BOUCLE DE REPRISE bornée (40 × 600 ms, même budget que l'accueil). **Relâcher une garde
ne suffit pas : il faut vérifier qui APPELLE, et à quel moment l'écran est prêt.**
⚠️ **SANS POINT D'ENTRÉE, LE LOT SERAIT RESTÉ MUET.** `planifierTour` n'avait que deux appelants —
`planifierAccueil` (gardé `estVisiteur()`) et `surNavigation("feed")` — et `entreeDirecte()`, qui
appelle le premier, rend `false` dès qu'un compte existe. Au DÉMARRAGE, rien ne planifiait donc les
repères pour un compte. `surNavigation("feed")` bifurque désormais : visiteur → `planifierAccueil`,
compte → `planifierTour` directement (sinon le retour sur le Fil ne reposerait jamais rien).
⚠️ **LA GARDE DE `montrerHint` (app-02) DEVAIT SUIVRE, SOUS PEINE DE ROUVRIR UN DÉFAUT CONNU.** Elle
lisait `estVisiteur()` ; dès que les repères atteignent un compte, elle ne protège plus rien et les
quatre aides contextuelles se seraient posées SUR les repères — le défaut exact mesuré en capture
390 px (« une bulle POSÉE SUR la carte de bienvenue »). `aidesHistoriquesEnPause()` est la seule
autorité : **branche visiteur rendue à l'octet près** (pause toute la session), et pour un compte la
pause ne dure que le temps de la présentation — sinon on lui retirerait des aides qu'il recevait hier.
⚠️ **LA PORTE DE REJEU EST PILOTÉE EN JS, PAS EN CSS, ET DÉLIBÉRÉMENT.** `majBoutonReperes()`
(app-02, appelée par `toggleDevPanel` comme `majSectionCompte` et `majBoutonPassionsIllimitees`) :
la règle `html:not(.passio-first-run) .fr-only` ne sait pas exprimer « le module est chargé », et
ajouter une règle obligerait à toucher `styles.css`, **dont le bloc UI-4A5 doit rester le DERNIER**.
Sa condition n'est **ni « visiteur » ni « compte neuf »** : c'est le KILL SWITCH du lot, et rien
d'autre — un compte qui a déjà vu les trois repères doit pouvoir les revoir, c'est ce que le libellé
promet. Lot coupé → le bouton DISPARAÎT plutôt que de rendre un tap mort (`relancerTour` sortirait
sur la garde `actif()` : un refus qui ne se prononce pas est indiscernable d'une panne, 2026-09-04).
⚠️ **`armerAidesAuGeste` RESTE VISITEUR**, et c'est un choix de PÉRIMÈTRE : il n'est armé que par
`entreeDirecte()`. Le relâcher ajouterait trois à quatre bulles de plus (passions, envies, stories)
à un compte neuf — hors de ce qui a été demandé. Sa garde interne est restée `estVisiteur()` pour ne
pas laisser de code inerte derrière.
⚠️ **MESURER `offsetParent` SUR UN BOUTON DU PANNEAU PARAMÈTRES NE PROUVE RIEN** : la section
« Démo » est REPLIÉE au repos, donc `offsetParent` y est nul pour tous ses boutons, quoi qu'on
fasse. Le verrou ⑤ mesure le `display` calculé. (Deuxième piège `offsetParent` de la journée, après
celui du `position: fixed` — les deux trouvés par la mesure, aucun par la relecture.)
Verrou : `tests/e2e/reperes-compte-neuf.spec.js` (7), éprouvé par RÉINJECTION de **quatre** mutations
(garde de `montrerEtape`, câblage du planificateur, garde de `montrerHint`, pilotage de la porte) —
elles rougissent respectivement 4, 3, 2 et 1 cas.

## 🪦 SUPPRIMER UNE PUBLICATION — pierres tombales (2026-09-01)

Toute suppression passe par `deletePost` (app-04) : `marquerPostSupprime(id)` pose d'ABORD la pierre tombale (`state.deletedPostIds`, persistée en `localStorage` ET synchronisée par le blob `user_state`, fusionnée en **UNION** jamais par remplacement), puis `purgerPostsSupprimes()` (app-02) — seul point qui connaît les **QUATRE** tableaux où vit un post (`userPosts`, `supabasePosts`, `seed.posts`, `window._feedExtraPosts`). Ne jamais refaire ce filtrage à la main.
Un rechargement serveur s'écrit dans `supabasePosts`, **JAMAIS** dans `seed.posts`. La propriété d'un post se teste par `_estMonPost(p)` — l'AUTEUR, jamais `_source` — et se retrouve par `findPostAnywhere`.
Verrou : `tests/e2e/suppression-durable.spec.js` (8 cas). Les quatre causes du défaut, la file de suppression serveur (`passio_post_delete_outbox_v1`, `_delObRun`) et le post-mortem : `docs/SUPPRESSION_DURABLE.md`.

## ⚖️ TEXTES LÉGAUX LISIBLES SANS CODE D'ACCÈS (2026-09-11)

La LCEN (art. 1-1) impose des mentions légales à la disposition du PUBLIC ; le rideau du code d'accès masquait tout, et **en production `dist/app.js` — où vivaient les textes — n'est injecté qu'APRÈS le déverrouillage** : un visiteur sans code ne pouvait lire ni qui édite, ni qui héberge, ni comment joindre l'éditeur. Les textes et l'identité de l'éditeur vivent désormais dans **`js/legal-textes.js`**, script de TÊTE chargé juste après `access-gate.js` (donc inliné dans `index.html` par `scripts/build.js`, jamais dans `app.js`) : `PASSIO_EDITEUR`, `PASSIO_CGU_VERSION`, `PASSIO_CONFIDENTIALITE_VERSION`, et trois fonctions qui rendent le CORPS de chaque texte — `passioTexteMentionsLegales()`, `passioTexteCGU()`, `passioTextePolitique()`. L'écran du rideau (trois liens sous le pied, panneau `#pgLegalPanel`) et les modales d'app-02 (`openLegalNotice`, `openTermsOfService`, `openPrivacyPolicy`, réduites à l'enveloppe `_legalModale`) rendent le MÊME HTML.
⚠️ **UNE SEULE SOURCE, MESURÉE À L'OCTET** : `access-gate.spec.js` compare l'`innerHTML` du panneau du rideau à celui de la modale d'app-02 pour les trois textes. Toute retouche d'un texte se fait dans `legal-textes.js`, jamais dans une enveloppe. Les rendus des quatre modales ont été mesurés identiques avant/après le déplacement (1 812, 7 557, 4 713 et 1 654 caractères).
⚠️ **Ce fichier s'exécute AVANT l'application** : aucune fonction d'app-* n'y existe (`escapeHtml`, `openModal`, `$`). D'où `_legalEscapeHtml`, même table que `escapeHtml`, inscrite comme désinfectant dans `scripts/audit-echappement.js` — ne jamais faire diverger les deux tables.
⚠️ **Lire n'est pas entrer — et `aria-modal` n'isole RIEN par lui-même.** La relecture indépendante du lot a trouvé que Shift+Tab depuis le bouton × rejoignait les trois liens puis LE CHAMP DU CODE, invisibles sous l'overlay : quatre chiffres tapés là déverrouillaient l'application pendant la lecture. D'où, à l'ouverture, **`card.inert = true`** sur la carte du code (levé à la fermeture), le focus posé sur le × (`legalClose.focus()`), `focusInput` qui s'abstient tant que `legalOuvert` est posé (le focus différé de 700 ms du démarrage — mesuré avec `page.clock`, sans horloge simulée le clic arrive toujours après `load` et le cas ne mesure rien), et une garde de saisie qui vide le champ si un chiffre l'atteint quand même (navigateurs sans `inert`). Échap s'écoute au niveau du **document** (un clic sur un `<p>` du corps pose le focus sur `<body>`, et un keydown ciblé sur `<body>` ne traverse jamais `#passioGate`) et la carte du panneau est focalisable (`tabindex="-1"`). `#pgLegalPanel[hidden]{display:none}` est obligatoire : `[hidden]` ne replie rien sur un `display:flex` (fiche 19).
⚠️ **Pas de repli silencieux** : si `legal-textes.js` manque, le panneau ÉCRIT « Texte indisponible » ; `dist-build.spec.js` l'attrape sur l'ARTEFACT, où c'est le build qui décide de ce qui vit en tête de page.
⚠️ **`npm run verif` sur un poste Windows en `core.autocrlf=true`** (mesuré le 2026-09-11) : `audit-supa-stub`, `generer-ouverture --verifier` et `passions:verifier` rougissent sur des fichiers INTACTS — ils cherchent ou comparent des fins de ligne LF, et le poste a des CRLF (`git ls-files --eol` : `i/lf w/crlf`). Verts sur un worktree LF du même HEAD. Ce n'est pas le lot qui est rouge, c'est le poste ; la CI (Linux) fait foi. Les cinq autres gates ne dépendent pas des fins de ligne.
Verrous : `tests/e2e/access-gate.spec.js` (+6 : lisibles sans code · lire ne saisit rien · première seconde · inerte, mesuré APRÈS CHAQUE Shift+Tab · Échap après un clic dans le texte · source unique) et `tests/e2e/dist-build.spec.js` (+1 : sans `app.js`). **Réinjection** (sept mutations) : script de tête retiré, focus non déplacé, source unique cassée, `inert` retiré, et `inert` + garde de saisie retirés ensemble **rougissent** chacun sur le cas visé ; la garde de `focusInput` seule et `tabindex=-1` seul **restent verts** — chacun est doublé par une couche plus forte (`inert`, l'écoute d'Échap sur le document). C'est une défense en profondeur assumée : le verrou protège le comportement, pas chaque couche. Détail : `docs/CGU_ET_MENTIONS_LEGALES.md` §5 bis.

## ⚖️ CGU, MENTIONS LÉGALES ET CONSENTEMENT (2026-09-08)

Trois manques comblés avant l'ouverture à de vrais utilisateurs : le contrat (`openTermsOfService`), l'identité de l'éditeur (`openLegalNotice`) et le geste qui forme le contrat (case `#authConsent`). La politique de confidentialité, elle, existait déjà.
⚠️ **`PASSIO_EDITEUR` (app-02 jusqu'au 2026-09-11, désormais `js/legal-textes.js`) est la SEULE source de l'identité de l'éditeur, et elle n'invente RIEN.** `openAbout()` affichait « PASSIO SAS · France · contact@passio.app » — une forme juridique, un pays et une adresse qu'aucun document du dépôt n'établit, la dernière contredisant l'adresse réelle de la politique de confidentialité.
⚠️ **UN TROU N'EST PAS TOUJOURS UN TROU, et la première version a fait la faute SYMÉTRIQUE** : elle affichait huit « [à compléter] » parce qu'elle supposait un éditeur PROFESSIONNEL. Il n'y a pas de société — PASSIO est édité par une **personne physique à titre non professionnel** — et **annoncer huit manquements là où la loi n'en constate aucun est une deuxième façon de dire faux**. D'où **`PASSIO_EDITEUR.regime`, seul interrupteur** : `"particulier"` (actuel) publie l'identité COMPLÈTE de l'hébergeur du site et **rien d'autre**, sans aucun `[à compléter]` ; `"societe"` exige les huit champs et affiche « [à compléter] » EN CLAIR tant qu'ils sont vides. **Basculer est OBLIGATOIRE au premier encaissement** (les passions payantes en sont le déclencheur) : l'anonymat suppose un service non professionnel, c'est un abri temporaire, pas une destination.
⚠️ **NE PLUS CITER L'ARTICLE 6-III DE LA LCEN : il est ABROGÉ** (loi n° 2024-449 du 21 mai 2024, dite SREN). L'identification de l'éditeur est à l'**art. 1-1**, l'anonymat du non-professionnel à l'**art. 1-1, II**. **L'art. 6-I-5 est abrogé aussi** — le signalement de contenu illicite relève du **DSA (règlement UE 2022/2065), art. 16** depuis le 17 février 2024. **Une mention légale qui cite un article mort est une mention légale fausse** ; le verrou ⑧ refuse `6-III` et `6-I-5` dans le texte rendu.
⚠️ **L'anonymat tient à DEUX conditions CUMULATIVES** : publier le nom ET l'adresse postale complète de l'hébergeur du SITE (Netlify, Inc., 101 2nd Street, San Francisco — dans ce régime ce n'est pas un détail, c'est la SEULE identité publiée), et lui avoir communiqué ses éléments d'identification. **L'hébergeur du site (LCEN) n'est pas le sous-traitant des données (RGPD, Supabase)** : les confondre publierait la mauvaise identité. Un juriste doit relire les deux textes.
⚠️ **Le consentement n'est demandé qu'où un contrat se forme** : la case n'est à l'écran qu'en mode `signup` (`switchAuthTab`), et `onbGoogleAuth` l'exige dans ce mode SEULEMENT — le bouton Google est unique pour les deux modes. `state.user.cgu = { version, acceptedAt }` : **sans la version, « a accepté » ne dit rien**, une réécriture des CGU rendrait la trace inexploitable (`PASSIO_CGU_VERSION`).
⚠️ **Le piège du `<label>`** : les liens vers les CGU et la politique vivent DANS le label de la case — l'activation d'un label part du clic sur un de ses descendants, donc ouvrir les CGU COCHERAIT le consentement, un accord donné par le geste qui sert à le lire. D'où `preventDefault` + `stopPropagation` sur les deux liens (même famille que « `input.click()` remonte à son conteneur »). ⚠️ `switchAuthTab` pose `display: "flex"` et **jamais `""`** : `label.field` est `display:block` en CSS, rendre la main au CSS remettrait le texte SOUS la case.
⚠️ **Les CGU ne décrivent que ce que le code applique** (13 ans → `onbValidateAge` ; majorité IRL → `requireAdmission` ; signalement → `reportUser`/`blockUser` ; suppression du compte). Changer une de ces portes rend le texte MENTEUR, et aucun test ne peut le voir.
Verrou : `tests/e2e/cgu-consentement.spec.js` (11), dont ⑧/⑧ bis qui mesurent les DEUX régimes et ⑩ qui n'ouvre les Paramètres que par des GESTES. Détail, champs à renseigner et points ouverts : `docs/CGU_ET_MENTIONS_LEGALES.md`.

## 🔞 PASSIO EST RÉSERVÉ AUX MAJEURS (2026-09-09) — la règle change, pas la barrière

L'app passe de **13 ans** à **18 ans révolus** : `onbValidateAge` (app-02) refuse en dessous de 18, la case de consentement, les CGU (§2, §3, §7, §10, §11) et la politique de confidentialité (§6) le disent, et `PASSIO_CGU_VERSION` passe à `"2026-09-09"` — **la version SUIT le texte**, sinon un accord donné sur les CGU « 13 ans » vaudrait pour celles « 18 ans ».
⚠️ **« Réservé aux majeurs » est une règle CONTRACTUELLE, pas une garde technique, et le texte le dit.** L'âge est **DÉCLARATIF** : rien ne le vérifie. La seule barrière SERVEUR de majorité est la RLS de l'IRL (`irl_adult_only`) ; le fil, les messages et les publications n'en ont AUCUNE. Ne jamais écrire ni laisser croire que l'âge est contrôlé.
⚠️ **NE PAS remonter à 18 le pré-filtre d'`admissionValiderAnnee` (app-07)** — erreur commise puis défaite le jour même, révélée par le verrou « l'année part quand même au serveur ». Entre 13 et 17 ans la déclaration doit **PARTIR au serveur** pour y être enregistrée : c'est elle qui rend le refus DURABLE. Refuser localement ne garde RIEN, donc la personne ressaisit une autre année et passe. Le pré-filtre n'écarte qu'une saisie absurde (< 13 ans), et son message ne cite plus aucun seuil d'accès.
⚠️ **Cible supprimée = tout ce qui la vise part avec** : `admissionRefusHTML` promettait « le fil, les passions, les messages te reste ouvert » — faux dès que l'app entière est 18+. Le texte ET son verrou sont partis avec la règle.
⚠️ **UN `+` EN TROP A AVALÉ UN ARTICLE ENTIER DES CGU, sans une erreur.** L'insertion du §11 a laissé `p(§11) + +p(§12)` : le `+` unaire sur une chaîne rend **`NaN`**, et « 12. Fin du contrat » a disparu du rendu, remplacé par le texte `NaN`. **`node --check` était vert, les 8 gates étaient vertes** — seul le verrou e2e `/supprimer ton compte/i` l'a vu. Toute insertion dans une chaîne concaténée par `+` se relit **au rendu**, jamais au parseur.

**Les clauses de protection du lancement** (beta diffusée à des testeurs) sont dans les CGU et **verrouillées une par une** par `cgu-consentement.spec.js` ⑦ : service EN L'ÉTAT sans garantie, données pouvant être perdues, aucune vérification des membres, rencontres « à tes risques et périls », obligation de moyens, §11 « Ta responsabilité » (seul responsable + garantie de l'éditeur). ⚠️ **La réserve d'ordre public est ce qui rend la limitation OPPOSABLE** : une clause qui exonère de TOUT est réputée non écrite (clause abusive) et peut faire tomber l'article entier — `dol, faute lourde, dommage corporel` restent réservés, et le verrou l'exige. Ne jamais « nettoyer » cette phrase comme une redite.

## 🔞 ADMISSION 18+ ET COLONNES EXPLICITES — le CLIENT (2026-09-08)

Une migration appliquée en production le 2026-09-08 retire à `anon` le droit de lire `events.address` et `events.contact` (l'adresse exacte d'un rendez-vous et le téléphone de son organisateur étaient lisibles SANS COMPTE), et réserve `event_attendees` aux comptes connectés. Ce lot est la contrepartie CLIENT, obligatoire.
⚠️ **`select("*")` EST LE PIÈGE.** PostgREST refuse la requête ENTIÈRE (42501) dès qu'UNE colonne manque au rôle : un `*` ne masque pas deux champs, il fait **disparaître toutes les rencontres** pour tout visiteur sans compte. `supaLoadEvents` demande donc `_EVENT_COLS_PUBLIC` / `_EVENT_COLS_PRIVE` en toutes lettres, avec repli mémorisé sur la liste publique au premier refus — il fonctionne donc avant comme après la migration. **Toute colonne ajoutée à `events` doit l'être AUSSI dans ces listes**, sinon elle ne remonte pas : un oubli se voit comme une donnée vide, jamais comme une erreur.
**La porte d'admission 18+** (`requireAdmission(ctx)`, app-07) est posée sur `setEventRsvp` et `submitEvent`, APRÈS `requireAuthentication` — on ne demande pas son âge à quelqu'un sans compte. Le RETRAIT n'est jamais gardé (`null` et `declined` passent toujours). `admissionRappelServeur()` pousse au démarrage l'année déjà saisie, pour que les comptes EXISTANTS soient admis sans rien ressaisir.
⚠️ **CETTE PORTE ÉCHOUE OUVERT, et c'est l'inverse VOULU de `irlProposalVerdict`** : elle double une frontière déjà tenue par la RLS, donc un statut illisible (règle serveur absente, réseau coupé) la rend TRANSPARENTE — retenir couperait l'IRL à tout le monde pour une panne de courtoisie. Ne jamais la « durcir » en fail-closed.
⚠️ **`MY_UID` NE PROUVE PAS QU'UN COMPTE EXISTE, et la porte l'a enfreint** : `getMyUserId()` fabrique un `u_<aléatoire>` pour TOUT visiteur, donc la garde s'ouvrait AU BOOT et le rappel partait appeler le RPC en production sous une identité inexistante — en consommant son drapeau « une fois par session ». **Invisible en local** (le SDK vient d'un CDN, `_supaReal` reste faux) et **rouge en CI**, qui l'atteint : un test vert en local et rouge en CI est presque toujours une divergence d'environnement de cette famille. `admissionCompteReel()` exige désormais un vrai uuid Supabase.
Verrou : `tests/e2e/admission-18-plus.spec.js` (17).

## 🔞 ADMISSION 18+ — fondation serveur APPLIQUÉE EN PRODUCTION le 2026-09-08, interrupteur **ALLUMÉ** (mesuré le 2026-09-10)

`migrations/migration_admission_18_plus.sql` branche enfin la garde de majorité de #136 sur les surfaces d'écriture IRL : **organiser** (`events` INSERT), **s'inscrire / changer d'avis / pointer** (`event_attendees` INSERT et UPDATE) et **rejoindre la conversation** (`can_join_event_conversation`) exigent `user_safety.majority_at <= CURRENT_DATE`. Le défaut qu'elle ferme (audit IRL-02/MOD-08) n'était pas une barrière cassée : la barrière existait depuis #136 et **rien ne l'appelait** — `irl_interaction_allowed` ne vivait que sous `passio_irl_proposal_v1`, éteint.
**Le RETRAIT n'est JAMAIS conditionné** : passer en `declined` et supprimer sa ligne restent permis à tous — un compte rattrapé par la règle doit pouvoir sortir, jamais revenir (et le check-in réécrit `rsvp='going'`, donc il est couvert par la même policy UPDATE).
⚠️ **Interrupteur SERVEUR** (`public.access_policies`, clé `irl_adult_only`) — le premier du dépôt, les 35 autres drapeaux étant côté client : `UPDATE … SET enabled = TRUE` par le canal ③ d'ADR-012. **Il est ALLUMÉ depuis (au plus tard) le 2026-09-10 : `enabled = true`, mesuré.** Cette fiche a annoncé « ÉTEINT » jusque-là — une affirmation de sécurité fausse, et la plus coûteuse des trois familles de dette documentaire : elle décide d'un geste. **L'état d'un interrupteur SERVEUR ne se lit pas dans un fichier du dépôt, il se mesure** (`select key, enabled from public.access_policies`, canal ① d'ADR-012). Conséquence VIVANTE : sur 7 comptes de production, **2 seulement** ont une ligne `user_safety` — les 5 autres passent donc par la fenêtre « Ton année de naissance » (`requireAdmission` → `undeclared` → `admissionOuvrirPorte`) avant de pouvoir organiser ou rejoindre une rencontre. C'est le comportement VOULU, pas un défaut : le vérifier avant de « réparer » quoi que ce soit. **Ne JAMAIS supprimer la ligne pour éteindre** : `adult_access_enforced()` est fail-closed, ligne absente = admission **EXIGÉE**. La table n'est ni lisible ni écrivable par `anon`/`authenticated` (aucun GRANT, aucune policy).
**La porte CLIENT est branchée** (`requireAdmission(ctx)`, app-07, posée sur `setEventRsvp` et `submitEvent` APRÈS `requireAuthentication`) et `admissionRappelServeur()` pousse au démarrage l'année déjà saisie, pour que les comptes EXISTANTS soient admis sans rien ressaisir. ⚠️ **CETTE PORTE ÉCHOUE OUVERT, et c'est l'inverse VOULU de `irlProposalVerdict`** : elle double une frontière déjà tenue par la RLS, donc un statut illisible (migration non appliquée, réseau coupé) la rend TRANSPARENTE — retenir couperait l'IRL à tout le monde pour une panne de courtoisie. C'est ce qui rend le lot déployable AVANT la migration. Ne jamais la « durcir » en fail-closed. ⚠️ ORDRE D'ALLUMAGE : migration → contrôles verts → client déployé → PUIS `enabled = TRUE`. Allumer avant le client couperait l'IRL à tout le monde (2 lignes `user_safety` pour 6 comptes en prod).
⚠️ **`MY_UID` NE PROUVE PAS QU'UN COMPTE EXISTE, et la porte l'a enfreint** : `getMyUserId()` fabrique un `u_<aléatoire>` pour TOUT visiteur, donc `admissionCanalPret()` s'ouvrait AU BOOT et `admissionRappelServeur()` partait appeler le RPC en production sous une identité inexistante — en consommant son drapeau « une fois par session ». **Invisible en local** (le SDK vient d'un CDN, `_supaReal` reste faux) et **rouge en CI**, qui l'atteint : un test vert en local et rouge en CI est presque toujours une divergence d'environnement de cette famille. `admissionCompteReel()` exige désormais un vrai uuid Supabase. Le client demande sa propre porte par `adult_access_status()` → `off` | `admitted` | `undeclared` | `minor` ; `adult_access_enforced()` et `is_adult_declared()` sont des aides internes **sans EXECUTE pour `authenticated`**. ⚠️ **Un `WITH CHECK` ne voit que la ligne FINALE, jamais l'ancienne** : l'exception « declined » laissait un compte non admis écrire `checked_in_at`, `rating` et `feedback` (une preuve de participation) dans la même requête, et la policy « Update organisateurs », sans `WITH CHECK`, rendait `author_id` réassignable par un co-organisateur. Les deux passent donc par des TRIGGERS (`trg_event_attendees_admission`, `trg_events_admission`), seuls à voir `OLD`. ⚠️ Un garde de dérive qui ne cherche que `cmd = 'INSERT'`/`'UPDATE'` est AVEUGLE à une policy `FOR ALL` (`cmd = 'ALL'`) — le gabarit « Enable all operations » du tableau de bord Supabase, donc la dérive la plus probable. Verrous : `tests/sql/migration-admission-18-plus.test.sh` (133 contrôles, gate CI) et `tests/e2e/admission-18-plus.spec.js` (16), qui joue les DEUX états de l'interrupteur, 14 mutations et 26 contrôles d'exploitation. Procédure, retour arrière et les huit points ouverts : `docs/ADMISSION_18_PLUS.md`.

## 🔒 PIÈCES JOINTES DE MESSAGERIE — la lecture était OUVERTE À TOUS (2026-09-08)

Mesuré en production : la policy `passio_media_read` de `storage.objects` était `FOR SELECT` au rôle `{public}` avec pour seule condition `bucket_id IN ('content','attachments')`. **N'importe qui, sans compte, pouvait LISTER et lire tout le seau `attachments`** — photos, fichiers et messages vocaux des conversations privées (12 objets, 4 conversations au 2026-09-08). Ce n'était pas une fuite par URL devinée, c'était une énumération.
`migrations/migration_storage_lecture_cloisonnee.sql` (**PARTIE A APPLIQUÉE EN PRODUCTION** — mesuré le 2026-09-09 : `passio_media_read` a disparu, remplacée par `passio_content_read` et `passio_attachments_read_membre`) applique à la LECTURE le prédicat qui gouverne déjà l'ÉCRITURE depuis le 2026-08-17 : `is_conv_member((storage.foldername(name))[2], auth.uid())` — le chemin étant `attachments/<convId>/<fichier>`, le deuxième segment EST la conversation. Aucun prédicat nouveau n'est inventé.
⚠️ **La PARTIE A ne casse rien et peut s'appliquer seule** : le client lit par `getPublicUrl`, donc la route `/object/public/…`, qui contourne la RLS tant que le seau est déclaré public. On ferme l'énumération et l'API authentifiée, pas la lecture par URL exacte. ⚠️ **La PARTIE B — passer le seau en privé — est ÉCRITE le 2026-09-11** (lot client des URL signées + instruction ⑥ de `migration_ouverture_publique_2026-09-11.sql`, à coller APRÈS le déploiement du client) : voir la section « OUVERTURE PUBLIQUE GRATUITE ».
⚠️ Le seau `content` reste lisible par tous, délibérément : il porte les médias publics du fil, qu'un visiteur sans compte doit voir. Limite assumée : une publication d'un compte PRIVÉ y est donc lisible par URL — autre lot.
Verrou : `tests/sql/migration-storage-lecture.test.sh` (22 contrôles, gate CI), qui mesure d'ABORD le défaut sur la policy réelle de prod, puis le referme, puis éprouve 4 mutations.

## 📍 RENCONTRES — adresse, téléphone et participants n'étaient PAS privés (2026-09-08)

Audit IRL-01/IRL-03 (P1), vérifié en production : `events` et `event_attendees` sont lisibles par `anon` (policy `USING (true)` + GRANT de table). **L'adresse exacte du rendez-vous, le téléphone de l'organisateur et la liste NOMINATIVE des participants d'une rencontre physique sont lisibles sans compte, par un simple appel REST.**
`migrations/migration_irl_donnees_privees.sql` (**APPLIQUÉE EN PRODUCTION** — mesuré le 2026-09-09 : `anon` garde `title`, perd `address` et `contact`, et n'a plus aucun droit sur `event_attendees`) laisse `events` lisible sans compte — c'est le parcours d'entrée du produit — mais retire à `anon` les colonnes `address` et `contact`, et réserve `event_attendees` aux comptes connectés.
⚠️ **ON NE PEUT PAS RETIRER UNE COLONNE D'UN GRANT DE TABLE** : PostgreSQL ne soustrait pas un privilège de colonne à un privilège de table. Il faut `REVOKE SELECT ON TABLE … FROM anon` puis `GRANT SELECT (col, col, …)`. La liste est EXHAUSTIVE, et c'est voulu : une colonne ajoutée demain est PRIVÉE tant que personne ne l'a déclarée publique.
⚠️ **`select("*")` EST LE PIÈGE DU LOT.** PostgREST refuse la requête ENTIÈRE (42501) dès qu'une seule colonne manque au rôle : un `*` ne masque pas deux champs, il fait disparaître TOUTES les rencontres pour tout visiteur. `supaLoadEvents` demande donc `_EVENT_COLS_PUBLIC` / `_EVENT_COLS_PRIVE` en toutes lettres, avec repli mémorisé sur la liste publique au premier refus. **Toute colonne ajoutée à `events` doit l'être aux DEUX endroits** — le banc ④ ter compare les deux listes à l'octet près.
⚠️ `lat`/`lng` restent lisibles sans compte : la carte est l'écran d'entrée d'un visiteur. Décision assumée, pas un oubli — la fermer demande une position approchée pour les non-inscrits, donc un autre lot. `event_comments` et `event_reactions` restent publics eux aussi.
Verrou : `tests/sql/migration-irl-donnees-privees.test.sh` (22 contrôles, gate CI), qui mesure d'ABORD le défaut, puis le referme, puis éprouve 3 mutations dont « le GRANT de table rendu à anon ».

## 🧰 APPLIQUER LES CORRECTIFS DE SÉCURITÉ — deux outils, un seul geste (2026-09-08)

Les trois migrations du 2026-09-08 (pièces jointes, rencontres, admission 18+) demandaient neuf gestes manuels dans le bon ordre, dont trois oubliables sans que rien ne le signale. Deux outils les remplacent, et **les deux sont éprouvés à chaque commit** par `tests/sql/appliquer-securite.test.sh` (27 contrôles, gate CI) :
- **`migrations/APPLIQUER_TOUT_2026-09-08.sql`** — le chemin SANS terminal : un seul copier-coller dans l'éditeur SQL de Supabase, **une seule transaction** (une erreur annule tout), rejouable, et il finit par un TABLEAU DE VERDICT qui dit OK/ECHEC par correctif. ⚠️ **C'est un MIROIR, jamais une source** : il est généré par `scripts/generer-appliquer-tout.py` à partir des trois migrations, et le banc ⓪ refuse une dérive — corriger une migration sans régénérer laisserait un fichier qui applique l'ANCIENNE version, en silence.
- **`scripts/appliquer-securite-2026-09.sh`** — le chemin terminal : préflight → migration → contrôles pour chaque lot, avec **arrêt net** au premier BLOQUANT ou ÉCHEC (on ne passe jamais au lot suivant sur une base dont on n'a pas la preuve qu'elle est saine). `--verifier` ne change rien et dit ce qui manque.
⚠️ **NI L'UN NI L'AUTRE N'ALLUME LE 18+**, et une relance ne rétrograde jamais un interrupteur déjà allumé. L'allumage reste un geste séparé, APRÈS le déploiement du client.
⚠️ Le socle des bancs (`tests/sql/socle-prod-admission.sql`) porte désormais les 21 colonnes de `events` que la prod a et que `socle-prod.sql` n'avait pas : un `GRANT` colonne par colonne échoue sur la PREMIÈRE colonne absente, et le banc accusait la migration d'un défaut qui n'était que celui de son socle.

## 🧯 LA RESTAURATION A ÉTÉ FAITE — et six défauts que la relecture ne voyait pas (2026-09-14)

EXP-01 de la contre-revue Astra, l'un des trois bloquants intacts : « personne n'a jamais reconstruit la base de bout en
bout ». C'est fait, sur le projet « PASSIO staging » (`fcksxofaelcdmmifnwjo`, réactivé par l'API de gestion, PG 17.6 comme
la prod) : **40 tables, 8 comptes, 67 médias, 0 écart**, base structurellement identique (16 compteurs d'objets égaux, mêmes
`get_advisors`), même frontière anonyme (`events.address` 401, `event_attendees` 401). Trois outils, tous par l'API de
gestion (canal ③ d'ADR-012, jamais la CLI) : `npm run sauvegarde -- --complete` → `npm run schema:executable` (le DDL de
la prod, `scripts/schema-executable.js`, 16 sections) → `npm run restaurer -- --archive <dossier> --projet <ref> --schema
<ddl>` (`scripts/restaurer-donnees.js`, verdict table par table). Récit, mesures et limites : `docs/RECUPERATION.md`.
⚠️ **`restaurer` REFUSE la production ET le projet du manifeste** (en dur) ; `--purger` vide la cible. Le staging a été
purgé après la preuve — **une copie des données réelles ne reste pas dans un second projet**.
⚠️ **LES PRIVILÈGES NE SONT PAS DANS LES POLICIES.** Une reconstruction « tables + policies » rend `events.address` lisible
sans compte (seuls des GRANT de colonnes le protègent) et `is_conv_member` appelable par `anon` — Supabase donne EXECUTE à
PUBLIC à la création, un `revoke … from anon` seul ne ferme rien. Le DDL porte privilèges de table, de colonne, d'EXECUTE
(PUBLIC révoqué d'abord) et options de vue (`security_invoker`). C'est la différence entre « la même structure » et « la
même frontière », et c'est l'exercice qui l'a montrée, pas la relecture.
⚠️ **`insert … select * from json_populate_recordset` POSE NULL SUR TOUTE COLONNE ABSENTE DU JSON** — le DEFAULT ne joue
pas. Une colonne ajoutée après l'archive (`follows.created_at`, `reports.status`) faisait tomber la table entière : la
liste de colonnes est explicite. ⚠️ **Le chargement passe par le SQL, triggers utilisateur coupés** : par PostgREST,
`trg_rate_limit` refuse la 11ᵉ ligne et `rate_limit_insert` réécrit `created_at`. Les contraintes restent actives — un
lot refusé se rejoue ligne à ligne DANS la base (un aller-retour : l'API plafonne à ~60 appels/min, 429 mesuré) et chaque
motif est nommé : l'archive du 11/09 portait les 97 lignes `event_*` orphelines que la FK du 14/09 refuse. **Un écart au
verdict est une information.** ⚠️ Mesures au passage : un `user_state` de **4,7 Mo** (413 de l'API de gestion → PostgREST
pour cette ligne), une vidéo de 30,9 Mo dans un seau `content` plafonné à 26 Mo (limite levée le temps du dépôt),
`storage.protect_delete` interdit le DELETE SQL (purge par l'API). Ce qu'une restauration ne rend PAS : mots de passe,
identités OAuth, configuration du projet (auth, SMTP, secrets, Edge Functions) — liste écrite dans le doc.
⚠️ Le brouillon local `scripts/schema-origine.js` / `migrations/00_ORIGINE_PROD.sql` (non versionné) décrit l'état du
**17/08** (35 tables, 12 fonctions) et passe par `supabase db query`, retiré : à réconcilier avec `schema-executable.js`
avant d'en faire la baseline NET-07. Verrou : `tests/unit/restaurer-donnees.test.mjs` (7, dans `verif`).
⚠️ **LE RETOUR ARRIÈRE APPLICATIF PREND 2 SECONDES, PAS 45 MINUTES** (EXP-03, exercé le 14/09 à 20 h 50) :
`npm run rollback:netlify -- --restaurer precedent` (`scripts/rollback-netlify.mjs`) remet en ligne un déploiement de
production DÉJÀ CONSTRUIT (`POST /deploys/<id>/restore`) et ne dit « en ligne » qu'après avoir relu `release.json` sur le
site — 1,8 s aller, 1,1 s retour, mesurés. `rollback.yml` (PR de revert par la CI) reste le chemin PROPRE. Ce qu'un
rollback Netlify NE défait PAS : une migration (chaque migration porte son retour arrière), une Edge Function, le service
worker déjà installé. Il n'existe AUCUN kill switch serveur par fonctionnalité : les `passio_*="0"` sont locaux à l'appareil.
⚠️ **79 lignes `user_state` sur 86 étaient les états de comptes SUPPRIMÉS** (essais de juin–juillet, d'avant `delete-account`),
dont une de 4,8 Mo (avatar + couverture en base64, d'avant l'expurgation du 16/08) — purgées le 14/09 avec 63 notifications et
18 `conv_reads` orphelines. Une suppression de compte faite hors de `delete-account` (tableau de bord) recrée des orphelins :
il n'y a pas de purge périodique, c'est écrit dans le registre (PRO-06).
⚠️ **LE CLIENT SAIT VISER LE STAGING (SUP-04, 2026-09-14)** : `window.PASSIO_SUPABASE_CIBLE = { url, anon }` posé AVANT
app-08 (`_cibleSupabase`, forme vérifiée, sinon ignoré) fait viser ce projet à tout le client. Suites `prod` :
`PASSIO_SUPABASE_URL` + `PASSIO_SUPABASE_ANON` + `SUPABASE_SERVICE_ROLE_KEY` du staging → `tests/e2e/cible-supabase.js`
pose la cible avant chaque `page.goto` ; artefact : `scripts/build.js` avec les deux mêmes variables. Mesuré : authz-critical,
blocage-acces, user-state-horodatage verts contre `fcksxofaelcdmmifnwjo`, production intacte. **La CI, elle, écrit encore en
production** tant que `deploy.yml`/`sentinelle-distante.yml` ne posent pas la cible (lot `.github`, contre-revue). Le staging
ne porte AUCUNE donnée personnelle (référentiels seuls) ; ne jamais y reverser une archive complète sans la purger après.
`docs/STAGING.md`. Verrou : `tests/e2e/cible-supabase.spec.js` (5, ② éprouvé par réinjection).

## 🚦 AUDIT GO/NO-GO DE COMMERCIALISATION (2026-09-10) — et les cinq défauts qu'il a trouvés

Question posée : « j'envoie l'app aux utilisateurs, je commercialise, c'est ok ? » Réponse en deux
seuils, à ne JAMAIS confondre : **envoyer à des testeurs** est possible ; **commercialiser** ne l'est
pas — il n'existe **aucun chemin d'encaissement** (recherche exhaustive : ni Stripe, ni PayPal, ni
Paddle, ni achat intégré), et surtout **les CGU en vigueur promettent la gratuité et fondent
l'exonération de responsabilité dessus** (art. 2 et art. 10). Encaisser un euro rend ces deux
articles faux et fait tomber le bouclier avec eux. Décision : `docs/CHECKLIST_COMMERCIALISATION.md`
(refondue — l'ancienne datait de juin et cochait Wallet et CDV, deux fonctionnalités RETIRÉES) ·
107 constats et leurs contre-expertises : `docs/AUDIT_COMMERCIALISATION_2026-09-10.md`.

⚠️ **LA FAMILLE COMMUNE DES CINQ DÉFAUTS CORRIGÉS : UNE GARANTIE QUI S'ÉTEINT AU MOMENT OÙ ELLE
COMPTE.** Ce n'est pas une coïncidence, c'est le mode d'échec à chercher en premier ici.

⚠️ **① LE CONTENU DE DÉMONSTRATION NE SE DISAIT QU'AUX VISITEURS.** L'étiquette « Exemple PASSIO »,
les chiffres muets d'une activité et le refus de participation étaient conditionnés à
`estVisiteur()` : ils s'éteignaient **à la création du compte**, donc pour exactement les personnes à
qui l'application est envoyée. Mesuré : **550 publications de démonstration et 29 comptes fabriqués**
(`app-01-diag-seed.js`) contre **33 publications réelles** en production — un fil fabriqué à 94 %,
sans étiquette, et une inscription possible à une rencontre qui n'existe pas, chez un organisateur
qui n'existe pas. Le discriminant est désormais `contenuDemoSignale()` = `actif() && appPrete()` :
le kill switch du lot, **jamais l'existence d'un compte**. Un compte ne rend pas le décor vrai.

⚠️ **② LA NOTIFICATION DE MESSAGE PRIVÉ ÉTAIT BRANCHÉE SUR UNE FONCTION MORTE, ET LA FICHE DISAIT
LE CONTRAIRE.** `_notifierMessage` n'était appelée que par `supaSendMessage`, qui n'avait **aucun
appelant dans tout le dépôt**. Le correctif du 2026-09-09, ses **12 verrous** et sa section de
CLAUDE.md portaient donc sur un chemin que personne n'emprunte — et la production le disait :
**0 ligne `notifications` de type `message`**, y compris pour le message envoyé après le
déploiement. Les deux vraies voies sont `_sendTextToSupa` (app-04, texte) et `sendMessageToSupabase`
(app-09, média) ; elles notifient maintenant dans leur **branche de succès**. `supaSendMessage` est
RETIRÉE : c'est elle qui a rendu le défaut invisible, en offrant au correctif un endroit plausible où
se poser et aux tests un endroit plausible où être verts. ⚠️ **Les 12 verrous appelaient tous
`_notifierMessage` À LA MAIN** — aucun ne mesurait le câblage. Le 13ᵉ le fait, à la SOURCE.
**Une fonction morte qui double une fonction vivante est pire qu'un trou.**

⚠️ **③ QUATRE PORTES DE SIGNALEMENT SUR CINQ ANNONÇAIENT UN SUCCÈS SANS LE VÉRIFIER.** `reportUser`,
`reportPost`, `reportCommentEntry` et `reportEvent` appelaient `supaReport` **sans `await`** et sans
lire `{ error }`, puis remerciaient inconditionnellement. Seule `reportPassion` faisait bien. Ce
n'était pas théorique : la policy est `WITH CHECK (reporter_id = auth.uid()::text)`, et un visiteur
porte un `MY_UID` fabriqué — son signalement était REFUSÉ en silence pendant qu'il lisait « notre
équipe va vérifier ». Or « Signaler cet événement » **est** proposé aux visiteurs. Et le motif
n'était **jamais** renseigné : les cinq appelants passaient `""`, ce que les 2 lignes de production
confirment. ⚠️ **Mais le vrai trou est en aval et reste OUVERT** : `reports` n'a **aucune colonne de
statut**, aucun outil de lecture hors passions, aucune alerte. Un signalement n'arrive nulle part.

⚠️ **④ LE PREMIER ÉCRAN APRÈS UNE INSCRIPTION ÉTAIT VIDE.** Depuis « Confirm email », `signUp` ne
rend pas de session : l'onboarding (âge → prénom → passions) n'est **jamais atteint**, `boot()` pose
`onboarded = true` avec un profil de remplissage `_parDefaut` que `restoreFeedPassions` écarte, et
`feedFollowingOn` valant `true`, le compte lisait « Tu ne suis encore personne ». Le fil de
découverte l'aurait sauvé, mais il exigeait `estVisiteur()`. **C'est l'ÉTAT qui doit décider, pas la
présence d'un compte** : `filDecouverte()` couvre désormais aussi `comptePasEncoreGarni()` (aucune
passion voulue — le profil `_parDefaut` n'en est pas une — et personne de suivi).

⚠️ **⑤ UN TEXTE ANONYME DEVENAIT LE PROMPT D'UN AGENT DONT LA PR EST AUTO-FUSIONNÉE.**
`client_errors` accepte un INSERT **de tout visiteur non authentifié** (policy « Insert erreurs »,
rôle `public`, `with_check` vrai), et ses colonnes `message`/`stack` étaient recopiées telles quelles
dans le corps **ET LE TITRE** d'une issue `[SENTINELLE]` — label `sentinelle` + préfixe + OWNER,
c'est-à-dire les trois conditions exactes qui arment l'auto-fusion. Déclencher était trivial :
`classer()` retient un groupe dès **2 comptes**, `uid` est une colonne libre, et la production ne
porte que ~22 erreurs. ⚠️ **Le titre était la seule partie qu'aucune clôture ne protégeait** : il
porte désormais l'**empreinte normalisée**, rien de librement choisi. Le corps passe par
`desamorcer()` (`sentinelle-detecter.mjs`, 6 verrous unitaires) : lignes en forme d'instruction
retirées, marqueurs de structure neutralisés, longueur bornée — **et un VRAI message d'erreur doit
survivre intact**, sinon on ne peut plus établir de cause. ⚠️ **Le vrai correctif est en base**
(`migrations/migration_fuites_2026-09-10.sql`, colonne `auth_uid` posée par le serveur) : le
désamorçage est une barrière, pas la porte. `lireErreurs` gère les DEUX états, avec repli signalé.

⚠️ **CE QUI RESTE OUVERT — LISTE RAMENÉE À CE QUI L'EST VRAIMENT** (liste du 2026-09-10,
re-mesurée le 2026-09-12 : **six de ses points étaient déjà refermés**, voir plus bas). La migration
d'ouverture est **APPLIQUÉE** (verdict 13 × OK), donc les canaux Realtime portent leurs policies et
le seau `attachments` est **privé**. DKIM et DMARC sont **POSÉS** (`npm run verif:dns`, mesuré).
La sauvegarde a **tourné** pour la première fois le 2026-09-12, archive chiffrée puis déchiffrée et
relue dans le même run.

**CETTE LISTE EST VIDE DEPUIS LE 2026-09-12.** Les quatre gestes hors dépôt qu'elle nommait —
Realtime « Allow public access » OFF, fournisseur Anonymous désactivé, protection des mots de passe
compromis, et l'« authentifié » de Brevo — sont **tous constatés faits**, les deux premiers par le
run 5 de `controle-realtime.yml`, les deux autres sur les tableaux de bord Brevo et Supabase le
même jour. Le raisonnement de chacun reste juste (un DNS qui résout ne dit rien de ce que le
fournisseur en a conclu ; sans « Allow public access » OFF les policies Realtime ne sont pas
opposables) — ce sont les FAITS qui ont changé. Résidus assumés déjà écrits plus bas : identité
déclarative de l'appelant entre comptes, oracles pour un compte connecté.

> **MESURÉ LE 2026-09-12 (run 5 de `controle-realtime.yml`) — DEUX DES TROIS SONT FAITS.**
> « Allow public access » est **COUPÉ** : le canal public est refusé avec, en toutes lettres,
> `PrivateOnly: This project only allows private channels` — les policies de `realtime.messages`
> sont donc bien opposables. Le fournisseur **Anonymous est DÉSACTIVÉ** (`signInAnonymously()`
> refusé : « Anonymous sign-ins are disabled »). Ne plus les compter comme des gestes à faire.
> **ET LE TROISIÈME AUSSI, LE MÊME JOUR** : « Prevent use of leaked passwords » (API HaveIBeenPwned)
> est **ACTIVÉ**, constaté sur Authentication → Email du tableau de bord. Aucune API ne l'expose et
> `get_advisors` ne la signale pas : elle se lit là, ou se constate à l'inscription. L'« authentifié »
> de Brevo est **ACQUIS** lui aussi, constaté sur son tableau de bord. **Plus aucun geste hors dépôt
> n'est en attente.**
> ⚠️ **DEUX RÉGLAGES VOISINS SONT RESTÉS À OFF, ET C'EST UN CHOIX À FAIRE, PAS UN OUBLI CONSTATÉ** :
> « Secure password change » et « Require current password when updating ». Tant qu'ils sont éteints,
> **une session volée suffit à changer le mot de passe** sans connaître l'ancien ni se
> réauthentifier — donc à verrouiller le compte hors de son propriétaire. Le minimum est par ailleurs
> à **6** caractères (Supabase recommande 8) et « Password requirements » n'est pas renseigné. Rien
> de cela n'est un défaut du produit ; c'est un arbitrage friction/sécurité qui appartient à
> Benjamin, et il est écrit ici pour ne pas être redécouvert comme une surprise.
> ⚠️ **Ne pas confondre avec le « Statut de la marque », qui reste rouge (« Sans marque »)** : c'est
> le *branded subdomain*, qui remplace les liens de SUIVI de Brevo par le domaine du projet. Il ne
> concerne que des campagnes marketing et n'a **aucun effet** sur la délivrabilité d'un e-mail de
> confirmation. Un voyant rouge à côté d'un voyant vert appelle la réparation du mauvais.
> ⚠️ **ET CE VERDICT A MIS TROIS RUNS À SORTIR POUR DEUX RAISONS QUI N'ÉTAIENT PAS DANS LE
> PRODUIT** : le discriminant de refus ne connaissait que des mots anglais de permission et ratait
> `PrivateOnly` (donc un vrai refus était classé « panne ») ; et le `bash -e` que GitHub pose sur
> `run:` tuait l'étape sur `node … | tee` avant la garde écrite pour le code 3 — `shell: bash {0}`.
> **Une garde placée après une commande que `-e` rend fatale est du code mort, et plus trompeuse
> qu'un trou : on a écrit le cas, on croit donc l'avoir traité.** Même parenté que le `try/catch`
> autour d'un appel qui rend une promesse (« newestWorker is null »).

⚠️ **ET DEUX AFFIRMATIONS DE CE FICHIER ÉTAIENT FAUSSES** : l'interrupteur `irl_adult_only` était
annoncé ÉTEINT, il est **ALLUMÉ** ; et `docs/CHECKLIST_COMMERCIALISATION.md` cochait Wallet et CDV.
**L'état d'un interrupteur serveur ne se lit pas dans un fichier du dépôt, il se mesure.**

## 🚧 EDGE FUNCTIONS SANS PLAFOND — un compte confirmé facturait l'IA en boucle et réveillait qui il voulait (2026-09-12, soir)

Question de Benjamin : « je vais envoyer l'app à des milliers de personnes, confirme-moi qu'elle est sécurisée ».
Re-mesure depuis l'extérieur avec la seule clé anon (lecture de chaque table, écritures, listage des seaux,
schéma OpenAPI, fonctions sans jeton, historique git) : **tout ce que les lots des 8–11/09 ont fermé est bien fermé**
(41 tables RLS, aucune écriture anonyme sauf `client_errors` bornée, seau `attachments` privé, `get_advisors` sans
ERROR, aucun secret dans l'historique — seule la clé `anon` y figure, ce qui est normal). Deux trous restaient, tous
deux derrière l'authentification : **`ask-ai` et `notify-call` n'avaient AUCUN plafond**. Le commentaire d'`ask-ai`
promettait un « rate-limit léger (table optionnelle ai_usage, sinon ignoré) » — la table n'a jamais existé, rien ne
comptait : un compte confirmé pouvait facturer l'API Anthropic en boucle. Et `notify-call` réveillait N'IMPORTE QUEL
membre, sans limite, **y compris quelqu'un qui avait bloqué l'appelant** (MOD-03 du go/no-go : « seul canal qui perce »).

⚠️ **LA MÉMOIRE D'UNE EDGE FUNCTION N'EST PAS UNE MÉMOIRE.** Le premier correctif comptait dans une `Map` au niveau
du module : déployé, puis mesuré en production — **23 appels consécutifs, 23 acceptés**. Le runtime Supabase ne
garantit rien entre deux requêtes ; une garde qui n'existe que dans un isolat froid n'existe pas. Le compte vit
donc **en base** : `supabase/functions/_shared/plafond.js` lit et écrit `analytics_events` (table existante, purge à
13 mois, index en place, écrite par service_role) — un événement `edge_<fonction>` par appel **accepté**, rien pour
un refus (sinon insister repousserait la fenêtre). Panne de lecture ou d'écriture = refus (fail-closed). Plafonds :
`ask-ai` 8/min · 60/h ; `notify-call` 20/min · 200/h. Mesuré après redéploiement : 20 × 200 puis 429 ; 8 × 400 (corps
vide, compté, zéro coût) puis 429. Le refus est un **429 `Retry-After`** : `sendAIQuery` retombe déjà sur son moteur
local, les appelants de `notify-call` avalent l'échec — aucun écran ne casse.

⚠️ **`notify-call` LIT `blocks` DANS LES DEUX SENS** et rend exactement la réponse « aucun appareil abonné » — ni
l'un ni l'autre ne doit apprendre le blocage par là. Mesuré en prod avec un compte jetable : sans blocage `sent: 2`,
cible qui bloque `sent: 0`, émetteur qui bloque `sent: 0`. Chaque champ affiché est **borné** (`text` 200, `fromName`
60, emojis 8) et `toUserId` doit ressembler à un UUID **avant** d'entrer dans le filtre `.or()` de PostgREST — une
virgule ou une parenthèse y changerait le sens de la requête. Résidu assumé, inchangé : `fromName`/`text` restent
déclaratifs entre comptes.

⚠️ **Le fichier testé est CELUI que Deno déploie** : `plafond.js` est en `.js` pour que `node --test
tests/unit/plafond.test.mjs` (10 verrous, dont ⑧ fail-closed et ⑩ réinjection de la boucle) charge le même
fichier sans transpileur. Déploiement : `supabase functions deploy ask-ai` / `notify-call` (la CLI **est** installée
et liée sur ce poste — `supabase functions list` le prouve ; l'ADR-012 ne retire que `db query`). ⚠️ Sur ce poste,
`core.autocrlf=true` fait ROUGIR `audit-supa-stub.js` et `generer-ouverture.js --verifier` (ils cherchent `
}
`
dans des fichiers relus en CRLF) — vert en CI, fichiers identiques à `origin/main` : ce n'est pas le produit.

**Ce qui reste, et qui n'est pas du code** : le dépôt est PUBLIC (le code se clone en une commande — voir la réponse
du 2026-09-12 sur la copie), pas de captcha à l'inscription (SEC-06 : Turnstile, à poser dans la semaine), CSP
`script-src 'unsafe-inline'` (152 `onclick` inline dans index.html : tout XSS résiduel devient exécution), 2FA des
comptes GitHub/Supabase/Netlify/Brevo non mesurable d'ici, « Secure password change » OFF, mot de passe minimum 6.
## 🚀 OUVERTURE PUBLIQUE GRATUITE — SEPT DÉFAUTS SERVEUR, UN LOT CLIENT, DEUX CANAUX D'EXPLOITATION (2026-09-11, après-midi)

Benjamin : « commercialiser, c'est la rendre publique gratuitement et la faire utiliser à un
max d'utilisateurs ». Le matin, la re-mesure disait « sûre pour des testeurs avertis, pas pour
le public » ; ce lot ferme l'écart. Mode d'emploi et gestes restants (coller le SQL, trois
interrupteurs du tableau de bord Supabase, DKIM/DMARC, une sauvegarde à déchiffrer une fois) :
**`docs/OUVERTURE_PUBLIQUE_2026-09-11.md`**. Migration : `migrations/migration_ouverture_publique_2026-09-11.sql`
(une transaction, verdict à 13 lignes) · banc `tests/sql/migration-ouverture-publique.test.sh` (117, gate CI)
· verrous client `tests/e2e/ouverture-publique.spec.js` (35) · unitaires `tests/unit/moderation-alerte.test.mjs` (8).

⚠️ **UN ORACLE N'EST PAS UNE FUITE DE TABLE, ET AUCUN AUDIT RLS NE LE VOIT.** `is_conv_member(conv, uid)` est
`SECURITY DEFINER` et était **exécutable par `anon`** (`get_advisors` le signalait ; `has_function_privilege` l'a
confirmé). Toutes les tables de messagerie étaient bien fermées — mais `events.conv_id` était dans le GRANT colonne
d'`anon` et `profiles.id` est public : la liste **nominative** des membres de la conversation d'une rencontre se
reconstituait sans compte, alors que `event_attendees` venait d'être fermée le 08/09. **Une porte fermée sur une table
se rouvre par une fonction** : après toute migration de confidentialité, lire `get_advisors` ET
`has_function_privilege('anon', …)` sur chaque `SECURITY DEFINER`. ⚠️ Révoquer seul aurait fait lever « permission
denied » aux policies qui l'appellent au rôle courant : elles passent au rôle `authenticated`, et un visiteur obtient
**zéro ligne sans erreur** — jamais de bruit dans le tableau de bord pour un refus légitime. ⚠️ `post_is_visible` et
`comment_target_visible` RESTENT ouverts à `anon` : un visiteur lit les commentaires d'une publication publique par eux.
⚠️ Retirer `conv_id` du GRANT sans le retirer de `_EVENT_COLS_PUBLIC` ferait disparaître **toutes** les rencontres pour
tout visiteur (42501 sur la requête entière) : le banc compare les deux listes à l'octet, et `_EVENT_COLS_PRIVE`
= publique + `address, contact, conv_id`.

⚠️ **BLOQUER N'AVAIT D'EFFET QUE SUR `conv_members`.** La personne bloquée pouvait toujours vous suivre, vous écrire dans
le 1:1 existant, commenter, aimer et vous notifier. Six policies INSERT exigent désormais `not is_blocked_with(...)` via
trois aides `SECURITY DEFINER` (`post_auteur_bloque`, `event_auteur_bloque`, `conv_1a1_bloquee`) — SECURITY DEFINER parce
qu'un commentaire vise parfois une ligne que la RLS du rôle courant ne rend pas. **Borné aux 1:1** pour les messages :
dans un groupe la personne bloquée reste membre, c'est le retrait du groupe qui relève de l'organisateur. Un commentaire
sur un post SEED (sans ligne `posts`) passe toujours : le banc le mesure.

⚠️ **LE DÉBIT N'ÉTAIT BORNÉ QUE SUR TROIS TABLES, ET `rate_limit_insert` POSE `created_at = now()`.** C'est voulu (un client
antidaterait pour échapper au compte) et c'est un changement de sémantique pour `posts` : une publication rejouée depuis la
file hors ligne porte désormais l'heure du SERVEUR. `follows` n'avait pas de `created_at` — le trigger aurait levé « record
new has no field » à chaque abonnement ; la colonne est ajoutée. Les tables à INSERT **anonyme** (`client_errors`,
`telemetry_events`) n'ont pas d'identité fiable : `limiter_debit_global()` plafonne la table entière par minute (120 /
3 000). Un attaquant qui sature ce plafond fait perdre de la télémétrie, jamais la base. ⚠️ Dans un banc, la borne compte
les lignes du SOCLE : un compte qui a déjà publié dans la minute ne peut pas servir à mesurer « 10 puis refus ».

⚠️ **UN CANAL REALTIME PRIVÉ SANS POLICY EST REFUSÉ** : déployer `private: true` avant les policies aurait coupé appels,
frappe et lives. La sonnerie (`_subscribeCallRing`, abonnée au démarrage, UN SEUL point de création pour `ring:`/`call:` :
`_callChannel`) sert de **sonde** : un `CHANNEL_ERROR` dont le message parle de permission/policy pose
`window._rtPriveIndisponible` et tout repart en public — une coupure réseau ne fait PAS replier. ⚠️ **Les policies ne
sont opposables que si le tableau de bord Supabase interdit les canaux publics** (Realtime → « Allow public access » OFF) :
tant qu'il les permet, un client qui omet `private: true` écoute encore. C'est un geste du tableau de bord, pas du dépôt.
⚠️ **ET CE GESTE TUE TOUT CANAL RESTÉ PUBLIC** : `realtime:db` (accusés de lecture, interactions, arrivée dans une
conversation) et `conv_specific:<conv>` l'étaient encore, sans policy — la red team l'a vu, pas le lot. **TOUS** les
`supa.channel(` du dépôt portent désormais `private:` (le verrou ⑨ balaie les trois fichiers), chacun avec son propre
repli sur refus de policy (`_creerCanalDb`, `_creerCanalConvSpecifique`, `_creerCanalTyping`) ; la policy
`realtime:db` est ouverte à `anon` aussi — le canal n'ouvre RIEN, chaque table garde sa RLS.
Résidu assumé : l'identité de l'appelant dans la charge utile reste déclarative **entre comptes**.

⚠️ **RED TEAM DU MÊME JOUR — LA CHARGE UTILE D'UN BROADCAST EST HOSTILE, ET UN UPDATE EST UNE ÉCRITURE COMME UNE AUTRE.**
Revue adversariale en lecture seule du lot (agent `passio-red-team`, vérifié en production par `execute_sql`), dix
constats, tous refermés le jour même sauf deux résidus écrits : ① **P0 — XSS par sonnerie** : `_callRenderIncomingUI`
posait `inv.emoji` dans `innerHTML` sans échappement, et la policy `ring:%` laisse tout compte émettre — une invitation
`{ emoji: '<img onerror=…>' }` exécutait du script chez n'importe quel compte connecté (vol du jeton de session). La
policy Realtime ne regarde que le TOPIC, jamais le contenu : **tout champ d'un `payload` broadcast s'échappe à
l'affichage**, comme `comment_interactions` (`_emojiSur`, borné à 4 caractères, éprouvé par RÉINJECTION). ② **P1 —
`conv_messages."Update propre"` était `USING (from_id = moi)` SANS `WITH CHECK`, et rien ne figeait `conv_id`** : un
message se DÉPLAÇAIT par UPDATE dans le 1:1 d'un compte qui vous a bloqué ou dans le groupe d'une rencontre dont on n'est
pas membre (`events.conv_id = 'evgrp_' || id`, ids publics). Même trou sur `post_comments.post_id`. Le lot ② ne gardait
que l'INSERT — **une garde posée sur l'INSERT seul se contourne par l'UPDATE** ; `WITH CHECK` reprend la condition
d'INSERT et `trg_identifiants_figes` fige les identifiants (`WITH CHECK` ne voit que la ligne finale). ③ Un compte
BLOQUÉ pouvait encore faire sonner : le bloqueur est dans le TOPIC (`ring:<uid>`), la policy `passio_rt_emettre` le lit
(`is_blocked_with(substr(topic, 6))`) ; et `_callOnInvite` borne la cadence (un callId neuf par message faisait
réafficher l'écran d'appel en boucle). ④ `callId = <uid>_<horodatage>` se DEVINAIT (uid public, milliseconde proche) et
`call:%` est lisible par tout compte → offre SDP (adresses IP) et `hangup` à portée d'un tiers : `_callIdAleatoire()`.
⑤ Les demandes d'abonnement EN ATTENTE se lisaient sans compte (`follows` : deux SELECT `true`) : `follows_lecture`
n'ouvre `pending` qu'à ses deux bouts. ⑥ Un live obéissait à n'importe qui (`offer` détournait le flux d'un spectateur,
`end` coupait pour tous) : `_vliveDeLHote(d)` exige `from = video_lives.author_id` sur les huit ordres d'hôte, et un
`roffer` n'est accepté que du relais ASSIGNÉ. ⑦ `reports.target_type` (libre, ≤ 40 car.) finissait tel quel dans le
corps d'une issue PUBLIQUE : liste blanche (`autre` sinon) + `CHECK` en base. ⑧ Une URL signée valait **7 jours** — un
membre retiré lisait encore une semaine : **1 heure**. ⑨ Sur un doublon 23505, `supaFollowUser` rendait `accepted` par
défaut : une demande en attente devenait « ✓ Suivi » ; le statut local prime. ⑩ La ligne `notifications` d'un abonnement
était écrite par le client qui s'abonne : **`follows_notifier` (serveur) l'écrit** avec un identifiant déterministe
(`n_fr_`/`n_fw_`/`n_fa_` + 8 car. de chaque uid — même famille que `_idNotifMessage`), le client ne pousse que le PUSH
(`_pousserPushNotif`) — et écrit encore la ligne lui-même **tant que la base n'a pas `status`** (pas de colonne = pas de
trigger : `window._followsSansStatut` est le discriminant des deux états).
⚠️ **RÉSIDUS ÉCRITS, PAS RÉGLÉS** : `from` reste déclaratif **entre comptes** dans un live (un compte connecté peut se
dire l'hôte — fermer cela demande un topic d'hôte gardé par policy) ; `is_conv_member`/`is_blocked_with` restent des
oracles pour un compte **connecté** (les policies `authenticated` les appellent au rôle courant : leur retirer EXECUTE
ferait lever « permission denied » partout — c'est très exactement ce que ① avait dû contourner pour `anon`).
⚠️ **ET UNE SUGGESTION DE LA RED TEAM ÉTAIT FAUSSE** : « révoquer EXECUTE aux aides appelées seulement par des policies,
elles s'exécutent au rôle propriétaire ». Non : SECURITY DEFINER change le rôle DANS la fonction, l'APPEL exige toujours
EXECUTE pour le rôle courant. Une revue adversariale se vérifie contre le code réel avant d'être appliquée (règle de
`docs/REVUE_INDEPENDANTE.md`).
⚠️ **PUIS `audit-passio` A RELU LES CORRECTIFS EUX-MÊMES, ET EN A TROUVÉ TROIS DE TRAVERS** : ① **un identifiant
déterministe rend un verdict ÉTERNEL** — `follows_notifier` rafraîchit la MÊME ligne à chaque nouvelle demande, et le
verdict « refusée » mémorisé par id (`demandesAbonnementTraitees`) aurait affiché « Demande refusée », sans bouton, pour
toujours : le verdict est HORODATÉ (`{ verdict, at }`, `_verdictDemandeAbonnement`), périmé dès qu'une notification plus
récente arrive, et `mergeSupaNotifs` l'efface. ② **une correction inatteignable depuis son appelant** — « sur doublon, le
statut local prime » lisait `etatSuivi()`, mais `toggleFollowUser` pousse l'optimiste dans `following` AVANT d'appeler
`supaFollowUser` : l'état local disait toujours « suivi ». Sur doublon on RELIT la ligne serveur (`follows_lecture`
l'ouvre au demandeur) ; le verrou qui posait `followingPending` à la main testait la fonction, pas le câblage — le cas
② bis pose l'état RÉEL de l'appelant. ③ **un second appelant oublié** — `_vliveToggleFollow` (live) ignorait `ok:false`
et `pending` : il a les trois états de `toggleFollowUser`. Et **un à-côté qui casse le contrat** : `notifications` porte
`trg_rate_limit` (60/min, tous genres), un refus y aurait fait échouer l'INSERT `follows` par le trigger — le notifier
avale l'exception (`raise warning`), la notification n'est pas le contrat. Mesuré avant déploiement (canal ①) : rien de
la migration n'est en prod (ni `status`, ni trigger, ni policy), le discriminant `_followsSansStatut` est donc exact.

⚠️ **LES PIÈCES JOINTES PORTENT `data-pj`, PAS `src`.** Un seau privé refuse l'URL publique : la poser en `src` ferait
demander au navigateur une URL en 400 avant la signature. `attrMediaSrc(url, "src"|"href")` (app-02) tranche selon
`pieceJointeChemin(url)`, qui reconnaît les DEUX formes en base (Supabase `/object/public/attachments/…` et CDN
`/media/attachments/…`) ; `signerPiecesJointes(root)` s'appelle **APRÈS chaque `innerHTML`** qui peint des messages (fil
`renderConvFpThread`, panneau Médias `openConvFiles`) et le lecteur vocal signe au premier tap. Le nom d'objet est
`attachments/<conv>/<fichier>` DANS le seau `attachments` — segment doublé depuis toujours, c'est `foldername(name)[2]` que
la policy compare : ne pas « nettoyer ». `cdnUrl` ne réécrit plus ce seau (un objet privé n'a rien à faire dans un cache
public). Repli sur l'URL d'origine si la signature échoue : rien ne casse tant que le seau est public, et une fois privé
seul un membre lit. ⚠️ La partie ⑥ de la migration (seau privé) est **la dernière instruction** et se colle **après** le
déploiement du client.

⚠️ **`follows.status` : LE SERVEUR TRANCHE, LE CLIENT SE CORRIGE.** `trg_follows_statut` écrit `pending` vers un compte
privé quoi que le client envoie ; `follows_accepter` (UPDATE, cible seule, vers `accepted` seulement) et
`trg_follows_figes` (identifiants figés — `WITH CHECK` ne voit que la ligne finale, la cible aurait pu réécrire
`follower_id` et fabriquer un abonné). `posts`, `stories` ET `post_is_visible` exigent `status = 'accepted'` : trois
endroits qui doivent dire la même chose. Côté client, `toggleFollowUser` reste optimiste dans le sens « suivi » puis se
CORRIGE au verdict (`Demande envoyée`, `state.user.followingPending`) ; un second tap annule ; `libelleBoutonSuivi`
(app-02) est la SEULE table des trois libellés. ⚠️ **PostgREST joue l'insert et son `select` dans la même transaction** :
demander `status` sur une base qui n'a pas la colonne rend 42703 ET n'écrit pas l'abonnement — d'où
`_erreurColonneStatutAbsente` et `window._followsSansStatut`, mémorisé pour la session au premier refus. ⚠️ Le verdict
d'une demande (`demandesAbonnementTraitees`) vit dans l'ÉTAT DU COMPTE, pas sur l'objet notification :
`mergeSupaNotifs` remplace celui-ci à chaque relecture et les deux boutons réapparaîtraient.

⚠️ **UN SDK EN VERSION FLOTTANTE EST UN DÉPLOIEMENT QUE PERSONNE N'A DÉCIDÉ.** `@supabase/supabase-js@2` venait de jsDelivr
sans intégrité, MapLibre d'unpkg : une publication cassée ou compromise atteignait la production sans commit et sans
qu'aucune gate puisse le voir. Les deux vivent dans `js/vendor/` (épinglés, `LICENCES.md`), copiés dans `dist/` par
`scripts/build.js` (règle `data/` : un asset qui n'existe qu'en CI est un asset qu'on découvre manquant en production), et
la CSP ne connaît plus que `'self'`. ⚠️ `audit:globals`/`audit:handlers`/`audit-echappement` ne scannent que `js/*.js` de
premier niveau — `js/vendor/` en est exclu par construction, ne pas y déposer de code maison. ⚠️ Les suites qui coupaient
le SDK par `**/cdn.jsdelivr.net/**` coupent désormais `**/js/vendor/supabase-js*` ; en local, MapLibre se charge
désormais (il était bloqué par le bac à sable réseau), comme en CI depuis toujours.

⚠️ **`psql -q` AVALE LES ÉTIQUETTES DE COMMANDE** (« INSERT 0 1 », « DO ») : un banc qui attend ce texte lit une chaîne
vide et accuse la migration. `AUTH_OK`/`ANON_OK`/`RT_OK` rendent « OK » ou le message d'erreur. Et une assignation
`res="$(psql …)"` sous `set -e` TUE le banc au premier refus SQL — là où un `$(…)` en argument de fonction ne tue rien.

⚠️ **LE DÉPÔT EST PUBLIC** : l'archive de sauvegarde (comptes, e-mails, messages) est chiffrée AVANT d'être déposée en
artefact (phrase = `SAUVEGARDE_PASSPHRASE`, sinon SHA-256 de la clé `service_role` : qui détient cette clé détient déjà
la base, le repli n'affaiblit rien et n'exige aucun geste), puis **déchiffrée et relue** dans le même run — une
sauvegarde jamais restaurée est une intention. L'issue `[MODÉRATION]` ne porte ni identifiant, ni cible, ni motif : combien,
depuis quand, quel type. Label `moderation`, jamais `claude` : décider d'un signalement est un geste humain.

## 🚪 OUVERTURE AU PUBLIC — UN SEUL COLLER SQL, ET LA CI QUI MANGEAIT LA BANDE PASSANTE (2026-09-11)

Le lot d'ouverture (#329) est **déployé** (`7665c7ac`, job « Déploiement production » vert à
06:27 UTC). Restaient sept gestes manuels. Ce lot-ci en replie trois en un, et corrige en code la
cause d'un huitième.

### `migrations/OUVERTURE_2026-09-11.sql` — trois gestes en base, un seul copier-coller

Généré par `node scripts/generer-ouverture.js` à partir de `migration_fuites_2026-09-10.sql`
(partie ①) plus deux gestes d'exploitation dont ce script EST la source (② téléphones,
③ purge de télémétrie). ⚠️ **C'est un MIROIR pour sa partie ①** : corriger la migration sans
régénérer laisserait un fichier qui applique l'ANCIENNE version, en silence — même famille que
`generer-appliquer-tout.py` du 2026-09-08. `--verifier` est dans `npm run verif`, donc en CI.
⚠️ **`VACUUM` ne peut pas y vivre** (interdit en transaction) : il est décrit en second coller,
facultatif — et `VACUUM (ANALYZE)` rend l'espace RÉUTILISABLE tandis que `VACUUM FULL` rend les
OCTETS, ce qui n'est pas la même promesse.
Verrou : `tests/sql/ouverture-2026-09-11.test.sh` (34 contrôles, gate CI) — il l'EXÉCUTE, le rejoue
une seconde fois, et **six mutations exigent que le tableau de verdict ROUGISSE**. ⚠️ Un tableau de
verdict qui dirait OK quoi qu'il arrive est PIRE que pas de verdict : on croirait avoir appliqué.

### ⚠️ LA CI CONSOMMAIT 95 % DE LA BANDE PASSANTE DU PROJET, PAR UN CHEMIN INDIRECT

Mesuré le 2026-09-10 : **1,12 Go d'egress en 24 h** sur un plan qui en offre **10 Go par MOIS**,
dont **1,06 Go pour un seul avatar de 2,59 Mo demandé 399 fois**. Le demandeur n'était pas un
utilisateur, c'était `tests/e2e`.
⚠️ **LE CHEMIN EST À UN ÉTAGE SOUS TOUT CE QUE L'ISOLATION REGARDAIT.** `profiles` n'est
délibérément PAS dans `TABLES_DISTANTES` (une lecture rendue vide ferait tenter une ÉCRITURE en
production à `supaEnsureProfileExists`) : les profils réels remontent donc avec leurs vraies URLs
d'avatar, et c'est le **NAVIGATEUR** qui télécharge — une fois par `page.goto`, six shards, plus de
cent suites. Aucune de ces images n'est jamais regardée par un test.
`sansDonneesDistantes` sert désormais un **PNG 1×1** sur `/storage/v1/(object|render/image)/`.
⚠️ **ON RÉPOND UNE IMAGE VALIDE, ON N'ABORTE PAS** : le produit porte des `onerror` qui repeignent
la boîte en gris avec une hauteur minimale (`renderPostHTML`) — abandonner ferait BOUGER la mise en
page et une suite de cadrage rougirait pour une raison étrangère. Ce qui n'est pas une image
(vidéos jusqu'à 30 Mo) est abandonné ; les **ÉCRITURES passent**, comme pour les tables.
⚠️ **LE MOTIF DOIT COUVRIR LES DEUX FORMES D'URL** : `passioThumb` (app-02) réécrit
`/object/public/` en `/render/image/public/`. N'en connaître qu'une laissait passer toutes les
images de publication, soit l'essentiel du poids.
Verrou : `tests/e2e/isolation-medias.spec.js` (6), dont ② qui mesure le **CÂBLAGE** par
`bootOnboarded` (un verrou qui n'appellerait que `sansDonneesDistantes` resterait vert si l'appel
disparaissait de `bootOnboarded` — défaut vécu sur `_notifierMessage`), ⑥ qui mesure à la SOURCE,
et ④/⑤ qui tranchent sur la **RAISON** de l'échec réseau : `ERR_FAILED` = la route a abandonné,
`ERR_NAME_NOT_RESOLVED`/`ERR_TUNNEL_CONNECTION_FAILED` = la requête est RÉELLEMENT partie. Écrits
d'abord sans ce discriminant, ils étaient verts dans les deux états — ils ne prouvaient rien.
Éprouvé par RÉINJECTION : sans la route, 4 cas sur 6 rougissent.

### ⚠️ LES AVATARS SERVIS AUX VRAIS UTILISATEURS NE SONT TOUJOURS PAS REDIMENSIONNÉS — point OUVERT

`passioThumb(url, width)` existe et n'a que **trois appelants**, tous sur des images de
PUBLICATION (700 px) ; **aucun avatar n'y passe**. Un avatar de 2,59 Mo est donc servi en pleine
résolution pour être affiché à ~40 px, à chaque utilisateur et à chaque chargement.
⚠️ **NE PAS L'ÉTENDRE SANS AVOIR VÉRIFIÉ QUE LA TRANSFORMATION D'IMAGE RÉPOND SUR CE PLAN.**
Elle réécrit l'URL en `/storage/v1/render/image/public/…?width=` ; c'est une option dont la
disponibilité dépend du plan Supabase. Si elle ne répond pas, l'étendre casserait **tous** les
avatars de l'application — et l'un des deux appelants actuels n'a même pas de `onerror`. Le
contrôle tient en une requête : ouvrir une URL `render/image` d'un fichier existant et lire le
code HTTP. Tant que ce n'est pas fait, c'est un pari, pas un correctif.

### ⚠️ DEUX AFFIRMATIONS DU MODE D'EMPLOI ÉTAIENT FAUSSES, ET C'EST LA MESURE QUI L'A DIT

① « La purge de télémétrie fera tomber la table nettement sous 62 Mo » : **non**. Sur
130 906 lignes, **8 596 seulement ont plus de 30 jours (6,6 %)** — soit ~4 Mo. Son rôle est
d'EMPÊCHER LA CROISSANCE (stabilisation vers 44 Mo), pas de faire maigrir. ⚠️ Et **30 jours ne
tiendra pas à l'échelle** : trafic ×10 = ~440 Mo de rétention, contre un mur en lecture seule à
500 Mo. Passer à 7 jours quand les comptes décollent.
② « Les gros médias appartiennent au compte `d59aaaa3…` » : **non**, ils sont à `6902826f…` et
`dc7ff081…`. Trier par TAILLE, jamais chercher un identifiant recopié.
**L'état d'une base ne se lit pas dans un fichier du dépôt, il se mesure** — même règle que pour
l'interrupteur `irl_adult_only`, et c'est la troisième fois qu'elle sert.

### 🔁 RE-MESURE DU 2026-09-12 — SEPT AFFIRMATIONS DE CE FICHIER ÉTAIENT PÉRIMÉES

Et c'est la **quatrième** fois que la règle sert. Une fiche qui décrit un défaut déjà refermé coûte
autant qu'une fiche qui en tait un : elle envoie la session suivante travailler pour rien, ou la
fait renoncer à un geste déjà sûr. Mesuré au canal ① d'ADR-012, après le déploiement de `3e1e825`.

⚠️ **① `conv_reads` N'EST PLUS LISIBLE SANS COMPTE.** `reads_select` porte
`is_conv_member(conv_id, auth.uid())`, pas `qual = true` : le graphe « qui parle à qui » est fermé,
la migration a bien été appliquée. Le paragraphe « ce qui reste ouvert » du 10/09 l'annonçait encore.

⚠️ **② LA PURGE DE TÉLÉMÉTRIE EST DÉJÀ À 7 JOURS, ET LA TABLE FAIT 9,8 Mo.** `cron.job` porte
`purge_telemetry_7j` (04:00) et `purge_client_errors` (03:00) ; **zéro** ligne de plus de 30 jours.
Les chiffres de la fiche (62 Mo, 130 906 lignes, « stabilisation vers 44 Mo », « passer à 7 jours
quand les comptes décollent ») décrivent un état révolu — le geste recommandé est FAIT. Ce qui reste
vrai, c'est le raisonnement : la rétention est le levier, pas la purge ponctuelle.

⚠️ **③ TOUT LE MÉDIA DE LA BASE PASSE DÉJÀ PAR LE CDN.** Avatars 3/3, couvertures 3/3, publications
5/5, stories 8/8 en `/media/…` ; **aucune** URL Supabase directe. La sortie Supabase due aux vrais
utilisateurs est donc ~nulle, et le forfait qui compte est celui de Netlify (100 Go/mois), pas les
5 Go de Supabase. **Le point « avatars non redimensionnés » reste ouvert, mais ce n'est plus une
urgence de facture** : c'est une question de charge utile (2,59 Mo servis pour un rond de 40 px, sur
données mobiles) et de bande passante Netlify à l'échelle. Ne pas le rouvrir en criant à l'egress.

⚠️ **④ ET LA VÉRIFICATION QUI BLOQUAIT CE POINT EST DÉJÀ FAITE PAR LE PRODUIT LUI-MÊME.** La fiche
dit « ne pas étendre `passioThumb` sans avoir vérifié que la transformation d'image répond sur ce
plan ». Or ses **trois appelants actuels l'utilisent en production** (photos de publication à 700 px,
bobines à 720 px) : si `render/image` ne répondait pas, ces images seraient DÉJÀ cassées. La question
ne se tranche donc pas par une requête à écrire, mais en **regardant le fil** — une photo de
publication s'affiche, ou elle ne s'affiche pas. ⚠️ Nuance qui empêche de conclure trop vite :
`renderPostHTML` porte un `onerror` qui repeint la boîte en gris, donc un échec ressemble à une image
absente, jamais à une erreur. Regarder une publication dont on SAIT qu'elle porte une photo.

⚠️ **⑤ LE CONSENTEMENT AUX CGU EST PERSISTÉ DEPUIS LE 2026-09-10, PAR `user_metadata`.** La liste
« ce qui reste ouvert » l'annonçait encore comme « persisté nulle part ». `onbDoAuth` envoie
`cgu_version`, `cgu_accepted_at` et `confidentialite_version` dans les options de `signUp`, et le
retour Google a son propre chemin (`passio_oauth_cgu` relu puis posé par `updateUser`, avec lecture
de `{ error }`). ⚠️ **Et la mesure qui semble contredire ça n'en est pas une** : `auth.users` rend
**0 compte sur 7** portant `cgu_version` — parce que le dernier compte de production date du
**2026-09-09**, soit la veille du correctif. Zéro trace n'est ici PAS un défaut, c'est l'absence
d'inscription depuis. Ne pas rouvrir le sujet sur ce chiffre : le vérifier sur le PREMIER compte créé
après l'ouverture, en lisant `raw_user_meta_data ? 'cgu_version'`.
> **CE CONTRÔLE EST FAIT, ET IL EST VERT (2026-09-12).** Un compte a été créé le 12/09 à 11:06 :
> `raw_user_meta_data ? 'cgu_version'` rend **true**, et il a **confirmé son e-mail en 62 secondes**.
> Le consentement est donc bien persisté sur un compte réel, et la chaîne d'envoi Brevo fonctionne
> de bout en bout sur un compte neuf — ce qu'aucun enregistrement DNS ne pouvait prouver. C'est la
> mesure qui manquait pour dire que l'inscription est ouvrable au public.

⚠️ **⑥ LA SAUVEGARDE AUTOMATIQUE EXISTE — ET N'A JAMAIS TOURNÉ.** `.github/workflows/sauvegarde.yml`
est en place, quotidien, archive chiffrée puis **déchiffrée et relue dans le même run**. Le constat
« aucune sauvegarde automatique » est donc périmé. ⚠️ Mais l'inverse ne se dit pas non plus : le
workflow compte **zéro exécution** à ce jour. Une sauvegarde configurée n'est pas une sauvegarde —
tant qu'un run vert ne l'a pas prouvée, c'est une intention avec un fichier YAML devant. Le premier
lancement est un geste qui reste à faire.

> **Suite du ⑥, le même jour :** le workflow a été lancé et il est **VERT** (run du 2026-09-12,
> archive chiffrée de 3,9 Mo, conservée 30 jours). L'étape « Chiffrer » **déchiffre et relit**
> l'archive dans le même run, et elle est passée : le trajet complet est donc prouvé, phrase de
> passe comprise. Ce n'est plus une intention.

⚠️ **⑦ DKIM ET DMARC SONT POSÉS, ET C'EST L'AFFIRMATION LA PLUS COÛTEUSE DES SEPT.** « DKIM/DMARC
absents, les e-mails partent en spam » était répété comme LE défaut qui tue une ouverture en
silence. Mesuré le 2026-09-12 sur le DNS public (8.8.8.8 et 1.1.1.1), avec témoin négatif : les
**quatre** enregistrements résolvent — `brevo-code`, les deux CNAME `brevo1/brevo2._domainkey` vers
`b1/b2.passio-app-fr.dkim.brevo.com`, et `_dmarc` en `p=none`. Et le piège documenté est évité : la
cible des CNAME n'est **pas** complétée par le domaine, donc le point final a bien été posé.
⚠️ **Le DNS ne suffisait pas, et la seconde marche est FRANCHIE** : Brevo devait encore marquer le
domaine « authentifié », ce qui ne se lit PAS depuis le DNS — c'est **FAIT**, constaté sur son
tableau de bord le 2026-09-12 (`passio-app.fr` → « Authentifié »). Garder la distinction : un
enregistrement DNS qui résout ne dit rien de ce que le fournisseur en a conclu ; il faut aller le
lire chez lui.
⚠️ **La leçon de méthode** : ce point est resté « ouvert » des jours durant parce que personne
n'avait de moyen de le MESURER, et qu'une absence de plainte ressemble à une absence de défaut.
`npm run verif:dns` (`scripts/verifier-dns-email.mjs`, aucune dépendance) le tranche en deux
secondes. ⚠️ Il est **hors de `npm run verif` et hors de la CI de déploiement**, délibérément : il
juge un fait EXTÉRIEUR au dépôt, et une gate rouge qu'aucun commit ne peut réparer bloquerait tous
les déploiements. C'est un contrôle d'exploitation, pas une gate de code.

## 🧭 `search_path` FIGÉ — et pourquoi `''` n'est PAS la bonne réponse partout (2026-09-12)

`get_advisors` signalait « Function Search Path Mutable » sur cinq fonctions de `public`.
Migration : `migrations/migration_search_path_fonctions.sql` (une transaction, verdict à 6 lignes)
· banc `tests/sql/migration-search-path.test.sh` (28 contrôles, gate CI).

⚠️ **ÉTENDUE AUX CINQ FONCTIONS LE 2026-09-12 (soir).** `identifiants_figes` et
`follows_identifiants_figes` y sont entrées : elles prennent le chemin VIDE (corps relus en
production — elles ne touchent aucune relation, seulement `old`/`new` et `pg_catalog`). Le banc les
**EXERCE** après le figement, il ne se contente pas de lire `proconfig` : vérifier l'attribut ne
vérifie pas le comportement, et une garde d'intégrité muette ne se voit nulle part.


⚠️ **APPLIQUÉE EN PRODUCTION LE 2026-09-12 AU SOIR — mesuré, 5 fonctions sur 5.**
`function_search_path_mutable` a DISPARU de `get_advisors`, et `proconfig` porte le chemin attendu
sur les cinq. La recherche de passions répond toujours (contrôle par appel réel : 5 résultats sur
« randonee », donc `similarity` résout bien). Ne pas rouvrir ce point.

⚠️ **ET LE COLLER S'EST FAIT EN DEUX FOIS, POUR UNE RAISON À RETENIR.** Le premier coller n'a posé
que TROIS chemins : le fichier avait été copié depuis GitHub pendant que la fusion arrivait, donc
c'est la version **de la veille**, à trois `ALTER`, qui a été appliquée — et **son tableau de verdict
a dit OK sur tout**, puisqu'il ne connaissait que trois fonctions. C'est exactement ce que le
commentaire de la migration annonçait. **Un verdict ne peut certifier que ce que sa propre version
connaît** : il ne dit jamais « il manque quelque chose que j'ignore ». Corollaire opératoire : après
avoir collé un fichier MIROIR, vérifier l'ÉTAT en base (`proconfig`, `get_advisors`), jamais le
tableau qu'il vient d'imprimer. Même famille que `generer-ouverture --verifier` et
`generer-appliquer-tout.py`, mais le piège est ici du côté du COPIEUR, pas du générateur.

⚠️ **LES 25 AVERTISSEMENTS QUI RESTENT SONT TOUS DÉLIBÉRÉS — verdict posé le 2026-09-12 pour que
personne ne refasse l'enquête.** 18 × « `authenticated` peut exécuter une fonction SECURITY
DEFINER » : ce sont les aides appelées PAR les policies RLS (`is_conv_member`, `is_blocked_with`…),
leur retirer `EXECUTE` ferait lever « permission denied » partout (la red team l'avait suggéré,
c'était faux). 2 × `anon` sur `post_is_visible` / `comment_target_visible` : voulu, un visiteur lit
par elles les commentaires d'une publication publique. 1 × `pg_trgm` dans `public` : connu, et le
chemin choisi survit à son déplacement. 1 × `access_policies` RLS sans policy : c'est l'interrupteur
du 18+, son inaccessibilité EST sa protection. **Aucun n'est actionnable.**

⚠️ **AUCUNE des trois n'est `SECURITY DEFINER`** : c'est de la défense en profondeur, pas une porte
ouverte. Ne pas la présenter comme une faille. Ce qu'elle ferme : `storage_chemin_autorise` est
évaluée par les policies RLS de `storage.objects`, et un prédicat d'autorisation ne doit pas
résoudre ses appels dans le chemin de la session APPELANTE.

⚠️ **34 fonctions de `public` ont `proconfig IS NULL`, mais 31 APPARTIENNENT À `pg_trgm`.** On n'y
touche pas : un `ALTER` y serait perdu à la prochaine mise à jour de l'extension, et ce n'est pas
notre code. Trois seulement sont à nous — exactement les trois que le linter nomme. Compter les
fonctions sans chemin sans retirer celles des extensions donne un chiffre qui affole pour rien.

⚠️ **`rechercher_passions` APPELLE `similarity()` SANS LE QUALIFIER**, et pg_trgm vit dans `public`.
Le `set search_path = ''` que Supabase recommande partout **casserait la recherche de passions en
production** — 5 001 passions, la page Rechercher. Avant de figer un chemin, lire le CORPS de la
fonction et chercher les appels NON qualifiés ; `''` n'est sûr que si tout l'est déjà.

⚠️ **LES DEUX CONSTATS DU LINTER SONT COUPLÉS.** Le même rapport demande aussi de sortir `pg_trgm`
de `public` (« Extension in Public »). Appliquer CE conseil-là plus tard casserait
`rechercher_passions` si son chemin ne nommait que `public` — d'où `public, extensions, pg_temp`,
qui tient dans les DEUX états. Le banc déplace vraiment l'extension pour le prouver (contrôle ⑦).

⚠️ **`pg_temp` SE NOMME EN DERNIER, ET C'EST TOUT L'INTÉRÊT** : non nommé, PostgreSQL le place
IMPLICITEMENT EN TÊTE, et n'importe quel appelant peut alors masquer une fonction par une
temporaire. Le retirer en croyant durcir le remet devant.

⚠️ **`set search_path = ''` SE RELIT `search_path=""`** dans `pg_proc.proconfig` : un verdict qui
comparerait à `search_path=` dirait ECHEC sur une migration pourtant appliquée (mesuré, PG 16).

⚠️ **LA LIGNE ④ DU VERDICT EST UNE GARDE, PAS UN RAPPORT** : elle APPELLE `rechercher_passions`.
Sur une base où le chemin ne résoudrait pas `similarity`, elle lève, la transaction est annulée et
les trois `ALTER` sont DÉFAITS — le fichier ne peut pas laisser la recherche muette derrière lui.
Le banc le prouve en retirant pg_trgm (contrôle ⑧). Ne pas la « simplifier » en test de présence.

### ⚠️ LES SIX AUTRES CONSTATS DU MÊME RAPPORT : AUCUN SECOND ORACLE (mesuré le 2026-09-12)

`get_advisors` signale aussi **six fonctions `SECURITY DEFINER` exécutables par `anon`**. Après le
défaut `is_conv_member` du 11/09 (« une porte fermée sur une table se rouvre par une fonction »),
la question à trancher était : y en a-t-il un SECOND ? **Non — et c'est mesuré, pas supposé.**
Écrire ce verdict ici a autant de valeur qu'un correctif : sans lui, la session suivante refera
l'enquête, ou « réparera » trois non-problèmes et cassera des triggers vivants.

- `post_is_visible` et `comment_target_visible` : **ouverts à `anon` DÉLIBÉRÉMENT** — un visiteur
  lit par eux les commentaires d'une publication publique. Déjà écrit plus haut, ne pas y toucher.
- `is_conv_member` : **le vrai oracle**, fermé par la migration d'ouverture — **COLLÉE, mesuré le
  2026-09-12** : `has_function_privilege('anon', …, 'EXECUTE')` rend **false**. Cette ligne a annoncé
  le contraire pendant un jour, et c'est la cinquième fois que la règle sert : **l'état de la base
  ne se lit pas dans un fichier du dépôt, il se mesure.**
- `can_edit_post(pid)` : ne compare qu'à `auth.uid()`, qui est **NULL pour `anon`** — les deux
  `EXISTS` sont alors faux quel que soit le `pid`. Elle rend donc `false` en toutes circonstances et
  **ne dit RIEN sur la publication visée**. Un oracle répond sur la CIBLE ; celle-ci répond sur
  l'APPELANT. C'est la distinction à faire avant de crier à la fuite.
- `passion_request_auto_creer()` et `trg_sync_profil_passions()` : elles rendent le type `trigger`.
  **PostgreSQL REFUSE de les appeler directement**, quels que soient le rôle et les `GRANT` —
  « trigger functions can only be called as triggers », vérifié en production. Le `GRANT` que
  l'advisor voit est donc **inerte** : l'endpoint RPC existe et ne peut rien exécuter. ⚠️ Leur
  retirer `EXECUTE` ne fermerait rien et resterait à refaire à chaque `CREATE OR REPLACE` ; les
  passer en `SECURITY INVOKER` **casserait les triggers** qui, eux, ont besoin des droits du
  propriétaire. **Le seul geste juste ici est de ne rien faire.**

⚠️ **UN AVERTISSEMENT DE LINTER N'EST PAS UN DÉFAUT, ET LE TRAITER COMME TEL EN FABRIQUE.** Cinq
de ces six lignes sont du bruit ; la sixième était une vraie fuite. Le tri ne se fait qu'en LISANT
le corps de chaque fonction et en se demandant **sur QUOI elle répond** — la cible, ou l'appelant.

⚠️ `rls_enabled_no_policy` sur `access_policies` est **voulu** : RLS active, aucune policy, aucun
`GRANT` — donc refus total pour `anon` et `authenticated`. C'est l'interrupteur serveur du 18+,
et son inaccessibilité EST sa protection (fiche « ADMISSION 18+ »). Ne pas « corriger » en
ajoutant une policy.

## 🧹 QUATRE SURFACES QUI VIEILLISSAIENT SANS TÉMOIN (2026-09-12, le soir)

Aucun de ces défauts ne lève d'erreur. Ils ont en commun d'être sur des chemins que **plus personne
ne traverse** — et une surface que personne ne traverse n'est pas morte : elle vieillit sans témoin.

⚠️ **① LA LANDING RACONTAIT UNE APPLICATION QUI N'EXISTE PLUS.** Badge « Beta privée » (rideau levé
le 11/09), pilier « Documente tes voyages » (Carnet de voyage RETIRÉ par ADR-011 §6) et **deux
piliers 🤝 en double**, même emoji et même promesse. Elle ne s'affiche plus QUE pour un appareil qui
porte un compte dont la session n'est pas retrouvée — jeton expiré, hors ligne, SDK non chargé :
c'est-à-dire quelqu'un qui REVIENT. Badge réécrit sur deux faits vérifiables : gratuit (les CGU le
promettent) et 18 ans et +. ⚠️ **Et la politique de confidentialité disait le CONTRAIRE sur le même
écran** (« beta privée », « l'accès est protégé par un code ») : corrigée, et
`PASSIO_CONFIDENTIALITE_VERSION` passe à `2026-09-12` — **la version SUIT le texte**, sinon « a
accepté » ne désigne plus rien. `access-gate.js` garde son badge « Beta privée » : lui n'est peint
que quand le rideau est ARMÉ, il reste juste.

⚠️ **② LES AVATARS PARTAIENT EN PLEINE RÉSOLUTION, ET « UN SEUL POINT D'ENTRÉE » ÉTAIT FAUX.**
`passioThumb` n'avait que trois appelants, tous sur des images de publication. Le correctif vit dans
`avatarBg` (39 appelants) — mais **neuf autres surfaces ne passent pas par lui** : photos de groupe
(liste Messages, en-tête de conversation, configurateur), photos et couvertures de passion, tuile de
profil, et mon propre avatar/couverture. La première version du commentaire écrivait « ici et nulle
part ailleurs » ; c'était faux, et `audit-passio` l'a relevé. **Un point d'entrée unique pour SES
appelants n'est pas un point d'entrée unique pour la fonctionnalité — le vérifier au `grep`.**
⚠️ **La largeur est un ARGUMENT** (192 par défaut, 352 pour les avatars de 116 px, 880 pour les
couvertures) : un nombre unique serait soit flou sur le grand, soit du gaspillage sur les petits.
⚠️ **La couleur passe SOUS la photo, et c'est une garde** : un avatar est un `background`, donc sans
`onerror` — une image en échec ne laissait ni couleur (pas posée) ni emoji (`avatarInner` rend `""`
dès qu'une photo existe). Un rond vide, sans une erreur.
⚠️ **ORDRE DE GRANDEUR À DIRE JUSTE** : `changeAvatarPhoto` recadre à 480×480 en JPEG 0,9, donc un
avatar PRODUIT PAR L'APPLICATION pèse quelques dizaines de Ko. Le fichier de 2,59 Mo mesuré dans le
seau est un RÉSIDU d'import direct, pas la norme. Le gain réel est 480 → 192 px. Une fiche qui
surévalue finit par ne plus être crue.

⚠️ **③ LE MOTEUR IA CHERCHAIT DANS 19 PASSIONS, ET RETIRER LE TEXTE DE REPLI NE SUFFISAIT PAS.**
`aiGenerateResponse` devient asynchrone et consulte le référentiel ; son unique appelant l'attend en
**rejouant** la garde « la question a-t-elle changé ? » (celle d'origine est évaluée avant cette
attente-là, la plus longue). ⚠️ **Mais la PORTE était au-dessus** : `aiDetectIntent` routait
`voyage|carnet|live|cdv` vers une branche « 📔 Carnets de Voyage » renvoyant à un onglet retiré — et
`index.html` livre un raccourci « ✈️ Voyage » qui pose exactement cette question. Ces requêtes
n'atteignaient donc jamais le référentiel. Intention et branche RETIRÉES.
⚠️ **On LOGUE avant de replier** (`diagLog`) : le symptôme d'une erreur avalée dans ce bloc est
EXACTEMENT celui du défaut qu'on vient de fermer — le moteur ne rend que les 19 du socle — et sans
trace dans `client_errors` la Sentinelle ne peut pas le voir.
⚠️ La coupure `flat_passions_v1` doit couper **cette surface aussi** (`moteur.actif()`), comme les
quatre autres appelants de `chercherAsync`.

⚠️ **④ ET MON PROPRE VERROU ÉTAIT VERT SUR LE DÉFAUT.** Trouvé en le RÉINJECTANT, pas en le
relisant : il lisait `innerText`, **sensible au RENDU**, et le badge vit dans `.landing-header`, que
le navigateur ne peint pas tant que la landing est inactive — il mesurait 1 472 caractères sans le
badge et passait quoi qu'il arrive. `textContent` lit le DOM. Même famille qu'`offsetParent` qui ne
mesure rien sur un `position: fixed`.

⚠️ **AU PASSAGE, DEUX PRISES D'`audit-passio` QUI NE VENAIENT PAS DU LOT** : un attribut `style`
délimité par des APOSTROPHES autour d'`avatarBg`, qui émet ses propres `url('…')` — la balise se
refermait sur la première apostrophe dès qu'un compte de la liste « démarrer une conversation »
portait une photo (pas une injection, `_cssUrl` encode celles de l'URL) ; et le socle de
`audit-echappement` dont les clés portent l'EXPRESSION : la changer sort l'entrée du socle, et
régénérer le fichier en entier RETIRE treize entrées étrangères au lot — ajouter à la fin, ne jamais
retrier.

Verrous : `tests/e2e/avatars-et-ia-referentiel.spec.js` (10) et `smoke.spec.js` (+1). Réinjection
faite pour les quatre.

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

## 🗂️ Pièges connus — index (détail complet : docs/PIEGES_CONNUS.md)

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

## ✍️ CRÉER UNE PASSION DEPUIS L'APP (2026-09-08) — migration à appliquer

Le premier reproche des testeurs : un nom absent du référentiel ne donnait qu'une **DEMANDE** (« en vérification »), jamais publiable. Le bouton du pied du sélecteur **CRÉE** désormais la passion, la sélectionne, et elle est **publiable tout de suite** ; son libellé dit lequel des deux gestes va se produire (« Créer « X » » / « Demander l'ajout de « X » »).
⚠️ **`public.passions` RESTE EN LECTURE SEULE POUR UN CLIENT** : aucune policy INSERT n'a été ajoutée, l'écriture passe par la SEULE fonction `SECURITY DEFINER` `creer_passion(p_label, p_emoji)` (`migrations/migration_creation_passion_utilisateur.sql`, **à appliquer par psql ou le SQL Editor** — ADR-012). Le client ne choisit que le **NOM** ; `id`, `status`, `source='user_suggested'`, `normalized_label`, `created_by` sont écrits par le serveur, qui tient aussi le dédoublonnage (libellé **et alias** : « jogging » → `running`), les plafonds (5/24 h, 30/compte) et les noms refusés.
⚠️ **Le client fonctionne AVANT comme APRÈS la migration** : fonction absente, hors ligne ou sans compte → repli sur la demande, annoncé (`repli: "demande"`), jamais un échec muet. ⚠️ **`MY_UID` ne prouve pas qu'un compte existe** — `creationDisponible()` exige un vrai uuid Supabase. ⚠️ **Créée puis invisible / créée puis refusée** sont les deux défauts de famille du lot : `injecterPassion` ajoute la passion au référentiel EN MÉMOIRE (index + registre `_creees`, consulté par `parId()` même sans référentiel chargé, sinon « ✨ Passion »), et `enregistrerPassionCanonique(id)` (app-02) l'inscrit dans un Set **SÉPARÉ** de `_referentielPassions` — écrire dans ce cache à un seul coup interdirait le chargement du vrai référentiel pour toute la session. ⚠️ Le bouton porte un `data-tel` explicite : sans lui, `telemetry.js` nommerait le clic avec la **recherche libre** de la personne.
⚠️ **TROIS CRÉATIONS OFFERTES, ENSUITE C'EST PAYANT** (2026-09-08 au soir, `migrations/migration_passion_creations_offertes.sql`) : le plafond produit remplace l'anti-abus du premier jet (5/24 h + 30). **Trois créations À VIE par compte, et ce n'est PAS « trois passions vivantes »** — le compteur est `count(*) where created_by`, **sans condition de statut** : archiver ne rend pas un droit de création (sinon la porte dérobée du 2026-09-02 se rouvre par le bas). Le **dédoublonnage passe AVANT le plafond** : une passion qui existe déjà ne crée rien et reste ajoutable au plafond. Le refus serveur `quota_creation` ouvre `openPassionPaywall({creation:true})`, qui titre « Trois créations offertes » — **trois plafonds distincts aboutissent au même mur, et il doit dire lequel a refusé** (sinon on lit « tu suis déjà 3 passions », parfois faux). Aucun montant nulle part.
⚠️ **`revoke ... from public` NE FERME RIEN SUR SUPABASE** (mesuré en prod le 2026-09-08) : les privilèges par défaut du projet accordent `EXECUTE` à `anon` et `authenticated` sur toute fonction créée dans `public`, par des grants **NOMINATIFS** que le retrait du pseudo-rôle `PUBLIC` laisse entiers — d'où un `revoke ... from anon` explicite. Et **un PostgreSQL nu n'a pas cette règle** : le banc était vert par accident, il pose désormais le grant AVANT d'appliquer la migration.
⚠️ **MODÉRATION ET DROIT PAR COMPTE (2026-09-09, `migrations/migration_passion_moderation.sql`)** — **aucune file nouvelle** : signaler une passion, c'est `supaReport("passion", …)` dans `public.reports`, qui porte déjà `target_type`/`target_id` (index unique **PARTIEL** `where target_type='passion'` — un index global aurait changé le signalement de compte et de publication). Porte : lien discret **en bas** de `openPassionExplorer`, `requireAuthentication` avant l'écriture, et **on lit le verdict** (`supaReport` rend `false` sur un refus RLS comme sur un doublon). **Retirer = ARCHIVER** (`status='archived'`) : la ligne survit, les publications gardent leur FK, et le nom ne peut pas être recréé (`nom_indisponible`). ⚠️ **Pour que l'archivage ait un EFFET RÉEL, `chargerReferentielPassions` filtre `.eq("status","active")`** — sans ce filtre une passion retirée restait publiable, le retrait n'était qu'un décor (la liste locale `PASSIONS` reste le plancher, donc rien n'est rétracté). Revue : `npm run passions:moderation` (canal ② d'ADR-012, jamais le navigateur ; `archiver` refuse toute passion dont la `source` n'est pas `user_suggested` ; aucun identifiant de signaleur affiché).
⚠️ **UN DRAPEAU CLIENT NE PEUT PAS LEVER UN PLAFOND SERVEUR** : `passio_passions_illimitees_v1` ouvre les gardes de l'ÉCRAN, `creer_passion` refusera quand même la 4ᵉ création. Le droit étendu vit en base — `public.passion_quotas (user_id, creations_max)` : `NULL` = illimité, un entier = ce plafond, **aucune ligne** = le défaut (3). ⚠️ **« Pas de ligne » et « ligne à NULL » sont DEUX états** — la fonction tranche sur `found`, jamais sur un `coalesce` de la valeur, sinon la table donnerait l'illimité à tout le monde par le simple fait d'exister. RLS : chacun LIT sa ligne, personne ne l'écrit (aucune policy) ; seul l'opérateur accorde (`passions:moderation quota --uid … --max illimite|<n>|defaut`). C'est la brique du futur paiement.
⚠️ **`chargerReferentielPassions` PAGINE** (2026-09-09) : PostgREST plafonne une réponse à `max-rows` (1 000), et il y a **1 912 passions actives** — une requête simple n'en ramenait que la moitié, et les autres, parfaitement légitimes, étaient **refusées à la publication** sans message utile. La boucle est bornée (20 pages) et **ne publie le Set qu'à la fin** : un chargement interrompu ne doit jamais installer une liste partielle pour la session. ⚠️ **Défaut révélé par un TEST, pas par un rapport** : sans `order by`, quelles 1 000 lignes reviennent dépend du PLAN — ajouter le filtre `status` l'a changé, et `user-passions-miroir` est tombé parce que sa prémisse (« moto-enduro absente du référentiel serveur ») était **périmée depuis la migration du 2026-09-01** et ne tenait plus que par cet accident. Un test qui tient par accident finit toujours par le dire.
Verrous : `scripts/verifier-migration-creation-passion.sh` (l'EXÉCUTE sur un PostgreSQL jetable — les TROIS migrations dans l'ordre, CI) et `tests/e2e/creation-passion.spec.js` (13). Détail : `docs/lots-ui/21-CREER-UNE-PASSION-2026-09-08.md`.

## ♾️ « PASSIONS ILLIMITÉES » — RÉSERVÉ AU COMPTE DE L'ÉDITEUR (2026-09-18)

Demande de Benjamin : « il y a un mode illimité pour les passions, applique-le seulement pour le
compte **passioadmin@gmail.com**. Tous les autres non, moi seul doit en bénéficier. » Le mode du
2026-09-04 était un fait de l'**APPAREIL** : une ligne de `localStorage` — ou un
`window.PASSIO_PASSIONS_ILLIMITEES` de console — levait le plafond de trois passions ET le quota de
trois changements sur n'importe quel téléphone et pour n'importe quel compte, et **la porte était
offerte à tout le monde dans Paramètres → Démo, en un tap**.

⚠️ **UNE SEULE AUTORITÉ, ET ELLE ÉCHOUE FERMÉ.** `compteAutorisePassionsIllimitees()` (app-06)
compare l'adresse de la session à `COMPTE_PASSIONS_ILLIMITEES` ; pas de jeton lisible, pas de
`user.email`, une autre adresse → le plafond et le quota **s'appliquent**. C'est l'**inverse VOULU**
de `requireAdmission` (18+), qui échoue OUVERT parce qu'elle double une frontière tenue par la RLS :
ici **rien ne double la garde**, donc un inconnu n'est jamais servi. Refuser à tort à l'éditeur ne
coûte qu'une reconnexion ; accorder à tort, c'est très exactement le défaut qu'on referme.

⚠️ **LE DROIT SE VÉRIFIE AVANT LE DRAPEAU**, et l'ordre est le lot entier : la garde est la PREMIÈRE
ligne de `passionsIllimitees()`, donc ni la clé de stockage ni un `window.PASSIO_PASSIONS_ILLIMITEES
= true` ne passent pour un autre compte. Les deux interrupteurs (`plafondPassionsActif`,
`quotaChangementsActif`) et tout ce qui en découle par lecture n'ont pas bougé d'une ligne — c'est ce
qui rend le lot petit.

⚠️ **ON LIT LA SESSION, JAMAIS `MY_UID` NI L'ÉTAT LOCAL.** `getMyUserId()` fabrique un
`u_<aléatoire>` pour tout visiteur et `state.user` est un fichier de l'appareil que la console
réécrit : ni l'un ni l'autre ne prouve un compte. Seul le jeton du SDK le fait, et
`_sessionSdkPersistee()` (app-08) reste le **SEUL** endroit du dépôt qui le lit (règle du 2026-09-13 :
une seule lecture du jeton pour tous les verdicts).

⚠️ **LA PORTE DES PARAMÈTRES EST MASQUÉE, PAS DÉSARMÉE**, et son `display:none` est **en dur dans
`index.html`** : c'est la position par défaut, donc le sens sûr de l'échec — si app-06 ne se charge
pas, la porte reste fermée au lieu de s'ouvrir à tous. Un `disabled` n'aurait de toute façon jamais
été une garde (revirement du 2026-09-04, fiche 19) ; celle-ci est dans `passionsIllimitees()`. La
visibilité se pilote et se **LIT** par `style.display` — `[hidden]` ne replie rien sur un élément
dont le CSS impose un `display`. `basculerPassionsIllimitees()` est **globale** : elle porte donc la
même condition, **prononce** son refus (un refus muet est indiscernable d'une panne) et le TRACE
(`diagLog`), plutôt que d'écrire un drapeau qui ne lèverait rien — un interrupteur qui s'allume sans
rien faire est pire qu'un refus.

⚠️ **CE DROIT N'EST PAS CELUI DE CRÉER DES PASSIONS, ET AUCUN DRAPEAU CLIENT NE PEUT L'ÊTRE** : le
plafond des créations (3 à vie) est tenu par `creer_passion` + `public.passion_quotas`. Mesuré le
2026-09-18 (canal ① d'ADR-012) : la table porte **UNE seule ligne**, `creations_max = NULL`
(illimité) — et c'est celle de **`contact@ladamemetallerie.com`** (`20762060-…`), **pas** celle de
`passioadmin@gmail.com` (`812aee2b-…`), qui n'a **aucune ligne**, donc le défaut de 3. Déplacer ce
droit est un geste d'**exploitation**, hors dépôt (canal ②, jamais depuis la CI) :
`npm run passions:moderation quota --uid 812aee2b-214f-4949-931e-842599b6d68b --max illimite` puis
`--uid 20762060-78c4-40b9-ad2a-ee7c1cb19857 --max defaut`. ⚠️ « Pas de ligne » et « ligne à NULL »
sont DEUX états (la fonction tranche sur `found`) : **l'état de la base ne se lit pas dans un fichier
du dépôt, il se mesure.**

⚠️ **PIÈGE DE BANC MESURÉ, ET IL A FAIT ROUGIR TROIS CAS SUR LEUR PRÉMISSE** : un jeton posé avec un
`access_token` qui n'est pas un JWT de **forme** valide **DISPARAÎT** du stockage au premier appel du
SDK (supabase-js 2.116 le décode, échoue, appelle `_removeSession`) — la clé `sb-…-auth-token`
n'existait plus entre la pose et le premier rendu. `poserSession` fabrique donc trois segments
base64url (la signature n'est jamais vérifiée côté client). ⚠️ Et le jeton se pose **APRÈS** le
démarrage, jamais en `addInitScript` : posé avant, c'est le produit qui le purge — et comme « pas de
jeton » = refus, le cas serait **vert quoi qu'il arrive**. C'est la prémisse mesurée qui a sauvé
l'enquête : sans elle, le rouge aurait été lu comme un défaut du produit.

Verrou : `tests/e2e/mes-passions-page.spec.js` ⑭ → ⑭ septies (7 cas). Les quatre d'origine passent
désormais par le compte servi ; trois cas neufs mesurent le **REFUS** — un autre compte (drapeau ET
`window` forcés, l'écran **et** le geste d'archivage qui doit buter), aucune session (échec fermé, et
la cohérence de l'adresse avec `PASSIO_EDITEUR.email` : deux constantes qui dérivent en silence
déplaceraient ce droit vers un compte que personne n'a choisi), et la porte des Paramètres (masquée
pour un autre compte, présente pour celui servi, bascule refusée et prononcée). **Éprouvé par
RÉINJECTION de trois mutations** — garde retirée de `passionsIllimitees` (**2 rouges** : quinquies et
sexies), masquage du bouton neutralisé (**1**), refus de la bascule neutralisé (**1**). Les quatre cas
d'origine, eux, restent **verts sous la mutation 1** : c'est bien le REFUS qu'aucun d'eux ne mesurait.

## 🎵 UNE BULLE « MUSIQUE » QUE TAPER NE FAISAIT RIEN — LE PROFIL DE REMPLISSAGE SE PRENAIT POUR UNE PASSION (2026-09-22)

Rapport de Benjamin, capture à l'appui : « je viens de rajouter une passion (musique) sur mon
profil mais je n'arrive pas à la sélectionner ». Le rail du Fil peint « Suivis · **Musique
(grisée)** · Metallerie · Course à pied · Wakeboard » ; taper « Musique » ne change rien, et **rien
ne se prononce**.

⚠️ **MESURÉ EN PRODUCTION LE JOUR MÊME (canal ① d'ADR-012), ET C'EST LA MESURE QUI A DÉSIGNÉ LA
CAUSE.** `user_state` du compte de la capture porte bien une entrée « musique » — et elle porte
`_parDefaut: true`. C'est le profil de **REMPLISSAGE** fabriqué par `boot()` quand le serveur ne rend
aucun profil (`allPassions()[0]` = « Musique »), **pas une passion choisie**, et
`selectedFeedPassions` ne la contient pas. Benjamin n'avait rien ajouté : il essayait d'adopter un
fantôme que l'application lui montrait comme une possession.

⚠️ **DEUX DÉFAUTS, ET IL FALLAIT LES DEUX POUR PRODUIRE LE SYMPTÔME.** ① `passionsVivantes()`
(app-06) ne l'excluait pas → la bulle était **PEINTE** ; mais `passionsPossedeesIds()` (app-02)
l'exclut depuis le 2026-09-18, donc `setFeedPassions` **JETAIT** l'identifiant à chaque tap : le rail
se repeignait à l'identique, sans un mot. Une **promesse d'affichage que l'écriture refuse** — et
ici il n'y avait même rien à refuser, la bulle n'aurait pas dû exister. ② `ajouterPassionAuCompte()`
prenait le remplissage pour une possession (`_existante`) : aller l'ajouter dans « Mes passions »
rendait « déjà là », donc **aucune écriture, aucun passage par `ajouterPassionAuFil`, marqueur
intact**. Le seul geste qui pouvait réparer la situation était muet.

⚠️ **LA RÈGLE, UNE FOIS POUR TOUTES : LE REMPLISSAGE N'EST UNE PASSION NULLE PART** — ni peint, ni
compté dans le plafond, ni passion d'écriture, ni publié. Et « ajouter » cette passion-là le
**PROMEUT** (`delete _parDefaut`, même objet, aucune seconde entrée) **APRÈS** le contrôle du
plafond : il n'occupe aucune place, donc l'adopter en prend une, et au plafond la fenêtre payante
refuse et **se prononce**, comme pour n'importe quelle autre passion.

⚠️ **LE COMPTEUR DU PLAFOND ÉTAIT LE DERNIER À NE PAS LE SAVOIR, ET ÇA COÛTAIT UNE PLACE SUR TROIS.**
Le commentaire de `nbPassionsTotales` affirmait déjà que le remplissage « n'est compté NULLE PART
ailleurs » — c'était **faux dans `nbPassionsVivantes`**, juste au-dessus. Conséquence vivante pour
tout compte entré par « Se connecter » (chemin où `attacherPassionsAuCompte` ne passe pas et où le
remplissage survit) : trois passions choisies + le remplissage = quatre vivantes, donc
`plafondPassionsAtteint()` **à TROIS** — la porte d'ajout refusait la troisième passion d'un compte
qui n'en possédait que deux. **Une affirmation écrite dans un commentaire n'est pas une garantie ;
seule la ligne de code qui la tient l'est.**

⚠️ **LE REPLI EST CONSERVÉ À L'OCTET PRÈS** : un compte qui n'a QUE son remplissage garde sa bulle et
sa passion de destination au Studio (`passionsVivantes()` retombe sur les vivantes quand aucune
possession n'existe). Sans compte possédant, `interetsBornesAuCompte()` est faux et la bulle reste
cochable — c'est-à-dire qu'elle n'est **jamais** morte. La bulle morte n'existait qu'à partir de la
PREMIÈRE vraie passion : le discriminant de l'affichage est le même que celui de l'écriture.

### ⚠️ SIX SURFACES DE PLUS, TROUVÉES PAR `audit-passio` APRÈS HUIT VERROUS VERTS

« Corriger une surface, c'est corriger une surface. » Le premier jet redressait trois fonctions ;
six autres endroits lisaient encore `state.user.profiles` **BRUT**, et **trois devenaient faux à
cause du lot** — c'est le mode d'échec à retenir : **un correctif qui déplace une règle doit être
suivi partout où l'ancienne servait.**

⚠️ **[P1] LA PORTE ET LE POINT D'ÉCRITURE NE COMPTAIENT PLUS PAREIL.** `archiverPassion` avait été
redressée, **pas `confirmArchivePassion`**. Un compte « remplissage + une vraie passion » en voyait
DEUX à la porte : la confirmation s'ouvrait, annonçait le coût, l'utilisateur validait — et le point
d'écriture en comptait UNE et refusait. **Lire, comprendre, valider, se faire refuser** : la leçon
`meOpen` prise par son autre bout, enfreinte par le correctif qui n'avait redressé qu'un des deux
bouts. ⚠️ **Et le verrou était vert dessus** : il appelait `archiverPassion` à la main, jamais sa
porte — il mesurait la fonction, pas le câblage.

⚠️ **[P1] AU STUDIO, ON PUBLIAIT SOUS LA PASSION QUE LE MUR VENAIT DE REFUSER.** `ouvrirChoixStudio`
(passions-flat-ui) testait la possession sur la liste brute : au plafond, `ajouterPassionAuCompte`
refusait bien et ouvrait la fenêtre payante, mais `possedee` rendait quand même `true`, donc
`#postPassion` — la SEULE source de vérité de `publishPost` — pointait la passion refusée. **EN
SILENCE, pendant que le mur s'affichait.** Le commentaire immédiatement au-dessus décrit ce piège en
toutes lettres et le déclarait fermé : **le plafond ayant cessé de compter le remplissage, la
branche s'était rouverte par en dessous.**

⚠️ **[P1] L'ALLER-RETOUR SERVEUR BLANCHISSAIT LE MARQUEUR — le défaut ressuscité par la base.** Le
jsonb `profiles.passions` est la SAUVEGARDE de mes passions, relue par la reconstruction du boot ;
il ne portait pas `_parDefaut`, et le boot ne le restituait pas. Sur un appareil neuf, le
remplissage revenait en **vraie passion** : quatre vivantes pour un plafond de trois, et la bulle
morte de retour. **Tant que le marqueur ne décidait de rien, le perdre ne coûtait rien ; il décide
désormais de la bulle, du plafond et de la passion d'écriture.** Il voyage donc et se restitue,
**exactement comme `archived`, qui avait déjà payé ce défaut** — et `passionsPubliques()` le retire à
l'affichage, sans quoi mon profil annonçait **quatre passions aux visiteurs** quand le mien en
comptait trois.

⚠️ **[P2] « Mes passions » disait 0 et peignait 1 carte.** L'en-tête lit `nbPassionsVivantes()` (qui
exclut), la liste peignait `passionsVivantes()` (qui le rend en repli). **La carte était le mensonge,
pas le compteur** : ce compte ne possède rien et ses trois places sont libres. La carte est retirée
sur cette page seulement — toucher l'autorité et son repli aurait atteint dix autres surfaces.

⚠️ **[P2] LA FENÊTRE D'ÉCHANGE PROPOSAIT DE « RANGER » LE REMPLISSAGE**, ligne qui ne pouvait
débloquer **RIEN** : il n'occupe aucune place, donc l'archiver consommait un changement puis
l'échange butait sur le plafond et se reprenait (« rien n'a changé »). **Une sortie proposée qui ne
sort de nulle part est pire qu'une absence de sortie.**

⚠️ **[P2] RÉACTIVER UN REMPLISSAGE ARCHIVÉ CONSOMMAIT UN CHANGEMENT SANS RIEN FAIRE RÉAPPARAÎTRE** —
ni carte, ni bulle, ni compteur, `passionsVivantes()` l'écartant. **Un geste payant sans effet
visible est pire qu'un refus** : `restaurerPassion` le promeut, comme `ajouterPassionAuCompte`.

⚠️ **RÉSIDUS NOMMÉS, PAS RÉGLÉS** : sous la coupure `passio_ui_8="0"`, `renderProfileStrip` et
`renderStudio` retombent sur la liste brute et le remplissage redevient peint — chemin de coupure,
comportement d'avant, assumé. `currentProfile()` (app-02) teste `_parDefaut` en ligne plutôt que
d'appeler `_estRemplissagePassion` (app-06) : délibéré, cette autorité est appelée très tôt et ne
doit pas dépendre d'un fichier chargé après elle.

⚠️ **PIÈGE D'ENVIRONNEMENT DE LA JOURNÉE** : le bac ne porte pas la révision de Chromium attendue
par le `@playwright/test` du dépôt. **Ne pas réinstaller** : la config prévoit déjà
`PASSIO_CHROMIUM=<chemin du binaire>`, qui pose `launchOptions.executablePath`. En local,
`creation-passion` ⑭ et trois cas de `profil-entete-passions` sont **ROUGES sur `origin/main` PUR**
(rejoué en worktree séparé, port 8099) — divergence d'environnement déjà écrite, étrangère au lot.

Verrou : `tests/e2e/passion-remplissage-bulle-morte.spec.js` (**14**), dont ② qui est la formulation
GÉNÉRALE du défaut et vaut pour toute bulle future (« aucune bulle peinte n'est refusée par
l'écriture »), ⑨ qui mesure la porte **par le geste**, ⑩ le Studio au plafond, ⑪ l'aller-retour
serveur à la source, et ⑧ le câblage de `boot()` — un chemin qu'aucun banc local ne parcourt.
**Éprouvé par RÉINJECTION de DIX mutations**, chacune rougissant sa cible : bulle repeinte (3
rouges), ajout rendu muet (2), plafond qui recompte le remplissage (3), garde de `currentProfile`
retirée (1), porte d'archivage rendue au filtre brut (1), Studio rendu à la lecture brute (1),
`passionsPubliques` rendue à l'ancien filtre (1), restauration qui ne promeut plus (1), échange rendu
à la liste brute (1), cartes rendues au repli (1).

## 🎯 LES PASSIONS DU FIL SONT CELLES DU COMPTE (2026-09-18)

Rapport de Benjamin, deux captures prises à la même minute : le rail du Fil peignait « Suivis ·
Metallerie · Course à pied · Wakeboard · Ski freestyle · … », le Profil disait « 3 PASSIONS ».
Mesuré en base (canal ① d'ADR-012) sur le compte de la capture (`passioadmin@gmail.com`) :
`user.profiles` porte TROIS passions vivantes, `selectedFeedPassions` en porte SEPT — les quatre
de trop (`glisse-ski-freestyle`, `sport`, `cuisine`, `photo`) sont les choix d'une exploration
SANS compte, migrés par `migrerPreferences` comme **intérêts** de fil, jamais devenus des passions
du compte ; le compte a ensuite ajouté ses trois passions dans « Mes passions »
(`ajouterPassionAuFil` AJOUTE, ne retranche jamais) et le Fil a EMPILÉ les deux.

⚠️ **LA RÈGLE EXISTAIT DEPUIS LE 2026-09-01, ELLE N'ÉTAIT TENUE NULLE PART.** `passions-flat-ui`
l'écrit en toutes lettres (« le rail du Fil reste une commande de LECTURE — on y coche et décoche
ce qu'on possède ; on acquiert au Profil »), mais trois points d'écriture des intérêts la
contredisaient : `migrerPreferences` (intérêts sans passions), `onbFinish` V2 (UN profil, jusqu'à
SEPT intérêts — spec §6 d'avant ADR-011 et d'avant le plafond) et `renderProfileStrip`, qui
COMPLÉTAIT le rail par les intérêts sans profil (`_interet_…`) — remède du 2026-08-30 pour rendre
ces intérêts décochables, devenu la surface même du défaut. Un intérêt que le compte ne possède
pas est une bulle de plus que le plafond n'a jamais accordée.

⚠️ **UNE SEULE BORNE, AU SEUL POINT D'ÉCRITURE.** `setFeedPassions` (app-02) ne garde, pour un
compte qui possède des passions, que `passionsPossedeesIds()` (vivantes, hors `_parDefaut`) ;
`interetsBornesAuCompte()` est le discriminant : `comptePassioReel()` ET au moins une passion
possédée. Posée à chaque porte, la prochaine porte l'oublierait (`quickCreateProfile`, le Studio —
déjà payé pour le plafond). `restoreFeedPassions` y passe au démarrage et **PERSISTE** si la borne
a retiré quelque chose : le blob `user_state` de production s'assainit au premier rendu.
`_repriseUserState` (rejeu réseau) rappelle `restoreFeedPassions` — un blob rejoué laissait le Set
d'avant. `renderProfileStrip` ne rajoute rien pour un compte : les deux rails comptent pareil par
construction (verrou ③ : Set pollué HORS de l'autorité, aucune bulle fantôme).

⚠️ **UN VISITEUR N'EST PAS BORNÉ, ET C'EST VOULU** : pas de compte, ses intérêts SONT ses passions
du moment (`appliquerPrefs`), et le rail les peint sans profil comme avant. `comptePassioReel()`
tranche — jamais `state.user.profiles.length` seul : un visiteur peut avoir ajouté une passion au
Profil, et sa recherche de première visite aurait continué de lui être jetée.

⚠️ **LES CHOIX DU VISITEUR DEVIENNENT LES PASSIONS DU COMPTE QU'IL CRÉE**
(`attacherPassionsAuCompte`, first-run.js) par `ajouterPassionAuCompte`, le SEUL moteur d'ajout —
plafond, doublon, Fil, synchronisation compris. Les places se mesurent AVANT chaque appel : au
plafond, le moteur ouvre la fenêtre payante, un mur posé sur un geste automatique. Le profil de
remplissage de `boot()` (« Musique », `_parDefaut`) CÈDE LA PLACE — laissé là, il prenait l'une des
trois places offertes. Au-delà du plafond, un toast dit ce qui a été gardé. La passion de départ du
Studio est le PREMIER choix (le moteur rebascule `currentProfileId` à chaque appel). On juge sur
l'ÉTAT, pas sur le retour du moteur, qui rend `null` aussi quand il RESTAURE une archivée.

⚠️ **L'ONBOARDING V2 CRÉE UNE PASSION PAR CHOIX ET NE LAISSE COCHER QUE `PASSIONS_OFFERTES`**
(`onbMaxPassions()`, lu paresseusement — app-06 charge après app-02 ; plafond coupé = les sept de
la spec). Laisser cocher sept pour n'en garder que trois serait un mensonge d'interface. Au
passage, `deleteProfile` retirait la passion des filtres du PROFIL mais pas du FIL — même famille
qu'`archiverPassion` avant le 2026-08-30.

⚠️ **POINT OUVERT, NOMMÉ** : `nbPassionsVivantes()` compte le remplissage `_parDefaut` tant qu'il
est vivant — un compte neuf qui n'est pas passé par l'exploration voit « Musique » occuper une
place sur trois jusqu'à l'archiver. Antérieur au lot, hors périmètre.

Verrou : `tests/e2e/fil-passions-du-compte.spec.js` (10), dont ① sur l'état EXACT de la capture
(transposé sur le socle embarqué : « metallerie » est une passion créée en production, absente du
référentiel livré), ⑤ la migration (plafond, remplissage, passion de départ) et ⑦ le câblage à la
source. **Éprouvé par RÉINJECTION de quatre mutations** : borne retirée de `setFeedPassions` →
**6 rouges** ; garde du rail retirée → **2** (③ et le câblage) ; attache retirée de la migration →
**3** ; onboarding rendu à « un seul profil » → **1**. Suites réalignées : `onboarding-v2` (« un
seul profil » → une par choix), `onboarding-acceptation` ONB-02/03, `onboarding-passions-v2` §4,
`multi-passion-audit-restant` ③/③ bis (le cas « UNE créée, TROIS en intérêts » n'existe plus ; les
bulles d'intérêt ne survivent que chez un visiteur), `first-run` (fixture à trois intérêts), et
**trois fixtures qui COCHAIENT une passion sans la posséder** — `feed-envie-filtre` (« musculation »,
« cuisine » : cocher, c'est posséder, le fixture les ajoute au compte), `feed-premier-rendu` §7
(« moto » choisie à l'onboarding), `multi-passion-integrite` ⑥ (par `ajouterPassionAuCompte`, le
moteur réel, et non `ajouterPassionAuFil` à la main), `feed-vues-adr010` ⑩ (« cuisine » au compte
avant de la cocher) et ⑬ (les dix passions recochées APRÈS avoir été données au compte — sinon neuf
bulles grisées à `scale(0.95)` et « toutes les bulles ont la MÊME largeur » mesurait l'état coché,
pas la mise en page ; trouvé par le shard 2/6 de la CI, dont le journal est ILLISIBLE d'ici, d'où
le rapporteur `github` : les échecs Playwright sont désormais des annotations du check-run).
⚠️ En local, `creation-passion` ⑭ et trois cas
de `profil-entete-passions` (③ decies quater, sexies, septies) sont ROUGES **sur `origin/main` pur
aussi** (worktree séparé, port 8099) : divergence d'environnement déjà écrite plus haut, pas ce lot.
Détail : `docs/lots-ui/25-FIL-PASSIONS-DU-COMPTE-2026-09-18.md`.

## 🔢 LE RÉFÉRENTIEL PASSE À 5 001 PASSIONS (vague 3, 2026-09-10)

2 088 → **5 001 passions**, 4 350 → **9 100 alias**. L'objectif fixé par l'étude de
capacité (`docs/PASSIONS_CAPACITE_ETUDE_2026-09-09.md`, §5 ter) est atteint. Les plafonds
mesurés n'ont pas bougé : plafond DUR du code 20 000, maximum produit recommandé 12 000.
⚠️ **Zéro identifiant d'origine perdu, zéro libellé d'origine modifié** — et ce n'est pas
une intention, c'est un contrôle qui doit être REJOUÉ à chaque vague (comparer la liste
d'ids d'`origin/main` à celle du dépôt).

⚠️ **LE DÉFAUT LE PLUS GRAVE DE LA VAGUE A ÉTÉ VU PAR UN CONTRÔLE QUI NE CHERCHAIT PAS ÇA.**
En traitant une collision, le lot de corrections a retiré `finance-salaire` — une entrée
**curée**, référencée par `posts.passion_id` en production. Le validateur ne l'a pas vue
par son libellé ni par son id : il l'a vue par la **relation orpheline** qu'elle laissait
(une autre entrée la visait en `broader`). **Un identifiant absent ne lève RIEN** : il rend
« ✨ Passion » sur toutes les publications qui le portent, et ne se voit qu'à l'écran, sur
du contenu réel, donc après la mise en ligne.

⚠️ **LE DÉCOUPAGE EN FICHIERS EST UNE COMMODITÉ DE RELECTURE, PAS UNE FRONTIÈRE DE SENS.**
La moitié des ~212 collisions étaient INTER-FICHIERS : « Ornithologie » vivait dans
`70-vivant`, « Archéologie » dans `80-culture`, « Microbiote » et « Bain de forêt » dans
`90-bienetre`, « Herbier » dans `85-savoirs`. Aucune relecture par domaine ne pouvait les
voir. Seul `npm run passions:valider` les voit — c'est très exactement pour ça qu'il existe,
et il faut le lancer APRÈS CHAQUE LOT, pas à la fin.
⚠️ **Un sigle n'appartient à personne** : « OCR » était déjà l'alias d'une course
d'obstacles, « VAE » celui du vélo à assistance électrique. « SIG », « JO », « BAFA »,
« SCOP » : mêmes télescopages. Un alias en sigle se relit deux fois.
⚠️ Taux de redondance mesuré : **~7 %** (3 125 écrites, 212 retirées). La vague 1 était à
15 % — l'écart ne dit pas la qualité de la méthode, il dit à quel point le domaine visé
était DÉJÀ couvert. Budgéter ~3 200 rédactions pour 3 000 nouvelles.

⚠️ **LE GÉNÉRATEUR DE DELTA NE RÉPOND PAS À CETTE VAGUE, ET IL FAUT SAVOIR POURQUOI.**
`sort_order` est un index **GLOBAL** (`p.sort_order = i + 1`, `referentiel-passions.js`) :
insérer 2 913 entrées décale la valeur de PRESQUE TOUTES les lignes déjà en base. Un delta
« ce qui a changé », même en mode `--etat`, vaudrait donc le miroir entier. L'outil de la
vague 2 reste juste ; le cas est simplement différent.
La réponse est **`scripts/decouper-migration-passions.js`** : le miroir (1,45 Mo) est
découpé en **7 parties de ~240 Ko**, collables une par une dans l'éditeur SQL.
⚠️ **Le découpage CHANGE UNE GARANTIE** : le miroir entier est un `begin; … commit;` unique
(tout ou rien) ; découpé, chaque partie est sa propre transaction, donc un échec à la
partie 4 laisse 1 à 3 appliquées. Acceptable UNIQUEMENT parce que le miroir est additif et
idempotent — on reprend à la partie qui a échoué, jamais depuis la première. Ne pas
réutiliser ce découpeur sur une migration qui, elle, aurait besoin de l'atomicité.
⚠️ **Un découpeur qui perd une instruction en silence est pire que pas de découpeur** : on
croirait avoir tout appliqué. D'où DEUX contrôles à deux niveaux — le script réassemble ses
parties et compare la liste d'instructions au fichier d'origine (le TEXTE) ;
`tests/sql/decoupage-migration-passions.test.sh` (gate CI) **exécute** les deux chemins sur
deux bases PostgreSQL jetables et compare l'empreinte **ligne à ligne** (l'EXÉCUTION). Une
instruction peut être intacte au texte et le découpage faux à l'exécution. Le banc
redécoupe avant de mesurer : un miroir régénéré sans redécoupage ferait appliquer
l'ANCIENNE version, en silence.

⚠️ **« 568 Ko jamais au démarrage » — l'invariant tient, il devient PLUS cher à enfreindre.**
`data/passions-v1.json` passe de 154 à **568 Ko**. Il n'est toujours chargé qu'au premier
usage réel (`passions-plates` ⑤ et ⑰ bis). Les commentaires qui citaient « 160 Ko » ont été
corrigés dans le CODE VIVANT ; ceux des documents d'époque ont été laissés — ce sont des
mesures datées, les réécrire falsifierait l'histoire.

⚠️ **UN TEST QUI TIENT PAR ACCIDENT FINIT TOUJOURS PAR LE DIRE, et c'est arrivé encore.**
`creation-passion.spec.js` utilisait « sculpture sur glace » comme exemple de nom INCONNU
du référentiel. Nom parfaitement plausible… donc entré au référentiel à la vague 3 : six cas
sont tombés d'un coup, pour une prémisse périmée, pas pour un défaut du code (même famille
que `user-passions-miroir` le 2026-09-09). Le nom d'essai est désormais une chaîne que
personne n'écrira jamais (`NOM_ESSAI`/`ID_ESSAI`/`LIBELLE_ESSAI` en tête de fichier), et le
cas ⓪ **VÉRIFIE** son absence au lieu de l'espérer, avec un message qui dit quoi changer.
⚠️ Au passage : ces constantes vivent côté **Node**, jamais dans le navigateur — chaque
`page.evaluate` doit les recevoir en ARGUMENT, sinon `ReferenceError` dans la page.

Reste ouvert : **1 021 passions n'ont encore qu'UN alias** (cible 2, plancher 1). Le plancher
ne passera à 2 que quand l'alerte sera à zéro — un objectif laissé en alerte permanente est
un objectif que plus personne ne lit. Détail complet : `docs/PASSIONS_CAPACITE_ETUDE_2026-09-09.md`
§5 ter · application : `docs/APPLIQUER_MIGRATION_PASSIONS.md` (mise à jour du 2026-09-10).

## 🎿 « ON EST CENSÉ AVOIR 5 000 PASSIONS ? » — TROIS SURFACES CHERCHAIENT DANS 19 (2026-09-12)

Rapport d'écran de Benjamin, capture à l'appui : dans « Qu'est-ce qui te passionne ? », taper
« Ski » rendait **« Aucune passion ne correspond. Essaie un autre mot. »**
Mesuré le jour même, dans cet ordre — et c'est l'ordre qui compte :
**la base est bonne** (`select count(*) … where status='active'` = **5 003**, dont **15** de ski,
canal ① d'ADR-012), **le dépôt est bon** (`data/passions-v1.json` livre 5 001 entrées, dont **21**
de ski). Le défaut était **entièrement côté client**, et il ne touchait pas le référentiel : il
touchait **qui le consulte**.

⚠️ **LA QUESTION « LES 5 000 SONT-ELLES ACTIVÉES ? » N'A PAS UNE RÉPONSE, ELLE EN A UNE PAR
SURFACE.** Activées en base, livrées dans l'artefact, et pourtant invisibles sur trois écrans.
Répondre « oui, la migration est appliquée » aurait été exact et inutile. **Un référentiel n'est
actif que là où quelqu'un l'interroge** ; partout ailleurs il est un fichier sur un disque.

### Le défaut, et pourquoi il est passé sous tous les filets

`allPassions()` (app-02) = **socle embarqué (19) + passions perso du compte**. Il ne contient
AUCUNE des 5 001. Trois surfaces s'appuyaient dessus pour laisser quelqu'un **choisir** :

- **`js/first-run.js`** — `catalogue()`/`chercher()` du panneau de première visite. C'est celui de
  la capture, et **le seul écran que tout nouveau visiteur traverse**.
- **`openCreateGroup`** (app-05) — `allPassions().filter(p => myPassionIds.includes(p.id))`
  INTERSECTAIT les passions du compte avec le socle : un compte dont les passions viennent du
  référentiel obtenait une grille **VIDE**, et « Passion(s) du groupe (1 à 3) » est obligatoire.
  **Impasse dure, sans message.**
- **`openCreateEvent`** (app-07) — le `<select>` listait `passionsPubliables()`, donc le socle. Sur
  le **MÊME écran** on pouvait **filtrer** parmi 5 001 rencontres et n'en **organiser** que dans 19.

⚠️ **C'EST EXACTEMENT LE DÉFAUT CORRIGÉ LE 2026-09-03 SUR LA PAGE « RECHERCHER » (fiche 20), ET LE
CORRECTIF N'ÉTAIT ALLÉ QUE LÀ.** Son propre commentaire dit « ELLE NE CHERCHAIT QUE DANS LE SOCLE
EMBARQUÉ » — neuf jours plus tard, trois surfaces disaient encore la même chose. **Corriger une
surface, c'est corriger une surface** : la famille se traque au `grep` (`allPassions`,
`passionsPubliables`, `PASSIONS.filter`) et se re-traque après CHAQUE correctif de ce type.

⚠️ **LE MODE ÉDITION D'`openCreateEvent` PORTAIT DÉJÀ LA PREUVE DU MANQUE** : il réinjectait à la
main la passion d'origine « (non publiable) » quand elle était absente de la liste. Le trou était
connu et n'avait été rustiné que du côté où il faisait une erreur VISIBLE. **Une rustine locale sur
un défaut général est un panneau indiquant où chercher.**

### Les trois pièges du correctif

⚠️ **① CHOISIE PUIS INVISIBLE.** `interetsDuVisiteur` (first-run) filtre par `metaPassion`, qui
passe par `estPassionCanonique` — laquelle ne connaît **hors ligne que les 19**. « Ski alpin » était
donc choisi, validé, puis **JETÉ EN SILENCE** : le fil ne changeait pas et rien ne le disait.
D'où le registre `_refVues` : **une passion que ce panneau a MONTRÉE est réelle par construction**
(elle vient du référentiel, donc de la table `passions`), et `enregistrerPassionCanonique` (app-02)
l'inscrit dans le Set `_passionsCreees`, **séparé** de `_referentielPassions` — écrire dans ce
cache à un seul coup interdirait le chargement du vrai référentiel pour toute la session. Rien
n'est desserré : on n'inscrit QUE ce que le référentiel a rendu.

⚠️ **② « AUCUNE PASSION NE CORRESPOND » PENDANT QUE LE RÉFÉRENTIEL RÉPOND EST UN MENSONGE**, et
c'est très exactement le message lu à l'écran. Le socle est peint **immédiatement** (résultat
instantané, hors ligne compris), le référentiel s'y **ajoute** ; tant qu'une réponse est en vol la
grille dit « Recherche… ». `_panneauEnVol` se pose **à la frappe**, pas dans le timer : sinon les
160 ms d'anti-rebond rouvrent la fenêtre du message trompeur.

⚠️ **③ ON NE PEINT JAMAIS 5 001 TUILES** (fiche 20) : la grille est un **aperçu** borné à 60, la
recherche est le chemin vers le reste. « Voir toutes les passions » demande `chercherAsync("")`,
qui rend les suggestions du moteur, déjà classées.

Anti-rebond 160 ms et jeton d'annulation sont repris **à l'identique** d'app-07 : sans eux, taper
« guitare » lance sept recherches et une réponse lente partie sur « gui » écrase « guitare ».

### ⚠️ DEUX PIÈGES DE BANC, ET LES DEUX RENDAIENT UN TEST VERT SUR LE DÉFAUT

⚠️ **`_activeFeedPassions` EST UN `let` DE PORTÉE SCRIPT (app-01), PAS UNE PROPRIÉTÉ DE `window`.**
`window._activeFeedPassions` rend `undefined`, donc `(… || []).slice()` rend `[]`, donc l'assertion
« la passion est dans le fil » passait **sur un tableau vide**. Il se lit par son **nom nu** dans
`page.evaluate`. Même famille que `studioType` et `photoDataUrl`.

⚠️ **LE SERVICE WORKER SERT `data/passions-v1.json` HORS DU ROUTAGE DE PLAYWRIGHT.** Mesuré : un
`page.route("**/data/passions-v1.json")` **n'est jamais appelé** (compteur à 0) alors que
`page.on("request")` voit bien la requête partir et que les données arrivent. Un cas bâti sur une
route retenue ou abandonnée est donc **vert quoi qu'il arrive** — et le cas « repli hors ligne »
écrit ainsi ne prouvait rien, d'autant qu'il cherchait « Musique », qui est dans le socle. On mute
donc **`PassioPassions.chercherAsync`**, comme la maison mute `window.supa.from`.
⚠️ Corollaire : `bootVisiteur` pose `page.route("**/*")` et **capte tout** ; une route ajoutée après
lui n'est pas consultée.

Verrous : `tests/e2e/premiere-visite-referentiel.spec.js` (6) et
`tests/e2e/passions-organiser-et-groupe.spec.js` (4, dont ⓪ qui **VÉRIFIE** que la passion d'essai
est absente du socle au lieu de l'espérer, et ③ que le repeint ne change pas le choix — repeindre
un `<select>` en perdant la sélection ferait publier sous une AUTRE passion, en silence).
**Éprouvés par RÉINJECTION** : la grille rendue au socle fait rougir 3 cas sur 6 ; le registre
retiré fait rougir exactement celui qui mesure « choisie puis invisible » ; les deux surfaces
remises à `allPassions()` font rougir 3 cas sur 4, la prémisse restant verte.

### ⚠️ QUATRE DÉFAUTS INTRODUITS PAR LE CORRECTIF LUI-MÊME, TROUVÉS PAR `audit-passio`

Les gates étaient vertes, 111 tests au vert, et le lot rouvrait **deux fois** le défaut qu'il
fermait. À conserver : **la famille commune est « le correctif marche pendant la démonstration »**.

⚠️ **① LA COCHE DU GROUPE ÉTAIT EFFACÉE PAR LE REPEINT — la même impasse dure, décalée de deux
secondes.** `_groupeAssurerLibelles` réécrivait `innerHTML` ; `confirmCreateGroup` relit
`.group-passion-option.selected`. Mesuré : coches avant repeint **1**, après **0**. La grille est
le premier bloc interactif après le nom, donc on coche AVANT que les 568 Ko arrivent, et « Créer le
groupe » répond « Choisis au moins 1 passion ». **Le même lot le faisait correctement dans app-07**
(`sel.value = choix`) : c'est l'asymétrie entre deux surfaces sœurs qui a laissé passer le défaut.

⚠️ **② `_refVues` EST UNE MÉMOIRE DE SESSION, ET « CHOISIE PUIS INVISIBLE » REVENAIT AU
RECHARGEMENT.** Première visite : le ski entre dans le fil. Rechargement : il y est encore
(`restoreFeedPassions` ne filtre rien). On rouvre le panneau, on ajoute « Musique », on valide →
**le ski est jeté**, `estPassionCanonique` le rendant `false` et le registre étant vide. Et le pire
endroit est `migrerPreferences`, appelée depuis `reprise()` **après le `location.reload()`** de
« Se connecter » : la passion est perdue au moment exact où elle devrait s'attacher au compte. La
réponse n'est pas de persister un registre, c'est `passionPlate(id)` — **le référentiel plat est le
MIROIR de la table `passions`**, sa réponse se refabrique à chaque session. ⚠️ **Hors repli hors
ligne** : `repliHorsLigne()` fabrique ses entrées depuis le socle et `state.user.profiles`.

⚠️ **③ LE LOT ÉLARGISSAIT LA LISTE BLANCHE DE PUBLICATION.** Il appelait
`enregistrerPassionCanonique` sur tout résultat affiché, avec le commentaire « on n'y inscrit QUE ce
que le référentiel a rendu » — **que le code ne vérifiait pas**. En repli hors ligne, `charger()`
bâtit ses données depuis `state.user.profiles` : mesuré, `estPassionCanonique("custom_…")` passait
de `false` à **`true`**. L'appel n'était même pas nécessaire (`metaPassion` consulte `_refVues`
AVANT `passionConnue`). **`estPassionCanonique` reste la SEULE autorité de publication, et un lot
d'AFFICHAGE n'y touche pas** — `_exChercherPassions`, le correctif du 03/09 dont ce lot se réclame,
n'inscrit rien du tout.

⚠️ **④ `PassioPassions.charger()` ET `chargerReferentielPassions()` SONT DEUX MÉCANISMES DISJOINTS,
et un commentaire du lot les confondait.** Le premier remplit le JSON d'**affichage**, le second
`_referentielPassions`, la liste blanche que `requiredCanonicalPassion` consulte à
l'**enregistrement**. Mesuré : référentiel plat chargé, `estPassionCanonique("glisse-ski-alpin")`
rend encore **`false`**. Conséquence vivante : le `<select>` proposait une passion que « Publier »
refusait — là où, avant le lot, elle n'était pas proposée du tout. On demande donc les **deux** à
l'ouverture. ⚠️ Et filtrer par `estPassionCanonique` **seule** ramènerait les 19 : la liste accepte
aussi ce que le référentiel plat connaît.

⚠️ **AU PASSAGE, DEUX VERROUS QUI NE VERROUILLAIENT RIEN.** ⓐ « Voir toutes les passions » assertait
`> 12` — or `voirToutes()` peignait DÉJÀ les 19 du socle avant le lot, et le cas restait vert
**référentiel entièrement coupé**. L'élargissement se mesure contre `allPassions().length`, pas
contre une constante. ⓑ Les cas de la seconde suite **n'exerçaient jamais le repeint** :
`PassioPassions.pret()` est déjà vrai à l'ouverture quand le compte porte une passion hors socle
(`evaluerBesoinDeNoms` a chargé au boot), donc les deux fonctions neuves sortaient sur leur garde
`m.pret()` — **c'est très exactement pourquoi le défaut ① est passé**. Il faut RETARDER le
référentiel dans le banc. Corollaire : le cas « 568 Ko jamais au démarrage » vaut pour un
**visiteur sans passion**, pas pour un compte dont une passion est hors socle.

### ⚠️ LE PIÈGE D'ENVIRONNEMENT EN SENS INVERSE : ROUGE EN LOCAL, VERT EN CI

La maison connaît « vert en local, rouge en CI » (divergence du vrai SDK) et le cherche partout.
**L'inverse existe aussi, et il fait perdre autant de temps.** Mesuré le 2026-09-12 en cherchant
pourquoi le lot était rouge après une fusion de `main` :

- `tests/e2e/profil-visite-options.spec.js` (5 cas) et trois cas de `profil-entete-passions`
  échouent **en local**, sur `origin/main` PUR, dans un worktree neuf — donc sans aucun apport du
  lot en cours. Symptôme : `.modal.modal-fullscreen` « element(s) not found » après
  `openUserProfile("u_lea")`.
- Les mêmes sont **VERTS en CI sur ce même commit** (run 2642).

⚠️ **CONSÉQUENCE DE MÉTHODE, ET C'EST LE VRAI ENSEIGNEMENT** : rejouer le shard en échec en local
a produit **8 échecs qui n'étaient pas ceux de la CI**. Une reproduction qui rougit n'est une
reproduction que si elle rougit **pour la même raison** — sinon elle envoie enquêter à côté, avec
la conviction d'avoir trouvé. Le contrôle qui tranche tient en une commande : **rejouer la suite
suspecte sur `origin/main` dans un worktree séparé** (`git worktree add`, `PASSIO_PORT=8099` pour
ne pas percuter le serveur du port 8080). Si elle y rougit aussi, le lot est hors de cause et il
faut chercher ailleurs.

⚠️ **ET LA COMPOSITION D'UN SHARD N'EST PAS STABLE ENTRE DEUX COMMITS** : Playwright répartit des
CAS, pas des fichiers. Ajouter des tests — le lot en ajoute, la fusion de `main` en apporte deux
suites de plus — **décale tout le découpage** : le « shard 4/6 » d'avant et celui d'après ne
contiennent pas les mêmes tests. Comparer « le shard 4 était vert, il est rouge » n'a donc aucun
sens sans regarder ce qu'il contient. Rejouer `--shard=4/6` en local ne rejoue le même ensemble
que si le nombre total de cas est identique.

⚠️ **POINT OUVERT, ET IL EST DÉLIBÉRÉMENT LAISSÉ** : le moteur IA local (`aiGenerateResponse`,
app-06) ne sait nommer que 19 passions dans sa branche « 🎯 Passions trouvées », et ses cartes sont
cliquables — donc c'est une surface de découverte, bornée au socle, en comparaison littérale sans
alias ni accents. Ce n'est **pas** un blocage (c'est le repli de l'Edge Function Claude, qui répond
en temps normal) ; c'est le prochain de la famille.

## 🔤 ALIAS À LA CRÉATION D'UNE PASSION (2026-09-10)

Trouvé en VÉRIFIANT un autre lot, pas par un rapport : après le rattrapage des alias (3 674, plus une seule des 2 088 passions curées sans alias), la base rendait encore **six lignes à zéro** — exactement l'écart entre la base (2 094) et le dépôt (2 088), c'est-à-dire les passions **créées depuis l'application**. `creer_passion` écrivait `aliases = '{}'` EN DUR. « GRS » existe depuis le 2026-09-09 et reste introuvable en tapant « gymnastique rythmique ». **Inégalité structurelle** : une passion curée a deux ou trois portes d'entrée, une passion créée n'en a qu'une — alors que son auteur est justement celui qui sait comment on la nomme autrement.
⚠️ **LE LIBELLÉ SEUL DÉCIDE DU DOUBLON, UN ALIAS N'A JAMAIS CE POUVOIR.** Créer « Course nocturne » avec l'alias « running » n'en fait pas un doublon de Running — l'alias y est plus général. Un alias qui percute l'existant est **ÉCARTÉ, jamais un motif de refus** (le banc mesure les deux sens : l'alias part, la passion est créée quand même).
⚠️ **ÉCARTÉ, MAIS PAS EN SILENCE** : un alias qui est le LIBELLÉ d'une autre passion fait remonter DEUX entrées pour le même mot, et `rechercher_passions` départage alors sur un critère que personne n'a choisi — l'erreur que `valider-referentiel-passions.js` refuse dans le dépôt et que la base ne refusait **nulle part**. `creer_passion` RETOURNE donc les alias RETENUS, et le client remonte `aliasRetenus` : ce que le serveur a gardé, jamais ce qu'on a demandé.
⚠️ **UNE SURCHARGE, PAS UN REMPLACEMENT.** Un troisième paramètre `default null` sur la même fonction rendrait tout appel à DEUX arguments **AMBIGU** (« function is not unique ») — et un appel ambigu, côté PostgREST, se lit comme « la fonction n'existe pas », donc comme un repli sur la demande non publiable. `creer_passion(text,text)` survit en déléguant à `creer_passion(text,text,text[])`. ⚠️ Le changement de type de retour impose un `DROP`, qui **efface les grants des DEUX signatures** : les `revoke`/`grant` sont rejoués pour chacune, et **nommément pour `anon`** (les privilèges par défaut de Supabase les redonnent par un grant NOMINATIF qu'un `revoke ... from public` laisse entier).
⚠️ **DÉPLOYABLE AVANT SA MIGRATION, et c'est mesuré** (verrou ⑮) : `creerPassion` n'ajoute `p_aliases` **que si des alias ont été saisis** — sans saisie, la charge utile est identique à l'octet près. Sinon une base à deux arguments répondrait `PGRST202`, que `creerPassion` traite comme un **verrouillage DÉFINITIF de la création pour toute la session**.
⚠️ **`rendrePied` POSE `innerHTML` À CHAQUE FRAPPE** : le champ d'alias garde sa valeur sur l'INSTANCE (`this.alias`), l'écoute est **déléguée** (elle survit au remplacement du nœud) et ne déclenche aucun re-rendu — même famille que le cache `_lastHtml` de `renderProfileStrip`. Le champ n'apparaît **que si la création est possible** : sous le chemin de demande les alias ne seraient transmis à personne, et un champ qui ne sert à rien est un mensonge d'interface.
Rattrapage des passions déjà créées : `npm run passions:moderation alias --id … --ajouter "a,b"` (canal ② d'ADR-012). ⚠️ Il **REFUSE** un alias qui percute, là où le serveur l'écarte — ici il y a un humain devant. ⚠️ Réservé aux `user_suggested` : les alias des entrées curées vivent dans `data/passions/` et une retouche en base serait **écrasée au prochain delta**.
Verrous : `scripts/verifier-migration-creation-passion.sh` (70 contrôles, gate CI — dont ⑥ quater) et `tests/e2e/creation-passion.spec.js` (18, dont ⑭–⑱). ⚠️ Le contrôle de retour arrière du banc ne supprimait **qu'une** des deux signatures : il annonçait « exécuté » en laissant la fonction vivante sous l'autre forme. Détail et points ouverts (4 résidus de test `active` en prod) : `docs/lots-ui/24-ALIAS-A-LA-CREATION-2026-09-10.md`.

## 🚪 PREMIÈRE VISITE — « l'application est elle-même le pitch » (ACTIF PAR DÉFAUT)

`js/first-run.js` (IIFE `window.PassioFirstRun`) : un visiteur sans compte entre DIRECTEMENT dans le fil — aucune landing, aucun formulaire, **aucune demande de permission** (GPS, notifications, caméra) — et ne rencontre l'inscription qu'à la première action engageante (`requireAuthentication(ctx)`). Coupures : `localStorage.passio_first_run_experience_v1="0"` et `window.PASSIO_FIRST_RUN_V1=false`. **Un compte existant n'entre JAMAIS dans ce parcours.** Aucun compte anonyme n'est créé, aucune RLS n'est desserrée.
Trois règles générales : **`MY_UID` ne prouve PAS qu'un compte existe** (seul un uuid Supabase le prouve) ; garder la fonction qui ÉCRIT ne suffit pas, il faut garder celle qui **OUVRE LA PORTE** (cas `meOpen` → caméra) ; tout module inliné hors bloc `BUILD:APP` doit écouter `passio:app-ready` et y remettre ses compteurs à zéro. ⚠️ **`js/first-run.js` doit être chargé AVANT le bloc `BUILD:APP`** dans `index.html` : `app-09` lance `boot()` dans une microtâche qui part dès que la pile se vide, donc avant l'exécution du script suivant — placé après, le module n'est pas encore évalué quand `boot()` le cherche.
Convention de test : une suite qui démarre d'un appareil VIERGE et attend la landing historique pose `poserGateSansPremiereVisite(page)` (`tests/e2e/gate-helper.js`) et garde TOUTES ses assertions. Verrou : `tests/e2e/first-run.spec.js` (38).
**Se connecter à un compte DÉJÀ créé (2026-09-02)** — sans landing, le formulaire n'est plus à l'écran, et un appareil neuf/vidé/déconnecté fait passer un inscrit pour un visiteur. Trois portes : le lien de la carte de bienvenue, l'entrée « Compte » des Paramètres (libellé réécrit par `majSectionCompte()` à chaque ouverture — le panneau est du balisage STATIQUE, et tout ce qui suppose un compte y est masqué pour un visiteur), et toute déconnexion volontaire. ⚠️ `doLogout('signin')` pose l'intention `passio_auth_intent_v1` **APRÈS** `purgeAccountScopedData` (clé d'APPAREIL hors `ACCOUNT_SCOPED_KEYS`, HORODATÉE — TTL 10 min, sinon un « mur de connexion » resurgit des jours plus tard) ; `boot()` la consomme au tout début et l'applique **APRÈS** `entreeDirecte()`, jamais avant : c'est `entreeDirecte()` qui CONSTRUIT le mode invité (classe racine, contenu public, bienvenue), la sauter rendait un fil à moitié bâti derrière « ← Continuer à explorer », sans une erreur. Une session survivante + une intention = déconnexion inachevée : on lit `{ error }` de `signOut` (le SDK ne lève pas), `purgerJetonAuthLocal()` ferme la session CÔTÉ APPAREIL (le jeton `sb-<ref>-auth-token` EST la session pour le SDK, et `ACCOUNT_SCOPED_KEYS` ne le connaît pas), puis on RECHARGE — la purge ne vide pas la MÉMOIRE, et `saveConversations` n'a pas de garde `_accountPurged` : poursuivre sans recharger réinstallerait les messages privés du compte quitté pour le suivant. Aucun second système d'auth : `openAuthScreen` délègue à `PassioFirstRun.allerConnexion` (étape `splash`, jamais `auth`, alias mort en `display:none`). Verrou : `tests/e2e/connexion-compte-existant.spec.js` (14).
⚠️ **L'ÉTAT LOCAL APPARTIENT À UN COMPTE, JAMAIS À L'APPAREIL (2026-09-02).** Explorer sans compte puis se connecter POUSSAIT l'état de l'exploration dans `user_state` du vrai compte, via le beacon de `pagehide` (`supaSaveUserStateBeacon`), dont `onbDoAuth` levait les TROIS gardes avant son `reload`. `adopterCompteConnecte(uid)` (app-02) purge l'état local quand l'appareil adopte un compte dont il ne provient pas, aux **TROIS** entrées (`onbDoAuth` signin, `boot()`, et `onAuthStateChange` — qui, lui, PROTÈGE sans purger ni recharger : y adopter casserait les quatre suites e2e à comptes réels, donc la CI, donc le déploiement). ⚠️ **Le discriminant est un INSTANTANÉ pris à l'évaluation d'app-02, jamais une relecture** : supabase-js notifie ses abonnés PENDANT `signInWithPassword`, donc `onAuthStateChange` a déjà réécrit `passio_uid` quand la garde le consulterait — elle ne se déclenchait alors JAMAIS sur le chemin le plus courant. Sonde d'écriture sur clé JETABLE (jamais `passio_uid`, sinon une interruption désarme la garde à vie). ⚠️ **`_peutPousserEtat()` interdit toute écriture d'état** (les DEUX chemins : `supaSaveUserState` et le beacon) tant que la restauration n'est pas confirmée (`passio_restauration_requise`, persisté, levé au premier verdict RÉUSSI de `supaLoadUserState`) ou que l'état appartient à un autre compte — sans quoi une seule lecture ratée après la purge EFFACE le compte. ⚠️ `attribuerEtatLocalAuCompte` est la contrepartie : inscription et `signInAnonymously` DÉCLARENT la propriété sans purger, sinon l'onboarding en cours est jeté. ⚠️ Le profil de remplissage fabriqué par `boot()` (`allPassions()[0]` = « Musique ») porte `_parDefaut` et n'est compté NULLE PART — ni dans le verdict serveur, ni dans `restoreFeedPassions`, ni dans le repli local ; les choix du visiteur passent en TÊTE de la fusion. ⚠️ Le parcours « mot de passe oublié » ne se recharge JAMAIS en cours de route (fragment consommé, lien à usage unique) : l'adoption est déplacée au changement effectif du mot de passe, et la branche « déconnexion inachevée » de #250 porte la même exception. ⚠️ **Tester la fonction ne suffit pas** : le câblage, non couvert, pouvait être supprimé sans un seul rouge.
⚠️ Une passion du référentiel plat s'affichait « ✨ Passion » sans son nom tant que le sélecteur n'avait pas été ouvert. `js/passions-flat.js` charge désormais le référentiel **uniquement si un identifiant à l'écran n'est pas nommé par le socle embarqué**, et APRÈS l'hydratation — l'invariant « 568 Ko jamais au démarrage » (`passions-plates.spec.js` ⑤ et ⑰ bis) tient. Charger ne suffit pas : il faut invalider `_lastHtml` et `_feedDomSig` avant de repeindre.
Les quatorze pièges mesurés, le fil de découverte, le catalogue additif `SPECIALITES`/`SYNONYMES`, la migration des préférences, la propriété de l'état local et les corrections après essai réel : `docs/PREMIERE_VISITE.md`. Verrous dédiés : `tests/e2e/exploration-anonyme-vs-compte.spec.js` (12) et `tests/e2e/connexion-compte-existant.spec.js` (15).
⚠️ **Une spécialité proposée sous une passion EST une passion du référentiel plat**, avec son identifiant canonique (`["cyclisme","Vélo et cyclisme"]`) : les identifiants fabriqués (`"sport:velo"`) n'entraient pas dans `_activeFeedPassions` et le fil ne montrait que la passion PARENTE. Les intérêts du fil sont **parente PUIS spécialités** (`interetsDuVisiteur`), jamais l'une à la place de l'autre, aux DEUX points d'écriture (`appliquerPrefs` et `migrerPreferences`) ; `npm run passions:verifier` refuse un identifiant absent de `data/passions/`.

## 📚 Références projet
- **Lots UI-1, UI-3A/3B, UI-4B, UI-4A0/4A1/4A2** (direction UX : `docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md`) — récit, pièges détaillés et conventions de test : **`docs/lots-ui/01-UI1-A-UI4A2.md`**.
  ⚠️ Invariants : chaque drapeau ne sait qu'ENLEVER (`localStorage.passio_ui_v2|ui_3|ui_4b|ui_4a0|ui_4a1|ui_4a2="0"`, ou le `window.PASSIO_*` à `false`) ; JAMAIS de rendu cadencé sur `requestAnimationFrame` (une page qui ne compose pas de frames ne le déclenche pas) ; masquer par CSS ancré à la classe racine plutôt que RETIRER du DOM, et BORNER ce masquage au marqueur de décoration (`data-v3-decore`, `data-v4a2`) sous peine de retirer la seule porte d'une carte non décorée ; DÉPLACER les nœuds rendus, jamais les régénérer (onclick inline + ids attendus par des chargements asynchrones) ; le marqueur RSVP vit sur le nœud INJECTÉ, jamais sur `#eventDetailCta`.
- **UI-5 — bobines connectées au réel — et routage des liens profonds** (`#reel=`, `#irl-event-`, `#irl-checkin-`) : **`docs/lots-ui/02-UI5-BOBINES-ET-LIENS-PROFONDS.md`**.
  ⚠️ Invariants : le lecteur de bobines est en `z-index: 9999` (toasts 200, fiche activité 200, feuilles basses 1200) → FERMER le viewer avant toute sortie ; décorer par `MutationObserver`, jamais par enveloppe de fonction (`openReels` réécrit `innerHTML` à chaque ouverture) ; un lot sans contenu éligible est indiscernable d'un lot cassé. Tout deep link : garde d'APPARTENANCE à `buildReels(id)` (jamais une copie de ses conditions — elle écarte aussi les comptes bloqués), `state` vaut **null** avant `loadState()`, corps entier sous `try` qui REPLANIFIE au lieu de conclure, id mémorisé au premier passage, hash nettoyé au SEUL chemin de succès, et rien d'ouvert par-dessus le gate, la landing ou l'onboarding.
- **Palette §5, garde de déploiement, et « pourquoi un aperçu est invisible alors que tout est déployé »** : **`docs/lots-ui/03-PALETTE-ET-MISE-EN-LIGNE.md`**.
  ⚠️ Invariants : violet `#6D32F4` remappé sous `:root.passio-ui-v2`, corail `#FF6B57` STRICTEMENT réservé au passage au réel (jamais dans un jeton d'accent général) ; **ne jamais annoncer « c'est en ligne » sans avoir vu le job « Déploiement production » VERT** (la garde Gouvernance critique perd une course avec l'indexation GitHub → relancer le job en échec) ; `state` vaut `null`, pas `undefined` — chasser tout `typeof state === "undefined"` suivi d'un accès à une propriété ; **tout module inliné hors bloc app DOIT écouter `passio:app-ready` et y remettre ses compteurs de reprise à zéro** ; une preview de PR est une AUTRE origine (`_estDeploiementPassio()`, `js/platform.js`) ; aucune suite e2e n'exerce la fenêtre « gate affiché, application absente » — un vert e2e n'infirme jamais ces causes.
- **Lots UI-4A4, UI-6, UI-6A, UI-6B, UI-7 et UI-4A5** (outils de Rencontrer, composer, inbox Messages, profil, vocabulaire, vue Filtre) : **`docs/lots-ui/04-UI4A4-A-UI7-ET-UI4A5.md`**.
  ⚠️ **La vue Filtre a été REFONDUE le 2026-09-04 (fiche 20) : lire cette fiche-là avant d'y toucher.** Le repli du volet Date reste en **JS, jamais en CSS** (`window._irlFilterTab` posé à une sentinelle NON VIDE, rendue à `"date"` à la fermeture) : masquer en CSS laisserait le moteur croire qu'un volet est ouvert et la pastille « filtre actif » mentirait. Le reste du texte du 2026-09-02 (trois volets, cases de 44 px, « tout tient sur un écran ») décrit l'état d'AVANT la refonte.
  ⚠️ Invariants : coupures `localStorage.passio_ui_4a4|5|6|6a|6b|7|4a5="0"` ; **`studioType` est la SEULE source de vérité de ce qui est publié** (masquer les onglets de format sans elle publierait un post « texte » avec la photo perdue EN SILENCE) ; un TITRE n'est pas un identifiant d'écran — utiliser `ContextualTools.pageType()` / `#ctxToolsRoot[data-ctx-page]` ; **le bloc CSS UI-4A5 doit rester le DERNIER de `styles.css`** ; `renderProfileStrip` réécrit `#profileStrip` en entier (cache `_lastHtml` compris) → poser tout ajout en FRÈRE ; verrou de coupure `if (!actif()) return;` dans toute fonction de décoration ; `studioType`, `photoDataUrl`, `irlPassionFilters`… sont des `let` de portée script et **ne sont pas** des propriétés de `window`.
- **Cases violet léger (lavis) des feuilles « Créer » / « Trouver une expérience » et du panneau Filtres** : **`docs/lots-ui/05-LAVIS-VIOLET.md`**.
  ⚠️ Invariants : `--accent-tile` / `--accent-tile-on` / `--accent-tile-line` sont déclarés dans les DEUX palettes (`:root` et `:root.passio-ui-v2`) et sont **OPAQUES**, jamais des `rgba` (le contrôle de contraste remonte au premier fond opaque et ignore l'alpha) ; l'état coché se lit à la DENSITÉ du lavis et au filet plein, **jamais à l'opacité** (un texte à `opacity: 0.55` sur lavis tombe sous le seuil AA) ; les règles sont PARTAGÉES entre `#v2CreateSheet` et `#v3PassioSheet` mais toujours ancrées à un IDENTIFIANT de feuille, jamais à `.v2-sheet-item` seul, qui reste le socle générique.
- **Bobine épinglée, isolation de la suite e2e, vue Carte sous les onglets** : **`docs/lots-ui/06-BOBINE-EPINGLEE-VUE-CARTE-TESTS.md`**.
  ⚠️ Invariants : `buildReels(pinnedId)` épingle TOUJOURS la cible, qui doit être l'indice 0 — un épinglage conditionnel montre la bobine d'un tiers pendant ~2 s ; **un test qui laisse une requête de production remplir son état ne mesure pas ce qu'il croit** (vider `state.supabasePosts` avant de semer un fixture ; `renderFeed` ne peint que 20 cartes tout de suite) ; la vue Carte DÉPLACE `#irlMapWrap` sans jamais le recréer (Leaflet ne se réinitialise pas deux fois), sa destination est `#eventList` et **jamais `barre.nextSibling`** (UI-4A5 s'y ancre — deux modules s'y renverraient la balle), et la restitution mémorise les DEUX voisins.
- **Moods du Studio alignés sur le rail d'intentions** (Idées · Apprendre · Rencontrer · Tous) : **`docs/lots-ui/07-STUDIO-MOODS.md`**.
  ⚠️ Invariants : les LIBELLÉS changent, **les VALEURS non** — `creation`, `learn`, `irl`, `all` sont écrites dans `posts.mood` et relues par `legacyMoodToFeedIntent` (renommer une valeur ferait perdre son classement à toute publication existante) ; `PASSIO_MOOD_LABELS` + `moodTagLabel()` / `moodShortLabel()` (app-02) sont la SEULE table de libellés — elle ne porte plus d'emoji depuis le retrait des emojis décoratifs (2026-09-03), `all` restant hors table pour que le neutre ne porte aucun badge ; le rail historique `#moodSelector` reste gelé à l'octet près sous `passio_feed_intents_v1="0"`.
- **Refonte multi-passion (ADR-011)** — fil additif, profil à deux onglets, identité centralisée, Studio seul point de choix : **`docs/lots-ui/08-REFONTE-MULTI-PASSION.md`** (décision : `.passio/adr/ADR-011-refonte-multi-passion.md`).
  ⚠️ Invariants : les **SOURCES** du fil sont un **OU inclusif** — suivis (`state.feedFollowingOn`) et passions sont cumulables, cocher l'un n'éteint jamais l'autre. ⚠️ **LES ENVIES N'EN SONT PLUS UNE (revirement du 2026-09-09, fiche 23)** : elles FILTRENT l'union, elles ne l'élargissent jamais. `state.feedIntents` démarre **VIDE** (un critère coché d'usine ÉLARGIRAIT au lieu de restreindre) ; l'identité affichée passe par `passionsAffichables()` / `passionsPubliques()` et **jamais la liste brute**, qui contient les passions ARCHIVÉES, avec `escapeHtml` obligatoire et un rendu BORNÉ ; retirer un onglet peut fermer une fonction (la gestion des passions vit dans `#passionManager`) ; `_passionTileOnclick` écrit chaque `onclick` EN TOUTES LETTRES, seul l'argument circule.
- **Retrait du Carnet de voyage (ADR-011 §6)** — écran, éditeur, CDV Lives, géocodage, liens profonds, 32 fonctions Supabase : **`docs/lots-ui/09-RETRAIT-CARNET-VOYAGE.md`**.
  ⚠️ Invariants : `goTo("cdv")` est REDIRIGÉ vers le fil (un ancien lien profond ne doit jamais laisser l'app sans écran actif) ; AUCUNE donnée n'est détruite (`localStorage["passio_cdv_lives"]`, posts de type `vlog`, tables `cdv_*`) ; **`_kmBetween` RESTE dans app-03** — app-07 s'en sert pour trier par proximité, et l'appel est gardé par un `typeof` donc sa perte serait silencieuse ; **le typage `vlog` est conservé à la LECTURE** (`supaLoadPosts`) : c'est une garantie de CONFIDENTIALITÉ, sans lui un carnet « Privé » s'afficherait en clair dans le fil de tout le monde.
- **En-tête du profil — couverture jusqu'au pseudo, avatar agrandi** : **`docs/lots-ui/10-PROFIL-ENTETE.md`**. ⚠️ Son volet « passions cliquables vers la page de la passion » a été DÉFAIT le 2026-09-02 (voir la fiche 11 ci-dessous) : ne pas le réappliquer depuis cette fiche.
  ⚠️ Invariants : l'`aspect-ratio: 3/2` de `.main-profile-cover` ne s'élargit JAMAIS pour gagner de la hauteur — c'est le rapport du recadreur (1080×720), l'élargir rognerait les côtés de toutes les couvertures déjà recadrées ; le plafond de la couverture, le `margin-top` de `.main-profile-avatar-wrap` et la taille de l'avatar sont TROIS NOMBRES LIÉS ; la carte d'identité doit rester sous les deux tiers de la zone visible (contre-mesure explicite à toute demande d'agrandissement) ; le second argument d'`openPassionExplorer(pid, retourUserId)` est gardé volontairement sans appelant, `openModal` n'empilant pas.
- **Quatre retouches esthétiques du 2026-09-02** (carte du fil, « Voir la page de la passion », rail du profil en pastilles, feuille « Créer » en grille) : **`docs/lots-ui/11-RETOUCHES-ESTHETIQUES-2026-09-02.md`**.
  ⚠️ Invariants : une carte du fil ne nomme la passion QU'UNE FOIS — pas de `.ident-passions` dans `renderPostHTML` ni `openPost` (ADR-011 §3 tient ailleurs : surfaces denses et en-têtes de profil) ; la clé de télémétrie reste `people` et le moteur `discoverPeople`, seuls le libellé et l'icône changent ; **le rail du profil rend des BULLES** (`passionTileHTML`, le composant du Fil — exigence d'ADR-011 §1 et §7), ce qui a été RETIRÉ c'est la ligne de TITRES sous le pseudo (`#mainProfileIdent`) : ne pas relire « les onglets ronds violets sous le pseudo » comme visant le rail, l'erreur a coûté deux tours le 2026-09-02 ; la grille 2 colonnes est bornée à `#v2CreateSheet`, la PEAU (lavis) restant partagée avec `#v3PassioSheet`.
- **Profil visité : partager / signaler / bloquer dans le « ⋯ »** (`openVisitedProfileMenu`, app-04) : **`docs/lots-ui/12-PROFIL-VISITE-OPTIONS.md`**.
  ⚠️ Invariants : `.profile-dots-menu` est à `z-index: 10002`, au-dessus de `.modal-backdrop` (10001) — à 1200 le menu est dans le DOM et INVISIBLE, et un test d'existence resterait vert dessus ; le « ⋯ » est à `right: 56px` car le `×` d'`openModal` occupe le coin, et **cette modale porte DEUX `×`** (celui injecté et celui du balisage) ; aucun moteur n'est dupliqué — `_profileDotsOpen` (app-06) et `shareUserProfile` / `reportUser` / `blockUser` ; `reportUser` ENVOIE puis FERME, donc un test doit mesurer la VISIBILITÉ, pas la présence dans le DOM.
- **Archives de passions et quota de changements (2026-09-02)** — la passion archivée qu'on ne pouvait plus reprendre, la liste qui n'existait pas, et le plafond qui ne bornait rien : **`docs/lots-ui/16-ARCHIVES-PASSIONS-ET-QUOTA.md`**.
  ⚠️ Invariants : `CHANGEMENTS_PASSION_OFFERTS = 3` et **seul l'ARCHIVAGE D'UNE PASSION VIVANTE consomme un changement** (restaurer ne coûte rien — la porte dérobée ④ d'UI-8 reste fermée ; un échange complet coûte 1, jamais 2) ; le compteur se LIT dans `state.user.passionChanges.entries`, jamais dans un nombre tenu à côté ; **`comptePassioReel()` est la SEULE définition du mot « compte »** (`state.onboarded` ou un uuid Supabase — `MY_UID` ne prouve RIEN) ; **le PLAFOND de 3 vivantes est UNIVERSEL, seul le QUOTA de changements est exempté en démo** (`quotaChangementsActif()`) — les confondre rouvre le CRÉDIT DE DÉMO : la porte d'ajout n'étant pas gardée par `requireAuthentication`, un visiteur accumulait 8 passions puis les gardait en s'inscrivant ; un mouvement fait en démo est marqué `compte: false` **à l'écriture** et n'est jamais facturé après l'inscription (sinon la démo illimitée facture avec un jour de retard) ; les gardes sont aux DEUX bouts (`confirmArchivePassion` ET `archiverPassion`) et **un refus ne débite jamais** — la garde « dernière passion vivante » passe AVANT l'inscription au journal ; les archives restent les entrées `archived:true` de `state.user.profiles`, **jamais un second magasin** ; `#passionArchiveBox` et `openArchivedPassions` partagent `_lignesArchiveesHTML`, un seul constructeur ; au plafond, `restaurerPassion` ouvre `openPassionPaywall({ restaurer })` qui propose l'ÉCHANGE — une porte fermée doit dire par où passer, et quand le quota est épuisé le bouton dit « Indisponible » et la fenêtre RETIRE « Gérer mes passions » (sinon mur → panneau → mur, en boucle) — **et depuis le 2026-09-03 elle le retire AUSSI quand le panneau est déjà ouvert et à l'écran** (`_paywallCacheGerer`), la porte d'ajout vivant désormais DANS ce panneau : le bouton y renverrait devant la bulle qui vient de refuser ; **le plafond se garde à TOUTES les portes** — `quickCreateProfile` (app-07) et le Studio (`passions-flat-ui`) écrivaient hors du moteur unique, et le Studio écrivait `#postPassion` AVANT de savoir si l'ajout était accepté (publication silencieuse dans une passion non possédée). **la fusion multi-appareils est BORNÉE par le plafond** (`reinjecterProfilsLocauxBornes`, app-02) — deux appareils à trois passions DIFFÉRENTES donnaient six vivantes ; elle ne borne QUE ce qu'elle AJOUTE, l'état serveur n'est jamais rétrogradé (un compte antérieur au plafond garde ses cinq), rien n'est supprimé (surnuméraires `archived:true`) et rien n'est facturé. Verrou : `tests/e2e/passions-archive-quota.spec.js` (29).
- **Lot UI-8 — « une personne, plusieurs passions »** (archivage au lieu de suppression, filtres à choix unique, six portes dérobées fermées) : **`docs/lots-ui/13-UI8-UNE-PERSONNE-PLUSIEURS-PASSIONS.md`**.
  ⚠️ Invariants : coupure `passio_ui_8="0"`, qui doit rendre **les MOTS aussi** (vocabulaire du composer et des Messages) ; `currentProfileId` est la seule vérité de l'identité active et `switchToProfile()` son seul point d'écriture ; **archiver ne supprime RIEN** — `supaUpsertProfile` ne publie que les passions VIVANTES, `archiverPassion` nettoie `_activeFeedPassions` et rebascule `currentProfileId`, et la passion active n'est JAMAIS archivée (le nettoyage vit aux points d'ÉCRITURE, jamais à l'affichage) ; deux modules ne peuvent pas écrire la même carte (`cartesReprisesParV8()`) ; dans `styles.css`, le bloc UI-8 se pose JUSTE AVANT le bloc UI-4A5, qui reste le dernier.
- **Fil : en-tête permanent, pastille de mood, fenêtrage `feed_window_v1`** : **`docs/lots-ui/14-FIL-ENTETE-ET-FENETRAGE.md`**.
  ⚠️ Invariants : l'en-tête du fil **ne se replie plus au défilement** — la bascule `.chrome-collapsed` a été supprimée, code et CSS (les deux exigences, anti-oscillation et réouverture, étaient contradictoires) ; ne JAMAIS réintroduire un `<span class="post-mood-tag">` sans condition (`_moodTagHTML`), et ne jamais lire les moods dans le DOM d'un rail MASQUÉ — la source de vérité est `PASSIO_MOOD_LABELS`, liste BLANCHE ; `feed_window_v1` est COUPÉ par défaut et **réhydrater REMPLACE `card.innerHTML`** → tout futur décorateur de carte doit être rebranché dans `_feedWindowRedecorer`, sinon il disparaît au premier défilement.
- **Douze défauts trouvés par audit adversarial (2026-08-29)**, tous en production, mesurés et éprouvés par mutation : **`docs/lots-ui/15-AUDIT-DEFAUTS-2026-08-29.md`**. Famille commune : **une règle ou un test qui survit à la disparition de sa cible**.
  ⚠️ Invariants : `v()` du formulaire d'activité ÉCHAPPE DÉJÀ — ne jamais le ré-envelopper dans `escapeHtml` (la corruption s'aggrave à chaque enregistrement) ; une donnée d'autrui échappée à un endroit doit l'être PARTOUT (`eventType`, `duration`) ; les notifications sont rendues **sûres par défaut** avec un discriminant de confiance (`n.html === true` ou `kind === "local"`), et un désinfectant appliqué à deux étages doit être **IDEMPOTENT** — jamais deux `escapeHtml` empilés ; `createdAt` est obligatoire sur tout post fabriqué (sans lui `supaPublishPostWithRetry` lève et le partage n'atteint jamais Supabase) ; `input.click()` remonte à son conteneur → poser la garde sur l'INPUT ; « Mes passions » doit dire la même chose partout (`passionsVivantes()`) ; retirer un chemin d'accès peut supprimer le seul chemin de RETOUR d'un état transitoire.
- **Le fil de démonstration dit sa passion et son envie (2026-09-02)** — TROIS pastilles (le vocabulaire tombe à quatre intentions), corpus réécrit sur les envies vivantes, 105 publications reliées à une activité, la passion enfin lisible sur la carte : **`docs/lots-ui/17-CONTENU-PASSION-ET-MOOD.md`**.
  ⚠️ Invariants : **`PASSIO_MOOD_LABELS` (ce qui s'AFFICHE : 3) et `PASSIO_MOODS_ADMIS` (ce qui a le DROIT d'exister : 5) sont DEUX tables** — les confondre, c'est soit ressusciter « Chill »/« Actu » à l'écran, soit faire DISPARAÎTRE du fil les milliers de publications de production qui les portent ; « Explorer » n'aura JAMAIS de pastille (elle se calcule côté lecteur) ; **seul `eventId` fait apparaître « Voir l'activité »**, et un identifiant introuvable ne casse rien — il ne peint RIEN, donc le défaut est invisible (verrou ② quater) ; une publication reliée doit porter `irl`, sinon la carte ouvre un rendez-vous sous une étiquette qui n'en annonce aucun ; `data-mood` n'est posé QUE sur la branche où `moodTagLabel` a rendu un libellé — le neutre `all`, le mood absent et le mood inconnu ne dessinent toujours AUCUNE pastille (la couleur ne doit jamais ressusciter la capsule creuse) ; les fonds de pastille sont **OPAQUES**, jamais des `rgba` (le contrôle de contraste remonte au premier fond opaque et ignore l'alpha) ; le ton chaud de « Rencontrer » est le SEUL usage autorisé de la famille corail hors §5, et n'est pas `var(--v2-coral)` (ce jeton n'existe que sous `.passio-ui-v2`) ; **`feedPostScore` ne connaît AUCUN mood** — à engagement plafonné c'est la fraîcheur seule qui classe, donc les trois séries de démonstration ROULENT les cinq envies **sous les 2 h** et tout recalage se revérifie à l'écran (un post recalé recale AUSSI ses commentaires) ; les nouvelles publications s'ajoutent EN FIN de `seedPosts` (trois suites prennent `state.seed.posts[0]`) ; **`renderFeed` complète sa peinture en différé depuis un INSTANTANÉ figé** — tout compteur volatil doit être relu sur l'objet canonique (`_feedCompteursFrais`), sinon un like annulé laisse un nombre faux au-delà de la 12ᵉ carte ; un test qui tient grâce à une case VIDE du socle tient par accident : poser la prémisse dans le fixture ; **l'engagement PLAFONNE dès ~20 j'aime** — dans les premières heures c'est lui qui classe, pas l'âge, donc une publication neuve (engagement nul) ne peut pas mener sans le terme borné `FEED_MA_PUBLI_BONUS` (« je viens de publier », 2 h), et toute surface qui DOIT être peinte (aperçu, carte de démonstration) ne peut pas s'en remettre au classement ; `post-passion-tag` ENROBE la mention de passion existante, il n'en ajoute pas une seconde (fiche 11 tient) et le `textContent` de `.post-author-meta` reste inchangé — deux suites l'assertent ; sa couleur est `--accent`, JAMAIS `passion.color` (le catalogue contient du #a78bfa, à 2,6:1 sur blanc) ; le bloc CSS se pose AVANT celui d'UI-4A5, qui reste le dernier.
- **« Gérer mes passions » : le rail redevient une commande de lecture (2026-09-03)** — le libellé passe au VERBE, la bulle « + » descend du rail du profil dans le panneau de gestion : **`docs/lots-ui/18-GERER-MES-PASSIONS-2026-09-03.md`**.
  ⚠️ Invariants : le rail (`#v9ProfilePassions`) et celui du Fil sont des commandes de **LECTURE** — aucune porte d'ACQUISITION n'y revient ; **ce n'est pas un retour en arrière sur le 2026-09-01** (la bulle reste sur le profil, elle descend du rail vers le panneau, et le raisonnement du 2026-09-02 sur le scrollport tombe avec elle) ; la porte garde l'id **`nouveauProfilLien`** (l'aide `second_profil` et cinq suites e2e le visent, et `montrerHint` refuse une cible absente EN SILENCE) et appelle **`openCreateProfile`** — la différence avec `ouvrirRecherchePassionsCompte` (retirée, sans appelant) n'est PAS le plafond, que les deux gardaient, mais le **repli** sous `flat_passions_v1="0"`, où l'autre rendait un tap MORT ; elle est du balisage **STATIQUE**, sœur de `#profileList` que `renderProfilesScreen` réécrit en entier, donc **hors** de `PassioFlatUI.actif()` ; **`renommerSection()` d'UI-6B a dû partir avec sa restitution** — son `lien.textContent =` aurait détruit les deux enfants de la bulle AU BOOT, porte toujours cliquable et défaut invisible aux tests d'existence ; l'ancre de repli de l'aide devient `#v6bModifier` → `.profile-dots-btn` → le rail en DERNIER ressort (aucune de ces portes n'est visible dans tous les états), et on teste `offsetParent`, **jamais l'existence** ; **aucun `onkeydown`** (app-08 active déjà tout `[role="button"]` non natif — un second écouteur = deux activations) et **aucune ligne de CSS** (`.psel-tile-plus` n'était ancrée à aucun rail : ne pas l'y ancrer) ; ⚠️ **CETTE CONTRAINTE DE CASSE EST TOMBÉE LE SOIR MÊME** — la fiche 19 titre la PAGE « Mes passions » et laisse à l'entrée du menu ⋯ son verbe « Gérer mes passions » : une commande nomme un geste, une page nomme un lieu ; les cinq surfaces homonymes hors profil (intention IRL, panneau Filtres, bouton `.fr-only`, carte de bienvenue, sélecteur) restent INTACTES. **Trois survivants trouvés en relecture croisée, tous verts aux gates** : ① le bouton « ➕ Ajouter une passion » du repli de fil vide (app-02) faisait `goTo('profiles')` — un CUL-DE-SAC depuis que la porte est repliée ; il passe par **`ouvrirGestionPassions`** (ex-`ouvrirGestionPassionsDepuisPaywall`, renommée car elle ne sert plus le seul paywall), et le test exige le RÉSULTAT, pas le handler ; ② la boucle **« mur → panneau → mur » est ROUVERTE** au plafond depuis que la porte vit DANS le panneau — `_paywallCacheGerer()` retire le bouton quand le panneau est déjà ouvert ET à l'écran (`offsetParent`, jamais `.hidden`), et le verrou mesure les DEUX sens (retiré depuis le panneau, PRÉSENT depuis le Fil) ; ③ **aucun test n'exerçait le câblage** — les douze cas qui touchent le panneau l'ouvrent par `page.evaluate(openPassionManager)`, donc supprimer l'entrée du menu ⋯ laissait la suite VERTE : `③ bis ter` ne fait que des GESTES, `③ bis quater` prouve la fratrie après deux `renderProfilesScreen()`, et `aides-contextuelles` gagne un jumeau sous `passio_ui_6b="0"` pour les crans de cascade jamais atteints. **Les rails sont CENTRÉS quand la rangée tient** (2026-09-03) : deux marges `auto` sur la première et la dernière bulle, bornées à `#v9ProfilePassions` (profil) **et `#profileStrip` (Fil, même soir : « aligne sur la largeur les bulles de passion sur le fil »)** — à 390 px, les 78 px de libre du profil s'entassaient tous à droite, et le Fil dans sa configuration de départ (**4 bulles : « Suivis » + les 3 passions offertes**, 298 px sur 390) faisait de même. Le profil VISITÉ (`#visitedPassions`) garde, lui, son alignement au début : la règle est ancrée à des IDENTIFIANTS, jamais à `.profile-strip` seule. Quand les passions payantes feront déborder la rangée, le centrage disparaît DE LUI-MÊME (marges auto = libre positif seulement) et le rail redevient coulissant depuis son vrai début. ⚠️ **JAMAIS `justify-content: center`** : il centre AUSSI la rangée qui déborde et sort ses premières bulles du scrollport pour de bon (mesuré à −320 px sur dix passions, `scrollLeft` ne descendant pas sous zéro) ; une marge `auto` ne distribue que du libre POSITIF, donc elle retombe à 0 au débordement. Ni `flex: 1 1 0` (défaut du 2026-09-02). ⚠️ Tout verrou qui mesure le rail du FIL doit POSER sa prémisse — vider `_activeFeedPassions` et fixer le nombre de passions : le rail complétait les passions possédées par les « envies » actives sans profil (`_interet_…`) — **chez un visiteur seulement depuis le 2026-09-18** (les passions du fil sont celles du compte) —, donc avec le socle il peignait cinq bulles, DÉBORDAIT, et serait collé au début de toute façon — vert sans rien distinguer. ⚠️ Mesurer en `offsetLeft`, pas en `getBoundingClientRect()` : `scale(0.95)` sur les bulles non cochées déplace le RECTANGLE sans déplacer la boîte de mise en page (37,8 / 40 pour une rangée pourtant symétrique). Verrous : `profil-entete-passions.spec.js` (26), `passions-plates.spec.js`, `feed-premier-rendu.spec.js`, `refonte-multi-passion.spec.js`, `aides-contextuelles.spec.js`.
- **« Mes passions » devient une PAGE DÉDIÉE, et aucune passion n'est principale (2026-09-03, le soir)** — maquette à l'appui : **`docs/lots-ui/19-PAGE-MES-PASSIONS-2026-09-03.md`**.
  ⚠️ **RÈGLE PRODUIT D'ABORD : il n'existe AUCUNE passion principale, favorite ou prioritaire.** Toutes les passions actives ont exactement la même importance ; la passion d'une publication se choisit AU STUDIO, au moment de publier (ADR-011 §3). La pastille « Passion du Studio ✓ » (`.v8-state`, `data-v8-active`) et le liseré d'élection (`.v8-passion-card.is-active`) sont RETIRÉS, code ET CSS — `currentProfileId` reste pourtant la source de vérité de l'identité d'écriture et `switchToProfile` son seul point d'écriture : le moteur n'a pas bougé, c'est l'écran qui cesse de le raconter comme un rang. **Retirer la pastille ne suffit pas, il faut retirer les MOTS partout** (menu ⋯, aide, titres) — le verrou ② balaie le texte ENTIER de la page contre `/principale|favorite|prioritaire|Passion du Studio/i`.
  ⚠️ Invariants de forme : `openPassionManager` pose **`passions-page-open`** sur `#screen-profiles` et une règle unique masque tous les frères de `#passionManager` (`> *:not(#passionManager)`, `!important` car le Studio porte des `style="display:…"` en ligne) — **MASQUER, JAMAIS RETIRER** : les rendus continuent d'écrire dans `#myPosts`, `#profileEvents` et le rail, et refermer les rend intacts sans re-rendu ; ne PAS lister les nœuds à masquer, UI-7 en déplace quatre et un futur lot en ajoutera. **Toute page plein écran doit avoir son entrée dans `closeCurrentOverlay`** (en DERNIER, elle n'est pas `position: fixed`) **et `goTo` doit la fermer AVANT la bascule d'écran** — sinon l'onglet « Profil » y ramène, et le geste de retour quitte le profil depuis une page dont on n'est jamais revenu (défaut des quatre grands panneaux, 2026-09-02) ; sans danger pour `ouvrirGestionPassions`, qui fait `goTo` PUIS `openPassionManager`.
  ⚠️ Le haut de page a **une seule source de vérité par nœud** et **aucun nombre en dur, tests compris** (`_rendrePagePassionsEntete`, app-06) : `#passionsResume` = `nbPassionsVivantes()`/`PASSIONS_OFFERTES`, `#profilesQuotaSub` = `changementsPassionRestants()`, `#nouveauProfilLien` = `plafondPassionsAtteint()`. **`Infinity` EST UN ÉTAT** (visiteur, démo, kill switch) : ni « sur N », ni alerte — annoncer une limite qui ne borne rien est un mensonge. **L'alerte « Aucun changement disponible pour le moment. » ne paraît QUE si le quota est réellement épuisé** (`data-passion-quota` = `epuise` | `disponible` | absent ; `role="status"`, jamais `alert`) : une alerte permanente n'alerte plus de rien. Fond d'alerte **OPAQUE**, jamais un `rgba` (le contrôle de contraste remonte au premier fond opaque et ignore l'alpha).
  ⚠️ **🔁 REVIREMENT DU 2026-09-04 — AU PLAFOND, LA PORTE REFUSE MAIS ELLE RÉPOND.** Elle avait été DÉSARMÉE (`aria-disabled`, `pointer-events: none`, `role` et `tabindex` retirés) au motif qu'une cible grisée qui répond promet un refus et fait quand même le geste. À l'usage elle ne faisait **aucun** geste et n'en promettait **aucun** : un compte à trois passions — donc un compte NORMAL — tapait et n'obtenait RIEN. Rapporté par Benjamin (« ajouter une passion / réactiver ne fonctionnent pas ») et **reproduit au navigateur** : à trois passions le clic échoue en `pointer-events: none`, à trois changements consommés « Réactiver » est `disabled` — **les DEUX gestes de la page morts en même temps**, exactement le symptôme. **Un refus qui ne se prononce pas est indiscernable d'une panne** ; la règle de la fiche 16 tranche et elle est plus ancienne : une porte fermée doit dire par où passer. La porte garde donc `role`, `tabindex`, le pointeur, **ne pose NI `disabled` NI `aria-disabled`** (les deux désarment — `aria-disabled` retire la commande aux lecteurs d'écran ET à Playwright, « element is not enabled »), reste peinte, porte le motif ET la sortie (« Limite de N atteinte — appuie pour voir comment en changer »), et mène à `openPassionPaywall()` comme TOUTES les autres portes d'acquisition, dont elle était la seule exception muette. **Le plafond n'est pas desserré** : il est gardé aux points d'ÉCRITURE (`ajouterPassionAuCompte`, `restaurerPassion`), jamais par l'inertie d'un bouton — un attribut d'affichage n'a jamais été une garde. La boucle « mur → panneau → mur » reste fermée par `_paywallCacheGerer()`. ⚠️ Et les trois suites (`mes-passions-page` ⑤, `profil-entete-passions`, `passions-plates` ㉒) **recliquent la porte** : réécrites en 2026-09-03 pour ne plus la cliquer, plus rien ne mesurait qu'un tap mène quelque part — **un verrou qui cesse d'exercer le geste cesse de protéger le geste**.
  ⚠️ Archives : titre **repliable** (`#passionArchiveToggle`/`#passionArchiveList`), ouvert par défaut, état du repli **en mémoire** (le conteneur est réécrit à chaque rendu) ; **`[hidden]` NE REPLIE RIEN sur un `display: flex`** — `.v8-switch-list` bat la règle d'agent utilisateur, d'où `#passionArchiveList[hidden] { display: none !important; }`, défaut invisible à tout test d'attribut. Un seul libellé, « **Réactiver** », **ni `disabled` ni `aria-disabled`** (2026-09-04, même revirement que la porte : un `<button disabled>` n'envoie pas son `onclick`, donc le tap ne produisait RIEN et le refus se lisait comme une panne) — l'état bloqué (`plafondPassionsAtteint() && quotaChangementsAtteint()`) passe par la classe `.est-bloquee`, le `title`, l'`aria-label` et le motif écrit UNE fois sous la liste ; le tap ouvre `openPassionPaywall({restaurer})`, qui dit pourquoi. **La garde n'a pas bougé** : elle est dans `restaurerPassion`, point d'écriture (deux bouts), et le verrou ⑩ bis l'appelle directement pour le prouver. **`openArchivedPassions` a été RETIRÉE** avec sa dernière porte, comme `.v8-state*`, `.v8-passion-card.is-active` et `.v8-passion-card .profile-card-bio` : cible supprimée = tout ce qui la vise part avec.
  ⚠️ Télémétrie : `_passionsPageTel` → `tel.action` (`passions_page_ouverte`, `passions_archives_repli`, `passions_aide_ouverte`) et `_passionsPageEchec` → `tel.error` + `diagLog` pour la Sentinelle. **Aucune clé de `meta` ne doit percuter `DENY_KEY`** — elle contient `pass`, `name`, `label`, `tel`, `bio`, `user`, et une clé filtrée disparaît EN SILENCE : `actives`, `plafond`, `restants`, `archivees`, `bloque`, `ouvert`, **jamais « passions »**. Le « … » d'une carte passe à 44 px (il était à **34**, mesuré, jamais supposé). Verrou : `tests/e2e/mes-passions-page.spec.js` (28).
  ⚠️ **MODE « PASSIONS ILLIMITÉES » (2026-09-04)** — `localStorage["passio_passions_illimitees_v1"]="1"` ou `window.PASSIO_PASSIONS_ILLIMITEES=true` ; porte sans console : **Paramètres → Démo → « Passions illimitées (test) »**. ⚠️ **RÉSERVÉ AU COMPTE DE L'ÉDITEUR DEPUIS LE 2026-09-18** : aucune des deux portes ne lève quoi que ce soit pour un autre compte, et celle des Paramètres est MASQUÉE — voir la section « ♾️ Passions illimitées ». **Ce n'est pas une coupure de lot, c'est une ADHÉSION** : toutes les autres bascules du dépôt ne savent qu'ENLEVER (seule « 0 » décide), celle-ci n'existe que si on l'ALLUME — le défaut du produit reste trois passions et trois changements. **Lue à UN SEUL endroit** : `plafondPassionsActif()` et `quotaChangementsActif()`, les deux interrupteurs dont tout le reste découle par lecture (`passionsRestantesOffertes`/`changementsPassionRestants` → `Infinity`, donc toutes les gardes s'ouvrent) — la poser à chaque porte aurait laissé la prochaine porte l'oublier, faute déjà commise par `quickCreateProfile` et le Studio. **L'écran cesse de lui-même d'annoncer les limites** (« sur N », alerte de quota, « Limite de N atteinte », motif de réactivation) parce que l'en-tête les conditionne déjà à `plafondPassionsActif()` et à un `changementsPassionRestants()` FINI. Le bouton des Paramètres **dit l'ÉTAT, pas le geste**, et est réécrit à chaque ouverture du panneau (`majBoutonPassionsIllimitees`, comme `majSectionCompte`) ; éteindre écrit « 0 », **n'efface pas la clé** (un `removeItem` laisserait un `window.PASSIO_*` posé entre-temps décider). Aucune RLS desserrée, rien en base que la console ne puisse déjà écrire. Verrou : `mes-passions-page.spec.js` ⑭ (4).
- **La page « Rechercher » (loupe) rattrape le référentiel plat (2026-09-03)** — recherche, grille, tendances et fiche de passion passaient toutes par les 19 entrées du socle embarqué : **`docs/lots-ui/20-PAGE-RECHERCHER-REFERENTIEL-2026-09-03.md`**.
  ⚠️ Invariants : le référentiel est la SEULE autorité de cette page, le socle son SEUL repli ; **le nombre affiché vient de `PassioPassions.taille()`, JAMAIS d'une constante** — et tant qu'il n'a pas répondu, `#explorePassionsCount` reste VIDE (se taire plutôt qu'inventer : c'est faute de l'avoir dit que « on est censé avoir 5 000 passions » a tenu sans démenti — il y en a 5 001 depuis la vague 3) ; `taille()` est un chemin de RENDU, `_etat()` non (tests et diagnostic seulement) ; **on n'affiche jamais 5 001 tuiles** (la grille est un aperçu par `suggestions()`, la RECHERCHE est le chemin vers le reste) ; l'invariant « 568 Ko jamais au démarrage » TIENT — le référentiel part à l'OUVERTURE de la page, jamais au boot, et il faut REPEINDRE à son arrivée sinon les deux sections gardent « ✨ Passion » ; les passions PERSO se rajoutent APRÈS le référentiel, qui ne les connaît pas, sinon elles deviennent introuvables depuis l'écran qui sert à les retrouver ; les créateurs d'une fiche se cherchent sur `passion_id` (colonne INDEXÉE), jamais sur un `contains` de la jsonb `passions` — sans index GIN c'est un balayage complet à chaque ouverture. **Trois défauts introduits par le lot, trouvés en relecture** : ① **le repeint appartient à `charger()`, pas à ses appelants** — `evaluerBesoinDeNoms` sort en tête sur `pret()`, donc dès qu'un AUTRE chargeur gagne la course (la page Rechercher ouverte pendant que l'hydratation traîne) les trois caches n'étaient plus jamais invalidés et les rails gardaient « ✨ Passion » pour toute la session ; ② **le repli hors ligne n'est pas un référentiel** — ses lignes sont à `popularity: 0`, `suggestions()` les filtre et n'en rend qu'une poignée NON VIDE, donc la grille tombait de 19 tuiles à deux et `taille()` annonçait le repli (« un aperçu parmi 21 passions ») : d'où `PassioPassions.horsLigne()`, second chemin de rendu ; ③ **`followBtn_<uid>` était émis par TROIS surfaces** (profil visité, `#suggestedCreators`, `#pexCreators`) et `getElementById` rend le premier du document — suivre depuis la modale retournait le bouton caché derrière, on retapait et on se désabonnait en silence : les boutons portent `data-follow-uid` et `toggleFollowUser` les retourne TOUS. ④ **la grille DÉBORDAIT de l'écran** — `.passion-grid` est en `repeat(3, 1fr)` et une piste `1fr` a un `min-width: auto` : avec les 19 libellés courts du socle rien ne dépassait, avec « Astrophotographie » la troisième colonne sortait (17 px à 390 px). ⚠️ **CHANGER LES DONNÉES D'UNE MISE EN PAGE, C'EST CHANGER LA MISE EN PAGE** : aucun des douze verrous ne pouvait le voir, ils comptaient des tuiles et lisaient des libellés, JAMAIS une largeur. `minmax(0, 1fr)` + `hyphens: auto` (document en `lang="fr"`). Au passage, un débordement ANTÉRIEUR à 320 px : l'`<input>` de recherche, élément flex à largeur intrinsèque de ~20 caractères, poussait « OK » hors de l'écran → `min-width: 0`. Verrou : `tests/e2e/recherche-referentiel.spec.js` (15), dont ⑩, ⑪, ⑫ et ⑬ éprouvés par RÉINJECTION du défaut.
- **Le fil montrait une passion que je n'ai pas — l'envie était une SOURCE (2026-09-09)** : **`docs/lots-ui/23-FIL-ENVIE-FILTRE-2026-09-09.md`**.
  Rapport d'essai réel : « elle a partagé un post dans musculation, il apparaît dans mon feed alors que je n'ai pas sélectionné la passion ». Mesuré en production le jour même : publication `passion_id = "fitness-musculation"` / `mood = "learn"`, lecteur avec « Suivis » **DÉCOCHÉ**, passions = randonnée + sport-santé, `feedIntents = ["learn"]`. **Aucune source ne l'amenait** — l'envie, promue TROISIÈME SOURCE par ADR-011 §1, filtrait `allPosts`, c'est-à-dire **tout PASSIO**.
  ⚠️ **DEUX SOURCES, PUIS UN FILTRE** : `auteur suivi OU passion cochée` décide de CE QUI ENTRE ; `envie cochée` décide de CE QUI RESTE. Une envie ne peut que RETRANCHER, jamais apporter ; entre elles les envies restent multi-sélectionnables (au moins une satisfaite). Une envie SEULE ne rend rien.
  ⚠️ **Le défaut n'était pas dans le prédicat, mais dans son POINT D'APPLICATION** (`feedPostMatchesIntent` est inchangé) : durcir le prédicat aurait effacé le symptôme sur « Apprendre » et laissé le défaut entier sur « Idées » et « Rencontrer ».
  ⚠️ **`nothingSelected` ne compte plus les envies** — n'avoir coché qu'une envie, c'est n'avoir désigné AUCUNE provenance : l'écran doit dire « Choisis tes passions ».
  ⚠️ **Le repli d'exploration (§7) rouvrait le défaut par la porte de l'état vide** : il peint SIX publications d'autres passions sous « Rien encore dans tes passions ». Désarmé quand c'est l'ENVIE qui a vidé (`_envieAVide`), au profit d'un message qui NOMME l'envie ; intact partout ailleurs (verrou ⑤ bis).
  ⚠️ **Cul-de-sac créé par le correctif, refermé avec lui** : `PassioFirstRun.filDecouverte()` sortait dès qu'une envie était cochée — juste tant qu'une envie prenait le relais comme source, mortel depuis qu'elle ne fait que filtrer (fil VIDE pour un visiteur qui n'a rien pu choisir).
  ⚠️ **`PASSIO_FEED_INTENT_LABELS` (app-02) est la SEULE table de libellés d'envie** : l'état vide les NOMME, et les mots sont aussi en dur dans `index.html` — le verrou ⑦ compare la table aux boutons RENDUS. Verrou : `tests/e2e/feed-envie-filtre.spec.js` (12), dont ① et ① bis éprouvés par RÉINJECTION ; `feed-intents.spec.js` et `refonte-multi-passion.spec.js` ④ EXIGEAIENT le comportement retiré et ont été réécrits.
- **La page « Filtre » de Rencontrer (2026-09-04)** — maquette validée : quatre sections nommées, un bouton violet fixe, et « Filtre » au SINGULIER : **`docs/lots-ui/20-PAGE-FILTRE-RENCONTRER-2026-09-04.md`**.
  ⚠️ Même lot, même drapeau (`passio_ui_4a5="0"`), même bloc CSS — qui reste le **DERNIER** de `styles.css`. La vue s'organise en **Quand ? · Où ? · Quelles passions ? · Horaire**, puis une ligne discrète « Mes événements | Mes rencontres » (`data-irlfilter` `mine`/`joined`), puis le pied fixe.
  ⚠️ Invariants : **aucun moteur n'est écrit dans le module** — bulles (`#irlPassionRow`) et calendrier (`#irlPaneDate`) sont DÉPLACÉS, le nombre du pied est celui que `_syncIrlFiltersFooter` publie (`window._irlResultCount`), un second comptage divergerait ; **le pied vit dans `.app-shell`**, en absolu, jamais dans `.app-main` (il défilerait) ni en `position: fixed` (il sortirait de la colonne de 440 px), et sa distance au bas est `calc(62px + env(safe-area-inset-bottom))` — la valeur EXACTE de `.app-nav`, sans quoi il glisse sous la barre d'accueil d'un iPhone ; il **réserve 128 px** de `padding-bottom` sur `.app-main`, sinon la dernière ligne du panneau passe dessous. **Les cases sont en FLEX, jamais en colonnes égales** (mesuré : à 390 px, « Cette semaine » fait 100,4 px pour 101 px disponibles, et la coche en ajoute 13 — cocher cassait son propre libellé) ; seule la distance garde quatre parts égales. **Jamais d'ellipse** sur un libellé de case. **Le violet plein ne vaut que pour l'état COCHÉ** : au repos le lavis du 2026-09-01 tient, et l'état ne repose jamais sur la seule couleur (`aria-pressed` + coche). **Aucun numéro sur les passions** et aucun pictogramme à côté d'un titre de section — masqués, jamais retirés. « **Ce week-end** » est une valeur NEUVE (`weekend`) : sans son prédicat dans `_filterIrlEvents` la case se cocherait sans rien filtrer, et **un dimanche le week-end est celui qui finit ce soir**. Les raccourcis n'ont **aucun écouteur propre** — la délégation `[data-irlfilter]` d'app-07 existe déjà, un second basculerait deux fois. Les **quatre intentions** (Tous · Cette semaine · Ma ville · Mes passions) ne sont plus rendues dans cette vue : leurs trois actions y sont devenues des commandes nommées ; UI-4A0/4A1 n'est pas touché et le kill switch les rend. Verrou : `tests/e2e/ui-v4a5-filtres.spec.js` (25).
- **`.passio/adr/ADR-011-refonte-multi-passion.md` — la refonte du 2026-08-31** : fil additif (OU inclusif), profil à deux onglets, identité centralisée, Studio seul point de choix, retrait du Carnet de voyage. Elle complète ADR-010 et en amende l'interface.
- `docs/PASSIONS_REFERENTIEL_PLAT_2026-09-01.md` — le référentiel PLAT (2026-09-01) : modèle, données, recherche, migration, RLS, pièges.
- **`docs/CDN_MEDIAS.md` — les médias passent par `/media/*` (Edge Function Netlify, 2026-09-11).** Supabase répond `no-cache` sur ses objets publics et le forfait gratuit ne donne que 5 Go de sortie par mois : `netlify/edge-functions/media.js` impose un cache d'un an au bord de Netlify (100 Go/mois). `cdnUrl()` réécrit l'URL à l'upload, `passioThumb()` demande la miniature au CDN, `_cheminsMediaPost()` reconnaît les DEUX formes d'URL — sans quoi un média publié via le CDN resterait orphelin à la suppression. Kill switch : `PASSIO_CDN_BASE = ""` (app-08). ⚠️ Un nouveau point d'upload DOIT passer par `cdnUrl()`, et le motif `MOTIF_MEDIAS_DISTANTS` des tests intercepte aussi `/media/…`. Verrou : `tests/e2e/cdn-medias.spec.js`.

- **Première visite** : `js/first-run.js` (`first_run_experience_v1`, **actif par défaut** depuis le 2026-09-01 ; coupure `"0"` ou `window.PASSIO_FIRST_RUN_V1=false`), tests `tests/e2e/first-run.spec.js`, captures `docs/captures/first-run/`.
- `docs/PIEGES_CONNUS.md` — les 59 fiches détaillées (extrait de ce fichier le 2026-08-07, recompté le 2026-08-29).
- `docs/HISTORIQUE_PROJET.md` — état 2026-06-11, backlog terminé, logs d’optimisation.
- `docs/ARCHITECTURE.md`, `docs/CONTROLE_16_MISSIONS.md`, `docs/CHECKLIST_COMMERCIALISATION.md`.
- Skills projet : `/ship`, `/migration`, `/e2e-multi`. Subagents : `audit-passio`, `migration-checker`.

