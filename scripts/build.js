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
//    passion-context.js ferme le bloc : il s'exécute APRÈS la définition de
//    state/currentProfile et peut donc observer la persona active sans toucher
//    aux gros fichiers app-*.
const startMark = html.indexOf("<!-- BUILD:APP-START");
const endMark = html.indexOf("<!-- BUILD:APP-END -->");
if (startMark === -1 || endMark === -1) throw new Error("Marqueurs BUILD:APP introuvables");
const appBlock = html.slice(startMark, endMark + "<!-- BUILD:APP-END -->".length);
const appFiles = [...appBlock.matchAll(/<script src="(js\/app-[^"]+)"><\/script>/g)].map(m => m[1]);
if (appFiles.length !== 9) throw new Error(`9 fichiers app attendus, trouvé ${appFiles.length}`);
const EMOJI_TAG = '<script src="js/emoji-misc.js"></script>';
if (!html.includes(EMOJI_TAG)) throw new Error("Tag emoji-misc.js introuvable (attendu après le bloc app)");
const appJs = appFiles.map(read).join("") + "\n" + read("js/emoji-misc.js") + "\n" + read("js/passion-context.js");
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
  + '    s.addEventListener("load", function () {\n'
  + '      window.dispatchEvent(new Event("passio:app-ready"));\n'
  + '    }, { once: true });\n'
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
html = html.replace(EMOJI_TAG, "<!-- emoji-misc.js + passion-context.js : inclus dans app.js -->");

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

// 3. Contrat de release — UNE identité commune au navigateur, au cockpit et à
//    Sentinel. Le buildId ne dépend PAS d'un timestamp : deux builds des mêmes
//    sources produisent le même identifiant. Le commit est une preuve additionnelle
//    quand Netlify/GitHub la fournit, jamais une valeur inventée en local.
const commitRef = process.env.COMMIT_REF || process.env.GITHUB_SHA || null;
const buildId = crypto.createHash("sha1")
  .update(html).update("\0").update(appJs).update("\0").update(css)
  .digest("hex").slice(0, 12);
const release = {
  schema: 1,
  buildId,
  appHash,
  cssHash,
  commit: commitRef,
  builtAt: process.env.PASSIO_BUILD_TIME || null,
};

// Les gardes sont chargés juste après telemetry.js :
// - identity-transition observe les POST telemetry_events avant le bloc app ;
// - release-guard connaît déjà PASSIO_RELEASE au moment de son initialisation.
const TELEMETRY_TAG = '  <script src="js/telemetry.js"></script>';
if (!html.includes(TELEMETRY_TAG)) throw new Error("Tag telemetry.js introuvable");
const releaseBootstrap = '  <script>window.PASSIO_RELEASE=' + JSON.stringify(release).replace(/</g, "\\u003c") + ';</script>';
html = html.replace(TELEMETRY_TAG,
  releaseBootstrap + "\n" + TELEMETRY_TAG + "\n"
  + '  <script src="js/identity-transition.js"></script>\n'
  + '  <script src="js/release-guard.js"></script>');

// 4. Scripts individuels restants (uniquement src="js/…")
html = html.replace(/^([ \t]*)<script src="(js\/[^"]+)"><\/script>$/gm,
  (m, indent, file) => indent + "<script>\n" + read(file) + indent + "</script>");

// 5. Service worker : même buildId que le contrat de release. Une modif réelle
//    change cet identifiant → dist/sw.js change → le navigateur réinstalle le SW.
//    Le contrat et le cache parlent ainsi EXACTEMENT de la même release.
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
fs.writeFileSync(path.join(path.dirname(outPath), "release.json"), JSON.stringify(release, null, 2) + "\n");
console.log("Build OK →", outPath,
  "(", Buffer.byteLength(html), "octets ) + app.js (", Buffer.byteLength(appJs),
  "octets, v=" + appHash + ") + styles.css (", Buffer.byteLength(css),
  "octets, v=" + cssHash + ") + sw.js + release.json (build " + buildId + ")");
