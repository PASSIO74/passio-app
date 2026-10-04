// Verrous des liens courts et de leurs aperçus (netlify/edge-functions/apercu.js
// et netlify/lib/apercu-coeur.js). Le fichier testé est CELUI que Netlify
// déploie, pas une copie. Aucun réseau : `fetch` est remplacé par un faux qui
// rejoue la base et NOTE chaque lecture, pour qu'on voie ce que la fonction demande.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyserChemin, destination, estRobotApercu, texteBorne, echapper, imageSure,
  apercuPublication, apercuProfil, apercuActivite, pageApercu, dateActivite,
  TITRE_GENERIQUE,
} from "../../netlify/lib/apercu-coeur.js";
import apercu from "../../netlify/edge-functions/apercu.js";

const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const UA_CUBOT = "Mozilla/5.0 (Linux; Android 9; CUBOT X20 PRO Build/PPR1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const UA_INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0";
const UA_WHATSAPP = "WhatsApp/2.24.20.79 A";
const UA_IMESSAGE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0";
const UA_FACEBOOK = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const UA_TELEGRAM = "TelegramBot (like TwitterBot)";
const UA_DISCORD = "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";
const UA_SLACK = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";
const UA_SNAP_ROBOT = "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:61.0) Gecko/20100101 Firefox/61.0 Snap URL Preview Service; bot; snapchat; https://developers.snap.com/robots";
const UA_PINTEREST_ROBOT = "Pinterest/0.2 (+http://www.pinterest.com/)";
const UA_BLUESKY_ROBOT = "Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)";
// Navigateurs INTÉGRÉS d'applications : ce sont des HUMAINS.
const UA_SNAPCHAT_APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.80.0.33 (like Safari/8618.1.15.10.15, panda)";
const UA_PINTEREST_APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]";
const UA_FACEBOOK_APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F79 [FBAN/FBIOS;FBAV/470.0.0.37.106;FBBV/600000000]";
const UA_LINKEDIN_APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.29.6";
const UA_TELEGRAM_APP = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Telegram-Android/11.1.3";
const UA_TIKTOK_APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_35.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store";
const UA_APPLEBOT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)";

const UUID = "14c697ac-7958-41ea-8e23-8c00b4784a47";
const CDN = "https://passio-app.netlify.app/media/content/";
const SUPA_PUB = "https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/";

// ── Faux PostgREST ────────────────────────────────────────────────────────
function fauxReseau(tables, { panne = false } = {}) {
  const lectures = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const filtres = {};
    for (const [k, v] of u.searchParams) if (k !== "select" && k !== "limit") filtres[k] = v;
    lectures.push({ table, filtres, cle: init && init.headers && init.headers.apikey });
    if (panne) throw new Error("réseau coupé");
    const lignes = (tables[table] || []).filter((l) =>
      Object.entries(filtres).every(([k, v]) => v === "eq." + String(l[k])));
    return new Response(JSON.stringify(lignes.slice(0, 1)), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { lectures, restaurer: () => { globalThis.fetch = original; } };
}

const BASE = {
  posts: [
    { id: "pa1", author_id: UUID, content: "Sortie vélo au lever du soleil 🚴", media_url: CDN + "photos/u/pa1.jpg.v720.webp", passion_id: "cyclisme", vlog: null },
    { id: "carnet1", author_id: UUID, content: "Mon carnet privé", media_url: null, passion_id: "voyage", vlog: { visibility: "private" } },
    { id: "xss1", author_id: UUID, content: "\"><script>alert(1)</script><img src=x onerror=alert(2)>", media_url: "javascript:alert(3)", passion_id: null, vlog: null },
    { id: "prive1", author_id: "a0000000-0000-4000-8000-000000000001", content: "Secret", media_url: null, passion_id: null, vlog: null },
  ],
  profiles: [
    { id: UUID, username: "Léa", bio: "Cycliste du dimanche", avatar_url: CDN + "avatars/lea.jpg", is_private: false },
    { id: "a0000000-0000-4000-8000-000000000001", username: "Discret", bio: "Bio secrète", avatar_url: CDN + "avatars/d.jpg", is_private: true },
  ],
  passions: [{ id: "cyclisme", label: "Vélo et cyclisme", status: "active" }],
  events: [{ id: "ev1", title: "Randonnée au Salève", date_at: "2026-10-10 16:30:00", city: "Annecy", emoji: "🥾", cover_url: null, status: "active" }],
};

async function appeler(chemin, ua, base = BASE, opts) {
  const reseau = fauxReseau(base, opts);
  try {
    const r = await apercu(new Request("https://passio-app.netlify.app" + chemin, { headers: { "user-agent": ua } }));
    return { r, corps: r.status === 200 ? await r.text() : "", lectures: reseau.lectures };
  } finally { reseau.restaurer(); }
}

// ── ① Formes de lien ──────────────────────────────────────────────────────
test("① seuls /p/<id>, /u/<identifiant de compte>, /e/<id> sont des liens courts", () => {
  assert.deepEqual(analyserChemin("/p/xwaja06ajmu6viq5m"), { type: "publication", id: "xwaja06ajmu6viq5m", hash: "#post-", chemin: "/p/xwaja06ajmu6viq5m" });
  assert.equal(analyserChemin("/e/ev_1/").type, "activite");
  assert.equal(analyserChemin("/u/" + UUID).type, "profil");
  assert.equal(analyserChemin("/u/u_lea").id, "u_lea");
  // Un PSEUDO n'est pas un identifiant de compte (même règle que le routeur d'app-06).
  assert.equal(analyserChemin("/u/L%C3%A9a"), null);
  assert.equal(analyserChemin("/u/lea"), null);
  for (const mauvais of ["/p/", "/p/a/b", "/p/..", "/p/%2e%2e", "/p/a%2Fb", "/p/a%20b", "/p/%E0%A4%A", "/x/abc", "/p/" + "a".repeat(101), "/p/a\"b"]) {
    assert.equal(analyserChemin(mauvais), null, mauvais);
  }
});

test("② la destination garde le seul `plk` valide et vise le routeur de l'application", () => {
  const p = analyserChemin("/p/pa1"), u = analyserChemin("/u/" + UUID), e = analyserChemin("/e/ev1");
  assert.equal(destination(p, ""), "/#post-pa1");
  assert.equal(destination(u, "?plk=lnk_ab-12"), "/?plk=lnk_ab-12#user-" + UUID);
  assert.equal(destination(e, "?plk=ok&utm=x"), "/?plk=ok#irl-event-ev1");
  // Un `plk` qui sortirait de sa forme est JETÉ, jamais recopié dans Location.
  assert.equal(destination(p, "?plk=%22%3E%3Cscript%3E"), "/#post-pa1");
  assert.equal(destination(p, "?plk=a%0D%0ASet-Cookie:x"), "/#post-pa1");
});

test("② bis l'invitant (`inv`) passe s'il est un uuid de compte, et rien d'autre", () => {
  const p = analyserChemin("/p/pa1"), e = analyserChemin("/e/ev1");
  assert.equal(destination(e, "?inv=" + UUID), "/?inv=" + UUID + "#irl-event-ev1");
  assert.equal(destination(p, "?inv=" + UUID.toUpperCase() + "&plk=ok"), "/?plk=ok&inv=" + UUID + "#post-pa1");
  // Un compte de démonstration, un pseudo, une injection d'en-tête : jetés.
  for (const mauvais of ["u_lea", "lea", UUID + "x", UUID + "%0D%0ASet-Cookie:x", "%22%3E"]) {
    assert.equal(destination(p, "?plk=ok&inv=" + mauvais), "/?plk=ok#post-pa1", mauvais);
  }
});

// ── ③ Qui reçoit la page ──────────────────────────────────────────────────
test("③ les robots d'aperçu sont reconnus, les humains jamais — CUBOT compris", () => {
  for (const ua of [UA_WHATSAPP, UA_IMESSAGE, UA_FACEBOOK, UA_TELEGRAM, UA_DISCORD, UA_SLACK,
    UA_SNAP_ROBOT, UA_PINTEREST_ROBOT, UA_BLUESKY_ROBOT]) assert.equal(estRobotApercu(ua), true, ua);
  // Un navigateur INTÉGRÉ d'application est un humain : il doit recevoir le 302, pas
  // la page d'aperçu nue (contre-revue du 2026-10-04). Un moteur d'indexation non plus.
  for (const ua of [UA_IPHONE, UA_ANDROID, UA_CUBOT, UA_INSTAGRAM, UA_SNAPCHAT_APP, UA_PINTEREST_APP,
    UA_FACEBOOK_APP, UA_LINKEDIN_APP, UA_TELEGRAM_APP, UA_TIKTOK_APP, UA_APPLEBOT, "", null]) {
    assert.equal(estRobotApercu(ua), false, String(ua));
  }
});

// ── ④ Textes ──────────────────────────────────────────────────────────────
test("④ un texte est borné en points de code, sans contrôle ni marque bidirectionnelle, puis échappé", () => {
  assert.equal(texteBorne("a\u{202E}b\x00c\nd\u{2066}e", 50), "a b c d e");
  // Ceux que la première liste laissait passer : U+061C, largeur nulle, étiquettes.
  assert.equal(texteBorne("PA\u{200B}SS\u{061C}IO\u{2060}\u{E0041}!", 50), "PA SS IO !");
  // Le liant U+200D survit : il soude les émojis composés.
  assert.equal(texteBorne("👩\u{200D}🍳 cheffe", 50), "👩\u{200D}🍳 cheffe");
  // Une coupe au milieu d'une paire ne laisse pas de moitié orpheline.
  // (5 × 8 = 40 unités lues : la 40ᵉ est la moitié haute de 🚴.)
  assert.equal(texteBorne("x" + " ".repeat(38) + "🚴", 5), "x");
  const long = "🚴".repeat(300);
  const borne = texteBorne(long, 200);
  assert.equal(Array.from(borne).length, 200);
  assert.ok(borne.endsWith("…"));
  assert.ok(!/[\uD800-\uDBFF]$/.test(borne.slice(0, -1)), "aucune paire de substitution coupée");
  assert.equal(echapper(`"'<>&`), "&quot;&#39;&lt;&gt;&amp;");
});

test("⑤ une image n'est publiée que depuis le seau PUBLIC `content`, en format image", () => {
  assert.equal(imageSure(CDN + "photos/u/a.jpg.v720.webp"), CDN + "photos/u/a.jpg.v720.webp");
  // La forme Supabase directe repasse par le CDN (cache du bord).
  assert.equal(imageSure(SUPA_PUB + "content/avatars/a.png"), CDN + "avatars/a.png");
  for (const non of [
    SUPA_PUB + "attachments/conv/a.jpg", CDN.replace("content", "attachments") + "a.jpg",
    "javascript:alert(1)", "data:image/png;base64,AAAA", "http://passio-app.netlify.app/media/content/a.jpg",
    "https://evil.example/media/content/a.jpg", CDN + "../attachments/a.jpg", CDN + "a/%2e%2e/b.jpg",
    CDN + "videos/u/v.mp4", CDN + "photos/u/a.svg", CDN + "a.jpg\"onerror=x", null, 42,
    // `new URL` retire tabulations et sauts de ligne avant de résoudre `..`.
    CDN + "a/.\t./b.png", CDN + "a/.\n./b.png", CDN + "a b.png",
  ]) assert.equal(imageSure(non), null, String(non));
});

// ── ⑥ Ce qu'un aperçu révèle ──────────────────────────────────────────────
test("⑥ un carnet, un auteur privé ou une ligne absente n'ont que l'aperçu générique", () => {
  const auteur = { username: "Léa", is_private: false };
  assert.equal(apercuPublication({ content: "x", vlog: { visibility: "private" } }, auteur).titre, TITRE_GENERIQUE);
  assert.equal(apercuPublication({ content: "x", vlog: null }, { username: "D", is_private: true }).titre, TITRE_GENERIQUE);
  assert.equal(apercuPublication({ content: "x", vlog: null }, null).titre, TITRE_GENERIQUE);
  assert.equal(apercuPublication(null).titre, TITRE_GENERIQUE);
  const ok = apercuPublication({ content: "Bonjour", vlog: null, media_url: CDN + "p/a.jpg" }, auteur, "Vélo");
  assert.deepEqual(ok, { titre: "Léa · Vélo", description: "Bonjour", image: CDN + "p/a.jpg" });
});

test("⑦ un compte privé ne livre ni biographie ni photo", () => {
  const p = apercuProfil({ username: "Discret", bio: "Bio secrète", avatar_url: CDN + "a.jpg", is_private: true });
  assert.equal(p.image, null);
  assert.ok(!p.description.includes("secrète"));
  const pub = apercuProfil({ username: "Léa", bio: "Cycliste", avatar_url: CDN + "a.jpg", is_private: false });
  assert.deepEqual(pub, { titre: "Léa sur PASSIO", description: "Cycliste", image: CDN + "a.jpg" });
});

test("⑧ une activité dit sa date à l'heure de Paris, et une activité non active se tait", () => {
  // `timestamp without time zone` écrit en UTC : 16:30 UTC le 10/10 = 18:30 à Paris.
  assert.equal(dateActivite("2026-10-10 16:30:00"), "Samedi 10 octobre à 18:30");
  const a = apercuActivite(BASE.events[0]);
  assert.equal(a.titre, "🥾 Randonnée au Salève");
  assert.equal(a.description, "Samedi 10 octobre à 18:30 · Annecy — Rejoins cette activité sur PASSIO.");
  assert.equal(apercuActivite({ ...BASE.events[0], status: "cancelled" }).titre, TITRE_GENERIQUE);
});

// ── ⑨ L'enveloppe : ce qui part réellement ────────────────────────────────
test("⑨ un humain est renvoyé (302) vers le lien profond, sans aucune lecture en base", async () => {
  const { r, lectures } = await appeler("/p/pa1?plk=lnk1", UA_IPHONE);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://passio-app.netlify.app/?plk=lnk1#post-pa1");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(lectures.length, 0);
  const prof = await appeler("/u/" + UUID, UA_CUBOT);
  assert.equal(prof.r.headers.get("location"), "https://passio-app.netlify.app/#user-" + UUID);
  const ev = await appeler("/e/ev1", UA_ANDROID);
  assert.equal(ev.r.headers.get("location"), "https://passio-app.netlify.app/#irl-event-ev1");
  // Une forme inconnue ramène à l'accueil, jamais vers une cible fabriquée.
  const mauvais = await appeler("/u/L%C3%A9a", UA_IPHONE);
  assert.equal(mauvais.r.headers.get("location"), "https://passio-app.netlify.app/");
});

test("⑩ un robot reçoit l'aperçu du contenu, lu sous la clé ANON, avec une CSP fermée", async () => {
  const { r, corps, lectures } = await appeler("/p/pa1", UA_WHATSAPP);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /default-src 'none'.*sandbox/);
  assert.equal(r.headers.get("x-robots-tag"), "noindex");
  assert.ok(corps.includes('<meta property="og:title" content="Léa · Vélo et cyclisme">'));
  assert.ok(corps.includes('<meta property="og:description" content="Sortie vélo au lever du soleil 🚴">'));
  assert.ok(corps.includes('<meta property="og:image" content="' + CDN + 'photos/u/pa1.jpg.v720.webp">'));
  assert.ok(corps.includes('<meta property="og:url" content="https://passio-app.netlify.app/p/pa1">'));
  assert.ok(corps.includes('<a href="https://passio-app.netlify.app/#post-pa1">'));
  assert.ok(!/<script/i.test(corps));
  // La clé utilisée est celle du rôle anon, jamais service_role (règle ①).
  for (const l of lectures) {
    const charge = JSON.parse(Buffer.from(String(l.cle).split(".")[1], "base64url").toString());
    assert.equal(charge.role, "anon");
  }
  // Le libellé de passion n'est lu que s'il est ACTIF (une passion retirée par la modération se tait).
  assert.deepEqual(lectures.find((l) => l.table === "passions").filtres, { id: "eq.cyclisme", status: "eq.active" });
});

test("⑪ un contenu hostile reste du texte : aucune balise, aucun attribut ne s'échappe", async () => {
  const { corps } = await appeler("/p/xss1", UA_FACEBOOK);
  // Aucune balise réelle : « onerror=alert(2) » survit en TEXTE, sans le `<` qui en ferait un attribut.
  assert.ok(!/<script|<img|<svg|<iframe/i.test(corps));
  // Structure INCHANGÉE : exactement les balises de la page, rien d'injecté.
  const balises = (corps.match(/<[a-z!/][^>]*>/gi) || []).map((b) => b.match(/^<\/?!?([a-z]+)/i)[1].toLowerCase());
  assert.deepEqual([...new Set(balises)].sort(), ["a", "body", "doctype", "head", "html", "meta", "p", "title"]);
  assert.ok(corps.includes('content="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
  // L'URL `javascript:` n'est pas une image : l'image générique la remplace.
  assert.ok(corps.includes('og:image" content="https://passio-app.netlify.app/icon-512.png"'));
});

test("⑫ carnet et compte privé : l'aperçu générique, sans un mot du contenu", async () => {
  const carnet = await appeler("/p/carnet1", UA_WHATSAPP);
  assert.ok(!carnet.corps.includes("carnet privé"));
  assert.ok(carnet.corps.includes(TITRE_GENERIQUE.replace("—", "—")));
  const prive = await appeler("/p/prive1", UA_WHATSAPP);
  assert.ok(!prive.corps.includes("Secret"));
  const profil = await appeler("/u/a0000000-0000-4000-8000-000000000001", UA_IMESSAGE);
  assert.ok(profil.corps.includes("Discret sur PASSIO"));
  assert.ok(!profil.corps.includes("Bio secrète") && !profil.corps.includes("avatars/d.jpg"));
});

test("⑬ base injoignable ou lente : l'aperçu générique, jamais une erreur", async () => {
  const { r, corps } = await appeler("/e/ev1", UA_TELEGRAM, BASE, { panne: true });
  assert.equal(r.status, 200);
  assert.ok(corps.includes("og:title"));
  assert.ok(corps.includes('<a href="https://passio-app.netlify.app/#irl-event-ev1">'));
  // Une ligne absente (identifiant de démonstration) : générique aussi.
  const demo = await appeler("/u/u_lea", UA_DISCORD);
  assert.equal(demo.r.status, 200);
  assert.ok(demo.corps.includes('<a href="https://passio-app.netlify.app/#user-u_lea">'));
});

test("⑭ la page d'aperçu se construit sans entrée et reste bien formée", () => {
  const html = pageApercu({ url: "https://passio-app.netlify.app/p/x", versApp: "https://passio-app.netlify.app/#post-x" });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("<title>" + TITRE_GENERIQUE + "</title>"));
  assert.ok(html.includes('name="twitter:card" content="summary"'));
});
