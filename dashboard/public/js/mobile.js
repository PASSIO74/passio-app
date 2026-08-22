const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s);

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) {
    const e = new Error((data && data.error) || ("HTTP " + res.status));
    e.status = res.status;
    throw e;
  }
  return data;
}

function cls(state) {
  const s = String(state || "UNKNOWN").toUpperCase();
  if (s === "PASS" || s === "GO" || s === "LIVE" || s === "PROMOTED_LOCAL") return "pass";
  if (s === "FAIL" || s === "NO_GO" || s === "UNAVAILABLE" || s === "ROLLED_BACK") return "fail";
  if (s === "STALE") return "stale";
  return "unknown";
}
function card(title, state, detail) {
  const el = document.createElement("article"); el.className = "m-card";
  const h = document.createElement("div"); h.className = "m-card-head";
  const t = document.createElement("strong"); t.textContent = title;
  const p = document.createElement("span"); p.className = "m-pill " + cls(state); p.textContent = state || "UNKNOWN";
  h.append(t, p); el.append(h);
  if (detail) { const d = document.createElement("p"); d.textContent = detail; el.append(d); }
  return el;
}
function clear(id){ const el=$(id); while(el.firstChild) el.removeChild(el.firstChild); return el; }
function unavailable(id, title, e) {
  const root = clear(id);
  const forbidden = e && (e.status === 401 || e.status === 403);
  root.append(card(title, forbidden ? "UNKNOWN" : "UNAVAILABLE", forbidden ? "Non disponible pour ce rôle." : (e?.message || "Preuve indisponible.")));
}

function renderGuardian(g) {
  $("decision").textContent = g.decision || "UNKNOWN";
  $("decision").className = "m-pill " + cls(g.decision);
  $("headline").textContent = g.decision === "GO" ? "Release autorisable" : "Release bloquée";
  $("generated").textContent = g.generatedAt ? new Date(g.generatedAt).toLocaleString("fr-FR") : "—";
  const root = clear("gates");
  (g.gates || []).forEach(x => root.append(card(x.key, x.state, x.detail)));
}
function renderActions(c) {
  const root = clear("actions");
  const list = c.actions || [];
  if (!list.length) root.append(card("Aucune action urgente", "PASS", "Aucun risque prioritaire dérivé des preuves actuelles."));
  list.forEach(a => root.append(card("#" + a.rank + " · " + (a.priority || ""), a.priority === "P0" ? "FAIL" : "UNKNOWN", a.action)));
}
function renderObservation(o) {
  const root = clear("observation");
  const parts = o.parts || {};
  Object.entries(parts).forEach(([k,v]) => root.append(card(k, v.state, v.detail || "")));
  if (!Object.keys(parts).length) root.append(card("Observation", o.state || "UNKNOWN", o.detail || "Aucune preuve disponible"));
}
function renderSentinel(s) {
  const stateRoot = clear("sentinelState");
  const st = s.state || {};
  stateRoot.append(card("État", st.enabled ? (st.available ? "LIVE" : "UNKNOWN") : "UNKNOWN", st.enabled ? "Sentinel active" : "Sentinel en veille"));
  stateRoot.append(card("File", st.queued ? "UNKNOWN" : "PASS", `${st.queued || 0} en attente · ${st.runsLastHour || 0} analyse(s) cette heure`));
  if (st.repairing) stateRoot.append(card("Réparation", "UNKNOWN", st.repairing.title || st.repairing.id));
  if (st.repair) stateRoot.append(card("Self-heal", st.repair.possible ? "LIVE" : "UNKNOWN", st.repair.possible ? `${st.repair.runsLastHour || 0}/${st.repair.maxPerHour || "?"} cette heure` : (st.repair.raison || "non disponible")));

  const root = clear("sentinelList");
  const ds = s.diagnoses || [];
  if (!ds.length) root.append(card("Aucun diagnostic récent", "PASS", ""));
  ds.slice(0,20).forEach(d => {
    const rep = d.repair?.ok ? ` · correctif vérifié ${d.repair.branch || ""}` : d.repair?.raison ? ` · réparation: ${d.repair.raison}` : "";
    const auto = d.repair?.autopilot?.status ? ` · autopilot: ${d.repair.autopilot.status}` : "";
    root.append(card(d.title || d.id, d.error ? "FAIL" : (d.verdict === "defect" ? "UNKNOWN" : "PASS"), `${d.verdict || "sans verdict"}${rep}${auto}`));
  });
}
function renderIncidents(items) {
  const root = clear("incidentList");
  const open = (items || []).filter(x => x.status !== "closed");
  if (!open.length) root.append(card("Aucun incident ouvert", "PASS", ""));
  open.slice(0,30).forEach(i => root.append(card(i.signal?.title || i.id, i.phase || i.severity || "UNKNOWN", (i.signal?.message || "") + (i.occurrences > 1 ? " · " + i.occurrences + " occurrences" : ""))));
}
function renderChanges(d) {
  const root = clear("changeList");
  if (!d.comparable) { root.append(card("Référence insuffisante", "UNKNOWN", d.reason || "Pas encore de comparaison fiable.")); return; }
  if (!(d.changes || []).length) root.append(card("Aucun changement matériel", "PASS", ""));
  (d.changes || []).slice(0,30).forEach(c => root.append(card(c.type || "change", "UNKNOWN", `${esc(c.key)} ${c.before !== undefined ? esc(c.before) + " → " : ""}${c.now !== undefined ? esc(c.now) : ""}`)));
}
function renderTests(t) {
  const root = clear("testList");
  (t.suites || []).forEach(s => {
    const el = card(s.label || s.id, "UNKNOWN", s.cmd || "");
    const b = document.createElement("button"); b.className = "m-test-btn"; b.textContent = "Lancer";
    b.onclick = async () => { if (!confirm("Lancer la suite autorisée « " + s.label + " » ?")) return; b.disabled = true; try { await api("/tests/run", { method:"POST", body:{ id:s.id } }); b.textContent="Lancée"; } catch(e){ showError(e); b.disabled=false; } };
    el.append(b); root.append(el);
  });
}
function showError(e){ $("error").hidden=false; $("error").textContent=e.message || String(e); }

async function refresh(){
  $("refresh").disabled=true; $("error").hidden=true;
  const requests = [
    ["guardian", "/release-guardian"], ["command", "/control/command"], ["observation", "/observation"],
    ["incidents", "/incidents?limit=50"], ["changes", "/control/changes"], ["tests", "/tests"], ["sentinel", "/sentinel?limit=20"]
  ];
  const results = await Promise.allSettled(requests.map(([,path]) => api(path)));
  const map = Object.fromEntries(results.map((r, i) => [requests[i][0], r]));

  if (map.guardian.status === "fulfilled") renderGuardian(map.guardian.value);
  else {
    $("decision").textContent = "UNKNOWN"; $("decision").className = "m-pill unknown";
    $("headline").textContent = "Guardian indisponible"; $("generated").textContent = "—";
    unavailable("gates", "Release Guardian", map.guardian.reason);
  }
  map.command.status === "fulfilled" ? renderActions(map.command.value) : unavailable("actions", "Actions", map.command.reason);
  map.observation.status === "fulfilled" ? renderObservation(map.observation.value) : unavailable("observation", "Observation", map.observation.reason);
  map.incidents.status === "fulfilled" ? renderIncidents(map.incidents.value) : unavailable("incidentList", "Incidents", map.incidents.reason);
  map.changes.status === "fulfilled" ? renderChanges(map.changes.value) : unavailable("changeList", "Changements", map.changes.reason);
  map.tests.status === "fulfilled" ? renderTests(map.tests.value) : unavailable("testList", "Tests", map.tests.reason);
  map.sentinel.status === "fulfilled" ? renderSentinel(map.sentinel.value) : (unavailable("sentinelState", "Sentinel", map.sentinel.reason), unavailable("sentinelList", "Diagnostics", map.sentinel.reason));

  const hardFailures = Object.values(map).filter(r => r.status === "rejected" && !(r.reason && (r.reason.status === 401 || r.reason.status === 403)));
  if (hardFailures.length) showError(new Error(`${hardFailures.length} domaine(s) indisponible(s) — les autres preuves restent affichées.`));
  $("refresh").disabled=false;
}

document.querySelectorAll(".m-tabs button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".m-tabs button").forEach(x => x.classList.toggle("active", x===b));
  document.querySelectorAll(".m-pane").forEach(x => x.classList.toggle("active", x.id===b.dataset.tab));
}));
$("refresh").onclick=refresh;
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/mobile-sw.js").catch(() => {});
refresh();
setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 30000);
