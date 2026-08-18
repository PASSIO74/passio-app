# PASSIO Continuous Handoff — 2026-08-18 20:45 Europe/Paris

## Canonical Sentinel/mobile stack

Expected order if every exact-head proof, review and governance gate is satisfied:
#3 -> #5 -> #6 -> #7 -> #8 -> #10 -> #11 -> #12 -> #13 -> #14 -> #15 -> #16 -> #18 -> #19 -> #21 -> #23 -> #24.

Parallel product/integrity stack: #4 -> #9.

## Current proven milestones

- #11 exact CI SUCCESS.
- #12 exact CI SUCCESS.
- #13 exact CI SUCCESS.
- #16 exact CI SUCCESS.
- #21 Node 22 validation: tests, Sentinel, AUTHZ, E2E and preview SUCCESS; production job skipped on PR as expected.
- #23 transaction lock: tests, Sentinel, AUTHZ, E2E and preview SUCCESS; production job skipped on PR as expected.
- #20 closed without merge as superseded by #23.

## Runs still requiring exact conclusion

- #14 Node 20-era exact run remained stuck during Playwright install after Sentinel tests passed.
- #15 same infrastructure symptom.
- #18 same infrastructure symptom.
- #19 retry exact run remained stuck during Playwright install after Sentinel tests passed; previous #19 run had one real policy-metadata failure that was fixed in the current head. Do not call #19 exact-green until its exact-head evidence is conclusive.
- #24 CI started and passed static audits + Sentinel tests; at this handoff it is still in Playwright installation. Do not close #22 until #24 is exact-green and reviewed.

## Runtime conclusion from Node 22 evidence

#21 and #23 prove the current canonical code can complete Playwright, AUTHZ, E2E and preview under Node 22. This strongly indicates the long Node 20 runs are infrastructure/runtime-era stalls, but exact-head policy still applies: inherited green evidence does not silently rewrite the historical exact-run verdict.

## #24 integrated promotion journal

Branch: `feat/sentinel-promotion-journal-integrated`, based on #23.

Properties:
- actually called by `executeAutopilotPromotion()`;
- bounded persistence with configured retention clamped 20..1000, default 200;
- stores incidentId/diagnosisId, repair branch/SHA, before/after SHA, status, attempted/ok/rollback, bounded reason, suite name+boolean, Guardian timing when available, duration;
- does NOT persist lock token;
- does NOT persist raw suite detail/logs;
- does NOT persist diagnosis prose, patches or secrets;
- snapshot says productionDeploy false, runtimeActivation false;
- no authority or permission increase.

## Superseded branches

- #20 CLOSED, superseded by #23.
- #17 remains open until #19 exact proof is conclusive, then close without merge if convergence remains valid.
- #22 remains open until #24 exact CI + independent review are conclusive, then close without merge.

## Hard blockers

1. `main` required status checks/ruleset are not proven ENFORCED. No merge to main.
2. Independent Claude Code and Codex reviews not yet completed. No merge authorization.
3. `DASH_SENTINEL_LOCAL_GATE_V2` remains OFF.
4. Legacy incident history remains untrusted without separate audited baseline certificate.
5. Multi-instance V2 requires proven single-instance operation or durable distributed lease; process-local lock is insufficient.
6. Production deploy separately requires fresh public release proof + full production Guardian evidence.

## Friday review material added

- `.passio/FRIDAY_REVIEW_ADDENDUM_2026-08-18.md`
- `.passio/SENTINEL_LEGACY_INCIDENT_BASELINE_PROTOCOL.md`

## Next exact actions

1. Re-query #24 run to conclusion. Fix only an exact failing cause; never weaken tests.
2. If #24 exact-green, update PR body and close #22 as superseded only after code review confirms journal privacy/integration.
3. Re-query #14/#15/#18/#19. If historical Node 20 jobs remain indefinitely stuck, document them as inconclusive rather than green; do not fabricate exact-head success.
4. Re-query `main` protection/ruleset enforcement before every merge decision.
5. Friday: independent Claude Code and Codex review using original prompts + addendum; reconcile by evidence.
6. Keep merge GO separate from production deploy GO.
