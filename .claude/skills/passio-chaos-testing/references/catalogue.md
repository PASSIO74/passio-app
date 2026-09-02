# Catalogue des expériences de chaos

Chacune s'écrit : **hypothèse → injection → observation → verdict**. Une expérience sans hypothèse écrite d'avance produit une justification après coup.

| # | Panne injectée | Hypothèse à vérifier |
|---|---|---|
| C1 | Réseau coupé pendant un envoi de message | statut `failed`, mise en outbox, renvoi automatique au retour |
| C2 | 500 sur une écriture de like | affichage optimiste **annulé**, pas laissé en place |
| C3 | 200 + tableau vide (refus RLS déguisé) | l'action n'est pas comptée comme réussie |
| C4 | Réponse jamais résolue | pas de blocage d'interface, pas de double envoi au retry |
| C5 | WebSocket realtime coupé puis rétabli | réabonnement, et rattrapage de ce qui a été manqué |
| C6 | Événement realtime dupliqué | un seul effet métier (dédup par id) |
| C7 | Événements réordonnés | l'état final est le même |
| C8 | Événement perdu | le cycle de rafraîchissement le rattrape |
| C9 | 401 en cours de session | rafraîchissement de session, pas de déconnexion brutale |
| C10 | 429 | recul exponentiel, pas de martèlement |
| C11 | Quota localStorage dépassé | pas de faux « état propre » ; l'IndexedDB prend le relais |
| C12 | Horloge en avance d'une heure | l'état de l'autre appareil n'est pas perdu (**échoue aujourd'hui** — voir `passio-sync-audit`) |
| C13 | Onglet caché pendant l'envoi | le beacon `keepalive` sauve l'état |
| C14 | Service worker d'une version précédente | pas de mélange de versions (`version-skew.spec.js`) |
| C15 | Deux contextes agissant simultanément | convergence, pas d'effet doublé |

## Format de résultat d'une expérience

```
EXPÉRIENCE <Cn> — <panne>
Hypothèse   : <ce qu'on attend>
Injection   : <mécanisme> — prouvée par <assertion>
Observé     : <ce qui se passe vraiment>
Verdict     : TENU | DÉFAUT RÉEL | NON EXÉCUTABLE (<pourquoi>)
Suite       : <incident ouvert / test conservé / rien>
```
