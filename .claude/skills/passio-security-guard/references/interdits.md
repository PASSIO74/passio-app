# Les correctifs interdits — sans exception ni dérogation

Un correctif est **refusé** s'il fait l'une de ces choses, quel que soit le problème qu'il prétend résoudre.

| Interdit | Pourquoi |
|---|---|
| Ouvrir, assouplir ou supprimer une policy RLS | c'est la **seule** frontière de sécurité de l'app |
| Contourner l'authentification, forger une identité | — |
| Exposer `service_role` côté client, ou dans un log | la clé bypasse toute RLS |
| Désactiver une validation ou un garde-fou | déplace le défaut, ne le corrige pas |
| Avaler une erreur (`catch` muet, `{ error }` ignoré) | fabrique un succès faux |
| Supprimer ou affaiblir un test | le correctif se rend vert lui-même |
| Désactiver le monitoring ou la télémétrie | supprime la détection, pas le défaut |
| Supprimer des données pour faire disparaître un symptôme | — |
| Écrire une donnée personnelle dans un log ou un rapport | — |

En cas de doute, l'ordre est : **MITIGER → FEATURE FLAG → ISOLER → ROLLBACK → RAPPORTER.** Jamais « corriger vite ».

## Ces interdits sont déjà câblés, et doivent le rester

Deux endroits du pilotage les appliquent : `repair.js` n'autorise que `js/*.js`, `styles.css`, `index.html`, `sw.js` — **`tests/` est interdit**, comme les migrations, la CI et les scripts ; et « PAS DE CORRECTIF SÛR » est une réponse valide.
