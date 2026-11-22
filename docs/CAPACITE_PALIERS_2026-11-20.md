# Capacité par paliers — staging, 20 novembre 2026

Commande (staging seulement, comptes synthétiques `@passio-capacite.test`, poste tenu éveillé) :

```
node scripts/charge-realiste.mjs --projet fcksxofaelcdmmifnwjo --paliers 25,50,100,200 \
  --pages 20 --duree 90 --executer --sortie .passio/tmp/charge/campagne-2026-11-20.json
```

Il y a eu d'abord un prévol à 2 comptes, vert. Le client mesuré est celui servi le 20/11 (`main` à `67d395be`), après les correctifs P1 du jour (#985, #986, #989) : plafonds par compte sur les écritures, budget temps réel de la messagerie, quota de stockage au remplacement. Le profil temps réel est `sans-cdc`, avec un canal par socket. La campagne a duré 44 min, préparation et nettoyage compris.

Le staging et la production tournent sur la **même taille d'instance**. Aucune extension de calcul n'est souscrite sur l'un ou l'autre, d'après l'API de gestion relue le 20/11. Les latences sont donc représentatives de la production à charge égale. Elles ne le sont pas du réseau de chaque utilisateur.

## Résultats (90 s de mesure par palier, durée valide aux deux horloges)

| Palier | Requêtes HTTP | Erreurs | p50 / p95 / p99 HTTP | p95 parcours | p95 publication | p95 message privé | Verdict du banc |
|---:|---:|---:|---|---:|---:|---:|---|
| 25 | 1 044 | 0 | 78 / 135 / 180 ms | 331 ms | 266 ms | 103 ms | valide |
| 50 | 2 228 | 0 | 77 / 121 / 156 ms | 316 ms | 209 ms | 121 ms | valide |
| 100 | 4 454 | 0 | 74 / 116 / 159 ms | 308 ms | 396 ms | 111 ms | valide |
| 200 | 8 782 | 1 (502) | 91 / 787 / 2 176 ms | 2 276 ms | 2 986 ms | 878 ms | **dégradé** : p95 parcours > 1 s, publications > 2 s, compteurs > 1 s |

Livraison temps réel qualifiée à tous les paliers. Le nettoyage a supprimé 200 comptes et toutes leurs lignes, avec 0 erreur et 0 création incertaine.

## Lecture

- **Jusqu'à 100 comptes simultanés, rien ne bouge.** Le p95 reste entre 116 et 135 ms, il n'y a aucune erreur, et c'est un peu mieux que le 21/09 (134 ms à 100). Les plafonds par compte posés le 20/11 n'ont refusé aucune écriture légitime : aucun 429, aucun refus.
- **À 200, la médiane tient (91 ms), mais des pics apparaissent.** Par tranches de 10 s, le p95 vaut 128 à 164 ms pendant 50 s, puis monte par à-coups (1,3 s, 2,6 s, 0,4 s, 1,8 s). Les familles touchées sont les écritures et les lectures lourdes : publication, notifications, événements, profil. Le rapide `fil_compteurs` reste à 440 ms. C'est le profil d'une petite instance qui sature par rafales, pas celui d'une requête lente. Le maximum cumulé de `pg_stat_statements` montre des blocages de 5 à 8 s, et ils touchent indifféremment toutes les écritures.
- **Ce que veut dire « 200 au banc ».** Chaque acteur émet environ 0,5 requête par seconde, en continu : il lit, aime, commente, publie et écrit des messages sans pause. Un vrai utilisateur actif en émet nettement moins. Ce chiffre n'est pas converti en « utilisateurs réels » : aucune mesure de l'usage réel ne permet encore ce rapport.
- **Le premier mur reste le temps réel.** L'organisation est limitée à 500 connexions simultanées, et le staging peut en tenir jusqu'à 200. Il est probable que ce mur soit atteint avant la saturation de la base, mais ce n'est pas mesuré : le banc ne peut pas dépasser les 200 connexions du staging.

## Décision qui en découle (geste du responsable, non pris ici)

Quand l'activité simultanée réelle approchera la centaine de personnes actives, il faudra passer l'instance de base à la taille au-dessus, ce qui est facturé en plus de l'offre. Au même moment, il faudra sortir le staging de l'organisation pour libérer ses connexions temps réel. Aucun de ces deux gestes n'est nécessaire à l'échelle actuelle.

## Non mesuré

- Au-delà de 200 comptes (plafond du banc et du staging) ;
- les médias (le banc ne télécharge rien) ;
- le rendu et le navigateur ;
- l'inscription par e-mail ;
- plusieurs sessions d'un même compte.

Le client de charge tourne dans un seul processus Node, sur le poste. Sa part dans les pics du palier 200 n'est pas isolée, mais sa médiane stable (91 ms) plaide pour une saturation côté serveur. Une seule passe a été faite par palier : ce n'est pas une référence médiane.
