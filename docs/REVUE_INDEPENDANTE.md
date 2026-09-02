# REVUE_INDEPENDANTE

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

## 🔍 Revue indépendante par un second modèle (2026-08-13)

Les **changements à risque** (auth/identité, RLS/migrations, affichage de contenu d'autrui, PII, paiement, modération) passent par une revue d'un modèle tiers **en lecture seule**. Répartition stricte : l'agent principal seul détient le dépôt, `main`, Supabase, les tests et le déploiement ; le relecteur n'a **aucun accès** — il reçoit un dossier, rien d'autre. Ses remarques sont examinées et vérifiées contre le code réel avant toute fusion, jamais appliquées telles quelles.

```bash
npm run revue -- --titre "Ce que fait le changement" --tests    # produire le dossier
node scripts/chatgpt.js etat                                    # quel canal ChatGPT est prêt
```

**Le canal ChatGPT passe par `scripts/chatgpt.js`** (skill `/chatgpt`), pas par le
pilotage du DOM de chatgpt.com. Transport retenu le 2026-08-16 : **`codex`**,
lancé avec le compte ChatGPT, sans clé API (l'API OpenAI est facturée au jeton :
implémentée en repli, à ne pas activer sans décision de Benjamin).

⚠️ **Rectifié le 2026-08-23 : `codex` n'est PAS gratuit.** Ce paragraphe affirmait
« compris dans l'abonnement déjà payé, aucun frais supplémentaire ». Mesuré à la
première vraie question, `codex login` réussi et `etat` au vert : le CLI répond
`ERROR: Your workspace is out of credits. Add credits to continue.` L'usage tire
sur un pool de crédits d'espace de travail, distinct de l'abonnement ChatGPT, et
ce pool était vide. **`codex login` n'était donc pas la dernière pièce manquante :
les crédits le sont.** Tant qu'ils ne sont pas rechargés, le canal direct est
inutilisable — quel que soit ce qu'affiche `etat`. Fils persistants dans `.passio/chatgpt/` (gitignoré), et une
**garde qui refuse l'envoi** dès qu'un JWT, une clé `sb_secret_`/`sk-`, une
affectation `SERVICE_ROLE_KEY=…` ou un mot de passe apparaît — le chemin navigateur,
lui, n'a aucune garde. ⚠️ Codex est un **agent doté d'outils de lecture**, pas un
onglet : il est lancé sur un **dossier de travail vide** (+ `--ignore-user-config`,
`--ignore-rules`, env filtré), jamais sur le dépôt. Mais **le bac ne confine rien** :
test canari du 2026-08-17 — avec `--sandbox read-only` dans un dossier vide, il a lu
un fichier hors du bac *et* `package.json` dans le dépôt, son premier refus venant
de lui-même et non d'une barrière. `read-only` n'interdit que l'écriture. La seule
garde qui tient : une invite auto-suffisante, jamais une invitation à explorer le
dépôt (`dashboard/.env` est à sa portée). Sans transport connecté, le
script s'arrête et renvoie vers le repli navigateur
(`.claude/skills/chatgpt/references/navigateur.md`, 8 pièges vécus) : **ne jamais
écrire que ChatGPT a été consulté si l'échange n'a pas eu lieu.**

`scripts/dossier-revue.js` produit dans `.passio/reviews/<date>-<slug>/` : spécification, `diff.patch`, **fichiers concernés en entier** (un relecteur qui ne voit que des hunks juge la forme, pas le fond), vérifications réellement exécutées avec leurs sorties brutes (un test rouge est rapporté rouge), migrations touchées, conventions du projet, et pièges connus détectés par motif. `DOSSIER-COMPLET.md` regroupe le tout en un fichier à coller dans un chat. Sans `--tests`, Playwright n'est PAS lancé et le dossier le dit — ça ne vaut alors pas validation de bout en bout.

Le script est en lecture seule sur le dépôt (il n'écrit que dans son dossier de sortie) et n'a aucun accès prod. Chaque piège a une **portée** : les invariants DOM/globals ne valent que pour `js/app-*.js`, pas pour les modules Node — sinon le rapport se noie dans les faux positifs. Détail : `.passio/reviews/README.md`.

⚠️ **`.claude/` est désormais versionné SÉLECTIVEMENT** (skills + subagents = savoir projet, ils doivent survivre à un changement de machine). `.claude/settings.local.json` reste exclu : il a longtemps contenu des JWT et une clé `sb_secret_…` en clair dans ses commandes autorisées (9 entrées, purgées le 2026-08-15 par `npm run permissions:compact`, qui refuse désormais de conserver toute règle porteuse de secret). Il reste hors versionnement : c'est un fichier de poste, pas du savoir projet.
