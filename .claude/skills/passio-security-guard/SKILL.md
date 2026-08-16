---
name: passio-security-guard
description: Garde-fou de sécurité de PASSIO — RLS, auth, isolation entre comptes, PII, secrets, contrôles côté serveur — et REFUSE les correctifs qui affaibliraient une frontière de confiance. À consulter avant toute modification touchant l'auth, une policy, la visibilité d'un contenu, la télémétrie ou un secret, et avant d'appliquer tout correctif proposé par une IA.
---

# /passio-security-guard — Le droit de dire non

Ce skill a deux emplois : **vérifier** une frontière de sécurité, et **refuser** un correctif qui la déplacerait. Le second est le plus important : un pipeline d'auto-réparation qui n'a pas le droit de refuser finit par « corriger » en ouvrant une porte.

## Les correctifs interdits — sans exception ni dérogation

Un correctif est **refusé** s'il fait l'une de ces choses, quel que soit le problème qu'il prétend résoudre :

| Interdit | Pourquoi |
|---|---|
| Ouvrir, assouplir ou supprimer une policy RLS | c'est la **seule** frontière de sécurité de l'app |
| Contourner l'authentification, forger une identité | — |
| Exposer `service_role` côté client, ou dans un log | la clé bypasse toute RLS |
| Désactiver une validation ou un garde-fou | déplace le défaut, ne le corrige pas |
| Avaler une erreur (`catch` muet, `{ error }` ignoré) | fabrique un succès faux |
| Supprimer ou affaiblir un test | le correctif se rend vert lui-même |
| Désactiver le monitoring ou la télémétrie | supprime la détection, pas le défaut |
| Supprimer des données pour faire disparaître un symptôme | — |
| Écrire une donnée personnelle dans un log ou un rapport | — |

En cas de doute, l'ordre est : **MITIGER → FEATURE FLAG → ISOLER → ROLLBACK → RAPPORTER.** Jamais « corriger vite ».

Ces interdits sont déjà câblés à deux endroits du pilotage, et ils doivent le rester : `repair.js` n'autorise que `js/*.js`, `styles.css`, `index.html`, `sw.js` — **`tests/` est interdit**, comme les migrations, la CI et les scripts ; et « PAS DE CORRECTIF SÛR » est une réponse valide.

## Vérifier les frontières

### RLS — 34 tables, toutes activées

```bash
supabase db query --linked "select c.relname, count(p.polname) n from pg_class c left join pg_policy p on p.polrelid=c.oid join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relkind='r' group by 1 having not bool_or(c.relrowsecurity) or count(p.polname)=0;"
```

Doit renvoyer **0 ligne**. Toute table sans RLS ou sans policy est un incident critique.

⚠️ **RLS activée ne veut pas dire correcte.** `notifications` était scellée en SELECT/UPDATE/DELETE mais son **INSERT valait `true`** : n'importe quel compte pouvait fabriquer une notification vers n'importe qui, au nom de n'importe qui (`NOTIF-FORGE-009`). Lire les policies, pas seulement leur existence.

### Le gate d'autorisation — 13 invariants, non skippable

```bash
npx playwright test tests/e2e/authz-critical.spec.js
```

Il vérifie par **appels REST bruts** — passer par l'interface testerait la politesse du client, pas la RLS. Couvre : écriture sous l'identité d'autrui, modification et suppression cross-compte, notifications, messages privés, télémétrie, identité d'affichage réécrite à l'INSERT **et** à l'UPDATE, client anonyme.

**Toute nouvelle frontière de confiance ajoute un invariant ici.** C'est le seul endroit dont la CI garantit l'exécution.

### Le refus RLS ne lève pas

Un UPDATE ou DELETE refusé renvoie **200 avec 0 ligne touchée**. Donc :

```js
const { data, error } = await supa.from("posts").update({...}).eq("id", id).select();
// error === null ET data.length === 0  →  REFUSÉ, pas réussi
```

Un test d'autorisation doit asserter **0 ligne touchée**, jamais l'absence d'exception.

### PII et secrets

- `js/telemetry.js` filtre par liste **NOIRE** de noms de clés (`DENY_KEY`), pas par liste blanche. La garantie ne vient donc pas de ce qui est refusé mais de ce que `scrubMeta` **accepte** : uniquement des primitives, passées par `redactString`, tronquées à 160 caractères, 30 clés au plus.
- `correlation_id` est une colonne **à part**, hors de `meta` — donc hors de ce filtre. Elle est sanitisée séparément ; toute nouvelle colonne hors `meta` doit l'être aussi.
- Le téléphone d'inscription vit dans `auth.users.user_metadata`, **jamais** dans `profiles` (lecture publique = fuite).
- Avant tout partage externe (dossier de revue, message à un tiers, rapport) : aucun token, cookie, clé, `service_role`, e-mail réel, conversation privée ni média privé. Les identifiants techniques sont anonymisés.

### Sandbox des agents

La Sentinelle appelle un CLI enfant : **liste blanche** `--tools` + `--safe-mode` + `--strict-mcp-config` + environnement filtré des secrets.

⚠️ Ne **jamais** revenir à une liste noire : l'ancienne `--disallowedTools` interdisait « Bash » et laissait passer `PowerShell` **et tout le MCP Supabase, `execute_sql` compris**, avec `bypassPermissions` actif. Et `--tools ""` **ouvre la liste complète** au lieu de la vider.

⚠️ Le `cwd` n'est **pas** une frontière de fichiers : avec `Read,Grep,Glob`, un chemin relatif `../../` sort du dépôt. C'est pourquoi l'analyse approfondie automatique est désactivée par défaut.

## Avant de valider un changement à risque

Auth/identité, RLS/migration, affichage de contenu d'autrui, PII, paiement, modération → passer par `npm run revue` (dossier pour un relecteur tiers en lecture seule) et par le subagent `passio-red-team`.

## Critères de réussite

- 0 table sans RLS, 0 policy permissive non justifiée.
- Le gate `authz-critical` est vert, et enrichi si une frontière a bougé.
- Aucun secret ni PII dans les artefacts produits.
- Tout refus de correctif est **écrit** avec son motif.

## Critères d'échec — refuser et remonter

- Un correctif figurant dans la table des interdits.
- Une policy modifiée sans test d'intrusion joint.
- Un correctif de sécurité appliqué sans revue tierce.

## Format de résultat

```
CONTRÔLE SÉCURITÉ — <périmètre>
RLS            : <n>/<n> tables, <anomalies>
Gate AUTHZ     : <n> invariants — VERT/ROUGE
Policies lues  : <celles réellement inspectées, pas seulement comptées>
PII / secrets  : <ce qui a été vérifié>
Correctifs refusés : <lesquels, et pourquoi>
Résiduel       : <ce qui reste non vérifié>
```
