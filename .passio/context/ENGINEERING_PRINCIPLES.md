# Principes d'ingénierie PASSIO

> Résumé opérationnel. Le détail vit dans `../../CLAUDE.md` (invariants critiques) et `../../docs/PIEGES_CONNUS.md` (56 fiches). Ce fichier ne duplique pas, il hiérarchise.

## Invariants non négociables (extraits de CLAUDE.md)

1. **Recherche de post** : `findPostAnywhere(id)` — jamais `seed.posts.find || userPosts.find`.
2. **Timestamps** : `supaTs(s)` — jamais `new Date(x+"Z")` (prod mixe `timestamp`/`timestamptz`).
3. **Échappement contextuel** : `escapeHtml` (texte), `escapeJsArg` (arg JS dans onclick), `safeUrlAttr` (URL tierce). Tout payload tiers = échapper à l'affichage.
4. **Globals** : 17+ scripts partagent `window` ; une `function` top-level redéclarée est écrasée en silence → `npm run audit:globals` (CI). Ne jamais nommer un Set d'état comme une fonction.
5. **Catch large** : jamais de `catch(e){return []}` autour d'un chemin critique sans log (bug diagLog).
6. **onclick inline** : fonction globale existante (`npm run audit:handlers`).
7. **Supabase** : pas de requête dans `onAuthStateChange` ; SDK paresseux (`ensureSupabase()`) ; UPDATE/DELETE 0-ligne = RLS manquante ; pas de base64 en DB ; embed `profiles(...)` = 400 sans FK.
8. **Guards de rendu** : invalider `_feedDomSig`/`_lastHtml` sinon le prochain render saute.
9. **Build** : exactement 9 `app-*.js` entre marqueurs BUILD:APP, hoisting préservé, pas de modules ES.

## Style
Vanilla JS, fonctions globales, `$()`/`$$()`, garder les guards `if(!el)return;`, `toast()` jamais `alert()`. Écrire du code qui ressemble au code autour (densité de commentaires, nommage, idiomes).

## Definition of Done (feature)
produit validé · archi cohérente · sécurité + RLS vérifiées · schéma DB cohérent · tests ajoutés & verts · `audit:globals`/`audit:handlers` verts · build passe · perf acceptable · télémétrie définie · a11y vérifiée · doc à jour · aucune régression connue.

## Interdictions
Masquer une erreur · supprimer un test qui échoue · secret en clair/commité · faille connue introduite · migration destructive sans stratégie · duplication · contourner un contrôle de sécurité · TODO critique sans explication.

## Preuve, pas affirmation
Ne jamais dire « ça marche ». Dire : quels tests, quels résultats, quels fichiers changés, quels risques subsistent, ce qui n'a pas pu être vérifié.
