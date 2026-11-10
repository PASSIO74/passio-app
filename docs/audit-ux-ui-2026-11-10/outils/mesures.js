// ═══════════════════════════════════════════════════════════════════════════
// AUDIT UX/UI 2026-11-10 — SONDE DE MESURE (exécutée DANS la page)
//
// `mesurerDansLaPage` est sérialisée puis évaluée par Playwright : elle ne peut
// donc rien lire hors de sa propre portée. Elle ne modifie rien dans la page.
//
// Ce qu'elle mesure sur ce qui est VISIBLE à l'écran au moment de la capture :
//   · cibles tactiles sous 44 px — la zone est sondée par `elementFromPoint`
//     (règle de docs/lots-ui/INDEX.md : jamais par getComputedStyle(::after)),
//     donc une zone élargie par un pseudo-élément est comptée à sa vraie taille ;
//   · champs de saisie sous 16 px (zoom automatique d'iOS au focus) ;
//   · contrastes de texte sous le seuil AA (4,5:1 ; 3:1 pour un grand texte) —
//     le fond est le premier fond OPAQUE en remontant ; un fond en image ou en
//     dégradé rend la mesure « indéterminée » (comptée à part, jamais en défaut) ;
//   · commandes sans nom accessible ;
//   · débordement horizontal de la page ;
//   · textes tronqués par une ellipse.
//
// LIMITES ASSUMÉES : une opacité portée par un ANCÊTRE n'est pas composée ; un
// texte posé sur une image n'est pas jugé ; la sonde ne voit que la zone visible.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";

function mesurerDansLaPage(options) {
  options = options || {};
  var vw = window.innerWidth, vh = window.innerHeight;
  var racine = options.racine ? document.querySelector(options.racine) : document.body;
  if (!racine) racine = document.body;

  function chemin(el) {
    var parts = [];
    var n = el;
    for (var i = 0; n && n.nodeType === 1 && i < 4; i++) {
      var s = n.tagName.toLowerCase();
      if (n.id) { s += "#" + n.id; parts.unshift(s); break; }
      var cls = (typeof n.className === "string" ? n.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) s += "." + cls.join(".");
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(" > ");
  }
  function texteCourt(el) {
    var t = (el.getAttribute("aria-label") || el.innerText || el.textContent || el.getAttribute("title") || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim();
    return t.slice(0, 60);
  }
  function estAuDessus(el, x, y) {
    if (x < 0 || y < 0 || x >= vw || y >= vh) return false;
    var top = document.elementFromPoint(x, y);
    return !!top && (top === el || el.contains(top));
  }
  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return false;
    var cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
    var cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
    var cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    var top = document.elementFromPoint(cx, cy);
    return !!top && (top === el || el.contains(top) || top.contains(el));
  }
  // Zone réellement touchable autour du centre : on marche de 2 px en 2 px tant
  // que `elementFromPoint` rend l'élément ou l'un de ses descendants.
  function zoneTactile(el) {
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (!estAuDessus(el, cx, cy)) return { w: Math.round(r.width), h: Math.round(r.height), sonde: false };
    var g = 0, d = 0, h = 0, b = 0, pas = 1, max = 120;
    while (g < max && estAuDessus(el, cx - g - pas, cy)) g += pas;
    while (d < max && estAuDessus(el, cx + d + pas, cy)) d += pas;
    while (h < max && estAuDessus(el, cx, cy - h - pas)) h += pas;
    while (b < max && estAuDessus(el, cx, cy + b + pas)) b += pas;
    var w = g + d + 1, ht = h + b + 1;
    // La sonde avance au pixel entier : quand elle retrouve la boîte à 2 px près,
    // c'est la boîte (mesure exacte, sous-pixel) qui fait foi ; sinon la zone est
    // élargie par un pseudo-élément ou rognée par un voisin, et la sonde fait foi.
    if (Math.abs(w - r.width) <= 2) w = Math.round(r.width * 10) / 10;
    if (Math.abs(ht - r.height) <= 2) ht = Math.round(r.height * 10) / 10;
    return { w: w, h: ht, sonde: true };
  }

  // ── Couleurs et contraste ────────────────────────────────────────────────
  function lireCouleur(str) {
    var m = /rgba?\(([^)]+)\)/.exec(str || "");
    if (!m) return null;
    var p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function luminance(c) {
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function ratio(a, b) {
    var la = luminance(a), lb = luminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
  function composer(dessus, dessous) {
    var a = dessus.a;
    return { r: Math.round(dessus.r * a + dessous.r * (1 - a)), g: Math.round(dessus.g * a + dessous.g * (1 - a)), b: Math.round(dessus.b * a + dessous.b * (1 - a)), a: 1 };
  }
  // Premier fond opaque en remontant. `null` = indéterminé (image, dégradé).
  function fondEffectif(el) {
    var couches = [];
    var n = el;
    while (n && n.nodeType === 1) {
      var cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      var c = lireCouleur(cs.backgroundColor);
      if (c && c.a > 0) {
        couches.push(c);
        if (c.a >= 0.999) break;
      }
      n = n.parentElement;
    }
    if (!n) couches.push({ r: 255, g: 255, b: 255, a: 1 });
    var fond = couches[couches.length - 1];
    fond = { r: fond.r, g: fond.g, b: fond.b, a: 1 };
    for (var i = couches.length - 2; i >= 0; i--) fond = composer(couches[i], fond);
    return fond;
  }
  function hex(c) { return "#" + [c.r, c.g, c.b].map(function (v) { return ("0" + Math.max(0, Math.min(255, v)).toString(16)).slice(-2); }).join(""); }

  var res = {
    fenetre: { w: vw, h: vh },
    cibles: { total: 0, sous44: [] },
    champs: { total: 0, sous16: [] },
    contraste: { juges: 0, indetermines: 0, sousSeuil: [] },
    sansNom: [],
    debordement: { page: false, largeurDocument: document.documentElement.scrollWidth, elements: [] },
    tronques: [],
    viewportMeta: (document.querySelector('meta[name="viewport"]') || { content: "" }).content || "",
  };

  // ── 1. Cibles tactiles ───────────────────────────────────────────────────
  var SEL_CIBLES = 'a[href], button, [role="button"], [role="tab"], [role="link"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], input:not([type="hidden"]), select, textarea, summary, [onclick], [tabindex]:not([tabindex="-1"])';
  var vues = new Set();
  var cibles = [];
  racine.querySelectorAll(SEL_CIBLES).forEach(function (el) {
    if (!visible(el)) return;
    // Une cible imbriquée dans une autre cible : on garde la plus interne seulement
    // si elle porte sa propre action (onclick/bouton), sinon le parent suffit.
    cibles.push(el);
  });
  cibles.forEach(function (el) {
    if (vues.has(el)) return;
    vues.add(el);
    // Un conteneur cliquable qui CONTIENT d'autres cibles visibles n'est pas une
    // « petite cible » : c'est une zone, on ne la juge pas.
    var contientCible = false;
    for (var i = 0; i < cibles.length; i++) { if (cibles[i] !== el && el.contains(cibles[i])) { contientCible = true; break; } }
    res.cibles.total++;
    var z = zoneTactile(el);
    if (!contientCible && (z.w < 43.95 || z.h < 43.95)) {
      // Un lien dans un paragraphe (cible en ligne) relève d'une autre règle : on le marque.
      var enLigne = getComputedStyle(el).display === "inline";
      res.cibles.sous44.push({ el: chemin(el), texte: texteCourt(el), w: z.w, h: z.h, enLigne: enLigne });
    }
  });

  // ── 2. Champs de saisie ──────────────────────────────────────────────────
  racine.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]), textarea, select, [contenteditable="true"]').forEach(function (el) {
    if (!visible(el)) return;
    res.champs.total++;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) res.champs.sous16.push({ el: chemin(el), texte: texteCourt(el), px: Math.round(fs * 10) / 10 });
  });

  // ── 3. Contraste des textes ──────────────────────────────────────────────
  var marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, null);
  var dejaVu = new Set();
  var noeud;
  while ((noeud = marcheur.nextNode())) {
    var txt = (noeud.nodeValue || "").replace(/\s+/g, " ").trim();
    if (txt.length < 2) continue;
    var el = noeud.parentElement;
    if (!el || dejaVu.has(el)) continue;
    dejaVu.add(el);
    if (/^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(el.tagName)) continue;
    if (!visible(el)) continue;
    // Un texte fait seulement d'emojis / de symboles n'a pas de couleur de texte à juger.
    if (!/[A-Za-zÀ-ÿ0-9]/.test(txt)) continue;
    var cs = getComputedStyle(el);
    var coul = lireCouleur(cs.color);
    if (!coul) continue;
    var fond = fondEffectif(el);
    if (!fond) { res.contraste.indetermines++; continue; }
    var coulVue = coul.a < 1 ? composer(coul, fond) : coul;
    var op = Number(cs.opacity);
    if (op < 1) coulVue = composer({ r: coulVue.r, g: coulVue.g, b: coulVue.b, a: op }, fond);
    var rt = ratio(coulVue, fond);
    var px = parseFloat(cs.fontSize);
    var gras = Number(cs.fontWeight) >= 700;
    var grand = px >= 24 || (px >= 18.66 && gras);
    var seuil = grand ? 3 : 4.5;
    res.contraste.juges++;
    if (rt < seuil - 0.005) {
      res.contraste.sousSeuil.push({ el: chemin(el), texte: txt.slice(0, 50), ratio: Math.round(rt * 100) / 100, seuil: seuil, couleur: hex(coulVue), fond: hex(fond), px: Math.round(px * 10) / 10 });
    }
  }

  // ── 4. Commandes sans nom accessible ─────────────────────────────────────
  racine.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="link"], [role="menuitem"], input[type="button"], input[type="submit"]').forEach(function (el) {
    if (!visible(el)) return;
    var nom = (el.getAttribute("aria-label") || "").trim();
    if (!nom && el.getAttribute("aria-labelledby")) {
      var ref = document.getElementById(el.getAttribute("aria-labelledby").split(/\s+/)[0]);
      nom = ref ? (ref.textContent || "").trim() : "";
    }
    if (!nom) nom = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!nom) nom = (el.getAttribute("title") || el.getAttribute("value") || "").trim();
    if (!nom) { var img = el.querySelector("img[alt]"); if (img) nom = (img.getAttribute("alt") || "").trim(); }
    if (!nom) { var svgt = el.querySelector("svg title"); if (svgt) nom = (svgt.textContent || "").trim(); }
    if (!nom) res.sansNom.push({ el: chemin(el), html: el.outerHTML.replace(/\s+/g, " ").slice(0, 110) });
  });
  // Champs sans étiquette.
  res.champsSansEtiquette = [];
  racine.querySelectorAll('input:not([type="hidden"]):not([type="file"]), textarea, select').forEach(function (el) {
    if (!visible(el)) return;
    var nom = (el.getAttribute("aria-label") || "").trim() || (el.getAttribute("aria-labelledby") || "").trim();
    if (!nom && el.id) { try { var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (lab) nom = (lab.textContent || "").trim(); } catch (e) {} }
    if (!nom && el.closest("label")) nom = (el.closest("label").textContent || "").trim();
    if (!nom) nom = (el.getAttribute("title") || "").trim();
    if (!nom) res.champsSansEtiquette.push({ el: chemin(el), placeholder: (el.getAttribute("placeholder") || "").slice(0, 50) });
  });

  // ── 5. Débordement horizontal ────────────────────────────────────────────
  res.debordement.page = document.documentElement.scrollWidth > vw + 1;
  if (options.debordementDetail !== false) {
    var tous = racine.querySelectorAll("*");
    for (var k = 0; k < tous.length && res.debordement.elements.length < 12; k++) {
      var e = tous[k];
      var r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= vh) continue;
      if (r.right > vw + 1.5 && r.left < vw) {
        var c2 = getComputedStyle(e);
        if (c2.visibility === "hidden" || c2.display === "none") continue;
        // Un élément qui dépasse DANS un parent défilant horizontalement est voulu (rail).
        var p = e.parentElement, dansRail = false;
        while (p && p !== document.body) {
          var cp = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(cp.overflowX)) { dansRail = true; break; }
          p = p.parentElement;
        }
        if (!dansRail) res.debordement.elements.push({ el: chemin(e), droite: Math.round(r.right), largeur: Math.round(r.width) });
      }
    }
  }

  // ── 6. Textes tronqués ───────────────────────────────────────────────────
  var candidats = racine.querySelectorAll("*");
  for (var q = 0; q < candidats.length && res.tronques.length < 25; q++) {
    var t = candidats[q];
    if (t.children.length > 3) continue;
    var ct = getComputedStyle(t);
    var ellipse = ct.textOverflow === "ellipsis" && /(hidden|clip)/.test(ct.overflowX);
    var pince = ct.webkitLineClamp && ct.webkitLineClamp !== "none";
    if (!ellipse && !pince) continue;
    if (!visible(t)) continue;
    var coupe = ellipse ? t.scrollWidth > t.clientWidth + 1 : t.scrollHeight > t.clientHeight + 1;
    if (coupe) res.tronques.push({ el: chemin(t), texte: (t.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70), mode: ellipse ? "ellipse" : "lignes" });
  }

  // Bornes : on garde des listes lisibles, le total reste exact.
  res.cibles.nbSous44 = res.cibles.sous44.length;
  res.contraste.nbSousSeuil = res.contraste.sousSeuil.length;
  res.cibles.sous44 = res.cibles.sous44.slice(0, 40);
  res.contraste.sousSeuil = res.contraste.sousSeuil.slice(0, 40);
  res.sansNom = res.sansNom.slice(0, 30);
  return res;
}

// Parcours clavier : N tabulations, et pour chaque arrêt, l'élément atteint et
// la présence d'un indicateur de focus (contour ou ombre qui apparaît).
async function parcoursClavier(page, n) {
  const arrets = [];
  for (let i = 0; i < (n || 20); i++) {
    await page.keyboard.press("Tab");
    const a = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const contour = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      const ombre = cs.boxShadow && cs.boxShadow !== "none";
      const nom = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 50);
      return {
        balise: el.tagName.toLowerCase() + (el.id ? "#" + el.id : ""), nom,
        contour, ombre, indicateur: contour || ombre,
        dansEcran: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0,
      };
    });
    arrets.push(a);
  }
  return arrets;
}

module.exports = { mesurerDansLaPage, parcoursClavier };
