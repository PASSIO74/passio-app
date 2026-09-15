# MOD-04 — blocage côté serveur, preuve en production (2026-09-15, ~11:05 UTC)

Migration `migration_blocage_lecture_privee_2026-09-15.sql` appliquée en production (verdict 5 OK), puis
`preuve-mod04` exécutée contre la production via `preuve-prod.mjs` (deux comptes jetables `e2e_*@passio-e2e.test`,
purgés avec leurs lignes en fin de script).

```
avant blocage (B abonné accepté) : {"posts":{"status":200,"n":1},"stories":{"status":200,"n":1}}
après blocage, abonnement toujours accepté : {"posts":{"status":200,"n":0},"stories":{"status":200,"n":0}} follows = [{"status":"accepted"}]
visiteur sans compte : {"posts":{"status":200,"n":0}}
✅ PREUVE : bloqué, l'abonné accepté ne lit plus rien ; le visiteur n'a pas d'erreur
```

Lu en base : policies SELECT de `posts` et `stories` et fonction `post_is_visible` passent par
`abonne_accepte_non_bloque(text)` (SECURITY DEFINER, `search_path` vide, EXECUTE anon + authenticated) ;
plus aucune référence directe à `follows` dans ces trois endroits.
