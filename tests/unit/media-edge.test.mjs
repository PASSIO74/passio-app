// ══════════════════════════════════════════
// /media/* — LE CDN NE SE CONTOURNE PAS PAR LA REQUÊTE (audit 2026-11-06)
//
// Le VRAI netlify/edge-functions/media.js, `fetch` simulé : aucun réseau.
// `Netlify-Vary: query=width|quality` fait de la valeur BRUTE de ces paramètres la
// clé de cache. Une valeur libre créait donc un nouvel objet à chaque requête, et
// chaque objet retirait le fichier de Supabase : sans compte, n'importe qui pouvait
// annuler le cache et consommer le quota de sortie (Spend Cap : un mur pour tous).
// ══════════════════════════════════════════
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import media from "../../netlify/edge-functions/media.js";

const HOTE = "https://passio-app.netlify.app";
let appels = [];
let reponse = () => new Response("octets", { status: 200, headers: { "content-type": "image/jpeg", "content-length": "6" } });

beforeEach(() => {
  appels = [];
  reponse = () => new Response("octets", { status: 200, headers: { "content-type": "image/jpeg", "content-length": "6" } });
  globalThis.fetch = async (u, init) => { appels.push({ url: String(u), init }); return reponse(); };
});

const get = (chemin, init) => media(new Request(HOTE + chemin, init));

test("① une largeur du client, en qualité 75 : servie, en cache", async () => {
  for (const w of [192, 352, 360, 400, 600, 700, 720, 880]) {
    const r = await get(`/media/content/a.jpg?width=${w}&quality=75`);
    assert.equal(r.status, 200, "largeur " + w);
    assert.match(r.headers.get("cache-control"), /public, max-age=3600/);
    assert.equal(r.headers.get("netlify-vary"), "query=width|quality");
  }
  assert.ok(appels.every((a) => a.url.includes("/storage/v1/render/image/public/content/a.jpg?width=") && a.url.endsWith("&quality=75")));
});

test("② une largeur hors liste ne lit JAMAIS l'origine : renvoi vers la largeur canonique", async () => {
  const r = await get("/media/content/a.jpg?width=701&quality=75");
  assert.equal(r.status, 302);
  assert.equal(new URL(r.headers.get("location"), HOTE).search, "?width=720&quality=75");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(appels.length, 0);
  const grand = await get("/media/content/a.jpg?width=9999&quality=75");
  assert.equal(new URL(grand.headers.get("location"), HOTE).search, "?width=880&quality=75");
  assert.equal(appels.length, 0);
});

test("③ une qualité autre que 75 ne crée pas d'objet de cache", async () => {
  for (const q of ["74", "76", "zzz1", "", "1000"]) {
    const r = await get(`/media/content/a.jpg?width=700&quality=${q}`);
    assert.equal(r.status, 302, "qualité " + q);
    assert.equal(new URL(r.headers.get("location"), HOTE).search, "?width=700&quality=75");
  }
  assert.equal(appels.length, 0);
});

test("④ une valeur non numérique ou une qualité seule est refusée sans lire l'origine", async () => {
  for (const q of ["?width=x1", "?width=", "?width=7e2", "?width=700;a", "?quality=75", "?quality=zzz"]) {
    const r = await get("/media/content/a.jpg" + q);
    assert.equal(r.status, 400, q);
    assert.equal(r.headers.get("cache-control"), "no-store", q);
  }
  assert.equal(appels.length, 0);
});

test("⑤ l'objet entier, sans paramètre, reste servi", async () => {
  const r = await get("/media/content/a.jpg");
  assert.equal(r.status, 200);
  assert.equal(appels[0].url.endsWith("/storage/v1/object/public/content/a.jpg"), true);
});

test("⑥ le seau privé ne passe plus par cette fonction", async () => {
  const r = await get("/media/attachments/conv/a.jpg");
  assert.equal(r.status, 404);
  assert.equal(appels.length, 0);
});

test("⑦ seuls des types médias connus sortent en ligne ; les autres en pièce jointe", async () => {
  const enLigne = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "video/mp4", "video/quicktime", "video/webm", "audio/mpeg", "audio/mp4", "audio/webm", "audio/webm; codecs=opus", "IMAGE/JPEG"];
  const piecesJointes = ["image/svg+xml", "IMAGE/SVG+XML ; a=b", "image/x+xml", "video/x+xml", "audio/x+xml", "image/png, text/html", "image/png,image/svg+xml", "image/", "text/html", "application/xhtml+xml", "application/pdf", ""];
  for (const ct of enLigne) {
    reponse = () => new Response("x", { status: 200, headers: { "content-type": ct } });
    const r = await get("/media/content/f");
    assert.equal(r.headers.get("content-disposition"), null, ct);
    assert.equal(r.headers.get("content-type"), ct, ct);
  }
  for (const ct of piecesJointes) {
    reponse = () => new Response("x", { status: 200, headers: ct ? { "content-type": ct } : {} });
    const r = await get("/media/content/f");
    assert.equal(r.headers.get("content-type"), "application/octet-stream", ct);
    assert.equal(r.headers.get("content-disposition"), "attachment", ct);
  }
});

test("⑧ toute réponse porte le bac à sable", async () => {
  for (const c of ["/media/content/a.jpg", "/media/content/a.jpg?width=x", "/media/autre/a.jpg"]) {
    const r = await get(c);
    assert.equal(r.headers.get("content-security-policy"), "sandbox; default-src 'none'", c);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", c);
  }
});

test("⑨ une réponse à HEAD ne se met pas en cache : elle viderait le média pour tous", async () => {
  reponse = () => new Response(null, { status: 200, headers: { "content-type": "image/jpeg", "content-length": "6" } });
  const r = await get("/media/content/a.jpg", { method: "HEAD" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("netlify-cdn-cache-control"), null);
  assert.equal(r.headers.get("netlify-vary"), null);
});

test("⑩ la lecture interne d'une plage ne contourne pas non plus la liste", async () => {
  await get("/media/content/a.jpg?width=700&quality=75", { headers: { Range: "bytes=0-1" } });
  assert.equal(appels[0].url, HOTE + "/media/content/a.jpg?width=700&quality=75");
});

test("⑪ la liste couvre CHAQUE largeur demandée par le client (verrou contre le code)", () => {
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
