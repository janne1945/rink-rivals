# AI deck variation investigation

This note records the server-side cause and the smallest safe change before implementation.

## Current behavior

1. **Lineup source.** `public.start_match` loads the single `public.ai_opponents` row for the requested mode and difficulty, validates its `lineup_slots`, then copies those slots into `match_tickets.opponent_snapshot`.
2. **Fixed card versions.** `public.ai_opponents` has a unique `(mode, difficulty)` row and each of its nine seed rows contains one fixed six-card `lineup_slots` JSON object. Those values are CardVersion IDs such as `nhl-brady-tkachuk-base`.
3. **Match ID and seed.** `client_match_id` is an idempotency and resume key. A retry returns the persisted ticket, while a different ID during an open match resumes that same ticket to prevent rerolls. A random `ticket_seed` is created only after the fixed opponent lineup has already been selected and validated.
4. **Root cause.** Neither `client_match_id` nor `ticket_seed` participates in opponent card selection. Every fresh ticket for the same `(mode, difficulty)` therefore snapshots the same six IDs. The seed affects later deterministic match behavior, but not deck composition.

## Minimal change boundary

Add one private server function that derives a valid six-card lineup from `card_catalog` using opponent ID, difficulty, mode, and the server-issued match seed. Replace only the fresh-ticket branch of `public.start_match` so it generates and validates that lineup before persisting the immutable snapshot. The existing ticket-first return path, open-ticket lookup, round behavior, settlement, economy, ratings, card values, rotation, and ownership remain unchanged.

The candidate pool must contain active roster cards that match slot and league rules. Rookie uses a broad lower-overall base-card band, Pro a narrower higher-overall base-card band, and Elite a smaller high-overall event-card band. Open Ice must still mix NHL and PWHL cards. Stable hashing over the server seed, opponent ID, and slot makes a seed reproducible while allowing fresh server seeds to produce other valid combinations.

The implemented variant budget is 16 Rookie, 8 Pro, and 3 Elite buckets per opponent. The seed selects a bucket, then stable MD5 ordering selects one valid, unique player for each of `LW`, `C`, `RW`, `LD`, `RD`, and `G`. This caps Elite predictability without returning to one fixed deck and guarantees a broader Rookie variant space.
