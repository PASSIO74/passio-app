# netlify-cli et Deno, figés : ce qui tourne avec le jeton de déploiement

Les jobs `deploy` (production) et `preview` de `deploy.yml` exécutent la CLI Netlify avec
`NETLIFY_AUTH_TOKEN`, après le contrôle « Artefact identique ». Pour regrouper les fonctions de bord,
cette CLI exécute Deno, avec le même jeton dans son environnement. Rien de cela ne vient plus de
« la dernière » version publiée :

- **netlify-cli et ses dépendances.** `package.json` et `package-lock.json` de ce dossier sont copiés
  dans `$RUNNER_TEMP/netlify-cli`, puis installés par `npm ci --ignore-scripts`. L'arbre entier est
  figé : 1 180 entrées, dont environ 1 120 installées sur le runner Linux. `npm ci` vérifie chaque
  archive par son empreinte sha512.
- **Deno.** L'étape « Installer Deno » de `deploy.yml` prend l'archive d'une version exacte dans la
  release GitHub de `denoland/deno`, vérifie son empreinte sha256, puis pose Deno sur le PATH :
  `@netlify/edge-bundler` prend un Deno du PATH quand sa plage l'accepte. Elle rend aussi impossible
  tout téléchargement par edge-bundler, en posant un fichier là où il créerait ses dossiers. Si ce Deno
  n'était pas retenu, le déploiement échouerait avant l'envoi, au lieu d'exécuter un Deno non vérifié.

Les verrous :

- `tests/unit/outils-ci-figes.test.mjs` (dans `npm run verif`) : lockfile, étapes, plages de Deno, et
  33 réinjections ;
- `scripts/audit-workflows.js` : il refuse toute installation hors lockfile dans un workflow, un
  `npm ci` sans `--ignore-scripts`, et tout `npm-shrinkwrap.json` ou `.npmrc` suivi.

## Pourquoi

- **Le 2026-09-09.** `@netlify/build@36.4.8` exigeait une version de `@netlify/config` jamais publiée.
  L'installation tombait en ETARGET sur toutes les versions de netlify-cli, et le déploiement de
  production avec elle. D'où l'`overrides` (`@netlify/build` 36.4.7). La version manquante est publiée
  depuis : l'`overrides` ne sert plus qu'à garder l'arbre éprouvé en production depuis le 9/09. Le retirer
  revient à régénérer, donc à éprouver un nouvel arbre.
- **Le 2026-11-14 à 11:29 UTC** (run 43588829557). Le déploiement de production a échoué en E404 sur
  `fast-json-stringify` 7.3.6, publiée une minute plus tôt et pas encore servie par le CDN. Une version
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
  Tout a donc au moins 7 jours, le délai de Dependabot.
- **Non prouvé.** L'arbre n'est pas forcément identique, octet pour octet, à celui de ce run : son
  journal ne liste pas les versions installées.
- **Le runner exécute npm 10.** Il ignore les champs `libc` qu'écrit npm 11, et installe aussi les
  variantes musl de sharp et libvips. Cela ne change rien aux empreintes.

**Deno 2.9.8**, publié le 2026-10-21, est le Deno que les déploiements téléchargeaient depuis.
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
`netlify deploy`, fonctions de bord comprises. Une PR qui les change est donc éprouvée de bout en bout
avant sa fusion, une fois sa contre-revue faite.

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
4. Ouvrir la PR.

**Pour Deno :**

1. Choisir une version publiée depuis au moins 7 jours, qu'acceptent toutes les plages du banc.
2. Lire l'empreinte de l'archive dans la release : `gh api repos/denoland/deno/releases/tags/v<X.Y.Z> --jq '.assets[] | select(.name == "deno-x86_64-unknown-linux-gnu.zip") | .digest'`.
3. La comparer au fichier `deno-x86_64-unknown-linux-gnu.zip.sha256sum` de la même release.
4. Changer `DENO_VERSION` et `DENO_ZIP_SHA256` dans les DEUX jobs de `deploy.yml` (deploy et preview).

Ce dossier est sous `.github/` :

- toute modification y est « critique » pour la gouvernance et demande une contre-revue ;
- l'agent de réparation n'a pas le droit d'y toucher ;
- Dependabot n'y propose que des correctifs de sécurité (`.github/dependabot.yml`).
