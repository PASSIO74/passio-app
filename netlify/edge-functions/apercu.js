// ═══════════════════════════════════════════════════════════════════════════
// PASSIO · LIENS COURTS ET APERÇUS — Netlify Edge Function sur /p/*, /u/*, /e/*
//
// Un humain → 302 vers le lien profond de l'application (`/#post-<id>`,
// `/#user-<id>`, `/#irl-event-<id>`), que les routeurs d'app-06 et d'app-07
// savent déjà ouvrir. Un robot d'aperçu → une page sans script qui décrit le
// contenu. Les règles de sécurité et leurs raisons sont dans
// netlify/lib/apercu-coeur.js, qui est PUR et testé tel quel en Node
// (tests/unit/apercu-liens.test.mjs) — cette enveloppe ne fait que lire.
//
// ⚠️ LA CLÉ ANON EST PUBLIQUE PAR CONSTRUCTION (elle est dans js/app-08, servie
// à chaque visiteur). La lire ici ne donne à cette fonction AUCUN droit de plus
// qu'un visiteur sans compte : c'est précisément ce qu'on veut (règle ①).
// Ne JAMAIS la remplacer par `service_role` « pour voir plus » : l'aperçu
// publierait ce que la RLS refuse.
//
// ⚠️ TOUT ÉCHEC REND QUELQUE CHOSE D'UTILE : lecture lente ou refusée →
// aperçu générique (l'état d'avant ce lot) ; exception → 302 vers l'accueil.
// `onError: "bypass"` laisserait Netlify servir un 404 : le `try` englobant
// l'empêche d'arriver.
//
// Vérifier en production :
//   curl -s -o /dev/null -D - https://passio-app.netlify.app/p/<id>
//   → 302, Location: https://passio-app.netlify.app/#post-<id>
//   curl -s -A "WhatsApp/2.24" https://passio-app.netlify.app/p/<id> | grep og:
// ═══════════════════════════════════════════════════════════════════════════
import {
  analyserChemin, destination, estRobotApercu, pageApercu, CSP_APERCU,
  apercuPublication, apercuProfil, apercuActivite, TITRE_GENERIQUE, DESCRIPTION_GENERIQUE,
} from "../lib/apercu-coeur.js";

const SUPABASE = "https://njkiyoklssvefstljemx.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qa2l5b2tsc3N2ZWZzdGxqZW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTc3MDQsImV4cCI6MjA5NDI3MzcwNH0.wbFAexVW75vlXZ7mRRxeZ28zKevOAYYe0lda0F22dTM";
const DELAI_MS = 2500;

// Une ligne, ou null. Jamais d'exception : un échec vaut « rien à montrer ».
async function lireUne(table, colonnes, filtres) {
  const q = new URLSearchParams({ select: colonnes, limit: "1" });
  for (const [col, val] of filtres) q.append(col, "eq." + val);
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), DELAI_MS);
  try {
    const r = await fetch(`${SUPABASE}/rest/v1/${table}?${q}`, {
      headers: { apikey: ANON, Authorization: "Bearer " + ANON, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const lignes = await r.json();
    return Array.isArray(lignes) && lignes.length ? lignes[0] : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(minuterie);
  }
}

async function lireApercu(cible) {
  if (cible.type === "publication") {
    const post = await lireUne("posts", "id,author_id,content,media_url,passion_id,vlog", [["id", cible.id]]);
    if (!post || !post.author_id) return apercuPublication(null);
    const [auteur, passion] = await Promise.all([
      lireUne("profiles", "username,is_private", [["id", post.author_id]]),
      post.passion_id ? lireUne("passions", "label", [["id", post.passion_id], ["status", "active"]]) : null,
    ]);
    return apercuPublication(post, auteur, passion && passion.label);
  }
  if (cible.type === "profil") {
    return apercuProfil(await lireUne("profiles", "username,bio,avatar_url,is_private", [["id", cible.id]]));
  }
  return apercuActivite(await lireUne("events", "title,date_at,city,emoji,cover_url,status", [["id", cible.id]]));
}

function redirection(origine, chemin) {
  return new Response(null, {
    status: 302,
    headers: { Location: origine + chemin, "Cache-Control": "no-store", Vary: "User-Agent" },
  });
}

export default async (req) => {
  let origine = "https://passio-app.netlify.app";
  try {
    const url = new URL(req.url);
    origine = url.origin;
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
    }
    const cible = analyserChemin(url.pathname);
    if (!cible) return redirection(origine, "/");
    const versApp = destination(cible, url.search);
    if (!estRobotApercu(req.headers.get("user-agent"))) return redirection(origine, versApp);

    let ap = null;
    try { ap = await lireApercu(cible); } catch (e) { ap = null; }
    if (!ap) ap = { titre: TITRE_GENERIQUE, description: DESCRIPTION_GENERIQUE, image: null };
    const html = pageApercu({
      ...ap,
      url: origine + cible.chemin,
      versApp: origine + versApp,
    });
    return new Response(req.method === "HEAD" ? null : html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": CSP_APERCU,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, max-age=300",
        Vary: "User-Agent",
      },
    });
  } catch (e) {
    return redirection(origine, "/");
  }
};

export const config = {
  path: ["/p/*", "/u/*", "/e/*"],
  onError: "bypass",
};
