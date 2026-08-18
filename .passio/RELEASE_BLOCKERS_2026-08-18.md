# PASSIO — Release Blockers — 2026-08-18

This document is fail-closed. It separates technical readiness from merge, Sentinel V2 activation, and production deployment.

## Current technical state

Canonical Sentinel/mobile tail:

- #24 — `e9ec9cd25a0d8fedfa377a52c62003f0da4671c8` — CI #1826 SUCCESS;
- #26 — `3a4d0cede9784145a8817a0eef672a2fc8d7383f` — CI #1830 SUCCESS;
- #27 — `1046c3fbf1697e90f7e1ba8257c5c9ed1c6a782a` — CI #1831 SUCCESS;
- #28 — `6e24e7bee94cad676c4d7262900ee4da3ea599fc` — CI #1832 SUCCESS;
- #29 — current head `b332f44314d7a2a00ede60bcd1b6d04020a59384` — CI #1834 IN PROGRESS at last update; exact final verdict required.

#27 remains authenticated/read-only and intentionally NOT mounted in runtime. #28 sanitizes journal entries on write/read. #29 prevents corrupt/unreadable/invalid-schema promotion-journal persistence from being misreported as healthy `NO_ATTEMPT`; it surfaces explicit `JOURNAL_UNAVAILABLE`. It also refuses promotion-journal writes while persistence health is unavailable, preventing corrupt evidence from being silently overwritten by an in-memory default.

Node 22 is the canonical CI/build runtime from #21 onward. Do not describe Node 20 as the current runtime.

---

## BLOCKER 1 — `main` required status checks are not enforced

Fresh GitHub branch metadata still shows:

- `main.protected = true`;
- branch protection enabled;
- `required_status_checks.enforcement_level = off`;
- required `contexts = []`;
- required `checks = []`.

Impact: `mergeable=true` is not evidence that GitHub enforces Passio CI before merge.

Required before any GO merge to `main`:

1. configure the actual required Passio CI checks/ruleset;
2. re-query `main` and prove enforcement is active;
3. verify required checks match the workflow actually used by the merge candidate;
4. never waive this through historical green runs or PR mergeability.

Current connector exposes no branch-protection/ruleset mutation action. If enforcement remains off/empty Friday: `NO_GO_MERGE`.

---

## BLOCKER 2 — independent Claude Code + Codex review not yet completed

Final security-sensitive scope now includes causal incident identity, local promotion policy, inventory completeness, transactional Git mutation, rollback, learning/quarantine, journal privacy, lock semantics, authenticated read-only projection, legacy sanitization and journal-persistence health/write refusal.

Required:

- Claude Code independent review;
- Codex independent review;
- findings reconciled by code/tests/evidence, not majority opinion;
- every BLOCKER/HIGH finding fixed or proven false with reproducible evidence;
- exact-head CI re-run whenever remediation changes code.

No review agent may weaken AUTHZ, Observation Health, Release Guardian, UNKNOWN/STALE fail-closed semantics, production mutation prohibition, or tests merely to reach green.

---

## BLOCKER 3 — legacy incident history is not yet trusted

PR #14 intentionally keeps a pre-retention-metadata registry fail-closed:

- missing/legacy retention metadata => `historyTrusted:false`;
- `legacyUnproven:true`;
- inventory completeness remains false until historical trust is explicitly established;
- `criticalOverflow:true` permanently prevents completeness.

Required procedure: `.passio/LEGACY_INCIDENT_BASELINE_PROTOCOL.md`.

The protocol does NOT itself set `historyTrusted:true`. No manual production JSON edit is permitted. An accepted Friday baseline only authorizes implementation/review of a guarded one-shot trust upgrade bound to exact registry hash and review evidence. Until then, legacy history remains untrusted and Sentinel V2 remains OFF.

If evidence is incomplete/contradictory/UNKNOWN: `LEGACY_BASELINE_REJECTED`.

---

## BLOCKER 4 — multi-instance execution safety is not proven

PR #23 provides only a process-local transaction lock and declares `distributedCoordination:false`.

Activation proof: `.passio/SENTINEL_INSTANCE_COORDINATION_PROTOCOL.md`.

Before V2 activation, produce one of:

- `SINGLETON_EXECUTOR_PROVEN`; or
- `DURABLE_LEASE_PROVEN` with TTL, ownership, stale-owner recovery and fail-closed tests.

Otherwise: `NO_GO_V2_ACTIVATION`.

---

## BLOCKER 5 — historical exact-head CI for #14/#15/#18/#19 is unresolved

Original exact-head workflows remain stuck in old Node 20 Playwright-install runs:

- #14 / CI #1807;
- #15 / CI #1808;
- #18 / CI #1811;
- #19 / CI #1818.

Later Node 22 descendants #21/#23/#24/#26/#27/#28/#29 provide strong inherited-stack evidence but do not retroactively make those historical exact-head runs SUCCESS.

Friday review must explicitly choose and document an evidence-backed proof policy. Never label #1807/#1808/#1811/#1818 green when they are not.

Until resolved: merge queue remains fail-closed.

---

## BLOCKER 6 — public production release evidence must be fresh at deploy decision time

Production deploy requires current proof:

- real `PASSIO_PUBLIC_URL`;
- public `release.json` reachable with no-store/no-cache semantics;
- expected commit/buildId match current public manifest using strong proof floor;
- cached evidence belongs to CURRENT expected pair;
- Authorization fresh PASS;
- Observation LIVE/fresh;
- Critical Journeys fresh PASS;
- Guardian current GO;
- no critical/high release blocker.

`NOT_CONFIGURED`, `UNKNOWN`, `UNAVAILABLE`, `MISMATCH`, `STALE_EXPECTATION` never count as PASS/LIVE.

This blocker applies to `GO_PRODUCTION_DEPLOY`, not merely code merge.

---

## BLOCKER 7 — read-only promotion surface is not approved for runtime mounting yet

#27 defines an authenticated GET-only contract; #28 hardens projection sanitization; #29 hardens persistence health. The route remains intentionally unmounted in `server/index.js`.

Before mounting:

- dedicated auth/access review;
- unauthenticated requests cannot obtain promotion/lock/journal data;
- no POST/PUT/PATCH/DELETE mutation surface;
- no sensitive operational caching;
- sanitized journal output only;
- journal corruption/unavailability/invalid schema surfaces explicit unavailable, never fake-empty/healthy;
- promotion-journal writes are rejected while persistence is unhealthy;
- no lock token/raw diagnosis/raw suite detail/patch/log/raw filesystem error exposure;
- focused runtime route tests;
- exact-head CI.

Do not combine mounting with V2 activation.

---

## BLOCKER 8 — #29 exact-head conclusion not yet final

At last check #29 / CI #1834 on exact head `b332f44314d7a2a00ede60bcd1b6d04020a59384` had passed static audits and Sentinel tests and was continuing through the Node22 workflow. Until GitHub reports this exact head as COMPLETED SUCCESS, #29 is not technically green.

If CI fails, fix only the exact cause; do not weaken tests, `JOURNAL_UNAVAILABLE`, invalid-schema rejection, or unhealthy-write refusal.

---

## Superseded branches — never merge

- #20 CLOSED — superseded by #23;
- #22 CLOSED — superseded by #24;
- #25 CLOSED — superseded by #27/#28.

#17 remains OPEN only until Friday explicitly accepts #19 as canonical convergence based on evidence. If accepted, close #17 without merge.

---

## Canonical merge order

Sentinel/mobile, only after all applicable gates:

#3 → #5 → #6 → #7 → #8 → #10 → #11 → #12 → #13 → #14 → #15 → #16 → #18 → #19 → #21 → #23 → #24 → #26 → #27 → #28 → #29

Parallel integrity/product:

#4 → #9

After every parent merge, re-query descendant base/head/mergeability. Never assume stacked metadata remains valid.

---

## Three separate Friday verdicts

### 1. Merge

`GO_MERGE` only if branch protection is ENFORCED, review/proof gates are satisfied, exact current stack is coherent, and no unresolved BLOCKER remains.

### 2. Sentinel V2 activation

`GO_V2_ACTIVATION` additionally requires accepted legacy baseline implementation evidence and proven SINGLETON or DURABLE_LEASE coordination. `DASH_SENTINEL_LOCAL_GATE_V2` remains OFF otherwise.

### 3. Production deployment

`GO_PRODUCTION_DEPLOY` additionally requires fresh production Authorization / Observation / Critical Journeys / Guardian / public release proof against the exact release candidate.

A GO in one category never implies GO in the next.
