# Supabase integration boundary

Supabase now owns authenticated account data: the profile, owned cards, and
server-backed lineups. The browser app accesses those records through
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

App bootstrap strips the legacy `SaveGameV2` copies of Credits, collection,
lineups, active lineup ids, collection score, unlock ids, and purchase history
before persisting the local record. Local updates pass through the same boundary,
so stale Dexie account fields cannot become authoritative again.

## Data that remains Dexie-led

- objective and Rivalry Road progress
- completed-match count and local match-reward idempotency history
- preferred AI difficulty
- sound and reduced-motion settings
- rotating-shop UI state

The battle currently lives in React memory and is not persisted. Match completion
updates local progression, but does not change the Supabase Credit balance. The
UI states this explicitly.

Server mutations still required before these features can be re-enabled:

- atomic market purchase RPC for Credits and `user_cards`
- atomic lineup editing/activation RPC
- server-backed match Credit and objective reward claims
- server-backed Rivalry Road card claim

Until those APIs exist, market purchases, lineup edits, and Rivalry Road card
claims never write fallback account data to Dexie.
