# ADR-012 — Un seul canal de lecture de la base, un seul canal d'écriture, et rien d'autre

- **Statut** : Accepté
- **Date** : 2026-09-03
- **Vérifié le** : 2026-09-03 (voir « Vérification » en fin de document)
- **Complète** : [ADR-003](ADR-003-supabase-rls-trust-boundary.md) (les RLS restent l'unique frontière de sûreté ; cet ADR ne parle que du *chemin d'accès*, jamais des droits).

## Contexte

Le dépôt prescrit aujourd'hui **deux canaux d'accès à la base qui ne se
recouvrent pas**, et un troisième — le seul qui marche réellement en
automatisation — n'est documenté nulle part comme tel.

**Canal 1 — `supabase db query --linked`.** C'est le geste écrit **partout** :
29 fichiers, dont 24 skills et subagents (`schema`, `migration`, `rls-audit`,
`prod-errors`, `diag`, `kpi`, `retention`, `moderation`, `storage`, `perf`,
`pilot-report`, `migration-checker`, `growth-analyst`, `pilotage-debug`,
`passio-red-team`…). Or **la CLI Supabase n'est installée nulle part** : absente
du `PATH`, absente de `package.json`, et `supabase/` ne contient que des Edge
Functions — pas de `config.toml`, donc aucun projet lié. Ces 24 fichiers
prescrivent une commande qui n'a jamais pu s'exécuter dans un environnement
automatisé.

**Canal 2 — `.mcp.json`.** Ajouté le 2026-08-29, il déclare un serveur MCP HTTP
en lecture seule (`supabase-passio-readonly`). Il n'est mentionné dans **aucun**
document du projet. Déclaré en portée *projet*, son trafic sort par le réseau de
la session — donc il tombe sous la politique de sortie de l'environnement, où
`mcp.supabase.com` n'est pas autorisé par défaut. Et son OAuth ne peut pas
s'exécuter dans une session non interactive. Doublement inopérant.

**Canal 3 — PostgREST direct, non documenté comme canal.** C'est celui qui
fonctionne : des appels HTTPS authentifiés par `SUPABASE_SERVICE_ROLE_KEY`,
centralisés par `configAdmin()` dans `tests/e2e/compte-e2e.js`, et consommés par
`scripts/mesure-passions.js`, `scripts/sauvegarde-donnees.js`,
`scripts/purge-e2e-rest.js`, `scripts/purge-e2e-storage.js`. Il n'est pas né
d'un choix : il est né d'un **incident**. Le 2026-09-01, la CLI absente en CI
faisait échouer la purge des comptes e2e *par un simple avertissement* — que le
teardown Playwright ignore par conception. Les comptes de test se sont
accumulés, le post semé est sorti des vingt premières cartes du fil, `main` est
passé au rouge, et le déploiement production a été sauté sans que rien ne
désigne la cause.

Deux autres incidents disent la même chose : `supabase db dump` exigeait Docker
et, Docker absent, laissait un fichier de **0 octet** — un échec silencieux sur
une *sauvegarde* (2026-08-16, d'où `scripts/schema-baseline.js`). Et
`docs/RECUPERATION.md` constate que la restauration n'a jamais été exécutée de
bout en bout : « il n'existe sur cette machine ni Docker, ni psql, ni base
cible ». « On a une sauvegarde » y veut dire « on a des fichiers », pas « on
sait revenir ».

La question n'est donc pas *« comment débloquer l'accès »*. C'est : **quel canal
est officiel ?** Tant qu'elle n'est pas tranchée, réparer un canal n'en répare
aucun autre — rétablir le MCP ne rend pas une seule des 24 prescriptions
exécutable.

## Décision

**Trois canaux, trois usages disjoints, aucun autre.**

**① LECTURE interactive → le connecteur claude.ai.** Le serveur MCP hébergé de
Supabase est enregistré comme **connecteur claude.ai**, pas comme serveur de
portée projet. Raison décisive : le trafic d'un connecteur passe par les
serveurs d'Anthropic et **échappe à la politique de sortie de la session**, là
où un serveur déclaré dans `.mcp.json` y est soumis. C'est le seul montage qui
fonctionne à la fois en session locale et en session distante.

L'URL est enregistrée **avec ses paramètres**, jamais nue :

```
https://mcp.supabase.com/mcp?project_ref=njkiyoklssvefstljemx&read_only=true&features=database,debugging,docs
```

**② ÉCRITURE de données (purges, mesures, sauvegardes) → PostgREST via
`configAdmin()`.** Le chemin né de l'incident du 2026-09-01 devient le canal
officiel des scripts. Point d'entrée unique : `configAdmin()`
(`tests/e2e/compte-e2e.js`). Le secret reste un secret GitHub porté par la
**seule** étape qui s'en sert.

**③ ÉCRITURE de structure (DDL, migrations) → `psql` depuis un poste, ou le SQL
Editor du tableau de bord.** Les chemins A et B de
`docs/APPLIQUER_MIGRATION_PASSIONS.md`. Inchangé.

**Et ce qui est retiré :** `supabase db query --linked` cesse d'être prescrit.
Les 24 skills et subagents qui l'écrivent doivent pointer le canal ① pour la
lecture, ou déclarer explicitement qu'ils exigent un poste local.

## Conséquences

**Ce que ça donne.** Un canal de lecture qui marche depuis n'importe quelle
session, y compris distante. Un canal d'écriture de données déjà éprouvé en CI.
Une frontière nette : **la lecture est en `read_only=true`**, donc aucun agent
ne peut muter la production par le canal de lecture, quelle que soit la
permission du poste.

**Ce que ça interdit désormais.**

- **Jamais l'URL MCP nue.** Sans `read_only=true` ni `project_ref`, on obtient un
  MCP **en écriture, à l'échelle du compte**, branché sur la production. C'est
  l'incident du 2026-08-16 rejoué — aggravé par le fait qu'un appel d'outil MCP
  n'est **pas** une commande Bash : `garde-commandes.js`, seul garde-fou qui voit
  le *milieu* d'une requête, ne le verrait pas passer.
- **Jamais de jeton d'accès personnel Supabase en en-tête** dans `.mcp.json` : ce
  fichier est **versionné**, un PAT est de portée **compte**, et ce serait le
  secret en clair dans l'historique git — la répétition exacte de l'incident
  `.claude/settings.local.json`.
- **Jamais `SUPABASE_SERVICE_ROLE_KEY` en variable d'environnement d'un
  environnement cloud** : ce serait donner à toute session et toute routine
  future un contournement complet des RLS, et défaire le cloisonnement par étape
  posé après l'audit de la PR #222.
- **Jamais de contournement réseau** : ni socket TCP brute vers un hôte refusé,
  ni désactivation de la vérification TLS, ni `unset HTTPS_PROXY`, ni tunnel. Un
  refus de politique se **rapporte**, il ne se rejoue pas.

**Le coût, dit franchement.** Le canal ① est en **lecture seule** : il ne couvre
ni les migrations, ni les purges, ni la restauration. Il ne remplace donc pas le
③, et prétendre le contraire rouvrirait le chemin C de
`docs/APPLIQUER_MIGRATION_PASSIONS.md` — délibérément refusé, parce qu'il
donnerait à la CI le pouvoir d'écrire la structure de la production.

**Substitut hors ligne, à privilégier même quand un canal est ouvert.** Pour
« quelles colonnes existent vraiment ? », `migrations/SCHEMA_PROD_REFERENCE.sql`
est la photographie de la structure **réelle** de la production, faite
exactement pour répondre sans réseau. Ne jamais répondre depuis les
`migrations/*.sql` seuls : le dépôt n'est pas la source de vérité.

## Alternatives écartées

**Réparer le canal 1 (installer et lier la CLI Supabase).** Écarté : il faudrait
l'installer et la lier dans *chaque* environnement — poste, CI, sessions
distantes — et elle exige de joindre l'API Supabase, refusée par la politique de
sortie. Trois incidents (2026-08-16 ×2, 2026-09-01) montrent que ses échecs sont
**silencieux** : un avertissement ignoré, un dump de 0 octet.

**Garder `.mcp.json` en portée projet.** Écarté : son trafic sort par le réseau
de la session, donc il exige en plus d'ouvrir la liste d'hôtes de *chaque*
environnement — alors qu'il n'existe **aucune** liste d'autorisation au niveau
organisation qu'un administrateur pourrait pousser. Le connecteur n'a pas ce
défaut. ⚠️ Un serveur déclaré dans Claude Code **prend le pas** sur un connecteur
pointant la même URL : `.mcp.json` ne se retire qu'**après** avoir vu le
connecteur vert, jamais avant.

**Un secret `SUPABASE_DB_URL` en CI (chemin C).** Reste refusé, pour la raison
déjà écrite dans `docs/APPLIQUER_MIGRATION_PASSIONS.md`.

## Vérification (2026-09-03)

Le connecteur a été enregistré et le canal ① mesuré depuis une session distante,
c'est-à-dire dans les conditions mêmes où le montage précédent échouait :

- **Le formulaire accepte l'URL à paramètres.** C'était l'unique inconnue.
  `claude.ai/customize/connectors` → *Ajouter un connecteur personnalisé* a
  conservé `project_ref`, `read_only` et `features` à l'enregistrement.
- **Le bridage est réel, pas déclaratif** : `SHOW transaction_read_only` rend
  **`on`**. C'est Postgres qui refuse l'écriture, pas l'interface qui la
  décourage. Corollaire mesuré : `apply_migration` **n'est pas exposé**, bien que
  les instructions du serveur le mentionnent — `read_only=true` l'a retiré.
- **Le cadrage projet tient** : 7 outils, correspondant exactement à
  `features=database,debugging,docs`, et aucun outil de niveau compte.
- **Le trafic échappe bien à la politique de sortie** : `mcp.supabase.com` reste
  refusé en 403 au CONNECT depuis cette session, et le connecteur fonctionne
  malgré tout. C'est la propriété qui fonde le choix ① et qu'un serveur de portée
  projet n'a pas.
- **Recoupement** : la table `passions` porte 1 908 lignes, identique à
  l'empreinte du référentiel local (`npm run verif`, `0bd8e78e33dfd1cc`). Les 39
  tables ont toutes leurs RLS activées.

Premier usage du canal, le jour même : `get_advisors` rend **0 ERROR, 18 WARN**
— aucune table sans RLS, mais quatre fonctions `SECURITY DEFINER`
(`post_is_visible`, `comment_target_visible`, `can_edit_post`, `is_conv_member`)
sont appelables par le rôle `anon` via `/rest/v1/rpc/…`. Ce sont des aides
internes aux policies : exposées sans authentification, elles répondent oui/non
à des questions d'appartenance et de visibilité. À traiter par le canal ③.

## Trigger de réexamen

Rouvrent la décision : la disparition du serveur MCP hébergé de Supabase,
l'apparition d'une allowlist au niveau organisation, ou un besoin d'écriture
depuis une session distante — qui devrait alors être arbitré, pas improvisé.

⚠️ Rouvre également la décision **toute perte des paramètres d'URL du
connecteur** : le jour où `read_only=true` ou `project_ref` disparaîtrait de son
enregistrement, le canal ① cesserait d'être un canal de lecture et deviendrait un
accès en écriture à l'échelle du compte, sans que rien ne le signale. Le
contrôle qui le détecte tient en une requête : `SHOW transaction_read_only` doit
rendre `on`.

Rouvrent également la décision : la disparition du serveur MCP hébergé de
Supabase, l'apparition d'une allowlist au niveau organisation, ou un besoin
d'écriture depuis une session distante — qui devrait alors être arbitré, pas
improvisé.
