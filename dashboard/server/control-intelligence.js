// ═══════════════════════════════════════════════════════════════════════════
// CONTROL INTELLIGENCE — transforme les preuves existantes en poste de commande.
// Aucune IA ici : DATA → SIGNAL → PRIORITY → ACTION est déterministe, explicable
// et continue de fonctionner sans crédits Claude.
// ═══════════════════════════════════════════════════════════════════════════
import { store } from "./store.js";
import * as checklist from "./checklist.js";
import * as tests from "./tests.js";
import { computeReadiness } from "./readiness.js";
import { observationSnapshot } from "./observation.js";
import { releaseSnapshot } from "./release-recorder.js";
import { listAlerts } from "./alerts.js";
import { listIncidentPackets } from "./incident-packets.js";
import { kpi } from "./kpi.js";

const SEV = { critical: 4, high: 3, warn: 2, info: 1 };
const STATE_RANK = { LIVE: 0, DEGRADED: 1, NOT_CONFIGURED: 2, UNAVAILABLE: 3 };

function domain(state, label, detail, evidence = null) {
  return { state, label, detail, evidence };
}

function securityDomain(authz) {
  if (!authz || !authz.total) return domain("NOT_CONFIGURED", "Sécurité & autorisation", "AUTHZ-CRITICAL n'a pas encore fourni de preuve dans cette session.");
  if (authz.pass !== authz.total) return domain("UNAVAILABLE", "Sécurité & autorisation", `${authz.pass}/${authz.total} canaris passent — propriété binaire en échec.`, authz);
  return domain("LIVE", "Sécurité & autorisation", `${authz.pass}/${authz.total} canaris passent · ${authz.verifieLe || "date inconnue"}.`, authz);
}

function releaseDomain(r) {
  const s = r || {};
  if (!s.current) return domain("NOT_CONFIGURED", "Release", "Aucun snapshot de release disponible.");
  const missing = [];
  if (!s.current.revision) missing.push("commit");
  if (!s.current.appVersion) missing.push("frontend");
  if (!s.current.dbVersion) missing.push("DB");
  if (missing.length) return domain("DEGRADED", "Release", `Chaîne partielle : preuve manquante ${missing.join(", ")}.`, s.current);
  return domain("LIVE", "Release", `Commit ${s.current.revision} · frontend ${s.current.appVersion} · DB ${s.current.dbVersion}.`, s.current);
}

function technicalDomain(readiness) {
  const map = { vert: "LIVE", ambre: "DEGRADED", inconnu: "NOT_CONFIGURED", rouge: "UNAVAILABLE" };
  return domain(map[readiness.statut] || "DEGRADED", "Santé technique", readiness.cause?.detail || readiness.note, {
    statut: readiness.statut,
    confiance: readiness.confiance,
    cause: readiness.cause,
  });
}

function productDomain(product) {
  if (!product || product.configured === false) return domain("NOT_CONFIGURED", "Santé produit", "KPI produit non configurés.");
  if (product.error) return domain("UNAVAILABLE", "Santé produit", `KPI indisponibles : ${product.error}`);
  if (product.partial) return domain("DEGRADED", "Santé produit", "KPI réels mais fenêtre tronquée : ne pas sur-interpréter les tendances.", product);
  return domain("LIVE", "Santé produit", "KPI produit mesurés sur la télémétrie identifiée. Une variation produit n'est pas une panne technique.", product);
}

function priorityOf(level, state) {
  if (level === "critical" || state === "UNAVAILABLE") return "P0";
  if (level === "high" || state === "NOT_CONFIGURED") return "P1";
  if (level === "warn" || state === "DEGRADED") return "P2";
  return "P3";
}

function buildRisks(domains, alerts, incidents) {
  const risks = [];
  for (const [key, d] of Object.entries(domains)) {
    if (d.state === "LIVE") continue;
    risks.push({
      key: `domain:${key}`,
      priority: priorityOf(null, d.state),
      source: key,
      title: d.label,
      detail: d.detail,
      confidence: d.state === "NOT_CONFIGURED" ? "low" : "high",
    });
  }
  for (const a of alerts.filter((x) => !x.acknowledged).slice(0, 25)) {
    if ((SEV[a.level] || 0) < 2) continue;
    risks.push({
      key: `alert:${a.key || a.id}`,
      priority: priorityOf(a.level),
      source: "alert",
      title: a.title,
      detail: a.message || "Aucun détail",
      confidence: a.incident?.confidence || "medium",
      incidentId: a.incidentId || null,
      ts: a.ts,
    });
  }
  // Un incident critique ouvert doit rester visible même si son alerte a été acquittée.
  for (const i of incidents.filter((x) => x.status !== "closed" && (x.severity === "critical" || x.severity === "high")).slice(0, 20)) {
    if (risks.some((r) => r.incidentId === i.id)) continue;
    risks.push({
      key: `incident:${i.id}`,
      priority: priorityOf(i.severity),
      source: "incident",
      title: i.signal?.title || "Incident ouvert",
      detail: i.signal?.message || "Incident sans résumé",
      confidence: i.confidence || "low",
      incidentId: i.id,
      ts: Date.parse(i.createdAt) || 0,
    });
  }
  const p = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return risks.sort((a, b) => (p[a.priority] - p[b.priority]) || ((b.ts || 0) - (a.ts || 0))).slice(0, 12);
}

function actionFor(risk) {
  if (risk.source === "security") return "Bloquer toute release et relancer AUTHZ-CRITICAL.";
  if (risk.source === "observation") return "Rétablir la chaîne d'observation avant d'interpréter l'absence d'erreurs.";
  if (risk.source === "release") return "Compléter les preuves commit → frontend → DB avant le prochain GO.";
  if (risk.source === "technical") return "Traiter la cause du pire domaine critique avant toute optimisation secondaire.";
  if (risk.source === "product") return "Réparer d'abord la qualité de mesure ; ne pas prendre de décision produit sur une donnée dégradée.";
  if (risk.incidentId) return `Ouvrir ${risk.incidentId}, reproduire, exécuter les tests proposés puis clôturer avec preuve.`;
  return "Qualifier le signal, obtenir une reproduction et rattacher une preuve avant action.";
}

export async function controlCommand() {
  const authz = tests.authzSnapshot();
  const observation = observationSnapshot();
  const release = releaseSnapshot();
  const readiness = computeReadiness({
    overview: store.overview(),
    checklist: checklist.listChecklist(),
    bugs: store.bugList(),
    authz,
    observation,
    release,
  });
  const product = await kpi();
  const domains = {
    product: productDomain(product),
    technical: technicalDomain(readiness),
    security: securityDomain(authz),
    observation: domain(observation.state, "Observation", Object.entries(observation.parts || {}).map(([k, v]) => `${k}:${v.state}`).join(" · ") || "Aucun seam", observation.parts),
    release: releaseDomain(release),
  };
  const alerts = listAlerts();
  const incidents = listIncidentPackets(100);
  const risks = buildRisks(domains, alerts, incidents);
  const actions = risks.slice(0, 3).map((r, idx) => ({ rank: idx + 1, priority: r.priority, riskKey: r.key, action: actionFor(r) }));
  const worst = Object.values(domains).reduce((a, b) => STATE_RANK[b.state] > STATE_RANK[a.state] ? b : a, domain("LIVE", "Global", ""));

  return {
    generatedAt: new Date().toISOString(),
    global: { state: worst.state, confidence: readiness.confiance, rule: "pire domaine critique + confiance de mesure" },
    domains,
    product: product && product.configured !== false ? {
      dau: product.dau ?? null, wau: product.wau ?? null, mau: product.mau ?? null,
      stickiness: product.stickiness ?? null, returnRate7: product.returnRate7 ?? null,
      confidence: product.confidence || null, partial: Boolean(product.partial),
    } : null,
    risks,
    actions,
    counts: {
      openAlerts: alerts.filter((a) => !a.acknowledged).length,
      openIncidents: incidents.filter((i) => i.status !== "closed").length,
      p0p1: risks.filter((r) => r.priority === "P0" || r.priority === "P1").length,
    },
  };
}
