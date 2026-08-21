# PASSIO — Phone-only AI workflow

Goal: operate PASSIO entirely from a phone while keeping ChatGPT as the orchestration entry point and Claude Code as a real execution agent.

## How ChatGPT addresses Claude Code

There is **no direct pipe** between ChatGPT and Claude Code. GitHub is the transport.
An order only reaches Claude Code if it carries one of the three markers below.
Anything else stays an open issue that nobody executes — silently, with no failure signal.

| Marker | Where | Mode | Use for |
|---|---|---|---|
| `@claude` | issue body/title, or any issue/PR comment | conversation | questions, follow-ups, review replies |
| `[CLAUDE CODE]` | **start of the issue title** | execution | a scoped task order |
| label `claude` | on the issue | execution | promoting an existing issue to an order |

Both execution markers make Claude read the issue, implement on a `claude/*` branch, and open a pull request.

Authorized authors: `PASSIO74` and the ChatGPT GitHub connector (`chatgpt-codex-connector[bot]`).
An issue opened by anyone else never triggers Claude Code.

> **Incident 2026-08-21.** Before this was documented, the workflow accepted only
> `@claude`. The real orders written by ChatGPT (issues #68, #69, #73 — including the
> PERF-IOS project) contained no such string, so six consecutive triggers ended as
> `skipped`. The plumbing was green; the orders were never executed. Marker discipline
> is the load-bearing part of this workflow, not a formality.

## Flow

1. Benjamin sends a PASSIO task in ChatGPT on mobile.
2. ChatGPT translates the task into a scoped GitHub issue whose title starts with `[CLAUDE CODE]`.
3. GitHub Actions runs `anthropics/claude-code-action@v1` on a hosted runner.
4. Claude Code reads `AGENTS.md` and `CLAUDE.md`, implements the change, and works on a `claude/*` branch.
5. Claude Code creates or updates a pull request.
6. ChatGPT and/or Codex review the diff and CI.
7. The PR is merged only after checks are acceptable.

## Checking that an order actually ran

An order that produced no pull request should be checked in
**Actions → Claude Code**, not assumed to be in progress:

- `skipped` — the marker was missing. Re-issue with `[CLAUDE CODE]` or add the `claude` label.
- `failure` — the run started and broke. Read the job log.
- no run at all — the author was not authorized, or the issue was never created.

## One-time phone setup

The repository must have an Actions secret named `ANTHROPIC_API_KEY`. Never commit the key to the repository or paste it into an issue/PR.

The workflow uses GitHub's automatically generated `GITHUB_TOKEN` for repository operations, so no local computer or persistent terminal session is required.

## Agent truthfulness

Every result must state which agents actually ran:

- ChatGPT: orchestration/specification/review
- Claude Code: only marked used when the GitHub Action actually executed Claude
- Codex: only marked used when an independent Codex execution/review actually occurred
- GitHub: repository/PR/CI transport and source of truth

A `skipped` workflow run is **not** an execution. Never report a task as done on the
strength of an issue having been created.
