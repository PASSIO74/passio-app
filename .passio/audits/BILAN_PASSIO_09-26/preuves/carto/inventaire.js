// Inventaire reproductible — BILAN PASSIO 09/26, domaine carto.
// Usage : node inventaire.js  (cwd = racine du dépôt)  → écrit inventaire.json + affiche un résumé.
"use strict";
const fs = require("fs");
const path = require("path");
const RACINE = process.cwd();
const OUT = path.join(__dirname, "inventaire.json");
const read = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");

const html = read("index.html");
const ATTRS = ["onclick", "onchange", "oninput", "onsubmit", "onkeyup", "onkeydown", "onblur", "onfocus"];
const APPEL = /(^|[^.\w$])(?:(window|[A-Z][\w$]*)\s*\.\s*)?([A-Za-z_$][\w$]*)\s*\(/g;
const NON_APP = new Set(["if","for","while","switch","catch","return","typeof","function","new","delete","void","in","of","do","else","try","alert","confirm","prompt","setTimeout","setInterval","parseInt","parseFloat","Number","String","Boolean","Array","Object","JSON","Math","Date","RegExp","Promise","encodeURIComponent","decodeURIComponent","$","$$"]);

function handlers(src) {
  const out = [];
  for (const attr of ATTRS) {
    const re = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "gi");
    let m;
    while ((m = re.exec(src))) out.push({ attr, code: m[1] !== undefined ? m[1] : m[2] });
  }
  return out;
}
function fonctionsAppelees(code) {
  const s = new Set();
  let m;
  APPEL.lastIndex = 0;
  while ((m = APPEL.exec(code))) {
    const ns = m[2], f = m[3];
    if (NON_APP.has(f)) continue;
    if (ns && ns !== "window") { s.add(ns + "." + f); continue; }
    if (!ns && m[1] === "." ) continue;
    s.add(f);
  }
  return [...s];
}
function compte(src, re) { return (src.match(re) || []).length; }
function formulaire(src) {
  return {
    input: compte(src, /<input\b/gi),
    textarea: compte(src, /<textarea\b/gi),
    select: compte(src, /<select\b/gi),
    button: compte(src, /<button\b/gi),
    roleButton: compte(src, /role="button"/gi),
  };
}

// ---------- 1. Écrans (index.html) ----------
const secRe = /<section[^>]*id="screen-([a-z]+)"[^>]*>/g;
const sections = [];
let m;
while ((m = secRe.exec(html))) sections.push({ id: m[1], start: m.index });
const mainEnd = html.indexOf("</main>");
const ecrans = sections.map((s, i) => {
  const end = i + 1 < sections.length ? sections[i + 1].start : mainEnd;
  const src = html.slice(s.start, end);
  const h = handlers(src);
  const parAttr = {};
  for (const x of h) parAttr[x.attr] = (parAttr[x.attr] || 0) + 1;
  const fns = new Set();
  for (const x of h) fonctionsAppelees(x.code).forEach((f) => fns.add(f));
  const ids = [...src.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]);
  const ligne = html.slice(0, s.start).split("\n").length;
  return { ecran: s.id, ligne, lignes: src.split("\n").length, handlers: h.length, parAttr, fonctions: [...fns].sort(), formulaire: formulaire(src), ids: ids.length, idsListe: ids };
});
// Hors écrans : avant <main> (landing, onboarding, topbar) et après </main> (nav, modals, panneaux)
const mainStart = html.indexOf("<main");
const zones = { avantMain: html.slice(0, mainStart), apresMain: html.slice(mainEnd) };
const horsEcrans = {};
for (const [k, src] of Object.entries(zones)) {
  const h = handlers(src);
  const fns = new Set();
  for (const x of h) fonctionsAppelees(x.code).forEach((f) => fns.add(f));
  horsEcrans[k] = { handlers: h.length, fonctions: [...fns].sort(), formulaire: formulaire(src) };
}
const modalesHtml = [...html.matchAll(/\bid="((?:modal|v\d+\w*Sheet|conv-fullpage|convSettingsPanel|convFilesPanel|convEmojiPanel|passionManager|irlFiltersPanel|reelCommentsPanel|tourOverlay|devPanel|landing\w*|onboarding\w*|gate\w*|pwa\w*|notif\w*Panel|\w*Overlay|\w*Sheet|\w*Panel)[^"]*)"/g)].map((x) => x[1]);
const htmlHandlersTotal = handlers(html).length;

// ---------- 2. JS ----------
const jsFiles = fs.readdirSync(path.join(RACINE, "js")).filter((f) => f.endsWith(".js")).sort();
const chargesIndex = [...html.matchAll(/<script src="js\/([^"]+)"/g)].map((x) => x[1]);
const fichiers = {};
const tables = {};
const rpcs = {};
const buckets = {};
const edge = {};
const urls = {};
const storageKeys = {};
const canaux = {};
const fnGlobales = {};
let totalFn = 0, totalHandlersJs = 0;
const handlersJsParAttr = {};
const interactionsJs = new Set();
for (const f of jsFiles) {
  const src = read("js/" + f);
  const lignes = src.split("\n").length;
  const fnTop = [...src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((x) => x[1]);
  const winAssign = [...src.matchAll(/^\s*window\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/gm)].map((x) => x[1]);
  const winAssignAll = [...src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map((x) => x[1]);
  for (const n of fnTop) { (fnGlobales[n] = fnGlobales[n] || []).push(f); }
  totalFn += fnTop.length;
  const h = handlers(src);
  totalHandlersJs += h.length;
  const pa = {};
  for (const x of h) { pa[x.attr] = (pa[x.attr] || 0) + 1; handlersJsParAttr[x.attr] = (handlersJsParAttr[x.attr] || 0) + 1; fonctionsAppelees(x.code).forEach((n) => interactionsJs.add(n)); }
  const t = [...src.matchAll(/\.from\(\s*["'`]([A-Za-z_]+)["'`]\s*\)/g)].map((x) => x[1]);
  const tset = {};
  for (const x of t) tset[x] = (tset[x] || 0) + 1;
  for (const [tb, n] of Object.entries(tset)) { (tables[tb] = tables[tb] || {})[f] = n; }
  const r = [...src.matchAll(/\.rpc\(\s*["'`]([A-Za-z_]+)["'`]/g)].map((x) => x[1]);
  for (const x of r) (rpcs[x] = rpcs[x] || new Set()).add(f);
  const b = [...src.matchAll(/storage\s*\.from\(\s*["'`]([A-Za-z_-]+)["'`]/g)].map((x) => x[1]);
  for (const x of b) (buckets[x] = buckets[x] || new Set()).add(f);
  const e = [...src.matchAll(/functions\/v1\/([a-z-]+)|functions\.invoke\(\s*["'`]([a-z-]+)["'`]/g)].map((x) => x[1] || x[2]);
  for (const x of e) (edge[x] = edge[x] || new Set()).add(f);
  const u = [...src.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?/gi)].map((x) => x[1].toLowerCase());
  for (const x of u) (urls[x] = urls[x] || new Set()).add(f);
  const ks = [...src.matchAll(/(localStorage|sessionStorage)\s*(?:\.(?:getItem|setItem|removeItem)\(\s*|\[\s*)["'`]([^"'`]+)["'`]/g)].map((x) => x[1] + ":" + x[2]);
  for (const x of ks) (storageKeys[x] = storageKeys[x] || new Set()).add(f);
  const ch = [...src.matchAll(/\.channel\(\s*["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
  for (const x of ch) (canaux[x] = canaux[x] || new Set()).add(f);
  fichiers[f] = { lignes, charge: chargesIndex.includes(f), fnTopLevel: fnTop.length, windowAssignFn: winAssign.length, windowAssignTotal: new Set(winAssignAll).size, handlers: h.length, parAttr: pa, tables: Object.keys(tset).sort(), rpc: [...new Set(r)], storageKeys: [...new Set(ks)].length, hosts: [...new Set(u)] };
}
// Doublons de nom top-level
const doublons = Object.entries(fnGlobales).filter(([, l]) => l.length > 1);
// sw.js
const sw = read("sw.js");
const swUrls = [...sw.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)].map((x) => x[1]);
// edge functions
const edgeDir = path.join(RACINE, "supabase", "functions");
const edgeFns = fs.existsSync(edgeDir) ? fs.readdirSync(edgeDir).filter((d) => fs.statSync(path.join(edgeDir, d)).isDirectory()) : [];
const edgeTables = {};
for (const d of edgeFns) {
  const files = fs.readdirSync(path.join(edgeDir, d)).filter((x) => x.endsWith(".ts"));
  const src = files.map((x) => fs.readFileSync(path.join(edgeDir, d, x), "utf8")).join("\n");
  edgeTables[d] = { fichiers: files, tables: [...new Set([...src.matchAll(/\.from\(\s*["'`]([A-Za-z_]+)["'`]/g)].map((x) => x[1]))], hosts: [...new Set([...src.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)].map((x) => x[1]))] };
}

const setToArr = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].sort()]));
const inv = {
  sha: "c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf",
  index: { lignes: html.split("\n").length, ecrans: ecrans.length, handlersTotal: htmlHandlersTotal, modales: [...new Set(modalesHtml)], scriptsCharges: chargesIndex },
  ecrans, horsEcrans,
  js: { fichiers: jsFiles.length, charges: chargesIndex.length, nonChargesParIndex: jsFiles.filter((f) => !chargesIndex.includes(f)), fnTopLevelTotal: totalFn, handlersTotal: totalHandlersJs, handlersParAttr: handlersJsParAttr, interactionsDistinctesJs: interactionsJs.size, parFichier: fichiers, doublonsNomTopLevel: doublons },
  tables: Object.fromEntries(Object.entries(tables).sort()), rpc: setToArr(rpcs), buckets: setToArr(buckets), edgeAppelees: setToArr(edge), hosts: setToArr(urls), storageKeys: setToArr(storageKeys), canauxRealtime: setToArr(canaux),
  sw: { lignes: sw.split("\n").length, hosts: [...new Set(swUrls)] }, edgeFunctions: edgeTables,
};
fs.writeFileSync(OUT, JSON.stringify(inv, null, 2));
console.log("index.html :", inv.index.lignes, "lignes ;", inv.index.ecrans, "écrans ;", inv.index.handlersTotal, "handlers inline ; scripts chargés :", chargesIndex.length);
for (const e of ecrans) console.log(`  screen-${e.ecran} (l.${e.ligne}, ${e.lignes} l.) handlers=${e.handlers} ${JSON.stringify(e.parAttr)} fn=${e.fonctions.length} form=${JSON.stringify(e.formulaire)}`);
for (const [k, v] of Object.entries(horsEcrans)) console.log(`  ${k}: handlers=${v.handlers} fn=${v.fonctions.length} form=${JSON.stringify(v.formulaire)}`);
console.log("js/ :", jsFiles.length, "fichiers ;", "fn top-level =", totalFn, "; handlers dans templates =", totalHandlersJs, JSON.stringify(handlersJsParAttr), "; interactions distinctes (js) =", interactionsJs.size);
console.log("non chargés par index.html :", inv.js.nonChargesParIndex.join(", "));
console.log("doublons de nom top-level :", doublons.length, JSON.stringify(doublons));
console.log("tables .from() :", Object.keys(tables).length, Object.keys(tables).sort().join(", "));
console.log("rpc :", JSON.stringify(inv.rpc));
console.log("buckets :", JSON.stringify(inv.buckets));
console.log("edge :", JSON.stringify(inv.edgeAppelees));
console.log("hosts :", Object.keys(urls).sort().join(", "));
console.log("storage keys :", Object.keys(storageKeys).length);
console.log("canaux realtime :", Object.keys(canaux).length);
console.log("edge functions :", JSON.stringify(edgeTables));
