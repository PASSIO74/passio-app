// ═══════════════════════════════════════════════════════════════════════════
// PASSIO · CACHE CDN DES MÉDIAS — Netlify Edge Function, gratuite, sur /media/*
//
// Pourquoi. Le forfait Supabase gratuit donne 5 Go de sortie par mois, et
// Supabase Storage répond `Cache-Control: no-cache` sur les objets publics
// (mesuré le 2026-09-11) : une vidéo de 10 Mo vue 50 fois consomme 0,5 Go, et
// un simple proxy Netlify ne mettrait RIEN en cache puisqu'il respecte
// l'origine. Cette fonction va chercher le fichier une fois, puis IMPOSE ses
// propres en-têtes : le CDN Netlify sert les vues suivantes depuis le bord,
// Supabase n'est plus sollicité. Le forfait Netlify gratuit porte 100 Go/mois.
//
// Deux formes d'URL, un seul point d'entrée :
//   /media/<bucket>/<chemin>                      → objet public tel quel
//   /media/<bucket>/<chemin>?width=700&quality=75 → miniature (transformation
//                                                   d'image Supabase, déjà
//                                                   utilisée par le fil)
//
// ⚠️ SEULS LES DEUX SEAUX PUBLICS CONNUS sont servis, en lecture seule
// (GET/HEAD) : ce n'est pas un proxy ouvert. Un seau privé répondrait 4xx
// côté Supabase de toute façon, mais on ne relaie même pas la demande.
//
// ⚠️ `cache: "manual"` est OBLIGATOIRE : sans lui, Netlify ignore tout
// en-tête de cache posé par une Edge Function (règle documentée). Et
// `Netlify-Vary: query=width|quality` borne la clé de cache à ces deux
// paramètres : un `?utm=…` parasite ne fragmenterait pas le cache.
//
// ⚠️ Les requêtes `Range` (lecture vidéo par morceaux) ne sont PAS relayées :
// on répond le fichier ENTIER en 200 avec `Accept-Ranges: none`. C'est ce qui
// rend le cache efficace (une entrée par fichier, pas une par morceau) ; le
// navigateur lit en progressif, et les vidéos font 25 Mo au plus (plafond des
// seaux). Même choix que le Worker Cloudflare de secours (cloudflare/).
//
// Vérifier en production : `curl -sI https://passio-app.netlify.app/media/content/…`
//   → 1ʳᵉ fois `Cache-Status: "Netlify Edge"; fwd=miss`, ensuite `hit`.
// Revenir en arrière : `PASSIO_CDN_BASE = ""` dans js/app-08 (les nouveaux
// médias reprennent l'URL Supabase directe) — cette fonction peut rester.
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE = "https://njkiyoklssvefstljemx.supabase.co";
const SEAUX = new Set(["content", "attachments"]);
const UN_AN = "public, max-age=31536000, immutable";

export default async (req) => {
  const url = new URL(req.url);
  const rel = url.pathname.replace(/^\/media\//, "");
  const seau = rel.split("/")[0];
  if (!SEAUX.has(seau) || rel.length <= seau.length + 1 || rel.includes("..")) {
    return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const width = url.searchParams.get("width") || "";
  const quality = url.searchParams.get("quality") || "";
  const miniature = /^\d{2,4}$/.test(width);
  const cible = miniature
    ? `${SUPABASE}/storage/v1/render/image/public/${rel}?width=${width}&quality=${/^\d{1,3}$/.test(quality) ? quality : "75"}`
    : `${SUPABASE}/storage/v1/object/public/${rel}`;

  const origine = await fetch(cible, {
    method: req.method === "HEAD" ? "HEAD" : "GET",
    headers: { Accept: req.headers.get("accept") || "*/*" },
  });

  const h = new Headers();
  for (const k of ["content-type", "content-length", "etag", "last-modified"]) {
    const v = origine.headers.get(k);
    if (v) h.set(k, v);
  }
  h.set("Access-Control-Allow-Origin", "*");
  h.set("X-Passio-Cdn", miniature ? "miniature" : "objet");

  if (!origine.ok) {
    // Une erreur d'origine ne doit JAMAIS être mise en cache un an.
    h.set("Cache-Control", "no-store");
    return new Response(origine.body, { status: origine.status, headers: h });
  }

  h.set("Cache-Control", UN_AN);
  h.set("Netlify-CDN-Cache-Control", "public, s-maxage=31536000, immutable");
  h.set("Netlify-Vary", "query=width|quality");
  h.set("Accept-Ranges", "none");
  return new Response(origine.body, { status: 200, headers: h });
};

export const config = {
  path: "/media/*",
  method: ["GET", "HEAD"],
  cache: "manual",
  onError: "bypass",
};
