#!/usr/bin/env node
/**
 * audit-pii-depot.js — aucune adresse e-mail de personne dans les fichiers suivis (audit 2026-11-06).
 *
 * LE DÉPÔT EST PUBLIC. Des rapports d'audit écrits en clair y avaient publié les adresses de
 * comptes de production, avec leur date de création : une donnée personnelle dans un fichier
 * suivi est une donnée publiée, et la retirer de l'arbre ne la retire pas de l'historique.
 * Le mot à surveiller n'est donc pas « secret » mais « personne » : le contrôle de secrets de
 * GitHub ne voit pas ces lignes.
 *
 * Ce qui est admis : les domaines réservés aux essais, les adresses techniques, et les adresses
 * PUBLIQUES du projet (listées ci-dessous). Toute autre adresse fait échouer le contrôle, et
 * la sortie ne la recopie JAMAIS en clair : un journal de CI est public lui aussi.
 *
 * Résoudre un blocage :
 *   · une adresse de personne → la retirer du fichier (`[adresse retirée]`), et si elle a été
 *     publiée, se demander ce que cela implique pour elle (docs/, procédure de violation) ;
 *   · une adresse publique du projet, assumée → l'ajouter à ADRESSES_PUBLIQUES, en relecture.
 *
 *   node scripts/audit-pii-depot.js         # échoue si une adresse hors liste est trouvée
 *   node scripts/audit-pii-depot.js --liste # compte par fichier, sans échouer
 */
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/**
 * Domaines sans personne derrière : essais, exemples, adresses techniques des outils.
 * `passio.app` : les comptes de démonstration du jeu d'exemple et un ancien contact fictif.
 */
const DOMAINES_TECHNIQUES = /(^|\.)(test|invalid|example|localhost|local)$|^(exemple|example|test|email|domaine|domain|mail)\.[a-z]+$|^passio-e2e\.test|\.example\.com$|^users\.noreply\.github\.com$|^github\.com$|^anthropic\.com$|^dmarc\.brevo\.com$|^smtp-brevo\.com$|^(x|y)\.fr$|^exemple-domaine\.fr$|^bsky\.app$|^fcm\.googleapis\.com$|^passio\.app$/i;

/** Adresses que le projet publie lui-même (mentions légales, expéditeur, contact). */
const ADRESSES_PUBLIQUES = new Set([
  "contact@passio-app.fr",
  "passioadmin@gmail.com",
  "noreply@anthropic.com",
]);

/** Ce qui ressemble à une adresse sans en être une : `paquet@1.2.3.tgz`, `image@2x.png`, `@scope/nom`. */
function faussePiste(a) {
  const [local, domaine] = a.split("@");
  if (/\.(png|jpe?g|webp|svg|gif|css|js|mjs|ts|tsx|json|tgz|map|html)$/i.test(domaine)) return true;
  if (/^\d/.test(domaine)) return true; // paquet@1.2.3
  if (/^(git|npm|node|ssh)$/i.test(local)) return true;
  return false;
}

function admise(adresse) {
  const a = adresse.toLowerCase();
  if (faussePiste(a)) return true;
  if (ADRESSES_PUBLIQUES.has(a)) return true;
  return DOMAINES_TECHNIQUES.test(a.split("@")[1]);
}

/** Une adresse en clair ne sort jamais : première lettre et domaine seulement. */
function masquer(adresse) {
  const [local, domaine] = adresse.split("@");
  return local[0] + "…@" + domaine;
}

function fichiersSuivis() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: RACINE, maxBuffer: 1 << 28 })
    .toString().split("\0").filter(Boolean)
    // Les verrous de dépendances et les bibliothèques embarquées ne parlent pas de nos comptes.
    .filter((f) => !/(^|\/)package-lock\.json$/.test(f) && !f.startsWith("js/vendor/"));
}

function analyser(contenu) {
  const trouves = [];
  contenu.split("\n").forEach((ligne, i) => {
    for (const m of ligne.matchAll(EMAIL)) if (!admise(m[0])) trouves.push({ ligne: i + 1, adresse: m[0] });
  });
  return trouves;
}

function principal() {
  const liste = process.argv.includes("--liste");
  const parFichier = [];
  for (const f of fichiersSuivis()) {
    let buf;
    try { buf = fs.readFileSync(path.join(RACINE, f)); } catch (e) { continue; }
    if (buf.length > 4 * 1024 * 1024 || buf.subarray(0, 8000).includes(0)) continue;
    const t = analyser(buf.toString("utf8"));
    if (t.length) parFichier.push({ fichier: f, trouves: t });
  }
  if (!parFichier.length) { console.log("OK — aucune adresse de personne dans les fichiers suivis."); return 0; }
  const total = parFichier.reduce((n, x) => n + x.trouves.length, 0);
  console.error(`${total} adresse(s) hors liste dans ${parFichier.length} fichier(s) :`);
  for (const x of parFichier) {
    console.error(`  ${x.fichier} : ` + x.trouves.slice(0, 6).map((t) => `${t.ligne} (${masquer(t.adresse)})`).join(", ") + (x.trouves.length > 6 ? ", …" : ""));
  }
  if (liste) return 0;
  console.error("\nLe dépôt est public : retirer l'adresse du fichier, ou l'ajouter à ADRESSES_PUBLIQUES si le projet la publie lui-même.");
  return 1;
}

if (require.main === module) process.exit(principal());
module.exports = { analyser, admise, masquer };
