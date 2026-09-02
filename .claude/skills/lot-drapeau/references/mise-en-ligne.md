# Mettre un lot en ligne (aperçu → actif par défaut)

Procédure appliquée à UI-3A (#163), aux quatre lots UI-4 (2026-08-28),
`flat_passions_v1` (#238) et `first_run_experience_v1` (#239).

## 1. Le drapeau perd toute activation positive

Il ne sait plus qu'**enlever**. Concrètement :
- `localStorage.<clé>="0"` et `window.PASSIO_<LOT>=false` restent, prioritaires sur tout ;
- aucune valeur positive n'active ; **rien n'est jamais écrit** dans `localStorage` ;
- les anciens `?passio_preview=<lot>` sont tolérés mais **ne décident plus rien**.

⚠️ **Retirer le code lecteur de l'aperçu, ne pas le laisser mort.** `apercuDemande()`
et `PREVIEW_NAME` ont été SUPPRIMÉS au basculement du référentiel plat, pas laissés
sans lecteur. Une fonction d'activation encore présente mais sans appelant est un
piège pour la session suivante.

## 2. Les suites de test — la convention, et elle n'est pas négociable

Un basculement casse toutes les suites qui observaient le comportement
**historique**. Mesuré au basculement de `first_run_experience_v1` : mêmes 25
suites, `origin/main` sans le lot = 122 réussis / 3 échecs ; avec = 102 / 26. Les
23 écarts étaient tous la même famille.

**La règle : la suite pose la coupure au boot et GARDE TOUTES ses assertions.**
Jamais on ne retire une assertion pour faire passer un basculement.

**Les contrôles « URL normale = rien du lot » sont RETOURNÉS**, jamais supprimés :
ils deviennent des contrôles de kill switch. Une assertion dont la cible a disparu
doit exiger l'ABSENCE, pour qu'un retour silencieux reste visible.

Outil durable plutôt que rustine recopiée : `poserGateSansPremiereVisite(page)`
(`tests/e2e/gate-helper.js:24`) pose le jeton du gate ET la coupure, avec
l'explication écrite une seule fois. 25 suites l'utilisent.

⚠️ **Deux pièges de ce réalignement.**
1. **Un test qui TAPE le code d'accès n'a aucun script d'injection à remplacer** :
   un remplacement automatique du démarrage commun le rate, et lui seul reste
   rouge. Poser la coupure par SUITE, pas par cas — sinon un test ajouté plus tard
   hérite du piège en silence.
2. **Une suite qui teste le gate lui-même ne pose pas de jeton** : elle a besoin
   d'un `beforeEach` dédié. La coupure vit dans `localStorage`, le jeton du gate
   dans `sessionStorage` — les deux ne se croisent pas.

## 3. Le commentaire en tête du bloc CSS

Il doit suivre l'état RÉEL du drapeau. Cinq en-têtes de `styles.css` annoncent
encore « aperçu seulement » pour des lots actifs par défaut, dont un qui documente
une activation retirée depuis. Un commentaire faux coûte plus qu'un absent.

## 4. Ce qu'il faut avoir vu avant de dire « c'est en ligne »

Le job **« Déploiement production » VERT**. Rien d'autre ne le prouve. La garde
« Gouvernance critique » peut perdre une course avec l'indexation GitHub et faire
SAUTER le déploiement sans job rouge : relancer alors le seul job en échec.
