// Cohérence des en-têtes HTTP de production (audit B, 2026-11-02).
//
// La CSP et les en-têtes de sécurité sont définis à DEUX endroits : `_headers`
// (copié dans dist/ par deploy.yml, ce que Netlify sert) et `netlify.toml`
// ([[headers]]). Netlify fusionne les deux ; une modification faite dans un seul
// fichier passe inaperçue, et les deux ont déjà divergé sur les règles de cache
// (`release.json`, `index.html`, `app/*` immutable ne sont que dans `_headers`).
// Ce banc exige :
//   ① la CSP de `_headers` (/*) et celle de `netlify.toml` (/*) sont IDENTIQUES ;
//   ② `sw.js`, `manifest.json`, `release.json` et `index.html` ne sont jamais
//      mis en cache (sinon le release-guard rend un faux vert et une PWA garde
//      un vieux worker) ;
//   ③ les 9 scripts `app/` et `styles.css` sont `immutable` (l'URL de chacun
//      porte le hash de son contenu — `scripts/build.js`) ;
//   ④ la CSP ne laisse entrer AUCUN hôte de script tiers autre que le captcha :
//      les bibliothèques sont auto-hébergées depuis le 2026-09-11.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const headers = fs.readFileSync(path.join(RACINE, "_headers"), "utf8");
const toml = fs.readFileSync(path.join(RACINE, "netlify.toml"), "utf8");

/** Règles de `_headers` : chemin → { nom: valeur }. */
function reglesHeaders(texte) {
  const out = {};
  let chemin = null;
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.replace(/\s+$/, "");
    if (!ligne || /^\s*#/.test(ligne)) continue;
    if (!/^\s/.test(ligne)) { chemin = ligne.trim(); out[chemin] = out[chemin] || {}; continue; }
    const m = /^\s+([A-Za-z-]+):\s*(.*)$/.exec(ligne);
    if (m && chemin) out[chemin][m[1]] = m[2];
  }
  return out;
}

/** La CSP du bloc `for = "/*"` de netlify.toml. */
function cspToml(texte) {
  const bloc = /\[\[headers\]\]\s*\n\s*for\s*=\s*"\/\*"\s*\n\s*\[headers\.values\]\s*\n([\s\S]*?)(?=\n\[\[|\s*$)/.exec(texte);
  assert.ok(bloc, "bloc [[headers]] for = \"/*\" introuvable dans netlify.toml");
  const csp = /Content-Security-Policy\s*=\s*"([^"]*)"/.exec(bloc[1]);
  assert.ok(csp, "Content-Security-Policy absente du bloc /* de netlify.toml");
  return csp[1];
}

const regles = reglesHeaders(headers);

test("① la CSP de _headers et celle de netlify.toml sont identiques", () => {
  const h = regles["/*"] && regles["/*"]["Content-Security-Policy"];
  assert.ok(h, "CSP absente de _headers (/*)");
  assert.equal(h.trim(), cspToml(toml).trim());
});

test("② sw.js, manifest.json, release.json et index.html ne sont jamais mis en cache", () => {
  for (const chemin of ["/sw.js", "/manifest.json", "/release.json", "/index.html", "/"]) {
    const cc = regles[chemin] && regles[chemin]["Cache-Control"];
    assert.ok(cc, chemin + " : pas de Cache-Control dans _headers");
    assert.match(cc, /no-store/, chemin + " : " + cc);
  }
});

test("③ les scripts app/ et styles.css sont immutables (URL hachée par le build)", () => {
  // Depuis le 2026-11-09, le bloc app sort en 9 scripts sous /app/ (un /app.js avant).
  for (const chemin of ["/app/*", "/styles.css"]) {
    const cc = regles[chemin] && regles[chemin]["Cache-Control"];
    assert.ok(cc, chemin + " : pas de Cache-Control");
    assert.match(cc, /immutable/, chemin + " : " + cc);
  }
  // Plus de règle pour l'ancien /app.js : un onglet périmé qui le redemanderait
  // recevrait un 404, qu'un `immutable` garderait un an — même après un retour
  // arrière qui le ferait revenir.
  assert.equal(regles["/app.js"], undefined, "/app.js : règle orpheline");
  // Le build pose bien le hash de CHAQUE script : sans lui, `immutable` servirait un
  // vieux script à vie.
  const build = fs.readFileSync(path.join(RACINE, "scripts", "build.js"), "utf8");
  assert.match(build, /ref: "app\/" \+ nom \+ "\?v=" \+ hash10\(contenu\)/);
  assert.match(build, /"styles\.css\?v=" \+ cssHash/);
});

test("④ script-src n'admet aucun hôte tiers hors du captcha", () => {
  const csp = regles["/*"]["Content-Security-Policy"];
  const scriptSrc = /script-src ([^;]+)/.exec(csp);
  assert.ok(scriptSrc);
  const hotes = scriptSrc[1].split(/\s+/).filter((s) => /^https?:\/\//.test(s));
  assert.deepEqual(hotes, ["https://challenges.cloudflare.com"]);
});

// ── Audit des routes du 2026-11-15 (relevé complet : docs/journal/partage-liens-invitation.md) ──
// Mesuré en production par `curl -D -` : quand netlify.toml ET _headers posent le
// même en-tête sur le même chemin, c'est netlify.toml qui est SERVI. `/sw.js` et
// `/manifest.json` partaient en `no-cache` pendant que ② ci-dessus, lisant
// `_headers`, rendait un vert sur `no-store`. Le cache n'a donc qu'UNE source.

/** Les blocs [[headers]] de netlify.toml : [{ chemin, valeurs: { nom: valeur } }]. */
function blocsToml(texte) {
  const blocs = [];
  for (const m of texte.matchAll(/\[\[headers\]\]\s*\n\s*for\s*=\s*"([^"]+)"\s*\n\s*\[headers\.values\]\s*\n([\s\S]*?)(?=\n\s*\[\[|\s*$)/g)) {
    const valeurs = {};
    for (const l of m[2].split(/\r?\n/)) {
      const v = /^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/.exec(l);
      if (v) valeurs[v[1]] = v[2];
    }
    blocs.push({ chemin: m[1], valeurs });
  }
  return blocs;
}

test("⑤ netlify.toml ne pose AUCUN Cache-Control ni en-tête qui contredise _headers", () => {
  const blocs = blocsToml(toml);
  assert.ok(blocs.length >= 1, "aucun bloc [[headers]] lu dans netlify.toml (parseur cassé ?)");
  for (const { chemin, valeurs } of blocs) {
    assert.equal(valeurs["Cache-Control"], undefined,
      `netlify.toml pose un Cache-Control sur ${chemin} : il l'emporterait sur _headers (mesuré le 2026-11-15)`);
    // Tout autre en-tête posé des deux côtés doit être IDENTIQUE.
    const h = regles[chemin] || {};
    for (const [nom, val] of Object.entries(valeurs)) {
      if (h[nom] !== undefined) assert.equal(h[nom].trim(), val.trim(), `${chemin} ${nom} : netlify.toml ≠ _headers`);
    }
  }
});

test("⑥ aucune règle de _headers ne vise une route morte", () => {
  // Chemin servi → ce qui le produit dans dist/ (scripts/build.js ou la copie de deploy.yml).
  const build = fs.readFileSync(path.join(RACINE, "scripts", "build.js"), "utf8");
  const deploy = fs.readFileSync(path.join(RACINE, ".github", "workflows", "deploy.yml"), "utf8");
  const copies = /cp manifest\.json _headers icon-192\.png icon-512\.png dist\//.test(deploy);
  assert.ok(copies, "deploy.yml ne copie plus manifest.json/_headers/icônes dans dist/");
  const existe = (rel) => fs.existsSync(path.join(RACINE, rel));
  const sources = {
    "/": () => existe("index.html"),
    "/index.html": () => existe("index.html"),
    "/sw.js": () => existe("sw.js") && /sw\.js/.test(build),
    "/release.json": () => /release\.json/.test(build),
    "/manifest.json": () => existe("manifest.json"),
    "/icon-192.png": () => existe("icon-192.png"),
    "/icon-512.png": () => existe("icon-512.png"),
    "/styles.css": () => existe("styles.css"),
    "/app/*": () => /"app\/" \+ nom/.test(build),
    "/pilotage/*": () => existe("pilotage/index.html"),
    "/pilotage/manifest.webmanifest": () => existe("pilotage/manifest.webmanifest"),
        "/data/passions-v1.json": () => existe("data/passions-v1.json"),
    "/*": () => true,
  };
  for (const chemin of Object.keys(regles)) {
    assert.ok(sources[chemin], `_headers : règle ${chemin} sans source connue — route morte, ou à inscrire ici`);
    assert.ok(sources[chemin](), `_headers : ${chemin} ne correspond plus à rien dans dist/`);
  }
  // js/vendor/ et fonts/ restent SANS cache long : Netlify y garderait un 404 (retour
  // arrière après une montée de version) et leurs chargeurs n'ont pas la reprise
  // `cache: "reload"` des scripts app/. Fiche : docs/journal/partage-liens-invitation.md (2026-11-15).
  for (const c of ["/js/vendor/*", "/fonts/*"]) assert.equal(regles[c], undefined, `${c} : cache long sans reprise du 404`);
  // Le manifeste du pilotage, nommé par sa page, est bien celui que vise la règle.
  const page = fs.readFileSync(path.join(RACINE, "pilotage", "index.html"), "utf8");
  assert.match(page, /rel="manifest" href="[^"]*manifest\.webmanifest"/);
  assert.match((regles["/pilotage/manifest.webmanifest"] || {})["Content-Type"] || "", /^application\/manifest\+json/);
});
