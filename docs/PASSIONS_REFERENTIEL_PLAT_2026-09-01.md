# Référentiel plat des passions — lot `flat_passions_v1` (2026-09-01)

> « Recherche et choisis directement ce qui te passionne. »

## 1. La décision

Dans PASSIO, **tout est directement une PASSION**. « Enduro », « Guitare
électrique », « Astrophotographie », « Cuisine coréenne », « Sport » et
« Moto » sont au **même rang**. Aucune n'est « sous » une autre, aucune n'exige
d'en ouvrir une avant.

Une passion n'est jamais un profil, jamais une identité, jamais une catégorie à
ouvrir, jamais une sous-rubrique obligatoire. Elle range du contenu, et elle
range la lecture — c'est tout.

Ce lot **remplace entièrement** le catalogue hiérarchique *Univers → Passion →
Sous-passion* du lot TAXO-1 (PR #231), dont il reprend et **aplatit** les
données. Il n'existe ni `passion_universes`, ni `passion_specialties`, ni
`specialty_id`, et il ne doit pas en exister.

Il complète ADR-010 (une identité publique, des passions qui classent) et
ADR-011 (fil additif, profil à deux onglets, Studio seul point de choix) sans
en changer aucune décision.

## 2. Les chiffres, exactement

| | |
|---|---|
| passions directement sélectionnables | **1 908** |
| alias et variantes de recherche | **1 578** |
| relations sémantiques (invisibles) | **3 830** — 3 714 `broader`/`narrower`, 116 `related` |
| identifiants historiques préservés | **19 / 19** |
| proposées au repos | 48 (24 précises, 24 générales, **alternées**) |
| fichiers sources | 13, dans `data/passions/` |
| poids du JSON servi | 160 Ko non compressé, ~35 Ko en gzip |

L'objectif énoncé — 10 000 à 20 000 passions, 20 000 à 50 000 alias — est un
objectif **« à terme »**. Ce lot livre l'**architecture** qui le porte (index de
préfixes, chargement paresseux, recherche serveur indexée, pipeline de
génération, validateur) et un référentiel **curé** de 1 908 entrées. Grossir se
fait en ajoutant des lignes dans `data/passions/*.js` puis en relançant
`npm run passions:construire` — aucun code à écrire.

**Aucune combinaison n'a été générée artificiellement pour gonfler un chiffre.**
Chaque entrée est un terme qu'une personne peut réellement se reconnaître.

### Provenance et licence

Les données proviennent de la **curation manuelle du lot TAXO-1** (branche
`claude/passio-catalog-passions-jw5six`, PR #231), aplatie par
`scripts/` puis étendue à la main sur ce lot :

- 832 entrées reprises de TAXO-1 (42 « familles » + 790 « spécialités »),
  toutes devenues des passions de plein droit **avec leurs identifiants
  inchangés** ;
- 1 076 entrées ajoutées ici : aviation, nautisme, langues, apprentissage,
  collections, nature, engagement et bénévolat, spiritualité, chasse, et des
  compléments dans les 42 familles existantes.

**Aucune source externe n'est utilisée, ni à la construction ni à l'exécution.**
Il n'y a donc aucune licence tierce à respecter, aucune dépendance réseau, et
rien à re-télécharger. Le jour où une source ouverte sera importée, elle devra
être documentée ici, normalisée dans `data/passions/`, et n'être **jamais**
appelée à l'exécution.

## 3. Où vivent les choses

```
data/passions/*.js          SOURCE — une ligne par passion, format plat
data/passions/relations.js  les seules relations LATÉRALES écrites à la main
data/passions-v1.json       MIROIR servi au navigateur (généré)
migrations/migration_passions_plat.sql   MIROIR serveur (généré)

scripts/referentiel-passions.js            lecture + normalisation (partagé)
scripts/valider-referentiel-passions.js    npm run passions:valider
scripts/construire-referentiel-passions.js npm run passions:construire
scripts/deduplique-alias-passions.js       npm run passions:dedupliquer
scripts/verifier-migration-passions.sh     npm run passions:migration

js/passions-flat.js       moteur : drapeau, chargement, normalisation, recherche
js/passion-selector.js    PassionSearchSelector — le composant unique
js/passions-flat-ui.js    la colle : 7 surfaces → moteurs existants
```

⚠️ **Les deux miroirs sont GÉNÉRÉS. Ne jamais les éditer à la main.** La CI
lance `node scripts/construire-referentiel-passions.js --verifier` : modifier la
source sans régénérer fait rougir le déploiement, et c'est voulu — sinon le JSON
servi et la migration décriraient un référentiel qui n'existe plus, et personne
ne le verrait avant la production.

### Format d'une ligne

```js
[ id, libellé, "alias1,alias2", broader, { emoji, color, pop, broad } ]
```

- `id` — **identifiant TEXTE STABLE**, écrit dans `posts.passion_id`,
  `events.passion_id`… Ne jamais le renommer, jamais le réutiliser.
- `broader` — un terme plus général, **ou `""`**. Il ne sort **jamais** à
  l'écran : il alimente `passion_relations` et améliore le classement (taper
  « moto enduro » trouve « Enduro »).
- `emoji` / `color` — obligatoires quand `broader` est vide, **hérités** sinon.
- `pop:1` — proposée au repos. `broad:1` — terme très général, **rétrogradé**
  derrière un terme précis à pertinence égale.

## 4. La recherche

### Classement

| score | règle |
|---|---|
| 0 | libellé exact |
| 5 | **alias exact** |
| 10 | libellé commençant par la frappe |
| 30 | alias commençant par la frappe |
| 40 | occurrence en milieu de libellé |
| 50 | approximatif — tous les mots présents, dans le désordre |
| +2 | quand la correspondance n'est obtenue qu'après repli au singulier |
| +5 | quand la passion est un terme très général (`is_broad`) |

À score égal : popularité, puis usage récent, puis ordre alphabétique.

⚠️ **Un écart assumé à la lettre de la spécification.** Elle énumère « début du
libellé » **avant** « alias exact ». Appliqué tel quel, taper `running`
remontait « Running urbain » — un début de libellé — devant « Course à pied »,
dont `running` est précisément l'alias exact. Or la même spécification donne
« running, jogging → Course à pied » comme exemple de ce que la recherche doit
faire. Les deux phrases se contredisent ; on a tranché pour l'exemple, qui dit
l'intention. **Mesuré avant et après.**

### Normalisation

Casse, accents, espaces multiples, tirets, et un repli singulier volontairement
minimal (un seul `s`/`x` final, à partir de 4 lettres — un désuffixage agressif
fusionne « bus » et « bu »).

⚠️ **Trois pliages doivent rester identiques** : `norme()` dans
`js/passions-flat.js`, `norme()` dans `scripts/referentiel-passions.js`, et
`normalized_label` en base. Trois pliages différents, c'est « moto cross » qui
trouve « Motocross » d'un côté et pas de l'autre. Le test ⑱ compare le pliage du
navigateur à celui du référentiel construit.

⚠️ **Il existe un SECOND pliage, `normeIdentite`, et c'est délibéré.** `norme`
sert à **chercher** : elle jette la ponctuation, donc « C », « C++ » et « C# »
s'y confondent — ce qu'on veut quand quelqu'un tape « c ». Mais le contrôle
d'**unicité** utilise `normeIdentite`, qui conserve `+`, `#` et `&` : sinon il
refuserait « C++ » à côté de « C# », deux libellés parfaitement distincts à
l'œil, tout en laissant passer « Cinéma » et « Cinema ».

### Échelle

Un index par **préfixe de 3 lettres** est construit au chargement. À 1 908
entrées un balayage complet suffirait ; à 20 000 il ne suffirait plus, et
l'index se règle **maintenant** — pas le jour où la frappe devient poussive sur
un téléphone d'entrée de gamme.

### Serveur

`public.rechercher_passions(q, lim)` — indexée (`gin` sur `aliases`, btree sur
`normalized_label`, `gin_trgm` si `pg_trgm` est là), plafonnée à 50, ordonnée
par le même barème. Le client l'utilise quand elle existe et **cesse
définitivement de la demander** dès qu'elle répond une erreur : tant que la
migration n'est pas appliquée, il n'y a pas de RPC, et réessayer à chaque frappe
serait un aller-retour perdu par caractère.

Debounce 160 ms · **jeton d'annulation** (une réponse pour « gui » ne doit pas
écraser celle de « guitare » — ce dépôt a eu ce défaut exact sur la recherche de
comptes, PR #210) · cache court de 40 entrées · repli local immédiat.

### Hors ligne

Le référentiel est servi en `stale-while-revalidate` par le service worker :
une fois téléchargé, il reste disponible. Si le tout premier chargement échoue,
le moteur retombe sur un **repli** — les 19 passions embarquées, celles du
compte, et les récentes. Dégradé, mais jamais un écran vide.

## 5. Vie privée

⚠️ **Aucune recherche libre ne part en télémétrie.** La frappe ne quitte
l'appareil que vers `rechercher_passions` (RPC Supabase — corps de requête, que
`js/telemetry.js` ne lit pas : il ne relève que l'URL sans query).

⚠️ **Le bouton « Ajouter « … » à mes passions » porte un `data-tel` explicite,
et c'est obligatoire.** `telemetry.js` nomme un clic par, dans l'ordre :
`data-tel`, `data-screen`, `aria-label`, `#id`, puis **`textContent.slice(0, 40)`**.
Ce bouton affiche la frappe : sans `data-tel`, la recherche libre de la personne
partirait dans la télémétrie. Le test ⑭ le vérifie.

## 6. Compatibilité

- Les **19 identifiants historiques** sont conservés à l'octet près et gardent
  `source = 'legacy'`. Le validateur refuse tout référentiel où l'un manque.
- `posts.passion_id`, `stories.passion_id`, `events.passion_id`,
  `conversations.passion_id` et `profiles.passion_id` continuent de fonctionner
  sans changement : ce sont les mêmes colonnes, la même clé étrangère.
- Une publication garde **une seule** passion de destination.
- `profiles.passions` (jsonb) **reste la source de vérité** de l'affichage.
  `user_passions` est créée et remplie en parallèle ; tant que la bascule n'est
  pas décidée, perdre cette table ne perd rien — c'est ce qui rend le retour
  arrière sûr.
- **Aucun SQL destructif.** Aucun `drop`, `delete`, `truncate` ni renommage.

### Si la migration hiérarchique a déjà été appliquée quelque part

La section 7 de la migration la **neutralise sans rien détruire**. Les
identifiants des anciennes « spécialités » sont **exactement** ceux que la
section 2 insère comme passions de plein droit : il n'y a rien à convertir.
`passion_universes`, `passion_specialties` et `posts.specialty_id` sont
**conservées** — simplement plus lues. La migration l'annonce par un `raise
notice` avec le décompte.

## 7. Sécurité (RLS)

| table | select | insert / update / delete |
|---|---|---|
| `passions` | public | **aucune policy** — le référentiel n'est pas modifiable par un client |
| `passion_relations` | public | **aucune policy** |
| `user_passions` | public (ces passions sont déjà affichées sous le pseudo) | propriétaire seulement |
| `passion_requests` | propriétaire seulement | insert propriétaire, **plafonné à 5 / 24 h dans la policy** ; ni update ni delete |

⚠️ **La limitation de fréquence vit dans la POLICY, pas dans le client.** Dans
le client, elle ne contrôlerait rien : une requête REST directe s'en passerait.

⚠️ **`passion_requests` n'a ni policy UPDATE ni policy DELETE**, et c'est
délibéré : sinon `status` deviendrait un champ que le client écrit — donc
n'importe qui pourrait approuver sa propre demande. Le passage au référentiel se
fait par migration ou par un rôle opérateur (`service_role`), **jamais** depuis
une session navigateur.

Index posés sur les colonnes que les policies filtrent (`user_passions.user_id`,
`passion_requests.user_id`).

Aucun média, aucun base64 dans ces tables. Tous les libellés sont échappés à
l'affichage (`escapeHtml`).

## 8. Le drapeau

**ÉTEINT PAR DÉFAUT.**

```
Aperçu     ?passio_preview=flat-passions-v1     (alias : ?flat_passions_v1=1)
Forçage    window.PASSIO_FLAT_PASSIONS = true
Coupures   localStorage.flat_passions_v1 = "0"        ← prioritaire sur tout
           window.PASSIO_FLAT_PASSIONS = false        ← prioritaire sur tout
```

Aucune activation positive n'est écrite dans `localStorage` : l'aperçu vient de
l'URL, jamais d'un état posé sur l'appareil de qui teste. Drapeau à faux :
l'application se comporte **exactement** comme avant.

## 9. Les surfaces

| surface | ce qui change | où |
|---|---|---|
| Première visite / onboarding | la grille de 19 tuiles devient une recherche **en ligne** | `renderPassionGrid` (app-02) |
| Profil | une bulle « **+** » en fin de rail, à côté des passions qu'on possède | `renderProfilePassionRail` (app-06) |
| Mes passions | la modale de catalogue devient le sélecteur | `openCreateProfile` (app-06) |
| Studio | un bouton de recherche remplace le `<select>` | `renderStudio` (app-06) + `index.html` |
| Rencontrer | une tuile « 🔍 Chercher » en tête des passions | `renderIrlPassionTiles` (app-07) |

⚠️ **Les hooks sont DANS les moteurs, pas dans un observateur de DOM.** Ce lot
change ce que l'écran *signifie*, pas seulement ce qu'il montre — et ce dépôt a
documenté à plusieurs reprises qu'une décoration par observateur se fait effacer
au premier re-rendu (`renderProfileStrip` réécrit `#profileStrip` en entier,
cache `_lastHtml` compris ; `renderIrlPassionTiles` réécrit `#irlPassionRow` et
UI-4A5 **déplace** ce nœud).

⚠️ **LE FIL N'A PLUS DE PORTE D'AJOUT (2026-09-01).** Une bulle « + Ajouter »
avait d'abord été posée en fin de rail du Fil. Benjamin l'a fait déménager après
essai réel : « la bulle de rajout de passion doit être sur le profil, pas dans
le fil ». Le rail du Fil est une commande de **lecture** — on y coche et décoche
ce qu'on possède ; on acquiert au Profil. `ouvrirRecherchePassionsFil` (app-06)
et `PassioFlatUI.ouvrirPassionsDuFil` ont été **retirées** avec elle : elles
n'avaient plus aucun appelant, et surtout elles seraient devenues fausses sous
le plafond (§9 bis) — elles appelaient `ajouterPassionAuCompte` pour chaque
passion cochée, donc au plafond elles auraient coché dans `_activeFeedPassions`
des passions que le compte ne possède pas, des bulles qu'un décochage aurait
fait disparaître sans retour.

## 9 bis. Trois passions offertes, la suite sera payante

Demande de Benjamin le 2026-09-01 : « rajoute un mode payant, pour l'instant
3 profils gratuits le reste payant, pour l'instant tu bloques et tu mets une
fenêtre qui annonce que ça sera payant » — puis, une minute plus tard : « ne
mets pas de valeur, tu mets juste que ça va être payant mais pas de tarif pour
l'instant ». **Aucun montant n'est affiché**, et un test l'exige (`㉒`).

`PASSIONS_OFFERTES = 3` (app-06), avec `plafondPassionsActif()`,
`nbPassionsVivantes()`, `passionsRestantesOffertes()`, `plafondPassionsAtteint()`
et `openPassionPaywall()`.

⚠️ **Ce n'est pas un retour de l'économie retirée par ADR-009.** L'ADR interdit
une **monnaie intermédiaire** (Passia, points, étoiles, packs) et prévoit
explicitement qu'« un paiement futur devra être un paiement DIRECT en monnaie
réelle ». Un abonnement est exactement ce cas. Rien de ce que l'ADR a retiré
n'est réintroduit : ni solde, ni pack, ni prix libellé en jeton.

⚠️ **Le plafond vit sous `flat_passions_v1`, coupé par défaut.** Aucun compte de
production ne se voit donc imposer une limite qu'il n'avait pas hier ; couper le
drapeau rend les passions illimitées, à l'octet près (test `㉔`).

⚠️ **On compte les passions VIVANTES, pas les entrées.** Écart **assumé** avec la
règle héritée du lot UI-8 (« archiver ne libère pas d'emplacement payant ») :
sans cet écart, un compte au plafond n'aurait **aucune sortie** — ni ajouter, ni
échanger — et la fenêtre lui annoncerait une offre fermée sans rien lui
proposer. Le plafond se lit « trois passions **à la fois** », ce que la fenêtre
dit en toutes lettres.

⚠️ **La porte dérobée ④ du lot UI-8 n'est PAS rouverte.** Là-bas, le paywall
barrait la **restauration** d'une passion déjà possédée, en comptant les
archivées : on réclamait de l'argent pour reprendre ce qu'on avait déjà. Ici,
restaurer une archive est **gratuit** tant qu'on reste sous trois vivantes
(test `㉓`), et barré seulement quand ce serait une quatrième vivante
(test `㉓ bis`). Le verrou historique d'UI-8 (« archiver puis restaurer ne
réclame jamais de paiement ») reste vert.

⚠️ **Le plafond est gardé aux DEUX bouts, et c'est délibéré.** Aux **portes**
(`openCreateProfile`, `PassioFlatUI.ouvrirAjoutPassions`, le `max` du sélecteur)
pour ne pas laisser chercher, choisir et valider quelqu'un qui sera refusé ; et
au **point d'écriture** (`ajouterPassionAuCompte`, `restaurerPassion`) pour que
tout appelant futur le rencontre. C'est la leçon de `meOpen`, prise dans les
deux sens : garder la fonction qui écrit ne suffit pas, garder la porte non
plus. Mesuré : neutraliser le garde d'`ajouterPassionAuCompte` fait rougir
`㉒ bis` **et laisse `㉕` vert** — les deux couches sont réellement
indépendantes.

⚠️ **Aucun bouton « Payer ».** Le paiement n'est pas ouvert : un bouton qui ne
mène nulle part est un clic mort, et ce dépôt en a déjà payé le prix (l'aide
« bobines », ancrée sur une cible inexistante). La fenêtre dit ce qui est vrai
aujourd'hui — c'est à venir, rien n'est débité, le tarif sera annoncé au
lancement — et n'offre que l'action qui existe réellement : réorganiser ses
trois passions.

⚠️ **`ouvrirGestionPassionsDepuisPaywall` est une fonction à part**, pas trois
instructions dans l'`onclick`. Le panneau `#passionManager` vit **dans**
`#screen-profiles` : ouvert depuis le Fil sans changer d'écran, il serait déplié
mais invisible — le défaut exact des aides d'UI-7 posées sur une ancre sans
`offsetParent`.

⚠️ **`onMax` sur le sélecteur, à la place du toast.** L'appelant décide ce que
« plus de place » veut dire chez lui : au compte, c'est une offre à annoncer ;
ailleurs, un simple plafond de confort. Le sélecteur ne connaît pas la
facturation, et ne doit pas.

## 10. Les pièges payés sur ce lot

① **Le référentiel ne doit JAMAIS entrer dans le bundle.** `scripts/build.js`
inline **tout** `<script src="js/…">` : un référentiel en JS finirait dans le
monolithe, sur le chemin critique du démarrage, pour une donnée dont la plupart
des sessions n'ont jamais besoin. D'où un **JSON**, chargé au premier usage réel
de la recherche, et copié dans `dist/` par le build lui-même (pas par le
workflow — un asset qui n'existe qu'en CI est un asset qu'on découvre manquant
en production). Le test ⑤ verrouille : `taille === 0` au démarrage.

② **`selectedPassions` est un `let` de portée script**, donc absent de `window`.
On le **vide et on le remplit** en place ; le réaffecter depuis un autre fichier
serait impossible, et `onbFinish` lit `selectedPassions[0]` comme passion de
départ.

③ **`renderPassionGrid` est rappelée à chaque sélection.** Re-monter le
composant viderait le champ et refermerait le clavier à chaque passion cochée.
D'où un garde `data-psel-monte` : monté une fois, jamais deux.

④ **Les puces de sélection doivent être repeintes APRÈS le chargement**, pas
seulement à la sélection. Mesuré à l'écran : une passion déjà choisie
s'affichait « ✨ musique » — son identifiant brut et l'emoji générique — parce
que `parId()` rend `null` tant que le référentiel n'est pas là et que rien ne
repassait ensuite.

⑤ **Le pluriel doit entrer dans le SCORE, pas seulement dans la branche
approximative.** Sans ça, « guitares » tombait au score 50 pour toutes les
guitares, et le départage à la popularité remontait « Guitare électrique »
devant « Guitare ». Mesuré.

⑥ **Les suggestions au repos alternent précis et général.** Triées par
popularité seule, elles affichaient « Sport · Sports de combat · Sports
collectifs · Musique… » : rien que des grandes familles, ce qui réapprend
exactement ce que ce lot défait. Voir « Enduro » et « Escalade » dès l'ouverture
est ce qui dit, sans un mot d'explication, que tout est au même niveau.

⑦ **Un `grant … to anon, authenticated` inconditionnel rend la migration
intestable.** Ces rôles sont fournis par la plateforme Supabase ; sur un
PostgreSQL nu — celui d'un test, d'une preview, d'une réplique locale — ils
n'existent pas, et le `grant` fait échouer **toute** la migration (elle est dans
une seule transaction). On accorde à ceux qui existent, et on le journalise.

⑧ **`unaccent()` n'est pas IMMUTABLE**, donc pas indexable, et l'extension n'est
pas garantie. D'où `normalized_label`, calculé une fois par le générateur et
**stocké** ; `unaccent_immutable()` n'est qu'un repli — et elle doit être
définie **en tête** de la migration, parce que la section 2 s'en sert.

⑨ **`data-tel` sur le bouton qui affiche la frappe** (voir §5).

⑩ **`styles.css` est en CRLF**, et le bloc du lot UI-4A5 doit rester le
**dernier** de la feuille. Le bloc de ce lot est donc posé **juste avant** lui,
et écrit en binaire.

## 11. Ce qui reste à faire

- ~~**Appliquer la migration en production.**~~ **FAIT le 2026-09-01.**
  Appliquée par Benjamin depuis la CLI Supabase liée, et vérifiée dans la
  foulée : **1 908 passions actives · 3 830 relations · 19 identifiants
  historiques · 0 publication orpheline**. Les 1 908 sont désormais publiables.
  ⚠️ Le refus AVANT insert n'a pas disparu pour autant : `estPassionCanonique`
  reste la seule autorité, et protège des identifiants inventés comme d'un
  référentiel serveur tronqué par le plafond `max-rows` de PostgREST.
- ~~**Le drapeau est éteint par défaut.**~~ **ALLUMÉ le 2026-09-01**, après la
  migration et dans cet ordre — l'inverse aurait ouvert une recherche promettant
  1 889 passions impubliables. Le drapeau ne sait plus qu'ENLEVER ; la coupure
  reste entière et rend le retour arrière gratuit, sans redéploiement.
  Mode d'emploi complet : **`docs/APPLIQUER_MIGRATION_PASSIONS.md`** (les deux
  chemins réels, les requêtes de vérification, le retour arrière).
- ~~**Traiter les demandes.**~~ **Fait le 2026-09-01** :
  `npm run passions:demandes -- lister | proposer | resoudre | refuser`
  (`scripts/passions-demandes.js`). ⚠️ C'est un outil d'**opérateur**, en ligne de
  commande, qui exige `SUPABASE_SERVICE_ROLE_KEY` — jamais une interface du
  navigateur : la migration ne pose NI policy UPDATE NI policy DELETE sur
  `passion_requests`, donc changer un statut exige `service_role`. Il **n'écrit
  pas non plus le référentiel** : il propose la ligne à coller dans la source
  versionnée, détecte les doublons (`normeIdentite`) et les quasi-doublons
  (`norme`), et ne marque une demande résolue qu'après que la passion existe
  réellement. ⚠️ Vie privée : il n'affiche **aucun `user_id`** — une demande est
  du texte libre tapé par une personne, l'opérateur a besoin du libellé, pas de
  savoir qui l'a écrit. Il ne sélectionne donc même pas la colonne.
- **Grossir le référentiel** vers 10 000–20 000 entrées.
- ~~**`user_passions` n'est pas encore écrite.**~~ **Branchée le 2026-09-01** :
  `supaMiroirUserPassions()` (app-08), appelée par `supaSavePassionState` après
  l'écriture du jsonb. Tests : `tests/e2e/user-passions-miroir.spec.js` (5).
  ⚠️ **`profiles.passions` reste la source de vérité et rien ne LIT la table
  normalisée** — c'est ce qui garde le retour arrière sûr. On écrit à côté pour
  que la table soit peuplée le jour de la bascule : basculer la lecture sur une
  table vide perdrait les passions de tout le monde.
  ⚠️ **Le miroir doit être inerte ET SILENCIEUX tant que la migration n'est pas
  appliquée** — c'est l'état de la production. Sans son sondage à un coup
  (`_userPassionsDispo`), chaque enregistrement de passion produirait une erreur
  PostgREST, à chaque geste, sur tous les comptes. Il se désarme pour la session
  sur `PGRST205`, `42P01` et `42501`, et se réarmera de lui-même après la
  migration.
  ⚠️ **Aucun identifiant local n'est envoyé sans passer par `estPassionCanonique`** :
  `user_passions.passion_id` porte une clé étrangère, et un seul identifiant
  inconnu ferait rejeter TOUTE l'écriture en 23503 — les passions valides seraient
  perdues avec lui.
  ⚠️ **Piège de test payé ici** : `supa` et `MY_UID` sont des `let` de portée
  script — ils existent comme identifiants globaux mais **ne sont pas** des
  propriétés de `window`. Un stub posé sur `window.supa` n'intercepte rien, et le
  test passe **vert-aveugle** sans qu'aucune assertion ne le signale.
- **La recherche serveur n'a jamais tourné contre Supabase**, seulement contre
  un PostgreSQL jetable. Elle est écrite, indexée et testée ; elle sera exercée
  pour de vrai le jour où la migration passera.

## 12. Commandes

```bash
npm run passions:valider       # 8 familles de contrôles sur la source
npm run passions:construire    # régénère le JSON et la migration
npm run passions:verifier      # valide + vérifie que les miroirs sont à jour (CI)
npm run passions:dedupliquer   # entretien : retire les alias en conflit
npm run passions:migration     # EXÉCUTE la migration sur un PostgreSQL jetable
npx playwright test tests/e2e/passions-plates.spec.js
```
