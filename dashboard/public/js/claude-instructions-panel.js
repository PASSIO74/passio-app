// PASSIO Control Center — transparence ChatGPT → Claude Code.
// Affiche les consignes préparées par ChatGPT directement dans « Sessions de test ».
// Le même rendu responsive fonctionne sur ordinateur et mobile.
(function () {
  "use strict";

  var cache = null;
  var loading = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtDate(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (_) { return String(value); }
  }

  function load() {
    if (cache) return Promise.resolve(cache);
    if (loading) return loading;
    loading = fetch("/data/claude-instructions.json", { cache: "no-store", credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("Consignes indisponibles");
        return res.json();
      })
      .then(function (data) { cache = data; return data; })
      .finally(function () { loading = null; });
    return loading;
  }

  function ensureStyles() {
    if (document.getElementById("claudeInstructionsStyles")) return;
    var style = document.createElement("style");
    style.id = "claudeInstructionsStyles";
    style.textContent =
      ".claude-instructions-card{margin:16px 0;padding:16px;border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:var(--shadow-sm)}" +
      ".claude-instructions-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}" +
      ".claude-instructions-kicker{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}" +
      ".claude-instructions-title{font-size:17px;font-weight:800;margin:3px 0 4px;color:var(--text)}" +
      ".claude-instructions-meta{font-size:12px;color:var(--muted);line-height:1.45}" +
      ".claude-instructions-status{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:rgba(124,58,237,.12);color:var(--accent);font-size:11px;font-weight:800}" +
      ".claude-instructions-summary{margin:13px 0;font-size:13px;line-height:1.55;color:var(--text)}" +
      ".claude-instructions-card details{border-top:1px solid var(--border);padding-top:12px;margin-top:10px}" +
      ".claude-instructions-card summary{cursor:pointer;font-weight:800;font-size:13px;color:var(--text)}" +
      ".claude-instructions-list{margin:10px 0 0;padding-left:20px;font-size:12px;line-height:1.55;color:var(--text)}" +
      ".claude-instructions-list li{margin:7px 0}" +
      ".claude-instructions-note{margin-top:12px;padding:10px 12px;border-radius:12px;background:rgba(124,58,237,.08);font-size:11px;line-height:1.5;color:var(--muted)}" +
      "@media(max-width:640px){.claude-instructions-card{padding:13px;margin:12px 0}.claude-instructions-title{font-size:15px}.claude-instructions-list{padding-left:18px}.claude-instructions-head{display:block}.claude-instructions-status{margin-top:8px}}";
    document.head.appendChild(style);
  }

  function render(data) {
    var cur = data && data.current;
    if (!cur) return '<div class="claude-instructions-card">Aucune consigne Claude préparée.</div>';
    var instructions = (cur.instructions || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("");
    var acceptance = (cur.acceptance || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("");
    var histCount = Array.isArray(data.history) ? data.history.length : 0;
    return '<section class="claude-instructions-card" aria-label="Consignes ChatGPT vers Claude Code">' +
      '<div class="claude-instructions-head">' +
        '<div><div class="claude-instructions-kicker">ChatGPT → Claude Code</div>' +
          '<div class="claude-instructions-title">' + esc(cur.title) + '</div>' +
          '<div class="claude-instructions-meta">Prévue : ' + esc(fmtDate(cur.scheduledFor)) + ' · Mise à jour : ' + esc(fmtDate(data.updatedAt)) + '</div></div>' +
        '<span class="claude-instructions-status">' + esc(cur.status || "préparée") + '</span>' +
      '</div>' +
      '<div class="claude-instructions-summary">' + esc(cur.summary || "") + '</div>' +
      '<details open><summary>Consignes exactes (' + (cur.instructions || []).length + ')</summary><ol class="claude-instructions-list">' + instructions + '</ol></details>' +
      '<details><summary>Critères de validation (' + (cur.acceptance || []).length + ')</summary><ul class="claude-instructions-list">' + acceptance + '</ul></details>' +
      '<div class="claude-instructions-note">Transparence des sessions : ce panneau est le miroir lisible des consignes préparées pour Claude Code. Les prochaines missions ChatGPT → Claude seront ajoutées à ce journal ; historique actuel : ' + histCount + '.</div>' +
    '</section>';
  }

  function install() {
    if (location.hash && location.hash.indexOf("#sessions") !== 0) return;
    var view = document.getElementById("view");
    var anchor = document.getElementById("sessForm") || document.getElementById("sessList");
    if (!view || !anchor || document.getElementById("claudeInstructionsCardHost")) return;

    ensureStyles();
    var host = document.createElement("div");
    host.id = "claudeInstructionsCardHost";
    host.innerHTML = '<section class="claude-instructions-card"><div class="claude-instructions-meta">Chargement des consignes Claude…</div></section>';
    anchor.parentNode.insertBefore(host, anchor);

    load().then(function (data) {
      if (host.isConnected) host.innerHTML = render(data);
    }).catch(function (err) {
      if (host.isConnected) host.innerHTML = '<section class="claude-instructions-card"><div class="claude-instructions-meta">' + esc(err.message) + '</div></section>';
    });
  }

  var observer = new MutationObserver(function () { install(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", function () { setTimeout(install, 0); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
