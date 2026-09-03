# CANAL_GITHUB_CLAUDE_CODE

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

## 🤝 Modèle multi-IA et contrat de déclenchement

PASSIO est mené par plusieurs IA sous gouvernance unique. Les règles de
collaboration vivent dans **`AGENTS.md`** (workflow git non négociable, rôles,
handoff de PR), le routage dans `.passio/orchestrator.json`. Ce fichier-ci est la
référence *technique*, `AGENTS.md` la référence *collaborative* : lire les deux
quand la tâche vient d'une issue ou d'une PR.

**ChatGPT ne peut pas parler directement à Claude Code.** Le seul transport est
GitHub (`.github/workflows/claude-code.yml`, authentifié par l'abonnement via
`CLAUDE_CODE_OAUTH_TOKEN`). Un ordre ne déclenche rien s'il ne porte pas un
marqueur, et l'issue doit appartenir à PASSIO74 :

| Voie | Condition exacte |
|---|---|
| **label `claude`** (nominal) | événement `labeled` sur une issue de PASSIO74 |
| `@claude` (secours) | dans le titre/corps d'une issue, ou un commentaire de PASSIO74 sur une issue de PASSIO74 |

⚠️ **Un run `skipped` à la création d'une issue est NORMAL.** La condition teste
`github.event.label.name`, champ qui n'existe **que** sur l'événement `labeled` :
l'ouverture de l'issue produit toujours un run `skipped`, puis la pose du label
en produit un second qui, lui, exécute. Conséquences pratiques :

- créer une issue avec le label **déjà posé** ne déclenche rien — il faut le
  poser (ou le retirer/reposer) **après** création ;
- dans Actions, un `skipped` ne distingue pas « jamais labellisé » de « labellisé
  et exécuté » : c'est le run **suivant** qui fait foi.

C'est exactement ce qui a coûté six ordres perdus les 19–21 août (issues #68,
#69, #73 — dont le chantier PERF-IOS) : runs 9 à 14 sortis en `skipped`,
indiscernables d'un succès, sans qu'aucune alerte ne soit levée. **Une issue
créée n'est jamais la preuve qu'une tâche a tourné** : la preuve est un run vert
dans Actions → Claude Code, et une PR. Détail : `docs/PHONE_ONLY_AI_WORKFLOW.md`.

### État du canal, et le piège de `AUTH_REELLE` (2026-08-24)

Le canal GitHub → Claude Code est **nominal**, prouvé le 2026-08-24 par un
canari : issue #140 → run 141 → branche → PR #141. C'est cette chaîne complète,
et elle seule, qui prouve le transport — pas la présence du secret.

⚠️ **`AUTH_REELLE: none` n'est PAS une panne : c'est la preuve attendue.**
Avec le CLI 2.1.x, un jeton d'abonnement OAuth apparaît comme
`apiKeySource="none"` dans l'événement `system/init` — aucune clé API n'alimente
la requête, ce qui est exactement le but. Le workflow en fait la **seule** valeur
admise (`.github/workflows/claude-code.yml`, étape « Prouver le modèle et
l'authentification réellement exécutés ») :

```js
if (keySource !== 'none') {
  console.error(`… la preuve OAuth attendue est apiKeySource=none. Publication refusée.`);
  process.exit(1);
}
```

Une source vide sort `ABSENTE`, pas `none`. Donc : `none` = ✅ abonnement utilisé ;
toute autre valeur = ❌ publication refusée.

**Transport/authentification et capacité sont deux états distincts.** Un run peut
porter la bonne preuve OAuth et être néanmoins refusé parce que le quota ou les
crédits de l'abonnement sont épuisés. `AUTH_REELLE: none` ne prouve donc ni les
crédits disponibles, ni leur date de retour. Dans ce cas, ne pas régénérer le
jeton : attendre le rétablissement annoncé et continuer avec Codex sur les lots
indépendants de Claude Code.

Ce piège a coûté cher le 2026-08-24 : une session a lu `none` dans le commentaire
de retour, l'a présenté comme la cause des échecs des runs 138 et 139, et Benjamin
a régénéré un `CLAUDE_CODE_OAUTH_TOKEN` qui n'avait probablement rien. **La cause
réelle de ces deux échecs reste inconnue** — ne pas la réinventer. Avant de
conclure à une panne d'authentification, lire le log du run : le message
« Source d'auth non autorisée » est le seul symptôme d'un vrai problème d'auth.

Deux marches distinctes, à ne pas confondre :

| Marche du run | Ce qu'elle prouve | Ce qu'elle ne prouve PAS |
|---|---|---|
| `claude-auth-guard` (`steps.auth`) | le secret existe, fait ≥ 40 caractères, n'est pas une clé API facturée (préfixe `sk-ant-api` → refus), et aucune `ANTHROPIC_API_KEY` ne traîne dans le job | que le jeton est encore **valide** côté Anthropic — un préfixe simplement inattendu passe, le CLI tranchera |
| `steps.modele` | la source d'auth **observée** et le modèle réellement exécuté | — |

**Repli quand le canal est réellement mort** (run rouge sur l'étape d'auth, ou
aucun run) : ne pas relancer le label `claude` en boucle, il ne produit que des
commentaires rouges. L'ordre s'écrit dans une issue ou une PR, Benjamin le colle
dans une session Claude Code interactive, qui exécute. Lent mais fiable : c'est
ce chemin qui a porté les lots des 2026-08-23/24. Le rétablissement demande un
jeton neuf (`claude setup-token`) posé dans les secrets du dépôt — seul Benjamin
peut le faire.

**Une branche sensible = un seul écrivain.** Le 2026-08-24, six commits d'une
seconde session sont arrivés sur `claude/consolidate-pr-sessions-t05y6v` pendant
qu'une première y travaillait ; rien n'a été perdu — les deux versions ont été
confrontées sur un PostgreSQL réel avant d'en garder une — mais à deux écrivains
le recouvrement n'est qu'une question de temps. Désigner l'écrivain unique avant
d'ouvrir le chantier ; les autres sessions lisent et vérifient. Voir le skill
`/passio-multi-session`.

Répartition : **ChatGPT** = direction produit, spécification, arbitrage ·
**Claude Code** = implémentation, backend/Supabase/RLS, sécurité, tests, refacto ·
**Codex** = revue indépendante · **Lovable / Base44** = laboratoires
d'exploration, jamais source de vérité, jamais connectés à la prod. GitHub est la
seule source de vérité — pas une conversation IA, pas un prototype, pas un export.
