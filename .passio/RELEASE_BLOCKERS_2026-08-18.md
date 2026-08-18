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

1. enable required status checks/ruleset for the actual Passio CI workflow/check;
2. verify enforcement is active on `main` after configuration;
3. do not use PR `mergeable=true` as proof that CI is mandatory.

The current connector can read this protection but exposes no mutation action for branch protection/rulesets.

## BLOCKER 2 — Autopilot local pre-promotion deadlock is NOT runtime-resolved yet

Current runtime policy still requires full Release Guardian `GO` before `PROMOTE_LOCAL`. Release Guardian requires zero open high/critical incidents, so the causal incident being repaired can itself keep Guardian NO_GO.

Do NOT weaken production Release Guardian.

### RESOLVED EVIDENCE — PR #11 causal identity

- head `6092ee22dc0a883728f51d50c2f112fd43ed1f43`;
- CI #1802: COMPLETED SUCCESS;
- exact `incidentId` + `incidentClusterKey` survive Incident Packet -> alert/meta -> persisted Sentinel diagnosis -> repairer;
- PR mergeable;
- no Guardian/Autopilot policy or production mutation change.

### RESOLVED EVIDENCE — PR #12 pure local gate policy, NOT activated

- head `95929e64a2c5d4d830435daa508ead10e3cecb0d`;
- CI #1805: COMPLETED SUCCESS;
- requires PASS authorization/observation/critical_journeys/anomalies;
- exact causalIncidentId must match an open high/critical incident;
- `incidentsComplete:true` is mandatory;
- every unrelated high/critical incident blocks;
- missing gate, UNKNOWN, STALE, FAIL, missing/mismatched causal identity, incomplete incident set => HOLD;
- local-only evaluation may ignore release_chain and only the exact causal incident;
- output explicitly declares `productionDeploy:false`, `runtimeActivated:false`;
- `sentinel-autopilot.js` and production Release Guardian remain unchanged.

### PR #13 — fail-closed incident inventory proof — CI #1806 IN PROGRESS

- head `43cb467bd0e2adab24a30354f261fee824f38a77`;
- 2 new files only;
- prevents a bounded incident list from being treated as exhaustive without retention provenance;
- static audits, dashboard/Sentinel tests and AUTHZ-CRITICAL already SUCCESS; E2E/workflow still running.

### PR #14 — provable critical-incident retention — CI #1807 STARTING

- head `81c0a7f84dfd8e2d9648dd09b0dd34b19bf878b4`;
- 5-file diff limited to Incident Packet retention, inventory proof and tests;
- dashboard/Sentinel tests already SUCCESS on #1807;
- new registries are trusted by construction; legacy registries without metadata remain `historyTrusted:false`;
- open high/critical incidents are protected from nominal retention;
- closed/noncritical entries are pruned first;
- hard-cap overflow of high/critical incidents is persisted as `criticalOverflow` and permanently makes completeness false;
- inventory proof must read every item the registry declares stored.

BLOCKER 2 remains unresolved for runtime. Even if #13/#14 turn green, activation must remain a separate change and requires:

- #13/#14 exact-head CI green;
- independent Claude Code + Codex review of #11-#14;
- separate activation wiring review + exact-head CI;
- no implicit trust upgrade for legacy incident history;
- transactional executor/rollback preserved;
- full production Release Guardian GO still mandatory for production release/deploy;
- no unrelated high/critical incident can ever be excluded.

Until a separate activation PR satisfies those conditions, current runtime HOLD behavior remains authoritative.

## RESOLVED EVIDENCE — PR #8 exact-head CI

- head `4506c9951ce3fbdc7fef1faa7488c0eb5983564a`;
- base #7 `2c4501b9e0aeba7ede062b520ef77b8b431907aa`;
- CI #1799: COMPLETED SUCCESS;
- mergeable;
- exactly 10 intended mobile/release files above #7.

Validated: mobile network-first SW confined to explicit mobile assets; `/api/*` never cached; fail-closed public release evidence; hexadecimal commit refs; non-weakenable 12-character proof floor shared by public probe and release-recorder; expectation-keyed in-flight/cache semantics; `STALE_EXPECTATION` rejection; dashboard/Sentinel, AUTHZ and full workflow green.

## RESOLVED EVIDENCE — PR #10 Mobile Pilot entry

- head `75acace7dc476ff627b846c6a092591a33625cad`;
- base #8 `4506c9951ce3fbdc7fef1faa7488c0eb5983564a`;
- CI #1801: COMPLETED SUCCESS;
- mergeable;
- exactly 2 files / 0 deletions; one navigation-only link `/mobile.html` + test.

## RESOLVED EVIDENCE — PR #9 exact-head CI

- head `fee5a8fc4ee53ea7ac709a29e706f1d0e3b4cf37`;
- CI #1791: COMPLETED SUCCESS;
- AUTHZ, full E2E, production artifact gates and preview SUCCESS;
- `profileLocalId` remains closure-private and absent from public passion API/telemetry;
- concurrent `PassioReleaseGuard.check()` calls share one in-flight Promise.

## BLOCKER 3 — Production public release evidence must be configured and fresh

PR #8 makes `PASSIO_PUBLIC_URL/release.json` part of production release health. Before production release:

- `PASSIO_PUBLIC_URL` configured to the real public origin;
- public `release.json` reachable with no-store/no-cache semantics;
- expected commit matches public manifest with strong prefix proof;
- expected buildId, when used, comes from a local manifest tied to the same commit/proof floor;
- cached proof aligns to CURRENT expectation pair;
- NOT_CONFIGURED / UNKNOWN / UNAVAILABLE / MISMATCH / STALE_EXPECTATION never count as PASS/LIVE.

## HARDENING TRACK — Node runtime upgrade

Current CI still installs Node 20. GitHub Actions/Supabase dependencies emit deprecation/engine warnings. Keep Node 22+ migration separate until current release stacks stabilize, then require full exact-head CI.

One high-severity npm warning was also observed during Playwright install, but no package-level audit evidence is currently available; do not classify or waive it without an actual audit result.

## Friday invariant

No blocker is cleared by assumption, age of a previous run, PR mergeability, or majority opinion. Clear only with current evidence on the exact head being merged/deployed.
