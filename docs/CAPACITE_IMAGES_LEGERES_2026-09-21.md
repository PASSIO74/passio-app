# Photos de publication : une version légère à côté de la grande — 21 septembre 2026

Lot de capacité développé depuis `8dd33f3` (PR #520). Risque normal : client
seulement (génération et envoi côté navigateur, Storage existant), aucune
migration, aucune conversion des médias existants. Implémentation Claude Code.

## Le poste, mesuré

- `.app-shell` fait **540 px CSS au plus** : aucune surface de PASSIO n'affiche
  une image plus large. Pourtant une photo publiée est stockée jusqu'à
  2 048 px (`_downscaleImageForUpload`, JPEG 0,88) et **deux surfaces la
  servaient entière** : la grille « Photos » du profil (cellules ~120 px,
  app-06) et l'album d'une activité (app-07). Le fil et le détail demandaient
  une transformation d'image Supabase (`?width=700&quality=75`) — service
  compté au forfait par **image d'origine** (19/100 sur le cycle en cours), qui
  grandit avec le catalogue, et qui lit l'original à chaque nouvelle largeur.
- Production (canal ①, 21/09) : 10 photos de publication, 1 274 635 octets,
  de 32 à 250 Ko ; 4 sont des stories 720×720 en JPEG de 46 à 74 Ko.

## Ce qui change

- À l'envoi d'une photo de **publication** (`folder === "photos"`) :
  `_imageLegerePourFil` (app-08) produit une seconde image, **720 px de large
  au plus, jamais agrandie**, WebP q0,80 quand le navigateur sait l'encoder
  (transparence conservée), sinon JPEG q0,82 ou PNG pour une source PNG ;
  gardée seulement si elle fait économiser **≥ 15 %** — une story 720×720
  JPEG y gagne autant qu'une grande (le format pèse autant que la largeur).
  L'orientation EXIF est appliquée par le décodeur du navigateur, comme pour la
  grande : les deux sont droites.
- Storage : la grande d'abord (`photos/<uid>/<id>.jpg`, comme avant) PUIS la
  légère (`photos/<uid>/<id>.v720.webp`). `media_url` désigne la **légère**
  (le marqueur est dans le nom : aucune colonne, aucune requête d'essai,
  aucun 404). Si la légère échoue, la grande vit seule sans marqueur — le
  chemin d'avant ; jamais l'inverse (pas de légère sans original).
- Affichage : `estImageLegere(url)` / `imageGrande(url)` (app-02, autorité
  unique). `passioThumb` sert une légère **telle quelle** — plus de
  transformation pour une photo publiée après le lot. La grille du profil
  (`passioThumb(…, 360)`) et l'album d'une activité (`passioThumb(…, 400)`) ne
  demandent plus la grande, même pour les anciennes photos (transformation à
  la demande, sans nouvelle image d'origine : celle-ci est déjà comptée par le
  fil).
- La **grande** reste l'original de référence en Storage. Elle n'est affichée
  **nulle part** aujourd'hui — aucune surface n'excède 540 px CSS — et le dire
  vaut mieux que lui inventer un usage : `imageGrande` est prête pour un
  visualiseur plein écran ou un téléchargement si le produit en veut un.
- Hors périmètre, délibérément : avatars et couvertures (servis à 192/880 px
  par transformation, hors du fil), stories, GIF (animation), vidéos. Aucune
  conversion des photos existantes : elles suivent le chemin d'avant.

## Mesures (`node scripts/mesure-images-legeres.mjs`, 10 photos réelles de production, Chromium, la fonction du produit)

| Photo | Grande stockée | Transformation 700/q75 (fil, avant) | Légère (après) |
|---|---:|---:|---:|
| 945×2048 JPEG | 250 660 | 72 146 | 75 978 (720×1560) |
| 960×1280 WebP | 205 538 | 84 750 | 79 506 |
| 1080×1920 JPEG | 199 719 | 33 126 | 35 224 |
| 1080×1920 JPEG | 176 440 | 32 888 | 29 474 |
| 1200×1600 WebP | 154 500 | 68 100 | 71 484 |
| 1200×1600 WebP | 75 982 | 28 010 | 29 616 |
| 720×720 JPEG | 73 822 | 13 698 | 23 222 |
| 720×720 JPEG | 59 087 | 10 084 | 14 708 |
| 720×720 JPEG | 46 117 | 11 752 | 15 236 |
| 591×1280 WebP | 32 770 | 26 254 | aucune (gain < 15 %) → grande |
| **Total** | **1 274 635** | **380 808** | **407 218** |

- **Grilles et albums** (grande → légère) : **−68 %** d'octets par photo
  affichée.
- **Fil et détail** (transformation → légère) : **+7 %** d'octets (WebP q0,80
  contre q75) — même ordre, mais **zéro transformation d'image** pour ces
  photos : ni quota par image d'origine, ni lecture de l'original par le
  service, ni cache par largeur.
- **Stockage supplémentaire** : **+29 %** (373 Ko de légères à côté de
  1 245 Ko de grandes) — payé une fois, sur un poste qui n'est pas un mur
  (Storage 0,139/100 Go).
- Coût de préparation : 27 à 89 ms par photo dans Chromium, à l'envoi.

Ce que ces chiffres ne disent pas : la qualité perçue (WebP q0,80 à 720 px est
la même famille que ce que le fil servait déjà) ; le comportement du décodeur
sur un iPhone ancien (WebP lu depuis iOS 14, encodé depuis Safari 16 — sinon
JPEG) ; un gain de trafic global, qui dépend de ce que les gens ouvrent.

## Vérification

- `tests/e2e/capacite-images-legeres.spec.js` (5) : vrai générateur (720 px,
  WebP, plus petite, jamais agrandie, GIF exclu), transparence d'un PNG
  mesurée au pixel, vrai `supaUploadMedia` sur un Storage simulé (grande puis
  légère, chemins et types, URL rendue, légère refusée → grande), aucun
  second objet pour avatars/couvertures/activités/GIF, `passioThumb` sans
  transformation sur une légère, `imageGrande`, rendu du fil, câblage de la
  grille et de l'album à la source.
- `capacite-medias-publics` (10) + `capacite-sans-investir` (17) verts.
  `audit:telemetry-keys` : les cinq champs de `image_legere` survivent au
  filtre PII.

Retour arrière : revert du commit ; les légères déjà envoyées restent des
objets Storage valides que `media_url` désigne — un client d'avant les affiche
(c'est une image) sans les reconnaître (il leur demanderait une transformation,
qui fonctionne aussi sur un WebP). Pilotage : événement `image_legere`
(`grande_octets`, `legere_octets`, `largeur`, `format`, `issue`), une ligne par
photo, jamais d'URL.
