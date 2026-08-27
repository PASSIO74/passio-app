# CI — Reproductibilité du Netlify CLI (issue #172)

**Date** : 2026-08-27 · **SHA de base** : `5a2382999a4ecc1eaa8dee43c1eabb011d9041b2`
· **Risque** : critique (`.github/*`) · **État** : correctif appliqué dans cette branche
par épinglage explicite de `netlify-cli@27.3.1` dans les jobs preview et production.

> Claude Code a établi le diagnostic et les options ci-dessous mais son canal ne
> pouvait pas écrire dans `.github/*`. Codex a appliqué l'option B sur la même
> branche ; la CI et la contre-revue ancrée sur le SHA final restent obligatoires.

---

## 1. Incident et cause racine

Le run [#33109548608](https://github.com/PASSIO74/passio-app/actions/runs/33109548608)
échoue à la seule étape de déploiement :

```text
npx netlify-cli deploy --prod ...
npm warn exec ... netlify-cli@27.4.0
npm error ETARGET No matching version found for @netlify/ai@^1.0.1
```

Vérifié dans le dépôt au SHA de base — le CLI est invoqué **sans version épinglée**,
aux deux seuls endroits où il apparaît :

| Fichier | Ligne | Commande |
|---|---|---|
| `.github/workflows/deploy.yml` | 228 | `npx netlify-cli deploy --prod --dir dist …` |
| `.github/workflows/deploy.yml` | 254 | `npx netlify-cli deploy --dir dist --alias "pr-…" …` |

**La cause racine n'est pas `@netlify/ai`.** Elle est que chaque déploiement
résout `netlify-cli@latest` au moment de l'exécution, puis résout l'arbre transitif
par plages semver. Le dépôt fait donc dépendre sa mise en production d'un état du
registre npm qui peut changer entre deux runs, sans aucun commit. L'ETARGET du jour
(`netlify-cli@27.4.0` demandant `@netlify/ai@^1.0.1` alors que le registre ne publie
que `1.0.0`) en est le **symptôme** : n'importe quelle rupture amont ultérieure
reproduira la même panne.

Conséquence pratique : un déploiement peut échouer **alors que rien n'a changé côté
PASSIO**, et un déploiement peut réussir avec un CLI différent de celui du run
précédent. Ni l'un ni l'autre n'est acceptable pour une marche de production.

## 2. Pourquoi le run Claude n'avait pas appliqué le correctif

Trois blocages, tous vérifiés dans le canal Claude distant :

1. **Chemins de contrôle interdits à l'agent.** `.github/workflows/claude-code.yml`
   (étape « Chemin interdit ») refuse de publier tout travail touchant
   `.github/*`, `.claude/*`, `package.json`, `package-lock.json`, `scripts/*`,
   `tests/ci/*`, `migrations/*`. Or le correctif vit **exactement** dans ces chemins.
   Tenter la modification n'aurait pas produit un correctif : cela aurait fait
   échouer la publication et n'aurait rien livré du tout.
2. **Aucun droit d'exécuter `npm`, `npx` ou `node`.** L'agent ne peut donc ni
   installer, ni résoudre, ni prouver `netlify --version`.
3. **Aucun accès réseau au registre npm** (`curl` et `WebFetch` refusés). L'agent
   **ne peut donc pas vérifier quelles versions de `netlify-cli` sont réellement
   publiées**. La spécification interdit explicitement d'inventer une version :
   ce document n'en cite donc **aucune** comme cible, et laisse la sélection à
   l'étape de vérification du §4.

Ce qui est établi malgré tout, et n'exige aucun réseau : le diagnostic du §1, les
deux points d'appel exacts, et la forme du correctif ci-dessous.

## 3. Correctif retenu

### Option A — dépendance locale verrouillée (recommandée, doctrine officielle Netlify)

Seule option **réellement** reproductible : le lockfile fige l'arbre transitif entier,
donc l'ETARGET du §1 ne peut plus se produire, même si le registre bouge.

1. `package.json` → `devDependencies` : `"netlify-cli": "<VERSION_VERIFIEE>"`
   (version **exacte**, sans `^` ni `~`).
2. `package-lock.json` : régénéré par `npm install`, committé.
3. `.github/workflows/deploy.yml`, dans **les deux** jobs `deploy` et `preview`,
   après `setup-node` et avant l'étape de déploiement :

```yaml
      - name: Installer le Netlify CLI épinglé
        run: npm ci

      - name: Prouver le CLI (sans déployer)
        run: npx --no-install netlify --version
```

puis remplacer `npx netlify-cli` par `npx --no-install netlify` dans les deux
commandes (lignes 228 et 254). `--no-install` est important : il garantit qu'aucune
résolution réseau ne peut se substituer au CLI verrouillé.

*Réserve à peser en revue* : ce dépôt n'a aujourd'hui aucune installation `npm ci`
dans `deploy`/`preview` (les tests installent Playwright avec `npm install --no-save`).
Ajouter `npm ci` alourdit ces deux jobs et fait entrer la totalité de l'arbre du CLI
dans le lockfile du projet. Si ce coût est jugé disproportionné, prendre l'option B.

### Option B — épinglage explicite dans les deux commandes (diff minimal)

```diff
-        run: npx netlify-cli deploy --prod --dir dist --auth "$NETLIFY_AUTH_TOKEN" --site "$NETLIFY_SITE_ID"
+        run: |
+          npx --yes netlify-cli@<VERSION_VERIFIEE> --version
+          npx --yes netlify-cli@<VERSION_VERIFIEE> deploy --prod --dir dist --auth "$NETLIFY_AUTH_TOKEN" --site "$NETLIFY_SITE_ID"
```

```diff
-        run: npx netlify-cli deploy --dir dist --alias "pr-${{ github.event.number }}" --auth "$NETLIFY_AUTH_TOKEN" --site "$NETLIFY_SITE_ID"
+        run: |
+          npx --yes netlify-cli@<VERSION_VERIFIEE> --version
+          npx --yes netlify-cli@<VERSION_VERIFIEE> deploy --dir dist --alias "pr-${{ github.event.number }}" --auth "$NETLIFY_AUTH_TOKEN" --site "$NETLIFY_SITE_ID"
```

**La même version, littéralement, dans les deux jobs** — c'est le contrat demandé :
la preview doit exercer le CLI qui déploiera la production. Y mettre deux valeurs
différentes annulerait toute la valeur du changement.

⚠️ **Limite honnête de l'option B** : épingler `netlify-cli@X.Y.Z` ne fige que le
paquet racine. Ses dépendances restent résolues par plages au moment de l'exécution.
Une rupture amont **à l'intérieur** de ces plages reproduirait un ETARGET. L'option B
supprime la dérive de version du CLI, pas la dérive de son arbre. Seule l'option A
supprime les deux.

### Ce qui n'est touché dans aucune des deux options

Secrets, permissions du workflow, `NETLIFY_SITE_ID`, identifiants Netlify, site Netlify,
code produit, `js/`, `styles.css`, `index.html`, Supabase, migrations. Les drapeaux
`--auth`/`--site` et leur alimentation par `secrets.NETLIFY_AUTH_TOKEN` restent
strictement inchangés.

## 4. Sélection de la version — vérification indépendante

La version retenue est `27.3.1`. Elle est publiée, déclare Node `>=22.13.0` et dépend de `@netlify/ai@^1.0.0`, version disponible. Le tag Git officiel Netlify confirme ces métadonnées. La preview de cette PR doit encore prouver l'installation et le déploiement de bout en bout.

### Méthode de sélection conservée

`<VERSION_VERIFIEE>` doit être obtenue par exécution réelle, jamais par mémoire :

```bash
npm view netlify-cli versions --json | tail -30   # versions réellement publiées
npm view @netlify/ai versions --json              # constater la plage disponible
npm view netlify-cli@<candidate> engines dependencies
```

Règle de sélection : la version publiée la plus récente **dont l'installation se
résout effectivement** et dont `engines.node` accepte Node 22 (la version imposée par
`setup-node` dans les deux jobs). Preuve exigée avant de committer la valeur :

```bash
npx --yes netlify-cli@<candidate> --version   # doit installer PUIS afficher une version
```

**`27.4.0` est connue cassée au 2026-08-27** (c'est elle qui produit l'ETARGET) : ne
pas la retenir. Aucune autre version n'est nommée ici parce qu'aucune n'a pu être
vérifiée depuis ce run — voir §2.3.

## 5. Preuves exigées avant fusion

- [ ] `npm view` exécuté, sortie brute collée dans la PR (versions réellement publiées).
- [ ] `npx … netlify-cli@<VERSION_VERIFIEE> --version` vert, sortie collée.
- [ ] Le job **preview** de la PR passe : c'est la preuve de bout en bout que le CLI
      épinglé installe et déploie, **sans** toucher à la production.
- [ ] `git diff` limité à `.github/workflows/deploy.yml` (+ `package.json`,
      `package-lock.json` en option A).
- [ ] **Aucun déploiement manuel de production** n'a été lancé.
- [ ] Contre-revue GitHub par PASSIO74, ancrée sur le SHA final de la PR et portant
      le marqueur `Contre-revue technique indépendante` (exigence de l'étape
      « Gouvernance critique » de `deploy.yml`, lignes 36–67, déclenchée par `.github/*`).

## 6. Centre de pilotage / Sentinelle

Sans objet : le changement vit dans la chaîne de build GitHub Actions, hors du
périmètre observé par la télémétrie client et par la Sentinelle. Aucun drapeau,
aucun événement, aucune instrumentation à ajouter. Retour arrière = `git revert`
de la PR, qui restaure l'invocation non épinglée.
