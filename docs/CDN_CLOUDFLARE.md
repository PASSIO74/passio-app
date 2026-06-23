# CDN Cloudflare devant Supabase Storage

**But** : mettre en cache les médias (photos, vidéos, vocaux, pièces jointes) au
bord du réseau Cloudflare pour **soulager l'egress de Supabase** (5 Go/mois sur le
forfait gratuit). Une fois un fichier servi une fois, les vues suivantes sortent du
cache Cloudflare — Supabase n'est plus sollicité.

Gratuit, **aucun nom de domaine requis** (on utilise un sous-domaine `*.workers.dev`).

---

## Ce qui est déjà fait côté code (rien à toucher)

- `cacheControl: 31536000` (1 an) sur les uploads → les fichiers sont cachables.
- Helper `cdnUrl()` + constante `PASSIO_CDN_BASE` dans `js/app-08-ui-modals-tour.js`.
  Tant que `PASSIO_CDN_BASE` est **vide**, l'app sert les URLs Supabase directes
  (comportement actuel). Dès qu'on y colle l'URL du Worker, **tous les nouveaux
  uploads** passent par le CDN.
- Worker prêt à déployer : `cloudflare/passio-cdn-worker.js`.
- CSP : `img-src`/`media-src` autorisent déjà `https:` → **aucune modif CSP** pour
  afficher les médias. (Les médias sont des attributs `src`, pas des `fetch`.)

## Ce qu'il reste à faire (≈ 5 min, dans TON compte Cloudflare)

### 1. Déployer le Worker
1. Crée un compte gratuit sur https://dash.cloudflare.com
2. **Workers & Pages** → **Create application** → **Create Worker**.
3. Donne-lui un nom, ex. `passio-cdn` → **Deploy** (worker par défaut).
4. **Edit code** → efface tout → colle le contenu de
   `cloudflare/passio-cdn-worker.js` → **Deploy**.
5. Copie l'URL publique affichée, ex. `https://passio-cdn.TONCOMPTE.workers.dev`.

### 2. Brancher l'app
1. Ouvre `js/app-08-ui-modals-tour.js`, trouve `const PASSIO_CDN_BASE = "";`
2. Colle l'URL **sans slash final** :
   ```js
   const PASSIO_CDN_BASE = "https://passio-cdn.TONCOMPTE.workers.dev";
   ```
3. `git commit` + `git push origin main` → déploiement Netlify automatique.

### 3. Vérifier que ça marche
- Publie une photo/vidéo depuis l'app, ouvre-la, puis dans l'onglet **Réseau**
  des DevTools regarde la requête du média :
  - l'URL doit pointer vers `…workers.dev/content/…` (plus `supabase.co`) ;
  - en-tête de réponse `X-Passio-Cache: MISS` à la 1ʳᵉ vue, **`HIT`** ensuite ;
  - `cf-cache-status: HIT` confirme le cache Cloudflare.

---

## Détails utiles

- **Médias existants** : ils gardent leurs URLs Supabase directes (toujours
  valides). Seuls les **nouveaux** uploads passent par le CDN. La bascule est donc
  progressive et sans risque — pas de migration. Pour forcer l'ancien contenu sur
  le CDN, on pourrait réécrire les `media_url`/`url` en base (optionnel, plus tard).
- **Buckets proxiés** : `content` et `attachments` uniquement, lecture seule
  (GET/HEAD) — le Worker refuse tout le reste (pas de proxy ouvert).
- **Revenir en arrière** : remets `PASSIO_CDN_BASE = ""`, commit, push. Les URLs
  Supabase directes reprennent immédiatement pour les nouveaux médias.
- **Limites Workers gratuit** : 100 000 requêtes/jour — large pour une beta, et le
  cache Cloudflare absorbe l'essentiel.
- **`connect-src`** : à ajouter dans la CSP (`netlify.toml`) UNIQUEMENT si un jour
  on charge un média via `fetch()`/XHR au lieu d'un attribut `src`. Aujourd'hui ce
  n'est pas le cas, donc inutile.
