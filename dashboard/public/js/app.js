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
  notifs: [],                 // centre de notifications (tout ce qui se passe)
  notifSeen: 0,               // ts au-delà duquel les notifs sont « non lues »
  currentView: "overview",
  refresh: null,              // fonction de rafraîchissement de la vue active
  testLog: [],
  names: {},                  // uid -> pseudo public (résolu au fil des événements)
  alias: {},                  // uid -> "Visiteur N" pour les inconnus (stable)
  aliasN: 0,
};
const $ = (s, r = document) => r.querySelector(s);
const LIVE = new Set(["overview", "activity", "devices", "users", "content", "links", "visitors", "messaging", "services", "performance", "bugs", "traces"]);

// ─── Utilitaires ─────────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hhmmss = (ts) => new Date(ts).toLocaleTimeString("fr-FR", { hour12: false });
function ago(ts) {
  if (!ts) return "—"; const s = (Date.now() - ts) / 1000;
  if (s < 60) return Math.floor(s) + "s"; if (s < 3600) return Math.floor(s / 60) + "min";
  if (s < 86400) return Math.floor(s / 3600) + "h"; return Math.floor(s / 86400) + "j";
}
const SEV_COLOR = { critical: "var(--crit)", error: "var(--err)", warn: "var(--warn)", info: "var(--info)", debug: "var(--muted-2)" };
const TYPE_FR = { nav: "Navigation", action: "Action", click: "Clic", error: "Erreur", api: "API", perf: "Perf", session: "Session", lifecycle: "Cycle de vie", connectivity: "Connexion", link: "Lien", db: "Base" };
function dotColor(ev) { return ev.type === "error" ? SEV_COLOR[ev.severity] || "var(--err)" : ev.type === "connectivity" ? (SEV_COLOR[ev.severity] || "var(--warn)") : (ev.type === "link" && ev.action === "link_open") ? "var(--ok)" : ev.status === "error" ? "var(--err)" : ev.status === "slow" ? "var(--warn)" : ev.type === "api" ? "var(--info)" : ev.type === "link" ? "#c084fc" : "var(--accent)"; }
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600); }
async function copy(text, label) { try { await navigator.clipboard.writeText(text); toast((label || "Copié") + " ✓"); } catch { toast("Copie impossible"); } }
function num(n) { return (n == null ? "—" : n.toLocaleString("fr-FR")); }
// Numéro de téléphone lisible : « +33 6 12 34 56 78 » ou « 06 12 34 56 78 ».
function fmtPhone(p) {
  const s = String(p || "").trim();
  if (!s) return "";
  if (s[0] === "+") { const cc = s.slice(0, 3), rest = s.slice(3).replace(/(.{2})/g, "$1 ").trim(); return cc + " " + rest; }
  return s.replace(/(.{2})/g, "$1 ").trim();
}

// ─── Lisibilité : noms de profil au lieu d'identifiants ───────────────────────
// Libellés lisibles des actions métier (au lieu de "publish_post" etc.).
const ACTION_FR = {
  publish_post: "Publication", publish_reel: "Bobine publiée", like_post: "J'aime",
  unlike_post: "J'aime retiré", comment_post: "Commentaire", send_message: "Message envoyé",
  event_join: "Inscription événement", event_leave: "Désinscription", screen_view: "Écran consulté",
  window_error: "Erreur", unhandled_rejection: "Erreur (promesse)", heartbeat: "Présence",
  start: "Début de session", end: "Fin de session", hidden: "Onglet masqué", visible: "Onglet visible",
  offline: "Hors ligne", online: "Reconnecté", send_failed: "Envoi échoué (réseau)",
  recovered: "Connexion rétablie", server_reject: "Lot rejeté (serveur)",
  link_create: "Lien créé", link_share: "Lien partagé", link_copy: "Lien copié",
  link_open: "Lien ouvert (confirmé)", link_load_error: "Échec d'ouverture du lien",
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
// [id, libellé, icône, capacité requise?, groupe]
// Groupe "essentiel" = ce qu'un utilisateur non-technique regarde tous les jours.
// Groupe "avance"    = outils de dev/QA, regroupés plus bas et repliables.
const NAV = [
  ["overview", "Accueil", "home", null, "essentiel"],
  ["brief", "Brief exécutif", "reports", null, "essentiel"],
  ["activity", "Tout ce qui se passe", "activity", null, "essentiel"],
  ["users", "Comptes & connexions", "users", null, "essentiel"],
  ["content", "Contenus & interactions", "heart", null, "essentiel"],
  ["links", "Liens partagés", "share", null, "essentiel"],
  ["visitors", "Visiteurs", "route", null, "essentiel"],
  ["kpi", "KPI produit", "trending", null, "essentiel"],
  ["traces", "Traçage des actions", "route", null, "essentiel"],
  ["integrity", "Intégrité des données", "database", "db", "essentiel"],
  ["interactions", "Vérif. interactions", "wifi", null, "essentiel"],
  ["qa", "Campagne QA", "tests", null, "essentiel"],
  ["bugs", "Problèmes", "bugs", null, "essentiel"],
  ["sentinel", "Sentinelle", "sparkles", "claude", "essentiel"],
  ["claude", "Réparer avec Claude", "wrench", "claude", "essentiel"],

  ["sessions", "Sessions de test", "sessions", null, "avance"],
  ["devices", "Appareils", "devices", null, "avance"],
  ["messaging", "Messagerie", "messaging", null, "avance"],
  ["performance", "Performances", "performance", null, "avance"],
  ["services", "Services", "services", null, "avance"],
  ["sources", "Sources de données", "server", null, "avance"],
  ["database", "Base de données", "database", "db", "avance"],
  ["tests", "Tests automatiques", "tests", null, "avance"],
  ["checklist", "Tests fonctionnels", "reports", null, "avance"],
  ["git", "Modifications Git", "git", "git_read", "avance"],
  ["flags", "Feature flags", "flags", "flags", "avance"],
  ["alerts", "Alertes", "alerts", null, "avance"],
  ["reports", "Rapports", "reports", null, "avance"],
  ["audit", "Journal d'audit", "audit", "audit", "avance"],
  ["settings", "Paramètres", "settings", null, "avance"],
];
function hasCap(cap) { return !cap || (S.me && S.me.caps.includes(cap)); }
const navLink = ([id, label, ic]) =>
  `<a href="#${id}" data-id="${id}">${icon(ic)}<span>${label}</span>${id === "bugs" ? '<span class="nav-badge" id="navBugs" hidden></span>' : ""}${id === "alerts" ? '<span class="nav-badge" id="navAlerts" hidden></span>' : ""}</a>`;

function renderNav() {
  const ess = NAV.filter((n) => n[4] === "essentiel" && hasCap(n[3]));
  const adv = NAV.filter((n) => n[4] === "avance" && hasCap(n[3]));
  const advOpen = localStorage.getItem("dash_adv_open") === "1";
  $("#nav").innerHTML =
    `<div class="nav-group-label">L'essentiel</div>${ess.map(navLink).join("")}` +
    (adv.length ? `<button class="nav-group-toggle${advOpen ? " open" : ""}" id="advToggle">${icon("settings")}<span>Outils avancés</span><span class="nav-caret">${icon("route")}</span></button>
       <div class="nav-adv${advOpen ? " open" : ""}" id="navAdv">${adv.map(navLink).join("")}</div>` : "");
  const t = $("#advToggle");
  if (t) t.onclick = () => { const el = $("#navAdv"); const now = !el.classList.contains("open"); el.classList.toggle("open", now); t.classList.toggle("open", now); localStorage.setItem("dash_adv_open", now ? "1" : "0"); };
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
  // Si la vue active est un outil avancé, déplie le groupe pour la rendre visible.
  const navItem = NAV.find((n) => n[0] === base);
  if (navItem && navItem[4] === "avance") { $("#navAdv")?.classList.add("open"); $("#advToggle")?.classList.add("open"); }
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

// ─── Réparation « en un clic » avec Claude ────────────────────────────────────
// Petit rendu Markdown → HTML (sûr : on échappe d'abord, puis on stylise).
function mdToHtml(md) {
  let s = esc(md || "");
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => `<pre class="md-code">${code.replace(/\n$/, "")}</pre>`);
  s = s.replace(/`([^`]+)`/g, '<code class="md-inline">$1</code>');
  s = s.replace(/^### (.*)$/gm, "<h5>$1</h5>").replace(/^## (.*)$/gm, "<h4>$1</h4>").replace(/^# (.*)$/gm, "<h3>$1</h3>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>").replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>").replace(/<\/ul>\s*<ul>/g, "");
  s = s.replace(/^(\d+)\. (.*)$/gm, "<li>$2</li>");
  s = s.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  return `<p>${s}</p>`;
}

// Point d'entrée UNIQUE du bouton « Réparer avec Claude », partout dans l'app.
// payload : { bugId } (bug groupé) OU { event } (une erreur brute du flux).
async function fixWithClaude(payload, title) {
  if (!hasCap("claude")) return toast("Réparation Claude non disponible pour ce rôle.");
  fixWithClaude._last = payload; fixWithClaude._lastTitle = title;
  const deep = payload && payload.deep;
  const load = deep
    ? `<span class="spinner"></span><p style="margin-top:10px">Analyse approfondie en cours… Claude lit ton vrai code.</p><p class="muted" style="font-size:12px">Jusqu'à 3-5 minutes — laisse le panneau ouvert.</p>`
    : `<span class="spinner"></span><p style="margin-top:10px">Claude analyse le problème…</p><p class="muted" style="font-size:12px">Environ 30 à 60 secondes — laisse le panneau ouvert.</p>`;
  openDrawer(`${icon("wrench")} Réparer ce problème`,
    `<div class="fix-intro">${esc(title || "Problème détecté")}</div>
     <div class="empty" id="fixBody">${load}</div>`);
  try {
    const r = await api.post("/claude/quickfix", payload);
    renderFixResult(r);
  } catch (e) {
    $("#fixBody").outerHTML = `<div class="fix-body"><div class="fix-note err">${icon("alertTriangle")} Impossible de contacter l'assistant : ${esc(e.message)}</div></div>`;
  }
}
window.__fixWithClaude = fixWithClaude;
window.__fixEvent = (id) => { const ev = S.buffer.find((e) => e.id === id); if (ev) fixWithClaude({ event: trimEvent(ev) }, actionLabel(ev)); };
window.__fixBug = (id, title) => fixWithClaude({ bugId: id }, title);
// Réparer depuis une alerte : on retrouve l'alerte par id (jamais de texte dans l'onclick).
window.__fixAlert = (id) => { const a = S.alerts.find((x) => x.id === id); if (a) fixWithClaude({ event: { message: a.title, stack: a.message || "", severity: "error", type: "error" } }, a.title); };
function trimEvent(e) { return { id: e.id, ts: e.ts, type: e.type, action: e.action, screen: e.screen, message: e.message, stack: e.stack, severity: e.severity, endpoint: e.endpoint, http_status: e.http_status, session_id: e.session_id, app_version: e.app_version, user_id: e.user_id, device_id: e.device_id }; }

function renderFixResult(r) {
  // Affiche le vrai libellé du problème dans l'intro (on ne le passe plus via l'onclick).
  const intro = $("#drawerBody .fix-intro"); if (intro && r.title) intro.textContent = r.title;
  // Bouton COPIER — bien visible, épinglé en haut (accessible sans faire défiler).
  const copyBtn = `<button class="btn btn-primary btn-block fix-copy" onclick='window.__copy(${JSON.stringify(r.prompt || "")},"Instructions pour Claude Code")'>${icon("copy")} Copier tout pour Claude Code</button>`;
  const wasDeep = fixWithClaude._last && fixWithClaude._last.deep;
  const canDeep = !wasDeep && r.via === "cli" && !r.authNeeded;
  const deepBtn = canDeep ? `<button class="btn btn-block fix-deep" id="fixDeep">${icon("sparkles")} Analyse approfondie — lit ton vrai code (~3-5 min)</button>` : "";
  const actions = `<div class="fix-actions">${copyBtn}${deepBtn}</div>`;

  let note = "", content = "";
  if (r.error && r.authNeeded) {
    note = `<div class="fix-note err">${icon("alertTriangle")} Claude Code doit être reconnecté (c'est gratuit).<br>Ouvre une <b>invite de commandes</b> et tape exactement <span class="md-inline">claude auth login</span>, connecte-toi dans la page web, puis reviens cliquer sur la clé ${icon("wrench")}.</div>`;
  } else if (r.error) {
    note = `<div class="fix-note err">${icon("alertTriangle")} L'analyse automatique a échoué (${esc(r.error)}). Tu peux quand même copier les instructions et les coller dans Claude Code.</div>`;
  } else if (r.analysis) {
    note = `<div class="fix-note ok">${icon("checkCircle")} ${wasDeep ? "Analyse approfondie terminée (Claude a lu ton code)." : "Claude a analysé le problème."} Lis « En clair » ci-dessous, puis <b>Copie tout</b> et colle-le dans Claude Code pour appliquer le correctif.</div>`;
    content = `<div class="fix-analysis">${mdToHtml(r.analysis)}</div>`;
  } else {
    note = `<div class="fix-note">${icon("sparkles")} ${esc(r.hint || "Instructions prêtes.")}</div>`;
    content = `<details class="fix-details"><summary>Voir les instructions envoyées à Claude</summary><pre class="md-code">${esc(r.prompt || "")}</pre></details>`;
  }
  const more = `<div class="fix-more">
      <input id="fixNote" class="select" style="width:100%" placeholder="Ajouter une précision (ex : ça arrive quand j'envoie un vocal)…" />
      <button class="btn btn-sm" id="fixRelaunch">${icon("refresh")} Relancer</button>
    </div>`;
  const html = note + actions + content + more;
  const body = $("#fixBody");
  if (body) body.outerHTML = `<div class="fix-body" id="fixBody">${html}</div>`;
  const rl = $("#fixRelaunch");
  if (rl) rl.onclick = () => { const note2 = $("#fixNote").value.trim(); fixWithClaude({ ...fixWithClaude._last, note: note2 }, fixWithClaude._lastTitle); };
  const dp = $("#fixDeep");
  if (dp) dp.onclick = () => fixWithClaude({ ...fixWithClaude._last, deep: true }, fixWithClaude._lastTitle);
}

// ═══════════════════════════════════════════════════════════════════════════
//  VUES
// ═══════════════════════════════════════════════════════════════════════════

// ── Accueil (vue d'ensemble simplifiée, sans jargon) ─────────────────────────
VIEWS.overview = async (view) => {
  mount(`<div id="ovProv"></div>
    <div id="ovState"></div>
    <div id="ovConn"></div>
    <div class="home-cards" id="ovCards"></div>
    <div id="ovLinks"></div>
    <div class="cols cols-2" style="margin-top:16px">
      <div class="card chart-card"><h4>Ce qui se passe en direct</h4><div class="chart-meta">Les dernières actions des utilisateurs · <a href="#activity">tout voir</a></div><div id="ovFeed"></div></div>
      <div class="card chart-card"><h4>Nouveaux comptes — 14 derniers jours</h4><div class="chart-meta">Chaque point = un jour</div><canvas class="chart" id="signupChart" style="margin-top:8px"></canvas><div id="ovSignupLegend" class="muted" style="font-size:12px;margin-top:8px"></div></div>
    </div>`);

  async function refresh() {
    const [ov, su, bugs] = await Promise.all([api.get("/overview"), api.get("/signups").catch(() => null), api.get("/bugs").catch(() => [])]);
    const t = ov.totals, h = ov.health;
    const openBugs = (bugs || []).filter((b) => b.status !== "corrige" && b.status !== "ignore");
    const worst = openBugs.slice().sort((a, b) => (b.severity === "critical") - (a.severity === "critical") || b.count - a.count)[0];

    // ── Provenance des données (RÉEL vs LOCAL, temps réel, fraîcheur) ─────────
    // Principe : jamais afficher une donnée sans dire d'où elle vient ni quand.
    const ing = ov.ingest || {};
    const dataReal = !!ing.supabaseReady;
    const hasData = (ing.buffered || 0) > 0;
    const lastSeen = ing.lastSeenIso ? Date.parse(ing.lastSeenIso) : null;
    const provItem = (ic, k, v) => `<div class="prov-item"><span class="prov-ic">${icon(ic)}</span><span class="prov-k">${k}</span><span class="prov-v">${v}</span></div>`;
    $("#ovProv").innerHTML = `<div class="prov-strip">
      ${provItem("database", "Données", dataReal ? `<span class="prov-pill ok">RÉEL · Supabase</span>` : `<span class="prov-pill off">LOCAL · non connecté</span>`)}
      ${provItem("wifi", "Temps réel", ing.realtimeOk ? `<span class="prov-pill ok">actif</span>` : dataReal ? `<span class="prov-pill off">secours (polling)</span>` : `<span class="prov-pill off">—</span>`)}
      ${provItem("clock", "Fraîcheur", hasData && lastSeen ? `dernier signal il y a ${ago(lastSeen)}` : "aucun signal reçu")}
      ${provItem("server", "En mémoire", `${num(ing.buffered || 0)} évén.`)}
      <span class="prov-note">Source : télémétrie Passio (PII-safe, opt-out) · vue à ${hhmmss(ov.updatedAt)}</span>
    </div>`;

    // ── Bandeau d'état, en français simple (honnête sur la dispo des données) ─
    // §91 : « pilotage sans données » ≠ « Passio en bonne santé ». Ne jamais
    // afficher « tout va bien » quand on ne reçoit simplement rien.
    const problems = openBugs.length;
    let level, title, sub, banIco;
    if (!dataReal) {
      level = "nodata"; banIco = "database";
      title = "Centre de pilotage en mode local";
      sub = "Supabase n'est pas connecté : aucune donnée réelle de Passio n'est reçue. Cela ne dit rien de la santé de Passio — renseigne .env pour brancher les données.";
    } else if (!hasData) {
      level = "nodata"; banIco = "database";
      title = "En attente de données";
      sub = "Connecté à Supabase, mais aucun événement reçu pour l'instant. Ouvre Passio sur un appareil pour voir l'activité apparaître ici.";
    } else if (t.criticalBugs || h.level === "critical") {
      level = "bad"; banIco = "alertTriangle";
      title = `${t.criticalBugs || problems} problème${(t.criticalBugs || problems) > 1 ? "s" : ""} important${(t.criticalBugs || problems) > 1 ? "s" : ""} à corriger`;
      sub = "Clique sur « Réparer avec Claude » : il explique et corrige.";
    } else if (problems || h.errors5m) {
      level = "warn"; banIco = "alertTriangle";
      title = `${problems || h.errors5m} petit${(problems || h.errors5m) > 1 ? "s" : ""} problème${(problems || h.errors5m) > 1 ? "s" : ""} détecté${(problems || h.errors5m) > 1 ? "s" : ""}`;
      sub = "Rien de bloquant. Tu peux le réparer en un clic quand tu veux.";
    } else {
      level = "ok"; banIco = "checkCircle";
      title = "Tout fonctionne bien";
      sub = "Aucun problème détecté. Tu peux tester tranquillement.";
    }
    const liveTag = (dataReal && hasData) ? `<div class="state-live"><span class="live-dot"></span>EN DIRECT</div>` : "";
    const fixBtn = (dataReal && hasData && worst && hasCap("claude"))
      ? `<button class="btn btn-primary state-fix" onclick="window.__fixBug('${worst.id}')">${icon("wrench")} Réparer avec Claude</button>`
      : (dataReal && hasData && problems) ? `<a class="btn btn-primary state-fix" href="#bugs">${icon("wrench")} Voir les problèmes</a>` : "";
    $("#ovState").innerHTML = `<div class="state-banner ${level}">
      <div class="state-ico">${icon(banIco)}</div>
      <div class="state-txt"><h2>${esc(title)}</h2><p>${esc(sub)}</p></div>
      ${liveTag}
      ${fixBtn}</div>`;

    // ── Problèmes de CONNEXION des testeurs (bandeau dédié, très visible) ─────
    // §demande Benjamin : une coupure réseau d'un testeur doit APPARAÎTRE.
    const strug = t.strugglingDevices || 0, connIss = t.connectivityIssues || 0;
    if (dataReal && (strug || connIss)) {
      $("#ovConn").innerHTML = `<div class="state-banner warn" style="margin-top:12px">
        <div class="state-ico">${icon("wifi")}</div>
        <div class="state-txt"><h2>${strug ? `${num(strug)} testeur${strug > 1 ? "s" : ""} en difficulté de connexion` : `${num(connIss)} incident${connIss > 1 ? "s" : ""} de connexion`}</h2>
          <p>${connIss ? `${num(connIss)} coupure${connIss > 1 ? "s" : ""}/échec${connIss > 1 ? "s" : ""} d'envoi sur 30 min. ` : ""}Détail dans « Appareils » et « Problèmes ».</p></div>
        <a class="btn btn-primary state-fix" href="#devices">${icon("devices")} Voir les appareils</a></div>`;
    } else { $("#ovConn").innerHTML = ""; }

    // ── Les 3 chiffres qui comptent ─────────────────────────────────────────
    const partages = t.publications;
    const interactions = t.reactions + t.comments + t.messages;
    const cards = [
      { ic: "users", accent: "a", label: "Comptes créés", big: num(su ? su.total : t.users),
        sub: su && su.configured ? `<b class="up">+${num(su.today)}</b> aujourd'hui · +${num(su.week)} cette semaine · +${num(su.month)} ce mois`
          : "Total des inscrits sur Passio",
        foot: `${icon("wifi")} ${num(t.onlineUsers)} connecté${t.onlineUsers > 1 ? "s" : ""} en ce moment` },
      { ic: "heart", accent: "b", label: "Contenus partagés", big: num(partages),
        sub: "Publications, bobines et stories créées",
        foot: `${icon("sparkles")} ${num(interactions)} interaction${interactions > 1 ? "s" : ""} (j'aime, commentaires, messages)` },
      { ic: "activity", accent: "c", label: "En ce moment", big: num(t.onlineUsers),
        sub: `personne${t.onlineUsers > 1 ? "s" : ""} en train d'utiliser l'app`,
        foot: `${icon("zap")} ${num(t.actionsPerMin)} action${t.actionsPerMin > 1 ? "s" : ""} par minute · ${num(t.activeUsers)} actif${t.activeUsers > 1 ? "s" : ""}` },
    ];
    $("#ovCards").innerHTML = cards.map((c) => `<div class="home-card ${c.accent}">
      <div class="hc-top"><span class="hc-ico">${icon(c.ic)}</span><span class="hc-label">${c.label}</span></div>
      <div class="hc-big">${c.big}</div>
      <div class="hc-sub">${c.sub}</div>
      <div class="hc-foot">${c.foot}</div></div>`).join("");

    // ── Suivi des liens partagés (entonnoir honnête, aperçu accueil) ─────────
    const lk = ov.links || {};
    if (dataReal && (lk.total || 0) > 0) {
      const seg = (label, val, cls) => `<div class="ovlk-seg"><span class="ovlk-n ${cls || ""}">${num(val)}</span><span class="ovlk-l">${label}</span></div>`;
      $("#ovLinks").innerHTML = `<div class="card card-pad ovlk" style="margin-top:14px">
        <div class="ovlk-head"><strong>${icon("share")} Liens partagés</strong>
          <span class="muted" style="font-size:12px">${num(lk.createdToday || 0)} créés · ${num(lk.openedToday || 0)} ouverts aujourd'hui · <a href="#links">détail</a></span></div>
        <div class="ovlk-row">
          ${seg("créés", lk.created || 0)}
          <span class="ovlk-arrow">${icon("route")}</span>
          ${seg("partagés", lk.shared || 0)}
          <span class="ovlk-arrow">${icon("route")}</span>
          ${seg("ouvertures confirmées", lk.opened || 0, "ok")}
          <span class="ovlk-arrow">${icon("route")}</span>
          ${seg("non confirmés", lk.sharedUnconfirmed || 0, (lk.sharedUnconfirmed || 0) > 0 ? "warn" : "")}
          <div class="ovlk-seg ovlk-rate"><span class="ovlk-n">${lk.openRate == null ? "n/a" : lk.openRate + " %"}</span><span class="ovlk-l">taux d'ouverture</span></div>
        </div>
        <div class="muted" style="font-size:11.5px;margin-top:8px">Une ouverture n'est comptée que sur signal réel reçu — jamais supposée.</div></div>`;
    } else { $("#ovLinks").innerHTML = ""; }

    // ── Flux live simplifié ─────────────────────────────────────────────────
    $("#ovFeed").innerHTML = S.buffer.slice(-9).reverse().map(feedRow).join("") || '<div class="empty" style="padding:24px">En attente… Ouvre Passio sur un téléphone pour voir l\'activité apparaître ici.</div>';

    // ── Courbe des inscriptions ─────────────────────────────────────────────
    if (su && su.configured) {
      const cum = []; let run = 0;
      (su.series || []).forEach((d) => { run += d.n; cum.push({ t: d.t, c: run }); });
      const base = su.total - run;
      const curve = cum.map((d) => ({ t: d.t, total: base + d.c }));
      if (curve.length) lineChart($("#signupChart"), curve, [{ key: "total", color: "#a78bfa" }], { height: 150 });
      $("#ovSignupLegend").textContent = `${num(su.total)} comptes au total · +${num(su.week)} sur 7 jours`;
    } else {
      $("#ovSignupLegend").innerHTML = "Supabase non connecté (mode local) — les inscriptions réelles s'afficheront ici une fois configuré.";
    }
  }
  S.refresh = refresh; refresh();
};

// ── KPI produit (utilisateurs actifs réels) ──────────────────────────────────
VIEWS.kpi = async (view) => {
  mount(`<p class="page-sub">Utilisateurs identifiés réellement actifs, calculés sur <span class="mono">telemetry_events</span> (pas le flux live borné). Les valeurs non calculables restent marquées « inconnu » — jamais inventées.</p>
    <div id="kpiProv"></div>
    <div class="grid kpi-grid" id="kpiCards"></div>
    <div class="card chart-card" style="margin-top:16px"><h4>Utilisateurs actifs par jour — 14 derniers jours</h4><div class="chart-meta">Chaque point = utilisateurs identifiés distincts ce jour-là</div><canvas class="chart" id="dauChart" style="margin-top:8px"></canvas></div>`);

  async function refresh() {
    let k, ret;
    try { [k, ret] = await Promise.all([api.get("/kpi"), api.get("/retention").catch(() => null)]); }
    catch (e) { $("#kpiCards").innerHTML = `<div class="empty">Erreur : ${esc(e.message)}</div>`; return; }
    if (!k || k.configured === false) {
      $("#kpiProv").innerHTML = "";
      $("#kpiCards").innerHTML = `<div class="empty" style="grid-column:1/-1;padding:28px">${icon("database")} Supabase non connecté (mode local) — les KPI réels s'afficheront ici une fois <span class="mono">.env</span> renseigné.</div>`;
      return;
    }
    if (k.error) { $("#kpiCards").innerHTML = `<div class="empty" style="grid-column:1/-1">Lecture impossible : ${esc(k.error)}</div>`; return; }

    // Provenance + confiance (honnêteté sur la fiabilité de la mesure).
    const conf = k.confidence === "partial"
      ? `<span class="prov-pill off">confiance partielle</span>`
      : `<span class="prov-pill ok">confiance élevée</span>`;
    $("#kpiProv").innerHTML = `<div class="prov-strip">
      <div class="prov-item"><span class="prov-ic">${icon("database")}</span><span class="prov-k">Source</span><span class="prov-v">telemetry_events · utilisateurs identifiés</span></div>
      <div class="prov-item"><span class="prov-k">Fiabilité</span><span class="prov-v">${conf}</span></div>
      <span class="prov-note">${k.partial ? "Lecture tronquée (25 000 lignes max) — MAU sous-estimé · " : ""}vue à ${hhmmss(k.updatedAt)}</span>
    </div>`;

    const val = (n) => (n == null ? '<span class="muted">inconnu</span>' : num(n));
    const pct = (n) => (n == null ? '<span class="muted">inconnu</span>' : n + " %");
    const cards = [
      { label: "Actifs aujourd'hui (DAU)", big: val(k.dau), sub: "utilisateurs identifiés distincts · 24 h" },
      { label: "Actifs sur 7 j (WAU)", big: val(k.wau), sub: "utilisateurs identifiés distincts · 7 j" },
      { label: "Actifs sur 30 j (MAU)", big: val(k.mau), sub: "utilisateurs identifiés distincts · 30 j" },
      { label: "Habitude (DAU/MAU)", big: pct(k.stickiness), sub: "plus c'est haut, plus l'usage est quotidien" },
      { label: "Taux de retour 7 j", big: pct(k.returnRate7), sub: k.returnBase ? `${num(k.returnCount)} / ${num(k.returnBase)} actifs de la semaine précédente revenus` : "base insuffisante" },
    ];
    // Rétention par cohorte : réelle (profiles.created_at × retour télémétrie),
    // ou « données insuffisantes » tant que la fenêtre n'est pas couverte.
    const retCard = (label, w) => {
      const r = ret && !ret.error && ret.configured !== false ? ret["j" + w] : null;
      if (!r) return { label, big: '<span class="muted">inconnu</span>', sub: ret && ret.error ? "lecture impossible" : "Supabase requis", unknown: true };
      if (r.insufficient) return { label, big: '<span class="muted">insuffisant</span>', sub: `${num(r.base)} cohorte-users éligibles (min ${ret.minCohort}) · télémétrie ${num(ret.coverageDays)} j`, unknown: true };
      return { label, big: r.rate + " %", sub: `${num(r.retained)} / ${num(r.base)} revenus dans les ${w} j après inscription` };
    };
    cards.push(retCard("Rétention J1 (cohorte)", 1), retCard("Rétention J7 (cohorte)", 7), retCard("Rétention J30 (cohorte)", 30));
    $("#kpiCards").innerHTML = cards.map((c) => `<div class="kpi${c.unknown ? " kpi-unknown" : ""}">
      <div class="kpi-label">${esc(c.label)}</div>
      <div class="kpi-value">${c.big}</div>
      <div class="kpi-sub">${c.sub}</div></div>`).join("");

    if (k.series && k.series.length) lineChart($("#dauChart"), k.series, [{ key: "n", color: "#a78bfa" }], { height: 160 });
  }
  S.refresh = refresh; refresh();
};

// ── Brief exécutif (« état en 1 minute », copiable) ──────────────────────────
VIEWS.brief = async (view) => {
  mount(`<div class="brief-head">
      <div><h3 style="margin:0">Brief exécutif</h3><p class="page-sub" style="margin:2px 0 0">Synthèse en une minute, composée de signaux réels. Les valeurs manquantes sont marquées « inconnu », jamais inventées.</p></div>
      <button class="btn btn-primary" id="briefCopy">${icon("copy")} Copier le brief</button>
    </div>
    <div id="briefBody"><div class="empty" style="padding:28px"><span class="spinner"></span></div></div>`);

  async function refresh() {
    const [ov, rd, k, alerts, bugs] = await Promise.all([
      api.get("/overview").catch(() => null),
      api.get("/readiness").catch(() => null),
      api.get("/kpi").catch(() => null),
      api.get("/alerts").catch(() => []),
      api.get("/bugs").catch(() => []),
    ]);
    if (!ov) { $("#briefBody").innerHTML = `<div class="empty">Données indisponibles.</div>`; return; }
    const t = ov.totals, h = ov.health, ing = ov.ingest || {};
    const dataReal = !!ing.supabaseReady, hasData = (ing.buffered || 0) > 0;
    const lastSeen = ing.lastSeenIso ? Date.parse(ing.lastSeenIso) : null;
    const openBugs = (bugs || []).filter((b) => b.status !== "corrige" && b.status !== "ignore");
    const worst = openBugs.slice().sort((a, b) => (b.severity === "critical") - (a.severity === "critical") || b.count - a.count)[0];
    const unack = (alerts || []).filter((a) => !a.acknowledged);
    const kpiOk = k && k.configured !== false && !k.error;
    const kv = (n) => (n == null ? "inconnu" : num(n));
    // ⚠️ `f.score` vaut null pour un domaine NON MESURÉ, et `null < 60` est vrai
    // en JavaScript : sans ce garde, chaque domaine non instrumenté s'affichait
    // « Améliorer « X » (null/100) ». Un blanc ne se traite pas comme un mauvais
    // score — l'un demande d'instrumenter, l'autre de corriger.
    const lowFactors = (rd && rd.factors || []).filter((f) => typeof f.score === "number" && f.score < 60);
    const nonMesures = (rd && rd.domaines || []).filter((d) => d.etat === "inconnu");

    // Prochaines actions dérivées de signaux réels (pas d'invention).
    const actions = [];
    if (!dataReal) actions.push("Connecter Supabase (renseigner dashboard/.env) pour recevoir les données réelles.");
    if (t.criticalBugs) actions.push(`Corriger ${t.criticalBugs} bug${t.criticalBugs > 1 ? "s" : ""} critique${t.criticalBugs > 1 ? "s" : ""}${worst ? ` — ex. « ${worst.title} »` : ""}.`);
    if (unack.length) actions.push(`Traiter ${unack.length} alerte${unack.length > 1 ? "s" : ""} non acquittée${unack.length > 1 ? "s" : ""}.`);
    lowFactors.forEach((f) => actions.push(`Améliorer « ${f.label} » (${f.score}/100).`));
    // Un domaine critique non mesuré n'est pas un problème à corriger : c'est un
    // angle mort à instrumenter. La distinction change l'action.
    nonMesures.filter((d) => d.critique).forEach((d) => actions.push(`Instrumenter « ${d.label} » — non mesuré, donc la santé globale ne peut pas être affirmée.`));
    if (!actions.length) actions.push("Rien de bloquant — poursuivre les tests et l'observation.");

    const sev = { critical: "crit", high: "err", warn: "warn", info: "info" };
    const secCard = (title, ic, rows) => `<div class="card card-pad brief-sec"><div class="brief-sec-h">${icon(ic)} ${title}</div>${rows}</div>`;
    const line = (l, v) => `<div class="brief-line"><span>${esc(l)}</span><b>${v}</b></div>`;

    $("#briefBody").innerHTML = `
      <div class="prov-strip" style="margin-bottom:14px">
        <div class="prov-item"><span class="prov-ic">${icon("database")}</span><span class="prov-k">Données</span><span class="prov-v">${dataReal ? '<span class="prov-pill ok">RÉEL</span>' : '<span class="prov-pill off">LOCAL</span>'}</span></div>
        <div class="prov-item"><span class="prov-ic">${icon("clock")}</span><span class="prov-k">Fraîcheur</span><span class="prov-v">${hasData && lastSeen ? "il y a " + ago(lastSeen) : "aucun signal"}</span></div>
        <span class="prov-note">Brief généré à ${hhmmss(Date.now())}</span>
      </div>
      <div class="cols cols-2">
        ${secCard("État général", "activity",
          line("Santé", `<span class="pill ${h.level === "operational" ? "ok" : h.level === "critical" ? "error" : "warn"}">${esc(h.label)}</span>`) +
          // Le STATUT prime sur le chiffre : la santé est le pire domaine
          // critique, pas une moyenne. Et la CONFIANCE dit combien de domaines
          // sont réellement mesurés — « vert » avec 50 % de confiance signifie
          // « aucun signal négatif », pas « tout va bien ».
          line("Santé technique", rd
            ? `<span class="pill ${rd.statut === "vert" ? "ok" : rd.statut === "rouge" ? "error" : "warn"}">${esc((rd.statut || "").toUpperCase())}</span>`
              + ` <span class="muted" style="font-size:12px">confiance ${rd.confiance}%</span>`
            : "inconnu") +
          (rd && rd.cause ? line("Cause", `<span class="muted">${esc(rd.cause.label)} — ${esc(rd.cause.detail)}</span>`) : "") +
          (rd && rd.domaines ? line("Autorisation",
            (() => {
              const a = rd.domaines.find((d) => d.cle === "autorisation");
              if (!a) return "inconnu";
              const cls = a.etat === "vert" ? "ok" : a.etat === "rouge" ? "error" : "warn";
              return `<span class="pill ${cls}">${esc(a.etat.toUpperCase())}</span> <span class="muted" style="font-size:12px">${esc(a.detail)}</span>`;
            })()) : "") +
          line("Erreurs (5 min)", num(h.errors5m)) +
          line("Succès API", (t.apiSuccessRate ?? 0) + " %"))}
        ${secCard("Ce qui compte", "trending",
          line("Actifs 24h / 7j / 30j (DAU/WAU/MAU)", kpiOk ? `${kv(k.dau)} / ${kv(k.wau)} / ${kv(k.mau)}` : "inconnu") +
          line("Connectés maintenant", num(t.onlineUsers)) +
          line("Actions / min", num(t.actionsPerMin)) +
          line("Publications / interactions", `${num(t.publications)} / ${num(t.reactions + t.comments + t.messages)}`))}
      </div>
      <div class="cols cols-2" style="margin-top:14px">
        ${secCard("Alertes & problèmes", "alertTriangle",
          line("Alertes non traitées", num(unack.length)) +
          line("Bugs ouverts (critiques)", `${num(openBugs.length)} (${num(t.criticalBugs)})`) +
          (worst ? `<div class="brief-worst">${icon("bugs")} ${esc(worst.title)} <span class="muted">· ${num(worst.count)}×</span></div>` : `<div class="muted" style="font-size:12.5px;margin-top:6px">Aucun problème ouvert.</div>`))}
        ${secCard("Prochaines actions", "sparkles",
          `<ol class="brief-actions">${actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>`)}
      </div>`;

    // Version texte copiable (pour un point d'équipe / investisseur).
    briefText = [
      `PASSIO — Brief exécutif · ${new Date().toLocaleString("fr-FR")}`,
      `Données : ${dataReal ? "RÉEL (Supabase)" : "LOCAL (non connecté)"}${hasData && lastSeen ? ` · dernier signal il y a ${ago(lastSeen)}` : ""}`,
      ``,
      `ÉTAT : ${h.label} · Readiness ${rd ? rd.score + "/100" : "inconnu"} · Erreurs 5min ${h.errors5m} · Succès API ${t.apiSuccessRate ?? 0}%`,
      `ACTIFS : DAU ${kv(k?.dau)} · WAU ${kv(k?.wau)} · MAU ${kv(k?.mau)}${kpiOk ? "" : " (inconnu — Supabase requis)"}`,
      `EN DIRECT : ${t.onlineUsers} connectés · ${t.actionsPerMin} actions/min · ${t.publications} publications`,
      `ALERTES : ${unack.length} non traitées`,
      `PROBLÈMES : ${openBugs.length} ouverts (${t.criticalBugs} critiques)${worst ? ` — ex. « ${worst.title} »` : ""}`,
      ``,
      `PROCHAINES ACTIONS :`,
      ...actions.map((a, i) => `  ${i + 1}. ${a}`),
    ].join("\n");
  }
  let briefText = "";
  $("#briefCopy").onclick = () => briefText ? copy(briefText, "Brief exécutif") : toast("Brief pas encore prêt");
  S.refresh = refresh; await refresh();
};

// ── Ligne de flux réutilisable ──────────────────────────────────────────────
function feedRow(ev) {
  const meta = [ev.screen && "écran " + ev.screen, ev.duration_ms != null && ev.duration_ms + " ms", ev.http_status && "HTTP " + ev.http_status].filter(Boolean).join(" · ");
  const fix = ev.type === "error" && hasCap("claude")
    ? `<button class="fix-btn" title="Réparer avec Claude" onclick='event.stopPropagation();window.__fixEvent(${JSON.stringify(ev.id)})'>${icon("wrench")}</button>` : "";
  return `<div class="feed-row" onclick='window.__evDetail(${JSON.stringify(ev.id)})'>
    <span class="fr-time">${hhmmss(ev.ts)}</span>
    <span class="fr-dot" style="background:${dotColor(ev)}"></span>
    <span class="fr-main"><b>${esc(actionLabel(ev))}</b> <span class="muted">· ${who(ev)} · ${ev.platform}/${ev.browser}</span><div class="fr-meta">${meta || ""}</div></span>
    <span class="fr-right">${fix}<span class="pill ${ev.type === "error" ? "error" : ev.status}">${TYPE_FR[ev.type] || ev.type}</span></span></div>`;
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
      <select class="select" id="fType"><option value="">Tous types</option>${["nav", "action", "click", "api", "error", "connectivity", "session", "lifecycle", "perf"].map((t) => `<option value="${t}">${TYPE_FR[t]}</option>`).join("")}</select>
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
    $("#devRows").innerHTML = devs.map((d) => {
      const statusPill = d.netTrouble ? `<span class="pill error">réseau ⚠</span>` : d.struggling ? `<span class="pill warn">en difficulté</span>` : `<span class="pill ${d.online ? "ok" : "info"}">${d.online ? "en ligne" : "hors ligne"}</span>`;
      const conn = d.netTrouble ? `<span class="sev-error">${esc(d.connection || "coupé")}</span>` : esc(d.connection || "—");
      return `<tr class="${d.struggling || d.netTrouble ? "row-alert" : ""}" onclick="location.hash='#activity'"><td>${statusPill} <strong>${nameFor(d.userId, d.userLabel)}</strong></td><td>${esc(deviceLabel(d))}</td><td>${esc(d.screen || "—")}</td><td>${conn}</td><td>${d.errorCount ? `<span class="sev-error">${d.errorCount}</span>` : 0}</td><td class="muted">${ago(d.lastSeen)}</td></tr>`;
    }).join("") || '<tr><td colspan="6" class="empty">Aucun appareil.</td></tr>';
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
  mount(`<h2 class="page-title">Comptes & connexions</h2><p class="page-sub">Tous les comptes réels créés sur Passio, avec leurs <b>informations de connexion</b> (numéro de téléphone saisi à l'inscription, e-mail, dernière connexion) et leur activité récente. Le numéro n'est jamais exposé aux autres comptes — il est lu ici via la clé service_role. Les comptes de test sont exclus. ${hasCap("test_users") ? "Gestion des comptes de test en bas de page." : ""}</p>
    <div class="table-wrap"><table><thead><tr><th>Profil</th><th>Téléphone</th><th>E-mail</th><th>Créé le</th><th>Dernière connexion</th><th>Dernière activité</th><th>Statut</th></tr></thead><tbody id="userRows"></tbody></table></div>
    ${hasCap("test_users") ? `<div class="section-title">Comptes de test</div><div class="card card-pad" id="testUsers"><span class="spinner"></span></div>` : ""}`);
  // Liste de référence = TOUS les comptes créés (profiles + auth), chargée une fois.
  let accounts = [];
  try { const r = await api.get("/accounts"); accounts = (r && r.users) || []; if (r && r.error) toast(r.error); } catch (e) { toast(e.message); }
  function refresh() {
    // Activité live (appareils + dernier événement) agrégée depuis la télémétrie.
    const act = new Map();
    S.buffer.forEach((e) => { if (e.user_id) { const u = act.get(e.user_id) || { label: e.user_label, devices: new Set(), last: 0 }; u.label = e.user_label || u.label; if (e.device_id) u.devices.add(e.device_id); u.last = Math.max(u.last, e.ts); act.set(e.user_id, u); } });
    // Fusion : chaque compte réel (avec ses infos de connexion) + son activité éventuelle.
    // Les comptes observés en télémétrie mais absents de `profiles` (rare) sont ajoutés à la fin.
    const rows = accounts.map((a) => { const t = act.get(a.id); return { id: a.id, label: a.name, phone: a.phone || "", email: a.email || "", created: a.createdAt ? Date.parse(a.createdAt) : 0, lastSignIn: a.lastSignInAt ? Date.parse(a.lastSignInAt) : 0, devices: t ? t.devices.size : 0, last: t ? t.last : 0 }; });
    const known = new Set(accounts.map((a) => a.id));
    act.forEach((t, id) => { if (!known.has(id)) rows.push({ id, label: t.label, phone: "", email: "", created: 0, lastSignIn: 0, devices: t.devices.size, last: t.last }); });
    rows.sort((a, b) => (b.last - a.last) || (b.lastSignIn - a.lastSignIn) || (b.created - a.created));
    // Deux comptes DISTINCTS peuvent porter le même pseudo (« Ben sur portable » ×2) :
    // le pseudo n'identifie PAS un compte, seul l'uid le fait. On affiche donc toujours
    // un identifiant court (#uid) sous le nom, et un tag « doublon » quand le pseudo est
    // partagé, pour lever toute ambiguïté visuelle dans la supervision.
    const _labelCounts = rows.reduce((m, u) => { const k = (u.label || "").trim().toLowerCase(); if (k) m[k] = (m[k] || 0) + 1; return m; }, {});
    const _shortUid = (id) => "#" + String(id || "").replace(/^u_/, "").slice(0, 8);
    $("#userRows").innerHTML = rows.map((u) => { const dup = (u.label || "").trim() && _labelCounts[(u.label || "").trim().toLowerCase()] > 1; return `<tr><td><strong>${nameFor(u.id, u.label)}</strong>${dup ? ' <span class="tag" title="Plusieurs comptes distincts portent ce pseudo">doublon</span>' : ""}<div class="mono muted" style="font-size:10px;margin-top:2px">${esc(_shortUid(u.id))}</div></td><td class="mono">${u.phone ? esc(fmtPhone(u.phone)) : "—"}</td><td class="muted">${u.email ? esc(u.email) : "—"}</td><td class="muted">${u.created ? new Date(u.created).toLocaleDateString("fr-FR") : "—"}</td><td class="muted">${u.lastSignIn ? ago(u.lastSignIn) : "—"}</td><td class="muted">${u.last ? ago(u.last) : "—"}</td><td><span class="pill ${u.last && Date.now() - u.last < 3e5 ? "ok" : "info"}">${u.last && Date.now() - u.last < 3e5 ? "actif" : "inactif"}</span></td></tr>`; }).join("") || '<tr><td colspan="7" class="empty">Aucun compte créé pour le moment.</td></tr>';
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
VIEWS.content = () => filteredFeed("Contenus & interactions", "Tout ce que les gens publient et partagent — publications, bobines, stories, j'aime, commentaires et réactions, en direct.", (e) => /publish_|comment_post|like_post|react|story|reel|carnet|event_/.test(e.action || ""));
VIEWS.messaging = () => filteredFeed("Messagerie", "Uniquement des indications d'activité — aucun contenu de message privé n'est lu (RGPD).", (e) => /send_message|conv_|message|call/.test(e.action || e.endpoint || ""));
function filteredFeed(title, sub, pred) {
  mount(`<h2 class="page-title">${title}</h2><p class="page-sub">${sub}</p><div class="feed" id="feed"></div>`);
  const apply = () => { $("#feed").innerHTML = S.buffer.filter(pred).slice(-200).reverse().map(feedRow).join("") || '<div class="empty">Aucun événement correspondant pour le moment.</div>'; };
  S.refresh = apply; apply();
}

// ── Liens partagés (cycle de vie création → partage → ouverture confirmée) ───
// Sémantique HONNÊTE des statuts : chaque étape est adossée à un signal RÉEL.
const LINK_STATUS = {
  created:      { pill: "info",  label: "créé",                 desc: "généré, pas encore partagé" },
  shared:       { pill: "warn",  label: "partagé · non confirmé", desc: "envoyé, aucun signal d'ouverture reçu" },
  opened:       { pill: "ok",    label: "ouvert (confirmé)",    desc: "la page a chargé sur l'appareil cible" },
  opened_error: { pill: "error", label: "ouverture en échec",   desc: "page atteinte mais chargement en erreur" },
  unknown:      { pill: "info",  label: "inconnu",              desc: "" },
};
const LINK_KIND_FR = { reel: "Bobine", profile: "Profil", post: "Publication", event: "Événement", carnet: "Carnet", app: "Application" };
const shortLink = (id) => "#" + String(id || "").replace(/^lk_/, "").slice(0, 8);
const linkKind = (l) => LINK_KIND_FR[l.kind] || l.kind || "Lien";
// Ligne de timeline au format demandé : « HH:MM:SS — Lien #abc — Événement ».
function linkTimelineRow(ev) {
  const id = ev.correlation_id || (ev.meta && ev.meta.link_id) || "?";
  const dev = ev.platform ? ` · ${ev.platform}${ev.browser ? "/" + ev.browser : ""}` : "";
  let txt, cls;
  if (ev.action === "link_create") { txt = `Lien ${shortLink(id)} créé${ev.meta && ev.meta.link_kind ? " (" + (LINK_KIND_FR[ev.meta.link_kind] || ev.meta.link_kind) + ")" : ""}`; cls = "info"; }
  else if (ev.action === "link_share" || ev.action === "link_copy") { txt = `Lien ${shortLink(id)} partagé${ev.meta && ev.meta.link_channel ? " (" + ev.meta.link_channel + ")" : ""}`; cls = "accent"; }
  else if (ev.action === "link_open") { txt = `Lien ${shortLink(id)} — Ouverture confirmée (page chargée)${dev}`; cls = "ok"; }
  else if (ev.action === "link_load_error") { txt = `Lien ${shortLink(id)} — Échec de chargement${dev}`; cls = "error"; }
  else { txt = `Lien ${shortLink(id)} — ${esc(actionLabel(ev))}`; cls = "info"; }
  return `<div class="tl-row" onclick='window.__linkDetail(${JSON.stringify(id)})'>
    <span class="tl-time">${hhmmss(ev.ts)}</span><span class="tl-dot ${cls}"></span>
    <span class="tl-txt">${esc(txt)}</span></div>`;
}

VIEWS.links = async () => {
  mount(`<h2 class="page-title">Liens partagés</h2>
    <p class="page-sub">Cycle de vie de chaque lien généré par Passio : <b>créé → partagé → ouverture confirmée</b>. Principe d'honnêteté : on ne prétend <u>jamais</u> qu'un lien a été « cliqué ». Une ouverture n'est comptée que si la page a <b>réellement chargé</b> sur l'appareil cible et renvoyé un signal (marqueur <span class="mono">?plk</span>). Un lien partagé sans signal reste « non confirmé ».</p>
    <div id="lkProv"></div>
    <div class="grid kpi-grid" id="lkFunnel"></div>
    <div class="cols cols-2" style="margin-top:16px">
      <div class="card chart-card"><h4>Activité des liens en direct</h4><div class="chart-meta">Les événements de liens au fil de l'eau · format horodaté</div><div id="lkTimeline" class="timeline"></div></div>
      <div class="card chart-card"><h4>Répartition par statut</h4><div class="chart-meta">Où en sont les liens dans l'entonnoir</div><div id="lkBreakdown"></div></div>
    </div>
    <div class="feed-toolbar" style="margin-top:16px">
      <select class="select" id="lkStatus"><option value="">Tous statuts</option><option value="created">Créés</option><option value="shared">Partagés · non confirmés</option><option value="opened">Ouverts (confirmés)</option><option value="opened_error">Ouverture en échec</option></select>
      <select class="select" id="lkKind"><option value="">Tous types</option></select>
      <button class="btn btn-sm" id="lkExport">${icon("download")} Exporter</button>
      <span class="muted" style="margin-left:auto;font-size:12px" id="lkCount"></span>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Statut</th><th>Lien</th><th>Type / cible</th><th>Créé par</th><th>Partages</th><th>Ouvertures</th><th>Dernière activité</th></tr></thead><tbody id="lkRows"></tbody></table></div>`);

  let data = { funnel: {}, links: [] };
  let kindInit = false;
  const readF = () => ({ status: $("#lkStatus").value, kind: $("#lkKind").value });

  async function refresh() {
    try { data = await api.get("/links?limit=400"); }
    catch (e) { $("#lkRows").innerHTML = `<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`; return; }
    const f = data.funnel || {};
    // Provenance (comme partout : jamais un chiffre sans dire d'où il vient).
    $("#lkProv").innerHTML = `<div class="prov-strip">
      <div class="prov-item"><span class="prov-ic">${icon("share")}</span><span class="prov-k">Liens suivis</span><span class="prov-v">${num(f.total || 0)}</span></div>
      <div class="prov-item"><span class="prov-k">Aujourd'hui</span><span class="prov-v">${num(f.createdToday || 0)} créés · ${num(f.openedToday || 0)} ouverts</span></div>
      <div class="prov-item"><span class="prov-ic">${icon("clock")}</span><span class="prov-k">Dernière activité</span><span class="prov-v">${f.lastActivity ? "il y a " + ago(f.lastActivity) : "—"}</span></div>
      <span class="prov-note">Chaque ouverture = un signal réel reçu (jamais supposé)</span></div>`;

    // Entonnoir : cartes chiffrées honnêtes.
    const openRate = f.openRate == null ? '<span class="muted">n/a</span>' : f.openRate + " %";
    const cards = [
      { ic: "share",        l: "Liens créés",             v: num(f.created || 0),  s: "générés depuis l'app" },
      { ic: "external",     l: "Partagés",                v: num(f.shared || 0),   s: "copiés ou envoyés" },
      { ic: "checkCircle",  l: "Ouvertures confirmées",   v: num(f.opened || 0),   s: "page réellement chargée", ok: true },
      { ic: "alertTriangle",l: "Partagés · non confirmés",v: num(f.sharedUnconfirmed || 0), s: "aucun signal d'ouverture", warn: (f.sharedUnconfirmed || 0) > 0 },
      { ic: "trending",     l: "Taux d'ouverture",        v: openRate,             s: "des liens partagés, confirmés ouverts" },
    ];
    $("#lkFunnel").innerHTML = cards.map((c) => `<div class="kpi${c.ok ? " kpi-ok" : ""}${c.warn ? " kpi-warn" : ""}">
      <div class="kpi-label">${icon(c.ic)} ${c.l}</div><div class="kpi-value">${c.v}</div><div class="kpi-sub">${c.s}</div></div>`).join("");

    // Répartition par statut (barres proportionnelles).
    const byStatus = {};
    (data.links || []).forEach((l) => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });
    const totalL = (data.links || []).length || 1;
    const order = ["opened", "shared", "created", "opened_error"];
    $("#lkBreakdown").innerHTML = order.filter((s) => byStatus[s]).map((s) => {
      const cfg = LINK_STATUS[s]; const n = byStatus[s]; const pctv = Math.round((n / totalL) * 100);
      return `<div class="lk-bar-row"><span class="pill ${cfg.pill}">${cfg.label}</span>
        <div class="lk-bar"><div class="lk-bar-fill ${cfg.pill}" style="width:${pctv}%"></div></div>
        <span class="lk-bar-n">${n}</span></div>`;
    }).join("") || '<div class="empty" style="padding:18px">Aucun lien suivi pour l\'instant. Partage une bobine ou un profil depuis Passio (le lien portera un marqueur de suivi).</div>';

    if (!kindInit) {
      const kinds = [...new Set((data.links || []).map((l) => l.kind).filter(Boolean))];
      if (kinds.length) { $("#lkKind").innerHTML = '<option value="">Tous types</option>' + kinds.map((k) => `<option value="${esc(k)}">${esc(LINK_KIND_FR[k] || k)}</option>`).join(""); kindInit = true; }
    }
    renderTimeline();
    renderRows();
  }
  function renderTimeline() {
    const evs = S.buffer.filter((e) => e.type === "link").slice(-40).reverse();
    $("#lkTimeline").innerHTML = evs.map(linkTimelineRow).join("") || '<div class="empty" style="padding:20px">En attente d\'activité de liens. Les créations, partages et ouvertures apparaîtront ici en direct.</div>';
  }
  function renderRows() {
    const f = readF();
    let rows = (data.links || []).filter((l) => (!f.status || l.status === f.status) && (!f.kind || l.kind === f.kind));
    $("#lkRows").innerHTML = rows.map(linkRow).join("") || '<tr><td colspan="7" class="empty">Aucun lien correspondant.</td></tr>';
    $("#lkCount").textContent = rows.length + " lien" + (rows.length > 1 ? "s" : "");
  }
  $("#lkStatus").onchange = renderRows; $("#lkKind").onchange = renderRows;
  $("#lkExport").onclick = () => exportJson(data.links || [], "liens-passio");
  S.refresh = () => { renderTimeline(); if (!S.paused) refresh(); };
  refresh();
};
function linkRow(l) {
  const cfg = LINK_STATUS[l.status] || LINK_STATUS.unknown;
  const opens = l.openCount ? `<b class="${l.errorOpens && l.errorOpens === l.openCount ? "sev-error" : "sev-ok"}">${l.openCount}</b> <span class="muted">· ${l.openDevices} appareil${l.openDevices > 1 ? "s" : ""}</span>` : '<span class="muted">aucune</span>';
  const chans = (l.channels || []).length ? `<span class="muted">· ${l.channels.map(esc).join(", ")}</span>` : "";
  return `<tr onclick='window.__linkDetail(${JSON.stringify(l.id)})'>
    <td><span class="pill ${cfg.pill}">${cfg.label}</span></td>
    <td class="mono">${shortLink(l.id)}${l.orphan ? ' <span class="pill info" title="Ouverture sans création connue">orphelin</span>' : ""}</td>
    <td>${esc(linkKind(l))}${l.target ? ` <span class="muted mono" style="font-size:11px">${esc(String(l.target).slice(0, 14))}</span>` : ""}</td>
    <td>${l.createdBy || l.createdByLabel ? nameFor(l.createdBy, l.createdByLabel) : '<span class="muted">—</span>'}</td>
    <td>${l.shareCount || 0} ${chans}</td>
    <td>${opens}</td>
    <td class="muted">${ago(l.lastEvent)}</td></tr>`;
}
window.__linkDetail = async (id) => {
  openDrawer("Chargement…", '<div class="empty"><span class="spinner"></span></div>');
  let l;
  try { l = await api.get("/links/" + encodeURIComponent(id)); }
  catch (e) { return openDrawer("Erreur", `<div class="empty">${esc(e.message)}</div>`); }
  if (!l) return openDrawer("Lien", '<div class="empty">Lien introuvable.</div>');
  const cfg = LINK_STATUS[l.status] || LINK_STATUS.unknown;
  const openRows = (l.opens || []).slice().reverse().map((o) => `<div class="tl-row">
    <span class="tl-time">${hhmmss(o.ts)}</span><span class="tl-dot ${o.status === "error" ? "error" : "ok"}"></span>
    <span class="tl-txt">${o.status === "error" ? "Échec de chargement" : "Ouverture confirmée"} <span class="muted">· ${esc(o.platform || "?")}${o.browser ? "/" + esc(o.browser) : ""}${o.userLabel ? " · " + esc(o.userLabel) : o.user ? " · " + nameFor(o.user) : ""}</span></span></div>`).join("");
  const shareRows = (l.shares || []).slice().reverse().map((s) => `<div class="tl-row">
    <span class="tl-time">${hhmmss(s.ts)}</span><span class="tl-dot accent"></span>
    <span class="tl-txt">Partagé <span class="muted">· ${esc(s.channel || "?")}</span></span></div>`).join("");
  openDrawer(`Lien ${shortLink(l.id)} · <span class="pill ${cfg.pill}">${cfg.label}</span>`, `
    <div class="detail-grid">
      ${detail("Identifiant", `<span class="mono">${esc(l.id)}</span>`)}
      ${detail("Type", esc(linkKind(l)))}
      ${l.target ? detail("Cible", `<span class="mono">${esc(l.target)}</span>`) : ""}
      ${detail("Créé le", l.createdAt ? new Date(l.createdAt).toLocaleString("fr-FR") : '<span class="muted">inconnu (ouverture orpheline)</span>')}
      ${detail("Créé par", l.createdBy || l.createdByLabel ? nameFor(l.createdBy, l.createdByLabel) : "—")}
      ${detail("Partages", `${l.shareCount || 0}${(l.channels || []).length ? " · " + l.channels.map(esc).join(", ") : ""}`)}
      ${detail("Ouvertures confirmées", `${l.openCount || 0} sur ${l.openDevices || 0} appareil(s)${l.errorOpens ? " · " + l.errorOpens + " en échec" : ""}`)}
    </div>
    <div class="fix-note ${l.openCount ? "ok" : "" }" style="margin-top:12px">${icon(l.openCount ? "checkCircle" : "alertTriangle")} ${esc(cfg.desc || "")}${!l.openCount && l.shareCount ? " — ce lien a été partagé mais aucune ouverture n'a été confirmée pour l'instant." : ""}</div>
    ${shareRows ? `<div class="section-title">Partages</div><div class="timeline">${shareRows}</div>` : ""}
    ${openRows ? `<div class="section-title">Ouvertures</div><div class="timeline">${openRows}</div>` : ""}
    <div class="copy-row"><button class="btn btn-sm" onclick='window.__copy(${JSON.stringify(l.id)},"Identifiant du lien")'>${icon("copy")} Copier l'ID</button>
    <a class="btn btn-sm" href="#activity">${icon("activity")} Voir dans le flux</a></div>`);
};

// ── Visiteurs : qui ouvre le lien Netlify / l'app, et qui crée un compte ─────
const PLATFORM_FR = { ios: "iPhone / iPad", android: "Android", windows: "Windows", mac: "Mac", linux: "Linux", other: "Autre" };
const platLabel = (p) => PLATFORM_FR[p] || p || "Autre";
const ENV_FR = { production: "Production", preview: "Préversion", development: "Dev local" };
const shortDev = (id) => "#" + String(id || "").replace(/^dev_/, "").slice(-6);
// Un visiteur = un appareil. Registre live joint aux comptes (profiles) créés.
VIEWS.visitors = async () => {
  mount(`<h2 class="page-title">Visiteurs &amp; ouvertures</h2>
    <p class="page-sub">Chaque ligne est <b>un appareil</b> ayant ouvert Passio (au plus proche d'« une personne »). On affiche <b>tout ce qui est réellement connu</b> : système, navigateur, taille d'écran, connexion, environnement, écrans parcourus, lien d'arrivée, et — si la personne a créé un compte — son profil. <b>Aucun numéro de téléphone</b> n'est disponible : Passio s'authentifie par <b>e-mail</b>, jamais par téléphone, et la télémétrie <b>masque le PII par conception</b> (aucun e-mail, aucun contenu).</p>
    <div id="viProv"></div>
    <div class="grid kpi-grid" id="viFunnel"></div>
    <div class="feed-toolbar" style="margin-top:16px">
      <input class="select" id="viSearch" placeholder="Rechercher (profil, OS, navigateur, écran…)" style="width:230px">
      <select class="select" id="viEnv"><option value="">Tout environnement</option><option value="production">Production</option><option value="preview">Préversion</option><option value="development">Dev local</option></select>
      <select class="select" id="viSeg"><option value="">Tous les visiteurs</option><option value="signed">A créé un compte</option><option value="anon">Sans compte</option><option value="link">Arrivé par un lien</option><option value="online">En ligne maintenant</option><option value="trouble">A rencontré un souci</option></select>
      <button class="btn btn-sm" id="viExport">${icon("download")} Exporter</button>
      <span class="muted" style="margin-left:auto;font-size:12px" id="viCount"></span>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Visiteur</th><th>Appareil</th><th>Écran</th><th>Arrivé par</th><th>Activité</th><th>1re visite</th><th>Dernière</th><th>Statut</th></tr></thead><tbody id="viRows"></tbody></table></div>`);

  let data = { funnel: {}, visitors: [] };
  const created = new Map();   // userId -> createdAt (compte réel)
  try {
    const acc = await api.get("/accounts").catch(() => null);
    (acc && acc.users || []).forEach((u) => { if (u.name) S.names[u.id] = u.name; if (u.createdAt) created.set(u.id, Date.parse(u.createdAt)); });
  } catch (e) { /* comptes optionnels */ }

  async function refresh() {
    try { data = await api.get("/visitors"); }
    catch (e) { $("#viRows").innerHTML = `<tr><td colspan="8" class="empty">${esc(e.message)}</td></tr>`; return; }
    window.__visitorsCache = data.visitors || [];
    (data.visitors || []).forEach((v) => { if (v.userId && v.userLabel) S.names[v.userId] = v.userLabel; });
    const f = data.funnel || {};
    $("#viProv").innerHTML = `<div class="prov-strip">
      <div class="prov-item"><span class="prov-ic">${icon("devices")}</span><span class="prov-k">Appareils suivis</span><span class="prov-v">${num(f.total || 0)}</span></div>
      <div class="prov-item"><span class="prov-k">Aujourd'hui</span><span class="prov-v">${num(f.today || 0)} nouveaux</span></div>
      <div class="prov-item"><span class="prov-ic">${icon("clock")}</span><span class="prov-k">Dernière ouverture</span><span class="prov-v">${f.lastSeen ? "il y a " + ago(f.lastSeen) : "—"}</span></div>
      <span class="prov-note">1 appareil ≈ 1 personne · identité connue seulement après création d'un compte</span></div>`;
    const cards = [
      { ic: "route",       l: "Visiteurs (appareils)", v: num(f.total || 0),    s: "ont ouvert l'app au moins une fois" },
      { ic: "share",       l: "Arrivés par un lien",   v: num(f.viaLink || 0),  s: "ouverture confirmée via ?plk" },
      { ic: "users",       l: "Comptes créés",         v: num(f.signedUp || 0), s: "visiteurs devenus membres", ok: (f.signedUp || 0) > 0 },
      { ic: "activity",    l: "En ligne maintenant",   v: num(f.online || 0),   s: "actifs il y a < 70 s" },
      { ic: "check",       l: "En production",         v: num(f.prod || 0),     s: "hors préversion / dev local" },
    ];
    $("#viFunnel").innerHTML = cards.map((c) => `<div class="kpi${c.ok ? " kpi-ok" : ""}">
      <div class="kpi-label">${icon(c.ic)} ${c.l}</div><div class="kpi-value">${c.v}</div><div class="kpi-sub">${c.s}</div></div>`).join("");
    renderRows();
  }

  function passSeg(v, seg) {
    if (seg === "signed") return v.signedUp;
    if (seg === "anon") return !v.signedUp;
    if (seg === "link") return (v.viaLinks || []).length > 0;
    if (seg === "online") return v.online;
    if (seg === "trouble") return v.errorCount > 0 || v.netTrouble;
    return true;
  }
  function renderRows() {
    const q = $("#viSearch").value.trim().toLowerCase();
    const env = $("#viEnv").value, seg = $("#viSeg").value;
    let rows = (data.visitors || []).filter((v) => (!env || v.env === env) && passSeg(v, seg));
    if (q) rows = rows.filter((v) => {
      const name = v.userLabel || (v.userId && S.names[v.userId]) || "";
      return (name + " " + platLabel(v.platform) + " " + (v.browser || "") + " " + (v.screen || "") + " " + (v.screens || []).join(" ") + " " + v.deviceId).toLowerCase().includes(q);
    });
    $("#viRows").innerHTML = rows.map(visitorRow).join("") || '<tr><td colspan="8" class="empty">Aucun visiteur correspondant. Ouvre le lien Netlify sur un appareil pour le voir apparaître ici en direct.</td></tr>';
    $("#viCount").textContent = rows.length + " visiteur" + (rows.length > 1 ? "s" : "");
  }
  $("#viSearch").oninput = renderRows; $("#viEnv").onchange = renderRows; $("#viSeg").onchange = renderRows;
  $("#viExport").onclick = () => exportJson(data.visitors || [], "visiteurs-passio");
  S.refresh = () => { if (!S.paused) refresh(); };
  window.__viCreated = created;
  refresh();
};
function visitorRow(v) {
  const name = v.signedUp
    ? `<strong>${nameFor(v.userId, v.userLabel)}</strong> <span class="pill ok" style="font-size:10px">membre</span>`
    : `<span class="muted">Visiteur ${shortDev(v.deviceId)}</span>`;
  const dev = `${esc(platLabel(v.platform))} <span class="muted">· ${esc(v.browser || "?")}</span>${v.screenSize ? ` <span class="muted mono" style="font-size:11px">${esc(v.screenSize)}</span>` : ""}${v.env && v.env !== "production" ? ` <span class="pill info" style="font-size:10px">${esc(ENV_FR[v.env] || v.env)}</span>` : ""}`;
  const via = (v.viaLinks || []).length ? `<span class="mono" title="Lien d'arrivée">${shortLink(v.viaLink)}</span>${v.viaLinks.length > 1 ? ` <span class="muted">+${v.viaLinks.length - 1}</span>` : ""}` : '<span class="muted">direct</span>';
  const act = `${num(v.sessions || 0)} sess. <span class="muted">· ${num(v.events || 0)} év.</span>${v.errorCount ? ` <span class="pill error" style="font-size:10px" title="Problèmes rencontrés">${v.errorCount}</span>` : ""}`;
  const status = v.online ? '<span class="pill ok">en ligne</span>' : v.netTrouble ? '<span class="pill error">réseau</span>' : v.active ? '<span class="pill accent">actif</span>' : '<span class="pill info">hors ligne</span>';
  return `<tr onclick='window.__visitorDetail(${JSON.stringify(v.deviceId)})' style="cursor:pointer">
    <td>${name}</td><td>${dev}</td><td>${v.screen ? esc(v.screen) : '<span class="muted">—</span>'}</td>
    <td>${via}</td><td>${act}</td>
    <td class="muted" title="${v.firstSeen ? new Date(v.firstSeen).toLocaleString("fr-FR") : ""}">${v.firstSeen ? ago(v.firstSeen) : "—"}</td>
    <td class="muted">${v.lastSeen ? ago(v.lastSeen) : "—"}</td><td>${status}</td></tr>`;
}
window.__visitorDetail = (deviceId) => {
  const v = (window.__visitorsCache || []).find((x) => x.deviceId === deviceId);
  if (!v) return;
  const created = (window.__viCreated && window.__viCreated.get(v.userId)) || null;
  const rows = [
    ["Identité", v.signedUp ? `${nameFor(v.userId, v.userLabel)} <span class="pill ok" style="font-size:10px">compte créé</span>` : '<span class="muted">Anonyme — n\'a pas (encore) créé de compte</span>'],
    ["Appareil (anonyme)", `<span class="mono">${esc(v.deviceId)}</span>`],
    ["Système", esc(platLabel(v.platform))],
    ["Navigateur", esc(v.browser || "?")],
    ["Taille d'écran", v.screenSize ? `<span class="mono">${esc(v.screenSize)}</span>` : "—"],
    ["Connexion", v.connection ? esc(v.connection) : "—"],
    ["Environnement", esc(ENV_FR[v.env] || v.env)],
    ["Version de l'app", `<span class="mono">${esc(v.appVersion || "?")}</span>`],
    ["Arrivé par", (v.viaLinks || []).length ? v.viaLinks.map((id) => `<a class="mono" onclick='window.__linkDetail(${JSON.stringify(id)})' style="cursor:pointer">${shortLink(id)}</a>`).join(" ") : '<span class="muted">accès direct (pas de lien suivi)</span>'],
    ["Sessions", num(v.sessions || 0)],
    ["Événements", num(v.events || 0)],
    ["Problèmes rencontrés", v.errorCount ? `<span class="sev-error">${v.errorCount}</span>` : "aucun"],
    ["1re visite", v.firstSeen ? new Date(v.firstSeen).toLocaleString("fr-FR") : "—"],
    ["Dernière activité", v.lastSeen ? new Date(v.lastSeen).toLocaleString("fr-FR") + ` (il y a ${ago(v.lastSeen)})` : "—"],
    ["Compte créé le", created ? new Date(created).toLocaleString("fr-FR") : (v.signedUp ? '<span class="muted">date inconnue</span>' : "—")],
  ];
  const screens = (v.screens || []).length ? `<div class="section-title">Écrans parcourus (${v.screens.length})</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${v.screens.map((s) => `<span class="pill info">${esc(s)}</span>`).join("")}</div>` : "";
  openDrawer(`${v.signedUp ? nameFor(v.userId, v.userLabel) : "Visiteur " + shortDev(v.deviceId)} · ${v.online ? '<span class="pill ok">en ligne</span>' : '<span class="pill info">hors ligne</span>'}`,
    `<div class="detail-grid">${rows.map(([k, val]) => detail(k, val)).join("")}</div>
     ${screens}
     <div class="fix-note" style="margin-top:12px">${icon("alertTriangle")} Numéro de téléphone indisponible : Passio n'en collecte pas (inscription par e-mail). Les données ci-dessus sont tout ce que la télémétrie connaît, PII masqué par conception.</div>
     <div class="copy-row"><button class="btn btn-sm" onclick='window.__copy(${JSON.stringify(v.deviceId)},"Identifiant d\\u0027appareil")'>${icon("copy")} Copier l'ID appareil</button></div>`);
};

// ── Vérification des interactions cross-device ──────────────────────────────
// Icônes maison (pas d'emoji) par type d'interaction logique.
const INTER_ICON = { like: "heart", unlike: "heart", comment: "messaging", cint: "sparkles", message: "messaging", publish: "content", rsvp: "sessions" };
// Chemin realtime concerné par type → contexte de diagnostic pour Claude.
const INTER_DIAG = {
  like: { table: "post_likes", chan: "realtime:db" },
  unlike: { table: "post_likes (DELETE)", chan: "realtime:db" },
  comment: { table: "post_comments", chan: "realtime:db" },
  cint: { table: "comment_interactions", chan: "realtime:db" },
  message: { table: "conv_messages", chan: "user:<uid> (v3) / conv:<id> (v2) / realtime:db (v1)" },
  publish: { table: "posts", chan: "realtime:db" },
};
let INTER_LAST = []; // dernières interactions rendues (pour __fixInteraction)
function fmtLatency(ms) { if (ms == null) return "—"; return ms < 1000 ? ms + " ms" : (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + " s"; }

VIEWS.interactions = async () => {
  mount(`<h2 class="page-title">Vérification des interactions</h2>
    <p class="page-sub">Chaque like, commentaire, réaction, message ou publication émis sur un appareil est-il bien <b>reçu en temps réel sur les autres appareils</b> ? Parfait pour tester à deux appareils : agis sur l'un, la livraison sur l'autre apparaît ici en direct.</p>
    <div class="inter-summary" id="iSummary"></div>
    <div class="inter-tiles" id="iTiles"></div>
    <div class="feed-toolbar" style="margin-top:16px">
      <select class="select" id="iKind"><option value="">Tous les types</option></select>
      <label class="chip-toggle" id="iFailBtn">${icon("alertTriangle")} <span>Seulement les non-livrés</span></label>
      <button class="btn btn-sm" id="iRefresh">${icon("refresh")} Actualiser</button>
      <span class="muted" style="margin-left:auto;font-size:12px" id="iCount"></span>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Heure</th><th>Interaction</th><th>Émise par</th><th>Livraison cross-device</th></tr></thead><tbody id="iRows"></tbody></table></div>`);

  let data = { stats: [], recent: [], totals: {} };
  let kindInit = false, failOnly = false;

  async function refresh() {
    try { data = await api.get("/interactions?limit=150"); }
    catch (e) { $("#iRows").innerHTML = `<tr><td colspan="4" class="empty">${esc(e.message)}</td></tr>`; return; }
    INTER_LAST = data.recent || [];
    const T = data.totals || {};
    const gRate = T.deliveryRate;
    const gCls = gRate == null ? "info" : gRate >= 90 ? "ok" : gRate >= 50 ? "warn" : "error";
    $("#iSummary").innerHTML = `<div class="state-banner ${gRate == null ? "" : gRate >= 90 ? "ok" : gRate >= 50 ? "warn" : "bad"}">
      <div class="state-ico">${icon("wifi")}</div>
      <div class="state-txt"><h2>${gRate == null ? "En attente d'interactions" : gRate + "% livrées sur les autres appareils"}</h2>
        <p>${num(T.delivered || 0)} livrées · ${num(T.pending || 0)} en attente · <b class="${T.unconfirmed ? "sev-error" : ""}">${num(T.unconfirmed || 0)} non reçues ailleurs</b> · latence médiane ${fmtLatency(T.medianLatency)}</p></div>
      <div class="state-live"><span class="live-dot"></span>EN DIRECT</div></div>`;

    const verif = (data.stats || []).filter((s) => s.verifiable);
    $("#iTiles").innerHTML = verif.map((s) => {
      const rate = s.deliveryRate;
      const col = rate == null ? "var(--muted)" : rate >= 90 ? "var(--ok)" : rate >= 50 ? "var(--warn)" : "var(--err)";
      return `<div class="inter-tile">
        <div class="it-head">${icon(INTER_ICON[s.kind] || "activity")}<span>${esc(s.label)}</span></div>
        <div class="it-rate" style="color:${col}">${rate == null ? "—" : rate + "%"}</div>
        <div class="it-sub">${s.delivered}/${s.delivered + s.unconfirmed} livrés cross-device</div>
        <div class="it-foot">${s.emitted} émis · ${s.pending} en attente · méd. ${fmtLatency(s.medianLatency)}</div>
      </div>`;
    }).join("") || '<div class="empty" style="grid-column:1/-1">Aucune interaction observée. Fais un like ou envoie un message depuis Passio (deux appareils = idéal).</div>';

    if (!kindInit && verif.length) {
      $("#iKind").innerHTML = '<option value="">Tous les types</option>' + verif.map((s) => `<option value="${s.kind}">${esc(s.label)}</option>`).join("");
      kindInit = true;
    }
    renderRows();
  }
  function renderRows() {
    const kf = $("#iKind").value;
    let rows = data.recent || [];
    if (kf) rows = rows.filter((r) => r.kind === kf);
    if (failOnly) rows = rows.filter((r) => r.status === "unconfirmed" || r.status === "pending");
    $("#iRows").innerHTML = rows.map(interRow).join("") || '<tr><td colspan="4" class="empty">Aucune interaction correspondante.</td></tr>';
    $("#iCount").textContent = rows.length + " interaction" + (rows.length > 1 ? "s" : "");
  }
  $("#iKind").onchange = renderRows;
  $("#iFailBtn").onclick = () => { failOnly = !failOnly; $("#iFailBtn").classList.toggle("on", failOnly); renderRows(); };
  $("#iRefresh").onclick = refresh;
  S.refresh = refresh; refresh();
};

// ─── Traçage bout-en-bout (chaîne de validation par action) ───────────────────
// Verdict final : libellé + classe de couleur (réutilise les pills existantes).
const TRACE_FINAL = {
  success: { label: "Succès", cls: "ok" }, slow: { label: "Succès (lent)", cls: "warn" },
  partial: { label: "Partiel", cls: "warn" }, failed: { label: "Échec", cls: "error" },
  dead_click: { label: "Clic sans effet", cls: "error" }, unconfirmed: { label: "Non confirmé", cls: "warn" },
  running: { label: "En cours", cls: "info" },
};
// Symbole + classe par statut d'étape.
const STEP_UI = {
  ok: { s: "✓", cls: "ok" }, fail: { s: "✗", cls: "error" }, slow: { s: "◔", cls: "warn" },
  pending: { s: "…", cls: "info" }, unconfirmed: { s: "?", cls: "muted" }, missing: { s: "✗", cls: "error" },
};
let TRACE_LAST = [];  // dernières traces rendues (pour le détail sans re-fetch de liste)
function traceFinalPill(f) { const u = TRACE_FINAL[f] || { label: f, cls: "info" }; return `<span class="pill ${u.cls}">${esc(u.label)}</span>`; }
function traceDot(step) {
  const u = STEP_UI[step.status] || STEP_UI.pending;
  return `<span class="trace-step ${u.cls}" title="${esc(step.label)} : ${esc(step.status)}"><b>${u.s}</b> ${esc(step.label)}</span>`;
}
function traceChain(steps) { return `<div class="trace-chain">${steps.map(traceDot).join('<span class="trace-arrow">→</span>')}</div>`; }
function traceRow(t) {
  const dur = t.durationMs == null ? "—" : (t.durationMs < 1000 ? t.durationMs + " ms" : (t.durationMs / 1000).toFixed(2) + " s");
  return `<tr class="trace-row" data-cid="${esc(t.cid)}" style="cursor:pointer">
    <td class="muted mono">${hhmmss(t.startedAt)}</td>
    <td><b>${esc(t.actionLabel)}</b>${t.duplicate ? ' <span class="pill error">doublon</span>' : ""}<div class="muted" style="font-size:12px">${nameFor(t.user, t.label)}${t.screen ? " · " + esc(t.screen) : ""}</div></td>
    <td>${traceChain(t.steps)}</td>
    <td>${traceFinalPill(t.final)}</td>
    <td class="muted mono">${dur}</td>
  </tr>`;
}

VIEWS.traces = async () => {
  mount(`<h2 class="page-title">Traçage des actions (bout en bout)</h2>
    <p class="page-sub">Chaque action importante est suivie du <b>clic</b> jusqu'à son <b>résultat métier réel</b> : gestionnaire → requête → enregistrement → livraison. Un verdict honnête par action — jamais un « succès » non prouvé. <span class="muted">(Instrumenté : message, j'aime, commentaire, réaction, publication/bobine, RSVP événement. Toute action wrappée par <code>tel.flowStart</code> apparaît automatiquement.)</span></p>
    <div class="tr-hero"><button class="btn btn-primary btn-lg" id="trDiagnose">${icon("wrench")} Diagnostiquer toute la plateforme</button>
      <span class="muted" id="trDiagHint" style="font-size:12.5px">Assemble l'état de santé réel (incidents, chaînes cassées, livraison, dette) en un diagnostic Claude Code.</span></div>
    <div id="trSummary"></div>
    <div id="trIncidents"></div>
    <div class="feed-toolbar" style="margin-top:16px">
      <label class="chip-toggle" id="trFailBtn">${icon("alertTriangle")} <span>Seulement les problèmes</span></label>
      <button class="btn btn-sm" id="trRefresh">${icon("refresh")} Actualiser</button>
      <span class="muted" style="margin-left:auto;font-size:12px" id="trCount"></span>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Heure</th><th>Action</th><th>Chaîne de validation</th><th>Verdict</th><th>Durée</th></tr></thead><tbody id="trRows"></tbody></table></div>
    <div id="trCoverage"></div>`);
  $("#trDiagnose").onclick = diagnosePlatform;

  let data = { totals: {}, incidents: [], recent: [] };
  let failOnly = false;
  const PROBLEM = new Set(["failed", "partial", "dead_click", "unconfirmed"]);

  async function refresh() {
    try { data = await api.get("/traces?limit=150"); }
    catch (e) { $("#trRows").innerHTML = `<tr><td colspan="5" class="empty">${esc(e.message)}</td></tr>`; return; }
    TRACE_LAST = data.recent || [];
    const T = data.totals || {};
    const rate = T.successRate;
    const cls = rate == null ? "" : rate >= 90 ? "ok" : rate >= 50 ? "warn" : "bad";
    $("#trSummary").innerHTML = `<div class="state-banner ${cls}">
      <div class="state-ico">${icon("route")}</div>
      <div class="state-txt"><h2>${rate == null ? "En attente d'actions tracées" : rate + "% des actions abouties"}</h2>
        <p>${num(T.success || 0)} succès · <b class="${T.partial ? "sev-warn" : ""}">${num(T.partial || 0)} partiels</b> · <b class="${T.failed ? "sev-error" : ""}">${num(T.failed || 0)} échecs</b> · ${num(T.dead_click || 0)} clics sans effet · ${num(T.running || 0)} en cours${T.duplicate ? " · " + num(T.duplicate) + " doublon(s)" : ""}</p></div>
      <div class="state-live"><span class="live-dot"></span>EN DIRECT</div></div>`;

    const inc = data.incidents || [];
    $("#trIncidents").innerHTML = !inc.length ? "" : `<div class="tr-incidents">${inc.map((g) => `
      <div class="tr-incident ${g.final === "failed" ? "bad" : "warn"}" data-cid="${esc(g.sampleCid)}">
        <div class="tri-head">${icon("alertTriangle")} <b>${esc(g.actionLabel)}</b> — étape « ${esc(g.stepLabel || g.final)} »</div>
        <div class="tri-sub">${g.count} occurrence${g.count > 1 ? "s" : ""} · ${g.users} utilisateur${g.users > 1 ? "s" : ""} · dernier ${ago(g.lastAt)}</div>
        <div class="tri-actions"><button class="btn btn-sm" data-fix="${esc(g.sampleCid)}">${icon("wrench")} Diagnostiquer avec Claude</button></div>
      </div>`).join("")}</div>`;

    renderRows();
    renderCoverage();
  }
  async function renderCoverage() {
    let cov;
    try { cov = await api.get("/coverage"); } catch (e) { return; }
    const cat = (cov.catalogue || []).map((c) => `<tr>
      <td><b>${esc(c.label)}</b> <span class="muted mono" style="font-size:11px">${esc(c.action)}</span></td>
      <td class="muted">${esc(c.feature)}</td>
      <td>${c.wired ? '<span class="pill ok">câblé</span>' : '<span class="pill info">en attente</span>'}</td>
      <td class="mono">${num(c.observed)}</td>
      <td class="mono">${num(c.tracedFlows)}</td></tr>`).join("");
    const debt = (cov.uninstrumented || []).length
      ? `<div class="tr-debt">${icon("alertTriangle")} <b>${cov.uninstrumented.length} action(s) sans contrat de résultat</b> (angle mort — se produisent mais non tracées bout en bout) : ${cov.uninstrumented.slice(0, 12).map((u) => `<span class="pill info">${esc(u.action)} · ${num(u.count)}</span>`).join(" ")}</div>`
      : `<div class="muted" style="font-size:12.5px;margin-top:8px">${icon("checkCircle")} Aucune action observée sans contrat de résultat.</div>`;
    $("#trCoverage").innerHTML = `<details class="tr-cov"><summary>${icon("reports")} Couverture d'instrumentation — ${cov.totals.wired}/${cov.totals.contracts} contrats câblés · ${cov.totals.uninstrumented} en dette</summary>
      <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Action</th><th>Module</th><th>État</th><th>Observées</th><th>Tracées</th></tr></thead><tbody>${cat || '<tr><td colspan="5" class="empty">Aucun contrat.</td></tr>'}</tbody></table></div>
      ${debt}</details>`;
  }
  function renderRows() {
    let rows = data.recent || [];
    if (failOnly) rows = rows.filter((r) => PROBLEM.has(r.final));
    $("#trRows").innerHTML = rows.map(traceRow).join("") || '<tr><td colspan="5" class="empty">Aucune action tracée pour l\'instant. Envoie un message depuis Passio (idéalement à deux appareils) : la chaîne complète apparaîtra ici.</td></tr>';
    $("#trCount").textContent = rows.length + " action" + (rows.length > 1 ? "s" : "");
  }
  $("#trFailBtn").onclick = () => { failOnly = !failOnly; $("#trFailBtn").classList.toggle("on", failOnly); renderRows(); };
  $("#trRefresh").onclick = refresh;
  // Délégation : ouvrir le détail d'une trace, ou lancer la réparation d'un incident.
  $("#view").onclick = (e) => {
    const fix = e.target.closest("[data-fix]"); if (fix) { e.stopPropagation(); return traceFixByCid(fix.dataset.fix); }
    const incident = e.target.closest(".tr-incident"); if (incident) return traceDetail(incident.dataset.cid);
    const row = e.target.closest(".trace-row"); if (row) return traceDetail(row.dataset.cid);
  };
  S.refresh = refresh; refresh();
};

// ─── Intégrité des données (réconciliation : échecs silencieux) ───────────────
let INTEG_LAST = [];
VIEWS.integrity = async () => {
  mount(`<h2 class="page-title">Intégrité des données</h2>
    <p class="page-sub">Le traçage prouve qu'une action a abouti ; cette page vérifie que la base est <b>cohérente</b>. Elle cherche les données perdues, orphelines ou bloquées <b>qu'aucune erreur n'a signalées</b> — les échecs silencieux. Lecture seule, aucun contenu privé n'est lu.</p>
    <div id="igSummary"></div>
    <div class="feed-toolbar" style="margin-top:14px">
      <button class="btn btn-sm" id="igRefresh">${icon("refresh")} Relancer la vérification</button>
      <span class="muted" style="margin-left:auto;font-size:12px" id="igMeta"></span>
    </div>
    <div id="igList"></div>`);

  // `force` : le bouton « Relancer » doit réellement réinterroger la base,
  // pas relire le cache serveur de 30 s.
  async function refresh(force) {
    $("#igList").innerHTML = `<div class="empty"><span class="spinner"></span><p style="margin-top:10px">Vérification de l'intégrité…</p></div>`;
    let d;
    try { d = await api.get("/reconcile" + (force === true ? "?force=1" : "")); }
    catch (e) { $("#igList").innerHTML = `<div class="fix-note err">${esc(e.message)}</div>`; return; }
    if (!d.configured) { $("#igList").innerHTML = `<div class="empty">Supabase non configuré : l'intégrité ne peut pas être vérifiée.</div>`; return; }
    INTEG_LAST = d.checks || [];
    const T = d.totals || {};
    const cls = T.critical ? "bad" : T.anomalies ? "warn" : "ok";
    $("#igSummary").innerHTML = `<div class="state-banner ${cls}">
      <div class="state-ico">${icon("database")}</div>
      <div class="state-txt"><h2>${T.anomalies ? `${T.anomalies} règle(s) en anomalie · ${num(T.affectedRows)} ligne(s) concernée(s)` : `Aucune anomalie active sur ${T.rules} règles`}</h2>
        <p>${T.critical || 0} critique(s)${T.residues ? ` · ${T.residues} résidu(s) sans récidive (${num(T.residueRows)} ligne(s))` : ""} · ${T.failed ? `<b class="sev-warn">${T.failed} règle(s) NON vérifiée(s)</b> · ` : ""}${num(T.seedRefs || 0)} référence(s) au contenu de démo (normal, exclu des anomalies)</p></div></div>`;
    $("#igMeta").textContent = "Vérifié " + hhmmss(d.updatedAt) + (d.cached ? " (en cache)" : "");

    $("#igList").innerHTML = `<div class="ig-grid">${INTEG_LAST.map((c, i) => {
      const badge = c.status === "ok" ? '<span class="pill ok">conforme</span>'
        : c.status === "unknown" ? '<span class="pill warn">non vérifiée</span>'
        : c.status === "residue" ? '<span class="pill info">résidu (sans récidive)</span>'
        : c.status === "error" ? '<span class="pill error">critique</span>' : '<span class="pill warn">à surveiller</span>';
      // Datation : une anomalie ancienne sans récidive n'a pas la même urgence.
      const dated = c.lastAt
        ? `<div class="ig-age">Dernière occurrence ${ago(c.lastAt)} · ${c.recentCount || 0} sur 7 j</div>` : "";
      return `<div class="ig-card ${c.status}">
        <div class="ig-head">${badge} <b>${esc(c.label)}</b></div>
        ${c.error ? `<div class="ig-err">${icon("alertTriangle")} ${esc(c.error)}</div>` : ""}
        ${c.status === "ok" ? `<div class="ig-ok">${icon("checkCircle")} Aucune anomalie${c.seedRefs ? ` (${num(c.seedRefs)} réf. de démo ignorées)` : ""}</div>`
          : c.count != null ? `<div class="ig-count">${num(c.count)} <span>ligne(s) réellement concernée(s)</span>${c.seedRefs ? `<span class="ig-seed"> · ${num(c.seedRefs)} réf. de démo (normal)</span>` : ""}</div>` : ""}
        ${dated}
        ${c.status === "residue" ? `<div class="ig-residue">${icon("checkCircle")} Aucune récidive depuis 7 j : défaut probablement déjà corrigé, seul le nettoyage des données reste utile.</div>` : ""}
        <div class="ig-impact">${esc(c.impact)}</div>
        ${c.partial ? `<div class="ig-partial">${icon("alertTriangle")} Analyse partielle (borne de lecture atteinte) : ce chiffre est un minorant.</div>` : ""}
        ${c.samples?.length ? `<div class="ig-samples">Exemples : ${c.samples.slice(0, 6).map((s) => `<code>${esc(s)}</code>`).join(" ")}</div>` : ""}
        ${c.status !== "ok" && hasCap("claude") ? `<div class="ig-actions"><button class="btn btn-sm" data-ig="${i}">${icon("wrench")} Analyser & réparer avec Claude</button></div>` : ""}
      </div>`;
    }).join("")}</div>`;
  }
  $("#igRefresh").onclick = () => refresh(true);
  $("#view").onclick = (e) => {
    const b = e.target.closest("[data-ig]"); if (!b) return;
    integrityFix(INTEG_LAST[Number(b.dataset.ig)]);
  };
  S.refresh = null; refresh();
};

// Analyse/réparation d'une anomalie d'intégrité : prompt dédié (simulation d'abord).
async function integrityFix(check) {
  if (!check) return;
  let prompt = "";
  try { prompt = (await api.post("/reconcile/prompt", { check })).prompt; }
  catch (e) { return toast(e.message); }
  fixWithClaude({ event: { type: "error", severity: "error", action: check.id,
    message: `Intégrité : ${check.label} (${check.count} ligne(s))`, stack: prompt } }, check.label);
}

// « Diagnostiquer toute la plateforme » : assemble l'état de santé réel en un
// prompt Claude Code (copiable, ou lancé directement si l'assistant est branché).
async function diagnosePlatform() {
  openDrawer(`${icon("wrench")} Diagnostic global`, `<div class="empty"><span class="spinner"></span><p style="margin-top:10px">Assemblage de l'état de santé réel…</p></div>`);
  let d;
  try { d = await api.get("/diagnose"); }
  catch (e) { $("#drawerBody").innerHTML = `<div class="fix-note err">${esc(e.message)}</div>`; return; }
  const s = d.summary || {};
  const chip = (label, val, bad) => `<div class="diag-kpi ${bad ? "bad" : ""}"><div class="diag-kpi-v">${val}</div><div class="diag-kpi-l">${label}</div></div>`;
  $("#drawerBody").innerHTML = `
    <div class="diag-kpis">
      ${chip("Actions abouties", s.successRate == null ? "—" : s.successRate + "%", s.successRate != null && s.successRate < 90)}
      ${chip("Livraison temps réel", s.deliveryRate == null ? "—" : s.deliveryRate + "%", s.deliveryRate != null && s.deliveryRate < 90)}
      ${chip("Chaînes cassées", s.incidents || 0, s.incidents > 0)}
      ${chip("Bugs actifs", s.bugs || 0, s.bugs > 0)}
      ${chip("Intégrité (anomalies)", s.integrityEvaluated === false ? "n/é" : s.integrityAnomalies == null ? "—" : s.integrityAnomalies, s.integrityAnomalies > 0)}
      ${chip("Dette instrumentation", s.uninstrumented || 0, s.uninstrumented > 0)}
    </div>
    <div class="drawer-actions" style="margin:14px 0;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm" id="diagCopy">${icon("reports")} Copier le prompt Claude Code</button>
      ${hasCap("claude") ? `<button class="btn btn-sm btn-primary" id="diagRun">${icon("wrench")} Lancer l'analyse</button>` : ""}
    </div>
    <pre class="md-code" style="max-height:340px;overflow:auto;white-space:pre-wrap">${esc(d.prompt)}</pre>`;
  $("#diagCopy").onclick = () => copy(d.prompt, "Prompt de diagnostic copié");
  const run = $("#diagRun");
  if (run) run.onclick = () => fixWithClaude({ event: { type: "error", severity: "error", message: "Diagnostic global de la plateforme", stack: d.prompt } }, "Diagnostic global de la plateforme");
}

// Détail d'une trace : chaîne complète + prompt Claude prêt à copier + réparation.
async function traceDetail(cid) {
  openDrawer(`${icon("route")} Détail de l'action`, `<div class="empty"><span class="spinner"></span></div>`);
  let payload;
  try { payload = await api.get(`/traces/${encodeURIComponent(cid)}`); }
  catch (e) { $("#drawerBody").innerHTML = `<div class="fix-note err">${esc(e.message)}</div>`; return; }
  const t = payload.trace;
  const dur = t.durationMs == null ? "—" : (t.durationMs < 1000 ? t.durationMs + " ms" : (t.durationMs / 1000).toFixed(2) + " s");
  const stepsHtml = t.steps.map((s) => {
    const u = STEP_UI[s.status] || STEP_UI.pending;
    const st = { ok: "OK", fail: "ÉCHEC", slow: "LENT", pending: "en attente", unconfirmed: "non confirmé", missing: "non atteinte" }[s.status] || s.status;
    return `<li class="tstep ${u.cls}"><span class="tstep-ico">${u.s}</span><span class="tstep-label">${esc(s.label)}</span><span class="tstep-status">${st}${s.http_status ? " · HTTP " + s.http_status : ""}</span></li>`;
  }).join("");
  const problem = ["failed", "partial", "dead_click"].includes(t.final);
  // Corrélation aux changements récents — présentée comme une HYPOTHÈSE.
  const sp = payload.suspects;
  const suspectsHtml = !sp || !problem ? "" : `<div class="tsus">
    <div class="tsus-head">${icon("git")} Changements récents pouvant expliquer</div>
    ${sp.suspects.length ? sp.suspects.map((s) => `<div class="tsus-row">
        <span class="pill ${s.confidence === "élevée" ? "error" : "warn"}">${esc(s.confidence)}</span>
        <code>${esc(s.hash)}</code> ${esc(s.subject)}
        <div class="tsus-sub">${s.minutesBefore} min avant · ${s.fileCount} fichier(s)${s.sameArea ? " · même zone fonctionnelle" : ""}</div>
      </div>`).join("") : `<div class="tsus-none">${esc(sp.note)}</div>`}
    ${sp.suspects.length ? `<div class="tsus-warn">Corrélation ≠ causalité : à confirmer en lisant le diff.</div>` : ""}
  </div>`;
  $("#drawerBody").innerHTML = `
    <div class="fix-intro"><b>${esc(t.actionLabel)}</b> · ${traceFinalPill(t.final)}${t.duplicate ? ' <span class="pill error">doublon</span>' : ""}</div>
    <div class="muted" style="font-size:13px;margin:6px 0 14px">${nameFor(t.user, t.label)}${t.screen ? " · écran " + esc(t.screen) : ""}${t.target ? " · cible " + esc(t.target) : ""} · ${hhmmss(t.startedAt)} · durée ${dur}</div>
    <ul class="tsteps">${stepsHtml}</ul>
    ${suspectsHtml}
    <div class="drawer-actions" style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm" id="trCopyPrompt">${icon("reports")} Copier le prompt Claude Code</button>
      ${problem && hasCap("claude") ? `<button class="btn btn-sm btn-primary" id="trFix">${icon("wrench")} Réparer avec Claude</button>` : ""}
    </div>`;
  $("#trCopyPrompt").onclick = () => copy(payload.prompt, "Prompt Claude copié");
  const fixBtn = $("#trFix");
  if (fixBtn) fixBtn.onclick = () => traceFix(t, payload.prompt);
}
// Réparation depuis un incident groupé (on a juste le cid échantillon).
async function traceFixByCid(cid) {
  try { const p = await api.get(`/traces/${encodeURIComponent(cid)}`); traceFix(p.trace, p.prompt); }
  catch (e) { toast(e.message); }
}
// Réparation d'une trace : synthétise un événement d'erreur pour l'assistant Claude.
function traceFix(t, prompt) {
  const failStep = t.steps.find((s) => s.status === "fail") || t.steps.find((s) => s.status === "missing");
  const ev = {
    type: "error", action: t.action, severity: "error", screen: t.screen,
    message: `Action « ${t.actionLabel} » — étape « ${failStep ? failStep.label : t.final} » en échec`,
    stack: prompt,
  };
  fixWithClaude({ event: ev }, `${t.actionLabel} — ${failStep ? failStep.label : t.final}`);
}

// ─── Campagne QA (rapport de la campagne multi-comptes) ───────────────────────
const QA_SEV = { CRITICAL: "error", HIGH: "error", MEDIUM: "warn", LOW: "info" };
const qaPill = (st) => st === "PASS" ? '<span class="pill ok">PASS</span>'
  : st === "FAIL" ? '<span class="pill error">FAIL</span>'
  : st === "WARN" ? '<span class="pill warn">WARN</span>'
  : '<span class="pill info">' + esc(st || "—") + '</span>';
const qaLat = (ms) => (ms == null ? "—" : (ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : Math.round(ms) + "ms"));

VIEWS.qa = async (view) => {
  mount(`<h2 class="page-title">Campagne QA — transfert de données multi-comptes</h2>
    <p class="page-sub">Rapport de la dernière campagne : ~10 comptes réels jouent une matrice de transferts cross-compte (message, publication, like, commentaire, réaction, follow, événement, notifications, RLS). Chaque scénario valide TOUTE la chaîne — action → base → realtime → autre appareil → rendu — et sa latence. Un 200 ne suffit pas : « PASS » = donnée reçue, identique, unique, persistée.</p>
    <div id="qaBody"><div class="empty"><span class="spinner"></span> Chargement du rapport…</div></div>`);

  async function refresh() {
    let d;
    try { d = await api.get("/qa-report"); }
    catch (e) { $("#qaBody").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (!d || d.configured === false) {
      $("#qaBody").innerHTML = `<div class="state-banner"><div class="state-ico">${icon("tests")}</div>
        <div class="state-txt"><h2>Aucune campagne QA exécutée</h2>
        <p>${esc((d && (d.message || d.error)) || "Lance la campagne pour peupler cette vue.")}</p>
        <p class="muted" style="font-size:12px;margin-top:6px">PowerShell : <code>$env:PASSIO_QA_CAMPAIGN="1"; $env:PASSIO_E2E_MULTI="1"; npm test -- qa-campaign</code></p></div></div>`;
      return;
    }
    const t = d.totals || {}, c = d.conclusion || {};
    const rateCls = t.successRate >= 90 ? "ok" : t.successRate >= 70 ? "warn" : "bad";
    const yn = (b) => b ? '<span class="pill ok">OUI</span>' : '<span class="pill error">NON</span>';
    const risk = c.risquePerte || "?";
    const riskCls = risk === "FAIBLE" ? "ok" : risk === "MOYEN" ? "warn" : "error";
    const readyUsers = (d.users || []).filter((u) => u.ready).length;

    $("#qaBody").innerHTML = `
      <div class="state-banner ${rateCls}">
        <div class="state-ico">${icon("tests")}</div>
        <div class="state-txt">
          <h2>${t.successRate ?? 0}% de réussite · ${t.pass || 0}/${t.total || 0} scénarios</h2>
          <p>${readyUsers} comptes · ${num(t.delivered || 0)} transferts livrés · <b class="${t.lost ? "sev-error" : ""}">${num(t.lost || 0)} perdus</b> · <b class="${t.duplicated ? "sev-error" : ""}">${num(t.duplicated || 0)} dupliqués</b> · latence médiane ${qaLat(t.medianLatencyMs)} (p95 ${qaLat(t.p95LatencyMs)})</p>
          <p class="muted" style="font-size:12px">Généré ${d.generatedAt ? new Date(d.generatedAt).toLocaleString("fr-FR") : "—"} · durée ${Math.round((d.durationMs || 0) / 1000)}s · v${esc(d.appVersion || "?")}</p>
        </div>
      </div>

      <h3 class="section-title" style="margin-top:18px">Conclusion — la question prioritaire</h3>
      <div class="qa-verdict">
        <div class="qa-vitem">Transfert de données fiable ${yn(c.transfertFiable)}</div>
        <div class="qa-vitem">Synchro multi-appareils ${yn(c.syncMultiAppareils)}</div>
        <div class="qa-vitem">Realtime fiable ${yn(c.realtimeFiable)}</div>
        <div class="qa-vitem">Centre de pilotage cohérent ${yn(c.centrePilotageCoherent)}</div>
        <div class="qa-vitem">Risque de perte <span class="pill ${riskCls}">${esc(risk)}</span></div>
        <div class="qa-vitem">Prêt pour tests utilisateurs ${yn(c.pretTestsUtilisateurs)}</div>
      </div>

      <div class="inter-tiles" style="margin-top:16px">
        ${(d.featureStats || []).map((f) => {
          const col = f.fail ? "var(--err)" : f.warn ? "var(--warn)" : "var(--ok)";
          return `<div class="inter-tile">
            <div class="it-head"><span>${esc(f.feature)}</span></div>
            <div class="it-rate" style="color:${col}">${f.pass}/${f.total}</div>
            <div class="it-sub">${f.fail} FAIL · ${f.warn} WARN</div>
            <div class="it-foot">latence méd. ${qaLat(f.medianLatencyMs)}</div>
          </div>`;
        }).join("") || '<div class="empty" style="grid-column:1/-1">Aucune statistique.</div>'}
      </div>

      <h3 class="section-title" style="margin-top:20px">Matrice de communication (messagerie realtime)</h3>
      <div class="table-wrap"><table><thead><tr><th>Émetteur</th><th>Destinataire</th><th>Statut</th><th>Latence bout-en-bout</th></tr></thead>
        <tbody>${(d.matrix || []).map((m) => `<tr><td>${esc(m.fromLabel || m.from)}</td><td>${esc(m.toLabel || m.to)}</td><td>${qaPill(m.status)}</td><td class="muted">${qaLat(m.latencyMs)}</td></tr>`).join("") || '<tr><td colspan="4" class="empty">Aucun échange.</td></tr>'}</tbody></table></div>

      <h3 class="section-title" style="margin-top:20px">Journal des transferts (${(d.scenarios || []).length} scénarios)</h3>
      <div class="feed-toolbar" style="margin-top:8px">
        <label class="chip-toggle" id="qaFailOnly">${icon("alertTriangle")} <span>Seulement FAIL/WARN</span></label>
        <span class="muted" style="margin-left:auto;font-size:12px" id="qaCount"></span>
      </div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Fonction / type</th><th>De → Vers</th><th>Latence</th><th>Statut</th><th>Attendu → Obtenu</th></tr></thead>
        <tbody id="qaRows"></tbody></table></div>

      ${(d.bugs || []).length ? `<h3 class="section-title" style="margin-top:20px">Anomalies (${d.bugs.length})</h3>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Sévérité</th><th>Fonction</th><th>Scénario</th><th>Attendu</th><th>Obtenu</th></tr></thead>
        <tbody>${d.bugs.map((b) => `<tr><td class="mono">${esc(b.id)}</td><td><span class="pill ${QA_SEV[b.severity] || "info"}">${esc(b.severity)}</span></td><td>${esc(b.feature)}</td><td class="mono" style="font-size:11px">${esc(b.scenario)}</td><td>${esc(b.expected || "")}</td><td class="sev-error">${esc(b.got || b.error || "")}</td></tr>`).join("")}</tbody></table></div>` : ""}

      <h3 class="section-title" style="margin-top:20px">Contrôles d'intégrité</h3>
      <ul class="qa-integrity">${(d.integrity || []).map((i) => `<li>${i.ok ? "✅" : "❌"} ${esc(i.check)} <span class="muted">— ${esc(i.detail)}</span></li>`).join("") || "<li class='muted'>Aucun contrôle.</li>"}</ul>

      <h3 class="section-title" style="margin-top:20px">Comptes de test (${readyUsers}) & graphe de follow (${(d.followGraph || []).filter((e) => e.ok !== false).length} liens)</h3>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Profil</th><th>Suit</th></tr></thead>
        <tbody>${(d.users || []).map((u) => {
          const outs = (d.followGraph || []).filter((e) => e.from === u.index && e.ok !== false).map((e) => esc(e.toLabel || e.to)).join(", ");
          return `<tr><td>U${u.index + 1}</td><td>${esc(u.label)}${u.ready ? "" : ' <span class="pill error">absent</span>'}</td><td class="muted">${outs || "—"}</td></tr>`;
        }).join("")}</tbody></table></div>`;

    // Journal filtrable.
    let failOnly = false;
    const rowsHtml = (list) => list.map((s) => `<tr>
      <td class="mono" style="font-size:11px">${esc(s.id)}</td>
      <td><b>${esc(s.feature)}</b> <span class="muted">${esc(s.type)}</span></td>
      <td>${s.fromLabel ? esc(s.fromLabel) : "—"}${s.toLabel ? " → " + esc(s.toLabel) : ""}</td>
      <td class="muted">${qaLat(s.latencyMs)}</td>
      <td>${qaPill(s.status)}</td>
      <td style="font-size:12px"><span class="muted">${esc(s.expected || "")}</span> → ${s.status === "FAIL" ? '<span class="sev-error">' : ""}${esc(s.got || s.error || "")}${s.status === "FAIL" ? "</span>" : ""}</td>
    </tr>`).join("");
    const renderRows = () => {
      const list = (d.scenarios || []).filter((s) => !failOnly || s.status === "FAIL" || s.status === "WARN");
      $("#qaRows").innerHTML = rowsHtml(list) || '<tr><td colspan="6" class="empty">Aucun scénario.</td></tr>';
      $("#qaCount").textContent = list.length + " scénario" + (list.length > 1 ? "s" : "");
    };
    $("#qaFailOnly").onclick = () => { failOnly = !failOnly; $("#qaFailOnly").classList.toggle("on", failOnly); renderRows(); };
    renderRows();
  }
  S.refresh = refresh; refresh();
};

function interRow(r) {
  let deliv;
  if (r.status === "delivered") {
    const names = [...new Set(r.receipts.map((x) => x.label).filter(Boolean))].map((n) => esc(n));
    deliv = `<span class="pill ok">${icon("checkCircle")} Reçu sur ${r.receiptCount} appareil${r.receiptCount > 1 ? "s" : ""}</span> <span class="muted">${fmtLatency(r.bestLatency)}${names.length ? " · " + names.join(", ") : ""}</span>`;
  } else if (r.status === "pending") {
    deliv = `<span class="pill warn">${icon("clock")} En attente…</span>`;
  } else if (r.status === "unconfirmed") {
    const fix = hasCap("claude")
      ? `<button class="fix-btn" title="Réparer avec Claude" onclick='event.stopPropagation();window.__fixInteraction(${JSON.stringify(r.id)})'>${icon("wrench")}</button>`
      : "";
    deliv = `<span class="pill error">${icon("alertTriangle")} Non reçu ailleurs</span> <span class="muted">aucun autre appareil ne l'a reçu${r.idCorrelated ? "" : " (appariement par le temps)"}</span> ${fix}`;
  } else {
    deliv = `<span class="pill info">Émis</span> <span class="muted">propagation non suivie</span>`;
  }
  const target = r.target ? `<span class="mono" style="font-size:11px;opacity:.6">${esc(String(r.target).slice(0, 8))}</span>` : "";
  return `<tr>
    <td class="muted">${hhmmss(r.ts)}</td>
    <td><span class="it-row-ico">${icon(INTER_ICON[r.kind] || "activity")}</span> <b>${esc(r.kindLabel)}</b> ${target}</td>
    <td>${nameFor(r.emitter.user, r.emitter.label)}</td>
    <td class="td-deliv">${deliv}</td></tr>`;
}

// Réparer un échec de livraison cross-device : on construit un « événement »
// diagnostic (chemin realtime, table, causes connues) et on ouvre le même
// tiroir « Réparer avec Claude » que pour les bugs. On ne passe que l'id.
window.__fixInteraction = (id) => {
  const r = INTER_LAST.find((x) => x.id === id);
  if (!r) return toast("Interaction introuvable (rafraîchis).");
  const d = INTER_DIAG[r.kind] || {};
  const emitter = nameFor(r.emitter.user, r.emitter.label);
  const diag = [
    "Livraison temps réel cross-device ÉCHOUÉE (Supabase Realtime).",
    "",
    `- Interaction : ${r.kindLabel}`,
    `- Émise par : ${emitter}${r.emitter.device ? " (appareil " + r.emitter.device + ")" : ""}${r.screen ? " depuis l'écran " + r.screen : ""}`,
    r.target ? `- Cible : ${r.target}` : "",
    `- Constat : aucun autre appareil n'a reçu cette interaction en temps réel${r.idCorrelated ? "" : " (appariement heuristique par le temps)"}.`,
    "",
    "Chemin realtime concerné :",
    `- Table Supabase : ${d.table || "?"}`,
    `- Canal client : ${d.chan || "realtime:db"}`,
    "- Handler client : js/app-08-ui-modals-tour.js (fonction supaSubscribe, canal « realtime:db » ; messages via _handleIncomingConvMessage).",
    "- Émission : js/telemetry.js (tel.recv, type « rt_recv ») pose la preuve de réception uniquement pour un événement venu d'un AUTRE compte.",
    "",
    "Causes probables à vérifier, dans l'ordre :",
    `1. La table ${d.table || "concernée"} n'est pas (ou plus) dans la publication « supabase_realtime » (ALTER PUBLICATION supabase_realtime ADD TABLE ...).`,
    "2. RLS : l'autre compte n'a pas le droit de SELECT la ligne → Realtime ne la lui diffuse pas.",
    "3. Le canal n'est pas SUBSCRIBED sur l'appareil récepteur, ou un filtre user_id est trop strict.",
    "4. Messages : migration realtime v2/v3 (broadcast) non appliquée → repli v1 défaillant.",
    "5. Appareil récepteur hors-ligne / onglet en arrière-plan au moment de l'émission (à écarter avant de conclure à un bug).",
  ].filter(Boolean).join("\n");
  fixWithClaude({ event: {
    type: "error", severity: "warn",
    action: "delivery_failed_" + r.kind,
    message: `Interaction « ${r.kindLabel} » non reçue sur les autres appareils (livraison temps réel échouée).`,
    screen: r.screen || null,
    stack: diag,
  } }, `Livraison échouée : ${r.kindLabel}`);
};

// ── Bugs & erreurs ──────────────────────────────────────────────────────────
const BUG_STATUS = ["nouveau", "a_analyser", "en_cours", "correctif_propose", "en_test", "corrige", "rouvert", "ignore"];
VIEWS.bugs = async () => {
  mount(`<h2 class="page-title">Problèmes détectés</h2><p class="page-sub">Chaque ligne = un problème rencontré par un utilisateur. Clique une ligne pour les détails, ou le bouton « Réparer » pour le corriger avec Claude en un clic.</p>
    <div class="table-wrap"><table><thead><tr><th>Gravité</th><th>Problème</th><th>Fois</th><th>Users</th><th>Statut</th><th>Vu</th><th>Réparer</th></tr></thead><tbody id="bugRows"></tbody></table></div>`);
  async function refresh() {
    const bugs = await api.get("/bugs");
    $("#bugRows").innerHTML = bugs.map((b) => `<tr onclick="window.__bug('${b.id}')"><td><span class="pill ${b.severity}">${b.severity}</span></td><td><strong>${esc(b.title)}</strong><div class="muted" style="font-size:11px">${esc(b.codeRef ? b.codeRef.file + (b.codeRef.line ? ":" + b.codeRef.line : "") : b.action || "")}</div></td><td>${b.count}</td><td>${b.users}</td><td><span class="pill ${b.status}">${b.status.replace(/_/g, " ")}</span></td><td class="muted">${ago(b.lastSeen)}</td><td>${hasCap("claude") ? `<button class="fix-btn big" title="Réparer avec Claude" onclick="event.stopPropagation();window.__fixBug('${b.id}')">${icon("wrench")}</button>` : "—"}</td></tr>`).join("") || '<tr><td colspan="7" class="empty">Aucun problème détecté. 🎉</td></tr>';
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
        ${hasCap("claude") ? `<button class="btn btn-sm btn-primary" onclick="window.__fixBug('${b.id}')">${icon("wrench")} Réparer avec Claude</button>` : ""}
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

// ── Réparer avec Claude (liste simple des problèmes → 1 clic) ────────────────
VIEWS.claude = async (view, params) => {
  const via = S.me.claudeVia;
  const statusHtml = S.me.claudeLive
    ? `<div class="fix-note ok" style="margin-bottom:16px">${icon("checkCircle")} Réparation automatique <b>active</b>${via === "cli" ? " — via Claude Code (gratuit)" : via === "api" ? " — via clé API" : ""}. Clique « Réparer » sur un problème : Claude t'explique en clair et donne le correctif (~30-60 s).</div>`
    : `<div class="fix-note" style="margin-bottom:16px">${icon("alertTriangle")} Réparation automatique <b>inactive</b>. Tu peux quand même copier les instructions pour Claude Code. Pour l'activer gratuitement : <a href="#settings">Paramètres → Réparation automatique</a>.</div>`;
  mount(`<h2 class="page-title">Réparer avec Claude</h2><p class="page-sub">La liste des problèmes détectés. Clique « Réparer » : Claude t'explique la cause <b>en clair</b> et te donne le correctif.</p>
    ${statusHtml}<div id="clWrap"><div class="empty"><span class="spinner"></span></div></div>`);
  let bugs = [];
  try { bugs = await api.get("/bugs"); } catch (e) { $("#clWrap").innerHTML = `<div class="empty">Erreur de chargement : ${esc(e.message)}</div>`; return; }

  if (!bugs.length) {
    $("#clWrap").innerHTML = `<div class="card card-pad"><div class="empty">${icon("checkCircle")}<p>Aucun problème pour l'instant. 🎉</p><p class="muted" style="font-size:13px">Dès qu'une erreur est rencontrée par un utilisateur, elle apparaît ici avec un bouton « Réparer ».</p></div></div>`;
    return;
  }

  const open = bugs.filter((b) => b.status !== "corrige" && b.status !== "ignore");
  const list = open.length ? open : bugs;
  $("#clWrap").innerHTML = list.map((b) => `<div class="card card-pad problem-card">
      <div class="pc-main">
        <div class="pc-title"><span class="pill ${b.severity}">${b.severity === "critical" ? "critique" : b.severity}</span> <strong>${esc(b.title)}</strong></div>
        <div class="muted" style="font-size:12.5px;margin-top:4px">${b.count} fois · ${b.users} utilisateur${b.users > 1 ? "s" : ""}${b.screens && b.screens.length ? " · écran " + esc(b.screens.slice(0, 2).join(", ")) : ""}${b.codeRef ? " · " + esc(b.codeRef.file) : ""}</div>
      </div>
      <div class="pc-actions">
        <button class="btn" onclick="window.__bug('${b.id}')">${icon("filter")} Détails</button>
        <button class="btn btn-primary" onclick="window.__fixBug('${b.id}')">${icon("wrench")} Réparer</button>
      </div>
    </div>`).join("");

  if (params[0]) { const b = list.find((x) => x.id === params[0]); if (b) fixWithClaude({ bugId: b.id }, b.title); }
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
  const fix = hasCap("claude") && (a.level === "critical" || a.level === "high")
    ? `<button class="fix-btn" title="Réparer avec Claude" onclick="window.__fixAlert('${a.id}')">${icon("wrench")}</button>` : "";
  return `<div class="alert-item ${a.level} ${a.acknowledged ? "ack" : ""}"><div class="a-row"><div class="a-title">${esc(a.title)}</div>${fix}</div><div class="a-msg">${esc(a.message || "")}</div><div class="a-time">${new Date(a.ts).toLocaleString("fr-FR")}${a.acknowledged ? " · vu" : hasCap("alerts") ? ` · <a href="#" onclick="window.__ackAlert('${a.id}');return false">marquer comme vu</a>` : ""}</div></div>`;
}
window.__ackAlert = async (id) => { await api.post(`/alerts/${id}/ack`, {}); const a = S.alerts.find((x) => x.id === id); if (a) a.acknowledged = true; if (S.currentView === "alerts") VIEWS.alerts($("#view")); updateAlertBadges(); };

// ── Sentinelle (débogage automatique permanent) ─────────────────────────────
// Cette page ne demande AUCUN geste : elle montre ce que la sentinelle a déjà
// diagnostiqué toute seule. Le seul bouton est l'interrupteur du moteur.
const SENT_VERDICT = {
  defect: { label: "Défaut réel", cls: "error" },
  expected: { label: "Comportement attendu", cls: "ok" },
  insufficient: { label: "Données insuffisantes", cls: "warn" },
};
const SENT_KIND = { trace: "chaîne d'action", bug: "bug groupé", generic: "signal brut" };

VIEWS.sentinel = async () => {
  mount(`<h2 class="page-title">Sentinelle</h2>
    <p class="page-sub">Le débogage automatique. Elle écoute les alertes en continu, analyse les problèmes sérieux
      avec Claude Code et publie la cause ici — sans que tu aies rien à lancer. Elle ne modifie jamais le code :
      elle explique et propose.</p>
    <div id="sentState"></div>
    <div id="sentList" class="empty">Chargement…</div>`);
  S.refresh = async () => {
    const r = await api.get("/sentinel?limit=50").catch((e) => ({ error: e.message }));
    if (r.error) { $("#sentList").innerHTML = `<div class="empty">${esc(r.error)}</div>`; return; }
    S.sentinel = r.state;
    renderSentinelState(r.state);
    $("#sentList").className = "";
    $("#sentList").innerHTML = r.diagnoses.length
      ? r.diagnoses.map(sentItem).join("")
      : `<div class="empty">Aucun diagnostic pour l'instant. C'est bon signe : la sentinelle n'analyse que les alertes
           <b>critiques</b> et <b>élevées</b>. Elle se déclenchera d'elle-même au prochain vrai problème.</div>`;
  };
  await S.refresh();
};

function renderSentinelState(st) {
  const el = $("#sentState"); if (!el || !st) return;
  const on = st.enabled && st.available;
  const why = !st.available
    ? "Aucune source d'analyse : lance <span class=\"mono\">claude</span> dans un terminal et connecte-toi (gratuit avec ton abonnement), ou ajoute une clé API."
    : !st.enabled ? "Moteur en veille — tu l'as désactivé." : "";
  const running = st.running
    ? `<div class="sent-running"><span class="spinner"></span> Analyse en cours : ${esc(st.running.title || "")}${st.running.deep ? " (approfondie, elle lit le code)" : ""}</div>`
    : "";
  el.innerHTML = `
    <div class="sent-state ${on ? "on" : "off"}">
      <div class="sent-state-main">
        <span class="sent-dot"></span>
        <b>${on ? "Sentinelle active" : "Sentinelle inactive"}</b>
        <span class="muted">· ${st.total} diagnostic(s) depuis le démarrage · ${st.runsLastHour}/${st.settings.maxPerHour} sur la dernière heure${st.queued ? ` · ${st.queued} en attente` : ""}</span>
      </div>
      ${why ? `<div class="muted" style="font-size:12px;margin-top:6px">${why}</div>` : ""}
      ${running}
      ${hasCap("settings") ? `<button class="btn" id="sentToggle" style="margin-top:10px">${st.enabled ? "Mettre en veille" : "Réactiver"}</button>` : ""}
    </div>`;
  const t = $("#sentToggle");
  if (t) t.onclick = async () => {
    t.disabled = true;
    try { const r = await api.post("/sentinel/toggle", { enabled: !st.enabled }); renderSentinelState(r.state); toast(r.enabled ? "Sentinelle active" : "Sentinelle en veille"); }
    catch (e) { toast(e.message); t.disabled = false; }
  };
}

function sentItem(d) {
  const v = SENT_VERDICT[d.verdict];
  const head = (d.analysis || "").match(/##\s*En clair\s*\n+([\s\S]{0,320}?)(?:\n##|$)/i);
  const gist = d.error ? "" : (head ? head[1].trim().replace(/\s+/g, " ") : (d.analysis || "").slice(0, 220));
  return `<div class="sent-item ${d.level}" onclick="window.__openSentinel('${esc(d.id)}')">
      <div class="a-row">
        <div class="a-title">${esc(d.title)}</div>
        ${v ? `<span class="pill ${v.cls}">${v.label}</span>` : d.error ? '<span class="pill error">Analyse en échec</span>' : ""}
      </div>
      <div class="a-msg">${esc(gist || d.error || "")}</div>
      <div class="a-time">${new Date(d.ts).toLocaleString("fr-FR")} · ${SENT_KIND[d.kind] || d.kind}${d.deep ? " · lecture du code" : ""} · ${Math.round((d.durationMs || 0) / 1000)} s</div>
    </div>`;
}

window.__openSentinel = async (id) => {
  openDrawer(`${icon("sparkles")} Diagnostic automatique`, '<div class="empty"><span class="spinner"></span></div>');
  try {
    const d = await api.get("/sentinel/" + encodeURIComponent(id));
    const v = SENT_VERDICT[d.verdict];
    openDrawer(`${icon("sparkles")} ${esc(d.title)}`,
      `<div class="fix-intro">${esc(d.subject || "")}</div>
       <div class="muted" style="font-size:12px;margin-bottom:10px">
         ${new Date(d.ts).toLocaleString("fr-FR")} · ${SENT_KIND[d.kind] || d.kind}${d.deep ? " · Claude a lu le code du dépôt" : ""}
         ${v ? ` · <span class="pill ${v.cls}">${v.label}</span>` : ""}
       </div>
       ${d.error ? `<div class="empty">L'analyse a échoué : ${esc(d.error)}</div>` : `<div class="fix-analysis">${mdToHtml(d.analysis)}</div>`}
       <p class="muted" style="font-size:12px;margin-top:14px">Diagnostic produit automatiquement, en lecture seule. Aucun fichier n'a été modifié.</p>`);
  } catch (e) { openDrawer(`${icon("sparkles")} Diagnostic`, `<div class="empty">${esc(e.message)}</div>`); }
};

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

// ── Sources de données (état live des intégrations) ──────────────────────────
VIEWS.sources = async () => {
  mount(`<h2 class="page-title">Sources de données</h2>
    <p class="page-sub">État réel de chaque intégration alimentant le pilotage. Aucune donnée n'est affichée sans provenance ; « inconnu » et « non configuré » sont explicites.</p>
    <div class="table-wrap"><table><thead><tr><th>Source</th><th>État</th><th>Détail</th><th>Fraîcheur</th></tr></thead><tbody id="srcRows"></tbody></table></div>
    <p class="muted" style="font-size:12px;margin-top:12px">Référence : <span class="mono">.passio/INTEGRATIONS_REGISTRY.md</span> — <span class="prov-pill ok" style="vertical-align:middle">Connecté</span> = données de prod réelles · <span class="prov-pill off" style="vertical-align:middle">Non connecté / absent</span></p>`);

  const [ov, cs] = await Promise.all([
    api.get("/overview").catch(() => ({ ingest: {} })),
    api.get("/claude/status").catch(() => null),
  ]);
  const git = hasCap("git_read") ? await api.get("/git/status").catch(() => null) : null;
  const ing = ov.ingest || {};
  const lastSeen = ing.lastSeenIso ? Date.parse(ing.lastSeenIso) : null;

  // état → { cls, label } ; ok=vert, warn=orange, off=neutre (config), unknown=neutre
  const P = { ok: ["ok", "Connecté"], active: ["ok", "Actif"], warn: ["warn", "Dégradé"], off: ["info", "Non connecté"], absent: ["info", "Absent"], unknown: ["info", "Inconnu"] };
  const rows = [];
  const push = (name, stateKey, detail, fresh, labelOverride) => {
    const [cls, lbl] = P[stateKey] || P.unknown;
    rows.push(`<tr><td><b>${esc(name)}</b></td><td><span class="pill ${cls}">${esc(labelOverride || lbl)}</span></td><td>${detail}</td><td class="muted nowrap">${fresh || "—"}</td></tr>`);
  };

  push("Supabase (Postgres · Auth · Storage)", ing.supabaseReady ? "ok" : "off",
    ing.supabaseReady ? "Clé <span class='mono'>service_role</span> côté serveur (jamais exposée au navigateur)" : "Mode local — renseigner <span class='mono'>dashboard/.env</span>", "—");
  push("Télémétrie (<span class='mono'>telemetry_events</span>)", (ing.buffered || 0) > 0 ? "ok" : ing.supabaseReady ? "unknown" : "off",
    `${num(ing.buffered || 0)} événements en mémoire`, lastSeen ? "il y a " + ago(lastSeen) : "aucun signal", (ing.buffered || 0) > 0 ? "Reçoit" : undefined);
  push("Realtime (postgres_changes)", ing.realtimeOk ? "active" : ing.supabaseReady ? "warn" : "off",
    ing.realtimeOk ? "Abonné aux INSERT" : ing.supabaseReady ? "Repli sur polling (5 s)" : "Nécessite Supabase", "—",
    ing.realtimeOk ? "Actif" : ing.supabaseReady ? "Secours" : "Non connecté");
  // Assistant Claude (analyse de bug)
  const cli = cs && cs.cli || {};
  const claudeState = cli.loggedIn ? "ok" : cs && cs.apiKey ? "ok" : cli.installed ? "warn" : "off";
  const claudeDetail = cli.loggedIn ? `CLI connectée (analyse gratuite)${cli.version ? " · " + esc(cli.version) : ""}`
    : cs && cs.apiKey ? "Clé API configurée"
    : cli.installed ? "CLI installée mais non connectée (<span class='mono'>claude auth login</span>)"
    : "Ni CLI ni clé API — mode « copier le prompt »";
  push("Assistant Claude (réparation)", claudeState, claudeDetail, "—", cli.loggedIn || (cs && cs.apiKey) ? "Disponible" : cli.installed ? "À reconnecter" : "Indisponible");
  // Git (si autorisé)
  if (git) {
    const dirty = (git.files || []).length;
    push("Dépôt Git (local)", dirty ? "warn" : "ok",
      `Branche <span class='mono'>${esc(git.branch || "?")}</span> · ${num(dirty)} fichier(s) modifié(s)${git.ahead ? ` · ${git.ahead} en avance` : ""}`, "—",
      dirty ? "Modifs en cours" : "Propre");
  }
  // Intégrations connues NON configurées (honnêteté : on le dit, on ne masque pas).
  push("SMTP (confirmation e-mail)", "absent", "Non configuré — <b>P0</b> confidentialité (cf. KNOWN_RISKS R1)", "—", "Non configuré");
  push("Paiements (Stripe)", "absent", "Hors périmètre actuel — exploration/ADR", "—");
  push("Analytics tiers (PostHog/GA)", "absent", "Non branché — télémétrie maison utilisée", "—");

  $("#srcRows").innerHTML = rows.join("");
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
    <div class="card card-pad" style="margin-top:14px" id="claudeCard">${claudeSettingsHtml()}</div>
    <div class="card card-pad" style="margin-top:14px"><h4 style="margin-top:0">Apparence</h4><button class="btn" id="setTheme">${icon("moon")} Basculer le thème</button></div>`);
  $("#setTheme").onclick = toggleTheme;
  wireClaudeCard();
};
function claudeSettingsHtml() {
  const via = S.me.claudeVia; // "api" | "cli" | "manuel"
  const on = S.me.claudeLive;
  const label = via === "cli" ? "Active — via Claude Code (gratuit)" : via === "api" ? "Active — via clé API" : "Inactive";
  const desc = on
    ? "Le bouton « Réparer » écrit le diagnostic et le correctif directement à l'écran, sans copier-coller."
    : "Le bouton « Réparer » prépare le texte à coller dans Claude Code. Active l'analyse automatique ci-dessous — gratuitement.";
  return `<h4 style="margin-top:0">${icon("wrench")} Réparation automatique par Claude</h4>
    <div class="claude-status ${on ? "on" : "off"}">${icon(on ? "checkCircle" : "alertTriangle")}<div><strong>${label}</strong><div class="muted" style="font-size:12.5px">${desc}</div></div></div>
    ${on ? "" : `<div class="section-title" style="margin-top:16px">Activer gratuitement (recommandé)</div>
    <p class="muted" style="font-size:13px;margin-top:0">${S.me.claudeInstalled ? "Claude Code est bien installé sur cet ordinateur, il faut juste le <b>connecter</b> (gratuit, avec ton abonnement) :" : "Utilise Claude Code avec ton abonnement, <b>sans payer au message</b> :"}</p>
    <ol class="setup-steps">
      <li>Ouvre une <b>invite de commandes</b> (touche Windows → tape « cmd » → Entrée).</li>
      <li>Copie-colle cette commande exacte, puis Entrée : <span class="mono">claude auth login</span></li>
      <li>Une page web s'ouvre → connecte-toi avec ton compte et autorise.</li>
      <li>Reviens ici et clique <b>« Revérifier »</b> ci-dessous.</li>
    </ol>
    <p class="muted" style="font-size:12px;margin-top:-4px">⚠️ Ouvrir juste <span class="mono">claude</span> ne suffit pas : c'est bien <span class="mono">claude auth login</span> qui reconnecte.</p>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="btn btn-primary" id="claudeRecheck">${icon("refresh")} Revérifier</button><span class="muted" id="claudeRecheckMsg" style="font-size:12.5px"></span></div>
    <details class="fix-details" style="margin-top:14px"><summary>Autre option : clé API (payante)</summary><ol class="setup-steps"><li>Clé sur <span class="mono">console.anthropic.com</span> → API Keys.</li><li>Colle-la après <span class="mono">ANTHROPIC_API_KEY=</span> dans <span class="mono">dashboard/.env</span>, puis redémarre.</li></ol></details>`}`;
}
function wireClaudeCard() {
  const btn = $("#claudeRecheck");
  if (!btn) return;
  btn.onclick = async () => {
    const msg = $("#claudeRecheckMsg"); btn.disabled = true; if (msg) msg.textContent = "Vérification…";
    try {
      const r = await api.post("/claude/recheck", {});
      S.me.claudeLive = r.cli.available || r.apiKey;
      S.me.claudeVia = r.apiKey ? "api" : r.cli.available ? "cli" : "manuel";
      $("#claudeCard").innerHTML = claudeSettingsHtml(); wireClaudeCard();
      if (S.me.claudeLive) toast("Réparation automatique activée ✓");
      else if (msg) msg.textContent = "Toujours pas connecté. Lance « claude » dans un terminal et connecte-toi.";
      renderNav();
    } catch (e) { if (msg) msg.textContent = e.message; btn.disabled = false; }
  };
}

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
  learnName(ev);
  // Le centre de notifications reçoit TOUT, même quand le flux est en pause.
  pushNotif(notifFromEvent(ev));
  if (S.paused) return;
  S.buffer.push(ev);
  if (S.buffer.length > 2000) S.buffer.shift();
  if (LIVE.has(S.currentView) && S.refresh) {
    const now = Date.now();
    if (now - refreshThrottle > 1200) { refreshThrottle = now; S.refresh(); }
  }
}
// Signal « interactions à rafraîchir » (coalescé côté serveur) : ne rappelle
// l'API que si la vue de vérification est ouverte, avec un léger debounce.
let interSignalT = 0;
function onInteractionSignal() {
  if (S.currentView !== "interactions" || !S.refresh) return;
  const now = Date.now();
  if (now - interSignalT < 800) return;
  interSignalT = now; S.refresh();
}
// Signal « traces à rafraîchir » (coalescé côté serveur) : idem, ciblé sur la vue.
let traceSignalT = 0;
function onTraceSignal() {
  if (S.currentView !== "traces" || !S.refresh) return;
  const now = Date.now();
  if (now - traceSignalT < 800) return;
  traceSignalT = now; S.refresh();
}
function onAlert(a) {
  S.alerts.unshift(a); updateAlertBadges();
  toast("⚠ " + a.title);
  if (S.currentView === "alerts") $("#alList").insertAdjacentHTML("afterbegin", alertItem(a));
  // Les alertes (anomalies) remontent AUSSI dans le centre de notifications.
  const n = notifFromAlert(a); if (n) pushNotif(n);
}
// La sentinelle vient de terminer un diagnostic : il doit arriver À L'ÉCRAN sans
// que personne ne rafraîchisse. Toast + cloche + insertion en tête si la page
// Sentinelle est ouverte.
function onSentinelDiagnosis(d) {
  if (!d) return;
  const v = SENT_VERDICT[d.verdict];
  toast(`${d.error ? "⚠" : "✓"} Sentinelle : ${d.title}${v ? " — " + v.label : ""}`);
  pushNotif({
    id: d.id, ts: d.ts, title: "Diagnostic automatique : " + d.title,
    who: v ? v.label : (d.error ? "analyse en échec" : "cause identifiée"),
    sub: "", view: "sentinel", level: d.verdict === "expected" ? "info" : d.level || "warn", ic: "sparkles",
  });
  if (S.currentView === "sentinel") {
    const list = $("#sentList");
    if (list) { if (list.classList.contains("empty")) { list.className = ""; list.innerHTML = ""; } list.insertAdjacentHTML("afterbegin", sentItem(d)); }
  }
}
function onSentinelState(st) {
  S.sentinel = st;
  if (S.currentView === "sentinel") renderSentinelState(st);
}

function updateAlertBadges() {
  const open = S.alerts.filter((a) => !a.acknowledged).length;
  const nb = $("#navAlerts"); if (nb) { nb.hidden = !open; nb.textContent = open; }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CENTRE DE NOTIFICATIONS — « tout ce qui se passe » (cloche de la barre haute)
//  Alimenté par le flux SSE (onLiveEvent) + les alertes. Chaque notification
//  porte une VUE cible : cliquer une ligne ouvre la page concernée.
// ═══════════════════════════════════════════════════════════════════════════
const NF_COLOR = { critical: "var(--crit)", high: "var(--err)", warn: "var(--warn)", info: "var(--accent)" };
// Bruit pur de plomberie télémétrique : jamais une « chose qui se passe ».
const NOTIF_SKIP_ACTIONS = new Set(["heartbeat", "hidden", "visible"]);
const _nfCoalesce = new Map();   // clé (user|type|action|écran) -> ts, anti-rafale

// Transforme un événement du flux en notification, ou null si on l'écarte.
function notifFromEvent(ev) {
  if (!ev) return null;
  const t = ev.type, a = ev.action;
  if (a && NOTIF_SKIP_ACTIONS.has(a)) return null;
  // API qui répond bien = plomberie ; on ne garde que les erreurs / lenteurs.
  if (t === "api" && ev.status !== "error" && !(ev.http_status >= 500) && !(ev.duration_ms > 2500)) return null;

  let view = "activity", level = "info", ic = "activity";
  if (t === "error") { view = "bugs"; level = ev.severity === "critical" ? "critical" : "high"; ic = "bugs"; }
  else if (t === "connectivity") { view = "users"; level = ev.severity === "error" ? "high" : "warn"; ic = "wifi"; }
  else if (t === "link") { view = "links"; ic = "share"; level = (a === "link_load_error" || ev.status === "error") ? "warn" : "info"; }
  else if (t === "api") { view = "performance"; ic = "performance"; level = (ev.status === "error" || ev.http_status >= 500) ? "high" : "warn"; }
  else if (t === "session" || t === "lifecycle") {
    if (a === "offline" || a === "send_failed" || a === "server_reject") { view = "users"; level = "warn"; ic = "wifi"; }
    else { view = "visitors"; ic = "route"; }   // début de session / connexion / reconnexion
  }
  else if (a === "publish_post" || a === "publish_reel") { view = "content"; ic = "content"; }
  else if (a === "like_post" || a === "unlike_post" || a === "comment_post") { view = "content"; ic = "heart"; }
  else if (a === "send_message") { view = "messaging"; ic = "messaging"; }
  else if (a === "event_join" || a === "event_leave") { view = "content"; ic = "content"; }
  else if (t === "nav" || a === "screen_view" || t === "click") { view = "activity"; ic = "activity"; }

  // Anti-rafale : une même action répétée par le même utilisateur en < 2,5 s = 1 notif.
  const now = ev.ts || Date.now();
  const key = (ev.user_id || ev.device_id || "?") + "|" + t + "|" + (a || "") + "|" + (ev.screen || "");
  if (_nfCoalesce.get(key) && now - _nfCoalesce.get(key) < 2500) return null;
  _nfCoalesce.set(key, now);
  if (_nfCoalesce.size > 500) _nfCoalesce.clear();

  const sub = [ev.platform && ev.browser ? ev.platform + "/" + ev.browser : "", ev.screen ? "écran " + ev.screen : ""].filter(Boolean).join(" · ");
  return { id: ev.id || ("nf_" + now + "_" + Math.random().toString(36).slice(2)), ts: now, title: actionLabel(ev), who: who(ev), sub, view, level, ic };
}

// Transforme une alerte (anomalie) en notification cliquable.
function notifFromAlert(a) {
  const m = a.meta || {};
  let view = "alerts", ic = "alertTriangle";
  // Une alerte qui DÉCLARE sa destination l'emporte : sinon une alerte de
  // chaîne d'action (qui porte aussi un utilisateur) atterrirait sur « Comptes ».
  if (m.view) { view = m.view; ic = m.view === "traces" ? "route" : ic; }
  else if (m.bug) { view = "bugs"; ic = "bugs"; }
  else if (m.endpoint) { view = "performance"; ic = "performance"; }
  else if (m.link) { view = "links"; ic = "share"; }
  else if (m.device || m.user) { view = "users"; ic = "wifi"; }
  return { id: a.id || ("nf_al_" + Date.now()), ts: a.ts || Date.now(), title: a.title || "Alerte", who: esc(a.message || ""), sub: "", view, level: a.level || "warn", ic };
}

function pushNotif(n) {
  if (!n) return;
  S.notifs.unshift(n);
  if (S.notifs.length > 200) S.notifs.pop();
  updateNotifBadge();
  if (isNotifOpen()) renderNotifList();
}
function updateNotifBadge() {
  const n = S.notifs.filter((x) => x.ts > S.notifSeen).length;
  const c = $("#notifCount"); if (!c) return;
  const prev = c.hidden ? 0 : parseInt(c.textContent, 10) || 0;
  c.hidden = !n; c.textContent = n > 99 ? "99+" : String(n);
  // Petit « pop » rouge quand une notification apparaît (le chiffre grandit).
  if (n > prev) { c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop"); }
}
function notifRow(n) {
  return `<button class="notif-row lvl-${esc(n.level)}" data-view="${esc(n.view)}">
    <span class="nf-dot" style="background:${NF_COLOR[n.level] || "var(--accent)"}"></span>
    <span class="nf-ic">${icon(n.ic || "activity")}</span>
    <span class="nf-body"><span class="nf-title">${esc(n.title)}</span><span class="nf-sub">${n.who || ""}${n.sub ? " · " + esc(n.sub) : ""}</span></span>
    <span class="nf-time">${ago(n.ts)}</span></button>`;
}
function renderNotifList() {
  const el = $("#notifList"); if (!el) return;
  el.innerHTML = S.notifs.length
    ? S.notifs.map(notifRow).join("")
    : '<div class="empty" style="padding:28px">Rien pour l\'instant. Les événements apparaîtront ici en direct.</div>';
}
function isNotifOpen() { const p = $("#notifPanel"); return p && !p.hidden; }
function markNotifsSeen() {
  S.notifSeen = Date.now();
  try { localStorage.setItem("dash_notif_seen", String(S.notifSeen)); } catch {}
}
function openNotifPanel() {
  renderNotifList();
  $("#notifPanel").hidden = false; $("#notifScrim").hidden = false;
  markNotifsSeen(); updateNotifBadge();
}
function closeNotifPanel() { const p = $("#notifPanel"); if (p) p.hidden = true; const s = $("#notifScrim"); if (s) s.hidden = true; }
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
// ── Palette de commandes (Ctrl/⌘-K) ──────────────────────────────────────────
// Navigation clavier vers n'importe quelle vue + actions rapides. Se construit
// une fois, respecte les capacités du rôle (hasCap).
function setupCommandPalette() {
  if (document.getElementById("cmdPalette")) return;
  const el = document.createElement("div");
  el.id = "cmdPalette"; el.className = "cmd-palette"; el.hidden = true;
  el.innerHTML = `<div class="cmd-scrim"></div>
    <div class="cmd-box" role="dialog" aria-modal="true" aria-label="Palette de commandes">
      <input id="cmdInput" class="cmd-input" placeholder="Aller à… (tape pour filtrer, ↑↓ puis Entrée)" aria-label="Commande" autocomplete="off" />
      <div id="cmdList" class="cmd-list" role="listbox"></div>
    </div>`;
  document.body.appendChild(el);
  const pal = el, inp = el.querySelector("#cmdInput"), list = el.querySelector("#cmdList");
  let filtered = [], sel = 0;

  const items = () => [
    ...NAV.filter((n) => hasCap(n[3])).map((n) => ({ label: n[1], ic: n[2], kind: "Aller à", run: () => (location.hash = n[0]) })),
    { label: "Basculer le thème clair / sombre", ic: "moon", kind: "Action", run: toggleTheme },
    { label: "Plein écran (supervision)", ic: "maximize", kind: "Action", run: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()) },
    { label: "Se déconnecter", ic: "logout", kind: "Action", run: async () => { await api.post("/logout", {}); location.reload(); } },
  ];
  function render(q) {
    const ql = q.trim().toLowerCase();
    filtered = items().filter((it) => it.label.toLowerCase().includes(ql));
    if (sel >= filtered.length) sel = filtered.length - 1;
    if (sel < 0) sel = 0;
    list.innerHTML = filtered.map((it, i) =>
      `<div class="cmd-row${i === sel ? " sel" : ""}" role="option" aria-selected="${i === sel}" data-i="${i}">${icon(it.ic)}<span class="cmd-label">${esc(it.label)}</span><span class="cmd-kind">${it.kind}</span></div>`
    ).join("") || `<div class="cmd-empty">Aucun résultat</div>`;
  }
  function open() { pal.hidden = false; inp.value = ""; sel = 0; render(""); setTimeout(() => inp.focus(), 0); }
  function close() { pal.hidden = true; }
  function activate(it) { if (!it) return; close(); it.run(); }

  el.querySelector(".cmd-scrim").onclick = close;
  inp.addEventListener("input", () => { sel = 0; render(inp.value); });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, filtered.length - 1); render(inp.value); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); render(inp.value); }
    else if (e.key === "Enter") { e.preventDefault(); activate(filtered[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  list.addEventListener("click", (e) => { const row = e.target.closest("[data-i]"); if (row) activate(filtered[Number(row.dataset.i)]); });
  // Raccourci global : Ctrl/⌘-K bascule la palette.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); pal.hidden ? open() : close(); }
  });
}

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
  // Garder le badge : innerHTML = icône + span compteur (sinon le span est écrasé).
  $("#notifBtn").innerHTML = icon("alerts") + '<span id="notifCount" class="badge-count" hidden>0</span>';
  renderNav();
  // Amorçage : buffer initial + alertes
  try { S.buffer = (await api.get("/events?limit=500")).reverse(); learnNames(S.buffer); } catch {}
  // Amorce le centre de notifications avec le contexte récent. Le seuil « vu » est
  // mémorisé (localStorage) : au chargement, le badge rouge montre déjà les notifs
  // non vues depuis la dernière ouverture du panneau.
  S.notifs = S.buffer.slice(-80).reverse().map(notifFromEvent).filter(Boolean).slice(0, 50);
  S.notifSeen = Number(localStorage.getItem("dash_notif_seen") || 0); updateNotifBadge();
  try { Object.assign(S.names, await api.get("/names")); } catch {}
  // Rafraîchit les pseudos résolus par le serveur toutes les 30 s.
  setInterval(async () => { try { Object.assign(S.names, await api.get("/names")); if (LIVE.has(S.currentView) && S.refresh) S.refresh(); } catch {} }, 30000);
  try { S.alerts = await api.get("/alerts"); updateAlertBadges(); } catch {}
  // SSE
  connectStream({
    open: () => setSse(true), error: () => setSse(false),
    event: onLiveEvent, interaction: onInteractionSignal, trace: onTraceSignal, alert: onAlert, test: onTest, ping: () => setSse(true),
    sentinel: onSentinelDiagnosis, sentinelState: onSentinelState,
  });
  // Événements UI
  window.addEventListener("hashchange", route);
  window.addEventListener("dash:unauth", () => showLogin());
  $("#logoutBtn").onclick = async () => { await api.post("/logout", {}); location.reload(); };
  $("#themeBtn").onclick = toggleTheme;
  $("#menuToggle").onclick = () => document.getElementById("app").classList.toggle("nav-open");
  $("#drawerClose").onclick = closeDrawer; $("#drawerScrim").onclick = closeDrawer;
  // Centre de notifications : la cloche ouvre le panneau ; une ligne ouvre sa page.
  $("#notifBtn").onclick = openNotifPanel;
  $("#notifClose").onclick = closeNotifPanel;
  $("#notifScrim").onclick = closeNotifPanel;
  $("#notifClear").onclick = () => { S.notifs = []; markNotifsSeen(); renderNotifList(); updateNotifBadge(); };
  $("#notifList").addEventListener("click", (e) => {
    const row = e.target.closest(".notif-row"); if (!row) return;
    const v = row.dataset.view; closeNotifPanel(); if (v) location.hash = v;
  });
  const runGlobalSearch = () => {
    const q = $("#globalSearch").value.trim(); if (!q) return;
    location.hash = "activity";
    setTimeout(() => { const u = $("#fUser"); if (u) { u.value = q; u.dispatchEvent(new Event("input")); } }, 60);
  };
  $("#globalSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runGlobalSearch(); } });
  $("#globalSearchBtn").onclick = runGlobalSearch;
  $("#fullscreenBtn").onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDrawer(); closeNotifPanel(); } });
  setupCommandPalette();
  // Lien d'évitement : donne le focus au contenu sans déclencher le routeur par hash.
  const skip = $("#skipLink");
  if (skip) skip.addEventListener("click", (e) => { e.preventDefault(); const v = $("#view"); v.focus(); v.scrollIntoView(); });
  // Rafraîchissement périodique doux des vues non-live basées sur agrégats
  setInterval(() => { if (["overview", "performance", "services"].includes(S.currentView) && S.refresh) S.refresh(); }, 10000);
  route();
}
boot();
