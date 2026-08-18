# Sentinel Legacy Incident Baseline Protocol

Status: PREPARED PROCEDURE — NOT AUTOMATED, NOT RUNTIME ACTIVATION.

## Problem

A legacy incident registry created before durable retention metadata cannot prove that no open high/critical incident was previously evicted by historical bounded retention. Therefore `historyTrusted:false` is correct and must not be flipped automatically.

## Rule

No code path may infer trusted history solely from:
- current registry size;
- absence of current high/critical incidents;
- successful restart;
- a clean local gate evaluation;
- elapsed time;
- operator convenience.

## Manual audited baseline certificate

A future activation may accept a baseline only after a human-reviewed audit produces a separate certificate bound to the exact deployment/repository state.

Minimum certificate fields:
- `schemaVersion`;
- `createdAt`;
- exact application/release commit;
- environment identifier that is not a secret;
- current incident-registry digest/count;
- explicit statement that historical incident sources/logs were audited for unresolved high/critical incidents;
- reviewer identities or approved review references;
- Claude Code review reference;
- Codex review reference;
- expiration/revalidation policy;
- `approvedForLocalGateV2:true` only after all checks pass.

## Fail-closed semantics

- Missing certificate => history remains untrusted.
- Certificate commit/release mismatch => untrusted.
- Expired/stale certificate => untrusted.
- Any unresolved or ambiguous high/critical historical incident => untrusted.
- Any retention overflow after certificate creation invalidates the certificate immediately.
- Any storage migration that changes incident provenance invalidates the certificate until re-audited.

## Separation of duties

The certificate must not itself enable `DASH_SENTINEL_LOCAL_GATE_V2`.
It is only one prerequisite. Runtime activation additionally requires:
- exact-head green CI for the canonical stack;
- fresh Guardian/local evidence;
- single-instance proof or durable distributed lease;
- `main` required checks enforced;
- independent Claude Code and Codex reviews;
- explicit operator activation decision.

## Implementation guidance

Do not add an endpoint that can set `historyTrusted:true` directly.
Prefer a read-only certificate verifier that validates a versioned file or deployment-bound record and contributes one explicit gate result. Keep the original retention metadata truthful: legacy history remains historically unproven; the separate certificate records the audit that compensates for that uncertainty.

Production deploy authorization remains completely separate.
