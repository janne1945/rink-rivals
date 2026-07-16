# Matchscreen AAA redesign review

## Scope and preserved behavior

Only the production `/match` experience and its presentation tests were changed. `GameApp` still owns start, resume, reveal, retry, continue, and settlement orchestration. The battle domain and Supabase RPC results remain authoritative for category eligibility, opponent selection, exact values, tie-breaks, score, match outcome, rewards, and progression.

The existing presentation machine remains responsible only for the visible broadcast sequence. No client-side scoring, mock player data, new match category, reward, or settlement behavior was introduced.

## Components changed

- `src/features/match-experience/MatchExperienceV2.tsx`
  - Rebuilt the composition as a match command center with utility bar, compact scoreboard, arena duel, player hand, and contextual match-information rail.
  - Added a readable empty player slot, stronger concealed rival card, live server/status copy, and the visible tie-break order.
  - Keeps opponent identity and values out of the DOM until the authoritative reveal.
- `src/features/match-experience/PlayerHand.tsx`
  - Keeps all six lineup positions visible while moving the committed card into the duel stage.
  - Replaces the committed hand position with a clear locked-in placeholder, avoiding duplicate shared-layout cards.
- `src/features/match-experience/MatchExperienceV2.module.css`
  - Introduces the reference-led desktop grid, gold/cyan hierarchy, arena depth, equal duel-card sizing, compact hand, contextual sidebar, and responsive stacking.
  - Reuses `public/assets/ui/lineups-arena.webp`; no new generated image was required.
- `src/features/match-experience/MatchExperienceV2.test.tsx`
  - Adds explicit no-eligible-card and completed-match-loss coverage.
- `tests/e2e/match-v2.spec.ts`
  - Preserves the full authoritative flow and adds stable review captures for selection, locked card, win, loss, completion, desktop sizes, and tablet.

## Presentation and motion

- A selected card moves from the hand into the player slot.
- The rival stays concealed until the server response and reveals at equal visual weight.
- Category, comparison, round-result, score-pulse, Match Point, Final Shift, and final-horn transitions remain driven by the existing typed motion presets.
- Winning cards receive a restrained warm light focus; losing cards remain visible and readable.
- Reduced-motion mode keeps the same state sequence while collapsing decorative timing.

## Verified states

- round started with no card selected;
- eligible and ineligible cards;
- no eligible card;
- committed card with concealed rival;
- server resolving and lost-response retry;
- authoritative reveal;
- round won and round lost;
- visible OVR/server-seed tie-break contract;
- next round, Match Point, and Final Shift;
- completed match won and completed match lost;
- settlement success and settlement retry;
- reduced motion;
- reload with a pending selection and reload after settlement.

## Checks

- `pnpm typecheck` passed.
- Full Vitest suite passed: 41 files and 224 tests; the focused Match Experience suite passes 5/5.
- Match Experience Playwright suite passed: 7 tests with 9 intentional cross-project skips.
- Full five-round responsive flow passed on desktop, tablet, mobile landscape, and mobile Chromium.
- Reveal retry, settlement retry, and reduced-motion checks passed.
- The responsive flow confirms no horizontal document overflow and no browser errors.
- `git diff --check` passed.

## Review screenshots

- `docs/ui-redesign/screenshots/match-selection-1920x1080.png`
- `docs/ui-redesign/screenshots/match-selection-1440x900.png`
- `docs/ui-redesign/screenshots/match-selection-tablet.png`
- `docs/ui-redesign/screenshots/match-card-locked.png`
- `docs/ui-redesign/screenshots/match-round-win.png`
- `docs/ui-redesign/screenshots/match-round-loss.png`
- `docs/ui-redesign/screenshots/match-complete.png`
