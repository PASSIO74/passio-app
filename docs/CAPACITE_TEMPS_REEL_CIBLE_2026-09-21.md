# Abonnements temps réel : ce qui est écouté, ce que ça coûte, ce qui est ciblé — 21 septembre 2026

Lot de capacité développé depuis `8dd33f3` (PR #520). Risque normal : client
seulement, aucune migration ni policy. Implémentation Claude Code.

## Inventaire mesuré (production, `pg_stat_user_tables`, cumul sur 129 jours)

Le canal `realtime:db` d'un compte pose **10 liaisons `postgres_changes`**
(V3 ; `conv_messages` passe en broadcast privé). Pour chaque changement d'une
table écoutée, Realtime évalue la policy SELECT **une fois par abonné** puis
livre à ceux qu'elle autorise ; un filtre de colonne est tranché avant la
policy.

| Table (liaison) | Changements | dont écoutés | Filtre | Policy évaluée par abonné | Traitement client à réception |
|---|---:|---:|---|---|---|
| `profiles` UPDATE | 20 795 | 4 537 UPDATE | aucun (table publique) | `true` (triviale) | **avant** : cache persisté + rendu du fil + rendu des messages, pour n'importe qui |
| `posts` INSERT | 6 948 | 3 501 | aucun | comptes privés (`abonne_accepte_non_bloque`) | ajout au fil si nouveau — utile à tous |
| `video_lives` * | 6 604 | 6 604 | aucun | — | battement de cœur coalescé (20/09) |
| `notifications` INSERT | 5 915 | 2 972 | `user_id=eq.moi` | — | cloche — nécessaire |
| `comment_interactions` INSERT/DELETE | 863 | 863 | aucun | `comment_target_visible` (3 sous-requêtes) | patch en place si la cible est chargée, sinon rien |
| `event_comments` INSERT | 593 | **36** | aucun | — | rechargement si la fiche de CET événement est ouverte, sinon rien |
| `conv_members` INSERT | 573 | 333 | `user_id=eq.moi` | `is_conv_member` | nécessaire |
| `conv_reads` * | 525 | 525 | aucun | `is_conv_member` | ✓✓ si conversation connue |
| `post_comments` INSERT | 349 | 228 | aucun | `post_is_visible` | aperçu/compte si le post est chargé |

Les deux liaisons `post_likes` ont été retirées le 20/09 (#519) ; la
télémétrie est sortie du temps réel (#515).

## Ce qui est implémenté

**`profiles` UPDATE ne travaille que pour un profil connu localement.**
`profilConnuLocalement(uid)` (app-08, autorité unique) : cache d'identité
(`state.seed.users`, alimenté par le fil, les commentaires, les événements) ou
cache de messagerie (`_profileCache`). Inconnu → ignoré et compté
(`window._rtProfilsIgnores`) ; connu → exactement le chemin d'avant (cache
rafraîchi, rendu du fil coalescé, rendu des messages). Ce qui est évité chez
chaque connecté, pour chaque UPDATE d'un inconnu : une entrée de plus dans
`state.seed.users` — donc dans le localStorage à chaque `saveState` — et deux
rendus. À 500 comptes et une CI qui retouche ses comptes à chaque run, c'est le
poste client le plus fréquent de la liste ; il ne change rien côté base (la
policy est `true`, la livraison a lieu quand même).

Préservé : messagerie, notifications, appels, droits d'accès — aucune de ces
liaisons n'est touchée ; `profilConnuLocalement` est un tri d'affichage, jamais
une frontière de sécurité.

## Ce qui a été examiné et n'est PAS implémenté, avec la raison

- **`event_comments` par événement ouvert** (canal `event:<id>` filtré) :
  un canal privé à topic neuf est **refusé** par la policy
  `passio_rt_recevoir` (topics en liste blanche : `ring:`, `call:`, `vlive:`,
  `realtime:db`, `typing:`, `conv:`, `conv_specific:`) et les canaux publics
  sont désactivés sur le projet — il faudrait une migration de policy
  (critique, contre-revue) pour **36 INSERT en 129 jours**. Bénéfice non
  mesurable ; refusé.
- **`post_comments` / `comment_interactions` / `conv_reads` filtrés sur « ce
  qui est chargé »** : un filtre Realtime ne prend qu'une valeur par liaison
  (`eq`) ou une liste figée (`in`) ; suivre le fil imposerait de rejoindre le
  canal à chaque défilement. C'est le changement d'architecture déjà nommé le
  20/09, pas un réglage. Volumes actuels : < 1 000 changements chacun.
- **Réduire le nombre de canaux** : sans effet sur le quota, qui compte des
  clients (fiche « le mur est une connexion WebSocket »).

## Vérification

`tests/e2e/capacite-realtime-cible.spec.js` (4) : le vrai gestionnaire du
canal est exercé — inconnu (ni cache, ni rendu, compté), connu par le fil
(cache + rendus), connu par la seule messagerie, moi-même ignoré comme avant,
autorité unique lue avant tout travail. `audit:realtime` inchangé (10 liaisons,
mêmes tables).

Retour arrière : revert. Pilotage : `window._rtProfilsIgnores` (local, jamais
émis).
