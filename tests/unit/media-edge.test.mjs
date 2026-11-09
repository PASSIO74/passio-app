// ══════════════════════════════════════════
// /media/* — LES ANCIENNES URL SONT RENVOYÉES AU CDN SUPABASE (2026-11-09)
//
// Le VRAI netlify/edge-functions/media.js, `fetch` piégé : la fonction ne lit
// PLUS JAMAIS l'origine. Du 2026-09-11 au 2026-11-09 c'était un relais ; mesuré le
// 2026-11-09, son cache ne servait rien (neuf `fwd=miss` d'affilée) et chaque vue
// consommait à la fois les 100 Go de Netlify et la sortie de Supabase. Supabase
// (Pro) sert désormais l'objet avec un cache d'un an : le relais devient un renvoi.
//
// Gardé de l'audit du 2026-11-06 : `Netlify-Vary: query=width|quality` fait de la
// valeur BRUTE de ces paramètres une clé de cache, d'où la LISTE FERMÉE.
// Depuis la suite du 2026-11-09 (⑪), PLUS AUCUN renvoi ne va vers la
// transformation d'image (100 images d'origine/mois en Pro, spend cap : un mur
// pour tous) : une ancienne miniature reçoit l'objet, comme `passioThumb`. La
// transformation pourra être éteinte chez Supabase sans rien casser, après la
// précondition écrite dans docs/CDN_MEDIAS.md (24 h, journaux à l'appui).
// ══════════════════════════════════════════
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import media from "../../netlify/edge-functions/media.js";

const HOTE = "https://passio-app.netlify.app";
const SUPABASE = "https://njkiyoklssvefstljemx.supabase.co";
let appels = [];

beforeEach(() => {
  appels = [];
  globalThis.fetch = async (u, init) => { appels.push({ url: String(u), init }); return new Response("octets", { status: 200 }); };
});

const get = (chemin, init) => media(new Request(HOTE + chemin, init));

test("① une ancienne miniature, en qualité 75 : renvoyée vers l'OBJET, sans transformation", async () => {
  for (const w of [192, 352, 360, 400, 600, 700, 720, 880]) {
    const r = await get(`/media/content/a.jpg?width=${w}&quality=75`);
    assert.equal(r.status, 301, "largeur " + w);
    assert.equal(r.headers.get("location"), `${SUPABASE}/storage/v1/object/public/content/a.jpg`);
    assert.match(r.headers.get("cache-control"), /^public, max-age=\d+$/);
    assert.equal(r.headers.get("netlify-vary"), "query=width|quality");
    assert.equal(r.headers.get("x-passio-cdn"), "renvoi-miniature");
  }
  assert.equal(appels.length, 0, "le renvoi ne lit jamais l'origine");
});

test("② une largeur hors liste n'est jamais renvoyée telle quelle : forme canonique", async () => {
  const r = await get("/media/content/a.jpg?width=701&quality=75");
  assert.equal(r.status, 302);
  assert.equal(new URL(r.headers.get("location"), HOTE).search, "?width=720&quality=75");
  assert.equal(r.headers.get("cache-control"), "no-store");
  const grand = await get("/media/content/a.jpg?width=9999&quality=75");
  assert.equal(new URL(grand.headers.get("location"), HOTE).search, "?width=880&quality=75");
  assert.equal(appels.length, 0);
});

test("③ une qualité autre que 75 repart vers la forme canonique", async () => {
  for (const q of ["74", "76", "zzz1", "", "1000"]) {
    const r = await get(`/media/content/a.jpg?width=700&quality=${q}`);
    assert.equal(r.status, 302, "qualité " + q);
    assert.equal(new URL(r.headers.get("location"), HOTE).search, "?width=700&quality=75");
  }
  assert.equal(appels.length, 0);
});

test("④ une valeur non numérique ou une qualité seule est refusée", async () => {
  for (const q of ["?width=x1", "?width=", "?width=7e2", "?width=700;a", "?quality=75", "?quality=zzz"]) {
    const r = await get("/media/content/a.jpg" + q);
    assert.equal(r.status, 400, q);
    assert.equal(r.headers.get("cache-control"), "no-store", q);
  }
  assert.equal(appels.length, 0);
});

test("⑤ l'objet entier, sans paramètre : renvoyé vers l'objet public Supabase", async () => {
  const r = await get("/media/content/photos/u1/x%20y.jpg.v720.webp");
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), `${SUPABASE}/storage/v1/object/public/content/photos/u1/x%20y.jpg.v720.webp`);
  assert.equal(r.headers.get("x-passio-cdn"), "renvoi");
  assert.equal(appels.length, 0);
});

test("⑥ le seau privé et les chemins hors seau ne sont jamais renvoyés", async () => {
  for (const c of ["/media/attachments/conv/a.jpg", "/media/autre/a.jpg", "/media/content", "/media/content/../x", "/media/content//x"]) {
    const r = await get(c);
    assert.equal(r.status, 404, c);
    assert.equal(r.headers.get("location"), null, c);
  }
  assert.equal(appels.length, 0);
});

test("⑦ le renvoi ne sort jamais du stockage de PASSIO (pas de renvoi ouvert)", async () => {
  for (const c of ["/media/content/a.jpg", "/media/content/%2F%2Fevil.example/x.jpg", "/media/content/a.jpg?width=192&quality=75&next=https://evil.example"]) {
    const r = await get(c);
    const loc = r.headers.get("location");
    assert.ok(loc, c);
    const u = new URL(loc);
    assert.equal(u.origin, SUPABASE, c + " → " + loc);
    assert.ok(/^\/storage\/v1\/object\/public\/content\//.test(u.pathname), c + " → " + u.pathname);
    // Un paramètre étranger n'est jamais recopié dans le renvoi.
    assert.equal(u.searchParams.get("next"), null, c);
  }
});

test("⑧ toute réponse porte le bac à sable", async () => {
  for (const c of ["/media/content/a.jpg", "/media/content/a.jpg?width=x", "/media/autre/a.jpg", "/media/content/a.jpg?width=1"]) {
    const r = await get(c);
    assert.equal(r.headers.get("content-security-policy"), "sandbox; default-src 'none'", c);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", c);
  }
});

test("⑨ HEAD et requête par plage : le même renvoi, aucune lecture d'origine", async () => {
  const tete = await get("/media/content/v.mp4", { method: "HEAD" });
  assert.equal(tete.status, 301);
  const plage = await get("/media/content/v.mp4", { headers: { Range: "bytes=0-1" } });
  assert.equal(plage.status, 301);
  assert.equal(plage.headers.get("location"), `${SUPABASE}/storage/v1/object/public/content/v.mp4`);
  const post = await get("/media/content/v.mp4", { method: "POST", body: "x" });
  assert.equal(post.status, 405);
  assert.equal(appels.length, 0);
});

test("⑩ la liste couvre CHAQUE largeur demandée par le client (verrou contre le code)", () => {
  const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dossier = path.join(racine, "js");
  const source = fs.readFileSync(path.join(racine, "netlify/edge-functions/media.js"), "utf8");
  const liste = /const LARGEURS = \[([^\]]+)\]/.exec(source);
  assert.ok(liste, "LARGEURS absente de media.js");
  const admises = new Set(liste[1].split(",").map((s) => Number(s.trim())));
  const trouvees = new Set();
  for (const f of fs.readdirSync(dossier).filter((n) => n.endsWith(".js"))) {
    const t = fs.readFileSync(path.join(dossier, f), "utf8");
    for (const m of t.matchAll(/(?:passioThumb|avatarBg)\([^,()]+(?:\([^()]*\))?[^,()]*,\s*(\d+)\s*\)/g)) trouvees.add(Number(m[1]));
    for (const m of t.matchAll(/\(width \|\| (\d+)\)/g)) trouvees.add(Number(m[1]));
  }
  assert.ok(trouvees.size >= 5, "le verrou doit trouver les largeurs du client");
  for (const w of trouvees) assert.ok(admises.has(w), "largeur du client absente de LARGEURS : " + w);
});

test("⑪ plus AUCUNE transformation d'image : ni dans un renvoi, ni dans le code servi", async () => {
  // a) Aucune forme de requête, ancienne miniature comprise, n'est renvoyée vers `render/image`.
  const formes = [
    "/media/content/a.jpg",
    "/media/content/photos/u1/p.jpg.v720.webp",
    ...[192, 352, 360, 400, 600, 700, 720, 880].map((w) => `/media/content/a.jpg?width=${w}&quality=75`),
  ];
  for (const c of formes) {
    for (const method of ["GET", "HEAD"]) {
      const r = await get(c, { method });
      assert.equal(r.status, 301, method + " " + c);
      const loc = r.headers.get("location");
      assert.doesNotMatch(loc, /render\/image|[?&](width|quality)=/, method + " " + c + " → " + loc);
    }
  }
  assert.equal(appels.length, 0);

  // b) Le code servi ne la demande plus nulle part — ni en clair, ni par l'option
  //    `transform` du SDK, qui fabrique `render/image` lui-même (contre-revue de #800,
  //    P2-2). Seul un COMMENTAIRE peut la nommer. C'est ce qui permettra d'éteindre
  //    la transformation chez Supabase (précondition : docs/CDN_MEDIAS.md).
  const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const fichiers = [];
  const parcourir = (dossier) => {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (e.name === "vendor" || e.name === "node_modules") continue;   // le SDK nomme l'API, il ne l'appelle pas
      const p = path.join(dossier, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (/\.(m?js|ts|html|css|json)$/.test(e.name)) fichiers.push(p);
    }
  };
  // Tout ce que Netlify sert ou exécute : l'app, le pilotage (copié dans dist/ par le
  // build), les fonctions, la configuration (une règle de renvoi y suffirait).
  for (const d of ["js", "netlify", "supabase/functions", "pilotage", "data"]) parcourir(path.join(racine, d));
  for (const f of ["sw.js", "index.html", "styles.css", "netlify.toml", "_headers"]) fichiers.push(path.join(racine, f));
  const fautes = [];
  for (const f of fichiers) {
    for (const d of demandesDeTransformation(fs.readFileSync(f, "utf8"), f)) fautes.push(path.relative(racine, f) + ":" + d);
  }
  assert.ok(fichiers.length > 60, "le verrou doit parcourir le code servi (" + fichiers.length + " fichiers)");
  // Non vide : media.js NOMME la transformation, en commentaire seulement — lu en
  // texte brut il serait fautif, une fois les commentaires effacés il ne l'est plus.
  const media = fs.readFileSync(path.join(racine, "netlify/edge-functions/media.js"), "utf8");
  assert.match(media, /render\/image/, "media.js doit encore expliquer la transformation en commentaire");
  assert.deepEqual(demandesDeTransformation(media, "media.js"), []);
  assert.deepEqual(fautes, [], "transformation d'image demandée par le code :\n" + fautes.join("\n"));
});

// ── L'effaceur du verrou ⑪ ─────────────────────────────────────────────────
// Efface les commentaires d'un source JS en GARDANT chaînes, gabarits (imbriqués
// compris), expressions régulières et sauts de ligne : un « // » dans une URL n'est
// pas un commentaire, du code après un « /* … */ » reste du code, et les numéros de
// ligne restent ceux du fichier. Classer les lignes par leur préfixe laissait passer
// les deux premiers et rougissait sur un commentaire de fin de ligne (contre-revue
// de #800, P3-1).
const AVANT_REGEX = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);
const IDENT = /[A-Za-z_$][\w$]*/y;
function sansCommentairesJs(src) {
  const n = src.length;
  const zones = [];                           // [début, fin) de chaque commentaire, effacés à la fin
  const effacer = (a, b) => { zones.push(a, b); };
  let i = 0;
  const regexPermise = (d) => d === "" || AVANT_REGEX.has(d) || /^[^\w\s$)\]]$/.test(d);
  function finRegex() {                       // i sur « / » ; la fin, ou -1
    let classe = false;
    for (let j = i + 1; j < n && src[j] !== "\n"; j++) {
      if (src[j] === "\\") { j++; continue; }
      if (classe) { if (src[j] === "]") classe = false; } else if (src[j] === "[") classe = true;
      else if (src[j] === "/") { j++; while (j < n && /[A-Za-z]/.test(src[j])) j++; return j; }
    }
    return -1;
  }
  function gabarit() {                        // i sur l'accent grave ouvrant
    for (i++; i < n && src[i] !== "`";) {
      if (src[i] === "\\") { i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") { i += 2; code(true); continue; }
      i++;
    }
    i++;
  }
  function code(dansGabarit) {               // jusqu'à la fin, ou à l'accolade qui ferme un `${`
    let dernier = "", prof = 0;
    while (i < n) {
      const c = src[i];
      if (c === "/" && src[i + 1] === "/") { const j = src.indexOf("\n", i); const fin = j < 0 ? n : j; effacer(i, fin); i = fin; continue; }
      if (c === "/" && src[i + 1] === "*") { const j = src.indexOf("*/", i + 2); const fin = j < 0 ? n : j + 2; effacer(i, fin); i = fin; continue; }
      if (c === '"' || c === "'") { for (i++; i < n && src[i] !== c && src[i] !== "\n"; i++) if (src[i] === "\\") i++; i++; dernier = "chaine"; continue; }
      if (c === "`") { gabarit(); dernier = "chaine"; continue; }
      if (c === "/" && regexPermise(dernier)) { const j = finRegex(); if (j > 0) { i = j; dernier = "regex"; continue; } }
      if (dansGabarit && c === "{") prof++;
      if (dansGabarit && c === "}") { if (prof === 0) { i++; return; } prof--; }
      if (c === " " || c === "\n" || c === "\t" || c === "\r") { i++; continue; }
      IDENT.lastIndex = i;
      const mot = IDENT.exec(src);
      if (mot) { dernier = mot[0]; i += mot[0].length; continue; }
      dernier = c;
      i++;
    }
  }
  code(false);
  let res = "", prec = 0;
  for (let z = 0; z < zones.length; z += 2) {
    res += src.slice(prec, zones[z]) + src.slice(zones[z], zones[z + 1]).replace(/[^\n]/g, " ");
    prec = zones[z + 1];
  }
  return res + src.slice(prec);
}
const effacerBloc = (re) => (src) => src.replace(re, (m) => m.replace(/[^\n]/g, " "));
const sansCommentairesHtml = effacerBloc(/<!--[\s\S]*?-->/g);   // un script en ligne garde ses « // » : bruyant, jamais muet
const sansCommentairesCss = effacerBloc(/\/\*[\s\S]*?\*\//g);   // « // » n'est pas un commentaire CSS (url(https://…))

const DEMANDES = [
  [/render\//, "URL de transformation (render/…)"],
  [/\btransform\s*:\s*\{/, "option transform du SDK"],
  [/\bgetPublicUrl\s*\([^)]*,/, "getPublicUrl avec options"],
  [/\bcreateSignedUrls?\s*\([^)]*,[^)]*,/, "createSignedUrl(s) avec options"],
  [/\.download\s*\([^)]*,/, "download avec options"],
];
function demandesDeTransformation(source, fichier) {
  const texte = /\.(m?js|ts)$/.test(fichier) ? sansCommentairesJs(source)
    : /\.html$/.test(fichier) ? sansCommentairesHtml(source)
    : /\.css$/.test(fichier) ? sansCommentairesCss(source)
    : source;                                  // JSON, TOML, _headers : lus tels quels
  const trouvees = [];
  for (const [re, motif] of DEMANDES) {
    const g = new RegExp(re.source, "g");
    for (const m of texte.matchAll(g)) {
      const ligne = texte.slice(0, m.index).split("\n").length;
      trouvees.push(ligne + "  " + motif + " : " + source.split("\n")[ligne - 1].trim().slice(0, 110));
    }
  }
  return trouvees;
}

test("⑫ l'effaceur du verrou ⑪ : un commentaire ne compte pas ; chaîne, gabarit, code après un commentaire et option du SDK comptent", () => {
  const cas = [
    ["code(); // … render/image", false],
    ["/* note */ var u = base + \"/storage/v1/render/image/public/x\";", true],
    ["/*\n   corps de bloc sans étoile : render/image\n*/\nvar a = 1;", false],
    ["var u = \"https://x.supabase.co/storage/v1/render/image/public/a.jpg\";", true],
    ["var h = `<img src=\"https://x/${p}\">\n  https://x/storage/v1/render/image/${q}`;", true],
    ["var t = `${a ? `<i>${b}</i>` : \"\"} // pas un commentaire : render/image`;", true],
    ["var re = /https?:\\/\\//; var u = \"render/image\";", true],
    ["var q = a / b; // render/image", false],
    ["var u = \"…/render/\" + \"image/public/x\";", true],
    ["sb.storage.from(\"content\").getPublicUrl(p, { transform: { width: 192 } });", true],
    ["sb.storage.from(\"content\").createSignedUrl(p, 60, { transform: { width: 192 } });", true],
    ["sb.storage.from(\"content\").download(p, { transform: { width: 1 } });", true],
    ["sb.storage.from(\"content\").getPublicUrl(p);", false],
    ["sb.storage.from(\"attachments\").createSignedUrl(p, 60);", false],
  ];
  for (const [src, faute] of cas) assert.equal(demandesDeTransformation(src, "x.js").length > 0, faute, src);
  // HTML et CSS : leurs propres commentaires seulement.
  assert.equal(demandesDeTransformation("<!-- render/image -->\n<p>ok</p>", "x.html").length, 0);
  assert.equal(demandesDeTransformation("<img src=\"https://x/storage/v1/render/image/public/a\">", "x.html").length, 1);
  assert.equal(demandesDeTransformation("/* render/image */ a { color: red }", "x.css").length, 0);
  assert.equal(demandesDeTransformation("a { background: url(https://x/storage/v1/render/image/public/a) }", "x.css").length, 1);
});
