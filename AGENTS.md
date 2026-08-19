# PASSIO — Shared AI Collaboration Rules

This repository is the shared source of truth for PASSIO work performed by ChatGPT, Claude Code, Codex, and human contributors.

## Operating model

- **ChatGPT**: product direction, architecture, specifications, orchestration, acceptance criteria, and cross-checking.
- **Claude Code**: primary local implementation agent. It edits the working tree, runs the relevant checks, commits, and pushes feature branches.
- **Codex**: independent technical review, debugging, test design, security/performance review, and targeted implementation when it is the best tool for the task.
- **GitHub**: canonical state for code, branches, commits, pull requests, reviews, CI results, and merge history.

## Non-negotiable Git workflow

1. Never develop directly on `main`.
2. One coherent task = one branch = one pull request.
3. Branch from an up-to-date `main`.
4. Use branch prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `refactor/`, `security/`.
5. Claude Code must push its task branch, not `main`.
6. Every code change reaches `main` through a pull request.
7. Review the diff and CI before merge.
8. Critical changes (auth, RLS, migrations, security, deployment, destructive data operations) require an independent second review before merge.
9. Do not mix unrelated work from concurrent agents in the same commit or PR.
10. Do not bypass a red CI check to ship faster.

## PASSIO product guardrails

- Core promise: **share your Passio and meet people**.
- Product decisions prioritize the direct **Feed → interaction → IRL** path.
- Features that blur this promise should be reduced, moved, or isolated from the core experience.
- The travel diary / CDV belongs to the **Passio: Voyage** vertical rather than the core application.

## Before implementation

The task or PR description should make the following explicit:

- user outcome;
- acceptance criteria;
- product scope and non-goals;
- likely files/systems touched;
- risk level (`normal` or `critical`);
- implementation agent;
- review agent(s).

For ambiguous product decisions, ChatGPT should resolve the specification before implementation. For a localized technical bug with clear expected behavior, Claude Code may investigate and implement directly, documenting the root cause in the PR.

## During implementation

- Respect `CLAUDE.md` and repository-specific invariants.
- Keep changes minimal and task-scoped.
- Preserve existing tests; add regression coverage for fixed bugs where practical.
- Never commit secrets, tokens, `.env` files, production credentials, or user data.
- Avoid destructive database operations unless explicitly required and reviewed as critical.
- When multiple agents work concurrently, use separate branches/worktrees and avoid shared uncommitted state.

## Required checks before merge

At minimum, rely on the repository CI and run the relevant local checks for the touched area. Existing CI includes static audits, Playwright authorization coverage, the complete Playwright suite, build, and PR preview deployment.

For security-sensitive or architecture-heavy PRs, add an independent Codex or ChatGPT review even if CI is green.

## Pull request handoff

Every PR should state:

- what changed and why;
- which AI/tool implemented it;
- which AI/tool reviewed it;
- tests/checks run;
- known risks or follow-ups;
- screenshots/preview when UI changed.

The merge is the handoff point. After merge, all agents must treat the updated `main` branch as the new canonical baseline.
