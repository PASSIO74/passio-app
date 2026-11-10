#!/usr/bin/env node
// Sonde d'exploration : ouvre l'application isolée, exécute un petit script,
// imprime ce qu'il rend (JSON) et enregistre une image de l'écran (PNG, densité 1,
// faite pour être REGARDÉE pendant l'exploration — pas un livrable).
//
//   node docs/audit-ux-ui-2026-11-10/outils/sonde.js <script.js> [--mode demo|visiteur|compte]
//        [--vue m390] [--moteur chromium|webkit] [--png chemin.png] [--mesurer] [--clavier N]
//
// Le script exporte : module.exports = async ({ page, context, serveur, banc, MOI, GENS, photo }) => resultat;
// et, au besoin :     module.exports.demarrage = { mode, etat, stockage, peupler, contexte… };
// `photo(nom)` enregistre une image intermédiaire <png sans extension>-<nom>.png.
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const banc = require("./banc");

(async () => {
  const args = process.argv.slice(2);
  const script = args[0];
  if (!script) { console.error("usage : sonde.js <script.js> [--mode …] [--vue …] [--png …] [--mesurer] [--clavier N]"); process.exit(2); }
  const opt = (nom) => { const i = args.indexOf("--" + nom); return i > 0 ? args[i + 1] : undefined; };
  const fn = require(path.resolve(script));
  const dem = Object.assign({}, fn.demarrage || {});
  if (opt("mode")) dem.mode = opt("mode");
  if (opt("vue")) dem.vue = opt("vue");
  if (opt("moteur")) dem.moteur = opt("moteur");
  const vue = dem.vue || "m390";
  const dossier = path.join(os.tmpdir(), "passio-audit-sondes");
  fs.mkdirSync(dossier, { recursive: true });
  const png = path.resolve(opt("png") || path.join(dossier, path.basename(script, ".js") + "--" + vue + ".png"));

  const statique = await banc.demarrerServeur();
  const navs = await banc.lancer([dem.moteur || "chromium"]);
  // Densité 1 : une image légère, lisible, peu coûteuse à regarder.
  dem.contexte = Object.assign({}, dem.contexte || {}, { deviceScaleFactor: 1 });
  const d = await banc.demarrer(navs, statique, dem);
  const photo = async (nom) => { const f = png.replace(/\.png$/, "-" + nom + ".png"); await d.page.screenshot({ path: f, animations: "disabled" }); console.log("image : " + f); return f; };
  let resultat, erreur = null;
  try {
    resultat = await fn({ page: d.page, context: d.context, serveur: d.serveur, banc, MOI: banc.MOI, GENS: banc.GENS, media: d.media, photo, vue });
  } catch (e) { erreur = e; }
  try { await banc.stabiliser(d.page, 300); await d.page.screenshot({ path: png, animations: "disabled" }); console.log("image : " + png); } catch (e) {}
  if (args.includes("--mesurer")) {
    const m = await d.page.evaluate(banc.mesurerDansLaPage, {}).catch((e) => ({ erreur: String(e) }));
    console.log("mesures : " + JSON.stringify(m, null, 1));
  }
  if (opt("clavier")) console.log("clavier : " + JSON.stringify(await banc.parcoursClavier(d.page, Number(opt("clavier"))), null, 1));
  console.log("écran : " + JSON.stringify(await d.page.evaluate(banc.contexteEcran).catch(() => null)));
  if (d.errors.js.length || d.errors.console.length) console.log("erreurs page : " + JSON.stringify({ js: d.errors.js, console: d.errors.console.slice(0, 8) }, null, 1));
  const refus = d.reseau.filter((r) => r.sort === "refuse").map((r) => r.url).filter((u, i, t) => t.indexOf(u) === i);
  if (refus.length) console.log("réseau tiers refusé : " + JSON.stringify(refus.slice(0, 15), null, 1));
  if (resultat !== undefined) console.log("résultat : " + (typeof resultat === "string" ? resultat : JSON.stringify(resultat, null, 1)));
  await d.context.close();
  for (const k of Object.keys(navs)) await navs[k].close();
  await statique.fermer();
  if (erreur) { console.error("ÉCHEC du script : " + (erreur && erreur.stack ? erreur.stack.split("\n").slice(0, 6).join("\n") : erreur)); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
