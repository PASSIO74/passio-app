// PASSIO Control Center — panneau Orchestrateur IA V2.
// Module autonome : il s'insère dans la navigation existante sans toucher au
// routeur SPA principal. Les capacités réelles viennent uniquement de /api.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

async function req(method, path, body) {
  const res = await fetch("/api" + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || res.statusText || "Erreur");
  return data;
}

const aiIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/><path d="M10.5 12h3M12 10.5v3"/></svg>`;
const statusLabel = (s) => ({ done:"Terminé", running:"En cours", queued:"En attente", failed:"Échec", supervised:"Supervisé", configured:"Configuré", available:"Disponible", external:"Externe", historical:"Historique", unknown:"Non vérifié" }[s] || s || "—");
const statusClass = (s) => ["done","supervised","configured","available"].includes(s) ? "ok" : s === "failed" ? "bad" : s === "running" ? "run" : "muted";

let me = null;
let panel = null;
let refreshTimer = null;
let lastSnapshot = null;
let routeTimer = null;

function can(cap) { return Boolean(me?.caps?.includes(cap)); }

async function bootstrap() {
  try { me = await req("GET", "/me"); } catch { return; }
  if (!can("git_read")) return;
  installLaunchLink();
  const observer = new MutationObserver(() => installLaunchLink());
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
}

function installLaunchLink() {
  const nav = $("#nav");
  if (!nav || $("[data-orchestrator-launch]", nav)) return;
  const a = document.createElement("a");
  a.href = "#overview";
  a.dataset.orchestratorLaunch = "1";
  a.className = "orch-nav-link";
  a.innerHTML = `${aiIcon}<span>Orchestrateur IA</span><span class="orch-nav-dot" aria-hidden="true"></span>`;
  a.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openPanel(); });
  const advanced = $(".nav-group-toggle", nav);
  if (advanced) nav.insertBefore(a, advanced); else nav.appendChild(a);
}

function shell() {
  const wrap = document.createElement("div");
  wrap.className = "orch-overlay";
  wrap.innerHTML = `<div class="orch-scrim" data-orch-close></div>
    <section class="orch-panel" role="dialog" aria-modal="true" aria-labelledby="orchTitle">
      <header class="orch-head">
        <div><div class="orch-kicker">PASSIO AI ORCHESTRATOR V2</div><h2 id="orchTitle">Poste de commandement multi‑IA</h2><p>GitHub reste la source de vérité. Aucune IA n'écrit directement sur <code>main</code>.</p></div>
        <div class="orch-head-actions"><button class="btn btn-sm" id="orchRefresh">Actualiser</button><button class="icon-btn" data-orch-close aria-label="Fermer">×</button></div>
      </header>
      <div class="orch-body"><div class="orch-loading">Chargement de l'état réel…</div></div>
    </section>`;
  wrap.addEventListener("click", (e) => { if (e.target.closest("[data-orch-close]")) closePanel(); });
  $("#orchRefresh", wrap)?.addEventListener("click", refresh);
  return wrap;
}

async function openPanel() {
  if (panel) return;
  panel = shell();
  document.body.appendChild(panel);
  document.body.classList.add("orch-open");
  await refresh();
  refreshTimer = setInterval(refresh, 10000);
}
function closePanel() {
  clearInterval(refreshTimer); refreshTimer = null;
  panel?.remove(); panel = null; document.body.classList.remove("orch-open");
}

async function refresh() {
  if (!panel) return;
  try {
    lastSnapshot = await req("GET", "/orchestrator");
    render(lastSnapshot);
  } catch (e) {
    $(".orch-body", panel).innerHTML = `<div class="orch-error">${esc(e.message)}</div>`;
  }
}

function agentCard(key, title, role, a) {
  const extra = key === "lovable" && a?.editorUrl ? `<a class="btn btn-sm" target="_blank" rel="noopener" href="${esc(a.editorUrl)}">Ouvrir Design Lab</a>` : "";
  return `<article class="orch-agent">
    <div class="orch-agent-top"><strong>${esc(title)}</strong><span class="orch-status ${statusClass(a?.status)}">${esc(statusLabel(a?.status))}</span></div>
    <p class="orch-role">${esc(role)}</p><small>${esc(a?.truthfulLabel || "")}</small>${extra}
  </article>`;
}

function taskRows(tasks = []) {
  if (!tasks.length) return `<div class="orch-empty">Aucune tâche orchestrée détectée.</div>`;
  return `<div class="orch-table-wrap"><table class="orch-table"><thead><tr><th>Tâche</th><th>État</th><th>Branche résultat</th><th>Dernière MAJ</th></tr></thead><tbody>${tasks.slice(0,30).map(t => `<tr>
    <td><strong>${esc(t.id)}</strong>${t.error ? `<small class="orch-task-error">${esc(t.error)}</small>` : ""}</td>
    <td><span class="orch-status ${statusClass(t.status)}">${esc(statusLabel(t.status))}</span></td>
    <td><code>${esc(t.resultBranch || "—")}</code></td><td>${t.updatedAt ? esc(new Date(t.updatedAt).toLocaleString("fr-FR")) : "—"}</td>
  </tr>`).join("")}</tbody></table></div>`;
}

function render(s) {
  const a = s.agents || {};
  const declared = s.manifest?.agents || {};
  const body = $(".orch-body", panel);
  const mutate = can("git_mutate") && s.mutationsEnabled && !s.production;
  body.innerHTML = `
    <section class="orch-summary">
      <div class="orch-source"><span>Source de vérité</span><strong>${esc(s.sourceOfTruth?.repository || "PASSIO74/passio-app")}</strong><code>${esc(s.sourceOfTruth?.production_branch || "main")}</code></div>
      <div class="orch-counter"><b>${s.counts?.running || 0}</b><span>en cours</span></div><div class="orch-counter"><b>${s.counts?.queued || 0}</b><span>en attente</span></div><div class="orch-counter"><b>${s.counts?.done || 0}</b><span>terminées</span></div><div class="orch-counter bad"><b>${s.counts?.failed || 0}</b><span>échecs</span></div>
    </section>
    <section><div class="orch-section-head"><div><h3>Toutes les IA utilisées ou disponibles pour Passio</h3><p>Les moteurs actifs, les outils historiques et les outils connectés mais pas encore utilisés sont distingués.</p></div><span class="orch-worker ${s.local?.supervised ? "ok" : "warn"}">${s.local?.supervised ? "Superviseur local actif" : "Superviseur local non vérifié"}</span></div>
      <div class="orch-agents">
        ${agentCard("chatgpt","ChatGPT","Orchestrateur / arbitre",a.chatgpt)}
        ${agentCard("claude","Claude","Assistant IA Anthropic",{ status:"external", truthfulLabel: declared.claude?.usage || "Utilisé pour analyses et raisonnements ponctuels." })}
        ${agentCard("claude_code","Claude Code","Ingénieur production principal",a.claude_code)}
        ${agentCard("claude_design","Claude Design","Design UI historique",{ status:"historical", truthfulLabel: declared.claude_design?.usage || "Utilisé auparavant pour des explorations et refontes visuelles de PASSIO." })}
        ${agentCard("lovable","Lovable","Design Lab UI/UX",a.lovable)}
        ${agentCard("base44","Base44","AI App Builder connecté",{ status:"available", truthfulLabel: declared.base44?.usage || "Disponible pour Passio ; aucune app Passio Base44 détectée à ce jour." })}
        ${agentCard("codex","Codex","Reviewer indépendant",a.codex)}
      </div>
    </section>
    <section class="orch-command"><div class="orch-section-head"><div><h3>Nouvelle mission</h3><p>Le routeur choisit le meilleur chemin. L'exécution locale passe par Claude Code + Codex.</p></div></div>
      <form id="orchForm">
        <label><span>Titre</span><input id="orchTaskTitle" maxlength="160" placeholder="Ex. Améliorer l'onboarding Passio" required></label>
        <label><span>Instruction</span><textarea id="orchTaskInstruction" rows="5" maxlength="30000" placeholder="Décris le résultat attendu, pas l'implémentation technique." required></textarea></label>
        <div id="orchRoutePreview" class="orch-route-preview">Écris une mission pour voir le routage proposé.</div>
        <div class="orch-form-actions"><button type="button" class="btn" id="orchRouteBtn">Analyser le routage</button><button type="submit" class="btn btn-primary" ${mutate ? "" : "disabled"}>Envoyer au pipeline</button></div>
        ${mutate ? "" : `<p class="orch-guard">Soumission désactivée ici : rôle sans <code>git_mutate</code>, mutations dashboard inactives, ou environnement production.</p>`}
      </form>
    </section>
    <section><div class="orch-section-head"><div><h3>Pipeline réel</h3><p><b>Claude Code standard → Codex → Claude Code → Codex</b>. Lovable intervient pour les concepts UI via ChatGPT MCP. Base44 reste disponible pour des prototypes alternatifs, avec transposition revue avant toute intégration production.</p></div></div>
      <div class="orch-flow"><span>Toi</span><i>→</i><span>ChatGPT</span><i>→</i><span>Routeur</span><i>→</i><span>Spécialiste</span><i>→</i><span>GitHub</span><i>→</i><span>Tests / revue</span></div>
    </section>
    <section><div class="orch-section-head"><div><h3>Tâches</h3><p>Branches <code>ai/request/*</code> suivies jusqu'à <code>ai/result/*</code>.</p></div></div>${taskRows(s.tasks)}</section>
    <details class="orch-log"><summary>Journal du worker local</summary><pre>${esc((s.local?.workerLog || []).join("\n") || "Aucun journal disponible.")}</pre></details>`;

  const form = $("#orchForm", body);
  const title = $("#orchTaskTitle", body), instruction = $("#orchTaskInstruction", body);
  const preview = () => { clearTimeout(routeTimer); routeTimer = setTimeout(() => previewRoute(title.value, instruction.value), 280); };
  title.addEventListener("input", preview); instruction.addEventListener("input", preview);
  $("#orchRouteBtn", body).addEventListener("click", () => previewRoute(title.value, instruction.value));
  form.addEventListener("submit", submitTask);
}

async function previewRoute(title, instruction) {
  const out = $("#orchRoutePreview", panel); if (!out) return;
  if (!String(title + instruction).trim()) { out.textContent = "Écris une mission pour voir le routage proposé."; return; }
  out.textContent = "Analyse…";
  try {
    const r = await req("POST", "/orchestrator/route", { title, instruction });
    out.innerHTML = `<strong>${esc(r.pipeline)}</strong><span>${esc(r.explanation)}</span>${r.lovableRecommended ? `<em>Lovable recommandé pour l'exploration visuelle ; le serveur local ne le pilote pas directement.</em>` : ""}`;
  } catch (e) { out.textContent = e.message; }
}

async function submitTask(e) {
  e.preventDefault();
  const title = $("#orchTaskTitle", panel)?.value?.trim();
  const instruction = $("#orchTaskInstruction", panel)?.value?.trim();
  if (!title || !instruction) return;
  const btn = e.submitter; if (btn) { btn.disabled = true; btn.textContent = "Envoi…"; }
  try {
    const r = await req("POST", "/orchestrator/tasks", { title, instruction });
    const preview = $("#orchRoutePreview", panel);
    preview.innerHTML = `<strong>Tâche envoyée : ${esc(r.id)}</strong><span>${esc(r.route?.pipeline || "")}</span>`;
    $("#orchTaskTitle", panel).value = ""; $("#orchTaskInstruction", panel).value = "";
    await refresh();
  } catch (err) {
    const preview = $("#orchRoutePreview", panel); preview.innerHTML = `<span class="orch-task-error">${esc(err.message)}</span>`;
  } finally { if (btn) { btn.disabled = false; btn.textContent = "Envoyer au pipeline"; } }
}

window.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel) closePanel(); });
window.addEventListener("dash:unauth", closePanel);
bootstrap();
