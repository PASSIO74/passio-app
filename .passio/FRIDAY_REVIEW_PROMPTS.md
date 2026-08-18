# PASSIO — Friday Independent Review Prompts

Use these as independent review briefs. Claude Code and Codex should review separately first; reconcile only after both have produced evidence-backed findings.

## Review protocol shared by both agents

Do not assume a green PR because it is mergeable. Re-query exact head, base and CI. `main` branch protection currently does not enforce required status checks, so CI evidence must be checked explicitly.

For every finding provide:

1. severity: BLOCKER / HIGH / MEDIUM / LOW;
2. exact file/function or operational gate;
3. concrete failure mode, not generic advice;
4. evidence or reproducible test;
5. smallest safe remediation;
6. whether remediation changes security/release semantics;
7. tests required before merge.

Do not weaken AUTHZ, Observation Health, Release Guardian, production mutation prohibition, or UNKNOWN/STALE fail-closed semantics to make a test green.

---

# Claude Code review — Sentinel / Control Center stack

Review stacked PRs in dependency order:

- #3 Sentinel 2 Autonomous Core
- #5 Control Center Intelligence
- #6 Sentinel 3 Release Guardian
- #7 Sentinel Autopilot Learning
- #8 Mobile Control Center PWA

Primary questions:

### Observation and release truth

- Can any UNKNOWN, stale, unavailable or unconfigured critical proof become PASS/GO/LIVE through a fallback path?
- Is browser SSE ACK genuinely distinct from server write success?
- Can the public release evidence report LIVE without strong evidence that the public `release.json` belongs to the expected commit?
- Check the 12-character minimum commit-proof rule and whether any alternative comparison path uses weaker prefix semantics.
- Can a cached mobile asset or service worker cause the operator to see stale control information while believing it is current?
- Verify `/api/*` is never served from the mobile service worker cache.

### Sentinel self-heal / Autopilot

- Trace one hypothetical production alert end-to-end: alert -> incident packet -> diagnosis -> verified repair branch -> Autopilot decision -> local transaction -> verification -> rollback or promotion -> recurrence watch -> learning/quarantine.
- Prove production code mutation/deployment remains impossible from this loop.
- Verify dirty worktree, wrong target branch, invalid repair branch, oversized patch, too many files, failed verification and rollback failure are all fail-closed.
- Check whether exact pre-promotion SHA is preserved and rollback cannot reset past unrelated later commits.
- Verify a recurrence is distinct from a failed repair attempt and cannot inflate attempts/failures.
- Verify repeated recurrence quarantines the repair pattern and future auto-promotion is blocked.
- Review the known local-promotion deadlock: full Release Guardian GO includes zero high/critical incidents, so the causal incident may block its own repair promotion. Do NOT relax production Guardian. Determine whether alert/incident/diagnosis/repair traceability is strong enough to build a separate LOCAL pre-promotion gate that excludes only the proven causal incident. If not, recommend keeping HOLD.

### Control Center / mobile authorization

- Verify every mutation route keeps server-side capability checks; client-side hiding is not security.
- Verify mobile exposes no arbitrary git command/patch/branch surface.
- Verify test launching is limited to backend-listed suites and explicit confirmation.
- Verify Sentinel mobile remains read-only unless a future action has a dedicated role check + explicit confirmation + audit trail.

### Required output

End with one of:

- READY_FOR_STACKED_MERGE
- READY_AFTER_FIXES: <exact fixes>
- BLOCKED: <evidence>

Do not recommend production deployment unless branch protection/status-check enforcement is also resolved and exact-head CI is green.

---

# Codex review — Sentinel / Control Center stack

Perform an independent code-level adversarial review of PRs #3, #5, #6, #7, #8 without relying on Claude's conclusions.

Focus on state-machine and concurrency bugs:

- duplicate alert subscriptions / duplicate repair execution;
- overlapping Sentinel analyses;
- overlapping Autopilot promotions;
- stale git HEAD captured before transaction;
- race between clean-tree check and merge;
- concurrent recurrence watches for the same signal;
- recurrence event timestamp ordering;
- JSON persistence corruption or lost update behavior;
- public release probe cache/inflight semantics;
- service worker stale-cache behavior;
- false GO when a dependency throws or returns partial data;
- mutation endpoints reachable with insufficient capability.

For each proposed change, preserve deterministic behavior and add a focused test. Prefer rejection/HOLD over guessing when evidence is incomplete.

End with the same READY / READY_AFTER_FIXES / BLOCKED status and an exact merge-order check.

---

# Claude Code review — Integrity / Product Passion stack

Review:

- #4 Application Integrity Wave 2
- #9 Product Passion Intelligence

### Release integrity

- Verify `release.json`, embedded HTML release identity and service-worker cache identity are generated from the same build.
- Verify commit is provider/GitHub evidence and buildId is a deterministic content identity; never equate the two.
- Inspect `PassioReleaseGuard` concurrency. Concurrent checks must share the current in-flight verdict rather than return stale state.
- Verify version skew detection never forces reload/navigation.
- Verify identity-transition telemetry drain is bounded and cannot block logout indefinitely.

### Passion privacy/data semantics

- Verify only `passion_ctx` is emitted by `context/passion_active`.
- Verify `profileLocalId`, profile name, bio, photo or other personal/local persona data never enters that telemetry event.
- Verify `window.PassioPassionContext.current()` exposes `{ passionId }` only; local profile ID remains closure-private.
- Verify profile-local ID can still be used internally to detect a real persona switch without leaking it.
- Verify unchanged context does not emit duplicates.
- Verify no historical backfill/provenance is invented.
- Do not change feed ranking weights as part of this review unless a failing test demonstrates a ranking defect.

End with READY / READY_AFTER_FIXES / BLOCKED and exact-head CI evidence.

---

# Codex review — Integrity / Product Passion stack

Independently inspect #4 and #9 for:

- build reproducibility / release identity drift;
- timing races between release guard startup and manual/visibility/online checks;
- telemetry ordering during identity transitions;
- local profile ID leakage through globals, serialized events, logs or URLs;
- false duplicate suppression when two personas share a passion;
- event storm risk from the 750 ms context poll;
- test quality: production artifact tests must exercise the built bundle, not a copied helper implementation.

Require a focused regression test for every blocker/high issue.

---

# Final reconciliation prompt

After both independent reviews are complete, compare findings by evidence, not vote count.

For each disagreement:

1. state Claude's claim;
2. state Codex's claim;
3. identify the exact code/test evidence that can discriminate between them;
4. run or add that test;
5. adopt the result proven by the repository.

Then produce:

- final exact merge order;
- exact heads to merge;
- CI run IDs/conclusions;
- unresolved blockers;
- required branch-protection change;
- production release evidence status;
- GO / NO_GO for merge;
- separately, GO / NO_GO for production deployment.

Merge GO and deployment GO are intentionally separate decisions.
