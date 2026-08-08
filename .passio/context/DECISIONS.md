# Journal des décisions (index)

Décisions structurantes déjà prises. Détail dans `../adr/`.

| ADR | Décision | Statut |
|---|---|---|
| [ADR-001](../adr/ADR-001-vanilla-no-bundler.md) | Vanilla JS multi-script + build d'assemblage, **pas de framework/bundler** | Accepté |
| [ADR-002](../adr/ADR-002-multi-profile-identity.md) | Identité multi-profil = concern de première classe, sûreté au niveau données | Accepté |
| [ADR-003](../adr/ADR-003-supabase-rls-trust-boundary.md) | RLS Supabase = **unique** frontière de sûreté | Accepté |
| [ADR-004](../adr/ADR-004-media-storage-no-base64.md) | Médias en Storage, **jamais base64 en DB** | Accepté |
| [ADR-005](../adr/ADR-005-timestamp-supaTs.md) | `supaTs()` pour tous les timestamps (prod mixte) | Accepté |
| [ADR-006](../adr/ADR-006-claude-tooling-gitignored.md) | `.claude/` local (gitignoré), `.passio/` committé | Accepté |

## Décisions notables hors ADR (mémoire)
- Seed JSON externalisé : **rejeté sciemment** (2026-07-15).
- Télémétrie : opt-out par défaut en prod (2026-08-05).
- CLAUDE.md allégé (110→13 Ko), détail → `docs/PIEGES_CONNUS.md` (2026-08-07).
