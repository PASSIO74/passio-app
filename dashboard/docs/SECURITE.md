# Sécurité & confidentialité — Centre de pilotage Passio

## 1. Secrets

- La clé **`service_role`** de Supabase ne vit QUE dans `.env` côté backend. Elle
  n'est jamais envoyée au navigateur, jamais journalisée. Le frontend ne parle
  qu'au backend (REST + SSE), jamais directement à Supabase.
- `.env` est dans `.gitignore`. Ne jamais le committer.
- `DASH_SESSION_SECRET` doit être une chaîne aléatoire longue :
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

## 2. Authentification & sessions

- Sessions **signées HMAC-SHA256** (pas de dépendance JWT), stockées dans un
  cookie `httpOnly`, `SameSite=Lax`, `Secure` en production. Expiration configurable.
- Comparaison des mots de passe en **temps constant** (`crypto.timingSafeEqual`).
- **Limitation des tentatives** : 8 échecs / IP → blocage 5 min.
- Toute connexion (succès/échec/blocage) est **auditée**.

## 3. Autorisation (matrice de permissions)

| Capacité | admin | developer | tester | observer |
|---|:-:|:-:|:-:|:-:|
| Vue / lecture | ✓ | ✓ | ✓ | ✓ |
| Sessions de test, checklist | ✓ | ✓ | ✓ | |
| Lancer des tests | ✓ | ✓ | | |
| Git (lecture) | ✓ | ✓ | | |
| Git (mutations) | ✓ | | | |
| Claude Code | ✓ | ✓ | | |
| Feature flags | ✓ | ✓ | | |
| Base de données | ✓ | ✓ | | |
| Comptes de test | ✓ | ✓ | | |
| Journal d'audit / Paramètres | ✓ | | | |

Chaque route sensible est protégée par `requireCap(...)`. Un refus est audité.

**Ce que les tests vérifient, et à quel niveau** (ajouté le 2026-08-30) :

- `test/routes-caps.test.js` fige la garde **déclarée** des 81 routes, dans les
  deux sens — une garde qui change rougit, une route ajoutée sans garde déclarée
  aussi. Il lit la SOURCE : `server/index.js` appelle `app.listen` au chargement
  et n'est donc pas importable.
- `test/http-routes.test.js` vérifie la garde **appliquée**, sur un vrai serveur :
  quatre comptes de rôles différents, chaque route interrogée sans session
  (401 exigé) puis avec un rôle dépourvu de la capacité (403 exigé). C'est ce
  qui attrape un middleware neutralisé en amont, qu'une lecture de code ne voit
  pas. Seul le sens du REFUS est testé : appeler les routes de mutation
  lancerait des suites, créerait des branches, supprimerait des comptes.
- Invariant **général** figé au passage : toute route dont le corps appelle
  `reconcile` doit exiger la capacité `db` ou la vérifier elle-même.
  `/api/diagnose` n'en était qu'un cas — c'est par là que l'intégrité avait
  fuité une fois.

## 3 bis. Injection dans la page de pilotage (corrigé le 2026-08-30)

Le dashboard affiche du texte écrit par les navigateurs des utilisateurs de
PASSIO — messages d'erreur, noms d'écrans, plateformes, gravités, identifiants
d'appareil — dans une session qui porte les capacités les plus fortes du
produit. **Une injection ici ne vise pas un visiteur : elle vise le poste de
pilotage.**

Le défaut : 17 boutons écrits `onclick='fn(${JSON.stringify(x)})'`.
`JSON.stringify` échappe le guillemet double, **jamais l'apostrophe** — or c'est
une apostrophe qui délimite l'attribut. Mesuré avec `x'); alert(…); //` : le
navigateur referme l'attribut au milieu et relit le reste comme des attributs
HTML. Les valeurs concernées étaient les plus hostiles du produit (message et
stack d'un bug, l'événement de télémétrie sérialisé en entier, identifiants
d'appareil et de lien). S'y ajoutaient huit champs de télémétrie affichés bruts,
dont trois dans des **attributs de classe**, et les libellés de `charts.js`.

Les trois règles à tenir, verrouillées par `test/spa-echappement.test.js` et
prouvées dans un navigateur réel par `test/navigateur.test.js` :

1. **`escJsArg` pour toute donnée dans un `onclick`.** Le navigateur DÉCODE
   l'attribut avant de parser le JS : `&#39;` y redevient une apostrophe, légale
   à l'intérieur du littéral à guillemets doubles produit par `JSON.stringify`.
   Le « & » s'échappe AVANT l'apostrophe, sans quoi une charge déjà encodée se
   décoderait en apostrophe vive. C'est l'`escapeJsArg` de l'app PASSIO.
2. **`esc` pour tout champ de télémétrie affiché**, y compris — surtout — dans
   un attribut de classe, où un seul guillemet suffit.
3. **L'échappement se pose à la SOURCE du helper** (`bars()` dans `charts.js`),
   pas chez ses appelants : un appelant qui oublie ne peut pas rouvrir le trou.

`command.js` échappe à cette famille par construction : il bâtit ses nœuds avec
`createElement`/`textContent` et n'utilise aucun `innerHTML`. Un test fige ce
choix.

## 4. Modifications de code (Git)

Processus imposé : détection → contexte → analyse → **diff** → **validation
humaine explicite** → branche dédiée → application → tests → vérification →
promotion éventuelle (manuelle).

Garde-fous techniques :

- **Désactivées en production** (`DASH_ENV=production` force `allowMutations=false`).
- Un patch n'est **jamais** appliqué sur `main`/`master`/`prod` : une branche
  dédiée est créée d'abord. Validation `git apply --check` avant application.
- **Aucun `git push`** n'est jamais effectué par le dashboard.
- Confirmation explicite (`confirm:true`) requise côté API et case à cocher côté UI.
- Chaque création de branche / application de patch / revert est **auditée**.

## 4 bis. Sentinelle (débogage automatique)

La sentinelle (`server/sentinel.js`) lance Claude **toute seule**, sans geste
humain. C'est la seule partie du dashboard qui agisse sans déclencheur humain :
elle est donc bornée sur quatre axes.

- **Sandbox fail-closed du processus Claude.** C'est LE point, et il a été
  corrigé le 2026-08-16 après vérification par un appel réel au CLI. Le code
  d'origine se reposait sur `--disallowedTools`, une **liste noire d'outils
  intégrés** ; en interrogeant le processus enfant sur ses outils réels, il
  disposait de **`PowerShell`** (la liste interdisait « Bash », or l'outil shell
  s'appelle PowerShell sous Windows) et de **tout le MCP Supabase du projet**,
  `execute_sql` et `apply_migration` compris — avec `defaultMode:
  bypassPermissions` dans `.claude/settings.json`, donc auto-approuvés. Une liste
  noire ne peut pas être exhaustive : les outils MCP ne sont pas des intégrés, et
  un nom d'outil peut changer de plateforme en plateforme. Profil actuel, verrouillé
  par test (`buildCliArgs`) : `--tools` en **liste blanche** (`Read,Grep,Glob` en
  approfondi, un seul outil inerte en rapide), `--safe-mode` (CLAUDE.md, skills,
  plugins, hooks, agents désactivés), `--strict-mcp-config` sans `--mcp-config`
  (**aucun** serveur MCP), `--no-session-persistence`, `--no-chrome`. Vérifié par
  appel réel : le mode rapide ne peut pas lire un fichier, le mode approfondi ne
  peut pas exécuter de commande.
  ⚠️ `--tools ""` est documenté « aucun outil » mais rend en fait la liste
  complète, Bash/Edit/Write inclus. Une liste blanche vide ou invalide **ouvre**
  au lieu de fermer.
- **Le dossier de travail n'est PAS une frontière de fichiers.** Mesuré : avec
  `--tools Read,Grep,Glob` et `cwd` = dépôt, un chemin absolu hors dépôt est
  refusé, mais `../../AppData/…` est lu sans obstacle ; les règles de permission
  passées par `--settings` n'ont pas rétabli la frontière (en `-p`, un mode non
  permissif refuse tout, dépôt inclus). Conséquence assumée : **les analyses
  automatiques n'ont aucun accès disque par défaut** (`DASH_SENTINEL_DEEP`
  désactivé). L'extrait de code fourni au modèle est lu par le **serveur**, dont
  le confinement, lui, est vérifiable (`readSnippet`). L'analyse approfondie
  reste disponible pour un humain qui la déclenche et lit le résultat.
- **Sortie bornée.** Une consigne hostile peut réclamer une réponse gigantesque :
  la sortie du CLI est coupée à 400 Ko (processus interrompu) et le diagnostic
  persisté à 60 Ko. Les diagnostics vivent dans un fichier unique, indexés par un
  identifiant **généré côté serveur** — aucune donnée observée n'entre dans un
  chemin de fichier.
- **Environnement du processus enfant filtré.** `spawn` hérite de `process.env` :
  les clés du dashboard (`SUPABASE_SERVICE_ROLE_KEY`, secret de session, mot de
  passe admin…) en sont retirées nommément avant le lancement.
- **Aucune écriture.** Aucun patch appliqué, aucune branche créée, aucun push —
  la sentinelle produit une cause et un correctif *proposé*. Appliquer reste le
  processus §4, avec validation humaine.
- **Injection de prompt.** Un message d'erreur vient du navigateur d'un
  utilisateur : c'est une donnée hostile. Tout texte observé passe par
  `sanitizeObserved` (clôtures de bloc cassées, faux tours de parole neutralisés,
  caractères de contrôle retirés, 600 caractères max) et est encadré d'un bloc
  « DONNÉES OBSERVÉES » qui interdit explicitement de le suivre. Surtout : le
  **mode approfondi** — celui où Claude lit le dépôt — n'est ouvert qu'aux
  alertes dont le contexte est *calculé côté serveur* (trace, bug groupé). Une
  alerte bâtie sur du texte libre client n'obtient jamais l'accès aux fichiers.
- **Budget.** Une panne produit des rafales. Déduplication par cause **et
  révision du dépôt** (cooldown 6 h, persisté — la révision évite qu'une
  régression apparue après un commit reste muette 6 h), une analyse à la fois,
  plafond horaire (8 par défaut) avec sous-plafond des analyses approfondies
  (3/h, au-delà la sentinelle dégrade en analyse rapide plutôt que de renoncer),
  file bornée, espacement minimal de 90 s. Au démarrage, l'arriéré d'alertes
  n'est jamais rejoué. Sous Windows, un dépassement de délai tue l'**arbre** de
  processus (`taskkill /T`), sinon un `claude` orphelin survit et consomme le quota.
- **Diffusion.** `/api/sentinel*` exige la capacité `claude` : un diagnostic
  contient des chemins et des extraits de code du dépôt, ce n'est pas de la
  supervision ordinaire. `tester` et `observer` n'y ont pas accès. Chaque
  diagnostic et chaque bascule du moteur sont **audités**.

## 5. Exécution de tests

- **Liste blanche stricte** (`server/tests.js`) : seules les suites déclarées sont
  exécutables. Pas de console système, pas de commande arbitraire.
- Une seule exécution à la fois ; sortie streamée ; arrêt possible.

## 6. Confidentialité / RGPD

- **Opt-in** : la télémétrie est inactive tant que l'utilisateur n'ouvre pas Passio
  avec `?telemetry=1` (ou en localhost).
- **Minimisation** : `js/telemetry.js` n'envoie que des métadonnées. `meta` est sur
  **liste blanche**, les clés sensibles (`pass|token|secret|key|auth|email|code|
  content|message|vocal|base64|…`) sont **supprimées** ; e-mails / JWT / hex longs
  sont **rédigés** (`[email]`, `[jwt]`, `[hex]`) ; les `data:` URI sont retirés.
- **Aucun contenu de message privé** n'est collecté : la messagerie n'expose que des
  métadonnées (type, présence de pièce jointe, statut).
- **Anonymisation possible** : `user_id` peut être omis ; seul un pseudo public
  (jamais l'e-mail) est utilisé comme libellé.
- **RLS** : `telemetry_events` n'a **aucune policy SELECT** → un client ne peut pas
  relire la télémétrie ; INSERT limité à `user_id = auth.uid()`.
- **Rétention** : `purge_telemetry(keep_days)` (défaut 30 j), planifiable via pg_cron.
- **Consultations administratives auditées** : les actions du dashboard sont tracées.
- La suppression de compte Passio (Edge Function `delete-account`) purge déjà les
  données utilisateur ; ajouter `telemetry_events WHERE user_id = ...` si l'on veut
  purger aussi la télémétrie d'un compte supprimé.

## 7. Surface réseau

- Le backend écoute en local (usage laptop pendant les tests). Pour une exposition
  distante : placer derrière un reverse-proxy TLS, garder `DASH_ENV=production`
  (mutations off), et restreindre l'accès (VPN / IP allowlist).
- SSE + REST portent le cookie de session `same-origin`. Les mutations passent par
  POST/PATCH authentifiés.
