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
//   /media/<seau>/<chemin>                      → objet public tel quel
//   /media/<seau>/<chemin>?width=700&quality=75 → miniature (transformation
//                                                   d'image Supabase, déjà
//                                                   utilisée par le fil)
//
// ⚠️ LES NEUF RÈGLES DE CE FICHIER, chacune payée par un défaut trouvé en
// revue adversariale le 2026-09-11 (trois relecteurs, contre-expertise) :
//
// ① GET/HEAD seulement, gardé ICI et non dans `config.method` : le manifeste
//    Netlify n'accepte que GET, POST, PUT, PATCH, DELETE, OPTIONS — « HEAD »
//    y faisait échouer le déploiement entier.
// ② Seuls les deux seaux publics connus, garde `..` PAR SEGMENT : un test de
//    sous-chaîne refusait `rapport..final.pdf`, un nom que l'app laisse passer.
// ③ LISTE BLANCHE des types servis en ligne (image sauf SVG, vidéo, audio).
//    Tout le reste part en `application/octet-stream` + `attachment`. Sans
//    cela, un SVG portant un <script> déposé dans `content` (aucune contrainte
//    MIME sur les seaux, c'est délibéré) s'exécuterait SUR L'ORIGINE DE L'APP
//    et lirait le jeton de session dans localStorage. Chez Supabase il vivait
//    sur une autre origine : c'est ce lot qui le rapprochait de la session.
//    En plus, sur TOUTES les réponses : `Content-Security-Policy: sandbox;
//    default-src 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options:
//    DENY` — le bloc [[headers]] de netlify.toml ne s'applique PAS aux réponses
//    d'une Edge Function (limitation documentée Netlify).
// ④ `Accept` n'est JAMAIS relayé à la transformation d'image : Supabase choisit
//    le format selon lui, et la clé de cache ne varie que sur width|quality —
//    le premier demandeur aurait figé le format pour tous pendant la durée du
//    cache. On envoie un Accept FIXE (WebP, lu par tout navigateur depuis 2020).
// ⑤ Cache COURT, pas un an : 1 h pour les images (ce sont elles qu'on
//    remplace au même chemin — photo et fond de passion, couverture
//    d'événement modifié, `upsert: true`), 6 h pour vidéo et audio (chemins
//    uniques, jamais réécrits). Un média retiré par son auteur ou par la
//    modération disparaît donc en une heure ou en six, pas dans un an. Le
//    coût : chaque fichier est retiré de Supabase une fois par heure ou par
//    six heures et par nœud, s'il est encore demandé — négligeable.
// ⑥ Les requêtes `Range` sont SERVIES en 206 : iOS (Safari, Chrome iOS, PWA,
//    tous WebKit/AVFoundation) exige les requêtes par plage pour lire une
//    vidéo ou un audio, et refuse un 200 intégral. Mais un 206 ne se cache
//    pas comme un objet entier : la fonction tire donc la copie ENTIÈRE via
//    sa propre URL (donc depuis le cache du bord, sans nouvelle sortie
//    Supabase) et DÉCOUPE le flux à la volée. Le repli, si cette lecture
//    interne échoue, est l'origine avec `Range` relayé.
// ⑦ Une erreur d'origine sort en `no-store` : jamais un 404 en cache.
// ⑧ `Netlify-Vary: query=width|quality` : un `?utm=…` parasite ne fragmente
//    pas le cache.
// ⑨ `cache: "manual"` est OBLIGATOIRE : sans lui, Netlify ignore tout en-tête
//    de cache posé par une Edge Function.
//
// Côté app : le service worker (sw.js) N'INTERCEPTE PAS /media/* — sinon
// chaque vidéo vue irait dans le Cache Storage de l'appareil, sans borne.
//
// Vérifier en production (GET, pas HEAD) :
//   curl -s -o /dev/null -D - https://passio-app.netlify.app/media/content/…
//   → 1ʳᵉ fois `Cache-Status: "Netlify Edge"; fwd=miss`, ensuite `hit`
//   curl -s -o /dev/null -D - -r 0-1 …/media/content/videos/…/x.mp4
//   → `HTTP/1.1 206`, `Content-Range: bytes 0-1/<total>`
// Revenir en arrière : `PASSIO_CDN_BASE = ""` dans js/app-08 (les nouveaux
// médias reprennent l'URL Supabase directe) — cette fonction peut rester.
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE = "https://njkiyoklssvefstljemx.supabase.co";
const SEAUX = new Set(["content", "attachments"]);
const TTL_IMAGE = 3600;      // ⑤ remplacées au même chemin → 1 h
const TTL_MEDIA = 21600;     // ⑤ vidéo, audio : chemins uniques → 6 h
const EN_TETE_INTERNE = "x-passio-cdn-interne";

// ③ Ce qui peut être rendu EN LIGNE sur l'origine de l'app.
function typeSur(ct) {
  const t = (ct || "").split(";")[0].trim().toLowerCase();
  if (!t) return false;
  if (t === "image/svg+xml" || t.startsWith("image/svg")) return false;
  return t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/");
}

function enTetesSecurite(h) {
  h.set("Content-Security-Policy", "sandbox; default-src 'none'");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Cross-Origin-Resource-Policy", "cross-origin");
  h.set("Access-Control-Allow-Origin", "*");
}

function reponseErreur(status, texte) {
  const h = new Headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  enTetesSecurite(h);
  return new Response(texte, { status, headers: h });
}

// ⑥ Analyse d'un en-tête Range simple (une seule plage, la seule que les
// lecteurs média émettent). Rend null si absent ou illisible.
function analyserRange(valeur, total) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((valeur || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let debut, fin;
  if (m[1] === "") {            // bytes=-N : les N derniers octets
    const n = Number(m[2]);
    if (n === 0) return { insatisfiable: true };
    debut = Math.max(0, total - n); fin = total - 1;
  } else {
    debut = Number(m[1]);
    fin = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
  }
  if (debut >= total || debut > fin) return { insatisfiable: true };
  return { debut, fin };
}

// ⑥ Découpe un flux d'octets en [debut, fin] sans le charger en mémoire.
function decouper(corps, debut, fin) {
  let position = 0;
  return corps.pipeThrough(new TransformStream({
    transform(morceau, ctrl) {
      const a = position, b = position + morceau.length;   // [a, b)
      position = b;
      if (b <= debut) return;
      if (a > fin) { ctrl.terminate(); return; }
      const de = Math.max(debut, a) - a, jusqua = Math.min(fin + 1, b) - a;
      ctrl.enqueue(de === 0 && jusqua === morceau.length ? morceau : morceau.subarray(de, jusqua));
      if (b > fin) ctrl.terminate();
    },
  }));
}

export default async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {                       // ①
    const r = reponseErreur(405, "Method Not Allowed");
    r.headers.set("Allow", "GET, HEAD");
    return r;
  }

  const url = new URL(req.url);
  const rel = url.pathname.replace(/^\/media\//, "");
  const segments = rel.split("/");
  const seau = segments[0];
  if (!SEAUX.has(seau) || segments.length < 2 || segments.some((s) => s === "" || s === "." || s === "..")) {   // ②
    return reponseErreur(404, "Not Found");
  }

  const width = url.searchParams.get("width") || "";
  const quality = url.searchParams.get("quality") || "";
  const miniature = /^\d{2,4}$/.test(width);
  const cible = miniature
    ? `${SUPABASE}/storage/v1/render/image/public/${rel}?width=${width}&quality=${/^\d{1,3}$/.test(quality) ? quality : "75"}`
    : `${SUPABASE}/storage/v1/object/public/${rel}`;

  // ⑥ Requête par plage : on lit la copie ENTIÈRE via notre propre URL (cache
  // du bord), puis on découpe. Jamais depuis une requête déjà interne.
  const range = req.method === "GET" && !req.headers.get(EN_TETE_INTERNE) ? req.headers.get("range") : null;
  if (range) {
    const urlInterne = new URL(url.pathname + (miniature ? `?width=${width}&quality=${quality || "75"}` : ""), url.origin);
    let entier = null;
    try { entier = await fetch(urlInterne, { headers: { [EN_TETE_INTERNE]: "1" } }); } catch (e) { entier = null; }
    const total = entier && entier.ok ? Number(entier.headers.get("content-length") || 0) : 0;
    if (!entier || !entier.ok || !total || !entier.body) {
      // Repli : l'origine sait répondre en 206 elle-même, sans cache.
      if (entier && entier.body) { try { await entier.body.cancel(); } catch (e) {} }
      const direct = await fetch(cible, { headers: { Range: range, Accept: miniature ? "image/webp,image/*" : "*/*" } });
      const h = new Headers();
      for (const k of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
        const v = direct.headers.get(k); if (v) h.set(k, v);
      }
      if (!typeSur(h.get("content-type"))) { h.set("Content-Type", "application/octet-stream"); h.set("Content-Disposition", "attachment"); }
      h.set("Cache-Control", "no-store"); enTetesSecurite(h); h.set("X-Passio-Cdn", "plage-origine");
      return new Response(direct.body, { status: direct.status, headers: h });
    }
    const plage = analyserRange(range, total);
    const h = new Headers();
    for (const k of ["content-type", "etag", "last-modified", "content-disposition"]) {
      const v = entier.headers.get(k); if (v) h.set(k, v);
    }
    h.set("Cache-Control", "no-store"); enTetesSecurite(h); h.set("Accept-Ranges", "bytes"); h.set("X-Passio-Cdn", "plage");
    if (!plage) {                       // Range illisible : le fichier entier, comme sans Range
      h.set("Content-Length", String(total));
      return new Response(entier.body, { status: 200, headers: h });
    }
    if (plage.insatisfiable) {
      try { await entier.body.cancel(); } catch (e) {}
      h.set("Content-Range", `bytes */${total}`);
      return new Response(null, { status: 416, headers: h });
    }
    h.set("Content-Range", `bytes ${plage.debut}-${plage.fin}/${total}`);
    h.set("Content-Length", String(plage.fin - plage.debut + 1));
    return new Response(decouper(entier.body, plage.debut, plage.fin), { status: 206, headers: h });
  }

  const origine = await fetch(cible, {
    method: req.method === "HEAD" ? "HEAD" : "GET",
    headers: { Accept: miniature ? "image/webp,image/*" : "*/*" },           // ④
  });

  const h = new Headers();
  for (const k of ["content-type", "content-length", "etag", "last-modified"]) {
    const v = origine.headers.get(k);
    if (v) h.set(k, v);
  }
  enTetesSecurite(h);
  h.set("X-Passio-Cdn", miniature ? "miniature" : "objet");

  if (!origine.ok) {                                                          // ⑦
    h.set("Cache-Control", "no-store");
    return new Response(origine.body, { status: origine.status, headers: h });
  }

  const ct = h.get("content-type") || "";
  if (!typeSur(ct)) {                                                         // ③
    h.set("Content-Type", "application/octet-stream");
    h.set("Content-Disposition", "attachment");
  }
  const ttl = /^(video|audio)\//i.test(ct) ? TTL_MEDIA : TTL_IMAGE;           // ⑤
  h.set("Cache-Control", `public, max-age=${ttl}`);
  h.set("Netlify-CDN-Cache-Control", `public, s-maxage=${ttl}`);
  h.set("Netlify-Vary", "query=width|quality");                               // ⑧
  h.set("Accept-Ranges", "bytes");                                            // ⑥
  return new Response(origine.body, { status: 200, headers: h });
};

export const config = {
  path: "/media/*",
  cache: "manual",                                                            // ⑨
  onError: "bypass",
};
