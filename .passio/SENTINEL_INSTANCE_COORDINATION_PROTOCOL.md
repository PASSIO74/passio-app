# PASSIO — Sentinel Instance Coordination Protocol

Status: PREPARED / REVIEW REQUIRED / V2 OFF

Purpose: define the activation gate for Sentinel local promotion when the current lock is process-local (`distributedCoordination:false`). This protocol does not activate V2 and does not authorize production deployment.

## Invariant

At most one Sentinel promotion transaction may have mutation authority over the repository/worktree at a time.

A process-local lock is sufficient only if there is exactly one eligible executor process for the entire environment. If more than one process/container/instance can execute `executeAutopilotPromotion()`, a durable shared lease is mandatory before V2 activation.

## Path A — Proven singleton topology

Singleton mode is acceptable only if all of the following are proven with current deployment evidence:

1. exactly one dashboard/Sentinel runtime instance is deployed with Autopilot mutation capability;
2. autoscaling cannot create a second eligible executor;
3. rolling deployment cannot overlap two eligible executors;
4. crash restart cannot leave an old executor alive while a new one starts;
5. workers, preview deployments, scheduled jobs and secondary processes cannot import/call the promotion executor with mutations enabled;
6. only one shared worktree/repository mutation target exists;
7. deployment configuration and process manager evidence are captured and reviewable;
8. a chaos test starts a competing executor attempt and proves it is impossible by topology, not merely unlikely;
9. Claude Code and Codex independently accept the singleton proof.

If any item is UNKNOWN, singleton proof fails.

## Path B — Durable distributed lease

If singleton topology cannot be proven, implement a durable lease before V2 activation.

Minimum lease semantics:

- shared storage visible to every eligible executor;
- atomic acquire / compare-and-set;
- lease key bound to the promotion target, not only a local PID;
- opaque owner id never exposed to unauthenticated clients;
- acquiredAt and expiresAt persisted;
- bounded TTL;
- renewal only by current owner;
- release only by current owner token/version;
- fencing token or monotonic generation so a stale owner cannot mutate after losing the lease;
- fail-closed on storage outage, timeout, ambiguous acquire, clock anomaly or lease ownership mismatch;
- no fallback from distributed lease failure to process-local mutation;
- audit events for acquire/reject/renew/release/expiry/fencing failure;
- lease snapshot exposed read-only without secret token;
- tests covering two concurrent processes, stale owner, expired lease, storage failure, double release and restart recovery.

## Activation preflight

Before setting `DASH_SENTINEL_LOCAL_GATE_V2=true`, capture a preflight record with:

- exact application commit SHA;
- exact deployment/build id;
- topology proof type: `SINGLETON` or `DURABLE_LEASE`;
- evidence references;
- current `distributedCoordination` capability;
- current open high/critical incident inventory completeness;
- legacy baseline verdict;
- fresh Authorization / Observation / Critical Journeys / Anomalies gates;
- Claude Code review verdict;
- Codex review verdict;
- explicit human GO for runtime activation.

Missing/stale evidence => NO_GO.

## Rollback

Runtime V2 activation must remain reversible independently of production deploy:

1. unset `DASH_SENTINEL_LOCAL_GATE_V2`;
2. stop new local promotion attempts;
3. allow an already-owned transaction to finish verification/rollback safely, or fence it if durable lease ownership is lost;
4. confirm no active promotion lock/lease remains;
5. retain journal/audit evidence;
6. do not auto-clear quarantine or repair-learning history;
7. production Guardian remains unchanged throughout.

## Friday verdict

Friday review must output one of:

- `INSTANCE_COORDINATION_READY_SINGLETON`
- `INSTANCE_COORDINATION_READY_DURABLE_LEASE`
- `INSTANCE_COORDINATION_BLOCKED`

Only the first two make V2 activation technically eligible. They do not authorize merge or production deployment by themselves.
