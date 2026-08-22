# PASSIO — Shared AI Collaboration Rules

This repository is the shared source of truth for PASSIO work performed by ChatGPT, Claude Code, Codex, Lovable, Base44 and human contributors.

The canonical collaboration model is documented in `docs/PASSIO_AI_OPERATING_SYSTEM.md`. If a chat instruction, prototype, stale branch or older document conflicts with the current repository state, current `main` plus this operating model wins unless Benjamin explicitly changes the rule.

## Operating model

- **ChatGPT**: product direction, architecture, specifications, prioritization, task routing, acceptance criteria, cross-checking and final arbitration.
- **Claude Code**: primary implementation agent. Preferred execution is remote through GitHub Actions. It edits an isolated task branch, runs relevant checks, commits, pushes that branch and opens a PR. The user's computer is not required for the normal remote path.
- **Codex**: independent technical review, debugging, test design, security/performance review and targeted implementation when it is the best tool for the task.
- **Lovable**: rapid UX/product prototyping and interactive concept validation. Its output is exploratory until translated into reviewed GitHub code.
- **Base44**: alternative-product experiments, internal-tool exploration and parallel concept testing. It never bypasses GitHub review.
- **ChatGPT Work**: long-running orchestration for multi-step analysis and durable deliverables. It does not replace GitHub as code source of truth.
- **GitHub**: canonical technical state for code, branches, commits, pull requests, reviews, CI results and merge history.
- **Centre de pilotage + Sentinelle**: operational visibility, incident detection, safe remediation, rollback/kill-switch visibility and mobile supervision for relevant PASSIO changes.

## Non-negotiable Git workflow

1. Never develop directly on `main`.
2. One coherent task = one branch = one pull request.
3. Branch from an up-to-date `main`.
4. Confirm the code/branch being modified corresponds to the latest real PASSIO baseline before implementation.
5. Use branch prefixes appropriate to the task (`feat/`, `fix/`, `chore/`, `docs/`, `test/`, `refactor/`, `security/`, or the controlled `claude/` remote-agent prefix).
6. Claude Code must push its task branch, not `main`.
7. Every code change reaches `main` through a pull request.
8. Review the diff and CI before merge.
9. Critical changes (auth, RLS, migrations, security, deployment, destructive data operations, agent permissions, secrets, production writes, automatic remediation) require an independent second review before merge.
10. Do not mix unrelated work from concurrent agents in the same commit or PR.
11. Do not bypass a red CI check to ship faster.
12. A remote AI run that produces no expected branch/diff/PR must fail explicitly rather than appearing successful.

## PASSIO product guardrails

- Core values: **Découvrir / Partager / Rencontrer (IRL)**.
- Core promise: **share your Passio and meet people**.
- Product decisions prioritize the direct **Feed → interaction → IRL** path.
- Features that blur this promise should be reduced, moved or isolated from the core experience.
- The travel diary / CDV belongs to the **Passio: Voyage** vertical rather than the core application.
- Simplicity, clarity and immediate comprehension take priority over feature accumulation.

## Centre de pilotage + Sentinelle rule

For every meaningful change, explicitly decide whether Centre de pilotage / Sentinelle integration is relevant. When relevant, connect the change to appropriate telemetry, events, metrics, incidents, tests, feature flags, rollback/kill-switch controls, diagnostics and action history.

The system must remain visible and usable from mobile for the owner.

Safe incident classes should be diagnosed and remediated automatically where appropriate, with auditability and recurrence prevention. Unsafe or destructive actions must remain behind explicit safety boundaries.

## Before implementation

The task or PR description should make the following explicit:

- user outcome;
- acceptance criteria;
- product scope and non-goals;
- likely files/systems touched;
- risk level (`normal` or `critical`);
- implementation agent;
- review agent(s);
- whether Centre de pilotage/Sentinelle instrumentation or controls are required.

For ambiguous product decisions, ChatGPT should resolve the specification before implementation. For a localized technical bug with clear expected behavior, Claude Code may investigate and implement directly, documenting the root cause in the PR.

## During implementation

- Respect `CLAUDE.md`, `docs/PASSIO_AI_OPERATING_SYSTEM.md` and repository-specific invariants.
- Keep changes minimal and task-scoped.
- Preserve existing tests; add regression coverage for fixed bugs where practical.
- Never commit secrets, tokens, `.env` files, production credentials or user data.
- Avoid destructive database operations unless explicitly required and reviewed as critical.
- When multiple agents work concurrently, use separate branches/worktrees and avoid shared uncommitted state.
- Report the actual model/tool used when execution evidence exposes it; do not invent a model name from policy text.

## Required checks before merge

At minimum, rely on the repository CI and run the relevant local/remote checks for the touched area. Existing CI includes static audits, Playwright authorization coverage, the complete Playwright suite, build and PR preview deployment where applicable.

For security-sensitive or architecture-heavy PRs, add an independent Codex or ChatGPT review even if CI is green.

For production-impacting work, verify rollback/recovery and kill-switch strategy where relevant.

## Pull request handoff

Every PR should state:

- what changed and why;
- which AI/tool implemented it;
- which AI/tool reviewed it;
- tests/checks run;
- known risks or follow-ups;
- Centre de pilotage/Sentinelle impact when relevant;
- screenshots/preview when UI changed.

The merge is the handoff point. After merge, all agents must treat the updated `main` branch as the new canonical baseline.