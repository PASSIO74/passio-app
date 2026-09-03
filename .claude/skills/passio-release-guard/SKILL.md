---
name: passio-release-guard
description: "Contrôle de mise en production : barrière avant push sur main, feature flag, observation après coup, retour arrière."
---

# /passio-release-guard — Sur ce dépôt, pousser c'est déployer

## La contrainte structurante

`git push origin main` déclenche GitHub Actions → build → Netlify → **production**. Il n'y a **ni staging, ni canary, ni déploiement progressif**. Toute idée de « on promeut après observation » doit composer avec ça : la seule barrière réelle est **avant** le push.

Le complément de `/ship` : `/ship` exécute la séquence, ce skill décide si elle a le droit de partir et surveille ce qui suit.

## Avant de pousser — la barrière

```bash
node --check js/*.js
npm run audit:globals && npm run audit:handlers && npm run audit:echappement && npm run audit:tests
npx playwright test tests/e2e/authz-critical.spec.js     # gate d'autorisation, en premier
npx playwright test                                       # suite par défaut
node scripts/build.js dist/index.html                     # le build doit passer localement
```

Si le changement touche l'auth, une policy, la visibilité d'un contenu, la messagerie ou la synchro, ajouter :

```bash
PASSIO_E2E_MULTI=1 npx playwright test multi-comptes confidentialite
npm run purge:e2e
```

**Un rouge ne se contourne pas.** Un test flaky se diagnostique (`playwright-pieges-flaky`), il ne se relance pas jusqu'à obtenir du vert.

## Ce que la CI vérifie réellement

Le workflow lance les audits statiques, **puis le gate `authz-critical` à part et en premier** (incident `CI-GATE-001` : un rouge d'autorisation doit être lisible immédiatement, pas noyé dans 150 résultats), puis la suite. Les tests cross-compte, confidentialité et campagne QA sont **opt-in** et donc **absents de la CI** — c'est une limite connue, pas un oubli : les faire tourner en CI polluerait la base de production.

Conséquence pratique : **un changement cross-compte doit être testé en local avant le push**, la CI ne le fera pas.

## Feature flags

⚠️ **Rectifié le 2026-09-02 : le système de drapeaux EXISTE, et c'est le patron le plus répété du dépôt.** Cette section affirmait le contraire ; mesuré : 34 `window.PASSIO_*`, 43 coupures `localStorage`, 15 modules `js/ui-v*.js`. Chaque lot suit la MÊME double coupure — `localStorage.passio_<lot>="0"` ET `window.PASSIO_<LOT>=false`, prioritaires sur tout. Procédure complète : skill `/lot-drapeau`.

⚠️ **Le drapeau d'un lot en ligne ne sait plus qu'ENLEVER** : aucune valeur positive n'active, rien n'est écrit dans `localStorage`. Un kill switch qui laisserait les libellés du nouveau lot n'est pas un kill switch — la coupure doit rendre les MOTS aussi.

À part, et à ne pas confondre : les interrupteurs d'ENVIRONNEMENT (`window.PASSIO_TELEMETRY_DEFAULT_ON`, `DASH_SENTINEL_DEEP`, `PASSIO_E2E_MULTI`, `PASSIO_COUVERTURE`), et le système de flags du dashboard (`dashboard/server/checklist.js`, route `GET /api/flags`, capacité `flags`) — **orphelin : rien dans `js/` ne le lit**.

Pour un changement risqué et réversible, **ajouter un interrupteur avant de déployer** vaut mieux que compter sur un retour arrière : couper un drapeau est instantané, un rollback exige un cycle de déploiement complet.

## Après le déploiement — observer, pas espérer

```bash
curl -sI https://passio-app.netlify.app | head -5
```

```
execute_sql  (connecteur supabase-passio-readonly)
select message, count(*) n from client_errors where created_at > now() - interval '30 minutes' group by 1 order by n desc limit 10;
```

Comparer **au même intervalle avant** le déploiement — un décompte d'erreurs sans référence ne dit rien.

⚠️ **`origin/main` à jour ≠ production à jour.** Vérifier le contenu réellement servi, pas l'état du dépôt. Et deux faux négatifs déjà rencontrés : en local le service worker sert l'ancien script (désinscrire + vider les caches) ; en production le minifieur **renomme les identifiants** → ne chercher qu'un littéral (chaîne, regex), jamais un nom de variable.

## Retour arrière

```bash
git revert <sha> && git push origin main     # un nouveau déploiement, pas un rollback instantané
```

Deux points à connaître : `index.html` est non cacheable et les assets portent un hash de contenu — un onglet ouvert ne mélange donc pas deux versions (`version-skew.spec.js` garde cet équilibre). Mais une **migration déjà appliquée ne se révoque pas** avec le code : toute migration doit être compatible avec la version précédente du client, ou être poussée séparément et **avant**.

## Critères de réussite

- Audits statiques, gate d'autorisation et suite : verts, exécutés, cités.
- Le build local passe.
- Le cross-compte est passé en local si le changement le concerne.
- L'observation post-déploiement est comparée à une référence.

## Critères d'échec — ne pas pousser

- Un test rouge, ou relancé jusqu'au vert sans diagnostic.
- Une migration non compatible avec le client actuellement déployé.
- Un changement d'auth ou de RLS sans revue tierce ni test d'intrusion.
- Une session parallèle avec des fichiers non committés (risque de mélanger deux travaux — vécu le 2026-07-21).

## Format de résultat

```
RELEASE <sha> — <intitulé>
Audits statiques : <4 résultats>
Gate AUTHZ       : <n> invariants — VERT/ROUGE
Suite            : <n> passés, <n> flaky, <n> skippés, <durée>
Cross-compte     : exécuté / non applicable
Build            : <tailles>
Interrupteur     : <flag posé, ou aucun>
Après déploiement : erreurs <n> vs <n> avant, sur <fenêtre>
Retour arrière   : <procédure, et ce qu'elle ne défait pas>
```
