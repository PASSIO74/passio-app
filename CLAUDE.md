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
- **Cible supprimée = tout ce qui la vise doit partir avec.** Après TOUT retrait (nœud, classe, écran, onglet, fonctionnalité), chercher : les accès non gardés dans une fonction rappelée en permanence (`renderTopbar` écrivait dans `#topPassia`, `closeModal` levait à chaque fermeture après le retrait CDV), les règles CSS sans émetteur, et les décisions prises sur un **TITRE** plutôt que sur un identifiant (renommer « Outils » en « Filtres » a fait disparaître une section entière, en silence).
- **Après un retrait de balisage, compter les balises structurelles** contre la version d'avant, ou passer le fichier à `html.parser` : le nombre d'erreurs doit être **IDENTIQUE, pas nul** (index.html en porte une, préexistante). Supprimer `#screen-wallet` avait avalé le `</main>` voisin — cinq tests de cadrage au rouge, sans la moindre erreur JS.
- **Catch large** : un `catch(e){return [];}` masque les ReferenceError (bug diagLog = fil vide 6 j). Ne pas envelopper un chemin critique sans log.
- **onclick inline** : doit référencer une fonction globale EXISTANTE (`npm run audit:handlers`).
- **Supabase** : jamais de requête dans `onAuthStateChange` (deadlock → `setTimeout(...,0)`) ; jamais le global `supabase` (SDK) au top-level d’un app-*.js (chargement paresseux → `supa`/`ensureSupabase()`) ; un UPDATE/DELETE qui touche 0 ligne = RLS manquante ; jamais de base64 en DB (→ Storage) ; embed `profiles(...)` = 400 sans FK réelle.
- **Accès à la base : TROIS canaux disjoints (ADR-012, 2026-09-03), et `supabase db query --linked` est RETIRÉ** (la CLI n'est installée nulle part — c'est son échec silencieux qui a causé l'incident du 2026-09-01). ① **Lire** : outil `execute_sql` du connecteur claude.ai `supabase-passio-readonly`, en **lecture seule** (`transaction_read_only = on`) ; préférer `list_tables`/`list_migrations`/`get_advisors` quand ils répondent. ② **Écrire des données** (purges, mesures) : PostgREST via `configAdmin()` — `npm run purge:e2e:rest`. ③ **Écrire de la structure** (DDL) : `psql` ou le SQL Editor, jamais depuis la CI. ⚠️ Un `SET LOCAL role` et son `SELECT` doivent partir dans le **même** appel `execute_sql` (chaque appel est sa propre transaction) — séparés, le rôle retombe au défaut **sans erreur** et l'audit RLS rend un faux vert. Hors ligne : `migrations/SCHEMA_PROD_REFERENCE.sql`, jamais les `migrations/*.sql` seuls. Détail et interdits : `.passio/adr/ADR-012-canal-acces-base-de-donnees.md`.
- **Écritures qui échouent en silence** : le SDK ne LÈVE PAS sur un refus RLS → **toujours lire `{ error }`** (sinon l’action reste « réussie » à l’écran et disparaît au rechargement). Une écriture d’état (like, RSVP, follow…) envoie l’**INTENTION locale** ; ne jamais la re-déduire d’une lecture préalable (elle inverse l’action dès que local et base divergent — et le hook fetch prend alors cette LECTURE pour la confirmation d’écriture). Échec réel = annuler l’affichage optimiste.
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

## 🔑 MOT DE PASSE : 8 CARACTÈRES, ET LES REFUS DU SERVEUR EN FRANÇAIS (2026-09-13)

Le minimum serveur (Supabase → Authentication → Sign In / Providers → **Email** → « Minimum password length ») passe de 6 à **8**,
avec « Password requirements » = lettres et chiffres. **`MOT_DE_PASSE_MIN` (app-02) est la SEULE source du nombre côté client** —
inscription (`onbDoAuth`), changement depuis les Paramètres (`#cpNew`), récupération par lien (`#pwdRecoveryInput`) : trois portes,
un seul nombre, et le `minlength` de chaque champ le suit (verrou ①). Le serveur tranche ; le client refuse plus tôt, en français.
⚠️ **Les refus du serveur partaient en anglais** (« Password should be at least… », « Password is known to be weak and easy to
guess… » — EM-6 du go/no-go, mesuré deux fois le 2026-09-11) : `traduireRefusMotDePasse(m)` (app-02) est la SEULE table, appelée
sur les DEUX chemins (inscription ET changement), et rend le message INTACT s'il n'est pas un refus de mot de passe (verrou ⑤).
⚠️ **Ordre de bascule** : ce client d'abord (il refuse à 8 quoi que dise le serveur), le réglage serveur ensuite — l'inverse
aurait affiché l'erreur anglaise à tout inscrit entre 6 et 7 caractères. ⚠️ **« Secure password change » reste OFF** : le
changement depuis les Paramètres (l.~3692) appelle `updateUser({ password })` sans `reauthenticate()` — l'allumer casserait
le changement pour toute session de plus de 24 h (`reauthentication_needed`, non traduit). Lot à part. « Require current
password when updating » exige `current_password` dans `updateUser` (SDK ≥ 2.102, le vendored 2.116 le porte) : même lot.
`LICENSE` (racine) dit « Tous droits réservés » — il ne bloque ni la lecture ni le fork d'un dépôt PUBLIC (CGU GitHub D.5) ;
seul le passage en privé le fait. Verrou : `tests/e2e/mot-de-passe-minimum.spec.js` (7, dont ①/②/④ éprouvés par RÉINJECTION à 6).
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
⚠️ **CE QUI RESTE OUVERT DANS LA MÊME FAMILLE** : les mêmes sessions produisent aussi
`POST /rest/v1/profiles` → 401 (97 refus / 96 sessions / 0 compte sur 14 jours,
`supaEnsureProfileExists` via `supaInit`) — même cause, autre table, hors du périmètre de ce correctif.

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
⚠️ **LA SENTINELLE NE POUVAIT PAS TROUVER ÇA, ET C'EST DÉLIBÉRÉ** : `estDuBruitApi` écarte tout `http_status = 0` (« ça parle de la connexion de l'appareil, pas de notre code »). Le filtre reste juste sur le fond, mais il a un angle mort à nommer — **il classe un signal sur sa CAUSE, jamais sur sa CONSÉQUENCE**, et la conséquence était ici que personne ne réessayait. C'est la **cinquième** façon dont le canal manque un vrai défaut, et la seule qui soit volontaire.
⚠️ **TROIS DÉFAUTS INTRODUITS PAR LE LOT, TROUVÉS EN RELECTURE, dont deux rendaient le remède PIRE QUE LE MAL** : ① le rejeu **RÉTRÉCISSAIT** la liste blanche des passions (`vus` recréé à chaque appel, publié tel quel sur échec — un rejeu qui casse plus tôt que le premier essai remplaçait 3 000 identifiants par 1 000, et l'invariant « le référentiel serveur AJOUTE, il ne retranche pas » ne tenait QUE par le cache à un seul coup que ce lot venait de lever) → `vus` est amorcé sur l'existant ; ② `chargerReferentielPassions` ne rendait **rien**, donc le pilote comptait l'essai et désarmait la minuterie AVANT le verdict → elle rend une promesse résolue à CHAQUE sortie ; ③ un `catch (_e) {}` **nu** dans le pilote, après désinscription de l'entrée et consommation de l'essai → moteur éteint en silence, registre vide « indiscernable de tout va bien ». Plus : **TTL de 120 s** sur une entrée (un rejeu des heures plus tard réappliquerait un blob serveur par-dessus une session vivante — `_applyUserState` ne protège pas `userPosts`), `Promise.race` de 20 s et péremption de 60 s sur `_referentielEnCours` (un `fetch` qui ne se règle JAMAIS gelait tout le pilote), réarmement AVANT les sorties « masquée / hors ligne », et `estEchecReseau` qui n'accepte qu'un code de type **CHAÎNE** (`DOMException` porte un `code` NUMÉRIQUE hérité — tester sa présence écartait de vraies pannes).
⚠️ **`npm run audit:globals` NE VOYAIT NI `let` NI `const`** — les 11 déclarations de ce lot étaient hors filet, alors que leur mode d'échec est PIRE qu'une `function` (redéclaration = `SyntaxError` qui **tue le script entier**, pas un écrasement silencieux). La gate couvre désormais les deux : 1 430 → **1 595** déclarations scannées, aucune collision préexistante.
Verrou : `tests/e2e/reprise-lectures-boot.spec.js` (13), dont ②, ⑨ et ⑪ éprouvés par RÉINJECTION, ⑫ qui mesure le CÂBLAGE à la source et ⑬ le non-rétrécissement. ⚠️ Le cas ⑪ exige `?telemetry=1` (opt-in strict en local, sinon les hooks ne sont pas installés et le banc mesure le vide) ; le faux client se pose en **MUTANT `window.supa.from`**, jamais en remplaçant le binding (`supa` est un `let` de portée script : `window.supa = x` crée une propriété séparée). Détail, mesures et points ouverts : `docs/REPRISE_LECTURES_RESEAU.md`.

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
  ⚠️ Invariants : le rail (`#v9ProfilePassions`) et celui du Fil sont des commandes de **LECTURE** — aucune porte d'ACQUISITION n'y revient ; **ce n'est pas un retour en arrière sur le 2026-09-01** (la bulle reste sur le profil, elle descend du rail vers le panneau, et le raisonnement du 2026-09-02 sur le scrollport tombe avec elle) ; la porte garde l'id **`nouveauProfilLien`** (l'aide `second_profil` et cinq suites e2e le visent, et `montrerHint` refuse une cible absente EN SILENCE) et appelle **`openCreateProfile`** — la différence avec `ouvrirRecherchePassionsCompte` (retirée, sans appelant) n'est PAS le plafond, que les deux gardaient, mais le **repli** sous `flat_passions_v1="0"`, où l'autre rendait un tap MORT ; elle est du balisage **STATIQUE**, sœur de `#profileList` que `renderProfilesScreen` réécrit en entier, donc **hors** de `PassioFlatUI.actif()` ; **`renommerSection()` d'UI-6B a dû partir avec sa restitution** — son `lien.textContent =` aurait détruit les deux enfants de la bulle AU BOOT, porte toujours cliquable et défaut invisible aux tests d'existence ; l'ancre de repli de l'aide devient `#v6bModifier` → `.profile-dots-btn` → le rail en DERNIER ressort (aucune de ces portes n'est visible dans tous les états), et on teste `offsetParent`, **jamais l'existence** ; **aucun `onkeydown`** (app-08 active déjà tout `[role="button"]` non natif — un second écouteur = deux activations) et **aucune ligne de CSS** (`.psel-tile-plus` n'était ancrée à aucun rail : ne pas l'y ancrer) ; ⚠️ **CETTE CONTRAINTE DE CASSE EST TOMBÉE LE SOIR MÊME** — la fiche 19 titre la PAGE « Mes passions » et laisse à l'entrée du menu ⋯ son verbe « Gérer mes passions » : une commande nomme un geste, une page nomme un lieu ; les cinq surfaces homonymes hors profil (intention IRL, panneau Filtres, bouton `.fr-only`, carte de bienvenue, sélecteur) restent INTACTES. **Trois survivants trouvés en relecture croisée, tous verts aux gates** : ① le bouton « ➕ Ajouter une passion » du repli de fil vide (app-02) faisait `goTo('profiles')` — un CUL-DE-SAC depuis que la porte est repliée ; il passe par **`ouvrirGestionPassions`** (ex-`ouvrirGestionPassionsDepuisPaywall`, renommée car elle ne sert plus le seul paywall), et le test exige le RÉSULTAT, pas le handler ; ② la boucle **« mur → panneau → mur » est ROUVERTE** au plafond depuis que la porte vit DANS le panneau — `_paywallCacheGerer()` retire le bouton quand le panneau est déjà ouvert ET à l'écran (`offsetParent`, jamais `.hidden`), et le verrou mesure les DEUX sens (retiré depuis le panneau, PRÉSENT depuis le Fil) ; ③ **aucun test n'exerçait le câblage** — les douze cas qui touchent le panneau l'ouvrent par `page.evaluate(openPassionManager)`, donc supprimer l'entrée du menu ⋯ laissait la suite VERTE : `③ bis ter` ne fait que des GESTES, `③ bis quater` prouve la fratrie après deux `renderProfilesScreen()`, et `aides-contextuelles` gagne un jumeau sous `passio_ui_6b="0"` pour les crans de cascade jamais atteints. **Les rails sont CENTRÉS quand la rangée tient** (2026-09-03) : deux marges `auto` sur la première et la dernière bulle, bornées à `#v9ProfilePassions` (profil) **et `#profileStrip` (Fil, même soir : « aligne sur la largeur les bulles de passion sur le fil »)** — à 390 px, les 78 px de libre du profil s'entassaient tous à droite, et le Fil dans sa configuration de départ (**4 bulles : « Suivis » + les 3 passions offertes**, 298 px sur 390) faisait de même. Le profil VISITÉ (`#visitedPassions`) garde, lui, son alignement au début : la règle est ancrée à des IDENTIFIANTS, jamais à `.profile-strip` seule. Quand les passions payantes feront déborder la rangée, le centrage disparaît DE LUI-MÊME (marges auto = libre positif seulement) et le rail redevient coulissant depuis son vrai début. ⚠️ **JAMAIS `justify-content: center`** : il centre AUSSI la rangée qui déborde et sort ses premières bulles du scrollport pour de bon (mesuré à −320 px sur dix passions, `scrollLeft` ne descendant pas sous zéro) ; une marge `auto` ne distribue que du libre POSITIF, donc elle retombe à 0 au débordement. Ni `flex: 1 1 0` (défaut du 2026-09-02). ⚠️ Tout verrou qui mesure le rail du FIL doit POSER sa prémisse — vider `_activeFeedPassions` et fixer le nombre de passions : le rail complète les passions possédées par les « envies » actives sans profil (`_interet_…`), donc avec le socle il peint cinq bulles, DÉBORDE, et serait collé au début de toute façon — vert sans rien distinguer. ⚠️ Mesurer en `offsetLeft`, pas en `getBoundingClientRect()` : `scale(0.95)` sur les bulles non cochées déplace le RECTANGLE sans déplacer la boîte de mise en page (37,8 / 40 pour une rangée pourtant symétrique). Verrous : `profil-entete-passions.spec.js` (26), `passions-plates.spec.js`, `feed-premier-rendu.spec.js`, `refonte-multi-passion.spec.js`, `aides-contextuelles.spec.js`.
- **« Mes passions » devient une PAGE DÉDIÉE, et aucune passion n'est principale (2026-09-03, le soir)** — maquette à l'appui : **`docs/lots-ui/19-PAGE-MES-PASSIONS-2026-09-03.md`**.
  ⚠️ **RÈGLE PRODUIT D'ABORD : il n'existe AUCUNE passion principale, favorite ou prioritaire.** Toutes les passions actives ont exactement la même importance ; la passion d'une publication se choisit AU STUDIO, au moment de publier (ADR-011 §3). La pastille « Passion du Studio ✓ » (`.v8-state`, `data-v8-active`) et le liseré d'élection (`.v8-passion-card.is-active`) sont RETIRÉS, code ET CSS — `currentProfileId` reste pourtant la source de vérité de l'identité d'écriture et `switchToProfile` son seul point d'écriture : le moteur n'a pas bougé, c'est l'écran qui cesse de le raconter comme un rang. **Retirer la pastille ne suffit pas, il faut retirer les MOTS partout** (menu ⋯, aide, titres) — le verrou ② balaie le texte ENTIER de la page contre `/principale|favorite|prioritaire|Passion du Studio/i`.
  ⚠️ Invariants de forme : `openPassionManager` pose **`passions-page-open`** sur `#screen-profiles` et une règle unique masque tous les frères de `#passionManager` (`> *:not(#passionManager)`, `!important` car le Studio porte des `style="display:…"` en ligne) — **MASQUER, JAMAIS RETIRER** : les rendus continuent d'écrire dans `#myPosts`, `#profileEvents` et le rail, et refermer les rend intacts sans re-rendu ; ne PAS lister les nœuds à masquer, UI-7 en déplace quatre et un futur lot en ajoutera. **Toute page plein écran doit avoir son entrée dans `closeCurrentOverlay`** (en DERNIER, elle n'est pas `position: fixed`) **et `goTo` doit la fermer AVANT la bascule d'écran** — sinon l'onglet « Profil » y ramène, et le geste de retour quitte le profil depuis une page dont on n'est jamais revenu (défaut des quatre grands panneaux, 2026-09-02) ; sans danger pour `ouvrirGestionPassions`, qui fait `goTo` PUIS `openPassionManager`.
  ⚠️ Le haut de page a **une seule source de vérité par nœud** et **aucun nombre en dur, tests compris** (`_rendrePagePassionsEntete`, app-06) : `#passionsResume` = `nbPassionsVivantes()`/`PASSIONS_OFFERTES`, `#profilesQuotaSub` = `changementsPassionRestants()`, `#nouveauProfilLien` = `plafondPassionsAtteint()`. **`Infinity` EST UN ÉTAT** (visiteur, démo, kill switch) : ni « sur N », ni alerte — annoncer une limite qui ne borne rien est un mensonge. **L'alerte « Aucun changement disponible pour le moment. » ne paraît QUE si le quota est réellement épuisé** (`data-passion-quota` = `epuise` | `disponible` | absent ; `role="status"`, jamais `alert`) : une alerte permanente n'alerte plus de rien. Fond d'alerte **OPAQUE**, jamais un `rgba` (le contrôle de contraste remonte au premier fond opaque et ignore l'alpha).
  ⚠️ **🔁 REVIREMENT DU 2026-09-04 — AU PLAFOND, LA PORTE REFUSE MAIS ELLE RÉPOND.** Elle avait été DÉSARMÉE (`aria-disabled`, `pointer-events: none`, `role` et `tabindex` retirés) au motif qu'une cible grisée qui répond promet un refus et fait quand même le geste. À l'usage elle ne faisait **aucun** geste et n'en promettait **aucun** : un compte à trois passions — donc un compte NORMAL — tapait et n'obtenait RIEN. Rapporté par Benjamin (« ajouter une passion / réactiver ne fonctionnent pas ») et **reproduit au navigateur** : à trois passions le clic échoue en `pointer-events: none`, à trois changements consommés « Réactiver » est `disabled` — **les DEUX gestes de la page morts en même temps**, exactement le symptôme. **Un refus qui ne se prononce pas est indiscernable d'une panne** ; la règle de la fiche 16 tranche et elle est plus ancienne : une porte fermée doit dire par où passer. La porte garde donc `role`, `tabindex`, le pointeur, **ne pose NI `disabled` NI `aria-disabled`** (les deux désarment — `aria-disabled` retire la commande aux lecteurs d'écran ET à Playwright, « element is not enabled »), reste peinte, porte le motif ET la sortie (« Limite de N atteinte — appuie pour voir comment en changer »), et mène à `openPassionPaywall()` comme TOUTES les autres portes d'acquisition, dont elle était la seule exception muette. **Le plafond n'est pas desserré** : il est gardé aux points d'ÉCRITURE (`ajouterPassionAuCompte`, `restaurerPassion`), jamais par l'inertie d'un bouton — un attribut d'affichage n'a jamais été une garde. La boucle « mur → panneau → mur » reste fermée par `_paywallCacheGerer()`. ⚠️ Et les trois suites (`mes-passions-page` ⑤, `profil-entete-passions`, `passions-plates` ㉒) **recliquent la porte** : réécrites en 2026-09-03 pour ne plus la cliquer, plus rien ne mesurait qu'un tap mène quelque part — **un verrou qui cesse d'exercer le geste cesse de protéger le geste**.
  ⚠️ Archives : titre **repliable** (`#passionArchiveToggle`/`#passionArchiveList`), ouvert par défaut, état du repli **en mémoire** (le conteneur est réécrit à chaque rendu) ; **`[hidden]` NE REPLIE RIEN sur un `display: flex`** — `.v8-switch-list` bat la règle d'agent utilisateur, d'où `#passionArchiveList[hidden] { display: none !important; }`, défaut invisible à tout test d'attribut. Un seul libellé, « **Réactiver** », **ni `disabled` ni `aria-disabled`** (2026-09-04, même revirement que la porte : un `<button disabled>` n'envoie pas son `onclick`, donc le tap ne produisait RIEN et le refus se lisait comme une panne) — l'état bloqué (`plafondPassionsAtteint() && quotaChangementsAtteint()`) passe par la classe `.est-bloquee`, le `title`, l'`aria-label` et le motif écrit UNE fois sous la liste ; le tap ouvre `openPassionPaywall({restaurer})`, qui dit pourquoi. **La garde n'a pas bougé** : elle est dans `restaurerPassion`, point d'écriture (deux bouts), et le verrou ⑩ bis l'appelle directement pour le prouver. **`openArchivedPassions` a été RETIRÉE** avec sa dernière porte, comme `.v8-state*`, `.v8-passion-card.is-active` et `.v8-passion-card .profile-card-bio` : cible supprimée = tout ce qui la vise part avec.
  ⚠️ Télémétrie : `_passionsPageTel` → `tel.action` (`passions_page_ouverte`, `passions_archives_repli`, `passions_aide_ouverte`) et `_passionsPageEchec` → `tel.error` + `diagLog` pour la Sentinelle. **Aucune clé de `meta` ne doit percuter `DENY_KEY`** — elle contient `pass`, `name`, `label`, `tel`, `bio`, `user`, et une clé filtrée disparaît EN SILENCE : `actives`, `plafond`, `restants`, `archivees`, `bloque`, `ouvert`, **jamais « passions »**. Le « … » d'une carte passe à 44 px (il était à **34**, mesuré, jamais supposé). Verrou : `tests/e2e/mes-passions-page.spec.js` (28).
  ⚠️ **MODE « PASSIONS ILLIMITÉES » (2026-09-04)** — `localStorage["passio_passions_illimitees_v1"]="1"` ou `window.PASSIO_PASSIONS_ILLIMITEES=true` ; porte sans console : **Paramètres → Démo → « Passions illimitées (test) »**. **Ce n'est pas une coupure de lot, c'est une ADHÉSION** : toutes les autres bascules du dépôt ne savent qu'ENLEVER (seule « 0 » décide), celle-ci n'existe que si on l'ALLUME — le défaut du produit reste trois passions et trois changements. **Lue à UN SEUL endroit** : `plafondPassionsActif()` et `quotaChangementsActif()`, les deux interrupteurs dont tout le reste découle par lecture (`passionsRestantesOffertes`/`changementsPassionRestants` → `Infinity`, donc toutes les gardes s'ouvrent) — la poser à chaque porte aurait laissé la prochaine porte l'oublier, faute déjà commise par `quickCreateProfile` et le Studio. **L'écran cesse de lui-même d'annoncer les limites** (« sur N », alerte de quota, « Limite de N atteinte », motif de réactivation) parce que l'en-tête les conditionne déjà à `plafondPassionsActif()` et à un `changementsPassionRestants()` FINI. Le bouton des Paramètres **dit l'ÉTAT, pas le geste**, et est réécrit à chaque ouverture du panneau (`majBoutonPassionsIllimitees`, comme `majSectionCompte`) ; éteindre écrit « 0 », **n'efface pas la clé** (un `removeItem` laisserait un `window.PASSIO_*` posé entre-temps décider). Aucune RLS desserrée, rien en base que la console ne puisse déjà écrire. Verrou : `mes-passions-page.spec.js` ⑭ (4).
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

