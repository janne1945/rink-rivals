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

The completion checkout passed:

```sh
pnpm qa:core               # typecheck, 112 Vitest tests, catalog/SQL drift,
                           # balance diagnostics, and production build
pnpm test:e2e              # 104 passed; four intentional dev-mode PWA skips
pnpm test:e2e:production   # 108 passed, including service-worker registration
```

The two additive MVP migrations are applied to project
`zsyoxpirfxajkruqeqam`. After the authority migration, every pgTAP result was
captured from the hosted database inside rollback transactions: 15/15
account/starter assertions, 49/49 match/settlement assertions, and 57/57
market/lineup/reward/security assertions (121/121 total). Generated TypeScript
types were then refreshed from that applied schema.

The local `pnpm supabase:test` command could not connect because this runner has
no Docker-compatible local Postgres. The CLI-only `--linked` form also lacked a
local Supabase access token/project link, so the identical SQL suites were run
through the authenticated Supabase database connection instead. This leaves
the fresh local `db reset` as an environment check, not an untested hosted
schema path.

## Live release

- Production: <https://rink-rivals.vercel.app>
- Vercel deployment: `dpl_3ud7PkqGyEiBEdxvp99QhNnEsqu1` (`READY`)
- Supabase migrations: `complete_mvp_server_authority` and
  `index_mvp_foreign_keys`

A temporary production QA account completed registration, onboarding, lineup
save/activation, a five-round server match, settlement, a market purchase,
logout/login, and a parallel second-session reload. Direct reload of
`/collection` also returns the SPA correctly. The QA account and all cascaded
gameplay data were removed after verification.

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

The production bundle is functional but currently emits Vite's advisory for a
742 kB main JavaScript chunk; route-level splitting is deferred performance
work. Supabase's leaked-password protection remains a project-dashboard
setting to enable before a broader public launch. Newly added foreign-key
indexes may be reported as unused until the hosted workload has exercised
them.
