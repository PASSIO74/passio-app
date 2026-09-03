# Vérifier les frontières de confiance

## RLS — 34 tables, toutes activées

```bash
supabase db query --linked "select c.relname, count(p.polname) n from pg_class c left join pg_policy p on p.polrelid=c.oid join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relkind='r' group by 1 having not bool_or(c.relrowsecurity) or count(p.polname)=0;"
```

Doit renvoyer **0 ligne**. Toute table sans RLS ou sans policy est un incident critique.

⚠️ **RLS activée ne veut pas dire correcte.** `notifications` était scellée en SELECT/UPDATE/DELETE mais son **INSERT valait `true`** : n'importe quel compte pouvait fabriquer une notification vers n'importe qui, au nom de n'importe qui (`NOTIF-FORGE-009`). Lire les policies, pas seulement leur existence.

## Le gate d'autorisation — 13 invariants, non skippable

```bash
npx playwright test tests/e2e/authz-critical.spec.js
```

Il vérifie par **appels REST bruts** — passer par l'interface testerait la politesse du client, pas la RLS. Couvre : écriture sous l'identité d'autrui, modification et suppression cross-compte, notifications, messages privés, télémétrie, identité d'affichage réécrite à l'INSERT **et** à l'UPDATE, client anonyme.

**Toute nouvelle frontière de confiance ajoute un invariant ici.** C'est le seul endroit dont la CI garantit l'exécution.

## Le refus RLS ne lève pas

Un UPDATE ou DELETE refusé renvoie **200 avec 0 ligne touchée**. Donc :

```js
const { data, error } = await supa.from("posts").update({...}).eq("id", id).select();
// error === null ET data.length === 0  →  REFUSÉ, pas réussi
```

Un test d'autorisation doit asserter **0 ligne touchée**, jamais l'absence d'exception.

## PII et secrets

- `js/telemetry.js` filtre par liste **NOIRE** de noms de clés (`DENY_KEY`), pas par liste blanche. La garantie ne vient donc pas de ce qui est refusé mais de ce que `scrubMeta` **accepte** : uniquement des primitives, passées par `redactString`, tronquées à 160 caractères, 30 clés au plus.
- `correlation_id` est une colonne **à part**, hors de `meta` — donc hors de ce filtre. Elle est sanitisée séparément ; toute nouvelle colonne hors `meta` doit l'être aussi.
- Le téléphone d'inscription vit dans `auth.users.user_metadata`, **jamais** dans `profiles` (lecture publique = fuite).
- Avant tout partage externe (dossier de revue, message à un tiers, rapport) : aucun token, cookie, clé, `service_role`, e-mail réel, conversation privée ni média privé. Les identifiants techniques sont anonymisés.

## Sandbox des agents

La Sentinelle appelle un CLI enfant : **liste blanche** `--tools` + `--safe-mode` + `--strict-mcp-config` + environnement filtré des secrets.

⚠️ Ne **jamais** revenir à une liste noire : l'ancienne `--disallowedTools` interdisait « Bash » et laissait passer `PowerShell` **et tout le MCP Supabase, `execute_sql` compris**, avec `bypassPermissions` actif. Et `--tools ""` **ouvre la liste complète** au lieu de la vider.

⚠️ Le `cwd` n'est **pas** une frontière de fichiers : avec `Read,Grep,Glob`, un chemin relatif `../../` sort du dépôt. C'est pourquoi l'analyse approfondie automatique est désactivée par défaut.

## Format de résultat d'un contrôle

```
CONTRÔLE SÉCURITÉ — <périmètre>
RLS            : <n>/<n> tables, <anomalies>
Gate AUTHZ     : <n> invariants — VERT/ROUGE
Policies lues  : <celles réellement inspectées, pas seulement comptées>
PII / secrets  : <ce qui a été vérifié>
Correctifs refusés : <lesquels, et pourquoi>
Résiduel       : <ce qui reste non vérifié>
```
