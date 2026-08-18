# PASSIO — Friday Independent Review Prompts

Use these as independent review briefs. Claude Code and Codex must review separately first; reconcile only after both have produced evidence-backed findings.

## Shared review protocol

Start by reading:

- `.passio/FRIDAY_FINALIZATION_CHECKLIST.md`
- `.passio/RELEASE_BLOCKERS_2026-08-18.md`
- `.passio/LEGACY_INCIDENT_BASELINE_PROTOCOL.md`
- `.passio/SENTINEL_INSTANCE_COORDINATION_PROTOCOL.md`
- `.passio/SENTINEL_AUTOPILOT_ACTIVATION_PROTOCOL.md`
- `.passio/ITERATION_2026-08-18_1900.md`

Then re-query GitHub. Do not trust historical handoff claims without checking current head/base/mergeability/CI.

Current canonical Sentinel/mobile order to review:

#3 → #5 → #6 → #7 → #8 → #10 → #11 → #12 → #13 → #14 → #15 → #16 → #18 → #19 → #21 → #23 → #24 → #26 → #27 → #28

Parallel integrity/product order:

#4 → #9

Superseded branches that must not be merged:

- #20 (superseded by #23)
- #22 (superseded by #24)
- #25 (superseded by #27/#28)

#17 remains open only until #19 supersession is explicitly accepted by evidence.

Fresh known exact-head successes on 2026-08-18 that must still be revalidated Friday:

- #21 / CI #1820 SUCCESS
- #23 / CI #1822 SUCCESS
- #24 / CI #1826 SUCCESS
- #26 / CI #1830 SUCCESS
- #27 / CI #1831 SUCCESS
- #28 / CI #1832 SUCCESS

Historical exact-head runs #14/#15/#18/#19 are NOT green merely because descendants pass. Their old Node 20 runs #1807/#1808/#1811/#1818 were stuck. Resolve this explicitly by evidence; never relabel them SUCCESS.

`main` was still `protected:true` but required checks were `enforcement_level:off`, `contexts:[]`, `checks:[]` on the last fresh query. Re-query. If still off/empty: `NO_GO_MERGE`.

For every finding provide:

1. severity: BLOCKER / HIGH / MEDIUM / LOW;
2. exact PR + file/function/gate;
3. concrete failure mode;
4. reproducible evidence/test;
5. smallest safe remediation;
6. whether remediation changes security/release semantics;
7. exact tests required before accepting the fix.

Never weaken AUTHZ, Observation Health, Release Guardian, UNKNOWN/STALE fail-closed behavior, production mutation prohibition, branch protection, or tests just to obtain green.

---

# Claude Code — independent Sentinel / Control Center review

Review the complete canonical Sentinel/mobile stack without relying on Codex conclusions.

## A. End-to-end Sentinel causal loop

Trace one realistic high/critical alert through:

DETECT → CONFIRM → CORRELATE → DIAGNOSE → verified repair → local gate → transaction lock → Git preconditions → merge/test → rollback or PROMOTED_LOCAL → journal → learning/quarantine → recurrence watch.

Prove:

- incident identity originates from the exact Incident Packet;
- `incidentId`, `incidentClusterKey`, and `diagnosisId` cannot be reconstructed heuristically later;
- sealed diagnosis evidence cannot be swapped after decision;
- missing/future/stale Guardian evidence HOLDs;
- missing/incomplete incident inventory HOLDs;
- only the exact causal high/critical incident can be excluded for local reversible evaluation;
- any unrelated open high/critical incident HOLDs;
- full production Guardian is never weakened;
- `productionDeploy:false` remains true throughout the local path.

## B. Inventory + legacy retention — #13/#14

Review retention implementation and the legacy baseline protocol together.

Prove:

- new registries can be trusted by construction only because retention metadata starts with `historyTrusted:true`;
- pre-metadata registries become `historyTrusted:false`, `legacyUnproven:true`;
- open high/critical incidents are protected from nominal retention;
- hard-cap overflow records permanent `criticalOverflow` evidence;
- completeness is false whenever historical trust is false or critical overflow occurred;
- no startup path can silently promote legacy history to trusted;
- `.passio/LEGACY_INCIDENT_BASELINE_PROTOCOL.md` requires evidence strong enough to justify a future guarded one-shot trust upgrade.

Any proposal to set `historyTrusted:true` directly or manually edit production JSON is BLOCKER.

## C. Repair causal context — #15/#19

Prove:

- `repair.incidentId` and diagnosis identity remain exact across bootstrap/autopilot layers;
- no ESM cycle or fallback heuristic can replace the sealed evidence;
- cluster identity cannot accidentally authorize a different incident;
- stale or mismatched evidence HOLDs.

Resolve whether #19 fully supersedes #17. If yes, document exact evidence and recommend closing #17 without merge.

## D. V2 opt-in boundary — #18/#19

Verify:

- `DASH_SENTINEL_LOCAL_GATE_V2` is OFF by default;
- default behavior remains full production Guardian GO requirement;
- local V2 requires explicit opt-in plus all other safety conditions;
- activation is not implied by merging the policy code;
- no hidden runtime path enables V2.

End this section with one of:

- `V2_POLICY_SAFE_BUT_INACTIVE`
- `V2_POLICY_FIX_REQUIRED`
- `V2_POLICY_BLOCKED`

## E. Node 22 proof — #21

Verify the workflow uses the same Node 22 runtime for test, preview build and production build/deploy path.

Confirm Node 22 removes the old Playwright install issue without changing security gates.

Propose an explicit evidence policy for #14/#15/#18/#19 that does not falsify their old run status.

## F. Transaction serialization — #23

Prove:

- lock is acquired before any mutation-capable Git operation;
- second concurrent local promotion is rejected before Git access;
- token is private and never exposed in snapshot/journal/audit/API;
- lock release is guaranteed in `finally`;
- process-local scope is explicitly visible and cannot be mistaken for distributed safety.

Review `.passio/SENTINEL_INSTANCE_COORDINATION_PROTOCOL.md` and state whether SINGLETON proof or DURABLE_LEASE is required for the actual target topology.

No V2 activation may be approved without one of those proofs.

## G. Promotion journal — #24/#28

Prove:

- journal retention is bounded;
- journal write failure cannot convert a completed local transaction into an unhandled executor failure;
- no lock token, raw diagnosis, raw patch, raw log or raw suite detail is persisted;
- #28 sanitizes legacy rows on READ as well as WRITE;
- unknown fields in legacy entries are dropped at projection boundary;
- Guardian timing comes from the actual V2 evidence path and cannot be forged by an unrelated timestamp.

## H. Operational holds and learning — #26

Prove the invariant:

`tx.attempted !== true` ⇒ `HOLD_OPERATIONAL` ⇒ journal/audit yes, repair-learning failure/quarantine no.

Check at least:

- lock contention;
- dirty worktree;
- wrong target branch;
- invalid repair branch;
- unavailable pre-promotion SHA if it occurs before transaction attempt.

Then prove true attempted failures remain learnable:

- verification failure;
- failed merge after transaction start;
- rollback path.

No operational environment issue should quarantine a repair pattern.

## I. Read-only promotion surface — #27/#28

Prove:

- only authenticated GET contract exists;
- no POST/PUT/PATCH/DELETE mutation authority;
- returned lock snapshot contains no ownership token;
- returned journal data is sanitized by #28;
- route is still NOT mounted in runtime;
- no production deployment/runtime activation capability exists in this layer.

Review a future mounting plan, but do not approve mounting merely because the module is safe in isolation. Dedicated route/access/no-cache/unauthenticated tests are required.

## J. Mobile / Control Center

Prove:

- `/api/*` is never served from PWA cache;
- mobile Pilot only exposes intended assets;
- all mutations retain server-side authorization;
- test-launching is whitelisted and confirmed;
- Sentinel/operator surfaces remain read-only unless a future action has explicit role, confirmation, audit and dedicated review.

## Required Claude output

Return:

1. `READY_FOR_STACKED_MERGE`, `READY_AFTER_FIXES`, or `BLOCKED`;
2. exact blockers/fixes;
3. explicit #17 vs #19 supersession verdict;
4. exact legacy baseline verdict: `LEGACY_BASELINE_ACCEPTED_FOR_IMPLEMENTATION` or `LEGACY_BASELINE_REJECTED`;
5. exact coordination verdict: `SINGLETON_EXECUTOR_PROVEN`, `DURABLE_LEASE_PROVEN`, or `COORDINATION_NOT_PROVEN`;
6. recommended GO/NO_GO separately for merge, V2 activation and production deploy.

---

# Codex — independent adversarial Sentinel / Control Center review

Review the same complete canonical stack independently. Do not rely on Claude's conclusions.

Prioritize adversarial state-machine, concurrency and privacy failure modes.

## Concurrency / transaction attacks

Look for:

- duplicate alert subscriptions;
- overlapping Sentinel analyses;
- overlapping repair generation;
- overlapping promotion attempts;
- stale Git HEAD captured before transaction;
- TOCTOU between clean-tree validation and merge;
- lock release on every early throw/return path;
- process-local lock incorrectly treated as cross-instance safety;
- split-brain scenarios in any proposed durable lease;
- stale owner/TTL takeover hazards;
- concurrent recurrence watches or learning writes.

## Evidence integrity attacks

Try to produce false GO with:

- missing Guardian timestamp;
- future timestamp;
- stale Guardian;
- missing diagnosis evidence;
- mismatched incident/diagnosis/cluster;
- incomplete incident inventory;
- critical overflow;
- closed or noncritical causal incident;
- unrelated high/critical incident;
- malformed/partial JSON persistence;
- stale public release cache tied to an old expectation pair.

Every such case must HOLD/fail closed.

## Persistence/privacy attacks

Inspect:

- JsonDb corruption/lost update assumptions;
- promotion journal legacy rows;
- lock snapshot;
- audit/broadcast payloads;
- read-only API projection.

Prove no token/raw diagnosis/patch/suite detail/private operational secret can reappear through historical data or alternate projection paths.

## Learning correctness — #26

Attempt to poison quarantine using repeated environmental holds. It must fail: non-attempted holds cannot increment repair failure counters.

Attempted verification/rollback failures must remain learnable.

## Runtime boundary — #27/#28

Prove modules are inert until explicitly mounted. Search for accidental import/route registration. Treat hidden runtime mounting as BLOCKER.

## Historical CI evidence

Independently evaluate a rigorous proof strategy for #14/#15/#18/#19 under Node 22. Do not call their stuck Node 20 runs successful.

## Required Codex output

Return the same six outputs required from Claude, including independent merge/V2/deploy recommendations.

---

# Claude Code — Integrity / Product Passion review

Review #4 and #9 independently.

## Release integrity

Verify:

- `release.json`, embedded HTML release identity and service-worker identity come from the same build lineage;
- commit identity and buildId are not conflated;
- concurrent Release Guard checks share the correct in-flight Promise;
- version skew detection does not force uncontrolled reload/navigation;
- logout/identity-transition telemetry drain is bounded;
- production artifact tests exercise the built bundle rather than copied helper logic.

## Passion privacy/data semantics

Verify:

- `context/passion_active` exposes only intended `passion_ctx` data;
- local profile/persona ids, name, bio, image or local-only metadata do not leak via telemetry/globals/URLs/logs;
- `PassioPassionContext.current()` exposes only the intended public passion identity;
- internal persona switching still works without public leakage;
- unchanged context does not create duplicate events;
- no invented historical provenance/backfill.

Do not change ranking weights unless a failing regression test proves a ranking defect.

Return READY / READY_AFTER_FIXES / BLOCKED with exact-head evidence.

---

# Codex — Integrity / Product Passion review

Independently inspect #4/#9 for:

- build reproducibility drift;
- release identity races;
- concurrent guard races;
- identity-transition event ordering;
- local persona-id leakage;
- duplicate suppression bugs when two personas share a passion;
- 750ms poll event-storm or lifecycle leak;
- tests that accidentally validate helper copies instead of production artifacts.

Require focused regression tests for every BLOCKER/HIGH finding.

---

# Final reconciliation prompt

After independent reviews, compare claims by evidence, never by vote count.

For each disagreement:

1. Claude claim;
2. Codex claim;
3. exact discriminating code/test/data evidence;
4. run/add test;
5. adopt only the result proven by repository/runtime evidence.

Then re-query GitHub one final time and produce:

- exact current merge order;
- exact current heads and bases;
- exact CI run IDs/conclusions;
- explicit branch-protection/ruleset state;
- #17 supersession decision;
- legacy baseline verdict;
- instance coordination verdict;
- production release evidence state;
- whether #27 remains unmounted;
- whether `DASH_SENTINEL_LOCAL_GATE_V2` remains OFF;
- unresolved blockers;
- `GO_MERGE` or `NO_GO_MERGE`;
- separately `GO_V2_ACTIVATION` or `NO_GO_V2_ACTIVATION`;
- separately `GO_PRODUCTION_DEPLOY` or `NO_GO_PRODUCTION_DEPLOY`.

No category inherits GO from another category.
