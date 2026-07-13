# Supabase integration boundary

Supabase now owns authenticated account data: the profile, owned cards, and
server-backed lineups. The browser app accesses those records through
`src/infrastructure/supabase`.

The checked-in migrations are additive to the early schema that already existed
in the linked project. `favorite_team_id` is the persisted starter selection;
`claim_starter_team` is intentionally the only authenticated `SECURITY DEFINER`
RPC because it must atomically write protected credits and starter ownership.

Dexie remains the active gameplay save repository for the current MVP. A later
migration should replace or synchronize these `SaveGameV2` areas only after the
account/onboarding flow is integrated:

- `credits` with `profiles.credits`
- `collection` with `user_cards`
- `lineups` and `activeLineupIds` with `lineups` and `lineup_slots`
- purchase/reward idempotency and progression state with dedicated server-side
  tables or RPC functions

Settings, battle-in-progress state, and offline caching may remain local. Do not
remove `DexieGameSaveRepository` until a tested import/reconciliation strategy
for existing local saves exists.
