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

## 2. `PASSIO_EDITEUR` — une seule source, et aucune invention

⚠️ **`openAbout()` affichait une identité fabriquée** : « PASSIO SAS · France ·
contact@passio.app ». Trois informations qu'aucun document du dépôt n'établit,
et dont la dernière **contredisait** l'adresse réelle donnée par la politique de
confidentialité (`contact@ladamemetallerie.com`).

Une mention légale fausse trompe. Une mention légale visiblement inachevée se
complète. Tout champ vide de `PASSIO_EDITEUR` (app-02) s'affiche donc
**« [à compléter] » en clair, à l'écran**, dans les trois surfaces qui le lisent
(mentions légales, CGU, À propos).

### Champs à renseigner avant l'ouverture au public

Ils sont dans `js/app-02-state-utils.js`, dans l'objet `PASSIO_EDITEUR`, et
**nulle part ailleurs** — jamais recopiés dans un texte :

```
raisonSociale         formeJuridique      capital
siege                 rcs                 siret
tvaIntra              directeurPublication
```

Les deux champs `hebergeurSite` / `hebergeurDonnees` portent les **noms** vérifiés
(Netlify, Supabase) ; les adresses postales complètes restent à recopier depuis
les contrats — elles ne se devinent pas.

**Tant qu'ils sont vides, le site est en défaut vis-à-vis de la LCEN.** Le lot ne
prétend pas le contraire : il rend le défaut VISIBLE au lieu de le masquer sous
une identité plausible.

⚠️ **Un juriste doit relire les deux textes.** Ils sont écrits pour être justes et
lisibles, pas pour remplacer un conseil. Avoir un texte correct vaut infiniment
mieux que rien ; cela ne vaut pas une relecture.

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

- **13 ans minimum** — appliqué par `onbValidateAge` (app-02).
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

⚠️ `openModal` **n'empile pas** : ouvrir les mentions légales depuis les CGU
REMPLACE la modale. C'est voulu — le `×` injecté referme tout, et personne ne se
retrouve à fermer trois couches.

## 6. Verrous

`tests/e2e/cgu-consentement.spec.js` (10 cas) :

| № | Ce qu'il empêche |
|---|---|
| ① | La case revient en mode connexion, ou perd sa rangée (texte sous la case). |
| ② | Un compte créé sans accord — mesuré par « `signUp` n'est jamais appelé ». |
| ③ | L'accord n'est plus tracé, ou perd sa version. |
| ④ | Lire les CGU coche la case (piège du label). |
| ⑤ | Le bouton Google contourne le consentement en création. |
| ⑥ | Le consentement est redemandé à la connexion Google. |
| ⑦ | Les CGU perdent un engagement que le code applique. |
| ⑧ | Une identité d'éditeur inventée revient ; le nombre de « [à compléter] » suit exactement les champs vides. |
| ⑨ | « À propos » redit une identité à lui. |
| ⑩ | **Le câblage** : les deux entrées des Paramètres, ouvertes au GESTE (hamburger → Support → bouton), jamais par `page.evaluate`. |

Deux suites existantes ont été mises à jour, parce que la garde est sur leur
chemin : `confirmation-email.spec.js` (coche la case par un vrai clic) et
`exploration-anonyme-vs-compte.spec.js` (pose `checked = true` avant
`onbDoAuth`).

## 7. Ce qui reste ouvert

1. **Renseigner `PASSIO_EDITEUR`** — bloquant pour la conformité LCEN.
2. **Relecture par un juriste** des deux textes.
3. **Adresses postales complètes** des deux hébergeurs.
4. **Médiateur de la consommation** : le texte mentionne le droit d'y recourir ;
   l'adhésion à un médiateur reste à souscrire si le service devient payant.
5. **Chaîne de modération** : les CGU promettent un examen « dans les meilleurs
   délais ». Les signalements arrivent en base (`reports`) ; rien ne les notifie
   encore à un humain.
