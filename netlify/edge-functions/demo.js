// ═══════════════════════════════════════════════════════════════════════════
// PASSIO · IMAGES D'ILLUSTRATION SERVIES PAR PASSIO — Netlify Edge Function, sur /demo/*
//
// Pourquoi (audit de sécurité du 06/11, G-03). Les exemples du fil, les photos des
// passions et les couvertures venaient d'images.unsplash.com : dès la première
// visite, sans aucun choix, l'adresse IP du visiteur partait chez Unsplash. Un
// simple relais Netlify ne règle rien, il transmet l'adresse dans
// `X-Forwarded-For`. Cette fonction va chercher l'image elle-même, SANS rien
// relayer du visiteur, et le CDN de Netlify sert les vues suivantes.
//
// Forme unique : /demo/u/<identifiant Unsplash>/<format>      (client : `imageDemo`, app-01)
//
// RÈGLES :
// ① GET et HEAD seulement.
// ② Liste FERMÉE d'identifiants (IDS) et de formats (FORMATS). Hors liste : 404, sans
//    lecture d'origine. Sans elle, chaque identifiant inventé coûtait une lecture chez
//    Unsplash et un objet de cache : du trafic sans compte, aux frais de PASSIO.
//    Verrou : tests/unit/demo-edge.test.mjs (chaque identifiant du code est ici, et
//    réciproquement).
// ③ Aucune requête (`?…`) : 400. La clé de cache est le chemin, rien d'autre.
// ④ Rien du visiteur ne part : ni adresse, ni cookie, ni Referer, ni Accept.
//    L'en-tête Accept est FIXE.
// ⑤ Seule une image part en ligne (jpeg, webp, avif, png), jamais un SVG. L'origine
//    doit rester images.unsplash.com, même après une redirection.
// ⑥ Sur TOUTE réponse : CSP `sandbox`, `nosniff`, `DENY`. Le bloc [[headers]] de
//    netlify.toml ne s'applique pas aux réponses d'une Edge Function.
// ⑦ Une erreur part en `no-store` : jamais un 404 ni un 502 en cache.
// ⑧ `cache: "manual"` : sans lui, Netlify ignore les en-têtes de cache posés ici.
// ═══════════════════════════════════════════════════════════════════════════

export const IDS = new Set([
  "photo-1416879595882-3373a0480b5b", "photo-1450778869180-41d0601e046e", "photo-1452587925148-ce544e77e70d",
  "photo-1456513080510-7bf3a84b82f8", "photo-1462331940025-496dfbfc7564", "photo-1464822759023-fed622ff2c3b",
  "photo-1470071459604-3b5ec3a7fe05", "photo-1483985988355-763728e1935b", "photo-1485846234645-a62644f84728",
  "photo-1488085061387-422e29b40080", "photo-1489392191049-fc10c97e64b6", "photo-1495474472287-4d71bcdd2085",
  "photo-1501386761578-eac5c94b800a", "photo-1502602898657-3e91760cbb34", "photo-1502920917128-1aa500764cbd",
  "photo-1504711434969-e33886168f5c", "photo-1507525428034-b723cf961d3e", "photo-1508700115892-45ecd05ae2ad",
  "photo-1510915361894-db8b60106cb1", "photo-1511671782779-c97d3d27a1d4", "photo-1513364776144-60967b0f800f",
  "photo-1513519245088-0e12902e5a38", "photo-1513745405825-efaf9a49315f", "photo-1514320291840-2e0a9bf2a9ae",
  "photo-1517649763962-0c623066013b", "photo-1518770660439-4636190af475", "photo-1519608487953-e999c86e7455",
  "photo-1519681393784-d120267933ba", "photo-1521587760476-6c12a4b040da", "photo-1529156069898-49953e39b3ac",
  "photo-1529699211952-734e80c4d42b", "photo-1530841377377-3ff06c0ca713", "photo-1531746790731-6c087fecd65a",
  "photo-1534438327276-14e5300c3a48", "photo-1540959733332-eab4deabeeaf", "photo-1542751371-adc38448a05e",
  "photo-1543364195-077a52659557", "photo-1544367567-0f2fcb009e0b", "photo-1550745165-9bc0b252726f",
  "photo-1552168324-d612d77725e3", "photo-1556909114-f6e7ad7d3136", "photo-1558980664-10e7ec7b39cb",
  "photo-1565299624946-b28f40a0ae38", "photo-1569163139394-de4798d9c2c3", "photo-1589903308904-1010c2294adc",
  "photo-1598488035139-bdbb2231ce04",
]);

// Les quatre tailles que le client demandait déjà à Unsplash, à l'identique.
export const FORMATS = {
  couverture: "w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
  portrait: "w=720&h=1280&fit=crop&auto=format&q=80",
  avatar: "w=200&h=200&fit=crop&crop=faces,entropy&auto=format&q=80",
  mini: "w=160&h=160&fit=crop&crop=entropy&auto=format&q=75",
};

const TYPES = new Set(["image/jpeg", "image/webp", "image/avif", "image/png"]);
const TTL_NAVIGATEUR = 7 * 24 * 3600;   // une photo d'exemple ne change jamais à cette adresse
const TTL_CDN = 30 * 24 * 3600;

function enTetesSecurite(h) {                                                 // ⑥
  h.set("Content-Security-Policy", "sandbox; default-src 'none'");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
}
function erreur(status) {                                                     // ⑦
  const h = new Headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  enTetesSecurite(h);
  return new Response(String(status), { status, headers: h });
}

// Le chemin demandé → { id, format } ou un statut d'erreur. Exporté pour le banc.
export function analyser(url) {
  if (url.search) return { statut: 400 };                                     // ③
  const m = /^\/demo\/u\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (!m || !IDS.has(m[1]) || !Object.prototype.hasOwnProperty.call(FORMATS, m[2])) return { statut: 404 };   // ②
  return { id: m[1], format: m[2] };
}

export default async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {                       // ①
    const r = erreur(405);
    r.headers.set("Allow", "GET, HEAD");
    return r;
  }
  const cible = analyser(new URL(req.url));
  if (cible.statut) return erreur(cible.statut);

  let origine;
  try {
    // ④ Une requête neuve : aucun en-tête du visiteur, Accept fixe.
    origine = await fetch(`https://images.unsplash.com/${cible.id}?${FORMATS[cible.format]}`, {
      headers: { Accept: "image/webp,image/jpeg;q=0.8", "User-Agent": "passio-demo" },
      signal: AbortSignal.timeout(10000),
    });
  } catch (_e) {
    return erreur(502);
  }
  let hote = "";
  try { hote = new URL(origine.url || `https://images.unsplash.com/${cible.id}`).hostname; } catch (_e) { /* hôte illisible */ }
  const type = String(origine.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!origine.ok || hote !== "images.unsplash.com" || !TYPES.has(type)) return erreur(502);   // ⑤

  const h = new Headers({ "Content-Type": type });
  enTetesSecurite(h);
  h.set("Cache-Control", `public, max-age=${TTL_NAVIGATEUR}`);
  h.set("Netlify-CDN-Cache-Control", `public, s-maxage=${TTL_CDN}`);
  if (req.method === "HEAD") {
    // Une réponse à HEAD n'a pas de corps : en cache, elle viderait l'image pour tous.
    h.set("Cache-Control", "no-store");
    h.delete("Netlify-CDN-Cache-Control");
    return new Response(null, { status: 200, headers: h });
  }
  return new Response(origine.body, { status: 200, headers: h });
};

export const config = {
  path: "/demo/*",
  cache: "manual",                                                            // ⑧
  onError: "bypass",
};
