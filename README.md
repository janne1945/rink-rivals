# Rink Rivals

Rink Rivals is a mobile-first, unofficial hockey card game that treats NHL and
PWHL collections as equal parts of one fantasy game. The MVP supports account
registration, an idempotent starter club, six-card lineups, deterministic AI
battles, server-settled rewards, permanent Base Market cards, recurring Event
Shop rotations, daily and weekly objectives, and Rivalry Road.

The project is a non-commercial prototype. It uses neutral team treatment and
replaceable, locally served player artwork. Player images are imported only by
an explicit development command; the app makes no runtime requests to NHL or
PWHL image services. Missing approved images resolve to a neutral placeholder.

Published MVP: <https://rink-rivals.vercel.app>. The published site can lag the
current checkout; this content-foundation change is not deployed automatically.

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
variable. `pnpm env:check` validates the deploy-time values without printing
them. Vercel runs that gate through `pnpm build:deployment`; a missing or unsafe
value stops the deployment build. A normal local `pnpm build` remains possible
without credentials so the runtime configuration fallback can be tested: the
app renders a visible diagnostic instead of a blank screen.

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
pnpm env:check             # fail unless safe public Supabase values are present
pnpm build:deployment      # environment gate followed by the production build
pnpm test                  # Vitest unit, component, and adapter tests
pnpm supabase:test         # pgTAP database/RLS/RPC suite (requires local Supabase)
pnpm exec supabase test db --linked # same pgTAP suite on the linked project
pnpm test:e2e              # Playwright on phone, landscape, tablet, and desktop
pnpm test:e2e:production   # gated production build plus Playwright
pnpm catalog:generate:check # generated catalog matches the approved snapshot
pnpm catalog:validate      # catalog/schema/lineup/event validation
pnpm assets:validate       # asset references/files/fallbacks/source diagnostics
pnpm catalog:sql:check     # generated SQL projection matches TypeScript data
pnpm balance               # league, opponent, economy, and progression diagnostics
```

Playwright uses a stateful Supabase HTTP test double for deterministic browser
coverage. It complements, but does not replace, the pgTAP suite that exercises
the actual Postgres functions and RLS policies.

## Catalog workflow

The application never scrapes or downloads sports statistics at runtime.
The checked-in snapshot dated 2026-07-14 covers 32 NHL and 12 PWHL teams. The
generated launch catalog contains 792 usable player identities (18 per team),
two inactive legacy-retained identities, 264 Starter cards, 792 Base cards,
107 Event cards, and 15 Reward cards. NHL and PWHL are normalized separately;
all current teams have a six-card starter squad and at least two Event cards.

Development imports are manual and review-gated. They cannot alter runtime data
or the database by themselves. See [`scripts/README.md`](scripts/README.md) for
the official snapshot workflow, deterministic generation, audited overrides,
validation rules, generated SQL projection, and balance workflow. Source
provenance, reviewed secondary-position evidence, and the 371 manual-review records are documented in
[`docs/content-data-sources.md`](docs/content-data-sources.md).
The canonical player-art structure, resolver rules, import command, and current
source gaps are documented in [`docs/asset-pipeline.md`](docs/asset-pipeline.md).

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

See [`MVP_STATUS.md`](MVP_STATUS.md) for the verification evidence, checks that
remain blocked in this environment, and release boundaries of this checkout.
