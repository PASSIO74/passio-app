# « Gérer mes passions » — la porte d'ajout déménage, le rail se réaligne (2026-09-03)

Cinq demandes de Benjamin, après essai réel, dans un seul message :

> « Dans les paramètres du profil : écris GÉRER MES PASSIONS au lieu de mes passions.
> Ensuite enlève sur la page de profil dans les bulles la bulle +, elle fait tache et
> en trop. Tu mets la possibilité de rajouter des passions dans les paramètres gérer
> mes passions et réaligne les bulles de passion : l'objectif est 3 bulles de passion
> principales visibles, ensuite on glisse sur le côté pour voir les autres. Et améliore
> la page de gérer mes passions, il faut que ça soit simple à utiliser et gérer : je
> crée des passions, j'en cherche des nouvelles, j'archive, je change de passion
> archivée = profil, etc. »

Elles ne sont pas cinq changements indépendants : ② retire la seule porte d'ajout
VISIBLE, et ③ est ce qui l'empêche de devenir un cul-de-sac. La bonne lecture est
donc **un déménagement**, pas un retrait.

Verrou : `tests/e2e/gerer-mes-passions.spec.js` (9 cas).

---

## 1. Ce qui change, écran par écran

| Surface | Avant | Après |
|---|---|---|
| Menu « ⋯ » du profil | `🗂️ Mes passions (2 archivées)` | `🗂️ Gérer mes passions (2 archivées)` |
| Rail de bulles du profil | bulle « + » en TÊTE, puis les passions | **QUE** les passions possédées |
| Largeur d'une bulle du profil | 84 px fixes | 1/3 du rail — 4 passions ou plus : 1/3 moins la réserve d'affleurement |
| Panneau `#passionManager` | titre + lien « + Ajouter » de 11 px | titre + **bouton principal** « ＋ Ajouter une passion » + aide |
| Carte d'une passion | archiver caché dans son menu « ⋯ » | boutons **✏️ Modifier** et **🗄️ Archiver** en clair |
| « Passion du Studio ✓ » | barre pleine largeur, fond d'accent | pastille compacte |
| Titres du panneau | trois `.section-title` à 26 px | un titre d'écran, deux titres de bloc (17 px) |

Aucune règle métier n'est touchée : plafond (`PASSIONS_OFFERTES = 3`), quota
(`CHANGEMENTS_PASSION_OFFERTS = 3`), archivage, restauration et échange restent
EXACTEMENT ceux de la fiche 16. Le seul retrait de code est celui d'une déléguée
devenue orpheline (§5).

---

## 2. Le déménagement de la porte d'ajout

La bulle « + » a vécu trois jours et deux emplacements :

- **2026-09-01** — elle quitte le Fil pour le Profil (« la bulle de rajout de passion
  doit être sur le profil, pas dans le fil »). Le Fil redevient une commande de lecture.
- **2026-09-02** — le rail devient coulissant ; posée en queue, la bulle sort du
  scrollport (mesuré à 320 px avec 3 passions : elle commençait à x=326 pour un rail
  qui s'arrêtait à 304). Elle passe en TÊTE.
- **2026-09-03** — elle est retirée. Elle faisait tache pour une raison de fond :
  le rail est une commande de **lecture** (je coche ce que je veux voir), et elle
  était la seule commande d'**écriture** au milieu, avec un rond en pointillés qui
  ne ressemblait à aucune de ses voisines.

**⚠️ RETIRER UNE PORTE OBLIGE À EN OUVRIR UNE AUTRE, ET À LA RENDRE VISIBLE.** C'est
la leçon de `meOpen` prise à l'endroit, et celle du Studio après le retrait d'un
carnet (2026-08-29) : garder la fonction qui ÉCRIT ne suffit pas, il faut garder
celle qui OUVRE LA PORTE. Sans le déplacement de ③, l'ajout d'une passion serait
devenu inatteignable pour qui ne connaît pas le menu « ⋯ » — le lien `#nouveauProfilLien`
faisait 11 px, dans un panneau `hidden`, derrière ce menu.

La porte est donc, désormais :

```
menu ⋯ du profil → « Gérer mes passions » → bouton #passionAddBtn → openCreateProfile()
```

**⚠️ UN SEUL MOTEUR D'AJOUT : `openCreateProfile()`.** Il connaît déjà les deux mondes
— sélecteur de recherche sous `flat_passions_v1`, grille historique sous le kill switch
— et il garde le plafond (`plafondPassionsAtteint()` → `openPassionPaywall()`). Appeler
`ouvrirRecherchePassionsCompte()` directement aurait court-circuité la branche du kill
switch : drapeau coupé, le bouton n'aurait alors **rien** fait, en silence.

**⚠️ `#nouveauProfilLien` RESTE.** Il vise la même fonction, l'aide contextuelle
`second_profil` le cible par sélecteur, et les lots UI-6B / UI-7 réécrivent son texte.
Le retirer casserait les trois. Deux commandes pour un geste sont tolérables **ici** :
elles appellent la MÊME fonction, il n'y a pas deux états possibles à départager — la
leçon de la bulle « Toutes » (ADR-011) ne s'applique pas.

---

## 3. Trois bulles dans le champ — et la quatrième qui affleure

`#v9ProfilePassions .profile-tile` ne prend plus la constante de 84 px du composant
commun : sa largeur se **déduit** de celle du rail.

```css
#v9ProfilePassions .profile-tile            { flex: 0 0 calc((100% - 28px) / 3); }
#v9ProfilePassions.v9-strip-defile .profile-tile { flex-basis: calc((100% - 68px) / 3); }
```

**⚠️ CE N'EST PAS UN RETOUR DE `flex: 1 1 0` — c'est son contraire.** La règle interdite
(voir `.profile-tile`, ~ligne 4411 de `styles.css`) faisait **partager** la largeur entre
TOUTES les bulles : à dix passions chacune tombait sous 26 px, la vignette de 46 px
débordait de sa case, les bulles se recouvraient et les libellés disparaissaient. Ici la
base est un nombre **fixe une fois calculé** — la même à quatre passions qu'à trente —
donc la rangée déborde dès la quatrième et c'est l'`overflow-x: auto` du rail qui la fait
coulisser, exactement comme avant.

### Pourquoi DEUX largeurs

Les deux moitiés de la consigne ne demandent pas la même bulle.

- **Trois passions ou moins** : il n'y a rien à faire affleurer. Les trois bulles
  remplissent exactement la largeur (28 px retirés = les deux gouttières de 14 px), et la
  rangée se termine sur la marge de droite, symétrique de celle de gauche. Mesuré à
  390 px : rail de 326 px de contenu, bulle de **99,3 px**.
- **Quatre passions ou plus** : `renderProfilePassionRail` pose `.v9-strip-defile` et la
  bulle se resserre à **86 px** pour libérer 40 px de réserve — la bulle suivante affleure
  alors de **42 px**.

Sans ce liseré, une rangée de dix est indiscernable d'une rangée de trois : rien à
l'écran ne dit qu'on peut glisser, et le contenu au-delà est perdu pour qui ne tente pas
le geste. Mais imposer la même réserve à un compte de trois passions ne ferait qu'ouvrir
un trou de 40 px à droite, et la rangée se lirait comme **mal alignée** — le défaut même
que la consigne demandait de corriger.

**⚠️ LES POURCENTAGES SE RÉSOLVENT SUR LA BOÎTE DE CONTENU, PAS SUR LA BOÎTE DE BORDURE.**
À 390 px de viewport, le rail mesure 358 px de bordure à bordure mais 326 px de contenu
(ses 16 px de padding de chaque côté). Un `calc()` réglé sur 358 donne 96,7 px là où la
mesure réelle rend 86 : c'est ce qui a produit, au premier essai, une rangée
left-alignée avec 56 px de vide à droite.

**⚠️ LE FIL ET LE PROFIL VISITÉ NE SONT PAS CONCERNÉS.** La consigne visait la page de
profil, et le Fil garde son propre palier (`:root.passio-ui-7 #screen-feed .profile-tile`,
62 px). D'où l'ancrage sur `#v9ProfilePassions` et non sur `.profile-strip`.

---

## 4. Le panneau devient une page de gestion

Ordre de lecture, de haut en bas :

1. **`Gérer mes passions`** + `+ Ajouter une passion` + `Fermer` (en-tête, niveau 1)
2. `#profilesModeleSub` — le modèle en une phrase
3. `#profilesQuotaSub` — `2/3 passions · 3 changements restants — 🗄️ Passions archivées (2)`
4. **`#passionManagerActions`** *(nouveau)* — le bouton d'ajout, l'aide, le titre de bloc
5. `#profileList` — les cartes des passions vivantes
6. `#passionArchiveBox` — les archives, en clair

### `renderPassionManagerActions()` (app-06)

Écrit le bouton, l'aide et le titre « Mes passions actives ». Trois états :

| État | Bouton | Aide |
|---|---|---|
| sous le plafond | `btn primary` | « Il te reste N emplacement(s)… » |
| plafond atteint | `btn ghost` | « Tes 3 emplacements sont pris. **Archive** une passion ci-dessous… » |
| plafond inactif (démo, kill switch) | `btn primary` | « Cherche une passion dans le catalogue… » |

**Le bouton dit ce qu'il FAIT, l'aide dit ce qui DÉBLOQUE.** Au plafond il ouvre la
fenêtre qui explique la formule à venir : on ne le retire pas — une porte invisible ne
s'explique pas — mais il cesse d'être l'action principale, puisque l'action réelle
(archiver) est juste en dessous. C'est la même règle que « une porte fermée doit dire
par où passer » (fiche 16).

### Les deux gestes de la carte

Archiver vivait dans le menu « ⋯ » de la carte : trois pixels d'icône, un menu à ouvrir,
un libellé à lire. C'est pourtant **le** geste de ce panneau — celui qui libère une place
et rend l'ajout possible. Il passe en bouton visible, à côté de « Modifier ».

**⚠️ AUCUNE COPIE DE LOGIQUE** : les deux boutons appellent exactement les fonctions du
menu (`openEditPassionProfile`, `confirmArchivePassion`), qui gardent le quota, le plafond
et la règle « au moins une passion vivante ». Deux chemins pour un geste auraient divergé
au premier correctif — c'est l'histoire de `sharePostInFeed` / `shareReelInFeed`.

**⚠️ LE « ⋯ » RESTE** : il porte encore la photo de la passion et sa photo de fond. Le
retirer emporterait la seule commande de ces deux-là.

**⚠️ LA DERNIÈRE PASSION NE S'ARCHIVE PAS, ET LE BOUTON LE DIT.** `confirmArchivePassion`
refuse déjà par un toast, mais un bouton qui échoue toujours est un bouton qui ment :
`vivantesRendues > 1` décide, et sinon le bouton est `disabled` avec la raison en `title`.

### Hiérarchie des titres

Sous UI-V2, `.section-title` vaut **26 px** : c'est le « titre d'un écran ». Le panneau
en portait TROIS à cette taille — `Gérer mes passions`, `Mes passions actives`,
`Passions archivées` — donc plus aucune hiérarchie, et un panneau qui se lisait comme
trois écrans empilés. Les deux titres **intérieurs** repassent au niveau 2 (17 px), la
valeur qu'UI-V2 donne déjà à `.v2-sheet-title` et `.modal-title`. L'en-tête garde son
niveau 1 : c'est bien le titre du panneau.

**⚠️ ET SON EN-TÊTE SE COUPAIT LES MOTS.** `.section-title` est un flex **sans** retour à
la ligne, et sa règle générique pose `margin-left: auto` sur **chaque** `.link` : les deux
liens se partageaient l'espace libre, et « Gérer mes passions » se coupait en deux lignes
pour leur faire de la place. On autorise le retour (`flex-wrap: wrap`) et un seul `auto`
— celui du premier lien — les groupe à droite.

### « Passion du Studio ✓ » redevient une information

ADR-011 §3 en a fait une **information** : le choix de la passion d'écriture a rejoint le
Studio, la carte ne le commande plus. Elle gardait pourtant le gabarit d'un bouton
principal — pleine largeur, fond d'accent, 40 px de haut — sous lequel viennent
maintenant s'aligner les deux VRAIS boutons de la carte. La chose la plus cliquable de la
carte était donc la seule à ne rien faire. Elle reprend la taille de ce qu'elle est.
`data-v8-active` et les classes `.v8-state.on` sont conservés : deux suites les ciblent.

---

## 5. Ce qui est parti avec sa cible

**`.psel-tile-plus`** (`styles.css`) avait un unique émetteur : la bulle « + » du rail.
`grep -rn "psel-tile-plus" js/ index.html` ne rend plus rien — la règle est retirée. Une
règle sans émetteur ne se garde pas « au cas où » : c'est la famille de défauts la plus
fréquente de ce dépôt. `.psel-tile-chercher` reste (tuile « Chercher » de Rencontrer,
app-07).

**`ouvrirRecherchePassionsCompte()`** (app-06) n'était que la déléguée de cette bulle :
elle est retirée avec elle, comme `ouvrirRecherchePassionsFil` l'avait été avec la bulle
du Fil le 2026-09-01. Une fonction globale sans appelant est exactement ce que l'audit du
2026-06-10 a trouvé **sept fois** dans ce dépôt. Une cible supprimée emporte tout ce qui
la vise, y compris ses délégués.

---

## 6. Les assertions retournées, jamais vidées

Cinq cas de test visaient la bulle « + ». Aucun n'a été supprimé : chacun a été **retourné**
sur ce qui l'a remplacé, sinon la disparition de leur cible les aurait rendus verts sans
plus rien prouver.

| Suite | Cas | Avant | Après |
|---|---|---|---|
| `profil-entete-passions` | ③ | `bulles = ["__ajouter__", …]` | `bulles = [3 passions]` + `porteAjout === 0` |
| `profil-entete-passions` | ③ quater / quater bis | `nb = 7` / `11` | `nb = 6` / `10` |
| `profil-entete-passions` | ③ nonies | « la porte « + » reste dans le champ » | « **trois bulles** dans le champ, la quatrième affleure » |
| `passions-plates` | ⑰ | absence de la bulle « + » | la porte ouvre la **grille**, jamais `.psel-input` |
| `passions-plates` | ㉑ | la bulle est sur le Profil | la porte est dans le panneau, et dans **aucun** rail |

**⚠️ ⑰ ÉTAIT DEVENU FAUX, PAS SEULEMENT PÉRIMÉ.** Il exigeait l'absence de la bulle « + »
sous kill switch — une bulle désormais absente **pour tout le monde**, drapeau ou pas. Il
serait resté vert sans plus rien mesurer. Ce que le kill switch change vraiment, c'est
**ce qui s'ouvre** quand on pousse la porte : la grille de 19 tuiles, jamais la feuille de
recherche. ⑰ bis en est le miroir exact — même porte, autre issue.

**⚠️ ㉑ MESURE LA VISIBILITÉ, PAS LA PRÉSENCE.** `renderProfilesScreen` écrit le bouton
d'ajout à chaque rendu du profil, panneau ouvert ou non : il est donc **dans** le DOM,
replié sous `#passionManager[hidden]`. Un `count() === 0` aurait exigé le contraire de ce
que fait le code — et c'est bien la visibilité qui décide de ce que l'utilisateur trouve.

---

## 7. Fichiers touchés

| Fichier | Quoi |
|---|---|
| `index.html` | titre du panneau, `#passionManagerActions` |
| `js/app-06-reels-partage.js` | libellé du menu, retrait de `portePlus`, `.v9-strip-defile`, `renderPassionManagerActions()`, boutons de carte |
| `js/ui-v6b-profil.js` | le lot réécrit « Gérer mes passions » (aller ET retour du kill switch) |
| `styles.css` | largeurs du rail, styles du panneau et des boutons, pastille d'état, hiérarchie des titres, retrait de `.psel-tile-plus` |
| `tests/e2e/gerer-mes-passions.spec.js` | **nouveau** — 9 cas |
| `tests/e2e/profil-entete-passions.spec.js` | ③, ③ quater, ③ quater bis, ③ nonies retournés |
| `tests/e2e/passions-plates.spec.js` | helper `ouvrirRecherche`, ⑰, ⑰ bis, ㉑, ㉒, ㉓ ter |
| `tests/e2e/ui-v6b-profil.spec.js`, `tests/e2e/ui-v7-lot.spec.js` | le titre attendu |
