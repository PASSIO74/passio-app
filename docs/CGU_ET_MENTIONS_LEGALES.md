# CGU, mentions légales et consentement à l'inscription — 2026-09-08

> Contrepartie juridique du lot d'ouverture au public. L'application partait à de
> vrais utilisateurs sans les deux textes qu'un service en ligne doit produire,
> et sans le geste qui forme le contrat.

## 1. Ce qui manquait, exactement

`openPrivacyPolicy()` existait depuis juin 2026 et couvrait le RGPD. Il manquait
trois choses, et chacune a une conséquence propre :

| Manque | Conséquence |
|---|---|
| Aucunes **conditions générales** | Aucun contrat opposable : ni règles de conduite, ni possibilité de suspendre un compte abusif sans arbitraire, ni limitation de responsabilité sur les rencontres en vrai. |
| Aucunes **mentions légales** | Obligation de l'article 6-III de la LCEN non remplie ; personne ne sait qui édite le service, qui l'héberge, ni à qui adresser un signalement. |
| Aucun **consentement explicite** à l'inscription | Rien ne prouve qu'un membre a accepté quoi que ce soit, et rien ne date son acceptation. |

## 2. `PASSIO_EDITEUR` — une seule source, et le RÉGIME décide

⚠️ **`openAbout()` affichait une identité fabriquée** : « PASSIO SAS · France ·
contact@passio.app ». Trois informations qu'aucun document du dépôt n'établit,
et dont la dernière **contredisait** l'adresse réelle donnée par la politique de
confidentialité (`passioadmin@gmail.com`). Une mention légale fausse
trompe. Elle n'a qu'une source désormais : `PASSIO_EDITEUR` (app-02 jusqu'au 2026-09-11, désormais `js/legal-textes.js`).

### ⚠️ Un trou n'est pas toujours un trou (correction du 2026-09-08, le soir)

La première version affichait **huit « [à compléter] »** parce qu'elle supposait
un éditeur **professionnel**. Il n'y a pas de société : PASSIO est édité par une
**personne physique, à titre non professionnel**. Ce régime-là ne demande pas ces
huit champs — **annoncer huit manquements là où la loi n'en constate aucun est
une deuxième façon de dire faux**, exactement symétrique de la première.

D'où `PASSIO_EDITEUR.regime`, **seul interrupteur** :

| `regime` | Ce que la loi exige, et donc ce que l'écran affiche |
|---|---|
| `"particulier"` (actuel) | L'éditeur conserve l'anonymat **vis-à-vis du public**. L'écran publie l'identité complète de **l'hébergeur du site**, et rien d'autre. Aucun `[à compléter]`. |
| `"societe"` | Les huit champs (raison sociale, forme, capital, siège, RCS, SIRET, TVA, directeur de la publication) sont exigés, et tout champ vide s'affiche `[à compléter]` en clair. |

### La base légale, et l'article qu'il ne faut plus citer

⚠️ **L'article 6-III de la LCEN — que la première version citait — a été
ABROGÉ** par la **loi n° 2024-449 du 21 mai 2024** (SREN), en vigueur au
23 mai 2024. L'identification de l'éditeur vit désormais à l'**article 1-1**, et
le droit à l'anonymat du non-professionnel à l'**article 1-1, II**.

⚠️ Même chose pour le signalement : **l'article 6-I-5 a été abrogé**. Depuis le
17 février 2024 c'est le **DSA** (règlement UE 2022/2065), **article 16**, qui
régit la notification de contenu illicite. Le texte cite désormais le DSA.

**Une mention légale qui cite un article mort est une mention légale fausse** —
le verrou ⑧ refuse explicitement `6-III` et `6-I-5` dans le texte rendu.

### Les deux conditions de l'anonymat, qui sont CUMULATIVES

1. **Publier le nom et l'adresse de l'hébergeur.** D'où l'adresse postale
   complète de Netlify : dans ce régime elle n'est pas un détail décoratif,
   c'est **la seule identité publiée**. Relevée sur les conditions
   d'utilisation de Netlify, jamais devinée.
2. **Avoir communiqué à cet hébergeur ses éléments d'identification
   personnelle** — ce que fait un compte Netlify nominatif. Cette condition-là
   se vérifie hors du code ; si elle tombe, l'anonymat tombe avec elle.

### ⚠️ Ce régime tombe au premier euro

L'anonymat du non-professionnel suppose un service **exploité à titre non
professionnel**. Les passions payantes (`openPassionPaywall`) en sont le
déclencheur direct : **dès que PASSIO encaisse, il faut une structure**, basculer
`regime` sur `"societe"` et renseigner les huit champs. Ce n'est pas une
destination, c'est un abri temporaire — et le caractère « non professionnel »
s'apprécie aussi à l'intention, pas seulement à la facturation.

### Hébergeur du site ≠ hébergeur des données

- **Hébergeur du site** (celui que vise l'art. 1-1, II) : **Netlify, Inc.**,
  101 2nd Street, San Francisco, CA 94105, États-Unis.
- **Sous-traitant technique des données** (RGPD, pas LCEN) : **Supabase**
  (Supabase Pte. Ltd., Singapour). ⚠️ Cette entité vient d'un registre public,
  pas des conditions de Supabase elles-mêmes (`supabase.com` est bloqué depuis
  l'environnement d'exécution) : **à confirmer sur une facture ou le contrat.**

⚠️ **Un juriste doit relire les deux textes.** Ils sont écrits pour être justes
et lisibles, pas pour remplacer un conseil.

## 3. Le consentement : où, et pourquoi là

La case `#authConsent` vit dans `#authConsentWrap`, entre la confirmation de mot
de passe et le bouton d'envoi. Elle n'est à l'écran **qu'en mode `signup`**
(`switchAuthTab`) : redemander son accord à quelqu'un qui se connecte lui
redemanderait ce qu'il a déjà donné.

Trois gardes, toutes sur le **chemin réel** :

1. `onbDoAuth` refuse l'inscription si la case n'est pas cochée — `signUp` n'est
   jamais appelé.
2. `onbGoogleAuth` applique la même exigence **en mode `signup` seulement** : le
   bouton Google est unique pour les deux modes, mais en création il forme le
   même contrat que le formulaire.
3. `state.user.cgu = { version, acceptedAt }` est écrit à l'inscription. **Sans
   la version, « a accepté » ne dit rien** : une réécriture des CGU rendrait la
   trace inexploitable. `PASSIO_CGU_VERSION` change à toute réécriture de fond.

### ⚠️ Le piège du `<label>`

Les liens vers les CGU et la politique vivent **dans le label de la case**.
L'activation d'un label part du clic sur un de ses descendants : ouvrir les CGU
**cocherait** le consentement — un accord donné par le geste qui sert à le lire.
D'où `event.preventDefault(); event.stopPropagation();` sur les deux liens.
C'est la même famille que le piège connu « `input.click()` remonte à son
conteneur » (fiche du 2026-08-29). Verrou : cas ④.

### ⚠️ `display: flex`, pas `""`

`label.field` est `display: block` en CSS. `switchAuthTab` pose donc
explicitement `"flex"` : rendre la main au CSS remettrait le texte **sous** la
case, sur toute la largeur. Verrou : cas ① (qui mesure `flexDirection|display`,
pas seulement la visibilité).

## 4. Ce que les CGU engagent, et qui doit suivre le code

Les CGU ne décrivent que ce que le produit fait **réellement** :

- **18 ans minimum — PASSIO est réservé aux MAJEURS** (2026-09-09) — appliqué par `onbValidateAge` (app-02)
  et `admissionValiderAnnee` (app-07). ⚠️ **L'âge est DÉCLARATIF** : rien ne le vérifie, et les CGU le
  disent en toutes lettres plutôt que de laisser croire à un contrôle. La seule barrière SERVEUR de
  majorité est la RLS de l'IRL (`irl_adult_only`) ; le fil, les messages et les publications n'en ont
  aucune — « réservé aux majeurs » y est une règle CONTRACTUELLE, pas une garde technique.
- **Majorité pour les rencontres en vrai** — appliqué par `requireAdmission`
  (app-07), lot du 2026-09-08.
- **Signalement et blocage depuis l'application** — `reportUser` / `blockUser`
  (app-04), menu « ⋯ » du profil visité.
- **Suppression du compte à tout moment** — Paramètres → Compte.
- **Les contenus restent à leur auteur**, licence limitée au fonctionnement du
  service et à la durée de la publication.
- **Hébergeur au sens de la LCEN** : retrait sur connaissance du caractère
  manifestement illicite.

⚠️ **Si l'une de ces portes change dans le code, le texte ment.** Le cas ⑦ balaie
le texte rendu contre ces engagements : il rougit si une section disparaît, pas
si le code diverge. La cohérence code/texte reste un geste humain.

## 5. Où les textes se lisent

| Surface | Chemin |
|---|---|
| CGU | Paramètres → Support → « Conditions générales d'utilisation » ; lien dans la case de consentement. Les CGU portent elles-mêmes un bouton vers les mentions légales. |
| Mentions légales | Paramètres → Support → « Mentions légales » ; bouton depuis les CGU ; bouton depuis « À propos ». |
| Politique de confidentialité | Paramètres → Support ; lien dans la case de consentement. |
| **Sans code d'accès** (2026-09-11) | Écran du rideau (`js/access-gate.js`) : trois liens sous le pied de la carte — Mentions légales · Conditions d’utilisation · Confidentialité — rendus dans un panneau blanc, sans rien déverrouiller. |

⚠️ `openModal` **n'empile pas** : ouvrir les mentions légales depuis les CGU
REMPLACE la modale. C'est voulu — le `×` injecté referme tout, et personne ne se
retrouve à fermer trois couches.

## 5 bis. Les textes vivent en TÊTE de page, pas dans l'application (2026-09-11)

La LCEN (art. 1-1) impose de tenir les mentions légales à la disposition du
**public**. Or le rideau du code d'accès masque tout — et en production le bloc
applicatif (`dist/app.js`), où vivaient les trois textes, n'est injecté
**qu'après** le déverrouillage. Un visiteur sans code ne pouvait donc lire ni qui
édite le service, ni qui l'héberge, ni comment joindre l'éditeur : le jour de
l'ouverture au public, une mention légale inaccessible.

Les textes et l'identité de l'éditeur ont donc quitté `app-02` pour
**`js/legal-textes.js`**, script de tête chargé juste après `access-gate.js` (donc
inliné dans `index.html` par `scripts/build.js`, jamais dans `app.js`) :

| Symbole | Rôle |
|---|---|
| `PASSIO_EDITEUR`, `PASSIO_CGU_VERSION`, `PASSIO_CONFIDENTIALITE_VERSION` | inchangés, toujours globaux |
| `passioTexteMentionsLegales()`, `passioTexteCGU()`, `passioTextePolitique()` | le **corps** de chaque texte, sans titre ni boutons |
| `_legalEscapeHtml` | même table que `escapeHtml` (app-02), qui n'existe pas encore quand le rideau s'affiche ; inscrit comme désinfectant dans `scripts/audit-echappement.js` |

`openLegalNotice`, `openTermsOfService` et `openPrivacyPolicy` (app-02) ne sont
plus que des enveloppes (`_legalModale`) : titre, corps défilant, boutons. L'écran
du rideau rend le **même** corps dans `#pgLegalPanel`.

⚠️ **Une seule source, mesurée à l'octet** : `access-gate.spec.js` compare
l'`innerHTML` du panneau du rideau à celui de la modale d'app-02, pour les trois
textes. Toute retouche d'un texte se fait dans `legal-textes.js`, jamais dans une
enveloppe. Les rendus des quatre modales (mentions en régime particulier et en
régime société, CGU, politique) ont été mesurés **identiques avant et après** le
déplacement (1 812, 1 654, 7 557 et 4 713 caractères).

⚠️ **Lire n'est pas entrer — et `aria-modal` n'isole rien par lui-même.** La
relecture indépendante du lot a trouvé que Shift+Tab depuis le bouton × rejoignait
les trois liens puis **le champ du code**, invisibles sous l'overlay : quatre
chiffres tapés là déverrouillaient l'application pendant la lecture. Quatre
couches, de la plus forte à la ceinture :

| Couche | Ce qu'elle ferme |
|---|---|
| `card.inert = true` à l'ouverture, levé à la fermeture | Tab, clic et lecteur d'écran ne peuvent plus atteindre la carte du code |
| `legalClose.focus()` | le clavier part sur le panneau, pas sur le champ |
| `focusInput` s'abstient tant que `legalOuvert` est posé | le focus différé de 700 ms du démarrage ne reprend pas la main (mesuré avec `page.clock` : sans horloge simulée, le clic arrive toujours après `load` et le cas ne mesure rien) |
| garde de saisie (`input.value = ""` si un texte est ouvert) | navigateurs sans `inert` |

Échap s'écoute au niveau du **document** : un clic sur un paragraphe du corps pose
le focus sur `<body>`, et un keydown ciblé sur `<body>` ne traverse jamais
`#passioGate`. La carte du panneau est focalisable (`tabindex="-1"`).
`#pgLegalPanel[hidden]{display:none}` est obligatoire : `[hidden]` ne replie rien
sur un `display:flex` (fiche 19).

⚠️ **Pas de repli silencieux** : si `legal-textes.js` manque, le panneau ÉCRIT
« Texte indisponible ». `dist-build.spec.js` l'attrape sur l'artefact de
production, où c'est le build qui décide de ce qui vit en tête de page.

Verrous : `tests/e2e/access-gate.spec.js` (+6 : lisibles sans code · lire ne
saisit rien · première seconde · inerte, mesuré après **chaque** Shift+Tab · Échap
après un clic dans le texte · source unique) et `tests/e2e/dist-build.spec.js`
(+1 : sans `app.js`).

**Réinjection** (2026-09-11, sept mutations, fichiers restaurés à l'octet près) :

| Mutation | Verdict |
|---|---|
| script de tête `legal-textes.js` retiré | rougit (3 cas : sans code, source unique, artefact sans `app.js`) |
| focus non déplacé sur le panneau | rougit (clavier va au panneau, première seconde) |
| source unique cassée (texte différent dans la modale) | rougit (source unique) |
| `inert` retiré | rougit (inerte) |
| `inert` **et** garde de saisie retirés ensemble | rougit (inerte) |
| garde de `focusInput` retirée seule | **reste vert** : `inert` rend `input.focus()` inopérant |
| `tabindex=-1` retiré seul | **reste vert** : Échap s'écoute déjà sur le document |

Les deux verts sont une défense en profondeur assumée, pas un trou : chaque couche
est doublée par une plus forte, et le verrou protège le comportement, pas chaque
couche. Une version antérieure du cas « première seconde » attendait 900 ms après
`page.goto` : le clic arrivait toujours après le minuteur, et retirer la garde
laissait le cas vert — c'est la réinjection qui l'a dit.

## 6. Verrous

`tests/e2e/cgu-consentement.spec.js` (11 cas) :

| № | Ce qu'il empêche |
|---|---|
| ① | La case revient en mode connexion, ou perd sa rangée (texte sous la case). |
| ② | Un compte créé sans accord — mesuré par « `signUp` n'est jamais appelé ». |
| ③ | L'accord n'est plus tracé, ou perd sa version. |
| ④ | Lire les CGU coche la case (piège du label). |
| ⑤ | Le bouton Google contourne le consentement en création. |
| ⑥ | Le consentement est redemandé à la connexion Google. |
| ⑦ | Les CGU perdent un engagement que le code applique. |
| ⑧ | Régime « particulier » : un `[à compléter]` revient là où la loi n'exige rien, l'adresse de l'hébergeur se réduit à un nom de marque, ou un article abrogé (`6-III`, `6-I-5`) est cité. |
| ⑧ bis | Régime « societe » : `regime` figé sur « particulier » sans qu'aucun verrou ne s'en aperçoive ; les huit champs redeviennent exigibles au basculement. |
| ⑨ | « À propos » redit une identité à lui. |
| ⑩ | **Le câblage** : les deux entrées des Paramètres, ouvertes au GESTE (hamburger → Support → bouton), jamais par `page.evaluate`. |

Deux suites existantes ont été mises à jour, parce que la garde est sur leur
chemin : `confirmation-email.spec.js` (coche la case par un vrai clic) et
`exploration-anonyme-vs-compte.spec.js` (pose `checked = true` avant
`onbDoAuth`).

## 7. Ce qui reste ouvert

1. **Le jour où une société existe** : basculer `PASSIO_EDITEUR.regime` sur
   `"societe"` et renseigner les huit champs. **Obligatoire dès le premier
   encaissement**, pas plus tard.
2. **Confirmer l'entité Supabase** sur une facture ou le contrat (voir §2).
3. **Vérifier que la condition ② de l'anonymat tient** : l'identité de l'éditeur
   doit être connue de Netlify (compte nominatif).
4. **Relecture par un juriste** des deux textes.
5. **Région d'hébergement des données** : la politique de confidentialité annonce
   « UE/US ». À confirmer sur le projet Supabase — pour le RGPD, une région UE
   simplifie beaucoup.
6. **Chaîne de modération** : les CGU promettent un examen des signalements
   « dans les meilleurs délais ». Les signalements arrivent en base, **rien ne
   les notifie encore à un humain**. Le DSA (art. 16) attend en outre un accusé
   de réception et une motivation de la décision.
7. **Médiateur de la consommation** : à souscrire si le service devient payant.
