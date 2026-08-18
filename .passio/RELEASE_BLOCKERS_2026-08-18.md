# PASSIO — Release Blockers — 2026-08-18

This file is intentionally fail-closed: unresolved items block Friday production merge/deploy until explicit evidence is collected.

## BLOCKER 1 — `main` required status checks are not enforced

Fresh GitHub branch metadata on 2026-08-18 shows:

- `main.protected = true`;
- branch protection enabled;
- `required_status_checks.enforcement_level = off`;
- required contexts/checks = empty.

Impact: a PR can appear mergeable even when CI is not enforced by branch protection. Green CI is currently a process convention, not a GitHub-enforced invariant.

Required before production merge/deploy:

1. enable required status checks/ruleset for the actual CI workflow/check used by Passio;
2. verify the requirement is active on `main` after configuration;
3. do not rely on PR `mergeable=true` as proof of CI enforcement.

The current connector session can read this protection but exposes no mutation action for branch protection/rulesets, so this cannot be repaired automatically from this session.

## BLOCKER 2 — Autopilot local pre-promotion policy can deadlock on the incident being repaired

Current policy requires full Release Guardian `GO` before `PROMOTE_LOCAL`.
Release Guardian requires zero open high/critical incidents.
Therefore the causal incident being repaired can itself keep the Guardian NO_GO and block local promotion.

Do NOT weaken production Release Guardian.

Safe resolution requirements for a future distinct LOCAL pre-promotion gate:

- repair already verified and within strict file/line bounds;
- fresh/pass AUTHZ;
- Observation LIVE;
- critical journeys green;
- anomaly evidence measured and not anomalous;
- clean target branch and transactional rollback;
- only the proven causal incident may be excluded from the local incident gate;
- every unrelated high/critical incident remains a blocker;
- full Release Guardian GO remains mandatory for production release/deploy.

Until the causal incident can be traced unambiguously through alert -> diagnosis -> repair -> promotion, keep current fail-closed HOLD behavior.

## BLOCKER 3 — PR #8 exact-head CI must finish green

Current #8 head: `43b1080d803aea58fc3195bd39e01b7cd6575ca3`.
Base: exact #7 head `2c4501b9e0aeba7ede062b520ef77b8b431907aa`.
CI #1790 is the current exact-head proof and must be COMPLETED SUCCESS before #8 is called green.

Additional hardening already included on this head:

- mobile service worker is network-first for static assets with cache only as offline fallback;
- `/api/*` is never intercepted/cached;
- public release commit matching accepts only hexadecimal commit refs and requires at least 12 common characters of proof;
- short/weak commit prefixes are explicitly rejected by tests.

Any earlier #8 CI (#1771, #1782, #1783, #1788) is evidence for an older head only and must not be used to clear this blocker.

## BLOCKER 4 — PR #9 corrected exact-head CI must finish green

Current #9 head: `fee5a8fc4ee53ea7ac709a29e706f1d0e3b4cf37`.
CI #1791 is the current exact-head proof.

History that must not be misread:

- previous privacy-tightened head `f833f475...` ran CI #1785;
- AUTHZ-CRITICAL passed;
- the full application E2E suite passed: 170 passed, 18 skipped;
- the production artifact gate failed only on RELEASE-INTEGRITY version-skew detection;
- passion-context artifact tests themselves were not the failing area.

Root cause fixed on current head:

`PassioReleaseGuard.check()` returned an immediate stale snapshot to a caller when another release check was already in flight. The guard now shares the same in-flight Promise, so concurrent/manual/visibility/online checks receive the final verdict instead of a transient stale result.

Privacy hardening remains:

- `profileLocalId` remains internal to the passion helper closure;
- public `PassioPassionContext.current()` returns `{ passionId }` only;
- telemetry publishes only `passion_ctx`.

Do not clear this blocker until CI #1791 is COMPLETED SUCCESS, including the production artifact gate.

## BLOCKER 5 — Production public release evidence must be configured and fresh

PR #8 makes `PASSIO_PUBLIC_URL/release.json` part of production release health.
Before production release:

- `PASSIO_PUBLIC_URL` must be configured to the real public app origin;
- public `release.json` must be reachable no-store/no-cache;
- expected commit must match the public manifest commit with strong commit-prefix proof;
- if a buildId expectation is available, it must come from a local manifest tied to the same commit;
- NOT_CONFIGURED / UNKNOWN / UNAVAILABLE / MISMATCH are never acceptable as PASS/LIVE.

## HARDENING TRACK — Node runtime upgrade (separate from release blockers unless runtime compatibility changes)

Current CI still installs Node 20. GitHub Actions and Supabase dependencies now emit deprecation/engine warnings indicating Node 20 is obsolete or no longer supported by some packages. Do not mix this migration into #8/#9 while their release proofs are being stabilized. Prepare a separate Node 22+ hardening change with full CI evidence after the current stacks are stable.

## Friday invariant

No blocker is cleared by assumption, age of a previous run, PR mergeability, or majority opinion. Clear only with current evidence on the exact head being merged/deployed.
