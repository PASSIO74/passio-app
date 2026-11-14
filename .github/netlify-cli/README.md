# netlify-cli et Deno, figés : ce qui tourne avec le jeton de déploiement

Les jobs `deploy` (production) et `preview` de `deploy.yml` exécutent la CLI Netlify avec
`NETLIFY_AUTH_TOKEN`, dans leur étape d'envoi (en production, après le contrôle « Artefact identique »).
Pour regrouper les fonctions de bord, cette CLI exécute Deno, avec le même jeton dans son environnement. Rien de cela ne vient plus de
« la dernière » version publiée :

- **netlify-cli et ses dépendances.** `package.json` et `package-lock.json` de ce dossier sont copiés
  dans `$RUNNER_TEMP/netlify-cli`, puis installés par `npm ci --ignore-scripts`. L'arbre entier est
  figé : 1 180 entrées, dont environ 1 120 installées sur le runner Linux. `npm ci` vérifie chaque
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
  41 réinjections ;
- `scripts/audit-workflows.js` lit chaque workflow et action composite par le lecteur YAML fermé du dépôt,
  et TOUTE valeur comme du shell, un `name:` excepté. Il refuse les installations npm et npx hors lockfile,
  pnpm, yarn et bun, et un `npm ci` ou `npm rebuild` sans `--ignore-scripts` lu avec certitude. Une forme
  qu'il ne sait pas lire est refusée, jamais admise : un YAML hors du sous-ensemble du lecteur, une option
  devant la sous-commande de npm ou devant l'outil de npx. Il refuse aussi tout `npm-shrinkwrap.json`,
  `.npmrc` ou `.netlify/` suivi.
- La gate ne voit pas un `npx <outil>` sans version. Pour la CLI Netlify, le banc refuse, dans tous les
  workflows et actions composites, une ligne qui porte `netlify-cli@` et toute commande qui nomme `netlify`
  ou `netlify-cli` (`bash -c` et `eval` compris). Un nom recomposé par variable (`npx "$X"`) lui échappe.

## Pourquoi

- **Le 2026-09-09.** `@netlify/build@36.4.8`, publiée à 15:11:46 UTC, exigeait `@netlify/config@^25.2.5`,
  publiée deux minutes plus tard (15:13:49) : dans l'intervalle, l'installation de netlify-cli tombait
  en ETARGET. Seul un aperçu de PR a échoué (run 34368516164, 76 s avant la publication) ; les
  déploiements de production du jour sont restés verts. C'était déjà une version fraîche entrée dans le
  job, comme le 14/11. D'où l'`overrides` (`@netlify/build` 36.4.7) : il ne sert
  plus qu'à garder l'arbre éprouvé en production depuis le 9/09. Le retirer, c'est régénérer, donc
  éprouver un nouvel arbre.
- **Le 2026-11-14 à 11:29 UTC** (run 43588829557, tentative 1). Le déploiement de production a échoué
  en E404 sur `fast-json-stringify` 7.3.6, publiée une minute plus tôt et pas encore servie par le CDN ;
  relancé quatre minutes plus tard, il est passé. Une version
  malveillante fraîche serait entrée aussi vite, et elle aurait pu réécrire `dist/` après le contrôle.
  Sa relecture a montré que la CLI téléchargeait en plus, à chaque déploiement, le dernier Deno publié
  (`dl.deno.land/release-latest.txt`), sans vérifier d'empreinte.

## D'où viennent ces versions

**Le lockfile** a été généré le 2026-11-14, avec npm 11 (comme le lockfile racine), par :

    npm install --package-lock-only --ignore-scripts --no-audit --no-fund --before=2026-11-07T10:49:27Z

À 2026-11-07T10:49:27Z, le déploiement de production du run 42364454758 (commit `2d564265`, vert)
lançait ce même `npm install netlify-cli@27.1.2`, avec le même `overrides`. Son journal indique
« added 1120 packages ». Avec `--before`, npm ne retient que les versions publiées avant cet instant.

- **Vérifié.** La date de chaque version de ce lockfile a été relue sur le registre : aucune n'est
  postérieure à cet instant. La plus récente est `import-in-the-middle@3.6.0`, du 2026-11-06 à 19:43 UTC.
  Tout avait donc au moins 7 jours au figeage, la règle que suit le dépôt.
- **Non prouvé.** L'arbre n'est pas forcément identique, octet pour octet, à celui de ce run : son
  journal ne liste pas les versions installées.
- **Le runner exécute npm 10.9.9.** Il lit les champs `libc` qu'écrit npm 11 : « added 1120 packages »
  sur le runner, autant que le 7/11. Mais il les retire s'il RÉÉCRIT le lockfile : régénérer avec npm 11.

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

Le 2026-11-14, `npm audit` relève 23 avis dans cet arbre : 2 faibles, 11 modérés, 10 élevés, aucun
critique. Ils étaient déjà dans l'installation flottante, et le figeage les rend visibles. Les dix élevés
se corrigent en montant netlify-cli à 27.19.0, qui exige `@netlify/build` ^37.7.6 : il faut donc
retirer l'`overrides` et éprouver un arbre neuf. C'est une PR à part, qui suit la procédure ci-dessus.

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
