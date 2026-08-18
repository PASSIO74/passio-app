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
- #10 Desktop Mobile Pilot entry
- #11 Sentinel causal incident trace
- #12 Pure local promotion gate (NOT runtime activated)

Primary questions:

### Observation and release truth

- Can any UNKNOWN, stale, unavailable or unconfigured critical proof become PASS/GO/LIVE through a fallback path?
- Is browser SSE ACK genuinely distinct from server write success?
- Can the public release evidence report LIVE without strong evidence that the public `release.json` belongs to the expected commit?
- Check the non-weakenable 12-character minimum commit-proof floor and prove every alternative commit comparison path uses the same or stronger semantics.
- Verify `public-release-evidence` and `release-recorder` share the same proof floor rather than duplicating configuration.
- Can a cached mobile asset or service worker cause the operator to see stale control information while believing it is current?
- Verify `/api/*` is never served from the mobile service worker cache and the root-scoped SW can intercept only the explicit Pilot assets.

### Sentinel self-heal / Autopilot

- Trace one hypothetical production alert end-to-end: alert -> incident packet -> diagnosis -> verified repair branch -> Autopilot decision -> local transaction -> verification -> rollback or promotion -> recurrence watch -> learning/quarantine.
- Prove production code mutation/deployment remains impossible from this loop.
- Verify dirty worktree, wrong target branch, invalid repair branch, oversized patch, too many files, failed verification and rollback failure are all fail-closed.
- Check whether exact pre-promotion SHA is preserved and rollback cannot reset past unrelated later commits.
- Verify a recurrence is distinct from a failed repair attempt and cannot inflate attempts/failures.
- Verify repeated recurrence quarantines the repair pattern and future auto-promotion is blocked.

### Causal incident trace — PR #11

- Prove the exact `incidentId` and `incidentClusterKey` originate from the Incident Packet produced for the alert, not from later heuristic reconstruction.
- Prove the same identity survives alert meta -> Sentinel queue/job -> persisted diagnosis -> repairer input unchanged.
- Check clustering behavior: a clustered later alert may update `signal.alertId`; ensure the `incidentId` still refers to the intended open packet and does not silently point at an unrelated causal cluster.
- Check whether any code path constructs/feeds a Sentinel alert without an Incident Packet and what fail-closed behavior a future local gate must use in that case.
- No review approval should infer that causal identity alone authorizes promotion.

### Pure local promotion policy — PR #12

This PR is **NOT runtime activated**. Review policy semantics independently from runtime wiring.

- Verify required local safety gates are authorization, observation, critical journeys and anomalies, all requiring explicit `pass===true`.
- Missing gate, UNKNOWN, STALE or FAIL must HOLD.
- Verify `causalIncidentId` must identify an OPEN high/critical incident; missing, closed, warn/info or mismatched identity must HOLD.
- Verify only that exact causal incident is excluded locally; every other open high/critical incident must HOLD.
- Verify `release_chain` is ignored only for local reversible promotion and the full production Release Guardian remains unchanged and visible.
- Verify the policy reports `productionDeploy:false` and `runtimeActivated:false` and has no import/call from `sentinel-autopilot.js` today.
- Treat any hidden runtime activation in #12 as BLOCKER.
- Do not approve a future activation solely because #12 tests pass; activation requires a separate diff/review and must preserve transactional verification + rollback.

### Control Center / mobile authorization

- Verify every mutation route keeps server-side capability checks; client-side hiding is not security.
- Verify mobile exposes no arbitrary git command/patch/branch surface.
- Verify test launching is limited to backend-listed suites and explicit confirmation.
- Verify Sentinel mobile remains read-only unless a future action has a dedicated role check + explicit confirmation + audit trail.
- Verify #10 adds navigation only and does not bypass auth or add mutation behavior.

### Required output

End with one of:

- READY_FOR_STACKED_MERGE
- READY_AFTER_FIXES: <exact fixes>
- BLOCKED: <evidence>

Do not recommend production deployment unless branch protection/status-check enforcement is also resolved and exact-head CI is green.

---

# Codex review — Sentinel / Control Center stack

Perform an independent code-level adversarial review of PRs #3, #5, #6, #7, #8, #10, #11 and #12 without relying on Claude's conclusions.

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
- service worker stale-cache behavior or overbroad root-scope interception;
- false GO when a dependency throws or returns partial data;
- mutation endpoints reachable with insufficient capability;
- causal incident identity becoming stale after incident clustering/update;
- local gate accidentally treating closed/noncritical/missing causal incidents as excludable;
- unrelated high/critical incidents accidentally filtered by cluster key/title rather than exact id;
- any runtime import/call of the #12 policy that contradicts `runtimeActivated:false`.

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
- explicit confirmation whether #12 remains inactive runtime policy;
- GO / NO_GO for merge;
- separately, GO / NO_GO for production deployment.

Merge GO and deployment GO are intentionally separate decisions.
