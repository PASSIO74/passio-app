#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Assemble le dossier d'audit à partir des fichiers de domaine :
//   · lit donnees/domaines/*.json (registre + constats) et donnees/captures/**.json ;
//   · RECROISE tout (identifiants, renvois, fichiers d'images, valeurs fermées) ;
//   · écrit galerie/donnees.js (lu par galerie/index.html, ouvrable en file://) ;
//   · écrit 02-REGISTRE-DE-COUVERTURE.md, 04-BACKLOG.md, donnees/registre.csv,
//     donnees/backlog.csv et donnees/controle-croise.json.
//
//   node docs/audit-ux-ui-2026-11-10/outils/construire-galerie.js
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("fs");
const path = require("path");

const AUDIT = path.resolve(__dirname, "..");
const lire = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const existe = (rel) => fs.existsSync(path.join(AUDIT, rel));

const GROUPES = ["Parcours de bout en bout", "Entrée et navigation", "Fil et interactions", "Recherche et découverte", "Profils et passions", "Création et médias", "Bobines et stories", "Rencontres IRL", "Messagerie", "Partage", "Transverse"];
const VAL = {
  observation: ["observe", "simule", "code", "inaccessible", "sans-objet"],
  visuel: ["avant-apres", "avant", "aucun"],
  verdict: ["a-ameliorer", "a-conserver", "a-verifier"],
  type: ["observation", "jugement", "hypothese"],
  nature: ["fonctionnel", "friction", "clarte", "accessibilite", "polish"],
  priorite: ["P0", "P1", "P2", "P3"],
  effort: ["S", "M", "L"],
  risqueTechnique: ["faible", "moyen", "eleve"],
};
const LIB = {
  observation: { observe: "Observé dans le navigateur", simule: "Simulé en environnement de test", code: "Identifié dans le code, non observé", inaccessible: "Inaccessible ou non vérifiable", "sans-objet": "Sans objet" },
  visuel: { "avant-apres": "Avant / après", avant: "Avant seul", aucun: "Avant non capturé" },
  verdict: { "a-ameliorer": "À améliorer", "a-conserver": "À conserver", "a-verifier": "À vérifier" },
};

const alertes = [];
const alerte = (niveau, msg) => alertes.push({ niveau, msg });

// ── 1. Domaines ─────────────────────────────────────────────────────────────
const dirDom = path.join(AUDIT, "donnees", "domaines");
const domaines = [];
if (fs.existsSync(dirDom)) {
  for (const f of fs.readdirSync(dirDom).filter((x) => x.endsWith(".json")).sort()) {
    try {
      const d = lire(path.join(dirDom, f));
      d.cle = d.domaine || f.replace(/\.json$/, "");
      if (!GROUPES.includes(d.groupe)) alerte("erreur", f + " : groupe inconnu « " + d.groupe + " »");
      d.registre = Array.isArray(d.registre) ? d.registre : [];
      d.constats = Array.isArray(d.constats) ? d.constats : [];
      domaines.push(d);
    } catch (e) { alerte("erreur", f + " : JSON illisible — " + e.message); }
  }
}

// ── 2. Fiches de capture ────────────────────────────────────────────────────
const captures = {};       // id → { vue → fiche }
const dirCap = path.join(AUDIT, "donnees", "captures");
if (fs.existsSync(dirCap)) {
  for (const dom of fs.readdirSync(dirCap)) {
    const d = path.join(dirCap, dom);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".json"))) {
      let fiche;
      try { fiche = lire(path.join(d, f)); } catch (e) { alerte("erreur", "fiche de capture illisible : " + dom + "/" + f); continue; }
      const m = fiche.mesures && !fiche.mesures.erreur ? fiche.mesures : null;
      const leger = {
        id: fiche.id, domaine: fiche.domaine, vue: fiche.vue, gabarit: fiche.gabarit, moteur: fiche.moteur, version: fiche.version, mode: fiche.mode,
        titre: fiche.titre, note: fiche.note, prisLe: fiche.prisLe, ecran: fiche.ecran,
        avant: fiche.avant, apres: fiche.apres, annotations: fiche.annotations || [], annotationsAvant: fiche.annotationsAvant || [],
        erreurs: fiche.erreurs, reseauRefuse: fiche.reseauRefuse || [],
        mesures: m ? {
          cibles: { total: m.cibles.total, nb: m.cibles.nbSous44, liste: (m.cibles.sous44 || []).filter((c) => !c.enLigne).slice(0, 14) },
          champs: { total: m.champs.total, liste: (m.champs.sous16 || []).slice(0, 10) },
          contraste: { juges: m.contraste.juges, indetermines: m.contraste.indetermines, nb: m.contraste.nbSousSeuil, liste: (m.contraste.sousSeuil || []).slice(0, 14) },
          sansNom: (m.sansNom || []).slice(0, 10), champsSansEtiquette: (m.champsSansEtiquette || []).slice(0, 10),
          debordement: m.debordement, tronques: (m.tronques || []).slice(0, 10),
        } : null,
      };
      for (const img of [leger.avant, leger.apres]) {
        if (!img) continue;
        if (!existe(img.fichier)) alerte("erreur", "image absente : " + img.fichier);
        for (const z of img.zooms || []) if (z.fichier && !existe(z.fichier)) alerte("erreur", "gros plan absent : " + z.fichier);
      }
      (captures[fiche.id] = captures[fiche.id] || {})[fiche.vue] = leger;
    }
  }
}

// ── 3. Recroisement ─────────────────────────────────────────────────────────
const surfaces = [], constats = [];
const idsSurf = new Set(), idsCons = new Set();
for (const d of domaines) {
  for (const r of d.registre) {
    if (!r.id) { alerte("erreur", d.cle + " : ligne de registre sans id"); continue; }
    if (idsSurf.has(r.id)) alerte("erreur", "identifiant de surface en double : " + r.id);
    idsSurf.add(r.id);
    for (const k of ["observation", "visuel", "verdict"]) if (!VAL[k].includes(r[k])) alerte("erreur", r.id + " : " + k + " invalide « " + r[k] + " »");
    for (const k of ["surface", "etat", "role", "geste", "preuve", "justification"]) if (!r[k] || !String(r[k]).trim()) alerte("avert", r.id + " : champ « " + k + " » vide");
    r.problemes = Array.isArray(r.problemes) ? r.problemes : [];
    r.captures = Array.isArray(r.captures) && r.captures.length ? r.captures : [r.id];
    surfaces.push(Object.assign({ domaine: d.cle, groupe: d.groupe }, r));
  }
  for (const c of d.constats) {
    if (!c.id) { alerte("erreur", d.cle + " : constat sans id"); continue; }
    if (idsCons.has(c.id)) alerte("erreur", "identifiant de constat en double : " + c.id);
    idsCons.add(c.id);
    for (const k of ["type", "nature", "priorite", "effort", "risqueTechnique"]) if (!VAL[k].includes(c[k])) alerte("erreur", c.id + " : " + k + " invalide « " + c[k] + " »");
    for (const k of ["titre", "emplacement", "preuve", "probleme", "declencheur", "consequence", "proposition", "critereAcceptation", "risqueRegression", "dependances"]) if (!c[k] || !String(c[k]).trim()) alerte("avert", c.id + " : champ « " + k + " » vide");
    c.surfaces = Array.isArray(c.surfaces) ? c.surfaces : [];
    c.visuels = Array.isArray(c.visuels) ? c.visuels : [];
    constats.push(Object.assign({ domaine: d.cle, groupe: d.groupe }, c));
  }
}
for (const s of surfaces) {
  for (const p of s.problemes) if (!idsCons.has(p)) alerte("erreur", s.id + " renvoie à un constat inconnu : " + p);
  const caps = s.captures.filter((id) => captures[id]);
  const aApres = caps.some((id) => Object.values(captures[id]).some((f) => f.apres));
  if (s.visuel === "avant-apres" && !aApres) alerte("erreur", s.id + " : visuel « avant-apres » déclaré mais aucune capture APRÈS sur disque");
  if (s.visuel !== "aucun" && !caps.length) alerte("erreur", s.id + " : visuel « " + s.visuel + " » déclaré mais aucune capture sur disque");
  if (s.visuel === "aucun" && caps.length) alerte("avert", s.id + " : capture présente alors que le registre dit « avant non capturé »");
  if (s.verdict === "a-ameliorer" && !s.problemes.length) alerte("avert", s.id + " : « à améliorer » sans constat lié");
  if ((s.observation === "observe" || s.observation === "simule") && !caps.length && s.visuel !== "aucun") alerte("avert", s.id + " : dit observé/simulé sans capture");
  s._aAvant = caps.length > 0; s._aApres = aApres;
}
for (const c of constats) {
  for (const id of c.surfaces) if (!idsSurf.has(id)) alerte("erreur", c.id + " renvoie à une surface inconnue : " + id);
  for (const id of c.visuels) if (!captures[id] && !idsSurf.has(id)) alerte("erreur", c.id + " renvoie à un visuel inconnu : " + id);
  if (!c.surfaces.length) alerte("avert", c.id + " : aucune surface liée");
}
// Renvoi inverse : un constat qui cite une surface doit apparaître dans les problèmes de cette surface.
const parSurf = new Map(surfaces.map((s) => [s.id, s]));
for (const c of constats) for (const id of c.surfaces) { const s = parSurf.get(id); if (s && !s.problemes.includes(c.id)) s.problemes.push(c.id); }
const referencees = new Set(surfaces.flatMap((s) => s.captures));
const orphelines = Object.keys(captures).filter((id) => !referencees.has(id));
if (orphelines.length) alerte("avert", "captures sans ligne de registre : " + orphelines.join(", "));

// ── 4. Compteurs ────────────────────────────────────────────────────────────
function compter(liste, cons) {
  const n = (f) => liste.filter(f).length;
  return {
    inventoriees: liste.length,
    observees: n((s) => s.observation === "observe"), simulees: n((s) => s.observation === "simule"),
    codeSeul: n((s) => s.observation === "code"), inaccessibles: n((s) => s.observation === "inaccessible"), sansObjet: n((s) => s.observation === "sans-objet"),
    avecAvant: n((s) => s._aAvant), maquettees: n((s) => s._aApres),
    aAmeliorer: n((s) => s.verdict === "a-ameliorer"), aConserver: n((s) => s.verdict === "a-conserver"), aVerifier: n((s) => s.verdict === "a-verifier"),
    restantAExaminer: n((s) => s.observation === "code" || s.observation === "inaccessible"),
    constats: cons.length, P0: cons.filter((c) => c.priorite === "P0").length, P1: cons.filter((c) => c.priorite === "P1").length, P2: cons.filter((c) => c.priorite === "P2").length, P3: cons.filter((c) => c.priorite === "P3").length,
  };
}
const total = compter(surfaces, constats);
const parGroupe = GROUPES.map((g) => ({ groupe: g, ...compter(surfaces.filter((s) => s.groupe === g), constats.filter((c) => c.groupe === g)), domaines: domaines.filter((d) => d.groupe === g).map((d) => ({ cle: d.cle, titre: d.titre, resume: d.resume, aConserver: d.aConserver || [] })) }));
const nbImages = Object.values(captures).reduce((a, v) => a + Object.values(v).reduce((b, f) => b + (f.avant ? 1 + (f.avant.zooms || []).filter((z) => z.fichier).length : 0) + (f.apres ? 1 + (f.apres.zooms || []).filter((z) => z.fichier).length : 0), 0), 0);

// ── 5. Fichiers annexes (lots, prototypes, méta) ────────────────────────────
const optionnel = (rel, defaut) => { try { return lire(path.join(AUDIT, rel)); } catch (e) { return defaut; } };
const meta = optionnel("donnees/meta.json", {});
const lots = optionnel("donnees/lots.json", []);
// Un fichier par prototype (donnees/prototypes/<nom>.json) : plusieurs auteurs sans conflit d'écriture.
const prototypes = optionnel("donnees/prototypes.json", []);
const dirProto = path.join(AUDIT, "donnees", "prototypes");
if (fs.existsSync(dirProto)) {
  for (const f of fs.readdirSync(dirProto).filter((x) => x.endsWith(".json")).sort()) {
    try { const p = lire(path.join(dirProto, f)); prototypes.push(p); if (!existe(p.fichier)) alerte("erreur", "prototype absent : " + p.fichier); }
    catch (e) { alerte("erreur", "fiche de prototype illisible : " + f); }
  }
}
prototypes.sort((a, b) => (a.ordre || 99) - (b.ordre || 99));

// Documents du dossier (Markdown), lisibles dans la galerie. Les deux fichiers
// générés plus bas (registre, backlog) y entrent au passage suivant du script.
const documents = [];
const ajouterDoc = (rel, type) => {
  const f = path.join(AUDIT, rel);
  if (!fs.existsSync(f)) return;
  const texte = fs.readFileSync(f, "utf8");
  const t = /^#\s+(.+)$/m.exec(texte);
  documents.push({ cle: rel.replace(/\.md$/, ""), fichier: rel, type, titre: t ? t[1].trim() : rel, md: texte });
};
for (const f of fs.readdirSync(AUDIT).filter((x) => x.endsWith(".md")).sort()) ajouterDoc(f, "dossier");
const dirRap = path.join(AUDIT, "rapports");
if (fs.existsSync(dirRap)) for (const f of fs.readdirSync(dirRap).filter((x) => x.endsWith(".md")).sort()) ajouterDoc("rapports/" + f, "rapport");
ajouterDoc("outils/GUIDE-AUDIT.md", "methode");

const sortie = { genereLe: new Date().toISOString(), meta, groupes: GROUPES, libelles: LIB, total, parGroupe, surfaces, constats, captures, lots, prototypes, documents, nbImages, alertes: alertes.filter((a) => a.niveau === "erreur").length };
fs.mkdirSync(path.join(AUDIT, "galerie"), { recursive: true });
fs.writeFileSync(path.join(AUDIT, "galerie", "donnees.js"), "window.AUDIT = " + JSON.stringify(sortie) + ";\n");
fs.writeFileSync(path.join(AUDIT, "donnees", "controle-croise.json"), JSON.stringify({ genereLe: sortie.genereLe, total, parGroupe: parGroupe.map((g) => { const { domaines: _d, ...r } = g; return r; }), nbImages, orphelines, alertes }, null, 1));

// ── 6. Registre et backlog en Markdown / CSV ────────────────────────────────
const cell = (v) => String(v == null ? "" : v).replace(/\r?\n/g, " ").replace(/\|/g, "∣").trim();
const csv = (v) => '"' + String(v == null ? "" : Array.isArray(v) ? v.join(" ; ") : v).replace(/"/g, '""').replace(/\r?\n/g, " ") + '"';
const versionTxt = meta.version ? meta.version : "main";

let md = "# Registre de couverture — audit UX/UI PASSIO\n\n";
md += "> Généré par `outils/construire-galerie.js` le " + sortie.genereLe.slice(0, 10) + " à partir de `donnees/domaines/*.json`. Version auditée : " + versionTxt + ".\n";
md += "> Ne pas modifier à la main : corriger le fichier de domaine puis régénérer.\n\n";
md += "## Compteurs\n\n| | Inventoriées | Observées | Simulées | Code seul | Inaccessibles | Sans objet | Avec capture AVANT | Maquettées (avant/après) | À améliorer | À conserver | À vérifier | Restant à examiner |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n";
const ligneC = (nom, c) => "| " + nom + " | " + [c.inventoriees, c.observees, c.simulees, c.codeSeul, c.inaccessibles, c.sansObjet, c.avecAvant, c.maquettees, c.aAmeliorer, c.aConserver, c.aVerifier, c.restantAExaminer].join(" | ") + " |\n";
for (const g of parGroupe) md += ligneC(g.groupe, g);
md += ligneC("**Total**", total);
md += "\n« Restant à examiner » = surfaces identifiées dans le code mais non rendues, ou non vérifiables dans le banc (véritable appareil, deux appareils, caméra, notifications poussées…). Elles ne sont PAS couvertes.\n\n";
md += "Statuts : " + Object.entries(LIB.observation).map(([k, v]) => "`" + k + "` = " + v).join(" · ") + ".\n\n";
for (const g of GROUPES) {
  const l = surfaces.filter((s) => s.groupe === g);
  if (!l.length) continue;
  md += "## " + g + "\n\n| ID | Surface | Sous-onglet / composant | État | Rôle utilisateur | Geste à effectuer | Preuve | Problèmes | Proposition | Visuel avant/après | Statut | Verdict — justification |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n";
  for (const s of l) md += "| " + [s.id, s.surface, s.composant, s.etat, s.role, s.geste, s.preuve, s.problemes.join(", ") || "—", s.proposition || "—", LIB.visuel[s.visuel] || s.visuel, LIB.observation[s.observation] || s.observation, (LIB.verdict[s.verdict] || s.verdict) + " — " + (s.justification || "")].map(cell).join(" | ") + " |\n";
  md += "\n";
}
fs.writeFileSync(path.join(AUDIT, "02-REGISTRE-DE-COUVERTURE.md"), md);
fs.writeFileSync(path.join(AUDIT, "donnees", "registre.csv"), "﻿" + ["ID;Domaine;Surface;Sous-onglet/composant;État;Rôle utilisateur;Geste à effectuer;Preuve;Problèmes;Proposition;Visuel avant/après;Statut;Verdict;Justification"].concat(surfaces.map((s) => [s.id, s.groupe, s.surface, s.composant, s.etat, s.role, s.geste, s.preuve, s.problemes, s.proposition, LIB.visuel[s.visuel], LIB.observation[s.observation], LIB.verdict[s.verdict], s.justification].map(csv).join(";"))).join("\r\n"));

const ordreP = { P0: 0, P1: 1, P2: 2, P3: 3 };
const tries = constats.slice().sort((a, b) => ordreP[a.priorite] - ordreP[b.priorite] || (b.gravite || 0) - (a.gravite || 0) || GROUPES.indexOf(a.groupe) - GROUPES.indexOf(b.groupe) || a.id.localeCompare(b.id));
let bk = "# Backlog priorisé — audit UX/UI PASSIO\n\n";
bk += "> Généré par `outils/construire-galerie.js` le " + sortie.genereLe.slice(0, 10) + ". Version auditée : " + versionTxt + ".\n";
bk += "> Priorité (P0–P3), gravité du problème (1–4), risque technique du changement et effort sont QUATRE notions séparées. Aucun gain chiffré n'est un résultat mesuré.\n\n";
bk += "| Priorité | Constats |\n|---|---|\n" + ["P0", "P1", "P2", "P3"].map((p) => "| " + p + " | " + total[p] + " |").join("\n") + "\n\n";
bk += "## Vue d'ensemble\n\n| ID | Priorité | Gravité | Nature | Type | Effort | Risque technique | Domaine | Constat |\n|---|---|---|---|---|---|---|---|---|\n";
for (const c of tries) bk += "| " + [c.id, c.priorite, c.gravite, c.nature, c.type, c.effort, c.risqueTechnique, c.groupe, c.titre + (c.sensible ? " ⚠ sensible" : "")].map(cell).join(" | ") + " |\n";
for (const p of ["P0", "P1", "P2", "P3"]) {
  const l = tries.filter((c) => c.priorite === p);
  if (!l.length) continue;
  bk += "\n## " + p + " — " + ({ P0: "parcours bloqué ou conséquence grave", P1: "friction importante sur un parcours essentiel", P2: "amélioration significative du confort", P3: "finition et cohérence visuelle" })[p] + "\n";
  for (const c of l) {
    bk += "\n### " + c.id + " — " + c.titre + (c.sensible ? "  ⚠ sensible (auth, droits, données privées ou règle métier)" : "") + "\n\n";
    bk += "- **Emplacement** : " + cell(c.emplacement) + "\n- **Domaine** : " + c.groupe + " · **Nature** : " + c.nature + " · **Type** : " + c.type + "\n";
    bk += "- **Preuve** : " + cell(c.preuve) + "\n- **Problème** : " + cell(c.probleme) + "\n- **Situation déclenchante** : " + cell(c.declencheur) + "\n- **Conséquence pour l'utilisateur** : " + cell(c.consequence) + "\n";
    bk += "- **Proposition** : " + cell(c.proposition) + "\n- **Visuels** : " + (c.visuels.length ? c.visuels.map((v) => "[" + v + "](galerie/index.html#/surface/" + v + ")").join(", ") : "—") + " · **Surfaces** : " + (c.surfaces.join(", ") || "—") + "\n";
    bk += "- **Priorité** : " + c.priorite + " · **Gravité** : " + c.gravite + "/4 · **Effort** : " + c.effort + " · **Risque technique** : " + c.risqueTechnique + "\n";
    bk += "- **Dépendances** : " + cell(c.dependances) + "\n- **Risque de régression** : " + cell(c.risqueRegression) + "\n- **Critère d'acceptation** : " + cell(c.critereAcceptation) + "\n";
    if (c.fichiers && c.fichiers.length) bk += "- **Fichiers probables** : " + c.fichiers.map((f) => "`" + f + "`").join(", ") + "\n";
  }
}
fs.writeFileSync(path.join(AUDIT, "04-BACKLOG.md"), bk);
fs.writeFileSync(path.join(AUDIT, "donnees", "backlog.csv"), "﻿" + ["ID;Priorité;Gravité;Nature;Type;Effort;Risque technique;Sensible;Domaine;Titre;Emplacement;Preuve;Problème;Situation déclenchante;Conséquence;Proposition;Surfaces;Visuels;Dépendances;Risque de régression;Critère d'acceptation;Fichiers"].concat(tries.map((c) => [c.id, c.priorite, c.gravite, c.nature, c.type, c.effort, c.risqueTechnique, c.sensible ? "oui" : "non", c.groupe, c.titre, c.emplacement, c.preuve, c.probleme, c.declencheur, c.consequence, c.proposition, c.surfaces, c.visuels, c.dependances, c.risqueRegression, c.critereAcceptation, c.fichiers || []].map(csv).join(";"))).join("\r\n"));

// ── 7. Compte rendu ─────────────────────────────────────────────────────────
const err = alertes.filter((a) => a.niveau === "erreur"), av = alertes.filter((a) => a.niveau === "avert");
console.log("Surfaces inventoriées : " + total.inventoriees + " — observées " + total.observees + ", simulées " + total.simulees + ", code seul " + total.codeSeul + ", inaccessibles " + total.inaccessibles + ", sans objet " + total.sansObjet);
console.log("Avec capture AVANT : " + total.avecAvant + " — maquettées (avant/après) : " + total.maquettees + " — restant à examiner : " + total.restantAExaminer);
console.log("Constats : " + total.constats + " (P0 " + total.P0 + ", P1 " + total.P1 + ", P2 " + total.P2 + ", P3 " + total.P3 + ") — images : " + nbImages);
console.log("Recroisement : " + err.length + " erreur(s), " + av.length + " avertissement(s)" + (orphelines.length ? ", " + orphelines.length + " capture(s) hors registre" : ""));
for (const a of err.slice(0, 60)) console.log("  ✗ " + a.msg);
if (process.argv.includes("--avertissements")) for (const a of av.slice(0, 200)) console.log("  ! " + a.msg);
process.exit(err.length && process.argv.includes("--strict") ? 1 : 0);
