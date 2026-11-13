
const BORDER_RADIUS = [
  { id: "square", name: "Carré", val: "6px" },
  { id: "round", name: "Arrondi", val: "14px" },
  { id: "pill", name: "Pilule", val: "24px" },
];

// ⚠️ « cdv » a quitté cet ordre avec le Carnet de voyage (§6). Un compte qui
// avait personnalisé sa barre garde son réglage en base ; l'entrée n'ayant plus
// ni écran ni libellé, elle est simplement ignorée au rendu.
const DEFAULT_NAV_ORDER = ["feed","bobines","explore","studio","messages","irl"];
const NAV_LABELS = { feed:"Fil", bobines:"Bobines", explore:"Explorer", studio:"Créer", messages:"Messages", irl:"IRL" };

function getCurrentConfig() {
  try { return JSON.parse(localStorage.getItem("passio_config") || "{}"); } catch(e) { return {}; }
}
function saveConfig(cfg) {
  try { localStorage.setItem("passio_config", JSON.stringify(cfg)); } catch(e) {}
}
function getNavOrder() {
  return getCurrentConfig().navOrder || [...DEFAULT_NAV_ORDER];
}

function applyConfig() {
  var cfg = getCurrentConfig();
  var root = document.documentElement;

  // COULEUR
  if (cfg.accent) {
    var c = ACCENT_COLORS.find(function(x) { return x.id === cfg.accent; });
    if (c) {
      root.style.setProperty("--accent", c.accent);
      root.style.setProperty("--accent-soft", c.soft);
      root.style.setProperty("--accent-2", c.c2);
      root.style.setProperty("--accent-2-soft", c.c2s);
      root.style.setProperty("--accent-3", c.c3);
      root.style.setProperty("--accent-3-soft", c.c3s);
      root.style.setProperty("--accent-4", c.c4);
      root.style.setProperty("--accent-4-soft", c.c4s);
      root.style.setProperty("--accent-5", c.c5);
      root.style.setProperty("--accent-5-soft", c.c5s);
      root.style.setProperty("--bg-deep", c.bgDeep);
      root.style.setProperty("--bg-soft", c.bgSoft);
      root.style.setProperty("--border", c.border);
      root.style.setProperty("--border-strong", c.borderStrong);
      root.style.setProperty("--shadow-soft", "0 1px 2px rgba(" + c.shadow + ",0.05), 0 8px 24px rgba(" + c.shadow + ",0.10)");
      root.style.setProperty("--shadow-strong", "0 16px 48px rgba(" + c.shadow + ",0.18)");
      root.style.setProperty("--shadow-glow", "0 8px 22px rgba(" + c.shadow + ",0.22)");
      root.style.setProperty("--shadow-glow-2", "0 8px 22px rgba(" + c.shadow + ",0.20)");
      root.style.setProperty("--grad-hero", c.grad1);
      root.style.setProperty("--grad-hero-2", c.grad2);
      root.style.setProperty("--grad-warm", c.grad2);
      root.style.setProperty("--grad-cool", c.grad1);
      // --warning reste ambre (défini dans styles.css) : un avertissement doit se
      // distinguer de l'accent violet du thème — NE PAS le forcer sur c.accent.
      // Override CSS pour les couleurs hardcodées dans le HTML/JS
      var colorOverride = document.getElementById("passio-color-override");
      if (!colorOverride) { colorOverride = document.createElement("style"); colorOverride.id = "passio-color-override"; document.head.appendChild(colorOverride); }
      colorOverride.textContent = "\
        .app-shell { background: radial-gradient(circle at 50% -6%, rgba(" + c.shadow + ",0.16), transparent 58%), " + c.bgSoft + " !important; }\
        .topbar { background: linear-gradient(135deg, " + c.accent + " 0%, " + c.c3 + " 100%) !important; border-bottom-color: rgba(255,255,255,0.12) !important; }\
        .brand-name { color: #fff !important; }\
        .brand-tagline { color: rgba(255,255,255,0.82) !important; }\
        .brand-logo { background: rgba(255,255,255,0.92) !important; box-shadow: 0 0 0 1.5px rgba(255,255,255,0.4), 0 4px 12px rgba(0,0,0,0.18) !important; }\
        .topbar-chip { background: rgba(255,255,255,0.16) !important; border-color: rgba(255,255,255,0.30) !important; color: #fff !important; }\
        .topbar-bell { background: rgba(255,255,255,0.16) !important; border-color: rgba(255,255,255,0.30) !important; color: #fff !important; }\
        .nav-item.active { color: " + c.accent + " !important; }\
        .btn.primary { background: linear-gradient(135deg, " + c.accent + ", " + c.c3 + ") !important; }\
        .pill.active { background: " + c.accent + " !important; }\
        .mood-btn.active { color: " + c.accent + " !important; border-bottom-color: " + c.accent + " !important; }\
        .profile-tile.active .profile-tile-avatar { box-shadow: 0 4px 18px rgba(" + c.shadow + ",0.45) !important; }\
        .story-ring:not(.seen):not(.create) { background: linear-gradient(135deg, " + c.accent + ", " + c.c3 + ") !important; }\
        .landing { background: radial-gradient(circle at 12% 6%, rgba(" + c.shadow + ",0.18), transparent 52%), radial-gradient(circle at 88% 92%, rgba(" + c.shadow + ",0.14), transparent 55%), " + c.bgDeep + " !important; }\
        .onboarding-shell { background: radial-gradient(circle at 16% 10%, rgba(" + c.shadow + ",0.18), transparent 54%), radial-gradient(circle at 84% 90%, rgba(" + c.shadow + ",0.14), transparent 56%), " + c.bgDeep + " !important; }\
        .link { color: " + c.accent + " !important; }\
        .main-profile-avatar:not([data-has-photo=\"1\"]) { background: linear-gradient(135deg, " + c.c4 + ", " + c.c2 + ") !important; }\
        .main-profile-cover:not([data-has-photo=\"1\"]) { background: radial-gradient(130% 140% at 12% -10%, " + c.c5 + " 0%, transparent 55%), radial-gradient(120% 130% at 95% 15%, " + c.soft + " 0%, transparent 60%), radial-gradient(160% 130% at 50% 115%, " + c.c3 + " 0%, " + c.c2 + " 70%) !important; }\
      ";
      if (c.dark) {
        root.style.setProperty("--text", "#e2e8f0");
        root.style.setProperty("--text-dim", "#cbd5e1");
        root.style.setProperty("--muted", "#94a3b8");
        root.style.setProperty("--muted-2", "#64748b");
        root.style.setProperty("--bg-card", "rgba(30,27,75,0.92)");
        // Les pictogrammes du menu « pièce jointe » sont des TRAITS depuis le
        // retrait des emojis : sur ce fond de carte, leurs teintes 600 tombaient
        // sous 3:1. On les remonte d'un cran — même rôle, même code couleur.
        root.style.setProperty("--att-photo", "#a78bfa");
        root.style.setProperty("--att-doc", "#38bdf8");
        root.style.setProperty("--att-audio", "#34d399");
        root.style.setProperty("--att-lieu", "#fbbf24");
        root.style.setProperty("--att-fichiers", "#f87171");
        root.style.setProperty("--att-irl", "#a78bfa");
        document.body.style.background = c.bgSoft;
      } else {
        root.style.removeProperty("--text");
        root.style.removeProperty("--text-dim");
        root.style.removeProperty("--muted");
        root.style.removeProperty("--muted-2");
        root.style.removeProperty("--bg-card");
        ["photo", "doc", "audio", "lieu", "fichiers", "irl"].forEach(function (k) {
          root.style.removeProperty("--att-" + k);
        });
        document.body.style.background = "";
      }
      // Logo dynamique
      setTimeout(function() { if (typeof updateLogos === "function") updateLogos(); }, 50);
    }
  }

  // POLICE
  if (cfg.fontFamily && cfg.fontFamily !== "default") {
    var ff = FONT_FAMILIES.find(function(f) { return f.id === cfg.fontFamily; });
    if (ff && ff.url) {
      var linkEl = document.getElementById("passio-gfont");
      if (!linkEl || !linkEl.href.includes(ff.id)) {
        if (linkEl) linkEl.remove();
        linkEl = document.createElement("link"); linkEl.id = "passio-gfont"; linkEl.rel = "stylesheet"; linkEl.href = ff.url;
        document.head.appendChild(linkEl);
      }
      var ffStyle = document.getElementById("passio-ff-override");
      if (!ffStyle) { ffStyle = document.createElement("style"); ffStyle.id = "passio-ff-override"; document.head.appendChild(ffStyle); }
      ffStyle.textContent = "* { font-family: " + ff.family + " !important; }";
    }
  } else {
    var ffStyle = document.getElementById("passio-ff-override"); if (ffStyle) ffStyle.remove();
    var gfont = document.getElementById("passio-gfont"); if (gfont) gfont.remove();
  }

  // TAILLE
  if (cfg.fontSize) {
    var f = FONT_SIZES.find(function(x) { return x.id === cfg.fontSize; });
    if (f) {
      document.body.style.fontSize = f.px + "px";
      var fsStyle = document.getElementById("passio-fs-override");
      if (!fsStyle) { fsStyle = document.createElement("style"); fsStyle.id = "passio-fs-override"; document.head.appendChild(fsStyle); }
      fsStyle.textContent = "body, .input, .textarea, button, .btn, .section-subtitle, .onb-text, .msg-preview, .post-text, .conv-bubble { font-size: " + f.px + "px !important; } .landing-title { font-size: " + (f.px*2.4) + "px !important; } .onb-title, .modal-title { font-size: " + (f.px*1.3) + "px !important; }";
    }
  } else {
    var fsStyle = document.getElementById("passio-fs-override"); if (fsStyle) fsStyle.remove();
    document.body.style.fontSize = "";
  }

  // COINS
  if (cfg.radius) {
    var r = BORDER_RADIUS.find(function(x) { return x.id === cfg.radius; });
    if (r) {
      var rdStyle = document.getElementById("passio-rd-override");
      if (!rdStyle) { rdStyle = document.createElement("style"); rdStyle.id = "passio-rd-override"; document.head.appendChild(rdStyle); }
      rdStyle.textContent = ".btn, .input, .textarea, .pill, .post-card, .msg-card, .cdv-feed-card, .cdv-live-card, .profile-card, .main-profile-card, .main-profile-cover, .main-profile-stats, .main-profile-stat, .main-profile-edit-btn, .main-profile-rs-link, .modal, .tour-card, .new-group-btn, .kpi, .upload-zone, .landing-pillar, .conv-bubble, .cdv-mode-card, .passion-tile, .notif-card, .cdv-live-step, .mood-btn-icon, .topbar-chip, .config-color-option, .msg-readfilter-btn, .story-ring, .story-inner { border-radius: " + r.val + " !important; } .avatar, .main-profile-avatar, .profile-tile-avatar, .msg-avatar, .msg-user-result-avatar, .passion-photo-badge, .main-profile-avatar-badge, .profile-general-avatar { border-radius: " + r.val + " !important; }";
    }
  } else {
    var rdStyle = document.getElementById("passio-rd-override"); if (rdStyle) rdStyle.remove();
  }

  // ONGLETS
  if (cfg.navOrder) { setTimeout(function() { applyNavOrder(); }, 100); }

  // ✅ INITIALISER LES BOUTONS DE MOOD
  setTimeout(function() {
    console.log("🎨 INIT MOOD BUTTONS - selectedMoods:", Array.from(selectedMoods));

    // 1. Attacher les event listeners
    setupMoodButtons();

    // 2. Mettre à jour les classes active
    var allBtns = document.querySelectorAll("#moodSelector .mood-btn");
    console.log("  Boutons trouvés:", allBtns.length);

    allBtns.forEach(function(b) {
      var moodValue = b.getAttribute("data-mood");
      var shouldBeActive = selectedMoods.has(moodValue);

      if (shouldBeActive) {
        b.classList.add("active");
        console.log("  ✅ Bouton [" + moodValue + "] activé");
      } else {
        b.classList.remove("active");
        console.log("  ⬜ Bouton [" + moodValue + "] désactivé");
      }
    });
  }, 150);
}

// LOT-21 (audit UX/UI du 2026-11-10, TRA-C06) — « AFFICHAGE », PLUS UN
// CONFIGURATEUR. L'écran « Apparence & thème » datait d'avant la charte UI v2 :
// sept palettes (dont « Sombre », mode retiré), seize polices Google chargées à
// l'ouverture, trois styles de coins, un ordre d'onglets qu'aucune barre ne lit
// plus, et un « Appliquer » qui ne faisait que fermer. Il ne garde que la TAILLE
// DU TEXTE (utile à la lecture). À l'ouverture, les réglages hors charte déjà
// posés (`accent`, `fontFamily`, `radius`, `navOrder`) sont retirés de
// `passio_config` et leurs surcharges effacées — rien d'autre n'est touché.
var CONFIG_HORS_CHARTE = ["accent", "fontFamily", "radius", "navOrder"];
var PROPRIETES_THEME = ["--accent", "--accent-soft", "--accent-2", "--accent-2-soft", "--accent-3", "--accent-3-soft",
  "--accent-4", "--accent-4-soft", "--accent-5", "--accent-5-soft", "--bg-deep", "--bg-soft", "--border", "--border-strong",
  "--shadow-soft", "--shadow-strong", "--shadow-glow", "--shadow-glow-2", "--grad-hero", "--grad-hero-2", "--grad-warm",
  "--grad-cool", "--text", "--text-dim", "--muted", "--muted-2", "--bg-card",
  "--att-photo", "--att-doc", "--att-audio", "--att-lieu", "--att-fichiers", "--att-irl"];
function retirerReglagesHorsCharte() {
  var cfg = getCurrentConfig();
  var avait = CONFIG_HORS_CHARTE.some(function (k) { return cfg[k] !== undefined; });
  if (!avait) return false;
  CONFIG_HORS_CHARTE.forEach(function (k) { delete cfg[k]; });
  saveConfig(cfg);
  var root = document.documentElement;
  PROPRIETES_THEME.forEach(function (p) { root.style.removeProperty(p); });
  ["passio-color-override", "passio-ff-override", "passio-gfont", "passio-rd-override"].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.remove();
  });
  document.body.style.background = "";
  try { if (typeof applyNavOrder === "function") applyNavOrder(); } catch (e) {}
  try { if (typeof updateLogos === "function") updateLogos(); } catch (e) {}
  return true;
}

function openConfigurator() {
  retirerReglagesHorsCharte();
  var cfg = getCurrentConfig();
  var fontSizeNow = cfg.fontSize || "medium";
  var fontSizeHTML = FONT_SIZES.map(function(f) {
    var actif = f.id === fontSizeNow;
    return '<button type="button" class="config-taille' + (actif ? ' actif' : '') + '" aria-pressed="' + (actif ? 'true' : 'false') + '" onclick="setConfig(\'fontSize\',\'' + escapeJsArg(f.id) + '\')"><span class="config-taille-aa" aria-hidden="true" style="font-size:' + (Number(f.px) + 4) + 'px;">Aa</span><span>' + escapeHtml(f.name) + '</span></button>';
  }).join("");
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">Affichage</div>\
    <div class="modal-subtitle">La taille du texte, pour lire confortablement.</div>\
    <div class="config-tailles">' + fontSizeHTML + '</div>\
    <button class="btn primary block" onclick="closeModal()" style="margin-top:14px;">Fermer</button>\
  ');
}

function setConfig(key, value) {
  var cfg = getCurrentConfig();
  cfg[key] = value;
  saveConfig(cfg);
  applyConfig();
  if (key !== "navOrder") openConfigurator();
}

var _fontExamples = {
  "default": "L'écriture système de ton appareil",
  "inter": "Moderne et clean",
  "poppins": "Arrondie, chaleureuse",
  "nunito": "Douce et accessible",
  "space": "Géométrique, tech",
  "outfit": "Élégante, contemporaine",
  "playfair": "Classique avec empattements",
  "caveat": "Manuscrite décontractée",
  "righteous": "Bold et rétro",
  "quicksand": "Légère et arrondie",
  "comfortaa": "Ultra ronde et fun",
  "oswald": "Condensée et forte",
  "dancing": "Calligraphie élégante",
  "mono": "Code, terminal, geek",
  "bitter": "Journal, éditorial",
  "fredoka": "Bulle, ludique et joyeuse",
};

function toggleFontDropdown() {
  var list = document.getElementById("fontDropdownList");
  var arrow = document.getElementById("fontDropdownArrow");
  if (!list) return;
  if (list.style.display === "block") {
    list.style.display = "none";
    if (arrow) arrow.textContent = "▼";
    return;
  }
  if (arrow) arrow.textContent = "▲";
  var cfg = getCurrentConfig();
  var activeId = cfg.fontFamily || "default";
  
  // Vider et reconstruire via DOM pour pouvoir mettre !important
  list.innerHTML = "";
  
  FONT_FAMILIES.forEach(function(f) {
    var isActive = f.id === activeId;
    var desc = _fontExamples[f.id] || "";
    
    var row = document.createElement("div");
    row.style.cssText = "cursor:pointer;padding:14px 16px;border-bottom:1px solid var(--border);background:" + (isActive ? "var(--bg-deep)" : "transparent") + ";";
    row.onclick = function(e) { e.stopPropagation(); setConfig("fontFamily", f.id); };
    
    var nameEl = document.createElement("div");
    nameEl.textContent = f.name;
    nameEl.style.cssText = "font-size:20px;font-weight:800;color:var(--text);margin-bottom:3px;";
    nameEl.style.setProperty("font-family", f.family, "important");
    
    var descEl = document.createElement("div");
    descEl.textContent = desc;
    descEl.style.cssText = "font-size:11px;color:var(--muted);";
    descEl.style.setProperty("font-family", f.family, "important");
    
    var left = document.createElement("div");
    left.style.cssText = "flex:1;";
    left.appendChild(nameEl);
    left.appendChild(descEl);
    
    var wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:10px;";
    wrap.appendChild(left);
    
    if (isActive) {
      var check = document.createElement("span");
      check.textContent = "✓";
      check.style.cssText = "font-size:18px;color:var(--accent);";
      wrap.appendChild(check);
    }
    
    row.appendChild(wrap);
    list.appendChild(row);
  });
  
  list.style.display = "block";
}

function renderNavOrderList() {
  var list = document.getElementById("navOrderList");
  if (!list) return;
  var order = getNavOrder();
  list.innerHTML = order.map(function(id, i) {
    return '<div class="nav-order-item" draggable="true" data-nav-id="' + escapeHtml(id) + '" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:12px;cursor:grab;user-select:none;"><span style="font-size:14px;color:var(--muted);font-weight:800;width:20px;text-align:center;">' + (i+1) + '</span><span style="flex:1;font-weight:700;font-size:13px;">' + (NAV_LABELS[id]||id) + '</span><span class="nav-order-grip" style="font-size:16px;color:var(--muted);cursor:grab;touch-action:none;padding:0 4px;">☰</span></div>';
  }).join("");
  var dragSrc = null;
  list.querySelectorAll(".nav-order-item").forEach(function(item) {
    item.addEventListener("dragstart", function(e) { dragSrc = this; this.style.opacity = "0.4"; e.dataTransfer.effectAllowed = "move"; });
    item.addEventListener("dragover", function(e) { e.preventDefault(); this.style.borderColor = "var(--accent)"; });
    item.addEventListener("dragleave", function() { this.style.borderColor = ""; });
    item.addEventListener("drop", function(e) {
      e.preventDefault(); this.style.borderColor = "";
      if (dragSrc !== this) {
        var all = Array.from(list.querySelectorAll(".nav-order-item"));
        var from = all.indexOf(dragSrc), to = all.indexOf(this);
        var newOrd = getNavOrder(); var moved = newOrd.splice(from, 1)[0]; newOrd.splice(to, 0, moved);
        setConfig("navOrder", newOrd); applyNavOrder();
      }
    });
    item.addEventListener("dragend", function() { this.style.opacity = "1"; });
    // ⚠️ Réordonner au doigt SANS confisquer le défilement (2026-09-02, corrigé
    // en deux temps). Le code d'origine appelait `e.preventDefault()` à CHAQUE
    // `touchmove` sur la LIGNE ENTIÈRE : poser le doigt dessus empêchait la page
    // de défiler — vécu sur iPhone comme « l'écran est figé », sans la moindre
    // erreur. Une première passe n'a rendu ce preventDefault que conditionnel,
    // ce qui NE SUFFISAIT PAS : la ligne portait aussi `touch-action: none` en
    // style en ligne, et c'est une instruction au NAVIGATEUR que le JS ne peut
    // pas contredire. Le défilement restait confisqué.
    // Remède : le geste appartient à la POIGNÉE ☰ — elle seule garde
    // `touch-action: none`, elle seule porte les écouteurs. La ligne redevient
    // une zone de défilement ordinaire. C'est ce que la poignée promet déjà
    // visuellement, et ce que fait le `draggable` du bureau.
    var poignee = item.querySelector(".nav-order-grip");
    if (poignee) {
      var ty = 0;
      poignee.addEventListener("touchstart", function(e) {
        dragSrc = item; ty = e.touches[0].clientY; item.style.opacity = "0.6";
      }, { passive: true });
      // `{ passive: false }` EXPLICITE : sans lui, un navigateur peut traiter
      // l'écouteur comme passif et ignorer le preventDefault en silence.
      poignee.addEventListener("touchmove", function(e) { e.preventDefault(); }, { passive: false });
      poignee.addEventListener("touchend", function(e) {
        item.style.opacity = "1";
        var d = e.changedTouches[0].clientY - ty;
        var newOrd = getNavOrder(); var idx = newOrd.indexOf(item.dataset.navId);
        if (d < -30 && idx > 0) { var m = newOrd.splice(idx,1)[0]; newOrd.splice(idx-1,0,m); setConfig("navOrder",newOrd); applyNavOrder(); }
        else if (d > 30 && idx < newOrd.length-1) { var m2 = newOrd.splice(idx,1)[0]; newOrd.splice(idx+1,0,m2); setConfig("navOrder",newOrd); applyNavOrder(); }
      });
    }
  });
}

function applyNavOrder() {
  var nav = document.getElementById("appNav");
  if (!nav) return;
  var order = getNavOrder();
  var items = {};
  nav.querySelectorAll(".nav-item").forEach(function(el) { items[el.dataset.screen] = el; });
  order.forEach(function(id) { if (items[id]) nav.appendChild(items[id]); });
  renderNavOrderList();
}

function updateLogos() {
  var root = getComputedStyle(document.documentElement);
  var c5 = (root.getPropertyValue("--accent-5") || "#c4b5fd").trim();
  var c4 = (root.getPropertyValue("--accent-4") || "#a78bfa").trim();
  var c3 = (root.getPropertyValue("--accent-3") || "#4c1d95").trim();
  function e(s) { return encodeURIComponent(s); }
  var src;
  if (LOGO_VARIANT === "crescendo") {
    var c2 = (root.getPropertyValue("--accent-2") || "#7c3aed").trim();
    src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='gB' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='" + e(c5) + "'/><stop offset='1' stop-color='" + e(c2) + "'/></linearGradient></defs><rect width='100' height='100' rx='22' fill='url(%23gB)'/><g fill='%23ffffff'><rect x='20' y='60' width='14' height='22' rx='3'/><rect x='43' y='44' width='14' height='38' rx='3'/><rect x='66' y='26' width='14' height='56' rx='3'/><path d='M61 34 L85 34 L73 16 Z'/></g></svg>";
  } else {
    src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='gA' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='" + e(c5) + "'/><stop offset='1' stop-color='" + e(c4) + "'/></linearGradient></defs><rect width='100' height='100' rx='22' fill='url(%23gA)'/><path d='M24 24 L76 24 L24 76' stroke='%23ffffff' stroke-width='13' stroke-linecap='round' stroke-linejoin='round' fill='none'/><path d='M76 24 L76 76' stroke='" + e(c3) + "' stroke-width='13' stroke-linecap='round' fill='none'/></svg>";
  }
  LOGO_SRC = src;
  ["logoTopbar","logoOnb1","logoLanding"].forEach(function(id) { var el = document.getElementById(id); if (el) el.src = src; });
}

function resetConfig() {
  localStorage.removeItem("passio_config");
  var root = document.documentElement;
  ["--accent","--accent-soft","--accent-2","--accent-2-soft","--accent-3","--accent-3-soft",
   "--accent-4","--accent-4-soft","--accent-5","--accent-5-soft","--bg-deep","--bg-soft",
   "--border","--border-strong","--shadow-soft","--shadow-strong","--shadow-glow","--shadow-glow-2",
   "--grad-hero","--grad-hero-2","--grad-warm","--grad-cool","--warning",
   "--text","--text-dim","--muted","--muted-2","--bg-card"
  ].forEach(function(v) { root.style.removeProperty(v); });
  document.body.style.fontSize = "";
  document.body.style.background = "";
  ["passio-color-override","passio-ff-override","passio-fs-override","passio-rd-override","passio-gfont"].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.remove();
  });
  // Reset nav order
  var nav = document.getElementById("appNav");
  if (nav) {
    var items = {}; nav.querySelectorAll(".nav-item").forEach(function(el) { items[el.dataset.screen] = el; });
    DEFAULT_NAV_ORDER.forEach(function(id) { if (items[id]) nav.appendChild(items[id]); });
  }
  // Reset logo
  setTimeout(function() { if (typeof updateLogos === "function") updateLogos(); }, 100);
  document.querySelectorAll(".brand-name, .topbar-title").forEach(function(el) { el.textContent = "PASSIO"; });
  closeModal();
  toast("Configuration réinitialisée");
}

// Applique au boot
if (typeof document !== "undefined") {
  // Run après le DOMContentLoaded
  setTimeout(() => { try { applyConfig(); } catch(e) {} }, 100);
}

// ════════════════════════════════════════════════════════════════════════
// APPELS AUDIO / VIDÉO — vrai WebRTC peer-to-peer (signalisation Supabase
// Realtime Broadcast, sans table dédiée ni migration).
//
// Handshake (évite la course « ICE perdu avant que le pair ne rejoigne ») :
//   1. Appelant : getUserMedia → ouvre la PeerConnection → s'abonne au canal
//      `call:<callId>` → envoie une invitation sur `ring:<peerId>`.
//   2. Appelé : reçoit l'invitation sur son canal `ring:<MY_UID>` → UI entrante.
//      Accepter → getUserMedia → s'abonne à `call:<callId>` → envoie `ready`.
//   3. Appelant (sur `ready`) → crée l'offre SDP → l'envoie. ICE en trickle des
//      deux côtés une fois les deux abonnés au même canal.
//   4. Appelé (sur `offer`) → réponse SDP. Appelant (sur `answer`) → connecté.
// ════════════════════════════════════════════════════════════════════════

// STUN (découverte d'IP publique) + TURN (relais quand le P2P direct échoue ou
// passe par un mauvais chemin NAT → c'est ce qui dégrade la qualité même avec
// une « bonne connexion » : sans relais, ICE peut retomber sur un lien pourri).
// ⭐ TURN DÉDIÉ (production) — UN SEUL endroit à remplir : colle ici les
// identifiants de TON serveur TURN (offre gratuite avec compte chez Metered ou
// Cloudflare, coturn auto-hébergé, Twilio…). Il est essayé EN PREMIER. Il n'y a
// plus de filet public (voir plus bas). ⚠️ Ajoute AUSSI le domaine à
// `connect-src` de la CSP (netlify.toml ET _headers), par prudence.
// Ex. : { urls: "turn:turn.mondomaine.com:3478", username: "u", credential: "p" }
const PASSIO_CALL_TURN = null; // ← ta config TURN dédiée, ou null : STUN seul, aucun relais

// ⚠️ LE TURN PUBLIC « OPEN RELAY » EST MORT — retiré le 2026-11-09. Mesuré ce
// jour-là : `openrelay.metered.ca` résout vers 192.0.2.1 et 100::1, deux adresses
// RÉSERVÉES et non routables (RFC 5737, RFC 6666) — l'opérateur l'a neutralisé
// (le 2026-09-10 il résolvait encore, docs/AUDIT_COMMERCIALISATION_2026-09-10.md),
// et un banc Chromium n'en obtenait aucun candidat `relay` quand le STUN de Google
// rendait ses `srflx`. Ses trois entrées ne relayaient donc plus RIEN : un appel
// entre deux réseaux à NAT strict (4G derrière un CGNAT, réseau d'entreprise)
// échoue, avec ou sans elles. L'ICE part en trickle : elles ne retardaient pas
// l'appel, elles promettaient seulement un filet qui n'existait plus. Le remède :
// le relais Cloudflare que fabrique `notify-call` (section suivante) — journal
// social-messagerie, 2026-11-09. `PASSIO_CALL_TURN` ne sert plus qu'à un TURN à
// identifiants FIXES, qui seraient alors publics.
const CALL_ICE_SERVERS = [
  ...(PASSIO_CALL_TURN ? (Array.isArray(PASSIO_CALL_TURN) ? PASSIO_CALL_TURN : [PASSIO_CALL_TURN]) : []),
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

// ── Relais TURN Cloudflare, fabriqué par le serveur (2026-11-09) ────────────
// `notify-call` rend, sur `{ type: "ice" }`, des identifiants Cloudflare de 6 h
// (secrets `TURN_CF_KEY_ID` / `TURN_CF_API_TOKEN` de la fonction : jamais dans ce
// fichier, le dépôt est public). Ils s'AJOUTENT au tableau ci-dessus, que lisent
// les cinq `new RTCPeerConnection` des appels et des lives : rien d'autre à
// changer. Secrets absents, réseau coupé, réponse hors forme : le tableau reste en
// STUN seul, comme avant — jamais un appel ou un live retardé de plus de 2,5 s.
//   · renouvelés quand il leur reste moins de 3 h : un live ou un appel part
//     toujours avec au moins 3 h de validité (une connexion relayée ne survit pas
//     à l'expiration de ses identifiants) ;
//   · relais coupé (`configure: false`) : les identifiants déjà posés sont RETIRÉS,
//     et la fonction n'est pas redemandée avant une heure ;
//   · panne (refus, Cloudflare, réseau, attente dépassée) : pas de nouvelle demande
//     avant 5 min — sinon chaque entrée dans un live attendrait 2,5 s de plus ;
//   · expirés : retirés, même quand le renouvellement échoue.
const ICE_ATTENTE_MAX_MS = 2500;
const ICE_MARGE_MS = 3 * 3600 * 1000;
const ICE_PAUSE_ECHEC_MS = 5 * 60 * 1000;
const ICE_PAUSE_COUPE_MS = 3600 * 1000;
const _iceRelais = { serveurs: [], jusqua: 0, expire: 0, enCours: null };
function _iceRetirerRelais() {
  _iceRelais.serveurs.forEach(function (s) { var i = CALL_ICE_SERVERS.indexOf(s); if (i !== -1) CALL_ICE_SERVERS.splice(i, 1); });
  _iceRelais.serveurs = [];
  _iceRelais.expire = 0;
}
function _iceServeursSurs(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.slice(0, 4).filter(function (s) {
    if (!s || typeof s !== "object") return false;
    var urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    if (!urls.length || !urls.every(function (u) { return typeof u === "string" && /^(stun|turns?):[A-Za-z0-9.-]{1,253}(:\d{1,5})?(\?transport=(udp|tcp))?$/.test(u); })) return false;
    var relais = urls.some(function (u) { return u.indexOf("turn") === 0; });
    return !relais || (typeof s.username === "string" && !!s.username && typeof s.credential === "string" && !!s.credential);
  });
}
function assurerServeursIce() {
  try {
    if (_iceRelais.serveurs.length && Date.now() >= _iceRelais.expire) _iceRetirerRelais();
    if (Date.now() < _iceRelais.jusqua) return Promise.resolve(_iceRelais.serveurs.length);
    if (_iceRelais.enCours) return _iceRelais.enCours;
    var compteReel = typeof connexionTempsReelAutorisee !== "function" || connexionTempsReelAutorisee();
    if (typeof supa === "undefined" || !supa || !window._supaReal || !supa.functions || !compteReel) return Promise.resolve(0);
    var echec = function (raison) {
      try { if (typeof diagLog === "function") diagLog("ice relais " + raison); } catch (_e) {}
      return -1;
    };
    var requete = Promise.resolve(supa.functions.invoke("notify-call", { body: { type: "ice" } }))
      .then(function (r) {
        // Un refus du serveur (429 du plafond…) ne LÈVE pas : il arrive dans `error`.
        if (r && r.error) return echec("refusé : " + (r.error.message || r.error));
        var d = r && r.data;
        if (d && d.configure === false) {
          _iceRetirerRelais();
          _iceRelais.jusqua = Date.now() + ICE_PAUSE_COUPE_MS;
          return 0;
        }
        var surs = _iceServeursSurs(d && d.iceServers);
        if (!surs.length) return echec("indisponible : " + ((d && d.code) || "réponse hors forme"));
        // On retire les identifiants précédents AVANT d'ajouter les neufs : le
        // tableau ne grossit pas d'un renouvellement à l'autre.
        _iceRetirerRelais();
        surs.forEach(function (s) { CALL_ICE_SERVERS.push(s); });
        _iceRelais.serveurs = surs;
        var ttlMs = ((d && Number(d.ttl) > 0) ? Number(d.ttl) : 6 * 3600) * 1000;
        _iceRelais.expire = Date.now() + ttlMs;
        _iceRelais.jusqua = Date.now() + Math.max(10 * 60 * 1000, ttlMs - ICE_MARGE_MS);
        return surs.length;
      })
      .catch(function (e) { return echec("indisponible : " + (e && e.message)); });
    var borne = new Promise(function (ok) { setTimeout(function () { ok(-2); }, ICE_ATTENTE_MAX_MS); });
    _iceRelais.enCours = Promise.race([requete, borne]).then(function (n) {
      _iceRelais.enCours = null;
      if (n === -2) echec("muet au-delà de " + ICE_ATTENTE_MAX_MS + " ms");
      if (n < 0) {
        // Pas de nouvelle demande avant 5 min ; ce qui est encore valide reste. Une
        // réponse tardive qui réussit pose quand même ses identifiants et son délai.
        if (_iceRelais.jusqua < Date.now() + ICE_PAUSE_ECHEC_MS) _iceRelais.jusqua = Date.now() + ICE_PAUSE_ECHEC_MS;
        return _iceRelais.serveurs.length;
      }
      return n;
    });
    return _iceRelais.enCours;
  } catch (e) {
    try { if (typeof diagLog === "function") diagLog("✗ ice relais : " + (e && e.message)); } catch (_e) {}
    return Promise.resolve(0);
  }
}
window.assurerServeursIce = assurerServeursIce;

// État global d'un appel en cours (un seul à la fois).
window._call = window._call || null;
// Instant du dernier geste qui lance un appel ou un Live, lu par pwa-detect.js :
// entre le geste et la pose de `_call`, de `_vliveHost` ou de `_vliveView`, il y a
// une attente (permission du micro, titre du Live, lecture réseau) pendant laquelle
// aucun état ne dit qu'un appel se prépare. Une mise à jour silencieuse rechargerait
// alors la page sous un appel que l'utilisateur vient d'accepter.
function _appelEnPreparation() { window._appelLanceA = performance.now(); }

let callTimerInterval = null;

// Canal Realtime broadcast des appels ; helper de création — le SEUL point qui
// crée `ring:` et `call:`.
// ⚠️ PRIVÉ depuis le 2026-09-11. Mesuré en production : ces canaux étaient
// publics, donc sans compte on pouvait écouter `ring:<uid>` de n'importe qui
// (qui appelle qui), faire sonner un téléphone sous une fausse identité ou
// couper un appel. Les policies `passio_rt_recevoir` / `passio_rt_emettre`
// (migration du 2026-09-11) ne délivrent une sonnerie qu'à son destinataire et
// n'ouvrent l'émission qu'aux comptes connectés.
// ⚠️ DÉPLOYABLE AVANT LA MIGRATION : un canal privé sans policy est REFUSÉ. La
// sonnerie (`_subscribeCallRing`, abonnée au démarrage) sert de sonde : refusée
// pour défaut de policy, elle pose `window._rtPriveIndisponible` et TOUS les
// canaux repartent en public — le comportement d'avant, pas une panne.
// Une fois la migration appliquée, la sonde passe et tout reste privé.
function _callChannel(name) {
  if (typeof supa === "undefined" || !supa) return null;
  return supa.channel(name, { config: { broadcast: { self: false, ack: false }, private: window._rtPriveIndisponible !== true } });
}

// Le refus d'un canal privé « faute de policy » se reconnaît à son message ;
// une coupure réseau, elle, se retente toute seule et ne doit PAS faire replier.
function _rtRefusDePolicy(err) {
  var m = String((err && (err.message || err.reason)) || err || "");
  return /permission|unauthori|not allowed|policy|private/i.test(m);
}

// Résout le pair (id Supabase + identité d'affichage) d'une conversation 1:1.
function _callResolvePeer(convId) {
  const c = (getConversations() || []).find(x => x.id === convId);
  if (!c || c.isGroup) return null;
  const u = (state.seed.users || []).find(x => x.id === c.userId);
  return {
    id: c.userId,
    name: c.userName || (u && u.name) || "Contact",
    emoji: c.userEmoji || (u && u.profileEmoji) || "🙂",
    color: c.userColor || (u && u.avatar) || "#7c3aed",
    photo: c.userPhoto || (u && u.photoUrl) || null,
  };
}

// ⚠️ PILOTE GRATUIT (ASTRA-60, sixième contre-revue, 2026-09-16) — LES APPELS
// SONT DÉSACTIVÉS. Avec deux vrais RTCPeerConnection et un bus simulé, perdre
// une `answer` laisse la négociation sans relance observée ; la correction
// bornée (acquittement, retransmission, délai de sortie) n'est pas validée.
// Plutôt que d'ouvrir une fonction incertaine, on la retire du pilote :
//   · les boutons d'appel ne sont pas rendus (app-04, `appelsDisponibles()`) ;
//   · `startCall` refuse et le dit (toast) ;
//   · la sonnerie n'est pas abonnée, une invitation reçue (ancien client en
//     cache) est IGNORÉE et tracée (`call_ignore_pilote`) ;
//   · `notify-call` refuse `type:"call"` (503 `appels_desactives`) : un ancien
//     client ne réveille personne par push.
// Aucune policy n'est rouverte, aucun canal public : la désactivation est
// côté code, réversible en passant `PASSIO_APPELS_ACTIFS` à true (+ fonction).
// Les suites navigateur des appels S'ARMENT elles-mêmes (`passio_appels_actifs`
// en localStorage) pour continuer d'exercer le code — comme `passio_gate_actif`.
const PASSIO_APPELS_ACTIFS = false;
function appelsDisponibles() {
  if (PASSIO_APPELS_ACTIFS === true) return true;
  try { return localStorage.getItem("passio_appels_actifs") === "1"; } catch (e) { return false; }
}
window.appelsDisponibles = appelsDisponibles;
const MESSAGE_APPELS_DESACTIVES = "Les appels ne sont pas disponibles pendant le pilote. La messagerie, elle, l'est.";

// Démarre un APPEL SORTANT (kind = "voice" | "video").
async function startCall(convId, kind) {
  if (!appelsDisponibles()) {
    toast(MESSAGE_APPELS_DESACTIVES);
    try { if (typeof diagLog === "function") diagLog("call_refuse_pilote " + String(kind || "")); } catch (e) {}
    return;
  }
  if (window._call) { toast("Un appel est déjà en cours"); return; }
  // Un départ est déjà en cours (double toucher pendant la caméra ou le relais) :
  // le second aurait écrasé `window._call` sans jamais couper le premier flux.
  if (window._callDepart) return;
  if (typeof RTCPeerConnection === "undefined") { toast("Ton navigateur ne gère pas les appels"); return; }
  const peer = _callResolvePeer(convId);
  if (!peer) { toast("Appel disponible uniquement en conversation privée"); return; }
  // ⚠️ MÊME IDIOME QUE SES DEUX SŒURS : `!MY_UID` est vrai pour un
  // `u_<aléatoire>`. Rien ne fuit aujourd'hui (la ligne suivante écarte les
  // pairs de démonstration, seuls contacts d'un visiteur), mais laisser
  // l'idiome intact à côté de deux commentaires qui le déclarent défectueux
  // ferait conclure qu'il a été audité et validé ici (capacité, 2026-09-20).
  const compteReel = typeof connexionTempsReelAutorisee !== "function" || connexionTempsReelAutorisee();
  if (typeof supa === "undefined" || !supa || !window._supaReal || typeof MY_UID === "undefined" || !MY_UID || !compteReel) {
    toast("Connecte-toi pour passer un appel"); return;
  }
  if (!peer.id || /^u_/.test(peer.id)) { toast("Ce contact de démo n'est pas joignable"); return; }
  // Le relais TURN se demande pendant la permission caméra/micro, et on l'ATTEND
  // (2,5 s au plus) avant de créer la connexion : `new RTCPeerConnection` copie la
  // liste des serveurs à sa création — sans relais à ce moment, l'appel entre deux
  // réseaux à NAT strict échoue (audit du 2026-11-09).
  const _relais = assurerServeursIce();
  const depart = {};
  window._callDepart = depart;

  let stream;
  _appelEnPreparation();
  try {
    stream = await _callGetMedia(kind);
  } catch (e) {
    if (window._callDepart === depart) window._callDepart = null;
    toast("Caméra/micro indisponible ou refusé"); return;
  }
  try { await _relais; } catch (e) {}
  // Pendant l'attente, un autre appel a pu commencer (un appel entrant accepté) :
  // ce départ s'efface, et la caméra et le micro qu'il a obtenus sont coupés.
  const departValide = window._callDepart === depart && !window._call;
  if (window._callDepart === depart) window._callDepart = null;
  if (!departValide) { try { (stream.getTracks() || []).forEach((t) => t.stop()); } catch (e) {} return; }

  // ⚠️ Non DEVINABLE : `call:<id>` est lisible par tout compte (policy
  // `passio_rt_recevoir`), et l'ancien `<uid>_<horodatage>` se reconstituait —
  // uid public, milliseconde proche — donc l'offre SDP (adresses IP dans les
  // candidats ICE) et le `hangup` étaient à portée d'un tiers.
  const callId = _callIdAleatoire();
  window._call = {
    id: callId, peer: peer, kind: kind, role: "caller",
    status: "calling", localStream: stream, remoteStream: null,
    pc: null, chan: null, startedAt: 0, _facing: "user",
  };

  _callRenderActiveUI();
  _callSetupPeerConnection();
  console.log("[call] startCall →", peer.id, "callId", callId, "kind", kind);

  // Invitation déposée sur le canal personnel du pair (`ring:<peerId>`).
  // ⚠️ Le broadcast est ÉPHÉMÈRE : un envoi unique peut être perdu si le canal
  // du destinataire se reconnecte au mauvais moment. On RÉPÈTE donc l'invitation
  // toutes les 2 s jusqu'à ce que le pair réponde (`ready`/`answer`) ou jusqu'au
  // timeout de sonnerie. C'est ce qui rend la sonnerie fiable en conditions réelles.
  const invitePayload = {
    callId: callId, from: MY_UID, to: peer.id, kind: kind,
    name: _callMyName(), emoji: (currentProfile() && currentProfile().emoji) || "✨",
  };
  // ⚠️ L'INVITATION PART PAR HTTP, SANS S'ABONNER À `ring:<pair>` (MSG-01 / SUP-06,
  // 2026-09-14). Avant, l'appelant S'ABONNAIT à la sonnerie du pair pour y
  // émettre — et Realtime refuse un abonnement privé sans droit de LECTURE :
  // la policy de réception devait donc laisser TOUT compte lire la sonnerie de
  // N'IMPORTE QUI (qui appelle qui, visible de tout compte connecté). Le REST
  // broadcast (`httpSend`, POST /realtime/v1/api/broadcast, jeton de session
  // joint) n'est gouverné que par la policy d'ÉMISSION : la réception de
  // `ring:<uid>` peut être resserrée à son seul destinataire
  // (`migration_appels_sonnerie_privee_2026-09-14.sql`). Ce client est
  // déployable AVANT la migration : il émet aussi sous les policies d'avant.
  const ring = _callChannel("ring:" + peer.id);
  window._call.ringSendChan = ring;
  // ⚠️ IL REND SON VERDICT : le premier dépôt décide si l'appel peut partir.
  const fire = () => {
    if (!window._call || window._call.id !== callId || window._call.status !== "calling") return Promise.resolve("abandon");
    return _callDeposerInvitation(ring, invitePayload);
  };
  // ⚠️ ASTRA-23 — L'INVITATION D'ABORD, LE CANAL ENSUITE, ET C'EST UN ORDRE,
  // PAS UN STYLE. `call:<id>` est désormais réservé aux deux parties de
  // l'appel, et c'est la LIGNE `call_invites` qui les nomme
  // (`call_partie_prenante`). S'abonner avant de l'avoir déposée, c'est
  // demander l'accès à un canal que rien n'autorise encore : l'appelant se
  // faisait refuser son PROPRE appel. Les trois chemins du destinataire
  // (accepter, refuser, occupé) étaient déjà dans le bon ordre — c'est cette
  // ligne-là qui les a fait sonner.
  // ⚠️ DÉPLOYABLE AVANT LA MIGRATION : sous les policies d'avant, cet ordre
  // fonctionne à l'identique. L'inverse n'est pas vrai, d'où l'ordre
  // d'allumage écrit dans `migration_canal_appel_lie_2026-09-15.sql`.
  const verdictInvite = await fire();
  // L'attente est un point d'abandon possible : raccroché, ou autre appel.
  if (!window._call || window._call.id !== callId) return;
  // ⚠️ ON N'ABANDONNE QUE SUR UN REFUS PROUVÉ DU SERVEUR. Un envoi qui échoue
  // pour une autre raison (réseau, repli) doit laisser la RÉPÉTITION faire son
  // travail — c'est elle qui rend la sonnerie fiable. Traiter tout échec comme
  // un refus rendrait une coupure d'une seconde indiscernable d'un blocage.
  if (verdictInvite === "refus") {
    toast("Appel impossible vers cette personne");
    endCall();
    return;
  }
  // ASTRA-50 : un jeton invalide n'est ni un refus de la personne ni une panne.
  if (verdictInvite === "session") {
    toast("Ta session a expiré — reconnecte-toi pour appeler");
    endCall();
    return;
  }

  // S'abonne au canal d'appel (réponse SDP / ICE).
  const chan = _callChannel("call:" + callId);
  window._call.chan = chan;
  _callBindChannelEvents(chan);
  chan.subscribe((status) => { console.log("[call] call channel:", status); });

  window._call.inviteInterval = setInterval(fire, 2000);

  // Réveil PUSH du destinataire (app fermée). En plus du ring temps réel.
  _callPushNotify(peer, callId, kind);

  // Délai de réponse : 60 s (laisse le temps d'ouvrir une app fermée depuis la
  // notification, de charger et de rejoindre le canal d'appel).
  window._call.ringTimeout = setTimeout(() => {
    if (window._call && window._call.status === "calling") { toast("Pas de réponse"); endCall(); }
  }, 60000);
}

// ⚠️ L'INVITATION EST UNE LIGNE, PAS UN MESSAGE (MSG-01 / SUP-06, résidu Astra,
// 2026-09-15). Le REST broadcast d'avant portait un `from` ÉCRIT PAR L'ÉMETTEUR :
// tout compte non bloqué pouvait faire sonner B « de la part de A ». Désormais
// l'appelant ÉCRIT dans `call_invites` (`from_id` posé par la RLS = son jeton,
// destinataire joignable = 1:1 commun et non bloqué), et c'est un trigger de la
// base qui fait sonner `ring:<pair>` avec un payload construit DEPUIS LA LIGNE.
// La répétition toutes les 2 s est un UPSERT (`repete_le`) : même ligne, nouvelle
// sonnerie. Un client n'a plus le droit d'émettre sur `ring:%` (policy).
// ⚠️ DÉPLOYABLE AVANT LA MIGRATION : table absente (`PGRST205` / `42P01`) →
// repli sur le broadcast d'avant, mémorisé pour la session. Un REFUS de la
// RLS (403 : pas de 1:1 commun, blocage) n'est PAS un repli — le serveur a
// répondu, on ne contourne pas ; il est tracé.
// ⚠️ IL REND UN VERDICT, PLUS UN BOOLÉEN (ASTRA-23). « ok », « repli »,
// « echec » et « refus » ne se traitent pas pareil : seul « refus » est une
// réponse du SERVEUR (la RLS a dit non — pas de 1:1 commun, blocage), et c'est
// le seul cas où l'appel ne peut pas aboutir. Un `false` unique confondait ce
// refus avec une coupure réseau ; l'appelant aurait abandonné un appel
// parfaitement légitime au premier paquet perdu.
// ⚠️ ASTRA-50 (cinquième contre-revue, 15/09/2026) — UNE PANNE RÉSEAU N'EST PAS
// UN REFUS. Tout `error` qui n'était pas « table absente » devenait « refus » :
// mesuré avec le SDK embarqué (2.116.0) et un transport en échec, la réponse est
// `{ status: 0, error: { code: "", message: "TypeError: Failed to fetch" } }` —
// et l'appel se terminait sur « Appel impossible vers cette personne » avant
// même d'armer la répétition. Les formes RÉELLES du SDK, mesurées
// (tests/unit/appel-verdict-invitation.test.mjs, qui charge js/vendor) :
//   · transport : status 0, code vide, message « TypeError: Failed to fetch » ;
//   · 503 (page HTML) : status 503, PAS de code, message = le HTML ;
//   · 429 : status 429, code PGRST000 ;
//   · refus RLS : status 403, code 42501 ;
//   · session : status 401, code PGRST301 (« JWT expired ») ;
//   · table absente : status 404, code PGRST205.
// Quatre verdicts, pas deux : « refus » n'est rendu que sur une AUTORISATION
// refusée par le serveur (403 / 42501) ; « session » sur un jeton invalide ;
// « repli » sur la table absente ; tout le reste — transport, 5xx, 429,
// inconnu — est « echec », transitoire : la répétition continue, et c'est le
// délai de sonnerie qui borne.
// >>> PASSIO_TESTABLE _callClasserReponseInvite (extrait tel quel par le test unitaire)
function _callClasserReponseInvite(r) {
  if (!r || typeof r !== "object") return "echec";
  if (!r.error) return "ok";
  var code = String(r.error.code || ""), msg = String(r.error.message || ""), status = Number(r.status) || 0;
  if (code === "PGRST205" || code === "42P01" || (/call_invites/.test(msg) && /schema cache|does not exist/.test(msg))) return "repli";
  // Le CODE prime sur le statut : un refus RLS (42501) est un refus même si le
  // statut manque (un double de test) ; le transport, lui, n'a JAMAIS de code.
  if (code === "42501" || status === 403) return "refus";
  if (code === "PGRST301" || code === "PGRST302" || code === "PGRST303" || status === 401) return "session";
  if (status === 0 || (!code && /Failed to fetch|NetworkError|Load failed|network|ECONN|abort/i.test(msg))) return "echec";
  if (status === 429 || status >= 500) return "echec";
  if (/^2[23]/.test(code) || status === 400 || status === 409 || status === 422) return "refus";
  return "echec";
}
// <<< PASSIO_TESTABLE
function _callDeposerInvitation(ring, payload) {
  var repli = function () { return Promise.resolve(_callEmettreInvitation(ring, payload)).then(function (b) { return b ? "repli" : "echec"; }); };
  if (window._callInvitesAbsente === true || typeof supa === "undefined" || !supa || !window._supaReal) return repli();
  try {
    return Promise.resolve(supa.from("call_invites").upsert(
      { id: payload.callId, from_id: payload.from, to_id: payload.to, kind: payload.kind, repete_le: new Date().toISOString() },
      { onConflict: "id" }
    )).then(function (r) {
      var verdict = _callClasserReponseInvite(r);
      if (verdict === "repli") {
        window._callInvitesAbsente = true;   // mémorisé pour la session (drapeau sur window : un banc peut le lever)
        return repli();
      }
      if (verdict !== "ok") {
        try { if (typeof diagLog === "function") diagLog("call_invites " + verdict + " " + String(r && r.status) + " " + String(r && r.error && r.error.code) + " " + String(r && r.error && r.error.message).slice(0, 80)); } catch (e) {}
      }
      return verdict;
    }, function () { return repli(); });
  } catch (e) { return repli(); }
}

// Dépose l'invitation sur `ring:<pair>` en REST, jamais par un abonnement.
// ⚠️ Depuis le 2026-09-15 ce n'est plus que le REPLI d'`_callDeposerInvitation`
// (migration non appliquée) : la policy d'émission refuse `ring:%` aux clients.
// `httpSend` (supabase-js ≥ 2.100) est le chemin nominal ; sur un SDK qui ne
// l'a pas, `send()` hors abonnement part LUI AUSSI en REST (repli du SDK).
// Rend une promesse toujours résolue : l'échec d'un envoi ne doit pas tuer la
// répétition — c'est elle qui rend la sonnerie fiable.
function _callEmettreInvitation(chan, payload) {
  if (!chan) return Promise.resolve(false);
  try {
    if (typeof chan.httpSend === "function") {
      return Promise.resolve(chan.httpSend("invite", payload)).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(chan.send({ type: "broadcast", event: "invite", payload: payload })).then(function () { return true; }, function () { return false; });
  } catch (e) { return Promise.resolve(false); }
}

// ⚠️ L'IDENTITÉ DE L'APPELANT VIENT DU SERVEUR, JAMAIS DE LA CHARGE UTILE
// (PRO-02 appliqué aux appels, 2026-09-14). `payload.name`/`payload.emoji`
// sont écrits par l'émetteur : n'importe quel compte pouvait faire sonner sous
// le nom d'un autre. Le nom, l'emoji, la couleur et la photo affichés sont
// ceux du profil de `payload.from` (cache `userById`, puis `_fetchProfile`).
// `from` doit être un compte (uuid) : un `from` fabriqué n'est pas un appel.
const RE_CALL_FROM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function _callFromValide(from) { return typeof from === "string" && RE_CALL_FROM.test(from); }
function _callIdentiteServeur(from) {
  var u = (typeof userById === "function") ? userById(from) : null;
  return {
    name: (u && u.name) || "Contact",
    emoji: _emojiBorne(u && u.profileEmoji),
    color: (u && u.avatar) || "#7c3aed",
    photo: (u && u.photoUrl) || null,
  };
}
// Rafraîchit l'écran d'appel entrant avec le profil relu (asynchrone, caché).
function _callRafraichirIdentite(inv) {
  if (typeof _fetchProfile !== "function") return;
  Promise.resolve(_fetchProfile(inv.from)).then(function (p) {
    if (!p || window._callIncoming !== inv) return;
    inv.identite = { name: p.username || inv.identite.name, emoji: _emojiBorne(p.emoji || inv.identite.emoji),
                     color: p.color || inv.identite.color, photo: p.photoUrl || inv.identite.photo };
    var el = document.querySelector("#callOverlay .call-name, .call-overlay.active .call-name");
    if (el) el.textContent = inv.identite.name;
    var av = document.querySelector("#callOverlay .call-avatar, .call-overlay.active .call-avatar");
    if (av) av.textContent = inv.identite.emoji;
  }).catch(function () {});
}

function _callMyName() {
  const g = (state.user && state.user.general) || {};
  const isDefault = (n) => !n || n === "Passionné" || n === "Profil";
  return [g.username, state.user && state.user.name, (currentProfile() || {}).name].find(n => !isDefault(n)) || "Contact";
}

// Contraintes audio « HD » : traitement activé (anti-écho / anti-bruit / gain
// auto) + 48 kHz MONO. ⚠️ NE JAMAIS demander channelCount:2 ici : une capture
// micro STÉRÉO désactive l'annuleur d'écho du navigateur (l'AEC de Chrome ne
// traite que le mono) → c'était LA cause de l'écho en appel et en live.
const CALL_AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: 48000,
};

// Cible vidéo HD 1080p (idéal — repli auto sur ce que supporte la caméra).
const CALL_VIDEO_QUALITY = {
  width: { ideal: 1920, max: 1920 },
  height: { ideal: 1080, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
};

async function _callGetMedia(kind) {
  const constraints = kind === "video"
    ? { audio: CALL_AUDIO_CONSTRAINTS, video: Object.assign({ facingMode: "user" }, CALL_VIDEO_QUALITY) }
    : { audio: CALL_AUDIO_CONSTRAINTS, video: false };
  return await navigator.mediaDevices.getUserMedia(constraints);
}

// Pousse la qualité au MAXIMUM (sinon WebRTC démarre très bas → image floue /
// son compressé). Appelé une fois connecté et après un changement de caméra.
async function _callApplyMediaQuality() {
  const cs = window._call;
  if (!cs || !cs.pc) return;
  try {
    for (const sender of cs.pc.getSenders()) {
      if (!sender.track) continue;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      if (sender.track.kind === "video") {
        // "motion" = contenu caméra : l'encodeur privilégie la fluidité. L'ancien
        // "detail" + maintain-resolution sacrifiait le framerate dès que le CPU/
        // réseau faiblissait → image hachée/figée perçue comme « médiocre ».
        try { sender.track.contentHint = "motion"; } catch (e) {}
        params.encodings[0].maxBitrate = 6000000; // ~6 Mbps → 1080p HD net
        params.encodings[0].maxFramerate = 30;
        params.encodings[0].scaleResolutionDownBy = 1; // démarre pleine résolution
        params.encodings[0].active = true;
        // "balanced" : laisse WebRTC arbitrer résolution/fps selon le réseau —
        // un 1080p saccadé paraît PIRE qu'un 900p fluide.
        if ("degradationPreference" in params) params.degradationPreference = "balanced";
      } else if (sender.track.kind === "audio") {
        params.encodings[0].maxBitrate = 128000; // Opus mono fullband (transparent voix)
      }
      try { await sender.setParameters(params); } catch (e) {}
    }
  } catch (e) {}
}

function _callSetupPeerConnection() {
  const cs = window._call;
  const pc = new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS });
  cs.pc = pc;
  // Pistes locales.
  (cs.localStream.getTracks() || []).forEach(t => pc.addTrack(t, cs.localStream));
  // Codec vidéo : H.264 (matériel) > VP9 > VP8 — AVANT la négociation SDP.
  _callPreferVideoCodecs(pc);
  // Débits cibles posés dès maintenant (setParameters marche avant connexion) —
  // l'encodeur démarre haut au lieu de ramper depuis ~300 kbps.
  _callApplyMediaQuality();
  // ICE en trickle.
  pc.onicecandidate = (e) => {
    if (e.candidate) _callSend("ice", { candidate: e.candidate });
  };
  // Flux distant.
  pc.ontrack = (e) => {
    cs.remoteStream = e.streams[0];
    const rv = document.getElementById("callRemoteVideo");
    if (rv) { rv.srcObject = cs.remoteStream; try { rv.play(); } catch (x) {} }
    const ra = document.getElementById("callRemoteAudio");
    if (ra) { ra.srcObject = cs.remoteStream; try { ra.play(); } catch (x) {} }
  };
  pc.onconnectionstatechange = () => {
    if (!window._call) return;
    const st = pc.connectionState;
    if (st === "connected") { _callMarkConnected(); }
    else if (st === "failed" || st === "disconnected" || st === "closed") {
      if (window._call && window._call.status !== "ended") { toast("Connexion perdue"); endCall(); }
    }
  };
}

// Force Opus fullband MONO 128 kbps dans le SDP (WebRTC négocie sinon de
// l'Opus ~32 kbps par défaut) + FEC anti-perte + DTX coupé (usedtx=0 : flux
// continu, évite les débuts de mots avalés). ⚠️ PAS de stereo=1 : forcer Opus
// stéréo faisait envoyer le micro en stéréo → anti-écho court-circuité (même
// piège que channelCount:2 dans CALL_AUDIO_CONSTRAINTS). Mono 128 kbps est
// transparent pour la voix.
function _callTuneSdp(sdp) {
  if (!sdp) return sdp;
  try {
    sdp = _callTuneSdpVideo(sdp);
    const m = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
    if (!m) return sdp;
    const pt = m[1];
    const opts = "stereo=0;sprop-stereo=0;maxaveragebitrate=128000;maxplaybackrate=48000;cbr=0;useinbandfec=1;usedtx=0";
    const fmtpRe = new RegExp("a=fmtp:" + pt + " ([^\\r\\n]*)");
    if (fmtpRe.test(sdp)) {
      sdp = sdp.replace(fmtpRe, function (full, params) {
        let p = params;
        ["stereo", "sprop-stereo", "maxaveragebitrate", "maxplaybackrate", "cbr", "useinbandfec", "usedtx"].forEach(function (k) {
          p = p.replace(new RegExp(";?\\b" + k + "=[^;]*"), "");
        });
        p = p.replace(/^;|;$/g, "");
        return "a=fmtp:" + pt + " " + (p ? p + ";" : "") + opts;
      });
    } else {
      sdp = sdp.replace(new RegExp("(a=rtpmap:" + pt + "\\s+opus/48000[^\\r\\n]*\\r?\\n)"), "$1a=fmtp:" + pt + " " + opts + "\r\n");
    }
    return sdp;
  } catch (e) { return sdp; }
}

// Tuning de la section VIDÉO du SDP : (1) bande passante annoncée `b=AS` (sinon
// le pair peut plafonner notre envoi très bas) ; (2) bitrates de démarrage/min/max
// `x-google-*` (spécifiques libwebrtc, ignorés ailleurs) — sans eux l'appel
// démarre à ~300 kbps et met 30-60 s à monter → première minute FLOUE.
function _callTuneSdpVideo(sdp) {
  try {
    const parts = sdp.split(/(?=m=)/);
    for (let i = 0; i < parts.length; i++) {
      if (!/^m=video/.test(parts[i])) continue;
      let sec = parts[i];
      if (!/\r?\nb=AS:/.test(sec)) {
        if (/c=IN [^\r\n]+\r?\n/.test(sec)) sec = sec.replace(/(c=IN [^\r\n]+\r?\n)/, "$1b=AS:6000\r\n");
        else sec = sec.replace(/^(m=video[^\r\n]*\r?\n)/, "$1b=AS:6000\r\n");
      }
      sec = sec.replace(/a=fmtp:(\d+) ([^\r\n]*)/g, function (full, pt, params) {
        if (/apt=/.test(params)) return full;                      // rtx : ne pas toucher
        if (/x-google-start-bitrate/.test(params)) return full;    // déjà tuné (idempotent)
        return full + ";x-google-start-bitrate=2500;x-google-min-bitrate=800;x-google-max-bitrate=6000";
      });
      parts[i] = sec;
    }
    return parts.join("");
  } catch (e) { return sdp; }
}

// Ordonne les codecs vidéo par qualité RÉELLE sur mobile : H.264 d'abord
// (encodage MATÉRIEL sur quasi tous les téléphones → 1080p30 fluide sans
// chauffer), puis VP9 (meilleure compression), puis VP8 (repli logiciel — c'est
// lui que WebRTC choisissait par défaut, et un téléphone n'arrive PAS à
// l'encoder en 1080p → image floue + saccades). rtx/red/ulpfec conservés.
function _callPreferVideoCodecs(pc) {
  try {
    if (!window.RTCRtpReceiver || !RTCRtpReceiver.getCapabilities) return;
    const tx = (pc.getTransceivers() || []).find(t => t.sender && t.sender.track && t.sender.track.kind === "video");
    if (!tx || typeof tx.setCodecPreferences !== "function") return;
    const codecs = (RTCRtpReceiver.getCapabilities("video") || {}).codecs || [];
    if (!codecs.length) return;
    const rank = (c) => {
      const mt = (c.mimeType || "").toLowerCase();
      if (mt === "video/h264") return 0;
      if (mt === "video/vp9") return 1;
      if (mt === "video/vp8") return 2;
      return 3;
    };
    tx.setCodecPreferences(codecs.slice().sort((a, b) => rank(a) - rank(b)));
  } catch (e) {}
}

// Envoie un message de signalisation sur le canal d'appel courant.
function _callSend(event, data) {
  const cs = window._call;
  if (!cs || !cs.chan) return;
  try { cs.chan.send({ type: "broadcast", event: event, payload: Object.assign({ from: MY_UID }, data || {}) }); } catch (e) {}
}

// ⚠️ ASTRA-23, CONTRAT DE TRANSITION (cinquième contre-revue, 15/09/2026) — UN
// CANAL D'APPEL REFUSÉ NE SONNE PAS DANS LE VIDE. Depuis la migration
// `migration_canal_appel_lie`, `call:<id>` n'est ouvert qu'aux deux parties
// nommées par la ligne `call_invites`. Un ONGLET DÉJÀ OUVERT sur l'ancien
// client s'abonne AVANT de déposer l'invitation : Realtime le refuse
// (CHANNEL_ERROR, motif de policy) et l'ancien code ne faisait que le
// journaliser — l'appel « sonnait » jusqu'au délai, l'appelé restait
// « connexion… ». Ici, tout canal d'appel dont l'abonnement est refusé POUR
// DÉFAUT DE DROIT termine l'appel en le DISANT (recharger l'application), et
// le trace. Une coupure réseau (TIMED_OUT sans motif de policy) n'est pas
// concernée : Realtime la retente. Le contrat complet : docs/APPELS_TRANSITION.md.
function _callSurveillerStatut(status, err) {
  if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
  if (!_rtRefusDePolicy(err)) return;
  try { if (typeof diagLog === "function") diagLog("call_canal_refuse " + status + " " + String((err && err.message) || err || "").slice(0, 80)); } catch (e) {}
  if (window._call) { toast("Impossible de rejoindre l'appel : ta version de l'application est périmée — recharge-la"); _callTeardown(); }
}

// Lie les handlers de signalisation à un canal d'appel.
function _callBindChannelEvents(chan) {
  // ⚠️ ASTRA-49 (cinquième contre-revue, 15/09/2026) — `ready` ÉTAIT PERDU AVANT
  // L'ABONNEMENT. Depuis ASTRA-23 l'appelant DÉPOSE l'invitation (HTTP) avant de
  // s'abonner à `call:<id>` ; la sonnerie part d'un trigger dès la ligne écrite.
  // Reproduit avec les vrais gestionnaires : réponse HTTP retardée, l'appelé
  // accepte et envoie `ready` AVANT l'abonnement de l'appelant → zéro
  // destinataire ; l'appelant reste « calling », l'appelé « connecting », aucune
  // offre ; l'invitation répétée est ignorée (« déjà en cours »). Le broadcast
  // est éphémère : un message unique vers un canal sans abonné n'existe pas.
  // LE PROTOCOLE, désormais : la réponse est REJOUABLE. L'appelé répète `ready`
  // toutes les secondes jusqu'à recevoir l'offre (borné par sa propre garde de
  // délai) ; l'appelant crée l'offre UNE fois et la REJOUE à chaque `ready`
  // tant qu'aucune réponse n'est arrivée ; l'appelé, sur une offre déjà reçue,
  // REJOUE sa réponse. Chaque message peut être perdu, aucun n'est unique.
  // (La préparation SÉPARÉE de la sonnerie — ligne écrite, canal rejoint, PUIS
  // sonnerie — est le durcissement serveur documenté avec ASTRA-23 ; celui-ci
  // est client, déployable seul, et ferme déjà la course.)
  // La surveillance s'accroche ICI, sans toucher aux deux appels à `subscribe`
  // (appelant, appelé) : le statut passe d'abord par `_callSurveillerStatut`.
  if (chan && typeof chan.subscribe === "function" && !chan._passioSurveille) {
    chan._passioSurveille = true;
    // (`subscribe(callback, timeout)` : deux paramètres dans supabase-js 2.x.)
    const abonnerOriginal = chan.subscribe.bind(chan);
    chan.subscribe = function (cb, timeout) { return abonnerOriginal(function (status, err) { try { _callSurveillerStatut(status, err); } catch (e) {} if (typeof cb === "function") cb(status, err); }, timeout); };
  }
  chan.on("broadcast", { event: "ready" }, async () => {
    const cs = window._call;
    if (!cs || cs.role !== "caller" || !cs.pc) return;
    if (cs.inviteInterval) { clearInterval(cs.inviteInterval); cs.inviteInterval = null; }
    if (cs.ringSendChan) { try { supa.removeChannel(cs.ringSendChan); } catch (e) {} cs.ringSendChan = null; }
    if (cs.status === "calling") { cs.status = "connecting"; const st = document.getElementById("callStatusText"); if (st) st.textContent = "Connexion…"; }
    // Une réponse déjà reçue : l'offre a fait son travail, rien à rejouer.
    if (cs.pc.remoteDescription && cs.pc.remoteDescription.type) return;
    try {
      if (!cs._offreCreee) {
        cs._offreCreee = true;
        console.log("[call] ready reçu → création de l'offre");
        const offer = await cs.pc.createOffer();
        await cs.pc.setLocalDescription({ type: offer.type, sdp: _callTuneSdp(offer.sdp) });
      } else {
        console.log("[call] ready répété → offre rejouée");
      }
      if (cs.pc.localDescription) _callSend("offer", { sdp: cs.pc.localDescription });
    } catch (e) {}
  });
  chan.on("broadcast", { event: "offer" }, async (msg) => {
    const cs = window._call;
    if (!cs || cs.role !== "callee" || !cs.pc) return;
    // L'offre est reçue : la répétition de `ready` s'arrête.
    if (cs.readyInterval) { clearInterval(cs.readyInterval); cs.readyInterval = null; }
    try {
      // Offre déjà traitée : on REJOUE la réponse (elle a pu se perdre), sans
      // renégocier — un second setRemoteDescription relancerait la négociation.
      if (cs._offreRecue) { if (cs.pc.localDescription) _callSend("answer", { sdp: cs.pc.localDescription }); return; }
      cs._offreRecue = true;
      await cs.pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
      const answer = await cs.pc.createAnswer();
      await cs.pc.setLocalDescription({ type: answer.type, sdp: _callTuneSdp(answer.sdp) });
      _callSend("answer", { sdp: cs.pc.localDescription });
      _callDrainPendingIce();
    } catch (e) { cs._offreRecue = false; }
  });
  chan.on("broadcast", { event: "answer" }, async (msg) => {
    const cs = window._call;
    if (!cs || cs.role !== "caller" || !cs.pc) return;
    // Réponse déjà posée (réponse rejouée par l'appelé) : rien à refaire.
    if (cs.pc.remoteDescription && cs.pc.remoteDescription.type) return;
    try { await cs.pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp)); _callDrainPendingIce(); } catch (e) {}
  });
  chan.on("broadcast", { event: "ice" }, async (msg) => {
    const cs = window._call;
    if (!cs || !cs.pc || !msg.payload || !msg.payload.candidate) return;
    try {
      // Avant la remote description, on met les candidats en file d'attente.
      if (!cs.pc.remoteDescription || !cs.pc.remoteDescription.type) {
        (cs.pendingIce = cs.pendingIce || []).push(msg.payload.candidate);
      } else {
        await cs.pc.addIceCandidate(new RTCIceCandidate(msg.payload.candidate));
      }
    } catch (e) {}
  });
  chan.on("broadcast", { event: "hangup" }, () => { if (window._call) { toast("Appel terminé"); _callTeardown(); } });
  chan.on("broadcast", { event: "decline" }, () => { if (window._call) { toast("Appel refusé"); _callTeardown(); } });
}

function _callDrainPendingIce() {
  const cs = window._call;
  if (!cs || !cs.pc || !cs.pendingIce) return;
  cs.pendingIce.forEach(c => { try { cs.pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {} });
  cs.pendingIce = [];
}

// ── Réception d'une invitation entrante (depuis le canal ring:<MY_UID>) ──
function _callOnInvite(payload) {
  if (!payload || !payload.callId) return;
  // Pilote (ASTRA-60) : appels désactivés — une invitation (ancien client en cache) est ignorée, et tracée.
  if (!appelsDisponibles()) { try { if (typeof diagLog === "function") diagLog("call_ignore_pilote"); } catch (e) {} return; }
  // Un `from` qui n'est pas un compte n'est pas une invitation (cf. _callFromValide).
  if (!_callFromValide(payload.from)) return;
  // L'appelant RÉPÈTE l'invitation toutes les 2 s (fiabilité). On ignore donc
  // les doublons : même appel déjà en cours, ou écran entrant déjà affiché.
  if (window._call && window._call.id === payload.callId) return;          // déjà accepté CET appel
  if (!window._call && window._callIncoming && window._callIncoming.callId === payload.callId) return; // sonnerie déjà affichée
  // Anti-rafale : un callId NEUF à chaque message ferait réafficher l'écran
  // d'appel entrant en continu — ou, pendant un appel, créer un canal
  // `call:<id>` + decline par message. Au plus UNE nouvelle invitation traitée
  // toutes les 3 s ; l'appelant légitime RÉPÈTE le même callId, dédupliqué
  // ci-dessus, et n'est pas concerné.
  var maintenant = Date.now();
  if (maintenant - (window._callInviteAffichee || 0) < CALL_INVITE_MIN_MS) return;
  window._callInviteAffichee = maintenant;
  if (window._call) {
    // Occupé sur un AUTRE appel → refuse poliment (une seule fois).
    if (window._declinedCallId === payload.callId) return;
    window._declinedCallId = payload.callId;
    const busy = _callChannel("call:" + payload.callId);
    busy.subscribe((s) => { if (s === "SUBSCRIBED") { busy.send({ type: "broadcast", event: "decline", payload: { from: MY_UID } }); setTimeout(() => { try { supa.removeChannel(busy); } catch (e) {} }, 800); } });
    return;
  }
  if (typeof isBlocked === "function" && isBlocked(payload.from)) return; // modération
  console.log("[call] invite reçue de", payload.from, payload.callId);
  payload.identite = _callIdentiteServeur(payload.from);
  window._callIncoming = payload;
  _callRenderIncomingUI(payload);
  _callRafraichirIdentite(payload);
}
const CALL_INVITE_MIN_MS = 3000;

function _callIdAleatoire() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  var a = new Uint32Array(4);
  try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < 4; i++) a[i] = Math.floor(Math.random() * 4294967296); }
  return Array.prototype.map.call(a, function (x) { return x.toString(16).padStart(8, "0"); }).join("");
}

async function acceptIncomingCall() {
  const inv = window._callIncoming;
  if (!inv) return;
  window._callIncoming = null;
  if (typeof RTCPeerConnection === "undefined") { toast("Appels non supportés"); return; }
  // ⚠️ L'acceptation est EN COURS jusqu'à la connexion : « Refuser » pendant la
  // caméra ou le relais (jusqu'à 2,5 s sans rien qui bouge) l'annule. Sans ce jeton,
  // `declineIncomingCall` trouvait `_callIncoming` vide, fermait l'écran… puis
  // l'acceptation reprenait et l'appel se CONNECTAIT, caméra et micro ouverts,
  // après un refus (relecture du 2026-11-09).
  window._callAcceptation = inv;
  let stream;
  _appelEnPreparation();
  // Le relais TURN se demande pendant la permission caméra/micro, et on l'attend
  // (2,5 s au plus) avant de créer la connexion — même raison que `startCall`.
  const _relais = assurerServeursIce();
  try { stream = await _callGetMedia(inv.kind); }
  catch (e) {
    if (window._callAcceptation === inv) window._callAcceptation = null;
    toast("Caméra/micro refusé"); _callDeclineSilent(inv); _callCloseUI(); return;
  }
  try { await _relais; } catch (e) {}
  // Refusée entre-temps, remplacée par une autre acceptation, ou un autre appel a
  // commencé : on s'efface, et la caméra et le micro obtenus sont coupés.
  const acceptationValide = window._callAcceptation === inv && !window._call;
  if (window._callAcceptation === inv) window._callAcceptation = null;
  if (!acceptationValide) { try { (stream.getTracks() || []).forEach((t) => t.stop()); } catch (e) {} return; }

  const idn = inv.identite || _callIdentiteServeur(inv.from);
  window._call = {
    id: inv.callId, peer: { id: inv.from, name: idn.name, emoji: idn.emoji, color: idn.color, photo: idn.photo },
    kind: inv.kind, role: "callee", status: "connecting",
    localStream: stream, remoteStream: null, pc: null, chan: null, startedAt: 0, _facing: "user",
  };
  _callRenderActiveUI();
  _callSetupPeerConnection();
  const chan = _callChannel("call:" + inv.callId);
  window._call.chan = chan;
  _callBindChannelEvents(chan);
  chan.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    // ⚠️ ASTRA-49 : `ready` est REJOUÉ chaque seconde jusqu'à l'offre — l'appelant
    // peut ne pas être encore abonné au canal quand le premier part.
    _callSend("ready", {});
    const cs = window._call;
    if (!cs || cs.id !== inv.callId) return;
    if (cs.readyInterval) clearInterval(cs.readyInterval);
    cs.readyInterval = setInterval(() => {
      const c = window._call;
      if (!c || c.id !== inv.callId || (c.pc && c.pc.remoteDescription && c.pc.remoteDescription.type)) { clearInterval(cs.readyInterval); cs.readyInterval = null; return; }
      _callSend("ready", {});
    }, CALL_READY_REPETITION_MS);
    // Borne : sans offre au bout du délai, l'appel entrant est abandonné (comme
    // la sonnerie côté appelant).
    cs.readyTimeout = setTimeout(() => {
      const c = window._call;
      if (c && c.id === inv.callId && c.status === "connecting" && !(c.pc && c.pc.remoteDescription && c.pc.remoteDescription.type)) { toast("L'appelant ne répond plus"); _callTeardown(); }
    }, CALL_READY_TIMEOUT_MS);
  });
}
const CALL_READY_REPETITION_MS = 1000;
const CALL_READY_TIMEOUT_MS = 60000;

function declineIncomingCall() {
  // Une acceptation en cours (caméra, relais) se refuse aussi : son jeton tombe, et
  // `acceptIncomingCall` s'efface à la reprise au lieu de connecter l'appel.
  const inv = window._callIncoming || window._callAcceptation;
  window._callIncoming = null;
  window._callAcceptation = null;
  if (inv) _callDeclineSilent(inv);
  _callCloseUI();
}

function _callDeclineSilent(inv) {
  const chan = _callChannel("call:" + inv.callId);
  chan.subscribe((s) => {
    if (s !== "SUBSCRIBED") return;
    chan.send({ type: "broadcast", event: "decline", payload: { from: MY_UID } });
    setTimeout(() => { try { supa.removeChannel(chan); } catch (e) {} }, 800);
  });
}

// Raccroche (action utilisateur) : prévient le pair puis démonte.
function endCall() {
  if (window._call) { _callSend("hangup", {}); }
  _callTeardown();
}

// Démonte l'appel : ferme pistes, PeerConnection, canal, UI, timer.
function _callTeardown() {
  const cs = window._call;
  if (cs) {
    cs.status = "ended";
    if (cs.ringTimeout) clearTimeout(cs.ringTimeout);
    if (cs.inviteInterval) { clearInterval(cs.inviteInterval); cs.inviteInterval = null; }
    if (cs.readyInterval) { clearInterval(cs.readyInterval); cs.readyInterval = null; }
    if (cs.readyTimeout) { clearTimeout(cs.readyTimeout); cs.readyTimeout = null; }
    if (cs.statsInterval) { clearInterval(cs.statsInterval); cs.statsInterval = null; }
    try { (cs.localStream && cs.localStream.getTracks() || []).forEach(t => t.stop()); } catch (e) {}
    try { if (cs.pc) cs.pc.close(); } catch (e) {}
    try { if (cs.chan) supa.removeChannel(cs.chan); } catch (e) {}
    try { if (cs.ringSendChan) supa.removeChannel(cs.ringSendChan); } catch (e) {}
  }
  window._call = null;
  if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
  _callCloseUI();
}

function _callMarkConnected() {
  const cs = window._call;
  if (!cs || cs.status === "connected") return;
  cs.status = "connected";
  cs.startedAt = Date.now();
  const statusEl = document.getElementById("callStatusText");
  if (statusEl) statusEl.textContent = cs.kind === "video" ? "Appel vidéo" : "Appel audio";
  // Monte la qualité (débits d'encodage) une fois la connexion établie.
  _callApplyMediaQuality();
  // Ré-affirme la qualité après quelques secondes (le 1ᵉʳ setParameters avant
  // que le média ne circule ne « prend » pas toujours), puis une dernière fois
  // après la montée en charge du contrôle de congestion.
  setTimeout(() => { _callApplyMediaQuality(); }, 3000);
  setTimeout(() => { _callApplyMediaQuality(); }, 10000);
  // Lecture en direct des stats (résolution / débit / fps) → affichage + console.
  _callStartStats();
  // Timer.
  if (callTimerInterval) clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    if (!window._call || !window._call.startedAt) return;
    const s = Math.floor((Date.now() - window._call.startedAt) / 1000);
    const t = document.getElementById("callTimer");
    if (t) t.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }, 1000);
}

// Lecture périodique des stats WebRTC (débit/résolution/fps réels) → barre
// `#callStats` + console. Permet de voir si la HD passe vraiment et où ça coince.
function _callStartStats() {
  const cs = window._call;
  if (!cs || !cs.pc) return;
  if (cs.statsInterval) clearInterval(cs.statsInterval);
  let lastBytes = 0, lastTs = 0;
  cs.statsInterval = setInterval(async () => {
    const c = window._call;
    if (!c || !c.pc) return;
    try {
      const stats = await c.pc.getStats();
      let w = 0, h = 0, fps = 0, bytes = 0, ts = 0;
      let pairId = null, relay = false;
      const byId = {};
      stats.forEach((r) => {
        byId[r.id] = r;
        if (r.type === "inbound-rtp" && r.kind === "video") {
          if (typeof r.frameWidth === "number") { w = r.frameWidth; h = r.frameHeight; }
          if (typeof r.framesPerSecond === "number") fps = r.framesPerSecond;
          if (typeof r.bytesReceived === "number") { bytes = r.bytesReceived; ts = r.timestamp; }
        }
        if (r.type === "transport" && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId;
      });
      // Chemin réseau : si le candidat local est de type "relay", l'appel passe
      // par le TURN public (congestionné) et non en P2P direct → qualité dégradée.
      try {
        const pair = pairId && byId[pairId];
        const loc = pair && byId[pair.localCandidateId];
        relay = !!(loc && loc.candidateType === "relay");
      } catch (x) {}
      // Appel audio : pas de vidéo entrante → on prend le débit audio entrant.
      if (!bytes) {
        stats.forEach((r) => { if (r.type === "inbound-rtp" && r.kind === "audio" && typeof r.bytesReceived === "number") { bytes = r.bytesReceived; ts = r.timestamp; } });
      }
      let kbps = 0;
      if (lastTs && ts > lastTs) kbps = Math.round(((bytes - lastBytes) * 8) / (ts - lastTs)); // bytes*8 / ms = kbps
      lastBytes = bytes; lastTs = ts;
      const el = document.getElementById("callStats");
      if (el) {
        let txt = "";
        if (c.kind === "video" && w) txt = w + "×" + h + (fps ? " · " + Math.round(fps) + " fps" : "") + (kbps ? " · " + (kbps >= 1000 ? (kbps / 1000).toFixed(1) + " Mb/s" : kbps + " kb/s") : "");
        else if (kbps) txt = "audio · " + kbps + " kb/s";
        if (txt && relay) txt += " · relais";
        el.textContent = txt;
      }
      if (c.kind === "video") console.log("[call] reçu:", w + "x" + h, Math.round(fps) + "fps", kbps + "kbps", relay ? "(relais TURN)" : "(P2P direct)");
    } catch (e) {}
  }, 2000);
}

// ── Contrôles ──
function toggleCallMute(btn) {
  const cs = window._call; if (!cs || !cs.localStream) return;
  const tracks = cs.localStream.getAudioTracks();
  const on = tracks[0] && tracks[0].enabled;
  tracks.forEach(t => t.enabled = !on);
  if (btn) { btn.classList.toggle("active", on); btn.textContent = on ? "🔇" : "🎙"; }
}
function toggleCallVideo(btn) {
  const cs = window._call; if (!cs || !cs.localStream) return;
  const tracks = cs.localStream.getVideoTracks();
  if (!tracks.length) return;
  const on = tracks[0].enabled;
  tracks.forEach(t => t.enabled = !on);
  if (btn) { btn.classList.toggle("active", on); btn.textContent = on ? "🚫" : "📷"; }
}
async function flipCallCamera() {
  const cs = window._call; if (!cs || cs.kind !== "video" || !cs.pc) return;
  // La caméra de départ est frontale ("user") → le 1ᵉʳ appui doit passer à
  // l'arrière. Bug précédent : `cs._facing` partait `undefined`, donc le 1ᵉʳ
  // appui re-sélectionnait "user" (aucun changement visible).
  const current = cs._facing || "user";
  const next = current === "environment" ? "user" : "environment";
  const quality = CALL_VIDEO_QUALITY;
  let ns = null;
  try {
    // `exact` force réellement le changement de caméra sur mobile.
    ns = await navigator.mediaDevices.getUserMedia({ audio: false, video: Object.assign({ facingMode: { exact: next } }, quality) });
  } catch (e1) {
    // Pas de caméra correspondant en "exact" (ex. webcam unique sur desktop) →
    // on retente en préférence souple ; si ça échoue aussi, une seule caméra.
    try { ns = await navigator.mediaDevices.getUserMedia({ audio: false, video: Object.assign({ facingMode: next }, quality) }); }
    catch (e2) { toast("Une seule caméra disponible"); return; }
  }
  const newTrack = ns.getVideoTracks()[0];
  if (!newTrack) { toast("Caméra indisponible"); return; }
  cs._facing = next;
  const sender = cs.pc.getSenders().find(s => s.track && s.track.kind === "video");
  if (sender) { try { await sender.replaceTrack(newTrack); } catch (e) {} }
  // Remplace la piste dans le flux local + aperçu.
  const old = cs.localStream.getVideoTracks()[0];
  if (old) { cs.localStream.removeTrack(old); old.stop(); }
  cs.localStream.addTrack(newTrack);
  await _callApplyMediaQuality(); // ré-applique le débit sur la nouvelle piste
  const lv = document.getElementById("callLocalVideo");
  if (lv) {
    lv.srcObject = cs.localStream;
    // Effet miroir uniquement pour la caméra frontale (comme les apps natives).
    lv.style.transform = next === "environment" ? "none" : "scaleX(-1)";
  }
}

// ════════════════════════ UI D'APPEL ════════════════════════
function _callOverlayEl() {
  let el = document.getElementById("callOverlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "callOverlay";
    el.className = "call-overlay";
    document.body.appendChild(el);
  }
  return el;
}
function _callCloseUI() {
  window._appelLanceA = null;
  const el = document.getElementById("callOverlay");
  if (el) { el.classList.remove("active"); el.innerHTML = ""; }
}

// ⚠️ TOUTE charge utile d'un canal broadcast est HOSTILE par défaut : elle est
// écrite par un autre client, et la policy Realtime ne regarde que le TOPIC,
// jamais le contenu. `inv.emoji` était posé dans innerHTML SANS échappement —
// une invitation `{ emoji: '<img src=x onerror=…>' }` exécutait du script chez
// n'importe quel compte connecté (red team du 2026-09-11). Même règle que pour
// `comment_interactions` : on échappe à l'AFFICHAGE, et on borne la longueur.
function _emojiBorne(e) {
  return Array.from(String(e == null ? "" : e)).slice(0, 4).join("") || "🙂";
}
function _emojiSur(e) { return escapeHtml(_emojiBorne(e)); }
function _callRenderIncomingUI(inv) {
  const el = _callOverlayEl();
  const isVideo = inv.kind === "video";
  // Identité du SERVEUR (profil de `from`), jamais `inv.name` / `inv.emoji`
  // — cf. _callIdentiteServeur. L'échappement reste : un pseudo est un texte.
  const idn = inv.identite || _callIdentiteServeur(inv.from);
  el.innerHTML =
    '<div class="call-card">' +
      '<div class="call-avatar" style="background:#7c3aed;">' + _emojiSur(idn.emoji) + '</div>' +
      '<div class="call-name">' + escapeHtml(idn.name || "Contact") + '</div>' +
      '<div class="call-status">' + (isVideo ? "Appel vidéo entrant…" : "Appel entrant…") + '</div>' +
      '<div class="call-controls">' +
        '<button class="call-control-btn hangup" onclick="declineIncomingCall()" title="Refuser">📵</button>' +
        '<button class="call-control-btn accept" onclick="acceptIncomingCall()" title="Répondre">✅</button>' +
      '</div>' +
    '</div>';
  // Entrée d'historique : sans elle, un geste de retour pendant la sonnerie
  // quittait l'application. Le filet du bouton retour (closeCurrentOverlay,
  // app-02) la consomme sans raccrocher — cf. le commentaire là-bas.
  if (!el.classList.contains("active") && typeof pushOverlayHistory === "function") {
    pushOverlayHistory("call", "#appel");
  }
  el.classList.add("active");
}

function _callRenderActiveUI() {
  const cs = window._call;
  const el = _callOverlayEl();
  const isVideo = cs.kind === "video";
  el.innerHTML =
    (isVideo ? '<video id="callRemoteVideo" class="call-remote-video" autoplay playsinline></video>' : '<audio id="callRemoteAudio" autoplay></audio>') +
    (isVideo ? '<video id="callLocalVideo" class="call-local-video" autoplay playsinline muted></video>' : '') +
    '<div class="call-card ' + (isVideo ? 'call-card-video' : '') + '">' +
      (isVideo ? '' : '<div class="call-avatar" style="background:' + _cssColor(cs.peer.color || "#7c3aed") + ';">' + escapeHtml(cs.peer.emoji || "🙂") + '</div>') +
      '<div class="call-name">' + escapeHtml(cs.peer.name || "Contact") + '</div>' +
      '<div class="call-status" id="callStatusText">' + (cs.role === "caller" ? "Appel en cours…" : "Connexion…") + '</div>' +
      '<div class="call-timer" id="callTimer">00:00</div>' +
      '<div class="call-stats" id="callStats"></div>' +
      '<div class="call-controls">' +
        '<button class="call-control-btn mute" onclick="toggleCallMute(this)" title="Micro">🎙</button>' +
        (isVideo ? '<button class="call-control-btn video" onclick="toggleCallVideo(this)" title="Caméra">📷</button>' : '') +
        (isVideo ? '<button class="call-control-btn flip" onclick="flipCallCamera()" title="Changer de caméra">🔄</button>' : '') +
        '<button class="call-control-btn hangup" onclick="endCall()" title="Raccrocher">📞</button>' +
      '</div>' +
    '</div>';
  el.classList.add("active");
  // Aperçu local — muted posé en PROPRIÉTÉ : l'attribut écrit par innerHTML
  // n'est pas toujours répercuté (même piège que meSetMedia) → l'aperçu
  // rejouait le propre micro de l'utilisateur = écho/larsen immédiat.
  if (isVideo) {
    const lv = document.getElementById("callLocalVideo");
    if (lv && cs.localStream) { lv.muted = true; lv.volume = 0; lv.srcObject = cs.localStream; }
  }
}

// S'abonne au canal de sonnerie personnel (`ring:<MY_UID>`) pour recevoir les
// appels entrants. Idempotent ; appelé au boot (supaSubscribe).
function _subscribeCallRing() {
  if (typeof supa === "undefined" || !supa || !MY_UID || window._callRingChan) return;
  // Pilote (ASTRA-60) : appels désactivés — pas de sonnerie abonnée (un canal de moins par compte).
  if (!appelsDisponibles()) return;
  // ⚠️ Un VRAI compte seulement : `MY_UID` est fabriqué (`u_…`) pour tout
  // visiteur, qui ne peut recevoir aucun appel. Abonner sa sonnerie privée
  // ferait mesurer à la sonde un refus « pas de compte » et le prendre pour
  // « policies absentes » — repli public pour rien, et un faux signal.
  if (typeof admissionCompteReel === "function" && !admissionCompteReel()) return;
  const chan = _callChannel("ring:" + MY_UID);
  if (!chan) return;
  window._callRingChan = chan;
  chan.on("broadcast", { event: "invite" }, (msg) => { try { _callOnInvite(msg.payload); } catch (e) {} });
  chan.subscribe((st, err) => {
    // Sonde du canal privé (cf. _callChannel) : refus de policy → repli public,
    // UNE fois par session, et on se réabonne aussitôt pour ne pas rater d'appel.
    if (st !== "CHANNEL_ERROR" || window._rtPriveIndisponible || window._callRingChan !== chan) return;
    if (!_rtRefusDePolicy(err)) return;
    window._rtPriveIndisponible = true;
    try { console.warn("[rt] canaux privés refusés (policies Realtime absentes) → repli public"); } catch (e) {}
    // ⚠️ `removeChannel` est ASYNCHRONE, et `supa.channel(topic)` rend le canal
    // EXISTANT tant qu'il n'est pas parti (sa config `private: true` avec) :
    // se réabonner tout de suite rendait le même canal en cours de départ, dont
    // `subscribe()` est un no-op — plus aucune sonnerie pour toute la session,
    // sans erreur. On se réabonne APRÈS le départ effectif.
    Promise.resolve(supa.removeChannel(chan)).catch(function () {}).then(function () {
      window._callRingChan = null;
      _subscribeCallRing();
    });
  });
}
window._subscribeCallRing = _subscribeCallRing;

// ════════════════════════════════════════════════════════════════════════
// WEB PUSH — recevoir un appel même app FERMÉE
// ════════════════════════════════════════════════════════════════════════
// Clé publique VAPID (la privée vit côté Edge Function `notify-call`, jamais ici).
const CALL_VAPID_PUBLIC = "BDtLiNPAVm63VXN_z5cc_hliMa_u5DfFsv_CGQ_8Hb41mDbS5UD8F6gKHRdEb2JmTR95gciKKpOk3jbSOSm8PO0";

function _urlB64ToUint8(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Abonne CET appareil aux push et enregistre l'abonnement en base. Idempotent.
// N'agit que si la permission de notification est déjà accordée (ne prompte pas).
async function ensureCallPushSubscription() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (typeof supa === "undefined" || !supa || !window._supaReal) return;
    // `MY_UID` ne prouve pas qu'un compte existe (#367) : sous le placeholder
    // d'un visiteur, `push_insert_own` refuse — et un visiteur n'a personne à
    // qui répondre au téléphone.
    if (typeof _uidEstUnCompte === "function" ? !_uidEstUnCompte() : !MY_UID) return;
    // ⚠️ UN 403 AVEC UN COMPTE N'EST PAS TOUJOURS UN ENDPOINT VOLÉ, ET LA
    // REPRISE D'ENDPOINT EST ALORS UN REMÈDE DESTRUCTIF POSÉ SUR LA MAUVAISE
    // CAUSE. `_uidEstUnCompte()` ne regarde que la FORME de `MY_UID` ; la policy
    // `push_insert_own` / `push_update_own`, elle, compare à `auth.uid()`. Sous
    // une identité divergente (appareil repris par un autre compte, `passio_uid`
    // survivant), l'upsert est refusé QUOI QU'IL ARRIVE : l'endpoint neuf
    // demandé au navigateur est refusé exactement comme l'ancien. La reprise ne
    // converge donc jamais — un 403 par session, indéfiniment, pour le MÊME
    // compte — et elle a jeté au passage, par `unsubscribe()`, le seul
    // abonnement push valide de l'appareil : le remède laisse l'appareil plus
    // sourd qu'il ne l'était. `supaMarkRead` et `supaMarkStoryView` consultent
    // cette autorité depuis #369 ; ce chemin-ci, le SEUL où le 403 a été mesuré
    // AVEC un compte, ne la consultait pas.
    // ⚠️ Elle ne répond `true` que sur une divergence PROUVÉE (session absente,
    // illisible ou sans `user.id` → `false`) : on ne coupe jamais un abonnement
    // légitime pour une cause supposée. Et on le TRACE — une divergence muette
    // est indiscernable d'un calme plat.
    if (typeof _identiteDivergeDeLaSession === "function" && _identiteDivergeDeLaSession(MY_UID)) {
      try { if (typeof diagLog === "function") diagLog("push_subscription: identite locale != session"); } catch (e) {}
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _urlB64ToUint8(CALL_VAPID_PUBLIC) });
    }
    // ⚠️ L'ÉCHEC ÉTAIT DEUX FOIS MUET, ET `_callPushReady` MENTAIT.
    // Mesuré en production : 17 × POST /rest/v1/push_subscriptions → 403, sur
    // 12 sessions et 3 comptes réels, le dernier le 2026-09-13 à 05:51. Le SDK
    // ne LÈVE PAS sur un refus RLS : l'`await` sans lecture de `{ error }`
    // passait pour un succès, `_callPushReady = true` était posé quand même, et
    // l'appareil n'était abonné à RIEN — donc aucune notification d'appel ni de
    // message application fermée, ce qui vide de son effet la fiche « Notifier
    // un message privé ». Un abonnement qui échoue en silence est pire qu'une
    // absence d'abonnement : il se croit fait.
    let r = await supa.from("push_subscriptions").upsert(
      { endpoint: sub.endpoint, user_id: MY_UID, subscription: sub.toJSON() },
      { onConflict: "endpoint" }
    );
    // ⚠️ LA CAUSE DU 403 N'EST PAS UNE POLICY TROP STRICTE, C'EST UN ENDPOINT
    // DÉJÀ POSSÉDÉ. La clé primaire est l'`endpoint`, qui appartient au
    // NAVIGATEUR, pas au compte : quand un second compte se connecte sur le même
    // appareil, `getSubscription()` rend le MÊME endpoint et l'upsert tente de
    // réassigner une ligne dont `user_id` est celui du premier — `push_update_own`
    // (USING user_id = auth.uid()) refuse, et PostgreSQL rend 42501. Aucune
    // policy ne peut arbitrer cela sans laisser un compte revendiquer la ligne
    // d'un autre ; c'est au navigateur de trancher, et il sait le faire : on lui
    // demande un endpoint NEUF. L'appareil change de main, la ligne ne change
    // pas d'avis. UNE SEULE reprise par session — deux comptes qui se partagent
    // vraiment un téléphone ne doivent pas se voler l'abonnement en boucle.
    const refusAcces = !!(r && r.error && (Number(r.status) === 403 || String(r.error.code || "") === "42501"));
    if (refusAcces && !window._pushEndpointRepris) {
      window._pushEndpointRepris = true;
      try { await sub.unsubscribe(); } catch (e) {}
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _urlB64ToUint8(CALL_VAPID_PUBLIC) });
      r = await supa.from("push_subscriptions").upsert(
        { endpoint: sub.endpoint, user_id: MY_UID, subscription: sub.toJSON() },
        { onConflict: "endpoint" }
      );
    }
    if (r && r.error) {
      // Le refus laisse une trace : c'est ce qui manquait pour qu'il se voie.
      try { if (typeof diagLog === "function") diagLog("push_subscription refus " + String(r.error.code || r.status || "?")); } catch (e) {}
      console.warn("[call] push subscription refusée :", r.error.message);
      return;
    }
    window._callPushReady = true;
    console.log("[call] push subscription enregistrée");
  } catch (e) { console.warn("[call] ensureCallPushSubscription:", e && e.message); }
}
window.ensureCallPushSubscription = ensureCallPushSubscription;

// Demande la permission de notification (geste utilisateur) puis s'abonne.
// Appelée la 1ʳᵉ fois que l'utilisateur ouvre une conversation, pour qu'il
// puisse RECEVOIR des appels même app fermée. Ne re-prompte pas si déjà décidé.
async function requestCallNotifications() {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") { await ensureCallPushSubscription(); return; }
    if (Notification.permission === "denied") return; // déjà refusé : on n'insiste pas
    if (window._callNotifAsked) return;
    window._callNotifAsked = true;
    const perm = await Notification.requestPermission();
    // Le toast ne promet que ce qui part : les appels sont coupés pendant le
    // pilote (`appelsDisponibles`), les messages et les rappels d'activité non.
    if (perm === "granted") {
      toast(appelsDisponibles() ? "Tu recevras les appels même app fermée" : "Tu seras prévenu·e de tes messages même app fermée");
      await ensureCallPushSubscription();
    }
  } catch (e) {}
}
window.requestCallNotifications = requestCallNotifications;

// Réveille le destinataire via push (app fermée). Best-effort, en plus du ring
// temps réel (qui couvre le cas app ouverte).
function _callPushNotify(peer, callId, kind) {
  try {
    if (typeof supa === "undefined" || !supa || !window._supaReal) return;
    supa.functions.invoke("notify-call", { body: {
      toUserId: peer.id, callId: callId, kind: kind,
      fromName: _callMyName(), fromEmoji: (currentProfile() && currentProfile().emoji) || "📞",
    }}).then(r => { console.log("[call] notify-call:", r && r.data); }).catch(() => {});
  } catch (e) {}
}

// Affiche l'écran d'appel entrant à partir d'une push (app ouverte depuis la
// notification, ou message du SW). Reconstruit une invitation et l'affiche ;
// les invitations realtime répétées de l'appelant prendront le relais ensuite.
function handlePushIncomingCall(d) {
  if (!d || !d.callId) return;
  // ⚠️ ENTONNOIR UNIQUE DES DEUX PORTES D'APPEL ENTRANT — le lien profond
  // `?call=<id>&from=<uuid>` (`_checkIncomingCallFromUrl`) et le message
  // `INCOMING_CALL` du service worker. Aucune des deux n'est sur le chemin de
  // `supaSubscribe`, et l'attente du lien profond teste `window._supaReal &&
  // MY_UID` — **vrai pour un `u_<aléatoire>`**, l'idiome même que ce lot a
  // corrigé ailleurs. Un visiteur voyait donc l'écran d'appel entrant et, qu'il
  // accepte OU refuse, ouvrait un canal `call:<id>` : une place sur les 500.
  // Il ne peut de toute façon recevoir aucun appel — sa sonnerie `ring:` est
  // gardée par `admissionCompteReel` depuis le 2026-09-11 (capacité, 2026-09-20).
  if (typeof connexionTempsReelAutorisee === "function" && !connexionTempsReelAutorisee()) {
    try { diagLog("rt_visiteur : appel entrant ignoré (pas de compte)"); } catch (e) {}
    return;
  }
  // S'assurer d'être abonné au canal d'appel pour la suite du handshake.
  try { if (typeof _subscribeCallRing === "function") _subscribeCallRing(); } catch (e) {}
  _callOnInvite({ callId: d.callId, from: d.from, kind: d.kind || "voice", name: d.cname || d.name || "Contact", emoji: d.cemoji || d.emoji || "📞" });
}
window.handlePushIncomingCall = handlePushIncomingCall;

// App ouverte VIA la notification d'appel (?call=…) → écran d'appel entrant.
function _checkIncomingCallFromUrl() {
  try {
    const p = new URLSearchParams(location.search);
    const callId = p.get("call");
    if (!callId) return;
    _appelEnPreparation();
    // Nettoie l'URL (évite de re-déclencher au prochain rendu / partage du lien).
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    const d = { callId: callId, from: p.get("from"), kind: p.get("kind") || "voice", cname: p.get("cname"), cemoji: p.get("cemoji") };
    // Laisse le temps à supa/MY_UID de s'initialiser avant d'afficher l'écran.
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (window._supaReal && MY_UID) { clearInterval(iv); handlePushIncomingCall(d); }
      else if (tries > 40) { clearInterval(iv); handlePushIncomingCall(d); } // au pire on affiche quand même
    }, 250);
  } catch (e) {}
}

// App ouverte via un lien de live partagé (?live=…) → rejoint le direct.
function _checkLiveFromUrl() {
  try {
    const p = new URLSearchParams(location.search);
    const liveId = p.get("live");
    if (!liveId) return;
    _appelEnPreparation();
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (window._supaReal && MY_UID && typeof joinVideoLive === "function") { clearInterval(iv); joinVideoLive(liveId); }
      else if (tries > 40) { clearInterval(iv); }
    }, 250);
  } catch (e) {}
}

// Messages du service worker (app déjà ouverte quand la notif est cliquée).
if (typeof navigator !== "undefined" && navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "INCOMING_CALL") { try { handlePushIncomingCall(e.data.call); } catch (x) {} }
  });
}

// Au chargement : si l'app a été ouverte par une notif d'appel / un lien de live.
if (typeof document !== "undefined") {
  const _vliveBootChecks = () => { _checkIncomingCallFromUrl(); _checkLiveFromUrl(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", _vliveBootChecks);
  else setTimeout(_vliveBootChecks, 300);
}

// Création de groupe (conversation multi-utilisateurs)
function toggleGroupUser(el) {
  el.classList.toggle("selected");
  const cb = el.querySelector("input[type=checkbox]");
  if (cb) cb.checked = el.classList.contains("selected");
  const check = el.querySelector(".grp-check");
  if (check) check.textContent = el.classList.contains("selected") ? "✓" : "";
  // LOT-5 (MSG-C04) : la sélection survit à une nouvelle recherche.
  const id = el.getAttribute("data-uid");
  if (id && window._grpSel) {
    if (el.classList.contains("selected")) window._grpSel.set(id, el.getAttribute("data-nom") || "");
    else window._grpSel.delete(id);
  }
}

// LOT-5 (audit UX/UI du 2026-11-10, MSG-C04) — LES MEMBRES D'UN NOUVEAU GROUPE.
// La liste était `state.seed.users.slice(0, 10)` : dix personnages d'exemple, sans
// recherche ; la base refusait ensuite leurs identifiants et l'écran disait
// « Groupe créé ». Pour un COMPTE : tes contacts réels (conversations), puis la
// recherche de personnes du serveur ; jamais un personnage d'exemple.
function _grpOptionHTML(u, coche) {
  return '<div class="group-user-option' + (coche ? ' selected' : '') + '" data-uid="' + escapeHtml(u.id) + '" data-nom="' + escapeHtml(u.name || "") + '" onclick="toggleGroupUser(this)">' +
    '<input type="checkbox" value="' + escapeHtml(u.id) + '"' + (coche ? ' checked' : '') + ' />' +
    '<span class="msg-avatar" style="background:' + avatarBg(u) + ';width:36px;height:36px;font-size:18px;flex-shrink:0;">' + avatarInner(u) + '</span>' +
    '<span style="flex:1;font-size:13px;">' + escapeHtml(u.name || "Passionné") + '</span>' +
    '<span class="grp-check">' + (coche ? '✓' : '') + '</span>' +
  '</div>';
}
function _grpContactsReels() {
  var vus = {};
  return (getConversations() || []).filter(function (c) {
    if (!c || c.isGroup || !c.userId || vus[c.userId] || estPersonneExemple(c.userId)) return false;
    vus[c.userId] = true; return true;
  }).map(function (c) {
    return { id: c.userId, name: c.userName || "Passionné", profileEmoji: c.userEmoji || "✨", avatar: c.userColor || "#8b5cf6", photoUrl: c.userPhoto || null };
  });
}
function _grpPeindreCandidats(liste, vide) {
  var box = document.getElementById("grpNewList");
  if (!box) return;
  var sel = window._grpSel || new Map();
  // Les personnes déjà cochées restent en tête, même hors de la recherche courante.
  var dejaVus = {};
  var html = [];
  sel.forEach(function (nom, id) {
    dejaVus[id] = true;
    var u = (liste || []).find(function (x) { return x.id === id; }) || { id: id, name: nom };
    html.push(_grpOptionHTML(u, true));
  });
  (liste || []).forEach(function (u) { if (!dejaVus[u.id]) html.push(_grpOptionHTML(u, false)); });
  box.innerHTML = html.length ? html.join("") : '<div class="grp-new-vide" style="font-size:12px;color:var(--muted);padding:8px 0;">' + escapeHtml(vide || "Aucune personne trouvée.") + '</div>';
}
function grpChercherMembres(q) {
  var brut = String(q || "").trim();
  var plie = plierRecherche(brut);
  var contacts = _grpContactsReels();
  var locaux = plie ? contacts.filter(function (u) { return plierRecherche(u.name).includes(plie); }) : contacts;
  _grpPeindreCandidats(locaux, plie ? "Aucune personne trouvée." : "Écris le nom d'une personne pour l'inviter.");
  if (!plie || typeof supaSearchUsers !== "function") return;
  window._grpRequete = plie;
  supaSearchUsers(brut).then(function (res) {
    if (window._grpRequete !== plie) return;   // une réponse ancienne n'écrase pas la courante
    var vus = {}; locaux.forEach(function (u) { vus[u.id] = true; });
    var serveur = (res || []).filter(function (u) { return u && u.id && u.id !== MY_UID && !vus[u.id] && !estPersonneExemple(u.id); })
      .map(function (u) { return { id: u.id, name: u.username || "Passionné", profileEmoji: u.emoji || "✨", avatar: u.color || "#8b5cf6", photoUrl: u.photoUrl || null }; });
    _grpPeindreCandidats(locaux.concat(serveur).slice(0, 12), "Aucune personne trouvée.");
  }).catch(function () {});
}
function toggleGroupPassion(el) {
  const selected = document.querySelectorAll(".group-passion-option.selected");
  if (!el.classList.contains("selected") && selected.length >= 3) {
    toast("Maximum 3 passions"); return;
  }
  el.classList.toggle("selected");
  const cb = el.querySelector("input[type=checkbox]");
  if (cb) cb.checked = el.classList.contains("selected");
}

// ⚠️ LA GRILLE POUVAIT ÊTRE VIDE, DONC LE GROUPE IMPOSSIBLE À CRÉER (2026-09-12).
// `allPassions().filter(p => myPassionIds.includes(p.id))` INTERSECTAIT les
// passions du compte avec le SOCLE EMBARQUÉ (19 + perso) : un compte dont les
// passions viennent du référentiel plat — « Ski alpin », « Moto enduro »,
// « Astrophotographie » — n'avait plus AUCUNE case à cocher, et « Passion(s) du
// groupe (1 à 3) » est obligatoire. Impasse dure, sans message.
//
// L'intention (« uniquement les passions de cette personne ») était juste ; la
// SOURCE ne l'était pas. On part donc des passions du COMPTE et on demande
// leurs métadonnées à `passionById`, qui sait déjà retomber sur
// `PassioPassions.parId` (repli d'affichage d'app-02). Même famille que le
// panneau de première visite corrigé le même jour.
function _groupePassionsHTML() {
  const vivantes = (typeof passionsVivantes === "function")
    ? passionsVivantes()
    : ((state.user && state.user.profiles) || []).filter(pr => !pr.archived);
  const vus = Object.create(null);
  const out = [];
  vivantes.forEach(function (pr) {
    const pid = pr && pr.passion;
    if (!pid || vus[pid]) return;
    vus[pid] = 1;
    let meta = null;
    try { meta = (typeof passionById === "function") ? passionById(pid) : null; }
    catch (e) { try { diagLog("groupe passionById " + (e && e.message ? e.message : e)); } catch (_) {} }
    out.push({
      id: pid,
      emoji: (meta && meta.emoji) || "\u2728",
      // ⚠️ `passionById` ne rend JAMAIS null : sur un identifiant qu'il ne
      // connaît pas encore il rend « Passion ». On préfère alors l'identifiant,
      // qui dit au moins de quoi il s'agit, à un libellé générique répété.
      label: (meta && meta.label && meta.label !== "Passion") ? meta.label : pid,
    });
  });
  return out.map(p =>
    `<div class="group-passion-option" data-pid="${escapeHtml(p.id)}" onclick="toggleGroupPassion(this)">
      <input type="checkbox" value="${escapeHtml(p.id)}" />
      <span>${escapeHtml(p.emoji)} ${escapeHtml(p.label)}</span>
    </div>`
  ).join("");
}

// Le référentiel porte les LIBELLÉS : sans lui, une passion plate s'affiche
// sous son identifiant. On le demande à l'ouverture — jamais au démarrage,
// l'invariant « 568 Ko hors du chemin critique » tient — puis on REPEINT.
//
// ⚠️ UN REPEINT EFFACE LES COCHES, ET C'EST LA MÊME IMPASSE DURE, DÉCALÉE DE
// DEUX SECONDES. La grille est le premier bloc interactif après le nom : on
// coche sa passion tout de suite, le fichier de 568 Ko arrive, `innerHTML`
// régénère les options SANS la classe `.selected` que `confirmCreateGroup`
// relit — et « Créer le groupe » répond « Choisis au moins 1 passion ».
// Mesuré : coches avant repeint 1, après 0. On mémorise donc les cochés et on
// les repose. (Le même lot le faisait déjà pour le `<select>` de l'IRL ; c'est
// l'asymétrie entre les deux qui a laissé passer le défaut.)
function _groupeRepeindreEnGardantLesCoches() {
  const grille = document.querySelector(".group-passion-grid");
  if (!grille) return;
  const coches = Array.from(grille.querySelectorAll(".group-passion-option.selected"))
    .map(el => el.getAttribute("data-pid"))
    .filter(Boolean);
  grille.innerHTML = _groupePassionsHTML();
  coches.forEach(function (pid) {
    const el = grille.querySelector('.group-passion-option[data-pid="' + (window.CSS && CSS.escape ? CSS.escape(pid) : pid) + '"]');
    if (!el) return;
    el.classList.add("selected");
    const cb = el.querySelector("input[type=checkbox]");
    if (cb) cb.checked = true;
  });
}

function _groupeAssurerLibelles() {
  try {
    const m = window.PassioPassions;
    if (!m || !m.actif() || m.pret()) return;
    m.charger().then(function () {
      _groupeRepeindreEnGardantLesCoches();
    }).catch(function (e) { try { diagLog("groupe referentiel " + (e && e.message ? e.message : e)); } catch (_) {} });
  } catch (e) { try { diagLog("groupe referentiel " + e.message); } catch (_) {} }
}

function openCreateGroup() {
  const seedUsers = state.seed.users || [];
  const compte = (typeof _compteAuthReel === "function") && _compteAuthReel();
  window._grpSel = new Map();
  window._grpRequete = "";
  // Sans compte, rien ne part en base : l'aperçu d'avant reste (exemples).
  const userOptions = compte ? "" : seedUsers.slice(0, 10).map(u => _grpOptionHTML(u, false)).join("");
  const recherche = compte
    ? `<input type="search" class="input" id="grpNewSearch" placeholder="Rechercher une personne…" oninput="grpChercherMembres(this.value)" style="margin-bottom:8px;" />`
    : "";
  const passionOptions = _groupePassionsHTML();

  const html = `
    <div class="modal-handle"></div>
    
    <div class="pay-modal-head">
      <div class="pay-modal-emoji">👥</div>
      <div class="pay-modal-title">Nouveau groupe</div>
    </div>
    <p style="font-size:13px;color:var(--text-dim);margin-bottom:12px;">Crée un groupe autour d'une ou plusieurs passions, avec les membres de ton choix.</p>

    <label class="field"><span>Nom du groupe</span>
      <input type="text" class="input" id="groupName" placeholder="Ex: Photographes de Lyon · Lecteurs assidus…" maxlength="50" />
    </label>

    <label class="field"><span>Passion(s) du groupe (1 à 3)</span></label>
    <div class="group-passion-grid">${passionOptions}</div>

    <label class="field" style="margin-top:14px;"><span>Membres à inviter</span></label>
    ${recherche}
    <div class="group-user-list" id="grpNewList">${userOptions}</div>

    <button class="btn primary block" onclick="confirmCreateGroup()" style="margin-top:14px;">Créer le groupe</button>
  `;
  openModal(html);
  _groupeAssurerLibelles();
  if (compte) grpChercherMembres("");
}

async function confirmCreateGroup() {
  const nameInput = document.getElementById("groupName");
  const name = (nameInput && nameInput.value || "").trim();
  if (!name) { toast("Donne un nom au groupe"); return; }
  const selectedPassions = [...document.querySelectorAll(".group-passion-option.selected input")].map(i => i.value);
  const selectedUsers = (window._grpSel && window._grpSel.size)
    ? [...window._grpSel.keys()]
    : [...document.querySelectorAll(".group-user-option.selected input")].map(i => i.value);
  if (selectedPassions.length === 0) { toast("Choisis au moins 1 passion"); return; }
  if (selectedUsers.length === 0) { toast("Sélectionne au moins 1 membre"); return; }

  let groupId = "conv_grp_" + uid();
  // LOT-5 (MSG-C04) : le verdict de CHAQUE ajout est lu ; un membre refusé par la
  // base n'est ni compté ni annoncé.
  const rapport = { refuses: [] };

  // Créer le groupe dans Supabase si connecté
  // LOT-28 (audit UX/UI du 2026-11-10, MSG-C23) : hors ligne ou serveur en panne,
  // un COMPTE lisait « Groupe créé » pour une ébauche locale que personne d'autre
  // ne verrait jamais (0 ligne en base, rien au retour du réseau). Un groupe non
  // créé côté serveur n'est plus annoncé : la fenêtre reste ouverte, et on le dit.
  const compteReel = !!(window._supaReal && typeof _compteAuthReel === "function" && _compteAuthReel());
  if (compteReel && navigator.onLine === false) { toast("Pas de connexion — le groupe n'est pas créé. Réessaie quand le réseau revient.", "warning"); return; }
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    let supaId = null;
    try {
      supaId = await supaCreateGroup(name, selectedUsers, selectedPassions[0], rapport);
      if (supaId) groupId = supaId;
    } catch(e) {}
    if (compteReel && !supaId) { toast("Le groupe n'a pas pu être créé — vérifie ta connexion et réessaie.", "warning"); return; }
  }
  const refuses = new Set(rapport.refuses || []);
  const membresAjoutes = selectedUsers.filter(u => !refuses.has(u));

  // ⚠️ PAR IDENTIFIANT, JAMAIS À L'AVEUGLE : ma propre ligne `conv_members` m'est
  // poussée sur `user:<moi>` (`conv_members:INSERT`, R25) et peut avoir posé
  // l'entrée pendant `supaCreateGroup` — un `unshift` nu doublait le groupe
  // (`deduplicateConversations` ne fusionne pas les groupes). L'entrée locale,
  // plus riche (passions, message de bienvenue), remplace celle de la poussée.
  const convs = getConversations().filter(c => c && c.id !== groupId);
  const welcomeMsgId = "msg_" + uid();
  const newConv = {
    createdBy: MY_UID, // LOT-4 (MSG-C08)
    id: groupId,
    isGroup: true,
    groupName: name,
    groupPassions: selectedPassions,
    userIds: membresAjoutes,
    userId: membresAjoutes[0] || selectedUsers[0],
    passion: selectedPassions[0],
    unread: 0,
    lastAt: Date.now(),
    messages: [
      { id: welcomeMsgId, from: "me", text: `J'ai créé ce groupe « ${name} » 🎉 Bienvenue à tous !`, at: Date.now() },
    ],
  };
  convs.unshift(newConv);
  conversationsState = convs;
  saveConversations();

  // Envoyer le message de bienvenue dans Supabase
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    try {
      supa.from("conv_messages").insert({ id: welcomeMsgId, conv_id: groupId, from_id: MY_UID, content: _withSenderMeta(newConv.messages[0].text), created_at: new Date().toISOString() }).then(() => {}).catch(() => {});
    } catch(e) {}
  }

  closeModal();
  renderMessages();
  if (refuses.size) {
    const noms = [...refuses].map(id => (window._grpSel && window._grpSel.get(id)) || "un membre");
    toast(`Groupe « ${name} » créé — pas pu ajouter : ${noms.join(", ")}`, "warning");
  } else {
    toast(`Groupe « ${name} » créé`);
  }
  window._grpSel = null;
}

// LOT-4 (audit UX/UI du 2026-11-10, MSG-C08) — UN SEUL CALCUL des membres d'un groupe.
// `userIds` inclut MON compte quand il vient du serveur, pas quand le groupe a été
// créé ici : l'en-tête disait 4, la fenêtre 5. Les autres membres, sans moi, uniques.
function membresAutresGroupe(c) {
  var vus = {};
  return ((c && c.userIds) || []).filter(function (id) {
    if (!id || id === "me" || id === MY_UID || vus[id]) return false;
    vus[id] = true; return true;
  });
}
function nbMembresGroupe(c) { return membresAutresGroupe(c).length + 1; }
// Le rôle se tire du créateur ; inconnu, personne n'est présenté comme tel.
function estCreateurGroupe(c) { return !!(c && c.createdBy && c.createdBy === MY_UID); }

// LOT-4 (MSG-C09) : retirer quelqu'un d'un groupe se confirme, comme « Quitter ».
function confirmerRetraitMembre(convId, userId, nom) {
  ouvrirFeuilleConfirmation({
    titre: "Retirer " + (nom || "ce membre") + " du groupe ?",
    texte: ["Cette personne ne recevra plus les messages du groupe."],
    actions: [{ id: "retirer", libelle: "Retirer du groupe", danger: true, agir: function () { removeGroupMember(convId, userId); } }],
  });
}

function showGroupMembers(convId) {
  var convs = getConversations();
  var c = convs.find(function(x) { return x.id === convId; });
  if (!c) return;
  _renderGroupMembersModal(convId);
}

function _renderGroupMembersModal(convId) {
  var convs = getConversations();
  var c = convs.find(function(x) { return x.id === convId; });
  if (!c) return;
  var seedUsers = state.seed.users || [];
  // LOT-4 (MSG-C08) : la liste, le compte et le rôle disent vrai. Plus de « Admin ·
  // En ligne » écrit en dur, plus de libellé de remplissage, plus de membre absent
  // parce qu'il n'est pas dans le cache de démonstration ; « Retirer » et « Ajouter »
  // ne sont proposés qu'au créateur, jamais sur le créateur.
  var memberIds = membresAutresGroupe(c);
  var nbMembres = memberIds.length + 1;
  var jeCree = estCreateurGroupe(c);
  var moi = (state.user && state.user.general) || {};

  var membersHTML = '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">' +
    '<div style="width:40px;height:40px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;">' + escapeHtml(moi.profileEmoji || "😊") + '</div>' +
    '<div style="flex:1;"><div style="font-weight:700;font-size:13px;">Toi</div>' + (jeCree ? '<div style="font-size:11px;color:var(--muted);">A créé le groupe</div>' : '') + '</div>' +
  '</div>';

  membersHTML += memberIds.map(function(uid) {
    var u = seedUsers.find(function(x) { return x.id === uid; });
    var p = (!u && typeof _profileCache !== "undefined" && _profileCache && _profileCache.get) ? _profileCache.get(uid) : null;
    var nom = (u && u.name) || (p && p.username) || "Membre";
    var avatar = u ? '<div style="width:40px;height:40px;border-radius:50%;background:' + avatarBg(u) + ';display:flex;align-items:center;justify-content:center;font-size:18px;">' + avatarInner(u) + '</div>'
      : '<div style="width:40px;height:40px;border-radius:50%;background:' + escapeHtml((p && p.color) || "#8b5cf6") + ';display:flex;align-items:center;justify-content:center;font-size:18px;">' + escapeHtml((p && p.emoji) || "👤") + '</div>';
    var estCreateur = !!(c.createdBy && c.createdBy === uid);
    return '<div class="grp-membre" data-membre="' + escapeHtml(uid) + '" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">' +
      avatar +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:13px;">' + escapeHtml(nom) + '</div>' +
        (estCreateur ? '<div style="font-size:11px;color:var(--muted);">A créé le groupe</div>' : '') +
      '</div>' +
      ((jeCree && !estCreateur) ? '<button class="btn ghost grp-retirer" style="min-height:44px;font-size:13px;padding:0 14px;color:#b91c1c;border-color:rgba(185,28,28,0.35);" onclick="confirmerRetraitMembre(\'' + escapeJsArg(convId) + '\',\'' + escapeJsArg(uid) + '\',\'' + escapeJsArg(nom) + '\')">Retirer</button>' : '') +
    '</div>';
  }).join("");

  var passionsHTML = (c.groupPassions || (c.passion ? [c.passion] : [])).filter(Boolean).map(function(pid) {
    var p = passionById(pid);
    return p ? '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--bg-deep);border-radius:8px;font-size:11px;font-weight:700;">' + escapeHtml(p.emoji) + ' ' + escapeHtml(p.label) + '</span>' : '';
  }).join(" ");

  // Utilisateurs non encore membres
  var nonMembers = seedUsers.filter(function(u) { return !memberIds.includes(u.id); });

  function buildNonMembersHTML(filter) {
    var filtered = filter ? nonMembers.filter(function(u) {
      return plierRecherche(u.name).includes(plierRecherche(filter));
    }) : nonMembers;
    if (nonMembers.length === 0) return '<div style="font-size:12px;color:var(--muted);padding:8px 0;">Tous les utilisateurs sont déjà membres.</div>';
    if (filtered.length === 0) return '<div style="font-size:12px;color:var(--muted);padding:8px 0;">Aucun résultat.</div>';
    return filtered.map(function(u) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:' + avatarBg(u) + ';display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">' + avatarInner(u) + '</div>' +
        '<span style="flex:1;font-size:13px;font-weight:600;">' + escapeHtml(u.name) + '</span>' +
        '<button class="btn primary" style="font-size:11px;padding:5px 12px;" onclick="addGroupMember(\'' + escapeJsArg(convId) + '\',\'' + escapeJsArg(u.id) + '\')">+ Ajouter</button>' +
      '</div>';
    }).join("");
  }

  // Avatar groupe (photo ou emoji)
  var grpAvatarHTML;
  if (c.groupPhoto) {
    grpAvatarHTML = '<div style="position:relative;width:72px;height:72px;margin:0 auto 12px;cursor:pointer;" onclick="pickGroupPhoto(\'' + escapeJsArg(convId) + '\')">' +
      '<div style="width:72px;height:72px;border-radius:50%;background:url(\'' + (_cssUrl(passioThumb(c.groupPhoto, 192)) || "") + '\') center/cover;border:3px solid var(--accent);"></div>' +
      '<div style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid var(--bg-card);">📷</div>' +
    '</div>';
  } else {
    grpAvatarHTML = '<div style="position:relative;width:72px;height:72px;margin:0 auto 12px;cursor:pointer;" onclick="pickGroupPhoto(\'' + escapeJsArg(convId) + '\')">' +
      '<div style="width:72px;height:72px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:32px;">👥</div>' +
      '<div style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:var(--bg-deep);display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid var(--bg-card);">📷</div>' +
    '</div>';
  }

  openModal(
    '<div class="modal-handle"></div>' +
    grpAvatarHTML +
    '<div class="modal-title" style="margin-top:0;">👥 ' + escapeHtml(c.groupName || "Groupe") + '</div>' +
    '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;">' + nbMembres + ' membre' + (nbMembres > 1 ? 's' : '') + '</div>' +
    '<div onclick="editGroupDescription(\'' + escapeJsArg(convId) + '\')" style="cursor:pointer;font-size:13px;color:' + (c.groupDesc ? 'var(--text)' : 'var(--muted)') + ';background:var(--bg-deep);border-radius:10px;padding:9px 12px;margin-bottom:10px;">' +
      (c.groupDesc ? escapeHtml(c.groupDesc) : 'Ajouter une description…') + '</div>' +
    '<div style="margin-bottom:12px;">' + passionsHTML + '</div>' +
    // Onglets
    '<div role="tablist" aria-label="Groupe" style="display:flex;gap:0;margin-bottom:14px;border-bottom:2px solid var(--border);">' +
      '<button id="grpTab_members" role="tab" aria-selected="true" aria-controls="grpPanel_members" onclick="switchGroupTab(\'members\')" style="flex:1;background:none;border:none;padding:8px 0;font-size:13px;font-weight:700;color:var(--accent);border-bottom:2px solid var(--accent);margin-bottom:-2px;cursor:pointer;">Membres (' + nbMembres + ')</button>' +
      (jeCree ? '<button id="grpTab_add" role="tab" aria-selected="false" aria-controls="grpPanel_add" onclick="switchGroupTab(\'add\')" style="flex:1;background:none;border:none;padding:8px 0;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;">Ajouter</button>' : '') +
    '</div>' +
    // Panneau Membres
    '<div id="grpPanel_members" style="display:block;">' +
      '<div style="max-height:280px;overflow-y:auto;">' + membersHTML + '</div>' +
    '</div>' +
    // Panneau Ajouter
    '<div id="grpPanel_add" style="display:none;">' +
      '<div style="position:relative;margin-bottom:10px;">' +
        '<span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);pointer-events:none;display:inline-flex;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" style="width:14px;height:14px;color:var(--muted);display:block;"><circle cx="11" cy="11" r="7"/><path d="M20 20 L16.4 16.4"/></svg></span>' +
        '<input id="grpSearchInput" type="text" placeholder="Rechercher un utilisateur..." aria-label="Chercher une personne à ajouter" enterkeyhint="search" oninput="filterGroupAddList(this.value)" ' +
          'style="width:100%;box-sizing:border-box;padding:9px 12px 9px 34px;border-radius:12px;border:1px solid var(--border);background:var(--bg-deep);color:var(--text);font-size:13px;outline:none;">' +
      '</div>' +
      '<div id="grpAddList" style="max-height:240px;overflow-y:auto;">' + buildNonMembersHTML("") + '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px;">' +
      '<button class="btn ghost" onclick="closeModal();openConversation(\'' + escapeJsArg(convId) + '\')" style="flex:1;">← Retour</button>' +
      '<button class="btn ghost" onclick="leaveGroup(\'' + escapeJsArg(convId) + '\')" style="flex:1;color:#ef4444;border-color:rgba(239,68,68,0.3);">Quitter le groupe</button>' +
    '</div>'
  );

  // Stocker les non-membres dans le DOM pour la recherche
  window._grpNonMembers = nonMembers;
  window._grpConvId = convId;
}

function pickGroupPhoto(convId) {
  // Fermer la modal si ouverte pour éviter que le file picker soit bloqué
  var input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  document.body.appendChild(input);
  input.onchange = function(e) {
    var file = e.target.files[0];
    document.body.removeChild(input);
    if (!file) return;
    if (!/^image\//.test(file.type || "")) { toast("Choisis une image (JPG, PNG…)", "warning"); return; }
    var reader = new FileReader();
    reader.onload = function(ev) {
      var convs = getConversations();
      var c = convs.find(function(x) { return x.id === convId; });
      if (!c) return;
      c.groupPhoto = ev.target.result;
      saveConversations();
      // LOT-20 (audit UX/UI du 2026-11-10, MSG-C11) : trois références mortes —
      // `renderConvList` (inexistante : ReferenceError, rien après ne tournait),
      // `#convFpHead .msg-avatar` et `#modal-backdrop` (absents du DOM). Succès
      // annoncé, rien ne changeait. Et la photo n'est écrite que sur CET appareil
      // (aucun dépôt serveur pour un groupe) : on le dit.
      var avatarEl = document.querySelector("#convFpHead .conv-fp-head-avatar");
      if (avatarEl && window._openedConvId === convId) {
        avatarEl.textContent = "";
        avatarEl.style.backgroundImage = 'url("' + String(ev.target.result).replace(/"/g, "%22") + '")';
        avatarEl.style.backgroundSize = "cover";
        avatarEl.style.backgroundPosition = "center";
      }
      try { if (typeof renderMessages === "function") renderMessages(); } catch (e2) {}
      var modalBackdrop = document.getElementById("modalBackdrop");
      if (modalBackdrop && modalBackdrop.classList.contains("active") && typeof _renderGroupMembersModal === "function") {
        try { _renderGroupMembersModal(convId); } catch (e3) {}
      }
      toast("Photo du groupe mise à jour sur cet appareil", "success");
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

// `sansFocus` (facultatif) : basculer sur « Ajouter » SANS y donner le focus — un
// rendu arrivé après un aller-retour réseau ne doit pas ouvrir le clavier sans geste.
function switchGroupTab(tab, sansFocus) {
  var tabMembers = document.getElementById("grpTab_members");
  var tabAdd     = document.getElementById("grpTab_add");
  var panelMembers = document.getElementById("grpPanel_members");
  var panelAdd     = document.getElementById("grpPanel_add");
  if (!tabMembers || !tabAdd) return;
  // LOT-32 (MSG-C28) : l'onglet actif est annoncé, pas seulement coloré.
  tabMembers.setAttribute("aria-selected", tab === "members" ? "true" : "false");
  tabAdd.setAttribute("aria-selected", tab === "members" ? "false" : "true");
  if (tab === "members") {
    tabMembers.style.color = "var(--accent)";
    tabMembers.style.borderBottom = "2px solid var(--accent)";
    tabMembers.style.marginBottom = "-2px";
    tabAdd.style.color = "var(--muted)";
    tabAdd.style.borderBottom = "none";
    tabAdd.style.marginBottom = "0";
    panelMembers.style.display = "block";
    panelAdd.style.display = "none";
  } else {
    tabAdd.style.color = "var(--accent)";
    tabAdd.style.borderBottom = "2px solid var(--accent)";
    tabAdd.style.marginBottom = "-2px";
    tabMembers.style.color = "var(--muted)";
    tabMembers.style.borderBottom = "none";
    tabMembers.style.marginBottom = "0";
    panelMembers.style.display = "none";
    panelAdd.style.display = "block";
    var inp = document.getElementById("grpSearchInput");
    if (inp && !sansFocus) inp.focus();
  }
}

function filterGroupAddList(query) {
  var nonMembers = window._grpNonMembers || [];
  var convId = window._grpConvId || "";
  var filtered = query ? nonMembers.filter(function(u) {
    return plierRecherche(u.name).includes(plierRecherche(query));
  }) : nonMembers;
  var list = document.getElementById("grpAddList");
  if (!list) return;
  if (nonMembers.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0;">Tous les utilisateurs sont déjà membres.</div>';
    return;
  }
  if (filtered.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0;">Aucun résultat.</div>';
    return;
  }
  list.innerHTML = filtered.map(function(u) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">' +
      '<div style="width:36px;height:36px;border-radius:50%;background:' + avatarBg(u) + ';display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">' + avatarInner(u) + '</div>' +
      '<span style="flex:1;font-size:13px;font-weight:600;">' + escapeHtml(u.name) + '</span>' +
      '<button class="btn primary" style="font-size:11px;padding:5px 12px;" onclick="addGroupMember(\'' + escapeJsArg(convId) + '\',\'' + escapeJsArg(u.id) + '\')">+ Ajouter</button>' +
    '</div>';
  }).join("");
}

function _groupMemberName(userId) {
  var u = (state.seed.users || []).find(function(x) { return x.id === userId; });
  if (u) return u.name;
  if (typeof userById === "function") { var uu = userById(userId); if (uu && uu.name) return uu.name; }
  return "Membre";
}

// ⚠️ LOT-1 (audit UX/UI du 2026-11-10, MSG-C05) : l'ajout partait à l'aveugle —
// INSERT envoyé, résultat ignoré, « ajouté·e au groupe » et « a rejoint le
// groupe » annoncés quoi qu'il arrive (mesuré : refus de la policy pour une
// participante non créatrice, membre absent de la base, compteur 8 → 9 à
// l'écran). Même patron que le retrait (RV-44, ci-dessous) : ce que le serveur
// n'a jamais pu avoir reste local ; sinon on écrit, on LIT le verdict, et
// seulement alors on annonce.
var _ajoutsMembreEnVol = {};
function _ajoutMembreLocal(c, convId, userId, name, apresAllerRetour) {
  c.userIds = c.userIds || [];
  if (c.userIds.includes(userId)) return;
  c.userIds.push(userId);
  c.messages.push({ id: "msg_" + uid(), from: "me", text: "👋 " + name + " a rejoint le groupe.", at: Date.now(), fromName: "Passio" });
  c.lastAt = Date.now();
  saveConversations();
  toast(name + " ajouté·e au groupe", "success");
  var bd = document.getElementById("modalBackdrop");
  if (!apresAllerRetour || (bd && bd.classList.contains("active") && window._grpConvId === convId)) _renderGroupMembersModal(convId);
  var fp = document.getElementById("conv-fullpage");
  if (fp && fp.classList.contains("active") && (!apresAllerRetour || window._openedConvId === convId)) renderConvFpThread(c, c.groupName || "Groupe");
}
function addGroupMember(convId, userId) {
  var convs = getConversations();
  var c = convs.find(function(x) { return x.id === convId; });
  if (!c) return;
  c.userIds = c.userIds || [];
  if (c.userIds.includes(userId)) return;
  var name = _groupMemberName(userId);
  // Ce que le serveur n'a jamais pu avoir (visiteur, ébauche locale, membre
  // non uuid) : ajout local, comme avant — les règles sont celles du retrait.
  if (!_retraitMembreViseLeServeur(convId, userId)) { _ajoutMembreLocal(c, convId, userId, name, false); return; }
  if (typeof sessionExpiree === "function" && sessionExpiree()) {
    toast("Ta session a expiré — reconnecte-toi pour ajouter " + name + " au groupe.", "error");
    return;
  }
  if (typeof supa === "undefined" || !supa || !window._supaReal) {
    toast("Le service n'a pas pu se charger : recharge l'application pour ajouter " + name + " au groupe.", "error");
    return false;
  }
  var cle = convId + "|" + userId;
  if (_ajoutsMembreEnVol[cle]) return _ajoutsMembreEnVol[cle];
  var envoi;
  try {
    envoi = Promise.resolve(supa.from("conv_members").insert({ conv_id: convId, user_id: userId }).select("user_id"));
  } catch (e) {
    envoi = Promise.reject(e);
  }
  var p = envoi.then(function(r) {
    if (r && r.error) {
      var code = String(r.error.code || "");
      // 23505 : la ligne existe déjà — il EST membre, l'ajout est acquis.
      if (code === "23505") { _ajoutMembreLocal(c, convId, userId, name, true); return true; }
      try { if (typeof diagLog === "function") diagLog("conv_members ajout refusé", code.slice(0, 12)); } catch (e) {}
      var reseau = typeof estEchecReseau === "function" && estEchecReseau(r.error);
      toast(reseau ? "Pas de connexion : " + name + " n'a pas été ajouté·e. Réessaie quand le réseau revient."
                   : "Le serveur a refusé l'ajout de " + name + " au groupe.", "error");
      return false;
    }
    _ajoutMembreLocal(c, convId, userId, name, true);
    return true;
  }, function(e) {
    toast("Pas de connexion : " + name + " n'a pas été ajouté·e. Réessaie quand le réseau revient.", "error");
    return false;
  }).then(function(v) { delete _ajoutsMembreEnVol[cle]; return v; });
  _ajoutsMembreEnVol[cle] = p;
  return p;
}

// ══════════════════════════════════════════════════════════════════════════
// RETIRER UN MEMBRE D'UN GROUPE — L'ÉCRAN NE DIT QUE CE QUE LE SERVEUR A RENDU
// (RV-44, 2026-11-06 ; corrigé après la revue du même jour)
// ──────────────────────────────────────────────────────────────────────────
// Le retrait partait à l'aveugle : DELETE envoyé, résultat ignoré, membre ôté de
// l'état local et « retiré·e du groupe » annoncé quoi qu'il arrive. Or le SDK ne
// LÈVE PAS sur un refus RLS, et un DELETE que la RLS filtre touche 0 ligne SANS
// erreur : depuis C-04, la policy de lecture de conv_members cachait au CRÉATEUR
// d'une discussion d'activité le membre qu'il avait bloqué — « Suppression admin »
// touchait 0 ligne, le membre restait (il lisait et écrivait), et l'écran disait
// le contraire. Côté base : migration_discussions_activite_2026-11-06.sql.
// TROIS CHEMINS :
//   · ce que le serveur n'a JAMAIS pu avoir → retrait LOCAL, comme avant, sans
//     requête : un visiteur (pas de compte réel, `_compteAuthReel`), une ébauche
//     de groupe restée locale (`conv_grp_…` : `supaCreateGroup` a échoué), un
//     membre qui ne peut pas être en base (identifiant non uuid — les personnages
//     de démonstration que « Nouveau groupe » propose : la clé étrangère
//     conv_members.user_id → profiles les refuse) ;
//   · un compte réel qui ne peut pas joindre le serveur — session expirée
//     (`sessionExpiree()`) ou SDK non chargé (`_supaReal` faux) : RIEN ne change,
//     et l'écran le dit — le membre est en base, l'ôter localement serait le
//     mensonge corrigé ici (un groupe créé SANS SDK reste une ébauche `conv_grp_` :
//     `supaCreateGroup` rend null quand le SDK n'est pas chargé, app-08) ;
//   · sinon DELETE … RETURNING user_id (`.select("user_id")`), en lisant
//     `{ error }` ET le nombre de lignes : 1 ligne → retiré, le comportement
//     d'avant ; une erreur → « le serveur a refusé », sauf une réponse 5xx
//     (« pas confirmé » : la ligne a pu partir) et un 401 (« reconnecte-toi ») ;
//     une panne réseau → « pas de connexion : le retrait n'a pas été CONFIRMÉ » ;
//     0 ligne n'est PAS « toujours membre » : on relit sa ligne ET la mienne —
//     lui présent → « toujours membre » (lu) ; lui absent et moi visible → il
//     n'y est déjà plus (parti, retiré ailleurs, ajout refusé) : retrait local,
//     idempotent — SAUF dans une discussion d'activité (`evgrp_`) : C-04 y cache
//     à tout membre NON créateur, même après la migration, le membre bloqué qui
//     se relirait « absent » (et au créateur aussi tant qu'elle n'est pas
//     appliquée) ; le bouton « Retirer » s'affiche à tous. Là, et dans tout autre
//     doute, « le retrait n'a pas été confirmé par le serveur ».
// Le succès arrive APRÈS l'aller-retour : la modale et le fil ne sont repeints
// que s'ils montrent ENCORE ce groupe — sinon la modale fermée revenait, et le
// fil du groupe s'affichait dans le panneau d'une AUTRE conversation, dont le
// bouton d'envoi restait lié à l'autre destinataire (`_openedConvId`, la règle
// de tout rendu asynchrone du fil, app-04) ; la modale rendue de nouveau garde
// l'onglet « Ajouter » et sa recherche s'ils étaient ouverts. Un double toucher
// pendant l'aller-retour ne repart pas. Rend une promesse (true = retiré) sur le
// chemin serveur, false quand rien n'a pu partir, rien sur le chemin local ;
// l'onclick inline l'ignore. Verrou : tests/e2e/retrait-membre-groupe.spec.js.
// ══════════════════════════════════════════════════════════════════════════
var _retraitsMembreEnVol = {};
var _RE_UUID_MEMBRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Le serveur a-t-il pu avoir cette appartenance ? Sinon : retrait local, comme avant.
function _retraitMembreViseLeServeur(convId, userId) {
  if (typeof _compteAuthReel !== "function" || !_compteAuthReel()) return false;
  if (/^conv_grp_/.test(String(convId || ""))) return false;
  return _RE_UUID_MEMBRE.test(String(userId || ""));
}
function _retraitMembreLocal(c, convId, userId, name, apresAllerRetour) {
  c.userIds = (c.userIds || []).filter(function(id) { return id !== userId; });
  c.messages.push({ id: "msg_" + uid(), from: "me", text: "👋 " + name + " a quitté le groupe.", at: Date.now(), fromName: "Passio" });
  c.lastAt = Date.now();
  saveConversations();
  toast("🗑 " + name + " retiré·e du groupe");
  if (!apresAllerRetour) {
    _renderGroupMembersModal(convId);
    var fp = document.getElementById("conv-fullpage");
    if (fp && fp.classList.contains("active")) renderConvFpThread(c, c.groupName || "Groupe");
    return;
  }
  // L'écran a pu changer pendant l'aller-retour : ne repeindre que ce qui montre ENCORE ce groupe.
  var bd = document.getElementById("modalBackdrop");
  if (bd && bd.classList.contains("active") && window._grpConvId === convId && document.getElementById("grpPanel_members")) {
    // La modale est refaite sur l'onglet « Membres » : l'onglet « Ajouter » et sa
    // recherche, s'ils étaient ouverts, sont rendus tels quels (revue du 06/11).
    var panAjout = document.getElementById("grpPanel_add");
    var surAjout = !!(panAjout && panAjout.style.display !== "none");
    var champ = document.getElementById("grpSearchInput");
    var recherche = champ ? String(champ.value || "") : "";
    // Le focus n'est rendu que s'il était dans le champ (pas de clavier ouvert sans
    // geste), et la liste garde sa position de défilement.
    var avaitFocus = !!(champ && document.activeElement === champ);
    var liste = document.getElementById("grpAddList");
    var defilement = liste ? liste.scrollTop : 0;
    _renderGroupMembersModal(convId);
    if (surAjout && typeof switchGroupTab === "function") {
      switchGroupTab("add", !avaitFocus);
      var champ2 = document.getElementById("grpSearchInput");
      if (champ2 && recherche) {
        champ2.value = recherche;
        if (typeof filterGroupAddList === "function") filterGroupAddList(recherche);
      }
      var liste2 = document.getElementById("grpAddList");
      if (liste2 && defilement) liste2.scrollTop = defilement;
    }
  }
  var fp2 = document.getElementById("conv-fullpage");
  if (fp2 && fp2.classList.contains("active") && window._openedConvId === convId) renderConvFpThread(c, c.groupName || "Groupe");
}
// L'échec, dit sans affirmer plus que ce qui a été lu. Trace sans donnée
// personnelle : ni nom, ni identifiant — la cause et le code seuls.
function _retraitMembreEchec(name, cause, raison) {
  var textes = {
    reseau: "Pas de connexion : le retrait de " + name + " n'a pas été confirmé. Réessaie quand le réseau revient.",
    // SDK non chargé : il ne se recharge pas tout seul quand le réseau revient
    // (`ensureSupabase` garde sa promesse rejetée) — seul un rechargement le remet.
    hors_ligne: "Le service n'a pas pu se charger : recharge l'application pour retirer " + name + " du groupe.",
    session: "Ta session a expiré — reconnecte-toi pour retirer " + name + " du groupe.",
    refus: "Le serveur a refusé le retrait de " + name + ".",
    toujours_membre: name + " est toujours membre du groupe : le serveur n'a pas accepté le retrait.",
    non_confirme: "Le retrait de " + name + " n'a pas été confirmé par le serveur.",
  };
  try {
    if (typeof diagLog === "function") {
      var code = raison && typeof raison === "object" ? (raison.code || raison.status || "") : "";
      diagLog("conv_members retrait non confirmé", cause, String(code).slice(0, 12));
    }
  } catch (e) {}
  toast(textes[cause] || textes.non_confirme, "error");
}
// Une session vivante ? Sans moyen de le savoir, on le suppose : on n'affirme jamais
// « reconnecte-toi » sans l'avoir lu.
function _sessionVivante() {
  try {
    if (typeof supa === "undefined" || !supa || !supa.auth || typeof supa.auth.getSession !== "function") return Promise.resolve(true);
    return Promise.resolve(supa.auth.getSession()).then(function(r) {
      return !!(r && r.data && r.data.session);
    }, function() { return true; });
  } catch (e) {
    return Promise.resolve(true);
  }
}
// 0 ligne : le membre est-il encore là ? Sa ligne ET la mienne (témoin : si je ne
// me vois pas, son absence ne prouve rien). Rend "present", "absent" ou "inconnu".
function _relireAppartenance(convId, userId) {
  var moi = typeof MY_UID !== "undefined" && MY_UID ? MY_UID : "";
  var lecture;
  try {
    lecture = Promise.resolve(supa.from("conv_members").select("user_id").eq("conv_id", convId).in("user_id", [moi, userId]));
  } catch (e) {
    lecture = Promise.reject(e);
  }
  return lecture.then(function(r) {
    if (!r || r.error || !Array.isArray(r.data)) return "inconnu";
    var ids = r.data.map(function(x) { return x && x.user_id; });
    if (ids.indexOf(userId) >= 0) return "present";
    if (ids.indexOf(moi) < 0) return "inconnu";
    // C-04 cache, dans une discussion d'activité, un membre bloqué avec moi — même
    // à son créateur avant la migration : là, « absent » n'est pas une preuve.
    if (/^evgrp_/.test(String(convId || ""))) return "inconnu";
    return "absent";
  }, function() { return "inconnu"; });
}
function removeGroupMember(convId, userId) {
  var convs = getConversations();
  var c = convs.find(function(x) { return x.id === convId; });
  if (!c) return;
  var name = _groupMemberName(userId);
  if (!_retraitMembreViseLeServeur(convId, userId)) {
    _retraitMembreLocal(c, convId, userId, name);
    return;
  }
  if (typeof sessionExpiree === "function" && sessionExpiree()) {
    _retraitMembreEchec(name, "session");
    return false;
  }
  if (!(typeof supa !== "undefined" && supa && window._supaReal)) {
    _retraitMembreEchec(name, "hors_ligne");
    return false;
  }
  var cle = convId + "\u0000" + userId;
  if (_retraitsMembreEnVol[cle]) return _retraitsMembreEnVol[cle];
  var envoi;
  // Supabase : retire le membre (autorisé au créateur via la policy « Suppression admin »).
  try {
    envoi = Promise.resolve(supa.from("conv_members").delete().eq("conv_id", convId).eq("user_id", userId).select("user_id"));
  } catch (e) {
    envoi = Promise.reject(e);
  }
  var retirerIci = function() {
    // L'état a pu être relu pendant l'aller-retour : on retire sur la conversation COURANTE.
    var courante = getConversations().find(function(x) { return x.id === convId; }) || c;
    _retraitMembreLocal(courante, convId, userId, name, true);
    return true;
  };
  var suite = envoi.then(function(r) {
    if (r && r.error) {
      // Une réponse 5xx (passerelle, délai) n'est pas un refus : le DELETE a pu être
      // validé — « pas confirmé » ; un 401 dit la session, pas la policy.
      // 429 (limiteur) et un statut 0 que `estEchecReseau` ne reconnaît pas (abandon)
      // ne sont pas des refus non plus : rien n'a été tranché.
      var statut = Number(r.status) || 0;
      var cause = (typeof estEchecReseau === "function" && estEchecReseau(r.error)) ? "reseau"
        : statut === 401 ? "session"
        : (statut >= 500 || statut === 429 || statut === 0) ? "non_confirme"
        : "refus";
      // La trace garde le statut HTTP : l'objet d'erreur du SDK ne le porte pas.
      _retraitMembreEchec(name, cause, { code: (r.error && r.error.code) || String(statut || "") });
      return false;
    }
    if (r && Array.isArray(r.data) && r.data.length >= 1) return retirerIci();
    return _relireAppartenance(convId, userId).then(function(etat) {
      if (etat === "absent") return retirerIci();
      if (etat === "present") {
        _retraitMembreEchec(name, "toujours_membre", { code: "0 ligne" });
        return false;
      }
      // « inconnu » — je ne me vois pas moi-même : la session a pu mourir. Le DELETE
      // part alors sous la clé anon, que « Suppression admin » (TO public) admet :
      // 200 [] sans erreur, et la relecture est vide. Sans session vivante, le dire
      // et poser le mode « session expirée », comme la publication (app-08).
      return _sessionVivante().then(function(vivante) {
        if (!vivante) {
          try { if (typeof poserSessionExpiree === "function") poserSessionExpiree("retrait_membre"); } catch (e) {}
          _retraitMembreEchec(name, "session", { code: "sans session" });
        } else {
          _retraitMembreEchec(name, "non_confirme", { code: "0 ligne" });
        }
        return false;
      });
    });
  }, function(e) {
    _retraitMembreEchec(name, typeof estEchecReseau === "function" && estEchecReseau(e) ? "reseau" : "non_confirme", e);
    return false;
  }).then(function(ok) {
    delete _retraitsMembreEnVol[cle];
    return ok;
  }, function(e) {
    delete _retraitsMembreEnVol[cle];
    try { console.warn("[groupe] retrait d'un membre :", e && e.message); } catch (_e) {}
    return false;
  });
  _retraitsMembreEnVol[cle] = suite;
  return suite;
}

// Quitter un groupe : retire MA propre adhésion (RLS « Suppression propre ») et
// supprime la conversation localement.
// ⚠️ ANNONCÉ = FAIT (ETAT-04, audit du 2026-11-10). Le retrait de `conv_members`
// partait sans être lu : sur un refus ou une coupure, l'écran disait « Tu as quitté
// le groupe » et la pierre tombale cachait la conversation, alors que le compte en
// restait MEMBRE — il continuait d'en recevoir les messages et les notifications.
// Pour un compte, on attend le verdict ; un échec garde la conversation et le dit.
async function leaveGroup(convId) {
  // LOT-6 (TRA-C11) : feuille de l'application, plus de boîte native.
  if (!(await confirmerAction({ titre: "Quitter ce groupe ?", texte: "Tu ne recevras plus ses messages.", libelle: "Quitter le groupe", danger: true }))) return;
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID && window._supaReal
      && typeof _compteAuthReel === "function" && _compteAuthReel()) {
    var v;
    try {
      v = _writeVerdict(await supa.from("conv_members").delete().eq("conv_id", convId).eq("user_id", MY_UID).select("conv_id"),
        { expectRows: true, label: "quitter le groupe" });
    } catch (e) { v = { ok: false }; }
    if (!v.ok) { toast("Impossible de quitter le groupe pour l'instant — réessaie"); return; }
  }
  conversationsState = (getConversations() || []).filter(function(c){ return c.id !== convId; });
  if (typeof convTombAdd === "function") convTombAdd("conv", convId);  // sinon la fusion au boot la ressuscite (ADR-008)
  saveConversationsNow();
  closeModal();
  try { if (typeof closeConversation === "function") closeConversation(); } catch(e) {}
  try { renderMessages(); } catch(e) {}
  toast("Tu as quitté le groupe");
}

// Édite la description du groupe (locale + colonne conversations.description).
async function editGroupDescription(convId) {
  var c = getConversations().find(function(x){ return x.id === convId; });
  if (!c) return;
  // LOT-6 (TRA-C11) : un champ dans une feuille de l'application, plus de prompt().
  var d = await demanderTexte({ titre: "Description du groupe", valeur: c.groupDesc || "", placeholder: "De quoi parle ce groupe ?", libelle: "Enregistrer", multiligne: true, max: 2000 });
  if (d == null) return;
  var avant = c.groupDesc || "";
  c.groupDesc = d.trim();
  saveConversations();
  _renderGroupMembersModal(convId);
  // ⚠️ ANNONCÉ = GARDÉ (SRV-04, audit du 2026-11-10). L'écriture partait sans être
  // lue : un membre que la policy n'autorise pas voyait « Description mise à jour »,
  // et la description revenait au prochain rechargement. Pour un compte, le verdict
  // décide ; un refus rend l'ancienne description.
  if (typeof supa !== "undefined" && supa && window._supaReal && typeof _compteAuthReel === "function" && _compteAuthReel()) {
    return supa.from("conversations").update({ description: c.groupDesc }).eq("id", convId).select("id")
      .then(function (res) { return _writeVerdict(res, { expectRows: true, label: "description du groupe" }); },
            function () { return { ok: false }; })
      .then(function (v) {
        if (v.ok) { toast("Description mise à jour", "success"); return; }
        c.groupDesc = avant;
        saveConversations();
        try { _renderGroupMembersModal(convId); } catch (e) {}
        toast("Description non modifiée — le serveur l'a refusée");
      });
  }
  toast("Description mise à jour", "success");
}

function sendMessage(convId) {
  // Mode invité (première visite) : cette action engage le compte. Le gate
  // EXPLIQUE l'action puis propose la création de compte ; il ne rejoue jamais
  // l'action après coup. Rend `true` — donc inerte — hors mode invité.
  if (window.requireAuthentication && !requireAuthentication("message")) return;
  // Redirige vers sendMessageFp qui utilise la vraie UI pleine page
  sendMessageFp(convId);
}

// Filtres messagerie, deux niveaux indépendants
document.addEventListener("click", (e) => {
  const passionTile = e.target.closest("[data-msgpassion]");
  if (passionTile) {
    msgPassionFilter = passionTile.getAttribute("data-msgpassion");
    renderMessages();
    return;
  }
});

// ======== BOBINES (REELS) ========
const REELS_PAUSE_AT = 15;
const reelsState = {
  open: false,
  items: [],
  current: 0,
  liked: new Set(),
  viewedSinceOpen: 0,
  pausePrompted: false,
  observer: null,
};

// Vidéos seed embarquées, bucket Google public, garanti hotlinkable et lecture H.264
// universelle (iOS, Android, desktop). C'est la même source que celle utilisée par
// Mozilla, MDN, W3Schools dans leurs exemples vidéo.
// Pour la prod : à remplacer par contenus utilisateurs (Studio) ou intégration API Pexels avec clé.
const SEED_REEL_VIDEOS = [
  {
    id: "reel_seed_cuisine_1",
    video: "https://videos.pexels.com/video-files/3195394/3195394-sd_640_360_25fps.mp4",
    poster: imageDemo("photo-1556909114-f6e7ad7d3136", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    userId: "u_theo", passion: "cuisine", mood: "creation",
    text: "Tarte aux fruits du marché. La pâte sablée maison, beurre demi-sel breton. 🍰",
    createdAt: Date.now() - 2 * 3600000,
  },
  {
    id: "reel_seed_sport_skate_1",
    // lot UI-5 : la bobine EST le skate jam des Chartrons. ⚠️ `eventId` fait
    // apparaître « Voir l'activité » en bas de la carte (`refEvenement`,
    // js/ui-v3-passerelle.js) : l'envie DOIT donc être « irl », sinon la carte
    // ouvre un rendez-vous sous une étiquette qui n'en annonce aucun. Verrou :
    // `contenu-passion-mood.spec.js` ② quater.
    eventId: "e11",
    video: "https://videos.pexels.com/video-files/5765270/5765270-sd_640_360_24fps.mp4",
    poster: imageDemo("photo-1543364195-077a52659557", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    userId: "u_theo", passion: "sport", mood: "irl",
    text: "📍 Bordeaux, skatepark des Chartrons — 📅 dimanche 14h\nSkate jam ouvert : on tourne, on filme, personne ne note personne. Je bosse mon kickflip depuis trois mois et aujourd'hui ça commence à venir, donc venez rire.\nPas de niveau, prêt de planche possible. Dis-moi en commentaire si tu passes.",
    createdAt: Date.now() - 4 * 3600000,
  },
  {
    id: "reel_seed_musique_1",
    eventId: "e1",   // lot UI-5 : la bobine EST la prochaine jam de Léa
    video: "https://videos.pexels.com/video-files/5765163/5765163-sd_640_360_24fps.mp4",
    poster: imageDemo("photo-1510915361894-db8b60106cb1", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    userId: "u_lea", passion: "musique", mood: "irl",
    text: "📍 Lyon, Café des Arts — 📅 jeudi 18h30\nCe que vous entendez, c'est l'impro de ce matin — c'est exactement ce qu'on fera jeudi à la jam, en moins seul.\nGuitaristes débutants bienvenus, il reste 4 places. Instrument sur place si tu n'as pas le tien.",
    createdAt: Date.now() - 6 * 3600000,
  },
  {
    id: "reel_seed_voyage_1",
    video: "https://videos.pexels.com/video-files/3571264/3571264-sd_640_360_30fps.mp4",
    poster: imageDemo("photo-1530841377377-3ff06c0ca713", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    userId: "u_nina", passion: "voyage", mood: "all",
    text: "Réveil à 6 h 10 sur la côte, sans alarme, juste le volet en tôle qui claque.\nTrois jours que le téléphone dort éteint au fond du sac. J'ai posé la caméra sur le muret, je l'ai laissée tourner les douze minutes que le soleil a mis à passer la pointe, et je n'y ai plus touché.\nQuatre lignes dans le carnet, puis je suis retournée me coucher.",
    createdAt: Date.now() - 8 * 3600000,
  },
  {
    id: "reel_seed_photo_1",
    video: "https://videos.pexels.com/video-files/3209243/3209243-sd_640_360_25fps.mp4",
    poster: imageDemo("photo-1502920917128-1aa500764cbd", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    userId: "u_karim", passion: "photo", mood: "learn",
    text: "Comment je règle mon argentique avant une sortie street. 📸",
    createdAt: Date.now() - 10 * 3600000,
  },
  {
    id: "reel_seed_cuisine_2",
    video: "https://videos.pexels.com/video-files/4253587/4253587-sd_640_360_25fps.mp4",
    poster: imageDemo("photo-1565299624946-b28f40a0ae38", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    userId: "u_theo", passion: "cuisine", mood: "learn",
    text: "Le geste du pli pour la pâte feuilletée. 80% patience, 20% beurre froid. 🧈",
    createdAt: Date.now() - 12 * 3600000,
  },
  {
    id: "reel_seed_litterature_1",
    video: "https://videos.pexels.com/video-files/6981411/6981411-sd_640_360_25fps.mp4",
    poster: imageDemo("photo-1456513080510-7bf3a84b82f8", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    userId: "u_sofia", passion: "litterature", mood: "irl",
    text: "📍 Bordeaux, café de la place Saint-Michel, table du fond — 📅 dimanche 15 h\nOn lit Les Années d'Annie Ernaux. Chacun vient avec son exemplaire et une page cornée, on parle une heure et demie de ce qui nous a arrêtés dans la lecture, et personne n'est obligé de parler.\nDouze places, la table ne tient pas plus.\nSi vous venez, dites-moi la page que vous voulez lire à voix haute, je fais la liste avant dimanche.",
    createdAt: Date.now() - 14 * 3600000,
  },
  {
    id: "reel_seed_musique_2",
    video: "https://videos.pexels.com/video-files/4488162/4488162-sd_640_360_24fps.mp4",
    poster: imageDemo("photo-1514320291840-2e0a9bf2a9ae", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    userId: "u_lea", passion: "musique", mood: "irl",
    text: "📍 Lyon, une cave voûtée de la Croix-Rousse — 📅 vendredi 20 h 30\nTrois guitares et une voix, deux lampes posées au sol, rien d'amplifié : la pièce fait sept mètres sur quatre, ça porte tout seul.\nTrente personnes assises par terre, pas une de plus, sinon on n'entend plus les cordes frotter.\nLaissez-moi un mot si vous voulez une place, j'envoie l'adresse exacte et le code de la porte la veille.",
    createdAt: Date.now() - 16 * 3600000,
  },
  {
    id: "reel_seed_voyage_2",
    video: "https://videos.pexels.com/video-files/1721294/1721294-sd_640_360_24fps.mp4",
    poster: imageDemo("photo-1502602898657-3e91760cbb34", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
    userId: "u_nina", passion: "voyage", mood: "irl",
    text: "📍 Marrakech, place des Ferblantiers — 📅 samedi 7h15\nOn traverse le souk avant l'ouverture des boutiques : à cette heure il n'y a que les livreurs, les chats et l'odeur du bois mouillé. Deux heures de marche lente, on s'arrête autant qu'on veut pour photographier, et on termine autour d'un thé.\nSix places, pas plus : les ruelles sont étroites et je ne veux gêner personne. Dites-moi si vous venez, je donne le point de rendez-vous exact la veille.",
    createdAt: Date.now() - 18 * 3600000,
  },
  {
    id: "reel_seed_photo_2",
    video: "https://videos.pexels.com/video-files/4065906/4065906-sd_640_360_24fps.mp4",
    poster: imageDemo("photo-1452587925148-ce544e77e70d", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
    userId: "u_karim", passion: "photo", mood: "creation",
    text: "Atelier tirage argentique. L'image apparaît dans le révélateur. 🖤",
    createdAt: Date.now() - 20 * 3600000,
  },
  {
    id: "reel_seed_sport_2",
    video: "https://videos.pexels.com/video-files/4761437/4761437-sd_640_360_25fps.mp4",
    poster: imageDemo("photo-1517649763962-0c623066013b", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    userId: "u_theo", passion: "sport", mood: "learn",
    text: "Échauffement du matin. 15 min de mobilité, ça change tout. 💪",
    createdAt: Date.now() - 22 * 3600000,
  },
  {
    id: "reel_seed_cuisine_3",
    video: "https://videos.pexels.com/video-files/4253586/4253586-sd_640_360_25fps.mp4",
    poster: imageDemo("photo-1495474472287-4d71bcdd2085", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4",
    userId: "u_theo", passion: "cuisine", mood: "irl",
    text: "📍 Marseille, cours Julien, devant le kiosque — 📅 dimanche 9h\nJ'apporte ma cafetière à piston, six mugs en grès d'un potier de la Belle de Mai, du pain de la veille grillé au beurre demi-sel et un pot de confiture d'abricot faite mardi. On tient une heure et demie, pas plus : j'enchaîne sur une prestation à midi.\nSix mugs, donc six places, je bois dans mon thermos. Dites-moi avant samedi soir si vous en prenez une.",
    createdAt: Date.now() - 25 * 3600000,
  },

  {
    id: "reel_seed_art_1",
    video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    poster: imageDemo("photo-1513364776144-60967b0f800f", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    userId: "u_lou", passion: "art", mood: "creation",
    text: "Émaillage d'une série de six bols. La couleur ne se révèle qu'à la sortie du four : on travaille en aveugle. 🏺",
    createdAt: Date.now() - 27 * 3600000,
  },
  {
    id: "reel_seed_danse_1",
    video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    poster: imageDemo("photo-1508700115892-45ecd05ae2ad", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    userId: "u_amira", passion: "danse", mood: "creation",
    text: "Trente secondes de la routine sur laquelle je bosse depuis deux semaines. Le transfert de poids au sol, toujours pas propre. 💃",
    createdAt: Date.now() - 30 * 3600000,
  },
  {
    id: "reel_seed_mode_1",
    video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    poster: imageDemo("photo-1483985988355-763728e1935b", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    userId: "u_zoe", passion: "mode", mood: "creation",
    text: "Une veste de costume des années 80 devient une veste courte. Deux heures, zéro tissu acheté. 🧵",
    createdAt: Date.now() - 33 * 3600000,
  },
  {
    id: "reel_seed_jardinage_1",
    video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    poster: imageDemo("photo-1416879595882-3373a0480b5b", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    userId: "u_lucie", passion: "jardinage", mood: "learn",
    text: "Le compost sans retournement, en trois étapes, tel que je le monte depuis quatre ans à Angers.\n1. Dix centimètres de branchages grossiers au fond, pour que l'air passe par-dessous.\n2. Un seau de déchets de cuisine pour trois seaux de feuilles mortes ou de carton brun : c'est ce ratio qui évite l'odeur.\n3. On couvre d'un vieux tapis et on n'y touche plus pendant six mois.\nCelui que j'ai monté en mars est prêt ce matin, tamisé à la main en vingt minutes.",
    createdAt: Date.now() - 36 * 3600000,
  },
  {
    id: "reel_seed_moto_1",
    video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
    poster: imageDemo("photo-1558980664-10e7ec7b39cb", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    userId: "u_greg", passion: "moto", mood: "irl",
    text: "Col du Béal au petit matin, personne sur la route. C'est pour ces quarante minutes-là qu'on se lève à 5h. 🏍",
    createdAt: Date.now() - 39 * 3600000,
  },
  {
    id: "reel_seed_animaux_1",
    video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
    poster: imageDemo("photo-1450778869180-41d0601e046e", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    userId: "u_maya", passion: "animaux", mood: "learn",
    text: "Rappel au sifflet, séance 4. On travaille à dix mètres, en extérieur, sans distraction. La progression se fait en semaines, pas en jours. 🐾",
    createdAt: Date.now() - 42 * 3600000,
  },
  {
    id: "reel_seed_tech_1",
    video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    poster: imageDemo("photo-1518770660439-4636190af475", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    userId: "u_yanis", passion: "tech", mood: "learn",
    text: "Mon petit outil de tri des notes, écrit un dimanche. Il fait une seule chose et il la fait bien. 💻",
    createdAt: Date.now() - 45 * 3600000,
  },
  {
    id: "reel_seed_litterature_2",
    video: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    poster: imageDemo("photo-1521587760476-6c12a4b040da", "portrait"),
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    userId: "u_anaïs", passion: "litterature", mood: "creation",
    text: "Neuvième version du même poème, treize vers, et je bute toujours au même endroit : le passage du huitième au neuvième vers.\nJe l'ai lu à voix haute six fois hier soir, minuté à 1 min 40 — chaque fois ma voix accélère juste là, signe que le vers ne tient pas.\nCe soir j'essaie de couper les deux vers de liaison pour voir si le trou se referme tout seul. Si ça ne marche pas, je repars de la version 6.",
    createdAt: Date.now() - 48 * 3600000,
  },
];

function getSeedReelPostsWithComments(seedUsers) {
  // Version de getSeedReelPosts() qui reçoit les users en paramètre
  return SEED_REEL_VIDEOS.map(r => {
    // ⚠️ Ces auteurs doivent EXISTER dans seedUsers : u_alex / u_marie / u_luc /
    // u_sara / u_lisa n'y ont jamais figuré, et leurs commentaires s'affichaient
    // signés « ? ». Corrigé le 2026-08-28 avec des personas réels du seed.
    const commentExamples = [
      { text: "J'aime beaucoup 😍", author: "u_karim", name: "Karim Belkacem" },
      { text: "C'est vraiment chouette.", author: "u_emma", name: "Emma Wright" },
      { text: "Trop cool 🔥", author: "u_mehdi", name: "Mehdi Saïd" },
      { text: "Merci pour le partage !", author: "u_sofia", name: "Sofia Lindqvist" },
      { text: "Je veux essayer ça.", author: "u_tom", name: "Tom Larivière" },
      { text: "Magnifique ✨", author: "u_mila", name: "Mila Andreani" },
    ];

    const comments = [];
    const numComments = Math.floor(Math.random() * 4) + 2;

    for (let i = 0; i < numComments; i++) {
      const comment = commentExamples[i % commentExamples.length];
      const replies = [];

      if (Math.random() > 0.7 && i === 0) {
        const creatorUser = seedUsers.find(u => u.id === r.userId) || { name: "Créateur" };
        replies.push({
          type: "text",
          text: "Merci! 😊",
          authorId: r.userId,
          authorName: creatorUser.name,
          createdAt: Date.now() - 1 * 3600000
        });
      }

      if (Math.random() > 0.8) {
        const emojiReactions = ["😂", "❤️", "🔥", "👍", "🎉"];
        replies.push({
          type: "emoji_reaction",
          text: emojiReactions[Math.floor(Math.random() * emojiReactions.length)],
          authorId: "u_" + ["jade", "noah", "zoe", "oliver"][Math.floor(Math.random() * 4)],
          authorName: ["Jade", "Noah", "Zoé", "Olivier"][Math.floor(Math.random() * 4)],
          createdAt: Date.now() - 2 * 3600000
        });
      }

      comments.push({
        id: "comment_" + r.id + "_" + i,
        text: comment.text,
        authorId: comment.author,
        authorName: comment.name,
        createdAt: Date.now() - (i + 1) * 3600000,
        likes: Math.floor(Math.random() * 15),
        likedBy: [],
        replies: replies
      });
    }

    return {
      id: r.id,
      type: "video",
      // Lot UI-5 (§7) : « Si la Bobine possède un event_id, la fiche de
      // l'activité correspondante est affichée directement. » Le champ n'est
      // recopié que s'il existe — une bobine sans activité ne doit surtout pas
      // en porter une vide, `refEvenement` la prendrait pour une référence.
      // ⚠️ Sans ce contenu, la branche « Voir l'activité » du lot serait
      // INVISIBLE, donc indiscernable d'un lot cassé (leçon UI-3B du 2026-08-28).
      ...(r.eventId ? { eventId: r.eventId } : {}),
      // ⚠️ `isReel` est la SEULE condition retenue par buildReels() (avec la
      // présence d'un média) : sans lui, ces douze vidéos n'étaient jamais des
      // bobines — buildReels() renvoyait [] en démonstration, aucun module
      // « Bobines » n'apparaissait, et elles tombaient au contraire dans le
      // fil, sous le nom « Profil » faute d'`authorId`. Corrigé le 2026-08-28.
      isReel: true,
      video: r.video,
      fallback: r.fallback,
      poster: r.poster,
      userId: r.userId,
      // `authorId` double `userId` : les moteurs du fil et le module UI-2
      // résolvent l'auteur par `authorId` (userById), les moteurs de bobines
      // par `userId` (authorOfReel). Les deux pointent le même compte de démo.
      authorId: r.userId,
      profileId: null,
      passion: r.passion,
      mood: r.mood,
      text: r.text,
      createdAt: r.createdAt,
      likes: Math.floor(Math.random() * 280) + 30,
      comments: comments,
      reactions: {},
      _source: "seed_reel",
    };
  });
}

function getSeedReelPosts() {
  // Version basique sans commentaires (les commentaires sont ajoutés via getSeedReelPostsWithComments)
  return SEED_REEL_VIDEOS.map(r => ({
    id: r.id,
    type: "video",
    ...(r.eventId ? { eventId: r.eventId } : {}),   // cf. getSeedReelPostsWithComments
    isReel: true,          // cf. getSeedReelPostsWithComments : sans lui, buildReels() les rejette
    video: r.video,
    fallback: r.fallback,
    poster: r.poster,
    userId: r.userId,
    authorId: r.userId,
    profileId: null,
    passion: r.passion,
    mood: r.mood,
    text: r.text,
    createdAt: r.createdAt,
    likes: Math.floor(Math.random() * 280) + 30,
    comments: [],
    reactions: {},
    _source: "seed_reel",
  }));
}

// Fallback automatique : si une source Pexels échoue, bascule sur la vidéo de secours
// guaranteed-working (bucket Google sample). Appelé par onerror sur l'élément <video>.
// Vidéo indécodable sur CET appareil (ex. webm hérité sur iPhone) : remplace le
// cadre noir par un placeholder explicite. Ne se déclenche que sur une vraie
// erreur de l'élément <video> (réseau ou codec).
function _reelVideoError(videoEl) {
  if (!videoEl || videoEl.dataset.errShown === "1") return;
  videoEl.dataset.errShown = "1";
  var ph = document.createElement("div");
  ph.className = "reel-media";
  ph.style.cssText = "background:linear-gradient(135deg,#4c1d95,#7c3aed);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:rgba(255,255,255,0.9);font-size:14px;font-weight:600;text-align:center;padding:24px;";
  ph.innerHTML = '<span style="font-size:40px;">🎬</span>Vidéo non lisible sur cet appareil';
  // LOT-14 (BOB-C15) : le bouton « ▶ Lire » ne promet plus ce que le message dément.
  try {
    var item = videoEl.closest(".reel-item, .post, .reel-media-container");
    var porte = item && (item.closest(".reel-item") || item);
    if (porte) porte.querySelectorAll("[data-video-public-play], .reel-sound-btn").forEach(function (b) { if (b.parentNode) b.parentNode.removeChild(b); });
  } catch (e) {}
  if (videoEl.parentNode) videoEl.parentNode.replaceChild(ph, videoEl);
}

function reelVideoFallback(videoEl, fallbackUrl) {
  if (!videoEl || !fallbackUrl) return;
  if (videoEl.dataset.fallbackUsed === "1") return;
  videoEl.dataset.fallbackUsed = "1";
  videoEl.setAttribute("data-video-public-src", fallbackUrl);
  videoEl.removeAttribute("src");
  lancerVideoPublique(videoEl, videoEl.dataset.videoPublicVolontaire === "1");
}

function buildReels(pinnedId) {
  // Les Bobines sont une fonctionnalité DISTINCTE du fil (comme Reels) : on ne
  // montre QUE les contenus marqués `isReel` (créés via le type « Bobine » du
  // Studio), jamais les vidéos du feed. Toutes les bobines récentes, dédupliquées,
  // hors comptes bloqués (modération).
  const sources = [
    ...(state.seed.posts || []),
    ...(state.supabasePosts || []),
    ...(state.userPosts || []),
  ];
  const seen = new Set();
  const blocked = state.user.blocked || [];
  const eligibles = sources
    .filter(function(p) {
      if (!p || !p.isReel) return false;
      // 🪦 Une bobine supprimée ne revient pas non plus par ici : `buildReels`
      // relit les trois mêmes tableaux que le fil, et le lecteur les affiche
      // sans repasser par `allFeedPosts`.
      if (typeof postSupprime === "function" && postSupprime(p.id)) return false;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      if (blocked.length && blocked.includes(p.authorId)) return false;
      // Lignes fantômes : d'anciennes bobines ont été insérées en DB avec
      // media_url NULL (upload expiré) → aucune vidéo à montrer. On les masque
      // (sauf ma bobine en cours d'envoi, qui garde son base64 local jouable).
      if (!(p.video || p.image || p.photo || p.coverPhotoUrl || p.cover)) return false;
      return true;
    })
    .sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  // LOT-5 (audit UX/UI du 2026-11-10, BOB-C22) : le RÉEL d'abord, les exemples
  // ensuite — même règle et même coupure que le fil (`filReelDabordActif`). Mesuré :
  // 20 bobines d'exemple sur 27, mêlées à celles des comptes, sans marque.
  if (typeof filReelDabordActif === "function" && filReelDabordActif()) {
    const reelles = eligibles.filter(function (p) { return !bobineExemple(p); });
    const exemples = eligibles.filter(bobineExemple);
    eligibles.length = 0;
    Array.prototype.push.apply(eligibles, reelles.concat(exemples));
  }

  const liste = eligibles.slice(0, 30);
  // `pinnedId` : la bobine visée par un lien partagé (#reel=<id>), ou choisie
  // dans l'onglet Bobines d'un profil. Elle est TOUJOURS épinglée en tête —
  // sans élargir la liste, et sans rien changer au cas normal (aucun appelant
  // ne passe `pinnedId` hors de ces deux parcours).
  //
  // ⚠️ L'épinglage ne valait AUTREFOIS que pour une bobine sortie des 30 plus
  // récentes. C'était insuffisant, et mesuré le 2026-09-01 : quand la cible est
  // DANS la liste mais pas en tête, `openReels` ouvre le viewer sur la bobine
  // n° 0 puis `openReelById` la corrige par un `scrollIntoView`, dont l'effet
  // n'est visible qu'au tour de rendu SUIVANT. Entre les deux, l'écran montre
  // la bobine de QUELQU'UN D'AUTRE — exactement le mensonge que le booléen de
  // `openReelById` existe pour éviter. Sonde : cible en position 5, lecture
  // immédiate à l'ouverture → `reelsState.current === 0`, correction ~2 s plus
  // tard. Sur un appareil chargé, cette fenêtre s'allonge d'autant.
  //
  // Épingler en tête supprime la fenêtre au lieu de la raccourcir : la cible
  // EST l'indice 0, `openReelById` n'a plus rien à corriger, et la personne
  // qui ouvre le lien voit ce qu'on lui a partagé, tout de suite.
  if (pinnedId) {
    const cible = eligibles.find(function(p) { return p.id === pinnedId; });
    if (cible) {
      return [cible].concat(
        liste.filter(function(p) { return p.id !== pinnedId; }).slice(0, 29));
    }
  }
  return liste;
}

// blob: URL mise en cache pour lire une vidéo locale encore en base64 (bobine
// fraîchement filmée, pas encore uploadée) : un <video src="data:…"> de
// plusieurs Mo ne se lit pas de façon fiable (cadre noir figé, surtout mobile) —
// même raison que l'aperçu de l'éditeur média (meSetMedia).
function _reelVideoSrc(post) {
  var v = post.video || "";
  window._reelBlobUrls = window._reelBlobUrls || {};
  if (v.indexOf("data:") !== 0) {
    // ⚠️ RÉVOCATION, ajoutée le 2026-08-30. C'était le SEUL `createObjectURL` du
    // dépôt sans `revokeObjectURL` en regard — les quatre autres (export
    // calendrier app-07, aperçu média et sondeur audio app-08, redimensionnement
    // app-09) révoquent tous. Une fois la bobine téléversée, `post.video` devient
    // une URL https et le Blob n'a plus AUCUN usage : il restait pourtant retenu,
    // avec sa vidéo pleine taille, jusqu'à la fin de la session. Filmer plusieurs
    // bobines d'affilée accumulait autant de vidéos en mémoire, sur un téléphone,
    // pour rien.
    // On révoque ICI et pas ailleurs : c'est le seul endroit qui sait que l'URL
    // objet est devenue inutile. Révoquer à la fermeture du lecteur casserait la
    // lecture d'une bobine dont le téléversement n'a pas encore abouti — le cas
    // même pour lequel ce cache existe.
    if (post.id && window._reelBlobUrls[post.id]) {
      try { URL.revokeObjectURL(window._reelBlobUrls[post.id]); } catch (e) {}
      delete window._reelBlobUrls[post.id];
    }
    // Une vidéo publiée via l'ancien relais `/media/*` (2026-09-11 → 2026-11-09) est
    // lue à sa source Supabase : le relais ne fait plus que renvoyer (301), et une
    // vidéo est le média où ce détour coûte le plus avant la première image.
    return (typeof urlMediaDirecte === "function") ? urlMediaDirecte(v) : v;
  }
  if (window._reelBlobUrls[post.id]) return window._reelBlobUrls[post.id];
  try {
    if (typeof _meDataUrlToBlob === "function") {
      var blob = _meDataUrlToBlob(v);
      if (blob) return (window._reelBlobUrls[post.id] = URL.createObjectURL(blob));
    }
  } catch (e) {}
  return v;
}

// LOT-14 (audit UX/UI du 2026-11-10, BOB-C17) : l'auteur porte aussi sa PHOTO
// (`photoUrl`, lue par `avatarBg` / `avatarInner`) quand elle est connue — le
// lecteur montrait l'emoji de Léa alors que le fil et son profil montrent sa photo.
function authorOfReel(post) {
  if (post._source === "me") {
    const prof = (state.user.profiles || []).find(p => p.id === post.profileId);
    return {
      name: prof ? prof.name : "Toi",
      emoji: prof ? prof.emoji : "🙂",
      color: prof ? prof.color : "#7c3aed",
      photoUrl: (state.user.general && state.user.general.avatarPhoto) || null,
    };
  }
  const su = (state.seed.users || []).find(u => u.id === post.userId);
  if (su) {
    return {
      name: su.name,
      emoji: su.profileEmoji || "🙂",
      color: su.avatar || "#7c3aed",
      photoUrl: (typeof _userPhoto === "function") ? _userPhoto(su) : null,
    };
  }
  const distant = (post.authorId && typeof userById === "function") ? userById(post.authorId) : null;
  if (distant && (typeof _userPhoto === "function") && _userPhoto(distant)) {
    return {
      name: post.authorName || distant.name || "Anonyme",
      emoji: post.authorEmoji || distant.profileEmoji || "🙂",
      color: post.authorColor || distant.avatar || "#7c3aed",
      photoUrl: _userPhoto(distant),
    };
  }
  // 🔧 FIX AUDIT 2026-06-10 : posts Supabase (vrais utilisateurs) — ils
  // portent authorName/authorEmoji/authorColor, pas un userId seed.
  // Avant : toutes les Bobines des vrais utilisateurs affichaient "Anonyme".
  return {
    name: post.authorName || "Anonyme",
    emoji: post.authorEmoji || "🙂",
    color: post.authorColor || "#7c3aed",
  };
}

function reelMediaHTML(post) {
  // ⚠️ Une bobine peut venir de N'IMPORTE QUEL compte : `video`, `poster` et
  // `fallback` sont des champs libres côté serveur. Trois contextes distincts,
  // trois helpers — se tromper ici, c'est exécuter le code d'un inconnu :
  //   src/poster → safeUrlAttr (politique d'URL + sortie d'attribut)
  //   fallback   → escapeJsArg : il atterrit DANS une chaîne JS simple-quotée à
  //                l'intérieur d'un attribut onerror ; le HTML décode avant que JS
  //                ne parse, donc escapeHtml seul ne protège pas.
  if (post.type === "video" && post.video) {
    const poster = post.poster ? ` poster="${safeUrlAttr(post.poster)}"` : "";
    // Sans fallback dédié : placeholder propre si l'appareil ne sait pas décoder
    // la vidéo (ex. ancienne bobine webm lue sur iPhone) au lieu d'un cadre noir.
    const fallback = post.fallback ? ` onerror="reelVideoFallback(this, '${escapeJsArg(post.fallback)}')"` : ` onerror="_reelVideoError(this)"`;
    return `<video class="reel-media" data-video-public-src="${safeUrlAttr(_reelVideoSrc(post))}"${poster}${fallback} muted playsinline loop preload="none"></video>`;
  }
  // Sinon : utilise la cover photo (existant pour les posts seed) ou la photo uploadée
  // LOT-10 (BOB-C02) : une bobine PHOTO créée (app-08) et relue du serveur porte
  // `image` — le lecteur ne lisait que photo / coverPhotoUrl / cover, et montrait un
  // dégradé violet à la place de la photo publiée.
  const src = post.image || post.photo || post.coverPhotoUrl || resolveCoverUrl(post.cover) || "";
  if (!src) {
    return `<div class="reel-media" style="background: linear-gradient(135deg, ${COLORS_PASSION_BG[post.passion] || "#4c1d95"}, #7c3aed);"></div>`;
  }
  const vignette = (typeof passioThumb === 'function') ? passioThumb(src, 720) : src;
  return `<img class="reel-media" src="${safeUrlAttr(vignette)}" alt="" loading="lazy" onerror="this.onerror=null;this.style.visibility='hidden';"/>`;
}

function resolveCoverUrl(cover) {
  if (!cover) return null;
  if (typeof COVER_PHOTOS !== "undefined" && COVER_PHOTOS[cover]) {
    return imageDemo(COVER_PHOTOS[cover], "portrait");
  }
  return null;
}

const COLORS_PASSION_BG = {
  musique: "#7c3aed", photo: "#4c1d95", voyage: "#0891b2",
  cuisine: "#dc2626", litterature: "#1e40af", sport: "#16a34a",
  cinema: "#9333ea", nature: "#15803d", actu: "#0f172a",
};

// Une bobine d'EXEMPLE vient du socle de démonstration (`state.seed.posts`) et
// d'aucune source réelle. Les bobines du socle portent `_source: "seed_reel"`, le
// fil pose `"seed"` : toute source qui commence par « seed » est un exemple.
function bobineExemple(post) {
  if (!post) return false;
  if (post._source) return String(post._source).indexOf("seed") === 0;
  const id = post.id;
  const dans = function (t) { return (t || []).some(function (p) { return p && (p === post || p.id === id); }); };
  return dans(state.seed.posts) && !dans(state.supabasePosts) && !dans(state.userPosts);
}

function renderReelHTML(post, idx) {
  const author = authorOfReel(post);
  const passion = passionById(post.passion) || { label: post.passion, emoji: "✨" };
  const moodLabel = moodShortLabel(post.mood);
  // Source de vérité = l'état persisté des likes (partagé avec le fil), pas le Set
  // volatil du viewer : un post aimé dans le fil doit apparaître aimé en Bobines.
  const isLiked = ((state.user.likedPosts || []).indexOf(post.id) > -1) || reelsState.liked.has(post.id);
  const txt = post.text || post.caption || "";
  return `
    <div class="reel-item" data-reel-idx="${idx}" data-post-id="${escapeHtml(post.id)}">
      <div class="reel-media-container"${post.type === "video" ? ' onclick="basculerLectureBobine(this, event)"' : ""}>
        ${reelMediaHTML(post)}
        ${(Array.isArray(post.overlays) && post.overlays.length && typeof _storyOverlaysHtml === "function") ? `<div class="reel-overlays-layer">${_storyOverlaysHtml(post.overlays)}</div>` : ""}
      </div>
      <div class="reel-overlay"></div>
      ${post.type === "video" ? boutonVideoPubliqueHTML() : ""}
      ${/* LOT-14 (BOB-C14) : l'étiquette du haut répétait la passion et chevauchait la flèche ; l'envie rejoint la ligne de passion, sous le nom. */ ""}
      ${post.type === "video" ? `<button class="reel-sound-btn" onclick="toggleReelsSound(event)" aria-label="Activer ou couper le son">${reelsState.soundOn ? "🔊" : "🔇"}</button>` : ""}
      <div class="reel-info">
        <div class="reel-author" onclick="_openReelAuthor('${escapeJsArg(post.authorId || post.userId || '')}'); return false;" style="cursor:pointer;">
          <div class="reel-avatar" style="background:${avatarBg(author)};">${avatarInner(author)}</div>
          <div class="reel-author-meta">
            <div class="reel-author-name">${escapeHtml(author.name)}</div>
            <div class="reel-passion">${passion.emoji} ${escapeHtml(passion.label)}${moodLabel ? " · " + escapeHtml(moodLabel) : ""}${(bobineExemple(post) && window.PassioFirstRun && typeof PassioFirstRun.etiquetteDemo === "function") ? ' <span class="reel-exemple">' + PassioFirstRun.etiquetteDemo({ _source: "seed" }) + '</span>' : ""}</div>
          </div>
        </div>
        <div class="reel-caption">${escapeHtml(txt).slice(0, 220)}${txt.length > 220 ? "…" : ""}</div>
      </div>
      <div class="reel-actions">
        <button class="reel-action-btn ${isLiked ? "liked" : ""}" data-reellike="${escapeHtml(post.id)}" onclick="toggleReelLike('${escapeJsArg(post.id)}', this)" aria-label="Aimer">
          <span class="reel-action-icon">
            <svg viewBox="0 0 24 24"><path d="M12 21 C5.5 16 2 12.5 2 8.5 C2 5.5 4.5 3 7.5 3 C9.5 3 11 4 12 5.5 C13 4 14.5 3 16.5 3 C19.5 3 22 5.5 22 8.5 C22 12.5 18.5 16 12 21 Z"/></svg>
          </span>
          <span class="reel-action-label">${post.likes || 0}</span>
        </button>
        <button class="reel-action-btn" onclick="openReelComments('${escapeJsArg(post.id)}')" aria-label="Commenter">
          <span class="reel-action-icon">
            <svg viewBox="0 0 24 24"><path d="M21 12 C21 16 16.5 19 12 19 C10.8 19 9.7 18.85 8.7 18.55 L4 20 L5.5 16 C4 14.85 3 13.5 3 12 C3 8 7.5 5 12 5 C16.5 5 21 8 21 12 Z"/></svg>
          </span>
          <span class="reel-action-label">${(typeof nbCommentairesPost === "function") ? nbCommentairesPost(post) : ((post.comments || []).length)}</span>
        </button>
        <button class="reel-action-btn" onclick="shareReel('${escapeJsArg(post.id)}')" aria-label="Partager">
          <span class="reel-action-icon">
            <svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 11 L16 7"/><path d="M8 13 L16 17"/></svg>
          </span>
          <span class="reel-action-label">Partager</span>
        </button>
        <button class="reel-action-btn reel-plus-btn" onclick="openReelMenu('${escapeJsArg(post.id)}')" aria-label="Plus d'actions sur cette bobine">
          <span class="reel-action-icon">
            <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
          </span>
          <span class="reel-action-label">Plus</span>
        </button>
      </div>
    </div>`;
}

// LOT-6 (audit UX/UI du 2026-11-10, BOB-C04) — « PLUS » SUR UNE BOBINE.
// Le format le plus viral n'avait ni « Signaler » (la story l'a), ni « Supprimer »
// pour son auteur. La feuille passe au-dessus du lecteur (z-index 9999) ;
// supprimer FERME d'abord le lecteur, puis passe par la suppression existante
// (`confirmDeletePost` → `deletePost`, pierre tombale, quatre tableaux).
function openReelMenu(postId) {
  var p = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  if (!p) p = (reelsState.items || []).find(function (x) { return x && x.id === postId; }) || null;
  if (!p) return;
  var mien = (typeof _estMonPost === "function") && _estMonPost(p);
  var actions = mien
    ? [{ id: "supprimer", libelle: "Supprimer cette bobine", danger: true, agir: function () { window._bobineRetourProfil = null; try { closeReels(); } catch (e) {} confirmDeletePost(postId); } }]
    : [{ id: "signaler", libelle: "Signaler cette bobine", danger: true, agir: function () { reportPost(postId); } }];
  ouvrirFeuilleConfirmation({ titre: mien ? "Ta bobine" : "Cette bobine", actions: actions });
}

function openReels(pinnedId) {
  // Ajouter à l'historique pour que le bouton back fonctionne. L'entrée est
  // marquée comme nôtre et sera REPRISE par closeReels() si l'utilisateur ferme
  // au doigt plutôt qu'avec le retour (sinon elle reste morte sur la pile).
  pushOverlayHistory("reels", "#reels");

  // `pinnedId` n'est passé que par openReelById : il garantit que la bobine
  // demandée EST dans la liste, même si elle est sortie des 30 plus récentes.
  const items = buildReels(pinnedId);
  if (!items.length) {
    const v = document.getElementById("reelsViewer");
    v.classList.add("open");
    v.setAttribute("aria-hidden", "false");
    document.getElementById("reelsList").innerHTML = `
      <div class="reels-empty">
        <div class="reels-empty-emoji">🎬</div>
        <div class="reels-empty-title">Pas encore de bobines</div>
        <div class="reels-empty-text">Filme un moment de ta passion.</div>
        <button class="btn primary" style="margin-top:14px;" onclick="startBobineCreation()">Créer une bobine</button>
      </div>`;
    lockBodyScroll("reels");
    reelsState.open = true;
    return;
  }
  reelsState.items = items;
  reelsState.current = 0;
  reelsState.viewedSinceOpen = 0;
  reelsState.pausePrompted = false;

  const list = document.getElementById("reelsList");
  // LOT-5 (BOB-C22) : une fin de liste qui le dit, au lieu d'une flèche grise.
  list.innerHTML = items.map((p, i) => renderReelHTML(p, i)).join("") + `
    <div class="reels-fin" role="status">
      <div class="reels-fin-emoji">🎬</div>
      <div class="reels-fin-titre">Tu as tout vu</div>
      <div class="reels-fin-texte">Reviens plus tard, ou crée la tienne.</div>
      <button class="btn primary" onclick="startBobineCreation()">Créer une bobine</button>
    </div>`;

  const v = document.getElementById("reelsViewer");
  v.classList.add("open");
  v.setAttribute("aria-hidden", "false");
  lockBodyScroll("reels");
  document.body.classList.add("reels-open");
  reelsState.open = true;
  updateReelsCounter();

  // Lance la lecture du premier item visible et observe les changements de visibilité
  setupReelsObserver();
  // Auto-focus sur le premier reel
  list.scrollTop = 0;
  playReelAt(0);
  updateReelsNavState(0);

  // Relance l'animation de l'indice à chaque ouverture
  const hint = document.getElementById("reelsHint");
  if (hint) {
    hint.style.animation = "none";
    void hint.offsetWidth; // reflow pour redémarrer l'anim
    hint.style.animation = "";
  }

}

// Ouvre le viewer Bobines directement sur une bobine précise (depuis l'onglet
// Bobines du profil). Retombe sur la 1ʳᵉ si l'id n'est pas trouvé.
// Renvoie true si c'est BIEN la bobine demandée qui est à l'écran, false si elle
// est introuvable — auquel cas le viewer reste sur la première, comme avant. Le
// booléen existe pour le lien partagé (#reel=<id>), qui doit pouvoir dire
// « introuvable » plutôt que de montrer une autre bobine sans prévenir.
function openReelById(id) {
  openReels(id);
  try {
    var idx = (reelsState.items || []).findIndex(function(p){ return p.id === id; });
    // ⚠️ openReels() a DÉJÀ ouvert le viewer sur la bobine n° 0 : rendre false
    // sans le refermer laissait à l'écran le contenu de QUELQU'UN D'AUTRE, avec
    // par-dessus un toast « introuvable » — exactement le mensonge que ce
    // booléen existe pour éviter. Cas réel : une bobine dont l'auteur est
    // bloqué passe les conditions isReel + média mais est écartée par
    // buildReels, donc absente de la liste.
    if (idx < 0) { try { closeReels(); } catch (e) {} return false; }
    if (idx > 0) {
      var items = document.querySelectorAll("#reelsList .reel-item");
      if (items[idx]) {
        items[idx].scrollIntoView();
        reelsState.current = idx;
        if (typeof playReelAt === "function") playReelAt(idx);
        if (typeof updateReelsNavState === "function") updateReelsNavState(idx);
        if (typeof updateReelsCounter === "function") updateReelsCounter();
      }
    }
    return true;
  } catch (e) {
    // Le retour de cette fonction pilote désormais un message à l'utilisateur :
    // un catch MUET ferait passer une erreur interne (playReelAt, compteur…)
    // pour une bobine « introuvable ». On le dit au moins à la console.
    try { console.warn("[reel] openReelById:", e); } catch (e2) {}
  }
  return false;
}

function closeReels() {
  const etaitOuvert = !!(reelsState && reelsState.open);
  // ⚠️ Gardes systématiques : cette fonction est appelée par le gestionnaire de
  // `popstate`. Une exception ici (nœud absent) rendait le bouton retour inerte
  // pour toute la suite de la session, ET laissait le verrou de défilement posé
  // — c'est-à-dire un écran qui ne défile plus, sans la moindre erreur visible.
  const v = document.getElementById("reelsViewer");
  if (v) { v.classList.remove("open"); v.setAttribute("aria-hidden", "true"); }
  unlockBodyScroll("reels");
  document.body.classList.remove("reels-open");
  if (reelsState) reelsState.open = false;
  const pause = document.getElementById("reelsPause");
  if (pause) pause.classList.remove("show");
  // Pause toutes les vidéos
  document.querySelectorAll("#reelsList video").forEach(arreterVideoPublique);
  if (reelsState && reelsState.observer) { try { reelsState.observer.disconnect(); } catch(e){} reelsState.observer = null; }
  // LOT-14 (BOB-C12) : le panneau de commentaires part avec le lecteur.
  const panneauCmt = document.getElementById("reelCommentsPanel");
  if (panneauCmt && panneauCmt.classList.contains("open")) {
    panneauCmt.classList.remove("open");
    if (v) v.classList.remove("comments-open");
    window.currentReelCommentPostId = null;
  }
  if (etaitOuvert) releaseOverlayHistory();
  // LOT-14 (BOB-C10) : retour au profil visité d'où la bobine a été ouverte.
  const retour = window._bobineRetourProfil;
  window._bobineRetourProfil = null;
  if (etaitOuvert && retour && typeof openUserProfile === "function") {
    setTimeout(function () { try { openUserProfile(retour); } catch (e) {} }, 0);
  }
}

function resumeReels() {
  document.getElementById("reelsPause").classList.remove("show");
}

// Ouvre l'éditeur média en mode bobine (vidéo/photo + overlays façon Instagram).
function startBobineCreation() {
  try { closeReels(); } catch(e) {}
  if (typeof meOpen === "function") meOpen("bobine");
}

// Ouvre le profil de l'auteur d'une bobine : ferme d'abord l'overlay reels
// (sinon le profil s'ouvre sous l'overlay et reste invisible), puis openUserProfile.
function _openReelAuthor(uid) {
  if (!uid) { toast("Profil indisponible"); return; }
  try { closeReels(); } catch (e) {}
  setTimeout(function () { try { openUserProfile(uid, "reel"); } catch (e) { console.warn("_openReelAuthor:", e); } }, 80);
}

function updateReelsCounter() {
  const el = document.getElementById("reelsCounter");
  if (!el) return;
  const total = reelsState.items.length;
  const cur = Math.min(reelsState.current + 1, total);
  el.textContent = `${cur} / ${total}`;
}

// LOT-14 (audit UX/UI du 2026-11-10, BOB-C06) : toucher la vidéo la met en
// pause, la toucher encore la relance ; en pause, le bouton « ▶ Lire » se
// montre — c'est le repère, et la porte de reprise.
function basculerLectureBobine(conteneur, ev) {
  const vid = conteneur && conteneur.querySelector("video");
  if (!vid) return;
  if (ev) ev.stopPropagation();
  if (vid.paused) {
    lancerVideoPublique(vid, true);
  } else {
    try { vid.pause(); } catch (e) {}
    videoPubliqueBouton(vid, true);
  }
}

function playReelAt(idx) {
  const items = document.querySelectorAll("#reelsList .reel-item");
  const soundOn = !!reelsState.soundOn;
  items.forEach((it, i) => {
    const vid = it.querySelector("video");
    if (!vid) return;
    // muted en PROPRIÉTÉ : l'attribut posé par innerHTML n'est pas toujours
    // répercuté → la vidéo est traitée comme sonore et play() est refusé
    // (bobine figée/noire, surtout mobile). Même correctif que meSetMedia.
    // Le SON suit le choix global (bouton 🔊 par bobine, mémorisé pour la session).
    vid.muted = !soundOn; vid.defaultMuted = !soundOn;
    if (i === idx) {
      lancerVideoPublique(vid, false);
    }
    else arreterVideoPublique(vid);
  });
}

// Son des bobines : UN état pour tout le viewer (comme Instagram) — activer le
// son sur une bobine l'active pour les suivantes, mémorisé pour la session.
function toggleReelsSound(ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  reelsState.soundOn = !reelsState.soundOn;
  _syncReelSoundBtns();
  const items = document.querySelectorAll("#reelsList .reel-item");
  const cur = items[reelsState.current];
  const vid = cur && cur.querySelector("video");
  if (vid) {
    vid.muted = !reelsState.soundOn; vid.defaultMuted = vid.muted;
    if (vid.paused) lancerVideoPublique(vid, true);
  }
}
function _syncReelSoundBtns() {
  document.querySelectorAll("#reelsList .reel-sound-btn").forEach((b) => {
    b.textContent = reelsState.soundOn ? "🔊" : "🔇";
  });
}

function setupReelsObserver() {
  if (reelsState.observer) { try { reelsState.observer.disconnect(); } catch(e){} }
  const list = document.getElementById("reelsList");
  reelsState.observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        const idx = Number(entry.target.getAttribute("data-reel-idx") || 0);
        if (idx !== reelsState.current) {
          reelsState.current = idx;
          reelsState.viewedSinceOpen += 1;
          updateReelsCounter();
          updateReelsNavState(idx);
          playReelAt(idx);
          maybePromptPause();
        }
      }
    });
  }, { root: list, threshold: [0.6] });
  document.querySelectorAll("#reelsList .reel-item").forEach(el => reelsState.observer.observe(el));
}

function maybePromptPause() {
  if (reelsState.pausePrompted) return;
  if (reelsState.viewedSinceOpen >= REELS_PAUSE_AT) {
    reelsState.pausePrompted = true;
    document.getElementById("reelsPause").classList.add("show");
    // Met aussi en pause la vidéo en cours pour respecter le moment
    document.querySelectorAll("#reelsList video").forEach(vid => { try { vid.pause(); } catch(e){} });
  }
}

// Like d'une bobine — DÉLÈGUE au like canonique des posts (`likePost`) : une
// bobine EST un post (is_reel). Avant, cette fonction ne faisait que basculer une
// classe CSS et un Set en mémoire : aucun compteur, rien de persisté (perdu au
// rechargement), rien envoyé à Supabase, et l'auteur n'était jamais notifié — le
// même contenu apparaissait « aimé » dans les Bobines et « non aimé » dans le fil.
function toggleReelLike(postId, btn) {
  // Mode invité (première visite) : cette action engage le compte. Le gate
  // EXPLIQUE l'action puis propose la création de compte ; il ne rejoue jamais
  // l'action après coup. Rend `true` — donc inerte — hors mode invité.
  if (window.requireAuthentication && !requireAuthentication("aimer")) return;
  if (typeof likePost === "function") likePost(postId, true, null);
  var post = (typeof findPostAnywhere === "function") ? findPostAnywhere(postId) : null;
  var liked = (state.user.likedPosts || []).indexOf(postId) > -1;
  // reelsState.liked reste alimenté : d'autres écrans du viewer le consultent.
  if (liked) reelsState.liked.add(postId); else reelsState.liked.delete(postId);
  document.querySelectorAll('[data-reellike="' + postId + '"]').forEach(function (el) {
    el.classList.toggle("liked", liked);
    var lab = el.querySelector(".reel-action-label");
    if (lab) lab.textContent = (post && post.likes) || 0;
  });
  if (liked && typeof _likePop === "function") _likePop(btn);
}

function openReelComments(postId) {
  // Afficher le panel de commentaires en bas style Instagram
  const panel = document.getElementById("reelCommentsPanel");
  const reelsViewer = document.getElementById("reelsViewer");

  if (panel && reelsViewer) {
    // Ajouter la classe pour réduire la vidéo
    reelsViewer.classList.add("comments-open");
    // LOT-14 (BOB-C12) : une entrée d'historique — le retour ferme le panneau, pas la bobine.
    if (!panel.classList.contains("open")) { try { pushOverlayHistory("commentaires-bobine"); } catch (e) {} }
    panel.classList.add("open");

    // Stocker le postId courant
    window.currentReelCommentPostId = postId;
    // Charger les commentaires : d'abord ce qu'on a (aperçus, locaux), puis la
    // première page serveur — le fil ne porte plus que DEUX aperçus (2026-09-21).
    loadReelComments(postId);
    _chargerDiscussionBobine(postId);
    // Le sujet privé de cette discussion (`fil:<id>`, app-08) : le panneau des
    // Bobines est une discussion à l'écran comme la modale (2026-11-09).
    try { if (typeof _filsRtReconcilier === "function") _filsRtReconcilier(); } catch (e) {}

    // Focus sur l'input
    setTimeout(() => {
      const input = document.getElementById("reelCommentInput");
      if (input) {
        input.focus();
        input.click();
      }
      // Scroller vers le haut des commentaires
      const list = document.getElementById("reelCommentsList");
      if (list) list.scrollTop = 0;
    }, 350);
  }
}

function closeReelComments() {
  const panel = document.getElementById("reelCommentsPanel");
  const reelsViewer = document.getElementById("reelsViewer");

  if (panel) {
    const etaitOuvert = panel.classList.contains("open");
    // Le champ ne garde pas le focus d'un panneau fermé : Échap suivant doit
    // atteindre le lecteur, pas un champ invisible.
    try { if (panel.contains(document.activeElement)) document.activeElement.blur(); } catch (e) {}
    panel.classList.remove("open");
    if (etaitOuvert) { try { releaseOverlayHistory(); } catch (e) {} }
    if (reelsViewer) {
      reelsViewer.classList.remove("comments-open");
    }
    window.currentReelCommentPostId = null;
    try { if (typeof _filsRtReconcilier === "function") _filsRtReconcilier(); } catch (e) {}
  }
}

// Page serveur de la discussion d'une bobine, même autorité que la modale du
// fil (`supaLoadComments` + `_fusionnerPageCommentaires`, cache 20 s partagé).
async function _chargerDiscussionBobine(postId) {
  if (typeof supa === "undefined" || !supa || !window._supaReal || typeof MY_UID === "undefined" || !MY_UID) return;
  if (typeof supaLoadComments !== "function" || typeof _fusionnerPageCommentaires !== "function") return;
  window._cmtThreadLoadedAt = window._cmtThreadLoadedAt || {};
  if (Date.now() - (window._cmtThreadLoadedAt[postId] || 0) < 20000) return; // déjà frais
  const reel = findPostAnywhere(postId);
  if (!reel) return;
  try {
    const page = await supaLoadComments(postId);
    if (!page || window.currentReelCommentPostId !== postId) return;
    _fusionnerPageCommentaires(findPostAnywhere(postId) || reel, page);
    // Les index d'une réponse en cours ne survivent pas à un re-tri.
    window.replyingToCommentIdx = null;
    // Sans l'épingle (RV-38) : ce panneau ne l'affiche pas. La page détail d'une
    // bobine, elle, la lit (`_loadPostDetailComments`).
    if (typeof hydrateCommentInteractions === "function") { try { await hydrateCommentInteractions(reel, { epingle: false }); } catch (e) {} }
    window._cmtThreadLoadedAt[postId] = Date.now();
    if (window.currentReelCommentPostId === postId) loadReelComments(postId);
  } catch (e) { try { diagLog("bobine_commentaires", e && e.message); } catch (_e) {} }
}

function loadReelComments(postId) {
  // Chercher dans state.seed.posts ou state.userPosts
  const reel = findPostAnywhere(postId);
  if (!reel) return;

  const commentsList = document.getElementById("reelCommentsList");
  if (!commentsList) return;

  const comments = reel.comments || [];

  if (comments.length === 0) {
    commentsList.innerHTML = `
      <div class="reel-comments-empty">
        <div style="font-size:32px;margin-bottom:8px;">💬</div>
        <div>Aucun commentaire pour le moment</div>
        <div style="font-size:12px;opacity:0.7;margin-top:4px;">Sois le premier à commenter!</div>
      </div>
    `;
    return;
  }

  commentsList.innerHTML = comments.map((c, idx) => {
    const commenter = userById(c.authorId) || { name: c.authorName || "Anonyme", profileEmoji: "✨", avatar: "#8b5cf6" };
    // ⚠️ Les commentaires sont créés avec `createdAt` (ici comme dans app-04 et
    // dans la relecture Supabase) et JAMAIS avec `timestamp` : ce test lisait un
    // champ qui n'existe nulle part, donc TOUS les commentaires — y compris ceux
    // d'il y a six mois — s'affichaient « Maintenant ».
    const _ts = c.createdAt || c.timestamp || c.at;
    const timeStr = _ts ? fmtTime(_ts) : "Maintenant";
    const likesCount = c.likes || 0;
    const isLiked = (c.likedBy || []).includes(state.user?.id || "me");
    // Ce panneau liste les réactions emoji d'un commentaire et les COMPTE dans
    // « N réponses » : celle d'un compte BLOQUÉ n'y entre pas, même règle que la
    // pastille du fil (`_reponsesComptees`, app-04). Les réponses texte et les
    // GIF sont des réponses, pas des réactions : ce filtre n'y touche pas.
    const replies = (typeof _reponsesComptees === "function") ? _reponsesComptees(c.replies) : (c.replies || []);

    let commentHTML = `
      <div class="reel-comment-item">
        <div class="reel-comment-avatar" style="background:${avatarBg(commenter)};" onclick="openUserProfile('${escapeJsArg(c.authorId)}')" title="${escapeHtml(commenter.name)}">${avatarInner(commenter)}</div>
        <div class="reel-comment-body">
          <div class="reel-comment-header">
            <span class="reel-comment-name" onclick="openUserProfile('${escapeJsArg(c.authorId)}')">${escapeHtml(commenter.name)}</span>
            <span class="reel-comment-badge">${timeStr}</span>
          </div>
          <div class="reel-comment-text">${escapeHtml(c.text || c.content || "")}</div>
          <div class="reel-comment-footer">
            <button type="button" class="reel-comment-like ${isLiked ? 'liked' : ''}" aria-pressed="${isLiked ? 'true' : 'false'}" aria-label="J'aime ce commentaire — ${likesCount}" onclick="likeReelComment('${escapeJsArg(postId)}', ${idx})">${isLiked ? '❤️' : '🤍'} ${likesCount}</button>
            <button type="button" class="reel-comment-reply" aria-label="Répondre à ${escapeHtml(commenter.name)}" onclick="replyToReelCommentBox('${escapeJsArg(postId)}', ${idx}, '${escapeJsArg(commenter.name)}')">💬 Répondre</button>
            ${replies.length > 0 ? `<span class="reel-comment-reply-count" onclick="toggleReelCommentReplies(${idx})">${replies.length} réponse${replies.length > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
      </div>
    `;

    // Afficher les réponses si elles existent
    if (replies.length > 0) {
      commentHTML += `
        <div class="reel-comment-replies" id="reel-replies-${idx}">
      `;
      replies.forEach(r => {
        const replyAuthor = userById(r.authorId) || { name: r.authorName || "?", profileEmoji: "👤", avatar: "#64748b" };
        if (r.type === "emoji_reaction") {
          commentHTML += `
            <div class="reel-reply-item">
              <span class="reel-reply-author" onclick="openUserProfile('${escapeJsArg(r.authorId)}')">${escapeHtml(replyAuthor.name)}</span>
              <span style="font-size:18px;margin-left:6px;letter-spacing:1px;">${escapeHtml(r.text || "")}</span>
            </div>
          `;
        } else if (r.type === "gif_reaction") {
          commentHTML += `
            <div class="reel-reply-item">
              <span class="reel-reply-author" onclick="openUserProfile('${escapeJsArg(r.authorId)}')">${escapeHtml(replyAuthor.name)}</span>
              <img loading="lazy" decoding="async" src="${safeUrlAttr(r.text || "")}" style="width:100%;max-width:150px;height:auto;border-radius:6px;margin-top:6px;object-fit:cover;" alt="GIF" />
            </div>
          `;
        } else {
          commentHTML += `
            <div class="reel-reply-item">
              <span class="reel-reply-author" onclick="openUserProfile('${escapeJsArg(r.authorId)}')">${escapeHtml(replyAuthor.name)}</span>
              <div class="reel-reply-text">${escapeHtml(r.text)}</div>
            </div>
          `;
        }
      });
      commentHTML += `</div>`;
    }

    return commentHTML;
  }).join("")
  // Page suivante en base (pagination serveur du 2026-09-21) : même bouton que
  // la modale du fil, même chargeur.
  + ((typeof _commentairesSuiteHtml === "function") ? _commentairesSuiteHtml(postId) : "");
}

function autoResizeReelCommentInput() {
  const input = document.getElementById("reelCommentInput");
  if (!input) return;
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 100) + "px";
}

// ⚠️ Un commentaire posté depuis le LECTEUR DE BOBINES n'était écrit QUE dans
// l'état local : ni `post_comments`, ni `comment_interactions`. L'auteur de la
// bobine ne le voyait jamais, et il disparaissait du propre appareil de son
// auteur au premier rechargement qui rejoue les posts du serveur. Le même texte
// posté depuis la discussion du Fil (`submitComment`, app-04) partait, lui.
//
// On ne duplique AUCUN moteur : on passe par la file d'attente commune
// (`_enqueueCommentSync`, app-04), qui gère le réessai hors-ligne et l'état
// « Envoi… / Non envoyé » du commentaire, avec repli direct si elle est absente.
function _envoyerCommentaireBobine(postId, op) {
  if (typeof supa === "undefined" || !supa) return;
  if (typeof MY_UID === "undefined" || !MY_UID) return;
  // Prévenir l'auteur, comme le fait le chemin du Fil — à la CONFIRMATION de
  // l'écriture (SRV-02 : la base exige le commentaire réel) ; la file pose la
  // notification au succès.
  let notif = null;
  try {
    const cible = typeof findPostAnywhere === "function" ? findPostAnywhere(postId) : null;
    if (cible && cible.authorId && cible.authorId !== MY_UID && cible.fromSupabase) {
      notif = { to: cible.authorId, kind: "comment", text: "a commenté ta bobine" };
    }
    // ASTRA-24 : les mentions partent depuis `supaAddComment`, une fois le commentaire en base.
  } catch (e) {}
  let ecriture = null;
  if (typeof _enqueueCommentSync === "function") {
    _enqueueCommentSync(Object.assign({ threadId: postId }, op, { notif: notif }));
  } else if (op.type === "post_comment" && typeof supaAddComment === "function") {
    ecriture = supaAddComment(postId, op.text, op.commentId);
  } else if (op.type === "reply" && typeof supaCommentInteract === "function") {
    ecriture = supaCommentInteract(op.parentId, postId, "reply", op.text);
  }
  if (ecriture && notif && typeof notifierApresEcriture === "function") notifierApresEcriture(ecriture, notif.to, notif.kind, postId, notif.text);
}

function submitReelComment() {
  // Mode invité (première visite) : cette action engage le compte. Le gate
  // EXPLIQUE l'action puis propose la création de compte ; il ne rejoue jamais
  // l'action après coup. Rend `true` — donc inerte — hors mode invité.
  if (window.requireAuthentication && !requireAuthentication("commenter")) return;
  const input = document.getElementById("reelCommentInput");
  if (!input || !window.currentReelCommentPostId) return;

  const text = input.value.trim();
  if (!text) {
    toast("Écris quelque chose d'abord! 💭");
    return;
  }

  const postId = window.currentReelCommentPostId;
  const reel = findPostAnywhere(postId);
  if (!reel) return;

  if (!reel.comments) reel.comments = [];

  const newReply = {
    id: "reply_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    authorId: typeof MY_UID !== "undefined" ? MY_UID : "me",
    authorName: currentProfile()?.name || "Moi",
    text: text,
    type: "text",
    createdAt: Date.now()
  };

  // Si on répond à un commentaire spécifique
  if (window.replyingToCommentIdx !== undefined && window.replyingToCommentIdx !== null) {
    const commentIdx = window.replyingToCommentIdx;
    if (reel.comments[commentIdx]) {
      if (!reel.comments[commentIdx].replies) {
        reel.comments[commentIdx].replies = [];
      }
      reel.comments[commentIdx].replies.push(newReply);
      // ⚠️ `comment_interactions.comment_id` doit désigner un commentaire réel :
      // un ancien commentaire local sans `id` produirait une ligne orpheline,
      // rejetée en silence. Sans identifiant de parent, on n'envoie rien —
      // la réponse reste locale, comme avant, plutôt que fausse en base.
      if (reel.comments[commentIdx].id) {
        _envoyerCommentaireBobine(postId, {
          type: "reply",
          parentId: reel.comments[commentIdx].id,
          nodeId: newReply.id,
          text: text,
        });
      }
      toast("Réponse postée", "success");
    }
  } else {
    // Sinon, créer un nouveau commentaire
    const newComment = {
      id: "comment_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
      authorId: newReply.authorId,
      authorName: newReply.authorName,
      text: text,
      createdAt: Date.now(),
      likes: 0,
      likedBy: [],
      replies: []
    };
    // En TÊTE, comme `submitComment` (app-04) : la liste vit récent → ancien
    // (chargeurs paginés), et les gestionnaires du panneau adressent par INDEX.
    reel.comments.unshift(newComment);
    _envoyerCommentaireBobine(postId, {
      type: "post_comment",
      commentId: newComment.id,
      nodeId: newComment.id,
      text: text,
    });
    toast("Commentaire posté", "success");
  }

  saveState();

  input.value = "";
  input.style.height = "auto";
  window.replyingToCommentIdx = null;
  window.replyingToPostId = null;
  loadReelComments(postId);
}

function likeReelComment(postId, commentIdx) {
  // Mode invité (première visite) : cette action engage le compte. Le gate
  // EXPLIQUE l'action puis propose la création de compte ; il ne rejoue jamais
  // l'action après coup. Rend `true` — donc inerte — hors mode invité.
  if (window.requireAuthentication && !requireAuthentication("aimer")) return;
  const reel = findPostAnywhere(postId);
  if (!reel || !reel.comments || !reel.comments[commentIdx]) return;

  const comment = reel.comments[commentIdx];
  // MY_UID en priorité (comme likeComment/likeCommentNode) : avec state.user.id
  // ou "me", le même compte était vu comme DEUX personnes différentes selon la
  // surface → un like posé ici restait « non aimé » ailleurs, et re-liker depuis
  // le fil ajoutait une seconde entrée (compteur doublé).
  const userId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : (state.user?.id || "me");

  if (!comment.likedBy) comment.likedBy = [];
  if (!comment.likes) comment.likes = 0;

  const idx = comment.likedBy.indexOf(userId);
  if (idx > -1) {
    comment.likedBy.splice(idx, 1);
    comment.likes = Math.max(0, comment.likes - 1);
    if (typeof supaCommentRemoveLike === "function") supaCommentRemoveLike(comment.id);
  } else {
    comment.likedBy.push(userId);
    comment.likes++;
    // Sync cross-compte : sans elle, le like restait dans ce seul navigateur.
    const ecrit = (typeof supaCommentInteract === "function") ? supaCommentInteract(comment.id, postId, "like", "") : false;
    // Au verdict de l'écriture (SRV-02 : la base exige le j'aime réel).
    if (comment.authorId && comment.authorId !== userId && comment.fromSupabase && typeof notifierApresEcriture === "function") {
      notifierApresEcriture(ecrit, comment.authorId, "like", postId, "a aimé ton commentaire");
    }
  }

  saveState();
  loadReelComments(postId);
}

function replyToReelCommentBox(postId, commentIdx, authorName) {
  // Tracker quel commentaire on répond
  window.replyingToCommentIdx = commentIdx;
  window.replyingToPostId = postId;

  const input = document.getElementById("reelCommentInput");
  if (input) {
    input.value = `@${authorName} `;
    input.focus();
    autoResizeReelCommentInput();
  }
}

function toggleReelCommentReplies(commentIdx) {
  const repliesDiv = document.getElementById(`reel-replies-${commentIdx}`);
  if (repliesDiv) {
    repliesDiv.style.display = repliesDiv.style.display === "none" ? "block" : "none";
  }
}

// LOT-14 (audit UX/UI du 2026-11-10, BOB-C18) — RETIRÉ : la rangée de réactions
// de bobine (masquée, `reactToReel`) et la réaction « 😊 » / GIF à un commentaire
// de bobine (`showQuickEmojiForReelComment`, sélecteurs emoji et GIF,
// `addEmojiReactionToReelComment`, `addGifReactionToReelComment`). Elles
// n'écrivaient que dans l'état local : une réaction que personne d'autre ne
// voyait jamais, et qui disparaissait au rechargement. J'aime et Répondre restent.

function shareReel(postId) {
  openReelShareModal(postId);
}

function openReelShareModal(postId) {
  const reel = findPostAnywhere(postId);
  if (!reel) return;
  // LOT-12 (PAR-C08) : le lien d'une bobine porte `?inv=` comme les trois autres
  // portes (l'invité est accueilli par le nom de qui l'envoie). Il reste un lien
  // `#reel=` : c'est lui que le routeur sait ouvrir dans le lecteur. L'aperçu
  // riche (chemin court) reste à faire côté serveur — hors de ce lot.
  const inv = (typeof _invitationParametre === "function") ? _invitationParametre() : "";
  const rawUrl = location.origin + location.pathname + inv + "#reel=" + encodeURIComponent(postId);
  // Même comptage que les trois autres portes : le lien est créé ET compté partagé.
  const url = (window.tel && tel.shareLink) ? tel.shareLink(rawUrl, "reel", postId, navigator.share ? "native" : "clipboard") : rawUrl;
  const author = authorOfReel(reel);
  const txt = String(reel.text || reel.caption || "");
  const extrait = txt.length > 60 ? txt.slice(0, 60) + "…" : txt;
  ouvrirFeuillePartage({
    quoi: "bobine", auteur: author.name || "Passionné", extrait: extrait,
    vignette: reel.poster || reel.image || reel.photo || reel.coverPhotoUrl || "",
    url: url,
    message: "Une bobine de " + (author.name || "Passionné") + " sur PASSIO" + (extrait ? " : « " + extrait + " »" : ""),
    republier: function () { shareReelInFeed(postId); },
  });
}

async function shareReelInFeed(postId) {
  const reel = state.seed.posts.find(p => p.id === postId)
             || state.userPosts.find(p => p.id === postId)
             || (state.supabasePosts || []).find(p => p.id === postId);
  if (!reel) { toast("Le contenu original n'est plus disponible."); return; }

  const author = authorOfReel(reel);
  const passion = passionById(reel.passion) || { label: reel.passion, emoji: "✨" };
  const txt = reel.text || reel.caption || "";

  // ✅ Afficher directement le nom du profil courant!
  const prof = currentProfile();
  const g = state.user.general || {};

  // Charger le username depuis Supabase par MY_UID
  if (!g.username && typeof supa !== "undefined" && supa && MY_UID) {
    try {
      const { data } = await supa.from("profiles").select("username").eq("id", MY_UID).maybeSingle();
      if (data?.username) {
        state.user.general.username = data.username;
      }
    } catch (e) {}
  }

  const authorName = (state.user.general?.username) || prof?.name || "Moi";

  // Créer un post de partage dans le feed
  const newPost = {
    id: "post_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    type: "text",  // ✅ Type explicit pour les posts partagés
    authorId: typeof MY_UID !== "undefined" ? MY_UID : "me",
    authorName: authorName,
    authorEmoji: prof?.emoji || "✨",
    authorColor: prof?.color || "#8b5cf6",
    authorBio: currentProfile()?.bio || "",
    // ⚠️ PAS d'escapeHtml ici : `text` est un champ TEXTE, échappé à l'affichage
    // (`escapeHtml(displayText)`, app-02). L'échapper à la source le fait passer
    // DEUX fois → « Café d'Or » s'affichait « Café d&#39;Or », et la valeur
    // corrompue partait telle quelle dans `posts.content`. Même motif que le
    // double échappement du formulaire d'activité (#200 ②).
    // LOT-10 (PAR-C06) : la carte citée montre la bobine ; le texte stocké reste sobre.
    text: "A partagé une bobine de " + author.name,
    caption: `Shared reel from ${author.name}`,
    // ⚠️ `createdAt` est OBLIGATOIRE : `supaPublishPostWithRetry` fait
    // `new Date(post.createdAt).toISOString()` — sur `undefined` cela lève un
    // RangeError avalé par le `catch` du retry, donc le partage n'atteignait
    // JAMAIS Supabase (perdu au rechargement). Le même champ date la carte
    // (`fmtTime(p.createdAt)`, vide sans lui) et la classe dans le fil
    // (tri sur `createdAt || 0` → tout en bas). `sharePostInFeed` (app-03),
    // sa jumelle, le portait déjà.
    createdAt: Date.now(),
    timestamp: Date.now(),
    likes: 0,
    comments: [],
    passion: passionDeRepartage(reel.passion),   // cf. `sharePostInFeed` (app-03)
    // ⚠️ Le repli était `"chill"` — une valeur que le Studio ne propose plus
    // depuis le 2026-08-29 et qui n'a plus de libellé depuis le 2026-09-02.
    // Repartager une bobine sans mood ÉCRIVAIT donc du vocabulaire mort dans
    // `posts.mood`, en production, à chaque partage. Le neutre `all` est la
    // valeur juste : c'est déjà celle de toute publication venue de Supabase,
    // et c'est ce que rend `normalizeStudioMood` pour un mood inconnu.
    mood: reel.mood || "all",
    sharedReel: postId,
    sharedReelData: {
      id: reel.id,
      text: txt,
      authorName: author.name,
      authorEmoji: author.emoji,
      authorColor: author.color,
      passion: reel.passion,
      media: (function () { var m = reel.poster || reel.image || reel.photo || reel.coverPhotoUrl || ""; return /^data:/.test(String(m)) ? "" : m; })(),
      isReel: true,
    }
  };

  // ⚠️ Refus AVANT la mutation locale — cf. `mePublish` (app-08).
  if (typeof publicationRefuseeFautePassion === "function"
      && publicationRefuseeFautePassion(newPost.passion)) { closeModal(); return; }
  if (!state.userPosts) state.userPosts = [];
  state.userPosts.push(newPost);
  saveState();

  closeModal();
  setTimeout(() => {
    goTo("feed");
    setTimeout(() => renderFeed(), 100);
  }, 100);

  toast("Bobine partagée dans ton feed", "success");

  // 🔄 SYNC with Supabase (shared posts must be persisted!)
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    try {
      const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => {
          console.warn("⏱️ [SHARE] Timeout sync (3s)");
          resolve(false);
        }, 3000)
      );
      const syncPromise = supaPublishPostWithRetry(newPost);
      const syncSuccess = await Promise.race([syncPromise, timeoutPromise]);
      if (syncSuccess) {
        console.log("✅ [SHARE] Shared post synced to Supabase");
      } else {
        console.warn("⚠️ [SHARE] Shared post sync timeout - local only");
      }
    } catch (e) {
      console.warn("⚠️ [SHARE] Sync error:", e.message);
    }
  }
}


// ════════════════════════════════════════════════════════════════════════
// LIVE VIDÉO (façon Instagram/TikTok) — 2026-07-20
// Un diffuseur, N spectateurs, en WebRTC P2P « maille » : le diffuseur ouvre
// UNE PeerConnection PAR spectateur (pistes sendonly) et répartit son budget
// d'upload entre eux (d'où la limite VLIVE_MAX_VIEWERS). Signalisation par
// Supabase Realtime Broadcast sur le canal `vlive:<liveId>` (présence incluse
// pour compter les spectateurs et détecter les arrivées/départs). L'annuaire
// des lives actifs vit dans la table `video_lives` (heartbeat `last_seen`).
// Réutilise les briques des appels : CALL_ICE_SERVERS, _callTuneSdp,
// _callPreferVideoCodecs, _callMyName, CALL_AUDIO_CONSTRAINTS.
//   Diffuseur : startVideoLive() → insert row + canal + presence "host".
//   Spectateur : joinVideoLive(id) → canal + presence "viewer" → le diffuseur
//   voit le join → offre SDP ciblée (`to`) → answer → flux.
// ════════════════════════════════════════════════════════════════════════

const VLIVE_MAX_VIEWERS = 8;          // au-delà : upload du téléphone saturé
const VLIVE_STALE_MS = 90000;         // live sans heartbeat depuis 90 s = mort
const VLIVE_VIDEO_QUALITY = {
  width: { ideal: 1280, max: 1280 },  // 720p : 1080p × N spectateurs ne passe pas
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: 30, max: 30 },
};
const VLIVE_REACTIONS = ["❤️", "🔥", "👏", "😂", "😮"];  // palette réactions live (IG/TikTok-style)
const VLIVE_CHATLOG_MAX = 25;         // messages rejoués aux arrivants tardifs
// ── Scaling GRATUIT par relais P2P (arbre de profondeur 1) ──
// Sans serveur média (SFU) on ne peut PAS atteindre l'échelle Twitch. Mais on
// dépasse le plafond du mesh en faisant re-diffuser le flux par les spectateurs
// DIRECTS : chaque spectateur direct « prêt » sert jusqu'à VLIVE_FANOUT enfants.
// Capacité ≈ VLIVE_MAX_VIEWERS × (1 + VLIVE_FANOUT). Le chemin direct (host↔
// spectateur) est INCHANGÉ ; le relais n'utilise que des events dédiés (r*) →
// aucune régression sur le cas courant. Le chat/réactions/présence passent par
// le broadcast du canal (touchent tout le monde) : seule la VIDÉO est relayée.
const VLIVE_FANOUT = 3;               // enfants servis par spectateur-relais
const VLIVE_RELAY_BR = 1200000;       // débit vidéo d'un relais (uplink spectateur)

window._vliveHost = window._vliveHost || null;  // état diffuseur
window._vliveView = window._vliveView || null;  // état spectateur
window._videoLives = window._videoLives || [];  // annuaire des lives actifs (bulles)

// ── Annuaire des lives actifs ──
async function supaLoadVideoLives() {
  try {
    if (typeof supa === "undefined" || !supa || !window._supaReal) return [];
    const cutoff = new Date(Date.now() - VLIVE_STALE_MS).toISOString();
    const { data, error } = await supa.from("video_lives").select("*")
      .eq("status", "live").gte("last_seen", cutoff)
      .order("started_at", { ascending: false }).limit(20);
    if (error) { console.warn("[vlive] load:", error.message); return []; }
    return data || [];
  } catch (e) { return []; }
}

// Recharge l'annuaire et re-rend les bulles stories si ça a changé.
async function supaRefreshVideoLives() {
  const rows = await supaLoadVideoLives();
  const next = rows.filter(r => !(typeof isBlocked === "function" && isBlocked(r.author_id)));
  const changed = JSON.stringify(next.map(r => r.id + r.status)) !== JSON.stringify((window._videoLives || []).map(r => r.id + r.status));
  window._videoLives = next;
  if (changed) { try { if (typeof renderStories === "function") renderStories(); } catch (e) {} }
  // ⚠️ ELLE REND SON VERDICT DEPUIS LE 2026-09-20, et c'est ce qui permet au
  // filet périodique de reculer. Les quatre appelants d'avant l'ignorent : la
  // valeur de retour est un AJOUT, aucun contrat existant ne change.
  return changed;
}
window.supaRefreshVideoLives = supaRefreshVideoLives;

// ══════════════════════════════════════════════════════════════════════════
// ⑧ LE BATTEMENT DE CŒUR D'UN LIVE NE PART PLUS VERS PERSONNE (2026-11-09)
// ──────────────────────────────────────────────────────────────────────────
// Jusqu'au 2026-11-09, l'abonnement `postgres_changes` `video_lives` `*` livrait
// chaque changement à TOUS les connectés — dont l'UPDATE `last_seen` que l'hôte
// d'un live envoie toutes les 25 s, filtré ensuite ici chez chacun
// (`vliveEvenementSansEffet`, `vliveRefreshCoalesce`, 2026-09-20). La liaison
// est retirée avec le reste du contenu public (app-08 « 📴 ») : les bulles
// « 🔴 LIVE » suivent le filet ci-dessous, qui ne recule pas tant que le fil
// est à l'écran (`filetEstLeSeulChemin`) ni tant qu'un live est connu, et que
// le retour au fil ou au premier plan relance tout de suite
// (`vliveFiletReveiller(true)`). Un live qui démarre apparaît donc en 60 s au
// plus sous les yeux, et un live terminé disparaît dans le même délai.

// ══════════════════════════════════════════════════════════════════════════
// ⑪ LE FILET DES LIVES RECULE QUAND IL N'Y A RIEN À SURVEILLER (2026-09-20)
// ──────────────────────────────────────────────────────────────────────────
// Filet : re-check périodique. Depuis le 2026-11-09 c'est le SEUL chemin des
// bulles « 🔴 LIVE » (plus de liaison temps réel `video_lives`, voir ⑧) ; il
// rattrape aussi les lives morts sans événement `ended` — crash, batterie…
//
// ⚠️ IL TOURNAIT TOUTES LES 60 s CHEZ CHAQUE CONNECTÉ, MÊME SANS AUCUN LIVE.
// Mesuré en production (canal ①, 129 jours) : **234 949 appels** — c'est le
// plus gros compteur d'appels de la base après le temps réel, pour une table
// de 21 lignes et une requête à 0,21 ms. Le coût CPU est donc dérisoire ; ce
// qui ne l'est pas, c'est que ce coût est **proportionnel au nombre d'onglets
// ouverts et indépendant de toute activité**. À 2 000 connectés, c'est 33
// requêtes par seconde pour surveiller, la plupart du temps, une liste vide.
//
// ⚠️ CE QUE CE FILET SURVEILLE N'EXISTE PAS QUAND IL N'Y A PAS DE LIVE. Son
// travail est de purger un live mort dont l'événement `ended` s'est perdu :
// sans live connu, il n'y a rien à purger. Le pas recule donc jusqu'à 5 minutes
// quand la liste est VIDE et que rien ne change, et retombe à 60 s dès qu'un
// live est connu, dès qu'un changement est trouvé, ou au retour à l'écran.
// ⚠️ Un live QUI EXISTE garde la cadence de 60 s, quoi qu'il arrive : c'est
// exactement le cas que le filet doit rattraper, et le ralentir laisserait une
// bulle « 🔴 LIVE » allumée jusqu'à cinq minutes après la fin du direct.
// ⚠️ UNE PANNE N'EST PAS UN CALME : `supaRefreshVideoLives` rend `false` sur
// une coupure comme sur un vrai calme (elle replie sur un tableau vide). Le
// recul n'est donc pris que lorsque la liste est vide ET le restait déjà —
// deux tours consécutifs sans live — sinon une coupure d'une seconde ferait
// reculer le filet pour cinq minutes.
// ⚠️ ET DEPUIS LE LOT « CONNEXIONS TEMPS RÉEL » (2026-09-20), CE FILET EST LE
// SEUL CHEMIN D'UN VISITEUR. `supaSubscribe` n'ouvre plus de connexion sans
// compte, donc l'événement `ended` d'un live ne lui parvient JAMAIS : le
// reculer jusqu'à 5 min lui laisserait une bulle « 🔴 LIVE » allumée cinq
// minutes après la fin du direct — chez 97,9 % des sessions. Même couplage que
// le filet du fil (app-08). ⚠️ DEPUIS LE 2026-11-09, C'EST LE SEUL CHEMIN DE
// TOUT LE MONDE (plus de liaison `video_lives`) : la borne est le fil à
// l'écran (`filetEstLeSeulChemin`), plus l'identité.
// Les bornes et la règle de recul vivent dans `filetProchainPas` (app-02),
// autorité PARTAGÉE avec le filet du fil.
let _vliveFiletPas = 60000;
let _vliveFiletMinuteur = null;
// Un tour EN VOL (la lecture n'a pas répondu) : un réveil immédiat ne lance pas
// un second tour — sa fin réarmerait une seconde chaîne de minuteurs.
let _vliveFiletEnVol = false;

// `immediat` (retour au fil, retour au premier plan) : le tour part tout de
// suite au lieu d'attendre un rendez-vous pris au pas reculé — sans temps réel,
// c'est ce qui rend une bulle « 🔴 LIVE » juste dès qu'on regarde.
function vliveFiletReveiller(immediat) {
  _vliveFiletPas = filetProchainPas(0, true, false);
  if (immediat === true && !document.hidden && window._supaReal && _vliveFiletMinuteur !== null && !_vliveFiletEnVol) {
    clearTimeout(_vliveFiletMinuteur);
    _vliveFiletMinuteur = setTimeout(_vliveFiletTour, 0);
  }
}
window.vliveFiletReveiller = vliveFiletReveiller;

function _vliveFiletTour() {
  let vivant = false;
  const avantVide = !(window._videoLives || []).length;
  const suite = () => {
    _vliveFiletEnVol = false;
    const apresVide = !(window._videoLives || []).length;
    // « Vivant » ici, c'est : un changement trouvé, OU un live connu — avant ou
    // après le tour. Un live qui EXISTE garde la cadence vive quoi qu'il
    // arrive : c'est exactement ce que ce filet doit rattraper, et le ralentir
    // laisserait une bulle « 🔴 LIVE » allumée jusqu'à cinq minutes après la
    // fin du direct.
    // ⚠️ `seulChemin` : aucun événement de live n'arrive plus en temps réel
    // (2026-11-09, plus de liaison `video_lives`) — le filet est la seule
    // source, il ne recule pas. BORNÉ au fil à l'écran (les bulles « 🔴 LIVE »
    // vivent dans sa barre de stories) : `filetEstLeSeulChemin` (app-02), MÊME
    // autorité que le filet du fil.
    const seulChemin = typeof filetEstLeSeulChemin === "function" && filetEstLeSeulChemin();
    _vliveFiletPas = filetProchainPas(_vliveFiletPas, vivant || seulChemin || !apresVide || !avantVide, document.hidden);
    _vliveFiletMinuteur = setTimeout(_vliveFiletTour, delaiDeleste(_vliveFiletPas));
  };
  try {
    if (document.hidden || !window._supaReal) { suite(); return; }
    _vliveFiletEnVol = true;
    const p = supaRefreshVideoLives();
    if (p && typeof p.then === "function") {
      p.then(function (c) { vivant = !!c; }, function () { vivant = true; }).then(suite);
      return;
    }
    vivant = !!p;
  } catch (e) {
    try { diagLog("vlive_filet", e && e.message); } catch (_e) {}
    vivant = true;                                   // une panne n'est pas un calme
  }
  suite();
}
_vliveFiletMinuteur = setTimeout(_vliveFiletTour, delaiDeleste(_vliveFiletPas));

// Le retour à l'écran rend sa cadence vive au filet, et relit tout de suite.
// ⚠️ SEULEMENT SI LE FIL EST À L'ÉCRAN : les bulles n'existent que là, et un
// retour sur un autre écran n'a rien à repeindre (le retour au fil, lui, relit
// — `goTo`). Sinon, une lecture `video_lives` à chaque retour au premier plan.
document.addEventListener("visibilitychange", function () {
  if (document.hidden) return;
  vliveFiletReveiller(typeof filetEstLeSeulChemin === "function" && filetEstLeSeulChemin());
});
// ⚠️ `pageshow` part AUSSI au premier chargement : là, `supaInit` lit déjà les
// lives une fois — relire en plus doublait la lecture du démarrage (et une
// réponse 2xx de plus efface le compte des échecs de `_sondeServeurReponse`).
// Seul un retour du cache de navigation (`persisted`, iOS sans
// `visibilitychange`) relit tout de suite.
window.addEventListener("pageshow", function (e) { vliveFiletReveiller(!!(e && e.persisted) && typeof filetEstLeSeulChemin === "function" && filetEstLeSeulChemin()); });

// Bulles « 🔴 LIVE » injectées en tête de la barre des stories (renderStories).
function _vliveChipsHtml() {
  const mine = (typeof MY_UID !== "undefined" && MY_UID) || "";
  return (window._videoLives || []).filter(r => r.author_id !== mine).map(r => {
    const inner = r.author_photo
      ? '<img loading="lazy" decoding="async" src="' + (typeof safeUrlAttr === "function" ? safeUrlAttr(r.author_photo) : "") + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display=\'none\'"/>'
      : escapeHtml(r.author_emoji || "🔴");
    const tip = r.title ? (r.author_name || "Live") + " — " + r.title : "Rejoindre le live";
    return '' +
      '<div class="story-item" onclick="joinVideoLive(\'' + escapeJsArg(r.id) + '\')" title="' + escapeHtml(tip) + '">' +
        '<div class="story-ring vlive-ring">' +
          '<div class="story-inner" style="background:#111;">' + inner + '</div>' +
        '</div>' +
        '<div class="story-label vlive-label">🔴 ' + escapeHtml((r.author_name || "Live").split(" ")[0]) + '</div>' +
      '</div>';
  }).join("");
}

// ── Canal + envoi ──
function _vliveChan() {
  const s = window._vliveHost || window._vliveView;
  return s && s.chan;
}
function _vliveSend(event, data) {
  const chan = _vliveChan();
  if (!chan) return;
  try { chan.send({ type: "broadcast", event: event, payload: Object.assign({ from: MY_UID }, data || {}) }); } catch (e) {}
}

// ═══════════════ DIFFUSEUR ═══════════════
// Petit prompt de titre (topic du live) avant de diffuser — façon Twitch/IG.
// Résout une chaîne (éventuellement vide) ou null si annulé.
function _vlivePromptTitle() {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "vlive-pretitle";
    ov.innerHTML =
      '<div class="vlive-pretitle-card">' +
        '<div class="vlive-pretitle-h">Passer en direct</div>' +
        '<div class="vlive-pretitle-sub">Donne un titre à ton live (optionnel)</div>' +
        '<input id="vlivePretitleInput" maxlength="80" autocomplete="off" placeholder="Ex : Session guitare du soir 🎸" />' +
        '<div class="vlive-pretitle-row">' +
          '<button class="btn ghost" id="vlivePretitleCancel">Annuler</button>' +
          '<button class="btn primary" id="vlivePretitleGo">Lancer</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    const inp = ov.querySelector("#vlivePretitleInput");
    let done = false;
    const finish = (val) => { if (done) return; done = true; try { document.body.removeChild(ov); } catch (e) {} resolve(val); };
    ov.querySelector("#vlivePretitleGo").onclick = () => finish((inp.value || "").trim().slice(0, 80));
    ov.querySelector("#vlivePretitleCancel").onclick = () => finish(null);
    ov.addEventListener("click", (e) => { if (e.target === ov) finish(null); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") finish((inp.value || "").trim().slice(0, 80)); });
    setTimeout(() => { try { inp.focus(); } catch (e) {} }, 40);
  });
}

async function startVideoLive() {
  if (window._call) { toast("Termine ton appel d'abord"); return; }
  if (window._vliveHost) return;
  if (window._vliveView) leaveVideoLive();
  if (typeof RTCPeerConnection === "undefined") { toast("Ton navigateur ne gère pas le direct"); return; }
  // ⚠️ LE JUMEAU DE `joinVideoLive`, ET IL ÉTAIT RESTÉ SUR `!MY_UID` — la
  // condition que le commentaire de sa sœur qualifie de « ne prouvait rien ».
  // Aucun canal ne fuyait (l'INSERT dans `video_lives` est refusé par la RLS
  // avant la création du canal), mais un visiteur passait la garde, obtenait
  // la fenêtre de titre PUIS **la demande de permission caméra/micro** avant
  // d'être refusé — ce qui heurte la règle de première visite « aucune demande
  // de permission ». Et laisser l'idiome intact à côté d'un commentaire qui le
  // déclare défectueux ferait conclure au prochain lecteur qu'il a été audité
  // et validé ici (capacité, 2026-09-20).
  const compteReel = typeof connexionTempsReelAutorisee !== "function" || connexionTempsReelAutorisee();
  // LOT-15 (CRE-C14) : un visiteur reçoit la MÊME porte d'inscription que les
  // cinq autres entrées de « Créer », pas un simple toast.
  if (window.requireAuthentication && !requireAuthentication("publier")) return;
  if (typeof supa === "undefined" || !supa || !window._supaReal || !MY_UID || !compteReel) { toast("Connecte-toi pour lancer un live"); return; }

  _appelEnPreparation();
  // Le relais TURN se demande PENDANT le titre et la caméra, et on l'attend (2,5 s
  // au plus — le plus souvent déjà là) AVANT d'ouvrir le live : la connexion de
  // chaque spectateur se crée ensuite sans attente (`_vliveHostAddViewer` doit
  // rester SYNCHRONE jusqu'à `H.pcs[vid]` — `_vliveHostAssign` décide doublon et
  // capacité sur cette table ; une attente là faisait répondre « complet » à des
  // spectateurs groupés alors que des relais étaient libres, relecture du 2026-11-09).
  const _relais = assurerServeursIce();
  const title = await _vlivePromptTitle();
  if (title === null) return;  // annulé

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: CALL_AUDIO_CONSTRAINTS,
      video: Object.assign({ facingMode: "user" }, VLIVE_VIDEO_QUALITY),
    });
  } catch (e) { toast("Caméra/micro indisponible ou refusé"); return; }
  try { await _relais; } catch (e) {}

  const id = "vl_" + String(MY_UID).slice(0, 8) + "_" + Date.now().toString(36);
  const me = (typeof currentProfile === "function" && currentProfile()) || {};
  const row = {
    id: id, author_id: MY_UID, author_name: _callMyName(),
    author_emoji: me.emoji || "🔴",
    author_photo: (state.user && state.user.general && state.user.general.avatarPhoto) || null,
    title: title || null,
    status: "live",
    started_at: new Date().toISOString(), last_seen: new Date().toISOString(),
  };
  try {
    const { error } = await supa.from("video_lives").insert(row);
    if (error) { console.warn("[vlive] insert:", error.message); toast("Impossible de démarrer le live"); (stream.getTracks() || []).forEach(t => t.stop()); return; }
  } catch (e) { toast("Impossible de démarrer le live"); (stream.getTracks() || []).forEach(t => t.stop()); return; }

  window._vliveHost = { id: id, stream: stream, chan: null, pcs: {}, startedAt: Date.now(), _facing: "user", hb: null, title: title || "", chatLog: [], peak: 0, tree: {}, paused: false };
  _vliveRenderUI("host", row);
  const lv = document.getElementById("vliveVideo");
  if (lv) { lv.srcObject = stream; lv.muted = true; try { lv.play(); } catch (e) {} }

  // PRIVÉ (comptes connectés seulement) — cf. _callChannel pour le repli.
  const chan = supa.channel("vlive:" + id, { config: { broadcast: { self: false, ack: false }, presence: { key: MY_UID }, private: window._rtPriveIndisponible !== true } });
  window._vliveHost.chan = chan;
  _vliveBindHost(chan);
  chan.subscribe((st) => {
    if (st === "SUBSCRIBED") { try { chan.track({ uid: MY_UID, role: "host" }); } catch (e) {} }
  });

  // Heartbeat : sans lui le live est considéré mort après VLIVE_STALE_MS
  // (c'est AUSSI le filet qui efface les bulles après un crash du diffuseur).
  window._vliveHost.hb = setInterval(() => {
    try { supa.from("video_lives").update({ last_seen: new Date().toISOString() }).eq("id", id).then(() => {}); } catch (e) {}
  }, 25000);

  _vliveStartTimer(Date.now());
  _vliveNotifyFollowers(id, title);
  toast("Tu es en direct !");
}
window.startVideoLive = startVideoLive;

function _vliveBindHost(chan) {
  // Un spectateur arrive (présence) → on lui attribue un parent (host en direct
  // OU un spectateur-relais si l'hôte est saturé), on lui rejoue l'historique du
  // chat et on annonce son arrivée (preuve sociale).
  chan.on("presence", { event: "join" }, (p) => {
    try {
      (p.newPresences || []).forEach(np => {
        const vid = np.uid || p.key;
        if (vid && vid !== MY_UID && np.role === "viewer") {
          _vliveHostAssign(vid);
          const H = window._vliveHost;
          if (H && H.chatLog && H.chatLog.length) _vliveSend("history", { to: vid, msgs: H.chatLog.slice(-VLIVE_CHATLOG_MAX) });
          if (H && H.paused) _vliveSend("pause", { on: true });
          const nm = (np.name || "Quelqu'un").split(" ")[0];
          _vliveSend("sys", { text: nm + " a rejoint 👋" });
          _vliveSysMsg(nm + " a rejoint 👋");
        }
      });
    } catch (e) {}
    _vliveUpdateViewers();
  });
  chan.on("presence", { event: "leave" }, (p) => {
    try {
      const H = window._vliveHost;
      const vid = p.key;
      if (!H || !vid) { _vliveUpdateViewers(); return; }
      if (H.pcs[vid]) { try { H.pcs[vid].pc.close(); } catch (e) {} delete H.pcs[vid]; _vliveApplyHostQuality(); }
      // Ce spectateur relayait vers des enfants → ils deviennent orphelins :
      // on les ré-attribue (host direct si place, sinon autre relais).
      const node = H.tree[vid];
      if (node && node.kids && node.kids.length) {
        const orphans = node.kids.slice();
        orphans.forEach(k => { if (H.tree[k]) H.tree[k].parent = null; });
        orphans.forEach(k => _vliveHostAssign(k));
      }
      // Détache ce nœud de son parent-relais éventuel.
      if (node && node.parent && node.parent !== "host" && H.tree[node.parent]) {
        H.tree[node.parent].kids = (H.tree[node.parent].kids || []).filter(x => x !== vid);
      }
      delete H.tree[vid];
    } catch (e) {}
    _vliveUpdateViewers();
  });
  // Un spectateur signale que sa connexion est établie → éligible comme relais.
  chan.on("broadcast", { event: "ready" }, (msg) => {
    const H = window._vliveHost;
    const from = (msg.payload || {}).from;
    if (H && from && H.tree[from]) { H.tree[from].ready = true; _vliveAssignPending(); }
  });
  chan.on("presence", { event: "sync" }, () => { _vliveUpdateViewers(); });
  chan.on("broadcast", { event: "answer" }, async (msg) => {
    const H = window._vliveHost;
    const d = msg.payload || {};
    const entry = H && H.pcs[d.from];
    if (!entry || !d.sdp) return;
    try {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
      (entry.pendingIce || []).forEach(c => { try { entry.pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {} });
      entry.pendingIce = [];
    } catch (e) {}
  });
  chan.on("broadcast", { event: "ice" }, async (msg) => {
    const H = window._vliveHost;
    const d = msg.payload || {};
    if (!H || d.to !== "host" || !d.candidate) return;
    const entry = H.pcs[d.from];
    if (!entry) return;
    try {
      if (!entry.pc.remoteDescription || !entry.pc.remoteDescription.type) (entry.pendingIce = entry.pendingIce || []).push(d.candidate);
      else await entry.pc.addIceCandidate(new RTCIceCandidate(d.candidate));
    } catch (e) {}
  });
  chan.on("broadcast", { event: "chat" }, (msg) => { _vliveChatMsg(msg.payload); });
  chan.on("broadcast", { event: "react" }, (msg) => { _vliveSpawnReaction((msg.payload || {}).emoji); });
  chan.on("broadcast", { event: "heart" }, () => { _vliveSpawnReaction("❤️"); });
}

// Ouvre (ou ré-ouvre) la connexion vers UN spectateur et lui envoie l'offre.
async function _vliveHostAddViewer(vid) {
  const H = window._vliveHost;
  if (!H) return;
  if (H.pcs[vid]) { try { H.pcs[vid].pc.close(); } catch (e) {} delete H.pcs[vid]; }
  if (Object.keys(H.pcs).length >= VLIVE_MAX_VIEWERS) { _vliveSend("full", { to: vid }); return; }
  // SANS attente (voir `startVideoLive`, qui attend le relais avant d'ouvrir le live) :
  // l'appel retire tout de suite des identifiants expirés et relance le renouvellement
  // en arrière-plan ; ceux qui restent ont au moins 3 h par construction.
  assurerServeursIce();
  const pc = new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS });
  const entry = { pc: pc, pendingIce: [] };
  H.pcs[vid] = entry;
  (H.stream.getTracks() || []).forEach(t => pc.addTrack(t, H.stream));
  try { _callPreferVideoCodecs(pc); } catch (e) {}
  pc.onicecandidate = (e) => { if (e.candidate) _vliveSend("ice", { to: vid, candidate: e.candidate }); };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === "failed" || st === "closed") {
      try { pc.close(); } catch (e) {}
      const h = window._vliveHost;
      if (h && h.pcs[vid] && h.pcs[vid].pc === pc) { delete h.pcs[vid]; _vliveApplyHostQuality(); _vliveUpdateViewers(); }
    }
  };
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription({ type: offer.type, sdp: _callTuneSdp(offer.sdp) });
    _vliveSend("offer", { to: vid, sdp: pc.localDescription });
  } catch (e) { console.warn("[vlive] offer:", e && e.message); }
  _vliveApplyHostQuality();
}

// Répartit le budget d'upload (~8 Mb/s) entre les spectateurs connectés.
async function _vliveApplyHostQuality() {
  const H = window._vliveHost;
  if (!H) return;
  const n = Math.max(1, Object.keys(H.pcs).length);
  // Cap 4 Mb/s : à 1-2 spectateurs le 720p30 est vraiment net (2,5 Mb/s était
  // juste) ; au-delà le budget upload (~8 Mb/s) se répartit, plancher 600 kb/s.
  const videoBr = Math.max(600000, Math.min(4000000, Math.floor(8000000 / n)));
  for (const vid in H.pcs) {
    const pc = H.pcs[vid].pc;
    try {
      for (const sender of pc.getSenders()) {
        if (!sender.track) continue;
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        if (sender.track.kind === "video") {
          try { sender.track.contentHint = "motion"; } catch (e) {}
          params.encodings[0].maxBitrate = videoBr;
          params.encodings[0].maxFramerate = 30;
          params.encodings[0].active = true;
        } else {
          params.encodings[0].maxBitrate = 128000;
        }
        try { await sender.setParameters(params); } catch (e) {}
      }
    } catch (e) {}
  }
}

// Attribue un parent au nouveau spectateur : l'hôte en direct tant qu'il a de la
// place, sinon un spectateur-relais prêt. Sinon « complet ».
function _vliveHostAssign(vid) {
  const H = window._vliveHost;
  if (!H || !vid || vid === MY_UID) return;
  if (H.pcs[vid]) return; // déjà servi en direct
  if (Object.keys(H.pcs).length < VLIVE_MAX_VIEWERS) {
    H.tree[vid] = { parent: "host", ready: false, kids: [] };
    _vliveHostAddViewer(vid); // chemin direct existant (offer/answer/ice)
    return;
  }
  const relay = _vliveFindRelay();
  if (relay) {
    H.tree[vid] = { parent: relay, ready: false, kids: [] };
    H.tree[relay].kids = H.tree[relay].kids || [];
    if (H.tree[relay].kids.indexOf(vid) < 0) H.tree[relay].kids.push(vid);
    _vliveSend("assign", { to: vid, parent: relay });
    _vliveSend("serve", { to: relay, child: vid });
    return;
  }
  // Aucun relais prêt (ex. burst juste après le lancement, avant que les directs
  // soient connectés) → on met en attente et on assignera dès qu'un relais est
  // prêt. Filet : au bout de VLIVE_STALE_MS toujours sans place → « complet ».
  if (H.tree[vid] && H.tree[vid].parent === null && H.tree[vid].pending) return; // déjà en attente
  H.tree[vid] = { parent: null, ready: false, kids: [], pending: true, since: Date.now() };
  setTimeout(() => {
    const HH = window._vliveHost;
    const n = HH && HH.tree[vid];
    if (n && n.pending) { _vliveSend("full", { to: vid }); delete HH.tree[vid]; }
  }, 15000);
}

// Assigne les spectateurs en attente dès qu'un slot (host ou relais) se libère.
function _vliveAssignPending() {
  const H = window._vliveHost;
  if (!H) return;
  const waiting = Object.keys(H.tree).filter(id => H.tree[id] && H.tree[id].pending);
  waiting.forEach(id => { if (H.tree[id]) { H.tree[id].pending = false; _vliveHostAssign(id); } });
}

// Cherche le meilleur relais : un spectateur DIRECT (profondeur 1), connecté et
// prêt, avec un slot enfant libre — celui qui en a le moins.
function _vliveFindRelay() {
  const H = window._vliveHost;
  if (!H) return null;
  let best = null, bestKids = VLIVE_FANOUT;
  for (const id in H.tree) {
    const n = H.tree[id];
    if (!n || n.parent !== "host" || !n.ready || !H.pcs[id]) continue;
    const kc = (n.kids || []).length;
    if (kc < bestKids) { best = id; bestKids = kc; }
  }
  return best;
}

// Notifie mes abonnés (notif in-app + push via supaInsertNotif → notify-call).
async function _vliveNotifyFollowers(liveId, title) {
  const msg = title
    ? ("est en direct : « " + String(title).slice(0, 60) + " » — rejoins !")
    : "est en direct — rejoins le live !";
  try {
    const { data } = await seulementAbonnementsAcceptes(supa.from("follows").select("follower_id").eq("following_id", MY_UID)).limit(200);
    const ids = [...new Set((data || []).map(r => r.follower_id))].filter(x => x && x !== MY_UID);
    for (const fid of ids) {
      try { await supaInsertNotif(fid, "live_video", liveId, msg); } catch (e) {}
    }
  } catch (e) {}
}

// Termine le live (action du diffuseur).
async function endVideoLive() {
  const H = window._vliveHost;
  if (!H) { _vliveCloseUI(); return; }
  const durS = Math.max(0, Math.floor((Date.now() - (H.startedAt || Date.now())) / 1000));
  const peak = H.peak || 0;
  _vliveSend("end", {});
  try { await supa.from("video_lives").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", H.id); } catch (e) {}
  _vliveTeardown();
  const mm = Math.floor(durS / 60), ss = durS % 60;
  const dur = mm > 0 ? (mm + " min " + String(ss).padStart(2, "0") + "s") : (ss + "s");
  toast("Live terminé · " + dur + " · pic " + peak + " spectateur" + (peak > 1 ? "s" : ""));
  supaRefreshVideoLives();
}
window.endVideoLive = endVideoLive;

// ═══════════════ SPECTATEUR ═══════════════
async function joinVideoLive(liveId) {
  if (window._call) { toast("Termine ton appel d'abord"); return; }
  if (window._vliveHost) { toast("Tu es déjà en direct"); return; }
  if (window._vliveView && window._vliveView.id === liveId) return;
  if (window._vliveView) leaveVideoLive();
  if (typeof RTCPeerConnection === "undefined") { toast("Ton navigateur ne gère pas le direct"); return; }
  // ⚠️ `!MY_UID` NE PROUVAIT RIEN : `getMyUserId()` fabrique un `u_<aléatoire>`
  // pour tout visiteur, qui passait donc cette garde et ouvrait un canal
  // `vlive:<id>` — une place sur les 500 du quota, pour un direct qu'il ne peut
  // de toute façon pas rejoindre. Le message était déjà juste, c'est la
  // condition qui ne l'était pas (capacité, 2026-09-20).
  const compteReel = typeof connexionTempsReelAutorisee !== "function" || connexionTempsReelAutorisee();
  if (typeof supa === "undefined" || !supa || !window._supaReal || !MY_UID || !compteReel) { toast("Connecte-toi pour rejoindre un live"); return; }
  // ⚠️ DOUBLE ENTRÉE : `_vliveView` n'est posé qu'après les attentes (état du live,
  // relais TURN — jusqu'à 2,5 s sans rien à l'écran). Un second toucher pendant ce
  // temps passait toutes les gardes ; le SDK rendant le MÊME canal pour le même
  // topic, chaque gestionnaire était attaché deux fois : tout le chat, toutes les
  // réactions en double, chaque offre traitée deux fois (audit du 2026-11-09).
  if (window._vliveEntree === liveId) return;
  window._vliveEntree = liveId;
  try {
    _appelEnPreparation();
    // Le relais TURN se demande EN MÊME TEMPS que l'état du live, et on l'attend
    // (2,5 s au plus) avant d'entrer : l'offre de l'hôte peut arriver tout de suite.
    const _relais = assurerServeursIce();
    // Vérifie que le live est encore vivant (statut + heartbeat récent).
    let row = (window._videoLives || []).find(r => r.id === liveId) || null;
    try {
      const { data } = await supa.from("video_lives").select("*").eq("id", liveId).maybeSingle();
      if (data) row = data;
    } catch (e) {}
    try { await _relais; } catch (e) {}
    // Entre-temps, un appel ou un autre direct a pu commencer — ou un toucher sur un
    // AUTRE live a pris la main (`_vliveEntree` est alors le sien) : le dernier gagne,
    // et une entrée remplacée se tait (pas de « Ce live est terminé » pour l'ancien).
    if (window._vliveEntree !== liveId || window._call || window._vliveHost || window._vliveView) return;
    if (!row || row.status !== "live" || supaTs(row.last_seen) < Date.now() - VLIVE_STALE_MS) {
      toast("Ce live est terminé"); supaRefreshVideoLives(); return;
    }

    window._vliveView = { id: liveId, row: row, chan: null, pc: null, pendingIce: [] };
    _vliveRenderUI("viewer", row);

    const chan = supa.channel("vlive:" + liveId, { config: { broadcast: { self: false, ack: false }, presence: { key: MY_UID }, private: window._rtPriveIndisponible !== true } });
    window._vliveView.chan = chan;
    _vliveBindViewer(chan);
    chan.subscribe((st) => {
      if (st === "SUBSCRIBED") { try { chan.track({ uid: MY_UID, role: "viewer", name: _callMyName() }); } catch (e) {} }
    });
    _vliveStartTimer(supaTs(row.started_at) || Date.now());
  } finally {
    if (window._vliveEntree === liveId) window._vliveEntree = null;
  }
}
window.joinVideoLive = joinVideoLive;

// ⚠️ La charge utile d'un broadcast est écrite par un client, et la policy
// Realtime `vlive:%` laisse TOUT compte émettre (les spectateurs y parlent : chat,
// réactions, réponses SDP). Un tiers pouvait donc envoyer `offer` (détourner le
// flux d'un spectateur vers le sien), `end`, `pause` ou `full` (couper le live).
// Les ordres d'HÔTE ne sont acceptés que si `from` est l'auteur du live, lu dans
// `video_lives` (la seule identité que le serveur a écrite). Résidu ASSUMÉ et
// écrit : `from` reste déclaratif — un compte connecté peut l'usurper ; fermer
// cela demande un topic d'hôte à part, gardé par policy (lot suivant).
function _vliveDeLHote(d) {
  const V = window._vliveView;
  return !!(V && V.row && d && d.from && d.from === V.row.author_id);
}
function _vliveBindViewer(chan) {
  chan.on("broadcast", { event: "offer" }, async (msg) => {
    const V = window._vliveView;
    const d = msg.payload || {};
    if (!V || d.to !== MY_UID || !d.sdp || !_vliveDeLHote(d)) return;
    try {
      if (V.pc) { try { V.pc.close(); } catch (e) {} }
      assurerServeursIce(); // sans attente : retire des identifiants expirés, relance le renouvellement
      const pc = new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS });
      V.pc = pc; V.pendingIce = V.pendingIce || []; V.servedBy = "host";
      pc.ontrack = (e) => {
        V.remoteStream = e.streams[0];
        const rv = document.getElementById("vliveVideo");
        if (rv) { rv.srcObject = e.streams[0]; _vliveTryPlay(rv); }
        _vliveFlushPendingKids(); // flux reçu → je peux relayer vers mes enfants
      };
      pc.onicecandidate = (e) => { if (e.candidate) _vliveSend("ice", { to: "host", candidate: e.candidate }); };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "connected") {
          V._reconns = 0;
          const s = document.getElementById("vliveStatus"); if (s) s.textContent = "";
          // Signale à l'hôte que je suis connecté → utilisable comme relais.
          if (!V._readySent) { V._readySent = true; _vliveSend("ready", {}); }
        }
        // "disconnected" est souvent transitoire (WebRTC ré-essaie seul) → on
        // n'agit que sur "failed", en tentant d'abord une reconnexion douce.
        if (st === "failed" && window._vliveView === V) _vliveViewerReconnect();
      };
      await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      _vliveSend("answer", { sdp: pc.localDescription });
      (V.pendingIce || []).forEach(c => { try { pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {} });
      V.pendingIce = [];
      const stEl = document.getElementById("vliveStatus");
      if (stEl) stEl.textContent = "";
    } catch (e) { console.warn("[vlive] answer:", e && e.message); }
  });
  chan.on("broadcast", { event: "ice" }, async (msg) => {
    const V = window._vliveView;
    const d = msg.payload || {};
    if (!V || d.to !== MY_UID || !d.candidate) return;
    try {
      if (!V.pc || !V.pc.remoteDescription || !V.pc.remoteDescription.type) (V.pendingIce = V.pendingIce || []).push(d.candidate);
      else await V.pc.addIceCandidate(new RTCIceCandidate(d.candidate));
    } catch (e) {}
  });
  chan.on("broadcast", { event: "end" }, (msg) => { if (_vliveDeLHote(msg.payload)) _vliveShowEnded("Le live est terminé"); });
  chan.on("broadcast", { event: "full" }, (msg) => {
    const d = msg.payload || {};
    if (d.to !== MY_UID || !_vliveDeLHote(d)) return;
    toast("Ce live est complet 😅"); leaveVideoLive();
  });
  chan.on("broadcast", { event: "chat" }, (msg) => { _vliveChatMsg(msg.payload); });
  chan.on("broadcast", { event: "react" }, (msg) => { _vliveSpawnReaction((msg.payload || {}).emoji); });
  chan.on("broadcast", { event: "heart" }, () => { _vliveSpawnReaction("❤️"); });
  chan.on("broadcast", { event: "sys" }, (msg) => { if (_vliveDeLHote(msg.payload)) _vliveSysMsg((msg.payload || {}).text); });
  chan.on("broadcast", { event: "pause" }, (msg) => { if (_vliveDeLHote(msg.payload)) _vliveShowPaused(!!(msg.payload || {}).on, false); });
  // Rejeu de l'historique du chat à l'arrivée (envoyé par le host, ciblé).
  chan.on("broadcast", { event: "history" }, (msg) => {
    const d = msg.payload || {};
    if (d.to !== MY_UID || !Array.isArray(d.msgs) || !_vliveDeLHote(d)) return;
    d.msgs.forEach(m => _vliveChatMsg(m, true));
  });
  // ── RELAIS (scaling gratuit) ──
  // L'hôte est saturé : il m'a assigné à un spectateur-relais. J'attends son
  // roffer (rien à faire ici, informatif — le flux arrivera via roffer).
  chan.on("broadcast", { event: "assign" }, (msg) => {
    const d = msg.payload || {};
    if (d.to !== MY_UID || !_vliveDeLHote(d)) return;
    const V = window._vliveView;
    if (V) {
      // Le relais ATTENDU : seul lui pourra me servir (roffer). Une offre de
      // relais arrivée AVANT cet ordre est gardée et traitée maintenant.
      V.parentAttendu = d.parent || null;
      const enAttente = V.rofferEnAttente; V.rofferEnAttente = null;
      if (enAttente && enAttente.srv === V.parentAttendu) _vliveTraiterRoffer(enAttente);
    }
    const s = document.getElementById("vliveStatus");
    if (s && !((window._vliveView || {}).remoteStream)) s.textContent = "Connexion au direct…";
  });
  // Je reçois une OFFRE d'un spectateur-relais (je suis un enfant relayé).
  // ⚠️ Seul le relais que l'hôte m'a ASSIGNÉ peut me servir : sans cette garde,
  // n'importe quel spectateur substituait son flux au direct.
  chan.on("broadcast", { event: "roffer" }, async (msg) => {
    const V = window._vliveView;
    const d = msg.payload || {};
    if (!V || d.to !== MY_UID || !d.sdp || !d.srv || d.from !== d.srv) return;
    if (!V.parentAttendu) { V.rofferEnAttente = d; return; } // l'ordre `assign` n'est pas encore là
    if (d.srv !== V.parentAttendu) return;
    await _vliveTraiterRoffer(d);
  });
  // L'hôte me demande de RELAYER vers un enfant (je suis un spectateur direct).
  chan.on("broadcast", { event: "serve" }, (msg) => {
    const d = msg.payload || {};
    if (d.to !== MY_UID || !d.child || !_vliveDeLHote(d)) return;
    _vliveRelayServe(d.child);
  });
  async function _vliveTraiterRoffer(d) {
    const V = window._vliveView;
    if (!V) return;
    try {
      if (V.pc) { try { V.pc.close(); } catch (e) {} }
      assurerServeursIce(); // sans attente : retire des identifiants expirés, relance le renouvellement
      const pc = new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS });
      V.pc = pc; V.pendingIce = V.pendingIce || []; V.servedBy = d.srv;
      pc.ontrack = (e) => {
        V.remoteStream = e.streams[0];
        const rv = document.getElementById("vliveVideo");
        if (rv) { rv.srcObject = e.streams[0]; _vliveTryPlay(rv); }
      };
      pc.onicecandidate = (e) => { if (e.candidate) _vliveSend("rice", { to: d.srv, candidate: e.candidate }); };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "connected") { V._reconns = 0; const s = document.getElementById("vliveStatus"); if (s) s.textContent = ""; }
        if (st === "failed" && window._vliveView === V) _vliveViewerReconnect();
      };
      await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      _vliveSend("ranswer", { to: d.srv, sdp: pc.localDescription });
      (V.pendingIce || []).forEach(c => { try { pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {} });
      V.pendingIce = [];
      const stEl = document.getElementById("vliveStatus"); if (stEl) stEl.textContent = "";
    } catch (e) { console.warn("[vlive] ranswer:", e && e.message); }
  }
  // Réponse SDP d'un de mes enfants relayés.
  chan.on("broadcast", { event: "ranswer" }, async (msg) => {
    const V = window._vliveView;
    const d = msg.payload || {};
    if (!V || d.to !== MY_UID || !d.sdp || !d.from) return;
    const k = V.kids && V.kids[d.from];
    if (!k) return;
    try {
      await k.pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
      (k.pendingIce || []).forEach(c => { try { k.pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {} });
      k.pendingIce = [];
    } catch (e) {}
  });
  // ICE relais : vers MON parent-relais (V.pc) OU depuis un de MES enfants.
  chan.on("broadcast", { event: "rice" }, async (msg) => {
    const V = window._vliveView;
    const d = msg.payload || {};
    if (!V || d.to !== MY_UID || !d.candidate) return;
    if (d.from && d.from === V.servedBy) {
      try {
        if (!V.pc || !V.pc.remoteDescription || !V.pc.remoteDescription.type) (V.pendingIce = V.pendingIce || []).push(d.candidate);
        else await V.pc.addIceCandidate(new RTCIceCandidate(d.candidate));
      } catch (e) {}
      return;
    }
    const k = V.kids && V.kids[d.from];
    if (k) {
      try {
        if (!k.pc.remoteDescription || !k.pc.remoteDescription.type) (k.pendingIce = k.pendingIce || []).push(d.candidate);
        else await k.pc.addIceCandidate(new RTCIceCandidate(d.candidate));
      } catch (e) {}
    }
  });
  chan.on("presence", { event: "sync" }, () => { _vliveUpdateViewers(); });
  chan.on("presence", { event: "join" }, () => { _vliveUpdateViewers(); });
  chan.on("presence", { event: "leave" }, () => { _vliveUpdateViewers(); });
}

// ── Spectateur-RELAIS : je re-diffuse le flux reçu vers mes enfants ──
// Sert un enfant : si mon flux n'est pas encore arrivé, je le mets en file et je
// le sers dès réception (ontrack → _vliveFlushPendingKids).
function _vliveRelayServe(child) {
  const V = window._vliveView;
  if (!V || !child) return;
  if (!V.remoteStream) { V.pendingKids = V.pendingKids || []; if (V.pendingKids.indexOf(child) < 0) V.pendingKids.push(child); return; }
  V.kids = V.kids || {};
  if (V.kids[child]) { try { V.kids[child].pc.close(); } catch (e) {} delete V.kids[child]; }
  assurerServeursIce(); // sans attente : retire des identifiants expirés, relance le renouvellement
  const pc = new RTCPeerConnection({ iceServers: CALL_ICE_SERVERS });
  const entry = { pc: pc, pendingIce: [] };
  V.kids[child] = entry;
  (V.remoteStream.getTracks() || []).forEach(t => { try { pc.addTrack(t, V.remoteStream); } catch (e) {} });
  try { _callPreferVideoCodecs(pc); } catch (e) {}
  pc.onicecandidate = (e) => { if (e.candidate) _vliveSend("rice", { to: child, candidate: e.candidate }); };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if ((st === "failed" || st === "closed") && V.kids && V.kids[child] && V.kids[child].pc === pc) {
      try { pc.close(); } catch (e) {} delete V.kids[child];
    }
  };
  (async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription({ type: offer.type, sdp: _callTuneSdp(offer.sdp) });
      _vliveRelayLimitBitrate(pc);
      _vliveSend("roffer", { to: child, srv: MY_UID, sdp: pc.localDescription });
    } catch (e) { console.warn("[vlive] roffer:", e && e.message); }
  })();
}

// Flux enfin reçu → je sers les enfants en attente.
function _vliveFlushPendingKids() {
  const V = window._vliveView;
  if (!V || !V.pendingKids || !V.pendingKids.length) return;
  const q = V.pendingKids.slice();
  V.pendingKids = [];
  q.forEach(c => _vliveRelayServe(c));
}

// Plafonne le débit re-uploadé vers un enfant (uplink du spectateur limité).
async function _vliveRelayLimitBitrate(pc) {
  try {
    for (const sender of pc.getSenders()) {
      if (!sender.track) continue;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      if (sender.track.kind === "video") { params.encodings[0].maxBitrate = VLIVE_RELAY_BR; params.encodings[0].maxFramerate = 30; }
      else { params.encodings[0].maxBitrate = 96000; }
      try { await sender.setParameters(params); } catch (e) {}
    }
  } catch (e) {}
}

// Autoplay avec son : tenté d'abord (l'utilisateur vient de taper la bulle =
// geste utilisateur), replié en muet + bouton 🔊 si le navigateur refuse.
function _vliveTryPlay(v) {
  v.muted = false;
  const p = v.play();
  if (p && p.catch) p.catch(() => {
    v.muted = true;
    try { v.play(); } catch (e) {}
    const b = document.getElementById("vliveUnmuteBtn");
    if (b) b.style.display = "flex";
  });
}
function _vliveUnmute() {
  const v = document.getElementById("vliveVideo");
  if (v) { v.muted = false; try { v.play(); } catch (e) {} }
  const b = document.getElementById("vliveUnmuteBtn");
  if (b) b.style.display = "none";
}
window._vliveUnmute = _vliveUnmute;

function leaveVideoLive() {
  _vliveTeardown();
}
window.leaveVideoLive = leaveVideoLive;

// Reconnexion douce du spectateur après un échec de PeerConnection : on ferme
// la connexion morte et on re-signale sa présence pour que l'hôte ré-émette une
// offre. 2 tentatives max, sinon on considère le live perdu.
function _vliveViewerReconnect() {
  const V = window._vliveView;
  if (!V || !V.chan) return;
  V._reconns = (V._reconns || 0) + 1;
  if (V._reconns > 2) { _vliveShowEnded("Live interrompu"); return; }
  const st = document.getElementById("vliveStatus");
  if (st) st.textContent = "Reconnexion…";
  try { if (V.pc) { V.pc.close(); V.pc = null; } } catch (e) {}
  V.pendingIce = [];
  try {
    V.chan.untrack();
    setTimeout(() => { try { if (window._vliveView === V && V.chan) V.chan.track({ uid: MY_UID, role: "viewer", name: _callMyName() }); } catch (e) {} }, 400);
  } catch (e) {}
  // Filet : si toujours pas connecté au bout de 9 s, on abandonne.
  setTimeout(() => {
    if (window._vliveView === V && (!V.pc || V.pc.connectionState !== "connected")) {
      if ((V._reconns || 0) > 2) _vliveShowEnded("Live interrompu");
    }
  }, 9000);
}

// Fin côté spectateur : message puis fermeture douce.
function _vliveShowEnded(text) {
  const stEl = document.getElementById("vliveStatus");
  if (stEl) stEl.textContent = text;
  setTimeout(() => { if (window._vliveView) leaveVideoLive(); supaRefreshVideoLives(); }, 1800);
}

// ═══════════════ COMMUN (chat, cœurs, compteur, UI) ═══════════════
function _vliveUpdateViewers() {
  const chan = _vliveChan();
  const el = document.getElementById("vliveViewers");
  if (!chan || !el) return;
  try {
    const st = chan.presenceState() || {};
    let n = 0;
    Object.keys(st).forEach(k => { (st[k] || []).forEach(p => { if (p.role === "viewer") n++; }); });
    el.textContent = "👁 " + n;
    if (window._vliveHost) window._vliveHost.peak = Math.max(window._vliveHost.peak || 0, n);
  } catch (e) {}
}

function _vliveChatMsg(d, replay) {
  if (!d || !d.text) return;
  if (typeof isBlocked === "function" && isBlocked(d.from)) return;
  // Côté diffuseur : mémorise pour rejouer aux arrivants tardifs (sauf rejeu).
  if (window._vliveHost && !replay) {
    const H = window._vliveHost;
    H.chatLog = H.chatLog || [];
    H.chatLog.push({ from: d.from, name: d.name, text: d.text });
    if (H.chatLog.length > VLIVE_CHATLOG_MAX) H.chatLog.splice(0, H.chatLog.length - VLIVE_CHATLOG_MAX);
  }
  const list = document.getElementById("vliveChatList");
  if (!list) return;
  const div = document.createElement("div");
  div.className = "vlive-chat-msg";
  div.innerHTML = "<b>" + escapeHtml(d.name || "Quelqu'un") + "</b> " + escapeHtml(String(d.text).slice(0, 200));
  list.appendChild(div);
  while (list.children.length > 60) list.removeChild(list.firstChild);
  list.scrollTop = list.scrollHeight;
}

// Message système centré (arrivées, infos) — non stocké, non rejoué.
function _vliveSysMsg(text) {
  if (!text) return;
  const list = document.getElementById("vliveChatList");
  if (!list) return;
  const div = document.createElement("div");
  div.className = "vlive-chat-sys";
  div.textContent = String(text).slice(0, 120);
  list.appendChild(div);
  while (list.children.length > 60) list.removeChild(list.firstChild);
  list.scrollTop = list.scrollHeight;
}

function _vliveSendChat() {
  const inp = document.getElementById("vliveChatInput");
  if (!inp) return;
  const text = (inp.value || "").trim();
  if (!text) return;
  inp.value = "";
  const payload = { name: _callMyName(), text: text.slice(0, 200) };
  _vliveSend("chat", payload);
  // broadcast self:false → écho local manuel.
  _vliveChatMsg(Object.assign({ from: MY_UID }, payload));
}
window._vliveSendChat = _vliveSendChat;

// Réaction (une des emotes de VLIVE_REACTIONS) : diffuse + anime localement.
function _vliveReact(emoji) {
  const now = Date.now();
  if (window._vliveLastReact && now - window._vliveLastReact < 250) return; // anti-spam
  window._vliveLastReact = now;
  const e = VLIVE_REACTIONS.indexOf(emoji) >= 0 ? emoji : "❤️";
  _vliveSend("react", { emoji: e });
  _vliveSpawnReaction(e);
}
window._vliveReact = _vliveReact;

// Compat rétro : double-tap / anciens clients → cœur.
function _vliveHeart() { _vliveReact("❤️"); }
window._vliveHeart = _vliveHeart;

function _vliveSpawnReaction(emoji) {
  const layer = document.getElementById("vliveHearts");
  if (!layer) return;
  const el = document.createElement("div");
  el.className = "vlive-heart";
  el.textContent = (emoji && String(emoji).slice(0, 4)) || "❤️";
  el.style.left = (55 + Math.random() * 35) + "%";
  el.style.setProperty("--vlx", (Math.random() * 40 - 20) + "px");
  layer.appendChild(el);
  setTimeout(() => { try { layer.removeChild(el); } catch (e) {} }, 2600);
}

let _vliveTimerInt = null;
function _vliveStartTimer(startMs) {
  if (_vliveTimerInt) clearInterval(_vliveTimerInt);
  _vliveTimerInt = setInterval(() => {
    const t = document.getElementById("vliveTimer");
    if (!t) return;
    const s = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    t.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }, 1000);
}

// Micro on/off (diffuseur).
function toggleVliveMic(btn) {
  const H = window._vliveHost;
  if (!H || !H.stream) return;
  const tracks = H.stream.getAudioTracks();
  const on = tracks[0] && tracks[0].enabled;
  tracks.forEach(t => t.enabled = !on);
  if (btn) { btn.classList.toggle("off", on); btn.textContent = on ? "🔇" : "🎙"; }
}
window.toggleVliveMic = toggleVliveMic;

// Pause / reprise du direct (diffuseur) : gèle la vidéo + coupe le micro sans
// démonter les connexions (le live reste « vivant » ; les spectateurs voient un
// écran « en pause »). Reprise = réactive les pistes.
function toggleVlivePause(btn) {
  const H = window._vliveHost;
  if (!H || !H.stream) return;
  H.paused = !H.paused;
  const on = H.paused;
  try { (H.stream.getVideoTracks() || []).forEach(t => t.enabled = !on); } catch (e) {}
  try { (H.stream.getAudioTracks() || []).forEach(t => t.enabled = !on); } catch (e) {}
  _vliveSend("pause", { on: on });
  if (btn) { btn.classList.toggle("off", on); btn.textContent = on ? "▶️" : "⏸"; btn.setAttribute("aria-label", on ? "Reprendre" : "Mettre en pause"); }
  // Micro : si on reprend, remet le bouton micro cohérent (réactivé ci-dessus).
  const micBtn = btn && btn.parentElement && btn.parentElement.querySelector('[aria-label="Micro"]');
  if (micBtn && !on) { micBtn.classList.remove("off"); micBtn.textContent = "🎙"; }
  _vliveShowPaused(on, true);
  toast(on ? "⏸ Live en pause" : "▶️ Live repris");
}
window.toggleVlivePause = toggleVlivePause;

// Affiche/masque l'écran « en pause » (hôte : aperçu ; spectateur : sur réception).
function _vliveShowPaused(on, isHost) {
  const el = document.getElementById("vlivePaused");
  if (!el) return;
  el.querySelector("span").textContent = isHost ? "Live en pause (toi)" : "Le live est en pause";
  el.style.display = on ? "flex" : "none";
}

// Changement de caméra (diffuseur) : replaceTrack sur TOUTES les connexions.
async function flipVliveCamera() {
  const H = window._vliveHost;
  if (!H) return;
  const next = (H._facing || "user") === "user" ? "environment" : "user";
  let ns = null;
  try { ns = await navigator.mediaDevices.getUserMedia({ audio: false, video: Object.assign({ facingMode: { exact: next } }, VLIVE_VIDEO_QUALITY) }); }
  catch (e1) {
    try { ns = await navigator.mediaDevices.getUserMedia({ audio: false, video: Object.assign({ facingMode: next }, VLIVE_VIDEO_QUALITY) }); }
    catch (e2) { toast("Une seule caméra disponible"); return; }
  }
  const newTrack = ns.getVideoTracks()[0];
  if (!newTrack) return;
  H._facing = next;
  for (const vid in H.pcs) {
    const sender = H.pcs[vid].pc.getSenders().find(s => s.track && s.track.kind === "video");
    if (sender) { try { await sender.replaceTrack(newTrack); } catch (e) {} }
  }
  const old = H.stream.getVideoTracks()[0];
  if (old) { H.stream.removeTrack(old); old.stop(); }
  H.stream.addTrack(newTrack);
  _vliveApplyHostQuality();
  const lv = document.getElementById("vliveVideo");
  if (lv) { lv.srcObject = H.stream; lv.style.transform = next === "environment" ? "none" : "scaleX(-1)"; }
}
window.flipVliveCamera = flipVliveCamera;

// Démonte tout (diffuseur OU spectateur) : pistes, connexions, canal, UI.
function _vliveTeardown() {
  const H = window._vliveHost;
  if (H) {
    if (H.hb) clearInterval(H.hb);
    try { ((H.stream && H.stream.getTracks()) || []).forEach(t => t.stop()); } catch (e) {}
    for (const vid in H.pcs) { try { H.pcs[vid].pc.close(); } catch (e) {} }
    try { if (H.chan) { H.chan.untrack(); supa.removeChannel(H.chan); } } catch (e) {}
  }
  const V = window._vliveView;
  if (V) {
    try { if (V.pc) V.pc.close(); } catch (e) {}
    // Ferme mes connexions d'enfants relayés le cas échéant.
    if (V.kids) { for (const c in V.kids) { try { V.kids[c].pc.close(); } catch (e) {} } }
    try { if (V.chan) { V.chan.untrack(); supa.removeChannel(V.chan); } } catch (e) {}
  }
  window._vliveHost = null;
  window._vliveView = null;
  if (_vliveTimerInt) { clearInterval(_vliveTimerInt); _vliveTimerInt = null; }
  _vliveCloseUI();
}

// ── UI plein écran ──
function _vliveOverlayEl() {
  let el = document.getElementById("vliveOverlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "vliveOverlay";
    el.className = "vlive-overlay";
    document.body.appendChild(el);
  }
  return el;
}
function _vliveCloseUI() {
  window._appelLanceA = null;
  const el = document.getElementById("vliveOverlay");
  if (el) { el.classList.remove("active"); el.innerHTML = ""; }
}

function _vliveRenderUI(mode, row) {
  const el = _vliveOverlayEl();
  const isHost = mode === "host";
  const name = isHost ? "Toi" : ((row && row.author_name) || "Live");
  const title = (row && row.title) || (isHost && window._vliveHost && window._vliveHost.title) || "";
  const authorId = (row && row.author_id) || "";
  const iFollow = !isHost && authorId && (typeof etatSuivi === "function" ? etatSuivi(authorId) !== "aucun" : (state.user && (state.user.following || []).includes(authorId)));
  const canFollow = !isHost && authorId && authorId !== MY_UID;

  const reactionRail = VLIVE_REACTIONS.map(e =>
    '<button class="vlive-react-btn" onclick="_vliveReact(\'' + escapeJsArg(e) + '\')" aria-label="Réagir ' + escapeHtml(e) + '">' + escapeHtml(e) + '</button>'
  ).join("");

  el.innerHTML =
    '<video id="vliveVideo" class="vlive-video' + (isHost ? " mirror" : "") + '" autoplay playsinline' + (isHost ? " muted" : "") +
      (isHost ? "" : ' ondblclick="_vliveHeart()"') + '></video>' +
    '<div class="vlive-topbar">' +
      '<span class="vlive-badge">🔴 EN DIRECT</span>' +
      '<span class="vlive-chip" id="vliveViewers">👁 0</span>' +
      '<span class="vlive-chip" id="vliveTimer">00:00</span>' +
      '<span class="vlive-name">' + escapeHtml(name) + '</span>' +
      // ⚠️ CINQUIÈME SURFACE, et c'est celle qui rouvrait le défaut au PREMIER
      // RENDU : `iFollow` (« ≠ aucun ») donnait la classe `.on` — le visuel d'un
      // abonnement acquis — à une demande qui attend encore. `_vlivePeindreSuivi`
      // corrige la conflation, mais il n'a d'appelant que `_vliveToggleFollow` :
      // quitter le live et y revenir repeignait l'état faux, et le tap suivant
      // détruisait la demande. Le gabarit lit donc les MÊMES autorités.
      (canFollow ? '<button class="vlive-follow' + (_vliveEtatSuivi(authorId) === "suivi" ? " on" : "") + '" id="vliveFollowBtn"'
        + ((typeof aideBoutonSuivi === "function") ? ' title="' + escapeHtml(aideBoutonSuivi(authorId)) + '" aria-label="' + escapeHtml(aideBoutonSuivi(authorId)) + '"' : "")
        + (_vliveEtatSuivi(authorId) === "attente" ? ' style="box-shadow:inset 0 0 0 1px rgba(255,255,255,0.85);"' : "")
        + ' onclick="_vliveToggleFollow()">' + ((typeof libelleBoutonSuivi === "function") ? escapeHtml(libelleBoutonSuivi(authorId)) : (iFollow ? "✓ Suivi" : "Suivre")) + '</button>' : "") +
      '<button class="vlive-icon-btn" onclick="_vliveShare()" aria-label="Partager le live">↗</button>' +
      '<button class="vlive-close" onclick="' + (isHost ? "endVideoLive()" : "leaveVideoLive()") + '" aria-label="Quitter">✕</button>' +
    '</div>' +
    (title ? '<div class="vlive-title-pill">' + escapeHtml(title) + '</div>' : "") +
    '<div class="vlive-status" id="vliveStatus">' + (isHost ? "" : "Connexion au direct…") + '</div>' +
    '<div class="vlive-paused" id="vlivePaused" style="display:none;">⏸<span>Le live est en pause</span></div>' +
    '<div class="vlive-hearts" id="vliveHearts"></div>' +
    '<button id="vliveUnmuteBtn" class="vlive-unmute" style="display:none;" onclick="_vliveUnmute()">🔊 Activer le son</button>' +
    '<div class="vlive-bottom">' +
      '<div class="vlive-chat-list" id="vliveChatList" aria-live="polite"></div>' +
      (isHost ? "" : '<div class="vlive-react-rail">' + reactionRail + '</div>') +
      '<div class="vlive-chat-bar">' +
        '<input id="vliveChatInput" placeholder="Commenter…" maxlength="200" autocomplete="off"' +
          ' onkeydown="if(event.key===&quot;Enter&quot;){_vliveSendChat();}"/>' +
        '<button class="vlive-bar-btn" onclick="_vliveSendChat()" aria-label="Envoyer">➤</button>' +
        (isHost
          ? '<button class="vlive-bar-btn" id="vlivePauseBtn" onclick="toggleVlivePause(this)" aria-label="Mettre en pause">⏸</button>' +
            '<button class="vlive-bar-btn" onclick="toggleVliveMic(this)" aria-label="Micro">🎙</button>' +
            '<button class="vlive-bar-btn" onclick="flipVliveCamera()" aria-label="Changer de caméra">🔄</button>'
          : '<button class="vlive-bar-btn heart" onclick="_vliveHeart()" aria-label="Envoyer un cœur">❤️</button>') +
      '</div>' +
    '</div>';
  el.classList.add("active");
}

// Suivre / ne plus suivre l'hôte depuis l'overlay spectateur.
function _vliveToggleFollow() {
  const V = window._vliveView;
  if (!V || !V.row) return;
  const aid = V.row.author_id;
  if (!aid || aid === MY_UID) return;
  state.user.following = state.user.following || [];
  state.user.followingPending = state.user.followingPending || [];
  const prenom = (V.row.author_name || "cet utilisateur").split(" ")[0];
  // Même contrat que `toggleFollowUser` (app-04) : TROIS états, affichage
  // optimiste puis CORRIGÉ au verdict serveur, retour arrière sur un refus
  // explicite (`ok: false` — blocage, débit). Ce second appelant de
  // `supaFollowUser` ignorait tout verdict (relecture audit-passio, 2026-09-11).
  const etat = (typeof etatSuivi === "function") ? etatSuivi(aid) : (state.user.following.includes(aid) ? "suivi" : "aucun");
  if (etat === "attente") {
    state.user.followingPending = state.user.followingPending.filter(id => id !== aid);
    _vlivePeindreSuivi(aid);
    toast("Demande annulée — appuie sur « Suivre » pour la renvoyer");
    // ⚠️ LE VERDICT SE LIT SUR LE GESTE DESTRUCTEUR, ici comme dans app-04 :
    // un DELETE refusé laissait l'écran annoncer une annulation qui n'a pas eu lieu.
    if (typeof supaUnfollowUser === "function") {
      Promise.resolve(supaUnfollowUser(aid)).then(function (r) {
        if (!r || r.ok !== false) return;
        if (state.user.followingPending.indexOf(aid) < 0) state.user.followingPending.push(aid);
        _vlivePeindreSuivi(aid);
        toast("Annulation non enregistrée — ta demande est toujours en cours");
        try { saveState(); } catch (e) {}
      }).catch(function () {});
    }
  } else if (etat === "aucun") {
    state.user.following.push(aid);
    _vlivePeindreSuivi(aid);
    toast("Tu suis " + prenom + " !");
    if (typeof supaFollowUser === "function") {
      Promise.resolve(supaFollowUser(aid)).then(function (r) {
        if (r && r.ok === false) {
          state.user.following = (state.user.following || []).filter(id => id !== aid);
          _vlivePeindreSuivi(aid);
          toast("Impossible de suivre " + prenom + " pour le moment");
        } else if (r && r.status === "pending") {
          // ⚠️ MÊME TEST QUE `toggleFollowUser` (app-04), délibérément. Tester
          // « ≠ accepted » rétrograderait l'optimiste sur un verdict NON EXPLICITE
          // (`r === true`, objet sans `status`) : les deux appelants de
          // `supaFollowUser` traiteraient le même signal en sens opposé, et
          // celui-ci changerait d'état EN L'ABSENCE de preuve.
          state.user.following = (state.user.following || []).filter(id => id !== aid);
          if (state.user.followingPending.indexOf(aid) < 0) state.user.followingPending.push(aid);
          _vlivePeindreSuivi(aid);
          toast("Demande envoyée à " + prenom);
        } else return;
        try { saveState(); } catch (e) {}
      });
    }
  } else {
    state.user.following = state.user.following.filter(id => id !== aid);
    _vlivePeindreSuivi(aid);
    if (typeof supaUnfollowUser === "function") supaUnfollowUser(aid);
  }
  try { saveState(); } catch (e) {}
}
// Lecture unique de l'état de suivi pour l'overlay live : le gabarit et la
// repeinte doivent répondre la MÊME chose, sinon le premier rendu et le tap
// divergent — c'est très exactement ce qui rouvrait le défaut ici.
function _vliveEtatSuivi(aid) {
  return (typeof etatSuivi === "function") ? etatSuivi(aid) : "aucun";
}

function _vlivePeindreSuivi(aid) {
  const btn = document.getElementById("vliveFollowBtn");
  if (!btn) return;
  const etat = _vliveEtatSuivi(aid);
  btn.textContent = (typeof libelleBoutonSuivi === "function") ? libelleBoutonSuivi(aid) : (etat === "suivi" ? "✓ Suivi" : "Suivre");
  // ⚠️ TROIS ÉTATS, TROIS ASPECTS (2026-09-22). `classList.toggle("on", etat !== "aucun")`
  // donnait à « Demande envoyée » la MÊME classe qu'à « ✓ Suivi » — donc le visuel
  // d'un abonnement acquis pour une demande qui attend encore. Même conflation que
  // celle corrigée sur le profil visité, ici sur l'overlay d'un live.
  btn.classList.toggle("on", etat === "suivi");
  // L'aspect d'« attente » est posé EN LIGNE : `styles.css` est en CRLF et son
  // bloc UI-4A5 doit rester le dernier ; une règle de plus n'apporterait rien.
  btn.style.boxShadow = (etat === "attente") ? "inset 0 0 0 1px rgba(255,255,255,0.85)" : "";
  var aide = (typeof aideBoutonSuivi === "function") ? aideBoutonSuivi(aid) : "";
  if (aide) { btn.setAttribute("title", aide); btn.setAttribute("aria-label", aide); }
  else { btn.removeAttribute("title"); btn.removeAttribute("aria-label"); }
}
window._vliveToggleFollow = _vliveToggleFollow;

// Partager le live : lien profond ?live=<id> (natif sur mobile, presse-papiers sinon).
function _vliveShare() {
  const s = window._vliveHost || window._vliveView;
  if (!s) return;
  const id = s.id;
  const who = (window._vliveHost ? _callMyName() : ((s.row && s.row.author_name) || "")).split(" ")[0];
  const title = (window._vliveHost && s.title) || (s.row && s.row.title) || "";
  const rawUrl = location.origin + "/?live=" + encodeURIComponent(id);
  const url = (window.tel && tel.shareLink) ? tel.shareLink(rawUrl, "live", id, navigator.share ? "native" : "clipboard") : rawUrl;
  const txt = "🔴 " + (who ? who + " est en direct" : "En direct") + (title ? " : " + title : "") + " sur PASSIO";
  try {
    partagerOuCopier({ title: "PASSIO — Live", text: txt, url: url }, "Lien du live copié"); return;
  } catch (e) {}
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt + "\n" + url).then(() => toast("Lien du live copié"), () => montrerLienACopier(url));
  } else { montrerLienACopier(url); }
}
window._vliveShare = _vliveShare;
