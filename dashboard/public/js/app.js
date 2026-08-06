// ═══════════════════════════════════════════════════════════════════════════
// PASSIO — Centre de pilotage : SPA (routeur + vues + temps réel).
// ═══════════════════════════════════════════════════════════════════════════
import { icon } from "./icons.js";
import { api, connectStream } from "./api.js";
import { lineChart, gauge, bars } from "./charts.js";

// ─── État global ─────────────────────────────────────────────────────────────
const S = {
  me: null,
  buffer: [],                 // derniers événements reçus (SSE + fetch initial)
  paused: false,
  filters: {},
  alerts: [],
  currentView: "overview",
  refresh: null,              // fonction de rafraîchissement de la vue active
  testLog: [],
  names: {},                  // uid -> pseudo public (résolu au fil des événements)
  alias: {},                  // uid -> "Visiteur N" pour les inconnus (stable)
  aliasN: 0,
};
const $ = (s, r = document) => r.querySelector(s);
const LIVE = new Set(["overview", "activity", "devices", "users", "content", "messaging", "services", "performance", "bugs"]);

// ─── Utilitaires ─────────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hhmmss = (ts) => new Date(ts).toLocaleTimeString("fr-FR", { hour12: false });
function ago(ts) {
  if (!ts) return "—"; const s = (Date.now() - ts) / 1000;
  if (s < 60) return Math.floor(s) + "s"; if (s < 3600) return Math.floor(s / 60) + "min";
  if (s < 86400) return Math.floor(s / 3600) + "h"; return Math.floor(s / 86400) + "j";
}
const SEV_COLOR = { critical: "var(--crit)", error: "var(--err)", warn: "var(--warn)", info: "var(--info)", debug: "var(--muted-2)" };
const TYPE_FR = { nav: "Navigation", action: "Action", click: "Clic", error: "Erreur", api: "API", perf: "Perf", session: "Session", lifecycle: "Cycle de vie", db: "Base" };
function dotColor(ev) { return ev.type === "error" ? SEV_COLOR[ev.severity] || "var(--err)" : ev.status === "error" ? "var(--err)" : ev.status === "slow" ? "var(--warn)" : ev.type === "api" ? "var(--info)" : "var(--accent)"; }
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600); }
async function copy(text, label) { try { await navigator.clipboard.writeText(text); toast((label || "Copié") + " ✓"); } catch { toast("Copie impossible"); } }
function num(n) { return (n == null ? "—" : n.toLocaleString("fr-FR")); }

// ─── Lisibilité : noms de profil au lieu d'identifiants ───────────────────────
// Libellés lisibles des actions métier (au lieu de "publish_post" etc.).
const ACTION_FR = {
  publish_post: "Publication", publish_reel: "Bobine publiée", like_post: "J'aime",
  unlike_post: "J'aime retiré", comment_post: "Commentaire", send_message: "Message envoyé",
  event_join: "Inscription événement", event_leave: "Désinscription", screen_view: "Écran consulté",
  window_error: "Erreur", unhandled_rejection: "Erreur (promesse)", heartbeat: "Présence",
  start: "Début de session", end: "Fin de session", hidden: "Onglet masqué", visible: "Onglet visible",
};
function actionLabel(ev) {
  if (ev.action && ACTION_FR[ev.action]) return ACTION_FR[ev.action];
  if (ev.type === "api") return "Requête " + (ev.endpoint || "").split("/").pop().replace(/\?.*/, "") || "API";
  return ACTION_FR[ev.action] || ev.action || TYPE_FR[ev.type] || ev.type;
}
// Mémorise le pseudo d'un uid dès qu'on le voit.
function learnName(ev) { if (ev && ev.user_id && ev.user_label) S.names[ev.user_id] = ev.user_label; }
function learnNames(list) { (list || []).forEach(learnName); }
// Nom lisible d'un utilisateur : pseudo connu, sinon « Visiteur N » (jamais l'uid brut).
function who(ev) {
  const label = ev.user_label || (ev.user_id && S.names[ev.user_id]);
  if (label) return esc(label);
  if (ev.user_id) { if (!S.alias[ev.user_id]) S.alias[ev.user_id] = "Visiteur " + (++S.aliasN); return S.alias[ev.user_id]; }
  return "Anonyme";
}
function nameFor(uid, fallbackLabel) {
  if (fallbackLabel) return esc(fallbackLabel);
  if (uid && S.names[uid]) return esc(S.names[uid]);
  if (uid) { if (!S.alias[uid]) S.alias[uid] = "Visiteur " + (++S.aliasN); return S.alias[uid]; }
  return "Anonyme";
}
// Appareil lisible : « iOS · Safari » plutôt qu'un id hexadécimal.
function deviceLabel(d) { return `${d.platform || "?"} · ${d.browser || "?"}`; }

// ─── Navigation ──────────────────────────────────────────────────────────────
const NAV = [
  ["overview", "Vue d'ensemble", "overview"],
  ["activity", "Activité en direct", "activity"],
  ["sessions", "Sessions de test", "sessions"],
  ["devices", "Appareils", "devices"],
  ["users", "Utilisateurs", "users"],
  ["content", "Contenus", "content"],
  ["messaging", "Messagerie", "messaging"],
  ["bugs", "Bugs & erreurs", "bugs"],
  ["performance", "Performances", "performance"],
  ["services", "Services", "services"],
  ["database", "Base de données", "database", "db"],
  ["tests", "Tests", "tests"],
  ["claude", "Claude Code", "claude", "claude"],
  ["git", "Modifications Git", "git", "git_read"],
  ["flags", "Feature flags", "flags", "flags"],
  ["alerts", "Alertes", "alerts"],
  ["reports", "Rapports", "reports"],
  ["checklist", "Tests fonctionnels", "tests"],
  ["audit", "Journal d'audit", "audit", "audit"],
  ["settings", "Paramètres", "settings"],
];
function hasCap(cap) { return !cap || (S.me && S.me.caps.includes(cap)); }

function renderNav() {
  $("#nav").innerHTML = NAV.filter(([, , , cap]) => hasCap(cap)).map(([id, label, ic]) =>
    `<a href="#${id}" data-id="${id}">${icon(ic)}<span>${label}</span>${id === "bugs" ? '<span class="nav-badge" id="navBugs" hidden></span>' : ""}${id === "alerts" ? '<span class="nav-badge" id="navAlerts" hidden></span>' : ""}</a>`
  ).join("");
}
const TITLES = Object.fromEntries(NAV.map(([id, label]) => [id, label]));

// ─── Routeur ─────────────────────────────────────────────────────────────────
const VIEWS = {};
function route() {
  const id = (location.hash.slice(1) || "overview");
  const [base] = id.split("/");
  if (!VIEWS[base] || !hasCap((NAV.find((n) => n[0] === base) || [])[3])) { location.hash = "overview"; return; }
  S.currentView = base; S.refresh = null;
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.id === base));
  $("#topbarTitle").textContent = TITLES[base] || "";
  document.getElementById("app").classList.remove("nav-open");
  const view = $("#view"); view.scrollTop = 0; view.focus();
  VIEWS[base](view, id.split("/").slice(1));
}
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function mount(html) { $("#view").innerHTML = html; }

// ─── Tiroir & alertes ────────────────────────────────────────────────────────
function openDrawer(title, html) {
  $("#drawerTitle").innerHTML = title; $("#drawerBody").innerHTML = html;
  $("#drawer").hidden = false; $("#drawerScrim").hidden = false;
}
function closeDrawer() { $("#drawer").hidden = true; $("#drawerScrim").hidden = true; }

// ═══════════════════════════════════════════════════════════════════════════
//  VUES
// ═══════════════════════════════════════════════════════════════════════════

// ── Vue d'ensemble ──────────────────────────────────────────────────────────
VIEWS.overview = async (view) => {
  mount(`<div id="ovSignups"></div>
    <div id="ovHealth"></div>
    <div class="grid kpi-grid" id="ovKpis"></div>
    <div class="cols cols-2" style="margin-top:16px">
      <div class="card chart-card"><h4>Activité en temps réel</h4><div class="chart-meta">Événements · erreurs · API — 30 dernières minutes</div><canvas class="chart" id="chartActivity"></canvas><div id="chartLegend" style="display:flex;gap:14px;margin-top:8px;font-size:12px"></div></div>
      <div class="card chart-card"><h4>Latence API</h4><div class="chart-meta">Temps de réponse moyen (ms) par minute</div><canvas class="chart" id="chartLatency"></canvas></div>
    </div>
    <div class="cols cols-3" style="margin-top:16px">
      <div class="card chart-card"><h4>Derniers événements</h4><div class="chart-meta">Flux live · <a href="#activity">tout voir</a></div><div id="ovFeed"></div></div>
      <div class="card card-pad"><h4 style="margin:0 0 12px">Score de préparation</h4><div style="display:flex;gap:16px;align-items:center"><div class="readiness-ring"><canvas id="ovGauge"></canvas><div class="r-num"><b id="ovScore">—</b><div class="muted" style="font-size:11px">sur 100</div></div></div><div id="ovFactors" style="flex:1;min-width:0"></div></div></div>
    </div>`);

  async function refresh() {
    const [ov, ts, ready, su] = await Promise.all([api.get("/overview"), api.get("/timeseries?minutes=30"), api.get("/readiness"), api.get("/signups").catch(() => null)]);
    // Hero — créations de compte (développement commercial)
    if (su) {
      $("#ovSignups").innerHTML = `<div class="hero-signups">
        <div class="hero-left">
          <div class="hero-label">${icon("users")} Comptes créés — développement commercial</div>
          <div class="hero-num">${num(su.total)}</div>
          <div class="hero-caption">${su.configured ? "Total des comptes réels inscrits sur Passio" : "Supabase non configuré (mode local)"}</div>
          <div class="hero-deltas">
            <span class="hero-delta up">${icon("zap")} <b>+${num(su.today)}</b> aujourd'hui</span>
            <span class="hero-delta"><b>+${num(su.week)}</b> cette semaine</span>
            <span class="hero-delta"><b>+${num(su.month)}</b> ce mois</span>
          </div>
        </div>
        <div class="hero-chart"><div class="hc-title">Nouveaux comptes · 14 jours</div><canvas class="chart" id="signupChart"></canvas></div>
      </div>`;
      const cum = []; let run = 0;
      (su.series || []).forEach((d) => { run += d.n; cum.push({ t: d.t, c: run }); });
      const base = su.total - run;   // niveau avant la fenêtre de 14 jours
      const curve = cum.map((d) => ({ t: d.t, total: base + d.c }));
      if (curve.length) lineChart($("#signupChart"), curve, [{ key: "total", color: "#a78bfa" }], { height: 90 });
    }
    // Santé
    const h = ov.health;
    $("#ovHealth").innerHTML = `<div class="health-banner ${h.level}"><div class="h-ring" style="background:var(--grad-soft);color:${h.level === "operational" ? "var(--ok)" : h.level === "critical" ? "var(--err)" : "var(--warn)"}">${h.apiErrorRate}%<br><span style="font-size:8px">err API</span></div><div><h3>Santé globale : ${h.label}</h3><p>${h.errors5m} erreur(s) sur 5 min · ${ov.totals.apiSuccessRate}% de requêtes API réussies · ${ov.ingest.realtimeOk ? "realtime connecté" : ov.ingest.supabaseReady ? "realtime en reconnexion" : "Supabase non configuré (mode local)"}</p></div></div>`;
    // KPIs
    const t = ov.totals;
    const K = [
      ["users", "Utilisateurs", num(t.users), t.onlineUsers + " en ligne"],
      ["wifi", "Appareils connectés", num(t.onlineDevices), t.sessions + " sessions actives"],
      ["activity", "Actifs (5 min)", num(t.activeUsers), t.actionsPerMin + " actions/min"],
      ["content", "Publications", num(t.publications), "posts + bobines"],
      ["messaging", "Messages", num(t.messages), t.comments + " commentaires"],
      ["zap", "Réactions", num(t.reactions), t.notifications + " notifs"],
      ["performance", "Latence moyenne", t.avgLatency + " ms", t.apiSuccessRate + "% succès API"],
      ["bugs", "Bugs ouverts", num(t.openBugs), t.criticalBugs + " critiques"],
    ];
    $("#ovKpis").innerHTML = K.map(([ic, l, v, s], i) => `<div class="kpi${i === 7 && t.criticalBugs ? " accent" : ""}"><div class="kpi-label">${icon(ic)}${l}</div><div class="kpi-value">${v}</div><div class="kpi-sub">${s}</div></div>`).join("");
    // Charts
    lineChart($("#chartActivity"), ts, [{ key: "events", color: "#8b5cf6", label: "Événements" }, { key: "api", color: "#38bdf8", label: "API", fill: false }, { key: "errors", color: "#ef4444", label: "Erreurs", fill: false }]);
    $("#chartLegend").innerHTML = [["Événements", "#8b5cf6"], ["API", "#38bdf8"], ["Erreurs", "#ef4444"]].map(([l, c]) => `<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:${c}"></span>${l}</span>`).join("");
    lineChart($("#chartLatency"), ts, [{ key: "latency", color: "#a78bfa", label: "Latence" }]);
    // Feed
    $("#ovFeed").innerHTML = S.buffer.slice(-8).reverse().map(feedRow).join("") || '<div class="empty" style="padding:24px">En attente d\'événements…</div>';
    // Readiness
    gauge($("#ovGauge"), ready.score); $("#ovScore").textContent = ready.score;
    bars($("#ovFactors"), ready.factors.map((f) => ({ label: f.label, value: f.score, max: 100, display: Math.round(f.score) })));
  }
  S.refresh = refresh; refresh();
};

// ── Ligne de flux réutilisable ──────────────────────────────────────────────
function feedRow(ev) {
  const meta = [ev.screen && "écran " + ev.screen, ev.duration_ms != null && ev.duration_ms + " ms", ev.http_status && "HTTP " + ev.http_status].filter(Boolean).join(" · ");
  return `<div class="feed-row" onclick='window.__evDetail(${JSON.stringify(ev.id)})'>
    <span class="fr-time">${hhmmss(ev.ts)}</span>
    <span class="fr-dot" style="background:${dotColor(ev)}"></span>
    <span class="fr-main"><b>${esc(actionLabel(ev))}</b> <span class="muted">· ${who(ev)} · ${ev.platform}/${ev.browser}</span><div class="fr-meta">${meta || ""}</div></span>
    <span class="fr-right"><span class="pill ${ev.type === "error" ? "error" : ev.status}">${TYPE_FR[ev.type] || ev.type}</span></span></div>`;
}
window.__evDetail = (id) => {
  const ev = S.buffer.find((e) => e.id === id); if (!ev) return;
  openDrawer("Détail de l'événement", `
    <div class="detail-grid">
      ${detail("Type", (TYPE_FR[ev.type] || ev.type) + " · " + esc(actionLabel(ev)))}
      ${detail("Horodatage", new Date(ev.ts).toLocaleString("fr-FR"))}
      ${detail("Profil", who(ev))}
      ${detail("Appareil", esc(deviceLabel(ev)) + " · v" + esc(ev.app_version))}
      ${detail("Écran", esc(ev.screen || "—"))}
      ${detail("Environnement", ev.env)}
      ${detail("Statut", `<span class="pill ${ev.type === "error" ? "error" : ev.status}">${ev.status}</span>`)}
      ${detail("Gravité", `<span class="sev-${ev.severity}">${ev.severity}</span>`)}
      ${ev.endpoint ? detail("Endpoint", `<span class="mono">${esc(ev.endpoint)}</span>`) : ""}
      ${ev.http_status ? detail("Code HTTP", ev.http_status) : ""}
      ${ev.duration_ms != null ? detail("Durée", ev.duration_ms + " ms") : ""}
      ${ev.correlation_id ? detail("Corrélation", `<span class="mono">${esc(ev.correlation_id)}</span>`) : ""}
    </div>
    ${ev.message ? `<div class="section-title">Message</div><div class="stack">${esc(ev.message)}</div>` : ""}
    ${ev.stack ? `<div class="section-title">Stack</div><div class="stack">${esc(ev.stack)}</div>` : ""}
    ${Object.keys(ev.meta || {}).length ? `<div class="section-title">Métadonnées</div><div class="stack">${esc(JSON.stringify(ev.meta, null, 2))}</div>` : ""}
    <div class="copy-row"><button class="btn btn-sm" onclick='window.__copy(${JSON.stringify(JSON.stringify(ev, null, 2))},"Événement")'>${icon("copy")} Copier le contexte</button>
    <a class="btn btn-sm" href="#activity/session/${esc(ev.session_id)}">${icon("route")} Parcours de la session</a></div>`);
};
window.__copy = (t, l) => copy(t, l);
const detail = (l, v) => `<div><div class="dl">${l}</div><div class="dv">${v}</div></div>`;

// ── Activité en direct ──────────────────────────────────────────────────────
VIEWS.activity = async (view, params) => {
  if (params[0] === "session") return renderJourney(params[1]);
  mount(`<div class="feed-toolbar">
      <select class="select" id="fType"><option value="">Tous types</option>${["nav", "action", "click", "api", "error", "session", "lifecycle", "perf"].map((t) => `<option value="${t}">${TYPE_FR[t]}</option>`).join("")}</select>
      <select class="select" id="fSev"><option value="">Toute gravité</option>${["critical", "error", "warn", "info"].map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
      <select class="select" id="fEnv"><option value="">Tout env.</option><option>production</option><option>preview</option><option>development</option></select>
      <input class="select" id="fUser" placeholder="Utilisateur…" style="width:140px" />
      <input class="select" id="fDevice" placeholder="Appareil…" style="width:140px" />
      <button class="chip-toggle" id="pauseBtn">${icon("pause")} <span>Pause</span></button>
      <button class="btn btn-sm" id="clearBtn">${icon("x")} Vider</button>
      <button class="btn btn-sm" id="exportBtn">${icon("download")} Exporter</button>
      <span class="muted" style="margin-left:auto;font-size:12px" id="feedCount"></span>
    </div>
    <div class="feed" id="feed"></div>`);
  const controls = ["fType", "fSev", "fEnv", "fUser", "fDevice"];
  const readFilters = () => ({ type: $("#fType").value, severity: $("#fSev").value, env: $("#fEnv").value, user: $("#fUser").value.trim(), device: $("#fDevice").value.trim() });
  function apply() {
    const f = readFilters();
    let rows = S.buffer.filter((e) =>
      (!f.type || e.type === f.type) && (!f.severity || e.severity === f.severity) && (!f.env || e.env === f.env) &&
      (!f.user || (e.user_label || e.user_id || "").toLowerCase().includes(f.user.toLowerCase())) &&
      (!f.device || (e.device_id || "").includes(f.device)));
    rows = rows.slice(-400).reverse();
    $("#feed").innerHTML = rows.map(feedRow).join("") || '<div class="empty">Aucun événement. Active la télémétrie sur Passio (<span class="mono">?telemetry=1</span>).</div>';
    $("#feedCount").textContent = rows.length + " événements";
  }
  controls.forEach((id) => $("#" + id).addEventListener("input", apply));
  $("#pauseBtn").onclick = () => { S.paused = !S.paused; $("#pauseBtn").classList.toggle("on", S.paused); $("#pauseBtn").querySelector("span").textContent = S.paused ? "Reprendre" : "Pause"; };
  $("#clearBtn").onclick = () => { $("#feed").innerHTML = '<div class="empty">Flux vidé (affichage). Les événements continuent d\'être collectés.</div>'; };
  $("#exportBtn").onclick = () => exportJson(S.buffer.slice(-500), "activite-passio");
  S.refresh = () => { if (!S.paused) apply(); };
  apply();
};

async function renderJourney(session) {
  mount(`<a href="#activity" class="btn btn-sm">${icon("activity")} Retour au flux</a><h2 class="page-title" style="margin-top:12px">Parcours de session</h2><p class="page-sub mono">${esc(session)}</p><div id="journey" class="card"></div>`);
  try {
    const evs = await api.get("/journey/" + encodeURIComponent(session));
    $("#journey").innerHTML = evs.length ? `<div class="feed">${evs.map(feedRow).join("")}</div>` : '<div class="empty">Aucun événement pour cette session.</div>';
  } catch { $("#journey").innerHTML = '<div class="empty">Session introuvable.</div>'; }
}

// ── Appareils ───────────────────────────────────────────────────────────────
VIEWS.devices = async () => {
  mount(`<h2 class="page-title">Appareils</h2><p class="page-sub">Vue temps réel des appareils connectés. Idéal pour observer tes deux appareils de test côte à côte.</p>
    <div class="feed-toolbar"><span class="muted" style="font-size:13px">Comparer :</span><select class="select" id="cmpA"></select><select class="select" id="cmpB"></select></div>
    <div class="device-compare" id="cmp"></div>
    <div class="section-title">Tous les appareils</div><div class="table-wrap"><table><thead><tr><th>Profil</th><th>Appareil</th><th>Écran actuel</th><th>Connexion</th><th>Erreurs</th><th>Dernière activité</th></tr></thead><tbody id="devRows"></tbody></table></div>`);
  async function refresh() {
    const devs = await api.get("/devices");
    if ($("#cmpA").options.length === 0 && devs.length) {
      const opts = devs.map((d) => `<option value="${d.deviceId}">${nameFor(d.userId, d.userLabel)} · ${d.platform}/${d.browser}</option>`).join("");
      $("#cmpA").innerHTML = opts; $("#cmpB").innerHTML = opts;
      if (devs[1]) $("#cmpB").value = devs[1].deviceId;
      $("#cmpA").onchange = $("#cmpB").onchange = () => drawCompare(devs);
    }
    drawCompare(devs);
    $("#devRows").innerHTML = devs.map((d) => `<tr onclick="location.hash='#activity'"><td><span class="pill ${d.online ? "ok" : "info"}">${d.online ? "en ligne" : "hors ligne"}</span> <strong>${nameFor(d.userId, d.userLabel)}</strong></td><td>${esc(deviceLabel(d))}</td><td>${esc(d.screen || "—")}</td><td>${esc(d.connection || "—")}</td><td>${d.errorCount || 0}</td><td class="muted">${ago(d.lastSeen)}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Aucun appareil.</td></tr>';
  }
  function drawCompare(devs) {
    const a = devs.find((d) => d.deviceId === $("#cmpA").value) || devs[0];
    const b = devs.find((d) => d.deviceId === $("#cmpB").value) || devs[1];
    $("#cmp").innerHTML = [a, b].map((d) => d ? deviceCard(d) : '<div class="card device-card"><div class="empty">Sélectionne un appareil</div></div>').join("");
  }
  S.refresh = refresh; refresh();
};
function deviceCard(d) {
  const sess = S.buffer.filter((e) => e.device_id === d.deviceId).slice(-6).reverse();
  return `<div class="card device-card"><div class="dc-head"><div class="dc-os">${(d.platform || "?").slice(0, 3).toUpperCase()}</div><div><strong>${nameFor(d.userId, d.userLabel)}</strong><div class="muted" style="font-size:12px">${d.platform} · ${d.browser} · v${esc(d.appVersion || "?")}</div></div><span class="pill ${d.online ? "ok" : "info"}" style="margin-left:auto">${d.online ? "en ligne" : ago(d.lastSeen)}</span></div>
    <div class="detail-grid" style="margin:8px 0">${detail("Écran", esc(d.screen || "—"))}${detail("Taille", esc(d.screenSize || "—"))}${detail("Connexion", esc(d.connection || "—"))}${detail("Erreurs", d.errorCount || 0)}${detail("Environnement", d.env)}</div>
    <div class="section-title" style="margin:10px 0 6px">Activité récente</div>${sess.map(feedRow).join("") || '<div class="muted" style="font-size:12px">—</div>'}</div>`;
}

// ── Utilisateurs ────────────────────────────────────────────────────────────
VIEWS.users = async () => {
  mount(`<h2 class="page-title">Utilisateurs</h2><p class="page-sub">Profils réels observés via la télémétrie (les comptes de test sont exclus). ${hasCap("test_users") ? "Gestion des comptes de test ci-dessous." : ""}</p>
    <div class="table-wrap"><table><thead><tr><th>Profil</th><th>Appareils</th><th>Dernière activité</th><th>Statut</th></tr></thead><tbody id="userRows"></tbody></table></div>
    ${hasCap("test_users") ? `<div class="section-title">Comptes de test</div><div class="card card-pad" id="testUsers"><span class="spinner"></span></div>` : ""}`);
  async function refresh() {
    const map = new Map();
    S.buffer.forEach((e) => { if (e.user_id) { const u = map.get(e.user_id) || { id: e.user_id, label: e.user_label, devices: new Set(), last: 0 }; u.label = e.user_label || u.label; if (e.device_id) u.devices.add(e.device_id); u.last = Math.max(u.last, e.ts); map.set(e.user_id, u); } });
    const users = [...map.values()].sort((a, b) => b.last - a.last);
    $("#userRows").innerHTML = users.map((u) => `<tr><td><strong>${nameFor(u.id, u.label)}</strong></td><td>${u.devices.size}</td><td class="muted">${ago(u.last)}</td><td><span class="pill ${Date.now() - u.last < 3e5 ? "ok" : "info"}">${Date.now() - u.last < 3e5 ? "actif" : "inactif"}</span></td></tr>`).join("") || '<tr><td colspan="4" class="empty">Aucun profil réel observé pour le moment.</td></tr>';
  }
  S.refresh = refresh; refresh();
  if (hasCap("test_users")) loadTestUsers();
};
async function loadTestUsers() {
  try {
    const r = await api.get("/test-users");
    if (!r.configured) { $("#testUsers").innerHTML = '<div class="muted">Supabase non configuré (service_role manquante).</div>'; return; }
    $("#testUsers").innerHTML = r.users.length ? `<p class="muted" style="margin-top:0;font-size:12px">Seuls les comptes jetables (<span class="mono">@passio-e2e.test</span>) sont listés. Les comptes réels sont protégés.</p>` + r.users.map((u) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-soft)"><span class="mono">${esc(u.email)}</span><button class="btn btn-sm btn-danger" onclick="window.__delTestUser('${u.id}')">${icon("trash")} Supprimer</button></div>`).join("") : '<div class="muted">Aucun compte de test.</div>';
  } catch (e) { $("#testUsers").innerHTML = `<div class="muted">${esc(e.message)}</div>`; }
}
window.__delTestUser = async (id) => { if (!confirm("Supprimer ce compte de test ?")) return; try { await api.del("/test-users/" + id); toast("Compte supprimé"); loadTestUsers(); } catch (e) { toast(e.message); } };

// ── Contenus & Messagerie (vues filtrées du flux) ───────────────────────────
VIEWS.content = () => filteredFeed("Contenus", "Publications, commentaires, likes et réactions en direct.", (e) => /publish_|comment_post|like_post|react|story|reel|carnet|event_/.test(e.action || ""));
VIEWS.messaging = () => filteredFeed("Messagerie", "Métadonnées de messages uniquement — aucun contenu privé n'est collecté (RGPD).", (e) => /send_message|conv_|message|call/.test(e.action || e.endpoint || ""));
function filteredFeed(title, sub, pred) {
  mount(`<h2 class="page-title">${title}</h2><p class="page-sub">${sub}</p><div class="feed" id="feed"></div>`);
  const apply = () => { $("#feed").innerHTML = S.buffer.filter(pred).slice(-200).reverse().map(feedRow).join("") || '<div class="empty">Aucun événement correspondant pour le moment.</div>'; };
  S.refresh = apply; apply();
}

// ── Bugs & erreurs ──────────────────────────────────────────────────────────
const BUG_STATUS = ["nouveau", "a_analyser", "en_cours", "correctif_propose", "en_test", "corrige", "rouvert", "ignore"];
VIEWS.bugs = async () => {
  mount(`<h2 class="page-title">Bugs & erreurs</h2><p class="page-sub">Erreurs regroupées automatiquement par empreinte (stack + message + version).</p>
    <div class="table-wrap"><table><thead><tr><th>Gravité</th><th>Bug</th><th>Occ.</th><th>Users</th><th>Statut</th><th>Écrans</th><th>Vu</th></tr></thead><tbody id="bugRows"></tbody></table></div>`);
  async function refresh() {
    const bugs = await api.get("/bugs");
    $("#bugRows").innerHTML = bugs.map((b) => `<tr onclick="window.__bug('${b.id}')"><td><span class="pill ${b.severity}">${b.severity}</span></td><td><strong>${esc(b.title)}</strong><div class="muted" style="font-size:11px">${esc(b.codeRef ? b.codeRef.file + (b.codeRef.line ? ":" + b.codeRef.line : "") : b.action || "")}</div></td><td>${b.count}</td><td>${b.users}</td><td><span class="pill ${b.status}">${b.status.replace(/_/g, " ")}</span></td><td class="muted" style="font-size:11px">${b.screens.slice(0, 3).join(", ") || "—"}</td><td class="muted">${ago(b.lastSeen)}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">Aucune erreur détectée. 🎉</td></tr>';
    const open = bugs.filter((b) => b.status !== "corrige" && b.status !== "ignore").length;
    const nb = $("#navBugs"); if (nb) { nb.hidden = !open; nb.textContent = open; }
  }
  S.refresh = refresh; refresh();
};
window.__bug = async (id) => {
  openDrawer("Chargement…", '<div class="empty"><span class="spinner"></span></div>');
  try {
    const b = await api.get("/bugs/" + id);
    const cr = b.codeRef;
    openDrawer(`Bug · <span class="pill ${b.severity}">${b.severity}</span>`, `
      <h3 style="margin:0 0 4px">${esc(b.title)}</h3>
      <div class="detail-grid">
        ${detail("Occurrences", b.count)}${detail("Utilisateurs touchés", b.users)}
        ${detail("Appareils", b.devices)}${detail("Première apparition", new Date(b.firstSeen).toLocaleString("fr-FR"))}
        ${detail("Dernière apparition", new Date(b.lastSeen).toLocaleString("fr-FR"))}${detail("Versions", (b.versions || []).join(", ") || "—")}
        ${detail("Écrans", (b.screens || []).join(", ") || "—")}${b.endpoint ? detail("Endpoint", `<span class="mono">${esc(b.endpoint)} (${b.httpStatus || "?"})</span>`) : ""}
      </div>
      <div class="section-title">Statut</div>
      <select class="select" id="bugStatus" style="width:100%">${BUG_STATUS.map((s) => `<option value="${s}" ${s === b.status ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}</select>
      ${cr ? `<div class="section-title">Code et diagnostic</div>
        <div class="code-panel"><div class="code-head"><span class="code-file">${esc(cr.file)}${cr.line ? ":" + cr.line : ""}${cr.fn ? " · " + esc(cr.fn) : ""}</span><button class="btn btn-sm btn-ghost" onclick='window.__copy(${JSON.stringify(cr.file)},"Chemin")'>${icon("copy")}</button></div>
        <div class="code-body">${b.snippet ? b.snippet.lines.map((l) => `<div class="code-line ${l.hot ? "hot" : ""}"><span class="ln">${l.n}</span><span>${esc(l.code)}</span></div>`).join("") : '<div style="padding:10px" class="muted">Extrait indisponible (fichier non résolu dans le dépôt local).</div>'}</div></div>` : ""}
      ${b.message ? `<div class="section-title">Message</div><div class="stack">${esc(b.message)}</div>` : ""}
      ${b.stack ? `<div class="section-title">Stack trace</div><div class="stack">${esc(b.stack)}</div>` : ""}
      <div class="copy-row">
        <button class="btn btn-sm" onclick='window.__copy(${JSON.stringify(b.message || "")},"Erreur")'>${icon("copy")} Erreur</button>
        <button class="btn btn-sm" onclick='window.__copy(${JSON.stringify(b.stack || "")},"Stack")'>${icon("copy")} Stack</button>
        ${b.snippet ? `<button class="btn btn-sm" onclick='window.__copy(${JSON.stringify(b.snippet.lines.map((l) => l.code).join("\n"))},"Code")'>${icon("copy")} Extrait</button>` : ""}
        <button class="btn btn-sm" onclick='window.__copy(${JSON.stringify(JSON.stringify(b, null, 2))},"Contexte complet")'>${icon("copy")} Contexte complet</button>
        ${hasCap("claude") ? `<button class="btn btn-sm btn-primary" onclick="window.__claudeFromBug('${b.id}')">${icon("claude")} Envoyer à Claude Code</button>` : ""}
      </div>`);
    $("#bugStatus").onchange = async (e) => { await api.patch("/bugs/" + id, { status: e.target.value }); toast("Statut mis à jour"); if (S.currentView === "bugs") S.refresh?.(); };
  } catch (e) { openDrawer("Erreur", `<div class="empty">${esc(e.message)}</div>`); }
};
window.__claudeFromBug = (id) => { location.hash = "claude/" + id; closeDrawer(); };

// ── Performances ────────────────────────────────────────────────────────────
VIEWS.performance = async () => {
  mount(`<h2 class="page-title">Performances</h2><p class="page-sub">Latence et fiabilité des appels API observés côté client.</p>
    <div class="grid kpi-grid" id="perfKpis"></div>
    <div class="card chart-card" style="margin-top:16px"><h4>Latence API (30 min)</h4><canvas class="chart" id="perfChart"></canvas></div>
    <div class="section-title">Endpoints</div><div class="table-wrap"><table><thead><tr><th>Endpoint</th><th>Appels</th><th>Moy. (ms)</th><th>p95 (ms)</th><th>Max</th><th>Erreurs</th></tr></thead><tbody id="perfRows"></tbody></table></div>`);
  async function refresh() {
    const [p, ts] = await Promise.all([api.get("/performance"), api.get("/timeseries?minutes=30")]);
    const slow = p.api.filter((a) => a.p95 > 1500).length;
    $("#perfKpis").innerHTML = [["performance", "Endpoints suivis", p.api.length, ""], ["clock", "Plus lent (p95)", (p.api[0] ? Math.max(...p.api.map((a) => a.p95)) : 0) + " ms", ""], ["zap", "Endpoints lents", slow, "p95 > 1,5 s"], ["services", "Santé", p.health.label, p.health.apiErrorRate + "% err"]].map(([ic, l, v, s]) => `<div class="kpi"><div class="kpi-label">${icon(ic)}${l}</div><div class="kpi-value" style="font-size:22px">${v}</div><div class="kpi-sub">${s}</div></div>`).join("");
    lineChart($("#perfChart"), ts, [{ key: "latency", color: "#a78bfa" }]);
    $("#perfRows").innerHTML = p.api.map((a) => `<tr><td class="mono">${esc(a.endpoint)}</td><td>${a.calls}</td><td>${a.avg}</td><td class="${a.p95 > 1500 ? "sev-warn" : ""}">${a.p95}</td><td>${a.max}</td><td>${a.errorRate ? `<span class="sev-error">${a.errorRate}%</span>` : "0%"}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Aucune donnée API.</td></tr>';
  }
  S.refresh = refresh; refresh();
};

// ── Services ────────────────────────────────────────────────────────────────
VIEWS.services = async () => {
  mount(`<h2 class="page-title">Carte des services</h2><p class="page-sub">État dérivé du trafic observé (10 dernières minutes).</p><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))" id="svcGrid"></div>`);
  async function refresh() {
    const svc = await api.get("/services");
    $("#svcGrid").innerHTML = svc.map((s) => `<div class="card card-pad"><div style="display:flex;justify-content:space-between;align-items:center"><strong>${esc(s.name)}</strong><span class="pill ${s.status}">${({ operational: "opérationnel", slow: "ralenti", degraded: "dégradé", down: "indisponible", unknown: "inconnu" })[s.status]}</span></div><div class="detail-grid" style="margin:10px 0 0">${detail("Échantillons", s.samples)}${detail("Erreurs", s.errorRate + "%")}${detail("Latence", s.avgLatency != null ? s.avgLatency + " ms" : "—")}${detail("Vu", s.lastSeen ? ago(s.lastSeen) : "—")}</div></div>`).join("");
  }
  S.refresh = refresh; refresh();
};

// ── Base de données ─────────────────────────────────────────────────────────
VIEWS.database = async () => {
  mount(`<h2 class="page-title">Base de données</h2><p class="page-sub">Supervision en lecture seule. Aucune donnée de ligne, aucun secret. Opérations destructives désactivées.</p><div id="dbBody"><span class="spinner"></span></div>`);
  try {
    const d = await api.get("/database");
    if (!d.configured) { $("#dbBody").innerHTML = '<div class="empty">Supabase non configuré (service_role manquante dans .env).</div>'; return; }
    $("#dbBody").innerHTML = `<div class="grid kpi-grid">
      ${[["Appels DB (15 min)", d.activity.dbCalls15m], ["Requêtes lentes", d.activity.slowQueries], ["Requêtes en échec", d.activity.failedQueries], ["Taux de succès", d.activity.successRate + "%"]].map(([l, v]) => `<div class="kpi"><div class="kpi-label">${icon("database")}${l}</div><div class="kpi-value">${v}</div></div>`).join("")}</div>
      <div class="section-title">Volumétrie des tables</div>
      <div class="table-wrap"><table><thead><tr><th>Table</th><th class="right">Lignes</th></tr></thead><tbody>${Object.entries(d.counts).map(([t, c]) => `<tr><td class="mono">${esc(t)}</td><td class="right">${c == null ? '<span class="muted">n/a</span>' : num(c)}</td></tr>`).join("")}</tbody></table></div>`;
  } catch (e) { $("#dbBody").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
};

// ── Sessions de test ────────────────────────────────────────────────────────
VIEWS.sessions = async (view, params) => {
  if (params[0]) return renderSessionReport(params[0]);
  mount(`<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><div><h2 class="page-title">Sessions de test</h2><p class="page-sub" style="margin:0">Regroupe une campagne (ex. « Benjamin + testeur 2 ») et son activité.</p></div>${hasCap("sessions") ? `<button class="btn btn-primary" id="newSession">${icon("play")} Nouvelle session</button>` : ""}</div>
    <div id="sessForm"></div><div id="sessList" style="margin-top:16px"></div>`);
  if (hasCap("sessions")) $("#newSession").onclick = showSessionForm;
  async function refresh() {
    const list = await api.get("/test-sessions");
    $("#sessList").innerHTML = list.length ? list.map((s) => `<div class="card card-pad" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><strong>${esc(s.name)}</strong> <span class="pill ${s.status === "running" ? "en_cours" : s.status === "ended" ? "corrige" : "info"}">${s.status}</span><div class="muted" style="font-size:12px;margin-top:2px">${(s.participants || []).map(esc).join(", ") || "—"} · ${(s.features || []).length} fonctionnalités · ${(s.notes || []).length} notes · ${(s.bugs || []).length} bugs</div></div><div style="display:flex;gap:6px;flex-wrap:wrap">${sessionControls(s)}</div></div></div>`).join("") : '<div class="empty">Aucune session. Crée-en une pour démarrer un test.</div>';
  }
  S.refresh = null; refresh(); VIEWS._sessRefresh = refresh;
};
function sessionControls(s) {
  const c = hasCap("sessions");
  let btns = "";
  if (c) {
    if (s.status === "created" || s.status === "paused") btns += `<button class="btn btn-sm" onclick="window.__sessCtl('${s.id}','${s.status === "paused" ? "resume" : "start"}')">${icon("play")} ${s.status === "paused" ? "Reprendre" : "Démarrer"}</button>`;
    if (s.status === "running") btns += `<button class="btn btn-sm" onclick="window.__sessCtl('${s.id}','pause')">${icon("pause")} Pause</button>`;
    if (s.status !== "ended") btns += `<button class="btn btn-sm" onclick="window.__sessNote('${s.id}')">Note</button><button class="btn btn-sm btn-danger" onclick="window.__sessCtl('${s.id}','end')">Terminer</button>`;
  }
  btns += `<a class="btn btn-sm" href="#sessions/${s.id}">${icon("reports")} Rapport</a>`;
  return btns;
}
window.__sessCtl = async (id, action) => { await api.post(`/test-sessions/${id}/${action}`, {}); toast("Session : " + action); VIEWS._sessRefresh?.(); };
window.__sessNote = async (id) => { const text = prompt("Note :"); if (text) { await api.post(`/test-sessions/${id}/note`, { text }); toast("Note ajoutée"); VIEWS._sessRefresh?.(); } };
function showSessionForm() {
  $("#sessForm").innerHTML = `<div class="card card-pad" style="margin-top:14px"><div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
    <label class="field"><span>Nom du test</span><input id="sName" value="Test complet Passio — Benjamin et testeur 2" /></label>
    <label class="field"><span>Participants (virgules)</span><input id="sPart" placeholder="Benjamin, Testeur 2" /></label>
    <label class="field"><span>Appareils</span><input id="sDev" placeholder="iPhone 13, Pixel 7" /></label>
    <label class="field"><span>Environnement</span><select id="sEnv"><option>production</option><option>preview</option><option>development</option></select></label>
    <label class="field" style="grid-column:1/-1"><span>Fonctionnalités à tester (virgules)</span><input id="sFeat" placeholder="messagerie, publication, notifications" /></label>
    <label class="field" style="grid-column:1/-1"><span>Objectifs / notes</span><textarea id="sObj" rows="2"></textarea></label>
  </div><div style="display:flex;gap:8px"><button class="btn btn-primary" id="sCreate">Créer la session</button><button class="btn" onclick="document.getElementById('sessForm').innerHTML=''">Annuler</button></div></div>`;
  $("#sCreate").onclick = async () => {
    const body = { name: $("#sName").value, participants: $("#sPart").value.split(",").map((s) => s.trim()).filter(Boolean), devices: $("#sDev").value.split(",").map((s) => s.trim()).filter(Boolean), features: $("#sFeat").value.split(",").map((s) => s.trim()).filter(Boolean), environment: $("#sEnv").value, objectives: $("#sObj").value };
    await api.post("/test-sessions", body); $("#sessForm").innerHTML = ""; toast("Session créée"); VIEWS._sessRefresh?.();
  };
}
async function renderSessionReport(id) {
  mount(`<a href="#sessions" class="btn btn-sm">${icon("sessions")} Retour</a><div id="rep" style="margin-top:12px"><span class="spinner"></span></div>`);
  try {
    const r = await api.get(`/test-sessions/${id}/report`);
    const sm = r.summary;
    $("#rep").innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><div><h2 class="page-title">${esc(r.session.name)}</h2><p class="page-sub" style="margin:0">Durée ${Math.round(r.window.durationMs / 60000)} min · ${r.session.status}</p></div><div style="display:flex;gap:6px"><button class="btn btn-sm" onclick='window.__copy(${JSON.stringify(JSON.stringify(r, null, 2))},"Rapport")'>${icon("copy")} JSON</button><button class="btn btn-sm" id="repCsv">${icon("download")} CSV</button><button class="btn btn-sm" id="repJson">${icon("download")} JSON</button></div></div>
      <div class="grid kpi-grid" style="margin-top:12px">${[["Événements", sm.totalEvents], ["Erreurs", sm.errors], ["Bugs auto", sm.bugsAuto], ["Bugs manuels", sm.bugsManual], ["Critiques", sm.criticalBugs], ["Latence moy.", sm.avgLatency + " ms"], ["Appareils", sm.devices], ["Participants", sm.participants.length]].map(([l, v]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value" style="font-size:22px">${v}</div></div>`).join("")}</div>
      <div class="cols cols-2" style="margin-top:16px"><div class="card card-pad"><h4 style="margin-top:0">Écrans parcourus</h4><div id="repScreens"></div></div><div class="card card-pad"><h4 style="margin-top:0">Répartition par type</h4><div id="repTypes"></div></div></div>
      ${r.bugs.length ? `<div class="section-title">Bugs de la fenêtre</div>${r.bugs.map((b) => `<div class="card card-pad" style="margin-bottom:8px;cursor:pointer" onclick="window.__bug('${b.id}')"><span class="pill ${b.severity}">${b.severity}</span> <strong>${esc(b.title)}</strong> <span class="muted">· ${b.count} occ.</span></div>`).join("")}` : ""}
      ${r.session.notes.length ? `<div class="section-title">Notes</div>${r.session.notes.map((n) => `<div class="card card-pad" style="margin-bottom:6px"><span class="muted" style="font-size:11px">${new Date(n.ts).toLocaleString("fr-FR")} · ${esc(n.author || "")}</span><div>${esc(n.text)}</div></div>`).join("")}` : ""}`;
    bars($("#repScreens"), Object.entries(r.byScreen).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k, value: v, max: Math.max(...Object.values(r.byScreen), 1) })));
    bars($("#repTypes"), Object.entries(r.byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: TYPE_FR[k] || k, value: v, max: Math.max(...Object.values(r.byType), 1) })));
    $("#repJson").onclick = () => exportJson(r, "rapport-" + id);
    $("#repCsv").onclick = () => exportCsv(r.timeline, "rapport-" + id);
  } catch (e) { $("#rep").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

// ── Tests fonctionnels (checklist) ──────────────────────────────────────────
const CHK_STATUS = ["non_teste", "en_cours", "reussi", "echoue", "bloque", "bug_cree"];
VIEWS.checklist = async () => {
  mount(`<h2 class="page-title">Tests fonctionnels</h2><p class="page-sub">Checklist des fonctions de Passio. Clique un statut pour le changer.</p><div id="chk"></div>`);
  const items = await api.get("/checklist");
  const byCat = {}; items.forEach((i) => (byCat[i.category] = byCat[i.category] || []).push(i));
  $("#chk").innerHTML = Object.entries(byCat).map(([cat, its]) => `<div class="section-title">${esc(cat)}</div><div class="table-wrap"><table><thead><tr><th>Fonction</th><th>Statut</th><th>Testeur</th><th>Notes</th></tr></thead><tbody>${its.map((i) => `<tr><td>${esc(i.name)}</td><td>${hasCap("sessions") ? `<select class="select" data-chk="${i.id}">${CHK_STATUS.map((s) => `<option value="${s}" ${s === i.status ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`).join("")}</select>` : `<span class="pill ${i.status}">${i.status}</span>`}</td><td>${esc(i.tester || "—")}</td><td class="muted">${esc(i.notes || "—")}</td></tr>`).join("")}</tbody></table></div>`).join("");
  $$("[data-chk]").forEach((sel) => sel.onchange = async () => { await api.patch("/checklist/" + sel.dataset.chk, { status: sel.value, tester: S.me.user }); toast("Statut mis à jour"); });
};

// ── Tests automatiques ──────────────────────────────────────────────────────
VIEWS.tests = async () => {
  const canRun = hasCap("tests");
  mount(`<h2 class="page-title">Tests automatiques</h2><p class="page-sub">Suites autorisées (liste blanche). Sortie en direct ci-dessous.</p>
    <div id="suites" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))"></div>
    <div class="section-title">Console de test <button class="btn btn-sm" id="clearLog" style="float:right">${icon("x")} Effacer</button></div>
    <div class="stack" id="testLog" style="max-height:340px">${S.testLog.join("") || "En attente…"}</div>`);
  const d = await api.get("/tests");
  $("#suites").innerHTML = d.suites.map((s) => `<div class="card card-pad"><strong>${esc(s.label)}</strong><div class="mono muted" style="font-size:11px;margin:6px 0 10px">${esc(s.cmd)}</div>${canRun ? `<button class="btn btn-sm btn-primary" onclick="window.__runTest('${s.id}')" ${d.current.running ? "disabled" : ""}>${icon("play")} Lancer</button>` : '<span class="muted" style="font-size:12px">Lecture seule</span>'}</div>`).join("");
  if (d.current.running && canRun) $("#suites").insertAdjacentHTML("afterbegin", `<div class="card card-pad accent" style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center"><span><span class="spinner"></span> Test en cours…</span><button class="btn btn-sm btn-danger" onclick="window.__stopTest()">${icon("pause")} Arrêter</button></div>`);
  $("#clearLog").onclick = () => { S.testLog = []; $("#testLog").innerHTML = "En attente…"; };
};
window.__runTest = async (id) => { try { S.testLog = []; await api.post("/tests/run", { id }); toast("Test lancé"); VIEWS.tests($("#view")); } catch (e) { toast(e.message); } };
window.__stopTest = async () => { await api.post("/tests/stop", {}); toast("Arrêt demandé"); };

// ── Claude Code ─────────────────────────────────────────────────────────────
VIEWS.claude = async (view, params) => {
  mount(`<h2 class="page-title">Assistant Claude Code</h2><p class="page-sub">Prépare un contexte de diagnostic à partir d'un bug réel, puis copie-le dans Claude Code (ou lance l'analyse en direct si une clé API est configurée).</p>
    <div id="clWrap"><div class="empty"><span class="spinner"></span></div></div>`);
  let bugs = [];
  try { bugs = await api.get("/bugs"); } catch (e) { $("#clWrap").innerHTML = `<div class="empty">Erreur de chargement : ${esc(e.message)}</div>`; return; }

  if (!bugs.length) {
    $("#clWrap").innerHTML = `<div class="card card-pad"><div class="empty">${icon("claude")}<p>Aucun bug détecté pour l'instant.</p><p class="muted" style="font-size:13px">Dès qu'une erreur remonte (onglet « Bugs &amp; erreurs »), reviens ici : tu génères un contexte complet (stack, code, chronologie) prêt pour Claude Code.</p></div></div>`;
    return;
  }

  $("#clWrap").innerHTML = `
    <div class="feed-toolbar">
      <label class="muted" style="font-size:13px">Bug :</label>
      <select class="select" id="clBug" style="min-width:300px">${bugs.map((b) => `<option value="${b.id}">[${b.severity}] ${esc(b.title).slice(0, 70)} (${b.count}×)</option>`).join("")}</select>
      <button class="btn btn-primary" id="clBuild">${icon("claude")} Construire le contexte</button>
      <button class="btn" id="clAnalyze" title="Nécessite ANTHROPIC_API_KEY">${icon("zap")} Analyser en direct</button>
    </div>
    <div id="clStatus"></div>
    <label class="field" style="max-width:640px"><span>Note pour Claude (optionnel — ce que tu faisais, ce que tu attendais)</span><input id="clNote" placeholder="Ex : j'envoyais un message vocal et l'écran s'est figé" /></label>
    <div class="cols cols-2">
      <div class="card chart-card"><h4>Prompt généré <button class="btn btn-sm" style="float:right" id="clCopy">${icon("copy")} Copier</button></h4>
        <textarea id="clPrompt" rows="20" style="font-family:var(--mono);font-size:12px;width:100%" placeholder="Choisis un bug puis « Construire le contexte »…"></textarea></div>
      <div class="card chart-card"><h4>Analyse de Claude</h4>
        <div id="clOut" class="stack" style="max-height:520px">L'analyse en direct nécessite <span class="mono">ANTHROPIC_API_KEY</span> dans <span class="mono">.env</span>. Sinon : « Construire le contexte » puis « Copier », et colle dans Claude Code.</div></div>
    </div>`;

  if (params[0]) { const opt = [...$("#clBug").options].find((o) => o.value === params[0]); if (opt) $("#clBug").value = params[0]; }

  async function build() {
    const bugId = $("#clBug").value; if (!bugId) return toast("Aucun bug sélectionné");
    $("#clStatus").innerHTML = '<p class="page-sub"><span class="spinner"></span> Construction du contexte…</p>';
    try {
      const r = await api.post("/claude/context", { bugId });
      $("#clPrompt").value = r.prompt + ($("#clNote").value.trim() ? "\n\n## Note du testeur\n" + $("#clNote").value.trim() : "");
      $("#clStatus").innerHTML = `<p class="page-sub">${r.apiConfigured ? "Contexte prêt. API configurée : tu peux « Analyser en direct »." : "Contexte prêt. Clique « Copier » et colle-le dans Claude Code (pas de clé API configurée)."}</p>`;
    } catch (e) { $("#clStatus").innerHTML = `<p class="page-sub sev-error">Erreur : ${esc(e.message)}</p>`; toast(e.message); }
  }
  $("#clBug").onchange = build;
  $("#clBuild").onclick = build;
  $("#clCopy").onclick = () => { const v = $("#clPrompt").value.trim(); v ? copy(v, "Prompt") : toast("Construis d'abord le contexte"); };
  $("#clAnalyze").onclick = async () => {
    const bugId = $("#clBug").value; if (!bugId) return toast("Aucun bug sélectionné");
    $("#clOut").innerHTML = '<span class="spinner"></span> Analyse en cours…';
    try {
      const r = await api.post("/claude/analyze", { bugId, note: $("#clNote").value.trim() });
      if (r.prompt && !$("#clPrompt").value) $("#clPrompt").value = r.prompt;
      $("#clOut").innerHTML = r.analysis ? esc(r.analysis) : `<div class="muted">${esc(r.hint || r.error || "Analyse indisponible (configure ANTHROPIC_API_KEY dans .env).")}</div>`;
    } catch (e) { $("#clOut").innerHTML = `<div class="sev-error">Erreur : ${esc(e.message)}</div>`; }
  };
  build();
};

// ── Modifications Git ───────────────────────────────────────────────────────
VIEWS.git = async () => {
  mount(`<h2 class="page-title">Modifications Git</h2><p class="page-sub">Dépôt Passio. Les mutations exigent une confirmation et sont journalisées. Jamais de push, jamais sur <span class="mono">main</span>.</p><div id="gitBody"><span class="spinner"></span></div>`);
  try {
    const [st, br, log] = await Promise.all([api.get("/git/status"), api.get("/git/branches"), api.get("/git/log?n=15")]);
    $("#gitBody").innerHTML = `
      <div class="cols cols-2"><div class="card card-pad"><h4 style="margin-top:0">État</h4><div class="detail-grid">${detail("Branche", `<span class="mono">${esc(st.branch)}</span>`)}${detail("Fichiers modifiés", st.files.length)}${detail("En avance / retard", st.ahead + " / " + st.behind)}${detail("Dépôt", `<span class="mono" style="font-size:11px">${esc(st.repo)}</span>`)}</div>${st.files.length ? `<div class="stack" style="margin-top:10px">${st.files.map((f) => `<div>${esc(f.state)}  ${esc(f.file)}</div>`).join("")}</div>` : '<p class="muted">Arbre de travail propre.</p>'}</div>
      <div class="card card-pad"><h4 style="margin-top:0">Branches</h4>${br.map((b) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border-soft)"><span class="mono">${esc(b.name)}${b.protected ? ' <span class="tag">protégée</span>' : ""}</span><span class="muted" style="font-size:11px">${esc(b.date)}</span></div>`).join("")}</div></div>
      <div class="section-title">Commits récents</div><div class="table-wrap"><table><tbody>${log.map((c) => `<tr><td class="mono">${esc(c.hash)}</td><td>${esc(c.subject)}</td><td class="muted nowrap">${esc(c.author)} · ${esc(c.date)}</td></tr>`).join("")}</tbody></table></div>
      ${hasCap("git_mutate") && S.me.allowMutations ? gitMutations() : `<p class="page-sub" style="margin-top:16px">${icon("git")} Les opérations de modification sont ${S.me.allowMutations ? "réservées au rôle admin" : "désactivées (production ou DASH_ALLOW_MUTATIONS=false)"}.</p>`}`;
    if (hasCap("git_mutate") && S.me.allowMutations) wireGitMutations();
  } catch (e) { $("#gitBody").innerHTML = `<div class="empty">Git indisponible : ${esc(e.message)}</div>`; }
};
function gitMutations() {
  return `<div class="section-title">Appliquer un correctif (sécurisé)</div><div class="card card-pad">
    <p class="muted" style="margin-top:0;font-size:12px">Le patch est appliqué sur une NOUVELLE branche dédiée après vérification. Aucune promotion vers main. Étapes : diff → validation → branche → application → tests.</p>
    <label class="field"><span>Nom de la branche</span><input id="gBranch" value="fix/depuis-dashboard" /></label>
    <label class="field"><span>Patch (format git diff)</span><textarea id="gPatch" rows="8" style="font-family:var(--mono);font-size:12px"></textarea></label>
    <label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:10px"><input type="checkbox" id="gConfirm" style="width:auto" /> Je confirme l'application de ce patch sur une branche de test.</label>
    <button class="btn btn-primary" id="gApply">${icon("git")} Créer la branche & appliquer</button></div>`;
}
function wireGitMutations() {
  $("#gApply").onclick = async () => {
    if (!$("#gConfirm").checked) return toast("Confirme d'abord l'opération.");
    try { const r = await api.post("/git/apply", { branch: $("#gBranch").value, patch: $("#gPatch").value, confirm: true }); toast("Patch appliqué sur " + r.branch); VIEWS.git($("#view")); }
    catch (e) { toast(e.message); }
  };
}

// ── Feature flags ───────────────────────────────────────────────────────────
VIEWS.flags = async () => {
  mount(`<h2 class="page-title">Feature flags</h2><p class="page-sub">Activation ciblée de fonctionnalités. Chaque changement est audité.</p><div id="flagList"></div>`);
  async function refresh() {
    const flags = await api.get("/flags");
    $("#flagList").innerHTML = flags.map((f) => `<div class="card card-pad" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><strong>${esc(f.label)}</strong> <span class="mono muted" style="font-size:11px">${esc(f.key)}</span><div class="muted" style="font-size:12px;margin-top:2px">Déploiement ${f.rollout}% · ${f.targetUsers.length} users ciblés</div></div><div style="display:flex;gap:10px;align-items:center"><label style="font-size:12px;display:flex;gap:6px;align-items:center"><input type="range" min="0" max="100" value="${f.rollout}" data-roll="${f.id}" style="width:110px" /> <span data-rollv="${f.id}">${f.rollout}%</span></label><button class="chip-toggle ${f.enabled ? "on" : ""}" data-flag="${f.id}" data-en="${f.enabled}">${f.enabled ? "Activé" : "Désactivé"}</button></div></div></div>`).join("");
    $$("[data-flag]").forEach((b) => b.onclick = async () => { const en = b.dataset.en !== "true"; await api.patch("/flags/" + b.dataset.flag, { enabled: en }); toast("Flag mis à jour"); refresh(); });
    $$("[data-roll]").forEach((r) => { r.oninput = () => { $(`[data-rollv="${r.dataset.roll}"]`).textContent = r.value + "%"; }; r.onchange = async () => { await api.patch("/flags/" + r.dataset.roll, { rollout: Number(r.value) }); toast("Déploiement ajusté"); }; });
  }
  refresh();
};

// ── Alertes ─────────────────────────────────────────────────────────────────
VIEWS.alerts = async () => {
  mount(`<h2 class="page-title">Alertes</h2><p class="page-sub">Situations anormales détectées automatiquement.</p><div id="alList"></div>`);
  const alerts = await api.get("/alerts");
  S.alerts = alerts; updateAlertBadges();
  $("#alList").innerHTML = alerts.length ? alerts.map(alertItem).join("") : '<div class="empty">Aucune alerte. Tout va bien.</div>';
};
function alertItem(a) {
  return `<div class="alert-item ${a.level} ${a.acknowledged ? "ack" : ""}"><div class="a-title">${esc(a.title)}</div><div class="a-msg">${esc(a.message || "")}</div><div class="a-time">${new Date(a.ts).toLocaleString("fr-FR")}${a.acknowledged ? " · vu" : hasCap("alerts") ? ` · <a href="#" onclick="window.__ackAlert('${a.id}');return false">marquer comme vu</a>` : ""}</div></div>`;
}
window.__ackAlert = async (id) => { await api.post(`/alerts/${id}/ack`, {}); const a = S.alerts.find((x) => x.id === id); if (a) a.acknowledged = true; if (S.currentView === "alerts") VIEWS.alerts($("#view")); updateAlertBadges(); };

// ── Audit ───────────────────────────────────────────────────────────────────
VIEWS.audit = async () => {
  mount(`<h2 class="page-title">Journal d'audit</h2><p class="page-sub">Toutes les actions sensibles, tracées.</p><div class="table-wrap"><table><thead><tr><th>Horodatage</th><th>Action</th><th>Acteur</th><th>Détails</th></tr></thead><tbody id="auRows"></tbody></table></div>`);
  const items = await api.get("/audit?limit=300");
  $("#auRows").innerHTML = items.map((i) => `<tr><td class="muted nowrap">${new Date(i.ts).toLocaleString("fr-FR")}</td><td><span class="tag">${esc(i.action)}</span></td><td>${esc(i.actor || "—")}</td><td class="mono muted" style="font-size:11px">${esc(JSON.stringify(i.details || {}))}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">Journal vide.</td></tr>';
};

// ── Rapports ────────────────────────────────────────────────────────────────
VIEWS.reports = async () => {
  mount(`<h2 class="page-title">Rapports</h2><p class="page-sub">Génère et exporte le rapport d'une session de test.</p><div class="feed-toolbar"><select class="select" id="repSel" style="min-width:280px"></select><a class="btn btn-primary" id="repOpen">${icon("reports")} Ouvrir le rapport</a></div>`);
  const list = await api.get("/test-sessions");
  $("#repSel").innerHTML = list.length ? list.map((s) => `<option value="${s.id}">${esc(s.name)} (${s.status})</option>`).join("") : '<option value="">Aucune session</option>';
  $("#repOpen").onclick = (e) => { if ($("#repSel").value) location.hash = "sessions/" + $("#repSel").value; };
};

// ── Paramètres ──────────────────────────────────────────────────────────────
VIEWS.settings = async () => {
  const ov = await api.get("/overview").catch(() => ({ ingest: {} }));
  mount(`<h2 class="page-title">Paramètres</h2><p class="page-sub">Configuration et état du centre de pilotage.</p>
    <div class="cols cols-2">
      <div class="card card-pad"><h4 style="margin-top:0">Session</h4><div class="detail-grid">${detail("Utilisateur", esc(S.me.user))}${detail("Rôle", `<span class="pill info">${S.me.role}</span>`)}${detail("Environnement", `<span class="env-badge ${S.me.env}">${S.me.env}</span>`)}${detail("Mutations code", S.me.allowMutations ? "autorisées" : "désactivées")}${detail("Permissions", S.me.caps.map((c) => `<span class="tag">${c}</span>`).join(""))}</div></div>
      <div class="card card-pad"><h4 style="margin-top:0">Collecte</h4><div class="detail-grid">${detail("Supabase", ov.ingest.supabaseReady ? "connecté" : "non configuré")}${detail("Realtime", ov.ingest.realtimeOk ? "actif" : "inactif")}${detail("Événements en mémoire", num(ov.ingest.buffered))}</div>
      <div class="section-title">Activer la télémétrie sur un appareil</div><p class="muted" style="font-size:13px">Ouvre Passio avec <span class="mono">?telemetry=1</span> sur chaque appareil de test (opt-in RGPD). Ex :</p><div class="stack">https://passio-app.netlify.app/?telemetry=1</div></div>
    </div>
    <div class="card card-pad" style="margin-top:14px"><h4 style="margin-top:0">Apparence</h4><button class="btn" id="setTheme">${icon("moon")} Basculer le thème</button></div>`);
  $("#setTheme").onclick = toggleTheme;
};

// ─── Export ──────────────────────────────────────────────────────────────────
function download(name, content, mime) { const b = new Blob([content], { type: mime }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }
function exportJson(data, name) { download(name + ".json", JSON.stringify(data, null, 2), "application/json"); toast("Export JSON"); }
function exportCsv(rows, name) {
  if (!rows || !rows.length) return toast("Rien à exporter");
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  download(name + ".csv", csv, "text/csv"); toast("Export CSV");
}

// ═══════════════════════════════════════════════════════════════════════════
//  TEMPS RÉEL + THÈME + CHROME
// ═══════════════════════════════════════════════════════════════════════════
let refreshThrottle = 0;
function onLiveEvent(ev) {
  if (S.paused) return;
  learnName(ev);
  S.buffer.push(ev);
  if (S.buffer.length > 2000) S.buffer.shift();
  if (LIVE.has(S.currentView) && S.refresh) {
    const now = Date.now();
    if (now - refreshThrottle > 1200) { refreshThrottle = now; S.refresh(); }
  }
}
function onAlert(a) {
  S.alerts.unshift(a); updateAlertBadges();
  toast("⚠ " + a.title);
  if (S.currentView === "alerts") $("#alList").insertAdjacentHTML("afterbegin", alertItem(a));
}
function updateAlertBadges() {
  const open = S.alerts.filter((a) => !a.acknowledged).length;
  const c = $("#alertsCount"); if (c) { c.hidden = !open; c.textContent = open; }
  const nb = $("#navAlerts"); if (nb) { nb.hidden = !open; nb.textContent = open; }
}
function onTest(t) {
  if (t.phase === "log") { S.testLog.push(esc(t.text)); if (S.testLog.length > 800) S.testLog.shift(); }
  else if (t.phase === "start") S.testLog.push(`<b>▶ ${esc(t.label)}</b>\n`);
  else if (t.phase === "end") { S.testLog.push(`\n<b>${t.code === 0 ? "✓ Succès" : "✗ Échec (code " + t.code + ")"}</b>\n`); toast(t.code === 0 ? "Test réussi" : "Test échoué"); if (S.currentView === "tests") VIEWS.tests($("#view")); }
  if (S.currentView === "tests") { const el = $("#testLog"); if (el) { el.innerHTML = S.testLog.join(""); el.scrollTop = el.scrollHeight; } }
}
function setSse(on) { const s = $("#sseStatus"); s.classList.toggle("on", on); s.querySelector(".sse-label").textContent = on ? "temps réel actif" : "reconnexion…"; }

function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next; localStorage.setItem("dash_theme", next);
  $("#themeBtn").innerHTML = icon(next === "dark" ? "sun" : "moon");
  if (S.refresh) S.refresh();
}

// ─── Boot ────────────────────────────────────────────────────────────────────
async function boot() {
  document.documentElement.dataset.theme = localStorage.getItem("dash_theme") || "dark";
  try {
    S.me = await api.get("/me");
    showApp();
  } catch { showLogin(); }
}
function showLogin() {
  $("#app").hidden = true; $("#loginScreen").hidden = false;
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault(); $("#loginError").textContent = "";
    try { S.me = await api.post("/login", { user: $("#loginUser").value, password: $("#loginPass").value }); location.reload(); }
    catch (err) { $("#loginError").textContent = err.message; }
  };
  $("#loginUser").focus();
}
async function showApp() {
  $("#loginScreen").hidden = true; $("#app").hidden = false;
  $("#userName").textContent = S.me.user; $("#userRole").textContent = S.me.role;
  const eb = $("#envBadge"); eb.textContent = S.me.env; eb.className = "env-badge " + S.me.env;
  $("#themeBtn").innerHTML = icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon");
  $("#logoutBtn").innerHTML = icon("logout");
  $("#fullscreenBtn").innerHTML = icon("maximize");
  $("#alertsBtn").innerHTML = icon("alerts");
  renderNav();
  // Amorçage : buffer initial + alertes
  try { S.buffer = (await api.get("/events?limit=500")).reverse(); learnNames(S.buffer); } catch {}
  try { Object.assign(S.names, await api.get("/names")); } catch {}
  // Rafraîchit les pseudos résolus par le serveur toutes les 30 s.
  setInterval(async () => { try { Object.assign(S.names, await api.get("/names")); if (LIVE.has(S.currentView) && S.refresh) S.refresh(); } catch {} }, 30000);
  try { S.alerts = await api.get("/alerts"); updateAlertBadges(); } catch {}
  // SSE
  connectStream({
    open: () => setSse(true), error: () => setSse(false),
    event: onLiveEvent, alert: onAlert, test: onTest, ping: () => setSse(true),
  });
  // Événements UI
  window.addEventListener("hashchange", route);
  window.addEventListener("dash:unauth", () => showLogin());
  $("#logoutBtn").onclick = async () => { await api.post("/logout", {}); location.reload(); };
  $("#themeBtn").onclick = toggleTheme;
  $("#menuToggle").onclick = () => document.getElementById("app").classList.toggle("nav-open");
  $("#drawerClose").onclick = closeDrawer; $("#drawerScrim").onclick = closeDrawer;
  $("#alertsBtn").onclick = () => location.hash = "alerts";
  $("#globalSearch").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.value.trim()) { location.hash = "activity"; setTimeout(() => { const u = $("#fUser"); if (u) { u.value = e.target.value.trim(); u.dispatchEvent(new Event("input")); } }, 60); } });
  $("#fullscreenBtn").onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDrawer(); } });
  // Rafraîchissement périodique doux des vues non-live basées sur agrégats
  setInterval(() => { if (["overview", "performance", "services"].includes(S.currentView) && S.refresh) S.refresh(); }, 10000);
  route();
}
boot();
