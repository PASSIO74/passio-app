# PASSIO — AI Operating System

This document is the canonical operating model for AI-assisted PASSIO development.

## 1. Source of truth

GitHub is the technical source of truth for PASSIO: `main`, branches, pull requests, reviews, CI results and merge history.

No AI agent may treat a local working tree, an old PR, a prototype, a chat transcript or a cached build as more authoritative than the current `main` branch.

Before any implementation, confirm the task starts from the latest real `main` and that the target application/screens match the current validated PASSIO version.

## 2. Roles

### ChatGPT — orchestrator

ChatGPT owns product direction, architecture, prioritization, specifications, acceptance criteria, AI task routing, cross-review and final arbitration.

### Claude Code — primary implementation engine

Claude Code is the primary development agent. The preferred channel is remote execution through GitHub, not a persistent local computer session.

Rules:
- work from current `main`;
- one coherent task = one isolated branch = one PR;
- never push directly to `main`;
- run relevant checks;
- report branch, commit, tests and PR;
- use the Claude subscription OAuth channel configured by the repository;
- the user's personal computer must not be required for normal remote implementation.

### Codex — independent technical counter-review

Codex is used for independent review of diffs, tests, regressions, architecture, security and performance. Sensitive changes require an independent technical review before merge.

### Lovable — rapid UX/product prototyping

Use Lovable for interactive UX concepts, fast interface iterations and user-flow exploration. A Lovable prototype is not production truth and must be translated into a reviewed GitHub implementation before entering PASSIO.

### Base44 — exploration laboratory

Use Base44 for alternative concepts, parallel experiments and internal-tool exploration. Experiments must not bypass GitHub review or PASSIO product guardrails.

### ChatGPT Work — long-running orchestration layer

Use ChatGPT Work for multi-step analyses, long-form project coordination and durable deliverables. Work does not replace GitHub as the code source of truth.

## 3. PASSIO product priority

Every material product decision must strengthen the core promise:

**Découvrir / Partager / Rencontrer (IRL)**

The primary product loop is:

**Feed → interaction → IRL**

Features that distract from this loop must be simplified, demoted or isolated. The travel diary / CDV remains secondary under the travel passion vertical.

## 4. Centre de pilotage + Sentinelle

All meaningful PASSIO changes must become visible and traceable through the Centre de pilotage and Sentinelle whenever technically relevant.

This includes:
- features and releases;
- events and metrics;
- incidents and errors;
- feature flags and kill switches;
- rollback/recovery actions;
- AI-agent activity;
- tests and CI status;
- deployments;
- security-sensitive changes;
- corrective actions and recurrence prevention.

The Centre de pilotage must remain usable from mobile.

The Sentinelle should detect, diagnose and remediate safe classes of incidents automatically, while preserving auditability, rollback and explicit safety boundaries.

## 5. Required workflow

1. Idea or user need.
2. ChatGPT frames product outcome, scope and acceptance criteria.
3. Lovable/Base44 prototype only when rapid UX exploration is useful.
4. Specification is anchored in GitHub.
5. Claude Code implements on an isolated branch from current `main`.
6. CI runs; Codex/ChatGPT perform cross-review proportional to risk.
7. Merge only when checks and review are satisfactory.
8. Centre de pilotage / Sentinelle visibility is verified where applicable.
9. The merged `main` becomes the new baseline for every agent.

## 6. Risk classes

### Normal

Localized feature work, visual changes, non-sensitive refactors and low-risk fixes may merge after relevant CI and review.

**Standing UI release rule (Benjamin, 2026-08-26):** when Benjamin explicitly validates a normal-risk visual or product-interface lot, that product validation also authorizes squash merge and the normal Git-connected production deployment after green review and CI. A second authorization for the same merge/deploy is unnecessary. The branch/PR workflow, recovery controls and post-deploy verification are still required.

### Critical

Authentication, authorization/RLS, migrations, security, deployment, destructive data operations, agent permissions, secrets, production writes and automatic remediation require stricter review and explicit rollback thinking.

Critical changes must not be auto-merged blindly. The standing UI release rule does not apply to authentication, authorization/RLS, migrations, security controls, secrets, destructive or production data writes, agent permissions, automatic remediation, or deployment-infrastructure changes; those still require specific explicit authorization and independent review.

## 7. Remote Claude Code channel

The canonical remote path is:

**ChatGPT / GitHub issue → GitHub Actions → Claude Code → isolated branch → commit → PR → CI/review → merge**

The workflow must fail explicitly if Claude runs but does not produce the expected branch/diff/PR.

Authentication policy is subscription-only through `CLAUDE_CODE_OAUTH_TOKEN`; paid Anthropic API-key fallback is not part of the normal PASSIO channel.

## 8. Model policy

The remote Claude Code channel attempts `claude-fable-5` first and configures `claude-opus-5` as the native CLI fallback. The native fallback is a resilience mechanism for model overload; it is not a paid-credit bypass and must not be presented as one.

Temporary incident rule (2026-08-21): while Anthropic issue #83900 causes
`claude setup-token` sessions to request Fable 5 but initialize Sonnet 5, the
remote channel forces the already-authorized `claude-opus-5` fallback. This
exception ends only after an OAuth canary proves `claude-fable-5` in the real
`system/init` event. The workflow must block publication when that event is
missing, when the model is outside Fable 5 / Opus 5, or when `apiKeySource` is
not the subscription-token value `none` observed with the current CLI.

If the Claude subscription quota is exhausted, the run must fail explicitly. PASSIO must never introduce `ANTHROPIC_API_KEY` or another metered API credential as a silent fallback.

Model selection must never weaken repository security, branch isolation, test requirements or review gates. The actual model used must be reported from execution evidence rather than assumed from policy text.

## 9. Non-negotiable merge gates

Before merge, verify at least:
- branch was based on current `main` or intentionally rebased;
- diff is scoped to the task;
- no secret/user data is committed;
- relevant CI/tests are green;
- critical changes received independent review;
- production-impacting changes have rollback/kill-switch thinking where relevant;
- PASSIO product direction remains coherent with Feed → IRL;
- Centre de pilotage/Sentinelle instrumentation is present when relevant.

## 10. Continuous improvement

Every incident or failed AI run should improve the system: document the root cause, add a guard/test where practical and prevent silent recurrence.

The objective is not maximum autonomy at any cost; it is maximum useful autonomy with evidence, isolation, traceability and safe recovery.
