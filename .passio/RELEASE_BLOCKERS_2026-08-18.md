# PASSIO — Release Blockers — 2026-08-18

This document is fail-closed. It separates technical readiness from merge, Sentinel V2 activation, and production deployment.

## Current technical state

Canonical Sentinel/mobile tail is technically green on exact current heads:

- #24 — `e9ec9cd25a0d8fedfa377a52c62003f0da4671c8` — CI #1826 SUCCESS;
- #26 — `3a4d0cede9784145a8817a0eef672a2fc8d7383f` — CI #1830 SUCCESS;
- #27 — `1046c3fbf1697e90f7e1ba8257c5c9ed1c6a782a` — CI #1831 SUCCESS;
- #28 — `6e24e7bee94cad676c4d7262900ee4da3ea599fc` — CI #1832 SUCCESS.

#27 remains authenticated/read-only and intentionally NOT mounted in runtime. #28 sanitizes journal entries on both write and read so legacy rows cannot re-expose removed fields.

Node 22 is now the canonical CI/build runtime from #21 onward. Do not describe Node 20 as the current runtime.

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
3. verify the exact checks required match the workflow actually used by the merge candidate;
4. never waive this by relying on historical green runs or PR mergeability.

If enforcement remains off/empty Friday: `NO_GO_MERGE`.

---

## BLOCKER 2 — independent Claude Code + Codex review not yet completed

The final stack contains security-sensitive behavior across causal incident identity, local promotion policy, inventory completeness, transactional Git mutation, rollback, learning/quarantine, journal privacy, lock semantics, authenticated read-only projection and legacy sanitization.

Required:

- Claude Code independent review;
- Codex independent review;
- findings reconciled by code/tests/evidence, not majority opinion;
- every BLOCKER/HIGH finding fixed or explicitly demonstrated false by reproducible evidence;
- exact-head CI re-run when a remediation changes code.

No review agent may weaken AUTHZ, Observation Health, Release Guardian, UNKNOWN/STALE fail-closed semantics, production mutation prohibition, or tests merely to reach green.

---

## BLOCKER 3 — legacy incident history is not yet trusted

PR #14 intentionally keeps a pre-retention-metadata registry fail-closed:

- missing/legacy retention metadata => `historyTrusted:false`;
- `legacyUnproven:true`;
- inventory completeness remains false until historical trust is explicitly established;
- `criticalOverflow:true` permanently prevents completeness.

The required procedure is now defined in:

`.passio/LEGACY_INCIDENT_BASELINE_PROTOCOL.md`

Important boundary:

- the protocol does NOT itself set `historyTrusted:true`;
- no manual production JSON edit is permitted;
- an accepted Friday baseline only authorizes implementation/review of a guarded one-shot trust upgrade bound to exact registry hash and review evidence;
- until that dedicated mechanism exists and passes review/CI, legacy history remains untrusted and Sentinel V2 remains OFF.

If baseline evidence is incomplete/contradictory/UNKNOWN: `LEGACY_BASELINE_REJECTED`.

---

## BLOCKER 4 — multi-instance execution safety is not proven

PR #23 deliberately provides only a process-local transaction lock and declares `distributedCoordination:false`.

A process-local lock cannot prevent two separate dashboard/Sentinel processes from mutating Git concurrently.

The activation proof is defined in:

`.passio/SENTINEL_INSTANCE_COORDINATION_PROTOCOL.md`

Before V2 activation, Friday review must produce one of:

- `SINGLETON_EXECUTOR_PROVEN` — infrastructure and restart/failover evidence prove exactly one mutation-capable executor can exist; or
- `DURABLE_LEASE_PROVEN` — a reviewed lease protects all mutation-capable processes and has TTL, ownership, stale-owner recovery and fail-closed tests.

Otherwise: `NO_GO_V2_ACTIVATION`.

---

## BLOCKER 5 — historical exact-head CI for #14/#15/#18/#19 is unresolved

The original exact-head workflows remain stuck in old Node 20 Playwright-install runs:

- #14 / CI #1807;
- #15 / CI #1808;
- #18 / CI #1811;
- #19 / CI #1818.

Later descendants #21/#23/#24/#26/#27/#28 run the inherited stack successfully under Node 22, which is strong downstream evidence, but does not retroactively turn those historical exact-head runs into SUCCESS.

Friday review must explicitly choose and document a proof policy. Acceptable outcomes include a fresh exact reconstruction/revalidation that proves the exact content being merged under Node 22, or another evidence-backed method reviewed by both agents. It is NOT acceptable to label #1807/#1808/#1811/#1818 green when they are not.

Until proof policy is resolved: merge queue remains fail-closed.

---

## BLOCKER 6 — public production release evidence must be fresh at deploy decision time

Production deploy requires current proof, not PR-time proof:

- `PASSIO_PUBLIC_URL` points to the real public origin;
- public `release.json` is reachable with no-store/no-cache semantics;
- expected commit and optional buildId match the public manifest using the strong commit-proof floor;
- cached evidence belongs to the CURRENT expected pair;
- Authorization is fresh PASS;
- Observation is LIVE/fresh;
- Critical Journeys are fresh PASS;
- Guardian is current and GO;
- no critical/high release blocker remains.

`NOT_CONFIGURED`, `UNKNOWN`, `UNAVAILABLE`, `MISMATCH`, or `STALE_EXPECTATION` never count as PASS/LIVE.

This blocker applies to `GO_PRODUCTION_DEPLOY`, not merely to code merge.

---

## BLOCKER 7 — read-only promotion surface is not approved for runtime mounting yet

#27 defines an authenticated GET-only contract and #28 hardens the data boundary. The route is intentionally not mounted in `server/index.js`.

Before mounting:

- dedicated auth/access review;
- prove unauthenticated requests cannot obtain promotion/lock/journal data;
- no POST/PUT/PATCH/DELETE mutation surface;
- no cache of sensitive operational JSON;
- sanitized journal output only;
- no lock token/raw diagnosis/raw suite detail/patch/log exposure;
- focused runtime route tests;
- exact-head CI.

Do not combine this mounting decision with Sentinel V2 activation.

---

## Superseded branches — never merge

- #20 CLOSED — superseded by #23;
- #22 CLOSED — superseded by #24;
- #25 CLOSED — superseded by #27/#28.

#17 remains OPEN only until Friday explicitly accepts #19 as its canonical convergence based on evidence. If accepted, close #17 without merge.

---

## Canonical merge order

Sentinel/mobile, only after all applicable merge gates are satisfied:

#3 → #5 → #6 → #7 → #8 → #10 → #11 → #12 → #13 → #14 → #15 → #16 → #18 → #19 → #21 → #23 → #24 → #26 → #27 → #28

Parallel integrity/product stack:

#4 → #9

After every parent merge, re-query descendant base/head/mergeability. Never assume stacked PR metadata stayed valid.

---

## Three separate Friday verdicts

### 1. Merge

`GO_MERGE` only if branch protection is ENFORCED, review/proof gates are satisfied, exact current stack is coherent, and no unresolved BLOCKER remains.

### 2. Sentinel V2 activation

`GO_V2_ACTIVATION` additionally requires accepted legacy baseline implementation evidence and proven SINGLETON or DURABLE_LEASE coordination. `DASH_SENTINEL_LOCAL_GATE_V2` remains OFF otherwise.

### 3. Production deployment

`GO_PRODUCTION_DEPLOY` additionally requires fresh production Authorization / Observation / Critical Journeys / Guardian / public release proof against the exact release candidate.

A GO in one category never implies GO in the next.
