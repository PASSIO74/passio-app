# Lot TAXO-1 — catalogue hiérarchique des passions et spécialités

- **Date** : 2026-08-31
- **Drapeau** : `passion_taxonomy_v1` — **éteint par défaut**
- **Statut** : aperçu, en attente de validation visuelle et de contre-revue.
  **La migration n'est pas appliquée en production.**

---

## 1. Le modèle en une phrase

> Une identité publique unique, plusieurs passions — et, facultativement, des
> spécialités à l'intérieur de chaque passion.

Rien de ce lot ne crée d'identité. ADR-010 §1–§7 tient entièrement : le pseudo,
l'avatar, la bio, les abonnés et **toutes** les interactions appartiennent à
l'unique ligne `profiles` du compte. Une passion classe et filtre ; une
spécialité affine un classement. **Il n'y a ni profil par passion, ni — surtout —
profil par spécialité.**

Trois niveaux :

| Niveau | Rôle | Écrit où ? | Visible où ? |
|---|---|---|---|
| **Univers** (10) | naviguer dans le catalogue | `passion_universes` seulement | **nulle part ailleurs** — ni identité, ni carte, ni publication |
| **Passion** (42) | le seul niveau sélectionnable | `posts/stories/events/conversations/profiles.passion_id` | rails, cartes, identité |
| **Spécialité** (790) | facultative, une seule passion propriétaire | `*.specialty_id` (nullable) | « Affiner », carte `Passion · Spécialité` |

---

## 2. Chiffres exacts

| | |
|---|---|
| Univers | **10** |
| Passions principales | **42** (dont les **19 canoniques**, et **20** marquées « populaires ») |
| Spécialités | **790** |
| Synonymes de recherche | **629** |
| Entrées de l'index de recherche | **832** |

`npm run valider:catalogue` les vérifie, et échoue hors des bornes produit
(8–10 univers, 35–45 passions, 600–1000 spécialités).

---

## 3. Compatibilité — ce qui ne bouge pas

- **Les 19 identifiants canoniques sont intouchés**, avec leur libellé, leur
  emoji et leur couleur d'origine. Cinq tables de production les référencent par
  clé étrangère : le validateur refuse tout catalogue où l'un d'eux manque ou
  change. Un test e2e recopie la table attendue plutôt que de lire `app-01`,
  pour qu'une modification d'`app-01` fasse **rougir** au lieu de se réaligner.
- **`PASSIONS` (app-01) reste à 19.** C'est le socle embarqué d'ADR-010 : le
  serveur AJOUTE, il ne retranche pas. Les 23 passions nouvelles deviennent donc
  publiables **le jour où la migration est appliquée**, automatiquement, par le
  chemin existant `chargerReferentielPassions()`. Aucun code client à changer.
- **`profiles.passions` (jsonb) n'est ni supprimée ni remplacée.** Elle reste la
  vitrine publique et la sauvegarde relue au démarrage d'un appareil neuf. Les
  nouvelles tables la doublent le temps de la transition ; laquelle fait autorité
  sera tranché par un lot ultérieur.
- **`specialty_id` naît `null` partout.** Aucune publication, story, activité,
  conversation ou passion utilisateur existante n'est modifiée.
- **Les passions personnalisées auto-approuvées restent fermées.** « Je ne trouve
  pas ma passion » dépose une ligne `passion_requests` en statut `pending` ;
  aucun chemin ne la promeut en passion canonique.

---

## 4. Modèle de données

```
passion_universes (id, emoji, label, sort_order, is_active)
        ▲
        │ universe_id
passions (id, emoji, label, color, sort_order, universe_id, synonyms, popular, is_active)
        ▲                                   ← table EXISTANTE, étendue
        │ passion_id
passion_specialties (id, passion_id, label, synonyms, sort_order, is_active)
        │   unique (id, passion_id)          ← cible des clés composites
        │
        ├── user_passions               (user_id, passion_id, sort_order, archived)
        ├── user_passion_specialties    (user_id, specialty_id, passion_id)
        └── posts | stories | events    (… , passion_id, specialty_id)
passion_requests (id, user_id, label, note, status, created_at)
```

### L'appartenance est vérifiée PAR LA BASE

Deux contraintes, pas une validation JavaScript :

```sql
foreign key (specialty_id, passion_id)
  references passion_specialties (id, passion_id)     -- la paire, ensemble
check (specialty_id is null or passion_id is not null) -- ferme le match simple
```

⚠️ **Le `check` n'est pas décoratif.** En `match simple` — le défaut — une clé
étrangère composite dont **une** colonne est nulle est réputée satisfaite *sans
vérification*. Une ligne `specialty_id = 'moto-enduro'`, `passion_id = null`
passerait donc la clé étrangère seule.

### RLS

| Table | Politique |
|---|---|
| `passion_universes`, `passions`, `passion_specialties` | `select` pour tous, **aucune** policy d'écriture → `anon` et `authenticated` refusés |
| `user_passions`, `user_passion_specialties` | `select/insert/update/delete` ancrés sur `user_id = (select auth.uid())::text` |
| `passion_requests` | `select` et `insert` sur les siennes uniquement ; ni `update` ni `delete` — le statut n'appartient pas au demandeur |

⚠️ **La lecture des sélections est volontairement limitée à soi.** Les passions
d'un tiers restent servies par `profiles.passions`, déjà soumise aux règles de
visibilité du profil (compte privé, blocage). Ouvrir `user_passions` en
`using (true)` court-circuiterait ces règles : un compte privé y verrait ses
centres d'intérêt exposés. À rouvrir seulement avec une policy qui **rejoue** la
visibilité de `profiles`.

⚠️ `(select auth.uid())` et non `auth.uid()` : la forme non enveloppée est
réévaluée par ligne (initplan), ce que `migration_rls_initplan_*` a déjà corrigé
ailleurs dans ce dépôt.

---

## 5. Migration et retour arrière

`migrations/migration_passion_taxonomy.sql` — **fichier généré**, miroir de
`js/passion-catalog.js`.

```bash
npm run generer:catalogue   # régénère le SQL depuis le catalogue
npm run valider:catalogue   # échoue si les deux divergent
```

- **Additive** — aucune colonne, ligne ou contrainte existante n'est supprimée
  ni renommée.
- **Idempotente** — `create … if not exists`, `add column if not exists`,
  `insert … on conflict do update`, `drop policy if exists`. La rejouer n'a
  aucun effet observable.
- **Réversible** — bloc de retour arrière complet en fin de fichier. Comme
  `specialty_id` vaut `null` partout tant que le lot n'a pas tourné en
  production, **aucune donnée de contenu n'est perdue** au rollback.

Le seul geste que le rollback ne rend pas : le `sort_order` d'origine des 19
canoniques. Rejouer `migrations/migration_passions_referentiel.sql` le fait.

---

## 6. Activation

```
?passion_taxonomy_v1=1                  → active, et mémorise
?passio_preview=passion-taxonomy-v1     → alias
?passion_taxonomy_v1=0                  → coupe et oublie
localStorage.passion_taxonomy_v1 = "1"  → activation persistante
localStorage.passion_taxonomy_v1 = "0"  → kill switch
window.PASSIO_TAXONOMY = true | false   → prioritaire, en mémoire
```

⚠️ **Écart assumé avec les lots UI-\*.** Ceux-là n'écrivent jamais de valeur
positive dans `localStorage` : ils sont actifs par défaut, le drapeau ne sait
qu'enlever, et un aperçu volatil ne coûte rien. Ici c'est l'inverse — le lot est
éteint par défaut et doit être essayé sur un téléphone, où le premier geste après
avoir ouvert un lien est de recharger. Un aperçu volatil aurait été inessayable.

**Ce que la coupure rend :** tout. Aucun nœud historique n'est retiré du DOM
(uniquement masqué par la classe racine `passio-taxo-v1`), `renderPassionGrid`
est enveloppée et non remplacée, `specialiteAPublier()` rend `null` et
`postPasseAffinage()` rend `true`.

---

## 7. Pièges de ce lot

① **`renderProfileStrip` réécrit `#profileStrip` en ENTIER**, cache `_lastHtml`
compris. Le panneau « Affiner » est donc monté en **frère** du rail, jamais
dedans — et le rail ne reçoit aucune spécialité, ce que la spécification
interdit de toute façon.

② **L'affinage RESSERRE, il n'ajoute pas une famille de critères.** Le prédicat
ne s'applique qu'à la branche « passion » de l'union additive d'ADR-011 §1 : une
publication entrée par « Suivis » ou par une envie n'est jamais écartée par une
spécialité cochée ailleurs. Sinon cocher une spécialité **viderait** le fil.

③ **Un contenu sans spécialité passe toujours.** C'est la totalité de l'existant.
Refuser le non-classé aurait vidé le fil le jour de la bascule.

④ **La pastille « Passion · Spécialité », ou RIEN.** Jamais un `<span>` rendu
sans condition : la classe porte `padding`, `border` et un fond opaque, et le
défaut #198 (2026-08-29) avait ainsi mis une capsule creuse de 20 × 8 px sur
toutes les publications venues de Supabase.

⑤ **`specialty_id: undefined`, pas `null`.** PostgREST ignore une clé absente ;
un `null` explicite écrirait la colonne — et **tant que la migration n'a pas
tourné, elle n'existe pas** : l'insert entier échouerait en PGRST204. Le lot ne
doit jamais casser une publication hors de son périmètre.

⑥ **`#fieldPassion` est REPLIÉ par le lot UI-6** derrière « Passio : … ·
Changer ». La spécialité y est montée : elle suit le même repli. C'est voulu —
passion et spécialité sont un seul choix, les séparer les ferait diverger à
l'écran. Corollaire de test : il faut ouvrir le champ par le **vrai** bouton.

⑦ **Aucun `onclick` inline.** Délégation par `data-taxo-act` : rien à relire pour
`audit:handlers`, aucune chaîne à échapper pour `audit:echappement`, et pas de
`escapeJsArg` à oublier.

⑧ **`state` vaut `null`, pas `undefined`**, et le module écoute
`passio:app-ready` **en remettant ses compteurs à zéro** — en production le bloc
app n'est injecté qu'après le code d'accès, et un budget de reprise consommé
pendant la saisie ne se reconstitue pas seul. Jamais de `requestAnimationFrame`.

⑨ **`styles.css` est en CRLF**, et le bloc « PASSIO UI V4 — lot UI-4A5 » doit
rester le DERNIER du fichier. Le bloc TAXO-1 est donc posé juste avant lui ; les
deux familles de sélecteurs sont disjointes, rien ne se recouvre.

---

## 8. Limites connues

1. **La migration n'est pas appliquée.** Tant qu'elle ne l'est pas :
   - les 23 passions nouvelles **ne sont pas publiables** — le socle embarqué
     `PASSIONS` en compte 19 et le serveur ne sert que celles-là. Le Studio ne
     les propose donc pas, et `requiredCanonicalPassion` refuse **avant** toute
     requête : aucune publication n'est perdue, mais choisir « Sports de combat »
     comme centre d'intérêt donne un filtre sans contenu ;
   - `user_passions`, `user_passion_specialties` et `passion_requests`
     n'existent pas : les écritures échouent, sont journalisées par `diagLog` et
     **la source de vérité reste locale** (`state.user`) ;
   - `specialty_id` n'est pas renvoyé par `supaLoadPosts` — ce n'est
     volontairement **pas** ajouté au `.select()`, qui partirait en 400 sur une
     colonne inconnue et casserait le fil entier. Conséquence : l'affinage
     n'agit aujourd'hui que sur les publications locales.
2. **Les activités (IRL) n'ont pas encore de panneau « Affiner ».** La colonne
   `events.specialty_id` et sa contrainte sont posées par la migration ; l'écran
   « Rencontrer » reste sur ses passions principales.
3. **Aucune interface d'administration** des `passion_requests`. Elles se lisent
   en SQL. Un lot ultérieur décidera de la boucle de retour au demandeur.
4. **Les stories** portent la colonne mais aucun choix de spécialité ne leur est
   proposé — une story éphémère vaut d'être publiée sans classement fin.
