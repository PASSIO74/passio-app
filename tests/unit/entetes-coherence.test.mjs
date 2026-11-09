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
