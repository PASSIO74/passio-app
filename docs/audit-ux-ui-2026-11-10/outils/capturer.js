#!/usr/bin/env node
// Lance les scénarios de capture d'un domaine.
//   node docs/audit-ux-ui-2026-11-10/outils/capturer.js <domaine> [--scenario nom] [--id ID] [--vue m390]
// <domaine> = nom d'un fichier de outils/scenarios/ (sans .js), ou « tout ».
"use strict";
const path = require("path");
const fs = require("fs");
const banc = require("./banc");

(async () => {
  const args = process.argv.slice(2);
  const cible = args[0];
  if (!cible) { console.error("usage : capturer.js <domaine|tout> [--scenario nom] [--id ID] [--vue gabarit]"); process.exit(2); }
  const opt = (nom) => { const i = args.indexOf("--" + nom); return i > 0 ? args[i + 1] : undefined; };
  const filtre = { scenario: opt("scenario"), id: opt("id"), vue: opt("vue") };
  const dir = path.join(__dirname, "scenarios");
  const fichiers = cible === "tout"
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => path.join(dir, f))
    : [path.join(dir, cible + ".js")];
  let echecs = 0;
  for (const f of fichiers) {
    if (!fs.existsSync(f)) { console.error("scénarios introuvables : " + f); process.exit(2); }
    const b = await banc.executer(f, filtre);
    echecs += b.echecs.length;
  }
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
