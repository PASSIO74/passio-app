# PASSIO — Friday Finalization Checklist

Prepared 2026-08-18. This checklist is the execution order for the final Claude Code + Codex review. It is fail-closed.

## Current verified technical state

- #26 exact head `3a4d0cede9784145a8817a0eef672a2fc8d7383f` — CI #1830 COMPLETED SUCCESS.
- #27 exact head `1046c3fbf1697e90f7e1ba8257c5c9ed1c6a782a` — CI #1831 COMPLETED SUCCESS.
- #28 exact head `6e24e7bee94cad676c4d7262900ee4da3ea599fc` — CI #1832 COMPLETED SUCCESS.
- #28 sanitizes the promotion journal at both write and read boundaries so legacy rows cannot re-expose removed fields.
- `DASH_SENTINEL_LOCAL_GATE_V2` remains OFF.
- #27 read-only promotion route remains intentionally unmounted in runtime.
- no production deploy is authorized.

## Hard blockers to clear before any merge to main

1. Re-query `main` protection. Required checks/ruleset must be actually ENFORCED. `protected:true` with `enforcement_level:off`, empty contexts/checks is NO_GO.
2. Re-query every candidate PR exact head/base/mergeability immediately before merge.
3. Resolve evidence policy for legacy Node 20 stuck exact-head runs #14/#15/#18/#19. Descendant Node 22 green runs are supporting evidence but must not be mislabeled as exact-head successes.
4. Perform independent Claude Code review, then independent Codex review, then evidence-based reconciliation.
5. Review `.passio/LEGACY_INCIDENT_BASELINE_PROTOCOL.md`; produce ACCEPTED_FOR_IMPLEMENTATION or REJECTED. Do not auto-set `historyTrusted:true`.
6. Review `.passio/SENTINEL_INSTANCE_COORDINATION_PROTOCOL.md`; prove singleton topology or require durable lease. Otherwise V2 stays OFF.
7. Re-check fresh AUTHZ, Observation Health, Critical Journeys, Anomalies and Release Guardian evidence.
8. At production-deploy decision time, verify public `release.json` against the exact expected commit/build pair. UNKNOWN/STALE/UNAVAILABLE/MISMATCH/NOT_CONFIGURED = NO_GO.

## Canonical Sentinel/mobile merge order

Only after all parent/base relationships are revalidated:

#3 -> #5 -> #6 -> #7 -> #8 -> #10 -> #11 -> #12 -> #13 -> #14 -> #15 -> #16 -> #18 -> #19 -> #21 -> #23 -> #24 -> #26 -> #27 -> #28

Parallel integrity/product stack:

#4 -> #9

Never merge separately:

- #20 closed/superseded by #23
- #22 closed/superseded by #24
- #25 closed/superseded by #27
- #17 must be resolved explicitly against #19 evidence before closure; do not merge as-is

## Independent review scope — Claude Code

Review full causal and safety chain, with special focus on:

- incident identity continuity;
- retention completeness and legacy trust;
- V2 local gate fail-closed behavior;
- Guardian freshness and exact causal exclusion only;
- transaction serialization and rollback;
- process-local versus distributed coordination;
- HOLD_OPERATIONAL not poisoning repair learning;
- journal redaction on write and read;
- #27 route auth/read-only contract and intentional non-mounting;
- no production mutation or deploy authority anywhere in Sentinel local promotion.

Output one of READY_FOR_STACKED_MERGE / READY_AFTER_FIXES / BLOCKED with exact evidence.

## Independent review scope — Codex

Perform a separate adversarial code/state-machine review. Do not rely on Claude's conclusions. Focus on races, stale evidence, lock ownership, persistence corruption, read-boundary leakage, auth bypass, rollback races and false GO states.

Output the same READY / READY_AFTER_FIXES / BLOCKED contract.

## Reconciliation

For each disagreement, identify the exact code/test/data evidence that can decide it. Add or run a focused test where needed. Do not resolve by vote.

## GO decisions — keep separate

### Merge GO

Requires: protection enforced + exact current heads/bases + conclusive CI evidence policy + reviews reconciled + no unresolved blocker affecting merge safety.

### Runtime V2 activation GO

Requires separately: accepted legacy baseline implementation + singleton proof or durable lease + fresh local gates + explicit activation review. V2 may remain OFF even after merge.

### Production deploy GO

Requires separately: merged exact artifact + fresh production Guardian + fresh public release proof + deployment authorization. A merge GO is not a deploy GO.

## Default verdict

Until every required proof above is explicit and current: `NO_GO`.
