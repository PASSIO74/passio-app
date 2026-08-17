# Passio Bridge MCP

Passio Bridge fait de ChatGPT le poste de pilotage de PASSIO sans exposer un shell arbitraire.
Il expose un petit serveur MCP local en **stdio**. Le serveur délègue l'analyse et l'exécution à
Claude Code dans le vrai dépôt, et conserve le protocole de revue croisée Codex déjà présent
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
worktree + branche dédiés
```

Le Bridge n'expose **aucun outil shell libre**, ne fusionne jamais `main` et n'est pas un outil
de déploiement. Les tâches d'implémentation sont créées dans des worktrees **à côté du dépôt**
(par défaut `<parent>/.passio-bridge-worktrees/passio-app/`), sur une branche `bridge/...` distincte.
L'état des tâches reste dans `.passio/bridge/` et est gitignoré. L'emplacement des worktrees peut
être surchargé avec `PASSIO_BRIDGE_WORKTREES`.

## Outils MCP exposés

- `passio_status` — état Git et tâches Bridge, lecture seule.
- `passio_analyze` — analyse du dépôt par Claude Code en mode plan/lecture.
- `passio_implement` — crée un worktree + branche, fait exécuter la mission par Claude Code,
  teste, committe le périmètre et pousse uniquement sa branche.
- `passio_continue` — reprend une tâche Bridge et la session Claude correspondante.

`passio_implement` accepte `risk=normal|critical`. En `critical`, Claude reçoit l'instruction
obligatoire de passer par la revue croisée existante et de vérifier chaque objection Codex sur
le dépôt réel avant de conclure.

## Garde-fous

Le prompt imposé à Claude interdit notamment :

- le merge automatique de `main` ;
- le force-push ;
- le déploiement automatique ;
- les écritures destructives directes en production hors instruction explicite et garde-fous projet ;
- le mélange avec les autres worktrees.

Les hooks et règles de `CLAUDE.md` restent applicables. Le Bridge est une façade de coordination,
pas un remplacement des protections déjà présentes dans PASSIO.

## Prérequis locaux

- Node.js 20+
- Git
- Claude Code CLI installé et authentifié
- Codex CLI installé/authentifié pour la revue croisée existante
- le dépôt PASSIO à jour

Depuis la racine du dépôt :

```bash
npm run bridge:install
npm run bridge:check
```

Le diagnostic doit afficher tous les prérequis `OK` avant d'activer le Bridge dans ChatGPT.

## Test local MCP

Démarrer le serveur directement :

```bash
npm run bridge:start
```

Le processus parle MCP sur stdin/stdout : il est normal qu'il n'ouvre aucune page Web ni aucun
port HTTP. Pour une inspection interactive, utiliser le MCP Inspector avec la commande locale
`node <CHEMIN_PASSIO>/bridge/server.mjs`.

## Connexion à ChatGPT via Secure MCP Tunnel

ChatGPT ne se connecte pas directement à `localhost`. Le Secure MCP Tunnel d'OpenAI sert de
pont sortant entre la machine locale et l'app MCP ChatGPT.

Séquence d'activation :

1. Créer/obtenir un tunnel MCP dans l'espace OpenAI concerné.
2. Installer/configurer `tunnel-client` avec un profil stdio.
3. Définir comme commande MCP :

```text
node <CHEMIN_ABSOLU_PASSIO>/bridge/server.mjs
```

4. Lancer le diagnostic du tunnel, puis le client du tunnel.
5. Dans ChatGPT en mode développeur, créer l'app MCP et sélectionner la connexion **Tunnel**.
6. Vérifier que les quatre outils `passio_*` apparaissent avant toute mission d'écriture.

Le `tunnel-client` doit rester en fonctionnement sur la machine qui possède le dépôt et Claude
Code : sans lui, ChatGPT ne peut pas joindre le Bridge local.

## Important — permissions du plan ChatGPT

La capacité MCP disponible dépend du plan/espace ChatGPT. Au moment de la création de ce Bridge
(août 2026), les apps MCP personnalisées avec actions d'écriture/modification complètes sont
prises en charge dans les espaces Business et Enterprise/Edu en mode développeur. Les capacités
MCP Pro sont plus limitées pour les actions d'écriture. Vérifier les capacités du workspace au
moment de l'activation avant de considérer `passio_implement` comme appelable depuis ChatGPT.

## Premier test recommandé

Commencer sans écriture :

```text
passio_status
```

puis :

```text
passio_analyze({ question: "Résume l'état technique actuel de PASSIO et cite les preuves dans le dépôt." })
```

Ensuite tester une modification sans impact produit, sur une branche Bridge dédiée. Ne commencer
par une migration, une policy RLS ou la production que lorsque le chemin complet
ChatGPT -> Bridge -> Claude -> tests -> branche est observé et compris.

## Politique de publication

Le Bridge pousse une **branche**, jamais `main`. La validation/fusion reste un geste séparé. Cela
permet à ChatGPT/GitHub/CI de relire le résultat avant qu'il puisse devenir la version de production.
