# Social Competition system

This document is the shared product and engineering contract for Rivalry Arena,
Live Ghost Challenge, and the free Season Locker. It supplements the visible
Quartett rules in `docs/quartett-gameplay.md`; it does not replace or alter
those rules.

## Product boundary

### Rivalry Arena

Rivalry Arena is asynchronous community competition. The server finds the
closest valid active lineup owned by a different account, snapshots both
lineups, and lets the existing Pro server AI control the rival. The player
still chooses every card across the same five transparent Quartett categories.
There is no public search, ranking, division, or hidden power adjustment.

An Arena settlement writes the same Credits, objectives, and Rivalry Road
progression as a regular match and grants 140 Season XP. Both settlement and XP
use immutable source receipts, so retries return the existing result.

### Live Ghost Challenge

Live Ghost is private synchronous multiplayer for exactly two authenticated
accounts. A host creates a six-character code, a guest joins with a compatible
lineup, and the server snapshots both lineups before either player readies up.
The room starts only when both players are ready.

Each of five rounds follows this sequence:

1. Both clients receive the same server-owned category and only their own
   eligible hand.
2. Each player submits one card with a unique request id.
3. The first choice is stored in an RLS-protected table and the response reveals
   only that the player is locked.
4. A locked choice cannot be changed or reused.
5. Only after both choices exist does the server compare the visible category,
   OVR tie-break, and immutable match-seed tie-break.
6. The resolved round is written once and returned from the same caller-shaped
   room-state RPC to both clients.

The room remains resumable for 24 hours after puck drop. Reload, focus recovery,
Realtime invalidations, and a 15-second fallback heartbeat all fetch fresh
server state. Realtime sends only `{ room_id, state_version }` on a private
room topic. It never carries a card choice or result. Once the lobby or
reconnect deadline passes, the server closes the room and rejects a delayed
ready request instead of reviving stale state.

Live Ghost never writes Credits, cards, objectives, Rivalry Road, or Season XP.
The room response includes an explicit all-zero reward object, and the client
rejects any response that violates that contract. Completed rooms retain only
head-to-head totals and can create a fresh private rematch room.

### Season Locker

Season Zero lasts exactly 28 days and exposes all 30 reward tiers before play.
There is one free path: no paid tier, premium currency, random reward, purchasable
XP, or booster. Rewards include Credits, emblems, banners, titles, broadcast
stings, and one guaranteed seasonal NHL and PWHL card.

Faceoff and Rivalry Arena are the only current Season XP sources. XP and reward
claims have unique source or client-request receipts. A tier can therefore be
claimed exactly once even when a response is lost and retried.

## Authority map

| Concern | Authoritative owner | Client receives |
| --- | --- | --- |
| Arena opponent selection | `start_arena_match` | Masked club identity and six unknown slots |
| Arena AI choice and score | `play_arena_match_round` | Revealed card and transparent transcript after play |
| Arena rewards and XP | `settle_arena_match`, `grant_season_xp` | Idempotent settlement balances |
| Live membership and lineup snapshot | Live room/player tables | Caller-shaped room state |
| Hidden Live choices | `live_rivalry_choices` | Only `locked: true/false` before resolution |
| Live result | `lock_live_rivalry_choice` | Immutable resolved rounds and final result |
| Reconnect state | `get_live_rivalry_room` | Current state version and caller-safe state |
| Season XP and claims | Season progress/receipt/claim tables | Progress plus 30 visible rewards |

All Social Competition tables use RLS with explicit RPC-only deny policies.
Public mutation functions validate `auth.uid()`, room or ticket ownership,
lineup mode, current round, card eligibility, card reuse, and idempotency keys.
The Realtime membership predicate lives in a non-exposed `private` schema.

## RPC surface

- Season: `get_season_locker`, `claim_season_reward`
- Arena: `start_arena_match`, `play_arena_match_round`, `settle_arena_match`
- Live: `create_live_rivalry_room`, `join_live_rivalry_room`,
  `get_live_rivalry_room`, `set_live_rivalry_ready`,
  `lock_live_rivalry_choice`, `leave_live_rivalry_room`,
  `create_live_rivalry_rematch`

The application calls these through `SupabaseAccountRepository`. UI components
do not query Social Competition tables directly and never calculate an
authoritative rival choice, round winner, final result, reward, or XP grant.

## Verification contract

`supabase/tests/social_competition_system.test.sql` runs a complete two-account
Live match inside a rollback transaction. Its 71 assertions cover early-choice
secrecy, wrong-round and foreign-room rejection, direct table denial, private
Realtime membership, five-round completion, zero rewards, Arena real-lineup
selection and settlement idempotency, Faceoff/Arena XP, and one-time Season
claims, plus expired-lobby and reconnect-window cleanup.

Vitest covers repository payload validation and both new screens. Playwright
completes all five Live rounds with a reload between locks, verifies that the
first lock exposes no reveal, confirms the reward-free final, and checks Arena,
Season, keyboard focus, reduced motion, and horizontal overflow on phone,
phone landscape, tablet, and desktop.
