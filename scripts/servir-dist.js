// ═══════════════════════════════════════════════════════════════════════════
// SERVEUR « ARTEFACT DE PRODUCTION » — fait tourner la suite e2e sur ce qui
// part réellement chez l'utilisateur.
//
// LE PROBLÈME QU'IL RÉSOUT (mesuré le 2026-08-16)
// En développement, l'app est 19 fichiers JS chargés séparément. En production,
// `scripts/build.js` en assemble un monolithe (`dist/app.js`) injecté après le
// gate, puis la CI le minifie. Ce sont deux programmes.
//
// Or, sur 175 tests, TROIS seulement visaient `/dist/index.html` — et ces trois
// ne vérifient que le gate et le démarrage. Le fil, la publication, la
// messagerie, les commentaires, la confidentialité : tout était prouvé sur le
// programme de développement, aucun sur l'artefact déployé.
//
// LA MÉTHODE : ne toucher AUCUN test.
// Les 30 `page.goto("/index.html")` restent tels quels ; c'est la RACINE servie
// qui change. Avec `PASSIO_CIBLE=dist`, `/index.html` est le fichier construit.
// Même règle que `serve-couverture.js` : un test modifié pour une mesure ne
// mesure plus le même programme.
//
//   PASSIO_CIBLE=dist npx playwright test
//
// Ce que ça prouve : que la suite passe sur l'artefact assemblé — ordre de
// concaténation, complétude du build, externalisation de `app.js` derrière le
// gate. Ce que ça ne prouve PAS : le comportement APRÈS minification, que seule
// la CI applique (`html-minifier-terser`). Le minifieur renomme les identifiants
// — un piège déjà rencontré en vérifiant la prod.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const RACINE = path.join(__dirname, "..");
const DIST = path.join(RACINE, "dist");
const PORT = Number(process.env.PASSIO_PORT || 8080);

// Assets que la CI recopie à côté du build (workflow « Build dist »). Sans eux,
// `/manifest.json` renvoie 404 et les specs PWA échouent pour une raison qui
// n'a rien à voir avec le code testé.
const ASSETS = ["manifest.json", "_headers", "icon-192.png", "icon-512.png"];

function construire() {
  execFileSync(process.execPath, ["scripts/build.js", "dist/index.html"], {
    cwd: RACINE, stdio: "inherit", timeout: 120000,
  });
  for (const a of ASSETS) {
    const src = path.join(RACINE, a);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, a));
  }
  // Un build muet qui laisse un dist vide donnerait 175 rouges illisibles. Mieux
  // vaut échouer ici, avec la raison.
  for (const f of ["index.html", "app.js", "styles.css"]) {
    const p = path.join(DIST, f);
    if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
      throw new Error(`build incomplet : dist/${f} absent ou vide`);
    }
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".webm": "video/webm",
};

construire();

const serveur = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
  // `dist-build.spec.js` vise explicitement `/dist/index.html`. Sous cette
  // racine le préfixe ferait un doublon : on l'absorbe pour que ce spec, qui
  // teste précisément l'artefact, continue de passer sans être modifié.
  if (rel === "/dist" || rel.startsWith("/dist/")) rel = rel.slice(5) || "/";
  if (rel === "/" || rel.endsWith("/")) rel += "index.html";

  const abs = path.join(DIST, path.normalize(rel).replace(/^([/\\])+/, ""));
  if (!abs.startsWith(DIST)) return res.writeHead(403).end("hors racine");

  fs.readFile(abs, (err, buf) => {
    if (err) return res.writeHead(404).end("introuvable");
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
      "Content-Length": buf.length,
      "Cache-Control": "no-store",
    }).end(buf);
  });
});

serveur.listen(PORT, "127.0.0.1", () => {
  const t = fs.statSync(path.join(DIST, "app.js")).size;
  console.log(`Artefact de production servi sur http://127.0.0.1:${PORT} — app.js ${t} octets`);
});
