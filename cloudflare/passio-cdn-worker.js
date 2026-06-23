/* ============================================================
   PASSIO · CDN Worker (Cloudflare, gratuit)
   ------------------------------------------------------------
   Met en cache les médias publics de Supabase Storage au bord
   du réseau Cloudflare → soulage l'egress du forfait Supabase
   gratuit (5 Go/mois). Une fois un fichier servi, les vues
   suivantes sortent du cache Cloudflare, pas de Supabase.

   DÉPLOIEMENT (aucun nom de domaine requis) :
   1. Compte Cloudflare gratuit → Workers & Pages → Create Worker.
   2. Coller CE fichier, Deploy.
   3. Copier l'URL "*.workers.dev" du Worker.
   4. La coller dans PASSIO_CDN_BASE (js/app-08), sans slash final.
   5. Autoriser ce domaine dans la CSP (img-src/media-src).
   Détail pas à pas : docs/CDN_CLOUDFLARE.md

   Le Worker ne proxie QUE les buckets publics connus (content,
   attachments) en lecture seule (GET/HEAD) — pas d'accès libre.
   ============================================================ */

const SUPABASE = "https://njkiyoklssvefstljemx.supabase.co";
const PUBLIC_PREFIX = "/storage/v1/object/public";
const ALLOWED_BUCKETS = ["content", "attachments"];

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    // pathname attendu : /<bucket>/<chemin...>  (ex. /content/<uid>/<fichier>)
    const bucket = url.pathname.split("/")[1] || "";
    if (!ALLOWED_BUCKETS.includes(bucket)) {
      return new Response("Not Found", { status: 404 });
    }

    const target = SUPABASE + PUBLIC_PREFIX + url.pathname;
    const cache = caches.default;
    const cacheKey = new Request(target, { method: "GET" });

    // 1) Déjà en cache au bord ?
    let resp = await cache.match(cacheKey);
    if (resp) {
      resp = new Response(resp.body, resp);
      resp.headers.set("X-Passio-Cache", "HIT");
      return resp;
    }

    // 2) Sinon, on va chercher chez Supabase et on met en cache 1 an.
    const origin = await fetch(target, {
      cf: { cacheTtl: 31536000, cacheEverything: true },
    });

    resp = new Response(origin.body, origin);
    resp.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    resp.headers.set("Access-Control-Allow-Origin", "*");
    resp.headers.set("X-Passio-Cache", "MISS");

    if (origin.ok) {
      // clone() car le corps ne peut être lu qu'une fois.
      const toCache = resp.clone();
      // waitUntil non dispo ici sans ctx → put synchrone best-effort.
      try { await cache.put(cacheKey, toCache); } catch (e) {}
    }
    return resp;
  },
};
