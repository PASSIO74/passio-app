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
// transformation peut être éteinte chez Supabase sans rien casser.
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

  // b) Le code servi ne la demande plus nulle part : seul un COMMENTAIRE peut la nommer.
  //    C'est ce qui permet d'éteindre la transformation chez Supabase sans rien casser.
  const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const fichiers = [];
  const parcourir = (dossier) => {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (e.name === "vendor" || e.name === "node_modules") continue;   // le SDK nomme l'API, il ne l'appelle pas
      const p = path.join(dossier, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (/\.(m?js|ts|html)$/.test(e.name)) fichiers.push(p);
    }
  };
  for (const d of ["js", "netlify", "supabase/functions"]) parcourir(path.join(racine, d));
  for (const f of ["sw.js", "index.html"]) fichiers.push(path.join(racine, f));
  let commentaires = 0;
  const fautes = [];
  for (const f of fichiers) {
    fs.readFileSync(f, "utf8").split("\n").forEach((ligne, i) => {
      if (!ligne.includes("render/image")) return;
      if (/^\s*(\/\/|\*|\/\*|<!--)/.test(ligne)) commentaires++;
      else fautes.push(path.relative(racine, f) + ":" + (i + 1) + "  " + ligne.trim().slice(0, 120));
    });
  }
  assert.ok(fichiers.length > 50, "le verrou doit parcourir le code servi (" + fichiers.length + " fichiers)");
  assert.ok(commentaires >= 1, "le verrou doit au moins voir le commentaire de passioThumb (app-02)");
  assert.deepEqual(fautes, [], "transformation d'image demandée par le code :\n" + fautes.join("\n"));
});
