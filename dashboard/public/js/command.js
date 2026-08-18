const $ = (id) => document.getElementById(id);

function stateClass(state) {
  return "cc-state cc-state-" + String(state || "unknown").toLowerCase();
}
function fmt(v, suffix = "") { return v === null || v === undefined ? "—" : String(v) + suffix; }
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function text(tag, value, cls) { const n = document.createElement(tag); if (cls) n.className = cls; n.textContent = value; return n; }
function badge(state) { const n = text("span", state || "UNKNOWN", stateClass(state)); return n; }
function priority(p) { return text("span", p || "P?", "cc-priority cc-priority-" + String(p || "p3").toLowerCase()); }

async function api(path) {
  const res = await fetch(path, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
  if (res.status === 401 || res.status === 403) throw new Error("Session du centre de pilotage requise. Reviens au Centre complet pour te connecter.");
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

function renderDomains(domains) {
  const root = $("domains"); clear(root);
  const order = ["product", "technical", "security", "observation", "release"];
  for (const key of order) {
    const d = domains && domains[key];
    if (!d) continue;
    const card = document.createElement("article"); card.className = "cc-domain";
    const head = document.createElement("div"); head.className = "cc-domain-head";
    head.append(text("h3", d.label || key)); head.append(badge(d.state));
    card.append(head, text("p", d.detail || "Aucun détail disponible."));
    root.append(card);
  }
}

function renderKpis(command) {
  const product = $("productKpis"); clear(product);
  const p = command.product;
  const values = p ? [
    ["DAU", p.dau], ["WAU", p.wau], ["MAU", p.mau], ["Habitude", p.stickiness, "%"], ["Retour 7j", p.returnRate7, "%"],
  ] : [];
  if (!values.length) product.append(text("div", "KPI produit non disponibles ou non configurés.", "cc-empty"));
  for (const [label, value, suffix] of values) {
    const box = document.createElement("div"); box.className = "cc-kpi";
    box.append(text("span", label), text("strong", fmt(value, suffix || ""))); product.append(box);
  }
  $("productConfidence").textContent = p ? `confiance ${p.confidence || "—"}${p.partial ? " · partielle" : ""}` : "NON CONFIGURÉ";

  const counts = $("counts"); clear(counts);
  const c = command.counts || {};
  for (const [label, value] of [["Alertes ouvertes", c.openAlerts], ["Incidents ouverts", c.openIncidents], ["Risques P0/P1", c.p0p1]]) {
    const box = document.createElement("div"); box.className = "cc-kpi";
    box.append(text("span", label), text("strong", fmt(value))); counts.append(box);
  }
}

function renderRisks(risks) {
  const root = $("risks"); clear(root);
  if (!risks || !risks.length) { root.append(text("div", "Aucun risque prioritaire détecté dans les preuves disponibles.", "cc-empty")); return; }
  for (const r of risks.slice(0, 8)) {
    const row = document.createElement("article"); row.className = "cc-risk";
    const top = document.createElement("div"); top.className = "cc-risk-top";
    top.append(priority(r.priority), text("strong", r.title || r.key));
    row.append(top, text("p", r.detail || ""));
    if (r.confidence) row.append(text("p", `Confiance : ${r.confidence}`));
    root.append(row);
  }
}

function renderActions(actions) {
  const root = $("actions"); clear(root);
  if (!actions || !actions.length) { root.append(text("div", "Aucune action urgente dérivée des signaux actuels.", "cc-empty")); return; }
  for (const a of actions) {
    const row = document.createElement("article"); row.className = "cc-action";
    const top = document.createElement("div"); top.className = "cc-action-top";
    top.append(priority(a.priority), text("strong", `#${a.rank} maintenant`));
    row.append(top, text("p", a.action || "")); root.append(row);
  }
}

function describeChange(c) {
  if (c.type === "domain_state") return `${c.key} : ${c.before} → ${c.now}`;
  if (c.type === "product_metric") return `${c.key} : ${c.before} → ${c.now} (${c.delta > 0 ? "+" : ""}${c.delta})`;
  if (c.type === "risk_opened") return `${c.priority} ouvert : ${c.title}`;
  if (c.type === "risk_cleared") return `${c.priority} résolu : ${c.title}`;
  return c.key || c.type || "Changement";
}

function renderChanges(data) {
  const root = $("changes"); clear(root);
  if (!data.comparable) {
    $("changesPeriod").textContent = data.reason || "Aucune référence comparable.";
    root.append(text("div", "Le cockpit enregistrera une référence dès qu'un état réellement différent sera observé.", "cc-empty"));
    return;
  }
  $("changesPeriod").textContent = `${new Date(data.from).toLocaleString("fr-FR")} → ${new Date(data.to).toLocaleString("fr-FR")}`;
  if (!data.changes || !data.changes.length) { root.append(text("div", "Aucun changement matériel entre les deux états comparés.", "cc-empty")); return; }
  for (const c of data.changes) {
    const card = document.createElement("article"); card.className = "cc-change";
    card.append(text("div", String(c.type || "change").replaceAll("_", " "), "cc-change-type"), text("p", describeChange(c)));
    root.append(card);
  }
}

function renderCommand(command) {
  const g = command.global || {};
  $("globalState").className = stateClass(g.state); $("globalState").textContent = g.state || "UNKNOWN";
  $("globalTitle").textContent = g.state === "LIVE" ? "Plateforme observée et domaines critiques sains" : g.state === "UNAVAILABLE" ? "Un domaine critique impose un NO-GO" : "Santé partielle : preuves ou domaines à traiter";
  $("globalRule").textContent = g.rule || "Le pire domaine critique prévaut.";
  $("confidence").textContent = fmt(g.confidence, "%");
  $("generatedAt").textContent = command.generatedAt ? `preuve ${new Date(command.generatedAt).toLocaleTimeString("fr-FR")}` : "—";
  renderDomains(command.domains); renderKpis(command); renderRisks(command.risks); renderActions(command.actions);
}

function showError(err) { const box = $("errorBox"); box.hidden = false; box.textContent = String(err && err.message || err); }
function clearError() { $("errorBox").hidden = true; $("errorBox").textContent = ""; }

async function refresh() {
  const btn = $("refreshBtn"); btn.disabled = true; clearError();
  try {
    const [command, changes] = await Promise.all([api("/api/control/command"), api("/api/control/changes")]);
    renderCommand(command); renderChanges(changes);
  } catch (e) { showError(e); }
  finally { btn.disabled = false; }
}

$("refreshBtn").addEventListener("click", refresh);
$("changesBtn").addEventListener("click", async () => { try { renderChanges(await api("/api/control/changes")); } catch (e) { showError(e); } });
refresh();
setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 30_000);
