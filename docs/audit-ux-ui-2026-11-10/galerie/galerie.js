/* Galerie de l'audit UX/UI PASSIO — navigation dans donnees.js (window.AUDIT).
   Aucune dépendance, aucun appel réseau : s'ouvre directement en file://. */
(function () {
  "use strict";
  var A = window.AUDIT;
  var contenu = document.getElementById("contenu");
  var rail = document.getElementById("rail");
  if (!A) { contenu.innerHTML = '<div class="vide">Les données de la galerie sont absentes. Lancer : <code>node docs/audit-ux-ui-2026-11-10/outils/construire-galerie.js</code></div>'; return; }

  // ── Utilitaires ──────────────────────────────────────────────────────────
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function e(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function memo(cle, defaut) { try { var v = localStorage.getItem("audit_" + cle); return v == null ? defaut : v; } catch (x) { return defaut; } }
  function retenir(cle, v) { try { localStorage.setItem("audit_" + cle, v); } catch (x) {} }
  var L = A.libelles;
  var surfParId = {}, consParId = {};
  A.surfaces.forEach(function (s) { surfParId[s.id] = s; });
  A.constats.forEach(function (c) { consParId[c.id] = c; });
  var DSF = { m: 2, t: 1.5, d: 1 };
  function largeurCss(f, img) { return Math.round(img.largeur / (DSF[(f.vue || "m")[0]] || 2)); }
  function ficheDe(id, vue) { var c = A.captures[id]; if (!c) return null; return c[vue] || c.m390 || c[Object.keys(c)[0]]; }
  var ORDRE_VUES = ["m390", "m360", "m320", "m430", "t768", "d1440"];
  function fichesDeSurface(s) {
    var out = [];
    (s.captures || [s.id]).forEach(function (id) {
      var c = A.captures[id]; if (!c) return;
      Object.keys(c).sort(function (a, b) { return ORDRE_VUES.indexOf(a) - ORDRE_VUES.indexOf(b); }).forEach(function (v) { out.push(c[v]); });
    });
    return out;
  }
  function premiereFiche(s) { var l = fichesDeSurface(s); return l.filter(function (f) { return f.vue === "m390"; })[0] || l[0] || null; }
  function etiquette(type, val) { return '<span class="et et-' + e(val) + '">' + e((L[type] && L[type][val]) || val) + "</span>"; }
  function lienId(id) {
    if (surfParId[id] || A.captures[id]) return '<a class="id" href="#/surface/' + e(id) + '">' + e(id) + "</a>";
    if (consParId[id]) return '<a class="id" href="#/constat/' + e(id) + '">' + e(id) + "</a>";
    return '<span class="id">' + e(id) + "</span>";
  }
  // Texte libre : échappé, puis les identifiants connus deviennent des liens.
  function riche(txt) {
    return e(txt).replace(/\b([A-Z]{3}-C?\d{2,3})\b/g, function (m) { return (surfParId[m] || consParId[m] || A.captures[m]) ? lienId(m) : m; }).replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  // ── Markdown minimal (titres, listes, tableaux, citations, code, liens) ──
  function mdEnLigne(t) {
    var codes = [];
    t = t.replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return "\u0001" + (codes.length - 1) + "\u0001"; });
    t = e(t)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, lib, url) { return '<a href="' + lienDoc(url) + '">' + lib + "</a>"; })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/\b([A-Z]{3}-C?\d{2,3})\b(?![^<]*<\/a>)/g, function (m) { return (surfParId[m] || consParId[m] || A.captures[m]) ? lienId(m) : m; });
    return t.replace(/\u0001(\d+)\u0001/g, function (_, i) { return "<code>" + e(codes[+i]) + "</code>"; });
  }
  function lienDoc(url) {
    url = url.replace(/&amp;/g, "&");
    var m = /galerie\/index\.html(#.*)$/.exec(url); if (m) return m[1];
    if (/^(https?:|#|mailto:)/.test(url)) return url;
    var cle = url.replace(/^\.\//, "").replace(/^\.\.\//, "");
    var d = (A.documents || []).filter(function (x) { return x.fichier === cle || x.fichier.split("/").pop() === cle.split("/").pop(); })[0];
    return d ? "#/doc/" + encodeURIComponent(d.cle) : "../" + cle;
  }
  function md(src) {
    var lignes = String(src || "").replace(/\r/g, "").split("\n"), out = [], i = 0;
    function fermerPara(buf) { if (buf.length) out.push("<p>" + mdEnLigne(buf.join(" ")) + "</p>"); buf.length = 0; }
    var para = [];
    while (i < lignes.length) {
      var l = lignes[i];
      if (/^```/.test(l)) { fermerPara(para); var code = []; i++; while (i < lignes.length && !/^```/.test(lignes[i])) code.push(lignes[i++]); i++; out.push("<pre><code>" + e(code.join("\n")) + "</code></pre>"); continue; }
      var h = /^(#{1,4})\s+(.*)$/.exec(l);
      if (h) { fermerPara(para); out.push("<h" + h[1].length + ">" + mdEnLigne(h[2]) + "</h" + h[1].length + ">"); i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lignes.length && /^\s*\|[\s:|-]+\|\s*$/.test(lignes[i + 1])) {
        fermerPara(para);
        var cellules = function (x) { return x.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); }); };
        var t = '<div class="table-defile"><table><thead><tr>' + cellules(l).map(function (c) { return "<th>" + mdEnLigne(c) + "</th>"; }).join("") + "</tr></thead><tbody>";
        i += 2;
        while (i < lignes.length && /^\s*\|.*\|\s*$/.test(lignes[i])) { t += "<tr>" + cellules(lignes[i]).map(function (c) { return "<td>" + mdEnLigne(c) + "</td>"; }).join("") + "</tr>"; i++; }
        out.push(t + "</tbody></table></div>"); continue;
      }
      if (/^>\s?/.test(l)) { fermerPara(para); var q = []; while (i < lignes.length && /^>\s?/.test(lignes[i])) q.push(lignes[i++].replace(/^>\s?/, "")); out.push("<blockquote>" + md(q.join("\n")) + "</blockquote>"); continue; }
      var li = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(l);
      if (li) {
        fermerPara(para);
        var ord = /\d/.test(li[2]), items = [];
        while (i < lignes.length) {
          var m2 = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(lignes[i]);
          if (m2 && m2[1].length <= li[1].length + 1) { items.push(m2[3]); i++; }
          else if (/^\s{2,}\S/.test(lignes[i]) && items.length) { items[items.length - 1] += " " + lignes[i].trim().replace(/^([-*]|\d+[.)])\s+/, "— "); i++; }
          else break;
        }
        out.push((ord ? "<ol>" : "<ul>") + items.map(function (x) { return "<li>" + mdEnLigne(x) + "</li>"; }).join("") + (ord ? "</ol>" : "</ul>")); continue;
      }
      if (/^---+\s*$/.test(l)) { fermerPara(para); out.push("<hr>"); i++; continue; }
      if (!l.trim()) { fermerPara(para); i++; continue; }
      para.push(l.trim()); i++;
    }
    fermerPara(para);
    return out.join("\n");
  }

  // ── État des filtres ─────────────────────────────────────────────────────
  var filtres = { observation: {}, verdict: {}, priorite: {}, apres: false, texte: "" };
  function passe(s) {
    var o = Object.keys(filtres.observation).filter(function (k) { return filtres.observation[k]; });
    if (o.length && o.indexOf(s.observation) < 0) return false;
    var v = Object.keys(filtres.verdict).filter(function (k) { return filtres.verdict[k]; });
    if (v.length && v.indexOf(s.verdict) < 0) return false;
    if (filtres.apres && !s._aApres) return false;
    var p = Object.keys(filtres.priorite).filter(function (k) { return filtres.priorite[k]; });
    if (p.length && !(s.problemes || []).some(function (id) { return consParId[id] && p.indexOf(consParId[id].priorite) >= 0; })) return false;
    if (filtres.texte) {
      var botte = [s.id, s.surface, s.composant, s.etat, s.role, s.geste, s.proposition, s.groupe].concat(s.problemes || []).join(" ").toLowerCase();
      if (botte.indexOf(filtres.texte) < 0) return false;
    }
    return true;
  }
  function passeConstat(c) {
    var p = Object.keys(filtres.priorite).filter(function (k) { return filtres.priorite[k]; });
    if (p.length && p.indexOf(c.priorite) < 0) return false;
    if (filtres.texte) {
      var botte = [c.id, c.titre, c.emplacement, c.probleme, c.proposition, c.groupe, c.nature].concat(c.surfaces || []).join(" ").toLowerCase();
      if (botte.indexOf(filtres.texte) < 0) return false;
    }
    return true;
  }

  // ── Bandeau et rail ──────────────────────────────────────────────────────
  var ONGLETS = [["#/", "Vue d'ensemble"], ["#/surfaces", "Surfaces"], ["#/constats", "Constats"], ["#/lots", "Lots"], ["#/prototypes", "Prototypes"], ["#/documents", "Dossier"]];
  document.getElementById("versionAuditee").textContent = (A.meta && A.meta.versionCourte) || "";
  function peindreOnglets(actif) {
    document.getElementById("onglets").innerHTML = ONGLETS.map(function (o) { return '<a href="' + o[0] + '"' + (o[0] === actif ? ' aria-current="page"' : "") + ">" + o[1] + "</a>"; }).join("");
  }
  function puces(type, valeurs) {
    return '<div class="filtre">' + valeurs.map(function (v) { return '<button type="button" class="puce" data-filtre="' + type + '" data-val="' + v + '" aria-pressed="' + (filtres[type][v] ? "true" : "false") + '">' + e((L[type] && L[type][v]) || v) + "</button>"; }).join("") + "</div>";
  }
  function peindreRail(groupeActif) {
    var h = '<h4>Domaines</h4><div class="rail-domaines"><a class="rail-lien" href="#/surfaces"' + (groupeActif === "*" ? ' aria-current="true"' : "") + "><span>Tous les domaines</span><small>" + A.total.inventoriees + "</small></a>";
    A.parGroupe.forEach(function (g) {
      h += '<a class="rail-lien" href="#/domaine/' + encodeURIComponent(g.groupe) + '"' + (groupeActif === g.groupe ? ' aria-current="true"' : "") + "><span>" + e(g.groupe) + "</span><small>" + g.inventoriees + " · " + g.constats + "</small></a>";
    });
    h += "</div><h4>Statut d'observation</h4>" + puces("observation", ["observe", "simule", "code", "inaccessible"]);
    h += "<h4>Verdict</h4>" + puces("verdict", ["a-ameliorer", "a-conserver", "a-verifier"]);
    h += "<h4>Priorité des constats</h4>" + puces("priorite", ["P0", "P1", "P2", "P3"]);
    h += '<h4>Visuels</h4><div class="filtre"><button type="button" class="puce" data-filtre="apres" aria-pressed="' + (filtres.apres ? "true" : "false") + '">Avec maquette « après »</button></div>';
    h += '<p style="font-size:12px;color:var(--sourd);margin-top:18px;line-height:1.45">Compteurs : surfaces · constats. Toutes les captures sont des émulations (Chromium ' + e((A.meta && A.meta.chromium) || "") + "), jamais un véritable appareil.</p>";
    rail.innerHTML = h;
  }
  rail.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-filtre]"); if (!b) return;
    var t = b.getAttribute("data-filtre");
    if (t === "apres") filtres.apres = !filtres.apres; else filtres[t][b.getAttribute("data-val")] = !filtres[t][b.getAttribute("data-val")];
    router();
  });
  var champ = document.getElementById("recherche");
  champ.addEventListener("input", function () {
    filtres.texte = champ.value.trim().toLowerCase();
    if (!/^#\/(surfaces|domaine|constats)/.test(location.hash)) { location.hash = "#/surfaces"; return; }
    router();
  });

  // ── Vues ─────────────────────────────────────────────────────────────────
  function indic(n, lib, alerte) { return '<div class="indic' + (alerte ? " alerte" : "") + '"><b>' + n + "</b><span>" + e(lib) + "</span></div>"; }
  function vueEnsemble() {
    var T = A.total, m = A.meta || {};
    var h = "<h1>Audit UX/UI de PASSIO</h1>";
    h += '<p class="chapo">' + e(m.chapo || "") + "</p>";
    h += '<div class="indicateurs">' + indic(T.inventoriees, "surfaces et états inventoriés") + indic(T.observees, "observés dans le navigateur") + indic(T.simulees, "simulés en environnement de test") + indic(T.maquettees, "maquettés (avant / après)") + indic(T.aConserver, "jugés « à conserver »") + indic(T.restantAExaminer, "restant à examiner", T.restantAExaminer > 0) + "</div>";
    h += '<div class="indicateurs">' + indic(T.constats, "constats") + indic(T.P0, "P0 — parcours bloqué ou grave", T.P0 > 0) + indic(T.P1, "P1 — friction importante") + indic(T.P2, "P2 — confort") + indic(T.P3, "P3 — finition") + indic(A.nbImages, "images (captures, maquettes, gros plans)") + "</div>";
    if (T.restantAExaminer > 0) h += '<div class="avis"><strong>La couverture n\'est pas totale.</strong> ' + T.codeSeul + " surface(s) sont identifiées dans le code sans avoir été rendues, et " + T.inaccessibles + " ne sont pas vérifiables dans ce banc (véritable appareil, deux appareils, caméra, notifications poussées…). Elles figurent au registre avec leur raison.</div>";
    h += '<div class="bloc"><h2>Couverture par domaine</h2><div class="table-defile"><table><thead><tr><th>Domaine</th><th class="num">Inventoriées</th><th class="num">Observées</th><th class="num">Simulées</th><th class="num">Code seul</th><th class="num">Inaccessibles</th><th class="num">Avant/après</th><th class="num">À conserver</th><th class="num">Constats</th><th class="num">P0</th><th class="num">P1</th><th class="num">P2</th><th class="num">P3</th></tr></thead><tbody>';
    A.parGroupe.forEach(function (g) {
      h += '<tr data-href="#/domaine/' + encodeURIComponent(g.groupe) + '"><td><a href="#/domaine/' + encodeURIComponent(g.groupe) + '">' + e(g.groupe) + "</a></td>" + [g.inventoriees, g.observees, g.simulees, g.codeSeul, g.inaccessibles, g.maquettees, g.aConserver, g.constats, g.P0, g.P1, g.P2, g.P3].map(function (n) { return '<td class="num">' + n + "</td>"; }).join("") + "</tr>";
    });
    h += "<tr><td><strong>Total</strong></td>" + [T.inventoriees, T.observees, T.simulees, T.codeSeul, T.inaccessibles, T.maquettees, T.aConserver, T.constats, T.P0, T.P1, T.P2, T.P3].map(function (n) { return '<td class="num"><strong>' + n + "</strong></td>"; }).join("") + "</tr></tbody></table></div></div>";
    var prioritaires = A.constats.filter(function (c) { return c.priorite === "P0" || c.priorite === "P1"; }).sort(function (a, b) { return a.priorite.localeCompare(b.priorite) || (b.gravite || 0) - (a.gravite || 0); });
    if (prioritaires.length) {
      h += '<div class="bloc"><h2>Constats P0 et P1</h2><div class="table-defile"><table><thead><tr><th>ID</th><th>Priorité</th><th>Domaine</th><th>Constat</th><th>Effort</th></tr></thead><tbody>';
      prioritaires.forEach(function (c) { h += '<tr data-href="#/constat/' + e(c.id) + '"><td>' + lienId(c.id) + "</td><td>" + etiquette("priorite", c.priorite) + "</td><td>" + e(c.groupe) + "</td><td>" + e(c.titre) + "</td><td>" + e(c.effort) + "</td></tr>"; });
      h += "</tbody></table></div></div>";
    }
    if (m.methode) h += '<div class="bloc doc"><h2>Méthode en bref</h2>' + md(m.methode) + "</div>";
    return h;
  }

  function tuile(s) {
    var f = premiereFiche(s), img = f && f.avant;
    var h = '<a class="tuile" href="#/surface/' + e(s.id) + '"><div class="tuile-vue">';
    if (img) h += '<img loading="lazy" src="../' + e(img.fichier) + '" alt="Capture avant — ' + e(s.surface) + '">';
    else h += '<div class="non-capture"><div><strong>Avant non capturé</strong><br>' + e(L.observation[s.observation] || "") + "</div></div>";
    h += '<div class="tuile-coin">' + (img ? '<span class="et">avant</span>' : "") + (s._aApres ? '<span class="et apres">+ après</span>' : "") + "</div></div>";
    h += '<div class="tuile-corps"><span class="id">' + e(s.id) + "</span><strong>" + e(s.surface) + '</strong><span class="sous">' + e([s.composant, s.etat].filter(Boolean).join(" — ")) + '</span><div class="tuile-pied">' + etiquette("observation", s.observation) + etiquette("verdict", s.verdict) + "</div></div></a>";
    return h;
  }
  function vueSurfaces(groupe) {
    var liste = A.surfaces.filter(function (s) { return (!groupe || s.groupe === groupe) && passe(s); });
    var h = '<div class="fil-ariane"><a href="#/">Vue d\'ensemble</a> › ' + (groupe ? '<a href="#/surfaces">Surfaces</a> › ' + e(groupe) : "Surfaces") + "</div>";
    h += "<h1>" + e(groupe || "Toutes les surfaces") + "</h1>";
    if (groupe) {
      var g = A.parGroupe.filter(function (x) { return x.groupe === groupe; })[0];
      (g.domaines || []).forEach(function (d) {
        if (d.resume) h += '<p class="chapo">' + riche(d.resume) + "</p>";
        if (d.aConserver && d.aConserver.length) h += '<div class="bloc"><h3>Ce qui fonctionne et doit être conservé' + (g.domaines.length > 1 ? " — " + e(d.titre) : "") + "</h3><ul>" + d.aConserver.map(function (x) { return "<li>" + riche(x) + "</li>"; }).join("") + "</ul></div>";
      });
      var docs = (A.documents || []).filter(function (d) { return d.type === "rapport" && (g.domaines || []).some(function (x) { return d.cle === "rapports/" + x.cle; }); });
      if (docs.length) h += '<p style="margin-top:14px">Rapport détaillé : ' + docs.map(function (d) { return '<a href="#/doc/' + encodeURIComponent(d.cle) + '">' + e(d.titre) + "</a>"; }).join(" · ") + ' · <a href="#/constats">constats</a></p>';
    }
    h += '<p style="color:var(--sourd);margin-top:14px">' + liste.length + " surface(s) affichée(s)" + (liste.length !== A.surfaces.length && !groupe ? " sur " + A.surfaces.length : "") + ".</p>";
    if (!liste.length) return h + '<div class="vide">Aucune surface ne correspond aux filtres.</div>';
    var groupes = groupe ? [groupe] : A.groupes;
    groupes.forEach(function (g2) {
      var l = liste.filter(function (s) { return s.groupe === g2; });
      if (!l.length) return;
      if (!groupe) h += '<div class="titre-section"><h2><a href="#/domaine/' + encodeURIComponent(g2) + '" style="color:inherit;text-decoration:none">' + e(g2) + "</a></h2><small>" + l.length + " surface(s)</small></div>";
      h += '<div class="grille">' + l.map(tuile).join("") + "</div>";
    });
    return h;
  }

  function blocConstat(c, compact) {
    var h = '<article class="constat ' + e(c.priorite) + '" id="c-' + e(c.id) + '"><div class="constat-tete">' + lienId(c.id) + etiquette("priorite", c.priorite) + '<span class="et et-neutre">' + e(c.nature) + '</span><span class="et et-neutre">' + e(c.type) + "</span>" + (c.sensible ? '<span class="et et-sensible">sensible</span>' : "") + "</div><h3>" + e(c.titre) + "</h3>";
    if (compact) return h + '<p style="margin:6px 0 0;color:var(--encre-2)">' + riche(c.proposition) + "</p></article>";
    h += "<dl><dt>Emplacement</dt><dd>" + riche(c.emplacement) + "</dd><dt>Preuve</dt><dd>" + riche(c.preuve) + "</dd><dt>Problème rencontré</dt><dd>" + riche(c.probleme) + "</dd><dt>Situation déclenchante</dt><dd>" + riche(c.declencheur) + "</dd><dt>Conséquence pour l'utilisateur</dt><dd>" + riche(c.consequence) + "</dd><dt>Proposition recommandée</dt><dd><strong>" + riche(c.proposition) + "</strong></dd>";
    h += "<dt>Priorité · gravité</dt><dd>" + e(c.priorite) + " · gravité " + e(c.gravite) + "/4</dd><dt>Effort · risque technique</dt><dd>" + e(c.effort) + " · " + e(c.risqueTechnique) + "</dd><dt>Dépendances</dt><dd>" + riche(c.dependances) + "</dd><dt>Risque de régression</dt><dd>" + riche(c.risqueRegression) + '</dd><dt>Critère d\'acceptation</dt><dd><div class="acceptation">' + riche(c.critereAcceptation) + "</div></dd>";
    if (c.fichiers && c.fichiers.length) h += "<dt>Fichiers probables</dt><dd>" + c.fichiers.map(function (f) { return "<code>" + e(f) + "</code>"; }).join(" ") + "</dd>";
    var vis = (c.visuels || []).concat(c.surfaces || []).filter(function (x, i, t) { return t.indexOf(x) === i; });
    if (vis.length) {
      h += '<dt>Surfaces et visuels</dt><dd><div class="vignettes">' + vis.map(function (id) {
        var s = surfParId[id], f = s ? premiereFiche(s) : ficheDe(id);
        return '<a href="#/surface/' + e(id) + '">' + (f && f.avant ? '<img loading="lazy" src="../' + e(f.avant.fichier) + '" alt="">' : "") + e(id) + "</a>";
      }).join("") + "</div></dd>";
    }
    return h + "</dl></article>";
  }

  var mode = memo("mode", "cote"), epingles = memo("epingles", "1") === "1";
  function imgEcran(f, img, quoi, annotations) {
    var w = largeurCss(f, img), large = w > 500;
    var h = '<div class="ecran' + (large ? " large" : "") + '" style="width:' + (large ? "100%" : w + "px") + ';max-width:100%">';
    h += '<img src="../' + e(img.fichier) + '" width="' + w + '" alt="' + e(quoi) + '" data-agrandir="' + e(img.fichier) + '" data-largeur="' + w + '" data-titre="' + e(quoi) + '">';
    (annotations || []).forEach(function (a) { if (a.x != null && a.trouve !== false) h += '<span class="epingle" style="left:' + (a.x * 100) + "%;top:" + (a.y * 100) + '%">' + e(a.n) + "</span>"; });
    return h + "</div>";
  }
  function manquant(titre, raison) { return '<div class="manquant"><div><b>' + e(titre) + "</b>" + e(raison || "") + "</div></div>"; }
  function vueSurface(id, vueDemandee) {
    var s = surfParId[id];
    var fiches = s ? fichesDeSurface(s) : (A.captures[id] ? Object.keys(A.captures[id]).map(function (v) { return A.captures[id][v]; }) : []);
    if (!s && !fiches.length) return '<div class="vide">Surface inconnue : ' + e(id) + "</div>";
    if (!s) s = { id: id, surface: (fiches[0] && fiches[0].titre) || id, composant: "", etat: "", role: "", geste: "", preuve: "capture complémentaire (hors registre)", problemes: [], observation: "observe", verdict: "a-verifier", visuel: "avant", groupe: "", justification: "", captures: [id] };
    var idx = A.surfaces.indexOf(s), prec = A.surfaces[idx - 1], suiv = A.surfaces[idx + 1];
    var h = '<div class="fil-ariane"><a href="#/">Vue d\'ensemble</a> › <a href="#/domaine/' + encodeURIComponent(s.groupe) + '">' + e(s.groupe) + "</a> › " + e(s.id) + '<span style="float:right">' + (prec ? '<a href="#/surface/' + e(prec.id) + '">← ' + e(prec.id) + "</a>" : "") + (suiv ? ' &nbsp; <a href="#/surface/' + e(suiv.id) + '">' + e(suiv.id) + " →</a>" : "") + "</span></div>";
    h += "<h1>" + e(s.surface) + (s.composant ? ' <span style="font-weight:600;color:var(--encre-2)">— ' + e(s.composant) + "</span>" : "") + "</h1>";
    h += '<div class="fiche-tete"><span class="id">' + e(s.id) + "</span>" + etiquette("observation", s.observation) + etiquette("verdict", s.verdict) + etiquette("visuel", s.visuel).replace("et-" + s.visuel, "et-neutre") + "</div>";
    h += '<div class="bloc"><dl class="meta"><dt>État</dt><dd>' + riche(s.etat) + "</dd><dt>Rôle utilisateur</dt><dd>" + riche(s.role) + "</dd><dt>Geste à effectuer</dt><dd>" + riche(s.geste) + "</dd><dt>Preuve</dt><dd>" + riche(s.preuve) + "</dd>" + (s.proposition ? "<dt>Proposition</dt><dd><strong>" + riche(s.proposition) + "</strong></dd>" : "") + "<dt>Verdict</dt><dd>" + e(L.verdict[s.verdict] || s.verdict) + " — " + riche(s.justification) + "</dd></dl></div>";

    if (!fiches.length) {
      h += '<div class="comparaison" style="margin-top:22px">' + manquant("Avant non capturé", L.observation[s.observation] + ".") + "</div>";
    } else {
      var vues = fiches.map(function (f) { return f.id + "|" + f.vue; });
      var cle = vueDemandee && vues.indexOf(vueDemandee) >= 0 ? vueDemandee : (fiches.filter(function (f) { return f.vue === "m390"; })[0] ? fiches.filter(function (f) { return f.vue === "m390"; })[0].id + "|m390" : vues[0]);
      var f = fiches[vues.indexOf(cle)];
      h += '<div class="barre-outils">';
      if (fiches.length > 1) h += '<div class="segments" role="group" aria-label="Capture et gabarit">' + fiches.map(function (x) { var k = x.id + "|" + x.vue; return '<button type="button" data-vue="' + e(k) + '" aria-pressed="' + (k === cle) + '">' + (x.id !== s.id ? e(x.id) + " · " : "") + e(x.vue) + "</button>"; }).join("") + "</div>";
      if (f.apres) h += '<div class="segments" role="group" aria-label="Mode de comparaison">' + [["cote", "Côte à côte"], ["bascule", "Bascule"], ["curseur", "Curseur"]].map(function (m) { return '<button type="button" data-mode="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '">' + m[1] + "</button>"; }).join("") + "</div>";
      h += '<label class="case"><input type="checkbox" id="caseEpingles"' + (epingles ? " checked" : "") + "> Annotations numérotées</label>";
      h += '<span style="color:var(--sourd);font-size:13px">' + e(f.gabarit) + " · " + e(f.moteur) + " " + e(f.version || "") + " · mode " + e(f.mode) + " · émulation</span></div>";
      if (f.titre) h += '<p style="margin:0 0 12px;color:var(--encre-2)">' + riche(f.titre) + (f.note ? " — " + riche(f.note) : "") + "</p>";

      var avantHtml = imgEcran(f, f.avant, "AVANT — " + s.id + " (" + f.vue + ")", f.annotationsAvant);
      h += '<div class="comparaison' + (epingles ? "" : " sans-epingles") + '" id="comparaison">';
      if (!f.apres) {
        h += '<div class="volet"><div class="volet-titre"><span class="pastille"></span>Avant <small>capture réelle de la version auditée</small></div>' + avantHtml + "</div>";
        h += '<div class="volet apres"><div class="volet-titre"><span class="pastille"></span>Après</div>' + manquant(s.verdict === "a-conserver" ? "Rien à changer" : "Pas de maquette", s.verdict === "a-conserver" ? "Cette surface fonctionne : elle est à conserver telle quelle." : "Aucune proposition visuelle pour cette capture.") + "</div>";
      } else if (mode === "bascule") {
        h += '<div class="volet apres" id="voletBascule"><div class="volet-titre"><span class="pastille"></span><span id="basculeLib">Après</span> <small>cliquer sur le bouton ou presser Espace pour alterner</small></div><div id="basculeScene">' + imgEcran(f, f.apres, "APRÈS — " + s.id, f.annotations) + '</div><p><button type="button" class="puce" id="basculeBtn" aria-pressed="true">Voir l\'avant</button></p></div>';
      } else if (mode === "curseur") {
        var w = largeurCss(f, f.avant);
        h += '<div class="volet"><div class="volet-titre"><span class="pastille"></span>Avant ◂ ▸ Après <small>déplacer le curseur</small></div><div class="ecran' + (w > 500 ? " large" : "") + '" style="width:' + (w > 500 ? "100%" : w + "px") + ';max-width:100%"><div class="curseur-scene" id="curseurScene"><img src="../' + e(f.avant.fichier) + '" width="' + w + '" alt="Avant"><div class="dessus" id="curseurDessus" style="width:50%"><img src="../' + e(f.apres.fichier) + '" alt="Après"></div><div class="curseur-trait" id="curseurTrait" style="left:50%"></div></div></div><input class="curseur-plage" id="curseurPlage" type="range" min="0" max="100" value="50" aria-label="Part de la maquette après affichée"></div>';
      } else {
        h += '<div class="volet"><div class="volet-titre"><span class="pastille"></span>Avant <small>capture réelle de la version auditée</small></div>' + avantHtml + "</div>";
        h += '<div class="volet apres"><div class="volet-titre"><span class="pastille"></span>Après <small>maquette de proposition, non implémentée</small></div>' + imgEcran(f, f.apres, "APRÈS (maquette) — " + s.id + " (" + f.vue + ")", f.annotations) + "</div>";
      }
      h += "</div>";
      var notes = (f.annotations || []).filter(function (a) { return a.texte; }), notesAv = (f.annotationsAvant || []).filter(function (a) { return a.texte; });
      if (notesAv.length) h += '<h3 style="margin-top:20px">Ce que montre l\'avant</h3><ol class="annotations">' + notesAv.map(function (a) { return '<li><span class="n">' + e(a.n) + "</span><span>" + riche(a.texte) + "</span></li>"; }).join("") + "</ol>";
      if (notes.length) h += '<h3 style="margin-top:20px">Ce que change l\'après</h3><ol class="annotations">' + notes.map(function (a) { return '<li><span class="n">' + e(a.n) + "</span><span>" + riche(a.texte) + "</span></li>"; }).join("") + "</ol>";
      var za = (f.avant.zooms || []).filter(function (z) { return z.fichier; }), zp = f.apres ? (f.apres.zooms || []).filter(function (z) { return z.fichier; }) : [];
      if (za.length || zp.length) {
        var noms = za.map(function (z) { return z.nom; }).concat(zp.map(function (z) { return z.nom; })).filter(function (x, i, t) { return t.indexOf(x) === i; });
        h += '<h3 style="margin-top:24px">Gros plans</h3><div class="zooms">' + noms.map(function (n) {
          var a = za.filter(function (z) { return z.nom === n; })[0], p = zp.filter(function (z) { return z.nom === n; })[0];
          var fig = function (z, cls, lib) { return z ? '<figure class="' + cls + '"><figcaption>' + lib + '</figcaption><img loading="lazy" src="../' + e(z.fichier) + '" width="' + Math.round(z.largeur / 2) + '" alt="' + e(lib + " — " + (z.titre || n)) + '" data-agrandir="' + e(z.fichier) + '" data-largeur="' + Math.round(z.largeur / 2) + '" data-titre="' + e(lib + " — " + (z.titre || n)) + '"></figure>' : ""; };
          return '<div class="zoom"><h4>' + e((a || p).titre || n) + '</h4><div class="zoom-paire">' + fig(a, "", "Avant") + fig(p, "apres", "Après") + "</div></div>";
        }).join("") + "</div>";
      }
      // Mesures automatiques.
      var m = f.mesures;
      if (m || (f.erreurs && f.erreurs.js && f.erreurs.js.length)) {
        h += '<details class="mesures"><summary>Mesures automatiques de l\'avant (' + e(f.vue) + ") — indices à vérifier à l'œil</summary>";
        if (m) {
          h += "<p><strong>Cibles tactiles sous 44 px :</strong> " + m.cibles.liste.length + " (sur " + m.cibles.total + " commandes visibles)</p>" + (m.cibles.liste.length ? "<ul>" + m.cibles.liste.map(function (c) { return "<li>" + e(c.texte || "(sans texte)") + " — " + c.w + " × " + c.h + " px <code>" + e(c.el) + "</code></li>"; }).join("") + "</ul>" : "");
          h += "<p><strong>Champs sous 16 px :</strong> " + m.champs.liste.length + " (sur " + m.champs.total + ")</p>" + (m.champs.liste.length ? "<ul>" + m.champs.liste.map(function (c) { return "<li>" + e(c.texte || "") + " — " + c.px + " px <code>" + e(c.el) + "</code></li>"; }).join("") + "</ul>" : "");
          h += "<p><strong>Contrastes sous le seuil AA :</strong> " + m.contraste.nb + " (sur " + m.contraste.juges + " textes jugés, " + m.contraste.indetermines + " indéterminés sur image)</p>" + (m.contraste.liste.length ? "<ul>" + m.contraste.liste.map(function (c) { return "<li>« " + e(c.texte) + " » — " + c.ratio + ":1 (seuil " + c.seuil + ":1), " + e(c.couleur) + " sur " + e(c.fond) + ", " + c.px + " px</li>"; }).join("") + "</ul>" : "");
          if (m.sansNom.length) h += "<p><strong>Commandes sans nom accessible :</strong> " + m.sansNom.length + "</p><ul>" + m.sansNom.map(function (c) { return "<li><code>" + e(c.el) + "</code></li>"; }).join("") + "</ul>";
          if (m.champsSansEtiquette && m.champsSansEtiquette.length) h += "<p><strong>Champs sans étiquette :</strong> " + m.champsSansEtiquette.length + "</p><ul>" + m.champsSansEtiquette.map(function (c) { return "<li><code>" + e(c.el) + "</code> " + e(c.placeholder) + "</li>"; }).join("") + "</ul>";
          if (m.debordement && (m.debordement.page || m.debordement.elements.length)) h += "<p><strong>Débordement horizontal :</strong> " + (m.debordement.page ? "la page déborde (" + m.debordement.largeurDocument + " px). " : "") + m.debordement.elements.map(function (x) { return "<code>" + e(x.el) + "</code>"; }).join(", ") + "</p>";
          if (m.tronques.length) h += "<p><strong>Textes tronqués :</strong></p><ul>" + m.tronques.map(function (c) { return "<li>« " + e(c.texte) + " » (" + e(c.mode) + ")</li>"; }).join("") + "</ul>";
        }
        if (f.erreurs && f.erreurs.js && f.erreurs.js.length) h += "<p><strong>Erreurs JavaScript de la page :</strong></p><ul>" + f.erreurs.js.map(function (x) { return "<li><code>" + e(x) + "</code></li>"; }).join("") + "</ul>";
        if (f.reseauRefuse && f.reseauRefuse.length) h += "<p><strong>Hôtes tiers refusés par le banc (peuvent déformer l'écran) :</strong> " + f.reseauRefuse.map(function (x) { return "<code>" + e(x) + "</code>"; }).join(", ") + "</p>";
        h += "</details>";
      }
    }
    var cons = (s.problemes || []).map(function (c) { return consParId[c]; }).filter(Boolean);
    h += '<h2 style="margin-top:30px">Constats liés (' + cons.length + ")</h2>";
    h += cons.length ? cons.map(function (c) { return blocConstat(c, false); }).join("") : '<div class="vide">Aucun constat : cette surface est ' + e((L.verdict[s.verdict] || "").toLowerCase()) + ".</div>";
    return h;
  }

  var tri = { cle: "priorite", sens: 1 };
  function vueConstats() {
    var l = A.constats.filter(passeConstat);
    var ordre = { P0: 0, P1: 1, P2: 2, P3: 3 };
    l.sort(function (a, b) {
      var x = tri.cle === "priorite" ? ordre[a.priorite] - ordre[b.priorite] || (b.gravite || 0) - (a.gravite || 0) : String(a[tri.cle] == null ? "" : a[tri.cle]).localeCompare(String(b[tri.cle] == null ? "" : b[tri.cle]), "fr", { numeric: true });
      return x * tri.sens || a.id.localeCompare(b.id);
    });
    var th = function (cle, lib) { return '<th><button type="button" data-tri="' + cle + '">' + lib + "</button></th>"; };
    var h = '<div class="fil-ariane"><a href="#/">Vue d\'ensemble</a> › Constats</div><h1>Constats</h1><p class="chapo">Priorité, gravité du problème, risque technique du changement et effort sont quatre notions séparées. Aucun gain chiffré n\'est présenté comme mesuré.</p><p style="color:var(--sourd)">' + l.length + " constat(s) affiché(s) sur " + A.constats.length + ". Les filtres de priorité et la recherche s'appliquent.</p>";
    if (!l.length) return h + '<div class="vide">Aucun constat ne correspond.</div>';
    h += '<div class="bloc"><div class="table-defile"><table><thead><tr>' + th("id", "ID") + th("priorite", "Priorité") + th("gravite", "Gravité") + th("nature", "Nature") + th("type", "Type") + th("effort", "Effort") + th("risqueTechnique", "Risque") + th("groupe", "Domaine") + th("titre", "Constat") + "</tr></thead><tbody>";
    l.forEach(function (c) { h += '<tr data-href="#/constat/' + e(c.id) + '"><td>' + lienId(c.id) + "</td><td>" + etiquette("priorite", c.priorite) + "</td><td>" + e(c.gravite) + "/4</td><td>" + e(c.nature) + "</td><td>" + e(c.type) + "</td><td>" + e(c.effort) + "</td><td>" + e(c.risqueTechnique) + "</td><td>" + e(c.groupe) + "</td><td>" + e(c.titre) + (c.sensible ? ' <span class="et et-sensible">sensible</span>' : "") + "</td></tr>"; });
    return h + "</tbody></table></div></div>";
  }
  function vueConstat(id) {
    var c = consParId[id];
    if (!c) return '<div class="vide">Constat inconnu : ' + e(id) + "</div>";
    return '<div class="fil-ariane"><a href="#/">Vue d\'ensemble</a> › <a href="#/constats">Constats</a> › ' + e(id) + "</div><h1>" + e(c.titre) + "</h1>" + blocConstat(c, false);
  }
  function vueLots() {
    var h = '<div class="fil-ariane"><a href="#/">Vue d\'ensemble</a> › Lots</div><h1>Ordre de réalisation par lots</h1><p class="chapo">Chaque lot est un ensemble cohérent, livrable par une PR, avec son résultat attendu, ses critères d\'acceptation, son niveau de risque et sa stratégie de retour arrière.</p>';
    if (!A.lots.length) return h + '<div class="vide">Les lots ne sont pas encore définis.</div>';
    A.lots.forEach(function (l) {
      h += '<article class="bloc lot"><div class="constat-tete"><span class="id">' + e(l.id) + '</span><span class="et et-neutre">' + e(l.vague) + '</span><span class="et ' + (l.risque === "critique" ? "et-P0" : "et-neutre") + '">risque ' + e(l.risque) + "</span></div><h2>" + e(l.titre) + '</h2><dl class="meta" style="margin-top:10px"><dt>Résultat utilisateur</dt><dd>' + riche(l.resultat) + "</dd><dt>Périmètre</dt><dd>" + riche(l.perimetre) + "</dd><dt>Constats couverts</dt><dd>" + (l.constats || []).map(lienId).join(" ") + "</dd><dt>Critères d'acceptation</dt><dd><ul style=\"margin:0;padding-left:18px\">" + (l.criteres || []).map(function (x) { return "<li>" + riche(x) + "</li>"; }).join("") + "</ul></dd><dt>Fichiers / systèmes</dt><dd>" + (l.fichiers || []).map(function (f) { return "<code>" + e(f) + "</code>"; }).join(" ") + "</dd><dt>Vérifications</dt><dd>" + riche(l.verifications) + "</dd><dt>Pilotage / Sentinelle</dt><dd>" + riche(l.pilotage) + "</dd><dt>Métrique utile</dt><dd>" + riche(l.metrique) + "</dd><dt>Retour arrière</dt><dd>" + riche(l.retourArriere) + "</dd></dl></article>";
    });
    return h;
  }
  function vuePrototypes() {
    var h = '<div class="fil-ariane"><a href="#/">Vue d\'ensemble</a> › Prototypes</div><h1>Prototypes des parcours majeurs</h1><p class="chapo">Maquettes interactives isolées : elles montrent l\'enchaînement proposé, ne contiennent aucune donnée réelle et ne modifient pas l\'application.</p>';
    if (!A.prototypes.length) return h + '<div class="vide">Aucun prototype référencé.</div>';
    h += '<div class="liste-docs">' + A.prototypes.map(function (p) { return '<a href="../' + e(p.fichier) + '" target="_blank" rel="noopener"><strong>' + e(p.titre) + "</strong><small>" + e(p.description) + "</small><small>Constats : " + e((p.constats || []).join(", ")) + "</small></a>"; }).join("") + "</div>";
    return h;
  }
  function vueDocuments() {
    var docs = A.documents || [];
    var h = '<div class="fil-ariane"><a href="#/">Vue d\'ensemble</a> › Dossier</div><h1>Le dossier d\'audit</h1><p class="chapo">Tous les documents du dossier, lisibles ici. Les mêmes fichiers existent en Markdown dans le dossier <code>docs/audit-ux-ui-2026-11-10/</code>.</p>';
    [["dossier", "Documents principaux"], ["rapport", "Rapports détaillés par domaine"], ["methode", "Méthode et outillage"]].forEach(function (t) {
      var l = docs.filter(function (d) { return d.type === t[0]; });
      if (!l.length) return;
      h += '<div class="titre-section"><h2>' + t[1] + '</h2></div><div class="liste-docs">' + l.map(function (d) { return '<a href="#/doc/' + encodeURIComponent(d.cle) + '"><strong>' + e(d.titre) + "</strong><small>" + e(d.fichier) + "</small></a>"; }).join("") + "</div>";
    });
    return h;
  }
  function vueDoc(cle) {
    var d = (A.documents || []).filter(function (x) { return x.cle === cle; })[0];
    if (!d) return '<div class="vide">Document inconnu.</div>';
    return '<div class="fil-ariane"><a href="#/">Vue d\'ensemble</a> › <a href="#/documents">Dossier</a> › ' + e(d.fichier) + '</div><div class="doc">' + md(d.md) + "</div>";
  }

  // ── Routeur ──────────────────────────────────────────────────────────────
  var vueCourante = null;
  function router() {
    var h = location.hash || "#/", m;
    var onglet = "#/", groupe = null, html;
    if ((m = /^#\/surface\/([^/?]+)(?:\?vue=(.+))?$/.exec(h))) { onglet = "#/surfaces"; var s = surfParId[decodeURIComponent(m[1])]; groupe = s ? s.groupe : null; vueCourante = { id: decodeURIComponent(m[1]) }; html = vueSurface(vueCourante.id, m[2] ? decodeURIComponent(m[2]) : null); }
    else if ((m = /^#\/domaine\/(.+)$/.exec(h))) { onglet = "#/surfaces"; groupe = decodeURIComponent(m[1]); html = vueSurfaces(groupe); }
    else if (h === "#/surfaces") { onglet = h; groupe = "*"; html = vueSurfaces(null); }
    else if (h === "#/constats") { onglet = h; html = vueConstats(); }
    else if ((m = /^#\/constat\/(.+)$/.exec(h))) { onglet = "#/constats"; html = vueConstat(decodeURIComponent(m[1])); }
    else if (h === "#/lots") { onglet = h; html = vueLots(); }
    else if (h === "#/prototypes") { onglet = h; html = vuePrototypes(); }
    else if (h === "#/documents") { onglet = h; html = vueDocuments(); }
    else if ((m = /^#\/doc\/(.+)$/.exec(h))) { onglet = "#/documents"; html = vueDoc(decodeURIComponent(m[1])); }
    else html = vueEnsemble();
    peindreOnglets(onglet); peindreRail(groupe);
    contenu.innerHTML = html;
    brancher();
  }
  var dernierHash = null;
  window.addEventListener("hashchange", function () { router(); if (location.hash !== dernierHash) window.scrollTo(0, 0); dernierHash = location.hash; });

  function brancher() {
    var c = document.getElementById("caseEpingles");
    if (c) c.addEventListener("change", function () { epingles = c.checked; retenir("epingles", epingles ? "1" : "0"); var z = document.getElementById("comparaison"); if (z) z.classList.toggle("sans-epingles", !epingles); });
    var plage = document.getElementById("curseurPlage");
    if (plage) {
      var maj = function () { var d = document.getElementById("curseurDessus"), sc = document.getElementById("curseurScene"); d.style.width = plage.value + "%"; document.getElementById("curseurTrait").style.left = plage.value + "%"; var im = d.querySelector("img"); im.style.width = sc.clientWidth + "px"; im.style.height = "auto"; };
      plage.addEventListener("input", maj); window.setTimeout(maj, 50); window.addEventListener("resize", maj);
    }
    var bb = document.getElementById("basculeBtn");
    if (bb && vueCourante) {
      var surApres = true;
      var alterner = function () {
        surApres = !surApres;
        var s = surfParId[vueCourante.id]; var fiches = s ? fichesDeSurface(s) : []; var actif = contenu.querySelector("[data-vue][aria-pressed='true']");
        var f = actif ? fiches.filter(function (x) { return x.id + "|" + x.vue === actif.getAttribute("data-vue"); })[0] : (fiches.filter(function (x) { return x.vue === "m390"; })[0] || fiches[0]);
        if (!f) return;
        document.getElementById("basculeScene").innerHTML = surApres ? imgEcran(f, f.apres, "APRÈS — " + f.id, f.annotations) : imgEcran(f, f.avant, "AVANT — " + f.id, f.annotationsAvant);
        document.getElementById("basculeLib").textContent = surApres ? "Après" : "Avant";
        document.getElementById("voletBascule").classList.toggle("apres", surApres);
        bb.textContent = surApres ? "Voir l'avant" : "Voir l'après"; bb.setAttribute("aria-pressed", String(surApres));
      };
      bb.addEventListener("click", alterner);
      contenu._alterner = alterner;
    } else contenu._alterner = null;
  }
  contenu.addEventListener("click", function (ev) {
    var t = ev.target;
    var b = t.closest("[data-mode]"); if (b) { mode = b.getAttribute("data-mode"); retenir("mode", mode); router(); return; }
    b = t.closest("[data-vue]"); if (b && vueCourante) { contenu.innerHTML = vueSurface(vueCourante.id, b.getAttribute("data-vue")); brancher(); return; }
    b = t.closest("[data-tri]"); if (b) { var k = b.getAttribute("data-tri"); tri = { cle: k, sens: tri.cle === k ? -tri.sens : 1 }; router(); return; }
    b = t.closest("[data-agrandir]"); if (b) { ouvrirVisionneuse(b); return; }
    var tr = t.closest("tr[data-href]"); if (tr && !t.closest("a")) { location.hash = tr.getAttribute("data-href"); }
  });
  document.addEventListener("keydown", function (ev) {
    if (!vis.hidden) { if (ev.key === "Escape") fermerVisionneuse(); if (ev.key === "+" || ev.key === "=") zoomer(0.25); if (ev.key === "-") zoomer(-0.25); return; }
    if (ev.key === " " && contenu._alterner && !/INPUT|TEXTAREA|BUTTON|SELECT/.test(document.activeElement.tagName)) { ev.preventDefault(); contenu._alterner(); }
  });

  // ── Visionneuse (agrandissement) ─────────────────────────────────────────
  var vis = document.getElementById("visionneuse"), visImg = document.getElementById("visImg"), echelle = 1.5, base = 390, retour = null;
  function appliquerZoom() { visImg.style.width = Math.round(base * echelle) + "px"; document.getElementById("visZoom").textContent = Math.round(echelle * 100) + " %"; }
  function zoomer(d) { echelle = Math.max(0.5, Math.min(4, echelle + d)); appliquerZoom(); }
  function ouvrirVisionneuse(img) {
    retour = document.activeElement;
    base = Number(img.getAttribute("data-largeur")) || 390;
    echelle = base > 500 ? 1 : 1.75;
    visImg.src = "../" + img.getAttribute("data-agrandir"); visImg.alt = img.getAttribute("data-titre") || "";
    document.getElementById("visTitre").textContent = img.getAttribute("data-titre") || "";
    vis.hidden = false; appliquerZoom(); document.getElementById("visFermer").focus(); document.body.style.overflow = "hidden";
  }
  function fermerVisionneuse() { vis.hidden = true; document.body.style.overflow = ""; if (retour && retour.focus) retour.focus(); }
  document.getElementById("visFermer").addEventListener("click", fermerVisionneuse);
  document.getElementById("visPlus").addEventListener("click", function () { zoomer(0.25); });
  document.getElementById("visMoins").addEventListener("click", function () { zoomer(-0.25); });
  document.getElementById("visScene").addEventListener("click", function (ev) { if (ev.target.id === "visScene") fermerVisionneuse(); });

  router();
})();
