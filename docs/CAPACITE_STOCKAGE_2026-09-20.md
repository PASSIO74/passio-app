# Stockage : le ménage est utile, le mur n'était pas là — le forfait est **Pro** (2026-09-20)

Demande de Benjamin, après trois volets de capacité : « les résultats ne me conviennent, je veux
beaucoup plus de volume d'utilisateurs, trouve des solutions ».

Ce dossier devait lire enfin le forfait — ce que `CLAUDE.md` nommait depuis la veille comme un point
ouvert : « le forfait Supabase n'a jamais été LU ».

## 0. ⚠️ Correction : il ne l'a pas lu, il l'a déduit, et la déduction était fausse d'un facteur 100

La première rédaction de ce dossier s'intitulait « le mur le plus proche n'est pas le CPU, c'est
1 Go de stockage » et concluait à **≈ 125 comptes**. Ce 1 Go est le plafond du palier **GRATUIT**,
supposé à partir de la consigne « sans investir » — **jamais mesuré**.

**L'organisation est sur le forfait Pro** (page Billing de Supabase, constatée le 2026-09-20 :
« Pro Plan », 25 $/mois, 9,66 $ de calcul absorbés par les crédits, facture projetée 28,75 $). Le
stockage consommé, 80 Mo, est donc à **deux ordres de grandeur** sous le plafond : **il n'y a pas de
mur à cette distance**, et le classement de la section 1 était faux dans son entier.

**Une déduction présentée comme une mesure est exactement la faute que ce dépôt reproche partout
ailleurs** — « l'état ne se lit pas dans un fichier du dépôt, il se mesure ». Ici elle portait sur le
forfait lui-même, et elle a failli lancer un chantier Cloudflare R2 complet (section 5) pour rien.

**Deux choses que la capture apprend, et qui n'étaient dans aucune hypothèse :**

- **Le spend cap est ACTIVÉ.** Dépasser un quota ne produit pas une facture : *« your projects could
  become unresponsive or enter read only mode »*. Le raisonnement « plafond = mur dur » de tous les
  lots de capacité **tient donc** ; seuls les nombres changent.
- **La facture projetée dépasse le forfait** (28,75 $ pour 25 $) parce que **deux** projets
  consomment du calcul : `PASSIO74's Project` (Micro, 578 h) et **`PASSIO staging` (Micro, 141 h)**,
  rallumé pour l'exercice de restauration du 14/09 et **jamais remis en pause**. Le mettre en pause
  ramène la facture à 25 $ — c'est le sens littéral de « sans investir ».

**Les quotas chiffrés du Pro ne sont toujours pas relevés**, et on ne les recopie pas de mémoire :
ils sont sur la page **Usage** de l'organisation, avec la consommation en regard. Tant qu'ils n'y
sont pas lus, **aucun classement des plafonds par distance n'est publiable** — c'est précisément
l'erreur qu'on vient de payer.

## 1. ~~Les cinq plafonds, classés par distance~~ — RETIRÉ

Ce tableau reposait sur le palier gratuit. Le seul plafond qu'il portait et qui reste établi ne
vient pas de Supabase : **300 e-mails par jour chez Brevo**, donc 300 inscriptions par e-mail,
**illimitées par Google**.

Ce qui reste vrai et ne dépend d'aucun quota : **sept vidéos pèsent 59 Mo sur les 70 du seau
`content`**, la plus grosse 24 Mo à elle seule, et **les trois plus grosses datent de juillet** —
d'avant le compresseur, étendu aux trois portes le 19/09 et applicable aux seuls **nouveaux** envois.
C'est une charge utile servie à des téléphones sur données mobiles : l'argument n'a jamais eu besoin
d'un plafond pour tenir.

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

- **Purge des orphelins** : 80 → 26,5 Mo. Geste d'exploitation (canal ②), à faire depuis le poste :
  `npm run medias:orphelins` puis `-- --appliquer`, et on **mesure l'état en base ensuite**, jamais
  le tableau imprimé. ⚠️ La première rédaction vendait ça comme une « marge ×3 sur le mur le plus
  proche » : **il n'y a pas de mur à cette distance** (section 0), et le geste n'en avait pas besoin
  — on ne garde pas 53,5 Mo de fichiers que plus rien ne référence, sauvegardés et restaurés à
  chaque exercice.
- ⚠️ **NE PAS PARTIR SUR CLOUDFLARE R2.** Cette section le présentait comme « le vrai déverrouillage
  d'ordre de grandeur » : c'est la conséquence directe du forfait mal déduit. R2 offre **10 Go**, là
  où le Pro en donne deux ordres de grandeur de plus — on aurait migré **vers un plafond plus bas**,
  en ajoutant un fournisseur, un signeur SigV4 (la clé ne doit jamais atteindre le navigateur) et une
  seconde origine à maintenir dans `netlify/edge-functions/media.js`. Le chantier a été arrêté avant
  le premier commit.
- ⚠️ **Et s'il est rouvert un jour** : le seau **`attachments` ne peut pas migrer**. R2 n'a pas de
  RLS, et la confidentialité des pièces jointes de messagerie repose entièrement sur
  `is_conv_member((storage.foldername(name))[2], auth.uid())` plus des URL signées d'une heure. Seul
  `content` serait éligible — soit 70 Mo des 80.
- **Ce que le lot ne fait toujours pas** : il ne change pas le **rythme** de remplissage (8 Mo par
  compte).

## 6. Ce qui reste, nommé

- **Recompresser les sept vidéos de juillet** (59 Mo → ~11 Mo attendus) : le compresseur ne
  s'applique qu'aux nouveaux envois. Geste d'exploitation, hors de cet outil.
- **WebP pour les images** (−25 à 30 % à qualité égale) — non fait ici. Comme la recompression, ça
  vaut pour la charge utile mobile, pas pour un quota.
- **Apple Sign-In** : zéro e-mail, comme Google. C'est le seul poste de cette liste qui touche encore
  un plafond réel (300/jour chez Brevo), et les testeuses sont sur iPhone.
- **Mettre `PASSIO staging` en pause** : 141 h de calcul Micro sur la facture en cours, crédits
  dépassés, 28,75 $ projetés pour 25 $ de forfait. Rallumé le 14/09 pour l'exercice de restauration.
- ⚠️ **Lire les quotas chiffrés du Pro** sur la page Usage de l'organisation. Tant que ce n'est pas
  fait, personne ne peut dire quel est le plafond le plus proche — et c'est le trou qui a produit la
  section 0.
- ~~**Rétention de télémétrie 7 j → 2 j**~~ — **RETIRÉ.** Motivé par « 46 % d'une base plafonnée à
  500 Mo » : ce plafond est celui du palier gratuit. La base fait 71 Mo et le Pro est ailleurs. Une
  migration, donc une contre-revue humaine, pour un problème qui n'existe pas.
- ~~**R2**~~ — **RETIRÉ**, voir section 5.

Verrou : `tests/unit/medias-orphelins.test.mjs` (9 cas, dans `npm run verif`), **éprouvé par
RÉINJECTION de quatre mutations** — garde d'âge retirée (**3 rouges**), chemin entier au lieu du nom
(**2**, dont ② bis), nom vide classé orphelin (**1**), source `user_state` retirée (**1**).
