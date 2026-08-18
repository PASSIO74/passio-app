# PASSIO — Node20 Stuck Exact-Head Evidence Matrix

Prepared 2026-08-18. Purpose: give Claude Code/Codex precise evidence for resolving the old Node20 stuck workflows #14/#15/#18/#19 without ever relabeling those historical runs as SUCCESS.

Reference descendant used for comparison: PR #29 head `b332f44314d7a2a00ede60bcd1b6d04020a59384`, based transitively on the full canonical Sentinel stack and executing under Node22.

## Rule

A historical run that is `in_progress`/stuck is NOT green. This document only proves whether the files introduced/modified by that PR remain byte/tree-identical in the later Node22-tested descendant or were subsequently changed.

A descendant green run is supporting evidence, not a rewrite of GitHub history.

---

## PR #14 — durable incident retention proof

Head: `81c0a7f84dfd8e2d9648dd09b0dd34b19bf878b4`
Historical CI: #1807 stuck in old Node20 workflow.

Files changed by #14:

- `dashboard/server/incident-packets.js`
- `dashboard/server/sentinel-incident-inventory.js`
- `dashboard/test/incident-retention-legacy.test.js`
- `dashboard/test/incident-retention.test.js`
- `dashboard/test/sentinel-incident-inventory.test.js`

GitHub compare #14 head -> #29 head reports NONE of those five files as changed afterward.

Evidence classification: `DELTA_IDENTICAL_IN_NODE22_DESCENDANT`.

Meaning: the exact #14 implementation + its exact focused tests are inherited unchanged by the later Node22 stack. This is strong evidence for the final merged state, but CI #1807 itself remains non-success and must not be called green.

---

## PR #15 — causal repair context

Head: `f46211767bf9a0f50aeb8cbad1c9b1e23eb8dbbc`
Historical CI: #1808 stuck in old Node20 workflow.

Files changed by #15:

- `dashboard/server/sentinel-autopilot-bootstrap.js`
- `dashboard/test/sentinel-autopilot-bootstrap.test.js`

GitHub compare #15 head -> #29 head reports BOTH files modified afterward.

Evidence classification: `DELTA_SUPERSEDED_BY_DESCENDANT`.

The later convergence #19 intentionally modifies the bootstrap/evidence flow to seal canonical diagnosis evidence and avoid an ESM cycle. Therefore the final stack does not contain byte-identical #15 code; it contains the reviewed/refined descendant semantics.

Friday implication: do not use Node22 descendant success as proof that CI #1808 was exact-head green. Instead review whether #15 is an intermediate stacked step that can be merged safely without deployment, or whether merge strategy should be adjusted so the final reviewed #19 state is what matters. This is a merge-policy/review decision, not a CI-history rewrite.

---

## PR #18 — explicit V2 opt-in, OFF by default

Head: `38380469ffb930d9bf2c23aa0db48c54cdfa2ccd`
Historical CI: #1811 stuck in old Node20 workflow.

Files changed by #18:

- `dashboard/server/sentinel-autopilot.js`
- `dashboard/test/sentinel-autopilot.test.js`

GitHub compare #18 head -> #29 head reports NEITHER file as changed afterward.

Evidence classification: `DELTA_IDENTICAL_IN_NODE22_DESCENDANT`.

Meaning: the exact #18 opt-in wiring and its focused tests are inherited unchanged by later Node22-tested descendants. `DASH_SENTINEL_LOCAL_GATE_V2` remains OFF by default. CI #1811 still must not be labeled success.

---

## PR #19 — fresh canonical evidence V2 convergence

Head: `c4816e997508e44d62cbe24a9efd63e557e5a20d`
Historical CI: #1818 stuck in old Node20 workflow after #1817 exposed a propagation bug on the prior head and the current head fixed it.

Files changed by #19:

- `dashboard/server/sentinel-autopilot-bootstrap.js`
- `dashboard/server/sentinel-local-gate-evidence.js`
- `dashboard/server/sentinel-local-promotion-evidence.js`
- `dashboard/test/sentinel-autopilot-bootstrap.test.js`
- `dashboard/test/sentinel-local-gate-evidence.test.js`

GitHub compare #19 head -> #29 head reports NONE of those five files as changed afterward.

Evidence classification: `DELTA_IDENTICAL_IN_NODE22_DESCENDANT`.

Meaning: the exact corrected #19 implementation and exact focused tests are inherited unchanged by the Node22 descendants. This is strong evidence supporting #19 as canonical convergence and supports review of #17 as superseded. CI #1818 itself remains historically stuck and must not be called success.

---

## Node22 descendant evidence

Known exact-head Node22 successes before #29:

- #21 / CI #1820 SUCCESS — introduced Node22 runtime across tests/preview/production jobs and exercised inherited #19 stack;
- #23 / CI #1822 SUCCESS;
- #24 / CI #1826 SUCCESS;
- #26 / CI #1830 SUCCESS;
- #27 / CI #1831 SUCCESS;
- #28 / CI #1832 SUCCESS.

#29 exact-head CI must be re-queried; do not use this document to assume its result.

---

## Friday decision framework

Claude Code and Codex should independently classify each old stuck PR using this matrix plus current code/tests:

1. `ACCEPT_DESCENDANT_EXACT_DELTA_EVIDENCE` — only where the PR's own changed files are demonstrably unchanged and exercised by later exact-head Node22 success;
2. `REQUIRE_FRESH_REVALIDATION` — if evidence is insufficient or a relevant semantic dependency changed;
3. `INTERMEDIATE_SUPERSEDED_STATE` — for #15, whose own files were intentionally changed by #19, requiring an explicit stacked-merge strategy rather than pretending #1808 passed.

For #14/#18/#19, the current repository evidence supports category 1 strongly, subject to independent review. For #15, category 3 is the accurate description unless a fresh exact reconstruction is run.

No category changes the historical GitHub conclusion of #1807/#1808/#1811/#1818.
