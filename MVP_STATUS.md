# MVP completion status

Status date: 2026-07-14

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

`20260713223330_content_foundation.sql` is a new additive migration. It projects
the validated teams, player identities, cards, events, AI opponents, and starter
squads without deleting account ownership, Credits, lineups, receipts, matches,
or progression. New starter grants are account-locked and idempotent. Existing
claimed accounts are snapshotted to `starter_migration_audits` for manual review
instead of being rewritten automatically.

The migration has **not** been applied to a hosted project in this checkout.
The repository is not linked to a Supabase project in this environment, so a
linked dry run was not run. Docker is unavailable, so neither a fresh local
`supabase db reset` nor the local pgTAP suite was run. These are distinct release
blockers; catalog/SQL drift checks are not substitutes for either database
verification.

## Verification evidence

The following current-checkout checks have passed:

```sh
pnpm catalog:generate:check
pnpm catalog:validate
pnpm catalog:sql:check
pnpm exec tsx scripts/check-migration-history.ts
pnpm typecheck
pnpm test                    # 28 files, 160 tests
pnpm balance                 # 72,000 AI + 4,000 league matches
pnpm build
pnpm test:e2e                # 132 passed, 4 expected dev-mode PWA skips
pnpm test:e2e:production     # production build plus 136 passed
```

The catalog validator reports 44 teams, 792 usable plus two retained players,
264 Starter, 792 Base, 107 Event, and 15 Reward cards. Base averages are 77.00
for NHL and 77.01 for PWHL; every starter squad averages 72.00.

The deployment gate was verified in both directions: `pnpm env:check` fails
when either public Supabase value is missing, accepts safe public test values,
and rejects an `sb_secret_` browser credential. `vercel.json` uses
`pnpm build:deployment`, which runs that gate before the production bundle. At
runtime, missing configuration renders a visible diagnostic screen rather than
a blank page. `pnpm build:deployment` passed with safe mock public values and
failed before bundling when those values were absent.

The default balance run passed with a 47.95% NHL win rate, 52.05% PWHL win
rate, no ties, and a 4.10 percentage-point league gap. The recorded 1,000-seed
calibration also passed all 36 AI scenarios; Starter-versus-Rookie landed at
59.9%, 46.2%, and 52.8% across NHL, PWHL, and Open modes. A separate
10,000-pair league stress run narrowed the gap to 1.28 percentage points. Exact
AI and economy results are in `docs/economy-balance.md`.

Playwright passed the account, onboarding, purchase, lineup, match, retry,
progression, filter, accessibility-size, overflow, and reload paths on phone,
phone landscape, tablet, and desktop. The production run also passed the PWA
manifest and service-worker check on every viewport. Progression periods are
anchored to the server timestamp and advance by monotonic elapsed time, rather
than trusting later device-clock changes.

The production build splits `GameApp`, onboarding, and the generated catalog
from the initial shell. The gated production JavaScript is 467.25 kB (136.74
kB gzip), `GameApp` is 178.60 kB (57.62 kB gzip), and the deferred catalog is
1,447.98 kB (116.44 kB gzip). Vite still reports its uncompressed 500 kB
advisory for that deferred catalog chunk; the PWA precache completed at
2,097.69 KiB.

## Release status

The existing public MVP is <https://rink-rivals.vercel.app>, but this checkout
has not been pushed or deployed. No Preview deployment was created or tested,
and no Production environment variables were inspected or changed. The prior
deployment ID and historical production QA results were removed from this
status because they do not verify the current content foundation.

Production release remains blocked until all of the following pass on the exact
release commit:

1. fresh local migration reset and local pgTAP, or an explicitly approved
   environment with those capabilities;
2. linked non-production migration dry run and manual legacy-audit review;
3. regeneration of `database.types.ts` from that migrated schema;
4. Preview environment-variable verification and Preview smoke test.

The mega-prompt Definition of Done is therefore **not fully satisfied yet**:
the implementation is present, but fresh-database and Preview-deployment proof
are unavailable in this environment.

## Deliberate MVP boundaries and residual risk

Deferred systems remain public matchmaking/search, Private Faceoff room codes,
rankings, chat, clans, trading, auctions, packs as a primary economy, real money
or premium currency, full multi-line rosters, and advanced chemistry.

Player and card art stays neutral or uses already approved local Signature
assets. Official logos and newly downloaded player imagery are not shipped.
Names, fantasy ratings, generic PWHL position projections, draft-rights depth,
and the Boston roster candidate require the documented manual data and rights
review before a public content release. The deferred generated catalog remains
larger than Vite's default uncompressed chunk advisory, although its gzip size
is 116.44 kB and it is no longer part of the initial application shell.
