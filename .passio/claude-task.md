# PASSIO task — Bobine Discovery Engine V1

Target release: Friday 2026-08-21.
Implementation agent: Claude Code Opus 5.
Product/architecture owner: ChatGPT.
Review: ChatGPT + CI; independent technical review before merge for security/performance issues.
Risk: normal. Do NOT add or modify Supabase schema/RLS/migrations/deployment credentials.

## Product outcome
Turn Bobines from a chronological reel viewer into PASSIO's discovery engine: known passions + adjacent passions + serendipity + controlled exploration, while preserving PASSIO's core promise: discover/share passions and meet people IRL.
Primary path: Bobine -> curiosity -> discover a Passio -> people/community/IRL opportunity. Do not optimize only for watch time.

## Existing behavior and invariants
Inspect the current canonical main before editing. Preserve all existing safety/moderation/media guards, blocked-user exclusions, safe URL/XSS invariants, deep link #reel behavior, creation, like/comments/share/sound/author navigation and video fallbacks. Do not mutate canonical Feed ordering.
Vanilla JS only. No framework/modules/bundler changes. No DB migration/RLS/auth changes.

## V1 discovery engine
Build a guarded normalized interest profile from existing active/created profile passions, safely observable positive interactions, and V1 local feedback. Never assume optional fields exist.
Use a maintainable adjacency graph containing ONLY passion IDs that actually exist in the repository. Typical relationships may include musique/danse/podcast/cinema/tech, photo/voyage/art/cinema/animaux, voyage/photo/cuisine/animaux/sport, sport/yoga/voyage/moto/danse, etc.; adapt to the real catalog and never invent IDs. Keep actu neutral/low priority unless explicitly relevant.

When inventory permits, target approximately 55% known, 30% adjacent, 10% serendipity, 5% explore. These are soft targets: never return fewer valid playable reels merely to satisfy a quota. Avoid long runs of one passion and repeated authors when alternatives exist. Use stable/deterministic tie-breaking rather than Math.random() for core ranking.
Attach ephemeral recommendation metadata (bucket, internal score, French reason) without persisting it into canonical post objects when avoidable. Do not expose numeric scores.

Persist feedback locally in a versioned key such as passio_reels_discovery_v1. Corrupt/missing data must fail open to a safe diverse feed. Explicit negative feedback must take effect immediately; positive feedback should raise affinity conservatively.

## Bobines UX
Keep current fullscreen visual language and avoid clutter.
Add a compact discovery reason/badge, especially for adjacent/serendipity/explore.
Add accessible actions:
- `✨ Ça m'intrigue`: persistent positive signal, immediate state/toast.
- `🧭 Découvrir cette Passio`: reuse a REAL existing navigation/filter/detail path; preserve Bobine -> Passio -> people/IRL.
- `Pas pour moi`: secondary/overflow is acceptable; immediately remove/deprioritize the reel and moderately reduce that passion, persist locally.
Tapping the recommendation reason/info should explain why and offer `Pas pour moi` where practical.

## Telemetry
Reuse existing `tel` only where calls are guaranteed not to throw if telemetry is absent. No schema change. Safely track when possible: impression+bucket, curious, discover_passio, not_for_me, reason/info open. Document KPIs: New Passion Activation Rate; Discovery -> Passio click rate; future Discovery -> IRL conversion. Do not add invasive tracking.

## Tests / release acceptance
Add or extend automated coverage fitting the existing suite. At minimum prove:
1. engine excludes non-reels, blocked authors, duplicates and ghost/unplayable media;
2. known interests favored while adjacent inventory is injected;
3. diversity prevents long same-passion runs when alternatives exist;
4. Pas pour moi persists and immediately affects ranking/session;
5. Ça m'intrigue persists positive feedback;
6. Découvrir cette Passio calls a real existing navigation/filter path, not a missing global;
7. audit:handlers and audit:globals pass;
8. existing Bobines smoke/deep-link behavior remains functional;
9. relevant Playwright/full test suite passes;
10. production build succeeds.
Do not weaken tests or CI.

## Documentation / rollback
Create docs/BOBINE_DISCOVERY_V1.md with mission, bucket ratios, graph approach, localStorage schema/key, named tuning constants, telemetry, KPIs, V2 path, and a simple named code feature flag/constant that can fall back to chronological Bobines. Add release checklist for build/tests/preview/mobile and rollback.

## Non-goals
No ML service, embeddings/vector DB, backend service, auth/RLS/migrations, whole-viewer redesign, removal of existing interactions, or Feed logic migration.

Deliver the smallest safe V1 that is personalized, exploratory, explainable, and connected to discovering a Passio. Run relevant checks and report failures honestly.