# Passio Bridge MCP

Passio Bridge fait de ChatGPT le poste de pilotage de PASSIO sans exposer un shell arbitraire.
Il expose un petit serveur MCP local en **stdio**. Le serveur delegue l'analyse et l'execution a
Claude Code dans le vrai depot, et conserve le protocole de revue croisee Codex deja present
(`npm run revue` + `scripts/chatgpt.js`) pour les changements critiques.

## Architecture

```text
Benjamin
   |
ChatGPT
   |
Secure MCP Tunnel
   |
Passio Bridge (stdio, local)
   |
Claude Code
   |\
   | npm run revue / scripts/chatgpt.js
   |          |
   |        Codex
   |
worktree + branche dedies
```

## Mode de securite actuel (0.2.0)

Le Bridge **ne doit pas encore lancer Claude depuis le compte Windows principal**. Tant que
`PASSIO_BRIDGE_ISOLATED=1` n'est pas present, seul `passio_status` fonctionne. Les trois outils
qui lancent Claude (`passio_analyze`, `passio_implement`, `passio_continue`) echouent ferme.

Ce blocage est volontaire : un agent Claude lance depuis un tunnel distant peut lire des fichiers
hors du depot et executer des commandes. Un simple prompt "ne touche pas a la prod" n'est pas une
frontiere de securite.

`PASSIO_BRIDGE_ISOLATED=1` est reserve a un **worker dedie** (compte Windows separe ou VM) qui :

- ne contient aucune cle `SUPABASE_SERVICE_ROLE_KEY`, `.env` personnel ou secret utilisateur ;
- n'est pas lie a la production Supabase ;
- ne dispose que du depot/worktree PASSIO necessaire ;
- utilise des credentials GitHub limites au depot et au push de branches non protegees ;
- contient Claude Code + Codex authentifies pour ce worker uniquement.

Ne pas poser ce flag sur le compte Windows principal juste pour faire passer le diagnostic.

## Outils MCP exposes

- `passio_status` — etat Git, taches Bridge et etat d'isolation. Toujours disponible, lecture seule.
- `passio_analyze` — analyse du depot par Claude Code en mode plan. **Bloque sans worker isole.**
- `passio_implement` — cree un worktree + branche, fait executer la mission par Claude Code,
  teste, committe le perimetre et pousse uniquement sa branche. **Bloque sans worker isole.**
- `passio_continue` — reprend une tache Bridge et la session Claude correspondante. **Bloque sans worker isole.**

`passio_implement` accepte `risk=normal|critical`. En `critical`, Claude recoit l'instruction
obligatoire de passer par la revue croisee existante et de verifier chaque objection Codex sur
le depot reel avant de conclure.

## Garde-fous techniques

Le Bridge n'expose aucun outil shell generique et ne fusionne jamais `main`.

Pour les processus Claude lances par le Bridge :

- l'environnement enfant est construit par **liste blanche** ; `process.env` n'est plus transmis en bloc ;
- aucune cle Supabase/OpenAI/GitHub applicative n'est explicitement transmise ;
- `bypassPermissions` n'est plus utilise ; les implementations utilisent `acceptEdits` ;
- `WebFetch` et `WebSearch` sont desactives sur les implementations pour reduire les chemins
  d'exfiltration en cas d'injection de prompt ;
- les modifications partent dans un worktree et une branche `bridge/...` dedies ;
- les hooks/regles PASSIO restent applicables dans le worker ;
- aucun merge automatique, force-push ou deploiement n'est demande par le Bridge.

Ces protections ne remplacent **pas** l'isolation OS : un agent capable d'executer des commandes
reste puissant. La vraie frontiere pour l'ouverture du tunnel est le worker dedie sans secrets ni prod.

## Prerequis locaux

- Node.js 20+
- Git
- Claude Code CLI installe et authentifie
- Codex CLI installe/authentifie pour la revue croisee existante
- le depot PASSIO a jour

Depuis la racine du depot :

```bash
npm run bridge:install
npm run bridge:check
```

Sur la machine principale, le resultat attendu est : 4/4 prerequis CLI verts **et**
`Worker isole — non active`. C'est un etat sain pour tester uniquement le tunnel et `passio_status`.

## Test local MCP

Démarrer le serveur directement :

```bash
npm run bridge:start
```

Le processus parle MCP sur stdin/stdout : il est normal qu'il n'ouvre aucune page Web ni aucun
port HTTP. Une poignee de main `initialize` puis `tools/list` doit exposer les quatre outils.

## Connexion a ChatGPT via Secure MCP Tunnel — phase 1

Le premier tunnel doit etre ouvert **en mode status-only**, donc sans
`PASSIO_BRIDGE_ISOLATED=1`. Cela permet de verifier :

```text
ChatGPT -> Secure MCP Tunnel -> Passio Bridge -> passio_status
```

sans donner a ChatGPT la capacite de lancer Claude sur le compte principal.

Sequence :

1. Creer/obtenir un tunnel MCP dans l'espace OpenAI Business concerne.
2. Installer/configurer `tunnel-client` avec un profil stdio.
3. Definir comme commande MCP :

```text
node <CHEMIN_ABSOLU_PASSIO>/bridge/server.mjs
```

4. Lancer le diagnostic du tunnel, puis le client du tunnel.
5. Dans ChatGPT en mode developpeur, creer l'app MCP et selectionner la connexion **Tunnel**.
6. Scanner les outils et verifier que les quatre `passio_*` apparaissent.
7. Appeler uniquement `passio_status`. Il doit retourner `isolation: "BLOCKING: disabled"`.
8. Verifier qu'un appel a `passio_analyze` est refuse par la garde d'isolation.

Ne passer a la phase 2 qu'apres cette preuve negative.

## Phase 2 — worker dedie

Creer ensuite un compte Windows separe ou une VM sans secrets personnels ni acces prod, y cloner
PASSIO et y installer Claude/Codex. C'est **dans ce worker uniquement** que le processus du tunnel
peut recevoir :

```text
PASSIO_BRIDGE_ISOLATED=1
```

Avant de l'activer, verifier explicitement l'absence de :

- `dashboard/.env` / service role ;
- session Supabase CLI liee a la prod ;
- fichiers utilisateurs ou sauvegardes PASSIO ;
- credentials GitHub trop larges ;
- variables d'environnement sensibles.

Puis refaire `npm run bridge:check`, la poignee de main MCP, `passio_status`, et seulement ensuite
un `passio_analyze` sur une question non sensible. Le premier `passio_implement` doit etre une
modification sans impact produit et rester sur une branche non fusionnee.

## Package lock

`bridge/package-lock.json` doit etre **committe**, pas ignore : il fige exactement les versions du
SDK MCP/Zod installees et rend le worker reproductible. S'il a ete genere lors de `npm install`,
l'ajouter a la branche Bridge apres inspection.

## Politique de publication

Le Bridge pousse une **branche**, jamais `main`. La validation/fusion reste un geste separe. Cela
permet a ChatGPT/GitHub/CI de relire le resultat avant qu'il puisse devenir la version de production.
