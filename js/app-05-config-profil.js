
const BORDER_RADIUS = [
  { id: "square", name: "Carré", val: "6px" },
  { id: "round", name: "Arrondi", val: "14px" },
  { id: "pill", name: "Pilule", val: "24px" },
];

const DEFAULT_NAV_ORDER = ["feed","bobines","explore","studio","messages","irl","cdv"];
const NAV_LABELS = { feed:"🏠 Fil", bobines:"🎬 Bobines", explore:"🔍 Explorer", studio:"➕ Créer", messages:"💬 Messages", irl:"🤝 IRL", cdv:"📔 CDV" };

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
      root.style.setProperty("--warning", c.accent);
      // Override CSS pour les couleurs hardcodées dans le HTML/JS
      var colorOverride = document.getElementById("passio-color-override");
      if (!colorOverride) { colorOverride = document.createElement("style"); colorOverride.id = "passio-color-override"; document.head.appendChild(colorOverride); }
      colorOverride.textContent = "\
        .app-shell { background: radial-gradient(circle at 50% -6%, rgba(" + c.shadow + ",0.16), transparent 58%), " + c.bgSoft + " !important; }\
        .topbar { background: linear-gradient(135deg, " + c.accent + " 0%, " + c.c3 + " 100%) !important; border-bottom-color: rgba(255,255,255,0.12) !important; }\
        .brand-name { color: #fff !important; }\
        .brand-tagline { color: rgba(255,255,255,0.82) !important; }\
        .brand-logo { background: rgba(255,255,255,0.92) !important; box-shadow: 0 0 0 1.5px rgba(255,255,255,0.4), 0 4px 12px rgba(0,0,0,0.18) !important; }\
        .topbar-chip, .topbar-chip.score, .topbar-chip.passia { background: rgba(255,255,255,0.16) !important; border-color: rgba(255,255,255,0.30) !important; color: #fff !important; }\
        .topbar-bell { background: rgba(255,255,255,0.16) !important; border-color: rgba(255,255,255,0.30) !important; color: #fff !important; }\
        .nav-item.active { color: " + c.accent + " !important; }\
        .btn.primary { background: linear-gradient(135deg, " + c.accent + ", " + c.c3 + ") !important; }\
        .pill.active { background: " + c.accent + " !important; }\
        .mood-btn.active .mood-btn-icon { border-color: " + c.accent + " !important; box-shadow: 0 0 0 3px rgba(" + c.shadow + ",0.18) !important; }\
        .profile-tile.active .profile-tile-avatar { box-shadow: 0 4px 18px rgba(" + c.shadow + ",0.45) !important; }\
        .story-ring:not(.seen):not(.create) { background: linear-gradient(135deg, " + c.accent + ", " + c.c3 + ") !important; }\
        .kpi.score .kpi-value { color: " + c.accent + " !important; }\
        .kpi.passia .kpi-value { color: " + c.c2 + " !important; }\
        .landing { background: radial-gradient(circle at 12% 6%, rgba(" + c.shadow + ",0.18), transparent 52%), radial-gradient(circle at 88% 92%, rgba(" + c.shadow + ",0.14), transparent 55%), " + c.bgDeep + " !important; }\
        .onboarding-shell { background: radial-gradient(circle at 16% 10%, rgba(" + c.shadow + ",0.18), transparent 54%), radial-gradient(circle at 84% 90%, rgba(" + c.shadow + ",0.14), transparent 56%), " + c.bgDeep + " !important; }\
        .link { color: " + c.accent + " !important; }\
        .main-profile-avatar { background: linear-gradient(135deg, " + c.c4 + ", " + c.c2 + ") !important; }\
        .main-profile-cover { background: linear-gradient(135deg, " + c.c5 + " 0%, " + c.accent + " 50%, " + c.c3 + " 100%) !important; }\
      ";
      if (c.dark) {
        root.style.setProperty("--text", "#e2e8f0");
        root.style.setProperty("--text-dim", "#cbd5e1");
        root.style.setProperty("--muted", "#94a3b8");
        root.style.setProperty("--muted-2", "#64748b");
        root.style.setProperty("--bg-card", "rgba(30,27,75,0.92)");
        document.body.style.background = c.bgSoft;
      } else {
        root.style.removeProperty("--text");
        root.style.removeProperty("--text-dim");
        root.style.removeProperty("--muted");
        root.style.removeProperty("--muted-2");
        root.style.removeProperty("--bg-card");
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
      rdStyle.textContent = ".btn, .input, .textarea, .pill, .post-card, .msg-card, .cdv-feed-card, .cdv-live-card, .profile-card, .main-profile-card, .main-profile-cover, .main-profile-stats, .main-profile-stat, .main-profile-edit-btn, .main-profile-rs-link, .modal, .tour-card, .new-group-btn, .kpi, .upload-zone, .landing-pillar, .conv-bubble, .cdv-mode-card, .passion-tile, .notif-card, .quest-card, .cdv-live-step, .mood-btn-icon, .topbar-chip, .config-color-option, .msg-readfilter-btn, .story-ring, .story-inner { border-radius: " + r.val + " !important; } .avatar, .main-profile-avatar, .profile-tile-avatar, .msg-avatar, .msg-user-result-avatar, .passion-photo-badge, .main-profile-avatar-badge, .profile-general-avatar { border-radius: " + r.val + " !important; }";
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

function openConfigurator() {
  // Pré-charger TOUTES les Google Fonts immédiatement
  var fontsToLoad = [];
  FONT_FAMILIES.forEach(function(f) {
    if (f.url) {
      var existing = document.querySelector('link[href="' + f.url + '"]');
      if (!existing) {
        var link = document.createElement("link"); link.rel = "stylesheet"; link.href = f.url;
        document.head.appendChild(link);
        fontsToLoad.push(f.family.replace(/'/g, ""));
      }
    }
  });

  var cfg = getCurrentConfig();
  var accentNow = cfg.accent || "violet";
  var fontFamilyNow = cfg.fontFamily || "default";
  var fontSizeNow = cfg.fontSize || "medium";
  var radiusNow = cfg.radius || "round";

  var accentHTML = ACCENT_COLORS.map(function(c) {
    return '<div onclick="setConfig(\'accent\',\'' + c.id + '\')" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:2px solid ' + (c.id === accentNow ? c.accent : 'transparent') + ';background:' + (c.id === accentNow ? c.bgDeep : 'var(--bg-card)') + ';margin-bottom:6px;transition:all 0.15s;"><div style="width:36px;height:36px;border-radius:10px;background:' + c.grad1 + ';flex-shrink:0;"></div><div style="font-weight:700;font-size:13px;">' + c.emoji + ' ' + c.name + '</div>' + (c.id === accentNow ? '<div style="margin-left:auto;font-size:16px;">✓</div>' : '') + '</div>';
  }).join("");

  var currentFF = FONT_FAMILIES.find(function(f) { return f.id === fontFamilyNow; }) || FONT_FAMILIES[0];

  var fontFamilyHTML = '<div style="margin-bottom:16px;">\
    <div id="fontDropdown" onclick="toggleFontDropdown()" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;border:2px solid var(--accent);background:var(--bg-deep);transition:all 0.15s;">\
      <div style="font-family:' + currentFF.family + ';font-size:16px;font-weight:800;flex:1;color:var(--text);">' + currentFF.name + '</div>\
      <span style="font-size:14px;color:var(--muted);" id="fontDropdownArrow">▼</span>\
    </div>\
    <div id="fontDropdownList" style="display:none;margin-top:6px;border:1.5px solid var(--border);border-radius:14px;background:var(--bg-card);overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.12);max-height:300px;overflow-y:auto;"></div>\
  </div>';

  var fontSizeHTML = FONT_SIZES.map(function(f) {
    return '<div onclick="setConfig(\'fontSize\',\'' + f.id + '\')" style="cursor:pointer;text-align:center;padding:12px 8px;border-radius:12px;border:2px solid ' + (f.id === fontSizeNow ? 'var(--accent)' : 'transparent') + ';background:' + (f.id === fontSizeNow ? 'var(--bg-deep)' : 'var(--bg-card)') + ';transition:all 0.15s;"><div style="font-size:' + (f.px+4) + 'px;font-weight:800;margin-bottom:4px;">Aa</div><div style="font-size:10px;color:var(--muted);">' + f.name + '</div></div>';
  }).join("");

  var radiusHTML = BORDER_RADIUS.map(function(r) {
    return '<div onclick="setConfig(\'radius\',\'' + r.id + '\')" style="cursor:pointer;text-align:center;padding:12px 8px;border-radius:' + r.val + ';border:2px solid ' + (r.id === radiusNow ? 'var(--accent)' : 'transparent') + ';background:' + (r.id === radiusNow ? 'var(--bg-deep)' : 'var(--bg-card)') + ';transition:all 0.15s;"><div style="width:32px;height:32px;background:var(--accent);border-radius:' + r.val + ';margin:0 auto 6px;"></div><div style="font-size:10px;color:var(--muted);">' + r.name + '</div></div>';
  }).join("");

  var html = '\
    <div class="modal-handle"></div>\
    <span class="modal-close" onclick="closeModal()">×</span>\
    <div style="text-align:center;margin-bottom:16px;">\
      <div style="font-size:32px;margin-bottom:6px;">🎨</div>\
      <div style="font-weight:800;font-size:18px;color:var(--text);">Configurateur</div>\
      <div style="font-size:12px;color:var(--muted);">Personnalise PASSIO à ton image</div>\
    </div>\
    <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:10px;">🎨 Thème de couleur</div>\
    <div style="margin-bottom:16px;">' + accentHTML + '</div>\
    <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:10px;">✍️ Police d\'écriture <span style="font-size:10px;color:var(--muted);font-weight:400;">glisse pour voir</span></div>\
    ' + fontFamilyHTML + '\
    <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:10px;">🔤 Taille du texte</div>\
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">' + fontSizeHTML + '</div>\
    <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:10px;">⬜ Style des coins</div>\
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">' + radiusHTML + '</div>\
    <div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:10px;">📱 Disposition des onglets</div>\
    <div style="font-size:11px;color:var(--muted);margin-bottom:10px;">Maintiens et glisse pour réorganiser</div>\
    <div id="navOrderList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;"></div>\
    <button class="btn primary block" onclick="closeModal();toast(\'✨ Configuration appliquée !\');" style="margin-top:10px;">Appliquer</button>\
    <button class="btn ghost block" onclick="resetConfig()" style="margin-top:6px;font-size:12px;">🔄 Réinitialiser tout</button>\
  ';
  openModal(html);
  setTimeout(renderNavOrderList, 50);
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
    return '<div class="nav-order-item" draggable="true" data-nav-id="' + id + '" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:12px;cursor:grab;user-select:none;touch-action:none;"><span style="font-size:14px;color:var(--muted);font-weight:800;width:20px;text-align:center;">' + (i+1) + '</span><span style="flex:1;font-weight:700;font-size:13px;">' + (NAV_LABELS[id]||id) + '</span><span style="font-size:16px;color:var(--muted);cursor:grab;">☰</span></div>';
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
    var ty = 0;
    item.addEventListener("touchstart", function(e) { dragSrc = this; ty = e.touches[0].clientY; this.style.opacity = "0.6"; });
    item.addEventListener("touchmove", function(e) { e.preventDefault(); });
    item.addEventListener("touchend", function(e) {
      this.style.opacity = "1"; var d = e.changedTouches[0].clientY - ty;
      var newOrd = getNavOrder(); var idx = newOrd.indexOf(this.dataset.navId);
      if (d < -30 && idx > 0) { var m = newOrd.splice(idx,1)[0]; newOrd.splice(idx-1,0,m); setConfig("navOrder",newOrd); applyNavOrder(); }
      else if (d > 30 && idx < newOrd.length-1) { var m = newOrd.splice(idx,1)[0]; newOrd.splice(idx+1,0,m); setConfig("navOrder",newOrd); applyNavOrder(); }
    });
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

// Démarre un appel (audio ou vidéo) — mode démo, pas de vrai WebRTC en MVP
let callTimerInterval = null;
function startCall(convId, kind) {
  const convs = getConversations();
  const c = convs.find(x => x.id === convId);
  if (!c) return;
  const u = (state.seed.users || []).find(x => x.id === c.userId) || { name: "Inconnu", avatar: "#7c3aed", profileEmoji: "🙂" };

  const html = `
    <div class="modal-handle"></div>
    <div class="call-modal">
      ${kind === "video" ? `<div class="call-video-preview">${u.profileEmoji} ${escapeHtml(u.name)}</div>` : ""}
      <div class="msg-avatar" style="background:${avatarBg(u)};width:80px;height:80px;font-size:34px;margin:0 auto 10px;">${avatarInner(u)}</div>
      <div class="call-name">${escapeHtml(u.name)}</div>
      <div class="call-status">${kind === "video" ? "Appel vidéo en cours…" : "Appel audio en cours…"}</div>
      <div class="call-timer" id="callTimer">00:00</div>
      <div class="call-controls">
        <button class="call-control-btn mute" onclick="toast('Micro coupé')">🎙</button>
        ${kind === "video" ? '<button class="call-control-btn video" onclick="toast(\'Caméra coupée\')">📷</button>' : ''}
        <button class="call-control-btn hangup" onclick="endCall()">📞</button>
      </div>
      <p style="font-size:11px;color:var(--muted);text-align:center;margin-top:14px;font-style:italic;">Mode démo.</p>
    </div>
  `;
  openModal(html);

  // Timer
  let seconds = 0;
  if (callTimerInterval) clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    seconds++;
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    const t = document.getElementById("callTimer");
    if (t) t.textContent = `${m}:${s}`;
  }, 1000);
}

function endCall() {
  if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
  closeModal();
  toast("Appel terminé");
}

// Création de groupe (conversation multi-utilisateurs)
function toggleGroupUser(el) {
  el.classList.toggle("selected");
  const cb = el.querySelector("input[type=checkbox]");
  if (cb) cb.checked = el.classList.contains("selected");
  const check = el.querySelector(".grp-check");
  if (check) check.textContent = el.classList.contains("selected") ? "✓" : "";
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

function openCreateGroup() {
  const seedUsers = state.seed.users || [];
  // Uniquement les passions des profils créés par l'utilisateur
  const myPassionIds = (state.user.profiles || []).map(pr => pr.passion).filter(Boolean);
  const passions = allPassions().filter(p => myPassionIds.includes(p.id));
  const userOptions = seedUsers.slice(0, 10).map(u =>
    `<div class="group-user-option" data-uid="${u.id}" onclick="toggleGroupUser(this)">
      <input type="checkbox" value="${u.id}" />
      <span class="msg-avatar" style="background:${avatarBg(u)};width:36px;height:36px;font-size:18px;flex-shrink:0;">${avatarInner(u)}</span>
      <span style="flex:1;font-size:13px;">${escapeHtml(u.name)}</span>
      <span class="grp-check"></span>
    </div>`
  ).join("");
  const passionOptions = passions.map(p =>
    `<div class="group-passion-option" data-pid="${p.id}" onclick="toggleGroupPassion(this)">
      <input type="checkbox" value="${p.id}" />
      <span>${p.emoji} ${escapeHtml(p.label)}</span>
    </div>`
  ).join("");

  const html = `
    <div class="modal-handle"></div>
    <span class="modal-close" onclick="closeModal()">×</span>
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
    <div class="group-user-list">${userOptions}</div>

    <button class="btn primary block" onclick="confirmCreateGroup()" style="margin-top:14px;">Créer le groupe</button>
  `;
  openModal(html);
}

async function confirmCreateGroup() {
  const nameInput = document.getElementById("groupName");
  const name = (nameInput && nameInput.value || "").trim();
  if (!name) { toast("Donne un nom au groupe"); return; }
  const selectedPassions = [...document.querySelectorAll(".group-passion-option.selected input")].map(i => i.value);
  const selectedUsers = [...document.querySelectorAll(".group-user-option.selected input")].map(i => i.value);
  if (selectedPassions.length === 0) { toast("Choisis au moins 1 passion"); return; }
  if (selectedUsers.length === 0) { toast("Sélectionne au moins 1 membre"); return; }

  let groupId = "conv_grp_" + uid();

  // Créer le groupe dans Supabase si connecté
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID) {
    try {
      const supaId = await supaCreateGroup(name, selectedUsers, selectedPassions[0]);
      if (supaId) groupId = supaId;
    } catch(e) {}
  }

  const convs = getConversations();
  const welcomeMsgId = "msg_" + uid();
  const newConv = {
    id: groupId,
    isGroup: true,
    groupName: name,
    groupPassions: selectedPassions,
    userIds: selectedUsers,
    userId: selectedUsers[0],
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
      supa.from("conv_messages").insert({ id: welcomeMsgId, conv_id: groupId, from_id: MY_UID, content: newConv.messages[0].text, created_at: new Date().toISOString() }).then(() => {}).catch(() => {});
    } catch(e) {}
  }

  closeModal();
  renderMessages();
  toast(`✨ Groupe « ${name} » créé`);
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
  var memberIds = c.userIds || [];

  var membersHTML = '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">' +
    '<div style="width:40px;height:40px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:18px;">😊</div>' +
    '<div style="flex:1;"><div style="font-weight:700;font-size:13px;">Toi</div><div style="font-size:11px;color:var(--muted);">Admin · En ligne</div></div>' +
    '<span style="font-size:10px;font-weight:700;color:var(--accent);background:var(--bg-deep);padding:3px 8px;border-radius:6px;">Admin</span>' +
  '</div>';

  membersHTML += memberIds.map(function(uid) {
    var u = seedUsers.find(function(x) { return x.id === uid; });
    if (!u) return '';
    var passion = passionById(u.passion);
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">' +
      '<div style="width:40px;height:40px;border-radius:50%;background:' + avatarBg(u) + ';display:flex;align-items:center;justify-content:center;font-size:18px;">' + avatarInner(u) + '</div>' +
      '<div style="flex:1;">' +
        '<div style="font-weight:700;font-size:13px;">' + escapeHtml(u.name) + '</div>' +
        '<div style="font-size:11px;color:var(--muted);">' + (passion ? passion.emoji + ' ' + passion.label : '') + '</div>' +
      '</div>' +
      '<button class="btn ghost" style="font-size:10px;padding:5px 10px;color:#ef4444;border-color:rgba(239,68,68,0.3);" onclick="removeGroupMember(\'' + convId + '\',\'' + uid + '\')">Retirer</button>' +
    '</div>';
  }).join("");

  var passionsHTML = (c.groupPassions || [c.passion]).map(function(pid) {
    var p = passionById(pid);
    return p ? '<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--bg-deep);border-radius:8px;font-size:11px;font-weight:700;">' + p.emoji + ' ' + p.label + '</span>' : '';
  }).join(" ");

  // Utilisateurs non encore membres
  var nonMembers = seedUsers.filter(function(u) { return !memberIds.includes(u.id); });

  function buildNonMembersHTML(filter) {
    var filtered = filter ? nonMembers.filter(function(u) {
      return u.name.toLowerCase().includes(filter.toLowerCase());
    }) : nonMembers;
    if (nonMembers.length === 0) return '<div style="font-size:12px;color:var(--muted);padding:8px 0;">Tous les utilisateurs sont déjà membres.</div>';
    if (filtered.length === 0) return '<div style="font-size:12px;color:var(--muted);padding:8px 0;">Aucun résultat.</div>';
    return filtered.map(function(u) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:' + avatarBg(u) + ';display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">' + avatarInner(u) + '</div>' +
        '<span style="flex:1;font-size:13px;font-weight:600;">' + escapeHtml(u.name) + '</span>' +
        '<button class="btn primary" style="font-size:11px;padding:5px 12px;" onclick="addGroupMember(\'' + convId + '\',\'' + u.id + '\')">+ Ajouter</button>' +
      '</div>';
    }).join("");
  }

  // Avatar groupe (photo ou emoji)
  var grpAvatarHTML;
  if (c.groupPhoto) {
    grpAvatarHTML = '<div style="position:relative;width:72px;height:72px;margin:0 auto 12px;cursor:pointer;" onclick="pickGroupPhoto(\'' + convId + '\')">' +
      '<div style="width:72px;height:72px;border-radius:50%;background:url(' + c.groupPhoto + ') center/cover;border:3px solid var(--accent);"></div>' +
      '<div style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid var(--bg-card);">📷</div>' +
    '</div>';
  } else {
    grpAvatarHTML = '<div style="position:relative;width:72px;height:72px;margin:0 auto 12px;cursor:pointer;" onclick="pickGroupPhoto(\'' + convId + '\')">' +
      '<div style="width:72px;height:72px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:32px;">👥</div>' +
      '<div style="position:absolute;bottom:0;right:0;width:24px;height:24px;border-radius:50%;background:var(--bg-deep);display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid var(--bg-card);">📷</div>' +
    '</div>';
  }

  openModal(
    '<div class="modal-handle"></div>' +
    grpAvatarHTML +
    '<div class="modal-title" style="margin-top:0;">👥 ' + escapeHtml(c.groupName || "Groupe") + '</div>' +
    '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;">' + (memberIds.length + 1) + ' membre' + (memberIds.length + 1 > 1 ? 's' : '') + '</div>' +
    '<div style="margin-bottom:12px;">' + passionsHTML + '</div>' +
    // Onglets
    '<div style="display:flex;gap:0;margin-bottom:14px;border-bottom:2px solid var(--border);">' +
      '<button id="grpTab_members" onclick="switchGroupTab(\'members\')" style="flex:1;background:none;border:none;padding:8px 0;font-size:13px;font-weight:700;color:var(--accent);border-bottom:2px solid var(--accent);margin-bottom:-2px;cursor:pointer;">Membres (' + (memberIds.length + 1) + ')</button>' +
      '<button id="grpTab_add" onclick="switchGroupTab(\'add\')" style="flex:1;background:none;border:none;padding:8px 0;font-size:13px;font-weight:700;color:var(--muted);cursor:pointer;">Ajouter</button>' +
    '</div>' +
    // Panneau Membres
    '<div id="grpPanel_members" style="display:block;">' +
      '<div style="max-height:280px;overflow-y:auto;">' + membersHTML + '</div>' +
    '</div>' +
    // Panneau Ajouter
    '<div id="grpPanel_add" style="display:none;">' +
      '<div style="position:relative;margin-bottom:10px;">' +
        '<span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px;pointer-events:none;">🔍</span>' +
        '<input id="grpSearchInput" type="text" placeholder="Rechercher un utilisateur..." oninput="filterGroupAddList(this.value)" ' +
          'style="width:100%;box-sizing:border-box;padding:9px 12px 9px 34px;border-radius:12px;border:1px solid var(--border);background:var(--bg-deep);color:var(--text);font-size:13px;outline:none;">' +
      '</div>' +
      '<div id="grpAddList" style="max-height:240px;overflow-y:auto;">' + buildNonMembersHTML("") + '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px;">' +
      '<button class="btn ghost" onclick="closeModal();openConversation(\'' + convId + '\')" style="flex:1;">← Retour</button>' +
      '<button class="btn ghost" onclick="toast(\'🚪 Tu as quitté le groupe\')" style="flex:1;color:#ef4444;border-color:rgba(239,68,68,0.3);">Quitter</button>' +
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
    var reader = new FileReader();
    reader.onload = function(ev) {
      var convs = getConversations();
      var c = convs.find(function(x) { return x.id === convId; });
      if (!c) return;
      c.groupPhoto = ev.target.result;
      saveConversations();
      toast("✅ Photo du groupe mise à jour");
      // Mettre à jour l'avatar dans le header sans recharger la conversation
      var avatarStyle = "background:url(" + ev.target.result + ") center/cover;width:40px;height:40px;font-size:0;flex-shrink:0;";
      var avatarEl = document.querySelector("#convFpHead .msg-avatar");
      if (avatarEl) {
        avatarEl.style.cssText = avatarStyle;
        avatarEl.textContent = "";
      }
      // Mettre à jour dans la liste
      renderConvList();
      // Mettre à jour dans la modale si ouverte
      var modalAvatarEl = document.querySelector(".modal-content .msg-avatar[data-grp], .modal-content [style*='border-radius:50%']");
      // Re-render la modale membres si elle est ouverte
      var modalBackdrop = document.getElementById("modal-backdrop");
      if (modalBackdrop && modalBackdrop.style.display !== "none") {
        _renderGroupMembersModal(convId);
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function switchGroupTab(tab) {
  var tabMembers = document.getElementById("grpTab_members");
  var tabAdd     = document.getElementById("grpTab_add");
  var panelMembers = document.getElementById("grpPanel_members");
  var panelAdd     = document.getElementById("grpPanel_add");
  if (!tabMembers || !tabAdd) return;
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
    if (inp) inp.focus();
  }
}

function filterGroupAddList(query) {
  var nonMembers = window._grpNonMembers || [];
  var convId = window._grpConvId || "";
  var filtered = query ? nonMembers.filter(function(u) {
    return u.name.toLowerCase().includes(query.toLowerCase());
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
      '<button class="btn primary" style="font-size:11px;padding:5px 12px;" onclick="addGroupMember(\'' + convId + '\',\'' + u.id + '\')">+ Ajouter</button>' +
    '</div>';
  }).join("");
}

function addGroupMember(convId, userId) {
  var convs = getConversations();
  var c = convs.find(function(x) { return x.id === convId; });
  if (!c) return;
  c.userIds = c.userIds || [];
  if (c.userIds.includes(userId)) return;
  c.userIds.push(userId);
  var u = (state.seed.users || []).find(function(x) { return x.id === userId; });
  c.messages.push({ from: "me", text: "👋 " + (u ? u.name : "Quelqu'un") + " a rejoint le groupe.", at: Date.now(), fromName: "Passio" });
  c.lastAt = Date.now();
  saveConversations();
  toast("✅ " + (u ? u.name : "Membre") + " ajouté·e au groupe");
  _renderGroupMembersModal(convId);
  var fp = document.getElementById("conv-fullpage");
  if (fp && fp.classList.contains("active")) {
    var displayName = c.groupName || "Groupe";
    renderConvFpThread(c, displayName);
  }
}

function removeGroupMember(convId, userId) {
  var convs = getConversations();
  var c = convs.find(function(x) { return x.id === convId; });
  if (!c) return;
  var u = (state.seed.users || []).find(function(x) { return x.id === userId; });
  c.userIds = (c.userIds || []).filter(function(id) { return id !== userId; });
  c.messages.push({ from: "me", text: "👋 " + (u ? u.name : "Un membre") + " a quitté le groupe.", at: Date.now(), fromName: "Passio" });
  c.lastAt = Date.now();
  saveConversations();
  toast("🗑 " + (u ? u.name : "Membre") + " retiré·e du groupe");
  _renderGroupMembersModal(convId);
  var fp = document.getElementById("conv-fullpage");
  if (fp && fp.classList.contains("active")) {
    var displayName = c.groupName || "Groupe";
    renderConvFpThread(c, displayName);
  }
}

function sendMessage(convId) {
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
  tipped: new Set(),
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
    poster: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=720&h=1280&fit=crop&auto=format&q=80",
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    userId: "u_theo", passion: "cuisine", mood: "creation",
    text: "Tarte aux fruits du marché. La pâte sablée maison, beurre demi-sel breton. 🍰",
    createdAt: Date.now() - 2 * 3600000,
  },
  {
    id: "reel_seed_sport_skate_1",
    video: "https://videos.pexels.com/video-files/5765270/5765270-sd_640_360_24fps.mp4",
    poster: "https://images.unsplash.com/photo-1543364195-077a52659557?w=720&h=1280&fit=crop&auto=format&q=80",
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    userId: "u_theo", passion: "sport", mood: "actu",
    text: "Session skate dimanche matin. Kickflip en cours depuis trois mois. Aujourd'hui ça commence à venir. 🛹",
    createdAt: Date.now() - 4 * 3600000,
  },
  {
    id: "reel_seed_musique_1",
    video: "https://videos.pexels.com/video-files/5765163/5765163-sd_640_360_24fps.mp4",
    poster: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=720&h=1280&fit=crop&auto=format&q=80",
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    userId: "u_lea", passion: "musique", mood: "creation",
    text: "Impro guitare ce matin. En bricolant on trouve les meilleurs accords. 🎸",
    createdAt: Date.now() - 6 * 3600000,
  },
  {
    id: "reel_seed_voyage_1",
    video: "https://videos.pexels.com/video-files/3571264/3571264-sd_640_360_30fps.mp4",
    poster: "https://images.unsplash.com/photo-1530841377377-3ff06c0ca713?w=720&h=1280&fit=crop&auto=format&q=80",
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    userId: "u_nina", passion: "voyage", mood: "chill",
    text: "Lever de soleil sur la côte. Trois jours sans téléphone, juste un carnet. 🌅",
    createdAt: Date.now() - 8 * 3600000,
  },
  {
    id: "reel_seed_photo_1",
    video: "https://videos.pexels.com/video-files/3209243/3209243-sd_640_360_25fps.mp4",
    poster: "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=720&h=1280&fit=crop&auto=format&q=80",
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    userId: "u_karim", passion: "photo", mood: "learn",
    text: "Comment je règle mon argentique avant une sortie street. 📸",
    createdAt: Date.now() - 10 * 3600000,
  },
  {
    id: "reel_seed_cuisine_2",
    video: "https://videos.pexels.com/video-files/4253587/4253587-sd_640_360_25fps.mp4",
    poster: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=720&h=1280&fit=crop&auto=format&q=80",
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    userId: "u_theo", passion: "cuisine", mood: "learn",
    text: "Le geste du pli pour la pâte feuilletée. 80% patience, 20% beurre froid. 🧈",
    createdAt: Date.now() - 12 * 3600000,
  },
  {
    id: "reel_seed_litterature_1",
    video: "https://videos.pexels.com/video-files/6981411/6981411-sd_640_360_25fps.mp4",
    poster: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=720&h=1280&fit=crop&auto=format&q=80",
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    userId: "u_sofia", passion: "litterature", mood: "chill",
    text: "Lecture du dimanche. Thé, fenêtre ouverte, Annie Ernaux. 📚",
    createdAt: Date.now() - 14 * 3600000,
  },
  {
    id: "reel_seed_musique_2",
    video: "https://videos.pexels.com/video-files/4488162/4488162-sd_640_360_24fps.mp4",
    poster: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=720&h=1280&fit=crop&auto=format&q=80",
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    userId: "u_lea", passion: "musique", mood: "actu",
    text: "Concert dans une cave de la Croix-Rousse. 30 personnes, lumière tamisée. 🎶",
    createdAt: Date.now() - 16 * 3600000,
  },
  {
    id: "reel_seed_voyage_2",
    video: "https://videos.pexels.com/video-files/1721294/1721294-sd_640_360_24fps.mp4",
    poster: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=720&h=1280&fit=crop&auto=format&q=80",
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
    userId: "u_nina", passion: "voyage", mood: "chill",
    text: "Marrakech, ruelles du souk au lever du jour. 🇲🇦",
    createdAt: Date.now() - 18 * 3600000,
  },
  {
    id: "reel_seed_photo_2",
    video: "https://videos.pexels.com/video-files/4065906/4065906-sd_640_360_24fps.mp4",
    poster: "https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=720&h=1280&fit=crop&auto=format&q=80",
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
    userId: "u_karim", passion: "photo", mood: "creation",
    text: "Atelier tirage argentique. L'image apparaît dans le révélateur. 🖤",
    createdAt: Date.now() - 20 * 3600000,
  },
  {
    id: "reel_seed_sport_2",
    video: "https://videos.pexels.com/video-files/4761437/4761437-sd_640_360_25fps.mp4",
    poster: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=720&h=1280&fit=crop&auto=format&q=80",
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    userId: "u_theo", passion: "sport", mood: "learn",
    text: "Échauffement du matin. 15 min de mobilité, ça change tout. 💪",
    createdAt: Date.now() - 22 * 3600000,
  },
  {
    id: "reel_seed_cuisine_3",
    video: "https://videos.pexels.com/video-files/4253586/4253586-sd_640_360_25fps.mp4",
    poster: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=720&h=1280&fit=crop&auto=format&q=80",
    fallback: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4",
    userId: "u_theo", passion: "cuisine", mood: "chill",
    text: "Café du matin, mug en grès fait main. Les petits rituels. ☕",
    createdAt: Date.now() - 25 * 3600000,
  },
];

function getSeedReelPostsWithComments(seedUsers) {
  // Version de getSeedReelPosts() qui reçoit les users en paramètre
  return SEED_REEL_VIDEOS.map(r => {
    const commentExamples = [
      { text: "J'aime beaucoup! 😍", author: "u_alex", name: "Alex" },
      { text: "C'est incroyable!", author: "u_marie", name: "Marie" },
      { text: "Trop cool 🔥", author: "u_luc", name: "Luc" },
      { text: "Merci pour le partage!", author: "u_sara", name: "Sara" },
      { text: "Je veux essayer ça!", author: "u_tom", name: "Tom" },
      { text: "Magnifique ✨", author: "u_lisa", name: "Lisa" },
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
      video: r.video,
      fallback: r.fallback,
      poster: r.poster,
      userId: r.userId,
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
    video: r.video,
    fallback: r.fallback,
    poster: r.poster,
    userId: r.userId,
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
function reelVideoFallback(videoEl, fallbackUrl) {
  if (!videoEl || !fallbackUrl) return;
  if (videoEl.dataset.fallbackUsed === "1") return;
  videoEl.dataset.fallbackUsed = "1";
  videoEl.src = fallbackUrl;
  videoEl.load();
  try { videoEl.play().catch(()=>{}); } catch(e) {}
}

function buildReels() {
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
  return sources
    .filter(function(p) {
      if (!p || !p.isReel) return false;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      if (blocked.length && blocked.includes(p.authorId)) return false;
      return true;
    })
    .sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })
    .slice(0, 30);
}

function authorOfReel(post) {
  if (post._source === "me") {
    const prof = (state.user.profiles || []).find(p => p.id === post.profileId);
    return {
      name: prof ? prof.name : "Toi",
      emoji: prof ? prof.emoji : "🙂",
      color: prof ? prof.color : "#7c3aed",
    };
  }
  const su = (state.seed.users || []).find(u => u.id === post.userId);
  if (su) {
    return {
      name: su.name,
      emoji: su.profileEmoji || "🙂",
      color: su.avatar || "#7c3aed",
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
  if (post.type === "video" && post.video) {
    const poster = post.poster ? ` poster="${post.poster}"` : "";
    const fallback = post.fallback ? ` onerror="reelVideoFallback(this, '${post.fallback}')"` : "";
    return `<video class="reel-media" src="${post.video}"${poster}${fallback} muted playsinline loop preload="metadata"></video>`;
  }
  // Sinon : utilise la cover photo (existant pour les posts seed) ou la photo uploadée
  const src = post.photo || post.coverPhotoUrl || resolveCoverUrl(post.cover) || "";
  if (!src) {
    return `<div class="reel-media" style="background: linear-gradient(135deg, ${COLORS_PASSION_BG[post.passion] || "#4c1d95"}, #7c3aed);"></div>`;
  }
  return `<img class="reel-media" src="${typeof passioThumb === 'function' ? passioThumb(src, 720) : src}" alt="" loading="lazy" onerror="this.onerror=null;this.src='https://picsum.photos/seed/' + Math.random() + '/720/1280';"/>`;
}

function resolveCoverUrl(cover) {
  if (!cover) return null;
  if (typeof COVER_PHOTOS !== "undefined" && COVER_PHOTOS[cover]) {
    return `https://images.unsplash.com/${COVER_PHOTOS[cover]}?w=720&h=1280&fit=crop&auto=format&q=80`;
  }
  return null;
}

const COLORS_PASSION_BG = {
  musique: "#7c3aed", photo: "#4c1d95", voyage: "#0891b2",
  cuisine: "#dc2626", litterature: "#1e40af", sport: "#16a34a",
  cinema: "#9333ea", nature: "#15803d", actu: "#0f172a",
};

function renderReelHTML(post, idx) {
  const author = authorOfReel(post);
  const passion = passionById(post.passion) || { label: post.passion, emoji: "✨" };
  const moodLabel = ({ creation: "Création", learn: "Apprendre", chill: "Chill", actu: "Actu" })[post.mood] || "Tout";
  const isLiked = reelsState.liked.has(post.id);
  const isTipped = reelsState.tipped.has(post.id);
  const txt = post.text || post.caption || "";
  return `
    <div class="reel-item" data-reel-idx="${idx}" data-post-id="${escapeHtml(post.id)}">
      <div class="reel-media-container">
        ${reelMediaHTML(post)}
        ${(Array.isArray(post.overlays) && post.overlays.length && typeof _storyOverlaysHtml === "function") ? `<div class="reel-overlays-layer">${_storyOverlaysHtml(post.overlays)}</div>` : ""}
      </div>
      <div class="reel-overlay"></div>
      <span class="reel-tag-mood">${passion.emoji} ${escapeHtml(passion.label)} · ${moodLabel}</span>
      <div class="reel-info">
        <div class="reel-author" onclick="_openReelAuthor('${escapeHtml(post.authorId || post.userId || '')}'); return false;" style="cursor:pointer;">
          <div class="reel-avatar" style="background:${author.color};">${author.emoji}</div>
          <div class="reel-author-meta">
            <div class="reel-author-name">${escapeHtml(author.name)}</div>
            <div class="reel-passion">${passion.emoji} ${escapeHtml(passion.label)}</div>
          </div>
        </div>
        <div class="reel-caption">${escapeHtml(txt).slice(0, 220)}${txt.length > 220 ? "…" : ""}</div>
      </div>
      <div class="reel-actions">
        <button class="reel-action-btn ${isLiked ? "liked" : ""}" onclick="toggleReelLike('${post.id}', this)" aria-label="Aimer">
          <span class="reel-action-icon">
            <svg viewBox="0 0 24 24"><path d="M12 21 C5.5 16 2 12.5 2 8.5 C2 5.5 4.5 3 7.5 3 C9.5 3 11 4 12 5.5 C13 4 14.5 3 16.5 3 C19.5 3 22 5.5 22 8.5 C22 12.5 18.5 16 12 21 Z"/></svg>
          </span>
          <span class="reel-action-label">J'aime</span>
        </button>
        <button class="reel-action-btn" onclick="openReelComments('${post.id}')" aria-label="Commenter">
          <span class="reel-action-icon">
            <svg viewBox="0 0 24 24"><path d="M21 12 C21 16 16.5 19 12 19 C10.8 19 9.7 18.85 8.7 18.55 L4 20 L5.5 16 C4 14.85 3 13.5 3 12 C3 8 7.5 5 12 5 C16.5 5 21 8 21 12 Z"/></svg>
          </span>
          <span class="reel-action-label">Commentaire</span>
        </button>
        <button class="reel-action-btn ${isTipped ? "tipped" : ""}" onclick="tipReel('${post.id}', this)" aria-label="Soutenir">
          <span class="reel-action-icon">
            <svg viewBox="0 0 24 24"><path d="M12 3 L14.6 9 L21 9.6 L16 14 L17.5 20.5 L12 17 L6.5 20.5 L8 14 L3 9.6 L9.4 9 Z"/></svg>
          </span>
          <span class="reel-action-label">Soutenir</span>
        </button>
        <button class="reel-action-btn" onclick="shareReel('${post.id}')" aria-label="Partager">
          <span class="reel-action-icon">
            <svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 11 L16 7"/><path d="M8 13 L16 17"/></svg>
          </span>
          <span class="reel-action-label">Partager</span>
        </button>
      </div>
    </div>`;
}

function openReels() {
  // Ajouter à l'historique pour que le bouton back fonctionne
  window.history.pushState({ overlay: "reels" }, "", "#reels");

  const items = buildReels();
  if (!items.length) {
    const v = document.getElementById("reelsViewer");
    v.classList.add("open");
    v.setAttribute("aria-hidden", "false");
    document.getElementById("reelsList").innerHTML = `
      <div class="reels-empty">
        <div class="reels-empty-emoji">🎬</div>
        <div class="reels-empty-title">Pas encore de bobines</div>
        <div class="reels-empty-text">Crée ta première bobine : ➕ → Studio → onglet <b>Bobine</b>.</div>
        <button class="btn primary" style="margin-top:14px;" onclick="startBobineCreation()">🎬 Créer une bobine</button>
      </div>`;
    document.body.style.overflow = "hidden";
    reelsState.open = true;
    return;
  }
  reelsState.items = items;
  reelsState.current = 0;
  reelsState.viewedSinceOpen = 0;
  reelsState.pausePrompted = false;

  const list = document.getElementById("reelsList");
  list.innerHTML = items.map((p, i) => renderReelHTML(p, i)).join("");

  const v = document.getElementById("reelsViewer");
  v.classList.add("open");
  v.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
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

function closeReels() {
  const v = document.getElementById("reelsViewer");
  v.classList.remove("open");
  v.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  document.body.classList.remove("reels-open");
  reelsState.open = false;
  document.getElementById("reelsPause").classList.remove("show");
  // Pause toutes les vidéos
  document.querySelectorAll("#reelsList video").forEach(vid => { try { vid.pause(); } catch(e){} });
  if (reelsState.observer) { try { reelsState.observer.disconnect(); } catch(e){} reelsState.observer = null; }

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

function playReelAt(idx) {
  const items = document.querySelectorAll("#reelsList .reel-item");
  items.forEach((it, i) => {
    const vid = it.querySelector("video");
    if (!vid) return;
    if (i === idx) { try { vid.currentTime = 0; vid.play().catch(()=>{}); } catch(e){} }
    else { try { vid.pause(); } catch(e){} }
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

function toggleReelLike(postId, btn) {
  if (reelsState.liked.has(postId)) {
    reelsState.liked.delete(postId);
    btn.classList.remove("liked");
  } else {
    reelsState.liked.add(postId);
    btn.classList.add("liked");
    // Le créateur reçoit 1 point côté seed (symbolique pour la démo)
    grantReward("like_received", "J'aime sur une bobine");
  }
}

function tipReel(postId, btn) {
  if (reelsState.tipped.has(postId)) {
    toast("Déjà soutenu, merci !");
    return;
  }
  if ((state.user.passia || 0) < 1) {
    toast("Pas assez de Passia pour soutenir ce créateur.");
    return;
  }
  reelsState.tipped.add(postId);
  btn.classList.add("tipped");
  state.user.passia -= 1;
  state.transactions.unshift({
    id: uid(),
    kind: "tip_reel",
    pts: 0,
    passia: -1,
    label: "Soutien à un créateur",
    at: Date.now(),
  });
  saveState();
  renderTopbar();
  toast("💎 1 Passia envoyé au créateur");
}

function openReelComments(postId) {
  // Afficher le panel de commentaires en bas style Instagram
  const panel = document.getElementById("reelCommentsPanel");
  const reelsViewer = document.getElementById("reelsViewer");

  if (panel && reelsViewer) {
    // Ajouter la classe pour réduire la vidéo
    reelsViewer.classList.add("comments-open");
    panel.classList.add("open");

    // Stocker le postId courant
    window.currentReelCommentPostId = postId;
    // Charger les commentaires
    loadReelComments(postId);

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
    panel.classList.remove("open");
    if (reelsViewer) {
      reelsViewer.classList.remove("comments-open");
    }
    window.currentReelCommentPostId = null;
  }
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
    const timeStr = c.timestamp ? fmtTime(c.timestamp) : "Maintenant";
    const likesCount = c.likes || 0;
    const isLiked = (c.likedBy || []).includes(state.user?.id || "me");
    const replies = c.replies || [];

    let commentHTML = `
      <div class="reel-comment-item">
        <div class="reel-comment-avatar" style="background:${avatarBg(commenter)};" onclick="openUserProfile('${c.authorId}')" title="${escapeHtml(commenter.name)}">${avatarInner(commenter)}</div>
        <div class="reel-comment-body">
          <div class="reel-comment-header">
            <span class="reel-comment-name" onclick="openUserProfile('${c.authorId}')">${escapeHtml(commenter.name)}</span>
            <span class="reel-comment-badge">${timeStr}</span>
          </div>
          <div class="reel-comment-text">${escapeHtml(c.text || c.content || "")}</div>
          <div class="reel-comment-footer">
            <span class="reel-comment-like ${isLiked ? 'liked' : ''}" onclick="likeReelComment('${postId}', ${idx})">${isLiked ? '❤️' : '🤍'} ${likesCount}</span>
            <span class="reel-comment-reply" onclick="replyToReelCommentBox('${postId}', ${idx}, '${escapeHtml(commenter.name)}')">💬</span>
            <span class="reel-comment-action" onclick="showQuickEmojiForReelComment('${postId}', ${idx}, event)" title="Réagir">😊</span>
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
              <span class="reel-reply-author" onclick="openUserProfile('${r.authorId}')">${escapeHtml(replyAuthor.name)}</span>
              <span style="font-size:18px;margin-left:6px;letter-spacing:1px;">${r.text}</span>
            </div>
          `;
        } else if (r.type === "gif_reaction") {
          commentHTML += `
            <div class="reel-reply-item">
              <span class="reel-reply-author" onclick="openUserProfile('${r.authorId}')">${escapeHtml(replyAuthor.name)}</span>
              <img loading="lazy" decoding="async" src="${r.text}" style="width:100%;max-width:150px;height:auto;border-radius:6px;margin-top:6px;object-fit:cover;" alt="GIF" />
            </div>
          `;
        } else {
          commentHTML += `
            <div class="reel-reply-item">
              <span class="reel-reply-author" onclick="openUserProfile('${r.authorId}')">${escapeHtml(replyAuthor.name)}</span>
              <div class="reel-reply-text">${escapeHtml(r.text)}</div>
            </div>
          `;
        }
      });
      commentHTML += `</div>`;
    }

    return commentHTML;
  }).join("");
}

function autoResizeReelCommentInput() {
  const input = document.getElementById("reelCommentInput");
  if (!input) return;
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 100) + "px";
}

function submitReelComment() {
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
      toast("✅ Réponse postée!");
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
    reel.comments.push(newComment);
    toast("✅ Commentaire posté!");
  }

  saveState();

  input.value = "";
  input.style.height = "auto";
  window.replyingToCommentIdx = null;
  window.replyingToPostId = null;
  loadReelComments(postId);
}

function likeReelComment(postId, commentIdx) {
  const reel = findPostAnywhere(postId);
  if (!reel || !reel.comments || !reel.comments[commentIdx]) return;

  const comment = reel.comments[commentIdx];
  const userId = state.user?.id || "me";

  if (!comment.likedBy) comment.likedBy = [];
  if (!comment.likes) comment.likes = 0;

  const idx = comment.likedBy.indexOf(userId);
  if (idx > -1) {
    comment.likedBy.splice(idx, 1);
    comment.likes = Math.max(0, comment.likes - 1);
  } else {
    comment.likedBy.push(userId);
    comment.likes++;
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

function showQuickEmojiForReelComment(postId, commentIdx, event) {
  event.stopPropagation();
  const reel = findPostAnywhere(postId);
  if (!reel || !reel.comments || !reel.comments[commentIdx]) return;

  const emojis = ["😂", "❤️", "😍", "🔥", "👍"];
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:6px;display:flex;gap:4px;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,0.1);";

  emojis.forEach(emoji => {
    const btn = document.createElement("button");
    btn.textContent = emoji;
    btn.style.cssText = "background:none;border:none;font-size:18px;cursor:pointer;padding:4px;";
    btn.onclick = () => {
      addEmojiReactionToReelComment(postId, commentIdx, emoji);
      container.remove();
    };
    container.appendChild(btn);
  });

  event.target.parentElement.appendChild(container);
  setTimeout(() => container.remove(), 3000);
}

function showEmojiPickerForReelComment(postId, commentIdx) {
  const reel = findPostAnywhere(postId);
  if (!reel || !reel.comments || !reel.comments[commentIdx]) return;

  const emojis = ["😂", "❤️", "😍", "🔥", "🎉", "👍"];
  const modal = openModal(`
    <div class="modal-title">Réagir au commentaire</div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:16px 0;">
      ${emojis.map(emoji => `<button class="btn secondary" onclick="addEmojiReactionToReelComment('${postId}', ${commentIdx}, '${emoji}')" style="padding:10px;font-size:20px;border:none;">${emoji}</button>`).join("")}
    </div>
  `);
}

function showGifPickerForReelComment(postId, commentIdx) {
  const reel = findPostAnywhere(postId);
  if (!reel || !reel.comments || !reel.comments[commentIdx]) return;

  openModal(`
    <div class="modal-title">GIF de réaction</div>
    <input type="search" placeholder="Rechercher un GIF…" aria-label="Rechercher un GIF"
      oninput="_reelGifSearch('${postId}', ${commentIdx}, this.value)"
      style="width:100%;box-sizing:border-box;margin:10px 0 4px;padding:8px 12px;border-radius:10px;border:1.5px solid var(--border);background:var(--bg-deep);color:var(--text);font-size:16px;outline:none;" />
    <div id="reelGifGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;max-height:300px;overflow-y:auto;">
      <div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:18px;">Chargement…</div>
    </div>
  `);
  _fillReelGifGrid(postId, commentIdx, "");
}

// Remplit la grille GIF du modal de réaction bobine via l'API (fallback local)
function _fillReelGifGrid(postId, commentIdx, query) {
  passioFetchGifs(query, 12).then(urls => {
    const grid = document.getElementById("reelGifGrid");
    if (!grid) return; // modal refermé entre-temps
    grid.innerHTML = urls.length
      ? urls.map(gif => `<img loading="lazy" decoding="async" src="${escapeHtml(gif)}" alt="GIF" style="width:100%;height:120px;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="addGifReactionToReelComment('${postId}', ${commentIdx}, '${escapeHtml(gif)}')" />`).join("")
      : '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:18px;">Aucun GIF trouvé</div>';
  });
}

let _reelGifDeb = null;
function _reelGifSearch(postId, commentIdx, q) {
  clearTimeout(_reelGifDeb);
  _reelGifDeb = setTimeout(() => _fillReelGifGrid(postId, commentIdx, q), 350);
}

function addEmojiReactionToReelComment(postId, commentIdx, emoji) {
  const reel = findPostAnywhere(postId);
  if (!reel || !reel.comments || !reel.comments[commentIdx]) return;

  const comment = reel.comments[commentIdx];
  if (!comment.replies) comment.replies = [];

  const reply = {
    type: "emoji_reaction",
    text: emoji,
    authorId: state.user?.id || "me",
    authorName: currentProfile()?.name || "Moi",
    createdAt: Date.now()
  };

  comment.replies.push(reply);
  saveState();
  closeModal();
  loadReelComments(postId);
  toast(`${emoji} Réaction ajoutée!`);
}

function addGifReactionToReelComment(postId, commentIdx, gifUrl) {
  const reel = findPostAnywhere(postId);
  if (!reel || !reel.comments || !reel.comments[commentIdx]) return;

  const comment = reel.comments[commentIdx];
  if (!comment.replies) comment.replies = [];

  const reply = {
    type: "gif_reaction",
    text: gifUrl,
    authorId: state.user?.id || "me",
    authorName: currentProfile()?.name || "Moi",
    createdAt: Date.now()
  };

  comment.replies.push(reply);
  saveState();
  closeModal();
  loadReelComments(postId);
  toast("🎬 GIF ajouté!");
}

function reactToReel(emoji) {
  const postId = window.currentReelCommentPostId;
  if (!postId) return;

  const reel = findPostAnywhere(postId);
  if (!reel) return;

  if (!reel.reactions) reel.reactions = {};
  if (!reel.reactions[emoji]) reel.reactions[emoji] = 0;
  reel.reactions[emoji]++;

  saveState();
  toast(`${emoji} Réaction ajoutée!`);
}

function shareReel(postId) {
  openReelShareModal(postId);
}

function openReelShareModal(postId) {
  const reel = findPostAnywhere(postId);
  if (!reel) return;

  const url = `${location.origin}${location.pathname}#reel=${encodeURIComponent(postId)}`;
  const author = authorOfReel(reel);
  const passion = passionById(reel.passion) || { label: reel.passion, emoji: "✨" };
  const moodLabel = ({ creation: "Création", learn: "Apprendre", chill: "Chill", actu: "Actu" })[reel.mood] || "Tout";
  const txt = reel.text || reel.caption || "";

  // Créer des URLs de partage pour les réseaux sociaux
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`Regarde cette bobine PASSIO: ${txt.slice(0, 50)}...`);

  const shareHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">📤 Partager cette bobine</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <button class="btn secondary" onclick="shareReelVia('whatsapp', '${postId}', '${encodedUrl}', '${encodedText}')" style="font-size:13px;">
        💬 WhatsApp
      </button>
      <button class="btn secondary" onclick="shareReelVia('telegram', '${postId}', '${encodedUrl}', '${encodedText}')" style="font-size:13px;">
        ✈️ Telegram
      </button>
      <button class="btn secondary" onclick="shareReelVia('twitter', '${postId}', '${encodedUrl}', '${encodedText}')" style="font-size:13px;">
        𝕏 Twitter
      </button>
      <button class="btn secondary" onclick="shareReelVia('facebook', '${postId}', '${encodedUrl}', '${encodedText}')" style="font-size:13px;">
        📘 Facebook
      </button>
      <button class="btn secondary" onclick="shareReelEmail('${postId}', '${encodedText}')" style="font-size:13px;">
        📧 Email
      </button>
      <button class="btn secondary" onclick="shareReelSMS('${postId}', '${encodedUrl}')" style="font-size:13px;">
        📱 SMS
      </button>
    </div>

    <button class="btn primary block" onclick="shareReelInFeed('${postId}')" style="margin-bottom:8px;">
      ➕ Partager dans le Feed
    </button>

    <button class="btn secondary block" onclick="copyReelLink('${postId}', '${encodedUrl}')">
      📋 Copier le lien
    </button>
  `;

  openModal(shareHTML);
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
    text: `📤 A partagé une bobine\n\n${passion.emoji} ${escapeHtml(author.name)} – ${passion.label}\n\n"${escapeHtml(txt).slice(0, 150)}${txt.length > 150 ? "…" : ""}"`,
    caption: `Shared reel from ${author.name}`,
    timestamp: Date.now(),
    likes: 0,
    comments: [],
    passion: reel.passion,
    mood: reel.mood || "chill",
    sharedReel: postId,
    sharedReelData: {
      id: reel.id,
      text: txt,
      authorName: author.name,
      authorEmoji: author.emoji,
      authorColor: author.color,
      passion: reel.passion
    }
  };

  if (!state.userPosts) state.userPosts = [];
  state.userPosts.push(newPost);
  saveState();

  closeModal();
  setTimeout(() => {
    goTo("feed");
    setTimeout(() => renderFeed(), 100);
  }, 100);

  toast("✅ Bobine partagée dans ton feed!");

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

