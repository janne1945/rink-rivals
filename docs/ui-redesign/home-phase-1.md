# Home redesign — Phase 1 analysis

## Existing page

- **Component:** `HomeScreen` owns the hero, Ghost promo, account progress, club level, daily goals, weekly progress, and next-shift CTA. `AppShell` supplies global navigation, currencies, profile state, and the disclaimer.
- **Data:** account Credits, season XP, completed matches, collection count/score, and objective view models are injected by `GameApp`; Home does not fetch or duplicate account state.
- **Layout:** the page used a 2.25/0.85 hero grid, repeated for progress, plus a 1.65/1 lower grid inside the global `--content` shell.
- **Assets:** the existing `home-arena.svg` already contains suitable neutral arena/player/banner key art. The former Ghost background (`play-locker.svg`) is a locker room and does not communicate a concealed rival.
- **Responsive:** global breakpoints collapse the page at roughly 760–800 px. The shared screen stylesheet contained multiple competing Home overrides with different heights and radii.
- **Interaction:** all CTAs are real buttons and route through React Router. Objective content is semantic and server/account-derived.

## What stays

- Existing route behavior, account/progression data, CTA destinations, global navigation, crest, currencies, and accessible semantic structure.
- Existing arena key art for the hero and next-shift panel.
- The core content hierarchy from the supplied reference: hero + live mode, progress + level, assignments + next shift.

## What changes

- Home receives a dedicated CSS module so its proportions no longer depend on three legacy cascade layers in `Screens.module.css`.
- The hero becomes a focused 354 px game-menu stage. Decorative player-card fans are removed so the existing arena athlete and banner can carry the composition.
- Ghost Challenge gets purpose-built, text-free atmospheric key art and a single anchored CTA.
- Progress and assignment modules become quieter supporting bands with larger numerical hierarchy, clearer status icons, and less dashboard-like chrome.
- Desktop content fits the intended first-screen composition; tablet/mobile collapse deliberately without losing controls or readable text.

## Primary blockers to the AAA look

1. A stale `min-height: 520px` on the Ghost panel expanded the entire hero row despite a later 350 px hero override.
2. Decorative card art obscured the strongest part of the existing hero asset and competed with the primary CTA.
3. Several generations of Home CSS remained active simultaneously, making spacing and breakpoints unpredictable.
4. Secondary information had almost the same visual weight as the hero, producing a web-dashboard rhythm instead of a game-menu hierarchy.
