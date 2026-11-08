// ═══════════════════════════════════════════════════════════════════════════
// /demo/* — LES IMAGES D'ILLUSTRATION SERVIES PAR PASSIO (2026-11-08, audit du 06/11, G-03)
//
// Le VRAI netlify/edge-functions/demo.js, `fetch` simulé : aucun réseau.
// On mesure : liste fermée (identifiants, formats), aucune requête, aucun en-tête
// du visiteur relayé, seule une image servie, en-têtes de sécurité partout, erreurs
// hors cache. Et dans les SOURCES : chaque identifiant du code est servi, chaque
// identifiant servi est utilisé, et plus aucun hôte d'images tiers n'est appelé.
// ═══════════════════════════════════════════════════════════════════════════
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import demo, { IDS, FORMATS } from "../../netlify/edge-functions/demo.js";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOTE = "https://passio-app.netlify.app";
const ID = "photo-1534438327276-14e5300c3a48";
let appels = [];
let reponse;
const image = (type = "image/jpeg", url = "https://images.unsplash.com/" + ID) => {
  const r = new Response("octets", { status: 200, headers: { "content-type": type } });
  Object.defineProperty(r, "url", { value: url });
  return r;
};

beforeEach(() => {
  appels = [];
  reponse = () => image();
  globalThis.fetch = async (u, init) => { appels.push({ url: String(u), init }); return reponse(); };
});
const get = (chemin, init) => demo(new Request(HOTE + chemin, init));

test("① un identifiant et un format de la liste : l'image d'Unsplash, aux mêmes paramètres qu'avant", async () => {
  for (const [format, q] of Object.entries(FORMATS)) {
    appels = [];
    const r = await get(`/demo/u/${ID}/${format}`);
    assert.equal(r.status, 200);
    assert.equal(appels.length, 1);
    assert.equal(appels[0].url, `https://images.unsplash.com/${ID}?${q}`);
    assert.equal(r.headers.get("content-type"), "image/jpeg");
    assert.match(r.headers.get("cache-control"), /^public, max-age=\d+$/);
    assert.match(r.headers.get("netlify-cdn-cache-control"), /s-maxage=\d+/);
  }
});

test("② hors liste : 404 sans aucune lecture d'origine", async () => {
  for (const chemin of [
    "/demo/u/photo-1111111111111-aaaaaaaaaaaa/couverture",   // identifiant inventé
    `/demo/u/${ID}/geant`,                                   // format inconnu
    `/demo/u/${ID}/constructor`,                             // propriété héritée d'un objet
    `/demo/u/${ID}`,                                         // format absent
    `/demo/u/${ID}/couverture/x`,                            // segment de trop
    `/demo/u/..%2F..%2Fetc/couverture`,
    "/demo/x/" + ID + "/couverture",
  ]) {
    const r = await get(chemin);
    assert.equal(r.status, 404, chemin);
    assert.equal(r.headers.get("cache-control"), "no-store", chemin);
  }
  assert.equal(appels.length, 0);
});

test("③ une requête quelle qu'elle soit : 400, la clé de cache reste le chemin", async () => {
  const r = await get(`/demo/u/${ID}/couverture?w=4000`);
  assert.equal(r.status, 400);
  assert.equal(appels.length, 0);
});

test("④ rien du visiteur ne part : ni adresse, ni cookie, ni Referer, ni Accept", async () => {
  await get(`/demo/u/${ID}/avatar`, { headers: {
    "X-Forwarded-For": "203.0.113.7", "X-Nf-Client-Connection-Ip": "203.0.113.7", Cookie: "sb=secret",
    Referer: "https://passio-app.netlify.app/#profil-de-quelqu-un", Accept: "image/svg+xml", "User-Agent": "Navigateur du visiteur",
  } });
  const h = new Headers(appels[0].init.headers);
  assert.deepEqual([...h.keys()].sort(), ["accept", "user-agent"]);
  assert.equal(h.get("accept"), "image/webp,image/jpeg;q=0.8");
  assert.equal(h.get("user-agent"), "passio-demo");
});

test("⑤ seule une image venue d'Unsplash est servie : jamais un SVG, un HTML, ni une redirection ailleurs", async () => {
  for (const [type, url] of [["image/svg+xml", undefined], ["text/html", undefined], ["application/octet-stream", undefined],
    ["image/jpeg", "https://exemple.invalid/photo.jpg"]]) {
    reponse = () => image(type, url);
    const r = await get(`/demo/u/${ID}/couverture`);
    assert.equal(r.status, 502, type + " " + (url || ""));
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
  reponse = () => new Response("absent", { status: 404, headers: { "content-type": "image/jpeg" } });
  assert.equal((await get(`/demo/u/${ID}/couverture`)).status, 502);
  globalThis.fetch = async () => { throw new Error("réseau coupé"); };
  assert.equal((await get(`/demo/u/${ID}/couverture`)).status, 502);
});

test("⑥ en-têtes de sécurité sur toute réponse, succès comme erreur", async () => {
  for (const chemin of [`/demo/u/${ID}/mini`, "/demo/u/inconnu/mini", `/demo/u/${ID}/mini?x=1`]) {
    const r = await get(chemin);
    assert.equal(r.headers.get("content-security-policy"), "sandbox; default-src 'none'", chemin);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", chemin);
    assert.equal(r.headers.get("x-frame-options"), "DENY", chemin);
  }
});

test("⑦ GET et HEAD seulement ; un HEAD n'entre jamais en cache", async () => {
  const p = await get(`/demo/u/${ID}/mini`, { method: "POST", body: "x" });
  assert.equal(p.status, 405);
  assert.equal(p.headers.get("allow"), "GET, HEAD");
  const h = await get(`/demo/u/${ID}/mini`, { method: "HEAD" });
  assert.equal(h.status, 200);
  assert.equal(h.headers.get("cache-control"), "no-store");
  assert.equal(h.headers.get("netlify-cdn-cache-control"), null);
});

test("⑧ les sources : chaque identifiant du code est servi, chaque identifiant servi est utilisé", () => {
  const fichiers = fs.readdirSync(path.join(RACINE, "js")).filter((f) => f.endsWith(".js")).map((f) => path.join(RACINE, "js", f));
  fichiers.push(path.join(RACINE, "index.html"));
  const vus = new Set();
  for (const f of fichiers) for (const m of fs.readFileSync(f, "utf8").matchAll(/photo-\d{9,16}-[0-9a-f]{6,16}/g)) vus.add(m[0]);
  const manquants = [...vus].filter((id) => !IDS.has(id));
  const morts = [...IDS].filter((id) => !vus.has(id));
  assert.deepEqual(manquants, [], "identifiants du code absents de la liste de demo.js : les ajouter");
  assert.deepEqual(morts, [], "identifiants de demo.js que le code n'utilise plus : les retirer");
});

test("⑨ les sources : plus aucun hôte d'images tiers appelé par la page ou le code", () => {
  const fichiers = fs.readdirSync(path.join(RACINE, "js")).filter((f) => f.endsWith(".js")).map((f) => path.join(RACINE, "js", f));
  fichiers.push(path.join(RACINE, "index.html"));
  for (const f of fichiers) {
    const t = fs.readFileSync(f, "utf8");
    for (const hote of ["images.unsplash.com", "picsum.photos", "loremflickr.com"]) {
      assert.ok(!new RegExp("https?://" + hote.replace(/\./g, "\\.")).test(t), `${path.basename(f)} appelle encore ${hote}`);
    }
  }
  const html = fs.readFileSync(path.join(RACINE, "index.html"), "utf8");
  assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html), "index.html charge encore Google Fonts à chaque ouverture");
  const css = fs.readFileSync(path.join(RACINE, "styles.css"), "utf8");
  assert.match(css, /url\("fonts\/manrope-latin\.woff2"\)/);
  assert.ok(fs.existsSync(path.join(RACINE, "fonts", "manrope-latin.woff2")));
  assert.ok(fs.existsSync(path.join(RACINE, "fonts", "OFL.txt")), "la licence OFL accompagne la police");
});
