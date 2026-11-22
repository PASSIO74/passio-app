// ═══════════════════════════════════════════════════════════════════════════
// EMPREINTE DE dist/ — « ce qui part en production est ce qui a été testé »
// (audit de stabilisation du 2026-11-10, STAB-10).
//
// La passe « Gates artefact » de la CI construit dist/ (scripts/servir-dist.js →
// scripts/build.js, PASSIO_MINIFIER_APP=1 : page, 9 scripts et feuille minifiés)
// et joue des suites navigateur sur ces octets. Le job « Déploiement production »
// reconstruit dist/ sur une autre machine avant de l'envoyer à Netlify. Le build
// est déterministe (aucun horodatage, outils figés par le lockfile) : les deux
// arbres DOIVENT être identiques. Ce script le rend vérifiable — une empreinte
// sha256 de l'arbre ENTIER (chemins relatifs triés + contenu de chaque fichier) :
// la passe de test la publie en sortie de job, le déploiement recalcule la sienne
// et refuse d'envoyer si elles diffèrent.
//
// Usage :
//   node scripts/empreinte-dist.js [dossier]          → imprime l'empreinte
//   node scripts/empreinte-dist.js dist --attendue <h> → code 1 si elle diffère,
//     avec la liste des fichiers (chemin + sha256 court) pour le diagnostic.
// Verrou : tests/unit/page-minifiee-testee.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function fichiers(racine) {
  const out = [];
  (function parcourir(rel) {
    for (const e of fs.readdirSync(path.join(racine, rel), { withFileTypes: true })) {
      const r = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) parcourir(r);
      else if (e.isFile()) out.push(r);
    }
  })("");
  return out.sort();
}

function empreinte(racine) {
  const liste = fichiers(racine);
  if (!liste.length) throw new Error(racine + " : aucun fichier");
  const h = crypto.createHash("sha256");
  const detail = [];
  for (const r of liste) {
    const contenu = fs.readFileSync(path.join(racine, r));
    const hf = crypto.createHash("sha256").update(contenu).digest("hex");
    detail.push(hf.slice(0, 12) + "  " + r);
    h.update(r).update("\0").update(hf).update("\n");
  }
  return { empreinte: h.digest("hex"), detail, n: liste.length };
}

module.exports = { empreinte };

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--attendue");
  const attendue = i >= 0 ? args[i + 1] : null;
  const dossier = (i === 0 ? args[2] : args[0]) || "dist";
  const r = empreinte(dossier);
  if (attendue === null) {
    process.stdout.write(r.empreinte + "\n");
    process.exit(0);
  }
  if (!/^[0-9a-f]{64}$/.test(attendue || "")) {
    console.error("::error title=Empreinte de dist::empreinte attendue absente ou mal formée (" + JSON.stringify(attendue) + ") — la passe « Gates artefact » ne l'a pas publiée.");
    process.exit(1);
  }
  if (r.empreinte !== attendue) {
    console.error("::error title=Artefact non testé::dist/ reconstruit ici (" + r.empreinte + ") n'est pas celui que la passe « Gates artefact » a éprouvé (" + attendue + "). Rien n'est envoyé.");
    console.error(r.detail.join("\n"));
    process.exit(1);
  }
  console.log("dist/ identique à l'artefact testé : " + r.n + " fichiers, " + r.empreinte);
}
