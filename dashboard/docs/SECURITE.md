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

- **Lecture seule, sans exception.** L'analyse passe par `runClaudeCli`, lancé
  sans `Edit`/`Write`/`Bash`. Aucun patch appliqué, aucune branche créée, aucun
  push — la sentinelle produit une cause et un correctif *proposé*. Appliquer
  reste le processus §4, avec validation humaine.
- **Injection de prompt.** Un message d'erreur vient du navigateur d'un
  utilisateur : c'est une donnée hostile. Tout texte observé passe par
  `sanitizeObserved` (clôtures de bloc cassées, faux tours de parole neutralisés,
  caractères de contrôle retirés, 600 caractères max) et est encadré d'un bloc
  « DONNÉES OBSERVÉES » qui interdit explicitement de le suivre. Surtout : le
  **mode approfondi** — celui où Claude lit le dépôt — n'est ouvert qu'aux
  alertes dont le contexte est *calculé côté serveur* (trace, bug groupé). Une
  alerte bâtie sur du texte libre client n'obtient jamais l'accès aux fichiers.
- **Budget.** Une panne produit des rafales. Déduplication par clé d'alerte
  (cooldown 6 h, persisté), une analyse à la fois, plafond horaire (8 par
  défaut), file bornée, espacement minimal de 90 s. Au démarrage, l'arriéré
  d'alertes n'est jamais rejoué.
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
