# PASSIO task — Bobine Discovery Engine V1

Target release: Friday 2026-08-21.
Implementation agent: Claude Code Opus 5.
Product/architecture owner: ChatGPT.
Review: ChatGPT + CI; Codex-style independent technical review is expected before merge for any security/performance issue found.
Risk: normal. Do NOT add or modify Supabase schema/RLS/migrations/deployment credentials for this V1.

## Product outcome

Turn Bobines from a chronological reel viewer into PASSIO's discovery engine: not only "show me videos from passions I already have", but "help me discover passions I may love next", while preserving PASSIO's core promise: **share your Passio and meet people**.

Bobines should become the exploration surface; Feed remains the belonging/following surface.

Primary path to optimize:

Bobine -> curiosity -> discover a Passio -> people/community/IRL opportunity.

Do NOT optimize only for endless watch time.

## Current behavior to replace

`buildReels()` currently filters playable `isReel` posts, deduplicates/blocks, sorts newest-first, slices to 30. Preserve all safety/moderation/media guards, but replace the chronological-only selection with a deterministic personalized discovery ranking/interleaving layer.

## V1 constraints

- Vanilla JS architecture only; obey AGENTS.md and CLAUDE.md.
- No framework, no modules, no bundler change.
- No DB migration or RLS change.
- Reuse existing posts/Bobines model and existing telemetry helper (`tel`) when available.
- Persist discovery feedback locally in a versioned key (for example `passio_reels_discovery_v1`) so the feature works immediately for Friday and survives reloads.
- Fail open: if personalization data is missing/corrupt, Bobines must still open and show a safe diverse feed.
- Keep existing Bobines interactions working: like, comments, support/tip, share, sound, author navigation, deep links, creation, pause prompt, video fallbacks, blocked users.
- Keep existing XSS/safe URL invariants.

## Discovery model

Implement a simple explainable `Passio Discovery Engine V1`, not random shuffle.

### 1. User passion profile

Build a normalized set/score of known interests from data already present in the app. At minimum inspect and use safely where available:
- passions of the user's created profiles / active profile;
- liked Bobines/posts and other positive interactions already represented in state;
- local Bobine discovery feedback introduced by this task.

Do not assume a field exists: guard every optional source.

Represent passion interest scores with a bounded numeric score. Positive feedback should raise a passion gradually; explicit negative feedback should strongly lower/exclude it for a cooling period or until reversed.

### 2. Passion graph

Create a small maintainable adjacency graph using ONLY current PASSIONS ids. It should connect plausible neighboring interests, e.g.:
- musique <-> danse, podcast, cinema, tech
- photo <-> voyage, art, cinema, animaux
- voyage <-> photo, cuisine, animaux, sport
- cuisine <-> voyage, jardinage, artisanat/metier
- sport <-> yoga, voyage, moto, danse
- litterature <-> podcast, cinema, art
- cinema <-> photo, musique, art, litterature
- tech <-> jeuxvideo, musique, photo, podcast
- art <-> photo, mode, cinema, artisanat/metier
- jardinage <-> cuisine, animaux, yoga
- metier <-> art, jardinage, mode
- jeuxvideo <-> tech, cinema, musique
- yoga <-> sport, jardinage, danse
- mode <-> art, photo, danse, metier
- danse <-> musique, sport, mode, yoga
- podcast <-> musique, litterature, tech
- moto <-> sport, voyage, photo
- animaux <-> photo, jardinage, voyage
- actu should not dominate discovery; keep it neutral/low-priority unless explicitly relevant.

It is acceptable to tune this graph if the repository's PASSIONS catalog differs, but do not invent non-existent passion ids.

### 3. Four discovery buckets

For users with enough candidates, interleave approximately:
- 55% `known`: passions already strong for the user;
- 30% `adjacent`: passions neighboring known interests in the Passion Graph;
- 10% `serendipity`: farther but plausibly interesting/diverse;
- 5% `explore`: controlled exploration.

These are target proportions, not hard requirements when inventory is sparse. Never return fewer good playable reels just to satisfy a quota.

Avoid runs of the same passion and avoid same-author repetition when alternatives exist. Prefer content diversity and freshness within each bucket, not pure recency.

### 4. Explainable ranking

Every selected reel should carry ephemeral discovery metadata (do not persist it into canonical post objects if avoidable): bucket, score, and a short reason.

Examples of French UI reasons:
- `Parce que tu aimes Photo`
- `À découvrir depuis Voyage`
- `Une Passio qui pourrait te surprendre`
- `Exploration`

Do not expose numeric scores to users.

## UX changes in Bobines

Keep the current fullscreen viewer visual language. Add lightweight, non-cluttering discovery affordances.

### A. Discovery badge/reason

Near the existing passion/mood tag, show a compact label/reason for non-trivial recommendations, especially adjacent/serendipity/explore. It must remain readable on video and must not cover core actions.

### B. New actions

Add these controls in a compact accessible way without breaking existing right-side actions:

1. `✨ Ça m'intrigue`
   - positive discovery signal;
   - persistent locally;
   - immediate visual state;
   - toast confirming PASSIO will show more related discoveries;
   - telemetry event if `tel` supports a generic/custom event path without schema change.

2. `🧭 Découvrir cette Passio`
   - route to the best existing PASSIO surface for that passion (Explore/filter/passion detail — inspect existing app and reuse, do not create a dead-end modal if an existing route exists);
   - preserve the Bobine -> Passio -> people/IRL product path.

3. `Pas pour moi`
   - explicit negative feedback, accessible from an overflow/secondary affordance if needed to avoid clutter;
   - immediately remove or de-prioritize that reel/passio from the remaining session;
   - persist feedback locally;
   - do not punish unrelated passions permanently because of one reel.

If there is an existing generic save/bookmark action that is clearly compatible, reuse it rather than inventing a duplicate.

### C. Why am I seeing this?

Tapping the discovery reason (or an info affordance) should show a small existing-style modal explaining the reason and offering `Pas pour moi` where practical.

## Learning signals V1

Use conservative weights and keep them in named constants so they are easy to tune.

Suggested ordering of strength:
- explicit `Pas pour moi`: strongest negative for that reel, moderate negative for that passion;
- `Découvrir cette Passio`: strongest positive for that passion;
- `Ça m'intrigue`: strong positive;
- like/comment/share/support on a reel: positive if safely observable through existing handlers/state;
- completed/meaningful watch: weak-to-moderate positive only if existing viewer lifecycle makes it safe to measure;
- simple impression/fast swipe: weak signal, do not overlearn.

Do not create invasive tracking. Reuse existing telemetry patterns and keep local learning minimal.

## Quality safeguards

- Deterministic enough for tests: inject/tie-break with stable post id where possible rather than `Math.random()` for core ranking.
- Cap overexposure: no more than 2 consecutive reels of same passion where inventory permits.
- Cap same author repetition where inventory permits.
- Explicit negatives must be respected immediately.
- Blocked authors remain excluded.
- Unplayable/ghost media remain excluded.
- Existing deep-link `#reel=<id>` behavior must still open the requested reel even if ranking would normally exclude/deprioritize it; preserve current behavior or add a safe exception.
- Do not mutate canonical arrays in ways that alter Feed ordering.

## Telemetry / success metrics

Without DB migration, reuse the existing `tel` API if it already supports generic events. Add only calls that are guaranteed not to throw when telemetry is absent.

Track, if safely possible:
- Bobine impression with discovery bucket;
- `curious` click;
- `discover_passio` click;
- `not_for_me` click;
- reason/info open;
- eventual existing IRL navigation can stay as existing telemetry.

The product KPI to document is not watch time. Document:
- New Passion Activation Rate;
- Discovery -> Passio click rate;
- Discovery -> IRL conversion (future/server-side measurement).

## Tests and acceptance criteria

Add/extend automated coverage that fits the existing test suite. At minimum verify:

1. `buildReels()`/new engine still excludes non-reels, blocked authors, duplicates, and ghost media.
2. Known interests are favored but adjacent passions are injected when inventory exists.
3. Diversity rule prevents a long same-passion run when alternatives exist.
4. `Pas pour moi` persists and affects subsequent ranking/session immediately.
5. `Ça m'intrigue` persists positive feedback.
6. `Découvrir cette Passio` invokes a real existing navigation/filter path, not a missing global handler.
7. New inline handlers/globals pass `npm run audit:handlers` and `npm run audit:globals`.
8. Existing Bobines smoke/deep-link behavior remains functional.
9. `npm test` (or the repository's relevant Playwright subset + static audits) passes.
10. Production build succeeds.

Do not weaken tests or CI.

## Documentation / release readiness

Create a concise `docs/BOBINE_DISCOVERY_V1.md` that records:
- product mission;
- bucket model and default ratios;
- passion graph approach;
- localStorage schema/key;
- tuning constants;
- telemetry events used;
- KPIs;
- V2 path (server-side embeddings/candidate generation/contextual bandit only after enough real data);
- rollback: one simple way to fall back to chronological Bobines if an issue occurs (prefer a single named constant/feature flag in code, not deployment config).

Add a short release note/checklist for Friday 2026-08-21 in the same doc: build/tests/preview/mobile checks and rollback check.

## Scope / non-goals for Friday

Do NOT:
- build a heavy ML service;
- add embeddings/vector DB;
- create a new backend service;
- change auth/RLS;
- add migrations;
- redesign the whole Bobines viewer;
- remove existing interactions;
- move Feed logic into Bobines;
- optimize for addictive infinite scrolling.

Deliver the smallest safe V1 that makes Bobines meaningfully personalized, exploratory, explainable, and connected to discovering a Passio.