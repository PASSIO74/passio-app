// ═══════════════════════════════════════════════════════════════════════════
// PREUVE DE PROMOTION LOCALE — la couche qui décide si une réparation de la
// sentinelle PEUT être promue, et qui doit dire NON par défaut.
//
// Elle ne déploie rien, elle ne pousse rien : elle rend `GO_LOCAL` ou `HOLD`.
// Tout son intérêt est d'être FAIL-CLOSED — un doute, une donnée manquante, une
// horloge bizarre, et c'est HOLD. Sa jumelle `sentinel-local-promotion-gate.js`
// est testée depuis longtemps ; cette couche-ci, qui ajoute la FRAÎCHEUR du
// Guardian et la LIAISON CAUSALE scellée, ne l'était pas.
//
// Les deux propriétés qu'elle ajoute, et pourquoi elles comptent :
//   • fraîcheur — un Guardian de la semaine dernière décrirait un autre dépôt.
//     Un horodatage absent, illisible ou dans le FUTUR est un refus, pas un
//     « on verra » : une horloge en avance rendrait tout instantané éternellement
//     frais.
//   • identité causale — le diagnostic scellé et la réparation doivent parler du
//     MÊME incident. Sans ça, on promeut un correctif au motif d'un incident
//     qu'il ne corrige pas.
// ═══════════════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateLocalPromotionEvidence } from "../server/sentinel-local-promotion-evidence.js";

const MAINTENANT = Date.parse("2026-08-30T12:00:00Z");

const GARDIEN_VERT = {
  generatedAt: new Date(MAINTENANT - 60_000).toISOString(),
  gates: ["authorization", "observation", "critical_journeys", "anomalies"]
    .map((key) => ({ key, state: "LIVE", pass: true })),
};
const INCIDENT = { id: "inc_1", status: "open", severity: "critical" };
const DIAGNOSTIC = { id: "sd_1", incidentId: "inc_1", incidentClusterKey: "grappe_1" };
const REPARATION = { diagnosisId: "sd_1", incidentId: "inc_1", incidentClusterKey: "grappe_1" };

const evaluer = (patch = {}) => evaluateLocalPromotionEvidence({
  guardian: GARDIEN_VERT, incidents: [INCIDENT], incidentsComplete: true,
  diagnosisEvidence: DIAGNOSTIC, repair: REPARATION, now: MAINTENANT, ...patch,
});

test("le cas nominal rend GO_LOCAL — sans lui, tout ce fichier passerait à vide", () => {
  const r = evaluer();
  assert.deepEqual(r.blockers, [], "aucun blocage attendu sur le cas complet");
  assert.equal(r.decision, "GO_LOCAL");
  assert.equal(r.causalIncidentId, "inc_1");
  assert.equal(r.policy.productionDeploy, false, "une promotion locale n'autorise JAMAIS la production");
});

test("appelée à vide, elle refuse — le défaut est NON", () => {
  const r = evaluateLocalPromotionEvidence();
  assert.equal(r.decision, "HOLD");
  assert.ok(r.blockers.length >= 4, "un appel sans rien doit accumuler les refus");
  assert.ok(r.blockers.includes("guardian_timestamp_missing"));
  assert.ok(r.blockers.includes("diagnosis_identity_missing"));
  assert.ok(r.blockers.includes("incident_set_incomplete"));
});

test("fraîcheur du Guardian : absent, périmé ou dans le FUTUR", () => {
  const sansDate = evaluer({ guardian: { ...GARDIEN_VERT, generatedAt: null } });
  assert.ok(sansDate.blockers.includes("guardian_timestamp_missing"));

  const perime = evaluer({ guardian: { ...GARDIEN_VERT, generatedAt: new Date(MAINTENANT - 3600_000).toISOString() } });
  assert.ok(perime.blockers.includes("guardian_snapshot_stale"), "un instantané d'une heure décrit un autre dépôt");

  const futur = evaluer({ guardian: { ...GARDIEN_VERT, generatedAt: new Date(MAINTENANT + 60_000).toISOString() } });
  assert.ok(futur.blockers.includes("guardian_timestamp_future"),
    "une horloge en avance rendrait tout instantané éternellement frais");

  const illisible = evaluer({ guardian: { ...GARDIEN_VERT, generatedAt: "hier vers midi" } });
  assert.ok(illisible.blockers.includes("guardian_timestamp_missing"), "une date illisible n'est pas une date");

  for (const r of [sansDate, perime, futur, illisible]) assert.equal(r.decision, "HOLD");
});

test("identité causale : le diagnostic et la réparation doivent parler du même incident", () => {
  const autreDiag = evaluer({ repair: { ...REPARATION, diagnosisId: "sd_autre" } });
  assert.ok(autreDiag.blockers.includes("repair_diagnosis_mismatch"));

  const autreIncident = evaluer({ repair: { ...REPARATION, incidentId: "inc_autre" } });
  assert.ok(autreIncident.blockers.includes("repair_causal_incident_mismatch"));

  const autreGrappe = evaluer({ repair: { ...REPARATION, incidentClusterKey: "grappe_autre" } });
  assert.ok(autreGrappe.blockers.includes("repair_incident_cluster_mismatch"));

  const sansScelle = evaluer({ diagnosisEvidence: null });
  assert.ok(sansScelle.blockers.includes("diagnosis_identity_missing"));
  assert.ok(sansScelle.blockers.includes("diagnosis_causal_incident_missing"));

  for (const r of [autreDiag, autreIncident, autreGrappe, sansScelle]) assert.equal(r.decision, "HOLD");
});

test("une liste d'incidents PARTIELLE ne prouve jamais l'absence d'un autre", () => {
  // Le point le plus subtil de la couche : on ne peut pas conclure « aucun autre
  // incident critique » à partir d'une lecture incomplète. Le défaut reste HOLD.
  const r = evaluer({ incidentsComplete: false });
  assert.ok(r.blockers.includes("incident_set_incomplete"));
  assert.equal(r.decision, "HOLD");
});

test("l'incident causal doit être ouvert, et seul de sa gravité", () => {
  const ferme = evaluer({ incidents: [{ ...INCIDENT, status: "closed" }] });
  assert.ok(ferme.blockers.includes("causal_incident_not_open_critical"),
    "promouvoir pour un incident déjà clos, c'est promouvoir sans motif");

  const autreOuvert = evaluer({ incidents: [INCIDENT, { id: "inc_2", status: "open", severity: "high" }] });
  assert.equal(autreOuvert.decision, "HOLD",
    "un second incident critique ouvert interdit la promotion : on ne sait pas lequel on répare");
});

test("un portail du Guardian qui manque ou qui échoue bloque, en le nommant", () => {
  const sansPortail = evaluer({
    guardian: { ...GARDIEN_VERT, gates: GARDIEN_VERT.gates.filter((g) => g.key !== "authorization") },
  });
  assert.ok(sansPortail.blockers.includes("missing_gate:authorization"));

  const enEchec = evaluer({
    guardian: { ...GARDIEN_VERT,
      gates: GARDIEN_VERT.gates.map((g) => g.key === "observation" ? { ...g, pass: false, state: "UNAVAILABLE" } : g) },
  });
  assert.ok(enEchec.blockers.some((b) => b.startsWith("gate:observation:")),
    "le blocage doit nommer le portail ET son état, sinon il n'est pas actionnable");
});

test("les blocages sont dédupliqués : une liste lisible, pas un tas", () => {
  const r = evaluateLocalPromotionEvidence({ now: MAINTENANT });
  assert.equal(new Set(r.blockers).size, r.blockers.length);
});
