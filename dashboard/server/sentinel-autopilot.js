// SENTINEL AUTOPILOT — politique de promotion locale et rollback, fail-closed.
// Ne déploie rien en production : il décide seulement si une réparation vérifiée
// PEUT être promue dans la branche locale de référence. Le déploiement reste un
// étage séparé tant que la politique n'a pas été relue par Claude/Codex.
import { releaseGuardianSnapshot } from "./release-guardian.js";
import { learningDecision, recordRepairOutcome, learningSnapshot } from "./sentinel-learning.js";
import { evaluateLocalGateEvidence } from "./sentinel-local-gate-evidence.js";

const AUTOPILOT_ENABLED = process.env.DASH_SENTINEL_AUTOPILOT === "true";
const LOCAL_GATE_V2_ENABLED = process.env.DASH_SENTINEL_LOCAL_GATE_V2 === "true";
const MAX_CHANGED_LINES = Number(process.env.DASH_AUTOPILOT_MAX_LINES || 60);
const MAX_FILES = Number(process.env.DASH_AUTOPILOT_MAX_FILES || 2);

export function autopilotDecision(repair = {}, guardian = null, learning = null, options = {}) {
  const g = guardian || releaseGuardianSnapshot();
  const l = learning || learningDecision(repair);
  const enabled = options.enabled ?? AUTOPILOT_ENABLED;
  const useLocalGate = options.useLocalGate ?? LOCAL_GATE_V2_ENABLED;
  const localGate = useLocalGate
    ? (options.localGateDecision || evaluateLocalGateEvidence(repair, { guardian: g }))
    : null;
  const blockers = [];

  if (!enabled) blockers.push("autopilot_disabled");
  if (!repair || repair.ok !== true || !repair.branch || !repair.sha) blockers.push("repair_not_verified");
  if ((repair.changedLines || 0) > MAX_CHANGED_LINES) blockers.push("repair_too_large");
  if ((repair.files || []).length > MAX_FILES) blockers.push("too_many_files");

  if (useLocalGate) {
    if (!localGate || localGate.decision !== "GO_LOCAL") {
      const causes = localGate?.blockers?.length ? localGate.blockers : ["no_go"];
      blockers.push(...causes.map((b) => `local_gate:${b}`));
    }
  } else if (!g || g.decision !== "GO") {
    // Compatibilité stricte : tant que le flag V2 n'est pas activé, le comportement
    // historique reste inchangé et exige le Release Guardian complet à GO.
    blockers.push("release_guardian_no_go");
  }

  if (!l || l.allowAutoPromotion !== true) blockers.push("learning_quarantine");
  return {
    decision: blockers.length ? "HOLD" : "PROMOTE_LOCAL",
    blockers,
    guardianDecision: g?.decision || "UNKNOWN",
    localGate: localGate || null,
    learning: l || null,
    policy: {
      enabled,
      localGateV2: useLocalGate,
      localGateRuntimeFlag: LOCAL_GATE_V2_ENABLED,
      maxChangedLines: MAX_CHANGED_LINES,
      maxFiles: MAX_FILES,
      productionDeploy: false,
    },
  };
}

export function registerAutopilotOutcome(repair, result = {}) {
  return recordRepairOutcome({
    ...repair,
    ok: Boolean(result.ok),
    recurrence: Boolean(result.recurrence),
    reason: result.reason || result.raison || null,
  });
}

export function autopilotSnapshot() {
  return {
    enabled: AUTOPILOT_ENABLED,
    localGateV2: LOCAL_GATE_V2_ENABLED,
    productionDeploy: false,
    policy: { maxChangedLines: MAX_CHANGED_LINES, maxFiles: MAX_FILES },
    learning: learningSnapshot(),
  };
}
