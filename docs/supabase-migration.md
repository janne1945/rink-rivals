# Supabase setup, migrations, and security

Supabase is the authoritative store for every authenticated value that can
affect the collection or progression. Dexie keeps local preferences only. The
browser never supplies a trusted price, balance, reward amount, match outcome,
or opponent selection.

## Environment

Create `.env` from `.env.example` and use the local or hosted project's Data
API values:

```sh
cp .env.example .env
```

Only these public values are used by Vite:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Never put a secret key, database password, or `service_role` key in a `VITE_`
variable. `.env` and its local variants are ignored by Git.

## Local database

A Docker-compatible container runtime is required by the Supabase CLI:

```sh
pnpm supabase:start
pnpm exec supabase db reset
pnpm supabase:test
pnpm supabase:types
```

`db reset` is the clean-schema check: it applies every file under
`supabase/migrations` in timestamp order and loads no private production data.
`supabase:test` runs the pgTAP files under `supabase/tests`. Regenerate
`src/infrastructure/supabase/database.types.ts` whenever the schema changes.

## Migration-history reconciliation (2026-07-14)

The eight checked-in migration filenames were reconciled with the versions
already recorded by the hosted project. This was a local rename only: it did
not alter the hosted migration history, schema, or data, and the local SQL
bodies were preserved byte for byte. Check the ordered versions, names, and
local body hashes without connecting to Supabase:

```sh
pnpm exec tsx scripts/check-migration-history.ts
```

Four historical entries have known local-versus-hosted body drift:
`20260713035200`, `20260713035355`, `20260713035431`, and `20260713040004`.
The two local settle-match fixes at `20260713035355` and `20260713035431` also
have identical SQL bodies; the check detects and explicitly reports this known
duplicate while rejecting any new duplicate. A clean local `db reset` and the
pgTAP suite remain required before treating the checked-in chain as a proven
fresh-install history. Do not rename or edit an applied migration again; add a
new migration for every future schema change.

For a linked non-production project, review the generated diff before applying
it:

```sh
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase db diff --linked
pnpm exec supabase db push --dry-run
pnpm exec supabase db push
```

Do not run `db reset` against a hosted project. The MVP migration is additive;
it preserves existing profiles, ownership, lineups, matches, and progression.

## Authoritative tables

- `profiles`: display name, Credits, onboarding, collection-match count
- `user_cards`: owned quantities
- `lineups` and `lineup_slots`: separate NHL, PWHL, and Open Ice sixes
- `card_catalog`, `event_definitions`: server-side price and availability data
- `purchase_receipts`, `reward_receipts`: immutable idempotency records
- `ai_opponents`, `match_tickets`, `match_rounds`: server-owned match input and transcript
- `matches`, `match_rewards`: immutable settlement and reward receipt
- `objective_progress`, `rivalry_road_progress`: UTC progression periods

The TypeScript catalog remains the presentation and pure-simulation dataset.
The checked-in migration contains a generated projection of the same card IDs,
attributes, prices, positions, leagues, and event sets. Catalog validation must
pass before that projection is changed.

## Mutation RPCs

All account mutations derive the user from `auth.uid()` and serialize the
account row before changing economy state.

- `claim_starter_team(selected_team_id)` is retry-safe and grants the starter
  collection, initial lineup, and Credits once.
- `get_market_state()` returns server time, the recurring UTC event, current
  offers, server prices, and owned quantities.
- `purchase_card(client_request_id, offer_id)` resolves the live offer on the
  server, debits Credits, upserts ownership, and writes one purchase receipt.
- `save_lineup(lineup_id, name, mode, slots)` validates ownership, six unique
  card versions, slot eligibility, role, and league before writing. New drafts
  send a client-generated UUID; retrying that UUID updates the same row instead
  of creating a duplicate after a lost response.
- `activate_lineup(lineup_id)` revalidates the saved six and keeps one active
  lineup per mode.
- `claim_rivalry_reward(client_request_id, card_id)` validates Road completion,
  permitted choices, and the single immutable reward receipt.
- `start_match(client_match_id, mode, difficulty)` snapshots the active lineup,
  curated opponent, five situations, server seed, and unlocked tier. A later
  start request resumes the one open ticket and returns its player snapshot and
  ordered round transcript; it cannot reroll a revealed result or switch tier.
- `play_match_round(client_match_id, round_index, player_card_id,
  client_request_id)` validates the next unused eligible card, chooses the AI
  card, computes bounded server scores, and writes an immutable round.
- `settle_match(client_match_id)` requires five rounds and derives the outcome,
  rewards, objectives, and Rivalry Road only from the stored transcript.

Purchase, reward, round, and match request IDs are scoped to the authenticated
user. Retrying the same ID and payload returns the original result. Reusing an
ID for different data fails without a partial debit or duplicate reward.
Client-generated lineup UUIDs provide the equivalent retry identity for a new
lineup save.

## RLS and grants

RLS is enabled on all account and server tables. Authenticated users can select
only their own account rows. Internal catalog and opponent tables are not
directly exposed to browser roles; their required projections are returned by
RPCs.

Browser roles have no direct `INSERT`, `UPDATE`, or `DELETE` grant on Credits,
ownership, lineups, tickets, rounds, rewards, or progression. Profile updates
are column-limited to `display_name`. RPCs use `SECURITY DEFINER` only where an
atomic protected mutation is required, use `set search_path = ''`, schema-
qualify objects, reject unauthenticated calls, revoke execution from `public`
and `anon`, and grant only the intended authenticated entry points.

The Supabase security advisor may report these authenticated
`SECURITY DEFINER` functions as warnings. They are intentional capability
boundaries; the empty search path, explicit grants, ownership checks, locks,
constraints, and receipt uniqueness are the compensating controls.

## Release order

Database and web changes form one contract and should be released together:

1. Back up or confirm point-in-time recovery for the hosted project.
2. Run the clean local reset and pgTAP suite.
3. Run TypeScript, Vitest, catalog, balance, build, and Playwright checks.
4. Apply the additive migration.
5. Regenerate types from the migrated schema.
6. Deploy the matching web build.
7. Exercise registration, starter claim, one complete match, one purchase, a
   lineup save/activation, logout/login, and a second-session reload.
8. Re-run Supabase security and performance advisors.

The completion release uses a second additive migration,
`20260713201000_index_mvp_foreign_keys.sql`, for the covering indexes reported
by the performance advisor. Fresh indexes can remain in the advisor's
"unused" informational list until representative hosted traffic exercises
them.

Never deploy the one-argument `settle_match` client before its matching
database migration, or keep an old four-argument client after that migration.
