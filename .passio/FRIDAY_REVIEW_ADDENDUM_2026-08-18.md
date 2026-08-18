# PASSIO — Friday Review Addendum (2026-08-18)

This addendum extends `FRIDAY_REVIEW_PROMPTS.md` for the converged Sentinel V2 preparation stack. Claude Code and Codex must review independently before reconciliation.

## Canonical stacked order to review

#13 incident inventory proof
#14 durable retention completeness
#15 causal repair context
#16 read-only local gate adapter
#18 explicit V2 opt-in (OFF by default)
#19 fresh sealed canonical evidence V2
#21 Node 22 CI/build/deploy runtime
#23 transaction serialization + activation protocol
#24 bounded integrated promotion journal

Parallel prototypes that must not be merged separately after convergence:
- #20 closed, superseded by #23.
- #17 candidate for closure only after exact evidence for #19 is conclusive.
- #22 candidate for closure only after #24 exact CI + review are conclusive.

## Mandatory invariants

1. `DASH_SENTINEL_LOCAL_GATE_V2` remains OFF until explicit reviewed activation.
2. GO_LOCAL/PROMOTED_LOCAL never means production deploy authorization.
3. UNKNOWN/STALE/MISSING evidence always HOLD/NO_GO.
4. Full production Release Guardian semantics remain unchanged.
5. Existing legacy incident history is not silently trusted.
6. A process-local lock is insufficient for multi-instance deployment; require proven single instance or durable lease before activation.
7. No lock ownership token, full diagnosis analysis, patch content, auth secret, or raw verification log may enter persisted promotion observability.
8. `main` required checks/ruleset must be actually ENFORCED before merge; mergeability alone is not proof.
9. Merge GO and production deploy GO are separate verdicts.

## Claude Code review focus

### #13/#14 inventory and retention
- Prove completeness comes from durable retention provenance, not a bounded-list heuristic.
- Prove open high/critical incidents survive nominal pruning.
- Prove hard-cap critical loss permanently forces incomplete state.
- Prove a legacy registry without trusted metadata remains `historyTrusted:false` until a separate audited baseline procedure is completed.
- Check restart/persistence semantics for retention metadata and overflow flags.

### #15/#19 causal evidence
- Trace persisted diagnosis -> frozen/sealed evidence -> repair context -> local gate.
- Prove diagnosisId, incidentId and optional cluster identity must match exactly.
- Prove Guardian timestamps reject missing, stale and future observations.
- Check for ESM/circular dependency regressions; adapter/policy layers must not import `sentinel.js` just to recover identity.

### #18 opt-in boundary
- Default behavior without V2 flag must remain historical full-Guardian gating.
- V2 must require explicit opt-in and GO_LOCAL.
- A local HOLD must block even if full Guardian says GO.
- Production mutation prohibition and explicit mutation flag remain independent blockers.

### #21 runtime consistency
- Test, preview build and production build must all use Node 22.
- No gate/test command should have been weakened while changing runtime.
- Confirm Supabase engine warnings are removed or otherwise explained by current lockfile state.

### #23 transaction serialization
- Lock acquired before first git operation after branch-format validation.
- Concurrent transaction rejected before git access.
- Lock released in `finally` for every early return/throw path.
- Owner token never leaves private ownership path.
- Process-local limitation is visible and prevents multi-instance activation without additional coordination.
- Re-check race window between clean-tree verification and merge and document residual risk.

### #24 promotion journal
- Journal is actually invoked by executor; it must not be dormant.
- Persist only minimal structured evidence: ids, branch/SHA, before/after SHA, booleans, bounded reasons, suite name+ok, freshness/duration.
- Never persist suite raw detail, patch, diagnosis prose, secrets or lock token.
- Retention limit must be bounded even with hostile/malformed environment input.
- Snapshot is observation-only and cannot authorize runtime or production.

## Codex adversarial focus

Independently look for:
- stale Guardian age computed from a wrong nested policy object;
- false causal match through cluster/title fallback rather than exact incident id;
- mutable diagnosis evidence after bootstrap despite intended sealing;
- journal writes throwing and accidentally changing promotion outcome;
- persistence lost-update/corruption behavior under concurrent observation writes;
- lock release skipped by synchronous exception before `try/finally` ownership is established;
- exposing journal data through an unauthenticated route by transitive snapshot usage;
- `KEEP` NaN/zero/negative/unbounded behavior;
- verification details leaking through audit while journal is sanitized;
- successful merge with unchanged HEAD incorrectly marked success;
- rollback failure followed by misleading success/learning state;
- multi-process duplicate promotion despite process-local green tests.

## Required evidence output

For each PR record exact head SHA, exact workflow run id, conclusion, mergeability, base SHA, changed-file scope, and any blocker.

End with two independent verdicts:
- MERGE: GO / NO_GO
- PRODUCTION DEPLOY: GO / NO_GO

A MERGE GO is impossible while `main` required checks are not enforced. A production deploy GO additionally requires fresh public release proof and all production Guardian evidence.
