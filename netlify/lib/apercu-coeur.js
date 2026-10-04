// ═══════════════════════════════════════════════════════════════════════════
// PASSIO · APERÇUS DES LIENS PARTAGÉS — cœur PUR (aucun réseau, aucun Deno)
//
// Chargé par netlify/edge-functions/apercu.js (production) ET par
// tests/unit/apercu-liens.test.mjs (Node) : le fichier testé est celui que
// Netlify déploie, pas une copie.
//
// Pourquoi. Un lien partagé est le SEUL chemin d'entrée de quelqu'un qui ne
// connaît pas encore PASSIO. Jusqu'au 2026-10-04, tous les liens étaient des
// HASH (`/#post-<id>`) : un robot d'aperçu (WhatsApp, iMessage, Messenger…) ne
// lit jamais le fragment, donc chaque partage s'affichait avec l'aperçu
// GÉNÉRIQUE d'index.html — la même carte pour une randonnée, un profil ou une
// rencontre. Les liens courts `/p/<id>`, `/u/<id>`, `/e/<id>` sont des CHEMINS :
// le robot reçoit une page d'aperçu qui décrit CE contenu, un humain est
// renvoyé (302) vers le lien profond que l'application sait déjà ouvrir.
//
// ⚠️ LES SEPT RÈGLES DE CE FICHIER — c'est du contenu d'autrui écrit dans du
// HTML servi sur l'ORIGINE DE L'APPLICATION, donc un lot de sécurité :
//
// ① Rien que la clé ANON ne puisse lire. Les lectures passent par PostgREST
//    sous le rôle `anon` (RLS et GRANT de colonnes appliqués) : un aperçu ne
//    montre jamais plus qu'un visiteur sans compte. `posts` exclut déjà les
//    comptes privés ; on le RE-VÉRIFIE sur le profil de l'auteur (défense en
//    profondeur — une policy élargie demain ne doit pas suffire à fuir).
// ② Un CARNET (`vlog` non nul) n'a JAMAIS d'aperçu de contenu : sa visibilité
//    (public / abonnés / privé) vit dans le blob jsonb, hors de portée de la
//    RLS — c'est le client qui l'écarte du fil. Un aperçu qui l'ignorerait
//    publierait un carnet « Privé » en clair dans une conversation WhatsApp.
// ③ Un compte PRIVÉ n'expose ni biographie ni photo : son pseudo seulement.
// ④ Tout texte est BORNÉ (points de code, jamais d'unités UTF-16 coupées),
//    débarrassé des caractères de contrôle et des marques bidirectionnelles
//    (usurpation visuelle), puis ÉCHAPPÉ pour un attribut entre guillemets.
// ⑤ Une image n'est publiée que si elle vient du seau PUBLIC `content`, sous
//    l'une de nos deux formes d'URL, en format image. `attachments` (privé),
//    `data:`, `javascript:`, un autre hôte, un `..` : rien.
// ⑥ La page ne porte AUCUN script et sa CSP est `default-src 'none'` +
//    `sandbox` : même un échappement manqué n'exécuterait rien. Le bloc
//    [[headers]] de netlify.toml ne s'applique PAS à une Edge Function — la
//    fonction pose ses propres en-têtes.
// ⑦ Seuls les robots d'APERÇU reçoivent la page ; tout le reste reçoit un 302.
//    Un robot non reconnu retombe sur l'aperçu générique (l'état d'avant) ; un
//    humain pris pour un robot voit une page avec un lien « Ouvrir sur PASSIO ».
//    Aucun des deux n'est bloqué. Les moteurs de RECHERCHE ne sont pas dans la
//    liste (Applebot compris), et la page dit `noindex` : partager n'est pas
//    publier sur Google.
// ═══════════════════════════════════════════════════════════════════════════

export const ORIGINE_CANONIQUE = "https://passio-app.netlify.app";
export const SUPABASE_PROJET = "njkiyoklssvefstljemx";

export const TITRE_GENERIQUE = "PASSIO — Le réseau social de tes passions";
export const DESCRIPTION_GENERIQUE =
  "Partage tes passions et rejoins une communauté qui les vit comme toi. PASSIO, le réseau social des passionnés.";
export const IMAGE_GENERIQUE = ORIGINE_CANONIQUE + "/icon-512.png";

// Mêmes formes que le routeur de l'application (app-06, LIEN_PARTAGE_COMPTE_RE) :
// un lien de profil ne désigne qu'un IDENTIFIANT de compte, jamais un pseudo.
const ID_CONTENU_RE = /^[A-Za-z0-9_-]{1,100}$/;
const ID_COMPTE_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|u_[A-Za-z0-9_-]{1,64})$/i;
const PLK_RE = /^[A-Za-z0-9_-]{1,64}$/;

const TYPES = {
  p: { type: "publication", court: "/p/", hash: "#post-", idRe: ID_CONTENU_RE },
  u: { type: "profil", court: "/u/", hash: "#user-", idRe: ID_COMPTE_RE },
  e: { type: "activite", court: "/e/", hash: "#irl-event-", idRe: ID_CONTENU_RE },
};

/**
 * `/p/<id>` → { type, id, hash, chemin } ; toute autre forme → null.
 * `chemin` est la forme CANONIQUE (identifiant décodé puis revalidé) : c'est
 * elle, jamais le chemin reçu, qui devient l'`og:url`.
 */
export function analyserChemin(pathname) {
  const m = /^\/([pue])\/([^/]+)\/?$/.exec(String(pathname || ""));
  if (!m) return null;
  const t = TYPES[m[1]];
  let id;
  try { id = decodeURIComponent(m[2]); } catch (e) { return null; }
  if (!t.idRe.test(id)) return null;
  return { type: t.type, id, hash: t.hash, chemin: t.court + id };
}

/** Le lien profond de l'application, avec le seul `plk` (suivi de partage) s'il est valide. */
export function destination(cible, search) {
  let plk = null;
  try { plk = new URLSearchParams(String(search || "")).get("plk"); } catch (e) { plk = null; }
  const q = plk && PLK_RE.test(plk) ? "?plk=" + plk : "";
  return "/" + q + cible.hash + cible.id;
}

// ⑦ Robots d'aperçu de lien (pas de moteur de recherche). iMessage s'annonce
// « facebookexternalhit … Facebot Twitterbot » ; Signal emprunte « WhatsApp ».
// ⚠️ UN JETON N'ENTRE ICI QUE S'IL EST PROPRE AU ROBOT, jamais au NAVIGATEUR
// INTÉGRÉ de la même application : Snapchat et Pinterest ouvrent les liens dans
// une vue web qui s'annonce « Snapchat/12.x » ou « [Pinterest/iOS] » — un jeton
// `snapchat` ou `pinterest/` y servait la page d'aperçu nue à un HUMAIN, un tap
// de plus sur le canal même que ce lot vise (contre-revue du 2026-10-04). Leurs
// robots ont leur propre jeton (« Snap URL Preview », « Pinterestbot »,
// « Pinterest/0. »). Faute de jeton propre connu, Viber, Tumblr, Zalo,
// Mattermost et Rocket.Chat sont DEHORS : un robot non reconnu retombe sur
// l'aperçu générique, l'état d'avant, ce qui vaut mieux que gêner un humain.
// ⚠️ Jamais un simple /bot/i : « CUBOT » est une marque de téléphone Android.
// ⚠️ Pas d'Applebot : c'est un robot d'INDEXATION (Siri, Spotlight).
const ROBOT_APERCU_RE = new RegExp([
  "facebookexternalhit", "facebot", "facebookcatalog", "whatsapp", "twitterbot",
  "telegrambot", "slackbot", "slack-imgproxy", "discordbot", "linkedinbot",
  "skypeuripreview", "redditbot", "pinterestbot", "pinterest/0\\.", "snap url preview",
  "embedly", "iframely", "vkshare", "mastodon", "cardyb", "google-pagerenderer",
  "microsoftpreview", "bitlybot", "line-poker", "kakaotalk-scrap",
].join("|"), "i");

export function estRobotApercu(ua) {
  return ROBOT_APERCU_RE.test(String(ua || ""));
}

// ④ Tout caractère de CONTRÔLE ou de FORMAT (C0/C1, marques et isolats
// bidirectionnels dont U+061C, espaces de largeur nulle, caractères étiquettes),
// séparateurs de ligne et de paragraphe. Seul le liant U+200D survit : il
// soude les émojis composés (famille, métiers). Contre-revue du 2026-10-04 : la
// première liste, écrite à la main, laissait passer U+061C et U+200B, de quoi
// fabriquer un pseudo visuellement identique à « PASSIO » sous le domaine officiel.
const INVISIBLES_RE = /(?!\u{200D})[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** Texte d'aperçu : une seule ligne, au plus `max` points de code. */
export function texteBorne(s, max) {
  // On ne nettoie jamais plus que nécessaire : une publication de plusieurs
  // mégaoctets ne coûte pas plus cher qu'une de deux lignes.
  // La coupe peut tomber au milieu d'une paire de substitution : la moitié haute
  // orpheline est retirée.
  const brut = String(s == null ? "" : s).slice(0, max * 8).replace(/[\u{D800}-\u{DBFF}]$/u, "");
  const propre = brut.replace(INVISIBLES_RE, " ").replace(/\s+/g, " ").trim();
  const cp = Array.from(propre);
  if (cp.length <= max) return propre;
  return cp.slice(0, Math.max(1, max - 1)).join("").trimEnd() + "…";
}

/** Échappement pour un contenu d'attribut entre guillemets doubles (et le texte de <title>). */
export function echapper(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ⑤ Seau PUBLIC `content`, deux formes d'URL (CDN, Supabase directe), images.
const CHEMIN_SUR_RE = /^[A-Za-z0-9._%-]+(?:\/[A-Za-z0-9._%-]+)*$/;
const EXT_IMAGE_RE = /\.(?:jpe?g|png|webp|gif)$/i;

export function imageSure(url) {
  if (typeof url !== "string" || url.length > 600) return null;
  // Avant toute analyse : `new URL` NORMALISE `a/%2e%2e/b` en `b`, et l'objet
  // désigné ne serait plus celui que la ligne référence. On refuse la forme brute.
  // `new URL` RETIRE aussi tabulations et sauts de ligne (`a/.\t./b` devient
  // `a/../b`, puis `b`) : aucun blanc ni contrôle n'est admis dans la forme brute.
  if (/[\x00-\x20\x7f]|%2e|%2f|%5c|\\|\/\.\.?(?:\/|$)/i.test(url)) return null;
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  let chemin = null;
  if (u.hostname === "passio-app.netlify.app" && u.pathname.startsWith("/media/content/")) {
    chemin = u.pathname.slice("/media/content/".length);
  } else if (u.hostname === SUPABASE_PROJET + ".supabase.co"
      && u.pathname.startsWith("/storage/v1/object/public/content/")) {
    chemin = u.pathname.slice("/storage/v1/object/public/content/".length);
  }
  if (!chemin || !CHEMIN_SUR_RE.test(chemin)) return null;
  if (chemin.split("/").some((s) => s === "." || s === ".." || /%2e|%2f|%5c/i.test(s))) return null;
  if (!EXT_IMAGE_RE.test(chemin)) return null;
  return ORIGINE_CANONIQUE + "/media/content/" + chemin;
}

// Une date `timestamp without time zone` est écrite en UTC par le client (supaTs).
function dateUtc(s) {
  if (s == null || s === "") return null;
  let str = String(s).replace(" ", "T");
  if (!/(Z|[+-]\d{2}(:?\d{2})?)$/.test(str)) str += "Z";
  const t = Date.parse(str);
  return Number.isNaN(t) ? null : new Date(t);
}

export function dateActivite(s) {
  const d = dateUtc(s);
  if (!d) return "";
  try {
    const txt = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long",
      hour: "2-digit", minute: "2-digit",
    }).format(d);
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  } catch (e) { return ""; }
}

const GENERIQUE = { titre: TITRE_GENERIQUE, description: DESCRIPTION_GENERIQUE, image: null };

/**
 * Publication. `post` : ligne `posts` lue sous anon (ou null) ; `auteur` :
 * ligne `profiles` de l'auteur (ou null) ; `passion` : libellé (ou null).
 */
export function apercuPublication(post, auteur, passion) {
  if (!post || typeof post !== "object") return GENERIQUE;
  if (post.vlog != null) return GENERIQUE;                                   // ②
  if (!auteur || auteur.is_private === true) return GENERIQUE;              // ①
  const pseudo = texteBorne(auteur.username, 40) || "Un passionné";
  const lib = texteBorne(passion, 40);
  const titre = lib ? `${pseudo} · ${lib}` : `${pseudo} sur PASSIO`;
  const texte = texteBorne(post.content, 200);
  const description = texte || (lib
    ? `Une publication ${lib} à découvrir sur PASSIO, le réseau social des passionnés.`
    : "Une publication à découvrir sur PASSIO, le réseau social des passionnés.");
  return { titre, description, image: imageSure(post.media_url) };
}

export function apercuProfil(profil) {
  if (!profil || typeof profil !== "object") return GENERIQUE;
  const pseudo = texteBorne(profil.username, 40);
  if (!pseudo) return GENERIQUE;
  if (profil.is_private === true) {                                          // ③
    return { titre: `${pseudo} sur PASSIO`, description: "Ce compte est privé. Rejoins PASSIO pour lui demander à le suivre.", image: null };
  }
  const bio = texteBorne(profil.bio, 200);
  return {
    titre: `${pseudo} sur PASSIO`,
    description: bio || `Découvre les passions de ${pseudo} sur PASSIO, le réseau social des passionnés.`,
    image: imageSure(profil.avatar_url),
  };
}

export function apercuActivite(ev) {
  if (!ev || typeof ev !== "object") return GENERIQUE;
  if (ev.status != null && ev.status !== "active") return GENERIQUE;
  const titre = texteBorne(ev.title, 80);
  if (!titre) return GENERIQUE;
  const emoji = texteBorne(ev.emoji, 4);
  const quand = dateActivite(ev.date_at);
  const ville = texteBorne(ev.city, 40);
  const lieu = [quand, ville].filter(Boolean).join(" · ");
  return {
    titre: emoji ? `${emoji} ${titre}` : titre,
    description: (lieu ? lieu + " — " : "") + "Rejoins cette activité sur PASSIO.",
    image: imageSure(ev.cover_url),
  };
}

export const CSP_APERCU =
  "default-src 'none'; img-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox";

/** La page servie aux robots d'aperçu. Aucun script, aucun style. */
export function pageApercu({ titre, description, image, url, versApp }) {
  const t = echapper(titre || TITRE_GENERIQUE);
  const d = echapper(description || DESCRIPTION_GENERIQUE);
  const img = echapper(image || IMAGE_GENERIQUE);
  const carte = image ? "summary_large_image" : "summary";
  const u = echapper(url);
  const app = echapper(versApp);
  return "<!doctype html>\n<html lang=\"fr\"><head><meta charset=\"utf-8\">\n" +
    `<title>${t}</title>\n` +
    "<meta name=\"robots\" content=\"noindex\">\n" +
    `<meta name="description" content="${d}">\n` +
    "<meta property=\"og:type\" content=\"website\">\n" +
    "<meta property=\"og:site_name\" content=\"PASSIO\">\n" +
    "<meta property=\"og:locale\" content=\"fr_FR\">\n" +
    `<meta property="og:title" content="${t}">\n` +
    `<meta property="og:description" content="${d}">\n` +
    `<meta property="og:url" content="${u}">\n` +
    `<meta property="og:image" content="${img}">\n` +
    `<meta name="twitter:card" content="${carte}">\n` +
    `<meta name="twitter:title" content="${t}">\n` +
    `<meta name="twitter:description" content="${d}">\n` +
    `<meta name="twitter:image" content="${img}">\n` +
    "</head><body>\n" +
    `<p>${t}</p>\n<p>${d}</p>\n<p><a href="${app}">Ouvrir sur PASSIO</a></p>\n` +
    "</body></html>\n";
}
