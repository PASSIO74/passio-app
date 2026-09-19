# Accueillir beaucoup plus de monde sans dépenser un euro (2026-09-19)

> Question de Benjamin : « tu m'as dit que 200 personnes seulement peuvent l'utiliser, comment
> avoir beaucoup plus de capacité sans payer ? En utilisant le stockage chez chaque utilisateur ? »
> Réponse courte : **le chiffre de 200 est périmé et faux aujourd'hui**, les lectures tiennent déjà
> 2 000 à 4 000 personnes connectées, et les quatre plafonds qui restent se lèvent **sans payer** —
> dont un dont le correctif est **déjà écrit dans le dépôt** et n'a jamais été branché.
> Le stockage chez l'utilisateur est une bonne idée **pour la moitié du problème seulement** : §6.

---

## 1. D'où vient le « 200 », et pourquoi il ne vaut plus

`docs/SCALE_RUNBOOK.md:154` : « Pour aller au-delà de **200 clients concurrents** → monter la
compute tier ». Mesuré le **2026-06-15**, sur la compute **Nano** (le calcul du forfait gratuit) :
c'est la limite du pooler Supavisor, pas de l'application.

Deux choses ont changé depuis, et aucune n'a été reportée dans ce fichier :

1. **Le projet ne tourne plus sur Nano.** Mesuré aujourd'hui en base : `shared_buffers` = 224 Mo,
   `effective_cache_size` = 384 Mo, `max_connections` = 60 → c'est **Micro** (1 Go de RAM), le
   calcul par défaut du forfait Pro. Nano en aurait la moitié. Le go/no-go du 11/09 l'écrit en
   toutes lettres (CAP-01 : « l'org est en Pro, 25 $/mois »).
   ⚠️ **Le forfait lui-même ne se lit pas depuis la base** (le connecteur ① d'ADR-012 est un accès
   SQL, pas un accès facturation) : à confirmer au tableau de bord Supabase → Billing. Mais les deux
   signaux convergent, et la compute, elle, est mesurée.
2. **La capacité a été mesurée pour de bon** les 14 et 15/09 (`docs/CAPACITE_2026-09-14.md`,
   `scripts/charge.mjs` sur le staging) : **~400 req/s de lectures réelles, p95 sous la seconde, zéro
   erreur à 200 utilisateurs simultanés sans temps de pause**. Comme un vrai usage fait une requête
   toutes les 5 à 10 s, cela vaut **2 000 à 4 000 personnes connectées en même temps**.

**Conclusion : côté lecture, il n'y a rien à acheter et rien à réparer.** Le fil, les rencontres,
les profils et la recherche tiennent dix à vingt fois le chiffre annoncé. Ce qui suit ne parle donc
plus jamais de « combien tiennent », mais des quatre ressources qui, elles, s'épuisent.

---

## 2. Les vrais plafonds, mesurés le 2026-09-19

| Ressource | Mesuré aujourd'hui | Plafond | Qui l'épuise |
|---|---|---|---|
| Base de données | **69 Mo** (dont télémétrie 30 Mo = 43 %, référentiel passions 11 Mo fixes) | 8 Go (Pro) · 500 Mo (Free) | la télémétrie, pas les gens |
| Stockage médias | **80 Mo / 72 objets** | 100 Go (Pro) · 1 Go (Free) | **9 vidéos = 68 Mo = 85 %** |
| Bande passante Netlify | non mesurée ici | **100 Go/mois (gratuit)** | les vidéos, très loin devant |
| **E-mails de confirmation** | — | **300 par JOUR (Brevo gratuit)** | **chaque inscription** |
| Écritures simultanées | ~20 comptes actifs avant que la latence se voie (mesuré 15/09) | compute Micro | publier, aimer, envoyer |
| Temps réel | 26 tables publiées, dont 8 inutiles | coût en O(changements × clients) | `postgres_changes` |
| Comptes | 10 | 50 000 MAU | personne |

Détail utile : 61 470 lignes de télémétrie en 7 jours pour **2 431 sessions**, soit ~25 lignes par
session et ~470 octets la ligne. Les quatre purges `pg_cron` tournent (`purge_telemetry_7j`,
`purge_client_errors`, `passio_purge_analytics`, `purge_call_invites`) — la rétention est déjà le bon
levier, elle est déjà posée.

`user_state` — le blob « l'état du compte » — est **sain** : 83 ko au maximum, médiane ~4 ko. La purge
du 14/09 (79 lignes de comptes supprimés, dont une de 4,8 Mo) a fait son travail. Ce point-là est clos,
et il compte pour la §6.

---

## 3. ① LA VIDÉO — 85 % du stockage, et le correctif est déjà écrit

C'est le plus gros gain du document, et il ne coûte rien du tout.

**Mesuré** : sur 72 objets, **9 vidéos pèsent 68 Mo** — 85 % de tout le stockage. Les 58 images en
pèsent 12,5. Vidéo moyenne : **7,5 Mo**, la plus grosse **24 Mo**. Les images, elles, sont déjà
compressées à l'envoi (`passioCompressImage`, ~170 ko en moyenne) — la discipline existe, elle n'a
jamais atteint la vidéo.

**La cause, dans le code** : `passioCompressVideo` (`js/app-08-ui-modals-tour.js:1092`) ré-encode en
1080p à 2,5 Mbit/s plafonné, canvas + MediaRecorder, audio préservé. Elle est écrite, elle marche, et
elle n'a **qu'UN SEUL appelant** — `app-08:1194`, le chemin de l'éditeur média. Le chemin du Studio
par la galerie (`#videoInput`, `js/app-06-reels-partage.js:4152`) lit le fichier **BRUT** avec un
`FileReader` et l'envoie tel quel, plafonné à 30 Mo.

C'est exactement la famille que le dépôt connaît par cœur : **« corriger une surface, c'est corriger
une surface »**. Le compresseur a été écrit pour une porte, la seconde porte ne l'a jamais reçu.

**Le gain, et il est double** : 7,5 Mo → ~1,5 Mo par vidéo, soit

- **×5,2 sur la vidéo** (68 → 13 Mo) mais **×3,2 sur le stockage total** — mesuré sur le corpus
  réel, 80 → 25 Mo : les 12,5 Mo d'images sont déjà compressés et ne bougent pas. Le ×5 annoncé
  plus haut dans la première version de ce document venait de la moyenne par vidéo, pas du total ;
- **×5 sur la bande passante Netlify pour la vidéo** — 100 Go/mois, c'est ~13 000 vues à 7,5 Mo,
  et **~66 000 vues** à 1,5 Mo ;
- et un envoi cinq fois plus rapide depuis un téléphone en 4G, donc moins d'abandons.

**Effort** : router `#videoInput` par `passioCompressVideo` avec le repli déjà prévu (la fonction
rejette proprement si le navigateur ne sait pas faire). Quelques heures, un verrou e2e, aucune
migration, aucun risque serveur.

---

## 4. ② LA TÉLÉMÉTRIE — 43 % de la base pour 10 comptes

30 Mo sur 69, pour dix comptes dont la plupart des sessions sont de la CI. La répartition sur 7 jours :

| type | lignes | part |
|---|---|---|
| `action` | 22 135 | 36,0 % |
| `api` | 21 447 | 34,9 % |
| `perf` | 9 902 | 16,1 % |
| `session` | 3 295 | 5,4 % |
| tout le reste | 4 691 | 7,6 % |

**`api` + `perf` = 51 % des lignes**, et elles ne servent qu'à calculer des agrégats (p95 par table,
temps de démarrage). Un agrégat n'a pas besoin de toutes les lignes.

**Deux gestes gratuits** :

1. **Échantillonner** `api` en 2xx et `perf` à 10 %, en gardant **100 %** des erreurs, des refus 4xx/5xx,
   de `session`, `action`, `connectivity` et `error`. −45 % de lignes, aucun signal perdu — un p95
   calculé sur 2 000 mesures vaut celui calculé sur 20 000. ⚠️ Le taux d'échantillonnage doit voyager
   avec la ligne (une colonne `poids`), sinon les compteurs du pilotage divisent le trafic réel par dix
   sans le dire.
2. ~~**Sortir `telemetry_events` de la publication `supabase_realtime`.**~~ ⚠️ **FAUX, ET CORRIGÉ LE
   JOUR MÊME.** La table est bien publiée, mais elle N'EST PAS sans abonné : le **Centre de pilotage**
   s'y abonne depuis son backend (`dashboard/server/ingest.js:217`, clé `service_role`) et en tire tout
   son flux SSE. La retirer aurait éteint le direct du tableau de bord **sans une erreur** — il serait
   retombé sur son polling de secours, donc le symptôme aurait été « c'est un peu en retard », jamais
   « c'est cassé ».
   **La leçon vaut plus que le geste** : l'inventaire des abonnés se fait sur TOUT le dépôt, backend
   compris, jamais sur le seul `js/`. C'est ce que fige désormais `npm run audit:realtime`.

---

## 5. ③ LE TEMPS RÉEL — c'est lui qui ne passera pas l'échelle

Le pooler n'était pas le mur, et la base non plus. Le mur est `postgres_changes`.

**Mesuré** : la publication `supabase_realtime` porte **26 tables**. Dont :

- `conv_reads` — les accusés de lecture, le plus gros volume d'écritures de la messagerie
  (⚠️ **abonné**, lui : `_creerCanalDb` l'écoute pour le ✓✓ en direct — il RESTE publié) ;
- **six tables `cdv_*`** (`cdv_lives`, `cdv_live_comments`, `cdv_live_reactions`,
  `cdv_live_steps`, `cdv_live_followers`, `cdv_live_collaborators`) — le **Carnet de voyage, RETIRÉ
  par ADR-011 le 2026-08-31**. Elles sont répliquées en temps réel pour une fonctionnalité qui
  n'existe plus.

**Pourquoi c'est le vrai plafond** : avec `postgres_changes`, Supabase évalue la RLS **par changement
et par client abonné**. Le coût est en O(changements × clients connectés) — il ne grandit pas avec le
nombre d'utilisateurs, il grandit avec leur **produit**. C'est ça qui casse vers quelques centaines de
connexions simultanées, pas le nombre de connexions en soi.

**Et la sortie est déjà à moitié construite** : `window.PASSIO_REALTIME_V2` et `PASSIO_REALTIME_V3`
existent dans `app-08:5864` et `5882`, avec les canaux `user:<uid>` et `conv:<id>` — c'est le modèle
*broadcast depuis la base*, dont le coût est **par destinataire réel** et non par abonné. Les deux
drapeaux sont en place, les chemins sont écrits, `_creerCanalDb` bifurque déjà dessus.

**Trois gestes, par ordre de coût** :

1. **Gratuit et immédiat, FAIT le 2026-09-19** : `migrations/migration_realtime_publication_2026-09-19.sql`
   retire les **13** tables que personne n'écoute — inventaire mécanique, pas à vue :
   **25 publiées, 12 abonnées**. Y figurent les 6 `cdv_*`, `step_interactions` et `post_collaborators`
   (fonctionnalités mortes), plus `comment_likes`, `conversations`, `event_reactions`, `events` et
   `stories` (tables vivantes, aucun `postgres_changes` nulle part). `telemetry_events` et `conv_reads`
   RESTENT : les deux ont un abonné.
   Et surtout : `npm run audit:realtime` (gate CI) refuse désormais les deux sens de la divergence —
   une souscription à une table non publiée (qui ne recevrait **jamais rien, sans une erreur**) comme
   une table publiée sans abonné. Éprouvée par réinjection des deux.
2. **Mesurer V2/V3 sur le staging**, puis les allumer. C'est le chantier qui décide de la tenue à
   plusieurs milliers de connectés.
3. Ne jamais republier une table « au cas où ».

---

## 6. ④ L'E-MAIL — 300 par jour, et c'est le SEUL plafond d'acquisition

C'est le plafond le plus dur du lot, et le moins visible : il ne limite pas combien de gens *utilisent*
PASSIO, il limite combien peuvent **s'inscrire dans une journée**.

La confirmation d'e-mail est obligatoire depuis le 2026-08-30 (`mailer_autoconfirm = false`). Donc :
**une inscription = un e-mail**. Plus chaque renvoi de lien, chaque mot de passe oublié. Le relais est
Brevo en offre gratuite : **300 par jour**, remis à zéro à minuit. Au-delà, l'inscription tombe — et
elle tombe *silencieusement* du point de vue de la personne (EM-3 du go/no-go).

**Le levier gratuit, et il est produit, pas technique : Google Sign-In ne coûte AUCUN e-mail.**
`onbGoogleAuth` existe déjà, le bouton est là, il est juste discret. Le mettre **en premier et
visuellement dominant**, le formulaire e-mail en second : une bascule de 50 % vers Google **double** la
capacité d'inscription quotidienne, pour le prix d'un changement de mise en page.

Ne pas changer de fournisseur : Brevo à 300/j (9 000/mois) est le meilleur gratuit du marché —
Resend en donne 3 000/mois, MailerSend 3 000/mois. **Il faut réduire la demande, pas chercher une
offre plus généreuse.**

Second geste, gratuit : surveiller le compteur d'envois Brevo le jour d'une poussée, et traduire le
refus SMTP en français au lieu du message anglais brut (déjà listé comme EM-3).

---

## 7. « Stocker les données chez chaque utilisateur » — ce que ça résout vraiment

L'intuition est juste **sur la moitié du problème**, et il faut séparer les deux moitiés, parce que
l'une rapporte beaucoup et l'autre est une impasse.

### Ce que ça résout — et il faut le faire

Le stockage local supprime les **lectures répétées**. Le référentiel des passions (568 ko, 5 001
entrées), les publications déjà vues, les profils déjà croisés : tout cela est immuable ou presque, et
retéléchargé à chaque session. Le mettre en IndexedDB, c'est moins de requêtes, moins d'egress, et un
démarrage quasi instantané pour quelqu'un qui revient.

**Et le modèle existe déjà dans le dépôt** : `js/idb-store.js` fait exactement ça pour les
conversations depuis le 2026-06-15 — écriture traversante à chaque `saveConversations`, hydratation et
fusion sans perte au démarrage (`hydrateConvsFromIDB()` en tête de `boot()`). C'est le patron à
étendre au référentiel des passions et au fil. Rien à inventer.

### Ce que ça ne résout pas, et c'est structurel

**Un réseau social est fait des données des AUTRES.** Le téléphone de A ne peut pas être la source de
vérité des publications de B : B doit pouvoir publier quand A est hors ligne, et surtout personne ne
peut faire confiance à l'appareil de A pour dire ce que B a écrit. Le stockage local **déplace une
copie, il ne retire jamais l'original** — le serveur reste le seul endroit où deux personnes peuvent
se rencontrer.

Le dépôt en porte déjà la cicatrice, et elle est instructive : `user_state` **est** exactement cette
idée — « l'état du compte, chez l'utilisateur, synchronisé ». Elle a produit un enregistrement de
**4,7 Mo** (un avatar en base64) et 79 lignes orphelines de comptes supprimés, purgés le 14/09. Elle
est saine aujourd'hui (83 ko au maximum) parce qu'on l'a bornée, pas parce que l'idée s'autorégule.

### La version de cette idée qui marche déjà

**Ne jamais faire transiter un média par la base.** C'est fait : Storage + CDN Netlify (`/media/*`,
`PASSIO_CDN_BASE`), `cacheControl` d'un an, jamais de base64 en base. C'est très exactement pour ça
que la base pèse 69 Mo et pas 8 Go, avec 80 Mo de médias à côté.

**Verdict** : oui au cache local — c'est un levier réel sur l'egress et sur le démarrage. Non au
« stockage chez l'utilisateur » comme substitut à la base : ce n'est pas une question de coût, c'est
une question de confiance et de disponibilité.

---

## 8. ⑤ Le monolithe de 1,3 Mo — la capacité qui compte vraiment

Mesuré le 14/09 sur un artefact minifié, gabarit téléphone : **12 secondes jusqu'à la première carte
du fil** sur un téléphone lent (CPU ×4, 3G rapide), dont **≈ 6 secondes de JavaScript** — analyse et
exécution de 1,3 Mo, puis `boot()` et la peinture. Ce n'est pas la base, c'est `app.js`.

À dix comptes, personne ne le voit. À dix mille, la majorité des gens arrivent sur un téléphone moyen
avec un réseau moyen, et **la capacité qui compte n'est plus « combien tiennent » mais « combien
restent »**. Douze secondes d'écran vide, c'est la première cause d'abandon, et aucun forfait ne la
répare.

Le découpage est difficile et documenté comme tel : les fonctions sont globales et s'appellent par
hoisting entre `app-01` et `app-09`, l'ordre est imposé, `SCALE_RUNBOOK.md` §7 l'a différé
volontairement. Ce n'est donc pas le premier geste — mais c'est le seul de cette liste dont le coût
augmente avec le succès.

---

## 9. L'ordre que je recommande

| # | Geste | Coût | Gain | Risque |
|---|---|---|---|---|
| 1 | **Compresser la vidéo au Studio** (brancher `passioCompressVideo` sur `#videoInput`) | quelques heures | **×5 stockage ET ×5 bande passante** | faible, repli déjà écrit |
| 2 | **Google Sign-In en premier** sur l'écran d'inscription | 1 heure | **×2 inscriptions/jour** | nul |
| 3 | **Nettoyer la publication realtime** (6 `cdv_*` morts + `telemetry_events`) | 1 heure | coût serveur par écriture | faible, à vérifier au grep |
| 4 | **Échantillonner `api` et `perf`** à 10 %, avec un poids par ligne | 1 heure | −45 % de lignes en base | faible |
| 5 | **Étendre IndexedDB** au référentiel des passions et au fil | 1 jour | egress + démarrage | faible, patron existant |
| 6 | **Mesurer puis allumer `PASSIO_REALTIME_V2/V3`** | 2 à 3 jours | c'est le plafond des milliers de connectés | moyen, à faire sur le staging |
| 7 | **Découper `app.js`** | chantier | la rétention à l'échelle | élevé (hoisting) |

Les gestes 1 à 5 se font en **une semaine sans rien acheter** et déplacent tous les plafonds mesurés
sauf un. Le 6 est le seul vrai chantier d'architecture, et il est déjà à moitié écrit.

---

## 9 bis. CE QUE ÇA DONNE — combien d'utilisateurs, après les cinq gestes

Les cinq gestes sont **appliqués** (2026-09-19). Voici ce que chaque plafond devient. Les colonnes
« avant » sont des mesures du 19/09 ; les colonnes « après » sont des projections **explicitement
dérivées** de ces mesures, pas des mesures nouvelles.

| Plafond | Avant | Après | Ce qui borne |
|---|---|---|---|
| Connectés en même temps (lecture) | **2 000 – 4 000** | inchangé | compute Micro (mesuré 14/09) |
| Comptes actifs **en écriture** simultanée | **~20** | inchangé | compute Micro (mesuré 15/09) |
| Comptes stockés (Storage Pro, 100 Go) | ~12 500 | **~40 000** | médias — 8 → 2,5 Mo/compte |
| Comptes stockés (si retour au Free, 1 Go) | ~125 | **~400** | idem |
| Inscriptions **par jour** | **300** | **600 – 1 000** | Brevo, selon la part Google |
| Lignes de télémétrie / semaine | 61 470 | **~34 000** (−45 %) | rétention 7 j, déjà posée |
| Référentiel téléchargé | 568 ko **par session** | 568 ko **par déploiement et par appareil** | cache IndexedDB |

**Le chiffre à retenir : de l'ordre de 10 000 à 30 000 comptes inscrits**, avec 2 000 à 4 000 personnes
connectées en même temps. Ce n'est plus le stockage qui borne (40 000), ni la base, ni la bande
passante : **c'est l'écriture simultanée**.

⚠️ **ET C'EST UN CALCUL, PAS UNE MESURE — voici son hypothèse, pour qu'on puisse la contester.** Le
banc du 15/09 montre la latence qui se voit au-delà d'une **vingtaine de comptes écrivant en même
temps**. Avec les ratios usuels d'un réseau social (1 à 2 % des inscrits en ligne à un instant donné,
et de l'ordre d'un dixième d'entre eux en train de publier, aimer ou envoyer dans la même seconde),
20 écrivains simultanés correspondent à **~10 000 inscrits**. Changez l'hypothèse d'engagement et le
chiffre bouge d'un facteur 3 dans les deux sens — d'où la fourchette. La marche suivante est le
compute **Small (~15 $/mois)**, pas du code : c'est la conclusion déjà écrite au 14/09, et ces cinq
gestes ne la déplacent pas, ils repoussent tout **le reste** derrière elle.

⚠️ **NE PAS CONFONDRE CAPACITÉ ET RYTHME D'ARRIVÉE.** Les 300 e-mails/jour de Brevo ne plafonnent pas
le nombre total d'utilisateurs : ils plafonnent la **vitesse** à laquelle on en gagne. 300/jour, c'est
9 000 par mois ; 600 à 1 000/jour après le passage de Google en tête, c'est 18 000 à 30 000 par mois.
Donc même dans le pire cas, atteindre 10 000 inscrits prend un mois — et le jour où l'on envoie le lien
à « des milliers de personnes » d'un coup, **c'est ce quota-là qui casse en premier**, pas le serveur.
C'est pourquoi le geste ② compte autant que le ①, alors qu'il ne touche qu'une position de bouton.

⚠️ **CE QUI N'A PAS BOUGÉ ET QUI RESTE LE PLUS GROS RISQUE À L'ÉCHELLE** : les **12 secondes** jusqu'à
la première carte sur un téléphone lent (PERF-02, mesuré, non corrigé). À dix comptes personne ne le
voit ; à dix mille, la majorité arrive sur un appareil moyen en réseau moyen. Aucun de ces cinq gestes
ne la réduit — c'est le découpage d'`app.js`, chantier à part entière, et le seul de la liste dont le
coût augmente avec le succès.

## 10. Ce que ce document ne dit pas

- **Le forfait Supabase n'a pas été lu** : le connecteur ① d'ADR-012 est un accès SQL, pas un accès
  facturation. « Pro » vient du go/no-go du 11/09 et de la compute Micro mesurée aujourd'hui — à
  confirmer au tableau de bord. Si le projet était **retombé en Free**, les plafonds redeviendraient
  500 Mo de base (69 Mo utilisés, 43 % de télémétrie) et **1 Go de stockage — soit ~130 vidéos avant
  saturation**, et le geste ① deviendrait urgent au lieu d'être prioritaire.
- **La consommation Netlify n'a pas été relevée** (100 Go/mois) : elle se lit au tableau de bord.
- **Les 2 431 sessions de 7 jours sont majoritairement de la CI**, pas des gens. Toute extrapolation
  « par utilisateur » faite depuis la télémétrie actuelle est donc haute.
- **La tenue dans la durée n'est pas mesurée** : les bancs du 14 et 15/09 durent 40 secondes par
  palier. Une fuite mémoire ou une dérive d'index ne s'y verrait pas.
- **Rien ici n'est un correctif appliqué.** Ce document mesure et propose ; il ne change pas une ligne
  du produit.

---

## 11. Ce qui a été FAIT le 2026-09-19, et ce qui reste un geste

**Appliqué en code, testé, poussé** (branche `claude/app-capacity-no-investment-e039cw`) :

| # | Geste | Où |
|---|---|---|
| ① | `passioVideoPourEnvoi`, autorité unique de préparation vidéo, branchée sur les DEUX portes | `js/app-08-*.js`, `js/app-06-*.js` |
| ② | Google en tête de l'écran d'auth + le refus de consentement amène la case à l'écran | `index.html`, `js/app-02-*.js` |
| ③ | Gate `npm run audit:realtime` (dans `verif`, donc en CI) + la migration | `scripts/audit-realtime-publication.js`, `migrations/` |
| ④ | Échantillonnage du seul `api 200` et de `perf`, avec le poids lu par le pilotage | `js/telemetry.js`, `dashboard/server/store.js` |
| ⑤ | Cache IndexedDB du référentiel, clé sur la release | `js/idb-store.js`, `js/passions-flat.js` |

Verrous : `tests/e2e/capacite-sans-investir.spec.js` (10),
`dashboard/test/telemetrie-echantillon-poids.test.js` (5) et
`tests/sql/migration-realtime-publication.test.sh` (10 — la migration est **exécutée** sur un
PostgreSQL jetable, pas seulement relue), éprouvés par réinjection de six mutations.

**Ce qui reste un geste humain, et pourquoi** :

1. **Coller `migrations/migration_realtime_publication_2026-09-19.sql`** (canal ③ d'ADR-012). Aucune
   session en conteneur distant ne peut l'appliquer : le canal ① est en lecture seule
   (`transaction_read_only = on`, vérifié), et il n'y a ni jeton de l'API de gestion ni chaîne de
   connexion `psql` ici. Le fichier est une seule transaction, avec un verdict qui **annule tout** si
   `telemetry_events` venait à quitter la publication. ⚠️ Après le coller, **mesurer l'état en base**
   (canal ①), jamais le tableau imprimé : un miroir périmé imprime OK sur tout.
2. **Contre-revue de la PR** — seul contrôle humain entre ce canal et la production, et elle est
   exigée parce que ce lot porte une migration.
3. **Vérifier le forfait Supabase** au tableau de bord (Billing) : « Pro » est déduit du go/no-go du
   11/09 et de la compute Micro mesurée, pas lu. En Free, les plafonds du tableau ci-dessus tombent à
   500 Mo de base et 1 Go de stockage, et le geste ① passe d'important à urgent.

⚠️ **UN DÉFAUT DE CE DOCUMENT A ÉTÉ CORRIGÉ PAR LE TRAVAIL LUI-MÊME** : sa première version
recommandait de sortir `telemetry_events` de la publication realtime, « aucun client ne s'y abonne ».
C'était faux — le Centre de pilotage s'y abonne depuis son backend, et la retirer aurait éteint le
direct du tableau de bord **sans une erreur**. L'inventaire avait été fait sur `js/` seul. C'est la
raison d'être de la gate du geste ③ : une règle vérifiée à la main se re-vérifie mal.
