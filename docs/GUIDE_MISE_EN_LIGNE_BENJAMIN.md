# Guide des manipulations — ce que toi seul peux faire

Écrit le 2026-09-08. Ce fichier ne décrit **que** les gestes qu'aucun outil ne peut faire à
ta place. Tout le reste est déjà fait, testé et poussé.

Trois raisons pour lesquelles ces gestes te reviennent :

- **Approuver une pull request** : la CI exige une revue de ton compte GitHub dès qu'une
  migration est touchée. Personne d'autre ne peut la poser.
- **Appliquer une migration** : la CI n'a pas le droit de modifier la structure de la base
  (ADR-012, canal ③). Ça passe par `psql` ou l'éditeur SQL de Supabase.
- **Allumer une règle produit** : c'est une décision, pas une opération.

---

## Avant de commencer — les deux règles à ne jamais enfreindre

1. **Ne jamais appliquer une migration sans avoir lancé son préflight avant, ni ses
   contrôles après.** Le préflight dit ce qui va casser ; les contrôles disent ce qui est
   réellement en place. Une migration qui affiche « Success » ne prouve rien.
2. **Ne jamais supprimer une ligne de `access_policies` pour « éteindre » une règle.** Ligne
   absente vaut règle **exigée**. Pour éteindre, on met `enabled = FALSE`.

Récupérer la chaîne de connexion : Supabase → *Project Settings → Database → Connection
string → URI*. ⚠️ **Elle contient le mot de passe de la base. Ne la colle jamais dans une
conversation, un commit ou un ticket.** Pose-la en variable d'environnement :

```bash
export DATABASE_URL='postgresql://…'
```

---

## Manip 1 — Ouvrir la pull request et l'approuver

La branche `claude/passio-admission-fondation-sit9z8` porte quatre commits, testés, dont
deux migrations.

1. Ouvre https://github.com/PASSIO74/passio-app/compare/main...claude/passio-admission-fondation-sit9z8
   et clique **Create pull request**.
2. Attends la CI. Le job « Gouvernance critique » va **échouer** : c'est normal et voulu,
   la branche touche `migrations/` et `.github/`.
3. Pour le débloquer : onglet **Files changed** → **Review changes** → coche **Approve**, et
   écris dans le commentaire une phrase contenant exactement :

   ```
   Contre-revue technique indépendante
   ```

   Le marqueur est vérifié à la lettre, et il est **ancré au commit courant** : si tu
   pousses ensuite un nouveau commit, il faut réapprouver.

⚠️ Fusionner déclenche le déploiement en production. À ce stade, la fusion ne met en ligne
que **du code client inerte** : les deux migrations ne sont pas appliquées, donc rien ne
change pour personne. C'est délibéré.

---

## Manip 2 — Cloisonner la lecture des pièces jointes (le plus urgent)

**Ce que ça répare.** Aujourd'hui, n'importe qui — sans compte — peut lister et lire toutes
les photos, fichiers et messages vocaux échangés dans les conversations privées.

**Ce que ça ne casse pas.** Rien. L'application affiche les pièces jointes par une route qui
ne consulte pas ces règles tant que le compartiment reste public. Tu peux appliquer ceci
avant même de fusionner la pull request.

```bash
psql "$DATABASE_URL" -f migrations/migration_storage_lecture_cloisonnee.sql
```

**Vérifier** — cette requête doit rendre **deux** lignes, et aucune nommée
`passio_media_read` :

```sql
SELECT policyname, cmd, roles::text
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'SELECT';
```

Attendu : `passio_content_read` (rôle public) et `passio_attachments_read_membre`
(rôle authenticated).

⚠️ **Ce n'est pas le correctif complet.** Détenir l'URL exacte d'une pièce jointe permet
encore de la lire. Le correctif complet demande de passer le compartiment en privé et de
faire signer les URL par l'application : c'est un lot à part, décrit en pied du fichier de
migration. **Ne lance pas la « PARTIE B » tant que ce lot n'est pas fait** — les pièces
jointes disparaîtraient pour tout le monde.

---

## Manip 3 — Poser la fondation de l'accès 18+

**Ce que ça installe.** Les règles serveur qui réservent l'organisation d'une rencontre,
l'inscription et la conversation de groupe aux comptes majeurs — **plus un interrupteur,
éteint**. Tant qu'il est éteint, rien ne change pour personne.

**① Préflight** (éditeur SQL Supabase, lecture seule). Colle le contenu de
`migrations/preflight_admission_18_plus.sql`. Aucune ligne `BLOQUANT` attendue.

Regarde la section **« 3. effet de l'allumage »** : elle dit combien de comptes perdront
l'accès aux rencontres le jour où tu allumeras. Au 8 septembre : 4 comptes sur 6.

**② Appliquer**

```bash
psql "$DATABASE_URL" -f migrations/migration_admission_18_plus.sql
```

**③ Contrôler.** Colle `migrations/controles_post_admission_18_plus.sql`. **Toutes les lignes
doivent être `OK`**, plus une ligne `INFO` disant `irl_adult_only = eteint`.
**Un seul `ECHEC` = ne pas continuer.**

---

## Manip 4 — Allumer l'accès 18+, dans cet ordre et pas un autre

⚠️ **L'ordre n'est pas négociable.** Allumer avant que le code client soit en ligne couperait
les rencontres à **tout le monde**, y compris aux comptes majeurs : ils ont leur année de
naissance en local et aucune ligne côté serveur.

1. Manip 3 faite, contrôles verts.
2. Pull request fusionnée et job « Déploiement production » **vert**.
3. Ouvre l'application, connecte-toi, laisse-la charger une fois. Ton année part au serveur
   toute seule.
4. Vérifie que c'est le cas :

   ```sql
   SELECT count(*) FROM public.user_safety WHERE majority_at IS NOT NULL;
   ```

   Ce nombre doit avoir augmenté. Fais passer chaque compte de la bêta une fois dans
   l'application avant l'étape suivante.
5. **Alors seulement**, allume :

   ```sql
   UPDATE public.access_policies
      SET enabled = TRUE, updated_at = NOW()
    WHERE key = 'irl_adult_only';
   ```

6. Rejoue les contrôles de la Manip 3 : la ligne `INFO` doit maintenant dire `ALLUME`.

**Éteindre**, si quoi que ce soit se passe mal :

```sql
UPDATE public.access_policies
   SET enabled = FALSE, updated_at = NOW()
 WHERE key = 'irl_adult_only';
```

L'effet est immédiat, sans redéploiement. C'est le premier interrupteur du projet qui
s'actionne à distance.

---

## Ce qui reste, et qui ne dépend pas de moi

Ces points bloquent une commercialisation à grande échelle et **aucun n'est un problème de
code** :

| point | ce qu'il faut | qui |
|---|---|---|
| Conditions générales, mentions légales | un texte validé juridiquement | un juriste |
| Modération des signalements | quelqu'un qui les traite, sous 24 h | toi |
| Restauration des sauvegardes | l'exercer pour de vrai, une fois | toi |
| Capacité | mesurer avant d'ouvrir en grand | mesurable, mais coûte un test de charge |
| Appareils réels | tester sur de vrais téléphones | toi |

Tant qu'ils tiennent, le verdict de l'audit tient aussi : **bêta privée fermée**, avec des
gens que tu choisis. C'est atteignable en quelques jours. Une ouverture publique, non.
