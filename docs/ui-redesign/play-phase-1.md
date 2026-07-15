# Play redesign — Phase 1 analysis

## Existing page and data

- `PlayScreen` owns three competition entries, circuit selection, AI difficulty selection, active-lineup summary, Rivalry Arena start, Faceoff start, Ghost navigation, and Season Locker navigation.
- Real state arrives through `GameApp`: Supabase-backed lineups and active IDs, calculated Collection Score, persisted preferred difficulty, current match-start state, and server error feedback.
- Unlocks come from `AI_TIER_THRESHOLDS`; reward values come from `MATCH_REWARDS`. The UI must not invent tiers or reward values.
- The actual product currently has Rookie, Pro, and Elite. There is no Legend tier.
- NHL Circuit, PWHL Circuit, and Open Ice are real `GameMode` values. A circuit is match-ready only when it has a valid active lineup.
- Season Locker already exposes real XP, reward thresholds, unlocked rewards, and 30 guaranteed free rewards through account state.

## What remains unchanged

- All existing callbacks, routing destinations, server-authoritative match starts, lineup validation, unlock thresholds, persisted difficulty choice, and error states.
- Global AppShell navigation, currencies, typography, tokens, buttons, and the visual language established on Home.
- Faceoff remains a transparent five-round server match; Rivalry Arena remains the featured real-lineup mode; Live Ghost remains reward-free.

## Structural changes

- Intro and the three competition modes become one top-stage composition instead of a separate full-width banner followed by a card row.
- Play receives a dedicated CSS module so its layout no longer depends on several conflicting legacy cascade layers in `Screens.module.css`.
- Season Locker becomes a real progress strip derived from account season state.
- Circuit cards expose active-lineup versus lineup-required state directly from `activeLineupIds`.
- Difficulty and active-six sections retain all behavior while using clearer unlocked, locked, selected, reward, and requirement hierarchy.

## Current blockers to the target quality

1. The intro header duplicates the same arena illustration used by multiple modules and consumes a full row above the actual modes.
2. Competition panels use conflicting heights from multiple CSS generations and rely on generic vector placeholders rather than mode-specific key art.
3. Circuits read as small dashboard cards and do not clearly communicate whether an active lineup exists.
4. Season Locker is a hard-coded text callout rather than a visual representation of live season progress.
5. Active lineup and match start are visually detached from the chosen circuit and difficulty.
