# Fil : compteurs exacts, mon like et deux aperçus en une lecture — 21 septembre 2026

Lot de capacité développé depuis `3491317` (PR #519). **Risque critique** : il
porte une migration (`migrations/migration_fil_compteurs_2026-09-21.sql`,
une fonction SQL, aucune table ni policy modifiée). Implémentation Claude Code ;
contre-revue humaine indépendante requise avant fusion et avant application
(barrière `scripts/appliquer-migration.mjs`, ASTRA-61 : aucun relecteur
autorisé n'est inscrit à ce jour dans `.passio/migrations/relecteurs-autorises.json`).

## Le défaut, mesuré

Pour peindre une page de fil (20 publications), `supaLoadPosts` (app-08)
faisait, après la lecture des publications, **quatre lectures** :

| Lecture | Ce qu'elle rapatriait | Pourquoi |
|---|---|---|
| `post_likes` | toutes les lignes `(post_id, user_id)` des 20 posts | compter, et savoir si j'ai aimé |
| `post_comments` | jusqu'à **200** commentaires avec leur **contenu** | en afficher deux, compter les autres |
| `comment_interactions` | toutes les réactions des 20 posts | pastille « 😍 N » |
| `profiles` | les auteurs des commentaires (passions ≈ 1 Ko par ligne) | identité des aperçus |

Le volume grandit avec le succès des publications (likes, commentaires), pas
avec ce que le lecteur regarde, et le compte de commentaires devenait **faux**
au-delà de 200 commentaires sur la page. Ouvrir une discussion téléchargeait
ensuite **tous** ses commentaires, sans borne.

Ni `post_likes` ni `post_comments` ne portent de clé étrangère vers `posts`
(vérifié en base le 21/09), donc aucun `count` PostgREST embarqué n'est
possible ; les agrégats REST sont désactivés (`PGRST123`, vérifié par une
requête). D'où la fonction SQL.

## Ce qui change

- `public.fil_compteurs(_post_ids text[])`, **SECURITY INVOKER**, `STABLE`,
  `search_path` figé, 60 identifiants au plus (la page d'un profil visité).
  Par publication : `likes` (compte exact), `aime` (ma ligne), `commentaires`
  (compte exact de premier niveau), `apercus` (les deux plus récents : id,
  auteur, contenu, date), `reactions` (emoji/GIF du post). La RLS de chaque
  table s'applique **ligne par ligne, comme au GET d'avant** : compte privé,
  blocage, compte en suppression rendent la même chose. La migration
  **annule sa transaction** si la fonction n'était pas INVOKER.
- Client : `supaLoadPosts` → une lecture `fil_compteurs` (POST, identifiants
  en corps : un id est un texte choisi par son auteur, la forme `{a,b}` d'un
  GET casserait sur une virgule). Fonction absente (`PGRST202`, `42883`) →
  les quatre lectures d'avant, **mémorisé pour la session** (`sessionStorage`,
  clé = identifiant de build via `idbPassionsRelease`, jamais
  `String(PASSIO_RELEASE)` qui est un objet) : un seul essai par release.
  Toute autre erreur (refus, délai, réseau) → les lectures d'avant **pour cette
  page** (des compteurs justes valent quatre lectures de plus), et après trois
  échecs consécutifs la fonction n'est plus tentée de la session, sans rien
  mémoriser. Sans SDK réel (`_supaReal` faux) → chemin d'avant.
- Le filet du fil remplace les objets `post` à chaque tour : une discussion
  déjà chargée (page de 30 ou plus, curseur posé) est **reportée** sur le nouvel
  objet, les aperçus nouveaux glissés en tête ; sa signature de rendu
  (`_feedPostsSig`) cite `nbCommentairesPost` et l'aperçu de tête, pas la
  longueur d'une liste réduite à deux.
- `post.commentsTotal` (exact) et `post.comments` (aperçus). L'affichage passe
  par **une seule autorité**, `nbCommentairesPost(p)` (app-02) : total serveur
  (ou ce qui est chargé du serveur s'il est plus grand), plus mes commentaires
  pas encore envoyés, plus les réponses chargées. Un commentaire reçu en direct
  incrémente le total ; une suppression d'un commentaire serveur le décrémente ;
  sans total (repli, démonstration, activité), on compte la liste comme avant.
- Discussion : `supaLoadComments(postId, { avant })` rend une **page de 30**,
  les plus récents d'abord, curseur `(created_at, id)` ; bouton « ↓ Charger
  les commentaires précédents · N restants » (`_chargerCommentairesPrecedents`,
  app-04) — dans la modale du fil, la page détail ET le panneau des Bobines
  (app-05, qui ne lisait que `reel.comments`). `hydrateCommentInteractions`
  ne porte plus que sur la page. La dernière page recale le total (aucun
  DELETE de `post_comments` n'est écouté : un total peut être périmé à la
  hausse jusque-là). Sur le chemin d'avant (sans total serveur), le compte du
  fil est conservé quand la page en montre moins. Le tri « Pertinents » porte
  sur la page chargée, pas sur toute la discussion.

Préservé : compteurs, aperçus, réactions, comptes privés, blocages (client et
RLS), mises à jour locales optimistes, la course « ancienne lecture du fil vs
HEAD ou clic » (`_postLikeReconcileLoaded`, éprouvée sur les DEUX chemins).

## Mesures

### Octets par page de fil, sur les données de production (lecture seule, 21/09)

Page réelle de 20 publications : 13 likes, 9 commentaires (8 aperçus), 4
réactions, 2 auteurs d'aperçus (la production porte 9 comptes). Mesuré en
SQL, sans RLS (le connecteur lecture seule ne peut pas prendre le rôle
`authenticated` ; l'écart est au plus la publication du seul compte privé).
La requête de mesure est la fonction elle-même, appliquée en ligne ; ses
résultats bruts : total 3 720, dont 2 041 de structure fixe, 1 140 pour 8
aperçus, 539 pour 4 réactions.

| | Requêtes après `posts` | Octets JSON |
|---|---:|---:|
| Avant : `post_likes` + `post_comments` + `comment_interactions` | 3 GET | 1 115 + 1 583 + 685 = **3 383** |
| Après : `fil_compteurs` | 1 POST | **3 720** |
| Dans les deux cas : `profiles` des auteurs d'aperçus (cache 2 min) | +0/1 | +758 quand le cache est vide |

**Sur la production d'aujourd'hui, la réponse groupée pèse 337 octets de PLUS
(+10 %)** : chaque publication coûte ~102 octets de structure fixe
(`post_id`, `likes`, `aime`, `commentaires`, `apercus`, `reactions`) pour des
publications qui n'ont presque rien. Le gain est ailleurs : **deux requêtes de
moins par page** (3 GET → 1 POST, `profiles` inchangé), et un volume **borné**
par la page au lieu de croître avec le succès des publications. Coûts unitaires
mesurés sur cette page : avant ~86 octets par ligne de like, ~176 par
commentaire (plafonnés à 200 par page), ~171 par réaction ; après ~102 fixes
par publication + ~142 par aperçu (2 au plus) + ~135 par réaction.

Projection (mêmes coûts unitaires, pas une mesure) :

| Par publication | Avant | Après | Écart |
|---|---:|---:|---:|
| 0 like, 0 commentaire (aujourd'hui) | ~0 | ~0,1 Ko | +0,1 Ko × 20 |
| 5 likes, 3 commentaires | ~0,96 Ko | ~0,39 Ko | −60 % |
| 30 likes, 10 commentaires | ~4,3 Ko | ~0,39 Ko | −91 % |
| 200 likes, 40 commentaires | ~19 Ko (commentaires plafonnés à 10 par publication sur une page de 20 → compte FAUX) | ~0,39 Ko | −98 %, et compte juste |

Le point de bascule est ~1 like + 1 commentaire par publication en moyenne.

### Ouverture d'une discussion

Avant : tous les commentaires (`select *`, sans limite) puis toutes leurs
interactions. Après : 30 au plus, puis 30 par clic. Sur la publication la plus
commentée de production (89 commentaires en base au total, répartis), rien ne
change aujourd'hui ; c'est une borne, pas une économie mesurée.

### Ce qui n'a PAS été mesuré

- La latence de `fil_compteurs` en production : la fonction n'y est pas, et ne
  peut pas l'être avant la contre-revue. Le plan attendu est un `Index Scan`
  sur `post_likes_pkey` et `idx_comments_post (post_id, created_at desc)` par
  identifiant, sous les mêmes policies que le GET (chaque ligne évalue
  `post_is_visible`, comme avant).
- Le banc de charge staging (`scripts/charge-realiste.mjs`) ne peut pas
  exercer ce chemin tant que la migration n'est pas appliquée sur staging —
  même barrière (cible protégée, attestation exigée).

## Vérification

- `tests/sql/migration-fil-compteurs.test.sh` (CI, PostgreSQL jetable, policies
  et fonctions d'appui de production recopiées telles quelles) : application,
  rejeu, **égalité fonction = lecture directe** pour cinq comptes et le
  visiteur sur trois publications, aperçus, réactions, bornes, refus au rôle nu,
  et la mutation `security definer` : la migration mutée SORT EN ERREUR avec
  le motif de la garde, sans verdict, la version revue reste en place (témoin
  hors migration : en DEFINER, un compte bloqué compterait 3 likes au lieu de
  1). Ne tourne pas sous Windows (pas de `initdb`) : CI Linux.
- `tests/e2e/capacite-fil-compteurs.spec.js` (21) : une lecture groupée par
  page, repli mémorisé, erreur passagère repliée pour la page, trois échecs,
  clé de release, chemin sans SDK, pagination de la discussion avec curseur et
  bouton, page incomplète, dernière page qui recale, erreur de page sans
  squelette, compte tenu localement (local, direct, suppression, réponses),
  discussion conservée à travers le filet, chemin d'avant à 45, panneau des
  Bobines, autorité pure, signatures de rendu (app-02 et app-08).
- Contre-revue adversariale multi-agents (8 lentilles, 3 vérificateurs par
  constat, 27 constats confirmés) sur le second jet, tous corrigés : mon
  commentaire confirmé en base devient une ligne serveur et entre dans le total
  (`_commentaireConfirme`, sinon compté deux fois au tour suivant du filet —
  P1) ; les lectures de discussion écrivent sur TOUTES les copies du post et
  relisent l'objet après chaque `await` (le filet remplace les objets) ; mes
  propres publications reçoivent le total sur leur copie `userPosts` ;
  réouvrir après 20 s ne jette pas les pages chargées ; la pagination n'est pas
  persistée (`_leanState`) ni reportée d'une session à l'autre ; `limite + 1`
  pour ne poser un curseur que s'il reste des lignes ; le panneau des Bobines
  insère en tête et remet son index de réponse ; la mémorisation « fonction
  absente » expire après une heure ; migration : borne posée APRÈS
  aplatissement (un tableau imbriqué passait entier), garde et verdict ciblés
  par signature (`to_regprocedure`), PUBLIC sans droit d'exécution ; banc SQL :
  filtres `kind`/`payload` prouvés chacun par un témoin, refus mesuré sur la
  FONCTION, tableau imbriqué borné ; verrous : horloge figée avant le clic,
  chaîne de démarrage close avant les journaux, POST refusé si GET, total seul
  fait bouger la signature, squelette sur une publication sans aperçu, Bobines
  « précédents » cliqué et dédoublonné.
- Contre-revue `audit-passio` (agent, lecture seule) sur le premier jet :
  quatre P1 (signature du filet aveugle au total, panneau des Bobines réduit à
  deux lignes, discussion perdue au tour du filet, banc SQL ⑤ inversé) et
  cinq P2 (clé de release « [object Object] », chemin d'avant à 30, squelette
  éternel, total non recalé, erreurs persistantes à zéro) — tous corrigés et
  verrouillés ci-dessus.
- `tests/e2e/capacite-likes-visibles.spec.js` : la course « ancienne lecture
  du fil » est maintenant exercée sur les deux chemins (4 cas au lieu de 2).
- Suites voisines vertes en local : `capacite-fil-cache`, `interactions`,
  `capacite-likes-visibles` (26). Deux cas de cette dernière ont rougi une fois
  dans une exécution groupée de quatre suites puis sont passés seuls et dans
  la suite complète : cadence d'horloge sous charge locale, pas le lot.

## Ordre d'application et retour arrière

1. Contre-revue humaine de la PR, attestation, `npm run migration:appliquer`
   sur staging puis production (canal ③) ; vérifier en base (canal ①) que
   `fil_compteurs` est INVOKER.
2. Fusion et déploiement du client. Dans l'autre ordre, le client fonctionne
   aussi : un `PGRST202` par session, puis les lectures d'avant.

Retour arrière : `drop function public.fil_compteurs(text[])` ramène tous les
clients au chemin d'avant à la session suivante, sans redéploiement ; ou revert
du commit client. Aucune donnée n'est touchée dans les deux sens.

## Pilotage

Aucun nouvel événement. La télémétrie HTTP existante voit `POST /rpc/fil_compteurs`
à la place des trois GET (`profiles` reste un GET dans les deux cas) ; un `PGRST202` apparaît au plus une fois par session
tant que la migration n'est pas appliquée (à lire comme « pas encore appliquée »,
pas comme une panne).
