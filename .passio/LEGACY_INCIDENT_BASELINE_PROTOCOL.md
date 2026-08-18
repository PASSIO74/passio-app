# PASSIO — Sentinel Legacy Incident Baseline Protocol

Status: PREPARED / REVIEW REQUIRED / NO AUTOMATIC TRUST UPGRADE

Purpose: define the only acceptable process for converting a pre-retention-metadata incident registry from `historyTrusted:false` / `legacyUnproven:true` into an auditable reviewed baseline. This protocol does not itself change runtime state and must never be interpreted as activation of `DASH_SENTINEL_LOCAL_GATE_V2`.

## Safety invariant

Legacy history is UNKNOWN until proven. UNKNOWN is never PASS.

The current code intentionally migrates a registry with no retention schema to:

- `retention.schema = 1`
- `historyTrusted = false`
- `legacyUnproven = true`
- `criticalOverflow = false`
- `criticalOverflowCount = 0`

`incidentRetentionSnapshot().complete` is true only when `historyTrusted === true` and `criticalOverflow === false`.

No migration, startup routine, repair loop, UI action, or AI agent may silently set `historyTrusted:true`.

## Baseline evidence package

Before any trust upgrade can be considered, collect one immutable evidence package containing all of the following:

1. exact repository commit SHA running the dashboard;
2. UTC capture timestamp plus operator identity;
3. cryptographic hash of the complete `incident-packets.json` bytes before any mutation;
4. file size and total number of stored incident rows;
5. retention metadata snapshot (`schema`, `historyTrusted`, `legacyUnproven`, `criticalOverflow`, `criticalOverflowCount`, `lastCriticalOverflowAt`, `stored`, `keep`, `hardKeep`);
6. complete list of every currently open `high` or `critical` incident with `id`, `clusterKey`, `severity`, `status`, `phase`, `createdAt`, `lastSeenAt`;
7. count of closed/noncritical rows separately from open high/critical rows;
8. evidence that no known archive, backup, previous registry copy, log export, or incident source contains an additional unresolved high/critical incident missing from the live registry;
9. evidence that no prior hard-cap overflow or manual truncation of open high/critical incidents is known;
10. current Authorization, Observation Health and Critical Journeys evidence, captured for context only — these do not substitute for historical completeness;
11. Claude Code independent review result;
12. Codex independent review result;
13. final human reconciliation decision with explicit ACCEPT_BASELINE or REJECT_BASELINE.

If any required item is missing, stale, contradictory, unreadable, or UNKNOWN, result is REJECT_BASELINE.

## Acceptance rules

A legacy registry can be considered for trust upgrade only if ALL are true:

- evidence package is complete and bound to exact registry hash;
- `criticalOverflow` is false and `criticalOverflowCount` is zero;
- every current open high/critical incident is enumerated and reviewed;
- no evidence exists of historical deletion/truncation of unresolved high/critical incidents;
- any external historical sources used for reconciliation are themselves identified and immutable enough to review;
- Claude Code and Codex have reviewed independently;
- disagreements have been resolved with repository/data evidence, not majority vote;
- final operator decision is explicit and timestamped.

A baseline is NOT acceptable merely because:

- the current list contains no high/critical incident;
- the file has fewer than `KEEP` rows;
- recent CI is green;
- Release Guardian is GO;
- a PR is mergeable;
- no one remembers an older incident.

## Trust upgrade implementation rule

Do not edit `incident-packets.json` manually in production.

If Friday review accepts a baseline, implement the trust upgrade as a dedicated, reviewed change with:

- exact expected pre-mutation registry hash;
- one-shot operation that refuses to run on hash mismatch;
- explicit operator identity and baseline certificate id;
- persisted `baselineAcceptedAt`, `baselineAcceptedBy`, `baselineRegistryHash`, and review references;
- no clearing of `criticalOverflow` if it was ever true;
- atomic write;
- audit event;
- focused tests for wrong hash, repeated execution, missing review evidence and overflow;
- exact-head CI before use.

Until that dedicated change exists and is reviewed, legacy `historyTrusted` remains false.

## Expiration / invalidation

An accepted baseline must be invalidated and V2 returned to HOLD if any of the following occurs:

- registry hash changed outside expected application writes during the baseline operation;
- evidence is later found of a missing historical unresolved high/critical incident;
- critical overflow becomes true;
- registry corruption or parse ambiguity is detected;
- rollback restores a pre-baseline registry without the accepted certificate metadata;
- review references cannot be reproduced.

## Friday output

Friday review must produce exactly one baseline verdict:

- `LEGACY_BASELINE_ACCEPTED_FOR_IMPLEMENTATION` — evidence is sufficient to build the guarded one-shot trust upgrade, but runtime is still not activated; or
- `LEGACY_BASELINE_REJECTED` — keep `historyTrusted:false`, V2 remains OFF.

Neither verdict is production deployment authorization.
