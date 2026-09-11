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

## Ce qu'il faut savoir

- ⚠️ **`Range` n'est pas relayé.** La fonction répond le fichier entier en `200` avec
  `Accept-Ranges: none` : une entrée de cache par fichier, pas une par morceau. Le
  navigateur lit en progressif ; les vidéos font 25 Mo au plus (plafond des seaux, 26 Mo).
  Le Worker Cloudflare faisait le même choix.
- ⚠️ **Les anciens médias gardent leur URL Supabase directe** tant que la base n'est pas
  réécrite. La réécriture est une commande SQL (`replace` du préfixe sur `posts.media_url`,
  `stories.media_url`, `profiles.avatar_url`/`cover_url`, `video_lives.author_photo`,
  `conv_messages.content`) à jouer **après** avoir vu `Cache-Status … hit` en production.
  `user_state.data` n'est pas réécrit : c'est un cache d'appareil, il se resynchronise.
- ⚠️ **Rien à ajouter dans la CSP** : le CDN est la même origine que l'app (`'self'`).
- Le kill switch est `PASSIO_CDN_BASE = ""` : les nouveaux uploads repartent en direct, les
  URLs CDN déjà stockées continuent d'être servies par la fonction, qui peut rester.

## Vérifier en production

```
curl -sI https://passio-app.netlify.app/media/content/avatars/<uid>/<fichier>.jpg
```

- 1ʳᵉ requête : `Cache-Status: "Netlify Edge"; fwd=miss` et `X-Passio-Cdn: objet`
- 2ᵉ requête : `Cache-Status: "Netlify Edge"; hit`
- avec `?width=100` : `X-Passio-Cdn: miniature`, corps de quelques Ko

Dans l'app : publie une photo, ouvre l'onglet Réseau, l'URL du média commence par
`passio-app.netlify.app/media/`. Une vidéo de 25 Mo doit se lire jusqu'au bout.

## Ce que ça change pour la capacité

| Mur | Avant | Après |
|---|---|---|
| Sortie médias | 5 Go/mois Supabase, sans cache | 100 Go/mois Netlify, chaque fichier tiré de Supabase une fois par nœud |
| Invocations Edge | — | seulement les premiers passages ; le forfait gratuit en couvre un million par mois |

Le prochain mur devient le **stockage** (1 Go) et les **200 connexions temps réel
simultanées** du forfait Supabase gratuit — voir `docs/OUVRIR_AU_PUBLIC_2026-09-10.md`.
