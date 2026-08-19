# PASSIO — Phone-only AI workflow

Goal: operate PASSIO entirely from a phone while keeping ChatGPT as the orchestration entry point and Claude Code as a real execution agent.

## Flow

1. Benjamin sends a PASSIO task in ChatGPT on mobile.
2. ChatGPT translates the task into a scoped GitHub issue containing `@claude`.
3. GitHub Actions runs `anthropics/claude-code-action@v1` on a hosted runner.
4. Claude Code reads `AGENTS.md` and `CLAUDE.md`, implements the change, and works on a `claude/*` branch.
5. Claude Code creates or updates a pull request.
6. ChatGPT and/or Codex review the diff and CI.
7. The PR is merged only after checks are acceptable.

## One-time phone setup

The repository must have an Actions secret named `ANTHROPIC_API_KEY`. Never commit the key to the repository or paste it into an issue/PR.

The workflow uses GitHub's automatically generated `GITHUB_TOKEN` for repository operations, so no local computer or persistent terminal session is required.

## Agent truthfulness

Every result must state which agents actually ran:

- ChatGPT: orchestration/specification/review
- Claude Code: only marked used when the GitHub Action actually executed Claude
- Codex: only marked used when an independent Codex execution/review actually occurred
- GitHub: repository/PR/CI transport and source of truth
