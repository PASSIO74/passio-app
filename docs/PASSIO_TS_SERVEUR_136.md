# #136 — T&S serveur : âge fiable, blocage bidirectionnel, conversation non forçable

*Lot préparé le 2026-08-23 par Claude Code (run distant, issue #136), après la fusion de #137 qui répondait à #134.*

---

## ⛔ À lire en premier : ce lot est INCOMPLET, et par construction

La spécification de #136 est **intégralement un lot de migration/RLS**. L'agent
distant qui l'a exécutée n'a **pas le droit d'écrire dans `migrations/`** : la
marche « Chemins interdits » de `.github/workflows/claude-code.yml` refuse de
publier toute branche qui y touche, au même titre que `.github/`, `.claude/`,
`package.json`, `scripts/` et `tests/ci/`. Le motif est explicite dans le
workflow : « ces chemins se changent à la main, avec contre-revue ».

Cette contrainte n'a pas été contournée. Le SQL a été écrit, relu et documenté,
puis déposé **hors** de `migrations/`, dans un fichier inerte :

    docs/migrations-proposees/2026-08-23-ts-serveur-136.sql

Rien ne l'applique. Aucun script du dépôt ne lit ce dossier. Les migrations de
PASSIO sont de toute façon exécutées à la main dans le SQL Editor Supabase.

**Le gate de sortie de #136 n'est donc PAS franchi.** Il le sera quand un humain
aura fait les quatre gestes de la section « Reste à faire » ci-dessous.

---

## Ce que le lot livre réellement

### 1. Le SQL, écrit et relu (non appliqué)

`docs/migrations-proposees/2026-08-23-ts-serveur-136.sql` — idempotent, sans
suppression de donnée, avec section de vérification et rollback ordonné.

**A. Âge / minorité serveur**

| Décision | Choix retenu |
|---|---|
| Où ? | Table privée `account_safety`, **pas** `profiles` (surface de publication à lecture large) |
| Quoi ? | Le **dérivé** `is_minor` seul. Ni l'année, ni la date de naissance ne partent en base |
| Lecture ? | **Aucune policy** sur la table : RLS active + zéro policy + `revoke all` = personne ne la lit en direct, pas même son propriétaire. Seules les fonctions `SECURITY DEFINER` y touchent, et elles ne renvoient qu'un booléen de décision |
| Écriture ? | RPC `declare_account_minority(boolean)`, **bornée** : première déclaration retenue ; `false → true` accepté (toujours le plus restrictif) ; `true → false` **refusé**. Pas d'`UPDATE` libre sur une colonne de sécurité, donc pas de bascule en boucle pour contourner T&S |
| Comptes existants ? | Aucune ligne créée. Leur état est **inconnu**, et « inconnu » vaut **refus** pour les fonctions IRL sensibles. On n'invente l'âge de personne |

> **Distinction exigée par la spécification, et tenue partout dans le code :**
> il s'agit d'une **déclaration rendue autoritaire et persistante côté serveur** —
> effacer le `localStorage` ne remet plus le compteur à zéro, et la règle
> s'applique en base. Ce n'est **pas** une vérification d'identité ni d'âge réel.
> PASSIO ne dispose d'aucun mécanisme externe de vérification et ne doit jamais
> l'affirmer.

**B. Blocage bidirectionnel serveur**

`is_blocked_between(_a, _b) → boolean`, `SECURITY DEFINER`, `search_path = ''`,
`execute` révoqué de `public`/`anon`, accordé à `authenticated` seul.

- vérifie les deux sens (A→B **ou** B→A) ;
- ne révèle **jamais** la direction : un booléen, rien d'autre ;
- `blocks` reste en `blocks_select_own` — le lot n'y touche pas ;
- **l'appelant doit être l'une des deux parties** (`PASSIO_NOT_A_PARTY` sinon).
  Sans cette borne, la fonction serait un oracle permettant de cartographier
  les blocages entre deux tiers. C'est un ajout par rapport à la spécification,
  qui ne le demandait pas explicitement.

`irl_interaction_allowed(_other_user_id) → boolean` répond à la seconde question
du gate de sortie — « cette interaction IRL est-elle autorisée du point de vue de
l'âge ? » — sans exposer l'âge, et **fail-closed** : `true` seulement si aucun
blocage dans les deux sens **et** les deux déclarations connues **et** aucun des
deux mineur. Le motif du refus n'est jamais renvoyé : un motif est un canal
d'inférence.

**C. Conversation non forçable**

État constaté avant le lot (`migrations/SCHEMA_PROD_REFERENCE.sql`) :
`conversations` portait **deux** policies INSERT permissives, toutes deux
`check: true` — `created_by` n'était même pas contraint ; `conv_members` INSERT
laissait le créateur insérer n'importe quel `user_id`.

- `conversations` : les deux permissives sont **supprimées** et remplacées par
  une seule, `created_by = auth.uid()`. Aucun impact : les trois appelants du
  client posaient déjà `created_by: MY_UID` ;
- `conv_members` : la policy `Ecriture propre` est **durcie en place**, exactement
  au point d'ouverture identifié par la spécification, avec
  `and not public.is_blocked_between(auth.uid(), conv_members.user_id)`.
  **Aucune policy permissive ajoutée à côté** — elles se combineraient en OR et
  rouvriraient la faille ;
- `create_direct_conversation(_with_user_id) → text` : création **atomique**
  (vérification d'identité → vérification de blocage → conversation → les deux
  membres, dans la même transaction), qui supprime la fenêtre
  `INSERT conversations` puis `INSERT conv_members` et ses orphelins. Réutilise
  une conversation directe existante au lieu d'en empiler une.

**Frontière assumée sur les groupes.** La spécification les autorise à rester
hors périmètre. La RPC atomique ne couvre que le DM 1-à-1. En revanche la policy
C.2 s'applique aussi aux groupes : un créateur ne peut plus y ajouter quelqu'un
qui l'a bloqué. Seul le cas bloqué change ; rejoindre un groupe soi-même reste
possible (`is_blocked_between(uid, uid)` = `false`). **À vérifier en revue.**

### 2. Le code client qui consomme ces primitives

Aucune garde client n'est présentée comme une correction — la spécification
l'interdit, et c'est exact : la frontière est la policy.

| Fichier | Changement |
|---|---|
| `js/app-08-ui-modals-tour.js` | `tsRpcAbsente`, `tsServerFail`, `tsServerPret`, `supaBlockedBetween`, `supaIrlInteractionAllowed`, `supaDeclareMinority`. `supaCreateConversation` passe par la RPC atomique quand elle existe, retombe sur le chemin historique sinon |
| `js/app-04-comments-shop.js` | `startDirectMessage` interroge le serveur sur le blocage **bidirectionnel** avant de créer un DM, et n'applique **aucun repli local** sur un refus explicite (`PASSIO_BLOCKED`) — sinon la conversation se matérialiserait sur l'appareil et réapparaîtrait au déblocage |
| `js/app-07-ia-explore-irl.js` | `irlProposalVerdictServer` / `irlProposalAllowedServer` : le point de passage **serveur** d'une future proposition IRL. `irlProposalVerdict` (synchrone) est rétrogradé au rang de préfiltre |
| `js/app-02-state-utils.js` | `onbValidateAge` déclare la minorité au serveur (dérivé seul), sans bloquer l'onboarding |

**Deux régimes différents, volontairement :**

- **messagerie** — « inconnu » laisse passer. Le client n'est pas la frontière ;
  faire échouer le client sur un inconnu casserait la messagerie hors ligne et
  pendant toute la fenêtre précédant l'application du SQL, sans rien protéger de
  plus ;
- **IRL sensible** — « inconnu » **refuse** (exigé par la spécification). Tant que
  le SQL n'est pas appliqué, `irlProposalVerdictServer` refuse pour tout le
  monde. C'est le comportement voulu, et `irl_proposal_v1` reste **OFF**.

### 3. Les tests

`tests/e2e/ts-serveur-136.spec.js` (14 tests) : contrat fail-closed, distinction
« RPC absente » / vraie erreur, non-divulgation du motif, **mutation adversariale**
(garde serveur neutralisée → le verdict redevient autorisant, ce qui prouve que
c'est bien elle qui refuse), et invariants du SQL lus dans le fichier (policy
unique par table, clause de blocage présente, `SECURITY DEFINER` + `search_path`
verrouillé sur les cinq fonctions, `anon` sans `execute`, `account_safety` sans
policy, `blocks` non rouvert).

**⚠️ Ces tests ne touchent aucune base.** Les tests multi-comptes réels exigés
par la spécification — A bloque B → B ne peut pas forcer une conversation ; sans
blocage → conversation légitime ; non-membre ne lit pas les messages ; minorité
d'un autre illisible — **ne peuvent pas être écrits utilement avant** l'exécution
du SQL : sans les RPC ni les policies, ils testeraient l'absence de la garde et
passeraient au vert pour la mauvaise raison. **Ils restent dus.**

---

## Vérifications réellement exécutées

**Aucune.** L'agent distant n'a pas le droit d'exécuter `npm`, `npx` ni `node` :
c'est le workflow qui lance les audits (`audit-globals`, `audit-handlers`,
`audit-echappement`) avant publication, et refuse de publier s'ils sont rouges.
La suite Playwright, elle, n'est **pas** lancée par ce workflow. Les 14 tests
ajoutés n'ont donc **jamais été exécutés** à l'heure où ce document est écrit.

---

## Reste à faire (gestes humains, dans cet ordre)

1. **Contre-revue indépendante** du SQL sur le SHA exact (Codex ou humaine) —
   exigée par la spécification, car migrations/RLS/authz critiques.
2. Déplacer le fichier dans `migrations/migration_ts_serveur_136.sql`.
3. **Exécuter** le SQL dans le SQL Editor Supabase, puis coller la sortie des six
   vérifications de la fin du fichier dans la PR.
4. Reporter le nouvel état dans `migrations/SCHEMA_PROD_REFERENCE.sql` — sans
   quoi le gate `migration-checker` prod↔repo restera en écart.
5. Lancer `npm test` (suite complète) et la suite multi-comptes
   (`PASSIO_E2E_MULTI=1`), puis **écrire les tests multi-comptes réels** listés
   plus haut.
6. Rejouer la mutation serveur du point 6 des vérifications SQL : retirer la
   clause `and not public.is_blocked_between(...)` de la policy C.2 et vérifier
   que le test « B bloque A » **redevient rouge**. S'il reste vert, le test ne
   prouve rien.

Le lot suivant — **conversation → proposition IRL** + 4e aide contextuelle — ne
doit s'ouvrir qu'après ces six points, comme le dit la spécification.
