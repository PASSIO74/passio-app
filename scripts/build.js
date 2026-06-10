// Build PASSIO : ré-assemble index.html (dev, fichiers séparés) en un index.html
// monolithique pour la production — strictement identique à l'ancien format.
// Usage : node scripts/build.js [dist/index.html]
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outPath = process.argv[2] || path.join(root, "dist", "index.html");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// 1. Bloc app : les 9 fichiers entre les marqueurs deviennent UN SEUL <script>
//    (préserve le hoisting des fonctions sur tout le bloc, comme avant le découpage)
const startMark = html.indexOf("<!-- BUILD:APP-START");
const endMark = html.indexOf("<!-- BUILD:APP-END -->");
if (startMark === -1 || endMark === -1) throw new Error("Marqueurs BUILD:APP introuvables");
const appBlock = html.slice(startMark, endMark + "<!-- BUILD:APP-END -->".length);
const appFiles = [...appBlock.matchAll(/<script src="(js\/app-[^"]+)"><\/script>/g)].map(m => m[1]);
if (appFiles.length !== 9) throw new Error(`9 fichiers app attendus, trouvé ${appFiles.length}`);
const appConcat = appFiles.map(read).join("");
html = html.slice(0, startMark) + "<script>\n" + appConcat + "</script>" + html.slice(endMark + "<!-- BUILD:APP-END -->".length);

// 2. CSS
html = html.replace(
  '  <link rel="stylesheet" href="styles.css" />',
  () => "  <style>\n" + read("styles.css") + "  </style>"
);

// 3. Scripts individuels restants (uniquement src="js/…")
html = html.replace(/^([ \t]*)<script src="(js\/[^"]+)"><\/script>$/gm,
  (m, indent, file) => indent + "<script>\n" + read(file) + indent + "</script>");

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log("Build OK →", outPath, "(", Buffer.byteLength(html), "octets )");
