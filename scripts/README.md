# Catalog development tools

These tools are development-only. The app never downloads NHL or PWHL statistics at runtime, and the import command deliberately cannot replace the approved TypeScript catalog.

## Official source workflow

1. Manually export or transcribe completed-season tables from [NHL Stats](https://www.nhl.com/stats/skaters), [NHL goalie stats](https://www.nhl.com/stats/goalies), and [PWHL Stats](https://www.thepwhl.com/en/stats/player-stats/all-teams/1?sort=points).
2. Keep a local copy of the original exports for audit purposes. Do not commit licensed images, logos, or scraped page content.
3. Normalize the selected columns into one UTF-8 CSV using `templates/stats-template.csv`. Each player has one row per season. Goalies use `position=G`; irrelevant skater or goalie metrics remain `0`.
4. Run the importer with the three seasons ordered from oldest to newest:

   ```sh
   pnpm catalog:import -- \
     --input ./local-imports/stats.csv \
     --seasons 2023-24,2024-25,2025-26 \
     --overrides ./local-imports/overrides.json \
     --output ./local-imports/catalog-candidate.json
   ```

5. Review every warning, proxy result, override, player identity, position, league distribution, and asset reference. The candidate remains `REQUIRES_MANUAL_REVIEW`; it must not be released or copied into `gameCatalog.ts` without human approval.
6. After an approved catalog edit, run `pnpm catalog:validate`, `pnpm balance`, and the full test suite.

The same approved TypeScript data is projected into the server-authority
migration. After editing events, cards, or AI lineups, regenerate and verify the
marked SQL sections:

```sh
pnpm catalog:sql:write
pnpm catalog:sql:check
```

Only the generated blocks for event definitions, curated opponents, and the
106-card catalog are replaced. The surrounding constraints, RLS, and RPC SQL
remain hand-reviewed migration code.

The PWHL has fewer completed seasons than the NHL. The configured three-season window must reflect seasons that have actually finished at review time. Players with fewer available seasons are allowed, but their 60/30/10 weights are renormalized and the report flags the reduced sample.

## Required CSV columns

| Column | Notes |
| --- | --- |
| `player_id` | Stable kebab-case ID; never derive it from a current team |
| `name`, `league`, `season`, `role`, `position` | `league`: `NHL`/`PWHL`; `role`: `skater`/`goalie`; six compact lineup positions |
| `team`, `nationality`, `handedness` | Generic team text; ISO-3 nationality; `left`/`right` |
| `games_played`, `minutes_played` | Minutes are mandatory for goalies |
| `goals`, `assists`, `points`, `shots` | Skater inputs |
| `blocks`, `hits`, `plus_minus`, `game_winning_goals` | Skater defensive, physical, and clutch proxies |
| `save_pct`, `goals_against_average`, `shutouts`, `wins` | Goalie inputs |

The pipeline weights newest/middle/oldest seasons at 60/30/10. It then converts transparent box-score proxies to 70–99 fantasy ratings using peer percentiles within league, role, and compact position. NHL and PWHL are normalized independently; there is no blanket league penalty. Speed and goalie puck handling are explicitly marked as proxies because the public box-score columns do not measure them directly.

## Overrides

Overrides are an optional JSON array. Every entry records the exact generated source value, replacement, and a meaningful reason. A stale `sourceValue`, unknown player, or role-incompatible attribute fails the entire import before output is written.

```json
[
  {
    "playerId": "pwhl-example-player",
    "attribute": "clutch",
    "sourceValue": 85,
    "replacementValue": 88,
    "reason": "Verified source correction: the export omitted two game-winning goals."
  }
]
```

Output is written to a temporary file and renamed only after CSV, identity, override, and full catalog validation succeed. Existing output is preserved unless `--force` is explicit. Even with `--force`, only a JSON review candidate can be written; the manually approved TypeScript catalog remains untouched.

## Validation and balance

`pnpm catalog:validate` checks duplicate IDs, player references, role/schema separation, permanent Base inventory, 18/18 league parity, three players per lineup position per league, starter lineups, neutral placeholder references, and Base-rating parity. It also validates the recurring Event Calendar as structured data: ten exact event IDs, six cards per event, 3 NHL/3 PWHL parity, availability windows, player-derived IDs, and event attribute tradeoffs. The 60 calendar cards are distinct from the ten legacy Rivalry reward-only cards and the two allowed Rivalry Road claim choices.

`pnpm balance -- --paired-seeds 2000 --seed rink-rivals-balance-v2` emits the human-readable MVP balance report. Add `--json` for the complete machine-readable report. The command exits nonzero when the NHL/PWHL gap exceeds five percentage points, AI win rates are not ordered Rookie > Pro > Elite, a tier enters an implausible win-rate band, reward ordering is invalid, catalog prices contain configured extreme outliers, or any reward-authority, period, or idempotency guard is absent.

The report has three evidence blocks:

- Paired, side-swapped Open Ice simulations across the complete Base pool report league win rates, ties, situation results, rating ranges, and cross-league gap.
- Nine AI tier simulations use `server-authority-v1`: the same fixed five situations, slot eligibility, no-reuse rule, Rookie weakest / Pro seeded / Elite strongest opponent policy, and tier-specific variance ranges as the match RPC. The TypeScript seeded PRNG is a behavioral distribution mirror of PostgreSQL `hashtextextended`, not a byte-identical database replay.
- Economy diagnostics report expected credits per match, Base/strong Base/Event/Spotlight price statistics, matches-to-purchase from zero and from 1,000 starter credits, recurring Objective effects, collection-score unlock estimates, and reward-loop/outlier checks. Reward-loop checks fail closed against the actual migration SQL: they replay one settlement 1,000 times and require unique settlement/objective receipts, finite Rivalry rewards, immutable five-round server tickets, one resumable (never silently abandoned) open ticket per account, persisted round transcripts, revoked browser writes, and post-lock UTC period timestamps.

Economy pacing assumes five valid settled matches per day (35 per week), all three daily Objective rewards (275 credits total), the weekly Objective (350 credits), and excludes the two one-time 150-credit Rivalry Road steps from the sustainable recurring rate. Purchases and positive loss rewards only remain safe when the server-authoritative idempotency and settlement constraints are in force.

The checked-in preview catalog uses real player names with generic team text, neutral asset references, and plausible stats-driven fantasy values. It is an unofficial prototype dataset, not a claim of scientific cross-league equivalence, and still requires product, data, and rights review before any public release.
