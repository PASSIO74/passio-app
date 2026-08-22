// SENTINEL AUTOPILOT LOCK — verrou process-local, fail-closed.
//
// Empêche deux promotions locales de modifier le dépôt en même temps. Ce verrou
// ne constitue PAS à lui seul une coordination multi-processus : une activation
// distribuée doit garantir une instance unique ou ajouter un lease durable.
let active = null;

function publicActive(value) {
  if (!value) return null;
  return {
    incidentId: value.incidentId || null,
    diagnosisId: value.diagnosisId || null,
    branch: value.branch || null,
    acquiredAt: value.acquiredAt || null,
  };
}

export function acquireAutopilotLock({ incidentId = null, diagnosisId = null, branch = null } = {}) {
  if (active) {
    return { ok: false, reason: "promotion_already_in_progress", active: publicActive(active) };
  }
  const token = `apl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  active = { token, incidentId, diagnosisId, branch, acquiredAt: Date.now() };
  // Le token n'est remis qu'au propriétaire qui vient d'acquérir le verrou.
  return { ok: true, token, active: publicActive(active) };
}

export function releaseAutopilotLock(token) {
  if (!active) return { ok: false, reason: "promotion_lock_not_held" };
  if (!token || token !== active.token) return { ok: false, reason: "promotion_lock_token_mismatch" };
  const released = publicActive(active);
  active = null;
  return { ok: true, released };
}

export function autopilotLockSnapshot() {
  return active ? { locked: true, ...publicActive(active) } : { locked: false };
}

export function _resetAutopilotLockForTests() { active = null; }
