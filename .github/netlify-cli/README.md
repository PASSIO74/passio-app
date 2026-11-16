# netlify-cli et Deno, figés : ce qui tourne avec le jeton de déploiement

Les jobs `deploy` (production) et `preview` de `deploy.yml` exécutent la CLI Netlify avec
`NETLIFY_AUTH_TOKEN`, dans leur étape d'envoi (en production, après le contrôle « Artefact identique »).
Pour regrouper les fonctions de bord, cette CLI exécute Deno, avec le même jeton dans son environnement. Rien de cela ne vient plus de
« la dernière » version publiée :

- **netlify-cli et ses dépendances.** `package.json` et `package-lock.json` de ce dossier sont copiés
  dans `$RUNNER_TEMP/netlify-cli`, puis installés par `npm ci --ignore-scripts`. L'arbre entier est
  figé : 1 010 entrées après le correctif du 16/11, dont environ 950 installées suivant la plateforme. `npm ci` vérifie chaque
  archive par son empreinte sha512.
- **Deno.** L'étape « Installer Deno » de `deploy.yml` prend l'archive d'une version exacte dans la
  release GitHub de `denoland/deno`, vérifie son empreinte sha256, puis pose Deno sur le PATH :
  `@netlify/edge-bundler` prend un Deno du PATH quand sa plage principale l'accepte. Elle rend aussi
  impossible tout téléchargement par edge-bundler, en posant un fichier là où il créerait ses dossiers. Si
  ce Deno n'était pas retenu, le déploiement échouerait avant l'envoi, au lieu d'exécuter un Deno non
  vérifié. C'est aussi le sort du pont hérité d'edge-bundler (Deno 1.x, `deno-cli-v1`, qui ne prend
  jamais le PATH) : une fonction de bord à « import assertions » ferait échouer l'envoi.

Les verrous :

- `tests/unit/outils-ci-figes.test.mjs` (dans `npm run verif`) : lockfile, étapes, plages de Deno, et
  50 réinjections ;
- `scripts/audit-workflows.js` lit chaque workflow et action composite par le lecteur YAML fermé du dépôt,
  et toute valeur comme du shell, libellés exceptés (noms, `run-name`, `author`, `description`). Il refuse
  les installations npm et npx hors lockfile qu'il reconnaît, pnpm, yarn et bun, un `npm ci`, `rebuild`,
  `uninstall` ou `prune` sans `--ignore-scripts` lu avec certitude, et un shell qui lit son script sur un
  tube. Une forme qu'il sait ne pas lire est refusée : un YAML hors du sous-ensemble du lecteur, une option
  devant la sous-commande de npm ou devant l'outil de npx. Il refuse aussi tout `npm-shrinkwrap.json`,
  `.npmrc` ou `.netlify/` suivi. C'est un filet contre le retour des formes naturelles, pas une barrière :
  une commande recomposée (variable, accolades, expression `${{ }}`) lui échappe, comme un script lu dans
  un fichier. Ses limites sont écrites en tête du script. `node scripts/reinjections-audit-workflows.mjs`
  et `node scripts/differentiel-audit-workflows.mjs <révision>` (hors verif) l'éprouvent avant toute
  réécriture.
- La gate ne voit pas un `npx <outil>` sans version. Pour la CLI Netlify, le banc refuse, dans les
  workflows et actions composites que lit la gate, une ligne qui porte `netlify-cli@` et toute commande
  qui nomme `netlify` ou `netlify-cli`, lue comme la gate la lit (le script d'un shell relu compris). Un
  nom recomposé lui échappe aussi.

## Pourquoi

- **Le 2026-09-09.** `@netlify/build@36.4.8`, publiée à 15:11:46 UTC, exigeait `@netlify/config@^25.2.5`,
  publiée deux minutes plus tard (15:13:49) : dans l'intervalle, l'installation de netlify-cli tombait
  en ETARGET. Seul un aperçu de PR a échoué (run 34368516164, 76 s avant la publication) ; les
  déploiements de production du jour sont restés verts. C'était déjà une version fraîche entrée dans le
  job, comme le 14/11. D'où un `overrides` (`@netlify/build` 36.4.7), qui a gardé l'arbre éprouvé
  jusqu'au 15/11. Il a été retiré en montant netlify-cli à 27.16.2, qui exige `@netlify/build` ^37.7.2 :
  le lockfile, lui, empêche désormais une version fraîche d'entrer.
- **Le 2026-11-14 à 11:29 UTC** (run 43588829557, tentative 1). Le déploiement de production a échoué
  en E404 sur `fast-json-stringify` 7.3.6, publiée une minute plus tôt et pas encore servie par le CDN ;
  relancé quatre minutes plus tard, il est passé. Une version
  malveillante fraîche serait entrée aussi vite, et elle aurait pu réécrire `dist/` après le contrôle.
  Sa relecture a montré que la CLI téléchargeait en plus, à chaque déploiement, le dernier Deno publié
  (`dl.deno.land/release-latest.txt`), sans vérifier d'empreinte.

## D'où viennent ces versions

**Le lockfile** a été régénéré le 2026-11-15, avec npm 11 (comme le lockfile racine), pour monter
netlify-cli de 27.1.2 à 27.16.2 et retirer l'`overrides` du 9/09, par :

    npm install --package-lock-only --ignore-scripts --no-audit --no-fund --before=2026-11-08T00:00:00Z

Avec `--before`, npm ne retient que les versions publiées avant cet instant. 27.16.2 (2026-11-02) est la
dernière netlify-cli publiée depuis au moins 7 jours. 27.19.0 (2026-11-13), que propose `npm audit`,
n'avait que 2 jours, et 27.16.2 corrige déjà les dix avis élevés.

- **Vérifié.** La date de chaque version de ce lockfile a été relue sur le registre : aucune n'est
  postérieure à cet instant. La plus récente est `import-in-the-middle@3.6.0`, du 2026-11-06 à 19:43 UTC.
- **`@netlify/edge-bundler`** reste en 16.2.0, seule copie de l'arbre : la plage Deno (`^2.4.2`) ne
  change pas, et Deno 2.9.8 y entre.
- **Le runner exécute npm 10.9.9.** Il lit les champs `libc` qu'écrit npm 11, mais il les retire s'il
  RÉÉCRIT le lockfile : régénérer avec npm 11.

L'arbre précédent (27.1.2, généré le 14/11 avec `--before=2026-11-07T10:49:27Z`, 1 180 entrées,
« added 1120 packages » sur le runner) reprenait celui du déploiement de production du run 42364454758.

**Deno 2.9.8**, publié le 2026-10-21, est celui que désigne `dl.deno.land/release-latest.txt` (relu le
14/11) : celui que les déploiements téléchargeaient depuis sa sortie.
Son empreinte vient de la release GitHub, où elle est attestée deux fois : le `digest` que GitHub
calcule pour l'asset, et le fichier `.sha256sum` que Deno y publie.

L'archive de `dl.deno.land` est une autre : le même binaire, octet pour octet, suivi de 19 octets qui
marquent le canal « lts ». C'est pourquoi l'archive vient de GitHub, pas de là.

Les quatre paquets de l'arbre qui ont un script d'installation ne s'en servent pas pour
`netlify deploy` ; `--ignore-scripts` les saute :

- `esbuild` vérifie son binaire, que la dépendance de plateforme fournit (son repli téléchargerait) ;
- `sharp` vérifie le sien ;
- `unix-dgram`, optionnel, compile un module natif que `hot-shots` ne charge qu'à la demande (statsd
  par socket Unix, côté build Netlify) ;
- `netlify-cli` installe l'autocomplétion et affiche un message.

Le job « Déploiement preview (PR) » installe et exécute ces outils sur chaque PR : un vrai
`netlify deploy`, fonctions de bord comprises. C'est la seule exécution avec le jeton avant la
production, mais **ce n'est pas un contrôle requis** par la protection de `main`. Une PR qui change ces
outils ne se fusionne donc qu'avec son aperçu VERT, une fois sa contre-revue faite : la gouvernance
relancée, l'aperçu repart. Une PR Dependabot ne peut pas l'avoir (voir plus bas).

## `deploy --no-build` (depuis le 2026-11-15, PR 947)

Les deux jobs appellent `netlify deploy --no-build`. `dist/` est déjà construit et éprouvé par les
gates : relancer la phase de build de Netlify (`@netlify/build`, sa configuration, ses plugins)
n'exécutait que du code de plus avec le jeton.

Dans netlify-cli 27.1.2 comme dans 27.16.2 (`dist/commands/deploy/deploy.js`, relu dans les deux), sans build :

- `bundleEdgeFunctions` lance la seule étape `edge_functions_bundling` de `@netlify/build`
  (`runCoreSteps`), avec le même edge-bundler et le même Deno du PATH. Le journal l'écrit sous la forme
  « Bundling edge functions... » puis « Finished bundling edge functions », au lieu de la section
  « Netlify Build » ;
- `runDeploy` relit les `headers` et `redirects` de `netlify.toml`, ainsi que `_headers` et `_redirects`
  dans `dist/`, et les envoie avec le déploiement.

**Éprouvé sur l'aperçu `pr-947`** (run 43724871406) :

- les fonctions de bord sont regroupées. Netlify en a demandé 0 parce que l'empreinte du paquet était
  déjà connue : c'est le même paquet que celui qu'avait produit le build complet ;
- 11 routes ont été relevées par `curl -D -` : `/`, `/index.html`, `/media/*`, `/demo/*`, `/p/*`,
  `/u/*`, `/e/*`, `/manifest.json`, `/sw.js`, `/pilotage/` et une page 404. Leur statut, `Location` et
  en-têtes (CSP, `X-Frame-Options`, `Cache-Control`, etc.) sont identiques à ceux de la production et de
  l'aperçu `pr-920`, construit sans l'option.

**Pas de gain de temps mesurable.** L'étape d'envoi durait 6 à 9 s avant, et 6 s avec l'option : le
démarrage de la CLI domine, et le build sautait déjà en 2,4 s. L'option est gardée pour la surface
d'exécution, pas pour la vitesse.

**À refaire à chaque montée de netlify-cli :** relire `bundleEdgeFunctions` et `runDeploy` dans le
`deploy.js` de la nouvelle version, puis lire dans le journal de l'aperçu « Finished bundling edge
functions ». Si cette ligne manque, les fonctions de bord ne partent plus : `/p/*` cesse de rediriger,
et `/media/*` ne passe plus par le cache.

## Mettre à jour

**Pour netlify-cli**, ou pour appliquer un correctif de sécurité :

1. Dans ce dossier, changer la version de `netlify-cli` dans `package.json`. Elle doit être exacte,
   sans `^` ni `~`.
2. Lancer `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --before=<date ISO d'il y a au moins 7 jours>`.
   - Jamais un `npm install` nu : il prendrait les versions de la minute, et exécuterait leurs scripts
     sur le poste.
   - Pour un correctif de sécurité, une date plus récente est acceptable, en le disant dans la PR.
3. Lancer `node --test tests/unit/outils-ci-figes.test.mjs`.
   - Si `@netlify/edge-bundler` a changé de version, le banc rougit : lire `DENO_VERSION_RANGE` dans
     son `dist/node/bridge.js`, l'inscrire au banc, et vérifier que le Deno figé y entre.
4. Ouvrir la PR, et ne la fusionner qu'avec « Déploiement preview (PR) » vert.

**Pour Deno :**

1. Choisir une version publiée depuis au moins 7 jours, qu'acceptent toutes les plages du banc.
2. Lire l'empreinte de l'archive dans la release : `gh api repos/denoland/deno/releases/tags/v<X.Y.Z> --jq '.assets[] | select(.name == "deno-x86_64-unknown-linux-gnu.zip") | .digest'`.
3. La comparer au fichier `deno-x86_64-unknown-linux-gnu.zip.sha256sum` de la même release.
4. Changer `DENO_VERSION` et `DENO_ZIP_SHA256` dans les DEUX jobs de `deploy.yml` (deploy et preview).

## Avis de sécurité connus, et PR Dependabot

`npm audit --omit=dev` dans ce dossier :

- **2026-11-14, netlify-cli 27.1.2** : 23 avis, 2 faibles, 11 modérés, 10 élevés, aucun critique. Ils
  étaient déjà dans l'installation flottante ; le figeage les a rendus visibles.
- **2026-11-15, netlify-cli 27.16.2** : 18 avis, 2 faibles, 16 modérés, **aucun élevé**, aucun critique.
  Les modérés restants (`minimatch`, `glob`, `deepmerge`… sous `@netlify/build` et
  `zip-it-and-ship-it`) étaient aussi dans l'arbre de 27.19.0, dernière version publiée lors de cette mesure.

### Correctif ciblé du 2026-11-16

La reproduction du lockfile initial retrouve **13 avis modérés agrégés**, aucun élevé ou critique :
`minimatch@10.2.6` et `glob@13.0.7` sous `@vercel/nft@1.3.1`, ainsi que leurs parents.
Les [avis minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) et
[glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) désignent respectivement 11.0.1 et 14.0.2
comme versions corrigées. L'[avis deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
a été **retiré le 16/11**, sans version corrigée ; sa disparition du nouvel audit ne constitue pas un patch.

Une montée de CLI seule ne résout pas ces avis : [27.20.0](https://github.com/netlify/cli/releases/tag/v27.20.0),
publiée le 16/11 à 18:57 UTC et vérifiée aussi sur npm, conserve `@netlify/build ^37.7.6`,
`@netlify/build-info ^11.3.1` et `@netlify/zip-it-and-ship-it ^16.6.0`. Ces versions demandent encore
`minimatch ^10.2.4` ; zip épingle nft 1.3.1, qui demande `glob ^13.0.0`. Le downgrade CLI 15.4.1
suggéré par npm audit n'est pas appliqué. La CLI éprouvée reste donc **27.16.2**.

Les deux substitutions sont limitées aux **six parents et versions exacts** inventoriés :

| Parent du sélecteur npm | Dépendance substituée | Version cible |
| --- | --- | --- |
| `@netlify/build@37.7.6` | minimatch | `11.0.1` |
| `@netlify/build-info@11.3.1` | minimatch | `11.0.1` |
| `@netlify/zip-it-and-ship-it@16.6.0` | minimatch | `11.0.1` |
| `@typescript-eslint/typescript-estree@8.72.1` | minimatch | `11.0.1` |
| `readdir-glob@3.0.0` | minimatch | `11.0.1` |
| `@vercel/nft@1.3.1` | glob | `14.0.2` |

Chaque valeur imbriquée est une version exacte. Les copies saines glob14.0.4 et son
minimatch11.0.5 restent inchangées. Le contrôle refuse un parent absent ou d'une autre
version : une mise à jour impose de réexaminer la portée, pas d'ignorer une substitution.

**Écart npm reproduit le 16/11 :** les anciens sélecteurs globaux conditionnels
`minimatch@10.2.6` et `glob@13.0.7` passent avec npm11.13.0, mais le vrai
`npm ci` de npm10.9.9 (runner Node22) refuse le même lockfile avec EUSAGE et
« Missing: minimatch@10.2.6 ». La copie locale avec npm10.9.9 officiel a reproduit
ce rouge. Les sélecteurs par parent passent ensuite en dry-run avec npm10 et npm11. La vraie
installation npm10.9.9 puis les29 tests (dont Deno natif) sont verts, sans
réécrire le lockfile ni changer ses versions ou empreintes. Aucun changement de
CLI, outil d'installation en CI ou option de contournement du lockfile n'est requis.

Les deux versions corrigées ont été publiées le 27/10/2026 (minimatch à 22:26:03 UTC,
glob à 22:07:00 UTC), dates relues sur le registre npm. Le nouvel audit JSON valide retourne
**zéro avis** ; ce résultat ne désigne pas deepmerge comme corrigé.

Régénération par npm 11.13.0, sans scripts ni secrets, avec un cutoff d'au moins sept jours :

```sh
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --before=2026-11-09T00:00:00Z
npm ci --ignore-scripts --no-audit --no-fund
```

Ce sont des changements majeurs internes, pas une compatibilité déduite du numéro de version.
Les changelogs [minimatch 11](https://github.com/isaacs/minimatch/blob/v11.0.0/changelog.md) et
[glob 14](https://github.com/isaacs/node-glob/blob/v14.0.0/changelog.md) ont été relus : suppression
de makeRe/AST/regexp et changement des Matchers, ignores absolus et chemins Windows notamment.
Le banc `tests/integration/outils-netlify-compat.test.mjs` exige les dépendances réellement installées
et échoue si elles manquent. Il ferme l'environnement et bloque le réseau avant les imports tiers.

| Consommateur installé | Contrat vérifié sur données synthétiques |
| --- | --- |
| build 37.7.6 | fichiers à scanner, exclusions relatives/dotfiles, scan d'une valeur synthétique |
| build-info 11.3.1 | découverte/exclusion de workspaces, globParts/pattern/negate |
| zip 16.6.0 | normalisation des motifs, includedFiles/exclusions, liste des fichiers et archive nft réelle |
| typescript-estree | vrai prédicat defaultProject extrait du module, dot:true, dépendance résolue réelle |
| readdir-glob | événements match, ignore/skip, dot/nodir ; matchBase/nocase/noglobstar dans la matrice |
| nft 1.3.1 | require dynamique et assets analysés sans exécution, glob absolu/ignore/node_modules/dot/mark/nodir |

La matrice de motifs appelle ESM et CommonJS de chaque résolution. Le test d'annulation n'utilise que
trois dossiers synthétiques ; aucun motif de déni de service n'est exécuté. Les APIs supprimées ne
sont pas employées par les consommateurs recensés. Toute nouvelle copie ou nouveau consommateur
fait réexaminer cette preuve ; ce banc ne prouve pas l'équivalence sur tous les motifs possibles.

Commande depuis la racine : `node --test tests/integration/outils-netlify-compat.test.mjs`.
Au poste Windows, le banc a été exécuté sous Node **22.23.5**, binaire officiel dont le SHA256
a été comparé à SHASUMS256 avant exécution : **15 tests verts, aucun skip**. Sur la baseline,
les comportements attendus passent et le contrôle des versions corrigées est rouge. `npm ci`
réinstalle 947 paquets sur ce poste, sans scripts. Cela ne remplace pas la preuve sur Ubuntu.
Le workflow `netlify-compat.yml` installe le lockfile sans scripts ni secrets et impose audit JSON
sans avis puis ces vrais callers sur **Ubuntu et Windows, Node 22**. Il doit être vert avant fusion.

### Preuve de bundling Edge natif

Le complément `tests/integration/outils-netlify-edge.test.mjs` appelle le **vrai bundle() de
edge-bundler 16.2.0**, avec **Deno 2.9.8**. Il copie les trois Edge canonicales du dépôt et leurs
helpers dans une fixture, compare leurs octets, exige quatre commandes Deno réelles réussies
(ESZIP et trois extractions de configuration), puis vérifie les cinq routes, leur phase cache,
le manifeste, l'empreinte du fichier ESZIP et les sources relues par le vrai parseur WASM.
Les handlers ne sont jamais appelés. Deno absent/mauvaise version et repli vers un téléchargement
font échouer le test ; aucun skip n'est utilisé.

**Mesuré localement sous Windows : deux tests verts**, Node 22.23.5 et Deno officiel 2.9.8.
L'archive Windows a été vérifiée contre le digest GitHub et son fichier sha256sum :
`cba84b26e0df5ae7f74fc66b86a95b866872a86292ebd84fa1e959927edd93bf`.
Le job Ubuntu du workflow emploie la même version et l'archive Linux officielle figée par
deploy.yml, SHA256 `e890975bc2549807bbcc0b584ffafda72cc7c93349dd99c80483dd784f6c4609`.
Il reste à obtenir ce résultat **réel en CI Linux** avant fusion.

Le processus ferme son environnement avant les imports et outils. Un pont réduit les droits du
vrai Deno : imports distants et npm désactivés pour ESZIP/inspection, JS réseau/run/FFI refusés,
lecture limitée aux fixtures et au paquet, écriture au temporaire. Une sonde du vrai runtime
vérifie le refus réseau/run/FFI. Il ne s'agit pas d'un confinement général du poste ou de Node.

L'extracteur de configuration exige le bootstrap de types officiel, même pour `import type` :
**seules ses trois commandes** autorisent la résolution des imports sur `edge.netlify.com:443`.
Le cache neuf doit contenir exactement `https://edge.netlify.com/bootstrap/globals/types.ts`,
670 octets de source, SHA256 `eaa6148ded3121d8dee62dd91c86e7fe76601df0f3ca8d7962243a30f4c8935f`.
Son import type relatif de context.ts n'est pas chargé par ces commandes. Tout autre cache distant
ou changement de cette source fait échouer la preuve. Les fetch applicatifs restent refusés par
Deno. Le check facultatif Node `https://edge.netlify.com/version.txt` est bloqué et recensé ;
aucune mise à jour de types ni téléchargement du dernier Deno n'est accepté.

Commande, depuis la racine et avec le binaire officiel vérifié :
`PASSIO_TEST_DENO_BIN=/chemin/absolu/deno node --test tests/integration/outils-netlify-edge.test.mjs`.
Ce bundling local ne prouve pas un déploiement ni la cible hébergée. Les trois jobs de
netlify-compat, la contre-revue, la gouvernance et l'aperçu autorisé restent requis avant fusion ;
aucun nouveau lockfile ne doit recevoir le jeton de production avant leur validation.

**Une PR Dependabot de ce dossier ne se fusionne jamais telle quelle.**

- Elle tourne sans les secrets du dépôt : son job « Déploiement preview (PR) » n'a pas de jeton, et
  il échoue par construction. L'épreuve de bout en bout n'a donc jamais lieu.
- Elle ne sait pas que l'`overrides` contredit la nouvelle version.

On la refait par une PR ordinaire : régénération documentée, `overrides` revu, aperçu avec le vrai jeton.

Ce dossier est sous `.github/` :

- toute modification y est « critique » pour la gouvernance et demande une contre-revue ;
- l'agent de réparation n'a pas le droit d'y toucher ;
- Dependabot y signale les avis et n'y propose que des correctifs de sécurité (`.github/dependabot.yml`).
  Son délai de 7 jours ne vaut que pour les mises à jour de version, coupées ici : une PR de sécurité arrive
  sans délai, et la date des versions qu'elle apporte se relit à la main, comme au figeage.
