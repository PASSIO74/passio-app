#!/usr/bin/env node
// Audit statique des handlers inline (mission 1a) — re-exécutable à volonté.
// Extrait tous les on<event>="..." de index.html ET des template literals /
// chaînes des fichiers js/*.js, puis vérifie que chaque fonction appelée est
// bien définie quelque part (function/var/window.* …).
// Sortie : liste des fonctions fantômes (appelées mais jamais définies).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const files = ["index.html", ...fs.readdirSync(path.join(ROOT, "js")).filter(f => f.endsWith(".js")).map(f => "js/" + f)];
const sources = {};
for (const f of files) sources[f] = fs.readFileSync(path.join(ROOT, f), "utf8");

// ── 1. Collecte des définitions globales ──
const defined = new Set();
const defPatterns = [
  /function\s+([A-Za-z_$][\w$]*)\s*\(/g,            // function foo(
  /window\.([A-Za-z_$][\w$]*)\s*=/g,                 // window.foo =
  /(?:^|[\r\n;])\s*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g, // var foo = function / arrow
];
for (const f of files) {
  for (const re of defPatterns) {
    let m; re.lastIndex = 0;
    while ((m = re.exec(sources[f]))) defined.add(m[1]);
  }
}
// Globals du navigateur / de l'app non détectés par les patterns
["alert", "confirm", "prompt", "fetch", "open", "print", "Date", "String", "Number",
 "Boolean", "Array", "Object", "JSON", "Math", "parseInt", "parseFloat", "isNaN",
 "encodeURIComponent", "decodeURIComponent", "setTimeout", "setInterval",
 "clearTimeout", "clearInterval", "requestAnimationFrame", "getComputedStyle",
 "scrollTo", "scrollBy", "Audio", "Blob", "File", "FileReader", "FormData",
 "URLSearchParams", "URL", "Promise", "Error", "RegExp", "Event", "CustomEvent",
 "stopPropagation", "preventDefault", "if", "for", "while", "switch", "return",
 "typeof", "void", "catch", "function",
 // Fonctions CSS dans les assignations de style (this.style.background='linear-gradient(…rgba(…)')
 "gradient", "rgba", "rgb", "hsl", "hsla", "calc", "var", "url",
 "translate", "translateX", "translateY", "scale", "rotate"].forEach(k => defined.add(k));

// ── 2. Extraction des handlers inline ──
const EVENTS = "click|input|change|mousedown|mouseup|touchstart|touchend|submit|keydown|keyup|focus|blur|load|error|scroll|dblclick|contextmenu|mouseover|mouseout|ended|canplay|timeupdate|play|pause";
const handlerRe = new RegExp(`\\bon(?:${EVENTS})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\\\"([^\\\\"]*)\\\\")`, "gi");
// Appels de fonction dans un handler : nom( — mais pas .methode( ni mot-clé
const callRe = /(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
const KEYWORDS = new Set(["if", "for", "while", "switch", "return", "function", "catch", "typeof", "void", "new", "in", "of", "else", "do", "this", "event"]);

const phantoms = new Map(); // fn -> [where...]
let totalHandlers = 0, totalCalls = 0;
for (const f of files) {
  let m; handlerRe.lastIndex = 0;
  while ((m = handlerRe.exec(sources[f]))) {
    const body = (m[1] || m[2] || m[3] || "");
    totalHandlers++;
    let c; callRe.lastIndex = 0;
    while ((c = callRe.exec(body))) {
      const fn = c[2];
      if (KEYWORDS.has(fn) || defined.has(fn)) { totalCalls++; continue; }
      totalCalls++;
      const line = sources[f].slice(0, m.index).split("\n").length;
      if (!phantoms.has(fn)) phantoms.set(fn, []);
      const locs = phantoms.get(fn);
      if (locs.length < 5) locs.push(`${f}:${line}`);
    }
  }
}

console.log(`Handlers inline analysés : ${totalHandlers} (dans ${files.length} fichiers)`);
console.log(`Appels de fonction vérifiés : ${totalCalls}`);
console.log(`Définitions globales recensées : ${defined.size}`);
if (phantoms.size === 0) {
  console.log("\n✅ AUCUNE fonction fantôme : tous les handlers inline référencent des fonctions définies.");
  process.exit(0);
} else {
  console.log(`\n❌ ${phantoms.size} fonction(s) fantôme(s) :`);
  for (const [fn, locs] of phantoms) console.log(`  - ${fn}()  ← ${locs.join(", ")}`);
  process.exit(1);
}
