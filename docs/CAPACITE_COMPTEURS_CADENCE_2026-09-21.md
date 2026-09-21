# Compteurs visibles : la cadence recule quand rien ne bouge — 21 septembre 2026

Lot de capacité développé depuis `8dd33f3` (PR #520). Risque normal : client
seulement (`js/app-03-posts-vlogs.js`), banc de charge et ses tests. Aucune
migration, aucune policy, aucun abonnement modifié. Implémentation Claude Code.

## Le poste, mesuré

Depuis #519, un compte connecté relit les compteurs de likes de ses cartes
visibles par HEAD exacts : au plus trois par créneau de **15 000 à 16 499 ms**,
quoi qu'il se passe. C'est un coût d'**activité nulle** — il ne dépend pas de ce
que les gens font, seulement des onglets ouverts sur un fil — exactement la
famille que les deux filets (fil, lives) ont quittée le 20/09
(`filetProchainPas`, app-02). À 200 onglets actifs montrant trois cartes, #519
calculait ~40 HEAD/s ; en régime stable c'est du travail SQL (`count exact`
sous RLS) pour ne rien apprendre.

## Ce qui change

- `compteursProchainPas(pas, vivant)` (app-03), **pure**, même forme que
  `filetProchainPas` : 15 s tant que c'est vivant, sinon ×1,5 par cycle,
  plafond **60 s** (15 → 22,5 → 33,75 → 50,6 → 60).
- « Vivant » = au moins l'un de : un compteur relu a **changé**, une lecture a
  **échoué** (une panne n'est pas un calme), une carte **jamais relue** est à
  l'écran (contenu neuf sous les yeux), **mon propre like** vient d'être confirmé,
  retour au **premier plan** / `pageshow` / **réseau revenu**.
- Sur ces trois derniers, la reprise est immédiate : pas à 15 s et rendez-vous
  rapproché à 16,5 s au plus (sans nouveau tirage : la phase initiale reste le
  seul tirage d'étalement entre utilisateurs, verrou « chacun leur échéance »
  conservé).
- L'onglet masqué est arrêté comme avant (ni HEAD, ni recul : il ne tourne
  pas). Le jitter 0–1 499 ms et la phase initiale 200–14 999 ms sont inchangés.
- Ce qui ne change pas : l'affichage de MES gestes (optimiste, local, immédiat),
  les gardes de visibilité, d'identité et de réponses obsolètes, la rotation
  des cartes, le verrou anti-double-clic, les trois HEAD séquentiels au plus.

## Compromis visible

Un like posé par **quelqu'un d'autre** sur une carte que je regarde sans
rien faire apparaît en **≤ 60 s** au pire (au lieu de ≤ 16,5 s), et en ≤ 15 s
dès que quelque chose bouge (un compteur qui change ramène tout le cycle à
15 s). Les messages privés, notifications et nouvelles publications ne passent
pas par ce chemin : ils restent en temps réel.

## Mesures

| Scénario | Avant (fixe) | Après (adaptative) |
|---|---:|---:|
| 90 s de calme, 3 cartes visibles (banc unitaire, horloge simulée) | 6 cycles / 18 HEAD | **4 cycles / 12 HEAD** (−33 %) |
| 5 min de calme | 20 cycles / 60 HEAD | **7 cycles / 21 HEAD** (−65 %) |
| Régime stable long (par heure, par onglet) | 240 cycles / 720 HEAD | **60 cycles / 180 HEAD** (−75 %) |
| Compteurs qui changent à chaque cycle (charge) | 6 cycles / 90 s | 6 cycles / 90 s (identique) |

L'économie porte sur **ces lectures seulement** (HEAD `post_likes` des cartes
visibles) — pas sur le fil, les commentaires, les médias ni le temps réel. La
campagne staging (banc `charge-realiste`, même scénario, `--compteurs-cadence
fixe` puis `adaptative`) mesure ce que cela vaut sous charge réelle : voir le
rapport de campagne joint à la PR de synthèse.

## Vérification

- `tests/e2e/capacite-compteurs-cadence.spec.js` (6) : suite exacte des écarts
  15/22,5/33,75/50,6/60/60 mesurée sur les HEAD réels du moteur (horloge
  figée), changement et erreur, mon like (rendez-vous ≤ 16,5 s, aucun tirage),
  masqué/retour, carte neuve, pureté et constantes, filet intact, câblage à la
  source.
- `tests/e2e/capacite-likes-visibles.spec.js` (26) : inchangés, verts — dont
  « chacun leur échéance » (aucun tirage supplémentaire).
- `tests/unit/charge-realiste.test.mjs` (+3) : égalité produit/banc de la
  politique (fonction d'app-03 exécutée dans `vm`), option `--compteurs-cadence`,
  cadence adaptative du vrai minuteur du banc (recul, changement, erreur, 4
  cycles contre 6 sur 90 s).

Retour arrière : revert du commit ; ou `POST_LIKE_REFRESH_MAX_MS = 15000`
rend la cadence fixe sans toucher au reste. Pilotage : `_postLikeRefreshStats`
expose `pasMs`, `cyclesCalmes`, `changed` ; aucun événement distant ajouté.
