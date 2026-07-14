# Premium Quartett gameplay

## Pre-implementation investigation

This document records the mandatory investigation completed before the Premium
Quartett rebuild. It also defines the player-facing rules that the domain,
Supabase RPCs, and match UI must share.

### Current category generation

`start_match` currently stores a fixed five-item `situations_snapshot` on every
server-issued match ticket. The sequence contains four skater situations and one
goalie situation. Each situation combines several card attributes through
fractional weights. The browser receives this immutable sequence and creates a
local battle view from it; it does not choose or shuffle authoritative rounds.

The pure TypeScript battle engine has a larger local situation deck and can
select a seeded four-skater/one-goalie sequence. Production matches, however,
use the exact sequence returned by `start_match`.

### Current comparison and unexplained decimals

Both the local engine and `card_situation_score` calculate a weighted sum of
multiple attributes. `play_match_round` then adds a seeded random variance to
each weighted score. The opponent variance range also changes by difficulty.
The total is rounded to two decimals and sent to the client. The UI renders that
derived total to one decimal, even though it is not printed on the selected
card. This is the direct cause of results such as `85.8 vs 86.0`.

### Card attributes and role handling

Every skater CardVersion has Speed, Shooting, Passing, Puck Control, Defense,
Physicality, Hockey IQ, and Clutch. Every goalie CardVersion has Reflexes,
Positioning, Glove, Blocker, Rebound Control, Puck Handling, Consistency, and
Clutch. The lineup and battle domains already keep skaters and goalies distinct.
Situation eligibility currently limits skater situations to configured skater
slots and the goalie situation to `G`. Used cards are excluded by card ID in the
local engine and by used lineup slot in the server RPC.

### Server-authoritative flow

- `start_match` validates the active lineup and difficulty, selects the curated
  opponent, snapshots both lineups and the round sequence, and prevents rerolls
  by returning an existing open ticket.
- `play_match_round` locks the account and ticket, validates round order and the
  idempotency key, rejects reused or ineligible player selections, chooses the
  opponent card, calculates both scores, and stores an immutable transcript.
- `settle_match` derives the match outcome from exactly five stored rounds and
  remains the only reward/progression writer.

The rebuild must replace only category/score/tie and AI-selection policy inside
the first two RPCs. Ticket ownership, locks, round ordering, request
idempotency, anti-reroll behavior, and settlement stay intact.

### Current match UI and coverage

`GameApp` owns start/resume/round/settlement orchestration.
`MatchScreen` renders the match HUD, selection hand, reveal result, and final
state. The shared `HockeyCard` renders all card types and approved local assets.
Existing Vitest coverage exercises deterministic battle transitions, hidden
selection, card reuse, role eligibility, AI legality, and authoritative response
application. Existing Playwright coverage completes and settles a five-round
match, retries failed settlement, and checks surrounding MVP flows. pgTAP covers
ticket anti-reroll, round request idempotency, card reuse, and settlement
idempotency.

### Root causes of the unclear UX

1. A round is named as a hockey scenario instead of one measurable category.
2. Several attributes and hidden seeded variance contribute to the outcome.
3. Difficulty changes an invisible score variance instead of only opponent
   lineup quality and decision quality.
4. The relevant printed card value is not emphasized during selection.
5. The result presents unexplained derived decimals without the governing rule.
6. Eligibility, used state, timeline state, and tie resolution are not explained
   together in the match presentation.

## Final Quartett rules

Production uses concealed Quartett: the category is visible before selection;
the opponent card and value are revealed only after the player locks a card.
Every match has four skater rounds and one goalie round.

| Role | Category label | Card attribute | Eligible slots |
| --- | --- | --- | --- |
| Skater | Speed | `speed` | LW, C, RW |
| Skater | Shooting | `shooting` | LW, C, RW |
| Skater | Defense | `defense` | LD, RD |
| Skater | Clutch | `clutch` | LW, C, RW, LD, RD |
| Goalie | Reflexes | `reflexes` | G |

The higher integer value printed for that attribute wins. There are no weights,
variance, bonuses, multipliers, or difficulty adjustments.

### Deterministic tie rule

1. Higher visible category value wins.
2. If equal, higher visible OVR wins.
3. If category and OVR are equal, a deterministic server match-seed decision
   wins. The result transcript names the applied tie-break step and the UI states
   it explicitly. No round is recorded as a draw.

The seed is server-issued and immutable, so the last step is reproducible and
cannot be rerolled by the client.

### Difficulty and AI

All difficulties use the identical visible comparison and tie rule. Difficulty
comes from curated opponent lineup quality and decision quality only:

- Rookie chooses a deterministic plausible suboptimal eligible card.
- Pro chooses deterministically from the stronger half of eligible cards.
- Elite chooses the strongest eligible card for the current category.

The AI cannot reuse cards and never sees or changes the player's selection.

## Minimal change boundary

- Replace weighted battle situations with single-category definitions in the
  TypeScript domain and the additive Supabase function migration.
- Remove score variance and add a typed, explicit tie-break transcript.
- Keep `start_match`, `play_match_round`, and `settle_match` signatures and
  idempotency contracts unchanged.
- Extend `HockeyCard` with an optional match-only highlighted stat; do not fork
  the card renderer or change catalog/card content.
- Rebuild only the match presentation and its tests. Auth, ownership, economy,
  prices, rewards, event rotation, objectives, player identity, card counts,
  catalog values, lineup modes, and settlement amounts remain unchanged.
