# Supabase integration boundary

Supabase now owns authenticated account data: the profile, owned cards, and
server-backed lineups and match progression. The browser app accesses those records through
`src/infrastructure/supabase`.

The checked-in migrations are additive to the early schema that already existed
in the linked project. `favorite_team_id` is the persisted starter selection;
`claim_starter_team` is intentionally the only authenticated `SECURITY DEFINER`
RPC because it must atomically write protected credits and starter ownership.

## Current source-of-truth boundary

After authentication, Supabase is the only source read by the UI for:

- profile identity, onboarding state, and Credits (`profiles`)
- the owned-card collection (`user_cards`)
- the active lineup and its slots (`lineups`, `lineup_slots`)
- completed matches and immutable reward receipts (`matches`, `match_rewards`)
- daily/weekly goals and Rivalry Road (`objective_progress`, `rivalry_road_progress`)

App bootstrap strips the legacy `SaveGameV2` copies of Credits, collection,
lineups, active lineup ids, collection score, unlock ids, and purchase history
as well as completed-match, reward-idempotency, objective and Rivalry Road data
before persisting the local record. Local updates pass through the same boundary,
so stale Dexie account fields cannot become authoritative again.

## Data that remains Dexie-led or cached

- preferred AI difficulty (local setting)
- sound and reduced-motion settings
- rotating-shop UI state

The in-progress battle currently lives in React memory and is not persisted.
Once it reaches the final horn, `settle_match` is the only writer for Credits,
the completed-match counter, reward idempotency, goals, and Rivalry Road. Legacy
Dexie fields remain in the V2 schema only for backward-compatible decoding and
are reset at the account boundary; they can be removed in the next save-format
version. No local history is automatically uploaded.

Server mutations still required before these features can be re-enabled:

- atomic market purchase RPC for Credits and `user_cards`
- atomic lineup editing/activation RPC
- server-backed Rivalry Road card claim

Until those APIs exist, market purchases, lineup edits, and Rivalry Road card
claims never write fallback account data to Dexie.
