# PASSIO — Phone-only AI workflow

Goal: operate PASSIO entirely from a phone while keeping ChatGPT as the orchestration entry point and Claude Code as a real execution agent.

## Authentication policy: subscription-only

PASSIO runs Claude Code on **Benjamin's Claude Pro subscription**, never on a
metered Anthropic API key. The single credential is an OAuth token produced by
`claude setup-token`, stored as the Actions secret `CLAUDE_CODE_OAUTH_TOKEN`.

`.github/actions/claude-auth-guard` enforces this before any token is spent. It
prints one of two verdicts and never prints the secret itself:

- `AUTH = CLAUDE PRO OAUTH` — the subscription token is installed and well formed.
- `AUTH = ANTHROPIC API` — a metered key was found; the job **refuses to run**.

This policy exists because of a measured failure: on 2026-08-21 run 32364661774
died on `Credit balance is too low` while the model (`claude-opus-5`) and the
authentication were both correct. Billing, not configuration, was the blocker.
An unfunded API key looks exactly like a broken setup — the subscription path
removes that whole class of confusion.

`secrets.PASSIO` and `secrets.ANTHROPIC_API_KEY` are no longer read by any
Claude workflow. They are left in place, unused, rather than deleted.

## Flow

1. Benjamin sends a PASSIO task in ChatGPT on mobile.
2. ChatGPT turns the task into a scoped GitHub issue and **applies the `claude` label**.
3. `.github/workflows/claude-code.yml` runs `anthropics/claude-code-action@v1` on a hosted runner, authenticated with the subscription token.
4. Claude Code reads `AGENTS.md` and `CLAUDE.md`, checks it is on the latest `main`, implements the change on a `claude/*` branch.
5. Claude Code opens or updates a pull request and comments the issue with the PR link, the files touched and the checks actually run.
6. ChatGPT and/or Codex review the diff and CI.
7. The PR is merged only after checks are acceptable.

No Windows PC is involved once the token is installed. The local worker
(`dashboard/aiworker.mjs`, branches `ai/request/*`) is a separate, optional path
that requires a machine to be awake; it is not the primary channel.

## Triggering

| Path | How | Why |
|---|---|---|
| **Label `claude`** (nominal) | Apply the `claude` label to an issue authored by PASSIO74 | A label cannot be misspelled. Issues #68, #69 and #73 were never executed because their text lacked the exact string `@claude`, and runs 9–14 exited `skipped` — a status visually indistinguishable from success. |
| `@claude` (fallback) | Put `@claude` in the issue title/body or in a comment | Kept for continuity with existing issues. |

Every path additionally requires the author to be `PASSIO74`.

## One-time setup (needs an interactive machine, once)

On a computer where Benjamin is signed in to Claude Code with his Pro subscription:

```bash
claude auth status     # expect: "authMethod": "oauth_token"
claude setup-token     # opens a browser, prints a long-lived token
```

Copy the token straight into GitHub → **Settings → Secrets and variables →
Actions → New repository secret**, named exactly `CLAUDE_CODE_OAUTH_TOKEN`.

Never paste it into a terminal transcript, an issue, a PR, a commit, a chat
message, or a log. `claude setup-token` cannot be run from a headless CI runner
or a remote agent session: it needs a TTY and a browser.

## Failure is loud, never silent

Two mechanisms exist so that "nothing happened" can never look like success:

- **Execution proof** — the job fails if Claude produced no `claude/*` branch.
  A green run of a few seconds used to mean `No trigger found, skipping
  remaining steps`; that now turns the run red.
- **Explicit feedback** — on any failure, the workflow comments on the issue or
  PR with the auth verdict and the run URL. That comment is the return channel
  ChatGPT reads.

## Agent truthfulness

Every result must state which agents actually ran:

- ChatGPT: orchestration/specification/review
- Claude Code: only marked used when the GitHub Action actually executed Claude
- Codex: only marked used when an independent Codex execution/review actually occurred
- GitHub: repository/PR/CI transport and source of truth
