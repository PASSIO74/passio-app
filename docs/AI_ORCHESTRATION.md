# Passio — AI orchestration policy

## Directive active — 2026-08-21

The Passio AI fusion/orchestration system must use **Claude Fable 5** as the primary Claude model for Claude Code whenever it is available through the owner's Claude Max subscription.

### Roles

- **ChatGPT (GPT-5.6 Sol)**: product lead, architecture, orchestration, prioritization, synthesis and final decision support.
- **Claude Code + Claude Fable 5**: primary implementation and long-horizon agentic development engine for the Passio repository.
- **Codex**: independent technical counter-review, code review, tests, security checks and verification of Claude Code changes.
- **Lovable / Base44**: use only when they are the best fit for interactive prototyping, UI exploration or app-building experiments. They do not replace the main implementation path by default.

### Model selection rule

1. Prefer **Claude Fable 5** for Claude Code tasks.
2. Use the Claude Max subscription allowance before pay-as-you-go usage credits.
3. Do not downgrade to another Claude model unless Fable 5 is unavailable, its included limit has been reached, compatibility requires it, or another model is demonstrably better for the specific task.
4. If a fallback model is used, make that fallback visible in the execution report.
5. Keep Codex as an independent review path rather than duplicating Claude Code blindly.

### Operational requirement

Claude Code must be version **2.1.170 or later** to use Fable 5.

### Passio governance

All AI-driven modifications remain subject to Passio governance requirements: Centre de pilotage visibility, Sentinelle monitoring, traceability, tests, rollback strategy, feature flags / kill switches where relevant, and verification against the latest real deployed Passio version before modification.
