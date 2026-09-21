#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// MESURE — version légère des photos de publication (2026-09-21)
//
// Sur de VRAIES photos servies par le CDN de production (lecture publique,
// aucune écriture), dans un Chromium Playwright, avec LA fonction du produit
// (`_imageLegerePourFil`, extraite d'app-08 — jamais une copie) :
//   · octets de la grande telle que stockée (ce qu'une grille/un album
//     téléchargeait) ;
//   · octets de la transformation d'image à 700 px / q75 (ce que le fil
//     téléchargeait, et ce qui compte au quota « Image Transformations ») ;
//   · octets de la légère produite (ce que fil, détail, grilles et albums
//     téléchargeront pour une photo publiée après le lot), et le stockage
//     supplémentaire qu'elle représente.
// Usage : node scripts/mesure-images-legeres.mjs [--sortie work/images-legeres.json] [url ...]
// Sans URL : les dix photos de publication de la production (liste ci-dessous,
// relevée au canal ① le 2026-09-21).
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const CDN = "https://passio-app.netlify.app/media/content/";
const PHOTOS_PROD = [
  "photos/6902826f-521a-4c83-afbf-11344de43f13/xu2paaygbmruwnway_s0p.jpg",
  "photos/6902826f-521a-4c83-afbf-11344de43f13/story_xuxtim7w2mr59zklz.webp",
  "photos/6902826f-521a-4c83-afbf-11344de43f13/story_xkvuzpjwjmtiuwaf8.jpg",
  "photos/d59aaaa3-3da1-4c52-8423-69c448b3b637/story_xl7cczxnamsug6zcf.jpg",
  "photos/d59aaaa3-3da1-4c52-8423-69c448b3b637/x20fwbp78mst0sufy.webp",
  "photos/d59aaaa3-3da1-4c52-8423-69c448b3b637/xn0jgqsnomsslscba.webp",
  "photos/20762060-78c4-40b9-ad2a-ee7c1cb19857/story_xfii8efijmraldmtu.jpg",
  "photos/20762060-78c4-40b9-ad2a-ee7c1cb19857/story_xjg64iswymqvefwgd.jpg",
  "photos/6902826f-521a-4c83-afbf-11344de43f13/story_x9s9aboo0mrsusbyf.jpg",
  "photos/6902826f-521a-4c83-afbf-11344de43f13/story_xbl2q567ymqv0q7hi.webp",
];

const args = process.argv.slice(2);
let sortie = null; const urls = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--sortie") sortie = args[++i]; else urls.push(args[i]);
}
const cibles = (urls.length ? urls : PHOTOS_PROD).map(u => (u.startsWith("http") ? u : CDN + u));

// La fonction du PRODUIT, telle quelle : on découpe app-08 entre le début du
// bloc et `supaUploadMedia`, et app-02 pour la constante de largeur.
const app08 = readFileSync(new URL("../js/app-08-ui-modals-tour.js", import.meta.url), "utf8");
const debut = app08.indexOf("const IMAGE_LEGERE_QUALITE_WEBP"), fin = app08.indexOf("// Fonction d'upload média vers Supabase Storage", debut);
if (debut < 0 || fin < 0) throw new Error("bloc _imageLegerePourFil introuvable dans app-08");
const app02 = readFileSync(new URL("../js/app-02-state-utils.js", import.meta.url), "utf8");
const largeur = app02.match(/const IMAGE_LEGERE_LARGEUR = (\d+);/);
if (!largeur) throw new Error("IMAGE_LEGERE_LARGEUR introuvable dans app-02");
const sourceProduit = `const IMAGE_LEGERE_LARGEUR = ${largeur[1]};\n` + app08.slice(debut, fin);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("about:blank");
await page.addScriptTag({ content: sourceProduit });
const lignes = [];
for (const url of cibles) {
  const r = await page.evaluate(async ({ url }) => {
    const lire = async (u) => { const res = await fetch(u); const buf = await res.arrayBuffer(); return { status: res.status, octets: buf.byteLength, type: res.headers.get("content-type"), buf }; };
    const grande = await lire(url);
    const transfo = await lire(url.split("?")[0] + "?width=700&quality=75");
    const dataUrl = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(new Blob([grande.buf], { type: grande.type })); });
    const dims = await new Promise((ok) => { const img = new Image(); img.onload = () => ok({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => ok(null); img.src = dataUrl; });
    const t0 = performance.now();
    const legere = await _imageLegerePourFil(dataUrl);
    const ms = Math.round(performance.now() - t0);
    return { url: url.replace(/^.*\/content\//, ""), grande: { status: grande.status, octets: grande.octets, type: grande.type, w: dims && dims.w, h: dims && dims.h },
      transformation700: { status: transfo.status, octets: transfo.octets, type: transfo.type },
      legere: legere ? { octets: _octetsDataUrl(legere.dataUrl), format: legere.format, w: legere.largeur, h: legere.hauteur, ms } : null };
  }, { url });
  lignes.push(r);
  console.log(`${r.url}\n  grande ${r.grande.w}×${r.grande.h} ${r.grande.octets} o · transfo 700 ${r.transformation700.octets} o · légère ${r.legere ? r.legere.w + "×" + r.legere.h + " " + r.legere.format + " " + r.legere.octets + " o (" + r.legere.ms + " ms)" : "aucune (gain < 15 %)"}`);
}
await browser.close();

const avecLegere = lignes.filter(l => l.legere);
const somme = (arr, f) => arr.reduce((a, b) => a + f(b), 0);
const total = {
  photos: lignes.length, avecLegere: avecLegere.length,
  grandeOctets: somme(lignes, l => l.grande.octets),
  transformationOctets: somme(lignes, l => l.transformation700.octets),
  legereOctets: somme(avecLegere, l => l.legere.octets) + somme(lignes.filter(l => !l.legere), l => l.grande.octets),
  stockageSupplementaireOctets: somme(avecLegere, l => l.legere.octets),
};
total.grilleEconomiePct = Math.round((1 - total.legereOctets / total.grandeOctets) * 100);
total.filEcartPct = Math.round((total.legereOctets / total.transformationOctets - 1) * 100);
total.stockagePct = Math.round(total.stockageSupplementaireOctets / total.grandeOctets * 100);
console.log(`\nTotal ${total.photos} photos (${total.avecLegere} avec légère) : grande ${total.grandeOctets} o · transformation 700 ${total.transformationOctets} o · légère ${total.legereOctets} o`);
console.log(`Grilles/albums (grande → légère) : ${total.grilleEconomiePct} % d'octets en moins · Fil (transformation → légère) : ${total.filEcartPct >= 0 ? "+" : ""}${total.filEcartPct} % · Stockage supplémentaire : +${total.stockagePct} %`);
if (sortie) {
  const dest = resolve(sortie); mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify({ date: new Date().toISOString(), largeur: Number(largeur[1]), lignes, total }, null, 2));
  console.log("→ " + dest);
}
