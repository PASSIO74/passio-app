# Passio — AI orchestration policy

## Directive active — 2026-08-21

The Passio AI fusion/orchestration system must select the strongest appropriate Claude model that is currently available through the owner's Claude Max subscription, rather than locking Claude Code to one model permanently.

### Roles

- **ChatGPT (GPT-5.6 Sol)**: product lead, architecture, orchestration, prioritization, synthesis and final decision support.
- **Claude Code**: primary implementation and long-horizon agentic development engine for the Passio repository, using the dynamic model ladder below.
- **Codex**: independent technical counter-review, code review, tests, security checks and verification of Claude Code changes.
- **Lovable / Base44**: use only when they are the best fit for interactive prototyping, UI exploration or app-building experiments. They do not replace the main implementation path by default.

### Dynamic Claude model selection rule

For each Claude Code task, select models according to availability and included Max capacity in this order:

1. **Claude Fable 5** — first choice whenever available and usable.
2. **Claude Opus 5** — automatic fallback when Fable 5 is unavailable, temporarily limited, quota-constrained, or unsuitable for the task.
3. **Best remaining Claude model available in the Max subscription** — choose the highest-capability suitable model currently available rather than stopping execution.
4. Continue down the available Claude model ladder as needed so work can proceed without unnecessary interruption.

### Operating principles

- Availability, remaining Max allowance, compatibility and task suitability determine the active Claude model.
- Prefer usage included in the Claude Max subscription before any pay-as-you-go or extra-credit usage.
- A temporary limit on one model must trigger the next suitable model automatically rather than blocking Passio work.
- When a higher-priority model becomes available again, it may become the preferred model for the next suitable task.
- Record the Claude model actually used in execution reports so the Centre de pilotage can show which AI performed each change.
- Keep Codex as an independent review path rather than duplicating Claude Code blindly.

### Passio governance

All AI-driven modifications remain subject to Passio governance requirements: Centre de pilotage visibility, Sentinelle monitoring, traceability, tests, rollback strategy, feature flags / kill switches where relevant, and verification against the latest real deployed Passio version before modification.
