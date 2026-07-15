# MVP completion status

Status date: 2026-07-15

Release commit: `c2246d2e09ff79d2dcb50e41c31245568f10dfc7`

## Current checkout

The account and progression boundary remains Supabase-authoritative: Auth,
Credits, ownership, lineups, purchases, matches, objectives, and Rivalry Road
are server-owned. Dexie stores only non-authoritative local state. Account
registration, login, session restoration, logout, starter-team selection, and
the three six-card lineup modes remain part of the application flow.

The content foundation now provides:

- 32 active NHL teams and 12 active PWHL teams;
- 792 usable player identities, exactly 18 per team, plus two inactive
  `legacy-retained` identities required by existing references;
- 264 Starter cards (six per team), 792 Base cards, 107 Event cards, and 15
  Reward cards;
- one validated starter squad and at least two Event cards for every team;
- Base ratings of 68-86, Starter ratings of 68-76 with a 72.00 team average,
  early Event ratings of 84-90, and Reward ratings no higher than 90;
- explicit `base-market`, `event-shop`, and `reward-only` availability, so
  Starter and Reward cards cannot leak into a shop;
- deterministic, league- and role-specific rating generation with audited
  overrides and real Event strength/tradeoff profiles;
- deterministic Rookie, Pro, and Elite opponents for NHL Circuit, PWHL
  Circuit, and Open Ice, plus seed-based economy and battle diagnostics.

The approved official-source snapshot is dated 2026-07-14. It includes 38
PWHL draft-rights records used only where active roster depth is insufficient,
one official NHL roster candidate, and two retained legacy identities. These
statuses are explicit and are not presented as active-roster claims. A total of
371 identities require manual review for roster status, generic position
projection, nationality ambiguity, or another documented source limitation.

## Data and migration safety

All 16 checked-in migrations are present on the linked Supabase project
`zsyoxpirfxajkruqeqam`. `supabase db push --linked --dry-run` reports that the
remote database is up to date. The latest migration is
`20260714211852_add_lineup_slots_created_at.sql`; a hosted query confirms that
all 18 existing `lineup_slots` rows have a non-null `created_at` value.

The generated `database.types.ts` is byte-for-byte equivalent to fresh types
generated from the linked public schema. Migration history validation passes
with eight immutable baselines and eight additive migrations.

Docker is not installed in this environment. A fresh local `supabase db reset`
and the official `supabase test db` runner therefore remain unavailable.
Supabase CLI 2.109.1 also stops the linked form of that command before SQL
execution because it invokes Docker. The repository's Docker-free Management
API fallback now executes the same rollback-wrapped SQL files, rejects uncaught
SQL errors, and validates TAP failures and plan mismatches. All eight files and
263 assertions pass against the hosted schema without leaving test users or
other persistent test data.

## Verification evidence

The following checks passed on release commit `c2246d2` on 2026-07-15:

```sh
pnpm catalog:generate:check
pnpm catalog:validate
pnpm catalog:sql:check
pnpm exec tsx scripts/check-migration-history.ts
pnpm typecheck
pnpm test                    # 34 files, 203 tests
pnpm assets:validate
pnpm balance                 # 72,000 AI + 4,000 league matches
pnpm build
pnpm test:e2e                # 160 passed, 4 expected dev-mode PWA skips
pnpm test:e2e:production     # gated production build plus 164 tests
pnpm audit --prod            # no known vulnerabilities
supabase migration list --linked
supabase db push --linked --dry-run
pnpm supabase:test:linked:management # 8 files, 263 assertions
supabase db lint --linked --schema public
supabase db advisors --linked --type all
supabase gen types --linked --schema public | diff - database.types.ts
```

The catalog validator reports 44 teams, 792 usable plus two retained players,
264 Starter, 792 Base, 107 Event, and 15 Reward cards. Base averages are 77.00
for NHL and 77.01 for PWHL; every starter squad averages 72.00.

The deployment gate was verified in all three relevant states: `pnpm env:check` fails
when either public Supabase value is missing, accepts safe public test values,
and rejects an `sb_secret_` browser credential. `vercel.json` uses
`pnpm build:deployment`, which runs that gate before the production bundle. At
runtime, missing configuration renders a visible diagnostic screen rather than
a blank page. The Vercel build log for the release commit confirms that the
Production environment contained a valid Supabase URL and publishable key.

The current default balance run passed with a 45.50% NHL win rate, 54.50% PWHL
win rate, no ties, and a 9.00 percentage-point league gap. The 72,000-match AI
run preserved the intended Rookie/Pro/Elite ordering in all three modes. Exact
AI and economy methodology is in `docs/economy-balance.md`.

Playwright passed the account, onboarding, purchase, lineup, match, retry,
progression, filter, accessibility-size, overflow, and reload paths on phone,
phone landscape, tablet, and desktop. The production run also passed the PWA
manifest and service-worker check on every viewport. Progression periods are
anchored to the server timestamp and advance by monotonic elapsed time, rather
than trusting later device-clock changes.

A separate headless browser smoke test against
<https://rink-rivals.vercel.app> loaded the real sign-in/register screen with
HTTP 200, no Vite error overlay, no console errors, and no failed responses.
Vercel reports no grouped runtime errors for the project in the preceding seven
days.

The production build splits `GameApp`, onboarding, and the generated catalog
from the initial shell. The local gated build reports 468.14 kB for the initial
JavaScript, 189.79 kB for `GameApp`, and 1,619.07 kB (136.69 kB gzip) for the
deferred catalog. Vite still reports its uncompressed 500 kB advisory for that
deferred catalog chunk; the PWA precache is 2,288.86 KiB.

## Actual release status

The MVP is already in Production at <https://rink-rivals.vercel.app>. Vercel
deployment `dpl_6eaxj9LrvcLAVP1dLwxdruqyf3cf` is `READY`, targets Production,
and was built from the exact current/origin `main` commit `c2246d2`. The build,
environment gate, alias assignment, public HTTP response, and unauthenticated
browser entry are healthy. There is no separate Preview for this exact commit;
because the identical commit is already live and has been smoke-tested, that is
a process gap rather than a blocker to the current deployment.

The accurate decision is therefore: **deployed and operational with the hosted
database regression gate green**. The web application and hosted schema are
live on the same release state. Only fresh-database replay remains unproven in
this Docker-less environment.

## Remaining blockers

1. **Fresh-database migration proof is unavailable on this machine.** Docker is
   absent, so migrations have not been replayed from an empty local database.
   Hosted migration parity, dry-run, generated-type parity, and all 263 hosted
   assertions are green, but they do not prove that all migrations replay from
   a clean database.

The former Quartett plan mismatch is resolved after confirming that all 14
assertions are intentional and independent. The complete server-authority file
now passes all 61 assertions through the Management API fallback. Its
insufficient-Credits branch catches only SQLSTATE `P0001` with the exact
`Not enough Credits.` message; a different code/message or any other uncaught
database error still fails the runner.

## Deliberate MVP boundaries and residual risk

Deferred systems remain public matchmaking/search, Private Faceoff room codes,
rankings, chat, clans, trading, auctions, packs as a primary economy, real money
or premium currency, full multi-line rosters, and advanced chemistry.

Player and card art stays neutral or uses already approved local Signature
assets. Official logos and newly downloaded player imagery are not shipped.
Names, fantasy ratings, generic PWHL position projections, draft-rights depth,
and the Boston roster candidate require the documented manual data and rights
review before a broader public content release. This is an editorial/rights
gate, not a technical deployment failure.

Current non-blocking hardening findings are: leaked-password protection is
disabled in Supabase Auth; the security advisor flags the intentionally exposed
authenticated `SECURITY DEFINER` RPC surface; several server lookup tables have
RLS enabled without direct policies; the PL/pgSQL linter reports a shadowed and
unused `slot_index` variable in `build_ai_opponent_lineup`; and the catalog
chunk remains over Vite's uncompressed-size advisory. Asset validation still
uses documented neutral fallbacks and reports one missing Signature source
original. These findings should be scheduled, but none currently demonstrates
a broken production flow.
