# Rink Rivals

Rink Rivals is a mobile-first, unofficial hockey card game that treats NHL and
PWHL collections as equal parts of one fantasy game. The MVP supports account
registration, an idempotent starter club, six-card lineups, deterministic AI
battles, server-settled rewards, permanent Base Market cards, recurring Event
Shop rotations, daily and weekly objectives, and Rivalry Road.

The project is a non-commercial prototype. It uses neutral team treatment and
replaceable placeholder artwork; no official league, team, or player imagery is
required at runtime.

## Stack and architecture

- React 19, TypeScript, Vite, React Router, and CSS Modules
- Supabase Auth and Postgres for every account-owned or progression value
- Dexie only for local preferences and non-authoritative UI state
- Zod for catalog and persistence validation
- Vitest, Testing Library, pgTAP, and Playwright
- Vite PWA with a generated service worker

The source tree keeps pure game rules under `src/domain`, generated and
validated content under `src/data`, screens under `src/features`, and external
adapters under `src/infrastructure`. The card battle engine has no React,
browser, or Supabase dependency.

## Requirements

- Node.js 22 or newer
- pnpm 11
- Docker-compatible container runtime for the local Supabase stack

Install dependencies:

```sh
pnpm install --frozen-lockfile
```

Copy the environment template and fill it with the project's Supabase Data API
values:

```sh
cp .env.example .env
```

Only `VITE_SUPABASE_URL` and a Supabase publishable key belong in the browser
environment. Never place a secret key or `service_role` key in a `VITE_`
variable.

## Local development

Start the local Supabase stack, reset it through all checked-in migrations, and
run the app:

```sh
pnpm supabase:start
pnpm exec supabase db reset
pnpm dev
```

The app is served at `http://localhost:5173`. Supabase's local URLs and keys are
printed by `supabase start`; use those values in `.env`.

When the schema changes, regenerate the checked-in TypeScript types:

```sh
pnpm supabase:types
```

Migration and security details are documented in
[`docs/supabase-migration.md`](docs/supabase-migration.md).

## Quality commands

```sh
pnpm build                 # TypeScript project check and production bundle
pnpm test                  # Vitest unit, component, and adapter tests
pnpm supabase:test         # pgTAP database/RLS/RPC suite (requires local Supabase)
pnpm exec supabase test db --linked # same pgTAP suite on the linked project
pnpm test:e2e              # Playwright on phone, landscape, tablet, and desktop
pnpm catalog:validate      # catalog/schema/lineup/event validation
pnpm catalog:sql:check     # generated SQL projection matches TypeScript data
pnpm balance               # league, opponent, economy, and progression diagnostics
```

Playwright uses a stateful Supabase HTTP test double for deterministic browser
coverage. It complements, but does not replace, the pgTAP suite that exercises
the actual Postgres functions and RLS policies.

## Catalog workflow

The application never scrapes or downloads sports statistics at runtime.
Development imports are manual, review-gated, and cannot overwrite the approved
catalog directly. See [`scripts/README.md`](scripts/README.md) for the CSV
format, overrides, validation rules, generated SQL projection, and balance
workflow.

## MVP data authority

Supabase is authoritative for profiles, Credits, owned cards, lineups,
purchases, matches, objectives, and Rivalry Road. Browser requests never provide
a trusted price or balance. Mutating RPCs derive the authenticated user through
`auth.uid()`, validate catalog and availability data in Postgres, and use
request IDs or unique receipts for idempotency.

Dexie is deliberately unable to restore account data into the cloud model. Old
local account fields are stripped at the account boundary and retained only for
safe legacy-save decoding until the next local schema migration.

## Product boundary

The first MVP intentionally excludes public matchmaking, room-code Private
Faceoff, chat, rankings, trading, auctions, real-money purchases, premium
currency, packs as a primary acquisition path, and full multi-line rosters.
Those systems must not bypass the shared battle rules or server-owned economy
when added later.

See [`MVP_STATUS.md`](MVP_STATUS.md) for the verified completion state and
remaining boundaries of the current checkout.
