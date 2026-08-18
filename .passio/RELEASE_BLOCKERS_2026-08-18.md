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

Current #8 head: `4506c9951ce3fbdc7fef1faa7488c0eb5983564a`.
Base: exact #7 head `2c4501b9e0aeba7ede062b520ef77b8b431907aa`.
CI #1799 is the current exact-head proof and must be COMPLETED SUCCESS before #8 is called green.

Fresh compare proof: #8 is ahead of #7, behind 0, with exactly 10 changed files in the intended mobile/release/test surface.

Hardening included on this head:

- mobile service worker is network-first for static assets with cache only as offline fallback;
- `/api/*` is never intercepted/cached;
- root-scoped service worker intercepts only the four explicit mobile pilot assets, never the general Control Center surface;
- public release commit matching accepts only hexadecimal commit refs;
- 12 common commit characters is a NON-WEAKENABLE minimum security floor; environment configuration can request more proof but can never lower the floor;
- `public-release-evidence` and `release-recorder` use the exact same proof constant so local buildId expectations cannot be derived with weaker commit proof than the public probe;
- short/weak commit prefixes are rejected by tests;
- cached/in-flight public release evidence is bound to the exact expected commit/build pair;
- if expectations change during an in-flight probe, the old verdict is never reused for the new revision;
- `releaseHealth()` rejects a cached LIVE result whose embedded expectations no longer match the current release expectations (`STALE_EXPECTATION`).

Dashboard/Sentinel tests on #1799 are already SUCCESS. AUTHZ/E2E/workflow completion are still required.

Any earlier #8 CI is evidence for an older head only and must not be used to clear this blocker.

## RESOLVED EVIDENCE — PR #9 exact-head CI

Current #9 head: `fee5a8fc4ee53ea7ac709a29e706f1d0e3b4cf37`.
CI #1791: COMPLETED SUCCESS on this exact head.

Validated together:

- AUTHZ-CRITICAL SUCCESS;
- full application E2E SUCCESS;
- production artifact gates SUCCESS;
- preview workflow SUCCESS;
- `profileLocalId` remains closure-private and absent from public passion API/telemetry;
- overlapping `PassioReleaseGuard.check()` calls share one in-flight Promise and no longer return a stale transient release verdict.

PR #9 is technically green, but merge still requires current base verification, branch-protection remediation and independent Friday review.

## FOLLOW-UP — PR #10 Mobile Pilot entry

PR #10 is intentionally stacked on #8 and does not replace #8's release proof.

- head: `75acace7dc476ff627b846c6a092591a33625cad`;
- base: current #8 head at creation `4506c9951ce3fbdc7fef1faa7488c0eb5983564a`;
- changed files: exactly 2;
- net `index.html` patch: one direct navigation link `Pilot` -> `/mobile.html`;
- separate test file proves the link is navigation-only with no inline mutation/API action;
- CI #1801 is in progress.

Do not merge #10 before #8. Exact-head CI must be green and its base must be revalidated after #8 changes/merge.

## BLOCKER 4 — Production public release evidence must be configured and fresh

PR #8 makes `PASSIO_PUBLIC_URL/release.json` part of production release health.
Before production release:

- `PASSIO_PUBLIC_URL` must be configured to the real public app origin;
- public `release.json` must be reachable no-store/no-cache;
- expected commit must match the public manifest commit with strong commit-prefix proof;
- if a buildId expectation is available, it must come from a local manifest tied to the same commit with the same minimum proof floor;
- cached proof must be aligned to the CURRENT expectation pair;
- NOT_CONFIGURED / UNKNOWN / UNAVAILABLE / MISMATCH / STALE_EXPECTATION are never acceptable as PASS/LIVE.

## HARDENING TRACK — Node runtime upgrade

Current CI still installs Node 20. GitHub Actions and Supabase dependencies emit deprecation/engine warnings indicating Node 20 is obsolete or no longer supported by some packages. Keep the Node 22+ migration separate until the current release stacks stabilize, then run full CI evidence on that migration.

A separate npm install warning also reported one high-severity vulnerability while installing Playwright dependencies. The current connector cannot identify the affected dependency/Dependabot alert, so do not classify it further without an actual audit result.

## Friday invariant

No blocker is cleared by assumption, age of a previous run, PR mergeability, or majority opinion. Clear only with current evidence on the exact head being merged/deployed.
