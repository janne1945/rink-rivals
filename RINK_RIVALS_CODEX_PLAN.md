# Rink Rivals — Codex Plan Mode Brief

## Purpose of this document

Use this file as the starting brief for Codex **Plan Mode**.

Codex should first inspect the current situation, identify reusable parts from the existing prototypes, and produce a concrete implementation plan. It should **not immediately rebuild the whole game** and should **not begin large code changes before the plan has been reviewed**.

The project name is:

# RINK RIVALS

**Working tagline:**  
*Two leagues. One collection. Every rivalry.*

---

## 1. Product vision

Rink Rivals is a mobile-first hockey card collecting game that brings **NHL and PWHL players together under one hockey umbrella**.

The game should support players who prefer:

- NHL-only teams
- PWHL-only teams
- mixed NHL/PWHL fantasy teams
- single-player matches against AI
- private head-to-head matches between two known players

The main intended users at first are the project owner and his father. Therefore, the initial version should prioritize:

- enjoyable collecting
- clear progression
- fair AI matches
- private rivalry features
- easy maintenance
- no real-money systems
- no public competitive ecosystem

This is not intended to become a gambling-style pack economy or a large public live-service game at the beginning.

---

## 2. Core game fantasy

The player builds a hockey collection, creates lineups, earns credits, purchases base cards, discovers rotating event cards, and competes in different hockey modes.

The main loop is:

1. Play a match
2. Earn credits or rewards
3. Improve the collection
4. Build or adjust a lineup
5. Unlock tougher AI opponents
6. Return for rotating event cards
7. Challenge a private rival later

---

## 3. Main design principles

### 3.1 NHL and PWHL are equal parts of the game

PWHL cards must not be treated as lower-tier content.

Ratings should represent how strong, important, or dominant a player is **within their own hockey environment and role**.

The game is a fantasy card game, not a scientific simulation of direct real-world NHL-versus-PWHL performance.

### 3.2 Mixing leagues is optional

Players should never be forced to mix NHL and PWHL cards.

The collection is shared, but different modes allow different lineup rules.

### 3.3 No real money

There should be:

- no premium currency at first
- no paid packs
- no player-to-player trading
- no auction house
- no purchasable competitive advantage

The initial economy uses one earned currency:

**Credits**

### 3.4 Base cards stay permanently available

Every included player has a normal base card that remains permanently available in the Player Market.

Players should be able to save toward a specific favorite card instead of relying only on random packs.

### 3.5 Event cards rotate

Special event versions rotate through the Event Shop.

Example sets:

- Frozen Frights
- Winter Classic
- International Ice
- Playoff Heroes
- Franchise Icons
- Rising Stars
- Record Breakers
- Clutch Performers

An event set can disappear and later return. Missing a card should not mean losing it forever.

### 3.6 Avoid uncontrolled power creep

New event cards should not always be strictly stronger than all previous cards.

Different versions should offer different strengths, roles, abilities, positions, or chemistry options.

Example:

- Base player: balanced version
- Halloween version: stronger physical or defensive profile
- International version: national-team chemistry
- Playoff version: stronger clutch attributes

---

## 4. Proposed game modes

These are the long-term modes. Codex should separate **MVP modes** from **later modes** in the plan.

### 4.1 Open Ice

- NHL and PWHL cards can be mixed
- fantasy lineup mode
- chemistry through nationality, archetype, event set, role, or play style
- no negative chemistry simply for mixing leagues

### 4.2 NHL Circuit

- NHL cards only
- NHL-themed AI opponents
- NHL-specific challenges

### 4.3 PWHL Circuit

- PWHL cards only
- PWHL-themed AI opponents
- PWHL-specific challenges

### 4.4 Events

Rotating rules such as:

- NHL only
- PWHL only
- mixed lineup required
- maximum card strength
- nationality challenge
- base cards only
- salary-cap lineup
- young players only
- legends or franchise icons

### 4.5 Private Faceoff — later milestone

A private live mode between two known players, especially the project owner and his father.

Long-term structure:

- create a private room
- receive a room code
- second player joins
- both choose cards secretly
- cards reveal simultaneously
- round winner is calculated centrally

Possible variants:

- Collection Faceoff: use owned cards
- Equal Ice Draft: both receive balanced temporary card pools
- NHL-only
- PWHL-only
- Open Ice

Do not build this before the core collection and AI match systems work.

---

## 5. Initial lineup format

For the first version, use a compact lineup:

- Left Wing
- Center
- Right Wing
- Left Defense
- Right Defense
- Goalie

Total: **6 cards**

Do not start with a full NHL roster containing four forward lines, three defensive pairs, and backup goalies.

A larger roster can be added later.

---

## 6. Attribute model

Codex should propose a clean data model that separates skaters and goalies.

### 6.1 Suggested skater attributes

- Speed
- Shooting
- Passing
- Puck Control
- Defense
- Physicality
- Hockey IQ
- Clutch

Optional later attributes:

- Faceoffs
- Discipline
- Stamina
- Offensive Awareness
- Defensive Awareness

### 6.2 Suggested goalie attributes

- Reflexes
- Positioning
- Glove
- Blocker
- Rebound Control
- Puck Handling
- Consistency
- Clutch

The first version should avoid too many attributes unless they have a clear gameplay purpose.

---

## 7. Card structure

Each real player is one base identity. Card versions should reference that identity instead of duplicating all player information.

Suggested conceptual structure:

```ts
Player {
  id
  name
  league
  team
  nationality
  position
  archetype
  handedness
  imageReference
}

CardVersion {
  id
  playerId
  setId
  cardType
  overall
  attributes
  abilities
  price
  availableFrom
  availableTo
  isPermanent
}
```

Possible card types:

- Base
- Featured
- Elite
- Signature

These labels should indicate significance or rarity, but should not automatically create extreme power gaps.

Codex should recommend whether the project needs explicit rarity labels in the MVP or whether event-set identity is enough.

---

## 8. Collection and progression

The user should have:

- owned cards
- duplicate count
- credits
- active lineups
- collection score
- completed matches
- unlocked AI difficulty levels
- shop purchase history
- event progress

### Collection score

The collection score should measure account progress.

It can depend on:

- number of unique cards
- quality of collected cards
- completion of sets
- special milestones

Duplicates should not provide the same collection progress as first-time ownership.

### AI progression

The collection score can influence which AI tiers are available, but the actual opponent should also consider the strength of the currently selected lineup.

This avoids punishing an advanced player who wants to use a weaker theme team.

Recommended opponent logic:

```text
Opponent difficulty =
account progression range
+ active lineup strength
+ selected game difficulty
+ mode restrictions
```

---

## 9. Economy

Use only one currency initially:

# Credits

Credits are earned through:

- AI matches
- daily objectives
- collection milestones
- event challenges
- first-win bonuses

Credits are spent on:

- permanent base cards
- rotating event cards
- optional non-paid packs
- future upgrades or crafting

### Permanent Player Market

Every base card is always directly purchasable.

The user can filter by:

- NHL or PWHL
- team
- position
- nationality
- price
- overall
- owned or missing

### Rotating Event Shop

One event set is featured at a time.

Example daily layout:

- 4 individual event cards
- 1 discounted spotlight card
- 1 optional event pack
- 1 weekly featured card

Event cards return in future rotations.

The rotation should be generated deterministically from a schedule or seed. Codex should not be required to manually rewrite the shop every day.

For the offline/local MVP, date-based rotation is acceptable.

For later online/private play, server time may become necessary.

---

## 10. Packs

Packs are optional and must not be the only way to acquire desired cards.

The user should always have a direct-purchase path for important cards.

For the MVP, Codex should decide whether packs are included immediately or postponed until the direct market and core loop are stable.

Preferred principle:

- direct purchase = expensive but guaranteed
- pack = cheaper but random
- no real money
- clear probabilities
- duplicate protection or duplicate conversion later

---

## 11. AI match concept

The first match system should be card-based and mobile-friendly, not a real-time hockey simulation.

Suggested structure:

- 5 or 7 rounds
- each round presents a hockey situation
- player chooses one eligible unused card
- AI chooses from its lineup
- relevant attributes are compared
- chemistry, ability, and small controlled variance may affect the result
- card cannot be reused in the same match
- first to win the required number of rounds wins

Example rounds:

- Breakaway
- Defensive Zone
- Power Play
- Forecheck Battle
- Clutch Shift
- Goalie Showdown
- Overtime

The same battle engine should later support Private Faceoff.

This is important: do not build separate combat engines for AI and live play.

---

## 12. Private Faceoff concept — future

Private Faceoff should eventually use:

- two authenticated or temporary players
- room code
- shared match state
- hidden card selections
- simultaneous reveal
- server-authoritative result calculation
- rematch option
- personal rivalry statistics

Rivalry statistics could include:

- total matches
- total wins
- current streak
- best comeback
- favorite card
- most successful lineup
- NHL Circuit record
- PWHL Circuit record
- Open Ice record

The MVP does not require public matchmaking, chat, global leaderboards, or anti-cheat systems for strangers.

---

## 13. Existing prototype reference

There is an existing repository:

`janne1945/wnba-build-a-baller`

Codex should inspect it only as a source of reusable ideas and patterns.

Potentially reusable concepts:

- mobile-first visual layout
- card reveal presentation
- pack animations
- screen transitions
- structured player data
- simulation separation
- weighted random selection
- deterministic rating calculations
- balance diagnostics
- PWA manifest setup
- responsive CSS patterns

Do not directly convert the entire existing project into Rink Rivals.

The existing project has grown into large files, especially a very large `ui.js`. Rink Rivals should start with a cleaner modular structure.

There may also be an older NHL Build-A-Skater prototype available locally or in another repository. Codex should identify whether it is accessible and determine whether any data or logic can be reused.

---

## 14. Technical direction to evaluate

Codex should compare and recommend one of these approaches:

### Option A: Modern web app

Possible stack:

- Vite
- TypeScript
- React or another lightweight component framework
- local persistence for MVP
- PWA support
- later Supabase or Firebase for Private Faceoff

Advantages:

- maintainable
- modular
- easy future online expansion
- good testing support

### Option B: Plain HTML, CSS, and JavaScript

Advantages:

- closer to the existing prototype
- lower initial setup
- simple deployment

Disadvantages:

- more difficult to maintain as collection, shop, lineups, and multiplayer grow

Codex should give a clear recommendation based on this project, not merely list options.

Preferred outcome: a modular TypeScript-based project unless there is a strong reason against it.

---

## 15. Persistence strategy

### MVP

Local persistence is sufficient:

- collection
- credits
- lineups
- shop state
- completed objectives
- settings

Use a versioned save format so future updates can migrate old saves.

Codex should compare:

- localStorage
- IndexedDB
- a lightweight persistence wrapper

### Later

Private Faceoff and cloud saves may use:

- Supabase
- Firebase
- another lightweight backend

The first code structure should not make future migration unnecessarily difficult.

---

## 16. Legal and asset constraints

During development:

- use placeholders or clearly separated local assets
- do not assume rights to official NHL, PWHL, team, or player branding
- do not build a commercial release plan around unlicensed logos and images
- maintain a clear unofficial prototype disclaimer

The architecture should allow player images, logos, card frames, and names to be replaced later.

---

## 17. MVP definition

The first playable MVP should contain only:

- mobile-first home screen
- 30–40 total base cards
- balanced NHL and PWHL representation
- skaters and goalies
- one shared collection
- one Credits currency
- permanent Base Player Market
- one rotating Event Shop
- one event set with 8–12 cards
- one 6-card lineup
- NHL Circuit
- PWHL Circuit
- Open Ice
- AI card battles
- match rewards
- local save
- basic collection progression
- filters and card detail view

Do not include in the first MVP:

- public matchmaking
- real money
- auction house
- player trading
- global chat
- clans
- full-size hockey rosters
- multiple currencies
- complex card upgrading
- dozens of event sets
- private online Faceoff before AI battles work
- app-store packaging before the web version is stable

---

## 18. Suggested development phases

Codex should improve this sequence if needed.

### Phase 0 — Discovery and architecture

- inspect existing WNBA repository
- locate older NHL prototype if available
- identify reusable data and visual systems
- choose stack
- define project structure
- define data schemas
- define save format
- define MVP acceptance criteria

### Phase 1 — Static foundation

- initialize new Rink Rivals project
- build navigation shell
- create placeholder branding
- create card component
- create sample NHL and PWHL player data
- create skater and goalie schemas
- create responsive mobile layout

### Phase 2 — Collection and lineup

- collection grid
- filters
- card detail view
- ownership state
- 6-card lineup builder
- validation for NHL, PWHL, and Open Ice rules
- local save

### Phase 3 — Economy and shops

- Credits
- permanent Base Player Market
- purchases
- owned/missing states
- deterministic Event Shop rotation
- one discounted spotlight card
- one sample event set

### Phase 4 — AI battle engine

- situation deck
- card selection
- AI decision logic
- simultaneous reveal animation
- round scoring
- match result
- rewards
- difficulty scaling

### Phase 5 — Progression and polish

- collection score
- AI opponent tiers
- daily objectives
- event challenges
- balancing diagnostics
- accessibility
- animations
- sound hooks
- PWA installation

### Phase 6 — Local private prototype

Before true online play:

- pass-and-play mode on one device
- hidden selections
- rematch
- local rivalry statistics

### Phase 7 — Private online Faceoff

- backend selection
- room codes
- two-device synchronization
- server-authoritative choices and results
- reconnect handling
- rivalry record

---

## 19. Testing requirements

Codex should include tests or diagnostics for:

- card data validity
- all lineups contain valid positions
- no duplicate card IDs
- no invalid player references
- prices remain within configured ranges
- Event Shop rotation is deterministic
- event cards return according to schedule
- AI lineups follow mode restrictions
- NHL Circuit never generates PWHL opponents
- PWHL Circuit never generates NHL opponents
- Open Ice can generate mixed opponents
- goalie cards cannot fill skater slots
- saved games migrate safely
- battle outcomes stay within intended probability ranges

A diagnostics script similar to the existing WNBA balance diagnostics is desirable.

---

## 20. Codex Plan Mode request

Codex should now produce a plan with the following sections:

1. **Current-state assessment**
   - What exists in the reference repository?
   - What can be reused?
   - What should not be reused?

2. **Recommended stack**
   - Give one primary recommendation
   - Explain why it fits this project

3. **Proposed repository structure**
   - Show folders and responsibilities

4. **Core data schemas**
   - Player
   - Card version
   - Collection
   - Lineup
   - Shop rotation
   - Match state
   - Save game

5. **MVP scope**
   - Confirm what is in and out

6. **Implementation milestones**
   - Small, reviewable milestones
   - Each milestone should end in something testable

7. **First coding task**
   - Define the smallest useful first implementation
   - Avoid starting with multiplayer or full card content

8. **Risks and decisions**
   - Identify decisions that must be made before coding
   - Recommend defaults instead of asking unnecessary questions

9. **Migration and reuse**
   - Explain how useful parts of the WNBA and NHL prototypes can be copied or adapted without inheriting the monolithic structure

10. **Acceptance criteria**
    - Define how we know the first milestone is complete

---

## 21. Important instructions for Codex

- Stay in Plan Mode first.
- Do not edit the existing WNBA repository.
- Recommend a new repository for Rink Rivals.
- Do not begin with multiplayer.
- Do not begin by entering hundreds of players.
- Do not introduce real-money systems.
- Do not build an auction house.
- Prefer reusable systems over hardcoded daily content.
- Keep NHL and PWHL equal in the game design.
- Make mixing optional.
- Design AI and future PvP around the same battle engine.
- Keep the first version small enough to finish.
- After presenting the plan, identify the exact first files that should be created, but wait for approval before making broad changes.
