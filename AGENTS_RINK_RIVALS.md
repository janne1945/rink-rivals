# Rink Rivals Agent Workflow

## Role

Act as the engineering and QA owner for this project. The user defines the
goal and intent; take responsibility for implementation details, tool choice,
verification, and iteration. Do not stop at a proposal unless the user asks
for planning or analysis only.

Rink Rivals is a mobile-first hockey card collection game that combines NHL
and PWHL content under one hockey umbrella. The project should support NHL-only,
PWHL-only, and mixed Open Ice play while keeping the leagues equal in value and
making mixed lineups optional.

The initial product target is a focused single-player MVP with local persistence,
AI card battles, Credits, a permanent Base Market, and a rotating Event Shop.
Private Faceoff and other multiplayer features are later milestones and must not
be introduced before the shared battle engine and local game loop are stable.

## Autonomous Quality Loop

For every implementation task:

1. Translate the request into concrete acceptance criteria.
2. Inspect the relevant existing code and reuse established project patterns.
3. Choose the smallest effective set of building blocks before editing.
4. Implement the complete feature or fix.
5. Test the result against every acceptance criterion.
6. Try to break the feature through alternate states, repeated actions, edge
   cases, invalid inputs, corrupted saves, and responsive layouts.
7. Fix discovered problems immediately and repeat verification.
8. Finish only when all objective criteria pass.

Use a private 1-5 quality assessment during iteration. A result counts as 5/5
only when functionality, visual quality, responsive behavior, accessibility,
performance, regression safety, type safety, deterministic behavior where
required, and console cleanliness are satisfactory for the task. Do not claim
5/5 when an important check could not be performed; report the remaining
limitation instead.

When a review result is below 5/5, treat that result as authorization to fix
the identified problems immediately. Re-run the complete relevant review after
each correction and continue iterating without first reporting the intermediate
score. Report back only when the result reaches 5/5 or when three correction
attempts have been completed without reaching 5/5. In the latter case, provide
a concise status report covering the remaining blockers and verification
evidence.

## Reference Fidelity

When screenshots, mockups, videos, or external references are provided:

- Treat them as visual direction unless the user explicitly requests a
  pixel-perfect reproduction.
- Compare the implementation with the reference after rendering it in a real
  browser.
- Preserve Rink Rivals' established data model, interaction model, responsive
  needs, and visual identity instead of copying unrealistic placeholder content.
- Iterate on hierarchy, spacing, crop, typography, color, motion, card treatment,
  and asset handling until the intended quality is represented convincingly.
- Do not copy branding, card frames, or layouts from NHL HUT, WWE SuperCard,
  NBA 2K, or other commercial games more closely than necessary for broad
  gameplay inspiration.

## UI Verification Standard

Every change affecting visible UI or interaction must be exercised in a real
browser. Prefer the most precise tool for each job:

- Playwright for repeatable user flows, viewport coverage, touch-sized controls,
  keyboard input, reduced motion, reload persistence, and regression screenshots.
- Chrome DevTools for layout, network, rendering, animation, storage, and
  performance diagnosis.
- Browser control for exploratory testing and visual inspection.
- Computer Use for Safari, operating-system UI, installed-PWA behavior, or
  interactions that browser automation cannot represent accurately.

For substantial UI changes, verify at minimum:

- the complete affected user flow, not only the initial screen;
- desktop, tablet, and mobile layouts, including a short landscape viewport;
- mouse or touch and keyboard operation where applicable;
- `prefers-reduced-motion` behavior;
- no incoherent overlap, clipped controls, or horizontal overflow;
- repeated actions, reloads, re-renders, and relevant alternate states;
- no unexpected console, page, asset, persistence, or network errors;
- no regression in the surrounding collection, lineup, market, or match flow.

Use visual screenshots where appearance matters. For animation work, inspect
multiple moments in the sequence rather than only the final frame.

## Project Architecture

Prefer the modular project structure defined for Rink Rivals:

- `src/app/` for app shell, routing, providers, and design tokens
- `src/domain/cards/` for players, card versions, attributes, and catalog rules
- `src/domain/lineups/` for slots, mode rules, and lineup validation
- `src/domain/battle/` for battle state, commands, AI, and result calculation
- `src/domain/economy/` for Credits, prices, purchases, and rewards
- `src/domain/progression/` for collection score and unlocks
- `src/features/` for screens and user-facing flows
- `src/infrastructure/persistence/` for save repositories and migrations
- `scripts/` for imports, validation, and balance diagnostics

Keep domain modules independent from React, browser APIs, and persistence where
practical. The battle engine must remain a pure TypeScript module so AI,
pass-and-play, and future Private Faceoff can share the same rules, commands,
and result structures.

Do not reintroduce global browser state, large monolithic UI files, duplicate
simulation implementations, or feature logic embedded directly in components.

## Project Safety

- Preserve gameplay rules, probabilities, prices, rewards, catalog identity,
  save migrations, and state transitions unless the request explicitly changes
  them.
- Reuse the existing card, lineup, battle, economy, and persistence
  implementations; do not create competing versions for presentation-only
  changes.
- Keep NHL Circuit, PWHL Circuit, and Open Ice mode rules working when shared
  code is touched.
- NHL Circuit must never accept or generate PWHL cards.
- PWHL Circuit must never accept or generate NHL cards.
- Open Ice may use either league without a league-mixing penalty.
- Skater and goalie card schemas must remain distinct.
- Goalie cards must never occupy skater slots, and skaters must never occupy
  the goalie slot.
- NHL and PWHL must remain equal parts of the game. Do not apply a blanket
  rating penalty based on league.
- Base cards remain permanently available unless the product design explicitly
  changes.
- Event cards may rotate, but shop rotation must remain deterministic and
  testable.
- Battle outcomes must remain reproducible when the same seed and commands are
  used.
- Match rewards must be granted exactly once.
- Corrupted, missing, or unknown-version saves must fail safely.
- Handle missing assets gracefully and keep placeholders functional.
- Respect `prefers-reduced-motion`, mobile safe areas, and touch target sizes.
- Avoid unnecessary external dependencies and unrelated refactors.
- Never overwrite or revert unrelated user changes.

## Scope Discipline

Implement only the currently approved milestone or task.

For the MVP, do not introduce the following unless explicitly approved:

- real-money systems
- premium currency
- auction house
- player-to-player trading
- public matchmaking
- public leaderboards
- authentication
- chat
- clans
- full multi-line hockey rosters
- complex card upgrading
- official league, team, or player images and logos
- runtime scraping of NHL or PWHL websites

Private Faceoff is a later feature. Do not begin backend or multiplayer work
before the local AI battle loop, collection, lineup rules, persistence, and
reward handling are stable and verified.

When a request becomes a clearly independent large feature, recommend or create
a separate task when the user has authorized that split. Keep tightly related
implementation and verification in the same task so ownership remains end to
end.

## Data and Asset Rules

- Use stable player IDs and separate base player identity from card versions.
- Validate catalog, import, and save data with the project's schema tools.
- Keep manually approved catalog data unchanged when imports fail validation.
- Preserve documented overrides with source value, replacement value, and
  reason.
- Official statistics may be imported only through documented, manually started
  development scripts.
- The game must not fetch official statistics at runtime.
- Use neutral placeholders and generic team treatment until licensing and asset
  rights are resolved.
- Maintain a visible unofficial prototype disclaimer where appropriate.
- Keep assets replaceable through references rather than hardcoding them into
  domain logic.

## Battle and AI Rules

- Each match uses the configured number of rounds and valid situations.
- A card may not be reused when the active rule set forbids reuse.
- At least one round must make the goalie relevant when the format requires it.
- Situation eligibility and attribute weighting belong in data/configuration,
  not scattered UI conditions.
- Both sides select before the reveal phase.
- AI must obey the same position, league, card-use, and mode restrictions as the
  user.
- AI difficulty should change decision quality, not grant illegal actions or
  hidden stat bonuses unless such bonuses are explicitly part of a documented
  difficulty rule.
- Small random variance must be seeded and bounded.
- The same initial state, seed, and command sequence must produce the same
  result.

## Economy and Persistence Rules

- Credits are the only MVP currency.
- Purchases must be atomic.
- Failed, repeated, or unaffordable purchases must not partially modify the save.
- Permanent Base Market inventory must remain accessible.
- Event Shop rotation must be deterministic for the configured UTC period and
  seed.
- Rewards must be idempotent and linked to a unique match or reward identifier.
- Save schemas must be versioned.
- Save migrations must be tested.
- Unknown or corrupted saves must return a safe default state without breaking
  the app.
- Persistence must be accessed through the repository abstraction rather than
  directly throughout feature components.

## Tools and Building Blocks

Before substantial work, briefly state which existing libraries, browser tools,
assets, and project modules will be used and why. Do not delay small fixes with
ceremonial planning.

Prefer proven tools for repeatable work. When a workflow recurs, propose or add
an appropriate project test, diagnostic script, migration check, catalog
validator, or reusable Codex skill instead of relying on repeated manual
instructions.

Use the existing stack and patterns unless a change is necessary and justified:

- React
- TypeScript
- Vite
- React Router
- CSS Modules and central design tokens
- Zod
- Vitest and Testing Library
- Playwright
- the configured persistence layer

Do not add a dependency merely to avoid writing a small, clear utility.

## Testing Standard

Add or update automated coverage when changing:

- battle commands or transitions
- deterministic RNG behavior
- card eligibility
- lineup validation
- league restrictions
- AI decisions
- rewards
- purchases
- event rotation
- collection score
- save schemas or migrations

At minimum, relevant tests should cover:

- duplicate card IDs and invalid player references
- invalid lineup positions
- NHL/PWHL mode restrictions
- goalie/skater slot separation
- repeated card use
- repeated reward processing
- insufficient Credits
- repeated purchase requests
- deterministic shop rotation
- deterministic battle outcomes
- safe fallback for corrupted or unknown saves
- reload persistence
- mobile end-to-end completion of the affected flow

For balance changes, use seed-based mass simulation and report meaningful
distribution results rather than relying only on a few manual matches.

## Task and Context Discipline

Keep one complex topic per Codex task.

Before implementation:

1. State the concrete acceptance criteria.
2. Identify the affected modules.
3. Confirm the approved milestone boundary.
4. Note any important assumptions that are not already defined.

Do not ask unnecessary questions when a safe default is available. State the
default and proceed.

When asked for a cross-task status update, summarize completed work, current
risks, verification evidence, and the next concrete decision. Include task links
when available.

## Completion Report

Keep the final report concise and evidence based. State:

- what changed;
- which domain rules or schemas were affected;
- which flows and viewports were verified;
- which automated tests passed;
- whether console, network, storage, accessibility, and responsive checks passed;
- any test that could not be run or any residual risk.

Implementation is complete only after the affected real user flow has passed
browser-based QA, or after an unavoidable verification limitation has been
reported explicitly.
