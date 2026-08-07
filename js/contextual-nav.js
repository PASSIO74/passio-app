/* =====================================================================
   ContextualTools — panneau d'outils contextuel réutilisable (2026-08-07)
   ---------------------------------------------------------------------
   Objectif : sortir les commandes SECONDAIRES des pages (IRL, CDV, et plus
   tard Profil/Marketplace) pour rendre le CONTENU roi, sans rien supprimer.

   Rendu responsive d'UN SEUL composant :
     • mobile / tablette  → bottom-sheet (glisse depuis le bas, pouce)
     • desktop ≥ 1024px   → rail latéral droit (le « drawer » de l'idée
       initiale, ici où il est ergonomique et sans conflit avec la carte).

   PAS de swipe depuis le bord droit sur mobile : il entrerait en collision
   avec le pan horizontal de la carte MapLibre (IRL) et les carrousels.
   Ouverture par bouton « Outils » ; fermeture par ✕, backdrop, Escape,
   swipe-bas (mobile) et bouton retour du navigateur.

   Contrat déclaratif — chaque écran expose une fonction globale
   `window.<pageType>ToolsSections()` qui renvoie, à CHAUD (état courant) :
     {
       title: "Outils",
       sections: [
         { title: "Filtres", items: [
             { icon:"🎯", label:"…", sub:"…", badge:3, active:false,
               data:{ irlfilter:"mine" },     // → délégation existante
               onClick:"closeCtxTools();openIrlFiltersPanel()" }
         ]}
       ]
     }
   `icon` peut être un emoji OU du SVG brut (confiance : produit par nous).
   `label`/`sub` sont échappés. `data` pose des data-attributes (réutilise les
   listeners délégués déjà en place : [data-irlfilter], [data-cdvfilter]…).

   IIFE "use strict" : n'expose QUE window.ContextualTools / window.closeCtxTools
   (audit:globals reste vert — aucun global top-level parasite).
   ===================================================================== */
(function () {
  "use strict";

  var ROOT_ID = "ctxToolsRoot";
  var isOpen = false;
  var lastTrigger = null;      // élément à re-focuser à la fermeture (a11y)
  var currentType = null;

  function esc(s) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(s);
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var prefersReduced = false;
  try {
    prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_) {}

  // Host créé UNE seule fois, à la première ouverture (rien monté inutilement).
  function ensureHost() {
    var root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "ctx-root";
    root.setAttribute("hidden", "");
    root.innerHTML =
      '<div class="ctx-backdrop" data-ctx-close="1"></div>' +
      '<aside class="ctx-sheet" role="dialog" aria-modal="true" aria-labelledby="ctxToolsTitle" tabindex="-1">' +
        '<div class="ctx-head">' +
          '<div class="ctx-grip" aria-hidden="true"></div>' +
          '<div class="ctx-title" id="ctxToolsTitle">Outils</div>' +
          '<button type="button" class="ctx-close" aria-label="Fermer" data-ctx-close="1">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="ctx-body" id="ctxToolsBody"></div>' +
      '</aside>';
    document.body.appendChild(root);

    // Fermeture : backdrop, bouton ✕ (délégation locale au host).
    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-ctx-close]")) { e.preventDefault(); close(); }
    });

    // Swipe-bas sur l'en-tête pour fermer (mobile) — jamais sur le bord droit
    // (conflit carte). Uniquement geste vertical franc.
    var head = root.querySelector(".ctx-head");
    var startY = 0, dragging = false;
    head.addEventListener("touchstart", function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      startY = e.touches[0].clientY; dragging = true;
    }, { passive: true });
    head.addEventListener("touchmove", function (e) {
      if (!dragging || !e.touches) return;
      var dy = e.touches[0].clientY - startY;
      if (dy > 70) { dragging = false; close(); }
    }, { passive: true });
    head.addEventListener("touchend", function () { dragging = false; }, { passive: true });

    return root;
  }

  function itemHtml(it) {
    it = it || {};
    var cls = "ctx-item" + (it.active ? " active" : "");
    var attrs = "";
    if (it.data) {
      for (var k in it.data) {
        if (Object.prototype.hasOwnProperty.call(it.data, k)) {
          attrs += ' data-' + k + '="' + esc(it.data[k]) + '"';
        }
      }
    }
    // onClick : chaîne JS de confiance (produite par nos builders). data-driven
    // items s'appuient sur la délégation existante → pas de onclick.
    var onclick = it.onClick ? ' onclick="' + it.onClick.replace(/"/g, "&quot;") + '"' : "";
    var badge = (it.badge !== undefined && it.badge !== null && it.badge !== "" && it.badge !== 0)
      ? '<span class="ctx-item-badge">' + esc(it.badge) + '</span>' : "";
    var sub = it.sub ? '<span class="ctx-item-sub">' + esc(it.sub) + '</span>' : "";
    var chevron = it.data ? "" : '<span class="ctx-item-go" aria-hidden="true">›</span>';
    var aria = it.data ? ' role="button" aria-pressed="' + (it.active ? "true" : "false") + '"' : "";
    return '<button type="button" class="' + cls + '"' + attrs + onclick + aria + '>' +
      '<span class="ctx-item-ico" aria-hidden="true">' + (it.icon || "") + '</span>' +
      '<span class="ctx-item-body"><span class="ctx-item-label">' + esc(it.label) + '</span>' + sub + '</span>' +
      badge + chevron +
    '</button>';
  }

  function render(config) {
    var body = document.getElementById("ctxToolsBody");
    var titleEl = document.getElementById("ctxToolsTitle");
    if (titleEl) titleEl.textContent = (config && config.title) || "Outils";
    if (!body) return;
    var html = "";
    (config && config.sections || []).forEach(function (sec) {
      if (!sec || !sec.items || !sec.items.length) return;
      html += '<div class="ctx-section">';
      if (sec.title) html += '<div class="ctx-section-title">' + esc(sec.title) + '</div>';
      html += '<div class="ctx-section-items">' + sec.items.map(itemHtml).join("") + '</div>';
      html += '</div>';
    });
    body.innerHTML = html || '<div class="ctx-empty">Aucun outil ici.</div>';
  }

  // ---- Focus trap minimal (a11y) --------------------------------------
  function focusables() {
    var sheet = document.querySelector("#" + ROOT_ID + " .ctx-sheet");
    if (!sheet) return [];
    return Array.prototype.slice.call(sheet.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return !el.hasAttribute("disabled") && el.offsetParent !== null; });
  }
  function onKeydown(e) {
    if (!isOpen) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") {
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function open(pageType, trigger) {
    var builder = window[pageType + "ToolsSections"];
    if (typeof builder !== "function") return;   // écran non configuré : no-op sûr
    var config;
    try { config = builder(); } catch (err) { return; }
    if (!config) return;

    var root = ensureHost();
    render(config);
    currentType = pageType;
    lastTrigger = trigger || document.activeElement;

    root.removeAttribute("hidden");
    // rAF : laisse le navigateur peindre l'état fermé avant d'animer l'ouverture.
    (window.requestAnimationFrame || function (f) { setTimeout(f, 16); })(function () {
      root.classList.add("ctx-open");
    });
    document.body.classList.add("ctx-locked");
    document.addEventListener("keydown", onKeydown, true);

    // Entrée history : le bouton retour ferme le panneau (comme openModal).
    if (!isOpen) {
      try { window.history.pushState({ overlay: "ctxtools" }, "", "#outils"); } catch (_) {}
    }
    isOpen = true;

    var sheet = root.querySelector(".ctx-sheet");
    if (sheet) sheet.focus();

    try { if (window.tel && typeof tel.action === "function") tel.action("tools_open", { page: pageType }); } catch (_) {}
  }

  function close() {
    if (!isOpen) return;
    var root = document.getElementById(ROOT_ID);
    isOpen = false;
    currentType = null;
    document.body.classList.remove("ctx-locked");
    document.removeEventListener("keydown", onKeydown, true);
    if (!root) return;
    root.classList.remove("ctx-open");
    var finish = function () { if (!isOpen) root.setAttribute("hidden", ""); };
    if (prefersReduced) finish();
    else setTimeout(finish, 240);
    if (lastTrigger && typeof lastTrigger.focus === "function") {
      try { lastTrigger.focus(); } catch (_) {}
    }
    lastTrigger = null;
  }

  // Re-rend le contenu si le panneau est ouvert sur cet écran (état changé
  // derrière — ex. toggle d'un filtre). No-op sinon.
  function refresh(pageType) {
    if (!isOpen || (pageType && pageType !== currentType)) return;
    var builder = window[currentType + "ToolsSections"];
    if (typeof builder === "function") {
      try { render(builder()); } catch (_) {}
    }
  }

  window.ContextualTools = {
    open: open,
    close: close,
    refresh: refresh,
    isOpen: function () { return isOpen; }
  };
  // Raccourci pour les onClick inline des items (« closeCtxTools();openX() »).
  window.closeCtxTools = close;
})();
