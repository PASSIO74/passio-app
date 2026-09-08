# Créer une passion depuis l'application — 2026-09-08

> « Rajoute la possibilité de créer une passion sur l'app, c'est le premier
> reproche de mes testeurs : chacun peut créer une catégorie passion. »
> — Benjamin, 2026-09-08

## Le défaut, en une phrase

Le référentiel plat compte **1 908 passions**, et la recherche du sélecteur les
trouve toutes. Mais quand elle ne trouvait **rien**, la seule issue était une
**DEMANDE** (`deposerDemande`, table `passion_requests`) : une entrée « en
vérification », **jamais publiable** — `estPassionCanonique` la refusait, et la
clé étrangère de `posts.passion_id` l'aurait refusée de toute façon. La porte
existait ; elle ne menait nulle part. C'est ce que les testeurs ont vu.

## Ce que le lot change

Le bouton du pied du sélecteur **crée** la passion : elle est écrite au
référentiel par le serveur, sélectionnée dans la foulée, et **publiable tout de
suite**. Le libellé du bouton dit lequel des deux gestes va se produire —
« Créer « X » » ou « Demander l'ajout de « X » » — parce que promettre l'un et
faire l'autre est le reproche d'origine, à l'envers.

Le sélecteur étant **le seul composant de choix de passion** (sept surfaces :
première visite, onboarding, « Mes passions », Fil, Profil, Studio, Rencontrer),
la porte s'ouvre partout d'un seul changement.

## L'écriture est SERVEUR, et le référentiel reste en lecture seule

⚠️ **Aucune policy INSERT n'a été ajoutée sur `public.passions`.** La création
passe par **une** fonction `SECURITY DEFINER`, `creer_passion(p_label, p_emoji)`
(`migrations/migration_creation_passion_utilisateur.sql`). Le client **ne choisit
que le NOM** :

| Ce que le client envoie | Ce que le serveur décide |
|---|---|
| `p_label`, `p_emoji` (facultatif) | `id` (dérivé du nom), `status`, `source='user_suggested'`, `popularity=0`, `normalized_label`, `created_by` |

Tenu **côté serveur**, donc intenable par un client modifié :

- **compte obligatoire** (`auth.uid()` non nul → sinon `auth_requise`) ;
- **dédoublonnage** sur `normalized_label` **et sur les alias** — « jogging »
  rend `running`, il n'en crée pas une variante ;
- **plafonds par personne** : 5 par 24 h, 30 au total ;
- **noms refusés** : moins de 2 caractères pliés, chiffres seuls, plus de six
  mots, adresses web et e-mail ;
- un nom **archivé** n'est pas ressuscité depuis le client (`nom_indisponible`).

La vérification ⑦ de `scripts/verifier-migration-creation-passion.sh` prouve
qu'après la migration un rôle `authenticated` ne peut toujours **ni insérer, ni
modifier, ni supprimer** une ligne de `passions`, et que `anon` ne peut pas
appeler la fonction.

## Les six pièges de ce dépôt, rencontrés ici

1. **`MY_UID` ne prouve pas qu'un compte existe.** `getMyUserId()` fabrique un
   `u_<aléatoire>` pour tout visiteur. `creationDisponible()` exige donc un vrai
   **uuid Supabase** — même leçon que la porte 18+ du 2026-09-08, qui partait
   appeler un RPC de production sous une identité inexistante.
2. **Créée puis invisible — deux fois.** Sans injection au référentiel **en
   mémoire**, la passion tout juste créée s'affichait « ✨ Passion »
   (`passionById` retombe sur le générique) et restait introuvable dans la
   recherche locale jusqu'au prochain démarrage. `injecterPassion` l'ajoute à
   l'index **et** à un petit registre `_creees`, consulté par `parId()` **même
   quand le référentiel n'a jamais été chargé** — c'est ce second cas que le
   verrou ① a trouvé.
   ⚠️ **Et ça ne suffisait toujours pas** : `data/passions-v1.json` est un
   **miroir généré au build**, donc une passion créée n'y sera jamais avant le
   prochain déploiement, et `_creees` ne vaut que pour la session qui l'a créée.
   Au rechargement — et pour **tous les autres comptes** — la bulle retombait sur
   le générique alors que la passion est publiable. `resoudreNomsManquants()`
   demande donc au serveur, en **une** requête plafonnée et **une seule fois par
   identifiant et par session**, les noms que le référentiel embarqué ne connaît
   pas ; puis il **invalide les trois caches et repeint**.
3. **Créée puis refusée.** `estPassionCanonique` (app-02) est la seule autorité
   de publication, et son cache serveur `_referentielPassions` est un cache **à
   un seul coup**. Y écrire aurait interdit le chargement du vrai référentiel
   pour toute la session : d'où un `Set` **séparé**, `_passionsCreees`, alimenté
   par `enregistrerPassionCanonique(id)`.
4. **Le repli ne ment pas.** Hors ligne, sans compte, ou tant que la migration
   n'est pas appliquée, on retombe sur la **demande** — et l'appelant l'apprend
   (`repli: "demande"`), pour le dire à l'écran. Le client fonctionne donc
   **avant comme après** la migration, comme `supaLoadEvents` avec ses deux
   listes de colonnes.
5. **Vie privée.** Le bouton porte un `data-tel` explicite
   (`passion_creation` / `passion_ajout_demande`) : sans lui, `telemetry.js`
   nomme le clic avec le `textContent` du bouton — **donc avec la recherche
   libre de la personne**. Aucun événement du lot ne transporte la frappe.
6. **La porte avant l'écriture.** `requireAuthentication("preferences")` est
   appelée **avant** de demander quoi que ce soit au serveur : on ne fait pas
   nommer sa passion à quelqu'un pour lui apprendre ensuite qu'il lui fallait un
   compte. `openModal` **remplace** la feuille ouverte — c'est voulu.

## ⚠️ Sur Supabase, `revoke ... from public` ne ferme rien (mesuré en prod)

Les privilèges par défaut du projet accordent `EXECUTE` à **`anon`** et
`authenticated` sur toute fonction créée dans `public`, et ces grants sont
**nominatifs**. Retirer le pseudo-rôle `PUBLIC` les laisse entiers : après la
première application, `proacl` portait bien `anon=X/postgres`.

La garde réelle n'a jamais bougé — la fonction refuse `auth.uid()` nul
(`auth_requise`) — mais la défense en profondeur annoncée n'existait pas. La
migration **révoque donc nommément** `anon`.

⚠️ **Le banc était vert par accident** : un PostgreSQL nu n'a pas cette règle de
privilèges par défaut, donc « la fonction est fermée à anon » passait sans rien
mesurer. Il pose désormais le grant **avant** d'appliquer la migration, et
vérifie `has_function_privilege('anon', …)` — éprouvé par réinjection (la ligne
`revoke … from anon` retirée fait rougir la vérification).

## Ce que le lot ne fait PAS, et qu'il faut savoir

- **Aucune modération.** La passion créée est `active` immédiatement et devient
  un terme de recherche pour tout le monde. Ce qui la borne aujourd'hui : compte
  obligatoire, plafonds par personne (5/24 h, 30), refus des adresses web, des
  chiffres seuls et des caractères de balisage, dédoublonnage strict. Une file de
  revue et un signalement de passion restent à faire — `created_by` est en place
  pour ça, et le retrait se fait déjà par `status='archived'`, que le client ne
  peut pas défaire (`nom_indisponible`).
- **Aucun renommage ni fusion depuis le client.** UPDATE et DELETE restent
  refusés à `authenticated`.

## Appliquer la migration

Le DDL ne passe ni par le SDK ni par la CI (ADR-012) :

```
psql "$DATABASE_URL" -f migrations/migration_creation_passion_utilisateur.sql
```

ou Tableau de bord Supabase → SQL Editor → coller le fichier → Run.

**Tant qu'elle n'est pas appliquée, rien ne casse** : `creer_passion` n'existe
pas, le client le constate une fois, cesse de demander pour la session, et le
bouton reprend son libellé « Demander l'ajout de « X » ».

Retour arrière :

```sql
drop function if exists public.creer_passion(text, text);
update public.passions set status='archived' where source='user_suggested';
```

## Verrous

- `scripts/verifier-migration-creation-passion.sh` — **exécute** la migration sur
  un PostgreSQL jetable : idempotence, refus sans compte, création réelle
  (publiable : la clé étrangère de `posts.passion_id` l'accepte), dédoublonnage
  par libellé **et par alias**, noms refusés, plafond par personne, référentiel
  toujours en lecture seule, retour arrière. Branché dans `.github/workflows/deploy.yml`.
- `tests/e2e/creation-passion.spec.js` (8) — le **client** : ce qu'il envoie, ce
  qu'il fait de la réponse, et ce qu'il fait quand le serveur n'est pas là.
