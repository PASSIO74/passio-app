// SENTINEL AUTOPILOT LOCK — verrou process-local, fail-closed.
//
// Empêche deux promotions locales de modifier le dépôt en même temps. Ce verrou
// ne constitue PAS à lui seul une coordination multi-processus : une activation
// distribuée doit garantir une instance unique ou ajouter un lease durable.
let active = null;

export function acquireAutopilotLock({ incidentId = null, diagnosisId = null, branch = null } = {}) {
  if (active) {
    return { ok: false, reason: "promotion_already_in_progress", active: { ...active } };
  }
  const token = `apl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  active = { token, incidentId, diagnosisId, branch, acquiredAt: Date.now() };
  return { ok: true, token, active: { ...active } };
}

export function releaseAutopilotLock(token) {
  if (!active) return { ok: false, reason: "promotion_lock_not_held" };
  if (!token || token !== active.token) return { ok: false, reason: "promotion_lock_token_mismatch" };
  const released = active;
  active = null;
  return { ok: true, released };
}

export function autopilotLockSnapshot() {
  return active ? { locked: true, ...active } : { locked: false };
}

export function _resetAutopilotLockForTests() { active = null; }
