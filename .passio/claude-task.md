# PASSIO Cloud Dev E2E probe

Goal: prove Claude Code can execute remotely in GitHub Actions with the user's computer off.

Task:
1. Read AGENTS.md and CLAUDE.md first.
2. Create exactly one file: `.passio/reports/CLOUD_DEV_E2E_PROBE.md`.
3. The file must contain:
   - title `# PASSIO Cloud Dev E2E Probe`
   - the current branch name
   - the Claude Code version if available
   - a short statement that no application file was changed
4. Do not modify any application file, configuration file, workflow, secret, migration, database, auth, deployment, or existing report.
5. Do not commit, push, merge, switch branches, or deploy. The workflow persists changes.
6. Run `git diff --check` and `git status --short` only if permitted.
7. Stop after creating the single probe report.
