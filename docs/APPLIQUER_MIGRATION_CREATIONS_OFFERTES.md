# Appliquer « trois créations offertes » — un seul copier-coller

**État mesuré en production le 2026-09-09** — tout le reste est DÉJÀ en place :

| Lot | État en base |
|---|---|
| Pièces jointes de messagerie (partie A) | ✅ appliqué (`passio_media_read` retirée) |
| Rencontres — adresse / contact / participants privés | ✅ appliqué |
| Admission 18+ (fonctions, triggers, `access_policies`) | ✅ appliqué, interrupteur `irl_adult_only` = **false** |
| `creer_passion` (lot creation_passion_v1) | ✅ appliqué |
| **Plafond « 3 créations offertes »** | ❌ **reste à appliquer** |

## Le geste

1. Ouvrir le **SQL Editor** du projet Supabase.
2. Coller **tout** le contenu de `migrations/migration_passion_creations_offertes.sql`.
3. Exécuter.

C'est idempotent (`create or replace`) : le rejouer ne casse rien. Aucune donnée n'est touchée,
aucune table n'est créée — la fonction `creer_passion` est remplacée par la version qui plafonne
à trois créations à vie.

## Le contrôle, après

```sql
select
  has_function_privilege('anon','public.creer_passion(text,text)','EXECUTE')          as anon_doit_etre_false,
  has_function_privilege('authenticated','public.creer_passion(text,text)','EXECUTE') as authenticated_doit_etre_true,
  obj_description('public.creer_passion(text,text)'::regprocedure)                    as commentaire;
```

Le commentaire doit contenir « plafonne à 3 CRÉATIONS par compte ». Si `anon` ressort à `true`,
c'est le piège du 2026-09-08 : les privilèges par défaut du projet réaccordent `EXECUTE`
nominativement, et le `revoke … from public` ne les retire pas. Rejouer les trois lignes de
`revoke`/`grant` de la fin du fichier.

## Ce que ça change tout de suite

Un compte a déjà créé **trois** passions en production (`source = 'user_suggested'`). Il sera donc
**au plafond dès l'application** : sa prochaine tentative de création ouvrira `openPassionPaywall`
avec le motif `quota_creation` (« Trois créations offertes »), jamais un échec muet. C'est le
comportement voulu — trois créations À VIE, sans condition de statut : archiver ne rend pas un
droit de création.

## Retour arrière

Réappliquer `migrations/migration_creation_passion_utilisateur.sql` (la version 5/24 h + 30/compte).

## Ce qui reste, ensuite, et n'est PAS ce geste-ci

- **Allumer le 18+** : `update public.access_policies set enabled = true where key = 'irl_adult_only';`
  — geste SÉPARÉ, à ne faire qu'en connaissance de cause. Il n'y a que **2 lignes `user_safety`
  pour 6 comptes** : allumer coupe l'IRL à tous les comptes qui n'ont pas déclaré leur année.
- **Partie B du lot Storage** (passer le seau `attachments` en privé) : elle EXIGE un lot client
  d'URL signées. L'appliquer avant ferait disparaître toutes les pièces jointes.
