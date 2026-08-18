# PASSIO AI ORCHESTRATOR V2

Date d'activation : 2026-08-18

## Objectif

PASSIO utilise plusieurs agents IA spécialisés sous une gouvernance unique. Le but n'est pas de choisir une IA unique, mais de router chaque tâche vers l'agent le plus adapté, puis de vérifier les résultats avant intégration.

## Source de vérité

- Dépôt canonique : `PASSIO74/passio-app`
- Branche de production : `main`
- Aucun projet Lovable, conversation IA, prototype, fichier exporté ou environnement local ne remplace GitHub comme source de vérité.
- Toute évolution produit destinée à la production doit finir sous forme de diff Git relu, testé et traçable.

## Rôles

### ChatGPT — orchestrateur

Responsabilités :
- comprendre l'objectif produit ;
- décomposer le travail ;
- choisir l'agent adapté ;
- solliciter Lovable pour exploration UX/UI ;
- solliciter Claude Code pour analyse/implémentation profonde ;
- utiliser GitHub pour lecture, branches, PR, comparaison et contrôle ;
- challenger les résultats avec un second agent lorsque le risque est important ;
- refuser toute promotion en production tant que les invariants critiques ne sont pas vérifiés.

ChatGPT ne considère jamais une réponse d'agent comme une preuve. Le code réel, les tests, les diffs et les métriques font foi.

### Claude Code — ingénieur principal

À privilégier pour :
- architecture et compréhension transversale du dépôt ;
- modifications multi-fichiers ;
- backend, Supabase, RLS, sécurité, migrations ;
- bugs complexes ;
- refactoring ;
- tests et instrumentation ;
- transposition d'un prototype UI dans la stack Vanilla JS réelle.

Claude Code respecte `CLAUDE.md`, `docs/PIEGES_CONNUS.md`, les audits et les hooks existants.

### Lovable — laboratoire UI/UX

À privilégier pour :
- exploration visuelle ;
- variantes d'écran ;
- onboarding ;
- profils ;
- feed ;
- marketplace ;
- landing pages ;
- composants mobiles ;
- prototypage d'interactions.

Lovable est un LABORATOIRE, pas l'application de production.

Règles absolues Lovable :
- ne jamais connecter la base Supabase de production ;
- ne jamais recevoir de service_role, JWT, secret, token ou `.env` ;
- ne jamais inventer qu'une fonctionnalité est déjà déployée ;
- ne jamais changer la stack de production ;
- fournir des concepts et spécifications transposables en HTML/CSS/Vanilla JS ;
- respecter violet `#7c3aed`, mobile-first 375 px, touch >= 44 px, champs >= 16 px, icônes fonctionnelles plutôt qu'emojis ;
- pas de dark mode sauf demande explicite.

### Codex / second avis

À utiliser pour :
- revue indépendante ;
- challenge d'architecture ;
- vérification de raisonnement ;
- recherche de régressions probables ;
- critique de plan avant implémentation critique.

Le second avis ne doit pas disposer implicitement de secrets ou de davantage de contexte que nécessaire.

## Routage par défaut

| Type de tâche | Agent principal | Vérification |
|---|---|---|
| Nouvelle idée produit | ChatGPT | Lovable ou Claude selon nature |
| Refonte écran / UX | Lovable | ChatGPT + Claude Code |
| Prototype visuel | Lovable | ChatGPT |
| Implémentation production UI | Claude Code | tests + ChatGPT |
| Backend / API | Claude Code | ChatGPT/Codex + tests |
| Supabase / RLS / auth | Claude Code | double revue + tests dédiés |
| Bug complexe | Claude Code | reproduction + tests + ChatGPT |
| Architecture | Claude Code + ChatGPT | second avis Codex si critique |
| Documentation / synthèse | ChatGPT | code réel si affirmation technique |
| Release | GitHub/CI | tests + version réellement servie |

## Workflow standard

1. OBJECTIF — ChatGPT transforme la demande en résultat mesurable.
2. ROUTAGE — choix explicite de l'agent principal.
3. CONTEXTE MINIMUM — transmettre uniquement les fichiers/règles nécessaires.
4. PRODUCTION — l'agent génère concept, analyse ou code.
5. CONTRE-REVUE — un autre agent challenge les points à risque.
6. TRANSPOSITION — tout prototype Lovable est adapté à la stack PASSIO, jamais copié aveuglément.
7. TESTS — Playwright, audits handlers/globals/échappement et tests spécifiques au domaine.
8. DIFF — vérification du changement réel Git.
9. PR — changement traçable avant fusion pour les travaux orchestrés importants.
10. RELEASE — `main` reste la seule branche de production.

## Classification du risque

### Faible
- texte, microcopy, CSS local, prototype isolé.
- Une revue suffit.

### Normal
- fonctionnalité utilisateur, navigation, état local, rendu dynamique.
- Claude Code + tests + revue ChatGPT.

### Critique
- auth, RLS, permissions, wallet, suppression de données, migrations, stockage, secrets, déploiement.
- Claude Code + second avis indépendant + tests dédiés + aucune hypothèse implicite.

## Contrat de handoff Lovable -> PASSIO

Chaque expérience retenue doit fournir :

- problème utilisateur ;
- hypothèse UX ;
- écran/parcours concernés ;
- états : vide, chargement, erreur, succès ;
- interactions et transitions ;
- accessibilité ;
- responsive/mobile ;
- tokens visuels ;
- composants proposés ;
- contenu fictif clairement identifié ;
- comportements backend NON supposés ;
- notes de transposition Vanilla JS ;
- critères d'acceptation testables.

Claude Code implémente ensuite dans les fichiers source de PASSIO en respectant les invariants existants.

## Garde-fous secrets

Avant tout envoi vers un agent externe :
- exclure `.env` ;
- exclure service_role ;
- exclure clés privées/JWT/tokens ;
- minimiser les données utilisateur ;
- utiliser les garde-secrets déjà présents dans `scripts/chatgpt.js` quand ce canal est employé.

## Règle de décision

Une IA ne devient jamais "chef" parce qu'elle produit une réponse convaincante. L'orchestrateur choisit selon :

1. adéquation au type de tâche ;
2. connaissance réelle du dépôt ;
3. capacité de validation ;
4. risque de régression ;
5. coût/latence seulement après qualité et sécurité.

## État initial

- ChatGPT : connecté comme orchestrateur conversationnel.
- GitHub : `PASSIO74/passio-app` accessible et canonique.
- Claude Code : canal existant via `scripts/chatgpt.js`, skills et cockpit.
- Lovable : espace connecté ; projet `PASSIO Design Lab` séparé de la production.

Ce document est le contrat de gouvernance. Les automatisations futures doivent le respecter.
