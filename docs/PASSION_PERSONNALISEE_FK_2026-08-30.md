# Passions personnalisées vs contrainte `posts.passion_id → passions`

- **Date** : 2026-08-30
- **Statut** : constat établi, **aucune sortie appliquée** — décision à prendre.
- **Gravité** : P1. Perte de données silencieuse, message trompeur, et atteinte à
  la synchronisation du profil public dans un cas.

## 1. Le parcours, et son atteignabilité

Entièrement atteignable depuis l'interface de production, en quatre gestes :

| # | Geste | Code | Effet |
|---|---|---|---|
| ① | « Créer une passion » | `openCreateCustomPassion` (app-02) | crée `{ id: "custom_<slug>_<4 car.>", custom: true }` dans `state.user.customPassions` — **local uniquement** |
| ② | — | `allPassions()` = `PASSIONS` + `customPassions` | la passion entre dans le catalogue du client |
| ③ | « + Ajouter » puis la tuile | `openCreateProfile` → `confirmCreateProfile` | la grille est bâtie sur `allPassions()` ; la tuile porte même une classe `passion-custom` et un badge « Perso » — sa présence est **voulue** |
| ④ | Studio → Publier | `renderStudio` → `#postPassion` → `publishPost` | `post.passion = "custom_…"` |

**Vérifié par test** : `tests/e2e/passion-personnalisee-fk.spec.js`.

## 2. La requête qui échoue

```
INSERT INTO posts (id, author_id, passion_id, …) VALUES (…, 'custom_tricot_ab12', …)
```

Rejetée par PostgreSQL :

```
23503 — insert or update on table "posts" violates foreign key constraint "posts_passion_fk"
Key (passion_id)=(custom_tricot_ab12) is not present in table "passions".
```

**Pourquoi c'est définitif** : la table `passions` n'expose qu'une policy
`passions_select_all` (SELECT). Aucun client ne peut y insérer la ligne manquante.
La contrainte est donc infranchissable côté application, pour toujours.

**La contrainte est bien en production.** `migrations/migration_passions_referentiel.sql`
porte encore l'en-tête « ⚠️ PRÉPARÉE, NON APPLIQUÉE », mais cet en-tête est
**périmé** : `migrations/SCHEMA_PROD_REFERENCE.sql`, généré par
`scripts/schema-baseline.js` depuis la vraie base le 2026-08-17 et marqué « décrit
ce qui EST », liste les cinq contraintes (`posts`, `stories`, `events`,
`conversations`, `profiles`). Elle a donc été appliquée entre le 15 et le 17 août.

## 3. Ce que voit l'utilisateur

`supaPublishPostWithRetry` réessaie deux fois — inutilement, l'erreur étant
permanente — puis rend `false`. `publishPost` affiche alors :

> ⏱️ **Post en local (connexion lente)**

Le message accuse le **réseau** pour une erreur de **données**. Conséquences :

- l'utilisateur croit à un incident passager et réessaiera ; ça ne marchera jamais ;
- le post reste dans `state.userPosts`, **invisible de tous les autres comptes** ;
- rien ne rejoue cet insert plus tard : il n'y a pas de file d'attente pour les posts ;
- le post **disparaît** au changement d'appareil (il ne vit que dans le stockage local).

## 4. Portée plus large : le profil public

`profiles.profiles_passion_fk` référence la **même** table. `supaUpsertProfile`
publie `passion_id` = première passion vivante du compte. Si cette passion est
personnalisée — le cas d'un compte dont c'est la seule passion — **tout l'upsert
du profil est rejeté** : pseudo, avatar, bio et liste de passions n'atteignent
plus personne. La boucle de repli de `supaUpsertProfile` ne rattrape que les
colonnes absentes, pas une violation de clé étrangère.

Vérifié par test (`le profil PUBLIC est atteint aussi…`).

## 5. Données existantes

**Non vérifiable depuis cette session** : le connecteur `supabase-passio-readonly`
n'est pas authentifié ici. Ce qu'on peut établir sans interroger la base :

- la migration a vérifié, le 2026-08-15, les valeurs réellement présentes en prod :
  `art, cuisine, mode, moto, musique, photo, podcast, tech, voyage, yoga` — dix
  valeurs, toutes canoniques, **aucun orphelin** ;
- depuis l'application de la FK (~17 août), **aucune ligne `custom_…` n'a pu
  entrer** dans `posts`, `stories`, `events`, `conversations` ni `profiles` : elle
  serait rejetée.

**Conclusion prudente** : les tables serveur sont vraisemblablement saines. Ce qui
a pu être perdu, ce sont les **publications locales** de comptes ayant créé une
passion personnalisée depuis le 17 août — invisibles côté serveur, par
construction. Une requête à confirmer avec les secrets :

```sql
select 'posts' t, count(*) from posts where passion_id like 'custom\_%' escape '\'
union all select 'profiles', count(*) from profiles where passion_id like 'custom\_%' escape '\'
union all select 'stories',  count(*) from stories  where passion_id like 'custom\_%' escape '\';
-- attendu : 0 partout (la FK l'impose depuis le 2026-08-17)
```

---

# Les deux sorties

## Sortie A — désactiver la publication dans une passion personnalisée

**Principe** : ne plus proposer ce qui ne peut pas aboutir.

- une passion `custom: true` n'apparaît plus dans la grille de `openCreateProfile`
  (elle reste dans l'Explorateur comme centre d'intérêt du fil, ce qui fonctionne :
  le filtre de lecture est 100 % local) ;
- si un compte en possède déjà une comme profil, `renderStudio` l'exclut du
  `<select>` et l'écran l'explique en une ligne ;
- le message d'échec de `publishPost` distingue le code `23503` du réseau.

**Coût** : petit, entièrement côté client, aucune migration, réversible.
**Ce qu'on perd** : la promesse « crée ta propre passion » devient une promesse de
rangement personnel seulement — ce que le correctif de vocabulaire du 2026-08-30
annonce déjà (« rien que pour toi […] n'entre pas dans le catalogue commun »).
**Risque** : aucun sur les données. C'est la sortie sûre.

## Sortie B — migration : les passions personnalisées deviennent réelles

**Principe** : permettre à un compte d'ajouter une ligne dans `passions`.

```sql
-- 1. Provenance et propriété, pour pouvoir modérer et distinguer le canon du perso.
alter table public.passions add column if not exists created_by text;
alter table public.passions add column if not exists is_custom boolean not null default false;
create index if not exists passions_created_by_idx on public.passions (created_by);

-- 2. Écriture cliente, bornée.
create policy passions_insert_own on public.passions
  for insert to authenticated
  with check (
    is_custom = true
    and created_by = (auth.uid())::text
    and id like 'custom\_%'          -- l'espace de noms canonique reste fermé
    and length(id) between 8 and 64
    and length(label) between 1 and 40
    and length(emoji) between 1 and 8
  );

-- 3. Ni modification ni suppression : une passion référencée par des posts ne
--    doit pas pouvoir être renommée sous eux, ni disparaître (la FK le bloquerait
--    de toute façon, mais autant ne pas exposer le chemin).
--    → AUCUNE policy UPDATE, AUCUNE policy DELETE.

-- 4. Quota, pour que la table ne devienne pas une décharge.
create or replace function public.passions_quota() returns trigger
language plpgsql security definer as $$
begin
  if (select count(*) from public.passions
      where created_by = (auth.uid())::text) >= 10 then
    raise exception 'quota de passions personnalisées atteint';
  end if;
  return new;
end $$;
create trigger passions_quota_trg before insert on public.passions
  for each row when (new.is_custom) execute function public.passions_quota();
```

**Conséquences RLS à assumer, explicitement :**

1. `passions_select_all` est **globale** : toute passion créée par quiconque
   devient **visible de tous**. Une passion personnalisée cesse donc d'être privée
   — son libellé est public, écrit par un utilisateur. C'est une **surface de
   modération neuve** (noms injurieux, usurpations, spam).
2. Le libellé et l'emoji deviennent du **contenu utilisateur affiché chez autrui** :
   ils doivent passer par `escapeHtml` partout (déjà le cas dans les surfaces
   corrigées le 2026-08-30, à re-vérifier ailleurs).
3. Le référentiel devient **modifiable en écriture par des comptes** : c'est un
   assouplissement de la frontière de confiance d'ADR-003. Un nouvel ADR est requis.
4. Sans policy UPDATE/DELETE, **personne ne peut nettoyer** depuis le client — la
   modération passe par `service_role`, donc par un outil serveur qui n'existe pas
   encore.

**Compatibilité :**
- les clients existants continuent de fonctionner : ils ne lisent que `id`, `emoji`,
  `label`, `color` ;
- côté application, il faut **insérer la ligne `passions` AVANT** de créer le profil
  et de publier, et traiter l'échec de cette insertion (quota, doublon `23505`) ;
- les passions personnalisées déjà présentes **en local** chez des utilisateurs
  devraient être remontées à la première occasion, sinon elles resteront
  impubliables ;
- rien à rétro-migrer côté serveur : il n'y a pas de ligne `custom_…` (cf. §5).

**Coût** : migration + policy + trigger + reprise applicative + une réponse à la
question de modération. Ce n'est pas un correctif, c'est une fonctionnalité.

---

## Recommandation

**A maintenant, B seulement si le produit veut vraiment des passions publiques
créées par les utilisateurs.** A ferme une perte de données en cours avec un
changement local et réversible ; B ouvre une surface de modération qu'aucun outil
ne couvre aujourd'hui, et demande son propre ADR.

Aucune des deux n'est appliquée : la décision revient à Benjamin.
