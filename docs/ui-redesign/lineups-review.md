# Lineups AAA redesign review

## Scope

Only the Lineups page was redesigned. The existing Supabase-backed lineup loading, creation, editing, saving, validation, activation, circuit assignment, and active-lineup restoration remain the source of truth.

## Components and assets

- `src/features/lineup/LineupsScreen.tsx`
  - Reworked the page into a compact arena header and three circuit rows.
  - Added a focused lineup presentation with six readable player slots.
  - Added a compact selector for multiple saved lineups within a circuit.
  - Preserved the existing lineup builder and server-backed actions.
  - Uses the real NHL, PWHL, Open Ice, and player-card assets already available in the app.
- `src/features/lineup/LineupsScreen.module.css`
  - Isolates the new layout from the legacy screen cascade.
  - Adds circuit-specific gold, violet, and ice-blue accents.
  - Includes responsive slot grids, keyboard focus states, hover feedback, and reduced-motion handling.
- `public/assets/ui/lineups-arena.webp`
  - New locally stored, compressed arena key art for the header.
  - Generated as neutral decorative art without people, real logos, UI, or embedded text.

## Design decisions

- The active or currently focused six is the visual center instead of presenting lineups as a management table.
- NHL, PWHL, and Open Ice remain visible at the same time, while each circuit has a distinct identity and an immediate create/edit action.
- Occupied slots show position, OVR, player image, league, and name. Invalid slots expose an issue state and route back to editing.
- Empty circuits use a compact, motivating empty state with a direct `BUILD YOUR FIRST SIX` action.
- Multiple saved lineups are exposed as a small selection rail rather than additional full-width panels.
- The layout follows the Home and Play page width, typography, panel, border, and button language.

## Verification

- `pnpm typecheck` — passed.
- `pnpm test` — 41 files and 222 tests passed.
- Targeted Playwright lineup coverage — 8/8 passed across desktop, tablet, mobile landscape, and mobile Chromium:
  - incomplete new lineup validation;
  - active Supabase lineup loading and restoration after reload.
- Visual checks completed at 1920 × 1080, 1440 × 900, tablet, and 390 px mobile width.
- Confirmed no horizontal page overflow and no clipped player names at the checked widths.
- Confirmed Lineups page controls retain visible focus treatment and at least 44 px touch targets.
- `git diff --check` — passed.

The broader central-account Playwright scenario also passes on desktop, tablet, and mobile landscape. Its mobile-Chromium variant still times out on the Goals page because the pre-existing global app header hides the Sign out control below 760 px. That behavior is outside this Lineups-only scope and was not changed.

## Review screenshots

- `docs/ui-redesign/screenshots/lineups-1920x1080.png`
- `docs/ui-redesign/screenshots/lineups-1440x900.png`
- `docs/ui-redesign/screenshots/lineups-tablet.png`
