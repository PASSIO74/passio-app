# Appliquer la migration du référentiel plat — mode d'emploi

**Fichier :** `migrations/migration_passions_plat.sql` — 486 Ko, 6 313 lignes, **une seule
transaction** (`begin;` … `commit;`).

**État au 2026-09-01 : NON APPLIQUÉE en production.**

---

## Ce que ça change, et ce que ça ne change pas

**Avant** (aujourd'hui) : les 1 908 passions sont **cherchables et lisibles**, mais seules
les **19 historiques** sont **publiables**. La clé étrangère de `posts.passion_id` refuserait
les autres, donc le Studio refuse *avant* l'insert, avec un message qui dit quoi faire.
C'est délibéré : mieux vaut un refus lisible qu'un post visible chez son auteur, jamais
arrivé au serveur, perdu au changement d'appareil.

**Après** : les 1 908 deviennent publiables d'un coup.

**Ce que ça ne change pas :** rien à l'écran. Le drapeau `flat_passions_v1` reste éteint —
appliquer la migration n'allume rien. Ce sont deux gestes distincts, et **dans cet ordre** :
migration d'abord, drapeau ensuite. L'inverse ouvrirait une recherche qui promet des
passions non publiables.

## Pourquoi c'est sûr

| propriété | preuve |
|---|---|
| **additive** | aucun `drop`, `delete`, `truncate`, ni renommage dans tout le fichier |
| **idempotente** | rejouée à l'identique, les décomptes ne bougent pas (1 908 / 3 830) |
| **réversible** | procédure de retour arrière en pied de fichier, testée |
| **vérifiée en l'EXÉCUTANT** | `bash scripts/verifier-migration-passions.sh` — 7 sections sur un PostgreSQL 16 réel, lancé par la CI à chaque commit |

⚠️ Le lot précédent (PR #231) avait livré une migration **non idempotente** que trois
relectures n'avaient pas vue. C'est pour ça que celle-ci est *exécutée* et pas seulement
relue.

---

## Chemin A — depuis un ordinateur (recommandé)

Le plus court, et le seul qui donne un vrai retour d'erreur.

1. Récupérer la **chaîne de connexion PostgreSQL** dans Supabase :
   *Project Settings → Database → Connection string → URI*.
   ⚠️ **Ne jamais la coller dans une conversation, un commit, ni un ticket** : elle
   contient le mot de passe de la base.

2. La poser en variable d'environnement, puis appliquer :

```bash
export DATABASE_URL='postgresql://…'          # jamais committé
psql "$DATABASE_URL" -f migrations/migration_passions_plat.sql
```

3. Vérifier — ces trois requêtes disent tout :

```sql
select count(*) from public.passions where status = 'active';           -- attendu : 1908
select count(*) from public.passion_relations;                          -- attendu : 3830
select count(*) from public.passions where source = 'legacy';           -- attendu : 19
```

4. Contrôle d'intégrité, le seul qui compte vraiment — **aucune publication orpheline** :

```sql
select count(*) from public.posts p
  left join public.passions x on x.id = p.passion_id
 where p.passion_id is not null and x.id is null;                       -- attendu : 0
```

## Chemin B — depuis le tableau de bord Supabase (téléphone)

*Project → SQL Editor → New query*, coller le contenu du fichier, **Run**.

⚠️ **486 Ko à coller.** C'est réalisable sur un ordinateur, pénible sur un téléphone.
Si le presse-papier ou l'éditeur lâche en cours de route, **ne pas recommencer à
moitié** : la transaction est atomique, un collage tronqué échoue en entier et ne
laisse rien derrière lui. Relancer du début.

## Chemin C — ce que je n'ai pas fait, et pourquoi

Un workflow GitHub `workflow_dispatch` qui appliquerait la migration avec un secret
`SUPABASE_DB_URL` serait le chemin le plus simple depuis un téléphone : ajouter le
secret une fois, puis un bouton dans l'onglet Actions.

**Je ne l'ai pas créé de moi-même.** Ce serait donner à la CI le pouvoir d'écrire la
structure de la base de production — un pouvoir qu'elle n'a pas aujourd'hui, et que
toute personne pouvant déclencher un workflow hériterait. C'est une décision de
sécurité, pas une commodité. Si tu le veux, dis-le : je l'écris avec une confirmation
tapée obligatoire, et il passera en contre-revue comme tout changement de `.github/`.

---

## Après l'application

1. **Vérifier que rien n'a bougé à l'écran.** Le drapeau est éteint : l'application doit
   se comporter exactement comme avant. Si quelque chose change, c'est un défaut.

2. **`estPassionCanonique` doit voir le référentiel étendu.** Son cache est à un seul
   coup, et une réponse tronquée par le plafond `max-rows` de PostgREST s'installerait
   pour toute la session. Le code traite la liste locale comme un **plancher**, jamais
   comme une autorité, ce qui borne le risque — mais c'est à revérifier ce jour-là.

3. **`user_passions` commence à se peupler.** `supaMiroirUserPassions` (app-08) écrit à
   côté de `profiles.passions`, qui **reste la source de vérité** — rien ne lit encore la
   table normalisée. Tant que la migration n'était pas passée, le miroir se désarmait
   silencieusement à la première erreur ; il s'activera de lui-même.

4. **Les demandes d'ajout deviennent traitables** : `npm run passions:demandes -- lister`.

## Retour arrière

Documenté en pied du fichier de migration. En résumé :

```sql
drop function if exists public.rechercher_passions(text, int);
drop table if exists public.passion_requests;
drop table if exists public.user_passions;
drop table if exists public.passion_relations;
update public.passions set status = 'archived' where source <> 'legacy';
```

⚠️ **`public.passions` n'est JAMAIS supprimée** : les 19 identifiants historiques y sont
référencés par clé étrangère depuis cinq tables. Le `delete` équivalent est documenté
mais annoté — il échoue en `23503` dès qu'une publication référence une passion ajoutée,
et c'est le comportement voulu.
