const $ = (id) => document.getElementById(id);

function stateClass(state) { return "cc-state cc-state-" + String(state || "unknown").toLowerCase(); }
function fmt(v, suffix = "") { return v === null || v === undefined ? "—" : String(v) + suffix; }
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function text(tag, value, cls) { const n = document.createElement(tag); if (cls) n.className = cls; n.textContent = value; return n; }
function badge(state) { return text("span", state || "UNKNOWN", stateClass(state)); }
function priority(p) { return text("span", p || "P?", "cc-priority cc-priority-" + String(p || "p3").toLowerCase()); }

async function api(path) {
  const res = await fetch(path, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
  if (res.status === 401 || res.status === 403) throw new Error("Session du centre de pilotage requise. Reviens au Centre complet pour te connecter.");
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

function renderGuardian(g) {
  const decision = $("guardianDecision");
  decision.textContent = g?.decision || "UNKNOWN";
  decision.className = "cc-guardian-decision cc-guardian-" + String(g?.decision || "unknown").toLowerCase();
  $("guardianRule").textContent = g?.rule || "Tous les gates critiques doivent être prouvés.";
  const root = $("guardianGates"); clear(root);
  for (const gate of g?.gates || []) {
    const card = document.createElement("article");
    card.className = "cc-gate cc-gate-" + String(gate.state || "UNKNOWN").toLowerCase();
    card.title = gate.detail || "";
    card.append(text("strong", gate.key.replaceAll("_", " ")), text("span", gate.state || "UNKNOWN"));
    root.append(card);
  }
  if (!g?.gates?.length) root.append(text("div", "Guardian non disponible.", "cc-empty"));
}

function renderDomains(domains) {
  const root = $("domains"); clear(root);
  const order = ["product", "technical", "security", "observation", "release"];
  for (const key of order) {
    const d = domains && domains[key]; if (!d) continue;
    const card = document.createElement("article"); card.className = "cc-domain";
    const head = document.createElement("div"); head.className = "cc-domain-head";
    head.append(text("h3", d.label || key), badge(d.state));
    card.append(head, text("p", d.detail || "Aucun détail disponible.")); root.append(card);
  }
}

function renderKpis(command) {
  const product = $("productKpis"); clear(product); const p = command.product;
  const values = p ? [["DAU",p.dau],["WAU",p.wau],["MAU",p.mau],["Habitude",p.stickiness,"%"],["Retour 7j",p.returnRate7,"%"]] : [];
  if (!values.length) product.append(text("div", "KPI produit non disponibles ou non configurés.", "cc-empty"));
  for (const [label, value, suffix] of values) { const box=document.createElement("div"); box.className="cc-kpi"; box.append(text("span",label),text("strong",fmt(value,suffix||""))); product.append(box); }
  $("productConfidence").textContent = p ? `confiance ${p.confidence || "—"}${p.partial ? " · partielle" : ""}` : "NON CONFIGURÉ";
  const counts=$("counts"); clear(counts); const c=command.counts||{};
  for(const [label,value] of [["Alertes ouvertes",c.openAlerts],["Incidents ouverts",c.openIncidents],["Risques P0/P1",c.p0p1]]){const box=document.createElement("div");box.className="cc-kpi";box.append(text("span",label),text("strong",fmt(value)));counts.append(box);}
}

function renderRisks(risks) {
  const root=$("risks"); clear(root);
  if(!risks||!risks.length){root.append(text("div","Aucun risque prioritaire détecté dans les preuves disponibles.","cc-empty"));return;}
  for(const r of risks.slice(0,8)){const row=document.createElement("article");row.className="cc-risk";const top=document.createElement("div");top.className="cc-risk-top";top.append(priority(r.priority),text("strong",r.title||r.key));row.append(top,text("p",r.detail||""));if(r.confidence)row.append(text("p",`Confiance : ${r.confidence}`));root.append(row);}
}

function renderActions(actions){const root=$("actions");clear(root);if(!actions||!actions.length){root.append(text("div","Aucune action urgente dérivée des signaux actuels.","cc-empty"));return;}for(const a of actions){const row=document.createElement("article");row.className="cc-action";const top=document.createElement("div");top.className="cc-action-top";top.append(priority(a.priority),text("strong",`#${a.rank} maintenant`));row.append(top,text("p",a.action||""));root.append(row);}}
function describeChange(c){if(c.type==="domain_state")return `${c.key} : ${c.before} → ${c.now}`;if(c.type==="product_metric")return `${c.key} : ${c.before} → ${c.now} (${c.delta>0?"+":""}${c.delta})`;if(c.type==="risk_opened")return `${c.priority} ouvert : ${c.title}`;if(c.type==="risk_cleared")return `${c.priority} résolu : ${c.title}`;return c.key||c.type||"Changement";}
function renderChanges(data){const root=$("changes");clear(root);if(!data.comparable){$("changesPeriod").textContent=data.reason||"Aucune référence comparable.";root.append(text("div","Le cockpit enregistrera une référence dès qu'un état réellement différent sera observé.","cc-empty"));return;}$("changesPeriod").textContent=`${new Date(data.from).toLocaleString("fr-FR")} → ${new Date(data.to).toLocaleString("fr-FR")}`;if(!data.changes||!data.changes.length){root.append(text("div","Aucun changement matériel entre les deux états comparés.","cc-empty"));return;}for(const c of data.changes){const card=document.createElement("article");card.className="cc-change";card.append(text("div",String(c.type||"change").replaceAll("_"," "),"cc-change-type"),text("p",describeChange(c)));root.append(card);}}

function renderCommand(command){const g=command.global||{};$("globalState").className=stateClass(g.state);$("globalState").textContent=g.state||"UNKNOWN";$("globalTitle").textContent=g.state==="LIVE"?"Plateforme observée et domaines critiques sains":g.state==="UNAVAILABLE"?"Un domaine critique impose un NO-GO":"Santé partielle : preuves ou domaines à traiter";$("globalRule").textContent=g.rule||"Le pire domaine critique prévaut.";$("confidence").textContent=fmt(g.confidence,"%");$("generatedAt").textContent=command.generatedAt?`preuve ${new Date(command.generatedAt).toLocaleTimeString("fr-FR")}`:"—";renderDomains(command.domains);renderKpis(command);renderRisks(command.risks);renderActions(command.actions);}
function renderAttente(a){const root=$("attente");clear(root);const items=(a&&a.items)||[];$("attenteCount").textContent=a?(items.length?`${items.length} élément(s)`:"Rien ne t'attend"):"non lu";if(!items.length){root.append(text("div",a?"Aucun geste en attente : les machines tournent seules.":"La route /api/attente n'a pas répondu.","cc-empty"));}for(const it of items.slice(0,8)){const row=document.createElement("article");row.className="cc-action";const top=document.createElement("div");top.className="cc-action-top";top.append(priority(it.priorite),text("strong",it.titre||it.key));row.append(top,text("p",(it.detail||"")+(it.depuis?" · depuis "+new Date(it.depuis).toLocaleString("fr-FR"):"")));if(it.cible&&/^https?:\/\//.test(String(it.cible))){const l=document.createElement("a");l.href=String(it.cible);l.target="_blank";l.rel="noopener";l.className="cc-link-btn";l.textContent="Ouvrir";row.append(l);}root.append(row);}const m=$("machines");clear(m);const x=(a&&a.machines7j)||{};for(const [label,value] of [["Diagnostics",x.diagnostics],["Correctifs vérifiés",x.correctifsVerifies],["Fusionnés",x.correctifsFusionnes],["PR publiées",x.publications],["Enquêtes GitHub closes",x.enquetesGithubFermees],["Chaîne GitHub",x.chaine]]){const box=document.createElement("div");box.className="cc-kpi";box.append(text("span",label),text("strong",fmt(value)));m.append(box);}}
function showError(err){const box=$("errorBox");box.hidden=false;box.textContent=String(err&&err.message||err);}function clearError(){$("errorBox").hidden=true;$("errorBox").textContent="";}

// Promise.allSettled (2026-09-18) : un 500 sur /control/changes effaçait aussi
// Guardian et domaines. Chaque bloc se rend seul ; l'erreur nomme ce qui manque.
async function refresh(){const btn=$("refreshBtn");btn.disabled=true;clearError();const demandes=[["command",api("/api/control/command")],["changes",api("/api/control/changes")],["guardian",api("/api/release-guardian")],["attente",api("/api/attente")]];const r=await Promise.allSettled(demandes.map(([,p])=>p));const res=Object.fromEntries(r.map((x,i)=>[demandes[i][0],x]));try{if(res.command.status==="fulfilled")renderCommand(res.command.value);if(res.changes.status==="fulfilled")renderChanges(res.changes.value);if(res.guardian.status==="fulfilled")renderGuardian(res.guardian.value);renderAttente(res.attente.status==="fulfilled"?res.attente.value:null);}catch(e){showError(e);}const rates=demandes.filter(([k])=>res[k].status==="rejected");if(rates.length)showError(new Error(rates.length+" domaine(s) indisponible(s) : "+rates.map(([k])=>k+" ("+(res[k].reason&&res[k].reason.message||"?")+")").join(", ")+" — les autres preuves restent affichées."));btn.disabled=false;}
$("refreshBtn").addEventListener("click",refresh);$("changesBtn").addEventListener("click",async()=>{try{renderChanges(await api("/api/control/changes"));}catch(e){showError(e);}});refresh();setInterval(()=>{if(document.visibilityState==="visible")refresh();},30_000);
