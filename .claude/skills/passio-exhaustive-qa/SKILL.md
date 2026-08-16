---
name: passio-exhaustive-qa
description: Inventorie la surface fonctionnelle réelle de PASSIO, génère les scénarios de test, tient la matrice de couverture à jour et désigne ce qui n'est PAS testé. À utiliser pour mesurer la couverture, décider quoi tester ensuite, vérifier qu'une fonctionnalité n'a pas été oubliée, ou quand Benjamin demande « qu'est-ce qui n'est pas couvert ? ».
---

# /passio-exhaustive-qa — Ce qui n'est pas mesuré n'est pas couvert

## Le chiffre de référence, et ce qu'il vaut

**66 interactions sur 435 s'exécutent pendant la suite complète : 15,2 %** (mesuré le 2026-08-16).

Ce chiffre est un **plafond, pas un plancher**. Une interaction compte comme couverte dès que sa fonction s'exécute — **même appelée depuis une autre fonction plutôt que par un clic**, et même sans qu'aucune assertion ne porte sur son effet. Le taux réellement *vérifié* est nécessairement plus bas.

Ne jamais présenter 15,2 % comme une borne prudente. C'est la définition la plus généreuse possible.

## Mesurer (ne jamais estimer)

```bash
node scripts/couverture-interactions.js   # dénominateur : 435 interactions
npm run couverture:mesure                 # exécute la suite avec l'enregistreur
npm run couverture                        # rapport
```

Le serveur `scripts/serve-couverture.js` sert l'application **octet pour octet** et injecte l'enregistreur en fin de `<body>`. **Aucun fichier de `tests/` n'est touché** — ni pour produire le chiffre, ni pour l'améliorer. Sans `PASSIO_COUVERTURE=1`, la suite tourne exactement comme d'habitude.

### Trois pièges déjà rencontrés, à ne pas refaire

1. **Une mesure vide ressemble à une couverture nulle.** En mode couverture, `reuseExistingServer` passe à `false` : si le port est pris, Playwright refuse de démarrer au lieu de mesurer zéro. Le cas s'est produit dès la première exécution.
2. **`const f = …` au niveau racine n'est pas une propriété de `window`** — l'enveloppe ne s'y pose pas, la fonction compterait comme jamais exécutée (piège connu de `state`). Vérifié : 0 interaction sur 435 est dans ce cas.
3. **Le dénominateur doit être recalculable par un script versionné.** Le « 445 » d'une première rédaction n'a jamais pu être reproduit ; la règle actuelle donne 435 et elle est écrite dans le script. Un nombre que personne ne sait refaire n'a pas sa place dans une qualification.

## Inventorier la surface

```bash
grep -o 'id="screen-[a-z]*"' index.html | sort -u          # 8 écrans
node scripts/audit-handlers.js                             # handlers inline → fonctions
supabase db query --linked "select count(*) from information_schema.tables where table_schema='public';"
ls tests/e2e/*.spec.js | wc -l
```

Répartition mesurée des 435 interactions : `app-03` 89 · `app-07` 76 · `app-05` 55 · `app-04` 53 · `app-06` 45 · `app-02` 40 · `app-08` 35 · `app-09` 27 · `emoji-misc` 10 · autres 2 · non localisées 13.

⚠️ Les 13 « non localisées » ne sont **pas** des fonctions fantômes : `npm run audit:handlers` vérifie à chaque CI que tout handler inline référence une fonction définie, et il est vert. C'est l'extraction par motif qui est incomplète.

## Décider quoi tester ensuite — par le risque, pas par le pourcentage

Remonter 15,2 % pour le plaisir de remonter un chiffre produit des tests qui n'attrapent rien. La priorité se lit dans cet ordre :

1. **Mutations cross-compte** — ce qu'un compte écrit et qu'un autre lit. C'est là que vivent les fuites et les usurpations.
2. **Écritures qui peuvent échouer en silence** — tout appel Supabase dont le `{ error }` n'est pas lu.
3. **Chemins secondaires d'une fonctionnalité bien traitée par ailleurs** — transfert vs envoi, suppression pour moi vs pour tous, groupe vs conversation directe. Le principal a les tests ; le secondaire hérite d'une copie plus ancienne.
4. **Reprises d'erreur** — hors-ligne, token expiré, quota dépassé, réponse tardive.
5. Le reste : options, panneaux, éditeurs.

## Écrire un scénario qui garde vraiment quelque chose

Chaque scénario porte au minimum : préconditions vérifiées (pas supposées), l'action, l'effet attendu **côté base** quand il y en a un, et la contre-épreuve.

**La contre-épreuve est obligatoire.** `conv-suppression.spec.js` teste que le message supprimé ne revient pas **et** que le non-supprimé n'est pas perdu — sans le second, un correctif qui effacerait tout passerait le premier. Idem pour `transfert-message.spec.js` : échec **et** succès.

Puis **mutation-tester** : casser le code exprès, voir le test rouge. Un test qui reste vert sans le correctif ne garde rien.

## Commandes

```bash
npx playwright test                                                  # suite par défaut
PASSIO_E2E_MULTI=1 npx playwright test multi-comptes confidentialite # cross-compte réel
PASSIO_QA_CAMPAIGN=1 npx playwright test qa-campaign                 # campagne
npx playwright test tests/e2e/authz-critical.spec.js                 # gate d'autorisation
npm run audit:tests                                                  # tests creux
npm run purge:e2e                                                    # nettoyer les comptes de test
```

⚠️ La suite écrit **dans la base de production** — il n'existe pas de base de test. Vérifier le nettoyage après toute campagne cross-compte (0 compte e2e résiduel).

## Critères de réussite

- Le dénominateur vient d'un script versionné, pas d'un comptage à la main.
- Chaque nouveau scénario est mutation-testé.
- La matrice distingue « exécuté » de « vérifié par assertion ».
- Toute fonctionnalité laissée `NON TESTÉ` porte une **justification explicite**.

## Critères d'échec

- Un pourcentage annoncé sans commande pour le reproduire.
- Un scénario sans contre-épreuve sur un correctif de suppression ou de filtrage.
- Une couverture améliorée en modifiant `tests/` pour flatter la mesure.

## Format de résultat

```
COUVERTURE — <date>, commit <sha>
Interactions        : <couvertes>/<total> (<%>) — PLAFOND
Écrans              : <n>
Specs / tests       : <n> / <n> (dont <n> opt-in)
Nouveaux scénarios  : <liste> — chacun mutation-testé ✅/❌
Non couvert assumé  : <domaine> — <justification>
Zone non testable   : <ce qui ne peut pas l'être automatiquement, et pourquoi>
```
