// Build PASSIO : ré-assemble index.html (dev, fichiers séparés) pour la production.
// Depuis le 2026-07-03, le bloc app (9 fichiers + emoji-misc, ~1,1 Mo) n'est PLUS
// inline : il devient dist/app.js, injecté par un petit loader UNE FOIS le gate
// franchi (window.__gateReady). La page verrouillée — celle que voient les nouveaux
// visiteurs et Lighthouse — n'a quasi plus de JS applicatif à compiler (TBT ÷ ~3).
// Session déjà déverrouillée : __gateReady est résolue → injection immédiate.
// Usage : node scripts/build.js [dist/index.html]
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const outPath = process.argv[2] || path.join(root, "dist", "index.html");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// 1. Bloc app : les 9 fichiers entre les marqueurs + emoji-misc (qui doit garder
//    son ordre APRÈS le bloc app) sont concaténés dans dist/app.js (hoisting
//    préservé sur tout le bloc, comme avant). pwa-landing.js reste inline : il ne
//    dépend que de pwa-detect (head) et son listener `load` mourrait si différé.
const startMark = html.indexOf("<!-- BUILD:APP-START");
const endMark = html.indexOf("<!-- BUILD:APP-END -->");
if (startMark === -1 || endMark === -1) throw new Error("Marqueurs BUILD:APP introuvables");
const appBlock = html.slice(startMark, endMark + "<!-- BUILD:APP-END -->".length);
const appFiles = [...appBlock.matchAll(/<script src="(js\/app-[^"]+)"><\/script>/g)].map(m => m[1]);
if (appFiles.length !== 9) throw new Error(`9 fichiers app attendus, trouvé ${appFiles.length}`);
const EMOJI_TAG = '<script src="js/emoji-misc.js"></script>';
if (!html.includes(EMOJI_TAG)) throw new Error("Tag emoji-misc.js introuvable (attendu après le bloc app)");
const appJs = appFiles.map(read).join("") + "\n" + read("js/emoji-misc.js");
const appHash = crypto.createHash("sha1").update(appJs).digest("hex").slice(0, 10);
const appRef = "app.js?v=" + appHash; // cache-busting par contenu (cf. _headers : /app.js immutable)
const loader = ""
  + "<script>\n"
  + "/* Bloc app externalisé : parsé/exécuté SEULEMENT après le gate. Pas de\n"
  + "   preload statique (il concurrençait le HTML/CSS critiques sur mobile et\n"
  + "   polluait les métriques LCP) : prefetch basse priorité à la PREMIÈRE frappe\n"
  + "   dans le champ code — le fichier est en cache HTTP quand le 4e chiffre\n"
  + "   déverrouille. */\n"
  + "(function () {\n"
  + "  (window.__gateReady || Promise.resolve()).then(function () {\n"
  + '    var s = document.createElement("script");\n'
  + `    s.src = "${appRef}";\n`
  + "    document.body.appendChild(s);\n"
  + "  });\n"
  + '  if (document.documentElement.classList.contains("passio-locked")) {\n'
  + '    document.addEventListener("input", function () {\n'
  + '      var l = document.createElement("link");\n'
  + '      l.rel = "prefetch"; l.as = "script"; l.href = "' + appRef + '";\n'
  + "      document.head.appendChild(l);\n"
  + "    }, { once: true, capture: true });\n"
  + "  }\n"
  + "})();\n"
  + "</script>";
html = html.slice(0, startMark) + loader + html.slice(endMark + "<!-- BUILD:APP-END -->".length);
html = html.replace(EMOJI_TAG, "<!-- emoji-misc.js : inclus dans app.js -->");

// 2. CSS : EXTERNALISÉ dans dist/styles.css (avant le 2026-07-15 : inline dans le
//    HTML). index.html est servi en no-store → les ~230 Ko de CSS inline étaient
//    re-téléchargés À CHAQUE visite. Externalisé avec cache-busting par contenu
//    (?v=<hash>, cf. _headers : /styles.css immutable), il n'est téléchargé qu'une
//    fois par version — et le <link> reste dans les premiers octets du HTML, donc
//    découvert immédiatement par le preload-scanner (pas de flash sans style).
const CSS_TAG = '  <link rel="stylesheet" href="styles.css" />';
if (!html.includes(CSS_TAG)) throw new Error("Tag <link styles.css> introuvable dans index.html");
const css = read("styles.css");
const cssHash = crypto.createHash("sha1").update(css).digest("hex").slice(0, 10);
const cssRef = "styles.css?v=" + cssHash;
html = html.replace(CSS_TAG, '  <link rel="stylesheet" href="' + cssRef + '" />');

// 3. Scripts individuels restants (uniquement src="js/…")
html = html.replace(/^([ \t]*)<script src="(js\/[^"]+)"><\/script>$/gm,
  (m, indent, file) => indent + "<script>\n" + read(file) + indent + "</script>");

// 4. Service worker : bump AUTOMATIQUE de la version de cache à partir d'une
//    signature du build (HTML final inline-CSS compris + app.js). Toute modif
//    réelle change ce hash → les octets de dist/sw.js changent → le navigateur
//    réinstalle le SW → les PWA déjà ouvertes se rechargent seules. Fini le
//    « BUILD-BUMP » manuel à oublier. (En dev sans build, sw.js garde Date.now().)
const buildId = crypto.createHash("sha1").update(html + appJs).digest("hex").slice(0, 12);
let sw = read("sw.js");
const swBefore = sw;
sw = sw.replace(/const CACHE = "passio-v"\s*\+\s*Date\.now\(\);/,
  `const CACHE = "passio-v${buildId}"; // auto-bump build`);
if (sw === swBefore) throw new Error("Ligne CACHE de sw.js introuvable — auto-bump SW cassé");

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
fs.writeFileSync(path.join(path.dirname(outPath), "app.js"), appJs);
fs.writeFileSync(path.join(path.dirname(outPath), "styles.css"), css);
fs.writeFileSync(path.join(path.dirname(outPath), "sw.js"), sw);
console.log("Build OK →", outPath, "(", Buffer.byteLength(html), "octets ) + app.js (", Buffer.byteLength(appJs), "octets, v=" + appHash + ") + styles.css (", Buffer.byteLength(css), "octets, v=" + cssHash + ") + sw.js (cache passio-v" + buildId + ")");
