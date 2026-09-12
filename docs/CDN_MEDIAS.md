# Cache CDN des médias — Edge Function Netlify sur `/media/*` (2026-09-11)

**Le problème.** Le forfait Supabase gratuit donne **5 Go de sortie par mois**, et
Supabase Storage répond `Cache-Control: no-cache` sur les objets publics (mesuré le
2026-09-11 sur un avatar récent comme sur une vidéo de juillet). Chaque vue d'une vidéo
retélécharge donc le fichier depuis Supabase : une vidéo de 10 Mo vue 50 fois consomme
0,5 Go. Avec des vidéos dans le fil, quelques dizaines de spectateurs suffisent à
atteindre le plafond — et au-delà, plus aucun média ne se charge.

**La réponse, gratuite.** Les médias passent par `https://passio-app.netlify.app/media/…`,
servi par une **Edge Function Netlify** (`netlify/edge-functions/media.js`) qui va chercher
le fichier chez Supabase **une fois**, puis impose ses propres en-têtes de cache : le CDN
Netlify sert les vues suivantes depuis le bord, et Supabase n'est plus sollicité. Le forfait
Netlify gratuit porte **100 Go/mois**, vingt fois plus. La fonction ne tourne qu'au premier
passage d'un fichier par nœud du CDN ; les vues suivantes ne l'invoquent pas.

Ce montage remplace le Worker Cloudflare décrit dans `docs/CDN_CLOUDFLARE.md`, qui exigeait
un compte Cloudflare de plus. Le Worker reste dans `cloudflare/` comme solution de secours :
même contrat d'URL (`<base>/<seau>/<chemin>`), il suffirait de changer `PASSIO_CDN_BASE`.

> ⚠️ **Les pièces jointes de messagerie NE PASSENT PLUS par le CDN depuis le 2026-09-11.**
> Le seau `attachments` est privé (migration `migration_ouverture_publique_2026-09-11.sql`,
> partie ⑥) : ses objets se lisent par **URL signée**, membre par membre
> (`urlPieceJointeSignee`, app-02), jamais via un cache public. `cdnUrl()` laisse donc
> intacte toute URL dont le chemin commence par `attachments/`, et le résolveur reconnaît
> encore la forme CDN des messages écrits entre le 11/09 matin et ce lot. Seul le seau
> `content` (médias publics du fil) passe par `/media/*`.

---

## Les pièces

| Pièce | Fichier | Rôle |
|---|---|---|
| Edge Function | `netlify/edge-functions/media.js` | `/media/<seau>/<chemin>` → objet public ; `?width=700&quality=75` → miniature (transformation d'image Supabase). Seaux `content` et `attachments` seulement, GET/HEAD seulement. Cache 1 an (`cache: "manual"` + `Netlify-CDN-Cache-Control`), clé bornée à `width` et `quality` (`Netlify-Vary`). Une erreur d'origine sort en `no-store`, jamais en cache. |
| Base du CDN | `PASSIO_CDN_BASE` (app-08), exposée en `window.PASSIO_CDN_BASE` | `"https://passio-app.netlify.app/media"`. **Vide = désactivé** : les nouveaux uploads reprennent l'URL Supabase directe. |
| Réécriture à l'upload | `cdnUrl()` (app-08), appelée aux deux points d'upload (app-08 photos/vidéos, app-09 pièces jointes) | `…/storage/v1/object/public/<seau>/<chemin>` → `<base>/<seau>/<chemin>`. C'est l'URL **stockée en base**. |
| Miniatures | `passioThumb()` (app-02) | une URL CDN reçoit `?width=…&quality=75` (relayé vers `render/image`) ; une URL Supabase directe garde l'ancienne transformation ; le reste est intact. |
| Suppression | `_cheminsMediaPost()` (app-04) | retrouve le chemin Storage sous les **deux** formes d'URL — sinon chaque média publié via le CDN resterait orphelin à la suppression, sans erreur. |
| Tests | `tests/e2e/app-helper.js` (`MOTIF_MEDIAS_DISTANTS`), `tests/e2e/cdn-medias.spec.js` | l'interception des médias distants couvre aussi `/media/(content|attachments)/` — sans quoi une suite chargeant un profil réel irait chercher ses images sur le CDN de production ; 3 cas verrouillent les trois helpers. |
| Déploiement | `netlify.toml` → `edge_functions = "netlify/edge-functions"` | la CLI (`netlify deploy --dir dist`, lancée depuis la racine) embarque la fonction avec le site. |

## Ce qu'il faut savoir — les neuf règles de la fonction, chacune payée par un défaut

Une revue adversariale (trois lentilles, contre-expertise) a relu le premier jet le
2026-09-11 et confirmé neuf défauts. Chacun est devenu une règle du fichier :

1. **GET/HEAD seulement, dans le code** : le manifeste Netlify refuse « HEAD » dans
   `config.method` et faisait échouer le déploiement entier.
2. **Garde `..` par segment** : un test de sous-chaîne refusait `rapport..final.pdf`.
3. **Liste blanche des types servis en ligne** (image sauf SVG, vidéo, audio) ; le reste
   part en `application/octet-stream` + `Content-Disposition: attachment`. Sans elle, un
   SVG portant un `<script>` déposé dans `content` (aucune contrainte MIME sur les seaux,
   délibérément) s'exécutait **sur l'origine de l'app** et lisait le jeton de session.
   Et sur **toutes** les réponses : `Content-Security-Policy: sandbox; default-src 'none'`,
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` — le bloc `[[headers]]` de
   `netlify.toml` ne s'applique pas aux réponses d'une Edge Function (limitation Netlify).
4. **`Accept` jamais relayé** à la transformation d'image : Supabase choisit le format selon
   lui, et la clé de cache ne varie que sur `width|quality` — le premier demandeur aurait
   figé JPEG ou WebP pour tous. Accept fixe (WebP).
5. **Cache court** : 1 h pour les images, 6 h pour vidéo et audio. Les images sont ce qu'on
   remplace au même chemin (photo et fond de passion, couverture d'événement, `upsert`) ;
   un média retiré par son auteur ou la modération disparaît en une heure ou six, pas dans
   un an. Coût : un retrait Supabase par fichier, par heure ou six heures, par nœud.
6. **`Range` servi en 206** : iOS exige les requêtes par plage pour lire une vidéo ou un
   audio. La fonction tire la copie **entière** via sa propre URL (donc depuis le cache du
   bord, sans nouvelle sortie Supabase) et **découpe le flux** à la volée ; repli sur
   l'origine avec `Range` relayé si cette lecture interne échoue. `Accept-Ranges: bytes`.
7. **Erreur d'origine en `no-store`** : jamais un 404 en cache.
8. **`Netlify-Vary: query=width|quality`** : un `?utm=…` ne fragmente pas le cache.
9. **`cache: "manual"`** : sans lui, Netlify ignore tout en-tête de cache d'une Edge Function.

Et côté app :

- **`sw.js` n'intercepte pas `/media/*`** : même origine que l'app désormais, chaque vidéo
  vue serait sinon copiée dans le Cache Storage de l'appareil, sans borne, et un média
  supprimé servi à vie depuis l'appareil.
- **Les vocaux passent aussi par `cdnUrl`** (app-09) : la pièce jointe y passait, pas le
  vocal — une dérive trouvée en revue.
- ⚠️ **Les anciens médias gardent leur URL Supabase directe** tant que la base n'est pas
  réécrite : `replace` du préfixe sur `posts.media_url`, `stories.media_url`,
  `profiles.avatar_url`/`cover_url`, `video_lives.author_photo`, `conv_messages.content`,
  à jouer **après** avoir vu `Cache-Status … hit` en production. `user_state.data` n'est
  pas réécrit : c'est un cache d'appareil.
- **Rien à ajouter dans la CSP de l'app** : le CDN est la même origine (`'self'`).
- Kill switch : `PASSIO_CDN_BASE = ""`. Les nouveaux uploads repartent en direct, les URLs
  CDN déjà stockées continuent d'être servies par la fonction. Les tests restent verts dans
  les deux états — un kill switch qui rougit la CI n'en est pas un.

## Vérifier en production

```
curl -sI https://passio-app.netlify.app/media/content/avatars/<uid>/<fichier>.jpg
```

- (GET, pas HEAD : `curl -s -o /dev/null -D -`) 1ʳᵉ requête : `Cache-Status: "Netlify Edge"; fwd=miss; stored` et `X-Passio-Cdn: objet`
- 2ᵉ requête : `Cache-Status: "Netlify Edge"; hit`
- avec `?width=100` : `X-Passio-Cdn: miniature`, corps de quelques Ko
- avec `-r 0-1` sur une vidéo : `HTTP/1.1 206`, `Content-Range: bytes 0-1/<total>`, `X-Passio-Cdn: plage`
- mesuré sur la prévisualisation de la PR #333 : `hit; ttl=…` à la troisième requête, vidéo de 24 Mo servie entière en 2,7 s

Dans l'app : publie une photo, ouvre l'onglet Réseau, l'URL du média commence par
`passio-app.netlify.app/media/`. Une vidéo de 25 Mo doit se lire jusqu'au bout.

## Ce que ça change pour la capacité

| Mur | Avant | Après |
|---|---|---|
| Sortie médias | 5 Go/mois Supabase, sans cache | 100 Go/mois Netlify, chaque fichier tiré de Supabase une fois par nœud |
| Invocations Edge | — | seulement les premiers passages ; le forfait gratuit en couvre un million par mois |

Le prochain mur devient le **stockage** (1 Go) et les **200 connexions temps réel
simultanées** du forfait Supabase gratuit — voir `docs/OUVRIR_AU_PUBLIC_2026-09-10.md`.
