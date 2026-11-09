// ═══════════════════════════════════════════════════════════════════════════
// PASSIO · /media/* — RENVOI DES ANCIENNES URL VERS LE CDN SUPABASE (2026-11-09)
//
// Du 2026-09-11 au 2026-11-09, cette fonction était un RELAIS : elle allait
// chercher chaque média chez Supabase pour le garder au bord de Netlify. Elle
// était née de deux constats du 2026-09-11 — « 5 Go de sortie par mois » et
// « Supabase répond `no-cache` » — qui ne tiennent plus. Mesuré le 2026-11-09 :
//   · Supabase (forfait Pro) sert l'objet avec `Cache-Control: public,
//     max-age=31536000`, `CF-Cache-Status: HIT` et `x-smart-cdn: true` ; le
//     forfait inclut 250 Go de sortie et 250 Go servis depuis son cache ;
//   · le cache du bord Netlify ne servait RIEN : neuf requêtes identiques
//     d'affilée, neuf `fwd=miss`. Chaque vue invoquait donc la fonction, sortait
//     de Supabase ET consommait les 100 Go/mois de Netlify — ceux de l'app ;
//   · le navigateur ne gardait l'image qu'une heure.
// Les nouveaux médias portent l'URL Supabase directe (`PASSIO_CDN_BASE = ""`,
// js/app-08) et `passioThumb` lit les anciennes à la source (`urlMediaDirecte`,
// js/app-02). Il ne reste ici que les URL du relais déjà écrites en base ou
// gardées sur les appareils : un RENVOI (301) de quelques centaines d'octets,
// sans aucune lecture d'origine, que le navigateur garde un jour.
//
// Ce qui reste des règles du relais (revue adversariale du 2026-09-11) :
// ① GET/HEAD seulement, gardé ICI et non dans `config.method` : le manifeste
//    Netlify n'accepte pas « HEAD » et faisait échouer le déploiement entier.
// ② Seul le seau PUBLIC `content`, garde `..` PAR SEGMENT. `attachments` est
//    privé : une pièce jointe se lit par URL signée, jamais ici (404).
// ③ (levée) La liste blanche des types servis EN LIGNE n'a plus d'objet : plus
//    rien n'est servi depuis l'ORIGINE DE L'APP. Le média vit sur celle de
//    Supabase, où un SVG piégé ne lit pas la session de PASSIO.
// ⑧ LISTE FERMÉE des largeurs (audit 2026-11-06) : hors liste, 302 vers la forme
//    canonique, sans rien renvoyer d'autre ; une valeur non numérique, 400. Le
//    renvoi ne fabrique jamais une demande que le client ne fait pas. ⚠️ CE N'EST
//    PAS UNE PROTECTION DU QUOTA (relevé par `passio-red-team`) : l'URL
//    `render/image` de Supabase est publique, n'importe qui peut la demander
//    directement. La vraie protection est ailleurs : depuis le 2026-11-09,
//    PASSIO ne demande plus AUCUNE transformation (`passioThumb`, app-02) — la
//    transformation d'image peut être éteinte chez Supabase sans rien casser.
//    Seules d'anciennes URL `/media/…?width=` arrivent encore ici.
// ⑨ `cache: "manual"` : le renvoi lui-même peut se garder au bord
//    (`Netlify-CDN-Cache-Control`), clé bornée à width|quality (`Netlify-Vary`).
// Toute réponse porte le bac à sable (`enTetesSecurite`) : le bloc [[headers]]
// de netlify.toml ne s'applique pas aux réponses d'une Edge Function.
//
// Vérifier en production :
//   curl -s -o /dev/null -D - https://passio-app.netlify.app/media/content/…
//   → `HTTP/1.1 301`, `Location: https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/…`
// Fiche : docs/CDN_MEDIAS.md et docs/journal/capacite-perf-realtime.md (2026-11-09).
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE = "https://njkiyoklssvefstljemx.supabase.co";
const SEAUX = new Set(["content"]);
// Les largeurs de `passioThumb` / `avatarBg` (verrou : tests/unit/media-edge.test.mjs).
const LARGEURS = [192, 352, 360, 400, 600, 700, 720, 880];
const QUALITE = "75";
const TTL_RENVOI = 86400;          // le navigateur garde le renvoi un jour
const TTL_RENVOI_BORD = 2592000;   // le bord Netlify, trente jours

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

  // ⑧ Liste fermée : aucune valeur hors liste n'est renvoyée telle quelle.
  const largeurBrute = url.searchParams.get("width");
  const qualiteBrute = url.searchParams.get("quality");
  if (largeurBrute === null ? qualiteBrute !== null : !/^\d{1,4}$/.test(largeurBrute)) {
    return reponseErreur(400, "Paramètres non admis");
  }
  if (largeurBrute !== null) {
    const voulue = Number(largeurBrute);
    const canonique = LARGEURS.find((l) => l >= voulue) ?? LARGEURS[LARGEURS.length - 1];
    if (String(canonique) !== largeurBrute || qualiteBrute !== QUALITE) {
      const h = new Headers({ Location: `${url.pathname}?width=${canonique}&quality=${QUALITE}`, "Cache-Control": "no-store" });
      enTetesSecurite(h);
      return new Response(null, { status: 302, headers: h });
    }
  }
  const miniature = largeurBrute !== null;
  const cible = miniature
    ? `${SUPABASE}/storage/v1/render/image/public/${rel}?width=${largeurBrute}&quality=${QUALITE}`
    : `${SUPABASE}/storage/v1/object/public/${rel}`;

  const h = new Headers({ Location: cible, "Cache-Control": `public, max-age=${TTL_RENVOI}` });
  h.set("Netlify-CDN-Cache-Control", `public, s-maxage=${TTL_RENVOI_BORD}`);
  h.set("Netlify-Vary", "query=width|quality");                               // ⑧ ⑨
  enTetesSecurite(h);
  h.set("X-Passio-Cdn", miniature ? "renvoi-miniature" : "renvoi");
  return new Response(null, { status: 301, headers: h });
};

export const config = {
  path: "/media/*",
  cache: "manual",                                                            // ⑨
  onError: "bypass",
};
