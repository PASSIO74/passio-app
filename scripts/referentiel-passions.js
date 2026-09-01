// ══════════════════════════════════════════════════════════════════════════
// CHARGEMENT ET NORMALISATION DU RÉFÉRENTIEL PLAT — module Node partagé
// ──────────────────────────────────────────────────────────────────────────
// Un SEUL endroit lit `data/passions/*.js` et en fait des objets. Le
// constructeur (`construire-referentiel-passions.js`) et le validateur
// (`valider-referentiel-passions.js`) l'utilisent tous les deux : deux copies
// de cette lecture auraient divergé — c'est arrivé deux fois dans ce dépôt
// (les tables de libellés de mood, les deux écrans de profil).
//
// ⚠️ `norme()` DOIT rester identique à celle du runtime (js/passions-flat.js)
// et à `normalized_label` en base. Trois pliages différents, c'est « moto
// cross » qui ne trouve pas « motocross » d'un côté et le trouve de l'autre.
// Le test `tests/unit/referentiel.test.js` compare les trois.
// ══════════════════════════════════════════════════════════════════════════
"use strict";
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const DOSSIER = path.join(RACINE, "data", "passions");

// Les 19 identifiants qui existent RÉELLEMENT en production, référencés par
// clé étrangère depuis posts, stories, events, conversations et profiles.
// En renommer un casse toutes les publications qui le portent.
const CANONIQUES = ["musique", "photo", "voyage", "cuisine", "sport", "litterature",
  "cinema", "tech", "art", "jardinage", "metier", "jeuxvideo", "yoga", "mode",
  "danse", "podcast", "moto", "animaux", "actu"];

function norme(s) {
  let t = String(s == null ? "" : s).toLowerCase();
  try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
  return t.replace(/[^a-z0-9]+/g, " ").trim();
}

// Variante SANS pluriel : « guitares » et « guitare » doivent se rejoindre.
// Volontairement minimaliste — un « désuffixage » agressif fusionne des mots
// distincts (« bus » → « bu »). On ne retire un « s » ou un « x » final que
// sur un mot d'au moins 4 lettres.
function normeSingulier(s) {
  return norme(s).split(" ").map(function (m) {
    return (m.length >= 4 && /[sx]$/.test(m)) ? m.slice(0, -1) : m;
  }).join(" ");
}

// ⚠️ DEUX PLIAGES, ET C'EST VOULU. `norme` sert à CHERCHER : elle jette la
// ponctuation, donc « C », « C++ » et « C# » s'y confondent — c'est exactement
// ce qu'on veut quand quelqu'un tape « c » et doit voir les trois. Mais si le
// contrôle d'unicité utilisait ce pliage, il refuserait « C++ » à côté de
// « C# », deux libellés parfaitement distincts à l'oeil. `normeIdentite`
// conserve donc `+`, `#` et `&`, les seuls signes qui portent du sens dans un
// nom de technologie. Confondre les deux, c'est soit refuser des libellés
// légitimes, soit laisser passer « Cinéma » et « Cinema » côte à côte.
function normeIdentite(s) {
  let t = String(s == null ? "" : s).toLowerCase();
  try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
  return t.replace(/[^a-z0-9+#&]+/g, " ").trim();
}

function fichiersSources() {
  return fs.readdirSync(DOSSIER)
    .filter(f => f.endsWith(".js") && f !== "relations.js")
    .sort();
}

function charger() {
  const passions = [];
  const provenance = {};          // id → fichier, pour des erreurs situées
  fichiersSources().forEach(function (f) {
    const lignes = require(path.join(DOSSIER, f));
    if (!Array.isArray(lignes)) throw new Error(f + " : le module doit exporter un tableau");
    lignes.forEach(function (l, i) {
      if (!Array.isArray(l)) throw new Error(f + " ligne " + (i + 1) + " : entrée non tabulaire");
      const [id, label, alias, broader, opts] = l;
      const o = opts || {};
      passions.push({
        id: String(id || ""),
        label: String(label || ""),
        aliases: String(alias || "").split(",").map(x => x.trim()).filter(Boolean),
        broader: String(broader || "") || null,
        emoji: o.emoji || null,
        color: o.color || null,
        popular: !!o.pop,
        is_broad: !!o.broad,
        _fichier: f,
      });
      provenance[String(id || "")] = f;
    });
  });

  // Héritage de l'emoji et de la couleur par la chaîne `broader`. Une passion
  // sans emoji propre porte celui de son terme plus général — c'est de
  // l'AFFICHAGE, pas une hiérarchie : à l'écran, les deux sont au même rang.
  const parId = {};
  passions.forEach(p => { parId[p.id] = p; });
  passions.forEach(function (p) {
    let cur = p, garde = 0;
    while (cur && !p.emoji && garde++ < 12) { cur = cur.broader ? parId[cur.broader] : null; if (cur && cur.emoji) p.emoji = cur.emoji; }
    cur = p; garde = 0;
    while (cur && !p.color && garde++ < 12) { cur = cur.broader ? parId[cur.broader] : null; if (cur && cur.color) p.color = cur.color; }
    p.emoji = p.emoji || "✨";
    p.color = p.color || "#8b5cf6";
    p.normalized_label = norme(p.label);
  });

  // Popularité : un score, pas un rang. Il sert à départager deux résultats de
  // pertinence égale et à remplir les suggestions au repos.
  passions.forEach(function (p, i) {
    p.popularity = (p.popular ? 1000 : 0) + (p.is_broad ? 200 : 0) + Math.max(0, 200 - i / 10) | 0;
    p.sort_order = i + 1;
  });

  const relations = [];
  const vus = new Set();
  function pousser(a, b, type, poids) {
    const cle = a + "|" + b + "|" + type;
    if (vus.has(cle)) return;
    vus.add(cle);
    relations.push({ source_passion_id: a, target_passion_id: b, relation_type: type, weight: poids });
  }
  passions.forEach(function (p) {
    if (!p.broader) return;
    pousser(p.id, p.broader, "broader", 3);
    pousser(p.broader, p.id, "narrower", 3);
  });
  require(path.join(DOSSIER, "relations.js")).forEach(function (r) {
    pousser(r[0], r[1], "related", Number(r[2]) || 1);
    pousser(r[1], r[0], "related", Number(r[2]) || 1);
  });

  return { passions, relations, provenance, canoniques: CANONIQUES, norme, normeSingulier };
}

module.exports = { charger, norme, normeSingulier, normeIdentite, CANONIQUES, DOSSIER, fichiersSources };
