---
name: chercher-survivants
description: Cherche les endroits où un correctif connu N'A PAS été appliqué — les « survivants » d'une correction partielle. Heuristique la plus productive de la session du 2026-08-16 : quatre défauts réels trouvés là où relire du code au hasard n'en trouvait aucun. À utiliser pour un audit, une chasse au bug sans piste, ou quand Benjamin dit « cherche s'il y en a d'autres », « audit », « qu'est-ce qui traîne encore ».
---

# /chercher-survivants — Là où le correctif n'est pas allé

## Le constat qui fonde la méthode

Quatre défauts trouvés le 2026-08-16 avaient la même forme : **quelqu'un avait déjà identifié la classe de problème et n'en avait traité qu'une partie.**

| Correctif appliqué | Survivant oublié |
|---|---|
| `_syncableState()` expurgeait le base64 des profils passion | …mais pas des photos du **compte** → 4,7 Mo par synchro, p95 à 2,8 s |
| `bootInteractions` neutralisait 24 fonctions `supa*` | …mais pas `supaLoadPosts` → trois tests flaky pendant des semaines |
| 4 policies utilisaient `(select auth.uid())` | …3 avaient gardé la forme nue → 11,6 ms au lieu de 1,1 ms |
| `sendMessageToSupabase` lisait `{ error }` + outbox | …`_forwardTo` avalait les deux callbacks → transfert perdu en silence |

Aucun de ces quatre n'était visible en lisant le code de façon linéaire. Tous l'étaient en **cherchant l'asymétrie**.

## Pourquoi ça marche

Un correctif révèle qu'une classe de problème existe. Il prouve aussi que l'auteur y a pensé — donc les endroits **non** corrigés le sont par oubli, pas par choix. Et un oubli ne se signale jamais tout seul : le code non corrigé continue de fonctionner *presque* bien.

C'est plus productif que la relecture au hasard parce que la classe est déjà connue et le motif déjà écrit quelque part dans le dépôt.

## La méthode

**1. Recenser les invariants du projet.** Ils sont écrits : `CLAUDE.md` (⚡ Invariants critiques), `docs/PIEGES_CONNUS.md`, `.passio/adr/`. Chacun est un correctif généralisé — donc chacun a pu être appliqué partiellement.

**2. Pour chaque invariant, chercher la forme INTERDITE, pas la forme correcte.**

```bash
# lire { error } sur les écritures Supabase
grep -rn 'from("[a-z_]*")\.\(insert\|update\|delete\)' js/app-0*.js | grep 'then(function(){}, *function(){})'

# supaTs obligatoire
grep -rn 'new Date([^)]*+ *"Z"' js/*.js

# findPostAnywhere obligatoire
grep -rn "seed\.posts\.find\|userPosts\.find" js/*.js | grep -v findPostAnywhere
```

Côté base, comparer les policies entre elles :

```sql
select count(*) filter (where qual like '%SELECT auth.uid()%') as enveloppees,
       count(*) filter (where qual like '%auth.uid()%'
                          and qual not like '%SELECT auth.uid()%') as nues
from pg_policies where schemaname='public';
```

**3. Lire chaque candidat EN CONTEXTE avant de conclure.** C'est l'étape qui compte. Sur la chasse `findPostAnywhere` : **8 candidats, 8 faux positifs** — deux incluaient bien `supabasePosts` sur la ligne suivante (grep tronqué), trois appelaient `findPostAnywhere` avec un repli gardé, et deux ne cherchaient que dans `userPosts` **volontairement**, parce qu'on ne supprime que ses propres posts.

Un invariant peut être tenu partout. C'est un résultat, pas un échec — mais il ne se déclare qu'après lecture.

**4. Corriger en copiant le traitement déjà en place**, pas en en inventant un. Le chemin correct existe déjà dans le dépôt : c'est la référence, et l'aligner dessus supprime le risque d'introduire une troisième variante.

## Le piège de la méthode

Trouver un survivant donne envie de conclure que la classe entière est cassée. Vérifier le périmètre réel **avant** :

Sur `auth_rls_initplan`, l'advisor annonçait **85** avertissements. Décompte réel : 80 policies concernées, dont **7 lectures** — les seules qui coûtent — et **73 écritures**, où « réévalué par ligne » signifie « évalué une fois » puisqu'une écriture touche une ligne. Soit **10 policies réelles**, pas 85.

Traiter les 73 aurait été 73 occasions de se tromper pour zéro gain.

## Où chercher en priorité sur PASSIO

Les chemins **secondaires** d'une fonctionnalité qui en a un principal bien traité : transfert vs envoi, suppression pour moi vs pour tous, partage vs publication, groupe vs conversation directe. Le principal reçoit l'attention et les tests ; le secondaire hérite d'une copie plus ancienne.

Voir aussi `revue-croisee` — un second regard produit les mêmes asymétries par une autre voie.
