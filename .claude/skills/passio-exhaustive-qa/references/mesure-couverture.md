# Mesurer la couverture, et inventorier la surface

## L'enregistreur

Le serveur `scripts/serve-couverture.js` sert l'application **octet pour octet** et injecte l'enregistreur en fin de `<body>`. **Aucun fichier de `tests/` n'est touché** — ni pour produire le chiffre, ni pour l'améliorer. Sans `PASSIO_COUVERTURE=1`, la suite tourne exactement comme d'habitude.

## Trois pièges déjà rencontrés, à ne pas refaire

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

## Format du rapport de couverture

```
COUVERTURE — <date>, commit <sha>
Interactions        : <couvertes>/<total> (<%>) — PLAFOND
Écrans              : <n>
Specs / tests       : <n> / <n> (dont <n> opt-in)
Nouveaux scénarios  : <liste> — chacun mutation-testé ✅/❌
Non couvert assumé  : <domaine> — <justification>
Zone non testable   : <ce qui ne peut pas l'être automatiquement, et pourquoi>
```
