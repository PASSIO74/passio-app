# Le mur le plus proche n'est pas le CPU, c'est 1 Go de stockage (2026-09-20)

Demande de Benjamin, après trois volets de capacité : « les résultats ne me conviennent, je veux
beaucoup plus de volume d'utilisateurs, trouve des solutions ».

Il avait raison de ne pas être satisfait : **les trois volets précédents travaillaient sur un axe
qui n'est pas celui qui borne le nombre d'utilisateurs.** Ce dossier lit enfin le forfait — ce que
`CLAUDE.md` nommait depuis la veille comme un point ouvert : « le forfait Supabase n'a jamais été
LU ».

## 1. Les cinq plafonds, mesurés, classés par distance

Canal ① d'ADR-012, production, 2026-09-20, **dix comptes** dont six actifs sur 30 jours.

| Plafond du forfait gratuit | Consommé | Utilisateurs avant le mur |
|---|---|---|
| **Stockage 1 Go** | **80 Mo** → 8 Mo/compte | **≈ 125** *(≈ 300 avec la compression vidéo du 19/09)* |
| Base 500 Mo | 71 Mo, dont 33 de télémétrie | quelques milliers |
| Sortie réseau | déportée sur Netlify (100 Go/mois) | loin |
| MAU | 10 | 50 000 |
| Inscriptions/jour (Brevo) | — | **300 par e-mail, illimité par Google** |
| CPU / temps réel | — | milliers de **simultanés** |

**Le stockage est dix à trente fois plus proche que tout le reste.** Et sa cause est nette : **sept
vidéos pèsent 59 Mo sur les 70 du seau `content`**, la plus grosse 24 Mo à elle seule, et **les
trois plus grosses datent de juillet** — donc d'avant le compresseur, qui n'a été étendu aux trois
portes que le 19/09 et ne s'applique qu'aux **nouveaux** envois.

⚠️ **Le plafond qui borne vraiment l'ACQUISITION est ailleurs et ne se corrige pas par du code** :
300 e-mails par jour chez Brevo, confirmation obligatoire depuis le 30/08. Le seul geste qui l'a
levé est d'avoir remonté **Google en tête du formulaire** (lot du 19/09) : une inscription Google ne
coûte aucun e-mail. Apple Sign-In ferait la même chose, gratuitement, et les testeuses sont sur
iPhone.

## 2. 67 % du stockage ne sert plus à rien

| Seau | Orphelins | Poids orphelin | Total |
|---|---:|---:|---:|
| `content` | 24 / 60 | **50 Mo** | 70 Mo |
| `attachments` | 7 / 12 | **3,5 Mo** | 10 Mo |
| | | **53,5 Mo** | **80 Mo** |

Purger fait passer le stockage de 80 à **26,5 Mo** : la marge sur le 1 Go est **multipliée par
trois**, sans toucher à une seule donnée vivante.

⚠️ **LA PREMIÈRE MESURE ANNONÇAIT 62 Mo, ET ELLE ÉTAIT FAUSSE.** Elle ne lisait pas `user_state`,
le blob JSON qui porte les **publications perso** de chaque compte — six objets, 12 Mo, bien
vivants. **Une mesure spectaculaire se re-vérifie avant d'y croire**, et celle-ci décide de
suppressions.

## 3. L'outil : `npm run medias:orphelins`

`scripts/medias-orphelins.js`, sur le patron de `purge-e2e-storage.js` (rapport par défaut, garde
mécanique). Cœur **pur** (`classerOrphelins`), donc éprouvable sans réseau ni base.

⚠️ **UN ORPHELIN EST UNE ABSENCE DE PREUVE, PAS UNE PREUVE D'ABSENCE.** C'est tout le danger : un
objet est déclaré orphelin parce qu'on n'a trouvé son nom **nulle part**, et ici « orphelin » veut
dire « supprimé ». Toute source de référence oubliée **fabrique** des orphelins. D'où quatre
gardes, dont trois mécaniques :

1. **Rapport par défaut** — `--appliquer` est le seul chemin qui supprime.
2. **Âge minimum 30 j** — l'upload précède l'INSERT du post, et une publication hors ligne attend
   des heures dans sa file. Sans ce seuil, l'outil supprimerait ce qu'on vient d'envoyer.
3. **Fail-closed sur les références** — si **une** des cinq sources ne répond pas, on n'efface
   **rien**. Une lecture partielle ne rend pas « quelques orphelins de moins », elle rend « des
   objets vivants classés orphelins ».
4. **Plafond de 200 par exécution** — un chiffre inattendu est un signal, pas une quantité de
   travail.

Les cinq sources : `posts` (media_url, shared_data, overlays) · `profiles` (avatar_url, cover_url,
passions) · `stories` (media_url, overlays) · `conv_messages` (content) · **`user_state` (data)**,
celle qu'on oublie.

## 4. ⚠️ Ma justification du choix « nom de fichier » était fausse, et la réinjection l'a dit

J'avais écrit : « comparer l'URL entière classerait orphelin tout média publié avant le CDN ».
**C'est faux.** Le chemin de l'objet (`videos/u1/reel_x.mp4`) est sous-chaîne de l'URL Supabase
**comme** de l'URL CDN : la mutation « comparer le chemin entier » laissait le cas de test **vert**.
Il ne mesurait donc rien.

La **vraie** raison est le **sens de l'erreur** : comparer le seul nom de fichier est plus
**permissif**, donc tous les faux positifs vont dans le sens « on garde », jamais « on supprime ».
Le cas ② bis mesure enfin ce choix — une référence qui porte le nom **sans** son dossier — et
rougit sur la mutation.

**Une justification qu'une mutation dément est pire qu'un oubli : elle décourage de regarder.**
C'est la deuxième fois de la journée (après le chiffre-phare de #515).

## 5. Ce que ça donne, et ce que ça ne donne pas

- **Purge des orphelins** : 80 → 26,5 Mo, **marge ×3** sur le mur le plus proche. Geste
  d'exploitation (canal ②), à faire depuis le poste : `npm run medias:orphelins` puis
  `-- --appliquer`, et on **mesure l'état en base ensuite**, jamais le tableau imprimé.
- **Ce que ça ne fait pas** : ça ne change pas le **rythme** de remplissage. À 8 Mo par compte, le
  1 Go revient. Le vrai déverrouillage d'ordre de grandeur est de **sortir les médias de Supabase**
  — Cloudflare R2 offre 10 Go et l'égress gratuit, et l'architecture l'anticipe déjà (`/media/*`,
  `cdnUrl()`, `PASSIO_CDN_BASE`) : seul le chemin d'**écriture** changerait. Il faut un compte
  Cloudflare, que je ne peux pas créer.

## 6. Ce qui reste, nommé

- **Recompresser les sept vidéos de juillet** (59 Mo → ~11 Mo attendus) : le compresseur ne
  s'applique qu'aux nouveaux envois. Geste d'exploitation, hors de cet outil.
- **WebP pour les images** (−25 à 30 % à qualité égale) — non fait ici.
- **Rétention de télémétrie 7 j → 2 j** : 33 Mo → ~10 Mo. Petit en absolu, mais c'est 46 % de la
  base. Demande une migration, donc une contre-revue.
- **Apple Sign-In** : zéro e-mail, comme Google.
- **R2** : le seul levier ×10, bloqué sur un compte tiers.

Verrou : `tests/unit/medias-orphelins.test.mjs` (9 cas, dans `npm run verif`), **éprouvé par
RÉINJECTION de quatre mutations** — garde d'âge retirée (**3 rouges**), chemin entier au lieu du nom
(**2**, dont ② bis), nom vide classé orphelin (**1**), source `user_state` retirée (**1**).
