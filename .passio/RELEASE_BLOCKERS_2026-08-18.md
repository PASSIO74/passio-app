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

Final #8 head: `82fdf6169d5a69ab580b60df2d0219ae4026c348`
Base: exact #7 head `2c4501b9e0aeba7ede062b520ef77b8b431907aa`.
CI #1783 is the required exact-head proof. Do not call #8 green or merge it until this run is COMPLETED SUCCESS.

## BLOCKER 4 — PR #9 privacy-tightened exact-head CI must finish green

Current #9 head: `f833f47592f541fd3d86ce5cbc7bdfcbcf6700b2`.
CI #1785 must complete successfully, including production artifact gates, after the public helper API was tightened to hide `profileLocalId`.

## BLOCKER 5 — Production public release evidence must be configured and fresh

PR #8 makes `PASSIO_PUBLIC_URL/release.json` part of production release health.
Before production release:

- `PASSIO_PUBLIC_URL` must be configured to the real public app origin;
- public `release.json` must be reachable no-store/no-cache;
- expected commit must match the public manifest commit;
- if a buildId expectation is available, it must come from a local manifest tied to the same commit;
- NOT_CONFIGURED / UNKNOWN / UNAVAILABLE / MISMATCH are never acceptable as PASS/LIVE.

## Friday invariant

No blocker is cleared by assumption, age of a previous run, PR mergeability, or majority opinion. Clear only with current evidence on the exact head being merged/deployed.
