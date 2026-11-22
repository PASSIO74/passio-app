#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// INVENTAIRE STATIQUE — ce que le CODE déclare comme surfaces, indépendamment
// de ce que les auditeurs ont ouvert. Sert à RECROISER le registre : toute
// porte d'ouverture trouvée ici doit se retrouver dans un rapport ou une ligne
// de registre, ou être expliquée (code mort, outil interne).
//
//   node docs/audit-ux-ui-2026-11-10/outils/inventaire-code.js
// Écrit donnees/inventaire-code.json. Ne lit que des fichiers du dépôt.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("fs");
const path = require("path");
const RACINE = path.resolve(__dirname, "..", "..", "..");
const AUDIT = path.resolve(__dirname, "..");
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), "utf8");

const html = lire("index.html");
const fichiersJs = fs.readdirSync(path.join(RACINE, "js")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f);

// ── 1. Balisage statique ────────────────────────────────────────────────────
const ecrans = [...html.matchAll(/<section class="screen[^"]*" id="(screen-[a-z]+)"/g)].map((m) => m[1]);
const idsHtml = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const conteneurs = ["landing", "onboarding", "storyViewer", "reelsViewer", "reelCommentsPanel", "modalBackdrop", "tourOverlay", "toastStack", "devPanel", "appNav", "conv-fullpage", "passionManager"].filter((id) => idsHtml.includes(id) || html.includes('id="' + id + '"'));
const scriptsCharges = [...html.matchAll(/<script[^>]+src="(js\/[^"]+)"/g)].map((m) => m[1]);

// ── 2. Fonctions et portes d'ouverture ──────────────────────────────────────
const RE_PORTE = /^(open|show|ouvrir|afficher|montrer)[A-Z_]/;
const fonctions = [];          // { nom, fichier, ligne }
const appelsOpenModal = [];    // { fichier, ligne, dans }
const natifs = { confirm: [], alert: [], prompt: [] };
const toasts = [];             // { fichier, ligne, texte, type }
const drapeaux = new Map();    // clé → fichiers
const liensProfonds = new Map();
for (const f of fichiersJs) {
  const lignes = lire(f).split(/\r?\n/);
  let courant = null;
  lignes.forEach((l, i) => {
    const d = /^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/.exec(l) || /^(?:window\.)?([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?function\b/.exec(l);
    if (d) { courant = d[1]; fonctions.push({ nom: d[1], fichier: f, ligne: i + 1 }); }
    if (/(^|[^A-Za-z0-9_$.])openModal\(/.test(l) && !/function openModal\(/.test(l)) appelsOpenModal.push({ fichier: f, ligne: i + 1, dans: courant });
    if (!/^\s*(\/\/|\*)/.test(l)) {
      for (const n of ["confirm", "alert", "prompt"]) {
        const re = new RegExp("(^|[^A-Za-z0-9_$.])(?:window\\.)?" + n + "\\(\\s*[\"'`]");
        if (re.test(l)) natifs[n].push({ fichier: f, ligne: i + 1, dans: courant, extrait: l.trim().slice(0, 150) });
      }
      const t = /(^|[^A-Za-z0-9_$.])toast\(\s*(["'`])((?:\\.|(?!\2).)*)\2\s*(?:,\s*["'`]([a-z]+)["'`])?/.exec(l);
      if (t) toasts.push({ fichier: f, ligne: i + 1, texte: t[3].slice(0, 140), type: t[4] || "info" });
    }
    for (const m of l.matchAll(/["'`](passio_[a-z0-9_]+)["'`]/g)) { if (!drapeaux.has(m[1])) drapeaux.set(m[1], new Set()); drapeaux.get(m[1]).add(f); }
    for (const m of l.matchAll(/["'`](#(?:post-|reel=|irl-event-|irl-checkin-|profil-|u=|passion-|conv-|live-|invite)[^"'`]{0,12})["'`]/g)) { if (!liensProfonds.has(m[1])) liensProfonds.set(m[1], new Set()); liensProfonds.get(m[1]).add(f + ":" + (i + 1)); }
  });
}
const portes = fonctions.filter((x) => RE_PORTE.test(x.nom));
const modalesParFonction = {};
for (const a of appelsOpenModal) { const k = (a.dans || "(hors fonction)") + " — " + a.fichier; (modalesParFonction[k] = modalesParFonction[k] || []).push(a.ligne); }

// ── 3. Recroisement avec ce que les auditeurs ont écrit ─────────────────────
let corpus = "";
for (const d of ["donnees/domaines", "rapports", "outils/scenarios", "outils/sondes", "outils/jeu"]) {
  const dir = path.join(AUDIT, d);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) { try { corpus += "\n" + fs.readFileSync(path.join(dir, f), "utf8"); } catch (e) {} }
}
const citee = (nom) => new RegExp("(^|[^A-Za-z0-9_$])" + nom.replace(/[$]/g, "\\$") + "([^A-Za-z0-9_$]|$)").test(corpus);
const portesNonCitees = portes.filter((p) => !citee(p.nom));
const fonctionsAModale = [...new Set(appelsOpenModal.map((a) => a.dans).filter(Boolean))];
const modalesNonCitees = fonctionsAModale.filter((n) => !citee(n));

const sortie = {
  genereLe: new Date().toISOString(),
  ecrans, conteneurs, scriptsCharges: scriptsCharges.length,
  nbFonctions: fonctions.length,
  portes: portes.map((p) => ({ nom: p.nom, ou: p.fichier + ":" + p.ligne, citee: citee(p.nom) })),
  nbAppelsOpenModal: appelsOpenModal.length,
  fonctionsOuvrantUneModale: fonctionsAModale.map((n) => ({ nom: n, citee: citee(n), lignes: appelsOpenModal.filter((a) => a.dans === n).map((a) => a.fichier + ":" + a.ligne) })),
  dialoguesNatifs: natifs,
  toasts: { total: toasts.length, parType: toasts.reduce((o, t) => { o[t.type] = (o[t.type] || 0) + 1; return o; }, {}), liste: toasts },
  drapeaux: [...drapeaux.entries()].map(([k, v]) => ({ cle: k, fichiers: [...v] })).sort((a, b) => a.cle.localeCompare(b.cle)),
  liensProfonds: [...liensProfonds.entries()].map(([k, v]) => ({ motif: k, ou: [...v].slice(0, 4) })),
  recroisement: { portesNonCitees: portesNonCitees.map((p) => p.nom + " (" + p.fichier + ":" + p.ligne + ")"), modalesNonCitees },
};
fs.mkdirSync(path.join(AUDIT, "donnees"), { recursive: true });
fs.writeFileSync(path.join(AUDIT, "donnees", "inventaire-code.json"), JSON.stringify(sortie, null, 1));
console.log("Écrans : " + ecrans.join(", "));
console.log("Fonctions : " + fonctions.length + " — portes d'ouverture (open/show/ouvrir…) : " + portes.length + " — appels openModal : " + appelsOpenModal.length + " dans " + fonctionsAModale.length + " fonctions");
console.log("Dialogues natifs : confirm " + natifs.confirm.length + ", alert " + natifs.alert.length + ", prompt " + natifs.prompt.length + " — toasts littéraux : " + toasts.length + " " + JSON.stringify(sortie.toasts.parType));
console.log("Clés passio_* : " + drapeaux.size + " — motifs de liens profonds : " + liensProfonds.size);
console.log("Portes non citées par les auditeurs : " + portesNonCitees.length + "/" + portes.length + " — fonctions à modale non citées : " + modalesNonCitees.length + "/" + fonctionsAModale.length);
if (process.argv.includes("--detail")) { console.log(portesNonCitees.map((p) => "  · " + p.nom + "  " + p.fichier + ":" + p.ligne).join("\n")); console.log(modalesNonCitees.map((n) => "  ◦ " + n).join("\n")); }
