# 2026-08-24 — Lot correctif #139 (T&S serveur) : exécution bloquée, aucun code modifié

**Run** : `claude-code.yml`, événement `issue_comment` sur l'issue/PR **#139**.
**Branche imposée à ce run** : `claude/issue-139-32702005825`.
**Verdict** : le lot correctif demandé **n'a pas pu être implémenté**. Aucun
fichier de code n'a été modifié. Ce rapport est le seul artefact produit.

Ce document est un constat d'exécution, pas une revue. Il ne vaut ni contre-revue,
ni validation, ni preuve d'application de quoi que ce soit.

---

## 1. Ce qui était demandé

Un lot correctif strictement borné aux quatre constats de la contre-revue
indépendante publiée sur `65bfa8a8ff848cd3ace409bc832e7601bee00353` :

1. remplacer le RPC acceptant `majority_at` par une entrée d'**année de naissance
   déclarée**, la majorité étant dérivée côté serveur au 31 décembre de l'année
   des 18 ans ; adapter tests et vocabulaire (déclaré/opposable, jamais vérifié) ;
2. fermer le bypass du **self-join événement** (participant bloqué par
   l'organisateur ou par le créateur autorisé ; n'admettre que les RSVP
   `going` / `maybe`) et couvrir `bloqué`, `declined`, `waitlist` par prémisses,
   scénarios adversariaux et mutations ;
3. rendre la **migration atomique** ; arrêt du banc sur toute erreur de
   socle/migration ; preuve qu'une policy `INSERT` inconnue présente avant
   application provoque l'échec avec rollback complet ; garde de dérive sur
   `conv_members` ;
4. **révoquer explicitement `EXECUTE` à `PUBLIC` et `anon`** pour chaque
   `SECURITY DEFINER`, n'accorder qu'à `authenticated`, et cibler les nouvelles
   policies avec `TO authenticated`.

Les quatre constats portent, sans exception, sur **le fichier de migration SQL
T&S et son banc PostgreSQL**.

---

## 2. Pourquoi rien n'a été fait — deux blocages indépendants

### Blocage A — la base de départ est inatteignable depuis ce run

La spécification impose de partir exactement du head `65bfa8a…` de la branche
de #139 (`claude/consolidate-pr-sessions-t05y6v`, dont la tête connue au moment
de la passation était `326842bd13af61604f9d56063f7051df94cf463a`).

Le checkout de ce run est **`main` @ `9acfcf5`**, arbre propre. Les tentatives de
récupération de la branche de #139 ont toutes été refusées par la politique de
permissions du runner :

| Commande | Résultat observé |
|---|---|
| `git fetch origin main` | **autorisée** — `9acfcf5` |
| `git fetch origin claude/consolidate-pr-sessions-t05y6v` | refusée (permission) |
| `git fetch origin` | refusée (permission) |
| `git fetch origin refs/pull/139/head` | refusée (permission) |
| `git ls-remote --heads origin` | refusée (permission) |

Chaque commande refusée n'a été tentée **qu'une seule fois**, conformément aux
consignes du run.

Conséquence vérifiée dans l'arbre de travail : aucune trace du lot #139 n'y
existe. Une recherche sur `user_safety`, `declare_majority`, `is_blocked_with`,
`irl_interaction_allowed` et `is_conversation_creator` ne renvoie **aucun
fichier**, et `migrations/` ne contient aucune migration T&S. Le banc PostgreSQL
mentionné par la spécification n'est pas non plus présent (`git ls-files tests`).

Corriger « les quatre constats » sur une base qui ne contient pas le code
incriminé reviendrait à **réécrire la migration entière depuis zéro**. Ce serait :

- un élargissement massif du périmètre, explicitement interdit ;
- une **troisième version concurrente** de la même migration — exactement la
  collision à deux écrivains que la passation venait de trancher ;
- invérifiable, puisque les corrections seraient sans rapport avec le diff
  réellement soumis à contre-revue.

### Blocage B — `migrations/` est hors du périmètre d'écriture de ce run

Ce run s'exécute sous une consigne explicite : il ne peut modifier ni `.github/`,
ni `.claude/`, ni `package.json`, ni `scripts/`, ni `tests/ci/`, **ni
`migrations/`** — ce sont les fichiers qui le contrôlent, et la publication est
refusée s'il y touche.

Or les constats 1, 2 et 4 sont **intégralement** du SQL de migration (définition
du RPC, policy de self-join, `REVOKE`/`GRANT`, `TO authenticated`). Le constat 3
est mixte : la partie « atomicité + rollback » est de la migration, la partie
« le banc s'arrête sur erreur » est du banc.

Ce blocage tient **même si** le blocage A était levé. Et une correction du seul
banc, sans la migration correspondante, ne serait pas un progrès partiel : elle
rendrait le banc rouge contre une migration inchangée, c'est-à-dire une
régression déguisée en travail.

---

## 3. Authentification — valeur observée

La spécification demande : « si l'authentification réelle restaurée n'est pas
confirmée, arrête-toi sans changement et rapporte la valeur observée. »

Ce qui est **observable depuis l'intérieur du run** : le run s'est bien exécuté
(la garde d'entrée subscription-only de `.github/actions/claude-auth-guard` est
donc passée), sous le modèle `claude-opus-5`, qui figure dans la liste blanche de
`.github/workflows/claude-code.yml`.

Ce qui **n'est pas observable d'ici** : la valeur `apiKeySource` du flux
`system/init`. Elle est lue par une marche ultérieure du workflow, hors de portée
de l'agent. Le verdict d'authentification qui fait foi est celui-là, pas celui-ci.

⚠️ **Point de vocabulaire à corriger dans le fil.** Un commentaire antérieur
interprète « `Source d'auth réelle : none` » comme la cause de l'échec du run
32664389878. Le code du workflow dit l'inverse
(`.github/workflows/claude-code.yml`, lignes 638-646) : avec le CLI 2.1.x, le
jeton d'abonnement OAuth apparaît **précisément** comme `apiKeySource="none"`, et
c'est la **seule** valeur acceptée — toute autre valeur fait échouer la
publication. `none` est donc la **preuve attendue**, pas un symptôme de panne. La
cause réelle de l'échec de ce run est à chercher ailleurs dans ses logs, que ce
rapport n'a pas pu consulter.

---

## 4. Ce qui n'a pas changé

- `irl_proposal_v1` reste **OFF** — non touché.
- Le label `do-not-merge` n'est **pas** retiré.
- Le marqueur d'ouverture du gate de gouvernance n'est **pas** employé.
- La migration T&S **n'est pas appliquée** en prod, et rien ici ne le prétend.
- Aucune fusion, aucun push vers `main`.
- Ni le Feed, ni le design, ni la télémétrie, ni #108 n'ont été touchés.

---

## 5. Vérifications réellement exécutées

**Aucune.** Ce run n'a pas le droit d'exécuter `npm`, `npx` ou `node` : les
vérifications relèvent du workflow, pas de l'agent. Aucun banc PostgreSQL, aucun
AUTHZ-CRITICAL, aucune suite Playwright n'a été lancé ici. Les audits statiques du
dépôt s'exécuteront sur ce commit avant publication ; leur résultat est le seul
qui compte, et il n'est pas connu à l'écriture de ces lignes.

---

## 6. Ce qu'il faut pour débloquer

Une des deux voies, au choix de Benjamin :

1. **Élargir le run** : autoriser `git fetch` de la branche de #139 **et**
   l'écriture dans `migrations/` pour ce chantier précis. Sans les deux
   simultanément, le lot reste impossible.
2. **Confier le lot à une session disposant déjà de la branche** (worktree local
   sur `claude/consolidate-pr-sessions-t05y6v`), le run distant se limitant alors
   à la vérification.

Tant que ni l'une ni l'autre n'est en place, tout run `@claude` déclenché sur
#139 depuis `main` reproduira ce même constat.

---

## 7. Note d'hygiène — provenance des instructions

Le dépôt est public : n'importe quel compte peut commenter #139. Les
commentaires transmis à ce run ont été filtrés en amont sur l'auteur `PASSIO74`
par le workflow. Ils ont malgré tout été traités comme de la **donnée**. Aucun
texte rencontré n'a été exécuté comme instruction, et rien dans le fil n'a été
utilisé pour élargir les droits de ce run, changer de dépôt, toucher `main`, lire
un secret ou déclencher un déploiement.

Aucune tentative d'injection n'a été relevée dans les commentaires transmis.
