# 25 — Les passions du fil sont celles du compte (2026-09-18)

## Le rapport

Deux captures de Benjamin, prises à la même minute sur son téléphone :

- **le Fil** : rail « Suivis · Metallerie · Course à pied · Wakeboard · Ski freestyle · … » (la
  rangée déborde, il y en a d'autres à droite) ;
- **le Profil** : « 3 PASSIONS », rail « Metallerie · Course à pied · Wakeboard ».

« Il y a un problème d'affichage des passions entre le feed et le profil, pas le même nombre. »

## La mesure (canal ① d'ADR-012, lecture seule)

```sql
select u.email,
  (select jsonb_agg(jsonb_build_object('passion', p->>'passion', 'archived', p->'archived', 'parDefaut', p->'_parDefaut'))
     from jsonb_array_elements(s.data->'user'->'profiles') p) as profils,
  s.data->'selectedFeedPassions' as selected_feed_passions
from auth.users u join public.user_state s on s.user_id = u.id::text
where u.email = 'passioadmin@gmail.com';
```

| | Contenu |
|---|---|
| `user.profiles` vivantes | `metallerie`, `running`, `glisse-wakeboard` (+ `musique` archivée, `_parDefaut: true`) |
| `selectedFeedPassions` | `glisse-ski-freestyle`, `sport`, `cuisine`, `photo`, `metallerie`, `running`, `glisse-wakeboard` |

Sept intérêts de fil pour trois passions possédées. Les quatre de trop sont, dans cet ordre, les
choix d'une **exploration sans compte** : `migrerPreferences` (js/first-run.js) les a migrés dans
le compte neuf comme **intérêts** (`setFeedPassions`), jamais comme passions ; le compte a ensuite
ajouté ses trois passions dans « Mes passions » (`ajouterPassionAuCompte` → `ajouterPassionAuFil`,
qui **ajoute** sans jamais retrancher), et le Fil a empilé les deux.

## Pourquoi le rail du Fil les peignait

`renderProfileStrip` (app-06) **complétait** les passions vivantes par les intérêts actifs sans
profil (`_interet_<id>`, `_interetSeul: true`). C'était un remède du 2026-08-30 : l'onboarding V2
posait jusqu'à sept intérêts et ne créait qu'UN profil, donc six passions décidaient du contenu
du fil sans aucune bulle pour les voir ni les décocher. Le remède était juste pour ce défaut-là —
et il est devenu la surface même du défaut d'aujourd'hui : tout intérêt orphelin devient une
bulle, et le Fil compte toujours plus que le Profil.

## La règle

Elle est écrite dans le dépôt depuis le 2026-09-01 (`js/passions-flat-ui.js`, § ②) : *« le rail
du Fil reste une commande de LECTURE — on y coche et décoche ce qu'on possède ; on acquiert au
Profil. »* Elle n'était tenue nulle part. Trois points d'écriture des intérêts la contredisaient :

1. `migrerPreferences` — les choix du visiteur entraient comme intérêts, pas comme passions ;
2. `onbFinish` (V2) — UN profil, jusqu'à SEPT intérêts (spec §6 d'avant ADR-011 et d'avant le
   plafond du 2026-09-02) ;
3. `renderProfileStrip` — le complément `_interet_…`.

## Le correctif

**Une seule borne, au seul point d'écriture.** `setFeedPassions` (app-02) ne garde, pour un compte
qui possède des passions, que les identifiants de `passionsPossedeesIds()` — vivantes, hors
`_parDefaut`. Le discriminant `interetsBornesAuCompte()` = `comptePassioReel()` **et** au moins
une passion possédée. `restoreFeedPassions` y passe au démarrage et **persiste** si la borne a
retiré quelque chose, donc le blob `user_state` de production s'assainit au premier rendu et se
propage aux autres appareils. `_repriseUserState` (rejeu d'une lecture réseau) rappelle
`restoreFeedPassions` — sans ça un blob rejoué laissait le Set runtime d'avant.

**Le rail n'ajoute rien pour un compte.** Le complément `_interet_…` de `renderProfileStrip` ne
vaut plus que hors compte. Les deux rails comptent les mêmes bulles par construction, et le verrou
③ pollue le Set **en dehors** de l'autorité pour le prouver.

**Les choix du visiteur deviennent les passions du compte qu'il crée.**
`attacherPassionsAuCompte` (first-run.js) passe par `ajouterPassionAuCompte`, le SEUL moteur
d'ajout (plafond, doublon, Fil, sauvegarde, synchronisation). Les places se mesurent **avant**
chaque appel : au plafond, le moteur ouvre la fenêtre payante, et un mur posé sur un geste
automatique n'est pas une sortie. Le profil de remplissage de `boot()` (« Musique »,
`_parDefaut`) **cède la place** — laissé là, il prenait l'une des trois places offertes. Au-delà
du plafond, un toast dit ce qui a été gardé (un refus qui ne se prononce pas est indiscernable
d'une panne). La passion de départ du Studio est le **premier** choix, pas le dernier attaché.

**L'onboarding V2 crée une passion par choix**, bornée à `onbMaxPassions()`, qui suit désormais
`PASSIONS_OFFERTES` (lu paresseusement : app-06 charge après app-02 ; plafond coupé = les sept de
la spec). Laisser cocher sept pour n'en garder que trois serait un mensonge d'interface.

**Au passage** : `deleteProfile` retirait la passion des filtres du Profil mais pas du Fil — même
famille qu'`archiverPassion` avant le 2026-08-30.

## Ce qui ne change pas

- **Un visiteur n'est pas borné.** Il n'a pas de compte ; ses intérêts (`appliquerPrefs`) SONT ses
  passions du moment, et le rail les peint sans profil comme avant. Le discriminant est
  `comptePassioReel()`, jamais `state.user.profiles.length` seul : un visiteur peut avoir ajouté
  une passion au Profil, et sa recherche de première visite aurait continué de lui être jetée.
- « Suivis », les envies (filtre, jamais source), `toggleProfileFilter` (décocher une passion
  possédée la laisse dans le rail, grisée), `archiverPassion` / `restaurerPassion`.
- Rien en base : ni policy, ni colonne. Le blob s'assainit côté client.

## Verrous

`tests/e2e/fil-passions-du-compte.spec.js` (10) :

| Cas | Ce qu'il mesure |
|---|---|
| ① / ① bis | l'état EXACT de la capture (transposé sur le socle embarqué : « metallerie » est une passion créée en production, absente du référentiel livré) → trois bulles de chaque côté, et l'assainissement est persisté |
| ② / ② bis | la borne dans `setFeedPassions` ; décocher / recocher une possédée reste possible |
| ③ | le rail avec un Set pollué HORS de l'autorité : aucune bulle fantôme |
| ④ | le visiteur garde ses intérêts libres et leurs bulles |
| ⑤ / ⑤ bis | la migration : plafond, remplissage qui cède, passion de départ, les deux rails égaux |
| ⑥ | l'onboarding V2 : une passion par choix, porte et borne |
| ⑦ | le câblage à la SOURCE (borne, rejeu, rail, migration par le moteur unique) |

Suites réécrites : `onboarding-v2` (« un seul profil » → une par choix), `onboarding-acceptation`
ONB-02/ONB-03, `onboarding-passions-v2` §4, `multi-passion-audit-restant` ③/③ bis (le cas « UNE
créée, TROIS en intérêts » n'existe plus ; les bulles d'intérêt ne survivent que chez un
visiteur), `first-run` (fixture ramené à trois intérêts : un quatrième butait sur le plafond,
hors sujet de ces cas).

## Points ouverts, délibérément

- **Un compte existant à zéro passion et des intérêts orphelins** (l'état de `passioadmin` avant
  « Mes passions ») garde ses intérêts jusqu'à sa première passion ; à ce moment le Fil se réduit
  aux passions possédées. C'est la borne qui joue, pas une migration rétroactive : attacher
  d'office des intérêts anciens à un compte, hors du geste de migration (qui attend le verdict
  d'hydratation), poserait des passions sur une cause supposée.
- `nbPassionsVivantes()` compte le profil de remplissage `_parDefaut` tant qu'il est vivant : un
  compte neuf qui n'est pas passé par l'exploration voit « Musique » occuper une place sur trois
  jusqu'à l'archiver. Antérieur à ce lot, hors de son périmètre ; nommé ici pour ne pas être
  redécouvert.
