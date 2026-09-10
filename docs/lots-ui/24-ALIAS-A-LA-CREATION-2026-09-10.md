# Alias à la création d'une passion (2026-09-10)

> Une passion créée depuis l'application n'était atteignable que par son
> orthographe exacte. « GRS » existe en production depuis le 2026-09-09, et
> reste introuvable en tapant « gymnastique rythmique ».

## Comment on l'a su

Pas par un rapport : **en vérifiant le résultat d'un autre lot.**

Le rattrapage du 2026-09-10 avait porté le référentiel à 3 674 alias, plus une
seule des 2 088 passions curées sans alias. La vérification en base rendait
pourtant :

```
actives  2094 | sans_alias  6 | total_alias  3674
```

Six lignes à zéro. Exactement l'écart entre la base (2 094) et le dépôt
(2 088) : **les passions créées depuis l'application**. `creer_passion`
écrivait `aliases = '{}'` EN DUR.

Deux sont légitimes et bien réelles — « Danse west coast », « GRS ». Quatre
sont des résidus de test (§4).

## Ce que ça veut dire, et pourquoi ce n'est pas cosmétique

C'est une **inégalité structurelle**. Une passion curée est atteinte par deux
ou trois formulations ; une passion créée par quelqu'un n'est atteinte que par
la sienne. Or la personne qui crée est justement **celle qui sait comment on
la nomme autrement** — on ne le lui demandait jamais.

Et c'est l'exact prolongement de la conclusion de l'étude de capacité : ce
n'est pas le nombre de passions qui manque, c'est le nombre de portes d'entrée
vers chacune.

## ⚠️ Le libellé seul décide du doublon, un alias n'a JAMAIS ce pouvoir

Il était tentant de dire : « ton alias correspond à une passion existante,
donc tu crées un doublon ». C'est faux. Créer « Course nocturne » avec l'alias
« running » n'en fait pas un doublon de Running — l'alias y est plus général.

Un alias qui percute l'existant est donc **écarté, jamais un motif de refus**.
Une seule règle, explicable en une phrase, et le banc la mesure dans les deux
sens : l'alias part, la passion est créée quand même.

## ⚠️ Écarté, mais pas en silence

Un alias qui est le LIBELLÉ d'une autre passion fait remonter **deux entrées
pour le même mot**, et le classement de `rechercher_passions` (score,
popularité, `sort_order`) départage alors sur un critère que personne n'a
choisi. C'est précisément l'erreur que `scripts/valider-referentiel-passions.js`
refuse dans le dépôt depuis toujours ; **la base ne la refusait nulle part.**

`creer_passion` **retourne donc les alias RETENUS** (colonne `aliases`), et le
client remonte `aliasRetenus` — ce que le serveur a gardé, jamais ce qu'on a
demandé. Laisser croire que tout a été gardé serait un mensonge tranquille.

## ⚠️ Une SURCHARGE, pas un remplacement

Le client déployé appelle `creer_passion(p_label, p_emoji)`. Un troisième
paramètre `default null` sur la même fonction rendrait **tout appel à deux
arguments AMBIGU** (« function is not unique ») dès que les deux coexistent —
et un appel ambigu, côté PostgREST, se lit comme « la fonction n'existe pas »,
donc comme un repli sur la demande non publiable.

La forme à deux arguments survit donc, en déléguant à la forme à trois. Le
banc l'exerce (`⑥ quater`), et il vérifie les grants des **deux** signatures :
le `DROP` nécessaire au changement de type de retour les efface, et un
`revoke ... from public` ne retire pas le grant nominatif que les privilèges
par défaut de Supabase redonnent à `anon`.

## ⚠️ Déployable AVANT sa migration, et c'est mesuré

`creerPassion` n'ajoute `p_aliases` à la charge utile **que si des alias ont
été saisis**. Sans saisie, elle est identique à l'octet près à celle d'avant
le lot — verrou ⑮.

Sans cette précaution, une base qui ne connaît que la forme à deux arguments
répondrait `PGRST202`, que `creerPassion` traite comme un **verrouillage
définitif de la création pour toute la session**. Sur une base parfaitement
saine.

## Le champ, côté écran

Une ligne, facultative, sous le bouton « Créer « … » ». Le reproche des
testeurs était que créer une passion était trop **difficile** : on n'ajoute
donc pas une étape, on ajoute une occasion.

- Il n'apparaît **que si la création est réellement possible**. Sous le chemin
  de demande (hors ligne, sans compte, migration non appliquée), les alias ne
  seraient transmis à personne : un champ qui ne sert à rien est un mensonge
  d'interface.
- ⚠️ **`rendrePied` pose `innerHTML` à chaque frappe.** Un champ non mémorisé
  perdrait sa saisie au caractère suivant tapé dans la recherche — même
  famille que le cache `_lastHtml` de `renderProfileStrip`. La valeur vit sur
  l'instance (`this.alias`), l'écoute est **déléguée** (elle survit au
  remplacement du nœud) et ne déclenche aucun re-rendu.
- 16 px sans exception : en dessous, iOS zoome au focus et le sélecteur sort
  du cadrage.

## Rattraper les passions déjà créées

Elles n'ont pas d'alias et personne ne va rouvrir son compte pour en ajouter.
D'où `passions:moderation alias` (canal ② d'ADR-012, jamais le navigateur) :

```
node scripts/passions-moderation.js alias --id grs --ajouter "gymnastique rythmique,gym rythmique"
node scripts/passions-moderation.js alias --id grs --retirer "gym rythmique"
```

⚠️ L'outil **REFUSE** un alias qui percute, là où le serveur l'écarte
silencieusement : ici il y a un humain devant, il peut corriger, et un retrait
muet le laisserait croire que son alias a été posé.

⚠️ Réservé aux passions `user_suggested`, comme `archiver`. Les alias des
2 088 entrées curées vivent dans `data/passions/`, sous `passions:valider` :
une retouche en base y serait **écrasée au prochain delta** — un correctif qui
disparaît tout seul est pire qu'aucun correctif.

## Verrous

| Où | Quoi |
|---|---|
| `scripts/verifier-migration-creation-passion.sh` | 70 contrôles sur un PostgreSQL jetable (CI), dont ⑥ quater (12) et ⑥ quinquies |
| `tests/e2e/creation-passion.spec.js` | 18 cas, dont ⑭–⑱ pour ce lot |

Le banc SQL éprouve la **règle** (pliage, bornes, balisage, collisions,
surcharge, grants) ; la suite e2e éprouve le **câblage** (le champ paraît où il
faut, la saisie survit, la charge utile ne change pas sans saisie, on remonte
ce que le serveur a gardé).

⚠️ Le contrôle de retour arrière du banc ne supprimait **qu'une** des deux
signatures : il annonçait « retour arrière exécuté » en laissant la fonction
parfaitement vivante sous l'autre forme. Un contrôle qui rassure à tort est
pire que pas de contrôle.

## Points ouverts

1. **Quatre résidus de test sont `active` en production** — `test1`, `test2`,
   `test5`, `test-crea-passion`, créés les 8 et 9 septembre. Ils sont
   publiables et visibles dans la recherche de tout le monde.
   `node scripts/passions-moderation.js archiver --id test1` (× 4). Exige la
   clé `service_role` : geste d'opérateur, sur un poste.
2. **« Danse west coast » et « GRS » n'ont toujours pas d'alias.** À poser par
   la commande ci-dessus.
3. **Rien ne rappelle à l'écran qu'on peut nommer autrement.** Le champ est là,
   sans placeholder incitatif au-delà de l'exemple. À revoir sur mesure d'usage
   plutôt qu'à l'intuition.
