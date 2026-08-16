// ═══════════════════════════════════════════════════════════════════════════
// SERVEUR DE COUVERTURE — sert l'app à l'identique, plus un enregistreur.
//
// Pourquoi un serveur et pas une modification des specs : mesurer la couverture
// ne doit RIEN changer aux tests. Aucun fichier de `tests/` n'est touché, aucune
// assertion n'est déplacée. L'instrumentation est injectée à la volée dans la
// réponse HTTP, uniquement quand on lance la mesure ; sans elle, la suite tourne
// sur `http-server` comme avant, octet pour octet.
//
// Ce qu'on mesure exactement : « la fonction atteignable par ce geste a-t-elle
// été exécutée pendant la suite ». Pas « un test clique sur ce bouton ». Une
// fonction appelée depuis une autre compte donc comme exercée — c'est voulu :
// le code a bien tourné, et prétendre le contraire demanderait de distinguer
// l'origine de l'appel, ce qu'aucune pile JS ne donne de façon fiable.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { extraire } = require("./couverture-interactions.js");

const RACINE = path.join(__dirname, "..");
const SORTIE = path.join(RACINE, ".passio", "couverture", "observe.json");
const PORT = Number(process.env.PASSIO_COUVERTURE_PORT || 8080);

const NOMS = extraire().interactions;
const vues = new Set();

// ─── Chargement d'une mesure précédente ─────────────────────────────────────
// Playwright relance parfois le serveur (reuseExistingServer, shards). Repartir
// d'un ensemble vide effacerait silencieusement la moitié de la mesure.
try {
  const p = JSON.parse(fs.readFileSync(SORTIE, "utf8"));
  if (process.env.PASSIO_COUVERTURE_CUMUL === "1" && Array.isArray(p.vues)) {
    for (const n of p.vues) vues.add(n);
  }
} catch { /* première exécution */ }

function ecrire() {
  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, JSON.stringify({
    genere_le: new Date().toISOString(),
    total: NOMS.length,
    observees: vues.size,
    vues: [...vues].sort(),
  }, null, 1));
}

// ─── Enregistreur injecté ───────────────────────────────────────────────────
// Enveloppe chaque nom en préservant `this`, les arguments et la valeur de
// retour. Réappliqué plusieurs fois : certains scripts définissent tard, et une
// enveloppe déjà posée est reconnue (drapeau) donc jamais empilée deux fois.
function enregistreur() {
  return `<script>(function(){
  var NOMS = ${JSON.stringify(NOMS)};
  var vus = Object.create(null);
  function cible(nom){
    var p = nom.split(".");
    if (p.length === 1) return { hote: window, cle: p[0] };
    var h = window[p[0]];
    return h ? { hote: h, cle: p[1] } : null;
  }
  function poser(){
    for (var i=0;i<NOMS.length;i++){
      var nom = NOMS[i], c = cible(nom);
      if (!c) continue;
      var f = c.hote[c.cle];
      if (typeof f !== "function" || f.__covWrap) continue;
      (function(nom, hote, cle, orig){
        function w(){ vus[nom] = 1; return orig.apply(this, arguments); }
        w.__covWrap = 1;
        try { hote[cle] = w; } catch(e){}
      })(nom, c.hote, c.cle, f);
    }
  }
  function envoyer(){
    var l = Object.keys(vus);
    if (!l.length) return;
    try {
      var b = JSON.stringify(l);
      if (navigator.sendBeacon) navigator.sendBeacon("/__cov", new Blob([b], {type:"text/plain"}));
      else fetch("/__cov", { method:"POST", body:b, keepalive:true });
    } catch(e){}
  }
  poser();
  document.addEventListener("DOMContentLoaded", poser);
  window.addEventListener("load", poser);
  [200, 800, 2000, 5000].forEach(function(d){ setTimeout(poser, d); });
  setInterval(envoyer, 1200);
  window.addEventListener("pagehide", envoyer);
  document.addEventListener("visibilitychange", function(){ if (document.hidden) envoyer(); });
})();</script>`;
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".webm": "video/webm",
};

const serveur = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/__cov") {
    let corps = "";
    req.on("data", (c) => { corps += c; if (corps.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try {
        const l = JSON.parse(corps);
        let neuf = false;
        for (const n of l) if (!vues.has(n)) { vues.add(n); neuf = true; }
        // Écriture à chaque nouveauté : Playwright tue le serveur sans lui
        // laisser exécuter un gestionnaire de sortie sous Windows. Attendre la
        // fin, c'est perdre la mesure au moment précis où elle est complète.
        if (neuf) ecrire();
      } catch { /* corps illisible : on ignore, on n'invente pas */ }
      res.writeHead(204).end();
    });
    return;
  }

  let rel = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
  if (rel === "/" || rel.endsWith("/")) rel += "index.html";
  const abs = path.join(RACINE, path.normalize(rel).replace(/^([/\\])+/, ""));
  if (!abs.startsWith(RACINE)) return res.writeHead(403).end("hors racine");

  fs.readFile(abs, (err, buf) => {
    if (err) return res.writeHead(404).end("introuvable");
    const ext = path.extname(abs).toLowerCase();
    const entetes = { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" };
    if (ext === ".html") {
      let html = buf.toString("utf8");
      // En fin de <body> : après les app-*.js, donc les globales existent déjà.
      html = html.includes("</body>")
        ? html.replace("</body>", enregistreur() + "</body>")
        : html + enregistreur();
      buf = Buffer.from(html, "utf8");
    }
    entetes["Content-Length"] = buf.length;
    res.writeHead(200, entetes).end(buf);
  });
});

serveur.listen(PORT, "127.0.0.1", () => {
  console.log(`Couverture : serveur instrumenté sur http://127.0.0.1:${PORT} — ${NOMS.length} interactions suivies`);
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { ecrire(); process.exit(0); });
