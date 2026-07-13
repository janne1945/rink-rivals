# MVP completion status

Status date: 2026-07-13

## Implemented

- Supabase Auth registration, login, session restoration, logout, onboarding,
  and an idempotent six-card starter club
- Supabase-authoritative Credits, collection, three-mode lineups, purchases,
  immutable receipts, matches, objectives, and Rivalry Road
- Atomic and idempotent Base/Event purchases with server prices and UTC offer
  validation
- Client-UUID-backed lineup creation plus server validation, editing, and one
  active lineup per NHL Circuit, PWHL Circuit, and Open Ice
- Nine curated AI opponents across Rookie, Pro, and Elite, with five
  server-scored rounds, bounded variance, resumable tickets, and idempotent
  settlement
- Ten recurring weekly UTC events, six cards per event, one deterministic 15%
  Spotlight offer, 60 event cards, and ten reward-only Rivalry cards
- UTC daily/weekly Objectives and one-time Rivalry Road card choice
- Responsive phone portrait, phone landscape, tablet, and desktop flows,
  reduced-motion handling, and production PWA registration

Dexie now stores local preferences and harmless UI state only. It is not a
source for account economy or progression.

## Verification

The completion checkout is verified with these commands:

```sh
pnpm typecheck
pnpm test
pnpm catalog:validate
pnpm catalog:sql:check
pnpm balance
pnpm build
pnpm test:e2e
pnpm test:e2e:production
pnpm exec supabase test db --linked
```

The full migration is additionally executed inside a transaction against the
linked schema and rolled back, so syntax, existing-data constraints, generated
counts, and function signatures are checked without changing hosted state.

## Deliberate MVP boundaries

Deferred systems are public matchmaking and search, Private Faceoff room
codes, rankings, chat, clans, trading, auctions, packs as a primary economy,
real money or premium currency, full multi-line rosters, and advanced
chemistry. Placeholder player artwork is intentional and has a built-in visual
fallback; public release still requires a separate data, imagery, and rights
review.

The AI balance diagnostic mirrors the PostgreSQL decision policy and variance
distribution in TypeScript, but its seeded PRNG is not byte-identical to
PostgreSQL `hashtextextended`.
